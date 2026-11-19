"""Fetch 5-year daily Soil Wetness, Solar Radiation, Dewpoint & Wind from NASA POWER (Public Domain)
for all 77 Thai province centroids (2022-01-01..2026-11-15) and ingest daily + monthly tables into hotspot_5y.duckdb.

Usage:
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_nasa_power.py
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_nasa_power.py --force
"""

from __future__ import annotations

import argparse
import json
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

NASA_RAW_DIR = SUBPROJECT_DIR / "data" / "raw" / "nasa_power"
NASA_PROVS_DIR = NASA_RAW_DIR / "provs"
NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
START_DATE = "20220101"
END_DATE = "20261115"
PARAMETERS = "GWETTOP,GWETROOT,ALLSKY_SFC_SW_DWN,T2MDEW,WS10M"


def clean_nasa_value(val: float | int | None) -> float | None:
    """Convert NASA POWER missing sentinels (e.g. -999.0) into None/NULL."""
    if val is None:
        return None
    f = float(val)
    if f <= -900.0:
        return None
    return f


def parse_nasa_power_province(prov_code: str, payload: dict) -> list[dict]:
    """Parse NASA POWER point JSON response into clean daily rows with NULL sentinels converted."""
    pnode = (payload.get("properties") or {}).get("parameter") or {}
    gwettop_d = pnode.get("GWETTOP") or {}
    gwetroot_d = pnode.get("GWETROOT") or {}
    solar_d = pnode.get("ALLSKY_SFC_SW_DWN") or {}
    dew_d = pnode.get("T2MDEW") or {}
    ws_d = pnode.get("WS10M") or {}

    dates = sorted(set(gwettop_d.keys()) | set(gwetroot_d.keys()) | set(solar_d.keys()) | set(dew_d.keys()) | set(ws_d.keys()))
    rows: list[dict] = []
    for dt_raw in dates:
        if len(dt_raw) != 8 or not dt_raw.isdigit():
            continue
        dt_iso = f"{dt_raw[:4]}-{dt_raw[4:6]}-{dt_raw[6:8]}"
        yr = int(dt_raw[:4])
        mo = int(dt_raw[4:6])
        gt = clean_nasa_value(gwettop_d.get(dt_raw))
        gr = clean_nasa_value(gwetroot_d.get(dt_raw))
        sol = clean_nasa_value(solar_d.get(dt_raw))
        dew = clean_nasa_value(dew_d.get(dt_raw))
        ws = clean_nasa_value(ws_d.get(dt_raw))
        rows.append({
            "prov_code": str(prov_code).zfill(2),
            "date": dt_iso,
            "year_th": yr,
            "month_th": mo,
            "ym": f"{yr:04d}-{mo:02d}",
            "gwettop": round(gt, 3) if gt is not None else None,
            "gwetroot": round(gr, 3) if gr is not None else None,
            "solar_mj": round(sol, 2) if sol is not None else None,
            "dewpoint_c": round(dew, 2) if dew is not None else None,
            "ws10m_ms": round(ws, 2) if ws is not None else None,
        })
    return rows


def aggregate_nasa_monthly(daily_rows: list[dict]) -> list[dict]:
    """Aggregate NASA POWER daily soil/solar rows into monthly province rows."""
    buckets: dict[tuple[str, int, int, str], list[dict]] = {}
    for r in daily_rows:
        key = (r["prov_code"], int(r["year_th"]), int(r["month_th"]), r["ym"])
        buckets.setdefault(key, []).append(r)

    monthly: list[dict] = []
    for (pcode, yr, mo, ym) in sorted(buckets.keys()):
        items = buckets[(pcode, yr, mo, ym)]

        def _vals(field: str) -> list[float]:
            return [float(x[field]) for x in items if x.get(field) is not None]

        gt = _vals("gwettop")
        gr = _vals("gwetroot")
        sol = _vals("solar_mj")
        dew = _vals("dewpoint_c")
        monthly.append({
            "prov_code": pcode,
            "year_th": yr,
            "month_th": mo,
            "ym": ym,
            "days_count": len(items),
            "gwettop_mean": round(sum(gt) / len(gt), 3) if gt else None,
            "gwettop_min": round(min(gt), 3) if gt else None,
            "gwetroot_mean": round(sum(gr) / len(gr), 3) if gr else None,
            "gwetroot_min": round(min(gr), 3) if gr else None,
            "solar_mj_mean": round(sum(sol) / len(sol), 2) if sol else None,
            "dewpoint_c_mean": round(sum(dew) / len(dew), 2) if dew else None,
            "dry_soil_days_lt_035": sum(1 for v in gt if v < 0.35) if gt else None,
        })
    return monthly


