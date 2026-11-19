"""Ingest approved DOAE crop production (2566-2567), RID 461 medium reservoirs monthly history (2022-2026),
OAE monthly crop prices, and GISTDA live PM2.5 77-province snapshot into hotspot_5y.duckdb.

Usage:
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\ingest_agri_water.py
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\ingest_agri_water.py --force-rid
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import ssl
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SUBPROJECT_DIR.parent
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from config import DEFAULT_DB_PATH  # noqa: E402

DOAE_2566_SHORT = (
    REPO_ROOT / "data" / "local" / "production" / "doae_production_2023"
    / "a505aa24d0706a162a1d56265cc61fb6ce33df8c9760dab414bf0ad01762e445.csv"
)
# Note: DOAE archive resource a130f9e0 actually contains short-cycle 2567 rows (2023-2024).
DOAE_2567_SHORT = (
    REPO_ROOT / "data" / "local" / "doae-archives" / "extracted"
    / "a130f9e0-0795-4ac8-8daf-008c686c484d"
    / "ee6a82b64eab9e4a4ad35ce7b2efb1f19feabd03de9180813a40cc467b4aed51.csv"
)
TADIH_DB_PATH = REPO_ROOT / "data" / "local" / "tadih.duckdb"
RID_RAW_DIR = SUBPROJECT_DIR / "data" / "raw" / "rid_monthly"
GISTDA_PM25_SNAPSHOT_JSON = SUBPROJECT_DIR / "data" / "raw" / "gistda_pm25_latest.json"

RID_BASE_URL = "https://app.rid.go.th/reservoir/api/reservoir/public"
GISTDA_PM25_PROV_URL = "https://pm25.gistda.or.th/rest/getPm25byProvince"


def _sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def parse_thai_num(val: object) -> float | None:
    """Safely parse DOAE numeric strings (' 1,234.50 ', '-', None) into float or None."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(",", "")
    if not s or s in ("-", "--", "N/A", "null", "NULL"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def classify_fire_crop_group(crop_name: str | None) -> str:
    name = (crop_name or "").strip()
    if not name:
        return "other"
    if name.startswith("ข้าวโพด") or "ข้าวโพด" in name:
        return "corn"
    if name.startswith("อ้อย") or "อ้อย" in name:
        return "sugarcane"
    if "มันสำปะหลัง" in name:
        return "cassava"
    if name.startswith("ข้าว") and "ข้าวฟ่าง" not in name:
        return "paddy"
    return "other"


def ingest_doae_crops(
    con: duckdb.DuckDBPyConnection,
    *,
    doae_2566_csv: Path = DOAE_2566_SHORT,
    doae_2567_csv: Path = DOAE_2567_SHORT,
) -> tuple[int, int]:
    """Ingest approved DOAE subdistrict crop tables (2566-2567) via vectorized DuckDB SQL."""
    crop_group_sql = lambda col: f"""
        CASE
            WHEN trim({col}) LIKE '%ข้าวโพด%' THEN 'corn'
            WHEN trim({col}) LIKE '%อ้อย%' THEN 'sugarcane'
            WHEN trim({col}) LIKE '%มันสำปะหลัง%' THEN 'cassava'
            WHEN trim({col}) LIKE 'ข้าว%' AND trim({col}) NOT LIKE '%ข้าวฟ่าง%' THEN 'paddy'
            ELSE 'other'
        END
    """
    num_sql = lambda col: f"TRY_CAST(nullif(replace(trim(CAST({col} AS VARCHAR)), ',', ''), '-') AS DOUBLE)"

    parts: list[str] = []
    if doae_2566_csv.exists():
        parts.append(f"""
            SELECT 2566 AS source_year_be,
                   CAST(r."ปี" AS INTEGER) AS db_year,
                   CAST(r."เดือน" AS INTEGER) AS report_month,
                   CAST(r."รอบการปลูก" AS VARCHAR) AS planting_round,
                   p.prov_code AS prov_code,
                   trim(r."จังหวัด") AS prov_name_th,
                   trim(r."อำเภอ") AS amphoe_name_th,
                   trim(r."ตำบล") AS tambon_name_th,
                   trim(r."ชนิดพืช") AS crop_name,
                   trim(r."พันธุ์พืช") AS variety_name,
                   {crop_group_sql('r."ชนิดพืช"')} AS crop_group,
                   {num_sql('r."เนื้อที่ปลูก (ไร่)"')} AS planted_rai,
                   {num_sql('r."เนื้อที่เก็บเกี่ยวผลผลิต(ไร่)"')} AS harvested_rai,
                   {num_sql('r."ผลผลิตที่เก็บเกี่ยวได้ (กิโลกรัม)"')} AS production_kg
            FROM read_csv_auto({_sql_path(doae_2566_csv)}, ignore_errors=true) r
            LEFT JOIN dim_province p ON trim(p.prov_name_th) = trim(r."จังหวัด")
        """)

    if doae_2567_csv.exists():
        parts.append(f"""
            SELECT 2567 AS source_year_be,
                   CAST(r.db_year AS INTEGER) AS db_year,
                   CAST(r.db_month AS INTEGER) AS report_month,
                   CAST(NULL AS VARCHAR) AS planting_round,
                   coalesce(p_code.prov_code, p_name.prov_code) AS prov_code,
                   trim(r.pro_name) AS prov_name_th,
                   trim(r.amp_name) AS amphoe_name_th,
                   trim(r.tam_name) AS tambon_name_th,
                   trim(r.prod_name) AS crop_name,
                   trim(r.breed_name) AS variety_name,
                   {crop_group_sql('r.prod_name')} AS crop_group,
                   {num_sql('r.area_plant')} AS planted_rai,
                   {num_sql('r.area_harvest')} AS harvested_rai,
                   {num_sql('r.product_harvest')} AS production_kg
            FROM read_csv_auto({_sql_path(doae_2567_csv)}, ignore_errors=true) r
            LEFT JOIN dim_province p_code ON p_code.prov_code = lpad(CAST(r.pro_id AS VARCHAR), 2, '0')
            LEFT JOIN dim_province p_name ON trim(p_name.prov_name_th) = trim(r.pro_name)
        """)

    con.execute("DROP TABLE IF EXISTS doae_crop_tambon")
    if parts:
        con.execute("CREATE TABLE doae_crop_tambon AS\n" + "\nUNION ALL\n".join(parts))
    else:
        con.execute("""
            CREATE TABLE doae_crop_tambon (
                source_year_be INTEGER, db_year INTEGER, report_month INTEGER, planting_round VARCHAR,
                prov_code VARCHAR, prov_name_th VARCHAR, amphoe_name_th VARCHAR, tambon_name_th VARCHAR,
                crop_name VARCHAR, variety_name VARCHAR, crop_group VARCHAR,
                planted_rai DOUBLE, harvested_rai DOUBLE, production_kg DOUBLE
            )
        """)

    # Province-level fire-crop summary strictly from 2566 unique tambon×crop×variety rows
    # (avoids cross-month/round stock-vs-flow double-counting per docs/doae-production-semantics.md).
    con.execute("DROP TABLE IF EXISTS doae_fire_crops_province")
    con.execute("""
        CREATE TABLE doae_fire_crops_province AS
        SELECT p.prov_code,
               p.prov_name_th,
               2566 AS source_year_be,
               round(sum(d.planted_rai) FILTER (WHERE d.crop_group = 'paddy'), 1) AS paddy_rai,
               round(sum(d.planted_rai) FILTER (WHERE d.crop_group = 'sugarcane'), 1) AS sugarcane_rai,
               round(sum(d.planted_rai) FILTER (WHERE d.crop_group = 'corn'), 1) AS corn_rai,
               round(sum(d.planted_rai) FILTER (WHERE d.crop_group = 'cassava'), 1) AS cassava_rai,
               round(sum(d.planted_rai), 1) AS all_short_rai
        FROM dim_province p
        LEFT JOIN doae_crop_tambon d
          ON d.prov_code = p.prov_code AND d.source_year_be = 2566
        GROUP BY p.prov_code, p.prov_name_th
        ORDER BY p.prov_code
    """)
    tot_rows = int(con.execute("SELECT count(*) FROM doae_crop_tambon").fetchone()[0])
    prov_rows = int(con.execute("SELECT count(*) FROM doae_fire_crops_province").fetchone()[0])
    print(f"[DuckDB] DOAE: {tot_rows:,} tambon rows, {prov_rows} province baseline rows (2566)", flush=True)
    return tot_rows, prov_rows


def _rid_month_dates() -> list[str]:
    dates: list[str] = []
    for yr in range(2022, 2027):
        max_m = 11 if yr == 2026 else 12
        for mo in range(1, max_m + 1):
            dates.append(f"{yr:04d}-{mo:02d}-01")
    return dates


def fetch_and_ingest_rid(
    con: duckdb.DuckDBPyConnection,
    *,
    raw_dir: Path = RID_RAW_DIR,
    force: bool = False,
) -> int:
    raw_dir.mkdir(parents=True, exist_ok=True)
    ctx = ssl.create_default_context()
    dates = _rid_month_dates()

    for dt_s in dates:
        cf = raw_dir / f"{dt_s}.json"
        if not force and cf.exists() and cf.stat().st_size > 1000:
            continue
        url = f"{RID_BASE_URL}/{dt_s}"
        try:
            req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/3.0"})
            with urlopen(req, timeout=30, context=ctx) as resp:
                cf.write_bytes(resp.read())
            time.sleep(0.25)
        except (HTTPError, URLError, TimeoutError) as e:
            print(f"[RID] warn {dt_s}: {e}", flush=True)

    # Also grab latest snapshot
    latest_cf = raw_dir / "latest.json"
    try:
        req = Request(RID_BASE_URL, headers={"User-Agent": "TADIH-Hotspot5Y/3.0"})
        with urlopen(req, timeout=30, context=ctx) as resp:
            latest_cf.write_bytes(resp.read())
    except Exception as e:
        print(f"[RID] warn latest: {e}", flush=True)

    con.execute("DROP TABLE IF EXISTS rid_reservoirs_monthly")
    con.execute("""
        CREATE TABLE rid_reservoirs_monthly (
            snapshot_date DATE,
            year_th INTEGER,
            month_th INTEGER,
            ym VARCHAR,
            region VARCHAR,
            reservoir_id VARCHAR,
            reservoir_name VARCHAR,
            storage_mcm DOUBLE,
            dead_storage_mcm DOUBLE,
            volume_mcm DOUBLE,
            percent_storage DOUBLE,
            inflow DOUBLE,
            outflow DOUBLE
        )
    """)

    rows: list[tuple] = []
    seen_keys: set[tuple[str, str]] = set()
    files = [raw_dir / f"{dt}.json" for dt in dates]
    if latest_cf.exists():
        files.append(latest_cf)

    for fp in files:
        if not fp.exists() or fp.stat().st_size < 100:
            continue
        obj = json.loads(fp.read_text(encoding="utf-8", errors="replace"))
        snap_date = str(obj.get("date") or fp.stem)[:10]
        if len(snap_date) != 10 or not snap_date[:4].isdigit():
            continue
        yr = int(snap_date[:4])
        mo = int(snap_date[5:7])
        ym = f"{yr:04d}-{mo:02d}"
        for grp in obj.get("data") or []:
            region = str(grp.get("region") or "").strip()
            for rsv in grp.get("reservoir") or []:
                rid = str(rsv.get("id") or "")
                key = (snap_date, rid)
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                rows.append((
                    snap_date,
                    yr,
                    mo,
                    ym,
                    region,
                    rid,
                    str(rsv.get("name") or "").strip(),
                    parse_thai_num(rsv.get("storage")),
                    parse_thai_num(rsv.get("dead_storage")),
                    parse_thai_num(rsv.get("volume")),
                    parse_thai_num(rsv.get("percent_storage")),
                    parse_thai_num(rsv.get("inflow")),
                    parse_thai_num(rsv.get("outflow")),
                ))

    if rows:
        with tempfile.TemporaryDirectory() as tmp:
            ndj = Path(tmp) / "rid.ndjson"
            with ndj.open("w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps({
                        "snapshot_date": r[0], "year_th": r[1], "month_th": r[2], "ym": r[3],
                        "region": r[4], "reservoir_id": r[5], "reservoir_name": r[6],
                        "storage_mcm": r[7], "dead_storage_mcm": r[8], "volume_mcm": r[9],
                        "percent_storage": r[10], "inflow": r[11], "outflow": r[12],
                    }, ensure_ascii=False) + "\n")
            con.execute(f"""
                INSERT INTO rid_reservoirs_monthly
                SELECT CAST(snapshot_date AS DATE), CAST(year_th AS INTEGER), CAST(month_th AS INTEGER), ym,
                       region, reservoir_id, reservoir_name,
                       CAST(storage_mcm AS DOUBLE), CAST(dead_storage_mcm AS DOUBLE), CAST(volume_mcm AS DOUBLE),
                       CAST(percent_storage AS DOUBLE), CAST(inflow AS DOUBLE), CAST(outflow AS DOUBLE)
                FROM read_json_auto({_sql_path(ndj)})
            """)
    cnt = int(con.execute("SELECT count(*) FROM rid_reservoirs_monthly").fetchone()[0])
    print(f"[DuckDB] RID reservoirs: {cnt:,} snapshot rows ({len(seen_keys):,} unique)", flush=True)
    return cnt


