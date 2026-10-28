"""Unit tests for National Agricultural Data Sharing Interface and External Partner API Contracts."""

import json
from pathlib import Path
import tempfile
import unittest

from jsonschema import Draft202012Validator, FormatChecker

from tadih.data_sharing import (
    DATA_SHARING_CONTRACT_PATH,
    SharingQuery,
    DataSharingFeed,
    execute_data_sharing_query,
    export_partner_feed_bundle,
    audit_data_sharing_interface,
)
from tests.test_project_register import project_fixture


class DataSharingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        probes = self.root / "data/local/probes"
        probes.mkdir(parents=True)
        evidence = {
            "evidence_id": "EV-SYNTHETIC-81",
            "source_id": "doae",
            "resource_id": "fixture-resource",
            "problem_type": "FLOOD_DAMAGE",
            "metric_name": "damaged_area_flood_in_irrigation_area_rai",
            "metric_value": 12.0,
            "unit": "ไร่",
            "native_spatial_grain": "province",
            "native_area_code": "81",
            "observed_period": "2568",
            "license_status": "pending",
        }
        card = {
            "province_code": "81",
            "province_name_th": "กระบี่",
            "evidence_records": [evidence],
            "identified_problems": ["FLOOD_DAMAGE"],
            "matched_intervention_ids": [],
            "intervention_status": "UNVERIFIED",
            "diagnostic_notes": "ข้อมูลสังเคราะห์สำหรับทดสอบ",
            "last_audited_at": "2026-10-28T00:00:00Z",
        }
        projects = [
            project_fixture(project_id="TEST-RICE-2567", fiscal_year="2567", target_area_codes=["73"]),
            project_fixture(project_id="TEST-CORN-2567", fiscal_year="2567", target_commodity="ข้าวโพด",
                            target_area_codes=["31"]),
        ]
        (probes / "coverage-inventory.json").write_text(json.dumps({"entries": [{
            "source_id": "doae", "phase": "p0", "dataset_id": "synthetic", "resource_id": "fixture-coverage",
            "schema": "fixture", "data_grain": "subdistrict", "period": "2568", "metrics": ["planned_area_rai"],
            "units": ["ไร่"], "status": "UNVERIFIED", "missing_reason": "synthetic test fixture",
            "coverage_note": "synthetic test fixture", "license_status": "pending", "source_records": 2,
            "staged_records": 1, "quarantined_records": 1, "retrieved_at": "2026-10-28T00:00:00Z",
            "source_sha256": "synthetic-fixture",
        }]}), encoding="utf-8")
        (probes / "spatial-evidence-audit.json").write_text(json.dumps({"audit_version": 2, "province_cards": [card]}), encoding="utf-8")
        (probes / "project-register-audit.json").write_text(json.dumps({
            "audit_version": 2, "registered_projects_count": len(projects), "projects": projects,
        }), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

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
        feed_public = execute_data_sharing_query(q_public, self.root)
        self.assertGreater(feed_public.total_records, 0)
        # Any pending source must be masked
        for rec in feed_public.data_records:
            if rec["license_status"] == "pending":
                self.assertEqual(rec["access_status"], "LICENSE_PENDING_AGGREGATE_METADATA_ONLY")

        # Query with inter_agency_authorized scope
        q_auth = SharingQuery(partner_agency="OAE", endpoint="/v1/catalog", license_scope="inter_agency_authorized")
        feed_auth = execute_data_sharing_query(q_auth, self.root)
        for rec in feed_auth.data_records:
            self.assertEqual(rec["access_status"], "AUTHORIZED")

    def test_spatial_evidence_endpoint_filtering(self):
        q = SharingQuery(
            partner_agency="RID",
            endpoint="/v1/spatial-evidence",
            province_code="81",
            license_scope="inter_agency_authorized",
        )
        feed = execute_data_sharing_query(q, self.root)
        self.assertEqual(feed.total_records, 1)
        self.assertEqual(feed.data_records[0]["province_code"], "81")
        self.assertEqual(feed.data_records[0]["province_name_th"], "กระบี่")

    def test_projects_endpoint_filtering(self):
        # The synthetic rice project matches; the corn project does not.
        q_rice = SharingQuery(
            partner_agency="BAAC",
            endpoint="/v1/projects",
            commodity="ข้าว",
            license_scope="inter_agency_authorized",
        )
        feed_rice = execute_data_sharing_query(q_rice, self.root)
        self.assertEqual([p["project_id"] for p in feed_rice.data_records], ["TEST-RICE-2567"])
        self.assertTrue(all(p["target_commodity"] == "ข้าว" for p in feed_rice.data_records))

        # Filter by fiscal year 2567
        q_year = SharingQuery(
            partner_agency="DOAE",
            endpoint="/v1/projects",
            fiscal_year="2567",
            license_scope="inter_agency_authorized",
        )
        feed_year = execute_data_sharing_query(q_year, self.root)
        self.assertEqual({p["project_id"] for p in feed_year.data_records}, {"TEST-RICE-2567", "TEST-CORN-2567"})
        self.assertTrue(all(p["fiscal_year"] == "2567" for p in feed_year.data_records))

    def test_project_province_filter_keeps_only_explicit_native_province_targets(self):
        rows = [project_fixture(project_id="TEST-COUNTRY",target_area_grain="country",target_area_codes=["TH"]),
                project_fixture(project_id="TEST-DISTRICT",target_area_grain="district",target_area_codes=["7301"]),
                project_fixture(), project_fixture(project_id="TEST-UNKNOWN-CROP",target_commodity=None)]
        with tempfile.TemporaryDirectory() as temp:
            probes=Path(temp)/"data/local/probes";probes.mkdir(parents=True)
            (probes/"project-register-audit.json").write_text(json.dumps({"audit_version":2,"projects":rows}),encoding="utf-8")
            def query(**filters):
                return execute_data_sharing_query(SharingQuery(partner_agency="DOAE",endpoint="/v1/projects",license_scope="inter_agency_authorized",**filters),Path(temp))
            self.assertEqual(query().total_records,4)
            self.assertEqual({p["project_id"] for p in query(province_code="73").data_records},{"TEST-PROVINCE","TEST-UNKNOWN-CROP"})
            self.assertEqual([p["project_id"] for p in query(province_code="73",commodity="ข้าว").data_records],["TEST-PROVINCE"])
            self.assertEqual(query(province_code="74").total_records,0)

    def test_invalid_project_target_proof_is_rejected_even_without_province_query(self):
        with tempfile.TemporaryDirectory() as temp:
            probes=Path(temp)/"data/local/probes";probes.mkdir(parents=True)
            (probes/"project-register-audit.json").write_text(json.dumps({"audit_version":2,"projects":[project_fixture(target_area_codes=["00"])]}),encoding="utf-8")
            with self.assertRaises(ValueError):
                execute_data_sharing_query(SharingQuery(partner_agency="DOAE",endpoint="/v1/projects",license_scope="inter_agency_authorized"),Path(temp))

    def test_payload_sha256_cryptographic_integrity(self):
        q = SharingQuery(partner_agency="LDD", endpoint="/v1/projects", license_scope="inter_agency_authorized")
        feed = execute_data_sharing_query(q, self.root)
        self.assertEqual(len(feed.payload_sha256), 64)

        # Recompute and compare
        import hashlib
        payload_str = json.dumps(feed.data_records, sort_keys=True, ensure_ascii=False)
        expected_sha = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
        self.assertEqual(feed.payload_sha256, expected_sha)

    def test_pending_spatial_evidence_not_in_public_feed(self):
        feed = execute_data_sharing_query(
            SharingQuery(partner_agency="PUBLIC", endpoint="/v1/spatial-evidence", license_scope="public_only"), self.root
        )
        self.assertEqual(feed.total_records, 0)

    def test_feed_bundle_export_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_dir = Path(tmpdir) / "test_bundle"
            manifest = export_partner_feed_bundle("BAAC", bundle_dir, "inter_agency_authorized", self.root)

            self.assertEqual(manifest["partner_agency"], "BAAC")
            self.assertEqual(manifest["total_bundle_records"] > 0, True)
            self.assertEqual(len(manifest["feeds"]), 4)

            # Check that all 4 files and manifest exist
            self.assertTrue((bundle_dir / "manifest.json").exists())
            self.assertTrue((bundle_dir / "catalog_feed.json").exists())
            self.assertTrue((bundle_dir / "coverage_feed.json").exists())
            self.assertTrue((bundle_dir / "spatial_evidence_feed.json").exists())
            self.assertTrue((bundle_dir / "projects_feed.json").exists())

    def test_audit_data_sharing_interface_with_synthetic_proofs(self):
        audit_result = audit_data_sharing_interface(self.root)
        self.assertEqual(audit_result["status"], "success")
        self.assertEqual(len(audit_result["sample_query_audits"]), 6)
        self.assertTrue((self.root / "data/local/probes/data-sharing-audit.json").is_file())


if __name__ == "__main__":
    unittest.main()
