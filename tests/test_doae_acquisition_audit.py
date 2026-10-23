"""Catalog completeness requires every public CSV, not just one file per dataset."""
import unittest

from scripts.audit_doae_acquisition import catalog_audit


class AcquisitionAuditTests(unittest.TestCase):
    def test_csv_gaps_restricted_sources_and_alternate_formats_stay_distinct(self):
        packages = [
            {'name': 'uitest-a', 'resources': [{'id': 'test', 'format': 'CSV'}]},
            {'name': 'testdataset', 'resources': [{'id': 'sample', 'format': 'CSV'}]},
            {'name': 'emptydataset', 'resources': []},
            {'name': 'production', 'resources': [{'id': 'a', 'format': 'CSV'}, {'id': 'b', 'format': 'CSV'}, {'id': 'c', 'format': 'RDF'}]},
            {'name': 'private', 'resources': [{'id': 'restricted', 'format': 'Database'}]},
            {'name': 'offices', 'resources': [{'id': 'point', 'format': 'JSON-LD'}, {'id': 'kml', 'format': 'KML'}]},
        ]
        result = catalog_audit(packages, {'a', 'point'})
        self.assertFalse(result['all_public_csv_captured'])
        self.assertEqual(result['missing_csv_resource_ids'], ['b'])
        self.assertEqual(result['restricted_database_datasets'], ['private'])
        self.assertEqual(result['unselected_non_csv_resource_ids'], ['c', 'kml'])
        self.assertEqual(result['demo_or_empty_datasets'], ['emptydataset', 'testdataset', 'uitest-a'])
        complete = catalog_audit(packages, {'a', 'b', 'point'})
        self.assertTrue(complete['all_public_csv_captured'])
        self.assertEqual(complete['public_datasets_without_capture'], [])

    def test_unknown_capture_cannot_count_as_another_required_resource(self):
        packages = [{'name': 'data', 'resources': [{'id': 'expected', 'format': 'CSV'}]}]
        result = catalog_audit(packages, {'other'})
        self.assertEqual(result['missing_csv_resource_ids'], ['expected'])
        self.assertEqual(result['public_datasets_without_capture'], ['data'])
