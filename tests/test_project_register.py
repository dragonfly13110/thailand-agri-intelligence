"""Unit tests for Cross-Agency Agricultural Project Register."""

import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema import ValidationError
from tadih import project_register

from tadih.catalog import ROOT
from tadih.project_register import (
    AgriculturalProject,
    PROJECT_CONTRACT_PATH,
    build_known_national_project_register,
    analyze_spatial_project_coverage,
    audit_project_register,
)


def project_fixture(**changes):
    """Synthetic planned targets only, never a real project or implementation proof."""
    result = dict(project_id="TEST-PROVINCE", project_name_th="โครงการทดสอบ",
                  managing_agency="DOAE", fiscal_year="2569", intervention_type="production_planning",
                  target_commodity="ข้าว", target_problem="ทดสอบ", target_area_grain="province",
                  target_area_codes=["73"], status="planned", source_evidence="synthetic test fixture",
                  license_status="pending")
    return result | changes


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
        probe_dir = ROOT / "data/local/probes"
        if not probe_dir.is_dir():
            self.skipTest(
                "gitignored local workspace data/local/probes/ is absent on this checkout "
                "(it is not committed, so a fresh clone and CI never have it); run "
                "`python scripts/audit_project_register.py` on a machine with the ingested "
                "data to create data/local/probes/project-register-audit.json, or keep this "
                "test on such a machine"
            )
        result = audit_project_register(ROOT)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["audit_version"], 2)
        self.assertEqual(result["registered_projects_count"], 0)
        self.assertEqual(result["projects"], [])
        self.assertEqual(result["register_status"], "UNVERIFIED_NO_PROJECT_LEVEL_TARGETS")

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
        self.assertIsNone(cov["covered_problem_provinces_count"])
        self.assertEqual(cov["planned_target_problem_provinces"], ["50"])
        self.assertEqual(cov["planned_target_problem_provinces_count"], 1)
        self.assertEqual(cov["unverified_problem_provinces"], ["50", "94"])
        self.assertEqual(cov["unaddressed_gap_provinces"], [])
        self.assertIsNone(cov["coverage_rate"])

    def test_native_other_grains_never_expand_to_province_targets(self):
        for grain, codes in [("country", ["TH"]), ("district", ["7301"]),
                             ("subdistrict", ["730101"]), ("basin", ["test-basin"])]:
            with self.subTest(grain=grain):
                p = project_fixture(target_area_grain=grain, target_area_codes=codes)
                self.assertEqual(project_register.province_project_targets(p), [])
                out = analyze_spatial_project_coverage([AgriculturalProject(**p)], {"73", "74"})
                self.assertEqual(out["planned_target_problem_provinces_count"], 0)
                self.assertIsNone(out["covered_problem_provinces_count"])
                self.assertEqual(out["unverified_problem_provinces"], ["73", "74"])

    def test_explicit_province_targets_reject_empty_duplicate_invalid_or_wildcard(self):
        for codes in [[], ["73", "73"], ["00"], ["TH"], ["7301"], [73], [" 73"]]:
            with self.subTest(codes=codes):
                p = project_fixture(target_area_codes=codes)
                with self.assertRaises(ValueError):
                    project_register.province_project_targets(p)
                with self.assertRaises((ValueError, ValidationError)):
                    AgriculturalProject(**p).validate()

    def test_unknown_commodity_does_not_match_a_specific_crop(self):
        for unknown in [None, "", " "]:
            for query in ["ข้าว", "", " "]:
                p = AgriculturalProject(**project_fixture(target_commodity=unknown))
                out = analyze_spatial_project_coverage([p], {"73"}, commodity_filter=query)
                self.assertEqual(out["planned_target_problem_provinces"], [])
                self.assertEqual(out["unverified_problem_provinces"], ["73"])

    def test_project_validation_requires_finite_numbers_and_one_fiscal_year(self):
        for field in ["budget_allocated_baht", "budget_spent_baht", "target_area_rai", "actual_area_rai", "target_households", "actual_households"]:
            for value in [float("nan"), float("inf"), -float("inf")]:
                with self.subTest(field=field, value=value):
                    with self.assertRaises((ValueError, ValidationError)):
                        AgriculturalProject(**project_fixture(**{field:value})).validate()
        for year in ["2569/70", "25690", "25๖๙", "2569 ", "2569\n"]:
            with self.subTest(year=year):
                with self.assertRaises((ValueError, ValidationError)):
                    AgriculturalProject(**project_fixture(fiscal_year=year)).validate()
        for field in ["target_households", "actual_households"]:
            with self.assertRaises((ValueError, ValidationError)):
                AgriculturalProject(**project_fixture(**{field:2**63})).validate()
        AgriculturalProject(**project_fixture(target_households=2**63-1,actual_households=2**63-1)).validate()
        AgriculturalProject(**project_fixture(budget_allocated_baht=None, actual_area_rai=0)).validate()


if __name__ == "__main__":
    unittest.main()
