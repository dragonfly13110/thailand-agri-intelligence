"""TMD (Thai Meteorological Department) Station Archive Data Converter.

Provides adapters and normalizers for historical station observations and
monthly statistics from the Thai Meteorological Department (TMD Open Data).

Covers:
- Daily Station Observations (WeatherTodayByAgro, DailyWeather, Synoptic)
- Monthly Station Rainfall Archives (ThailandMonthlyRainfall)
- Normalization to Hub standard observation schema (data_contracts/observation.schema.json)
- Timezone normalization to UTC+7 (Asia/Bangkok, +07:00)
- Fail-closed validation preserving missing values as None (never fabricated as 0.0)

Spatial support:
    "station" - Ground station point measurements, NOT provincial coverage.

Attribution & Legal:
    Source: กรมอุตุนิยมวิทยา (Thai Meteorological Department, TMD)
    License Status: "pending" (restricted / pending official project data redistribution terms)
"""

from __future__ import annotations

import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

try:
    from tadih.catalog import PROVINCE_CODES, ROOT
except ImportError:
    ROOT = Path(__file__).resolve().parents[2]
    PROVINCE_CODES = frozenset(
        "10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 "
        "30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 "
        "50 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 67 "
        "70 71 72 73 74 75 76 77 80 81 82 83 84 85 86 90 91 92 93 94 95 96".split()
    )

TMD_SOURCE_ID = "tmd"
TMD_SOURCE_AGENCY = "กรมอุตุนิยมวิทยา (TMD)"
TMD_DATA_PORTAL_URL = "https://data.tmd.go.th/"
LICENSE_STATUS = "pending"
SPATIAL_SUPPORT = "station"
DATA_KIND = "observed"
UTC_PLUS_7 = timezone(timedelta(hours=7))

# Standard unit definitions for TMD observations
TMD_UNITS = {
    "temperature": "°C",
    "rainfall": "mm",
    "relative_humidity": "%",
    "wind_speed": "m/s",
    "air_pressure": "hPa",
}

# Known WMO / TMD reference stations (matching KEY_AGROMET_STATIONS)
KNOWN_TMD_STATIONS: Dict[str, Dict[str, Any]] = {
    "48455": {"name_en": "Bangkok Metropolis", "name_th": "กรุงเทพมหานคร", "province_code": "10", "lat": 13.7333, "lon": 100.5667, "elevation_m": 2.0},
    "48451": {"name_en": "Nakhonpathom Agromet", "name_th": "นครปฐม", "province_code": "73", "lat": 14.0117, "lon": 99.9700, "elevation_m": 8.0},
    "48419": {"name_en": "Pathumthani Agromet", "name_th": "ปทุมธานี", "province_code": "13", "lat": 14.1161, "lon": 100.6206, "elevation_m": 6.0},
    "48425": {"name_en": "Suphan Buri", "name_th": "สุพรรณบุรี", "province_code": "72", "lat": 14.4667, "lon": 100.1333, "elevation_m": 7.0},
    "48327": {"name_en": "Chiang Mai", "name_th": "เชียงใหม่", "province_code": "50", "lat": 18.7833, "lon": 98.9833, "elevation_m": 312.0},
    "48381": {"name_en": "Khon Kaen", "name_th": "ขอนแก่น", "province_code": "40", "lat": 16.4333, "lon": 102.8333, "elevation_m": 165.0},
    "48383": {"name_en": "Mukdahan", "name_th": "มุกดาหาร", "province_code": "49", "lat": 16.5333, "lon": 104.7167, "elevation_m": 138.0},
    "48431": {"name_en": "Nakhon Ratchasima", "name_th": "นครราชสีมา", "province_code": "30", "lat": 14.9667, "lon": 102.0833, "elevation_m": 187.0},
    "48407": {"name_en": "Ubon Ratchathani", "name_th": "อุบลราชธานี", "province_code": "34", "lat": 15.2500, "lon": 104.8667, "elevation_m": 123.0},
    "48475": {"name_en": "Hua Hin", "name_th": "ประจวบคีรีขันธ์ (หัวหิน)", "province_code": "77", "lat": 12.5833, "lon": 99.9500, "elevation_m": 5.0},
    "48568": {"name_en": "Songkhla", "name_th": "สงขลา", "province_code": "90", "lat": 7.2000, "lon": 100.6000, "elevation_m": 4.0},
    "48565": {"name_en": "Phuket Airport", "name_th": "ภูเก็ต (ท่าอากาศยาน)", "province_code": "83", "lat": 8.1167, "lon": 98.3167, "elevation_m": 6.0},
}