def fetch_nasa_province(prov: dict) -> dict:
    params = urlencode({
        "parameters": PARAMETERS,
        "community": "AG",
        "longitude": f"{prov['lon']:.4f}",
        "latitude": f"{prov['lat']:.4f}",
        "start": START_DATE,
        "end": END_DATE,
        "format": "JSON",
    })
    url = f"{NASA_POWER_URL}?{params}"
    ctx = trusted_ssl_context()
    waits = (5, 15, 30)
    for attempt, wait in enumerate(waits):
        try:
            req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/3.0"})
            with urlopen(req, timeout=45, context=ctx) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as e:
            if attempt < len(waits) - 1:
                print(f"[NASA] {prov['prov_code']} retry in {wait}s ({e}) ...", flush=True)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"Failed NASA POWER for {prov['prov_code']}")


def fetch_or_load_nasa_power(*, force: bool = False) -> tuple[list[dict], list[dict]]:
    NASA_PROVS_DIR.mkdir(parents=True, exist_ok=True)
    provs = load_province_coords()
    pending = [
        p for p in provs
        if force or not (NASA_PROVS_DIR / f"{p['prov_code']}.json").exists()
        or (NASA_PROVS_DIR / f"{p['prov_code']}.json").stat().st_size < 100
    ]

    for idx, prov in enumerate(pending, start=1):
        if idx == 1 or idx % 15 == 0 or idx == len(pending):
            print(f"[NASA] Fetching {idx}/{len(pending)} ({prov['prov_code']} {prov['name_en']}) ...", flush=True)
        payload = fetch_nasa_province(prov)
        rows = parse_nasa_power_province(prov["prov_code"], payload)
        (NASA_PROVS_DIR / f"{prov['prov_code']}.json").write_text(
            json.dumps(rows, ensure_ascii=False), encoding="utf-8"
        )
        time.sleep(0.35)

    all_daily: list[dict] = []
    for p in provs:
        all_daily.extend(json.loads((NASA_PROVS_DIR / f"{p['prov_code']}.json").read_text(encoding="utf-8")))
    all_monthly = aggregate_nasa_monthly(all_daily)
    print(f"[NASA] Loaded {len(all_daily):,} daily rows & {len(all_monthly):,} monthly rows", flush=True)
    return all_daily, all_monthly


