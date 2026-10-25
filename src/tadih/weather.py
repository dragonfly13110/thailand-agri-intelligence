"""Weather connectors for Thailand Agricultural Intelligence Hub.

Two independent parts, both offline-first:

- Meteostat daily station observations (reviewed snapshot + bounded fetch).
- TMD 7-day agricultural forecast processor: validates a raw forecast payload,
  derives the cumulative rainfall index and issues farm advisories. Thresholds
  mirror ``web/lib/hub/weather-data.ts`` so the offline processor and the web
  dashboard classify the same forecast identically.

Every payload keeps ``license_status = pending`` until the source confirms
publication rights; pending numeric values never reach a public API or the web.
"""

from datetime import date, datetime, timezone, timedelta
import json
import math
from pathlib import Path
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
import urllib.request

from tadih.catalog import ROOT
from tadih.env import get_meteostat_api_key

RAPIDAPI_METEOSTAT_HOST = "meteostat.p.rapidapi.com"
DEFAULT_BASE_URL = f"https://{RAPIDAPI_METEOSTAT_HOST}"

# Meteostat station metadata verified 2026-10-23, CC BY 4.0.
# Attribution: https://github.com/meteostat/weather-stations (names, region, coordinates).
# Changes: corrected the former ID/label mismatches and coordinates; this is not provincial coverage.
KEY_AGROMET_STATIONS = [
    {"id": "48455", "name_en": "Bangkok", "province_code": "10", "province_name_th": "กรุงเทพมหานคร", "lat": 13.7333, "lon": 100.5667, "elevation_m": 2},
    {"id": "48451", "name_en": "Nakhonpathom Agromet / Ban Sawang Chat", "province_code": "73", "province_name_th": "นครปฐม", "lat": 14.0117, "lon": 99.97, "elevation_m": 8},
    {"id": "48419", "name_en": "Pathumthani Agromet / Ban Lam Rua Taek", "province_code": "13", "province_name_th": "ปทุมธานี", "lat": 14.1161, "lon": 100.6206, "elevation_m": 6},
    {"id": "48425", "name_en": "Suphan Buri", "province_code": "72", "province_name_th": "สุพรรณบุรี", "lat": 14.4667, "lon": 100.1333, "elevation_m": 7},
    {"id": "48327", "name_en": "Chiang Mai", "province_code": "50", "province_name_th": "เชียงใหม่", "lat": 18.7833, "lon": 98.9833, "elevation_m": 312},
    {"id": "48381", "name_en": "Khon Kaen", "province_code": "40", "province_name_th": "ขอนแก่น", "lat": 16.4333, "lon": 102.8333, "elevation_m": 165},
    {"id": "48383", "name_en": "Mukdahan", "province_code": "49", "province_name_th": "มุกดาหาร", "lat": 16.5333, "lon": 104.7167, "elevation_m": 138},
    {"id": "48431", "name_en": "Nakhon Ratchasima", "province_code": "30", "province_name_th": "นครราชสีมา", "lat": 14.9667, "lon": 102.0833, "elevation_m": 187},
    {"id": "48407", "name_en": "Ubon Ratchathani", "province_code": "34", "province_name_th": "อุบลราชธานี", "lat": 15.25, "lon": 104.8667, "elevation_m": 123},
    {"id": "48475", "name_en": "Hua Hin", "province_code": "77", "province_name_th": "ประจวบคีรีขันธ์", "lat": 12.5833, "lon": 99.95, "elevation_m": 5},
    {"id": "48568", "name_en": "Songkhla", "province_code": "90", "province_name_th": "สงขลา", "lat": 7.2, "lon": 100.6, "elevation_m": 4},
    {"id": "48565", "name_en": "Phuket Airport", "province_code": "83", "province_name_th": "ภูเก็ต", "lat": 8.1167, "lon": 98.3167, "elevation_m": 6},
]


