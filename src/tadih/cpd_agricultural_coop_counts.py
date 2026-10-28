"""Read and normalize CPD's province/reporting-office cooperative-count CSV.

The source publishes one CSV resource per year label. Its data rows have no
stable row identifier and its year convention is not stated, so this module
keeps the source labels, row grain, resource revision, and missing values
without turning the year into a date or aggregating reporting offices.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import io
import json
import re
from typing import Callable
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


SOURCE_ID = "cpd"
DATASET_ID = "7e7e236d-790d-489d-a723-e0b1359530a4"
DATASET_NAME = "จำนวนสหกรณ์การเกษตร"
RESOURCE_ID = "44463650-5d2e-482b-9919-b1c5b8bc5c6b"
RESOURCE_NAME = "จำนวนสหกรณ์การเกษตร 2568"
METADATA_URL = f"https://catalog-cpd.data.go.th/api/3/action/package_show?id={DATASET_ID}"
RESOURCE_URL = (
    "https://catalog-cpd.data.go.th/dataset/7e7e236d-790d-489d-a723-e0b1359530a4/"
    "resource/44463650-5d2e-482b-9919-b1c5b8bc5c6b/download/st_001_01.csv"
)
SOURCE_UNIT = "แห่ง"
CSV_FIELDS = (
    "จังหวัด",
    "สังกัดหน่วยงาน",
    "ยังไม่เริ่มดำเนินการ",
    "ดำเนินการ",
    "เลิกสหกรณ์",
)
MAX_CSV_BYTES = 128 * 1024
MAX_METADATA_BYTES = 256 * 1024
REQUEST_TIMEOUT_SECONDS = 15
_USER_AGENT = "TADIH bounded CPD cooperative-count reader"
_CPD_ALLOWED_URLS = frozenset({METADATA_URL, RESOURCE_URL})
_YEAR_SUFFIX = re.compile(r"^จำนวนสหกรณ์การเกษตร ([0-9]{4})$")
_INTEGER = re.compile(r"^[0-9]+$", re.ASCII)
_CKAN_MD5 = re.compile(r"^[0-9a-f]{32}$", re.IGNORECASE | re.ASCII)


class CpdCoopSourceError(ValueError):
    """The pinned CPD source cannot be read or normalized safely."""


class _RejectCpdRedirects(HTTPRedirectHandler):
    """Reject urllib redirects before it can open a different target URL."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if req.full_url not in _CPD_ALLOWED_URLS:
            raise CpdCoopSourceError("redirect from unreviewed CPD URL")
        target_url = urljoin(req.full_url, newurl)
        if target_url != req.full_url or target_url not in _CPD_ALLOWED_URLS:
            raise CpdCoopSourceError("redirect outside exact CPD resource")
        raise CpdCoopSourceError("CPD redirect rejected before following")


def _open_cpd_request(request, *, timeout):
    return build_opener(_RejectCpdRedirects()).open(request, timeout=timeout)


@dataclass(frozen=True, slots=True)
class CpdCoopResourceMetadata:
    dataset_id: str
    dataset_name: str
    dataset_description: str
    dataset_maintainer: str | None
    dataset_organization_title: str | None
    dataset_metadata_modified: str
    dataset_license_id: str | None
    dataset_license_title: str | None
    dataset_license_url: str | None
    resource_id: str
    resource_name: str
    resource_url: str
    resource_hash: str
    resource_last_modified: str
    resource_size: int
    resource_license_id: str | None
    resource_license_url: str | None
    source_year_label: str


@dataclass(frozen=True, slots=True)
class CpdCoopCountRow:
    source_row_number: int
    row_sha256: str
    province_name: str
    province_name_source: str
    reporting_unit: str
    reporting_unit_source: str
    not_started_count: int | None
    operating_count: int | None
    dissolved_count: int | None


@dataclass(frozen=True, slots=True)
class CpdCoopCountSnapshot:
    source_id: str
    dataset_id: str
    dataset_description: str
    dataset_maintainer: str | None
    dataset_organization_title: str | None
    dataset_metadata_modified: str
    resource_id: str
    resource_name: str
    source_url: str
    source_grain: str
    unit: str
    source_year_label: str
    source_year_extracted_from: str
    source_year_convention: str
    source_rows_received: int
    source_province_labels_observed: int
    source_reporting_units_observed: int
    resource_hash: str
    resource_last_modified: str
    resource_size_bytes: int
    content_sha256: str
    dataset_license_id: str | None
    dataset_license_title: str | None
    dataset_license_url: str | None
    resource_license_id: str | None
    resource_license_url: str | None
    license_version: None
    retrieved_at: datetime | None
    records: tuple[CpdCoopCountRow, ...]


