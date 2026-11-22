"""Nationwide farm-fire hotspot x PM2.5 station x hourly wind direction analysis (77 provinces).

Combines:
1. Track 1 (2026-09-01..2026-11-17): Hourly Air4Thai station PM2.5 + wind (180 stations) paired with
   active VIIRS hotspots (N, N20, N21; plus Suomi-N sensitivity <= 2026-11-01) and ERA5 hourly wind.
2. Track 2 (2024-01-01..2026-06-30): Official Air4Thai daily station PM2.5 archives paired with
   ERA5 hourly wind transport, Thai VIIRS-N hotspots (with all-VIIRS confounder check), and
   2024-2025 GMS neighbor transboundary FIRMS smoke separation.

Zero-bloat guarantee:
- Reads hotspot_5y.duckdb strictly in read_only=True mode (0 DuckDB writes, 0 D1 writes).
- Stores temporary Parquet downloads only inside TemporaryDirectory (deleted immediately).
- Emits only compact reports (<500 KB total) in hotspot-5y/data/output/.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
from datetime import date, datetime, timedelta, timezone
import gzip
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
import zipfile

import duckdb
import numpy as np

SUBPROJECT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SUBPROJECT_DIR.parent
if str(REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "src"))
if str(SUBPROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(SUBPROJECT_DIR))

from config import DEFAULT_DB_PATH, OUT_DIR  # noqa: E402
from tadih.open_meteo import trusted_ssl_context  # noqa: E402

AIR4THAI_AQI_URL = "https://air4thai.com/forweb/getAQI_JSON.php"
AIR4THAI_HIST_URL = "https://air4thai.com/forweb/getHistoryData.php"
AIR4THAI_XLSX_TPL = "https://air4thai.net/daily_download/PM2.5/{year}.xlsx"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HF_TRANSBOUNDARY_TPL = (
    "https://huggingface.co/datasets/dragonfly13110/thailand-hotspot-5y/resolve/main/"
    "parquet/transboundary_firms_{year}.parquet"
)

TRACK1_START = date(2026, 9, 1)
TRACK1_END = date(2026, 11, 17)
TRACK2_START = date(2024, 1, 1)
TRACK2_END = date(2026, 6, 30)
ERA5_START = date(2023, 12, 30)
ERA5_END = date(2026, 11, 18)

AGRI_RADIUS_KM = 50.0
SPK_RADIUS_KM = 50.0
FOREST_RADIUS_KM = 80.0
TRANSBOUNDARY_RADIUS_KM = 250.0

UPWIND_CONE_DEG = 30.0
CONFOUNDER_CONE_DEG = 45.0
NON_UPWIND_MIN_DEG = 90.0
MIN_WIND_KMH = 3.6  # 1.0 m/s

MIN_HOURLY_VALID_HOURS = 240
MIN_HOURLY_CLEAN_EVENTS = 10
MIN_DAILY_VALID_DAYS = 60
MIN_DAILY_CLEAN_DAYS = 10

REGIONS_ORDER = ("North", "Northeast", "Central", "East", "West", "South")
REGION_TH = {
    "North": "ภาคเหนือ",
    "Northeast": "ภาคตะวันออกเฉียงเหนือ",
    "Central": "ภาคกลาง",
    "East": "ภาคตะวันออก",
    "West": "ภาคตะวันตก",
    "South": "ภาคใต้",
    "National": "ทั่วประเทศ",
}

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1, lon1, lat2, lon2):
    """Vectorized great-circle distance in kilometers (WGS84 sphere approximation)."""
    lat1_r = np.radians(lat1)
    lon1_r = np.radians(lon1)
    lat2_r = np.radians(lat2)
    lon2_r = np.radians(lon2)
    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r
    a = np.sin(dlat * 0.5) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * (np.sin(dlon * 0.5) ** 2)
    return 2.0 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def bearing_deg(lat1, lon1, lat2, lon2):
    """Initial great-circle azimuth from point 1 (station) to point 2 (fire) in [0, 360)."""
    lat1_r = np.radians(lat1)
    lat2_r = np.radians(lat2)
    dlon_r = np.radians(lon2 - lon1)
    y = np.sin(dlon_r) * np.cos(lat2_r)
    x = np.cos(lat1_r) * np.sin(lat2_r) - np.sin(lat1_r) * np.cos(lat2_r) * np.cos(dlon_r)
    return (np.degrees(np.arctan2(y, x)) + 360.0) % 360.0


def angular_diff_deg(a, b):
    """Minimal circular difference in degrees in [0, 180]."""
    return np.abs((a - b + 180.0) % 360.0 - 180.0)


def classify_wind_plume(
    bearing_s_to_f: float,
    wd_from: float,
    ws_kmh: float,
    *,
    upwind_cone: float = UPWIND_CONE_DEG,
    non_upwind_min: float = NON_UPWIND_MIN_DEG,
    min_ws: float = MIN_WIND_KMH,
) -> str:
    """Classify plume direction using meteorological WD (direction wind blows FROM)."""
    if (
        bearing_s_to_f is None
        or wd_from is None
        or ws_kmh is None
        or not (math.isfinite(bearing_s_to_f) and math.isfinite(wd_from) and math.isfinite(ws_kmh))
        or ws_kmh < min_ws
    ):
        return "calm_or_missing"
    diff = float(angular_diff_deg(bearing_s_to_f, wd_from))
    if diff <= upwind_cone:
        return "upwind"
    if diff >= non_upwind_min:
        return "non_upwind"
    return "crosswind"


def clean_air4thai_value(val, *, max_valid: float = 1000.0) -> float:
    """Convert Air4Thai sentinels (-1, -999, blanks, out-of-range) into np.nan."""
    if val is None or isinstance(val, bool):
        return float("nan")
    if isinstance(val, str):
        s = val.strip()
        if not s or s.upper() in ("N/A", "NA", "NULL", "NONE", "-"):
            return float("nan")
        try:
            num = float(s)
        except ValueError:
            return float("nan")
    else:
        try:
            num = float(val)
        except (TypeError, ValueError):
            return float("nan")
    if not math.isfinite(num) or num < 0.0 or num > max_valid:
        return float("nan")
    return num


def _col_ref_to_idx(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha()).upper()
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def parse_air4thai_daily_xlsx(raw_bytes: bytes) -> tuple[list[date], list[str], np.ndarray]:
    """Parse Air4Thai annual PM2.5 Excel (DATA sheet) purely in RAM via stdlib."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            sst = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in sst.findall(".//m:si", ns):
                shared_strings.append("".join(t.text or "" for t in si.iter() if t.tag.endswith("t")))

        sheet_target = "xl/worksheets/sheet1.xml"
        if "xl/workbook.xml" in zf.namelist() and "xl/_rels/workbook.xml.rels" in zf.namelist():
            wb_xml = ET.fromstring(zf.read("xl/workbook.xml"))
            rels_xml = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
            rel_map = {el.attrib.get("Id"): el.attrib.get("Target") for el in rels_xml}
            for sh in wb_xml.findall(".//m:sheet", ns):
                if sh.attrib.get("name", "").strip().upper() == "DATA":
                    rid = next((v for k, v in sh.attrib.items() if k.endswith("id")), None)
                    if rid and rid in rel_map:
                        target = rel_map[rid].lstrip("/")
                        sheet_target = target if target.startswith("xl/") else f"xl/{target}"
                    break

        ws = ET.fromstring(zf.read(sheet_target))

    def _cell_text(cell) -> str:
        ctype = cell.attrib.get("t", "")
        if ctype == "inlineStr":
            return "".join(t.text or "" for t in cell.iter() if t.tag.endswith("t")).strip()
        v = cell.find("m:v", ns)
        if v is None or v.text is None:
            return ""
        if ctype == "s":
            idx = int(v.text)
            return shared_strings[idx].strip() if 0 <= idx < len(shared_strings) else ""
        return v.text.strip()

    rows = ws.findall(".//m:sheetData/m:row", ns)
    if not rows:
        return [], [], np.empty((0, 0), dtype=np.float32)

    header_cells: dict[int, str] = {}
    for cell in rows[0].findall("m:c", ns):
        ref = cell.attrib.get("r", "")
        if ref:
            header_cells[_col_ref_to_idx(ref)] = _cell_text(cell)
    if not header_cells:
        return [], [], np.empty((0, 0), dtype=np.float32)

    max_col = max(header_cells.keys())
    col_to_station: dict[int, int] = {}
    station_ids: list[str] = []
    for col_idx in range(1, max_col + 1):
        sid = header_cells.get(col_idx, "").strip().lower()
        if sid:
            col_to_station[col_idx] = len(station_ids)
            station_ids.append(sid)

    dates: list[date] = []
    matrix_rows: list[list[float]] = []
    excel_epoch = date(1899, 12, 30)

    for row in rows[1:]:
        cells = row.findall("m:c", ns)
        if not cells:
            continue
        raw_vals: dict[int, str] = {}
        for cell in cells:
            ref = cell.attrib.get("r", "")
            if ref:
                raw_vals[_col_ref_to_idx(ref)] = _cell_text(cell)
        d_raw = raw_vals.get(0, "")
        if not d_raw:
            continue
        parsed_day: date | None = None
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d_raw):
            parsed_day = date.fromisoformat(d_raw)
        else:
            try:
                serial = float(d_raw)
            except ValueError:
                serial = -1.0
            if 44000.0 <= serial <= 55000.0:
                parsed_day = excel_epoch + timedelta(days=int(round(serial)))
        if parsed_day is None:
            continue

        row_arr = [float("nan")] * len(station_ids)
        for col_idx, st_pos in col_to_station.items():
            if col_idx in raw_vals:
                row_arr[st_pos] = clean_air4thai_value(raw_vals[col_idx])
        dates.append(parsed_day)
        matrix_rows.append(row_arr)

    if not dates:
        return [], station_ids, np.empty((0, len(station_ids)), dtype=np.float32)
    return dates, station_ids, np.asarray(matrix_rows, dtype=np.float32)


def _solve_ridge(XtX: np.ndarray, Xty: np.ndarray, reg: float = 1e-8) -> np.ndarray:
    p = XtX.shape[0]
    mat = XtX + reg * np.eye(p, dtype=np.float64)
    try:
        return np.linalg.solve(mat, Xty)
    except np.linalg.LinAlgError:
        return np.linalg.lstsq(mat, Xty, rcond=None)[0]


