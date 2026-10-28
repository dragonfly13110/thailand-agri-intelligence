from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.request import Request

from tadih.cpd_agricultural_coop_counts import (
    DATASET_ID,
    METADATA_URL,
    RESOURCE_ID,
    RESOURCE_URL,
    CpdCoopSourceError,
    _RejectCpdRedirects,
    _open_cpd_request,
    fetch_cpd_agricultural_coop_counts,
    metadata_from_package_show,
    normalize_cpd_agricultural_coop_csv,
)


FIXTURES = Path(__file__).parent / "fixtures"
CSV_BYTES = (FIXTURES / "cpd_agricultural_coop_counts.csv").read_bytes().replace(b"\r\n", b"\n")
PACKAGE_SHOW = json.loads((FIXTURES / "cpd_agricultural_coop_package_show.json").read_text(encoding="utf-8"))
RETRIEVED_AT = datetime(2026, 10, 28, 5, 0, tzinfo=timezone.utc)


def _package_payload(*, size: int | None = None, resource_hash: str | None = None,
                     last_modified: str | None = None, resource_name: str | None = None):
    payload = copy.deepcopy(PACKAGE_SHOW)
    resource = payload["result"]["resources"][0]
    if size is not None:
        resource["size"] = size
    if resource_hash is not None:
        resource["hash"] = resource_hash
    if last_modified is not None:
        resource["last_modified"] = last_modified
    if resource_name is not None:
        resource["name"] = resource_name
    return payload


def _metadata_for(content: bytes, *, resource_name: str | None = None):
    resource_hash = hashlib.md5(content, usedforsecurity=False).hexdigest()
    return metadata_from_package_show(
        _package_payload(size=len(content), resource_hash=resource_hash, resource_name=resource_name),
    )


class _FakeResponse:
    def __init__(self, body: bytes, *, url: str, content_type: str):
        self.body = body
        self.url = url
        self.status = 200
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(body))}
        self.read_sizes: list[int] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def getcode(self):
        return self.status

    def geturl(self):
        return self.url

    def read(self, size: int):
        self.read_sizes.append(size)
        return self.body[:size]


