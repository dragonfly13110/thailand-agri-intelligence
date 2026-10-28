"""Offline tests for the TMD HPC NWP normalization module.

Everything here is fully offline: tiny CSV fixtures are written into a
temporary directory, no network call is made and no production file is read.
The assertions encode the contract of the work order (sections 3.2 - 3.4 and
3.7): missing stays missing, zero stays zero, the grid orientation is
row-major with row 0 at the north edge, out-of-bbox cells are dropped and
counted, wind direction is quarantined and the province registry never
fabricates coordinates.
"""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from tadih import tmd_hpc_normalize as norm
from tadih.tmd_hpc_normalize import (
    GRID_CELL_DEG,
    GRID_CELLS,
    GRID_NX,
    GRID_NY,
    METHOD_PROVINCE,
    METHOD_PROVINCE_FALLBACK,
    TMD_HPC_PROVINCE_GEOJSON_MISSING,
    TMD_HPC_THRESHOLDS_INVALID,
    TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP,
    TmdHpcLayoutError,
    TmdHpcParseError,
    TmdHpcWindColumnSuspectError,
    aggregate_provinces,
    build_export,
    detect_layout,
    downsample_grid,
    load_province_reference_points,
    load_thresholds,
    normalize_run,
    parse_grid_csv,
)

RUN_ID = "tmd_hpc_d02_2026102600"
INIT_AT = "2026-10-26T00:00:00Z"
RETRIEVED_AT = "2026-10-26T08:30:00Z"

ISO_HEADER = ["lat", "lon", "2026-10-26_00:00Z", "2026-10-26T06:00:00Z"]
COMPACT_HEADER = ["lat", "lon", "2026102600", "2026102606"]
DAILY_HEADER = ["lat", "lon", "00:00Z 2026-10-26", "00:00Z 2026-10-27"]
META_HEADER = ["time", "lat", "lon", "2026102600", "2026102606"]


def write_csv(path, header, rows):
    lines = [",".join(str(cell) for cell in header)]
    for row in rows:
        lines.append(",".join(str(cell) for cell in row))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def square_ring(center_lon, center_lat, half=0.05):
    """Closed square ring whose centroid is exactly (center_lon, center_lat)."""
    lon0, lon1 = center_lon - half, center_lon + half
    lat0, lat1 = center_lat - half, center_lat + half
    return [
        [lon0, lat0],
        [lon1, lat0],
        [lon1, lat1],
        [lon0, lat1],
        [lon0, lat0],
    ]


def feature(code, name_th, name_en, lon, lat):
    return {
        "type": "Feature",
        "properties": {
            "PROV_CODE": code,
            "PROV_NAM_T": name_th,
            "PROV_NAM_E": name_en,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [square_ring(lon, lat)],
        },
    }


def write_geojson(path, features):
    payload = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def manifest_for(run_dir, files, *, variables, status="ready"):
    """Build a Lane A compatible manifest for the fixture files."""
    entries = []
    for variable, filename in files:
        target = run_dir / filename
        payload = target.read_bytes()
        entries.append({
            "variable": variable,
            "filename": filename,
            "url": f"/static/csv/2026102600/{filename}",
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "format": "CSV",
            "status": "ok",
        })
    return {
        "source_id": "tmd_hpc_nwp",
        "source_agency": "กรมอุตุนิยมวิทยา (TMD)",
        "contract_version": 1,
        "run_id": RUN_ID,
        "domain": "d02",
        "domain_label": "Thailand 3km",
        "init_at": INIT_AT,
        "retrieved_at": RETRIEVED_AT,
        "base_url": "https://hpc.tmd.go.th",
        "license_status": "pending",
        "unit_status": "pending_official_confirmation",
        "publication_mode": "numeric_preview",
        "variables": list(variables),
        "lead_hours": [0, 6, 12, 24, 48, 72],
        "grid": {
            "bbox": [96.0, 5.0, 106.0, 21.0],
            "source_cell_deg": 0.0277,
            "output_cell_deg": 0.15,
            "nx": 67,
            "ny": 107,
        },
        "files": entries,
        "status": status,
    }


