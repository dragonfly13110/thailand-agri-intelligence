"""Synthetic daily series only. No fixture is an official observation."""

import unittest
from datetime import date, timedelta

from tadih.forecast import available_history, backtest, forecast


def series(count=110, value=10):
    return [{"observed_at": (date(2025, 1, 1) + timedelta(days=index)).isoformat(), "release_at": (date(2025, 1, 1) + timedelta(days=index)).isoformat(), "value": value, "source_id": "synthetic", "unit": "THB/kg", "series_id": "synthetic-rice-market", "revision_id": "first", "data_kind": "observed"} for index in range(count)]


class ForecastTests(unittest.TestCase):
    def test_unavailable_late_revision_excluded(self):
        rows = series(2)
        rows.append({**rows[0], "release_at": "2025-02-01", "value": 999, "revision_id": "revised"})
        self.assertEqual(available_history(rows, "2025-01-05")[0]["value"], 10)
        self.assertEqual(available_history(rows, "2025-02-01")[0]["value"], 999)

    def test_observed_future_excluded(self):
        self.assertEqual(len(available_history(series(3), "2025-01-02")), 2)

    def test_missing_revision_does_not_restore_old_value(self):
        rows = series(2)
        rows.append({**rows[0], "release_at": "2025-01-03", "value": None})
        self.assertIsNone(available_history(rows, "2025-01-04")[0]["value"])

    def test_ambiguous_revisions_rejected(self):
        rows = series(2)
        rows.append({**rows[0], "value": 999})
        with self.assertRaises(ValueError):
            available_history(rows, "2025-01-05")

    def test_short_or_empty_history_suppresses(self):
        for rows in ([], series(2)):
            result = forecast(rows, "2025-01-03")
            self.assertEqual(result["status"], "suppressed")
            self.assertIsNone(result["point_estimate"])

    def test_zero_values_valid_and_constant_baseline_eligible(self):
        result = forecast(series(value=0), "2025-04-20")
        self.assertEqual(result["status"], "eligible")
        self.assertEqual(result["point_estimate"], 0)
        self.assertIsNone(result["backtest_score"]["metrics"]["wape"])

    def test_missing_or_stale_daily_series_suppressed(self):
        rows = series()
        for row in rows[::2]:
            row["value"] = None
        self.assertEqual(forecast(rows, "2025-04-20")["reason"], "missing_rate_exceeded")
        self.assertEqual(forecast(series(), "2026-04-20")["reason"], "missing_rate_exceeded")

    def test_mixed_units_and_market_types_rejected(self):
        for key, value in (("unit", "THB/ton"), ("price_type", "retail"), ("series_id", "another")):
            rows = series()
            rows[-1][key] = value
            with self.assertRaises(ValueError):
                forecast(rows, "2025-04-20")

    def test_temporal_leakage_does_not_change_past_forecast(self):
        rows = series()
        original = forecast(rows, "2025-04-20")
        revised = [{**row, "release_at": "2026-01-01", "value": 999, "revision_id": "late"} for row in rows]
        self.assertEqual(forecast(rows + revised, "2025-04-20"), original)

    def test_backtest_uses_first_published_actual(self):
        rows = series()
        revisions = [{**row, "release_at": "2026-01-01", "value": 999, "revision_id": "late"} for row in rows]
        report = backtest(rows + revisions, as_of="2025-04-20")
        self.assertTrue(report["folds"])
        self.assertTrue(all(row["actual"] == 10 for row in report["folds"]))

    def test_interval_failure_suppresses(self):
        rows = series()
        for index, row in enumerate(rows):
            if index > 70:
                row["value"] = index * 20
        result = forecast(rows, "2025-04-20")
        self.assertEqual(result["status"], "suppressed")
        self.assertIn(result["reason"], {"interval_calibration_failed", "worse_than_baseline"})

    def test_unsupported_horizon(self):
        with self.assertRaises(ValueError):
            forecast(series(), "2025-04-20", horizon_days=1)

    def test_calibration_is_available_before_verification_issue(self):
        report = backtest(series())
        self.assertLessEqual(report["calibration_latest_release_at"], report["verification_first_issue_at"])

    def test_unknown_release_nonfinite_and_forecast_records_rejected(self):
        for change in ({"release_at": None}, {"value": float("nan")}, {"value": float("inf")}, {"data_kind": "forecast"}, {"release_at": "2025-01-01T12:00:00"}):
            rows = series()
            rows[0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                forecast(rows, "2025-04-20")

    # --- Monthly Forecast & Backtest Tests ---

    def test_monthly_series_constant_baseline_eligible(self):
        from tadih.forecast import monthly_available_history, monthly_backtest, monthly_forecast
        rows = self._monthly_series(count=48, value=15.0)
        result = monthly_forecast(rows, "2024-12-31T00:00:00Z", horizon_months=1)
        self.assertEqual(result["status"], "eligible")
        self.assertEqual(result["point_estimate"], 15.0)
        self.assertAlmostEqual(result["p10"], 15.0, places=2)
        self.assertAlmostEqual(result["p90"], 15.0, places=2)

    def test_monthly_series_seasonal_naive_champion(self):
        import math
        from tadih.forecast import monthly_backtest
        # Seasonal wave repeating every 12 months: 10 + 5 * sin(2 * pi * month / 12)
        rows = self._monthly_series(count=60, value=lambda idx: round(10.0 + 5.0 * math.sin(2 * math.pi * (idx % 12) / 12), 2))
        report = monthly_backtest(rows, horizon_months=1)
        self.assertEqual(report["status"], "eligible")
        self.assertEqual(report["model_id"], "seasonal_naive")
        # Seasonal naive should outperform standard naive (last_value)
        self.assertLess(report["metrics"]["mae"], report["baseline_metrics"]["mae"])

    def test_monthly_series_missing_release_suppressed(self):
        from tadih.forecast import monthly_forecast
        rows = self._monthly_series(count=48, value=15.0)
        rows[10]["release_at"] = None
        result = monthly_forecast(rows, "2024-12-31T00:00:00Z")
        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["reason"], "unverified_release_dates")

    def test_monthly_series_insufficient_history(self):
        from tadih.forecast import monthly_forecast
        rows = self._monthly_series(count=12, value=15.0)
        result = monthly_forecast(rows, "2021-12-31T00:00:00Z")
        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["reason"], "insufficient_history")

    def test_monthly_series_missing_rate_exceeded(self):
        from tadih.forecast import monthly_forecast
        rows = self._monthly_series(count=48, value=15.0)
        for i in range(0, 48, 5):  # 20% missing
            rows[i]["value"] = None
        result = monthly_forecast(rows, "2024-12-31T00:00:00Z")
        self.assertEqual(result["status"], "suppressed")
        self.assertEqual(result["reason"], "missing_rate_exceeded")

    def test_monthly_unsupported_horizon(self):
        from tadih.forecast import monthly_forecast
        rows = self._monthly_series(count=48, value=15.0)
        with self.assertRaises(ValueError):
            monthly_forecast(rows, "2024-12-31T00:00:00Z", horizon_months=2)

    def _monthly_series(self, count=48, value=10.0):
        rows = []
        for index in range(count):
            year = 2021 + index // 12
            month = (index % 12) + 1
            obs_str = f"{year:04d}-{month:02d}-01T00:00:00Z"
            rel_year = year if month < 12 else year + 1
            rel_month = month + 1 if month < 12 else 1
            rel_str = f"{rel_year:04d}-{rel_month:02d}-15T00:00:00Z"
            val = value(index) if callable(value) else value
            rows.append({
                "observed_at": obs_str, "release_at": rel_str, "value": val,
                "source_id": "synthetic", "unit": "THB/kg", "series_id": "synthetic-rice-monthly",
                "revision_id": "r1", "data_kind": "observed",
            })
        return rows


if __name__ == "__main__":
    unittest.main()
