"""Extract and compress multi-factor Thailand hotspot data for the standalone interactive map."""

from __future__ import annotations

import base64
import json
from pathlib import Path
import zlib
import duckdb

from config import DEFAULT_DB_PATH, REPO_ROOT

DEFAULT_ERA5_PATH = REPO_ROOT / "web" / "data" / "climate-history" / "era5-annual-2016-2025.json"
DEFAULT_TADIH_DB_PATH = REPO_ROOT / "data" / "local" / "tadih.duckdb"

RISK_PRIORITY = {"เสี่ยงสูงมาก": 4, "เสี่ยงสูง": 3, "เสี่ยงปานกลาง": 2, "เสี่ยงต่ำ": 1}


def pack_flags(
    is_other_sat: int,
    yr_idx: int,
    sea_idx: int,
    lu_idx: int,
    crop_idx: int,
    st_idx: int,
) -> int:
    """Pack hotspot dimension keys into a compact 11-bit integer."""
    if not (0 <= is_other_sat <= 1):
        raise ValueError(f"is_other_sat out of range: {is_other_sat}")
    if not (0 <= yr_idx <= 4):
        raise ValueError(f"yr_idx out of range: {yr_idx}")
    if not (0 <= sea_idx <= 3):
        raise ValueError(f"sea_idx out of range: {sea_idx}")
    if not (0 <= lu_idx <= 2):
        raise ValueError(f"lu_idx out of range: {lu_idx}")
    if not (0 <= crop_idx <= 3):
        raise ValueError(f"crop_idx out of range: {crop_idx}")
    if not (0 <= st_idx <= 1):
        raise ValueError(f"st_idx out of range: {st_idx}")
    return (
        is_other_sat
        | (yr_idx << 1)
        | (sea_idx << 4)
        | (lu_idx << 6)
        | (crop_idx << 8)
        | (st_idx << 10)
    )


def unpack_flags(flags: int) -> tuple[int, int, int, int, int, int]:
    """Unpack an 11-bit integer back into (is_other_sat, yr_idx, sea_idx, lu_idx, crop_idx, st_idx)."""
    return (
        flags & 1,
        (flags >> 1) & 7,
        (flags >> 4) & 3,
        (flags >> 6) & 3,
        (flags >> 8) & 3,
        (flags >> 10) & 1,
    )


def encode_payload_b64(payload: dict) -> str:
    """Serialize payload as compact UTF-8 JSON, compress with zlib/gzip, and encode as base64."""
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    # wbits=31 produces standard gzip header/trailer compatible with browser DecompressionStream('gzip').
    comp = zlib.compressobj(level=9, wbits=31)
    gz_bytes = comp.compress(raw) + comp.flush()
    return base64.b64encode(gz_bytes).decode("ascii")


def _clean_ring(ring: list[list[float]], precision: int = 4) -> list[list[float]]:
    cleaned: list[list[float]] = []
    for pt in ring:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            continue
        x = round(float(pt[0]), precision)
        y = round(float(pt[1]), precision)
        if not cleaned or cleaned[-1][0] != x or cleaned[-1][1] != y:
            cleaned.append([x, y])
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1]:
        cleaned.pop()
    return cleaned if len(cleaned) >= 3 else []


def extract_rings(geom_json_str: str | None, precision: int = 4) -> list[list[list[float]]]:
    """Extract rounded polygon rings from Polygon, MultiPolygon, or GeometryCollection GeoJSON."""
    if not geom_json_str:
        return []
    geom = json.loads(geom_json_str)
    rings: list[list[list[float]]] = []

    def _walk(node: dict) -> None:
        gtype = node.get("type")
        if gtype == "Polygon":
            for r in node.get("coordinates") or []:
                c = _clean_ring(r, precision=precision)
                if c:
                    rings.append(c)
        elif gtype == "MultiPolygon":
            for poly in node.get("coordinates") or []:
                for r in poly:
                    c = _clean_ring(r, precision=precision)
                    if c:
                        rings.append(c)
        elif gtype == "GeometryCollection":
            for child in node.get("geometries") or []:
                if isinstance(child, dict):
                    _walk(child)

    _walk(geom)
    return rings


def _load_era5(era5_path: Path) -> tuple[dict[str, dict], dict[str, dict]]:
    if not era5_path.exists():
        return {}, {}
    raw = json.loads(era5_path.read_text(encoding="utf-8"))
    provinces = raw.get("provinces") or {}
    years_out: dict[str, dict] = {}
    meta_out: dict[str, dict] = {}
    items = provinces.values() if isinstance(provinces, dict) else provinces
    for item in items:
        code = str(item.get("province_code") or "").zfill(2)
        if not code:
            continue
        meta_out[code] = {
            "region": item.get("region") or "",
            "lat": item.get("requested_latitude"),
            "lon": item.get("requested_longitude"),
        }
        years_map: dict[str, dict] = {}
        for y in item.get("years") or []:
            yr = y.get("year")
            if yr is not None and 2016 <= int(yr) <= 2026:
                years_map[str(int(yr))] = {
                    "tmean_c": y.get("tmean_c"),
                    "tmax_mean_c": y.get("tmax_mean_c"),
                    "tmin_mean_c": y.get("tmin_mean_c"),
                    "hot_days_38c": y.get("hot_days_38c"),
                    "rainfall_total_mm": y.get("rainfall_total_mm"),
                    "longest_dry_spell_days": y.get("longest_dry_spell_days"),
                    "dry_spell_events_5d": y.get("dry_spell_events_5d"),
                }
        years_out[code] = years_map
    return years_out, meta_out


def _load_fire_weather(
    con: duckdb.DuckDBPyConnection,
    existing_tables: set[str],
) -> tuple[list[str], dict[str, list], dict[str, dict]]:
    if "era5_monthly_fire_weather" not in existing_tables:
        return [], {}, {}

    months = [
        str(r[0])
        for r in con.execute(
            "SELECT DISTINCT ym FROM era5_monthly_fire_weather WHERE ym IS NOT NULL ORDER BY 1"
        ).fetchall()
    ]
    m_idx = {ym: idx for idx, ym in enumerate(months)}
    rows = con.execute("""
        SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
               ym, year_th, month_th,
               round(tmax_mean_c, 1), round(tmean_c, 1), round(rain_mm, 1),
               round(rh_min_mean_pct, 1), round(wind_max_mean_kmh, 1),
               round(et0_sum_mm, 1), dry_days, hot_days_35c,
               round(fire_weather_index, 1), hot_days_38c, low_rh_days_35pct
        FROM era5_monthly_fire_weather
        ORDER BY pcode, ym
    """).fetchall()

    wx_m: dict[str, list] = {}
    yr_acc: dict[tuple[str, str], list] = {}
    for pcode, ym, yr, mo, tmax, tmean, rain, rhmin, wind, et0, dry_d, hot35, fwi, hot38, low_rh in rows:
        arr = wx_m.setdefault(pcode, [None] * len(months))
        arr[m_idx[str(ym)]] = [tmax, tmean, rain, rhmin, wind, et0, dry_d, hot35, fwi]
        yr_acc.setdefault((pcode, str(yr)), []).append(
            (mo, tmax, tmean, rain, rhmin, wind, et0, dry_d, hot35, fwi, hot38, low_rh)
        )

    wx_y: dict[str, dict] = {}
    for (pcode, yr_s), items in yr_acc.items():
        def _avg(idx_c):
            vals = [x[idx_c] for x in items if x[idx_c] is not None]
            return round(sum(vals) / len(vals), 1) if vals else None

        def _sum(idx_c):
            vals = [x[idx_c] for x in items if x[idx_c] is not None]
            return round(sum(vals), 1) if vals else None

        peak_fwis = [x[9] for x in items if 1 <= x[0] <= 4 and x[9] is not None]
        wx_y.setdefault(pcode, {})[yr_s] = {
            "months": len(items),
            "tmax": _avg(1),
            "tmean": _avg(2),
            "rain": _sum(3),
            "rh_min": _avg(4),
            "wind_max": _avg(5),
            "et0": _sum(6),
            "dry_days": int(_sum(7) or 0),
            "hot_35": int(_sum(8) or 0),
            "fwi": _avg(9),
            "peak_fwi": round(sum(peak_fwis) / len(peak_fwis), 1) if peak_fwis else None,
            "hot_38": int(_sum(10) or 0),
            "low_rh_35": int(_sum(11) or 0),
        }

    return months, wx_m, wx_y