def metadata_from_package_show(payload: object) -> CpdCoopResourceMetadata:
    """Validate package_show identity and return metadata for the one reviewed CSV."""
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise CpdCoopSourceError("invalid CPD package_show response")
    package = payload.get("result")
    if not isinstance(package, dict):
        raise CpdCoopSourceError("invalid CPD package metadata")
    if package.get("id") != DATASET_ID or package.get("title") != DATASET_NAME:
        raise CpdCoopSourceError("unexpected dataset identity")
    dataset_description = package.get("notes")
    dataset_metadata_modified = package.get("metadata_modified")
    if not isinstance(dataset_description, str) or not dataset_description.strip():
        raise CpdCoopSourceError("CPD dataset description missing")
    if not isinstance(dataset_metadata_modified, str) or not dataset_metadata_modified.strip():
        raise CpdCoopSourceError("CPD dataset metadata version missing")
    dataset_maintainer = _optional_text(package.get("maintainer"))
    organization = package.get("organization")
    if organization is None:
        dataset_organization_title = None
    elif not isinstance(organization, dict):
        raise CpdCoopSourceError("invalid CPD organization metadata")
    else:
        dataset_organization_title = _optional_text(organization.get("title"))

    resources = package.get("resources")
    if not isinstance(resources, list):
        raise CpdCoopSourceError("CPD package resources missing")
    matches = [resource for resource in resources
               if isinstance(resource, dict) and resource.get("id") == RESOURCE_ID]
    if len(matches) != 1:
        raise CpdCoopSourceError("fixed CPD resource missing or duplicated")
    resource = matches[0]

    resource_name = resource.get("name")
    year_match = _YEAR_SUFFIX.fullmatch(resource_name) if isinstance(resource_name, str) else None
    if year_match is None:
        raise CpdCoopSourceError("fixed CPD resource name changed")
    if not isinstance(resource.get("format"), str) or resource["format"].strip().casefold() != "csv":
        raise CpdCoopSourceError("fixed CPD resource format changed")
    if resource.get("url") != RESOURCE_URL:
        raise CpdCoopSourceError("unreviewed resource URL")
    _validate_exact_https_url(resource["url"], RESOURCE_URL)

    resource_hash = resource.get("hash")
    last_modified = resource.get("last_modified")
    size = resource.get("size")
    if not isinstance(resource_hash, str) or not resource_hash.strip():
        raise CpdCoopSourceError("CPD resource version hash missing")
    if not _CKAN_MD5.fullmatch(resource_hash.strip()):
        raise CpdCoopSourceError("unsupported CPD resource hash format")
    if not isinstance(last_modified, str) or not last_modified.strip():
        raise CpdCoopSourceError("CPD resource last_modified missing")
    if isinstance(size, bool) or not isinstance(size, int) or not 0 < size <= MAX_CSV_BYTES:
        raise CpdCoopSourceError("CPD resource size invalid or exceeds byte limit")

    dataset_license_id = _optional_text(package.get("license_id"))
    dataset_license_title = _optional_text(package.get("license_title"))
    dataset_license_url = _optional_text(package.get("license_url"))
    resource_license_id = _optional_text(resource.get("license_id"))
    resource_license_url = _optional_text(resource.get("license_url"))

    return CpdCoopResourceMetadata(
        dataset_id=DATASET_ID,
        dataset_name=DATASET_NAME,
        dataset_description=dataset_description.strip(),
        dataset_maintainer=dataset_maintainer,
        dataset_organization_title=dataset_organization_title,
        dataset_metadata_modified=dataset_metadata_modified.strip(),
        dataset_license_id=dataset_license_id,
        dataset_license_title=dataset_license_title,
        dataset_license_url=dataset_license_url,
        resource_id=RESOURCE_ID,
        resource_name=resource_name,
        resource_url=RESOURCE_URL,
        resource_hash=resource_hash.strip(),
        resource_last_modified=last_modified.strip(),
        resource_size=size,
        resource_license_id=resource_license_id,
        resource_license_url=resource_license_url,
        source_year_label=year_match.group(1),
    )


