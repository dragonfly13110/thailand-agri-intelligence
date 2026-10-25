import copy
import json
from pathlib import Path
import tempfile
import unittest

from tadih.reservoirs import (BASE_URL, backfill_reservoirs, capture_reservoirs, fetch_reservoirs,
                              normalize_reservoirs, report_signature)


def payload(day="2026-10-21", volume=12):
    """One-region report with two reservoirs; percent stays consistent with volume/capacity."""
    return {"date": day, "total": 2, "data": [{"region": "ภาคเหนือ", "reservoir": [
        {"id": "rsv1", "name": "อ่าง ก", "storage": 10, "dead_storage": 1, "volume": volume,
         "percent_storage": 10 * volume, "inflow": 0.5, "outflow": None},
        {"id": "rsv2", "name": "อ่าง ข", "storage": 5, "dead_storage": 0, "volume": None,
         "percent_storage": None, "inflow": None, "outflow": 0}]}]}


def router(current, days):
    """URL-aware fake: /public returns current, /public/<day> the mapped report,
    and unmapped days fall back to the current report (the provider's silent trap)."""
    def fetcher(url):
        if url == BASE_URL:
            return copy.deepcopy(current)
        return copy.deepcopy(days.get(url.rsplit("/", 1)[-1], current))
    return fetcher


def no_network(_):
    raise AssertionError("must reject before any network call")


