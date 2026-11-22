"""Build the nationwide Farm-Fire × Wind × PM2.5 analysis page from local DuckDB + analysis JSON."""

from __future__ import annotations

import json
from html import escape
from pathlib import Path

from archive_db import connect_archive
from map_template import ATLAS_CHROME_CSS, ATLAS_FONTS, ATLAS_NAV_ITEMS, ATLAS_THEME_CSS, ATLAS_THEME_SCRIPT
from ui_pages import ATLAS_NAV_CSS


def build_farm_fire_pm25_payload(database: Path, analysis_json: Path) -> dict:
    """Load 77 simplified province geometries (read-only) and combine with farm-fire PM2.5 results."""
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
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.geom, 0.012)),
                   ST_X(ST_PointOnSurface(p.geom)), ST_Y(ST_PointOnSurface(p.geom))
            FROM dim_province p
            LEFT JOIN reg r USING (prov_code)
            ORDER BY p.prov_code
        """).fetchall()
    if len(provinces) != 77 or len({row[0] for row in provinces}) != 77:
        raise ValueError(f"Expected 77 unique provinces in dim_province, got {len(provinces)}")
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
    }


def write_farm_fire_pm25_page(database: Path, analysis_json: Path, output: Path) -> None:
    """Render the standalone Farm-Fire × Wind × PM2.5 HTML report page."""
    template = Path(__file__).with_name("farm_fire_pm25.html").read_text(encoding="utf-8")
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
        .replace("__FARM_FIRE_DATA__", payload.replace("<", "\\u003c")),
        encoding="utf-8",
    )
