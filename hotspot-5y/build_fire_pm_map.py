"""Build the Atlas fire and PM2.5 comparison map from its local snapshot."""

import json
from html import escape
from pathlib import Path

from archive_db import connect_archive
from map_template import ATLAS_CHROME_CSS, ATLAS_FONTS, ATLAS_NAV_ITEMS, ATLAS_THEME_CSS, ATLAS_THEME_SCRIPT
from ui_pages import ATLAS_NAV_CSS


def build_fire_pm_data(database: Path) -> dict:
    with connect_archive(database, read_only=True) as con:
        con.execute("LOAD spatial")
        provinces = con.execute("""
            SELECT prov_code, prov_name_th,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.012)),
                   ST_X(ST_PointOnSurface(geom)), ST_Y(ST_PointOnSurface(geom))
            FROM dim_province ORDER BY prov_code
        """).fetchall()
        rows = con.execute("""
            WITH viirs AS (
                SELECT prov_code, acq_date_th, lu_name, lu_hp_name
                FROM hotspots WHERE satellite = 'N' AND instrument = 'VIIRS'
                  AND NOT is_suspected_static
            ), last_month AS (
                SELECT date_trunc('month', max(acq_date_th))::DATE - 1 AS last_date FROM viirs
            ), fire AS (
                SELECT prov_code, acq_date_th AS date,
                       count(*) FILTER (WHERE lu_name = 'พื้นที่เกษตร') AS farm,
                       count(*) FILTER (WHERE lu_name = 'พื้นที่เกษตร' AND lu_hp_name = 'นาข้าว') AS rice,
                       count(*) FILTER (WHERE lu_name = 'เขต สปก.') AS alro,
                       count(*) FILTER (WHERE lu_name IN ('ป่าอนุรักษ์', 'ป่าสงวนแห่งชาติ')) AS forest
                FROM viirs GROUP BY ALL
            )
            SELECT aq.prov_code, aq.date, round(aq.pm25_mean, 2),
                   coalesce(farm, 0), coalesce(rice, 0), coalesce(alro, 0), coalesce(forest, 0)
            FROM air_quality_daily_77prov aq
            JOIN dim_province USING (prov_code)
            LEFT JOIN fire USING (prov_code, date)
            WHERE aq.date BETWEEN (SELECT min(acq_date_th) FROM viirs) AND (SELECT last_date FROM last_month)
            ORDER BY aq.prov_code, aq.date
        """).fetchall()
    if len(provinces) != 77 or len({row[0] for row in provinces}) != 77 or not rows:
        raise ValueError("Expected 77 unique provinces and at least one overlapping CAMS day")
    start, end = min(row[1] for row in rows), max(row[1] for row in rows)
    series = {code: [None] * ((end - start).days + 1) for code, *_ in provinces}
    for code, day, *values in rows:
        index = (day - start).days
        if series[code][index] is not None:
            raise ValueError(f"Duplicate CAMS province-day {code} {day}")
        series[code][index] = values
    return {
        "start": start.isoformat(), "end": end.isoformat(),
        "provinces": [[code, name, json.loads(geometry), round(lon, 4), round(lat, 4)]
                      for code, name, geometry, lon, lat in provinces],
        "series": series,
    }


def write_fire_pm_map(database: Path, output: Path) -> None:
    template = Path(__file__).with_name("fire_pm_map.html").read_text(encoding="utf-8")
    nav = "\n".join(f'<a class="nav-tab" href="./#{page}">{escape(label)}</a>'
                    for page, label in ATLAS_NAV_ITEMS)
    payload = json.dumps(build_fire_pm_data(database), ensure_ascii=False, separators=(",", ":"))
    output.write_text(template.replace("<!--__FONTS__-->", ATLAS_FONTS)
                      .replace("<!--__THEME__-->", ATLAS_THEME_SCRIPT)
                      .replace("/*__CSS__*/", "\n".join((ATLAS_THEME_CSS, ATLAS_CHROME_CSS, ATLAS_NAV_CSS)))
                      .replace("<!--__NAV__-->", nav)
                      .replace("__FIRE_PM_DATA__", payload.replace("<", "\\u003c")), encoding="utf-8")
