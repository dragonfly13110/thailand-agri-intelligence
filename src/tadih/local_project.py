"""Build a local-only Power BI project from verified snapshots, without a service login."""

import csv
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import tempfile

from .geography import parse_dopa_workbook, match_admin_names
from .publish import BANGKOK, ROOT, _csv, verify_exports
from .quality import timestamp

SCHEMAS = {
    "pbip": "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
    "pbism": "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
    "pbir": "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
    "version": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
    "report": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.1.0/schema.json",
    "page": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/1.0.0/schema.json",
    "pages": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    "visual": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.4.0/schema.json",
}
INTEGER_COLUMNS = {"actual_count", "available_source_count", "expected_count", "expected_source_count", "gap_count",
                   "year_ad", "month", "source_year_be", "source_record_number", "freshness_days",
                   "source_records", "staged_records", "quarantined_records", "target_households", "actual_households"}
NUMBER_COLUMNS = {"value", "planted_area_rai", "damaged_area_rai", "harvested_area_rai", "production_kg",
                  "yield_kg_per_rai", "farm_gate_thb_per_kg", "metric_value", "budget_allocated_baht",
                  "budget_spent_baht", "target_area_rai", "actual_area_rai"}
DATETIME_COLUMNS = {"observed_at", "release_at", "retrieved_at", "latest_observation_date", "latest_publication_date",
                    "generated_at", "evaluated_at", "last_audited_at"}
BOOLEAN_COLUMNS = {"retired", "rollup_eligible", "automatic_action", "deferred", "license_review_required",
                   "runtime_verified", "is_targeted"}


def _json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def _read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames, list(reader)


