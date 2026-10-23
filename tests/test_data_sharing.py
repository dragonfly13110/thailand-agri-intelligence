"""Unit tests for National Agricultural Data Sharing Interface and External Partner API Contracts."""

import json
from pathlib import Path
import tempfile
import unittest

from jsonschema import Draft202012Validator, FormatChecker

from tadih.catalog import ROOT
from tadih.data_sharing import (
    DATA_SHARING_CONTRACT_PATH,
    SharingQuery,
    DataSharingFeed,
    execute_data_sharing_query,
    export_partner_feed_bundle,
    audit_data_sharing_interface,
)


class DataSharingTests(unittest.TestCase):
    def test_data_sharing_schema_is_valid_json_schema(self):
        schema = json.loads(DATA_SHARING_CONTRACT_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)

    def test_query_validation(self):
        # Invalid agency
        q_bad_agency = SharingQuery(partner_agency="UNKNOWN_AGENCY", endpoint="/v1/catalog")
        with self.assertRaises(ValueError):
            q_bad_agency.validate()

        # Invalid endpoint
        q_bad_endpoint = SharingQuery(partner_agency="OAE", endpoint="/v1/nonexistent")
        with self.assertRaises(ValueError):
            q_bad_endpoint.validate()

        # Invalid scope
        q_bad_scope = SharingQuery(partner_agency="OAE", endpoint="/v1/catalog", license_scope="invalid_scope")
        with self.assertRaises(ValueError):
            q_bad_scope.validate()

    def test_catalog_endpoint_and_license_gating(self):
        # Query with public_only scope
        q_public = SharingQuery(partner_agency="PUBLIC", endpoint="/v1/catalog", license_scope="public_only")
        feed_public = execute_data_sharing_query(q_public, ROOT)
        self.assertGreater(feed_public.total_records, 0)
        # Any pending source must be masked
        for rec in feed_public.data_records:
            if rec["license_status"] == "pending":
                self.assertEqual(rec["access_status"], "LICENSE_PENDING_AGGREGATE_METADATA_ONLY")

        # Query with inter_agency_authorized scope
        q_auth = SharingQuery(partner_agency="OAE", endpoint="/v1/catalog", license_scope="inter_agency_authorized")
        feed_auth = execute_data_sharing_query(q_auth, ROOT)
        for rec in feed_auth.data_records:
            self.assertEqual(rec["access_status"], "AUTHORIZED")

    def test_spatial_evidence_endpoint_filtering(self):
        q = SharingQuery(
            partner_agency="RID",
            endpoint="/v1/spatial-evidence",
            province_code="81",
            license_scope="inter_agency_authorized",
        )
        feed = execute_data_sharing_query(q, ROOT)
        self.assertEqual(feed.total_records, 1)
        self.assertEqual(feed.data_records[0]["province_code"], "81")
        self.assertEqual(feed.data_records[0]["province_name_th"], "กระบี่")

    def test_projects_endpoint_filtering(self):
        # Filter by commodity ข้าว
        q_rice = SharingQuery(
            partner_agency="BAAC",
            endpoint="/v1/projects",
            commodity="ข้าว",
            license_scope="inter_agency_authorized",
        )
        feed_rice = execute_data_sharing_query(q_rice, ROOT)
        self.assertEqual(feed_rice.total_records, 0)
        for p in feed_rice.data_records:
            self.assertEqual(p["target_commodity"], "ข้าว")

        # Filter by fiscal year 2567
        q_year = SharingQuery(
            partner_agency="DOAE",
            endpoint="/v1/projects",
            fiscal_year="2567",
            license_scope="inter_agency_authorized",
        )
        feed_year = execute_data_sharing_query(q_year, ROOT)
        for p in feed_year.data_records:
            self.assertEqual(p["fiscal_year"], "2567")

    def test_payload_sha256_cryptographic_integrity(self):
        q = SharingQuery(partner_agency="LDD", endpoint="/v1/projects", license_scope="inter_agency_authorized")
        feed = execute_data_sharing_query(q, ROOT)
        self.assertEqual(len(feed.payload_sha256), 64)

        # Recompute and compare
        import hashlib
        payload_str = json.dumps(feed.data_records, sort_keys=True, ensure_ascii=False)
        expected_sha = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
        self.assertEqual(feed.payload_sha256, expected_sha)

    def test_pending_spatial_evidence_not_in_public_feed(self):
        feed = execute_data_sharing_query(
            SharingQuery(partner_agency="PUBLIC", endpoint="/v1/spatial-evidence", license_scope="public_only"), ROOT
        )
        self.assertEqual(feed.total_records, 0)

    def test_feed_bundle_export_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "test_bundle"
            manifest = export_partner_feed_bundle("BAAC", bundle_dir, "inter_agency_authorized", ROOT)

            self.assertEqual(manifest["partner_agency"], "BAAC")
            self.assertEqual(manifest["total_bundle_records"] > 0, True)
            self.assertEqual(len(manifest["feeds"]), 4)

            # Check that all 4 files and manifest exist
            self.assertTrue((bundle_dir / "manifest.json").exists())
            self.assertTrue((bundle_dir / "catalog_feed.json").exists())
            self.assertTrue((bundle_dir / "coverage_feed.json").exists())
            self.assertTrue((bundle_dir / "spatial_evidence_feed.json").exists())
            self.assertTrue((bundle_dir / "projects_feed.json").exists())

    def test_live_audit_data_sharing_interface(self):
        audit_result = audit_data_sharing_interface(ROOT)
        self.assertEqual(audit_result["status"], "success")
        self.assertGreaterEqual(len(audit_result["sample_query_audits"]), 5)
        self.assertTrue((ROOT / "data/local/probes/data-sharing-audit.json").exists())


if __name__ == "__main__":
    unittest.main()
