import json
from pathlib import Path
import tempfile
import unittest
import duckdb

from tadih.backup_restore import (
    compute_sha256,
    create_warehouse_backup,
    verify_warehouse_restore,
)


class TestBackupRestore(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.db_path = self.root / "test_warehouse.duckdb"
        self.backup_dir = self.root / "backups"

        # Create sample DuckDB database with required tables
        con = duckdb.connect(str(self.db_path))
        con.execute("CREATE TABLE dim_province (province_code VARCHAR, name_th VARCHAR);")
        con.execute("CREATE TABLE dim_source (source_id VARCHAR, name VARCHAR);")
        con.execute("CREATE TABLE observations (observation_id VARCHAR, value DOUBLE);")
        con.execute("CREATE TABLE latest_observations (observation_id VARCHAR, value DOUBLE);")
        con.execute("CREATE TABLE fact_spatial_evidence (province_code VARCHAR, problem_type VARCHAR);")
        con.execute("CREATE TABLE fact_natural_water_reservoir (reservoir_code VARCHAR, name_th VARCHAR);")
        con.execute("CREATE TABLE fact_evidence_policy_match (province_code VARCHAR, status VARCHAR);")
        for i in range(10):
            con.execute(f"INSERT INTO latest_observations VALUES ('obs_{i}', {i});")
        con.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_create_and_restore_backup_success(self):
        manifest = create_warehouse_backup(self.db_path, self.backup_dir, label="unit-test")
        backup_file = Path(manifest["backup_path"])

        self.assertTrue(backup_file.exists())
        self.assertEqual(manifest["latest_observations_count"], 10)
        self.assertEqual(manifest["source_sha256"], manifest["backup_sha256"])

        restore_report = verify_warehouse_restore(
            backup_file,
            expected_sha256=manifest["backup_sha256"],
            expected_min_observations=5,
        )
        self.assertEqual(restore_report["restore_status"], "RESTORE_VERIFIED_SUCCESS")
        self.assertEqual(restore_report["latest_observations"], 10)

    def test_checksum_mismatch_detected_on_restore(self):
        manifest = create_warehouse_backup(self.db_path, self.backup_dir, label="unit-test")
        backup_file = Path(manifest["backup_path"])

        fake_sha256 = "0" * 64
        with self.assertRaises(ValueError) as ctx:
            verify_warehouse_restore(
                backup_file,
                expected_sha256=fake_sha256,
                expected_min_observations=5,
            )
        self.assertIn("Checksum mismatch", str(ctx.exception))

    def test_missing_required_tables_fails(self):
        bad_db_path = self.root / "bad.duckdb"
        con = duckdb.connect(str(bad_db_path))
        con.execute("CREATE TABLE some_random_table (id INT);")
        con.close()

        with self.assertRaises(ValueError) as ctx:
            verify_warehouse_restore(bad_db_path, expected_min_observations=0)
        self.assertIn("missing required tables", str(ctx.exception))

    def test_low_observation_count_fails_threshold(self):
        manifest = create_warehouse_backup(self.db_path, self.backup_dir)
        backup_file = Path(manifest["backup_path"])

        with self.assertRaises(ValueError) as ctx:
            verify_warehouse_restore(backup_file, expected_min_observations=100)
        self.assertIn("Observation count below threshold", str(ctx.exception))
