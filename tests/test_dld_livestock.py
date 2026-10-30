import copy
import csv
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from tadih.dld_livestock import (
    NATIONAL_VALUE_KEY,
    NATIONAL_VALUE_RESOURCE_ID,
    DldLivestockDataError,
    csv_download_url,
    fetch_dld_livestock_csv,
    fetch_dld_livestock_datastore,
    fetch_dld_national_livestock_value,
    normalize_dld_livestock_records,
    normalize_dld_national_livestock_value,
    province_resource,
)
from tadih.dld_livestock_ingest_d1 import run as adapter_run
from tadih.observations import ObservationWriteError, load_approved_resource
from tests.test_dld_livestock_cattle import payload
from tests.test_observations import dld_registry_row


RETRIEVED_AT = "2026-10-30T02:00:00Z"
DAIRY_ID = province_resource("dld_livestock_dairy_province")["resource_id"]
DAIRY_METADATA_URL = "https://dld.gdcatalog.go.th/api/3/action/resource_show?id=" + DAIRY_ID

DAIRY_ROWS = [
    {"_id": 1, "year": 2564, "particular": "จำนวนโคนม", "region": "ภาคกลาง",
     "livestock_area": "ปศุสัตว์เขต 1", "province": "กรุงเทพมหานคร", "value": 300,
     "unit": "ตัว", "source": "กรมปศุสัตว์"},
    {"_id": 2, "year": 2564, "particular": "จำนวนโคนม", "region": "ภาคตะวันออกเฉียงเหนือ",
     "livestock_area": "ปศุสัตว์เขต 3", "province": "ชัยนาท", "value": "1,234",
     "unit": "ตัว", "source": "กรมปศุสัตว์"},
]

NATIONAL_ROWS = [
    {"_id": 1, "year": 2562, "particular": "มูลค่าไก่เนื้อ", "value": "153,219.75",
     "unit": "ล้านบาท", "source": "กรมปศุสัตว์"},
    {"_id": 2, "year": 2562, "particular": "มูลค่าสุกร", "value": "-",
     "unit": "ล้านบาท", "source": "กรมปศุสัตว์"},
    {"_id": 3, "year": 2563, "particular": "มูลค่าไข่ไก่", "value": "40,718.98",
     "unit": "ล้านบาท", "source": "กรมปศุสัตว์"},
]


def national_payload(rows=None, *, total=None):
    records = copy.deepcopy(NATIONAL_ROWS if rows is None else rows)
    return {"success": True, "result": {
        "resource_id": NATIONAL_VALUE_RESOURCE_ID,
        "total": len(records) if total is None else total,
        "total_was_estimated": False,
        "records": records,
    }}


def csv_text(rows, particular="จำนวนสุกร"):
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(["year", "particular", "region", "livestock_area", "province", "value", "unit", "source"])
    for row in rows:
        writer.writerow([
            row.get("year"), particular, row.get("region", "ภาคกลาง"),
            row.get("livestock_area", "ปศุสัตว์เขต 1"), row.get("province"),
            row.get("value"), "ตัว", "กรมปศุสัตว์",
        ])
    return buffer.getvalue().encode("utf-8")


def swine_csv_rows():
    return [
        {"year": 2564, "province": "กรุงเทพมหานคร", "value": "45,000"},
        {"year": 2564, "province": "ชัยนาท", "value": None},
        {"year": 2565, "province": "กรุงเทพมหานคร", "value": "46,000"},
    ]


def datastore_fetcher(resource_id, rows, *, revision="stable-hash"):
    calls = []

    def fetcher(url):
        calls.append(url)
        if url.startswith("https://dld.gdcatalog.go.th/api/3/action/resource_show"):
            return {"success": True, "result": {
                "id": resource_id, "hash": revision, "last_modified": "2026-02-05T02:39:23",
            }}
        query = parse_qs(urlparse(url).query)
        offset, limit = int(query["offset"][0]), int(query["limit"][0])
        response = payload(copy.deepcopy(rows))
        response["result"].update(
            resource_id=resource_id, offset=offset, limit=limit, total=len(rows),
        )
        return response

    fetcher.calls = calls
    return fetcher


