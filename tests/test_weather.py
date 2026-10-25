"""Unit tests for src/tadih/weather.py: Meteostat staging plus the TMD
7-day agricultural forecast processor (normalization, cumulative rainfall
index, farm advisories). No test in this file performs a network call."""

from datetime import date, timedelta
import json
import math
from pathlib import Path
import tempfile
import unittest

from tadih.weather import (
    ADVISORY_SEVERITY_ORDER,
    CONDITION_CODES,
    FORECAST_MAX_DAYS,
    FORECAST_UNITS,
    WIND_DIRECTIONS_TH,
    agricultural_weather_advisories,
    condition_label,
    cumulative_rainfall_index,
    fetch_daily_weather_observations,
    fetch_weather_stations,
    normalize_forecast_day,
    parse_tmd_agri_forecast,
    wind_direction_label,
    wind_speed_kmh_to_ms,
)

ISSUED = "2026-10-25"


def raw_day(offset=0, **fields):
    row = {"date": (date.fromisoformat(ISSUED) + timedelta(days=offset)).isoformat()}
    row.update(fields)
    return row


def day(offset=0, **fields):
    """One normalized forecast day; defaults describe an ordinary wet-season day."""
    defaults = {"tmax_c": 34.0, "tmin_c": 24.0, "rain_chance_pct": 50, "rainfall_mm": 5.0,
                "humidity_min_pct": 60.0, "humidity_max_pct": 75.0, "wind_direction_deg": 90.0,
                "wind_speed_ms": 4.0, "condition_code": "cloudy"}
    defaults.update(fields)
    return normalize_forecast_day(raw_day(offset, **defaults),
                                  forecast_date=(date.fromisoformat(ISSUED) + timedelta(days=offset)).isoformat(),
                                  region="central", province_code="73")


def seven_days(**fields):
    return [day(offset, **fields) for offset in range(FORECAST_MAX_DAYS)]


def base_payload(**day_fields):
    return {"days": [raw_day(offset, **day_fields) for offset in range(FORECAST_MAX_DAYS)]}


