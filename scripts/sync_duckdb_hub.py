"""Synchronize National Agriculture Data Center assets into DuckDB warehouse.

Enforces typed storage and analytical views for:
1. National coverage inventory (59 resources)
2. Agricultural project register (verified project targets only)
3. Project spatial coverage
4. Spatial evidence items (disaster damage rai, water shortage risk)
5. Spatial evidence with unverified policy coverage until the register is complete
6. Plan vs actual reconciliation (fail-closed incomparable seasons)
"""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

import duckdb
from tadih.warehouse import connect, sync_national_hub_data


def main():
    parser = argparse.ArgumentParser(description="Synchronize DuckDB National Agriculture Data Center Hub")
    parser.add_argument("--db-path", default="data/local/tadih.duckdb", help="Path to DuckDB warehouse")
    args = parser.parse_args()

    db_path = ROOT / args.db_path
    print("=" * 70)
    print(" NATIONAL AGRICULTURE DATA CENTER: DUCKDB WAREHOUSE SYNC")
    print("=" * 70)
    print(f"Target DuckDB: {db_path}")

    db = connect(str(db_path))
    sync_res = sync_national_hub_data(db, root_dir=ROOT)

    print("-" * 70)
    print("Synchronized Records:")
    for k, v in sync_res.items():
        print(f"  - {k:<35}: {v:>6} records")

    print("-" * 70)
    print("Analytical Verification via DuckDB Views:")

    # 1. Unaddressed policy gaps
    gaps = db.execute("""
        SELECT province_code, province_name_th, identified_problems, flood_damage_rai, drought_damage_rai
        FROM v_unaddressed_policy_gaps
        LIMIT 5
    """).fetchall()
    gap_count = db.execute("SELECT COUNT(*) FROM v_unaddressed_policy_gaps").fetchone()[0]
    print(f"\n  [v_unaddressed_policy_gaps] Classified Provinces: {gap_count} (register completeness unverified)")
    print("  Classified Provinces by Damaged Rai:")
    for row in gaps:
        print(f"    * [{row[0]}] {row[1]:<15} | ปัญหา: {row[2]:<18} | น้ำท่วม: {row[3]:>10,.1f} ไร่ | แล้ง: {row[4]:>10,.1f} ไร่")

    # 2. Project summary
    proj_summary = db.execute("""
        SELECT project_id, project_name_th, managing_agency, budget_allocated_baht, targeted_provinces_count
        FROM v_project_intervention_summary
    """).fetchall()
    print(f"\n  [v_project_intervention_summary] Registered Projects: {len(proj_summary)}")
    for r in proj_summary:
        b_str = f"{r[3]:,.0f} THB" if r[3] is not None else "N/A"
        print(f"    * [{r[0]}] {r[1][:32]:<32} | {r[2]} | งบ: {b_str:<15} | เป้าหมาย: {r[4]} จว.")

    # 3. National coverage
    cov_summary = db.execute("""
        SELECT source_id, data_grain, resource_count, total_source_records
        FROM v_national_coverage_overview
        LIMIT 5
    """).fetchall()
    print(f"\n  [v_national_coverage_overview] Top Sources by Record Count:")
    for r in cov_summary:
        print(f"    * {r[0]:<10} | Grain: {r[1]:<12} | {r[2]:>2} resources | {r[3]:>10,} source records")

    # 4. Master Provincial National Intelligence
    total_provs = db.execute("SELECT COUNT(*) FROM v_provincial_national_intelligence").fetchone()[0]
    print(f"\n  [v_provincial_national_intelligence] Total Provinces Linked: {total_provs}/77")
    print("  Water, satellite, climatology and station metrics withheld pending source-grain/unit/time review")

    # Save probe
    from datetime import datetime, timezone
    audit_data = {
        "status": "success",
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "database_path": str(db_path),
        "synced_records": sync_res,
        "total_provinces_linked": total_provs,
        "unaddressed_gap_provinces_count": gap_count if len(proj_summary) else None,
        "policy_coverage_status": "UNVERIFIED_INCOMPLETE_PROJECT_REGISTER" if not proj_summary else "PARTIAL_REGISTER",
        "external_metric_status": "WITHHELD_PENDING_SOURCE_REVIEW",
        "registered_projects_count": len(proj_summary),
        "views": [
            "v_unaddressed_policy_gaps",
            "v_project_intervention_summary",
            "v_national_coverage_overview",
            "v_provincial_natural_water_security",
            "v_satellite_flood_rice_impact",
            "v_provincial_recent_weather",
            "v_provincial_flood_risk_forecast",
            "v_provincial_national_intelligence",
        ]
    }
    out_probe = ROOT / "data/local/probes/warehouse-audit.json"
    out_probe.write_text(json.dumps(audit_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nSaved warehouse audit probe to data/local/probes/warehouse-audit.json")
    print("=" * 70)


if __name__ == "__main__":
    main()