def validate_number(
    value: Any,
    name: str = "metric",
    *,
    min_val: Optional[float] = None,
    max_val: Optional[float] = None,
) -> Optional[float]:
    """Fail-closed numeric validator for meteorological observations.
    
    Returns None for null/missing values.
    Rejects booleans, non-finite values, and out-of-range anomalies.
    """
    if value is None or (isinstance(value, str) and value.strip() in ("", "-", "null", "NULL", "NaN")):
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} must not be a boolean")
    try:
        val = float(value)
    except (ValueError, TypeError) as err:
        raise ValueError(f"{name} cannot be converted to float: {value!r}") from err

    if not math.isfinite(val):
        raise ValueError(f"{name} must be finite, got {val!r}")
    if min_val is not None and val < min_val:
        raise ValueError(f"{name} {val} is below physical minimum {min_val}")
    if max_val is not None and val > max_val:
        raise ValueError(f"{name} {val} exceeds physical maximum {max_val}")
    return val


def parse_tmd_timestamp(raw_value: Any) -> Tuple[str, str]:
    """Parse TMD date/time string and return (observation_date, observed_at_iso_utc7).
    
    Handles Buddhist Era (BE > 2400) conversions to AD (AD = BE - 543) and
    time stamps in various TMD formats (e.g. 'YYYY-MM-DD HH:MM:SS', 'DD/MM/YYYY').
    """
    if not raw_value or not isinstance(raw_value, str):
        raise ValueError("Timestamp must be a non-empty string")
    s = raw_value.strip()

    # Pattern 1: ISO date or datetime (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
    match_iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?", s)
    if match_iso:
        year = int(match_iso.group(1))
        month = int(match_iso.group(2))
        day = int(match_iso.group(3))
        if year > 2400:  # Buddhist era
            year -= 543
        hour = int(match_iso.group(4) or 0)
        minute = int(match_iso.group(5) or 0)
        second = int(match_iso.group(6) or 0)
        dt = datetime(year, month, day, hour, minute, second, tzinfo=UTC_PLUS_7)
        return dt.date().isoformat(), dt.isoformat()

    # Pattern 2: Thai DD/MM/YYYY format
    match_thai = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?", s)
    if match_thai:
        day = int(match_thai.group(1))
        month = int(match_thai.group(2))
        year = int(match_thai.group(3))
        if year > 2400:
            year -= 543
        hour = int(match_thai.group(4) or 0)
        minute = int(match_thai.group(5) or 0)
        second = int(match_thai.group(6) or 0)
        dt = datetime(year, month, day, hour, minute, second, tzinfo=UTC_PLUS_7)
        return dt.date().isoformat(), dt.isoformat()

    raise ValueError(f"Unrecognized TMD timestamp format: {raw_value!r}")


def normalize_station_id(value: Any) -> str:
    """Validate and normalize a WMO or TMD station code."""
    if value is None:
        raise ValueError("station_id is required")
    s = str(value).strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{3,20}", s):
        raise ValueError(f"Invalid station ID format: {value!r}")
    return s


