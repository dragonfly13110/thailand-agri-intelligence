"""Opt-in checks for audited snapshots held only in the owner's local data."""

import json
from pathlib import Path
import subprocess
import sys
import unittest

from tadih.coverage_inventory import audit_national_coverage_inventory
from tadih.plan_reconciliation import audit_national_plan_actual_reconciliation
from tadih.tmd_hpc_normalize import load_province_reference_points
from tadih.warehouse import connect, sync_national_hub_data
from scripts.audit_temporal_crosswalk import audit_crosswalk
from tadih import tmd_hpc_normalize as norm


ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "data/local"
COVERAGE_MANIFESTS = (
    "doae-p0/p0-run.json",
    "doae-p1/p1-run.json",
    "doae-p2/p2-run.json",
    "doae-archives/archive-run.json",
)
WAREHOUSE_INPUTS = (
    "probes/coverage-inventory.json",
    "probes/project-register-audit.json",
    "probes/spatial-evidence-audit.json",
    "probes/plan-actual-reconciliation.json",
    "production/doae_crop_master.json",
    "water/dwr_small_water_resources.json",
    "weather/dim_weather_stations.json",
    "weather/fact_daily_weather.json",
    "satellite/gistda_flood_7days.json",
    "satellite/hii_monthly_flood_risk.json",
)


def require_paths(test, relative_paths, label):
    missing = [path for path in relative_paths if not (LOCAL / path).is_file()]
    if missing:
        test.skipTest(f"requires {label} under data/local: {', '.join(missing)}")


class CoverageInventoryIntegrationTests(unittest.TestCase):
    def setUp(self):
        require_paths(self, COVERAGE_MANIFESTS, "the reviewed DOAE manifest snapshot")

    def test_doae_manifest_counts_reconcile_exactly_with_audit_thresholds(self):
        result = audit_national_coverage_inventory(ROOT)
        recon = result["reconciliation"]
        self.assertTrue(recon["all_manifest_counts_reconciled"])
        self.assertEqual(recon["doae_p0_source_records"], 1943298)
        self.assertEqual(recon["doae_p1_source_records"], 202747)
        self.assertEqual(recon["doae_p2_source_records"], 1534)
        self.assertEqual(recon["doae_archives_source_records"], 1289200)
        self.assertEqual(recon["total_doae_source_records"], 3436779)
        self.assertEqual(recon["total_doae_staged_records"], 3436080)
        self.assertEqual(recon["total_doae_quarantined_records"], 699)

    def test_spatial_grains_preserved_and_never_imputed(self):
        entries = audit_national_coverage_inventory(ROOT)["entries"]
        national_sources = [entry for entry in entries if entry["data_grain"] == "country"]
        self.assertGreaterEqual(len(national_sources), 3)
        self.assertTrue(all(entry["data_grain"] == "country" for entry in national_sources))
        rid_entries = [entry for entry in entries if entry["source_id"] == "rid"]
        self.assertTrue(all(entry["data_grain"] == "reservoir" for entry in rid_entries))
        grid_entries = [entry for entry in entries if entry["source_id"] in ("open_meteo", "planetary_computer")]
        self.assertTrue(all(entry["data_grain"] == "grid_point" for entry in grid_entries))

    def test_license_status_is_pending_for_all_unapproved_sources(self):
        entries = audit_national_coverage_inventory(ROOT)["entries"]
        for entry in entries:
            self.assertEqual(entry["license_status"], "pending", f"Resource {entry['resource_id']} license must be pending")

    def test_quarantined_resources_flagged_for_review(self):
        entries = audit_national_coverage_inventory(ROOT)["entries"]
        online_shifted = [entry for entry in entries if entry.get("dataset_id") == "online-product" and entry["quarantined_records"] > 0]
        self.assertEqual(len(online_shifted), 1)
        self.assertEqual(online_shifted[0]["status"], "NEEDS_REVIEW")
        mock_crop = [entry for entry in entries if entry.get("dataset_id") == "production-rt01-04" and entry.get("schema") == "rt_crops"]
        self.assertEqual(len(mock_crop), 1)
        self.assertEqual(mock_crop[0]["status"], "NEEDS_REVIEW")
        salt_crop = [entry for entry in entries if entry.get("dataset_id") == "production-rt01-04" and entry.get("schema") == "rt_salt"]
        self.assertEqual(len(salt_crop), 1)
        self.assertEqual(salt_crop[0]["status"], "NEEDS_REVIEW")


class PlanReconciliationIntegrationTests(unittest.TestCase):
    def setUp(self):
        require_paths(self, ("doae-p0/p0-run.json",), "the current DOAE P0 plan and result snapshot")

    def test_current_audit_selects_2569_subdistrict_plan_not_summary(self):
        out = audit_national_plan_actual_reconciliation(ROOT)
        for name, plans, actuals in (("rainy_season", 477, 3), ("dry_season", 599, 10)):
            section = out[name]
            self.assertEqual(section["overall_status"], "INCOMPARABLE")
            self.assertEqual(section["comparison_status"], "INCOMPARABLE")
            self.assertEqual(section["plan_record_count"], plans)
            self.assertEqual(section["result_record_count"], actuals)
            self.assertEqual(section["overlapping_provinces"], [])
            self.assertEqual(section["area_reconciliations"], [])
        self.assertEqual(out["dry_season"]["plan_provinces"], ["20", "46", "81", "90"])
        self.assertEqual(out["dry_season"]["actual_provinces"], ["10", "12", "13", "14", "41"])


