"""Immutable, checksummed CSV/Parquet snapshots for Power BI Import."""

import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import uuid

from .catalog import load_provinces, load_sources
from .quality import FIELDS, timestamp

ROOT = Path(__file__).resolve().parents[2]
BANGKOK = timezone(timedelta(hours=7))
MEASURE_CATEGORY = {"production": "AG02", "planted_area": "AG02", "harvest_area": "AG02", "yield": "AG02",
    "price": "AG03", "rainfall": "AG07", "temperature_max": "AG07", "reference_et0": "AG07",
    "water_level": "AG08", "reservoir_storage": "AG08", "ndvi": "AG11", "ndmi": "AG11"}
SNAPSHOT_FILES = {"dim_area.csv", "dim_source.csv", "dim_category.csv", "fact_observation.csv",
    "fact_observation.parquet", "fact_data_coverage.csv", "fact_category_coverage.csv", "decision_cards.json"}


def _csv(path, fields, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value
                             for key, value in row.items()})


def build_exports(db, output_dir, period=None, now=None, audience="public", evidence_dir=None):
    now = now or datetime.now(timezone.utc)
    period = period or now.astimezone(BANGKOK).strftime("%Y-%m")
    datetime.strptime(period, "%Y-%m")
    if audience not in {"public", "internal"}:
        raise ValueError("audience must be public or internal")
    sources, provinces = load_sources(), load_provinces()
    categories = json.loads((ROOT / "config/categories.json").read_text(encoding="utf-8"))
    snapshot = Path(output_dir) / (now.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    snapshot.mkdir(parents=True)
    # Filter AFTER choosing latest revision, so a new restriction cannot resurrect an older public row.
    publication_filter = "WHERE license_status = 'approved_public'" if audience == "public" else ""
    result = db.execute(f"SELECT * FROM latest_observations {publication_filter}")
    fields = [col[0] for col in result.description]
    facts = [dict(zip(fields, row)) for row in result.fetchall()]
    _csv(snapshot / "dim_area.csv", list(provinces[0]), provinces)
    _csv(snapshot / "dim_source.csv", sorted(set().union(*(row.keys() for row in sources))), sources)
    _csv(snapshot / "dim_category.csv", ["category_id", "name_th"], categories)
    _csv(snapshot / "fact_observation.csv", FIELDS, facts)
    parquet_path = str(snapshot / "fact_observation.parquet").replace("'", "''")
    db.execute(f"COPY (SELECT * FROM latest_observations {publication_filter}) TO '{parquet_path}' (FORMAT PARQUET)")
    coverage = []
    for source in sources:
        for province in provinces:
            rows = [row for row in facts if row["source_id"] == source["source_id"]
                    and row["area_code"] == province["area_code"] and row["spatial_support"] == "province"
                    and timestamp(row["observed_at"]).astimezone(BANGKOK).strftime("%Y-%m") == period and row["value"] is not None
                    and row["quality_flag"] in {"good", "valid"}]
            latest = max((r["observed_at"] for r in rows), default=None)
            target_days = source.get("freshness_days")
            freshness = "unknown" if latest is None or target_days is None else (
                "stale" if (now - timestamp(latest)).total_seconds() > target_days * 86400 else "recent")
            coverage.append({"source_dataset_id": source["source_id"], "area_code": province["area_code"],
                "period": period, "metric_type": "all_registered_measures", "status": "AVAILABLE" if rows else "UNVERIFIED",
                "expected_count": None, "actual_count": len(rows), "gap_count": None,
                "latest_observation_date": latest,
                "latest_publication_date": max((r["release_at"] for r in rows if r["release_at"]), default=None),
                "freshness_status": freshness, "data_grain": "province", "license_status": source.get("license_status", "pending"),
                "coverage_note": "Provider points, national values and catalog metadata do not establish province coverage",
                "missing_reason": None if rows else "No verified province aggregate imported for this source and period"})
    _csv(snapshot / "fact_data_coverage.csv", list(coverage[0]), coverage)
    category_coverage = []
    for province in provinces:
        for category in categories:
            available = {r["source_id"] for r in facts if r["area_code"] == province["area_code"]
                and r["spatial_support"] == "province" and r["value"] is not None and r["quality_flag"] in {"good", "valid"}
                and MEASURE_CATEGORY.get(r["measure"]) == category["category_id"]
                and timestamp(r["observed_at"]).astimezone(BANGKOK).strftime("%Y-%m") == period}
            category_coverage.append({"area_code": province["area_code"], "category_id": category["category_id"],
                "period": period, "status": "AVAILABLE" if available else "UNVERIFIED",
                "available_source_count": len(available), "expected_source_count": None})
    _csv(snapshot / "fact_category_coverage.csv", list(category_coverage[0]), category_coverage)
    from .decisions import evaluate_market, evaluate_water_risk
    cards = []
    ev_dir = Path(evidence_dir) if evidence_dir is not None else (ROOT / "data/local/evidence" if audience == "internal" else None)
    if ev_dir and ev_dir.exists():
        for card_file in sorted(ev_dir.glob("*.json")):
            try:
                card_data = json.loads(card_file.read_text(encoding="utf-8"))
                dec_id = card_data.get("decision_id")
                if dec_id == "D01":
                    cards.append(evaluate_market(card_data))
                elif dec_id == "D02":
                    cards.append(evaluate_water_risk(card_data))
            except Exception:
                pass
    if not cards:
        cards = [evaluate_water_risk({}), evaluate_market({})]
    (snapshot / "decision_cards.json").write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    files = [{"name": path.name, "bytes": path.stat().st_size,
              "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(snapshot.iterdir())]
    metadata = {"schema_version": "0.1.0", "generated_at": now.isoformat(), "period": period,
        "scope": "TH", "province_count": len(provinces), "category_count": len(categories),
        "audience": audience, "redistribution_allowed": audience == "public",
        "observation_count": len(facts), "public_observation_count": len(facts) if audience == "public" else 0,
        "province_source_available_count": sum(r["status"] == "AVAILABLE" for r in coverage),
        "forecast_status": "suppressed_no_approved_backtest", "files": files,
        "limitations": ["Source entries are discovery leads, not tested data contracts",
            "Source coverage groups imported measurements by provider; it is not a complete dataset inventory",
            "No district/subdistrict geometry or verified crop mask yet",
            "UNVERIFIED does not mean provider does not publish data",
            "Decision screening cards evaluated from local evidence files" if any(c.get("status") != "unknown" for c in cards) else "Decision examples remain unknown until compatible evidence is supplied"]}
    (snapshot / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return snapshot, metadata


def verify_exports(snapshot):
    snapshot = Path(snapshot)
    metadata = json.loads((snapshot / "metadata.json").read_text(encoding="utf-8"))
    records = metadata.get("files")
    if not isinstance(records, list) or len(records) != len(SNAPSHOT_FILES) or any(not isinstance(r, dict) for r in records):
        raise ValueError("snapshot manifest must list all expected tables exactly once")
    if {record.get("name") for record in records} != SNAPSHOT_FILES:
        raise ValueError("snapshot manifest has missing, duplicate or unexpected tables")
    for record in records:
        path = snapshot / record["name"]
        if (not re.fullmatch(r"[0-9a-f]{64}", str(record.get("sha256", ""))) or not path.is_file()
                or path.stat().st_size != record.get("bytes") or hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]):
            raise ValueError(f"snapshot integrity failure: {record['name']}")
    return metadata


def write_coverage_view(snapshot, output_path):
    """One coverage fact with display labels for the browser CSV connector."""
    snapshot = Path(snapshot)
    metadata = verify_exports(snapshot)
    if metadata.get("audience") != "public":
        raise ValueError("coverage view for public hosting requires a public snapshot")
    provinces = {row["area_code"]: row for row in load_provinces()}
    sources = {row["source_id"]: row for row in load_sources()}
    with (snapshot / "fact_data_coverage.csv").open(encoding="utf-8-sig", newline="") as handle:
        rows = [{"country": "Thailand", "province_code": r["area_code"], "province_name": provinces[r["area_code"]]["name_th"],
            "source_id": r["source_dataset_id"], "source_name": sources[r["source_dataset_id"]]["name"],
            "period": r["period"], "coverage_status": r["status"],
            "approved_observation_count": int(r["actual_count"]), "freshness_status": r["freshness_status"],
            "snapshot_generated_at": metadata["generated_at"],
            "coverage_note": "UNVERIFIED = ยังไม่ยืนยันข้อมูลรายจังหวัด; จำนวนแถวที่อนุมัติเผยแพร่ไม่ใช่ปริมาณผลผลิต"}
            for r in csv.DictReader(handle)]
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _csv(output_path, list(rows[0]), rows)
    return {"path": str(output_path.resolve()), "rows": len(rows), "audience": "public",
            "sha256": hashlib.sha256(output_path.read_bytes()).hexdigest()}
