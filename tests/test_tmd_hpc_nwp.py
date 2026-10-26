"""Offline tests for the TMD HPC NWP listing/download/manifest module.

The fixtures mirror the real payload shape observed on 2026-10-26 from
``https://hpc.tmd.go.th/api/download-files?init_time=2026102600`` (32 entries,
26 CSV + 6 NetCDF), but no network call is made here: fetchers are injected.
"""

import hashlib
import json
import os
from pathlib import Path
import tempfile
from datetime import datetime, timedelta, timezone
import unittest
from unittest import mock
from urllib.error import HTTPError, URLError

from tadih import tmd_hpc_nwp as hpc
from tadih.env import (
    get_agency_keys_overview,
    get_tmd_hpc_base_url,
    get_tmd_hpc_publication_mode,
)
from tadih.tmd_hpc_nwp import (
    DEFAULT_DOMAIN,
    DEFAULT_MAX_BYTES,
    TMD_HPC_BAD_CONTENT,
    TMD_HPC_CHECKSUM_MISMATCH,
    TMD_HPC_FILE_NOT_FOUND,
    TMD_HPC_FILE_TOO_LARGE,
    TMD_HPC_HTTP_ERROR,
    TMD_HPC_INVALID_INIT_TIME,
    TMD_HPC_INVALID_LISTING,
    TMD_HPC_LISTING_FAILED,
    TMD_HPC_MANIFEST_INVALID,
    TMD_HPC_NO_VARIABLES,
    TMD_HPC_UNSUPPORTED_DOMAIN,
    TmdHpcError,
    download_run,
    iso_utc,
    list_download_files,
    load_manifest,
    probe_files,
    verify_manifest,
)

INIT = "2026102600"
BASE = "https://hpc.tmd.go.th"
CSV_BODY = (b"lat,lon,00:00Z 2026-10-26,00:00Z 2026-10-27\n"
            b"5.222946,96.8385,0.0,1.2\n"
            b"5.250623,96.8385,null,0.4\n")

# (variable, domain, display size) exactly as the live listing reports them.
CSV_FILES = [
    ("dwl", "d01", "15101.7 KB"), ("dwl", "d02", "97351.8 KB"),
    ("dws", "d01", "11469.8 KB"), ("dws", "d02", "74898.6 KB"),
    ("mslp", "d01", "15391.1 KB"), ("mslp", "d02", "99265.7 KB"),
    ("olr", "d01", "15096.3 KB"), ("olr", "d02", "97336.2 KB"),
    ("p1h", "d02", "60637.7 KB"),
    ("p24h", "d01", "4670.7 KB"), ("p24h", "d02", "12413.9 KB"),
    ("p3h", "d01", "9706.5 KB"),
    ("psfc", "d01", "18710.2 KB"), ("psfc", "d02", "120862.8 KB"),
    ("rhum", "d01", "11144.4 KB"), ("rhum", "d02", "71958.5 KB"),
    ("t2m", "d01", "15177.4 KB"), ("t2m", "d02", "97896.0 KB"),
    ("uw10m", "d01", "12375.0 KB"), ("uw10m", "d02", "80894.8 KB"),
    ("vw10m", "d01", "12045.3 KB"), ("vw10m", "d02", "77450.8 KB"),
    ("wd10m", "d01", "10952.8 KB"), ("wd10m", "d02", "70997.3 KB"),
    ("ws10m", "d01", "12832.3 KB"), ("ws10m", "d02", "83318.6 KB"),
]
NC_FILES = [
    ("VR-AVG", "d01", "1021.8 KB"), ("VR-AVG", "d02", "2.1 MB"),
    ("prec1hr", "d02", "55.6 MB"), ("prec3hr", "d01", "17.2 MB"),
    ("sfroff1hr", "d02", "55.6 MB"), ("sfroff3hr", "d01", "17.2 MB"),
]
DOMAIN_TEXT = {
    "d01": "Domain 1 (Indochina 9km)",
    "d02": "Domain 2 (Thailand 3km)",
}


