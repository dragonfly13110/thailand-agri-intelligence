"""Build the nationwide Farm-Fire × Wind × PM2.5 simulation & research page."""

from __future__ import annotations

import argparse
from datetime import date, timedelta
import gzip
from html import escape
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SUBPROJECT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SUBPROJECT_DIR.parent
if str(REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "src"))
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from archive_db import connect_archive  # noqa: E402
from config import DEFAULT_DB_PATH, DEFAULT_HF_REPO, OUT_DIR  # noqa: E402
from map_data import encode_payload_b64  # noqa: E402
from map_template import ATLAS_BOUNDARIES_JS, ATLAS_CHROME_CSS, ATLAS_FONTS, ATLAS_NAV_ITEMS, ATLAS_THEME_CSS, ATLAS_THEME_SCRIPT  # noqa: E402
from tadih.open_meteo import trusted_ssl_context  # noqa: E402
from ui_pages import ATLAS_NAV_CSS  # noqa: E402

DAILY_SIM_START = date(2023, 1, 1)
DAILY_SIM_END = date(2026, 11, 17)
DEFAULT_WIND_CACHE = OUT_DIR / "daily_wind_77prov_2023_2026.json.gz"
DEFAULT_AQ_PARQUET = SUBPROJECT_DIR / "data" / "hf_export" / "parquet" / "air_quality_daily_77prov.parquet"
DEFAULT_ANALYSIS_JSON = OUT_DIR / "farm_fire_pm25_analysis.json"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR4THAI_AQI_URL = "https://air4thai.com/forweb/getAQI_JSON.php"


def _normalize_area_text(text: str) -> str:
    return (
        (text or "")
        .strip()
        .replace("กาฬสินธ์ุ", "กาฬสินธุ์")
        .replace("ประจวบคิรีขันธ์", "ประจวบคีรีขันธ์")
        .replace("กรุงเทพฯ", "กรุงเทพมหานคร")
    )


def _fetch_air4thai_stations(provinces: list[tuple[str, str]]) -> list[list]:
    """Fetch 180 Air4Thai station coordinates mapped to canonical prov_code."""
    name_sorted = sorted(((name, code) for code, name in provinces), key=lambda x: -len(x[0]))
    raw = subprocess.check_output(
        ["curl.exe", "-sSLf", "--max-time", "30", AIR4THAI_AQI_URL],
        stderr=subprocess.PIPE,
    )
    payload = json.loads(raw.decode("utf-8", errors="replace"))
    stations: list[list] = []
    for item in payload.get("stations") or []:
        sid = str(item.get("stationID") or "").strip().lower()
        area = _normalize_area_text(str(item.get("areaTH") or ""))
        try:
            lat = float(item["lat"])
            lon = float(item["long"])
        except (KeyError, TypeError, ValueError):
            continue
        pcode = None
        for pname, code in name_sorted:
            if pname in area:
                pcode = code
                break
        if pcode is None and (sid.startswith("bkp") or "แขวง" in area or "เขต" in area):
            pcode = "10"
        if pcode is None:
            continue
        stations.append([sid, str(item.get("nameTH") or "").strip(), pcode, round(lon, 4), round(lat, 4)])
    stations.sort(key=lambda s: (s[2], s[0]))
    return stations


