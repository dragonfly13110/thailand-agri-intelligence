import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tadih.prices import monthly_price_observation
from tadih.rice_pilot import read_rice_pilot
from tadih.warehouse import connect, ingest_rows


class RicePilotTests(unittest.TestCase):
    def test_independent_context_requires_price_choice_and_projects_private_index(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            warehouse = root / 'data/local/tadih.duckdb'
            products = ['ข้าวเปลือกเจ้า ความชื้น 15', 'ข้าวเปลือกเจ้าปทุมธานี 1 ความชื้น 15',
                        'ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15', 'synthetic unrelated product']
            with connect(warehouse) as db:
                ingest_rows(db, [monthly_price_observation(dict(product_name=product, province_code='TH00',
                    year_th=2566, month=12, week=0, unit='บาท/กก.', value='10'),
                    '2026-10-24T00:00:00+00:00') for product in products])
            evidence = dict(selection={'year_ad':2023}, grain=['month'], matched_rows=2,
                snapshot_matched_rows=2, unmatched_rows=0, completeness={'production_kg':{'present_rows':1,'missing_rows':1}},
                periods=[], varieties={}, temporal_status_rows={}, evidence_sha256='a'*64,
                source=dict(resource_id='test',records_sha256='b'*64,crosswalk_sha256='c'*64,
                    records_path='MUST-NOT-COPY',crosswalk_path='MUST-NOT-COPY'), row_references=['MUST-NOT-COPY'])
            table = dict(columns=[], rows=[{'production_kg':0},{'production_kg':None}], matched_rows=2,
                         page=1,pages=1,page_size=25,staging_sha256='b'*64)
            rainfall = dict(view='rainfall_context',evidence_sha256='d'*64,months=[])
            query = dict(dataset='short-crop-production',view='rice_pilot',year='2023')
            with patch('tadih.rice_pilot.build_crop_evidence',return_value=evidence), \
                 patch('tadih.local_data.read_local_dataset',return_value=table) as reader, \
                 patch('tadih.rice_pilot.read_rainfall_context',return_value=rainfall):
                result=read_rice_pilot(query,root=root)
                self.assertTrue(result['price']['selection_required'])
                self.assertEqual(len(result['price']['series_options']),3)
                self.assertNotIn('points',result['price'])
                self.assertNotIn('selected',result['price'])
                self.assertEqual(read_rice_pilot({**query,'year':''},root=root)['year_ad'],2023)
                self.assertNotIn('MUST-NOT-COPY',json.dumps(result))
                self.assertEqual(result['production']['table']['rows'],table['rows'])
                self.assertTrue(all(flag is False for flag in result['gates'].values()))
                self.assertEqual(reader.call_args.args[0],dict(dataset='short-crop-production',province='นครปฐม',
                    crop='ข้าวนาปี',year='2023',page='1'))
                chosen=result['price']['series_options'][0]['id']
                selected=read_rice_pilot({**query,'series':chosen},root=root)
                self.assertFalse(selected['price']['selection_required'])
                self.assertEqual(selected['price']['selected']['id'],chosen)
                self.assertEqual(len(selected['price']['points']),12)
                self.assertNotEqual(result['evidence_sha256'],selected['evidence_sha256'])
                for bad in ({'series':'0'*64},{'province':'นครปฐม'},{'q':'x'},{'crop':'ข้าวนาปี'},
                            {'from':'2023-01'},{'to':'2023-12'},{'year':'2025'},{'page':'0'},
                            {'page':'1000000'},{'dataset':'rainfall-reanalysis'},{'view':'price_trend'}):
                    with self.assertRaises(ValueError):read_rice_pilot({**query,**bad},root=root)
                from tadih.price_trend import read_price_trend
                import duckdb
                with duckdb.connect(str(warehouse),read_only=True) as db:
                    unrelated=next(o['id'] for o in read_price_trend(db,{'from':'2023-01','to':'2023-12'})['series_options'] if o['label']=='synthetic unrelated product')
                with self.assertRaises(ValueError):read_rice_pilot({**query,'series':unrelated},root=root)
                inconsistent=copy.deepcopy(table);inconsistent['matched_rows']=3
                reader.return_value=inconsistent
                with self.assertRaisesRegex(ValueError,'evidence'):
                    read_rice_pilot(query,root=root)
