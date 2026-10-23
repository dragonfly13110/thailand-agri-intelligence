"""Script to ingest Tier-1 external datasets and sync into DuckDB warehouse."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.warehouse import connect
from tadih.tier1_ingestion import (
    fetch_doae_crop_master,
    fetch_hii_flood_risk,
    sync_tier1_to_warehouse,
)


def main():
    print("=" * 75)
    print(" TADIH NATIONAL AGRICULTURE HUB: TIER-1 DATASET INGESTION")
    print("=" * 75)

    print("\n[1/3] กำลังดึงข้อมูลรหัสพืชและสายพันธุ์มาตรฐาน DOAE (831 รายการ)...")
    try:
        crop_res = fetch_doae_crop_master()
        print(f"    [+] ดึงข้อมูลสำเร็จ: {crop_res['metadata']['total_records']} รายการ")
    except Exception as e:
        print(f"    [-] เกิดข้อผิดพลาดในการดึงรหัสพืช: {e}")

    print("\n[2/3] กำลังดึงข้อมูลรายงานคาดการณ์พื้นที่เสี่ยงอุทกภัยรายเดือนระดับตำบล สสน. (HII)...")
    try:
        flood_res = fetch_hii_flood_risk()
        print(f"    [+] ดึงข้อมูลสำเร็จ: {flood_res['metadata']['total_records']:,} รายการ")
    except Exception as e:
        print(f"    [-] เกิดข้อผิดพลาดในการดึงข้อมูลน้ำท่วม สสน.: {e}")

    print("\n[3/3] กำลังนำเข้าข้อมูลสู่ DuckDB Warehouse (data/local/tadih.duckdb)...")
    db_path = ROOT / "data/local/tadih.duckdb"
    db = connect(str(db_path))

    sync_res = sync_tier1_to_warehouse(db, root_dir=ROOT)
    print(f"    [+] dim_crop_master: {sync_res['dim_crop_master']:,} rows")
    print(f"    [+] fact_flood_risk_forecast: {sync_res['fact_flood_risk_forecast']:,} rows")

    # Diagnostic check on view
    top_flood_provinces = db.execute("""
        SELECT province_code, province_name_th, month, high_risk_tambons
        FROM v_provincial_flood_risk_forecast
        WHERE month = 9
        ORDER BY high_risk_tambons DESC
        LIMIT 5
    """).fetchall()

    print("\n[+] ตัวอย่างการคาดการณ์พื้นที่เสี่ยงอุทกภัยสูง เดือนกันยายน (Top 5 จังหวัด):")
    for r in top_flood_provinces:
        print(f"    - [{r[0]}] {r[1]}: ตำบลเสี่ยงสูง {r[3]:,} ตำบล")

    db.close()
    print("\n" + "=" * 75)
    print(" INGESTION & SYNCHRONIZATION COMPLETE")
    print("=" * 75)
    return 0


if __name__ == "__main__":
    sys.exit(main())
