"""Load pure-GISTDA 5-year hotspots (VIIRS 2022-2026), burn-scar, and burn-freq into DuckDB."""

from __future__ import annotations

import argparse
from pathlib import Path
import duckdb

from config import (
    DDPM_AMPHOE_GEOJSON,
    DDPM_TAMBON_GEOJSON,
    DEFAULT_DB_PATH,
    DEFAULT_PROVINCE_GEOJSON,
    GISTDA_DIR,
    GISTDA_VIIRS_DIR,
)


def load_spatial(con: duckdb.DuckDBPyConnection) -> None:
    """Load DuckDB spatial extension, installing it first if absent."""
    try:
        con.execute("LOAD spatial;")
    except duckdb.Error:
        con.execute("INSTALL spatial; LOAD spatial;")


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


GISTDA_VIIRS_COLUMNS = (
    "{'feature_id': 'VARCHAR', 'hotspot_id': 'VARCHAR', 'collection_id': 'VARCHAR', "
    "'acq_date_utc': 'VARCHAR', 'acq_time_utc': 'VARCHAR', 'th_date': 'VARCHAR', 'th_time': 'VARCHAR', "
    "'latitude': 'DOUBLE', 'longitude': 'DOUBLE', 'satellite': 'VARCHAR', 'instrument': 'VARCHAR', "
    "'confidence': 'VARCHAR', 'bright_ti4': 'DOUBLE', 'bright_ti5': 'DOUBLE', 'frp': 'DOUBLE', "
    "'scan': 'DOUBLE', 'track': 'DOUBLE', 'version': 'VARCHAR', "
    "'pv_idn': 'INTEGER', 'pv_tn': 'VARCHAR', 'pv_en': 'VARCHAR', "
    "'ap_idn': 'INTEGER', 'ap_tn': 'VARCHAR', 'tb_idn': 'INTEGER', 'tb_tn': 'VARCHAR', "
    "'village': 'VARCHAR', 'moo_1': 'VARCHAR', 'name_1': 'VARCHAR', 'v_dist': 'DOUBLE', 'v_direct': 'VARCHAR', "
    "'re_nesdb': 'VARCHAR', 're_royin': 'VARCHAR', "
    "'lu_code': 'VARCHAR', 'lu_name': 'VARCHAR', 'lu_hp': 'VARCHAR', 'lu_hp_name': 'VARCHAR', "
    "'ct_en': 'VARCHAR', 'ct_tn': 'VARCHAR'}"
)

GISTDA_JSON_COLUMNS = (
    "{'feature_id': 'VARCHAR', 'pv_idn': 'INTEGER', 'pv_tn': 'VARCHAR', 'pv_en': 'VARCHAR', "
    "'ap_idn': 'INTEGER', 'ap_tn': 'VARCHAR', 'tb_idn': 'INTEGER', 'tb_tn': 'VARCHAR', "
    "'re_nesdb': 'VARCHAR', 're_royin': 'VARCHAR', 'area_rai': 'DOUBLE', 'area_sqm': 'DOUBLE', "
    "'date_range': 'VARCHAR', 'rp_code': 'INTEGER', 'rp_name': 'VARCHAR', "
    "'lu_code': 'VARCHAR', 'lu_name': 'VARCHAR', 'burn': 'INTEGER', 'freq': 'INTEGER', "
    "'y2017': 'INTEGER', 'y2023': 'INTEGER', 'y2024': 'INTEGER', 'y2025': 'INTEGER', "
    "'centroid_lon': 'DOUBLE', 'centroid_lat': 'DOUBLE', 'geometry_json': 'VARCHAR'}"
)


