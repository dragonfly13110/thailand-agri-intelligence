"""Export hotspot_5y.duckdb into partitioned Parquet + gzipped map summary and upload to Hugging Face Datasets.

Usage:
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\publish_hf.py
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\publish_hf.py --export-only
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y\\publish_hf.py --include-duckdb
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile
import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parent
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from config import DEFAULT_DB_PATH, REPO_ROOT  # noqa: E402
from download_transboundary import GMS_RAW_DIR, export_transboundary_parquets  # noqa: E402
from map_data import DEFAULT_ERA5_PATH, DEFAULT_TADIH_DB_PATH, build_map_payload  # noqa: E402

DEFAULT_EXPORT_DIR = SUBPROJECT_DIR / "data" / "hf_export"
DEFAULT_HF_REPO = "dragonfly13110/thailand-hotspot-5y"


def load_dotenv(env_path: Path = REPO_ROOT / ".env") -> dict[str, str]:
    """Read key=value pairs from .env without overriding already-set process environment."""
    loaded: dict[str, str] = {}
    if not env_path.exists():
        return loaded
    for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        loaded[key] = val
    return loaded


def _sql_path(path: Path) -> str:
    return "'" + path.as_posix().replace("'", "''") + "'"


def _export_query_to_parquet(
    con: duckdb.DuckDBPyConnection,
    sql: str,
    dest: Path,
    *,
    row_group_size: int = 50_000,
) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"COPY ({sql}) TO {_sql_path(dest)} "
        f"(FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE {row_group_size})"
    )
    row_count = int(con.execute(f"SELECT count(*) FROM read_parquet({_sql_path(dest)})").fetchone()[0])
    return {
        "path": dest.relative_to(dest.parents[1]).as_posix(),
        "rows": row_count,
        "bytes": dest.stat().st_size,
    }


def _benchmark_compression(parquet_dir: Path) -> list[dict]:
    """Measure real CSV vs standard ZIP (deflate) vs Parquet ZSTD size across representative tables."""
    targets = (
        "hotspots_2026.parquet",
        "transboundary_firms_2024.parquet",
        "doae_crop_tambon.parquet",
        "air_quality_daily_77prov.parquet",
        "nasa_power_soil_daily_77prov.parquet",
        "rid_reservoirs_monthly_2022_2026.parquet",
    )
    results: list[dict] = []
    mcon = duckdb.connect(":memory:")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            for fname in targets:
                pq_path = parquet_dir / fname
                if not pq_path.exists():
                    continue
                rows = int(mcon.execute(f"SELECT count(*) FROM read_parquet({_sql_path(pq_path)})").fetchone()[0])
                csv_path = tmp_dir / f"{fname}.csv"
                zip_path = tmp_dir / f"{fname}.zip"
                mcon.execute(
                    f"COPY (SELECT * FROM read_parquet({_sql_path(pq_path)})) "
                    f"TO {_sql_path(csv_path)} (FORMAT CSV, HEADER)"
                )
                with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                    zf.write(csv_path, arcname=f"{pq_path.stem}.csv")
                raw_b = csv_path.stat().st_size
                zip_b = zip_path.stat().st_size
                pq_b = pq_path.stat().st_size
                csv_path.unlink(missing_ok=True)
                zip_path.unlink(missing_ok=True)
                results.append({
                    "file": f"parquet/{fname}",
                    "rows": rows,
                    "raw_csv_bytes": raw_b,
                    "zip_bytes": zip_b,
                    "parquet_bytes": pq_b,
                    "vs_raw_reduction_pct": round((1.0 - pq_b / raw_b) * 100, 1) if raw_b else 0.0,
                    "vs_zip_reduction_pct": round((1.0 - pq_b / zip_b) * 100, 1) if zip_b else 0.0,
                })
    finally:
        mcon.close()
    return results


def _build_dataset_card(repo_id: str, manifest: dict) -> str:
    files_md = "\n".join(
        f"| `{f['path']}` | {f['rows']:,} | {f['bytes'] / (1024 * 1024):.2f} MB |"
        for f in manifest["files"]
    )
    bench_rows = manifest.get("compression_benchmark") or []
    bench_section = ""
    if bench_rows:
        b_lines = "\n".join(
            f"| `{b['file'].split('/')[-1]}` | {b['rows']:,} | {b['raw_csv_bytes'] / 1048576:.2f} MB | "
            f"{b['zip_bytes'] / 1048576:.2f} MB | **{b['parquet_bytes'] / 1048576:.2f} MB** | "
            f"-{b['vs_raw_reduction_pct']:.1f}% vs CSV · -{b['vs_zip_reduction_pct']:.1f}% vs ZIP |"
            for b in bench_rows
        )
        tot_raw = sum(b["raw_csv_bytes"] for b in bench_rows)
        tot_zip = sum(b["zip_bytes"] for b in bench_rows)
        tot_pq = sum(b["parquet_bytes"] for b in bench_rows)
        bench_section = f"""
