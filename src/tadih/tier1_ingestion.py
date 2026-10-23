"""Tier-1 data ingestion pipeline for Open Government Data and CKAN.

Covers:
1. DOAE Master Crop & Breed Registry (831 records) from opend.data.go.th
2. HII monthly flood-risk rows with unverified forecast horizon from data.hii.or.th
"""

import csv
from datetime import datetime, timezone
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import urllib.request

from tadih.catalog import ROOT
from tadih.opend_client import query_opend_api

DOAE_CROP_MASTER_RESOURCE_ID = "4e17f8e4-e3f9-4c44-a642-e3c115b4830c"
HII_FLOOD_RISK_CSV_URL = (
    "https://data.hii.or.th/dataset/e007d93b-5a9b-4d6f-9090-5cdd26922aa7/"
    "resource/50e6987b-c01f-4fd5-99e2-2bccf9f18268/download/monthly-flood-risk-area.csv"
)


def fetch_doae_crop_master(
    api_key: Optional[str] = None,
    output_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Fetch DOAE 831 master crops and breeds from opend.data.go.th."""
    target_path = output_path or (ROOT / "data/local/production/doae_crop_master.json")
    target_path.parent.mkdir(parents=True, exist_ok=True)

    result = query_opend_api(
        "get-ckan/datastore_search",
        params={"resource_id": DOAE_CROP_MASTER_RESOURCE_ID, "limit": 1000},
        api_key=api_key,
    )
    if result.get("status") != "success":
        raise RuntimeError(f"Failed to fetch DOAE crop master: {result.get('message')} ({result.get('status_code')})")

    raw_records = result.get("data", {}).get("result", {}).get("records", [])
    now_iso = datetime.now(timezone.utc).isoformat()

    normalized: List[Dict[str, Any]] = []
    for r in raw_records:
        normalized.append({
            "crop_code": str(r.get("plant_code") or "").strip(),
            "crop_name_th": str(r.get("plant_name") or "").strip(),
            "crop_group_code": str(r.get("group_plant_code") or "").strip(),
            "crop_group_name_th": str(r.get("group_plant_name") or "").strip(),
            "breed_code": str(r.get("breed_code") or "").strip(),
            "breed_name_th": str(r.get("breed_name") or "").strip(),
            "breed_characteristic": str(r.get("breed_characteristic") or "").strip(),
            "retrieved_at": now_iso,
            "license_status": "pending",
        })

    payload = {
        "metadata": {
            "source": "opend.data.go.th",
            "resource_id": DOAE_CROP_MASTER_RESOURCE_ID,
            "title": "รายชื่อพืชระบบสารสนเทศผลผลิตทางด้านการเกษตร กรมส่งเสริมการเกษตร",
            "total_records": len(normalized),
            "retrieved_at": now_iso,
            "license_status": "pending",
        },
        "records": normalized,
    }

    target_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def fetch_hii_flood_risk(output_path: Optional[Path] = None) -> Dict[str, Any]:
    """Fetch monthly risk rows; the forecast horizon has not been verified."""
    target_path = output_path or (ROOT / "data/local/satellite/hii_monthly_flood_risk.json")
    target_path.parent.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(
        HII_FLOOD_RISK_CSV_URL,
        headers={"User-Agent": "TADIH-NationalAgriIntelligence/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode("utf-8-sig", errors="replace")

    reader = csv.DictReader(io.StringIO(content))
    now_iso = datetime.now(timezone.utc).isoformat()

    normalized: List[Dict[str, Any]] = []
    for r in reader:
        prov_code = str(r.get("PROV_CODE") or "").strip()
        if prov_code.isdigit():
            prov_code = prov_code.zfill(2)

        geocode = str(r.get("GEOCODE") or "").strip()
        month_str = str(r.get("Month") or "").strip()
        month_val = int(month_str) if month_str.isdigit() else None

        count_str = str(r.get("COUNT 17 YEAR") or "").strip()
        count_val = int(count_str) if count_str.isdigit() else None

        normalized.append({
            "month": month_val,
            "dopa_tambon_code": geocode,
            "tambon_name_th": str(r.get("TAMBON_T") or "").strip(),
            "dopa_amphoe_code": str(r.get("AMPHOE_CODE") or "").strip(),
            "amphoe_name_th": str(r.get("AMPHOE_T") or "").strip(),
            "dopa_province_code": prov_code,
            "province_name_th": str(r.get("PROV_T") or "").strip(),
            "recurrence_17yr_count": count_val,
            "risk_criteria": str(r.get("CRITERIA") or "").strip(),
            "risk_level": str(r.get("RISK") or "").strip(),
            "source_agency": "HII",
            "retrieved_at": now_iso,
            "license_status": "pending",
        })

    payload = {
        "metadata": {
            "source": "data.hii.or.th",
            "title": "รายงานคาดการณ์พื้นที่เสี่ยงอุทกภัยรายเดือนระดับตำบล สถาบันสารสนเทศทรัพยากรน้ำ (สสน.)",
            "total_records": len(normalized),
            "retrieved_at": now_iso,
            "license_status": "pending",
            "temporal_interpretation": "month_of_year_with_17_year_count_forecast_horizon_unverified",
        },
        "records": normalized,
    }

    target_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def sync_tier1_to_warehouse(db, root_dir: Optional[Path] = None) -> Dict[str, int]:
    """Sync Tier-1 DOAE crop master and HII flood risk into DuckDB warehouse."""
    root = Path(root_dir) if root_dir else ROOT

    # 1. Initialize schema
    db.execute("""
        CREATE TABLE IF NOT EXISTS dim_crop_master (
            crop_code VARCHAR,
            crop_name_th VARCHAR,
            crop_group_code VARCHAR,
            crop_group_name_th VARCHAR,
            breed_code VARCHAR,
            breed_name_th VARCHAR,
            breed_characteristic VARCHAR,
            retrieved_at VARCHAR,
            license_status VARCHAR,
            PRIMARY KEY(breed_code)
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_flood_risk_forecast (
            month INTEGER,
            dopa_tambon_code VARCHAR,
            tambon_name_th VARCHAR,
            dopa_amphoe_code VARCHAR,
            amphoe_name_th VARCHAR,
            dopa_province_code VARCHAR,
            province_name_th VARCHAR,
            recurrence_17yr_count INTEGER,
            risk_criteria VARCHAR,
            risk_level VARCHAR,
            source_agency VARCHAR,
            retrieved_at VARCHAR,
            license_status VARCHAR
        )
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_provincial_flood_risk_forecast AS
        SELECT
            dopa_province_code AS province_code,
            province_name_th,
            month,
            COUNT(CASE WHEN risk_level = 'เสี่ยงสูง' THEN 1 END) AS high_risk_tambons,
            COUNT(CASE WHEN risk_level = 'เสี่ยงปานกลาง' THEN 1 END) AS medium_risk_tambons,
            COUNT(CASE WHEN risk_level = 'เสี่ยงต่ำ' THEN 1 END) AS low_risk_tambons,
            COUNT(*) AS total_risk_tambon_events
        FROM fact_flood_risk_forecast
        GROUP BY dopa_province_code, province_name_th, month
        ORDER BY high_risk_tambons DESC, medium_risk_tambons DESC
    """)

    results = {"dim_crop_master": 0, "fact_flood_risk_forecast": 0}

    # 2. Populate dim_crop_master
    crop_path = root / "data/local/production/doae_crop_master.json"
    if crop_path.exists():
        data = json.loads(crop_path.read_text(encoding="utf-8"))
        records = data.get("records", [])
        crop_rows = [
            (
                r["crop_code"],
                r["crop_name_th"],
                r["crop_group_code"],
                r["crop_group_name_th"],
                r["breed_code"],
                r["breed_name_th"],
                r["breed_characteristic"],
                r["retrieved_at"],
                r["license_status"],
            )
            for r in records
        ]
        db.execute("BEGIN TRANSACTION")
        db.execute("DELETE FROM dim_crop_master")
        db.executemany(
            "INSERT INTO dim_crop_master VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            crop_rows,
        )
        db.execute("COMMIT")
        results["dim_crop_master"] = len(records)

    # 3. Populate fact_flood_risk_forecast
    flood_path = root / "data/local/satellite/hii_monthly_flood_risk.json"
    if flood_path.exists():
        data = json.loads(flood_path.read_text(encoding="utf-8"))
        records = data.get("records", [])
        flood_rows = [
            (
                r["month"],
                r["dopa_tambon_code"],
                r["tambon_name_th"],
                r["dopa_amphoe_code"],
                r["amphoe_name_th"],
                r["dopa_province_code"],
                r["province_name_th"],
                r["recurrence_17yr_count"],
                r["risk_criteria"],
                r["risk_level"],
                r["source_agency"],
                r["retrieved_at"],
                r["license_status"],
            )
            for r in records
        ]
        db.execute("BEGIN TRANSACTION")
        db.execute("DELETE FROM fact_flood_risk_forecast")
        db.executemany(
            "INSERT INTO fact_flood_risk_forecast VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            flood_rows,
        )
        db.execute("COMMIT")
        results["fact_flood_risk_forecast"] = len(records)

    return results
