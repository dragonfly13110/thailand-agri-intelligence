"""Offline checks for a secret-free, honest metadata survey."""
import csv
import gzip
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.request import Request

from scripts import map_accessible_sources as survey


class AccessMapTests(unittest.TestCase):
    def test_redaction_redirects_and_untrusted_urls(self):
        self.assertEqual(survey.clean_url("https://user:pass@example.org/x?api_key=SECRET&limit=0#token"), "https://example.org/x?limit=0")
        self.assertEqual(survey.clean_url("https://example.org:bad/x"), "")
        self.assertEqual(survey.clean_url("file:///private"), "")
        self.assertEqual(survey.clean_url("https://[::1]:443/x"), "https://[::1]:443/x")
        with patch.dict(os.environ, {"TEST_API_KEY": 'a"b\\c-secret'}):
            self.assertEqual(survey.redact({"nested": ['a"b\\c-secret']}), {"nested": ["[REDACTED]"]})
        req = Request("https://one.example/api", headers={"api-key": "SECRET"})
        with self.assertRaises(ValueError):
            survey.SafeRedirect().redirect_request(req, None, 301, "", {}, "https://two.example/api")
        req = Request("https://one.example/api", headers={"User-Agent": "test"})
        redirected = survey.SafeRedirect().redirect_request(req, None, 301, "", {}, "https://two.example/api")
        self.assertEqual(redirected.header_items(), [("User-agent", "test")])
        with patch.object(survey, "build_opener") as opener, patch.object(survey, "trusted_ssl_context", return_value=None):
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b"123456789"
            self.assertEqual(survey.request("https://example.org", cap=8)["status"], "response_cap_exceeded")

    def test_projection_has_no_contacts_or_fake_resource_pairing(self):
        package = survey.project_package({"id": "a", "title": "ข้อมูลจังหวัด", "maintainer_email": "private@example.org",
            "tags": ["ฝน", {"name": "น้ำ"}], "res_url": ["https://example.org/data?token=secret"],
            "res_format": ["CSV", "PDF"], "resources": [{"id": "r", "url": "https://example.org/x?api_key=secret"}]}, "opend")
        self.assertNotIn("maintainer_email", package)
        self.assertEqual(package["indexed_resource_urls"], ["https://example.org/data"])
        self.assertEqual(package["resources"][0]["data_access_status"], "not_probed")
        self.assertEqual(package["license_status"], "pending")
        self.assertEqual(survey.schema_summary({"success": False, "error": {"secret": "value"}}), {"application_status": "error"})
        shape = survey.schema_summary({"success": True, "result": {"total": 9, "fields": [{"id": "year", "type": "int"}], "records": [{"year": 2026}]}})
        self.assertNotIn("2026", json.dumps(shape))

    def test_capped_pagination_and_incomplete_snapshots(self):
        from urllib.parse import parse_qs, urlsplit
        def fake(url, *args, **kwargs):
            params = parse_qs(urlsplit(url).query)
            start = int(params.get("start", [0])[0])
            rows = int(params["rows"][0])
            values = [{"id": str(i), "title": "dataset"} for i in range(start, min(start + 2, 5))] if rows else []
            return {"status": "ok", "data": {"success": True, "result": {"count": 5, "results": values}}}
        with tempfile.TemporaryDirectory() as folder, patch.object(survey, "OUT", Path(folder)), patch.object(survey, "request", fake):
            result = survey.census("test", "https://example.org/api", page_size=100)
            self.assertTrue(result["complete"])
            self.assertEqual(result["unique_ids"], 5)
            self.assertEqual(result["pages"], 3)
            page_path = Path(folder) / "test/page-000002.json.gz"
            with gzip.open(page_path, "rt", encoding="utf-8") as f:
                page = json.load(f)
            page["packages"][0]["id"] = "0"
            with gzip.open(page_path, "wt", encoding="utf-8") as f:
                json.dump(page, f)
            self.assertFalse(survey.census("test", "https://example.org/api", page_size=100)["complete"])

    def test_csv_formula_and_field_hints_are_not_approved_joins(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.csv.gz"
            survey.write_csv_gz(path, ["title"], [{"title": "=1+1"}])
            with gzip.open(path, "rt", encoding="utf-8-sig") as f:
                self.assertEqual(list(csv.DictReader(f))[0]["title"], "'=1+1")
        self.assertIn("area_code", survey.field_candidates("PROV_CODE"))
        self.assertIn("personal_data_review", survey.field_candidates("citizen_id"))
        self.assertEqual(survey.schema_kind([{"id": "ชื่อฟิลด์"}, {"id": "คำอธิบายฟิลด์"}]), "data_dictionary")
        self.assertEqual(survey.schema_kind([{"id": "ชื่อเรื่อง"}, {"id": "URL เล่มรายงาน"}]), "document_index")
        self.assertEqual(survey.schema_kind([{"id": "PROV_CODE"}, {"id": "value"}]), "tabular_schema_unreviewed")

    def test_mapping_uses_latest_schema_attempt_without_counting_retries_twice(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(survey, "OUT", Path(folder)):
            path = Path(folder)
            (path / "doae").mkdir()
            package = survey.project_package({"id": "dataset", "name": "name", "title": "ข้อมูลเกษตรกร",
                "resources": [{"id": "resource", "url": "https://example.org/data", "datastore_active": True}]}, "doae")
            with gzip.open(path / "doae/page-000000.json.gz", "wt", encoding="utf-8") as f:
                json.dump({"packages": [package]}, f)
            base = {"catalog": "doae", "dataset_id": "dataset", "dataset_title": "title", "resource_id": "resource"}
            attempts = [{**base, "access": {"status": "failed", "http": 429}},
                {**base, "access": {"status": "ok", "application_status": "json_received", "fields": [{"id": "PROV_CODE", "type": "text"}]}}]
            (path / "datastore-schemas.jsonl").write_text("\n".join(json.dumps(r) for r in attempts), encoding="utf-8")
            survey.build_mapping()
            result = json.loads((path / "mapping-summary.json").read_text(encoding="utf-8"))
            self.assertEqual(result["schemas_probed"], 1)
            self.assertEqual(result["schema_probe_attempts"], 2)
            self.assertEqual(result["schema_fields"], 1)
            self.assertGreater(result["join_candidate_edges"], 0)


if __name__ == "__main__":
    unittest.main()