## ผลทดสอบการบีบอัดจริง: CSV ดิบ vs ZIP vs Apache Parquet (ZSTD)

| ชุดข้อมูล | แถว | CSV ดิบ | ZIP (Deflate) | Parquet (ZSTD) | ประหยัดพื้นที่ |
|---|---:|---:|---:|---:|---:|
{b_lines}
| **รวมชุดทดสอบ** | - | **{tot_raw / 1048576:.2f} MB** | **{tot_zip / 1048576:.2f} MB** | **{tot_pq / 1048576:.2f} MB** | **-{((1 - tot_pq / max(1, tot_raw)) * 100):.1f}% vs CSV · -{((1 - tot_pq / max(1, tot_zip)) * 100):.1f}% vs ZIP** |

> **ทำไม Parquet (ZSTD) ดีกว่าทำไฟล์ ZIP?**  
> 1. **เล็กกว่า ZIP** เพราะจัดเก็บแยกตามคอลัมน์ (Columnar) ทำให้ค่าซ้ำ เช่น รหัสจังหวัด วันที่ หรือชนิดพืช ถูกเข้ารหัสแบบ Dictionary + ZSTD ได้แน่นมาก  
> 2. **ไม่ต้องแตกไฟล์ทั้งก้อน (HTTP Range Query)** เบราว์เซอร์หรือ DuckDB สามารถดึงอ่านเฉพาะคอลัมน์และช่วง Row Group ที่ต้องการ (เช่น เฉพาะจังหวัดเชียงใหม่) ข้ามเครือข่ายได้ทันทีในไม่กี่ร้อยมิลลิวินาที
"""

    return f"""---
license: cc-by-nc-4.0
task_categories:
  - tabular-classification
  - time-series-forecasting
  - other
language:
  - th
  - en
pretty_name: Thailand Fire Hotspots, PM2.5 Haze, Burn Scars, Transboundary & Climate Atlas (2022–2026)
tags:
  - thailand
  - fire
  - hotspot
  - pm25
  - air-quality
  - viirs
  - firms
  - gistda
  - tamroypao
  - nasa-power
  - doae
  - rid
  - era5
  - duckdb
  - parquet
---

# Thailand 5-Year Hotspots, PM2.5 Haze, Transboundary & Agri-Climate Atlas (`2022–2026`)

ชุดข้อมูลวิเคราะห์จุดความร้อน ฝุ่น PM2.5 หมอกควันข้ามแดนอาเซียน ร่องรอยพื้นที่เผาไหม้ 20 ม. พื้นที่เพาะปลูกพืชเสี่ยงเผา สภาพอากาศ ความชื้นดิน น้ำอ่างเก็บน้ำ และความถี่น้ำท่วมซ้ำของประเทศไทย ระดับ **ประเทศเพื่อนบ้าน (6) · จังหวัด (77) · อำเภอ (928) · ตำบล (7,658) · หมู่บ้านใกล้เคียง** จัดทำในรูปแบบ **Apache Parquet (ZSTD)** เปิดอ่านตรงผ่าน **DuckDB / DuckDB-Wasm** ด้วย HTTP Range Request ได้ทันที

> **เงื่อนไขการใช้งาน (Attribution & Non-Commercial Notice):**  
> ชุดข้อมูลนี้รวบรวมเพื่อประโยชน์ด้าน **การศึกษา การวิจัย และการปฏิบัติงานภาครัฐ (ไม่ใช่เชิงพาณิชย์)** กรุณาอ้างอิงหน่วยงานต้นทางทุกครั้งที่นำไปใช้ต่อ และคงค่าว่าง (`NULL`) สำหรับพื้นที่ที่หน่วยงานต้นทางไม่ได้ครอบคลุม (ห้ามตีความเป็น `0`)

