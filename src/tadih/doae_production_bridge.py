"""Bridge locally staged DOAE subdistrict crop records onto the canonical observation contract.

Lane L3 read/prepare path for the two approved-public subdistrict resources
(``doae_production_subdistrict_2023`` and ``doae_perennial_subdistrict_2023``).
Every retained staging record is mapped to one canonical observation per
measure at the provider's native grain; the subdistrict identity is carried in
the shared ``locations`` table through the writer's kind override, so the
existing ``observations``/``locations`` schema needs no migration. Missing
measures stay un-published as rows (they are reported as counts, never as 0),
no province roll-up is produced, and Buddhist source years remain opaque
source-year labels with ``observed_at`` null. Dry-run is the default and the
only mode used by this lane.
"""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any, Iterator, Mapping, Sequence

from .catalog import load_provinces, load_resource_licenses
from .observations import (
    DEFAULT_REGISTRY_PATH,
    ObservationWriteError,
    _logical_payload_sha256,
    _prepare_batch,
    assert_resource_approved,
    publish_observations,
)
from .production import IDENTITY as SHORT_LIVED_IDENTITY
from .production import RESOURCE_ID as SHORT_LIVED_CKAN_RESOURCE_ID
from .production import SOURCE_URL as SHORT_LIVED_SOURCE_URL
from .production_perennial import RESOURCE_ID as PERENNIAL_CKAN_RESOURCE_ID
from .production_perennial import SOURCE_URL as PERENNIAL_SOURCE_URL
from .quality import validate_observation


ADAPTER_VERSION = "doae-production-subdistrict/1.0.0"
WRITER_BATCH_ROW_CAP = 100_000  # shared _prepare_batch refuses larger lists; snapshot runs cannot split
SOURCE_ID = "doae"

# WHY: units come from the provider column headers verbatim; unconfirmed units
# would be null, but every DOAE measure header states its unit explicitly.
_SHORT_LIVED_MEASURES = {
    "planted_area_rai": ("เนื้อที่ปลูก (ไร่)", "ไร่"),
    "damaged_area_rai": ("เนื้อที่เสียหาย (ไร่)", "ไร่"),
    "harvested_area_rai": ("เนื้อที่เก็บเกี่ยวผลผลิต(ไร่)", "ไร่"),
    "production_kg": ("ผลผลิตที่เก็บเกี่ยวได้ (กิโลกรัม)", "กิโลกรัม"),
    "yield_kg_per_rai": ("ผลผลิตเฉลี่ย(กิโลกรัม/ไร่)", "กิโลกรัม/ไร่"),
    "farm_gate_thb_per_kg": ("ราคาที่เกษตรกรขายได้เฉลี่ย (บาท/กิโลกรัม)", "บาท/กิโลกรัม"),
}
_PERENNIAL_MEASURES = {
    "bearing_area_rai": ("เนื้อที่ให้ผลผลิต (ไร่)", "ไร่"),
    "standing_area_rai": ("เนื้อที่ยืนต้นทั้งหมด (ไร่)", "ไร่"),
    "damaged_area_rai": ("เนื้อที่เสียหาย (ไร่)", "ไร่"),
    "production_kg": ("ผลผลิตที่เก็บเกี่ยวได้ (กิโลกรัม)", "กิโลกรัม"),
    "farm_gate_thb_per_kg": (" ราคาขายเฉลี่ย (บาท/กิโลกรัม)", "บาท/กิโลกรัม"),
}