def _fetch_open_meteo_daily_wind_batch(
    coords: list[tuple[str, float, float]],
    start_str: str,
    end_str: str,
    expected_days: int,
) -> dict[str, dict[str, list[int]]]:
    params = urlencode({
        "latitude": ",".join(f"{lat:.4f}" for _, _, lat in coords),
        "longitude": ",".join(f"{lon:.4f}" for _, lon, _ in coords),
        "start_date": start_str,
        "end_date": end_str,
        "daily": "wind_speed_10m_max,wind_direction_10m_dominant,precipitation_sum",
        "timezone": "Asia/Bangkok",
    })
    url = f"{OPEN_METEO_ARCHIVE_URL}?{params}"
    ctx = trusted_ssl_context()
    waits = (20, 45, 75)
    for attempt, wait in enumerate(waits):
        try:
            req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/3.0", "Accept-Encoding": "gzip"})
            with urlopen(req, timeout=60, context=ctx) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                    raw = gzip.decompress(raw)
                payload = json.loads(raw.decode("utf-8"))
            items = payload if isinstance(payload, list) else [payload]
            if len(items) != len(coords):
                raise ValueError(f"Expected {len(coords)} Open-Meteo items, got {len(items)}")
            out: dict[str, dict[str, list[int]]] = {}
            for (pcode, _, _), item in zip(coords, items):
                dnode = item.get("daily") or {}
                times = dnode.get("time") or []
                if len(times) != expected_days or times[0] != start_str or times[-1] != end_str:
                    raise ValueError(f"Unexpected daily axis for {pcode}: {len(times)} vs {expected_days}")
                ws = [-1 if v is None else int(round(float(v))) for v in dnode["wind_speed_10m_max"]]
                wd = [-1 if v is None else int(round(float(v))) % 360 for v in dnode["wind_direction_10m_dominant"]]
                rn = [-1 if v is None else int(round(float(v) * 10.0)) for v in dnode["precipitation_sum"]]
                out[pcode] = {"ws": ws, "wd": wd, "rain": rn}
            return out
        except HTTPError as exc:
            if attempt == len(waits) - 1:
                raise
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            sleep_s = max(wait, int(retry_after) + 2) if (retry_after and retry_after.isdigit()) else wait
            print(f"Open-Meteo HTTP {exc.code} (batch {coords[0][0]}..), waiting {sleep_s}s...", flush=True)
            time.sleep(sleep_s)
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            if attempt == len(waits) - 1:
                raise
            print(f"Open-Meteo retry ({exc}), waiting {wait}s...", flush=True)
            time.sleep(wait)
    return {}


def ensure_daily_wind_and_stations_cache(
    database: Path,
    cache_path: Path = DEFAULT_WIND_CACHE,
    *,
    force: bool = False,
) -> dict:
    """Fetch & cache 2023-01-01..2026-11-17 daily ERA5 wind/rain + Air4Thai stations."""
    start_str = DAILY_SIM_START.isoformat()
    end_str = DAILY_SIM_END.isoformat()
    expected_days = (DAILY_SIM_END - DAILY_SIM_START).days + 1
    if cache_path.is_file() and not force:
        cached = json.loads(gzip.decompress(cache_path.read_bytes()).decode("utf-8"))
        if (
            cached.get("start_date") == start_str
            and cached.get("end_date") == end_str
            and len(cached.get("wind") or {}) == 77
        ):
            return cached

    with connect_archive(database, read_only=True) as con:
        con.execute("LOAD spatial")
        prov_rows = con.execute("""
            SELECT prov_code, prov_name_th,
                   ST_X(ST_PointOnSurface(geom)), ST_Y(ST_PointOnSurface(geom))
            FROM dim_province
            ORDER BY prov_code
        """).fetchall()
    if len(prov_rows) != 77:
        raise ValueError(f"Expected 77 provinces, got {len(prov_rows)}")

    coords = [(r[0], float(r[2]), float(r[3])) for r in prov_rows]
    wind_map: dict[str, dict[str, list[int]]] = {}
    batch_size = 8
    for i in range(0, len(coords), batch_size):
        batch = coords[i : i + batch_size]
        wind_map.update(_fetch_open_meteo_daily_wind_batch(batch, start_str, end_str, expected_days))
        print(f"  wind batch {len(wind_map)}/77 provinces cached", flush=True)
        if i + batch_size < len(coords):
            time.sleep(6.5)

    stations = _fetch_air4thai_stations([(r[0], r[1]) for r in prov_rows])
    bundle = {
        "start_date": start_str,
        "end_date": end_str,
        "n_days": expected_days,
        "wind": wind_map,
        "stations": stations,
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(gzip.compress(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), compresslevel=9))
    return bundle