def listing_payload(init_time=INIT):
    files = []
    for variable, domain, size in CSV_FILES:
        filename = f"{variable}.{domain}.{init_time}.csv"
        files.append({
            "description": f"{variable} description",
            "domain": DOMAIN_TEXT[domain],
            "domain_code": domain,
            "filename": filename,
            "format": "CSV",
            "size": size,
            "url": f"/static/csv/{init_time}/{filename}",
        })
    for variable, domain, size in NC_FILES:
        filename = f"{init_time}.{variable}.{domain}.nc"
        files.append({
            "description": f"{variable} description",
            "domain": DOMAIN_TEXT[domain],
            "domain_code": domain,
            "filename": filename,
            "format": "NetCDF-4",
            "size": size,
            "url": f"/static/netcdf/{init_time}/{filename}",
        })
    return {"count": len(files), "files": files,
            "initial_time": init_time, "status": "success"}


def csv_url(variable, domain=DEFAULT_DOMAIN, init_time=INIT):
    return (f"{BASE}/static/csv/{init_time}/"
            f"{variable}.{domain}.{init_time}.csv")


class FakeResponse:
    def __init__(self, body=b"", *, status=200, headers=None):
        self._body = body
        self._offset = 0
        self.status = status
        self.headers = {str(k).lower(): str(v) for k, v in (headers or {}).items()}

    def read(self, amount=-1):
        start = self._offset
        if amount is None or amount < 0:
            end = len(self._body)
        else:
            end = min(len(self._body), start + amount)
        self._offset = end
        return self._body[start:end]

    def close(self):
        pass


class FakeFetcher:
    def __init__(self, payload=None, files=None, listing=None):
        self.payload = listing_payload() if payload is None else payload
        self.files = files or {}
        self.listing = listing
        self.calls = []

    def __call__(self, url, *, method="GET", headers=None, timeout=None):
        self.calls.append((method, url, dict(headers or {}), timeout))
        if "download-files" in url:
            if callable(self.listing):
                return self.listing()
            if self.listing is not None:
                return self.listing
            return FakeResponse(
                json.dumps(self.payload).encode("utf-8"),
                headers={"Content-Type": "application/json"})
        handler = self.files.get(url)
        if handler is None:
            raise AssertionError(f"unexpected fetch: {method} {url}")
        if callable(handler):
            return handler(method=method, headers=dict(headers or {}))
        body, content_type = handler
        if method == "HEAD":
            body = b""
        return FakeResponse(body, headers={
            "Content-Type": content_type,
            "Content-Length": str(len(handler[0])),
        })

    def file_calls(self):
        return [call for call in self.calls if "download-files" not in call[1]]


def no_network(*_args, **_kwargs):
    raise AssertionError("must reject before any network call")


def read_manifest(output):
    path = Path(output) / "manifests" / f"tmd_hpc_d02_{INIT}.json"
    return json.loads(path.read_text(encoding="utf-8"))


