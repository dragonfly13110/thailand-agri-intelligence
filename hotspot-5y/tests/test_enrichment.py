"""Unit tests for PM2.5 Air Quality, NASA POWER Soil, Transboundary FIRMS, DOAE Crops, and Atlas v3 UI."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parents[1]
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from download_air_quality import aggregate_aq_monthly, aggregate_aq_province_daily  # noqa: E402
from download_nasa_power import clean_nasa_value, parse_nasa_power_province  # noqa: E402
from ingest_agri_water import classify_fire_crop_group, parse_thai_num  # noqa: E402
from map_data import build_map_payload  # noqa: E402
from map_template import render_interactive_html, render_online_web_html  # noqa: E402
from tests.test_interactive_map import _create_synthetic_sources  # noqa: E402


class EnrichmentPipelineTests(unittest.TestCase):
    def test_air_quality_aggregation_and_exceedance_thresholds(self) -> None:
        hourly = {
            "time": [
                "2026-03-01T00:00", "2026-03-01T01:00", "2026-03-01T02:00",
                "2026-03-02T00:00", "2026-03-02T01:00",
                "2026-03-03T00:00",
            ],
            "pm2_5": [40.0, 80.0, 20.0, 18.0, 16.0, None],
            "pm10": [55.0, 95.0, 30.0, 25.0, 22.0, None],
            "carbon_monoxide": [900.0, 1500.0, 600.0, 400.0, 300.0, None],
            "nitrogen_dioxide": [12.0, 18.0, 10.0, 8.0, 7.0, None],
            "aerosol_optical_depth": [0.5, 0.9, 0.3, 0.2, 0.2, None],
            "dust": [5.0, 7.0, 3.0, 2.0, 2.0, None],
            "us_aqi": [110, 165, 65, 60, 55, None],
        }
        daily = aggregate_aq_province_daily("50", hourly)
        self.assertEqual(len(daily), 2)  # 2026-03-03 is all-None and must be omitted, never 0
        self.assertAlmostEqual(daily[0]["pm25_mean"], 46.67, places=2)
        self.assertEqual(daily[0]["hours_gt_37_5"], 2)
        self.assertEqual(daily[0]["hours_gt_75"], 1)
        self.assertEqual(daily[1]["hours_gt_37_5"], 0)

        monthly = aggregate_aq_monthly(daily)
        self.assertEqual(len(monthly), 1)
        self.assertEqual(monthly[0]["days_exceed_37_5"], 1)  # only Mar 1 > 37.5
        self.assertEqual(monthly[0]["days_exceed_15_who"], 2)  # Mar 1 & Mar 2 > 15.0

    def test_nasa_power_sentinel_converted_to_null(self) -> None:
        self.assertIsNone(clean_nasa_value(-999.0))
        self.assertIsNone(clean_nasa_value(-999))
        self.assertAlmostEqual(clean_nasa_value(0.42), 0.42)

        payload = {
            "properties": {
                "parameter": {
                    "GWETTOP": {"20260301": 0.31, "20260302": -999.0},
                    "GWETROOT": {"20260301": 0.48, "20260302": -999.0},
                    "ALLSKY_SFC_SW_DWN": {"20260301": 21.4, "20260302": -999.0},
                    "T2MDEW": {"20260301": 14.5, "20260302": -999.0},
                    "WS10M": {"20260301": 2.8, "20260302": -999.0},
                }
            }
        }
        rows = parse_nasa_power_province("50", payload)
        self.assertEqual(len(rows), 2)
        self.assertAlmostEqual(rows[0]["gwettop"], 0.31)
        self.assertIsNone(rows[1]["gwettop"])
        self.assertIsNone(rows[1]["solar_mj"])

    def test_doae_parsers_and_crop_classification(self) -> None:
        self.assertIsNone(parse_thai_num(" -   "))
        self.assertIsNone(parse_thai_num(""))
        self.assertAlmostEqual(parse_thai_num(" 12,345.50 "), 12345.5)
        self.assertEqual(classify_fire_crop_group("ข้าวนาปี"), "paddy")
        self.assertEqual(classify_fire_crop_group("อ้อยโรงงาน"), "sugarcane")
        self.assertEqual(classify_fire_crop_group("ข้าวโพดเลี้ยงสัตว์"), "corn")
        self.assertEqual(classify_fire_crop_group("มันสำปะหลังโรงงาน"), "cassava")
        self.assertEqual(classify_fire_crop_group("ข้าวฟ่างเลี้ยงสัตว์"), "other")

    def test_build_map_payload_with_enriched_tables_and_null_preservation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path, era5_path, tadih_path = _create_synthetic_sources(Path(tmp), include_tadih=True)
            con = duckdb.connect(str(db_path))
            con.execute("""
                CREATE TABLE air_quality_monthly_77prov (
                    prov_code VARCHAR, year_th INTEGER, month_th INTEGER, ym VARCHAR, days_count INTEGER,
                    pm25_mean DOUBLE, pm25_p90 DOUBLE, pm25_max DOUBLE, pm10_mean DOUBLE, co_mean DOUBLE,
                    no2_mean DOUBLE, aod_mean DOUBLE, dust_mean DOUBLE, us_aqi_max INTEGER,
                    days_exceed_37_5 INTEGER, days_exceed_15_who INTEGER
                );
                INSERT INTO air_quality_monthly_77prov VALUES
                ('50', 2026, 3, '2026-03', 31, 48.2, 72.0, 96.5, 68.0, 1180.0, 12.0, 0.65, 4.0, 170, 19, 30);

                CREATE TABLE nasa_power_soil_monthly (
                    prov_code VARCHAR, year_th INTEGER, month_th INTEGER, ym VARCHAR, days_count INTEGER,
                    gwettop_mean DOUBLE, gwettop_min DOUBLE, gwetroot_mean DOUBLE, gwetroot_min DOUBLE,
                    solar_mj_mean DOUBLE, dewpoint_c_mean DOUBLE, dry_soil_days_lt_035 INTEGER
                );
                INSERT INTO nasa_power_soil_monthly VALUES
                ('50', 2026, 3, '2026-03', 31, 0.295, 0.240, 0.420, 0.390, 21.8, 13.5, 25);

                CREATE TABLE doae_fire_crops_province (
                    prov_code VARCHAR, prov_name_th VARCHAR, source_year_be INTEGER,
                    paddy_rai DOUBLE, sugarcane_rai DOUBLE, corn_rai DOUBLE, cassava_rai DOUBLE, all_short_rai DOUBLE
                );
                INSERT INTO doae_fire_crops_province VALUES
                ('50', 'เชียงใหม่', 2566, 400000, 10000, 250000, 12000, 700000),
                ('83', 'ภูเก็ต', 2566, NULL, NULL, NULL, NULL, 500);

                CREATE TABLE transboundary_monthly (
                    country VARCHAR, year_th INTEGER, month_th INTEGER, ym VARCHAR,
                    hotspot_count INTEGER, high_conf_count INTEGER, day_count INTEGER,
                    frp_sum_mw DOUBLE, frp_avg_mw DOUBLE
                );
                INSERT INTO transboundary_monthly VALUES
                ('Myanmar', 2024, 3, '2024-03', 32000, 4100, 28000, 185000.0, 5.78),
                ('Thailand', 2024, 3, '2024-03', 14000, 1800, 12000, 74000.0, 5.29);

                CREATE TABLE rid_reservoirs_monthly (
                    snapshot_date DATE, year_th INTEGER, month_th INTEGER, ym VARCHAR,
                    region VARCHAR, reservoir_id VARCHAR, reservoir_name VARCHAR,
                    storage_mcm DOUBLE, dead_storage_mcm DOUBLE, volume_mcm DOUBLE,
                    percent_storage DOUBLE, inflow DOUBLE, outflow DOUBLE
                );
                INSERT INTO rid_reservoirs_monthly VALUES
                (DATE '2026-03-01', 2026, 3, '2026-03', 'ภาคเหนือ', 'r1', 'อ่างทดสอบ', 100.0, 5.0, 62.0, 62.0, 0.2, 0.5);

                CREATE TABLE gistda_pm25_snapshot (
                    prov_code VARCHAR, prov_name_th VARCHAR, pm25 DOUBLE, pm25_avg_24hr DOUBLE, dt_utc VARCHAR
                );
                INSERT INTO gistda_pm25_snapshot VALUES ('50', 'เชียงใหม่', 28.4, 24.1, '2026-11-19T21:00:00Z');
            """)
            con.close()

            payload = build_map_payload(db_path, era5_path, tadih_path)
            provs = {p["code"]: p for p in payload["provinces"]}
            self.assertAlmostEqual(provs["50"]["aq_y"]["2026"]["pm25_peak"], 48.2)
            self.assertAlmostEqual(provs["50"]["soil_y"]["2026"]["gwettop_peak"], 0.295)
            self.assertEqual(provs["50"]["doae_2566"]["corn_rai"], 250000)
            self.assertIsNone(provs["83"]["trp"])
            self.assertIsNone(provs["83"]["doae_2566"]["paddy_rai"])
            self.assertIsNotNone(payload["transboundary"])
            self.assertEqual(payload["transboundary"]["countries"]["Myanmar"]["yearly"]["2024"]["hs"], 32000)
            self.assertEqual(payload["rid_monthly"]["regions"]["ภาคเหนือ"], [62.0])

            # Check both online and offline HTML output parse cleanly in node --check
            for html_text in (
                render_interactive_html(payload),
                render_online_web_html("dragonfly13110/thailand-hotspot-5y"),
            ):
                self.assertIn('id="page-haze"', html_text)
                self.assertIn('value="aq_pm25"', html_text)
                self.assertIn('value="soil_wet"', html_text)
                self.assertIn('value="soil_dry_streak"', html_text)
                self.assertIn('value="doae_plant_rai"', html_text)
                self.assertIn('value="burn_rate_agri"', html_text)
                self.assertIn('id="showPointsCheck"', html_text)
                self.assertIn('id="thPointsFilterPanel"', html_text)
                self.assertIn('id="ptColorModeSelect"', html_text)
                self.assertIn('id="ptYearChips"', html_text)
                self.assertIn('id="ptTypeChips"', html_text)
                self.assertIn('id="ptThViewCount"', html_text)
                self.assertIn('id="showTransPointsCheck"', html_text)
                self.assertIn('id="gmsPointsFilterPanel"', html_text)
                self.assertIn('id="ptGmsViewCount"', html_text)
                self.assertIn('id="showLive7dCheck"', html_text)
                self.assertIn('id="gistdaWmsSelect"', html_text)
                self.assertIn('id="wxFcSourceToggle"', html_text)
                self.assertIn('id="hzBurnLevelToggle"', html_text)
                self.assertNotIn("<!--__HAZE_PAGE__-->", html_text)
                script_body = html_text.split('<script id="payloadB64" type="text/plain">', 1)[1].split("<script>\n", 1)[1].rsplit("</script>", 1)[0]
                node_exe = shutil.which("node")
                if node_exe:
                    js_file = Path(tmp) / "atlas_v3_check.js"
                    js_file.write_text(script_body, encoding="utf-8")
                    res = subprocess.run([node_exe, "--check", str(js_file)], capture_output=True, text=True)
                    self.assertEqual(res.returncode, 0, res.stderr)


if __name__ == "__main__":
    unittest.main()