def fixed_reader(content):
    digest = hashlib.sha256(content).hexdigest()

    def reader(url):
        return content, digest

    return reader


class DldLivestockProvinceTests(unittest.TestCase):
    def test_dairy_datastore_snapshot_keeps_source_year_and_native_unit(self):
        fetcher = datastore_fetcher(DAIRY_ID, DAIRY_ROWS)
        batch = fetch_dld_livestock_datastore("dld_livestock_dairy_province",
                                              fetcher=fetcher, retrieved_at=RETRIEVED_AT)
        self.assertEqual(batch["resource_key"], "dld_livestock_dairy_province")
        self.assertEqual(batch["measure"], "dairy_cattle_count")
        self.assertEqual(batch["unit"], "ตัว")
        self.assertEqual(batch["records_fetched"], 2)
        self.assertEqual(batch["rows"][0]["source_year_be"], 2564)
        self.assertEqual(batch["rows"][1]["value"], 1234)
        self.assertEqual(batch["rows"][0]["region_source"], "ภาคกลาง")
        self.assertIsNone(batch["rows"][0].get("observed_at", None))
        self.assertEqual(batch["revision_id"], batch["rows"][0]["revision_id"])
        self.assertEqual(fetcher.calls[0], DAIRY_METADATA_URL)

    def test_missing_and_zero_stay_distinct_never_invented(self):
        rows = copy.deepcopy(DAIRY_ROWS)
        rows[0]["value"] = None
        rows[1]["value"] = 0
        batch = normalize_dld_livestock_records(
            rows, resource_key="dld_livestock_dairy_province", retrieved_at=RETRIEVED_AT,
            source_url="https://example.invalid",
        )
        self.assertIsNone(batch["rows"][0]["value"])
        self.assertEqual(batch["rows"][0]["quality_flag"], "missing")
        self.assertEqual(batch["rows"][1]["value"], 0)
        self.assertEqual(batch["rows"][1]["quality_flag"], "good")

    def test_wrong_particular_or_unit_fails_closed(self):
        rows = copy.deepcopy(DAIRY_ROWS)
        rows[0]["particular"] = "จำนวนโคเนื้อ"
        with self.assertRaisesRegex(DldLivestockDataError, "DLD_CATEGORY_CHANGED"):
            normalize_dld_livestock_records(
                rows, resource_key="dld_livestock_dairy_province", retrieved_at=RETRIEVED_AT,
                source_url="https://example.invalid",
            )
        rows = copy.deepcopy(DAIRY_ROWS)
        rows[0]["unit"] = "กิโลกรัม"
        with self.assertRaisesRegex(DldLivestockDataError, "DLD_UNIT_CHANGED"):
            normalize_dld_livestock_records(
                rows, resource_key="dld_livestock_dairy_province", retrieved_at=RETRIEVED_AT,
                source_url="https://example.invalid",
            )

    def test_swine_csv_snapshot_parses_without_inventing_row_ids(self):
        content = csv_text(swine_csv_rows())
        batch = fetch_dld_livestock_csv("dld_livestock_swine_province",
                                        reader=fixed_reader(content), retrieved_at=RETRIEVED_AT)
        self.assertEqual(batch["measure"], "swine_count")
        self.assertEqual(batch["source_reported_rows"], 3)
        self.assertIsNone(batch["rows"][0]["source_row_id"])
        self.assertEqual(batch["rows"][0]["value"], 45000)
        self.assertIsNone(batch["rows"][1]["value"])
        self.assertEqual(batch["rows"][1]["quality_flag"], "missing")
        self.assertTrue(batch["resource_url"].endswith("dld_01_0501.csv"))

    def test_csv_that_changes_between_reads_is_refused(self):
        calls = {"n": 0}

        def changing_reader(url):
            calls["n"] += 1
            content = csv_text(swine_csv_rows() if calls["n"] == 1 else swine_csv_rows()[1:])
            return content, hashlib.sha256(content).hexdigest()

        with self.assertRaisesRegex(DldLivestockDataError, "DLD_RESOURCE_CHANGED_DURING_PAGING"):
            fetch_dld_livestock_csv("dld_livestock_swine_province",
                                    reader=changing_reader, retrieved_at=RETRIEVED_AT)

    def test_unsupported_resource_key_is_refused(self):
        with self.assertRaisesRegex(DldLivestockDataError, "DLD_RESOURCE_KEY_UNSUPPORTED"):
            province_resource("dld_livestock_fish_province")
        with self.assertRaises(KeyError):
            csv_download_url("dld_livestock_cattle_province")  # cattle is datastore-delivered


