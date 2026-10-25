import json
from pathlib import Path
import tempfile
import unittest

from tadih.catalog import ROOT
from tadih.web_catalog import build_web_catalog


class WebCatalogTests(unittest.TestCase):
    def test_reviewed_metadata_only_and_manifest(self):
        import hashlib
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            payload = build_web_catalog(output=output)
            self.assertEqual(len(payload['records']), 17)
            self.assertTrue(all(r['data_license_status'] == 'pending' for r in payload['records']))
            self.assertTrue(all(r['metadata_review'] == 'project_authored_public' for r in payload['records']))
            self.assertNotIn('data_records', json.dumps(payload))
            catalog = {row['id']: row for row in payload['records']}
            self.assertEqual(catalog['short-crop-production']['period'], 'ม.ค. 2566 – ก.พ. 2567')
            self.assertIn('รอบปลูก', catalog['short-crop-production']['grain'])
            self.assertIn('MOD13A1', catalog['vegetation-modis']['description'])
            self.assertEqual(catalog['vegetation-modis']['period'], 'วันที่ภาพ 30 ก.ย. 2569')
            self.assertEqual(catalog['dry-season-plan']['period'], 'ปีเพาะปลูก 2569')
            self.assertEqual(catalog['rainfall-reanalysis']['period'], '1 ม.ค. 2559 – 31 ธ.ค. 2568')
            self.assertIsNone(catalog['rice-soil-suitability']['period'])
            self.assertIsNone(catalog['rice-soil-suitability']['unit'])
            manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['sha256'], hashlib.sha256((output / 'catalog.json').read_bytes()).hexdigest())

    def test_unreviewed_changed_rights_and_unsafe_links_fail_closed(self):
        source = json.loads((ROOT / 'config/web_catalog_review.json').read_text(encoding='utf-8'))
        for field, value in [('metadata_review', 'pending'), ('source_url', 'https://example.org/?token=secret'), ('raw_rows', [123])]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as folder:
                changed = json.loads(json.dumps(source))
                changed['records'][0][field] = value
                path = Path(folder) / 'review.json'
                path.write_text(json.dumps(changed), encoding='utf-8')
                with self.assertRaises(ValueError):
                    build_web_catalog(review_path=path, output=Path(folder) / 'out')
                self.assertFalse((Path(folder) / 'out/catalog.json').exists())
        with tempfile.TemporaryDirectory() as folder:
            licenses = json.loads((ROOT / 'config/resource_licenses.json').read_text(encoding='utf-8'))
            licenses['resources'][0]['license_status'] = 'approved_public'
            path = Path(folder) / 'licenses.json'
            path.write_text(json.dumps(licenses), encoding='utf-8')
            with self.assertRaises(ValueError):
                build_web_catalog(licenses_path=path, output=Path(folder) / 'out')


if __name__ == '__main__':
    unittest.main()
