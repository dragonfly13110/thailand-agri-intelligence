import unittest
from pathlib import Path
import json
import tempfile
import duckdb

from tadih.warehouse import connect, init_national_hub_tables, sync_national_hub_data

ROOT = Path(__file__).resolve().parents[1]


class TestNationalWarehouse(unittest.TestCase):
    def setUp(self):
        self.db = connect(":memory:")

    def test_init_national_hub_tables(self):
        init_national_hub_tables(self.db)
        tables = [r[0] for r in self.db.execute("SHOW TABLES").fetchall()]
        expected_tables = [
            "dim_province",
            "dim_source",
            "national_coverage_inventory",
            "dim_project",
            "fact_project_coverage",
            "fact_spatial_evidence",
            "fact_evidence_policy_match",
            "fact_plan_actual_reconciliation",
            "dim_crop_master",
            "fact_natural_water_reservoir",
            "dim_weather_station",
            "fact_daily_weather",
            "fact_satellite_flood_7days",
            "fact_flood_risk_forecast",
        ]
        for t in expected_tables:
            self.assertIn(t, tables, f"Expected table {t} in warehouse")

    def test_stale_policy_probe_fails_before_warehouse_mutation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            probes = Path(tmp_dir) / "data/local/probes"
            probes.mkdir(parents=True)
            (probes / "project-register-audit.json").write_text(json.dumps({"audit_version": 1}), encoding="utf-8")
            (probes / "spatial-evidence-audit.json").write_text(json.dumps({"audit_version": 2}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Stale project-register-audit.json"):
                sync_national_hub_data(self.db, root_dir=Path(tmp_dir))
            tables = {row[0] for row in self.db.execute("SHOW TABLES").fetchall()}
            self.assertNotIn("dim_project", tables)

    def test_sync_national_hub_data(self):
        res = sync_national_hub_data(self.db, root_dir=ROOT)
        self.assertEqual(res["dim_province"], 77)
        self.assertEqual(res["dim_source"], 17)
        self.assertGreaterEqual(res["coverage_inventory"], 50)
        self.assertEqual(res["dim_project"], 0)
        self.assertEqual(res["fact_project_coverage"], 0)
        self.assertGreaterEqual(res["fact_spatial_evidence"], 100)
        self.assertEqual(res["fact_evidence_policy_match"], 77)
        self.assertEqual(res["fact_plan_actual_reconciliation"], 2)
        self.assertEqual(res["dim_crop_master"], 831)
        self.assertEqual(res["fact_natural_water_reservoir"], 302)
        self.assertEqual(res["dim_weather_station"], 12)
        self.assertGreaterEqual(res["fact_daily_weather"], 6)
        self.assertEqual(res["fact_satellite_flood_7days"], 10)
        self.assertEqual(res["fact_flood_risk_forecast"], 27023)

        # Verify Views
        gaps = self.db.execute("SELECT * FROM v_unaddressed_policy_gaps").fetchall()
        self.assertEqual(gaps, [])

        # Verify Project Summary View
        projects = self.db.execute("SELECT * FROM v_project_intervention_summary").fetchall()
        self.assertEqual(projects, [])

        # Verify Water Security View
        water_provinces = self.db.execute("SELECT * FROM v_provincial_natural_water_security").fetchall()
        self.assertGreater(len(water_provinces), 0)

        # Verify Satellite Flood Rice View
        flood_impact = self.db.execute("SELECT * FROM v_satellite_flood_rice_impact").fetchall()
        self.assertGreater(len(flood_impact), 0)

        # Verify Weather View
        weather_summary = self.db.execute("SELECT * FROM v_provincial_recent_weather").fetchall()
        self.assertGreater(len(weather_summary), 0)

        # Verify Master Provincial National Intelligence View (77 provinces linked 100%)
        nat_intel = self.db.execute("SELECT * FROM v_provincial_national_intelligence").fetchall()
        self.assertEqual(len(nat_intel), 77)
        # Check Roi Et (45) has identified problems
        roi_et = next(r for r in nat_intel if r[0] == "45")
        self.assertIn("FLOOD_DAMAGE", roi_et[2])
        self.assertEqual(roi_et[3], "UNVERIFIED")
        self.assertIsNone(roi_et[5])  # Unknown project coverage stays null.
        self.assertTrue(all(value is None for value in roi_et[6:]))  # External metrics await source review.

        # Verify idempotency (re-sync should not duplicate rows)
        res2 = sync_national_hub_data(self.db, root_dir=ROOT)
        self.assertEqual(res, res2)
        count_gaps = self.db.execute("SELECT COUNT(*) FROM v_unaddressed_policy_gaps").fetchone()[0]
        self.assertEqual(count_gaps, 0)


if __name__ == "__main__":
    unittest.main()
