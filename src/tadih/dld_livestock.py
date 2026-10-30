"""Normalize the approved DLD province-count and national-value resources.

This module keeps every source fact (Buddhist source-year label, DLD region
text, native unit) and refuses to invent values, years or province mappings.
Beef cattle keeps its own module; this file covers the other four province
resources plus the national livestock production value resource.
"""

from datetime import datetime, timezone
import csv
import hashlib
import io
import json
import re
import ssl
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .catalog import load_provinces
from .dld_livestock_cattle import (
    DldCattleDataError,
    _count_value,
    _optional_label,
    _revision_id,
    _utc_timestamp,
)
from .ingestion import fetch_json, trusted_ssl_context


DLD_BASE = "https://dld.gdcatalog.go.th"
DLD_DATASTORE_ENDPOINT = DLD_BASE + "/api/3/action/datastore_search"
PAGE_SIZE = 500
MAX_PAGES = 10
MAX_ROWS = PAGE_SIZE * MAX_PAGES
MAX_CSV_BYTES = 4 * 1024 * 1024
CSV_FIELDS = ("year", "particular", "region", "livestock_area", "province", "value", "unit", "source")
_DECIMAL_COUNT = re.compile(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?")

#: The five approved province-count resources; measure ids match the web readers.
PROVINCE_RESOURCES = {
    "dld_livestock_cattle_province": {
        "resource_id": "d3667ca5-5982-4c9e-9b0d-04e729dbe31b",
        "dataset_id": "1bef9bc7-2f81-45c2-a21e-baba3743b456",
        "particular": "จำนวนโคเนื้อ",
        "measure": "beef_cattle_count",
        "delivery": "datastore",
    },
    "dld_livestock_dairy_province": {
        "resource_id": "34dc17e6-7619-4194-89e7-99f4ece84b89",
        "dataset_id": "eed9283e-51b2-4384-a9b6-245b0c8c7262",
        "particular": "จำนวนโคนม",
        "measure": "dairy_cattle_count",
        "delivery": "datastore",
    },
    "dld_livestock_swine_province": {
        "resource_id": "47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a",
        "dataset_id": "161c766e-3ab4-475f-9976-60cfa1b7ada4",
        "particular": "จำนวนสุกร",
        "measure": "swine_count",
        "delivery": "csv",
    },
    "dld_livestock_poultry_province": {
        "resource_id": "64366e81-13d2-485a-82a1-3ddc2d89869b",
        "dataset_id": "ae4d2bdf-5cff-482f-86f4-aea93a51c018",
        "particular": "จำนวนไก่",
        "measure": "poultry_count",
        "delivery": "csv",
    },
    "dld_livestock_duck_province": {
        "resource_id": "c97081bc-e59d-47e1-aac9-0905b8983e08",
        "dataset_id": "58d2c7a6-14eb-4703-a113-403c0fc86f4b",
        "particular": "จำนวนเป็ด",
        "measure": "duck_count",
        "delivery": "csv",
    },
}

NATIONAL_VALUE_RESOURCE_ID = "a512df83-39d0-420b-979e-942666863b00"
NATIONAL_VALUE_KEY = "dld_national_livestock_value"
NATIONAL_VALUE_RESOURCE_URL = (
    DLD_DATASTORE_ENDPOINT + "?resource_id=" + NATIONAL_VALUE_RESOURCE_ID
    + "&limit=500&sort=_id%20asc"
)
NATIONAL_VALUE_MEASURE = "livestock_production_value_million_baht"
NATIONAL_VALUE_UNIT = "ล้านบาท"


class DldLivestockDataError(DldCattleDataError):
    """The approved DLD livestock resource changed or cannot be normalized safely."""


def province_resource(resource_key):
    spec = PROVINCE_RESOURCES.get(resource_key)
    if spec is None:
        raise DldLivestockDataError("DLD_RESOURCE_KEY_UNSUPPORTED")
    return dict(spec, resource_key=resource_key)


def csv_download_url(resource_key):
    spec = province_resource(resource_key)
    return (
        f"{DLD_BASE}/dataset/{spec['dataset_id']}/resource/{spec['resource_id']}"
        f"/download/dld_01_{_csv_suffix(resource_key)}.csv"
    )


def _csv_suffix(resource_key):
    return {
        "dld_livestock_swine_province": "0501",
        "dld_livestock_poultry_province": "0601",
        "dld_livestock_duck_province": "0701",
    }[resource_key]


def normalize_dld_livestock_records(records, *, resource_key, retrieved_at, total=None,
                                    source_revision=None, page_count=1, source_url):
    """Validate one complete province snapshot; return source-grain rows."""
    spec = province_resource(resource_key)
    retrieved_at = _utc_timestamp(retrieved_at)
    if total is None:
        total = len(records)
    if type(total) is not int or total < 1 or total > MAX_ROWS or len(records) != total:
        raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")

    province_by_name = {}
    for province in load_provinces():
        name = province["name_th"]
        if name in province_by_name:
            raise DldLivestockDataError("PROVINCE_REFERENCE_AMBIGUOUS")
        province_by_name[name] = province["area_code"]

    normalized = []
    seen_keys = set()
    for record in records:
        row = _normalize_province_row(record, spec, province_by_name)
        key = (row["source_year_be"], row["area_code"])
        if key in seen_keys:
            raise DldLivestockDataError("DLD_DUPLICATE_ROW")
        seen_keys.add(key)
        normalized.append(row)

    normalized.sort(key=lambda row: (row["source_year_be"], row["area_code"]))
    revision_id = _records_revision(records, source_revision)
    for row in normalized:
        row["revision_id"] = revision_id
        row["retrieved_at"] = retrieved_at

    reference_codes = {province["area_code"] for province in load_provinces()}
    by_year = {}
    row_count_by_year = {}
    for row in normalized:
        by_year.setdefault(row["source_year_be"], set()).add(row["area_code"])
        row_count_by_year[row["source_year_be"]] = row_count_by_year.get(row["source_year_be"], 0) + 1
    return {
        "source_id": "dld",
        "resource_key": resource_key,
        "resource_id": spec["resource_id"],
        "dataset_id": spec["dataset_id"],
        "resource_url": source_url,
        "source_grain": "province × Buddhist source-year label; reference-year convention unverified",
        "retrieved_at": retrieved_at,
        "release_at": None,
        "source_revision": source_revision,
        "revision_id": revision_id,
        "source_reported_rows": total,
        "records_fetched": len(records),
        "source_response_complete": True,
        "page_count": page_count,
        "measure": spec["measure"],
        "unit": "ตัว",
        "province_listing_by_year": [
            {
                "sourceYearBe": year,
                "rowCount": row_count_by_year[year],
                "listedProvinceCount": len(codes),
                "referenceProvinceCount": len(reference_codes),
                "unlistedReferenceProvinceCount": len(reference_codes - codes),
            }
            for year, codes in sorted(by_year.items())
        ],
        "rows": normalized,
    }


def _normalize_province_row(record, spec, province_by_name):
    if not isinstance(record, dict) or set(CSV_FIELDS) - set(record):
        raise DldLivestockDataError("DLD_SCHEMA_CHANGED")
    year = record["year"]
    if isinstance(year, str) and year.isdecimal():
        year = int(year)
    if isinstance(year, bool) or not isinstance(year, int) or not 2400 <= year <= 9999:
        raise DldLivestockDataError("DLD_SOURCE_YEAR_INVALID")
    particular = record["particular"]
    if not isinstance(particular, str) or particular.strip() != spec["particular"]:
        raise DldLivestockDataError("DLD_CATEGORY_CHANGED")
    if record["unit"] != "ตัว":
        raise DldLivestockDataError("DLD_UNIT_CHANGED")
    source_province = record["province"]
    if not isinstance(source_province, str) or not source_province.strip():
        raise DldLivestockDataError("DLD_PROVINCE_MISSING")
    province_name = source_province.strip()
    area_code = province_by_name.get(province_name)
    if area_code is None:
        raise DldLivestockDataError("DLD_PROVINCE_UNMAPPED")
    raw_id = record.get("_id")
    source_row_id = None
    if raw_id is not None:
        if isinstance(raw_id, bool) or not isinstance(raw_id, (int, str)) or not str(raw_id).isdecimal():
            raise DldLivestockDataError("DLD_ROW_ID_INVALID")
        source_row_id = str(raw_id)
    value = _count_value(record["value"])
    return {
        "source_id": "dld",
        "resource_id": spec["resource_id"],
        "source_row_id": source_row_id,
        "source_year_be": year,
        "reference_year_convention": "unverified",
        "area_code": area_code,
        "province_name": province_name,
        "region_source": _optional_label(record["region"]),
        "livestock_area_source": _optional_label(record["livestock_area"]),
        "measure": spec["measure"],
        "value": value,
        "unit": "ตัว",
        "quality_flag": "missing" if value is None else "good",
        "source_label": _optional_label(record["source"]),
    }


def _records_revision(records, source_revision):
    """Stable snapshot hash; CSV rows without _id sort by content instead."""
    def order_key(record):
        raw = record.get("_id") if isinstance(record, dict) else None
        if raw is not None and str(raw).isdecimal():
            return (0, int(raw), "")
        return (1, 0, json.dumps(record, sort_keys=True, ensure_ascii=False))

    ordered = sorted(records, key=order_key)
    payload = json.dumps(
        {"records": ordered, "source_revision": source_revision},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def fetch_dld_livestock_datastore(resource_key, *, fetcher=fetch_json, retrieved_at=None, sleep=time.sleep):
    """Bounded, revision-pinned CKAN datastore snapshot for a province resource."""
    spec = province_resource(resource_key)
    resource_id = spec["resource_id"]
    before = _resource_revision(fetcher, resource_id)
    records = []
    requested_page_urls = []
    expected_total = None
    offset = 0
    page_count = 0
    while True:
        page_url = _page_url(resource_id, offset)
        requested_page_urls.append(page_url)
        response = fetcher(page_url)
        result = response.get("result") if isinstance(response, dict) else None
        if not isinstance(result, dict) or response.get("success") is not True:
            raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
        total = result.get("total")
        page_records = result.get("records")
        if (result.get("resource_id") != resource_id or type(total) is not int
                or total < 1 or result.get("total_was_estimated") is not False):
            raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
        if total > MAX_ROWS:
            raise DldLivestockDataError("DLD_RESPONSE_EXCEEDS_PAGING_BOUND")
        if expected_total is None:
            expected_total = total
        elif total != expected_total:
            raise DldLivestockDataError("DLD_TOTAL_CHANGED_DURING_PAGING")
        if (type(result.get("offset")) is not int or result["offset"] != offset
                or type(result.get("limit")) is not int or result["limit"] != PAGE_SIZE):
            raise DldLivestockDataError("DLD_PAGE_OFFSET_OR_LIMIT_MISMATCH")
        expected_page_rows = min(PAGE_SIZE, total - offset)
        if not isinstance(page_records, list) or len(page_records) != expected_page_rows:
            raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
        records.extend(page_records)
        page_count += 1
        offset += len(page_records)
        if offset == expected_total:
            break
        if offset > expected_total or page_count >= MAX_PAGES:
            raise DldLivestockDataError("DLD_RESPONSE_EXCEEDS_PAGING_BOUND")

    after = _resource_revision(fetcher, resource_id)
    if before != after:
        raise DldLivestockDataError("DLD_RESOURCE_CHANGED_DURING_PAGING")
    at = datetime.now(timezone.utc).isoformat() if retrieved_at is None else retrieved_at
    source_url = _page_url(resource_id, 0)
    normalized = normalize_dld_livestock_records(
        records, resource_key=resource_key, retrieved_at=at, total=expected_total,
        source_revision=before, page_count=page_count, source_url=source_url,
    )
    normalized["delivery"] = "datastore"
    metadata_url = DLD_BASE + "/api/3/action/resource_show?id=" + resource_id
    normalized["request_urls"] = [metadata_url, *requested_page_urls, metadata_url]
    return normalized


def fetch_dld_livestock_csv(resource_key, *, reader=None, retrieved_at=None):
    """Bounded CSV download for resources that DLD does not load into datastore."""
    url = csv_download_url(resource_key)
    read_csv = reader or _read_csv_bytes
    first, first_hash = read_csv(url)
    second, second_hash = read_csv(url)
    if first_hash != second_hash:
        raise DldLivestockDataError("DLD_RESOURCE_CHANGED_DURING_PAGING")
    records = _parse_csv_records(first, url)
    at = datetime.now(timezone.utc).isoformat() if retrieved_at is None else retrieved_at
    revision = {"hash": first_hash, "last_modified": None}
    normalized = normalize_dld_livestock_records(
        records, resource_key=resource_key, retrieved_at=at,
        source_revision=revision, page_count=1, source_url=url,
    )
    normalized["delivery"] = "csv"
    normalized["request_urls"] = [url, url]
    return normalized


def _read_csv_bytes(url):
    request = Request(url, headers={"User-Agent": "TADIH/0.1 bounded-probe", "Accept": "text/csv"})
    try:
        with urlopen(request, timeout=30, context=trusted_ssl_context()) as response:
            content = response.read(MAX_CSV_BYTES + 1)
    except (HTTPError, URLError, TimeoutError, ssl.SSLError) as exc:
        raise DldLivestockDataError("DLD_CSV_UNAVAILABLE") from exc
    if len(content) > MAX_CSV_BYTES:
        raise DldLivestockDataError("DLD_CSV_TOO_LARGE")
    return content, hashlib.sha256(content).hexdigest()


def _parse_csv_records(content, url):
    text_content = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text_content, newline=""))
    if reader.fieldnames is None or set(CSV_FIELDS) - set(reader.fieldnames):
        raise DldLivestockDataError("DLD_SCHEMA_CHANGED")
    records = []
    for record in reader:
        if record.get("year") is None:
            continue  # blank trailing lines are not rows
        records.append({field: record[field] for field in CSV_FIELDS})
    if not records:
        raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
    if len(records) > MAX_ROWS:
        raise DldLivestockDataError("DLD_RESPONSE_EXCEEDS_PAGING_BOUND")
    return records


