"""Read and normalize the exact OAE/NABC monthly jasmine-paddy price resource.

The source reports an explicit Buddhist-Era year plus a calendar month for one
product averaged over ``ประเทศไทย`` (country). Unlike the OAE export CSV, whose
bare year column stays an opaque label, this endpoint is a genuine monthly time
series, so the month period is evidenced by the source's own fields. We convert
``year_th`` to the Gregorian calendar year with the repository's documented
convention (Gregorian = Buddhist - 543, the same relation the verified NABC
daily reader checks) and never invent a day beyond the first of that month.
"""
import hashlib
import json
import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import parse_qs, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


SOURCE_ID = "oae"
DATASET_ID = "93ac1a96-7933-4653-a21e-91b0c42a8216"
RESOURCE_ID = "4570daca-e727-4036-bde9-35fd84d0ffd4"
MAX_PAGES = 10
_PRODUCT_NAME_ENCODED = (
    "%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A7%E0%B9%80%E0%B8%9B"
    "%E0%B8%A5%E0%B8%B7%E0%B8%AD%E0%B8%81%E0%B9%80%E0%B8%88%E0%B9%89%E0%B8%B2"
    "%E0%B8%AB%E0%B8%AD%E0%B8%A1%E0%B8%A1%E0%B8%B0%E0%B8%A5%E0%B8%B4%20%E0%B8%84"
    "%E0%B8%A7%E0%B8%B2%E0%B8%A1%E0%B8%8A%E0%B8%B7%E0%B9%89%E0%B8%99%2015"
)
_SOURCE_PAGE_PREFIX = (
    "https://agriapi.nabc.go.th/api/monthly-prices/product?product_name="
    + _PRODUCT_NAME_ENCODED
    + "&page="
)


def source_url_for_page(page_no: int) -> str:
    if isinstance(page_no, bool) or not isinstance(page_no, int) or not 1 <= page_no <= MAX_PAGES:
        raise ValueError("OAE paddy price page is outside the reviewed range")
    return f"{_SOURCE_PAGE_PREFIX}{page_no}"


SOURCE_RESOURCE_URL = source_url_for_page(1)
PRODUCT_NAME = "ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15"
UNIT = "บาท/ตัน"
PROVINCE_CODE = "TH00"
PROVINCE_NAME = "ประเทศไทย"
MONTHLY_WEEK = 0
BUDDHIST_TO_GREGORIAN = 543
MIN_BUDDHIST_YEAR = 2400
MAX_BUDDHIST_YEAR = 2699
MISSING_VALUE_MARKERS = {"", "n.a.", "na", "..", "--", "-"}
_NUMERIC_VALUE = re.compile(r"-?[0-9]+(?:\.[0-9]+)?\Z")
_MONTH = re.compile(r"(0[1-9]|1[0-2])\Z")
# One bounded page (page=1) is ~34 KiB of real data; keep a wide headroom cap.
MAX_JSON_BYTES = 256 * 1024
REQUEST_TIMEOUT_SECONDS = 12
_USER_AGENT = "TADIH bounded OAE paddy price reader"
_ALLOWED_HOST = "agriapi.nabc.go.th"


@dataclass(frozen=True, slots=True)
class OAEPaddyPriceRecord:
    year_th: int
    month: str
    gregorian_month: str  # "YYYY-MM" derived only from the source's own fields
    product_name: str
    value: Decimal | None
    value_raw: str
    unit: str


@dataclass(frozen=True, slots=True)
class OAEPaddyPriceSnapshot:
    source_id: str
    dataset_id: str
    resource_id: str
    source_url: str
    retrieved_at: datetime | None
    content_sha256: str
    records: tuple[OAEPaddyPriceRecord, ...]
    source_total: int | None  # upstream pagination.total, reported but not followed
    pages_fetched: int = 1
    page_urls: tuple[str, ...] = ()


