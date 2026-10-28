"""Synthetic comparison contracts; no fixture is a real project or observation."""
from copy import deepcopy
import unittest
from tadih.catalog import ROOT
from tadih.plan_reconciliation import reconcile_seasonal_plan_and_actual, audit_national_plan_actual_reconciliation


def fixture(value, actual=False):
    key = "value" if actual else "planned_area_rai"
    return {"source_fields":{"crop_year_be":"2569","season_type":"RAINY","province_code":"73","province_name":"นครปฐม"},
            "numeric_values":{key:value}, "resource_id":"synthetic-test-only", "source_sha256":"a"*64, "duplicate_identity":False,
            "comparison_context":{"verified":True,"native_spatial_grain":"province","area_code":"73", "crop_identity":"test:rice",
                                  "period_id":"2569:RAINY","round_id":"1","metric":"planted_area","unit":"rai","value_key":key,
                                  "is_subtotal":False,"source_evidence":"synthetic test contract"}}


class PlanReconciliationTests(unittest.TestCase):
    def compare(self, plans, actuals):
        return reconcile_seasonal_plan_and_actual(plans,actuals,"RAINY","2569")

    def test_verified_identical_rows_compare_without_national_claim(self):
        out=self.compare([fixture(1000)],[fixture(850,True)])
        self.assertTrue(out["reconciliation_possible"])
        self.assertEqual(out["area_reconciliations"][0]["achievement_ratio"],.85)
        self.assertEqual(out["area_reconciliations"][0]["metric_group"],"planted_area")
        self.assertNotEqual(out["overall_status"],"FULLY_RECONCILED")

    def test_unverified_missing_context_or_required_field_blocks(self):
        for field in [None,"verified","native_spatial_grain","crop_identity","unit","period_id","round_id","is_subtotal","source_evidence"]:
            with self.subTest(field=field):
                p=fixture(1000)
                if field is None:p.pop("comparison_context")
                else:p["comparison_context"].pop(field)
                out=self.compare([p],[fixture(850,True)])
                self.assertFalse(out["reconciliation_possible"])
                self.assertEqual(out["area_reconciliations"],[])

    def test_exact_crop_unit_grain_period_round_metric_required(self):
        changes={"crop_identity":"test:vegetable","unit":"hectare","period_id":"other","round_id":"2","metric":"harvested_area","native_spatial_grain":"subdistrict"}
        for key,value in changes.items():
            with self.subTest(key=key):
                a=fixture(850,True);a["comparison_context"][key]=value
                if key=="native_spatial_grain":
                    a["comparison_context"]["area_code"]="730101";a["source_fields"]["subdistrict_code"]="730101"
                out=self.compare([fixture(1000)],[a])
                self.assertFalse(out["reconciliation_possible"])
                self.assertEqual(out["area_reconciliations"],[])

    def test_year_and_season_match_exactly_not_substring(self):
        for key,value in [("crop_year_be","2569/2570"),("crop_year_be","12569"),("season_type","DRY")]:
            with self.subTest(value=value):
                p=fixture(1000);p["source_fields"][key]=value
                out=self.compare([p],[fixture(850,True)])
                self.assertEqual(out["plan_record_count"],0)
                self.assertFalse(out["reconciliation_possible"])

    def test_missing_values_remain_null(self):
        for p,a in [(None,850),(1000,None)]:
            with self.subTest(p=p,a=a):
                out=self.compare([fixture(p)],[fixture(a,True)]);row=out["area_reconciliations"][0]
                self.assertEqual(row["plan_value"],p);self.assertEqual(row["actual_value"],a)
                self.assertIsNone(row["achievement_ratio"]);self.assertFalse(out["reconciliation_possible"])

    def test_zero_denominator_is_not_missing_or_zero_success(self):
        row=self.compare([fixture(0)],[fixture(850,True)])["area_reconciliations"][0]
        self.assertEqual(row["status"],"ZERO_PLAN_DENOMINATOR");self.assertEqual(row["plan_value"],0)
        self.assertIsNone(row["achievement_ratio"])

    def test_actual_zero_is_valid(self):
        self.assertEqual(self.compare([fixture(1000)],[fixture(0,True)])["area_reconciliations"][0]["achievement_ratio"],0)

    def test_duplicate_identity_on_either_side_blocks_pair(self):
        p,a=fixture(1000),fixture(850,True)
        for plans,actuals in [([p,deepcopy(p)],[a]),([p],[a,deepcopy(a)])]:
            out=self.compare(plans,actuals)
            self.assertFalse(out["reconciliation_possible"]);self.assertEqual(out["area_reconciliations"],[])

    def test_declared_duplicate_or_subtotal_is_rejected(self):
        for kind in ["duplicate","subtotal"]:
            p=fixture(1000)
            if kind=="duplicate":p["duplicate_identity"]=True
            else:p["comparison_context"]["is_subtotal"]=True
            self.assertFalse(self.compare([p],[fixture(850,True)])["reconciliation_possible"])

    def test_invalid_numbers_and_nonadditive_metrics_block(self):
        for bad in [float("nan"),float("inf"),10**1000,-1,True,"1000"]:
            out=self.compare([fixture(bad)],[fixture(850,True)])
            self.assertFalse(out["reconciliation_possible"])
            self.assertIsNone(out["area_reconciliations"][0]["achievement_ratio"])
        p,a=fixture(1000),fixture(850,True)
        p["comparison_context"]["metric"]=a["comparison_context"]["metric"]="yield"
        self.assertFalse(self.compare([p],[a])["reconciliation_possible"])

    def test_different_areas_never_compare(self):
        a=fixture(850,True);a["source_fields"]["province_code"]="10";a["comparison_context"]["area_code"]="10"
        out=self.compare([fixture(1000)],[a])
        self.assertEqual(out["overall_status"],"INCOMPARABLE");self.assertEqual(out["overlapping_provinces"],[])

    def test_native_area_requires_consistent_explicit_parent_hierarchy(self):
        for grain, area, district, subdistrict in [
            ("subdistrict","730101","7401","730101"),
            ("subdistrict","730101","7302","730101"),
            ("subdistrict","730101",None,"730101"),
            ("province","73","7401","730101"),
            ("province","73","7301","740101"),
            ("district","7301","7301","730201"),
        ]:
            with self.subTest(grain=grain,district=district,subdistrict=subdistrict):
                p,a=fixture(1000),fixture(850,True)
                for row in [p,a]:
                    row["comparison_context"].update(native_spatial_grain=grain,area_code=area)
                    row["source_fields"].update(district_code=district,subdistrict_code=subdistrict)
                out=self.compare([p],[a])
                self.assertFalse(out["reconciliation_possible"])
                self.assertEqual(out["area_reconciliations"],[])

    def test_verified_consistent_subdistrict_pair_is_eligible(self):
        p,a=fixture(1000),fixture(850,True)
        for row in [p,a]:
            row["comparison_context"].update(native_spatial_grain="subdistrict",area_code="730101")
            row["source_fields"].update(district_code="7301",subdistrict_code="730101")
        out=self.compare([p],[a])
        self.assertTrue(out["reconciliation_possible"])
        self.assertEqual(out["area_reconciliations"][0]["achievement_ratio"],.85)

if __name__=="__main__":unittest.main()