def _load_hotspots_monthly(
    con: duckdb.DuckDBPyConnection,
    weather_months: list[str],
) -> tuple[list[str], dict[str, list]]:
    months = list(weather_months)
    if not months:
        months = [
            f"{int(r[0]):04d}-{int(r[1]):02d}"
            for r in con.execute("""
                SELECT DISTINCT year_th, month_th
                FROM hotspots
                WHERE year_th BETWEEN 2022 AND 2026 AND month_th BETWEEN 1 AND 12
                ORDER BY 1, 2
            """).fetchall()
        ]
    m_idx = {ym: idx for idx, ym in enumerate(months)}
    rows = con.execute("""
        SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
               year_th, month_th,
               count(*) FILTER (WHERE satellite = 'N' AND NOT is_suspected_static) AS n_tot,
               count(*) FILTER (WHERE satellite = 'N' AND NOT is_suspected_static AND lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS n_agri,
               count(*) FILTER (WHERE satellite = 'N' AND NOT is_suspected_static AND lu_name LIKE 'ป่า%') AS n_for,
               count(*) FILTER (WHERE NOT is_suspected_static) AS all_tot,
               count(*) FILTER (WHERE NOT is_suspected_static AND lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS all_agri,
               count(*) FILTER (WHERE NOT is_suspected_static AND lu_name LIKE 'ป่า%') AS all_for
        FROM hotspots
        WHERE year_th BETWEEN 2022 AND 2026 AND month_th BETWEEN 1 AND 12
        GROUP BY 1, 2, 3
    """).fetchall()
    out: dict[str, list] = {}
    for pcode, yr, mo, nt, na, nf, at, aa, af in rows:
        ym = f"{int(yr):04d}-{int(mo):02d}"
        if ym not in m_idx:
            continue
        arr = out.setdefault(str(pcode), [[0, 0, 0, 0, 0, 0] for _ in months])
        arr[m_idx[ym]] = [int(nt), int(na), int(nf), int(at), int(aa), int(af)]
    return months, out


