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

        # Verify idempotency (re-sync should not duplicate rows)
        res2 = sync_national_hub_data(self.db, root_dir=ROOT)
        self.assertEqual(res, res2)
        count_gaps = self.db.execute("SELECT COUNT(*) FROM v_unaddressed_policy_gaps").fetchone()[0]
        self.assertEqual(count_gaps, 46)


if __name__ == "__main__":
    unittest.main()
