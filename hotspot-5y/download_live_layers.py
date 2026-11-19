"""Fetch and ingest live/near-real-time layers for Hotspot-5Y:
1. (#6) GISTDA VIIRS 1-day & 7-day recent hotspots (filtered to Thailand & GMS bbox 92..109E, 5..24N)
2. (#7) GISTDA 7-day Drought Risk Index (DRI), Plant Water (NDWI), and Soil Moisture (SMAP) WMS transparent PNG overlays
3. (#9) TMD NWP WRF 7-day daily weather forecast across all 77 Thai provinces (using TMD_NWP_ACCESS_TOKEN)
4. (#3 & #5) Daily PM2.5 exceedance streaks / fire-PM2.5 lag & NASA POWER daily dry-soil consecutive streaks

Usage:
    .venv\\Scripts\\python.exe -X utf8 hotspot-5y/download_live_layers.py
"""

from __future__ import annotations

import concurrent.futures
import json
import math
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
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

RAW_LIVE_DIR = SUBPROJECT_DIR / "data" / "raw" / "live_layers"
WEB_LAYERS_DIR = SUBPROJECT_DIR / "web_app" / "gistda_layers"

GISTDA_WMS_LAYERS = {
    "dri": {
        "layer_id": "6799acce8d739fff9dacee2f",
        "title_th": "ดัชนีเสี่ยงภัยแล้ง GISTDA (DRI · 7 วันล่าสุด)",
        "filename": "dri_7d.png",
    },
    "ndwi": {
        "layer_id": "6799acf27966ebcdded074a8",
        "title_th": "ดัชนีความชื้นพืชและน้ำ GISTDA (NDWI · 7 วันล่าสุด)",
        "filename": "ndwi_7d.png",
    },
    "smap": {
        "layer_id": "6799ace4582fb798d9a87895",
        "title_th": "ความชื้นผิวดินดาวเทียม GISTDA (SMAP · 7 วันล่าสุด)",
        "filename": "smap_7d.png",
    },
}
# Exact Thailand EPSG:3857 & EPSG:4326 bounding box reported by GISTDA Vallaris WMS GetCapabilities
WMS_BBOX_3857 = "10836280.949556718,626330.5447763666,11760115.269946152,2328804.3152620452"
WMS_BBOX_4326 = [97.343968, 5.617402, 105.6429129, 20.470097]

TMD_CONDITION_TH = {
    1: "ท้องฟ้าแจ่มใส",
    2: "มีเมฆบางส่วน",
    3: "มีเมฆเป็นส่วนมาก",
    4: "มีเมฆมาก",
    5: "ฝนตกเล็กน้อย",
    6: "ฝนปานกลาง",
    7: "ฝนตกหนัก",
    8: "ฝนฟ้าคะนอง",
    9: "อากาศหนาวจัด",
    10: "อากาศหนาว",
    11: "อากาศเย็น",
    12: "อากาศร้อนจัด",
}


def _load_dotenv() -> None:
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _compass_th(deg: float | None) -> str:
    if deg is None or not math.isfinite(deg):
        return "-"
    dirs = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"]
    idx = int(round(((deg % 360) / 45.0))) % 8
    return "ลม" + dirs[idx]


def _normalize_country_th(ct_raw: str | None, lat: float, lon: float) -> str:
    s = (ct_raw or "").strip()
    if "ไทย" in s:
        return "Thailand"
    if "เมียน" in s or "พม่า" in s:
        return "Myanmar"
    if "ลาว" in s:
        return "Lao_PDR"
    if "กัมพูชา" in s:
        return "Cambodia"
    if "เวียดนาม" in s:
        return "Vietnam"
    if "มาเลเซีย" in s:
        return "Malaysia"
    return s or "Other"