def _ingest_gistda_polygon_table(con: duckdb.DuckDBPyConnection, jsonl_path: Path, table_name: str) -> int:
    """Load one compressed GISTDA feature export into DuckDB with canonical province code and bbox."""
    path_sql = _sql_literal(jsonl_path.as_posix())
    con.execute(f"""
        CREATE OR REPLACE TABLE {table_name} AS
        WITH raw_src AS (
            SELECT
                *,
                CASE
                    WHEN geometry_json IS NOT NULL AND length(geometry_json) > 0
                    THEN ST_MakeValid(ST_GeomFromGeoJSON(geometry_json))
                    ELSE NULL
                END AS geom
            FROM read_json(
                {path_sql},
                format = 'newline_delimited',
                columns = {GISTDA_JSON_COLUMNS}
            )
            QUALIFY row_number() OVER (PARTITION BY feature_id ORDER BY feature_id) = 1
        )
        SELECT
            r.feature_id,
            CASE
                WHEN r.pv_idn IS NOT NULL AND r.pv_idn > 0 THEN lpad(CAST(r.pv_idn AS VARCHAR), 2, '0')
                ELSE NULL
            END AS prov_code,
            coalesce(p.prov_name_th, regexp_replace(trim(r.pv_tn), '^จ\\.', '')) AS prov_name_th,
            r.pv_en AS prov_name_en,
            r.ap_idn AS amphoe_code,
            regexp_replace(trim(r.ap_tn), '^อ\\.', '') AS amphoe_name_th,
            r.tb_idn AS tambon_code,
            regexp_replace(trim(r.tb_tn), '^ต\\.', '') AS tambon_name_th,
            r.re_nesdb,
            r.re_royin,
            r.area_rai,
            r.area_sqm,
            trim(r.date_range) AS date_range,
            r.rp_code,
            nullif(trim(r.rp_name), '') AS rp_name,
            nullif(trim(r.lu_code), '') AS lu_code,
            nullif(trim(r.lu_name), '') AS lu_name,
            r.burn,
            r.freq,
            r.y2017,
            r.y2023,
            r.y2024,
            r.y2025,
            r.centroid_lon,
            r.centroid_lat,
            CASE WHEN r.geom IS NOT NULL THEN ST_XMin(r.geom) ELSE r.centroid_lon END AS min_lon,
            CASE WHEN r.geom IS NOT NULL THEN ST_XMax(r.geom) ELSE r.centroid_lon END AS max_lon,
            CASE WHEN r.geom IS NOT NULL THEN ST_YMin(r.geom) ELSE r.centroid_lat END AS min_lat,
            CASE WHEN r.geom IS NOT NULL THEN ST_YMax(r.geom) ELSE r.centroid_lat END AS max_lat,
            r.geom
        FROM raw_src r
        LEFT JOIN dim_province p
            ON p.prov_code = lpad(CAST(r.pv_idn AS VARCHAR), 2, '0');
    """)
    return int(con.execute(f"SELECT count(*) FROM {table_name}").fetchone()[0])


