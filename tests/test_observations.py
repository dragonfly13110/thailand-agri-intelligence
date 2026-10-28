"""Offline tests for the shared observation writer (SQLite D1 mock, no network).

Contract under test: ``tadih.observations.publish_observations`` from
docs/assignments/2026-10-26-real-data-initiative.md section 3.2, plus the
``tadih ingest --adapter`` dispatch that the numeric lanes use.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys
import types
import unittest
from unittest.mock import patch

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

from tadih.cli import main as cli_main
from tadih.observations import (
    ObservationWriteError,
    publish_observations,
    register_resource,
    assert_resource_approved,
)
from tadih.quality import validate_observation

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ID = "rid"
RESOURCE_ID = "https://app.rid.go.th/reservoir/api/reservoir/public"
DATASET_ID = "rid-reservoir-daily"
RETRIEVED_AT = "2026-10-26T03:00:00Z"
OBSERVED_AT = "2026-10-25T00:00:00Z"
REVISION = "W/\"etag-rid-2026-10-26\""


class SqliteD1Mock:
    """In-memory stand-in for D1Client that loads the real Hub schema."""

    instances = []

    def __init__(self, *, with_extensions=False, with_source_year_snapshot=True,
                 with_source_year_writer_token=True, omit_constraints=()):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        script = (ROOT / "db/cloudflare/0001_hub.sql").read_text(encoding="utf-8")
        omitted_constraint_ddl = {
            "sources_pk": ("sources", "source_id TEXT PRIMARY KEY,", "source_id TEXT,"),
            "datasets_pk": ("datasets", "dataset_id TEXT PRIMARY KEY,", "dataset_id TEXT,"),
            "datasets_source_dataset_unique": (
                "datasets",
                "harvested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    UNIQUE (source_id, source_dataset_id)",
                "harvested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
            ),
            "resources_pk": ("resources", "resource_id TEXT PRIMARY KEY,", "resource_id TEXT,"),
            "resources_dataset_fk": (
                "resources", "dataset_id TEXT NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,",
                "dataset_id TEXT NOT NULL,",
            ),
            "resources_active_run_fk": (
                "resources",
                "UNIQUE (dataset_id, source_resource_id),\n    FOREIGN KEY (resource_id, active_run_id)\n"
                "        REFERENCES sync_runs(resource_id, run_id)\n        DEFERRABLE INITIALLY DEFERRED",
                "UNIQUE (dataset_id, source_resource_id)",
            ),
            "sync_runs_pk": ("sync_runs", "run_id TEXT PRIMARY KEY,", "run_id TEXT,"),
            "sync_runs_source_fk": (
                "sync_runs", "source_id TEXT NOT NULL REFERENCES sources(source_id),", "source_id TEXT NOT NULL,",
            ),
            "sync_runs_resource_fk": (
                "sync_runs", "resource_id TEXT REFERENCES resources(resource_id),", "resource_id TEXT,",
            ),
            "sync_runs_resource_run_unique": (
                "sync_runs", "error_code TEXT,\n    UNIQUE (resource_id, run_id)", "error_code TEXT",
            ),
            "locations_pk": ("locations", "location_id TEXT PRIMARY KEY,", "location_id TEXT,"),
            "locations_source_fk": (
                "locations", "source_id TEXT NOT NULL REFERENCES sources(source_id),", "source_id TEXT NOT NULL,",
            ),
            "locations_source_kind_code_unique": (
                "locations", "crosswalk_version TEXT,\n    UNIQUE (source_id, kind, native_code)",
                "crosswalk_version TEXT",
            ),
            "observations_pk": (
                "observations", "PRIMARY KEY (resource_id, run_id, row_key),\n", "",
            ),
            "observations_resource_fk": (
                "observations", "resource_id TEXT NOT NULL REFERENCES resources(resource_id),",
                "resource_id TEXT NOT NULL,",
            ),
            "observations_location_fk": (
                "observations", "location_id TEXT REFERENCES locations(location_id),", "location_id TEXT,",
            ),
            "observations_run_fk": (
                "observations",
                "PRIMARY KEY (resource_id, run_id, row_key),\n    FOREIGN KEY (resource_id, run_id)\n"
                "        REFERENCES sync_runs(resource_id, run_id)\n        ON DELETE CASCADE",
                "PRIMARY KEY (resource_id, run_id, row_key)",
            ),
        }
        for constraint in omit_constraints:
            try:
                table_name, original, replacement = omitted_constraint_ddl[constraint]
            except KeyError as exc:
                raise ValueError(f"unknown test schema constraint: {constraint}") from exc
            table_start = script.index(f"CREATE TABLE {table_name} (")
            table_end = script.index("\n);", table_start)
            table_ddl = script[table_start:table_end]
            if original not in table_ddl:
                raise AssertionError(f"test schema fragment is missing: {constraint}")
            script = script[:table_start] + table_ddl.replace(original, replacement, 1) + script[table_end:]
        if with_extensions:
            script += (ROOT / "db/cloudflare/0002_observation_extensions.sql").read_text(encoding="utf-8")
        if with_source_year_snapshot:
            script += (ROOT / "db/cloudflare/0004_source_year_snapshot_revision.sql").read_text(encoding="utf-8")
        if with_source_year_writer_token:
            script += (ROOT / "db/cloudflare/0005_source_year_writer_token.sql").read_text(encoding="utf-8")
        self.db.executescript(script)
        self.queries = 0
        self.statements = []
        self.observation_writes = 0
        self.fail_after_observations = None
        self.before_run_insert = None
        self.before_run_finalize = None
        self.before_snapshot_upsert = None
        self.before_observation_insert = None
        self.location_upserts = 0
        self.before_location_upsert = None
        self.before_location_upsert_at = 1
        SqliteD1Mock.instances.append(self)

    @classmethod
    def close_all(cls):
        while cls.instances:
            cls.instances.pop().db.close()

    def execute(self, sql, params=None):
        self.queries += 1
        self.statements.append(sql)
        if self.before_run_insert is not None and "INSERT INTO sync_runs" in sql:
            hook = self.before_run_insert
            self.before_run_insert = None
            hook()
        if (self.before_run_finalize is not None
                and sql.startswith("UPDATE sync_runs SET status=?,completed_at=?")):
            hook = self.before_run_finalize
            self.before_run_finalize = None
            hook()
        if (self.before_snapshot_upsert is not None
                and "snapshot.source_retrieved_at=?" in sql):
            hook = self.before_snapshot_upsert
            self.before_snapshot_upsert = None
            hook()
        if sql.lstrip().startswith("INSERT INTO locations"):
            self.location_upserts += 1
            if (self.before_location_upsert is not None
                    and self.location_upserts == self.before_location_upsert_at):
                hook = self.before_location_upsert
                self.before_location_upsert = None
                hook()
        if sql.lstrip().startswith("INSERT INTO observations"):
            if self.before_observation_insert is not None:
                hook = self.before_observation_insert
                self.before_observation_insert = None
                hook()
            if (self.fail_after_observations is not None
                    and self.observation_writes >= self.fail_after_observations):
                raise RuntimeError("simulated D1 row failure")
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


class ActivationHookClient(SqliteD1Mock):
    """Runs ``before_activation`` once, just before an activation UPDATE.

    Simulates another ingestion job that activates a newer run between this
    job's data write and its own ``resources.active_run_id`` UPDATE.
    """

    def __init__(self):
        super().__init__()
        self.before_activation = None

    def execute(self, sql, params=None):
        hook = self.before_activation
        if hook is not None and "UPDATE resources SET active_run_id" in sql:
            self.before_activation = None
            hook()
        return super().execute(sql, params)


class ObservationPublisherTests(unittest.TestCase):
    def setUp(self):
        self.client = SqliteD1Mock()
        self.resource = registry_row()
        register_resource(
            self.client,
            resource=self.resource,
            source_name="Royal Irrigation Department",
            base_url="https://app.rid.go.th",
            connector_kind="api",
            category="water",
            grain="reservoir x UTC date",
            resource_format="JSON",
        )
        self.client.queries = 0

    def tearDown(self):
        SqliteD1Mock.close_all()

    # -- license gate -------------------------------------------------------
    def test_license_gate_blocks_before_any_d1_query(self):
        cases = (
            ("pending", {"license_status": "pending"}),
            ("project publication false", {"project_publication_approved": False}),
            ("unresolved findings", {"unresolved": ["commercial use unclear"]}),
            ("unresolved missing", {"unresolved": None}),
            ("license restricted", {"license_status": "restricted"}),
        )
        for label, change in cases:
            with self.subTest(label):
                client = SqliteD1Mock()
                resource = dict(registry_row())
                resource.update(change)
                with self.assertRaises(ObservationWriteError) as caught:
                    publish(client, resource=resource, rows=[observation()])
                self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")
                self.assertEqual(client.queries, 0)

    def test_gate_checks_registry_before_row_validation(self):
        client = SqliteD1Mock()
        resource = dict(registry_row(), license_status="pending")
        with self.assertRaises(ObservationWriteError) as caught:
            publish(client, resource=resource, rows=[{"not": "a valid row"}])
        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")
        self.assertEqual(client.queries, 0)

    # -- contract validation ------------------------------------------------
    def test_a_batch_of_only_invalid_rows_is_refused_before_any_write(self):
        cases = (
            ("non finite value", observation(value=float("nan"))),
            ("null value flagged good", observation(value=None, quality_flag="good")),
            ("value flagged missing", observation(value=52.5, quality_flag="missing")),
            ("unknown quality flag", observation(quality_flag="suspect")),
            ("forecast data kind", observation(data_kind="forecast")),
            ("unknown data kind", observation(data_kind="unknown")),
            ("foreign source", observation(source_id="chirps")),
            ("revoked row license", observation(license_status="restricted")),
            ("unsupported spatial support", observation(spatial_support="watershed")),
            ("row from a later retrieval", observation(retrieved_at="2027-01-01T00:00:00Z")),
        )
        for label, row in cases:
            with self.subTest(label):
                client = SqliteD1Mock()
                register_resource(client, resource=registry_row(), source_name="RID",
                                  base_url="https://app.rid.go.th")
                client.queries = 0
                with self.assertRaises(ObservationWriteError) as caught:
                    publish(client, resource=registry_row(), rows=[row])
                self.assertEqual(caught.exception.code, "ALL_ROWS_REJECTED")
                self.assertEqual(client.queries, 0)
                self.assertEqual(client.one("SELECT count(*) AS total FROM sync_runs")["total"], 0)
                self.assertEqual(client.one("SELECT count(*) AS total FROM observations")["total"], 0)

    def test_quarantines_bad_rows_and_publishes_the_rest_as_partial(self):
        rows = [
            observation(),
            observation(observation_id="rid-obs-bad", value=float("nan")),
            observation(),  # duplicate row key
            observation(observation_id="rid-obs-forecast", measure="forecast_rainfall"),
            observation(observation_id="rid-obs-foreign", source_id="chirps"),
            observation(observation_id="rid-obs-mixed-unit", unit="m3"),
            observation(observation_id="rid-obs-quality", value=None, quality_flag="good"),
        ]
        result = publish(self.client, resource=self.resource, rows=rows,
                         completeness="complete", coverage={"mode": "daily_full", "count": len(rows)})

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["records_read"], len(rows))
        self.assertEqual(result["records_written"], 1)
        self.assertEqual(result["records_quarantined"], len(rows) - 1)
        reasons = result["quarantine_reasons"]
        self.assertEqual(reasons["CONTRACT_INVALID"], 1)
        self.assertEqual(reasons["DUPLICATE_ROW_KEY"], 1)
        self.assertEqual(reasons["FORECAST_REFUSED"], 1)
        self.assertEqual(reasons["SOURCE_MISMATCH"], 1)
        self.assertEqual(reasons["UNIT_MISMATCH"], 1)
        self.assertEqual(reasons["QUALITY_FLAG_MISMATCH"], 1)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 1)
        run = self.client.one("SELECT * FROM sync_runs WHERE run_id=?", [result["run_id"]])
        self.assertEqual((run["status"], run["records_read"], run["records_quarantined"]),
                         ("partial", len(rows), len(rows) - 1))

    def test_rejects_bad_batch_metadata_before_any_write(self):
        for label, row in (
            ("empty unit string", observation(unit="   ")),
            ("unit clashes with the batch unit", observation(unit="m3")),
        ):
            with self.subTest(label):
                client = SqliteD1Mock()
                register_resource(client, resource=registry_row(), source_name="RID",
                                  base_url="https://app.rid.go.th")
                client.queries = 0
                with self.assertRaises(ObservationWriteError) as caught:
                    publish(client, resource=registry_row(), rows=[row], unit="percent")
                self.assertTrue(caught.exception.code)
                self.assertEqual(client.queries, 0)

    def test_requires_coverage_completeness_and_adapter_version(self):
        for label, change in (
            ("completeness unknown", {"completeness": "unknown"}),
            ("completeness missing", {"completeness": None}),
            ("coverage without mode", {"coverage": {"count": 3}}),
            ("no rows", {"rows": []}),
            ("adapter version blank", {"adapter_version": ""}),
        ):
            with self.subTest(label):
                client = SqliteD1Mock()
                kwargs = {"completeness": "partial", "coverage": {"mode": "daily_full", "count": 1},
                          "rows": [observation()]}
                kwargs.update(change)
                with self.assertRaises(ObservationWriteError) as caught:
                    publish(client, resource=self.resource, **kwargs)
                self.assertEqual(client.queries, 0)
                self.assertTrue(caught.exception.code)

    # -- happy path ---------------------------------------------------------
    def test_successful_write_creates_run_locations_and_observations(self):
        rows = [observation(), observation(observation_id="rid-obs-2", location_id="rid:reservoir:R2",
                                           measure="reservoir_volume", unit="m3", value=None,
                                           quality_flag="missing"),
                observation(observation_id="rid-obs-3", location_id="rid:reservoir:R3",
                            measure="reservoir_volume", unit="m3", value=1_250_000)]
        result = publish(self.client, resource=self.resource, rows=rows, completeness="complete",
                         coverage={"mode": "daily_full", "count": 3})

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual((result["records_read"], result["records_written"]), (3, 3))
        self.assertEqual(result["skipped_identical"], 0)
        self.assertEqual(result["locations_written"], 3)
        self.assertTrue(result["active_run_switched"])
        self.assertRegex(result["payload_sha256"], r"^[0-9a-f]{64}$")

        run = self.client.one("SELECT * FROM sync_runs WHERE run_id=?", [result["run_id"]])
        self.assertEqual((run["kind"], run["status"], run["source_id"]), ("numeric", "succeeded", SOURCE_ID))
        self.assertEqual(run["payload_sha256"], result["payload_sha256"])
        self.assertEqual(run["source_retrieved_at"], RETRIEVED_AT)
        self.assertEqual(run["adapter_version"], "test-adapter/1")

        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], result["run_id"])

        stored = self.client.rows(
            "SELECT row_key, value, unit, location_kind, province_code, series_key, quality "
            "FROM observations WHERE run_id=? ORDER BY row_key", [result["run_id"]])
        self.assertEqual([row["row_key"] for row in stored], ["rid-obs-2", "rid-obs-3", "rid-obs-4"])
        self.assertIsNone(stored[0]["value"])
        self.assertEqual(stored[0]["location_kind"], "reservoir")
        self.assertEqual(stored[1]["unit"], "m3")
        self.assertEqual(stored[1]["series_key"], "reservoir_volume:daily:reservoir:m3")
        self.assertEqual(json.loads(stored[1]["quality"])["revisionId"], REVISION)

    def test_daily_writer_keeps_one_location_upsert_per_observation(self):
        rows = [observation(observation_id="rid-daily-location-a"),
                observation(observation_id="rid-daily-location-b")]
        publish(self.client, resource=self.resource, rows=rows, completeness="complete",
                coverage={"mode": "daily_full", "count": len(rows)})

        self.assertEqual(self.client.location_upserts, 2)

    def test_daily_and_monthly_location_upserts_reject_persisted_identity_mismatch(self):
        for grain in ("daily", "monthly"):
            with self.subTest(grain=grain):
                client = SqliteD1Mock()
                resource = registry_row()
                register_resource(client, resource=resource, source_name="RID",
                                  base_url="https://app.rid.go.th")
                legacy = {
                    "location_id": "legacy:rid:reservoir:R1",
                    "source_id": "rid",
                    "kind": "reservoir",
                    "native_code": "rid:reservoir:R1",
                    "name": "Legacy reservoir name",
                    "province_code": None,
                }
                client.execute(
                    "INSERT INTO locations (location_id,source_id,kind,native_code,name,province_code) "
                    "VALUES (?,?,?,?,?,?)",
                    list(legacy.values()),
                )

                with self.assertRaises(ObservationWriteError) as caught:
                    publish(
                        client, resource=resource,
                        rows=[observation(observation_id=f"rid-{grain}-identity-conflict")],
                        completeness="complete", coverage={"mode": f"{grain}_full", "count": 1},
                        period_grain=grain,
                    )

                self.assertEqual(caught.exception.code, "LOCATION_IDENTITY_CONFLICT")
                self.assertEqual(client.one(
                    "SELECT location_id,source_id,kind,native_code,name,province_code FROM locations "
                    "WHERE source_id='rid' AND kind='reservoir' AND native_code='rid:reservoir:R1'",
                ), legacy)
                self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)

    def test_partial_completeness_stays_partial_and_activated(self):
        result = publish(self.client, resource=self.resource, rows=[observation()],
                         completeness="partial", coverage={"mode": "daily_partial", "count": 1})
        self.assertEqual(result["status"], "partial")
        run = self.client.one("SELECT status FROM sync_runs WHERE run_id=?", [result["run_id"]])
        self.assertEqual(run["status"], "partial")
        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], result["run_id"])

    def test_missing_unit_is_written_as_null_with_pending_status(self):
        row = observation(unit=None)
        result = publish(self.client, resource=self.resource, rows=[row], completeness="partial",
                         coverage={"mode": "daily_full", "count": 1})
        stored = self.client.one(
            "SELECT unit, value, dimensions, quality FROM observations WHERE run_id=?", [result["run_id"]])
        self.assertIsNone(stored["unit"])
        self.assertEqual(stored["value"], 52.5)
        self.assertEqual(json.loads(stored["quality"])["unitStatus"], "pending_official_confirmation")
        self.assertEqual(json.loads(stored["dimensions"])["unitStatus"], "pending_official_confirmation")

    def test_province_grain_is_not_inflated_from_station_rows(self):
        result = publish(self.client, resource=self.resource,
                         rows=[observation(spatial_support="province", area_code="18",
                                          location_id="th:province:18")],
                         completeness="partial", coverage={"mode": "daily_full", "count": 1},
                         unit="percent")
        stored = self.client.one(
            "SELECT province_code, location_kind, location_name FROM observations WHERE run_id=?",
            [result["run_id"]])
        self.assertEqual((stored["province_code"], stored["location_kind"]), ("18", "province"))
        location = self.client.one("SELECT * FROM locations WHERE location_id=?", ["th:province:18"])
        self.assertEqual((location["kind"], location["province_code"]), ("province", "18"))

    def test_station_location_override_names_the_station(self):
        result = publish(self.client, resource=self.resource,
                         rows=[observation(spatial_support="station", location_id="tmd:station:01-1234")],
                         completeness="partial", coverage={"mode": "daily_full", "count": 1},
                         locations={"tmd:station:01-1234": {"name": "Kanchanaburi", "nativeCode": "01-1234"}})
        location = self.client.one("SELECT * FROM locations WHERE location_id=?", ["tmd:station:01-1234"])
        self.assertEqual((location["kind"], location["name"], location["native_code"]),
                         ("station", "Kanchanaburi", "01-1234"))
        stored = self.client.one("SELECT location_name FROM observations WHERE run_id=?", [result["run_id"]])
        self.assertEqual(stored["location_name"], "Kanchanaburi")

    # -- idempotency --------------------------------------------------------
    def test_identical_republish_reuses_the_run_without_duplicates(self):
        first = publish(self.client, resource=self.resource, rows=[observation(), observation(observation_id="b")],
                        completeness="partial", coverage={"mode": "daily_full", "count": 2})
        queries_before = self.client.queries
        second = publish(self.client, resource=self.resource,
                         rows=[observation(), observation(observation_id="b")],
                         completeness="partial", coverage={"mode": "daily_full", "count": 2})

        self.assertEqual(first["run_id"], second["run_id"])
        self.assertEqual(second["skipped_identical"], 2)
        self.assertEqual(second["records_inserted"], 0)
        self.assertEqual(second["payload_sha256"], first["payload_sha256"])
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 2)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM sync_runs")["total"], 1)
        self.assertGreater(self.client.queries, queries_before)

    def test_explicit_run_id_is_honoured(self):
        result = publish(self.client, resource=self.resource, rows=[observation()],
                         completeness="partial", coverage={"mode": "daily_full", "count": 1},
                         run_id="11111111-1111-1111-1111-111111111111")
        self.assertEqual(result["run_id"], "11111111-1111-1111-1111-111111111111")

    def test_revised_payload_creates_a_new_run(self):
        first = publish(self.client, resource=self.resource, rows=[observation()],
                        completeness="partial", coverage={"mode": "daily_full", "count": 1})
        second = publish(self.client, resource=self.resource, rows=[observation(value=53.0)],
                         completeness="partial", coverage={"mode": "daily_full", "count": 1})
        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM sync_runs")["total"], 2)
        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], second["run_id"])

    # -- logical payload hash (defect D-2) ------------------------------------
    def test_rerun_of_same_logical_day_ignores_volatile_retrieved_at_and_revision(self):
        """D-2: per-row retrieved_at/revision_id churn must not mint new runs."""
        first = publish(self.client, resource=self.resource,
                        rows=[observation(), observation(observation_id="b")])
        later = "2026-10-26T09:00:00Z"
        late_revision = 'W/"etag-rid-2026-10-26-late"'
        second = publish(self.client, resource=self.resource,
                         rows=[observation(retrieved_at=later, revision_id=late_revision),
                               observation(observation_id="b", retrieved_at=later,
                                          revision_id=late_revision)],
                         retrieved_at=later)
        self.assertEqual(first["run_id"], second["run_id"])
        self.assertEqual(first["payload_sha256"], second["payload_sha256"])
        self.assertEqual(second["skipped_identical"], 2)
        self.assertEqual(second["records_inserted"], 0)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM sync_runs")["total"], 1)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 2)
        # The envelope still reports the freshly seen revision as-is.
        self.assertEqual(first["revision_id"], REVISION)
        self.assertEqual(second["revision_id"], late_revision)

    # -- activation guard (defect D-9) ---------------------------------------
    def test_mixed_null_units_for_one_measure_refuse_activation(self):
        rows = [observation(), observation(observation_id="rid-obs-null", unit=None)]
        result = publish(self.client, resource=self.resource, rows=rows, completeness="complete",
                         coverage={"mode": "daily_full", "count": 2})
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["activation_blocked_reason"], "UNIT_MIXED_NULL_BATCH")
        self.assertFalse(result["active_run_switched"])
        # Rows are written and kept; only activation is refused.
        self.assertEqual(result["records_written"], 2)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 2)
        run = self.client.one("SELECT status, error_code FROM sync_runs WHERE run_id=?", [result["run_id"]])
        self.assertEqual((run["status"], run["error_code"]), ("partial", "UNIT_MIXED_NULL_BATCH"))
        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertIsNone(active["active_run_id"])
        # Re-publishing the identical logical batch stays skipped_identical and
        # still does not activate.
        again = publish(self.client, resource=self.resource, rows=rows, completeness="complete",
                        coverage={"mode": "daily_full", "count": 2})
        self.assertEqual(again["run_id"], result["run_id"])
        self.assertFalse(again["active_run_switched"])
        self.assertEqual(again["activation_blocked_reason"], "UNIT_MIXED_NULL_BATCH")
        self.assertEqual(again["skipped_identical"], 2)

    def test_daily_grain_folds_intraday_observed_at_but_point_grain_keeps_instant(self):
        """D-2 refinement: a daily product is identified by its period day."""
        batch = "2026-10-26T12:00:00Z"
        client = SqliteD1Mock()
        register_resource(client, resource=registry_row(), source_name="RID",
                          base_url="https://app.rid.go.th")
        first = publish(client, resource=registry_row(),
                        rows=[observation(observed_at="2026-10-25T07:12:33Z", retrieved_at=batch)],
                        retrieved_at=batch, period_grain="daily")
        second = publish(client, resource=registry_row(),
                         rows=[observation(observed_at="2026-10-25T09:55:01Z", retrieved_at=batch)],
                         retrieved_at=batch, period_grain="daily")
        self.assertEqual(first["run_id"], second["run_id"])
        self.assertEqual(second["skipped_identical"], 1)
        self.assertEqual(client.one("SELECT count(*) AS total FROM observations")["total"], 1)
        # A different period day is a different logical batch.
        other_day = publish(client, resource=registry_row(),
                            rows=[observation(observed_at="2026-10-26T07:12:33Z", retrieved_at=batch)],
                            retrieved_at=batch, period_grain="daily")
        self.assertNotEqual(other_day["run_id"], first["run_id"])
        # Point-grain runs keep the exact instant: same row, different time -> new run.
        point_client = SqliteD1Mock()
        register_resource(point_client, resource=registry_row(), source_name="RID",
                          base_url="https://app.rid.go.th")
        p1 = publish(point_client, resource=registry_row(),
                     rows=[observation(observed_at="2026-10-25T07:12:33Z", retrieved_at=batch)],
                     retrieved_at=batch)
        p2 = publish(point_client, resource=registry_row(),
                     rows=[observation(observed_at="2026-10-25T09:55:01Z", retrieved_at=batch)],
                     retrieved_at=batch)
        self.assertNotEqual(p1["run_id"], p2["run_id"])

    def test_daily_period_uses_the_source_calendar_date_for_offset_midnight(self):
        batch = "2026-10-26T17:12:57Z"
        client = SqliteD1Mock()
        register_resource(client, resource=registry_row(), source_name="RID",
                          base_url="https://app.rid.go.th")
        result = publish(client, resource=registry_row(),
                         rows=[observation(observed_at="2026-10-27T00:00:00+07:00",
                                           retrieved_at=batch)],
                         retrieved_at=batch, period_grain="daily")
        stored = client.one(
            "SELECT period_start, period_end, period_label FROM observations WHERE run_id=?",
            [result["run_id"]])
        self.assertEqual(stored, {"period_start": "2026-10-27", "period_end": "2026-10-27",
                                  "period_label": "2026-10-27"})

    def test_daily_and_monthly_writers_remain_compatible_with_schema_0001_only(self):
        for grain, observed_at, expected_period in (
            ("daily", "2026-10-25T12:00:00Z", ("2026-10-25", "2026-10-25")),
            ("monthly", "2026-10-25T12:00:00Z", ("2026-10-01", "2026-10-31")),
        ):
            with self.subTest(grain=grain):
                client = SqliteD1Mock(
                    with_extensions=False,
                    with_source_year_snapshot=False,
                    with_source_year_writer_token=False,
                )
                result = publish(
                    client,
                    resource=registry_row(),
                    rows=[observation(observed_at=observed_at)],
                    completeness="complete",
                    unit="percent",
                    retrieved_at=RETRIEVED_AT,
                    period_grain=grain,
                )
                self.assertTrue(result["active_run_switched"])
                stored = client.one(
                    "SELECT period_start,period_end FROM observations WHERE run_id=?",
                    [result["run_id"]],
                )
                self.assertEqual((stored["period_start"], stored["period_end"]), expected_period)

    def test_all_null_unit_batch_still_activates_for_lane_d(self):
        """TMD intentionally publishes unit=NULL: no documented unit exists."""
        result = publish(self.client, resource=self.resource,
                         rows=[observation(unit=None), observation(observation_id="b", unit=None)])
        self.assertIsNone(result["activation_blocked_reason"])
        self.assertTrue(result["active_run_switched"])
        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], result["run_id"])

    def test_null_units_on_a_different_measure_do_not_block_activation(self):
        result = publish(self.client, resource=self.resource,
                         rows=[observation(), observation(observation_id="rid-obs-vol",
                                                          measure="reservoir_volume", unit=None)])
        self.assertIsNone(result["activation_blocked_reason"])
        self.assertTrue(result["active_run_switched"])

    # -- audit 2026-10-27 #1: backfills never move the active run backwards --
    def test_backfill_and_retry_never_move_the_active_run_backwards(self):
        day24 = publish(self.client, resource=self.resource,
                        rows=[observation(observation_id="rid-2026-10-24",
                                          observed_at="2026-10-24T00:00:00Z", value=24.0)],
                        completeness="complete")
        day25 = publish(self.client, resource=self.resource,
                        rows=[observation(observation_id="rid-2026-10-25",
                                          observed_at="2026-10-25T00:00:00Z", value=25.0)],
                        completeness="complete")
        self.assertEqual(self._active_run_id(), day25["run_id"])

        retry = publish(self.client, resource=self.resource,
                        rows=[observation(observation_id="rid-2026-10-24",
                                          observed_at="2026-10-24T00:00:00Z", value=24.0)],
                        completeness="complete")
        self.assertEqual(retry["run_id"], day24["run_id"])
        self.assertEqual(retry["skipped_identical"], 1)
        self.assertFalse(retry["active_run_switched"])
        self.assertEqual(retry["active_run_blocked_reason"], "ACTIVE_RUN_OLDER_THAN_ACTIVE")
        self.assertEqual(self._active_run_id(), day25["run_id"])

        backfill = publish(self.client, resource=self.resource,
                           rows=[observation(observation_id="rid-2026-10-23",
                                             observed_at="2026-10-23T00:00:00Z", value=23.0)],
                           completeness="complete")
        self.assertEqual(backfill["status"], "succeeded")
        self.assertFalse(backfill["active_run_switched"])
        self.assertEqual(backfill["active_run_blocked_reason"], "ACTIVE_RUN_OLDER_THAN_ACTIVE")
        self.assertEqual(self._active_run_id(), day25["run_id"])

        active = self.client.one(
            "SELECT o.period_start, o.value FROM observations o JOIN resources r "
            "ON r.resource_id=o.resource_id AND r.active_run_id=o.run_id")
        self.assertEqual((active["period_start"], active["value"]), ("2026-10-25", 25.0))
        # Historical runs keep their rows: only the pointer is guarded.
        for run_id, day in ((day24["run_id"], "2026-10-24"), (backfill["run_id"], "2026-10-23")):
            stored = self.client.one(
                "SELECT period_start FROM observations WHERE resource_id=? AND run_id=?",
                [RESOURCE_ID, run_id])
            self.assertEqual(stored["period_start"], day)

    def test_interleaved_newer_publish_blocks_an_older_activation(self):
        client = ActivationHookClient()
        register_resource(client, resource=registry_row(), source_name="RID",
                          base_url="https://app.rid.go.th")
        publish(client, resource=registry_row(), rows=[observation(
            observation_id="rid-2026-10-24", observed_at="2026-10-24T00:00:00Z", value=24.0)],
            completeness="complete")
        day25 = publish(client, resource=registry_row(), rows=[observation(
            observation_id="rid-2026-10-25", observed_at="2026-10-25T00:00:00Z", value=25.0)],
            completeness="complete")
        newer = {}

        def other_job():
            newer["result"] = publish(client, resource=registry_row(), rows=[observation(
                observation_id="rid-2026-10-26", observed_at="2026-10-26T00:00:00Z", value=26.0)],
                completeness="complete")

        client.before_activation = other_job
        backfill = publish(client, resource=registry_row(), rows=[observation(
            observation_id="rid-2026-10-23", observed_at="2026-10-23T00:00:00Z", value=23.0)],
            completeness="complete")

        self.assertTrue(newer["result"]["active_run_switched"])
        self.assertNotEqual(newer["result"]["run_id"], day25["run_id"])
        self.assertEqual(backfill["status"], "succeeded")
        self.assertFalse(backfill["active_run_switched"])
        self.assertEqual(backfill["active_run_blocked_reason"], "ACTIVE_RUN_OLDER_THAN_ACTIVE")
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], newer["result"]["run_id"])
        self.assertEqual(client.one("SELECT count(*) AS total FROM observations WHERE run_id=?",
                                    [backfill["run_id"]])["total"], 1)

    # -- audit 2026-10-27 #4: durable semantic changes mint a new run --------
    def test_corrected_dimensions_mint_a_new_run_and_replace_the_active_rows(self):
        first = publish(self.client, resource=self.resource, rows=[observation()],
                        completeness="complete",
                        dimensions_for=lambda o: {"provinceCode": "73"})
        second = publish(self.client, resource=self.resource, rows=[observation()],
                         completeness="complete",
                         dimensions_for=lambda o: {"provinceCode": "10"})

        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertEqual(second["skipped_identical"], 0)
        self.assertTrue(second["active_run_switched"])
        active = self.client.one(
            "SELECT o.dimensions FROM observations o JOIN resources r "
            "ON r.resource_id=o.resource_id AND r.active_run_id=o.run_id")
        self.assertEqual(json.loads(active["dimensions"])["provinceCode"], "10")
        previous = self.client.one("SELECT dimensions FROM observations WHERE run_id=?",
                                   [first["run_id"]])
        self.assertEqual(json.loads(previous["dimensions"])["provinceCode"], "73")

    def test_semantic_field_changes_are_never_silently_skipped(self):
        base = dict(observation_id="rid-price-1", spatial_support="province", area_code="10",
                    location_id="th:province:10", measure="price", unit="THB/kg",
                    price_type="wholesale", commodity_id="rice:paddy", market_id="market-a",
                    grade="A")
        cases = (
            ("area_code", {"area_code": "73", "location_id": "th:province:73"}),
            ("commodity_id", {"commodity_id": "rice:white"}),
            ("market_id", {"market_id": "market-b"}),
            ("grade", {"grade": "B"}),
        )
        for label, change in cases:
            with self.subTest(label):
                client = SqliteD1Mock()
                register_resource(client, resource=registry_row(), source_name="RID",
                                  base_url="https://app.rid.go.th")
                before = publish(client, resource=registry_row(), rows=[observation(**base)],
                                 completeness="complete")
                after = publish(client, resource=registry_row(),
                                rows=[observation(**{**base, **change})], completeness="complete")
                self.assertNotEqual(before["run_id"], after["run_id"])
                self.assertTrue(after["active_run_switched"])
                active = client.one(
                    "SELECT o.province_code, o.market, o.grade, o.dimensions "
                    "FROM observations o JOIN resources r "
                    "ON r.resource_id=o.resource_id AND r.active_run_id=o.run_id")
                dimensions = json.loads(active["dimensions"])
                self.assertEqual(active["province_code"], "73" if label == "area_code" else "10")
                self.assertEqual(dimensions["commodityId"],
                                 "rice:white" if label == "commodity_id" else "rice:paddy")
                self.assertEqual(active["market"], "market-b" if label == "market_id" else "market-a")
                self.assertEqual(active["grade"], "B" if label == "grade" else "A")

    def test_volatile_dimension_timestamps_stay_idempotent(self):
        first = publish(self.client, resource=self.resource, rows=[observation()],
                        dimensions_for=lambda o: {"areaCode": "10",
                                                  "sourceTimeStamp": "2026-10-27T01:00:00Z"})
        second = publish(self.client, resource=self.resource, rows=[observation()],
                         dimensions_for=lambda o: {"areaCode": "10",
                                                   "sourceTimeStamp": "2026-10-27T02:30:00Z"})
        self.assertEqual(first["run_id"], second["run_id"])
        self.assertEqual(second["skipped_identical"], 1)
        # The default dimensions echo releaseAt; provider release churn is volatile too.
        third = publish(self.client, resource=self.resource,
                        rows=[observation(release_at="2026-10-26T00:00:00Z")])
        fourth = publish(self.client, resource=self.resource,
                         rows=[observation(release_at="2026-10-26T01:00:00Z")])
        self.assertEqual(third["run_id"], fourth["run_id"])
        self.assertEqual(fourth["skipped_identical"], 1)

    def _active_run_id(self):
        row = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                              [RESOURCE_ID])
        return row["active_run_id"] if row else None

    # -- failure handling ---------------------------------------------------
    def test_failed_run_is_marked_failed_and_keeps_the_previous_active_run(self):
        first = publish(self.client, resource=self.resource, rows=[observation()],
                        completeness="partial", coverage={"mode": "daily_full", "count": 1})
        self.client.fail_after_observations = self.client.observation_writes + 1

        with self.assertRaises(ObservationWriteError) as caught:
            publish(self.client, resource=self.resource,
                    rows=[observation(observation_id="x1"), observation(observation_id="x2",
                                                                        location_id="rid:reservoir:X2")],
                    completeness="complete", coverage={"mode": "daily_full", "count": 2})
        self.assertEqual(caught.exception.code, "NUMERIC_WRITE_FAILED")

        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], first["run_id"])
        failed = self.client.one(
            "SELECT status FROM sync_runs WHERE run_id!=? ORDER BY started_at DESC LIMIT 1",
            [first["run_id"]])
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations WHERE run_id=?",
                                         [first["run_id"]])["total"], 1)

    def test_d1_revocation_blocks_publication_without_writes(self):
        first = publish(self.client, resource=self.resource, rows=[observation()],
                        completeness="partial", coverage={"mode": "daily_full", "count": 1})
        self.client.execute(
            "UPDATE resources SET access_status='restricted', project_publication_approved=0 "
            "WHERE resource_id=?", [RESOURCE_ID])
        runs_before = self.client.one("SELECT count(*) AS total FROM sync_runs")["total"]
        writes_before = self.client.observation_writes

        with self.assertRaises(ObservationWriteError) as caught:
            publish(self.client, resource=self.resource, rows=[observation(observation_id="later")],
                    completeness="partial", coverage={"mode": "daily_full", "count": 1})
        self.assertEqual(caught.exception.code, "RESOURCE_PUBLICATION_NOT_APPROVED")
        self.assertEqual(self.client.observation_writes, writes_before)
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM sync_runs")["total"], runs_before)
        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], first["run_id"])

    # -- registration -------------------------------------------------------
    def test_publish_registers_the_catalog_rows_the_adapter_declares(self):
        client = SqliteD1Mock()
        result = publish(
            client, resource=registry_row(), rows=[observation()],
            completeness="partial", coverage={"mode": "daily_full", "count": 1},
            catalog={"source_name": "Royal Irrigation Department", "base_url": "https://app.rid.go.th",
                     "dataset_id": DATASET_ID, "dataset_title": "RID reservoir daily report",
                     "dataset_category": "water", "resource_format": "JSON",
                     "grain": "reservoir x UTC date"},
        )
        source = client.one("SELECT * FROM sources WHERE source_id=?", [SOURCE_ID])
        dataset = client.one("SELECT * FROM datasets WHERE dataset_id=?", [DATASET_ID])
        resource = client.one("SELECT * FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual((source["source_name"], source["status"]),
                         ("Royal Irrigation Department", "enabled"))
        self.assertEqual(dataset["category"], "water")
        self.assertEqual((resource["access_status"], resource["project_publication_approved"]),
                         ("approved_public", 1))
        self.assertEqual(resource["format"], "JSON")
        self.assertEqual(resource["grain"], "reservoir x UTC date")
        self.assertEqual(client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                    [RESOURCE_ID])["active_run_id"], result["run_id"])

    def test_registration_never_overwrites_a_revoked_resource_row(self):
        client = SqliteD1Mock()
        publish(client, resource=registry_row(), rows=[observation()],
                catalog={"source_name": "RID", "base_url": "https://app.rid.go.th"})
        client.execute(
            "UPDATE resources SET access_status='restricted', project_publication_approved=0 "
            "WHERE resource_id=?", [RESOURCE_ID])
        register_resource(client, resource=registry_row(), source_name="RID",
                          base_url="https://app.rid.go.th")
        resource = client.one("SELECT access_status, project_publication_approved FROM resources "
                              "WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual((resource["access_status"], resource["project_publication_approved"]),
                         ("restricted", 0))

    def test_register_resource_refuses_unapproved_rows(self):
        with self.assertRaises(ObservationWriteError) as caught:
            register_resource(SqliteD1Mock(), resource=dict(registry_row(), license_status="pending"),
                              source_name="RID", base_url="https://app.rid.go.th")
        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")

    def test_assert_resource_approved_returns_the_row_when_clean(self):
        resource = registry_row()
        self.assertIs(assert_resource_approved(resource), resource)

    # -- optional migration -------------------------------------------------
    def test_extension_columns_are_populated_when_the_migration_is_applied(self):
        client = SqliteD1Mock(with_extensions=True)
        register_resource(client, resource=registry_row(), source_name="RID",
                          base_url="https://app.rid.go.th")
        result = publish(client, resource=registry_row(), rows=[observation()],
                         completeness="partial", coverage={"mode": "daily_full", "count": 1})
        stored = client.one(
            "SELECT data_kind, quality_flag, license_status, source_url, release_at, revision_id "
            "FROM observations WHERE run_id=?", [result["run_id"]])
        self.assertEqual(stored["data_kind"], "observed")
        self.assertEqual(stored["quality_flag"], "good")
        self.assertEqual(stored["license_status"], "approved_public")
        self.assertEqual(stored["source_url"], "https://app.rid.go.th/reservoir/api/reservoir/public")
        self.assertIsNone(stored["release_at"])
        self.assertEqual(stored["revision_id"], REVISION)

    def test_writer_still_works_without_the_extension_migration(self):
        client = SqliteD1Mock()
        register_resource(client, resource=registry_row(), source_name="RID",
                          base_url="https://app.rid.go.th")
        result = publish(client, resource=registry_row(), rows=[observation()],
                         completeness="partial", coverage={"mode": "daily_full", "count": 1})
        self.assertEqual(result["records_written"], 1)

    def test_simultaneous_identical_run_insert_is_reread_and_reused(self):
        rows = [observation()]
        inner_results = []
        self.client.before_run_insert = lambda: inner_results.append(
            publish(self.client, resource=self.resource, rows=rows,
                    completeness="complete", coverage={"mode": "daily_full", "count": 1})
        )

        outer = publish(self.client, resource=self.resource, rows=rows,
                         completeness="complete", coverage={"mode": "daily_full", "count": 1})

        self.assertEqual(len(inner_results), 1)
        self.assertEqual(outer["run_id"], inner_results[0]["run_id"])
        self.assertEqual(outer["status"], "succeeded")
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations")["total"], 1)


class IngestAdapterCliTests(unittest.TestCase):
    """``tadih ingest --adapter`` dispatches to the lane module contract."""

    def tearDown(self):
        for name in ("tadih.ingest_fake_d1",):
            sys.modules.pop(name, None)

    def test_missing_adapter_reports_clear_error_and_nonzero_exit(self):
        errors = _capture_stderr(lambda: cli_main(["ingest", "--adapter", "doesnotexist"]))
        self.assertEqual(errors["code"], 2)
        self.assertEqual(errors["payload"]["errorCode"], "ADAPTER_NOT_FOUND")
        self.assertIn("tadih.ingest_doesnotexist_d1", errors["payload"]["message"])

    def test_adapter_main_receives_the_documented_flags(self):
        seen = {}
        module = types.ModuleType("tadih.ingest_fake_d1")

        def main(argv, *, client=None):
            seen["argv"] = list(argv)
            seen["client"] = client
            return 0

        module.main = main
        sys.modules["tadih.ingest_fake_d1"] = module
        exit_code = cli_main(["ingest", "--adapter", "fake", "--date", "2026-10-25", "--", "--limit", "5"])
        self.assertEqual(exit_code, 0)
        self.assertEqual(seen["argv"], ["--dry-run", "--date", "2026-10-25", "--limit", "5"])
        self.assertIsNone(seen["client"])

    def test_write_mode_passes_the_d1_client_and_exit_code(self):
        seen = {}
        module = types.ModuleType("tadih.ingest_fake_d1")

        def main(argv, *, client=None):
            seen.update({"argv": list(argv), "client": client})
            return 3

        module.main = main
        sys.modules["tadih.ingest_fake_d1"] = module
        sentinel = object()
        with _patched_d1_client(sentinel):
            exit_code = cli_main(["ingest", "--adapter", "fake", "--write"])
        self.assertEqual(exit_code, 3)
        self.assertEqual(seen["argv"], ["--write"])
        self.assertIs(seen["client"], sentinel)

    def test_invalid_date_and_conflicting_flags_are_rejected(self):
        payload = _capture_stderr(lambda: cli_main(["ingest", "--adapter", "fake", "--date", "25/10/2026"]))
        self.assertEqual(payload["payload"]["errorCode"], "ADAPTER_DATE_INVALID")
        payload = _capture_stderr(
            lambda: cli_main(["ingest", "--adapter", "fake", "--dry-run", "--write"]))
        self.assertEqual(payload["payload"]["errorCode"], "ADAPTER_FLAGS_CONFLICT")


class AdapterPublishIntegrationTests(unittest.TestCase):
    """A lane-shaped adapter publishes through the shared writer."""

    def tearDown(self):
        SqliteD1Mock.close_all()

    def test_adapter_envelope_round_trip(self):
        client = SqliteD1Mock()
        resource = registry_row()
        register_resource(client, resource=resource, source_name="RID", base_url="https://app.rid.go.th")
        envelope = publish(client, resource=resource,
                           rows=[observation(), observation(observation_id="rid-obs-2",
                                                            location_id="rid:reservoir:R2")],
                           completeness="partial", coverage={"mode": "daily_full", "count": 2})
        for key in ("run_id", "status", "records_read", "records_written", "coverage",
                    "completeness", "payload_sha256", "skipped_identical", "active_run_switched",
                    "resource_id", "source_id", "revision_id", "adapter_version"):
            self.assertIn(key, envelope)
        self.assertEqual(client.one("SELECT count(*) AS total FROM observations")["total"], 2)


class SourceYearLabelObservationTests(unittest.TestCase):
    def test_source_year_label_contract_keeps_year_without_inventing_a_date(self):
        row = dld_cattle_observation()
        validated = validate_observation(row)
        self.assertIsNone(validated["observed_at"])
        self.assertEqual(validated["source_year_be"], 2564)
        self.assertEqual(validated["source_row_id"], "123")

    def test_source_year_label_requires_exclusive_year_and_null_observed_at(self):
        cases = (
            dld_cattle_observation(observed_at="2021-01-01T00:00:00Z"),
            dld_cattle_observation(source_year_be=None),
            dld_cattle_observation(source_year_be="2564"),
            dld_cattle_observation(source_year_be=2399),
            dld_cattle_observation(source_year_be=10000),
        )
        for row in cases:
            with self.subTest(row=row):
                with self.assertRaises(ValueError):
                    validate_observation(row)

    def test_json_contract_enforces_year_label_and_null_date_as_a_pair(self):
        schema = json.loads((ROOT / "data_contracts/observation.schema.json").read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        validator.validate(dld_cattle_observation())
        with self.assertRaises(ValidationError):
            validator.validate(dld_cattle_observation(source_year_be=None))
        with self.assertRaises(ValidationError):
            validator.validate(dld_cattle_observation(observed_at="2021-01-01T00:00:00Z"))
        with self.assertRaises(ValidationError):
            validator.validate(dld_cattle_observation(source_year_be=10000))


class SourceYearLabelPublisherTests(unittest.TestCase):
    def setUp(self):
        self.client = SqliteD1Mock()
        self.resource = dld_registry_row()
        register_resource(self.client, resource=self.resource, source_name="Department of Livestock Development",
                          base_url="https://dld.gdcatalog.go.th", category="livestock",
                          grain="province x source-year label")

    def tearDown(self):
        SqliteD1Mock.close_all()

    def publish_years(self, rows, *, retrieved_at=RETRIEVED_AT, completeness="complete", **kwargs):
        return publish(
            self.client, resource=self.resource, rows=rows, retrieved_at=retrieved_at,
            completeness=completeness, coverage={"mode": "source_response", "count": len(rows)},
            unit="ตัว", period_grain="source_year_label", **kwargs,
        )

    def test_source_year_writer_requires_snapshot_revision_migration_before_writes(self):
        client = SqliteD1Mock(with_source_year_snapshot=False)
        with self.assertRaises(ObservationWriteError) as caught:
            publish(client, resource=dld_registry_row(), rows=[dld_cattle_observation()],
                    completeness="complete", coverage={"mode": "source_response", "count": 1},
                    unit="ตัว", period_grain="source_year_label")
        self.assertEqual(caught.exception.code, "SOURCE_YEAR_SNAPSHOT_SCHEMA_REQUIRED")
        self.assertEqual(client.one("SELECT count(*) AS total FROM resources")["total"], 0)
        self.assertEqual(client.one("SELECT count(*) AS total FROM sync_runs")["total"], 0)
        self.assertEqual(client.one("SELECT count(*) AS total FROM observations")["total"], 0)

    def test_source_year_writer_requires_unique_owner_token_migration_before_writes(self):
        client = SqliteD1Mock(with_source_year_writer_token=False)
        with self.assertRaises(ObservationWriteError) as caught:
            publish(client, resource=dld_registry_row(), rows=[dld_cattle_observation()],
                    completeness="complete", coverage={"mode": "source_response", "count": 1},
                    unit="ตัว", period_grain="source_year_label")
        self.assertEqual(caught.exception.code, "SOURCE_YEAR_WRITER_TOKEN_SCHEMA_REQUIRED")
        self.assertEqual(client.one("SELECT count(*) AS total FROM resources")["total"], 0)
        self.assertEqual(client.one("SELECT count(*) AS total FROM sync_runs")["total"], 0)
        self.assertEqual(client.one("SELECT count(*) AS total FROM observations")["total"], 0)

    def test_source_year_rows_store_null_dates_source_label_and_native_row_reference(self):
        result = self.publish_years([dld_cattle_observation()])
        row = self.client.one("SELECT period_start, period_end, period_label, source_row_ref, dimensions "
                              "FROM observations WHERE run_id=?", [result["run_id"]])
        self.assertIsNone(row["period_start"])
        self.assertIsNone(row["period_end"])
        self.assertEqual(row["period_label"], "พ.ศ. 2564")
        self.assertEqual(row["source_row_ref"], "123")
        self.assertEqual(json.loads(row["dimensions"])["sourceYearBe"], 2564)
        self.assertTrue(result["active_run_switched"])

    def test_conflicting_source_year_location_identity_fails_before_mutation(self):
        first = dld_cattle_observation()
        same_id_conflict = dld_cattle_observation(area_code="11", source_row_id="124")
        same_id_conflict["location_id"] = first["location_id"]
        separate_key_rows = [first, dld_cattle_observation(area_code="11", source_row_id="124")]
        conflicting_overrides = {
            "dld:province:10": {
                "kind": "province", "nativeCode": "shared-code", "name": "Province 10",
                "provinceCode": "10",
            },
            "dld:province:11": {
                "kind": "province", "nativeCode": "shared-code", "name": "Province 11",
                "provinceCode": "11",
            },
        }

        for label, rows, locations in (
            ("location id maps to conflicting metadata", [first, same_id_conflict], None),
            ("natural key maps to different location ids", separate_key_rows, conflicting_overrides),
        ):
            with self.subTest(label=label):
                before_queries = self.client.queries
                before_statements = len(self.client.statements)
                before = {
                    table: self.client.one(f"SELECT count(*) AS n FROM {table}")["n"]
                    for table in ("sources", "datasets", "resources", "sync_runs", "locations", "observations")
                }
                with self.assertRaises(ObservationWriteError) as caught:
                    self.publish_years(rows, locations=locations)

                self.assertEqual(caught.exception.code, "SOURCE_YEAR_LOCATION_CONFLICT")
                self.assertEqual(self.client.queries, before_queries)
                self.assertEqual(len(self.client.statements), before_statements)
                self.assertEqual({
                    table: self.client.one(f"SELECT count(*) AS n FROM {table}")["n"]
                    for table in before
                }, before)

    def test_source_year_location_owner_guard_rejects_takeover_before_first_location(self):
        def take_ownership():
            self.client.db.execute(
                "UPDATE sync_runs SET source_year_writer_token='new-owner' WHERE resource_id=?",
                [self.resource["resource_id"]],
            )
            self.client.db.commit()

        self.client.before_location_upsert = take_ownership
        with self.assertRaises(ObservationWriteError) as caught:
            self.publish_years([dld_cattle_observation()])

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_RUN_OWNERSHIP_LOST")
        self.assertEqual(self.client.one("SELECT count(*) AS n FROM locations")["n"], 0)
        self.assertEqual(self.client.one("SELECT count(*) AS n FROM observations")["n"], 0)

    def test_source_year_location_owner_guard_rejects_takeover_between_locations(self):
        def take_ownership():
            self.client.db.execute(
                "UPDATE sync_runs SET source_year_writer_token='new-owner' WHERE resource_id=?",
                [self.resource["resource_id"]],
            )
            self.client.db.commit()

        self.client.before_location_upsert_at = 2
        self.client.before_location_upsert = take_ownership
        rows = [dld_cattle_observation(), dld_cattle_observation(area_code="11", source_row_id="124")]
        with self.assertRaises(ObservationWriteError) as caught:
            self.publish_years(rows)

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_RUN_OWNERSHIP_LOST")
        self.assertEqual(self.client.one("SELECT count(*) AS n FROM locations")["n"], 1)
        self.assertEqual(self.client.one("SELECT count(*) AS n FROM observations")["n"], 1)
        self.assertIsNone(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                          [self.resource["resource_id"]])["active_run_id"])

    def test_source_year_location_identity_inserted_before_upsert_is_not_mutated(self):
        legacy_location = {
            "location_id": "legacy:dld:province:10",
            "source_id": "dld",
            "kind": "province",
            "native_code": "10",
            "name": "Legacy location name",
            "province_code": "99",
        }

        def insert_legacy_location():
            self.client.db.execute(
                "INSERT INTO locations (location_id,source_id,kind,native_code,name,province_code) "
                "VALUES (?,?,?,?,?,?)",
                list(legacy_location.values()),
            )
            self.client.db.commit()

        self.client.before_location_upsert = insert_legacy_location
        location_override = {
            "dld:province:10": {
                "kind": "province", "nativeCode": "10", "name": "กรุงเทพมหานคร",
                "provinceCode": "10",
            },
        }
        with self.assertRaises(ObservationWriteError) as caught:
            self.publish_years([dld_cattle_observation()], locations=location_override)

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_LOCATION_IDENTITY_CONFLICT")
        self.assertEqual(self.client.one(
            "SELECT location_id,source_id,kind,native_code,name,province_code FROM locations "
            "WHERE source_id='dld' AND kind='province' AND native_code='10'",
        ), legacy_location)
        self.assertEqual(self.client.one("SELECT count(*) AS n FROM observations")["n"], 0)
        self.assertIsNone(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                          [self.resource["resource_id"]])["active_run_id"])

    def test_source_year_location_id_already_bound_to_another_natural_key_fails_closed(self):
        legacy_location = {
            "location_id": "dld:province:10",
            "source_id": "dld",
            "kind": "province",
            "native_code": "legacy-native-code",
            "name": "Legacy location name",
            "province_code": "99",
        }
        self.client.execute(
            "INSERT INTO locations (location_id,source_id,kind,native_code,name,province_code) "
            "VALUES (?,?,?,?,?,?)",
            list(legacy_location.values()),
        )
        location_override = {
            "dld:province:10": {
                "kind": "province", "nativeCode": "10", "name": "กรุงเทพมหานคร",
                "provinceCode": "10",
            },
        }

        with self.assertRaises(ObservationWriteError) as caught:
            self.publish_years([dld_cattle_observation()], locations=location_override)

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_LOCATION_IDENTITY_CONFLICT")
        self.assertEqual(self.client.one(
            "SELECT location_id,source_id,kind,native_code,name,province_code FROM locations "
            "WHERE location_id='dld:province:10'",
        ), legacy_location)
        self.assertEqual(self.client.one("SELECT count(*) AS n FROM observations")["n"], 0)

    def test_partial_source_year_batch_is_stored_but_never_activated(self):
        result = self.publish_years([dld_cattle_observation()], completeness="partial")
        self.assertFalse(result["active_run_switched"])
        self.assertEqual(result["active_run_blocked_reason"], "SOURCE_YEAR_BATCH_INCOMPLETE")
        run = self.client.one("SELECT status, error_code FROM sync_runs WHERE run_id=?", [result["run_id"]])
        self.assertEqual((run["status"], run["error_code"]), ("partial", "SOURCE_YEAR_BATCH_INCOMPLETE"))
        self.assertIsNone(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                          [self.resource["resource_id"]])["active_run_id"])

    def test_source_rowset_shrink_fails_closed_until_review_matches_both_snapshots(self):
        baseline = [dld_cattle_observation(), dld_cattle_observation(area_code="11", source_row_id="124")]
        first = self.publish_years(baseline, retrieved_at="2026-10-26T03:00:00Z")
        prior_hash = self.client.one("SELECT payload_sha256 FROM sync_runs WHERE run_id=?", [first["run_id"]])[
            "payload_sha256"]
        removed = [baseline[0]]
        blocked = self.publish_years(removed, retrieved_at="2026-10-27T03:00:00Z")
        self.assertFalse(blocked["active_run_switched"])
        self.assertEqual(blocked["active_run_blocked_reason"], "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")
        self.assertEqual(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                         [self.resource["resource_id"]])["active_run_id"], first["run_id"])
        self.assertEqual(self.client.one("SELECT status, error_code FROM sync_runs WHERE run_id=?",
                                         [blocked["run_id"]]),
                         {"status": "partial", "error_code": "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW"})

        review = {
            "reviewed_by": "data-governance",
            "reviewed_at": "2026-10-28T02:00:00Z",
            "reason": "DLD confirmed the removed source row was withdrawn.",
            "source_revision_id": blocked["revision_id"],
            "active_payload_sha256": prior_hash,
            "candidate_payload_sha256": blocked["payload_sha256"],
        }
        stale_review = dict(review, active_payload_sha256="0" * 64)
        rejected_review = self.publish_years(
            removed, retrieved_at="2026-10-27T03:00:00Z",
            source_year_rowset_change_review=stale_review,
        )
        self.assertFalse(rejected_review["active_run_switched"])
        self.assertEqual(rejected_review["active_run_blocked_reason"], "SOURCE_YEAR_ROWSET_REVIEW_STALE")
        self.assertEqual(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                         [self.resource["resource_id"]])["active_run_id"], first["run_id"])
        accepted = self.publish_years(removed, retrieved_at="2026-10-27T03:00:00Z",
                                      source_year_rowset_change_review=review)
        self.assertTrue(accepted["active_run_switched"])
        self.assertIsNone(accepted["active_run_blocked_reason"])
        stored_resource = self.client.one("SELECT active_run_id, metadata FROM resources WHERE resource_id=?",
                                          [self.resource["resource_id"]])
        self.assertEqual(stored_resource["active_run_id"], blocked["run_id"])
        metadata = json.loads(stored_resource["metadata"])
        self.assertEqual(metadata["sourceYearRowsetChangeReviews"][-1], review)

    def test_source_year_pointer_blocks_backfill_and_stale_interleaving(self):
        newest = self.publish_years([dld_cattle_observation(source_year_be=2568)],
                                    retrieved_at="2026-10-27T03:00:00Z")
        backfill = self.publish_years([dld_cattle_observation(source_year_be=2567)],
                                      retrieved_at="2026-10-28T03:00:00Z")
        self.assertFalse(backfill["active_run_switched"])
        self.assertEqual(backfill["active_run_blocked_reason"], "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")
        self.assertEqual(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                         [self.resource["resource_id"]])["active_run_id"], newest["run_id"])

    def test_review_can_authorize_complete_snapshot_removing_the_latest_source_year(self):
        baseline = [
            dld_cattle_observation(source_year_be=2567, value=15000),
            dld_cattle_observation(source_year_be=2568, value=16000),
        ]
        first = self.publish_years(baseline, retrieved_at="2026-10-26T03:00:00Z")
        active_hash = self.client.one("SELECT payload_sha256 FROM sync_runs WHERE run_id=?",
                                      [first["run_id"]])["payload_sha256"]
        candidate = [baseline[0]]
        blocked = self.publish_years(candidate, retrieved_at="2026-10-27T03:00:00Z")
        self.assertFalse(blocked["active_run_switched"])
        self.assertEqual(blocked["active_run_blocked_reason"], "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW")
        review = {
            "reviewed_by": "data-governance",
            "reviewed_at": "2026-10-28T02:00:00Z",
            "reason": "DLD confirmed the latest source-year rows were withdrawn.",
            "source_revision_id": blocked["revision_id"],
            "active_payload_sha256": active_hash,
            "candidate_payload_sha256": blocked["payload_sha256"],
        }
        accepted = self.publish_years(candidate, retrieved_at="2026-10-27T03:00:00Z",
                                      source_year_rowset_change_review=review)
        self.assertTrue(accepted["active_run_switched"])
        self.assertEqual(accepted["status"], "succeeded")
        self.assertEqual(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                         [self.resource["resource_id"]])["active_run_id"], blocked["run_id"])
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations WHERE run_id=? AND "
                                         "json_extract(dimensions,'$.sourceYearBe')=2568",
                                         [blocked["run_id"]])["total"], 0)

    def test_source_revision_change_uses_immutable_run_and_identical_replay_preserves_provenance(self):
        first = self.publish_years([dld_cattle_observation()],
                                   retrieved_at="2026-10-26T03:00:00Z")
        first_run_id = first["run_id"]
        revised = self.publish_years(
            [dld_cattle_observation(retrieved_at="2026-10-28T03:00:00Z",
                                    revision_id="dld-revision-2564-v2")],
            retrieved_at="2026-10-28T03:00:00Z",
        )
        self.assertNotEqual(revised["run_id"], first_run_id)
        self.assertTrue(revised["active_run_switched"])
        self.assertEqual(revised["payload_sha256"], first["payload_sha256"])
        first_run = self.client.one("SELECT source_retrieved_at, source_revision_id, status FROM sync_runs "
                                    "WHERE run_id=?", [first_run_id])
        self.assertEqual(first_run, {"source_retrieved_at": "2026-10-26T03:00:00Z",
                                     "source_revision_id": "dld-revision-2564-v1", "status": "succeeded"})
        first_row = self.client.one("SELECT quality FROM observations WHERE run_id=?", [first_run_id])
        self.assertEqual(json.loads(first_row["quality"])["revisionId"], "dld-revision-2564-v1")
        revised_run = self.client.one("SELECT source_retrieved_at, source_revision_id, status FROM sync_runs "
                                      "WHERE run_id=?", [revised["run_id"]])
        self.assertEqual(revised_run, {"source_retrieved_at": "2026-10-28T03:00:00Z",
                                       "source_revision_id": "dld-revision-2564-v2", "status": "succeeded"})
        revised_row = self.client.one("SELECT quality FROM observations WHERE run_id=?", [revised["run_id"]])
        self.assertEqual(json.loads(revised_row["quality"])["revisionId"], "dld-revision-2564-v2")

        replay = self.publish_years(
            [dld_cattle_observation(retrieved_at="2026-10-29T03:00:00Z",
                                    revision_id="dld-revision-2564-v2")],
            retrieved_at="2026-10-29T03:00:00Z",
        )
        self.assertEqual(replay["run_id"], revised["run_id"])
        self.assertEqual(replay["skipped_identical"], 1)
        self.assertFalse(replay["source_snapshot_updated"])
        self.assertTrue(replay["source_snapshot_accepted"])
        self.assertEqual(replay["source_snapshot_retrieved_at"], "2026-10-28T03:00:00Z")
        self.assertIsNotNone(replay["verification_at"])

        stale = self.publish_years(
            [dld_cattle_observation(retrieved_at="2026-10-27T03:00:00Z")],
            retrieved_at="2026-10-27T03:00:00Z",
        )
        self.assertEqual(stale["run_id"], first_run_id)
        self.assertFalse(stale["source_snapshot_updated"])
        self.assertEqual(stale["active_run_blocked_reason"], "SOURCE_YEAR_SNAPSHOT_NOT_NEWER")
        self.assertEqual(stale["status"], "succeeded")
        self.assertEqual(stale["source_snapshot_retrieved_at"], "2026-10-26T03:00:00Z")
        self.assertEqual(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                         [self.resource["resource_id"]])["active_run_id"], revised["run_id"])
        self.assertEqual(self.client.one("SELECT source_retrieved_at, source_revision_id FROM sync_runs "
                                         "WHERE run_id=?", [first_run_id]),
                         {"source_retrieved_at": "2026-10-26T03:00:00Z",
                          "source_revision_id": "dld-revision-2564-v1"})
        self.assertEqual(self.client.one("SELECT status FROM sync_runs WHERE run_id=?",
                                         [first_run_id])["status"], "succeeded")

    def test_failed_new_snapshot_stays_invisible_and_retry_activates_complete_run(self):
        first = self.publish_years(
            [dld_cattle_observation(value=14523),
             dld_cattle_observation(area_code="11", source_row_id="124", value=18000)],
            retrieved_at="2026-10-26T03:00:00Z",
        )
        revised_rows = [dld_cattle_observation(value=15000, revision_id="dld-revision-2564-v2"),
                        dld_cattle_observation(area_code="11", source_row_id="124", value=19000,
                                               revision_id="dld-revision-2564-v2")]
        writes_before = self.client.observation_writes
        self.client.fail_after_observations = writes_before + 1
        with self.assertRaises(ObservationWriteError) as caught:
            self.publish_years(revised_rows, retrieved_at="2026-10-28T03:00:00Z")
        self.assertEqual(caught.exception.code, "NUMERIC_WRITE_FAILED")
        active = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                 [self.resource["resource_id"]])["active_run_id"]
        self.assertEqual(active, first["run_id"])
        active_rows = self.client.rows("SELECT o.value,o.quality FROM observations o "
                                       "JOIN resources r ON r.active_run_id=o.run_id "
                                       "WHERE r.resource_id=? ORDER BY o.row_key",
                                       [self.resource["resource_id"]])
        self.assertEqual([row["value"] for row in active_rows], [14523, 18000])
        failed = self.client.one("SELECT run_id,status,source_year_writer_token FROM sync_runs WHERE run_id<>? "
                                 "ORDER BY started_at DESC LIMIT 1", [first["run_id"]])
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations WHERE run_id=?",
                                         [failed["run_id"]])["total"], 1)

        self.client.fail_after_observations = None
        retry = self.publish_years(revised_rows, retrieved_at="2026-10-28T03:00:00Z")
        self.assertEqual(retry["run_id"], failed["run_id"])
        self.assertTrue(retry["active_run_switched"])
        retry_run = self.client.one("SELECT source_year_writer_token FROM sync_runs WHERE run_id=?",
                                    [retry["run_id"]])
        self.assertNotEqual(retry_run["source_year_writer_token"], failed["source_year_writer_token"])
        rows = self.client.rows("SELECT value,quality FROM observations WHERE run_id=? ORDER BY row_key",
                                [retry["run_id"]])
        self.assertEqual([row["value"] for row in rows], [15000, 19000])
        self.assertEqual({json.loads(row["quality"])["revisionId"] for row in rows},
                         {"dld-revision-2564-v2"})

    def test_explicit_failed_source_year_run_id_cannot_be_reused_for_a_different_snapshot(self):
        first = self.publish_years(
            [dld_cattle_observation(value=10000),
             dld_cattle_observation(area_code="11", source_row_id="124", value=11000)],
            retrieved_at="2026-10-26T03:00:00Z",
        )
        explicit_run_id = "cccccccc-cccc-cccc-cccc-cccccccccccc"
        revision_v2 = [
            dld_cattle_observation(value=12000, revision_id="dld-revision-2564-v2"),
            dld_cattle_observation(area_code="11", source_row_id="124", value=13000,
                                   revision_id="dld-revision-2564-v2"),
        ]
        self.client.fail_after_observations = self.client.observation_writes + 1
        with self.assertRaises(ObservationWriteError) as failed_write:
            self.publish_years(revision_v2, retrieved_at="2026-10-27T03:00:00Z",
                               run_id=explicit_run_id)
        self.assertEqual(failed_write.exception.code, "NUMERIC_WRITE_FAILED")
        self.client.fail_after_observations = None

        failed_before = self.client.one(
            "SELECT status,payload_sha256,source_revision_id,source_retrieved_at,source_year_writer_token "
            "FROM sync_runs WHERE run_id=?", [explicit_run_id],
        )
        self.assertEqual(failed_before["status"], "failed")
        self.assertEqual(failed_before["source_revision_id"], "dld-revision-2564-v2")
        failed_rows = self.client.rows(
            "SELECT row_key,value,quality FROM observations WHERE run_id=? ORDER BY row_key",
            [explicit_run_id],
        )
        self.assertEqual(len(failed_rows), 1)
        self.assertEqual(failed_rows[0]["value"], 12000)
        self.assertEqual(json.loads(failed_rows[0]["quality"])["revisionId"], "dld-revision-2564-v2")

        revision_v3 = [dld_cattle_observation(
            area_code="11", source_row_id="124", value=15000,
            revision_id="dld-revision-2564-v3",
        )]
        with self.assertRaises(ObservationWriteError) as identity_conflict:
            self.publish_years(revision_v3, retrieved_at="2026-10-28T03:00:00Z",
                               run_id=explicit_run_id)
        self.assertEqual(identity_conflict.exception.code, "SOURCE_YEAR_RUN_IDENTITY_CONFLICT")
        self.assertEqual(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                         [self.resource["resource_id"]])["active_run_id"], first["run_id"])
        self.assertEqual(self.client.one(
            "SELECT status,payload_sha256,source_revision_id,source_retrieved_at,source_year_writer_token "
            "FROM sync_runs WHERE run_id=?", [explicit_run_id],
        ), failed_before)
        self.assertEqual(self.client.rows(
            "SELECT row_key,value,quality FROM observations WHERE run_id=? ORDER BY row_key",
            [explicit_run_id],
        ), failed_rows)

        retry = self.publish_years(revision_v2, retrieved_at="2026-10-27T03:00:00Z",
                                   run_id=explicit_run_id)
        self.assertEqual(retry["run_id"], explicit_run_id)
        self.assertTrue(retry["active_run_switched"])
        completed_rows = self.client.rows(
            "SELECT value,quality FROM observations WHERE run_id=? ORDER BY row_key",
            [explicit_run_id],
        )
        self.assertEqual([row["value"] for row in completed_rows], [12000, 13000])
        self.assertEqual({json.loads(row["quality"])["revisionId"] for row in completed_rows},
                         {"dld-revision-2564-v2"})
        self.assertEqual(self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                         [self.resource["resource_id"]])["active_run_id"], explicit_run_id)

    def test_concurrent_source_year_attempts_with_same_clock_time_have_distinct_owner(self):
        rows = [dld_cattle_observation(),
                dld_cattle_observation(area_code="11", source_row_id="124", value=18000)]
        fixed_now = datetime(2026, 10, 28, 3, 0, tzinfo=timezone.utc)
        second_attempt_errors = []

        def concurrent_attempt():
            try:
                self.publish_years(rows, retrieved_at="2026-10-28T03:00:00Z")
            except ObservationWriteError as exc:
                second_attempt_errors.append(exc.code)

        self.client.before_observation_insert = concurrent_attempt
        with patch("tadih.observations._now", return_value=fixed_now):
            winner = self.publish_years(rows, retrieved_at="2026-10-28T03:00:00Z")

        self.assertEqual(second_attempt_errors, ["SOURCE_YEAR_RUN_IN_PROGRESS"])
        self.assertTrue(winner["active_run_switched"])
        stored = self.client.one("SELECT status,started_at,source_year_writer_token,source_retrieved_at "
                                 "FROM sync_runs WHERE run_id=?", [winner["run_id"]])
        self.assertEqual(stored["status"], "succeeded")
        self.assertEqual(stored["started_at"], "2026-10-28T03:00:00Z")
        self.assertEqual(stored["source_retrieved_at"], "2026-10-28T03:00:00Z")
        self.assertTrue(stored["source_year_writer_token"])
        self.assertNotEqual(stored["source_year_writer_token"], stored["started_at"])
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations WHERE run_id=?",
                                         [winner["run_id"]])["total"], 2)

    def test_stale_source_year_writer_cannot_upsert_or_fail_after_reclaim(self):
        rows = [dld_cattle_observation(),
                dld_cattle_observation(area_code="11", source_row_id="124", value=18000)]
        fixed_now = datetime(2026, 10, 28, 3, 0, tzinfo=timezone.utc)
        retry_results = []
        original_tokens = []

        def reclaim_and_finish():
            candidate = self.client.one(
                "SELECT run_id,source_year_writer_token FROM sync_runs WHERE resource_id=?",
                [self.resource["resource_id"]],
            )
            original_tokens.append(candidate["source_year_writer_token"])
            self.client.execute("UPDATE sync_runs SET status='failed' WHERE run_id=? AND status='running'",
                                [candidate["run_id"]])
            retry_results.append(self.publish_years(rows, retrieved_at="2026-10-28T03:00:00Z"))

        self.client.before_observation_insert = reclaim_and_finish
        with patch("tadih.observations._now", return_value=fixed_now):
            with self.assertRaises(ObservationWriteError) as caught:
                self.publish_years(rows, retrieved_at="2026-10-28T03:00:00Z")

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_RUN_OWNERSHIP_LOST")
        self.assertEqual(len(retry_results), 1)
        retry = retry_results[0]
        self.assertTrue(retry["active_run_switched"])
        stored = self.client.one("SELECT status,source_year_writer_token FROM sync_runs WHERE run_id=?",
                                 [retry["run_id"]])
        self.assertEqual(stored["status"], "succeeded")
        self.assertNotEqual(stored["source_year_writer_token"], original_tokens[0])
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations WHERE run_id=?",
                                         [retry["run_id"]])["total"], 2)

    def test_stale_source_year_writer_cannot_finalize_or_fail_reclaimed_run(self):
        rows = [dld_cattle_observation(),
                dld_cattle_observation(area_code="11", source_row_id="124", value=18000)]
        fixed_now = datetime(2026, 10, 28, 3, 0, tzinfo=timezone.utc)
        retry_results = []
        original_tokens = []

        def reclaim_and_finish():
            candidate = self.client.one(
                "SELECT run_id,source_year_writer_token FROM sync_runs WHERE resource_id=?",
                [self.resource["resource_id"]],
            )
            original_tokens.append(candidate["source_year_writer_token"])
            self.client.execute("UPDATE sync_runs SET status='failed' WHERE run_id=? AND status='running'",
                                [candidate["run_id"]])
            retry_results.append(self.publish_years(rows, retrieved_at="2026-10-28T03:00:00Z"))

        self.client.before_run_finalize = reclaim_and_finish
        with patch("tadih.observations._now", return_value=fixed_now):
            with self.assertRaises(ObservationWriteError) as caught:
                self.publish_years(rows, retrieved_at="2026-10-28T03:00:00Z")

        self.assertEqual(caught.exception.code, "SOURCE_YEAR_RUN_OWNERSHIP_LOST")
        retry = retry_results[0]
        self.assertTrue(retry["active_run_switched"])
        stored = self.client.one("SELECT status,source_year_writer_token,records_written FROM sync_runs "
                                 "WHERE run_id=?", [retry["run_id"]])
        self.assertEqual(stored["status"], "succeeded")
        self.assertEqual(stored["records_written"], 2)
        self.assertNotEqual(stored["source_year_writer_token"], original_tokens[0])
        self.assertEqual(self.client.one("SELECT count(*) AS total FROM observations WHERE run_id=?",
                                         [retry["run_id"]])["total"], 2)

    def test_source_year_order_compares_fractional_timezone_timestamps_as_instants(self):
        first = self.publish_years([dld_cattle_observation()],
                                   retrieved_at="2026-10-26T03:00:00Z")
        active_timestamp = "2026-10-28T10:00:00.100000+07:00"
        self.client.execute("UPDATE sync_runs SET source_retrieved_at=? WHERE run_id=?",
                            [active_timestamp, first["run_id"]])

        older = self.publish_years(
            [dld_cattle_observation(value=14524, revision_id="dld-revision-2564-v2")],
            retrieved_at="2026-10-28T03:00:00Z",
        )

        self.assertFalse(older["active_run_switched"])
        self.assertEqual(older["active_run_blocked_reason"], "SOURCE_YEAR_SNAPSHOT_NOT_NEWER")
        state = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                [self.resource["resource_id"]])
        self.assertEqual(state["active_run_id"], first["run_id"])
        self.assertEqual(self.client.one("SELECT source_retrieved_at FROM sync_runs WHERE run_id=?",
                                         [first["run_id"]])["source_retrieved_at"], active_timestamp)

    def test_source_year_order_fails_closed_on_unparseable_active_timestamp(self):
        first = self.publish_years([dld_cattle_observation()],
                                   retrieved_at="2026-10-26T03:00:00Z")
        self.client.execute("UPDATE sync_runs SET source_retrieved_at='broken-time' WHERE run_id=?",
                            [first["run_id"]])

        candidate = self.publish_years(
            [dld_cattle_observation(value=14524, revision_id="dld-revision-2564-v2")],
            retrieved_at="2026-10-28T03:00:00Z",
        )

        self.assertFalse(candidate["active_run_switched"])
        self.assertEqual(candidate["active_run_blocked_reason"], "SOURCE_YEAR_ACTIVE_RETRIEVAL_TIME_INVALID")
        active_id = self.client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                                    [self.resource["resource_id"]])["active_run_id"]
        self.assertEqual(active_id, first["run_id"])

    def test_source_year_atomic_activation_blocks_an_interleaved_older_snapshot(self):
        client = ActivationHookClient()
        resource = dld_registry_row()
        register_resource(client, resource=resource, source_name="DLD", base_url="https://dld.gdcatalog.go.th")

        def write(rows, retrieved_at):
            return publish(
                client, resource=resource, rows=rows, retrieved_at=retrieved_at,
                completeness="complete", coverage={"mode": "source_response", "count": len(rows)},
                unit="ตัว", period_grain="source_year_label",
            )

        write([dld_cattle_observation(source_year_be=2568)], "2026-10-26T03:00:00Z")
        historical = dld_cattle_observation(source_year_be=2568)
        client.before_activation = lambda: write(
            [historical, dld_cattle_observation(source_year_be=2569, value=17000)],
            "2026-10-28T03:00:00Z",
        )
        delayed = write(
            [historical, dld_cattle_observation(source_year_be=2569, value=16000)],
            "2026-10-27T03:00:00Z",
        )
        self.assertFalse(delayed["active_run_switched"])
        self.assertEqual(delayed["active_run_blocked_reason"], "SOURCE_YEAR_POINTER_CHANGED_DURING_ACTIVATION")
        active_id = client.one("SELECT active_run_id FROM resources WHERE resource_id=?",
                               [resource["resource_id"]])["active_run_id"]
        self.assertNotEqual(active_id, delayed["run_id"])
        active_value = client.one("SELECT value FROM observations WHERE run_id=? AND row_key=?",
                                  [active_id, "dld-beef-cattle:2569:10"])["value"]
        self.assertEqual(active_value, 17000)
        client.db.close()

    def test_registry_authorization_does_not_claim_source_license_is_verified(self):
        approved = dld_registry_row()
        self.assertIs(assert_resource_approved(approved), approved)
        self.assertFalse(approved["publication_authorization"]["source_license_verified"])
        without_basis = dict(approved, publication_authorization=None)
        with self.assertRaises(ObservationWriteError) as caught:
            assert_resource_approved(without_basis)
        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")


def publish(client, *, resource, rows, completeness="partial", coverage=None, unit=None,
            adapter_version="test-adapter/1", retrieved_at=RETRIEVED_AT, run_id=None, **kwargs):
    """Call the writer with the shared contract's required keyword arguments."""
    return publish_observations(
        client,
        resource=resource,
        rows=rows,
        adapter_version=adapter_version,
        coverage=coverage if coverage is not None else {"mode": "daily_full", "count": len(rows)},
        completeness=completeness,
        unit=unit,
        retrieved_at=retrieved_at,
        run_id=run_id,
        **kwargs,
    )


