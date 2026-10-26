"""GISTDA 7-day flood polygons → Cloudflare D1 observations (Round 1, Lane F).

Contract owner: ``docs/assignments/2026-10-26-real-data-initiative.md`` §3.1-§3.2.
This module is the numeric adapter behind ``tadih ingest --adapter gistda`` and
``scripts/sync_gistda_to_d1.py``.

What it publishes
-----------------
The GISTDA Disaster Open API serves the 7-day flood inundation polygons as a
GeoJSON ``FeatureCollection``. Each feature carries the DOPA province /
amphoe / tambon codes, the inundated area in square metres (``f_area``), the
affected rice area in square metres (``rice_area``) and the satellite scene
identifiers (``file_name``) the delineation was derived from.

The adapter aggregates the polygons per DOPA province code and publishes three
*separate* measures per province:

===============  =========  ================================================
measure          unit       meaning
===============  =========  ================================================
flood_area_rai   rai        summed polygon area (1 rai = 1,600 m²)
flood_area_km2   km2        summed polygon area (km²)
rice_area_rai    rai        summed affected rice area (1 rai = 1,600 m²)
===============  =========  ================================================

The two flood units are never added together and never converted into one
another inside a single measure: both are derived from the same square-metre
total and stay separate rows (AGENTS.md rule 4).

Governance rules enforced here
------------------------------
* The licence gate runs first: ``config/resource_licenses.json`` must hold the
  exact resource ``gistda_flood_7days_daily`` as ``approved_public`` with
  ``project_publication_approved = true`` and an empty ``unresolved`` list,
  otherwise the writer refuses with ``RESOURCE_NOT_APPROVED`` before D1 is
  touched.
* ``source_url`` is always the clean public endpoint. The raw gateway response
  echoes the API key inside ``links[].href``, so the raw payload is never
  logged, printed, written to a file or published.
* A province without a polygon is *absent*, never ``0``. A province whose
  source attributes are missing keeps ``value = null`` with
  ``quality_flag = "missing"``.
* ``data_kind`` is ``estimated``: SAR flood delineation is an approximation of
  the inundated area, not an official statistic.
* Chronology: ``observed_at`` is the feed's own product stamp (a stamp written
  without an offset is read as the service's ICT clock) and ``retrieved_at`` is
  the instant that product was captured. A capture never precedes the product
  it captured, so the retrieval is lifted to the product stamp while the two
  clocks are within ``MAX_SOURCE_CLOCK_SKEW_SECONDS`` of each other; a product
  stamp further ahead than that is refused (``SOURCE_TIMESTAMP_INVALID``)
  instead of being rewritten into a plausible-looking provenance.
* ``--dry-run`` is the default and never touches D1.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from typing import Any, Callable, Iterable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .env import get_gistda_api_key, load_dotenv
from .observations import (
    ObservationWriteError,
    load_approved_resource,
    publish_observations,
    register_resource,
)
from .quality import validate_observation

ROOT = Path(__file__).resolve().parents[2]

SOURCE_ID = "gistda"
RESOURCE_KEY = "gistda_flood_7days_daily"
RESOURCE_ID = "https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days"
#: The public, credential-free endpoint. Never publish the request URL.
PUBLIC_SOURCE_URL = RESOURCE_ID
ADAPTER_VERSION = "gistda-flood-d1-1.0.0"

MEASURE_FLOOD_RAI = "flood_area_rai"
MEASURE_FLOOD_KM2 = "flood_area_km2"
MEASURE_RICE_RAI = "rice_area_rai"
MEASURES = (MEASURE_FLOOD_RAI, MEASURE_FLOOD_KM2, MEASURE_RICE_RAI)

UNIT_RAI = "rai"
UNIT_KM2 = "km2"

#: 1 rai = 1,600 m² (Thai official unit). 1 km² = 625 rai.
SQM_PER_RAI = 1600.0
SQM_PER_KM2 = 1_000_000.0

#: The service publishes a rolling 7-day window, so a batch date may not be
#: older than the window that the current dataset covers.
WINDOW_DAYS = 7

#: Satellite scene prefixes that the GISTDA flood service documents. Tokens
#: that are not listed here are kept verbatim in ``satelliteSceneIds`` and are
#: never mapped to a platform by guesswork.
SATELLITE_FAMILY_BY_PREFIX = {
    "s1a": "Sentinel-1",
    "s1b": "Sentinel-1",
    "s1c": "Sentinel-1",
    "s1d": "Sentinel-1",
    "rd2": "Radarsat-2",
}

PROVINCE_NAME_PREFIX = "จังหวัด"


class GistdaFetchError(RuntimeError):
    """The upstream GISTDA call failed; carries a stable error code."""

    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or code)
        self.code = code


# ---------------------------------------------------------------------------
# Upstream call
# ---------------------------------------------------------------------------

def fetch_flood_feature_collection(
    api_key: str | None = None,
    *,
    timeout: float = 30.0,
    opener: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """Fetch the GISTDA 7-day flood FeatureCollection (one bounded request).

    The request URL carries the API key, so it is never returned, logged or
    printed. Only the parsed JSON payload leaves this function.
    """
    key = (api_key or get_gistda_api_key() or "").strip()
    if not key:
        raise GistdaFetchError(
            "GISTDA_API_KEY_MISSING",
            "GISTDA_API_KEY is not configured in .env",
        )
    url = f"{PUBLIC_SOURCE_URL}?api_key={key}"
    request = Request(
        url,
        headers={
            "User-Agent": "TADIH-ThailandAgriculturalDataHub/1.0",
            "Accept": "application/geo+json, application/json",
        },
    )
    open_url = opener or urlopen
    try:
        with open_url(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:  # pragma: no cover - network path
        raise GistdaFetchError("GISTDA_HTTP_ERROR", f"GISTDA returned HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:  # pragma: no cover - network path
        raise GistdaFetchError("GISTDA_UNAVAILABLE", "GISTDA gateway is unreachable") from exc
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GistdaFetchError("GISTDA_INVALID_RESPONSE", "GISTDA returned a non-JSON body") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise GistdaFetchError("GISTDA_INVALID_RESPONSE", "GISTDA returned no FeatureCollection")
    return payload


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _province_code(value: Any) -> str:
    code = _text(value)
    if not code.isdigit():
        return ""
    return code.zfill(2)


def _province_name_th(value: Any) -> str:
    """Normalise the Thai province label ("จ.สุโขทัย" → "สุโขทัย")."""
    name = _text(value)
    if name.startswith("จ."):
        name = name[2:].strip()
    return name


def _scene_ids(value: Any) -> list[str]:
    if isinstance(value, (list, tuple)):
        raw = list(value)
    else:
        raw = _text(value).split(",")
    seen: list[str] = []
    for item in raw:
        token = _text(item)
        if token and token not in seen:
            seen.append(token)
    return seen


def satellite_families(scene_ids: Iterable[str]) -> list[str]:
    """Map documented GISTDA scene prefixes onto satellite families.

    Unknown prefixes are never guessed; the raw token stays available in
    ``satelliteSceneIds``.
    """
    families: list[str] = []
    for token in scene_ids:
        prefix = token.split("_", 1)[0].lower()
        family = SATELLITE_FAMILY_BY_PREFIX.get(prefix)
        if family and family not in families:
            families.append(family)
    return families


def normalize_polygon(feature: Mapping[str, Any], *, retrieved_at: str) -> dict[str, Any] | None:
    """Normalise one GeoJSON feature into a polygon record.

    Returns ``None`` when the feature carries no usable area, because a
    polygon without an area cannot be aggregated (missing stays missing).
    """
    properties = feature.get("properties") if isinstance(feature, Mapping) else None
    properties = properties if isinstance(properties, Mapping) else {}
    flood_area_sqm = _number(properties.get("f_area"))
    if flood_area_sqm is None:
        flood_area_sqm = _number(properties.get("_area"))
    if flood_area_sqm is None:
        return None
    rice_area_sqm = _number(properties.get("rice_area"))
    scene_ids = _scene_ids(properties.get("file_name"))
    return {
        "feature_id": _text(properties.get("_id")) or _text(feature.get("id")),
        "province_code": _province_code(properties.get("pv_idn")),
        "province_name_th": _province_name_th(properties.get("pv_tn")),
        "province_name_en": _text(properties.get("pv_en")),
        "amphoe_code": _text(properties.get("ap_idn")),
        "tambon_code": _text(properties.get("tb_idn")),
        "tambon_name_th": _province_name_th(properties.get("tb_tn")),
        "flood_area_sqm": flood_area_sqm,
        "rice_area_sqm": rice_area_sqm,
        "satellite_scene_ids": scene_ids,
        "source_updated_at": _text(properties.get("_updatedAt")),
        "retrieved_at": retrieved_at,
    }


def normalize_feature_collection(
    payload: Mapping[str, Any],
    *,
    retrieved_at: str | None = None,
) -> dict[str, Any]:
    """Normalise a GISTDA FeatureCollection into polygon records.

    The result never contains the raw payload, so the API key echoed inside
    ``links[].href`` cannot leak into a file, a log or the database.
    """
    retrieved = retrieved_at or _now_iso()
    features = payload.get("features") if isinstance(payload, Mapping) else None
    polygons: list[dict[str, Any]] = []
    for feature in features or []:
        if not isinstance(feature, Mapping):
            continue
        polygon = normalize_polygon(feature, retrieved_at=retrieved)
        if polygon is None or not polygon["province_code"]:
            continue
        polygons.append(polygon)
    time_stamp = _text(payload.get("timeStamp")) if isinstance(payload, Mapping) else ""
    return {
        "retrieved_at": retrieved,
        "time_stamp": time_stamp,
        "polygons": polygons,
    }


def polygons_from_snapshot(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Normalise the bundled snapshot (``web/data/gistda_flood_7days.json``).

    The snapshot stores the same upstream attributes in the flat shape the
    GISTDA connector writes; it is used for offline/dry runs only.
    """
    retrieved = _text(payload.get("metadata", {}).get("retrieved_at")) if isinstance(payload, Mapping) else ""
    retrieved = retrieved or _now_iso()
    polygons: list[dict[str, Any]] = []
    for record in (payload.get("records") or []) if isinstance(payload, Mapping) else []:
        if not isinstance(record, Mapping):
            continue
        flood_area_sqm = _number(record.get("inundated_area_sqm"))
        rice_area_rai = _number(record.get("inundated_rice_area_rai"))
        province_code = _province_code(record.get("dopa_province_code"))
        if flood_area_sqm is None or not province_code:
            continue
        polygons.append({
            "feature_id": _text(record.get("feature_id")),
            "province_code": province_code,
            "province_name_th": "",
            "province_name_en": _text(record.get("province_name_en")),
            "amphoe_code": _text(record.get("dopa_amphoe_code")),
            "tambon_code": _text(record.get("dopa_tambon_code")),
            "tambon_name_th": "",
            "flood_area_sqm": flood_area_sqm,
            "rice_area_sqm": None if rice_area_rai is None else rice_area_rai * SQM_PER_RAI,
            "satellite_scene_ids": _scene_ids(record.get("satellite_sources")),
            "source_updated_at": "",
            "retrieved_at": retrieved,
        })
    return {
        "retrieved_at": retrieved,
        "time_stamp": retrieved,
        "polygons": polygons,
    }


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def aggregate_by_province(polygons: Sequence[Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    """Sum the polygon areas per DOPA province code.

    Only provinces that actually have a polygon appear in the result: a
    province without polygons is absent (never ``0``). The rice total is only
    complete when every polygon of the province reports a rice area.
    """
    aggregates: dict[str, dict[str, Any]] = {}
    for polygon in polygons:
        code = _text(polygon.get("province_code"))
        if not code:
            continue
        entry = aggregates.setdefault(code, {
            "province_code": code,
            "province_name_th": _text(polygon.get("province_name_th")),
            "province_name_en": _text(polygon.get("province_name_en")),
            "flood_area_sqm": 0.0,
            "rice_area_sqm": 0.0,
            "rice_polygons_with_value": 0,
            "polygon_count": 0,
            "tambon_codes": [],
            "satellite_scene_ids": [],
        })
        entry["polygon_count"] += 1
        entry["flood_area_sqm"] += float(polygon.get("flood_area_sqm") or 0.0)
        rice_area_sqm = polygon.get("rice_area_sqm")
        if rice_area_sqm is None:
            entry["rice_area_sqm"] = None
        elif entry["rice_area_sqm"] is not None:
            entry["rice_area_sqm"] += float(rice_area_sqm)
            entry["rice_polygons_with_value"] += 1
        tambon_code = _text(polygon.get("tambon_code"))
        if tambon_code and tambon_code not in entry["tambon_codes"]:
            entry["tambon_codes"].append(tambon_code)
        for token in polygon.get("satellite_scene_ids") or []:
            token = _text(token)
            if token and token not in entry["satellite_scene_ids"]:
                entry["satellite_scene_ids"].append(token)
        if not entry["province_name_th"]:
            entry["province_name_th"] = _text(polygon.get("province_name_th"))
        if not entry["province_name_en"]:
            entry["province_name_en"] = _text(polygon.get("province_name_en"))
    for entry in aggregates.values():
        entry["tambon_count"] = len(entry["tambon_codes"])
        entry["satellite_families"] = satellite_families(entry["satellite_scene_ids"])
        entry["rice_area_complete"] = entry["rice_polygons_with_value"] == entry["polygon_count"]
    return dict(sorted(aggregates.items()))


# ---------------------------------------------------------------------------
# Observation rows
# ---------------------------------------------------------------------------

def _round(value: float, digits: int) -> float:
    return round(value + 0.0, digits)


def build_observation_rows(
    aggregates: Mapping[str, Mapping[str, Any]],
    *,
    observed_at: str,
    retrieved_at: str,
    revision_id: str,
    batch_date: str,
    license_status: str = "approved_public",
    source_url: str = PUBLIC_SOURCE_URL,
) -> list[dict[str, Any]]:
    """Build the canonical observation rows (one row per province and measure)."""
    rows: list[dict[str, Any]] = []
    for code in sorted(aggregates):
        entry = aggregates[code]
        flood_rai = _round(float(entry["flood_area_sqm"]) / SQM_PER_RAI, 2)
        flood_km2 = _round(float(entry["flood_area_sqm"]) / SQM_PER_KM2, 6)
        if entry.get("rice_area_complete") and entry.get("rice_area_sqm") is not None:
            rice_rai: float | None = _round(float(entry["rice_area_sqm"]) / SQM_PER_RAI, 2)
        else:
            # Missing stays null: a partial rice total is not the provincial total.
            rice_rai = None
        for measure, value, unit in (
            (MEASURE_FLOOD_RAI, flood_rai, UNIT_RAI),
            (MEASURE_FLOOD_KM2, flood_km2, UNIT_KM2),
            (MEASURE_RICE_RAI, rice_rai, UNIT_RAI),
        ):
            rows.append({
                "observation_id": f"gistda-flood-7days:{batch_date}:{code}:{measure}",
                "source_id": SOURCE_ID,
                "area_code": code,
                "spatial_support": "province",
                "location_id": location_id(code),
                "commodity_id": None,
                "observed_at": observed_at,
                "release_at": observed_at,
                "retrieved_at": retrieved_at,
                "measure": measure,
                "value": value,
                "unit": unit,
                "data_kind": "estimated",
                "revision_id": revision_id,
                "quality_flag": "good" if value is not None else "missing",
                "source_url": source_url,
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })
    return rows


def location_id(province_code: str) -> str:
    """Stable, source-scoped location id (never collides with other lanes)."""
    return f"gistda-province-{province_code}"


def locations_for(aggregates: Mapping[str, Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    """Location rows for the published provinces (kind = province)."""
    locations: dict[str, dict[str, Any]] = {}
    for code, entry in aggregates.items():
        name = _text(entry.get("province_name_th")) or _text(entry.get("province_name_en")) or code
        locations[location_id(code)] = {
            "kind": "province",
            "nativeCode": code,
            "name": name,
            "provinceCode": code,
        }
    return locations


def dimensions_builder(
    aggregates: Mapping[str, Mapping[str, Any]],
    *,
    batch_date: str,
    time_stamp: str,
) -> Callable[[Mapping[str, Any]], dict[str, Any]]:
    """Build the ``dimensions`` callback for the shared writer."""

    def build(observation: Mapping[str, Any]) -> dict[str, Any]:
        code = _text(observation.get("area_code"))
        entry = aggregates.get(code, {})
        return {
            "spatialSupport": "province",
            "dataKind": "estimated",
            "measure": observation.get("measure"),
            "areaCode": code,
            "method": "sum_polygon_area_by_dopa_province",
            "polygonCount": entry.get("polygon_count"),
            "tambonCount": entry.get("tambon_count"),
            "tambonCodes": entry.get("tambon_codes") or [],
            "satelliteSources": entry.get("satellite_families") or [],
            "satelliteSceneIds": entry.get("satellite_scene_ids") or [],
            "observationPeriod": "7days",
            "batchDate": batch_date,
            "sourceTimeStamp": time_stamp,
            "riceAreaPolygonsTotal": entry.get("polygon_count"),
            "riceAreaPolygonsWithValue": entry.get("rice_polygons_with_value"),
            "qualityNote": (
                "พื้นที่ที่ประมาณจากการตรวจจับน้ำท่วมด้วยภาพถ่ายดาวเทียม SAR (Sentinel-1/Radarsat-2) "
                "ผ่าน GISTDA API Gateway — เป็นค่าประมาณเชิงพื้นที่ ไม่ใช่สถิติทางการ "
                "และครอบคลุมเฉพาะจังหวัดที่ตรวจพบ polygon น้ำท่วม"
            ),
        }

    return build


# ---------------------------------------------------------------------------
# Batch preparation
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


#: GISTDA is a Thai service: a stamp it writes without an offset is ICT (UTC+7).
SOURCE_UTC = timezone(timedelta(hours=7))

#: The gateway stamps its product with its own clock.  Seconds of drift against
#: our capture clock are normal and are absorbed by moving the retrieval
#: instant up to the product stamp; a larger gap means the stamp is not a real
#: observation instant, and the batch is refused rather than rewritten.
MAX_SOURCE_CLOCK_SKEW_SECONDS = 900


def _instant(value: Any) -> datetime | None:
    """Parse a source/capture instant into UTC (``None`` when unusable)."""
    text = _text(value).rstrip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text[:-1] + "+00:00") if text.endswith("Z") \
            else datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=SOURCE_UTC)
    return parsed.astimezone(timezone.utc)


def _stamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def observation_chronology(observed_at_raw: Any, retrieved_at_raw: Any) -> dict[str, Any]:
    """Resolve the observation/retrieval pair into a valid UTC chronology.

    ``observed_at`` is the instant the feed says the product was built;
    ``retrieved_at`` is the instant we captured it.  The capture can never
    precede the product it captured, so when the source clock runs ahead of
    ours the retrieval is lifted to the product stamp.  A source stamp that is
    unusable or wildly ahead is refused with ``SOURCE_TIMESTAMP_INVALID`` -
    the alternative is a published row whose provenance is invented.
    """
    captured = _instant(retrieved_at_raw)
    observed = _instant(observed_at_raw) or captured
    if captured is None or observed is None:
        raise GistdaFetchError(
            "SOURCE_TIMESTAMP_INVALID",
            f"neither the source timestamp ({observed_at_raw!r}) nor the capture "
            f"time ({retrieved_at_raw!r}) is a usable instant",
        )
    if (observed - captured).total_seconds() > MAX_SOURCE_CLOCK_SKEW_SECONDS:
        raise GistdaFetchError(
            "SOURCE_TIMESTAMP_INVALID",
            f"the feed reports {observed.isoformat()} but it was captured at "
            f"{captured.isoformat()} - the product claims a moment more than "
            f"{MAX_SOURCE_CLOCK_SKEW_SECONDS}s after its own retrieval",
        )
    retrieved = max(captured, observed)
    return {
        "observed_at": _stamp(observed),
        "retrieved_at": _stamp(retrieved),
        "source_clock_skew_seconds": round((observed - captured).total_seconds(), 3),
    }


def _dataset_date(time_stamp: str) -> str:
    stamp = _text(time_stamp)
    if stamp:
        try:
            return datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone(timezone.utc).date().isoformat()
        except ValueError:
            pass
    return ""


def resolve_batch_date(requested: str | None, dataset_date: str) -> str:
    """Resolve (and range-check) the batch date of the run.

    The service only serves a rolling 7-day window, so a batch date outside
    that window cannot be served and is refused instead of being relabelled.
    """
    if not requested:
        if not dataset_date:
            raise GistdaFetchError("BATCH_DATE_UNRESOLVED", "the source did not report a dataset timestamp")
        return dataset_date
    if not dataset_date:
        return requested
    start = datetime.fromisoformat(dataset_date).date() - timedelta(days=WINDOW_DAYS - 1)
    end = datetime.fromisoformat(dataset_date).date()
    try:
        chosen = datetime.fromisoformat(requested).date()
    except ValueError as exc:
        raise GistdaFetchError("BATCH_DATE_INVALID", "batch date must use YYYY-MM-DD") from exc
    if not (start <= chosen <= end):
        raise GistdaFetchError(
            "BATCH_DATE_OUT_OF_RANGE",
            f"the GISTDA endpoint serves a rolling {WINDOW_DAYS}-day window "
            f"({start.isoformat()}..{end.isoformat()}); {requested} is outside it",
        )
    return requested


def prepare_batch(
    dataset: Mapping[str, Any],
    *,
    batch_date: str | None = None,
    license_status: str = "approved_public",
    source_url: str = PUBLIC_SOURCE_URL,
) -> dict[str, Any]:
    """Turn a normalised dataset into the publishable batch."""
    polygons = list(dataset.get("polygons") or [])
    aggregates = aggregate_by_province(polygons)
    if not aggregates:
        raise GistdaFetchError("NO_FLOOD_POLYGONS", "the source returned no usable flood polygon")
    captured_at = _text(dataset.get("retrieved_at")) or _now_iso()
    time_stamp = _text(dataset.get("time_stamp")) or captured_at
    chronology = observation_chronology(time_stamp, captured_at)
    observed_at = chronology["observed_at"]
    retrieved_at = chronology["retrieved_at"]
    dataset_date = _dataset_date(observed_at)
    resolved_date = resolve_batch_date(batch_date, dataset_date)
    revision_id = f"gistda-flood-7days:{observed_at}"
    rows = build_observation_rows(
        aggregates,
        observed_at=observed_at,
        retrieved_at=retrieved_at,
        revision_id=revision_id,
        batch_date=resolved_date,
        license_status=license_status,
        source_url=source_url,
    )
    return {
        "rows": rows,
        "aggregates": aggregates,
        "batch_date": resolved_date,
        "dataset_date": dataset_date,
        "observed_at": observed_at,
        "retrieved_at": retrieved_at,
        "revision_id": revision_id,
        "time_stamp": time_stamp,
        "source_clock_skew_seconds": chronology["source_clock_skew_seconds"],
        "polygon_count": len(polygons),
    }


def validate_rows(rows: Sequence[Mapping[str, Any]]) -> list[str]:
    """Validate the rows against the observation contract (offline)."""
    problems: list[str] = []
    for row in rows:
        try:
            validate_observation(dict(row))
        except (TypeError, ValueError) as exc:
            problems.append(f"{row.get('observation_id')}: {exc}")
    return problems


# ---------------------------------------------------------------------------
# Adapter entry point
# ---------------------------------------------------------------------------

def run_adapter(
    *,
    client: Any = None,
    dry_run: bool = False,
    write: bool = False,
    date: str | None = None,
    batch_date: str | None = None,
    snapshot_path: str | Path | None = None,
    timeout: float = 30.0,
    registry_path: str | Path | None = None,
    fetcher: Callable[[], Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Prepare (and optionally publish) one GISTDA flood batch.

    ``write=False`` (the default) never touches D1: the rows are prepared and
    validated locally and the returned envelope reports what would be written.

    Shared CLI keyword contract (same shape as lanes C/D, enforced by
    :func:`tadih.cli.call_adapter`): the ``tadih ingest --adapter gistda``
    dispatch calls this function with the keyword arguments ``client``,
    ``dry_run``, ``write`` and ``date``. The flags must be declared here, or a
    ``--date`` from the CLI would be dropped silently and a bare
    ``tadih ingest --adapter gistda`` must never write (dry-run is default).
    ``batch_date`` is the module-native alias of ``date``; when both are given
    the CLI ``date`` wins. ``dry_run`` together with ``write`` is refused.
    """
    if dry_run and write:
        raise GistdaFetchError(
            "ADAPTER_FLAGS_CONFLICT",
            "--dry-run and --write cannot be combined",
        )
    resolved_date = date if date else batch_date
    resource = load_approved_resource(RESOURCE_KEY, registry_path=registry_path)

    if snapshot_path:
        snapshot = json.loads(Path(snapshot_path).read_text(encoding="utf-8-sig"))
        dataset = polygons_from_snapshot(snapshot)
        source_mode = "snapshot"
    else:
        if fetcher is None:
            load_dotenv(override=True)
            fetcher = lambda: fetch_flood_feature_collection(timeout=timeout)
        payload = fetcher()
        dataset = normalize_feature_collection(payload)
        source_mode = "live"

    batch = prepare_batch(
        dataset,
        batch_date=resolved_date,
        license_status=resource["license_status"],
        source_url=PUBLIC_SOURCE_URL,
    )
    rows = batch["rows"]
    problems = validate_rows(rows)
    if problems:
        raise GistdaFetchError("ROWS_INVALID", "; ".join(problems[:3]))

    coverage = {
        "mode": "daily_full",
        "count": len(rows),
        "polygon_count": batch["polygon_count"],
        "province_count": len(batch["aggregates"]),
        "batch_date": batch["batch_date"],
        "observation_window_days": WINDOW_DAYS,
        "source_mode": source_mode,
        "method": "sum_polygon_area_by_dopa_province",
        "grain": "province x daily product",
        "note": (
            "เฉพาะจังหวัดที่ตรวจพบ polygon น้ำท่วมในช่วง 7 วันของ service "
            "จังหวัดที่ไม่มี polygon ไม่มีค่า (null/absent) ไม่ใช่ 0"
        ),
    }

    if not write:
        return {
            "mode": "dry_run",
            "status": "dry_run",
            "adapter_version": ADAPTER_VERSION,
            "resource_id": resource["resource_id"],
            "source_id": SOURCE_ID,
            "license_status": resource["license_status"],
            "source_mode": source_mode,
            "batch_date": batch["batch_date"],
            "observed_at": batch["observed_at"],
            "retrieved_at": batch["retrieved_at"],
            "source_clock_skew_seconds": batch["source_clock_skew_seconds"],
            "revision_id": batch["revision_id"],
            "polygon_count": batch["polygon_count"],
            "province_count": len(batch["aggregates"]),
            "records_read": len(rows),
            "records_written": 0,
            "coverage": coverage,
            "rows": [
                {
                    "observation_id": row["observation_id"],
                    "area_code": row["area_code"],
                    "measure": row["measure"],
                    "value": row["value"],
                    "unit": row["unit"],
                    "quality_flag": row["quality_flag"],
                }
                for row in rows
            ],
        }

    if client is None:
        raise GistdaFetchError("D1_CLIENT_MISSING", "a D1 client is required for --write")

    register_resource(
        client,
        resource=resource,
        source_name="สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน) - GISTDA",
        base_url="https://api-gateway.gistda.or.th",
        connector_kind="api",
        category="disaster",
        grain="province x daily 7-day flood product",
        resource_format="GeoJSON",
        dataset_title=resource.get("name"),
        dataset_description=(
            "พื้นที่น้ำท่วมรอบ 7 วันล่าสุด (polygon) พร้อมพื้นที่นาข้าวที่ได้รับผลกระทบ "
            "จาก GISTDA Satellite API Gateway"
        ),
        attribution_url=resource.get("attribution_url"),
    )

    result = publish_observations(
        client,
        resource=resource,
        rows=rows,
        adapter_version=ADAPTER_VERSION,
        coverage=coverage,
        completeness="partial",
        unit=None,
        retrieved_at=batch["retrieved_at"],
        product=resource.get("name"),
        period_grain="daily",
        dimensions_for=dimensions_builder(
            batch["aggregates"], batch_date=batch["batch_date"], time_stamp=batch["time_stamp"],
        ),
        locations=locations_for(batch["aggregates"]),
    )
    return {"mode": "write", "source_mode": source_mode, **result}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih-ingest-gistda",
        description="Publish GISTDA 7-day flood polygons to Cloudflare D1 (dry-run by default).",
    )
    result.add_argument("--dry-run", action="store_true", help="prepare the batch without writing to D1 (default)")
    result.add_argument("--write", action="store_true", help="publish the batch to the configured Cloudflare D1")
    result.add_argument("--date", help="batch date YYYY-MM-DD (must fall inside the served 7-day window)")
    result.add_argument("--snapshot", help="offline snapshot JSON instead of the live GISTDA call")
    result.add_argument("--timeout", type=float, default=30.0, help="upstream timeout in seconds")
    return result


def main(argv: list[str] | None = None, *, client: Any = None) -> int:
    args = parser().parse_args(list(argv) if argv is not None else [])
    if args.dry_run and args.write:
        print(json.dumps({
            "status": "failed",
            "errorCode": "ADAPTER_FLAGS_CONFLICT",
            "message": "--dry-run and --write cannot be combined",
        }, ensure_ascii=False), file=sys.stderr)
        return 2
    write = bool(args.write)
    if write and client is None:
        from .hub_catalog_sync import connect_d1_client
        try:
            client = connect_d1_client()
        except Exception as exc:
            code = getattr(exc, "code", None) or "D1_NOT_CONFIGURED"
            print(json.dumps({
                "status": "failed", "errorCode": code, "message": str(exc)[:200],
            }, ensure_ascii=False), file=sys.stderr)
            return 2
    try:
        result = run_adapter(
            client=client,
            write=write,
            batch_date=args.date,
            snapshot_path=args.snapshot,
            timeout=args.timeout,
        )
    except ObservationWriteError as exc:
        print(json.dumps({
            "status": "failed", "errorCode": exc.code, "message": str(exc)[:300],
        }, ensure_ascii=False), file=sys.stderr)
        return 1
    except GistdaFetchError as exc:
        print(json.dumps({
            "status": "failed", "errorCode": exc.code, "message": str(exc)[:300],
        }, ensure_ascii=False), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({
            "status": "failed", "errorCode": "ADAPTER_FAILED", "message": str(exc)[:300],
        }, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
