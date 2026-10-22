"""Source-scoped commodity staging. No inferred cross-provider equivalence."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .ingestion import MAX_RESPONSE_BYTES, fetch_json, trusted_ssl_context

ROOT = Path(__file__).resolve().parents[2]


def _fetch_inventory(url):
    if url.startswith("https://agriapi.nabc.go.th/"):
        return fetch_json(url)
    # MOC returns a JSON array, while the existing NABC/CKAN transport requires an object.
    request = Request(url, headers={"User-Agent": "TADIH/0.1 commodity-inventory", "Accept": "application/json"})
    context = trusted_ssl_context()
    for attempt in range(3):
        try:
            with urlopen(request, timeout=12, context=context) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError("commodity response exceeds 10 MiB limit")
            return json.loads(raw)
        except HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                raise
            error.close()
        except (TimeoutError, URLError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)


def _commodity(raw, inventory_id, settings, request_url):
    item = {"product_name": raw} if isinstance(raw, str) else raw
    if not isinstance(item, dict) or not isinstance(item.get("product_name"), str) or not item["product_name"].strip():
        raise ValueError("commodity name missing or provider schema changed")
    product_code = item.get("product_id")
    if product_code is not None and (not isinstance(product_code, str) or not product_code):
        raise ValueError("official product code must be nonempty text")
    definitions = {
        "product_name": item["product_name"], "unit": item.get("unit"),
        "commodity_group": item.get("commod", item.get("category_name")),
        "subcommodity": item.get("subcommod"), "species": item.get("species"),
        "variety": item.get("variety"), "processing": item.get("processing"), "grade": item.get("grade"),
        "price_type": item.get("sell_type", settings.get("price_type")),
    }
    identity = {"inventory_id": inventory_id, "source_product_code": product_code, **definitions}
    key = hashlib.sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return {
        "staging_commodity_id": f"{inventory_id}:{key}", "source_id": settings["source_id"],
        "inventory_id": inventory_id, "source_product_code": product_code,
        "identifier_basis": "source_code_and_definition_hash" if product_code else "source_name_and_definition_hash_not_official_code",
        **definitions, "mapping_status": "unmapped", "source_url": request_url,
        "license_status": settings["license_status"], "source_raw": raw,
    }


def discover_commodities(source="nabc_monthly", *, year_th=None, page_size=100, max_pages=10, start_page=1, fetcher=_fetch_inventory, sleep=time.sleep):
    """Stage every returned item, bounded/resumable for documented page-limit inventories.

    NABC monthly requires an explicit Buddhist year. Unpaginated masters have
    complete=None because providers expose no count/checkpoint proving completeness.
    Network/auth failures return a failure envelope; malformed successful schemas raise.
    """
    sources = json.loads((ROOT / "config/commodity_sources.json").read_text(encoding="utf-8"))["sources"]
    if source not in sources:
        raise ValueError("unknown commodity inventory source")
    settings = sources[source]
    if settings["year_required"]:
        if isinstance(year_th, bool) or not isinstance(year_th, int) or not 2400 <= year_th <= 2800:
            raise ValueError("year_th must be an explicit Buddhist year between 2400 and 2800")
    elif year_th is not None:
        raise ValueError("year_th is not supported by this inventory")
    for name, value, lower, upper in (("page_size", page_size, 1, 1000), ("max_pages", max_pages, 1, 100), ("start_page", start_page, 1, 1000000)):
        if isinstance(value, bool) or not isinstance(value, int) or not lower <= value <= upper:
            raise ValueError(f"{name} must be an integer between {lower} and {upper}")
    paginated = settings["pagination"] == "page_limit"
    if not paginated and start_page != 1:
        raise ValueError("unpaginated inventories cannot resume by page")
    items, pages, urls, seen = [], [], [], set()
    total, complete, raw_count = None, False if paginated else None, 0
    next_page = start_page
    envelope = {
        "source_id": settings["source_id"], "inventory_id": source, "request_url": settings["endpoint"],
        "retrieved_at": datetime.now(timezone.utc).isoformat(), "release_at": None, "issue_at": None,
        "year_th": year_th, "status": "ok", "data_kind": "commodity_master_metadata",
        "spatial_support": "not_applicable", "license_status": "pending",
        "documentation_url": settings["documentation_url"], "payload": {"items": items, "pages": pages},
        "request_urls": urls,
        "limitations": ["Source-scoped staging IDs are not a validated cross-provider commodity taxonomy.",
            "Names are retained verbatim; missing species/variety/processing/grade/unit remain null.",
            "Unpaginated endpoints expose no total proving inventory completeness.",
            "A commodity list does not establish province coverage or measurement availability.",
            "Raw price records used for inventory extraction remain local pending redistribution review."],
    }
    for index in range(max_pages if paginated else 1):
        params = {"year_th": year_th} if settings["year_required"] else {}
        if paginated:
            params.update(page=next_page, limit=page_size)
        url = settings["endpoint"] + ("?" + urlencode(params) if params else "")
        urls.append(url)
        envelope["request_url"] = urls[0]
        try:
            payload = fetcher(url)
        except (HTTPError, URLError, TimeoutError) as error:
            code = getattr(error, "code", None)
            envelope.update(status="access_denied_or_filtered" if code in {401, 403} else "unreachable", error_type=type(error).__name__, http_status=code)
            complete = False
            if isinstance(error, HTTPError):
                error.close()
            break
        if source == "moc":
            if not isinstance(payload, list):
                raise ValueError("MOC commodity inventory must be a JSON array")
            rows = payload
        else:
            if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("data"), list):
                raise ValueError("NABC inventory failed or provider schema changed")
            rows = payload["data"]
        pages.append(payload)
        raw_count += len(rows)
        for raw in rows:
            item = _commodity(raw, source, settings, url)
            if item["staging_commodity_id"] not in seen:
                items.append(item)
                seen.add(item["staging_commodity_id"])
        if not paginated:
            break
        pagination = payload.get("pagination", {})
        expected_offset = (next_page - 1) * page_size
        page_total = pagination.get("total")
        if (not isinstance(page_total, int) or isinstance(page_total, bool) or page_total < 0
                or pagination.get("page") != next_page or pagination.get("offset") != expected_offset
                or pagination.get("limit") != page_size or pagination.get("count") != len(rows)
                or (total is not None and total != page_total) or len(rows) > page_size):
            raise ValueError("commodity pagination metadata changed or is inconsistent")
        total = page_total
        next_page += 1
        complete = expected_offset + len(rows) >= total
        if complete:
            break
        if not rows or len(rows) < page_size:
            raise ValueError("commodity pagination ended before reported total")
        if index + 1 < max_pages:
            sleep(0.25)
    envelope["pagination"] = {
        "start_page": start_page, "next_page": next_page if paginated and complete is not True else None,
        "page_size": page_size if paginated else None, "pages": len(pages), "total_count": total,
        "raw_record_count": raw_count, "staged_commodity_count": len(items), "complete": complete,
        "scope": f"provider-year-{year_th}" if year_th else "provider-returned-master",
    }
    return envelope