RESOURCES = {
    "doae_production_subdistrict_2023": {
        "resource_key": "doae_production_subdistrict_2023",
        "ckan_resource_id": SHORT_LIVED_CKAN_RESOURCE_ID,
        "d1_resource_id": f"doae:production_doae:{SHORT_LIVED_CKAN_RESOURCE_ID}",
        "source_url": SHORT_LIVED_SOURCE_URL,
        "staged_root": Path("data/local/production/staged"),
        "raw_manifest": Path("data/local/production/doae_production_2023/manifest.json"),
        "measures": _SHORT_LIVED_MEASURES,
        "identity_fields": SHORT_LIVED_IDENTITY,
        "duplicate_field": "duplicate_of",
        "has_month": True,
        "connector_kind": "production_doae",
        "dataset_title": "ข้อมูลผลิตผลเกษตรรายตำบล (พืชอายุสั้น) กรมส่งเสริมการเกษตร",
        "grain": ("แหล่งที่มา: ปี พ.ศ. (เดือน) จังหวัด อำเภอ ตำบล กลุ่มพืช ชนิดพืช "
                  "พันธุ์พืช รอบการปลูก × ค่ารายตัวชี้วัด (ระดับตำบลตามแหล่งต้นทาง)"),
    },
    "doae_perennial_subdistrict_2023": {
        "resource_key": "doae_perennial_subdistrict_2023",
        "ckan_resource_id": PERENNIAL_CKAN_RESOURCE_ID,
        "d1_resource_id": f"doae:production_doae:{PERENNIAL_CKAN_RESOURCE_ID}",
        "source_url": PERENNIAL_SOURCE_URL,
        "staged_root": Path("data/local/production/perennial-staged"),
        "raw_manifest": Path("data/local/production-perennial/doae_perennial_2023/manifest.json"),
        "measures": _PERENNIAL_MEASURES,
        "identity_fields": ("source_year_be", "province_name", "district_name",
                            "subdistrict_name", "crop_group", "crop_type", "variety_name"),
        "duplicate_field": "duplicate_identity",
        "has_month": False,
        "connector_kind": "production_doae",
        "dataset_title": "ข้อมูลผลิตผลเกษตรรายตำบล (ไม้ผลยืนต้น) กรมส่งเสริมการเกษตร",
        "grain": ("แหล่งที่มา: ปี พ.ศ. จังหวัด อำเภอ ตำบล กลุ่มพืช ชนิดพืช พันธุ์พืช "
                  "× ค่ารายตัวชี้วัด (ระดับตำบลตามแหล่งต้นทาง)"),
    },
}


class DoaeBridgeError(ValueError):
    """Bridge input or review-manifest error with a stable message."""


def _digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def resolve_staged_directory(config: Mapping[str, Any], staged_root: Path) -> Path:
    """Find the single verified staging snapshot under a root directory."""
    candidates = sorted(
        (p for p in staged_root.iterdir() if (p / "inventory.json").is_file())
        if staged_root.is_dir() else ()
    )
    if not candidates:
        raise DoaeBridgeError(
            f"NO_STAGED_SNAPSHOT for {config['resource_key']}: pass --records with the staged records.jsonl")
    if len(candidates) > 1:
        raise DoaeBridgeError(
            f"AMBIGUOUS_STAGED_SNAPSHOTS ({len(candidates)}) under {staged_root}; pass --records")
    return candidates[0]


def load_staged_batch(resource_key: str, *, staged_root: Path | str | None = None,
                      records_path: Path | str | None = None, limit: int | None = None,
                      source_year: int | None = None, crop_group: str | None = None) -> dict[str, Any]:
    """Read and checksum-verify the staged records; filters are explicit scoping only."""
    config = RESOURCES.get(resource_key)
    if config is None:
        raise DoaeBridgeError(f"UNKNOWN_RESOURCE {resource_key!r}; choices: {sorted(RESOURCES)}")
    if records_path is not None:
        records_file = Path(records_path)
        directory = records_file.parent
    else:
        root = Path(staged_root) if staged_root is not None else config["staged_root"]
        directory = resolve_staged_directory(config, root)
        records_file = directory / "records.jsonl"
    if not records_file.is_file():
        raise DoaeBridgeError(f"STAGED_RECORDS_MISSING {records_file}")
    inventory = json.loads((directory / "inventory.json").read_text(encoding="utf-8"))
    expected_sha = (inventory.get("output_sha256") or {}).get("records.jsonl") or inventory.get("records_sha256")
    if not isinstance(expected_sha, str) or len(expected_sha) != 64:
        raise DoaeBridgeError("STAGED_INVENTORY_RECORDS_SHA_MISSING")
    actual_sha = _digest(records_file)
    if actual_sha != expected_sha:
        raise DoaeBridgeError("STAGED_RECORDS_CHECKSUM_MISMATCH; refuse to publish unverified bytes")

    records: list[dict[str, Any]] = []
    scanned = 0
    with records_file.open(encoding="utf-8") as handle:
        for line in handle:
            scanned += 1
            record = json.loads(line)
            if source_year is not None and int(record.get("source_year_be", -1)) != source_year:
                continue
            if crop_group is not None and record.get("crop_group") != crop_group:
                continue
            records.append(record)
            if limit is not None and len(records) >= limit:
                break
    return {
        "config": config,
        "resource_key": resource_key,
        "directory": directory,
        "records": records,
        "records_scanned": scanned,
        "limited": limit is not None and scanned >= limit and len(records) >= limit,
        "inventory": inventory,
        "records_sha256": actual_sha,
    }


