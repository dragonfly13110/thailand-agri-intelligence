"""Normalize one exact OAE export resource without inventing geography or period semantics."""
import csv
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import re
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


SOURCE_ID = "oae"
DATASET_ID = "990f9c44-c484-42ed-aed8-b4369bef1b48"
RESOURCE_ID = "05a5c2b7-f43b-4232-b7ae-04aca5c63329"
SOURCE_METADATA_URL = f"https://catalog.oae.go.th/api/3/action/package_show?id={DATASET_ID}"
SOURCE_RESOURCE_URL = (
    "https://catalog.oae.go.th/dataset/990f9c44-c484-42ed-aed8-b4369bef1b48/"
    "resource/05a5c2b7-f43b-4232-b7ae-04aca5c63329/download/sta_cai10_cai_exp1.csv"
)
CSV_FIELDS = ("year", "type", "product", "value", "unit")
TRADE_TYPE = "การส่งออก"
UNIT = "ล้านบาท"
MISSING_VALUE_MARKERS = {"", "n.a.", "..", "--"}
_NUMERIC_VALUE = re.compile(r"-?[0-9]+(?:\.[0-9]+)?\Z")
_SOURCE_MD5 = re.compile(r"[0-9a-f]{32}\Z", re.IGNORECASE | re.ASCII)
# shortcut: the reviewed CSV is 1.4 KiB; review the changed resource before raising this cap.
MAX_CSV_BYTES = 64 * 1024
MAX_METADATA_BYTES = 64 * 1024
REQUEST_TIMEOUT_SECONDS = 12
_USER_AGENT = "TADIH bounded OAE trade reader"
_OAE_ALLOWED_URLS = frozenset({SOURCE_METADATA_URL, SOURCE_RESOURCE_URL})


@dataclass(frozen=True, slots=True)
class OAETradeRecord:
    # Preserve OAE's year token as a label; the source does not declare calendar or fiscal semantics here.
    year_label: str
    trade_type: str
    product: str
    value: Decimal | None
    value_raw: str
    unit: str


@dataclass(frozen=True, slots=True)
class OAETradeSnapshot:
    source_id: str
    dataset_id: str
    resource_id: str
    source_version: str
    source_hash: str
    source_url: str
    # Parser-only snapshots have no retrieval event; live fetch sets this after post-fetch checks.
    retrieved_at: datetime | None
    content_sha256: str
    records: tuple[OAETradeRecord, ...]


def _validate_source(dataset_id: str, resource_id: str, source_version: str,
                     source_hash: str, source_url: str) -> None:
    if dataset_id != DATASET_ID or resource_id != RESOURCE_ID:
        raise ValueError("unexpected OAE source identity")
    if not isinstance(source_version, str) or not source_version.strip():
        raise ValueError("OAE source version is required")
    if not isinstance(source_hash, str) or not _SOURCE_MD5.fullmatch(source_hash):
        raise ValueError("OAE resource hash format is unsupported")
    if not isinstance(source_url, str):
        raise ValueError("unreviewed OAE resource URL")
    parsed = urlparse(source_url)
    expected_path = f"/dataset/{DATASET_ID}/resource/{RESOURCE_ID}/download/"
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("unreviewed OAE resource URL") from exc
    if (source_url != SOURCE_RESOURCE_URL or parsed.scheme != "https"
            or parsed.netloc != "catalog.oae.go.th" or parsed.hostname != "catalog.oae.go.th"
            or port is not None or parsed.username is not None or parsed.password is not None
            or parsed.path != expected_path + "sta_cai10_cai_exp1.csv"
            or parsed.params or parsed.query or parsed.fragment):
        raise ValueError("unreviewed OAE resource URL")


