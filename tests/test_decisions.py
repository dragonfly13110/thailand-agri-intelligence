"""Synthetic fixtures only; these values do not describe real Thai conditions."""

import copy
import unittest

from tadih.decisions import evaluate_market, evaluate_water_risk


def metric(value, **extra):
    return {"value": value, "unit": "fraction", "source_id": "synthetic", "source_url": "https://example.test/data", "definition": "synthetic comparable series", "observed_at": "2026-10-21", "release_at": "2026-10-21", "area_code": "10", "admin_level": "province", **extra}


def water():
    return {"area_code": "10", "admin_level": "province", "commodity_id": "rice", "evaluated_at": "2026-10-22", "observations": {"rain_percentile": metric(0.1, reference_years=5), "ndvi_valid_fraction": metric(0.8), "water_level": metric(2, unit="m")}}


def market():
    result = water()
    common = {"commodity_id": "rice", "season": "wet", "unit": "THB/kg", "market_id": "synthetic", "price_type": "farm_gate", "grade": "A"}
    result["observations"] = {"current_price": metric(12, **common), "reference_price": metric(10, **common, observed_at="2025-10-21", release_at="2025-10-22"), "current_production": metric(50, unit="ton", commodity_id="rice", season="wet"), "reference_production": metric(100, unit="ton", commodity_id="rice", season="wet", observed_at="2025-10-21", release_at="2025-10-22")}
    return result


class DecisionTests(unittest.TestCase):
    def test_empty_evidence_unknown(self):
        self.assertEqual(evaluate_water_risk({})["status"], "unknown")
        self.assertEqual(evaluate_market({})["status"], "unknown")
        self.assertEqual(evaluate_water_risk({})["decision_id"], "D02")
        self.assertEqual(evaluate_market({})["decision_id"], "D01")

    def test_zero_is_valid_rain_percentile(self):
        data = water()
        data["observations"]["rain_percentile"]["value"] = 0
        self.assertEqual(evaluate_water_risk(data)["status"], "watch")

    def test_normal_status_when_rain_sufficient(self):
        data = water()
        data["observations"]["rain_percentile"]["value"] = 0.5
        result = evaluate_water_risk(data)
        self.assertEqual(result["status"], "normal")
        self.assertEqual(result["classification"], "Derived Indicator")
        self.assertIn("no_provisional_low_rain_signal", result["reasons"])

    def test_missing_does_not_become_zero(self):
        data = water()
        data["observations"]["rain_percentile"]["value"] = None
        self.assertEqual(evaluate_water_risk(data)["status"], "unknown")

    def test_stale_and_future_and_spatial_mismatch(self):
        for change in ({"observed_at": "2026-09-01"}, {"release_at": "2026-10-23"}, {"admin_level": "station"}, {"area_code": "11"}):
            with self.subTest(change=change):
                data = water()
                data["observations"]["rain_percentile"].update(change)
                self.assertEqual(evaluate_water_risk(data)["status"], "unknown")

    def test_short_baseline_unknown(self):
        data = water()
        data["observations"]["rain_percentile"]["reference_years"] = 2
        self.assertEqual(evaluate_water_risk(data)["status"], "unknown")

    def test_clouds_require_unknown_not_damage(self):
        data = water()
        data["observations"]["ndvi_valid_fraction"]["value"] = 0.1
        result = evaluate_water_risk(data)
        self.assertEqual(result["status"], "unknown")
        self.assertFalse(result["automatic_action"])

    def test_malformed_inputs_fail_closed(self):
        for data in (None, [], {"observations": None}, {**water(), "observations": {"rain_percentile": 4}}):
            with self.subTest(data=data):
                self.assertEqual(evaluate_water_risk(data)["status"], "unknown")
                self.assertEqual(evaluate_market(data)["status"], "unknown")

    def test_bad_reference_years_and_naive_datetime_fail_closed(self):
        data = water()
        data["observations"]["rain_percentile"]["reference_years"] = "five"
        self.assertEqual(evaluate_water_risk(data)["status"], "unknown")
        data = water()
        data["evaluated_at"] = "2026-10-22T12:00:00"
        self.assertEqual(evaluate_water_risk(data)["status"], "unknown")

    def test_malformed_provenance_links_fail_closed(self):
        for link in (1, "javascript:alert(1)", "https://token@example.test/data"):
            data = water()
            data["observations"]["rain_percentile"]["source_url"] = link
            self.assertEqual(evaluate_water_risk(data)["status"], "unknown")

    def test_market_change_preserves_provenance(self):
        result = evaluate_market(market())
        self.assertEqual(result["status"], "watch")
        self.assertEqual(result["indicators"]["production_change_fraction"], -0.5)
        self.assertEqual(result["evidence"]["current_price"]["source_id"], "synthetic")

    def test_incompatible_price_or_production_unknown(self):
        for metric_name, change in (("reference_price", {"price_type": "retail"}), ("reference_price", {"grade": "B"}), ("reference_price", {"unit": "THB/ton"}), ("reference_production", {"season": "dry"})):
            with self.subTest(change=change):
                data = market()
                data["observations"][metric_name].update(change)
                self.assertEqual(evaluate_market(data)["status"], "unknown")

    def test_zero_reference_not_infinite_change(self):
        data = market()
        data["observations"]["reference_price"]["value"] = 0
        result = evaluate_market(data)
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(result["indicators"], {})

    def test_spatial_grain_mismatch_for_market(self):
        data = market()
        data["observations"]["current_price"]["admin_level"] = "national"
        data["observations"]["current_price"]["area_code"] = "TH"
        result = evaluate_market(data)
        self.assertEqual(result["status"], "unknown")
        self.assertIn("incompatible_spatial_grain:current_price", result["reasons"])

    def test_market_normal_status_when_changes_small(self):
        data = market()
        data["observations"]["current_price"]["value"] = 10.5
        data["observations"]["current_production"]["value"] = 98.0
        result = evaluate_market(data)
        self.assertEqual(result["status"], "normal")
        self.assertEqual(result["classification"], "Derived Indicator")
        self.assertIn("no_provisional_change_signal", result["reasons"])

    def test_input_unchanged(self):
        data = water()
        before = copy.deepcopy(data)
        evaluate_water_risk(data)
        self.assertEqual(data, before)


if __name__ == "__main__":
    unittest.main()