def build_daily_sim_payload(
    con,
    provinces: list[tuple],
    *,
    wind_cache: Path = DEFAULT_WIND_CACHE,
    aq_parquet: Path = DEFAULT_AQ_PARQUET,
) -> dict:
    """Build compact multi-year daily fire-cluster, PM2.5, wind & station simulation payload."""
    n_days = (DAILY_SIM_END - DAILY_SIM_START).days + 1
    prov_codes = [row[0] for row in provinces]
    prov_to_idx = {code: idx for idx, code in enumerate(prov_codes)}
    prov_centers = {row[0]: (round(float(row[4]), 3), round(float(row[5]), 3)) for row in provinces}

    # 1. Amphoe catalog (handles both full dim_amphoe and minimal unit-test dim_amphoe)
    amphoe_cols = {r[0] for r in con.execute("DESCRIBE dim_amphoe").fetchall()}
    if {"centroid_lon", "centroid_lat"}.issubset(amphoe_cols):
        amp_rows = con.execute("""
            SELECT amphoe_code, amphoe_name_th, prov_code, centroid_lon, centroid_lat
            FROM dim_amphoe
            ORDER BY amphoe_code
        """).fetchall()
    else:
        amp_rows = con.execute("""
            SELECT a.amphoe_code, a.amphoe_name_th, a.prov_code,
                   ST_X(ST_PointOnSurface(p.geom)), ST_Y(ST_PointOnSurface(p.geom))
            FROM dim_amphoe a
            JOIN dim_province p USING (prov_code)
            ORDER BY a.amphoe_code
        """).fetchall()

    amphoes: list[list] = []
    amp_to_idx: dict[str, int] = {}
    for acode, aname, pcode, lon, lat in amp_rows:
        if pcode not in prov_to_idx:
            continue
        p_idx = prov_to_idx[pcode]
        if lon is None or lat is None:
            lon, lat = prov_centers[pcode]
        amp_to_idx[str(acode)] = len(amphoes)
        amphoes.append([str(acode), str(aname or ""), p_idx, round(float(lon), 3), round(float(lat), 3)])

    # 2. Daily fire clusters by district (2023-01-01..2026-11-17)
    fire_rows = con.execute("""
        SELECT CAST(acq_date_th - DATE '2023-01-01' AS INTEGER) AS day_idx,
               CAST(amphoe_code AS VARCHAR) AS acode,
               CAST(count(*) FILTER (WHERE lu_name = 'พื้นที่เกษตร') AS INTEGER) AS agri,
               CAST(count(*) FILTER (WHERE lu_name IN ('ป่าอนุรักษ์', 'ป่าสงวนแห่งชาติ')) AS INTEGER) AS forest,
               CAST(count(*) FILTER (WHERE lu_name = 'เขต สปก.') AS INTEGER) AS spk,
               CAST(count(*) AS INTEGER) AS tot,
               CAST(count(*) FILTER (WHERE lu_name = 'พื้นที่เกษตร' AND lu_hp_name = 'นาข้าว') AS INTEGER) AS rice,
               CAST(count(*) FILTER (WHERE lu_name = 'พื้นที่เกษตร' AND lu_hp_name = 'อ้อย') AS INTEGER) AS cane,
               CAST(count(*) FILTER (WHERE lu_name = 'พื้นที่เกษตร' AND lu_hp_name LIKE '%ข้าวโพด%') AS INTEGER) AS corn
        FROM hotspots
        WHERE instrument = 'VIIRS'
          AND NOT is_suspected_static
          AND acq_date_th BETWEEN ? AND ?
          AND amphoe_code IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 1, 2
    """, [DAILY_SIM_START, DAILY_SIM_END]).fetchall()

    fires_by_day: dict[str, list[int]] = {}
    for d_idx, acode, agri, forest, spk, tot, rice, cane, corn in fire_rows:
        a_idx = amp_to_idx.get(str(acode))
        if a_idx is None or d_idx < 0 or d_idx >= n_days:
            continue
        other = max(0, int(tot) - int(agri) - int(forest) - int(spk))
        fires_by_day.setdefault(str(int(d_idx)), []).extend(
            [a_idx, agri, forest, spk, other, rice, cane, corn]
        )

    # 3. Daily 77-province PM2.5 (quantized * 10; -1 for missing)
    pm25_mat = [[-1] * n_days for _ in range(77)]
    tables = {r[0] for r in con.execute("SHOW TABLES").fetchall()}
    aq_rows: list[tuple] = []
    if "air_quality_daily_77prov" in tables:
        aq_rows = con.execute("""
            SELECT prov_code, CAST(CAST(date AS DATE) - DATE '2023-01-01' AS INTEGER) AS d_idx, pm25_mean
            FROM air_quality_daily_77prov
            WHERE CAST(date AS DATE) BETWEEN ? AND ?
        """, [DAILY_SIM_START, DAILY_SIM_END]).fetchall()
    elif aq_parquet.is_file():
        pq_sql = "'" + aq_parquet.as_posix().replace("'", "''") + "'"
        aq_rows = con.execute(f"""
            SELECT prov_code, CAST(CAST(date AS DATE) - DATE '2023-01-01' AS INTEGER) AS d_idx, pm25_mean
            FROM read_parquet({pq_sql})
            WHERE CAST(date AS DATE) BETWEEN ? AND ?
        """, [DAILY_SIM_START, DAILY_SIM_END]).fetchall()

    for pcode, d_idx, val in aq_rows:
        p_idx = prov_to_idx.get(str(pcode))
        if p_idx is not None and 0 <= d_idx < n_days and val is not None:
            pm25_mat[p_idx][int(d_idx)] = int(round(float(val) * 10.0))

    # 4. Daily wind & rain + Air4Thai stations from local cache (graceful fallback in unit tests)
    ws_mat = [[-1] * n_days for _ in range(77)]
    wd_mat = [[-1] * n_days for _ in range(77)]
    rain_mat = [[-1] * n_days for _ in range(77)]
    stations_out: list[list] = []

    if wind_cache.is_file():
        w_bundle = json.loads(gzip.decompress(wind_cache.read_bytes()).decode("utf-8"))
        if w_bundle.get("start_date") == DAILY_SIM_START.isoformat() and w_bundle.get("n_days") == n_days:
            w_map = w_bundle.get("wind") or {}
            for p_idx, pcode in enumerate(prov_codes):
                entry = w_map.get(pcode)
                if entry and len(entry.get("ws", [])) == n_days:
                    ws_mat[p_idx] = entry["ws"]
                    wd_mat[p_idx] = entry["wd"]
                    rain_mat[p_idx] = entry["rain"]
            for sid, sname, pcode, slon, slat in w_bundle.get("stations") or []:
                p_idx = prov_to_idx.get(pcode)
                if p_idx is not None:
                    stations_out.append([sid, sname, p_idx, slon, slat])

    return {
        "start_date": DAILY_SIM_START.isoformat(),
        "end_date": DAILY_SIM_END.isoformat(),
        "n_days": n_days,
        "amphoes": amphoes,
        "stations": stations_out,
        "pm25": pm25_mat,
        "ws": ws_mat,
        "wd": wd_mat,
        "rain": rain_mat,
        "fires": fires_by_day,
    }


