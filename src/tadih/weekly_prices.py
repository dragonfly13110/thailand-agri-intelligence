"""NABC weekly native staging; unresolved week boundaries never become dates."""

from decimal import Decimal
from datetime import datetime, timezone
import hashlib
import json
import re
from urllib.parse import urlencode

from .ingestion import fetch_json, save_snapshot
from .prices import UNITS
from .quality import timestamp


def capture_weekly_prices(product_name, year_th, output_dir, fetcher=fetch_json):
    """Capture one bounded page; partial history remains explicitly incomplete."""
    if not isinstance(product_name, str) or not product_name.strip():
        raise ValueError("weekly product_name must be nonempty")
    if type(year_th) is not int or not 2400 <= year_th <= 2800:
        raise ValueError("weekly year_th must be an explicit Buddhist year")
    url = "https://agriapi.nabc.go.th/api/weekly-prices/product?" + urlencode(
        {"product_name": product_name, "year_th": year_th, "page": 1, "limit": 100})
    payload = fetcher(url)
    retrieved = datetime.now(timezone.utc).isoformat()
    staged = stage_weekly_prices(payload, retrieved_at=retrieved, product_name=product_name)
    page = payload.get("pagination", {})
    if (not isinstance(page, dict) or any(type(page.get(k)) is not int for k in ("page", "offset", "limit", "count", "total"))
            or page["page"] != 1 or page["offset"] != 0 or page["limit"] != 100
            or page["count"] != staged["record_count"] or not 0 <= page["count"] <= 100
            or page["total"] < page["count"]):
        raise ValueError("weekly pagination does not match bounded request")
    if any(row["year_th"] != year_th for row in staged["records"]):
        raise ValueError("weekly response differs from requested year")
    envelope = {"source_id": "oae", "status": "ok", "request_url": url,
        "retrieved_at": retrieved, "release_at": None, "license_status": "pending",
        "product_name": product_name, "year_th": year_th, "payload": payload,
        "complete": staged["complete_capture"], "warehouse_ready": False}
    partition = "weekly-product-" + hashlib.sha256(product_name.encode()).hexdigest()[:24] + f"-{year_th}"
    manifest = save_snapshot(envelope, "oae", output_dir, partition)
    return {"manifest": manifest, "rows": staged["records"],
        "complete": staged["complete_capture"], "total": page["total"], "warehouse_ready": False}


def stage_weekly_prices(payload, *, retrieved_at, product_name):
    """Keep every provider row and revision, including conflicts; no warehouse rows."""
    retrieved_at = timestamp(retrieved_at).isoformat()
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("data"), list):
        raise ValueError("successful weekly response with data array required")
    records = []
    for raw in payload["data"]:
        if not isinstance(raw, dict) or raw.get("product_name") != product_name or raw.get("province_code") != "TH00":
            raise ValueError("weekly product and national grain must match")
        year, month, week = (str(raw.get(k)) for k in ("year_th", "month", "week"))
        if (not re.fullmatch(r"[0-9]{4}", year) or not 2400 <= int(year) <= 2800
                or not re.fullmatch(r"[0-9]{1,2}", month) or not 1 <= int(month) <= 12
                or not re.fullmatch(r"[0-9]", week) or not 1 <= int(week) <= 5):
            raise ValueError("weekly native year/month/week invalid or outside reviewed range")
        if raw.get("unit") not in UNITS:
            raise ValueError("weekly native unit requires review")
        token = "" if raw.get("value") is None else str(raw["value"]).strip()
        value = None
        if token not in {"", "-", "..", "N/A", "null"}:
            if not re.fullmatch(r"(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?", token):
                raise ValueError("weekly value must be nonnegative decimal or missing")
            value = str(Decimal(token.replace(",", "")))
        identity = ["nabc_weekly", product_name, raw["unit"], "TH00", int(year), int(month), int(week)]
        digest = lambda obj: hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()
        records.append({"staging_id": digest(identity), "revision_id": digest(raw),
            "product_name": product_name, "year_th": int(year), "month": int(month), "week": int(week),
            "native_value": value, "native_unit": raw["unit"], "spatial_support": "national",
            "province_code": "TH00", "market_id": None, "price_type": "farm_gate",
            "period_start": None, "period_end": None, "release_at": None,
            "retrieved_at": retrieved_at, "license_status": "pending",
            "status": "staging_week_boundaries_and_release_unverified"})
    pagination = payload.get("pagination", {})
    complete = (pagination.get("page") == 1 and pagination.get("offset") == 0
        and pagination.get("count") == len(records) and pagination.get("total") == len(records))
    return {"records": records, "record_count": len(records), "complete_capture": complete,
        "warehouse_ready": False, "license_status": "pending"}
