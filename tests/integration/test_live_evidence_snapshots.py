"""Snapshot-backed assertions for the area, spatial, and data-sharing views.

These checks use the owner's ignored ``data/local`` snapshots. The ordinary
unit tests in ``tests/`` exercise the same behavior with synthetic fixtures.
"""

from pathlib import Path
import unittest

from tadih.area_evidence import read_area_evidence
from tadih.catalog import ROOT
from tadih.data_sharing import audit_data_sharing_interface
from tadih.spatial_evidence import (
    audit_spatial_evidence,
    build_province_evidence_cards,
    extract_doae_disaster_evidence,
)


LOCAL = ROOT / "data/local"
COVERAGE_MANIFESTS = (
    "doae-p0/p0-run.json",
    "doae-p1/p1-run.json",
    "doae-p2/p2-run.json",
    "doae-archives/archive-run.json",
)
DOAE_DISASTER_CSVS = (
    "doae-p0/raw/ab68661c-52d7-4cdc-86b6-efdaf92a785e/"
    "9822798cfa03fd43f26eb887f31e55df3c9d8f366450c5af740ef39a62a42819.csv",
    "doae-p0/raw/9e118afd-62fc-47ce-95b0-f47dcaee5721/"
    "e4833bb6d69c5b4cf08e7c2b0636b261489b01845cadfd5aed9d89b9f1e5206d.csv",
)


def require_paths(test, relative_paths, label):
    missing = [path for path in relative_paths if not (LOCAL / path).is_file()]
    if missing:
        test.skipTest(f"requires {label} under data/local: {', '.join(missing)}")


def require_staged_records(test, relative_directories, label):
    missing = [
        path for path in relative_directories
        if not any((LOCAL / path).glob("*/records.jsonl"))
    ]
    if missing:
        test.skipTest(f"requires {label} records under data/local: {', '.join(missing)}")


class AreaEvidenceSnapshotIntegrationTests(unittest.TestCase):
    def setUp(self):
        require_paths(self, ("tadih.duckdb",), "the reviewed area-evidence warehouse")
        require_staged_records(
            self,
            ("production/staged", "production/perennial-staged"),
            "the reviewed crop staging snapshot",
        )

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


class SpatialEvidenceSnapshotIntegrationTests(unittest.TestCase):
    def setUp(self):
        require_paths(self, DOAE_DISASTER_CSVS, "the reviewed DOAE P0 disaster snapshots")

    def test_extract_doae_disaster_evidence(self):
        evidence_by_prov = extract_doae_disaster_evidence(LOCAL)
        self.assertGreater(len(evidence_by_prov), 30)

        # Check Buriram (31) has drought damage
        buriram_ev = evidence_by_prov.get("31", [])
        self.assertTrue(any(e.problem_type == "DROUGHT_DAMAGE" for e in buriram_ev))
        drought_rai = sum(e.metric_value for e in buriram_ev if e.problem_type == "DROUGHT_DAMAGE")
        self.assertGreater(drought_rai, 1000.0)

        # Check Roi Et (45) has flood damage
        roiet_ev = evidence_by_prov.get("45", [])
        self.assertTrue(any(e.problem_type == "FLOOD_DAMAGE" for e in roiet_ev))
        flood_rai = sum(e.metric_value for e in roiet_ev if e.problem_type == "FLOOD_DAMAGE")
        self.assertGreater(flood_rai, 50000.0)

    def test_live_audit_spatial_evidence(self):
        (LOCAL / "probes").mkdir(parents=True, exist_ok=True)
        result = audit_spatial_evidence(ROOT)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["total_provinces_audited"], 77)

        status_breakdown = result["intervention_status_breakdown"]
        self.assertEqual(status_breakdown, {"UNVERIFIED": 77})
        self.assertEqual(result["unaddressed_gap_provinces_count"], 0)
        self.assertEqual(result["audit_version"], 2)

        # Check governance guarantees
        for card in result["province_cards"]:
            self.assertNotIn("composite_risk_score", card)
            self.assertNotIn("priority_index", card)
            self.assertEqual(card["intervention_status"], "UNVERIFIED")

        # Verify probe file output
        probe_file = LOCAL / "probes/spatial-evidence-audit.json"
        self.assertTrue(probe_file.exists())

    def test_evidence_does_not_prove_policy_gap(self):
        cards = {card.province_code: card for card in build_province_evidence_cards(LOCAL)}

        # A disaster report does not establish whether a project covered the area.
        buriram_card = cards["31"]
        self.assertEqual(buriram_card.intervention_status, "UNVERIFIED")
        self.assertIn("ทะเบียนโครงการ", buriram_card.diagnostic_notes)
        self.assertEqual(buriram_card.matched_intervention_ids, [])

        # Bangkok also has no verified project target.
        bkk_card = cards["10"]
        self.assertEqual(bkk_card.intervention_status, "UNVERIFIED")


class DataSharingSnapshotIntegrationTests(unittest.TestCase):
    def setUp(self):
        require_paths(
            self,
            (*COVERAGE_MANIFESTS, *DOAE_DISASTER_CSVS),
            "the reviewed DOAE manifests and disaster snapshots",
        )

    def test_live_audit_data_sharing_interface(self):
        (LOCAL / "probes").mkdir(parents=True, exist_ok=True)
        audit_result = audit_data_sharing_interface(ROOT)
        self.assertEqual(audit_result["status"], "success")
        self.assertGreaterEqual(len(audit_result["sample_query_audits"]), 5)
        self.assertTrue((LOCAL / "probes/data-sharing-audit.json").exists())


if __name__ == "__main__":
    unittest.main()
