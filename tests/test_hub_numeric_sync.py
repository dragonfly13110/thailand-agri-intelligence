"""Schema-backed D1 mock tests for the approved numeric write path."""

import json
import importlib.util
import io
from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

from tadih.hub_numeric_sync import (
    NumericSyncError,
    RESOURCE_ID,
    sync_numeric_resource_d1,
    validate_numeric_batch,
)

ROOT = Path(__file__).resolve().parents[1]
REVISION = "6ad152d4-119211a"
RETRIEVED = "2026-10-25T12:00:00Z"


class SqliteD1Mock:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript((ROOT / "db/cloudflare/0001_hub.sql").read_text(encoding="utf-8"))
        self.fail_after_observations = None
        self.observation_writes = 0
        self.queries = 0

    def execute(self, sql, params=None):
        if sql.lstrip().startswith("INSERT INTO observations"):
            if self.fail_after_observations is not None and self.observation_writes >= self.fail_after_observations:
                raise RuntimeError("simulated D1 row failure")
            self.observation_writes += 1
        cursor = self.db.execute(sql, params or [])
        rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        self.db.commit()
        self.queries += 1
        return {"results": rows}


class HubNumericSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp.name) / "resource_licenses.json"
        self._write_registry()

    def tearDown(self):
        self.temp.cleanup()

    def test_success_activates_partial_sample_and_preserves_null(self):
        client = SqliteD1Mock()
        with patch("tadih.chirps_raster.read_chirps_observations", return_value=batch()) as read_sample:
            result = sync_numeric_resource_d1(client, registry_path=self.registry_path)
        read_sample.assert_called_once_with()

        self.assertEqual((result["status"], result["completeness"]), ("partial", "partial"))
        resource = client.db.execute(
            "SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID],
        ).fetchone()
        run = client.db.execute(
            "SELECT kind, status, records_written FROM sync_runs WHERE run_id=?", [resource["active_run_id"]],
        ).fetchone()
        dataset = client.db.execute(
            "SELECT title, description, metadata FROM datasets WHERE dataset_id=?", ["chirps-v3.0-daily-final-rnl"],
        ).fetchone()
        resource_metadata = json.loads(client.db.execute(
            "SELECT metadata FROM resources WHERE resource_id=?", [RESOURCE_ID],
        ).fetchone()["metadata"])
        values = client.db.execute(
            "SELECT value, location_kind FROM observations WHERE run_id=? ORDER BY row_key", [resource["active_run_id"]],
        ).fetchall()
        self.assertEqual((run["kind"], run["status"], run["records_written"]), ("numeric", "partial", 3))
        self.assertEqual([row["location_kind"] for row in values], ["grid", "grid", "grid"])
        self.assertIsNone(values[-1]["value"])
        self.assertIn("3-cell verification sample", dataset["title"])
        self.assertIn("CHIRPS3 Data Repository", dataset["description"])
        self.assertEqual(resource_metadata["coverage"]["mode"], "sample_only")
        self.assertFalse(resource_metadata["coverage"]["fullRasterIngested"])

    def test_failed_partial_run_keeps_previous_active_batch(self):
        client = SqliteD1Mock()
        self._sync_sample(client, batch())
        previous = client.db.execute(
            "SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID],
        ).fetchone()["active_run_id"]
        client.fail_after_observations = client.observation_writes + 1

        with self.assertRaises(NumericSyncError):
            self._sync_sample(client, batch(id_offset=10))

        active = client.db.execute(
            "SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID],
        ).fetchone()["active_run_id"]
        failed = client.db.execute(
            "SELECT status FROM sync_runs WHERE resource_id=? ORDER BY started_at DESC LIMIT 1", [RESOURCE_ID],
        ).fetchone()["status"]
        self.assertEqual(active, previous)
        self.assertEqual(failed, "failed")
        self.assertEqual(client.db.execute("SELECT count(*) FROM observations WHERE run_id=?", [previous]).fetchone()[0], 3)
        failed_run = client.db.execute(
            "SELECT run_id FROM sync_runs WHERE resource_id=? AND status='failed'", [RESOURCE_ID],
        ).fetchone()["run_id"]
        self.assertEqual(client.db.execute("SELECT count(*) FROM observations WHERE run_id=?", [failed_run]).fetchone()[0], 1)

    def test_existing_d1_revocation_is_preserved_and_blocks_activation(self):
        client = SqliteD1Mock()
        self._sync_sample(client, batch())
        previous = client.db.execute(
            "SELECT active_run_id FROM resources WHERE resource_id=?", [RESOURCE_ID],
        ).fetchone()["active_run_id"]
        previous_run_count = client.db.execute(
            "SELECT count(*) FROM sync_runs WHERE resource_id=?", [RESOURCE_ID],
        ).fetchone()[0]
        previous_observation_writes = client.observation_writes
        client.execute(
            "UPDATE resources SET access_status='restricted', project_publication_approved=0 WHERE resource_id=?",
            [RESOURCE_ID],
        )

        with self.assertRaisesRegex(NumericSyncError, "RESOURCE_PUBLICATION_NOT_APPROVED"):
            self._sync_sample(client, batch())

        resource = client.db.execute(
            "SELECT access_status, project_publication_approved, active_run_id FROM resources WHERE resource_id=?",
            [RESOURCE_ID],
        ).fetchone()
        self.assertEqual(resource["access_status"], "restricted")
        self.assertEqual(resource["project_publication_approved"], 0)
        self.assertEqual(resource["active_run_id"], previous)
        self.assertEqual(
            client.db.execute("SELECT count(*) FROM sync_runs WHERE resource_id=?", [RESOURCE_ID]).fetchone()[0],
            previous_run_count,
        )
        self.assertEqual(client.observation_writes, previous_observation_writes)

    def test_writer_does_not_accept_caller_supplied_observations(self):
        client = SqliteD1Mock()
        with self.assertRaises(TypeError):
            sync_numeric_resource_d1(client, batch(), registry_path=self.registry_path)
        self.assertEqual(client.queries, 0)

    def test_registry_project_approval_is_required_before_any_write(self):
        self._write_registry(status="approved_public", project_approved=False)
        client = SqliteD1Mock()

        with self.assertRaises(NumericSyncError):
            self._sync_sample(client, batch())

        self.assertEqual(client.queries, 0)

    def test_completeness_and_sample_coverage_are_required_before_any_write(self):
        for marker in (None, "unknown", "complete"):
            with self.subTest(completeness=marker):
                payload = batch()
                if marker is None:
                    payload.pop("completeness")
                else:
                    payload["completeness"] = marker
                client = SqliteD1Mock()
                with self.assertRaises(NumericSyncError):
                    validate_numeric_batch(payload, registry_path=self.registry_path)
                self.assertEqual(client.queries, 0)

        payload = batch()
        payload.pop("coverage")
        client = SqliteD1Mock()
        with self.assertRaises(NumericSyncError):
            validate_numeric_batch(payload, registry_path=self.registry_path)
        self.assertEqual(client.queries, 0)

    def test_cli_defaults_to_local_dry_run(self):
        input_path = Path(self.temp.name) / "batch.json"
        input_path.write_text(json.dumps(batch()), encoding="utf-8")
        spec = importlib.util.spec_from_file_location("sync_hub_numeric", ROOT / "scripts/sync_hub_numeric.py")
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        output = io.StringIO()

        with redirect_stdout(output):
            code = cli.main(["--input", str(input_path), "--registry", str(self.registry_path)])

        self.assertEqual(code, 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["status"], "dry_run")
        self.assertEqual(report["records_read"], 3)
        self.assertEqual(report["records_written"], 0)
        self.assertEqual(report["completeness"], "partial")
        self.assertEqual(report["coverage"]["mode"], "sample_only")

    def test_cli_rejects_saved_input_for_write_before_connecting(self):
        input_path = Path(self.temp.name) / "forged-batch.json"
        input_path.write_text(json.dumps(batch()), encoding="utf-8")
        spec = importlib.util.spec_from_file_location("sync_hub_numeric", ROOT / "scripts/sync_hub_numeric.py")
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        output = io.StringIO()

        with redirect_stderr(output), patch.object(cli, "connect_d1_client") as connect:
            code = cli.main([
                "--input", str(input_path), "--write", "--registry", str(self.registry_path),
            ])

        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output.getvalue())["errorCode"], "INPUT_WRITE_UNSUPPORTED")
        connect.assert_not_called()

    def test_cli_declares_current_reader_output_as_partial_sample(self):
        spec = importlib.util.spec_from_file_location("sync_hub_numeric", ROOT / "scripts/sync_hub_numeric.py")
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        reader_output = batch()
        reader_output.pop("completeness")
        reader_output.pop("coverage")

        with patch("tadih.chirps_raster.read_chirps_observations", return_value=reader_output):
            prepared = cli._load_batch(None)

        self.assertEqual(prepared["completeness"], "partial")
        self.assertEqual(prepared["coverage"], {
            "mode": "sample_only", "sample_count": 3, "full_raster_ingested": False,
        })

    def _write_registry(self, *, status="approved_public", project_approved=True):
        resource = {
            "resource_key": "chirps_v3_daily_rnl_2026_09_30",
            "source_id": "chirps",
            "resource_id": RESOURCE_ID,
            "name": "CHIRPS v3.0 Daily final RNL 2026-09-30",
            "license_status": status,
            "project_publication_approved": project_approved,
            "commercial_use_confirmed": True,
            "unresolved": [],
            "evidence": [{"url": "https://www.chc.ucsb.edu/data/chirps3"}],
            "access_evidence": {
                "etag": REVISION,
                "last_modified": "2026-10-15T22:25:24Z",
                "crs": "EPSG:4326",
                "pixel_spacing_degrees": 0.05,
            },
            "declared_license": {
                "license_id": "CC-BY-4.0",
                "license_url": "https://creativecommons.org/licenses/by/4.0/",
            },
            "attribution_text": "CHIRPS3 Data Repository, DOI: 10.15780/G2JQ0P.",
            "attribution_url": "https://www.chc.ucsb.edu/data/chirps3",
        }
        self.registry_path.write_text(json.dumps({
            "automatic_approval": False,
            "resources": [resource],
        }), encoding="utf-8")

    def _sync_sample(self, client, sample):
        with patch("tadih.chirps_raster.read_chirps_observations", return_value=sample):
            return sync_numeric_resource_d1(client, registry_path=self.registry_path)


def batch(*, id_offset=0):
    values = []
    for index in range(3):
        row = 924 + index + id_offset
        col = 5605 + index
        missing = index == 2
        values.append({
            "observation_id": f"chirps-observation-{id_offset}-{index}",
            "source_id": "chirps",
            "area_code": None,
            "spatial_support": "grid_cell",
            "location_id": f"chirps-v3:grid:row:{row}:col:{col}",
            "commodity_id": None,
            "observed_at": "2026-09-30T00:00:00Z",
            "release_at": None,
            "retrieved_at": RETRIEVED,
            "measure": "rainfall",
            "value": None if missing else 4.2 + index,
            "unit": "mm",
            "data_kind": "estimated",
            "revision_id": REVISION,
            "quality_flag": "missing" if missing else "good",
            "source_url": RESOURCE_ID,
            "license_status": "approved_public",
            "market_id": None,
            "price_type": None,
            "grade": None,
            "season": None,
        })
    return {
        "resource_url": RESOURCE_ID,
        "revision_id": REVISION,
        "retrieved_at": RETRIEVED,
        "completeness": "partial",
        "coverage": {"mode": "sample_only", "sample_count": 3, "full_raster_ingested": False},
        "rows": values,
    }


if __name__ == "__main__":
    unittest.main()