def _sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def ingest_nasa_to_duckdb(
    daily_rows: list[dict],
    monthly_rows: list[dict],
    db_path: Path = DEFAULT_DB_PATH,
) -> None:
    con = duckdb.connect(str(db_path))
    try:
        con.execute("DROP TABLE IF EXISTS nasa_power_soil_daily")
        con.execute("DROP TABLE IF EXISTS nasa_power_soil_monthly")
        with tempfile.TemporaryDirectory() as tmp:
            d_ndj = Path(tmp) / "nasa_daily.ndjson"
            m_ndj = Path(tmp) / "nasa_monthly.ndjson"
            with d_ndj.open("w", encoding="utf-8") as f:
                for r in daily_rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            with m_ndj.open("w", encoding="utf-8") as f:
                for r in monthly_rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")

            con.execute(f"""
                CREATE TABLE nasa_power_soil_daily AS
                SELECT CAST(prov_code AS VARCHAR) AS prov_code,
                       CAST(date AS DATE) AS date,
                       CAST(year_th AS INTEGER) AS year_th,
                       CAST(month_th AS INTEGER) AS month_th,
                       CAST(ym AS VARCHAR) AS ym,
                       CAST(gwettop AS DOUBLE) AS gwettop,
                       CAST(gwetroot AS DOUBLE) AS gwetroot,
                       CAST(solar_mj AS DOUBLE) AS solar_mj,
                       CAST(dewpoint_c AS DOUBLE) AS dewpoint_c,
                       CAST(ws10m_ms AS DOUBLE) AS ws10m_ms
                FROM read_json(
                    {_sql_path(d_ndj)},
                    format = 'newline_delimited',
                    columns = {{
                        'prov_code': 'VARCHAR', 'date': 'VARCHAR', 'year_th': 'INTEGER', 'month_th': 'INTEGER',
                        'ym': 'VARCHAR', 'gwettop': 'DOUBLE', 'gwetroot': 'DOUBLE', 'solar_mj': 'DOUBLE',
                        'dewpoint_c': 'DOUBLE', 'ws10m_ms': 'DOUBLE'
                    }}
                )
            """)
            con.execute(f"""
                CREATE TABLE nasa_power_soil_monthly AS
                SELECT CAST(prov_code AS VARCHAR) AS prov_code,
                       CAST(year_th AS INTEGER) AS year_th,
                       CAST(month_th AS INTEGER) AS month_th,
                       CAST(ym AS VARCHAR) AS ym,
                       CAST(days_count AS INTEGER) AS days_count,
                       CAST(gwettop_mean AS DOUBLE) AS gwettop_mean,
                       CAST(gwettop_min AS DOUBLE) AS gwettop_min,
                       CAST(gwetroot_mean AS DOUBLE) AS gwetroot_mean,
                       CAST(gwetroot_min AS DOUBLE) AS gwetroot_min,
                       CAST(solar_mj_mean AS DOUBLE) AS solar_mj_mean,
                       CAST(dewpoint_c_mean AS DOUBLE) AS dewpoint_c_mean,
                       CAST(dry_soil_days_lt_035 AS INTEGER) AS dry_soil_days_lt_035
                FROM read_json(
                    {_sql_path(m_ndj)},
                    format = 'newline_delimited',
                    columns = {{
                        'prov_code': 'VARCHAR', 'year_th': 'INTEGER', 'month_th': 'INTEGER', 'ym': 'VARCHAR',
                        'days_count': 'INTEGER', 'gwettop_mean': 'DOUBLE', 'gwettop_min': 'DOUBLE',
                        'gwetroot_mean': 'DOUBLE', 'gwetroot_min': 'DOUBLE', 'solar_mj_mean': 'DOUBLE',
                        'dewpoint_c_mean': 'DOUBLE', 'dry_soil_days_lt_035': 'INTEGER'
                    }}
                )
            """)
        for yr, cnt, gt, dry in con.execute("""
            SELECT year_th, count(*), round(avg(gwettop_mean), 3), sum(dry_soil_days_lt_035)
            FROM nasa_power_soil_monthly
            GROUP BY 1 ORDER BY 1
        """).fetchall():
            print(f"[DuckDB] NASA POWER {yr}: {cnt} prov-months | GWETTOP={gt} | DrySoilDays(<0.35)={dry:,}", flush=True)
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Download NASA POWER soil wetness & solar radiation for 77 provinces.")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if checkpoint exists")
    parser.add_argument("--fetch-only", action="store_true", help="Fetch and checkpoint raw files without opening DuckDB")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    args = parser.parse_args()

    daily_rows, monthly_rows = fetch_or_load_nasa_power(force=args.force)
    if not args.fetch_only:
        ingest_nasa_to_duckdb(daily_rows, monthly_rows, db_path=args.db)


if __name__ == "__main__":
    main()
