import sys
import tempfile
import unittest
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_area_insights import build_data, validate_detection_records


class AreaInsightsTest(unittest.TestCase):
    def test_build_guard_rejects_duplicate_detection_and_mismatched_date(self):
        with duckdb.connect() as conn:
            conn.execute("""
                CREATE TABLE hotspots AS SELECT 'N' satellite, 'VIIRS' instrument,
                       DATE '2026-04-01' acq_date_th, DATE '2026-04-01' acq_date_utc,
                       '06:00' acq_time_utc, 2026 year_th, 4 month_th, 13.8 latitude,
                       100.3 longitude, 'one' hotspot_id, false is_suspected_static;
            """)
            validate_detection_records(conn)
            conn.execute("INSERT INTO hotspots SELECT * REPLACE ('two' AS hotspot_id) FROM hotspots")
            with self.assertRaisesRegex(ValueError, "duplicate position and time \\(1\\)"):
                validate_detection_records(conn)
            conn.execute("DELETE FROM hotspots WHERE hotspot_id = 'two'")
            conn.execute("UPDATE hotspots SET month_th = 5")
            with self.assertRaisesRegex(ValueError, "records \\(1\\)"):
                validate_detection_records(conn)

    def test_season_comparison_joins_coverage_and_previous_december(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "test.duckdb"
            with duckdb.connect(str(database)) as conn:
                conn.execute("""
                    CREATE TABLE dim_province AS SELECT '73' prov_code, 'นครปฐม' prov_name_th;
                    CREATE TABLE dim_amphoe AS
                        SELECT '73' prov_code, '7307' amphoe_code, 'พุทธมณฑล' amphoe_name_th
                        UNION ALL SELECT '73', '7305', 'บางเลน';
                    CREATE TABLE hotspots AS
                        SELECT yr year_th, mo month_th, '73' prov_code, a amphoe_code,
                               a AS amphoe_name_th, t tambon_code, 'พื้นที่เกษตร' lu_name,
                               100.3 longitude, 13.8 latitude, 'N' satellite,
                               false is_suspected_static, make_date(yr, mo, 1) acq_date_th,
                               make_date(yr,mo,1) acq_date_utc, t acq_time_utc,
                               'VIIRS' instrument, row_number() OVER ()::VARCHAR hotspot_id
                        FROM (VALUES (2024,4,'7307','730701'), (2025,12,'7307','730701'),
                                     (2026,4,'7307','730701'), (2026,5,'7307','730701'),
                                     (2026,4,'7305','730501')) v(yr,mo,a,t);
                    CREATE TABLE tamroypao_burn_tambon AS
                        SELECT yr year_th, period season_period, '73' prov_code, a amphoe_code,
                               t tambon_code, rai total_rai
                        FROM (VALUES (2024,'202312_202404','7307','730701',10),
                                     (2025,'202412_202504','7307','730701',6),
                                     (2026,'202512_202604','7307','730701',2),
                                     (2026,'202512_202604','7305','730501',99)) v(yr,period,a,t,rai);
                """)
            rows = {(r["p"], r["a"]): r for r in build_data(database)["areas"]}
            public = build_data(database, include_burn_scar=False)
        self.assertFalse(public["burnYears"])
        self.assertTrue(all("burn" not in row for row in public["areas"]))
        self.assertEqual(rows[(None, None)]["burn"], {
            "tambons": 1, "provinces": 1, "points": [1, 0, 2], "rai": [10, 6, 2],
        })
        self.assertEqual(rows[("73", "7307")]["burn"], rows[(None, None)]["burn"])
        self.assertNotIn("burn", rows[("73", "7305")])

    def test_filters_and_groups_repeat_cells_at_each_level(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "test.duckdb"
            with duckdb.connect(str(database)) as conn:
                conn.execute("""
                    CREATE TABLE dim_province AS
                        SELECT '22' AS prov_code, 'จันทบุรี' AS prov_name_th;
                    CREATE TABLE dim_amphoe AS
                        SELECT '22' AS prov_code, '2201' AS amphoe_code, 'เมืองจันทบุรี' AS amphoe_name_th
                        UNION ALL SELECT '22', '2202', 'ขลุง';
                    CREATE TABLE hotspots AS
                        SELECT yr AS year_th, mo AS month_th, '22' AS prov_code,
                               a AS amphoe_code, a_name AS amphoe_name_th, 'พื้นที่เกษตร' AS lu_name,
                               102.11 AS longitude, 12.14 AS latitude, sat AS satellite,
                               static AS is_suspected_static, make_date(yr,mo,1) AS acq_date_th,
                               make_date(yr,mo,1) acq_date_utc, row_number() OVER ()::VARCHAR acq_time_utc,
                               'VIIRS' instrument, row_number() OVER ()::VARCHAR hotspot_id
                        FROM (VALUES
                            (2024,4,'2201','เมืองจันทบุรี','N',false),
                            (2025,4,'2201','เมืองจันทบุรี','N',false),
                            (2026,4,'2209','นายายอาม','N',false),
                            (2026,4,'2209','นายายอาม','N20',false),
                            (2026,4,'2209','นายายอาม','N',true),
                            (2026,11,'2209','นายายอาม','N',false)
                        ) v(yr,mo,a,a_name,sat,static);
                """)
            rows = {(r["p"], r["a"]): r for r in build_data(database)["areas"]}
        self.assertEqual(rows[("22", None)]["repeat"], [1, 1, 1])
        district = rows[("22", "2209")]
        self.assertTrue(district["fromPoints"])
        self.assertEqual(district["repeat"], [1, 0, 0])
        self.assertEqual(sum(district["counts"][4]), 1)
        self.assertEqual(sum(rows[("22", "2202")]["counts"][4]), 0)