class DldNationalValueTests(unittest.TestCase):
    def test_categories_years_and_units_are_preserved(self):
        batch = normalize_dld_national_livestock_value(
            national_payload(), retrieved_at=RETRIEVED_AT,
        )
        self.assertEqual(batch["measure"], "livestock_production_value_million_baht")
        self.assertEqual(batch["unit"], "ล้านบาท")
        self.assertEqual(batch["categories"], ["มูลค่าสุกร", "มูลค่าไก่เนื้อ", "มูลค่าไข่ไก่"])
        by_id = {row["source_row_id"]: row for row in batch["rows"]}
        self.assertEqual(by_id["1"]["value"], 153219.75)
        self.assertIsNone(by_id["2"]["value"])
        self.assertEqual(by_id["2"]["quality_flag"], "missing")
        self.assertEqual(by_id["3"]["source_year_be"], 2563)

    def test_duplicate_category_year_and_bad_unit_fail_closed(self):
        rows = copy.deepcopy(NATIONAL_ROWS)
        rows[2].update(_id=3, year=2562, particular="มูลค่าไข่ไก่")
        rows.append({"_id": 4, "year": 2562, "particular": "มูลค่าไข่ไก่",
                     "value": "1.0", "unit": "ล้านบาท", "source": "กรมปศุสัตว์"})
        with self.assertRaisesRegex(DldLivestockDataError, "DLD_DUPLICATE_ROW"):
            normalize_dld_national_livestock_value(national_payload(rows), retrieved_at=RETRIEVED_AT)

        rows = copy.deepcopy(NATIONAL_ROWS)
        rows[0]["unit"] = "บาท"
        with self.assertRaisesRegex(DldLivestockDataError, "DLD_UNIT_CHANGED"):
            normalize_dld_national_livestock_value(national_payload(rows), retrieved_at=RETRIEVED_AT)

    def test_fetch_pins_revision_before_and_after(self):
        fetcher = self._fetcher()
        batch = fetch_dld_national_livestock_value(fetcher=fetcher, retrieved_at=RETRIEVED_AT)
        self.assertEqual(batch["source_reported_rows"], 3)
        self.assertEqual(batch["revision_id"], batch["rows"][0]["revision_id"])

    def test_incomplete_response_fails_closed(self):
        fetcher = self._fetcher()
        with self.assertRaisesRegex(DldLivestockDataError, "DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED"):
            normalize_dld_national_livestock_value(national_payload(total=4), retrieved_at=RETRIEVED_AT)

    @staticmethod
    def _fetcher():
        metadata = {"success": True, "result": {
            "id": NATIONAL_VALUE_RESOURCE_ID, "hash": "nv-hash", "last_modified": "2026-02-05T02:39:23",
        }}

        def fetcher(url):
            if "resource_show" in url:
                return metadata
            return national_payload()

        return fetcher


class DldLivestockAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp.name) / "resources.json"

    def tearDown(self):
        self.temp.cleanup()

    def write_registry(self, rows):
        self.registry_path.write_text(json.dumps(
            {"automatic_approval": False, "resources": rows}, ensure_ascii=False), encoding="utf-8")

    def test_dairy_dry_run_is_bounded_and_valid_for_the_shared_writer(self):
        self.write_registry([dld_registry_row(
            resource_key="dld_livestock_dairy_province",
            resource_id=DAIRY_ID,
            dataset_id=province_resource("dld_livestock_dairy_province")["dataset_id"],
            name="จำนวนโคนม รายจังหวัด กรมปศุสัตว์",
        )])
        fetcher = datastore_fetcher(DAIRY_ID, DAIRY_ROWS)
        summary = adapter_run(["--resource-key", "dld_livestock_dairy_province"],
                              fetcher=fetcher, registry_path=str(self.registry_path))
        self.assertEqual(summary["mode"], "dry_run")
        self.assertFalse(summary["written"])
        self.assertEqual(summary["measure"], "dairy_cattle_count")
        self.assertEqual(summary["unit"], "ตัว")
        self.assertEqual(summary["sourceYearLabelsBe"], [2564])
        self.assertEqual(summary["rowsFetched"], 2)
        self.assertEqual(summary["writerRowsQuarantined"], 0)
        self.assertEqual(summary["upstreamRequests"], 3)
        self.assertEqual(fetcher.calls[0], DAIRY_METADATA_URL)
        self.assertEqual(len(fetcher.calls), 3)

    def test_swine_dry_run_maps_csv_without_source_row_ids(self):
        self.write_registry([dld_registry_row(
            resource_key="dld_livestock_swine_province",
            resource_id=province_resource("dld_livestock_swine_province")["resource_id"],
            dataset_id=province_resource("dld_livestock_swine_province")["dataset_id"],
            name="จำนวนสุกร รายจังหวัด กรมปศุสัตว์",
        )])
        summary = adapter_run(
            ["--resource-key", "dld_livestock_swine_province"],
            reader=fixed_reader(csv_text(swine_csv_rows())),
            registry_path=str(self.registry_path),
        )
        self.assertEqual(summary["measure"], "swine_count")
        self.assertEqual(summary["rowsFetched"], 3)
        self.assertEqual(summary["missingValues"], 1)
        self.assertEqual(summary["writerRowsQuarantined"], 0)

    def test_national_value_dry_run_keeps_categories_separate(self):
        self.write_registry([dld_registry_row(
            resource_key=NATIONAL_VALUE_KEY,
            resource_id=NATIONAL_VALUE_RESOURCE_ID,
            dataset_id=None,
            name="มูลค่าผลผลิตปศุสัตว์ระดับประเทศ กรมปศุสัตว์",
        )])
        summary = adapter_run(
            ["--resource-key", NATIONAL_VALUE_KEY],
            fetcher=DldNationalValueTests._fetcher(),
            registry_path=str(self.registry_path),
        )
        self.assertEqual(summary["unit"], "ล้านบาท")
        self.assertEqual(summary["measure"], "livestock_production_value_million_baht")
        self.assertEqual(summary["rowsFetched"], 3)
        self.assertEqual(summary["missingValues"], 1)
        self.assertEqual(summary["writerRowsQuarantined"], 0)
        self.assertEqual(summary["coverage"]["categories"], ["มูลค่าสุกร", "มูลค่าไก่เนื้อ", "มูลค่าไข่ไก่"])

    def test_real_registry_dairy_row_fails_the_approval_gate_closed(self):
        """Evidence: open_license_policy basis + unresolved items are refused by the shared gate."""
        with self.assertRaises(ObservationWriteError) as caught:
            load_approved_resource(NATIONAL_VALUE_KEY)
        self.assertEqual(caught.exception.code, "RESOURCE_NOT_APPROVED")

    def test_unsupported_resource_key_is_refused_before_any_fetch(self):
        self.write_registry([dld_registry_row()])
        with self.assertRaises(SystemExit):
            adapter_run(["--resource-key", "dld_livestock_goose_province"],
                        registry_path=str(self.registry_path))


if __name__ == "__main__":
    unittest.main()
