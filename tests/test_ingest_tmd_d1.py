"""Offline tests for the TMD station observation -> D1 adapter (lane R1-D).

No network access and no real credentials: the TMD XML documents are synthetic
fixtures embedded below (same layout as the live WeatherToday /
ThailandMonthlyRainfall payloads), the fetch step is replaced by a fake and the
D1 client is an in-memory SQLite mock that loads the real Hub schema
(``db/cloudflare/0001_hub.sql`` + ``0002_observation_extensions.sql``).

Contract under test (docs/assignments/2026-10-26-real-data-initiative.md §2 rule 4,
§3.1-§3.2):

* **Forecast != observation** — no forecast module is imported, no forecast
  endpoint is reachable from the adapter, and a forecast-marked row never
  reaches ``observations``.
* Buddhist era (พ.ศ.) stamps become Gregorian UTC instants; the source local
  time stays in the dimensions.
* missing measurements stay ``null`` with ``quality_flag='missing'``.
* station grain: ``area_code`` NULL, ``spatial_support='station'``; a province
  association is dimensions metadata only.
* units are never invented: ``unit`` NULL + ``unitStatus`` pending + the
  provider-declared unit kept for traceability; a field with no provider unit
  is skipped.
* one grain per run: the daily and the monthly series never merge.
* ``--dry-run`` (the default) writes nothing; ``--write`` publishes one numeric
  run and is idempotent.
* exit codes: 0 ok, 1 data error, 2 configuration/licence error.
"""

from __future__ import annotations

import ast
import contextlib
from datetime import date, timedelta
import inspect
import io
import json
from pathlib import Path
import sqlite3
import unittest
from unittest import mock

from tadih import ingest_tmd_d1 as adapter
from tadih.ingest_tmd_d1 import (
    DAILY_MEASURES,
    EXIT_CONFIG_ERROR,
    EXIT_DATA_ERROR,
    EXIT_OK,
    RESOURCE_SPECS,
    TmdAdapterError,
    build_daily_rows,
    build_monthly_rows,
    gregorian_year,
    main,
    parse_daily_document,
    parse_monthly_document,
    run_adapter,
)

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "config/resource_licenses.json"
AGRO_KEY = "tmd_weather_today_by_agro_daily"
AGRO_ID = "https://data.tmd.go.th/api/WeatherTodayByAgro/V1/"
MONTHLY_KEY = "tmd_monthly_rainfall_monthly"
MONTHLY_ID = "https://data.tmd.go.th/api/ThailandMonthlyRainfall/v1/index.php"

# The four official TMD observation endpoints (exact casing per lane A).
OFFICIAL_OBSERVATION_PATHS = {
    "/WeatherTodayByAgro/V1/",
    "/WeatherToday/V2/",
    "/weathertodayBySynop/V1/",
    "/ThailandMonthlyRainfall/v1/index.php",
}


# ---------------------------------------------------------------------------
# Synthetic TMD payloads
# ---------------------------------------------------------------------------

def _station(wmo: str, name_th: str, name_en: str, province: str, lat: str, lon: str,
             date_time: str, measures: str) -> str:
    return (
        f"<Station><WmoStationNumber>{wmo}</WmoStationNumber>"
        f"<StationNameThai>{name_th}</StationNameThai>"
        f"<StationNameEnglish>{name_en}</StationNameEnglish>"
        f"<Province>{province}</Province>"
        f'<Latitude Unit="decimal degree">{lat}</Latitude>'
        f'<Longitude Unit="decimal degree">{lon}</Longitude>'
        f'<Observation type="ObservationToday"><DateTime>{date_time}</DateTime>{measures}</Observation>'
        "</Station>"
    )


FULL_MEASURES = (
    '<MeanSeaLevelPressure unit="mb">1013.47</MeanSeaLevelPressure>'
    '<Temperature Unit="celcius">23.1</Temperature>'
    '<MaxTemperature Unit="celcius">34.5</MaxTemperature>'
    '<MinTemperature Unit="celcius">22.5</MinTemperature>'
    '<RelativeHumidity Unit="%">98</RelativeHumidity>'
    '<WindDirection Unit="degree">000</WindDirection>'
    '<WindSpeed Unit="km/h">7.2</WindSpeed>'
    '<Rainfall Unit="mm">1.00</Rainfall>'
)

