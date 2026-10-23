"""Audit and apply temporal administrative resolution across DOAE geography signatures.

Resolves documented code-name rotations, historical splits, and mixed grains without hallucinating
new subdistrict assignments.
"""

from collections import Counter
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.temporal_crosswalk import resolve_administrative_anomaly


def audit_crosswalk():
    crosswalk_path = ROOT / "data/local/doae-geography/subdistrict-crosswalk.csv"
    if not crosswalk_path.exists():
        raise FileNotFoundError(f"Missing {crosswalk_path}")

    counts_by_resolution = Counter()
    records_by_resolution = Counter()
    resolved_rotations = 0
    resolved_splits = 0
    quarantined_dummies = 0
    disambiguated_unified_province = 0
    disambiguated_unified_district = 0
    standard_matches = 0

    with crosswalk_path.open(encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        for row in reader:
            count = int(row["source_record_count"])
            res = resolve_administrative_anomaly(
                province_code=row.get("source_province_code") or row.get("candidate_province_code"),
                district_code=row.get("source_district_code") or row.get("candidate_district_code"),
                subdistrict_code=row.get("source_subdistrict_code") or row.get("candidate_subdistrict_code"),
                province_name=row.get("source_province_name", ""),
                district_name=row.get("source_district_name", ""),
                subdistrict_name=row.get("source_subdistrict_name", ""),
            )
            counts_by_resolution[res.resolution_status] += 1
            records_by_resolution[res.resolution_status] += count

            if res.resolution_status == "resolved_dopa_rotation":
                resolved_rotations += count
            elif res.resolution_status == "temporal_parent_fallback":
                resolved_splits += count
            elif res.resolution_status == "quarantined_test_record":
                quarantined_dummies += count
            elif res.resolution_status == "native_province_grain":
                disambiguated_unified_province += count
            elif res.resolution_status == "native_district_grain":
                disambiguated_unified_district += count
            elif res.resolution_status == "standard_hierarchy":
                standard_matches += count

    audit_result = {
        "status": "success",
        "crosswalk_source": str(crosswalk_path.resolve()),
        "resolved_anomalies": {
            "galyani_vadhana_code_rotation_rows": resolved_rotations,
            "bang_bon_historical_split_rows": resolved_splits,
            "trang_dummy_quarantined_rows": quarantined_dummies,
            "unified_data_province_grain_rows": disambiguated_unified_province,
            "unified_data_district_grain_rows": disambiguated_unified_district,
        },
        "resolution_breakdown_by_records": dict(records_by_resolution),
        "resolution_breakdown_by_signatures": dict(counts_by_resolution),
        "all_known_anomalies_resolved": (
            resolved_rotations >= 947 and
            quarantined_dummies >= 1 and
            disambiguated_unified_province == 1320 and
            disambiguated_unified_district == 13653
        ),
    }

    out_path = ROOT / "data/local/probes/temporal-crosswalk-audit.json"
    out_path.write_text(json.dumps(audit_result, ensure_ascii=False, indent=2), encoding="utf-8")
    return audit_result


def main():
    result = audit_crosswalk()
    res = result["resolved_anomalies"]
    print("=" * 70)
    print(" TEMPORAL ADMINISTRATIVE CROSSWALK AUDIT")
    print("=" * 70)
    print(f"Galyani Vadhana Code Rotation Resolved: {res['galyani_vadhana_code_rotation_rows']:,} rows")
    print(f"Bang Bon Historical Split Handled:      {res['bang_bon_historical_split_rows']:,} rows")
    print(f"Trang Dummy Record Quarantined:         {res['trang_dummy_quarantined_rows']:,} rows")
    print(f"Unified Data Province Grain Disambiguated: {res['unified_data_province_grain_rows']:,} rows")
    print(f"Unified Data District Grain Disambiguated: {res['unified_data_district_grain_rows']:,} rows")
    print("-" * 70)
    print(f"All Known Anomalies Resolved: {result['all_known_anomalies_resolved']}")
    print("Report written to data/local/probes/temporal-crosswalk-audit.json")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