def ingest_oae_prices(con: duckdb.DuckDBPyConnection, *, tadih_db: Path = TADIH_DB_PATH) -> int:
    if not tadih_db.exists():
        return 0
    tcon = duckdb.connect(str(tadih_db), read_only=True)
    try:
        raw_rows = tcon.execute("""
            SELECT observed_at, commodity_id, unit, value, source_url
            FROM observations
            WHERE source_id = 'oae' AND value IS NOT NULL
        """).fetchall()
    finally:
        tcon.close()

    bkk_tz = timezone(timedelta(hours=7))
    parsed: list[tuple] = []
    for obs_at, cid, unit, val, url in raw_rows:
        dt_obj = datetime.fromisoformat(str(obs_at).replace("Z", "+00:00")).astimezone(bkk_tz)
        d_str = dt_obj.strftime("%Y-%m-%d")
        cname = str(cid or "").replace("oae:", "", 1).strip()
        parsed.append((d_str, dt_obj.year, dt_obj.month, cname, unit, float(val), url))

    con.execute("DROP TABLE IF EXISTS oae_monthly_prices")
    con.execute("""
        CREATE TABLE oae_monthly_prices (
            observed_date DATE,
            year_th INTEGER,
            month_th INTEGER,
            commodity_name VARCHAR,
            unit VARCHAR,
            price_value DOUBLE,
            source_url VARCHAR
        )
    """)
    if parsed:
        with tempfile.TemporaryDirectory() as tmp:
            ndj = Path(tmp) / "oae.ndjson"
            with ndj.open("w", encoding="utf-8") as f:
                for r in parsed:
                    f.write(json.dumps({
                        "observed_date": r[0], "year_th": r[1], "month_th": r[2],
                        "commodity_name": r[3], "unit": r[4], "price_value": r[5], "source_url": r[6],
                    }, ensure_ascii=False) + "\n")
            con.execute(f"""
                INSERT INTO oae_monthly_prices
                SELECT CAST(observed_date AS DATE), CAST(year_th AS INTEGER), CAST(month_th AS INTEGER),
                       commodity_name, unit, CAST(price_value AS DOUBLE), source_url
                FROM read_json_auto({_sql_path(ndj)})
            """)
    cnt = int(con.execute("SELECT count(*) FROM oae_monthly_prices").fetchone()[0])
    print(f"[DuckDB] OAE monthly prices: {cnt:,} rows", flush=True)
    return cnt


