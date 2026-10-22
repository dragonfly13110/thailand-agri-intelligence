"""Provisional, explainable screening. Missing evidence never becomes zero."""

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit


def _time(value):
    raw = str(value)
    moment = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if moment.tzinfo is None and len(raw) != 10:
        raise ValueError("timestamps require timezone; date-only values mean UTC midnight")
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _evaluate(evidence, names):
    rules = json.loads((Path(__file__).resolve().parents[2] / "config" / "thresholds.json").read_text())
    malformed = not isinstance(evidence, dict)
    evidence = evidence if isinstance(evidence, dict) else {}
    raw_observations = evidence.get("observations", {})
    card = {
        "status": "unknown", "classification": "Unknown", "confidence": "provisional",
        "area_code": evidence.get("area_code"), "commodity_id": evidence.get("commodity_id"),
        "evaluated_at": evidence.get("evaluated_at"), "rule_version": rules["rule_version"],
        "evidence": raw_observations if isinstance(raw_observations, dict) else {}, "reasons": [], "indicators": {},
        "coverage": evidence.get("coverage"), "freshness": {}, "source_links": [],
        "recommended_action": "ตรวจสอบข้อมูลต้นทางและความครบถ้วนก่อนประเมิน",
        "owner": "เจ้าหน้าที่ผู้รับผิดชอบพื้นที่", "automatic_action": False,
        "limitations": "เกณฑ์ทดลอง ต้องตรวจสอบภาคสนาม ไม่ใช่ประกาศภัยหรือยอดความเสียหาย",
    }
    observations = card["evidence"]
    if malformed or not isinstance(raw_observations, dict):
        card["reasons"].append("invalid_evidence_structure")
    try:
        now = _time(evidence["evaluated_at"])
        card["evaluated_at"] = now.isoformat()
        if evidence.get("admin_level") not in {"province", "district", "subdistrict"}:
            card["reasons"].append("unsupported_or_missing_administrative_grain")
        if not evidence.get("area_code") or not evidence.get("commodity_id"):
            card["reasons"].append("missing_area_or_commodity")
        for name in names:
            item = observations.get(name, {})
            if not isinstance(item, dict):
                card["reasons"].append(f"invalid_metric_structure:{name}")
                continue
            if not _number(item.get("value")):
                card["reasons"].append(f"missing_or_invalid:{name}")
                continue
            if not all(isinstance(item.get(field), str) and item[field].strip() for field in ("unit", "source_id", "source_url", "definition", "observed_at", "release_at")):
                card["reasons"].append(f"missing_provenance:{name}")
                continue
            link = urlsplit(item["source_url"])
            if link.scheme != "https" or not link.hostname or link.username is not None or link.password is not None:
                card["reasons"].append(f"invalid_source_url:{name}")
                continue
            if item.get("area_code") != evidence.get("area_code") or item.get("admin_level") != evidence.get("admin_level"):
                card["reasons"].append(f"incompatible_spatial_grain:{name}")
            observed, released = _time(item["observed_at"]), _time(item["release_at"])
            card["freshness"][name] = {"observed_at": item["observed_at"], "release_at": item["release_at"]}
            card["source_links"].append(item["source_url"])
            if released > now or observed > now:
                card["reasons"].append(f"not_available_at_evaluation:{name}")
            # Historical references retain their real dates; stale checks apply to current evidence.
            max_age = rules["max_age_days_by_metric"].get(name, rules["max_age_days"])
            if not name.startswith("reference_") and now - observed > timedelta(days=max_age):
                card["reasons"].append(f"stale:{name}")
    except (KeyError, ValueError, TypeError, OverflowError):
        card["evaluated_at"] = None
        card["reasons"].append("missing_or_invalid_evaluation_time")
    return card, rules


