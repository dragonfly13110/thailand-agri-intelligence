"""MODIS MOD13A1 point evidence mapped onto the shared D1 observation writer (Lane L6).

The registry row ``planetary_computer_modis13a1_point`` authorizes this lane's
publication *only once governance clears its unresolved review item* — see
:func:`publication_gate`. Nothing here writes to D1: this module turns Planetary
Computer point envelopes into contract-valid rows, and the ingest adapter stays
dry-run by default.

Honesty rules enforced in the mapping:

* cloud/snow/unspecified pixels null the NDVI value (fail-closed masking) and
  carry the provider's own quality token in ``dimensions`` — a cloud-covered
  pixel is *missing*, never a zero and never the raw scaled value;
* missing stays ``value = None`` with ``quality_flag = "missing"``;
* NDVI keeps its unitless ``index`` unit and the exact 4-decimal scaled value —
  it is never relabelled as a percentage, a yield or a field-wide measurement;
* the 16-day composite window, tile id and item id travel in ``dimensions``
  because the shared writer's ``point`` grain only stores the composite start
  instant in ``period_start``/``period_end``.
"""

from __future__ import annotations

from datetime import datetime, timezone
import re
from pathlib import Path
from typing import Any, Mapping

from .catalog import load_resource_licenses
from .observations import (
    DEFAULT_REGISTRY_PATH,
    ObservationWriteError,
    assert_resource_approved,
)
from .quality import validate_observation
from .satellite import _parse_modis_item_dates, normalize_modis_point

SOURCE_ID = "modis"
RESOURCE_KEY = "planetary_computer_modis13a1_point"
RESOURCE_ID = "modis-13A1-061"
COLLECTION = "modis-13A1-061"
DATASET_ID = "MOD13A1.061"
ADAPTER_VERSION = "modis-ndvi-d1-1.0.0"

#: Provider quality tokens where an NDVI value must not be trusted at all.
#: ``marginal`` is deliberately excluded: the pixel has a real reading, and its
#: lower confidence is published via ``dimensions`` instead of being dropped.
UNUSABLE_NDVI_FLAGS = ("fill_no_data", "snow_ice", "cloud_contaminated", "unspecified")

MEASURE_NDVI = "ndvi"
TILE_PATTERN = re.compile(r"h(\d{2}v\d{2})")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def publication_gate(
    resource_key: str = RESOURCE_KEY,
    *,
    registry_path: Path | str | None = None,
) -> dict[str, Any]:
    """Report whether the registry row currently clears the publication gate.

    Returns the registry row even when the gate refuses, so a dry-run can show
    exactly which unresolved item blocks publication. Never mutates anything.
    """
    rows = load_resource_licenses(registry_path or DEFAULT_REGISTRY_PATH)
    matches = [row for row in rows if row.get("resource_key") == resource_key]
    if len(matches) != 1:
        return {
            "passed": False,
            "errorCode": "RESOURCE_APPROVAL_MISSING",
            "message": "registry must contain the resource exactly once",
            "resource": None,
        }
    row = matches[0]
    try:
        assert_resource_approved(row)
    except ObservationWriteError as exc:
        return {
            "passed": False,
            "errorCode": exc.code,
            "message": str(exc),
            "unresolved": list(row.get("unresolved") or []),
            "resource": row,
        }
    return {"passed": True, "errorCode": None, "message": None, "resource": row}


def composite_window(item_id: str, envelope: Mapping[str, Any]) -> tuple[str | None, str | None]:
    start = envelope.get("start_datetime") or _parse_modis_item_dates(item_id or "")[0]
    end = envelope.get("end_datetime") or _parse_modis_item_dates(item_id or "")[1]
    return start, end


def tile_id_for(item_id: str | None) -> str | None:
    match = TILE_PATTERN.search(item_id or "")
    return f"h{match.group(1)}" if match else None


def location_id_for(lat: Any, lon: Any) -> str:
    return f"point:{lat}:{lon}"


