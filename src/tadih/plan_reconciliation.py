"""Fail-closed plan/result row comparisons; never aggregate unreviewed source rows."""

from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any, Dict, List, Optional

from .catalog import ROOT


def _year_season(row, season, year):
    fields = row.get("source_fields", {})
    return (isinstance(fields, dict)
            and str(fields.get("crop_year_be") or fields.get("crop_year") or "") == year
            and fields.get("season_type") == season)


def _comparison_key(row):
    """Only a reviewed per-row semantic contract can authorize comparison.

    comparison_context must explicitly verify native area/grain, canonical crop,
    period/round, metric/unit, non-subtotal status, value_key and source evidence.
    Existing DOAE staging has no such verified contract; do not manufacture one.
    Matching rows are paired individually: no province rollup or cross-row sums.
    """
    context = row.get("comparison_context")
    if not isinstance(context, dict) or context.get("verified") is not True:
        return None, "CONTEXT_UNVERIFIED"
    required = ("native_spatial_grain", "area_code", "crop_identity", "period_id",
                "round_id", "metric", "unit", "value_key", "source_evidence")
    if any(not isinstance(context.get(k), str) or not context[k].strip()
           or context[k].strip().lower() in {"unknown", "unverified", "pending", "none", "ไม่ทราบ"}
           for k in required):
        return None, "CONTEXT_INCOMPLETE"
    if context.get("is_subtotal") is not False:
        return None, "SUBTOTAL_OR_UNVERIFIED_ROW_KIND"
    if context["metric"] not in {"planted_area", "harvested_area", "production", "households"}:
        return None, "NONADDITIVE_OR_UNREVIEWED_METRIC"
    grain = context["native_spatial_grain"]
    lengths = {"province": 2, "district": 4, "subdistrict": 6}
    area = context["area_code"]
    fields = row.get("source_fields", {})
    if (grain not in lengths or not re.fullmatch(r"[0-9]{%d}" % lengths[grain], area)
            or fields.get(grain + "_code") != area
            or fields.get("province_code") != area[:2]):
        return None, "AREA_OR_GRAIN_UNVERIFIED"
    # Validate supplied ancestors instead of deriving approval from an area prefix.
    for parent, width in [("district", 4), ("subdistrict", 6)]:
        code_key = parent + "_code"
        if code_key in fields:
            code = fields[code_key]
            if (not isinstance(code, str) or not re.fullmatch(r"[0-9]{%d}" % width, code)
                    or code[:2] != fields["province_code"]):
                return None, "INCONSISTENT_OR_UNVERIFIED_AREA_HIERARCHY"
    if grain == "subdistrict" or "subdistrict_code" in fields:
        district = fields.get("district_code")
        if not isinstance(district, str) or fields["subdistrict_code"][:4] != district:
            return None, "INCONSISTENT_OR_UNVERIFIED_AREA_HIERARCHY"
    if (not isinstance(row.get("resource_id"), str) or not row["resource_id"]
            or not re.fullmatch(r"[a-f0-9]{64}", str(row.get("source_sha256", "")))):
        return None, "LINEAGE_UNVERIFIED"
    return tuple(context[k] for k in required[:7]), None


def _number(value):
    if value is None:
        return None, "MISSING"
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        return None, "INVALID"
    try:
        if not math.isfinite(value):
            return None, "INVALID"
    except OverflowError:
        return None, "INVALID"
    return value, None


