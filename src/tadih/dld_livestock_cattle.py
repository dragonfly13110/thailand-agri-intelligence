"""Normalize DLD's source-year beef cattle counts without inventing dates."""

from datetime import datetime, timezone
import hashlib
import json
import re

from .catalog import load_provinces
from .ingestion import fetch_json


RESOURCE_ID = "d3667ca5-5982-4c9e-9b0d-04e729dbe31b"
DATASTORE_ENDPOINT = "https://dld.gdcatalog.go.th/api/3/action/datastore_search"
RESOURCE_METADATA_URL = "https://dld.gdcatalog.go.th/api/3/action/resource_show?id=" + RESOURCE_ID
PAGE_SIZE = 500
MAX_PAGES = 10
# shortcut: stop at this bounded response size; raise MAX_PAGES when the source grows further.
MAX_ROWS = PAGE_SIZE * MAX_PAGES
RESOURCE_URL = (
    DATASTORE_ENDPOINT + "?resource_id=" + RESOURCE_ID
    + "&limit=500&sort=_id%20asc"
)
_REQUIRED_FIELDS = {
    "_id", "year", "particular", "region", "livestock_area", "province", "value", "unit", "source",
}
_COUNT_VALUE = re.compile(r"(?:\d+|\d{1,3}(?:,\d{3})+)")


class DldCattleDataError(ValueError):
    """The fixed DLD resource changed or cannot be normalized safely."""


def normalize_dld_beef_cattle(payload, *, retrieved_at, source_revision=None, page_count=1):
    """Return source-year labels and native province rows from a complete response."""
    retrieved_at = _utc_timestamp(retrieved_at)
    result = payload.get("result") if isinstance(payload, dict) else None
    if (not isinstance(payload, dict) or payload.get("success") is not True
            or not isinstance(result, dict)):
        raise DldCattleDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
    records = result.get("records")
    total = result.get("total")
    if (result.get("resource_id") != RESOURCE_ID or type(total) is not int or total < 1 or total > MAX_ROWS
            or result.get("total_was_estimated") is not False
            or not isinstance(records, list) or len(records) != total):
        raise DldCattleDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")

    province_rows = load_provinces()
    province_by_name = {}
    for province in province_rows:
        name = province["name_th"]
        if name in province_by_name:
            raise DldCattleDataError("PROVINCE_REFERENCE_AMBIGUOUS")
        province_by_name[name] = province["area_code"]

    normalized = []
    seen_row_ids = set()
    seen_keys = set()
    for record in records:
        if not isinstance(record, dict) or not _REQUIRED_FIELDS.issubset(record):
            raise DldCattleDataError("DLD_SCHEMA_CHANGED")
        raw_id = record["_id"]
        if (isinstance(raw_id, bool) or not isinstance(raw_id, (int, str))
                or not str(raw_id).isdecimal()):
            raise DldCattleDataError("DLD_ROW_ID_INVALID")
        source_row_id = str(raw_id)
        year = record["year"]
        if isinstance(year, str) and year.isdecimal():
            year = int(year)
        if isinstance(year, bool) or not isinstance(year, int) or not 2400 <= year <= 9999:
            raise DldCattleDataError("DLD_SOURCE_YEAR_INVALID")
        particular = record["particular"]
        if not isinstance(particular, str) or particular.strip() != "จำนวนโคเนื้อ":
            raise DldCattleDataError("DLD_CATEGORY_CHANGED")
        unit = record["unit"]
        if unit != "ตัว":
            raise DldCattleDataError("DLD_UNIT_CHANGED")
        source_province = record["province"]
        if not isinstance(source_province, str) or not source_province.strip():
            raise DldCattleDataError("DLD_PROVINCE_MISSING")
        province_name = source_province.strip()
        area_code = province_by_name.get(province_name)
        if area_code is None:
            raise DldCattleDataError("DLD_PROVINCE_UNMAPPED")
        value = _count_value(record["value"])
        key = (year, area_code)
        if source_row_id in seen_row_ids or key in seen_keys:
            raise DldCattleDataError("DLD_DUPLICATE_ROW")
        seen_row_ids.add(source_row_id)
        seen_keys.add(key)
        normalized.append({
            "source_id": "dld",
            "resource_id": RESOURCE_ID,
            "source_row_id": source_row_id,
            "source_year_be": year,
            "reference_year_convention": "unverified",
            "area_code": area_code,
            "province_name": province_name,
            "region_source": _optional_label(record["region"]),
            "livestock_area_source": _optional_label(record["livestock_area"]),
            "measure": "beef_cattle_count",
            "value": value,
            "unit": unit,
            "quality_flag": "missing" if value is None else "good",
            "source_label": _optional_label(record["source"]),
            "source_url": RESOURCE_URL,
        })

    normalized.sort(key=lambda row: (row["source_year_be"], row["area_code"]))
    revision_id = _revision_id(records, source_revision)
    for row in normalized:
        row["revision_id"] = revision_id
        row["retrieved_at"] = retrieved_at

    reference_codes = {province["area_code"] for province in province_rows}
    by_year = {}
    row_count_by_year = {}
    for row in normalized:
        year = row["source_year_be"]
        bucket = by_year.setdefault(year, set())
        bucket.add(row["area_code"])
        row_count_by_year[year] = row_count_by_year.get(year, 0) + 1
    province_listing_by_year = [
        {
            "sourceYearBe": year,
            "rowCount": row_count_by_year[year],
            "listedProvinceCount": len(codes),
            "referenceProvinceCount": len(reference_codes),
            "unlistedReferenceProvinceCount": len(reference_codes - codes),
        }
        for year, codes in sorted(by_year.items())
    ]
    return {
        "source_id": "dld",
        "resource_id": RESOURCE_ID,
        "resource_url": RESOURCE_URL,
        "source_grain": "province × Buddhist source-year label; year convention unverified",
        "retrieved_at": retrieved_at,
        "release_at": None,
        "source_revision": source_revision,
        "revision_id": revision_id,
        "source_reported_rows": total,
        "records_fetched": len(records),
        "source_response_complete": True,
        "page_count": page_count,
        "province_listing_by_year": province_listing_by_year,
        "rows": normalized,
    }