class HpcTestCase(unittest.TestCase):
    def setUp(self):
        env_patch = mock.patch.dict(os.environ, {
            "TMD_HPC_BASE_URL": BASE,
            "TMD_HPC_PUBLICATION_MODE": "numeric_preview",
        })
        env_patch.start()
        self.addCleanup(env_patch.stop)
        sleep_patch = mock.patch.object(hpc, "_sleep", lambda *_: None)
        sleep_patch.start()
        self.addCleanup(sleep_patch.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.output = Path(tmp.name)


class InitTimeAndListingTests(HpcTestCase):
    def test_init_time_validation(self):
        for bad in ("", "20261026", "20261026001", "2026132600",
                    "2026102624", "20261026ab", 2026102600, None):
            with self.subTest(value=bad):
                with self.assertRaises(TmdHpcError) as raised:
                    list_download_files(bad, fetcher=no_network)
                self.assertEqual(raised.exception.code, TMD_HPC_INVALID_INIT_TIME)

    def test_listing_parses_realistic_32_file_payload(self):
        listing = list_download_files(INIT, fetcher=FakeFetcher())
        self.assertEqual(listing["count"], 32)
        self.assertEqual(listing["init_at"], "2026-10-26T00:00:00Z")
        self.assertEqual(listing["base_url"], BASE)
        formats = [entry["format"] for entry in listing["files"]]
        self.assertEqual(formats.count("CSV"), 26)
        self.assertEqual(formats.count("NETCDF"), 6)
        domains = {entry["domain"] for entry in listing["files"]}
        self.assertEqual(domains, {"d01", "d02"})

        by_name = {entry["filename"]: entry for entry in listing["files"]}
        p24h = by_name["p24h.d02.2026102600.csv"]
        self.assertEqual(p24h["variable"], "p24h")
        self.assertEqual(p24h["domain"], "d02")
        self.assertEqual(p24h["bytes"], int(round(12413.9 * 1024)))
        self.assertEqual(p24h["url"],
                         f"{BASE}/static/csv/{INIT}/p24h.d02.2026102600.csv")
        self.assertEqual(p24h["init_at"], "2026-10-26T00:00:00Z")
        self.assertIn("raw", p24h)
        self.assertEqual(p24h["raw"]["format"], "CSV")

        dwl = by_name["dwl.d01.2026102600.csv"]
        self.assertEqual(dwl["bytes"], int(round(15101.7 * 1024)))
        nc = by_name["2026102600.prec1hr.d02.nc"]
        self.assertEqual(nc["variable"], "prec1hr")
        self.assertEqual(nc["domain"], "d02")
        self.assertEqual(nc["format"], "NETCDF")
        self.assertEqual(by_name["2026102600.VR-AVG.d01.nc"]["variable"], "VR-AVG")

    def test_listing_preserves_unparseable_entries(self):
        payload = {
            "count": 1,
            "initial_time": INIT,
            "status": "success",
            "files": [{
                "filename": "readme.txt",
                "domain_code": "d99",
                "format": "TXT",
                "size": "unknown",
                "url": "/static/readme.txt",
            }],
        }
        listing = list_download_files(INIT, fetcher=FakeFetcher(payload=payload))
        entry = listing["files"][0]
        self.assertIsNone(entry["variable"])
        self.assertIsNone(entry["domain"])
        self.assertIsNone(entry["bytes"])
        self.assertEqual(entry["url"], f"{BASE}/static/readme.txt")

    def test_listing_rejects_count_mismatch_and_non_success_status(self):
        broken = listing_payload()
        broken["count"] = 31
        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=FakeFetcher(payload=broken))
        self.assertEqual(raised.exception.code, TMD_HPC_INVALID_LISTING)

        failed = listing_payload()
        failed["status"] = "error"
        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=FakeFetcher(payload=failed))
        self.assertEqual(raised.exception.code, TMD_HPC_INVALID_LISTING)

        other_init = listing_payload()
        other_init["initial_time"] = "2026102512"
        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=FakeFetcher(payload=other_init))
        self.assertEqual(raised.exception.code, TMD_HPC_INVALID_LISTING)

    def test_listing_rejects_http_and_off_host_urls(self):
        payload = listing_payload()
        payload["files"][0]["url"] = "http://hpc.tmd.go.th/static/csv/file.csv"
        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=FakeFetcher(payload=payload))
        self.assertEqual(raised.exception.code, TMD_HPC_INVALID_LISTING)

        off_host = listing_payload()
        off_host["files"][0]["url"] = "https://example.test/static/csv/file.csv"
        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=FakeFetcher(payload=off_host))
        self.assertEqual(raised.exception.code, TMD_HPC_INVALID_LISTING)

    def test_listing_requires_https_base_url(self):
        with mock.patch.dict(os.environ, {"TMD_HPC_BASE_URL": "http://hpc.tmd.go.th"}):
            with self.assertRaises(TmdHpcError) as raised:
                list_download_files(INIT, fetcher=no_network)
        self.assertEqual(raised.exception.code, TMD_HPC_LISTING_FAILED)

    def test_listing_rejects_invalid_json_and_http_failure(self):
        bad_json = FakeFetcher(listing=FakeResponse(
            b"<html>not json</html>",
            headers={"Content-Type": "application/json"}))
        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=bad_json)
        self.assertEqual(raised.exception.code, TMD_HPC_INVALID_LISTING)

        def refused():
            raise HTTPError(f"{BASE}/api/download-files", 500, "boom", None, None)

        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=FakeFetcher(listing=refused))
        self.assertEqual(raised.exception.code, TMD_HPC_LISTING_FAILED)

        def unreachable():
            raise URLError("no route")

        with self.assertRaises(TmdHpcError) as raised:
            list_download_files(INIT, fetcher=FakeFetcher(listing=unreachable))
        self.assertEqual(raised.exception.code, TMD_HPC_LISTING_FAILED)


