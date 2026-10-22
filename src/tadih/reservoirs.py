"""RID medium-reservoir reports, preserving original daily spatial support."""

from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import time

from .ingestion import fetch_json, save_snapshot, snapshot_complete


DOCUMENTATION_URL = "https://app.rid.go.th/reservoir/api/document/reservoir"
BASE_URL = "https://app.rid.go.th/reservoir/api/reservoir/public"
MEASURES = {
    "storage": ("reservoir_storage_capacity", "MCM"),
    "dead_storage": ("reservoir_dead_storage", "MCM"),
    "volume": ("reservoir_volume", "MCM"),
    "percent_storage": ("reservoir_percent_storage", "%"),
}


def _hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def _day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("RID report date must be YYYY-MM-DD")
    return date.fromisoformat(value)


def _records(payload, requested_date=None):
    if not isinstance(payload, dict) or type(payload.get("total")) is not int or payload["total"] < 0 or not isinstance(payload.get("data"), list):
        raise ValueError("RID report schema changed")
    report_date = _day(payload.get("date")).isoformat()
    if requested_date is not None and report_date != requested_date:
        raise ValueError("RID returned another report date; history is not substituted with current data")
    records, seen = [], set()
    for group in payload["data"]:
        if not isinstance(group, dict) or not isinstance(group.get("region"), str) or not group["region"].strip() or not isinstance(group.get("reservoir"), list):
            raise ValueError("RID region/reservoir grouping changed")
        for raw in group["reservoir"]:
            if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not raw["id"].strip() or not isinstance(raw.get("name"), str) or not raw["name"].strip():
                raise ValueError("RID reservoir identity is missing")
            if raw["id"] in seen:
                raise ValueError("duplicate RID reservoir ID in one report; inspect provider revision")
            seen.add(raw["id"])
            for field in (*MEASURES, "inflow", "outflow"):
                if field not in raw:
                    raise ValueError("RID reservoir field is missing: " + field)
                value = raw[field]
                if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0):
                    raise ValueError("RID values must be finite non-negative numeric or null: " + field)
            records.append((group["region"], raw))
    if len(records) != payload["total"]:
        raise ValueError("RID total differs from complete grouped reservoir count")
    return report_date, records


def fetch_reservoirs(report_date=None, *, fetcher=fetch_json):
    """Fetch every reservoir in one provider report, current or exact historical day."""
    requested = _day(report_date).isoformat() if report_date is not None else None
    url = BASE_URL + ("/" + requested if requested else "")
    payload = fetcher(url)
    reported, records = _records(payload, requested)
    return {"source_id": "rid", "inventory_id": "rid_medium_reservoirs", "status": "ok",
            "data_kind": "official", "spatial_support": "reservoir", "request_url": url,
            "documentation_url": DOCUMENTATION_URL, "requested_date": requested, "report_date": reported,
            "retrieved_at": datetime.now(timezone.utc).isoformat(), "release_at": None, "license_status": "pending",
            "reservoir_count": len(records), "payload": payload,
            "limitations": ["Medium reservoirs listed by this provider report; not every reservoir in Thailand.",
                            "No verified province codes, coordinates, water-level datum or publication time supplied.",
                            "Inflow/outflow units unspecified in documentation; retained raw only.",
                            "Historical API capture does not establish historical release ordering or metadata revisions."]}