def _hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def parse_measures(path):
    text = "\n".join(line for line in path.read_text(encoding="utf-8-sig").splitlines() if not line.startswith("//"))
    matches = list(re.finditer(r"^((?!(?:VAR|RETURN)\b)[A-Za-z][A-Za-z0-9 /%_-]*(?:\([A-Za-z0-9 ]+\))?)[ \t]*=[ \t]*", text, re.M))
    measures = [{"name": match[1].strip(), "expression": text[match.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip()}
                for i, match in enumerate(matches)]
    if not measures or len({m["name"] for m in measures}) != len(measures) or any(not m["expression"] for m in measures):
        raise ValueError("measure definitions must have unique names and nonempty expressions")
    return measures


def relationships(tables=None):
    links = [(fact, "area_code", "dim_area", "area_code") for fact in
             ("fact_observation", "fact_data_coverage", "fact_category_coverage")]
    links += [("fact_observation", "source_id", "dim_source", "source_id"),
              ("fact_data_coverage", "source_dataset_id", "dim_source", "source_id"),
              ("fact_category_coverage", "category_id", "dim_category", "category_id")]
    links += [(fact, "period", "dim_period", "period") for fact in
              ("fact_observation", "fact_data_coverage", "fact_category_coverage", "fact_production_source")]
    links += [("dim_admin_area", "province_code", "dim_area", "area_code"),
              ("fact_production_source", "subdistrict_code", "dim_admin_area", "area_code"),
              ("fact_production_source", "source_id", "dim_source", "source_id")]
    links += [(fact, "commodity_id", "dim_commodity", "commodity_id") for fact in ("fact_observation", "fact_production_source")]
    if tables and "dim_project" in tables:
        links += [
            ("fact_project_coverage", "area_code", "dim_area", "area_code"),
            ("fact_project_coverage", "project_id", "dim_project", "project_id"),
            ("fact_spatial_evidence", "area_code", "dim_area", "area_code"),
            ("fact_evidence_policy_match", "area_code", "dim_area", "area_code"),
            ("fact_national_coverage_inventory", "source_id", "dim_source", "source_id"),
        ]
    return [{"name": f"{f}_{fc}_{t}", "fromTable": f, "fromColumn": fc, "toTable": t, "toColumn": tc,
             "fromCardinality": "many", "toCardinality": "one", "crossFilteringBehavior": "oneDirection"}
            for f, fc, t, tc in links]


def validate_relationships(tables, links):
    for link in links:
        target = tables[link["toTable"]][1]
        keys = [r[link["toColumn"]] for r in target]
        if any(k is None or k == "" for k in keys) or len(set(keys)) != len(keys):
            raise ValueError(f"relationship target is blank or duplicate: {link['name']}")
        allowed = set(keys)
        if any(r.get(link["fromColumn"]) not in allowed | {None, ""} for r in tables[link["fromTable"]][1]):
            raise ValueError(f"unmatched nonblank foreign key: {link['name']}")


def _column_type(name):
    if name in INTEGER_COLUMNS:
        return "int64", "Int64.Type"
    if name in NUMBER_COLUMNS:
        return "double", "type number"
    if name in DATETIME_COLUMNS:
        return "dateTime", "type datetime"
    if name == "month_start":
        return "dateTime", "type date"
    if name in BOOLEAN_COLUMNS:
        return "boolean", "type logical"
    return "string", "type text"


def model_definition(tables, data_folder, measures):
    folder = str(data_folder).replace('"', '""')
    model = {"culture": "th-TH", "sourceQueryCulture": "en-US", "defaultPowerBIDataSourceVersion": "powerBI_V3",
             "expressions": [
                 {"name": "ExportFolder", "kind": "m", "expression": f'"{folder}" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]'},
                 {"name": "ReadHubCsv", "kind": "m", "expression":
                  '(fileName as text, columnTypes as list) as table =>\nlet\n'
                  '    Raw = Csv.Document(File.Contents(ExportFolder & "/" & fileName), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),\n'
                  '    Headers = Table.PromoteHeaders(Raw, [PromoteAllScalars=true]),\n'
                  '    Nulls = Table.ReplaceValue(Headers, "", null, Replacer.ReplaceValue, Table.ColumnNames(Headers)),\n'
                  '    Typed = Table.TransformColumnTypes(Nulls, columnTypes, "en-US")\nin\n    Typed'}],
             "tables": [], "relationships": relationships(tables)}
    for name, (fields, _) in tables.items():
        columns = [{"name": field, "dataType": _column_type(field)[0], "sourceColumn": field, "summarizeBy": "none"} for field in fields]
        types = ", ".join('{"' + field + '", ' + _column_type(field)[1] + "}" for field in fields)
        table = {"name": name, "columns": columns, "partitions": [{"name": name, "mode": "import", "source":
                  {"type": "m", "expression": f'ReadHubCsv("{name}.csv", {{{types}}})'}}]}
        if name == "dim_area":
            table["measures"] = measures
            for measure in measures:
                if measure["name"].endswith("Pct") or measure["name"].endswith("Fraction"):
                    measure["formatString"] = "0.0%;-0.0%;0.0%"
        model["tables"].append(table)
    return {"name": "TADIH", "compatibilityLevel": 1600, "model": model}


def _projection(table, field, measure=False):
    return {"field": {"Measure" if measure else "Column": {"Expression": {"SourceRef": {"Entity": table}}, "Property": field}},
            "queryRef": f"{table}.{field}", "nativeQueryRef": field}


def write_report(destination, tables=None):
    report = destination / "TADIH.Report"
    _json(report / "definition.pbir", {"$schema": SCHEMAS["pbir"], "version": "4.0", "datasetReference": {"byPath": {"path": "../TADIH.SemanticModel"}}})
    _json(report / "definition/version.json", {"$schema": SCHEMAS["version"], "version": "2.0.0"})
    _json(report / "definition/report.json", {"$schema": SCHEMAS["report"], "themeCollection": {}})
    # shortcut: conservative native table visuals; verify typography and mobile layout in Desktop before publication.
    pages = [
        ("situation", "Thailand Situation Room", [
            ("fact_data_coverage", ["area_code", "source_dataset_id", "period", "status", "actual_count", "freshness_status"]),
            ("dim_area", [("Supported Provinces", True), ("Coverage Label", True), ("Unverified Entries", True)])]),
        ("crops", "Crop Production & Price", [
            ("dim_period", ["period", ("dim_commodity", "crop_type"), ("National Farmgate Price Native Unit", True), ("National Farmgate Price Unit", True), ("National Price Month Change Pct", True)]),
            ("fact_production_source", ["province_name", "district_name", "subdistrict_name", "period", "crop_type", "variety_name", "production_kg", "mapping_status", "rollup_eligible"])]),
        ("water", "Water, Rain & Disaster Watch", [
            ("dim_period", ["period", ("Grid Point Rainfall mm", True), ("Rainfall Valid Days", True), ("Grid Point Mean Daily Tmax C", True),
                            ("Medium Reservoir Count", True), ("Medium Reservoir Total Volume MCM", True), ("Medium Reservoir Total Capacity MCM", True), ("Medium Reservoir Storage Pct", True)]),
            ("fact_observation", ["location_id", "spatial_support", "data_kind", "measure", "unit", "source_id"])]),
        ("satellite", "Satellite Crop Watch", [
            ("dim_period", ["period", ("Latest NDVI", True), ("NDVI Valid Pixel Fraction", True), ("Satellite Observation Count", True), ("Satellite Cloud Contaminated Count", True)]),
            ("snapshot_metadata", ["satellite_status", "satellite_note"])]),
        ("audit", "Forecast & Decision Audit", [
            ("decision_cards", ["decision_id", "status", "reasons", "recommended_action", "limitations"]),
            ("snapshot_metadata", ["generated_at", "audience", "forecast_status", "price_data_quality", "decision_status", "validation_status", "license_note"])])]

    if tables and "dim_project" in tables:
        pages.append(
            ("policy_gap", "Spatial Evidence & Policy Gap Room", [
                ("fact_evidence_policy_match", ["area_code", "province_name_th", "identified_problems", "intervention_status", "diagnostic_notes"]),
                ("dim_project", ["project_id", "project_name_th", "managing_agency", "fiscal_year", "target_problem", "status", "budget_allocated_baht"])
            ])
        )
        pages.append(
            ("national_coverage", "National Coverage & License Hub", [
                ("fact_national_coverage_inventory", ["source_id", "dataset_id", "data_grain", "period", "status", "license_status", "missing_reason", "source_records"]),
                ("dim_area", [("Supported Provinces", True), ("Unaddressed Gap Provinces Count", True), ("Total Flood Damaged Rai", True), ("Total Drought Damaged Rai", True), ("Registered Projects Count", True)])
            ])
        )

    _json(report / "definition/pages/pages.json", {"$schema": SCHEMAS["pages"], "pageOrder": [p[0] for p in pages], "activePageName": pages[0][0]})
    for name, label, visuals in pages:
        page = report / "definition/pages" / name
        _json(page / "page.json", {"$schema": SCHEMAS["page"], "name": name, "displayName": label,
                                  "displayOption": "FitToPage", "width": 1280, "height": 720})
        for i, (table, fields) in enumerate(visuals):
            projections = [(_projection("dim_area", f[0], True) if f[1] is True else _projection(f[0], f[1]))
                           if isinstance(f, tuple) else _projection(table, f) for f in fields]
            _json(page / f"visuals/table{i}/visual.json", {"$schema": SCHEMAS["visual"], "name": f"{name}_table{i}",
                "position": {"x": 32, "y": 32 + i*340, "z": i, "height": 310, "width": 1216, "tabOrder": i},
                "visual": {"visualType": "tableEx", "query": {"queryState": {"Values": {"projections": projections}}}}})
    _json(destination / "TADIH.pbip", {"$schema": SCHEMAS["pbip"], "version": "1.0", "artifacts": [{"report": {"path": "TADIH.Report"}}],
                                     "settings": {"enableAutoRecovery": True}})


def build_local_project(snapshot, production_inventory, workbook, output_dir):
    snapshot, inventory_path, workbook = Path(snapshot), Path(production_inventory), Path(workbook)
    output_dir = Path(output_dir).resolve()
    if not output_dir.is_relative_to((ROOT / "data/local").resolve()):
        raise ValueError("unreviewed source data and the generated project must stay under data/local")
    if output_dir.exists():
        raise ValueError("local project destination already exists; choose a new directory")
    metadata = verify_exports(snapshot)
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    expected = {"records.jsonl", "commodity_registry.csv"}
    if set(inventory.get("output_sha256", {})) != expected:
        raise ValueError("production inventory must include both staged artifacts")
    for name, checksum in inventory["output_sha256"].items():
        if _hash(inventory_path.parent / name) != checksum:
            raise ValueError(f"production staging integrity failure: {name}")
    tables = {name: _read_csv(snapshot / f"{name}.csv") for name in
              ("dim_area", "dim_source", "dim_category", "fact_observation", "fact_data_coverage", "fact_category_coverage")}
    fields, observations = tables["fact_observation"]
    tables["fact_observation"] = (fields + ["period"], observations)
    for row in observations:
        row["period"] = timestamp(row["observed_at"]).astimezone(BANGKOK).strftime("%Y-%m")
    master = parse_dopa_workbook(workbook)
    admin = [row for row in master if not row["retired"]]
    tables["dim_admin_area"] = (list(admin[0]), admin)
    cache, production = {}, []
    with (inventory_path.parent / "records.jsonl").open(encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            if row.get("source_id") != "doae" or row.get("rollup_eligible") is not False:
                raise ValueError("production must be the reviewed DOAE source grain with rollups blocked")
            labels = tuple(row[k] for k in ("province_name", "district_name", "subdistrict_name"))
            if labels not in cache:
                cache[labels] = match_admin_names(*labels, master)
            codes = cache[labels]
            period = date(int(row["year_ad"]), int(row["month"]), 1).strftime("%Y-%m")
            production.append({**row, "province_code": codes.get("province_code"), "district_code": codes.get("district_code"),
                               "subdistrict_code": codes.get("subdistrict_code"), "mapping_status": codes["mapping_status"],
                               "period": period, "admin_temporal_status": "snapshot_match_not_period_boundary_verification"})
    if not production or len(production) != inventory["source_rows"]:
        raise ValueError("production inventory count differs from staged records")
    tables["fact_production_source"] = (list(production[0]), production)
    _, commodities = _read_csv(inventory_path.parent / "commodity_registry.csv")
    commodities = [{**r, "source_id": "doae", "identity_note": "source crop group/type/variety; no cross-provider equivalence"} for r in commodities]
    known = {r["commodity_id"] for r in commodities}
    for row in observations:
        if row["commodity_id"] and row["commodity_id"] not in known:
            known.add(row["commodity_id"])
            commodities.append({"commodity_id": row["commodity_id"], "crop_group": None, "crop_type": row["commodity_id"],
                                "variety_name": None, "source_id": row["source_id"], "identity_note": "source observation identity; no cross-provider equivalence"})
    tables["dim_commodity"] = (list(commodities[0]), commodities)
    periods = [r["period"] for name, (_, rows) in tables.items() if name.startswith("fact_") for r in rows if r.get("period")]
    start, end = min(periods), max(periods)
    months = []
    year, month = map(int, start.split("-"))
    while f"{year:04}-{month:02}" <= end:
        months.append({"period": f"{year:04}-{month:02}", "month_start": date(year, month, 1).isoformat(), "year_ad": year, "month": month})
        year, month = (year+1, 1) if month == 12 else (year, month+1)
    tables["dim_period"] = (list(months[0]), months)
    cards = json.loads((snapshot / "decision_cards.json").read_text(encoding="utf-8"))
    card_fields = ["decision_id", "status", "classification", "confidence", "area_code", "commodity_id", "evaluated_at", "rule_version", "reasons", "coverage", "recommended_action", "owner", "automatic_action", "limitations"]
    for card in cards:
        for k in card:
            if k not in card_fields and not isinstance(card[k], (dict, list)):
                card_fields.append(k)
    tables["decision_cards"] = (card_fields, cards)
    has_sat = any(r.get("source_id") == "modis" for r in observations)
    sat_status = "grid_point_samples" if has_sat else "unknown"
    sat_note = ("ดัชนีพืชพรรณ MODIS 500m 16-day และ cloud QA รายจุดพิกัด; สิทธิ์ pending ไม่กระจายลงจังหวัด"
                if has_sat else "ยังไม่มี NDVI/crop mask/zonal statistics ที่ผ่านการตรวจสอบ")
    dec_watch = sum(c.get("status") == "watch" for c in cards)
    dec_normal = sum(c.get("status") == "normal" for c in cards)
    dec_unknown = sum(c.get("status") == "unknown" for c in cards)
    dec_status = f"screening cards {len(cards)} รายการ: watch {dec_watch}, normal {dec_normal}, unknown {dec_unknown}" if cards else "unknown"
    audit = {"generated_at": metadata["generated_at"], "audience": "internal_local_only", "forecast_status": metadata["forecast_status"],
             "price_data_quality": f"ราคาที่ต้นทางให้ค่าขัดแย้ง {sum(r['quality_flag'] == 'conflicting_source_records' for r in observations)} เดือน แสดง Unknown และรอตรวจสอบ; release_at ที่ไม่ทราบคงว่าง",
             "satellite_status": sat_status, "satellite_note": sat_note,
             "decision_status": dec_status,
             "validation_status": "offline_structure_only; Desktop refresh, DAX execution and rendering pending",
             "license_note": "สิทธิ์เผยแพร่ข้อมูลจริงยังรอตรวจสอบ ห้ามอัปโหลดชุดนี้ขึ้นออนไลน์"}
    tables["snapshot_metadata"] = (list(audit), [audit])

    # National Agriculture Data Center Assets
    probes_dir = ROOT / "data/local/probes"

    # Ensure dim_source contains all providers including planetary_computer
    src_fields, src_rows = tables["dim_source"]
    known_src_ids = {r["source_id"] for r in src_rows}
    if "planetary_computer" not in known_src_ids:
        extra_src = {f: "" for f in src_fields}
        extra_src.update({
            "source_id": "planetary_computer",
            "name": "Microsoft Planetary Computer / NASA LP DAAC",
            "category": "satellite",
            "geographic_scope": "Thailand",
            "priority": "P1",
            "license_status": "pending",
            "status": "documented_not_runtime_verified",
            "type": "stac_raster",
            "url": "https://planetarycomputer.microsoft.com",
            "deferred": False,
            "license_review_required": True,
            "runtime_verified": False,
        })
        src_rows.append(extra_src)
        tables["dim_source"] = (src_fields, src_rows)

    all_prov_codes = {r["area_code"] for r in tables["dim_area"][1]}

    # 1. Project Register (dim_project) & Coverage (fact_project_coverage)
    proj_path = probes_dir / "project-register-audit.json"
    if proj_path.exists():
        proj_data = json.loads(proj_path.read_text(encoding="utf-8"))
        projects = proj_data.get("projects", [])
        proj_fields = ["project_id", "project_name_th", "managing_agency", "fiscal_year", "intervention_type",
                       "target_commodity", "target_problem", "target_area_grain", "status", "source_evidence",
                       "license_status", "budget_allocated_baht", "budget_spent_baht", "target_households",
                       "actual_households", "target_area_rai", "actual_area_rai"]
        clean_projects = [{k: p.get(k) for k in proj_fields} for p in projects]
        tables["dim_project"] = (proj_fields, clean_projects)

        cov_rows = []
        for p in projects:
            p_id = p["project_id"]
            if "TH" in p.get("target_area_codes", []) or p.get("target_area_grain") == "country":
                target_codes = all_prov_codes
            else:
                target_codes = set(p.get("target_area_codes", []))
            for c in target_codes:
                if c in all_prov_codes:
                    cov_rows.append({"project_id": p_id, "area_code": c, "is_targeted": True})
        tables["fact_project_coverage"] = (["project_id", "area_code", "is_targeted"], cov_rows)

    # 2. Spatial Evidence (fact_spatial_evidence) & Match (fact_evidence_policy_match)
    spat_path = probes_dir / "spatial-evidence-audit.json"
    if spat_path.exists():
        spat_data = json.loads(spat_path.read_text(encoding="utf-8"))
        cards = spat_data.get("province_cards", [])
        match_fields = ["area_code", "province_name_th", "identified_problems", "matched_intervention_ids",
                        "intervention_status", "diagnostic_notes", "last_audited_at"]
        clean_matches = []
        ev_fields = ["evidence_id", "area_code", "source_id", "resource_id", "problem_type", "metric_name",
                     "metric_value", "unit", "native_spatial_grain", "native_area_code", "observed_period", "license_status"]
        clean_ev = []
        for c in cards:
            c_code = c["province_code"]
            clean_matches.append({
                "area_code": c_code,
                "province_name_th": c["province_name_th"],
                "identified_problems": ", ".join(c.get("identified_problems") or []),
                "matched_intervention_ids": ", ".join(c.get("matched_intervention_ids") or []),
                "intervention_status": c["intervention_status"],
                "diagnostic_notes": c.get("diagnostic_notes", ""),
                "last_audited_at": c.get("last_audited_at", "")
            })
            for e in c.get("evidence_records", []):
                clean_ev.append({
                    "evidence_id": e["evidence_id"],
                    "area_code": c_code,
                    "source_id": e["source_id"],
                    "resource_id": e["resource_id"],
                    "problem_type": e["problem_type"],
                    "metric_name": e["metric_name"],
                    "metric_value": float(e["metric_value"]),
                    "unit": e["unit"],
                    "native_spatial_grain": e["native_spatial_grain"],
                    "native_area_code": e.get("native_area_code", ""),
                    "observed_period": e.get("observed_period", ""),
                    "license_status": e.get("license_status", "pending")
                })
        tables["fact_evidence_policy_match"] = (match_fields, clean_matches)
        tables["fact_spatial_evidence"] = (ev_fields, clean_ev)

    # 3. National Coverage Inventory (fact_national_coverage_inventory)
    cov_path = probes_dir / "coverage-inventory.json"
    if cov_path.exists():
        cov_data = json.loads(cov_path.read_text(encoding="utf-8"))
        entries = cov_data.get("entries", [])
        nat_fields = ["resource_id", "source_id", "phase", "dataset_id", "schema", "data_grain", "period",
                      "metrics", "units", "status", "missing_reason", "coverage_note", "license_status",
                      "source_records", "staged_records", "quarantined_records", "retrieved_at", "source_sha256"]
        clean_entries = []
        for e in entries:
            clean_entries.append({
                "resource_id": e.get("resource_id", ""),
                "source_id": e.get("source_id", ""),
                "phase": e.get("phase", ""),
                "dataset_id": e.get("dataset_id", ""),
                "schema": e.get("schema", ""),
                "data_grain": e.get("data_grain", ""),
                "period": str(e.get("period") or ""),
                "metrics": ", ".join(e.get("metrics") or []),
                "units": ", ".join(e.get("units") or []),
                "status": e.get("status", ""),
                "missing_reason": e.get("missing_reason", ""),
                "coverage_note": e.get("coverage_note", ""),
                "license_status": e.get("license_status", "pending"),
                "source_records": int(e.get("source_records") or 0),
                "staged_records": int(e.get("staged_records") or 0),
                "quarantined_records": int(e.get("quarantined_records") or 0),
                "retrieved_at": e.get("retrieved_at", ""),
                "source_sha256": e.get("source_sha256", ""),
            })
        tables["fact_national_coverage_inventory"] = (nat_fields, clean_entries)

    validate_relationships(tables, relationships(tables))
    measures = parse_measures(ROOT / "powerbi/measures.dax")
    # Datetimes in the model have explicit UTC values; Thai month keys were derived before dropping the offset.
    for _, rows in tables.values():
        for row in rows:
            for field in DATETIME_COLUMNS & row.keys():
                if row[field]:
                    row[field] = timestamp(row[field]).astimezone(timezone.utc).replace(tzinfo=None).isoformat()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output_dir.parent) as temporary:
        destination = Path(temporary) / "project"
        (destination / "Data").mkdir(parents=True)
        for name, (fields, rows) in tables.items():
            _csv(destination / "Data" / f"{name}.csv", fields, rows)
        semantic = destination / "TADIH.SemanticModel"
        _json(semantic / "definition.pbism", {"$schema": SCHEMAS["pbism"], "version": "1.0", "settings": {}})
        _json(semantic / "model.bim", model_definition(tables, output_dir / "Data", measures))
        write_report(destination, tables)
        report = {"project": str(output_dir / "TADIH.pbip"), "audience": "internal_local_only", "redistribution_allowed": False,
                  "row_counts": {name: len(rows) for name, (_, rows) in tables.items()}, "relationship_count": len(relationships(tables)),
                  "measure_count": len(measures), "production_matched_rows": sum(r["mapping_status"] == "matched_snapshot" for r in production),
                  "source_snapshot": str(snapshot.resolve()), "production_inventory_sha256": _hash(inventory_path), "admin_workbook_sha256": _hash(workbook),
                  "runtime_validation": "pending_Power_BI_Desktop", "online_upload": "blocked_pending_rights_and_runtime_checks",
                  "files": {str(p.relative_to(destination)).replace("\\", "/"): _hash(p) for p in sorted(destination.rglob("*")) if p.is_file()}}
        _json(destination / "build_manifest.json", report)
        destination.rename(output_dir)
    return report
