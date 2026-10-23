"""CLI runner and audit for National Agricultural Project Register."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.project_register import audit_project_register


def main():
    result = audit_project_register(ROOT)
    projects = result["projects"]

    print("=" * 70)
    print(" NATIONAL AGRICULTURE DATA CENTER: PROJECT REGISTER AUDIT")
    print("=" * 70)
    print(f"Total Registered Cross-Agency Projects: {result['registered_projects_count']}")
    print("-" * 70)
    for p in projects:
        print(f"Project ID: {p['project_id']}")
        print(f"  Name:     {p['project_name_th']}")
        print(f"  Agency:   {p['managing_agency']} | Year: {p['fiscal_year']} | Status: {p['status']}")
        print(f"  Type:     {p['intervention_type']} | Problem: {p['target_problem']}")
        print(f"  Area:     Grain: {p['target_area_grain']} | Target Codes: {len(p['target_area_codes'])} areas")
        if p.get("budget_allocated_baht") is not None:
            print(f"  Budget:   {p['budget_allocated_baht']:,.2f} Baht (Spent: {(p.get('budget_spent_baht') or 0):,.2f} Baht)")
        if p.get("actual_households") is not None:
            print(f"  Impact:   {p['actual_households']:,} households | {(p.get('actual_area_rai') or 0):,.2f} rai")
        print("-" * 70)

    print(f"Register status: {result['register_status']}")
    print(f"Candidate source: {result['candidate_source']}")
    print("=" * 70)
    print("Report written to data/local/probes/project-register-audit.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
