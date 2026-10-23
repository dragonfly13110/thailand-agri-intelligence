"""Unit tests for Cross-Agency Agricultural Project Register."""

import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker

from tadih.catalog import ROOT
from tadih.project_register import (
    AgriculturalProject,
    PROJECT_CONTRACT_PATH,
    build_known_national_project_register,
    analyze_spatial_project_coverage,
    audit_project_register,
)


class ProjectRegisterTests(unittest.TestCase):
    def test_project_schema_is_valid_json_schema(self):
        schema = json.loads(PROJECT_CONTRACT_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)

    def test_project_instance_validates_against_contract(self):
        project = AgriculturalProject(
            project_id="TEST-PROJ-01",
            project_name_th="โครงการทดสอบ",
            managing_agency="DOAE",
            fiscal_year="2569",
            intervention_type="income_support",
            target_commodity="ข้าว",
            target_problem="ต้นทุนสูง",
            target_area_grain="province",
            target_area_codes=["10", "20"],
            status="planned",
            source_evidence="ทดสอบ",
            license_status="pending",
        )
        project.validate()

    def test_national_project_register_live_audit(self):
        result = audit_project_register(ROOT)
        self.assertEqual(result["status"], "success")
        self.assertGreaterEqual(result["registered_projects_count"], 4)

        projects = result["projects"]
        project_ids = {p["project_id"] for p in projects}
        self.assertIn("DOAE-GOV-SUPPORT-2566", project_ids)
        self.assertIn("DOAE-GOV-SUPPORT-2567", project_ids)
        self.assertIn("MOAC-RICE-AID-2567", project_ids)
        self.assertIn("DOAE-DISASTER-RELIEF-2567", project_ids)

    def test_spatial_project_coverage_gap_detection(self):
        projects = [
            AgriculturalProject(
                project_id="PROJ-NORTH",
                project_name_th="โครงการภาคเหนือ",
                managing_agency="DOAE",
                fiscal_year="2569",
                intervention_type="disaster_relief",
                target_commodity=None,
                target_problem="ภัยแล้ง",
                target_area_grain="province",
                target_area_codes=["50", "51"],
                status="in_progress",
                source_evidence="ทดสอบ",
                license_status="pending",
            )
        ]
        # Evaluate Chiang Mai (50) and Pattani (94)
        cov = analyze_spatial_project_coverage(projects, {"50", "94"})
        self.assertEqual(cov["problem_provinces_total"], 2)
        self.assertEqual(cov["covered_problem_provinces_count"], 1)
        self.assertEqual(cov["unaddressed_gap_provinces"], ["94"])
        self.assertAlmostEqual(cov["coverage_rate"], 0.5)


if __name__ == "__main__":
    unittest.main()