class TemporalCrosswalkIntegrationTests(unittest.TestCase):
    def setUp(self):
        require_paths(self, ("doae-geography/subdistrict-crosswalk.csv",), "the reviewed DOAE geography crosswalk")

    def test_audit_crosswalk_resolves_all_recorded_anomalies(self):
        result = audit_crosswalk()
        self.assertTrue(result["all_known_anomalies_resolved"])
        self.assertGreaterEqual(result["resolved_anomalies"]["galyani_vadhana_code_rotation_rows"], 947)
        self.assertEqual(result["resolved_anomalies"]["unified_data_province_grain_rows"], 1320)
        self.assertEqual(result["resolved_anomalies"]["unified_data_district_grain_rows"], 13653)


class NationalWarehouseIntegrationTests(unittest.TestCase):
    def setUp(self):
        require_paths(self, WAREHOUSE_INPUTS, "the complete current warehouse source and audit set")
        self.db = connect(":memory:")

    def tearDown(self):
        if hasattr(self, "db"):
            self.db.close()

    def test_sync_national_hub_data(self):
        result = sync_national_hub_data(self.db, root_dir=ROOT)
        self.assertEqual(result["dim_province"], 77)
        from tadih.catalog import load_sources
        self.assertEqual(result["dim_source"], len(load_sources()) + 1)
        self.assertGreaterEqual(result["coverage_inventory"], 50)
        self.assertEqual(result["dim_project"], 0)
        self.assertEqual(result["fact_project_coverage"], 0)
        self.assertGreaterEqual(result["fact_spatial_evidence"], 100)
        self.assertEqual(result["fact_evidence_policy_match"], 77)
        self.assertEqual(result["fact_plan_actual_reconciliation"], 2)
        self.assertEqual(result["dim_crop_master"], 831)
        self.assertEqual(result["fact_natural_water_reservoir"], 302)
        self.assertEqual(result["dim_weather_station"], 12)
        self.assertGreaterEqual(result["fact_daily_weather"], 6)
        self.assertEqual(result["fact_satellite_flood_7days"], 10)
        self.assertEqual(result["fact_flood_risk_forecast"], 27023)

        self.assertEqual(self.db.execute("SELECT * FROM v_unaddressed_policy_gaps").fetchall(), [])
        self.assertEqual(self.db.execute("SELECT * FROM v_project_intervention_summary").fetchall(), [])
        self.assertGreater(len(self.db.execute("SELECT * FROM v_provincial_natural_water_security").fetchall()), 0)
        self.assertGreater(len(self.db.execute("SELECT * FROM v_satellite_flood_rice_impact").fetchall()), 0)
        self.assertGreater(len(self.db.execute("SELECT * FROM v_provincial_recent_weather").fetchall()), 0)
        national_intel = self.db.execute("SELECT * FROM v_provincial_national_intelligence").fetchall()
        self.assertEqual(len(national_intel), 77)
        roi_et = next(row for row in national_intel if row[0] == "45")
        self.assertIn("FLOOD_DAMAGE", roi_et[2])
        self.assertEqual(roi_et[3], "UNVERIFIED")
        self.assertIsNone(roi_et[5])
        self.assertTrue(all(value is None for value in roi_et[6:]))

        self.assertEqual(sync_national_hub_data(self.db, root_dir=ROOT), result)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v_unaddressed_policy_gaps").fetchone()[0], 0)


class LocalArtifactIntegrationTests(unittest.TestCase):
    def test_modis_cli_normalizes_owner_provided_point_sample(self):
        require_paths(self, ("satellite/pc_point_20240929.json",), "the owner-provided MODIS point sample")
        sample = LOCAL / "satellite/pc_point_20240929.json"
        result = subprocess.run([sys.executable, "-m", "tadih", "modis-ndvi", "--file", str(sample)],
                                capture_output=True, check=True)
        payload = json.loads(result.stdout.decode("utf-8"))
        self.assertEqual(payload["location_id"], "point:13.8:100.25")
        self.assertEqual(payload["ndvi"], 0.5700)
        self.assertEqual(payload["valid_fraction"], 0.0)
        self.assertEqual(payload["quality_flag"], "cloud_contaminated")
        self.assertEqual(payload["spatial_support"], "grid_point")

    def test_historical_commodity_inventory_union_matches_2569(self):
        require_paths(self, ("probes/historical-monthly-inventory.json",), "the owner-provided commodity inventory")
        data = json.loads((LOCAL / "probes/historical-monthly-inventory.json").read_text(encoding="utf-8"))
        current = set(next(year["names"] for year in data if year["year_th"] == 2569))
        all_products = set(product for year in data for product in year["names"])
        self.assertEqual(len(current), 44)
        self.assertEqual(current, all_products)
        presence = {product: sum(product in year["names"] for year in data) for product in all_products}
        self.assertEqual(sum(count == 16 for count in presence.values()), 39)
        self.assertEqual(sum(count < 16 for count in presence.values()), 5)

    def test_repository_geojson_has_77_provinces(self):
        require_paths(self, ("geography/ddpm_province.geojson",), "the owner-provided DDPM province boundary")
        provinces = load_province_reference_points(norm._resolve_repo_file("data/local/geography/ddpm_province.geojson"))
        self.assertEqual(len(provinces), 77)
        self.assertEqual(len({item["province_code"] for item in provinces}), 77)
        for province in provinces:
            self.assertTrue(5.0 <= province["reference_lat"] <= 21.0)
            self.assertTrue(96.0 <= province["reference_lon"] <= 106.0)


if __name__ == "__main__":
    unittest.main()