DAILY_XML = (
    '<?xml version="1.0"?>'
    '<WeatherToday Version="2.0"><Header><Title>WeatherToday</Title>'
    "<Description>Today's Weather Observation By Agromet</Description>"
    "<LastBuildDate>2026-10-26 18:11:26</LastBuildDate>"
    "<status>200 OK</status></Header><Stations>"
    # a normal Chiang Rai agro-met station
    + _station("48304", "เชียงราย sky", "CHAING RAI AGROMET.", "เชียงราย",
               "19.87083", "99.78278", "2026-10-26 07:00:00.000", FULL_MEASURES)
    # the same day written in the Buddhist era (พ.ศ. 2569 = ค.ศ. 2026)
    + _station("48455", "กรุงเทพมหานคร", "BANGKOK METROPOLIS", "กรุงเทพมหานคร",
               "13.7333", "100.5667", "2569-10-26 07:00:00.000", FULL_MEASURES)
    # rainfall and pressure are not published by this station today
    + _station("48451", "นครปฐม", "NAKONPATHOM AGROMET", "นครปฐม",
               "14.0117", "99.9700", "2026-10-26 07:00:00.000",
               FULL_MEASURES.replace('<Rainfall Unit="mm">1.00</Rainfall>',
                                     '<Rainfall Unit="mm"></Rainfall>')
                               .replace('<MeanSeaLevelPressure unit="mb">1013.47</MeanSeaLevelPressure>',
                                        ""))
    # wind speed in Beaufort: a unit the shared helper cannot convert
    + _station("48601", "สงขลา", "SONGKHLA", "สงขลา", "7.2000", "100.6000",
               "2026-10-26 07:00:00.000",
               FULL_MEASURES.replace('<WindSpeed Unit="km/h">7.2</WindSpeed>',
                                     '<WindSpeed Unit="bft">3</WindSpeed>'))
    # payload without any unit attribute: nothing may be published under a guess
    + _station("48999", "ไม่มีหน่วย", "NO UNIT STATION", "unknown-province",
               "1.0000", "1.0000", "2026-10-26 07:00:00.000",
               '<Temperature>30.0</Temperature><MaxTemperature>36.0</MaxTemperature>'
               '<MinTemperature>24.0</MinTemperature><RelativeHumidity>80</RelativeHumidity>'
               '<Rainfall>0.0</Rainfall><MeanSeaLevelPressure>1010</MeanSeaLevelPressure>'
               '<WindDirection>180</WindDirection>')
    # impossible series (tmax below tmin): the station is refused
    + _station("48777", "ผิดข้อมูล", "BAD SERIES", "เชียงใหม่", "18.0", "99.0",
               "2026-10-26 07:00:00.000",
               FULL_MEASURES.replace('<MaxTemperature Unit="celcius">34.5</MaxTemperature>',
                                     '<MaxTemperature Unit="celcius">18.0</MaxTemperature>'))
    # a station element without any Observation block at all
    + "<Station><WmoStationNumber>48111</WmoStationNumber><Province>ลำปาง</Province></Station>"
    + "</Stations></WeatherToday>"
)

# A payload with nothing to refuse: used for the "complete run" assertions.
CLEAN_DAILY_XML = (
    '<?xml version="1.0"?>'
    '<WeatherToday Version="2.0"><Header><Title>WeatherToday</Title>'
    "<LastBuildDate>2026-10-26 18:11:26</LastBuildDate>"
    "<status>200 OK</status></Header><Stations>"
    + _station("48304", "เชียงราย", "CHAING RAI AGROMET.", "เชียงราย",
               "19.87083", "99.78278", "2026-10-26 07:00:00.000", FULL_MEASURES)
    + "</Stations></WeatherToday>"
)


def _station_monthly(wmo: str, name_th: str, province: str, year: str,
                     rainfall: dict, rainy_days: dict, *, rain_unit: str = "mm",
                     day_unit: str = "day") -> str:
    months = "".join(
        f'<Rainfall{tag}>{rainfall.get(month_index, "")}</Rainfall{tag}>'
        for month_index, tag in enumerate(adapter.MONTH_FIELDS, start=1)
    )
    days = "".join(
        f'<RainyDay{tag}>{rainy_days.get(month_index, "")}</RainyDay{tag}>'
        for month_index, tag in enumerate(adapter.MONTH_FIELDS, start=1)
    )
    rain_block = f'<MonthlyRainfall unit="{rain_unit}">{months}</MonthlyRainfall>' if rain_unit \
        else f"<MonthlyRainfall>{months}</MonthlyRainfall>"
    day_block = f'<MonthlyRainyDay unit="{day_unit}">{days}</MonthlyRainyDay>' if day_unit \
        else f"<MonthlyRainyDay>{days}</MonthlyRainyDay>"
    return (
        f"<StationMonthlyRainfall><WmoStationNumber>{wmo}</WmoStationNumber>"
        f"<StationNameThai>{name_th}</StationNameThai><StationNameEnglish>{wmo}</StationNameEnglish>"
        f"<Province>{province}</Province><Latitude>13.0</Latitude><Longitude>100.0</Longitude>"
        f"<Year>{year}</Year>{rain_block}{day_block}</StationMonthlyRainfall>"
    )


MONTHLY_XML = (
    '<?xml version="1.0"?>'
    "<THMonthlyRainfall><header><title> Thailand monthly rainfall and rainy day </title>"
    "<lastBuildDate>2026-10-26 18:12:07</lastBuildDate><status>200 OK</status></header>"
    "<StationsMonthlyRainfall>"
    + _station_monthly("48300", "แม่ฮ่องสอน", "แม่ฮ่องสอน", "2569",
                       {1: "0", 2: "29.8", 3: "34.5"}, {1: "0", 2: "4", 3: "4"})
    + _station_monthly("48455", "กรุงเทพมหานคร", "กรุงเทพมหานคร", "2026",
                       {1: "1.5", 2: "-", 3: "120.4"}, {1: "2", 2: "", 3: "9"})
    + "</StationsMonthlyRainfall></THMonthlyRainfall>"
)


