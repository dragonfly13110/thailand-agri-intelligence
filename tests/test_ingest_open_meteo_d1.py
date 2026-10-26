"""Offline tests for the Open-Meteo ERA5 -> D1 adapter (lane R1-E).

No network access: the ERA5 client is replaced by a fake that returns canned
archive payloads, and the D1 client is an in-memory SQLite mock that loads the
real Hub schema (``db/cloudflare/0001_hub.sql`` + ``0002_observation_extensions.sql``).

Contract under test:
* grid-point grain (a province centroid sample is NOT a province value),
* ``observed_at`` stored as the UTC instant, source ICT day kept in dimensions,
* missing values stay null with ``quality_flag = "missing"``,
* the provider forecast path never produces observations,
* the CC BY 4.0 attribution string travels with the published payload,
* the units documentation URL is cited in every row's dimensions,
* a re-run reuses the deterministic run id and never duplicates rows,
* the shared rate-limit/backoff path of :mod:`tadih.open_meteo` is honoured,
* ``tadih ingest --adapter open_meteo`` forwards ``--write``/``--date`` and
  ``--dry-run`` (default) writes nothing,
* a pending resource is refused with ``RESOURCE_NOT_APPROVED``.
"""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
from email.message import Message
import io
import json
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest import mock
from urllib.error import HTTPError

from tadih.ingest_open_meteo_d1 import (
    MEASURES,
    RESOURCE_KEY,
    REQUIRED_ATTRIBUTION,
    UNITS_DOCS_URL,
    ForecastRefused,
    build_dimensions_factory,
    build_observation_rows,
    derive_run_id,
    location_id_for,
    main,
    run,
)
from tadih.open_meteo import OpenMeteoClient

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "config/resource_licenses.json"
RESOURCE_ID = "https://archive-api.open-meteo.com/v1/archive"
START_DATE = "2026-10-14"
END_DATE = "2026-10-20"
DAYS = 7


# ---------------------------------------------------------------------------
# Doubles
# ---------------------------------------------------------------------------

class SqliteD1Mock:
    """In-memory stand-in for D1Client that loads the real Hub schema."""

    instances: list["SqliteD1Mock"] = []

    def __init__(self) -> None:
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        script = (ROOT / "db/cloudflare/0001_hub.sql").read_text(encoding="utf-8")
        script += (ROOT / "db/cloudflare/0002_observation_extensions.sql").read_text(encoding="utf-8")
        self.db.executescript(script)
        self.queries = 0
        self.observation_writes = 0
        SqliteD1Mock.instances.append(self)

    @classmethod
    def close_all(cls) -> None:
        while cls.instances:
            cls.instances.pop().db.close()

    def execute(self, sql, params=None):
        self.queries += 1
        if sql.lstrip().startswith("INSERT INTO observations"):
            self.observation_writes += 1
        cursor = self.db.execute(sql, list(params or []))
        rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        self.db.commit()
        return {"results": rows}

    def rows(self, sql, params=None):
        return [dict(row) for row in self.db.execute(sql, list(params or [])).fetchall()]

    def one(self, sql, params=None):
        found = self.rows(sql, params)
        return found[0] if found else None


def archive_payload(days: int = DAYS, *, missing_index: int | None = None) -> dict:
    """A realistic ERA5 archive payload as returned by Open-Meteo."""
    times = [(datetime(2026, 10, 14) + timedelta(days=index)).date().isoformat()
             for index in range(days)]
    means = [27.0 + index * 0.4 for index in range(days)]
    maxima = [value + 3.2 for value in means]
    minima = [value - 4.1 for value in means]
    rain = [12.5, 0.0, 4.25, 0.4, 88.0, 1.5, 0.0]
    wind = [3.4, 2.1, 5.6, 1.0, 2.2, 4.4, 2.2]
    humidity = [88.0, 79.0, 84.0, 91.0, 72.0, 80.0, 86.0]
    if missing_index is not None:
        for series in (means, maxima, minima, rain, wind, humidity):
            series[missing_index] = None
    return {
        "latitude": 13.75,
        "longitude": 100.0,
        "elevation": 9.0,
        "timezone": "Asia/Bangkok",
        "daily_units": {
            "time": "iso8601",
            "precipitation_sum": "mm",
            "temperature_2m_max": "°C",
            "temperature_2m_min": "°C",
            "temperature_2m_mean": "°C",
            "wind_speed_10m_max": "m/s",
            "relative_humidity_2m_mean": "%",
        },
        "daily": {
            "time": times,
            "precipitation_sum": rain,
            "temperature_2m_max": maxima,
            "temperature_2m_min": minima,
            "temperature_2m_mean": means,
            "wind_speed_10m_max": wind,
            "relative_humidity_2m_mean": humidity,
        },
    }


