import unittest
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from tadih.weekly_prices import capture_weekly_prices, stage_weekly_prices
from tadih.ingestion import snapshot_complete


class WeeklyPriceTests(unittest.TestCase):
    def test_capture_one_page_preserves_partial_and_saves_verified_snapshot(self):
        row = {"year_th": 2569, "month": "10", "week": 3, "province_code": "TH00",
            "product_name": "fixture", "unit": "บาท/ตัว", "value": None}
        calls = []
        def fetch(url):
            calls.append(url)
            return {"success": True, "data": [row],
                "pagination": {"page": 1, "offset": 0, "limit": 100, "count": 1, "total": 101}}
        with tempfile.TemporaryDirectory() as folder:
            result = capture_weekly_prices("fixture", 2569, folder, fetcher=fetch)
            self.assertEqual(len(calls), 1)
            self.assertEqual(parse_qs(urlsplit(calls[0]).query)["limit"], ["100"])
            self.assertFalse(result["complete"])
            self.assertFalse(result["warehouse_ready"])
            self.assertEqual(result["total"], 101)
            self.assertIsNone(result["rows"][0]["native_value"])
            manifest = result["manifest"]
            self.assertTrue(snapshot_complete("oae", folder, manifest["partition_key"]))
            for name, year in ((" ", 2569), ("fixture", True), ("fixture", "2569")):
                with self.assertRaises(ValueError):
                    capture_weekly_prices(name, year, folder, fetcher=fetch)
            self.assertEqual(len(calls), 1)

    def test_staging_keeps_native_identity_nulls_and_rejects_invalid_data(self):
        row = {"year_th": 2569, "month": "10", "week": 3, "province_code": "TH00",
            "product_name": "fixture", "unit": "บาท/ตัว", "value": "1,234.50"}
        payload = {"success": True, "data": [row, {**row, "value": None}],
            "pagination": {"page": 1, "offset": 0, "count": 2, "total": 2}}
        run = lambda p: stage_weekly_prices(p, retrieved_at="2026-10-22T00:00:00Z", product_name="fixture")
        result = run(payload)
        a, b = result["records"]
        self.assertEqual(a["native_value"], "1234.50")
        self.assertIsNone(b["native_value"])
        self.assertEqual(a["staging_id"], b["staging_id"])
        self.assertNotEqual(a["revision_id"], b["revision_id"])
        self.assertTrue(result["complete_capture"])
        self.assertFalse(result["warehouse_ready"])
        for field in ("period_start", "period_end", "release_at", "market_id"):
            self.assertIsNone(a[field])
        for update in ({"week": 0}, {"week": 6}, {"month": 13}, {"unit": "unknown"},
                {"province_code": "10"}, {"value": -1}, {"value": True}, {"value": "NaN"}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                run({**payload, "data": [{**row, **update}]})
