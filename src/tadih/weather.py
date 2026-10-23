"""Meteostat weather observation client for Thailand Agricultural Intelligence Hub.

Provides agrometeorological station registry and daily rainfall/temperature
observations across Thai agricultural regions.
"""

from datetime import date, datetime, timezone
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