def make_envelope(province_code: str = "73", *, missing_index: int | None = None,
                  retrieved_at: str = "2026-10-26T10:00:00+00:00") -> dict:
    """A normalised ERA5 envelope identical to the shared client's output."""
    payload = archive_payload(missing_index=missing_index)
    return {
        "source_id": "open_meteo",
        "request_url": (
            "https://archive-api.open-meteo.com/v1/archive?latitude=13.8196&longitude=100.0443"
            "&timezone=Asia%2FBangkok&wind_speed_unit=ms&daily=temperature_2m_mean"
            "&start_date=2026-10-14&end_date=2026-10-20&models=era5"
        ),
        "retrieved_at": retrieved_at,
        "release_at": None,
        "issue_at": None,
        "data_kind": "estimated",
        "spatial_support": "grid_point",
        "requested_location": {"latitude": 13.8196, "longitude": 100.0443},
        "provider_grid_location": {"latitude": 13.75, "longitude": 100.0, "elevation": 9.0},
        "provider_model": "era5",
        "license_status": "pending",
        "licence": "CC-BY-4.0",
        "attribution": REQUIRED_ATTRIBUTION,
        "attribution_url": "https://open-meteo.com/",
        "content_signature": "a" * 64,
        "payload": payload,
        "province_code": province_code,
    }


class FakeWeatherClient:
    """Offline replacement for :class:`tadih.open_meteo.OpenMeteoClient`."""

    def __init__(self, *, missing_index: int | None = None,
                 varying_retrieved_at: bool = False) -> None:
        self.calls: list[dict] = []
        self.missing_index = missing_index
        self.varying_retrieved_at = varying_retrieved_at

    def fetch_weather(self, latitude, longitude, *, forecast=False, start_date=None,
                      end_date=None, **kwargs):
        self.calls.append({
            "latitude": latitude,
            "longitude": longitude,
            "forecast": forecast,
            "start_date": start_date,
            "end_date": end_date,
        })
        if forecast:
            raise AssertionError("the adapter must never request the forecast endpoint")
        province = "73" if abs(latitude - 13.8196) < 1e-9 else "74"
        retrieved_at = (f"2026-10-26T{9 + len(self.calls):02d}:00:00+00:00"
                        if self.varying_retrieved_at else "2026-10-26T10:00:00+00:00")
        return make_envelope(province, missing_index=self.missing_index,
                             retrieved_at=retrieved_at)


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._body = json.dumps(payload).encode("utf-8")

    def read(self, size: int = -1) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class GrainAndContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.envelope = make_envelope("73")
        self.rows, self.extra = build_observation_rows(
            self.envelope, "73", license_status="approved_public")

    def tearDown(self) -> None:
        SqliteD1Mock.close_all()

    def test_grid_point_grain_never_claims_a_province_value(self):
        self.assertTrue(self.rows)
        for row in self.rows:
            self.assertIsNone(row["area_code"], "a centroid sample must not claim a province")
            self.assertEqual(row["spatial_support"], "grid_point")
            self.assertEqual(row["location_id"], "open-meteo:era5:73")
            self.assertEqual(row["data_kind"], "estimated")
            self.assertIn(row["license_status"], {"approved_public"})
        self.assertEqual(self.extra["provinceCode"], "73")
        self.assertEqual(self.extra["centroidSource"], "THAILAND_PROVINCE_CENTROIDS")

    def test_measure_ids_and_units_are_the_agreed_ones(self):
        measures = {row["measure"] for row in self.rows}
        self.assertEqual(measures, {
            "t2m_mean_c", "t2m_max_c", "t2m_min_c",
            "precip_mm", "wind_speed_ms", "rh2m_pct",
        })
        units = {row["measure"]: row["unit"] for row in self.rows}
        self.assertEqual(units["t2m_mean_c"], "degC")
        self.assertEqual(units["precip_mm"], "mm")
        self.assertEqual(units["wind_speed_ms"], "m/s")
        self.assertEqual(units["rh2m_pct"], "%")

    def test_missing_value_stays_null_with_the_missing_quality_flag(self):
        rows, _ = build_observation_rows(
            make_envelope("73", missing_index=3), "73", license_status="approved_public")
        missing = [row for row in rows if row["measure"] == "precip_mm"
                   and row["observed_at"] == "2026-10-16T17:00:00Z"]
        self.assertEqual(len(missing), 1)
        self.assertIsNone(missing[0]["value"], "a missing value must stay null, never 0")
        self.assertEqual(missing[0]["quality_flag"], "missing")
        good = [row for row in rows if row["quality_flag"] == "good"]
        self.assertTrue(good)
        for row in good:
            self.assertIsNotNone(row["value"])

    def test_observed_at_is_utc_and_keeps_the_source_ict_day(self):
        observed = {row["observed_at"] for row in self.rows}
        # Bangkok local day 2026-10-14T00:00+07:00 = 2026-10-13T17:00:00Z.
        self.assertIn("2026-10-13T17:00:00Z", observed)
        for row in self.rows:
            self.assertTrue(row["observed_at"].endswith("Z"),
                            "contract §3.1 requires observed_at in UTC")
        dimensions = build_dimensions_factory(
            {"open-meteo:era5:73": self.extra}, REQUIRED_ATTRIBUTION)(self.rows[0])
        self.assertEqual(dimensions["observedAtSourceIct"], "2026-10-14T00:00:00+07:00")
        self.assertEqual(dimensions["observationDateIct"], "2026-10-14")

    def test_every_row_passes_the_canonical_contract(self):
        from tadih.quality import validate_observation
        for row in self.rows:
            validate_observation(dict(row))

    def test_provider_wind_speed_in_km_h_is_normalised_to_m_per_s(self):
        envelope = make_envelope("73")
        daily = envelope["payload"]["daily"]
        daily["wind_speed_10m_max"] = [v * 3.6 for v in daily["wind_speed_10m_max"]]
        envelope["payload"]["daily_units"]["wind_speed_10m_max"] = "km/h"
        rows, _ = build_observation_rows(envelope, "73", license_status="approved_public")
        wind_rows = [row for row in rows if row["measure"] == "wind_speed_ms"]
        self.assertTrue(wind_rows)
        self.assertEqual({row["unit"] for row in wind_rows}, {"m/s"})
        # The fixture's first day is 3.4 m/s; a km/h payload must convert back.
        self.assertAlmostEqual(
            wind_rows[0]["value"], 3.4, places=2,
            msg=f"km/h -> m/s conversion failed: {wind_rows[0]['value']}")


class AdapterRunTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = SqliteD1Mock()
        self.weather = FakeWeatherClient()

    def tearDown(self) -> None:
        SqliteD1Mock.close_all()

    # -- dry run ------------------------------------------------------------
    def test_dry_run_writes_nothing_to_d1(self):
        summary = run(["--dry-run", "--province", "73,74",
                       "--start-date", START_DATE, "--end-date", END_DATE],
                      client=self.client, weather_client=self.weather)
        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["rows"], 2 * DAYS * len(MEASURES))
        self.assertEqual(summary["upstreamRequests"], 2)
        self.assertEqual(self.client.queries, 0, "a dry run must not touch D1")
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 0)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM sync_runs")["total"], 0)

    def test_dry_run_is_the_default_mode(self):
        summary = run(["--province", "73", "--start-date", START_DATE,
                       "--end-date", END_DATE], client=self.client, weather_client=self.weather)
        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])

    def test_main_reports_the_dry_run_summary(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = main(["--dry-run", "--province", "73",
                         "--start-date", START_DATE, "--end-date", END_DATE],
                        client=self.client, weather_client=self.weather)
        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["rows"], DAYS * len(MEASURES))
        self.assertEqual(payload["attribution"], REQUIRED_ATTRIBUTION)
        self.assertEqual(payload["upstreamRequests"], 1)
        self.assertEqual(self.client.queries, 0)

    # -- write path ---------------------------------------------------------
    def test_write_publishes_a_numeric_run_with_grid_point_rows(self):
        summary = run(["--write", "--province", "73",
                       "--start-date", START_DATE, "--end-date", END_DATE],
                      client=self.client, weather_client=self.weather)
        self.assertTrue(summary["written"])
        published = summary["published"]
        self.assertEqual(published["status"], "succeeded")
        self.assertEqual(published["records_read"], DAYS * len(MEASURES))
        self.assertEqual(published["records_written"], DAYS * len(MEASURES))
        self.assertTrue(published["active_run_switched"])

        run_row = self.client.one("SELECT * FROM sync_runs WHERE run_id=?",
                                  [published["run_id"]])
        self.assertEqual(run_row["kind"], "numeric")
        self.assertEqual(run_row["status"], "succeeded")
        self.assertEqual(run_row["records_read"], DAYS * len(MEASURES))
        self.assertEqual(run_row["records_written"], DAYS * len(MEASURES))
        self.assertEqual(run_row["resource_id"], RESOURCE_ID)

        stored = self.client.rows(
            "SELECT province_code, location_kind, location_id, unit, value, quality_flag, "
            "data_kind, dimensions FROM observations WHERE run_id=?", [published["run_id"]])
        self.assertEqual(len(stored), DAYS * len(MEASURES))
        for row in stored:
            self.assertIsNone(row["province_code"])
            self.assertEqual(row["location_kind"], "grid")
            self.assertEqual(row["location_id"], "open-meteo:era5:73")
            self.assertEqual(row["data_kind"], "estimated")
            self.assertIn(row["quality_flag"], {"good", "missing"})

        location = self.client.one("SELECT * FROM locations WHERE location_id=?",
                                   ["open-meteo:era5:73"])
        self.assertEqual(location["kind"], "grid")
        self.assertIsNone(location["province_code"])

        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                 [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], published["run_id"])

    def test_attribution_string_is_part_of_the_published_payload(self):
        summary = run(["--write", "--province", "73",
                       "--start-date", START_DATE, "--end-date", END_DATE],
                      client=self.client, weather_client=self.weather)
        published = summary["published"]
        rows = self.client.rows("SELECT dimensions FROM observations WHERE run_id=?",
                                [published["run_id"]])
        self.assertTrue(rows)
        for row in rows:
            dimensions = json.loads(row["dimensions"])
            self.assertEqual(dimensions["attribution"], REQUIRED_ATTRIBUTION)
            self.assertEqual(dimensions["attributionUrl"], "https://open-meteo.com/")
            self.assertEqual(dimensions["provinceCode"], "73")
            self.assertEqual(dimensions["centroidSource"], "THAILAND_PROVINCE_CENTROIDS")
        resource = self.client.one("SELECT metadata FROM resources WHERE resource_id=?",
                                   [RESOURCE_ID])
        self.assertEqual(json.loads(resource["metadata"])["attribution"], REQUIRED_ATTRIBUTION)

    def test_missing_values_are_published_as_null_rows(self):
        self.weather.missing_index = 2
        summary = run(["--write", "--province", "73",
                       "--start-date", START_DATE, "--end-date", END_DATE],
                      client=self.client, weather_client=self.weather)
        self.assertEqual(summary["missingValues"], len(MEASURES))
        self.assertEqual(summary["completeness"], "partial")
        stored = self.client.rows(
            "SELECT value, quality_flag FROM observations WHERE run_id=?",
            [summary["published"]["run_id"]])
        missing = [row for row in stored if row["value"] is None]
        self.assertEqual(len(missing), len(MEASURES))
        for row in missing:
            self.assertEqual(row["quality_flag"], "missing")

    def test_unit_documentation_citation_is_published_in_dimensions(self):
        summary = run(["--write", "--province", "73",
                       "--start-date", START_DATE, "--end-date", END_DATE],
                      client=self.client, weather_client=self.weather)
        stored = self.client.rows("SELECT dimensions FROM observations WHERE run_id=?",
                                  [summary["published"]["run_id"]])
        self.assertTrue(stored)
        for row in stored:
            dimensions = json.loads(row["dimensions"])
            self.assertEqual(dimensions["unitDocumentation"], UNITS_DOCS_URL)
            self.assertEqual(dimensions["declaredLicense"], "CC-BY-4.0")

    def test_rerun_of_the_same_batch_is_idempotent(self):
        first = run(["--write", "--province", "73",
                     "--start-date", START_DATE, "--end-date", END_DATE],
                    client=self.client, weather_client=self.weather)
        second = run(["--write", "--province", "73",
                      "--start-date", START_DATE, "--end-date", END_DATE],
                     client=self.client, weather_client=self.weather)
        self.assertEqual(first["published"]["run_id"], second["published"]["run_id"])
        self.assertEqual(second["published"]["skipped_identical"], DAYS * len(MEASURES))
        self.assertEqual(second["published"]["records_inserted"], 0)
        total = self.client.one(
            "SELECT count(*) AS total FROM observations WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(total["total"], DAYS * len(MEASURES))

    def test_rerun_with_a_moved_retrieved_at_reuses_the_run_and_rows(self):
        """A daily cron refetch never duplicates: run id is deterministic and
        unchanged rows are skipped even though retrieved_at moves."""
        weather = FakeWeatherClient(varying_retrieved_at=True)
        first = run(["--write", "--province", "73",
                     "--start-date", START_DATE, "--end-date", END_DATE],
                    client=self.client, weather_client=weather)
        second = run(["--write", "--province", "73",
                      "--start-date", START_DATE, "--end-date", END_DATE],
                     client=self.client, weather_client=weather)
        self.assertEqual(first["published"]["run_id"], second["published"]["run_id"])
        self.assertEqual(second["published"]["records_inserted"], 0)
        self.assertEqual(second["published"]["records_written"], DAYS * len(MEASURES))
        total = self.client.one(
            "SELECT count(*) AS total FROM observations WHERE run_id=?",
            [second["published"]["run_id"]])
        self.assertEqual(total["total"], DAYS * len(MEASURES))

    # -- forecast refusal ---------------------------------------------------
    def test_forecast_path_is_refused_and_publishes_nothing(self):
        stderr = io.StringIO()
        with redirect_stderr(stderr), redirect_stdout(io.StringIO()):
            code = main(["--write", "--forecast", "--province", "73",
                         "--start-date", START_DATE, "--end-date", END_DATE],
                        client=self.client, weather_client=self.weather)
        self.assertEqual(code, 1)
        self.assertIn("FORECAST_NOT_PUBLISHABLE", stderr.getvalue())
        self.assertEqual(self.weather.calls, [], "the forecast endpoint must not be called")
        self.assertEqual(self.client.queries, 0)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 0)

    def test_forecast_refusal_is_raised_by_the_run_helper(self):
        with self.assertRaises(ForecastRefused):
            run(["--write", "--forecast"], client=self.client, weather_client=self.weather)

    # -- licence gate -------------------------------------------------------
    def test_pending_resource_is_refused_with_resource_not_approved(self):
        registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
        rows = []
        for row in registry["resources"]:
            if row["resource_key"] == RESOURCE_KEY:
                row = dict(row)
                row["license_status"] = "pending"
                row["project_publication_approved"] = False
                row["unresolved"] = ["publication approval missing"]
            rows.append(row)
        stderr = io.StringIO()
        with mock.patch("tadih.observations.load_resource_licenses", return_value=rows):
            with redirect_stderr(stderr), redirect_stdout(io.StringIO()):
                code = main(["--write", "--province", "73",
                             "--start-date", START_DATE, "--end-date", END_DATE],
                            client=self.client, weather_client=self.weather)
        self.assertEqual(code, 1)
        self.assertIn("RESOURCE_NOT_APPROVED", stderr.getvalue())
        self.assertEqual(self.weather.calls, [], "the licence gate runs before any upstream call")
        self.assertEqual(self.client.queries, 0)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 0)

    # -- rate limit / backoff ----------------------------------------------
    def test_rate_limit_backoff_path_is_used_and_the_batch_still_publishes(self):
        state = {"calls": 0}
        payload = archive_payload()

        def opener(request, timeout=None):
            state["calls"] += 1
            if state["calls"] == 1:
                headers = Message()
                headers["Retry-After"] = "2"
                raise HTTPError(request.full_url, 429, "Too Many Requests", headers, None)
            return _FakeResponse(payload)

        client = OpenMeteoClient(min_delay_seconds=0.1, max_retries=3, opener=opener)
        with mock.patch("tadih.open_meteo.time.sleep") as sleeper:
            summary = run(["--write", "--province", "73",
                           "--start-date", START_DATE, "--end-date", END_DATE],
                          client=self.client, weather_client=client)
        self.assertEqual(state["calls"], 2, "the 429 must be retried exactly once")
        delays = [call.args[0] for call in sleeper.call_args_list if call.args]
        self.assertTrue(any(isinstance(delay, (int, float)) and delay >= 2.0 for delay in delays),
                        f"the Retry-After backoff must be applied, got {delays}")
        self.assertTrue(summary["written"])
        self.assertEqual(summary["published"]["records_written"], DAYS * len(MEASURES))


