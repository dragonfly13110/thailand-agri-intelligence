"""Small versioned DuckDB warehouse; no spatial downscaling or implicit joins."""

import csv
import json
import math
from pathlib import Path
import tempfile

import duckdb

from .quality import FIELDS, validate_observation


def connect(path=":memory:"):
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = duckdb.connect(str(path))
    columns = ", ".join(f'"{key}" ' + ("DOUBLE" if key == "value" else "VARCHAR") for key in FIELDS)
    db.execute(f"CREATE TABLE IF NOT EXISTS observations ({columns}, PRIMARY KEY(observation_id, revision_id))")
    # shortcut: caller supplies source revision IDs; add provider-specific revision mapping with each adapter.
    db.execute("""CREATE OR REPLACE VIEW latest_observations AS
        SELECT * EXCLUDE (revision_rank) FROM (
          SELECT *, row_number() OVER (
            PARTITION BY observation_id ORDER BY COALESCE(release_at, retrieved_at) DESC,
            retrieved_at DESC, revision_id DESC
          ) AS revision_rank FROM observations
        ) WHERE revision_rank = 1""")
    return db


def ingest_rows(db, rows):
    clean = [validate_observation(row) for row in rows]
    # Timestamps compare lexically in SQL only after canonical UTC normalization.
    from .quality import timestamp
    for row in clean:
        for field in ("observed_at", "release_at", "retrieved_at"):
            if row[field] is not None:
                row[field] = timestamp(row[field]).isoformat()
    db.execute("BEGIN")
    try:
        ids = list({row["observation_id"] for row in clean})
        existing_rows = db.execute("SELECT * FROM observations WHERE observation_id IN (SELECT unnest(?))", [ids]).fetchall()
        versions = {(row[0], row[FIELDS.index("revision_id")]): dict(zip(FIELDS, row)) for row in existing_rows}
        identities = {row[0]: dict(zip(FIELDS, row)) for row in existing_rows}
        additions = []
        identity_fields = ("source_id", "area_code", "spatial_support", "location_id", "commodity_id",
                           "observed_at", "measure", "unit", "market_id", "price_type", "grade", "season")
        for row in clean:
            previous_identity = identities.setdefault(row["observation_id"], row)
            if previous_identity:
                if any(previous_identity[key] != row[key] for key in identity_fields):
                    raise ValueError("observation_id cannot change series identity across revisions")
            key = (row["observation_id"], row["revision_id"])
            existing = versions.get(key)
            if existing:
                # Same revision may be fetched again, but must never overwrite changed historical values.
                comparable = [key for key in FIELDS if key != "retrieved_at"]
                if any(existing[field] != row[field] for field in comparable):
                    raise ValueError("changed payload requires a new revision_id")
            else:
                versions[key] = row
                additions.append([row[field] for field in FIELDS])
        if additions:
            # ponytail: DuckDB COPY is far faster than one Python execute per row; keep the validated batch local.
            batch_dir = Path(__file__).resolve().parents[2] / "data/local/tmp"
            batch_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", suffix=".csv", dir=batch_dir, delete=False) as stream:
                batch = Path(stream.name)
                writer = csv.writer(stream)
                writer.writerow(FIELDS)
                writer.writerows(additions)
            try:
                safe_path = batch.as_posix().replace("'", "''")
                db.execute(f"COPY observations FROM '{safe_path}' (HEADER TRUE, NULL '')")
            finally:
                batch.unlink(missing_ok=True)
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    return len(clean)


def load_json_rows(db, path):
    with Path(path).open(encoding="utf-8-sig") as handle:
        rows = json.load(handle)
    if not isinstance(rows, list):
        raise ValueError("input must be a JSON array of normalized observations")
    return ingest_rows(db, rows)


