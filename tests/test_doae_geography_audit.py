import csv
import hashlib
from pathlib import Path
import tempfile
import unittest

from scripts.audit_doae_geography import area_counts, compare_codes, select_fields


class DoaeGeographyAuditTests(unittest.TestCase):
    def test_native_components_require_exact_width_parent_and_name_agreement(self):
        master = {'10', '1001', '100101', '1002', '100201'}
        names = {'province_code': '10', 'district_code': '1001',
                 'subdistrict_code': '100101', 'mapping_status': 'matched_snapshot'}
        for codes, mode in [(('10', '1001', '100101'), 'full'), (('10', '01', '01'), 'components')]:
            result = compare_codes(codes, names, master, mode)
            self.assertEqual(result['code_status'], 'code_and_names_match_snapshot')
            self.assertFalse(result['rollup_eligible'])
        self.assertEqual(compare_codes(('10', '1002', '100201'), names, master, 'full')['code_status'], 'code_name_conflict')
        for codes, mode in [(('10', '1', '01'), 'components'), (('10', '1101', '110101'), 'full'), (('10', '01', '01'), 'full')]:
            self.assertEqual(compare_codes(codes, names, master, mode)['code_status'], 'invalid_native_codes')
        self.assertEqual(compare_codes(('10', '01', '02'), names, master, 'components')['code_status'], 'code_not_in_active_snapshot')
        unresolved = {'mapping_status': 'unmatched', 'province_code': '10'}
        self.assertEqual(compare_codes(('10', '01', '01'), unresolved, master, 'components')['code_status'], 'code_snapshot_match_names_unresolved')
        self.assertEqual(compare_codes(('', '', ''), names, master, 'names_only')['code_status'], 'not_provided')
        self.assertEqual(compare_codes(('', '1001', ''), names, master, 'full')['code_status'], 'incomplete_native_hierarchy')

    def test_area_counts_preserve_missing_codes_row_multiplicity_and_verify_raw_hash(self):
        fields = ['province_code', 'district_code', 'subdistrict_code',
                  'province_name', 'district_name', 'subdistrict_name']
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.csv'
            with path.open('w', encoding='utf-8-sig', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(fields)
                writer.writerows([['10', '1001', '100101', 'กรุงเทพมหานคร', 'พระนคร', 'ชื่อซ้ำ']] * 2)
                writer.writerow(['', '', '', 'กรุงเทพมหานคร', 'พระนคร', 'ชื่อซ้ำ'])
            raw = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            schema = {'fields': fields}
            counts = area_counts(raw, schema, select_fields(fields))
            self.assertEqual(sum(counts.values()), 3)
            self.assertEqual(len(counts), 2)
            self.assertEqual(sorted(counts.values()), [1, 2])
            path.write_text('changed', encoding='utf-8')
            with self.assertRaises(ValueError):
                area_counts(raw, schema, select_fields(fields))
        self.assertIsNone(select_fields(['province_name', 'district_name']))


if __name__ == '__main__':
    unittest.main()