def normalize_cpd_agricultural_coop_csv(
    content: bytes,
    *,
    metadata: CpdCoopResourceMetadata,
    retrieved_at: datetime | None = None,
) -> CpdCoopCountSnapshot:
    """Parse one pinned CSV while preserving source grain, labels, nulls, and revision."""
    if not isinstance(metadata, CpdCoopResourceMetadata):
        raise CpdCoopSourceError("CPD resource metadata required")
    if not isinstance(content, bytes) or not 0 < len(content) <= MAX_CSV_BYTES:
        raise CpdCoopSourceError("CPD CSV empty or exceeds byte limit")
    if len(content) != metadata.resource_size:
        raise CpdCoopSourceError("CPD CSV size differs from pinned metadata")
    _verify_resource_hash(content, metadata.resource_hash)
    if retrieved_at is not None:
        if not isinstance(retrieved_at, datetime) or retrieved_at.tzinfo is None:
            raise CpdCoopSourceError("retrieval timestamp must be timezone-aware")
        retrieved_at = retrieved_at.astimezone(timezone.utc)

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CpdCoopSourceError("CPD CSV is not UTF-8") from exc

    try:
        reader = csv.DictReader(io.StringIO(text, newline=""))
        if tuple(reader.fieldnames or ()) != CSV_FIELDS:
            raise CpdCoopSourceError("CSV header changed")
        records: list[CpdCoopCountRow] = []
        seen_source_grain: set[tuple[str, str]] = set()
        for row_number, row in enumerate(reader, start=1):
            if None in row or any(row.get(field) is None for field in CSV_FIELDS):
                raise CpdCoopSourceError("CSV row width changed")
            province_source = row["จังหวัด"]
            reporting_unit_source = row["สังกัดหน่วยงาน"]
            if not isinstance(province_source, str) or not province_source.strip():
                raise CpdCoopSourceError("source province label missing")
            if not isinstance(reporting_unit_source, str) or not reporting_unit_source.strip():
                raise CpdCoopSourceError("source reporting unit missing")
            province = province_source.strip()
            reporting_unit = reporting_unit_source.strip()
            identity = (province, reporting_unit)
            if identity in seen_source_grain:
                raise CpdCoopSourceError("duplicate source row")
            seen_source_grain.add(identity)

            raw_counts = [row[field].strip() for field in CSV_FIELDS[2:]]
            counts = [_parse_count(value) for value in raw_counts]
            canonical_row = json.dumps(
                [province_source, reporting_unit_source, *raw_counts],
                ensure_ascii=False,
                separators=(",", ":"),
            )
            row_sha256 = hashlib.sha256(canonical_row.encode("utf-8")).hexdigest()
            records.append(CpdCoopCountRow(
                source_row_number=row_number,
                row_sha256=row_sha256,
                province_name=province,
                province_name_source=province_source,
                reporting_unit=reporting_unit,
                reporting_unit_source=reporting_unit_source,
                not_started_count=counts[0],
                operating_count=counts[1],
                dissolved_count=counts[2],
            ))
    except csv.Error as exc:
        raise CpdCoopSourceError("invalid CPD CSV") from exc

    if not records:
        raise CpdCoopSourceError("CPD CSV has no data rows")

    return CpdCoopCountSnapshot(
        source_id=SOURCE_ID,
        dataset_id=metadata.dataset_id,
        dataset_description=metadata.dataset_description,
        dataset_maintainer=metadata.dataset_maintainer,
        dataset_organization_title=metadata.dataset_organization_title,
        dataset_metadata_modified=metadata.dataset_metadata_modified,
        resource_id=metadata.resource_id,
        resource_name=metadata.resource_name,
        source_url=metadata.resource_url,
        source_grain="source province label × source reporting-office label",
        unit=SOURCE_UNIT,
        source_year_label=metadata.source_year_label,
        source_year_extracted_from="resource_name",
        source_year_convention="unknown",
        source_rows_received=len(records),
        source_province_labels_observed=len({row.province_name for row in records}),
        source_reporting_units_observed=len({row.reporting_unit for row in records}),
        resource_hash=metadata.resource_hash,
        resource_last_modified=metadata.resource_last_modified,
        resource_size_bytes=metadata.resource_size,
        content_sha256=hashlib.sha256(content).hexdigest(),
        dataset_license_id=metadata.dataset_license_id,
        dataset_license_title=metadata.dataset_license_title,
        dataset_license_url=metadata.dataset_license_url,
        resource_license_id=metadata.resource_license_id,
        resource_license_url=metadata.resource_license_url,
        license_version=None,
        retrieved_at=retrieved_at,
        records=tuple(records),
    )