def fetch_weather_stations(output_path: Optional[Path] = None) -> Dict[str, Any]:
    """Materialize the reviewed station snapshot; no live metadata request."""
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "metadata": {
            "source": "meteostat.p.rapidapi.com",
            "total_stations": len(KEY_AGROMET_STATIONS),
            "contract_version": 2,
            "live_fetch": False,
            "generated_at": now_iso,
            "metadata_verified_at": "2026-10-23",
            "attribution": "Meteostat weather-stations, CC BY 4.0; labels and coordinates corrected",
            "source_url": "https://github.com/meteostat/weather-stations",
            "province_mapping_status": "provider_region_label_not_provincial_statistical_coverage",
            "license_status": "pending",
        },
        "records": KEY_AGROMET_STATIONS,
    }

    target = output_path or (ROOT / "data/local/weather/dim_weather_stations_v2.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def fetch_daily_weather_observations(
    station_ids: Optional[List[str]] = None,
    start_date: str = "2026-10-01",
    end_date: str = "2026-10-23",
    api_key: Optional[str] = None,
    output_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Stage daily station data with model substitution disabled and explicit metric units.

    v2 output is separate from legacy caches; it is not automatically imported to the warehouse.
    """
    key = api_key or get_meteostat_api_key()
    if not key or not key.strip():
        raise ValueError("METEOSTAT_API_KEY is not configured in .env")

    start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    if start.isoformat() != start_date or end.isoformat() != end_date or start > end:
        raise ValueError("Expected an ordered ISO date range")
    target_stations = station_ids if station_ids is not None else [s["id"] for s in KEY_AGROMET_STATIONS]
    if not target_stations or any(not isinstance(s, str) or not re.fullmatch(r"[A-Za-z0-9]{5}", s) for s in target_stations):
        raise ValueError("Expected Meteostat station IDs")
    target_stations = list(dict.fromkeys(target_stations))
    now_iso = datetime.now(timezone.utc).isoformat()
    all_observations: List[Dict[str, Any]] = []
    failures, empty_stations = [], []
    def number(value):
        if value is None:
            return None
        result = float(value)
        if isinstance(value, bool) or not math.isfinite(result):
            raise ValueError("Non-finite or boolean weather value")
        return result

    for index, sid in enumerate(target_stations):
        if index:
            time.sleep(1.2)  # The free service rate-limits bursts; requests remain serial.
        url = DEFAULT_BASE_URL + "/stations/daily?" + urlencode({
            "station": sid, "start": start_date, "end": end_date, "model": "false", "units": "metric"})
        req = urllib.request.Request(
            url,
            headers={
                "X-RapidAPI-Key": key.strip(),
                "X-RapidAPI-Host": RAPIDAPI_METEOSTAT_HOST,
                "User-Agent": "TADIH-NationalAgriIntelligence/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read(1_000_001)
                if len(body) > 1_000_000:
                    raise ValueError("Weather response exceeds 1 MB")
                data = json.loads(body.decode("utf-8"))
                if not isinstance(data, dict) or not isinstance(data.get("data"), list):
                    raise ValueError("Missing daily data array")
                days = data["data"]
                station_records, seen_dates = [], set()
                for day in days:
                    raw_date = str(day.get("date") or "")[:10]
                    parsed = date.fromisoformat(raw_date)
                    if not start <= parsed <= end or raw_date in seen_dates:
                        raise ValueError("Out-of-period or duplicate station day")
                    seen_dates.add(raw_date)
                    wind_kmh = number(day.get("wspd"))
                    station_records.append({
                        "station_id": str(sid),
                        "observation_date": raw_date,
                        "tavg_c": number(day.get("tavg")),
                        "tmin_c": number(day.get("tmin")),
                        "tmax_c": number(day.get("tmax")),
                        "rainfall_mm": number(day.get("prcp")),
                        "wind_speed_kmh": wind_kmh,
                        "wind_speed_ms": wind_kmh / 3.6 if wind_kmh is not None else None,
                        "air_pressure_hpa": number(day.get("pres")),
                        "model_substitution": False,
                        "source_endpoint": DEFAULT_BASE_URL + "/stations/daily",
                        "source_agency": "METEOSTAT",
                        "retrieved_at": now_iso,
                        "license_status": "pending",
                    })
                all_observations.extend(station_records)
                if not days:
                    empty_stations.append(sid)
        except Exception as e:
            failures.append({"station_id": sid, "error_type": type(e).__name__, "http_status": getattr(e, "code", None)})

    requested_days = len(target_stations) * ((end - start).days + 1)
    if len(failures) == len(target_stations):
        status = "failed"
    elif failures or (all_observations and len(all_observations) < requested_days):
        status = "partial"
    else:
        status = "ok" if all_observations else "empty"
    payload = {
        "metadata": {
            "source": "meteostat.p.rapidapi.com",
            "contract_version": 2,
            "model_substitution": False,
            "source_units": "metric",
            "wind_source_unit": "km/h",
            "wind_output_unit": "m/s",
            "time_basis": "provider_daily_date_timezone_unverified",
            "requested_stations": target_stations,
            "requested_station_days": requested_days,
            "status": status,
            "failures": failures,
            "empty_stations": empty_stations,
            "start_date": start_date,
            "end_date": end_date,
            "total_observations": len(all_observations),
            "retrieved_at": now_iso,
            "license_status": "pending",
        },
        "records": all_observations,
    }

    target = output_path or (ROOT / "data/local/weather/fact_daily_weather_v2.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


# ---------------------------------------------------------------------------
# TMD 7-day agricultural forecast processor (Lane 3: Weather & Rainfall)
# ---------------------------------------------------------------------------

FORECAST_CONTRACT_VERSION = 1
TMD_SOURCE_AGENCY = "กรมอุตุนิยมวิทยา (TMD)"
TMD_FORECAST_URL = "https://www.tmd.go.th/th"

#: The TMD product publishes at most seven lead days from the issue date.
FORECAST_MAX_DAYS = 7
FORECAST_REGIONS = ("north", "northeast", "central", "east", "south")

CONDITION_CODES = ("sunny", "partly_cloudy", "cloudy", "shower", "heavy_rain", "thunderstorm")
CONDITION_LABELS_TH = {
    "sunny": "แดดจัด",
    "partly_cloudy": "มีแดดปานกลาง",
    "cloudy": "มีเมฆมาก",
    "shower": "ฝนตกเป็นแห่ง",
    "heavy_rain": "ฝนตกหนัก",
    "thunderstorm": "ฝนฟ้าคะนอง",
}

#: Advisory thresholds. web/lib/hub/weather-data.ts repeats these constants so
#: the dashboard classifies the same forecast as this offline processor.
HEAVY_RAIN_MM = 60.0
HEAVY_RAIN_STREAK_DAYS = 3
HEAVY_RAIN_STREAK_MM = 30.0
DRY_DAY_RAIN_MM = 1.0
DRY_DAY_RAIN_CHANCE_PCT = 40
DRY_SPELL_DAYS = 5
ANOMALY_BELOW_PCT = -25.0
ANOMALY_ABOVE_PCT = 25.0
HEAT_TMAX_C = 40.0
STRONG_WIND_MS = 10.0
HIGH_HUMIDITY_PCT = 85
HIGH_HUMIDITY_DAYS = 3
PROLONGED_RAIN_DAYS = 3
PROLONGED_RAIN_CHANCE_PCT = 60

#: Output units declared alongside every forecast record.
FORECAST_UNITS = {
    "temperature": "celsius",
    "rain_chance": "percent",
    "rainfall": "mm",
    "relative_humidity": "percent",
    "wind_speed": "m/s",
    "wind_direction": "degrees_compass",
}

#: Eight-point compass, clockwise from north; the forecast wind direction in degrees.
WIND_DIRECTIONS_TH = (
    "เหนือ",
    "ตะวันออกเฉียงเหนือ",
    "ตะวันออก",
    "ตะวันออกเฉียงใต้",
    "ใต้",
    "ตะวันตกเฉียงใต้",
    "ตะวันตก",
    "ตะวันตกเฉียงเหนือ",
)

ADVISORY_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def condition_label(condition_code: Optional[str]) -> Optional[str]:
    """Thai label for a normalized condition code; unknown codes fail closed."""
    if condition_code is None:
        return None
    if condition_code not in CONDITION_LABELS_TH:
        raise ValueError("Unknown forecast condition code")
    return CONDITION_LABELS_TH[condition_code]


def wind_speed_kmh_to_ms(value: Optional[float]) -> Optional[float]:
    """Convert a source km/h wind speed to the forecast unit (m/s)."""
    number = _forecast_number(value, name="wind_speed_kmh", low=0.0, high=300.0)
    return None if number is None else round(number / 3.6, 2)


def wind_direction_label(degrees: Optional[float]) -> Optional[str]:
    """Compass sector in Thai for a direction in degrees (0-360, north clockwise)."""
    number = _forecast_number(degrees, name="wind_direction_deg", low=0.0, high=360.0)
    if number is None:
        return None
    return WIND_DIRECTIONS_TH[round(number % 360 / 45) % 8]


def _forecast_number(value: Any, *, name: str, low: Optional[float] = None,
                     high: Optional[float] = None) -> Optional[float]:
    """Finite float or None for missing values; bool, non-numeric and out-of-range fail."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Expected a number for {name}")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Non-finite value for {name}")
    if (low is not None and number < low) or (high is not None and number > high):
        raise ValueError(f"Value out of range for {name}")
    return number


