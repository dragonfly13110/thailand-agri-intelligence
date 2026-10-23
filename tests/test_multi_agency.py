"""Unit tests for multi-agency ingestion clients (DWR, Meteostat, GISTDA)."""

import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
import ssl
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from tadih.dwr_water import fetch_latest_dwr_small_water_resources
from tadih.weather import fetch_weather_stations, fetch_daily_weather_observations
from tadih.gistda import fetch_satellite_flood_7days

ROOT = Path(__file__).resolve().parents[1]


class TestMultiAgencyIngestion(unittest.TestCase):
    @patch("tadih.dwr_water.urllib.request.urlopen")
    def test_dwr_requires_tls_certificate_and_hostname(self, mock_urlopen):
        rss = MagicMock()
        rss.read.return_value = b"<rss><item><link>https://api.dwr.go.th/data.json</link></item></rss>"
        rss.__enter__.return_value = rss
        data = MagicMock()
        data.read.return_value = b"[]"
        data.__enter__.return_value = data
        mock_urlopen.side_effect = [rss, data]
        with tempfile.TemporaryDirectory() as tmp_dir:
            fetch_latest_dwr_small_water_resources(api_key="test", output_path=Path(tmp_dir) / "dwr.json")
        self.assertEqual(mock_urlopen.call_count, 2)
        for call in mock_urlopen.call_args_list:
            context = call.kwargs["context"]
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
            self.assertTrue(context.check_hostname)

    def test_fetch_weather_stations(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_file = Path(tmp_dir) / "stations.json"
            res = fetch_weather_stations(output_path=out_file)
            self.assertEqual(res["metadata"]["total_stations"], 12)
            self.assertTrue(out_file.exists())
            records = res["records"]
            self.assertEqual(records[0]["id"], "48455")
            self.assertEqual(records[0]["province_code"], "10")
            stations = {s["id"]: s for s in records}
            for station, province in {"48381": "40", "48383": "49", "48475": "77", "48565": "83"}.items():
                self.assertEqual(stations[station]["province_code"], province)
            self.assertEqual(stations["48451"]["lat"], 14.0117)
            self.assertEqual(stations["48451"]["lon"], 99.97)
            self.assertEqual(res["metadata"]["contract_version"], 2)
            self.assertFalse(res["metadata"]["live_fetch"])

    @patch("tadih.weather.urllib.request.urlopen")
    def test_fetch_daily_weather_mock(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "data": [
                {
                    "date": "2026-10-20 00:00:00",
                    "tavg": 29.5,
                    "tmin": 25.0,
                    "tmax": 34.0,
                    "prcp": 12.5,
                    "wspd": 3.2,
                    "pres": 1010.5,
                },
                {
                    "date": "2026-10-21 00:00:00",
                    "prcp": None,
                }
            ]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_file = Path(tmp_dir) / "weather.json"
            res = fetch_daily_weather_observations(
                station_ids=["48455"],
                start_date="2026-10-20",
                end_date="2026-10-22",
                api_key="mock_key",
                output_path=out_file,
            )
            self.assertEqual(res["metadata"]["total_observations"], 2)
            self.assertEqual(res["records"][0]["rainfall_mm"], 12.5)
            self.assertEqual(res["records"][0]["tavg_c"], 29.5)
            self.assertIsNone(res["records"][1]["rainfall_mm"])
            self.assertAlmostEqual(res["records"][0]["wind_speed_ms"], 3.2 / 3.6)
            self.assertEqual(res["records"][0]["wind_speed_kmh"], 3.2)
            self.assertFalse(res["records"][0]["model_substitution"])
            self.assertEqual(res["metadata"]["contract_version"], 2)
            self.assertEqual(res["metadata"]["requested_station_days"], 3)
            self.assertEqual(res["metadata"]["status"], "partial")
            params = parse_qs(urlsplit(mock_urlopen.call_args.args[0].full_url).query)
            self.assertEqual(params["model"], ["false"])
            self.assertEqual(params["units"], ["metric"])

    @patch("tadih.weather.time.sleep")
    @patch("tadih.weather.urllib.request.urlopen")
    def test_weather_errors_are_partial_and_do_not_leak_credentials(self, mock_urlopen, _sleep):
        response = MagicMock()
        response.read.return_value = b'{"data": []}'
        response.__enter__.return_value = response
        mock_urlopen.side_effect = [response, HTTPError("https://example.org?key=SECRET", 429, "SECRET", {}, None)]
        with tempfile.TemporaryDirectory() as folder:
            result = fetch_daily_weather_observations(station_ids=["48455", "48451"],
                start_date="2026-10-20", end_date="2026-10-21", api_key="SECRET", output_path=Path(folder)/"weather.json")
            self.assertEqual(result["metadata"]["status"], "partial")
            self.assertEqual(result["metadata"]["empty_stations"], ["48455"])
            self.assertEqual(result["metadata"]["failures"][0]["http_status"], 429)
            self.assertNotIn("SECRET", json.dumps(result))

    @patch("tadih.weather.urllib.request.urlopen")
    def test_weather_invalid_request_and_out_of_range_rows_are_not_accepted(self, mock_urlopen):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/"weather.json"
            with self.assertRaises(ValueError):
                fetch_daily_weather_observations(station_ids=["48455&model=true"], start_date="2026-10-20",
                    end_date="2026-10-21", api_key="key", output_path=path)
            mock_urlopen.assert_not_called()
            response = MagicMock()
            response.read.return_value = b'{"data":[{"date":"2026-10-19","prcp":5}]}'
            mock_urlopen.return_value.__enter__.return_value = response
            result = fetch_daily_weather_observations(station_ids=["48455"], start_date="2026-10-20",
                end_date="2026-10-21", api_key="key", output_path=path)
            self.assertEqual(result["records"], [])
            self.assertEqual(result["metadata"]["status"], "failed")

    @patch("tadih.weather.urllib.request.urlopen")
    def test_weather_v2_defaults_preserve_legacy_caches(self, mock_urlopen):
        response = MagicMock()
        response.read.return_value = b'{"data":[]}'
        mock_urlopen.return_value.__enter__.return_value = response
        with tempfile.TemporaryDirectory() as folder, patch("tadih.weather.ROOT", Path(folder)):
            base = Path(folder)/"data/local/weather"
            base.mkdir(parents=True)
            for name in ("dim_weather_stations.json", "fact_daily_weather.json"):
                (base/name).write_bytes(b"legacy evidence")
            fetch_weather_stations()
            result = fetch_daily_weather_observations(station_ids=["48455"], start_date="2026-10-20",
                end_date="2026-10-21", api_key="key")
            self.assertEqual(result["metadata"]["status"], "empty")
            for name in ("dim_weather_stations.json", "fact_daily_weather.json"):
                self.assertEqual((base/name).read_bytes(), b"legacy evidence")
            self.assertTrue((base/"dim_weather_stations_v2.json").exists())
            self.assertTrue((base/"fact_daily_weather_v2.json").exists())

    @patch("tadih.gistda.urllib.request.urlopen")
    def test_fetch_satellite_flood_mock(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "MultiPolygon",
                        "coordinates": [[[[100.5, 13.7], [100.6, 13.7], [100.6, 13.8], [100.5, 13.7]]]],
                    },
                    "properties": {
                        "_id": "mock_flood_01",
                        "file_name": "Sentinel1_20261022",
                        "pv_idn": "10",
                        "pv_en": "Bangkok",
                        "ap_idn": "1001",
                        "ap_en": "Phra Nakhon",
                        "tb_idn": "100101",
                        "tb_en": "Phra Borom Maha Ratchawang",
                        "f_area": 3200.0,
                        "rice_area": 1600.0,
                    },
                }
            ]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_file = Path(tmp_dir) / "gistda_flood.json"
            res = fetch_satellite_flood_7days(api_key="mock_key", output_path=out_file)
            self.assertEqual(res["metadata"]["total_flood_polygons"], 1)
            record = res["records"][0]
            self.assertEqual(record["dopa_province_code"], "10")
            self.assertEqual(record["inundated_rice_area_rai"], 1.0)  # 1600 sq.m / 1600 = 1.0 rai
            self.assertEqual(record["centroid_longitude"], 100.5)
            self.assertEqual(record["centroid_latitude"], 13.7)


if __name__ == "__main__":
    unittest.main()