def fetch_cpd_agricultural_coop_counts(*, opener: Callable | None = None,
                                       retrieved_at: datetime | None = None) -> CpdCoopCountSnapshot:
    """Fetch the fixed CSV between bounded package_show reads; the resource is not paged."""
    open_request = _open_cpd_request if opener is None else opener
    before = _fetch_metadata(open_request)

    request = Request(RESOURCE_URL, headers={"Accept": "text/csv", "User-Agent": _USER_AGENT})
    with open_request(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        content = _read_bounded_response(
            response,
            expected_url=RESOURCE_URL,
            media_types={"text/csv", "application/octet-stream"},
            max_bytes=MAX_CSV_BYTES,
        )
    if len(content) != before.resource_size:
        raise CpdCoopSourceError("CPD CSV size differs from pinned metadata")

    after = _fetch_metadata(open_request)
    if before != after:
        raise CpdCoopSourceError("CPD resource changed during fetch")

    if retrieved_at is None:
        retrieved_at = datetime.now(timezone.utc)
    return normalize_cpd_agricultural_coop_csv(content, metadata=before, retrieved_at=retrieved_at)


def _fetch_metadata(open_request: Callable) -> CpdCoopResourceMetadata:
    request = Request(METADATA_URL, headers={"Accept": "application/json", "User-Agent": _USER_AGENT})
    with open_request(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        content = _read_bounded_response(
            response,
            expected_url=METADATA_URL,
            media_types={"application/json"},
            max_bytes=MAX_METADATA_BYTES,
        )
    try:
        payload = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CpdCoopSourceError("invalid CPD package_show JSON") from exc
    return metadata_from_package_show(payload)


def _read_bounded_response(response, *, expected_url: str, media_types: set[str], max_bytes: int) -> bytes:
    if response.getcode() != 200:
        raise CpdCoopSourceError("CPD source returned a non-200 response")
    if response.geturl() != expected_url:
        raise CpdCoopSourceError("redirect outside fixed resource")
    content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    if content_type not in media_types:
        raise CpdCoopSourceError("CPD source returned unexpected content type")

    raw_length = response.headers.get("Content-Length")
    if raw_length is not None:
        if not re.fullmatch(r"[0-9]+", str(raw_length), re.ASCII):
            raise CpdCoopSourceError("CPD response has invalid content length")
        if not 0 < int(raw_length) <= max_bytes:
            raise CpdCoopSourceError("CPD response exceeds byte limit")

    content = response.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise CpdCoopSourceError("CPD response exceeds byte limit")
    if not content or (raw_length is not None and len(content) != int(raw_length)):
        raise CpdCoopSourceError("CPD response size changed")
    return content


def _parse_count(raw: str) -> int | None:
    if raw == "":
        return None
    if not _INTEGER.fullmatch(raw):
        raise CpdCoopSourceError("invalid count")
    return int(raw)


def _verify_resource_hash(content: bytes, source_hash: str) -> None:
    if not isinstance(source_hash, str) or not _CKAN_MD5.fullmatch(source_hash):
        raise CpdCoopSourceError("unsupported CPD resource hash format")
    # CKAN publishes its resource hash as a 32-hex MD5 digest. This checks that
    # the downloaded bytes match that catalog revision; MD5 is not used for
    # authentication or security. SHA-256 below remains our local fingerprint.
    actual_md5 = hashlib.md5(content, usedforsecurity=False).hexdigest()
    if not hmac.compare_digest(actual_md5, source_hash.lower()):
        raise CpdCoopSourceError("CPD resource hash mismatch")


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise CpdCoopSourceError("invalid optional CPD metadata text")
    return value.strip() or None


def _validate_exact_https_url(value: str, expected: str) -> None:
    parsed = urlparse(value)
    expected_parsed = urlparse(expected)
    if (parsed.scheme != "https" or parsed.hostname != "catalog-cpd.data.go.th"
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or value != expected or parsed.hostname != expected_parsed.hostname):
        raise CpdCoopSourceError("unreviewed CPD URL")
