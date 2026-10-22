"""Local-only DOAE crop production staging at the provider's original grain."""

import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .ingestion import trusted_ssl_context
from .catalog import load_provinces


SOURCE_URL = "https://ckan.doae.go.th/dataset/6cc09797-a60e-43ce-a646-65364a1333c3/resource/f9ab6055-6364-4f78-812e-15989e300979/download/1.-01-open01-2023-new.csv"
RESOURCE_ID = "f9ab6055-6364-4f78-812e-15989e300979"
MAX_BYTES = 50 * 1024 * 1024
LABELS = {
    "ปี": "source_year_be", "เดือน": "month", "จังหวัด": "province_name",
    "อำเภอ": "district_name", "ตำบล": "subdistrict_name", "กลุ่มพืช": "crop_group",
    "ชนิดพืช": "crop_type", "พันธุ์พืช": "variety_name", "รอบการปลูก": "planting_round",
}
MEASURES = {
    "เนื้อที่ปลูก (ไร่)": "planted_area_rai",
    "เนื้อที่เสียหาย (ไร่)": "damaged_area_rai",
    "เนื้อที่เก็บเกี่ยวผลผลิต(ไร่)": "harvested_area_rai",
    "ผลผลิตที่เก็บเกี่ยวได้ (กิโลกรัม)": "production_kg",
    "ผลผลิตเฉลี่ย(กิโลกรัม/ไร่)": "yield_kg_per_rai",
    "ราคาที่เกษตรกรขายได้เฉลี่ย (บาท/กิโลกรัม)": "farm_gate_thb_per_kg",
}
IDENTITY = ("year_ad", "month", "province_name", "district_name", "subdistrict_name", "crop_group", "crop_type", "variety_name", "planting_round")


