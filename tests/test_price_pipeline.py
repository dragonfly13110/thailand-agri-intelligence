import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tadih.price_pipeline import run_price_pipeline
from tadih.price_backfill import backfill_monthly_prices
from tadih.publish import build_exports


class PricePipelineTests(unittest.TestCase):
    def test_end_to_end_resume_and_public_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            inventory = {"source_id": "oae", "inventory_id": "nabc_monthly", "year_th": 2569,
                         "status": "ok", "retrieved_at": "2026-10-22T00:00:00Z",
                         "pagination": {"complete": True}, "payload": {"items": [{"product_name": "ไข่ไก่ คละ"}]}}
            payload = {"success": True, "data": [{"product_name": "ไข่ไก่ คละ", "province_code": "TH00",
                       "unit": "บาท/ร้อยฟอง", "year_th": 2566, "month": 1, "week": 0, "value": "300"}],
                       "pagination": {"page": 1, "offset": 0, "limit": 100, "count": 1, "total": 1}}
            def capture(*args, **kwargs):
                return backfill_monthly_prices(*args, **kwargs, fetcher=lambda _: payload)
            def export(db, folder, **kwargs):
                return build_exports(db, root / folder, **kwargs)
            kwargs = dict(raw_dir=root / "raw", run_dir=root / "runs")
            with patch("tadih.price_pipeline.discover_commodities", return_value=inventory) as discover, patch("tadih.price_pipeline.backfill_monthly_prices", side_effect=capture), patch("tadih.price_pipeline.build_exports", side_effect=export):
                first = run_price_pipeline(root / "data.duckdb", 2569, **kwargs)
                second = run_price_pipeline(root / "data.duckdb", 2569, **kwargs)
            self.assertEqual(discover.call_count, 1)
            self.assertEqual(second["status"], "success")
            self.assertEqual(second["db_path"], str((root / "data.duckdb").resolve()))
            self.assertEqual(len(next(s for s in second["steps"] if s["step"] == "capture")["artifacts"]), 1)
            self.assertTrue(next(s for s in second["steps"] if s["step"] == "inventory")["path"].endswith(".json"))
            self.assertEqual(next(s for s in second["steps"] if s["step"] == "capture")["fetched"], 0)
            self.assertEqual(next(s for s in second["steps"] if s["step"] == "ingest")["added_revisions"], 0)
            self.assertEqual([s["observations"] for s in first["steps"] if s["step"] == "export"], [1, 0])

    def test_failure_manifest_and_no_export(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("tadih.price_pipeline.discover_commodities", side_effect=ValueError("provider unavailable")), patch("tadih.price_pipeline.build_exports") as export:
                with self.assertRaisesRegex(ValueError, "unavailable"):
                    run_price_pipeline(Path(directory) / "data.duckdb", 2569,
                                       raw_dir=Path(directory) / "raw", run_dir=Path(directory) / "runs")
            report = json.loads(next(Path(directory).glob("runs/*/report.json")).read_text())
            self.assertEqual(report["status"], "failed")
            export.assert_not_called()
