"""NABC monthly farmgate prices: fixed identities, explicit units, unknown release dates."""

from datetime import date
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlencode

from .quality import timestamp, validate_observation

UNITS = {"บาท/กก.": ("THB/kg", 1), "บาท/ตัน": ("THB/kg", 1000),
         "บาท/ตัว": ("THB/head", 1), "บาท/ร้อยฟอง": ("THB/100_eggs", 1), "บาท/ร้อยผล": ("THB/100_fruit", 1)}


def monthly_price_observation(raw, retrieved_at):
    if not isinstance(raw, dict) or raw.get("province_code") != "TH00":
        raise ValueError("NABC monthly adapter currently accepts national TH00 records only")
    product = raw.get("product_name")
    if not isinstance(product, str) or not product.strip():
        raise ValueError("NABC monthly product definition is missing")
    if raw.get("unit") not in UNITS:
        raise ValueError("NABC monthly price unit is unknown; review conversion before import")
    year_token, month_token = str(raw.get("year_th")), str(raw.get("month"))
    if not re.fullmatch(r"[0-9]{4}", year_token) or not 2400 <= int(year_token) <= 2800 or not re.fullmatch(r"[0-9]{1,2}", month_token):
        raise ValueError("NABC monthly requires a Buddhist year and numeric month")
    if raw.get("week", 0) != 0:
        raise ValueError("weekly records cannot enter the monthly adapter")
    year, month = int(year_token)-543, int(month_token)
    observed = date(year, month, 1).isoformat() + "T00:00:00+07:00"
    token = "" if raw.get("value") is None else str(raw["value"]).strip()
    unit, divisor = UNITS[raw["unit"]]
    if token in {"", "-", "..", "N/A", "null"}:
        value = None
    else:
        if not re.fullmatch(r"(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?", token):
            raise ValueError("NABC price must be non-negative numeric with valid decimal grouping or missing")
        value = float(Decimal(token.replace(",", "")) / divisor)
        if not math.isfinite(value):
            raise ValueError("NABC price must be finite")
    identity = {"source": "oae_nabc_monthly", "product_name": product, "unit": unit, "period": f"{year:04}-{month:02}", "geo": "TH00"}
    digest = lambda record: hashlib.sha256(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()
    row = {"observation_id": "oae-monthly-" + digest(identity), "revision_id": digest(raw),
           "source_id": "oae", "area_code": None, "spatial_support": "national", "location_id": "TH",
           "commodity_id": "oae:" + product, "observed_at": observed, "release_at": None, "retrieved_at": retrieved_at,
           "measure": "price", "value": value, "unit": unit, "data_kind": "official",
           "quality_flag": "missing" if value is None else "release_unknown",
           "source_url": "https://agriapi.nabc.go.th/api/monthly-prices/product?" + urlencode({"product_name": product}),
           "license_status": "pending", "market_id": "oae_national_monthly_farm_gate", "price_type": "farm_gate",
           "grade": product, "season": "month-" + str(month).zfill(2)}
    return validate_observation(row)


def resolve_monthly_rows(raw_rows, retrieved_at):
    """Quarantine every version of an ambiguous month, while retaining valid months."""
    groups = {}
    for raw in raw_rows:
        row = monthly_price_observation(raw, retrieved_at)
        groups.setdefault(row["observation_id"], []).append((row, raw))
    observations, blocked, quarantined, duplicates, conflicts = [], [], [], 0, 0
    for records in groups.values():
        if len({row["revision_id"] for row, _ in records}) > 1:
            conflicts += 1
            quarantined.extend(raw for _, raw in records)
            revisions = sorted({row["revision_id"] for row, _ in records})
            # Keep a prior known value from silently surviving new conflicting evidence; review is required to unblock it.
            blocked.append({**records[0][0], "value": None, "data_kind": "unknown", "quality_flag": "conflicting_source_records",
                            "revision_id": "quarantine-" + hashlib.sha256(json.dumps(revisions).encode()).hexdigest()})
        else:
            observations.append(records[0][0])
            duplicates += len(records)-1
    dates = [row["observed_at"] for row in observations]
    return {"observations": observations, "blocked_observations": blocked, "raw_rows": len(raw_rows), "unique_observations": len(observations),
            "exact_duplicate_rows": duplicates, "conflicting_observations": conflicts, "quarantined_raw_rows": len(quarantined),
            "quarantined_records": quarantined, "earliest": min(dates) if dates else None, "latest": max(dates) if dates else None}


def normalize_nabc_monthly(envelope):
    if (not isinstance(envelope, dict) or envelope.get("source_id") != "oae" or envelope.get("inventory_id") not in {"nabc_monthly", "nabc_monthly_product"}
            or envelope.get("status") != "ok"):
        raise ValueError("expected a successful NABC monthly price inventory snapshot")
    timestamp(envelope["retrieved_at"])
    raw_rows = []
    pages = envelope["payload"]["pages"]
    if not isinstance(pages, list) or not pages:
        raise ValueError("NABC monthly snapshot has no provider pages")
    for page in pages:
        if not isinstance(page, dict) or page.get("success") is not True or not isinstance(page.get("data"), list):
            raise ValueError("NABC monthly provider page failed or schema changed")
        for raw in page["data"]:
            if not isinstance(raw, dict):
                raise ValueError("NABC monthly record must be an object")
            if envelope["inventory_id"] == "nabc_monthly" and raw.get("year_th") != envelope["year_th"]:
                raise ValueError("NABC monthly record lies outside the requested Buddhist year")
            if envelope["inventory_id"] == "nabc_monthly_product" and raw.get("product_name") != envelope.get("product_name"):
                raise ValueError("NABC monthly record differs from the requested product")
            raw_rows.append(raw)
    if len(raw_rows) != envelope["pagination"]["raw_record_count"]:
        raise ValueError("NABC monthly raw record count differs from snapshot pagination")
    result = resolve_monthly_rows(raw_rows, envelope["retrieved_at"])
    return {**result, "commodity_count": len({r["commodity_id"] for r in result["observations"]}), "provider_pagination_complete": envelope["pagination"]["complete"],
            "data_quality_status": "conflicts_quarantined" if result["conflicting_observations"] else "no_conflicting_months",
            "completeness_note": "Provider page completion does not prove every product/month exists; exact overlap rows were retained in raw and deduplicated for facts.",
            "license_status": "pending", "release_status": "unknown_not_as_of_backtest_eligible"}


def load_nabc_monthly_snapshot(directory):
    from .ingestion import snapshot_complete
    directory = Path(directory)
    if directory.parent.name != "oae" or not snapshot_complete("oae", directory.parent.parent, directory.name):
        raise ValueError("NABC monthly raw checkpoint is missing or fails canonical SHA-256 verification")
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    return json.loads((directory / manifest["artifact"]).read_text(encoding="utf-8"))
