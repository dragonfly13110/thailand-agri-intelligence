"""OAE export resource normalizes only its declared source fields."""
from decimal import Decimal
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.request import Request

from tadih.oae_trade import (
    DATASET_ID,
    MAX_CSV_BYTES,
    RESOURCE_ID,
    SOURCE_METADATA_URL,
    SOURCE_RESOURCE_URL,
    _RejectOaeRedirects,
    _open_oae_request,
    fetch_oae_trade_snapshot,
    normalize_oae_trade_csv,
)


FIXTURE = Path(__file__).parent / "fixtures/oae_trade/oae_export_2568.csv"
SOURCE_VERSION = "2026-08-17T02:14:23Z"
FIXTURE_BYTES = FIXTURE.read_bytes()
FIXTURE_MD5 = hashlib.md5(FIXTURE_BYTES, usedforsecurity=False).hexdigest()


def normalize(content, **overrides):
    source = {
        "dataset_id": DATASET_ID,
        "resource_id": RESOURCE_ID,
        "source_version": SOURCE_VERSION,
        "source_hash": hashlib.md5(content, usedforsecurity=False).hexdigest(),
        "source_url": SOURCE_RESOURCE_URL,
    }
    source.update(overrides)
    return normalize_oae_trade_csv(content, **source)


class OAETradeNormalizeTests(unittest.TestCase):
    def test_official_fixture_keeps_year_label_unit_and_products_without_geography(self):
        snapshot = normalize(FIXTURE_BYTES)

        self.assertEqual(len(snapshot.records), 11)
        self.assertEqual(snapshot.source_version, SOURCE_VERSION)
        self.assertEqual(snapshot.records[0].year_label, "2568")
        self.assertEqual(snapshot.records[0].trade_type, "การส่งออก")
        self.assertEqual(snapshot.records[0].product, "ผลไม้และผลิตภัณฑ์")
        self.assertEqual(snapshot.records[0].value, Decimal("296645"))
        self.assertEqual(snapshot.records[0].value_raw, "296645")
        self.assertEqual(snapshot.records[0].unit, "ล้านบาท")
        self.assertEqual(snapshot.records[-1].product, "อื่น ๆ")
        self.assertFalse(hasattr(snapshot.records[0], "province_code"))

    def test_source_missing_markers_remain_null_and_zero_remains_zero(self):
        content = (
            "year,type,product,value,unit\n"
            "2568,การส่งออก,blank,,ล้านบาท\n"
            "2568,การส่งออก,no data,n.a.,ล้านบาท\n"
            "2568,การส่งออก,not calculated,..,ล้านบาท\n"
            "2568,การส่งออก,small amount,--,ล้านบาท\n"
            "2568,การส่งออก,zero,0,ล้านบาท\n"
        ).encode("utf-8")

        records = normalize(content).records

        self.assertEqual([record.value for record in records], [None, None, None, None, Decimal("0")])
        self.assertEqual([record.value_raw for record in records], ["", "n.a.", "..", "--", "0"])

    def test_duplicate_year_trade_type_product_is_rejected(self):
        content = (
            "year,type,product,value,unit\n"
            "2568,การส่งออก,ผลไม้และผลิตภัณฑ์,1,ล้านบาท\n"
            "2568,การส่งออก,ผลไม้และผลิตภัณฑ์,2,ล้านบาท\n"
        ).encode("utf-8")

        with self.assertRaisesRegex(ValueError, "duplicate trade row"):
            normalize(content)

    def test_wrong_source_identity_or_missing_version_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "source identity"):
            normalize(FIXTURE_BYTES, resource_id="wrong-resource")
        with self.assertRaisesRegex(ValueError, "source version"):
            normalize(FIXTURE_BYTES, source_version=" ")

    def test_resource_url_must_match_exact_canonical_reviewed_url(self):
        base_dir = SOURCE_RESOURCE_URL.rsplit("sta_cai10_cai_exp1.csv", 1)[0]
        traversal_urls = (
            base_dir + "../../other.csv",
            base_dir + "%2e%2e%2fother.csv",
            base_dir + "%252e%252e%252fother.csv",
        )
        noncanonical_urls = (
            SOURCE_RESOURCE_URL + "?download=1",
            SOURCE_RESOURCE_URL + "#fragment",
            SOURCE_RESOURCE_URL.replace("catalog.oae.go.th", "catalog.oae.go.th:443"),
            SOURCE_RESOURCE_URL.replace("catalog.oae.go.th", "user@catalog.oae.go.th"),
            SOURCE_RESOURCE_URL.replace("catalog.oae.go.th", "catalog.oae.go.th.evil"),
            SOURCE_RESOURCE_URL.replace("https://", "http://", 1),
        )
        for candidate in (*traversal_urls, *noncanonical_urls):
            with self.subTest(candidate=candidate), self.assertRaisesRegex(ValueError, "unreviewed OAE resource URL"):
                normalize(FIXTURE_BYTES, source_url=candidate)

    def test_source_md5_must_be_32_hex_and_match_csv_bytes(self):
        with self.assertRaisesRegex(ValueError, "OAE resource hash format is unsupported"):
            normalize(FIXTURE_BYTES, source_hash="not-an-md5")

        tampered = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
        self.assertEqual(len(tampered), len(FIXTURE_BYTES))
        with self.assertRaisesRegex(ValueError, "OAE resource hash mismatch"):
            normalize(tampered, source_hash=FIXTURE_MD5)

    def test_source_url_accepts_only_exact_canonical_resource(self):
        self.assertEqual(normalize(FIXTURE_BYTES).source_url, SOURCE_RESOURCE_URL)

    def test_unreviewed_trade_type_or_unit_is_rejected(self):
        for row in (
            "2568,การนำเข้า,สินค้า,1,ล้านบาท",
            "2568,การส่งออก,สินค้า,1,บาท",
        ):
            with self.subTest(row=row), self.assertRaises(ValueError):
                normalize(("year,type,product,value,unit\n" + row + "\n").encode("utf-8"))

    def test_changed_header_or_nonfinite_value_is_rejected(self):
        changed_header = b"year,type,product,value,unit,province\n"
        nonfinite_value = "year,type,product,value,unit\n2568,การส่งออก,item,NaN,ล้านบาท\n".encode("utf-8")

        with self.assertRaisesRegex(ValueError, "CSV header"):
            normalize(changed_header)
        with self.assertRaisesRegex(ValueError, "numeric source value"):
            normalize(nonfinite_value)


