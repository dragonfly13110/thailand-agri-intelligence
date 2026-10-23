import json
from pathlib import Path
import tempfile
import unittest
import duckdb

from tadih.tier1_ingestion import sync_tier1_to_warehouse

ROOT = Path(__file__).resolve().parents[1]


class TestTier1Ingestion(unittest.TestCase):
    def setUp(self):
        self.db = duckdb.connect(":memory:")

    def tearDown(self):
        self.db.close()

    def test_sync_tier1_to_warehouse_mock(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            prod_dir = tmp_root / "data/local/production"
            sat_dir = tmp_root / "data/local/satellite"
            prod_dir.mkdir(parents=True, exist_ok=True)
            sat_dir.mkdir(parents=True, exist_ok=True)

            # 1. Create mock crop master
            crop_payload = {
                "metadata": {"total_records": 2},
                "records": [
                    {
                        "crop_code": "11000",
                        "crop_name_th": "ข้าวนาปี",
                        "crop_group_code": "1",
                        "crop_group_name_th": "ข้าว",
                        "breed_code": "11100",
                        "breed_name_th": "ขาวพวง",
                        "breed_characteristic": "ข้าวเจ้าไวต่อช่วงแสง",
                        "retrieved_at": "2026-10-23T06:00:00Z",
                        "license_status": "pending",
                    },
                    {
                        "crop_code": "11000",
                        "crop_name_th": "ข้าวนาปี",
                        "crop_group_code": "1",
                        "crop_group_name_th": "ข้าว",
                        "breed_code": "11101",
                        "breed_name_th": "ทองระทา 123",
                        "breed_characteristic": "ข้าวเจ้า",
                        "retrieved_at": "2026-10-23T06:00:00Z",
                        "license_status": "pending",
                    },
                ],
            }
            (prod_dir / "doae_crop_master.json").write_text(json.dumps(crop_payload), encoding="utf-8")

            # 2. Create mock flood risk
            flood_payload = {
                "metadata": {"total_records": 3},
                "records": [
                    {
                        "month": 9,
                        "dopa_tambon_code": "450101",
                        "tambon_name_th": "ในเมือง",
                        "dopa_amphoe_code": "4501",
                        "amphoe_name_th": "เมืองร้อยเอ็ด",
                        "dopa_province_code": "45",
                        "province_name_th": "ร้อยเอ็ด",
                        "recurrence_17yr_count": 8,
                        "risk_criteria": "4-8 รอบใน 17 ปี",
                        "risk_level": "เสี่ยงสูง",
                        "source_agency": "HII",
                        "retrieved_at": "2026-10-23T06:00:00Z",
                        "license_status": "pending",
                    },
                    {
                        "month": 9,
                        "dopa_tambon_code": "450102",
                        "tambon_name_th": "รอบเมือง",
                        "dopa_amphoe_code": "4501",
                        "amphoe_name_th": "เมืองร้อยเอ็ด",
                        "dopa_province_code": "45",
                        "province_name_th": "ร้อยเอ็ด",
                        "recurrence_17yr_count": 4,
                        "risk_criteria": "4-8 รอบใน 17 ปี",
                        "risk_level": "เสี่ยงปานกลาง",
                        "source_agency": "HII",
                        "retrieved_at": "2026-10-23T06:00:00Z",
                        "license_status": "pending",
                    },
                    {
                        "month": 9,
                        "dopa_tambon_code": "310101",
                        "tambon_name_th": "ในเมือง",
                        "dopa_amphoe_code": "3101",
                        "amphoe_name_th": "เมืองบุรีรัมย์",
                        "dopa_province_code": "31",
                        "province_name_th": "บุรีรัมย์",
                        "recurrence_17yr_count": 2,
                        "risk_criteria": "1-3 รอบใน 17 ปี",
                        "risk_level": "เสี่ยงต่ำ",
                        "source_agency": "HII",
                        "retrieved_at": "2026-10-23T06:00:00Z",
                        "license_status": "pending",
                    },
                ],
            }
            (sat_dir / "hii_monthly_flood_risk.json").write_text(json.dumps(flood_payload), encoding="utf-8")

            # Run sync
            results = sync_tier1_to_warehouse(self.db, root_dir=tmp_root)
            self.assertEqual(results["dim_crop_master"], 2)
            self.assertEqual(results["fact_flood_risk_forecast"], 3)

            # Check view aggregation
            view_rows = self.db.execute("""
                SELECT province_code, province_name_th, high_risk_tambons, medium_risk_tambons, low_risk_tambons
                FROM v_provincial_flood_risk_forecast
                WHERE province_code = '45'
            """).fetchall()
            self.assertEqual(len(view_rows), 1)
            row = view_rows[0]
            self.assertEqual(row[0], "45")
            self.assertEqual(row[1], "ร้อยเอ็ด")
            self.assertEqual(row[2], 1)  # high_risk_tambons
            self.assertEqual(row[3], 1)  # medium_risk_tambons
            self.assertEqual(row[4], 0)  # low_risk_tambons


if __name__ == "__main__":
    unittest.main()
