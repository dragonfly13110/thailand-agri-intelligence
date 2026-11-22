"""Unit tests for nationwide farm-fire x PM2.5 station x hourly wind analysis."""

from datetime import date, timedelta
import io
import sys
import unittest
import zipfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import analyze_farm_fire_pm25 as mod


def _make_synthetic_xlsx(headers: list[str], rows: list[list[str]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="DATA" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>",
        )
        strings: list[str] = []
        s_idx: dict[str, int] = {}

        def _intern(val: str) -> int:
            if val not in s_idx:
                s_idx[val] = len(strings)
                strings.append(val)
            return s_idx[val]

        def _col(c: int) -> str:
            res = ""
            n = c + 1
            while n > 0:
                n, rem = divmod(n - 1, 26)
                res = chr(ord("A") + rem) + res
            return res

        row_xmls = []
        all_rows = [headers] + rows
        for r_i, r_vals in enumerate(all_rows, 1):
            cells = []
            for c_i, val in enumerate(r_vals):
                if val is None or val == "":
                    continue
                ref = f"{_col(c_i)}{r_i}"
                if r_i == 1 or not val.replace(".", "", 1).replace("-", "", 1).isdigit():
                    idx = _intern(val)
                    cells.append(f'<c r="{ref}" t="s"><v>{idx}</v></c>')
                else:
                    cells.append(f'<c r="{ref}"><v>{val}</v></c>')
            row_xmls.append(f'<row r="{r_i}">{"".join(cells)}</row>')

        si_xml = "".join(f"<si><t>{s}</t></si>" for s in strings)
        zf.writestr(
            "xl/sharedStrings.xml",
            f'<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{si_xml}</sst>',
        )
        zf.writestr(
            "xl/worksheets/sheet1.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(row_xmls)}</sheetData></worksheet>',
        )
    return buf.getvalue()


class FarmFirePm25Tests(unittest.TestCase):
    def test_bearing_and_wind_plume_classification_with_wraparound(self):
        # Fire due north of station -> bearing ~0 deg
        brg_north = float(mod.bearing_deg(14.0, 100.0, 14.2, 100.0))
        self.assertLess(mod.angular_diff_deg(brg_north, 0.0), 1.0)

        # Wind blowing FROM 355 deg (near 0 deg wraparound) -> fire is upwind!
        self.assertEqual(mod.classify_wind_plume(brg_north, 355.0, 10.0), "upwind")
        # Wind blowing FROM 180 deg (south) -> fire to the north is downwind/non-upwind control
        self.assertEqual(mod.classify_wind_plume(brg_north, 180.0, 10.0), "non_upwind")
        # Crosswind from east (90 deg) -> neither upwind nor >=90? 90 deg == non_upwind_min; 60 deg is crosswind
        self.assertEqual(mod.classify_wind_plume(brg_north, 60.0, 10.0), "crosswind")
        # Calm wind (<3.6 km/h) must not be assigned a directional cone
        self.assertEqual(mod.classify_wind_plume(brg_north, 0.0, 2.0), "calm_or_missing")
        # Haversine sanity: 1 degree latitude ~111.2 km
        self.assertAlmostEqual(float(mod.haversine_km(14.0, 100.0, 15.0, 100.0)), 111.19, delta=0.3)

    def test_clean_air4thai_value_preserves_missing_as_nan(self):
        for bad in (None, "", "  ", "-1", -1, -999, "-999", "N/A", "-", 1500.0, float("nan"), float("inf")):
            self.assertTrue(np.isnan(mod.clean_air4thai_value(bad)), f"Expected NaN for {bad!r}")
        self.assertEqual(mod.clean_air4thai_value("24.5"), 24.5)
        self.assertEqual(mod.clean_air4thai_value(0), 0.0)

    def test_parse_air4thai_daily_xlsx_sparse_cells_and_serial_dates(self):
        # 2026-01-01 Excel serial is 46023; 2026-01-02 is 46024; footer "319" skipped
        raw = _make_synthetic_xlsx(
            ["Date", "02T", "36T"],
            [
                ["46023", "45.2", "-1"],
                ["46024", "", "18.4"],
                ["319", "99", "99"],
            ],
        )
        dates, stations, mat = mod.parse_air4thai_daily_xlsx(raw)
        self.assertEqual(dates, [date(2026, 1, 1), date(2026, 1, 2)])
        self.assertEqual(stations, ["02t", "36t"])
        self.assertAlmostEqual(float(mat[0, 0]), 45.2, places=3)
        self.assertTrue(np.isnan(mat[0, 1]))
        self.assertTrue(np.isnan(mat[1, 0]))
        self.assertAlmostEqual(float(mat[1, 1]), 18.4, places=3)

    def test_within_fe_ols_recovers_upwind_signal_and_zero_placebo(self):
        rng = np.random.default_rng(42)
        n_groups = 12
        n_per_group = 30
        n = n_groups * n_per_group
        group_ids = np.repeat(np.arange(n_groups), n_per_group)
        week_ids = np.arange(n) // 7
        group_fe = rng.normal(25.0, 5.0, size=n_groups)[group_ids]
        upwind = rng.uniform(0.0, 3.0, size=n)
        placebo = rng.uniform(0.0, 3.0, size=n)
        y = group_fe + 6.0 * upwind + 0.0 * placebo + rng.normal(0.0, 0.5, size=n)

        res = mod.within_fe_ols_with_block_bootstrap(
            y, np.column_stack([upwind, placebo]), group_ids, week_ids, n_boot=300, seed=7
        )
        self.assertEqual(res["n_obs"], n)
        self.assertGreater(res["ci_low"][0], 5.0)
        self.assertLess(res["ci_high"][0], 7.0)
        self.assertLess(abs(res["beta"][1]), 0.3)

    def test_sufficiency_gates_explicit_statuses(self):
        self.assertEqual(
            mod.evaluate_sufficiency_status(
                stations_in_prov=0, valid_obs=0, clean_events=0, total_agri_events=0,
                min_valid_obs=60, min_clean_events=10,
            ),
            "insufficient_no_station",
        )
        self.assertEqual(
            mod.evaluate_sufficiency_status(
                stations_in_prov=1, valid_obs=40, clean_events=15, total_agri_events=20,
                min_valid_obs=60, min_clean_events=10,
            ),
            "insufficient_valid_obs",
        )
        self.assertEqual(
            mod.evaluate_sufficiency_status(
                stations_in_prov=1, valid_obs=200, clean_events=3, total_agri_events=25,
                min_valid_obs=60, min_clean_events=10,
            ),
            "insufficient_confounded",
        )
        self.assertEqual(
            mod.evaluate_sufficiency_status(
                stations_in_prov=1, valid_obs=200, clean_events=4, total_agri_events=4,
                min_valid_obs=60, min_clean_events=10,
            ),
            "insufficient_clean_events",
        )
        self.assertEqual(
            mod.evaluate_sufficiency_status(
                stations_in_prov=0, valid_obs=200, clean_events=15, total_agri_events=15,
                min_valid_obs=60, min_clean_events=10,
            ),
            "sufficient_cross_province",
        )


if __name__ == "__main__":
    unittest.main()
