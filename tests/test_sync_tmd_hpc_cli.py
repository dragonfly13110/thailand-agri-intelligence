"""Offline tests for the TMD HPC NWP CLI / D1 publisher (Round 2, Lane C).

No network access and no D1 write: every D1 interaction goes through
``FakeD1Client``, which records the statements it receives and emulates the
upsert / cascade semantics of ``db/cloudflare/0003_nwp.sql``.
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import sync_tmd_hpc_nwp as cli  # noqa: E402
from tadih.hub_catalog_sync import CatalogSyncError  # noqa: E402

RUN_ID = "tmd_hpc_d02_2026102600"
VALID_AT = "2026-10-27T00:00:00Z"
OTHER_VALID_AT = "2026-10-28T00:00:00Z"


# --------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------


def make_export(*, nx: int = 2, ny: int = 3, variables=("p24h",),
                province_rows: int = 2, publication_mode: str = "numeric_preview",
                license_status: str = "pending") -> dict:
    """Build a valid canonical export payload (small grid, offline)."""
    cells = nx * ny
    snapshots = []
    for variable in variables:
        snapshots.append({
            "variable": variable,
            "valid_at": VALID_AT,
            "unit": None,
            "bbox": [96.0, 5.0, 106.0, 21.0],
            "nx": nx,
            "ny": ny,
            "mean": [0.0] + [None] * (cells - 1),
            "max": [1.5] + [None] * (cells - 1),
            "quality": {"source_cells": cells},
        })
    provinces = []
    for index in range(province_rows):
        provinces.append({
            "variable": variables[0],
            "valid_at": VALID_AT,
            "province_code": f"{10 + index:02d}",
            "province_name": f"จังหวัดทดสอบ {index + 1}",
            "value": 12.5,
            "method": "max_within_25km",
            "radius_km": 25.0,
            "distance_km": 1.5,
            "risk_level": "watch",
        })
    return {
        "export_version": cli.EXPORT_VERSION,
        "run": {
            "run_id": RUN_ID,
            "source_id": cli.SOURCE_ID,
            "domain": "d02",
            "init_at": "2026-10-26T00:00:00Z",
            "retrieved_at": "2026-10-26T08:30:00Z",
            "license_status": license_status,
            "unit_status": "pending_official_confirmation",
            "publication_mode": publication_mode,
            "variables": list(variables),
            "lead_hours": [0, 6, 12, 24, 48, 72],
            "grid": {"bbox": [96.0, 5.0, 106.0, 21.0], "nx": nx, "ny": ny,
                     "output_cell_deg": 0.15},
            "manifest_sha256": "a" * 64,
        },
        "snapshots": snapshots,
        "province_values": provinces,
    }


class FakeD1Client:
    """In-memory stand-in for ``tadih.hub_catalog_sync.D1Client``."""

    def __init__(self):
        self.runs: dict[str, dict] = {}
        self.snapshots: dict[tuple, dict] = {}
        self.province_values: dict[tuple, dict] = {}
        self.statements: list[tuple[str, list]] = []
        self.fail_on: str | None = None

    # -- helpers ----------------------------------------------------------
    @property
    def calls(self) -> int:
        return len(self.statements)

    def seed_run(self, run_id: str, domain: str, init_at: str,
                 payload_sha256: str | None = None) -> None:
        self.runs[run_id] = {
            "run_id": run_id, "domain": domain, "init_at": init_at,
            "status": "ready", "payload_sha256": payload_sha256,
        }

    def deleted_run_ids(self) -> list[str]:
        return [params[0] for sql, params in self.statements
                if sql.upper().startswith("DELETE FROM NWP_RUNS")]

    # -- the D1 surface ---------------------------------------------------
    def execute(self, sql, params=None):
        params = list(params or [])
        text = " ".join(sql.split())
        self.statements.append((text, params))
        if self.fail_on and self.fail_on in text.upper():
            raise CatalogSyncError("D1_QUERY_FAILED", "simulated D1 failure")

        upper = text.upper()
        if upper.startswith("SELECT 1 AS OK"):
            return {"ok": 1}
        if upper.startswith("SELECT PAYLOAD_SHA256 FROM NWP_RUNS"):
            row = self.runs.get(params[0])
            return {"payload_sha256": row["payload_sha256"]} if row else {}
        if upper.startswith("SELECT JSON_GROUP_ARRAY"):
            rows = [{"run_id": row["run_id"], "domain": row["domain"],
                     "init_at": row["init_at"]} for row in self.runs.values()]
            return {"runs_json": json.dumps(rows)}
        if upper.startswith("INSERT INTO NWP_RUNS"):
            row = dict(zip(cli.RUN_COLUMNS, params))
            self.runs[row["run_id"]] = row
            return {}
        if upper.startswith("INSERT INTO NWP_SNAPSHOTS"):
            row = dict(zip(cli.SNAPSHOT_COLUMNS, params))
            self.snapshots[(row["run_id"], row["variable"], row["valid_at"])] = row
            return {}
        if upper.startswith("INSERT INTO NWP_PROVINCE_VALUES"):
            row = dict(zip(cli.PROVINCE_COLUMNS, params))
            self.province_values[(row["run_id"], row["variable"], row["valid_at"],
                                  row["province_code"])] = row
            return {}
        if upper.startswith("UPDATE NWP_RUNS SET STATUS"):
            row = self.runs.get(params[0])
            if row is not None:
                row["status"] = "failed"
            return {}
        if upper.startswith("DELETE FROM NWP_RUNS"):
            run_id = params[0]
            self.runs.pop(run_id, None)
            for key in [k for k in self.snapshots if k[0] == run_id]:
                del self.snapshots[key]
            for key in [k for k in self.province_values if k[0] == run_id]:
                del self.province_values[key]
            return {}
        raise AssertionError(f"unexpected SQL reached the fake D1 client: {text}")


def write_registry(directory: Path, *, approved: bool = True) -> Path:
    """Write a minimal but structurally valid licence register."""
    path = directory / "resource_licenses.json"
    payload = {
        "automatic_approval": False,
        "resources": [{
            "resource_key": "tmd_hpc_nwp_d02_grid",
            "source_id": "tmd_hpc_nwp",
            "name": "TMD HPC NWP grid (test fixture)",
            "license_status": "approved_public" if approved else "pending",
            "project_publication_approved": bool(approved),
            "commercial_use_confirmed": False,
            "unresolved": [],
            "evidence": [{"url": "https://hpc.tmd.go.th/download",
                           "checked_at": "2026-10-26",
                           "finding": "offline test fixture"}],
        }],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def run_cli(argv):
    """Run the CLI, returning (exit_code, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = cli.main(argv)
    return code, out.getvalue(), err.getvalue()


def last_json(stdout: str) -> dict:
    lines = [line for line in stdout.strip().splitlines() if line.strip()]
    return json.loads(lines[-1])


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------


class ExportValidationTests(unittest.TestCase):
    """The dry-run payload contract."""

    def test_valid_export_is_accepted(self):
        counts = cli.validate_export(make_export())
        self.assertEqual(counts["runs"], 1)
        self.assertEqual(counts["snapshots"], 1)
        self.assertEqual(counts["province_rows"], 2)
        self.assertEqual(counts["cells"], 6)
        self.assertIn("p24h@2026-10-27T00:00:00Z", counts["by_variable_valid_at"])

    def test_snapshot_length_must_match_nx_times_ny(self):
        payload = make_export(nx=2, ny=3)
        payload["snapshots"][0]["mean"] = [0.0, 1.0, 2.0]
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_GRID_LENGTH_MISMATCH)

    def test_max_length_must_match_nx_times_ny(self):
        payload = make_export(nx=2, ny=3)
        payload["snapshots"][0]["max"] = [0.0] * 7
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_GRID_LENGTH_MISMATCH)

    def test_nan_and_infinity_are_rejected(self):
        payload = make_export()
        payload["snapshots"][0]["mean"] = [float("nan")] + [0.0] * 5
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_NON_FINITE_VALUE)

        payload = make_export()
        payload["snapshots"][0]["max"] = [float("inf")] + [0.0] * 5
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_NON_FINITE_VALUE)

        payload = make_export()
        payload["province_values"][0]["value"] = float("-inf")
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_NON_FINITE_VALUE)

    def test_nan_literal_in_export_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "export.json"
            path.write_text('{"export_version": 1, "x": NaN}', encoding="utf-8")
            with self.assertRaises(cli.NwpCliError) as ctx:
                cli.read_json(path)
            self.assertEqual(ctx.exception.code, cli.NWP_NON_FINITE_VALUE)

    def test_province_row_must_reference_a_known_snapshot(self):
        payload = make_export()
        payload["province_values"][0]["valid_at"] = OTHER_VALID_AT
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_UNKNOWN_SNAPSHOT_REFERENCE)

        payload = make_export()
        payload["province_values"][0]["variable"] = "t2m"
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_UNKNOWN_SNAPSHOT_REFERENCE)

    def test_unit_field_must_be_present(self):
        payload = make_export()
        del payload["snapshots"][0]["unit"]
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_MISSING_UNIT_FIELD)

    def test_payload_cannot_claim_approved_public(self):
        payload = make_export(license_status="approved_public")
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_LICENSE_CLAIM_INVALID)

    def test_missing_is_null_and_zero_is_kept(self):
        payload = make_export()
        payload["snapshots"][0]["mean"] = [0.0, None, None, None, None, None]
        counts = cli.validate_export(payload)
        self.assertEqual(counts["cells"], 6)

    def test_grid_cell_limit_is_enforced(self):
        payload = make_export(nx=200, ny=200)
        with self.assertRaises(cli.NwpCliError) as ctx:
            cli.validate_export(payload)
        self.assertEqual(ctx.exception.code, cli.NWP_GRID_TOO_LARGE)


