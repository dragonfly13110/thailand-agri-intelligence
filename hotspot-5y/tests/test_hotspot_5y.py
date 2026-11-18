"""Offline unit and integration tests for the pure-GISTDA hotspot-5y sub-project."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

SUBPROJECT_DIR = Path(__file__).resolve().parents[1]
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from analyze import run_analysis  # noqa: E402
from build_db import build_database  # noqa: E402
from config import DEFAULT_PROVINCE_GEOJSON, parse_years_arg  # noqa: E402
from download_gistda import fetch_range_adaptive, normalize_feature_record  # noqa: E402
from download_gistda_viirs import normalize_viirs_feature  # noqa: E402


class Hotspot5YTests(unittest.TestCase):
    def test_parse_years_arg(self) -> None:
        self.assertEqual(parse_years_arg("2022-2026"), (2022, 2023, 2024, 2025, 2026))
        self.assertEqual(parse_years_arg("2026, 2024, 2026"), (2024, 2026))

    def test_normalize_viirs_feature_handles_2022_and_2026_formats(self) -> None:
        feat_2022 = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [101.2, 13.9]},
            "properties": {
                "_id": "id1",
                "hotspotid": "VI120220101",
                "acq_date": "2022-01-01",
                "acq_time": "0240",
                "th_date": "2022-01-01",
                "th_time": "0940",
                "satellite": "N",
                "pv_idn": 25,
                "pv_tn": "ปราจีนบุรี",
                "lu_name": "พื้นที่เกษตร",
                "lu_hp_name": "นาข้าว",
                "frp": 1.5,
                "confidence": "nominal",
            },
        }
        feat_2026 = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [99.4, 13.6]},
            "properties": {
                "_id": "id2",
                "hotspotid": "VI220261117",
                "acq_date": "2026-11-16T00:00:00",
                "acq_time": "1838",
                "th_date": "2026-11-17T00:00:00",
                "th_time": "0138",
                "satellite": "N20",
                "pv_idn": 70,
                "pv_tn": "ราชบุรี",
                "lu_name": "ชุมชนและอื่น ๆ",
                "lu_hp_name": "พื้นที่ป่า",
                "frp": 2.3,
                "confidence": "high",
                "village": "บ้านทดสอบ",
                "moo_1": "3",
                "name_1": "ม.3 บ้านทดสอบ",
                "v_dist": 1.25,
                "v_direct": "NE",
            },
        }
        r1 = normalize_viirs_feature(feat_2022, "viirs_20220101")
        r2 = normalize_viirs_feature(feat_2026, "viirs_20261117")
        self.assertEqual(r1["th_date"], "2022-01-01")
        self.assertEqual(r2["th_date"], "2026-11-17")
        self.assertEqual(r2["satellite"], "N20")
        self.assertEqual(r2["village"], "บ้านทดสอบ")
        self.assertEqual(r2["v_dist"], 1.25)
        self.assertEqual(r2["v_direct"], "NE")

    def test_pure_gistda_build_and_analyze_with_static_detection_and_polygons(self) -> None:
        if not DEFAULT_PROVINCE_GEOJSON.exists():
            self.skipTest("Local province GeoJSON not available")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            viirs_dir = tmp_path / "viirs"
            gistda_dir = tmp_path / "gistda"
            viirs_dir.mkdir()
            gistda_dir.mkdir()
            db_path = tmp_path / "test_gistda.duckdb"
            out_dir = tmp_path / "out"

            # 25 distinct dates at Saraburi industrial spot (flagged static) + 2 normal agri/forest points
            rows_2024 = []
            for d in range(1, 26):
                rows_2024.append(
                    normalize_viirs_feature(
                        {
                            "geometry": {"type": "Point", "coordinates": [101.0401, 14.6501]},
                            "properties": {
                                "_id": f"st-{d}",
                                "hotspotid": f"ST-{d}",
                                "acq_date": f"2024-03-{d:02d}",
                                "acq_time": "1830",
                                "th_date": f"2024-03-{d:02d}",
                                "th_time": "0130",
                                "satellite": "N",
                                "pv_idn": 19,
                                "pv_tn": "สระบุรี",
                                "ap_idn": 1902,
                                "ap_tn": "แก่งคอย",
                                "tb_idn": 190201,
                                "tb_tn": "ทับกวาง",
                                "lu_name": "ชุมชนและอื่น ๆ",
                                "lu_hp_name": "อื่น ๆ",
                                "frp": 1.8,
                                "confidence": "nominal",
                            },
                        },
                        f"viirs_202403{d:02d}",
                    )
                )

            rows_2024.append(
                normalize_viirs_feature(
                    {
                        "geometry": {"type": "Point", "coordinates": [101.1400, 15.3740]},
                        "properties": {
                            "_id": "ag-1",
                            "hotspotid": "AG-1",
                            "acq_date": "2024-02-10",
                            "acq_time": "0630",
                            "th_date": "2024-02-10",
                            "th_time": "1330",
                            "satellite": "N20",
                            "pv_idn": 67,
                            "pv_tn": "จ.เพชรบูรณ์",
                            "lu_name": "พื้นที่เกษตร",
                            "lu_hp_name": "อ้อย",
                            "frp": 12.0,
                            "confidence": "high",
                        },
                    },
                    "viirs_20240210",
                )
            )

            with gzip.open(viirs_dir / "gistda_viirs_2024.jsonl.gz", "wt", encoding="utf-8") as gz:
                for rec in rows_2024:
                    gz.write(json.dumps(rec, ensure_ascii=False) + "\n")
                # Duplicate hotspot_id must be deduplicated cleanly
                gz.write(json.dumps(rows_2024[-1], ensure_ascii=False) + "\n")

            bs_rec = normalize_feature_record(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[101.135, 15.370], [101.145, 15.370], [101.145, 15.380], [101.135, 15.380], [101.135, 15.370]]],
                    },
                    "properties": {
                        "_id": "bs-test-1",
                        "pv_idn": 67,
                        "pv_tn": "เพชรบูรณ์",
                        "area_rai": 25.5,
                        "date": "20260511 - 20260520",
                        "rp_name": "พื้นที่เกษตร",
                    },
                },
                include_geometry=True,
            )
            with gzip.open(gistda_dir / "gistda_burn_scar.jsonl.gz", "wt", encoding="utf-8") as gz:
                gz.write(json.dumps(bs_rec, ensure_ascii=False) + "\n")

            bf_rec = normalize_feature_record(
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [[[101.135, 15.370], [101.145, 15.370], [101.145, 15.380], [101.135, 15.370]]]},
                    "properties": {
                        "_id": "bf-test-1",
                        "pv_idn": 67,
                        "pv_tn": "จ.เพชรบูรณ์",
                        "area_rai": 40.0,
                        "freq": 2,
                        "y2017": 0,
                        "y2023": 1,
                        "y2024": 1,
                        "y2025": 0,
                    },
                },
                include_geometry=False,
            )
            with gzip.open(gistda_dir / "gistda_burn_freq.jsonl.gz", "wt", encoding="utf-8") as gz:
                gz.write(json.dumps(bf_rec, ensure_ascii=False) + "\n")

            stats = build_database(
                viirs_dir=viirs_dir,
                gistda_dir=gistda_dir,
                db_path=db_path,
                province_geojson=DEFAULT_PROVINCE_GEOJSON,
                amphoe_geojson=tmp_path / "no_amphoe.geojson",
                tambon_geojson=tmp_path / "no_tambon.geojson",
            )
            self.assertEqual(stats["total_points"], 26)
            self.assertEqual(stats["suspected_static_points"], 25)
            self.assertEqual(stats["gistda_tables"]["gistda_burn_scar"], 1)
            self.assertEqual(stats["gistda_tables"]["gistda_burn_freq"], 1)

            summary = run_analysis(db_path=db_path, out_dir=out_dir, top_n=10)
            self.assertEqual(summary["overview"]["total_hotspots"], 26)
            self.assertEqual(summary["overview"]["agri_alro_hotspots"], 1)
            self.assertEqual(summary["overview"]["suspected_static_hotspots"], 25)
            self.assertEqual(summary["gistda_burn_freq"]["area_rai_2025"], 0.0)
            self.assertTrue((out_dir / "hotspot_landuse_5y.csv").exists())
            self.assertTrue((out_dir / "province_ranking_5y.csv").exists())

    def test_fetch_range_adaptive_splits_on_timeout(self) -> None:
        calls: list[tuple[int, int]] = []

        def fake_fetch(limit: int, offset: int) -> dict:
            calls.append((offset, limit))
            if limit > 50:
                raise TimeoutError("giant polygon chunk")
            return {"features": [{"id": f"f-{offset + i}"} for i in range(limit)]}

        features = fetch_range_adaptive(fake_fetch, offset=49000, count=100, min_chunk=25)
        self.assertEqual(len(features), 100)
        self.assertEqual(calls, [(49000, 100), (49000, 50), (49050, 50)])

    def test_amphoe_tambon_boundaries_and_village_summaries(self) -> None:
        if not DEFAULT_PROVINCE_GEOJSON.exists():
            self.skipTest("Local province GeoJSON not available")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            viirs_dir = tmp_path / "viirs"
            gistda_dir = tmp_path / "gistda"
            viirs_dir.mkdir()
            gistda_dir.mkdir()
            db_path = tmp_path / "test_admin_village.duckdb"
            out_dir = tmp_path / "out"

            amphoe_geojson = tmp_path / "amphoe.geojson"
            amphoe_geojson.write_text(
                json.dumps(
                    {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "Polygon",
                                    "coordinates": [[[101.13, 15.36], [101.15, 15.36], [101.15, 15.39], [101.13, 15.39], [101.13, 15.36]]],
                                },
                                "properties": {
                                    "PROV_CODE": "67",
                                    "AMP_CODE": "6705",
                                    "PROV_NAM_T": "เพชรบูรณ์",
                                    "AMP_NAM_T": "ศรีเทพ",
                                    "AMP_NAM_E": "Si Thep",
                                    "Centroid_x": 101.14,
                                    "Centroid_y": 15.375,
                                },
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            tambon_geojson = tmp_path / "tambon.geojson"
            tambon_geojson.write_text(
                json.dumps(
                    {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "Polygon",
                                    "coordinates": [[[101.13, 15.36], [101.15, 15.36], [101.15, 15.39], [101.13, 15.39], [101.13, 15.36]]],
                                },
                                "properties": {
                                    "PROV_CODE": "67",
                                    "AMP_CODE": "6705",
                                    "TAM_CODE": "670501",
                                    "PROV_NAM_T": "เพชรบูรณ์",
                                    "AMP_NAM_T": "ศรีเทพ",
                                    "TAM_NAM_T": "ศรีเทพ",
                                    "TAM_NAM_E": "Si Thep",
                                    "Centroid_x": 101.14,
                                    "Centroid_y": 15.375,
                                },
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            # Row 1 omits ap_idn/tb_idn -> must match amphoe 6705 / tambon 670501 spatially;
            # Row 2 provides ap_idn/tb_idn directly; both have nearest village info.
            rows = [
                normalize_viirs_feature(
                    {
                        "geometry": {"type": "Point", "coordinates": [101.140, 15.374]},
                        "properties": {
                            "_id": "v-1",
                            "hotspotid": "V-1",
                            "acq_date": "2024-03-01",
                            "acq_time": "0630",
                            "th_date": "2024-03-01",
                            "th_time": "1330",
                            "satellite": "N20",
                            "pv_idn": 67,
                            "pv_tn": "เพชรบูรณ์",
                            "village": "บ้านโคกสะอาด",
                            "v_dist": 1.2,
                            "v_direct": "N",
                            "lu_name": "พื้นที่เกษตร",
                            "lu_hp_name": "อ้อย",
                            "frp": 8.0,
                            "confidence": "high",
                        },
                    },
                    "viirs_20240301",
                ),
                normalize_viirs_feature(
                    {
                        "geometry": {"type": "Point", "coordinates": [101.142, 15.376]},
                        "properties": {
                            "_id": "v-2",
                            "hotspotid": "V-2",
                            "acq_date": "2024-03-02",
                            "acq_time": "0630",
                            "th_date": "2024-03-02",
                            "th_time": "1330",
                            "satellite": "N",
                            "pv_idn": 67,
                            "pv_tn": "เพชรบูรณ์",
                            "ap_idn": 6705,
                            "ap_tn": "อ.ศรีเทพ",
                            "tb_idn": 670501,
                            "tb_tn": "ต.ศรีเทพ",
                            "village": "บ้านโคกสะอาด",
                            "moo_1": "4",
                            "v_dist": 0.8,
                            "v_direct": "SE",
                            "lu_name": "พื้นที่เกษตร",
                            "lu_hp_name": "อ้อย",
                            "frp": 6.0,
                            "confidence": "nominal",
                        },
                    },
                    "viirs_20240302",
                ),
            ]
            with gzip.open(viirs_dir / "gistda_viirs_2024.jsonl.gz", "wt", encoding="utf-8") as gz:
                for rec in rows:
                    gz.write(json.dumps(rec, ensure_ascii=False) + "\n")

            stats = build_database(
                viirs_dir=viirs_dir,
                gistda_dir=gistda_dir,
                db_path=db_path,
                province_geojson=DEFAULT_PROVINCE_GEOJSON,
                amphoe_geojson=amphoe_geojson,
                tambon_geojson=tambon_geojson,
            )
            self.assertEqual(stats["dim_amphoe_count"], 1)
            self.assertEqual(stats["dim_tambon_count"], 1)
            self.assertEqual(stats["matched_amphoe_points"], 2)
            self.assertEqual(stats["matched_tambon_points"], 2)
            self.assertEqual(stats["village_named_points"], 2)

            summary = run_analysis(db_path=db_path, out_dir=out_dir, top_n=5)
            self.assertEqual(summary["top_amphoes"][0]["amphoe_code"], "6705")
            self.assertEqual(summary["top_amphoes"][0]["total_5y_hotspots"], 2)
            self.assertEqual(summary["top_tambons"][0]["tambon_code"], "670501")
            self.assertEqual(summary["top_tambons"][0]["total_5y_hotspots"], 2)
            self.assertEqual(summary["top_villages"][0]["village_name"], "บ้านโคกสะอาด")
            self.assertEqual(summary["top_villages"][0]["total_5y_hotspots"], 2)
            self.assertAlmostEqual(summary["top_villages"][0]["avg_v_dist_km"], 1.0, places=3)
            self.assertTrue((out_dir / "amphoe_ranking_5y.csv").exists())
            self.assertTrue((out_dir / "tambon_ranking_5y.csv").exists())
            self.assertTrue((out_dir / "village_top_5y.csv").exists())


if __name__ == "__main__":
    unittest.main()