def normalize_forecast_day(raw: Any, *, forecast_date: str, region: str,
                           province_code: Optional[str] = None) -> Dict[str, Any]:
    """Validate one raw day of a TMD forecast into a normalized record.

    Canonical input keys are ``date``, ``tmax_c``, ``tmin_c``, ``rain_chance_pct``,
    ``rainfall_mm``, ``humidity_min_pct``, ``humidity_max_pct``,
    ``wind_direction_deg``, ``wind_speed_ms`` (or ``wind_speed_kmh``) and
    ``condition_code``. Missing values stay ``None``; they never become zero.
    """
    if not isinstance(raw, dict):
        raise ValueError("Forecast day must be an object")
    if region not in FORECAST_REGIONS:
        raise ValueError("Unknown forecast region")
    if province_code is not None and (not isinstance(province_code, str) or not re.fullmatch(r"\d{2}", province_code)):
        raise ValueError("Expected a two-digit province code")
    if not isinstance(forecast_date, str) or date.fromisoformat(forecast_date).isoformat() != forecast_date:
        raise ValueError("Expected an ISO forecast date")
    raw_date = raw.get("date")
    if raw_date != forecast_date:
        raise ValueError("Forecast day date does not match its position in the window")

    condition_code = raw.get("condition_code")
    if condition_code is not None and (not isinstance(condition_code, str) or condition_code not in CONDITION_CODES):
        raise ValueError("Unknown forecast condition code")
    condition_label(condition_code)

    tmax_c = _forecast_number(raw.get("tmax_c"), name="tmax_c", low=-30.0, high=60.0)
    tmin_c = _forecast_number(raw.get("tmin_c"), name="tmin_c", low=-30.0, high=60.0)
    if tmax_c is not None and tmin_c is not None and tmax_c < tmin_c:
        raise ValueError("tmax_c must not be below tmin_c")
    humidity_min = _forecast_number(raw.get("humidity_min_pct"), name="humidity_min_pct", low=0.0, high=100.0)
    humidity_max = _forecast_number(raw.get("humidity_max_pct"), name="humidity_max_pct", low=0.0, high=100.0)
    if humidity_min is not None and humidity_max is not None and humidity_min > humidity_max:
        raise ValueError("humidity_min_pct must not exceed humidity_max_pct")

    wind_speed_ms = raw.get("wind_speed_ms")
    wind_source = "m/s"
    if wind_speed_ms is None and raw.get("wind_speed_kmh") is not None:
        wind_speed_ms = wind_speed_kmh_to_ms(raw.get("wind_speed_kmh"))
        wind_source = "km/h"
    wind_speed_ms = _forecast_number(wind_speed_ms, name="wind_speed_ms", low=0.0, high=100.0)
    wind_degrees = _forecast_number(raw.get("wind_direction_deg"), name="wind_direction_deg", low=0.0, high=360.0)

    return {
        "forecast_date": forecast_date,
        "region": region,
        "province_code": province_code,
        "tmax_c": tmax_c,
        "tmin_c": tmin_c,
        "rain_chance_pct": _forecast_number(raw.get("rain_chance_pct"), name="rain_chance_pct", low=0.0, high=100.0),
        "rainfall_mm": _forecast_number(raw.get("rainfall_mm"), name="rainfall_mm", low=0.0, high=1000.0),
        "humidity_min_pct": humidity_min,
        "humidity_max_pct": humidity_max,
        "wind_direction_deg": wind_degrees,
        "wind_direction_label": wind_direction_label(wind_degrees),
        "wind_speed_ms": wind_speed_ms,
        "wind_speed_source_unit": None if wind_speed_ms is None else wind_source,
        "condition_code": condition_code,
        "condition_label_th": condition_label(condition_code),
    }


