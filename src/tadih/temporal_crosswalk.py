"""Temporal Administrative Crosswalk and Resolution Module for Thailand Core.

Resolves documented historical, administrative, and spatial grain anomalies:
1. Galyani Vadhana (Chiang Mai 5025): Resolves code rotation between DOAE legacy codes and DOPA 2023.
2. Bang Bon (Bangkok 105001): Handles the 2017 split into Bang Bon Nuea (105002) and Bang Bon Tai (105003).
3. Test/Mock exclusions (Trang dummy 'xxxxxxxx', mock RT.01-02).
4. Grain disambiguation for unified data: separates 1,320 province rows and 13,504 district rows.
5. Rollup eligibility gating: enforces additive metrics, valid temporal ranges, and non-subtotal rows.
"""

from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple


# Known administrative splits and renumberings with temporal boundaries
GALYANI_VADHANA_NAME_TO_DOPA = {
    "แจ่มหลวง": "502503",
    "บ้านจันทร์": "502501",
    "แม่แดด": "502502",
}

GALYANI_VADHANA_SOURCE_CODE_TO_NAME = {
    "502501": "แจ่มหลวง",
    "502502": "บ้านจันทร์",
    "502503": "แม่แดด",
}

BANG_BON_HISTORICAL_CODE = "105001"
BANG_BON_SPLIT_DATE = "2017-07-26"  # B.E. 2560-07-26 (Split into 105002, 105003)

ADDITIVE_METRICS = {
    "planted_area", "harvested_area", "damaged_area", "production",
    "planned_area_rai", "planned_households", "household_count",
    "produce_total_harvest", "total_yield"
}

NON_ADDITIVE_METRICS = {
    "yield", "yield_per_rai", "produce_yield_per_rai", "price",
    "market_price", "produce_price_avg", "farmgate_price",
    "reservoir_percent_storage", "vi_quality", "pixel_reliability",
    "capacity_ratio", "ndvi"
}


@dataclass(frozen=True)
class SpatialResolution:
    original_code: Optional[str]
    resolved_province_code: Optional[str]
    resolved_district_code: Optional[str]
    resolved_subdistrict_code: Optional[str]
    admin_grain: str
    resolution_status: str
    provenance_note: str
    rollup_eligible: bool
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None


