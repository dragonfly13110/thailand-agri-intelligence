"""Download NASA FIRMS VIIRS-SNPP annual country archives (2022-2025) for Thailand + 5 ASEAN neighbors
for transboundary haze comparison, aggregate monthly regional stats into hotspot_5y.duckdb,
and export year-partitioned ZSTD Parquet files.

Usage:
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_transboundary.py
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\download_transboundary.py --force
"""

from __future__ import annotations

import argparse
import shutil
import ssl
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parent
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from config import DEFAULT_DB_PATH  # noqa: E402

GMS_RAW_DIR = SUBPROJECT_DIR / "data" / "raw" / "firms_gms"
GMS_COUNTRIES = ("Thailand", "Myanmar", "Lao_PDR", "Cambodia", "Vietnam", "Malaysia")
GMS_YEARS = (2022, 2023, 2024, 2025)
FIRMS_URL_TPL = "https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/{year}/viirs-snpp_{year}_{country}.csv"


def _sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def download_firms_archives(
    raw_dir: Path = GMS_RAW_DIR,
    *,
    countries: tuple[str, ...] = GMS_COUNTRIES,
    years: tuple[int, ...] = GMS_YEARS,
    force: bool = False,
) -> list[Path]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    ctx = ssl.create_default_context()
    saved: list[Path] = []
    for yr in years:
        for country in countries:
            dest = raw_dir / f"viirs-snpp_{yr}_{country}.csv"
            if not force and dest.exists() and dest.stat().st_size > 10_000:
                saved.append(dest)
                continue
            url = FIRMS_URL_TPL.format(year=yr, country=country)
            part = dest.with_suffix(".csv.part")
            for attempt in range(3):
                try:
                    req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/3.0"})
                    with urlopen(req, timeout=120, context=ctx) as resp, part.open("wb") as out:
                        shutil.copyfileobj(resp, out)
                    part.replace(dest)
                    print(f"[FIRMS] Downloaded {dest.name} ({dest.stat().st_size / 1048576:.2f} MB)", flush=True)
                    saved.append(dest)
                    break
                except (HTTPError, URLError, TimeoutError) as e:
                    part.unlink(missing_ok=True)
                    if attempt == 2:
                        raise RuntimeError(f"Failed downloading {url}: {e}") from e
                    time.sleep(3.0 * (attempt + 1))
    return saved


def _read_country_csv_sql(csv_path: Path, country: str) -> str:
    country_lit = country.replace("'", "''")
    return f"""
        SELECT '{country_lit}' AS country,
               CAST(acq_date AS DATE) AS acq_date_d,
               strftime(CAST(acq_date AS DATE), '%Y-%m-%d') AS acq_date,
               lpad(CAST(acq_time AS VARCHAR), 4, '0') AS acq_time,
               CAST(year(CAST(acq_date AS DATE)) AS INTEGER) AS year_th,
               CAST(month(CAST(acq_date AS DATE)) AS INTEGER) AS month_th,
               round(CAST(latitude AS DOUBLE), 4) AS latitude,
               round(CAST(longitude AS DOUBLE), 4) AS longitude,
               round(CAST(frp AS DOUBLE), 2) AS frp_mw,
               lower(CAST(confidence AS VARCHAR)) AS confidence,
               CAST(daynight AS VARCHAR) AS daynight
        FROM read_csv(
            {_sql_path(csv_path)},
            header = true,
            delim = ',',
            types = {{
                'latitude': 'DOUBLE',
                'longitude': 'DOUBLE',
                'acq_date': 'VARCHAR',
                'acq_time': 'VARCHAR',
                'confidence': 'VARCHAR',
                'frp': 'DOUBLE',
                'daynight': 'VARCHAR'
            }}
        )
    """


