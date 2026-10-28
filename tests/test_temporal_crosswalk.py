"""Unit tests for Temporal Administrative Crosswalk and Resolution Module."""

import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tadih.temporal_crosswalk import (
    resolve_administrative_anomaly,
    audit_unified_province_data_grain,
    SpatialResolution,
)


class TemporalCrosswalkTests(unittest.TestCase):
    def test_galyani_vadhana_code_rotation_resolved(self):
        # DOAE used 502501 for Chaem Luang, while DOPA 2023 uses 502503
        res = resolve_administrative_anomaly(
            province_code="50",
            district_code="5025",
            subdistrict_code="502501",
            province_name="เชียงใหม่",
            district_name="กัลยาณิวัฒนา",
            subdistrict_name="แจ่มหลวง",
            metric_name="planted_area",
        )
        self.assertEqual(res.resolved_subdistrict_code, "502503")
        self.assertEqual(res.resolved_district_code, "5025")
        self.assertEqual(res.resolved_province_code, "50")
        self.assertEqual(res.resolution_status, "resolved_dopa_rotation")
        self.assertTrue(res.rollup_eligible)
        self.assertEqual(res.valid_from, "2009-12-26")

        # Ban Chan: DOAE 502502 -> DOPA 502501
        res_bc = resolve_administrative_anomaly(
            province_code="50",
            district_code="5025",
            subdistrict_code="502502",
            province_name="เชียงใหม่",
            district_name="กัลยาณิวัฒนา",
            subdistrict_name="บ้านจันทร์",
            metric_name="planted_area",
        )
        self.assertEqual(res_bc.resolved_subdistrict_code, "502501")

        # Mae Daed: DOAE 502503 -> DOPA 502502
        res_md = resolve_administrative_anomaly(
            province_code="50",
            district_code="5025",
            subdistrict_code="502503",
            province_name="เชียงใหม่",
            district_name="กัลยาณิวัฒนา",
            subdistrict_name="แม่แดด",
            metric_name="planted_area",
        )
        self.assertEqual(res_md.resolved_subdistrict_code, "502502")

    def test_bang_bon_historical_split_fallback_to_district(self):
        # Pre-2017 Bang Bon subdistrict 105001
        res = resolve_administrative_anomaly(
            province_code="10",
            district_code="1050",
            subdistrict_code="105001",
            province_name="กรุงเทพมหานคร",
            district_name="เขตบางบอน",
            subdistrict_name="บางบอน",
            metric_name="production",
            source_period_year=2015,
        )
        self.assertEqual(res.resolved_province_code, "10")
        self.assertEqual(res.resolved_district_code, "1050")
        self.assertIsNone(res.resolved_subdistrict_code)
        self.assertEqual(res.admin_grain, "district_parent_fallback")
        self.assertTrue(res.rollup_eligible)
        self.assertEqual(res.valid_to, "2017-07-26")

        # Post-2017 attempt using 105001 must not be rollup eligible
        res_future = resolve_administrative_anomaly(
            province_code="10",
            district_code="1050",
            subdistrict_code="105001",
            province_name="กรุงเทพมหานคร",
            district_name="เขตบางบอน",
            subdistrict_name="บางบอน",
            metric_name="production",
            source_period_year=2024,
        )
        self.assertFalse(res_future.rollup_eligible)

    def test_trang_dummy_record_quarantined(self):
        res = resolve_administrative_anomaly(
            province_code="92",
            district_code="9204",
            subdistrict_code="920414",
            province_name="ตรัง",
            district_name="กันตัง",
            subdistrict_name="xxxxxxxx",
            metric_name="production",
        )
        self.assertEqual(res.resolution_status, "quarantined_test_record")
        self.assertFalse(res.rollup_eligible)

    def test_unified_province_data_grain_disambiguation(self):
        # Province record
        p_res = resolve_administrative_anomaly(
            province_code="10",
            district_code="",
            subdistrict_code="",
            province_name="กรุงเทพมหานคร",
            district_name="",
            subdistrict_name="",
            metric_name="production",
        )
        self.assertEqual(p_res.admin_grain, "province")
        self.assertEqual(p_res.resolved_province_code, "10")
        self.assertIsNone(p_res.resolved_district_code)

        # District record
        d_res = resolve_administrative_anomaly(
            province_code="10",
            district_code="1001",
            subdistrict_code="",
            province_name="กรุงเทพมหานคร",
            district_name="พระนคร",
            subdistrict_name="",
            metric_name="production",
        )
        self.assertEqual(d_res.admin_grain, "district")
        self.assertEqual(d_res.resolved_district_code, "1001")
        self.assertIsNone(d_res.resolved_subdistrict_code)

    def test_non_additive_and_subtotal_metrics_blocked_from_rollup(self):
        # Non-additive metric: yield
        res_yield = resolve_administrative_anomaly(
            province_code="50",
            district_code="5001",
            subdistrict_code="500101",
            province_name="เชียงใหม่",
            district_name="เมืองเชียงใหม่",
            subdistrict_name="ศรีภูมิ",
            metric_name="yield_per_rai",
        )
        self.assertFalse(res_yield.rollup_eligible)

        # Subtotal row
        res_subtotal = resolve_administrative_anomaly(
            province_code="50",
            district_code="5001",
            subdistrict_code="500101",
            province_name="เชียงใหม่",
            district_name="เมืองเชียงใหม่",
            subdistrict_name="ศรีภูมิ",
            metric_name="planted_area",
            is_subtotal=True,
        )
        self.assertFalse(res_subtotal.rollup_eligible)

    def test_audit_unified_province_data_grain_classification(self):
        rows = [
            {"district_name": "", "subdistrict_name": ""},
            {"district_name": "เมือง", "subdistrict_name": ""},
            {"district_name": "เมือง", "subdistrict_name": "ตำบลทดสอบ"},
        ]
        audit = audit_unified_province_data_grain(rows)
        self.assertFalse(audit["is_correctly_disambiguated"])
        self.assertEqual(audit["total_rows"], 3)
        self.assertEqual(audit["province_grain_rows"], 1)
        self.assertEqual(audit["district_grain_rows"], 1)
        self.assertEqual(audit["other_grain_rows"], 1)


    def test_crosswalk_audit_aggregates_small_synthetic_signatures(self):
        from scripts.audit_temporal_crosswalk import audit_crosswalk

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            local = root / "data/local"
            crosswalk = local / "doae-geography/subdistrict-crosswalk.csv"
            crosswalk.parent.mkdir(parents=True)
            (local / "probes").mkdir()
            with crosswalk.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=[
                    "source_record_count", "source_province_code", "source_district_code",
                    "source_subdistrict_code", "source_province_name", "source_district_name",
                    "source_subdistrict_name",
                ])
                writer.writeheader()
                writer.writerows([
                    {"source_record_count": 947, "source_province_code": "50", "source_district_code": "5025",
                     "source_subdistrict_code": "502501", "source_province_name": "เชียงใหม่",
                     "source_district_name": "กัลยาณิวัฒนา", "source_subdistrict_name": "แจ่มหลวง"},
                    {"source_record_count": 12, "source_province_code": "10", "source_district_code": "1050",
                     "source_subdistrict_code": "105001", "source_province_name": "กรุงเทพมหานคร",
                     "source_district_name": "เขตบางบอน", "source_subdistrict_name": "บางบอน"},
                    {"source_record_count": 1, "source_province_code": "92", "source_district_code": "9204",
                     "source_subdistrict_code": "920414", "source_province_name": "ตรัง",
                     "source_district_name": "กันตัง", "source_subdistrict_name": "xxxxxxxx"},
                    {"source_record_count": 1320, "source_province_code": "10", "source_province_name": "กรุงเทพมหานคร"},
                    {"source_record_count": 13653, "source_province_code": "10", "source_district_code": "1001",
                     "source_province_name": "กรุงเทพมหานคร", "source_district_name": "พระนคร"},
                ])

            with patch("scripts.audit_temporal_crosswalk.ROOT", root):
                result = audit_crosswalk()

        self.assertTrue(result["all_known_anomalies_resolved"])
        self.assertEqual(result["resolved_anomalies"]["galyani_vadhana_code_rotation_rows"], 947)
        self.assertEqual(result["resolved_anomalies"]["bang_bon_historical_split_rows"], 12)
        self.assertEqual(result["resolved_anomalies"]["trang_dummy_quarantined_rows"], 1)
        self.assertEqual(result["resolved_anomalies"]["unified_data_province_grain_rows"], 1320)
        self.assertEqual(result["resolved_anomalies"]["unified_data_district_grain_rows"], 13653)


if __name__ == "__main__":
    unittest.main()
