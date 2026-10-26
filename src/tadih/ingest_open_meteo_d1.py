"""Publish Open-Meteo ERA5 reanalysis values to Cloudflare D1 (lane R1-E).

Scope
-----
* **ERA5 reanalysis only** - the Open-Meteo Historical Weather API
  (``https://archive-api.open-meteo.com/v1/archive``).
* The provider **forecast** endpoint is out of scope. A forecast is not an
  observation, so it never enters the ``observations`` table; the shared
  writer would quarantine such rows anyway. The forecast resource
  (``open_meteo_thailand_forecast``) stays ``pending`` for the forecast/NWP
  tables owned by the Round 2 lanes.

Grain honesty (AGENTS.md rule 4)
--------------------------------
A value sampled at a Thai province centroid is a **grid point** value of the
ERA5 0.25 degree reanalysis - it is *not* a province aggregate. Every row
therefore carries:

* ``spatial_support = "grid_point"`` (D1 ``location_kind = "grid"``),
* ``area_code = NULL`` (no province coverage is claimed),
* ``location_id = "open-meteo:era5:<province>"``,
* the province link in ``dimensions`` (``provinceCode`` +
  ``centroidSource = "THAILAND_PROVINCE_CENTROIDS"``).

No province-level value is derived from a single centroid sample, and the 77
province codes are a coordinate registry - not a coverage statement.

Licence / attribution
---------------------
The registry row ``open_meteo_thailand_era5_archive`` is ``approved_public``
(CC BY 4.0). The required credit
``"Weather data by Open-Meteo.com (CC BY 4.0)"`` travels with every published
row (``dimensions["attribution"]``) and with the D1 catalog metadata.

Data quality
------------
* Missing upstream values stay ``null`` with ``quality_flag = "missing"``;
  they are never replaced by 0.
* Units are the provider documented units (``degC``, ``mm``, ``m/s``, ``%``);
  the Open-Meteo documentation URL travels in every row's ``dimensions``.
* The batch day is the Asia/Bangkok (+07:00) local day produced by
  :func:`tadih.open_meteo.normalize_open_meteo_daily`; ``observed_at`` is the
  UTC ISO instant of that local midnight (contract §3.1) and the source ICT
  timestamp is kept verbatim in ``dimensions``.
* Re-running the same window and provinces reuses the deterministic run id
  (plan rule 7: same ``run_id``/row_key, identical rows are skipped), so a
  daily cron never duplicates a batch even though ``retrieved_at`` moves.
* The upstream request rate stays far below the provider limit of 600
  requests/minute (the shared client throttles to 0.2 s between calls).

The shared module :mod:`tadih.open_meteo` is reused as-is: its ERA5 client,
its retry/backoff and rate-limit handling, its unit/timezone normalisation
and its ``THAILAND_PROVINCE_CENTROIDS`` table.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
from typing import Any, Iterable, Mapping, Sequence
from urllib.request import urlopen
import uuid

from .env import load_dotenv
from .ingestion import trusted_ssl_context
from .observations import (
    ObservationWriteError,
    load_approved_resource,
    publish_observations,
)
from .open_meteo import (
    ATTRIBUTION_URL,
    DECLARED_LICENSE,
    OPEN_METEO_ARCHIVE_URL,
    SOURCE_ID,
    SPATIAL_SUPPORT,
    THAILAND_PROVINCE_CENTROIDS,
    UTC_PLUS_7,
    OpenMeteoClient,
    normalize_open_meteo_daily,
)
from .quality import validate_observation

# ---------------------------------------------------------------------------
# Adapter identity
# ---------------------------------------------------------------------------

ADAPTER_NAME = "open_meteo"
ADAPTER_VERSION = "open-meteo-era5-d1/1.0"
RESOURCE_KEY = "open_meteo_thailand_era5_archive"

#: The credit the CC BY 4.0 licence requires next to every displayed value.
#: The registry row must still carry exactly this text.
REQUIRED_ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)"

#: Provider documentation page that defines every published variable and its
#: unit (temperature in °C — repo token ``degC`` — precipitation in mm,
#: wind speed requested as ``wind_speed_unit=ms`` in m/s, humidity in %).
#: Requested exactly as the shared client builds it, so the stored URL always
#: points at the documentation that confirms the unit actually published.
UNITS_DOCS_URL = "https://open-meteo.com/en/docs/historical-forecast-api"

#: Namespace for the deterministic run id of a (window, provinces) batch.
RUN_ID_NAMESPACE = uuid.UUID("6a5c1f2d-9b3e-5c7a-8f41-2d6b0a9c3e57")

#: ERA5 archive latency measured on 2026-10-26: the archive still serves
#: values only up to ``today - 6 days`` (later days come back as null).
ERA5_LAG_DAYS = 6

#: Seconds between two upstream calls. 0.2 s => 300 requests/minute, half of
#: the published Open-Meteo free-tier limit of 600 requests/minute.
MIN_DELAY_SECONDS = 0.20

#: Default number of days in one ERA5 window.
DEFAULT_WINDOW_DAYS = 7

#: The published measures. ``field`` is the key of the normalised daily
#: record produced by :func:`tadih.open_meteo.normalize_open_meteo_daily`.
MEASURES: tuple[dict[str, str], ...] = (
    {"measure": "t2m_mean_c", "providerVariable": "temperature_2m_mean",
     "field": "t2m_c", "unit": "degC"},
    {"measure": "t2m_max_c", "providerVariable": "temperature_2m_max",
     "field": "tmax_c", "unit": "degC"},
    {"measure": "t2m_min_c", "providerVariable": "temperature_2m_min",
     "field": "tmin_c", "unit": "degC"},
    {"measure": "precip_mm", "providerVariable": "precipitation_sum",
     "field": "rainfall_mm", "unit": "mm"},
    {"measure": "wind_speed_ms", "providerVariable": "wind_speed_10m_max",
     "field": "wind_speed_ms", "unit": "m/s"},
    {"measure": "rh2m_pct", "providerVariable": "relative_humidity_2m_mean",
     "field": "rh2m_pct", "unit": "%"},
)

PROVIDER_VARIABLE_BY_MEASURE = {item["measure"]: item["providerVariable"] for item in MEASURES}

#: Catalog values written to D1 together with the resource row.
CATALOG: dict[str, Any] = {
    "source_name": "Open-Meteo (CC BY 4.0)",
    "base_url": "https://archive-api.open-meteo.com",
    "connector_kind": "api",
    "dataset_id": "open-meteo-thailand-era5-daily",
    "source_dataset_id": "open-meteo-thailand-era5-daily",
    "dataset_title": "Open-Meteo Thailand ERA5 reanalysis - daily grid points at province centroids",
    "dataset_description": (
        "Daily ERA5 reanalysis values (temperature mean/max/min, precipitation, "
        "wind speed, relative humidity) sampled at the DOPA province centroids of "
        "Thailand. Every value is a GRID POINT value of the ERA5 0.25 degree "
        "reanalysis and never a province aggregate."
    ),
    "dataset_category": "weather",
    "dataset_owner": "Open-Meteo (Zippenfenig, P. 2023, Zenodo); ERA5 by ECMWF",
    "dataset_source_url": OPEN_METEO_ARCHIVE_URL,
    "dataset_metadata_access_status": "approved_public",
    "resource_format": "JSON",
    "grain": "grid_point (ERA5 0.25 deg) x Asia/Bangkok local day x measure",
    "attribution_url": ATTRIBUTION_URL,
    "metadata": {
        "product": "Open-Meteo ERA5 reanalysis",
        "spatialSupport": SPATIAL_SUPPORT,
        "timeStandard": "Asia/Bangkok (UTC+07:00) local day; observed_at stored as the UTC instant of that local midnight",
        "unitStatus": "confirmed_by_provider_documentation",
        "unitDocumentation": UNITS_DOCS_URL,
        "attribution": REQUIRED_ATTRIBUTION,
        "attributionUrl": ATTRIBUTION_URL,
        "declaredLicense": DECLARED_LICENSE,
        "providerCitation": "Zippenfenig, P. (2023). Open-Meteo.com Weather API [Computer software]. Zenodo.",
        "changes": (
            "Values are published unchanged. The day label is the Asia/Bangkok "
            "local day; observed_at is the UTC instant of that local midnight and "
            "the source ICT timestamp is kept in the row dimensions. A centroid "
            "sample is a grid-point value, not a province aggregate."
        ),
    },
}


def build_catalog(attribution: str) -> dict[str, Any]:
    """Return the catalog values with the required attribution credit."""
    catalog = dict(CATALOG)
    metadata = dict(CATALOG["metadata"])
    metadata["attribution"] = attribution
    catalog["metadata"] = metadata
    return catalog


class ForecastRefused(RuntimeError):
    """The provider forecast path is not an observation and is refused."""

    code = "FORECAST_NOT_PUBLISHABLE"


# ---------------------------------------------------------------------------
# Upstream access (shared client, counted requests)
# ---------------------------------------------------------------------------

class _CountingOpener:
    """``urlopen`` wrapper that counts the real upstream HTTP attempts.

    The shared client retries on HTTP 429/5xx; this wrapper makes the retry
    attempts visible in the run report instead of hiding them.
    """

    def __init__(self) -> None:
        self.calls = 0
        self._context = trusted_ssl_context()

    def __call__(self, request: Any, timeout: float | None = None):
        self.calls += 1
        return urlopen(request, timeout=timeout, context=self._context)


def build_weather_client() -> tuple[Any, _CountingOpener]:
    """Return the shared ERA5 client plus the request counter."""
    opener = _CountingOpener()
    client = OpenMeteoClient(
        min_delay_seconds=MIN_DELAY_SECONDS,
        max_retries=3,
        timeout_seconds=25.0,
        opener=opener,
    )
    return client, opener


# ---------------------------------------------------------------------------
# Argument handling
# ---------------------------------------------------------------------------

def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="sync_open_meteo_to_d1",
        description="Publish Open-Meteo ERA5 reanalysis (grid points) to Cloudflare D1.",
    )
    p.add_argument("--dry-run", action="store_true",
                   help="Fetch and validate the batch without writing to D1 (default)")
    p.add_argument("--write", action="store_true",
                   help="Publish the validated batch to Cloudflare D1")
    p.add_argument("--date", help="Batch date YYYY-MM-DD = last day of the ERA5 window "
                                  "(default: today minus the ERA5 archive latency)")
    p.add_argument("--start-date", help="First day of the window YYYY-MM-DD (overrides --date)")
    p.add_argument("--end-date", help="Last day of the window YYYY-MM-DD (overrides --date)")
    p.add_argument("--province", default="73",
                   help="Comma separated DOPA province codes or 'all' (default: 73)")
    p.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS,
                   help=f"Days in the window when only --date is given (default: {DEFAULT_WINDOW_DAYS})")
    p.add_argument("--forecast", action="store_true",
                   help="Refused: provider forecast values are not observations")
    return p


def resolve_provinces(raw: str) -> list[str]:
    """Resolve the requested province codes against the shared centroid table."""
    text = (raw or "").strip()
    if not text:
        raise ValueError("at least one province code is required")
    if text.lower() == "all":
        return sorted(THAILAND_PROVINCE_CENTROIDS)
    codes: list[str] = []
    for part in text.split(","):
        code = part.strip()
        if not code:
            continue
        if code not in THAILAND_PROVINCE_CENTROIDS:
            raise ValueError(f"unknown Thailand province code: {code!r}")
        if code not in codes:
            codes.append(code)
    if not codes:
        raise ValueError("at least one province code is required")
    return codes


def resolve_window(args: argparse.Namespace) -> tuple[str, str]:
    """Resolve the ERA5 window as ``(start_date, end_date)`` ISO strings."""
    if args.window_days < 1 or args.window_days > 366:
        raise ValueError("--window-days must be between 1 and 366")
    end: date | None = None
    if args.end_date:
        end = date.fromisoformat(args.end_date)
    elif args.date:
        end = date.fromisoformat(args.date)
    else:
        end = date.today() - timedelta(days=ERA5_LAG_DAYS)
    if args.start_date:
        start = date.fromisoformat(args.start_date)
    else:
        start = end - timedelta(days=args.window_days - 1)
    if start > end:
        raise ValueError("the window start must not be after its end")
    if (end - start).days > 366:
        raise ValueError("the window must not exceed 366 days")
    return start.isoformat(), end.isoformat()


# ---------------------------------------------------------------------------
# Row building
# ---------------------------------------------------------------------------

def location_id_for(province_code: str) -> str:
    """Stable location id of the ERA5 grid point sampled at a province centroid."""
    return f"open-meteo:era5:{province_code}"


def to_utc_iso(value: str) -> str:
    """Convert an ICT (+07:00) ISO timestamp to the UTC ISO form of the contract.

    ``normalize_open_meteo_daily`` labels each day with the Asia/Bangkok local
    day at ``T00:00:00+07:00``. The observation contract (plan §3.1) stores
    ``observed_at`` in UTC; the source ICT timestamp is preserved verbatim in
    the row dimensions.
    """
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC_PLUS_7)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_observation_rows(
    envelope: Mapping[str, Any],
    province_code: str,
    *,
    license_status: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Turn one ERA5 envelope into canonical observation rows.

    Returns the rows plus the per-location metadata used for the D1 location
    row and the ``dimensions`` JSON.
    """
    normalized = normalize_open_meteo_daily(envelope, province_code=province_code)
    grid = envelope.get("provider_grid_location") or {}
    centroid = THAILAND_PROVINCE_CENTROIDS[province_code]
    location_id = location_id_for(province_code)
    retrieved_at = envelope.get("retrieved_at")
    revision_id = envelope.get("content_signature")
    source_url = envelope.get("request_url") or OPEN_METEO_ARCHIVE_URL

    rows: list[dict[str, Any]] = []
    for record in normalized:
        observed_at_source = record["observed_at"]
        observed_at = to_utc_iso(observed_at_source)
        for item in MEASURES:
            value = record.get(item["field"])
            identity = f"open-meteo:era5:{province_code}:{observed_at}:{item['measure']}"
            rows.append({
                "observation_id": hashlib.sha256(identity.encode("utf-8")).hexdigest(),
                "source_id": SOURCE_ID,
                # A centroid sample is a grid point, never a province value.
                "area_code": None,
                "spatial_support": SPATIAL_SUPPORT,
                "location_id": location_id,
                "commodity_id": None,
                "observed_at": observed_at,
                "release_at": None,
                "retrieved_at": retrieved_at,
                "measure": item["measure"],
                "value": value,
                "unit": item["unit"],
                "data_kind": "estimated",
                "revision_id": revision_id,
                "quality_flag": "missing" if value is None else "good",
                "source_url": source_url,
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })

    extra = {
        "provinceCode": province_code,
        "provinceNameTh": centroid.get("name_th"),
        "provinceNameEn": centroid.get("name_en"),
        "centroidSource": "THAILAND_PROVINCE_CENTROIDS",
        "requestedLatitude": centroid.get("lat"),
        "requestedLongitude": centroid.get("lon"),
        "gridLatitude": grid.get("latitude"),
        "gridLongitude": grid.get("longitude"),
        "gridElevationM": grid.get("elevation"),
        "providerModel": envelope.get("provider_model", "era5"),
        "timeZone": "Asia/Bangkok",
    }
    return rows, extra