class DryRunTests(unittest.TestCase):
    """--dry-run must never touch D1."""

    def test_dry_run_writes_nothing_to_d1(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            fake = FakeD1Client()
            original = cli.connect_d1_client
            cli.connect_d1_client = lambda *a, **k: fake
            try:
                code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                          "--export", str(export_path), "--dry-run"])
            finally:
                cli.connect_d1_client = original
            self.assertEqual(code, 0, err)
            self.assertEqual(fake.calls, 0)
            summary = last_json(out)
            self.assertEqual(summary["status"], "dry_run")
            self.assertEqual(summary["mode"], "dry_run")
            self.assertEqual(summary["counts"]["snapshots"], 1)
            self.assertEqual(summary["counts"]["province_rows"], 2)
            self.assertEqual(summary["counts"]["cells"], 6)
            self.assertEqual(summary["written"], {"runs": 0, "snapshots": 0, "province_values": 0})
            self.assertFalse(summary["d1"]["write_performed"])
            self.assertIn("p24h@2026-10-27T00:00:00Z", summary["counts"]["by_variable_valid_at"])

    def test_dry_run_is_the_default_without_flags(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            fake = FakeD1Client()
            original = cli.connect_d1_client
            cli.connect_d1_client = lambda *a, **k: fake
            try:
                code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                          "--export", str(export_path)])
            finally:
                cli.connect_d1_client = original
            self.assertEqual(code, 0, err)
            self.assertEqual(fake.calls, 0)
            self.assertEqual(last_json(out)["mode"], "dry_run")

    def test_dry_run_rejects_an_invalid_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            payload = make_export()
            payload["snapshots"][0]["mean"] = [0.0]
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(payload), encoding="utf-8")
            code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                      "--export", str(export_path), "--dry-run"])
            self.assertEqual(code, 1)
            self.assertEqual(last_json(out)["errorCode"], cli.NWP_GRID_LENGTH_MISMATCH)

    def test_missing_export_file_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                      "--export", str(Path(tmp) / "nope.json"), "--dry-run"])
            self.assertEqual(code, 1)
            self.assertEqual(last_json(out)["errorCode"], cli.NWP_EXPORT_NOT_FOUND)


