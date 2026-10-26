import json
from pathlib import Path
import tempfile
import unittest

from tadih.tmd_nwp import (CONDITION_LABELS_TH, fetch_nwp_daily_place,
                           fetch_nwp_daily_point)


def payload(*, province="นครปฐม", amphoe="เมืองนครปฐม", data=None, time="2026-10-26T00:00:00+07:00"):
    return {"WeatherForecasts": [{
        "location": {"province": province, "areatype": "amphoe", "name": amphoe,
                     "tambon": None, "region": "C", "geocode": "7301", "amphoe": amphoe,
                     "lat": 13.819463, "lon": 100.066009},
        "forecasts": [{"time": time, "data": data if data is not None
                       else {"cond": 4, "tc_max": 36.43, "tc_min": 24.93}}],
    }]}


def no_network(*_):
    raise AssertionError("must reject before any network call")


class TmdNwpTests(unittest.TestCase):
    def test_place_fetch_keeps_provider_grain_and_null_missing_field(self):
        calls = []

        def requester(url, token, timeout):
            calls.append((url, token, timeout))
            return payload()

        result = fetch_nwp_daily_place("นครปฐม", amphoe="เมืองนครปฐม",
                                       fields="tc_max,tc_min,cond,rain",
                                       token="secret-token", requester=requester, save=False)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["record_count"], 1)
        self.assertEqual(result["spatial_support"], "amphoe")
        row = result["records"][0]
        self.assertEqual(row["location_id"], "tmd_nwp:geocode:7301")
        self.assertEqual(row["valid_at"], "2026-10-26T00:00:00+07:00")
        self.assertEqual(row["valid_date"], "2026-10-26")
        self.assertEqual(row["values"]["tc_max"], 36.43)
        self.assertEqual(row["values"]["tc_min"], 24.93)
        self.assertIsNone(row["values"]["rain"])  # missing stays null, never zero
        self.assertEqual(row["condition_code"], 4)
        self.assertEqual(row["condition_label_th"], CONDITION_LABELS_TH[4])
        self.assertEqual(result["license_status"], "pending")
        self.assertEqual(result["unit_status"], "pending_official_confirmation")
        url, token, timeout = calls[0]
        self.assertIn("/forecast/location/daily/place?", url)
        self.assertIn("province=%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9B%E0%B8%90%E0%B8%A1", url)
        self.assertNotIn("secret-token", url)
        self.assertEqual(token, "secret-token")
        self.assertEqual(timeout, 25.0)

    def test_province_only_request_sets_province_support(self):
        result = fetch_nwp_daily_place(
            "นครปฐม", token="t", save=False,
            requester=lambda *_: payload(amphoe=None))
        self.assertEqual(result["spatial_support"], "province")

    def test_point_fetch_uses_at_endpoint_and_grid_support(self):
        point_payload = {"WeatherForecasts": [{
            "location": {"lat": 13.7426, "lon": 100.4965},
            "forecasts": [{"time": "2026-10-26T00:00:00+07:00",
                           "data": {"cond": 4, "rh": 75.07, "tc": 28.91}}],
        }]}
        seen = {}

        def requester(url, token, timeout):
            seen["url"] = url
            return point_payload

        result = fetch_nwp_daily_point(13.75, 100.5, fields="tc,rh,cond",
                                       token="t", requester=requester, save=False)
        self.assertIn("/forecast/location/daily/at?", seen["url"])
        self.assertEqual(result["spatial_support"], "grid_point")
        row = result["records"][0]
        self.assertEqual(row["location_id"], "tmd_nwp:point:13.7426:100.4965")
        self.assertEqual(row["values"], {"tc": 28.91, "rh": 75.07})
        self.assertEqual(row["condition_code"], 4)

    def test_missing_token_rejected_before_network(self):
        with self.assertRaisesRegex(ValueError, "TMD_NWP_ACCESS_TOKEN"):
            fetch_nwp_daily_place("นครปฐม", token="", requester=no_network)
        with self.assertRaisesRegex(ValueError, "TMD_NWP_ACCESS_TOKEN"):
            fetch_nwp_daily_point(13.75, 100.5, token="   ", requester=no_network)

    def test_bad_arguments_rejected_before_network(self):
        with self.assertRaisesRegex(ValueError, "province"):
            fetch_nwp_daily_place("  ", token="t", requester=no_network)
        with self.assertRaisesRegex(ValueError, "tambon requires amphoe"):
            fetch_nwp_daily_place("นครปฐม", tambon="สนามจันทร์", token="t", requester=no_network)
        with self.assertRaisesRegex(ValueError, "field"):
            fetch_nwp_daily_place("นครปฐม", fields="tc_max;drop", token="t", requester=no_network)
        with self.assertRaisesRegex(ValueError, "latitude"):
            fetch_nwp_daily_point(None, 100.5, token="t", requester=no_network)

    def test_substituted_location_and_duplicate_times_rejected(self):
        with self.assertRaisesRegex(ValueError, "different amphoe"):
            fetch_nwp_daily_place("นครปฐม", amphoe="เมืองนครปฐม", token="t", save=False,
                                  requester=lambda *_: payload(amphoe="กำแพงแสน"))
        duplicate = payload()
        duplicate["WeatherForecasts"][0]["forecasts"].append(
            {"time": "2026-10-26T00:00:00+07:00", "data": {"tc_max": 30, "tc_min": 20}})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            fetch_nwp_daily_place("นครปฐม", token="t", save=False,
                                  requester=lambda *_: duplicate)

    def test_inconsistent_or_non_numeric_values_rejected(self):
        with self.assertRaisesRegex(ValueError, "lower than"):
            fetch_nwp_daily_place("นครปฐม", token="t", save=False,
                                  requester=lambda *_: payload(data={"tc_max": 20, "tc_min": 25}))
        with self.assertRaisesRegex(ValueError, "not numeric"):
            fetch_nwp_daily_place("นครปฐม", token="t", save=False,
                                  requester=lambda *_: payload(data={"tc_max": "hot", "tc_min": 20}))
        with self.assertRaisesRegex(ValueError, "exceeds 100"):
            fetch_nwp_daily_point(13.75, 100.5, fields="rh", token="t", save=False,
                                  requester=lambda *_: payload(data={"rh": 140}))

    def test_unknown_condition_code_is_kept_without_invented_label(self):
        result = fetch_nwp_daily_place("นครปฐม", token="t", save=False,
                                       requester=lambda *_: payload(data={"cond": 99, "tc_max": 30, "tc_min": 20}))
        row = result["records"][0]
        self.assertEqual(row["condition_code"], 99)
        self.assertIsNone(row["condition_label_th"])

    def test_condition_only_request_is_not_reported_empty(self):
        result = fetch_nwp_daily_place("นครปฐม", fields="cond", token="t", save=False,
                                       requester=lambda *_: payload(data={"cond": 4}))
        self.assertEqual(result["records"][0]["values"], {})
        self.assertEqual(result["records"][0]["condition_code"], 4)
        self.assertEqual(result["status"], "ok")

    def test_saved_envelope_round_trips_without_token(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "nwp.json"
            result = fetch_nwp_daily_place("นครปฐม", amphoe="เมืองนครปฐม", token="secret",
                                           output_path=target,
                                           requester=lambda *_: payload())
            self.assertEqual(result["path"], str(target))
            saved = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(saved["record_count"], 1)
            self.assertNotIn("secret", target.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