def init_national_hub_tables(db):
    """Initialize relational tables and analytical views for National Agriculture Data Center."""
    # 0.1 Provincial Dimension (dim_province - 77 DOPA provinces)
    db.execute("""
        CREATE TABLE IF NOT EXISTS dim_province (
            province_code VARCHAR PRIMARY KEY,
            province_name_th VARCHAR,
            admin_level VARCHAR,
            source_url VARCHAR,
            verification_status VARCHAR
        )
    """)

    # 0.2 Source Provider Dimension (dim_source)
    db.execute("""
        CREATE TABLE IF NOT EXISTS dim_source (
            source_id VARCHAR PRIMARY KEY,
            name VARCHAR,
            owner VARCHAR,
            category VARCHAR,
            url VARCHAR,
            type VARCHAR,
            priority VARCHAR,
            geographic_scope VARCHAR,
            license_status VARCHAR,
            status VARCHAR
        )
    """)

    # 1. Coverage inventory
    db.execute("""
        CREATE TABLE IF NOT EXISTS national_coverage_inventory (
            source_id VARCHAR,
            phase VARCHAR,
            dataset_id VARCHAR,
            resource_id VARCHAR,
            schema VARCHAR,
            data_grain VARCHAR,
            period VARCHAR,
            metrics VARCHAR,
            units VARCHAR,
            status VARCHAR,
            missing_reason VARCHAR,
            coverage_note VARCHAR,
            license_status VARCHAR,
            source_records BIGINT,
            staged_records BIGINT,
            quarantined_records BIGINT,
            retrieved_at VARCHAR,
            source_sha256 VARCHAR,
            PRIMARY KEY (resource_id, period)
        )
    """)

    # 2. Agricultural Project Register (dim_project)
    db.execute("""
        CREATE TABLE IF NOT EXISTS dim_project (
            project_id VARCHAR PRIMARY KEY,
            project_name_th VARCHAR,
            managing_agency VARCHAR,
            fiscal_year VARCHAR,
            intervention_type VARCHAR,
            target_commodity VARCHAR,
            target_problem VARCHAR,
            target_area_grain VARCHAR,
            status VARCHAR,
            source_evidence VARCHAR,
            license_status VARCHAR,
            budget_allocated_baht DOUBLE,
            budget_spent_baht DOUBLE,
            target_households BIGINT,
            actual_households BIGINT,
            target_area_rai DOUBLE,
            actual_area_rai DOUBLE
        )
    """)

    # 3. Project Spatial Coverage (fact_project_coverage)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_project_coverage (
            project_id VARCHAR,
            province_code VARCHAR,
            is_targeted BOOLEAN,
            PRIMARY KEY (project_id, province_code)
        )
    """)

    # 4. Spatial Evidence (fact_spatial_evidence)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_spatial_evidence (
            evidence_id VARCHAR PRIMARY KEY,
            province_code VARCHAR,
            source_id VARCHAR,
            resource_id VARCHAR,
            problem_type VARCHAR,
            metric_name VARCHAR,
            metric_value DOUBLE,
            unit VARCHAR,
            native_spatial_grain VARCHAR,
            native_area_code VARCHAR,
            observed_period VARCHAR,
            license_status VARCHAR
        )
    """)

    # 5. Evidence Policy Match (fact_evidence_policy_match)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_evidence_policy_match (
            province_code VARCHAR PRIMARY KEY,
            province_name_th VARCHAR,
            identified_problems VARCHAR,
            matched_intervention_ids VARCHAR,
            intervention_status VARCHAR,
            diagnostic_notes VARCHAR,
            last_audited_at VARCHAR
        )
    """)

    # 6. Plan vs Actual Reconciliation (fact_plan_actual_reconciliation)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_plan_actual_reconciliation (
            crop_year VARCHAR,
            season VARCHAR,
            crop_type VARCHAR,
            comparison_status VARCHAR,
            planned_provinces VARCHAR,
            actual_provinces VARCHAR,
            overlapping_provinces VARCHAR,
            reconciliation_note VARCHAR,
            PRIMARY KEY (crop_year, season, crop_type)
        )
    """)

    # 7. DOAE Master Crops & Breeds (dim_crop_master)
    db.execute("""
        CREATE TABLE IF NOT EXISTS dim_crop_master (
            crop_code VARCHAR,
            crop_name_th VARCHAR,
            crop_group_code VARCHAR,
            crop_group_name_th VARCHAR,
            breed_code VARCHAR,
            breed_name_th VARCHAR,
            breed_characteristic VARCHAR,
            retrieved_at VARCHAR,
            license_status VARCHAR,
            PRIMARY KEY(breed_code)
        )
    """)

    # 8. Weather Stations (dim_weather_station)
    db.execute("""
        CREATE TABLE IF NOT EXISTS dim_weather_station (
            station_id VARCHAR,
            station_name_en VARCHAR,
            province_code VARCHAR,
            province_name_th VARCHAR,
            latitude DOUBLE,
            longitude DOUBLE,
            elevation_m DOUBLE,
            PRIMARY KEY(station_id)
        )
    """)

    # 9. Daily Weather Observations (fact_daily_weather)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_daily_weather (
            station_id VARCHAR,
            observation_date VARCHAR,
            tavg_c DOUBLE,
            tmin_c DOUBLE,
            tmax_c DOUBLE,
            rainfall_mm DOUBLE,
            wind_speed_ms DOUBLE,
            air_pressure_hpa DOUBLE,
            source_agency VARCHAR,
            retrieved_at VARCHAR,
            license_status VARCHAR,
            PRIMARY KEY(station_id, observation_date)
        )
    """)

    # 10. Natural Water Reservoirs (DWR non-irrigated basins - fact_natural_water_reservoir)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_natural_water_reservoir (
            water_resource_code VARCHAR,
            water_resource_name_th VARCHAR,
            water_resource_size VARCHAR,
            tambon_name_th VARCHAR,
            amphoe_name_th VARCHAR,
            province_name_th VARCHAR,
            province_code VARCHAR,
            latitude DOUBLE,
            longitude DOUBLE,
            storage_m3 DOUBLE,
            active_storage_m3 DOUBLE,
            outflow_m3_per_sec DOUBLE,
            feed_title VARCHAR,
            feed_date VARCHAR,
            retrieved_at VARCHAR,
            source_agency VARCHAR,
            license_status VARCHAR,
            PRIMARY KEY(water_resource_code)
        )
    """)

    # 11. Satellite 7-Day Flood Features (GISTDA - fact_satellite_flood_7days)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_satellite_flood_7days (
            feature_id VARCHAR,
            satellite_sources VARCHAR,
            dopa_province_code VARCHAR,
            province_name_en VARCHAR,
            dopa_amphoe_code VARCHAR,
            amphoe_name_en VARCHAR,
            dopa_tambon_code VARCHAR,
            tambon_name_en VARCHAR,
            inundated_area_sqm DOUBLE,
            inundated_rice_area_rai DOUBLE,
            centroid_latitude DOUBLE,
            centroid_longitude DOUBLE,
            observation_period VARCHAR,
            source_agency VARCHAR,
            retrieved_at VARCHAR,
            license_status VARCHAR,
            PRIMARY KEY(feature_id)
        )
    """)

    # 12. Monthly Flood Risk Forecast (HII - fact_flood_risk_forecast)
    db.execute("""
        CREATE TABLE IF NOT EXISTS fact_flood_risk_forecast (
            month INTEGER,
            dopa_tambon_code VARCHAR,
            tambon_name_th VARCHAR,
            dopa_amphoe_code VARCHAR,
            amphoe_name_th VARCHAR,
            dopa_province_code VARCHAR,
            province_name_th VARCHAR,
            recurrence_17yr_count INTEGER,
            risk_criteria VARCHAR,
            risk_level VARCHAR,
            source_agency VARCHAR,
            retrieved_at VARCHAR,
            license_status VARCHAR
        )
    """)

    # Analytical Views
    db.execute("""
        CREATE OR REPLACE VIEW v_unaddressed_policy_gaps AS
        SELECT
            m.province_code,
            m.province_name_th,
            m.identified_problems,
            m.intervention_status,
            m.diagnostic_notes,
            COALESCE(SUM(CASE WHEN e.metric_name LIKE '%damaged_area_flood%' THEN e.metric_value ELSE 0 END), 0) AS flood_damage_rai,
            COALESCE(SUM(CASE WHEN e.metric_name LIKE '%damaged_area_drought%' THEN e.metric_value ELSE 0 END), 0) AS drought_damage_rai,
            COALESCE(SUM(CASE WHEN e.metric_name LIKE '%water_shortage%' THEN e.metric_value ELSE 0 END), 0) AS water_shortage_risk_rai
        FROM fact_evidence_policy_match m
        LEFT JOIN fact_spatial_evidence e ON m.province_code = e.province_code
        WHERE m.intervention_status = 'UNADDRESSED_GAP'
        GROUP BY m.province_code, m.province_name_th, m.identified_problems, m.intervention_status, m.diagnostic_notes
        ORDER BY flood_damage_rai DESC, drought_damage_rai DESC
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_project_intervention_summary AS
        SELECT
            p.project_id,
            p.project_name_th,
            p.managing_agency,
            p.fiscal_year,
            p.intervention_type,
            p.target_problem,
            p.budget_allocated_baht,
            p.target_households,
            p.target_area_rai,
            COUNT(c.province_code) AS targeted_provinces_count
        FROM dim_project p
        LEFT JOIN fact_project_coverage c ON p.project_id = c.project_id AND c.is_targeted = TRUE
        GROUP BY p.project_id, p.project_name_th, p.managing_agency, p.fiscal_year,
                  p.intervention_type, p.target_problem, p.budget_allocated_baht,
                  p.target_households, p.target_area_rai
        ORDER BY p.fiscal_year DESC, p.budget_allocated_baht DESC
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_national_coverage_overview AS
        SELECT
            source_id,
            data_grain,
            status,
            license_status,
            COUNT(*) AS resource_count,
            SUM(source_records) AS total_source_records,
            SUM(staged_records) AS total_staged_records,
            SUM(quarantined_records) AS total_quarantined_records
        FROM national_coverage_inventory
        GROUP BY source_id, data_grain, status, license_status
        ORDER BY total_source_records DESC
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_provincial_natural_water_security AS
        SELECT
            COALESCE(province_code, '99') AS province_code,
            province_name_th,
            COUNT(water_resource_code) AS reservoir_count,
            ROUND(SUM(storage_m3), 1) AS total_storage_m3,
            ROUND(SUM(active_storage_m3), 1) AS total_active_storage_m3,
            ROUND(AVG(active_storage_m3), 1) AS avg_active_storage_m3
        FROM fact_natural_water_reservoir
        GROUP BY province_code, province_name_th
        ORDER BY total_active_storage_m3 DESC
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_satellite_flood_rice_impact AS
        SELECT
            dopa_province_code AS province_code,
            province_name_en,
            COUNT(feature_id) AS flood_polygon_count,
            ROUND(SUM(inundated_rice_area_rai), 2) AS total_inundated_rice_rai,
            ROUND(SUM(inundated_area_sqm), 1) AS total_inundated_sqm
        FROM fact_satellite_flood_7days
        GROUP BY dopa_province_code, province_name_en
        ORDER BY total_inundated_rice_rai DESC
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_provincial_recent_weather AS
        SELECT
            s.province_code,
            s.province_name_th,
            s.station_name_en,
            COUNT(w.observation_date) AS observation_days,
            ROUND(AVG(w.tavg_c), 1) AS avg_temperature_c,
            ROUND(MIN(w.tmin_c), 1) AS min_temperature_c,
            ROUND(MAX(w.tmax_c), 1) AS max_temperature_c,
            ROUND(SUM(w.rainfall_mm), 1) AS total_rainfall_mm
        FROM dim_weather_station s
        JOIN fact_daily_weather w ON s.station_id = w.station_id
        GROUP BY s.province_code, s.province_name_th, s.station_name_en
        ORDER BY total_rainfall_mm DESC
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_provincial_flood_risk_forecast AS
        SELECT
            dopa_province_code AS province_code,
            province_name_th,
            month,
            COUNT(CASE WHEN risk_level = 'เสี่ยงสูง' THEN 1 END) AS high_risk_tambons,
            COUNT(CASE WHEN risk_level = 'เสี่ยงปานกลาง' THEN 1 END) AS medium_risk_tambons,
            COUNT(CASE WHEN risk_level = 'เสี่ยงต่ำ' THEN 1 END) AS low_risk_tambons,
            COUNT(*) AS total_risk_tambon_events
        FROM fact_flood_risk_forecast
        GROUP BY dopa_province_code, province_name_th, month
        ORDER BY high_risk_tambons DESC, medium_risk_tambons DESC
    """)

    db.execute("""
        CREATE OR REPLACE VIEW v_provincial_national_intelligence AS
        SELECT
            p.province_code,
            p.province_name_th,
            m.identified_problems,
            COALESCE(m.intervention_status, 'UNVERIFIED') AS intervention_status,
            m.diagnostic_notes,
            CASE WHEN (SELECT COUNT(*) FROM dim_project) = 0 THEN NULL ELSE COUNT(DISTINCT c.project_id) END AS targeted_projects_count,
            -- These source values are retained in their own tables for review.
            -- Do not present them as decision-ready provincial metrics yet.
            CAST(NULL AS BIGINT) AS natural_reservoirs_count,
            CAST(NULL AS DOUBLE) AS natural_water_active_storage_m3,
            CAST(NULL AS BIGINT) AS satellite_flood_polygons_count,
            CAST(NULL AS DOUBLE) AS satellite_inundated_rice_rai,
            CAST(NULL AS BIGINT) AS high_risk_flood_tambons,
            CAST(NULL AS BIGINT) AS medium_risk_flood_tambons,
            CAST(NULL AS VARCHAR) AS weather_station_name,
            CAST(NULL AS DOUBLE) AS avg_temperature_c,
            CAST(NULL AS DOUBLE) AS total_rainfall_mm
        FROM dim_province p
        LEFT JOIN fact_evidence_policy_match m ON p.province_code = m.province_code
        LEFT JOIN fact_project_coverage c ON p.province_code = c.province_code AND c.is_targeted = TRUE
        GROUP BY p.province_code, p.province_name_th, m.identified_problems, m.intervention_status, m.diagnostic_notes
        ORDER BY p.province_code
    """)


def sync_national_hub_data(db, root_dir=None):
    """Synchronize national agriculture intelligence probes into DuckDB warehouse."""
    from .catalog import ROOT, PROVINCE_CODES, load_provinces, load_sources
    from .project_register import AgriculturalProject, province_project_targets
    from .spatial_evidence import ProvinceEvidenceCard

    root = Path(root_dir) if root_dir else ROOT
    probes_dir = root / "data/local/probes"
    verified_probes = {}
    for name in ("project-register-audit.json", "spatial-evidence-audit.json"):
        path = probes_dir / name
        if not path.exists():
            raise FileNotFoundError(f"Run the {name} audit before syncing the warehouse")
        verified_probes[name] = json.loads(path.read_text(encoding="utf-8"))
        if verified_probes[name].get("audit_version") != 2:
            raise ValueError(f"Stale {name}; rerun its audit before syncing the warehouse")

    # Preflight every project/card before creating tables or replacing any existing data.
    projects = verified_probes["project-register-audit.json"].get("projects")
    cards = verified_probes["spatial-evidence-audit.json"].get("province_cards")
    if not isinstance(projects, list) or not isinstance(cards, list):
        raise ValueError("Project and spatial proofs require explicit record lists")
    project_targets = {}
    for project in projects:
        AgriculturalProject(**({"target_commodity":None} | project)).validate()
        if project["project_id"] in project_targets:
            raise ValueError("Duplicate project identity in current proof")
        project_targets[project["project_id"]] = province_project_targets(project)
    declared_count = verified_probes["project-register-audit.json"].get("registered_projects_count", len(projects))
    if type(declared_count) is not int or declared_count != len(projects):
        raise ValueError("Project proof count does not match its records")
    seen_provinces, seen_evidence = set(), set()
    for card in cards:
        ProvinceEvidenceCard(**card).validate()
        if card["province_code"] not in PROVINCE_CODES or card["province_code"] in seen_provinces:
            raise ValueError("Spatial proof requires unique valid province identities")
        seen_provinces.add(card["province_code"])
        for evidence in card["evidence_records"]:
            try:
                finite = math.isfinite(evidence["metric_value"])
            except (TypeError, OverflowError):
                finite = False
            if not finite or evidence["evidence_id"] in seen_evidence:
                raise ValueError("Spatial evidence must have finite values and unique identities")
            seen_evidence.add(evidence["evidence_id"])
    provinces = load_provinces()
    sources = load_sources()
    init_national_hub_tables(db)

    results = {
        "dim_province": 0,
        "dim_source": 0,
        "coverage_inventory": 0,
        "dim_project": 0,
        "fact_project_coverage": 0,
        "fact_spatial_evidence": 0,
        "fact_evidence_policy_match": 0,
        "fact_plan_actual_reconciliation": 0,
        "dim_crop_master": 0,
        "fact_natural_water_reservoir": 0,
        "dim_weather_station": 0,
        "fact_daily_weather": 0,
        "fact_satellite_flood_7days": 0,
        "fact_flood_risk_forecast": 0,
    }

    # 0. Sync dim_province (77 DOPA Provinces)
    db.execute("DELETE FROM dim_province")
    prov_rows = [
        (p["province_code"], p["name_th"], p["admin_level"], p["source_url"], p["verification_status"])
        for p in provinces
    ]
    db.executemany("INSERT INTO dim_province VALUES (?, ?, ?, ?, ?)", prov_rows)
    results["dim_province"] = len(prov_rows)

    # 0.1 Sync dim_source (Catalog Sources + planetary_computer)
    db.execute("DELETE FROM dim_source")
    src_rows = [
        (s["source_id"], s["name"], s["owner"], s["category"], s["url"], s["type"],
         s["priority"], s["geographic_scope"], s["license_status"], s["status"])
        for s in sources
    ]
    if not any(s[0] == "planetary_computer" for s in src_rows):
        src_rows.append((
            "planetary_computer", "Microsoft Planetary Computer / NASA LP DAAC", "NASA / USGS",
            "satellite", "https://planetarycomputer.microsoft.com", "stac_raster",
            "P1", "Thailand", "pending", "documented_not_runtime_verified"
        ))
    db.executemany("INSERT INTO dim_source VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", src_rows)
    results["dim_source"] = len(src_rows)

    # 1. Sync Coverage Inventory
    cov_path = probes_dir / "coverage-inventory.json"
    if cov_path.exists():
        cov_data = json.loads(cov_path.read_text(encoding="utf-8"))
        entries = cov_data.get("entries", [])
        db.execute("DELETE FROM national_coverage_inventory")
        for e in entries:
            db.execute("""
                INSERT INTO national_coverage_inventory VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                e.get("source_id"),
                e.get("phase"),
                e.get("dataset_id"),
                e.get("resource_id"),
                e.get("schema"),
                e.get("data_grain"),
                str(e.get("period") or ""),
                ", ".join(e.get("metrics") or []),
                ", ".join(e.get("units") or []),
                e.get("status"),
                e.get("missing_reason"),
                e.get("coverage_note"),
                e.get("license_status"),
                int(e.get("source_records") or 0),
                int(e.get("staged_records") or 0),
                int(e.get("quarantined_records") or 0),
                e.get("retrieved_at"),
                e.get("source_sha256"),
            ])
        results["coverage_inventory"] = len(entries)

    # 2. Sync Projects & Project Coverage
    proj_path = probes_dir / "project-register-audit.json"
    if proj_path.exists():
        db.execute("DELETE FROM dim_project")
        db.execute("DELETE FROM fact_project_coverage")
        cov_count = 0
        for p in projects:
            db.execute("""
                INSERT INTO dim_project VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                p["project_id"],
                p["project_name_th"],
                p["managing_agency"],
                p["fiscal_year"],
                p["intervention_type"],
                p.get("target_commodity"),
                p["target_problem"],
                p["target_area_grain"],
                p["status"],
                p["source_evidence"],
                p["license_status"],
                p.get("budget_allocated_baht"),
                p.get("budget_spent_baht"),
                p.get("target_households"),
                p.get("actual_households"),
                p.get("target_area_rai"),
                p.get("actual_area_rai"),
            ])
            # is_targeted is a declared province plan, never proof of implementation.
            for c in project_targets[p["project_id"]]:
                db.execute("INSERT OR REPLACE INTO fact_project_coverage VALUES (?, ?, TRUE)", [p["project_id"], c])
                cov_count += 1
        results["dim_project"] = len(projects)
        results["fact_project_coverage"] = cov_count

    # 3. Sync Spatial Evidence & Policy Match
    spat_path = probes_dir / "spatial-evidence-audit.json"
    if spat_path.exists():
        spat_data = verified_probes[spat_path.name]
        cards = spat_data.get("province_cards", [])
        db.execute("DELETE FROM fact_spatial_evidence")
        db.execute("DELETE FROM fact_evidence_policy_match")
        ev_count = 0
        for c in cards:
            db.execute("""
                INSERT INTO fact_evidence_policy_match VALUES (?, ?, ?, ?, ?, ?, ?)
            """, [
                c["province_code"],
                c["province_name_th"],
                ", ".join(c.get("identified_problems") or []),
                ", ".join(c.get("matched_intervention_ids") or []),
                c["intervention_status"],
                c.get("diagnostic_notes"),
                c.get("last_audited_at"),
            ])
            for e in c.get("evidence_records", []):
                db.execute("""
                    INSERT OR REPLACE INTO fact_spatial_evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    e["evidence_id"],
                    c["province_code"],
                    e["source_id"],
                    e["resource_id"],
                    e["problem_type"],
                    e["metric_name"],
                    float(e["metric_value"]),
                    e["unit"],
                    e["native_spatial_grain"],
                    e.get("native_area_code"),
                    e.get("observed_period"),
                    e.get("license_status", "pending"),
                ])
                ev_count += 1
        results["fact_evidence_policy_match"] = len(cards)
        results["fact_spatial_evidence"] = ev_count

    # 4. Sync Plan vs Actual Reconciliation
    plan_path = probes_dir / "plan-actual-reconciliation.json"
    if plan_path.exists():
        plan_data = json.loads(plan_path.read_text(encoding="utf-8"))
        db.execute("DELETE FROM fact_plan_actual_reconciliation")
        plan_rows = 0
        for season_key in ("rainy_season", "dry_season"):
            s_obj = plan_data.get(season_key)
            if s_obj:
                db.execute("""
                    INSERT INTO fact_plan_actual_reconciliation VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    str(plan_data.get("audited_crop_year") or "2569"),
                    season_key,
                    s_obj.get("crop_group", "rice"),
                    s_obj.get("comparison_status"),
                    ", ".join(s_obj.get("planned_provinces") or []),
                    ", ".join(s_obj.get("actual_provinces") or []),
                    ", ".join(s_obj.get("overlapping_provinces") or []),
                    s_obj.get("reconciliation_note"),
                ])
                plan_rows += 1
        results["fact_plan_actual_reconciliation"] = plan_rows

    # 5. Sync DOAE Master Crops
    crop_path = root / "data/local/production/doae_crop_master.json"
    if crop_path.exists():
        safe_path = crop_path.as_posix().replace("'", "''")
        db.execute(f"""
            DELETE FROM dim_crop_master;
            INSERT INTO dim_crop_master
            SELECT
                r.crop_code, r.crop_name_th, r.crop_group_code, r.crop_group_name_th,
                r.breed_code, r.breed_name_th, r.breed_characteristic, r.retrieved_at, r.license_status
            FROM (SELECT unnest(records) AS r FROM read_json_auto('{safe_path}'));
        """)
        results["dim_crop_master"] = db.execute("SELECT COUNT(*) FROM dim_crop_master").fetchone()[0]

    # 6. Sync DWR Natural Water Reservoirs
    dwr_path = root / "data/local/water/dwr_small_water_resources.json"
    if dwr_path.exists():
        safe_path = dwr_path.as_posix().replace("'", "''")
        db.execute(f"""
            DELETE FROM fact_natural_water_reservoir;
            INSERT INTO fact_natural_water_reservoir
            SELECT
                r.water_resource_code, r.water_resource_name_th, r.water_resource_size,
                r.tambon_name_th, r.amphoe_name_th, r.province_name_th, r.province_code,
                r.latitude, r.longitude, r.storage_m3, r.active_storage_m3, r.outflow_m3_per_sec,
                r.feed_title, r.feed_date, r.retrieved_at, r.source_agency, r.license_status
            FROM (SELECT unnest(records) AS r FROM read_json_auto('{safe_path}'));
        """)
        results["fact_natural_water_reservoir"] = db.execute("SELECT COUNT(*) FROM fact_natural_water_reservoir").fetchone()[0]

    # 7. Sync Weather Stations & Observations
    stn_path = root / "data/local/weather/dim_weather_stations.json"
    if stn_path.exists():
        safe_path = stn_path.as_posix().replace("'", "''")
        db.execute(f"""
            DELETE FROM dim_weather_station;
            INSERT INTO dim_weather_station
            SELECT
                r.id, r.name_en, r.province_code, r.province_name_th, r.lat, r.lon, r.elevation_m
            FROM (SELECT unnest(records) AS r FROM read_json_auto('{safe_path}'));
        """)
        results["dim_weather_station"] = db.execute("SELECT COUNT(*) FROM dim_weather_station").fetchone()[0]

    weather_path = root / "data/local/weather/fact_daily_weather.json"
    if weather_path.exists():
        safe_path = weather_path.as_posix().replace("'", "''")
        db.execute(f"""
            DELETE FROM fact_daily_weather;
            INSERT INTO fact_daily_weather
            SELECT
                r.station_id, r.observation_date, r.tavg_c, r.tmin_c, r.tmax_c,
                r.rainfall_mm, r.wind_speed_ms, r.air_pressure_hpa, r.source_agency,
                r.retrieved_at, r.license_status
            FROM (SELECT unnest(records) AS r FROM read_json_auto('{safe_path}'));
        """)
        results["fact_daily_weather"] = db.execute("SELECT COUNT(*) FROM fact_daily_weather").fetchone()[0]

    # 8. Sync GISTDA Satellite Flood Features
    gistda_path = root / "data/local/satellite/gistda_flood_7days.json"
    if gistda_path.exists():
        safe_path = gistda_path.as_posix().replace("'", "''")
        db.execute(f"""
            DELETE FROM fact_satellite_flood_7days;
            INSERT INTO fact_satellite_flood_7days
            SELECT
                r.feature_id, r.satellite_sources, r.dopa_province_code, r.province_name_en,
                r.dopa_amphoe_code, r.amphoe_name_en, r.dopa_tambon_code, r.tambon_name_en,
                r.inundated_area_sqm, r.inundated_rice_area_rai, r.centroid_latitude,
                r.centroid_longitude, r.observation_period, r.source_agency, r.retrieved_at,
                r.license_status
            FROM (SELECT unnest(records) AS r FROM read_json_auto('{safe_path}'));
        """)
        results["fact_satellite_flood_7days"] = db.execute("SELECT COUNT(*) FROM fact_satellite_flood_7days").fetchone()[0]

    # 9. Sync HII Flood Risk Forecast
    hii_path = root / "data/local/satellite/hii_monthly_flood_risk.json"
    if hii_path.exists():
        safe_path = hii_path.as_posix().replace("'", "''")
        db.execute(f"""
            DELETE FROM fact_flood_risk_forecast;
            INSERT INTO fact_flood_risk_forecast
            SELECT
                r.month, r.dopa_tambon_code, r.tambon_name_th, r.dopa_amphoe_code,
                r.amphoe_name_th, r.dopa_province_code, r.province_name_th,
                r.recurrence_17yr_count, r.risk_criteria, r.risk_level,
                r.source_agency, r.retrieved_at, r.license_status
            FROM (SELECT unnest(records) AS r FROM read_json_auto('{safe_path}'));
        """)
        results["fact_flood_risk_forecast"] = db.execute("SELECT COUNT(*) FROM fact_flood_risk_forecast").fetchone()[0]

    return results