class ConfigurationTests(unittest.TestCase):
    """--write without D1 credentials must fail closed with exit code 2."""

    def test_missing_token_exits_with_2_and_d1_not_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            registry = write_registry(Path(tmp))

            def boom(*args, **kwargs):
                raise CatalogSyncError("D1_CONFIG_MISSING", "D1 token is missing")

            original = cli.connect_d1_client
            cli.connect_d1_client = boom
            try:
                code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                          "--export", str(export_path), "--write",
                                          "--registry", str(registry)])
            finally:
                cli.connect_d1_client = original
            self.assertEqual(code, 2)
            self.assertEqual(last_json(out)["errorCode"], cli.D1_NOT_CONFIGURED)
            self.assertIn("D1_NOT_CONFIGURED", err)

    def test_unreachable_d1_exits_with_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            registry = write_registry(Path(tmp))
            fake = FakeD1Client()
            fake.fail_on = "SELECT 1 AS OK"

            original = cli.connect_d1_client
            cli.connect_d1_client = lambda *a, **k: fake
            try:
                code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                          "--export", str(export_path), "--write",
                                          "--registry", str(registry)])
            finally:
                cli.connect_d1_client = original
            self.assertEqual(code, 2)
            self.assertEqual(last_json(out)["errorCode"], cli.D1_NOT_CONFIGURED)
            self.assertEqual(len(fake.runs), 0)

    def test_licence_gate_blocks_the_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            registry = write_registry(Path(tmp), approved=False)
            fake = FakeD1Client()
            original = cli.connect_d1_client
            cli.connect_d1_client = lambda *a, **k: fake
            try:
                code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                          "--export", str(export_path), "--write",
                                          "--registry", str(registry)])
            finally:
                cli.connect_d1_client = original
            self.assertEqual(code, 1)
            self.assertEqual(last_json(out)["errorCode"], cli.RESOURCE_NOT_APPROVED)
            self.assertEqual(len(fake.runs), 0)


