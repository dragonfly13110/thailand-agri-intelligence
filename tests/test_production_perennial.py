"""Checks for the distinct perennial annual-grain resource."""
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from tadih.production_perennial import LABELS, MEASURES, SOURCE_URL, fetch_perennial, stage_perennial

class Response(io.BytesIO):
    def __init__(self, body):
        super().__init__(body)
        self.headers = {'Content-Type': 'text/csv', 'Content-Length': str(len(body))}
    def geturl(self):
        return SOURCE_URL

class PerennialTests(unittest.TestCase):
    def test_grain_missing_resume_corruption_and_failure(self):
        s = io.StringIO(newline='')
        writer = csv.writer(s)
        writer.writerow(list(LABELS) + list(MEASURES))
        row = ['2566', 'นครปฐม', 'พุทธมณฑล', 'ศาลายา', 'ไม้ผล', 'มะม่วง', '', '1', '-', '0', '2', '3']
        writer.writerow(row)
        invalid = row.copy()
        invalid[7] = '-2'
        writer.writerow(invalid)
        body = s.getvalue().encode('utf-8-sig')
        calls = []
        def opener(request, **kwargs):
            calls.append(request.get_method())
            return Response(body)
        with tempfile.TemporaryDirectory() as tmp:
            raw = fetch_perennial(tmp, opener=opener)
            resumed = fetch_perennial(tmp, opener=lambda *a, **k: self.fail('network on resume'))
            self.assertEqual(raw['sha256'], resumed['sha256'])
            report = stage_perennial(raw['path'], Path(tmp) / 'staged')
            self.assertEqual(report['quarantined_records'], 1)
            self.assertEqual(report['records'], 1)
            record = json.loads((Path(report['output']) / 'records.jsonl').read_text(encoding='utf-8'))
            self.assertNotIn('month', record)
            self.assertNotIn('planting_round', record)
            self.assertIsNone(record['standing_area_rai'])
            self.assertFalse(record['rollup_eligible'])
            self.assertEqual(record['license_status'], 'pending')
            self.assertEqual(stage_perennial(raw['path'], Path(tmp) / 'staged'), report)
            (Path(report['output']) / 'records.jsonl').write_text('bad')
            with self.assertRaisesRegex(ValueError, 'corrupt'):
                stage_perennial(raw['path'], Path(tmp) / 'staged')
            Path(raw['path']).write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError, 'checkpoint'):
                fetch_perennial(tmp, opener=lambda *a, **k: self.fail('network'))
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                fetch_perennial(tmp, opener=lambda *a, **k: Response(b'<html>bad</html>'))
            self.assertFalse(list(Path(tmp).rglob('manifest.json')))