class _RejectOaeRedirects(HTTPRedirectHandler):
    """Do not let urllib follow redirects away from pinned OAE endpoints."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if req.full_url not in _OAE_ALLOWED_URLS:
            raise ValueError("redirect from unreviewed OAE URL")
        target_url = urljoin(req.full_url, newurl)
        if target_url != req.full_url or target_url not in _OAE_ALLOWED_URLS:
            raise ValueError("redirect outside exact OAE resource")
        # Even a same-URL redirect is not followed; these fixed resources have
        # no reviewed redirect contract, and this callback runs before re-open.
        raise ValueError("OAE redirect rejected before following")


def _open_oae_request(request, *, timeout):
    return build_opener(_RejectOaeRedirects()).open(request, timeout=timeout)


def _number(value_raw: str) -> Decimal | None:
    if value_raw.casefold() in MISSING_VALUE_MARKERS:
        return None
    if not _NUMERIC_VALUE.fullmatch(value_raw):
        raise ValueError("invalid numeric source value")
    try:
        value = Decimal(value_raw)
    except InvalidOperation as exc:
        raise ValueError("invalid numeric source value") from exc
    if not value.is_finite():
        raise ValueError("invalid numeric source value")
    return value


def normalize_oae_trade_csv(
    content: bytes,
    *,
    dataset_id: str,
    resource_id: str,
    source_version: str,
    source_hash: str,
    source_url: str,
) -> OAETradeSnapshot:
    """Parse only the reviewed OAE resource and preserve its source labels and null tokens."""
    _validate_source(dataset_id, resource_id, source_version, source_hash, source_url)
    if not isinstance(content, bytes) or not 0 < len(content) <= MAX_CSV_BYTES:
        raise ValueError("OAE CSV exceeds byte limit or is empty")
    _verify_source_hash(content, source_hash)
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("OAE CSV is not UTF-8") from exc

    try:
        reader = csv.DictReader(io.StringIO(text, newline=""))
        if tuple(reader.fieldnames or ()) != CSV_FIELDS:
            raise ValueError("OAE CSV header changed")
        records = []
        identities = set()
        for row in reader:
            if None in row or any(row.get(field) is None for field in CSV_FIELDS):
                raise ValueError("OAE CSV row width changed")
            year_label = row["year"].strip()
            trade_type = row["type"].strip()
            product = row["product"].strip()
            value_raw = row["value"].strip()
            unit = row["unit"].strip()
            if not year_label or not product:
                raise ValueError("OAE year label and product are required")
            if trade_type != TRADE_TYPE or unit != UNIT:
                raise ValueError("OAE trade type or unit changed")

            identity = (year_label, trade_type, product, unit)
            if identity in identities:
                raise ValueError("duplicate trade row")
            identities.add(identity)
            records.append(OAETradeRecord(
                year_label=year_label,
                trade_type=trade_type,
                product=product,
                value=_number(value_raw),
                value_raw=value_raw,
                unit=unit,
            ))
    except csv.Error as exc:
        raise ValueError("invalid OAE CSV") from exc

    return OAETradeSnapshot(
        source_id=SOURCE_ID,
        dataset_id=dataset_id,
        resource_id=resource_id,
        source_version=source_version,
        source_hash=source_hash,
        source_url=source_url,
        retrieved_at=None,
        content_sha256=hashlib.sha256(content).hexdigest(),
        records=tuple(records),
    )


def _read_bounded(response, *, expected_url: str, content_type: str, max_bytes: int) -> bytes:
    if response.getcode() != 200:
        raise ValueError("OAE source returned a non-200 response")
    final_url = response.geturl()
    if final_url != expected_url:
        if expected_url == SOURCE_METADATA_URL:
            raise ValueError("redirect outside exact OAE metadata endpoint")
        raise ValueError("redirect outside exact OAE resource")

    media_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    allowed_types = {content_type}
    if content_type == "text/csv":
        allowed_types.add("application/octet-stream")
    if media_type not in allowed_types:
        raise ValueError("OAE source returned an unreviewed content type")
    raw_length = response.headers.get("Content-Length")
    if raw_length is not None:
        if not re.fullmatch(r"[0-9]+", str(raw_length)):
            raise ValueError("OAE source has invalid content length")
        if not 0 < int(raw_length) <= max_bytes:
            raise ValueError("OAE response exceeds byte limit")

    content = response.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise ValueError("OAE response exceeds byte limit")
    if not content or (raw_length is not None and len(content) != int(raw_length)):
        raise ValueError("OAE source response size changed")
    return content


def _fetch_resource_metadata(open_request) -> tuple[str, str, int, str]:
    request = Request(SOURCE_METADATA_URL, headers={"Accept": "application/json", "User-Agent": _USER_AGENT})
    with open_request(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        metadata_bytes = _read_bounded(
            response, expected_url=SOURCE_METADATA_URL, content_type="application/json",
            max_bytes=MAX_METADATA_BYTES,
        )
    try:
        envelope = json.loads(metadata_bytes.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid OAE package metadata") from exc
    package = envelope.get("result") if isinstance(envelope, dict) and envelope.get("success") is True else None
    if not isinstance(package, dict) or package.get("id") != DATASET_ID:
        raise ValueError("unexpected OAE source identity")
    resources = package.get("resources")
    if not isinstance(resources, list):
        raise ValueError("OAE package resources changed")
    matches = [item for item in resources if isinstance(item, dict) and item.get("id") == RESOURCE_ID]
    if len(matches) != 1:
        raise ValueError("OAE resource identity missing or duplicated")
    resource = matches[0]
    if not isinstance(resource.get("format"), str) or resource["format"].strip().casefold() != "csv":
        raise ValueError("OAE resource format changed")
    source_version = resource.get("last_modified")
    source_hash = resource.get("hash")
    source_url = resource.get("url")
    size = resource.get("size")
    if isinstance(size, str) and re.fullmatch(r"[0-9]+", size):
        size = int(size)
    if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= MAX_CSV_BYTES:
        raise ValueError("OAE resource exceeds byte limit or has invalid size")
    _validate_source(DATASET_ID, RESOURCE_ID, source_version, source_hash, source_url)
    return source_version, source_url, size, source_hash


def fetch_oae_trade_snapshot(*, opener=None) -> OAETradeSnapshot:
    """Fetch one pinned CSV between bounded metadata reads and timestamp its verified retrieval."""
    open_request = _open_oae_request if opener is None else opener
    pinned_metadata = _fetch_resource_metadata(open_request)
    source_version, source_url, size, source_hash = pinned_metadata

    request = Request(source_url, headers={"Accept": "text/csv", "User-Agent": _USER_AGENT})
    with open_request(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        content = _read_bounded(
            response, expected_url=source_url, content_type="text/csv", max_bytes=MAX_CSV_BYTES,
        )
    if len(content) != size:
        raise ValueError("OAE CSV size differs from source metadata")
    current_metadata = _fetch_resource_metadata(open_request)
    if current_metadata != pinned_metadata:
        raise ValueError("OAE resource metadata changed during CSV fetch")

    snapshot = normalize_oae_trade_csv(
        content,
        dataset_id=DATASET_ID,
        resource_id=RESOURCE_ID,
        source_version=source_version,
        source_hash=source_hash,
        source_url=source_url,
    )
    return replace(snapshot, retrieved_at=datetime.now(timezone.utc))


def _verify_source_hash(content: bytes, source_hash: str) -> None:
    if not isinstance(source_hash, str) or not _SOURCE_MD5.fullmatch(source_hash):
        raise ValueError("OAE resource hash format is unsupported")
    # OAE/CKAN publishes this field as a 32-hex MD5. Use it only to check the
    # downloaded bytes against the pinned resource revision, never for security.
    actual_md5 = hashlib.md5(content, usedforsecurity=False).hexdigest()
    if actual_md5 != source_hash.lower():
        raise ValueError("OAE resource hash mismatch")