def within_fe_ols_with_block_bootstrap(
    y: np.ndarray,
    X: np.ndarray,
    group_ids: np.ndarray,
    week_ids: np.ndarray,
    *,
    n_boot: int = 1000,
    seed: int = 2026,
) -> dict:
    """Within-group demeaned OLS with precomputed week blocks for fast block-bootstrap 95% CIs."""
    y = np.asarray(y, dtype=np.float64)
    X = np.asarray(X, dtype=np.float64)
    group_ids = np.asarray(group_ids)
    week_ids = np.asarray(week_ids)

    valid = np.isfinite(y) & np.all(np.isfinite(X), axis=1)
    y, X, group_ids, week_ids = y[valid], X[valid], group_ids[valid], week_ids[valid]
    p = X.shape[1] if X.ndim == 2 else 0
    if len(y) < max(20, p + 5):
        return {
            "n_obs": int(len(y)),
            "n_groups": 0,
            "n_weeks": 0,
            "beta": [None] * p,
            "ci_low": [None] * p,
            "ci_high": [None] * p,
        }

    _, g_inv, g_counts = np.unique(group_ids, return_inverse=True, return_counts=True)
    keep = g_counts[g_inv] >= 2
    y, X, g_raw, week_ids = y[keep], X[keep], group_ids[keep], week_ids[keep]
    if len(y) < max(20, p + 5):
        return {
            "n_obs": int(len(y)),
            "n_groups": 0,
            "n_weeks": 0,
            "beta": [None] * p,
            "ci_low": [None] * p,
            "ci_high": [None] * p,
        }

    _, g_inv, g_counts = np.unique(g_raw, return_inverse=True, return_counts=True)
    n_groups = int(len(g_counts))
    y_mean = np.bincount(g_inv, weights=y, minlength=n_groups) / g_counts
    yd = y - y_mean[g_inv]
    Xd = np.empty_like(X)
    for j in range(p):
        col_mean = np.bincount(g_inv, weights=X[:, j], minlength=n_groups) / g_counts
        Xd[:, j] = X[:, j] - col_mean[g_inv]

    XtX_full = Xd.T @ Xd
    Xty_full = Xd.T @ yd
    beta = _solve_ridge(XtX_full, Xty_full)

    _, w_inv = np.unique(week_ids, return_inverse=True)
    n_weeks = int(w_inv.max() + 1) if len(w_inv) else 0
    if n_weeks < 2:
        return {
            "n_obs": int(len(y)),
            "n_groups": n_groups,
            "n_weeks": n_weeks,
            "beta": [_safe_round(v, 4) for v in beta],
            "ci_low": [None] * p,
            "ci_high": [None] * p,
        }

    order = np.argsort(w_inv, kind="stable")
    w_sorted = w_inv[order]
    Xd_s = Xd[order]
    yd_s = yd[order]
    splits = np.flatnonzero(np.diff(w_sorted)) + 1
    bounds = np.concatenate(([0], splits, [len(w_sorted)]))

    xtx_blocks = np.zeros((n_weeks, p, p), dtype=np.float64)
    xty_blocks = np.zeros((n_weeks, p), dtype=np.float64)
    for wi in range(n_weeks):
        s, e = bounds[wi], bounds[wi + 1]
        xb = Xd_s[s:e]
        yb = yd_s[s:e]
        xtx_blocks[wi] = xb.T @ xb
        xty_blocks[wi] = xb.T @ yb

    rng = np.random.default_rng(seed)
    boot_betas = np.empty((n_boot, p), dtype=np.float64)
    eye_reg = 1e-8 * np.eye(p, dtype=np.float64)
    for b in range(n_boot):
        draw = rng.integers(0, n_weeks, size=n_weeks)
        counts = np.bincount(draw, minlength=n_weeks).astype(np.float64)
        xtx_b = np.tensordot(counts, xtx_blocks, axes=(0, 0)) + eye_reg
        xty_b = counts @ xty_blocks
        try:
            boot_betas[b] = np.linalg.solve(xtx_b, xty_b)
        except np.linalg.LinAlgError:
            boot_betas[b] = np.linalg.lstsq(xtx_b, xty_b, rcond=None)[0]

    q_lo = np.quantile(boot_betas, 0.025, axis=0)
    q_hi = np.quantile(boot_betas, 0.975, axis=0)
    return {
        "n_obs": int(len(y)),
        "n_groups": n_groups,
        "n_weeks": n_weeks,
        "beta": [_safe_round(v, 4) for v in beta],
        "ci_low": [_safe_round(v, 4) for v in q_lo],
        "ci_high": [_safe_round(v, 4) for v in q_hi],
    }


def mean_diff_block_bootstrap(
    vals_a: np.ndarray,
    weeks_a: np.ndarray,
    vals_b: np.ndarray,
    weeks_b: np.ndarray,
    *,
    n_boot: int = 1000,
    seed: int = 2026,
) -> dict:
    """Compute mean(A) - mean(B) and 95% weekly block-bootstrap CI."""
    va = np.asarray(vals_a, dtype=np.float64)
    wa = np.asarray(weeks_a, dtype=np.int64)
    vb = np.asarray(vals_b, dtype=np.float64)
    wb = np.asarray(weeks_b, dtype=np.int64)

    ma = np.isfinite(va)
    mb = np.isfinite(vb)
    va, wa = va[ma], wa[ma]
    vb, wb = vb[mb], wb[mb]

    if len(va) == 0 or len(vb) == 0:
        return {
            "n_a": int(len(va)),
            "n_b": int(len(vb)),
            "mean_a": _safe_round(float(va.mean()), 3) if len(va) else None,
            "mean_b": _safe_round(float(vb.mean()), 3) if len(vb) else None,
            "delta": None,
            "ci_low": None,
            "ci_high": None,
        }

    mean_a = float(va.mean())
    mean_b = float(vb.mean())
    delta = mean_a - mean_b

    all_weeks = np.unique(np.concatenate([wa, wb]))
    n_w = len(all_weeks)
    if n_w < 2:
        return {
            "n_a": int(len(va)),
            "n_b": int(len(vb)),
            "mean_a": _safe_round(mean_a, 3),
            "mean_b": _safe_round(mean_b, 3),
            "delta": _safe_round(delta, 3),
            "ci_low": None,
            "ci_high": None,
        }

    ia = np.searchsorted(all_weeks, wa)
    ib = np.searchsorted(all_weeks, wb)
    sum_a = np.bincount(ia, weights=va, minlength=n_w)
    cnt_a = np.bincount(ia, minlength=n_w).astype(np.float64)
    sum_b = np.bincount(ib, weights=vb, minlength=n_w)
    cnt_b = np.bincount(ib, minlength=n_w).astype(np.float64)

    rng = np.random.default_rng(seed)
    draws = rng.integers(0, n_w, size=(n_boot, n_w))
    tot_sa = sum_a[draws].sum(axis=1)
    tot_ca = cnt_a[draws].sum(axis=1)
    tot_sb = sum_b[draws].sum(axis=1)
    tot_cb = cnt_b[draws].sum(axis=1)
    ok = (tot_ca > 0) & (tot_cb > 0)
    if ok.sum() < 20:
        ci_low, ci_high = None, None
    else:
        diffs = (tot_sa[ok] / tot_ca[ok]) - (tot_sb[ok] / tot_cb[ok])
        ci_low = _safe_round(float(np.quantile(diffs, 0.025)), 3)
        ci_high = _safe_round(float(np.quantile(diffs, 0.975)), 3)

    return {
        "n_a": int(len(va)),
        "n_b": int(len(vb)),
        "mean_a": _safe_round(mean_a, 3),
        "mean_b": _safe_round(mean_b, 3),
        "delta": _safe_round(delta, 3),
        "ci_low": ci_low,
        "ci_high": ci_high,
    }


def evaluate_sufficiency_status(
    *,
    stations_in_prov: int,
    valid_obs: int,
    clean_events: int,
    total_agri_events: int,
    min_valid_obs: int,
    min_clean_events: int,
) -> str:
    """Determine explicit sufficiency status without fabricating estimates."""
    if stations_in_prov == 0 and valid_obs == 0:
        return "insufficient_no_station"
    if valid_obs < min_valid_obs:
        return "insufficient_valid_obs"
    if clean_events < min_clean_events:
        if total_agri_events >= min_clean_events:
            return "insufficient_confounded"
        return "insufficient_clean_events"
    return "sufficient" if stations_in_prov > 0 else "sufficient_cross_province"


def _safe_round(val: float | None, digits: int = 3) -> float | None:
    if val is None:
        return None
    f = float(val)
    if not math.isfinite(f):
        return None
    return round(f, digits)


def _curl_bytes(url: str, *, timeout: int = 45, retries: int = 4) -> bytes:
    """Fetch HTTPS URL via Windows SChannel-verified curl.exe with polite retry."""
    backoff = (3, 8, 18, 30)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            return subprocess.check_output(
                ["curl.exe", "-sSLf", "--max-time", str(timeout), url],
                stderr=subprocess.PIPE,
            )
        except subprocess.CalledProcessError as exc:
            last_err = RuntimeError(
                f"curl failed ({exc.returncode}) for {url}: {exc.stderr.decode('utf-8', 'replace')[:200]}"
            )
            if attempt < retries - 1:
                time.sleep(backoff[min(attempt, len(backoff) - 1)])
    raise last_err  # type: ignore[misc]


def _normalize_area_text(text: str) -> str:
    s = (text or "").strip()
    s = s.replace("กาฬสินธ์ุ", "กาฬสินธุ์")
    s = s.replace("ประจวบคิรีขันธ์", "ประจวบคีรีขันธ์")
    s = s.replace("กรุงเทพฯ", "กรุงเทพมหานคร")
    return s


def load_dimensions_and_stations(db_path: Path) -> tuple[list[dict], dict[str, str], list[dict]]:
    """Load 77 provinces, Royin regions, and 180 Air4Thai stations mapped to canonical prov_codes."""
    with duckdb.connect(str(db_path), read_only=True) as con:
        prov_rows = con.execute("""
            WITH reg AS (
                SELECT prov_code, mode(re_royin) AS region
                FROM hotspots
                WHERE prov_code IS NOT NULL AND re_royin IS NOT NULL
                GROUP BY prov_code
            )
            SELECT p.prov_code, p.prov_name_th, p.prov_name_en,
                   (p.min_lat + p.max_lat) * 0.5 AS c_lat,
                   (p.min_lon + p.max_lon) * 0.5 AS c_lon,
                   r.region
            FROM dim_province p
            JOIN reg r USING (prov_code)
            ORDER BY p.prov_code
        """).fetchall()

    provinces = [
        {
            "prov_code": r[0],
            "prov_name_th": r[1],
            "prov_name_en": r[2],
            "c_lat": float(r[3]),
            "c_lon": float(r[4]),
            "region": r[5],
        }
        for r in prov_rows
    ]
    if len(provinces) != 77:
        raise ValueError(f"Expected 77 provinces in dim_province, got {len(provinces)}")
    prov_region = {p["prov_code"]: p["region"] for p in provinces}
    name_sorted = sorted(((p["prov_name_th"], p["prov_code"]) for p in provinces), key=lambda x: -len(x[0]))

    raw = _curl_bytes(AIR4THAI_AQI_URL, timeout=30)
    payload = json.loads(raw.decode("utf-8", errors="replace"))
    stations_raw = payload.get("stations") or []
    stations: list[dict] = []
    unmapped: list[tuple[str, str]] = []
    for item in stations_raw:
        sid = str(item.get("stationID") or "").strip().lower()
        area = _normalize_area_text(str(item.get("areaTH") or ""))
        lat = float(item["lat"])
        lon = float(item["long"])
        pcode = None
        for pname, code in name_sorted:
            if pname in area:
                pcode = code
                break
        if pcode is None and (sid.startswith("bkp") or "แขวง" in area or "เขต" in area):
            pcode = "10"
        if pcode is None:
            unmapped.append((sid, str(item.get("areaTH") or "")))
            continue
        stations.append({
            "station_id": sid,
            "name_th": str(item.get("nameTH") or "").strip(),
            "area_th": str(item.get("areaTH") or "").strip(),
            "station_type": str(item.get("stationType") or "").strip(),
            "prov_code": pcode,
            "region": prov_region[pcode],
            "lat": lat,
            "lon": lon,
        })
    if unmapped:
        raise ValueError(f"Unmapped Air4Thai stations ({len(unmapped)}): {unmapped[:5]}")
    stations.sort(key=lambda s: (s["prov_code"], s["station_id"]))
    return provinces, prov_region, stations


