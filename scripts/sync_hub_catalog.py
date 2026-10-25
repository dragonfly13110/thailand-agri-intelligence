"""Sync public CKAN catalog metadata into the Hub database."""

import argparse
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.hub_catalog_sync import (  # noqa: E402
    ALLOWED_SOURCE_IDS,
    CatalogSyncError,
    DEFAULT_SOURCE_IDS,
    connect_d1_client,
    connect_database,
    harvest_ckan_metadata,
    sync_catalog_source,
    sync_catalog_source_d1,
)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description=__doc__,
        epilog=(
            "DB sync requires a sink: --sink postgresql needs TADIH_SYNC_DATABASE_URL and "
            "`pip install -e '.[hub]'`; --sink d1 needs CF_ACCOUNT_ID, CF_D1_TOKEN and "
            "CF_D1_DATABASE_ID. --dry-run needs no database driver."
        ),
    )
    result.add_argument("--source", choices=sorted(ALLOWED_SOURCE_IDS), action="append",
                        help="CKAN catalog to sync; repeat to select multiple. Defaults to all allowlisted catalogs.")
    result.add_argument("--sink", choices=("d1", "postgresql"), default="d1",
                        help="Metadata sink for non-dry runs (default: d1).")
    result.add_argument("--page-size", type=int, default=50)
    result.add_argument("--max-pages", type=int, default=20)
    result.add_argument("--batch-size", type=int, default=25,
                        help="Number of datasets/resources to upsert per D1 statement (default: 25).")
    result.add_argument("--timeout", type=float, default=12)
    result.add_argument("--dry-run", action="store_true",
                        help="Fetch and validate metadata, print counts only, and do not connect to a database")
    return result


def main(argv: list[str] | None = None) -> int:
    argument_parser = parser()
    args = argument_parser.parse_args(argv)
    source_ids = list(dict.fromkeys(args.source or DEFAULT_SOURCE_IDS))
    if not 1 <= args.page_size <= 100:
        argument_parser.error("--page-size must be between 1 and 100")
    if not 1 <= args.max_pages <= 20:
        argument_parser.error("--max-pages must be between 1 and 20")
    if not 1 <= args.batch_size <= 100:
        argument_parser.error("--batch-size must be between 1 and 100")
    if not 1 <= args.timeout <= 30:
        argument_parser.error("--timeout must be between 1 and 30 seconds")
    if args.dry_run:
        output = []
        for source_id in source_ids:
            try:
                harvested = harvest_ckan_metadata(
                    source_id,
                    page_size=args.page_size,
                    max_pages=args.max_pages,
                    timeout=args.timeout,
                )
            except (CatalogSyncError, ValueError) as exc:
                code = exc.code if isinstance(exc, CatalogSyncError) else "INVALID_ARGUMENT"
                output.append({"source_id": source_id, "status": "failed", "errorCode": code})
                continue
            output.append({
                key: harvested[key]
                for key in (
                    "source",
                    "page_count",
                    "source_total_count",
                    "records_read",
                    "records_written",
                    "records_quarantined",
                    "duplicates_removed",
                    "complete",
                    "incomplete_reason",
                )
            } | {"status": "complete" if harvested["complete"] else "partial"})
        complete = all(result["status"] == "complete" for result in output)
        print(json.dumps({"status": "dry_run" if complete else "partial", "sources": output}, ensure_ascii=False))
        return 0 if complete else 1

    if args.sink == "d1":
        return sync_to_d1(args, source_ids)
    dsn = os.environ.get("TADIH_SYNC_DATABASE_URL")
    if not dsn:
        print(json.dumps({
            "status": "failed",
            "errorCode": "TADIH_SYNC_DATABASE_URL_MISSING",
            "message": "Set the PostgreSQL pooler DSN in TADIH_SYNC_DATABASE_URL",
        }, ensure_ascii=False), file=sys.stderr)
        return 2
    try:
        connection = connect_database(dsn)
    except CatalogSyncError as exc:
        print(json.dumps({"status": "failed", "errorCode": exc.code}, ensure_ascii=False), file=sys.stderr)
        return 2
    results = []
    try:
        for source_id in source_ids:
            try:
                results.append(sync_catalog_source(
                    connection,
                    source_id,
                    page_size=args.page_size,
                    max_pages=args.max_pages,
                    timeout=args.timeout,
                ))
            except (CatalogSyncError, ValueError) as exc:
                code = exc.code if isinstance(exc, CatalogSyncError) else "INVALID_ARGUMENT"
                results.append({"source_id": source_id, "status": "failed", "errorCode": code})
    finally:
        connection.close()
    complete = all(result["status"] == "succeeded" for result in results)
    print(json.dumps({"status": "succeeded" if complete else "partial", "sources": results}, ensure_ascii=False))
    return 0 if complete else 1


def sync_to_d1(args: argparse.Namespace, source_ids: list[str]) -> int:
    """Sync each catalog into Cloudflare D1; failures stay isolated per source."""
    try:
        client = connect_d1_client()
    except CatalogSyncError as exc:
        print(json.dumps({
            "status": "failed",
            "errorCode": exc.code,
            "message": "Set CF_ACCOUNT_ID, CF_D1_TOKEN and CF_D1_DATABASE_ID for the D1 sink",
        }, ensure_ascii=False), file=sys.stderr)
        return 2
    results = []
    started_at = time.monotonic()
    for source_id in source_ids:
        source_started_at = time.monotonic()
        try:
            result = sync_catalog_source_d1(
                client,
                source_id,
                page_size=args.page_size,
                max_pages=args.max_pages,
                batch_size=args.batch_size,
                timeout=args.timeout,
            )
        except (CatalogSyncError, ValueError) as exc:
            code = exc.code if isinstance(exc, CatalogSyncError) else "INVALID_ARGUMENT"
            result = {"source_id": source_id, "status": "failed", "errorCode": code}
        result["elapsed_seconds"] = round(time.monotonic() - source_started_at, 3)
        results.append(result)
    complete = all(result["status"] == "succeeded" for result in results)
    print(json.dumps({
        "status": "succeeded" if complete else "partial",
        "elapsed_seconds": round(time.monotonic() - started_at, 3),
        "sources": results,
    }, ensure_ascii=False))
    return 0 if complete else 1


if __name__ == "__main__":
    raise SystemExit(main())
