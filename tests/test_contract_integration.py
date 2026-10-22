"""Exercise publication boundaries across validators, revisions and export contracts."""

import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest

from jsonschema import Draft202012Validator, FormatChecker

from tadih.catalog import ROOT
from tadih.publish import build_exports, verify_exports
from tadih.quality import validate_observation
from tadih.warehouse import connect, ingest_rows


def fixture(**updates):
    return {
        "observation_id": "integration-fixture", "source_id": "oae", "area_code": "10",
        "spatial_support": "province", "location_id": "10", "commodity_id": "fixture-rice",
        "observed_at": "2026-01-01T00:00:00+07:00", "release_at": "2026-01-02T00:00:00Z",
        "retrieved_at": "2026-01-03T00:00:00Z", "measure": "production", "value": 10,
        "unit": "tonne", "data_kind": "official", "revision_id": "r1", "quality_flag": "good",
        "source_url": "https://catalog.oae.go.th/integration-fixture", "license_status": "approved_public",
        **updates,
    }


def csv_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


class ContractIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.db = connect()
        self.addCleanup(self.db.close)

    def test_all_contracts_are_valid_json_schema(self):
        for path in (ROOT / "data_contracts").glob("*.schema.json"):
            with self.subTest(contract=path.name):
                Draft202012Validator.check_schema(json.loads(path.read_text(encoding="utf-8")))

    def test_exported_fact_and_decision_cards_match_json_contracts(self):
        ingest_rows(self.db, [fixture()])
        with tempfile.TemporaryDirectory() as directory:
            snapshot, _ = build_exports(self.db, directory, "2026-01")
            result = self.db.execute("SELECT * FROM read_parquet(?)", [str(snapshot / "fact_observation.parquet")])
            names = [column[0] for column in result.description]
            rows = [dict(zip(names, row)) for row in result.fetchall()]
            schema = json.loads((ROOT / "data_contracts/observation.schema.json").read_text(encoding="utf-8"))
            validator = Draft202012Validator(schema, format_checker=FormatChecker())
            for row in rows:
                validator.validate(row)
            schema = json.loads((ROOT / "data_contracts/risk_signal.schema.json").read_text(encoding="utf-8"))
            validator = Draft202012Validator(schema, format_checker=FormatChecker())
            cards = json.loads((snapshot / "decision_cards.json").read_text(encoding="utf-8"))
            for card in cards:
                validator.validate(card)

    def test_coverage_uses_thailand_calendar_after_utc_normalization(self):
        ingest_rows(self.db, [fixture()])
        # The warehouse instant is December UTC; the Thai observation date is January.
        observed = self.db.execute("SELECT observed_at FROM observations").fetchone()[0]
        self.assertTrue(observed.startswith("2025-12-31"))
        with tempfile.TemporaryDirectory() as directory:
            jan, _ = build_exports(self.db, directory, "2026-01")
            dec, _ = build_exports(self.db, directory, "2025-12")
            for snapshot, expected in ((jan, "AVAILABLE"), (dec, "UNVERIFIED")):
                rows = csv_rows(snapshot / "fact_data_coverage.csv")
                row = next(r for r in rows if r["source_dataset_id"] == "oae" and r["area_code"] == "10")
                self.assertEqual(expected, row["status"])

    def test_production_does_not_claim_price_category_coverage(self):
        ingest_rows(self.db, [fixture(observed_at="2026-01-01T12:00:00Z")])
        with tempfile.TemporaryDirectory() as directory:
            snapshot, _ = build_exports(self.db, directory, "2026-01")
            categories = {r["category_id"]: r for r in csv_rows(snapshot / "fact_category_coverage.csv") if r["area_code"] == "10"}
            self.assertEqual("AVAILABLE", categories["AG02"]["status"])
            self.assertEqual("UNVERIFIED", categories["AG03"]["status"])

    def test_default_coverage_month_uses_bangkok_at_utc_month_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            _, metadata = build_exports(self.db, directory, now=datetime(2025, 12, 31, 18, tzinfo=timezone.utc))
            self.assertEqual("2026-01", metadata["period"])

    def test_revision_cannot_change_observation_identity(self):
        ingest_rows(self.db, [fixture()])
        for changes in ({"source_id": "doae"}, {"measure": "rainfall"}, {"area_code": "11"}, {"unit": "kg"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                ingest_rows(self.db, [fixture(revision_id="r2", release_at="2026-01-03T00:00:00Z", **changes)])
        self.assertEqual(1, self.db.execute("SELECT count(*) FROM observations").fetchone()[0])
        ingest_rows(self.db, [fixture(revision_id="r2", value=20, release_at="2026-01-03T00:00:00Z")])
        self.assertEqual(20, self.db.execute("SELECT value FROM latest_observations").fetchone()[0])

    def test_new_series_collision_inside_batch_preserves_atomicity(self):
        rows = [fixture(observation_id="unrelated"), fixture(),
                fixture(revision_id="r2", area_code="11", release_at="2026-01-03T00:00:00Z")]
        with self.assertRaises(ValueError):
            ingest_rows(self.db, rows)
        self.assertEqual(0, self.db.execute("SELECT count(*) FROM observations").fetchone()[0])

    def test_out_of_order_batch_keeps_latest_missing_revision_and_empty_batch_is_noop(self):
        rows = [fixture(revision_id="r2", value=None, quality_flag="missing", release_at="2026-01-03T00:00:00Z"), fixture()]
        ingest_rows(self.db, rows)
        ingest_rows(self.db, list(reversed(rows)))
        self.assertEqual(0, ingest_rows(self.db, []))
        self.assertEqual(2, self.db.execute("SELECT count(*) FROM observations").fetchone()[0])
        self.assertEqual((None, "r2"), self.db.execute("SELECT value, revision_id FROM latest_observations").fetchone())

    def test_optional_dimensions_reject_objects_before_duckdb_string_conversion(self):
        for changes in ({"market_id": {"private": "do-not-publish"}}, {"grade": ["a"]}, {"season": 2026}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                ingest_rows(self.db, [fixture(**changes)])
        self.assertEqual(0, self.db.execute("SELECT count(*) FROM observations").fetchone()[0])

    def test_malformed_area_shapes_raise_validation_error(self):
        for area_code in ([], {}, 10):
            with self.subTest(area_code=area_code), self.assertRaises(ValueError):
                validate_observation(fixture(area_code=area_code))

    def test_url_query_credentials_cannot_enter_public_fact(self):
        for query in ("api_key=secret", "token=secret", "Authorization=secret", "X-Amz-Signature=secret"):
            with self.subTest(query=query), self.assertRaises(ValueError):
                validate_observation(fixture(source_url="https://catalog.oae.go.th/data?" + query))

    def test_integrity_check_rejects_empty_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot, metadata = build_exports(self.db, directory, "2026-01")
            metadata["files"] = []
            (snapshot / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
            with self.assertRaises(ValueError):
                verify_exports(snapshot)


if __name__ == "__main__":
    unittest.main()
