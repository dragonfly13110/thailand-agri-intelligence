import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from tadih.ingestion import save_snapshot, snapshot_complete


class CliTests(unittest.TestCase):
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

    def test_modis_ndvi_cli_file(self):
        sample_path = Path(__file__).resolve().parents[1] / "data/local/satellite/pc_point_20240929.json"
        if not sample_path.exists():
            return
        result = subprocess.run([sys.executable, "-m", "tadih", "modis-ndvi", "--file", str(sample_path)],
                                capture_output=True, check=True)
        payload = json.loads(result.stdout.decode("utf-8"))
        self.assertEqual("point:13.8:100.25", payload["location_id"])
        self.assertEqual(0.5700, payload["ndvi"])
        self.assertEqual(0.0, payload["valid_fraction"])
        self.assertEqual("cloud_contaminated", payload["quality_flag"])
        self.assertEqual("grid_point", payload["spatial_support"])


if __name__ == "__main__":
    unittest.main()