def build_dimensions_factory(extras: Mapping[str, Mapping[str, Any]], attribution: str):
    """Return the ``dimensions_for`` callback of the shared writer."""
    def dimensions_for(observation: Mapping[str, Any]) -> dict[str, Any]:
        extra = dict(extras.get(observation["location_id"], {}))
        # Keep the provider's Asia/Bangkok day label next to the UTC instant.
        source_ict = datetime.fromisoformat(
            observation["observed_at"].replace("Z", "+00:00")).astimezone(UTC_PLUS_7)
        dimensions = {
            "spatialSupport": SPATIAL_SUPPORT,
            "dataKind": observation["data_kind"],
            "measure": observation["measure"],
            "providerVariable": PROVIDER_VARIABLE_BY_MEASURE.get(observation["measure"]),
            "aggregation": "daily",
            "observedAtSourceIct": source_ict.isoformat(),
            "observationDateIct": source_ict.date().isoformat(),
            "unitDocumentation": UNITS_DOCS_URL,
            "attribution": attribution,
            "attributionUrl": ATTRIBUTION_URL,
            "declaredLicense": DECLARED_LICENSE,
        }
        dimensions.update(extra)
        return dimensions
    return dimensions_for


def build_locations(extras: Mapping[str, Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    """Return the D1 ``locations`` overrides for the ERA5 grid points."""
    locations: dict[str, dict[str, Any]] = {}
    for location_id, extra in extras.items():
        code = extra.get("provinceCode")
        name_th = extra.get("provinceNameTh") or code
        locations[location_id] = {
            "kind": "grid",
            "nativeCode": location_id,
            "name": f"ERA5 grid point ({name_th} {code})",
            # The grid point sits inside the province, but the value is not a
            # province statistic; the province link lives in `dimensions`.
            "provinceCode": None,
        }
    return locations


def validate_rows(rows: Sequence[Mapping[str, Any]]) -> None:
    """Fail closed when a row does not satisfy the canonical contract."""
    for row in rows:
        validate_observation(dict(row))


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

def derive_run_id(resource_id: str, start_date: str, end_date: str,
                  codes: Sequence[str]) -> str:
    """Deterministic run id for one (window, provinces) ERA5 batch.

    A daily cron that refetches the same window must reuse the run instead of
    minting a new one through the payload hash (the payload embeds the
    wall-clock ``retrieved_at``). Identical rows are then skipped by the
    writer; only revised values are rewritten.
    """
    scope = "|".join(["daily", resource_id, ADAPTER_VERSION, start_date, end_date,
                      ",".join(sorted(codes))])
    return str(uuid.uuid5(RUN_ID_NAMESPACE, scope))


def fetch_envelopes(
    codes: Sequence[str],
    start_date: str,
    end_date: str,
    *,
    weather_client: Any,
) -> list[tuple[dict[str, Any], str]]:
    """Fetch one ERA5 archive envelope per province (no forecast path)."""
    envelopes: list[tuple[dict[str, Any], str]] = []
    for code in codes:
        centroid = THAILAND_PROVINCE_CENTROIDS[code]
        envelope = weather_client.fetch_weather(
            centroid["lat"],
            centroid["lon"],
            forecast=False,
            start_date=start_date,
            end_date=end_date,
        )
        if not isinstance(envelope, dict):
            raise ValueError(f"Open-Meteo returned an unusable envelope for province {code}")
        if envelope.get("data_kind") != "estimated":
            raise ValueError(
                f"province {code}: only reanalysis data_kind 'estimated' may be published")
        envelopes.append((envelope, code))
    return envelopes


def run(
    argv: Sequence[str] | None = None,
    *,
    client: Any = None,
    weather_client: Any = None,
    opener: _CountingOpener | None = None,
) -> dict[str, Any]:
    """Run one ERA5 batch and publish it when ``--write`` was given."""
    args = parser().parse_args(list(argv or []))
    if args.dry_run and args.write:
        raise ValueError("--dry-run and --write cannot be combined")
    if args.forecast:
        raise ForecastRefused(
            "the Open-Meteo forecast endpoint is a model prediction and is never "
            "published as an observation; the ERA5 reanalysis archive is the only "
            "published path of this adapter")

    # The licence gate runs before any upstream call or D1 write.
    resource = load_approved_resource(RESOURCE_KEY)
    attribution = resource.get("attribution_text")
    if attribution != REQUIRED_ATTRIBUTION:
        raise ValueError(
            f"the registry attribution text {attribution!r} no longer carries the "
            f"required credit {REQUIRED_ATTRIBUTION!r}")
    codes = resolve_provinces(args.province)
    start_date, end_date = resolve_window(args)

    if weather_client is None:
        weather_client, built_opener = build_weather_client()
        opener = opener or built_opener

    envelopes = fetch_envelopes(codes, start_date, end_date, weather_client=weather_client)

    rows: list[dict[str, Any]] = []
    extras: dict[str, dict[str, Any]] = {}
    for envelope, code in envelopes:
        province_rows, extra = build_observation_rows(
            envelope, code, license_status=resource["license_status"])
        rows.extend(province_rows)
        extras[location_id_for(code)] = extra

    if not rows:
        raise ValueError("the ERA5 window produced no observation rows")
    validate_rows(rows)

    missing = sum(1 for row in rows if row["value"] is None)
    by_measure: dict[str, int] = {}
    for row in rows:
        by_measure[row["measure"]] = by_measure.get(row["measure"], 0) + 1

    coverage = {
        "mode": "daily_grid_point",
        "count": len(rows),
        "provinces": codes,
        "provinceCount": len(codes),
        "startDate": start_date,
        "endDate": end_date,
        "days": (date.fromisoformat(end_date) - date.fromisoformat(start_date)).days + 1,
        "measures": [item["measure"] for item in MEASURES],
        "rowsByMeasure": by_measure,
        "missingValues": missing,
        "spatialSupport": SPATIAL_SUPPORT,
        "timeZone": "Asia/Bangkok",
        "gridResolution": "ERA5 0.25 degree",
    }

    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if args.write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapterVersion": ADAPTER_VERSION,
        "resourceId": resource["resource_id"],
        "resourceKey": RESOURCE_KEY,
        "licenseStatus": resource["license_status"],
        "attribution": attribution,
        "attributionUrl": ATTRIBUTION_URL,
        "spatialSupport": SPATIAL_SUPPORT,
        "areaCode": None,
        "window": {"startDate": start_date, "endDate": end_date},
        "runId": derive_run_id(resource["resource_id"], start_date, end_date, codes),
        "provinces": codes,
        "rows": len(rows),
        "rowsByMeasure": by_measure,
        "missingValues": missing,
        "completeness": "complete" if missing == 0 else "partial",
        "upstreamRequests": len(envelopes),
        "upstreamHttpRequests": opener.calls if opener is not None else len(envelopes),
        "written": False,
    }

    if not args.write:
        return summary

    if client is None:
        from .hub_catalog_sync import connect_d1_client
        client = connect_d1_client()

    # publish_observations registers the catalog rows itself (idempotent
    # upserts); the adapter never writes to D1 beside the shared writer.
    catalog = build_catalog(attribution)
    # The run id is deterministic for a (window, provinces) batch so a re-run
    # reuses the same run (plan rule 7) even though retrieved_at moves.
    run_id = derive_run_id(resource["resource_id"], start_date, end_date, codes)

    published = publish_observations(
        client,
        resource=resource,
        rows=rows,
        adapter_version=ADAPTER_VERSION,
        coverage=coverage,
        completeness=summary["completeness"],
        unit=None,
        retrieved_at=max(row["retrieved_at"] for row in rows),
        run_id=run_id,
        catalog=catalog,
        product="Open-Meteo ERA5 reanalysis",
        period_grain="daily",
        dimensions_for=build_dimensions_factory(extras, attribution),
        locations=build_locations(extras),
    )
    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    return summary


def main(argv: Sequence[str] | None = None, *, client: Any = None,
         weather_client: Any = None) -> int:
    """CLI entry point of the adapter (``--dry-run`` is the default)."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, weather_client=weather_client)
    except ForecastRefused as exc:
        print(json.dumps({"status": "failed", "errorCode": exc.code, "message": str(exc)},
                         ensure_ascii=False), file=sys.stderr)
        return 1
    except ObservationWriteError as exc:
        print(json.dumps({"status": "failed", "errorCode": exc.code, "message": str(exc)},
                         ensure_ascii=False), file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - the CLI reports every failure
        print(json.dumps({"status": "failed", "errorCode": type(exc).__name__,
                          "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":  # pragma: no cover
    load_dotenv(override=True)
    sys.exit(main(sys.argv[1:]))