class PublishTests(unittest.TestCase):
    """Writer behaviour: parameter binding, idempotency, failure handling."""

    def _publish(self, export_path, registry, fake):
        original = cli.connect_d1_client
        cli.connect_d1_client = lambda *a, **k: fake
        try:
            return run_cli(["publish", "--run-id", RUN_ID, "--export", str(export_path),
                            "--write", "--registry", str(registry)])
        finally:
            cli.connect_d1_client = original

    def test_publish_twice_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            registry = write_registry(Path(tmp))
            fake = FakeD1Client()

            code, out, err = self._publish(export_path, registry, fake)
            self.assertEqual(code, 0, err)
            first = last_json(out)
            self.assertEqual(first["outcome"], "written")
            self.assertEqual(len(fake.runs), 1)
            self.assertEqual(len(fake.snapshots), 1)
            self.assertEqual(len(fake.province_values), 2)
            self.assertEqual(fake.runs[RUN_ID]["status"], "ready")

            code, out, err = self._publish(export_path, registry, fake)
            self.assertEqual(code, 0, err)
            second = last_json(out)
            self.assertEqual(second["outcome"], "skipped_identical")
            self.assertEqual(second["payload_sha256"], first["payload_sha256"])
            self.assertEqual(len(fake.runs), 1)
            self.assertEqual(len(fake.snapshots), 1)
            self.assertEqual(len(fake.province_values), 2)

    def test_every_statement_binds_its_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            registry = write_registry(Path(tmp))
            fake = FakeD1Client()
            code, out, err = self._publish(export_path, registry, fake)
            self.assertEqual(code, 0, err)
            inserts = [sql for sql, _ in fake.statements if sql.upper().startswith("INSERT")]
            self.assertTrue(inserts)
            for sql in inserts:
                self.assertNotIn("tmd_hpc_d02", sql)
                self.assertNotIn("20261026", sql)
                self.assertIn("?", sql)

    def test_failed_write_marks_the_run_failed_and_keeps_prior_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            registry = write_registry(Path(tmp))
            fake = FakeD1Client()
            fake.seed_run("tmd_hpc_d02_2026102500", "d02", "2026-10-25T00:00:00Z",
                          payload_sha256="old")
            fake.fail_on = "INSERT INTO NWP_SNAPSHOTS"

            code, out, err = self._publish(export_path, registry, fake)
            self.assertEqual(code, 1)
            self.assertEqual(last_json(out)["errorCode"], cli.NWP_WRITE_FAILED)
            self.assertEqual(fake.runs[RUN_ID]["status"], "failed")
            # the previous run is untouched and nothing was deleted
            self.assertIn("tmd_hpc_d02_2026102500", fake.runs)
            self.assertEqual(fake.deleted_run_ids(), [])
            self.assertEqual(len(fake.snapshots), 0)


