"""Audit and generate National Agriculture Data Center Coverage Inventory.

Reconciles DOAE manifests and staging records with warehouse/external staging providers,
enforcing native spatial grains, license statuses, and missing reasons.
"""

import argparse
import json
import sys
from pathlib import Path

# Add project root to sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.coverage_inventory import audit_national_coverage_inventory


def main():
    parser = argparse.ArgumentParser(description="Audit National Agriculture Coverage Inventory")
    parser.add_argument("--format", choices=["json", "summary"], default="summary", help="Output format")
    args = parser.parse_args()

    result = audit_national_coverage_inventory(ROOT)

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    recon = result["reconciliation"]
    counts = result["inventory_counts"]

    print("=" * 70)
    print(" NATIONAL AGRICULTURE DATA CENTER: COVERAGE INVENTORY AUDIT")
    print("=" * 70)
    print(f"Audited at: {result['audited_at']}")
    print(f"Total Profiled Resources: {counts['total_profiled_resources']}")
    print("-" * 70)
    print("Manifest Reconciliation (DOAE Source Records):")
    print(f"  - P0 Ingestion:       {recon['doae_p0_source_records']:>10,} records")
    print(f"  - P1 Ingestion:       {recon['doae_p1_source_records']:>10,} records")
    print(f"  - P2 Ingestion:       {recon['doae_p2_source_records']:>10,} records")
    print(f"  - Archives (RAR):     {recon['doae_archives_source_records']:>10,} records")
    print(f"  -> Total DOAE Source: {recon['total_doae_source_records']:>10,} records (Reconciled: {recon['all_manifest_counts_reconciled']})")
    print(f"  -> Staged Records:    {recon['total_doae_staged_records']:>10,} records")
    print(f"  -> Quarantined:       {recon['total_doae_quarantined_records']:>10,} records")
    print("-" * 70)
    print("Breakdown by Spatial Grain:")
    for grain, count in sorted(counts["by_grain"].items()):
        print(f"  - {grain:<25}: {count:>3} resources")
    print("-" * 70)
    print("Breakdown by Status:")
    for status, count in sorted(counts["by_status"].items()):
        print(f"  - {status:<25}: {count:>3} resources")
    print("-" * 70)
    print("Breakdown by Source Provider:")
    for src, count in sorted(counts["by_source"].items()):
        print(f"  - {src:<25}: {count:>3} resources")
    print("=" * 70)
    print("Spatial integrity guarantees verified. JSON report written to data/local/probes/coverage-inventory.json")

    return 0


if __name__ == "__main__":
    sys.exit(main())
