"""TMD (Thai Meteorological Department) station observations -> Cloudflare D1.

Lane D of Round 1 ("Real Data Core"), see
``docs/assignments/2026-10-26-real-data-initiative.md`` sections 2 and 3.

This adapter publishes **only measured station observations** of the TMD open
data portal (``data.tmd.go.th``) into the shared ``observations`` table through
the fail-closed writer :func:`tadih.observations.publish_observations`.

Hard rules implemented here (never relaxed by a flag):

* **Forecast != observation.** No forecast stream is fetched by this adapter at
  all. The TMD NWP streams (``tadih.tmd_nwp``, ``tadih.tmd_hpc_nwp``) belong to
  the dedicated NWP/forecast tables, never to ``observations``.
* **Station data is not province data.** ``area_code`` stays ``NULL`` for every
  row; a province association that the payload carries is kept in
  ``dimensions.provinceCode`` only.
* **Missing stays missing.** A value the source does not publish is stored as
  ``NULL`` with ``quality_flag='missing'``; it is never replaced by ``0``.
* **Units are never invented.** The published ``unit`` column stays ``NULL``
  (the licence review confirms no official TMD field dictionary), so the writer
  records ``unit_status = pending_official_confirmation``. The unit the provider
  declares on the payload element (``<Rainfall Unit="mm">``) is kept as
  ``dimensions.providerUnit`` plus ``dimensions.unitEvidence`` for traceability.
  A *number* whose element carries no provider unit is refused outright; a field
  the payload does not carry at all is published as a ``null`` measurement, which
  claims no unit.
* **One grain per run.** The daily station series and the monthly
  ``ThailandMonthlyRainfall`` series are published as separate resources with
  their own period grain and series keys; they are never merged.
* **Buddhist era (พ.ศ.) is converted** with the shared helper
  ``tadih.tmd_archive.parse_tmd_timestamp`` and every stamp is stored as a UTC
  ISO-8601 instant; the source UTC+07:00 time stays in the observation
  dimensions (``observedAtSourceIct`` / ``observationDateIct``) so the source
  grain (the Thai calendar day of the 07:00 report) remains auditable.

Entry points:

* ``python -m tadih ingest --adapter tmd [--write] [--date YYYY-MM-DD] [-- --station 48451]``
* ``python scripts/sync_tmd_to_d1.py [--dry-run|--write] [--resource ...]``

``--dry-run`` is the default; ``--write`` is the only mode that touches D1.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
import hashlib
import json
import os
import sys
import xml.etree.ElementTree as ET
from typing import Any, Callable, Mapping, Optional, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:  # pragma: no cover - import style depends on how the module is loaded
    from tadih.catalog import load_provinces
    from tadih.env import load_dotenv
    from tadih.ingestion import trusted_ssl_context
    from tadih.observations import (
        ObservationWriteError,
        load_approved_resource,
        publish_observations,
    )
    from tadih.tmd_archive import (
        KNOWN_TMD_STATIONS,
        normalize_station_id,
        normalize_tmd_daily_station,
        parse_tmd_timestamp,
        validate_number,
        wind_speed_to_ms,
    )
except ImportError:  # pragma: no cover - direct execution fallback
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from tadih.catalog import load_provinces
    from tadih.env import load_dotenv
    from tadih.ingestion import trusted_ssl_context
    from tadih.observations import (
        ObservationWriteError,
        load_approved_resource,
        publish_observations,
    )
    from tadih.tmd_archive import (
        KNOWN_TMD_STATIONS,
        normalize_station_id,
        normalize_tmd_daily_station,
        parse_tmd_timestamp,
        validate_number,
        wind_speed_to_ms,
    )

ADAPTER_NAME = "tmd"
ADAPTER_VERSION = "tmd-station-d1/1.0.0"
SOURCE_ID = "tmd"
SOURCE_AGENCY = "กรมอุตุนิยมวิทยา (TMD)"
SOURCE_BASE_URL = "https://data.tmd.go.th"
DEFAULT_API_BASE_URL = "https://data.tmd.go.th/api"
LICENCE_STATUS = "approved_public"
DATA_KIND = "observed"
SPATIAL_SUPPORT = "station"
UNIT_PENDING_STATUS = "pending_official_confirmation"

# TMD blocks non-browser clients with HTTP 403; a standard browser User-Agent
# is required. The repository has no shared browser UA helper (tmd_archive.py
# does not fetch and tmd_nwp.py uses a plain product token), so the constant
# lives in this lane module only.
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

DEFAULT_RESOURCE_KEY = "tmd_weather_today_by_agro_daily"

# One entry per approved TMD resource in ``config/resource_licenses.json``.
# ``path`` is the upstream path, ``grain`` the period grain of the series and
# ``network`` the station network the payload belongs to.
RESOURCE_SPECS: dict[str, dict[str, str]] = {
    "tmd_weather_today_by_agro_daily": {
        "path": "/WeatherTodayByAgro/V1/",
        "grain": "daily",
        "network": "agro",
        "label": "TMD daily agro-meteorological station observations (WeatherTodayByAgro V1)",
    },
    "tmd_weather_today_station_daily": {
        "path": "/WeatherToday/V2/",
        "grain": "daily",
        "network": "station",
        "label": "TMD daily surface station observations (WeatherToday V2)",
    },
    "tmd_weather_today_by_synop_daily": {
        "path": "/weathertodayBySynop/V1/",
        "grain": "daily",
        "network": "synop",
        "label": "TMD daily synoptic station observations (weathertodayBySynop V1)",
    },
    "tmd_monthly_rainfall_monthly": {
        "path": "/ThailandMonthlyRainfall/v1/index.php",
        "grain": "monthly",
        "network": "monthly",
        "label": "TMD monthly rainfall and rainy days per station (ThailandMonthlyRainfall v1)",
    },
}

# Daily measures: canonical measure id -> (source field, metric name).
DAILY_MEASURES: tuple[tuple[str, str, str], ...] = (
    ("tavg_c", "Temperature", "Mean temperature"),
    ("tmax_c", "MaxTemperature", "Maximum temperature"),
    ("tmin_c", "MinTemperature", "Minimum temperature"),
    ("humidity_pct", "RelativeHumidity", "Relative humidity"),
    ("rainfall_mm", "Rainfall", "Rainfall (24 h)"),
    ("air_pressure_msl_hpa", "MeanSeaLevelPressure", "Mean sea level pressure"),
    ("wind_direction_deg", "WindDirection", "Wind direction"),
    ("wind_speed_ms", "WindSpeed", "Wind speed"),
)

MONTH_FIELDS = (
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
)

# Wind units the shared ``wind_speed_to_ms`` helper can convert. A unit that
# is not listed is never guessed: the measure is skipped instead.
CONVERTIBLE_WIND_UNITS = frozenset({"m/s", "ms", "mps", "km/h", "kmh", "knot", "knots", "kt"})

# The TMD payload declares a unit on every measurement element (e.g.
# ``<Rainfall Unit="mm">``, ``<MeanSeaLevelPressure unit="mb">``). That
# provider declaration is the only unit evidence this lane accepts; there is no
# official TMD field dictionary that independently confirms the units, so the
# published ``unit`` column stays NULL (gate G3) and the declaration plus its
# evidence URL are recorded in the observation dimensions for traceability.
UNIT_EVIDENCE_URL = "https://data.tmd.go.th/api/"

# Any of these markers in a resource path or label means "this is a forecast or
# a warning product, not a station measurement" (rule 4 of the programme).
# ``tadih.tmd_nwp`` and ``tadih.tmd_hpc_nwp`` serve those streams; this adapter
# must never fetch or publish them into ``observations``.
FORECAST_MARKERS = ("forecast", "predict", "nwp", "scenario", "projection", "warning", "พยากรณ์")

EXIT_OK = 0
EXIT_DATA_ERROR = 1
EXIT_CONFIG_ERROR = 2


class TmdAdapterError(RuntimeError):
    """A user-visible failure carrying a stable machine-readable ``code``."""

    def __init__(self, code: str, message: str, *, exit_code: int = EXIT_DATA_ERROR):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.exit_code = exit_code


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

ICT = timezone(timedelta(hours=7))


def now_utc_iso() -> str:
    """Current UTC timestamp in the ISO-8601 form the writer expects."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def to_utc_iso(value: str) -> str:
    """Convert an ICT ISO-8601 timestamp (from ``parse_tmd_timestamp``) to UTC.

    The contract stores ``observed_at`` in UTC with an explicit zone; the source
    (ICT) timestamp is kept verbatim in the observation dimensions.
    """
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:  # pragma: no cover - parse_tmd_timestamp is aware
        parsed = parsed.replace(tzinfo=ICT)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def today_ict() -> datetime:
    """Today's calendar date in Thailand (the source timezone)."""
    return datetime.now(ICT).date()


