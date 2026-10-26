"""Offline tests for the GISTDA flood adapter (no network, no D1 access).

Contract under test: ``tadih.ingest_gistda_d1`` (Round 1, lane F) and the
canonical observation contract it publishes through the shared fail-closed
writer. The GISTDA gateway call is mocked, so the suite never touches the
network and never needs the API key.

The chronology block covers the ``ROWS_INVALID: invalid
observation/release/retrieval chronology`` failure: the gateway stamps its
product with its own clock (which runs ahead of ours) and a stamp without an
offset is the service's ICT time, so the batch has to publish a pair the
observation contract accepts - and refuse one it cannot justify.
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
import tempfile
import unittest

from tadih.ingest_gistda_d1 import (
    MAX_SOURCE_CLOCK_SKEW_SECONDS,
    MEASURE_FLOOD_KM2,
    MEASURE_FLOOD_RAI,
    MEASURE_RICE_RAI,
    PUBLIC_SOURCE_URL,
    RESOURCE_ID,
    RESOURCE_KEY,
    GistdaFetchError,
    aggregate_by_province,
    build_observation_rows,
    main,
    normalize_feature_collection,
    observation_chronology,
    polygons_from_snapshot,
    prepare_batch,
    run_adapter,
    satellite_families,
    validate_rows,
)
from tadih.observations import ObservationWriteError

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ID = "gistda"
TIME_STAMP = "2026-10-26T03:00:00Z"
RETRIEVED_AT = "2026-10-26T04:00:00Z"


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------

class SqliteD1Mock:
    """In-memory stand-in for D1Client that loads the real Hub schema."""

    instances = []

    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        script = (ROOT / "db/cloudflare/0001_hub.sql").read_text(encoding="utf-8")
        self.db.executescript(script)
        self.queries = 0
        SqliteD1Mock.instances.append(self)

    @classmethod
    def close_all(cls):
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


def feature(
    feature_id,
    province_code,
    flood_area_sqm,
    *,
    rice_area_sqm=None,
    tambon="640713",
    file_name="S1D_20261021_0600, rd2_20261020_0613",
    province_name="สุโขทัย",
):
    properties = {
        "_id": feature_id,
        "f_area": flood_area_sqm,
        "pv_idn": province_code,
        "pv_tn": province_name,
        "pv_en": "Changwat Sukhothai",
        "ap_idn": "6403",
        "tb_idn": tambon,
        "tb_tn": "ตำบล",
        "file_name": file_name,
    }
    if rice_area_sqm is not None:
        properties["rice_area"] = rice_area_sqm
    return {
        "type": "Feature",
        "id": feature_id,
        "properties": properties,
        "geometry": {"type": "Polygon", "coordinates": [[[100.0, 17.0], [100.1, 17.0], [100.1, 17.1], [100.0, 17.0]]]},
    }


def feature_collection(features, *, time_stamp=TIME_STAMP):
    return {
        "type": "FeatureCollection",
        "timeStamp": time_stamp,
        "numberMatched": len(features),
        "numberReturned": len(features),
        "features": features,
        # The live gateway echoes the API key here - it must never survive into
        # a published row, a file or a log.
        "links": [{"href": f"{PUBLIC_SOURCE_URL}?api_key=SECRET-KEY-SHOULD-NOT-LEAK"}],
    }


def approved_registry():
    """A minimal approved registry row (same shape as the real register)."""
    return {
        "automatic_approval": False,
        "resources": [
            {
                "resource_key": RESOURCE_KEY,
                "source_id": SOURCE_ID,
                "resource_id": RESOURCE_ID,
                "dataset_id": "features-flood-7days",
                "name": "พื้นที่น้ำท่วมรอบ 7 วันล่าสุด (features) — GISTDA Disaster Open API",
                "resource_url": RESOURCE_ID,
                "license_status": "approved_public",
                "project_publication_approved": True,
                "commercial_use_confirmed": False,
                "unresolved": [],
                "attribution_text": "ข้อมูลพื้นที่น้ำท่วม 7 วันล่าสุด โดย GISTDA",
                "attribution_url": "https://opendata.gistda.or.th/dataset/flood-disaster-data",
                "evidence": [{"url": RESOURCE_ID, "checked_at": "2026-10-26"}],
            }
        ],
    }


def registry_file(rows):
    handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    with handle:
        json.dump(rows, handle, ensure_ascii=False)
    return Path(handle.name)


# ---------------------------------------------------------------------------
# Normalization and aggregation
# ---------------------------------------------------------------------------

class AggregationTests(unittest.TestCase):
    def test_polygons_are_aggregated_per_dopa_province(self):
        payload = feature_collection([
            feature("f1", "64", 160000.0, rice_area_sqm=32000.0),
            feature("f2", "64", 80000.0, rice_area_sqm=16000.0),
            feature("f3", "73", 240000.0, rice_area_sqm=0.0, tambon="730101"),
        ])
        dataset = normalize_feature_collection(payload, retrieved_at=RETRIEVED_AT)
        self.assertEqual(len(dataset["polygons"]), 3)
        aggregates = aggregate_by_province(dataset["polygons"])
        self.assertEqual(sorted(aggregates), ["64", "73"])
        self.assertEqual(aggregates["64"]["polygon_count"], 2)
        self.assertAlmostEqual(aggregates["64"]["flood_area_sqm"], 240000.0)
        self.assertAlmostEqual(aggregates["64"]["rice_area_sqm"], 48000.0)
        self.assertEqual(aggregates["64"]["tambon_count"], 1)
        self.assertEqual(aggregates["64"]["satellite_families"], ["Sentinel-1", "Radarsat-2"])
        self.assertTrue(aggregates["64"]["rice_area_complete"])

    def test_unknown_scene_prefixes_are_not_guessed(self):
        self.assertEqual(satellite_families(["S1D_20261021_0600"]), ["Sentinel-1"])
        self.assertEqual(satellite_families(["rd2_20261020_0613"]), ["Radarsat-2"])
        self.assertEqual(satellite_families(["unknown_20261021_0600"]), [])

    def test_province_without_polygon_is_absent_not_zero(self):
        payload = feature_collection([feature("f1", "64", 160000.0)])
        dataset = normalize_feature_collection(payload, retrieved_at=RETRIEVED_AT)
        aggregates = aggregate_by_province(dataset["polygons"])
        self.assertNotIn("73", aggregates)
        self.assertNotIn("0", aggregates)
        rows = build_observation_rows(
            aggregates,
            observed_at=TIME_STAMP,
            retrieved_at=RETRIEVED_AT,
            revision_id="rev-1",
            batch_date="2026-10-26",
        )
        self.assertEqual({row["area_code"] for row in rows}, {"64"})

    def test_incomplete_rice_area_stays_null(self):
        payload = feature_collection([
            feature("f1", "64", 160000.0, rice_area_sqm=32000.0),
            feature("f2", "64", 80000.0),  # no rice area reported
        ])
        dataset = normalize_feature_collection(payload, retrieved_at=RETRIEVED_AT)
        aggregates = aggregate_by_province(dataset["polygons"])
        self.assertFalse(aggregates["64"]["rice_area_complete"])
        rows = build_observation_rows(
            aggregates,
            observed_at=TIME_STAMP,
            retrieved_at=RETRIEVED_AT,
            revision_id="rev-1",
            batch_date="2026-10-26",
        )
        by_measure = {row["measure"]: row for row in rows}
        self.assertIsNone(by_measure[MEASURE_RICE_RAI]["value"])
        self.assertEqual(by_measure[MEASURE_RICE_RAI]["quality_flag"], "missing")
        # The flood area is complete, so it stays a real number.
        self.assertEqual(by_measure[MEASURE_FLOOD_RAI]["quality_flag"], "good")


class UnitSeparationTests(unittest.TestCase):
    def test_rai_and_km2_are_separate_measures_with_separate_units(self):
        payload = feature_collection([feature("f1", "64", 160000.0, rice_area_sqm=32000.0)])
        dataset = normalize_feature_collection(payload, retrieved_at=RETRIEVED_AT)
        aggregates = aggregate_by_province(dataset["polygons"])
        rows = build_observation_rows(
            aggregates,
            observed_at=TIME_STAMP,
            retrieved_at=RETRIEVED_AT,
            revision_id="rev-1",
            batch_date="2026-10-26",
        )
        by_measure = {row["measure"]: row for row in rows}
        self.assertEqual(sorted(by_measure), [MEASURE_FLOOD_KM2, MEASURE_FLOOD_RAI, MEASURE_RICE_RAI])
        self.assertEqual(by_measure[MEASURE_FLOOD_RAI]["unit"], "rai")
        self.assertEqual(by_measure[MEASURE_FLOOD_KM2]["unit"], "km2")
        self.assertEqual(by_measure[MEASURE_RICE_RAI]["unit"], "rai")
        # 160,000 m² = 100 rai = 0.16 km². The two units are never added up.
        self.assertAlmostEqual(by_measure[MEASURE_FLOOD_RAI]["value"], 100.0)
        self.assertAlmostEqual(by_measure[MEASURE_FLOOD_KM2]["value"], 0.16)
        self.assertAlmostEqual(by_measure[MEASURE_RICE_RAI]["value"], 20.0)

    def test_snapshot_records_keep_rai_and_km2_apart(self):
        snapshot = {
            "metadata": {"retrieved_at": "2026-10-25T17:10:04Z"},
            "records": [
                {
                    "feature_id": "f1",
                    "dopa_province_code": "64",
                    "inundated_area_sqm": 71642.60,
                    "inundated_rice_area_rai": 26.07,
                    "dopa_amphoe_code": "6403",
                    "dopa_tambon_code": "640303",
                    "satellite_sources": "S1D_20261021_0600, rd2_20261020_0613",
                }
            ],
        }
        dataset = polygons_from_snapshot(snapshot)
        aggregates = aggregate_by_province(dataset["polygons"])
        rows = build_observation_rows(
            aggregates,
            observed_at="2026-10-25T17:10:04Z",
            retrieved_at="2026-10-25T17:10:04Z",
            revision_id="rev-snapshot",
            batch_date="2026-10-25",
        )
        by_measure = {row["measure"]: row for row in rows}
        self.assertAlmostEqual(by_measure[MEASURE_FLOOD_RAI]["value"], 44.78, places=2)
        self.assertAlmostEqual(by_measure[MEASURE_FLOOD_KM2]["value"], 0.071643, places=6)
        self.assertAlmostEqual(by_measure[MEASURE_RICE_RAI]["value"], 26.07, places=2)


class ProvenanceTests(unittest.TestCase):
    def test_source_url_carries_no_credential(self):
        payload = feature_collection([feature("f1", "64", 160000.0)])
        dataset = normalize_feature_collection(payload, retrieved_at=RETRIEVED_AT)
        aggregates = aggregate_by_province(dataset["polygons"])
        rows = build_observation_rows(
            aggregates,
            observed_at=TIME_STAMP,
            retrieved_at=RETRIEVED_AT,
            revision_id="rev-1",
            batch_date="2026-10-26",
        )
        for row in rows:
            self.assertEqual(row["source_url"], PUBLIC_SOURCE_URL)
            self.assertNotIn("api_key", row["source_url"])
            self.assertNotIn("SECRET-KEY", json.dumps(row))
        # The raw payload (which echoes the key) never leaves the normalizer.
        self.assertNotIn("SECRET-KEY", json.dumps(dataset))

    def test_rows_carry_the_governance_fields(self):
        payload = feature_collection([feature("f1", "64", 160000.0, rice_area_sqm=32000.0)])
        dataset = normalize_feature_collection(payload, retrieved_at=RETRIEVED_AT)
        aggregates = aggregate_by_province(dataset["polygons"])
        rows = build_observation_rows(
            aggregates,
            observed_at=TIME_STAMP,
            retrieved_at=RETRIEVED_AT,
            revision_id="rev-1",
            batch_date="2026-10-26",
        )
        for row in rows:
            self.assertEqual(row["spatial_support"], "province")
            self.assertEqual(row["data_kind"], "estimated")
            self.assertEqual(row["license_status"], "approved_public")
            self.assertIn(row["quality_flag"], ("good", "missing"))


# ---------------------------------------------------------------------------
# Chronology (the ROWS_INVALID regression)
# ---------------------------------------------------------------------------

class ChronologyTests(unittest.TestCase):
    """``observed_at <= retrieved_at`` must hold for the feed and the snapshot."""

    def dataset(self, *, time_stamp, captured):
        payload = feature_collection([feature("f1", "64", 160000.0, rice_area_sqm=32000.0)],
                                     time_stamp=time_stamp)
        return normalize_feature_collection(payload, retrieved_at=captured)

    def test_source_stamp_ahead_of_our_clock_moves_the_retrieval(self):
        """The gateway clock runs ahead of ours: the capture cannot be earlier."""
        batch = prepare_batch(self.dataset(
            time_stamp="2026-10-26T04:00:01Z", captured="2026-10-26T04:00:00Z"))
        self.assertEqual(batch["observed_at"], "2026-10-26T04:00:01Z")
        self.assertEqual(batch["retrieved_at"], "2026-10-26T04:00:01Z")
        self.assertEqual(batch["source_clock_skew_seconds"], 1.0)
        self.assertEqual(validate_rows(batch["rows"]), [])
        for row in batch["rows"]:
            self.assertEqual(row["observed_at"], "2026-10-26T04:00:01Z")
            self.assertEqual(row["retrieved_at"], "2026-10-26T04:00:01Z")

    def test_naive_source_stamp_is_read_as_the_service_ict_clock(self):
        """A stamp without an offset is ICT (UTC+7), not our own UTC time."""
        batch = prepare_batch(self.dataset(
            time_stamp="2026-10-26T11:00:00", captured="2026-10-26T04:00:01Z"))
        self.assertEqual(batch["observed_at"], "2026-10-26T04:00:00Z")
        self.assertEqual(batch["retrieved_at"], "2026-10-26T04:00:01Z")
        self.assertEqual(batch["dataset_date"], "2026-10-26")
        self.assertEqual(validate_rows(batch["rows"]), [])

    def test_a_product_stamp_from_the_far_future_is_refused(self):
        """Clamping a drift is true; clamping an hour of skew would be fiction."""
        with self.assertRaises(GistdaFetchError) as caught:
            prepare_batch(self.dataset(
                time_stamp="2026-10-26T05:00:00Z", captured="2026-10-26T04:00:00Z"))
        self.assertEqual(caught.exception.code, "SOURCE_TIMESTAMP_INVALID")
        self.assertGreater(3600, MAX_SOURCE_CLOCK_SKEW_SECONDS)

    def test_unusable_instants_are_refused_instead_of_defaulted(self):
        with self.assertRaises(GistdaFetchError) as caught:
            observation_chronology("not-a-timestamp", "also-not-a-timestamp")
        self.assertEqual(caught.exception.code, "SOURCE_TIMESTAMP_INVALID")
        # A missing product stamp falls back to the capture instant (unchanged).
        self.assertEqual(
            observation_chronology("", "2026-10-26T04:00:00Z")["observed_at"],
            "2026-10-26T04:00:00Z",
        )

    def test_snapshot_batch_keeps_one_capture_instant(self):
        snapshot = {
            "metadata": {"retrieved_at": "2026-10-25T17:10:04.706967+00:00"},
            "records": [{
                "feature_id": "f1", "dopa_province_code": "64", "inundated_area_sqm": 71642.60,
                "inundated_rice_area_rai": 26.07, "dopa_amphoe_code": "6403",
                "dopa_tambon_code": "640303", "satellite_sources": "S1D_20261021_0600",
            }],
        }
        batch = prepare_batch(polygons_from_snapshot(snapshot), batch_date="2026-10-24")
        self.assertEqual(batch["observed_at"], batch["retrieved_at"])
        self.assertEqual(batch["source_clock_skew_seconds"], 0.0)
        self.assertEqual(batch["batch_date"], "2026-10-24")
        self.assertEqual(validate_rows(batch["rows"]), [])

    def test_realistic_live_capture_ahead_of_now_publishes(self):
        """The exact live failure: the feed stamp lands a second after our clock."""
        ahead = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat().replace("+00:00", "Z")
        payload = feature_collection([feature("f1", "64", 160000.0)], time_stamp=ahead)
        batch = prepare_batch(normalize_feature_collection(payload))
        self.assertEqual(validate_rows(batch["rows"]), [], 'chronology must accept the clamped pair')
        self.assertLessEqual(datetime.fromisoformat(batch["observed_at"].replace("Z", "+00:00")),
                             datetime.fromisoformat(batch["retrieved_at"].replace("Z", "+00:00")))


# ---------------------------------------------------------------------------
# Adapter behaviour (licence gate, dry run, publish)
# ---------------------------------------------------------------------------

class AdapterRunTests(unittest.TestCase):
    def setUp(self):
        self.registry = registry_file(approved_registry())
        self.addCleanup(self.registry.unlink)
        self.client = SqliteD1Mock()
        self.addCleanup(SqliteD1Mock.close_all)

    def fetcher(self, features=None):
        payload = feature_collection(features or [feature("f1", "64", 160000.0, rice_area_sqm=32000.0)])
        return lambda: payload

    def test_dry_run_writes_nothing(self):
        result = run_adapter(
            client=self.client,
            write=False,
            registry_path=self.registry,
            fetcher=self.fetcher(),
        )
        self.assertEqual(result["mode"], "dry_run")
        self.assertEqual(result["records_written"], 0)
        self.assertEqual(result["records_read"], 3)
        self.assertEqual(self.client.queries, 0)
        self.assertEqual(self.client.rows("SELECT COUNT(*) AS n FROM observations")[0]["n"], 0)

    def test_pending_resource_is_refused_before_any_d1_query(self):
        payload = approved_registry()
        payload["resources"][0]["license_status"] = "pending"
        pending = registry_file(payload)
        self.addCleanup(pending.unlink)
        with self.assertRaises(ObservationWriteError) as caught:
            run_adapter(
                client=self.client,
                write=True,
                registry_path=pending,
                fetcher=self.fetcher(),
            )
        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")
        self.assertEqual(self.client.queries, 0)

    def test_write_publishes_separate_measures(self):
        result = run_adapter(
            client=self.client,
            write=True,
            registry_path=self.registry,
            fetcher=self.fetcher([
                feature("f1", "64", 160000.0, rice_area_sqm=32000.0),
                feature("f2", "73", 80000.0, rice_area_sqm=8000.0, tambon="730101"),
            ]),
        )
        self.assertEqual(result["status"], "partial")  # completeness is partial by design
        self.assertEqual(result["records_read"], 6)
        self.assertEqual(result["records_written"], 6)

        rows = self.client.rows(
            "SELECT row_key, metric_id, unit, value, dimensions, location_kind, province_code "
            "FROM observations WHERE resource_id=? ORDER BY row_key",
            [RESOURCE_ID],
        )
        self.assertEqual(len(rows), 6)
        units = {(row["metric_id"], row["unit"]) for row in rows}
        self.assertEqual(units, {
            (MEASURE_FLOOD_RAI, "rai"),
            (MEASURE_FLOOD_KM2, "km2"),
            (MEASURE_RICE_RAI, "rai"),
        })
        for row in rows:
            self.assertEqual(row["location_kind"], "province")
            dimensions = json.loads(row["dimensions"])
            self.assertEqual(dimensions["method"], "sum_polygon_area_by_dopa_province")
            self.assertIn(dimensions["spatialSupport"], ("province",))
            self.assertIn("tambonCount", dimensions)
            self.assertIn("satelliteSources", dimensions)
            self.assertTrue(dimensions["qualityNote"])
        rai_row = next(row for row in rows if row["metric_id"] == MEASURE_FLOOD_RAI and row["province_code"] == "64")
        self.assertAlmostEqual(rai_row["value"], 100.0)
        km2_row = next(row for row in rows if row["metric_id"] == MEASURE_FLOOD_KM2 and row["province_code"] == "64")
        self.assertAlmostEqual(km2_row["value"], 0.16)
        # The province without a polygon is absent, never 0.
        self.assertEqual(
            sorted({row["province_code"] for row in rows}),
            ["64", "73"],
        )
        run = self.client.one(
            "SELECT kind, status, records_read, records_written FROM sync_runs WHERE resource_id=?",
            [RESOURCE_ID],
        )
        self.assertEqual(run["kind"], "numeric")
        self.assertEqual(run["records_read"], 6)
        self.assertEqual(run["records_written"], 6)

    def test_published_source_url_has_no_credential(self):
        run_adapter(
            client=self.client,
            write=True,
            registry_path=self.registry,
            fetcher=self.fetcher(),
        )
        quality = self.client.rows("SELECT quality FROM observations")
        for row in quality:
            self.assertNotIn("SECRET-KEY", row["quality"])
            self.assertNotIn("api_key", row["quality"])

    def test_write_publishes_rows_when_the_feed_stamp_is_ahead_of_our_clock(self):
        """Regression: this batch used to die in ``ROWS_INVALID`` before the write."""
        ahead = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat().replace("+00:00", "Z")
        payload = feature_collection(
            [feature("f1", "64", 160000.0, rice_area_sqm=32000.0)], time_stamp=ahead)
        result = run_adapter(
            client=self.client,
            write=True,
            registry_path=self.registry,
            fetcher=lambda: payload,
        )
        self.assertEqual(result["mode"], "write")
        self.assertEqual(result["records_written"], 3)
        stored = self.client.rows(
            "SELECT period_start, dimensions FROM observations WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(len(stored), 3)
        self.assertEqual({row["period_start"][:10] for row in stored}, {ahead[:10]})

    def test_batch_date_outside_the_window_is_refused(self):
        from tadih.ingest_gistda_d1 import GistdaFetchError
        with self.assertRaises(GistdaFetchError) as caught:
            run_adapter(
                client=self.client,
                write=False,
                batch_date="2026-01-01",
                registry_path=self.registry,
                fetcher=self.fetcher(),
            )
        self.assertEqual(caught.exception.code, "BATCH_DATE_OUT_OF_RANGE")

    def test_dry_run_and_write_cannot_be_combined(self):
        from tadih.ingest_gistda_d1 import GistdaFetchError
        with self.assertRaises(GistdaFetchError) as caught:
            run_adapter(
                client=self.client,
                dry_run=True,
                write=True,
                registry_path=self.registry,
                fetcher=self.fetcher(),
            )
        self.assertEqual(caught.exception.code, "ADAPTER_FLAGS_CONFLICT")
        self.assertEqual(self.client.queries, 0)

    def test_date_keyword_from_the_cli_contract_is_honoured(self):
        result = run_adapter(
            client=self.client,
            dry_run=True,
            date="2026-10-26",
            registry_path=self.registry,
            fetcher=self.fetcher(),
        )
        self.assertEqual(result["mode"], "dry_run")
        self.assertEqual(result["batch_date"], "2026-10-26")


class SharedCliContractTests(unittest.TestCase):
    """``tadih ingest --adapter gistda`` must forward every flag to run_adapter.

    The shared dispatcher (``tadih.cli.call_adapter``) probes ``run_adapter``
    first and only passes the keyword arguments its signature declares. The
    module therefore has to expose ``client``/``dry_run``/``write``/``date``
    (the convention lanes C/D fixed) so a bare run is a dry-run and a
    ``--date`` is never dropped.
    """

    def setUp(self):
        self.registry = registry_file(approved_registry())
        self.addCleanup(self.registry.unlink)
        self.client = SqliteD1Mock()
        self.addCleanup(SqliteD1Mock.close_all)
        import tadih.ingest_gistda_d1 as module
        self.module = module
        self._originals = {
            "load_approved_resource": module.load_approved_resource,
            "fetch_flood_feature_collection": module.fetch_flood_feature_collection,
        }
        self.addCleanup(self._restore)
        module.load_approved_resource = lambda key, *, registry_path=None: dict(
            approved_registry()["resources"][0]
        )
        module.fetch_flood_feature_collection = lambda **kwargs: feature_collection([
            feature("f1", "64", 160000.0, rice_area_sqm=32000.0),
        ])

    def _restore(self):
        for name, value in self._originals.items():
            setattr(self.module, name, value)

    def test_bare_ingest_command_is_a_dry_run_and_writes_nothing(self):
        from tadih.cli import adapter_argv, call_adapter

        class _Args:
            write = False
            dry_run = False
            date = None

        argv = adapter_argv(_Args())
        self.assertEqual(argv, ["--dry-run"])
        result = call_adapter(self.module, argv, client=self.client)
        self.assertEqual(result["mode"], "dry_run")
        self.assertEqual(result["records_written"], 0)
        self.assertEqual(self.client.queries, 0)

    def test_write_and_date_flags_reach_the_adapter(self):
        from tadih.cli import adapter_argv, call_adapter

        class _Args:
            write = True
            dry_run = False
            date = "2026-10-26"

        argv = adapter_argv(_Args())
        self.assertEqual(argv, ["--write", "--date", "2026-10-26"])
        result = call_adapter(self.module, argv, client=self.client)
        self.assertEqual(result["mode"], "write")
        self.assertEqual(result["records_written"], 3)
        rows = self.client.rows(
            "SELECT dimensions FROM observations WHERE resource_id=?", [RESOURCE_ID],
        )
        self.assertEqual(len(rows), 3)
        for row in rows:
            self.assertEqual(json.loads(row["dimensions"])["batchDate"], "2026-10-26")


class CliTests(unittest.TestCase):
    def setUp(self):
        self.registry = registry_file(approved_registry())
        self.addCleanup(self.registry.unlink)
        self.client = SqliteD1Mock()
        self.addCleanup(SqliteD1Mock.close_all)

    def test_dry_run_is_the_default_and_writes_nothing(self):
        snapshot = ROOT / "web/data/gistda_flood_7days.json"
        exit_code = main(["--snapshot", str(snapshot)], client=self.client)
        self.assertEqual(exit_code, 0)
        self.assertEqual(self.client.queries, 0)

    def test_dry_run_and_write_cannot_be_combined(self):
        exit_code = main(["--dry-run", "--write"], client=self.client)
        self.assertEqual(exit_code, 2)
        self.assertEqual(self.client.queries, 0)


if __name__ == "__main__":
    unittest.main()
