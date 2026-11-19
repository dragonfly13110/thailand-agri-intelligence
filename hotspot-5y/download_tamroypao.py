"""ดึงข้อมูลรอยเผาไหม้ "ตามรอยเผา" (สสน./HII) เข้า DuckDB เฉพาะเครื่อง:
1. CSV รายจังหวัด/รายเดือน: tamroypao_burn_agri (ข้าว/อ้อย/ผสม/ข้าวโพด) และ tamroypao_burn_forest (ป่า)
2. GeoTIFF รายฤดูฝุ่น 20 ม. (MB3A เกษตร + MB3F ป่า, 3 ฤดู 2567-2569):
   นับพิกเซลซ้อนทับขอบเขตตำบล ปภ. (dim_tambon เฉพาะ 62 จังหวัดในขอบเขต สสน. รหัส 10..76)
   1 พิกเซล (20x20 ม. = 400 ตร.ม.) = 0.25 ไร่ -> บันทึกตาราง tamroypao_burn_tambon
   พร้อมสร้าง view v_tamroypao_amphoe_season และ v_tamroypao_province_season
   (15 จังหวัดนอกขอบเขต สสน. ได้แก่ ประจวบคีรีขันธ์ 77 และภาคใต้ 80..96 ไม่ใส่แถว เพื่อให้คงค่าเป็น NULL)
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import duckdb
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window

BASE = "https://tamroypao.hii.or.th"
ROOT = Path(__file__).resolve().parent / "data"
RAW = ROOT / "raw" / "tamroypao"
TIF_DIR = RAW / "geotiff"
ZONAL_CACHE_CSV = RAW / "tamroypao_zonal_tambon_seasons.csv"
DB = ROOT / "hotspot_5y.duckdb"

KINDS = {
    "agri": "/tamroypao/data/csv/province/{y}/burn_area_province_{ym}.csv",
    "forest": "/tamroypao/data/csv/tamroypao_province_forest/{y}/burn_area_province_forest_{ym}.csv",
}

SEASON_SPECS = [
    {
        "season_be": "2567",
        "season_period": "202312_202404",
        "year_th": 2024,
        "agri_rel": "/product/MB3A/2023/BURNSCAR_NORTH_20M_202312_202404_B3A.tif",
        "forest_rel": "/product/MB3F/2023/BURNSCAR_NORTH_20M_202312_202404_B3F.tif",
    },
    {
        "season_be": "2568",
        "season_period": "202412_202504",
        "year_th": 2025,
        "agri_rel": "/product/MB3A/2024/BURNSCAR_NORTH_20M_202412_202504_B3A.tif",
        "forest_rel": "/product/MB3F/2024/BURNSCAR_NORTH_20M_202412_202504_B3F.tif",
    },
    {
        "season_be": "2569",
        "season_period": "202512_202604",
        "year_th": 2026,
        "agri_rel": "/product/MB3A/2025/BURNSCAR_NORTH_20M_202512_202604_B3A.tif",
        "forest_rel": "/product/MB3F/2025/BURNSCAR_NORTH_20M_202512_202604_B3F.tif",
    },
]

COVERED_PROV_CODES = {
    f"{i:02d}"
    for i in (
        list(range(10, 28))
        + list(range(30, 59))
        + list(range(60, 68))
        + list(range(70, 77))
    )
}


def fetch(url: str) -> str | None:
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.read().decode("utf-8-sig")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def num(v: str | None) -> float | None:
    v = (v or "").strip()
    return float(v) if v else None


def download_monthly_csvs(con: duckdb.DuckDBPyConnection, start: int = 2023, end: int = 2026) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    agri, forest = [], []
    for kind, tpl in KINDS.items():
        for y in range(start, end + 1):
            for m in range(1, 13):
                ym = f"{y}{m:02d}"
                cache_file = RAW / f"{kind}_{ym}.csv"
                url = BASE + tpl.format(y=y, ym=ym)
                if cache_file.exists() and cache_file.stat().st_size > 0:
                    text = cache_file.read_text(encoding="utf-8")
                else:
                    text = fetch(url)
                    if text is None:
                        continue
                    cache_file.write_text(text, encoding="utf-8")
                for r in csv.DictReader(io.StringIO(text)):
                    base = (r["province_code"], r["province_th"], r["province_en"], r["month"])
                    if kind == "agri":
                        agri.append(
                            base
                            + tuple(num(r.get(c)) for c in ("Paddy", "Sugarcane", "Mixed", "Corn"))
                            + (url,)
                        )
                    else:
                        forest.append(base + (num(r.get("Forest")), url))

    con.execute("DROP TABLE IF EXISTS tamroypao_burn_agri")
    con.execute("DROP TABLE IF EXISTS tamroypao_burn_forest")
    con.execute(
        "CREATE TABLE tamroypao_burn_agri("
        "province_code VARCHAR, province_th VARCHAR, province_en VARCHAR, month VARCHAR, "
        "paddy DOUBLE, sugarcane DOUBLE, mixed DOUBLE, corn DOUBLE, source_url VARCHAR)"
    )
    con.execute(
        "CREATE TABLE tamroypao_burn_forest("
        "province_code VARCHAR, province_th VARCHAR, province_en VARCHAR, month VARCHAR, "
        "forest DOUBLE, source_url VARCHAR)"
    )
    con.executemany("INSERT INTO tamroypao_burn_agri VALUES (?,?,?,?,?,?,?,?,?)", agri)
    con.executemany("INSERT INTO tamroypao_burn_forest VALUES (?,?,?,?,?,?)", forest)
    for t in ("tamroypao_burn_agri", "tamroypao_burn_forest"):
        n, a, b = con.execute(f"SELECT count(*), min(month), max(month) FROM {t}").fetchone()
        print(f"[CSV] {t}: {n} rows ({a}..{b})", flush=True)


def ensure_geotiffs(force_download: bool = False) -> None:
    TIF_DIR.mkdir(parents=True, exist_ok=True)
    for spec in SEASON_SPECS:
        for key in ("agri_rel", "forest_rel"):
            rel = spec[key]
            fname = rel.split("/")[-1]
            dest = TIF_DIR / fname
            if force_download or not dest.exists() or dest.stat().st_size < 1_000_000:
                print(f"[GeoTIFF] Downloading {fname} ...", flush=True)
                urllib.request.urlretrieve(BASE + rel, dest)
            print(f"[GeoTIFF] Ready {fname} ({dest.stat().st_size:,} bytes)", flush=True)


def compute_or_load_zonal_tambons(
    con: duckdb.DuckDBPyConnection,
    *,
    force_zonal: bool = False,
) -> list[tuple]:
    if not force_zonal and ZONAL_CACHE_CSV.exists() and ZONAL_CACHE_CSV.stat().st_size > 10_000:
        print(f"[Zonal] Loading cached zonal summary from {ZONAL_CACHE_CSV.name} ...", flush=True)
        rows = []
        with ZONAL_CACHE_CSV.open("r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rows.append((
                    r["season_be"],
                    r["season_period"],
                    int(r["year_th"]),
                    r["prov_code"],
                    r["amphoe_code"],
                    r["tambon_code"],
                    float(r["paddy_rai"]),
                    float(r["sugarcane_rai"]),
                    float(r["corn_rai"]),
                    float(r["mixed_rai"]),
                    float(r["agri_rai"]),
                    float(r["forest_rai"]),
                    float(r["total_rai"]),
                    r["source_agri_tif"],
                    r["source_forest_tif"],
                ))
        return rows

    t0 = time.time()
    con.execute("LOAD spatial;")
    tb_rows = con.execute("""
        SELECT tambon_code, amphoe_code, lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
               min_lat, max_lat, ST_AsGeoJSON(geom)
        FROM dim_tambon
        WHERE geom IS NOT NULL
        ORDER BY tambon_code
    """).fetchall()

    tambons = []
    for tcode, acode, pcode, min_lat, max_lat, gjson in tb_rows:
        if pcode not in COVERED_PROV_CODES:
            continue
        idx = len(tambons) + 1
        tambons.append((
            idx,
            str(tcode),
            str(acode),
            str(pcode),
            float(min_lat),
            float(max_lat),
            json.loads(gjson),
        ))

    num_tb = len(tambons)
    print(f"[Zonal] Rasterizing {num_tb} tambons across 62 covered provinces ...", flush=True)

    agri_srcs = {s["season_be"]: rasterio.open(TIF_DIR / s["agri_rel"].split("/")[-1]) for s in SEASON_SPECS}
    forest_srcs = {s["season_be"]: rasterio.open(TIF_DIR / s["forest_rel"].split("/")[-1]) for s in SEASON_SPECS}

    try:
        ref = agri_srcs["2567"]
        width, height = ref.width, ref.height
        transform = ref.transform

        AGRI_CODES = (1101, 1201, 1202, 1203)
        acc_agri = {
            s["season_be"]: {c: np.zeros(num_tb + 1, dtype=np.int64) for c in AGRI_CODES}
            for s in SEASON_SPECS
        }
        acc_forest = {
            s["season_be"]: np.zeros(num_tb + 1, dtype=np.int64)
            for s in SEASON_SPECS
        }

        step = 2048
        for r0 in range(0, height, step):
            h = min(step, height - r0)
            win = Window(0, r0, width, h)
            win_transform = rasterio.windows.transform(win, transform)
            lat_top = transform.f + r0 * transform.e
            lat_bot = transform.f + (r0 + h) * transform.e
            if lat_bot > lat_top:
                lat_bot, lat_top = lat_top, lat_bot

            shapes = [(g, idx) for idx, _, _, _, mn, mx, g in tambons if mx >= lat_bot and mn <= lat_top]
            if not shapes:
                continue

            tb_grid = rasterize(
                shapes,
                out_shape=(h, width),
                transform=win_transform,
                fill=0,
                dtype=np.uint16,
            )

            for sea, src in agri_srcs.items():
                arr = src.read(1, window=win)
                mask = arr > 0
                if np.any(mask):
                    tb_hits = tb_grid[mask]
                    val_hits = arr[mask]
                    for c in AGRI_CODES:
                        sub = tb_hits[val_hits == c]
                        if sub.size > 0:
                            acc_agri[sea][c] += np.bincount(sub, minlength=num_tb + 1)

            for sea, src in forest_srcs.items():
                arr = src.read(1, window=win)
                mask = arr == 6000
                if np.any(mask):
                    tb_hits = tb_grid[mask]
                    acc_forest[sea] += np.bincount(tb_hits, minlength=num_tb + 1)

            print(f"[Zonal] Strip {r0:5d}/{height} ({len(shapes):4d} tambons) {time.time()-t0:.1f}s", flush=True)
    finally:
        for s in list(agri_srcs.values()) + list(forest_srcs.values()):
            s.close()

    rows: list[tuple] = []
    for spec in SEASON_SPECS:
        sea = spec["season_be"]
        period = spec["season_period"]
        yr_th = spec["year_th"]
        a_tif = spec["agri_rel"].split("/")[-1]
        f_tif = spec["forest_rel"].split("/")[-1]
        for idx, tcode, acode, pcode, _, _, _ in tambons:
            paddy = round(float(acc_agri[sea][1101][idx]) * 0.25, 2)
            sugar = round(float(acc_agri[sea][1203][idx]) * 0.25, 2)
            corn = round(float(acc_agri[sea][1202][idx]) * 0.25, 2)
            mixed = round(float(acc_agri[sea][1201][idx]) * 0.25, 2)
            agri_tot = round(paddy + sugar + corn + mixed, 2)
            forest_tot = round(float(acc_forest[sea][idx]) * 0.25, 2)
            total = round(agri_tot + forest_tot, 2)
            rows.append((
                sea,
                period,
                yr_th,
                pcode,
                acode,
                tcode,
                paddy,
                sugar,
                corn,
                mixed,
                agri_tot,
                forest_tot,
                total,
                a_tif,
                f_tif,
            ))

    with ZONAL_CACHE_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "season_be", "season_period", "year_th", "prov_code", "amphoe_code", "tambon_code",
            "paddy_rai", "sugarcane_rai", "corn_rai", "mixed_rai",
            "agri_rai", "forest_rai", "total_rai", "source_agri_tif", "source_forest_tif",
        ])
        w.writerows(rows)

    print(f"[Zonal] Saved {len(rows)} tambon-season rows to {ZONAL_CACHE_CSV.name}", flush=True)
    return rows


def ingest_zonal_to_duckdb(con: duckdb.DuckDBPyConnection, rows: list[tuple]) -> None:
    con.execute("DROP VIEW IF EXISTS v_tamroypao_province_season")
    con.execute("DROP VIEW IF EXISTS v_tamroypao_amphoe_season")
    con.execute("DROP TABLE IF EXISTS tamroypao_burn_tambon")
    con.execute("""
        CREATE TABLE tamroypao_burn_tambon (
            season_be VARCHAR,
            season_period VARCHAR,
            year_th INTEGER,
            prov_code VARCHAR,
            amphoe_code VARCHAR,
            tambon_code VARCHAR,
            paddy_rai DOUBLE,
            sugarcane_rai DOUBLE,
            corn_rai DOUBLE,
            mixed_rai DOUBLE,
            agri_rai DOUBLE,
            forest_rai DOUBLE,
            total_rai DOUBLE,
            source_agri_tif VARCHAR,
            source_forest_tif VARCHAR
        )
    """)
    con.executemany(
        "INSERT INTO tamroypao_burn_tambon VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
    con.execute("""
        CREATE VIEW v_tamroypao_amphoe_season AS
        SELECT season_be, season_period, year_th, prov_code, amphoe_code,
               count(*) AS tambon_count,
               round(sum(paddy_rai), 2) AS paddy_rai,
               round(sum(sugarcane_rai), 2) AS sugarcane_rai,
               round(sum(corn_rai), 2) AS corn_rai,
               round(sum(mixed_rai), 2) AS mixed_rai,
               round(sum(agri_rai), 2) AS agri_rai,
               round(sum(forest_rai), 2) AS forest_rai,
               round(sum(total_rai), 2) AS total_rai
        FROM tamroypao_burn_tambon
        GROUP BY 1, 2, 3, 4, 5
    """)
    con.execute("""
        CREATE VIEW v_tamroypao_province_season AS
        SELECT season_be, season_period, year_th, prov_code,
               count(*) AS tambon_count,
               round(sum(paddy_rai), 2) AS paddy_rai,
               round(sum(sugarcane_rai), 2) AS sugarcane_rai,
               round(sum(corn_rai), 2) AS corn_rai,
               round(sum(mixed_rai), 2) AS mixed_rai,
               round(sum(agri_rai), 2) AS agri_rai,
               round(sum(forest_rai), 2) AS forest_rai,
               round(sum(total_rai), 2) AS total_rai
        FROM tamroypao_burn_tambon
        GROUP BY 1, 2, 3, 4
    """)
    summary = con.execute("""
        SELECT season_be, year_th, count(DISTINCT prov_code), count(*),
               round(sum(agri_rai), 0), round(sum(forest_rai), 0), round(sum(total_rai), 0)
        FROM tamroypao_burn_tambon
        GROUP BY 1, 2
        ORDER BY 1
    """).fetchall()
    for s_be, yr, n_prov, n_tb, ag, fo, tot in summary:
        print(
            f"[DuckDB] Season {s_be} (year_th={yr}): {n_prov} provs, {n_tb} tambons | "
            f"Agri={ag:,.0f} rai | Forest={fo:,.0f} rai | Total={tot:,.0f} rai",
            flush=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Download TamRoyPao CSVs and seasonal GeoTIFF zonal stats into DuckDB.")
    parser.add_argument("--force-download", action="store_true", help="Re-download GeoTIFF files")
    parser.add_argument("--force-zonal", action="store_true", help="Recompute GeoTIFF zonal stats even if cache exists")
    args = parser.parse_args()

    ensure_geotiffs(force_download=args.force_download)
    con = duckdb.connect(str(DB))
    try:
        download_monthly_csvs(con)
        rows = compute_or_load_zonal_tambons(con, force_zonal=args.force_zonal)
        ingest_zonal_to_duckdb(con, rows)
    finally:
        con.close()


if __name__ == "__main__":
    main()