class StationSnapshotTests(unittest.TestCase):
    def test_station_snapshot_writes_reviewed_metadata_without_network(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "stations.json"
            payload = fetch_weather_stations(output_path=target)
            self.assertTrue(target.exists())
            stored = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(stored["records"], payload["records"])
            meta = stored["metadata"]
            self.assertEqual(meta["total_stations"], len(payload["records"]))
            self.assertEqual(meta["contract_version"], 2)
            self.assertEqual(meta["license_status"], "pending")
            self.assertFalse(meta["live_fetch"])
            self.assertEqual(len(payload["records"]), 12)
            for row in payload["records"]:
                self.assertRegex(row["province_code"], r"^\d{2}$")
                self.assertIsInstance(row["lat"], float)
                self.assertIsInstance(row["lon"], float)

    def test_observation_fetch_fails_closed_before_any_request(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "daily.json"
            cases = [
                dict(api_key="   "),
                dict(api_key="dummy-key", start_date="2026-10-23", end_date="2026-10-01"),
                dict(api_key="dummy-key", start_date="2026-1-01", end_date="2026-10-23"),
                dict(api_key="dummy-key", station_ids=["abc"]),
                dict(api_key="dummy-key", station_ids=["484555"]),
                dict(api_key="dummy-key", station_ids=[48455]),
            ]
            for kwargs in cases:
                with self.assertRaises(ValueError, msg=repr(kwargs)):
                    fetch_daily_weather_observations(output_path=target, **kwargs)
            self.assertFalse(target.exists())


class WindAndConditionTests(unittest.TestCase):
    def test_wind_speed_conversion_units_and_bounds(self):
        self.assertIsNone(wind_speed_kmh_to_ms(None))
        self.assertEqual(wind_speed_kmh_to_ms(36), 10.0)
        self.assertEqual(wind_speed_kmh_to_ms(0), 0.0)
        for bad in (-1, 301, "10", True, math.nan, math.inf):
            with self.assertRaises(ValueError, msg=repr(bad)):
                wind_speed_kmh_to_ms(bad)

    def test_wind_direction_uses_eight_point_compass(self):
        expected = {0: "เหนือ", 45: "ตะวันออกเฉียงเหนือ", 90: "ตะวันออก", 135: "ตะวันออกเฉียงใต้",
                    180: "ใต้", 225: "ตะวันตกเฉียงใต้", 270: "ตะวันตก", 315: "ตะวันตกเฉียงเหนือ",
                    360: "เหนือ"}
        for degrees, label in expected.items():
            self.assertEqual(wind_direction_label(degrees), label)
        self.assertEqual(wind_direction_label(359.9), "เหนือ")
        self.assertIsNone(wind_direction_label(None))
        self.assertEqual(len(WIND_DIRECTIONS_TH), 8)
        for bad in (-1, 361, "north", True, math.inf):
            with self.assertRaises(ValueError, msg=repr(bad)):
                wind_direction_label(bad)

    def test_condition_labels_cover_the_published_codes(self):
        self.assertEqual(condition_label("sunny"), "แดดจัด")
        self.assertIsNone(condition_label(None))
        for code in CONDITION_CODES:
            self.assertIsInstance(condition_label(code), str)
        with self.assertRaises(ValueError):
            condition_label("rainy")
        with self.assertRaises(ValueError):
            condition_label(7)


class ForecastDayNormalizationTests(unittest.TestCase):
    def test_full_day_normalizes_units_and_labels(self):
        raw = dict(date=ISSUED, tmax_c=34.5, tmin_c=24, rain_chance_pct=70, rainfall_mm=12.5,
                   humidity_min_pct=65, humidity_max_pct=92, wind_direction_deg=135,
                   wind_speed_kmh=18, condition_code="shower")
        record = normalize_forecast_day(raw, forecast_date=ISSUED, region="north", province_code="50")
        self.assertEqual(record["forecast_date"], ISSUED)
        self.assertEqual(record["region"], "north")
        self.assertEqual(record["province_code"], "50")
        self.assertEqual(record["tmax_c"], 34.5)
        self.assertEqual(record["tmin_c"], 24.0)
        self.assertEqual(record["rain_chance_pct"], 70.0)
        self.assertEqual(record["rainfall_mm"], 12.5)
        self.assertEqual(record["wind_speed_ms"], 5.0)
        self.assertEqual(record["wind_speed_source_unit"], "km/h")
        self.assertEqual(record["wind_direction_label"], "ตะวันออกเฉียงใต้")
        self.assertEqual(record["condition_code"], "shower")
        self.assertEqual(record["condition_label_th"], "ฝนตกเป็นแห่ง")

    def test_missing_fields_stay_none_and_never_become_zero(self):
        record = normalize_forecast_day({"date": ISSUED}, forecast_date=ISSUED, region="south")
        for key in ("tmax_c", "tmin_c", "rain_chance_pct", "rainfall_mm", "humidity_min_pct",
                    "humidity_max_pct", "wind_direction_deg", "wind_direction_label",
                    "wind_speed_ms", "wind_speed_source_unit", "condition_code", "condition_label_th"):
            self.assertIsNone(record[key], key)
        self.assertEqual(record["region"], "south")
        self.assertIsNone(record["province_code"])
        # Metre-per-second input wins over km/h when both arrive.
        both = normalize_forecast_day({"date": ISSUED, "wind_speed_ms": 3.6, "wind_speed_kmh": 360},
                                      forecast_date=ISSUED, region="central")
        self.assertEqual(both["wind_speed_ms"], 3.6)
        self.assertEqual(both["wind_speed_source_unit"], "m/s")

    def test_invalid_days_fail_closed(self):
        cases = [
            dict(raw="day", forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED}, forecast_date="25-10-2026", region="central"),
            dict(raw={"date": ISSUED}, forecast_date=ISSUED, region="middle"),
            dict(raw={"date": ISSUED}, forecast_date=ISSUED, region="central", province_code="5"),
            dict(raw={"date": ISSUED}, forecast_date=ISSUED, region="central", province_code=50),
            dict(raw={"date": "2026-10-26"}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "condition_code": "rainy"}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "condition_code": 7}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "tmax_c": 30.0, "tmin_c": 35.0}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "humidity_min_pct": 90.0, "humidity_max_pct": 50.0},
                 forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "rain_chance_pct": 101}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "rain_chance_pct": -1}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "rainfall_mm": -5}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "tmax_c": "34"}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "tmax_c": True}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "tmin_c": math.nan}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "wind_direction_deg": 400}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "wind_speed_ms": -1}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED, "humidity_max_pct": 101}, forecast_date=ISSUED, region="central"),
            dict(raw={"date": ISSUED}, forecast_date=None, region="central"),
        ]
        for kwargs in cases:
            with self.assertRaises(ValueError, msg=repr(kwargs)):
                normalize_forecast_day(**kwargs)

    def test_out_of_period_and_duplicate_days_rejected_by_position(self):
        skipped = [raw_day(0), raw_day(2)]
        with self.assertRaises(ValueError):
            parse_tmd_agri_forecast({"days": skipped}, issued_at=ISSUED, region="central")
        duplicate = [raw_day(0), raw_day(0)]
        with self.assertRaises(ValueError):
            parse_tmd_agri_forecast({"days": duplicate}, issued_at=ISSUED, region="central")
        before = [raw_day(-1), raw_day(0)]
        with self.assertRaises(ValueError):
            parse_tmd_agri_forecast({"days": before}, issued_at=ISSUED, region="central")


