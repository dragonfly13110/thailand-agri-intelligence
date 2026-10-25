"""Unit tests for the scripts/sync_rid_reservoirs.py command-line interface.

Every test runs in-process with mocked fetcher. No real network calls are made.
Tests verify:
- require_reservoir_document validation
- check_expected_reservoir_count tolerance band
- dry-run execution (prints summary, does not write files, exits 0)
- live snapshot writing and sync-log.jsonl logging
- idempotent re-run (skipped_identical)
- overwrite guard requiring --refresh
- fail-closed behavior on invalid dates, corrupted documents, or missing license
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


def _load_cli():
    path = ROOT / "scripts" / "sync_rid_reservoirs.py"
    spec = importlib.util.spec_from_file_location("tadih_sync_rid_reservoirs_cli_tests", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


cli = _load_cli()


def make_dummy_reservoir(rid: str, name: str, volume: float = 10.0, storage: float = 20.0):
    return {
        "id": rid,
        "name": name,
        "storage": storage,
        "dead_storage": 1.0,
        "volume": volume,
        "percent_storage": round((volume / storage) * 100, 2),
        "inflow": 0.5,
        "outflow": 0.2,
    }


def make_raw_payload(report_date: str = "2026-10-25", count: int = 461, volume: float = 10.0):
    reservoirs = [make_dummy_reservoir(f"rsv_{i}", f"อ่าง_{i}", volume=volume) for i in range(count)]
    return {
        "date": report_date,
        "document": "รายงานสถานการณ์น้ำในอ่างเก็บน้ำขนาดกลาง",
        "total": count,
        "data": [
            {
                "region": "ภาคกลาง",
                "reservoir": reservoirs,
            }
        ],
    }


class RequireReservoirDocumentTests(unittest.TestCase):
    def test_valid_document_returns_string(self):
        doc = cli.require_reservoir_document({"document": "รายงานอ่างเก็บน้ำ"})
        self.assertEqual(doc, "รายงานอ่างเก็บน้ำ")

    def test_missing_or_blank_document_raises_value_error(self):
        for invalid in [{}, {"document": ""}, {"document": "   "}, None, "string"]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    cli.require_reservoir_document(invalid)


class CheckExpectedReservoirCountTests(unittest.TestCase):
    def test_exact_and_within_band_accepted(self):
        # 461 +/- 5% is approx 438 to 484
        cli.check_expected_reservoir_count(461)
        cli.check_expected_reservoir_count(440)
        cli.check_expected_reservoir_count(480)

    def test_outside_band_raises_value_error(self):
        with self.assertRaises(ValueError):
            cli.check_expected_reservoir_count(400)
        with self.assertRaises(ValueError):
            cli.check_expected_reservoir_count(500)


class SyncRidReservoirsCliTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.output_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    @mock.patch.object(cli, "fetch_json")
    def test_dry_run_exits_zero_and_writes_no_files(self, mock_fetch_json):
        mock_fetch_json.return_value = make_raw_payload("2026-10-25", 461)

        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = cli.main(["--dry-run", "--output-dir", str(self.output_dir)])

        self.assertEqual(code, 0)
        self.assertIn("Dry run OK: report validated; no files written.", stdout.getvalue())
        self.assertIn("RID medium-reservoir report 2026-10-25", stdout.getvalue())
        # Confirm no files were written to output_dir
        self.assertEqual(list(self.output_dir.iterdir()), [])

    @mock.patch.object(cli, "fetch_json")
    def test_live_sync_writes_snapshot_and_appends_log(self, mock_fetch_json):
        mock_fetch_json.return_value = make_raw_payload("2026-10-25", 461)

        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = cli.main(["--output-dir", str(self.output_dir)])

        self.assertEqual(code, 0)
        snapshot_file = self.output_dir / "rid" / "reservoir-2026-10-25.json"
        log_file = self.output_dir / "rid" / "sync-log.jsonl"
        self.assertTrue(snapshot_file.is_file())
        self.assertTrue(log_file.is_file())

        # Verify snapshot content
        saved_snap = json.loads(snapshot_file.read_text(encoding="utf-8"))
        self.assertEqual(saved_snap["report_date"], "2026-10-25")

        # Verify log line
        log_lines = [json.loads(line) for line in log_file.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertEqual(len(log_lines), 1)
        self.assertEqual(log_lines[0]["action"], "written")
        self.assertEqual(log_lines[0]["reservoir_count"], 461)
        self.assertEqual(log_lines[0]["license_status"], "pending")

    @mock.patch.object(cli, "fetch_json")
    def test_idempotent_rerun_skips_identical(self, mock_fetch_json):
        mock_fetch_json.return_value = make_raw_payload("2026-10-25", 461)

        # First run: writes
        cli.main(["--output-dir", str(self.output_dir)])

        # Second run: identical content skips write
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = cli.main(["--output-dir", str(self.output_dir)])

        self.assertEqual(code, 0)
        self.assertIn("Snapshot skipped_identical", stdout.getvalue())

        log_file = self.output_dir / "rid" / "sync-log.jsonl"
        log_lines = [json.loads(line) for line in log_file.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertEqual(len(log_lines), 2)
        self.assertEqual(log_lines[1]["action"], "skipped_identical")

    @mock.patch.object(cli, "fetch_json")
    def test_conflicting_content_requires_refresh_flag(self, mock_fetch_json):
        mock_fetch_json.return_value = make_raw_payload("2026-10-25", 461, volume=10.0)
        cli.main(["--output-dir", str(self.output_dir)])

        # Now simulate a second fetch of same date but different volume (different signature)
        mock_fetch_json.return_value = make_raw_payload("2026-10-25", 461, volume=15.0)

        # Running without --refresh must fail
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = cli.main(["--output-dir", str(self.output_dir)])
        self.assertEqual(code, 1)
        self.assertIn("pass --refresh to overwrite", stderr.getvalue())

        # Running WITH --refresh must succeed
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = cli.main(["--output-dir", str(self.output_dir), "--refresh"])
        self.assertEqual(code, 0)
        self.assertIn("Snapshot written", stdout.getvalue())

    @mock.patch.object(cli, "fetch_json")
    def test_historical_date_seeds_current_report_and_writes_target(self, mock_fetch_json):
        current_payload = make_raw_payload("2026-10-25", 461, volume=10.0)
        historical_payload = make_raw_payload("2026-10-24", 461, volume=12.0)

        def fake_fetch_json(url):
            if "2026-10-24" in url:
                return historical_payload
            return current_payload

        mock_fetch_json.side_effect = fake_fetch_json

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = cli.main(["--date", "2026-10-24", "--output-dir", str(self.output_dir)])

        self.assertEqual(code, 0)
        snapshot_file = self.output_dir / "rid" / "reservoir-2026-10-24.json"
        self.assertTrue(snapshot_file.is_file())
        self.assertEqual(mock_fetch_json.call_count, 2)

    def test_invalid_dates_fail_closed_before_network(self):
        for invalid_date in ["2026-02-30", "2027-01-01", "1997-12-31", "invalid-date"]:
            with self.subTest(invalid_date=invalid_date):
                stderr = io.StringIO()
                with contextlib.redirect_stderr(stderr):
                    code = cli.main(["--date", invalid_date, "--output-dir", str(self.output_dir)])
                self.assertEqual(code, 1)

    @mock.patch.object(cli, "fetch_json")
    def test_missing_or_non_pending_license_fails_closed(self, mock_fetch_json):
        payload = make_raw_payload("2026-10-25", 461)
        mock_fetch_json.return_value = payload

        # Test license tampering before write
        with mock.patch.object(cli, "fetch_report") as mock_fetch_rep:
            env = cli.fetch_reservoirs("2026-10-25", fetcher=lambda _: payload)
            env["license_status"] = "approved_public"
            mock_fetch_rep.return_value = (env, None)
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = cli.main(["--output-dir", str(self.output_dir)])
            self.assertEqual(code, 1)
            self.assertTrue(
                "expected an RID medium-reservoir raw report" in stderr.getvalue()
                or "RID envelope license_status is no longer 'pending'" in stderr.getvalue()
            )


if __name__ == "__main__":
    unittest.main()