class WindowTests(unittest.TestCase):
    def test_province_resolution_rejects_unknown_codes(self):
        from tadih.ingest_open_meteo_d1 import resolve_provinces
        self.assertEqual(resolve_provinces("73,74"), ["73", "74"])
        self.assertEqual(len(resolve_provinces("all")), 77)
        with self.assertRaises(ValueError):
            resolve_provinces("99")

    def test_location_id_format(self):
        self.assertEqual(location_id_for("73"), "open-meteo:era5:73")

    def test_window_defaults_to_the_era5_lag(self):
        from datetime import date
        from tadih.ingest_open_meteo_d1 import (
            DEFAULT_WINDOW_DAYS, ERA5_LAG_DAYS, parser, resolve_window)
        args = parser().parse_args([])
        start, end = resolve_window(args)
        self.assertEqual(end, (date.today() - timedelta(days=ERA5_LAG_DAYS)).isoformat())
        self.assertEqual((date.fromisoformat(end) - date.fromisoformat(start)).days,
                         DEFAULT_WINDOW_DAYS - 1)
        self.assertEqual(ERA5_LAG_DAYS, 6)

    def test_derive_run_id_is_deterministic_per_window_and_provinces(self):
        a = derive_run_id(RESOURCE_ID, START_DATE, END_DATE, ["73", "74"])
        b = derive_run_id(RESOURCE_ID, START_DATE, END_DATE, ["74", "73"])
        c = derive_run_id(RESOURCE_ID, "2026-10-15", "2026-10-21", ["73", "74"])
        d = derive_run_id(RESOURCE_ID, START_DATE, END_DATE, ["73"])
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertNotEqual(a, d)