class RequestValidationTests(HpcTestCase):
    def test_validates_domain_variables_and_duplicates(self):
        with self.assertRaises(TmdHpcError) as raised:
            download_run(INIT, domain="d03", fetcher=no_network)
        self.assertEqual(raised.exception.code, TMD_HPC_UNSUPPORTED_DOMAIN)

        with self.assertRaises(TmdHpcError) as raised:
            download_run(INIT, variables=(), fetcher=no_network)
        self.assertEqual(raised.exception.code, TMD_HPC_NO_VARIABLES)

        with self.assertRaises(ValueError) as raised:
            download_run(INIT, variables=("p24h", "p24h"), fetcher=no_network)
        self.assertIn("duplicate", str(raised.exception))

        with self.assertRaises(ValueError):
            download_run(INIT, max_bytes=0, fetcher=no_network)

        with self.assertRaises(ValueError):
            probe_files(INIT, variables=("p24h", "p24h"), fetcher=no_network)

        with self.assertRaises(ValueError):
            probe_files(INIT, max_probe_bytes=0, fetcher=no_network)

    def test_invalid_publication_mode_fails_before_listing(self):
        with mock.patch.dict(os.environ, {"TMD_HPC_PUBLICATION_MODE": "public"}):
            with self.assertRaises(ValueError):
                download_run(INIT, fetcher=no_network)


