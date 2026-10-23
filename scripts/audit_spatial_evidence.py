"""CLI runner for Spatial Problem Evidence and Intervention Matching Audit."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.spatial_evidence import audit_spatial_evidence


def main():
    result = audit_spatial_evidence(ROOT)
    status_breakdown = result["intervention_status_breakdown"]
    problems_breakdown = result["identified_problems_breakdown"]
    gaps = result["unaddressed_gap_provinces"]

    print("=" * 70)
    print(" NATIONAL AGRICULTURE DATA CENTER: SPATIAL EVIDENCE AUDIT")
    print("=" * 70)
    print(f"Total Provinces Audited: {result['total_provinces_audited']}")
    print("-" * 70)
    print("Identified Problem Types Across Provinces:")
    for prob, cnt in problems_breakdown.items():
        print(f"  - {prob:<28}: {cnt:>2} provinces")
    print("-" * 70)
    print("Policy Intervention Status Breakdown:")
    for status, cnt in status_breakdown.items():
        print(f"  - {status:<28}: {cnt:>2} provinces")
    print("-" * 70)
    print(f"Unaddressed Policy Gap Provinces ({len(gaps)} provinces):")
    for g in gaps[:10]:
        print(f"  [{g['province_code']}] {g['province_name_th']}: {g['problems']}")
        print(f"      Diagnostic: {g['diagnostic_notes']}")
    if len(gaps) > 10:
        print(f"  ... and {len(gaps) - 10} more gap provinces documented in audit probe")
    print("=" * 70)
    print("Audit report written to data/local/probes/spatial-evidence-audit.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
