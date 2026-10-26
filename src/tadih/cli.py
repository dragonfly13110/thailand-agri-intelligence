"""Repository-oriented CLI. Network calls are always explicit."""

import argparse
import hashlib
import importlib
import inspect
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from urllib.error import URLError

import duckdb

from .warehouse import connect, load_json_rows, ingest_rows
from .publish import build_exports, verify_exports

# Numeric connector lanes publish through one shared adapter contract:
#   src/tadih/ingest_<name>_d1.py exposing run_adapter/run/main.
ADAPTER_MODULE_TEMPLATE = "tadih.ingest_{name}_d1"
ADAPTER_ENTRYPOINTS = ("run_adapter", "run", "main")
ADAPTER_NAME_PATTERN = re.compile(r"[a-z][a-z0-9_]*")


def parser():
    p = argparse.ArgumentParser(description="TADIH: Thailand-first data pipeline")
    p.add_argument("--db", default="data/local/tadih.duckdb")
    commands = p.add_subparsers(dest="command", required=True)
    cycle = commands.add_parser("price-pipeline", help="Capture/validate/import monthly prices and verify internal/public exports")
    cycle.add_argument("--year-th", required=True, type=int)
    cycle.add_argument("--refresh", action="store_true", help="Re-fetch source revisions; otherwise resume verified captures")
    land = commands.add_parser("ldd-rice-zoning", help="Local rice suitability staging; unit/year unresolved")
    land.add_argument("--output", default="data/local/raw")
    perennial = commands.add_parser("doae-perennial", help="Capture and stage annual perennial crops; no warehouse import")
    perennial.add_argument("--output", default="data/local/raw/doae")
    perennial.add_argument("--staging", default="data/local/production/perennial-staged")
    dryplant = commands.add_parser("doae-dryplant", help="Capture and stage DOAE 2569 dry-season plans locally")
    dryplant.add_argument("--output", default="data/local/raw/doae")
    dryplant.add_argument("--staging", default="data/local/production/dryplant-staged")
    dryplant.add_argument("--refresh", action="store_true", help="Capture a new source revision; retain old bytes")
    doae_p0 = commands.add_parser("doae-p0", help="Capture and stage all reviewed P0 DOAE CSV resources locally")
    doae_p0.add_argument("--output", default="data/local/doae-p0")
    doae_p0.add_argument("--dataset", action="append", help="Limit to a reviewed dataset; repeat for multiple datasets")
    doae_p0.add_argument("--refresh", action="store_true")
    doae_p1 = commands.add_parser("doae-p1", help="Capture reviewed P1 statistics, offices and provincial GeoJSON locally")
    doae_p1.add_argument("--output", default="data/local/doae-p1")
    doae_p1.add_argument("--dataset", action="append")
    doae_p1.add_argument("--refresh", action="store_true")
    doae_p2 = commands.add_parser("doae-p2", help="Capture reviewed public P2 requests locally; free text remains private")
    doae_p2.add_argument("--output", default="data/local/doae-p2")
    doae_p2.add_argument("--refresh", action="store_true")
    livestock = commands.add_parser("dld-livestock-value", help="Capture national livestock value; local staging only")
    livestock.add_argument("--output", default="data/local/raw")
    fisheries = commands.add_parser("dof-production", help="Capture national fisheries quantity/value; local staging only")
    fisheries.add_argument("--output", default="data/local/raw")
    build = commands.add_parser("build", help="Build immutable CSV/Parquet export; no network")
    build.add_argument("--output", help="Snapshot directory; defaults to exports/build or exports/private")
    build.add_argument("--period", help="Coverage month YYYY-MM")
    build.add_argument("--audience", choices=("public", "internal"), default="public")
    ingest = commands.add_parser("ingest", help="Validate and load a normalized JSON array, or publish a numeric adapter batch")
    ingest.add_argument("file", nargs="?", help="Normalized JSON array; omit when --adapter is used")
    ingest.add_argument("--adapter", help="Numeric adapter name; module tadih.ingest_<name>_d1 publishes to D1")
    ingest.add_argument("--dry-run", action="store_true", help="Prepare the adapter batch without writing to D1")
    ingest.add_argument("--write", action="store_true", help="Publish the adapter batch to Cloudflare D1")
    ingest.add_argument("--date", help="Batch date YYYY-MM-DD for the adapter run")
    verify = commands.add_parser("verify", help="Verify export checksums")
    verify.add_argument("snapshot")
    coverage = commands.add_parser("coverage-view", help="Flatten verified public coverage labels for Power BI CSV import")
    coverage.add_argument("snapshot")
    coverage.add_argument("--output", default="exports/public/small/coverage.csv")
    discover = commands.add_parser("discover", help="Probe CKAN metadata, not measurement data")
    discover.add_argument("--source", choices=("doae", "oae"), required=True)
    discover.add_argument("--limit", type=int, default=5)
    discover.add_argument("--max-pages", type=int, default=1)
    discover.add_argument("--start", type=int, default=0)
    discover.add_argument("--output", default="data/local/raw")
    weather = commands.add_parser("weather", help="Fetch a bounded approved Thai point sample")
    weather.add_argument("--latitude", type=float, required=True)
    weather.add_argument("--longitude", type=float, required=True)
    weather.add_argument("--start", required=True)
    weather.add_argument("--end", required=True)
    weather.add_argument("--forecast", action="store_true")
    weather.add_argument("--output", default="data/local/raw")
    weather.add_argument("--license-status", choices=("pending", "approved_public", "restricted"), default="pending",
                         help="approved_public only after resource terms and intended use are reviewed")
    rice = commands.add_parser("oae-rice", help="Fetch national monthly rice prices; pending licence stays local")
    rice.add_argument("--output", default="data/local/raw")
    rice.add_argument("--max-pages", type=int, default=5)
    production = commands.add_parser("doae-production", help="Download and stage the verified DOAE CSV without inventing rollups")
    production.add_argument("--output", default="data/local/production")
    production.add_argument("--refresh", action="store_true")
    prov_agg = commands.add_parser("doae-provincial-aggregate", help="Spatial sums within source month/planting round; not annual totals")
    prov_agg.add_argument("records", help="Path to staged records.jsonl")
    prov_agg.add_argument("crosswalk", help="Path to admin_crosswalk.csv")
    prov_agg.add_argument("--output", default="data/local/production/provincial", help="Output directory for CSV and inventory manifest")
    prov_agg.add_argument("--ingest", action="store_true", help="Ingest derived source-period observations into DuckDB warehouse")
    prov_agg.add_argument("--license-status", choices=("pending", "approved_public", "restricted"), default="pending")
    products = commands.add_parser("commodities", help="Stage all returned source commodity identities without cross-provider merging")
    products.add_argument("--source", choices=("nabc_monthly", "nabc_monthly_names", "nabc_weekly", "nabc_daily", "nabc_production", "moc"), default="nabc_monthly")
    products.add_argument("--year-th", type=int)
    products.add_argument("--page-size", type=int, default=100)
    products.add_argument("--max-pages", type=int, default=10)
    products.add_argument("--start-page", type=int, default=1)
    products.add_argument("--output", default="data/local/raw")
    monthly = commands.add_parser("nabc-monthly", help="Import all units/products from a verified local NABC monthly snapshot")
    monthly.add_argument("snapshot", help="Raw oae partition directory containing manifest.json")
    price_history = commands.add_parser("price-backfill", help="Checkpoint monthly histories for every product in a verified NABC inventory")
    price_history.add_argument("inventory_snapshot")
    price_history.add_argument("--output", default="data/local/raw")
    price_history.add_argument("--max-pages", type=int, default=10)
    price_history.add_argument("--refresh", action="store_true")
    geography = commands.add_parser("geography", help="Stage the reviewed DOPA hierarchy and optional DDPM display boundary")
    geography.add_argument("workbook")
    geography.add_argument("--boundary")
    geography.add_argument("--output", default="data/local/geography/staged")
    crosswalk = commands.add_parser("production-crosswalk", help="Match DOAE administrative labels within DOPA parent hierarchy")
    crosswalk.add_argument("records")
    crosswalk.add_argument("workbook")
    crosswalk.add_argument("--output", default="data/local/production/admin_crosswalk.csv")
    local = commands.add_parser("local-project", help="Build an offline PBIP model/report from verified local snapshots")
    local.add_argument("snapshot")
    local.add_argument("production_inventory")
    local.add_argument("workbook")
    local.add_argument("--output", required=True, help="New directory under data/local; source rights are still pending")
    archive = commands.add_parser("weather-backfill", help="Checkpoint completed years at one approved Thai grid point")
    archive.add_argument("--latitude", type=float, required=True)
    archive.add_argument("--longitude", type=float, required=True)
    archive.add_argument("--start-year", type=int, required=True)
    archive.add_argument("--end-year", type=int, required=True)
    archive.add_argument("--output", default="data/local/raw")
    archive.add_argument("--refresh", action="store_true", help="Fetch revised archive instead of using verified checkpoints")
    decision = commands.add_parser("decision", help="Evaluate supplied water or market evidence")
    decision.add_argument("workflow", choices=("water", "market"))
    decision.add_argument("file")
    predict = commands.add_parser("forecast", help="Evaluate a single series and apply publication gates")
    predict.add_argument("file")
    predict.add_argument("--issue-at", required=True)
    predict.add_argument("--horizon-days", type=int, default=7)
    reservoirs = commands.add_parser("rid-reservoirs", help="Capture and normalize RID medium-reservoir report; pending licence stays local")
    reservoirs.add_argument("--date", help="Report date YYYY-MM-DD; defaults to current live report")
    reservoirs.add_argument("--backfill-start", help="Start date YYYY-MM-DD for bounded daily backfill")
    reservoirs.add_argument("--backfill-end", help="End date YYYY-MM-DD for bounded daily backfill")
    reservoirs.add_argument("--output", default="data/local/raw")
    reservoirs.add_argument("--refresh", action="store_true")
    reservoirs.add_argument("--ingest", action="store_true", help="Ingest normalized observations into local DuckDB warehouse")
    satellite = commands.add_parser("modis-ndvi", help="Fetch or normalize MODIS 500m 16-day vegetation indices and cloud QA")
    satellite.add_argument("--latitude", type=float)
    satellite.add_argument("--longitude", type=float)
    satellite.add_argument("--file", help="Path to local point snapshot JSON")
    satellite.add_argument("--item", help="MODIS item identifier (e.g. MOD13A1.A2026273...)")
    satellite.add_argument("--output", default="data/local/raw")
    satellite.add_argument("--license-status", choices=("pending", "approved_public", "restricted"), default="pending")
    satellite.add_argument("--ingest", action="store_true", help="Ingest normalized observations into local DuckDB warehouse")
    nwp = commands.add_parser("tmd-nwp", help="Fetch TMD NWP daily forecast by place or point; pending licence stays local")
    place = nwp.add_mutually_exclusive_group(required=True)
    place.add_argument("--province", help="Thai province name, e.g. นครปฐม")
    place.add_argument("--latitude", type=float, help="Latitude for a model grid point")
    nwp.add_argument("--longitude", type=float, help="Longitude for a model grid point")
    nwp.add_argument("--amphoe", help="Thai amphoe name; requires --province")
    nwp.add_argument("--tambon", help="Thai tambon name; requires --amphoe")
    nwp.add_argument("--fields", default="tc_max,tc_min,cond", help="Comma-separated TMD NWP field codes")
    nwp.add_argument("--output", help="Optional explicit JSON output path")
    commands.add_parser("status", help="Count actual imported records, no inferred coverage")
    return p


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    argv, passthrough = _split_adapter_passthrough(sys.argv[1:] if argv is None else list(argv))
    args = parser().parse_args(argv)
    try:
        if args.command == "ingest" and getattr(args, "adapter", None):
            return _run_adapter_command(args, passthrough)
        if args.command == "ingest" and not getattr(args, "file", None):
            raise _UsageError("ingest needs a JSON file or --adapter <name>")
        if args.command == "verify":
            output = verify_exports(args.snapshot)
        elif args.command == "coverage-view":
            from .publish import write_coverage_view
            output = write_coverage_view(args.snapshot, args.output)
        elif args.command == "discover":
            from .ingestion import discover_ckan_pages, save_snapshot
            base = {"doae": "https://ckan.doae.go.th", "oae": "https://catalog.oae.go.th"}[args.source]
            envelope = discover_ckan_pages(base, page_size=args.limit, max_pages=args.max_pages, start=args.start)
            partition = f"catalog-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}-start{args.start}"
            output = save_snapshot(envelope, args.source, args.output, partition)
            output["pagination"] = envelope.get("pagination")
        elif args.command == "doae-p2":
            from .doae import run_catalog
            output = run_catalog(args.output, priority='p2', refresh=args.refresh)
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return 0 if output['status'] == 'success' else 1
        elif args.command == "doae-p1":
            from .doae import run_catalog
            output = run_catalog(args.output, priority='p1', datasets=args.dataset, refresh=args.refresh)
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return 0 if output['status'] == 'success' else 1
        elif args.command == "doae-p0":
            from .doae import run_p0
            output = run_p0(args.output, datasets=args.dataset, refresh=args.refresh)
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return 0 if output['status'] == 'success' else 1
        elif args.command == "doae-dryplant":
            from .plan_dryplant import capture_dryplant, stage_dryplant
            raw = capture_dryplant(args.output, refresh=args.refresh)
            output = {"raw": raw, "staging": stage_dryplant(raw["path"], args.staging)}
        elif args.command == "doae-perennial":
            from .production_perennial import fetch_perennial, stage_perennial
            raw = fetch_perennial(args.output)
            output = {"raw": raw, "staging": stage_perennial(raw["path"], args.staging)}
        elif args.command == "ldd-rice-zoning":
            from .land import capture_rice_zoning
            captured = capture_rice_zoning(args.output)
            digest = hashlib.sha256("".join(c["checksum"] for c in captured["captures"]).encode()).hexdigest()
            staged = Path(args.output) / "ldd" / (digest + "-staged.json")
            staged.write_text(json.dumps(captured["rows"], ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
            output = {"captures": captured["captures"], "staged_path": str(staged.resolve()),
                      "source_values": len(captured["rows"]), "license_status": "pending",
                      "warehouse_status": "not_imported_unit_year_and_province_mapping_unverified"}
        elif args.command == "price-pipeline":
            from .price_pipeline import run_price_pipeline
            output = run_price_pipeline(args.db, args.year_th, refresh=args.refresh)
        elif args.command == "dof-production":
            from .fisheries import capture_fisheries
            captured = capture_fisheries(args.output)
            digest = hashlib.sha256("".join(c["checksum"] for c in captured["captures"]).encode()).hexdigest()
            staged = Path(args.output) / "dof" / (digest + "-staged.json")
            staged.write_text(json.dumps(captured["rows"], ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
            output = {"captures": captured["captures"], "staged_path": str(staged.resolve()),
                      "source_values": len(captured["rows"]), "license_status": "pending",
                      "warehouse_status": "not_imported_reference_period_unverified"}
        elif args.command == "dld-livestock-value":
            from .livestock import capture_livestock_value
            captured = capture_livestock_value(args.output)
            manifest = captured["manifest"]
            staged = Path(args.output) / "dld/livestock-value" / (manifest["checksum"] + "-staged.json")
            staged.write_text(json.dumps(captured["rows"], ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
            output = {"manifest": manifest, "staged_path": str(staged.resolve()),
                      "source_rows": len(captured["rows"]), "license_status": "pending",
                      "warehouse_status": "not_imported_reference_period_unverified"}
        elif args.command == "decision":
            from .decisions import evaluate_market, evaluate_water_risk
            evidence = json.loads(Path(args.file).read_text(encoding="utf-8-sig"))
            output = (evaluate_water_risk if args.workflow == "water" else evaluate_market)(evidence)
        elif args.command == "doae-production":
            from .production import fetch_doae_production, stage_doae_production
            raw = fetch_doae_production(args.output, refresh=args.refresh)
            output = {"raw_snapshot": raw, "staging": stage_doae_production(raw["path"], Path(args.output) / "staged")}
        elif args.command == "doae-provincial-aggregate":
            from .production import aggregate_provincial_production, provincial_production_observations
            rep = aggregate_provincial_production(args.records, args.crosswalk, output_dir=args.output)
            output = {
                "source_records": rep["source_records"],
                "provincial_groups": rep["provincial_groups"],
                "total_matched_records": rep["total_matched_records"],
                "total_unmatched_records": rep["total_unmatched_records"],
                "csv_path": rep.get("csv_path"),
                "manifest_path": rep.get("manifest_path"),
                "unmatched_records_count": len(rep["unmatched_records_audit"]),
            }
            if args.ingest:
                obs = provincial_production_observations(rep["aggregates"], license_status=args.license_status)
                with connect(args.db) as db:
                    if db.execute("SELECT count(*) FROM observations WHERE observation_id LIKE 'doae-prov:%'").fetchone()[0]:
                        raise ValueError("legacy annual DOAE aggregates exist; back up and rebuild a separate warehouse before ingesting source-period aggregates")
                    output["validated_input_rows"] = ingest_rows(db, obs)
        elif args.command == "geography":
            from .geography import stage_geography
            output = stage_geography(args.workbook, args.output, args.boundary)
        elif args.command == "production-crosswalk":
            from .geography import production_crosswalk
            output = production_crosswalk(args.records, args.workbook, args.output)
        elif args.command == "local-project":
            from .local_project import build_local_project
            output = build_local_project(args.snapshot, args.production_inventory, args.workbook, args.output)
        elif args.command == "commodities":
            from .commodities import discover_commodities
            from .ingestion import save_snapshot
            envelope = discover_commodities(args.source, year_th=args.year_th, page_size=args.page_size,
                max_pages=args.max_pages, start_page=args.start_page)
            partition = f"commodities-{args.source}-{args.year_th or 'master'}-page{args.start_page}"
            output = save_snapshot(envelope, envelope["source_id"], args.output, partition)
            output.update(access_status=envelope["status"], pagination=envelope["pagination"])
            if envelope["status"] != "ok":
                print(json.dumps(output, ensure_ascii=False, indent=2))
                return 1
        elif args.command == "price-backfill":
            from .price_backfill import backfill_monthly_prices
            records = backfill_monthly_prices(args.inventory_snapshot, args.output, args.refresh, args.max_pages)
            output = {"partitions": records, "product_count": len(records),
                      "complete_products": sum(r["complete"] for r in records), "license_status": "pending",
                      "scope": "Histories for products in the supplied inventory; not a complete historical provider taxonomy"}
        elif args.command == "forecast":
            from .forecast import forecast
            records = json.loads(Path(args.file).read_text(encoding="utf-8-sig"))
            output = forecast(records, args.issue_at, args.horizon_days)
        elif args.command == "rid-reservoirs":
            from .reservoirs import capture_reservoirs, backfill_reservoirs, normalize_reservoirs
            if args.backfill_start and args.backfill_end:
                records = backfill_reservoirs(args.backfill_start, args.backfill_end, args.output, refresh=args.refresh)
                output = {"partitions": records, "days": len(records), "license_status": "pending", "spatial_support": "reservoir"}
                if args.ingest:
                    with connect(args.db) as db:
                        count = 0
                        for rec in records:
                            envelope = json.loads(Path(rec["path"]).read_text(encoding="utf-8"))
                            normalized = normalize_reservoirs(envelope)
                            count += ingest_rows(db, normalized["observations"])
                        output["validated_input_rows"] = count
            else:
                record = capture_reservoirs(args.output, args.date, refresh=args.refresh)
                output = {**record, "license_status": "pending", "spatial_support": "reservoir"}
                if args.ingest:
                    with connect(args.db) as db:
                        envelope = json.loads(Path(record["path"]).read_text(encoding="utf-8"))
                        normalized = normalize_reservoirs(envelope)
                        output["validated_input_rows"] = ingest_rows(db, normalized["observations"])
        elif args.command == "modis-ndvi":
            from .satellite import fetch_modis_point, normalize_modis_point, save_satellite_snapshot
            if args.file:
                envelope = json.loads(Path(args.file).read_text(encoding="utf-8"))
            elif args.latitude is not None and args.longitude is not None:
                envelope = fetch_modis_point(args.latitude, args.longitude, item_id=args.item)
                partition = f"modis/point-{args.latitude}-{args.longitude}-{envelope.get('start_datetime', '')[:10]}"
                save_satellite_snapshot(envelope, args.output, partition)
            else:
                raise ValueError("Must specify either --file or both --latitude and --longitude")
            normalized = normalize_modis_point(envelope, args.license_status)
            output = {
                "item_id": normalized["item_id"],
                "location_id": normalized["location_id"],
                "observed_at": normalized["observed_at"],
                "ndvi": normalized["ndvi"],
                "valid_fraction": normalized["valid_fraction"],
                "quality_flag": normalized["quality_flag"],
                "observations_count": normalized["count"],
                "license_status": args.license_status,
                "spatial_support": "grid_point"
            }
            if args.ingest:
                with connect(args.db) as db:
                    output["validated_input_rows"] = ingest_rows(db, normalized["observations"])
        elif args.command == "tmd-nwp":
            from .tmd_nwp import fetch_nwp_daily_place, fetch_nwp_daily_point
            if args.province:
                envelope = fetch_nwp_daily_place(
                    args.province, amphoe=args.amphoe, tambon=args.tambon,
                    fields=args.fields, output_path=args.output)
            else:
                if args.longitude is None:
                    raise ValueError("--longitude is required with --latitude")
                envelope = fetch_nwp_daily_point(
                    args.latitude, args.longitude, fields=args.fields,
                    output_path=args.output)
            output = {key: envelope[key] for key in (
                "status", "record_count", "spatial_support", "location", "valid_dates",
                "requested_fields", "license_status", "unit_status",
                "condition_mapping_status", "path")}
        else:
            with connect(args.db) as db:
                if args.command == "ingest":
                    output = {"validated_input_rows": load_json_rows(db, args.file)}
                elif args.command == "build":
                    output_dir = args.output or ("exports/build" if args.audience == "public" else "exports/private")
                    snapshot, metadata = build_exports(db, output_dir, args.period, audience=args.audience)
                    output = {"snapshot": str(snapshot.resolve()), **metadata}
                elif args.command == "weather":
                    from .ingestion import fetch_weather, save_snapshot
                    from .transform import weather_observations
                    envelope = fetch_weather(args.latitude, args.longitude, args.start, args.end, args.forecast)
                    key = f"{'forecast' if args.forecast else 'archive'}-{args.latitude}-{args.longitude}-{args.start}-{args.end}"
                    output = save_snapshot(envelope, "open_meteo", args.output, key)
                    if not args.forecast:
                        output["validated_input_rows"] = ingest_rows(db, weather_observations(envelope, args.license_status))
                    else:
                        output["forecast_status"] = "raw_only_provider_issue_time_unknown"
                elif args.command == "oae-rice":
                    from .ingestion import fetch_oae_rice_prices, normalize_oae_rice_prices, save_snapshot
                    envelope = fetch_oae_rice_prices(max_pages=args.max_pages)
                    output = save_snapshot(envelope, "oae", args.output, "national-rice-monthly")
                    output["validated_input_rows"] = ingest_rows(db, normalize_oae_rice_prices(envelope))
                    output["pagination"] = envelope.get("pagination")
                elif args.command == "nabc-monthly":
                    from .prices import load_nabc_monthly_snapshot, normalize_nabc_monthly
                    output = normalize_nabc_monthly(load_nabc_monthly_snapshot(args.snapshot))
                    rows = output.pop("observations") + output.pop("blocked_observations")
                    output["validated_input_rows"] = ingest_rows(db, rows)
                elif args.command == "weather-backfill":
                    from .ingestion import backfill_weather
                    from .transform import weather_observations
                    records = backfill_weather(args.latitude, args.longitude, args.start_year, args.end_year,
                                               args.output, refresh=args.refresh)
                    count = 0
                    for record in records:
                        envelope = json.loads(Path(record["path"]).read_text(encoding="utf-8"))
                        count += ingest_rows(db, weather_observations(envelope))
                    output = {"partitions": records, "validated_input_rows": count,
                              "license_status": "pending", "spatial_support": "grid_point"}
                else:
                    output = {"observation_revisions": db.execute("SELECT count(*) FROM observations").fetchone()[0],
                              "latest_observations": db.execute("SELECT count(*) FROM latest_observations").fetchone()[0]}
        print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
        return 0
    except _UsageError as exc:
        print(f"TADIH: {exc}", file=sys.stderr)
        return 2
    except (ValueError, OSError, KeyError, TypeError, URLError, duckdb.Error) as exc:
        print(f"TADIH: {exc}", file=sys.stderr)
        return 1


class _UsageError(ValueError):
    """The command line itself is wrong; the CLI exits with code 2."""


def _fail(code, message, **extra):
    payload = {"status": "failed", "errorCode": code, "message": message}
    payload.update(extra)
    print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
    return 2


def _split_adapter_passthrough(argv):
    """Split ``-- flag value`` tokens destined for an ingest adapter from CLI flags."""
    if "--adapter" not in argv or "--" not in argv:
        return argv, []
    index = argv.index("--")
    return argv[:index], argv[index + 1:]


def _adapter_module(name):
    """Import the adapter module of a lane, or None when it is not shipped yet."""
    if not isinstance(name, str) or not ADAPTER_NAME_PATTERN.fullmatch(name):
        return None
    module_name = ADAPTER_MODULE_TEMPLATE.format(name=name)
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        if exc.name and exc.name != module_name:
            raise
        return None


def adapter_argv(args, passthrough=()):
    """Build the adapter command line; dry-run is the default and never implicit-write."""
    flags = ["--write"] if getattr(args, "write", False) else ["--dry-run"]
    if getattr(args, "date", None):
        flags += ["--date", args.date]
    return flags + list(passthrough or ())


def call_adapter(module, argv, *, client=None):
    """Run an adapter module through the shared entry-point contract.

    Contract (plan §3.2 / lanes C-F): ``main(argv: list[str], *, client=None) -> int``
    honouring ``--dry-run`` (default), ``--write`` and ``--date YYYY-MM-DD``, with any
    extra flags forwarded verbatim. An entry point that declares ``dry_run``/``write``/
    ``date`` (or ``**kwargs``) keyword parameters receives the flags as keywords; one
    that only parses its own ``argv`` receives the flags positionally, because a
    keyword-only call would drop them and publish nothing.
    """
    for name in ADAPTER_ENTRYPOINTS:
        function = getattr(module, name, None)
        if not callable(function):
            continue
        try:
            parameters = inspect.signature(function).parameters
        except (TypeError, ValueError):
            parameters = {}
        positional = [
            parameter for parameter in parameters.values()
            if parameter.kind in (parameter.POSITIONAL_ONLY, parameter.POSITIONAL_OR_KEYWORD)
        ]
        accepts_flag_keywords = any(
            parameter.name in ("dry_run", "write", "date")
            or parameter.kind is parameter.VAR_KEYWORD
            for parameter in parameters.values()
        )
        if list(argv) and positional and not accepts_flag_keywords:
            # This entry point parses its own flags, so argv has to arrive
            # positionally; a keyword-only call would silently drop --write,
            # --date and the lane-specific flags.
            client_kwargs = {"client": client} if "client" in parameters else {}
            return function(list(argv), **client_kwargs)
        kwargs = {}
        for key, value in (("client", client),
                           ("dry_run", "--dry-run" in argv),
                           ("write", "--write" in argv),
                           ("date", argv[argv.index("--date") + 1] if "--date" in argv else None)):
            if any(parameter.kind is parameter.VAR_KEYWORD for parameter in parameters.values()) \
                    or key in parameters:
                kwargs[key] = value
        return function(**kwargs)
    raise _UsageError(
        f"adapter module {module.__name__} exposes none of {', '.join(ADAPTER_ENTRYPOINTS)}")


def _run_adapter_command(args, passthrough=()):
    """Publish one numeric adapter batch to D1 under the shared licence gate."""
    from .env import load_dotenv

    # D1 and the upstream API keys live in .env; without this the D1 client
    # fails with D1_UNAUTHORIZED because the wrangler fallback token expired.
    load_dotenv(override=True)
    if args.dry_run and args.write:
        return _fail("ADAPTER_FLAGS_CONFLICT", "--dry-run and --write cannot be combined")
    if args.date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        return _fail("ADAPTER_DATE_INVALID", "--date must use the YYYY-MM-DD format")
    module_name = ADAPTER_MODULE_TEMPLATE.format(name=args.adapter if isinstance(args.adapter, str) else "")
    adapter = _adapter_module(args.adapter)
    if adapter is None:
        return _fail(
            "ADAPTER_NOT_FOUND",
            f"adapter module {module_name} is not available in this checkout yet "
            "(lane module must be src/tadih/ingest_<name>_d1.py)",
            adapter=args.adapter,
            expected_module=module_name,
        )
    write = bool(args.write)
    client = None
    if write:
        from .hub_catalog_sync import connect_d1_client
        try:
            client = connect_d1_client()
        except Exception as exc:
            code = getattr(exc, "code", None) or "D1_NOT_CONFIGURED"
            return _fail(code, str(exc)[:300])
    argv = adapter_argv(args, passthrough)
    try:
        result = call_adapter(adapter, argv, client=client)
    except _UsageError:
        raise
    except SystemExit as exc:  # adapters keep the CLI exit code contract
        return int(exc.code or 0)
    except Exception as exc:
        code = getattr(exc, "code", None) or type(exc).__name__
        return _fail(code, str(exc)[:300])
    if isinstance(result, int):
        return result
    print(json.dumps({
        "adapter": args.adapter,
        "mode": "write" if write else "dry_run",
        "result": result,
    }, ensure_ascii=False, indent=2, default=str))
    return 0