def ingest_transboundary_to_duckdb(
    raw_dir: Path = GMS_RAW_DIR,
    db_path: Path = DEFAULT_DB_PATH,
    *,
    countries: tuple[str, ...] = GMS_COUNTRIES,
    years: tuple[int, ...] = GMS_YEARS,
) -> int:
    subqueries = []
    for yr in years:
        for country in countries:
            csv_path = raw_dir / f"viirs-snpp_{yr}_{country}.csv"
            if csv_path.exists() and csv_path.stat().st_size > 100:
                subqueries.append(_read_country_csv_sql(csv_path, country))
    if not subqueries:
        raise FileNotFoundError(f"No FIRMS CSV files found in {raw_dir}")

    union_sql = "\nUNION ALL\n".join(subqueries)
    con = duckdb.connect(str(db_path))
    try:
        con.execute("DROP TABLE IF EXISTS transboundary_monthly")
        con.execute(f"""
            CREATE TABLE transboundary_monthly AS
            WITH all_pts AS ({union_sql})
            SELECT country,
                   year_th,
                   month_th,
                   printf('%04d-%02d', year_th, month_th) AS ym,
                   CAST(count(*) AS INTEGER) AS hotspot_count,
                   CAST(count(*) FILTER (WHERE confidence IN ('h', 'high')) AS INTEGER) AS high_conf_count,
                   CAST(count(*) FILTER (WHERE daynight = 'D') AS INTEGER) AS day_count,
                   round(sum(coalesce(frp_mw, 0.0)), 1) AS frp_sum_mw,
                   round(avg(frp_mw), 2) AS frp_avg_mw
            FROM all_pts
            GROUP BY 1, 2, 3, 4
            ORDER BY 2, 3, 1
        """)
        rows = con.execute("""
            SELECT country, sum(hotspot_count) AS tot, round(sum(frp_sum_mw), 0) AS frp
            FROM transboundary_monthly
            GROUP BY 1 ORDER BY 2 DESC
        """).fetchall()
        for c, tot, frp in rows:
            print(f"[DuckDB] FIRMS 2022-2025 {c:10s}: {tot:>10,} spots | FRP={frp:,.0f} MW", flush=True)
        return int(con.execute("SELECT count(*) FROM transboundary_monthly").fetchone()[0])
    finally:
        con.close()


def export_transboundary_parquets(
    raw_dir: Path = GMS_RAW_DIR,
    parquet_dir: Path = SUBPROJECT_DIR / "data" / "hf_export" / "parquet",
    *,
    countries: tuple[str, ...] = GMS_COUNTRIES,
    years: tuple[int, ...] = GMS_YEARS,
) -> list[dict]:
    """Export raw FIRMS country CSVs into year-partitioned ZSTD Parquet files."""
    parquet_dir.mkdir(parents=True, exist_ok=True)
    mcon = duckdb.connect(":memory:")
    out_meta: list[dict] = []
    try:
        for yr in years:
            subqueries = []
            for country in countries:
                csv_path = raw_dir / f"viirs-snpp_{yr}_{country}.csv"
                if csv_path.exists() and csv_path.stat().st_size > 100:
                    subqueries.append(_read_country_csv_sql(csv_path, country))
            if not subqueries:
                continue
            dest = parquet_dir / f"transboundary_firms_{yr}.parquet"
            union_sql = "\nUNION ALL\n".join(subqueries)
            mcon.execute(f"""
                COPY (
                    SELECT country, acq_date, acq_time, year_th, month_th,
                           latitude, longitude, frp_mw, confidence, daynight
                    FROM ({union_sql})
                    ORDER BY country, acq_date, acq_time
                ) TO {_sql_path(dest)}
                (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
            """)
            cnt = int(mcon.execute(f"SELECT count(*) FROM read_parquet({_sql_path(dest)})").fetchone()[0])
            out_meta.append({
                "path": f"parquet/{dest.name}",
                "rows": cnt,
                "bytes": dest.stat().st_size,
            })
    finally:
        mcon.close()
    return out_meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Download NASA FIRMS VIIRS-SNPP 6 GMS countries (2022-2025).")
    parser.add_argument("--force", action="store_true", help="Re-download CSVs even if present")
    parser.add_argument("--fetch-only", action="store_true", help="Download CSVs without opening DuckDB")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    args = parser.parse_args()

    download_firms_archives(force=args.force)
    if not args.fetch_only:
        ingest_transboundary_to_duckdb(db_path=args.db)


if __name__ == "__main__":
    main()