def fetch_gistda_pm25_snapshot(
    con: duckdb.DuckDBPyConnection,
    *,
    snapshot_json: Path = GISTDA_PM25_SNAPSHOT_JSON,
) -> int:
    ctx = ssl.create_default_context()
    payload = None
    try:
        req = Request(GISTDA_PM25_PROV_URL, headers={"User-Agent": "TADIH-Hotspot5Y/3.0"})
        with urlopen(req, timeout=25, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw)
        snapshot_json.parent.mkdir(parents=True, exist_ok=True)
        snapshot_json.write_text(raw, encoding="utf-8")
    except Exception as e:
        print(f"[GISTDA PM2.5] Live fetch failed ({e}), checking local cache...", flush=True)
        if snapshot_json.exists():
            payload = json.loads(snapshot_json.read_text(encoding="utf-8"))

    if not payload or not isinstance(payload.get("data"), list):
        return 0

    con.execute("DROP TABLE IF EXISTS gistda_pm25_snapshot")
    con.execute("""
        CREATE TABLE gistda_pm25_snapshot (
            prov_code VARCHAR,
            prov_name_th VARCHAR,
            pm25 DOUBLE,
            pm25_avg_24hr DOUBLE,
            dt_utc VARCHAR
        )
    """)
    rows = [
        (
            str(item.get("pv_idn") or "").zfill(2),
            str(item.get("pv_tn") or "").strip(),
            float(item["pm25"]) if item.get("pm25") is not None else None,
            float(item["pm25Avg24hr"]) if item.get("pm25Avg24hr") is not None else None,
            str(item.get("dt") or ""),
        )
        for item in payload["data"]
        if item.get("pv_idn") is not None
    ]
    con.executemany("INSERT INTO gistda_pm25_snapshot VALUES (?,?,?,?,?)", rows)
    print(f"[DuckDB] GISTDA PM2.5 snapshot: {len(rows)} provinces", flush=True)
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest DOAE crops, RID reservoirs, OAE prices & GISTDA PM2.5 snapshot.")
    parser.add_argument("--force-rid", action="store_true", help="Re-fetch RID reservoir snapshots")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    args = parser.parse_args()

    con = duckdb.connect(str(args.db))
    try:
        ingest_doae_crops(con)
        fetch_and_ingest_rid(con, force=args.force_rid)
        ingest_oae_prices(con)
        fetch_gistda_pm25_snapshot(con)
    finally:
        con.close()


if __name__ == "__main__":
    main()