## แหล่งข้อมูลต้นทางและข้อจำกัดสำคัญ

1. **จุดความร้อน 5 ปี (`hotspots_2022..2026.parquet`, {manifest['meta'].get('total_all', 0):,} จุด):**  
   จาก **GISTDA STAC VIIRS** (`{manifest['meta'].get('min_date')}` ถึง `{manifest['meta'].get('max_date')}`) จับคู่ขอบเขต ปภ. (DDPM) ครบ 100%  
   - *ข้อควรระวัง:* ปี 2022–2023 มีเฉพาะดาวเทียม `N` (Suomi NPP) ส่วนปี 2024–2026 เพิ่ม `N20`/`N21` จึงควรเทียบแนวโน้มข้ามปีด้วย `satellite = 'N'` และช่วง `ม.ค.–ต.ค.` (เพราะ `N` หยุดส่งหลัง `2026-11-01`)  
   - ปักธง `is_suspected_static = true` สำหรับพิกัดที่เกิดซ้ำ ≥25 วัน (โรงงาน/เตาเผา/โรงไฟฟ้าชีวมวล)
2. **คุณภาพอากาศ & ฝุ่น PM2.5 77 จังหวัด (`air_quality_daily_77prov.parquet`, `air_quality_monthly_77prov.parquet`):**  
   จาก **Open-Meteo Air Quality CAMS** (`CC-BY-4.0`, `2022-08` ถึง `2026-11`) ครบ `PM2.5`, `PM10`, `CO`, `NO2`, `AOD`, `Dust`, `US AQI` และจำนวนวันเกินมาตรฐานไทย (`>37.5 µg/m³`) / WHO (`>15 µg/m³`) ณ จุดกริดศูนย์กลางจังหวัด
3. **หมอกควันข้ามแดน 6 ประเทศอาเซียน (`transboundary_firms_2022..2025.parquet`, `transboundary_monthly.parquet`):**  
   จาก **NASA FIRMS VIIRS Suomi-NPP** (`Public Domain`) เทียบมาตรฐานเดียวกันทั้ง **ไทย · เมียนมา · ลาว · กัมพูชา · เวียดนาม · มาเลเซีย** ปี `2022–2025`
4. **รอยเผาไหม้ 3 ฤดูแยกชนิดพืช (`tamroypao_burn_tambon.parquet`, `tamroypao_monthly_*.parquet`):**  
   จากภาพ Sentinel-2 ความละเอียด 20 ม. ของระบบ **"ตามรอยเผา" (สสน./HII · วช. · ม.เกษตรศาสตร์)** ฤดู 2567–2569 (`2024–2026`, ครอบคลุม **62 จังหวัด**; ประจวบคีรีขันธ์และภาคใต้คงค่า `NULL`)
5. **พื้นที่เพาะปลูกพืชเสี่ยงเผาระดับตำบล/จังหวัด (`doae_crop_tambon.parquet`, `doae_fire_crops_province.parquet`):**  
   จาก **กรมส่งเสริมการเกษตร (DOAE)** (`Open Data Common`, ปี 2566–2567) สำหรับเทียบสัดส่วนการเผาต่อพื้นที่ปลูกข้าว อ้อย ข้าวโพด มันสำปะหลัง (*ข้อควรระวัง:* ตารางรายจังหวัดคิดจากปี 2566 เพื่อไม่ให้นับซ้ำข้ามงวดรายงาน)
6. **ความชื้นดิน & พลังงานแสงอาทิตย์ (`nasa_power_soil_daily_77prov.parquet`, `nasa_power_soil_monthly_77prov.parquet`):**  
   จาก **NASA POWER** (`Public Domain`, `2022–2026`) ความชื้นผิวดิน `GWETTOP`, รากพืช `GWETROOT`, แสงอาทิตย์, จุดน้ำค้าง (`-999` แปลงเป็น `NULL` แล้ว)
7. **อ่างเก็บน้ำขนาดกลาง 461 แห่ง (`rid_reservoirs_monthly_2022_2026.parquet`):**  
   จาก **กรมชลประทาน (RID)** (`app.rid.go.th`, `2022–2026` รายเดือน, สำหรับใช้เพื่อการศึกษา/สาธารณะ)
