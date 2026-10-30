"""Lane L3 tests: DOAE subdistrict staging -> canonical observation bridge."""

import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tadih.doae_production_bridge import (
    DoaeBridgeError,
    RESOURCES,
    WRITER_BATCH_ROW_CAP,
    build_rows,
    load_staged_batch,
    main,
    run,
)
from tadih.observations import ObservationWriteError
from tadih.quality import validate_observation
from tests.test_observations import SqliteD1Mock


RETRIEVED_AT = "2026-10-29T00:00:00+00:00"
SHORT_LIVED_KEY = "doae_production_subdistrict_2023"
PERENNIAL_KEY = "doae_perennial_subdistrict_2023"
REAL_STAGED_SHORT_LIVED = Path("data/local/production/staged/a505aa24d0706a162a1d56265cc61fb6ce33df8c9760dab414bf0ad01762e445/records.jsonl")
REAL_STAGED_PERENNIAL = Path("data/local/production/perennial-staged/996e6e16e866d7720fedf860afafd77cec62f8bf3dd19ede426efe3c1ed33f9d/records.jsonl")


def short_lived_record(number, **change):
    record = {
        "source_year_be": 2566, "year_ad": 2023, "month": 5,
        "province_name": "กรุงเทพมหานคร", "district_name": "บางคอแหลม", "subdistrict_name": "บางคอแหลม",
        "crop_group": "ข้าว", "crop_type": "ข้าวนาปี", "variety_name": "ข้าวเหนียว", "planting_round": "0",
        "planted_area_rai": 10.0, "damaged_area_rai": None, "harvested_area_rai": 8.0,
        "production_kg": 400.0, "yield_kg_per_rai": 50.0, "farm_gate_thb_per_kg": None,
        "source_record_number": number,
        "source_row_hash": hashlib.sha256(f"synthetic-{number}".encode()).hexdigest(),
        "commodity_id": f"doae:synthetic{number:024d}",
        "duplicate_of": None, "rollup_eligible": False,
        "source_id": "doae", "resource_id": RESOURCES[SHORT_LIVED_KEY]["ckan_resource_id"],
        "license_status": "pending",
    }
    record.update(change)
    return record


def perennial_record(number, **change):
    record = {
        "source_year_be": 2566, "year_ad": 2023,
        "province_name": "จันทบุรี", "district_name": "เมืองจันทบุรี", "subdistrict_name": "ทุ่งเบญจา",
        "crop_group": "ไม้ผล", "crop_type": "มังคุด", "variety_name": "",
        "bearing_area_rai": 20.0, "standing_area_rai": 25.0, "damaged_area_rai": None,
        "production_kg": 300.0, "farm_gate_thb_per_kg": None,
        "source_record_number": number,
        "source_row_hash": hashlib.sha256(f"synthetic-perennial-{number}".encode()).hexdigest(),
        "commodity_id": f"doae:synthetic-perennial-{number}",
        "duplicate_identity": False, "rollup_eligible": False, "release_at": None,
        "source_id": "doae", "resource_id": RESOURCES[PERENNIAL_KEY]["ckan_resource_id"],
        "license_status": "pending",
    }
    record.update(change)
    return record


def registry_row(resource_key, **change):
    config = RESOURCES[resource_key]
    row = {
        "resource_key": resource_key,
        "source_id": "doae",
        "resource_id": config["ckan_resource_id"],
        "dataset_id": "6cc09797-a60e-43ce-a646-65364a1333c3",
        "name": "DOAE subdistrict crop production (synthetic registry row)",
        "resource_url": config["source_url"],
        "reviewed_at": "2026-10-22",
        "license_status": "approved_public",
        "declared_license": {"license_id": "Open Data Common", "license_url": None},
        "project_publication_approved": True,
        "commercial_use_confirmed": True,
        "attribution_text": "กรมส่งเสริมการเกษตร",
        "unresolved": [],
        "evidence": [{"url": config["source_url"], "kind": "synthetic", "reviewed_at": "2026-10-22"}],
        "publication_authorization": {
            "basis": "open_license_policy",
            "document": "config/publication_policy.json",
            "policy_id": "publication-policy-2026-10-29",
            "license_class": "open",
            "section": 3,
            "scope": ["fetch", "process", "store_in_D1", "public_numeric_display"],
            "source_license_verified": False,
        },
    }
    row.update(change)
    return row