def fetch_and_ingest_gistda_live_hotspots(con: duckdb.DuckDBPyConnection) -> int:
    """Fetch GISTDA 1-day and 7-day VIIRS hotspots via API Gateway and ingest into DuckDB."""
    RAW_LIVE_DIR.mkdir(parents=True, exist_ok=True)
    gkey = os.environ.get("GISTDA_API_KEY", "").strip()
    cache_file = RAW_LIVE_DIR / "gistda_viirs_7d.json"
    ctx = trusted_ssl_context()

    features_by_window: dict[str, list[dict]] = {"1d": [], "7d": []}
    if gkey:
        for win_tag, ep in [("1d", "1day"), ("7d", "7days")]:
            for bbox_str in ["97.3,5.6,105.7,20.5", "92.0,5.0,109.0,24.0"]:
                url = f"https://api-gateway.gistda.or.th/api/2.0/resources/features/viirs/{ep}?bbox={bbox_str}&limit=1500"
                try:
                    req = Request(url, headers={"API-Key": gkey, "User-Agent": "TADIH-Hotspot5Y/3.0"})
                    with urlopen(req, timeout=20, context=ctx) as resp:
                        j = json.loads(resp.read().decode("utf-8", errors="replace"))
                        feats = j.get("features") or []
                        features_by_window[win_tag].extend(feats)
                except Exception as e:
                    print(f"[GISTDA-VIIRS] {ep} ({bbox_str}) warning: {e}", flush=True)

    if features_by_window["1d"] or features_by_window["7d"]:
        cache_file.write_text(json.dumps(features_by_window, ensure_ascii=False), encoding="utf-8")
    elif cache_file.exists():
        features_by_window = json.loads(cache_file.read_text(encoding="utf-8"))

    # Deduplicate (prefer 1d tag when point appears in both 1d and 7d)
    seen: set[tuple] = set()
    rows: list[dict] = []
    for win_tag in ("1d", "7d"):
        for f in features_by_window.get(win_tag, []):
            coords = (f.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            lon, lat = float(coords[0]), float(coords[1])
            if not (5.0 <= lat <= 24.0 and 92.0 <= lon <= 109.0):
                continue
            p = f.get("properties") or {}
            acq_date = str(p.get("acq_date") or "")[:10]
            acq_time = str(p.get("acq_time") or "").zfill(4)[:4]
            sat = str(p.get("satellite") or "N20").strip()
            dedup_key = (round(lat, 4), round(lon, 4), acq_date, acq_time, sat)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            country = _normalize_country_th(p.get("ct_tn"), lat, lon)
            frp = float(p["frp"]) if p.get("frp") is not None else None
            ti4 = float(p["bright_ti4"]) if p.get("bright_ti4") is not None else None
            conf = str(p.get("confidence") or "nominal").strip().lower()
            rows.append({
                "window_tag": win_tag,
                "acq_date": acq_date,
                "acq_time": acq_time,
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "satellite": sat,
                "confidence": conf,
                "frp_mw": round(frp, 2) if frp is not None else None,
                "bright_ti4": round(ti4, 2) if ti4 is not None else None,
                "country": country,
                "ct_tn": str(p.get("ct_tn") or "").strip() or None,
                "pv_tn": str(p.get("pv_tn") or p.get("changwat") or "").strip() or None,
                "ap_tn": str(p.get("ap_tn") or p.get("amphoe") or "").strip() or None,
                "tb_tn": str(p.get("tb_tn") or p.get("tambon") or "").strip() or None,
                "lu_name": str(p.get("lu_name") or "").strip() or None,
            })

    con.execute("""
        CREATE OR REPLACE TABLE gistda_live_hotspots_7d (
            window_tag VARCHAR,
            acq_date VARCHAR,
            acq_time VARCHAR,
            lat DOUBLE,
            lon DOUBLE,
            satellite VARCHAR,
            confidence VARCHAR,
            frp_mw DOUBLE,
            bright_ti4 DOUBLE,
            country VARCHAR,
            ct_tn VARCHAR,
            pv_tn VARCHAR,
            ap_tn VARCHAR,
            tb_tn VARCHAR,
            lu_name VARCHAR
        )
    """)
    if rows:
        with tempfile.TemporaryDirectory() as tmpdir:
            ndjson = Path(tmpdir) / "live_7d.ndjson"
            with ndjson.open("w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            p_sql = str(ndjson).replace("\\", "/")
            con.execute(f"""
                INSERT INTO gistda_live_hotspots_7d
                SELECT window_tag, acq_date, acq_time, lat, lon, satellite, confidence,
                       frp_mw, bright_ti4, country, ct_tn, pv_tn, ap_tn, tb_tn, lu_name
                FROM read_json('{p_sql}', columns={{
                    window_tag: 'VARCHAR', acq_date: 'VARCHAR', acq_time: 'VARCHAR',
                    lat: 'DOUBLE', lon: 'DOUBLE', satellite: 'VARCHAR', confidence: 'VARCHAR',
                    frp_mw: 'DOUBLE', bright_ti4: 'DOUBLE', country: 'VARCHAR',
                    ct_tn: 'VARCHAR', pv_tn: 'VARCHAR', ap_tn: 'VARCHAR', tb_tn: 'VARCHAR', lu_name: 'VARCHAR'
                }})
            """)
    cnt = con.execute("SELECT count(*) FROM gistda_live_hotspots_7d").fetchone()[0]
    c1d = con.execute("SELECT count(*) FROM gistda_live_hotspots_7d WHERE window_tag='1d'").fetchone()[0]
    th_cnt = con.execute("SELECT count(*) FROM gistda_live_hotspots_7d WHERE country='Thailand'").fetchone()[0]
    print(f"[DuckDB] GISTDA Live 1-7d Hotspots: {cnt:,} points (1d={c1d:,}, Thailand={th_cnt:,})", flush=True)
    return cnt


def fetch_gistda_wms_overlays() -> dict[str, dict]:
    """Download GISTDA 7-day DRI, NDWI, SMAP WMS transparent PNG overlays to web_app/gistda_layers/."""
    RAW_LIVE_DIR.mkdir(parents=True, exist_ok=True)
    WEB_LAYERS_DIR.mkdir(parents=True, exist_ok=True)
    gkey = os.environ.get("GISTDA_API_KEY", "").strip()
    ctx = trusted_ssl_context()
    meta: dict[str, dict] = {}

    for key, info in GISTDA_WMS_LAYERS.items():
        out_png = WEB_LAYERS_DIR / info["filename"]
        raw_png = RAW_LIVE_DIR / info["filename"]
        if gkey:
            url = (
                f"https://api-gateway.gistda.or.th/api/2.0/resources/maps/{key}/7days/wms"
                f"?service=WMS&version=1.1.1&request=GetMap&layers={info['layer_id']}&styles="
                f"&bbox={WMS_BBOX_3857}&width=720&height=1320&srs=EPSG:3857&format=image/png&transparent=true"
            )
            try:
                req = Request(url, headers={"API-Key": gkey, "User-Agent": "TADIH-Hotspot5Y/3.0"})
                with urlopen(req, timeout=25, context=ctx) as resp:
                    data = resp.read()
                    if data[:8] == b"\x89PNG\r\n\x1a\n":
                        out_png.write_bytes(data)
                        raw_png.write_bytes(data)
                        print(f"[WMS] Saved GISTDA 7d {key.upper()} -> {out_png.name} ({len(data) / 1024:.1f} KB)", flush=True)
            except Exception as e:
                print(f"[WMS] Warning fetching {key}: {e}", flush=True)
                if raw_png.exists() and not out_png.exists():
                    out_png.write_bytes(raw_png.read_bytes())

        if out_png.exists():
            meta[key] = {
                "key": key,
                "title_th": info["title_th"],
                "path": f"gistda_layers/{info['filename']}",
                "bytes": out_png.stat().st_size,
                "bbox_4326": WMS_BBOX_4326,
            }
    return meta


def fetch_and_ingest_tmd_wrf_77prov(con: duckdb.DuckDBPyConnection) -> int:
    """Ingest 72-hour TMD NWP WRF 3km forecast across all 77 provinces from tmd_hpc_d02 + TMD NWP API."""
    RAW_LIVE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = RAW_LIVE_DIR / "tmd_wrf_77prov.json"
    rows: list[dict] = []

    # 1. Load 100% 77-province 3km WRF (Domain d02) run from normalized HPC export
    hpc_exports_dir = REPO_ROOT / "data" / "local" / "tmd_nwp_hpc" / "exports"
    hpc_files = sorted(hpc_exports_dir.glob("tmd_hpc_d02_*.json")) if hpc_exports_dir.exists() else []
    if hpc_files:
        hpc_path = hpc_files[-1]
        print(f"[TMD-WRF] Loading 3km WRF d02 export: {hpc_path.name}", flush=True)
        hpc_data = json.loads(hpc_path.read_text(encoding="utf-8"))
        pv_list = hpc_data.get("province_values") or []

        # Group by (province_code, province_name, local_date_ict)
        from datetime import timedelta
        grouped: dict[tuple[str, str, str], dict[str, list[float]]] = {}
        for item in pv_list:
            pcode = str(item.get("province_code") or "").zfill(2)
            pname = str(item.get("province_name") or "").strip()
            v_at = str(item.get("valid_at") or "")
            var = str(item.get("variable") or "")
            val = item.get("value")
            if not pcode or not v_at or val is None:
                continue
            try:
                dt_utc = datetime.fromisoformat(v_at.replace("Z", "+00:00"))
                dt_ict = dt_utc + timedelta(hours=7)
                d_str = dt_ict.strftime("%Y-%m-%d")
            except Exception:
                d_str = v_at[:10]
            g = grouped.setdefault((pcode, pname, d_str), {"t2m": [], "rhum": [], "p1h": [], "p24h": []})
            if var in g:
                g[var].append(float(val))

        for (pcode, pname, d_str), g in sorted(grouped.items()):
            t_vals = g["t2m"]
            rh_vals = g["rhum"]
            p1_vals = g["p1h"]
            p24_vals = g["p24h"]
            if not t_vals and not rh_vals:
                continue
            tmax = max(t_vals) if t_vals else None
            tmin = min(t_vals) if t_vals else None
            rh_min = min(rh_vals) if rh_vals else None
            rh_mean = (sum(rh_vals) / len(rh_vals)) if rh_vals else None
            rain = sum(p1_vals) if p1_vals else (max(p24_vals) if p24_vals else 0.0)

            # Determine Thai weather condition label from WRF rain & temperature
            if rain >= 35.0:
                cond_code, cond_th = 7, "ฝนตกหนัก (WRF 3 กม.)"
            elif rain >= 10.0:
                cond_code, cond_th = 6, "ฝนปานกลาง (WRF 3 กม.)"
            elif rain >= 1.0:
                cond_code, cond_th = 5, "ฝนตกเล็กน้อย (WRF 3 กม.)"
            elif (tmax or 30.0) >= 36.5:
                cond_code, cond_th = 12, "อากาศร้อนจัด (WRF 3 กม.)"
            elif (rh_mean or 60.0) < 52.0:
                cond_code, cond_th = 1, "ท้องฟ้าโปร่ง/อากาศแห้ง (WRF 3 กม.)"
            else:
                cond_code, cond_th = 2, "มีเมฆบางส่วน (WRF 3 กม.)"

            # Compute FWI (0-100) using daytime minimum RH (or mean RH) + Tmax + Rain
            rh_eff = rh_min if rh_min is not None else (rh_mean if rh_mean is not None else 60.0)
            t_s = max(0.0, min(1.0, ((tmax if tmax is not None else 30.0) - 26.0) / 14.0))
            rh_s = max(0.0, min(1.0, (75.0 - rh_eff) / 50.0))
            dry_s = 1.0 if rain < 1.0 else (0.4 if rain < 5.0 else 0.0)
            fwi = round(100.0 * (0.40 * t_s + 0.40 * rh_s + 0.20 * dry_s), 1)

            rows.append({
                "prov_code": pcode,
                "prov_name_th": pname,
                "forecast_date": d_str,
                "tc_max": round(tmax, 2) if tmax is not None else None,
                "tc_min": round(tmin, 2) if tmin is not None else None,
                "rh_pct": round(rh_mean, 1) if rh_mean is not None else None,
                "rain_mm": round(rain, 1),
                "ws10m_ms": None,
                "ws10m_kmh": None,
                "wd10m_deg": None,
                "wind_dir_th": "WRF-d02 (3 กม.)",
                "cond_code": cond_code,
                "cond_label_th": cond_th,
                "fwi_tmd": fwi,
            })

    if rows:
        rows.sort(key=lambda r: (r["prov_code"], r["forecast_date"]))
        cache_file.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    elif cache_file.exists():
        rows = json.loads(cache_file.read_text(encoding="utf-8"))

    con.execute("""
        CREATE OR REPLACE TABLE tmd_wrf_forecast_77prov (
            prov_code VARCHAR,
            prov_name_th VARCHAR,
            forecast_date VARCHAR,
            tc_max DOUBLE,
            tc_min DOUBLE,
            rh_pct DOUBLE,
            rain_mm DOUBLE,
            ws10m_ms DOUBLE,
            ws10m_kmh DOUBLE,
            wd10m_deg DOUBLE,
            wind_dir_th VARCHAR,
            cond_code INTEGER,
            cond_label_th VARCHAR,
            fwi_tmd DOUBLE
        )
    """)
    if rows:
        with tempfile.TemporaryDirectory() as tmpdir:
            ndjson = Path(tmpdir) / "tmd_wrf.ndjson"
            with ndjson.open("w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            p_sql = str(ndjson).replace("\\", "/")
            con.execute(f"""
                INSERT INTO tmd_wrf_forecast_77prov
                SELECT prov_code, prov_name_th, forecast_date, tc_max, tc_min, rh_pct, rain_mm,
                       ws10m_ms, ws10m_kmh, wd10m_deg, wind_dir_th, cond_code, cond_label_th, fwi_tmd
                FROM read_json('{p_sql}', columns={{
                    prov_code: 'VARCHAR', prov_name_th: 'VARCHAR', forecast_date: 'VARCHAR',
                    tc_max: 'DOUBLE', tc_min: 'DOUBLE', rh_pct: 'DOUBLE', rain_mm: 'DOUBLE',
                    ws10m_ms: 'DOUBLE', ws10m_kmh: 'DOUBLE', wd10m_deg: 'DOUBLE',
                    wind_dir_th: 'VARCHAR', cond_code: 'INTEGER', cond_label_th: 'VARCHAR', fwi_tmd: 'DOUBLE'
                }})
            """)
    cnt = con.execute("SELECT count(*) FROM tmd_wrf_forecast_77prov").fetchone()[0]
    p_cnt = con.execute("SELECT count(DISTINCT prov_code) FROM tmd_wrf_forecast_77prov").fetchone()[0]
    print(f"[DuckDB] TMD WRF 3km Forecast: {cnt:,} rows across {p_cnt} provinces", flush=True)
    return cnt


def main() -> None:
    _load_dotenv()
    fetch_gistda_wms_overlays()
    con = duckdb.connect(str(DEFAULT_DB_PATH))
    try:
        fetch_and_ingest_gistda_live_hotspots(con)
        fetch_and_ingest_tmd_wrf_77prov(con)
    finally:
        con.close()


if __name__ == "__main__":
    main()