class RetentionTests(unittest.TestCase):
    """§3.6 retention: 3 newest runs per domain, runs older than 7 days go."""

    def test_retention_keeps_three_newest_runs_per_domain(self):
        fake = FakeD1Client()
        now = datetime(2026, 10, 26, 12, 0, 0, tzinfo=timezone.utc)
        ages = [0, 1, 2, 3, 4, 20]
        for index, age in enumerate(ages):
            fake.seed_run(f"tmd_hpc_d02_run{index}", "d02",
                          (now - timedelta(days=age)).strftime("%Y-%m-%dT%H:%M:%SZ"))
        fake.seed_run("tmd_hpc_d01_run0", "d01", "2026-10-26T00:00:00Z")

        deleted = cli.prune_runs(fake, reference=now)

        self.assertEqual(sorted(deleted and [row["run_id"] for row in deleted]),
                         ["tmd_hpc_d02_run3", "tmd_hpc_d02_run4", "tmd_hpc_d02_run5"])
        self.assertEqual(len(fake.runs), 4)
        self.assertIn("tmd_hpc_d01_run0", fake.runs)
        self.assertIn("tmd_hpc_d02_run0", fake.runs)
        self.assertIn("tmd_hpc_d02_run2", fake.runs)
        self.assertNotIn("tmd_hpc_d02_run3", fake.runs)
        reasons = {row["run_id"]: row["reason"] for row in deleted}
        self.assertIn("beyond_keep_per_domain", reasons["tmd_hpc_d02_run3"])
        self.assertIn("older_than_max_age", reasons["tmd_hpc_d02_run5"])

    def test_retention_deletes_only_rows_older_than_seven_days(self):
        fake = FakeD1Client()
        now = datetime(2026, 10, 26, 12, 0, 0, tzinfo=timezone.utc)
        for index, age in enumerate([0, 1, 2]):
            fake.seed_run(f"tmd_hpc_d02_keep{index}", "d02",
                          (now - timedelta(days=age)).strftime("%Y-%m-%dT%H:%M:%SZ"))
        fake.seed_run("tmd_hpc_d02_old", "d02", "2026-10-01T00:00:00Z")

        deleted = cli.prune_runs(fake, reference=now, keep_per_domain=10)

        self.assertEqual([row["run_id"] for row in deleted], ["tmd_hpc_d02_old"])
        self.assertEqual(len(fake.runs), 3)


