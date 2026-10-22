import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import ssl
from datetime import date,timedelta
from urllib.error import HTTPError
from urllib.parse import parse_qs,urlparse

from tadih.ingestion import OAE_RICE_PRODUCT, backfill_weather, trusted_ssl_context, discover_ckan, discover_ckan_pages, fetch_json, fetch_weather, fetch_oae_rice_prices, normalize_oae_rice_prices, save_snapshot, snapshot_complete


def weather_payload():
    return {"daily": {"time": ["2020-01-01"], "precipitation_sum": [None], "temperature_2m_max": [30], "et0_fao_evapotranspiration": [2]}, "daily_units": {"precipitation_sum": "mm", "temperature_2m_max": "°C", "et0_fao_evapotranspiration": "mm"}}


class IngestionTests(unittest.TestCase):
    def test_windows_roots_keep_hostname_chain_and_strict_checks(self):
        certificate = ssl.create_default_context().get_ca_certs(binary_form=True)[0]
        entries = [(certificate,"x509_asn",{ssl.Purpose.SERVER_AUTH.oid})]
        with mock.patch("tadih.ingestion.sys.platform","win32"), mock.patch("tadih.ingestion.ssl.enum_certificates",return_value=entries,create=True), mock.patch.dict("tadih.ingestion.os.environ",{},clear=True):
            context = trusted_ssl_context()
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode,ssl.CERT_REQUIRED)
        self.assertEqual(context.verify_flags,ssl.create_default_context().verify_flags)
        with mock.patch("tadih.ingestion.sys.platform","win32"), mock.patch("tadih.ingestion.ssl.enum_certificates",return_value=[],create=True), mock.patch.dict("tadih.ingestion.os.environ",{},clear=True):
            with self.assertRaises(ssl.SSLError):
                trusted_ssl_context()

    def test_retry_429_is_bounded(self):
        calls, sleeps = [], []
        def opener(request, timeout):
            calls.append(request.full_url)
            if len(calls) < 3:
                raise HTTPError(request.full_url, 429, "limited", {"Retry-After": "2"}, None)
            return io.BytesIO(b'{"ok":true}')
        self.assertEqual(fetch_json("https://example.org", opener=opener, sleep=sleeps.append), {"ok": True})
        self.assertEqual(sleeps, [2, 2])
        self.assertEqual(len(calls), 3)

    def test_403_not_retried(self):
        def opener(request, timeout):
            raise HTTPError(request.full_url, 403, "denied", {}, None)
        with self.assertRaises(HTTPError) as raised:
            fetch_json("https://example.org", opener=opener, sleep=lambda _: self.fail("must not sleep"))
        raised.exception.close()

    def test_ckan_discovery_not_coverage(self):
        result = discover_ckan("https://ckan.doae.go.th/", fetcher=lambda _: {"success": True, "result": {"results": []}})
        self.assertEqual(result["data_kind"], "metadata")
        self.assertIsNone(result["release_at"])
        with self.assertRaises(ValueError):
            discover_ckan("https://localhost", fetcher=lambda _: {})

    def test_ckan_pagination_complete_and_bounded_checkpoint(self):
        def fetcher(url):
            offset = 2 if "start=2" in url else 0
            return {"success": True, "result": {"count": 3, "results": [{"id": str(i)} for i in range(offset, min(offset + 2, 3))]}}
        complete = discover_ckan_pages("https://ckan.doae.go.th", page_size=2, max_pages=2, fetcher=fetcher, sleep=lambda _: None)
        self.assertEqual(len(complete["payload"]["result"]["results"]), 3)
        self.assertTrue(complete["pagination"]["complete"])
        bounded = discover_ckan_pages("https://ckan.doae.go.th", page_size=2, max_pages=1, fetcher=fetcher)
        self.assertFalse(bounded["pagination"]["complete"])
        self.assertEqual(bounded["pagination"]["next_start"], 2)

    def test_archive_missing_stays_null_and_issue_unknown(self):
        result = fetch_weather(13.8, 100.25, "2020-01-01", "2020-01-01", fetcher=lambda _: weather_payload())
        self.assertEqual(result["data_kind"], "estimated")
        self.assertIsNone(result["payload"]["daily"]["precipitation_sum"][0])
        self.assertIsNone(result["issue_at"])
        self.assertIn("models=era5", result["request_url"])

    def test_forecast_distinct(self):
        result = fetch_weather(13.8, 100.25, "2020-01-01", "2020-01-01", forecast=True, fetcher=lambda _: weather_payload())
        self.assertEqual(result["data_kind"], "forecast")
        self.assertEqual(result["provider_model"], "best_match")

    def test_reject_foreign_point_and_bad_window_before_network(self):
        for args in [(51, 0, "2020-01-01", "2020-01-01"), (13.8, 100.25, "2020-02-01", "2020-01-01")]:
            with self.assertRaises(ValueError):
                fetch_weather(*args, fetcher=lambda _: self.fail("must not fetch"))
        # Approved regional agricultural points must pass coordinate validation
        for lat, lon in [(18.75, 99.0), (16.44, 102.83), (9.14, 99.33), (12.61, 102.10)]:
            res = fetch_weather(lat, lon, "2020-01-01", "2020-01-01", fetcher=lambda _: weather_payload())
            self.assertEqual(res["requested_location"], {"latitude": lat, "longitude": lon})

    def test_bad_shape_units_and_nonfinite_rejected(self):
        for mutate in [lambda p: p["daily"]["precipitation_sum"].append(1), lambda p: p["daily_units"].update(precipitation_sum="inch"), lambda p: p["daily"].update(precipitation_sum=[float("nan")])]:
            payload = weather_payload()
            mutate(payload)
            with self.assertRaises(ValueError):
                fetch_weather(13.8, 100.25, "2020-01-01", "2020-01-01", fetcher=lambda _: payload)

    def test_snapshot_idempotence_revision_and_tamper_detection(self):
        with tempfile.TemporaryDirectory() as directory:
            payload = {"source_id": "doae", "payload": {"a": 1}}
            first = save_snapshot(payload, "doae", directory, "2020")
            self.assertEqual(first, save_snapshot(payload, "doae", directory, "2020"))
            self.assertTrue(snapshot_complete("doae", directory, "2020"))
            payload["payload"]["a"] = 2
            second = save_snapshot(payload, "doae", directory, "2020")
            self.assertNotEqual(first["checksum"], second["checksum"])
            self.assertEqual(len(list((Path(directory) / "doae" / "2020").glob("*.json"))), 3)
            (Path(directory) / "doae" / "2020" / second["artifact"]).write_text("{}")
            self.assertFalse(snapshot_complete("doae", directory, "2020"))

    def test_snapshot_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                save_snapshot({"source_id": "../escape"}, "../escape", directory)

    def test_oae_pages_are_bounded_and_complete_when_exhausted(self):
        def fetcher(url):
            page = 2 if "page=2" in url else 1
            return {"success": True, "data": [{"month": page}], "pagination": {"page": page, "offset": page - 1, "total": 2}}
        envelope = fetch_oae_rice_prices(max_pages=2, fetcher=fetcher, sleep=lambda _: None)
        self.assertTrue(envelope["pagination"]["complete"])
        self.assertEqual(len(envelope["payload"]["data"]), 2)
        self.assertFalse(fetch_oae_rice_prices(max_pages=1, fetcher=fetcher)["pagination"]["complete"])

    def test_oae_be_year_tonne_conversion_missing_and_stable_revision(self):
        base = {"province_code": "TH00", "product_name": OAE_RICE_PRODUCT, "unit": "บาท/ตัน", "year_th": 2566}
        envelope = {"source_id": "oae", "retrieved_at": "2026-10-22T07:00:00+00:00", "request_url": "https://agriapi.nabc.go.th/api/monthly-prices/product", "payload": {"data": [dict(base, month="01", value="16,545.45"), dict(base, month="02", value=" -   "), dict(base, month="03", value=None)]}}
        rows = normalize_oae_rice_prices(envelope)
        self.assertAlmostEqual(rows[0]["value"], 16.54545)
        self.assertEqual(rows[0]["observed_at"], "2023-01-01T00:00:00+07:00")
        self.assertIsNone(rows[0]["release_at"])
        self.assertIsNone(rows[0]["area_code"])
        self.assertIsNone(rows[1]["value"])
        self.assertIsNone(rows[2]["value"])
        self.assertEqual(rows[0]["grade"], OAE_RICE_PRODUCT)
        envelope["retrieved_at"] = "2026-10-23T07:00:00+00:00"
        self.assertEqual(rows[0]["revision_id"], normalize_oae_rice_prices(envelope)[0]["revision_id"])

    def test_oae_rejects_units_and_provincial_grain(self):
        raw = {"province_code": "TH00", "product_name": OAE_RICE_PRODUCT, "unit": "บาท/กิโลกรัม", "year_th": 2566, "month": 1, "value": 5}
        for change in [{}, {"unit": "บาท/ตัน", "province_code": "10"}]:
            with self.assertRaises(ValueError):
                normalize_oae_rice_prices({"source_id": "oae", "payload": {"data": [dict(raw, **change)]}})

    def test_yearly_weather_backfill_checks_leap_day_and_resumes_without_network(self):
        calls=[]
        def fetcher(url):
            calls.append(url)
            query=parse_qs(urlparse(url).query)
            start=date.fromisoformat(query['start_date'][0]);end=date.fromisoformat(query['end_date'][0])
            dates=[(start+timedelta(days=i)).isoformat() for i in range((end-start).days+1)]
            payload=weather_payload()
            payload['daily']={"time":dates,"precipitation_sum":[None]*len(dates),"temperature_2m_max":[30]*len(dates),"et0_fao_evapotranspiration":[2]*len(dates)}
            return payload
        with tempfile.TemporaryDirectory() as directory:
            records=backfill_weather(13.8,100.25,2020,2021,directory,fetcher=fetcher,sleep=lambda _:None)
            self.assertEqual([r['daily_rows'] for r in records],[366,365])
            resumed=backfill_weather(13.8,100.25,2020,2021,directory,fetcher=lambda _:self.fail('must resume without network'))
            self.assertTrue(all(r['action']=='skipped_verified' for r in resumed))
            self.assertEqual(len(calls),2)
            refreshed=backfill_weather(13.8,100.25,2020,2021,directory,refresh=True,fetcher=fetcher,sleep=lambda _:None)
            self.assertTrue(all(r['action']=='fetched' for r in refreshed))
            self.assertEqual(len(calls),4)


if __name__ == "__main__":
    unittest.main()