8. **ราคาสินค้าเกษตร (`oae_monthly_crop_prices.parquet`), อากาศ ERA5 (`era5_*`), รอยเผา GISTDA (`gistda_burn_*`), น้ำท่วมซ้ำ (`hii_flood_risk.parquet`) และขอบเขต ปภ. (`dim_areas.parquet`)**

{bench_section}

## รายการไฟล์ในชุดข้อมูลนี้ (อัปเดต `{manifest['generated_at']}`)

| ไฟล์ | จำนวนแถว | ขนาด |
|---|---:|---:|
{files_md}

## ตัวอย่างการดึงไปใช้ด้วย DuckDB (Python / CLI / Browser)

```sql
-- 1. เทียบจุดไฟ 6 ประเทศอาเซียนปี 2024 จาก NASA FIRMS
SELECT country, count(*) AS spots, round(sum(frp_mw), 0) AS total_frp_mw
FROM 'https://huggingface.co/datasets/{repo_id}/resolve/main/parquet/transboundary_firms_2024.parquet'
GROUP BY 1 ORDER BY 2 DESC;

-- 2. วันที่ฝุ่น PM2.5 พุ่งสูงสุดในจังหวัดเชียงใหม่ (50)
SELECT date, pm25_mean, pm25_max, co_mean, aod_mean, us_aqi_max
FROM 'https://huggingface.co/datasets/{repo_id}/resolve/main/parquet/air_quality_daily_77prov.parquet'
WHERE prov_code = '50'
ORDER BY pm25_mean DESC NULLS LAST
LIMIT 20;
```
"""


def export_hf_bundle(
    *,
    db_path: Path = DEFAULT_DB_PATH,
    era5_path: Path = DEFAULT_ERA5_PATH,
    tadih_db_path: Path | None = DEFAULT_TADIH_DB_PATH,
    firms_gms_dir: Path | None = GMS_RAW_DIR,
    export_dir: Path = DEFAULT_EXPORT_DIR,
    repo_id: str = DEFAULT_HF_REPO,
) -> dict:
    """Export Parquet tables, gzipped map summary, manifest, and README.md into export_dir."""
    parquet_dir = export_dir / "parquet"
    summary_dir = export_dir / "summary"
    parquet_dir.mkdir(parents=True, exist_ok=True)
    summary_dir.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect(str(db_path), read_only=True)
    files_meta: list[dict] = []
    try:
        con.execute("LOAD spatial;")
        tables = {
            r[0]
            for r in con.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            ).fetchall()
        }

        # 1. Hotspots partitioned by year, sorted by prov_code -> amphoe_code -> acq_date_th for row-group pruning
        years = [
            int(r[0])
            for r in con.execute("SELECT DISTINCT year_th FROM hotspots WHERE year_th IS NOT NULL ORDER BY 1").fetchall()
        ]
        for yr in years:
            sql = f"""
                SELECT
                    CAST(acq_date_th AS VARCHAR) AS acq_date_th,
                    th_time,
                    year_th,
                    month_th,
                    hour_th,
                    round(latitude, 5) AS latitude,
                    round(longitude, 5) AS longitude,
                    satellite,
                    confidence_level,
                    round(frp_mw, 2) AS frp_mw,
                    lpad(CAST(prov_code AS VARCHAR), 2, '0') AS prov_code,
                    prov_name_th,
                    CAST(amphoe_code AS VARCHAR) AS amphoe_code,
                    amphoe_name_th,
                    CAST(tambon_code AS VARCHAR) AS tambon_code,
                    tambon_name_th,
                    village_name,
                    moo_1,
                    round(v_dist_km, 2) AS v_dist_km,
                    lu_name,
                    lu_hp_name,
                    is_suspected_static
                FROM hotspots
                WHERE year_th = {yr}
                ORDER BY prov_code, amphoe_code, acq_date_th, hour_th
            """
            files_meta.append(_export_query_to_parquet(con, sql, parquet_dir / f"hotspots_{yr}.parquet"))

        # 2. TamRoyPao seasonal tambon table + monthly CSV tables
        if "tamroypao_burn_tambon" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT t.season_be, t.season_period, t.year_th,
                           lpad(CAST(t.prov_code AS VARCHAR), 2, '0') AS prov_code,
                           p.prov_name_th,
                           CAST(t.amphoe_code AS VARCHAR) AS amphoe_code,
                           a.amphoe_name_th,
                           CAST(t.tambon_code AS VARCHAR) AS tambon_code,
                           tb.tambon_name_th,
                           t.paddy_rai, t.sugarcane_rai, t.corn_rai, t.mixed_rai,
                           t.agri_rai, t.forest_rai, t.total_rai
                    FROM tamroypao_burn_tambon t
                    LEFT JOIN dim_province p ON p.prov_code = lpad(CAST(t.prov_code AS VARCHAR), 2, '0')
                    LEFT JOIN dim_amphoe a ON a.amphoe_code = CAST(t.amphoe_code AS VARCHAR)
                    LEFT JOIN dim_tambon tb ON tb.tambon_code = CAST(t.tambon_code AS VARCHAR)
                    ORDER BY t.year_th, prov_code, amphoe_code, tambon_code
                    """,
                    parquet_dir / "tamroypao_burn_tambon.parquet",
                )
            )
        if "tamroypao_burn_agri" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    "SELECT * FROM tamroypao_burn_agri ORDER BY month, province_code",
                    parquet_dir / "tamroypao_monthly_agri.parquet",
                )
            )
        if "tamroypao_burn_forest" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    "SELECT * FROM tamroypao_burn_forest ORDER BY month, province_code",
                    parquet_dir / "tamroypao_monthly_forest.parquet",
                )
            )
        if "era5_monthly_fire_weather" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT w.prov_code, p.prov_name_th, w.year_th, w.month_th, w.ym, w.days_count,
                           w.tmax_mean_c, w.tmax_peak_c, w.tmean_c, w.hot_days_35c, w.hot_days_38c,
                           w.rain_mm, w.dry_days, w.longest_dry_spell_days,
                           w.wind_max_mean_kmh, w.wind_peak_kmh, w.et0_sum_mm,
                           w.rh_mean_pct, w.rh_min_mean_pct, w.low_rh_days_35pct, w.fire_weather_index
                    FROM era5_monthly_fire_weather w
                    LEFT JOIN dim_province p ON p.prov_code = w.prov_code
                    ORDER BY w.prov_code, w.ym
                    """,
                    parquet_dir / "era5_monthly_fire_weather.parquet",
                )
            )

        # 3. GISTDA burn scar & burn freq (attributes + centroids, no heavy WKB polygons)
        if "gistda_burn_scar" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT feature_id,
                           lpad(CAST(prov_code AS VARCHAR), 2, '0') AS prov_code,
                           prov_name_th,
                           CAST(amphoe_code AS VARCHAR) AS amphoe_code,
                           amphoe_name_th,
                           CAST(tambon_code AS VARCHAR) AS tambon_code,
                           tambon_name_th,
                           round(area_rai, 2) AS area_rai,
                           round(area_sqm, 1) AS area_sqm,
                           date_range, rp_name, lu_name,
                           round(centroid_lon, 5) AS centroid_lon,
                           round(centroid_lat, 5) AS centroid_lat
                    FROM gistda_burn_scar
                    ORDER BY prov_code, amphoe_code, area_rai DESC
                    """,
                    parquet_dir / "gistda_burn_scar.parquet",
                )
            )
        if "gistda_burn_freq" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT feature_id,
                           lpad(CAST(prov_code AS VARCHAR), 2, '0') AS prov_code,
                           prov_name_th,
                           CAST(amphoe_code AS VARCHAR) AS amphoe_code,
                           amphoe_name_th,
                           CAST(tambon_code AS VARCHAR) AS tambon_code,
                           tambon_name_th,
                           round(area_rai, 2) AS area_rai,
                           freq, y2017, y2023, y2024, y2025,
                           round(centroid_lon, 5) AS centroid_lon,
                           round(centroid_lat, 5) AS centroid_lat
                    FROM gistda_burn_freq
                    ORDER BY prov_code, freq DESC, area_rai DESC
                    """,
                    parquet_dir / "gistda_burn_freq.parquet",
                )
            )

        # 4. Administrative area lookup table (7,658 tambons)
        files_meta.append(
            _export_query_to_parquet(
                con,
                """
                SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS prov_code,
                       prov_name_th,
                       CAST(amphoe_code AS VARCHAR) AS amphoe_code,
                       amphoe_name_th,
                       CAST(tambon_code AS VARCHAR) AS tambon_code,
                       tambon_name_th,
                       round(centroid_lon, 5) AS centroid_lon,
                       round(centroid_lat, 5) AS centroid_lat,
                       round(ST_Area_Spheroid(ST_FlipCoordinates(geom)) / 1e6, 4) AS area_sqkm
                FROM dim_tambon
                ORDER BY prov_code, amphoe_code, tambon_code
                """,
                parquet_dir / "dim_areas.parquet",
            )
        )

        # 4b. Air quality (Open-Meteo CAMS PM2.5, CO, AOD)
        if "air_quality_monthly_77prov" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT a.prov_code, p.prov_name_th, a.year_th, a.month_th, a.ym, a.days_count,
                           a.pm25_mean, a.pm25_p90, a.pm25_max, a.pm10_mean, a.co_mean, a.no2_mean,
                           a.aod_mean, a.dust_mean, a.us_aqi_max, a.days_exceed_37_5, a.days_exceed_15_who
                    FROM air_quality_monthly_77prov a
                    LEFT JOIN dim_province p ON p.prov_code = a.prov_code
                    ORDER BY a.prov_code, a.ym
                    """,
                    parquet_dir / "air_quality_monthly_77prov.parquet",
                )
            )
        if "air_quality_daily_77prov" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT a.prov_code, p.prov_name_th, CAST(a.date AS VARCHAR) AS date,
                           a.year_th, a.month_th, a.ym, a.pm25_mean, a.pm25_max, a.pm10_mean,
                           a.co_mean, a.no2_mean, a.aod_mean, a.dust_mean, a.us_aqi_max,
                           a.hours_gt_37_5, a.hours_gt_75
                    FROM air_quality_daily_77prov a
                    LEFT JOIN dim_province p ON p.prov_code = a.prov_code
                    ORDER BY a.prov_code, a.date
                    """,
                    parquet_dir / "air_quality_daily_77prov.parquet",
                )
            )

        # 4c. NASA POWER Soil Wetness & Solar Radiation
        if "nasa_power_soil_monthly" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT n.prov_code, p.prov_name_th, n.year_th, n.month_th, n.ym, n.days_count,
                           n.gwettop_mean, n.gwettop_min, n.gwetroot_mean, n.gwetroot_min,
                           n.solar_mj_mean, n.dewpoint_c_mean, n.dry_soil_days_lt_035
                    FROM nasa_power_soil_monthly n
                    LEFT JOIN dim_province p ON p.prov_code = n.prov_code
                    ORDER BY n.prov_code, n.ym
                    """,
                    parquet_dir / "nasa_power_soil_monthly_77prov.parquet",
                )
            )
        if "nasa_power_soil_daily" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT n.prov_code, p.prov_name_th, CAST(n.date AS VARCHAR) AS date,
                           n.year_th, n.month_th, n.ym, n.gwettop, n.gwetroot, n.solar_mj,
                           n.dewpoint_c, n.ws10m_ms
                    FROM nasa_power_soil_daily n
                    LEFT JOIN dim_province p ON p.prov_code = n.prov_code
                    ORDER BY n.prov_code, n.date
                    """,
                    parquet_dir / "nasa_power_soil_daily_77prov.parquet",
                )
            )

        # 4d. Transboundary monthly + DOAE crops + RID reservoirs + OAE prices
        if "transboundary_monthly" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    "SELECT * FROM transboundary_monthly ORDER BY year_th, month_th, country",
                    parquet_dir / "transboundary_monthly.parquet",
                )
            )
        if "doae_crop_tambon" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT * FROM doae_crop_tambon
                    ORDER BY source_year_be, prov_code, amphoe_name_th, tambon_name_th, crop_name
                    """,
                    parquet_dir / "doae_crop_tambon.parquet",
                )
            )
        if "doae_fire_crops_province" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    "SELECT * FROM doae_fire_crops_province ORDER BY prov_code",
                    parquet_dir / "doae_fire_crops_province.parquet",
                )
            )
        if "rid_reservoirs_monthly" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT CAST(snapshot_date AS VARCHAR) AS snapshot_date, year_th, month_th, ym,
                           region, reservoir_id, reservoir_name, storage_mcm, dead_storage_mcm,
                           volume_mcm, percent_storage, inflow, outflow
                    FROM rid_reservoirs_monthly
                    ORDER BY snapshot_date, region, reservoir_id
                    """,
                    parquet_dir / "rid_reservoirs_monthly_2022_2026.parquet",
                )
            )
        if "oae_monthly_prices" in tables:
            files_meta.append(
                _export_query_to_parquet(
                    con,
                    """
                    SELECT CAST(observed_date AS VARCHAR) AS observed_date, year_th, month_th,
                           commodity_name, unit, price_value, source_url
                    FROM oae_monthly_prices
                    ORDER BY commodity_name, observed_date
                    """,
                    parquet_dir / "oae_monthly_crop_prices.parquet",
                )
            )
    finally:
        con.close()

    # 4e. Transboundary NASA FIRMS 2022-2025 raw CSV -> ZSTD Parquet
    if firms_gms_dir is not None and Path(firms_gms_dir).exists() and any(Path(firms_gms_dir).glob("viirs-snpp_*.csv")):
        files_meta.extend(export_transboundary_parquets(raw_dir=Path(firms_gms_dir), parquet_dir=parquet_dir))

    # 5. ERA5 annual climate (77 provinces x 10 years)
    if Path(era5_path).exists():
        raw_era5 = json.loads(Path(era5_path).read_text(encoding="utf-8"))
        provinces_node = raw_era5.get("provinces") or {}
        era5_rows = []
        items = provinces_node.values() if isinstance(provinces_node, dict) else provinces_node
        for p in items:
            pcode = str(p.get("province_code") or "").zfill(2)
            pname = p.get("province_name_th") or p.get("name_th") or ""
            for y in p.get("years") or []:
                era5_rows.append((
                    pcode,
                    pname,
                    int(y["year"]),
                    y.get("tmean_c"),
                    y.get("tmax_mean_c"),
                    y.get("tmin_mean_c"),
                    y.get("hot_days_38c"),
                    y.get("rainfall_total_mm"),
                    y.get("longest_dry_spell_days"),
                    y.get("dry_spell_events_5d"),
                    bool(y.get("complete_year", True)),
                ))
        mcon = duckdb.connect(":memory:")
        mcon.execute("""
            CREATE TABLE era5 (
                prov_code VARCHAR, prov_name_th VARCHAR, year INTEGER,
                tmean_c DOUBLE, tmax_mean_c DOUBLE, tmin_mean_c DOUBLE,
                hot_days_38c INTEGER, rainfall_total_mm DOUBLE,
                longest_dry_spell_days INTEGER, dry_spell_events_5d INTEGER,
                complete_year BOOLEAN
            )
        """)
        mcon.executemany("INSERT INTO era5 VALUES (?,?,?,?,?,?,?,?,?,?,?)", era5_rows)
        files_meta.append(
            _export_query_to_parquet(
                mcon,
                "SELECT * FROM era5 ORDER BY prov_code, year",
                parquet_dir / "era5_annual_2016_2025.parquet",
            )
        )
        mcon.close()

    # 6. HII flood risk (from local tadih.duckdb when available)
    if tadih_db_path is not None and Path(tadih_db_path).exists():
        tcon = duckdb.connect(str(tadih_db_path), read_only=True)
        try:
            t_tables = {r[0] for r in tcon.execute("SHOW TABLES").fetchall()}
            if "fact_flood_risk_forecast" in t_tables:
                files_meta.append(
                    _export_query_to_parquet(
                        tcon,
                        """
                        SELECT month,
                               lpad(CAST(dopa_province_code AS VARCHAR), 2, '0') AS prov_code,
                               province_name_th,
                               CAST(dopa_amphoe_code AS VARCHAR) AS amphoe_code,
                               amphoe_name_th,
                               CAST(dopa_tambon_code AS VARCHAR) AS tambon_code,
                               tambon_name_th,
                               recurrence_17yr_count,
                               risk_criteria,
                               risk_level,
                               source_agency,
                               license_status
                        FROM fact_flood_risk_forecast
                        WHERE dopa_tambon_code IS NOT NULL
                        ORDER BY prov_code, amphoe_code, tambon_code, month
                        """,
                        parquet_dir / "hii_flood_risk.parquet",
                    )
                )
        finally:
            tcon.close()

    # 7. Map summary gzipped JSON (~5 MB for fast web app initial load)
    payload = build_map_payload(db_path=db_path, era5_path=era5_path, tadih_db_path=tadih_db_path)
    raw_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    summary_gz = summary_dir / "map_payload.json.gz"
    with gzip.open(summary_gz, "wb", compresslevel=9) as gz:
        gz.write(raw_json)

    bench_rows = _benchmark_compression(parquet_dir)

    manifest = {
        "schema": "tadih.hotspot5y_hf.v2",
        "repo_id": repo_id,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "meta": payload["meta"],
        "summary_gz": {
            "path": "summary/map_payload.json.gz",
            "bytes": summary_gz.stat().st_size,
            "uncompressed_bytes": len(raw_json),
        },
        "compression_benchmark": bench_rows,
        "files": files_meta,
    }
    manifest_path = summary_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    readme_path = export_dir / "README.md"
    readme_path.write_text(_build_dataset_card(repo_id, manifest), encoding="utf-8")

    total_bytes = summary_gz.stat().st_size + sum(f["bytes"] for f in files_meta)
    print(
        f"[Export] {len(files_meta)} Parquet files + summary/map_payload.json.gz "
        f"({summary_gz.stat().st_size / (1024 * 1024):.2f} MB) | "
        f"Total = {total_bytes / (1024 * 1024):.2f} MB -> {export_dir}",
        flush=True,
    )
    for f in files_meta:
        print(f"   - {f['path']:40s} | {f['rows']:>10,} rows | {f['bytes'] / (1024 * 1024):6.2f} MB", flush=True)
    return manifest


def upload_to_huggingface(
    export_dir: Path,
    repo_id: str,
    token: str,
    *,
    include_duckdb: bool = False,
    db_path: Path = DEFAULT_DB_PATH,
) -> str:
    from huggingface_hub import HfApi

    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, repo_type="dataset", private=False, exist_ok=True)
    print(f"[HF] Uploading folder {export_dir} -> datasets/{repo_id} ...", flush=True)
    commit_info = api.upload_folder(
        folder_path=str(export_dir),
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Add PM2.5 AQ, 6-country Transboundary FIRMS, NASA POWER soil, DOAE crops, RID reservoirs & OAE prices Parquet + benchmark",
    )
    if include_duckdb and db_path.exists():
        print(f"[HF] Uploading full DuckDB backup ({db_path.stat().st_size / (1024 * 1024):.1f} MB) ...", flush=True)
        api.upload_file(
            path_or_fileobj=str(db_path),
            path_in_repo="backup/hotspot_5y.duckdb",
            repo_id=repo_id,
            repo_type="dataset",
            commit_message="Update backup/hotspot_5y.duckdb snapshot",
        )
    url = f"https://huggingface.co/datasets/{repo_id}"
    print(f"[HF] Uploaded successfully -> {url} (commit: {getattr(commit_info, 'oid', 'ok')})", flush=True)
    return url


def main() -> None:
    dotenv = load_dotenv()
    default_repo = os.environ.get("HF_DATASET_REPO") or dotenv.get("HF_DATASET_REPO") or DEFAULT_HF_REPO

    parser = argparse.ArgumentParser(description="Export hotspot-5y DuckDB to Parquet and upload to Hugging Face.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--era5", type=Path, default=DEFAULT_ERA5_PATH)
    parser.add_argument("--tadih-db", type=Path, default=DEFAULT_TADIH_DB_PATH)
    parser.add_argument("--export-dir", type=Path, default=DEFAULT_EXPORT_DIR)
    parser.add_argument("--repo", type=str, default=default_repo)
    parser.add_argument("--export-only", action="store_true", help="Only build local Parquet + summary bundle without uploading")
    parser.add_argument("--include-duckdb", action="store_true", help="Also upload backup/hotspot_5y.duckdb")
    args = parser.parse_args()

    tadih_db = args.tadih_db if args.tadih_db and args.tadih_db.exists() else None
    export_hf_bundle(
        db_path=args.db,
        era5_path=args.era5,
        tadih_db_path=tadih_db,
        export_dir=args.export_dir,
        repo_id=args.repo,
    )

    if args.export_only:
        return

    token = os.environ.get("HF_TOKEN") or dotenv.get("HF_TOKEN") or ""
    if not token:
        raise SystemExit("ERROR: Missing HF_TOKEN in environment or .env. Set HF_TOKEN before uploading.")

    upload_to_huggingface(
        args.export_dir,
        args.repo,
        token,
        include_duckdb=args.include_duckdb,
        db_path=args.db,
    )


if __name__ == "__main__":
    main()
