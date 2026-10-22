import copy
import unittest

from tadih.catalog import PROVINCE_CODES
from tadih.geography import match_admin_names, parse_admin_rows, validate_province_boundaries


class GeographyTests(unittest.TestCase):
    def test_hierarchy_uses_source_codes_and_retains_retired_rows(self):
        rows = [{"A": "10000000", "B": "กรุงเทพมหานคร", "D": "0"},
            {"A": "10010000", "B": "เขตพระนคร", "D": "0"},
            {"A": "10010100", "B": "พระบรมมหาราชวัง", "D": "0"},
            {"A": "10010200", "B": "เก่า*", "D": "25490101"}]
        result = parse_admin_rows(rows, require_national=False)
        self.assertEqual(result[2]["area_code"], "100101")
        self.assertEqual(result[2]["parent_code"], "1001")
        self.assertIsNone(result[2]["valid_from"])
        self.assertEqual(result[3]["valid_to"], "2006-01-01")
        self.assertTrue(result[3]["retired"])
        historical = parse_admin_rows(rows + [{"A": "97059600", "B": "source anomaly*", "D": "25490101"}], require_national=False)
        self.assertEqual(historical[-1]["scope_status"], "unverified_historical_prefix")
        for invalid in (rows+rows[:1], rows[1:], [{**rows[0], "D": "25490101"}]):
            with self.assertRaises(ValueError):
                parse_admin_rows(invalid, require_national=False)
        with self.assertRaises(ValueError):
            parse_admin_rows(rows)

    def test_boundaries_require_all_codes_closed_finite_rings(self):
        ring = [[100, 13], [101, 13], [101, 14], [100, 13]]
        payload = {"type": "FeatureCollection", "features": [{"properties": {"PROV_CODE": code},
            "geometry": {"type": "Polygon", "coordinates": [copy.deepcopy(ring)]}} for code in sorted(PROVINCE_CODES)]}
        self.assertEqual(validate_province_boundaries(payload)["province_count"], 77)
        for mutate in (lambda p: p["features"].pop(),
                       lambda p: p["features"][0]["geometry"]["coordinates"][0].pop(),
                       lambda p: p["features"][0]["geometry"]["coordinates"][0][1].__setitem__(0, float("nan"))):
            invalid = copy.deepcopy(payload)
            mutate(invalid)
            with self.assertRaises(ValueError):
                validate_province_boundaries(invalid)

    def test_name_matching_never_leaves_parent_and_ignores_retired_codes(self):
        master = parse_admin_rows([{"A": "10000000", "B": "กรุงเทพมหานคร"},
            {"A": "10010000", "B": "เขตพระนคร"}, {"A": "10010100", "B": "ชื่อซ้ำ"},
            {"A": "10020000", "B": "เขตดุสิต"}, {"A": "10020100", "B": "ชื่อซ้ำ"},
            {"A": "10020200", "B": "เก่า*", "D": "25490101"}], require_national=False)
        match = match_admin_names("กรุงเทพมหานคร", "พระนคร", "ชื่อซ้ำ", master)
        self.assertEqual(match["subdistrict_code"], "100101")
        self.assertEqual(match_admin_names("กรุงเทพมหานคร", "เขตดุสิต", "เก่า", master)["mapping_status"], "unmatched")
        duplicate = {**master[2], "area_code": "100103"}
        self.assertEqual(match_admin_names("กรุงเทพมหานคร", "พระนคร", "ชื่อซ้ำ", master+[duplicate])["mapping_status"], "ambiguous")


if __name__ == "__main__":
    unittest.main()
