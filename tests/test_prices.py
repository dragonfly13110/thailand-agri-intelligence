import json
from pathlib import Path
import tempfile
import unittest

from tadih.ingestion import OAE_RICE_PRODUCT, normalize_oae_rice_prices, save_snapshot
from tadih.prices import load_nabc_monthly_snapshot, monthly_price_observation, normalize_nabc_monthly
from tadih.warehouse import connect, ingest_rows


RETRIEVED = "2026-10-22T07:00:00+00:00"


def price(**changes):
    return {"product_name": "synthetic product", "province_code": "TH00", "year_th": 2569,
            "month": "01", "week": 0, "unit": "บาท/กก.", "value": "0", **changes}


def envelope(rows):
    return {"source_id": "oae", "inventory_id": "nabc_monthly", "status": "ok", "year_th": 2569,
            "retrieved_at": RETRIEVED, "payload": {"pages": [{"success": True, "data": rows}]},
            "pagination": {"raw_record_count": len(rows), "complete": True}}


class PriceTests(unittest.TestCase):
    def test_units_are_explicit_and_missing_is_not_zero(self):
        cases = [("บาท/กก.", "12.5", "THB/kg", 12.5), ("บาท/ตัน", "16,545.45", "THB/kg", 16.54545),
                 ("บาท/ตัว", "12.5", "THB/head", 12.5), ("บาท/ร้อยฟอง", "12.5", "THB/100_eggs", 12.5),
                 ("บาท/ร้อยผล", "12.5", "THB/100_fruit", 12.5)]
        for source_unit, token, unit, value in cases:
            with self.subTest(unit=source_unit):
                row = monthly_price_observation(price(unit=source_unit, value=token), RETRIEVED)
                self.assertEqual(row["unit"], unit)
                self.assertAlmostEqual(row["value"], value)
                self.assertIsNone(row["release_at"])
                self.assertIsNone(row["area_code"])
                self.assertEqual(row["license_status"], "pending")
        self.assertEqual(monthly_price_observation(price(), RETRIEVED)["value"], 0)
        for token in (None, "", " -  ", ".."):
            self.assertIsNone(monthly_price_observation(price(value=token), RETRIEVED)["value"])

    def test_price_changes_create_revisions_not_new_observations(self):
        first = monthly_price_observation(price(value="10"), RETRIEVED)
        revised = monthly_price_observation(price(value="11"), "2026-10-23T07:00:00+00:00")
        self.assertEqual(first["observation_id"], revised["observation_id"])
        self.assertNotEqual(first["revision_id"], revised["revision_id"])
        with connect() as db:
            ingest_rows(db, [first, revised])
            ingest_rows(db, [first, revised])
            self.assertEqual(db.execute("SELECT count(*) FROM observations").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT value FROM latest_observations").fetchall(), [(11.0,)])

    def test_exact_overlap_is_deduplicated_and_conflicting_months_are_quarantined(self):
        result = normalize_nabc_monthly(envelope([price(), price(), price(month="02")]))
        self.assertEqual(result["raw_rows"], 3)
        self.assertEqual(result["unique_observations"], 2)
        self.assertEqual(result["exact_duplicate_rows"], 1)
        result = normalize_nabc_monthly(envelope([price(value="10"), price(value="11"), price(month="02", value="0")]))
        self.assertEqual(result["unique_observations"], 1)
        self.assertEqual(result["observations"][0]["value"], 0)
        self.assertEqual(result["conflicting_observations"], 1)
        self.assertEqual(result["quarantined_raw_rows"], 2)
        self.assertEqual(result["data_quality_status"], "conflicts_quarantined")
        with connect() as db:
            earlier = monthly_price_observation(price(value="10"), "2026-10-21T07:00:00+00:00")
            ingest_rows(db, [earlier])
            ingest_rows(db, result["observations"] + result["blocked_observations"])
            self.assertEqual(db.execute("SELECT value,quality_flag FROM latest_observations WHERE observation_id=?",
                [earlier["observation_id"]]).fetchone(), (None, "conflicting_source_records"))

    def test_invalid_numbers_grain_time_and_provider_rows_fail_closed(self):
        changes = [{"value": v} for v in ("1,23", "NaN", "Inf", True, "-1")]
        changes += [{"province_code": "10"}, {"unit": "USD/kg"}, {"year_th": True}, {"month": "13"}, {"week": 1},
                    {"year_th": 2570}, {"product_name": ""}]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError):
                monthly_price_observation(price(**change), RETRIEVED)
        bad = envelope([price(year_th=2568)])
        with self.assertRaises(ValueError):
            normalize_nabc_monthly(bad)
        bad = envelope([price()])
        bad["pagination"]["raw_record_count"] += 1
        with self.assertRaises(ValueError):
            normalize_nabc_monthly(bad)

    def test_historical_rice_and_year_partition_have_same_identity_and_provenance(self):
        raw = price(product_name=OAE_RICE_PRODUCT, unit="บาท/ตัน", value="10,000")
        historic = normalize_oae_rice_prices({"source_id": "oae", "retrieved_at": RETRIEVED, "payload": {"data": [raw]}})[0]
        yearly = normalize_nabc_monthly(envelope([raw]))["observations"][0]
        self.assertEqual(historic, yearly)
        changed = normalize_oae_rice_prices({"source_id": "oae", "retrieved_at": RETRIEVED,
            "payload": {"data": [{**raw, "value": "11,000"}]}})[0]
        self.assertEqual(historic["observation_id"], changed["observation_id"])
        self.assertNotEqual(historic["revision_id"], changed["revision_id"])

    def test_snapshot_requires_a_verified_canonical_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            saved = save_snapshot(envelope([price()]), "oae", directory, "monthly-test")
            path = Path(directory)/"oae/monthly-test"
            loaded = load_nabc_monthly_snapshot(path)
            self.assertEqual(normalize_nabc_monthly(loaded)["unique_observations"], 1)
            artifact = path/saved["artifact"]
            content = json.loads(artifact.read_text(encoding="utf-8"))
            content["retrieved_at"] = "2026-10-23T07:00:00Z"
            artifact.write_text(json.dumps(content), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                load_nabc_monthly_snapshot(path)


if __name__ == "__main__":
    unittest.main()
