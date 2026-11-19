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
import duckdb

SUBPROJECT_DIR = Path(__file__).resolve().parent
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from config import DEFAULT_DB_PATH, REPO_ROOT  # noqa: E402
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


def _build_dataset_card(repo_id: str, manifest: dict) -> str:
    files_md = "\n".join(
        f"| `{f['path']}` | {f['rows']:,} | {f['bytes'] / (1024 * 1024):.2f} MB |"
        for f in manifest["files"]
    )
    return f"""---
license: cc-by-nc-4.0
task_categories:
  - tabular-classification
  - other
language:
  - th
  - en
pretty_name: Thailand Agricultural & Forest Fire Hotspots + Burn Scar (2022–2026)
tags:
  - thailand
  - fire
  - hotspot
  - viirs
  - gistda
  - tamroypao
  - sentinel-2
  - era5
  - duckdb
  - parquet
---

# Thailand 5-Year Hotspots, Burn Scars, Climate & Flood Recurrence (`2022–2026`)

ชุดข้อมูลวิเคราะห์จุดความร้อน ร่องรอยพื้นที่เผาไหม้ ปัจจัยสภาพอากาศ และความถี่น้ำท่วมซ้ำของประเทศไทย ระดับ **จังหวัด (77) · อำเภอ (928) · ตำบล (7,658) · หมู่บ้านใกล้เคียง** จัดทำในรูปแบบ **Apache Parquet** ที่สามารถเปิดอ่านตรงผ่าน **DuckDB / DuckDB-Wasm** ด้วย HTTP Range Request ได้ทันที

> **เงื่อนไขการใช้งาน (Attribution & Non-Commercial Notice):**  
> ชุดข้อมูลนี้รวบรวมเพื่อประโยชน์ด้าน **การศึกษา การวิจัย และการปฏิบัติงานภาครัฐ (ไม่ใช่เชิงพาณิชย์)** กรุณาอ้างอิงหน่วยงานต้นทางทุกครั้งที่นำไปใช้ต่อ และคงค่าว่าง (`NULL`) สำหรับพื้นที่ที่หน่วยงานต้นทางไม่ได้ครอบคลุม (ห้ามตีความเป็น `0`)

## แหล่งข้อมูลต้นทางและข้อจำกัดสำคัญ

1. **จุดความร้อน 5 ปี (`hotspots_2022..2026.parquet`, {manifest['meta'].get('total_all', 0):,} จุด):**  
   จาก **GISTDA STAC VIIRS** (`{manifest['meta'].get('min_date')}` ถึง `{manifest['meta'].get('max_date')}`) จับคู่ขอบเขต ปภ. (DDPM) ครบ 100%  
   - *ข้อควรระวัง:* ปี 2022–2023 มีเฉพาะดาวเทียม `N` (Suomi NPP) ส่วนปี 2024–2026 เพิ่ม `N20`/`N21` จึงควรเทียบแนวโน้มข้ามปีด้วย `satellite = 'N'` และช่วง `ม.ค.–ต.ค.` (เพราะ `N` หยุดส่งหลัง `2026-11-01`)
   - ปักธง `is_suspected_static = true` สำหรับพิกัดที่เกิดซ้ำ ≥25 วัน (โรงงาน/เตาเผา/โรงไฟฟ้าชีวมวล)
2. **รอยเผาไหม้ 3 ฤดูฝุ่นแยกชนิดพืช (`tamroypao_burn_tambon.parquet`):**  
   สกัดจากภาพถ่ายดาวเทียม Sentinel-2 ความละเอียด 20 ม. (`MB3A` เกษตร + `MB3F` ป่า, 1 พิกเซล = 0.25 ไร่) ของระบบ **"ตามรอยเผา" (สสน./HII · วช. · ม.เกษตรศาสตร์)** ฤดู 2567–2569 (`2024–2026`)  
   - *ข้อควรระวัง:* ครอบคลุม **62 จังหวัด** (`TH10`–`TH76`) ไม่รวมประจวบคีรีขันธ์ (`77`) และภาคใต้ 14 จังหวัด (`80`–`96`); ข้อมูลเขตป่าต้นทางระบุว่ายังอยู่ระหว่างพัฒนา
3. **รอยเผาไหม้ & พื้นที่เผาซ้ำซาก (`gistda_burn_scar.parquet`, `gistda_burn_freq.parquet`):**  
   จาก **GISTDA** (ครอบคลุม 57 จังหวัดสำหรับ `burn_scar` รอบ พ.ค. 2026 และ 53 จังหวัดสำหรับ `burn_freq` อ้างอิง 4 ปี `2017, 2023–2025`)
4. **สภาพอากาศรายปี & รายเดือนเอื้อไฟ (`era5_annual_2016_2025.parquet`, `era5_monthly_fire_weather.parquet`):**  
   จาก **Open-Meteo ERA5 Reanalysis** (`ECMWF`, `CC-BY-4.0`, 77 จุดกริดศูนย์กลางจังหวัด ปี 2016–2025 รายปี และรายเดือน 2022–พ.ย. 2026 ครบอุณหภูมิสูงสุด ฝน ความชื้นต่ำสุด ลม การระเหยน้ำ ET0 และดัชนีอากาศเอื้อไฟ 0–100)
5. **ความเสี่ยงน้ำท่วมซ้ำ 17 ปี (`hii_flood_risk.parquet`):**  
   จาก **สสน. (HII)** (`data.hii.or.th`, ระดับตำบล, ไม่ครอบคลุมภูเก็ต/ระนองและตำบลนอกบัญชี — ใช้เพื่อการศึกษา/ภายในพร้อมอ้างอิง สสน.)
6. **ขอบเขตการปกครอง (`dim_areas.parquet`):**  
   จาก **กรมป้องกันและบรรเทาสาธารณภัย (ปภ. / DDPM)**

## รายการไฟล์ในชุดข้อมูลนี้ (อัปเดต `{manifest['generated_at']}`)

| ไฟล์ | จำนวนแถว | ขนาด |
|---|---:|---:|
{files_md}

## ตัวอย่างการดึงไปใช้ด้วย DuckDB (Python / CLI / Browser)

```sql
-- อ่านจุดความร้อนจังหวัดเชียงใหม่ ปี 2026 ตรงจาก Hugging Face โดยไม่ต้องโหลดทั้งชุด
SELECT acq_date_th, amphoe_name_th, tambon_name_th, village_name, lu_name, lu_hp_name, frp_mw
FROM 'https://huggingface.co/datasets/{repo_id}/resolve/main/parquet/hotspots_2026.parquet'
WHERE prov_code = '50' AND NOT is_suspected_static
ORDER BY acq_date_th DESC
LIMIT 50;
```
"""


def export_hf_bundle(
    *,
    db_path: Path = DEFAULT_DB_PATH,
    era5_path: Path = DEFAULT_ERA5_PATH,
    tadih_db_path: Path | None = DEFAULT_TADIH_DB_PATH,
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
    finally:
        con.close()

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

    # 7. Map summary gzipped JSON (~5.5 MB for fast web app initial load)
    payload = build_map_payload(db_path=db_path, era5_path=era5_path, tadih_db_path=tadih_db_path)
    raw_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    summary_gz = summary_dir / "map_payload.json.gz"
    with gzip.open(summary_gz, "wb", compresslevel=9) as gz:
        gz.write(raw_json)

    manifest = {
        "schema": "tadih.hotspot5y_hf.v1",
        "repo_id": repo_id,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "meta": payload["meta"],
        "summary_gz": {
            "path": "summary/map_payload.json.gz",
            "bytes": summary_gz.stat().st_size,
            "uncompressed_bytes": len(raw_json),
        },
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
        commit_message="Update Thailand 5-year hotspot Parquet, TamRoyPao burn scar, ERA5 & HII flood dataset",
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