def map_envelope(envelope: Mapping[str, Any], *, license_status: str = "approved_public") -> dict[str, Any]:
    """One point envelope -> contract-valid writer rows plus per-row dimensions.

    ``normalize_modis_point`` keeps the provider's own quality vocabulary
    (``cloud_contaminated``, ``fill_no_data``...); the shared writer only
    accepts ``good``/``missing``, so this mapping remaps the flags and stores
    the original token in ``dimensions.sourceQualityFlag`` for auditability.
    """
    normalized = normalize_modis_point(dict(envelope), license_status=license_status)
    item_id = normalized.get("item_id") or envelope.get("item_id") or ""
    start, end = composite_window(item_id, envelope)
    tile = tile_id_for(item_id)

    rows: list[dict[str, Any]] = []
    dimensions_by_id: dict[str, dict[str, Any]] = {}
    for observation in normalized["observations"]:
        measure = observation["measure"]
        source_flag = observation["quality_flag"]
        value = observation["value"]
        masked = measure == MEASURE_NDVI and (value is None or source_flag in UNUSABLE_NDVI_FLAGS)
        if masked:
            value = None
            quality_flag = "missing"
        else:
            quality_flag = "missing" if value is None else "good"
        row = {**observation, "value": value, "quality_flag": quality_flag}
        rows.append(validate_observation(row))
        dimensions_by_id[row["observation_id"]] = {
            "spatialSupport": "grid_point",
            "dataKind": "observed",
            "measure": measure,
            "collection": COLLECTION,
            "modis_item_id": item_id,
            "tile_id": tile,
            "composite_start": start,
            "composite_end": end,
            "compositeDays": 16,
            "resolutionMeters": 500,
            "sourceQualityFlag": source_flag,
            "ndviMasked": masked,
            "coverageNote": (
                "จุดกริดเดียว 500 ม. จาก composite 16 วัน — ไม่ใช่ข้อมูลครอบคลุมทั้งแปลง "
                "หรือทั้งจังหวัด; ค่าที่ถูก cloud/snow mask คงเป็น null ไม่แทนด้วย 0"
            ),
        }

    return {
        "rows": rows,
        "dimensions_by_id": dimensions_by_id,
        "location_id": normalized["location_id"],
        "item_id": item_id,
        "tile_id": tile,
        "composite_start": start,
        "composite_end": end,
        "retrieved_at": envelope.get("retrieved_at"),
        "observed_at": normalized["observed_at"],
        "ndvi": next((row["value"] for row in rows if row["measure"] == MEASURE_NDVI), None),
        "source_urls": sorted({row["source_url"] for row in rows}),
    }


def prepare_batch(
    envelopes: Any,
    *,
    license_status: str = "approved_public",
) -> dict[str, Any]:
    """Merge point envelopes into one writer-ready batch (never touches D1)."""
    mapped = [map_envelope(envelope, license_status=license_status) for envelope in envelopes]
    rows: list[dict[str, Any]] = []
    dimensions_by_id: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    for entry in mapped:
        for row in entry["rows"]:
            if row["observation_id"] in seen:
                raise ValueError(f"duplicate observation_id {row['observation_id']!r} across envelopes")
            seen.add(row["observation_id"])
            rows.append(row)
            dimensions_by_id[row["observation_id"]] = entry["dimensions_by_id"][row["observation_id"]]

    locations: dict[str, dict[str, Any]] = {}
    points: list[dict[str, Any]] = []
    for entry in mapped:
        location_id = entry["location_id"]
        parts = location_id.split(":")
        label = f"จุดกริด MODIS {parts[1]},{parts[2]}" if len(parts) == 3 else location_id
        # A grid point is not a province: provinceCode stays NULL on purpose.
        locations[location_id] = {"kind": "grid", "name": label}
        points.append({
            "location_id": location_id,
            "item_id": entry["item_id"],
            "tile_id": entry["tile_id"],
            "composite_start": entry["composite_start"],
            "composite_end": entry["composite_end"],
            "ndvi": entry["ndvi"],
            "retrieved_at": entry["retrieved_at"],
        })

    retrieved_at = max((entry["retrieved_at"] for entry in mapped if entry.get("retrieved_at")), default=_now_iso())
    tiles = sorted({entry["tile_id"] for entry in mapped if entry["tile_id"]})
    coverage = {
        "mode": "grid_point_samples",
        "count": len(rows),
        "point_count": len(points),
        "tiles": tiles,
        "composite_start": min((p["composite_start"] for p in points if p["composite_start"]), default=None),
        "composite_end": max((p["composite_end"] for p in points if p["composite_end"]), default=None),
        "grain": "grid point x 16-day MOD13A1 composite",
        "note": (
            "จุดตัวอย่างกริด 500 ม. ตามพิกัดที่ระบุ ไม่ใช่การครอบคลุมทั้งพื้นที่เกษตร; "
            "จุดที่ไม่มีค่า (cloud/snow/fill) คง null ไว้"
        ),
    }
    return {
        "rows": rows,
        "dimensions_by_id": dimensions_by_id,
        "locations": locations,
        "points": points,
        "coverage": coverage,
        "retrieved_at": retrieved_at,
    }


def dimensions_for_factory(batch: Mapping[str, Any]):
    dimensions_by_id = batch["dimensions_by_id"]

    def build(observation: Mapping[str, Any]) -> dict[str, Any]:
        return dict(dimensions_by_id[observation["observation_id"]])

    return build