def fetch_air4thai_hourly(stations: list[dict], start: date, end: date) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fetch hourly PM25, WS (m/s), WD (deg) across all stations."""
    n_stations = len(stations)
    n_hours = ((end - start).days + 1) * 24
    pm25 = np.full((n_stations, n_hours), np.nan, dtype=np.float32)
    ws_ms = np.full((n_stations, n_hours), np.nan, dtype=np.float32)
    wd_deg = np.full((n_stations, n_hours), np.nan, dtype=np.float32)

    st_idx_by_id = {s["station_id"]: i for i, s in enumerate(stations)}
    t_epoch = datetime(start.year, start.month, start.day, 0, 0)

    def _fetch_batch(batch_ids: list[str]) -> list[dict]:
        query = urlencode({
            "stationID": ",".join(batch_ids),
            "param": "PM25,WS,WD",
            "type": "hr",
            "sdate": start.isoformat(),
            "edate": end.isoformat(),
            "stime": "00",
            "etime": "23",
        })
        raw = _curl_bytes(f"{AIR4THAI_HIST_URL}?{query}", timeout=45, retries=3)
        data = json.loads(raw.decode("utf-8", errors="replace"))
        return data.get("stations") or []

    all_ids = [s["station_id"] for s in stations]
    batch_size = 10
    for i in range(0, len(all_ids), batch_size):
        batch = all_ids[i : i + batch_size]
        try:
            st_list = _fetch_batch(batch)
        except Exception:
            st_list = []
            for sid in batch:
                st_list.extend(_fetch_batch([sid]))
        for st_obj in st_list:
            sid = str(st_obj.get("stationID") or "").strip().lower()
            s_idx = st_idx_by_id.get(sid)
            if s_idx is None:
                continue
            for rec in st_obj.get("data") or []:
                ts_str = str(rec.get("DATETIMEDATA") or "").strip()
                if len(ts_str) < 13:
                    continue
                try:
                    dt = datetime.strptime(ts_str[:13], "%Y-%m-%d %H")
                except ValueError:
                    continue
                h_idx = int((dt - t_epoch).total_seconds() // 3600)
                if 0 <= h_idx < n_hours:
                    pm25[s_idx, h_idx] = clean_air4thai_value(rec.get("PM25"), max_valid=1000.0)
                    ws_val = clean_air4thai_value(rec.get("WS"), max_valid=100.0)
                    wd_val = clean_air4thai_value(rec.get("WD"), max_valid=360.0)
                    ws_ms[s_idx, h_idx] = ws_val
                    wd_deg[s_idx, h_idx] = wd_val
        time.sleep(0.15)
    return pm25, ws_ms, wd_deg


def fetch_air4thai_daily_archive(
    stations: list[dict],
    start: date,
    end: date,
) -> tuple[np.ndarray, dict]:
    """Fetch official Air4Thai 2024-2026 daily PM2.5 Excel workbooks purely in RAM."""
    n_stations = len(stations)
    n_days = (end - start).days + 1
    daily_pm25 = np.full((n_stations, n_days), np.nan, dtype=np.float32)
    st_idx_by_id = {s["station_id"]: i for i, s in enumerate(stations)}

    unmapped_cols: dict[int, list[str]] = {}
    matched_cols_by_yr: dict[int, int] = {}
    for yr in (2024, 2025, 2026):
        raw = _curl_bytes(AIR4THAI_XLSX_TPL.format(year=yr), timeout=60, retries=4)
        dates, col_ids, mat = parse_air4thai_daily_xlsx(raw)
        matched = [c for c in col_ids if c in st_idx_by_id]
        unmapped = [c for c in col_ids if c not in st_idx_by_id]
        matched_cols_by_yr[yr] = len(matched)
        unmapped_cols[yr] = unmapped
        col_map = [(j, st_idx_by_id[c]) for j, c in enumerate(col_ids) if c in st_idx_by_id]
        for r_idx, d_val in enumerate(dates):
            if start <= d_val <= end:
                d_pos = (d_val - start).days
                for src_j, dst_i in col_map:
                    val = mat[r_idx, src_j]
                    if np.isfinite(val):
                        daily_pm25[dst_i, d_pos] = val
    meta = {
        "matched_station_cols_by_year": matched_cols_by_yr,
        "unmapped_daily_xlsx_stations": sorted({c for cols in unmapped_cols.values() for c in cols}),
        "unmapped_by_year": unmapped_cols,
    }
    return daily_pm25, meta


def fetch_era5_hourly_for_stations(
    stations: list[dict],
    start: date,
    end: date,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Fetch Open-Meteo ERA5 hourly wind/rain/BLH deduplicated to unique 0.25-deg grid cells."""
    cells: list[tuple[float, float]] = []
    cell_idx_by_coord: dict[tuple[float, float], int] = {}
    station_cell_idx = np.empty(len(stations), dtype=np.int32)
    for i, st in enumerate(stations):
        key = (round(st["lat"] * 4.0) / 4.0, round(st["lon"] * 4.0) / 4.0)
        if key not in cell_idx_by_coord:
            cell_idx_by_coord[key] = len(cells)
            cells.append(key)
        station_cell_idx[i] = cell_idx_by_coord[key]

    n_cells = len(cells)
    n_hours = ((end - start).days + 1) * 24
    ws_kmh = np.full((n_cells, n_hours), np.nan, dtype=np.float32)
    wd_deg = np.full((n_cells, n_hours), np.nan, dtype=np.float32)
    rain_mm = np.full((n_cells, n_hours), np.nan, dtype=np.float32)
    blh_m = np.full((n_cells, n_hours), np.nan, dtype=np.float32)

    ctx = trusted_ssl_context()
    expected_first = f"{start.isoformat()}T00:00"
    expected_last = f"{end.isoformat()}T23:00"

    def _fetch_batch(batch_indices: list[int]) -> None:
        params = urlencode({
            "latitude": ",".join(f"{cells[idx][0]:.2f}" for idx in batch_indices),
            "longitude": ",".join(f"{cells[idx][1]:.2f}" for idx in batch_indices),
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "hourly": "wind_speed_10m,wind_direction_10m,precipitation,boundary_layer_height",
            "timezone": "Asia/Bangkok",
        })
        url = f"{OPEN_METEO_ARCHIVE_URL}?{params}"
        waits = (10, 25, 45)
        for attempt, wait in enumerate(waits):
            try:
                req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/3.0", "Accept-Encoding": "gzip"})
                with urlopen(req, timeout=45, context=ctx) as resp:
                    raw = resp.read()
                    if resp.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                        raw = gzip.decompress(raw)
                    payload = json.loads(raw.decode("utf-8"))
                items = payload if isinstance(payload, list) else [payload]
                if len(items) != len(batch_indices):
                    raise ValueError(f"Expected {len(batch_indices)} Open-Meteo items, got {len(items)}")
                for c_idx, item in zip(batch_indices, items):
                    h = item.get("hourly") or {}
                    times = h.get("time") or []
                    if len(times) != n_hours or times[0] != expected_first or times[-1] != expected_last:
                        raise ValueError(f"Unexpected ERA5 hourly axis length {len(times)} vs {n_hours}")
                    ws_kmh[c_idx] = np.asarray(
                        [np.nan if v is None else float(v) for v in h["wind_speed_10m"]], dtype=np.float32
                    )
                    wd_deg[c_idx] = np.asarray(
                        [np.nan if v is None else float(v) for v in h["wind_direction_10m"]], dtype=np.float32
                    )
                    rain_mm[c_idx] = np.asarray(
                        [np.nan if v is None else float(v) for v in h["precipitation"]], dtype=np.float32
                    )
                    blh_m[c_idx] = np.asarray(
                        [np.nan if v is None else float(v) for v in h["boundary_layer_height"]], dtype=np.float32
                    )
                return
            except HTTPError as exc:
                if attempt < len(waits) - 1 and exc.code in (429, 500, 502, 503, 504):
                    time.sleep(wait)
                    continue
                raise
            except (URLError, TimeoutError, OSError, ValueError):
                if attempt < len(waits) - 1:
                    time.sleep(wait)
                    continue
                raise

    def _fetch_one(idx: int) -> None:
        _fetch_batch([idx])
        time.sleep(0.35)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_fetch_one, idx) for idx in range(n_cells)]
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            fut.result()
            done += 1
            if done % 15 == 0 or done == n_cells:
                print(f"      ERA5 cells: {done}/{n_cells}", flush=True)

    return station_cell_idx, ws_kmh, wd_deg, rain_mm, blh_m


def _lu_group(lu_name: str | None) -> int:
    """0=agri, 1=forest, 2=spk, 3=other."""
    if lu_name == "พื้นที่เกษตร":
        return 0
    if lu_name in ("ป่าอนุรักษ์", "ป่าสงวนแห่งชาติ"):
        return 1
    if lu_name == "เขต สปก.":
        return 2
    return 3


def load_thai_hotspots(
    db_path: Path,
    start: date,
    end: date,
    prov_to_idx: dict[str, int],
) -> dict[str, np.ndarray]:
    """Load Thai VIIRS hotspots from DuckDB strictly read-only."""
    with duckdb.connect(str(db_path), read_only=True) as con:
        rows = con.execute("""
            SELECT acq_date_th, hour_th, latitude, longitude, prov_code, lu_name, satellite, coalesce(frp_mw, 0.0)
            FROM hotspots
            WHERE instrument = 'VIIRS'
              AND NOT is_suspected_static
              AND acq_date_th BETWEEN ? AND ?
              AND latitude IS NOT NULL AND longitude IS NOT NULL
        """, [start, end]).fetchall()

    n = len(rows)
    h0 = np.empty(n, dtype=np.int32)
    lat = np.empty(n, dtype=np.float64)
    lon = np.empty(n, dtype=np.float64)
    prov_idx = np.full(n, -1, dtype=np.int16)
    lu_grp = np.empty(n, dtype=np.int8)
    is_suomi = np.empty(n, dtype=bool)
    frp = np.empty(n, dtype=np.float32)

    for k, (dt, hr, la, lo, pc, lu, sat, mw) in enumerate(rows):
        h0[k] = (dt - ERA5_START).days * 24 + int(hr)
        lat[k] = float(la)
        lon[k] = float(lo)
        prov_idx[k] = prov_to_idx.get(pc, -1) if pc else -1
        lu_grp[k] = _lu_group(lu)
        is_suomi[k] = sat == "N"
        frp[k] = float(mw)

    return {
        "h0": h0,
        "lat": lat,
        "lon": lon,
        "prov_idx": prov_idx,
        "lu_grp": lu_grp,
        "is_suomi": is_suomi,
        "frp": frp,
    }