def registry_row(**change):
    row = {
        "resource_key": "rid_reservoir_daily",
        "source_id": SOURCE_ID,
        "resource_id": RESOURCE_ID,
        "dataset_id": DATASET_ID,
        "name": "RID reservoir daily report",
        "resource_url": RESOURCE_ID,
        "reviewed_at": "2026-10-26",
        "license_status": "approved_public",
        "review_outcome": "public API with granted credential",
        "declared_license": {"license_id": "CC-by-4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
        "access_evidence": {"url": RESOURCE_ID, "checked_at": "2026-10-26", "etag": REVISION,
                            "last_modified": "2026-10-26T02:40:00Z"},
        "rights_facts": ["Public agency data."],
        "project_publication_approved": True,
        "commercial_use_confirmed": True,
        "attribution_text": "Royal Irrigation Department open data.",
        "attribution_url": "https://app.rid.go.th",
        "unresolved": [],
        "next_action": None,
        "evidence": [{"url": RESOURCE_ID, "checked_at": "2026-10-26", "finding": "public endpoint"}],
    }
    row.update(change)
    return row


def dld_registry_row(**change):
    row = {
        "resource_key": "dld_livestock_cattle_province",
        "source_id": "dld",
        "resource_id": "d3667ca5-5982-4c9e-9b0d-04e729dbe31b",
        "dataset_id": "1bef9bc7-2f81-45c2-a21e-baba3743b456",
        "name": "จำนวนโคเนื้อ รายจังหวัด กรมปศุสัตว์",
        "resource_url": "https://dld.gdcatalog.go.th/api/3/action/datastore_search?resource_id=d3667ca5-5982-4c9e-9b0d-04e729dbe31b&limit=500",
        "license_status": "approved_public",
        "project_publication_approved": True,
        "commercial_use_confirmed": False,
        "declared_license": {"license_id": "Open Data Common", "license_url": None, "version": None},
        "unresolved": ["Exact ODC license variant and redistribution terms", "Reference year convention"],
        "publication_authorization": {
            "basis": "project_owner_instruction",
            "document": "AGENTS.md",
            "section": 3,
            "scope": ["fetch", "process", "store_in_D1", "public_numeric_display"],
            "source_license_verified": False,
        },
        "attribution_text": None,
        "attribution_url": "https://dld.gdcatalog.go.th",
        "evidence": [{
            "url": "https://dld.gdcatalog.go.th/api/3/action/datastore_search?resource_id=d3667ca5-5982-4c9e-9b0d-04e729dbe31b",
            "checked_at": "2026-10-28",
            "finding": "fixed resource endpoint; project publication authorization is separate from source license verification",
        }],
    }
    row.update(change)
    return row


def dld_cattle_observation(**change):
    row = {
        "observation_id": "dld-beef-cattle:2564:10",
        "source_id": "dld",
        "area_code": "10",
        "spatial_support": "province",
        "location_id": "dld:province:10",
        "commodity_id": "beef_cattle",
        "observed_at": None,
        "source_year_be": 2564,
        "source_row_id": "123",
        "release_at": None,
        "retrieved_at": RETRIEVED_AT,
        "measure": "beef_cattle_count",
        "value": 14523,
        "unit": "ตัว",
        "data_kind": "official",
        "revision_id": "dld-revision-2564-v1",
        "quality_flag": "good",
        "source_url": "https://dld.gdcatalog.go.th/api/3/action/datastore_search?resource_id=d3667ca5-5982-4c9e-9b0d-04e729dbe31b",
        "license_status": "approved_public",
        "market_id": None,
        "price_type": None,
        "grade": None,
        "season": None,
    }
    row.update(change)
    if "area_code" in change and "observation_id" not in change:
        row["observation_id"] = f"dld-beef-cattle:{row['source_year_be']}:{row['area_code']}"
    if "source_year_be" in change and "observation_id" not in change:
        row["observation_id"] = f"dld-beef-cattle:{row['source_year_be']}:{row['area_code']}"
    if "area_code" in change and "location_id" not in change:
        row["location_id"] = f"dld:province:{row['area_code']}"
    return row


def observation(**change):
    row = {
        "observation_id": "rid-obs-4",
        "source_id": SOURCE_ID,
        "area_code": None,
        "spatial_support": "reservoir",
        "location_id": "rid:reservoir:R1",
        "commodity_id": None,
        "observed_at": OBSERVED_AT,
        "release_at": None,
        "retrieved_at": RETRIEVED_AT,
        "measure": "reservoir_storage_pct",
        "value": 52.5,
        "unit": "percent",
        "data_kind": "observed",
        "revision_id": REVISION,
        "quality_flag": "good",
        "source_url": RESOURCE_ID,
        "license_status": "approved_public",
        "market_id": None,
        "price_type": None,
        "grade": None,
        "season": None,
    }
    row.update(change)
    return row


def _capture_stderr(function):
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stderr(buffer):
        code = function()
    payload = None
    for line in buffer.getvalue().splitlines():
        if line.strip().startswith("{"):
            payload = json.loads(line)
    return {"code": code, "payload": payload, "text": buffer.getvalue()}


class _patched_d1_client:
    def __init__(self, client):
        self.client = client
        self.previous = None

    def __enter__(self):
        from tadih import hub_catalog_sync

        self.previous = hub_catalog_sync.connect_d1_client
        hub_catalog_sync.connect_d1_client = lambda *a, **k: self.client
        return self

    def __exit__(self, *exc):
        from tadih import hub_catalog_sync

        hub_catalog_sync.connect_d1_client = self.previous
        return False


if __name__ == "__main__":
    unittest.main()
