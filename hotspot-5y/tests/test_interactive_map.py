"""Offline TDD tests for the multi-factor interactive hotspot map generator."""

from __future__ import annotations

import base64
import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parents[1]
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from build_admin_boundaries import write_admin_boundaries  # noqa: E402
from build_interactive_map import build_interactive_map  # noqa: E402
from map_data import build_map_payload, encode_payload_b64, load_tamroypao_monthly, pack_flags, unpack_flags  # noqa: E402
from map_template import render_interactive_html, render_online_web_html  # noqa: E402


def _create_synthetic_sources(root: Path, *, include_tadih: bool = True) -> tuple[Path, Path, Path | None]:
    db_path = root / "hotspot_5y.duckdb"
    era5_path = root / "era5.json"
    tadih_path = root / "tadih.duckdb" if include_tadih else None

    con = duckdb.connect(str(db_path))
    con.execute("LOAD spatial;")
    con.execute("""
        CREATE TABLE dim_province (
            prov_code VARCHAR, prov_name_th VARCHAR, prov_name_en VARCHAR,
            min_lon DOUBLE, max_lon DOUBLE, min_lat DOUBLE, max_lat DOUBLE, geom GEOMETRY
        );
        INSERT INTO dim_province VALUES
        ('50', 'เชียงใหม่', 'Chiang Mai', 98.8, 99.2, 18.6, 19.0,
         ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[98.8,18.6],[99.2,18.6],[99.2,19.0],[98.8,19.0],[98.8,18.6]]]}')),
        ('83', 'ภูเก็ต', 'Phuket', 98.2, 98.4, 7.8, 8.1,
         ST_GeomFromGeoJSON('{"type":"GeometryCollection","geometries":[{"type":"Polygon","coordinates":[[[98.2,7.8],[98.4,7.8],[98.4,8.1],[98.2,8.1],[98.2,7.8]]]},{"type":"Point","coordinates":[98.3,7.95]}]}'));

        CREATE TABLE dim_amphoe (
            prov_code VARCHAR, amphoe_code VARCHAR, prov_name_th VARCHAR,
            amphoe_name_th VARCHAR, amphoe_name_en VARCHAR,
            centroid_lon DOUBLE, centroid_lat DOUBLE,
            min_lon DOUBLE, max_lon DOUBLE, min_lat DOUBLE, max_lat DOUBLE, geom GEOMETRY
        );
        INSERT INTO dim_amphoe VALUES
        ('50', '5001', 'เชียงใหม่', 'เมืองเชียงใหม่', 'Mueang Chiang Mai', 99.0, 18.8, 98.8, 99.2, 18.6, 19.0,
         ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[98.8,18.6],[99.2,18.6],[99.2,19.0],[98.8,19.0],[98.8,18.6]]]}')),
        ('83', '8301', 'ภูเก็ต', 'เมืองภูเก็ต', 'Mueang Phuket', 98.3, 7.95, 98.2, 98.4, 7.8, 8.1,
         ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[98.2,7.8],[98.4,7.8],[98.4,8.1],[98.2,8.1],[98.2,7.8]]]]}'));

        CREATE TABLE dim_tambon (
            prov_code VARCHAR, amphoe_code VARCHAR, tambon_code VARCHAR,
            prov_name_th VARCHAR, amphoe_name_th VARCHAR, tambon_name_th VARCHAR, tambon_name_en VARCHAR,
            centroid_lon DOUBLE, centroid_lat DOUBLE,
            min_lon DOUBLE, max_lon DOUBLE, min_lat DOUBLE, max_lat DOUBLE, geom GEOMETRY
        );
        INSERT INTO dim_tambon VALUES
        ('50', '5001', '500101', 'เชียงใหม่', 'เมืองเชียงใหม่', 'ศรีภูมิ', 'Si Phum', 99.0, 18.8, 98.8, 99.2, 18.6, 19.0,
         ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[98.8,18.6],[99.2,18.6],[99.2,19.0],[98.8,19.0],[98.8,18.6]]]}')),
        ('83', '8301', '830101', 'ภูเก็ต', 'เมืองภูเก็ต', 'ตลาดใหญ่', 'Talat Yai', 98.3, 7.95, 98.2, 98.4, 7.8, 8.1,
         ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[98.2,7.8],[98.4,7.8],[98.4,8.1],[98.2,8.1],[98.2,7.8]]]}'));

        CREATE TABLE hotspots (
            hotspot_row_id BIGINT, hotspot_id VARCHAR, collection_id VARCHAR,
            acq_date_th DATE, year_th INTEGER, month_th INTEGER, hour_th INTEGER,
            th_time VARCHAR, acq_date_utc DATE, acq_time_utc VARCHAR,
            latitude DOUBLE, longitude DOUBLE, lat_grid3 DOUBLE, lon_grid3 DOUBLE,
            prov_code VARCHAR, prov_name_th VARCHAR, prov_name_en VARCHAR,
            amphoe_code VARCHAR, amphoe_name_th VARCHAR,
            tambon_code VARCHAR, tambon_name_th VARCHAR,
            village_name VARCHAR, moo_1 VARCHAR, name_1 VARCHAR, v_dist_km DOUBLE, v_direct VARCHAR,
            re_nesdb VARCHAR, re_royin VARCHAR,
            lu_code VARCHAR, lu_name VARCHAR, lu_hp VARCHAR, lu_hp_name VARCHAR,
            satellite VARCHAR, instrument VARCHAR, confidence_raw VARCHAR, confidence_level VARCHAR,
            bright_ti4 DOUBLE, bright_ti5 DOUBLE, frp_mw DOUBLE, is_suspected_static BOOLEAN, source_file VARCHAR
        );
        INSERT INTO hotspots VALUES
        (1, 'h1', 'viirs_20240310', DATE '2024-03-10', 2024, 3, 13, '1330', DATE '2024-03-10', '0630',
         18.81, 99.01, 18.81, 99.01, '50', 'เชียงใหม่', 'Chiang Mai', '5001', 'เมืองเชียงใหม่', '500101', 'ศรีภูมิ',
         'บ้านทดสอบ', '1', 'บ้านทดสอบ', 1.2, 'N', 'North', 'North', 'F', 'ป่าสงวนแห่งชาติ', 'C', 'ข้าวโพดและไร่หมุนเวียน',
         'N', 'VIIRS', 'nominal', 'nominal', 330.0, 290.0, 8.5, FALSE, 'f1'),
        (2, 'h2', 'viirs_20261110', DATE '2026-11-10', 2026, 11, 1, '0130', DATE '2026-11-09', '1830',
         18.82, 99.02, 18.82, 99.02, '50', 'เชียงใหม่', 'Chiang Mai', '5001', 'เมืองเชียงใหม่', '500101', 'ศรีภูมิ',
         'บ้านทดสอบ', '1', 'บ้านทดสอบ', 1.1, 'N', 'North', 'North', 'A', 'พื้นที่เกษตร', 'R', 'นาข้าว',
         'N20', 'VIIRS', 'high', 'high', 340.0, 295.0, 12.0, FALSE, 'f2'),
        (3, 'h3', 'viirs_20250115', DATE '2025-01-15', 2025, 1, 2, '0200', DATE '2025-01-14', '1900',
         18.85, 99.05, 18.85, 99.05, '50', 'เชียงใหม่', 'Chiang Mai', '5001', 'เมืองเชียงใหม่', '500101', 'ศรีภูมิ',
         'บ้านโรงงาน', '2', 'บ้านโรงงาน', 0.4, 'E', 'North', 'North', 'U', 'ชุมชนและอื่น ๆ', 'O', 'อื่น ๆ',
         'N', 'VIIRS', 'nominal', 'nominal', 310.0, 285.0, 2.0, TRUE, 'f3'),
        (4, 'h4', 'viirs_20230205', DATE '2023-02-05', 2023, 2, 13, '1320', DATE '2023-02-05', '0620',
         7.95, 98.30, 7.95, 98.30, '83', 'ภูเก็ต', 'Phuket', '8301', 'เมืองภูเก็ต', '830101', 'ตลาดใหญ่',
         'บ้านในเมือง', '3', 'บ้านในเมือง', 0.8, 'S', 'South', 'South', 'A', 'พื้นที่เกษตร', 'R', 'นาข้าว',
         'N', 'VIIRS', 'nominal', 'nominal', 325.0, 288.0, 4.5, FALSE, 'f4');

        CREATE TABLE gistda_burn_scar (
            feature_id VARCHAR, prov_code VARCHAR, prov_name_th VARCHAR,
            amphoe_code INTEGER, amphoe_name_th VARCHAR, tambon_code INTEGER, tambon_name_th VARCHAR,
            area_rai DOUBLE, date_range VARCHAR, rp_name VARCHAR
        );
        INSERT INTO gistda_burn_scar VALUES
        ('bs1', '50', 'เชียงใหม่', 5001, 'เมืองเชียงใหม่', 500101, 'ศรีภูมิ', 120.5, '20260511 - 20260520', 'พื้นที่เกษตร');

        CREATE TABLE gistda_burn_freq (
            feature_id VARCHAR, prov_code VARCHAR, prov_name_th VARCHAR,
            amphoe_code INTEGER, amphoe_name_th VARCHAR, tambon_code INTEGER, tambon_name_th VARCHAR,
            area_rai DOUBLE, freq INTEGER, y2023 INTEGER, y2024 INTEGER, y2025 INTEGER
        );
        INSERT INTO gistda_burn_freq VALUES
        ('bf1', '50', 'เชียงใหม่', 5001, 'เมืองเชียงใหม่', 500101, 'ศรีภูมิ', 500.0, 3, 1, 1, 1);

        CREATE TABLE tamroypao_burn_tambon (
            season_be VARCHAR, season_period VARCHAR, year_th INTEGER,
            prov_code VARCHAR, amphoe_code VARCHAR, tambon_code VARCHAR,
            paddy_rai DOUBLE, sugarcane_rai DOUBLE, corn_rai DOUBLE, mixed_rai DOUBLE,
            agri_rai DOUBLE, forest_rai DOUBLE, total_rai DOUBLE,
            source_agri_tif VARCHAR, source_forest_tif VARCHAR
        );
        INSERT INTO tamroypao_burn_tambon VALUES
        ('2567', '202312_202404', 2024, '50', '5001', '500101', 100.5, 20.0, 300.25, 5.0, 425.75, 600.0, 1025.75, 'b3a_2023.tif', 'b3f_2023.tif'),
        ('2568', '202412_202504', 2025, '50', '5001', '500101', 80.0, 15.0, 200.0, 0.0, 295.0, 450.0, 745.0, 'b3a_2024.tif', 'b3f_2024.tif'),
        ('2569', '202512_202604', 2026, '50', '5001', '500101', 90.0, 10.0, 150.0, 2.5, 252.5, 310.0, 562.5, 'b3a_2025.tif', 'b3f_2025.tif');

        CREATE TABLE era5_monthly_fire_weather (
            prov_code VARCHAR, year_th INTEGER, month_th INTEGER, ym VARCHAR, days_count INTEGER,
            tmax_mean_c DOUBLE, tmax_peak_c DOUBLE, tmean_c DOUBLE, hot_days_35c INTEGER, hot_days_38c INTEGER,
            rain_mm DOUBLE, dry_days INTEGER, longest_dry_spell_days INTEGER,
            wind_max_mean_kmh DOUBLE, wind_peak_kmh DOUBLE, et0_sum_mm DOUBLE,
            rh_mean_pct DOUBLE, rh_min_mean_pct DOUBLE, low_rh_days_35pct INTEGER, fire_weather_index DOUBLE
        );
        INSERT INTO era5_monthly_fire_weather VALUES
        ('50', 2024, 3, '2024-03', 31, 36.2, 39.5, 28.4, 22, 6, 4.2, 29, 18, 12.4, 22.0, 165.0, 48.0, 26.5, 24, 79.4),
        ('50', 2026, 3, '2026-03', 31, 35.4, 38.8, 27.9, 19, 3, 12.0, 27, 14, 11.8, 20.5, 158.0, 51.0, 30.2, 18, 72.6),
        ('83', 2024, 3, '2024-03', 31, 32.1, 33.8, 28.5, 0, 0, 145.0, 14, 5, 13.0, 21.0, 142.0, 76.0, 61.0, 0, 34.2),
        ('83', 2026, 3, '2026-03', 31, 31.8, 33.2, 28.2, 0, 0, 180.0, 11, 4, 12.5, 19.5, 136.0, 78.0, 63.5, 0, 31.0);

        CREATE VIEW v_suspected_static_hotspots AS
        SELECT prov_name_th, amphoe_name_th, tambon_name_th, lu_name,
               lat_grid3, lon_grid3, count(*) AS total_points,
               count(DISTINCT acq_date_th) AS distinct_days, round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots WHERE is_suspected_static
        GROUP BY prov_name_th, amphoe_name_th, tambon_name_th, lu_name, lat_grid3, lon_grid3;

        CREATE VIEW v_village_5y_summary AS
        SELECT prov_code, min(prov_name_th) AS prov_name_th, amphoe_code, min(amphoe_name_th) AS amphoe_name_th,
               tambon_code, min(tambon_name_th) AS tambon_name_th, village_name, max(moo_1) AS moo_1,
               count(*) AS total_5y_hotspots,
               count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
               count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
               count(*) FILTER (WHERE is_suspected_static) AS suspected_static_hotspots,
               count(DISTINCT acq_date_th) AS active_fire_days,
               round(avg(v_dist_km), 2) AS avg_v_dist_km, round(min(v_dist_km), 2) AS min_v_dist_km,
               round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots WHERE village_name IS NOT NULL
        GROUP BY prov_code, amphoe_code, tambon_code, village_name;
    """)
    con.close()

    era5_payload = {
        "schema": "tadih.era5_annual.v1",
        "provinces": {
            "50": {
                "province_code": "50",
                "region": "north",
                "requested_latitude": 18.7883,
                "requested_longitude": 98.9853,
                "years": [
                    {"year": y, "tmean_c": 26.5, "tmax_mean_c": 32.0, "tmin_mean_c": 21.0,
                     "hot_days_38c": 12 + (y - 2022), "rainfall_total_mm": 1200.0,
                     "longest_dry_spell_days": 45, "dry_spell_events_5d": 8, "complete_year": True}
                    for y in (2016, 2022, 2023, 2024, 2025)
                ],
            },
            "83": {
                "province_code": "83",
                "region": "south",
                "requested_latitude": 7.8804,
                "requested_longitude": 98.3923,
                "years": [
                    {"year": y, "tmean_c": 28.0, "tmax_mean_c": 32.5, "tmin_mean_c": 24.5,
                     "hot_days_38c": 0, "rainfall_total_mm": 2400.0,
                     "longest_dry_spell_days": 14, "dry_spell_events_5d": 2, "complete_year": True}
                    for y in (2016, 2022, 2023, 2024, 2025)
                ],
            },
        },
    }
    era5_path.write_text(json.dumps(era5_payload, ensure_ascii=False), encoding="utf-8")

    if include_tadih and tadih_path is not None:
        tcon = duckdb.connect(str(tadih_path))
        tcon.execute("""
            CREATE TABLE fact_flood_risk_forecast (
                month INTEGER, dopa_tambon_code VARCHAR, tambon_name_th VARCHAR,
                dopa_amphoe_code VARCHAR, amphoe_name_th VARCHAR,
                dopa_province_code VARCHAR, province_name_th VARCHAR,
                recurrence_17yr_count INTEGER, risk_criteria VARCHAR, risk_level VARCHAR,
                source_agency VARCHAR, retrieved_at VARCHAR, license_status VARCHAR
            );
            INSERT INTO fact_flood_risk_forecast VALUES
            (9, '500101', 'ต.ศรีภูมิ', '5001', 'อ.เมืองเชียงใหม่', '50', 'จ.เชียงใหม่',
             8, '8-17 ครั้งในรอบ 17 ปี', 'เสี่ยงสูง', 'HII', '2026-10-23', 'pending'),
            (10, '500101', 'ต.ศรีภูมิ', '5001', 'อ.เมืองเชียงใหม่', '50', 'จ.เชียงใหม่',
             6, '4-7 ครั้งในรอบ 17 ปี', 'เสี่ยงปานกลาง', 'HII', '2026-10-23', 'pending');
        """)
        tcon.close()

    return db_path, era5_path, tadih_path