def build_farm_fire_pm25_payload(
    database: Path,
    analysis_json: Path,
    *,
    wind_cache: Path = DEFAULT_WIND_CACHE,
    aq_parquet: Path = DEFAULT_AQ_PARQUET,
) -> dict:
    """Load 77 simplified province geometries (read-only) and combine with farm-fire PM2.5 + daily sim."""
    analysis = json.loads(Path(analysis_json).read_text(encoding="utf-8"))
    with connect_archive(database, read_only=True) as con:
        con.execute("LOAD spatial")
        provinces = con.execute("""
            WITH reg AS (
                SELECT prov_code, mode(re_royin) AS region
                FROM hotspots
                WHERE prov_code IS NOT NULL AND re_royin IS NOT NULL
                GROUP BY prov_code
            )
            SELECT p.prov_code, p.prov_name_th, coalesce(r.region, ''),
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.geom, 0.004)),
                   ST_X(ST_PointOnSurface(p.geom)), ST_Y(ST_PointOnSurface(p.geom))
            FROM dim_province p
            LEFT JOIN reg r USING (prov_code)
            ORDER BY p.prov_code
        """).fetchall()
        if len(provinces) != 77 or len({row[0] for row in provinces}) != 77:
            raise ValueError(f"Expected 77 unique provinces in dim_province, got {len(provinces)}")
        daily_sim = build_daily_sim_payload(con, provinces, wind_cache=wind_cache, aq_parquet=aq_parquet)

    return {
        "generated_at_utc": analysis.get("generated_at_utc"),
        "methodology": analysis.get("methodology", {}),
        "station_coverage": analysis.get("station_coverage", {}),
        "track1_hourly": analysis.get("track1_hourly", {}),
        "track2_daily": analysis.get("track2_daily", {}),
        "provinces": [
            [code, name, region, json.loads(geometry), round(lon, 4), round(lat, 4)]
            for code, name, region, geometry, lon, lat in provinces
        ],
        "daily_sim_gz": encode_payload_b64(daily_sim),
    }


