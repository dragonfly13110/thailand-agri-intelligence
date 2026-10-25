"""Stage approved CHIRPS observations in D1, then switch the active run."""

from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import uuid

from .catalog import load_resource_licenses
from .quality import validate_observation

SOURCE_ID = "chirps"
RESOURCE_KEY = "chirps_v3_daily_rnl_2026_09_30"
RESOURCE_ID = (
    "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/"
    "chirps-v3.0.rnl.2026.09.30.tif"
)
DATASET_ID = "chirps-v3.0-daily-final-rnl"
DATA_DATE = date(2026, 9, 30)
ADAPTER_VERSION = "hub-numeric-sync/1"
SAMPLE_CELL_COUNT = 3
ROOT = Path(__file__).resolve().parents[2]
_CELL_ID = re.compile(r"^chirps-v3:grid:row:(\d+):col:(\d+)$")


class NumericSyncError(RuntimeError):
    """An approved numeric batch could not be safely published to D1."""


def approved_resource(registry_path=None):
    """Return the exact CHIRPS approval or fail closed."""
    rows = load_resource_licenses(registry_path or ROOT / "config/resource_licenses.json")
    matches = [row for row in rows if row["resource_key"] == RESOURCE_KEY]
    if len(matches) != 1:
        raise NumericSyncError("RESOURCE_APPROVAL_MISSING")
    resource = matches[0]
    if (resource.get("resource_id") != RESOURCE_ID
            or resource.get("source_id") != SOURCE_ID
            or resource.get("license_status") != "approved_public"
            or resource.get("project_publication_approved") is not True
            or resource.get("unresolved")):
        raise NumericSyncError("RESOURCE_NOT_APPROVED")
    return resource


def validate_numeric_batch(batch, *, registry_path=None):
    """Validate provenance and the complete three-cell sample before D1 writes."""
    resource = approved_resource(registry_path)
    if not isinstance(batch, dict) or batch.get("resource_url") != RESOURCE_ID:
        raise NumericSyncError("RESOURCE_ID_MISMATCH")
    if batch.get("completeness") not in ("partial", "complete"):
        raise NumericSyncError("COMPLETENESS_MISSING_OR_UNKNOWN")
    if batch["completeness"] == "complete":
        raise NumericSyncError("COMPLETE_MODE_UNAVAILABLE")
    coverage = batch.get("coverage")
    if (not isinstance(coverage, dict) or coverage.get("mode") != "sample_only"
            or type(coverage.get("sample_count")) is not int
            or coverage.get("sample_count") != SAMPLE_CELL_COUNT
            or coverage.get("full_raster_ingested") is not False):
        raise NumericSyncError("COVERAGE_NOT_SAMPLE_ONLY")
    revision_id = batch.get("revision_id")
    retrieved_at = batch.get("retrieved_at")
    rows = batch.get("rows")
    expected_revision = resource.get("access_evidence", {}).get("etag")
    if not isinstance(revision_id, str) or not revision_id or revision_id != expected_revision:
        raise NumericSyncError("RESOURCE_REVISION_UNREVIEWED")
    if not isinstance(retrieved_at, str) or not retrieved_at:
        raise NumericSyncError("RETRIEVAL_TIME_MISSING")
    _utc(retrieved_at)
    if not isinstance(rows, list) or len(rows) != SAMPLE_CELL_COUNT:
        raise NumericSyncError("CHIRPS_SAMPLE_COUNT_MISMATCH")

    clean_rows = []
    seen = set()
    seen_cells = set()
    for raw in rows:
        try:
            row = validate_observation(raw)
        except (TypeError, ValueError) as exc:
            raise NumericSyncError("OBSERVATION_INVALID") from exc
        if (row["source_id"] != SOURCE_ID or row["source_url"] != RESOURCE_ID
                or row["license_status"] != "approved_public"
                or row["spatial_support"] != "grid_cell" or row["area_code"] is not None
                or row["observed_at"] != f"{DATA_DATE.isoformat()}T00:00:00Z"
                or row["retrieved_at"] != retrieved_at or row["revision_id"] != revision_id
                or row["measure"] != "rainfall" or row["unit"] != "mm"
                or row["data_kind"] != "estimated"):
            raise NumericSyncError("OBSERVATION_RESOURCE_MISMATCH")
        match = _CELL_ID.fullmatch(row["location_id"])
        if not match or int(match.group(1)) >= 2400 or int(match.group(2)) >= 7200:
            raise NumericSyncError("GRID_CELL_ID_INVALID")
        if (row["observation_id"] in seen or row["location_id"] in seen_cells
                or row["quality_flag"] not in {"good", "missing"}
                or (row["value"] is None) != (row["quality_flag"] == "missing")):
            raise NumericSyncError("OBSERVATION_DUPLICATE_OR_QUALITY_MISMATCH")
        seen.add(row["observation_id"])
        seen_cells.add(row["location_id"])
        clean_rows.append((row, int(match.group(1)), int(match.group(2))))
    return resource, revision_id, _utc(retrieved_at), clean_rows