class ForecastEnvelopeTests(unittest.TestCase):
    def test_envelope_reports_lineage_units_and_pending_license(self):
        envelope = parse_tmd_agri_forecast(base_payload(tmax_c=35.0), issued_at=ISSUED,
                                           region="central", province_code="73")
        meta = envelope["metadata"]
        self.assertEqual(meta["contract_version"], 1)
        self.assertEqual(meta["product"], "tmd_7day_agricultural_forecast")
        self.assertEqual(meta["issued_at"], ISSUED)
        self.assertEqual(meta["forecast_days"], FORECAST_MAX_DAYS)
        self.assertEqual(meta["region"], "central")
        self.assertEqual(meta["province_code"], "73")
        self.assertEqual(meta["license_status"], "pending")
        self.assertEqual(meta["timezone"], "Asia/Bangkok")
        self.assertEqual(meta["units"], FORECAST_UNITS)
        self.assertTrue(meta["source_url"].startswith("https://"))
        self.assertEqual([row["forecast_date"] for row in envelope["records"]],
                         [(date.fromisoformat(ISSUED) + timedelta(days=n)).isoformat()
                          for n in range(FORECAST_MAX_DAYS)])
        json.dumps(envelope, ensure_ascii=False, allow_nan=False)

    def test_single_day_forecast_is_allowed(self):
        envelope = parse_tmd_agri_forecast({"days": [raw_day(0)]}, issued_at=ISSUED, region="north")
        self.assertEqual(envelope["metadata"]["forecast_days"], 1)
        self.assertIsNone(envelope["records"][0]["tmax_c"])

    def test_malformed_payloads_fail_closed(self):
        cases = [
            dict(payload=[], issued_at=ISSUED, region="central"),
            dict(payload={"days": {"0": raw_day(0)}}, issued_at=ISSUED, region="central"),
            dict(payload={"days": []}, issued_at=ISSUED, region="central"),
            dict(payload={"days": [raw_day(n) for n in range(8)]}, issued_at=ISSUED, region="central"),
            dict(payload=base_payload(), issued_at="2026-10-25T00:00", region="central"),
            dict(payload=base_payload(), issued_at="2026-13-25", region="central"),
            dict(payload=base_payload(), issued_at=ISSUED, region="bangkok"),
            dict(payload=base_payload(tmax_c=34.0, tmin_c=99.0), issued_at=ISSUED, region="central"),
        ]
        for kwargs in cases:
            with self.assertRaises(ValueError, msg=repr(kwargs)):
                parse_tmd_agri_forecast(**kwargs)


