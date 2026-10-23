"""Unit tests for National Agriculture Data Center Coverage Inventory."""

import json
from pathlib import Path
import tempfile
import unittest

from tadih.catalog import ROOT
from tadih.coverage_inventory import (
    compile_doae_coverage,
    compile_warehouse_and_staging_coverage,
    audit_national_coverage_inventory,
)


class CoverageInventoryTests(unittest.TestCase):
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
        result = audit_national_coverage_inventory(ROOT)
        entries = result["entries"]

        # National sources must have grain country and never province
        national_sources = [e for e in entries if e["data_grain"] == "country"]
        self.assertGreaterEqual(len(national_sources), 3)
        for e in national_sources:
            self.assertEqual(e["data_grain"], "country")

        # Reservoir sources must have grain reservoir
        rid_entries = [e for e in entries if e["source_id"] == "rid"]
        self.assertTrue(all(e["data_grain"] == "reservoir" for e in rid_entries))

        # Weather / Satellite must have grain grid_point
        grid_entries = [e for e in entries if e["source_id"] in ("open_meteo", "planetary_computer")]
        self.assertTrue(all(e["data_grain"] == "grid_point" for e in grid_entries))

    def test_license_status_is_pending_for_all_unapproved_sources(self):
        result = audit_national_coverage_inventory(ROOT)
        entries = result["entries"]
        for e in entries:
            self.assertEqual(e["license_status"], "pending", f"Resource {e['resource_id']} license must be pending")

    def test_quarantined_resources_flagged_for_review(self):
        result = audit_national_coverage_inventory(ROOT)
        entries = result["entries"]

        # Online 2568 with 524 quarantined rows must have status NEEDS_REVIEW
        online_shifted = [e for e in entries if e.get("dataset_id") == "online-product" and e["quarantined_records"] > 0]
        self.assertEqual(len(online_shifted), 1)
        self.assertEqual(online_shifted[0]["status"], "NEEDS_REVIEW")

        # RT crops mock must be NEEDS_REVIEW
        mock_crop = [e for e in entries if e.get("dataset_id") == "production-rt01-04" and e.get("schema") == "rt_crops"]
        self.assertEqual(len(mock_crop), 1)
        self.assertEqual(mock_crop[0]["status"], "NEEDS_REVIEW")

        # Salt negative area must be NEEDS_REVIEW
        salt_crop = [e for e in entries if e.get("dataset_id") == "production-rt01-04" and e.get("schema") == "rt_salt"]
        self.assertEqual(len(salt_crop), 1)
        self.assertEqual(salt_crop[0]["status"], "NEEDS_REVIEW")

    def test_missing_manifest_raises_filenotfound(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaises(FileNotFoundError):
                compile_doae_coverage(Path(tmpdir))


if __name__ == "__main__":
    unittest.main()