class CliDispatchTests(unittest.TestCase):
    """``tadih ingest --adapter open_meteo`` must forward the shared flags.

    Lane C's convention: the CLI hands the adapter ``--write``/``--dry-run``
    and ``--date`` exactly; a dropped ``--write`` would publish nothing while
    still reporting success.
    """

    def setUp(self) -> None:
        self.client = SqliteD1Mock()

    def tearDown(self) -> None:
        SqliteD1Mock.close_all()

    def test_adapter_argv_carries_write_and_date(self):
        from tadih import cli
        args = cli.parser().parse_args(
            ["ingest", "--adapter", "open_meteo", "--write", "--date", END_DATE])
        self.assertEqual(cli.adapter_argv(args), ["--write", "--date", END_DATE])
        args = cli.parser().parse_args(["ingest", "--adapter", "open_meteo", "--dry-run"])
        self.assertEqual(cli.adapter_argv(args), ["--dry-run"])

    def _call_via_cli(self, argv):
        from tadih import cli
        import tadih.ingest_open_meteo_d1 as module
        weather = FakeWeatherClient()
        with mock.patch.object(module, "build_weather_client", return_value=(weather, None)):
            result = cli.call_adapter(module, list(argv), client=self.client)
        return weather, result

    def test_call_adapter_forwards_write_and_date_to_the_adapter(self):
        from tadih import cli
        cli_args = cli.parser().parse_args(
            ["ingest", "--adapter", "open_meteo", "--write", "--date", END_DATE])
        weather, result = self._call_via_cli(cli.adapter_argv(cli_args))
        self.assertIsInstance(result, dict)
        self.assertEqual(result["mode"], "write")
        self.assertTrue(result["written"])
        self.assertEqual(result["window"]["endDate"], END_DATE)
        self.assertEqual(result["window"]["startDate"], "2026-10-14")
        self.assertEqual(result["published"]["records_written"], DAYS * len(MEASURES))
        self.assertEqual(len(weather.calls), 1)
        self.assertFalse(weather.calls[0]["forecast"])

    def test_call_adapter_dry_run_default_writes_nothing(self):
        from tadih import cli
        cli_args = cli.parser().parse_args(
            ["ingest", "--adapter", "open_meteo", "--dry-run", "--date", END_DATE])
        _, result = self._call_via_cli(cli.adapter_argv(cli_args))
        self.assertEqual(result["mode"], "dry_run")
        self.assertFalse(result["written"])
        self.assertEqual(self.client.queries, 0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
