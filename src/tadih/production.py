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
