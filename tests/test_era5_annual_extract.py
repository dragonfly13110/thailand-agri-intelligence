"""Reviewed ERA5 annual extract: aggregation, payload validation, and envelope.

The generator is offline in tests: every provider payload is synthetic and the
centroid registry is parsed from the TypeScript source of truth. The numeric
rules deliberately mirror ``aggregateRealYear`` in
``web/lib/hub/climate-history-data.ts`` so the annual tier can never disagree
with the daily tiers.
"""

import json
import math
import unittest
from datetime import date, timedelta
from pathlib import Path

from tadih.era5_annual_extract import (
    DAILY_VARIABLES,
    SCHEMA,
    aggregate_year,
    build_extract,
    calendar_days,
    expected_dates,
    fetch_era5_daily,
    js_round,
    load_centroids,
    validate_daily_payload,
    validate_extract,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
CENTROID_TS = REPO_ROOT / "web" / "lib" / "hub" / "climate-history-data.ts"


def synthetic_payload(
    year: int,
    *,
    latitude: float = 13.75,
    longitude: float = 100.0,
    precip: list | None = None,
    tmin: list | None = None,
) -> dict:
    dates = expected_dates(f"{year}-01-01", f"{year}-12-31")
    days = len(dates)
    return {
        "latitude": latitude,
        "longitude": longitude,
        "elevation": 5.0,
        "timezone": "Asia/Bangkok",
        "daily_units": {
            "time": "iso8601",
            "temperature_2m_mean": "°C",
            "temperature_2m_max": "°C",
            "temperature_2m_min": "°C",
            "precipitation_sum": "mm",
        },
        "daily": {
            "time": dates,
            "temperature_2m_mean": [27.0 + (index % 3) * 0.1 for index in range(days)],
            "temperature_2m_max": [33.0 + (index % 5) * 0.5 for index in range(days)],
            "temperature_2m_min": tmin if tmin is not None else [22.0] * days,
            "precipitation_sum": precip if precip is not None else [0.0 if index % 15 < 10 else 12.0 for index in range(days)],
        },
    }


class AggregateYearTests(unittest.TestCase):
    def test_aggregates_match_the_daily_tier_rules_and_keep_null_honest(self):
        year = 2024
        dates = expected_dates(f"{year}-01-01", f"{year}-12-31")
        days = len(dates)
        precip = [2.0] * days
        precip[100] = None
        tmin = [22.0] * days
        tmin[200] = None
        payload = synthetic_payload(year, precip=precip, tmin=tmin)
        row = aggregate_year(
            year,
            payload["daily"]["time"],
            payload["daily"]["temperature_2m_mean"],
            payload["daily"]["temperature_2m_max"],
            payload["daily"]["temperature_2m_min"],
            payload["daily"]["precipitation_sum"],
        )
        self.assertEqual(row["calendar_days"], 366)
        self.assertEqual(row["days_with_data"]["precipitation"], days - 1)
        self.assertEqual(row["days_with_data"]["temperature_min"], days - 1)
        self.assertEqual(row["rainfall_total_mm"], js_round(2.0 * (days - 1), 1))
        self.assertFalse(row["complete_year"])
        self.assertEqual(row["hot_days_38c"], sum(1 for value in payload["daily"]["temperature_2m_max"] if value > 38))

    def test_dry_spell_run_is_broken_by_a_null_day_and_counts_both_events(self):
        dates = expected_dates("2023-01-01", "2023-01-11")
        precip = [0.0] * 5 + [None] + [0.0] * 5
        row = aggregate_year(
            2023,
            dates,
            [27.0] * len(dates),
            [33.0] * len(dates),
            [22.0] * len(dates),
            precip,
        )
        self.assertEqual(row["longest_dry_spell_days"], 5)
        self.assertEqual(row["dry_spell_events_5d"], 2)
        self.assertEqual(row["days_with_data"]["precipitation"], 10)
        self.assertFalse(row["complete_year"])

    def test_all_null_year_stays_null_instead_of_zero(self):
        dates = expected_dates("2023-01-01", "2023-01-03")
        row = aggregate_year(2023, dates, [None] * 3, [None] * 3, [None] * 3, [None] * 3)
        self.assertIsNone(row["tmean_c"])
        self.assertIsNone(row["tmax_mean_c"])
        self.assertIsNone(row["tmin_mean_c"])
        self.assertIsNone(row["hot_days_38c"])
        self.assertIsNone(row["rainfall_total_mm"])
        self.assertIsNone(row["longest_dry_spell_days"])
        self.assertIsNone(row["dry_spell_events_5d"])
        self.assertEqual(row["days_with_data"], {
            "temperature_mean": 0,
            "temperature_max": 0,
            "temperature_min": 0,
            "precipitation": 0,
        })
        self.assertFalse(row["complete_year"])


class PayloadValidationTests(unittest.TestCase):
    def test_rejects_wrong_units_missing_arrays_and_calendar_gaps(self):
        good = synthetic_payload(2024)
        with self.assertRaisesRegex(ValueError, "หน่วย"):
            broken = json.loads(json.dumps(good))
            broken["daily_units"]["precipitation_sum"] = "inch"
            validate_daily_payload(broken, 13.8196, 100.0443, "2024-01-01", "2024-12-31")

        with self.assertRaisesRegex(ValueError, "ความยาว"):
            broken = json.loads(json.dumps(good))
            broken["daily"]["temperature_2m_min"] = broken["daily"]["temperature_2m_min"][:-1]
            validate_daily_payload(broken, 13.8196, 100.0443, "2024-01-01", "2024-12-31")

        with self.assertRaisesRegex(ValueError, "ปฏิทิน"):
            broken = json.loads(json.dumps(good))
            broken["daily"]["time"][10] = broken["daily"]["time"][11]
            validate_daily_payload(broken, 13.8196, 100.0443, "2024-01-01", "2024-12-31")

        with self.assertRaisesRegex(ValueError, "timezone"):
            broken = json.loads(json.dumps(good))
            broken["timezone"] = "UTC"
            validate_daily_payload(broken, 13.8196, 100.0443, "2024-01-01", "2024-12-31")

    def test_accepts_nulls_because_missing_values_must_surface_as_incomplete(self):
        payload = synthetic_payload(2024, precip=[None] * len(expected_dates("2024-01-01", "2024-12-31")))
        parsed = validate_daily_payload(payload, 13.8196, 100.0443, "2024-01-01", "2024-12-31")
        self.assertEqual(parsed["provider_grid_latitude"], 13.75)
        self.assertTrue(all(value is None for value in parsed["daily"]["precipitation_sum"]))


class EnvelopeTests(unittest.TestCase):
    def _fetcher(self, requested: list[tuple[float, float]]):
        def fetch(latitude: float, longitude: float) -> dict:
            requested.append((latitude, longitude))
            return {
                "request_url": (
                    "https://archive-api.open-meteo.com/v1/archive"
                    f"?latitude={latitude:.4f}&longitude={longitude:.4f}"
                    "&start_date=2024-01-01&end_date=2024-12-31"
                    f"&daily={','.join(DAILY_VARIABLES)}&timezone=Asia%2FBangkok&models=era5"
                ),
                "retrieved_at": "2026-10-31T08:00:00+00:00",
                "payload": synthetic_payload(
                    2024,
                    latitude=math.floor(latitude * 4) / 4,
                    longitude=math.floor(longitude * 4) / 4,
                ),
            }
        return fetch

    def test_build_extract_emits_a_self_validating_reviewable_envelope(self):
        provinces = [
            {"code": "73", "name_en": "Nakhon Pathom", "latitude": 13.8196, "longitude": 100.0443, "region": "central"},
            {"code": "50", "name_en": "Chiang Mai", "latitude": 18.7953, "longitude": 98.962, "region": "north"},
        ]
        requested: list[tuple[float, float]] = []
        envelope = build_extract(provinces, self._fetcher(requested), years=(2024, 2024))
        self.assertEqual(requested, [(18.7953, 98.962), (13.8196, 100.0443)])
        self.assertEqual(envelope["schema"], SCHEMA)
        self.assertEqual(envelope["licence"], "CC-BY-4.0")
        self.assertEqual(envelope["first_year"], 2024)
        self.assertEqual(envelope["last_year"], 2024)
        self.assertEqual(sorted(envelope["provinces"]), ["50", "73"])
        record = envelope["provinces"]["73"]
        self.assertEqual(record["requested_latitude"], 13.8196)
        self.assertEqual(record["provider_grid_latitude"], 13.75)
        self.assertEqual(len(record["daily_sha256"]), 64)
        self.assertEqual(record["daily_rows"], 366)
        self.assertEqual(record["first_day"], "2024-01-01")
        self.assertEqual(record["last_day"], "2024-12-31")
        self.assertEqual([row["year"] for row in record["years"]], [2024])
        self.assertTrue(record["years"][0]["complete_year"])
        validate_extract(envelope)

    def test_validate_extract_rejects_tampered_complete_year_and_duplicate_years(self):
        provinces = [{"code": "73", "name_en": "Nakhon Pathom", "latitude": 13.8196, "longitude": 100.0443, "region": "central"}]
        envelope = build_extract(provinces, self._fetcher([]), years=(2024, 2024))
        broken = json.loads(json.dumps(envelope))
        broken["provinces"]["73"]["years"][0]["days_with_data"]["precipitation"] = 365
        with self.assertRaisesRegex(ValueError, "complete_year"):
            validate_extract(broken)

        broken = json.loads(json.dumps(envelope))
        broken["provinces"]["73"]["years"].append(broken["provinces"]["73"]["years"][0])
        with self.assertRaisesRegex(ValueError, "ซ้ำ"):
            validate_extract(broken)

        broken = json.loads(json.dumps(envelope))
        broken["provinces"]["73"]["years"][0]["tmin_mean_c"] = 40.0
        with self.assertRaisesRegex(ValueError, "ต่ำสุด"):
            validate_extract(broken)

    def test_fetch_builds_the_ten_year_four_variable_request(self):
        captured = {}

        class Response:
            def __init__(self, body: bytes):
                self._body = body

            def read(self, _limit: int) -> bytes:
                return self._body

            def __enter__(self):
                return self

            def __exit__(self, *exc_info):
                return False

        ten_year = synthetic_payload(2016)
        ten_year["daily"]["time"] = []
        for variable in DAILY_VARIABLES:
            ten_year["daily"][variable] = []
        for year in range(2016, 2026):
            payload = synthetic_payload(year)
            ten_year["daily"]["time"] += payload["daily"]["time"]
            for variable in DAILY_VARIABLES:
                ten_year["daily"][variable] += payload["daily"][variable]

        def opener(request, timeout):
            captured["url"] = request.full_url
            return Response(json.dumps(ten_year).encode("utf-8"))

        result = fetch_era5_daily(13.8196, 100.0443, "2016-01-01", "2025-12-31", opener=opener)
        self.assertIn("start_date=2016-01-01", captured["url"])
        self.assertIn("end_date=2025-12-31", captured["url"])
        self.assertIn("models=era5", captured["url"])
        self.assertIn("timezone=Asia%2FBangkok", captured["url"])
        for variable in DAILY_VARIABLES:
            self.assertIn(variable, captured["url"])
        self.assertEqual(result["provider_grid_latitude"], 13.75)
        self.assertEqual(len(result["daily_sha256"]), 64)
        self.assertTrue(result["request_url"].startswith("https://archive-api.open-meteo.com/v1/archive"))


class CentroidRegistryTests(unittest.TestCase):
    def test_loads_exactly_the_seventy_seven_typescript_centroids(self):
        centroids = load_centroids(CENTROID_TS)
        self.assertEqual(len(centroids), 77)
        by_code = {row["code"]: row for row in centroids}
        self.assertEqual(by_code["73"]["latitude"], 13.8196)
        self.assertEqual(by_code["73"]["longitude"], 100.0443)
        self.assertEqual(by_code["73"]["name_en"], "Nakhon Pathom")
        self.assertEqual(by_code["73"]["region"], "central")
        self.assertEqual(by_code["10"]["name_en"], "Bangkok")
        self.assertEqual(calendar_days(2024), 366)
        self.assertEqual(calendar_days(2023), 365)
        self.assertEqual(expected_dates("2023-12-30", "2024-01-02"), [
            "2023-12-30", "2023-12-31", "2024-01-01", "2024-01-02",
        ])
        with self.assertRaises(ValueError):
            expected_dates("2024-01-02", "2024-01-01")
        self.assertEqual(js_round(27.125, 2), 27.13)
        self.assertEqual(js_round(-1.5, 0), -1)


if __name__ == "__main__":
    unittest.main()
