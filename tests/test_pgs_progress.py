import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from tadih.pgs_progress import ALIASES, DATASET, DICTIONARY, METRICS, PROJECT_TITLE, RESOURCE, SOURCE_FIELDS, read_pgs_progress, source_url, stage_pgs_progress


def row(identifier, unit='นครปฐม', **patch):
    record = dict(zip(SOURCE_FIELDS, [identifier, unit, 2, 2, 2, 2, 1, 1, 1, 1, 'กลุ่มใหม่ขั้นที่ 1', 2566]))
    return {**record, **patch}


def capture(root, rows, *, dictionary_patch=None, total=None):
    folder = Path(root) / 'data/local/pgs-progress'
    (folder / 'raw').mkdir(parents=True)
    content = json.dumps(dict(success=True, result=dict(total=len(rows) if total is None else total, records=rows)), ensure_ascii=False).encode()
    digest = hashlib.sha256(content).hexdigest()
    (folder / 'raw' / (digest + '.json')).write_bytes(content)
    (folder / 'source-manifest.json').write_text(json.dumps(dict(resource_id=RESOURCE, source_url=source_url(), complete=True,
        sha256=digest, reported_total=len(rows) if total is None else total, received_rows=len(rows), captured_at='2026-10-24T00:00:00+00:00')), encoding='utf-8')
    definitions = [dict(ชื่อฟิลด์=ALIASES.get(field, field), รูปแบบของข้อมูล='Number') for _, _, p, a, _, _ in METRICS for field in (p, a)]
    definitions += [dict(ชื่อฟิลด์=field, รูปแบบของข้อมูล='Text') for field in ('หน่วยงาน', 'ประเภทกลุ่ม', 'ปีงบประมาณ')]
    if dictionary_patch:
        definitions[0].update(dictionary_patch)
    titles = [dict(ชื่อตารางข้อมูล=PROJECT_TITLE)] + [dict(ชื่อตารางข้อมูล=None)] * 10
    source = Path(root) / 'data/local/probes/project-source-pilot'
    source.mkdir(parents=True)
    for name, records in [('pgs_dictionary', definitions), ('pgs_dictionary_source', titles)]:
        content = json.dumps(dict(success=True, result=dict(total=11, records=records)), ensure_ascii=False).encode()
        digest = hashlib.sha256(content).hexdigest()
        (source / (name + '.json')).write_bytes(content)
        (source / (name + '-manifest.json')).write_text(json.dumps(dict(resource_id=DICTIONARY, sha256=digest)), encoding='utf-8')


class PgsProgressTests(unittest.TestCase):
    def test_parent_reporting_units_do_not_receive_comparison_ratios(self):
        with tempfile.TemporaryDirectory() as root:
            capture(root, [row(1, 'สำนักงานพัฒนาที่ดินเขต 1'), row(2, 'สพข.1')])
            stage_pgs_progress(root=root)
            result = read_pgs_progress(dict(dataset=DATASET), root=root)
            self.assertEqual([item['groups_status'] for item in result['rows']],
                             ['subtotal_or_parent_unit', 'subtotal_or_parent_unit'])
            self.assertTrue(all(item['groups_percent'] is None for item in result['rows']))

    def test_same_row_ratios_and_full_filter_counts_preserve_null_and_zero(self):
        with tempfile.TemporaryDirectory() as root:
            records = [row(1), row(2, 'actual zero', **{'ผลดำเนินงาน (กลุ่ม)': 0}),
                       row(3, 'zero target', **{'เป้าหมาย (กลุ่ม)': 0}), row(4, 'missing', **{'ผลดำเนินงาน (กลุ่ม)': None}),
                       row(5, 'duplicate'), row(6, 'duplicate'), row(7, 'รวมประเทศ'),
                       row(8, 'source stage', **{'ประเภทกลุ่ม': 'กลุ่มใหม่ขั้นที่ 2'})]
            records += [row(n, f'unit {n}') for n in range(9, 36)]
            capture(root, records)
            stage_pgs_progress(root=root)
            result = read_pgs_progress(dict(dataset=DATASET), root=root)
            self.assertEqual((result['total_rows'], result['matched_rows'], len(result['rows']), result['pages']), (35, 35, 25, 2))
            rows = result['rows']
            self.assertEqual([r['groups_status'] for r in rows[:8]], ['available', 'available', 'zero_target', 'missing', 'duplicate_identity', 'duplicate_identity', 'subtotal_or_parent_unit', 'stage_unverified'])
            self.assertEqual(rows[0]['groups_percent'], 50)
            self.assertEqual(rows[1]['groups_percent'], 0)
            self.assertTrue(all(r['groups_percent'] is None for r in rows[2:8]))
            metric = next(x for x in result['completeness'] if x['key'] == 'reported_groups')
            self.assertEqual((metric['present_rows'], metric['missing_rows']), (34, 1))
            self.assertEqual(len(read_pgs_progress(dict(dataset=DATASET, page='2'), root=root)['rows']), 10)
            self.assertEqual(read_pgs_progress(dict(dataset=DATASET, q='%'), root=root)['matched_rows'], 0)
            self.assertEqual(read_pgs_progress(dict(dataset=DATASET, q='นครปฐม', year='2566'), root=root)['matched_rows'], 1)
            self.assertEqual(read_pgs_progress(dict(dataset=DATASET, year='2567'), root=root)['matched_rows'], 0)
            self.assertEqual(result['facets'], dict(crops=[], years=[2566], year_kind='fiscal_year_be'))
            self.assertEqual(result['provinces'], [])
            self.assertIsNone(result['source']['source_as_of'])
            self.assertNotIn(str(root), json.dumps(result))
            self.assertEqual(result['evidence_sha256'], read_pgs_progress(dict(dataset=DATASET), root=root)['evidence_sha256'])

    def test_query_units_year_and_checksum_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            capture(root, [row(1)])
            current = stage_pgs_progress(root=root)
            for patch in [{'province':'นครปฐม'}, {'crop':'rice'}, {'view':'price_trend'}, {'from':'2566'}, {'to':'2566'}, {'series':'a'*64}, {'unit':'rai'}, {'year':'2023'}, {'year':'25660'}, {'year':2566}, {'page':'0'}, {'q':'x'*161}]:
                with self.subTest(patch=patch), self.assertRaises(ValueError):
                    read_pgs_progress(dict(dataset=DATASET, **patch), root=root)
            staged = Path(root) / 'data/local/pgs-progress/staged' / (current['staging_sha256'] + '.json')
            data = json.loads(staged.read_bytes());data['field_units']['target_area_rai'] = 'hectare'
            content = json.dumps(data, ensure_ascii=False).encode();digest = hashlib.sha256(content).hexdigest()
            staged.with_name(digest + '.json').write_bytes(content)
            pointer = Path(root) / 'data/local/pgs-progress/current.json'
            pointer.write_text(json.dumps({**current, 'staging_sha256':digest}))
            with self.assertRaisesRegex(ValueError, 'units'): read_pgs_progress(dict(dataset=DATASET), root=root)
            pointer.write_text(json.dumps(current))
            staged.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'checksum'): read_pgs_progress(dict(dataset=DATASET), root=root)

    def test_incomplete_schema_dictionary_and_numeric_data_are_not_staged(self):
        bad = [([row(1)], {'total':2}), ([row(1)], {'dictionary_patch':{'รูปแบบของข้อมูล':'hectare'}}),
               ([row(1, **{'ปีงบประมาณ':2023})], {}), ([row(1), row(1)], {}),
               ([row(1, **{'เป้าหมาย (กลุ่ม)':-1})], {}), ([row(1, **{'ผลดำเนินงาน (กลุ่ม)':'NaN'})], {}),
               ([{**row(1), 'phone':'MUST-NOT-COPY'}], {})]
        for records, options in bad:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as root:
                capture(root, copy.deepcopy(records), **options)
                with self.assertRaises(ValueError): stage_pgs_progress(root=root)
                self.assertFalse((Path(root) / 'data/local/pgs-progress/current.json').exists())


if __name__ == '__main__':
    unittest.main()
