import csv
import json
import tempfile
import unittest
from pathlib import Path

from tadih.catalog import ROOT, load_provinces, load_sources


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
        self.assertEqual(16, len(rows))
        self.assertEqual(16, len({r["source_id"] for r in rows}))
        self.assertTrue(all(r["geographic_scope"] == "Thailand" for r in rows))
        self.assertTrue(all(not r["runtime_verified"] for r in rows))
        self.assertTrue(all(r["license_status"] == "pending" for r in rows))
        self.assertTrue(all(r["domains"] for r in rows))

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
            with self.subTest(contract=path.name):
                contract = json.loads(path.read_text(encoding="utf-8"))
                self.assertFalse(contract["additionalProperties"])
                self.assertTrue(set(contract["required"]).issubset(contract["properties"]))
        observation = json.loads((ROOT / "data_contracts/observation.schema.json").read_text(encoding="utf-8"))
        self.assertNotIn("forecast", observation["properties"]["data_kind"]["enum"])
        self.assertIn("null", observation["properties"]["value"]["type"])
        self.assertIn("release_at", observation["required"])


if __name__ == "__main__":
    unittest.main()
