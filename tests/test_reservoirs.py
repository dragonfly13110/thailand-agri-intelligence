import copy
import json
from pathlib import Path
import tempfile
import unittest

from tadih.reservoirs import backfill_reservoirs, capture_reservoirs, fetch_reservoirs, normalize_reservoirs


def payload(day="2026-10-21"):
    return {"date": day, "total": 2, "data": [{"region": "ภาคเหนือ", "reservoir": [
        {"id": "rsv1", "name": "อ่าง ก", "storage": 10, "dead_storage": 1, "volume": 12, "percent_storage": 120, "inflow": 0, "outflow": None},
        {"id": "rsv2", "name": "อ่าง ข", "storage": 5, "dead_storage": 0, "volume": None, "percent_storage": None, "inflow": None, "outflow": 0}]}]}


class ReservoirTests(unittest.TestCase):
    def test_all_reservoirs_known_units_null_zero_and_above100_preserved(self):
        result = normalize_reservoirs(fetch_reservoirs("2026-10-21", fetcher=lambda _: payload()))
        self.assertEqual(result["reservoir_count"], 2)
        self.assertEqual(result["observation_count"], 8)
        self.assertEqual(result["percent_calibration_counts"], {"consistent": 1, "mismatch": 0, "uncheckable": 1})
        rows = result["observations"]
        self.assertTrue(all(row["area_code"] is None and row["release_at"] is None for row in rows))
        self.assertEqual(next(r["value"] for r in rows if r["location_id"] == "rid:reservoir:rsv1" and r["unit"] == "%"), 120)
        self.assertEqual(next(r["value"] for r in rows if r["location_id"] == "rid:reservoir:rsv2" and r["measure"] == "reservoir_dead_storage"), 0)
        self.assertFalse(any("inflow" in row["measure"] or "outflow" in row["measure"] for row in rows))

    def test_percentage_mismatch_separate_no_measurement_rewrite(self):
        p = payload();p["data"][0]["reservoir"][0]["percent_storage"] = 80
        result = normalize_reservoirs(fetch_reservoirs(fetcher=lambda _: p))
        self.assertEqual(result["percent_calibration_counts"]["mismatch"], 1)
        row = next(r for r in result["observations"] if r["location_id"] == "rid:reservoir:rsv1" and r["unit"] == "%")
        self.assertEqual(row["value"], 80)
        self.assertEqual(row["quality_flag"], "percent_calibration_mismatch")

    def test_wrong_date_count_duplicate_id_and_nonfinite_rejected(self):
        cases = []
        wrong_count = payload();wrong_count["total"] = 3;cases.append(wrong_count)
        duplicate = payload();duplicate["data"][0]["reservoir"][1]["id"] = "rsv1";cases.append(duplicate)
        nonfinite = payload();nonfinite["data"][0]["reservoir"][0]["volume"] = float("nan");cases.append(nonfinite)
        for p in cases:
            with self.assertRaises(ValueError):
                fetch_reservoirs("2026-10-21", fetcher=lambda _: p)
        with self.assertRaisesRegex(ValueError, "another report date"):
            fetch_reservoirs("2020-01-01", fetcher=lambda _: payload())

    def test_capture_resume_refresh_stable_identity_and_changed_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            first = capture_reservoirs(directory, "2026-10-21", fetcher=lambda _: payload())
            second = capture_reservoirs(directory, "2026-10-21", fetcher=lambda _: self.fail("resume must not fetch"))
            self.assertEqual(second["action"], "skipped_verified")
            changed = payload();changed["data"][0]["reservoir"][0]["volume"] = 11
            third = capture_reservoirs(directory, "2026-10-21", refresh=True, fetcher=lambda _: changed)
            a = normalize_reservoirs(json.loads(Path(first["path"]).read_text(encoding="utf-8")))["observations"][0]
            b = normalize_reservoirs(json.loads(Path(third["path"]).read_text(encoding="utf-8")))["observations"][0]
            self.assertEqual(a["observation_id"], b["observation_id"])
            self.assertNotEqual(a["revision_id"], b["revision_id"])

    def test_backfill_bounded_and_wrong_day_leaves_prior_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                backfill_reservoirs("2026-10-01", "2026-10-03", directory, max_days=2, fetcher=lambda _: self.fail("must reject before network"))
            with self.assertRaises(ValueError):
                backfill_reservoirs("2026-10-20", "2026-10-21", directory, fetcher=lambda _: payload("2026-10-20"), sleep=lambda _: None)
            resumed = capture_reservoirs(directory, "2026-10-20", fetcher=lambda _: self.fail("previous day must survive"))
            self.assertEqual(resumed["action"], "skipped_verified")

    def test_normalized_reservoir_observations_pass_quality_contract(self):
        from tadih.quality import validate_observation
        result = normalize_reservoirs(fetch_reservoirs("2026-10-21", fetcher=lambda _: payload()))
        for obs in result["observations"]:
            clean = validate_observation(obs)
            self.assertEqual(clean["source_id"], "rid")
            self.assertEqual(clean["spatial_support"], "reservoir")
            self.assertIsNone(clean["area_code"])
            self.assertEqual(clean["license_status"], "pending")

    def test_warehouse_ingestion_idempotence_and_latest_observations(self):
        from tadih.warehouse import connect, ingest_rows
        db = connect()
        self.addCleanup(db.close)
        first_envelope = fetch_reservoirs("2026-10-21", fetcher=lambda _: payload("2026-10-21"))
        first_norm = normalize_reservoirs(first_envelope)
        count = ingest_rows(db, first_norm["observations"])
        self.assertEqual(count, 8)
        self.assertEqual(db.execute("SELECT count(*) FROM observations").fetchone()[0], 8)
        # Idempotent re-run does not add duplicate rows
        count_re = ingest_rows(db, first_norm["observations"])
        self.assertEqual(count_re, 8)
        self.assertEqual(db.execute("SELECT count(*) FROM observations").fetchone()[0], 8)
        # Revised payload creates a new revision for changed series
        revised = payload("2026-10-21")
        revised["data"][0]["reservoir"][0]["volume"] = 15.0
        second_envelope = fetch_reservoirs("2026-10-21", fetcher=lambda _: revised)
        second_norm = normalize_reservoirs(second_envelope)
        ingest_rows(db, second_norm["observations"])
        # Only observations whose revision changed will be inserted
        self.assertGreater(db.execute("SELECT count(*) FROM observations").fetchone()[0], 8)
        latest_val = db.execute("SELECT value FROM latest_observations WHERE location_id = 'rid:reservoir:rsv1' AND measure = 'reservoir_volume'").fetchone()[0]
        self.assertEqual(latest_val, 15.0)


if __name__ == "__main__":
    unittest.main()
