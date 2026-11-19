"""Fetch 52+ months of daily/hourly Air Quality (CAMS PM2.5, PM10, CO, NO2, AOD, Dust, US AQI) for all 77 Thai provinces
from Open-Meteo Air Quality API (CC-BY-4.0), aggregate into daily & monthly tables, and ingest into hotspot_5y.duckdb.

Usage:
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_air_quality.py
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_air_quality.py --force
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
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
from download_weather import load_province_coords  # noqa: E402
from tadih.open_meteo import trusted_ssl_context  # noqa: E402

AQ_RAW_DIR = SUBPROJECT_DIR / "data" / "raw" / "air_quality"
AQ_PROVS_DIR = AQ_RAW_DIR / "provs"
OPEN_METEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

START_DATE = "2022-08-01"
END_DATE = "2026-11-19"
HOURLY_VARS = [
    "pm2_5",
    "pm10",
    "carbon_monoxide",
    "nitrogen_dioxide",
    "aerosol_optical_depth",
    "dust",
    "us_aqi",
]


def _percentile_90(vals: list[float]) -> float | None:
    if not vals:
        return None
    s = sorted(vals)
    idx = min(len(s) - 1, int(math.ceil(0.90 * len(s))) - 1)
    return round(float(s[max(0, idx)]), 2)


def aggregate_aq_province_daily(prov_code: str, hourly: dict) -> list[dict]:
    """Aggregate Open-Meteo hourly air quality arrays into daily province rows (preserving NULLs)."""
    times = hourly.get("time") or []
    pm25_a = hourly.get("pm2_5") or []
    pm10_a = hourly.get("pm10") or []
    co_a = hourly.get("carbon_monoxide") or []
    no2_a = hourly.get("nitrogen_dioxide") or []
    aod_a = hourly.get("aerosol_optical_depth") or []
    dust_a = hourly.get("dust") or []
    aqi_a = hourly.get("us_aqi") or []

    buckets: dict[str, list[int]] = {}
    for i, ts in enumerate(times):
        dt_str = str(ts)[:10]
        buckets.setdefault(dt_str, []).append(i)

    def _valid(arr: list, idxs: list[int]) -> list[float]:
        out: list[float] = []
        n = len(arr)
        for idx in idxs:
            if idx < n and arr[idx] is not None:
                out.append(float(arr[idx]))
        return out

    daily_rows: list[dict] = []
    for dt_str in sorted(buckets.keys()):
        idxs = buckets[dt_str]
        pm25 = _valid(pm25_a, idxs)
        pm10 = _valid(pm10_a, idxs)
        co = _valid(co_a, idxs)
        no2 = _valid(no2_a, idxs)
        aod = _valid(aod_a, idxs)
        dust = _valid(dust_a, idxs)
        aqi = _valid(aqi_a, idxs)

        if not (pm25 or pm10 or co or no2 or aod or dust or aqi):
            continue

        yr = int(dt_str[:4])
        mo = int(dt_str[5:7])
        daily_rows.append({
            "prov_code": str(prov_code).zfill(2),
            "date": dt_str,
            "year_th": yr,
            "month_th": mo,
            "ym": f"{yr:04d}-{mo:02d}",
            "pm25_mean": round(sum(pm25) / len(pm25), 2) if pm25 else None,
            "pm25_max": round(max(pm25), 2) if pm25 else None,
            "pm10_mean": round(sum(pm10) / len(pm10), 2) if pm10 else None,
            "co_mean": round(sum(co) / len(co), 1) if co else None,
            "no2_mean": round(sum(no2) / len(no2), 2) if no2 else None,
            "aod_mean": round(sum(aod) / len(aod), 3) if aod else None,
            "dust_mean": round(sum(dust) / len(dust), 2) if dust else None,
            "us_aqi_max": int(round(max(aqi))) if aqi else None,
            "hours_gt_37_5": sum(1 for v in pm25 if v > 37.5) if pm25 else None,
            "hours_gt_75": sum(1 for v in pm25 if v > 75.0) if pm25 else None,
        })
    return daily_rows


def aggregate_aq_monthly(daily_rows: list[dict]) -> list[dict]:
    """Roll up daily air quality rows into monthly province summaries."""
    buckets: dict[tuple[str, int, int, str], list[dict]] = {}
    for r in daily_rows:
        key = (r["prov_code"], int(r["year_th"]), int(r["month_th"]), r["ym"])
        buckets.setdefault(key, []).append(r)

    monthly_rows: list[dict] = []
    for (pcode, yr, mo, ym) in sorted(buckets.keys()):
        items = buckets[(pcode, yr, mo, ym)]

        def _vals(field: str) -> list[float]:
            return [float(x[field]) for x in items if x.get(field) is not None]

        pm25_m = _vals("pm25_mean")
        pm25_x = _vals("pm25_max")
        pm10_m = _vals("pm10_mean")
        co_m = _vals("co_mean")
        no2_m = _vals("no2_mean")
        aod_m = _vals("aod_mean")
        dust_m = _vals("dust_mean")
        aqi_x = _vals("us_aqi_max")

        monthly_rows.append({
            "prov_code": pcode,
            "year_th": yr,
            "month_th": mo,
            "ym": ym,
            "days_count": len(items),
            "pm25_mean": round(sum(pm25_m) / len(pm25_m), 2) if pm25_m else None,
            "pm25_p90": _percentile_90(pm25_m),
            "pm25_max": round(max(pm25_x), 2) if pm25_x else None,
            "pm10_mean": round(sum(pm10_m) / len(pm10_m), 2) if pm10_m else None,
            "co_mean": round(sum(co_m) / len(co_m), 1) if co_m else None,
            "no2_mean": round(sum(no2_m) / len(no2_m), 2) if no2_m else None,
            "aod_mean": round(sum(aod_m) / len(aod_m), 3) if aod_m else None,
            "dust_mean": round(sum(dust_m) / len(dust_m), 2) if dust_m else None,
            "us_aqi_max": int(round(max(aqi_x))) if aqi_x else None,
            "days_exceed_37_5": sum(1 for v in pm25_m if v > 37.5) if pm25_m else None,
            "days_exceed_15_who": sum(1 for v in pm25_m if v > 15.0) if pm25_m else None,
        })
    return monthly_rows


def fetch_aq_batch(batch: list[dict], start_date: str, end_date: str) -> tuple[list[dict], int]:
    params = urlencode({
        "latitude": ",".join(f"{p['lat']:.4f}" for p in batch),
        "longitude": ",".join(f"{p['lon']:.4f}" for p in batch),
        "hourly": ",".join(HOURLY_VARS),
        "start_date": start_date,
        "end_date": end_date,
        "timezone": "Asia/Bangkok",
    })
    url = f"{OPEN_METEO_AQ_URL}?{params}"
    ctx = trusted_ssl_context()
    waits = (35, 65, 65, 90)
    for attempt, wait in enumerate(waits):
        try:
            req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/3.0"})
            with urlopen(req, timeout=90, context=ctx) as resp:
                raw_bytes = resp.read()
                data = json.loads(raw_bytes.decode("utf-8"))
                return (data if isinstance(data, list) else [data]), len(raw_bytes)
        except HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            if e.code == 429:
                if "hourly" in body.lower() and "limit" in body.lower():
                    raise RuntimeError(f"Open-Meteo AQ hourly quota exceeded: {body}") from e
                if attempt < len(waits) - 1:
                    print(f"[AQ] 429 rate limit, sleeping {wait}s before retry ...", flush=True)
                    time.sleep(wait)
                    continue
            raise RuntimeError(f"Open-Meteo AQ HTTP {e.code}: {body}") from e
        except (URLError, TimeoutError) as e:
            if attempt < len(waits) - 1:
                print(f"[AQ] network/timeout ({e}), sleeping 15s before retry ...", flush=True)
                time.sleep(15)
                continue
            raise
    raise RuntimeError("Failed to fetch Open-Meteo AQ batch after retries")


def fetch_or_load_air_quality(*, force: bool = False) -> tuple[list[dict], list[dict]]:
    AQ_PROVS_DIR.mkdir(parents=True, exist_ok=True)
    provs = load_province_coords()
    pending = []
    for p in provs:
        cf = AQ_PROVS_DIR / f"{p['prov_code']}.json"
        if force or not cf.exists() or cf.stat().st_size < 100:
            pending.append(p)

    batch_size = 3
    for i in range(0, len(pending), batch_size):
        batch = pending[i:i + batch_size]
        print(
            f"[AQ] Fetching Open-Meteo CAMS batch {i // batch_size + 1}/{(len(pending) + batch_size - 1) // batch_size} "
            f"({batch[0]['prov_code']}..{batch[-1]['prov_code']}) ...",
            flush=True,
        )
        results, raw_bytes = fetch_aq_batch(batch, START_DATE, END_DATE)
        if len(results) != len(batch):
            raise RuntimeError(f"Expected {len(batch)} AQ results, got {len(results)}")
        per_prov_raw = raw_bytes // len(batch)
        for prov, res in zip(batch, results):
            daily_rows = aggregate_aq_province_daily(prov["prov_code"], res.get("hourly") or {})
            payload = {"prov_code": prov["prov_code"], "raw_http_bytes": per_prov_raw, "daily": daily_rows}
            (AQ_PROVS_DIR / f"{prov['prov_code']}.json").write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )
        if i + batch_size < len(pending):
            time.sleep(10.0)

    all_daily: list[dict] = []
    total_raw_bytes = 0
    for p in provs:
        cf = AQ_PROVS_DIR / f"{p['prov_code']}.json"
        obj = json.loads(cf.read_text(encoding="utf-8"))
        total_raw_bytes += int(obj.get("raw_http_bytes") or 0)
        all_daily.extend(obj.get("daily") or [])

    all_monthly = aggregate_aq_monthly(all_daily)
    (AQ_RAW_DIR / "raw_stats.json").write_text(
        json.dumps({"total_raw_http_bytes": total_raw_bytes, "daily_rows": len(all_daily), "monthly_rows": len(all_monthly)}, indent=2),
        encoding="utf-8",
    )
    print(f"[AQ] Loaded {len(all_daily):,} daily rows & {len(all_monthly):,} monthly rows (raw HTTP JSON ~{total_raw_bytes / 1048576:.1f} MB)", flush=True)
    return all_daily, all_monthly


def _sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def ingest_air_quality_to_duckdb(
    daily_rows: list[dict],
    monthly_rows: list[dict],
    db_path: Path = DEFAULT_DB_PATH,
) -> None:
    con = duckdb.connect(str(db_path))
    try:
        con.execute("DROP TABLE IF EXISTS air_quality_daily_77prov")
        con.execute("DROP TABLE IF EXISTS air_quality_monthly_77prov")
        with tempfile.TemporaryDirectory() as tmp:
            d_ndj = Path(tmp) / "aq_daily.ndjson"
            m_ndj = Path(tmp) / "aq_monthly.ndjson"
            with d_ndj.open("w", encoding="utf-8") as f:
                for r in daily_rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            with m_ndj.open("w", encoding="utf-8") as f:
                for r in monthly_rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")

            con.execute(f"""
                CREATE TABLE air_quality_daily_77prov AS
                SELECT CAST(prov_code AS VARCHAR) AS prov_code,
                       CAST(date AS DATE) AS date,
                       CAST(year_th AS INTEGER) AS year_th,
                       CAST(month_th AS INTEGER) AS month_th,
                       CAST(ym AS VARCHAR) AS ym,
                       CAST(pm25_mean AS DOUBLE) AS pm25_mean,
                       CAST(pm25_max AS DOUBLE) AS pm25_max,
                       CAST(pm10_mean AS DOUBLE) AS pm10_mean,
                       CAST(co_mean AS DOUBLE) AS co_mean,
                       CAST(no2_mean AS DOUBLE) AS no2_mean,
                       CAST(aod_mean AS DOUBLE) AS aod_mean,
                       CAST(dust_mean AS DOUBLE) AS dust_mean,
                       CAST(us_aqi_max AS INTEGER) AS us_aqi_max,
                       CAST(hours_gt_37_5 AS INTEGER) AS hours_gt_37_5,
                       CAST(hours_gt_75 AS INTEGER) AS hours_gt_75
                FROM read_json(
                    {_sql_path(d_ndj)},
                    format = 'newline_delimited',
                    columns = {{
                        'prov_code': 'VARCHAR', 'date': 'VARCHAR', 'year_th': 'INTEGER', 'month_th': 'INTEGER',
                        'ym': 'VARCHAR', 'pm25_mean': 'DOUBLE', 'pm25_max': 'DOUBLE', 'pm10_mean': 'DOUBLE',
                        'co_mean': 'DOUBLE', 'no2_mean': 'DOUBLE', 'aod_mean': 'DOUBLE', 'dust_mean': 'DOUBLE',
                        'us_aqi_max': 'INTEGER', 'hours_gt_37_5': 'INTEGER', 'hours_gt_75': 'INTEGER'
                    }}
                )
            """)
            con.execute(f"""
                CREATE TABLE air_quality_monthly_77prov AS
                SELECT CAST(prov_code AS VARCHAR) AS prov_code,
                       CAST(year_th AS INTEGER) AS year_th,
                       CAST(month_th AS INTEGER) AS month_th,
                       CAST(ym AS VARCHAR) AS ym,
                       CAST(days_count AS INTEGER) AS days_count,
                       CAST(pm25_mean AS DOUBLE) AS pm25_mean,
                       CAST(pm25_p90 AS DOUBLE) AS pm25_p90,
                       CAST(pm25_max AS DOUBLE) AS pm25_max,
                       CAST(pm10_mean AS DOUBLE) AS pm10_mean,
                       CAST(co_mean AS DOUBLE) AS co_mean,
                       CAST(no2_mean AS DOUBLE) AS no2_mean,
                       CAST(aod_mean AS DOUBLE) AS aod_mean,
                       CAST(dust_mean AS DOUBLE) AS dust_mean,
                       CAST(us_aqi_max AS INTEGER) AS us_aqi_max,
                       CAST(days_exceed_37_5 AS INTEGER) AS days_exceed_37_5,
                       CAST(days_exceed_15_who AS INTEGER) AS days_exceed_15_who
                FROM read_json(
                    {_sql_path(m_ndj)},
                    format = 'newline_delimited',
                    columns = {{
                        'prov_code': 'VARCHAR', 'year_th': 'INTEGER', 'month_th': 'INTEGER', 'ym': 'VARCHAR',
                        'days_count': 'INTEGER', 'pm25_mean': 'DOUBLE', 'pm25_p90': 'DOUBLE', 'pm25_max': 'DOUBLE',
                        'pm10_mean': 'DOUBLE', 'co_mean': 'DOUBLE', 'no2_mean': 'DOUBLE', 'aod_mean': 'DOUBLE',
                        'dust_mean': 'DOUBLE', 'us_aqi_max': 'INTEGER', 'days_exceed_37_5': 'INTEGER',
                        'days_exceed_15_who': 'INTEGER'
                    }}
                )
            """)
        for yr, cnt, pm, exc in con.execute("""
            SELECT year_th, count(*), round(avg(pm25_mean), 1), sum(days_exceed_37_5)
            FROM air_quality_monthly_77prov
            GROUP BY 1 ORDER BY 1
        """).fetchall():
            print(f"[DuckDB] AQ {yr}: {cnt} prov-months | PM2.5={pm} ug/m3 | Exceed(>37.5)={exc:,} prov-days", flush=True)
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Open-Meteo CAMS Air Quality 2022-2026 for 77 provinces.")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if checkpoint exists")
    parser.add_argument("--fetch-only", action="store_true", help="Fetch and checkpoint raw files without opening DuckDB")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    args = parser.parse_args()

    daily_rows, monthly_rows = fetch_or_load_air_quality(force=args.force)
    if not args.fetch_only:
        ingest_air_quality_to_duckdb(daily_rows, monthly_rows, db_path=args.db)


if __name__ == "__main__":
    main()