class CliSurfaceTests(unittest.TestCase):
    """Command surface and JSON summary contract."""

    def test_help_works(self):
        with self.assertRaises(SystemExit) as ctx:
            with contextlib.redirect_stdout(io.StringIO()):
                cli.main(["--help"])
        self.assertEqual(ctx.exception.code, 0)

    def test_every_command_is_registered(self):
        parser = cli.build_parser()
        actions = [action for action in parser._actions if action.dest == "command"]
        self.assertTrue(actions)
        choices = set(actions[0].choices)
        self.assertEqual(choices, {"list", "fetch", "normalize", "export", "publish"})

    def test_publish_flags(self):
        parser = cli.build_parser()
        args = parser.parse_args(["publish", "--run-id", RUN_ID, "--dry-run"])
        self.assertTrue(args.dry_run)
        self.assertFalse(args.write)
        args = parser.parse_args(["publish", "--run-id", RUN_ID, "--write"])
        self.assertTrue(args.write)
        self.assertFalse(args.dry_run)

    def test_dry_run_and_write_are_mutually_exclusive(self):
        code, out, err = run_cli(["publish", "--run-id", RUN_ID, "--dry-run", "--write"])
        self.assertEqual(code, 1)
        self.assertIn("mutually exclusive", err)

    def test_json_summary_is_the_last_stdout_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            export_path = Path(tmp) / "export.json"
            export_path.write_text(json.dumps(make_export()), encoding="utf-8")
            code, out, err = run_cli(["publish", "--run-id", RUN_ID,
                                      "--export", str(export_path), "--dry-run"])
            self.assertEqual(code, 0, err)
            summary = last_json(out)
            self.assertEqual(summary["command"], "publish")
            self.assertEqual(summary["run_id"], RUN_ID)
            self.assertIn("payload_sha256", summary)

    def test_payload_sha256_is_stable_and_payload_sensitive(self):
        payload = make_export()
        digest = cli.payload_sha256(payload)
        self.assertEqual(digest, cli.payload_sha256(json.loads(json.dumps(payload))))
        other = make_export()
        other["snapshots"][0]["mean"] = [0.5] + [None] * 5
        self.assertNotEqual(digest, cli.payload_sha256(other))


class ExportContractTests(unittest.TestCase):
    """The canonical export contract shared with the web lane."""

    def test_canonicalize_accepts_a_flat_run_block(self):
        raw = {
            "run_id": RUN_ID, "source_id": cli.SOURCE_ID, "domain": "d02",
            "init_at": "2026-10-26T00:00:00Z", "retrieved_at": "2026-10-26T08:30:00Z",
            "license_status": "pending", "unit_status": "pending_official_confirmation",
            "publication_mode": "numeric_preview", "variables": ["p24h"],
            "lead_hours": [0], "grid": {"nx": 2, "ny": 3},
            "snapshots": [{"variable": "p24h", "valid_at": VALID_AT, "unit": None,
                           "bbox": [96.0, 5.0, 106.0, 21.0], "nx": 2, "ny": 3,
                           "mean": [0.0] * 6, "max": [0.0] * 6, "quality": {}}],
            "province_values": [],
        }
        export = cli.canonicalize_export(raw)
        counts = cli.validate_export(export)
        self.assertEqual(counts["snapshots"], 1)
        self.assertEqual(export["run"]["run_id"], RUN_ID)

    def test_canonicalize_accepts_json_string_columns(self):
        export = cli.canonicalize_export({
            "run": {"run_id": RUN_ID, "source_id": cli.SOURCE_ID, "domain": "d02",
                    "init_at": "2026-10-26T00:00:00Z", "retrieved_at": "2026-10-26T08:30:00Z",
                    "license_status": "pending", "unit_status": "pending_official_confirmation",
                    "publication_mode": "numeric_preview", "variables": ["p24h"],
                    "lead_hours": [0], "grid": {"nx": 2, "ny": 3}},
            "snapshots": [{"variable": "p24h", "valid_at": VALID_AT, "unit": None,
                           "bbox_json": json.dumps([96.0, 5.0, 106.0, 21.0]),
                           "nx": 2, "ny": 3,
                           "mean_json": json.dumps([0.0] * 6),
                           "max_json": json.dumps([0.0] * 6),
                           "quality_json": "{}"}],
            "province_values": [],
        })
        counts = cli.validate_export(export)
        self.assertEqual(counts["cells"], 6)

    def test_run_id_helper_matches_the_web_contract(self):
        self.assertEqual(cli.run_id_for("2026102600", "d02"), RUN_ID)


