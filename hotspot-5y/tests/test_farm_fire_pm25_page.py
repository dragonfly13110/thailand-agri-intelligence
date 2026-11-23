"""Tests for the Farm-Fire × Wind × PM2.5 page builder and Atlas nav wiring."""

from __future__ import annotations

from datetime import date
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parents[1]
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from build_farm_fire_pm25_page import build_farm_fire_pm25_payload, write_farm_fire_pm25_page  # noqa: E402
from build_web_app import build_web_app  # noqa: E402


def _make_77_prov_db(db_path: Path) -> None:
    with duckdb.connect(str(db_path)) as con:
        con.execute("INSTALL spatial; LOAD spatial;")
        con.execute("CREATE TABLE dim_province (prov_code VARCHAR, prov_name_th VARCHAR, geom GEOMETRY);")
        con.execute("CREATE TABLE dim_amphoe (prov_code VARCHAR, amphoe_code VARCHAR, amphoe_name_th VARCHAR);")
        con.execute("CREATE TABLE air_quality_daily_77prov (prov_code VARCHAR, date DATE, pm25_mean DOUBLE);")
        con.execute("""
            CREATE TABLE hotspots (
                satellite VARCHAR, instrument VARCHAR, acq_date_th DATE, acq_date_utc DATE,
                acq_time_utc VARCHAR, year_th INTEGER, month_th INTEGER, latitude DOUBLE,
                longitude DOUBLE, hotspot_id VARCHAR, is_suspected_static BOOLEAN,
                prov_code VARCHAR, amphoe_code VARCHAR, amphoe_name_th VARCHAR, lu_name VARCHAR,
                lu_hp_name VARCHAR, re_royin VARCHAR
            );
        """)
        for i in range(1, 78):
            code = f"{i:02d}"
            x0, y0 = 98.0 + (i % 8) * 0.5, 13.0 + (i // 8) * 0.4
            wkt = f"POLYGON(({x0} {y0},{x0+0.2} {y0},{x0+0.2} {y0+0.2},{x0} {y0+0.2},{x0} {y0}))"
            con.execute("INSERT INTO dim_province VALUES (?, ?, ST_GeomFromText(?))", [code, f"จังหวัด{code}", wkt])
            con.execute("INSERT INTO dim_amphoe VALUES (?, ?, ?)", [code, f"{code}01", f"เมือง{code}"])
            con.execute("INSERT INTO air_quality_daily_77prov VALUES (?, DATE '2026-03-01', 25.0)", [code])
            con.execute(
                "INSERT INTO hotspots VALUES ('N','VIIRS',DATE '2026-02-01',DATE '2026-02-01','06:00',2026,2,?,?,'id_a'||?,false,?,?,'เมือง','พื้นที่เกษตร','นาข้าว','Central')",
                [y0 + 0.1, x0 + 0.1, i, code, f"{code}01"],
            )
            con.execute(
                "INSERT INTO hotspots VALUES ('N','VIIRS',DATE '2026-04-01',DATE '2026-04-01','06:00',2026,4,?,?,'id'||?,false,?,?,'เมือง','พื้นที่เกษตร','นาข้าว','Central')",
                [y0 + 0.1, x0 + 0.1, i, code, f"{code}01"],
            )


def _make_synthetic_analysis(path: Path) -> None:
    provinces_t2 = {}
    provinces_t1 = {}
    for i in range(1, 78):
        code = f"{i:02d}"
        is_suff = i <= 41
        provinces_t2[code] = {
            "stations_in_province": 2 if i != 77 else 0,
            "cross_province_outflow_stations": 1,
            "valid_days": 500,
            "clean_upwind_agri_days": 20 if is_suff else 3,
            "total_upwind_agri_days": 30,
            "clean_non_upwind_days": 15 if is_suff else 2,
            "clean_no_fire_days": 300,
            "cross_province_upwind_days": 5,
            "delta_vs_non_upwind_ug_m3": 0.8 if is_suff else None,
            "ci_low_vs_non_upwind": -0.2 if is_suff else None,
            "ci_high_vs_non_upwind": 1.8 if is_suff else None,
            "delta_vs_nofire_ug_m3": 1.5 if is_suff else None,
            "ci_low_vs_nofire": 0.4 if is_suff else None,
            "ci_high_vs_nofire": 2.6 if is_suff else None,
            "sufficiency_status": "sufficient" if is_suff else "insufficient_confounded",
            "clean_2024_2025_delta_vs_non_upwind": 1.1 if is_suff else None,
            "clean_2024_2025_delta_vs_nofire": 2.3 if is_suff else None,
            "clean_2024_2025_days": 15 if is_suff else 2,
        }
        provinces_t1[code] = {
            "stations_in_province": 2 if i != 77 else 0,
            "cross_province_outflow_stations": 1,
            "valid_hours": 1000,
            "clean_upwind_agri_hours": 15 if is_suff else 0,
            "total_upwind_agri_hours": 20,
            "cross_province_upwind_hours": 10,
            "delta_vs_nofire_ug_m3": 1.2 if is_suff else None,
            "ci_low_vs_nofire": 0.1 if is_suff else None,
            "ci_high_vs_nofire": 2.3 if is_suff else None,
            "delta_vs_non_upwind_ug_m3": 1.4 if is_suff else None,
            "sufficiency_status": "sufficient" if is_suff else "insufficient_clean_events",
        }
    reg_block = {
        "stations": 180, "valid_days": 50000, "clean_upwind_agri_days": 1366,
        "total_upwind_agri_days": 3000, "clean_non_upwind_days": 900,
        "clean_no_fire_days": 30000, "cross_province_upwind_days": 700,
        "delta_vs_non_upwind_ug_m3": 0.53, "ci_low_vs_non_upwind": -0.64, "ci_high_vs_non_upwind": 1.80,
        "delta_vs_nofire_ug_m3": 1.46, "ci_low_vs_nofire": 0.50, "ci_high_vs_nofire": 2.40,
        "sufficiency_status": "sufficient",
    }
    regions_t2 = {
        sc: {"stations": 30, "all_2024_2026h1": reg_block, "clean_2024_2025_with_tb_exclusion": reg_block, "h1_2026_no_tb_data": reg_block}
        for sc in ("National", "North", "Northeast", "Central", "East", "West", "South")
    }
    regions_t1 = {
        sc: {
            "stations": 30, "valid_hours": 5000, "clean_upwind_agri_hours": 2991,
            "total_upwind_agri_hours": 4000, "clean_non_upwind_hours": 1500,
            "cross_province_upwind_hours": 2256,
            "delta_vs_non_upwind_ug_m3": 1.66, "ci_low_vs_non_upwind": 0.04, "ci_high_vs_non_upwind": 3.70,
            "delta_vs_nofire_ug_m3": 1.10, "ci_low_vs_nofire": 0.10, "ci_high_vs_nofire": 2.10,
            "sufficiency_status": "sufficient",
        }
        for sc in ("National", "North", "Northeast", "Central", "East", "West", "South")
    }
    payload = {
        "generated_at_utc": "2026-11-22T16:00:00Z",
        "methodology": {},
        "station_coverage": {
            "total_stations": 180,
            "provinces_with_in_province_station": 74,
            "provinces_without_in_province_station": [{"prov_code": "77", "prov_name_th": "จังหวัด77"}],
        },
        "track1_hourly": {
            "window": "2026-09-01..2026-11-17",
            "satellites_primary": ["N", "N20", "N21"],
            "before_after_episode_jump": {"n_episodes": 672, "mean_jump_ug_m3": 0.81, "ci_low": 0.33, "ci_high": 1.67},
            "anemometer_era5_agreement": {"n_hours_both_windy": 96603, "median_angular_diff_deg": 39.0, "pct_within_45deg": 55.2},
            "regions": regions_t1,
            "provinces": provinces_t1,
        },
        "track2_daily": {
            "window": "2024-01-01..2026-06-30",
            "fixed_effects_2024_2025": {
                "n_obs": 50933,
                "covariates": [
                    "ln_1p_upwind_agri_50km",
                    "ln_1p_non_upwind_agri_50km",
                    "ln_1p_upwind_forest_80km",
                    "ln_1p_upwind_spk_50km",
                    "ln_1p_upwind_transboundary_250km",
                ],
                "beta": [1.06, 0.1, 4.75, 0.5, 1.18],
                "ci_low": [-0.14, -0.2, 2.04, 0.0, 0.28],
                "ci_high": [2.25, 0.4, 7.28, 1.0, 1.93],
            },
            "regions": regions_t2,
            "provinces": provinces_t2,
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class FarmFirePm25PageTests(unittest.TestCase):
    def test_payload_has_77_provinces_and_preserves_nulls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            db_path = tmp_dir / "test.duckdb"
            json_path = tmp_dir / "analysis.json"
            out_html = tmp_dir / "farm-fire-pm25.html"
            _make_77_prov_db(db_path)
            _make_synthetic_analysis(json_path)
            with duckdb.connect(str(db_path)) as conn:
                conn.execute("""
                    INSERT INTO hotspots
                    SELECT satellite, instrument, acq_date_th, acq_date_utc, '07:00',
                           year_th, month_th, latitude, longitude, 'mixed_cane',
                           is_suspected_static, prov_code, amphoe_code, amphoe_name_th,
                           lu_name, 'อ้อย', re_royin
                    FROM hotspots WHERE hotspot_id = 'id_a1'
                """)

            payload = build_farm_fire_pm25_payload(db_path, json_path)
            self.assertEqual(len(payload["provinces"]), 77)
            self.assertEqual(len({p[0] for p in payload["provinces"]}), 77)
            self.assertIsNone(payload["track2_daily"]["provinces"]["42"]["delta_vs_nofire_ug_m3"])
            self.assertIn("daily_sim_gz", payload)

            import base64, gzip
            sim = json.loads(gzip.decompress(base64.b64decode(payload["daily_sim_gz"])).decode("utf-8"))
            self.assertEqual(sim["start_date"], "2023-01-01")
            self.assertEqual(sim["end_date"], "2026-11-17")
            self.assertEqual(len(sim["pm25"]), 77)
            self.assertGreaterEqual(len(sim["amphoes"]), 77)
            self.assertGreater(len(sim["fires"]), 0)
            february_1 = sim["fires"][str((date(2026, 2, 1) - date(2023, 1, 1)).days)]
            self.assertEqual(february_1[:8], [0, 2, 0, 0, 0, 1, 1, 0])

            write_farm_fire_pm25_page(db_path, json_path, out_html)
            html_text = out_html.read_text(encoding="utf-8")
            self.assertIn("./farm-fire-pm25.html", html_text)
            self.assertIn("smokeCanvas", html_text)
            self.assertIn("staircase-card", html_text)
            self.assertIn("burn-type-panel", html_text)
            self.assertIn('id="historyThai" type="checkbox" aria-controls=', html_text)
            self.assertIn('id="historyNeighbors" type="checkbox" aria-controls=', html_text)
            self.assertIn('id="historyPointsCanvas" aria-hidden="true" hidden', html_text)
            self.assertIn("th_points_exact.bin.gz", html_text)
            self.assertIn("gms_points_exact.bin.gz", html_text)
            self.assertNotIn("__HOTSPOT_POINT_BASE_URL__", html_text)
            self.assertIn("2026-03-20", html_text)
            self.assertNotIn("__FARM_FIRE_DATA__", html_text)

            node = shutil.which("node")
            if node:
                scripts = re.findall(r"<script(?![^>]*type=)[^>]*>([\s\S]*?)</script>", html_text)
                self.assertGreaterEqual(len(scripts), 1)
                js_path = tmp_dir / "check.js"
                js_path.write_text("\n".join(scripts), encoding="utf-8")
                subprocess.run([node, "--check", str(js_path)], check=True)

    def test_build_web_app_wires_farm_fire_nav_when_analysis_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            db_path = tmp_dir / "test.duckdb"
            json_path = tmp_dir / "analysis.json"
            out_dir = tmp_dir / "web_app"
            _make_77_prov_db(db_path)
            _make_synthetic_analysis(json_path)

            index_path = build_web_app(
                hf_repo="example/atlas-data", out_dir=out_dir, database=db_path, analysis_json=json_path,
            )
            farm_page = (out_dir / "farm-fire-pm25.html").read_text(encoding="utf-8")
            self.assertIn("https://huggingface.co/datasets/example/atlas-data/resolve/main/summary/", farm_page)
            self.assertIn("./farm-fire-pm25.html", index_path.read_text(encoding="utf-8"))
            self.assertIn("./farm-fire-pm25.html", (out_dir / "area-insights.html").read_text(encoding="utf-8"))
            guide = (out_dir / "guide.html").read_text(encoding="utf-8")
            self.assertIn("<h1>คู่มือใช้งาน</h1>", guide)
            self.assertNotIn("__ATLAS_THEME_CSS__", guide)
            for path in ("#overview", "#map", "#weather", "#haze", "#burnscar", "#explorer", "farm-fire-pm25.html"):
                self.assertIn(f'href="./{path}"', guide)
            for page in (index_path, out_dir / "area-insights.html", out_dir / "fire-pm-map.html", out_dir / "farm-fire-pm25.html"):
                page_html = page.read_text(encoding="utf-8")
                self.assertIn('href="./guide.html"', page_html)
                self.assertNotIn('href="./area-insights.html"', page_html)
                self.assertNotIn('href="./fire-pm-map.html"', page_html)


if __name__ == "__main__":
    unittest.main()
