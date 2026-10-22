import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest

from tadih.publish import build_exports, verify_exports, write_coverage_view
from tadih.quality import validate_observation
from tadih.transform import weather_observations
from tadih.warehouse import connect, ingest_rows


def observation(**changes):
    row = {"observation_id": "test-only", "source_id": "oae", "area_code": "10",
        "spatial_support": "province", "location_id": "10", "commodity_id": "test-rice",
        "observed_at": "2026-01-01T00:00:00Z", "release_at": "2026-01-02T00:00:00Z",
        "retrieved_at": "2026-01-03T00:00:00Z", "measure": "production", "value": 0,
        "unit": "tonne", "data_kind": "official", "revision_id": "r1", "quality_flag": "good",
        "source_url": "https://catalog.oae.go.th/test-fixture", "license_status": "approved_public"}
    return {**row, **changes}


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.db = connect()
        self.addCleanup(self.db.close)

    def test_zero_is_real_missing_is_null(self):
        ingest_rows(self.db, [observation(), observation(observation_id="missing", value=None, quality_flag="missing")])
        self.assertEqual(self.db.execute("SELECT value FROM observations ORDER BY observation_id DESC").fetchall(), [(0.0,), (None,)])

    def test_untrusted_rows_rejected_before_any_write(self):
        for updates in ({"farmer_name": "private"}, {"value": float("nan")}, {"value": True},
                        {"area_code": "1001"}, {"data_kind": "forecast"}, {"source_id": "unknown"},
                        {"source_url": "https://username:secret@example.com"},
                        {"spatial_support": "national"}, {"observed_at": "2026-01-01"}):
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                ingest_rows(self.db, [observation(observation_id="valid"), observation(**updates)])
            self.assertEqual(self.db.execute("SELECT count(*) FROM observations").fetchone()[0], 0)

    def test_price_dimensions_required(self):
        with self.assertRaises(ValueError):
            validate_observation(observation(measure="price", unit="THB/kg"))
        self.assertEqual(validate_observation(observation(measure="price", unit="THB/kg", market_id="fixture",
            grade="fixture", price_type="farm_gate"))["value"], 0)

    def test_revision_conflicts_rollback_and_retries_are_idempotent(self):
        ingest_rows(self.db, [observation()])
        ingest_rows(self.db, [observation(retrieved_at="2026-01-04T00:00:00Z")])
        self.assertEqual(self.db.execute("SELECT count(*) FROM observations").fetchone()[0], 1)
        with self.assertRaises(ValueError):
            ingest_rows(self.db, [observation(observation_id="other"), observation(value=99)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM observations").fetchone()[0], 1)
        ingest_rows(self.db, [observation(value=99, revision_id="r2", release_at="2026-01-03T00:00:00Z")])
        self.assertEqual(self.db.execute("SELECT value FROM latest_observations").fetchone()[0], 99)

    def test_duplicate_revisions_within_same_batch_are_checked(self):
        with self.assertRaises(ValueError):
            ingest_rows(self.db, [observation(), observation(value=99)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM observations").fetchone()[0], 0)
        ingest_rows(self.db, [observation(), observation(retrieved_at="2026-01-04T00:00:00Z")])
        self.assertEqual(self.db.execute("SELECT count(*) FROM observations").fetchone()[0], 1)

    def test_latest_restriction_cannot_resurrect_public_history(self):
        ingest_rows(self.db, [observation(), observation(value=1, revision_id="r2", license_status="restricted",
            release_at="2026-01-03T00:00:00Z")])
        with tempfile.TemporaryDirectory() as directory:
            snapshot, metadata = build_exports(self.db, directory, "2026-01")
            self.assertEqual(metadata["public_observation_count"], 0)
            self.assertEqual(metadata["province_source_available_count"], 0)
            self.assertEqual(verify_exports(snapshot)["province_count"], 77)

    def test_internal_export_is_explicit_and_keeps_pending_licence(self):
        ingest_rows(self.db, [observation(license_status="pending")])
        with tempfile.TemporaryDirectory() as directory:
            snapshot, metadata = build_exports(self.db, directory, "2026-01", audience="internal")
            self.assertEqual(metadata["observation_count"], 1)
            self.assertEqual(metadata["public_observation_count"], 0)
            self.assertFalse(metadata["redistribution_allowed"])
            with (snapshot / "fact_observation.csv").open(encoding="utf-8-sig", newline="") as handle:
                self.assertEqual(next(csv.DictReader(handle))["license_status"], "pending")
            with self.assertRaises(ValueError):
                write_coverage_view(snapshot, Path(directory) / "must-not-publish.csv")

    def test_coverage_view_retains_unknown_and_geographic_names(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot, _ = build_exports(self.db, directory)
            path = Path(directory) / "coverage.csv"
            result = write_coverage_view(snapshot, path)
            with path.open(encoding="utf-8-sig", newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(result["rows"], 77 * 16)
            self.assertEqual(len({r["province_code"] for r in rows}), 77)
            self.assertEqual({r["coverage_status"] for r in rows}, {"UNVERIFIED"})
            self.assertTrue(any(r["province_name"] == "กรุงเทพมหานคร" for r in rows))

    def test_snapshot_covers_all_categories_without_inventing_data(self):
        ingest_rows(self.db, [observation(area_code=None, spatial_support="grid_point", location_id="fixture-point")])
        with tempfile.TemporaryDirectory() as directory:
            snapshot, metadata = build_exports(self.db, directory, "2026-01", datetime(2026, 1, 4, tzinfo=timezone.utc))
            self.assertEqual(metadata["public_observation_count"], 1)
            self.assertEqual(metadata["province_source_available_count"], 0)
            with (snapshot / "fact_category_coverage.csv").open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 77 * 20)
            self.assertEqual({r["status"] for r in rows}, {"UNVERIFIED"})
            cards = json.loads((snapshot / "decision_cards.json").read_text(encoding="utf-8"))
            self.assertTrue(all(card["status"] == "unknown" for card in cards))
            self.assertEqual(self.db.execute("SELECT count(*) FROM read_parquet(?)", [str(snapshot / "fact_observation.parquet")]).fetchone()[0], 1)
            (snapshot / "dim_area.csv").write_text("corrupted", encoding="utf-8")
            with self.assertRaises(ValueError):
                verify_exports(snapshot)

    def test_weather_transformation_retains_point_and_unknown_availability(self):
        envelope = {"source_id": "open_meteo", "data_kind": "estimated",
            "requested_location": {"latitude": 13.8, "longitude": 100.25},
            "retrieved_at": "2026-01-03T00:00:00Z", "request_url": "https://archive-api.open-meteo.com/v1/archive",
            "payload": {"daily": {"time": ["2026-01-01"], "precipitation_sum": [0],
                        "temperature_2m_max": [None], "et0_fao_evapotranspiration": [2]},
                        "daily_units": {"precipitation_sum": "mm", "temperature_2m_max": "°C", "et0_fao_evapotranspiration": "mm"}}}
        rows = weather_observations(envelope)
        ingest_rows(self.db, rows)
        self.assertTrue(all(r["area_code"] is None and r["release_at"] is None and r["license_status"] == "pending" for r in rows))
        self.assertEqual(rows[0]["value"], 0)
        with self.assertRaises(ValueError):
            weather_observations({**envelope, "data_kind": "forecast"})


    def test_coverage_inventory_reasons_and_source_period_availability(self):
        from jsonschema import Draft202012Validator, FormatChecker
        schema = json.loads((Path(__file__).parents[1] / "data_contracts/coverage.schema.json").read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())

        # Source-period sums indicate data presence, not verified annual totals.
        doae_obs = observation(
            observation_id="doae:10:2023:rice:production",
            source_id="doae",
            area_code="10",
            spatial_support="province",
            observed_at="2023-12-31T00:00:00Z",
            quality_flag="source_period_provincial_aggregate",
            measure="production",
            value=500000.0,
            license_status="approved_public"
        )
        ingest_rows(self.db, [doae_obs])

        with tempfile.TemporaryDirectory() as directory:
            snapshot, metadata = build_exports(self.db, directory, "2023-12")
            with (snapshot / "fact_data_coverage.csv").open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))

            self.assertEqual(len(rows), 77 * 16)
            # Validate every single coverage row against JSON contract
            for r in rows:
                contract_row = {
                    **r,
                    "actual_count": int(r["actual_count"]),
                    "expected_count": None,
                    "gap_count": None,
                    "latest_publication_date": r["latest_publication_date"] or None,
                    "latest_observation_date": r["latest_observation_date"] or None,
                    "missing_reason": r["missing_reason"] or None
                }
                validator.validate(contract_row)

            # Check DOAE in Bangkok (area 10) is AVAILABLE
            bkk_doae = next(r for r in rows if r["source_dataset_id"] == "doae" and r["area_code"] == "10")
            self.assertEqual(bkk_doae["status"], "AVAILABLE")
            self.assertEqual(bkk_doae["actual_count"], "1")
            self.assertEqual(bkk_doae["missing_reason"], "")

            # Check open_meteo has specific honest missing reason
            bkk_meteo = next(r for r in rows if r["source_dataset_id"] == "open_meteo" and r["area_code"] == "10")
            self.assertEqual(bkk_meteo["status"], "UNVERIFIED")
            self.assertEqual(bkk_meteo["data_grain"], "grid_point")
            self.assertIn("grid_point", bkk_meteo["coverage_note"])
            self.assertIn("not downscaled", bkk_meteo["missing_reason"])


if __name__ == "__main__":
    unittest.main()

