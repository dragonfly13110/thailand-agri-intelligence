"""Dry-season plans keep source grain, missing values and immutable revisions."""
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest

from tadih.plan_dryplant import FIELDS, SOURCE_URL, capture_dryplant, stage_dryplant


def csv_bytes(**changes):
    row = dict.fromkeys(FIELDS, '')
    row.update(crop_year='2026', crop_year_be='2569', period_name='ปีเพาะปลูก 2026',
               period_type='YEARLY', season_type='DRY', irrigation_type='IN_IRRIGATION',
               is_in_project_zone='False', province_code='90', province_name='สงขลา',
               district_code='9006', district_name='สะบ้าย้อย', subdistrict_code='900601',
               subdistrict_name='สะบ้าย้อย', dry_group_name='กลุ่มพืชผัก',
               dry_type_name='พืชผักอื่นๆ', planned_area_rai='0', planned_households='--',
               updated_at='2026-08-16 01:25:57.174000+07:00')
    row.update(changes)
    s = io.StringIO(newline='')
    writer = csv.DictWriter(s, fieldnames=row)
    writer.writeheader()
    writer.writerow(row)
    writer.writerow(row)  # Keep source duplicates; never silently sum or discard.
    return s.getvalue().encode('utf-8-sig')


class Response(io.BytesIO):
    def __init__(self, body, url=SOURCE_URL):
        super().__init__(body)
        self.headers = {'Content-Type': 'text/csv', 'Content-Length': str(len(body))}
        self.url = url

    def geturl(self):
        return self.url


class DryplantTests(unittest.TestCase):
    def test_capture_stage_resume_and_corruption(self):
        body = csv_bytes()
        with tempfile.TemporaryDirectory() as directory:
            raw = capture_dryplant(directory, opener=lambda *a, **k: Response(body))
            resumed = capture_dryplant(directory, opener=lambda *a, **k: self.fail('network on resume'))
            self.assertEqual(raw['sha256'], resumed['sha256'])
            report = stage_dryplant(raw['path'], Path(directory) / 'staged')
            self.assertEqual((report['records'], report['duplicate_identities']), (2, 1))
            row = json.loads((Path(report['output']) / 'records.jsonl').read_text(encoding='utf-8').splitlines()[0])
            self.assertEqual(row['planned_area_rai'], 0)
            for field in ('planned_households', 'crop_code', 'variety_name', 'month_no', 'release_at'):
                self.assertIsNone(row[field])
            self.assertEqual(row['subdistrict_code'], '900601')
            self.assertEqual(row['irrigation_type'], 'IN_IRRIGATION')
            self.assertEqual(row['is_in_project_zone'], 'False')
            self.assertEqual(row['license_status'], 'pending')
            self.assertFalse(row['rollup_eligible'])
            self.assertEqual(stage_dryplant(raw['path'], Path(directory) / 'staged'), report)
            (Path(report['output']) / 'records.jsonl').write_text('bad')
            with self.assertRaisesRegex(ValueError, 'corrupt'):
                stage_dryplant(raw['path'], Path(directory) / 'staged')
            Path(raw['path']).write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError, 'checkpoint'):
                capture_dryplant(directory)

    def test_quarantine_and_schema_drift(self):
        for changes in ({'planned_area_rai': '-1'}, {'planned_area_rai': 'NaN'},
                        {'planned_area_rai': '1,23'}, {'province_code': '73'},
                        {'crop_year_be': '2568'}, {'period_type': 'MONTHLY'},
                        {'month_no': '1'}, {'irrigation_type': 'UNKNOWN'}):
            with self.subTest(changes=changes), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'source.csv'
                path.write_bytes(csv_bytes(**changes))
                report = stage_dryplant(path, Path(directory) / 'staged')
                self.assertEqual((report['records'], report['quarantined_records']), (0, 2))
        for body, url in ((b'<html>error</html>', SOURCE_URL),
                          (csv_bytes(person_name='private'), SOURCE_URL),
                          (csv_bytes(), 'https://example.org/data.csv')):
            with self.subTest(url=url), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    capture_dryplant(directory, opener=lambda *a, **k: Response(body, url))
                self.assertFalse(list(Path(directory).rglob('manifest.json')))

    def test_refresh_preserves_old_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            old = capture_dryplant(directory, opener=lambda *a, **k: Response(csv_bytes()))
            new = capture_dryplant(directory, refresh=True,
                                   opener=lambda *a, **k: Response(csv_bytes(planned_area_rai='1,000')))
            self.assertNotEqual(old['sha256'], new['sha256'])
            self.assertTrue(Path(old['path']).is_file())
            with self.assertRaises(ValueError):
                capture_dryplant(directory, refresh=True, opener=lambda *a, **k: Response(b'bad'))
            self.assertEqual(capture_dryplant(directory)['sha256'], new['sha256'])

    def test_download_bounds_and_truncation(self):
        for body, length in ((b'x' * (2 * 1024 * 1024 + 1), None),
                             (csv_bytes(), '2097153'), (csv_bytes(), '1')):
            with self.subTest(length=length), tempfile.TemporaryDirectory() as directory:
                response = Response(body)
                if length is None:
                    response.headers.pop('Content-Length')
                else:
                    response.headers['Content-Length'] = length
                with self.assertRaises(ValueError):
                    capture_dryplant(directory, opener=lambda *a, **k: response)
                self.assertFalse(list(Path(directory).rglob('manifest.json')))
