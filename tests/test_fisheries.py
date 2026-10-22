import unittest

from tadih.fisheries import RESOURCES, stage_fisheries


class FisheriesTests(unittest.TestCase):
    def data(self):
        resource = next(iter(RESOURCES))
        payload = {"success": True, "result": {"resource_id": resource, "total": 1, "total_was_estimated": False, "records": [{"_id": 1, "ปี": 2567, **{name: None if name == "ปริมาณรวม" else 0 for name in RESOURCES[resource][2]}}]}}
        metadata = {"success": True, "result": {"geo_coverage": "ประเทศ", "resources": [{"id": resource, "resource_unit_of_measure": "พันตัน"}]}}
        return resource, payload, metadata

    def test_native_units_and_total_stay_separate(self):
        resource, payload, metadata = self.data()
        rows = stage_fisheries(payload, metadata, resource)
        self.assertEqual(len(rows), 10)
        self.assertTrue(rows[0]["is_total"])
        self.assertIsNone(rows[0]["value"])
        self.assertEqual(rows[1]["value"], 0)
        self.assertEqual(rows[1]["unit"], "พันตัน")
        self.assertIsNone(rows[1]["release_at"])
        self.assertEqual(rows[1]["license_status"], "pending")

    def test_reject_incomplete_schema_unit_and_nonfinite(self):
        for mutation in (lambda p,m: p['result'].update(total=2),
                         lambda p,m: p['result']['records'][0].update(ปริมาณรวม=float('nan')),
                         lambda p,m: m['result']['resources'][0].update(resource_unit_of_measure='ตัน'),
                         lambda p,m: p['result']['records'][0].update(จังหวัด='นครปฐม')):
            resource, payload, metadata = self.data()
            mutation(payload, metadata)
            with self.assertRaises(ValueError):
                stage_fisheries(payload, metadata, resource)