class CpdAgriculturalCoopNormalizerTests(unittest.TestCase):
    def setUp(self):
        self.source_metadata = metadata_from_package_show(PACKAGE_SHOW)
        self.metadata = _metadata_for(CSV_BYTES)

    def test_preserves_source_rows_statuses_bangkok_units_and_source_year_label(self):
        snapshot = normalize_cpd_agricultural_coop_csv(
            CSV_BYTES, metadata=self.metadata, retrieved_at=RETRIEVED_AT,
        )

        self.assertEqual(snapshot.source_id, "cpd")
        self.assertEqual(snapshot.dataset_id, DATASET_ID)
        self.assertEqual(snapshot.resource_id, RESOURCE_ID)
        self.assertEqual(snapshot.dataset_metadata_modified, "2026-09-24T04:54:20.029517")
        self.assertEqual(snapshot.source_year_label, "2568")
        self.assertEqual(snapshot.source_year_extracted_from, "resource_name")
        self.assertEqual(snapshot.source_year_convention, "unknown")
        self.assertEqual(snapshot.unit, "แห่ง")
        self.assertEqual(snapshot.source_rows_received, 4)
        self.assertEqual(snapshot.source_grain, "source province label × source reporting-office label")
        self.assertEqual(snapshot.retrieved_at, RETRIEVED_AT)

        bangkok = [row for row in snapshot.records if row.province_name == "กรุงเทพมหานคร"]
        self.assertEqual(len(bangkok), 2)
        self.assertEqual(
            [row.reporting_unit for row in bangkok],
            ["สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 1", "สำนักงานส่งเสริมสหกรณ์กรุงเทพมหานคร พื้นที่ 2"],
        )
        self.assertEqual(bangkok[0].province_name_source, "กรุงเทพมหานคร ")
        self.assertEqual(bangkok[0].not_started_count, 0)
        self.assertEqual(bangkok[0].operating_count, 5)
        self.assertEqual(bangkok[0].dissolved_count, 1)
        self.assertFalse(hasattr(snapshot, "period_start"))
        self.assertFalse(hasattr(snapshot, "national_total"))
        self.assertFalse(hasattr(snapshot, "coverage_claim"))

    def test_lf_and_crlf_preserve_values_and_verify_the_exact_content_hash(self):
        for newline in (b"\n", b"\r\n"):
            with self.subTest(newline=newline):
                content = CSV_BYTES.replace(b"\n", newline)
                snapshot = normalize_cpd_agricultural_coop_csv(content, metadata=_metadata_for(content))
                self.assertEqual(snapshot.records[0].operating_count, 5)
                self.assertEqual(snapshot.content_sha256, hashlib.sha256(content).hexdigest())
                blank = content.replace(b",0,5,1" + newline, b",,5,1" + newline, 1)
                self.assertNotEqual(blank, content)
                missing = normalize_cpd_agricultural_coop_csv(blank, metadata=_metadata_for(blank))
                self.assertIsNone(missing.records[0].not_started_count)
                tampered = content.replace(b",0,5,1" + newline, b",0,6,1" + newline, 1)
                with self.assertRaisesRegex(CpdCoopSourceError, "CPD resource hash mismatch"):
                    normalize_cpd_agricultural_coop_csv(tampered, metadata=_metadata_for(content))

    def test_blank_count_stays_null_and_zero_stays_zero(self):
        content = CSV_BYTES.replace(b",0,5,1\n", b",,5,1\n", 1)
        snapshot = normalize_cpd_agricultural_coop_csv(content, metadata=_metadata_for(content))
        first = snapshot.records[0]

        self.assertIsNone(first.not_started_count)
        self.assertEqual(first.operating_count, 5)
        self.assertEqual(first.dissolved_count, 1)
        self.assertEqual(snapshot.records[1].not_started_count, 0)

    def test_does_not_map_or_reject_unrecognized_province_label(self):
        content = CSV_BYTES.replace("กระบี่".encode(), "จังหวัดใหม่".encode(), 1)
        snapshot = normalize_cpd_agricultural_coop_csv(content, metadata=_metadata_for(content))
        row = next(row for row in snapshot.records if row.province_name == "จังหวัดใหม่")

        self.assertEqual(row.province_name_source, "จังหวัดใหม่")
        self.assertFalse(hasattr(row, "province_code"))

    def test_source_year_is_taken_only_from_metadata_name_and_not_made_into_date(self):
        metadata = _metadata_for(CSV_BYTES, resource_name="จำนวนสหกรณ์การเกษตร 2569")
        snapshot = normalize_cpd_agricultural_coop_csv(CSV_BYTES, metadata=metadata)

        self.assertEqual(snapshot.source_year_label, "2569")
        self.assertEqual(snapshot.source_year_extracted_from, "resource_name")
        self.assertEqual(snapshot.source_year_convention, "unknown")
        self.assertIsNone(snapshot.retrieved_at)

    def test_license_declaration_is_preserved_without_invented_canonical_url(self):
        snapshot = normalize_cpd_agricultural_coop_csv(CSV_BYTES, metadata=self.metadata)

        self.assertEqual(snapshot.dataset_license_id, "Creative Commons Attributions")
        self.assertEqual(snapshot.dataset_license_title, "Creative Commons Attributions")
        self.assertIsNone(snapshot.dataset_license_url)
        self.assertIsNone(snapshot.resource_license_id)
        self.assertIsNone(snapshot.resource_license_url)
        self.assertIsNone(snapshot.license_version)

    def test_source_metadata_fixture_records_exact_catalog_version_and_size(self):
        self.assertEqual(self.source_metadata.resource_size, 9554)
        self.assertEqual(self.source_metadata.resource_hash, "48d5acaf91f8d078051e6f21b32968a8")
        self.assertEqual(self.source_metadata.resource_last_modified, "2026-09-24T04:53:48.05985")
        self.assertEqual(self.source_metadata.source_year_label, "2568")

    def test_source_maintainer_and_organization_title_are_preserved_for_exact_attribution(self):
        payload = _package_payload()
        credit = "ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ"
        payload["result"]["maintainer"] = credit
        payload["result"]["organization"] = {"title": credit}
        resource = payload["result"]["resources"][0]
        resource["size"] = len(CSV_BYTES)
        resource["hash"] = hashlib.md5(CSV_BYTES, usedforsecurity=False).hexdigest()

        metadata = metadata_from_package_show(payload)
        snapshot = normalize_cpd_agricultural_coop_csv(CSV_BYTES, metadata=metadata)

        self.assertEqual(metadata.dataset_maintainer, credit)
        self.assertEqual(metadata.dataset_organization_title, credit)
        self.assertEqual(snapshot.dataset_maintainer, credit)
        self.assertEqual(snapshot.dataset_organization_title, credit)

    def test_source_metadata_fixture_without_owner_fields_keeps_them_null(self):
        self.assertIsNone(self.source_metadata.dataset_maintainer)
        self.assertIsNone(self.source_metadata.dataset_organization_title)

    def test_only_ckan_md5_hash_format_is_accepted(self):
        with self.assertRaisesRegex(CpdCoopSourceError, "unsupported CPD resource hash format"):
            metadata_from_package_show(_package_payload(resource_hash="not-an-md5"))
        with self.assertRaisesRegex(CpdCoopSourceError, "unsupported CPD resource hash format"):
            metadata_from_package_show(_package_payload(resource_hash="g" * 32))

    def test_normalizer_rejects_same_size_content_that_does_not_match_ckan_hash(self):
        altered = CSV_BYTES.replace(b",0,5,1\n", b",0,6,1\n", 1)
        self.assertEqual(len(altered), len(CSV_BYTES))

        with self.assertRaisesRegex(CpdCoopSourceError, "CPD resource hash mismatch"):
            normalize_cpd_agricultural_coop_csv(altered, metadata=self.metadata)

    def test_snapshot_hash_is_stable_and_changes_with_content(self):
        first = normalize_cpd_agricultural_coop_csv(CSV_BYTES, metadata=self.metadata)
        replay = normalize_cpd_agricultural_coop_csv(CSV_BYTES, metadata=self.metadata)
        changed_bytes = CSV_BYTES.replace(b",0,5,1\n", b",0,6,1\n", 1)
        changed = normalize_cpd_agricultural_coop_csv(changed_bytes, metadata=_metadata_for(changed_bytes))

        self.assertEqual(first.content_sha256, replay.content_sha256)
        self.assertNotEqual(first.content_sha256, changed.content_sha256)
        self.assertNotEqual(first.records[0].row_sha256, changed.records[0].row_sha256)

    def test_duplicate_province_reporting_unit_fails_closed(self):
        duplicate = CSV_BYTES.splitlines()[1] + b"\n"
        with self.assertRaisesRegex(CpdCoopSourceError, "duplicate source row"):
            content = CSV_BYTES + duplicate
            normalize_cpd_agricultural_coop_csv(content, metadata=_metadata_for(content))

    def test_invalid_number_or_changed_csv_schema_fails_closed(self):
        with self.assertRaisesRegex(CpdCoopSourceError, "invalid count"):
            content = CSV_BYTES.replace(b",0,5,1\n", b",many,5,1\n", 1)
            normalize_cpd_agricultural_coop_csv(content, metadata=_metadata_for(content))
        with self.assertRaisesRegex(CpdCoopSourceError, "CSV header changed"):
            content = CSV_BYTES.replace("จังหวัด".encode(), "พื้นที่".encode(), 1)
            normalize_cpd_agricultural_coop_csv(content, metadata=_metadata_for(content))
        with self.assertRaisesRegex(CpdCoopSourceError, "row width changed"):
            content = CSV_BYTES + b"too,few\n"
            normalize_cpd_agricultural_coop_csv(content, metadata=_metadata_for(content))

    def test_source_metadata_must_match_fixed_cpd_resource(self):
        wrong = _package_payload()
        wrong["result"]["id"] = "another-dataset"
        with self.assertRaisesRegex(CpdCoopSourceError, "unexpected dataset identity"):
            metadata_from_package_show(wrong)

        wrong = _package_payload()
        wrong["result"]["resources"][0]["url"] = "https://example.com/file.csv"
        with self.assertRaisesRegex(CpdCoopSourceError, "unreviewed resource URL"):
            metadata_from_package_show(wrong)

        wrong = _package_payload()
        wrong["result"]["metadata_modified"] = None
        with self.assertRaisesRegex(CpdCoopSourceError, "metadata version missing"):
            metadata_from_package_show(wrong)

    def test_fetch_pins_metadata_around_one_bounded_non_paged_csv_download(self):
        payload = _package_payload(
            size=len(CSV_BYTES), resource_hash=hashlib.md5(CSV_BYTES, usedforsecurity=False).hexdigest(),
        )
        package_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        responses = [
            _FakeResponse(package_bytes, url=METADATA_URL, content_type="application/json"),
            _FakeResponse(CSV_BYTES, url=RESOURCE_URL, content_type="text/csv; charset=utf-8"),
            _FakeResponse(package_bytes, url=METADATA_URL, content_type="application/json"),
        ]
        calls = []

        def opener(request, *, timeout):
            calls.append((request.full_url, timeout, request.headers))
            return responses.pop(0)

        snapshot = fetch_cpd_agricultural_coop_counts(opener=opener, retrieved_at=RETRIEVED_AT)

        self.assertEqual([call[0] for call in calls], [METADATA_URL, RESOURCE_URL, METADATA_URL])
        self.assertTrue(all(call[1] <= 20 for call in calls))
        self.assertFalse(any("datastore_search" in call[0] for call in calls))
        self.assertEqual(snapshot.records[0].operating_count, 5)
        self.assertEqual(snapshot.retrieved_at, RETRIEVED_AT)
        self.assertEqual(responses, [])

    def test_fetch_rejects_source_version_change_between_metadata_reads(self):
        before = _package_payload(
            size=len(CSV_BYTES), resource_hash=hashlib.md5(CSV_BYTES, usedforsecurity=False).hexdigest(),
        )
        after = _package_payload(
            size=len(CSV_BYTES),
            resource_hash=hashlib.md5(CSV_BYTES + b" ", usedforsecurity=False).hexdigest(),
        )
        payloads = [before, after]
        package_bodies = [json.dumps(item, ensure_ascii=False).encode("utf-8") for item in payloads]
        responses = [
            _FakeResponse(package_bodies[0], url=METADATA_URL, content_type="application/json"),
            _FakeResponse(CSV_BYTES, url=RESOURCE_URL, content_type="text/csv"),
            _FakeResponse(package_bodies[1], url=METADATA_URL, content_type="application/json"),
        ]

        def opener(request, *, timeout):
            return responses.pop(0)

        with self.assertRaisesRegex(CpdCoopSourceError, "resource changed during fetch"):
            fetch_cpd_agricultural_coop_counts(opener=opener, retrieved_at=RETRIEVED_AT)

    def test_fetch_rejects_attribution_metadata_change_between_reads(self):
        before = _package_payload(
            size=len(CSV_BYTES), resource_hash=hashlib.md5(CSV_BYTES, usedforsecurity=False).hexdigest(),
        )
        after = copy.deepcopy(before)
        credit = "ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ"
        before["result"]["maintainer"] = credit
        before["result"]["organization"] = {"title": credit}
        after["result"]["maintainer"] = "หน่วยงานใหม่"
        after["result"]["organization"] = {"title": "หน่วยงานใหม่"}
        package_bodies = [
            json.dumps(item, ensure_ascii=False).encode("utf-8") for item in (before, after)
        ]
        responses = [
            _FakeResponse(package_bodies[0], url=METADATA_URL, content_type="application/json"),
            _FakeResponse(CSV_BYTES, url=RESOURCE_URL, content_type="text/csv"),
            _FakeResponse(package_bodies[1], url=METADATA_URL, content_type="application/json"),
        ]

        def opener(request, *, timeout):
            return responses.pop(0)

        with self.assertRaisesRegex(CpdCoopSourceError, "resource changed during fetch"):
            fetch_cpd_agricultural_coop_counts(opener=opener, retrieved_at=RETRIEVED_AT)

    def test_fetch_rejects_same_size_content_tamper_when_metadata_is_unchanged(self):
        tampered = CSV_BYTES.replace(b",0,5,1\n", b",0,6,1\n", 1)
        self.assertEqual(len(tampered), len(CSV_BYTES))
        payload = _package_payload(
            size=len(CSV_BYTES), resource_hash=hashlib.md5(CSV_BYTES, usedforsecurity=False).hexdigest(),
        )
        package_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        responses = [
            _FakeResponse(package_bytes, url=METADATA_URL, content_type="application/json"),
            _FakeResponse(tampered, url=RESOURCE_URL, content_type="text/csv"),
            _FakeResponse(package_bytes, url=METADATA_URL, content_type="application/json"),
        ]

        def opener(request, *, timeout):
            return responses.pop(0)

        with self.assertRaisesRegex(CpdCoopSourceError, "CPD resource hash mismatch"):
            fetch_cpd_agricultural_coop_counts(opener=opener, retrieved_at=RETRIEVED_AT)

    def test_fetch_rejects_redirects_and_oversized_csv(self):
        payload = _package_payload(
            size=len(CSV_BYTES), resource_hash=hashlib.md5(CSV_BYTES, usedforsecurity=False).hexdigest(),
        )
        package_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        redirected = [
            _FakeResponse(package_bytes, url=METADATA_URL, content_type="application/json"),
            _FakeResponse(CSV_BYTES, url="https://example.com/file.csv", content_type="text/csv"),
        ]

        def redirect_opener(request, *, timeout):
            return redirected.pop(0)

        with self.assertRaisesRegex(CpdCoopSourceError, "redirect outside fixed resource"):
            fetch_cpd_agricultural_coop_counts(opener=redirect_opener, retrieved_at=RETRIEVED_AT)

        large = b"x" * (129 * 1024)
        payload = _package_payload(
            size=len(large), resource_hash=hashlib.md5(large, usedforsecurity=False).hexdigest(),
        )
        package_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        oversized = [
            _FakeResponse(package_bytes, url=METADATA_URL, content_type="application/json"),
            _FakeResponse(large, url=RESOURCE_URL, content_type="text/csv"),
        ]

        def oversized_opener(request, *, timeout):
            return oversized.pop(0)

        with self.assertRaisesRegex(CpdCoopSourceError, "exceeds byte limit"):
            fetch_cpd_agricultural_coop_counts(opener=oversized_opener, retrieved_at=RETRIEVED_AT)

    def test_default_opener_rejects_redirect_before_target_is_opened(self):
        for target in (
            "http://127.0.0.1:9/metadata",
            "https://catalog-cpd.data.go.th/api/3/action/package_show?id=other",
            "https://catalog-cpd.data.go.th/dataset/../admin",
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
                self.assertIsInstance(handler, _RejectCpdRedirects)
                return FakeRedirectingOpener(handler)

            with self.subTest(target=target), patch(
                "tadih.cpd_agricultural_coop_counts.build_opener", side_effect=fake_build_opener,
            ):
                with self.assertRaisesRegex(CpdCoopSourceError, "redirect outside exact CPD resource"):
                    _open_cpd_request(Request(RESOURCE_URL), timeout=15)
            self.assertEqual(opened_urls, [RESOURCE_URL])


if __name__ == "__main__":
    unittest.main()
