"""Location identity and dedupe tests for the shared writer, on throw-away SQLite files with the real Hub schema, never against Cloudflare D1."""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from tadih.observations import (
    ObservationWriteError,
    publish_observations,
    register_resource,
)

ROOT = Path(__file__).resolve().parents[1]
RESOURCE_ID = "https://app.rid.go.th/reservoir/api/reservoir/public"
RETRIEVED_AT = "2026-10-26T03:00:00Z"
OBSERVED_AT = "2026-10-25T00:00:00Z"
REVISION = 'W/"etag-rid-2026-10-26"'


def schema_script() -> str:
    parts = []
    for path in sorted((ROOT / "db/cloudflare").glob("000*.sql")):
        parts.append(path.read_text(encoding="utf-8"))
    return "\n".join(parts)


class SharedSqliteD1:
    """D1 stand-in over a shared SQLite file, so two writers can interleave."""

    def __init__(self, path: Path):
        self.db = sqlite3.connect(path, timeout=30, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.location_upserts = 0
        self.observation_inserts = 0
        self.before_location_upsert = None
        self.before_observation_insert = None

    def execute(self, sql, params=None):
        statement = sql.lstrip()
        if statement.startswith("INSERT INTO locations"):
            if self.before_location_upsert is not None:
                hook = self.before_location_upsert
                self.before_location_upsert = None
                hook(self)
            self.location_upserts += 1
        if statement.startswith("INSERT INTO observations"):
            if self.before_observation_insert is not None:
                hook = self.before_observation_insert
                self.before_observation_insert = None
                hook(self)
            self.observation_inserts += 1
        cursor = self.db.execute(sql, list(params or []))
        rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        return {"results": rows}

    def rows(self, sql, params=None):
        return [dict(row) for row in self.db.execute(sql, list(params or [])).fetchall()]

    def one(self, sql, params=None):
        found = self.rows(sql, params)
        return found[0] if found else None

    def seed_location(self, location_id, source_id, kind, native_code, name, province_code=None):
        """Write a location row directly, so it is not counted as a writer upsert."""
        self.db.execute(
            "INSERT INTO locations (location_id,source_id,kind,native_code,name,province_code) "
            "VALUES (?,?,?,?,?,?)",
            [location_id, source_id, kind, native_code, name, province_code],
        )

    def close(self):
        self.db.close()


def registry_row(**change):
    row = {
        "resource_id": RESOURCE_ID,
        "source_id": "rid",
        "license_status": "approved_public",
        "project_publication_approved": True,
        "unresolved": [],
        "name": "RID reservoirs",
    }
    row.update(change)
    return row


def observation(**change):
    row = {
        "observation_id": "rid-obs-1",
        "source_id": "rid",
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


def publish(client, rows, *, grain=None, locations=None, coverage=None):
    return publish_observations(
        client,
        resource=registry_row(),
        rows=rows,
        adapter_version="test-adapter/1",
        coverage=coverage or {"mode": "daily_full", "count": len(rows)},
        completeness="complete",
        unit=None,
        retrieved_at=RETRIEVED_AT,
        period_grain=grain,
        locations=locations,
    )


class LocationIdentityTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory(prefix="ai1-location-")
        self.tmp = Path(self._tmpdir.name)
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            client.close()
        self._tmpdir.cleanup()

    def new_client(self, name: str) -> SharedSqliteD1:
        path = self.tmp / f"{name}.sqlite"
        db = sqlite3.connect(path)
        db.executescript(schema_script())
        db.commit()
        db.close()
        client = SharedSqliteD1(path)
        self.clients.append(client)
        return client

    def prepare(self, client):
        register_resource(client, resource=registry_row(), source_name="Royal Irrigation Department",
                          base_url="https://app.rid.go.th", connector_kind="api", category="water",
                          grain="reservoir x UTC date", resource_format="JSON")

    def test_persisted_location_with_same_natural_key_is_refused_without_rows(self):
        client = self.new_client("persisted")
        self.prepare(client)
        client.seed_location("legacy:rid:reservoir:R1", "rid", "reservoir", "rid:reservoir:R1", "Legacy R1")

        with self.assertRaises(ObservationWriteError) as caught:
            publish(client, [observation(observation_id="rid-persisted")])

        self.assertEqual(caught.exception.code, "LOCATION_IDENTITY_CONFLICT")
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)
        self.assertEqual(client.one(
            "SELECT location_id,name FROM locations WHERE native_code='rid:reservoir:R1'"),
            {"location_id": "legacy:rid:reservoir:R1", "name": "Legacy R1"})
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 1)

    def test_within_batch_location_ids_sharing_one_natural_key_write_nothing(self):
        client = self.new_client("within-batch")
        self.prepare(client)
        rows = [
            observation(observation_id="rid-alias-1", location_id="rid:reservoir:R1"),
            observation(observation_id="rid-alias-2", location_id="rid:reservoir:alias-R1"),
        ]
        locations = {
            "rid:reservoir:R1": {"name": "R1", "nativeCode": "rid:reservoir:R1"},
            "rid:reservoir:alias-R1": {"name": "R1 alias", "nativeCode": "rid:reservoir:R1"},
        }

        with self.assertRaises(ObservationWriteError) as caught:
            publish(client, rows, locations=locations)

        self.assertEqual(caught.exception.code, "LOCATION_IDENTITY_CONFLICT")
        self.assertEqual(client.location_upserts, 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM sync_runs")["n"], 0)

    def test_one_location_id_with_two_natural_keys_is_refused(self):
        client = self.new_client("two-natural-keys")
        self.prepare(client)
        rows = [
            observation(observation_id="rid-kind-1", spatial_support="reservoir",
                        location_id="rid:shared:10"),
            observation(observation_id="rid-kind-2", spatial_support="province", area_code="10",
                        location_id="rid:shared:10"),
        ]

        with self.assertRaises(ObservationWriteError) as caught:
            publish(client, rows)

        self.assertEqual(caught.exception.code, "LOCATION_IDENTITY_CONFLICT")
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 0)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 0)

    def test_two_writers_of_the_same_payload_converge_on_one_run_and_one_location(self):
        writer_a = self.new_client("race-a")
        self.prepare(writer_a)
        writer_b = SharedSqliteD1(self.tmp / "race-a.sqlite")
        self.clients.append(writer_b)
        rows = [observation(observation_id=f"rid-race-{index}", value=50.0 + index)
                for index in range(4)]

        def interleave(_client):
            publish(writer_b, rows)

        writer_a.before_observation_insert = interleave
        envelope = publish(writer_a, rows)

        self.assertEqual(envelope["records_written"], 4)
        self.assertEqual(envelope["locations_written"], 1)
        self.assertEqual(writer_a.one("SELECT count(*) AS n FROM observations")["n"], 4)
        self.assertEqual(writer_a.one("SELECT count(*) AS n FROM locations")["n"], 1)
        self.assertEqual(writer_a.one("SELECT count(*) AS n FROM sync_runs")["n"], 1)
        self.assertEqual(writer_a.location_upserts, 1)

    def test_writer_with_a_conflicting_location_id_is_refused_and_writes_no_rows(self):
        writer_a = self.new_client("race-conflict")
        self.prepare(writer_a)
        writer_b = SharedSqliteD1(self.tmp / "race-conflict.sqlite")
        self.clients.append(writer_b)
        rows_a = [observation(observation_id=f"rid-race-a-{index}") for index in range(3)]
        rows_b = [observation(observation_id=f"rid-race-b-{index}",
                              location_id="rid:reservoir:alias-R1") for index in range(3)]
        locations_b = {"rid:reservoir:alias-R1": {"name": "R1 alias", "nativeCode": "rid:reservoir:R1"}}

        def interleave(_client):
            with self.assertRaises(ObservationWriteError) as caught:
                publish(writer_b, rows_b, locations=locations_b)
            self.assertEqual(caught.exception.code, "LOCATION_IDENTITY_CONFLICT")

        writer_a.before_observation_insert = interleave
        publish(writer_a, rows_a)

        self.assertEqual(writer_a.one("SELECT count(*) AS n FROM observations")["n"], 3)
        self.assertEqual(writer_a.one("SELECT count(*) AS n FROM locations")["n"], 1)
        self.assertEqual(writer_a.one("SELECT location_id FROM locations")["location_id"],
                         "rid:reservoir:R1")
        self.assertEqual(writer_b.observation_inserts, 0)

    def test_daily_and_monthly_batches_write_one_location_each(self):
        client = self.new_client("grain")
        self.prepare(client)
        daily_rows = [observation(observation_id=f"rid-daily-{index}", value=50.0 + index)
                      for index in range(3)]
        monthly_rows = [observation(observation_id=f"rid-monthly-{index}",
                                    observed_at="2026-10-15T00:00:00Z", value=60.0 + index)
                        for index in range(3)]

        daily = publish(client, daily_rows, grain="daily")
        monthly = publish(client, monthly_rows, grain="monthly",
                          coverage={"mode": "monthly_full", "count": len(monthly_rows)})

        self.assertEqual((daily["records_written"], daily["locations_written"]), (3, 1))
        self.assertEqual((monthly["records_written"], monthly["locations_written"]), (3, 1))
        self.assertEqual(client.location_upserts, 2)
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 1)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 6)
        periods = client.rows(
            "SELECT row_key,period_start,period_end FROM observations ORDER BY row_key")
        self.assertEqual(periods[0]["period_start"], "2026-10-25")
        self.assertEqual(periods[-1]["period_start"], "2026-10-01")
        self.assertTrue(daily["active_run_switched"])
        self.assertFalse(monthly["active_run_switched"])
        active = client.one("SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID])
        self.assertEqual(active["active_run_id"], daily["run_id"])

    def test_repeated_location_is_written_once_per_batch(self):
        client = self.new_client("dedupe")
        self.prepare(client)
        rows = [observation(observation_id=f"rid-dedupe-{index}", value=50.0 + index)
                for index in range(5)]

        envelope = publish(client, rows)

        self.assertEqual(envelope["locations_written"], 1)
        self.assertEqual(envelope["records_written"], 5)
        self.assertEqual(client.location_upserts, 1)
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 1)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 5)

    def test_replay_reports_the_same_location_count_and_writes_nothing_new(self):
        client = self.new_client("replay")
        self.prepare(client)
        rows = [observation(observation_id=f"rid-replay-{index}", value=50.0 + index)
                for index in range(3)]

        first = publish(client, rows)
        second = publish(client, rows)

        self.assertEqual(first["locations_written"], 1)
        self.assertEqual(second["locations_written"], 1)
        self.assertEqual(second["skipped_identical"], 3)
        self.assertEqual(client.location_upserts, 1)
        self.assertEqual(client.observation_inserts, 3)
        self.assertEqual(client.one("SELECT count(*) AS n FROM locations")["n"], 1)
        self.assertEqual(client.one("SELECT count(*) AS n FROM observations")["n"], 3)

    def test_location_name_and_province_survive_one_upsert_per_batch(self):
        client = self.new_client("metadata")
        self.prepare(client)
        rows = [
            observation(observation_id="rid-meta-1", area_code="10"),
            observation(observation_id="rid-meta-2", area_code="11"),
        ]

        publish(client, rows, locations={"rid:reservoir:R1": {
            "kind": "reservoir", "nativeCode": "R1", "name": "R1 name"}})

        stored = client.one("SELECT location_id,name,province_code,native_code FROM locations")
        self.assertEqual(stored, {"location_id": "rid:reservoir:R1", "name": "R1 name",
                                   "province_code": "11", "native_code": "R1"})

    def test_location_dimensions_stay_on_the_observation_rows(self):
        client = self.new_client("dimensions")
        self.prepare(client)
        rows = [observation(observation_id="rid-dim-1", area_code="10")]

        publish(client, rows)

        stored = client.one("SELECT location_id,location_kind,location_name,province_code "
                            "FROM observations")
        self.assertEqual(stored["location_id"], "rid:reservoir:R1")
        self.assertEqual(stored["location_kind"], "reservoir")
        self.assertEqual(stored["location_name"], "rid:reservoir:R1")
        self.assertEqual(stored["province_code"], "10")


if __name__ == "__main__":
    unittest.main()