def _page_url(resource_id, offset):
    return (DLD_DATASTORE_ENDPOINT + "?resource_id=" + resource_id + f"&limit={PAGE_SIZE}"
            + f"&offset={offset}&sort=_id%20asc")


def _resource_revision(fetcher, resource_id):
    payload = fetcher(DLD_BASE + "/api/3/action/resource_show?id=" + resource_id)
    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, dict) or payload.get("success") is not True or result.get("id") != resource_id:
        raise DldLivestockDataError("DLD_RESOURCE_REVISION_UNAVAILABLE")
    revision = {"hash": result.get("hash"), "last_modified": result.get("last_modified")}
    if any(not isinstance(value, str) or not value for value in revision.values()):
        raise DldLivestockDataError("DLD_RESOURCE_REVISION_UNAVAILABLE")
    return revision


def normalize_dld_national_livestock_value(payload, *, retrieved_at, source_revision=None, page_count=1):
    """Keep each national value category × source year as its own source-grain row."""
    retrieved_at = _utc_timestamp(retrieved_at)
    result = payload.get("result") if isinstance(payload, dict) else None
    if (not isinstance(payload, dict) or payload.get("success") is not True
            or not isinstance(result, dict)):
        raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
    records = result.get("records")
    total = result.get("total")
    if (result.get("resource_id") != NATIONAL_VALUE_RESOURCE_ID or type(total) is not int
            or total < 1 or total > MAX_ROWS or result.get("total_was_estimated") is not False
            or not isinstance(records, list) or len(records) != total):
        raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")

    normalized = []
    seen_ids = set()
    seen_keys = set()
    for record in records:
        if not isinstance(record, dict) or not {"_id", "year", "particular", "value", "unit", "source"} <= set(record):
            raise DldLivestockDataError("DLD_SCHEMA_CHANGED")
        raw_id = record["_id"]
        if isinstance(raw_id, bool) or not isinstance(raw_id, (int, str)) or not str(raw_id).isdecimal():
            raise DldLivestockDataError("DLD_ROW_ID_INVALID")
        source_row_id = str(raw_id)
        year = record["year"]
        if isinstance(year, str) and year.isdecimal():
            year = int(year)
        if isinstance(year, bool) or not isinstance(year, int) or not 2400 <= year <= 9999:
            raise DldLivestockDataError("DLD_SOURCE_YEAR_INVALID")
        category = _optional_label(record["particular"])
        if category is None or not category.startswith("มูลค่า"):
            raise DldLivestockDataError("DLD_CATEGORY_CHANGED")
        if record["unit"] != NATIONAL_VALUE_UNIT:
            raise DldLivestockDataError("DLD_UNIT_CHANGED")
        value = _decimal_value(record["value"])
        key = (year, category)
        if source_row_id in seen_ids or key in seen_keys:
            raise DldLivestockDataError("DLD_DUPLICATE_ROW")
        seen_ids.add(source_row_id)
        seen_keys.add(key)
        normalized.append({
            "source_id": "dld",
            "resource_id": NATIONAL_VALUE_RESOURCE_ID,
            "source_row_id": source_row_id,
            "source_year_be": year,
            "reference_year_convention": "unverified",
            "category": category,
            "measure": NATIONAL_VALUE_MEASURE,
            "value": value,
            "unit": NATIONAL_VALUE_UNIT,
            "quality_flag": "missing" if value is None else "good",
            "source_label": _optional_label(record["source"]),
        })

    normalized.sort(key=lambda row: (row["source_year_be"], row["category"]))
    revision_id = _revision_id(records, source_revision)
    for row in normalized:
        row["revision_id"] = revision_id
        row["retrieved_at"] = retrieved_at
    return {
        "source_id": "dld",
        "resource_key": NATIONAL_VALUE_KEY,
        "resource_id": NATIONAL_VALUE_RESOURCE_ID,
        "resource_url": NATIONAL_VALUE_RESOURCE_URL,
        "source_grain": "country × Buddhist source-year label × livestock category; convention unverified",
        "retrieved_at": retrieved_at,
        "release_at": None,
        "source_revision": source_revision,
        "revision_id": revision_id,
        "source_reported_rows": total,
        "records_fetched": len(records),
        "source_response_complete": True,
        "page_count": page_count,
        "measure": NATIONAL_VALUE_MEASURE,
        "unit": NATIONAL_VALUE_UNIT,
        "categories": sorted({row["category"] for row in normalized}),
        "rows": normalized,
    }


