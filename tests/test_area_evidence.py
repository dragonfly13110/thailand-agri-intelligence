"""Area evidence tests use small synthetic DuckDB and staging fixtures only."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tadih.area_evidence import read_area_evidence
from tadih.local_data import read_local_dataset
from tadih.warehouse import connect, init_national_hub_tables


PROVINCES = [
    {"area_code": "73", "name_th": "นครปฐม"},
    {"area_code": "31", "name_th": "บุรีรัมย์"},
    {"area_code": "10", "name_th": "กรุงเทพมหานคร"},
]


class AreaEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.local = self.root / "data/local"
        self.local.mkdir(parents=True)
        self.province_patch = patch("tadih.area_evidence.load_provinces", return_value=PROVINCES)
        self.province_patch.start()

        with connect(self.local / "tadih.duckdb") as db:
            init_national_hub_tables(db)
            db.executemany(
                """INSERT INTO fact_spatial_evidence
                   (evidence_id, province_code, source_id, resource_id, problem_type, metric_name,
                    metric_value, unit, native_spatial_grain, native_area_code, observed_period, license_status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    ("EV-73-FL", "73", "doae", "fixture-doae", "FLOOD_DAMAGE",
                     "damaged_area_flood_in_irrigation_area_rai", 12.5, "ไร่", "province", "73", "2568", "pending"),
                    ("EV-73-DR", "73", "doae", "fixture-doae", "DROUGHT_DAMAGE",
                     "damaged_area_drought_outside_irrigation_area_rai", 7.0, "ไร่", "province", "73", "2568", "pending"),
                    ("EV-31-FL", "31", "doae", "fixture-doae", "FLOOD_DAMAGE",
                     "damaged_area_flood_in_irrigation_area_rai", 20.0, "ไร่", "province", "31", "2568", "pending"),
                    ("EV-31-DR1", "31", "doae", "fixture-doae", "DROUGHT_DAMAGE",
                     "damaged_area_drought_in_irrigation_area_rai", 30.0, "ไร่", "province", "31", "2568", "pending"),
                    ("EV-31-DR2", "31", "doae", "fixture-doae", "DROUGHT_DAMAGE",
                     "damaged_area_drought_outside_irrigation_area_rai", 40.0, "ไร่", "province", "31", "2568", "pending"),
                ],
            )
            db.execute(
                """INSERT INTO fact_evidence_policy_match
                   (province_code, province_name_th, identified_problems, matched_intervention_ids,
                    intervention_status, diagnostic_notes, last_audited_at)
                   VALUES ('73', 'นครปฐม', 'FLOOD_DAMAGE', '', 'UNVERIFIED',
                           'ตรวจทะเบียนโครงการและพื้นที่เป้าหมายไม่ครบ', '2026-10-28T00:00:00Z')"""
            )
            db.executemany(
                """INSERT INTO fact_natural_water_reservoir
                   (water_resource_code, water_resource_name_th, water_resource_size, tambon_name_th,
                    amphoe_name_th, province_name_th, province_code, storage_m3, active_storage_m3,
                    outflow_m3_per_sec, source_agency, license_status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    ("W-31-A", "อ่างทดสอบ A", "กลาง", "ตำบลทดสอบ", "อำเภอทดสอบ", "บุรีรัมย์", "31",
                     1200.0, 900.0, None, "DWR", "pending"),
                    ("W-31-B", "อ่างทดสอบ B", "เล็ก", "ตำบลทดสอบ", "อำเภอทดสอบ", "บุรีรัมย์", "31",
                     500.0, None, 0.2, "DWR", "pending"),
                ],
            )

        for folder, rows in (
            ("production/staged", ["นครปฐม", "นครปฐม", "บุรีรัมย์"]),
            ("production/perennial-staged", ["นครปฐม"]),
            ("production/dryplant-staged", ["บุรีรัมย์"]),
        ):
            path = self.local / folder / "synthetic" / "records.jsonl"
            path.parent.mkdir(parents=True)
            path.write_text("".join(json.dumps({"province_name": name}, ensure_ascii=False) + "\n" for name in rows), encoding="utf-8")

    def tearDown(self):
        self.province_patch.stop()
        self.temp.cleanup()

    def test_area_evidence_preserves_fixture_records_and_provenance(self):
        result = read_area_evidence({"province": "นครปฐม"}, root=self.root)
        self.assertEqual(result["state"], "ready")
        self.assertEqual((result["province_code"], result["province_name_th"]), ("73", "นครปฐม"))

        evidence = result["evidence_records"]
        self.assertEqual(len(evidence), 2)
        self.assertEqual({row["problem_type"] for row in evidence}, {"FLOOD_DAMAGE", "DROUGHT_DAMAGE"})
        for row in evidence:
            self.assertEqual(row["unit"], "ไร่")
            self.assertEqual(row["license_status"], "pending")
            self.assertEqual(row["native_spatial_grain"], "province")

        policy = result["policy_match"]
        self.assertEqual(policy["intervention_status"], "UNVERIFIED")
        self.assertEqual(policy["identified_problems"], ["FLOOD_DAMAGE"])
        self.assertIn("ตรวจทะเบียนโครงการ", policy["diagnostic_notes"])
        self.assertEqual([row["candidate_id"] for row in result["candidate_projects"]], ["CAND-DOAE-2566-DRYPLANT-REPLACEMENT"])
        self.assertEqual(result["crop_summary"], {"short_crop_rows": 2, "perennial_rows": 1, "dry_season_plan_rows": 0})
        self.assertTrue(any("No Synthetic Composite Risk Score" in note for note in result["governance_guarantees"]))

    def test_area_evidence_keeps_reservoirs_as_individual_native_records(self):
        result = read_area_evidence({"province_code": "31"}, root=self.root)
        self.assertEqual((result["province_code"], result["province_name_th"]), ("31", "บุรีรัมย์"))
        self.assertEqual(len(result["evidence_records"]), 3)
        self.assertEqual({row["problem_type"] for row in result["evidence_records"]}, {"FLOOD_DAMAGE", "DROUGHT_DAMAGE"})

        reservoirs = result["water_resources"]
        self.assertEqual([row["water_resource_code"] for row in reservoirs], ["W-31-A", "W-31-B"])
        self.assertEqual([row["storage_m3"] for row in reservoirs], [1200.0, 500.0])
        self.assertEqual([row["source_agency"] for row in reservoirs], ["DWR", "DWR"])
        self.assertTrue(all(row["license_status"] == "pending" for row in reservoirs))

    def test_read_area_evidence_input_validation(self):
        with self.assertRaises(ValueError):
            read_area_evidence({}, root=self.root)
        with self.assertRaises(ValueError):
            read_area_evidence({"province": "จังหวัดที่ไม่มีอยู่จริง"}, root=self.root)

    def test_local_data_router_calls_area_evidence_view(self):
        result = read_local_dataset({
            "dataset": "short-crop-production",
            "view": "area_evidence",
            "province": "นครปฐม",
        }, root=self.root)
        self.assertEqual(result["state"], "ready")
        self.assertEqual(result["view"], "area_evidence")
        self.assertEqual(result["province_code"], "73")


if __name__ == "__main__":
    unittest.main()