def fetch_dld_beef_cattle(*, fetcher=fetch_json, retrieved_at=None):
    """Fetch a bounded, revision-pinned CKAN snapshot and normalize its rows."""
    before = _resource_revision(fetcher)
    records = []
    requested_page_urls = []
    expected_total = None
    offset = 0
    page_count = 0
    while True:
        page_url = _page_url(offset)
        requested_page_urls.append(page_url)
        response = fetcher(page_url)
        result = response.get("result") if isinstance(response, dict) else None
        if not isinstance(result, dict) or response.get("success") is not True:
            raise DldCattleDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
        total = result.get("total")
        page_records = result.get("records")
        if (result.get("resource_id") != RESOURCE_ID or type(total) is not int
                or total < 1 or result.get("total_was_estimated") is not False):
            raise DldCattleDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
        if total > MAX_ROWS:
            raise DldCattleDataError("DLD_RESPONSE_EXCEEDS_PAGING_BOUND")
        if expected_total is None:
            expected_total = total
        elif total != expected_total:
            raise DldCattleDataError("DLD_TOTAL_CHANGED_DURING_PAGING")
        if (type(result.get("offset")) is not int or result["offset"] != offset
                or type(result.get("limit")) is not int or result["limit"] != PAGE_SIZE):
            raise DldCattleDataError("DLD_PAGE_OFFSET_OR_LIMIT_MISMATCH")
        expected_page_rows = min(PAGE_SIZE, total - offset)
        if not isinstance(page_records, list) or len(page_records) != expected_page_rows:
            raise DldCattleDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
        records.extend(page_records)
        page_count += 1
        offset += len(page_records)
        if offset == expected_total:
            break
        if offset > expected_total or page_count >= MAX_PAGES:
            raise DldCattleDataError("DLD_RESPONSE_EXCEEDS_PAGING_BOUND")

    after = _resource_revision(fetcher)
    if before != after:
        raise DldCattleDataError("DLD_RESOURCE_CHANGED_DURING_PAGING")
    at = datetime.now(timezone.utc).isoformat() if retrieved_at is None else retrieved_at
    combined = {"success": True, "result": {
        "resource_id": RESOURCE_ID,
        "total": expected_total,
        "total_was_estimated": False,
        "records": records,
    }}
    normalized = normalize_dld_beef_cattle(
        combined, retrieved_at=at, source_revision=before, page_count=page_count,
    )
    normalized["request_urls"] = [RESOURCE_METADATA_URL, *requested_page_urls, RESOURCE_METADATA_URL]
    return normalized


def _count_value(raw):
    if raw is None:
        return None
    if isinstance(raw, bool):
        raise DldCattleDataError("DLD_COUNT_INVALID")
    if isinstance(raw, int):
        value = raw
    elif isinstance(raw, str):
        text = raw.strip()
        if text in ("", "-", "--"):
            return None
        if not _COUNT_VALUE.fullmatch(text):
            raise DldCattleDataError("DLD_COUNT_INVALID")
        value = int(text.replace(",", ""))
    else:
        raise DldCattleDataError("DLD_COUNT_INVALID")
    if value < 0:
        raise DldCattleDataError("DLD_COUNT_INVALID")
    return value


def _optional_label(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise DldCattleDataError("DLD_LABEL_INVALID")
    return value.strip() or None


def _utc_timestamp(value):
    if not isinstance(value, str):
        raise DldCattleDataError("RETRIEVAL_TIME_INVALID")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DldCattleDataError("RETRIEVAL_TIME_INVALID") from exc
    if parsed.tzinfo is None:
        raise DldCattleDataError("RETRIEVAL_TIME_INVALID")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _page_url(offset):
    return (DATASTORE_ENDPOINT + "?resource_id=" + RESOURCE_ID + f"&limit={PAGE_SIZE}"
            + f"&offset={offset}&sort=_id%20asc")


def _resource_revision(fetcher):
    payload = fetcher(RESOURCE_METADATA_URL)
    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, dict) or payload.get("success") is not True or result.get("id") != RESOURCE_ID:
        raise DldCattleDataError("DLD_RESOURCE_REVISION_UNAVAILABLE")
    revision = {"hash": result.get("hash"), "last_modified": result.get("last_modified")}
    if any(not isinstance(value, str) or not value for value in revision.values()):
        raise DldCattleDataError("DLD_RESOURCE_REVISION_UNAVAILABLE")
    return revision


def _revision_id(records, source_revision=None):
    ordered = sorted(records, key=lambda row: int(row["_id"]))
    payload = json.dumps(
        {"records": ordered, "source_revision": source_revision},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
