"""Build a standalone province and district hotspot comparison from local DuckDB."""

from __future__ import annotations

import argparse
from html import escape
import json
from pathlib import Path

import duckdb

from archive_db import connect_archive

from map_template import ATLAS_CHROME_CSS, ATLAS_FONTS, ATLAS_NAV_ITEMS, ATLAS_THEME_CSS, ATLAS_THEME_SCRIPT
from ui_pages import ATLAS_NAV_CSS


DATA_DIR = Path(__file__).resolve().parent / "data"
YEARS = tuple(range(2022, 2027))
MONTHS = tuple(range(1, 11))
BURN_YEARS = (2024, 2025, 2026)

# Aggregate detections before joining to the administrative register so that areas
# with zero recorded detections in the period remain selectable.
BASE = """
    SELECT year(acq_date_th) AS yr, month(acq_date_th) AS mo, prov_code AS p, amphoe_code AS a,
           CASE WHEN lu_name LIKE 'ป่า%' THEN 'forest'
                WHEN lu_name IN ('พื้นที่เกษตร', 'เขต สปก.') THEN 'agri'
                ELSE 'other' END AS land,
           floor(longitude * 100) AS gx, floor(latitude * 100) AS gy
    FROM hotspots
    WHERE satellite = 'N' AND NOT is_suspected_static
      AND year(acq_date_th) BETWEEN 2022 AND 2026 AND month(acq_date_th) BETWEEN 1 AND 10
"""


def validate_detection_records(conn: duckdb.DuckDBPyConnection) -> None:
    invalid, duplicate_ids, duplicate_detections = conn.execute("""
        SELECT count(*) FILTER (WHERE
                   instrument IS DISTINCT FROM 'VIIRS'
                   OR acq_date_th IS NULL OR acq_date_utc IS NULL OR acq_time_utc IS NULL
                   OR year_th IS DISTINCT FROM year(acq_date_th)
                   OR month_th IS DISTINCT FROM month(acq_date_th)
                   OR latitude IS NULL OR longitude IS NULL
                   OR hotspot_id IS NULL OR is_suspected_static IS NULL),
               count(hotspot_id) - count(DISTINCT hotspot_id),
               count(*) - count(DISTINCT (acq_date_utc, acq_time_utc, latitude, longitude))
        FROM hotspots
        WHERE satellite = 'N'
    """).fetchone()
    if invalid or duplicate_ids or duplicate_detections:
        raise ValueError(
            f"Invalid Suomi NPP/VIIRS records ({invalid}); duplicate IDs "
            f"({duplicate_ids}); duplicate position and time ({duplicate_detections})"
        )


def load_season_comparison(conn: duckdb.DuckDBPyConnection) -> list:
    if ("tamroypao_burn_tambon",) not in conn.execute("SHOW TABLES").fetchall():
        return []
    return conn.execute("""
        WITH matched_area AS (
            SELECT prov_code p, amphoe_code a, tambon_code t,
                   sum(total_rai) FILTER (WHERE year_th = 2024) rai24,
                   sum(total_rai) FILTER (WHERE year_th = 2025) rai25,
                   sum(total_rai) FILTER (WHERE year_th = 2026) rai26
            FROM tamroypao_burn_tambon
            WHERE (year_th, season_period) IN
                ((2024, '202312_202404'), (2025, '202412_202504'), (2026, '202512_202604'))
            GROUP BY 1, 2, 3
            HAVING count(*) = 3 AND count(DISTINCT year_th) = 3
               AND count(total_rai) = 3
        ), point_counts AS (
            SELECT prov_code p, amphoe_code a, tambon_code t,
                   count(*) FILTER (WHERE season = 2024) hs24,
                   count(*) FILTER (WHERE season = 2025) hs25,
                   count(*) FILTER (WHERE season = 2026) hs26
            FROM (
                SELECT prov_code, amphoe_code, tambon_code,
                       year(acq_date_th) + CASE WHEN month(acq_date_th) = 12 THEN 1 ELSE 0 END AS season
                FROM hotspots
                WHERE satellite = 'N' AND NOT is_suspected_static
                  AND (month(acq_date_th) <= 4 OR month(acq_date_th) = 12)
                  AND year(acq_date_th) BETWEEN 2023 AND 2026
            ) AS season_points
            WHERE season BETWEEN 2024 AND 2026
            GROUP BY 1, 2, 3
        )
        SELECT p, a, count(*), count(DISTINCT p),
               sum(coalesce(hs24, 0)), sum(coalesce(hs25, 0)), sum(coalesce(hs26, 0)),
               sum(rai24), sum(rai25), sum(rai26)
        FROM matched_area LEFT JOIN point_counts USING (p, a, t)
        GROUP BY GROUPING SETS ((p,a), (p), ())
    """).fetchall()