class CumulativeRainfallIndexTests(unittest.TestCase):
    def test_normal_week_is_classified_as_normal(self):
        index = cumulative_rainfall_index(seven_days(rainfall_mm=10.0), normal_rainfall_mm=10.0)
        self.assertEqual(index["window_days"], 7)
        self.assertEqual(index["days_with_data"], 7)
        self.assertEqual(index["missing_days"], 0)
        self.assertEqual(index["forecast_total_mm"], 70.0)
        self.assertEqual(index["normal_total_mm"], 70.0)
        self.assertEqual(index["anomaly_mm"], 0.0)
        self.assertEqual(index["anomaly_percent"], 0.0)
        self.assertEqual(index["status"], "normal")
        self.assertEqual(index["completeness"], "complete")
        self.assertEqual(index["dry_days"], 0)
        self.assertEqual(index["heavy_rain_days"], 0)
        self.assertEqual(index["calculation_version"], "cumulative-rainfall-index-v1")

    def test_dry_and_wet_weeks_cross_the_thresholds(self):
        dry = cumulative_rainfall_index(seven_days(rainfall_mm=0.4), normal_rainfall_mm=[10.0] * 7)
        self.assertEqual(dry["status"], "below_normal")
        self.assertLess(dry["anomaly_percent"], -25.0)
        self.assertEqual(dry["dry_days"], 7)

        wet = cumulative_rainfall_index(seven_days(rainfall_mm=30.0), normal_rainfall_mm=[5.0] * 7)
        self.assertEqual(wet["status"], "above_normal")
        self.assertGreater(wet["anomaly_percent"], 25.0)
        self.assertEqual(wet["heavy_rain_days"], 0)

        boundary = cumulative_rainfall_index(seven_days(rainfall_mm=7.5), normal_rainfall_mm=10.0)
        self.assertAlmostEqual(boundary["anomaly_percent"], -25.0, places=1)
        self.assertEqual(boundary["status"], "below_normal")

        heavy = cumulative_rainfall_index(seven_days(rainfall_mm=60.0), normal_rainfall_mm=10.0)
        self.assertEqual(heavy["heavy_rain_days"], 7)

    def test_missing_days_never_count_as_zero_rainfall(self):
        records = seven_days(rainfall_mm=10.0)
        records[3] = day(3, rainfall_mm=None)
        index = cumulative_rainfall_index(records, normal_rainfall_mm=10.0)
        self.assertEqual(index["missing_days"], 1)
        self.assertEqual(index["days_with_data"], 6)
        self.assertEqual(index["forecast_total_mm"], 60.0)
        self.assertEqual(index["completeness"], "partial")
        self.assertEqual(index["dry_days"], 0)

        unknown = cumulative_rainfall_index([day(n, rainfall_mm=None) for n in range(7)],
                                            normal_rainfall_mm=10.0)
        self.assertIsNone(unknown["forecast_total_mm"])
        self.assertIsNone(unknown["anomaly_mm"])
        self.assertIsNone(unknown["anomaly_percent"])
        self.assertEqual(unknown["status"], "unknown")
        self.assertEqual(unknown["days_with_data"], 0)
        self.assertEqual(unknown["completeness"], "partial")

    def test_invalid_inputs_fail_closed(self):
        cases = [
            dict(records=[], normal_rainfall_mm=10.0),
            dict(records=[day(n) for n in range(8)], normal_rainfall_mm=10.0),
            dict(records=seven_days(), normal_rainfall_mm=0.0),
            dict(records=seven_days(), normal_rainfall_mm=-1.0),
            dict(records=seven_days(), normal_rainfall_mm=[10.0] * 6),
            dict(records=seven_days(), normal_rainfall_mm="10"),
            dict(records=seven_days(), normal_rainfall_mm=[10.0, None] + [10.0] * 5),
            dict(records=[{"forecast_date": ISSUED}], normal_rainfall_mm=10.0),
            dict(records=[{"rainfall_mm": 1.0}], normal_rainfall_mm=10.0),
            dict(records=seven_days(), normal_rainfall_mm=True),
        ]
        for kwargs in cases:
            with self.assertRaises(ValueError, msg=repr(kwargs)):
                cumulative_rainfall_index(**kwargs)


