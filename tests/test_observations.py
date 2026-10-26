"""Offline tests for the shared observation writer (SQLite D1 mock, no network).

Contract under test: ``tadih.observations.publish_observations`` from
docs/assignments/2026-10-26-real-data-initiative.md section 3.2, plus the
``tadih ingest --adapter`` dispatch that the numeric lanes use.
"""

import json
from pathlib import Path
import sqlite3
import sys
import types
import unittest

from tadih.cli import main as cli_main
from tadih.observations import (
    ObservationWriteError,
    publish_observations,
    register_resource,
    assert_resource_approved,
)

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

    def __init__(self, *, with_extensions=False):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        script = (ROOT / "db/cloudflare/0001_hub.sql").read_text(encoding="utf-8")
        if with_extensions:
            script += (ROOT / "db/cloudflare/0002_observation_extensions.sql").read_text(encoding="utf-8")
        self.db.executescript(script)
        self.queries = 0
        self.observation_writes = 0
        self.fail_after_observations = None
        SqliteD1Mock.instances.append(self)

    @classmethod
    def close_all(cls):
        while cls.instances:
            cls.instances.pop().db.close()

    def execute(self, sql, params=None):
        self.queries += 1
        if sql.lstrip().startswith("INSERT INTO observations"):
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
