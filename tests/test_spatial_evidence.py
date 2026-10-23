"""Unit tests for Spatial Problem Evidence and Policy Intervention Matching Engine."""

import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker

from tadih.catalog import ROOT, load_provinces
from tadih.project_register import AgriculturalProject
from tadih.spatial_evidence import (
    SPATIAL_EVIDENCE_CONTRACT_PATH,
    ProblemEvidenceItem,
    ProvinceEvidenceCard,
    build_province_evidence_cards,
    extract_doae_disaster_evidence,
    audit_spatial_evidence,
)


class SpatialEvidenceTests(unittest.TestCase):
    def test_spatial_evidence_contract_schema_is_valid(self):
        schema = json.loads(SPATIAL_EVIDENCE_CONTRACT_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)

    def test_province_evidence_card_instance_validates_against_contract(self):
        item = ProblemEvidenceItem(
            evidence_id="EV-TEST-01",
            source_id="doae",
            resource_id="test-resource",
            problem_type="DROUGHT_DAMAGE",
            metric_name="damaged_area_drought_rai",
            metric_value=500.25,
            unit="ไร่",
            native_spatial_grain="subdistrict",
            native_area_code="310101",
            observed_period="2568",
            license_status="pending",
        )
        card = ProvinceEvidenceCard(
            province_code="31",
            province_name_th="บุรีรัมย์",
            evidence_records=[item],
            identified_problems=["DROUGHT_DAMAGE"],
            matched_intervention_ids=["DOAE-GOV-SUPPORT-2567"],
            intervention_status="UNADDRESSED_GAP",
            diagnostic_notes="พบภัยแล้ง 500.25 ไร่ แต่ไม่มีโครงการเยียวยาภัยพิบัติรองรับ",
            last_audited_at="2026-10-23T05:00:00Z",
        )
        card.validate()

    def test_extract_doae_disaster_evidence(self):
        evidence_by_prov = extract_doae_disaster_evidence(ROOT / "data/local")
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
        result = audit_spatial_evidence(ROOT)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["total_provinces_audited"], 77)

        status_breakdown = result["intervention_status_breakdown"]
        self.assertIn("UNADDRESSED_GAP", status_breakdown)
        self.assertIn("COVERED", status_breakdown)
        self.assertIn("REDUNDANT", status_breakdown)
        self.assertIn("NO_IDENTIFIED_PROBLEM", status_breakdown)

        # Check governance guarantees
        for card in result["province_cards"]:
            self.assertNotIn("composite_risk_score", card)
            self.assertNotIn("priority_index", card)
            self.assertIn(card["intervention_status"], [
                "COVERED", "REDUNDANT", "UNADDRESSED_GAP", "NO_IDENTIFIED_PROBLEM"
            ])

        # Verify probe file output
        probe_file = ROOT / "data/local/probes/spatial-evidence-audit.json"
        self.assertTrue(probe_file.exists())

    def test_unaddressed_gap_diagnostic_accuracy(self):
        cards = build_province_evidence_cards(ROOT / "data/local")
        card_map = {c.province_code: c for c in cards}

        # Buriram (31) has verified drought damage but no disaster relief coverage -> UNADDRESSED_GAP
        buriram_card = card_map["31"]
        self.assertEqual(buriram_card.intervention_status, "UNADDRESSED_GAP")
        self.assertIn("ภัยแล้ง", buriram_card.diagnostic_notes)

        # Province 10 (Bangkok) has flood damage and is covered by disaster relief -> COVERED or REDUNDANT
        bkk_card = card_map["10"]
        self.assertIn(bkk_card.intervention_status, ["COVERED", "REDUNDANT"])


if __name__ == "__main__":
    unittest.main()
