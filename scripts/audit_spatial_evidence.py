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
    print("Policy gap classification withheld: project targets and register completeness are unverified")
    print("=" * 70)
    print("Audit report written to data/local/probes/spatial-evidence-audit.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