def normalize_reservoirs(envelope, *, percent_tolerance=0.05):
    """Normalize documented units; report percentage calibration separately."""
    if (not isinstance(envelope, dict) or envelope.get("source_id") != "rid" or envelope.get("inventory_id") != "rid_medium_reservoirs"
            or envelope.get("status") != "ok" or envelope.get("license_status") != "pending"):
        raise ValueError("expected an RID medium-reservoir raw report")
    if isinstance(percent_tolerance, bool) or not isinstance(percent_tolerance, (int, float)) or not math.isfinite(percent_tolerance) or percent_tolerance < 0:
        raise ValueError("percent_tolerance must be finite non-negative percentage points")
    report_date, records = _records(envelope["payload"], envelope.get("requested_date"))
    if envelope.get("report_date") != report_date or envelope.get("reservoir_count") != len(records):
        raise ValueError("RID envelope report identity differs from payload")
    retrieved = datetime.fromisoformat(envelope["retrieved_at"].replace("Z", "+00:00"))
    observed = datetime.fromisoformat(report_date + "T00:00:00+07:00")
    if retrieved.tzinfo is None or observed > retrieved:
        raise ValueError("RID retrieval timestamp is unzoned or precedes report period")
    observations, calibration, inventory = [], [], []
    for region, raw in records:
        capacity, volume, percent = raw["storage"], raw["volume"], raw["percent_storage"]
        expected = 100 * volume / capacity if capacity is not None and capacity > 0 and volume is not None else None
        deviation = percent - expected if percent is not None and expected is not None else None
        status = "uncheckable" if deviation is None else "consistent" if abs(deviation) <= percent_tolerance else "mismatch"
        calibration.append({"reservoir_id": raw["id"], "report_date": report_date, "reported_percent": percent,
                            "computed_volume_over_capacity_percent": expected, "difference_percentage_points": deviation,
                            "tolerance_percentage_points": percent_tolerance, "status": status})
        inventory.append({"reservoir_id": raw["id"], "name": raw["name"], "region": region, "area_code": None,
                          "location_id": "rid:reservoir:" + raw["id"], "geography_status": "provider_reservoir_id_only"})
        revision = _hash({"report_date": report_date, "region": region, "reservoir": raw})
        for field, (measure, unit) in MEASURES.items():
            quality = "missing" if raw[field] is None else "release_unknown"
            if field == "percent_storage" and raw[field] is not None:
                quality = "percent_calibration_" + status
            observations.append({
                "observation_id": "rid-" + _hash([raw["id"], report_date, measure]), "revision_id": revision,
                "source_id": "rid", "area_code": None, "spatial_support": "reservoir", "location_id": "rid:reservoir:" + raw["id"],
                "commodity_id": None, "observed_at": observed.isoformat(), "release_at": None,
                "retrieved_at": envelope["retrieved_at"], "measure": measure, "value": raw[field], "unit": unit,
                "data_kind": "official", "quality_flag": quality, "source_url": envelope["request_url"], "license_status": "pending",
                "market_id": None, "price_type": None, "grade": None, "season": None,
            })
    return {"observations": observations, "reservoirs": inventory, "percent_calibration": calibration,
            "reservoir_count": len(records), "observation_count": len(observations), "report_date": report_date,
            "percent_calibration_counts": {status: sum(row["status"] == status for row in calibration) for status in ("consistent", "mismatch", "uncheckable")},
            "license_status": "pending", "inflow_outflow_status": "raw_only_units_unverified"}


def capture_reservoirs(output_dir, report_date=None, *, refresh=False, fetcher=fetch_json):
    """Checkpoint an entire daily report; explicit historical days can resume."""
    if type(refresh) is not bool:
        raise ValueError("refresh must be boolean")
    requested = _day(report_date).isoformat() if report_date is not None else None
    if requested is not None and not refresh:
        partition = "medium-reservoirs-" + requested
        directory = Path(output_dir) / "rid" / partition
        if snapshot_complete("rid", output_dir, partition):
            record = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
            envelope = json.loads((directory / record["artifact"]).read_text(encoding="utf-8"))
            if envelope.get("report_date") != requested:
                raise ValueError("RID checkpoint report date differs from requested history")
            normalized = normalize_reservoirs(envelope)
            return {**record, "path": str((directory / record["artifact"]).resolve()), "action": "skipped_verified",
                    "report_date": requested, "reservoir_count": normalized["reservoir_count"], "observation_count": normalized["observation_count"]}
    envelope = fetch_reservoirs(requested, fetcher=fetcher)
    normalized = normalize_reservoirs(envelope)
    partition = "medium-reservoirs-" + envelope["report_date"]
    record = save_snapshot(envelope, "rid", output_dir, partition)
    return {**record, "path": str((Path(output_dir) / "rid" / partition / record["artifact"]).resolve()), "action": "fetched",
            "report_date": envelope["report_date"], "reservoir_count": normalized["reservoir_count"], "observation_count": normalized["observation_count"]}


def backfill_reservoirs(start_date, end_date, output_dir, *, refresh=False, max_days=31, fetcher=fetch_json, sleep=time.sleep):
    """Bounded daily history; previous successful checkpoints survive a later failure."""
    start, end = _day(start_date), _day(end_date)
    if type(max_days) is not int or not 1 <= max_days <= 366 or not 0 <= (end - start).days < max_days:
        raise ValueError("RID backfill needs ordered dates within max_days (1–366)")
    results = []
    for offset in range((end - start).days + 1):
        if offset:
            sleep(0.25)
        results.append(capture_reservoirs(output_dir, (start + timedelta(days=offset)).isoformat(), refresh=refresh, fetcher=fetcher))
    return results
