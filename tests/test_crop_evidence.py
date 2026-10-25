import csv
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from tadih.crop_evidence import build_crop_evidence
from tadih.catalog import ROOT
from tadih.production import IDENTITY, MEASURES, RESOURCE_ID, _digest


class CropEvidenceTests(unittest.TestCase):
    def test_private_dossier_preserves_missing_and_blocks_unsafe_joins(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'config').mkdir()
            shutil.copyfile(ROOT / 'config/provinces.csv', root / 'config/provinces.csv')
            stage = root / 'data/local/production/staged/test'
            stage.mkdir(parents=True)
            artifact = stage / 'records.jsonl'
            rows = []
            for month in (1, 2):
                row = dict.fromkeys(IDENTITY, 'ทดสอบ')
                row.update(year_ad=2023, month=month, province_name='นครปฐม',
                           crop_type='ข้าวนาปี', planting_round='1',
                           source_record_number=month, source_row_hash=str(month)*64,
                           resource_id=RESOURCE_ID, license_status='pending')
                row.update(dict.fromkeys(MEASURES.values()))
                row['production_kg'] = 0 if month == 1 else None
                row['phone'] = 'MUST-NOT-COPY'
                rows.append(row)
            artifact.write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in rows), encoding='utf-8')
            (stage/'inventory.json').write_text(json.dumps({'source_rows': 2, 'output_sha256': {'records.jsonl': _digest(artifact)}}), encoding='utf-8')
            crosswalk = stage.parents[1] / 'admin_crosswalk.csv'
            fields = ['province_name','district_name','subdistrict_name','province_code','district_code','subdistrict_code','mapping_status','temporal_status','master_version']
            reference = dict(province_name='นครปฐม',district_name='ทดสอบ',subdistrict_name='ทดสอบ',province_code='73',district_code='7307',subdistrict_code='730701',mapping_status='matched_snapshot',temporal_status='snapshot_only',master_version='2023-09-01')
            def write_crosswalk(items):
                with crosswalk.open('w', encoding='utf-8', newline='') as stream:
                    writer = csv.DictWriter(stream, fieldnames=fields)
                    writer.writeheader()
                    writer.writerows(items)
            write_crosswalk([reference])
            result = build_crop_evidence(root, '73', 2023, 'ข้าวนาปี')
            self.assertEqual(result['matched_rows'], 2)
            self.assertEqual(result['snapshot_matched_rows'], 2)
            self.assertEqual(result['completeness']['production_kg'], {'present_rows':1,'missing_rows':1})
            self.assertEqual(len(result['row_references']), 2)
            self.assertTrue(all(value is False for value in result['gates'].values()))
            self.assertNotIn('MUST-NOT-COPY', json.dumps(result))
            self.assertNotIn('production_kg', result['row_references'][0])
            self.assertEqual(build_crop_evidence(root, '73', 2024, 'ข้าวนาปี')['matched_rows'], 0)
            write_crosswalk([reference, reference])
            with self.assertRaisesRegex(ValueError, 'duplicate crosswalk'):
                build_crop_evidence(root, '73', 2023, 'ข้าวนาปี')
            write_crosswalk([{**reference, 'province_code':'74'}])
            with self.assertRaisesRegex(ValueError, 'crosswalk province'):
                build_crop_evidence(root, '73', 2023, 'ข้าวนาปี')
            write_crosswalk([])
            self.assertEqual(build_crop_evidence(root, '73', 2023, 'ข้าวนาปี')['snapshot_matched_rows'], 0)
            artifact.write_text(artifact.read_text(encoding='utf-8')+'\n', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                build_crop_evidence(root, '73', 2023, 'ข้าวนาปี')
