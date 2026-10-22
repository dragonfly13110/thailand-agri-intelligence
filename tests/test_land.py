import unittest

from tadih.land import RESOURCE_ID, stage_rice_zoning


class LandTests(unittest.TestCase):
    def payload(self):
        return {"success": True, "result": {"resource_id": RESOURCE_ID, "total": 1, "total_was_estimated": False, "records": [{"_id": 1, "จังหวัด": "นครปฐม", "ข้าว_S1": "1,000", "ข้าว_S2": "0", "ข้าว_S3": None, "ข้าว_N": "--"}]}}

    def test_unknown_semantics_and_null_zero(self):
        rows = stage_rice_zoning(self.payload())
        self.assertEqual([r['value'] for r in rows], [1000, 0, None, None])
        self.assertIsNone(rows[0]['unit'])
        self.assertIsNone(rows[0]['reference_year'])
        self.assertEqual(rows[0]['license_status'], 'pending')
        self.assertEqual(rows[0]['province_name_source'], 'นครปฐม')

    def test_reject_partial_duplicate_invalid_and_schema(self):
        for mutation in (lambda p: p['result'].update(total=2),
                         lambda p: p['result']['records'][0].update(ข้าว_S1='1,00'),
                         lambda p: p['result']['records'][0].update(ข้าว_S1='NaN'),
                         lambda p: p['result']['records'][0].update(ปี=2567)):
            payload = self.payload()
            mutation(payload)
            with self.assertRaises(ValueError):
                stage_rice_zoning(payload)
        payload = self.payload()
        payload['result']['records'] *= 2
        payload['result']['total'] = 2
        with self.assertRaises(ValueError):
            stage_rice_zoning(payload)
