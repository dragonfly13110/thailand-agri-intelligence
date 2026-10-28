"""Spatial evidence behavior is checked against small synthetic DOAE extracts."""

import csv
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from jsonschema import Draft202012Validator, FormatChecker

from tadih.catalog import load_provinces as load_repository_provinces
from tadih.spatial_evidence import (
    SPATIAL_EVIDENCE_CONTRACT_PATH,
    ProblemEvidenceItem,
    ProvinceEvidenceCard,
    audit_spatial_evidence,
    build_province_evidence_cards,
    extract_doae_disaster_evidence,
)


PROVINCES = [
    {"area_code": "31", "name_th": "บุรีรัมย์"},
    {"area_code": "45", "name_th": "ร้อยเอ็ด"},
    {"area_code": "73", "name_th": "นครปฐม"},
    {"area_code": "10", "name_th": "กรุงเทพมหานคร"},
]
DISASTER_SOURCES = (
    ("ab68661c-52d7-4cdc-86b6-efdaf92a785e", "9822798cfa03fd43f26eb887f31e55df3c9d8f366450c5af740ef39a62a42819",
     [("บุรีรัมย์", "1,000", "500"), ("บุรีรัมย์", "250", "750"), ("ร้อยเอ็ด", "60000", "0"), ("จังหวัดที่ไม่มี", "10", "20")]),
    ("9e118afd-62fc-47ce-95b0-f47dcaee5721", "e4833bb6d69c5b4cf08e7c2b0636b261489b01845cadfd5aed9d89b9f1e5206d",
     [("บุรีรัมย์", "300", "50"), ("นครปฐม", "5", "0")]),
)


class SpatialEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.local = self.root / "data/local"
        (self.local / "probes").mkdir(parents=True)
        self.province_patch = patch("tadih.spatial_evidence.load_provinces", return_value=PROVINCES)
        self.province_patch.start()

        for resource_id, digest, rows in DISASTER_SOURCES:
            path = self.local / f"doae-p0/raw/{resource_id}/{digest}.csv"
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w", encoding="utf-8-sig", newline="") as stream:
                writer = csv.writer(stream)
                writer.writerow(["จังหวัด", "อุทกภัย", "ภัยแล้ง"])
                writer.writerows(rows)

    def tearDown(self):
        self.province_patch.stop()
        self.temp.cleanup()

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
            intervention_status="UNVERIFIED",
            diagnostic_notes="พบภัยแล้ง แต่ยังไม่มีหลักฐานพื้นที่เป้าหมายโครงการ",
            last_audited_at="2026-10-23T05:00:00Z",
        )
        card.validate()

    def test_extract_doae_disaster_evidence_aggregates_synthetic_rows(self):
        evidence_by_prov = extract_doae_disaster_evidence(self.local)
        self.assertEqual(set(evidence_by_prov), {"31", "45", "73"})

        buriram = evidence_by_prov["31"]
        self.assertEqual(sum(e.metric_value for e in buriram if e.problem_type == "FLOOD_DAMAGE"), 1550.0)
        self.assertEqual(sum(e.metric_value for e in buriram if e.problem_type == "DROUGHT_DAMAGE"), 1300.0)
        self.assertEqual(len(evidence_by_prov["45"]), 1)
        self.assertEqual(evidence_by_prov["45"][0].metric_value, 60000.0)
        self.assertEqual(evidence_by_prov["73"][0].metric_value, 5.0)
        for item in [item for records in evidence_by_prov.values() for item in records]:
            self.assertEqual(item.native_spatial_grain, "province")
            self.assertEqual(item.unit, "ไร่")
            self.assertEqual(item.license_status, "pending")

    def test_audit_spatial_evidence_writes_only_to_fixture_root(self):
        registered_provinces = load_repository_provinces()
        with patch("tadih.spatial_evidence.load_provinces", return_value=registered_provinces):
            result = audit_spatial_evidence(self.root)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["total_provinces_audited"], len(registered_provinces))
        self.assertEqual(result["total_provinces_audited"], 77)
        self.assertEqual(result["intervention_status_breakdown"], {"UNVERIFIED": 77})
        self.assertEqual(result["unaddressed_gap_provinces_count"], 0)

        for card in result["province_cards"]:
            self.assertNotIn("composite_risk_score", card)
            self.assertNotIn("priority_index", card)
            self.assertEqual(card["intervention_status"], "UNVERIFIED")
        self.assertTrue((self.local / "probes/spatial-evidence-audit.json").is_file())

    def test_disaster_evidence_does_not_prove_a_policy_gap(self):
        cards = {card.province_code: card for card in build_province_evidence_cards(self.local)}

        buriram = cards["31"]
        self.assertEqual(buriram.intervention_status, "UNVERIFIED")
        self.assertIn("ทะเบียนโครงการ", buriram.diagnostic_notes)
        self.assertEqual(buriram.matched_intervention_ids, [])

        bangkok = cards["10"]
        self.assertEqual(bangkok.intervention_status, "UNVERIFIED")
        self.assertIn("ไม่ได้ยืนยันว่าไม่มีปัญหา", bangkok.diagnostic_notes)


if __name__ == "__main__":
    unittest.main()
