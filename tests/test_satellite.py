import json
from pathlib import Path
import tempfile
import unittest

from tadih.satellite import (
    normalize_modis_point,
    save_satellite_snapshot,
    _parse_modis_item_dates,
    LPDAAC_MOD13A1_SCALE,
    MOD13A1_FILL_VALUE,
)
from tadih.quality import validate_observation


class SatelliteTests(unittest.TestCase):
    def setUp(self):
        self.sample_point_path = Path(__file__).resolve().parents[1] / "data/local/satellite/pc_point_20240929.json"
        if self.sample_point_path.exists():
            self.sample_envelope = json.loads(self.sample_point_path.read_text(encoding="utf-8"))
        else:
            self.sample_envelope = {
                "request_url": "https://planetarycomputer.microsoft.com/api/data/v1/item/point/100.25,13.8?collection=modis-13A1-061&item=MOD13A1.A2024273.h27v07.061.2024290023005&assets=500m_16_days_NDVI&assets=500m_16_days_pixel_reliability&assets=500m_16_days_VI_Quality",
                "retrieved_at": "2026-10-22T09:32:33.617203+00:00",
                "item_id": "MOD13A1.A2024273.h27v07.061.2024290023005",
                "payload": {
                    "coordinates": [100.25, 13.8],
                    "values": [5700.0, 3.0, 36070.0],
                    "band_names": [
                        "500m_16_days_NDVI_b1",
                        "500m_16_days_pixel_reliability_b1",
                        "500m_16_days_VI_Quality_b1"
                    ]
                }
            }

    def test_parse_modis_item_dates(self):
        start, end = _parse_modis_item_dates("MOD13A1.A2024273.h27v07.061.2024290023005")
        self.assertEqual("2024-09-29T00:00:00+00:00", start)
        self.assertEqual("2024-10-14T23:59:59+00:00", end)

    def test_normalize_modis_point_cloud_flag(self):
        result = normalize_modis_point(self.sample_envelope)
        self.assertEqual(4, result["count"])
        self.assertEqual(0.5700, result["ndvi"])
        self.assertEqual(0.0, result["valid_fraction"])
        self.assertEqual("cloud_contaminated", result["quality_flag"])
        self.assertEqual("point:13.8:100.25", result["location_id"])

        obs = {o["measure"]: o for o in result["observations"]}
        self.assertTrue(all(o["release_at"] is None for o in obs.values()))
        later = {**self.sample_envelope, "retrieved_at": "2026-10-23T09:32:33Z"}
        repeated = {o["measure"]: o for o in normalize_modis_point(later)["observations"]}
        self.assertEqual(obs["ndvi"]["revision_id"], repeated["ndvi"]["revision_id"])
        self.assertIn("ndvi", obs)
        self.assertIn("ndvi_valid_pixel_fraction", obs)
        self.assertIn("pixel_reliability", obs)
        self.assertIn("vi_quality", obs)

        # Check contract validation on each row
        for o in result["observations"]:
            self.assertEqual("grid_point", o["spatial_support"])
            self.assertIsNone(o["area_code"])
            self.assertEqual("modis", o["source_id"])
            self.assertEqual("pending", o["license_status"])
            self.assertEqual("point:13.8:100.25", o["location_id"])

    def test_normalize_modis_point_good_quality(self):
        env = {
            "request_url": "https://planetarycomputer.microsoft.com/api/data/v1/item/point/100.25,13.8",
            "retrieved_at": "2026-10-22T10:00:00Z",
            "item_id": "MOD13A1.A2026273.h27v07.061.2026289235505",
            "start_datetime": "2026-09-30T00:00:00Z",
            "end_datetime": "2026-10-15T23:59:59Z",
            "payload": {
                "coordinates": [100.25, 13.8],
                "values": [6737.0, 0.0, 2116.0],
                "band_names": [
                    "500m_16_days_NDVI_b1",
                    "500m_16_days_pixel_reliability_b1",
                    "500m_16_days_VI_Quality_b1"
                ]
            }
        }
        result = normalize_modis_point(env)
        self.assertEqual(0.6737, result["ndvi"])
        self.assertEqual(1.0, result["valid_fraction"])
        self.assertEqual("good", result["quality_flag"])

    def test_fill_value_becomes_null_not_zero(self):
        env = {
            "request_url": "https://planetarycomputer.microsoft.com/api/data/v1/item/point/100.25,13.8",
            "retrieved_at": "2026-10-22T10:00:00Z",
            "item_id": "MOD13A1.A2026273.h27v07.061.2026289235505",
            "start_datetime": "2026-09-30T00:00:00Z",
            "end_datetime": "2026-10-15T23:59:59Z",
            "payload": {
                "coordinates": [100.25, 13.8],
                "values": [MOD13A1_FILL_VALUE, -1.0, None],
                "band_names": [
                    "500m_16_days_NDVI_b1",
                    "500m_16_days_pixel_reliability_b1",
                    "500m_16_days_VI_Quality_b1"
                ]
            }
        }
        result = normalize_modis_point(env)
        self.assertIsNone(result["ndvi"])
        self.assertIsNone(result["valid_fraction"])
        obs = {o["measure"]: o for o in result["observations"]}
        self.assertIsNone(obs["ndvi"]["value"])
        self.assertEqual("fill_no_data", obs["ndvi"]["quality_flag"])

    def test_save_satellite_snapshot(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            meta = save_satellite_snapshot(self.sample_envelope, tmpdir, "point-test")
            self.assertTrue(Path(meta["path"]).exists())
            manifest = json.loads((Path(tmpdir) / "point-test/manifest.json").read_text(encoding="utf-8"))
            self.assertEqual("planetary_computer", manifest["source"])
            self.assertEqual(meta["sha256"], manifest["sha256"])


if __name__ == "__main__":
    unittest.main()