class InteractiveMapDataTests(unittest.TestCase):
    def test_detailed_adjacent_polygons_draw_a_shared_edge_once(self) -> None:
        import shutil
        import subprocess

        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is needed to run the boundary drawing helper")
        helper = (SUBPROJECT_DIR / "atlas_boundaries.js").read_text(encoding="utf-8")
        result = subprocess.run([node, "-"], input=helper + """
const assert = require("node:assert/strict");
const feature = (code, amp, left) => ({
  properties: { TAM_CODE: code, AMP_CODE: amp, PROV_CODE: "18", Centroid_x: "100.20", Centroid_y: "15.09" },
  geometry: { type: "Polygon", coordinates: [
    [[left, 0], [left + 1, 0], [left + 1, 1], [left, 1], [left, 0]],
  ] },
});
const { areas, segments } = atlasDetailedEdges([feature("180501", "1805", 0), feature("180601", "1806", 1)]);
assert.deepEqual(areas[0].centroid, [100.20, 15.09]);
assert.deepEqual(segments.map(edges => edges.length), [0, 1, 6]);
assert.deepEqual(segments[1][0], [[1, 0], [1, 1]]);
""", text=True, encoding="utf-8", capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_monthly_burn_areas_preserve_zero_and_missing_coverage(self) -> None:
        with duckdb.connect() as con:
            self.assertEqual(load_tamroypao_monthly(con), {})
            con.execute("""
                CREATE TABLE tamroypao_burn_agri (
                    month VARCHAR, province_code VARCHAR, paddy DOUBLE, sugarcane DOUBLE, mixed DOUBLE, corn DOUBLE
                );
                INSERT INTO tamroypao_burn_agri VALUES
                    ('202604', '1', 1.25, 2, 3, 4), ('202604', 'TH16', 0, 0, 0, 0),
                    ('202604', '50', 10, NULL, 0, 0),
                    ('202604', 'TH09', 1, 0, 0, 0), ('202604', '9', 2, 0, 0, 0),
                    ('202613', '16', 1, 0, 0, 0);
                CREATE TABLE tamroypao_burn_forest (month VARCHAR, province_code VARCHAR, forest DOUBLE);
                INSERT INTO tamroypao_burn_forest VALUES ('202610', '16', 5);
            """)
            monthly = load_tamroypao_monthly(con)
        self.assertEqual(monthly, {"202604": {"agri": {"01": 10.25, "16": 0.0}}, "202610": {"forest": {"16": 5.0}}})
        html = render_online_web_html(burn_months=monthly)
        self.assertIn('id="bsMonthRange" type="range"', html)
        self.assertIn('"202604":{"agri":{"01":10.25,"16":0.0}}', html)

    def test_live_haze_counts_only_available_24_hour_values(self) -> None:
        import shutil
        import subprocess
        from ui_pages import MULTI_PAGE_JS

        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is required to exercise the browser calculation")
        render = "function renderLiveHazeGrid(" + MULTI_PAGE_JS.split(
            "function renderLiveHazeGrid(", 1
        )[1].split("async function inspectLiveHazeProv(", 1)[0]
        checks = r"""
          const assert = require("node:assert/strict");
          const elements = new Map();
          const document = { getElementById(id) {
            if (!elements.has(id)) elements.set(id, { querySelectorAll: () => [] });
            return elements.get(id);
          }};
          const pm25Tier = () => ["", ""];
          const escHtml = x => x;
          const formatNum = x => x;
          const selectedLiveHazeProv = null;
          renderLiveHazeGrid([
            {code: "01", name_th: "Highest hourly", pm25: 46.4, pm25_24h: 27.2},
            {code: "02", name_th: "Highest daily", pm25: 29.0, pm25_24h: 38.0},
            {code: "03", name_th: "No daily", pm25: 43.7, pm25_24h: null},
          ], false);
          assert.match(elements.get("hzKpiExceed").textContent, /^1 \/ 2 /);
          assert.match(elements.get("hzKpiTopSub").textContent, /Highest hourly/);
        """
        subprocess.run([node, "-"], input=render + checks, encoding="utf-8", check=True)

    def test_public_summary_excludes_local_flood_and_preserves_split_grid(self) -> None:
        from unittest.mock import patch
        from publish_hf import write_public_map_summary

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path, era5_path, tadih_path = _create_synthetic_sources(root, include_tadih=True)
            payload = build_map_payload(db_path, era5_path, tadih_path)
            self.assertGreater(payload["meta"]["flood_covered_tambons"], 0)
            grid = payload["grid"]
            with patch("publish_hf.hii_flood_publication", return_value=None):
                summary, grid_file = write_public_map_summary(payload, root / "summary")
            public = json.loads(gzip.decompress((root / summary["path"]).read_bytes()))
            self.assertEqual(public["meta"]["flood_covered_tambons"], 0)
            for group in ("provinces", "amphoes", "tambons"):
                self.assertTrue(all(value is None for row in public[group]
                                    for key, value in row.items() if key.startswith("flood_")))
            self.assertNotIn("grid", public)
            self.assertEqual(public["grid_file"], Path(grid_file["path"]).name)
            self.assertEqual(json.loads(gzip.decompress((root / grid_file["path"]).read_bytes())), grid)

    def test_public_summary_keeps_flood_with_registered_approval(self) -> None:
        from publish_hf import write_public_map_summary
        from tadih.tier1_ingestion import hii_flood_publication

        approval = hii_flood_publication()
        self.assertEqual(approval["resource_id"], "50e6987b-c01f-4fd5-99e2-2bccf9f18268")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path, era5_path, tadih_path = _create_synthetic_sources(root, include_tadih=True)
            payload = build_map_payload(db_path, era5_path, tadih_path)
            coverage = payload["meta"]["flood_covered_tambons"]
            summary, _ = write_public_map_summary(payload, root / "summary")
            public = json.loads(gzip.decompress((root / summary["path"]).read_bytes()))
            self.assertGreater(coverage, 0)
            self.assertEqual(public["meta"]["flood_covered_tambons"], coverage)
            self.assertTrue(any(row["flood_max_17yr"] is not None for row in public["tambons"]))

    def test_pack_flags_roundtrip(self) -> None:
        for sat, yr, sea, lu, crop, st in [
            (0, 0, 0, 0, 0, 0),
            (1, 4, 3, 2, 3, 1),
            (0, 2, 1, 1, 3, 0),
        ]:
            packed = pack_flags(sat, yr, sea, lu, crop, st)
            self.assertEqual(unpack_flags(packed), (sat, yr, sea, lu, crop, st))

    def test_encode_payload_b64_roundtrip(self) -> None:
        sample = {"title": "แผนที่จุดความร้อนไทย </script>", "nums": [1, 2, None]}
        encoded = encode_payload_b64(sample)
        decoded = json.loads(gzip.decompress(base64.b64decode(encoded)).decode("utf-8"))
        self.assertEqual(decoded, sample)

    def test_build_map_payload_preserves_nulls_and_multi_factor_joins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path, era5_path, tadih_path = _create_synthetic_sources(Path(tmp), include_tadih=True)
            payload = build_map_payload(db_path, era5_path, tadih_path)

            provs = {p["code"]: p for p in payload["provinces"]}
            self.assertIn("50", provs)
            self.assertIn("83", provs)

            # Phuket (83) has no burn_scar, no burn_freq, no TamRoyPao, and no HII flood rows -> must remain None
            self.assertIsNone(provs["83"]["scar_rai"])
            self.assertIsNone(provs["83"]["freq_rai"])
            self.assertIsNone(provs["83"]["flood_max_17yr"])
            self.assertIsNone(provs["83"]["trp"])
            self.assertGreater(provs["83"]["area_sqkm"], 0)
            self.assertTrue(len(provs["83"]["rings"]) >= 1)

            # Chiang Mai (50) has burn_scar, burn_freq, TamRoyPao (2024..2026), flood, ERA5 10Y + Fire-Weather 2024 & 2026
            self.assertAlmostEqual(provs["50"]["scar_rai"], 120.5)
            self.assertAlmostEqual(provs["50"]["freq_rai"], 500.0)
            self.assertEqual(provs["50"]["flood_max_17yr"], 8)
            self.assertEqual(sorted(provs["50"]["era5"].keys()), ["2016", "2022", "2023", "2024", "2025"])
            self.assertEqual(provs["50"]["region"], "north")
            self.assertAlmostEqual(provs["50"]["lat"], 18.7883)
            self.assertEqual(payload["weather_months"], ["2024-03", "2026-03"])
            self.assertEqual(payload["meta"]["weather_covered_provinces"], 2)
            self.assertAlmostEqual(provs["50"]["wx_y"]["2026"]["peak_fwi"], 72.6)
            self.assertEqual(len(provs["50"]["wx_m"]), 2)
            self.assertEqual(provs["50"]["hs_m"][0][0], 1)  # 2024-03 N hotspot in Chiang Mai
            self.assertEqual(sorted(provs["50"]["trp"].keys()), ["2024", "2025", "2026"])
            self.assertEqual(provs["50"]["trp"]["2024"], [100.5, 20.0, 300.3, 5.0, 600.0])
            self.assertEqual(payload["meta"]["trp_covered_provinces"], 1)
            self.assertEqual(payload["meta"]["trp_years"], [2024, 2025, 2026])

            # Check GeometryCollection/MultiPolygon amphoe and tambon extraction
            tambons = {t["code"]: t for t in payload["tambons"]}
            self.assertIsNone(tambons["830101"]["flood_max_17yr"])
            self.assertIsNone(tambons["830101"]["trp"])
            self.assertEqual(tambons["500101"]["flood_max_17yr"], 8)
            self.assertEqual(tambons["500101"]["trp"]["2026"], [90.0, 10.0, 150.0, 2.5, 310.0])
            self.assertTrue(len(tambons["500101"]["rings"]) >= 1)

            # Check cube keeps corn-in-forest (lu=1, crop=3, sat=0) distinct from Nov 2026 N20 (sat=1)
            cm_idx = payload["tambons"].index(tambons["500101"])
            cm_rows = [r for r in payload["cube"] if r[0] == cm_idx]
            flags_list = [unpack_flags(r[1]) for r in cm_rows]
            self.assertIn((0, 2, 1, 1, 3, 0), flags_list)  # 2024 Mar N forest corn non-static
            self.assertIn((1, 4, 3, 0, 1, 0), flags_list)  # 2026 Nov N20 agri rice non-static
            self.assertIn((0, 3, 0, 2, 0, 1), flags_list)  # 2025 Jan N other static

            # Grid and overlays populated
            self.assertGreaterEqual(len(payload["grid"]), 3)
            self.assertEqual(len(payload["static_spots"]), 1)
            self.assertGreaterEqual(len(payload["villages"]), 1)
            self.assertIsNotNone(payload["villages"][0]["lat"])

    def test_build_map_payload_gracefully_handles_missing_tadih(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path, era5_path, _ = _create_synthetic_sources(Path(tmp), include_tadih=False)
            payload = build_map_payload(db_path, era5_path, None)
            for p in payload["provinces"]:
                self.assertIsNone(p["flood_max_17yr"])

    def test_render_interactive_html_escapes_script_and_embeds_b64(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path, era5_path, tadih_path = _create_synthetic_sources(Path(tmp), include_tadih=True)
            payload = build_map_payload(db_path, era5_path, tadih_path)
            payload["provinces"][0]["name_th"] = "เชียงใหม่</script><script>alert(1)</script>"
            html = render_interactive_html(payload)
            self.assertNotIn("<script>alert(1)</script>", html)
            self.assertIn('id="payloadB64"', html)
            for required_id in (
                "satSelect",
                "yearSelect",
                "seasonSelect",
                "cropSelect",
                "metricSelect",
                "scatterX",
                "scatterY",
                "searchInput",
                "exportCsvBtn",
                "presentationBtn",
                "themeToggle",
                "mapCanvas",
                "provenanceBtn",
            ):
                self.assertIn(f'id="{required_id}"', html)

    def test_build_interactive_map_writes_html_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db_path, era5_path, tadih_path = _create_synthetic_sources(root, include_tadih=True)
            out_path = root / "out" / "map.html"
            summary = build_interactive_map(db_path, era5_path, tadih_path, out_path)
            self.assertTrue(out_path.exists())
            self.assertGreater(summary["html_bytes"], 5000)
            self.assertEqual(summary["provinces"], 2)
            self.assertEqual(summary["amphoes"], 2)
            self.assertEqual(summary["tambons"], 2)

            boundary_path = root / "admin-boundaries.json.gz"
            with duckdb.connect(str(db_path), read_only=True) as con:
                write_admin_boundaries(con, boundary_path)
            outlines = json.loads(gzip.decompress(boundary_path.read_bytes()))
            self.assertEqual([row[0] for row in outlines["amphoe"]], ["เมืองเชียงใหม่", "เมืองภูเก็ต"])
            name, point, box, rings, province, code = outlines["tambon"][0]
            self.assertEqual((name, point, box), ("ศรีภูมิ", [99.0, 18.8], [98.8, 18.6, 99.2, 19.0]))
            self.assertEqual(province, "50")
            self.assertEqual(code, "500101")
            self.assertGreaterEqual(len(rings[0]), 4)

            # Verify inline JS parses cleanly and includes XSS/CSV/state-reset guards
            html_text = out_path.read_text(encoding="utf-8")
            script_body = html_text.split('<script id="payloadB64" type="text/plain">', 1)[1].split("<script>\n", 1)[1].rsplit("</script>", 1)[0]
            self.assertIn("r.activeYears / maxYrs", script_body)
            js_file = root / "check.js"
            js_file.write_text(script_body, encoding="utf-8")
            import shutil, subprocess
            node_exe = shutil.which("node")
            if node_exe:
                res = subprocess.run([node_exe, "--check", str(js_file)], capture_output=True, text=True)
                self.assertEqual(res.returncode, 0, res.stderr)

    def test_build_map_payload_retains_unmatched_tambon_and_synthesizes_missing_amphoe(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path, era5_path, tadih_path = _create_synthetic_sources(Path(tmp), include_tadih=True)
            con = duckdb.connect(str(db_path))
            con.execute("LOAD spatial;")
            # Add a tambon whose amphoe_code '5002' is missing from dim_amphoe, and one with 'Ko T' typo for '5001'
            con.execute("""
                INSERT INTO dim_tambon VALUES
                ('50', '5002', '500201', 'เชียงใหม่', 'แม่ริม', 'ริมใต้', 'Rim Tai', 98.95, 18.91, 98.9, 99.0, 18.85, 18.95,
                 ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[98.9,18.85],[99.0,18.85],[99.0,18.95],[98.9,18.95],[98.9,18.85]]]}')),
                ('50', 'Ko T', '500102', 'เชียงใหม่', 'เมืองเชียงใหม่', 'ช้างคลาน', 'Chang Khlan', 99.0, 18.78, 98.98, 99.02, 18.76, 18.80,
                 ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[98.98,18.76],[99.02,18.76],[99.02,18.80],[98.98,18.80],[98.98,18.76]]]}'));
                INSERT INTO hotspots VALUES
                (5, 'h5', 'viirs_20240311', DATE '2024-03-11', 2024, 3, 13, '1330', DATE '2024-03-11', '0630',
                 18.88, 99.03, 18.88, 99.03, '50', 'เชียงใหม่', 'Chiang Mai', '5001', 'เมืองเชียงใหม่', '500199', 'ท่าแฝกจำลอง',
                 NULL, NULL, NULL, NULL, NULL, 'North', 'North', 'F', 'ป่าสงวนแห่งชาติ', 'X', 'พื้นที่ป่า',
                 'N', 'VIIRS', 'nominal', 'nominal', 330.0, 290.0, 5.0, FALSE, 'f5'),
                (6, 'h6', 'viirs_20240312', DATE '2024-03-12', 2024, 3, 13, '1330', DATE '2024-03-12', '0630',
                 18.91, 98.95, 18.91, 98.95, '50', 'เชียงใหม่', 'Chiang Mai', '5002', 'แม่ริม', '500201', 'ริมใต้',
                 NULL, NULL, NULL, NULL, NULL, 'North', 'North', 'A', 'พื้นที่เกษตร', 'R', 'นาข้าว',
                 'N', 'VIIRS', 'nominal', 'nominal', 330.0, 290.0, 6.0, FALSE, 'f6');
            """)
            con.close()

            payload = build_map_payload(db_path, era5_path, tadih_path)
            # Zero dropped hotspots!
            self.assertEqual(sum(r[2] for r in payload["cube"]), payload["meta"]["total_all"])
            amp_codes = {a["code"]: a for a in payload["amphoes"]}
            self.assertIn("5002", amp_codes)
            self.assertGreater(amp_codes["5002"]["area_sqkm"], 0)
            self.assertTrue(len(amp_codes["5002"]["rings"]) >= 1)
            tb_map = {t["code"]: t for t in payload["tambons"]}
            self.assertEqual(tb_map["500102"]["amphoe_code"], "5001")
            self.assertIn("500199", tb_map)

    def test_template_includes_xss_csv_formula_and_state_guards(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path, era5_path, tadih_path = _create_synthetic_sources(Path(tmp), include_tadih=True)
            payload = build_map_payload(db_path, era5_path, tadih_path)
            html = render_interactive_html(payload)
            self.assertIn("function escHtml(", html)
            self.assertIn("function csvCell(", html)
            self.assertIn("function drawTmsOverlay(", html)
            self.assertIn('id="tmsOverlaySelect"', html)
            self.assertIn('value="trp_rai"', html)
            self.assertIn("^[=+\\-@\\t\\r]", html)
            self.assertNotIn('state.season === "late" && state.year !== "2026"', html)
            self.assertIn('key === "levelMode"', html)
            for bs_id in ("bsMapCanvas", "bsLayerLeft", "bsLayerRight", "bsSwipeToggle", "bsOpacityRange", "bsBasemapSel", "bsMapProvSel", "bsMapAmpSel", "bsZoomReadout"):
                self.assertIn(f'id="{bs_id}"', html)
            self.assertIn("function flyBsMapToProvince(", html)

    def test_render_online_web_html_valid_js_and_hf_urls(self) -> None:
        html_text = render_online_web_html("dragonfly13110/thailand-hotspot-5y")
        self.assertIn("https://huggingface.co/datasets/dragonfly13110/thailand-hotspot-5y/resolve/main/summary/map_payload.json.gz", html_text)
        for page_id in ("page-overview", "page-map", "page-weather", "page-burnscar", "page-explorer"):
            self.assertIn(f'id="{page_id}"', html_text)
        for bs_id in ("bsMapCanvas", "bsLayerLeft", "bsLayerRight", "bsSwipeToggle", "bsOpacityRange", "bsBasemapSel", "bsMapProvSel", "bsMapAmpSel", "bsZoomReadout"):
            self.assertIn(f'id="{bs_id}"', html_text)
        self.assertIn("function flyBsMapToProvince(", html_text)
        self.assertIn('id="openExplorerBtn"', html_text)
        self.assertIn('id="explorerModal"', html_text)
        self.assertIn('value="wx_fwi"', html_text)
        self.assertIn("ensureDuckDb", html_text)
        self.assertIn("switchPage", html_text)
        for leftover in ("__PAYLOAD_B64__", "__HF_REPO__", "__MULTI_PAGE_CSS__", "__OVERVIEW_PAGE__", "__WEATHER_PAGE__", "__BURNSCAR_PAGE__", "__MULTI_PAGE_JS__"):
            self.assertNotIn(leftover, html_text)
        script_body = html_text.split('<script id="payloadB64" type="text/plain">', 1)[1].split("<script>\n", 1)[1].rsplit("</script>", 1)[0]
        import shutil, subprocess
        node_exe = shutil.which("node")
        if node_exe:
            with tempfile.TemporaryDirectory() as tmp:
                js_file = Path(tmp) / "online_check.js"
                js_file.write_text(script_body, encoding="utf-8")
                res = subprocess.run([node_exe, "--check", str(js_file)], capture_output=True, text=True)
                self.assertEqual(res.returncode, 0, res.stderr)


if __name__ == "__main__":
    unittest.main()
