"""Coverage inventory unit tests use small synthetic manifests."""

import json
from pathlib import Path
import tempfile
import unittest

from tadih.coverage_inventory import compile_doae_coverage, compile_warehouse_and_staging_coverage


def write_manifest_fixture(local_dir):
    def result(resource_id, dataset, schema, source, staged, quarantined=0):
        return {
            "resource_id": resource_id,
            "raw": {"retrieved_at": "2026-10-28T00:00:00Z", "sha256": f"sha256-{resource_id}"},
            "staging": {
                "dataset": dataset,
                "schema": schema,
                "source_records": source,
                "records": staged,
                "quarantined_records": quarantined,
            },
        }

    manifests = {
        "doae-p0/p0-run.json": {
            "results": [
                result("p0-plan", "plan_dryplant", "dryplant_subdistrict", 2, 1, 1),
                result("p0-crops", "production-rt01-04", "rt_crops", 1, 1),
                result("p0-salt", "production-rt01-04", "rt_salt", 2, 1, 1),
            ],
        },
        "doae-p1/p1-run.json": {
            "results": [
                result("p1-country", "herbs-spices", "national", 3, 2),
                result("p1-online", "online-product", "province", 2, 1, 1),
                result("p1-mixed", "province-unified-data", "mixed", 4, 4),
            ],
        },
        "doae-p2/p2-run.json": {
            "results": [result("p2-items", "crop-item-requests", "request", 2, 1, 1)],
        },
        "doae-archives/archive-run.json": {
            "captures": [
                {
                    "resource_id": "archive-production",
                    "dataset": "production_doae",
                    "raw": {"retrieved_at": "2026-10-28T00:00:00Z", "sha256": "sha256-archive"},
                    "staging": {"source_records": 3, "records": 2, "quarantined_records": 1},
                    "extracted": {"member": "fixture.csv"},
                },
            ],
        },
    }
    for relative_path, data in manifests.items():
        path = local_dir / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")


class CoverageInventoryTests(unittest.TestCase):
    def test_synthetic_manifests_reconcile_counts_and_keep_native_grain(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            local = Path(tmpdir) / "data/local"
            write_manifest_fixture(local)
            result = compile_doae_coverage(local)

        self.assertEqual(result["manifest_totals"], {
            "p0": {"resources": 3, "source_records": 5, "staged_records": 3, "quarantined_records": 2},
            "p1": {"resources": 3, "source_records": 9, "staged_records": 7, "quarantined_records": 1},
            "p2": {"resources": 1, "source_records": 2, "staged_records": 1, "quarantined_records": 1},
            "archives": {"resources": 1, "source_records": 3, "staged_records": 2, "quarantined_records": 1},
        })
        entries = {row["resource_id"]: row for row in result["resource_entries"]}
        self.assertEqual(entries["p0-plan"]["data_grain"], "subdistrict")
        self.assertEqual(entries["p1-country"]["data_grain"], "country")
        self.assertEqual(entries["p1-mixed"]["data_grain"], "province+district_mixed")
        self.assertEqual(entries["p1-online"]["status"], "NEEDS_REVIEW")
        self.assertEqual(entries["p0-crops"]["status"], "NEEDS_REVIEW")
        self.assertEqual(entries["p0-salt"]["quarantined_records"], 1)
        self.assertEqual(entries["archive-production"]["status"], "NEEDS_REVIEW")
        self.assertTrue(all(row["license_status"] == "pending" for row in entries.values()))

    def test_warehouse_profiles_keep_country_reservoir_and_grid_grain(self):
        entries = compile_warehouse_and_staging_coverage(Path("unused"))
        by_source = {row["source_id"]: row for row in entries}
        self.assertEqual(by_source["oae"]["data_grain"], "country")
        self.assertEqual(by_source["rid"]["data_grain"], "reservoir")
        self.assertEqual(by_source["open_meteo"]["data_grain"], "grid_point")
        self.assertEqual(by_source["planetary_computer"]["data_grain"], "grid_point")
        self.assertTrue(all(row["license_status"] == "pending" for row in entries))

    def test_missing_manifest_raises_filenotfound(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaisesRegex(FileNotFoundError, "required DOAE manifests"):
                compile_doae_coverage(Path(tmpdir))


if __name__ == "__main__":
    unittest.main()
