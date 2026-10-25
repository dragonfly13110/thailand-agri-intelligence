"""Unit tests for multi-source provincial problem evidence and planning workflow."""

import unittest

from tadih.area_evidence import read_area_evidence
from tadih.catalog import ROOT
from tadih.local_data import read_local_dataset


class AreaEvidenceTests(unittest.TestCase):
    def test_read_area_evidence_for_nakhon_pathom(self):
        result = read_area_evidence({'province': 'นครปฐม'}, root=ROOT)
        self.assertEqual(result['state'], 'ready')
        self.assertEqual(result['province_code'], '73')
        self.assertEqual(result['province_name_th'], 'นครปฐม')

        # Disaster damage evidence from DOAE P0
        ev = result['evidence_records']
        self.assertEqual(len(ev), 2)
        metric_names = {e['metric_name'] for e in ev}
        self.assertIn('damaged_area_flood_in_irrigation_area_rai', metric_names)
        self.assertIn('damaged_area_flood_outside_irrigation_area_rai', metric_names)
        for e in ev:
            self.assertEqual(e['unit'], 'ไร่')
            self.assertEqual(e['license_status'], 'pending')
            self.assertEqual(e['native_spatial_grain'], 'province')

        # Policy match status
        pm = result['policy_match']
        self.assertEqual(pm['intervention_status'], 'UNVERIFIED')
        self.assertIn('FLOOD_DAMAGE', pm['identified_problems'])
        self.assertIn('ตรวจทะเบียนโครงการ', pm['diagnostic_notes'])

        # Candidate project announcement
        candidates = result['candidate_projects']
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]['candidate_id'], 'CAND-DOAE-2566-DRYPLANT-REPLACEMENT')

        # Crop summary
        crops = result['crop_summary']
        self.assertEqual(crops['short_crop_rows'], 998)
        self.assertEqual(crops['perennial_rows'], 792)

        # Governance guarantees
        self.assertTrue(len(result['governance_guarantees']) >= 4)
        self.assertTrue(any('No Synthetic Composite Risk Score' in g for g in result['governance_guarantees']))

    def test_read_area_evidence_for_buriram(self):
        result = read_area_evidence({'province_code': '31'}, root=ROOT)
        self.assertEqual(result['state'], 'ready')
        self.assertEqual(result['province_code'], '31')
        self.assertEqual(result['province_name_th'], 'บุรีรัมย์')

        # Evidence records
        ev = result['evidence_records']
        self.assertEqual(len(ev), 3)
        prob_types = {e['problem_type'] for e in ev}
        self.assertIn('FLOOD_DAMAGE', prob_types)
        self.assertIn('DROUGHT_DAMAGE', prob_types)

        # Water resources from DWR
        wr = result['water_resources']
        self.assertEqual(len(wr), 12)
        for r in wr:
            self.assertEqual(r['source_agency'], 'DWR')
            self.assertEqual(r['license_status'], 'pending')
            self.assertIsNotNone(r['storage_m3'])

    def test_read_area_evidence_input_validation(self):
        with self.assertRaises(ValueError):
            read_area_evidence({}, root=ROOT)
        with self.assertRaises(ValueError):
            read_area_evidence({'province': 'จังหวัดที่ไม่มีอยู่จริง'}, root=ROOT)

    def test_local_data_router_integration(self):
        query = {
            'dataset': 'short-crop-production',
            'view': 'area_evidence',
            'province': 'นครปฐม',
        }
        result = read_local_dataset(query, root=ROOT)
        self.assertEqual(result['state'], 'ready')
        self.assertEqual(result['view'], 'area_evidence')
        self.assertEqual(result['province_code'], '73')