def document(body: str, *, url: str = AGRO_ID) -> dict:
    """The envelope :func:`tadih.ingest_tmd_d1.fetch_document` returns."""
    return {
        "status": 200,
        "public_url": url,
        "content_type": "text/xml; charset=utf-8",
        "etag": None,
        "last_modified": None,
        "body": body,
        "bytes": len(body.encode("utf-8")),
    }


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
        SqliteD1Mock.instances.append(self)

    @classmethod
    def close_all(cls) -> None:
        while cls.instances:
            cls.instances.pop().db.close()

    def execute(self, sql, params=None):
        self.queries += 1
        cursor = self.db.execute(sql, list(params or []))
        rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        self.db.commit()
        return {"results": rows}

    def rows(self, sql, params=None):
        return [dict(row) for row in self.db.execute(sql, list(params or [])).fetchall()]

    def one(self, sql, params=None):
        found = self.rows(sql, params)
        return found[0] if found else None


class FakeFetcher:
    """Record the calls made to the upstream and replay a canned document."""

    def __init__(self, body: str = DAILY_XML, *, url: str = AGRO_ID) -> None:
        self.calls: list[dict] = []
        self.body = body
        self.url = url

    def __call__(self, path: str, *, year=None, timeout=60.0):
        self.calls.append({"path": path, "year": year, "timeout": timeout})
        return document(self.body, url=self.url.rsplit("/api", 1)[0] + path)

    @property
    def request_count(self) -> int:
        return len(self.calls)


def agro_resource() -> dict:
    return adapter.load_registry_resource(AGRO_KEY)


def contract_validate(row: dict) -> dict:
    """Validate a row exactly the way the shared writer does.

    ``data_contracts/observation.schema.json`` types ``unit`` as a string while
    the programme contract (assignment §3.1) allows ``null``; the writer bridges
    that gap with a probe token (:func:`tadih.observations._validate_row`) and
    still writes NULL to the column. The tests follow the writer path so they
    prove what is really published.
    """
    from tadih.observations import _validate_row
    clean = {key: value for key, value in row.items() if not key.startswith("_")}
    return _validate_row(clean, clean.get("unit"))


def daily_rows(body: str = DAILY_XML, *, station: str | None = None,
               limit: int | None = None) -> tuple[list[dict], list[dict]]:
    records, header = parse_daily_document(body)
    if station is not None:
        records = [row for row in records if row["station_id"] == station]
    if limit is not None:
        records = records[:limit]
    skipped: list[dict] = []
    rows = build_daily_rows(records, resource=agro_resource(), retrieved_at="2026-10-26T11:11:26Z",
                            revision_id="sha256:fixture", network="agro", skipped=skipped)
    return rows, skipped


# ---------------------------------------------------------------------------
# Parsing and time conversion
# ---------------------------------------------------------------------------

class ParsingTests(unittest.TestCase):
    def test_daily_document_layout_and_provider_units(self):
        records, header = parse_daily_document(DAILY_XML)
        self.assertEqual(header["title"], "WeatherToday")
        self.assertEqual(header["last_build_date"], "2026-10-26 18:11:26")
        self.assertEqual(header["stations_total"], 7, "the Observation-less station still counts")
        self.assertEqual(len(records), 6)
        first = records[0]
        self.assertEqual(first["station_id"], "48304")
        self.assertEqual(first["measures"]["Rainfall"], {"value": "1.00", "unit": "mm"})
        self.assertEqual(first["measures"]["Temperature"]["unit"], "celcius")
        self.assertEqual(first["measures"]["MeanSeaLevelPressure"]["unit"], "mb")

    def test_buddhist_era_day_becomes_gregorian_utc_instant(self):
        rows, _ = daily_rows(station="48455")
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(row["observed_at"], "2026-10-26T00:00:00Z")
            self.assertEqual(row["_dimensions"]["observedAtSourceIct"], "2026-10-26T07:00:00+07:00")
            self.assertEqual(row["_dimensions"]["observationDateIct"], "2026-10-26")

    def test_monthly_buddhist_year_is_converted(self):
        self.assertEqual(gregorian_year("2569"), 2026)
        self.assertEqual(gregorian_year("2026"), 2026)
        with self.assertRaises(TmdAdapterError):
            gregorian_year("not-a-year")

    def test_monthly_document_units_and_months(self):
        records, header = parse_monthly_document(MONTHLY_XML)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["station_id"], "48300")
        self.assertEqual(records[0]["year_raw"], "2569")
        self.assertEqual(records[0]["months"][2]["rainfall"], {"value": "29.8", "unit": "mm"})
        self.assertEqual(records[0]["months"][2]["rainy_days"]["unit"], "day")

    def test_invalid_xml_fails_closed(self):
        with self.assertRaises(TmdAdapterError) as ctx:
            parse_daily_document("<WeatherToday><broken>")
        self.assertEqual(ctx.exception.code, "TMD_PAYLOAD_INVALID")


