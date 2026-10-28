import unittest
from pathlib import Path
import json
import tempfile
import duckdb
from jsonschema import ValidationError

from tadih.warehouse import connect, init_national_hub_tables, sync_national_hub_data
from tests.test_project_register import project_fixture

ROOT = Path(__file__).resolve().parents[1]


class TestNationalWarehouse(unittest.TestCase):
    def setUp(self):
        self.db = connect(":memory:")

    def tearDown(self):
        self.db.close()

    def write_proofs(self, root, projects, cards=None):
        probes=root/"data/local/probes";probes.mkdir(parents=True,exist_ok=True)
        (probes/"project-register-audit.json").write_text(json.dumps({"audit_version":2,"projects":projects}),encoding="utf-8")
        (probes/"spatial-evidence-audit.json").write_text(json.dumps({"audit_version":2,"province_cards":cards or []}),encoding="utf-8")

    def test_country_project_retains_native_record_but_creates_no_province_edges(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            self.write_proofs(root,[project_fixture(target_area_grain="country",target_area_codes=["TH"])])
            out=sync_national_hub_data(self.db,root_dir=root)
            self.assertEqual(out["dim_project"],1)
            self.assertEqual(out["fact_project_coverage"],0)
            self.assertEqual(self.db.execute("SELECT target_area_grain FROM dim_project").fetchone()[0],"country")

    def test_only_declared_province_targets_are_written(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.write_proofs(root,[project_fixture(target_area_codes=["73","74"])])
            sync_national_hub_data(self.db,root_dir=root)
            self.assertEqual(self.db.execute("SELECT province_code,is_targeted FROM fact_project_coverage ORDER BY province_code").fetchall(),[("73",True),("74",True)])

    def test_household_storage_overflow_fails_before_init_or_existing_data_mutation(self):
        for field in ["target_households", "actual_households"]:
            for existing in [False, True]:
                with self.subTest(field=field,existing=existing), tempfile.TemporaryDirectory() as temp:
                    root=Path(temp);self.write_proofs(root,[project_fixture(**{field:2**63})])
                    db=connect(":memory:")
                    try:
                        if existing:
                            init_national_hub_tables(db)
                            db.execute("INSERT INTO dim_project(project_id) VALUES ('KEEP')")
                        tables_before=db.execute("SHOW TABLES").fetchall()
                        before=db.execute("SELECT * FROM dim_project").fetchall() if existing else None
                        with self.assertRaises((ValueError,ValidationError)):
                            sync_national_hub_data(db,root_dir=root)
                        self.assertEqual(db.execute("SHOW TABLES").fetchall(),tables_before)
                        if existing:self.assertEqual(db.execute("SELECT * FROM dim_project").fetchall(),before)
                    finally:db.close()

    def test_maximum_bigint_household_counts_are_preserved_exactly(self):
        maximum=2**63-1
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            self.write_proofs(root,[project_fixture(target_households=maximum,actual_households=maximum)])
            sync_national_hub_data(self.db,root_dir=root)
            self.assertEqual(self.db.execute("SELECT target_households,actual_households FROM dim_project").fetchone(),(maximum,maximum))

    def test_bad_project_proof_does_not_initialize_or_clear_existing_tables(self):
        for project in [project_fixture(target_area_codes=["00"]),project_fixture(target_area_codes=[]),
                        project_fixture(target_area_codes=["73","73"]),project_fixture(budget_allocated_baht=float("nan")),
                        project_fixture(fiscal_year="2569/70")]:
            with self.subTest(project=project):
                with tempfile.TemporaryDirectory() as temp:
                    root=Path(temp);self.write_proofs(root,[project])
                    fresh=connect(":memory:")
                    try:
                        with self.assertRaises(Exception):sync_national_hub_data(fresh,root_dir=root)
                        self.assertNotIn("dim_project",{x[0] for x in fresh.execute("SHOW TABLES").fetchall()})
                    finally:fresh.close()
                    init_national_hub_tables(self.db)
                    self.db.execute("DELETE FROM dim_project")
                    self.db.execute("INSERT INTO dim_project(project_id) VALUES ('KEEP')")
                    before=self.db.execute("SELECT * FROM dim_project").fetchall()
                    with self.assertRaises(Exception):sync_national_hub_data(self.db,root_dir=root)
                    self.assertEqual(self.db.execute("SELECT * FROM dim_project").fetchall(),before)

    def test_malformed_spatial_proof_is_rejected_before_init(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);self.write_proofs(root,[],cards=[{"province_code":"73"}])
            with self.assertRaises(Exception):sync_national_hub_data(self.db,root_dir=root)
            self.assertNotIn("dim_project",{x[0] for x in self.db.execute("SHOW TABLES").fetchall()})

    def test_duplicate_identity_or_inconsistent_count_is_rejected_before_init(self):
        for duplicate in [True, False]:
            with self.subTest(duplicate=duplicate), tempfile.TemporaryDirectory() as temp:
                root=Path(temp)
                self.write_proofs(root,[project_fixture(),project_fixture()] if duplicate else [project_fixture()])
                if not duplicate:
                    probe=root/"data/local/probes/project-register-audit.json"
                    obj=json.loads(probe.read_text(encoding="utf-8"));obj["registered_projects_count"]=0
                    probe.write_text(json.dumps(obj),encoding="utf-8")
                with self.assertRaises(ValueError):sync_national_hub_data(self.db,root_dir=root)
                self.assertNotIn("dim_project",{x[0] for x in self.db.execute("SHOW TABLES").fetchall()})

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


if __name__ == "__main__":
    unittest.main()