def fetch_dld_national_livestock_value(*, fetcher=fetch_json, retrieved_at=None):
    """Bounded single-page snapshot of the national value resource (35 rows at review)."""
    before = _resource_revision(fetcher, NATIONAL_VALUE_RESOURCE_ID)
    response = fetcher(NATIONAL_VALUE_RESOURCE_URL)
    result = response.get("result") if isinstance(response, dict) else None
    if (not isinstance(result, dict) or response.get("success") is not True
            or result.get("resource_id") != NATIONAL_VALUE_RESOURCE_ID):
        raise DldLivestockDataError("DLD_RESPONSE_INCOMPLETE_OR_RESOURCE_CHANGED")
    after = _resource_revision(fetcher, NATIONAL_VALUE_RESOURCE_ID)
    if before != after:
        raise DldLivestockDataError("DLD_RESOURCE_CHANGED_DURING_PAGING")
    at = datetime.now(timezone.utc).isoformat() if retrieved_at is None else retrieved_at
    normalized = normalize_dld_national_livestock_value(
        response, retrieved_at=at, source_revision=before,
    )
    metadata_url = DLD_BASE + "/api/3/action/resource_show?id=" + NATIONAL_VALUE_RESOURCE_ID
    normalized["request_urls"] = [metadata_url, NATIONAL_VALUE_RESOURCE_URL, metadata_url]
    return normalized


def _decimal_value(raw):
    if raw is None:
        return None
    if isinstance(raw, bool):
        raise DldLivestockDataError("DLD_VALUE_INVALID")
    if isinstance(raw, (int, float)):
        value = float(raw)
    elif isinstance(raw, str):
        text_value = raw.strip()
        if text_value in ("", "-", "--"):
            return None
        if not _DECIMAL_COUNT.fullmatch(text_value):
            raise DldLivestockDataError("DLD_VALUE_INVALID")
        value = float(text_value.replace(",", ""))
    else:
        raise DldLivestockDataError("DLD_VALUE_INVALID")
    if value < 0:
        raise DldLivestockDataError("DLD_VALUE_INVALID")
    return value
