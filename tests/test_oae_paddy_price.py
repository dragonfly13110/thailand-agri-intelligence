"""Offline tests for the OAE/NABC monthly jasmine-paddy reader (no network)."""
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import unittest
from urllib.request import Request

from tadih.oae_paddy_price import (
    MAX_JSON_BYTES,
    PRODUCT_NAME,
    RESOURCE_ID,
    SOURCE_ID,
    SOURCE_RESOURCE_URL,
    UNIT,
    _RejectNabcRedirects,
    fetch_oae_paddy_price_snapshot,
    normalize_oae_paddy_price_json,
)


FIXTURE = Path(__file__).parent / "fixtures/oae_trade/nabc_monthly_jasmine_2569.json"
FIXTURE_BYTES = FIXTURE.read_bytes()


class FakeResponse(io.BytesIO):
    def __init__(self, body, *, url=SOURCE_RESOURCE_URL, content_type="application/json"):
        super().__init__(body)
        self.url = url
        self.status = 200
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body))}

    def geturl(self):
        return self.url

    def getcode(self):
        return self.status


def page(rows, *, total=189):
    return json.dumps(
        {"success": True, "data": rows, "pagination": {"limit": 100, "offset": 0, "page": 1,
                                                        "count": len(rows), "total": total}},
        ensure_ascii=False,
    ).encode("utf-8")


def jasmine_row(year_th, month, value, **change):
    base = {
        "year_th": year_th, "month": month, "week": 0, "province_code": "TH00",
        "province_name": "ประเทศไทย", "product_name": PRODUCT_NAME,
        "commod": "ข้าว", "subcommod": "ข้าวหอมมะลิ", "value": value, "unit": UNIT,
    }
    base.update(change)
    return base


class NormalizeTests(unittest.TestCase):
    def test_fixture_keeps_source_fields_and_evidenced_gregorian_month(self):
        snapshot = normalize_oae_paddy_price_json(FIXTURE_BYTES)

        self.assertEqual(snapshot.source_id, SOURCE_ID)
        self.assertEqual(snapshot.resource_id, RESOURCE_ID)
        self.assertEqual(snapshot.source_total, 189)
        self.assertIsNone(snapshot.retrieved_at)
        self.assertEqual(snapshot.content_sha256, hashlib.sha256(FIXTURE_BYTES).hexdigest())
        by_month = {record.gregorian_month: record for record in snapshot.records}
        # Buddhist-Era year -> Gregorian calendar year is the documented CE = BE - 543 relation.
        self.assertEqual(by_month["2026-09"].year_th, 2569)
        self.assertEqual(by_month["2026-09"].month, "09")
        self.assertEqual(by_month["2026-09"].value, Decimal("16545.45"))
        self.assertEqual(by_month["2026-09"].unit, UNIT)
        self.assertEqual(by_month["2026-09"].product_name, PRODUCT_NAME)
        # A January row keeps its own calendar month across the year boundary.
        self.assertEqual(by_month["2026-01"].gregorian_month, "2026-01")
        self.assertEqual(by_month["2018-06"].gregorian_month, "2018-06")

    def test_missing_and_blank_values_remain_null_never_zero(self):
        content = page([
            jasmine_row(2569, "09", ""),
            jasmine_row(2569, "08", None),
            jasmine_row(2569, "07", "n.a."),
            jasmine_row(2569, "06", "0"),
        ])
        records = normalize_oae_paddy_price_json(content).records

        self.assertEqual([record.value for record in records], [None, None, None, Decimal("0")])
        self.assertEqual([record.value_raw for record in records], ["", "", "n.a.", "0"])

    def test_fractional_value_is_preserved_exactly(self):
        record = normalize_oae_paddy_price_json(page([jasmine_row(2569, "09", "16545.45")])).records[0]
        self.assertEqual(record.value, Decimal("16545.45"))

    def _assert_rejected(self, content, message):
        with self.assertRaisesRegex(ValueError, message):
            normalize_oae_paddy_price_json(content)

    def test_duplicate_month_is_rejected(self):
        self._assert_rejected(page([jasmine_row(2569, "09", "1"), jasmine_row(2569, "09", "2")]),
                              "duplicate OAE paddy price month")

    def test_foreign_product_is_rejected(self):
        self._assert_rejected(page([jasmine_row(2569, "09", "1", product_name="ข้าวโพด")]),
                              "unexpected product")

    def test_weekly_row_is_rejected(self):
        self._assert_rejected(page([jasmine_row(2569, "09", "1", week=1)]), "monthly")

    def test_non_country_scope_is_rejected(self):
        self._assert_rejected(page([jasmine_row(2569, "09", "1", province_code="TH10", province_name="ขอนแก่น")]),
                              "country-average")

    def test_other_unit_is_rejected(self):
        self._assert_rejected(page([jasmine_row(2569, "09", "1", unit="บาท/กก.")]), "unexpected unit")

    def test_bad_month_and_year_are_rejected(self):
        self._assert_rejected(page([jasmine_row(2569, "13", "1")]), "two-digit calendar month")
        self._assert_rejected(page([jasmine_row(1500, "09", "1")]), "out of range")

    def test_non_numeric_value_is_rejected(self):
        self._assert_rejected(page([jasmine_row(2569, "09", "abc")]), "invalid numeric")

    def test_unsuccessful_envelope_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "successful envelope"):
            normalize_oae_paddy_price_json(json.dumps({"success": False, "data": []}).encode("utf-8"))

    def test_unreviewed_source_url_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unreviewed"):
            normalize_oae_paddy_price_json(FIXTURE_BYTES, source_url="https://evil.example/x")


class FetchTests(unittest.TestCase):
    def test_fetch_stamps_retrieval_and_reads_one_pinned_page(self):
        responses = [FakeResponse(FIXTURE_BYTES)]
        calls = []

        def opener(request, *, timeout):
            calls.append((request.full_url, timeout))
            return responses.pop(0)

        snapshot = fetch_oae_paddy_price_snapshot(opener=opener)

        self.assertEqual([url for url, _ in calls], [SOURCE_RESOURCE_URL])
        self.assertIsNotNone(snapshot.retrieved_at)
        self.assertEqual(len(snapshot.records), 8)
        self.assertEqual(snapshot.source_total, 189)

    def test_fetch_rejects_non_200(self):
        class Bad(io.BytesIO):
            def __init__(self, body):
                super().__init__(body)
                self.headers = {"Content-Type": "application/json"}

            def geturl(self):
                return SOURCE_RESOURCE_URL

            def getcode(self):
                return 500

        def opener(request, *, timeout):
            return Bad(b"{}")

        with self.assertRaisesRegex(ValueError, "non-200"):
            fetch_oae_paddy_price_snapshot(opener=opener)

    def test_fetch_rejects_oversized_body(self):
        def opener(request, *, timeout):
            return FakeResponse(b"[" + b" " * (MAX_JSON_BYTES + 5) + b"]")

        with self.assertRaisesRegex(ValueError, "byte limit|exceeds"):
            fetch_oae_paddy_price_snapshot(opener=opener)

    def test_redirect_handler_refuses_off_site(self):
        handler = _RejectNabcRedirects()
        request = Request("https://agriapi.nabc.go.th/other")
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "Found", {}, "https://evil.example/x")


if __name__ == "__main__":
    unittest.main()
