import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from tadih.local_data import read_local_dataset


class LocalDataTests(unittest.TestCase):
    def test_projected_fields_null_zero_search_and_pagination(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            stage = root / 'data/local/production/staged/test'
            stage.mkdir(parents=True)
            rows = [dict(year_ad=2023,month=1,province_name='นครปฐม',district_name='พุทธมณฑล',subdistrict_name='ศาลายา',crop_type='ข้าว',variety_name='ทดสอบ',planting_round=1,planted_area_rai=i,harvested_area_rai=None,production_kg=None,yield_kg_per_rai=None,farm_gate_thb_per_kg=None,source_record_number=i+1,rollup_eligible=False,license_status='pending',phone='SECRET-DO-NOT-SERVE') for i in range(27)]
            rows[0]['production_kg'] = 0
            rows[-1].update(year_ad=2024,crop_type='อ้อย')
            artifact = stage / 'records.jsonl'
            artifact.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
            (stage/'inventory.json').write_text(json.dumps({'output_sha256':{'records.jsonl':hashlib.sha256(artifact.read_bytes()).hexdigest()}}),encoding='utf-8')
            result = read_local_dataset({'dataset':'short-crop-production','page':'2','q':'ข้าว'},root=root)
            self.assertEqual(result['total_rows'],27)
            self.assertEqual(result['matched_rows'],26)
            self.assertEqual(len(result['rows']),1)
            self.assertNotIn('SECRET',json.dumps(result))
            self.assertIsNone(result['rows'][0]['production_kg'])
            first = read_local_dataset({'dataset':'short-crop-production'},root=root)
            self.assertEqual(first['rows'][0]['planted_area_rai'],0)
            self.assertEqual(first['facets']['years'],[2023,2024])
            filtered = read_local_dataset({'dataset':'short-crop-production','province':'นครปฐม','year':'2023','crop':'ข้าว'},root=root)
            self.assertEqual(filtered['matched_rows'],26)
            metric = next(m for m in filtered['completeness'] if m['key']=='production_kg')
            self.assertEqual(metric['present_rows'],1)  # Zero is present; missing is not zero.
            self.assertEqual(metric['missing_rows'],25)
            self.assertNotIn('sum',metric)
            self.assertEqual(read_local_dataset({'dataset':'short-crop-production','year':'2023','crop':'อ้อย'},root=root)['matched_rows'],0)
            self.assertEqual(read_local_dataset({'dataset':'short-crop-production','q':"' OR 1=1 --"},root=root)['matched_rows'],0)
            artifact.write_text(artifact.read_text(encoding='utf-8')+'\n',encoding='utf-8')
            with self.assertRaises(ValueError): read_local_dataset({'dataset':'short-crop-production'},root=root)

    def test_rejects_unknown_dataset_and_bad_page(self):
        for query in [{'dataset':'../../.env'},{'dataset':'short-crop-production','page':'-1'},{'dataset':'short-crop-production','year':'2023 OR 1=1'},{'dataset':'short-crop-production','crop':'x'*101}]:
            with self.assertRaises(ValueError): read_local_dataset(query)