class AdvisoryTests(unittest.TestCase):
    def codes(self, records, cumulative=None):
        return [row["code"] for row in agricultural_weather_advisories(records, cumulative=cumulative)]

    def test_benign_week_produces_no_advisory(self):
        self.assertEqual(self.codes(seven_days()), [])

    def test_heavy_rain_single_day_and_streak_both_warn(self):
        single = self.codes(seven_days(rainfall_mm=5.0, rain_chance_pct=50), cumulative=None)
        self.assertEqual(single, [])
        burst = self.codes([day(0, rainfall_mm=65.0)] + [day(n, rainfall_mm=35.0) for n in range(1, 7)])
        self.assertIn("HEAVY_RAIN", burst)
        streak = self.codes(seven_days(rainfall_mm=35.0, rain_chance_pct=50))
        self.assertEqual(streak, ["HEAVY_RAIN"])

        advisory = next(row for row in agricultural_weather_advisories(seven_days(rainfall_mm=65.0))
                        if row["code"] == "HEAVY_RAIN")
        self.assertEqual(advisory["severity"], "high")
        self.assertIn("งดใส่ปุ๋ยเคมี", " ".join(advisory["actions"]) + advisory["message_th"])
        self.assertTrue(advisory["message_th"])
        self.assertTrue(all(isinstance(action, str) and action for action in advisory["actions"]))

    def test_dry_spell_uses_streak_or_index_status(self):
        records = [day(n, rainfall_mm=0.0, rain_chance_pct=20) for n in range(7)]
        self.assertEqual(self.codes(records), ["DRY_SPELL"])
        self.assertEqual(ADVISORY_SEVERITY_ORDER["medium"], 1)

        # Only three dry days, but the weekly index is far below normal: still a dry-spell watch.
        mixed = [day(n, rainfall_mm=0.0 if n < 3 else 5.0, rain_chance_pct=30) for n in range(7)]
        index = cumulative_rainfall_index(mixed, normal_rainfall_mm=10.0)
        self.assertEqual(index["status"], "below_normal")
        self.assertEqual(index["dry_days"], 3)
        self.assertEqual(self.codes(mixed, cumulative=index), ["DRY_SPELL"])
        # The same window without an index stays silent because the streak is short.
        self.assertEqual(self.codes(mixed, cumulative=None), [])

    def test_heat_wind_humidity_and_prolonged_rain_warn(self):
        heat = self.codes([day(0, tmax_c=41.0)] + [day(n, tmax_c=36.0) for n in range(1, 7)])
        self.assertEqual(heat, ["HEAT"])
        wind = self.codes(seven_days(wind_speed_ms=12.0))
        self.assertEqual(wind, ["STRONG_WIND"])
        humid = self.codes(seven_days(humidity_max_pct=90.0))
        self.assertEqual(humid, ["HIGH_HUMIDITY"])
        wet = self.codes(seven_days(rain_chance_pct=70))
        self.assertEqual(wet, ["PROLONGED_RAIN"])

    def test_advisories_sort_by_severity_then_code(self):
        records = seven_days(rainfall_mm=70.0, rain_chance_pct=80, wind_speed_ms=12.0)
        rows = agricultural_weather_advisories(records)
        self.assertEqual([row["code"] for row in rows], ["HEAVY_RAIN", "STRONG_WIND", "PROLONGED_RAIN"])
        self.assertEqual([row["severity"] for row in rows], ["high", "medium", "low"])

        mediums = agricultural_weather_advisories(seven_days(humidity_max_pct=90.0, wind_speed_ms=11.0))
        self.assertEqual([row["code"] for row in mediums], ["HIGH_HUMIDITY", "STRONG_WIND"])
        json.dumps(rows, ensure_ascii=False, allow_nan=False)

    def test_invalid_advisory_inputs_fail_closed(self):
        for bad in ([], [day(n) for n in range(8)], "week", [{"rainfall_mm": 5.0}], 7):
            with self.assertRaises(ValueError, msg=repr(bad)):
                agricultural_weather_advisories(bad)
        with self.assertRaises(ValueError):
            agricultural_weather_advisories(seven_days(), cumulative=42)


if __name__ == "__main__":
    unittest.main()
