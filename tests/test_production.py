import csv
import io
import json
from pathlib import Path
import tempfile
import unittest

from tadih.production import LABELS, MAX_BYTES, MEASURES, SOURCE_URL, fetch_doae_production, parse_production_row, stage_doae_production


def source_row(**updates):
    row = dict(zip(LABELS, ["2566", "5", "กรุงเทพมหานคร", "เขตหนองจอก", "กระทุ่มราย", "ข้าว", "ข้าวนาปี", "ข้าวปทุมธานี 1", "1"]))
    row.update(dict(zip(MEASURES, ["4,840.00", " -   ", "4,840.00", "3,449,000.00", "712.6", "10.16"])))
    row.update(updates)
    return row


def csv_bytes(rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(LABELS) + list(MEASURES))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


class Response(io.BytesIO):
    def __init__(self, body=b"", length=None):
        super().__init__(body)
        self.headers = {"Content-Type": "text/csv", "Content-Length": str(len(body) if length is None else length)}

    def geturl(self):
        return SOURCE_URL


class ProductionTests(unittest.TestCase):
    def test_parser_units_missing_be_year_and_spillover_year(self):
        row = parse_production_row(source_row(), 1)
        self.assertEqual(row["year_ad"], 2023)
        self.assertEqual(row["planted_area_rai"], 4840)
        self.assertEqual(row["production_kg"], 3449000)
        self.assertEqual(row["farm_gate_thb_per_kg"], 10.16)
        self.assertIsNone(row["damaged_area_rai"])
        self.assertEqual(parse_production_row(source_row(ปี="2567"), 2)["year_ad"], 2024)
        blank = source_row()
        blank["ผลผลิตเฉลี่ย(กิโลกรัม/ไร่)"] = ""
        self.assertIsNone(parse_production_row(blank, 3)["yield_kg_per_rai"])

    def test_invalid_number_year_month_and_foreign_province_rejected(self):
        mutations = [("เนื้อที่ปลูก (ไร่)", value) for value in ["NaN", "Inf", "-1", "12,34"]]
        mutations += [("ปี", "2023"), ("เดือน", "13"), ("จังหวัด", "London")]
        for field, value in mutations:
            row = source_row()
            row[field] = value
            with self.subTest(field=field,value=value), self.assertRaises(ValueError):
                parse_production_row(row, 1)

    def test_staging_preserves_all_commodities_rounds_and_marks_duplicates(self):
        rows = [source_row(), source_row(), source_row(พันธุ์พืช="อีกพันธุ์", รอบการปลูก="2")]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.csv"
            source.write_bytes(csv_bytes(rows))
            report = stage_doae_production(source)
            self.assertEqual(report["source_rows"], 3)
            self.assertEqual(report["commodity_count"], 2)
            self.assertEqual(report["duplicate_identity_rows"], 1)
            self.assertEqual(report["exact_duplicate_rows"], 1)
            staged = [json.loads(line) for line in Path(report["records_path"]).read_text(encoding="utf-8").splitlines()]
            self.assertEqual(staged[1]["duplicate_of"], 1)
            self.assertTrue(all(row["rollup_eligible"] is False for row in staged))
            self.assertEqual(stage_doae_production(source), report)

    def test_invalid_later_record_rolls_back_complete_staging(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.csv"
            output = Path(directory) / "staged"
            source.write_bytes(csv_bytes([source_row(), source_row(เดือน="99")]))
            with self.assertRaisesRegex(ValueError, "record 2"):
                stage_doae_production(source, output)
            self.assertEqual(list(output.iterdir()), [])

    def test_download_is_bounded_checksummed_and_resume_needs_no_network(self):
        body = csv_bytes([source_row()])
        calls = []
        def opener(request, timeout):
            calls.append(request.get_method())
            return Response(body)
        with tempfile.TemporaryDirectory() as directory:
            record = fetch_doae_production(directory, opener=opener)
            self.assertEqual(calls, ["HEAD", "GET"])
            self.assertEqual(record["bytes"], len(body))
            resumed = fetch_doae_production(directory, opener=lambda *a, **k: self.fail("resume must not use network"))
            self.assertEqual(resumed["action"], "skipped_verified")
            checkpoint = Path(directory) / "doae_production_2023" / "manifest.json"
            before = checkpoint.read_bytes()
            def truncated(request, timeout):
                return Response(body if request.get_method() == "HEAD" else body[:10], length=len(body))
            with self.assertRaises(ValueError):
                fetch_doae_production(directory, refresh=True, opener=truncated)
            self.assertEqual(checkpoint.read_bytes(), before)
            self.assertFalse(list(checkpoint.parent.glob("*.part")))

    def test_oversized_head_never_downloads(self):
        with tempfile.TemporaryDirectory() as directory:
            def opener(request, timeout):
                self.assertEqual(request.get_method(), "HEAD")
                return Response(length=MAX_BYTES + 1)
            with self.assertRaises(ValueError):
                fetch_doae_production(directory, opener=opener)

    def test_provincial_aggregation_derives_weighted_yield_and_isolates_unmatched(self):
        from tadih.production import aggregate_provincial_production, provincial_production_observations
        from tadih.quality import validate_observation

        with tempfile.TemporaryDirectory() as directory:
            dir_path = Path(directory)
            # Create crosswalk
            cw_path = dir_path / "crosswalk.csv"
            with cw_path.open("w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=[
                    "province_name", "district_name", "subdistrict_name",
                    "province_code", "district_code", "subdistrict_code", "mapping_status"
                ])
                writer.writeheader()
                writer.writerow({
                    "province_name": "กรุงเทพมหานคร", "district_name": "เขตหนองจอก", "subdistrict_name": "กระทุ่มราย",
                    "province_code": "10", "district_code": "1003", "subdistrict_code": "100301", "mapping_status": "matched_snapshot"
                })
                writer.writerow({
                    "province_name": "กรุงเทพมหานคร", "district_name": "เขตลาดกระบัง", "subdistrict_name": "ลาดกระบัง",
                    "province_code": "10", "district_code": "1011", "subdistrict_code": "101101", "mapping_status": "matched_snapshot"
                })
                writer.writerow({
                    "province_name": "กรุงเทพมหานคร", "district_name": "เขตบางบอน", "subdistrict_name": "บางบอน*",
                    "province_code": "10", "district_code": "1050", "subdistrict_code": "", "mapping_status": "unmatched"
                })

            # Create records.jsonl
            records_path = dir_path / "records.jsonl"
            cid = "doae:rice00000000000000000001"
            rows = [
                # Row 1: 1000 rai, 600,000 kg -> 600 kg/rai
                {
                    "source_record_number": 1, "year_ad": 2023, "province_name": "กรุงเทพมหานคร",
                    "district_name": "เขตหนองจอก", "subdistrict_name": "กระทุ่มราย", "crop_group": "ข้าว",
                    "crop_type": "ข้าวนาปี", "variety_name": "กข 41", "commodity_id": cid,
                    "planted_area_rai": 1000.0, "damaged_area_rai": None, "harvested_area_rai": 1000.0,
                    "production_kg": 600000.0, "yield_kg_per_rai": 600.0
                },
                # Row 2: 2000 rai, 1,600,000 kg -> 800 kg/rai
                {
                    "source_record_number": 2, "year_ad": 2023, "province_name": "กรุงเทพมหานคร",
                    "district_name": "เขตลาดกระบัง", "subdistrict_name": "ลาดกระบัง", "crop_group": "ข้าว",
                    "crop_type": "ข้าวนาปี", "variety_name": "กข 41", "commodity_id": cid,
                    "planted_area_rai": 2000.0, "damaged_area_rai": None, "harvested_area_rai": 2000.0,
                    "production_kg": 1600000.0, "yield_kg_per_rai": 800.0
                },
                # Row 3 (unmatched subdistrict): 500 rai, 400,000 kg
                {
                    "source_record_number": 3, "year_ad": 2023, "province_name": "กรุงเทพมหานคร",
                    "district_name": "เขตบางบอน", "subdistrict_name": "บางบอน*", "crop_group": "ข้าว",
                    "crop_type": "ข้าวนาปี", "variety_name": "กข 41", "commodity_id": cid,
                    "planted_area_rai": 500.0, "damaged_area_rai": None, "harvested_area_rai": 500.0,
                    "production_kg": 400000.0, "yield_kg_per_rai": 800.0
                }
            ]
            with records_path.open("w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")

            out_dir = dir_path / "output"
            result = aggregate_provincial_production(records_path, cw_path, output_dir=out_dir)

            self.assertEqual(result["source_records"], 3)
            self.assertEqual(result["total_matched_records"], 2)
            self.assertEqual(result["total_unmatched_records"], 1)
            self.assertEqual(len(result["aggregates"]), 1)

            agg = result["aggregates"][0]
            self.assertEqual(agg["province_code"], "10")
            self.assertEqual(agg["matched_record_count"], 2)
            self.assertEqual(agg["unmatched_record_count"], 1)
            self.assertEqual(agg["subdistrict_completeness"], "partial_unmatched_subdistrict")

            # Matched-only sum: 1000 + 2000 = 3000
            self.assertEqual(agg["planted_area_rai"], 3000.0)
            self.assertEqual(agg["harvested_area_rai"], 3000.0)
            # Matched-only prod: 600,000 + 1,600,000 = 2,200,000
            self.assertEqual(agg["production_kg"], 2200000.0)
            # Weighted yield: 2,200,000 / 3,000 = 733.33 kg/rai (NOT simple average (600 + 800)/2 = 700!)
            self.assertEqual(agg["weighted_yield_kg_per_rai"], 733.33)

            # Check files were written and valid
            self.assertTrue((out_dir / "provincial_production.csv").exists())
            self.assertTrue((out_dir / "provincial_production_inventory.json").exists())

            # Convert to observations and validate against JSON contract
            observations = provincial_production_observations(result["aggregates"])
            self.assertEqual(len(observations), 4)  # planted_area, harvested_area, production, yield
            for obs in observations:
                validate_observation(obs)
                self.assertEqual(obs["area_code"], "10")
                self.assertEqual(obs["spatial_support"], "province")
                self.assertEqual(obs["quality_flag"], "partial_unmatched_subdistrict")


if __name__ == "__main__":
    unittest.main()