def sync_numeric_resource_d1(client, *, registry_path=None):
    """Read a fresh bounded sample, then stage and activate it only if still approved."""
    from .chirps_raster import ChirpsSourceError, read_chirps_observations

    try:
        batch = read_chirps_observations()
    except ChirpsSourceError as exc:
        raise NumericSyncError("CHIRPS_SOURCE_READ_FAILED") from exc
    resource, revision_id, retrieved_at, rows = validate_numeric_batch(
        batch, registry_path=registry_path,
    )
    run_id = str(uuid.uuid4())
    started_at = _now()
    payload_hash = hashlib.sha256(json.dumps(
        [row for row, _, _ in rows], sort_keys=True, ensure_ascii=False,
        separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")).hexdigest()

    try:
        _upsert_catalog_rows(client, resource)
        approval = client.execute(
            "SELECT resource_id FROM resources WHERE resource_id=? "
            "AND access_status='approved_public' AND project_publication_approved=1",
            [RESOURCE_ID],
        )
        if not _returned(approval, "resource_id", RESOURCE_ID):
            raise NumericSyncError("RESOURCE_PUBLICATION_NOT_APPROVED")
        client.execute(
            "INSERT INTO sync_runs (run_id, source_id, resource_id, kind, status, started_at, adapter_version) "
            "VALUES (?, ?, ?, 'numeric', 'running', ?, ?)" ,
            [run_id, SOURCE_ID, RESOURCE_ID, _iso(started_at), ADAPTER_VERSION],
        )
        for row, grid_row, grid_col in rows:
            _upsert_location(client, row["location_id"])
            client.execute(*_observation_statement(run_id, row, grid_row, grid_col))
    except Exception as exc:
        _mark_failed(client, run_id, "NUMERIC_WRITE_FAILED")
        if isinstance(exc, NumericSyncError):
            raise
        raise NumericSyncError("NUMERIC_WRITE_FAILED") from exc

    completed_at = _now()
    try:
        result = client.execute(
            "UPDATE sync_runs SET status='partial', completed_at=?, source_retrieved_at=?, "
            "records_read=?, records_written=?, records_quarantined=0, payload_sha256=?, error_code=NULL "
            "WHERE run_id=? AND resource_id=? AND status='running' RETURNING run_id",
            [_iso(completed_at), _iso(retrieved_at), len(rows), len(rows), payload_hash, run_id, RESOURCE_ID],
        )
        if not _returned(result, "run_id", run_id):
            raise NumericSyncError("RUN_COMPLETION_FAILED")
    except Exception as exc:
        _mark_failed(client, run_id, "RUN_COMPLETION_FAILED")
        if isinstance(exc, NumericSyncError):
            raise
        raise NumericSyncError("RUN_COMPLETION_FAILED") from exc

    # The current reader verifies three cells only, so an activated run stays partial.
    try:
        result = client.execute(
            "UPDATE resources SET active_run_id=? WHERE resource_id=? "
            "AND access_status='approved_public' AND project_publication_approved=1 "
            "AND EXISTS (SELECT 1 FROM sync_runs WHERE run_id=? AND resource_id=? AND status='partial') "
            "RETURNING active_run_id",
            [run_id, RESOURCE_ID, run_id, RESOURCE_ID],
        )
        if not _returned(result, "active_run_id", run_id):
            raise NumericSyncError("ACTIVE_RUN_SWITCH_FAILED")
    except Exception as exc:
        if isinstance(exc, NumericSyncError):
            raise
        raise NumericSyncError("ACTIVE_RUN_SWITCH_FAILED") from exc

    return {
        "resource_id": RESOURCE_ID,
        "run_id": run_id,
        "status": "partial",
        "completeness": "partial",
        "coverage": {"mode": "sample_only", "sample_count": len(rows), "full_raster_ingested": False},
        "records_read": len(rows),
        "records_written": len(rows),
        "revision_id": revision_id,
        "payload_sha256": payload_hash,
    }


def _upsert_catalog_rows(client, resource):
    license_info = resource.get("declared_license") or {}
    evidence = resource.get("access_evidence") or {}
    metadata = {
        "resourceKey": RESOURCE_KEY,
        "product": "CHIRPS v3.0 Daily final RNL",
        "completeness": "partial",
        "coverage": {"mode": "sample_only", "sampleCount": SAMPLE_CELL_COUNT, "fullRasterIngested": False},
        "timeStandard": "UTC date label",
        "unit": "mm per daily time step",
        "spatialSupport": "grid_cell",
        "changes": "Three grid cells only; -9999 is represented as null; no province aggregation.",
        "crs": evidence.get("crs"),
        "pixelSpacingDegrees": evidence.get("pixel_spacing_degrees"),
        "attribution": resource.get("attribution_text"),
        "attributionUrl": resource.get("attribution_url"),
        "revisionId": evidence.get("etag"),
    }
    client.execute(
        "INSERT INTO sources (source_id, source_name, base_url, connector_kind, status, metadata_access_status) "
        "VALUES (?, ?, ?, 'file_catalog', 'deferred', 'metadata_only') ON CONFLICT(source_id) DO NOTHING",
        [SOURCE_ID, "CHIRPS v3.0", "https://www.chc.ucsb.edu/data/chirps3"],
    )
    client.execute(
        "INSERT INTO datasets (dataset_id, source_id, source_dataset_id, title, description, category, owner, "
        "source_url, metadata_access_status, metadata) VALUES (?, ?, ?, ?, ?, 'weather', ?, ?, 'metadata_only', ?) "
        "ON CONFLICT(source_id, source_dataset_id) DO UPDATE SET title=excluded.title, "
        "description=excluded.description, metadata=excluded.metadata",
        [DATASET_ID, SOURCE_ID, DATASET_ID, "CHIRPS v3.0 daily rainfall, 3-cell verification sample",
         "ตัวอย่างตรวจสอบ 3 เซลล์จาก raster รายวัน CHIRPS แสดงเพียงบางส่วน ไม่ครอบคลุมทั้งไฟล์ เก็บระดับ grid cell ไม่รวมเป็นจังหวัด และแสดงค่า -9999 เป็น null ที่มา: CHIRPS3 Data Repository (DOI 10.15780/G2JQ0P); Funk et al. (2026), Scientific Data 13, 718; CC BY 4.0.",
         "Climate Hazards Center / UC Santa Barbara", "https://www.chc.ucsb.edu/data/chirps3",
         _json({"spatialSupport": "grid_cell", "timeStandard": "UTC", "completeness": "partial",
                "coverage": {"mode": "sample_only", "sampleCount": SAMPLE_CELL_COUNT, "fullRasterIngested": False}})],
    )
    client.execute(
        "INSERT INTO resources (resource_id, dataset_id, source_resource_id, name, format, resource_url, "
        "access_status, declared_license, license_url, project_publication_approved, grain, source_updated_at, metadata) "
        "VALUES (?, ?, ?, ?, 'GeoTIFF', ?, ?, ?, ?, ?, 'grid_cell × UTC date; 3-cell sample', ?, ?) "
        "ON CONFLICT(resource_id) DO UPDATE SET dataset_id=excluded.dataset_id, name=excluded.name, format=excluded.format, "
        "resource_url=excluded.resource_url, "
        "declared_license=excluded.declared_license, license_url=excluded.license_url, "
        "grain=excluded.grain, "
        "source_updated_at=excluded.source_updated_at, metadata=excluded.metadata",
        [RESOURCE_ID, DATASET_ID, RESOURCE_ID, resource["name"], RESOURCE_ID,
         resource["license_status"], license_info.get("license_id"), license_info.get("license_url"),
         1 if resource["project_publication_approved"] else 0,
         _source_updated_at(evidence.get("last_modified")), _json(metadata)],
    )


def _upsert_location(client, location_id):
    client.execute(
        "INSERT INTO locations (location_id, source_id, kind, native_code, name) "
        "VALUES (?, ?, 'grid', ?, ?) ON CONFLICT(source_id, kind, native_code) DO UPDATE SET name=excluded.name",
        [location_id, SOURCE_ID, location_id, location_id],
    )


def _observation_statement(run_id, row, grid_row, grid_col):
    longitude = round(-180 + (grid_col + 0.5) * 0.05, 6)
    latitude = round(60 - (grid_row + 0.5) * 0.05, 6)
    day = row["observed_at"][:10]
    return (
        "INSERT INTO observations (resource_id, run_id, row_key, series_key, period_start, period_end, "
        "period_label, location_id, location_code, location_kind, location_name, metric_id, metric_name, "
        "product, unit, value, dimensions, source_row_ref, quality_status, quality) "
        "VALUES (?, ?, ?, 'rainfall:daily:grid_cell:mm', ?, ?, ?, ?, ?, 'grid', ?, 'rainfall', 'Rainfall', "
        "'CHIRPS v3.0 Daily final RNL', ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(resource_id, run_id, row_key) DO UPDATE SET period_start=excluded.period_start, "
        "period_end=excluded.period_end, period_label=excluded.period_label, location_id=excluded.location_id, "
        "location_code=excluded.location_code, location_kind=excluded.location_kind, "
        "location_name=excluded.location_name, metric_id=excluded.metric_id, metric_name=excluded.metric_name, "
        "product=excluded.product, unit=excluded.unit, value=excluded.value, dimensions=excluded.dimensions, "
        "source_row_ref=excluded.source_row_ref, quality_status=excluded.quality_status, quality=excluded.quality",
        [RESOURCE_ID, run_id, row["observation_id"], day, day, day, row["location_id"], row["location_id"],
         row["location_id"], row["unit"], row["value"],
         _json({"gridRow": grid_row, "gridCol": grid_col, "longitude": longitude, "latitude": latitude}),
         row["observation_id"], row["quality_flag"], _json({
             "revisionId": row["revision_id"], "sourceUrl": row["source_url"],
             "licenseStatus": row["license_status"], "qualityFlag": row["quality_flag"],
         })],
    )


def _mark_failed(client, run_id, error_code):
    if not run_id:
        return
    try:
        client.execute(
            "UPDATE sync_runs SET status='failed', completed_at=?, error_code=? "
            "WHERE run_id=? AND status='running'",
            [_iso(_now()), error_code, run_id],
        )
    except Exception:
        # The original write failure matters most; the old active run is untouched.
        pass


def _returned(result, field, value):
    if not isinstance(result, dict):
        return False
    rows = result.get("results")
    return isinstance(rows, list) and any(isinstance(row, dict) and row.get(field) == value for row in rows)


def _source_updated_at(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return _iso(parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc))
    except (TypeError, ValueError):
        return None


def _utc(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as exc:
        raise NumericSyncError("INVALID_TIMESTAMP") from exc
    if result.tzinfo is None:
        raise NumericSyncError("INVALID_TIMESTAMP")
    return result.astimezone(timezone.utc)


def _now():
    return datetime.now(timezone.utc)


def _iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