def _validate_source_url(source_url: str) -> None:
    if not isinstance(source_url, str):
        raise ValueError("unreviewed OAE paddy price resource URL")
    parsed = urlparse(source_url)
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("unreviewed OAE paddy price resource URL") from exc
    if (parsed.scheme != "https" or parsed.netloc != _ALLOWED_HOST
            or parsed.hostname != _ALLOWED_HOST or port is not None
            or parsed.username is not None or parsed.password is not None
            or parsed.path != "/api/monthly-prices/product"
            or parsed.params or parsed.fragment):
        raise ValueError("unreviewed OAE paddy price resource URL")
    try:
        query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise ValueError("unreviewed OAE paddy price resource URL") from exc
    if (set(query) != {"product_name", "page"}
            or query["product_name"] != [PRODUCT_NAME]
            or len(query["page"]) != 1
            or not re.fullmatch(r"[1-9][0-9]?", query["page"][0])
            or not 1 <= int(query["page"][0]) <= MAX_PAGES):
        raise ValueError("unreviewed OAE paddy price resource URL")


class _RejectNabcRedirects(HTTPRedirectHandler):
    """Never let urllib follow the pinned NABC endpoint to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        try:
            _validate_source_url(req.full_url)
        except ValueError as exc:
            raise ValueError("redirect request from an unreviewed NABC URL") from exc
        # This fixed endpoint has no reviewed redirect contract; refuse before following.
        raise ValueError("NABC redirect rejected before following")


def _open_oae_request(request, *, timeout):
    return build_opener(_RejectNabcRedirects()).open(request, timeout=timeout)


def _number(value_raw: str) -> Decimal | None:
    if value_raw.strip().casefold() in MISSING_VALUE_MARKERS:
        return None
    text = value_raw.strip()
    if not _NUMERIC_VALUE.fullmatch(text):
        raise ValueError("invalid numeric monthly price value")
    try:
        value = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError("invalid numeric monthly price value") from exc
    if not value.is_finite():
        raise ValueError("invalid numeric monthly price value")
    return value


def _gregorian_month(year_th: int, month: str) -> str:
    ce_year = year_th - BUDDHIST_TO_GREGORIAN
    if not 1900 <= ce_year <= 2200:
        raise ValueError("Buddhist-Era year is out of a plausible calendar range")
    return f"{ce_year:04d}-{month}"


def normalize_oae_paddy_price_json(
    content: bytes,
    *,
    source_url: str = SOURCE_RESOURCE_URL,
) -> OAEPaddyPriceSnapshot:
    """Parse only the reviewed NABC monthly page, preserving source grain and null tokens."""
    _validate_source_url(source_url)
    if not isinstance(content, bytes) or not 0 < len(content) <= MAX_JSON_BYTES:
        raise ValueError("OAE paddy price JSON exceeds byte limit or is empty")
    try:
        payload = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid OAE paddy price JSON") from exc
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise ValueError("OAE paddy price payload is not a successful envelope")
    raw_rows = payload.get("data")
    if not isinstance(raw_rows, list):
        raise ValueError("OAE paddy price payload has no data list")

    pagination = payload.get("pagination")
    source_total = None
    if isinstance(pagination, dict) and isinstance(pagination.get("total"), int):
        source_total = pagination["total"]

    records: list[OAEPaddyPriceRecord] = []
    seen_months: set[tuple[int, str]] = set()
    for raw in raw_rows:
        if not isinstance(raw, dict):
            raise ValueError("OAE paddy price row is not an object")
        product_name = raw.get("product_name")
        if not isinstance(product_name, str) or product_name != PRODUCT_NAME:
            raise ValueError("unexpected product in the OAE paddy price resource")
        unit = raw.get("unit")
        if not isinstance(unit, str) or unit != UNIT:
            raise ValueError("unexpected unit in the OAE paddy price resource")
        if raw.get("week") != MONTHLY_WEEK:
            raise ValueError("OAE paddy price row is not a monthly (week=0) aggregate")
        if raw.get("province_code") != PROVINCE_CODE or raw.get("province_name") != PROVINCE_NAME:
            raise ValueError("OAE paddy price row is not the country-average scope")
        year_th = raw.get("year_th")
        if isinstance(year_th, bool) or not isinstance(year_th, int) or not (
                MIN_BUDDHIST_YEAR <= year_th <= MAX_BUDDHIST_YEAR):
            raise ValueError("OAE paddy price Buddhist-Era year is out of range")
        month = raw.get("month")
        if not isinstance(month, str) or not _MONTH.fullmatch(month):
            raise ValueError("OAE paddy price month is not a two-digit calendar month")
        identity = (year_th, month)
        if identity in seen_months:
            raise ValueError("duplicate OAE paddy price month")
        seen_months.add(identity)
        value_raw = raw.get("value")
        value_raw = "" if value_raw is None else str(value_raw)
        records.append(OAEPaddyPriceRecord(
            year_th=year_th,
            month=month,
            gregorian_month=_gregorian_month(year_th, month),
            product_name=product_name,
            value=_number(value_raw),
            value_raw=value_raw,
            unit=unit,
        ))

    return OAEPaddyPriceSnapshot(
        source_id=SOURCE_ID,
        dataset_id=DATASET_ID,
        resource_id=RESOURCE_ID,
        source_url=source_url,
        retrieved_at=None,
        content_sha256=hashlib.sha256(content).hexdigest(),
        records=tuple(records),
        source_total=source_total,
    )


def _read_bounded(response, *, max_bytes: int, expected_url: str) -> bytes:
    if response.getcode() != 200:
        raise ValueError("OAE paddy price source returned a non-200 response")
    if response.geturl() != expected_url:
        raise ValueError("redirect outside exact OAE paddy price resource")
    media_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
    if media_type not in {"application/json", "text/json", "application/octet-stream"}:
        raise ValueError("OAE paddy price source returned an unreviewed content type")
    raw_length = response.headers.get("Content-Length")
    if raw_length is not None:
        if not re.fullmatch(r"[0-9]+", str(raw_length)):
            raise ValueError("OAE paddy price source has invalid content length")
        if not 0 < int(raw_length) <= max_bytes:
            raise ValueError("OAE paddy price response exceeds byte limit")
    content = response.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise ValueError("OAE paddy price response exceeds byte limit")
    if not content or (raw_length is not None and len(content) != int(raw_length)):
        raise ValueError("OAE paddy price source response size changed")
    return content


def _decode_page(content: bytes) -> dict:
    try:
        payload = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid OAE paddy price JSON") from exc
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise ValueError("OAE paddy price payload is not a successful envelope")
    if not isinstance(payload.get("data"), list):
        raise ValueError("OAE paddy price payload has no data list")
    return payload


def fetch_oae_paddy_price_snapshot(*, opener=None) -> OAEPaddyPriceSnapshot:
    """Fetch every bounded page of the pinned monthly resource and timestamp the retrieval."""
    open_request = _open_oae_request if opener is None else opener
    pages: list[tuple[str, bytes, list]] = []
    total: int | None = None
    digest = hashlib.sha256()
    page_no = 1
    while True:
        url = source_url_for_page(page_no)
        request = Request(url, headers={"Accept": "application/json", "User-Agent": _USER_AGENT})
        with open_request(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            content = _read_bounded(response, max_bytes=MAX_JSON_BYTES, expected_url=url)
        payload = _decode_page(content)
        pagination = payload.get("pagination")
        page_total = pagination.get("total") if isinstance(pagination, dict) else None
        if page_total is not None:
            if isinstance(page_total, bool) or not isinstance(page_total, int) or page_total < 0:
                raise ValueError("OAE paddy price pagination total is invalid")
            if total is None:
                total = page_total
            elif page_total != total:
                raise ValueError("OAE paddy price pagination total changed between pages")
        pages.append((url, content, payload["data"]))
        digest.update(content)
        collected = sum(len(rows) for _url, _content, rows in pages)
        if total is None or collected >= total:
            break
        if page_no >= MAX_PAGES:
            raise ValueError("OAE paddy price page count exceeds the reviewed bound")
        page_no += 1

    combined: dict = {"success": True, "data": [row for _u, _c, rows in pages for row in rows]}
    if total is not None:
        combined["pagination"] = {"total": total}
    combined_content = json.dumps(combined, ensure_ascii=False).encode("utf-8")
    snapshot = normalize_oae_paddy_price_json(combined_content, source_url=SOURCE_RESOURCE_URL)
    # Parser-only snapshots have no retrieval event; live fetch stamps it after the read.
    return replace(
        snapshot,
        retrieved_at=datetime.now(timezone.utc),
        content_sha256=digest.hexdigest(),
        pages_fetched=len(pages),
        page_urls=tuple(url for url, _content, _rows in pages),
    )