class DownloadTests(HpcTestCase):
    def _single_file(self, variable="p24h"):
        return FakeFetcher(files={csv_url(variable): (CSV_BODY, "text/csv")})

    def test_download_writes_raw_file_and_contract_manifest(self):
        fetcher = FakeFetcher(files={
            csv_url("p24h"): (CSV_BODY, "text/csv"),
            csv_url("t2m"): (CSV_BODY, "text/csv"),
        })
        manifest = download_run(INIT, variables=("p24h", "t2m"),
                                output_dir=self.output, fetcher=fetcher)

        self.assertEqual(manifest["source_id"], "tmd_hpc_nwp")
        self.assertEqual(manifest["source_agency"], "กรมอุตุนิยมวิทยา (TMD)")
        self.assertEqual(manifest["contract_version"], 1)
        self.assertEqual(manifest["run_id"], "tmd_hpc_d02_2026102600")
        self.assertEqual(manifest["domain"], "d02")
        self.assertEqual(manifest["domain_label"], "Thailand 3km")
        self.assertEqual(manifest["init_at"], "2026-10-26T00:00:00Z")
        self.assertEqual(manifest["base_url"], BASE)
        self.assertEqual(manifest["license_status"], "pending")
        self.assertEqual(manifest["unit_status"], "pending_official_confirmation")
        self.assertEqual(manifest["publication_mode"], "numeric_preview")
        self.assertEqual(manifest["variables"], ["p24h", "t2m"])
        self.assertEqual(manifest["lead_hours"], [0, 6, 12, 24, 48, 72])
        self.assertEqual(manifest["grid"], {
            "bbox": [96.0, 5.0, 106.0, 21.0],
            "source_cell_deg": 0.0277,
            "output_cell_deg": 0.15,
            "nx": 67,
            "ny": 107,
        })
        self.assertEqual(manifest["status"], "ready")
        self.assertEqual([item["status"] for item in manifest["files"]],
                         ["ok", "ok"])
        expected_sha = hashlib.sha256(CSV_BODY).hexdigest()
        for item in manifest["files"]:
            self.assertEqual(item["bytes"], len(CSV_BODY))
            self.assertEqual(item["sha256"], expected_sha)
            self.assertEqual(item["format"], "CSV")
            raw = (self.output / "raw" / manifest["run_id"] / item["filename"])
            self.assertTrue(raw.is_file())
            self.assertEqual(raw.read_bytes(), CSV_BODY)

        stored = read_manifest(self.output)
        self.assertEqual(stored, manifest)
        self.assertEqual([call[0] for call in fetcher.file_calls()], ["GET", "GET"])
        self.assertEqual(len(fetcher.file_calls()), 2)
        leftovers = [path.name for path in self.output.rglob("*")
                     if path.suffix in (".tmp", ".part")]
        self.assertEqual(leftovers, [])

    def test_cached_rerun_skips_download(self):
        first = self._single_file()
        download_run(INIT, variables=("p24h",), output_dir=self.output,
                     fetcher=first)
        second = FakeFetcher(files={})  # any file GET would raise
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=second)
        self.assertEqual(manifest["status"], "ready")
        self.assertEqual(manifest["files"][0]["status"], "cached")
        self.assertEqual(second.file_calls(), [])

        refreshed = self._single_file()
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=refreshed, refresh=True)
        self.assertEqual(manifest["files"][0]["status"], "ok")
        self.assertEqual(len(refreshed.file_calls()), 1)

    def test_max_bytes_fails_closed_before_download(self):
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=self._single_file(), max_bytes=10)
        self.assertEqual(manifest["status"], "failed")
        item = manifest["files"][0]
        self.assertEqual(item["status"], "failed")
        self.assertEqual(item["error"]["code"], TMD_HPC_FILE_TOO_LARGE)
        self.assertIsNone(item["sha256"])
        self.assertFalse(any(self.output.rglob("*.csv")))
        self.assertEqual(list(self.output.rglob("*.part")), [])

    def test_max_bytes_fails_closed_while_streaming(self):
        def stream(*, method, headers):
            return FakeResponse(CSV_BODY, headers={"Content-Type": "text/csv"})

        fetcher = FakeFetcher(files={csv_url("p24h"): stream})
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=fetcher, max_bytes=20)
        self.assertEqual(manifest["status"], "failed")
        self.assertEqual(manifest["files"][0]["error"]["code"],
                         TMD_HPC_FILE_TOO_LARGE)
        self.assertEqual(list(self.output.rglob("*.part")), [])

    def test_html_error_body_is_rejected(self):
        fetcher = FakeFetcher(files={
            csv_url("p24h"): (b"<html>quota exceeded</html>", "text/html"),
        })
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=fetcher)
        self.assertEqual(manifest["status"], "failed")
        self.assertEqual(manifest["files"][0]["error"]["code"], TMD_HPC_BAD_CONTENT)
        self.assertFalse(any(self.output.rglob("*.csv")))

        disguised = FakeFetcher(files={
            csv_url("p24h"): (b"  <html>error</html>", "text/csv"),
        })
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=disguised)
        self.assertEqual(manifest["files"][0]["status"], "failed")
        self.assertEqual(manifest["files"][0]["error"]["code"], TMD_HPC_BAD_CONTENT)
        self.assertFalse(any(self.output.rglob("*.csv")))

    def test_http_500_is_retried_then_succeeds(self):
        attempts = {"count": 0}

        def flaky(*, method, headers):
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise HTTPError(csv_url("p24h"), 500, "boom", None, None)
            return FakeResponse(CSV_BODY, headers={
                "Content-Type": "text/csv",
                "Content-Length": str(len(CSV_BODY)),
            })

        fetcher = FakeFetcher(files={csv_url("p24h"): flaky})
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=fetcher)
        self.assertEqual(attempts["count"], 2)
        self.assertEqual(manifest["status"], "ready")

    def test_http_500_gives_up_after_two_retries(self):
        attempts = {"count": 0}

        def always_failing(*, method, headers):
            attempts["count"] += 1
            raise HTTPError(csv_url("p24h"), 503, "unavailable", None, None)

        fetcher = FakeFetcher(files={csv_url("p24h"): always_failing})
        manifest = download_run(INIT, variables=("p24h",), output_dir=self.output,
                                fetcher=fetcher)
        self.assertEqual(attempts["count"], 3)  # initial + MAX_RETRIES
        self.assertEqual(manifest["status"], "failed")
        self.assertEqual(manifest["files"][0]["error"]["code"], TMD_HPC_HTTP_ERROR)

    def test_missing_variable_is_recorded_as_partial(self):
        fetcher = FakeFetcher(files={csv_url("p24h"): (CSV_BODY, "text/csv")})
        # p3h is only published for d01.
        manifest = download_run(INIT, variables=("p24h", "p3h"),
                                output_dir=self.output, fetcher=fetcher)
        self.assertEqual(manifest["status"], "partial")
        statuses = {item["variable"]: item["status"] for item in manifest["files"]}
        self.assertEqual(statuses, {"p24h": "ok", "p3h": "missing"})

    def test_all_requested_variables_missing_fails_closed(self):
        with self.assertRaises(TmdHpcError) as raised:
            download_run(INIT, variables=("p3h",), domain="d02",
                         output_dir=self.output, fetcher=FakeFetcher(files={}))
        self.assertEqual(raised.exception.code, TMD_HPC_FILE_NOT_FOUND)
        self.assertFalse((self.output / "manifests").exists())