def document_retrieved_at(document: Mapping[str, Any], header: Mapping[str, Any],
                          *, fallback: str) -> str:
    """Deterministic retrieval stamp of one fetched document (UTC ISO 8601).

    ``Header/LastBuildDate`` is the moment TMD built the document that carries
    these values. Using it as ``retrieved_at`` makes an unchanged document hash
    to the same payload, so republishing the same batch on the same day reuses
    the run (``skipped_identical``) instead of adding a second copy of every
    station day. A build stamp in the future or an unparsable header falls back
    to the actual retrieval time.
    """
    raw = str(header.get("last_build_date") or "").strip()
    if not raw:
        return fallback
    try:
        _observed_date, local_iso = parse_tmd_timestamp(raw)
        parsed = datetime.fromisoformat(local_iso)
    except (ValueError, TypeError):
        return fallback
    if parsed > datetime.now(timezone.utc):
        return fallback
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def month_last_day(year: int, month: int) -> int:
    """Number of days in the given month."""
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - date(year, month, 1)).days


def gregorian_year(raw_year: Any) -> int:
    """Convert a TMD year field to a Gregorian year.

    The monthly payload publishes the year in the Gregorian calendar, but a
    Buddhist-era value is converted with the shared helper so both are safe.
    """
    try:
        year = int(str(raw_year).strip())
    except (TypeError, ValueError) as exc:
        raise TmdAdapterError("TMD_YEAR_INVALID", f"the monthly payload has no usable year: {raw_year!r}") from exc
    if year <= 0:
        raise TmdAdapterError("TMD_YEAR_INVALID", f"the monthly payload has an invalid year: {raw_year!r}")
    converted, _ = parse_tmd_timestamp(f"{year:04d}-01-01")
    return int(converted[:4])


# ---------------------------------------------------------------------------
# Province association (dimensions only, never area_code)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def province_name_index() -> dict[str, str]:
    """Thai province name -> DOPA area code for the 77 provinces."""
    index: dict[str, str] = {}
    for row in load_provinces():
        name = (row.get("name_th") or "").strip()
        code = (row.get("area_code") or "").strip()
        if name and code:
            index[name] = code
    return index


