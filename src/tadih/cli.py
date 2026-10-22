"""Repository-oriented CLI. Network calls are always explicit."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.error import URLError

import duckdb

from .warehouse import connect, load_json_rows, ingest_rows
from .publish import build_exports, verify_exports


def parser():
    p = argparse.ArgumentParser(description="TADIH: Thailand-first data pipeline")
    p.add_argument("--db", default="data/local/tadih.duckdb")
    commands = p.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build", help="Build immutable CSV/Parquet export; no network")
    build.add_argument("--output", help="Snapshot directory; defaults to exports/build or exports/private")
    build.add_argument("--period", help="Coverage month YYYY-MM")
    build.add_argument("--audience", choices=("public", "internal"), default="public")
    ingest = commands.add_parser("ingest", help="Validate and load a normalized JSON array")
    ingest.add_argument("file")
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
    products = commands.add_parser("commodities", help="Stage all returned source commodity identities without cross-provider merging")
    products.add_argument("--source", choices=("nabc_monthly", "nabc_monthly_names", "nabc_weekly", "nabc_daily", "nabc_production", "moc"), default="nabc_monthly")
    products.add_argument("--year-th", type=int)
    products.add_argument("--page-size", type=int, default=100)
    products.add_argument("--max-pages", type=int, default=10)
    products.add_argument("--start-page", type=int, default=1)
    products.add_argument("--output", default="data/local/raw")
    geography = commands.add_parser("geography", help="Stage the reviewed DOPA hierarchy and optional DDPM display boundary")
    geography.add_argument("workbook")
    geography.add_argument("--boundary")
    geography.add_argument("--output", default="data/local/geography/staged")
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
    commands.add_parser("status", help="Count actual imported records, no inferred coverage")
    return p


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args = parser().parse_args(argv)
    try:
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
        elif args.command == "decision":
            from .decisions import evaluate_market, evaluate_water_risk
            evidence = json.loads(Path(args.file).read_text(encoding="utf-8-sig"))
            output = (evaluate_water_risk if args.workflow == "water" else evaluate_market)(evidence)
        elif args.command == "doae-production":
            from .production import fetch_doae_production, stage_doae_production
            raw = fetch_doae_production(args.output, refresh=args.refresh)
            output = {"raw_snapshot": raw, "staging": stage_doae_production(raw["path"], Path(args.output) / "staged")}
        elif args.command == "geography":
            from .geography import stage_geography
            output = stage_geography(args.workbook, args.output, args.boundary)
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
        elif args.command == "forecast":
            from .forecast import forecast
            records = json.loads(Path(args.file).read_text(encoding="utf-8-sig"))
            output = forecast(records, args.issue_at, args.horizon_days)
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
    except (ValueError, OSError, KeyError, TypeError, URLError, duckdb.Error) as exc:
        print(f"TADIH: {exc}", file=sys.stderr)
        return 1
