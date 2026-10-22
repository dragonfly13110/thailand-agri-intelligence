"""Bounded national monthly price histories for products in a verified inventory."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode

from .ingestion import fetch_json, save_snapshot, snapshot_complete
from .prices import load_nabc_monthly_snapshot, resolve_monthly_rows


def _check_page(payload, page_number, expected_total=None):
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("data"), list):
        raise ValueError("monthly product request failed or data schema changed")
    pagination = payload.get("pagination")
    if not isinstance(pagination, dict) or any(type(pagination.get(key)) is not int for key in ("page", "offset", "limit", "count", "total")):
        raise ValueError("monthly product pagination requires integer page/offset/limit/count/total")
    count, total = pagination["count"], pagination["total"]
    if (pagination["page"] != page_number or pagination["offset"] != (page_number - 1) * 100
            or pagination["limit"] != 100 or count != len(payload["data"]) or not 0 <= count <= 100
            or total < pagination["offset"] + count or (expected_total is not None and total != expected_total)):
        raise ValueError("monthly product pagination is inconsistent or changed during capture")
    complete = pagination["offset"] + count == total
    if not complete and count != 100:
        raise ValueError("monthly product returned a short page before its advertised end")
    return total, complete


def _summarize(product, raw_rows, retrieved_at):
    for raw in raw_rows:
        if not isinstance(raw, dict) or raw.get("product_name") != product:
            raise ValueError("monthly product response contains another product")
    resolved = resolve_monthly_rows(raw_rows, retrieved_at)
    return {"raw_record_count": resolved["raw_rows"],
            **{key: resolved[key] for key in ("unique_observations", "exact_duplicate_rows", "conflicting_observations", "quarantined_raw_rows", "earliest", "latest")}}


def fetch_monthly_product(product_name, max_pages=10, *, fetcher=fetch_json, sleep=time.sleep):
    """Capture one exact product; validate all records before any snapshot is saved."""
    if not isinstance(product_name, str) or not product_name.strip() or product_name != product_name.strip():
        raise ValueError("product_name must be an exact nonempty provider name")
    if type(max_pages) is not int or not 1 <= max_pages <= 100:
        raise ValueError("max_pages must be between 1 and 100")
    pages, urls, rows, total, complete = [], [], [], None, False
    for page_number in range(1, max_pages + 1):
        url = "https://agriapi.nabc.go.th/api/monthly-prices/product?" + urlencode({"product_name": product_name, "page": page_number, "limit": 100})
        payload = fetcher(url)
        total, complete = _check_page(payload, page_number, total)
        pages.append(payload)
        urls.append(url)
        rows.extend(payload["data"])
        if complete:
            break
        if page_number < max_pages:
            sleep(0.25)
    retrieved = datetime.now(timezone.utc).isoformat()
    summary = _summarize(product_name, rows, retrieved)
    return {
        "source_id": "oae", "inventory_id": "nabc_monthly_product", "status": "ok",
        "data_kind": "official", "spatial_support": "national", "product_name": product_name,
        "data_quality_status": "conflicts_quarantined" if summary["conflicting_observations"] else "ok",
        "retrieved_at": retrieved, "release_at": None, "issue_at": None, "license_status": "pending",
        "request_url": urls[0], "request_urls": urls, "payload": {"data": rows, "pages": pages},
        "pagination": {"start_page": 1, "pages": len(pages), "page_size": 100, "total_count": total,
                       "complete": complete, "next_page": None if complete else len(pages) + 1, **summary},
        "limitations": ["History covers only this exact national product definition.", "Provider page completion does not prove every historical product/month exists.",
                        "Release dates unknown; not eligible for historical as-of backtests. Licence review pending."],
    }


def _resume_summary(envelope, product):
    if (not isinstance(envelope, dict) or envelope.get("source_id") != "oae" or envelope.get("inventory_id") != "nabc_monthly_product"
            or envelope.get("status") != "ok" or envelope.get("product_name") != product
            or envelope.get("license_status") != "pending" or envelope.get("release_at") is not None):
        raise ValueError("monthly product checkpoint identity or provenance differs")
    pages = envelope["payload"]["pages"]
    if not isinstance(pages, list) or not pages:
        raise ValueError("monthly product checkpoint has no pages")
    raw_rows, total, complete = [], None, False
    for page_number, page in enumerate(pages, 1):
        if complete:
            raise ValueError("monthly product checkpoint has pages after completion")
        total, complete = _check_page(page, page_number, total)
        raw_rows.extend(page["data"])
    if raw_rows != envelope["payload"]["data"] or complete is not True or envelope["pagination"].get("complete") is not True:
        raise ValueError("monthly product checkpoint is incomplete or inconsistent")
    summary = _summarize(product, raw_rows, envelope["retrieved_at"])
    if any(envelope["pagination"].get(key) != value for key, value in {"total_count": total, **summary}.items()):
        raise ValueError("monthly product checkpoint counts differ from raw records")
    expected_quality = "conflicts_quarantined" if summary["conflicting_observations"] else "ok"
    if envelope.get("data_quality_status") != expected_quality:
        raise ValueError("monthly product checkpoint quarantine status differs from raw records")
    return summary


def backfill_monthly_prices(inventory_snapshot, output_dir, refresh=False, max_pages=10, *, fetcher=fetch_json, sleep=time.sleep):
    """Resume complete checked product captures; keep failed/partial history explicit."""
    if type(refresh) is not bool or type(max_pages) is not int or not 1 <= max_pages <= 100:
        raise ValueError("refresh must be boolean and max_pages between 1 and 100")
    inventory = load_nabc_monthly_snapshot(inventory_snapshot)
    if inventory.get("source_id") != "oae" or inventory.get("inventory_id") != "nabc_monthly" or inventory.get("status") != "ok":
        raise ValueError("expected a successful NABC monthly commodity inventory")
    items = inventory["payload"]["items"]
    if not isinstance(items, list) or any(not isinstance(item, dict) or not isinstance(item.get("product_name"), str) or not item["product_name"].strip() for item in items):
        raise ValueError("inventory items must contain provider product names")
    products = sorted({item["product_name"] for item in items})
    results = []
    for index, product in enumerate(products):
        partition = "monthly-product-" + hashlib.sha256(product.encode("utf-8")).hexdigest()[:24]
        directory = Path(output_dir) / "oae" / partition
        envelope = record = None
        if not refresh and snapshot_complete("oae", output_dir, partition):
            try:
                record = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
                envelope = json.loads((directory / record["artifact"]).read_text(encoding="utf-8"))
                _resume_summary(envelope, product)
            except (ValueError, KeyError, TypeError, OSError):
                envelope = None
        action = "skipped_verified" if envelope is not None else "fetched"
        if envelope is None:
            if index:
                sleep(0.25)
            envelope = fetch_monthly_product(product, max_pages, fetcher=fetcher, sleep=sleep)
            record = save_snapshot(envelope, "oae", output_dir, partition)
        pagination = envelope["pagination"]
        results.append({**record, "product_name": product, "action": action,
                        "path": str((directory / record["artifact"]).resolve()),
                        "data_quality_status": envelope["data_quality_status"],
                        "complete": pagination["complete"], "total_count": pagination["total_count"],
                        **{key: pagination[key] for key in ("raw_record_count", "unique_observations", "exact_duplicate_rows", "conflicting_observations", "quarantined_raw_rows", "earliest", "latest")}})
    return results
