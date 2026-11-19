"""Unit tests for Open-Meteo ERA5 fire-weather aggregation & DuckDB ingestion."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parents[1]
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from download_weather import (  # noqa: E402
    aggregate_province_monthly,
    compute_fire_weather_index,
    ingest_weather_to_duckdb,
)


class FireWeatherTests(unittest.TestCase):
    def test_fwi_increases_with_heat_dryness_and_wind(self) -> None:
        hot_dry = compute_fire_weather_index(38.0, 22.0, 18.0, 0.95, 5.8)
        cool_wet = compute_fire_weather_index(28.0, 65.0, 8.0, 0.15, 3.0)
        self.assertIsNotNone(hot_dry)
        self.assertIsNotNone(cool_wet)
        self.assertGreater(hot_dry, 75.0)
        self.assertLess(cool_wet, 25.0)
        self.assertIsNone(compute_fire_weather_index(None, 40.0, 10.0, 0.5, 4.0))

    def test_aggregate_monthly_and_ingest_duckdb(self) -> None:
        prov = {"prov_code": "50", "name_en": "Chiang Mai", "region": "north", "lat": 18.79, "lon": 98.99}
        daily = {
            "time": ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-04-01"],
            "temperature_2m_max": [36.0, 39.0, 38.5, 35.0, 34.0],
            "temperature_2m_mean": [28.0, 30.0, 29.5, 27.5, 27.0],
            "precipitation_sum": [0.0, 0.2, 0.0, 12.5, 0.0],
            "wind_speed_10m_max": [14.0, 16.0, 12.0, 10.0, 11.0],
            "et0_fao_evapotranspiration": [5.2, 5.8, 5.5, 4.1, 4.8],
            "relative_humidity_2m_mean": [45.0, 40.0, 42.0, 62.0, 50.0],
            "relative_humidity_2m_min": [28.0, 22.0, 25.0, 48.0, 32.0],
        }
        rows = aggregate_province_monthly(prov, daily)
        self.assertEqual(len(rows), 2)
        mar = rows[0]
        self.assertEqual(mar["ym"], "2026-03")
        self.assertEqual(mar["hot_days_35c"], 4)
        self.assertEqual(mar["hot_days_38c"], 2)
        self.assertEqual(mar["dry_days"], 3)
        self.assertEqual(mar["longest_dry_spell_days"], 3)
        self.assertEqual(mar["low_rh_days_35pct"], 3)
        self.assertAlmostEqual(mar["rain_mm"], 12.7)
        self.assertGreater(mar["fire_weather_index"], 60.0)

        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "test.duckdb"
            ingest_weather_to_duckdb(rows, db_path=db_path)
            con = duckdb.connect(str(db_path), read_only=True)
            cnt = con.execute("SELECT count(*) FROM era5_monthly_fire_weather").fetchone()[0]
            ann = con.execute("SELECT peak_season_fwi, low_rh_days_35pct FROM v_era5_annual_fire_weather WHERE prov_code='50' AND year_th=2026").fetchone()
            con.close()
            self.assertEqual(cnt, 2)
            self.assertIsNotNone(ann[0])
            self.assertEqual(ann[1], 4)


if __name__ == "__main__":
    unittest.main()
