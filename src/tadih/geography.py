"""Versioned DOPA hierarchy; retired codes never enter the active name crosswalk."""

import csv
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
import xml.etree.ElementTree as ET
import zipfile

from .catalog import PROVINCE_CODES

DOPA_URL = "https://stat.bora.dopa.go.th/dload/ccaatt.xlsx"
SOURCE_VERSION = "2023-09-01"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def parse_admin_rows(rows, require_national=True):
    result, active = [], {}
    for raw in rows:
        code = raw.get("A", "")
        if not re.fullmatch(r"[0-9]{8}", code):
            continue
        if code[-2:] != "00":
            raise ValueError("administrative code has unsupported village-level suffix")
        size = 2 if code[2:] == "000000" else 4 if code[4:] == "0000" else 6
        level = {2: "province", 4: "district", 6: "subdistrict"}[size]
        name = raw.get("B", "").strip()
        retired = name.endswith("*")
        if code[:2] not in PROVINCE_CODES and not retired:
            raise ValueError("active administrative code lies outside the reviewed province hierarchy")
        retirement = raw.get("D", "0") or "0"
        if not name or retired != (retirement != "0"):
            raise ValueError("name and retirement marker disagree")
        valid_to = None
        if retired:
            if not re.fullmatch(r"[0-9]{8}", retirement):
                raise ValueError("retired code must have a Buddhist retirement date")
            valid_to = date(int(retirement[:4])-543, int(retirement[4:6]), int(retirement[6:])).isoformat()
        row = {"area_code": code[:size], "source_code": code, "province_code": code[:2],
            "district_code": code[:4] if size >= 4 else None, "subdistrict_code": code[:6] if size == 6 else None,
            "parent_code": code[:size-2] if size > 2 else None, "admin_level": level,
            "name_th": name.rstrip("*"), "name_en": raw.get("C") or None,
            "retired": retired, "valid_from": None, "valid_to": valid_to,
            "source_url": DOPA_URL, "source_version": SOURCE_VERSION, "geom_version": None,
            "scope_status": "current_province_prefix" if code[:2] in PROVINCE_CODES else "unverified_historical_prefix",
            "license_status": "pending"}
        if not retired:
            if row["area_code"] in active:
                raise ValueError("duplicate active administrative code")
            active[row["area_code"]] = row
        result.append(row)
    for row in active.values():
        if row["parent_code"] is not None and row["parent_code"] not in active:
            raise ValueError("active administrative code has no active parent")
    provinces = {r["area_code"] for r in active.values() if r["admin_level"] == "province"}
    if require_national and provinces != PROVINCE_CODES:
        raise ValueError("national geography must contain all 77 provinces")
    return result


def parse_dopa_workbook(path):
    with zipfile.ZipFile(path) as archive:
        if sum(info.file_size for info in archive.infolist()) > 20 * 1024 * 1024:
            raise ValueError("DOPA workbook exceeds 20 MiB uncompressed bound")
        shared = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        rows = []
        for element in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall("s:sheetData/s:row", NS):
            row = {}
            for cell in element.findall("s:c", NS):
                node = cell.find("s:v", NS)
                value = node.text if node is not None else ""
                row[re.sub(r"[0-9]", "", cell.attrib["r"])] = shared[int(value)] if cell.get("t") == "s" else value
            rows.append(row)
    if not any("1 กันยายน 2566" in row.get("A", "") for row in rows[:5]):
        raise ValueError("DOPA workbook version changed; review source date before use")
    return parse_admin_rows(rows)


def validate_province_boundaries(payload):
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValueError("boundary must be a GeoJSON FeatureCollection")
    codes = []
    for feature in payload.get("features", []):
        codes.append(feature["properties"]["PROV_CODE"])
        geometry = feature["geometry"]
        if geometry["type"] not in {"Polygon", "MultiPolygon"}:
            raise ValueError("province boundary must be a polygon")
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        if not polygons:
            raise ValueError("empty province geometry")
        for polygon in polygons:
            if not polygon:
                raise ValueError("empty province polygon")
            for ring in polygon:
                if len(ring) < 4 or ring[0] != ring[-1]:
                    raise ValueError("polygon rings must be closed")
                for point in ring:
                    if (len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point)
                            or not 97 <= point[0] <= 106 or not 5 <= point[1] <= 21):
                        raise ValueError("boundary coordinate outside reviewed Thailand extent")
    if len(codes) != 77 or set(codes) != PROVINCE_CODES:
        raise ValueError("boundary must include each of the 77 province codes once")
    return {"province_count": 77, "crs": "EPSG:4326", "geometry_version": "ddpm-retrieved-2026-10-22-offset-0.005deg",
        "license_status": "pending", "limitations": "Simplified display boundaries; topology and operational zonal statistics not validated"}


def stage_geography(workbook_path, output_dir, boundary_path=None):
    path = Path(workbook_path)
    rows = parse_dopa_workbook(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    destination = Path(output_dir) / digest
    boundary = validate_province_boundaries(json.loads(Path(boundary_path).read_text(encoding="utf-8"))) if boundary_path else None
    destination.parent.mkdir(parents=True, exist_ok=True)
    active = [row for row in rows if not row["retired"]]
    report = {"source_url": DOPA_URL, "source_version": SOURCE_VERSION, "source_sha256": digest,
        "counts": {level: sum(r["admin_level"] == level for r in active) for level in ("province", "district", "subdistrict")},
        "retired_count": len(rows)-len(active), "license_status": "pending", "boundary": boundary,
        "limitations": ["2023-09-01 source snapshot, not a verified 2026 current administrative master", "valid_from is unknown, never inferred from snapshot date"],
        "active_csv": str((destination / "active.csv").resolve()), "retired_csv": str((destination / "retired.csv").resolve())}
    if destination.exists():
        saved = json.loads((destination / "inventory.json").read_text(encoding="utf-8"))
        if set(saved.get("files", {})) != {"active.csv", "retired.csv"}:
            raise ValueError("geography staging manifest incomplete")
        for name, checksum in saved["files"].items():
            if hashlib.sha256((destination / name).read_bytes()).hexdigest() != checksum:
                raise ValueError("geography staging file changed")
        return saved
    with tempfile.TemporaryDirectory(dir=destination.parent) as directory:
        temporary = Path(directory)
        for name, records in (("active.csv", active), ("retired.csv", [r for r in rows if r["retired"]])):
            with (temporary / name).open("w", encoding="utf-8-sig", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(records)
        report["files"] = {name: hashlib.sha256((temporary / name).read_bytes()).hexdigest() for name in ("active.csv", "retired.csv")}
        (temporary / "inventory.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.rename(destination)
    return report