class ProbeTests(HpcTestCase):
    def test_head_probe_reports_size_without_body(self):
        fetcher = FakeFetcher(files={csv_url("p24h"): (CSV_BODY, "text/csv")})
        result = probe_files(INIT, variables=("p24h",), fetcher=fetcher)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["run_id"], "tmd_hpc_d02_2026102600")
        item = result["files"]["p24h"]
        self.assertEqual(item["status"], "ok")
        self.assertEqual(item["probe_mode"], "head")
        self.assertEqual(item["http_status"], 200)
        self.assertEqual(item["bytes"], len(CSV_BODY))
        self.assertEqual(item["content_type"], "text/csv")
        self.assertEqual([call[0] for call in fetcher.file_calls()], ["HEAD"])

    def test_head_405_falls_back_to_range_get(self):
        def handler(*, method, headers):
            if method == "HEAD":
                raise HTTPError(csv_url("p24h"), 405, "no HEAD", None, None)
            self.assertEqual(headers.get("Range"), "bytes=0-1023")
            return FakeResponse(
                CSV_BODY[:1024], status=206,
                headers={"Content-Type": "text/csv",
                         "Content-Range": "bytes 0-1023/12711860",
                         "Content-Length": "1024"})

        result = probe_files(INIT, variables=("p24h",), max_probe_bytes=1024,
                             fetcher=FakeFetcher(files={csv_url("p24h"): handler}))
        item = result["files"]["p24h"]
        self.assertEqual(item["status"], "ok")
        self.assertEqual(item["probe_mode"], "range_get")
        self.assertEqual(item["http_status"], 206)
        self.assertEqual(item["bytes"], 12711860)

    def test_head_without_content_length_falls_back_to_range(self):
        def handler(*, method, headers):
            if method == "HEAD":
                return FakeResponse(b"", headers={"Content-Type": "text/csv"})
            return FakeResponse(
                CSV_BODY, status=206,
                headers={"Content-Type": "text/csv",
                         "Content-Range": "bytes 0-2047/12711860"})

        result = probe_files(INIT, variables=("p24h",),
                             fetcher=FakeFetcher(files={csv_url("p24h"): handler}))
        self.assertEqual(result["files"]["p24h"]["probe_mode"], "range_get")
        self.assertEqual(result["files"]["p24h"]["bytes"], 12711860)

    def test_probe_domain_filter_and_missing_variables(self):
        fetcher = FakeFetcher(files={csv_url("p24h", "d01"): (CSV_BODY, "text/csv")})
        result = probe_files(INIT, variables=("p24h",), domain="d01",
                             fetcher=fetcher)
        self.assertEqual(result["files"]["p24h"]["url"], csv_url("p24h", "d01"))

        partial = probe_files(INIT, variables=("p24h", "p3h"), domain="d02",
                              fetcher=FakeFetcher(
                                  files={csv_url("p24h"): (CSV_BODY, "text/csv")}))
        self.assertEqual(partial["status"], "partial")
        self.assertEqual(partial["missing"], ["p3h"])
        self.assertIsNone(partial["files"]["p3h"]["url"])
        self.assertEqual(partial["files"]["p3h"]["error"]["code"],
                         TMD_HPC_FILE_NOT_FOUND)

        with self.assertRaises(TmdHpcError) as raised:
            probe_files(INIT, variables=("p3h",), domain="d02",
                        fetcher=FakeFetcher(files={}))
        self.assertEqual(raised.exception.code, TMD_HPC_FILE_NOT_FOUND)

    def test_probe_rejects_html_body(self):
        def handler(*, method, headers):
            if method == "HEAD":
                raise HTTPError(csv_url("p24h"), 405, "no HEAD", None, None)
            return FakeResponse(b"<html>error</html>", status=200,
                                headers={"Content-Type": "text/html"})

        result = probe_files(INIT, variables=("p24h",),
                             fetcher=FakeFetcher(files={csv_url("p24h"): handler}))
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["files"]["p24h"]["error"]["code"],
                         TMD_HPC_BAD_CONTENT)