def _digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def _json(path, payload):
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def fetch_doae_production(output_dir, *, refresh=False, opener=None):
    """Bounded fixed-resource download; failed downloads never replace snapshots."""
    if not isinstance(refresh, bool):
        raise ValueError("refresh must be a boolean")
    directory = Path(output_dir) / "doae_production_2023"
    directory.mkdir(parents=True, exist_ok=True)
    manifest_path = directory / "manifest.json"
    if manifest_path.exists() and not refresh:
        record = json.loads(manifest_path.read_text(encoding="utf-8"))
        checksum = record.get("sha256", "")
        if len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
            raise ValueError("invalid production checkpoint checksum")
        artifact = directory / (checksum + ".csv")
        if record.get("source_url") == SOURCE_URL and artifact.is_file() and _digest(artifact) == checksum:
            return {**record, "path": str(artifact.resolve()), "action": "skipped_verified"}
        raise ValueError("production checkpoint is missing, changed or corrupted; inspect before refresh")
    context = trusted_ssl_context() if opener is None else None
    def open_request(request):
        return urlopen(request, timeout=30, context=context) if opener is None else opener(request, timeout=30)
    with open_request(Request(SOURCE_URL, method="HEAD")) as response:
        content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
        length = response.headers.get("Content-Length")
        if content_type != "text/csv" or (length is not None and not 0 < int(length) <= MAX_BYTES):
            raise ValueError("production resource must be CSV and no larger than 50 MiB")
        head_length = int(length) if length is not None else None
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", dir=directory, delete=False, suffix=".part") as target:
            temporary = Path(target.name)
            digest, total = hashlib.sha256(), 0
            with open_request(Request(SOURCE_URL, headers={"User-Agent": "TADIH/0.1 bounded-production-ingest"})) as response:
                final_url = urlparse(response.geturl())
                if final_url.scheme != "https" or final_url.hostname != "ckan.doae.go.th":
                    raise ValueError("production resource redirected outside its approved HTTPS host")
                while chunk := response.read(min(65536, MAX_BYTES + 1 - total)):
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise ValueError("production resource exceeds 50 MiB")
                    target.write(chunk)
                    digest.update(chunk)
        if not total or (head_length is not None and total != head_length):
            raise ValueError("production download size differs from HEAD; retry or inspect provider revision")
        # Decode/schema errors must not establish a successful raw-data checkpoint.
        with temporary.open("r", encoding="utf-8-sig", newline="") as handle:
            header = next(csv.reader(handle), [])
        if len(header) != len(LABELS) + len(MEASURES) or set(header) != set(LABELS) | set(MEASURES):
            raise ValueError("production CSV header changed")
        checksum = digest.hexdigest()
        artifact = directory / (checksum + ".csv")
        if artifact.exists() and _digest(artifact) != checksum:
            raise ValueError("existing production artifact is corrupted")
        if artifact.exists():
            temporary.unlink()
        else:
            temporary.replace(artifact)
        record = {
            "source_id": "doae", "source_url": SOURCE_URL, "resource_id": RESOURCE_ID,
            "sha256": checksum, "bytes": total, "status": "success",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "license_status": "pending", "license_label": "Open Data Common; exact variant unresolved",
            "resource_label_year_ad": 2023, "data_kind": "official", "spatial_support": "source_admin_labels",
        }
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory, delete=False, suffix=".json") as handle:
            checkpoint = Path(handle.name)
            json.dump(record, handle, ensure_ascii=False, indent=2)
        checkpoint.replace(manifest_path)
        return {**record, "path": str(artifact.resolve()), "action": "fetched"}
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _number(value):
    token = value.strip()
    if token in {"", "-", "..", "N/A", "null"}:
        return None
    if "," in token and not re.fullmatch(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?", token):
        raise ValueError("invalid thousands grouping: " + token)
    try:
        number = Decimal(token.replace(",", ""))
    except InvalidOperation as exc:
        raise ValueError("invalid production number: " + token) from exc
    if not number.is_finite() or number < 0:
        raise ValueError("production measures must be finite, non-negative or missing")
    result = float(number)
    if not math.isfinite(result):
        raise ValueError("production number exceeds supported range")
    return result


def parse_production_row(raw, row_number, *, province_names=None):
    """Preserve exact provider labels; no geographic or commodity inference."""
    if set(raw) != set(LABELS) | set(MEASURES) or any(value is None for value in raw.values()):
        raise ValueError("production row has missing or unexpected columns")
    row = {field: raw[label].strip() for label, field in LABELS.items()}
    year_be, month = int(row["source_year_be"]), int(row["month"])
    if year_be not in {2566, 2567} or not 1 <= month <= 12:
        raise ValueError("resource must contain verified source years 2566/2567 and a valid month")
    if any(not row[field] for field in ("province_name", "district_name", "subdistrict_name", "crop_group", "crop_type")):
        raise ValueError("production administrative and crop labels must not be empty")
    if row["province_name"] not in (province_names if province_names is not None else {p["name_th"] for p in load_provinces()}):
        raise ValueError("province label is outside verified Thailand province names")
    row.update(source_year_be=year_be, year_ad=year_be - 543, month=month)
    row.update({field: _number(raw[label]) for label, field in MEASURES.items()})
    raw_hash = hashlib.sha256(json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    commodity = {field: row[field] for field in ("crop_group", "crop_type", "variety_name")}
    commodity_hash = hashlib.sha256(json.dumps(commodity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return {**row, "source_record_number": row_number, "source_row_hash": raw_hash, "commodity_id": "doae:" + commodity_hash[:24], "source_id": "doae", "resource_id": RESOURCE_ID, "license_status": "pending"}


def stage_doae_production(path, output_dir=None):
    """Atomically stage full rows and inventories; ambiguous identities cannot roll up."""
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError("production input must be a nonempty file at most 50 MiB")
    source_hash = _digest(path)
    output = Path(output_dir) if output_dir else path.parent / "staged"
    output.mkdir(parents=True, exist_ok=True)
    final = output / source_hash
    if final.exists():
        report = json.loads((final / "inventory.json").read_text(encoding="utf-8"))
        if (report.get("source_sha256") != source_hash or report.get("source_bytes") != path.stat().st_size
                or set(report.get("output_sha256", {})) != {"records.jsonl", "commodity_registry.csv"}):
            raise ValueError("production staging manifest is incomplete or has wrong source identity")
        if any(_digest(final / name) != checksum for name, checksum in report["output_sha256"].items()):
            raise ValueError("existing production staging files are corrupted")
        return report
    with tempfile.TemporaryDirectory(dir=output, prefix=".staging-") as temporary:
        temporary = Path(temporary)
        records_path = temporary / "records.jsonl"
        commodities, provinces, years, identities, exact_rows, missing = {}, {}, {}, {}, set(), {field: 0 for field in MEASURES.values()}
        count = duplicates = exact_duplicates = 0
        province_names = {p["name_th"] for p in load_provinces()}
        with path.open("r", encoding="utf-8-sig", newline="") as source, records_path.open("w", encoding="utf-8") as target:
            reader = csv.DictReader(source)
            if len(reader.fieldnames or []) != len(LABELS) + len(MEASURES) or set(reader.fieldnames or []) != set(LABELS) | set(MEASURES):
                raise ValueError("production CSV header changed")
            for count, raw in enumerate(reader, 1):
                try:
                    row = parse_production_row(raw, count, province_names=province_names)
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"invalid production record {count}: {exc}") from exc
                key = tuple(row[field] for field in IDENTITY)
                previous = identities.get(key)
                row["duplicate_of"] = previous
                row["rollup_eligible"] = False
                if previous is not None:
                    duplicates += 1
                else:
                    identities[key] = count
                if row["source_row_hash"] in exact_rows:
                    exact_duplicates += 1
                exact_rows.add(row["source_row_hash"])
                commodity = {field: row[field] for field in ("commodity_id", "crop_group", "crop_type", "variety_name")}
                commodities[row["commodity_id"]] = commodity
                provinces[row["province_name"]] = provinces.get(row["province_name"], 0) + 1
                year_key = str(row["source_year_be"])
                years[year_key] = years.get(year_key, 0) + 1
                for field in missing:
                    missing[field] += row[field] is None
                target.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n")
        if not count:
            raise ValueError("production source has no records")
        registry_path = temporary / "commodity_registry.csv"
        with registry_path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=("commodity_id", "crop_group", "crop_type", "variety_name"))
            writer.writeheader()
            writer.writerows(sorted(commodities.values(), key=lambda row: row["commodity_id"]))
        report = {
            "source_id": "doae", "source_url": SOURCE_URL, "resource_id": RESOURCE_ID,
            "source_sha256": source_hash, "source_bytes": path.stat().st_size,
            "source_rows": count, "unique_identity_count": len(identities), "duplicate_identity_rows": duplicates,
            "exact_duplicate_rows": exact_duplicates, "commodity_count": len(commodities),
            "province_label_count": len(provinces), "province_label_rows": provinces,
            "missing_measure_count": missing, "license_status": "pending", "rollup_status": "blocked_pending_grain_and_admin_mapping_review",
            "grain": list(IDENTITY), "resource_label_year_ad": 2023,
            "source_year_be_rows": years, "observed_years_ad": sorted(int(year) - 543 for year in years),
            "records_path": str((final / "records.jsonl").resolve()),
            "commodity_registry_path": str((final / "commodity_registry.csv").resolve()),
            "output_sha256": {name: _digest(temporary / name) for name in ("records.jsonl", "commodity_registry.csv")},
        }
        _json(temporary / "inventory.json", report)
        temporary.rename(final)
    return report


PROVINCIAL_AGGREGATE_FIELDS = (
    "province_code", "province_name", "year_ad", "commodity_id", "crop_group", "crop_type", "variety_name",
    "planted_area_rai", "damaged_area_rai", "harvested_area_rai", "production_kg", "weighted_yield_kg_per_rai",
    "record_count", "matched_record_count", "unmatched_record_count", "subdistrict_completeness",
    "temporal_status", "rollup_status",
)


def aggregate_provincial_production(records_path, crosswalk_path, *, output_dir=None):
    """Aggregate DOAE subdistrict production into verified provincial gold aggregates.

    Rules enforced:
    - Yield MUST be derived as SUM(production_kg) / SUM(harvested_area_rai), NEVER an unweighted average.
    - Records without matched subdistricts (e.g. Bang Bon retired subdistrict) are tracked in audit,
      excluded from subdistrict sums to maintain integrity, and flagged as partial_unmatched_subdistrict.
    - Missing measures remain None/null, never filled with zero.
    """
    records_path = Path(records_path)
    crosswalk_path = Path(crosswalk_path)
    if not records_path.is_file() or not crosswalk_path.is_file():
        raise ValueError("records_path and crosswalk_path must be existing files")

    crosswalk = {}
    with crosswalk_path.open("r", encoding="utf-8-sig") as stream:
        for row in csv.DictReader(stream):
            key = (row["province_name"], row["district_name"], row["subdistrict_name"])
            crosswalk[key] = row

    groups = {}
    unmatched_audit = []
    total_records = 0

    with records_path.open("r", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            total_records += 1
            key = (row["province_name"], row["district_name"], row["subdistrict_name"])
            cw = crosswalk.get(key)
            province_code = cw.get("province_code") if cw else None
            if not province_code:
                raise ValueError(f"Unknown province in production record {row.get('source_record_number')}: {row.get('province_name')}")

            grp_key = (province_code, int(row["year_ad"]), row["commodity_id"])
            if grp_key not in groups:
                groups[grp_key] = {
                    "province_code": province_code,
                    "province_name": row["province_name"],
                    "year_ad": int(row["year_ad"]),
                    "commodity_id": row["commodity_id"],
                    "crop_group": row["crop_group"],
                    "crop_type": row["crop_type"],
                    "variety_name": row["variety_name"],
                    "planted_area_rai": None,
                    "damaged_area_rai": None,
                    "harvested_area_rai": None,
                    "production_kg": None,
                    "_sum_planted": 0.0,
                    "_has_planted": False,
                    "_sum_damaged": 0.0,
                    "_has_damaged": False,
                    "_sum_harvested": 0.0,
                    "_has_harvested": False,
                    "_sum_production": 0.0,
                    "_has_production": False,
                    "record_count": 0,
                    "matched_record_count": 0,
                    "unmatched_record_count": 0,
                    "unmatched_details": [],
                }
            grp = groups[grp_key]
            grp["record_count"] += 1

            is_matched = bool(cw and cw.get("mapping_status") == "matched_snapshot")
            if is_matched:
                grp["matched_record_count"] += 1
                if row.get("planted_area_rai") is not None:
                    grp["_sum_planted"] += float(row["planted_area_rai"])
                    grp["_has_planted"] = True
                if row.get("damaged_area_rai") is not None:
                    grp["_sum_damaged"] += float(row["damaged_area_rai"])
                    grp["_has_damaged"] = True
                if row.get("harvested_area_rai") is not None:
                    grp["_sum_harvested"] += float(row["harvested_area_rai"])
                    grp["_has_harvested"] = True
                if row.get("production_kg") is not None:
                    grp["_sum_production"] += float(row["production_kg"])
                    grp["_has_production"] = True
            else:
                grp["unmatched_record_count"] += 1
                audit_entry = {
                    "source_record_number": row.get("source_record_number"),
                    "province_name": row["province_name"],
                    "district_name": row["district_name"],
                    "subdistrict_name": row["subdistrict_name"],
                    "crop_group": row["crop_group"],
                    "crop_type": row["crop_type"],
                    "commodity_id": row["commodity_id"],
                    "planted_area_rai": row.get("planted_area_rai"),
                    "production_kg": row.get("production_kg"),
                    "reason": "unmatched_subdistrict_in_master_snapshot"
                }
                grp["unmatched_details"].append(audit_entry)
                unmatched_audit.append(audit_entry)

    aggregates = []
    for grp in sorted(groups.values(), key=lambda g: (g["province_code"], g["year_ad"], g["commodity_id"])):
        planted = round(grp["_sum_planted"], 2) if grp["_has_planted"] else None
        damaged = round(grp["_sum_damaged"], 2) if grp["_has_damaged"] else None
        harvested = round(grp["_sum_harvested"], 2) if grp["_has_harvested"] else None
        production = round(grp["_sum_production"], 2) if grp["_has_production"] else None

        weighted_yield = (
            round(grp["_sum_production"] / grp["_sum_harvested"], 2)
            if (grp["_has_production"] and grp["_has_harvested"] and grp["_sum_harvested"] > 0)
            else None
        )

        completeness = "complete" if grp["unmatched_record_count"] == 0 else "partial_unmatched_subdistrict"

        agg_row = {
            "province_code": grp["province_code"],
            "province_name": grp["province_name"],
            "year_ad": grp["year_ad"],
            "commodity_id": grp["commodity_id"],
            "crop_group": grp["crop_group"],
            "crop_type": grp["crop_type"],
            "variety_name": grp["variety_name"],
            "planted_area_rai": planted,
            "damaged_area_rai": damaged,
            "harvested_area_rai": harvested,
            "production_kg": production,
            "weighted_yield_kg_per_rai": weighted_yield,
            "record_count": grp["record_count"],
            "matched_record_count": grp["matched_record_count"],
            "unmatched_record_count": grp["unmatched_record_count"],
            "subdistrict_completeness": completeness,
            "temporal_status": "snapshot_match_not_period_boundary_verification",
            "rollup_status": "provincial_gold_aggregate",
        }
        aggregates.append(agg_row)

    report = {
        "source_records": total_records,
        "provincial_groups": len(aggregates),
        "total_matched_records": sum(a["matched_record_count"] for a in aggregates),
        "total_unmatched_records": len(unmatched_audit),
        "unmatched_records_audit": unmatched_audit,
        "aggregates": aggregates,
    }

    if output_dir:
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)
        csv_path = out_path / "provincial_production.csv"
        with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(PROVINCIAL_AGGREGATE_FIELDS))
            writer.writeheader()
            writer.writerows(aggregates)
        manifest_path = out_path / "provincial_production_inventory.json"
        inv_payload = {
            "source_records": total_records,
            "provincial_groups": len(aggregates),
            "total_matched_records": sum(a["matched_record_count"] for a in aggregates),
            "total_unmatched_records": len(unmatched_audit),
            "unmatched_records_audit": unmatched_audit,
            "csv_path": str(csv_path.resolve()),
            "sha256": _digest(csv_path),
        }
        _json(manifest_path, inv_payload)
        report["csv_path"] = str(csv_path.resolve())
        report["manifest_path"] = str(manifest_path.resolve())

    return report


def provincial_production_observations(aggregates, *, source_url=SOURCE_URL, retrieved_at=None, license_status="pending"):
    """Convert provincial production aggregates to warehouse observations."""
    from .quality import timestamp
    retrieved = (
        timestamp(retrieved_at).isoformat()
        if retrieved_at is not None
        else datetime.now(timezone.utc).isoformat()
    )
    observations = []
    for agg in aggregates:
        pcode = agg["province_code"]
        year = agg["year_ad"]
        cid = agg["commodity_id"]
        obs_date = f"{year}-12-31T00:00:00+07:00"
        quality = "gold_provincial_aggregate" if agg["unmatched_record_count"] == 0 else "partial_unmatched_subdistrict"

        if agg["planted_area_rai"] is not None:
            observations.append({
                "observation_id": f"doae-prov:{pcode}:{year}:{cid}:planted_area",
                "source_id": "doae",
                "area_code": pcode,
                "spatial_support": "province",
                "location_id": pcode,
                "commodity_id": cid,
                "observed_at": obs_date,
                "release_at": None,
                "retrieved_at": retrieved,
                "measure": "planted_area",
                "value": float(agg["planted_area_rai"]),
                "unit": "rai",
                "data_kind": "official",
                "revision_id": "doae-prov-gold-v1",
                "quality_flag": quality,
                "source_url": source_url,
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })

        if agg["harvested_area_rai"] is not None:
            observations.append({
                "observation_id": f"doae-prov:{pcode}:{year}:{cid}:harvested_area",
                "source_id": "doae",
                "area_code": pcode,
                "spatial_support": "province",
                "location_id": pcode,
                "commodity_id": cid,
                "observed_at": obs_date,
                "release_at": None,
                "retrieved_at": retrieved,
                "measure": "harvested_area",
                "value": float(agg["harvested_area_rai"]),
                "unit": "rai",
                "data_kind": "official",
                "revision_id": "doae-prov-gold-v1",
                "quality_flag": quality,
                "source_url": source_url,
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })

        if agg["production_kg"] is not None:
            observations.append({
                "observation_id": f"doae-prov:{pcode}:{year}:{cid}:production",
                "source_id": "doae",
                "area_code": pcode,
                "spatial_support": "province",
                "location_id": pcode,
                "commodity_id": cid,
                "observed_at": obs_date,
                "release_at": None,
                "retrieved_at": retrieved,
                "measure": "production",
                "value": float(agg["production_kg"]),
                "unit": "kg",
                "data_kind": "official",
                "revision_id": "doae-prov-gold-v1",
                "quality_flag": quality,
                "source_url": source_url,
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })

        if agg["weighted_yield_kg_per_rai"] is not None:
            observations.append({
                "observation_id": f"doae-prov:{pcode}:{year}:{cid}:yield",
                "source_id": "doae",
                "area_code": pcode,
                "spatial_support": "province",
                "location_id": pcode,
                "commodity_id": cid,
                "observed_at": obs_date,
                "release_at": None,
                "retrieved_at": retrieved,
                "measure": "yield",
                "value": float(agg["weighted_yield_kg_per_rai"]),
                "unit": "kg/rai",
                "data_kind": "official",
                "revision_id": "doae-prov-gold-v1",
                "quality_flag": quality,
                "source_url": source_url,
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })

    return observations

