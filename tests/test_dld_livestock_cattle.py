import copy
import unittest
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from tadih.catalog import load_provinces
from tadih.dld_livestock_cattle import (
    RESOURCE_ID,
    RESOURCE_METADATA_URL,
    RESOURCE_URL,
    DldCattleDataError,
    fetch_dld_beef_cattle,
    normalize_dld_beef_cattle,
)


RETRIEVED_AT = "2026-10-28T03:00:00Z"
SOURCE_ROWS = [
    {"_id": 1, "year": 2564, "particular": "จำนวนโคเนื้อ", "region": "ภาคกลาง",
     "livestock_area": "ปศุสัตว์เขต 1", "province": "กรุงเทพมหานคร", "value": 4050,
     "unit": "ตัว", "source": "กรมปศุสัตว์"},
    {"_id": 2, "year": 2564, "particular": "จำนวนโคเนื้อ", "region": "ภาคกลาง",
     "livestock_area": "ปศุสัตว์เขต 1", "province": "ชัยนาท", "value": 49569,
     "unit": "ตัว", "source": "กรมปศุสัตว์"},
]


def payload(rows=None, *, total=None, estimated=False):
    records = copy.deepcopy(SOURCE_ROWS if rows is None else rows)
    return {"success": True, "result": {
        "resource_id": RESOURCE_ID,
        "total": len(records) if total is None else total,
        "total_was_estimated": estimated,
        "records": records,
    }}