def evaluate_water_risk(evidence: dict) -> dict:
    """Screen rain percentile, satellite validity and local-water evidence at one real area grain."""
    names = ("rain_percentile", "ndvi_valid_fraction", "water_level")
    card, rules = _evaluate(evidence, names)
    card["decision_id"] = "D02"
    if card["reasons"]:
        return card
    rain, ndvi, water = (card["evidence"][name] for name in names)
    if not 0 <= rain["value"] <= 1 or not 0 <= ndvi["value"] <= 1:
        card["reasons"].append("fraction_out_of_range")
    reference_years = rain.get("reference_years")
    if not _number(reference_years) or reference_years < rules["minimum_rain_reference_years"]:
        card["reasons"].append("insufficient_seasonal_rain_reference")
    if rain["unit"] != "fraction" or ndvi["unit"] != "fraction":
        card["reasons"].append("incompatible_fraction_units")
    if ndvi["value"] < rules["ndvi_minimum_valid_fraction"]:
        card["reasons"].append("satellite_valid_pixels_insufficient")
    if card["reasons"]:
        return card
    if rain["value"] < rules["rain_percentile_watch"]:
        card["status"] = "watch"
        card["reasons"] = ["rain_below_provisional_seasonal_percentile", "local_water_evidence_attached_not_calibrated"]
        card["headline"] = "ฝนต่ำกว่าฐานฤดูกาล ควรตรวจสอบน้ำในพื้นที่"
        card["signal"] = "low_rain_monitoring_candidate"
        card["recommended_action"] = "ตรวจสอบน้ำในพื้นที่และพิจารณาลงสำรวจร่วมกับผู้รับผิดชอบ"
    else:
        card["status"] = "normal"
        card["reasons"] = ["no_provisional_low_rain_signal"]
        card["recommended_action"] = "ติดตามข้อมูลตามรอบ ไม่ได้ยืนยันว่าไม่มีความเสี่ยงอื่น"
    card["classification"] = "Derived Indicator" if card["status"] == "normal" else "Watch Signal"
    card["reference"] = {"rain_percentile_watch": rules["rain_percentile_watch"], "minimum_reference_years": rules["minimum_rain_reference_years"]}
    card["limitations"] += " ระดับน้ำเป็นหลักฐานประกอบ ยังไม่มีเกณฑ์แปลงเป็นความเสี่ยงขาดน้ำ"
    return card


def evaluate_market(evidence: dict) -> dict:
    """Compare like-for-like prices and production; never infer a causal relationship."""
    names = ("current_price", "reference_price", "current_production", "reference_production")
    card, rules = _evaluate(evidence, names)
    card["decision_id"] = "D01"
    if card["reasons"]:
        return card
    for current, reference, dimensions in (
        ("current_price", "reference_price", ("unit", "commodity_id", "market_id", "price_type", "grade", "season", "definition")),
        ("current_production", "reference_production", ("unit", "commodity_id", "season", "definition")),
    ):
        left, right = card["evidence"][current], card["evidence"][reference]
        if any(not left.get(key) or left.get(key) != right.get(key) for key in dimensions):
            card["reasons"].append(f"incomparable:{current}")
        if left.get("commodity_id") != evidence.get("commodity_id"):
            card["reasons"].append(f"incompatible_commodity:{current}")
        if left["value"] < 0 or right["value"] <= 0:
            card["reasons"].append(f"invalid_or_zero_reference:{reference}")
        if _time(right["observed_at"]) >= _time(left["observed_at"]):
            card["reasons"].append(f"reference_must_precede_current:{reference}")
    if card["reasons"]:
        return card
    for measure in ("price", "production"):
        current, reference = (card["evidence"][f"{prefix}_{measure}"]["value"] for prefix in ("current", "reference"))
        card["indicators"][f"{measure}_change_fraction"] = current / reference - 1
    changed = abs(card["indicators"]["price_change_fraction"]) >= rules["price_change_watch_fraction"] or abs(card["indicators"]["production_change_fraction"]) >= rules["production_change_watch_fraction"]
    card["status"] = "watch" if changed else "normal"
    card["classification"] = "Watch Signal" if changed else "Derived Indicator"
    card["reasons"] = ["price_or_production_change_requires_review" if changed else "no_provisional_change_signal"]
    card["recommended_action"] = "ตรวจสอบรอบผลผลิต ตลาด และต้นทุนก่อนตัดสินใจ" if changed else "ติดตามราคาและผลผลิตตามรอบ"
    card["limitations"] = "ราคาและผลผลิตเปลี่ยนพร้อมกันไม่ได้ยืนยันเหตุและผล เกณฑ์ยังเป็นค่าทดลอง"
    return card