def _load_flood_risk(tadih_db_path: Path | None) -> tuple[dict[str, dict], dict[str, dict], dict[str, dict]]:
    if tadih_db_path is None or not Path(tadih_db_path).exists():
        return {}, {}, {}
    con = duckdb.connect(str(tadih_db_path), read_only=True)
    try:
        tables = {r[0] for r in con.execute("SHOW TABLES").fetchall()}
        if "fact_flood_risk_forecast" not in tables:
            return {}, {}, {}

        tambon_rows = con.execute("""
            SELECT dopa_tambon_code,
                   dopa_amphoe_code,
                   dopa_province_code,
                   max(recurrence_17yr_count) AS max_rec,
                   count(DISTINCT month) AS months_cnt,
                   max(CASE risk_level
                         WHEN 'เสี่ยงสูงมาก' THEN 4
                         WHEN 'เสี่ยงสูง' THEN 3
                         WHEN 'เสี่ยงปานกลาง' THEN 2
                         WHEN 'เสี่ยงต่ำ' THEN 1
                         ELSE 0 END) AS risk_rank
            FROM fact_flood_risk_forecast
            WHERE dopa_tambon_code IS NOT NULL AND recurrence_17yr_count IS NOT NULL
            GROUP BY dopa_tambon_code, dopa_amphoe_code, dopa_province_code
        """).fetchall()
    finally:
        con.close()

    rank_to_label = {4: "เสี่ยงสูงมาก", 3: "เสี่ยงสูง", 2: "เสี่ยงปานกลาง", 1: "เสี่ยงต่ำ"}
    tambon_map: dict[str, dict] = {}
    amphoe_acc: dict[str, list[tuple[int, int]]] = {}
    prov_acc: dict[str, list[tuple[int, int]]] = {}

    for tcode, acode, pcode, max_rec, mcnt, rrank in tambon_rows:
        tcode_s = str(tcode)
        acode_s = str(acode)
        pcode_s = str(pcode).zfill(2)
        tambon_map[tcode_s] = {
            "max_17yr": int(max_rec),
            "months": int(mcnt),
            "risk_level": rank_to_label.get(int(rrank or 0), "เสี่ยงต่ำ"),
            "risk_rank": int(rrank or 0),
        }
        amphoe_acc.setdefault(acode_s, []).append((int(max_rec), int(rrank or 0)))
        prov_acc.setdefault(pcode_s, []).append((int(max_rec), int(rrank or 0)))

    def _rollup(acc: dict[str, list[tuple[int, int]]]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for code, vals in acc.items():
            recs = [v[0] for v in vals]
            ranks = [v[1] for v in vals]
            high_cnt = sum(1 for r in ranks if r >= 3)
            out[code] = {
                "max_17yr": max(recs),
                "avg_17yr": round(sum(recs) / len(recs), 2),
                "matched_tambons": len(vals),
                "high_tambons": high_cnt,
            }
        return out

    return tambon_map, _rollup(amphoe_acc), _rollup(prov_acc)


def _load_burn_stats(con: duckdb.DuckDBPyConnection, existing_tables: set[str]) -> tuple[dict, dict]:
    scar_maps: dict[str, dict[str, dict]] = {"prov": {}, "amphoe": {}, "tambon": {}}
    freq_maps: dict[str, dict[str, dict]] = {"prov": {}, "amphoe": {}, "tambon": {}}

    if "gistda_burn_scar" in existing_tables:
        for level, col_expr in (
            ("prov", "prov_code"),
            ("amphoe", "CAST(amphoe_code AS VARCHAR)"),
            ("tambon", "CAST(tambon_code AS VARCHAR)"),
        ):
            rows = con.execute(f"""
                SELECT {col_expr} AS code,
                       count(*) AS polys,
                       round(sum(area_rai), 2) AS rai,
                       round(coalesce(sum(area_rai) FILTER (WHERE rp_name IN ('พื้นที่เกษตร', 'เขตปฏิรูปที่ดินเพื่อเกษตรกรรม')), 0), 2) AS agri_rai,
                       round(coalesce(sum(area_rai) FILTER (WHERE rp_name LIKE 'ป่า%'), 0), 2) AS forest_rai
                FROM gistda_burn_scar
                WHERE {col_expr} IS NOT NULL
                GROUP BY 1
            """).fetchall()
            scar_maps[level] = {
                str(r[0]): {"polys": int(r[1]), "rai": float(r[2] or 0.0), "agri_rai": float(r[3] or 0.0), "forest_rai": float(r[4] or 0.0)}
                for r in rows
            }

    if "gistda_burn_freq" in existing_tables:
        for level, col_expr in (
            ("prov", "prov_code"),
            ("amphoe", "CAST(amphoe_code AS VARCHAR)"),
            ("tambon", "CAST(tambon_code AS VARCHAR)"),
        ):
            rows = con.execute(f"""
                SELECT {col_expr} AS code,
                       count(*) AS polys,
                       round(sum(area_rai), 2) AS rai,
                       round(avg(freq), 2) AS avg_freq,
                       max(freq) AS max_freq,
                       round(coalesce(sum(area_rai) FILTER (WHERE freq >= 3), 0), 2) AS freq3plus_rai
                FROM gistda_burn_freq
                WHERE {col_expr} IS NOT NULL
                GROUP BY 1
            """).fetchall()
            freq_maps[level] = {
                str(r[0]): {
                    "polys": int(r[1]),
                    "rai": float(r[2] or 0.0),
                    "avg_freq": float(r[3] or 0.0),
                    "max_freq": int(r[4] or 0),
                    "freq3plus_rai": float(r[5] or 0.0),
                }
                for r in rows
            }

    return scar_maps, freq_maps


def _load_tamroypao_stats(
    con: duckdb.DuckDBPyConnection,
    existing_tables: set[str],
) -> tuple[dict[str, dict[str, dict[str, list[float]]]], set[str], list[int]]:
    trp_maps: dict[str, dict[str, dict[str, list[float]]]] = {"prov": {}, "amphoe": {}, "tambon": {}}
    if "tamroypao_burn_tambon" not in existing_tables:
        return trp_maps, set(), []

    covered_provs = {
        str(r[0]).zfill(2)
        for r in con.execute(
            "SELECT DISTINCT lpad(CAST(prov_code AS VARCHAR), 2, '0') FROM tamroypao_burn_tambon WHERE prov_code IS NOT NULL"
        ).fetchall()
    }
    trp_years = [
        int(r[0])
        for r in con.execute(
            "SELECT DISTINCT year_th FROM tamroypao_burn_tambon WHERE year_th IS NOT NULL ORDER BY 1"
        ).fetchall()
    ]

    for level, col_expr in (
        ("prov", "lpad(CAST(prov_code AS VARCHAR), 2, '0')"),
        ("amphoe", "CAST(amphoe_code AS VARCHAR)"),
        ("tambon", "CAST(tambon_code AS VARCHAR)"),
    ):
        rows = con.execute(f"""
            SELECT {col_expr} AS code,
                   CAST(year_th AS VARCHAR) AS yr,
                   round(coalesce(sum(paddy_rai), 0), 1) AS paddy,
                   round(coalesce(sum(sugarcane_rai), 0), 1) AS sugar,
                   round(coalesce(sum(corn_rai), 0), 1) AS corn,
                   round(coalesce(sum(mixed_rai), 0), 1) AS mixed,
                   round(coalesce(sum(forest_rai), 0), 1) AS forest
            FROM tamroypao_burn_tambon
            WHERE {col_expr} IS NOT NULL
            GROUP BY 1, 2
        """).fetchall()
        lvl_map: dict[str, dict[str, list[float]]] = {}
        for code, yr, paddy, sugar, corn, mixed, forest in rows:
            vals = [float(paddy), float(sugar), float(corn), float(mixed), float(forest)]
            if any(v > 0 for v in vals):
                lvl_map.setdefault(str(code), {})[str(yr)] = vals
            else:
                lvl_map.setdefault(str(code), {})
        trp_maps[level] = lvl_map

    return trp_maps, covered_provs, trp_years


def _load_air_quality(
    con: duckdb.DuckDBPyConnection,
    existing_tables: set[str],
    timeline_months: list[str],
) -> tuple[dict[str, list], dict[str, dict], dict | None]:
    if "air_quality_monthly_77prov" not in existing_tables:
        return {}, {}, None
    m_idx = {ym: idx for idx, ym in enumerate(timeline_months)}
    rows = con.execute("""
        SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
               ym, year_th, month_th,
               round(pm25_mean, 1), round(pm25_max, 1), round(co_mean, 0),
               round(aod_mean, 2), days_exceed_37_5, days_exceed_15_who
        FROM air_quality_monthly_77prov
        ORDER BY pcode, ym
    """).fetchall()
    aq_m: dict[str, list] = {}
    yr_acc: dict[tuple[str, str], list] = {}
    for pcode, ym, yr, mo, pm, pmx, co, aod, exc37, exc15 in rows:
        if str(ym) in m_idx:
            arr = aq_m.setdefault(pcode, [None] * len(timeline_months))
            arr[m_idx[str(ym)]] = [pm, pmx, co, aod, exc37]
        yr_acc.setdefault((pcode, str(yr)), []).append((mo, pm, pmx, co, aod, exc37, exc15))

    aq_y: dict[str, dict] = {}
    for (pcode, yr_s), items in yr_acc.items():
        def _avg(idx_c, dec=1):
            vals = [x[idx_c] for x in items if x[idx_c] is not None]
            return round(sum(vals) / len(vals), dec) if vals else None

        def _sum_i(idx_c):
            vals = [x[idx_c] for x in items if x[idx_c] is not None]
            return int(sum(vals)) if vals else None

        peak_pms = [x[1] for x in items if 1 <= x[0] <= 4 and x[1] is not None]
        peak_cos = [x[3] for x in items if 1 <= x[0] <= 4 and x[3] is not None]
        peak_aods = [x[4] for x in items if 1 <= x[0] <= 4 and x[4] is not None]
        pm_maxs = [x[2] for x in items if x[2] is not None]
        aq_y.setdefault(pcode, {})[yr_s] = {
            "pm25_mean": _avg(1, 1),
            "pm25_peak": round(sum(peak_pms) / len(peak_pms), 1) if peak_pms else None,
            "pm25_max": round(max(pm_maxs), 1) if pm_maxs else None,
            "days_37_5": _sum_i(5),
            "days_15": _sum_i(6),
            "co_peak": round(sum(peak_cos) / len(peak_cos), 0) if peak_cos else None,
            "aod_peak": round(sum(peak_aods) / len(peak_aods), 2) if peak_aods else None,
            "max_streak_37_5": 0,
            "peak_day": None,
        }

    aq_daily_summary = None
    if "air_quality_daily_77prov" in existing_tables:
        streak_rows = con.execute("""
            WITH r AS (
                SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
                       year_th, date, pm25_mean,
                       CASE WHEN pm25_mean > 37.5 THEN 1 ELSE 0 END AS is_ex
                FROM air_quality_daily_77prov
                WHERE pm25_mean IS NOT NULL
            ),
            g AS (
                SELECT pcode, year_th, date, is_ex,
                       row_number() OVER (PARTITION BY pcode, year_th ORDER BY date)
                       - row_number() OVER (PARTITION BY pcode, year_th, is_ex ORDER BY date) AS grp
                FROM r
            ),
            st AS (
                SELECT pcode, year_th, count(*) AS streak,
                       CAST(min(date) AS VARCHAR) AS start_d,
                       CAST(max(date) AS VARCHAR) AS end_d,
                       row_number() OVER (PARTITION BY pcode, year_th ORDER BY count(*) DESC, min(date)) AS rn
                FROM g
                WHERE is_ex = 1
                GROUP BY pcode, year_th, grp
            )
            SELECT pcode, CAST(year_th AS VARCHAR), streak, start_d, end_d
            FROM st
            WHERE rn = 1
        """).fetchall()
        for pcode, yr_s, streak, sd, ed in streak_rows:
            if pcode in aq_y and yr_s in aq_y[pcode]:
                aq_y[pcode][yr_s]["max_streak_37_5"] = int(streak)
                aq_y[pcode][yr_s]["streak_range"] = [sd, ed]

        peak_day_rows = con.execute("""
            WITH pk AS (
                SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
                       CAST(year_th AS VARCHAR) AS yr_s,
                       round(pm25_mean, 1) AS pm_mean,
                       round(pm25_max, 1) AS pm_max,
                       CAST(date AS VARCHAR) AS d_str,
                       row_number() OVER (PARTITION BY prov_code, year_th ORDER BY pm25_mean DESC, pm25_max DESC) AS rn
                FROM air_quality_daily_77prov
                WHERE pm25_mean IS NOT NULL
            )
            SELECT pcode, yr_s, pm_mean, pm_max, d_str
            FROM pk
            WHERE rn = 1
        """).fetchall()
        for pcode, yr_s, pmm, pmx, d_str in peak_day_rows:
            if pcode in aq_y and yr_s in aq_y[pcode]:
                aq_y[pcode][yr_s]["peak_day"] = [float(pmm), d_str, float(pmx or pmm)]

        lag_row = con.execute("""
            WITH hs AS (
                SELECT acq_date_th AS d,
                       count(*) FILTER (WHERE satellite = 'N' AND NOT is_suspected_static) AS hs_n,
                       count(*) FILTER (WHERE satellite = 'N' AND NOT is_suspected_static
                                        AND lpad(CAST(prov_code AS VARCHAR), 2, '0') IN ('50','51','52','53','54','55','56','57','58','63')) AS hs_north
                FROM hotspots
                WHERE year_th BETWEEN 2022 AND 2026 AND month_th BETWEEN 1 AND 4
                GROUP BY 1
            ),
            aq AS (
                SELECT date AS d,
                       avg(pm25_mean) AS pm_nat,
                       avg(CASE WHEN lpad(CAST(prov_code AS VARCHAR), 2, '0') IN ('50','51','52','53','54','55','56','57','58','63')
                                THEN pm25_mean END) AS pm_north
                FROM air_quality_daily_77prov
                WHERE year_th BETWEEN 2022 AND 2026 AND month_th BETWEEN 1 AND 4
                GROUP BY 1
            )
            SELECT round(corr(h.hs_n, a0.pm_north), 3),
                   round(corr(h.hs_n, a1.pm_north), 3),
                   round(corr(h.hs_n, a2.pm_north), 3),
                   round(corr(h.hs_n, a3.pm_north), 3),
                   round(corr(h.hs_n, a4.pm_north), 3),
                   round(corr(h.hs_n, a5.pm_north), 3),
                   round(corr(h.hs_n, a0.pm_nat), 3),
                   round(corr(h.hs_n, a2.pm_nat), 3),
                   round(corr(h.hs_n, a3.pm_nat), 3)
            FROM hs h
            JOIN aq a0 ON a0.d = h.d
            JOIN aq a1 ON a1.d = h.d + INTERVAL 1 DAY
            JOIN aq a2 ON a2.d = h.d + INTERVAL 2 DAY
            JOIN aq a3 ON a3.d = h.d + INTERVAL 3 DAY
            JOIN aq a4 ON a4.d = h.d + INTERVAL 4 DAY
            JOIN aq a5 ON a5.d = h.d + INTERVAL 5 DAY
        """).fetchone()

        top_spikes = con.execute("""
            SELECT lpad(CAST(a.prov_code AS VARCHAR), 2, '0') AS pcode,
                   p.prov_name_th,
                   CAST(a.date AS VARCHAR) AS d_str,
                   round(a.pm25_mean, 1) AS pm_mean,
                   round(a.pm25_max, 1) AS pm_max,
                   a.us_aqi_max
            FROM air_quality_daily_77prov a
            LEFT JOIN dim_province p ON lpad(CAST(a.prov_code AS VARCHAR), 2, '0') = p.prov_code
            WHERE a.pm25_mean IS NOT NULL
            ORDER BY a.pm25_mean DESC
            LIMIT 20
        """).fetchall()

        aq_daily_summary = {
            "total_rows": int(con.execute("SELECT count(*) FROM air_quality_daily_77prov").fetchone()[0]),
            "lag_corr_north": [float(lag_row[i] or 0.0) for i in range(6)] if lag_row else [0, 0, 0, 0, 0, 0],
            "lag_corr_nat": [
                float(lag_row[6] or 0.0) if lag_row else 0.0,
                float(lag_row[7] or 0.0) if lag_row else 0.0,
                float(lag_row[8] or 0.0) if lag_row else 0.0,
            ],
            "top_spikes": [
                {
                    "prov_code": r[0],
                    "prov": r[1] or r[0],
                    "date": r[2],
                    "pm25_mean": float(r[3]),
                    "pm25_max": float(r[4] or r[3]),
                    "aqi": int(r[5] or 0),
                }
                for r in top_spikes
            ],
        }
    return aq_m, aq_y, aq_daily_summary


def _load_nasa_soil(
    con: duckdb.DuckDBPyConnection,
    existing_tables: set[str],
    timeline_months: list[str],
) -> tuple[dict[str, list], dict[str, dict], list[dict]]:
    if "nasa_power_soil_monthly" not in existing_tables:
        return {}, {}, []
    m_idx = {ym: idx for idx, ym in enumerate(timeline_months)}
    rows = con.execute("""
        SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
               ym, year_th, month_th,
               round(gwettop_mean, 3), round(gwetroot_mean, 3),
               round(solar_mj_mean, 1), dry_soil_days_lt_035
        FROM nasa_power_soil_monthly
        ORDER BY pcode, ym
    """).fetchall()
    soil_m: dict[str, list] = {}
    yr_acc: dict[tuple[str, str], list] = {}
    for pcode, ym, yr, mo, gt, gr, sol, dry_d in rows:
        if str(ym) in m_idx:
            arr = soil_m.setdefault(pcode, [None] * len(timeline_months))
            arr[m_idx[str(ym)]] = [gt, gr, sol]
        yr_acc.setdefault((pcode, str(yr)), []).append((mo, gt, gr, dry_d))

    soil_y: dict[str, dict] = {}
    for (pcode, yr_s), items in yr_acc.items():
        peak_gt = [x[1] for x in items if 1 <= x[0] <= 4 and x[1] is not None]
        peak_gr = [x[2] for x in items if 1 <= x[0] <= 4 and x[2] is not None]
        dry_vals = [x[3] for x in items if x[3] is not None]
        soil_y.setdefault(pcode, {})[yr_s] = {
            "gwettop_peak": round(sum(peak_gt) / len(peak_gt), 3) if peak_gt else None,
            "gwetroot_peak": round(sum(peak_gr) / len(peak_gr), 3) if peak_gr else None,
            "dry_soil_days": int(sum(dry_vals)) if dry_vals else None,
            "max_dry_streak": 0,
            "streak_range": None,
        }

    early_warnings: list[dict] = []
    if "nasa_power_soil_daily" in existing_tables:
        streak_rows = con.execute("""
            WITH r AS (
                SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
                       year_th, date, gwettop,
                       CASE WHEN gwettop < 0.38 THEN 1 ELSE 0 END AS is_dry
                FROM nasa_power_soil_daily
                WHERE gwettop IS NOT NULL
            ),
            g AS (
                SELECT pcode, year_th, date, is_dry, gwettop,
                       row_number() OVER (PARTITION BY pcode, year_th ORDER BY date)
                       - row_number() OVER (PARTITION BY pcode, year_th, is_dry ORDER BY date) AS grp
                FROM r
            ),
            st AS (
                SELECT pcode, year_th, count(*) AS streak,
                       round(min(gwettop), 3) AS min_gw,
                       CAST(min(date) AS VARCHAR) AS start_d,
                       CAST(max(date) AS VARCHAR) AS end_d,
                       row_number() OVER (PARTITION BY pcode, year_th ORDER BY count(*) DESC, min(date)) AS rn
                FROM g
                WHERE is_dry = 1
                GROUP BY pcode, year_th, grp
            )
            SELECT pcode, CAST(year_th AS VARCHAR), streak, min_gw, start_d, end_d
            FROM st
            WHERE rn = 1
        """).fetchall()
        for pcode, yr_s, streak, min_gw, sd, ed in streak_rows:
            if pcode in soil_y and yr_s in soil_y[pcode]:
                soil_y[pcode][yr_s]["max_dry_streak"] = int(streak)
                soil_y[pcode][yr_s]["min_gwettop"] = float(min_gw) if min_gw is not None else None
                soil_y[pcode][yr_s]["streak_range"] = [sd, ed]

        ew_rows = con.execute("""
            WITH r AS (
                SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
                       year_th, date, month_th, gwettop,
                       CASE WHEN gwettop < 0.38 THEN 1 ELSE 0 END AS is_dry
                FROM nasa_power_soil_daily
                WHERE gwettop IS NOT NULL
            ),
            g AS (
                SELECT pcode, year_th, date, is_dry, gwettop,
                       row_number() OVER (PARTITION BY pcode, year_th ORDER BY date)
                       - row_number() OVER (PARTITION BY pcode, year_th, is_dry ORDER BY date) AS grp
                FROM r
            ),
            st AS (
                SELECT pcode, year_th, count(*) AS streak,
                       round(min(gwettop), 3) AS min_gw,
                       CAST(min(date) AS VARCHAR) AS start_d,
                       CAST(max(date) AS VARCHAR) AS end_d
                FROM g
                WHERE is_dry = 1
                GROUP BY pcode, year_th, grp
            ),
            p_max AS (
                SELECT pcode,
                       max(streak) AS max_streak_5y,
                       max(streak) FILTER (WHERE year_th = 2025) AS streak_2025,
                       max(streak) FILTER (WHERE year_th = 2024) AS streak_2024,
                       min(min_gw) AS min_gw_5y,
                       arg_max(start_d || ' ถึง ' || end_d, streak) AS peak_period
                FROM st
                GROUP BY pcode
            )
            SELECT m.pcode, p.prov_name_th, m.max_streak_5y,
                   coalesce(m.streak_2025, 0), coalesce(m.streak_2024, 0),
                   m.min_gw_5y, m.peak_period
            FROM p_max m
            LEFT JOIN dim_province p ON m.pcode = p.prov_code
            ORDER BY m.max_streak_5y DESC
        """).fetchall()
        for pcode, pname, s5y, s25, s24, mgw, prd in ew_rows:
            s_val = int(s5y or 0)
            tier = "วิกฤต (แห้งติดกัน ≥60 วัน)" if s_val >= 60 else (
                "เฝ้าระวังสูง (30–59 วัน)" if s_val >= 30 else (
                    "เฝ้าระวัง (14–29 วัน)" if s_val >= 14 else "ปกติ (<14 วัน)"
                )
            )
            early_warnings.append({
                "prov_code": pcode,
                "prov": pname or pcode,
                "max_streak_5y": s_val,
                "streak_2025": int(s25 or 0),
                "streak_2024": int(s24 or 0),
                "min_gwettop": float(mgw) if mgw is not None else None,
                "peak_period": prd,
                "tier": tier,
            })

    return soil_m, soil_y, early_warnings


def _load_doae_crops(
    con: duckdb.DuckDBPyConnection,
    existing_tables: set[str],
) -> tuple[dict[str, dict], dict[str, list[int]], dict[str, list[int]]]:
    prov_out: dict[str, dict] = {}
    if "doae_fire_crops_province" in existing_tables:
        rows = con.execute("""
            SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
                   paddy_rai, sugarcane_rai, corn_rai, cassava_rai
            FROM doae_fire_crops_province
        """).fetchall()
        for pcode, paddy, sugar, corn, cass in rows:
            prov_out[pcode] = {
                "paddy_rai": round(float(paddy), 0) if paddy is not None else None,
                "sugarcane_rai": round(float(sugar), 0) if sugar is not None else None,
                "corn_rai": round(float(corn), 0) if corn is not None else None,
                "cassava_rai": round(float(cass), 0) if cassava is not None else None,
            } if False else {
                "paddy_rai": round(float(paddy), 0) if paddy is not None else None,
                "sugarcane_rai": round(float(sugar), 0) if sugar is not None else None,
                "corn_rai": round(float(corn), 0) if corn is not None else None,
                "cassava_rai": round(float(cass), 0) if cass is not None else None,
            }

    amp_doae: dict[str, list[int]] = {}
    tb_doae: dict[str, list[int]] = {}
    if "doae_crop_tambon" in existing_tables:
        # Match DOAE tambon planted area (source_year_be = 2566) to dim_tambon and rollup to dim_amphoe
        tb_rows = con.execute("""
            WITH d AS (
                SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
                       trim(regexp_replace(amphoe_name_th, '^(อำเภอ|เขต)', '')) AS aname,
                       trim(regexp_replace(tambon_name_th, '^(ตำบล|แขวง)', '')) AS tname,
                       sum(CASE WHEN crop_name IN ('ข้าวนาปี', 'ข้าวนาปรัง', 'ข้าวไร่') THEN coalesce(planted_rai, 0) ELSE 0 END) AS paddy_rai,
                       sum(CASE WHEN crop_name = 'อ้อยโรงงาน' THEN coalesce(planted_rai, 0) ELSE 0 END) AS sugar_rai,
                       sum(CASE WHEN crop_name IN ('ข้าวโพดเลี้ยงสัตว์', 'ข้าวโพดเลี้ยงสัตว์(เมล็ดพันธุ์)', 'ข้าวโพดเลี้ยงสัตว์(ต้นสด)') THEN coalesce(planted_rai, 0) ELSE 0 END) AS corn_rai,
                       sum(CASE WHEN crop_name = 'มันสำปะหลังโรงงาน' THEN coalesce(planted_rai, 0) ELSE 0 END) AS cass_rai
                FROM doae_crop_tambon
                WHERE source_year_be = 2566
                  AND crop_name IN (
                      'ข้าวนาปี', 'ข้าวนาปรัง', 'ข้าวไร่',
                      'อ้อยโรงงาน',
                      'ข้าวโพดเลี้ยงสัตว์', 'ข้าวโพดเลี้ยงสัตว์(เมล็ดพันธุ์)', 'ข้าวโพดเลี้ยงสัตว์(ต้นสด)',
                      'มันสำปะหลังโรงงาน'
                  )
                GROUP BY 1, 2, 3
            ),
            tb AS (
                SELECT tb.prov_code, tb.amphoe_code, tb.tambon_code, p.prov_name_th,
                       trim(regexp_replace(tb.amphoe_name_th, '^(อำเภอ|เขต)', '')) AS aname_clean,
                       trim(regexp_replace(tb.tambon_name_th, '^(ตำบล|แขวง)', '')) AS tname_clean
                FROM dim_tambon tb
                JOIN dim_province p ON tb.prov_code = p.prov_code
            )
            SELECT tb.tambon_code, tb.amphoe_code,
                   CAST(round(sum(d.paddy_rai)) AS BIGINT),
                   CAST(round(sum(d.sugar_rai)) AS BIGINT),
                   CAST(round(sum(d.corn_rai)) AS BIGINT),
                   CAST(round(sum(d.cass_rai)) AS BIGINT)
            FROM d
            JOIN tb
              ON d.pcode = tb.prov_code
             AND (d.aname = tb.aname_clean OR (d.aname = 'เมือง' AND tb.aname_clean = 'เมือง' || tb.prov_name_th))
             AND d.tname = tb.tname_clean
            GROUP BY 1, 2
        """).fetchall()
        for tcode, acode, pad, sug, crn, cas in tb_rows:
            tot3 = int(pad or 0) + int(sug or 0) + int(crn or 0)
            if tot3 > 0 or int(cas or 0) > 0:
                tb_doae[str(tcode)] = [int(pad or 0), int(sug or 0), int(crn or 0), int(cas or 0), tot3]

        # Also match at amphoe level directly so even tambons with spelling variance contribute to their amphoe
        amp_rows = con.execute("""
            WITH d AS (
                SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
                       trim(regexp_replace(amphoe_name_th, '^(อำเภอ|เขต)', '')) AS aname,
                       sum(CASE WHEN crop_name IN ('ข้าวนาปี', 'ข้าวนาปรัง', 'ข้าวไร่') THEN coalesce(planted_rai, 0) ELSE 0 END) AS paddy_rai,
                       sum(CASE WHEN crop_name = 'อ้อยโรงงาน' THEN coalesce(planted_rai, 0) ELSE 0 END) AS sugar_rai,
                       sum(CASE WHEN crop_name IN ('ข้าวโพดเลี้ยงสัตว์', 'ข้าวโพดเลี้ยงสัตว์(เมล็ดพันธุ์)', 'ข้าวโพดเลี้ยงสัตว์(ต้นสด)') THEN coalesce(planted_rai, 0) ELSE 0 END) AS corn_rai,
                       sum(CASE WHEN crop_name = 'มันสำปะหลังโรงงาน' THEN coalesce(planted_rai, 0) ELSE 0 END) AS cass_rai
                FROM doae_crop_tambon
                WHERE source_year_be = 2566
                  AND crop_name IN (
                      'ข้าวนาปี', 'ข้าวนาปรัง', 'ข้าวไร่',
                      'อ้อยโรงงาน',
                      'ข้าวโพดเลี้ยงสัตว์', 'ข้าวโพดเลี้ยงสัตว์(เมล็ดพันธุ์)', 'ข้าวโพดเลี้ยงสัตว์(ต้นสด)',
                      'มันสำปะหลังโรงงาน'
                  )
                GROUP BY 1, 2
            ),
            a AS (
                SELECT a.prov_code, a.amphoe_code, p.prov_name_th,
                       trim(regexp_replace(a.amphoe_name_th, '^(อำเภอ|เขต)', '')) AS aname_clean
                FROM dim_amphoe a
                JOIN dim_province p ON a.prov_code = p.prov_code
            )
            SELECT a.amphoe_code,
                   CAST(round(sum(d.paddy_rai)) AS BIGINT),
                   CAST(round(sum(d.sugar_rai)) AS BIGINT),
                   CAST(round(sum(d.corn_rai)) AS BIGINT),
                   CAST(round(sum(d.cass_rai)) AS BIGINT)
            FROM d
            JOIN a
              ON d.pcode = a.prov_code
             AND (d.aname = a.aname_clean OR (d.aname = 'เมือง' AND a.aname_clean = 'เมือง' || a.prov_name_th))
            GROUP BY 1
        """).fetchall()
        for acode, pad, sug, crn, cas in amp_rows:
            tot3 = int(pad or 0) + int(sug or 0) + int(crn or 0)
            if tot3 > 0 or int(cas or 0) > 0:
                amp_doae[str(acode)] = [int(pad or 0), int(sug or 0), int(crn or 0), int(cas or 0), tot3]

    return prov_out, amp_doae, tb_doae


def _load_pm25_snapshot(con: duckdb.DuckDBPyConnection, existing_tables: set[str]) -> dict[str, dict]:
    if "gistda_pm25_snapshot" not in existing_tables:
        return {}
    rows = con.execute("""
        SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
               round(pm25, 1), round(pm25_avg_24hr, 1), dt_utc
        FROM gistda_pm25_snapshot
    """).fetchall()
    return {
        pcode: {"pm25": pm, "pm25_24h": pm24, "dt": dt}
        for pcode, pm, pm24, dt in rows
    }


def _load_transboundary(con: duckdb.DuckDBPyConnection, existing_tables: set[str]) -> dict | None:
    if "transboundary_monthly" not in existing_tables:
        return None
    months = [
        str(r[0])
        for r in con.execute("SELECT DISTINCT ym FROM transboundary_monthly WHERE ym IS NOT NULL ORDER BY 1").fetchall()
    ]
    if not months:
        return None
    m_idx = {ym: idx for idx, ym in enumerate(months)}
    rows = con.execute("""
        SELECT country, year_th, ym, hotspot_count, high_conf_count, day_count, frp_sum_mw
        FROM transboundary_monthly
        ORDER BY country, ym
    """).fetchall()
    countries: dict[str, dict] = {}
    years_set: set[int] = set()
    for country, yr, ym, hs, hc, dc, frp in rows:
        years_set.add(int(yr))
        node = countries.setdefault(str(country), {
            "monthly": [0] * len(months),
            "yearly": {},
        })
        if str(ym) in m_idx:
            node["monthly"][m_idx[str(ym)]] = int(hs or 0)
        y_node = node["yearly"].setdefault(str(yr), {"hs": 0, "high": 0, "day": 0, "frp": 0.0})
        y_node["hs"] += int(hs or 0)
        y_node["high"] += int(hc or 0)
        y_node["day"] += int(dc or 0)
        y_node["frp"] = round(y_node["frp"] + float(frp or 0.0), 1)
    return {"months": months, "years": sorted(years_set), "countries": countries}


def _load_rid_regional(con: duckdb.DuckDBPyConnection, existing_tables: set[str]) -> dict | None:
    if "rid_reservoirs_monthly" not in existing_tables:
        return None
    months = [
        str(r[0])
        for r in con.execute("SELECT DISTINCT ym FROM rid_reservoirs_monthly WHERE ym IS NOT NULL ORDER BY 1").fetchall()
    ]
    if not months:
        return None
    m_idx = {ym: idx for idx, ym in enumerate(months)}
    rows = con.execute("""
        SELECT region, ym,
               round(sum(volume_mcm) * 100.0 / nullif(sum(storage_mcm), 0), 1) AS pct_storage
        FROM rid_reservoirs_monthly
        WHERE region IS NOT NULL AND length(region) > 0
        GROUP BY 1, 2
        ORDER BY 1, 2
    """).fetchall()
    regions: dict[str, list] = {}
    for region, ym, pct in rows:
        arr = regions.setdefault(str(region), [None] * len(months))
        if str(ym) in m_idx and pct is not None:
            arr[m_idx[str(ym)]] = float(pct)
    return {"months": months, "regions": regions}


def _load_transboundary_point_grid(con: duckdb.DuckDBPyConnection) -> list[list[int]]:
    """Build a compact 0.05-degree (~5.5 km) spatial grid of non-Thailand GMS hotspots (3.17M points -> 20,000 cells)."""
    parquet_glob = (REPO_ROOT / "hotspot-5y" / "data" / "hf_export" / "parquet" / "transboundary_firms_*.parquet")
    parquet_files = sorted(parquet_glob.parent.glob(parquet_glob.name)) if parquet_glob.parent.exists() else []
    raw_csv_dir = REPO_ROOT / "hotspot-5y" / "data" / "raw" / "firms_gms"
    csv_files = sorted(raw_csv_dir.glob("*.csv")) if raw_csv_dir.exists() else []

    if parquet_files:
        glob_sql = str(parquet_glob).replace("\\", "/")
        rows = con.execute(f"""
            SELECT CAST(round(latitude * 20) AS INTEGER) AS lat_i,
                   CAST(round(longitude * 20) AS INTEGER) AS lon_i,
                   CASE country
                     WHEN 'Myanmar' THEN 1
                     WHEN 'Lao_PDR' THEN 2
                     WHEN 'Cambodia' THEN 3
                     WHEN 'Vietnam' THEN 4
                     ELSE 5
                   END AS cid,
                   CAST(count(*) AS INTEGER) AS tot_4y,
                   CAST(count(*) FILTER (WHERE year_th = 2025) AS INTEGER) AS y2025,
                   CAST(round(max(coalesce(frp_mw, 0))) AS INTEGER) AS max_frp
            FROM read_parquet('{glob_sql}')
            WHERE country != 'Thailand'
            GROUP BY 1, 2, 3
            HAVING count(*) >= 3
            ORDER BY 4 DESC
            LIMIT 20000
        """).fetchall()
        return [[int(r[0]), int(r[1]), int(r[2]), int(r[3]), int(r[4]), int(r[5])] for r in rows]
    elif csv_files:
        return []
    return []


def _load_gistda_live_hotspots_7d(con: duckdb.DuckDBPyConnection, existing_tables: set[str]) -> list[dict]:
    if "gistda_live_hotspots_7d" not in existing_tables:
        return []
    rows = con.execute("""
        SELECT window_tag, acq_date, acq_time,
               round(lat, 4), round(lon, 4),
               satellite, confidence, round(frp_mw, 1),
               country, pv_tn, ap_tn, tb_tn, lu_name
        FROM gistda_live_hotspots_7d
        ORDER BY window_tag ASC, acq_date DESC, frp_mw DESC NULLS LAST
    """).fetchall()
    return [
        {
            "w": r[0],
            "d": r[1],
            "t": r[2],
            "lat": float(r[3]),
            "lon": float(r[4]),
            "sat": r[5],
            "conf": r[6],
            "frp": float(r[7]) if r[7] is not None else None,
            "ct": r[8],
            "pv": r[9],
            "ap": r[10],
            "tb": r[11],
            "lu": r[12],
        }
        for r in rows
    ]


def _load_gistda_wms_layers() -> dict[str, dict]:
    layers_dir = REPO_ROOT / "hotspot-5y" / "web_app" / "gistda_layers"
    bbox_4326 = [97.343968, 5.617402, 105.6429129, 20.470097]
    specs = {
        "dri": ("dri_7d.png", "ดัชนีเสี่ยงภัยแล้ง GISTDA (DRI · 7 วันล่าสุด)"),
        "ndwi": ("ndwi_7d.png", "ดัชนีความชื้นพืชและน้ำ GISTDA (NDWI · 7 วันล่าสุด)"),
        "smap": ("smap_7d.png", "ความชื้นผิวดินดาวเทียม GISTDA (SMAP · 7 วันล่าสุด)"),
    }
    out: dict[str, dict] = {}
    for k, (fname, title_th) in specs.items():
        fpath = layers_dir / fname
        if fpath.exists():
            out[k] = {
                "key": k,
                "title_th": title_th,
                "path": f"gistda_layers/{fname}",
                "bbox_4326": bbox_4326,
            }
    return out


def _load_tmd_wrf_forecast(con: duckdb.DuckDBPyConnection, existing_tables: set[str]) -> dict[str, list[dict]]:
    if "tmd_wrf_forecast_77prov" not in existing_tables:
        return {}
    rows = con.execute("""
        SELECT lpad(CAST(prov_code AS VARCHAR), 2, '0') AS pcode,
               forecast_date,
               round(tc_max, 1), round(tc_min, 1),
               round(rh_pct, 1), round(rain_mm, 1),
               cond_label_th, round(fwi_tmd, 1)
        FROM tmd_wrf_forecast_77prov
        ORDER BY pcode, forecast_date
    """).fetchall()
    out: dict[str, list[dict]] = {}
    for pcode, dt_str, tmax, tmin, rh, rain, cond_th, fwi in rows:
        out.setdefault(str(pcode), []).append({
            "date": str(dt_str),
            "tmax": float(tmax) if tmax is not None else None,
            "tmin": float(tmin) if tmin is not None else None,
            "rh": float(rh) if rh is not None else None,
            "rain": float(rain) if rain is not None else 0.0,
            "cond": str(cond_th or ""),
            "fwi": float(fwi) if fwi is not None else None,
        })
    return out


def build_map_payload(
    db_path: Path = DEFAULT_DB_PATH,
    era5_path: Path = DEFAULT_ERA5_PATH,
    tadih_db_path: Path | None = DEFAULT_TADIH_DB_PATH,
    *,
    simplify_prov: float = 0.004,
    simplify_amphoe: float = 0.004,
    simplify_tambon: float = 0.0025,
) -> dict:
    """Query DuckDB + ERA5 + optional TADIH flood DB into a compact JSON-serializable dict."""
    con = duckdb.connect(str(db_path), read_only=True)
    try:
        con.execute("LOAD spatial;")
        existing_tables = {
            r[0]
            for r in con.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            ).fetchall()
        }

        era5_map, era5_meta = _load_era5(Path(era5_path))
        flood_tambon, flood_amphoe, flood_prov = _load_flood_risk(tadih_db_path)
        scar_maps, freq_maps = _load_burn_stats(con, existing_tables)
        trp_maps, covered_trp_provs, trp_years = _load_tamroypao_stats(con, existing_tables)
        weather_months, wx_m_map, wx_y_map = _load_fire_weather(con, existing_tables)
        timeline_months, hs_m_map = _load_hotspots_monthly(con, weather_months)
        aq_m_map, aq_y_map, aq_daily_summary = _load_air_quality(con, existing_tables, timeline_months)
        soil_m_map, soil_y_map, soil_early_warning = _load_nasa_soil(con, existing_tables, timeline_months)
        doae_map, doae_amp_map, doae_tb_map = _load_doae_crops(con, existing_tables)
        pm25_snap_map = _load_pm25_snapshot(con, existing_tables)
        transboundary_data = _load_transboundary(con, existing_tables)
        trans_grid_data = _load_transboundary_point_grid(con)
        live_hotspots_7d = _load_gistda_live_hotspots_7d(con, existing_tables)
        gistda_wms_layers = _load_gistda_wms_layers()
        tmd_wrf_map = _load_tmd_wrf_forecast(con, existing_tables)
        rid_regional_data = _load_rid_regional(con, existing_tables)
        covered_scar_provs = set(scar_maps["prov"].keys())
        covered_freq_provs = set(freq_maps["prov"].keys())

        # Provinces
        prov_rows = con.execute(f"""
            SELECT prov_code, prov_name_th, prov_name_en,
                   min_lon, max_lon, min_lat, max_lat,
                   round(ST_Area_Spheroid(ST_FlipCoordinates(geom)) / 1e6, 4) AS area_sqkm,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {simplify_prov})) AS gjson
            FROM dim_province
            ORDER BY prov_code
        """).fetchall()
        provinces: list[dict] = []
        for code, nth, nen, x0, x1, y0, y1, sqkm, gjson in prov_rows:
            pcode = str(code).zfill(2)
            scar = scar_maps["prov"].get(pcode)
            freq = freq_maps["prov"].get(pcode)
            fl = flood_prov.get(pcode)
            trp = trp_maps["prov"].get(pcode, {}) if pcode in covered_trp_provs else None
            em = era5_meta.get(pcode, {})
            provinces.append({
                "code": pcode,
                "name_th": nth,
                "name_en": nen,
                "region": em.get("region") or "",
                "lat": em.get("lat") if em.get("lat") is not None else round((y0 + y1) / 2, 4),
                "lon": em.get("lon") if em.get("lon") is not None else round((x0 + x1) / 2, 4),
                "bbox": [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
                "area_sqkm": float(sqkm or 0.0),
                "rings": extract_rings(gjson),
                "scar_rai": scar["rai"] if scar else None,
                "scar_agri_rai": scar["agri_rai"] if scar else None,
                "scar_polys": scar["polys"] if scar else None,
                "freq_rai": freq["rai"] if freq else None,
                "freq_avg": freq["avg_freq"] if freq else None,
                "freq3plus_rai": freq["freq3plus_rai"] if freq else None,
                "flood_max_17yr": fl["max_17yr"] if fl else None,
                "flood_avg_17yr": fl["avg_17yr"] if fl else None,
                "flood_high_tambons": fl["high_tambons"] if fl else None,
                "flood_matched_tambons": fl["matched_tambons"] if fl else None,
                "era5": era5_map.get(pcode, {}),
                "wx_y": wx_y_map.get(pcode, {}),
                "wx_m": wx_m_map.get(pcode),
                "hs_m": hs_m_map.get(pcode),
                "aq_y": aq_y_map.get(pcode, {}),
                "aq_m": aq_m_map.get(pcode),
                "soil_y": soil_y_map.get(pcode, {}),
                "soil_m": soil_m_map.get(pcode),
                "doae_2566": doae_map.get(pcode),
                "pm25_snap": pm25_snap_map.get(pcode),
                "tmd_wrf": tmd_wrf_map.get(pcode),
                "trp": trp,
            })

        # Amphoes (plus synthesized amphoes present in dim_tambon but absent from dim_amphoe)
        amp_rows = con.execute(f"""
            SELECT prov_code, amphoe_code, amphoe_name_th, amphoe_name_en,
                   centroid_lon, centroid_lat, min_lon, max_lon, min_lat, max_lat,
                   round(ST_Area_Spheroid(ST_FlipCoordinates(geom)) / 1e6, 4) AS area_sqkm,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {simplify_amphoe})) AS gjson
            FROM dim_amphoe
            ORDER BY amphoe_code
        """).fetchall()
        existing_amphoe_codes = {str(r[1]) for r in amp_rows}
        synth_amp_rows = con.execute(f"""
            WITH u AS (
                SELECT min(prov_code) AS prov_code,
                       amphoe_code,
                       min(amphoe_name_th) AS amphoe_name_th,
                       min(amphoe_name_th) AS amphoe_name_en,
                       ST_Union_Agg(geom) AS ugeom
                FROM dim_tambon
                WHERE amphoe_code IS NOT NULL
                  AND amphoe_code NOT IN (SELECT amphoe_code FROM dim_amphoe)
                  AND substr(tambon_code, 1, 4) NOT IN (SELECT amphoe_code FROM dim_amphoe)
                GROUP BY amphoe_code
            )
            SELECT prov_code, amphoe_code, amphoe_name_th, amphoe_name_en,
                   ST_X(ST_Centroid(ugeom)), ST_Y(ST_Centroid(ugeom)),
                   ST_XMin(ugeom), ST_XMax(ugeom), ST_YMin(ugeom), ST_YMax(ugeom),
                   round(ST_Area_Spheroid(ST_FlipCoordinates(ugeom)) / 1e6, 4) AS area_sqkm,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(ugeom, {simplify_amphoe})) AS gjson
            FROM u
            ORDER BY amphoe_code
        """).fetchall()
        amphoes: list[dict] = []
        for pcode, acode, ath, aen, clon, clat, x0, x1, y0, y1, sqkm, gjson in list(amp_rows) + list(synth_amp_rows):
            pcode_s = str(pcode).zfill(2)
            acode_s = str(acode)
            existing_amphoe_codes.add(acode_s)
            scar = scar_maps["amphoe"].get(acode_s) if pcode_s in covered_scar_provs else None
            freq = freq_maps["amphoe"].get(acode_s) if pcode_s in covered_freq_provs else None
            fl = flood_amphoe.get(acode_s)
            trp = trp_maps["amphoe"].get(acode_s, {}) if pcode_s in covered_trp_provs else None
            amphoes.append({
                "code": acode_s,
                "prov_code": pcode_s,
                "name_th": ath,
                "name_en": aen,
                "centroid": [round(clon, 4), round(clat, 4)],
                "bbox": [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
                "area_sqkm": float(sqkm or 0.0),
                "rings": extract_rings(gjson),
                "scar_rai": scar["rai"] if scar else (0.0 if pcode_s in covered_scar_provs else None),
                "scar_agri_rai": scar["agri_rai"] if scar else (0.0 if pcode_s in covered_scar_provs else None),
                "freq_rai": freq["rai"] if freq else (0.0 if pcode_s in covered_freq_provs else None),
                "freq_avg": freq["avg_freq"] if freq else None,
                "flood_max_17yr": fl["max_17yr"] if fl else None,
                "flood_avg_17yr": fl["avg_17yr"] if fl else None,
                "flood_high_tambons": fl["high_tambons"] if fl else None,
                "flood_matched_tambons": fl["matched_tambons"] if fl else None,
                "doae": doae_amp_map.get(acode_s),
                "trp": trp,
            })

        # Tambons
        tb_rows = con.execute(f"""
            SELECT prov_code, amphoe_code, tambon_code, tambon_name_th, tambon_name_en,
                   centroid_lon, centroid_lat, min_lon, max_lon, min_lat, max_lat,
                   round(ST_Area_Spheroid(ST_FlipCoordinates(geom)) / 1e6, 4) AS area_sqkm,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {simplify_tambon})) AS gjson
            FROM dim_tambon
            ORDER BY tambon_code
        """).fetchall()
        tambons: list[dict] = []
        tambon_idx_by_code: dict[str, int] = {}
        for idx, (pcode, acode, tcode, tth, ten, clon, clat, x0, x1, y0, y1, sqkm, gjson) in enumerate(tb_rows):
            pcode_s = str(pcode).zfill(2)
            tcode_s = str(tcode)
            acode_s = str(acode)
            if acode_s not in existing_amphoe_codes and tcode_s[:4] in existing_amphoe_codes:
                acode_s = tcode_s[:4]
            tambon_idx_by_code[tcode_s] = idx
            scar = scar_maps["tambon"].get(tcode_s) if pcode_s in covered_scar_provs else None
            freq = freq_maps["tambon"].get(tcode_s) if pcode_s in covered_freq_provs else None
            fl = flood_tambon.get(tcode_s)
            trp = trp_maps["tambon"].get(tcode_s, {}) if pcode_s in covered_trp_provs else None
            tambons.append({
                "code": tcode_s,
                "amphoe_code": acode_s,
                "prov_code": pcode_s,
                "name_th": tth,
                "name_en": ten,
                "centroid": [round(clon, 4), round(clat, 4)],
                "bbox": [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
                "area_sqkm": float(sqkm or 0.0),
                "rings": extract_rings(gjson),
                "scar_rai": scar["rai"] if scar else (0.0 if pcode_s in covered_scar_provs else None),
                "scar_agri_rai": scar["agri_rai"] if scar else (0.0 if pcode_s in covered_scar_provs else None),
                "freq_rai": freq["rai"] if freq else (0.0 if pcode_s in covered_freq_provs else None),
                "freq_avg": freq["avg_freq"] if freq else None,
                "flood_max_17yr": fl["max_17yr"] if fl else None,
                "flood_months": fl["months"] if fl else None,
                "flood_risk_level": fl["risk_level"] if fl else None,
                "doae": doae_tb_map.get(tcode_s),
                "trp": trp,
            })

        # Ensure hotspots with tambon_code absent from dim_tambon are never silently dropped
        unmatched_tb_rows = con.execute("""
            SELECT coalesce(tambon_code, coalesce(amphoe_code, prov_code) || '_UNMAPPED') AS tcode,
                   min(prov_code) AS pcode,
                   min(amphoe_code) AS acode,
                   coalesce(min(tambon_name_th), 'ไม่ตรงทำเนียบตำบล') AS tname,
                   round(avg(longitude), 4) AS clon,
                   round(avg(latitude), 4) AS clat,
                   round(min(longitude), 4) AS x0,
                   round(max(longitude), 4) AS x1,
                   round(min(latitude), 4) AS y0,
                   round(max(latitude), 4) AS y1
            FROM hotspots
            WHERE year_th BETWEEN 2022 AND 2026
              AND (tambon_code IS NULL OR tambon_code NOT IN (SELECT tambon_code FROM dim_tambon))
            GROUP BY 1
            ORDER BY 1
        """).fetchall()
        for tcode, pcode, acode, tname, clon, clat, x0, x1, y0, y1 in unmatched_tb_rows:
            tcode_s = str(tcode)
            if tcode_s in tambon_idx_by_code:
                continue
            pcode_s = str(pcode).zfill(2) if pcode else ""
            acode_s = str(acode or (tcode_s[:4] if len(tcode_s) >= 4 else ""))
            tambon_idx_by_code[tcode_s] = len(tambons)
            scar = scar_maps["tambon"].get(tcode_s) if pcode_s in covered_scar_provs else None
            freq = freq_maps["tambon"].get(tcode_s) if pcode_s in covered_freq_provs else None
            fl = flood_tambon.get(tcode_s)
            trp = trp_maps["tambon"].get(tcode_s) if pcode_s in covered_trp_provs else None
            tambons.append({
                "code": tcode_s,
                "amphoe_code": acode_s,
                "prov_code": pcode_s,
                "name_th": f"{tname} (นอกขอบเขต ปภ.)",
                "name_en": tcode_s,
                "centroid": [float(clon), float(clat)],
                "bbox": [float(x0), float(y0), float(x1), float(y1)],
                "area_sqkm": 0.0,
                "rings": [],
                "scar_rai": scar["rai"] if scar else None,
                "scar_agri_rai": scar["agri_rai"] if scar else None,
                "freq_rai": freq["rai"] if freq else None,
                "freq_avg": freq["avg_freq"] if freq else None,
                "flood_max_17yr": fl["max_17yr"] if fl else None,
                "flood_months": fl["months"] if fl else None,
                "flood_risk_level": fl["risk_level"] if fl else None,
                "trp": trp,
            })

        # Sparse hotspot cube per tambon
        cube_rows = con.execute("""
            SELECT coalesce(tambon_code, coalesce(amphoe_code, prov_code) || '_UNMAPPED') AS tcode,
                   CASE WHEN satellite = 'N' THEN 0 ELSE 1 END AS is_other_sat,
                   year_th - 2022 AS yr_idx,
                   CASE
                     WHEN month_th IN (1, 2) THEN 0
                     WHEN month_th IN (3, 4) THEN 1
                     WHEN month_th BETWEEN 5 AND 10 THEN 2
                     ELSE 3
                   END AS sea_idx,
                   CASE
                     WHEN lu_name IN ('พื้นที่เกษตร', 'เขต สปก.') THEN 0
                     WHEN lu_name LIKE 'ป่า%' THEN 1
                     ELSE 2
                   END AS lu_idx,
                   CASE lu_hp_name
                     WHEN 'นาข้าว' THEN 1
                     WHEN 'อ้อย' THEN 2
                     WHEN 'ข้าวโพดและไร่หมุนเวียน' THEN 3
                     ELSE 0
                   END AS crop_idx,
                   CASE WHEN is_suspected_static THEN 1 ELSE 0 END AS st_idx,
                   count(*) AS cnt,
                   count(*) FILTER (WHERE hour_th BETWEEN 6 AND 17) AS day_cnt,
                   CAST(round(sum(coalesce(frp_mw, 0)) * 10) AS BIGINT) AS frp_sum10
            FROM hotspots
            WHERE year_th BETWEEN 2022 AND 2026
            GROUP BY 1,2,3,4,5,6,7
        """).fetchall()
        cube = [
            [
                tambon_idx_by_code[str(tcode)],
                pack_flags(is_other, yr, sea, lu, crop, st),
                int(cnt),
                int(day_cnt),
                int(frp10),
            ]
            for tcode, is_other, yr, sea, lu, crop, st, cnt, day_cnt, frp10 in cube_rows
            if str(tcode) in tambon_idx_by_code
        ]

        # 0.05-degree heatmap grid cells
        grid_rows = con.execute("""
            SELECT CAST(round(latitude * 20) AS INTEGER) AS lat_i,
                   CAST(round(longitude * 20) AS INTEGER) AS lon_i,
                   CASE WHEN satellite = 'N' THEN 0 ELSE 1 END AS is_other_sat,
                   year_th - 2022 AS yr_idx,
                   CASE
                     WHEN month_th IN (1, 2) THEN 0
                     WHEN month_th IN (3, 4) THEN 1
                     WHEN month_th BETWEEN 5 AND 10 THEN 2
                     ELSE 3
                   END AS sea_idx,
                   CASE
                     WHEN lu_name IN ('พื้นที่เกษตร', 'เขต สปก.') THEN 0
                     WHEN lu_name LIKE 'ป่า%' THEN 1
                     ELSE 2
                   END AS lu_idx,
                   CASE lu_hp_name
                     WHEN 'นาข้าว' THEN 1
                     WHEN 'อ้อย' THEN 2
                     WHEN 'ข้าวโพดและไร่หมุนเวียน' THEN 3
                     ELSE 0
                   END AS crop_idx,
                   CASE WHEN is_suspected_static THEN 1 ELSE 0 END AS st_idx,
                   count(*) AS cnt
            FROM hotspots
            WHERE year_th BETWEEN 2022 AND 2026
            GROUP BY 1,2,3,4,5,6,7,8
        """).fetchall()
        grid = [
            [int(lat_i), int(lon_i), pack_flags(is_other, yr, sea, lu, crop, st), int(cnt)]
            for lat_i, lon_i, is_other, yr, sea, lu, crop, st, cnt in grid_rows
        ]

        # Static suspected spots overlay
        static_rows = con.execute("""
            SELECT prov_name_th, amphoe_name_th, tambon_name_th, lu_name,
                   lat_grid3, lon_grid3, total_points, distinct_days, avg_frp_mw
            FROM v_suspected_static_hotspots
        """).fetchall()
        static_spots = [
            {
                "prov": r[0],
                "amphoe": r[1],
                "tambon": r[2],
                "lu": r[3],
                "lat": float(r[4]),
                "lon": float(r[5]),
                "points": int(r[6]),
                "days": int(r[7]),
                "avg_frp": float(r[8] or 0.0),
            }
            for r in static_rows
        ]

        # Top villages (national top 300 UNION top 10 per province with mean coords & N counts)
        v_rows = con.execute("""
            WITH base AS (
                SELECT prov_code,
                       min(prov_name_th) AS prov_name_th,
                       amphoe_code,
                       min(amphoe_name_th) AS amphoe_name_th,
                       tambon_code,
                       min(tambon_name_th) AS tambon_name_th,
                       village_name,
                       max(moo_1) AS moo_1,
                       round(avg(latitude), 4) AS lat,
                       round(avg(longitude), 4) AS lon,
                       count(*) AS total_all,
                       count(*) FILTER (WHERE satellite = 'N') AS total_n,
                       count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_all,
                       count(*) FILTER (WHERE satellite = 'N' AND lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_n,
                       count(*) FILTER (WHERE is_suspected_static) AS static_cnt,
                       round(avg(v_dist_km), 2) AS avg_dist_km,
                       row_number() OVER (ORDER BY count(*) FILTER (WHERE satellite = 'N') DESC, count(*) DESC) AS nat_rn,
                       row_number() OVER (PARTITION BY prov_code ORDER BY count(*) FILTER (WHERE satellite = 'N') DESC, count(*) DESC) AS prov_rn
                FROM hotspots
                WHERE village_name IS NOT NULL
                GROUP BY prov_code, amphoe_code, tambon_code, village_name
            )
            SELECT prov_code, prov_name_th, amphoe_code, amphoe_name_th, tambon_code, tambon_name_th,
                   village_name, moo_1, lat, lon, total_all, total_n, agri_all, agri_n, static_cnt, avg_dist_km
            FROM base
            WHERE nat_rn <= 300 OR prov_rn <= 10
            ORDER BY total_n DESC, total_all DESC
        """).fetchall()
        villages = [
            {
                "prov_code": str(r[0]).zfill(2),
                "prov": r[1],
                "amphoe_code": str(r[2]),
                "amphoe": r[3],
                "tambon_code": str(r[4]),
                "tambon": r[5],
                "name": r[6],
                "moo": r[7],
                "lat": float(r[8]),
                "lon": float(r[9]),
                "all": int(r[10]),
                "n": int(r[11]),
                "agri_all": int(r[12]),
                "agri_n": int(r[13]),
                "static": int(r[14]),
                "dist_km": float(r[15]) if r[15] is not None else None,
            }
            for r in v_rows
        ]

        # Overall metadata
        meta_row = con.execute("""
            SELECT count(*),
                   count(*) FILTER (WHERE satellite = 'N'),
                   min(acq_date_th),
                   max(acq_date_th),
                   max(acq_date_th) FILTER (WHERE satellite = 'N')
            FROM hotspots
        """).fetchone()

        return {
            "meta": {
                "total_all": int(meta_row[0] or 0),
                "total_n": int(meta_row[1] or 0),
                "min_date": str(meta_row[2]) if meta_row[2] else None,
                "max_date": str(meta_row[3]) if meta_row[3] else None,
                "max_date_n": str(meta_row[4]) if meta_row[4] else None,
                "province_count": len(provinces),
                "amphoe_count": len(amphoes),
                "tambon_count": len(tambons),
                "scar_covered_provinces": len(covered_scar_provs),
                "freq_covered_provinces": len(covered_freq_provs),
                "trp_covered_provinces": len(covered_trp_provs),
                "trp_years": trp_years,
                "weather_covered_provinces": len(wx_m_map),
                "weather_months_count": len(weather_months),
                "aq_covered_provinces": len(aq_m_map),
                "soil_covered_provinces": len(soil_m_map),
                "doae_covered_provinces": len(doae_map),
                "doae_covered_amphoes": len(doae_amp_map),
                "doae_covered_tambons": len(doae_tb_map),
                "transboundary_countries": len((transboundary_data or {}).get("countries") or {}),
                "trans_grid_cells": len(trans_grid_data),
                "live_hotspots_7d_count": len(live_hotspots_7d),
                "tmd_wrf_provinces": len(tmd_wrf_map),
                "rid_regions_count": len((rid_regional_data or {}).get("regions") or {}),
                "flood_covered_provinces": len(flood_prov),
                "flood_covered_tambons": len(flood_tambon),
                "years": [2022, 2023, 2024, 2025, 2026],
                "seasons": ["ม.ค.–ก.พ.", "มี.ค.–เม.ย.", "พ.ค.–ต.ค.", "พ.ย.–ธ.ค."],
            },
            "weather_months": timeline_months,
            "transboundary": transboundary_data,
            "trans_grid": trans_grid_data,
            "live_hotspots_7d": live_hotspots_7d,
            "gistda_wms_layers": gistda_wms_layers,
            "aq_daily_summary": aq_daily_summary,
            "soil_early_warning": soil_early_warning,
            "rid_monthly": rid_regional_data,
            "provinces": provinces,
            "amphoes": amphoes,
            "tambons": tambons,
            "cube": cube,
            "grid": grid,
            "static_spots": static_spots,
            "villages": villages,
        }
    finally:
        con.close()