class ManifestTests(HpcTestCase):
    def _download(self):
        return download_run(
            INIT, variables=("p24h",), output_dir=self.output,
            fetcher=FakeFetcher(files={csv_url("p24h"): (CSV_BODY, "text/csv")}))

    def test_verify_manifest_detects_tampering_and_missing_files(self):
        manifest = self._download()
        raw_dir = self.output / "raw" / manifest["run_id"]
        manifest_path = self.output / "manifests" / f"{manifest['run_id']}.json"

        report = verify_manifest(load_manifest(manifest_path), raw_dir)
        self.assertTrue(report["ok"])
        self.assertEqual(report["checked"], 1)

        target = raw_dir / manifest["files"][0]["filename"]
        tampered = target.read_bytes().replace(b"1.2", b"9.9")
        self.assertEqual(len(tampered), len(target.read_bytes()))
        target.write_bytes(tampered)
        report = verify_manifest(manifest, raw_dir)
        self.assertFalse(report["ok"])
        self.assertEqual(report["errors"][0]["code"], TMD_HPC_CHECKSUM_MISMATCH)

        target.unlink()
        report = verify_manifest(manifest, raw_dir)
        self.assertFalse(report["ok"])
        self.assertEqual(report["errors"][0]["code"], "missing_file")

    def test_load_manifest_rejects_invalid_documents(self):
        broken = self.output / "broken.json"
        broken.write_text("{}", encoding="utf-8")
        with self.assertRaises(TmdHpcError) as raised:
            load_manifest(broken)
        self.assertEqual(raised.exception.code, TMD_HPC_MANIFEST_INVALID)

        missing = self.output / "missing.json"
        with self.assertRaises(TmdHpcError) as raised:
            load_manifest(missing)
        self.assertEqual(raised.exception.code, TMD_HPC_MANIFEST_INVALID)

        manifest = self._download()
        manifest["status"] = "published"
        with self.assertRaises(TmdHpcError):
            verify_manifest(manifest, self.output / "raw" / manifest["run_id"])

    def test_iso_utc(self):
        self.assertEqual(iso_utc(datetime(2026, 10, 26, 0, 0)),
                         "2026-10-26T00:00:00Z")
        self.assertEqual(
            iso_utc(datetime(2026, 10, 26, 7, 30,
                             tzinfo=timezone(timedelta(hours=7)))),
            "2026-10-26T00:30:00Z")
        with self.assertRaises(ValueError):
            iso_utc("2026-10-26T00:00:00Z")

    def test_defaults_are_conservative(self):
        self.assertEqual(DEFAULT_MAX_BYTES, 200_000_000)
        self.assertEqual(hpc.DEFAULT_DOMAIN, "d02")
        self.assertEqual(tuple(hpc.V1_VARIABLES),
                         ("p1h", "p24h", "t2m", "rhum", "ws10m"))
        self.assertTrue(str(hpc.DEFAULT_OUTPUT_DIR).endswith("tmd_nwp_hpc"))


class TmdHpcEnvTests(unittest.TestCase):
    def test_base_url_getter(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TMD_HPC_BASE_URL", None)
            self.assertEqual(get_tmd_hpc_base_url(), "https://hpc.tmd.go.th")
        with mock.patch.dict(os.environ, {"TMD_HPC_BASE_URL": " https://example.test/base/// "}):
            self.assertEqual(get_tmd_hpc_base_url(), "https://example.test/base")
        with mock.patch.dict(os.environ, {"TMD_HPC_BASE_URL": "   "}):
            self.assertEqual(get_tmd_hpc_base_url(), "https://hpc.tmd.go.th")

    def test_publication_mode_getter(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TMD_HPC_PUBLICATION_MODE", None)
            self.assertEqual(get_tmd_hpc_publication_mode(), "numeric_preview")
        with mock.patch.dict(os.environ, {"TMD_HPC_PUBLICATION_MODE": "metadata_only"}):
            self.assertEqual(get_tmd_hpc_publication_mode(), "metadata_only")
        with mock.patch.dict(os.environ, {"TMD_HPC_PUBLICATION_MODE": "public"}):
            with self.assertRaises(ValueError):
                get_tmd_hpc_publication_mode()

    def test_agency_overview_lists_tmd_hpc_as_public_files(self):
        overview = get_agency_keys_overview()
        self.assertIn("TMD_NWP", overview)  # existing entry preserved
        self.assertIn("TMD_HPC", overview)
        entry = overview["TMD_HPC"]
        self.assertEqual(entry["agency"], "กรมอุตุนิยมวิทยา (TMD)")
        self.assertIn("no API key", entry["service"])
        self.assertTrue(entry["configured"])
        self.assertEqual(entry["masked_key"], "(public static files)")


if __name__ == "__main__":
    unittest.main()
