import json
import os
from pathlib import Path
import subprocess
import unittest


@unittest.skipUnless(os.name == "nt", "Windows Task Scheduler wrapper")
class RefreshScriptTests(unittest.TestCase):
    def test_command_preview_and_invalid_year(self):
        script = Path(__file__).resolve().parents[1] / "scripts/refresh_prices.ps1"
        command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(script)]
        for extra, refresh in (([], True), (["-Resume"], False)):
            result = subprocess.run(command + ["-DryRun", "-YearTh", "2569"] + extra,
                                    capture_output=True, check=True)
            payload = json.loads(result.stdout)
            self.assertEqual("--refresh" in payload["arguments"], refresh)
            self.assertIn("2569", payload["arguments"])
        result = subprocess.run(command + ["-DryRun", "-YearTh", "1"], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