def write_farm_fire_pm25_page(
    database: Path, analysis_json: Path, output: Path, *, hf_repo: str = DEFAULT_HF_REPO,
) -> None:
    """Render the standalone Farm-Fire × Wind × PM2.5 HTML simulation & report page."""
    template = Path(__file__).with_name("farm_fire_pm25.html").read_text(encoding="utf-8")
    historical_points_script = Path(__file__).with_name("historical_hotspots.js").read_text(encoding="utf-8")
    point_base_url = f"https://huggingface.co/datasets/{hf_repo.strip()}/resolve/main/summary/"
    nav = "\n".join(
        f'<a class="nav-tab" href="./#{page}">{escape(label)}</a>'
        for page, label in ATLAS_NAV_ITEMS
    )
    payload = json.dumps(
        build_farm_fire_pm25_payload(database, analysis_json),
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        template.replace("<!--__FONTS__-->", ATLAS_FONTS)
        .replace("<!--__THEME__-->", ATLAS_THEME_SCRIPT)
        .replace("/*__CSS__*/", "\n".join((ATLAS_THEME_CSS, ATLAS_CHROME_CSS, ATLAS_NAV_CSS)))
        .replace("<!--__NAV__-->", nav)
        .replace("/*__HISTORICAL_HOTSPOTS__*/", historical_points_script)
        .replace("/*__ATLAS_BOUNDARIES__*/", ATLAS_BOUNDARIES_JS)
        .replace("__HOTSPOT_POINT_BASE_URL__", json.dumps(point_base_url).replace("<", "\\u003c"))
        .replace("__FARM_FIRE_DATA__", payload.replace("<", "\\u003c")),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Farm-Fire × Wind × PM2.5 visual simulation page.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="Read-only DuckDB archive")
    parser.add_argument("--analysis", type=Path, default=DEFAULT_ANALYSIS_JSON, help="Analysis JSON path")
    parser.add_argument("--repo", default=DEFAULT_HF_REPO, help="Hugging Face dataset with historical hotspot coordinates")
    parser.add_argument("--out", type=Path, default=SUBPROJECT_DIR / "web_app" / "farm-fire-pm25.html", help="Output HTML")
    parser.add_argument("--refresh-wind", action="store_true", help="Fetch & cache 77-province daily wind/rain + stations")
    args = parser.parse_args()

    cache = ensure_daily_wind_and_stations_cache(args.db, force=args.refresh_wind)
    print(
        f"Wind cache ready -> {DEFAULT_WIND_CACHE} ({DEFAULT_WIND_CACHE.stat().st_size / 1024:.1f} KB, "
        f"{len(cache['wind'])} provs, {len(cache['stations'])} stations)"
    )
    write_farm_fire_pm25_page(args.db, args.analysis, args.out, hf_repo=args.repo)
    print(f"Built page -> {args.out} ({args.out.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
