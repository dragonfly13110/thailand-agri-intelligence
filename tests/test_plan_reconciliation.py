"""Unit tests for Actual vs Plan Reconciliation Engine."""

import unittest

from tadih.catalog import ROOT
from tadih.plan_reconciliation import (
    reconcile_seasonal_plan_and_actual,
    audit_national_plan_actual_reconciliation,
)


class PlanReconciliationTests(unittest.TestCase):
    def test_incomparable_when_provinces_do_not_overlap(self):
        plans = [{
            "source_fields": {"crop_year_be": "2569", "season_type": "RAINY", "province_code": "20", "province_name": "ชลบุรี"},
            "numeric_values": {"planned_area_rai": 500.0}
        }]
        results = [{
            "source_fields": {"crop_year_be": "2569", "season_type": "RAINY", "province_code": "10", "province_name": "กรุงเทพมหานคร"},
            "numeric_values": {"value": 200.0}
        }]

        audit = reconcile_seasonal_plan_and_actual(plans, results, season="RAINY", crop_year="2569")
        self.assertEqual(audit["overall_status"], "INCOMPARABLE")
        self.assertFalse(audit["reconciliation_possible"])
        self.assertEqual(audit["overlapping_provinces"], [])
        self.assertIn("No overlapping provinces", audit["diagnostic_summary"])

    def test_reconciliation_computed_when_provinces_overlap(self):
        plans = [{
            "source_fields": {"crop_year_be": "2569", "season_type": "RAINY", "province_code": "20", "province_name": "ชลบุรี"},
            "numeric_values": {"planned_area_rai": 1000.0}
        }]
        results = [{
            "source_fields": {"crop_year_be": "2569", "season_type": "RAINY", "province_code": "20", "province_name": "ชลบุรี"},
            "numeric_values": {"value": 850.0}
        }]

        audit = reconcile_seasonal_plan_and_actual(plans, results, season="RAINY", crop_year="2569")
        self.assertTrue(audit["reconciliation_possible"])
        self.assertEqual(audit["overlapping_provinces"], ["20"])
        area_rec = audit["area_reconciliations"][0]
        self.assertEqual(area_rec["province_code"], "20")
        self.assertEqual(area_rec["plan_value"], 1000.0)
        self.assertEqual(area_rec["actual_value"], 850.0)
        self.assertAlmostEqual(area_rec["achievement_ratio"], 0.85)

    def test_zero_denominator_safely_handled(self):
        plans = [{
            "source_fields": {"crop_year_be": "2569", "season_type": "RAINY", "province_code": "20", "province_name": "ชลบุรี"},
            "numeric_values": {"planned_area_rai": 0.0}
        }]
        results = [{
            "source_fields": {"crop_year_be": "2569", "season_type": "RAINY", "province_code": "20", "province_name": "ชลบุรี"},
            "numeric_values": {"value": 100.0}
        }]

        audit = reconcile_seasonal_plan_and_actual(plans, results, season="RAINY", crop_year="2569")
        area_rec = audit["area_reconciliations"][0]
        self.assertEqual(area_rec["status"], "ZERO_PLAN_DENOMINATOR")
        self.assertIsNone(area_rec["achievement_ratio"])

    def test_audit_national_reconciliation_live_data(self):
        result = audit_national_plan_actual_reconciliation(ROOT)
        self.assertEqual(result["status"], "success")
        rainy = result["rainy_season"]
        self.assertEqual(rainy["overall_status"], "INCOMPARABLE")
        self.assertEqual(rainy["plan_record_count"], 477)
        self.assertEqual(rainy["result_record_count"], 3)
        self.assertEqual(rainy["overlapping_provinces"], [])


if __name__ == "__main__":
    unittest.main()