def compute_transboundary_daily_exposure(
    stations: list[dict],
    station_cell_idx: np.ndarray,
    era5_ws: np.ndarray,
    era5_wd: np.ndarray,
    start: date,
    end: date,
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Download 2024-2025 GMS FIRMS Parquets to temp dir, align with hourly wind, and delete immediately."""
    n_stations = len(stations)
    n_days = (end - start).days + 1
    upwind_tb_30 = np.zeros((n_stations, n_days), dtype=np.int32)
    upwind_tb_45 = np.zeros((n_stations, n_days), dtype=np.int32)

    s_lat = np.asarray([s["lat"] for s in stations], dtype=np.float64)
    s_lon = np.asarray([s["lon"] for s in stations], dtype=np.float64)
    ctx = trusted_ssl_context()
    counts_by_year: dict[int, int] = {}

    with TemporaryDirectory(prefix="farm-fire-pm25-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        for yr in (2024, 2025):
            pq_path = tmp_path / f"transboundary_firms_{yr}.parquet"
            url = HF_TRANSBOUNDARY_TPL.format(year=yr)
            for attempt in range(3):
                try:
                    req = Request(url, headers={"User-Agent": "TADIH-Hotspot5Y/3.0"})
                    with urlopen(req, timeout=120, context=ctx) as resp, pq_path.open("wb") as out:
                        while chunk := resp.read(1024 * 512):
                            out.write(chunk)
                    break
                except Exception:
                    pq_path.unlink(missing_ok=True)
                    if attempt == 2:
                        raise
                    time.sleep(5 * (attempt + 1))

            p_sql = "'" + pq_path.as_posix().replace("'", "''") + "'"
            with duckdb.connect(":memory:") as mcon:
                rows = mcon.execute(f"""
                    SELECT
                        CAST(strftime(ts_th, '%Y-%m-%d') AS DATE) AS date_th,
                        CAST(hour(ts_th) AS INTEGER) AS hour_th,
                        latitude,
                        longitude
                    FROM (
                        SELECT
                            strptime(acq_date || ' ' || lpad(acq_time, 4, '0'), '%Y-%m-%d %H%M') + INTERVAL 7 HOUR AS ts_th,
                            latitude,
                            longitude
                        FROM read_parquet({p_sql})
                        WHERE country != 'Thailand'
                          AND latitude BETWEEN 3.0 AND 23.0
                          AND longitude BETWEEN 95.0 AND 108.5
                    )
                """).fetchall()
            pq_path.unlink(missing_ok=True)
            counts_by_year[yr] = len(rows)
            if not rows:
                continue

            f_h0 = np.empty(len(rows), dtype=np.int32)
            f_lat = np.empty(len(rows), dtype=np.float64)
            f_lon = np.empty(len(rows), dtype=np.float64)
            for k, (dt_th, hr_th, la, lo) in enumerate(rows):
                f_h0[k] = (dt_th - ERA5_START).days * 24 + int(hr_th)
                f_lat[k] = float(la)
                f_lon[k] = float(lo)

            chunk = 25000
            max_h = era5_ws.shape[1]
            for i0 in range(0, len(f_h0), chunk):
                i1 = min(i0 + chunk, len(f_h0))
                la_c = f_lat[i0:i1, None]
                lo_c = f_lon[i0:i1, None]
                h0_c = f_h0[i0:i1]
                valid_h = (h0_c >= 0) & (h0_c < max_h)
                if not np.any(valid_h):
                    continue
                la_c = la_c[valid_h]
                lo_c = lo_c[valid_h]
                h0_c = h0_c[valid_h]

                box = (np.abs(la_c - s_lat[None, :]) <= 2.3) & (np.abs(lo_c - s_lon[None, :]) <= 2.5)
                fi, si = np.nonzero(box)
                if len(fi) == 0:
                    continue
                dist = haversine_km(s_lat[si], s_lon[si], la_c[fi, 0], lo_c[fi, 0])
                keep = dist <= TRANSBOUNDARY_RADIUS_KM
                if not np.any(keep):
                    continue
                fi, si, dist = fi[keep], si[keep], dist[keep]
                h0_p = h0_c[fi]
                g_p = station_cell_idx[si]
                ws = era5_ws[g_p, h0_p]
                wd = era5_wd[g_p, h0_p]
                wind_ok = np.isfinite(ws) & np.isfinite(wd) & (ws >= MIN_WIND_KMH)
                if not np.any(wind_ok):
                    continue
                fi, si, dist, h0_p, ws, wd = fi[wind_ok], si[wind_ok], dist[wind_ok], h0_p[wind_ok], ws[wind_ok], wd[wind_ok]
                brg = bearing_deg(s_lat[si], s_lon[si], la_c[fi, 0], lo_c[fi, 0])
                diff = angular_diff_deg(brg, wd)
                c45 = diff <= CONFOUNDER_CONE_DEG
                if not np.any(c45):
                    continue
                si_45 = si[c45]
                dist_45 = dist[c45]
                ws_45 = ws[c45]
                h0_45 = h0_p[c45]
                diff_45 = diff[c45]
                tau = np.clip(np.rint(dist_45 / np.maximum(ws_45, MIN_WIND_KMH)).astype(np.int32), 1, 24)
                d_arr = (h0_45 + tau) // 24 - (start - ERA5_START).days
                in_win = (d_arr >= 0) & (d_arr < n_days)
                if not np.any(in_win):
                    continue
                si_45, d_arr, diff_45 = si_45[in_win], d_arr[in_win], diff_45[in_win]
                np.add.at(upwind_tb_45, (si_45, d_arr), 1)
                c30 = diff_45 <= UPWIND_CONE_DEG
                if np.any(c30):
                    np.add.at(upwind_tb_30, (si_45[c30], d_arr[c30]), 1)

    return upwind_tb_30, upwind_tb_45, {
        "years_covered": [2024, 2025],
        "non_thai_hotspots_checked": counts_by_year,
        "transboundary_2026_status": "unavailable_upstream",
    }


def _compute_diurnal_anomaly(
    pm25: np.ndarray,
    clean_fire_free: np.ndarray,
    rain_hr: np.ndarray,
) -> np.ndarray:
    """Subtract station x hour-of-day clean fire-free dry background (requiring >= 10 valid hrs)."""
    n_st, n_hrs = pm25.shape
    hod = np.arange(n_hrs) % 24
    dry_clean = clean_fire_free & np.isfinite(pm25) & np.isfinite(rain_hr) & (rain_hr < 0.5)
    bg = np.full((n_st, 24), np.nan, dtype=np.float32)

    for s in range(n_st):
        mask_s = dry_clean[s]
        if not np.any(mask_s):
            continue
        for h in range(24):
            m_h = mask_s & (hod == h)
            if int(m_h.sum()) >= 10:
                bg[s, h] = float(np.mean(pm25[s, m_h]))
            else:
                b3 = h // 3
                m_b3 = mask_s & ((hod // 3) == b3)
                if int(m_b3.sum()) >= 10:
                    bg[s, h] = float(np.mean(pm25[s, m_b3]))

    return pm25 - bg[:, hod]


def _summarize_binary_group_diff(
    anom: np.ndarray,
    weeks_2d: np.ndarray,
    mask_a: np.ndarray,
    mask_b: np.ndarray,
) -> dict:
    return mean_diff_block_bootstrap(anom[mask_a], weeks_2d[mask_a], anom[mask_b], weeks_2d[mask_b])


def run_track1_hourly(
    stations: list[dict],
    provinces: list[dict],
    station_cell_idx: np.ndarray,
    era5_ws: np.ndarray,
    era5_wd: np.ndarray,
    era5_rain: np.ndarray,
    pm25_hr: np.ndarray,
    ws_st_ms: np.ndarray,
    wd_st_deg: np.ndarray,
    hotspots: dict[str, np.ndarray],
) -> dict:
    """Track 1: 2026-09-01..2026-11-17 hourly plume-matched event study across 180 stations."""
    n_st, n_hrs = pm25_hr.shape
    t1_h0_offset = (TRACK1_START - ERA5_START).days * 24
    t1_h_end = t1_h0_offset + n_hrs
    ws_e = era5_ws[station_cell_idx, t1_h0_offset:t1_h_end]
    wd_e = era5_wd[station_cell_idx, t1_h0_offset:t1_h_end]
    rain_e = era5_rain[station_cell_idx, t1_h0_offset:t1_h_end]

    # Precompute weeks for block bootstrap
    hr_dates = [TRACK1_START + timedelta(hours=h) for h in range(n_hrs)]
    weeks_1d = np.asarray([d.isocalendar()[0] * 100 + d.isocalendar()[1] for d in hr_dates], dtype=np.int64)
    weeks_2d = np.broadcast_to(weeks_1d[None, :], (n_st, n_hrs))

    # Station-hour exposure arrays (All active VIIRS: N, N20, N21)
    up_agri = np.zeros((n_st, n_hrs), dtype=bool)
    non_agri = np.zeros((n_st, n_hrs), dtype=bool)
    conf_forest_spk = np.zeros((n_st, n_hrs), dtype=bool)
    any_fire = np.zeros((n_st, n_hrs), dtype=bool)
    cross_prov_up_agri = np.zeros((n_st, n_hrs), dtype=bool)

    # Suomi-NPP ('N') only sensitivity <= 2026-11-01
    suomi_n_hrs = ((date(2026, 11, 1) - TRACK1_START).days + 1) * 24
    up_agri_n = np.zeros((n_st, n_hrs), dtype=bool)
    non_agri_n = np.zeros((n_st, n_hrs), dtype=bool)
    conf_fs_n = np.zeros((n_st, n_hrs), dtype=bool)

    # Station-measured wind sensitivity
    up_agri_stwind = np.zeros((n_st, n_hrs), dtype=bool)
    non_agri_stwind = np.zeros((n_st, n_hrs), dtype=bool)

    # Track source-province clean upwind matches per (fire_prov_idx, station_idx, hour)
    # Use sparse list of (fire_prov_idx, station_idx, hour_idx) for agri upwind arrivals
    agri_upwind_links: list[tuple[int, int, int]] = []

    s_lat = np.asarray([s["lat"] for s in stations], dtype=np.float64)
    s_lon = np.asarray([s["lon"] for s in stations], dtype=np.float64)
    prov_code_to_idx = {p["prov_code"]: i for i, p in enumerate(provinces)}
    st_prov_idx = np.asarray([prov_code_to_idx[s["prov_code"]] for s in stations], dtype=np.int16)

    f_h0 = hotspots["h0"]
    f_lat = hotspots["lat"]
    f_lon = hotspots["lon"]
    f_pidx = hotspots["prov_idx"]
    f_lu = hotspots["lu_grp"]
    f_suomi = hotspots["is_suomi"]

    # Filter hotspots inside Track 1 window (plus 12h lookback)
    in_t1 = (f_h0 >= t1_h0_offset - 12) & (f_h0 < t1_h_end) & (f_lu <= 2)
    idxs = np.flatnonzero(in_t1)

    chunk = 10000
    for c0 in range(0, len(idxs), chunk):
        sel = idxs[c0 : c0 + chunk]
        la = f_lat[sel, None]
        lo = f_lon[sel, None]
        box = (np.abs(la - s_lat[None, :]) <= 0.8) & (np.abs(lo - s_lon[None, :]) <= 0.8)
        fi, si = np.nonzero(box)
        if len(fi) == 0:
            continue
        dist = haversine_km(s_lat[si], s_lon[si], la[fi, 0], lo[fi, 0])
        lu_p = f_lu[sel[fi]]
        max_r = np.where(lu_p == 1, FOREST_RADIUS_KM, AGRI_RADIUS_KM)
        keep = dist <= max_r
        if not np.any(keep):
            continue
        fi, si, dist, lu_p = fi[keep], si[keep], dist[keep], lu_p[keep]
        h0_abs = f_h0[sel[fi]]
        fp_p = f_pidx[sel[fi]]
        suomi_p = f_suomi[sel[fi]]

        # Read ERA5 wind at fire hour
        h0_rel = h0_abs - t1_h0_offset
        g_p = station_cell_idx[si]
        ws = era5_ws[g_p, h0_abs]
        wd = era5_wd[g_p, h0_abs]
        brg = bearing_deg(s_lat[si], s_lon[si], la[fi, 0], lo[fi, 0])
        diff = angular_diff_deg(brg, wd)

        # Arrival window offsets [-1..+3] around tau
        tau = np.clip(np.rint(dist / np.maximum(np.where(np.isfinite(ws), ws, MIN_WIND_KMH), MIN_WIND_KMH)).astype(np.int32), 0, 12)

        for d_off in range(-1, 4):
            w_tau = np.clip(tau + d_off, 0, 12)
            h_arr = h0_rel + w_tau
            ok_h = (h_arr >= 0) & (h_arr < n_hrs)
            if not np.any(ok_h):
                continue
            si_v = si[ok_h]
            ha_v = h_arr[ok_h]
            lu_v = lu_p[ok_h]
            any_fire[si_v, ha_v] = True

            wind_v = np.isfinite(ws[ok_h]) & np.isfinite(wd[ok_h]) & (ws[ok_h] >= MIN_WIND_KMH)
            diff_v = diff[ok_h]

            # Forest / SPK confounder (45-deg cone)
            fs_mask = wind_v & (lu_v >= 1) & (diff_v <= CONFOUNDER_CONE_DEG)
            if np.any(fs_mask):
                conf_forest_spk[si_v[fs_mask], ha_v[fs_mask]] = True

            # Agri upwind & non-upwind
            ag_up = wind_v & (lu_v == 0) & (diff_v <= UPWIND_CONE_DEG)
            if np.any(ag_up):
                si_u = si_v[ag_up]
                ha_u = ha_v[ag_up]
                fp_u = fp_p[ok_h][ag_up]
                up_agri[si_u, ha_u] = True
                cp = (fp_u >= 0) & (fp_u != st_prov_idx[si_u])
                if np.any(cp):
                    cross_prov_up_agri[si_u[cp], ha_u[cp]] = True
                if d_off == 0:
                    for fp_val, s_val, h_val in zip(fp_u.tolist(), si_u.tolist(), ha_u.tolist()):
                        if fp_val >= 0:
                            agri_upwind_links.append((fp_val, s_val, h_val))

            ag_non = wind_v & (lu_v == 0) & (diff_v >= NON_UPWIND_MIN_DEG)
            if np.any(ag_non):
                non_agri[si_v[ag_non], ha_v[ag_non]] = True

            # Suomi-N sensitivity <= 2026-11-01
            su_ok = suomi_p[ok_h] & (ha_v < suomi_n_hrs)
            if np.any(su_ok):
                if np.any(fs_mask & su_ok):
                    m = fs_mask & su_ok
                    conf_fs_n[si_v[m], ha_v[m]] = True
                if np.any(ag_up & su_ok):
                    m = ag_up & su_ok
                    up_agri_n[si_v[m], ha_v[m]] = True
                if np.any(ag_non & su_ok):
                    m = ag_non & su_ok
                    non_agri_n[si_v[m], ha_v[m]] = True

        # Station-measured wind sensitivity on hour h0_rel itself (when 0 <= h0_rel < n_hrs)
        in_h0 = (h0_rel >= 0) & (h0_rel < n_hrs) & (lu_p == 0)
        if np.any(in_h0):
            si_s = si[in_h0]
            h0_s = h0_rel[in_h0]
            ws_m = ws_st_ms[si_s, h0_s] * 3.6
            wd_m = wd_st_deg[si_s, h0_s]
            ok_sm = np.isfinite(ws_m) & np.isfinite(wd_m) & (ws_m >= MIN_WIND_KMH)
            if np.any(ok_sm):
                si_s, h0_s, ws_m, wd_m, dist_s, fi_s = (
                    si_s[ok_sm], h0_s[ok_sm], ws_m[ok_sm], wd_m[ok_sm], dist[in_h0][ok_sm], fi[in_h0][ok_sm]
                )
                brg_s = bearing_deg(s_lat[si_s], s_lon[si_s], la[fi_s, 0], lo[fi_s, 0])
                diff_s = angular_diff_deg(brg_s, wd_m)
                tau_s = np.clip(np.rint(dist_s / ws_m).astype(np.int32), 0, 12)
                for d_off in range(-1, 4):
                    ha_s = h0_s + np.clip(tau_s + d_off, 0, 12)
                    ok_hs = (ha_s >= 0) & (ha_s < n_hrs)
                    if not np.any(ok_hs):
                        continue
                    up_m = ok_hs & (diff_s <= UPWIND_CONE_DEG)
                    non_m = ok_hs & (diff_s >= NON_UPWIND_MIN_DEG)
                    if np.any(up_m):
                        up_agri_stwind[si_s[up_m], ha_s[up_m]] = True
                    if np.any(non_m):
                        non_agri_stwind[si_s[non_m], ha_s[non_m]] = True

    anom = _compute_diurnal_anomaly(pm25_hr, ~any_fire, rain_e)
    dry_valid = np.isfinite(anom) & np.isfinite(rain_e) & (rain_e < 0.5) & np.isfinite(ws_e) & np.isfinite(wd_e)

    clean_up = dry_valid & up_agri & (~conf_forest_spk)
    clean_non = dry_valid & non_agri & (~up_agri) & (~conf_forest_spk)
    clean_nofire = dry_valid & (~any_fire)

    # Before-after episode jump on clean_up episodes
    episode_jumps: list[float] = []
    episode_weeks: list[int] = []
    for s in range(n_st):
        row_u = clean_up[s]
        h = 0
        while h < n_hrs:
            if not row_u[h]:
                h += 1
                continue
            h_end = h
            while h_end < n_hrs and row_u[h_end]:
                h_end += 1
            pre_start = max(0, h - 6)
            pre_end = max(0, h - 1)
            if pre_end > pre_start:
                pre_mask = clean_nofire[s, pre_start:pre_end]
                if int(pre_mask.sum()) >= 2:
                    jump = float(np.mean(anom[s, h:h_end]) - np.mean(anom[s, pre_start:pre_end][pre_mask]))
                    episode_jumps.append(jump)
                    episode_weeks.append(int(weeks_1d[h]))
            h = h_end

    if episode_jumps:
        ej = np.asarray(episode_jumps, dtype=np.float64)
        ew = np.asarray(episode_weeks, dtype=np.int64)
        jump_res = mean_diff_block_bootstrap(ej, ew, np.zeros_like(ej), ew)
        before_after = {
            "n_episodes": int(len(ej)),
            "mean_jump_ug_m3": jump_res["delta"],
            "ci_low": jump_res["ci_low"],
            "ci_high": jump_res["ci_high"],
        }
    else:
        before_after = {"n_episodes": 0, "mean_jump_ug_m3": None, "ci_low": None, "ci_high": None}

    # Anemometer wind agreement & sensitivity
    wind_cmp = np.isfinite(ws_st_ms) & (ws_st_ms >= 1.0) & np.isfinite(wd_st_deg) & np.isfinite(ws_e) & (ws_e >= MIN_WIND_KMH) & np.isfinite(wd_e)
    if np.any(wind_cmp):
        w_diffs = angular_diff_deg(wd_st_deg[wind_cmp], wd_e[wind_cmp])
        wind_agree = {
            "n_hours_both_windy": int(wind_cmp.sum()),
            "median_angular_diff_deg": _safe_round(float(np.median(w_diffs)), 1),
            "mean_angular_diff_deg": _safe_round(float(np.mean(w_diffs)), 1),
            "pct_within_45deg": _safe_round(float(np.mean(w_diffs <= 45.0) * 100.0), 1),
            "pct_within_60deg": _safe_round(float(np.mean(w_diffs <= 60.0) * 100.0), 1),
        }
    else:
        wind_agree = {"n_hours_both_windy": 0}

    clean_up_sw = np.isfinite(anom) & np.isfinite(rain_e) & (rain_e < 0.5) & up_agri_stwind & (~conf_forest_spk)
    clean_non_sw = np.isfinite(anom) & np.isfinite(rain_e) & (rain_e < 0.5) & non_agri_stwind & (~up_agri_stwind) & (~conf_forest_spk)
    sw_sens = _summarize_binary_group_diff(anom, weeks_2d, clean_up_sw, clean_non_sw)

    # Suomi-N sensitivity <= 2026-11-01
    sn_slice = np.zeros_like(dry_valid)
    sn_slice[:, :suomi_n_hrs] = True
    clean_up_n = dry_valid & sn_slice & up_agri_n & (~conf_fs_n)
    clean_non_n = dry_valid & sn_slice & non_agri_n & (~up_agri_n) & (~conf_fs_n)
    suomi_sens = _summarize_binary_group_diff(anom, weeks_2d, clean_up_n, clean_non_n)

    # Regional & National Track 1 summary
    reg_t1: dict[str, dict] = {}
    for scope in ("National",) + REGIONS_ORDER:
        if scope == "National":
            rm = np.ones(n_st, dtype=bool)
        else:
            rm = np.asarray([s["region"] == scope for s in stations], dtype=bool)
        v_hrs = int(dry_valid[rm].sum())
        c_up = int(clean_up[rm].sum())
        tot_up = int((dry_valid[rm] & up_agri[rm]).sum())
        c_non = int(clean_non[rm].sum())
        status = evaluate_sufficiency_status(
            stations_in_prov=int(rm.sum()),
            valid_obs=v_hrs,
            clean_events=c_up,
            total_agri_events=tot_up,
            min_valid_obs=MIN_HOURLY_VALID_HOURS,
            min_clean_events=MIN_HOURLY_CLEAN_EVENTS,
        )
        vs_non = _summarize_binary_group_diff(anom[rm], weeks_2d[rm], clean_up[rm], clean_non[rm]) if status.startswith("sufficient") and c_non >= MIN_HOURLY_CLEAN_EVENTS else {"delta": None, "ci_low": None, "ci_high": None}
        vs_nf = _summarize_binary_group_diff(anom[rm], weeks_2d[rm], clean_up[rm], clean_nofire[rm]) if status.startswith("sufficient") else {"delta": None, "ci_low": None, "ci_high": None}
        reg_t1[scope] = {
            "stations": int(rm.sum()),
            "valid_hours": v_hrs,
            "clean_upwind_agri_hours": c_up,
            "total_upwind_agri_hours": tot_up,
            "clean_non_upwind_hours": c_non,
            "cross_province_upwind_hours": int((clean_up[rm] & cross_prov_up_agri[rm]).sum()),
            "delta_vs_non_upwind_ug_m3": vs_non["delta"],
            "ci_low_vs_non_upwind": vs_non["ci_low"],
            "ci_high_vs_non_upwind": vs_non["ci_high"],
            "delta_vs_nofire_ug_m3": vs_nf["delta"],
            "ci_low_vs_nofire": vs_nf["ci_low"],
            "ci_high_vs_nofire": vs_nf["ci_high"],
            "sufficiency_status": status,
        }

    # Build fire-source-province clean hour masks for cross-province outflow tracking
    outflow_links_by_prov: dict[int, list[tuple[int, int]]] = {}
    for fp, si_v, ha_v in agri_upwind_links:
        if clean_up[si_v, ha_v] and st_prov_idx[si_v] != fp:
            outflow_links_by_prov.setdefault(fp, []).append((si_v, ha_v))

    prov_t1: dict[str, dict] = {}
    for p_idx, p in enumerate(provinces):
        pc = p["prov_code"]
        pm = np.asarray([s["prov_code"] == pc for s in stations], dtype=bool)
        n_in_prov = int(pm.sum())
        links = outflow_links_by_prov.get(p_idx, [])
        cp_stations = len({si_v for si_v, _ in links})

        if n_in_prov > 0:
            v_hrs = int(dry_valid[pm].sum())
            c_up = int(clean_up[pm].sum())
            tot_up = int((dry_valid[pm] & up_agri[pm]).sum())
            c_non = int(clean_non[pm].sum())
            cp_hrs = int((clean_up[pm] & cross_prov_up_agri[pm]).sum())
            status = evaluate_sufficiency_status(
                stations_in_prov=n_in_prov,
                valid_obs=v_hrs,
                clean_events=c_up,
                total_agri_events=tot_up,
                min_valid_obs=MIN_HOURLY_VALID_HOURS,
                min_clean_events=MIN_HOURLY_CLEAN_EVENTS,
            )
            vs_nf = _summarize_binary_group_diff(anom[pm], weeks_2d[pm], clean_up[pm], clean_nofire[pm]) if status.startswith("sufficient") else {"delta": None, "ci_low": None, "ci_high": None}
            vs_non = _summarize_binary_group_diff(anom[pm], weeks_2d[pm], clean_up[pm], clean_non[pm]) if status.startswith("sufficient") and c_non >= MIN_HOURLY_CLEAN_EVENTS else {"delta": None, "ci_low": None, "ci_high": None}
        else:
            # Province without in-province station: evaluate downwind cross-province matches from fires inside pc
            if links:
                dn_st = sorted({si_v for si_v, _ in links})
                dn_mask = np.zeros(n_st, dtype=bool)
                dn_mask[dn_st] = True
                v_hrs = int(dry_valid[dn_mask].sum())
                vals_up = np.asarray([anom[si_v, ha_v] for si_v, ha_v in links], dtype=np.float64)
                wks_up = np.asarray([weeks_1d[ha_v] for _, ha_v in links], dtype=np.int64)
                c_up = int(np.isfinite(vals_up).sum())
                tot_up = c_up
                cp_hrs = c_up
                status = evaluate_sufficiency_status(
                    stations_in_prov=0,
                    valid_obs=v_hrs,
                    clean_events=c_up,
                    total_agri_events=tot_up,
                    min_valid_obs=MIN_HOURLY_VALID_HOURS,
                    min_clean_events=MIN_HOURLY_CLEAN_EVENTS,
                )
                if status.startswith("sufficient"):
                    vs_nf = mean_diff_block_bootstrap(vals_up, wks_up, anom[dn_mask][clean_nofire[dn_mask]], weeks_2d[dn_mask][clean_nofire[dn_mask]])
                else:
                    vs_nf = {"delta": None, "ci_low": None, "ci_high": None}
                vs_non = {"delta": None, "ci_low": None, "ci_high": None}
            else:
                v_hrs = c_up = tot_up = cp_hrs = 0
                status = "insufficient_no_station"
                vs_nf = vs_non = {"delta": None, "ci_low": None, "ci_high": None}

        prov_t1[pc] = {
            "stations_in_province": n_in_prov,
            "cross_province_outflow_stations": cp_stations,
            "valid_hours": v_hrs,
            "clean_upwind_agri_hours": c_up,
            "total_upwind_agri_hours": tot_up,
            "cross_province_upwind_hours": cp_hrs,
            "delta_vs_nofire_ug_m3": vs_nf["delta"],
            "ci_low_vs_nofire": vs_nf["ci_low"],
            "ci_high_vs_nofire": vs_nf["ci_high"],
            "delta_vs_non_upwind_ug_m3": vs_non["delta"],
            "sufficiency_status": status,
        }

    return {
        "window": f"{TRACK1_START.isoformat()}..{TRACK1_END.isoformat()}",
        "satellites_primary": ["N", "N20", "N21"],
        "before_after_episode_jump": before_after,
        "anemometer_era5_agreement": wind_agree,
        "station_measured_wind_sensitivity": sw_sens,
        "suomi_n_only_sensitivity": {
            "window": "2026-09-01..2026-11-01",
            **suomi_sens,
        },
        "regions": reg_t1,
        "provinces": prov_t1,
    }


def run_track2_daily(
    stations: list[dict],
    provinces: list[dict],
    station_cell_idx: np.ndarray,
    era5_ws: np.ndarray,
    era5_wd: np.ndarray,
    era5_rain: np.ndarray,
    era5_blh: np.ndarray,
    daily_pm25: np.ndarray,
    hotspots: dict[str, np.ndarray],
    upwind_tb_30: np.ndarray,
    upwind_tb_45: np.ndarray,
    tb_meta: dict,
    xlsx_meta: dict,
) -> dict:
    """Track 2: 2024-01-01..2026-06-30 daily station x hourly wind x 3-way smoke separation."""
    n_st, n_days = daily_pm25.shape
    t2_d0_offset = (TRACK2_START - ERA5_START).days
    t2_h0_offset = t2_d0_offset * 24

    # Daily station ERA5 rain (mm) & mean BLH (m)
    rain_3d = era5_rain[station_cell_idx, t2_h0_offset : t2_h0_offset + n_days * 24].reshape(n_st, n_days, 24)
    blh_3d = era5_blh[station_cell_idx, t2_h0_offset : t2_h0_offset + n_days * 24].reshape(n_st, n_days, 24)
    daily_rain = np.sum(rain_3d, axis=2)
    daily_blh = np.mean(blh_3d, axis=2)

    day_dates = [TRACK2_START + timedelta(days=d) for d in range(n_days)]
    years_1d = np.asarray([d.year for d in day_dates], dtype=np.int16)
    months_1d = np.asarray([d.month for d in day_dates], dtype=np.int16)
    ym_1d = np.asarray([d.year * 100 + d.month for d in day_dates], dtype=np.int32)
    weeks_1d = np.asarray([d.isocalendar()[0] * 100 + d.isocalendar()[1] for d in day_dates], dtype=np.int64)

    # Exposure counts per (station, day)
    up_agri_n = np.zeros((n_st, n_days), dtype=np.int32)
    non_agri_n = np.zeros((n_st, n_days), dtype=np.int32)
    up_forest_n = np.zeros((n_st, n_days), dtype=np.int32)
    up_spk_n = np.zeros((n_st, n_days), dtype=np.int32)
    any_viirs_conf_fs = np.zeros((n_st, n_days), dtype=bool)
    any_viirs_any_fire = np.zeros((n_st, n_days), dtype=bool)
    cross_prov_up_agri_n = np.zeros((n_st, n_days), dtype=bool)

    s_lat = np.asarray([s["lat"] for s in stations], dtype=np.float64)
    s_lon = np.asarray([s["lon"] for s in stations], dtype=np.float64)
    prov_code_to_idx = {p["prov_code"]: i for i, p in enumerate(provinces)}
    st_prov_idx = np.asarray([prov_code_to_idx[s["prov_code"]] for s in stations], dtype=np.int16)

    # Outflow attribution for provinces without in-province stations (76, 82, 85) + cross-prov stats
    no_st_provs = {prov_code_to_idx[p["prov_code"]] for p in provinces if not any(s["prov_code"] == p["prov_code"] for s in stations)}
    no_st_outflow_hits: dict[int, set[tuple[int, int]]] = {pi: set() for pi in no_st_provs}
    prov_outflow_stations: dict[int, set[int]] = {i: set() for i in range(len(provinces))}

    f_h0 = hotspots["h0"]
    f_lat = hotspots["lat"]
    f_lon = hotspots["lon"]
    f_pidx = hotspots["prov_idx"]
    f_lu = hotspots["lu_grp"]
    f_suomi = hotspots["is_suomi"]

    in_t2 = (f_h0 >= t2_h0_offset - 24) & (f_h0 < t2_h0_offset + n_days * 24) & (f_lu <= 2)
    idxs = np.flatnonzero(in_t2)

    chunk = 20000
    max_era_h = era5_ws.shape[1]
    for c0 in range(0, len(idxs), chunk):
        sel = idxs[c0 : c0 + chunk]
        la = f_lat[sel, None]
        lo = f_lon[sel, None]
        box = (np.abs(la - s_lat[None, :]) <= 0.8) & (np.abs(lo - s_lon[None, :]) <= 0.8)
        fi, si = np.nonzero(box)
        if len(fi) == 0:
            continue
        dist = haversine_km(s_lat[si], s_lon[si], la[fi, 0], lo[fi, 0])
        lu_p = f_lu[sel[fi]]
        max_r = np.where(lu_p == 1, FOREST_RADIUS_KM, AGRI_RADIUS_KM)
        keep = dist <= max_r
        if not np.any(keep):
            continue
        fi, si, dist, lu_p = fi[keep], si[keep], dist[keep], lu_p[keep]
        h0_abs = f_h0[sel[fi]]
        valid_h = (h0_abs >= 0) & (h0_abs < max_era_h)
        if not np.any(valid_h):
            continue
        fi, si, dist, lu_p, h0_abs = fi[valid_h], si[valid_h], dist[valid_h], lu_p[valid_h], h0_abs[valid_h]
        fp_p = f_pidx[sel[fi]]
        suomi_p = f_suomi[sel[fi]]

        g_p = station_cell_idx[si]
        ws = era5_ws[g_p, h0_abs]
        wd = era5_wd[g_p, h0_abs]
        tau = np.clip(np.rint(dist / np.maximum(np.where(np.isfinite(ws), ws, MIN_WIND_KMH), MIN_WIND_KMH)).astype(np.int32), 0, 12)
        d_arr = (h0_abs + tau) // 24 - t2_d0_offset
        ok_d = (d_arr >= 0) & (d_arr < n_days)
        if not np.any(ok_d):
            continue
        fi, si, dist, lu_p, fp_p, suomi_p, ws, wd, d_arr = (
            fi[ok_d], si[ok_d], dist[ok_d], lu_p[ok_d], fp_p[ok_d], suomi_p[ok_d], ws[ok_d], wd[ok_d], d_arr[ok_d]
        )

        any_viirs_any_fire[si, d_arr] = True

        wind_ok = np.isfinite(ws) & np.isfinite(wd) & (ws >= MIN_WIND_KMH)
        if not np.any(wind_ok):
            continue
        fi, si, lu_p, fp_p, suomi_p, wd, d_arr = (
            fi[wind_ok], si[wind_ok], lu_p[wind_ok], fp_p[wind_ok], suomi_p[wind_ok], wd[wind_ok], d_arr[wind_ok]
        )
        brg = bearing_deg(s_lat[si], s_lon[si], la[fi, 0], lo[fi, 0])
        diff = angular_diff_deg(brg, wd)

        # Conservative all-VIIRS forest/SPK confounder mask (45-deg cone)
        fs_all = (lu_p >= 1) & (diff <= CONFOUNDER_CONE_DEG)
        if np.any(fs_all):
            any_viirs_conf_fs[si[fs_all], d_arr[fs_all]] = True

        # Primary Suomi-N exposures
        n_mask = suomi_p
        if not np.any(n_mask):
            continue
        si_n, lu_n, fp_n, diff_n, da_n = si[n_mask], lu_p[n_mask], fp_p[n_mask], diff[n_mask], d_arr[n_mask]

        m_ag_up = (lu_n == 0) & (diff_n <= UPWIND_CONE_DEG)
        if np.any(m_ag_up):
            si_u = si_n[m_ag_up]
            da_u = da_n[m_ag_up]
            fp_u = fp_n[m_ag_up]
            np.add.at(up_agri_n, (si_u, da_u), 1)
            cp = (fp_u >= 0) & (fp_u != st_prov_idx[si_u])
            if np.any(cp):
                cross_prov_up_agri_n[si_u[cp], da_u[cp]] = True
                for fp_v, s_v, d_v in zip(fp_u[cp].tolist(), si_u[cp].tolist(), da_u[cp].tolist()):
                    prov_outflow_stations[fp_v].add(s_v)
                    if fp_v in no_st_outflow_hits:
                        no_st_outflow_hits[fp_v].add((s_v, d_v))

        m_ag_non = (lu_n == 0) & (diff_n >= NON_UPWIND_MIN_DEG)
        if np.any(m_ag_non):
            np.add.at(non_agri_n, (si_n[m_ag_non], da_n[m_ag_non]), 1)

        m_fo_up = (lu_n == 1) & (diff_n <= UPWIND_CONE_DEG)
        if np.any(m_fo_up):
            np.add.at(up_forest_n, (si_n[m_fo_up], da_n[m_fo_up]), 1)

        m_sp_up = (lu_n == 2) & (diff_n <= UPWIND_CONE_DEG)
        if np.any(m_sp_up):
            np.add.at(up_spk_n, (si_n[m_sp_up], da_n[m_sp_up]), 1)

    # Demean daily PM2.5 within (station x calendar_month) using clean fire-free dry days (Fallback: station x all valid dry days)
    dry_valid = np.isfinite(daily_pm25) & np.isfinite(daily_rain) & (daily_rain < 1.0) & np.isfinite(daily_blh)
    clean_nofire = dry_valid & (~any_viirs_any_fire) & (upwind_tb_45 == 0)
    pm25_anom = np.full_like(daily_pm25, np.nan)
    for s in range(n_st):
        for m in range(1, 13):
            m_idx = months_1d == m
            ref = clean_nofire[s] & m_idx
            if int(ref.sum()) < 5:
                ref = dry_valid[s] & m_idx
            if int(ref.sum()) >= 5:
                mu = float(np.mean(daily_pm25[s, ref]))
                pm25_anom[s, m_idx] = daily_pm25[s, m_idx] - mu

    weeks_2d = np.broadcast_to(weeks_1d[None, :], (n_st, n_days))
    yr24_25 = np.broadcast_to((years_1d <= 2025)[None, :], (n_st, n_days))
    yr26_h1 = np.broadcast_to((years_1d == 2026)[None, :], (n_st, n_days))

    # Clean subsets
    # In 2024-2025: exclude all-VIIRS forest/SPK AND transboundary <= 45 deg
    # In 2026 H1: exclude all-VIIRS forest/SPK (transboundary 2026 unavailable upstream)
    tb_clean_mask = np.where(yr24_25, upwind_tb_45 == 0, True)
    clean_up = dry_valid & (up_agri_n >= 1) & (~any_viirs_conf_fs) & tb_clean_mask
    clean_non = dry_valid & (non_agri_n >= 1) & (up_agri_n == 0) & (~any_viirs_conf_fs) & tb_clean_mask
    clean_nf = dry_valid & (~any_viirs_any_fire) & tb_clean_mask

    # Fixed-Effects OLS on 2024-2025 (Full 3-way separation)
    st_grid = np.broadcast_to(np.arange(n_st)[:, None], (n_st, n_days))
    ym_grid = np.broadcast_to(ym_1d[None, :], (n_st, n_days))
    group_grid = st_grid.astype(np.int64) * 1_000_000 + ym_grid.astype(np.int64)

    fe_mask_2425 = yr24_25 & np.isfinite(daily_pm25) & np.isfinite(daily_rain) & np.isfinite(daily_blh) & (daily_blh > 0)
    X_2425 = np.column_stack([
        np.log1p(up_agri_n[fe_mask_2425]),
        np.log1p(non_agri_n[fe_mask_2425]),
        np.log1p(up_forest_n[fe_mask_2425]),
        np.log1p(up_spk_n[fe_mask_2425]),
        np.log1p(upwind_tb_30[fe_mask_2425]),
        np.log1p(np.maximum(daily_rain[fe_mask_2425], 0.0)),
        np.log(np.maximum(daily_blh[fe_mask_2425], 1.0)),
    ])
    fe_2425 = within_fe_ols_with_block_bootstrap(
        daily_pm25[fe_mask_2425], X_2425, group_grid[fe_mask_2425], weeks_2d[fe_mask_2425]
    )
    fe_names_2425 = [
        "ln_1p_upwind_agri_50km",
        "ln_1p_non_upwind_agri_50km",
        "ln_1p_upwind_forest_80km",
        "ln_1p_upwind_spk_50km",
        "ln_1p_upwind_transboundary_250km",
        "ln_1p_rain_mm",
        "ln_mean_blh_m",
    ]

    # Fixed-Effects OLS on 2026 H1 (no transboundary term upstream)
    fe_mask_26 = yr26_h1 & np.isfinite(daily_pm25) & np.isfinite(daily_rain) & np.isfinite(daily_blh) & (daily_blh > 0)
    X_26 = np.column_stack([
        np.log1p(up_agri_n[fe_mask_26]),
        np.log1p(non_agri_n[fe_mask_26]),
        np.log1p(up_forest_n[fe_mask_26]),
        np.log1p(up_spk_n[fe_mask_26]),
        np.log1p(np.maximum(daily_rain[fe_mask_26], 0.0)),
        np.log(np.maximum(daily_blh[fe_mask_26], 1.0)),
    ])
    fe_26 = within_fe_ols_with_block_bootstrap(
        daily_pm25[fe_mask_26], X_26, group_grid[fe_mask_26], weeks_2d[fe_mask_26]
    )
    fe_names_26 = [n for n in fe_names_2425 if n != "ln_1p_upwind_transboundary_250km"]

    def _period_summary(period_mask: np.ndarray, station_mask: np.ndarray) -> dict:
        m = period_mask & station_mask[:, None] & np.isfinite(pm25_anom)
        v_days = int((dry_valid & m).sum())
        c_up = int((clean_up & m).sum())
        tot_up = int((dry_valid & (up_agri_n >= 1) & m).sum())
        c_non = int((clean_non & m).sum())
        c_nf = int((clean_nf & m).sum())
        status = evaluate_sufficiency_status(
            stations_in_prov=int(station_mask.sum()),
            valid_obs=v_days,
            clean_events=c_up,
            total_agri_events=tot_up,
            min_valid_obs=MIN_DAILY_VALID_DAYS,
            min_clean_events=MIN_DAILY_CLEAN_DAYS,
        )
        if status.startswith("sufficient"):
            vs_non = _summarize_binary_group_diff(pm25_anom, weeks_2d, clean_up & m, clean_non & m) if c_non >= MIN_DAILY_CLEAN_DAYS else {"delta": None, "ci_low": None, "ci_high": None}
            vs_nf = _summarize_binary_group_diff(pm25_anom, weeks_2d, clean_up & m, clean_nf & m) if c_nf >= MIN_DAILY_CLEAN_DAYS else {"delta": None, "ci_low": None, "ci_high": None}
        else:
            vs_non = {"delta": None, "ci_low": None, "ci_high": None}
            vs_nf = {"delta": None, "ci_low": None, "ci_high": None}
        return {
            "valid_days": v_days,
            "clean_upwind_agri_days": c_up,
            "total_upwind_agri_days": tot_up,
            "clean_non_upwind_days": c_non,
            "clean_no_fire_days": c_nf,
            "cross_province_upwind_days": int((clean_up & m & cross_prov_up_agri_n).sum()),
            "delta_vs_non_upwind_ug_m3": vs_non["delta"],
            "ci_low_vs_non_upwind": vs_non["ci_low"],
            "ci_high_vs_non_upwind": vs_non["ci_high"],
            "delta_vs_nofire_ug_m3": vs_nf["delta"],
            "ci_low_vs_nofire": vs_nf["ci_low"],
            "ci_high_vs_nofire": vs_nf["ci_high"],
            "sufficiency_status": status,
        }

    reg_t2: dict[str, dict] = {}
    for scope in ("National",) + REGIONS_ORDER:
        rm = np.ones(n_st, dtype=bool) if scope == "National" else np.asarray([s["region"] == scope for s in stations], dtype=bool)
        all_s = _period_summary(np.ones_like(dry_valid), rm)
        s_2425 = _period_summary(yr24_25, rm)
        s_26 = _period_summary(yr26_h1, rm)
        reg_t2[scope] = {
            "stations": int(rm.sum()),
            "all_2024_2026h1": all_s,
            "clean_2024_2025_with_tb_exclusion": s_2425,
            "h1_2026_no_tb_data": s_26,
        }

    prov_t2: dict[str, dict] = {}
    for p_idx, p in enumerate(provinces):
        pc = p["prov_code"]
        pm = np.asarray([s["prov_code"] == pc for s in stations], dtype=bool)
        n_in_prov = int(pm.sum())
        cp_outflow_n = len(prov_outflow_stations[p_idx])
        if n_in_prov > 0:
            all_s = _period_summary(np.ones_like(dry_valid), pm)
            s_2425 = _period_summary(yr24_25, pm)
        else:
            hits = sorted(no_st_outflow_hits.get(p_idx, set()))
            if hits:
                dn_st = sorted({s_v for s_v, _ in hits})
                dn_mask = np.zeros(n_st, dtype=bool)
                dn_mask[dn_st] = True
                v_days = int((dry_valid & dn_mask[:, None] & np.isfinite(pm25_anom)).sum())
                tot_hits = [(s_v, d_v) for s_v, d_v in hits if dry_valid[s_v, d_v] and np.isfinite(pm25_anom[s_v, d_v])]
                clean_hits = [(s_v, d_v) for s_v, d_v in tot_hits if (not any_viirs_conf_fs[s_v, d_v]) and (years_1d[d_v] == 2026 or upwind_tb_45[s_v, d_v] == 0)]
                c_up = len(clean_hits)
                tot_up = len(tot_hits)
                status = evaluate_sufficiency_status(
                    stations_in_prov=0,
                    valid_obs=v_days,
                    clean_events=c_up,
                    total_agri_events=tot_up,
                    min_valid_obs=MIN_DAILY_VALID_DAYS,
                    min_clean_events=MIN_DAILY_CLEAN_DAYS,
                )
                if status.startswith("sufficient"):
                    va = np.asarray([pm25_anom[s_v, d_v] for s_v, d_v in clean_hits], dtype=np.float64)
                    wa = np.asarray([weeks_1d[d_v] for _, d_v in clean_hits], dtype=np.int64)
                    nf_m = clean_nf & dn_mask[:, None] & np.isfinite(pm25_anom)
                    vs_nf = mean_diff_block_bootstrap(va, wa, pm25_anom[nf_m], weeks_2d[nf_m])
                else:
                    vs_nf = {"delta": None, "ci_low": None, "ci_high": None}
                all_s = {
                    "valid_days": v_days,
                    "clean_upwind_agri_days": c_up,
                    "total_upwind_agri_days": tot_up,
                    "clean_non_upwind_days": 0,
                    "clean_no_fire_days": int((clean_nf & dn_mask[:, None] & np.isfinite(pm25_anom)).sum()),
                    "cross_province_upwind_days": c_up,
                    "delta_vs_non_upwind_ug_m3": None,
                    "ci_low_vs_non_upwind": None,
                    "ci_high_vs_non_upwind": None,
                    "delta_vs_nofire_ug_m3": vs_nf["delta"],
                    "ci_low_vs_nofire": vs_nf["ci_low"],
                    "ci_high_vs_nofire": vs_nf["ci_high"],
                    "sufficiency_status": status,
                }
            else:
                all_s = _period_summary(np.ones_like(dry_valid), pm)
            s_2425 = {"clean_upwind_agri_days": 0, "delta_vs_non_upwind_ug_m3": None, "delta_vs_nofire_ug_m3": None, "sufficiency_status": all_s["sufficiency_status"]}

        prov_t2[pc] = {
            "stations_in_province": n_in_prov,
            "cross_province_outflow_stations": cp_outflow_n,
            **all_s,
            "clean_2024_2025_delta_vs_non_upwind": s_2425.get("delta_vs_non_upwind_ug_m3"),
            "clean_2024_2025_delta_vs_nofire": s_2425.get("delta_vs_nofire_ug_m3"),
            "clean_2024_2025_days": s_2425.get("clean_upwind_agri_days", 0),
        }

    return {
        "window": f"{TRACK2_START.isoformat()}..{TRACK2_END.isoformat()}",
        "transboundary_meta": tb_meta,
        "daily_xlsx_meta": xlsx_meta,
        "fixed_effects_2024_2025": {
            "covariates": fe_names_2425,
            **fe_2425,
        },
        "fixed_effects_2026_h1": {
            "covariates": fe_names_26,
            "transboundary_note": "unavailable_upstream_2026",
            **fe_26,
        },
        "regions": reg_t2,
        "provinces": prov_t2,
    }


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _fmt(val, suffix: str = "") -> str:
    if val is None:
        return "ไม่พอประเมิน"
    return f"{val:+.2f}{suffix}" if isinstance(val, float) else str(val)


def write_outputs(out_dir: Path, provinces: list[dict], stations: list[dict], track1: dict, track2: dict) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "farm_fire_pm25_analysis.json"
    prov_csv_path = out_dir / "farm_fire_pm25_provinces.csv"
    reg_csv_path = out_dir / "farm_fire_pm25_regions.csv"
    report_path = out_dir / "farm_fire_pm25_report.md"

    payload = {
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "methodology": {
            "agri_radius_km": AGRI_RADIUS_KM,
            "spk_radius_km": SPK_RADIUS_KM,
            "forest_radius_km": FOREST_RADIUS_KM,
            "transboundary_radius_km": TRANSBOUNDARY_RADIUS_KM,
            "upwind_cone_deg": UPWIND_CONE_DEG,
            "confounder_cone_deg": CONFOUNDER_CONE_DEG,
            "non_upwind_min_deg": NON_UPWIND_MIN_DEG,
            "min_wind_kmh": MIN_WIND_KMH,
            "gates": {
                "hourly_valid_hours": MIN_HOURLY_VALID_HOURS,
                "hourly_clean_events": MIN_HOURLY_CLEAN_EVENTS,
                "daily_valid_days": MIN_DAILY_VALID_DAYS,
                "daily_clean_days": MIN_DAILY_CLEAN_DAYS,
            },
        },
        "station_coverage": {
            "total_stations": len(stations),
            "provinces_with_in_province_station": len({s["prov_code"] for s in stations}),
            "provinces_without_in_province_station": [
                {"prov_code": p["prov_code"], "prov_name_th": p["prov_name_th"]}
                for p in provinces if not any(s["prov_code"] == p["prov_code"] for s in stations)
            ],
            "unmapped_daily_xlsx_stations": track2["daily_xlsx_meta"]["unmapped_daily_xlsx_stations"],
        },
        "track1_hourly": track1,
        "track2_daily": track2,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")

    # Provinces CSV (all 77 rows)
    prov_rows: list[dict] = []
    for p in provinces:
        pc = p["prov_code"]
        t1 = track1["provinces"][pc]
        t2 = track2["provinces"][pc]
        prov_rows.append({
            "prov_code": pc,
            "prov_name_th": p["prov_name_th"],
            "region": p["region"],
            "stations_in_province": t2["stations_in_province"],
            "cross_province_outflow_stations": t2["cross_province_outflow_stations"],
            "t2_daily_valid_days": t2["valid_days"],
            "t2_clean_upwind_agri_days": t2["clean_upwind_agri_days"],
            "t2_total_upwind_agri_days": t2["total_upwind_agri_days"],
            "t2_clean_non_upwind_days": t2["clean_non_upwind_days"],
            "t2_cross_province_upwind_days": t2["cross_province_upwind_days"],
            "t2_delta_vs_non_upwind_ug_m3": "" if t2["delta_vs_non_upwind_ug_m3"] is None else t2["delta_vs_non_upwind_ug_m3"],
            "t2_ci_low_vs_non_upwind": "" if t2["ci_low_vs_non_upwind"] is None else t2["ci_low_vs_non_upwind"],
            "t2_ci_high_vs_non_upwind": "" if t2["ci_high_vs_non_upwind"] is None else t2["ci_high_vs_non_upwind"],
            "t2_delta_vs_nofire_ug_m3": "" if t2["delta_vs_nofire_ug_m3"] is None else t2["delta_vs_nofire_ug_m3"],
            "t2_ci_low_vs_nofire": "" if t2["ci_low_vs_nofire"] is None else t2["ci_low_vs_nofire"],
            "t2_ci_high_vs_nofire": "" if t2["ci_high_vs_nofire"] is None else t2["ci_high_vs_nofire"],
            "t2_clean_2425_delta_vs_nofire": "" if t2["clean_2024_2025_delta_vs_nofire"] is None else t2["clean_2024_2025_delta_vs_nofire"],
            "t2_sufficiency_status": t2["sufficiency_status"],
            "t1_hourly_valid_hours": t1["valid_hours"],
            "t1_clean_upwind_agri_hours": t1["clean_upwind_agri_hours"],
            "t1_delta_vs_nofire_ug_m3": "" if t1["delta_vs_nofire_ug_m3"] is None else t1["delta_vs_nofire_ug_m3"],
            "t1_sufficiency_status": t1["sufficiency_status"],
        })
    _write_csv(prov_csv_path, list(prov_rows[0].keys()), prov_rows)

    # Regions CSV (6 regions + National)
    reg_rows: list[dict] = []
    for scope in ("National",) + REGIONS_ORDER:
        r1 = track1["regions"][scope]
        r2_all = track2["regions"][scope]["all_2024_2026h1"]
        r2_2425 = track2["regions"][scope]["clean_2024_2025_with_tb_exclusion"]
        r2_26 = track2["regions"][scope]["h1_2026_no_tb_data"]
        reg_rows.append({
            "region": scope,
            "region_th": REGION_TH[scope],
            "stations": r2_all["stations"] if "stations" in r2_all else track2["regions"][scope]["stations"],
            "t2_valid_days": r2_all["valid_days"],
            "t2_clean_upwind_agri_days": r2_all["clean_upwind_agri_days"],
            "t2_delta_vs_non_upwind_ug_m3": "" if r2_all["delta_vs_non_upwind_ug_m3"] is None else r2_all["delta_vs_non_upwind_ug_m3"],
            "t2_ci_low_vs_non_upwind": "" if r2_all["ci_low_vs_non_upwind"] is None else r2_all["ci_low_vs_non_upwind"],
            "t2_ci_high_vs_non_upwind": "" if r2_all["ci_high_vs_non_upwind"] is None else r2_all["ci_high_vs_non_upwind"],
            "t2_delta_vs_nofire_ug_m3": "" if r2_all["delta_vs_nofire_ug_m3"] is None else r2_all["delta_vs_nofire_ug_m3"],
            "t2_2425_clean_tb_delta_vs_non_upwind": "" if r2_2425["delta_vs_non_upwind_ug_m3"] is None else r2_2425["delta_vs_non_upwind_ug_m3"],
            "t2_2425_clean_tb_delta_vs_nofire": "" if r2_2425["delta_vs_nofire_ug_m3"] is None else r2_2425["delta_vs_nofire_ug_m3"],
            "t2_2026h1_delta_vs_nofire": "" if r2_26["delta_vs_nofire_ug_m3"] is None else r2_26["delta_vs_nofire_ug_m3"],
            "t2_sufficiency_status": r2_all["sufficiency_status"],
            "t1_valid_hours": r1["valid_hours"],
            "t1_clean_upwind_agri_hours": r1["clean_upwind_agri_hours"],
            "t1_delta_vs_non_upwind_ug_m3": "" if r1["delta_vs_non_upwind_ug_m3"] is None else r1["delta_vs_non_upwind_ug_m3"],
            "t1_delta_vs_nofire_ug_m3": "" if r1["delta_vs_nofire_ug_m3"] is None else r1["delta_vs_nofire_ug_m3"],
            "t1_sufficiency_status": r1["sufficiency_status"],
        })
    _write_csv(reg_csv_path, list(reg_rows[0].keys()), reg_rows)

    # Thai summary Markdown report
    nat1 = track1["regions"]["National"]
    nat2 = track2["regions"]["National"]["all_2024_2026h1"]
    nat2_2425 = track2["regions"]["National"]["clean_2024_2025_with_tb_exclusion"]
    fe2425 = track2["fixed_effects_2024_2025"]
    suff_provs = [r for r in prov_rows if r["t2_sufficiency_status"].startswith("sufficient")]
    insuff_provs = [r for r in prov_rows if not r["t2_sufficiency_status"].startswith("sufficient")]

    lines = [
        "# รายงานวิเคราะห์จุดความร้อนพื้นที่เกษตร × สถานีตรวจวัด PM2.5 × ทิศทางลมทั่วประเทศ",
        "",
        "## 1. ขอบเขตข้อมูลและวิธีแยกแหล่งควัน",
        f"- สถานีตรวจวัดกรมควบคุมมลพิษ (Air4Thai): **{len(stations)} สถานี** ครอบคลุมที่ตั้งใน **{payload['station_coverage']['provinces_with_in_province_station']}/77 จังหวัด** (อีก 3 จังหวัดที่ไม่มีสถานีในเขต คือ เพชรบุรี พังงา ระนอง จับคู่ด้วยลมพัดข้ามเขตจังหวัด)",
        f"- **สายที่ 1 (รายชั่วโมงช่วงล่าสุด {TRACK1_START} ถึง {TRACK1_END})**: ดาวเทียม VIIRS (`N, N20, N21`) เทียบก่อน–หลังและทิศทางลมรายชั่วโมง (พร้อมตรวจแยก `Suomi-N` ถึง 1 พ.ย. 2569 และลมจากเสาวัดสถานี)",
        f"- **สายที่ 2 (รายวันหลายปี {TRACK2_START} ถึง {TRACK2_END})**: ไฟล์ทางการ Air4Thai รายวัน × ทิศทางลมรายชั่วโมง ERA5 แยก 3 ทาง: ไฟเกษตร (`<=50 กม.`), ไฟป่า (`<=80 กม.`) + ส.ป.ก. (`<=50 กม.`) และควันข้ามแดน (`<=250 กม.` ในปี 2567–2568; ปี 2569 ต้นทาง FIRMS รายประเทศยังไม่เผยแพร่)",
        "",
        "## 2. ผลระดับประเทศ",
        f"- **สายที่ 2 (รายวัน 2567–ครึ่งแรก 2569)**: วันไฟเกษตรอยู่ต้นลมที่ปลอดไฟป่าและควันข้ามแดน `{nat2['clean_upwind_agri_days']:,}` วัน-สถานี เทียบวันที่ไฟเกษตรอยู่คนละทิศลม (`>=90°`): **{_fmt(nat2['delta_vs_non_upwind_ug_m3'], ' µg/m³')}** (95% CI: `[{nat2['ci_low_vs_non_upwind']}, {nat2['ci_high_vs_non_upwind']}]`) | เทียบวันปลอดไฟ: **{_fmt(nat2['delta_vs_nofire_ug_m3'], ' µg/m³')}**",
        f"- **ช่วงปลอดควันข้ามแดนเต็มรูปแบบ (2567–2568)**: เทียบต้นลม vs คนละทิศลม **{_fmt(nat2_2425['delta_vs_non_upwind_ug_m3'], ' µg/m³')}** | เทียบวันปลอดไฟ **{_fmt(nat2_2425['delta_vs_nofire_ug_m3'], ' µg/m³')}**",
        f"- **สมการแยก 3 แหล่ง (Fixed Effects ภายในสถานี×เดือน, 2567–2568, n={fe2425['n_obs']:,})**:",
    ]
    for cname, b, lo, hi in zip(fe2425["covariates"], fe2425["beta"], fe2425["ci_low"], fe2425["ci_high"]):
        lines.append(f"  - `{cname}`: beta = `{b}` (95% CI: `[{lo}, {hi}]`)")

    lines.extend([
        f"- **สายที่ 1 (รายชั่วโมง ก.ย.–17 พ.ย. 2569)**: ชั่วโมงไฟเกษตรต้นลม `{nat1['clean_upwind_agri_hours']:,}` ชม.-สถานี เทียบคนละทิศลม **{_fmt(nat1['delta_vs_non_upwind_ug_m3'], ' µg/m³')}** (95% CI: `[{nat1['ci_low_vs_non_upwind']}, {nat1['ci_high_vs_non_upwind']}]`), ผลกระโดดก่อน–หลัง {track1['before_after_episode_jump']['n_episodes']} เหตุการณ์: **{_fmt(track1['before_after_episode_jump']['mean_jump_ug_m3'], ' µg/m³')}**",
        f"- **ความสอดคล้องทิศทางลมสถานี Air4Thai vs ERA5**: `{track1['anemometer_era5_agreement'].get('n_hours_both_windy', 0):,}` ชม. ต่างกันมัธยฐาน `{track1['anemometer_era5_agreement'].get('median_angular_diff_deg')}`° (ตรงกันใน ±45°: `{track1['anemometer_era5_agreement'].get('pct_within_45deg')}%`)",
        "",
        "## 3. สรุปรายภาค (สายที่ 2: รายวัน 2567–ครึ่งแรก 2569)",
        "| ภาค | สถานี | วันไฟเกษตรต้นลม (ปลอดไฟป่า/ข้ามแดน) | เทียบคนละทิศลม (µg/m³) | เทียบวันปลอดไฟ (µg/m³) | สถานะ |",
        "|---|---:|---:|---:|---:|---|",
    ])
    for r in reg_rows:
        lines.append(
            f"| {r['region_th']} | {r['stations']} | {r['t2_clean_upwind_agri_days']:,} | "
            f"{_fmt(None if r['t2_delta_vs_non_upwind_ug_m3']=='' else r['t2_delta_vs_non_upwind_ug_m3'])} | "
            f"{_fmt(None if r['t2_delta_vs_nofire_ug_m3']=='' else r['t2_delta_vs_nofire_ug_m3'])} | {r['t2_sufficiency_status']} |"
        )

    lines.extend([
        "",
        f"## 4. ความครอบคลุมระดับจังหวัด ({len(suff_provs)}/77 จังหวัดมีข้อมูลเพียงพอ, {len(insuff_provs)} จังหวัดข้อมูลไม่พอหรือถูกปนเปื้อน)",
        "- จังหวัดที่ประเมินได้ในสายรายวัน: " + ", ".join(
            f"{r['prov_name_th']} ({r['t2_delta_vs_nofire_ug_m3']:+.1f} µg/m³)" if r["t2_delta_vs_nofire_ug_m3"] != "" else r["prov_name_th"]
            for r in sorted(suff_provs, key=lambda x: -(x["t2_delta_vs_nofire_ug_m3"] if x["t2_delta_vs_nofire_ug_m3"] != "" else -999))[:15]
        ),
        "- จังหวัดที่ข้อมูลไม่พอ (`insufficient_*`): " + (", ".join(f"{r['prov_name_th']} ({r['t2_sufficiency_status']})" for r in insuff_provs) if insuff_provs else "ไม่มี"),
    ])
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    return {
        "json": json_path,
        "provinces_csv": prov_csv_path,
        "regions_csv": reg_csv_path,
        "report_md": report_path,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    t0 = time.time()
    print("[1/6] Loading 77 provinces & 180 Air4Thai stations...", flush=True)
    provinces, _, stations = load_dimensions_and_stations(args.db)
    prov_to_idx = {p["prov_code"]: i for i, p in enumerate(provinces)}
    print(f"      Mapped {len(stations)} stations across {len({s['prov_code'] for s in stations})}/77 provinces", flush=True)

    print(f"[2/6] Fetching Air4Thai hourly PM2.5/wind ({TRACK1_START}..{TRACK1_END}) & daily XLSX (2024-2026 H1)...", flush=True)
    pm25_hr, ws_st_ms, wd_st_deg = fetch_air4thai_hourly(stations, TRACK1_START, TRACK1_END)
    daily_pm25, xlsx_meta = fetch_air4thai_daily_archive(stations, TRACK2_START, TRACK2_END)
    print(f"      Hourly valid PM2.5 cells: {int(np.isfinite(pm25_hr).sum()):,} | Daily valid PM2.5 cells: {int(np.isfinite(daily_pm25).sum()):,}", flush=True)

    print(f"[3/6] Fetching Open-Meteo ERA5 hourly wind/rain/BLH ({ERA5_START}..{ERA5_END})...", flush=True)
    st_cell_idx, era5_ws, era5_wd, era5_rain, era5_blh = fetch_era5_hourly_for_stations(stations, ERA5_START, ERA5_END)
    print(f"      Fetched {era5_ws.shape[0]} unique 0.25-deg cells x {era5_ws.shape[1]:,} hours", flush=True)

    print("[4/6] Loading Thai VIIRS hotspots (read-only) & 2024-2025 GMS transboundary Parquets (temp dir)...", flush=True)
    hotspots = load_thai_hotspots(args.db, ERA5_START + timedelta(days=1), TRACK1_END, prov_to_idx)
    up_tb_30, up_tb_45, tb_meta = compute_transboundary_daily_exposure(
        stations, st_cell_idx, era5_ws, era5_wd, TRACK2_START, TRACK2_END
    )
    print(f"      Thai hotspots loaded: {len(hotspots['h0']):,} | Transboundary 2024-25 checked: {tb_meta['non_thai_hotspots_checked']}", flush=True)

    print("[5/6] Running Track 1 (hourly plume) & Track 2 (daily 3-way separation)...", flush=True)
    track1 = run_track1_hourly(
        stations, provinces, st_cell_idx, era5_ws, era5_wd, era5_rain, pm25_hr, ws_st_ms, wd_st_deg, hotspots
    )
    track2 = run_track2_daily(
        stations, provinces, st_cell_idx, era5_ws, era5_wd, era5_rain, era5_blh, daily_pm25, hotspots,
        up_tb_30, up_tb_45, tb_meta, xlsx_meta,
    )

    print("[6/6] Writing compact output reports...", flush=True)
    out_paths = write_outputs(args.out_dir, provinces, stations, track1, track2)
    total_kb = sum(p.stat().st_size for p in out_paths.values()) / 1024.0
    print(f"Done in {time.time() - t0:.1f}s | Output total: {total_kb:.1f} KB", flush=True)
    for k, p in out_paths.items():
        print(f"  - {k}: {p} ({p.stat().st_size / 1024:.1f} KB)", flush=True)


if __name__ == "__main__":
    main()