# ---------------------------------------------------------------------------
# Observation contract
# ---------------------------------------------------------------------------

class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rows, cls.skipped = daily_rows()

    def tearDown(self) -> None:
        SqliteD1Mock.close_all()

    def test_every_row_passes_the_canonical_contract(self):
        for row in self.rows:
            contract_validate(row)

    def test_station_grain_never_claims_a_province(self):
        self.assertTrue(self.rows)
        for row in self.rows:
            self.assertIsNone(row["area_code"], "a station measurement is not a provincial value")
            self.assertEqual(row["spatial_support"], "station")
            self.assertEqual(row["data_kind"], "observed")
            self.assertEqual(row["source_id"], "tmd")
            self.assertTrue(row["location_id"].startswith("tmd:station:"))
            self.assertEqual(row["license_status"], "approved_public")
            self.assertIsNone(row["release_at"])
            self.assertEqual(row["source_url"], AGRO_ID)

    def test_province_association_is_dimensions_only(self):
        row = next(r for r in self.rows if r["_dimensions"]["stationCode"] == "48304")
        self.assertIsNone(row["area_code"])
        self.assertEqual(row["_dimensions"]["provinceCode"], "57")
        self.assertEqual(row["_dimensions"]["provinceNameTh"], "เชียงราย")
        self.assertEqual(row["_dimensions"]["latitude"], "19.87083")

    def test_units_are_never_invented(self):
        for row in self.rows:
            self.assertIsNone(row["unit"], "gate G3: no official dictionary, so unit stays NULL")
        rain = next(r for r in self.rows
                    if r["measure"] == "rainfall_mm" and r["_dimensions"]["stationCode"] == "48304")
        self.assertEqual(rain["_dimensions"]["providerUnit"], "mm")
        self.assertEqual(rain["_dimensions"]["unitStatus"], "pending_official_confirmation")
        self.assertEqual(rain["_dimensions"]["unitEvidence"]["declaredBy"],
                         "provider_payload_attribute")
        self.assertTrue(rain["_dimensions"]["unitEvidence"]["url"].startswith("https://"))

    def test_missing_measurement_stays_null_with_the_missing_flag(self):
        rain = next(r for r in self.rows
                    if r["measure"] == "rainfall_mm" and r["_dimensions"]["stationCode"] == "48451")
        self.assertIsNone(rain["value"], "a value the source omits must never become 0")
        self.assertEqual(rain["quality_flag"], "missing")
        pressure = next(r for r in self.rows
                        if r["measure"] == "air_pressure_msl_hpa"
                        and r["_dimensions"]["stationCode"] == "48451")
        self.assertIsNone(pressure["value"])
        self.assertEqual(pressure["quality_flag"], "missing")
        for row in self.rows:
            self.assertEqual(row["quality_flag"], "missing" if row["value"] is None else "good")

    def test_unconvertible_wind_unit_is_never_guessed(self):
        wind = next(r for r in self.rows
                    if r["measure"] == "wind_speed_ms" and r["_dimensions"]["stationCode"] == "48601")
        self.assertIsNone(wind["value"], "Beaufort must not be silently read as km/h")
        self.assertEqual(wind["quality_flag"], "missing")
        self.assertEqual(wind["_dimensions"]["providerUnit"], "bft")
        reasons = [s for s in self.skipped if s["reason"] == "WIND_UNIT_UNDOCUMENTED"]
        self.assertTrue(any(s["station"] == "48601" for s in reasons))

    def test_wind_speed_converts_only_the_declared_unit(self):
        wind = next(r for r in self.rows
                    if r["measure"] == "wind_speed_ms" and r["_dimensions"]["stationCode"] == "48304")
        self.assertAlmostEqual(wind["value"], 2.0, places=2)  # 7.2 km/h
        self.assertEqual(wind["_dimensions"]["providerUnit"], "km/h")

    def test_field_without_provider_unit_is_skipped_not_guessed(self):
        unitless = [r for r in self.rows if r["_dimensions"]["stationCode"] == "48999"
                    and r["measure"] != "wind_speed_ms"]
        self.assertEqual(unitless, [], "no measure may be published without a declared unit")
        reasons = {s["reason"] for s in self.skipped if s["station"] == "48999"}
        self.assertIn("UNIT_UNDOCUMENTED", reasons)

    def test_impossible_series_refuses_the_station_only(self):
        self.assertIn("48777", {s["station"] for s in self.skipped if s["reason"] == "STATION_INVALID"})
        self.assertEqual([r for r in self.rows if r["_dimensions"]["stationCode"] == "48777"], [])
        self.assertTrue([r for r in self.rows if r["_dimensions"]["stationCode"] == "48304"])

    def test_one_grain_per_run_and_daily_measure_set(self):
        self.assertEqual({r["_dimensions"]["seriesGrain"] for r in self.rows}, {"daily"})
        self.assertEqual({r["measure"] for r in self.rows},
                         {measure_id for measure_id, _field, _metric in DAILY_MEASURES})
        self.assertEqual({r["_dimensions"]["network"] for r in self.rows}, {"agro"})

    def test_daily_rows_are_unique_per_station_measure_and_day(self):
        ids = [r["observation_id"] for r in self.rows]
        self.assertEqual(len(ids), len(set(ids)))


class MonthlyContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        records, _ = parse_monthly_document(MONTHLY_XML)
        skipped: list[dict] = []
        cls.rows = build_monthly_rows(
            records, resource=adapter.load_registry_resource(MONTHLY_KEY),
            retrieved_at="2026-10-26T11:12:07Z", revision_id="sha256:fixture",
            network="monthly", months=[1, 2, 3], skipped=skipped)
        cls.skipped = skipped

    def test_monthly_grain_and_period(self):
        self.assertTrue(self.rows)
        for row in self.rows:
            self.assertEqual(row["_dimensions"]["seriesGrain"], "monthly")
            self.assertEqual(row["_dimensions"]["year"], 2026)
            self.assertIsNone(row["area_code"])
            self.assertEqual(row["spatial_support"], "station")
        march = [r for r in self.rows if r["_dimensions"]["month"] == 3]
        self.assertEqual({r["observed_at"] for r in march}, {"2026-03-31T00:00:00Z"})

    def test_monthly_missing_value_stays_null(self):
        feb = next(r for r in self.rows
                   if r["measure"] == "monthly_rainfall_mm"
                   and r["_dimensions"]["stationCode"] == "48455" and r["_dimensions"]["month"] == 2)
        self.assertIsNone(feb["value"])
        self.assertEqual(feb["quality_flag"], "missing")

    def test_monthly_measures_are_separate_series(self):
        self.assertEqual({r["measure"] for r in self.rows},
                         {"monthly_rainfall_mm", "monthly_rainy_days"})

    def test_monthly_rows_pass_the_contract(self):
        for row in self.rows:
            contract_validate(row)


# ---------------------------------------------------------------------------
# Forecast exclusion (rule 4 of the programme)
# ---------------------------------------------------------------------------

class ForecastExclusionTests(unittest.TestCase):
    def _imported_modules(self) -> set[str]:
        tree = ast.parse(inspect.getsource(adapter))
        names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                names.add(node.module)
        return names

    def test_no_forecast_module_is_imported(self):
        for name in self._imported_modules():
            for marker in ("nwp", "forecast", "hpc"):
                self.assertNotIn(marker, name.lower(), f"{name} is a forecast stream module")

    def test_only_the_four_official_observation_endpoints_are_reachable(self):
        self.assertEqual({spec["path"] for spec in RESOURCE_SPECS.values()},
                         OFFICIAL_OBSERVATION_PATHS)

    def test_forecast_marker_in_a_resource_is_refused_before_any_request(self):
        with self.assertRaises(TmdAdapterError) as ctx:
            adapter.assert_observation_resource(
                "tmd_nwp_forecast_daily", {"path": "/nwpapi/v1/forecast/place", "grain": "daily",
                                           "network": "nwp", "label": "TMD forecast"})
        self.assertEqual(ctx.exception.code, "TMD_FORECAST_RESOURCE_REFUSED")
        self.assertEqual(ctx.exception.exit_code, EXIT_CONFIG_ERROR)

    def test_built_rows_never_carry_a_forecast_marker(self):
        from tadih.observations import _has_forecast_marker
        rows, _ = daily_rows()
        for row in rows:
            self.assertFalse(_has_forecast_marker(row))

    def test_a_forecast_row_is_quarantined_and_never_stored(self):
        client = SqliteD1Mock()
        rows, _ = daily_rows(station="48304")
        poisoned = dict(rows[0])
        poisoned["data_kind"] = "forecast"
        envelope = adapter.publish(
            client, resource=agro_resource(), rows=[poisoned] + rows[1:],
            coverage={"mode": "daily_partial", "count": 1}, completeness="partial",
            retrieved_at="2026-10-26T11:11:26Z", grain="daily", network="agro")
        self.assertEqual(envelope["records_quarantined"], 1)
        self.assertEqual(envelope["quarantine_reasons"], {"FORECAST_REFUSED": 1})
        self.assertEqual(envelope["status"], "partial")
        stored = client.rows("SELECT data_kind FROM observations")
        self.assertTrue(stored)
        self.assertEqual({row["data_kind"] for row in stored}, {"observed"},
                         "no forecast row may exist in the observations table")


# ---------------------------------------------------------------------------
# CLI: dry run, write, idempotency, licence gate, exit codes
# ---------------------------------------------------------------------------

