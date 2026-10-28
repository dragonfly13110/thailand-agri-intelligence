import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from tadih.ingestion import save_snapshot, snapshot_complete


class CliTests(unittest.TestCase):
    def test_livestock_stages_without_opening_warehouse(self):
        from contextlib import redirect_stdout
        import io
        from unittest.mock import patch
        from tadih.cli import main
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / "dld/livestock-value"
            folder.mkdir(parents=True)
            capture = {"manifest": {"checksum": "a" * 64}, "rows": [{"value": None, "license_status": "pending"}]}
            output = io.StringIO()
            with patch("tadih.livestock.capture_livestock_value", return_value=capture), patch("tadih.cli.connect", side_effect=AssertionError("staging must not open warehouse")), redirect_stdout(output):
                self.assertEqual(main(["dld-livestock-value", "--output", directory]), 0)
            result = json.loads(output.getvalue())
            self.assertEqual(result["source_rows"], 1)
            self.assertIsNone(json.loads(Path(result["staged_path"]).read_text(encoding="utf-8"))[0]["value"])

    def test_machine_json_is_utf8_even_when_windows_pipe_encoding_is_ascii(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            path.write_text("{}", encoding="utf-8")
            result = subprocess.run([sys.executable, "-m", "tadih", "decision", "water", str(path)],
                env={**os.environ, "PYTHONIOENCODING": "ascii"}, capture_output=True, check=True)
            payload = json.loads(result.stdout.decode("utf-8"))
            self.assertEqual(payload["status"], "unknown")
            self.assertIn("ตรวจสอบ", payload["recommended_action"])
            self.assertNotIn("\ufffd", payload["recommended_action"])

    def test_failed_capture_does_not_establish_or_replace_success_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            failed = save_snapshot({"source_id": "oae", "status": "unreachable"}, "oae", directory)
            self.assertEqual(failed["status"], "failed")
            self.assertFalse(snapshot_complete("oae", directory))
            success = save_snapshot({"source_id": "oae", "status": "ok", "payload": {}}, "oae", directory)
            save_snapshot({"source_id": "oae", "status": "access_denied_or_filtered"}, "oae", directory)
            self.assertTrue(snapshot_complete("oae", directory))
            manifest = json.loads((Path(directory) / "oae/probe/manifest.json").read_text())
            self.assertEqual(manifest["checksum"], success["checksum"])

    def test_rid_reservoirs_cli_help(self):
        result = subprocess.run([sys.executable, "-m", "tadih", "rid-reservoirs", "--help"],
                                capture_output=True, check=True)
        self.assertIn(b"rid-reservoirs", result.stdout)
        self.assertIn(b"--backfill-start", result.stdout)
        self.assertIn(b"--ingest", result.stdout)

if __name__ == "__main__":
    unittest.main()