class TempFixture(unittest.TestCase):
    """Base class providing a temporary directory."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)


class TestLayoutDetection(TempFixture):
    def test_detects_iso_columns(self):
        self.assertEqual(detect_layout(ISO_HEADER), "iso_z")
        self.assertEqual(
            detect_layout(["lat", "lon", "2026-10-26T00:00:00Z"]), "iso_z")

    def test_detects_compact_init_columns(self):
        self.assertEqual(detect_layout(COMPACT_HEADER), "compact_init")

    def test_detects_daily_accumulation_columns(self):
        self.assertEqual(detect_layout(DAILY_HEADER), "daily_z")

    def test_rejects_daily_layout_with_extra_columns(self):
        path = write_csv(self.tmp / "x.csv", DAILY_HEADER + ["level"],
                         [[1.0, 2.0, 3.0, 4.0, 5.0]])
        with self.assertRaises(TmdHpcLayoutError):
            parse_grid_csv(path, variable="p24h", layout="daily_z")

    def test_detects_metadata_column(self):
        self.assertEqual(detect_layout(META_HEADER), "with_meta")
        self.assertEqual(
            detect_layout(["lat", "lon", "2026-10-26_00:00Z", "level"]),
            "with_meta")

    def test_rejects_non_grid_header(self):
        with self.assertRaises(TmdHpcLayoutError):
            detect_layout(["foo", "bar"])
        with self.assertRaises(TmdHpcLayoutError):
            detect_layout(["lat", "lon"])

    def test_rejects_unknown_forced_layout(self):
        path = write_csv(self.tmp / "x.csv", ISO_HEADER, [[1.0, 2.0, 3.0, 4.0]])
        with self.assertRaises(TmdHpcLayoutError):
            parse_grid_csv(path, variable="p1h", layout="nonsense")


class TestParseGridCsv(TempFixture):
    def test_valid_at_derivation_per_layout(self):
        iso = write_csv(self.tmp / "iso.csv", ISO_HEADER,
                        [[13.0, 100.0, 1.0, 2.0]])
        parsed = parse_grid_csv(iso, variable="p1h")
        self.assertEqual(parsed["layout"], "iso_z")
        self.assertEqual(parsed["times"],
                         ["2026-10-26T00:00:00Z", "2026-10-26T06:00:00Z"])

        compact = write_csv(self.tmp / "compact.csv", COMPACT_HEADER,
                            [[13.0, 100.0, 1.0, 2.0]])
        parsed = parse_grid_csv(compact, variable="p1h")
        self.assertEqual(parsed["layout"], "compact_init")
        self.assertEqual(parsed["times"],
                         ["2026-10-26T00:00:00Z", "2026-10-26T06:00:00Z"])

        meta = write_csv(self.tmp / "meta.csv", META_HEADER,
                         [["ignored", 13.0, 100.0, 1.0, 2.0]])
        parsed = parse_grid_csv(meta, variable="p1h")
        self.assertEqual(parsed["layout"], "with_meta")
        self.assertEqual(parsed["times"],
                         ["2026-10-26T00:00:00Z", "2026-10-26T06:00:00Z"])
        self.assertEqual(parsed["latitudes"], [13.0])
        self.assertEqual(parsed["longitudes"], [100.0])
        self.assertEqual(parsed["values"]["2026-10-26T00:00:00Z"], [1.0])

    def test_daily_accumulation_header_becomes_utc_instants(self):
        path = write_csv(self.tmp / "daily.csv", DAILY_HEADER,
                         [[13.0, 100.0, 12.0, 34.0]])
        parsed = parse_grid_csv(path, variable="p24h")
        self.assertEqual(parsed["layout"], "daily_z")
        self.assertEqual(parsed["times"],
                         ["2026-10-26T00:00:00Z", "2026-10-27T00:00:00Z"])
        self.assertEqual(parsed["values"]["2026-10-27T00:00:00Z"], [34.0])

    def test_missing_value_stays_null(self):
        path = write_csv(self.tmp / "m.csv", ISO_HEADER,
                         [[13.0, 100.0, "", 2.0],
                          [13.1, 100.1, "null", 3.0],
                          [13.2, 100.2, "-9999", 4.0]])
        parsed = parse_grid_csv(path, variable="p1h")
        values = parsed["values"]["2026-10-26T00:00:00Z"]
        self.assertEqual(values, [None, None, None])
        self.assertNotIn(0.0, values)

    def test_literal_zero_stays_zero(self):
        path = write_csv(self.tmp / "z.csv", ISO_HEADER,
                         [[13.0, 100.0, 0.0, 0.0]])
        parsed = parse_grid_csv(path, variable="p1h")
        self.assertEqual(parsed["values"]["2026-10-26T00:00:00Z"], [0.0])
        self.assertEqual(parsed["values"]["2026-10-26T06:00:00Z"], [0.0])

    def test_kelvin_converted_to_celsius(self):
        path = write_csv(self.tmp / "t.csv", ISO_HEADER,
                         [[13.0, 100.0, 301.15, 273.15]])
        parsed = parse_grid_csv(path, variable="t2m")
        self.assertEqual(parsed["source_unit"], "K")
        self.assertEqual(parsed["transform"], "K-273.15")
        self.assertAlmostEqual(
            parsed["values"]["2026-10-26T00:00:00Z"][0], 28.0, places=9)
        self.assertAlmostEqual(
            parsed["values"]["2026-10-26T06:00:00Z"][0], 0.0, places=9)

    def test_implausible_kelvin_becomes_missing(self):
        path = write_csv(self.tmp / "t2.csv", ISO_HEADER,
                         [[13.0, 100.0, 5000.0, 301.15]])
        parsed = parse_grid_csv(path, variable="t2m")
        values = parsed["values"]["2026-10-26T00:00:00Z"]
        self.assertIsNone(values[0])
        later = parsed["values"]["2026-10-26T06:00:00Z"]
        self.assertIsNotNone(later[0])

    def test_unparseable_value_fails_loudly(self):
        path = write_csv(self.tmp / "bad.csv", ISO_HEADER,
                         [[13.0, 100.0, "hot", 2.0]])
        with self.assertRaises(TmdHpcParseError):
            parse_grid_csv(path, variable="p1h")

    def test_missing_file_raises(self):
        with self.assertRaises(TmdHpcParseError):
            parse_grid_csv(self.tmp / "nope.csv", variable="p1h")


class TestWindQuarantine(TempFixture):
    def test_direction_values_raise(self):
        path = write_csv(self.tmp / "ws.csv", ISO_HEADER,
                         [[13.0, 100.0, 210.5, 180.0]])
        with self.assertRaises(TmdHpcWindColumnSuspectError) as caught:
            parse_grid_csv(path, variable="ws10m")
        self.assertEqual(caught.exception.code,
                         TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP)
        self.assertIn("direction", str(caught.exception))

    def test_plausible_speed_does_not_raise(self):
        path = write_csv(self.tmp / "ws2.csv", ISO_HEADER,
                         [[13.0, 100.0, 3.5, 12.0]])
        parsed = parse_grid_csv(path, variable="ws10m")
        self.assertEqual(parsed["values"]["2026-10-26T00:00:00Z"], [3.5])

    def test_quarantined_variable_lands_in_excluded(self):
        raw_dir = self.tmp / "raw" / RUN_ID
        raw_dir.mkdir(parents=True)
        write_csv(raw_dir / "p1h.d02.2026102600.csv", ISO_HEADER,
                  [[13.0, 100.0, 1.0, 2.0]])
        write_csv(raw_dir / "ws10m.d02.2026102600.csv", ISO_HEADER,
                  [[13.0, 100.0, 210.5, 180.0]])
        geojson = write_geojson(
            self.tmp / "provinces.geojson",
            [feature("10", "กรุงเทพมหานคร", "Bangkok", 100.5, 13.75)])
        manifest = manifest_for(
            raw_dir,
            [("p1h", "p1h.d02.2026102600.csv"),
             ("ws10m", "ws10m.d02.2026102600.csv")],
            variables=["p1h", "ws10m"])

        envelope = normalize_run(manifest, output_dir=self.tmp,
                                 province_geojson=geojson)
        self.assertEqual(envelope["variables"], ["p1h"])
        self.assertEqual(len(envelope["excluded"]), 1)
        excluded = envelope["excluded"][0]
        self.assertEqual(excluded["variable"], "ws10m")
        self.assertEqual(excluded["reason_code"],
                         TMD_HPC_WIND_COLUMN_SUSPECTED_SWAP)
        self.assertTrue(excluded["reason"])
        self.assertFalse([row for row in envelope["provinces"]
                          if row["variable"] == "ws10m"])
        self.assertFalse([row for row in envelope["snapshots"]
                          if row["variable"] == "ws10m"])


class TestDownsample(TempFixture):
    def setUp(self):
        super().setUp()
        self.rows = [
            [20.99, 96.01, 5.0, 6.0],   # row 0 (north edge)
            [5.01, 96.01, 7.0, 8.0],    # last row (south edge)
            [13.0, 95.0, 9.0, 10.0],    # west of the bbox -> dropped
            [30.0, 100.0, 11.0, 12.0],  # north of the bbox -> dropped
        ]
        self.path = write_csv(self.tmp / "grid.csv", ISO_HEADER, self.rows)

    def test_array_lengths_match_grid_shape(self):
        parsed = parse_grid_csv(self.path, variable="p1h")
        grid = downsample_grid(parsed, "2026-10-26T00:00:00Z")
        self.assertEqual(grid["nx"], GRID_NX)
        self.assertEqual(grid["ny"], GRID_NY)
        self.assertEqual(len(grid["mean"]), GRID_CELLS)
        self.assertEqual(len(grid["max"]), GRID_CELLS)
        self.assertEqual(len(grid["count"]), GRID_CELLS)
        self.assertEqual(len(grid["mean"]), grid["nx"] * grid["ny"])
        self.assertEqual(grid["bbox"], [96.0, 5.0, 106.0, 21.0])
        self.assertEqual(grid["cell_deg"], GRID_CELL_DEG)

    def test_row_zero_is_north(self):
        parsed = parse_grid_csv(self.path, variable="p1h")
        grid = downsample_grid(parsed, "2026-10-26T00:00:00Z")
        north_index = 0 * GRID_NX + 0
        south_index = (GRID_NY - 1) * GRID_NX + 0
        self.assertEqual(grid["mean"][north_index], 5.0)
        self.assertEqual(grid["max"][north_index], 5.0)
        self.assertEqual(grid["count"][north_index], 1)
        self.assertEqual(grid["mean"][south_index], 7.0)
        self.assertEqual(grid["max"][south_index], 7.0)
        self.assertEqual(grid["count"][south_index], 1)
        # everything else stays missing, never 0
        self.assertIsNone(grid["mean"][north_index + 1])
        self.assertEqual(grid["count"][north_index + 1], 0)

    def test_out_of_bbox_cells_are_dropped_and_counted(self):
        parsed = parse_grid_csv(self.path, variable="p1h")
        grid = downsample_grid(parsed, "2026-10-26T00:00:00Z")
        self.assertEqual(grid["dropped_out_of_bbox"], 2)
        self.assertEqual(grid["source_cells"], 2)

    def test_missing_is_not_zero_in_the_block_count(self):
        path = write_csv(self.tmp / "holes.csv", ISO_HEADER,
                         [[20.99, 96.01, "", ""],
                          [20.98, 96.01, 1.0, 2.0]])
        parsed = parse_grid_csv(path, variable="p1h")
        grid = downsample_grid(parsed, "2026-10-26T00:00:00Z")
        self.assertEqual(grid["count"][0], 1)
        self.assertEqual(grid["mean"][0], 1.0)

    def test_valid_at_is_required_for_ambiguous_grids(self):
        parsed = parse_grid_csv(self.path, variable="p1h")
        with self.assertRaises(ValueError):
            downsample_grid(parsed)


class TestProvinces(TempFixture):
    def _grid(self, value):
        grid = {
            "nx": GRID_NX,
            "ny": GRID_NY,
            "bbox": [96.0, 5.0, 106.0, 21.0],
            "cell_deg": GRID_CELL_DEG,
            "mean": [None] * GRID_CELLS,
            "max": [None] * GRID_CELLS,
            "count": [0] * GRID_CELLS,
        }
        grid["max"][52 * GRID_NX + 26] = value
        grid["mean"][52 * GRID_NX + 26] = value
        grid["count"][52 * GRID_NX + 26] = 1
        return grid

    def test_max_within_radius(self):
        grid = self._grid(62.4)
        province = {
            "province_code": "73",
            "province_name": "นครปฐม",
            "reference_lat": 13.0,
            "reference_lon": 100.0,
        }
        rows = aggregate_provinces(grid, [province])
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["province_code"], "73")
        self.assertEqual(row["province_name"], "นครปฐม")
        self.assertEqual(row["value"], 62.4)
        self.assertEqual(row["method"], METHOD_PROVINCE)
        self.assertEqual(row["radius_km"], 25.0)
        self.assertEqual(row["cell_count"], 1)
        self.assertLess(row["distance_km"], 25.0)
        self.assertGreater(row["distance_km"], 0.0)

    def test_nearest_cell_fallback(self):
        grid = self._grid(62.4)
        province = {
            "province_code": "73",
            "province_name": "นครปฐม",
            "reference_lat": 30.0,
            "reference_lon": 100.0,
        }
        rows = aggregate_provinces(grid, [province])
        row = rows[0]
        self.assertEqual(row["method"], METHOD_PROVINCE_FALLBACK)
        self.assertGreater(row["distance_km"], 25.0)
        self.assertEqual(row["cell_count"], 1)

    def test_province_without_value_is_null(self):
        grid = {
            "nx": GRID_NX,
            "ny": GRID_NY,
            "bbox": [96.0, 5.0, 106.0, 21.0],
            "cell_deg": GRID_CELL_DEG,
            "mean": [None] * GRID_CELLS,
            "max": [None] * GRID_CELLS,
            "count": [0] * GRID_CELLS,
        }
        province = {
            "province_code": "10",
            "province_name": "กรุงเทพมหานคร",
            "reference_lat": 13.75,
            "reference_lon": 100.5,
        }
        rows = aggregate_provinces(grid, [province])
        self.assertIsNone(rows[0]["value"])
        self.assertEqual(rows[0]["cell_count"], 0)

    def test_missing_geojson_raises_clear_error(self):
        with self.assertRaises(norm.TmdHpcNormalizeError) as caught:
            load_province_reference_points(self.tmp / "absent.geojson")
        self.assertEqual(caught.exception.code,
                         TMD_HPC_PROVINCE_GEOJSON_MISSING)
        self.assertIn("fabricat", str(caught.exception))

    def test_reference_points_come_from_geometry(self):
        path = write_geojson(
            self.tmp / "p.geojson",
            [feature("10", "กรุงเทพมหานคร", "Bangkok", 100.5, 13.75)])
        provinces = load_province_reference_points(path)
        self.assertEqual(len(provinces), 1)
        self.assertAlmostEqual(provinces[0]["reference_lat"], 13.75, places=6)
        self.assertAlmostEqual(provinces[0]["reference_lon"], 100.5, places=6)
        self.assertEqual(provinces[0]["province_code"], "10")

class TestThresholds(unittest.TestCase):
    def test_canonical_file_loads(self):
        thresholds = load_thresholds()
        self.assertEqual(thresholds["version"], 1)
        self.assertIn("not official TMD warnings", thresholds["source"])
        self.assertEqual(set(thresholds["variables"]),
                         {"p1h", "p24h", "t2m", "rhum", "ws10m"})
        self.assertEqual(thresholds["variables"]["p24h"]["watch"], 20)
        self.assertEqual(thresholds["variables"]["p24h"]["high"], 50)
        self.assertEqual(thresholds["variables"]["p24h"]["severe"], 90)

    def test_malformed_threshold_file_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            path.write_text(json.dumps({
                "version": 1,
                "source": "x",
                "variables": {"p24h": {"unit": "mm", "watch": "twenty",
                                       "high": 50, "severe": 90}},
            }), encoding="utf-8")
            with self.assertRaises(norm.TmdHpcNormalizeError) as caught:
                load_thresholds(path)
            self.assertEqual(caught.exception.code, TMD_HPC_THRESHOLDS_INVALID)

    def test_unknown_variable_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            path.write_text(json.dumps({
                "version": 1,
                "source": "x",
                "variables": {"snow": {"unit": "mm", "watch": 1, "high": 2,
                                       "severe": 3}},
            }), encoding="utf-8")
            with self.assertRaises(norm.TmdHpcNormalizeError):
                load_thresholds(path)

    def test_missing_file_raises(self):
        with self.assertRaises(norm.TmdHpcNormalizeError):
            load_thresholds(Path(tempfile.gettempdir()) / "no-such-thresholds.json")


class TestNormalizeRun(TempFixture):
    def setUp(self):
        super().setUp()
        self.raw_dir = self.tmp / "raw" / RUN_ID
        self.raw_dir.mkdir(parents=True)
        write_csv(self.raw_dir / "p24h.d02.2026102600.csv",
                  ["lat", "lon", "2026102600", "2026102700"],
                  [[13.0, 100.0, 12.5, 20.0],
                   [20.99, 96.01, 0.0, 0.0]])
        write_csv(self.raw_dir / "t2m.d02.2026102600.csv",
                  ["lat", "lon", "2026102600", "2026102700"],
                  [[13.0, 100.0, 301.15, 298.15],
                   [20.99, 96.01, 301.15, 301.15]])
        self.geojson = write_geojson(
            self.tmp / "provinces.geojson",
            [feature("10", "กรุงเทพมหานคร", "Bangkok", 100.5, 13.75),
             feature("73", "นครปฐม", "Nakhon Pathom", 100.0, 13.0)])
        self.manifest = manifest_for(
            self.raw_dir,
            [("p24h", "p24h.d02.2026102600.csv"),
             ("t2m", "t2m.d02.2026102600.csv")],
            variables=["p24h", "t2m"])

    def test_envelope_contract(self):
        envelope = normalize_run(self.manifest, output_dir=self.tmp,
                                 province_geojson=self.geojson)
        for key in ("run_id", "source_id", "domain", "domain_label", "init_at",
                    "retrieved_at", "license_status", "unit_status",
                    "publication_mode", "variables", "lead_hours_by_variable",
                    "excluded", "grid", "snapshots", "provinces"):
            self.assertIn(key, envelope)
        self.assertEqual(envelope["run_id"], RUN_ID)
        self.assertEqual(envelope["source_id"], "tmd_hpc_nwp")
        self.assertEqual(envelope["domain"], "d02")
        self.assertEqual(envelope["init_at"], INIT_AT)
        self.assertEqual(envelope["license_status"], "pending")
        self.assertEqual(envelope["unit_status"],
                         "pending_official_confirmation")
        self.assertEqual(envelope["publication_mode"], "numeric_preview")
        self.assertEqual(envelope["grid"],
                         {"bbox": [96.0, 5.0, 106.0, 21.0], "nx": 67,
                          "ny": 107, "cell_deg": 0.15})
        self.assertEqual(envelope["excluded"], [])
        self.assertEqual(envelope["variables"], ["p24h", "t2m"])

    def test_lead_hours_are_derived_from_the_columns(self):
        envelope = normalize_run(self.manifest, output_dir=self.tmp,
                                 province_geojson=self.geojson)
        self.assertEqual(envelope["lead_hours_by_variable"]["p24h"], [0, 24])
        self.assertEqual(envelope["lead_hours_by_variable"]["t2m"], [0, 24])

    def test_snapshots_keep_missing_as_null(self):
        envelope = normalize_run(self.manifest, output_dir=self.tmp,
                                 province_geojson=self.geojson)
        snapshot = envelope["snapshots"][0]
        self.assertEqual(snapshot["variable"], "p24h")
        self.assertEqual(snapshot["valid_at"], "2026-10-26T00:00:00Z")
        self.assertIsNone(snapshot["unit"])
        self.assertEqual(snapshot["unit_status"],
                         "pending_official_confirmation")
        self.assertEqual(len(snapshot["mean"]), GRID_CELLS)
        self.assertEqual(len(snapshot["max"]), GRID_CELLS)
        self.assertEqual(len(snapshot["count"]), GRID_CELLS)
        self.assertIsNone(snapshot["mean"][13 * GRID_NX + 26])

    def test_t2m_values_are_celsius_with_unit_metadata(self):
        envelope = normalize_run(self.manifest, output_dir=self.tmp,
                                 province_geojson=self.geojson)
        snapshot = [item for item in envelope["snapshots"]
                    if item["variable"] == "t2m"][0]
        self.assertEqual(snapshot["source_unit"], "K")
        self.assertEqual(snapshot["unit_transform"], "K-273.15")
        self.assertIsNone(snapshot["unit"])
        # source cell (lat 13.0, lon 100.0) -> row 53, column 26
        self.assertAlmostEqual(snapshot["max"][53 * GRID_NX + 26], 28.0,
                               places=6)

    def test_provinces_cover_the_registry(self):
        envelope = normalize_run(self.manifest, output_dir=self.tmp,
                                 province_geojson=self.geojson)
        codes = {row["province_code"] for row in envelope["provinces"]}
        self.assertEqual(codes, {"10", "73"})
        instants = {row["valid_at"] for row in envelope["provinces"]}
        self.assertEqual(instants,
                         {"2026-10-26T00:00:00Z", "2026-10-27T00:00:00Z"})
        for row in envelope["provinces"]:
            self.assertIn(row["variable"], ("p24h", "t2m"))
            self.assertIn(row["method"],
                          (METHOD_PROVINCE, METHOD_PROVINCE_FALLBACK))
            self.assertEqual(row["radius_km"], 25.0)
            self.assertIsNotNone(row["distance_km"])

    def test_variable_filter(self):
        envelope = normalize_run(self.manifest, variables=["p24h"],
                                 output_dir=self.tmp,
                                 province_geojson=self.geojson)
        self.assertEqual(envelope["variables"], ["p24h"])
        self.assertNotIn("t2m", envelope["lead_hours_by_variable"])

    def test_build_export_matches_the_d1_shape(self):
        envelope = normalize_run(self.manifest, output_dir=self.tmp,
                                 province_geojson=self.geojson)
        export = build_export(envelope)
        self.assertEqual(export["schema_version"], 1)
        self.assertEqual(export["run"]["run_id"], RUN_ID)
        self.assertEqual(export["run"]["lead_hours"], [0, 24])
        self.assertEqual(export["run"]["variables"], ["p24h", "t2m"])
        snapshot = export["snapshots"][0]
        self.assertEqual(set(snapshot),
                         {"variable", "valid_at", "unit", "bbox", "nx", "ny",
                          "mean", "max", "quality"})
        self.assertEqual(len(snapshot["quality"]["count"]), GRID_CELLS)
        self.assertEqual(snapshot["quality"]["method"], "block_mean_0.15deg")
        self.assertEqual(len(export["provinces"]), len(envelope["provinces"]))
        self.assertEqual(export["excluded"], [])

    def test_verify_manifest_detects_a_missing_raw_file(self):
        (self.raw_dir / "p24h.d02.2026102600.csv").unlink()
        with self.assertRaises(norm.TmdHpcNormalizeError):
            normalize_run(self.manifest, output_dir=self.tmp,
                          province_geojson=self.geojson)


if __name__ == "__main__":
    unittest.main()
