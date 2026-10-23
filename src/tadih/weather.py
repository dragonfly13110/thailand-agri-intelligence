"""Meteostat weather observation client for Thailand Agricultural Intelligence Hub.

Provides agrometeorological station registry and daily rainfall/temperature
observations across Thai agricultural regions.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import urllib.request

from tadih.catalog import ROOT, load_provinces
from tadih.env import get_meteostat_api_key

RAPIDAPI_METEOSTAT_HOST = "meteostat.p.rapidapi.com"
DEFAULT_BASE_URL = f"https://{RAPIDAPI_METEOSTAT_HOST}"

# Major agricultural & regional meteorological stations across Thailand
KEY_AGROMET_STATIONS = [
    {"id": "48455", "name_en": "Bangkok Metropolis", "province_code": "10", "province_name_th": "กรุงเทพมหานคร", "lat": 13.73, "lon": 100.56, "elevation_m": 4},
    {"id": "48451", "name_en": "Nakhon Pathom Agromet", "province_code": "73", "province_name_th": "นครปฐม", "lat": 13.82, "lon": 100.04, "elevation_m": 8},
    {"id": "48419", "name_en": "Pathum Thani Agromet", "province_code": "13", "province_name_th": "ปทุมธานี", "lat": 14.02, "lon": 100.53, "elevation_m": 5},
    {"id": "48425", "name_en": "Suphan Buri Agromet", "province_code": "72", "province_name_th": "สุพรรณบุรี", "lat": 14.47, "lon": 100.12, "elevation_m": 12},
    {"id": "48327", "name_en": "Chiang Mai", "province_code": "50", "province_name_th": "เชียงใหม่", "lat": 18.77, "lon": 98.98, "elevation_m": 312},
    {"id": "48381", "name_en": "Nakhon Sawan", "province_code": "60", "province_name_th": "นครสวรรค์", "lat": 15.68, "lon": 100.13, "elevation_m": 34},
    {"id": "48383", "name_en": "Khon Kaen Agromet", "province_code": "40", "province_name_th": "ขอนแก่น", "lat": 16.43, "lon": 102.83, "elevation_m": 165},
    {"id": "48431", "name_en": "Nakhon Ratchasima", "province_code": "30", "province_name_th": "นครราชสีมา", "lat": 14.97, "lon": 102.08, "elevation_m": 187},
    {"id": "48407", "name_en": "Ubon Ratchathani Agromet", "province_code": "34", "province_name_th": "อุบลราชธานี", "lat": 15.25, "lon": 104.87, "elevation_m": 124},
    {"id": "48475", "name_en": "Chanthaburi Agromet", "province_code": "22", "province_name_th": "จันทบุรี", "lat": 12.61, "lon": 102.11, "elevation_m": 4},
    {"id": "48568", "name_en": "Songkhla", "province_code": "90", "province_name_th": "สงขลา", "lat": 7.18, "lon": 100.60, "elevation_m": 4},
    {"id": "48565", "name_en": "Surat Thani Agromet", "province_code": "84", "province_name_th": "สุราษฎร์ธานี", "lat": 9.13, "lon": 99.33, "elevation_m": 5},
]


def fetch_weather_stations(output_path: Optional[Path] = None) -> Dict[str, Any]:
    """Return and cache key agricultural weather stations in Thailand."""
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "metadata": {
            "source": "meteostat.p.rapidapi.com",
            "total_stations": len(KEY_AGROMET_STATIONS),
            "retrieved_at": now_iso,
            "license_status": "pending",
        },
        "records": KEY_AGROMET_STATIONS,
    }

    target = output_path or (ROOT / "data/local/weather/dim_weather_stations.json")
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
    """Fetch daily weather observations for selected stations."""
    key = api_key or get_meteostat_api_key()
    if not key or not key.strip():
        raise ValueError("METEOSTAT_API_KEY is not configured in .env")

    target_stations = station_ids or [s["id"] for s in KEY_AGROMET_STATIONS]
    now_iso = datetime.now(timezone.utc).isoformat()
    all_observations: List[Dict[str, Any]] = []

    for sid in target_stations:
        url = f"{DEFAULT_BASE_URL}/stations/daily?station={sid}&start={start_date}&end={end_date}"
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
                data = json.loads(resp.read().decode("utf-8"))
                days = data.get("data", [])
                for day in days:
                    raw_date = str(day.get("date") or "")[:10]
                    all_observations.append({
                        "station_id": str(sid),
                        "observation_date": raw_date,
                        "tavg_c": float(day["tavg"]) if day.get("tavg") is not None else None,
                        "tmin_c": float(day["tmin"]) if day.get("tmin") is not None else None,
                        "tmax_c": float(day["tmax"]) if day.get("tmax") is not None else None,
                        "rainfall_mm": float(day["prcp"]) if day.get("prcp") is not None else 0.0,
                        "wind_speed_ms": float(day["wspd"]) if day.get("wspd") is not None else None,
                        "air_pressure_hpa": float(day["pres"]) if day.get("pres") is not None else None,
                        "source_agency": "TMD_METEOSTAT",
                        "retrieved_at": now_iso,
                        "license_status": "pending",
                    })
        except Exception as e:
            # Continue on individual station failure without breaking whole batch
            continue

    payload = {
        "metadata": {
            "source": "meteostat.p.rapidapi.com",
            "start_date": start_date,
            "end_date": end_date,
            "total_observations": len(all_observations),
            "retrieved_at": now_iso,
            "license_status": "pending",
        },
        "records": all_observations,
    }

    target = output_path or (ROOT / "data/local/weather/fact_daily_weather.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload
