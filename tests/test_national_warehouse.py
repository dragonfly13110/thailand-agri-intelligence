import unittest
from pathlib import Path
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

    def test_sync_national_hub_data(self):
        res = sync_national_hub_data(self.db, root_dir=ROOT)
        self.assertGreaterEqual(res["coverage_inventory"], 50)
        self.assertGreaterEqual(res["dim_project"], 5)
        self.assertGreaterEqual(res["fact_project_coverage"], 77)
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
        self.assertEqual(len(gaps), 46)

        # Check top gap province is Roi Et (45) with > 150k rai flood damage
        top_gap = gaps[0]
        self.assertEqual(top_gap[0], "45")  # Roi Et province code
        self.assertGreater(top_gap[5], 150000.0)  # flood_damage_rai

        # Verify Project Summary View
        projects = self.db.execute("SELECT * FROM v_project_intervention_summary").fetchall()
        self.assertGreaterEqual(len(projects), 5)

        # Verify Water Security View
        water_provinces = self.db.execute("SELECT * FROM v_provincial_natural_water_security").fetchall()
        self.assertGreater(len(water_provinces), 0)

        # Verify Satellite Flood Rice View
        flood_impact = self.db.execute("SELECT * FROM v_satellite_flood_rice_impact").fetchall()
        self.assertGreater(len(flood_impact), 0)

        # Verify Weather View
        weather_summary = self.db.execute("SELECT * FROM v_provincial_recent_weather").fetchall()
        self.assertGreater(len(weather_summary), 0)

        # Verify idempotency (re-sync should not duplicate rows)
        res2 = sync_national_hub_data(self.db, root_dir=ROOT)
        self.assertEqual(res, res2)
        count_gaps = self.db.execute("SELECT COUNT(*) FROM v_unaddressed_policy_gaps").fetchone()[0]
        self.assertEqual(count_gaps, 46)


if __name__ == "__main__":
    unittest.main()