def build_data(database: Path, *, include_burn_scar: bool = True) -> dict:
    with connect_archive(database, read_only=True) as conn:
        validate_detection_records(conn)
        areas = conn.execute("""
            SELECT prov_code, NULL, prov_name_th, false FROM dim_province
            UNION ALL
            SELECT prov_code, amphoe_code, amphoe_name_th, false FROM dim_amphoe
            UNION ALL
            SELECT h.prov_code, h.amphoe_code, min(h.amphoe_name_th), true
            FROM hotspots h
            WHERE h.prov_code IS NOT NULL AND h.amphoe_code IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dim_amphoe a
                  WHERE a.prov_code = h.prov_code AND a.amphoe_code = h.amphoe_code
              )
            GROUP BY h.prov_code, h.amphoe_code
            HAVING count(DISTINCT h.amphoe_name_th) = 1
            ORDER BY 1, 2 NULLS FIRST
        """).fetchall()
        counts = conn.execute(f"""
            WITH base AS ({BASE})
            SELECT p, a, yr, mo, count(*),
                   count(*) FILTER (WHERE land = 'forest'),
                   count(*) FILTER (WHERE land = 'agri')
            FROM base
            GROUP BY GROUPING SETS ((p, a, yr, mo), (p, yr, mo), (yr, mo))
        """).fetchall()
        repeats = conn.execute(f"""
            WITH base AS ({BASE}),
            cells AS (
                SELECT p, a, gx, gy,
                       count(DISTINCT yr) FILTER (WHERE yr >= 2023) AS years_seen,
                       count(*) FILTER (WHERE yr = 2026) AS latest
                FROM base
                WHERE gx IS NOT NULL AND gy IS NOT NULL
                GROUP BY GROUPING SETS ((p, a, gx, gy), (p, gx, gy), (gx, gy))
            )
            SELECT p, a, count(*) AS cells_2026,
                   count(*) FILTER (WHERE years_seen >= 3) AS repeated_cells,
                   sum(latest) FILTER (WHERE years_seen >= 3) AS repeat_points
            FROM cells WHERE latest > 0
            GROUP BY p, a
        """).fetchall()
        coverage = conn.execute("""
            SELECT year_th, min(acq_date_th)::VARCHAR, max(acq_date_th)::VARCHAR,
                   count(DISTINCT acq_date_th)
            FROM hotspots WHERE satellite = 'N' AND year_th BETWEEN 2022 AND 2026
              AND month_th BETWEEN 1 AND 10
            GROUP BY year_th ORDER BY year_th
        """).fetchall()
        seasons = load_season_comparison(conn) if include_burn_scar else []

    index = {
        (p, a): {"p": p, "a": a, "name": name, "fromPoints": from_points,
                 "counts": [[0] * len(MONTHS) for _ in YEARS],
                 "land": [[0, 0, 0] for _ in YEARS], "repeat": [0, 0, 0]}
        for p, a, name, from_points in [(None, None, "ประเทศไทย", False), *areas]
    }
    if len(index) != len(areas) + 1:
        raise ValueError("Duplicate administrative codes")
    for p, a, year, month, count, forest, agri in counts:
        row = index[p, a]
        yi = year - YEARS[0]
        row["counts"][yi][month - 1] = count
        for i, value in enumerate((forest, agri, count - forest - agri)):
            row["land"][yi][i] += value
    for p, a, cells, repeated, points in repeats:
        index[p, a]["repeat"] = [cells, repeated, int(points or 0)]
    for p, a, tambons, provinces, *values in seasons:
        if tambons and (p, a) in index:
            index[p, a]["burn"] = {
                "tambons": tambons, "provinces": provinces,
                "points": values[:3], "rai": values[3:],
            }

    return {"years": YEARS, "burnYears": BURN_YEARS if include_burn_scar else (),
            "areas": list(index.values()), "coverage": coverage}


def write_area_insights(
    database: Path, output: Path, *, link_to_atlas: bool = False, include_burn_scar: bool = True,
) -> None:
    template = Path(__file__).with_name("area_insights.html").read_text(encoding="utf-8")
    payload = json.dumps(build_data(database, include_burn_scar=include_burn_scar), ensure_ascii=False, separators=(",", ":"))
    output.parent.mkdir(parents=True, exist_ok=True)
    template = (template
        .replace("<!--__ATLAS_FONTS__-->", ATLAS_FONTS)
        .replace("<!--__ATLAS_THEME_SCRIPT__-->", ATLAS_THEME_SCRIPT)
        .replace("/*__ATLAS_SHARED_CSS__*/", "\n".join((ATLAS_THEME_CSS, ATLAS_CHROME_CSS, ATLAS_NAV_CSS))))
    if link_to_atlas:
        nav = "\n".join(
            f'<a class="nav-tab" href="./#{page}">{escape(label)}</a>'
            for page, label in ATLAS_NAV_ITEMS
        )
        template = template.replace("<!--__ATLAS_HEADER__-->", f"""
<header class="topbar">
  <a class="brand" href="./#overview"><span class="brand-dot"></span>Thailand Fire Atlas</a>
  <nav class="nav-tabs" aria-label="เมนูหลัก">
    <a class="nav-tab" href="./guide.html">คู่มือใช้งาน</a>
    {nav}
    <a class="nav-tab" href="./farm-fire-pm25.html">ไฟเกษตร ลม และฝุ่น</a>
    <a class="nav-tab" href="./#explorer">ค้นและดาวน์โหลดข้อมูล</a>
  </nav>
  <button id="themeToggle" class="theme-toggle" type="button" title="สลับโหมดสีมืด/สว่าง">โหมดสว่าง</button>
</header>""")
    output.write_text(template.replace("__AREA_DATA__", payload.replace("<", "\\u003c")), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DATA_DIR / "hotspot_5y.duckdb")
    parser.add_argument("--out", type=Path, default=DATA_DIR / "output" / "area_insights.html")
    args = parser.parse_args()
    write_area_insights(args.db, args.out)
    print(args.out.resolve())


if __name__ == "__main__":
    main()