def wind_speed_to_ms(val: Optional[float], unit: str = "km/h") -> Optional[float]:
    """Convert wind speed to standard m/s."""
    if val is None:
        return None
    u = unit.strip().lower()
    if u in ("m/s", "ms", "mps"):
        return round(val, 2)
    elif u in ("km/h", "kmh"):
        return round(val / 3.6, 2)
    elif u in ("knot", "knots", "kt"):
        return round(val * 0.514444, 2)
    raise ValueError(f"Unsupported wind speed unit: {unit}")


def normalize_tmd_daily_station(
    raw: Dict[str, Any],
    *,
    province_code: Optional[str] = None,
    station_id: Optional[str] = None,
    source_url: str = TMD_DATA_PORTAL_URL,
    retrieved_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Normalize a raw TMD daily station observation record into standard Hub record.
    
    Compatible with fact_daily_weather schema in warehouse.
    """
    if not isinstance(raw, dict):
        raise ValueError("raw record must be a dictionary")

    # Resolve station ID
    sid = station_id or raw.get("station_id") or raw.get("wmo_id") or raw.get("StationCode") or raw.get("id")
    sid_str = normalize_station_id(sid)

    # Station metadata lookup if available
    known_meta = KNOWN_TMD_STATIONS.get(sid_str, {})
    p_code = province_code or raw.get("province_code") or known_meta.get("province_code")
    if p_code is not None:
        p_code = str(p_code).strip()
        if p_code not in PROVINCE_CODES:
            raise ValueError(f"Unknown or invalid province code: {p_code}")

    # Timestamp parsing
    time_raw = (
        raw.get("observation_date")
        or raw.get("date")
        or raw.get("DateTime")
        or raw.get("observed_at")
        or raw.get("time")
    )
    obs_date, observed_at = parse_tmd_timestamp(str(time_raw))

    # Measurements extraction
    tavg = validate_number(
        raw.get("tavg_c") or raw.get("temp") or raw.get("temperature") or raw.get("MeanTemperature"),
        "tavg_c",
        min_val=-10.0,
        max_val=55.0,
    )
    tmin = validate_number(
        raw.get("tmin_c") or raw.get("tmin") or raw.get("MinTemperature"),
        "tmin_c",
        min_val=-10.0,
        max_val=55.0,
    )
    tmax = validate_number(
        raw.get("tmax_c") or raw.get("tmax") or raw.get("MaxTemperature"),
        "tmax_c",
        min_val=-10.0,
        max_val=55.0,
    )
    if tmax is not None and tmin is not None and tmax < tmin:
        raise ValueError(f"tmax ({tmax}) cannot be lower than tmin ({tmin}) for station {sid_str} on {obs_date}")

    rainfall = validate_number(
        raw.get("rainfall_mm") or raw.get("rain") or raw.get("rain_24h") or raw.get("Rainfall"),
        "rainfall_mm",
        min_val=0.0,
        max_val=1500.0,
    )

    wind_raw = raw.get("wind_speed_ms") or raw.get("wind_speed") or raw.get("WindSpeed")
    wind_unit = raw.get("wind_unit", "km/h" if "wind_speed_ms" not in raw else "m/s")
    wind_ms = None
    if wind_raw is not None:
        w_val = validate_number(wind_raw, "wind_speed", min_val=0.0, max_val=200.0)
        wind_ms = wind_speed_to_ms(w_val, unit=wind_unit)

    rh = validate_number(
        raw.get("relative_humidity_pct") or raw.get("rh") or raw.get("RelativeHumidity"),
        "relative_humidity_pct",
        min_val=0.0,
        max_val=100.0,
    )

    pressure = validate_number(
        raw.get("air_pressure_hpa") or raw.get("pres") or raw.get("pressure") or raw.get("StationPressure"),
        "air_pressure_hpa",
        min_val=800.0,
        max_val=1100.0,
    )

    now_iso = retrieved_at or datetime.now(timezone.utc).isoformat()

    return {
        "station_id": sid_str,
        "station_name_th": raw.get("station_name_th") or known_meta.get("name_th"),
        "station_name_en": raw.get("station_name_en") or known_meta.get("name_en"),
        "province_code": p_code,
        "observation_date": obs_date,
        "observed_at": observed_at,
        "tavg_c": tavg,
        "tmin_c": tmin,
        "tmax_c": tmax,
        "rainfall_mm": rainfall,
        "wind_speed_ms": wind_ms,
        "relative_humidity_pct": rh,
        "air_pressure_hpa": pressure,
        "source_agency": TMD_SOURCE_AGENCY,
        "source_id": TMD_SOURCE_ID,
        "source_url": source_url,
        "retrieved_at": now_iso,
        "spatial_support": SPATIAL_SUPPORT,
        "data_kind": DATA_KIND,
        "license_status": LICENSE_STATUS,
    }


def normalize_tmd_monthly_rainfall(
    raw: Dict[str, Any],
    *,
    province_code: Optional[str] = None,
    source_url: str = TMD_DATA_PORTAL_URL,
    retrieved_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Normalize TMD ThailandMonthlyRainfall archive record.
    
    Normalizes 12 monthly rainfall figures, annual total, and raindays count.
    Converts Buddhist era year to AD year.
    """
    if not isinstance(raw, dict):
        raise ValueError("raw record must be a dictionary")

    sid = raw.get("station_id") or raw.get("wmo_id") or raw.get("StationCode") or raw.get("id")
    sid_str = normalize_station_id(sid)

    raw_year = raw.get("year") or raw.get("Year")
    if raw_year is None:
        raise ValueError("Monthly rainfall record requires 'year'")
    year_int = int(raw_year)
    year_ad = year_int - 543 if year_int > 2400 else year_int

    p_code = province_code or raw.get("province_code")
    if p_code:
        p_code = str(p_code).strip()
        if p_code not in PROVINCE_CODES:
            raise ValueError(f"Invalid province code: {p_code}")

    months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    monthly_rainfall: Dict[str, Optional[float]] = {}
    total_valid_rain = 0.0
    valid_count = 0

    for idx, m in enumerate(months, start=1):
        # Look for month keys like 'jan', 'm01', 'rain_01', '1', etc.
        val = (
            raw.get(m)
            or raw.get(f"m{idx:02d}")
            or raw.get(f"rain_{idx:02d}")
            or raw.get(str(idx))
            or raw.get(m.capitalize())
        )
        norm_val = validate_number(val, f"rainfall_{m}", min_val=0.0, max_val=5000.0)
        monthly_rainfall[f"rainfall_{m}_mm"] = norm_val
        if norm_val is not None:
            total_valid_rain += norm_val
            valid_count += 1

    annual_reported = validate_number(
        raw.get("annual_total_mm") or raw.get("total") or raw.get("Annual"),
        "annual_total_mm",
        min_val=0.0,
        max_val=20000.0,
    )
    annual_mm = annual_reported if annual_reported is not None else (round(total_valid_rain, 1) if valid_count == 12 else None)

    annual_raindays = validate_number(
        raw.get("raindays_annual") or raw.get("raindays") or raw.get("RainDays"),
        "raindays_annual",
        min_val=0.0,
        max_val=366.0,
    )

    now_iso = retrieved_at or datetime.now(timezone.utc).isoformat()

    return {
        "station_id": sid_str,
        "station_name_th": raw.get("station_name_th"),
        "station_name_en": raw.get("station_name_en"),
        "province_code": p_code,
        "year_ad": year_ad,
        "year_be": year_ad + 543,
        **monthly_rainfall,
        "annual_rainfall_mm": annual_mm,
        "annual_raindays": int(annual_raindays) if annual_raindays is not None else None,
        "source_agency": TMD_SOURCE_AGENCY,
        "source_id": TMD_SOURCE_ID,
        "source_url": source_url,
        "retrieved_at": now_iso,
        "spatial_support": SPATIAL_SUPPORT,
        "data_kind": DATA_KIND,
        "license_status": LICENSE_STATUS,
    }


def tmd_to_hub_observations(
    records: Sequence[Dict[str, Any]],
    *,
    source_url: str = TMD_DATA_PORTAL_URL,
    retrieved_at: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Convert normalized TMD station records to atomic Hub observation rows conforming to observation.schema.json.
    
    Generates observation records for:
      - temperature_2m (°C)
      - rainfall (mm)
      - wind_speed (m/s)
      - relative_humidity (%)
      - air_pressure (hPa)
    """
    observations: List[Dict[str, Any]] = []
    now_iso = retrieved_at or datetime.now(timezone.utc).isoformat()

    for row in records:
        sid = row["station_id"]
        location_id = f"station:{sid}"
        observed_at = row["observed_at"]
        prov_code = row.get("province_code")
        area_code = prov_code if prov_code in PROVINCE_CODES else None

        measures = [
            ("temperature_2m", row.get("tavg_c"), "°C"),
            ("rainfall", row.get("rainfall_mm"), "mm"),
            ("wind_speed", row.get("wind_speed_ms"), "m/s"),
            ("relative_humidity", row.get("relative_humidity_pct"), "%"),
            ("air_pressure", row.get("air_pressure_hpa"), "hPa"),
        ]

        for measure_name, val, unit in measures:
            identity = f"tmd:{location_id}:{observed_at}:{measure_name}"
            obs_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()
            revision_id = hashlib.sha256(f"{obs_id}:{val}:{now_iso}".encode("utf-8")).hexdigest()

            obs = {
                "observation_id": obs_id,
                "source_id": TMD_SOURCE_ID,
                "area_code": area_code,
                "spatial_support": SPATIAL_SUPPORT,
                "location_id": location_id,
                "commodity_id": None,
                "observed_at": observed_at,
                "release_at": None,
                "retrieved_at": now_iso,
                "measure": measure_name,
                "value": val,
                "unit": unit,
                "data_kind": DATA_KIND,
                "revision_id": revision_id,
                "quality_flag": "missing" if val is None else "good",
                "source_url": source_url,
                "license_status": LICENSE_STATUS,
            }
            observations.append(obs)

    return observations


def parse_tmd_archive(
    data_or_text: Union[str, bytes, Dict[str, Any], Sequence[Dict[str, Any]]],
    *,
    data_format: str = "json",
    archive_type: str = "daily",
    province_code: Optional[str] = None,
    source_url: str = TMD_DATA_PORTAL_URL,
) -> List[Dict[str, Any]]:
    """Parse raw TMD archive input (JSON string/object or CSV text) into normalized records.
    
    archive_type: 'daily' or 'monthly_rainfall'.
    Fails closed on malformed input or unparsable rows.
    """
    raw_list: List[Dict[str, Any]] = []

    if data_format.lower() == "json":
        if isinstance(data_or_text, (str, bytes)):
            parsed = json.loads(data_or_text)
        else:
            parsed = data_or_text

        if isinstance(parsed, dict):
            # Might be wrapper with 'records' or 'data' or 'WeatherToday'
            raw_list = parsed.get("records") or parsed.get("data") or parsed.get("WeatherToday") or [parsed]
        elif isinstance(parsed, list):
            raw_list = parsed
        else:
            raise ValueError("Unexpected JSON structure in TMD archive")

    elif data_format.lower() == "csv":
        text = data_or_text.decode("utf-8-sig") if isinstance(data_or_text, bytes) else data_or_text
        reader = csv.DictReader(io.StringIO(text))
        raw_list = list(reader)
    else:
        raise ValueError(f"Unsupported data_format: {data_format}")

    results: List[Dict[str, Any]] = []
    for item in raw_list:
        if archive_type == "daily":
            norm = normalize_tmd_daily_station(item, province_code=province_code, source_url=source_url)
        elif archive_type == "monthly_rainfall":
            norm = normalize_tmd_monthly_rainfall(item, province_code=province_code, source_url=source_url)
        else:
            raise ValueError(f"Unknown archive_type: {archive_type}")
        results.append(norm)

    return results