def build_database(
    viirs_dir: Path = GISTDA_VIIRS_DIR,
    gistda_dir: Path = GISTDA_DIR,
    db_path: Path | str = DEFAULT_DB_PATH,
    province_geojson: Path = DEFAULT_PROVINCE_GEOJSON,
    amphoe_geojson: Path = DDPM_AMPHOE_GEOJSON,
    tambon_geojson: Path = DDPM_TAMBON_GEOJSON,
) -> dict:
    """Ingest GISTDA VIIRS 2022-2026 hotspots plus DDPM boundaries and burn-scar/burn-freq into DuckDB."""
    if not province_geojson.exists():
        raise FileNotFoundError(f"Province GeoJSON not found: {province_geojson}")

    viirs_files = sorted(viirs_dir.glob("gistda_viirs_*.jsonl.gz"))
    if not viirs_files:
        raise FileNotFoundError(f"No GISTDA VIIRS files found in {viirs_dir}")

    if str(db_path) != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect(str(db_path))
    try:
        load_spatial(con)

        geojson_sql = _sql_literal(province_geojson.as_posix())
        con.execute(f"""
            CREATE OR REPLACE TABLE dim_province AS
            WITH base AS (
                SELECT
                    lpad(CAST(PROV_CODE AS VARCHAR), 2, '0') AS prov_code,
                    trim(CAST(PROV_NAM_T AS VARCHAR)) AS prov_name_th,
                    trim(CAST(PROV_NAM_E AS VARCHAR)) AS prov_name_en,
                    ST_MakeValid(geom) AS geom
                FROM ST_Read({geojson_sql})
            )
            SELECT
                prov_code,
                prov_name_th,
                prov_name_en,
                ST_XMin(geom) AS min_lon,
                ST_XMax(geom) AS max_lon,
                ST_YMin(geom) AS min_lat,
                ST_YMax(geom) AS max_lat,
                geom
            FROM base;
        """)

        has_amphoe = amphoe_geojson.exists()
        if has_amphoe:
            amphoe_sql = _sql_literal(amphoe_geojson.as_posix())
            con.execute(f"""
                CREATE OR REPLACE TABLE dim_amphoe AS
                WITH base AS (
                    SELECT
                        lpad(CAST(PROV_CODE AS VARCHAR), 2, '0') AS prov_code,
                        lpad(CAST(AMP_CODE AS VARCHAR), 4, '0') AS amphoe_code,
                        regexp_replace(nullif(trim(CAST(PROV_NAM_T AS VARCHAR)), ''), '^จ\\.', '') AS prov_name_th,
                        regexp_replace(nullif(trim(CAST(AMP_NAM_T AS VARCHAR)), ''), '^อ\\.', '') AS amphoe_name_th,
                        nullif(trim(CAST(AMP_NAM_E AS VARCHAR)), '') AS amphoe_name_en,
                        TRY_CAST(Centroid_x AS DOUBLE) AS centroid_lon,
                        TRY_CAST(Centroid_y AS DOUBLE) AS centroid_lat,
                        ST_MakeValid(geom) AS geom
                    FROM ST_Read({amphoe_sql})
                    QUALIFY row_number() OVER (PARTITION BY lpad(CAST(AMP_CODE AS VARCHAR), 4, '0') ORDER BY PROV_CODE ASC) = 1
                )
                SELECT
                    prov_code,
                    amphoe_code,
                    prov_name_th,
                    amphoe_name_th,
                    amphoe_name_en,
                    centroid_lon,
                    centroid_lat,
                    ST_XMin(geom) AS min_lon,
                    ST_XMax(geom) AS max_lon,
                    ST_YMin(geom) AS min_lat,
                    ST_YMax(geom) AS max_lat,
                    geom
                FROM base;
            """)

        has_tambon = tambon_geojson.exists()
        if has_tambon:
            tambon_sql = _sql_literal(tambon_geojson.as_posix())
            con.execute(f"""
                CREATE OR REPLACE TABLE dim_tambon AS
                WITH base AS (
                    SELECT
                        lpad(CAST(PROV_CODE AS VARCHAR), 2, '0') AS prov_code,
                        lpad(CAST(AMP_CODE AS VARCHAR), 4, '0') AS amphoe_code,
                        lpad(CAST(TAM_CODE AS VARCHAR), 6, '0') AS tambon_code,
                        regexp_replace(nullif(trim(CAST(PROV_NAM_T AS VARCHAR)), ''), '^จ\\.', '') AS prov_name_th,
                        regexp_replace(nullif(trim(CAST(AMP_NAM_T AS VARCHAR)), ''), '^อ\\.', '') AS amphoe_name_th,
                        regexp_replace(nullif(trim(CAST(TAM_NAM_T AS VARCHAR)), ''), '^ต\\.', '') AS tambon_name_th,
                        nullif(trim(CAST(TAM_NAM_E AS VARCHAR)), '') AS tambon_name_en,
                        TRY_CAST(Centroid_x AS DOUBLE) AS centroid_lon,
                        TRY_CAST(Centroid_y AS DOUBLE) AS centroid_lat,
                        ST_MakeValid(geom) AS geom
                    FROM ST_Read({tambon_sql})
                    QUALIFY row_number() OVER (PARTITION BY lpad(CAST(TAM_CODE AS VARCHAR), 6, '0') ORDER BY PROV_CODE ASC) = 1
                )
                SELECT
                    prov_code,
                    amphoe_code,
                    tambon_code,
                    prov_name_th,
                    amphoe_name_th,
                    tambon_name_th,
                    tambon_name_en,
                    centroid_lon,
                    centroid_lat,
                    ST_XMin(geom) AS min_lon,
                    ST_XMax(geom) AS max_lon,
                    ST_YMin(geom) AS min_lat,
                    ST_YMax(geom) AS max_lat,
                    geom
                FROM base;
            """)

        file_list_sql = "[" + ", ".join(_sql_literal(p.as_posix()) for p in viirs_files) + "]"
        con.execute(f"""
            CREATE OR REPLACE TABLE hotspots AS
            WITH raw_src AS (
                SELECT
                    *,
                    regexp_extract(replace(filename, '\\', '/'), '([^/]+)$', 1) AS source_file
                FROM read_json(
                    {file_list_sql},
                    format = 'newline_delimited',
                    filename = true,
                    columns = {GISTDA_VIIRS_COLUMNS}
                )
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                QUALIFY row_number() OVER (
                    PARTITION BY coalesce(nullif(hotspot_id, ''), feature_id)
                    ORDER BY collection_id DESC
                ) = 1
            ),
            parsed AS (
                SELECT
                    row_number() OVER (ORDER BY th_date, th_time, hotspot_id, feature_id) AS hotspot_row_id,
                    coalesce(nullif(hotspot_id, ''), feature_id) AS hotspot_id,
                    collection_id,
                    coalesce(
                        TRY_CAST(substr(th_date, 1, 10) AS DATE),
                        CAST(
                            strptime(acq_date_utc || ' ' || lpad(coalesce(acq_time_utc, '0000'), 4, '0'), '%Y-%m-%d %H%M')
                            + INTERVAL '7 hours'
                            AS DATE
                        )
                    ) AS acq_date_th,
                    lpad(coalesce(th_time, '0000'), 4, '0') AS th_time,
                    TRY_CAST(substr(lpad(coalesce(th_time, '0000'), 4, '0'), 1, 2) AS INTEGER) AS hour_th,
                    TRY_CAST(acq_date_utc AS DATE) AS acq_date_utc,
                    acq_time_utc,
                    latitude,
                    longitude,
                    round(latitude, 3) AS lat_grid3,
                    round(longitude, 3) AS lon_grid3,
                    CASE
                        WHEN pv_idn IS NOT NULL AND pv_idn > 0 THEN lpad(CAST(pv_idn AS VARCHAR), 2, '0')
                        ELSE NULL
                    END AS raw_prov_code,
                    regexp_replace(nullif(trim(pv_tn), ''), '^จ\\.', '') AS raw_prov_name_th,
                    nullif(trim(pv_en), '') AS raw_prov_name_en,
                    CASE
                        WHEN ap_idn IS NOT NULL AND ap_idn > 0 THEN lpad(CAST(ap_idn AS VARCHAR), 4, '0')
                        ELSE NULL
                    END AS amphoe_code,
                    regexp_replace(nullif(trim(ap_tn), ''), '^อ\\.', '') AS amphoe_name_th,
                    CASE
                        WHEN tb_idn IS NOT NULL AND tb_idn > 0 THEN lpad(CAST(tb_idn AS VARCHAR), 6, '0')
                        ELSE NULL
                    END AS tambon_code,
                    regexp_replace(nullif(trim(tb_tn), ''), '^ต\\.', '') AS tambon_name_th,
                    nullif(trim(village), '') AS village_name,
                    nullif(trim(moo_1), '') AS moo_1,
                    nullif(trim(name_1), '') AS name_1,
                    TRY_CAST(v_dist AS DOUBLE) AS v_dist_km,
                    nullif(trim(v_direct), '') AS v_direct,
                    nullif(trim(re_nesdb), '') AS re_nesdb,
                    nullif(trim(re_royin), '') AS re_royin,
                    nullif(trim(lu_code), '') AS lu_code,
                    coalesce(nullif(trim(lu_name), ''), 'ไม่ระบุ') AS lu_name,
                    nullif(trim(lu_hp), '') AS lu_hp,
                    coalesce(nullif(trim(lu_hp_name), ''), 'ไม่ระบุ') AS lu_hp_name,
                    coalesce(nullif(trim(satellite), ''), 'UNKNOWN') AS satellite,
                    coalesce(nullif(trim(instrument), ''), 'VIIRS') AS instrument,
                    nullif(trim(confidence), '') AS confidence_raw,
                    CASE
                        WHEN lower(trim(coalesce(confidence, ''))) IN ('h', 'high') THEN 'high'
                        WHEN lower(trim(coalesce(confidence, ''))) IN ('n', 'nominal') THEN 'nominal'
                        ELSE 'low'
                    END AS confidence_level,
                    bright_ti4,
                    bright_ti5,
                    frp AS frp_mw,
                    source_file
                FROM raw_src
            ),
            static_cells AS (
                -- Flag persistent repeat hotspots (e.g. factories/power plants) firing >= 25 distinct days at ~100m grid.
                SELECT
                    lat_grid3,
                    lon_grid3
                FROM parsed
                GROUP BY lat_grid3, lon_grid3
                HAVING count(DISTINCT acq_date_th) >= 25
            )
            SELECT
                p.hotspot_row_id,
                p.hotspot_id,
                p.collection_id,
                p.acq_date_th,
                extract(year FROM p.acq_date_th)::INTEGER AS year_th,
                extract(month FROM p.acq_date_th)::INTEGER AS month_th,
                p.hour_th,
                p.th_time,
                p.acq_date_utc,
                p.acq_time_utc,
                p.latitude,
                p.longitude,
                p.lat_grid3,
                p.lon_grid3,
                coalesce(p.raw_prov_code, dp_spatial.prov_code) AS prov_code,
                coalesce(dp_code.prov_name_th, p.raw_prov_name_th, dp_spatial.prov_name_th) AS prov_name_th,
                coalesce(dp_code.prov_name_en, p.raw_prov_name_en, dp_spatial.prov_name_en) AS prov_name_en,
                p.amphoe_code,
                p.amphoe_name_th,
                p.tambon_code,
                p.tambon_name_th,
                p.village_name,
                p.moo_1,
                p.name_1,
                p.v_dist_km,
                p.v_direct,
                p.re_nesdb,
                p.re_royin,
                p.lu_code,
                p.lu_name,
                p.lu_hp,
                p.lu_hp_name,
                p.satellite,
                p.instrument,
                p.confidence_raw,
                p.confidence_level,
                p.bright_ti4,
                p.bright_ti5,
                p.frp_mw,
                (sc.lat_grid3 IS NOT NULL) AS is_suspected_static,
                p.source_file
            FROM parsed p
            LEFT JOIN dim_province dp_code
                ON dp_code.prov_code = p.raw_prov_code
            LEFT JOIN dim_province dp_spatial
                ON p.raw_prov_code IS NULL
               AND p.longitude BETWEEN dp_spatial.min_lon AND dp_spatial.max_lon
               AND p.latitude BETWEEN dp_spatial.min_lat AND dp_spatial.max_lat
               AND ST_Intersects(ST_Point(p.longitude, p.latitude), dp_spatial.geom)
            LEFT JOIN static_cells sc
                ON sc.lat_grid3 = p.lat_grid3 AND sc.lon_grid3 = p.lon_grid3
            QUALIFY row_number() OVER (PARTITION BY p.hotspot_row_id ORDER BY dp_spatial.prov_code ASC NULLS LAST) = 1;
        """)

        if has_amphoe:
            con.execute("""
                WITH fallback AS (
                    SELECT
                        h.hotspot_row_id,
                        da.amphoe_code,
                        da.amphoe_name_th
                    FROM hotspots h
                    JOIN dim_amphoe da
                      ON h.longitude BETWEEN da.min_lon AND da.max_lon
                     AND h.latitude BETWEEN da.min_lat AND da.max_lat
                     AND ST_Intersects(ST_Point(h.longitude, h.latitude), da.geom)
                    WHERE h.amphoe_code IS NULL
                    QUALIFY row_number() OVER (PARTITION BY h.hotspot_row_id ORDER BY da.amphoe_code ASC) = 1
                )
                UPDATE hotspots AS h
                SET
                    amphoe_code = f.amphoe_code,
                    amphoe_name_th = coalesce(h.amphoe_name_th, f.amphoe_name_th)
                FROM fallback AS f
                WHERE h.hotspot_row_id = f.hotspot_row_id;
            """)

        if has_tambon:
            con.execute("""
                WITH fallback AS (
                    SELECT
                        h.hotspot_row_id,
                        dt.tambon_code,
                        dt.tambon_name_th
                    FROM hotspots h
                    JOIN dim_tambon dt
                      ON h.longitude BETWEEN dt.min_lon AND dt.max_lon
                     AND h.latitude BETWEEN dt.min_lat AND dt.max_lat
                     AND ST_Intersects(ST_Point(h.longitude, h.latitude), dt.geom)
                    WHERE h.tambon_code IS NULL
                    QUALIFY row_number() OVER (PARTITION BY h.hotspot_row_id ORDER BY dt.tambon_code ASC) = 1
                )
                UPDATE hotspots AS h
                SET
                    tambon_code = f.tambon_code,
                    tambon_name_th = coalesce(h.tambon_name_th, f.tambon_name_th)
                FROM fallback AS f
                WHERE h.hotspot_row_id = f.hotspot_row_id;
            """)

        gistda_counts: dict[str, int] = {}
        for slug, table_name in (("burn_scar", "gistda_burn_scar"), ("burn_freq", "gistda_burn_freq")):
            gpath = gistda_dir / f"gistda_{slug}.jsonl.gz"
            if gpath.exists():
                gistda_counts[table_name] = _ingest_gistda_polygon_table(con, gpath, table_name)

        _create_analytical_views(con, set(gistda_counts))

        stats = con.execute("""
            SELECT
                count(*) AS total_points,
                count(*) FILTER (WHERE prov_code IS NOT NULL) AS matched_points,
                count(*) FILTER (WHERE prov_code IS NULL) AS unmatched_points,
                count(*) FILTER (WHERE amphoe_code IS NOT NULL) AS matched_amphoe_points,
                count(*) FILTER (WHERE tambon_code IS NOT NULL) AS matched_tambon_points,
                count(*) FILTER (WHERE village_name IS NOT NULL) AS village_named_points,
                count(*) FILTER (WHERE is_suspected_static) AS suspected_static_points,
                min(acq_date_th) AS min_date_th,
                max(acq_date_th) AS max_date_th
            FROM hotspots
        """).fetchone()

        return {
            "db_path": str(db_path),
            "files_loaded": [p.name for p in viirs_files],
            "total_points": int(stats[0]),
            "matched_points": int(stats[1]),
            "unmatched_points": int(stats[2]),
            "matched_amphoe_points": int(stats[3]),
            "matched_tambon_points": int(stats[4]),
            "village_named_points": int(stats[5]),
            "suspected_static_points": int(stats[6]),
            "min_date_th": str(stats[7]) if stats[7] else None,
            "max_date_th": str(stats[8]) if stats[8] else None,
            "dim_amphoe_count": int(con.execute("SELECT count(*) FROM dim_amphoe").fetchone()[0]) if has_amphoe else 0,
            "dim_tambon_count": int(con.execute("SELECT count(*) FROM dim_tambon").fetchone()[0]) if has_tambon else 0,
            "gistda_tables": gistda_counts,
        }
    finally:
        con.close()