class ReservoirTests(unittest.TestCase):
    def test_normalizer_known_units_macroregion_null_province_and_missing_null(self):
        result = normalize_reservoirs(fetch_reservoirs("2026-10-21", fetcher=lambda _: payload()))
        self.assertEqual(result["reservoir_count"], 2)
        self.assertEqual(result["observation_count"], 8)  # four documented measures x two reservoirs
        self.assertEqual(result["pending_unit_observation_count"], 4)  # two flow fields x two reservoirs
        self.assertEqual(result["percent_calibration_counts"], {"consistent": 1, "mismatch": 0, "uncheckable": 1})
        self.assertEqual(result["units"], {"storage": "MCM", "dead_storage": "MCM", "volume": "MCM",
                                           "percent_storage": "%", "inflow": None, "outflow": None})
        rows = result["observations"]
        by_key = {(row["location_id"], row["measure"]): row for row in rows}
        capacity = by_key[("rid:reservoir:rsv1", "reservoir_storage_capacity")]
        self.assertEqual((capacity["value"], capacity["unit"]), (10, "MCM"))  # ล้าน ลบ.ม. kept as MCM
        # provider values above 100 percent and exact zeros are never rewritten or clipped
        self.assertEqual((by_key[("rid:reservoir:rsv1", "reservoir_percent_storage")]["value"],
                          by_key[("rid:reservoir:rsv1", "reservoir_percent_storage")]["unit"]), (120, "%"))
        self.assertEqual(by_key[("rid:reservoir:rsv2", "reservoir_dead_storage")]["value"], 0)
        # missing values stay null and are flagged, never zero-filled or re-derived
        missing_volume = by_key[("rid:reservoir:rsv2", "reservoir_volume")]
        self.assertIsNone(missing_volume["value"])
        self.assertEqual(missing_volume["quality_flag"], "missing")
        # the six macroregions stay verbatim; province codes stay null (no crosswalk yet)
        self.assertEqual(result["reservoirs"][0]["region"], "ภาคเหนือ")
        self.assertTrue(all(row["area_code"] is None for row in rows))
        self.assertTrue(all(row["area_code"] is None for row in result["pending_unit_observations"]))
        # inflow/outflow are quarantined with a null unit, never guessed
        pending = {(row["location_id"], row["measure"]): row for row in result["pending_unit_observations"]}
        inflow = pending[("rid:reservoir:rsv1", "reservoir_inflow")]
        self.assertEqual((inflow["value"], inflow["unit"], inflow["quality_flag"]), (0.5, None, "units_unverified"))
        missing_flow = pending[("rid:reservoir:rsv1", "reservoir_outflow")]
        self.assertEqual((missing_flow["value"], missing_flow["unit"], missing_flow["quality_flag"]), (None, None, "missing"))
        self.assertFalse(any("inflow" in row["measure"] or "outflow" in row["measure"] for row in rows))

    def test_requested_dates_outside_history_rejected_before_network(self):
        for bad in ("1997-12-31", "1990-01-01"):
            with self.assertRaisesRegex(ValueError, "1998"):
                fetch_reservoirs(bad, fetcher=no_network)
        with self.assertRaisesRegex(ValueError, "1998"):
            capture_reservoirs("unused", "1997-06-15", fetcher=no_network)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "1998"):
                backfill_reservoirs("1997-01-01", "1997-01-05", directory, fetcher=no_network)

    def test_future_and_invalid_calendar_dates_rejected_before_network(self):
        with self.assertRaisesRegex(ValueError, "future"):
            fetch_reservoirs("2030-01-01", fetcher=no_network)
        for bad in ("2026-02-30", "1999-02-29", "2026-13-01"):
            with self.assertRaisesRegex(ValueError, "calendar"):
                fetch_reservoirs(bad, fetcher=no_network)
        for bad in ("not-a-date", "20260101"):
            with self.assertRaisesRegex(ValueError, "YYYY-MM-DD"):
                fetch_reservoirs(bad, fetcher=no_network)

    def test_signature_ignores_forged_date_label_and_group_order(self):
        base = payload()
        forged = copy.deepcopy(base)
        forged["date"] = "1997-06-15"  # the provider rewrites labels of substituted reports
        self.assertEqual(report_signature(base), report_signature(forged))
        two_regions = payload()
        two_regions["total"] = 3
        two_regions["data"].append({"region": "ภาคกลาง", "reservoir": [
            {"id": "rsv3", "name": "อ่าง ค", "storage": 3, "dead_storage": 1, "volume": 1,
             "percent_storage": 33.3, "inflow": None, "outflow": None}]})
        swapped = copy.deepcopy(two_regions)
        swapped["data"] = list(reversed(swapped["data"]))
        self.assertEqual(report_signature(two_regions), report_signature(swapped))
        changed = copy.deepcopy(base)
        changed["data"][0]["reservoir"][0]["volume"] = 13
        self.assertNotEqual(report_signature(base), report_signature(changed))

    def test_historical_day_returning_current_content_is_refused_with_reference(self):
        current = payload("2026-10-24", volume=13)
        trap = copy.deepcopy(current)
        trap["date"] = "2026-10-20"  # label rewritten to match the request
        reference = report_signature(current)
        with self.assertRaisesRegex(ValueError, "current report"):
            fetch_reservoirs("2026-10-20", fetcher=lambda _: trap, reference_signature=reference)
        # without a reference the fetch succeeds but keeps the fingerprint for later comparison
        envelope = fetch_reservoirs("2026-10-20", fetcher=lambda _: trap)
        self.assertEqual(envelope["content_signature"], reference)

    def test_wrong_date_label_count_duplicate_id_and_nonfinite_rejected(self):
        with self.assertRaisesRegex(ValueError, "another report date"):
            fetch_reservoirs("2020-01-01", fetcher=lambda _: payload())
        cases = []
        wrong_count = payload(); wrong_count["total"] = 3; cases.append(wrong_count)
        duplicate = payload(); duplicate["data"][0]["reservoir"][1]["id"] = "rsv1"; cases.append(duplicate)
        nonfinite = payload(); nonfinite["data"][0]["reservoir"][0]["volume"] = float("nan"); cases.append(nonfinite)
        for report in cases:
            with self.assertRaises(ValueError):
                fetch_reservoirs("2026-10-21", fetcher=lambda _: report)

    def test_normalize_rejects_envelope_whose_payload_changed_after_fetch(self):
        envelope = fetch_reservoirs("2026-10-21", fetcher=lambda _: payload())
        envelope["payload"]["data"][0]["reservoir"][0]["volume"] = 99  # tampered after fingerprinting
        with self.assertRaisesRegex(ValueError, "signature"):
            normalize_reservoirs(envelope)

    def test_capture_resume_refresh_stable_identity_and_changed_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            first = capture_reservoirs(directory, "2026-10-21", fetcher=lambda _: payload())
            self.assertEqual(first["content_signature"], report_signature(payload()))
            second = capture_reservoirs(directory, "2026-10-21", fetcher=no_network)
            self.assertEqual(second["action"], "skipped_verified")
            changed = payload(); changed["data"][0]["reservoir"][0]["volume"] = 11
            third = capture_reservoirs(directory, "2026-10-21", refresh=True, fetcher=lambda _: changed)
            a = normalize_reservoirs(json.loads(Path(first["path"]).read_text(encoding="utf-8")))["observations"][0]
            b = normalize_reservoirs(json.loads(Path(third["path"]).read_text(encoding="utf-8")))["observations"][0]
            self.assertEqual(a["observation_id"], b["observation_id"])
            self.assertNotEqual(a["revision_id"], b["revision_id"])

    def test_backfill_happy_path_uses_one_current_reference_and_resumes_checkpoints(self):
        current, calls = payload("2026-10-24", volume=13), []
        days = {"2026-10-20": payload("2026-10-20", volume=10), "2026-10-21": payload("2026-10-21", volume=12)}

        def fetcher(url):
            calls.append(url)
            return router(current, days)(url)

        with tempfile.TemporaryDirectory() as directory:
            first = backfill_reservoirs("2026-10-20", "2026-10-21", directory, fetcher=fetcher, sleep=lambda _: None)
            self.assertEqual([row["action"] for row in first], ["fetched", "fetched"])
            self.assertEqual(len(calls), 3)  # one current-report reference plus the two days
            calls.clear()
            second = backfill_reservoirs("2026-10-20", "2026-10-21", directory, fetcher=fetcher, sleep=lambda _: None)
            self.assertEqual([row["action"] for row in second], ["skipped_verified", "skipped_verified"])
            self.assertEqual(len(calls), 1)  # only the reference is re-checked on resume

    def test_backfill_refuses_duplicate_report_content_across_days(self):
        current = payload("2026-10-24", volume=13)
        first = payload("2026-10-20", volume=10)
        duplicate = copy.deepcopy(first)
        duplicate["date"] = "2026-10-21"  # same values, rewritten label
        days = {"2026-10-20": first, "2026-10-21": duplicate}
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "same report content"):
                backfill_reservoirs("2026-10-20", "2026-10-21", directory,
                                    fetcher=router(current, days), sleep=lambda _: None)
            # the substituted day is refused before any checkpoint is written
            self.assertTrue((Path(directory) / "rid" / "medium-reservoirs-2026-10-20").is_dir())
            self.assertFalse((Path(directory) / "rid" / "medium-reservoirs-2026-10-21").exists())

    def test_backfill_wrong_day_leaves_prior_checkpoint(self):
        current = payload("2026-10-24", volume=13)
        days = {"2026-10-20": payload("2026-10-20", volume=10)}  # 2026-10-21 falls back to current
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "another report date"):
                backfill_reservoirs("2026-10-20", "2026-10-21", directory,
                                    fetcher=router(current, days), sleep=lambda _: None)
            resumed = capture_reservoirs(directory, "2026-10-20", fetcher=no_network)
            self.assertEqual(resumed["action"], "skipped_verified")

    def test_backfill_bounds_checked_before_any_network(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                backfill_reservoirs("2026-10-01", "2026-10-03", directory, max_days=2, fetcher=no_network)

    def test_normalized_reservoir_observations_pass_quality_contract(self):
        from tadih.quality import FIELDS, validate_observation
        result = normalize_reservoirs(fetch_reservoirs("2026-10-21", fetcher=lambda _: payload()))
        for obs in result["observations"]:
            clean = validate_observation(obs)
            self.assertEqual(clean["source_id"], "rid")
            self.assertEqual(clean["spatial_support"], "reservoir")
            self.assertIsNone(clean["area_code"])
            self.assertEqual(clean["license_status"], "pending")
        # quarantined rows share the observation shape; only the null unit (unverified
        # inflow/outflow) keeps them out of the validated stream until RID confirms it
        for row in result["pending_unit_observations"]:
            self.assertEqual(set(row), set(FIELDS))
            self.assertIsNone(row["unit"])

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