def write_staging(directory: Path, records, *, style: str) -> Path:
    records_lines = "".join(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n" for row in records)
    records_file = directory / "records.jsonl"
    records_file.write_bytes(records_lines.encode("utf-8"))  # avoid Windows newline translation changing the digest
    sha = hashlib.sha256(records_file.read_bytes()).hexdigest()
    inventory = {
        "source_sha256": hashlib.sha256(b"synthetic-source-csv").hexdigest(),
        "resource_id": RESOURCES[SHORT_LIVED_KEY if style == "short" else PERENNIAL_KEY]["ckan_resource_id"],
        "missing_measure_count": {},
    }
    if style == "short":
        inventory["source_rows"] = len(records)
        inventory["output_sha256"] = {"records.jsonl": sha}
    else:
        inventory["source_records"] = len(records)
        inventory["records_sha256"] = sha
    (directory / "inventory.json").write_text(json.dumps(inventory, ensure_ascii=False), encoding="utf-8")
    return records_file


class DoaeProductionBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.short_dir = self.root / "staged" / ("a" * 64)
        self.short_dir.mkdir(parents=True)
        self.perennial_dir = self.root / "perennial-staged" / ("b" * 64)
        self.perennial_dir.mkdir(parents=True)
        self.short_records = [
            short_lived_record(1),
            short_lived_record(2, province_name="เชียงใหม่", district_name="เมืองเชียงใหม่",
                             subdistrict_name=" ช้างคลาน ".strip(), month=8,
                             planted_area_rai=None, harvested_area_rai=None,
                             production_kg=None, yield_kg_per_rai=None),
            short_lived_record(3, source_year_be=2567, year_ad=2024,
                               subdistrict_name="บางโรง", duplicate_of=1),
            short_lived_record(4, source_year_be=2567, year_ad=2024, subdistrict_name="บางโพงพาง",
                               damaged_area_rai=1.5, farm_gate_thb_per_kg=9.0),
        ]
        self.perennial_records = [
            perennial_record(1),
            perennial_record(2, subdistrict_name="ทับไทร", duplicate_identity=True),
            perennial_record(3, province_name="ตราด", district_name="เขาสมิง", subdistrict_name="วังกระแจะ",
                             bearing_area_rai=None, production_kg=None, farm_gate_thb_per_kg=40.0),
        ]
        self.short_records_path = write_staging(self.short_dir, self.short_records, style="short")
        self.perennial_records_path = write_staging(self.perennial_dir, self.perennial_records, style="perennial")
        self.registry_path = self.root / "registry.json"
        self.registry_path.write_text(json.dumps({
            "automatic_approval": False,
            "resources": [registry_row(SHORT_LIVED_KEY), registry_row(PERENNIAL_KEY, unresolved=["pending review"])],
        }, ensure_ascii=False), encoding="utf-8")

    def tearDown(self):
        SqliteD1Mock.close_all()
        self.temp.cleanup()

    # ---- staging loading ---------------------------------------------------
    def test_staged_batch_verifies_checksum_and_refuses_changed_bytes(self):
        batch = load_staged_batch(SHORT_LIVED_KEY, records_path=self.short_records_path)
        self.assertEqual(len(batch["records"]), 4)
        self.assertEqual(batch["inventory"]["source_rows"], 4)
        tampered = self.root / "tampered"
        tampered.mkdir()
        records = write_staging(tampered, self.short_records, style="short")
        records.write_bytes(records.read_bytes() + b"\n")
        with self.assertRaises(DoaeBridgeError) as caught:
            load_staged_batch(SHORT_LIVED_KEY, records_path=records)
        self.assertIn("CHECKSUM_MISMATCH", str(caught.exception))

    # ---- pure mapping ------------------------------------------------------
    def test_build_rows_keeps_subdistrict_grain_units_and_skips(self):
        batch = load_staged_batch(SHORT_LIVED_KEY, records_path=self.short_records_path)
        built = build_rows(batch, license_status="approved_public", retrieved_at=RETRIEVED_AT)
        rows = built["rows"]
        # record 1: 4 non-null measures; record 2: 0 (only identity, all measures null after change);
        # record 3: duplicate -> skipped entirely; record 4: 6 non-null measures.
        self.assertEqual(len(rows), 10)
        self.assertEqual(built["skipped"]["duplicateRecords"], 1)
        self.assertEqual(built["skipped"]["nullMeasures"], 8)
        self.assertEqual(len({r["observation_id"] for r in rows}), len(rows))
        for row in rows:
            validate_observation(row)
            self.assertIsNone(row["observed_at"])
            self.assertEqual(row["source_id"], "doae")
            self.assertEqual(row["license_status"], "approved_public")
            self.assertEqual(row["data_kind"], "official")
            self.assertIn(row["quality_flag"], {"good", "missing"})
        units = {row["measure"]: row["unit"] for row in rows}
        self.assertEqual(units["planted_area_rai"], "ไร่")
        self.assertEqual(units["production_kg"], "กิโลกรัม")
        self.assertEqual(units["yield_kg_per_rai"], "กิโลกรัม/ไร่")
        self.assertEqual(units["farm_gate_thb_per_kg"], "บาท/กิโลกรัม")
        by_year = {row["source_year_be"] for row in rows}
        self.assertEqual(by_year, {2566, 2567})  # record 4 keeps the source's 2567 label; no year inference
        area = {row["area_code"] for row in rows}
        self.assertEqual(area, {"10"})  # Bangkok DOPA code; no invented lower-level codes
        locations = built["locations"]
        self.assertEqual(len(locations), 3)
        self.assertEqual({loc["provinceCode"] for loc in locations.values()}, {"10", "50"})
        for override in locations.values():
            self.assertEqual(override["kind"], "subdistrict")
            self.assertTrue(override["nativeCode"].startswith("doae-subdistrict:"))
        first = rows[0]
        dims = built["dimensions"][first["observation_id"]]
        self.assertEqual(dims["sourceMonthLabel"], "5")
        self.assertEqual(dims["plantingRoundLabel"], "0")
        self.assertIn("unverified", dims["monthMeaning"])
        self.assertFalse(dims["rollupEligible"])
        self.assertEqual(built["products"][first["observation_id"]], "ข้าวนาปี")

    def test_include_null_publishes_missing_quality_rows(self):
        batch = load_staged_batch(SHORT_LIVED_KEY, records_path=self.short_records_path)
        built = build_rows(batch, license_status="approved_public", retrieved_at=RETRIEVED_AT, include_null=True)
        missing = [row for row in built["rows"] if row["quality_flag"] == "missing"]
        self.assertTrue(missing)
        self.assertTrue(all(row["value"] is None for row in missing))
        self.assertEqual(built["skipped"]["nullMeasuresPublished"], 8)
        self.assertEqual(built["skipped"]["nullMeasures"], 0)
        for row in missing:
            validate_observation(row)

    def test_perennial_build_rows_without_month_or_round(self):
        batch = load_staged_batch(PERENNIAL_KEY, records_path=self.perennial_records_path)
        built = build_rows(batch, license_status="approved_public", retrieved_at=RETRIEVED_AT)
        self.assertEqual(built["skipped"]["duplicateRecords"], 1)
        self.assertEqual(len(built["rows"]), 5)  # rec1: 3 non-null; rec3: standing+farm_gate
        for row in built["rows"]:
            validate_observation(row)
            self.assertEqual(row["source_year_be"], 2566)
        dims = built["dimensions"][built["rows"][0]["observation_id"]]
        self.assertNotIn("sourceMonthLabel", dims)
        self.assertNotIn("plantingRoundLabel", dims)
        self.assertEqual({loc["provinceCode"] for loc in built["locations"].values()}, {"22", "23"})

    def test_unverified_year_and_unknown_province_fail_closed(self):
        batch = load_staged_batch(SHORT_LIVED_KEY, records_path=self.short_records_path)
        poisoned = copy.deepcopy(batch["records"])
        poisoned[0]["source_year_be"] = 2565
        poisoned[0]["year_ad"] = 2022
        batch["records"] = poisoned
        with self.assertRaises(DoaeBridgeError):
            build_rows(batch, license_status="approved_public", retrieved_at=RETRIEVED_AT)
        poisoned = copy.deepcopy(batch["records"])
        poisoned[0]["source_year_be"] = 2566
        poisoned[0]["year_ad"] = 2023
        poisoned[0]["province_name"] = "จังหวัดที่ไม่มีจริง"
        batch["records"] = poisoned
        with self.assertRaises(DoaeBridgeError):
            build_rows(batch, license_status="approved_public", retrieved_at=RETRIEVED_AT)

    # ---- CLI dry-run -------------------------------------------------------
    def test_dry_run_is_the_default_and_never_writes(self):
        summary = run(["--resource", SHORT_LIVED_KEY, "--records", str(self.short_records_path),
                       "--retrieved-at", RETRIEVED_AT, "--dry-run"],
                      registry_path=str(self.registry_path))
        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["status"], "prepared")
        self.assertEqual(summary["rowsPrepared"], 10)
        self.assertEqual(summary["writerRowsQuarantined"], 0)
        self.assertEqual(summary["duplicateRecordsSkipped"], 1)
        self.assertEqual(summary["periodLabels"], ["พ.ศ. 2566", "พ.ศ. 2567"])
        self.assertEqual(summary["completeness"], "complete")
        self.assertEqual(summary["registryGate"]["status"], "passed")
        self.assertEqual(summary["d1ResourceId"], RESOURCES[SHORT_LIVED_KEY]["d1_resource_id"])
        self.assertEqual(len(summary["payloadSha256"]), 64)
        self.assertFalse(summary["overWriterCap"])

    def test_scoped_dry_run_reports_partial(self):
        summary = run(["--resource", SHORT_LIVED_KEY, "--records", str(self.short_records_path),
                       "--retrieved-at", RETRIEVED_AT, "--source-year", "2566"],
                      registry_path=str(self.registry_path))
        self.assertEqual(summary["completeness"], "partial")
        self.assertEqual(summary["coverage"]["scopingFilters"]["sourceYear"], 2566)

    def test_perennial_registry_gate_blocks_write_but_reports_informed_dry_run(self):
        summary = run(["--resource", PERENNIAL_KEY, "--records", str(self.perennial_records_path),
                       "--retrieved-at", RETRIEVED_AT], registry_path=str(self.registry_path))
        self.assertEqual(summary["registryGate"]["status"], "blocked_for_write")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["rowsBridged"], 5)
        with self.assertRaises(ObservationWriteError) as caught:
            run(["--resource", PERENNIAL_KEY, "--records", str(self.perennial_records_path), "--write"],
                registry_path=str(self.registry_path))
        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")

    def test_over_writer_cap_blocks_write_and_bounds_dry_run_validation(self):
        with patch("tadih.doae_production_bridge.WRITER_BATCH_ROW_CAP", 3):
            summary = run(["--resource", SHORT_LIVED_KEY, "--records", str(self.short_records_path),
                           "--retrieved-at", RETRIEVED_AT], registry_path=str(self.registry_path))
            self.assertTrue(summary["overWriterCap"])
            self.assertTrue(summary["validationBoundedPrefix"])
            self.assertEqual(summary["rowsBridged"], 10)
            self.assertEqual(summary["writerValidatedRows"], 3)
            with self.assertRaises(ObservationWriteError) as caught:
                run(["--resource", SHORT_LIVED_KEY, "--records", str(self.short_records_path), "--write"],
                    registry_path=str(self.registry_path))
            self.assertEqual(caught.exception.code, "BATCH_OVER_WRITER_CAP")

    # ---- writer end-to-end on in-memory SQLite (never real D1) ------------
    def test_write_path_publishes_subdistrict_rows_through_shared_writer(self):
        client = SqliteD1Mock()
        summary = run(["--resource", SHORT_LIVED_KEY, "--records", str(self.short_records_path),
                       "--retrieved-at", RETRIEVED_AT, "--write"],
                      client=client, registry_path=str(self.registry_path))
        self.assertTrue(summary["written"])
        self.assertEqual(summary["status"], "succeeded")
        run_id = summary["published"]["run_id"]
        stored = client.one(
            "SELECT period_start, period_end, period_label, unit, value, product, metric_id, "
            "dimensions, location_id FROM observations WHERE run_id=? AND metric_id='planted_area_rai' "
            "ORDER BY row_key LIMIT 1", [run_id])
        self.assertIsNone(stored["period_start"])
        self.assertEqual(stored["period_label"], "พ.ศ. 2566")
        self.assertEqual(stored["unit"], "ไร่")
        self.assertEqual(stored["product"], "ข้าวนาปี")
        self.assertEqual(json.loads(stored["dimensions"])["sourceMonthLabel"], "5")
        location = client.one("SELECT kind, native_code, name, province_code FROM locations WHERE location_id=?",
                              [stored["location_id"]])
        self.assertEqual(location["kind"], "subdistrict")
        self.assertEqual(location["province_code"], "10")
        resource = client.one("SELECT access_status, project_publication_approved, active_run_id, grain "
                              "FROM resources WHERE resource_id=?",
                              [RESOURCES[SHORT_LIVED_KEY]["ckan_resource_id"]])
        self.assertEqual(resource["access_status"], "approved_public")
        self.assertEqual(resource["active_run_id"], run_id)

    def test_cli_reports_bounded_failure_for_missing_staged_file(self):
        import io
        from contextlib import redirect_stdout, redirect_stderr
        buffer = io.StringIO()
        with redirect_stdout(buffer), redirect_stderr(buffer):
            exit_code = main(["--resource", SHORT_LIVED_KEY, "--records", str(self.root / "missing.jsonl")],
                             registry_path=str(self.registry_path))
        self.assertEqual(exit_code, 1)
        report = json.loads(buffer.getvalue().strip().splitlines()[-1])
        self.assertEqual(report["status"], "failed")
        self.assertIn("STAGED_RECORDS_MISSING", report["message"])

    # ---- real local fixtures (gitignored; skip with reason when absent) ----
    def test_real_short_lived_staging_bridge_counts(self):
        if not REAL_STAGED_SHORT_LIVED.is_file():
            self.skipTest("gitignored local fixture data/local/production/staged is absent on this machine")
        batch = load_staged_batch(SHORT_LIVED_KEY, records_path=REAL_STAGED_SHORT_LIVED)
        built = build_rows(batch, license_status="approved_public", retrieved_at=RETRIEVED_AT)
        self.assertEqual(len(batch["records"]), 50_103)
        self.assertEqual(built["skipped"]["duplicateRecords"], 0)
        self.assertEqual(len(built["rows"]), 178_987)
        self.assertGreater(len(built["rows"]), WRITER_BATCH_ROW_CAP)
        self.assertEqual(batch["inventory"]["source_year_be_rows"], {"2566": 48_907, "2567": 1_196})

    def test_real_perennial_staging_bridge_counts(self):
        if not REAL_STAGED_PERENNIAL.is_file():
            self.skipTest("gitignored local fixture data/local/production/perennial-staged is absent on this machine")
        batch = load_staged_batch(PERENNIAL_KEY, records_path=REAL_STAGED_PERENNIAL)
        built = build_rows(batch, license_status="approved_public", retrieved_at=RETRIEVED_AT)
        self.assertEqual(len(batch["records"]), 54_192)
        self.assertEqual(built["skipped"]["duplicateRecords"], 5)
        self.assertGreater(len(built["rows"]), WRITER_BATCH_ROW_CAP)

    def test_real_fixture_bounded_dry_run_produces_valid_writer_plan(self):
        if not REAL_STAGED_SHORT_LIVED.is_file():
            self.skipTest("gitignored local fixture data/local/production/staged is absent on this machine")
        summary = run(["--resource", SHORT_LIVED_KEY, "--records", str(REAL_STAGED_SHORT_LIVED),
                       "--limit", "60", "--retrieved-at", RETRIEVED_AT],
                      registry_path="config/resource_licenses.json")
        self.assertEqual(summary["writerRowsQuarantined"], 0)
        self.assertGreater(summary["rowsPrepared"], 0)
        self.assertEqual(summary["completeness"], "partial")
        self.assertEqual(summary["registryGate"]["status"], "passed")


if __name__ == "__main__":
    unittest.main()