def _location_ids(record: Mapping[str, Any]) -> tuple[str, str]:
    """Deterministic subdistrict identity from the source's three admin labels.

    DOAE gives names, not official admin codes; the code is a stable digest of
    the provider's own name triple, explicitly marked as a bridge identity,
    never guessed from a master table ("ไม่เดารหัสพื้นที่").
    """
    triple = "\0".join((record["province_name"], record["district_name"], record["subdistrict_name"]))
    digest = hashlib.sha256(triple.encode("utf-8")).hexdigest()
    return f"doae:subdistrict:{digest[:32]}", f"doae-subdistrict:{digest[:20]}"


def _observation_id(config: Mapping[str, Any], record: Mapping[str, Any], measure: str) -> str:
    identity = [record[field] for field in config["identity_fields"]] + [measure]
    payload = json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return "doae-sub:" + config["ckan_resource_id"][:8] + ":" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:40]


def build_rows(batch: Mapping[str, Any], *, license_status: str, retrieved_at: str,
               include_null: bool = False) -> dict[str, Any]:
    """Map retained staging records onto canonical rows, locations, products and dimensions."""
    config = batch["config"]
    measures = config["measures"]
    revision_id = batch["inventory"]["source_sha256"]
    province_codes = {p["name_th"]: p["area_code"] for p in load_provinces()}
    rows: list[dict[str, Any]] = []
    locations: dict[str, dict[str, Any]] = {}
    products: dict[str, str] = {}
    dimensions: dict[str, dict[str, Any]] = {}
    skipped = {"duplicateRecords": 0, "nullMeasures": 0, "nullMeasuresPublished": 0}
    for record in batch["records"]:
        if record.get(config["duplicate_field"]):
            skipped["duplicateRecords"] += 1
            continue
        year_be = int(record["source_year_be"])
        if year_be not in {2566, 2567}:
            raise DoaeBridgeError(f"UNVERIFIED_SOURCE_YEAR {year_be}; only reviewed years 2566/2567 are bridged")
        province_code = province_codes.get(record["province_name"])
        if province_code is None:
            raise DoaeBridgeError(f"PROVINCE_LABEL_UNMAPPED {record['province_name']!r}")
        location_id, native_code = _location_ids(record)
        commodity_id = record.get("commodity_id")
        if not commodity_id:
            # WHY: perennial staging kept crop labels without a commodity hash; derive the same
            # content-addressed id as the short-lived parser instead of inventing one.
            commodity = {field: record.get(field, "") for field in ("crop_group", "crop_type", "variety_name")}
            commodity_id = "doae:" + hashlib.sha256(
                json.dumps(commodity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()[:24]
        locations[location_id] = {
            "kind": "subdistrict",
            "nativeCode": native_code,
            "name": record["subdistrict_name"],
            "provinceCode": province_code,
        }
        for measure, (label, unit) in measures.items():
            value = record.get(measure)
            if value is None:
                if not include_null:
                    skipped["nullMeasures"] += 1
                    continue
                skipped["nullMeasuresPublished"] += 1
            observation_id = _observation_id(config, record, measure)
            rows.append({
                "observation_id": observation_id,
                "source_id": SOURCE_ID,
                "area_code": province_code,
                # WHY: 'province' is the lowest spatial_support the contract allows; the
                # subdistrict grain is carried by the locations override below.
                "spatial_support": "province",
                "location_id": location_id,
                "commodity_id": commodity_id,
                "observed_at": None,
                "source_year_be": year_be,
                "source_row_id": f"{record['source_record_number']}:{record['source_row_hash'][:12]}",
                "release_at": None,
                "retrieved_at": retrieved_at,
                "measure": measure,
                "value": value,
                "unit": unit,
                "data_kind": "official",
                "revision_id": revision_id,
                "quality_flag": "good" if value is not None else "missing",
                "source_url": config["source_url"],
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })
            products[observation_id] = record["crop_type"] or record["crop_group"]
            row_dimensions = {
                "spatialSupport": "province",
                "reportedGrain": "subdistrict_source_labels",
                "dataKind": "official",
                "measure": measure,
                "measureLabel": label,
                "sourceYearBe": year_be,
                "sourceYearConvention": "unverified Buddhist-year source label",
                "provinceName": record["province_name"],
                "districtName": record["district_name"],
                "subdistrictName": record["subdistrict_name"],
                "cropGroup": record["crop_group"],
                "cropType": record["crop_type"],
                "varietyName": record["variety_name"],
                "commodityId": commodity_id,
                "rollupEligible": False,
            }
            if config["has_month"]:
                row_dimensions.update(
                    sourceMonthLabel=str(record["month"]),
                    monthMeaning="unverified source label; not interpreted as a calendar period",
                    plantingRoundLabel=str(record["planting_round"]),
                    plantingRoundMeaning="unverified source label; not mapped to a season",
                )
            dimensions[observation_id] = row_dimensions
    return {"rows": rows, "locations": locations, "products": products,
            "dimensions": dimensions, "skipped": skipped}


def _coverage(batch: Mapping[str, Any], built: Mapping[str, Any], *, completed: bool) -> dict[str, Any]:
    inventory = batch["inventory"]
    return {
        "mode": "staged_subdistrict_records",
        "stagingVerified": completed,
        "recordsScanned": batch["records_scanned"],
        "recordsRetained": len(batch["records"]),
        "duplicateRecordsSkipped": built["skipped"]["duplicateRecords"],
        "nullMeasuresSkipped": built["skipped"]["nullMeasures"],
        "distinctSubdistrictLocations": len(built["locations"]),
        "sourceRowsStaged": inventory.get("source_rows") or inventory.get("source_records"),
        "missingMeasureCountsStaging": inventory.get("missing_measure_count") or inventory.get("missing"),
        "scopingFilters": batch.get("filters") or {},
    }


def run(argv: Sequence[str] | None = None, *, client: Any = None,
        registry_path: str | None = None) -> dict[str, Any]:
    """Prepare one complete subdistrict snapshot per resource; write only with ``--write``."""
    parser_ = argparse.ArgumentParser(
        prog="tadih ingest --adapter doae_production_subdistrict",
        description="Bridge staged DOAE subdistrict crop records to the shared D1 observation writer.",
    )
    parser_.add_argument("--resource", required=True, choices=sorted(RESOURCES))
    parser_.add_argument("--staged-root", help="Staging root; defaults to the resource's local directory.")
    parser_.add_argument("--records", help="Explicit staged records.jsonl path (single-snapshot override).")
    parser_.add_argument("--limit", type=int, help="Retain at most N filtered records (bounded runs only).")
    parser_.add_argument("--source-year", type=int, choices=(2566, 2567))
    parser_.add_argument("--crop-group")
    parser_.add_argument("--include-null", action="store_true",
                         help="Publish missing measures as null rows with quality_flag='missing'.")
    parser_.add_argument("--retrieved-at", help="ISO timestamp for the snapshot; defaults to now UTC.")
    mode = parser_.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Prepare and report the batch (default).")
    mode.add_argument("--write", action="store_true", help="Publish to D1. Never used by lane L3.")
    args = parser_.parse_args(list(argv or []))

    # Approval gate first: nothing is read for publication unless the registry
    # still says this exact resource is approved public. A blocked gate is
    # fatal for --write; a dry-run continues so the orchestrator sees exactly
    # which governance step is missing (fail closed, but fail informed).
    registry_rows = load_resource_licenses(registry_path or DEFAULT_REGISTRY_PATH)
    matches = [row for row in registry_rows if row.get("resource_key") == args.resource]
    if len(matches) != 1:
        raise ObservationWriteError("RESOURCE_APPROVAL_MISSING", "registry must contain the resource exactly once")
    resource = matches[0]
    registry_gate = {"status": "passed", "reason": None}
    try:
        assert_resource_approved(resource)
    except ObservationWriteError as gate_error:
        if args.write:
            raise
        registry_gate = {"status": "blocked_for_write", "reason": str(gate_error)}

    config = RESOURCES[args.resource]
    batch = load_staged_batch(
        args.resource, staged_root=args.staged_root, records_path=args.records,
        limit=args.limit, source_year=args.source_year, crop_group=args.crop_group,
    )
    batch["filters"] = {"limit": args.limit, "sourceYear": args.source_year, "cropGroup": args.crop_group}
    if args.retrieved_at is not None:
        retrieved_at = args.retrieved_at
    else:
        retrieved_at = datetime.now(timezone.utc).isoformat()

    built = build_rows(batch, license_status=resource["license_status"],
                       retrieved_at=retrieved_at, include_null=args.include_null)
    rows = built["rows"]
    for row in rows:
        validate_observation(row)  # fail locally before any writer-side quarantine surprise

    over_writer_cap = len(rows) > WRITER_BATCH_ROW_CAP
    if args.write and over_writer_cap:
        raise ObservationWriteError(
            "BATCH_OVER_WRITER_CAP",
            f"{len(rows)} rows exceed the shared writer cap {WRITER_BATCH_ROW_CAP}; a source-year "
            "snapshot cannot be split across runs. Scope with --source-year/--crop-group or raise "
            "the cap in the shared writer (orchestrator decision).")
    # A full-snapshot dry-run over the cap still validates a bounded prefix so the
    # writer contract (locations override, per-measure units, product map) is proven.
    plan_rows = rows if not over_writer_cap else rows[:WRITER_BATCH_ROW_CAP]

    unscoped = (args.limit is None and not batch["limited"]
                and args.source_year is None and args.crop_group is None)
    completeness = "complete" if unscoped else "partial"
    coverage = _coverage(batch, built, completed=completeness == "complete")
    dimensions_for = lambda observation: built["dimensions"][observation["observation_id"]]
    writer_plan, quarantined = _prepare_batch(
        resource, plan_rows, unit=None, completeness=completeness, coverage=coverage,
        retrieved_at=retrieved_at, adapter_version=ADAPTER_VERSION,
        period_grain="source_year_label", locations=built["locations"],
        product=built["products"], metric_name=None, dimensions_for=dimensions_for,
    )
    if not writer_plan:
        raise ObservationWriteError("ALL_ROWS_REJECTED", "DOAE staging produced no writer-valid rows")

    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if args.write else "dry_run",
        "adapter": "doae_production_subdistrict",
        "adapterVersion": ADAPTER_VERSION,
        "resourceKey": args.resource,
        "ckanResourceId": config["ckan_resource_id"],
        "d1ResourceId": config["d1_resource_id"],
        "publicationAuthorization": resource.get("publication_authorization"),
        "registryGate": registry_gate,
        "resourceLicenseStatus": resource.get("license_status"),
        "unresolvedSourceTerms": resource.get("unresolved", []),
        "sourceUrl": config["source_url"],
        "stagedDirectory": str(batch["directory"]),
        "stagedRecordsSha256": batch["records_sha256"],
        "sourceCsvSha256": batch["inventory"]["source_sha256"],
        "periodGrain": "source_year_label",
        "periodLabels": sorted({f"พ.ศ. {row['source_year_be']}" for row in rows}),
        "observedAt": None,
        "measures": {name: {"unit": unit, "label": label, "rows": sum(1 for r in rows if r["measure"] == name)}
                     for name, (label, unit) in config["measures"].items()},
        "recordsRetained": len(batch["records"]),
        "duplicateRecordsSkipped": built["skipped"]["duplicateRecords"],
        "nullMeasuresSkipped": built["skipped"]["nullMeasures"],
        "nullMeasuresPublished": built["skipped"]["nullMeasuresPublished"],
        "rowsPrepared": len(writer_plan),
        "rowsBridged": len(rows),
        "writerValidatedRows": len(plan_rows),
        "validationBoundedPrefix": over_writer_cap,
        "distinctSubdistrictLocations": len(built["locations"]),
        "provinceLabelCount": len({loc["provinceCode"] for loc in built["locations"].values()}),
        "writerBatchRowCap": WRITER_BATCH_ROW_CAP,
        "overWriterCap": over_writer_cap,
        "completeness": completeness,
        "coverage": coverage,
        "writerRowsQuarantined": len(quarantined),
        "writerValidationStatus": "valid" if not quarantined else "partial",
        "quarantineSample": quarantined[:5],
        "payloadSha256": _logical_payload_sha256(resource["resource_id"], writer_plan),
        "retrievedAt": retrieved_at,
        "semanticNotes": [
            "เดือน/รอบการปลูก ถูกเก็บเป็นฉลากจากแหล่งต้นทางที่ยังไม่ยืนยันความหมาย ไม่แปลงเป็นช่วงเวลา",
            "ไม่มีผลรวมระดับจังหวัดในบล็อกนี้; rollup_eligible=false ทุกแถว",
            "ระดับตำบลเก็บใน locations.kind=subdistrict พร้อม native code ที่มาจากรหัสชื่อตำบลของแหล่งต้นทาง",
        ],
        "written": False,
    }
    if args.write:
        if client is None:
            from .hub_catalog_sync import connect_d1_client
            client = connect_d1_client()
        published = publish_observations(
            client, resource=resource, rows=rows, adapter_version=ADAPTER_VERSION,
            coverage=coverage, completeness=completeness, unit=None, retrieved_at=retrieved_at,
            catalog={
                "source_name": "Department of Agriculture (DOAE)",
                "base_url": "https://ckan.doae.go.th",
                "connector_kind": config["connector_kind"],
                "category": "crops",
                "dataset_title": config["dataset_title"],
                "dataset_description": ("ผลผลิตการเกษตรระดับตำบลตามแหล่งต้นทาง; ปี พ.ศ. เป็นฉลากแหล่งที่มา "
                                        "และความหมายเดือน/รอบการปลูกยังไม่ได้รับการยืนยัน"),
                "resource_format": "CSV",
                "grain": config["grain"],
                "resource_url": config["source_url"],
            },
            product=built["products"], metric_name=None, period_grain="source_year_label",
            dimensions_for=dimensions_for, locations=built["locations"],
        )
        summary["status"] = published["status"]
        summary["written"] = True
        summary["published"] = published
    return summary


def main(argv: Sequence[str] | None = None, *, client: Any = None,
         registry_path: str | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, registry_path=registry_path)
    except Exception as exc:  # noqa: BLE001 - adapter CLI reports a bounded failure object
        code = getattr(exc, "code", None) or getattr(exc, "args", [None])[0] or type(exc).__name__
        print(json.dumps({"status": "failed", "errorCode": code,
                          "message": str(exc)[:300]}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    published = summary.get("published") if isinstance(summary, dict) else None
    if summary.get("mode") == "write" and summary.get("written") is True and isinstance(published, dict):
        if published.get("active_run_blocked_reason") or published.get("activation_blocked_reason"):
            return 1
        if summary.get("status") == "partial" and not published.get("active_run_switched"):
            return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
