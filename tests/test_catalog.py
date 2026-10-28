import csv
import json
import tempfile
import unittest
from pathlib import Path

from tadih.catalog import ROOT, load_provinces, load_sources, load_resource_licenses


class CatalogTests(unittest.TestCase):
    def test_77_province_codes_include_bangkok_and_bueng_kan(self):
        rows = load_provinces()
        names = {row["area_code"]: row["name_th"] for row in rows}
        self.assertEqual(77, len(rows))
        self.assertEqual("กรุงเทพมหานคร", names["10"])
        self.assertEqual("บึงกาฬ", names["38"])
        self.assertEqual("นราธิวาส", names["96"])
        self.assertTrue(all(not row["geom_version"] for row in rows))
        self.assertTrue(all(row["source_url"].startswith("https://") for row in rows))

    def test_duplicate_or_missing_province_rejected(self):
        rows = load_provinces()
        rows[-1] = rows[0]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "provinces.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            with self.assertRaisesRegex(ValueError, "77 DOPA"):
                load_provinces(path)

    def test_source_registry_does_not_claim_runtime_or_licence_approval(self):
        rows = load_sources()
        self.assertEqual(len(rows), len({r["source_id"] for r in rows}))
        self.assertGreaterEqual(len(rows), 16)
        self.assertTrue(all(r["geographic_scope"] == "Thailand" for r in rows))
        self.assertTrue(all(not r["runtime_verified"] for r in rows))
        self.assertTrue(all(r["license_status"] == "pending" for r in rows))
        self.assertTrue(all(r["domains"] for r in rows))

        cpd = [r for r in rows if r["source_id"] == "cpd"]
        self.assertEqual(len(cpd), 1)
        self.assertEqual(cpd[0]["owner"], "ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ")
        self.assertEqual(cpd[0]["url"], "https://catalog-cpd.data.go.th")
        self.assertEqual(cpd[0]["status"], "documented_not_runtime_verified")
        self.assertEqual(cpd[0]["license_status"], "pending")
        self.assertFalse(cpd[0]["runtime_verified"])
        self.assertIn("province labels do not assert coverage", cpd[0]["source_definition"])

    def test_invalid_catalogs_rejected(self):
        source = load_sources()[0]
        cases = [
            {"sources": []},
            {"sources": [source, source]},
            {"sources": [dict(source, geographic_scope="global", deferred=False)]},
            {"sources": [dict(source, runtime_verified="false")]},
            {"sources": [dict(source, domains=["AG99"])]},
            {"sources": [dict(source, url="https://secret@example.com/data")]},
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sources.json"
            for payload in cases:
                with self.subTest(payload=payload):
                    path.write_text(json.dumps(payload), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        load_sources(path)

    def test_contracts_require_provenance_and_reject_unknown_fields(self):
        for path in (ROOT / "data_contracts").glob("*.schema.json"):
            if path.name == "hub-api.schema.json":
                continue
            with self.subTest(contract=path.name):
                contract = json.loads(path.read_text(encoding="utf-8"))
                self.assertFalse(contract["additionalProperties"])
                self.assertTrue(set(contract["required"]).issubset(contract["properties"]))
        observation = json.loads((ROOT / "data_contracts/observation.schema.json").read_text(encoding="utf-8"))
        self.assertNotIn("forecast", observation["properties"]["data_kind"]["enum"])
        self.assertIn("null", observation["properties"]["value"]["type"])
        self.assertIn("release_at", observation["required"])

    def test_resource_licenses_keep_approved_entries_explicit_and_pending_constrained(self):
        resources = load_resource_licenses()
        self.assertGreaterEqual(len(resources), 13)
        self.assertEqual(len(resources), len({r["resource_key"] for r in resources}))
        for catalog in ('doae_p0_resources.json', 'doae_p1_resources.json', 'doae_p2_resources.json',
                        'doae_archive_resources.json', 'doae_reference_resources.json'):
            config = json.loads((ROOT / 'config' / catalog).read_text(encoding='utf-8'))
            self.assertTrue({r['resource_id'] for r in config['resources']}.issubset(
                {r.get('resource_id') for r in resources}))
        approved = [r for r in resources if r["license_status"] == "approved_public"]
        self.assertTrue(approved, "registry must keep at least one reviewed approved resource")
        pending = [r for r in resources if r["license_status"] != "approved_public"]
        self.assertTrue(pending, "registry must keep un-reviewed resources pending")
        self.assertTrue(all(r["license_status"] == "pending" for r in pending))
        self.assertTrue(all(r["project_publication_approved"] is False for r in pending))
        self.assertTrue(all(r["commercial_use_confirmed"] is False for r in pending))
        self.assertTrue(all(len(r["unresolved"]) >= 1 for r in pending))
        # Governance invariant: approved rows either have a complete resource
        # license review or an explicit project-owner numeric publication
        # grant that remains distinct from source-license verification.
        for row in approved:
            self.assertTrue(row["project_publication_approved"] is True, row["resource_key"])
            if row["unresolved"]:
                authorization = row.get("publication_authorization") or {}
                self.assertEqual(authorization.get("basis"), "project_owner_instruction", row["resource_key"])
                self.assertEqual(authorization.get("document"), "AGENTS.md", row["resource_key"])
                self.assertEqual(authorization.get("section"), 3, row["resource_key"])
                self.assertIs(authorization.get("source_license_verified"), False, row["resource_key"])
                self.assertFalse(row["commercial_use_confirmed"], row["resource_key"])
                self.assertTrue(row.get("next_action"), row["resource_key"])
            else:
                self.assertIsNone(row.get("publication_authorization"), row["resource_key"])
            self.assertTrue(row["attribution_text"].strip(), row["resource_key"])
            self.assertTrue(len(row["evidence"]) >= 1, row["resource_key"])
            self.assertTrue(row["resource_id"].strip() and row["source_id"].strip(), row["resource_key"])
        chirps = [r for r in approved if r["resource_key"] == "chirps_v3_daily_rnl_2026_09_30"]
        self.assertEqual(len(chirps), 1)
        self.assertTrue(chirps[0]["commercial_use_confirmed"] is True)
        self.assertTrue(all(len(r["evidence"]) >= 1 for r in resources))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "licenses.json"
            path.write_text(json.dumps({"automatic_approval": True, "resources": resources}), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_resource_licenses(path)
            path.write_text(json.dumps({"automatic_approval": False, "resources": [resources[0], resources[0]]}), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_resource_licenses(path)

    def test_cpd_cooperative_counts_have_exact_resource_owner_authorization_and_unverified_terms(self):
        resources = load_resource_licenses()
        matches = [r for r in resources if r["resource_key"] == "cpd_agricultural_coop_counts"]
        self.assertEqual(len(matches), 1)
        resource = matches[0]

        self.assertEqual(resource["source_id"], "cpd")
        self.assertEqual(resource["resource_id"], "44463650-5d2e-482b-9919-b1c5b8bc5c6b")
        self.assertEqual(resource["dataset_id"], "7e7e236d-790d-489d-a723-e0b1359530a4")
        self.assertEqual(
            resource["resource_url"],
            "https://catalog-cpd.data.go.th/dataset/7e7e236d-790d-489d-a723-e0b1359530a4/"
            "resource/44463650-5d2e-482b-9919-b1c5b8bc5c6b/download/st_001_01.csv",
        )
        self.assertEqual(resource["license_status"], "approved_public")
        self.assertTrue(resource["project_publication_approved"])
        self.assertFalse(resource["commercial_use_confirmed"])
        self.assertEqual(resource["declared_license"]["license_id"], "Creative Commons Attributions")
        self.assertEqual(resource["declared_license"]["license_title"], "Creative Commons Attributions")
        self.assertIsNone(resource["declared_license"]["license_url"])
        self.assertIsNone(resource["declared_license"]["version"])
        self.assertFalse(resource["publication_authorization"]["source_license_verified"])
        self.assertEqual(resource["publication_authorization"]["document"], "AGENTS.md")
        self.assertEqual(resource["publication_authorization"]["section"], 3)
        self.assertEqual(
            resource["attribution_text"],
            "ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ",
        )
        self.assertEqual(
            resource["attribution_url"],
            "https://catalog-cpd.data.go.th/api/3/action/package_show?id=7e7e236d-790d-489d-a723-e0b1359530a4",
        )
        self.assertTrue(resource["unresolved"])
        self.assertTrue(any("commercial-use" in item for item in resource["unresolved"]))
        register = json.loads((ROOT / "config/resource_licenses.json").read_text(encoding="utf-8"))
        self.assertIn("cpd_agricultural_coop_counts", register["owner_authorisation"]["approved_resource_keys"])


if __name__ == "__main__":
    unittest.main()