def province_association(station_id: str, province_name: str) -> tuple[Optional[str], Optional[str]]:
    """Return ``(area_code, province_name)`` for a station.

    The result is a *location* attribute. It is written into the observation
    dimensions only; ``area_code`` of the observation itself stays NULL
    because a station measurement is not a provincial aggregate.
    """
    known = KNOWN_TMD_STATIONS.get(station_id) or {}
    known_code = (known.get("province_code") or "").strip()
    if known_code:
        return known_code, (known.get("name_th") or "").strip() or None
    base = (province_name or "").strip().split(" ")[0].strip()
    if not base:
        return None, None
    code = province_name_index().get(base)
    if code:
        return code, base
    return None, base or None


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def api_base_url() -> str:
    """Base URL of the TMD API (no credentials are part of this value)."""
    value = (os.environ.get("TMD_API_BASE_URL") or "").strip()
    return (value or DEFAULT_API_BASE_URL).rstrip("/")


def fetch_document(path: str, *, year: Optional[int] = None, timeout: float = 60.0,
                   opener: Optional[Callable[..., Any]] = None) -> dict:
    """Fetch one TMD XML document with a browser User-Agent.

    The credential query values (``uid``/``ukey``) never leave this function:
    the returned mapping only carries the credential-free public URL.
    """
    base = api_base_url()
    uid = (os.environ.get("TMD_API_UID") or "").strip()
    ukey = (os.environ.get("TMD_API_UKEY") or "").strip()
    if not uid or not ukey:
        raise TmdAdapterError(
            "TMD_CREDENTIALS_MISSING",
            "TMD_API_UID and TMD_API_UKEY must be configured for the TMD API",
            exit_code=EXIT_CONFIG_ERROR,
        )
    params = {"uid": uid, "ukey": ukey}
    if year is not None:
        params["year"] = str(year)
    url = f"{base}{path}?{urlencode(params)}"
    request = Request(url, headers={
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": "application/xml,text/xml,*/*",
        "Connection": "close",
    })
    try:
        if opener is None:
            with urlopen(request, timeout=timeout, context=trusted_ssl_context()) as response:
                body = response.read()
                status = int(getattr(response, "status", 200) or 200)
                headers = {key.lower(): value for key, value in response.headers.items()}
        else:
            status, body, headers = opener(request, timeout)
            headers = {str(key).lower(): value for key, value in dict(headers or {}).items()}
            if isinstance(body, str):
                body = body.encode("utf-8")
    except HTTPError as exc:
        raise TmdAdapterError(
            "TMD_HTTP_ERROR",
            f"TMD returned HTTP {exc.code} for {base}{path}",
        ) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise TmdAdapterError(
            "TMD_NETWORK_ERROR",
            f"TMD request failed for {base}{path}: {exc}",
        ) from exc
    return {
        "status": status,
        "public_url": f"{base}{path}",
        "content_type": headers.get("content-type"),
        "etag": headers.get("etag"),
        "last_modified": headers.get("last-modified"),
        "body": body.decode("utf-8", "replace"),
        "bytes": len(body),
    }


def document_revision(document: Mapping[str, Any]) -> str:
    """Stable reference to the fetched document.

    ETag and Last-Modified are used when the upstream exposes them; otherwise
    the payload signature (SHA-256 of the document) identifies the revision.
    """
    etag = document.get("etag")
    if isinstance(etag, str) and etag.strip():
        return f"etag:{etag.strip()}"
    last_modified = document.get("last_modified")
    if isinstance(last_modified, str) and last_modified.strip():
        return f"last-modified:{last_modified.strip()}"
    body = document.get("body") or ""
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


# ---------------------------------------------------------------------------
# Parsing (XML -> raw station records)
# ---------------------------------------------------------------------------

def _text(element: Optional[ET.Element], tag: str) -> str:
    if element is None:
        return ""
    child = element.find(tag)
    if child is None or child.text is None:
        return ""
    return child.text.strip()


def _measure(element: Optional[ET.Element], tag: str) -> dict:
    """One payload measurement: ``{"value": str|None, "unit": str|None}``."""
    if element is None:
        return {"value": None, "unit": None}
    child = element.find(tag)
    if child is None:
        return {"value": None, "unit": None}
    value = (child.text or "").strip()
    unit = child.get("unit") or child.get("Unit")
    return {"value": value or None, "unit": (unit or "").strip() or None}


def parse_daily_document(text: str) -> tuple[list[dict], dict]:
    """Parse a ``WeatherToday`` document into raw station records."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise TmdAdapterError("TMD_PAYLOAD_INVALID", f"the TMD payload is not valid XML: {exc}") from exc
    stations = root.findall(".//Station")
    header = {
        "title": _text(root, "Header/Title"),
        "last_build_date": _text(root, "Header/LastBuildDate"),
        "status": _text(root, "Header/status"),
        "stations_total": len(stations),
    }
    records: list[dict] = []
    for station in stations:
        observation = station.find("Observation")
        if observation is None:
            continue
        measures = {
            tag: _measure(observation, tag)
            for tag in (
                "Temperature", "MaxTemperature", "MinTemperature", "RelativeHumidity",
                "Rainfall", "MeanSeaLevelPressure", "WindDirection", "WindSpeed",
            )
        }
        records.append({
            "station_id": (_text(station, "WmoStationNumber") or "").strip(),
            "station_name_th": _text(station, "StationNameThai"),
            "station_name_en": _text(station, "StationNameEnglish"),
            "province_name_th": _text(station, "Province"),
            "latitude": _text(station, "Latitude"),
            "longitude": _text(station, "Longitude"),
            "observed_at_raw": _text(observation, "DateTime"),
            "measures": measures,
        })
    return records, header


def parse_monthly_document(text: str) -> tuple[list[dict], dict]:
    """Parse a ``ThailandMonthlyRainfall`` document into raw station records."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise TmdAdapterError("TMD_PAYLOAD_INVALID", f"the TMD payload is not valid XML: {exc}") from exc
    header = {
        "title": _text(root, "header/title"),
        "last_build_date": _text(root, "header/lastBuildDate"),
        "status": _text(root, "header/status"),
    }
    records: list[dict] = []
    for station in root.findall(".//StationMonthlyRainfall"):
        rainfall = station.find("MonthlyRainfall")
        rainy_day = station.find("MonthlyRainyDay")
        rainfall_unit = (rainfall.get("unit") if rainfall is not None else None) or None
        rainy_unit = (rainy_day.get("unit") if rainy_day is not None else None) or None
        months: dict[int, dict] = {}
        for index, tag in enumerate(MONTH_FIELDS, start=1):
            months[index] = {
                "rainfall": {
                    "value": _text(rainfall, f"Rainfall{tag}") or None,
                    "unit": (rainfall_unit or "").strip() or None,
                },
                "rainy_days": {
                    "value": _text(rainy_day, f"RainyDay{tag}") or None,
                    "unit": (rainy_unit or "").strip() or None,
                },
            }
        records.append({
            "station_id": (_text(station, "WmoStationNumber") or "").strip(),
            "station_name_th": _text(station, "StationNameThai"),
            "station_name_en": _text(station, "StationNameEnglish"),
            "province_name_th": _text(station, "Province"),
            "latitude": _text(station, "Latitude"),
            "longitude": _text(station, "Longitude"),
            "year_raw": _text(station, "Year"),
            "months": months,
        })
    return records, header


# ---------------------------------------------------------------------------
# Row building
# ---------------------------------------------------------------------------

def _location_id(station_id: str) -> str:
    return f"tmd:station:{station_id}"


def _observation_id(station_id: str, observed_at: str, measure: str) -> str:
    return f"tmd:{station_id}:{observed_at}:{measure}"


def _station_meta(record: Mapping[str, Any]) -> tuple[str, dict]:
    """Validated station id plus the location metadata of one record."""
    station_id = normalize_station_id(record.get("station_id"))
    province_code, province_name = province_association(station_id, record.get("province_name_th") or "")
    name_th = (record.get("station_name_th") or "").strip()
    name_en = (record.get("station_name_en") or "").strip()
    display = name_th or name_en or station_id
    meta = {
        "stationCode": station_id,
        "stationNameTh": name_th or None,
        "stationNameEn": name_en or None,
        "provinceCode": province_code,
        "provinceNameTh": province_name,
    }
    latitude = record.get("latitude")
    longitude = record.get("longitude")
    if latitude:
        meta["latitude"] = latitude
    if longitude:
        meta["longitude"] = longitude
    return station_id, meta


def build_daily_rows(records: Sequence[Mapping[str, Any]], *, resource: Mapping[str, Any],
                     retrieved_at: str, revision_id: str, network: str,
                     skipped: list[dict]) -> list[dict]:
    """Build canonical daily observation rows for one station payload.

    Every row is a measured value of the station network; ``area_code`` stays
    NULL, the province association lives in the dimensions and a missing
    measurement stays ``None`` with ``quality_flag='missing'``.
    """
    rows: list[dict] = []
    source_url = str(resource["resource_id"])
    for record in records:
        try:
            station_id, meta = _station_meta(record)
        except ValueError as exc:
            skipped.append({"station": record.get("station_id"), "reason": "STATION_ID_INVALID",
                            "detail": str(exc)})
            continue
        measures = record.get("measures") or {}
        raw = {
            "station_id": station_id,
            "station_name_th": record.get("station_name_th"),
            "station_name_en": record.get("station_name_en"),
            "observation_date": record.get("observed_at_raw"),
            "tavg_c": (measures.get("Temperature") or {}).get("value"),
            "tmax_c": (measures.get("MaxTemperature") or {}).get("value"),
            "tmin_c": (measures.get("MinTemperature") or {}).get("value"),
            "relative_humidity_pct": (measures.get("RelativeHumidity") or {}).get("value"),
            "rainfall_mm": (measures.get("Rainfall") or {}).get("value"),
            "air_pressure_hpa": (measures.get("MeanSeaLevelPressure") or {}).get("value"),
        }
        wind = measures.get("WindSpeed") or {}
        wind_unit = (wind.get("unit") or "").strip().lower()
        wind_value = wind.get("value")
        wind_convertible = bool(wind_unit) and wind_unit in CONVERTIBLE_WIND_UNITS
        if wind_convertible:
            raw["wind_speed"] = wind_value
            raw["wind_unit"] = wind_unit
        elif wind_value is not None:
            skipped.append({"station": station_id, "reason": "WIND_UNIT_UNDOCUMENTED",
                            "detail": f"wind speed unit {wind_unit or '(missing)'!r} is not convertible"})
        try:
            normalized = normalize_tmd_daily_station(
                raw, source_url=source_url, retrieved_at=retrieved_at)
        except ValueError as exc:
            skipped.append({"station": station_id, "reason": "STATION_INVALID", "detail": str(exc)})
            continue
        observed_at_source = normalized["observed_at"]
        observed_at = to_utc_iso(observed_at_source)
        extra = {
            "observationDateIct": normalized.get("observation_date") or observed_at_source[:10],
            "observedAtSourceIct": observed_at_source,
        }
        values = {
            "tavg_c": normalized.get("tavg_c"),
            "tmax_c": normalized.get("tmax_c"),
            "tmin_c": normalized.get("tmin_c"),
            "humidity_pct": normalized.get("relative_humidity_pct"),
            "rainfall_mm": normalized.get("rainfall_mm"),
            "air_pressure_msl_hpa": normalized.get("air_pressure_hpa"),
            "wind_direction_deg": None,
            "wind_speed_ms": normalized.get("wind_speed_ms") if wind_convertible else None,
        }
        try:
            values["wind_direction_deg"] = validate_number(
                (measures.get("WindDirection") or {}).get("value"),
                "wind_direction_deg", min_val=0.0, max_val=360.0)
        except ValueError as exc:
            skipped.append({"station": station_id, "reason": "VALUE_INVALID",
                            "detail": f"wind direction is not usable: {exc}"})
            values["wind_direction_deg"] = None
        for measure_id, source_field, _metric in DAILY_MEASURES:
            payload_measure = measures.get(source_field) or {}
            unit = (payload_measure.get("unit") or "").strip() or None
            value = values.get(measure_id)
            if value is not None and measure_id != "wind_speed_ms" and not unit:
                # A number the provider does not document is never published:
                # its unit would have to be guessed (gate G3). A field the
                # payload does not carry at all is still published as a null
                # measurement, because that claims no unit at all.
                skipped.append({"station": station_id, "reason": "UNIT_UNDOCUMENTED",
                                "detail": f"{source_field} carries no unit attribute"})
                continue
            rows.append(_observation_row(
                station_id=station_id, observed_at=observed_at, measure=measure_id, value=value,
                unit=None, resource=resource, retrieved_at=retrieved_at, revision_id=revision_id,
                source_url=source_url, meta=meta, network=network, series_grain="daily",
                provider_unit=unit, source_field=source_field, extra=extra,
            ))
    return rows


def build_monthly_rows(records: Sequence[Mapping[str, Any]], *, resource: Mapping[str, Any],
                       retrieved_at: str, revision_id: str, network: str,
                       months: Sequence[int], skipped: list[dict]) -> list[dict]:
    """Build canonical monthly observation rows (one grain, never merged)."""
    rows: list[dict] = []
    source_url = str(resource["resource_id"])
    for record in records:
        try:
            station_id, meta = _station_meta(record)
        except ValueError as exc:
            skipped.append({"station": record.get("station_id"), "reason": "STATION_ID_INVALID",
                            "detail": str(exc)})
            continue
        try:
            year = gregorian_year(record.get("year_raw"))
        except TmdAdapterError as exc:
            skipped.append({"station": station_id, "reason": "YEAR_INVALID",
                            "detail": exc.message})
            continue
        for month in months:
            payload = (record.get("months") or {}).get(month) or {}
            last_day = month_last_day(year, month)
            observed_date, observed_at_source = parse_tmd_timestamp(
                f"{year:04d}-{month:02d}-{last_day:02d} 07:00:00")
            observed_at = to_utc_iso(observed_at_source)
            for measure_id, kind, metric in (
                ("monthly_rainfall_mm", "rainfall", "Monthly rainfall"),
                ("monthly_rainy_days", "rainy_days", "Monthly rainy days"),
            ):
                payload_measure = payload.get(kind) or {}
                unit = (payload_measure.get("unit") or "").strip() or None
                try:
                    value = validate_number(payload_measure.get("value"), measure_id,
                                            min_val=0.0, max_val=20000.0)
                except ValueError as exc:
                    skipped.append({"station": station_id, "reason": "VALUE_INVALID",
                                    "detail": str(exc)})
                    value = None
                if value is not None and not unit:
                    # gate G3: a number without a provider unit would need a
                    # guessed unit, so it is refused instead of published.
                    skipped.append({"station": station_id, "reason": "UNIT_UNDOCUMENTED",
                                    "detail": f"monthly {kind} carries no unit attribute"})
                    continue
                rows.append(_observation_row(
                    station_id=station_id, observed_at=observed_at, measure=measure_id, value=value,
                    unit=None, resource=resource, retrieved_at=retrieved_at, revision_id=revision_id,
                    source_url=source_url, meta=meta, network=network, series_grain="monthly",
                    provider_unit=unit, source_field=f"{kind}-{month:02d}",
                    extra={"year": year, "month": month, "metricLabel": metric,
                           "observationDateIct": observed_date,
                           "observedAtSourceIct": observed_at_source},
                ))
    return rows


def _observation_row(*, station_id: str, observed_at: str, measure: str, value: Optional[float],
                     unit: Optional[str], resource: Mapping[str, Any], retrieved_at: str,
                     revision_id: str, source_url: str, meta: Mapping[str, Any], network: str,
                     series_grain: str, provider_unit: Optional[str], source_field: str,
                     extra: Optional[Mapping[str, Any]] = None) -> dict:
    """One canonical observation row (exactly the fields of the contract)."""
    row = {
        "observation_id": _observation_id(station_id, observed_at, measure),
        "source_id": SOURCE_ID,
        "area_code": None,
        "spatial_support": SPATIAL_SUPPORT,
        "location_id": _location_id(station_id),
        "commodity_id": None,
        "observed_at": observed_at,
        "release_at": None,
        "retrieved_at": retrieved_at,
        "measure": measure,
        "value": value,
        "unit": unit,
        "data_kind": DATA_KIND,
        "revision_id": revision_id,
        "quality_flag": "missing" if value is None else "good",
        "source_url": source_url,
        "license_status": LICENCE_STATUS,
        "market_id": None,
        "price_type": None,
        "grade": None,
        "season": None,
    }
    dimensions = dict(extra or {})
    dimensions.update({
        "spatialSupport": SPATIAL_SUPPORT,
        "dataKind": DATA_KIND,
        "measure": measure,
        "network": network,
        "seriesGrain": series_grain,
        "sourceField": source_field,
    })
    dimensions.update(meta)
    if provider_unit:
        dimensions["providerUnit"] = provider_unit
        dimensions["unitEvidence"] = {
            "declaredBy": "provider_payload_attribute",
            "url": UNIT_EVIDENCE_URL,
            "sourceField": source_field,
        }
    if unit is None:
        dimensions["unitStatus"] = UNIT_PENDING_STATUS
    row["_dimensions"] = dimensions
    return row


# ---------------------------------------------------------------------------
# Publication
# ---------------------------------------------------------------------------

def load_registry_resource(resource_key: str):
    """Return the approved registry row of one TMD resource (fail closed)."""
    try:
        return load_approved_resource(resource_key)
    except ObservationWriteError as exc:
        raise TmdAdapterError(exc.code, str(exc), exit_code=EXIT_CONFIG_ERROR) from exc


def assert_observation_resource(resource_key: str, spec: Mapping[str, str]) -> None:
    """Rule 4 guard: refuse any resource that is not a measured station series.

    The adapter only ever lists the four approved observation endpoints, but a
    future edit that adds a forecast/warning product must fail here — before a
    single request is made — instead of relying on the writer's quarantine.
    """
    values = [resource_key, *(str(value) for value in spec.values())]
    for value in values:
        lowered = value.lower()
        for marker in FORECAST_MARKERS:
            if marker in lowered:
                raise TmdAdapterError(
                    "TMD_FORECAST_RESOURCE_REFUSED",
                    f"{resource_key} looks like a forecast/warning product ({marker!r}); "
                    "forecasts belong to the NWP tables, never to observations",
                    exit_code=EXIT_CONFIG_ERROR,
                )


def _dimensions_resolver(dimensions_by_id: Mapping[str, dict]) -> Callable[[Mapping[str, Any]], dict]:
    """Build the ``dimensions_for`` callback the shared writer expects.

    The writer hands over the *validated* observation, so the lane specific
    dimensions are looked up by observation id instead of being carried inside
    the contract row.
    """

    def resolve(observation: Mapping[str, Any]) -> dict:
        dimensions = dimensions_by_id.get(str(observation.get("observation_id") or ""))
        if isinstance(dimensions, dict):
            return dict(dimensions)
        return {
            "spatialSupport": observation.get("spatial_support"),
            "dataKind": observation.get("data_kind"),
            "measure": observation.get("measure"),
        }

    return resolve


def publish(client, *, resource: Mapping[str, Any], rows: Sequence[Mapping[str, Any]],
            coverage: Mapping[str, Any], completeness: str, retrieved_at: str, grain: str,
            network: str, adapter_version: str = ADAPTER_VERSION,
            catalog: Optional[Mapping[str, Any]] = None) -> dict:
    """Register the resource and publish the rows through the shared writer."""
    clean_rows = []
    for row in rows:
        clean = {key: value for key, value in row.items() if not key.startswith("_")}
        clean_rows.append(clean)
    dimensions_by_id = {str(row["observation_id"]): row["_dimensions"] for row in rows}
    return publish_observations(
        client,
        resource=dict(resource),
        rows=clean_rows,
        adapter_version=adapter_version,
        coverage=dict(coverage),
        completeness=completeness,
        unit=None,
        retrieved_at=retrieved_at,
        period_grain=grain,
        catalog=dict(catalog or {}),
        dimensions_for=_dimensions_resolver(dimensions_by_id),
        locations={
            row["location_id"]: {
                "kind": "station",
                "nativeCode": row["_dimensions"].get("stationCode") or row["location_id"],
                "name": _station_display_name(row["_dimensions"]),
            }
            for row in rows
        },
    )


def _station_display_name(meta: Mapping[str, Any]) -> str:
    """Station label: the Thai name plus the station code."""
    code = str(meta.get("stationCode") or "").strip()
    name_th = str(meta.get("stationNameTh") or "").strip()
    name_en = str(meta.get("stationNameEn") or "").strip()
    label = name_th or name_en or code
    if code and code not in label:
        return f"{label} ({code})"
    return label


# ---------------------------------------------------------------------------
# Run preparation
# ---------------------------------------------------------------------------

def _filter_stations(records: Sequence[Mapping[str, Any]], station: Optional[str],
                     limit: Optional[int]) -> list[Mapping[str, Any]]:
    selected = list(records)
    if station:
        wanted = station.strip()
        selected = [row for row in selected
                    if str(row.get("station_id") or "").strip() == wanted]
    if limit is not None and limit >= 0:
        selected = selected[:limit]
    return selected


def _complete_months(year: int, today, include_current: bool) -> list[int]:
    """Months whose accumulation period is finished (current month excluded)."""
    months: list[int] = []
    for month in range(1, 13):
        last = date(year, month, month_last_day(year, month))
        if last < today:
            months.append(month)
        elif include_current and last.year == today.year and last.month == today.month:
            months.append(month)
    return months


def prepare_batch(*, resource_key: str, resource: Mapping[str, Any], document: Mapping[str, Any],
                  date_filter: Optional[str], station: Optional[str], limit: Optional[int],
                  include_current_month: bool, retrieved_at: str) -> dict:
    """Turn one fetched document into the rows of a single publishable batch."""
    spec = RESOURCE_SPECS[resource_key]
    assert_observation_resource(resource_key, spec)
    revision_id = document_revision(document)
    skipped: list[dict] = []
    if spec["grain"] == "daily":
        records, header = parse_daily_document(document["body"])
        missing_blocks = int(header.get("stations_total") or 0) - len(records)
        if missing_blocks > 0:
            skipped.append({"station": None, "reason": "NO_OBSERVATION_BLOCK",
                            "detail": f"{missing_blocks} station elements carry no Observation block"})
        batch_retrieved_at = document_retrieved_at(document, header, fallback=retrieved_at)
        selected = _filter_stations(records, station, limit)
        rows = build_daily_rows(selected, resource=resource, retrieved_at=batch_retrieved_at,
                                revision_id=revision_id, network=spec["network"], skipped=skipped)
        available_dates = sorted({
            str((record.get("observed_at_raw") or "")[:10]) for record in records
            if record.get("observed_at_raw")
        })
        requested_date = date_filter
        if requested_date:
            rows = [row for row in rows if row["_dimensions"].get("observationDateIct") == requested_date]
            available = [value for value in available_dates if value == requested_date]
            if not available:
                raise TmdAdapterError(
                    "TMD_DATE_NOT_AVAILABLE",
                    f"the upstream payload has no observation for {requested_date} "
                    f"(available: {', '.join(available_dates) or 'none'})",
                )
        completeness = "complete" if (not skipped and not station and limit is None) else "partial"
        coverage = {
            "mode": "daily_full" if completeness == "complete" else "daily_partial",
            "count": len(rows),
            "stations": len({row["location_id"] for row in rows}),
            "network": spec["network"],
            "grain": "daily",
            "observedDates": available_dates,
        }
        if requested_date:
            coverage["requestedDate"] = requested_date
    else:
        records, header = parse_monthly_document(document["body"])
        today = today_ict()
        if date_filter:
            year = int(date_filter[:4])
            months = [month for month in _complete_months(year, today, include_current_month)
                      if month <= int(date_filter[5:7])]
        else:
            year = today.year
            months = _complete_months(year, today, include_current_month)
        if not months:
            raise TmdAdapterError(
                "TMD_MONTHS_NOT_AVAILABLE",
                f"no finished month is available for {year} (the current month is never published "
                "as a finished monthly total)",
            )
        batch_retrieved_at = document_retrieved_at(document, header, fallback=retrieved_at)
        selected = _filter_stations(records, station, limit)
        rows = build_monthly_rows(selected, resource=resource, retrieved_at=batch_retrieved_at,
                                   revision_id=revision_id, network=spec["network"],
                                   months=months, skipped=skipped)
        completeness = "complete" if (not skipped and not station and limit is None) else "partial"
        coverage = {
            "mode": "monthly_full" if completeness == "complete" else "monthly_partial",
            "count": len(rows),
            "stations": len({row["location_id"] for row in rows}),
            "network": spec["network"],
            "grain": "monthly",
            "year": year,
            "months": months,
        }
    return {
        "rows": rows,
        "skipped": skipped,
        "header": header,
        "revision_id": revision_id,
        "retrieved_at": batch_retrieved_at,
        "coverage": coverage,
        "completeness": completeness,
        "grain": spec["grain"],
        "network": spec["network"],
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tadih ingest --adapter tmd",
        description=(
            "Publish TMD station observations to Cloudflare D1.\n"
            "--dry-run is the default; --write publishes through the shared fail-closed writer."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dry-run", action="store_true", help="prepare the batch without writing to D1")
    parser.add_argument("--write", action="store_true", help="publish the batch to Cloudflare D1")
    parser.add_argument("--date", help="batch date YYYY-MM-DD (daily filter, monthly year/month)")
    parser.add_argument("--resource", default=DEFAULT_RESOURCE_KEY, choices=sorted(RESOURCE_SPECS),
                        help="approved TMD resource to publish (default: %(default)s)")
    parser.add_argument("--station", help="bound the batch to one TMD station code (WmoStationNumber)")
    parser.add_argument("--limit", type=int, help="bound the batch to the first N stations")
    parser.add_argument("--include-current-month", action="store_true",
                        help="monthly grain: also publish the still running month (provisional)")
    parser.add_argument("--timeout", type=float, default=60.0, help="upstream timeout in seconds")
    return parser


def _catalog_for(resource: Mapping[str, Any], spec: Mapping[str, str]) -> dict:
    """Catalog values for the D1 source/dataset/resource rows."""
    return {
        "source_name": SOURCE_AGENCY,
        "base_url": SOURCE_BASE_URL,
        "connector_kind": "api",
        "dataset_title": spec["label"],
        "dataset_description": spec["label"],
        "dataset_category": "weather",
        "dataset_owner": SOURCE_AGENCY,
        "dataset_source_url": str(resource["resource_id"]),
        "resource_format": "XML",
        "resource_url": str(resource["resource_id"]),
        "grain": ("station x UTC+07:00 calendar day" if spec["grain"] == "daily"
                  else "station x Gregorian calendar month"),
    }


def run_adapter(argv: Sequence[str], *, client=None, fetcher: Optional[Callable[..., Any]] = None) -> dict:
    """Fetch, prepare and (optionally) publish one TMD station batch."""
    parser = build_parser()
    args = parser.parse_args(list(argv))
    if args.dry_run and args.write:
        raise TmdAdapterError("ADAPTER_FLAGS_CONFLICT", "--dry-run and --write cannot be combined",
                              exit_code=EXIT_CONFIG_ERROR)
    if args.date and not (len(args.date) == 10 and args.date[4] == "-" and args.date[7] == "-"):
        raise TmdAdapterError("ADAPTER_DATE_INVALID", "--date must use the YYYY-MM-DD format",
                              exit_code=EXIT_CONFIG_ERROR)
    resource_key = args.resource
    spec = RESOURCE_SPECS[resource_key]
    assert_observation_resource(resource_key, spec)
    # The TMD credentials and the Cloudflare D1 token live in the gitignored
    # ``.env``; ``tadih.env`` only fills ``os.environ`` when it is imported.
    # ``cli.py`` and ``scripts/sync_tmd_to_d1.py`` already load it, so this only
    # fills what is still missing and never overrides an explicit setting.
    load_dotenv()
    resource = load_registry_resource(resource_key)
    expected_url = f"{SOURCE_BASE_URL}/api{spec['path']}"
    if str(resource["resource_id"]) != expected_url:
        raise TmdAdapterError(
            "TMD_RESOURCE_MISMATCH",
            f"the registry points {resource_key} at {resource['resource_id']} but this adapter "
            f"publishes {expected_url}",
        )
    requested_at = now_utc_iso()
    year = int(args.date[:4]) if (args.date and spec["grain"] == "monthly") else None
    fetch = fetcher or fetch_document
    document = fetch(spec["path"], year=year, timeout=args.timeout)
    batch = prepare_batch(
        resource_key=resource_key, resource=resource, document=document,
        date_filter=args.date, station=args.station, limit=args.limit,
        include_current_month=args.include_current_month, retrieved_at=requested_at,
    )
    rows = batch["rows"]
    if not rows:
        raise TmdAdapterError("TMD_NO_ROWS", "the selected batch contains no publishable observation")
    retrieved_at = batch["retrieved_at"]
    summary = {
        "status": "dry_run" if not args.write else "ok",
        "mode": "write" if args.write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapter_version": ADAPTER_VERSION,
        "resource_key": resource_key,
        "resource_id": str(resource["resource_id"]),
        "grain": batch["grain"],
        "network": batch["network"],
        "endpoint": document.get("public_url"),
        "http_status": document.get("status"),
        "content_type": document.get("content_type"),
        "document_bytes": document.get("bytes"),
        "revision_id": batch["revision_id"],
        "document_last_build_date": batch["header"].get("last_build_date"),
        "retrieved_at": retrieved_at,
        "requested_at": requested_at,
        "rows": len(rows),
        "stations": len({row["location_id"] for row in rows}),
        "measures": sorted({row["measure"] for row in rows}),
        "missing_values": sum(1 for row in rows if row["value"] is None),
        "skipped": batch["skipped"],
        "coverage": batch["coverage"],
        "completeness": batch["completeness"],
        "unit_status": UNIT_PENDING_STATUS,
        "forecast_streams_included": [],
    }
    if not args.write:
        summary["publish"] = {"written": False}
        return summary
    if client is None:
        from tadih.hub_catalog_sync import connect_d1_client

        try:
            client = connect_d1_client()
        except Exception as exc:
            code = getattr(exc, "code", None) or "D1_NOT_CONFIGURED"
            raise TmdAdapterError(code, str(exc)[:300], exit_code=EXIT_CONFIG_ERROR) from exc
    envelope = publish(
        client,
        resource=resource,
        rows=rows,
        coverage=batch["coverage"],
        completeness=batch["completeness"],
        retrieved_at=retrieved_at,
        grain=batch["grain"],
        network=batch["network"],
        catalog=_catalog_for(resource, spec),
    )
    summary["publish"] = {
        "written": True,
        "run_id": envelope["run_id"],
        "status": envelope["status"],
        "records_read": envelope["records_read"],
        "records_written": envelope["records_written"],
        "records_inserted": envelope["records_inserted"],
        "records_skipped": envelope["records_skipped"],
        "records_quarantined": envelope["records_quarantined"],
        "quarantine_reasons": envelope["quarantine_reasons"],
        "skipped_identical": envelope["skipped_identical"],
        "locations_written": envelope["locations_written"],
        "active_run_switched": envelope["active_run_switched"],
        "payload_sha256": envelope["payload_sha256"],
    }
    return summary


def main(argv: Optional[Sequence[str]] = None, *, client=None,
         fetcher: Optional[Callable[..., Any]] = None) -> int:
    """CLI entry point (``--dry-run`` default, ``--write`` publishes)."""
    if argv is None:
        argv = sys.argv[1:]
    try:
        summary = run_adapter(list(argv), client=client, fetcher=fetcher)
    except TmdAdapterError as exc:
        payload = {"status": "failed", "errorCode": exc.code, "message": exc.message}
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        print(json.dumps(payload, ensure_ascii=False))
        return exc.exit_code
    except ObservationWriteError as exc:
        payload = {"status": "failed", "errorCode": exc.code, "message": str(exc)}
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        print(json.dumps(payload, ensure_ascii=False))
        return EXIT_CONFIG_ERROR
    print(json.dumps(summary, ensure_ascii=False, default=str))
    return EXIT_OK


if __name__ == "__main__":  # pragma: no cover - manual invocation
    raise SystemExit(main())