class LaneBContractTests(unittest.TestCase):
    """The publisher must accept the export Lane B really produces."""

    def setUp(self):
        try:
            from tadih import tmd_hpc_normalize
        except ImportError:  # pragma: no cover - Lane B not landed yet
            self.skipTest("tadih.tmd_hpc_normalize is not available yet")
        self.normalizer = tmd_hpc_normalize

    def _normalized_envelope(self):
        cells = 6
        return {
            "run_id": RUN_ID,
            "source_id": cli.SOURCE_ID,
            "domain": "d02",
            "domain_label": "Thailand 3km",
            "init_at": "2026-10-26T00:00:00Z",
            "retrieved_at": "2026-10-26T08:30:00Z",
            "license_status": "pending",
            "unit_status": "pending_official_confirmation",
            "publication_mode": "numeric_preview",
            "variables": ["p24h"],
            "lead_hours_by_variable": {"p24h": [0.0, 6.0]},
            "excluded": [],
            "grid": {"bbox": [96.0, 5.0, 106.0, 21.0], "nx": 2, "ny": 3, "cell_deg": 0.15},
            "snapshots": [
                {
                    "variable": "p24h", "valid_at": VALID_AT, "unit": None,
                    "unit_status": "pending_official_confirmation",
                    "source_unit": "mm", "unit_transform": None,
                    "mean": [0.0] + [None] * (cells - 1),
                    "max": [1.0] + [None] * (cells - 1),
                    "count": [1] * cells,
                },
                {
                    "variable": "p24h", "valid_at": OTHER_VALID_AT, "unit": None,
                    "unit_status": "pending_official_confirmation",
                    "source_unit": "mm", "unit_transform": None,
                    "mean": [None] * cells,
                    "max": [None] * cells,
                    "count": [0] * cells,
                },
            ],
            "provinces": [
                {
                    "variable": "p24h", "valid_at": VALID_AT, "province_code": "10",
                    "province_name": "กรุงเทพมหานคร", "value": 1.0,
                    "method": "max_within_25km", "radius_km": 25.0,
                    "distance_km": 1.25, "cell_count": 18,
                },
            ],
            "units": {"p24h": {"source_unit": "mm", "unit_transform": None, "unit": None,
                               "unit_status": "pending_official_confirmation"}},
        }

    def test_lane_b_export_is_accepted_and_publishable(self):
        raw_export = self.normalizer.build_export(self._normalized_envelope())
        export = cli.canonicalize_export(raw_export)
        counts = cli.validate_export(export)
        self.assertEqual(counts["snapshots"], 2)
        self.assertEqual(counts["province_rows"], 1)
        self.assertEqual(counts["cells"], 12)
        # Lane B emits the lead hours as integral floats; they must be stored as ints.
        self.assertEqual(export["run"]["lead_hours"], [0, 6])
        # Lane B leaves the risk level to the consumer.
        self.assertIsNone(export["province_values"][0].get("risk_level"))
        # Lane B keeps the unit null until TMD confirms it.
        self.assertIsNone(export["snapshots"][0]["unit"])

        with tempfile.TemporaryDirectory() as tmp:
            registry = write_registry(Path(tmp))
            fake = FakeD1Client()
            report = cli.publish_export(fake, export, registry_path=registry)
            self.assertEqual(report["outcome"], "written")
            self.assertEqual(len(fake.runs), 1)
            self.assertEqual(len(fake.snapshots), 2)
            self.assertEqual(len(fake.province_values), 1)
            row = fake.runs[RUN_ID]
            self.assertEqual(row["status"], "ready")
            self.assertEqual(json.loads(row["lead_hours_json"]), [0, 6])
            self.assertEqual(row["license_status"], "pending")
            snapshot_row = list(fake.snapshots.values())[0]
            self.assertEqual(json.loads(snapshot_row["mean_json"]), [0.0] + [None] * 5)
            self.assertIsNone(snapshot_row["unit"])
            self.assertEqual(json.loads(snapshot_row["quality_json"])["method"],
                             "block_mean_0.15deg")

    def test_lane_b_export_is_republished_as_identical(self):
        export = cli.canonicalize_export(
            self.normalizer.build_export(self._normalized_envelope()))
        with tempfile.TemporaryDirectory() as tmp:
            registry = write_registry(Path(tmp))
            fake = FakeD1Client()
            first = cli.publish_export(fake, export, registry_path=registry)
            second = cli.publish_export(fake, export, registry_path=registry)
            self.assertEqual(first["outcome"], "written")
            self.assertEqual(second["outcome"], "skipped_identical")
            self.assertEqual(len(fake.snapshots), 2)
            self.assertEqual(len(fake.province_values), 1)


