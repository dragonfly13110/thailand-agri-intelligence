"""Reviewed ERA5 annual extract for all 77 province centroid grid points.

The public resource ``open_meteo_thailand_era5_archive`` (approved_public,
CC BY 4.0) is read once for 2016-2025 at each centroid and reduced to annual
statistics that mirror ``aggregateRealYear`` in the web tier. Only annual
aggregates and full provenance travel in the bundle; the raw daily arrays stay
in the local checkpoints because ten years x 77 points of daily rows would
bloat the repo, and the web reader never re-fetches them.

Every province record carries the request URL, retrieval time, provider grid
cell, daily row count and a SHA-256 over the canonical daily payload it was
derived from. The web reader re-validates the structure, never the network.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Optional, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from tadih.open_meteo import (
    ATTRIBUTION_TEXT,
    ATTRIBUTION_URL,
    DECLARED_LICENSE,
    OPEN_METEO_ARCHIVE_URL,
    SOURCE_ID,
    SPATIAL_SUPPORT,
    TIMEZONE_BANGKOK,
    trusted_ssl_context,
)

SCHEMA = "tadih-era5-annual-extract-v1"
FIRST_YEAR = 2016
LAST_YEAR = 2025
DAILY_VARIABLES = (
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
)
REQUIRED_UNITS = {
    "temperature_2m_mean": "°C",
    "temperature_2m_max": "°C",
    "temperature_2m_min": "°C",
    "precipitation_sum": "mm",
}
MIN_PROVIDER_DELAY_SECONDS = 0.25
MAX_RESPONSE_BYTES = 10 * 1024 * 1024


class Era5AnnualExtractError(ValueError):
    """Fail-closed error for provider drift or a bundle that would mislead."""


def calendar_days(year: int) -> int:
    return (date(year + 1, 1, 1) - date(year, 1, 1)).days


def expected_dates(start_date: str, end_date: str) -> list[str]:
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    if start > end:
        raise Era5AnnualExtractError("start_date must be on or before end_date")
    count = (end - start).days
    return [(start + timedelta(days=offset)).isoformat() for offset in range(count + 1)]


def js_round(value: float, digits: int) -> float:
    """Match JavaScript Math.round on the positive domain used here."""
    factor = 10**digits
    return math.floor(value * factor + 0.5) / factor


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _known(values: Sequence[Any]) -> list[float]:
    return [float(value) for value in values if _is_finite_number(value)]


def _mean(values: Sequence[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def _dry_spell_stats(dates: Sequence[str], precip: Sequence[Any]) -> tuple[Optional[int], Optional[int]]:
    if not _known(precip):
        return None, None
    longest = 0
    events = 0
    run = 0
    previous_dry = False
    previous_date: Optional[str] = None
    for day, value in zip(dates, precip):
        dry = _is_finite_number(value) and float(value) < 1
        if dry:
            consecutive = False
            if previous_dry and previous_date is not None:
                consecutive = (date.fromisoformat(day) - date.fromisoformat(previous_date)).days == 1
            run = run + 1 if consecutive else 1
            longest = max(longest, run)
        else:
            if run >= 5:
                events += 1
            run = 0
        previous_dry = dry
        previous_date = day
    if run >= 5:
        events += 1
    return longest, events


def aggregate_year(
    year: int,
    dates: Sequence[str],
    tmean: Sequence[Any],
    tmax: Sequence[Any],
    tmin: Sequence[Any],
    precip: Sequence[Any],
) -> dict[str, Any]:
    """Mirror ``aggregateRealYear``: missing stays null and never becomes zero."""
    if not (len(dates) == len(tmean) == len(tmax) == len(tmin) == len(precip)):
        raise Era5AnnualExtractError("ความยาวอาร์เรย์รายวันไม่ตรงกัน")
    if dates and (date.fromisoformat(dates[0]).year != year or date.fromisoformat(dates[-1]).year != year):
        raise Era5AnnualExtractError(f"ช่วงวันที่ไม่อยู่ในปี {year}")
    known_mean = _known(tmean)
    known_max = _known(tmax)
    known_min = _known(tmin)
    known_precip = _known(precip)
    longest, events = _dry_spell_stats(dates, precip)
    days = calendar_days(year)
    complete = len(dates) == days and len(known_max) == days and len(known_precip) == days
    mean_value = _mean(known_mean)
    max_value = _mean(known_max)
    min_value = _mean(known_min)
    return {
        "year": year,
        "tmean_c": None if mean_value is None else js_round(mean_value, 2),
        "tmax_mean_c": None if max_value is None else js_round(max_value, 2),
        "tmin_mean_c": None if min_value is None else js_round(min_value, 2),
        "hot_days_38c": None if not known_max else sum(1 for value in known_max if value > 38),
        "rainfall_total_mm": None if not known_precip else js_round(sum(known_precip), 1),
        "longest_dry_spell_days": longest,
        "dry_spell_events_5d": events,
        "calendar_days": days,
        "days_with_data": {
            "temperature_mean": len(known_mean),
            "temperature_max": len(known_max),
            "temperature_min": len(known_min),
            "precipitation": len(known_precip),
        },
        "complete_year": complete,
    }


def validate_daily_payload(
    payload: Any,
    requested_latitude: float,
    requested_longitude: float,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    """Validate one provider response; nulls are allowed, structural drift is not."""
    if not isinstance(payload, dict):
        raise Era5AnnualExtractError("payload ต้องเป็น JSON object")
    if payload.get("error") is True:
        raise Era5AnnualExtractError(f"Open-Meteo error: {payload.get('reason')}")
    if payload.get("timezone") != TIMEZONE_BANGKOK:
        raise Era5AnnualExtractError("timezone ไม่ใช่ Asia/Bangkok")
    units = payload.get("daily_units")
    daily = payload.get("daily")
    if not isinstance(units, dict) or not isinstance(daily, dict):
        raise Era5AnnualExtractError("payload ขาด daily หรือ daily_units")
    for variable, expected_unit in REQUIRED_UNITS.items():
        if units.get(variable) != expected_unit:
            raise Era5AnnualExtractError(f"หน่วยของ {variable} ไม่ใช่ {expected_unit}")
    dates = daily.get("time")
    if not isinstance(dates, list) or not dates:
        raise Era5AnnualExtractError("daily.time ว่างหรือไม่ใช่อาร์เรย์")
    expected = expected_dates(start_date, end_date)
    if dates != expected:
        raise Era5AnnualExtractError("วันที่รายวันไม่ตรงกับปฏิทินที่ร้องขอ")
    for variable in DAILY_VARIABLES:
        values = daily.get(variable)
        if not isinstance(values, list):
            raise Era5AnnualExtractError(f"ขาดอาร์เรย์ {variable}")
        if len(values) != len(dates):
            raise Era5AnnualExtractError(f"ความยาวอาร์เรย์ {variable} ไม่ตรงกับจำนวนวัน")
        for value in values:
            if value is not None and not _is_finite_number(value):
                raise Era5AnnualExtractError(f"{variable} มีค่าที่ไม่ใช่ตัวเลขหรือ null")
    precip = daily["precipitation_sum"]
    if any(_is_finite_number(value) and float(value) < 0 for value in precip):
        raise Era5AnnualExtractError("precipitation_sum มีค่าติดลบ")
    grid_latitude = payload.get("latitude")
    grid_longitude = payload.get("longitude")
    if not _is_finite_number(grid_latitude) or not _is_finite_number(grid_longitude):
        raise Era5AnnualExtractError("payload ไม่มีพิกัดกริดของผู้ให้บริการ")
    if abs(float(grid_latitude) - requested_latitude) > 0.5 or abs(float(grid_longitude) - requested_longitude) > 0.5:
        raise Era5AnnualExtractError("พิกัดกริดของผู้ให้บริการอยู่ไกลจากจุดที่ร้องขอเกิน 0.5°")
    return {
        "provider_grid_latitude": float(grid_latitude),
        "provider_grid_longitude": float(grid_longitude),
        "provider_elevation_m": payload.get("elevation") if _is_finite_number(payload.get("elevation")) else None,
        "dates": dates,
        "daily": {variable: daily[variable] for variable in DAILY_VARIABLES},
    }


def canonical_daily_sha256(payload: Mapping[str, Any]) -> str:
    material = {
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
        "timezone": payload.get("timezone"),
        "daily_units": payload.get("daily_units"),
        "daily": {variable: payload.get("daily", {}).get(variable) for variable in DAILY_VARIABLES},
    }
    raw = json.dumps(material, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _request_url(latitude: float, longitude: float, start_date: str, end_date: str) -> str:
    params = {
        "latitude": f"{latitude:.4f}",
        "longitude": f"{longitude:.4f}",
        "start_date": start_date,
        "end_date": end_date,
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": TIMEZONE_BANGKOK,
        "models": "era5",
    }
    return f"{OPEN_METEO_ARCHIVE_URL}?{urlencode(params)}"


def fetch_era5_daily(
    latitude: float,
    longitude: float,
    start_date: str,
    end_date: str,
    *,
    opener: Optional[Callable[..., Any]] = None,
    timeout_seconds: float = 30.0,
    max_retries: int = 3,
) -> dict[str, Any]:
    """Fetch the full daily window for one grid point; bounded retries only."""
    lat = round(float(latitude), 4)
    lon = round(float(longitude), 4)
    url = _request_url(lat, lon, start_date, end_date)
    request = Request(
        url,
        headers={
            "User-Agent": "TADIH-AgriIntelligence/1.0 (+https://github.com/thailand-agri-intelligence)",
            "Accept": "application/json",
        },
    )
    context = trusted_ssl_context() if opener is None else None
    last_error: Optional[BaseException] = None
    payload: Any = None
    for attempt in range(max_retries):
        try:
            response = (
                urlopen(request, timeout=timeout_seconds, context=context)
                if opener is None
                else opener(request, timeout=timeout_seconds)
            )
            with response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise Era5AnnualExtractError("Open-Meteo response exceeded 10 MiB limit")
            payload = json.loads(raw.decode("utf-8"))
            break
        except HTTPError as exc:
            last_error = exc
            if exc.code == 429:
                if attempt == max_retries - 1:
                    raise Era5AnnualExtractError("Open-Meteo rate limit (429) persisted; resume later") from exc
                retry_after = exc.headers.get("Retry-After", "") if exc.headers else ""
                delay = min(float(retry_after), 120.0) if str(retry_after).isdigit() else 60.0
                time.sleep(delay)
                continue
            if exc.code in (500, 502, 503, 504) and attempt < max_retries - 1:
                time.sleep(float(2**attempt))
                continue
            raise Era5AnnualExtractError(f"Open-Meteo HTTP {exc.code} error: {exc.reason}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < max_retries - 1:
                time.sleep(float(2**attempt))
                continue
            raise Era5AnnualExtractError(f"Open-Meteo network failure: {exc}") from exc
    if payload is None:
        raise Era5AnnualExtractError(f"Open-Meteo request failed: {last_error}")
    parsed = validate_daily_payload(payload, lat, lon, start_date, end_date)
    return {
        "request_url": url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "provider_grid_latitude": parsed["provider_grid_latitude"],
        "provider_grid_longitude": parsed["provider_grid_longitude"],
        "provider_elevation_m": parsed["provider_elevation_m"],
        "daily_sha256": canonical_daily_sha256(payload),
        "daily_rows": len(parsed["dates"]),
        "first_day": parsed["dates"][0],
        "last_day": parsed["dates"][-1],
        "payload": payload,
    }


CENTROID_PATTERN = re.compile(
    r"^\s*'(\d{2})':\s*\{\s*nameEn:\s*'([^']+)',\s*lat:\s*(-?\d+(?:\.\d+)?),"
    r"\s*lon:\s*(-?\d+(?:\.\d+)?),\s*region:\s*'([^']+)'\s*\},?\s*$"
)


def load_centroids(source: str | Path) -> list[dict[str, Any]]:
    """Parse the 77-centroid registry from the TypeScript source of truth."""
    path = Path(source)
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = CENTROID_PATTERN.match(line)
        if not match:
            continue
        code, name_en, lat, lon, region = match.groups()
        rows.append({
            "code": code,
            "name_en": name_en,
            "latitude": float(lat),
            "longitude": float(lon),
            "region": region,
        })
    if len(rows) != 77:
        raise Era5AnnualExtractError(f"พบจุดศูนย์กลางจังหวัด {len(rows)} รายการ ต้องมี 77")
    if len({row["code"] for row in rows}) != 77:
        raise Era5AnnualExtractError("รหัสจังหวัดซ้ำในทะเบียนจุดศูนย์กลาง")
    return rows


def _year_slices(dates: Sequence[str], first_year: int, last_year: int) -> Iterable[tuple[int, list[int]]]:
    for year in range(first_year, last_year + 1):
        prefix = f"{year}-"
        indices = [index for index, day in enumerate(dates) if day.startswith(prefix)]
        yield year, indices


def build_province_record(
    province: Mapping[str, Any],
    fetched: Mapping[str, Any],
    *,
    years: tuple[int, int] = (FIRST_YEAR, LAST_YEAR),
) -> dict[str, Any]:
    """Validate one fetched payload and reduce it to a reviewable province record."""
    first_year, last_year = years
    if first_year > last_year:
        raise Era5AnnualExtractError("first_year ต้องไม่มากกว่า last_year")
    code = str(province["code"])
    lat = round(float(province["latitude"]), 4)
    lon = round(float(province["longitude"]), 4)
    payload = fetched.get("payload")
    parsed = validate_daily_payload(payload, lat, lon, f"{first_year}-01-01", f"{last_year}-12-31")
    daily = parsed["daily"]
    year_rows = []
    for year, indices in _year_slices(parsed["dates"], first_year, last_year):
        if not indices:
            continue
        year_rows.append(aggregate_year(
            year,
            [parsed["dates"][index] for index in indices],
            [daily["temperature_2m_mean"][index] for index in indices],
            [daily["temperature_2m_max"][index] for index in indices],
            [daily["temperature_2m_min"][index] for index in indices],
            [daily["precipitation_sum"][index] for index in indices],
        ))
    request_url = str(fetched.get("request_url", ""))
    if not request_url:
        raise Era5AnnualExtractError(f"จังหวัด {code}: ขาด request_url")
    return {
        "province_code": code,
        "name_en": str(province.get("name_en", "")),
        "region": str(province.get("region", "")),
        "requested_latitude": lat,
        "requested_longitude": lon,
        "provider_grid_latitude": parsed["provider_grid_latitude"],
        "provider_grid_longitude": parsed["provider_grid_longitude"],
        "provider_elevation_m": parsed["provider_elevation_m"],
        "request_url": request_url,
        "retrieved_at": str(fetched.get("retrieved_at", "")),
        "daily_sha256": canonical_daily_sha256(payload),
        "daily_rows": len(parsed["dates"]),
        "first_day": parsed["dates"][0],
        "last_day": parsed["dates"][-1],
        "years": year_rows,
    }


def assemble_extract(
    records: Mapping[str, Mapping[str, Any]],
    *,
    years: tuple[int, int] = (FIRST_YEAR, LAST_YEAR),
    generated_at: Optional[str] = None,
) -> dict[str, Any]:
    """Build and validate the envelope from records gathered so far."""
    first_year, last_year = years
    if not records:
        raise Era5AnnualExtractError("ยังไม่มีข้อมูลจังหวัดให้เขียน extract")
    envelope = {
        "schema": SCHEMA,
        "source_id": SOURCE_ID,
        "provider_model": "era5",
        "data_kind": "estimated",
        "spatial_support": SPATIAL_SUPPORT,
        "licence": DECLARED_LICENSE,
        "attribution": ATTRIBUTION_TEXT,
        "attribution_url": ATTRIBUTION_URL,
        "timezone": TIMEZONE_BANGKOK,
        "first_year": first_year,
        "last_year": last_year,
        "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
        "daily_sha256_basis": "sha256 of canonical JSON (sorted keys, compact UTF-8) of latitude, longitude, timezone, daily_units and the four daily arrays",
        "provinces": {code: dict(records[code]) for code in sorted(records)},
    }
    validate_extract(envelope)
    return envelope


def build_extract(
    provinces: Sequence[Mapping[str, Any]],
    fetch: Callable[[float, float], Mapping[str, Any]],
    *,
    years: tuple[int, int] = (FIRST_YEAR, LAST_YEAR),
    generated_at: Optional[str] = None,
) -> dict[str, Any]:
    """Fetch every centroid and return a validated, self-describing envelope."""
    records: dict[str, Any] = {}
    for province in sorted(provinces, key=lambda row: str(row["code"])):
        lat = round(float(province["latitude"]), 4)
        lon = round(float(province["longitude"]), 4)
        records[str(province["code"])] = build_province_record(province, fetch(lat, lon), years=years)
    return assemble_extract(records, years=years, generated_at=generated_at)


def _parse_iso(value: Any, label: str) -> None:
    if not isinstance(value, str) or not value:
        raise Era5AnnualExtractError(f"{label} ว่างหรือไม่ใช่ข้อความ")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Era5AnnualExtractError(f"{label} ไม่ใช่วันเวลาที่อ่านได้") from exc


def _validate_year_row(row: Any, first_year: int, last_year: int, province: str) -> None:
    if not isinstance(row, dict):
        raise Era5AnnualExtractError(f"จังหวัด {province}: แถวรายปีไม่ใช่ object")
    year = row.get("year")
    if not isinstance(year, int) or isinstance(year, bool) or not first_year <= year <= last_year:
        raise Era5AnnualExtractError(f"จังหวัด {province}: ปี {year} อยู่นอกช่วง")
    days = calendar_days(year)
    if row.get("calendar_days") != days:
        raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: calendar_days ไม่ตรงกับปฏิทิน")
    for key in ("tmean_c", "tmax_mean_c", "tmin_mean_c", "rainfall_total_mm"):
        value = row.get(key)
        if value is not None and not _is_finite_number(value):
            raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: {key} ไม่ใช่ตัวเลขหรือ null")
    if row.get("rainfall_total_mm") is not None and row["rainfall_total_mm"] < 0:
        raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: rainfall_total_mm ติดลบ")
    for key in ("hot_days_38c", "longest_dry_spell_days", "dry_spell_events_5d"):
        value = row.get(key)
        if value is not None and (not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= days):
            raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: {key} อยู่นอกช่วงวันของปี")
    counts = row.get("days_with_data")
    if not isinstance(counts, dict):
        raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: ขาด days_with_data")
    for key in ("temperature_mean", "temperature_max", "temperature_min", "precipitation"):
        value = counts.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= days:
            raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: days_with_data.{key} ไม่ถูกต้อง")
    complete = row.get("complete_year")
    if not isinstance(complete, bool):
        raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: complete_year ต้องเป็น boolean")
    if complete and (counts["temperature_max"] != days or counts["precipitation"] != days):
        raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: complete_year=true แต่ข้อมูลไม่ครบปฏิทิน")
    if (
        row.get("tmin_mean_c") is not None
        and row.get("tmean_c") is not None
        and row.get("tmax_mean_c") is not None
        and not (row["tmin_mean_c"] <= row["tmean_c"] <= row["tmax_mean_c"])
    ):
        raise Era5AnnualExtractError(f"จังหวัด {province} ปี {year}: ค่าต่ำสุด/เฉลี่ย/สูงสุดเรียงผิด")


def validate_extract(envelope: Any) -> None:
    """Fail closed on any condition that would let the bundle overclaim."""
    if not isinstance(envelope, dict):
        raise Era5AnnualExtractError("extract ต้องเป็น JSON object")
    if envelope.get("schema") != SCHEMA:
        raise Era5AnnualExtractError("schema ไม่ตรงกับสัญญา annual extract")
    if envelope.get("source_id") != SOURCE_ID or envelope.get("provider_model") != "era5":
        raise Era5AnnualExtractError("source_id/provider_model ไม่ใช่ open_meteo era5")
    if envelope.get("data_kind") != "estimated" or envelope.get("spatial_support") != "grid_point":
        raise Era5AnnualExtractError("data_kind/spatial_support ไม่ตรงกับสัญญา")
    if envelope.get("licence") != DECLARED_LICENSE:
        raise Era5AnnualExtractError("licence ไม่ใช่ CC-BY-4.0")
    if not isinstance(envelope.get("attribution"), str) or not envelope["attribution"]:
        raise Era5AnnualExtractError("attribution ว่าง")
    if not str(envelope.get("attribution_url", "")).startswith("https://open-meteo.com"):
        raise Era5AnnualExtractError("attribution_url ไม่ใช่ open-meteo.com")
    if envelope.get("timezone") != TIMEZONE_BANGKOK:
        raise Era5AnnualExtractError("timezone ไม่ใช่ Asia/Bangkok")
    first_year = envelope.get("first_year")
    last_year = envelope.get("last_year")
    if not isinstance(first_year, int) or not isinstance(last_year, int) or first_year > last_year:
        raise Era5AnnualExtractError("first_year/last_year ไม่ถูกต้อง")
    _parse_iso(envelope.get("generated_at"), "generated_at")
    provinces = envelope.get("provinces")
    if not isinstance(provinces, dict) or not provinces:
        raise Era5AnnualExtractError("provinces ว่างหรือไม่ใช่ object")
    for code, record in provinces.items():
        if not re.fullmatch(r"\d{2}", str(code)):
            raise Era5AnnualExtractError(f"รหัสจังหวัด {code} ไม่ใช่ 2 หลัก")
        if not isinstance(record, dict):
            raise Era5AnnualExtractError(f"จังหวัด {code}: record ไม่ใช่ object")
        for key, low, high in (
            ("requested_latitude", -90.0, 90.0),
            ("requested_longitude", -180.0, 180.0),
            ("provider_grid_latitude", -90.0, 90.0),
            ("provider_grid_longitude", -180.0, 180.0),
        ):
            value = record.get(key)
            if not _is_finite_number(value) or not low <= value <= high:
                raise Era5AnnualExtractError(f"จังหวัด {code}: {key} ไม่ถูกต้อง")
        request_url = str(record.get("request_url", ""))
        if not request_url.startswith(OPEN_METEO_ARCHIVE_URL):
            raise Era5AnnualExtractError(f"จังหวัด {code}: request_url ไม่ใช่ ERA5 archive endpoint")
        if f"{first_year}-01-01" not in request_url or f"{last_year}-12-31" not in request_url:
            raise Era5AnnualExtractError(f"จังหวัด {code}: request_url ไม่ตรงกับช่วงปีของ extract")
        _parse_iso(record.get("retrieved_at"), f"จังหวัด {code} retrieved_at")
        sha = record.get("daily_sha256")
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
            raise Era5AnnualExtractError(f"จังหวัด {code}: daily_sha256 ต้องเป็น hex 64 ตัว")
        rows = record.get("daily_rows")
        if not isinstance(rows, int) or isinstance(rows, bool) or not 1 <= rows <= 4000:
            raise Era5AnnualExtractError(f"จังหวัด {code}: daily_rows อยู่นอกช่วง")
        if record.get("first_day") != f"{first_year}-01-01" or record.get("last_day") != f"{last_year}-12-31":
            raise Era5AnnualExtractError(f"จังหวัด {code}: first_day/last_day ไม่ตรงกับช่วงปี")
        years = record.get("years")
        if not isinstance(years, list) or not years:
            raise Era5AnnualExtractError(f"จังหวัด {code}: years ว่าง")
        seen: set[int] = set()
        for row in years:
            _validate_year_row(row, first_year, last_year, str(code))
            if row["year"] in seen:
                raise Era5AnnualExtractError(f"จังหวัด {code}: ปี {row['year']} ซ้ำ")
            seen.add(row["year"])