def resolve_administrative_anomaly(
    province_code: Optional[str],
    district_code: Optional[str],
    subdistrict_code: Optional[str],
    province_name: str,
    district_name: str,
    subdistrict_name: str,
    metric_name: Optional[str] = None,
    source_period_year: Optional[int] = None,
    is_subtotal: bool = False,
) -> SpatialResolution:
    """Resolve known administrative anomalies and evaluate rollup eligibility."""
    p_name = province_name.strip()
    d_name = district_name.strip()
    s_name = subdistrict_name.strip()

    # 1. Check for dummy test row in Trang
    if "xxxx" in s_name.lower() or subdistrict_code == "920414":
        return SpatialResolution(
            original_code=subdistrict_code,
            resolved_province_code=None,
            resolved_district_code=None,
            resolved_subdistrict_code=None,
            admin_grain="invalid_test_record",
            resolution_status="quarantined_test_record",
            provenance_note="Trang dummy subdistrict xxxxxxxx excluded from administrative hierarchy",
            rollup_eligible=False,
        )

    # 2. Check for Galyani Vadhana (5025) code-name rotation conflict
    if "กัลยาณิวัฒนา" in d_name and s_name in GALYANI_VADHANA_NAME_TO_DOPA:
        dopa_code = GALYANI_VADHANA_NAME_TO_DOPA[s_name]
        is_additive = metric_name in ADDITIVE_METRICS if metric_name else True
        can_rollup = is_additive and not is_subtotal

        return SpatialResolution(
            original_code=subdistrict_code,
            resolved_province_code="50",
            resolved_district_code="5025",
            resolved_subdistrict_code=dopa_code,
            admin_grain="subdistrict",
            resolution_status="resolved_dopa_rotation",
            provenance_note=(
                f"Galyani Vadhana legacy DOAE code {subdistrict_code} remapped to DOPA 2023 code {dopa_code} "
                f"based on canonical subdistrict name '{s_name}'"
            ),
            rollup_eligible=can_rollup,
            valid_from="2009-12-26",  # Galyani Vadhana established B.E. 2552
            valid_to=None,
        )

    # 3. Check for Bang Bon historical subdistrict (105001)
    if subdistrict_code == BANG_BON_HISTORICAL_CODE or (
        "บางบอน" in d_name and s_name == "บางบอน" and not any(sub in s_name for sub in ("เหนือ", "ใต้"))
    ):
        # Historical Bang Bon subdistrict retired on 2017-07-26
        # Can rollup to district 1050 and province 10 if source period is prior to or includes split date
        is_additive = metric_name in ADDITIVE_METRICS if metric_name else True
        if source_period_year is None:
            is_historical = True
        elif source_period_year > 2400:
            is_historical = source_period_year <= 2560
        else:
            is_historical = source_period_year <= 2017

        return SpatialResolution(
            original_code=BANG_BON_HISTORICAL_CODE,
            resolved_province_code="10",
            resolved_district_code="1050",
            resolved_subdistrict_code=None,  # Do not map to 105002 or 105003 to prevent false spatial assignment
            admin_grain="district_parent_fallback",
            resolution_status="temporal_parent_fallback",
            provenance_note=(
                "Historical subdistrict Bang Bon 105001 retired in 2017 (split into 105002 and 105003). "
                "Safely mapped to parent district 1050 without false attribution to new subdistricts."
            ),
            rollup_eligible=is_additive and is_historical and not is_subtotal,
            valid_from=None,
            valid_to=BANG_BON_SPLIT_DATE,
        )

    # 4. Check for mixed grain in unified data (province vs district vs subdistrict)
    has_p = bool(p_name or province_code)
    has_d = bool(d_name or district_code)
    has_s = bool(s_name or subdistrict_code)

    if has_p and not has_d and not has_s:
        # Province-level record (e.g. 1,320 rows in province_unified_data_10)
        p_code = (province_code or "").strip()
        is_additive = metric_name in ADDITIVE_METRICS if metric_name else True
        return SpatialResolution(
            original_code=p_code or None,
            resolved_province_code=p_code or None,
            resolved_district_code=None,
            resolved_subdistrict_code=None,
            admin_grain="province",
            resolution_status="native_province_grain",
            provenance_note="Native provincial aggregate record; not an incomplete subdistrict",
            rollup_eligible=is_additive and not is_subtotal,
        )

    if has_d and not has_s:
        # District-level record (e.g. 13,504 rows in province_unified_data_10 where district is given)
        d_code = (district_code or "").strip()
        p_code = (province_code or "").strip() or (d_code[:2] if len(d_code) >= 2 else None)
        is_additive = metric_name in ADDITIVE_METRICS if metric_name else True
        return SpatialResolution(
            original_code=d_code or None,
            resolved_province_code=p_code or None,
            resolved_district_code=d_code or None,
            resolved_subdistrict_code=None,
            admin_grain="district",
            resolution_status="native_district_grain",
            provenance_note="Native district-level record; not an incomplete subdistrict",
            rollup_eligible=is_additive and not is_subtotal,
        )

    # 5. Standard subdistrict hierarchy
    is_additive = metric_name in ADDITIVE_METRICS if metric_name else True
    can_rollup = is_additive and not is_subtotal and has_p and has_d and has_s

    return SpatialResolution(
        original_code=subdistrict_code,
        resolved_province_code=province_code,
        resolved_district_code=district_code,
        resolved_subdistrict_code=subdistrict_code,
        admin_grain="subdistrict",
        resolution_status="standard_hierarchy",
        provenance_note="Standard 3-level administrative hierarchy",
        rollup_eligible=can_rollup,
    )


def audit_unified_province_data_grain(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Audit and classify the 14,824 rows of province_unified_data_10 into true native grains."""
    province_rows = 0
    district_rows = 0
    other_rows = 0

    for r in rows:
        d_val = (r.get("district_name") or r.get("district_code") or r.get("Amphoe_Name") or "").strip()
        s_val = (r.get("subdistrict_name") or r.get("subdistrict_code") or r.get("Tambon_Name") or "").strip()

        if not d_val and not s_val:
            province_rows += 1
        elif d_val and not s_val:
            district_rows += 1
        else:
            other_rows += 1

    return {
        "total_rows": len(rows),
        "province_grain_rows": province_rows,
        "district_grain_rows": district_rows,
        "other_grain_rows": other_rows,
        "is_correctly_disambiguated": (province_rows == 1320 and district_rows == 13504 and other_rows == 0),
        "recommendation": "Preserve 1,320 rows at province grain and 13,504 rows at district grain without false subdistrict imputation.",
    }
