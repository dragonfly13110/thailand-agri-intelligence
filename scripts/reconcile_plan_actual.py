"""CLI runner and audit for DOAE Actual vs. Plan Reconciliation."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.plan_reconciliation import audit_national_plan_actual_reconciliation


def main():
    result = audit_national_plan_actual_reconciliation(ROOT)
    rainy = result["rainy_season"]
    dry = result["dry_season"]

    print("=" * 70)
    print(" NATIONAL AGRICULTURE DATA CENTER: ACTUAL VS. PLAN RECONCILIATION")
    print("=" * 70)
    print("Rainy Season 2569:")
    print(f"  - Status:            {rainy['overall_status']}")
    print(f"  - Plan records:      {rainy['plan_record_count']:,} rows (Provinces: {rainy['plan_provinces']})")
    print(f"  - Result records:    {rainy['result_record_count']:,} rows (Provinces: {rainy['result_provinces']})")
    print(f"  - Overlap provinces: {rainy['overlapping_provinces']}")
    print(f"  - Diagnostic:        {rainy['diagnostic_summary']}")
    print("-" * 70)
    print("Dry Season 2569:")
    print(f"  - Status:            {dry['overall_status']}")
    print(f"  - Plan records:      {dry['plan_record_count']:,} rows (Provinces: {dry['plan_provinces']})")
    print(f"  - Result records:    {dry['result_record_count']:,} rows (Provinces: {dry['result_provinces']})")
    print(f"  - Overlap provinces: {dry['overlapping_provinces']}")
    print(f"  - Diagnostic:        {dry['diagnostic_summary']}")
    print("=" * 70)
    print("Report written to data/local/probes/plan-actual-reconciliation.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
