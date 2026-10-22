import tempfile
import unittest
from urllib.parse import parse_qs, urlparse

from tadih.ingestion import save_snapshot
from tadih.price_backfill import backfill_monthly_prices, fetch_monthly_product


PRODUCT = "ไข่ไก่ คละ"


def raw(month=1, value="300"):
    return {"product_name": PRODUCT, "province_code": "TH00", "unit": "บาท/ร้อยฟอง", "year_th": 2566, "month": month, "week": 0, "value": value}


def page(rows, number=1, total=None):
    return {"success": True, "data": rows, "pagination": {"page": number, "offset": (number-1)*100, "limit": 100, "count": len(rows), "total": len(rows) if total is None else total}}


def inventory(directory):
    envelope = {"source_id": "oae", "inventory_id": "nabc_monthly", "status": "ok", "retrieved_at": "2026-10-22T00:00:00+00:00",
                "payload": {"items": [{"product_name": PRODUCT}, {"product_name": PRODUCT}]}}
    save_snapshot(envelope, "oae", directory, "inventory")
    return str(directory) + "/oae/inventory"


class PriceBackfillTests(unittest.TestCase):
    def test_pages_bounded_exact_duplicates_and_units_validate(self):
        first = page([raw()] * 100, total=101)
        second = page([raw(2)], number=2, total=101)
        sleeps = []
        fetcher = lambda url: second if parse_qs(urlparse(url).query)["page"] == ["2"] else first
        complete = fetch_monthly_product(PRODUCT, 2, fetcher=fetcher, sleep=sleeps.append)
        self.assertTrue(complete["pagination"]["complete"])
        self.assertEqual(complete["pagination"]["unique_observations"], 2)
        self.assertEqual(complete["pagination"]["exact_duplicate_rows"], 99)
        self.assertEqual(sleeps, [0.25])
        bounded = fetch_monthly_product(PRODUCT, 1, fetcher=fetcher)
        self.assertFalse(bounded["pagination"]["complete"])
        self.assertEqual(bounded["pagination"]["next_page"], 2)

    def test_pagination_product_and_unit_fail_before_save(self):
        cases = [page([dict(raw(), unit="USD")]), page([dict(raw(), product_name="other")]), page([raw()], total=2)]
        wrong_offset = page([raw()]);wrong_offset["pagination"]["offset"] = 1
        cases.append(wrong_offset)
        for payload in cases:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                fetch_monthly_product(PRODUCT, fetcher=lambda _: payload)

    def test_conflicting_month_is_quarantined_other_months_survive(self):
        envelope = fetch_monthly_product(PRODUCT, fetcher=lambda _: page([raw(value="300"), raw(value="301"), raw(2, value="302")]))
        self.assertEqual(envelope["status"], "ok")
        self.assertEqual(envelope["data_quality_status"], "conflicts_quarantined")
        self.assertEqual(envelope["pagination"]["raw_record_count"], 3)
        self.assertEqual(envelope["pagination"]["unique_observations"], 1)
        self.assertEqual(envelope["pagination"]["conflicting_observations"], 1)
        self.assertEqual(envelope["pagination"]["quarantined_raw_rows"], 2)
        self.assertEqual(envelope["pagination"]["earliest"], "2023-02-01T00:00:00+07:00")
        self.assertEqual(len(envelope["payload"]["data"]), 3)

    def test_conflict_checkpoint_resumes_with_quarantine_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            source = inventory(directory)
            first = backfill_monthly_prices(source, directory, fetcher=lambda _: page([raw(value="300"), raw(value="301"), raw(2)]))
            resumed = backfill_monthly_prices(source, directory, fetcher=lambda _: self.fail("checked quarantine resume used network"))
            self.assertEqual(resumed[0]["action"], "skipped_verified")
            self.assertEqual(resumed[0]["conflicting_observations"], 1)
            self.assertEqual(resumed[0]["quarantined_raw_rows"], 2)
            self.assertEqual(resumed[0]["unique_observations"], 1)
            self.assertEqual(resumed[0]["checksum"], first[0]["checksum"])

    def test_checked_resume_no_network_and_refresh_keeps_revisions(self):
        with tempfile.TemporaryDirectory() as directory:
            source = inventory(directory)
            first = backfill_monthly_prices(source, directory, fetcher=lambda _: page([raw()]))
            self.assertEqual(len(first), 1)
            self.assertTrue(first[0]["complete"])
            resumed = backfill_monthly_prices(source, directory, fetcher=lambda _: self.fail("resume used network"))
            self.assertEqual(resumed[0]["action"], "skipped_verified")
            refreshed = backfill_monthly_prices(source, directory, refresh=True, fetcher=lambda _: page([raw(value="301")]))
            self.assertNotEqual(first[0]["checksum"], refreshed[0]["checksum"])
            self.assertEqual(first[0]["earliest"], "2023-01-01T00:00:00+07:00")

    def test_incomplete_checkpoint_does_not_resume_as_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            source = inventory(directory)
            first = backfill_monthly_prices(source, directory, max_pages=1, fetcher=lambda _: page([raw()]*100,total=101))
            self.assertFalse(first[0]["complete"])
            calls = []
            def fetcher(url):
                calls.append(url)
                return page([raw()])
            second = backfill_monthly_prices(source, directory, fetcher=fetcher)
            self.assertEqual(len(calls), 1)
            self.assertEqual(second[0]["action"], "fetched")
            self.assertTrue(second[0]["complete"])


if __name__ == "__main__":
    unittest.main()