def parse_tmd_agri_forecast(payload: Any, *, issued_at: str, region: str,
                            province_code: Optional[str] = None) -> Dict[str, Any]:
    """Normalize a raw TMD 7-day agricultural forecast envelope.

    The payload must carry 1 to 7 consecutive days starting at ``issued_at``;
    gaps, duplicates and longer windows fail closed instead of being silently
    dropped. The returned envelope always reports ``license_status = pending``.
    """
    if not isinstance(payload, dict):
        raise ValueError("TMD forecast payload must be an object")
    days = payload.get("days")
    if not isinstance(days, list) or not 1 <= len(days) <= FORECAST_MAX_DAYS:
        raise ValueError(f"Expected 1 to {FORECAST_MAX_DAYS} forecast days")
    if not isinstance(issued_at, str) or date.fromisoformat(issued_at).isoformat() != issued_at:
        raise ValueError("Expected an ISO issue date")
    if region not in FORECAST_REGIONS:
        raise ValueError("Unknown forecast region")

    start = date.fromisoformat(issued_at)
    records = [
        normalize_forecast_day(
            raw,
            forecast_date=(start + timedelta(days=offset)).isoformat(),
            region=region,
            province_code=province_code,
        )
        for offset, raw in enumerate(days)
    ]
    return {
        "metadata": {
            "contract_version": FORECAST_CONTRACT_VERSION,
            "product": "tmd_7day_agricultural_forecast",
            "source_agency": TMD_SOURCE_AGENCY,
            "source_url": TMD_FORECAST_URL,
            "issued_at": issued_at,
            "timezone": "Asia/Bangkok",
            "region": region,
            "province_code": province_code,
            "forecast_days": len(records),
            "units": dict(FORECAST_UNITS),
            "data_kind": "forecast",
            "license_status": "pending",
        },
        "records": records,
    }