class MigrationSqlTests(unittest.TestCase):
    """The migration must be valid SQLite and accept the publisher's SQL."""

    def setUp(self):
        import sqlite3

        self.sqlite3 = sqlite3
        self.connection = sqlite3.connect(":memory:")
        self.connection.execute("PRAGMA foreign_keys = ON")
        for name in ("0001_hub.sql", "0002_observation_extensions.sql", "0003_nwp.sql"):
            path = ROOT / "db/cloudflare" / name
            if not path.is_file():
                continue
            self.connection.executescript(path.read_text(encoding="utf-8"))
        self.connection.commit()

    def tearDown(self):
        self.connection.close()

    def test_migration_creates_the_nwp_tables(self):
        names = {row[0] for row in self.connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertIn("nwp_runs", names)
        self.assertIn("nwp_snapshots", names)
        self.assertIn("nwp_province_values", names)
        indexes = {row[0] for row in self.connection.execute(
            "SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertIn("nwp_runs_init_idx", indexes)
        self.assertIn("nwp_province_lookup_idx", indexes)

    def test_publisher_sql_runs_against_the_real_schema(self):
        payload = cli.canonicalize_export(make_export())
        with tempfile.TemporaryDirectory() as tmp:
            registry = write_registry(Path(tmp))
            adapter = _SqliteD1(self.connection)
            report = cli.publish_export(adapter, payload, registry_path=registry)
            self.assertEqual(report["outcome"], "written")
            rows = self.connection.execute(
                "SELECT run_id, status, payload_sha256 FROM nwp_runs").fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][0], RUN_ID)
            self.assertEqual(rows[0][1], "ready")
            self.assertEqual(rows[0][2], cli.payload_sha256(payload))
            self.assertEqual(self.connection.execute(
                "SELECT COUNT(*) FROM nwp_snapshots").fetchone()[0], 1)
            self.assertEqual(self.connection.execute(
                "SELECT COUNT(*) FROM nwp_province_values").fetchone()[0], 2)

    def test_publisher_sql_is_idempotent_against_the_real_schema(self):
        payload = cli.canonicalize_export(make_export())
        with tempfile.TemporaryDirectory() as tmp:
            registry = write_registry(Path(tmp))
            adapter = _SqliteD1(self.connection)
            cli.publish_export(adapter, payload, registry_path=registry)
            cli.publish_export(adapter, payload, registry_path=registry)
            self.assertEqual(self.connection.execute(
                "SELECT COUNT(*) FROM nwp_runs").fetchone()[0], 1)
            self.assertEqual(self.connection.execute(
                "SELECT COUNT(*) FROM nwp_snapshots").fetchone()[0], 1)
            self.assertEqual(self.connection.execute(
                "SELECT COUNT(*) FROM nwp_province_values").fetchone()[0], 2)

    def test_cascade_deletes_child_rows(self):
        payload = cli.canonicalize_export(make_export())
        with tempfile.TemporaryDirectory() as tmp:
            registry = write_registry(Path(tmp))
            adapter = _SqliteD1(self.connection)
            cli.publish_export(adapter, payload, registry_path=registry)
            self.connection.execute("DELETE FROM nwp_runs WHERE run_id = ?", (RUN_ID,))
            self.connection.commit()
            self.assertEqual(self.connection.execute(
                "SELECT COUNT(*) FROM nwp_snapshots").fetchone()[0], 0)
            self.assertEqual(self.connection.execute(
                "SELECT COUNT(*) FROM nwp_province_values").fetchone()[0], 0)


class _SqliteD1:
    """Adapter that lets the publisher run against a real SQLite database."""

    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, params=None):
        cursor = self.connection.execute(sql, list(params or []))
        rows = cursor.fetchall()
        self.connection.commit()
        if not rows:
            return {}
        columns = [description[0] for description in cursor.description]
        return dict(zip(columns, rows[0]))


if __name__ == "__main__":
    unittest.main()