class FakeResponse(io.BytesIO):
    def __init__(self, body, *, url, content_type, content_length=True):
        super().__init__(body)
        self.url = url
        self.status = 200
        self.headers = {"Content-Type": content_type}
        self.read_sizes = []
        if content_length:
            self.headers["Content-Length"] = str(len(body))

    def geturl(self):
        return self.url

    def getcode(self):
        return self.status

    def read(self, size=-1):
        self.read_sizes.append(size)
        return super().read(size)


def package_body(*, dataset_id=DATASET_ID, resource_id=RESOURCE_ID, version=SOURCE_VERSION,
                 size=None, url=SOURCE_RESOURCE_URL, resource_hash=FIXTURE_MD5):
    return json.dumps({
        "success": True,
        "result": {
            "id": dataset_id,
            "resources": [{
                "id": resource_id,
                "format": "CSV",
                "url": url,
                "last_modified": version,
                "size": len(FIXTURE_BYTES) if size is None else size,
                "hash": resource_hash,
            }],
        },
    }).encode("utf-8")


class OAETradeFetchTests(unittest.TestCase):
    def test_fetch_checks_exact_resource_version_and_returns_source_snapshot(self):
        calls = []
        responses = [
            FakeResponse(package_body(), url=SOURCE_METADATA_URL, content_type="application/json; charset=utf-8"),
            FakeResponse(FIXTURE_BYTES, url=SOURCE_RESOURCE_URL, content_type="text/csv; charset=utf-8"),
            FakeResponse(package_body(), url=SOURCE_METADATA_URL, content_type="application/json; charset=utf-8"),
        ]
        retrieved_at = datetime(2026, 10, 28, 3, 15, 0, tzinfo=timezone.utc)

        def opener(request, *, timeout):
            calls.append((request.full_url, timeout))
            return responses.pop(0)

        with patch("tadih.oae_trade.datetime") as clock:
            clock.now.return_value = retrieved_at
            snapshot = fetch_oae_trade_snapshot(opener=opener)

        self.assertEqual(calls, [
            (SOURCE_METADATA_URL, 12),
            (SOURCE_RESOURCE_URL, 12),
            (SOURCE_METADATA_URL, 12),
        ])
        self.assertEqual(snapshot.resource_id, RESOURCE_ID)
        self.assertEqual(snapshot.source_version, SOURCE_VERSION)
        self.assertEqual(snapshot.source_hash, FIXTURE_MD5)
        self.assertEqual(len(snapshot.records), 11)
        self.assertEqual(snapshot.retrieved_at, retrieved_at)
        self.assertIs(snapshot.retrieved_at.tzinfo, timezone.utc)
        self.assertEqual(snapshot.records[0].year_label, "2568")

    def test_fetch_fails_closed_when_resource_metadata_changes_during_csv_fetch(self):
        changed_metadata = (
            ("version", package_body(version="2026-08-18T00:00:00Z"), "metadata changed during CSV fetch"),
            ("hash", package_body(resource_hash=hashlib.md5(FIXTURE_BYTES + b" ", usedforsecurity=False).hexdigest()),
             "metadata changed during CSV fetch"),
            ("url", package_body(url=SOURCE_RESOURCE_URL.replace("sta_cai10_cai_exp1.csv", "changed.csv")),
             "unreviewed OAE resource URL"),
            ("size", package_body(size=len(FIXTURE_BYTES) + 1), "metadata changed during CSV fetch"),
        )
        for changed_field, changed_body, expected_error in changed_metadata:
            responses = [
                FakeResponse(package_body(), url=SOURCE_METADATA_URL, content_type="application/json"),
                FakeResponse(FIXTURE_BYTES, url=SOURCE_RESOURCE_URL, content_type="text/csv"),
                FakeResponse(changed_body, url=SOURCE_METADATA_URL, content_type="application/json"),
            ]
            calls = []

            def opener(request, *, timeout):
                calls.append(request.full_url)
                return responses.pop(0)

            with self.subTest(changed_field=changed_field), self.assertRaisesRegex(
                ValueError, expected_error,
            ):
                fetch_oae_trade_snapshot(opener=opener)
            self.assertEqual(calls, [SOURCE_METADATA_URL, SOURCE_RESOURCE_URL, SOURCE_METADATA_URL])

    def test_fetch_rejects_same_size_csv_tamper_even_when_metadata_is_unchanged(self):
        tampered = FIXTURE_BYTES.replace(b"296645", b"296646", 1)
        self.assertEqual(len(tampered), len(FIXTURE_BYTES))
        responses = [
            FakeResponse(package_body(), url=SOURCE_METADATA_URL, content_type="application/json"),
            FakeResponse(tampered, url=SOURCE_RESOURCE_URL, content_type="text/csv"),
            FakeResponse(package_body(), url=SOURCE_METADATA_URL, content_type="application/json"),
        ]
        calls = []

        def opener(request, *, timeout):
            calls.append(request.full_url)
            return responses.pop(0)

        with self.assertRaisesRegex(ValueError, "OAE resource hash mismatch"):
            fetch_oae_trade_snapshot(opener=opener)
        self.assertEqual(calls, [SOURCE_METADATA_URL, SOURCE_RESOURCE_URL, SOURCE_METADATA_URL])

    def test_fetch_rejects_wrong_package_or_unbounded_resource_before_download(self):
        for body, expected_error in (
            (package_body(dataset_id="other-dataset"), "source identity"),
            (package_body(size=MAX_CSV_BYTES + 1), "byte limit"),
        ):
            calls = []

            def opener(request, *, timeout):
                calls.append(request.full_url)
                return FakeResponse(body, url=SOURCE_METADATA_URL, content_type="application/json")

            with self.subTest(expected_error=expected_error), self.assertRaisesRegex(ValueError, expected_error):
                fetch_oae_trade_snapshot(opener=opener)
            self.assertEqual(calls, [SOURCE_METADATA_URL])

    def test_fetch_rejects_missing_or_unsupported_source_hash_before_download(self):
        for hash_value in (None, "md5:" + FIXTURE_MD5, "g" * 32):
            body = json.dumps({
                "success": True,
                "result": {
                    "id": DATASET_ID,
                    "resources": [{
                        "id": RESOURCE_ID,
                        "format": "CSV",
                        "url": SOURCE_RESOURCE_URL,
                        "last_modified": SOURCE_VERSION,
                        "size": len(FIXTURE_BYTES),
                        "hash": hash_value,
                    }],
                },
            }).encode("utf-8")
            calls = []

            def opener(request, *, timeout):
                calls.append(request.full_url)
                return FakeResponse(body, url=SOURCE_METADATA_URL, content_type="application/json")

            with self.subTest(hash_value=hash_value), self.assertRaisesRegex(
                ValueError, "OAE resource hash format is unsupported",
            ):
                fetch_oae_trade_snapshot(opener=opener)
            self.assertEqual(calls, [SOURCE_METADATA_URL])

    def test_fetch_rejects_redirect_outside_oae_host(self):
        responses = [
            FakeResponse(package_body(), url=SOURCE_METADATA_URL, content_type="application/json"),
            FakeResponse(FIXTURE_BYTES, url="https://example.org/export.csv", content_type="text/csv"),
        ]

        with self.assertRaisesRegex(ValueError, "redirect outside exact OAE resource"):
            fetch_oae_trade_snapshot(opener=lambda *args, **kwargs: responses.pop(0))

    def test_redirect_handler_rejects_target_before_any_second_request(self):
        for target in (
            "http://127.0.0.1:9/metadata",
            "https://catalog.oae.go.th/dataset/../admin",
            "https://catalog.oae.go.th/dataset/other-resource.csv",
        ):
            opened_urls = []

            class FakeRedirectingOpener:
                def __init__(self, redirect_handler):
                    self.redirect_handler = redirect_handler

                def open(self, request, *, timeout):
                    opened_urls.append(request.full_url)
                    self.redirect_handler.redirect_request(
                        request, None, 302, "Found", {"Location": target}, target,
                    )
                    opened_urls.append(target)

            def fake_build_opener(handler):
                self.assertIsInstance(handler, _RejectOaeRedirects)
                return FakeRedirectingOpener(handler)

            with self.subTest(target=target), patch("tadih.oae_trade.build_opener", side_effect=fake_build_opener):
                with self.assertRaisesRegex(ValueError, "redirect outside exact OAE resource"):
                    _open_oae_request(Request(SOURCE_RESOURCE_URL), timeout=12)
            self.assertEqual(opened_urls, [SOURCE_RESOURCE_URL])

    def test_fetch_reads_at_most_the_csv_limit_plus_one_byte(self):
        too_large = b"x" * (MAX_CSV_BYTES + 1)
        csv_response = FakeResponse(
            too_large, url=SOURCE_RESOURCE_URL, content_type="text/csv", content_length=False,
        )
        responses = [
            FakeResponse(package_body(size=1), url=SOURCE_METADATA_URL, content_type="application/json"),
            csv_response,
        ]

        with self.assertRaisesRegex(ValueError, "byte limit"):
            fetch_oae_trade_snapshot(opener=lambda *args, **kwargs: responses.pop(0))
        self.assertEqual(csv_response.read_sizes, [MAX_CSV_BYTES + 1])


if __name__ == "__main__":
    unittest.main()
