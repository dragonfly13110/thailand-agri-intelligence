"""Build a shared, on-demand district and subdistrict overlay from the map archive."""

import gzip
import json
from pathlib import Path

from map_data import extract_rings


def write_admin_boundaries(con, output: Path) -> None:
    spatial_tables = {
        name
        for (name,) in con.execute("""
            SELECT table_name FROM information_schema.columns
            WHERE table_schema = 'main' AND column_name = 'geom'
        """).fetchall()
    }
    if not {"dim_amphoe", "dim_tambon"} <= spatial_tables:
        return
    con.execute("LOAD spatial")
    data = {}
    for level in ("amphoe", "tambon"):
        rows = con.execute(f"""
            WITH geometry AS (
                SELECT {level}_code AS code, {level}_name_th AS name, prov_code,
                       centroid_lon, centroid_lat, min_lon, min_lat, max_lon, max_lat,
                       ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0007)) AS shape
                FROM dim_{level}
                WHERE geom IS NOT NULL AND {level}_code IS NOT NULL
                  AND centroid_lon IS NOT NULL AND centroid_lat IS NOT NULL
                  AND min_lon IS NOT NULL AND min_lat IS NOT NULL
                  AND max_lon IS NOT NULL AND max_lat IS NOT NULL
            )
            SELECT name, centroid_lon, centroid_lat, min_lon, min_lat, max_lon, max_lat, shape, prov_code, code
            FROM geometry ORDER BY code
        """).fetchall()
        data[level] = [
            [name, [round(lon, 5), round(lat, 5)], [x0, y0, x1, y1], rings, prov_code, code]
            for name, lon, lat, x0, y0, x1, y1, shape, prov_code, code in rows
            if (rings := extract_rings(shape, precision=5))
        ]
    output.write_bytes(gzip.compress(
        json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8"),
        mtime=0,
    ))