def _create_analytical_views(con: duckdb.DuckDBPyConnection, gistda_tables: set[str] | None = None) -> None:
    """Create analytical views for GISTDA 5-year hotspots, land use, static heat spots, and burn scars."""
    gistda_tables = gistda_tables or set()

    con.execute("""
        CREATE OR REPLACE VIEW v_yearly_summary AS
        SELECT
            year_th,
            count(*) AS total_hotspots,
            count(*) FILTER (WHERE satellite = 'N') AS snpp_hotspots,
            count(*) FILTER (WHERE satellite = 'N20') AS n20_hotspots,
            count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
            count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
            count(*) FILTER (WHERE is_suspected_static) AS suspected_static_hotspots,
            count(*) FILTER (WHERE confidence_level = 'high') AS high_conf_hotspots,
            round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots
        GROUP BY year_th
        ORDER BY year_th;
    """)

    con.execute("""
        CREATE OR REPLACE VIEW v_satellite_yearly AS
        SELECT
            year_th,
            satellite,
            count(*) AS hotspots,
            round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots
        GROUP BY year_th, satellite
        ORDER BY year_th, satellite;
    """)

    con.execute("""
        CREATE OR REPLACE VIEW v_monthly_seasonality AS
        SELECT
            month_th,
            count(*) AS total_5y_hotspots,
            count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
            count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
            round(count(*) * 100.0 / sum(count(*)) OVER (), 2) AS share_pct,
            round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots
        GROUP BY month_th
        ORDER BY month_th;
    """)

    con.execute("""
        CREATE OR REPLACE VIEW v_hotspot_by_landuse AS
        SELECT
            lu_name,
            count(*) AS total_5y_hotspots,
            count(*) FILTER (WHERE NOT is_suspected_static) AS non_static_hotspots,
            round(count(*) * 100.0 / sum(count(*)) OVER (), 2) AS share_pct,
            round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots
        GROUP BY lu_name
        ORDER BY total_5y_hotspots DESC;
    """)

    con.execute("""
        CREATE OR REPLACE VIEW v_hotspot_by_crop_landuse AS
        SELECT
            lu_name,
            lu_hp_name,
            count(*) AS total_5y_hotspots,
            round(count(*) * 100.0 / sum(count(*)) OVER (), 2) AS share_pct,
            round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots
        GROUP BY lu_name, lu_hp_name
        ORDER BY total_5y_hotspots DESC;
    """)

    con.execute("""
        CREATE OR REPLACE VIEW v_province_5y_summary AS
        WITH agg AS (
            SELECT
                prov_code,
                count(*) AS total_5y_hotspots,
                count(*) FILTER (WHERE satellite = 'N') AS snpp_hotspots,
                count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
                count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
                count(*) FILTER (WHERE is_suspected_static) AS suspected_static_hotspots,
                count(DISTINCT acq_date_th) AS active_fire_days,
                round(avg(frp_mw), 2) AS avg_frp_mw,
                round(max(frp_mw), 2) AS max_frp_mw
            FROM hotspots
            WHERE prov_code IS NOT NULL
            GROUP BY prov_code
        ),
        peak_month AS (
            SELECT
                prov_code,
                month_th AS peak_month_th
            FROM hotspots
            WHERE prov_code IS NOT NULL
            GROUP BY prov_code, month_th
            QUALIFY row_number() OVER (PARTITION BY prov_code ORDER BY count(*) DESC, month_th ASC) = 1
        )
        SELECT
            p.prov_code,
            p.prov_name_th,
            p.prov_name_en,
            coalesce(a.total_5y_hotspots, 0) AS total_5y_hotspots,
            coalesce(a.snpp_hotspots, 0) AS snpp_hotspots,
            coalesce(a.agri_alro_hotspots, 0) AS agri_alro_hotspots,
            coalesce(a.forest_hotspots, 0) AS forest_hotspots,
            coalesce(a.suspected_static_hotspots, 0) AS suspected_static_hotspots,
            coalesce(a.active_fire_days, 0) AS active_fire_days,
            pm.peak_month_th,
            a.avg_frp_mw,
            a.max_frp_mw
        FROM dim_province p
        LEFT JOIN agg a ON a.prov_code = p.prov_code
        LEFT JOIN peak_month pm ON pm.prov_code = p.prov_code
        ORDER BY total_5y_hotspots DESC, p.prov_code ASC;
    """)

    con.execute("""
        CREATE OR REPLACE VIEW v_suspected_static_hotspots AS
        SELECT
            prov_name_th,
            amphoe_name_th,
            tambon_name_th,
            lu_name,
            lat_grid3,
            lon_grid3,
            count(*) AS total_points,
            count(DISTINCT acq_date_th) AS distinct_days,
            round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots
        WHERE is_suspected_static
        GROUP BY prov_name_th, amphoe_name_th, tambon_name_th, lu_name, lat_grid3, lon_grid3
        ORDER BY distinct_days DESC, total_points DESC;
    """)

    con.execute("""
        CREATE OR REPLACE VIEW v_hourly_distribution AS
        SELECT
            hour_th,
            satellite,
            count(*) AS hotspots
        FROM hotspots
        GROUP BY hour_th, satellite
        ORDER BY hour_th, satellite;
    """)

    existing_tables = {
        row[0]
        for row in con.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
        ).fetchall()
    }

    if "dim_amphoe" in existing_tables:
        con.execute("""
            CREATE OR REPLACE VIEW v_amphoe_5y_summary AS
            WITH agg AS (
                SELECT
                    amphoe_code,
                    count(*) AS total_5y_hotspots,
                    count(*) FILTER (WHERE satellite = 'N') AS snpp_hotspots,
                    count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
                    count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
                    count(*) FILTER (WHERE is_suspected_static) AS suspected_static_hotspots,
                    count(DISTINCT acq_date_th) AS active_fire_days,
                    round(avg(frp_mw), 2) AS avg_frp_mw,
                    round(max(frp_mw), 2) AS max_frp_mw
                FROM hotspots
                WHERE amphoe_code IS NOT NULL
                GROUP BY amphoe_code
            ),
            peak_month AS (
                SELECT
                    amphoe_code,
                    month_th AS peak_month_th
                FROM hotspots
                WHERE amphoe_code IS NOT NULL
                GROUP BY amphoe_code, month_th
                QUALIFY row_number() OVER (PARTITION BY amphoe_code ORDER BY count(*) DESC, month_th ASC) = 1
            )
            SELECT
                da.amphoe_code,
                da.amphoe_name_th,
                da.amphoe_name_en,
                da.prov_code,
                da.prov_name_th,
                coalesce(g.total_5y_hotspots, 0) AS total_5y_hotspots,
                coalesce(g.snpp_hotspots, 0) AS snpp_hotspots,
                coalesce(g.agri_alro_hotspots, 0) AS agri_alro_hotspots,
                coalesce(g.forest_hotspots, 0) AS forest_hotspots,
                coalesce(g.suspected_static_hotspots, 0) AS suspected_static_hotspots,
                coalesce(g.active_fire_days, 0) AS active_fire_days,
                pm.peak_month_th,
                g.avg_frp_mw,
                g.max_frp_mw
            FROM dim_amphoe da
            LEFT JOIN agg g ON g.amphoe_code = da.amphoe_code
            LEFT JOIN peak_month pm ON pm.amphoe_code = da.amphoe_code
            ORDER BY total_5y_hotspots DESC, da.amphoe_code ASC;
        """)

    if "dim_tambon" in existing_tables:
        con.execute("""
            CREATE OR REPLACE VIEW v_tambon_5y_summary AS
            WITH agg AS (
                SELECT
                    tambon_code,
                    count(*) AS total_5y_hotspots,
                    count(*) FILTER (WHERE satellite = 'N') AS snpp_hotspots,
                    count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
                    count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
                    count(*) FILTER (WHERE is_suspected_static) AS suspected_static_hotspots,
                    count(DISTINCT acq_date_th) AS active_fire_days,
                    round(avg(frp_mw), 2) AS avg_frp_mw,
                    round(max(frp_mw), 2) AS max_frp_mw
                FROM hotspots
                WHERE tambon_code IS NOT NULL
                GROUP BY tambon_code
            ),
            peak_month AS (
                SELECT
                    tambon_code,
                    month_th AS peak_month_th
                FROM hotspots
                WHERE tambon_code IS NOT NULL
                GROUP BY tambon_code, month_th
                QUALIFY row_number() OVER (PARTITION BY tambon_code ORDER BY count(*) DESC, month_th ASC) = 1
            )
            SELECT
                dt.tambon_code,
                dt.tambon_name_th,
                dt.tambon_name_en,
                dt.amphoe_code,
                dt.amphoe_name_th,
                dt.prov_code,
                dt.prov_name_th,
                coalesce(g.total_5y_hotspots, 0) AS total_5y_hotspots,
                coalesce(g.snpp_hotspots, 0) AS snpp_hotspots,
                coalesce(g.agri_alro_hotspots, 0) AS agri_alro_hotspots,
                coalesce(g.forest_hotspots, 0) AS forest_hotspots,
                coalesce(g.suspected_static_hotspots, 0) AS suspected_static_hotspots,
                coalesce(g.active_fire_days, 0) AS active_fire_days,
                pm.peak_month_th,
                g.avg_frp_mw,
                g.max_frp_mw
            FROM dim_tambon dt
            LEFT JOIN agg g ON g.tambon_code = dt.tambon_code
            LEFT JOIN peak_month pm ON pm.tambon_code = dt.tambon_code
            ORDER BY total_5y_hotspots DESC, dt.tambon_code ASC;
        """)

    con.execute("""
        CREATE OR REPLACE VIEW v_village_5y_summary AS
        SELECT
            prov_code,
            max(prov_name_th) AS prov_name_th,
            amphoe_code,
            max(amphoe_name_th) AS amphoe_name_th,
            tambon_code,
            max(tambon_name_th) AS tambon_name_th,
            village_name,
            max(moo_1) AS moo_1,
            count(*) AS total_5y_hotspots,
            count(*) FILTER (WHERE lu_name IN ('พื้นที่เกษตร', 'เขต สปก.')) AS agri_alro_hotspots,
            count(*) FILTER (WHERE lu_name LIKE 'ป่า%') AS forest_hotspots,
            count(*) FILTER (WHERE is_suspected_static) AS suspected_static_hotspots,
            count(DISTINCT acq_date_th) AS active_fire_days,
            round(avg(v_dist_km), 3) AS avg_v_dist_km,
            round(min(v_dist_km), 3) AS min_v_dist_km,
            round(avg(frp_mw), 2) AS avg_frp_mw
        FROM hotspots
        WHERE village_name IS NOT NULL
        GROUP BY prov_code, amphoe_code, tambon_code, village_name
        ORDER BY total_5y_hotspots DESC, avg_v_dist_km ASC NULLS LAST;
    """)

    if "gistda_burn_scar" in gistda_tables:
        con.execute("""
            CREATE OR REPLACE VIEW v_gistda_burn_scar_by_landuse AS
            SELECT
                coalesce(rp_name, 'ไม่ระบุประเภท') AS rp_name,
                count(*) AS polygon_count,
                round(sum(area_rai), 2) AS total_area_rai,
                round(avg(area_rai), 2) AS avg_area_rai,
                round(sum(area_rai) * 100.0 / nullif(sum(sum(area_rai)) OVER (), 0), 2) AS area_share_pct
            FROM gistda_burn_scar
            GROUP BY coalesce(rp_name, 'ไม่ระบุประเภท')
            ORDER BY total_area_rai DESC;
        """)

        con.execute("""
            CREATE OR REPLACE VIEW v_gistda_burn_scar_by_province AS
            SELECT
                prov_code,
                prov_name_th,
                count(*) AS polygon_count,
                round(sum(area_rai), 2) AS total_area_rai,
                round(sum(area_rai) FILTER (WHERE rp_name = 'พื้นที่เกษตร'), 2) AS agri_area_rai,
                count(*) FILTER (WHERE rp_name = 'พื้นที่เกษตร') AS agri_polygon_count,
                min(date_range) AS first_date_range,
                max(date_range) AS last_date_range
            FROM gistda_burn_scar
            GROUP BY prov_code, prov_name_th
            ORDER BY total_area_rai DESC NULLS LAST;
        """)

    if "gistda_burn_freq" in gistda_tables:
        con.execute("""
            CREATE OR REPLACE VIEW v_gistda_burn_freq_by_province AS
            SELECT
                prov_code,
                prov_name_th,
                count(*) AS polygon_count,
                round(sum(area_rai), 2) AS total_area_rai,
                round(avg(freq), 2) AS avg_freq,
                max(freq) AS max_freq,
                CASE WHEN count(y2023) > 0 THEN coalesce(round(sum(area_rai) FILTER (WHERE y2023 > 0), 2), 0.0) ELSE NULL END AS area_rai_2023,
                CASE WHEN count(y2024) > 0 THEN coalesce(round(sum(area_rai) FILTER (WHERE y2024 > 0), 2), 0.0) ELSE NULL END AS area_rai_2024,
                CASE WHEN count(y2025) > 0 THEN coalesce(round(sum(area_rai) FILTER (WHERE y2025 > 0), 2), 0.0) ELSE NULL END AS area_rai_2025
            FROM gistda_burn_freq
            GROUP BY prov_code, prov_name_th
            ORDER BY total_area_rai DESC NULLS LAST;
        """)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest GISTDA VIIRS, burn-scar, and burn-freq into DuckDB.")
    parser.add_argument("--viirs-dir", type=Path, default=GISTDA_VIIRS_DIR)
    parser.add_argument("--gistda-dir", type=Path, default=GISTDA_DIR)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--provinces", type=Path, default=DEFAULT_PROVINCE_GEOJSON)
    parser.add_argument("--amphoes", type=Path, default=DDPM_AMPHOE_GEOJSON)
    parser.add_argument("--tambons", type=Path, default=DDPM_TAMBON_GEOJSON)
    args = parser.parse_args(argv)

    result = build_database(
        viirs_dir=args.viirs_dir,
        gistda_dir=args.gistda_dir,
        db_path=args.db,
        province_geojson=args.provinces,
        amphoe_geojson=args.amphoes,
        tambon_geojson=args.tambons,
    )
    gistda_msg = (
        " | polygons=" + ", ".join(f"{k}:{v:,}" for k, v in result["gistda_tables"].items())
        if result["gistda_tables"]
        else ""
    )
    print(
        f"Loaded {result['total_points']:,} GISTDA hotspots ({len(result['files_loaded'])} files) -> {result['db_path']} | "
        f"matched={result['matched_points']:,}, missing_prov={result['unmatched_points']:,}, "
        f"suspected_static={result['suspected_static_points']:,}, "
        f"dates={result['min_date_th']}..{result['max_date_th']}{gistda_msg}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