class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = SqliteD1Mock()
        self.fetcher = FakeFetcher()

    def tearDown(self) -> None:
        SqliteD1Mock.close_all()

    def test_dry_run_is_the_default_and_writes_nothing(self):
        summary = run_adapter(["--station", "48304"], client=self.client, fetcher=self.fetcher)
        self.assertEqual(summary["mode"], "dry_run")
        self.assertEqual(summary["publish"], {"written": False})
        self.assertEqual(summary["rows"], len(DAILY_MEASURES))
        self.assertEqual(self.client.queries, 0, "a dry run must not touch D1")
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 0)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM sync_runs")["total"], 0)

    def test_one_bounded_request_per_run(self):
        run_adapter(["--dry-run", "--station", "48304"], client=self.client, fetcher=self.fetcher)
        self.assertEqual(self.fetcher.request_count, 1)
        self.assertEqual(self.fetcher.calls[0]["path"], "/WeatherTodayByAgro/V1/")

    def test_write_publishes_one_numeric_run_of_station_rows(self):
        self.fetcher = FakeFetcher(CLEAN_DAILY_XML)
        summary = run_adapter(["--write"], client=self.client, fetcher=self.fetcher)
        published = summary["publish"]
        self.assertEqual(summary["completeness"], "complete")
        self.assertTrue(published["written"])
        self.assertEqual(published["status"], "succeeded")
        self.assertEqual(published["records_written"], len(DAILY_MEASURES))
        self.assertTrue(published["active_run_switched"])

        run = self.client.one("SELECT * FROM sync_runs WHERE run_id=?", [published["run_id"]])
        self.assertEqual(run["kind"], "numeric")
        self.assertEqual(run["source_id"], "tmd")
        self.assertEqual(run["resource_id"], AGRO_ID)
        self.assertEqual(run["status"], "succeeded")
        self.assertEqual(run["records_read"], len(DAILY_MEASURES))

        stored = self.client.rows(
            "SELECT province_code, location_kind, location_id, unit, value, quality_flag, "
            "data_kind, license_status, revision_id, source_url, period_start, period_end, "
            "metric_id, dimensions FROM observations WHERE run_id=?", [published["run_id"]])
        self.assertEqual(len(stored), len(DAILY_MEASURES))
        for row in stored:
            self.assertIsNone(row["province_code"], "station rows must not claim a province")
            self.assertEqual(row["location_kind"], "station")
            self.assertEqual(row["location_id"], "tmd:station:48304")
            self.assertIsNone(row["unit"], "units stay NULL until TMD confirms them")
            self.assertEqual(row["quality_flag"], "good")
            self.assertIsNotNone(row["value"])
            self.assertEqual(row["data_kind"], "observed")
            self.assertEqual(row["license_status"], "approved_public")
            self.assertEqual(row["source_url"], AGRO_ID)
            self.assertEqual((row["period_start"], row["period_end"]), ("2026-10-26", "2026-10-26"))
            dimensions = json.loads(row["dimensions"])
            self.assertEqual(dimensions["unitStatus"], "pending_official_confirmation")
            self.assertEqual(dimensions["network"], "agro")
            self.assertEqual(dimensions["observationDateIct"], "2026-10-26")

        location = self.client.one("SELECT * FROM locations WHERE location_id=?",
                                   ["tmd:station:48304"])
        self.assertEqual(location["kind"], "station")
        self.assertEqual(location["native_code"], "48304")
        self.assertIn("48304", location["name"])

        resource = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                   [AGRO_ID])
        self.assertEqual(resource["active_run_id"], published["run_id"])

    def test_filtered_batch_publishes_a_partial_run(self):
        summary = run_adapter(["--write", "--station", "48304"], client=self.client,
                              fetcher=self.fetcher)
        self.assertEqual(summary["completeness"], "partial")
        self.assertEqual(summary["publish"]["status"], "partial")
        self.assertEqual(summary["publish"]["records_written"], len(DAILY_MEASURES))
        self.assertTrue(summary["publish"]["active_run_switched"])

    def test_republishing_the_same_payload_is_idempotent(self):
        self.fetcher = FakeFetcher(CLEAN_DAILY_XML)
        first = run_adapter(["--write"], client=self.client, fetcher=self.fetcher)
        rows_after_first = self.client.one("SELECT count(*) AS total FROM observations")["total"]
        second = run_adapter(["--write"], client=self.client, fetcher=self.fetcher)
        self.assertEqual(first["publish"]["run_id"], second["publish"]["run_id"])
        self.assertEqual(second["publish"]["records_inserted"], 0)
        self.assertEqual(second["publish"]["skipped_identical"], len(DAILY_MEASURES))
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"],
                         rows_after_first, "the same station-day must not be stored twice")

    def test_retrieved_at_is_pinned_to_the_document_build_time(self):
        summary = run_adapter(["--dry-run", "--station", "48304"], client=self.client,
                              fetcher=self.fetcher)
        self.assertEqual(summary["retrieved_at"], "2026-10-26T11:11:26Z")
        self.assertGreater(summary["requested_at"], summary["retrieved_at"])

    def test_write_of_the_full_daily_document_reports_the_coverage(self):
        summary = run_adapter(["--write"], client=self.client, fetcher=self.fetcher)
        self.assertEqual(summary["stations"], 5)
        self.assertEqual(summary["rows"], 33)
        self.assertEqual(summary["completeness"], "partial")
        self.assertEqual(summary["coverage"]["mode"], "daily_partial")
        reasons = {entry["reason"] for entry in summary["skipped"]}
        self.assertTrue({"WIND_UNIT_UNDOCUMENTED", "UNIT_UNDOCUMENTED", "STATION_INVALID",
                         "NO_OBSERVATION_BLOCK"} <= reasons)

    def test_monthly_resource_publishes_its_own_grain(self):
        self.fetcher = FakeFetcher(MONTHLY_XML, url=MONTHLY_ID)
        summary = run_adapter(["--write", "--resource", MONTHLY_KEY, "--date", "2026-03-31",
                               "--station", "48300"], client=self.client, fetcher=self.fetcher)
        published = summary["publish"]
        self.assertEqual(summary["grain"], "monthly")
        self.assertEqual(summary["rows"], 6)
        self.assertEqual(self.fetcher.calls[0]["path"], "/ThailandMonthlyRainfall/v1/index.php")
        self.assertEqual(self.fetcher.calls[0]["year"], 2026)
        stored = self.client.rows(
            "SELECT metric_id, period_start, period_end, period_label, unit FROM observations "
            "WHERE run_id=?", [published["run_id"]])
        self.assertEqual(len(stored), 6)
        for row in stored:
            self.assertEqual(row["period_start"][8:10], "01", "a monthly period starts on day 1")
            self.assertEqual(row["period_label"], row["period_start"][:7])
            self.assertGreater(row["period_end"], row["period_start"])
            self.assertIsNone(row["unit"])

    def test_daily_and_monthly_never_share_a_resource_row(self):
        daily = run_adapter(["--write"], client=self.client, fetcher=self.fetcher)
        self.fetcher = FakeFetcher(MONTHLY_XML, url=MONTHLY_ID)
        monthly = run_adapter(["--write", "--resource", MONTHLY_KEY, "--date", "2026-02-28",
                               "--station", "48300"], client=self.client, fetcher=self.fetcher)
        self.assertNotEqual(daily["resource_id"], monthly["resource_id"])
        self.assertNotEqual(daily["publish"]["run_id"], monthly["publish"]["run_id"])
        self.assertEqual(self.client.one(
            "SELECT count(*) AS total FROM observations WHERE metric_id LIKE 'monthly_%'")["total"], 4)

    def test_pending_resource_is_refused_before_any_request(self):
        registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
        rows = []
        for row in registry["resources"]:
            if row["resource_key"] == AGRO_KEY:
                row = dict(row)
                row["license_status"] = "pending"
                row["project_publication_approved"] = False
                row["unresolved"] = ["publication approval missing"]
            rows.append(row)
        with mock.patch("tadih.observations.load_resource_licenses", return_value=rows):
            stdout, stderr = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = main(["--write", "--station", "48304"], client=self.client,
                            fetcher=self.fetcher)
        self.assertEqual(code, EXIT_CONFIG_ERROR)
        self.assertIn("RESOURCE_NOT_APPROVED", stderr.getvalue())
        self.assertEqual(self.fetcher.request_count, 0, "the gate runs before the upstream call")
        self.assertEqual(self.client.queries, 0)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 0)

    def test_date_filter_uses_the_source_ict_calendar_day(self):
        batch = adapter.prepare_batch(
            resource_key=AGRO_KEY, resource=agro_resource(), document=document(DAILY_XML),
            date_filter="2026-10-26", station=None, limit=None,
            include_current_month=False, retrieved_at="2026-10-26T11:11:26Z")
        self.assertTrue(batch["rows"])
        self.assertEqual({row["_dimensions"]["observationDateIct"] for row in batch["rows"]},
                         {"2026-10-26"},
                         "the Buddhist-era station belongs to the same Gregorian day")
        self.assertIn("tmd:station:48455", {row["location_id"] for row in batch["rows"]})
        summary = run_adapter(["--dry-run", "--date", "2026-10-26"], client=self.client,
                              fetcher=self.fetcher)
        self.assertEqual(summary["coverage"]["requestedDate"], "2026-10-26")
        self.assertTrue(summary["rows"])

    def test_unavailable_date_exits_with_a_data_error(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = main(["--dry-run", "--date", "2026-10-25"], client=self.client,
                        fetcher=self.fetcher)
        self.assertEqual(code, EXIT_DATA_ERROR)
        self.assertIn("TMD_DATE_NOT_AVAILABLE", stderr.getvalue())

    def test_invalid_date_format_exits_with_a_config_error(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = main(["--dry-run", "--date", "26-10-2569"], client=self.client,
                        fetcher=self.fetcher)
        self.assertEqual(code, EXIT_CONFIG_ERROR)
        self.assertIn("ADAPTER_DATE_INVALID", stderr.getvalue())

    def test_conflicting_flags_exit_with_a_config_error(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = main(["--dry-run", "--write"], client=self.client, fetcher=self.fetcher)
        self.assertEqual(code, EXIT_CONFIG_ERROR)
        self.assertIn("ADAPTER_FLAGS_CONFLICT", stderr.getvalue())
        self.assertEqual(self.client.queries, 0)

    def test_empty_selection_exits_with_a_data_error(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = main(["--dry-run", "--limit", "0"], client=self.client, fetcher=self.fetcher)
        self.assertEqual(code, EXIT_DATA_ERROR)
        self.assertIn("TMD_NO_ROWS", stderr.getvalue())

    def test_registry_pointing_at_another_endpoint_is_refused(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.object(adapter, "load_registry_resource",
                               return_value={"resource_id": "https://data.tmd.go.th/api/Other/V1/",
                                             "source_id": "tmd", "license_status": "approved_public",
                                             "project_publication_approved": True, "unresolved": []}):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = main(["--dry-run"], client=self.client, fetcher=self.fetcher)
        self.assertEqual(code, EXIT_DATA_ERROR)
        self.assertIn("TMD_RESOURCE_MISMATCH", stderr.getvalue())
        self.assertEqual(self.fetcher.request_count, 0)

    def test_main_returns_zero_for_a_dry_run(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = main(["--dry-run", "--station", "48304"], client=self.client,
                        fetcher=self.fetcher)
        self.assertEqual(code, EXIT_OK)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["adapter"], "tmd")
        self.assertEqual(payload["forecast_streams_included"], [])
        self.assertEqual(payload["unit_status"], "pending_official_confirmation")


# ---------------------------------------------------------------------------
# Credential handling
# ---------------------------------------------------------------------------

class CredentialSafetyTests(unittest.TestCase):
    SENTINEL_UID = "SENTINEL-UID"
    SENTINEL_UKEY = "SENTINEL-UKEY"

    def tearDown(self) -> None:
        SqliteD1Mock.close_all()

    def test_fetch_document_keeps_credentials_out_of_the_envelope(self):
        seen: dict = {}

        def opener(request, timeout):
            seen["url"] = request.full_url
            seen["user_agent"] = request.get_header("User-agent")
            return 200, DAILY_XML.encode("utf-8"), {"Content-Type": "text/xml"}

        with mock.patch.dict(adapter.os.environ,
                             {"TMD_API_UID": self.SENTINEL_UID, "TMD_API_UKEY": self.SENTINEL_UKEY,
                              "TMD_API_BASE_URL": "https://data.tmd.go.th/api"}):
            result = adapter.fetch_document("/WeatherTodayByAgro/V1/", opener=opener)

        self.assertIn(self.SENTINEL_UID, seen["url"], "the upstream call needs the credentials")
        self.assertNotIn(self.SENTINEL_UID, result["public_url"])
        self.assertNotIn(self.SENTINEL_UKEY, json.dumps(result, ensure_ascii=False, default=str))
        self.assertTrue(seen["user_agent"].startswith("Mozilla/5.0"),
                        "TMD answers 403 to a non-browser User-Agent")

    def test_missing_credentials_fail_closed_as_a_config_error(self):
        with mock.patch.dict(adapter.os.environ, {"TMD_API_UID": "", "TMD_API_UKEY": ""}):
            with self.assertRaises(TmdAdapterError) as ctx:
                adapter.fetch_document("/WeatherTodayByAgro/V1/")
        self.assertEqual(ctx.exception.code, "TMD_CREDENTIALS_MISSING")
        self.assertEqual(ctx.exception.exit_code, EXIT_CONFIG_ERROR)
        self.assertNotIn(self.SENTINEL_UID, str(ctx.exception))

    def test_published_summary_never_contains_a_credential(self):
        client = SqliteD1Mock()
        fetcher = FakeFetcher()
        stdout = io.StringIO()
        with mock.patch.dict(adapter.os.environ,
                             {"TMD_API_UID": self.SENTINEL_UID, "TMD_API_UKEY": self.SENTINEL_UKEY}):
            with contextlib.redirect_stdout(stdout):
                code = main(["--write", "--station", "48304"], client=client, fetcher=fetcher)
        self.assertEqual(code, EXIT_OK)
        output = stdout.getvalue()
        self.assertNotIn(self.SENTINEL_UID, output)
        self.assertNotIn(self.SENTINEL_UKEY, output)
        for row in client.rows("SELECT source_url, dimensions, quality FROM observations"):
            joined = json.dumps(row, ensure_ascii=False)
            self.assertNotIn("uid=", joined)
            self.assertNotIn("ukey=", joined)


class DateHygieneTests(unittest.TestCase):
    def test_complete_months_excludes_the_running_month(self):
        today = date(2026, 10, 26)
        self.assertEqual(adapter._complete_months(2026, today, False), [1, 2, 3, 4, 5, 6, 7, 8, 9])
        self.assertEqual(adapter._complete_months(2026, today, True),
                         [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    def test_month_last_day_handles_leap_years(self):
        self.assertEqual(adapter.month_last_day(2024, 2), 29)
        self.assertEqual(adapter.month_last_day(2026, 2), 28)
        self.assertEqual(adapter.month_last_day(2026, 12), 31)

    def test_document_revision_falls_back_to_the_payload_signature(self):
        self.assertEqual(adapter.document_revision({"etag": '  "abc"  '}), 'etag:"abc"')
        self.assertEqual(adapter.document_revision({"etag": None, "last_modified": "x"}),
                         "last-modified:x")
        self.assertTrue(adapter.document_revision({"body": "<a/>"}).startswith("sha256:"))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
