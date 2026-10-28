import unittest
from urllib.error import HTTPError

from tadih.commodities import discover_commodities


class CommodityTests(unittest.TestCase):
    def test_all_returned_names_preserved_but_completeness_unknown(self):
        names = [f"provider product {i}" for i in range(53)]
        result = discover_commodities("nabc_daily", fetcher=lambda _: {"success": True, "data": names})
        self.assertEqual(len(result["payload"]["items"]), 53)
        self.assertIsNone(result["pagination"]["complete"])
        self.assertTrue(all(row["source_product_code"] is None and row["variety"] is None for row in result["payload"]["items"]))

    def test_paginated_inventory_preserves_distinct_definitions(self):
        def fetch(url):
            page = 2 if "page=2" in url else 1
            rows = [{"product_name": "same name", "unit": "tonne" if page == 1 else "kg"}]
            return {"success": True, "data": rows, "pagination": {"page": page, "offset": page-1, "limit": 1, "count": 1, "total": 2}}
        result = discover_commodities(year_th=2569, page_size=1, max_pages=2, fetcher=fetch, sleep=lambda _: None)
        self.assertTrue(result["pagination"]["complete"])
        self.assertEqual(len(result["payload"]["items"]), 2)
        self.assertNotEqual(*(row["staging_commodity_id"] for row in result["payload"]["items"]))
        incomplete = discover_commodities(year_th=2569, page_size=1, max_pages=1, fetcher=fetch)
        self.assertFalse(incomplete["pagination"]["complete"])
        self.assertEqual(incomplete["pagination"]["next_page"], 2)

    def test_denied_inventory_is_failure_not_empty_success(self):
        def denied(_):
            raise HTTPError("https://dataapi.moc.go.th/gis-products", 403, "denied", {}, None)
        result = discover_commodities("moc", fetcher=denied)
        self.assertEqual(result["status"], "access_denied_or_filtered")
        self.assertFalse(result["pagination"]["complete"])

    def test_input_and_provider_schema_fail_closed(self):
        with self.assertRaises(ValueError):
            discover_commodities("nabc_monthly", fetcher=lambda _: self.fail("must not call"))
        with self.assertRaises(ValueError):
            discover_commodities("nabc_daily", fetcher=lambda _: {"success": True, "data": [{}]})
        with self.assertRaises(ValueError):
            discover_commodities("nabc_daily", start_page=2)

if __name__ == "__main__":
    unittest.main()

