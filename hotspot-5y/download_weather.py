"""Fetch 5-year daily Fire-Weather (2022-01-01..2026-11-15) for all 77 Thai provinces from Open-Meteo Archive API (CC-BY-4.0),
aggregate to monthly fire-weather statistics + transparent Fire-Weather Risk Index (0-100),
and ingest into hotspot_5y.duckdb (table: era5_monthly_fire_weather, view: v_era5_annual_fire_weather).

Usage:
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_weather.py
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_weather.py --force
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SUBPROJECT_DIR.parent
if str(REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "src"))
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from config import DEFAULT_DB_PATH  # noqa: E402
from tadih.open_meteo import trusted_ssl_context  # noqa: E402

ERA5_ANNUAL_PATH = REPO_ROOT / "web" / "data" / "climate-history" / "era5-annual-2016-2025.json"
WEATHER_RAW_DIR = SUBPROJECT_DIR / "data" / "raw" / "weather"
MONTHLY_CACHE_CSV = WEATHER_RAW_DIR / "era5_monthly_fire_weather.csv"

OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
START_DATE = "2022-01-01"
END_DATE = "2026-11-15"
DAILY_VARS = [
    "temperature_2m_max",
    "temperature_2m_mean",
    "precipitation_sum",
    "wind_speed_10m_max",
    "et0_fao_evapotranspiration",
    "relative_humidity_2m_mean",
    "relative_humidity_2m_min",
]


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def compute_fire_weather_index(
    tmax_mean: float | None,
    rh_min_mean: float | None,
    wind_max_mean: float | None,
    dry_day_frac: float | None,
    et0_daily_mean: float | None,
) -> float | None:
    """Transparent 0-100 monthly Fire-Weather Risk proxy combining heat, dryness, wind, and dry-day persistence.

    Weights:
      - 30% Heat (tmax_mean normalized across 26°C..40°C)
      - 30% Low Humidity / Air Dryness (rh_min_mean inverted across 70%..20%)
      - 20% Dry-day persistence (fraction of days with rain < 1 mm)
      - 10% Evaporative demand (ET0 daily mean across 2.5..6.5 mm/day)
      - 10% Wind speed (wind_max_mean across 6..24 km/h)
    """
    if (tmax_mean is None or rh_min_mean is None or wind_max_mean is None
            or dry_day_frac is None or et0_daily_mean is None):
        return None
    t_score = _clamp01((tmax_mean - 26.0) / 14.0)
    rh_score = _clamp01((70.0 - rh_min_mean) / 50.0)
    dry_score = _clamp01(dry_day_frac)
    et0_score = _clamp01((et0_daily_mean - 2.5) / 4.0)
    wind_score = _clamp01((wind_max_mean - 6.0) / 18.0)
    fwi = 100.0 * (0.30 * t_score + 0.30 * rh_score + 0.20 * dry_score + 0.10 * et0_score + 0.10 * wind_score)
    return round(fwi, 1)


def load_province_coords() -> list[dict]:
    raw = json.loads(ERA5_ANNUAL_PATH.read_text(encoding="utf-8"))
    provs = raw.get("provinces") or {}
    out: list[dict] = []
    for code in sorted(provs.keys()):
        p = provs[code]
        out.append({
            "prov_code": str(p["province_code"]).zfill(2),
            "name_en": p.get("name_en") or "",
            "region": p.get("region") or "",
            "lat": float(p["requested_latitude"]),
            "lon": float(p["requested_longitude"]),
        })
    return out


def fetch_batch(batch: list[dict], start_date: str, end_date: str) -> list[dict]:
    params = urlencode({
        "latitude": ",".join(f"{p['lat']:.4f}" for p in batch),
        "longitude": ",".join(f"{p['lon']:.4f}" for p in batch),
        "start_date": start_date,
        "end_date": end_date,
        "daily": ",".join(DAILY_VARS),
        "timezone": "Asia/Bangkok",
    })
    url = f"{OPEN_METEO_ARCHIVE}?{params}"
    ctx = trusted_ssl_context()
    waits = (35, 65, 65, 65)
    for attempt, wait in enumerate(waits):
        try:
            req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/2.0"})
            with urlopen(req, timeout=60, context=ctx) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data if isinstance(data, list) else [data]
        except HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            if e.code == 429:
                if "hourly" in body.lower():
                    raise RuntimeError(f"Open-Meteo hourly quota exceeded: {body}") from e
                if attempt < len(waits) - 1:
                    print(f"[Weather] 429 minute-window limit, waiting {wait}s before retry ...", flush=True)
                    time.sleep(wait)
                    continue
            raise RuntimeError(f"Open-Meteo HTTP {e.code}: {body}") from e
    raise RuntimeError("Failed to fetch Open-Meteo batch after retries")


def aggregate_province_monthly(prov: dict, daily: dict) -> list[dict]:
    times = daily.get("time") or []
    tmax_arr = daily.get("temperature_2m_max") or []
    tmean_arr = daily.get("temperature_2m_mean") or []
    rain_arr = daily.get("precipitation_sum") or []
    wind_arr = daily.get("wind_speed_10m_max") or []
    et0_arr = daily.get("et0_fao_evapotranspiration") or []
    rh_mean_arr = daily.get("relative_humidity_2m_mean") or []
    rh_min_arr = daily.get("relative_humidity_2m_min") or []

    buckets: dict[tuple[int, int], list[int]] = {}
    for idx, dt_str in enumerate(times):
        yr = int(dt_str[:4])
        mo = int(dt_str[5:7])
        buckets.setdefault((yr, mo), []).append(idx)

    rows: list[dict] = []
    for (yr, mo) in sorted(buckets.keys()):
        idxs = buckets[(yr, mo)]
        tmaxs = [float(tmax_arr[i]) for i in idxs if i < len(tmax_arr) and tmax_arr[i] is not None]
        tmeans = [float(tmean_arr[i]) for i in idxs if i < len(tmean_arr) and tmean_arr[i] is not None]
        rains = [float(rain_arr[i]) for i in idxs if i < len(rain_arr) and rain_arr[i] is not None]
        winds = [float(wind_arr[i]) for i in idxs if i < len(wind_arr) and wind_arr[i] is not None]
        et0s = [float(et0_arr[i]) for i in idxs if i < len(et0_arr) and et0_arr[i] is not None]
        rh_means = [float(rh_mean_arr[i]) for i in idxs if i < len(rh_mean_arr) and rh_mean_arr[i] is not None]
        rh_mins = [float(rh_min_arr[i]) for i in idxs if i < len(rh_min_arr) and rh_min_arr[i] is not None]

        days_cnt = len(idxs)
        tmax_mean = round(sum(tmaxs) / len(tmaxs), 2) if tmaxs else None
        tmax_peak = round(max(tmaxs), 2) if tmaxs else None
        tmean_avg = round(sum(tmeans) / len(tmeans), 2) if tmeans else None
        hot_35 = sum(1 for v in tmaxs if v >= 35.0)
        hot_38 = sum(1 for v in tmaxs if v >= 38.0)

        rain_sum = round(sum(rains), 1) if rains else None
        dry_days = sum(1 for v in rains if v < 1.0)
        longest_dry = 0
        cur_dry = 0
        for v in rains:
            if v < 1.0:
                cur_dry += 1
                if cur_dry > longest_dry:
                    longest_dry = cur_dry
            else:
                cur_dry = 0

        wind_mean = round(sum(winds) / len(winds), 2) if winds else None
        wind_peak = round(max(winds), 2) if winds else None
        et0_sum = round(sum(et0s), 1) if et0s else None
        et0_mean = (sum(et0s) / len(et0s)) if et0s else None
        rh_mean_avg = round(sum(rh_means) / len(rh_means), 1) if rh_means else None
        rh_min_avg = round(sum(rh_mins) / len(rh_mins), 1) if rh_mins else None
        low_rh_35 = sum(1 for v in rh_mins if v < 35.0)

        fwi = compute_fire_weather_index(
            tmax_mean,
            rh_min_avg,
            wind_mean,
            dry_days / len(rains) if rains else None,
            et0_mean,
        )

        rows.append({
            "prov_code": prov["prov_code"],
            "year_th": yr,
            "month_th": mo,
            "ym": f"{yr:04d}-{mo:02d}",
            "days_count": days_cnt,
            "tmax_mean_c": tmax_mean,
            "tmax_peak_c": tmax_peak,
            "tmean_c": tmean_avg,
            "hot_days_35c": hot_35,
            "hot_days_38c": hot_38,
            "rain_mm": rain_sum,
            "dry_days": dry_days,
            "longest_dry_spell_days": longest_dry,
            "wind_max_mean_kmh": wind_mean,
            "wind_peak_kmh": wind_peak,
            "et0_sum_mm": et0_sum,
            "rh_mean_pct": rh_mean_avg,
            "rh_min_mean_pct": rh_min_avg,
            "low_rh_days_35pct": low_rh_35,
            "fire_weather_index": fwi,
        })
    return rows


FIELDNAMES = [
    "prov_code", "year_th", "month_th", "ym", "days_count",
    "tmax_mean_c", "tmax_peak_c", "tmean_c", "hot_days_35c", "hot_days_38c",
    "rain_mm", "dry_days", "longest_dry_spell_days",
    "wind_max_mean_kmh", "wind_peak_kmh", "et0_sum_mm",
    "rh_mean_pct", "rh_min_mean_pct", "low_rh_days_35pct", "fire_weather_index",
]


def fetch_or_load_weather(*, force: bool = False) -> list[dict]:
    WEATHER_RAW_DIR.mkdir(parents=True, exist_ok=True)
    ckpt_dir = WEATHER_RAW_DIR / "provs"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    if not force and MONTHLY_CACHE_CSV.exists() and MONTHLY_CACHE_CSV.stat().st_size > 10_000:
        print(f"[Weather] Loading cached monthly fire-weather from {MONTHLY_CACHE_CSV.name} ...", flush=True)
        with MONTHLY_CACHE_CSV.open("r", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    provs = load_province_coords()
    pending = []
    for p in provs:
        cf = ckpt_dir / f"{p['prov_code']}.json"
        if force or not cf.exists() or cf.stat().st_size < 100:
            pending.append(p)

    batch_size = 3
    for i in range(0, len(pending), batch_size):
        batch = pending[i:i + batch_size]
        print(
            f"[Weather] Fetching Open-Meteo ERA5 batch {i // batch_size + 1}/{(len(pending) + batch_size - 1) // batch_size} "
            f"({batch[0]['prov_code']}..{batch[-1]['prov_code']}) ...",
            flush=True,
        )
        results = fetch_batch(batch, START_DATE, END_DATE)
        if len(results) != len(batch):
            raise RuntimeError(f"Expected {len(batch)} results, got {len(results)}")
        for prov, res in zip(batch, results):
            rows_p = aggregate_province_monthly(prov, res.get("daily") or {})
            (ckpt_dir / f"{prov['prov_code']}.json").write_text(
                json.dumps(rows_p, ensure_ascii=False), encoding="utf-8"
            )
        if i + batch_size < len(pending):
            time.sleep(35.0)

    all_rows: list[dict] = []
    for p in provs:
        cf = ckpt_dir / f"{p['prov_code']}.json"
        all_rows.extend(json.loads(cf.read_text(encoding="utf-8")))

    with MONTHLY_CACHE_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        w.writerows(all_rows)
    print(f"[Weather] Saved {len(all_rows):,} rows -> {MONTHLY_CACHE_CSV}", flush=True)
    return all_rows


def _opt_float(v) -> float | None:
    if v is None or v == "":
        return None
    return float(v)


def _opt_int(v) -> int | None:
    if v is None or v == "":
        return None
    return int(float(v))


def ingest_weather_to_duckdb(rows: list[dict], db_path: Path = DEFAULT_DB_PATH) -> None:
    con = duckdb.connect(str(db_path))
    try:
        con.execute("DROP VIEW IF EXISTS v_era5_annual_fire_weather")
        con.execute("DROP TABLE IF EXISTS era5_monthly_fire_weather")
        con.execute("""
            CREATE TABLE era5_monthly_fire_weather (
                prov_code VARCHAR,
                year_th INTEGER,
                month_th INTEGER,
                ym VARCHAR,
                days_count INTEGER,
                tmax_mean_c DOUBLE,
                tmax_peak_c DOUBLE,
                tmean_c DOUBLE,
                hot_days_35c INTEGER,
                hot_days_38c INTEGER,
                rain_mm DOUBLE,
                dry_days INTEGER,
                longest_dry_spell_days INTEGER,
                wind_max_mean_kmh DOUBLE,
                wind_peak_kmh DOUBLE,
                et0_sum_mm DOUBLE,
                rh_mean_pct DOUBLE,
                rh_min_mean_pct DOUBLE,
                low_rh_days_35pct INTEGER,
                fire_weather_index DOUBLE
            )
        """)
        tuples = [
            (
                str(r["prov_code"]).zfill(2),
                int(r["year_th"]),
                int(r["month_th"]),
                str(r["ym"]),
                _opt_int(r["days_count"]),
                _opt_float(r["tmax_mean_c"]),
                _opt_float(r["tmax_peak_c"]),
                _opt_float(r["tmean_c"]),
                _opt_int(r["hot_days_35c"]),
                _opt_int(r["hot_days_38c"]),
                _opt_float(r["rain_mm"]),
                _opt_int(r["dry_days"]),
                _opt_int(r["longest_dry_spell_days"]),
                _opt_float(r["wind_max_mean_kmh"]),
                _opt_float(r["wind_peak_kmh"]),
                _opt_float(r["et0_sum_mm"]),
                _opt_float(r["rh_mean_pct"]),
                _opt_float(r["rh_min_mean_pct"]),
                _opt_int(r["low_rh_days_35pct"]),
                _opt_float(r["fire_weather_index"]),
            )
            for r in rows
        ]
        con.executemany(
            "INSERT INTO era5_monthly_fire_weather VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            tuples,
        )
        con.execute("""
            CREATE VIEW v_era5_annual_fire_weather AS
            SELECT prov_code,
                   year_th,
                   count(*) AS months_count,
                   sum(days_count) AS days_count,
                   round(avg(tmax_mean_c), 2) AS tmax_mean_c,
                   round(max(tmax_peak_c), 2) AS tmax_peak_c,
                   round(avg(tmean_c), 2) AS tmean_c,
                   sum(hot_days_35c) AS hot_days_35c,
                   sum(hot_days_38c) AS hot_days_38c,
                   round(sum(rain_mm), 1) AS rain_mm,
                   sum(dry_days) AS dry_days,
                   max(longest_dry_spell_days) AS max_month_dry_spell_days,
                   round(avg(wind_max_mean_kmh), 2) AS wind_max_mean_kmh,
                   round(max(wind_peak_kmh), 2) AS wind_peak_kmh,
                   round(sum(et0_sum_mm), 1) AS et0_sum_mm,
                   round(avg(rh_mean_pct), 1) AS rh_mean_pct,
                   round(avg(rh_min_mean_pct), 1) AS rh_min_mean_pct,
                   sum(low_rh_days_35pct) AS low_rh_days_35pct,
                   round(avg(fire_weather_index), 1) AS fire_weather_index,
                   round(avg(fire_weather_index) FILTER (WHERE month_th BETWEEN 1 AND 4), 1) AS peak_season_fwi
            FROM era5_monthly_fire_weather
            GROUP BY 1, 2
        """)
        summary = con.execute("""
            SELECT year_th, count(DISTINCT prov_code), count(*),
                   round(avg(tmax_mean_c), 1), round(avg(rh_min_mean_pct), 1),
                   round(avg(fire_weather_index), 1), round(sum(rain_mm) / count(DISTINCT prov_code), 0)
            FROM era5_monthly_fire_weather
            GROUP BY 1 ORDER BY 1
        """).fetchall()
        for yr, np_, nm, tmax, rhmin, fwi, rain in summary:
            print(
                f"[DuckDB] Weather {yr}: {np_} provs, {nm} prov-months | "
                f"Tmax={tmax}°C | RHmin={rhmin}% | FWI={fwi} | AvgRain={rain:.0f} mm",
                flush=True,
            )
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Open-Meteo ERA5 2022-2026 fire-weather into DuckDB.")
    parser.add_argument("--force", action="store_true", help="Re-fetch from Open-Meteo even if cache exists")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    args = parser.parse_args()

    rows = fetch_or_load_weather(force=args.force)
    ingest_weather_to_duckdb(rows, db_path=args.db)


if __name__ == "__main__":
    main()