def _normal_daily_rainfall(normal_rainfall_mm: Any, window_days: int) -> List[float]:
    """Expand a scalar or per-day normal into one positive daily normal per day."""
    if isinstance(normal_rainfall_mm, bool) or not isinstance(normal_rainfall_mm, (int, float, list, tuple)):
        raise ValueError("Expected daily normal rainfall in mm")
    normals = ([normal_rainfall_mm] * window_days if isinstance(normal_rainfall_mm, (int, float))
               else list(normal_rainfall_mm))
    if len(normals) != window_days:
        raise ValueError("Expected one normal value per forecast day")
    values = []
    for value in normals:
        number = _forecast_number(value, name="normal_rainfall_mm", low=0.0, high=1000.0)
        if number is None or number <= 0:
            raise ValueError("Normal rainfall must be greater than zero")
        values.append(number)
    return values


def cumulative_rainfall_index(records: Any, *, normal_rainfall_mm: Any) -> Dict[str, Any]:
    """Cumulative rainfall index for the forecast window against normal rainfall.

    Compares the forecast accumulation with the supplied normal (climatology)
    over the same window. A missing day stays missing: it reduces
    ``days_with_data`` and marks completeness ``partial`` instead of counting
    as a dry day or zero millimetres.
    """
    if not isinstance(records, list) or not records or len(records) > FORECAST_MAX_DAYS:
        raise ValueError(f"Select 1 to {FORECAST_MAX_DAYS} normalized forecast days")
    if any(not isinstance(record, dict) or "rainfall_mm" not in record or "forecast_date" not in record
           for record in records):
        raise ValueError("Expected normalized forecast records")
    normals = _normal_daily_rainfall(normal_rainfall_mm, len(records))

    rainfalls = [record.get("rainfall_mm") for record in records]
    known = [value for value in rainfalls if value is not None]
    missing_days = len(rainfalls) - len(known)
    total = math.fsum(known) if known else None
    normal_total = math.fsum(normals)
    anomaly = None if total is None else total - normal_total
    anomaly_percent = None if total is None else anomaly / normal_total * 100
    if anomaly_percent is None:
        status = "unknown"
    elif anomaly_percent <= ANOMALY_BELOW_PCT:
        status = "below_normal"
    elif anomaly_percent >= ANOMALY_ABOVE_PCT:
        status = "above_normal"
    else:
        status = "normal"
    return {
        "window_days": len(records),
        "days_with_data": len(known),
        "missing_days": missing_days,
        "forecast_total_mm": None if total is None else round(total, 1),
        "normal_total_mm": round(normal_total, 1),
        "anomaly_mm": None if anomaly is None else round(anomaly, 1),
        "anomaly_percent": None if anomaly_percent is None else round(anomaly_percent, 1),
        "status": status,
        "completeness": "complete" if missing_days == 0 else "partial",
        "dry_days": sum(value is not None and value < DRY_DAY_RAIN_MM for value in rainfalls),
        "heavy_rain_days": sum(value is not None and value >= HEAVY_RAIN_MM for value in rainfalls),
        "calculation_version": "cumulative-rainfall-index-v1",
    }


def _longest_streak(values: List[bool]) -> int:
    longest = current = 0
    for value in values:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return longest


def agricultural_weather_advisories(records: Any,
                                    cumulative: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Farm advisories derived from a normalized 7-day forecast.

    Deterministic and ordered by severity (high, medium, low), then by code.
    With ``cumulative`` supplied the rainfall-index status additionally feeds the
    dry-spell advisory; without it only the in-window dry streak applies.
    """
    if not isinstance(records, list) or not records or len(records) > FORECAST_MAX_DAYS:
        raise ValueError(f"Select 1 to {FORECAST_MAX_DAYS} normalized forecast days")
    if any(not isinstance(record, dict) or "forecast_date" not in record for record in records):
        raise ValueError("Expected normalized forecast records")
    if cumulative is not None and not isinstance(cumulative, dict):
        raise ValueError("Expected a cumulative rainfall index")

    rainfall = [record.get("rainfall_mm") for record in records]
    rain_chance = [record.get("rain_chance_pct") for record in records]
    tmax = [record.get("tmax_c") for record in records]
    wind = [record.get("wind_speed_ms") for record in records]
    humidity = [record.get("humidity_max_pct") for record in records]

    def day_is_dry(index: int) -> bool:
        rain = rainfall[index]
        chance = rain_chance[index]
        return (rain is None or rain < DRY_DAY_RAIN_MM) and (chance is None or chance < DRY_DAY_RAIN_CHANCE_PCT)

    dry_streak = _longest_streak([day_is_dry(index) for index in range(len(records))])
    heavy_streak = _longest_streak([
        value is not None and value >= HEAVY_RAIN_STREAK_MM for value in rainfall
    ])
    wet_streak = _longest_streak([
        chance is not None and chance >= PROLONGED_RAIN_CHANCE_PCT for chance in rain_chance
    ])
    humid_streak = _longest_streak([
        value is not None and value >= HIGH_HUMIDITY_PCT for value in humidity
    ])
    below_normal = bool(cumulative) and cumulative.get("status") == "below_normal" and cumulative.get("dry_days", 0) >= 3

    found: Dict[str, Dict[str, Any]] = {}

    def add(code: str, severity: str, title: str, message: str, actions: List[str]) -> None:
        found[code] = {
            "code": code,
            "severity": severity,
            "title_th": title,
            "message_th": message,
            "actions": actions,
        }

    if any(value is not None and value >= HEAVY_RAIN_MM for value in rainfall) or heavy_streak >= HEAVY_RAIN_STREAK_DAYS:
        add("HEAVY_RAIN", "high", "ฝนตกหนัก",
            "ช่วงนี้มีฝนตกหนัก งดใส่ปุ๋ยเคมีและสารเคมีก่อนฝนอย่างน้อย 48 ชั่วโมง เพื่อไม่ให้ปุ๋ยและสารถูกชะล้างลงดินและแหล่งน้ำ",
            ["งดใส่ปุ๋ยเคมีและสารเคมีก่อนฝน 48 ชั่วโมง",
             "ระบายน้ำในแปลงและยกแปลงให้สูงขึ้นป้องกันน้ำขัง",
             "เลื่อนการใช้เครื่องจักรหนักในแปลงที่ดินอุ้มน้ำ"])
    if any(value is not None and value >= HEAT_TMAX_C for value in tmax):
        add("HEAT", "high", "อากาศร้อนจัด",
            "อุณหภูมิสูงจัด อากาศแห้งและร้อนเพิ่มความเครียดให้พืชและสัตว์ ควรให้น้ำและดูแลช่วงเช้าหรือเย็น",
            ["ให้น้ำแปลงผักและแปลงเพาะปลูกช่วงเช้าตรู่",
             "คลุมดินหรือรองพื้นฟางเพื่อลดการระเหย",
             "เพิ่มน้ำและพื้นที่หลบแดดสำหรับสัตว์"])
    if dry_streak >= DRY_SPELL_DAYS or below_normal:
        add("DRY_SPELL", "medium", "ฝนทิ้งช่วง / ฝนต่ำกว่าปกติ",
            "ปริมาณฝนต่ำกว่าค่าเฉลี่ยปกติหรือฝนทิ้งช่วงยาว ระวังเพลี้ยไฟและแมลงระบาด จัดการให้น้ำตามรอบไม่ให้พืชชะงัก",
            ["ให้น้ำช่วงเช้าหรือเย็นตามรอบการให้น้ำของพืช",
             "ตรวจแปลงรายสัปดาห์เพื่อพบเพลี้ยและแมลงระยะแรก",
             "ชะล้างใบพืชเบา ๆ และหลีกเลี่ยงการให้น้ำตอนแดดจัด"])
    if humid_streak >= HIGH_HUMIDITY_DAYS:
        add("HIGH_HUMIDITY", "medium", "ความชื้นสูงต่อเนื่อง",
            "ความชื้นสัมพัทธ์สูงต่อเนื่องหลายวัน เสี่ยงโรคเชื้อราและใบไหม้ในพืช ควรระบายอากาศและตรวจแปลงสม่ำเสมอ",
            ["ตรวจอาการเชื้อราบนใบและผลทุก 2-3 วัน",
             "ระบายอากาศในโรงเรือนและไม่รดน้ำช่วงเย็นค่ำ",
             "ตัดแต่งส่วนที่เป็นโรคและนำไปทิ้งนอกแปลง"])
    if any(value is not None and value >= STRONG_WIND_MS for value in wind):
        add("STRONG_WIND", "medium", "ลมแรง",
            "ลมแรงในช่วงพยากรณ์ งดพ่นสารเคมีเพื่อไม่ให้ละอองปลิวไปแปลงข้างเคียง และงดเผาในที่โล่ง",
            ["งดพ่นสารเคมีและปุ๋ยผงช่วงลมแรง",
             "ตรวจสอบหลังคาโรงเรือน คอกสัตว์ และตาข่ายกันลมให้แข็งแรง",
             "งดเผาแปลงเกษตรเพื่อป้องกันไฟลุกลาม"])
    if wet_streak >= PROLONGED_RAIN_DAYS:
        add("PROLONGED_RAIN", "low", "มีฝนต่อเนื่องหลายวัน",
            "มีโอกาสฝนตกต่อเนื่องหลายวัน งดใส่ปุ๋ยเคมีล่วงหน้าและดูแลความชื้นในแปลงไม่ให้มากเกินไป",
            ["งดใส่ปุ๋ยเคมีก่อนฝนอย่างน้อย 48 ชั่วโมง",
             "สังเกตน้ำขังตามร่องแปลงและระบายน้ำออก",
             "ชะล้างโคลนและตะกอนออกจากใบหลังฝนหยุด"])

    return sorted(found.values(), key=lambda row: (ADVISORY_SEVERITY_ORDER[row["severity"]], row["code"]))