def reconcile_seasonal_plan_and_actual(
    plan_rows: List[Dict[str, Any]], result_rows: List[Dict[str, Any]],
    season: str, crop_year: str = "2569",
) -> Dict[str, Any]:
    if season not in {"RAINY", "DRY"} or not isinstance(crop_year, str) or not re.fullmatch(r"[0-9]{4}", crop_year):
        raise ValueError("An exact crop year and season are required")
    plans = [r for r in plan_rows if _year_season(r, season, crop_year)]
    actuals = [r for r in result_rows if _year_season(r, season, crop_year)]
    def provinces(rows):
        return sorted({r["source_fields"]["province_code"] for r in rows
                       if re.fullmatch(r"[0-9]{2}", str(r["source_fields"].get("province_code", "")))})
    pp, ap = provinces(plans), provinces(actuals)
    overlap = sorted(set(pp) & set(ap))
    reasons = Counter()
    buckets = []
    blocked = set()
    for rows in [plans, actuals]:
        groups = defaultdict(list)
        for row in rows:
            key, reason = _comparison_key(row)
            if reason:
                reasons[reason] += 1
                continue
            groups[key].append(row)
            if (row.get("duplicate_identity") is not False
                    or row.get("is_subtotal") is True
                    or row["source_fields"].get("is_subtotal") is True):
                blocked.add(key)
                reasons["DUPLICATE_OR_SUBTOTAL"] += 1
        for key, group in groups.items():
            if len(group) != 1:
                blocked.add(key)
                reasons["DUPLICATE_COMPARISON_IDENTITY"] += 1
        buckets.append(groups)
    left, right = buckets
    common = (left.keys() & right.keys()) - blocked
    unmatched = len(left.keys() ^ right.keys())
    if unmatched:
        reasons["UNMATCHED_AREA_CROP_PERIOD_ROUND_METRIC_UNIT"] = unmatched
    if not overlap:
        reasons["NO_OVERLAPPING_PROVINCES"] = 1
    areas = []
    for key in sorted(common):
        plan, actual = left[key][0], right[key][0]
        pv, pe = _number(plan.get("numeric_values", {}).get(plan["comparison_context"]["value_key"]))
        av, ae = _number(actual.get("numeric_values", {}).get(actual["comparison_context"]["value_key"]))
        ratio = None
        if pe or ae:
            status = (pe + "_PLAN_VALUE") if pe else (ae + "_ACTUAL_VALUE")
        elif pv == 0:
            status = "ZERO_PLAN_DENOMINATOR"
        else:
            ratio = av / pv
            status = "RECONCILED" if math.isfinite(ratio) else "INVALID_RATIO"
            if status != "RECONCILED":
                ratio = None
        if status != "RECONCILED":
            reasons[status] += 1
        grain, area, crop, period, round_id, metric, unit = key
        areas.append({"province_code":plan["source_fields"]["province_code"],
                      "province_name":plan["source_fields"].get("province_name"),
                      "crop_year":crop_year, "season":season, "metric_group":metric,
                      "native_spatial_grain":grain, "native_area_code":area,
                      "crop_identity":crop, "period_id":period, "round_id":round_id,
                      "plan_value":pv, "actual_value":av, "plan_unit":unit, "actual_unit":unit,
                      "status":status, "achievement_ratio":ratio,
                      "diagnostic_reason":None if status == "RECONCILED" else status})
    possible = any(row["status"] == "RECONCILED" for row in areas)
    status = "INCOMPARABLE" if not possible else ("PARTIALLY_RECONCILED" if reasons else "RECONCILED_MATCHED_ROWS")
    note = (f"No overlapping provinces between {season} plan {pp} and results {ap}. " if not overlap else "")
    note += "Only identical verified native rows may be compared; no national aggregate ratio."
    crops = sorted({key[2] for key in common})
    return {"season":season, "crop_year":crop_year, "overall_status":status,
            "comparison_status":status, "diagnostic_summary":note, "reconciliation_note":note,
            "crop_group":crops[0] if len(crops) == 1 else "unverified_or_multiple",
            "plan_record_count":len(plans), "result_record_count":len(actuals),
            "plan_provinces":pp, "result_provinces":ap,
            "planned_provinces":pp, "actual_provinces":ap,
            "overlapping_provinces":overlap, "area_reconciliations":areas,
            "blocking_reasons":dict(sorted(reasons.items())),
            "reconciliation_possible":possible, "scope":"verified_native_rows_only_not_national_coverage"}


def audit_national_plan_actual_reconciliation(root_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Read selected current-run resources and write only the private audit JSON."""
    root = root_dir or ROOT
    local = (root / "data/local").resolve()
    p0 = json.loads((local / "doae-p0/p0-run.json").read_text(encoding="utf-8"))
    def load_staged(dataset, schema, year):
        candidates = [r["staging"] for r in p0["results"]
                      if r["staging"]["dataset"] == dataset
                      and r["staging"]["schema"] == schema
                      and year in r["staging"].get("years_be_source", [])]
        # ponytail: one reviewed resource per dataset/year; require explicit partitions before allowing more.
        if len(candidates) != 1:
            raise ValueError("Missing or ambiguous current resource for dataset/schema/year")
        staging = candidates[0]
        path = (Path(staging["output"]) / "records.jsonl").resolve()
        if not path.is_relative_to(local):
            raise ValueError("Staging must remain within the local data directory")
        expected = staging.get("output_sha256", {}).get("records.jsonl")
        with path.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                raise ValueError("Current staging checksum mismatch")
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
        if any(row.get("resource_id") != staging["resource_id"] or row.get("schema") != schema for row in rows):
            raise ValueError("Rows do not match the selected current resource")
        return rows, staging["resource_id"]
    result = {"status":"success", "audit_version":3,
              "title":"DOAE Actual vs Plan Seasonal Reconciliation Audit", "audited_crop_year":"2569"}
    for name, season, plan_dataset, actual_dataset in [
        ("rainy_season","RAINY","rainy-season-crop-plan","rainy-season-crop-result"),
        ("dry_season","DRY","plan_dryplant","dry-season-crop-result"),
    ]:
        plans, plan_id = load_staged(plan_dataset, "dryplant_subdistrict", "2569")
        actuals, actual_id = load_staged(actual_dataset, "moac_planting", "2569")
        out = reconcile_seasonal_plan_and_actual(plans, actuals, season, "2569")
        out["selected_resource_ids"] = {"plan":plan_id, "actual":actual_id}
        result[name] = out
    result["governance_guarantees"] = [
        "No comparison without an explicit verified native-grain/crop/period/round/metric/unit contract.",
        "No subtotal, duplicate identity, missing-as-zero, or cross-row aggregation.",
        "Missing values and zero-denominator ratios remain null; absence never means no assistance.",
    ]
    (local / "probes/plan-actual-reconciliation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    return result