class DldBeefCattleTests(unittest.TestCase):
    def normalize(self, data):
        return normalize_dld_beef_cattle(data, retrieved_at=RETRIEVED_AT)

    def test_retains_source_year_and_native_provenance_without_dates(self):
        batch = self.normalize(payload())

        self.assertEqual(batch["resource_id"], RESOURCE_ID)
        self.assertEqual(batch["resource_url"], RESOURCE_URL)
        self.assertEqual(batch["source_response_complete"], True)
        self.assertEqual(batch["records_fetched"], 2)
        self.assertEqual(batch["rows"][0]["source_year_be"], 2564)
        self.assertEqual(batch["rows"][0]["reference_year_convention"], "unverified")
        self.assertEqual(batch["rows"][0]["area_code"], "10")
        self.assertEqual(batch["rows"][0]["value"], 4050)
        self.assertEqual(batch["rows"][0]["unit"], "ตัว")
        self.assertEqual(batch["rows"][0]["region_source"], "ภาคกลาง")
        self.assertEqual(batch["rows"][0]["livestock_area_source"], "ปศุสัตว์เขต 1")
        self.assertNotIn("observed_at", batch["rows"][0])
        year_coverage = batch["province_listing_by_year"][0]
        self.assertEqual(year_coverage["listedProvinceCount"], 2)
        self.assertEqual(year_coverage["referenceProvinceCount"], len(load_provinces()))
        self.assertEqual(year_coverage["unlistedReferenceProvinceCount"], len(load_provinces()) - 2)

    def test_missing_value_stays_null_and_zero_stays_zero(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        rows[0]["value"] = None
        rows[1]["value"] = 0

        normalized = self.normalize(payload(rows))["rows"]

        self.assertIsNone(normalized[0]["value"])
        self.assertEqual(normalized[0]["quality_flag"], "missing")
        self.assertEqual(normalized[1]["value"], 0)
        self.assertEqual(normalized[1]["quality_flag"], "good")

    def test_new_source_year_and_partial_province_coverage_are_reported(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        added = copy.deepcopy(rows[0])
        added.update(_id=3, year=2569, value="1,234")
        rows.append(added)

        batch = self.normalize(payload(rows))

        self.assertEqual([row["source_year_be"] for row in batch["rows"]], [2564, 2564, 2569])
        self.assertEqual(batch["rows"][-1]["value"], 1234)
        self.assertEqual(batch["province_listing_by_year"][-1]["sourceYearBe"], 2569)
        self.assertEqual(batch["province_listing_by_year"][-1]["listedProvinceCount"], 1)

    def test_source_year_must_match_four_digit_api_contract(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        rows[0]["year"] = 10000

        with self.assertRaisesRegex(DldCattleDataError, "DLD_SOURCE_YEAR_INVALID"):
            self.normalize(payload(rows))

    def test_unmapped_province_is_rejected(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        rows[1]["province"] = "จังหวัดที่ไม่มีในบัญชีอ้างอิง"

        with self.assertRaisesRegex(DldCattleDataError, "DLD_PROVINCE_UNMAPPED"):
            self.normalize(payload(rows))

    def test_duplicate_source_year_province_is_rejected(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        rows[1]["province"] = rows[0]["province"]

        with self.assertRaisesRegex(DldCattleDataError, "DLD_DUPLICATE_ROW"):
            self.normalize(payload(rows))

    def test_changed_resource_schema_or_incomplete_page_fails_closed(self):
        data = payload()
        data["result"]["resource_id"] = "another-resource"
        with self.assertRaisesRegex(DldCattleDataError, "DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED"):
            self.normalize(data)

        with self.assertRaisesRegex(DldCattleDataError, "DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED"):
            self.normalize(payload(total=3))

        with self.assertRaisesRegex(DldCattleDataError, "DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED"):
            self.normalize(payload(estimated=True))

    def test_payload_hash_is_order_independent_and_changes_with_data(self):
        original = self.normalize(payload())
        reordered = self.normalize(payload(list(reversed(SOURCE_ROWS))))
        changed_rows = copy.deepcopy(SOURCE_ROWS)
        changed_rows[0]["value"] = 4051
        changed = self.normalize(payload(changed_rows))

        self.assertEqual(original["revision_id"], reordered["revision_id"])
        self.assertNotEqual(original["revision_id"], changed["revision_id"])

    def test_fetch_uses_only_the_fixed_bounded_resource_url(self):
        requested = []

        def fetcher(url):
            requested.append(url)
            if url == RESOURCE_METADATA_URL:
                return {"success": True, "result": {
                    "id": RESOURCE_ID, "hash": "resource-hash", "last_modified": "2026-02-05T02:39:23",
                }}
            response = payload()
            query = parse_qs(urlparse(url).query)
            response["result"]["offset"] = int(query["offset"][0])
            response["result"]["limit"] = int(query["limit"][0])
            return response

        batch = fetch_dld_beef_cattle(fetcher=fetcher, retrieved_at=RETRIEVED_AT)
        query = parse_qs(urlparse(requested[1]).query)

        self.assertEqual(len(requested), 3)
        self.assertEqual(requested[0], RESOURCE_METADATA_URL)
        self.assertEqual(requested[-1], RESOURCE_METADATA_URL)
        self.assertEqual(urlparse(requested[1]).hostname, "dld.gdcatalog.go.th")
        self.assertEqual(query["resource_id"], [RESOURCE_ID])
        self.assertEqual(query["limit"], ["500"])
        self.assertEqual(query["offset"], ["0"])
        self.assertEqual(batch["resource_url"], RESOURCE_URL)
        self.assertEqual(batch["revision_id"], batch["rows"][0]["revision_id"])

    def test_fetch_paginates_to_reported_total_and_pins_resource_revision(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        added = copy.deepcopy(rows[0])
        added.update(_id=3, year=2569, province="นครราชสีมา", value=1234)
        rows.append(added)
        requested_offsets = []

        def fetcher(url):
            if url == RESOURCE_METADATA_URL:
                return {"success": True, "result": {
                    "id": RESOURCE_ID, "hash": "stable-hash", "last_modified": "2026-02-05T02:39:23",
                }}
            query = parse_qs(urlparse(url).query)
            offset, limit = int(query["offset"][0]), int(query["limit"][0])
            requested_offsets.append(offset)
            response = payload(rows[offset:offset + limit])
            response["result"].update(offset=offset, limit=limit, total=len(rows))
            return response

        with patch("tadih.dld_livestock_cattle.PAGE_SIZE", 2), \
                patch("tadih.dld_livestock_cattle.MAX_PAGES", 2):
            batch = fetch_dld_beef_cattle(fetcher=fetcher, retrieved_at=RETRIEVED_AT)

        self.assertEqual(requested_offsets, [0, 2])
        self.assertEqual(batch["page_count"], 2)
        self.assertEqual(batch["source_reported_rows"], 3)
        self.assertEqual(batch["records_fetched"], 3)
        self.assertEqual(batch["source_revision"]["hash"], "stable-hash")

    def test_fetch_rejects_wrong_page_offset(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        added = copy.deepcopy(rows[0])
        added.update(_id=3, year=2569, province="นครราชสีมา")
        rows.append(added)

        def fetcher(url):
            if url == RESOURCE_METADATA_URL:
                return {"success": True, "result": {
                    "id": RESOURCE_ID, "hash": "stable-hash", "last_modified": "2026-02-05T02:39:23",
                }}
            query = parse_qs(urlparse(url).query)
            offset, limit = int(query["offset"][0]), int(query["limit"][0])
            response = payload(rows[offset:offset + limit])
            response["result"].update(offset=offset + 1 if offset else offset, limit=limit, total=len(rows))
            return response

        with patch("tadih.dld_livestock_cattle.PAGE_SIZE", 2), \
                patch("tadih.dld_livestock_cattle.MAX_PAGES", 2):
            with self.assertRaisesRegex(DldCattleDataError, "DLD_PAGE_OFFSET_OR_LIMIT_MISMATCH"):
                fetch_dld_beef_cattle(fetcher=fetcher, retrieved_at=RETRIEVED_AT)

    def test_fetch_fails_if_total_or_resource_revision_changes_between_pages(self):
        rows = copy.deepcopy(SOURCE_ROWS)
        added = copy.deepcopy(rows[0])
        added.update(_id=3, year=2569, province="นครราชสีมา")
        rows.append(added)
        metadata_calls = 0

        def changing_total(url):
            nonlocal metadata_calls
            if url == RESOURCE_METADATA_URL:
                metadata_calls += 1
                return {"success": True, "result": {
                    "id": RESOURCE_ID, "hash": "stable-hash", "last_modified": "2026-02-05T02:39:23",
                }}
            query = parse_qs(urlparse(url).query)
            offset, limit = int(query["offset"][0]), int(query["limit"][0])
            response = payload(rows[offset:offset + limit])
            response["result"].update(offset=offset, limit=limit, total=4 if offset else 3)
            return response

        with patch("tadih.dld_livestock_cattle.PAGE_SIZE", 2), \
                patch("tadih.dld_livestock_cattle.MAX_PAGES", 2):
            with self.assertRaisesRegex(DldCattleDataError, "DLD_TOTAL_CHANGED_DURING_PAGING"):
                fetch_dld_beef_cattle(fetcher=changing_total, retrieved_at=RETRIEVED_AT)

        metadata_calls = 0

        def changing_revision(url):
            nonlocal metadata_calls
            if url == RESOURCE_METADATA_URL:
                metadata_calls += 1
                revision = "before" if metadata_calls == 1 else "after"
                return {"success": True, "result": {
                    "id": RESOURCE_ID, "hash": revision, "last_modified": "2026-02-05T02:39:23",
                }}
            query = parse_qs(urlparse(url).query)
            offset, limit = int(query["offset"][0]), int(query["limit"][0])
            response = payload(rows[offset:offset + limit])
            response["result"].update(offset=offset, limit=limit, total=len(rows))
            return response

        with patch("tadih.dld_livestock_cattle.PAGE_SIZE", 2), \
                patch("tadih.dld_livestock_cattle.MAX_PAGES", 2):
            with self.assertRaisesRegex(DldCattleDataError, "DLD_RESOURCE_CHANGED_DURING_PAGING"):
                fetch_dld_beef_cattle(fetcher=changing_revision, retrieved_at=RETRIEVED_AT)


if __name__ == "__main__":
    unittest.main()
