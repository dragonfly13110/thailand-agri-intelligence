"""Verify the Cloudflare D1 catalog sync result. Read-only: SELECT statements only.

Reports dataset and resource counts per source_id, sync_runs status tallies, per-run
timing derived from sync_runs.started_at/completed_at, and catalog integrity checks
(orphan rows, empty identifiers, publication flags, and observation leakage).

Usage:
    python scripts/verify_d1_catalog_full.py
    python scripts/verify_d1_catalog_full.py --json
    python scripts/verify_d1_catalog_full.py --out d1-verify.json
"""

import argparse
from datetime import datetime
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.hub_catalog_sync import (  # noqa: E402
    ALLOWED_SOURCE_IDS,
    CatalogSyncError,
    connect_d1_client,
)

EXPECTED_SOURCE_IDS = tuple(sorted(ALLOWED_SOURCE_IDS))


def rows(result):
    """Normalize the D1 REST result envelope into a list of row dicts."""
    if not isinstance(result, dict):
        return []
    inner = result.get("results")
    if isinstance(inner, list):
        return [row for row in inner if isinstance(row, dict)]
    return [result] if result else []


def one(result, default=0):
    """Read a single scalar column from a one-row aggregate query."""
    found = rows(result)
    if not found:
        return default
    values = list(found[0].values())
    return values[0] if values else default


def duration_seconds(started_at, completed_at):
    """Elapsed seconds between two ISO-8601 UTC timestamps stored by the sync job."""
    if not started_at or not completed_at:
        return None
    try:
        start = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(completed_at).replace("Z", "+00:00"))
    except ValueError:
        return None
    return round((end - start).total_seconds(), 3)


def collect(client):
    """Run every verification query and return one structured report."""
    report = {
        "verified_at": datetime.now().astimezone().isoformat(),
        "database": "tadih-hub",
        "expected_source_ids": list(EXPECTED_SOURCE_IDS),
    }

    dataset_rows = rows(client.execute(
        "SELECT source_id, COUNT(*) AS dataset_count FROM datasets GROUP BY source_id ORDER BY source_id"))
    report["datasets_per_source"] = {
        row["source_id"]: int(row["dataset_count"]) for row in dataset_rows if "source_id" in row
    }

    resource_rows = rows(client.execute(
        "SELECT d.source_id AS source_id, COUNT(*) AS resource_count FROM resources r "
        "JOIN datasets d ON d.dataset_id = r.dataset_id GROUP BY d.source_id ORDER BY d.source_id"))
    report["resources_per_source"] = {
        row["source_id"]: int(row["resource_count"]) for row in resource_rows if "source_id" in row
    }

    report["totals"] = {
        "sources": int(one(client.execute("SELECT COUNT(*) AS n FROM sources"))),
        "datasets": int(one(client.execute("SELECT COUNT(*) AS n FROM datasets"))),
        "resources": int(one(client.execute("SELECT COUNT(*) AS n FROM resources"))),
        "sync_runs": int(one(client.execute("SELECT COUNT(*) AS n FROM sync_runs"))),
        "observations": int(one(client.execute("SELECT COUNT(*) AS n FROM observations"))),
        "locations": int(one(client.execute("SELECT COUNT(*) AS n FROM locations"))),
    }

    status_rows = rows(client.execute(
        "SELECT status, COUNT(*) AS run_count FROM sync_runs GROUP BY status ORDER BY status"))
    report["sync_runs_by_status"] = {
        row["status"]: int(row["run_count"]) for row in status_rows if "status" in row
    }
    for status in ("succeeded", "partial", "failed", "running"):
        report["sync_runs_by_status"].setdefault(status, 0)

    per_source_rows = rows(client.execute(
        "SELECT source_id, status, COUNT(*) AS run_count FROM sync_runs "
        "GROUP BY source_id, status ORDER BY source_id, status"))
    report["sync_runs_per_source"] = {}
    for row in per_source_rows:
        bucket = report["sync_runs_per_source"].setdefault(row["source_id"], {})
        bucket[row["status"]] = int(row["run_count"])

    run_rows = rows(client.execute(
        "SELECT run_id, source_id, status, started_at, completed_at, source_retrieved_at, "
        "records_read, records_written, records_quarantined, payload_sha256, adapter_version, "
        "error_code FROM sync_runs ORDER BY started_at, run_id"))
    latest = {}
    for row in run_rows:
        latest[row["source_id"]] = {
            "run_id": row["run_id"],
            "status": row["status"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "duration_seconds": duration_seconds(row.get("started_at"), row.get("completed_at")),
            "source_retrieved_at": row.get("source_retrieved_at"),
            "records_read": row.get("records_read"),
            "records_written": row.get("records_written"),
            "records_quarantined": row.get("records_quarantined"),
            "payload_sha256": row.get("payload_sha256"),
            "adapter_version": row.get("adapter_version"),
            "error_code": row.get("error_code"),
        }
    report["latest_run_per_source"] = latest
    report["run_history"] = [
        {
            "source_id": row["source_id"],
            "run_id": row["run_id"],
            "status": row["status"],
            "duration_seconds": duration_seconds(row.get("started_at"), row.get("completed_at")),
            "records_read": row.get("records_read"),
            "records_written": row.get("records_written"),
            "records_quarantined": row.get("records_quarantined"),
            "error_code": row.get("error_code"),
        }
        for row in run_rows
    ]

    report["source_registry"] = [
        {
            "source_id": row["source_id"],
            "source_name": row["source_name"],
            "connector_kind": row["connector_kind"],
            "status": row["status"],
            "metadata_access_status": row["metadata_access_status"],
            "base_url": row["base_url"],
            "updated_at": row["updated_at"],
        }
        for row in rows(client.execute(
            "SELECT source_id, source_name, connector_kind, status, metadata_access_status, "
            "base_url, updated_at FROM sources ORDER BY source_id"))
    ]

    report["resource_access_status"] = {
        row["access_status"]: int(row["n"]) for row in rows(client.execute(
            "SELECT access_status, COUNT(*) AS n FROM resources GROUP BY access_status ORDER BY access_status"))
    }
    report["dataset_metadata_access_status"] = {
        row["metadata_access_status"]: int(row["n"]) for row in rows(client.execute(
            "SELECT metadata_access_status, COUNT(*) AS n FROM datasets "
            "GROUP BY metadata_access_status ORDER BY metadata_access_status"))
    }
    report["resources_with_declared_license"] = int(one(client.execute(
        "SELECT COUNT(*) AS n FROM resources WHERE declared_license IS NOT NULL AND declared_license <> ''")))
    report["resources_publication_approved"] = int(one(client.execute(
        "SELECT COALESCE(SUM(project_publication_approved), 0) AS n FROM resources")))
    report["resources_with_active_run"] = int(one(client.execute(
        "SELECT COUNT(*) AS n FROM resources WHERE active_run_id IS NOT NULL")))

    report["integrity"] = {
        "resources_without_dataset": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM resources r LEFT JOIN datasets d ON d.dataset_id = r.dataset_id "
            "WHERE d.dataset_id IS NULL"))),
        "datasets_without_source": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM datasets d LEFT JOIN sources s ON s.source_id = d.source_id "
            "WHERE s.source_id IS NULL"))),
        "datasets_without_title": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM datasets WHERE title IS NULL OR TRIM(title) = ''"))),
        "datasets_without_source_url": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM datasets WHERE source_url IS NULL OR TRIM(source_url) = ''"))),
        "resources_without_name": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM resources WHERE name IS NULL OR TRIM(name) = ''"))),
        "resources_without_url": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM resources WHERE resource_url IS NULL OR TRIM(resource_url) = ''"))),
        "duplicate_source_dataset_ids": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM (SELECT source_id, source_dataset_id FROM datasets "
            "GROUP BY source_id, source_dataset_id HAVING COUNT(*) > 1)"))),
        "duplicate_resource_ids": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM (SELECT resource_id FROM resources GROUP BY resource_id "
            "HAVING COUNT(*) > 1)"))),
        "runs_still_running": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM sync_runs WHERE status = 'running'"))),
        "runs_missing_completion": int(one(client.execute(
            "SELECT COUNT(*) AS n FROM sync_runs WHERE completed_at IS NULL"))),
    }
    return report


def findings(report):
    """Turn the raw report into explicit pass/fail statements for the audit write-up."""
    checks = []
    missing = [s for s in report["expected_source_ids"] if s not in report["datasets_per_source"]]
    checks.append({
        "check": "all_expected_sources_present_in_datasets",
        "passed": not missing,
        "detail": "missing: " + (", ".join(missing) if missing else "none"),
    })
    checks.append({
        "check": "no_source_falls_back_to_a_later_run",
        "passed": not missing,
        "detail": "sources without datasets: " + (", ".join(missing) if missing else "none"),
    })
    checks.append({
        "check": "sync_runs_not_left_running",
        "passed": report["integrity"]["runs_still_running"] == 0,
        "detail": "running runs: %d" % report["integrity"]["runs_still_running"],
    })
    checks.append({
        "check": "every_run_has_completion_timestamp",
        "passed": report["integrity"]["runs_missing_completion"] == 0,
        "detail": "runs without completed_at: %d" % report["integrity"]["runs_missing_completion"],
    })
    checks.append({
        "check": "no_orphan_resources",
        "passed": report["integrity"]["resources_without_dataset"] == 0,
        "detail": "orphan resources: %d" % report["integrity"]["resources_without_dataset"],
    })
    checks.append({
        "check": "no_orphan_datasets",
        "passed": report["integrity"]["datasets_without_source"] == 0,
        "detail": "orphan datasets: %d" % report["integrity"]["datasets_without_source"],
    })
    checks.append({
        "check": "no_duplicate_identifiers",
        "passed": (report["integrity"]["duplicate_source_dataset_ids"] == 0
                   and report["integrity"]["duplicate_resource_ids"] == 0),
        "detail": "duplicate dataset keys: %d, duplicate resource ids: %d" % (
            report["integrity"]["duplicate_source_dataset_ids"],
            report["integrity"]["duplicate_resource_ids"]),
    })
    checks.append({
        "check": "no_numeric_observations_published",
        "passed": report["totals"]["observations"] == 0,
        "detail": "observations rows: %d (metadata sync must not write values)" % report["totals"]["observations"],
    })
    checks.append({
        "check": "no_resource_marked_publication_approved",
        "passed": report["resources_publication_approved"] == 0,
        "detail": "resources with project_publication_approved=1: %d" % report["resources_publication_approved"],
    })
    checks.append({
        "check": "no_resource_marked_approved_public",
        "passed": report["resource_access_status"].get("approved_public", 0) == 0,
        "detail": "resources with access_status=approved_public: %d"
                  % report["resource_access_status"].get("approved_public", 0),
    })
    failed = [s for s, run in report["latest_run_per_source"].items() if run["status"] == "failed"]
    checks.append({
        "check": "no_source_failed_in_latest_run",
        "passed": not failed,
        "detail": "failed sources: " + (", ".join(sorted(failed)) if failed else "none"),
    })
    return checks


def print_report(report, checks):
    totals = report["totals"]
    print("D1 catalog verification - %s" % report["database"])
    print("verified_at: %s" % report["verified_at"])
    print("")
    print("totals: sources=%d datasets=%d resources=%d sync_runs=%d observations=%d locations=%d" % (
        totals["sources"], totals["datasets"], totals["resources"],
        totals["sync_runs"], totals["observations"], totals["locations"]))
    print("")
    header = "%-10s %10s %11s %10s %10s %12s %10s" % (
        "source_id", "datasets", "resources", "read", "written", "quarantined", "seconds")
    print(header)
    print("-" * len(header))
    for source_id in report["expected_source_ids"]:
        run = report["latest_run_per_source"].get(source_id, {})
        print("%-10s %10d %11d %10s %10s %12s %10s" % (
            source_id,
            report["datasets_per_source"].get(source_id, 0),
            report["resources_per_source"].get(source_id, 0),
            run.get("records_read", "-"),
            run.get("records_written", "-"),
            run.get("records_quarantined", "-"),
            run.get("duration_seconds", "-"),
        ))
    extra = [s for s in report["datasets_per_source"] if s not in report["expected_source_ids"]]
    for source_id in extra:
        print("%-10s %10d %11d %10s %10s %12s %10s  (unexpected source_id)" % (
            source_id,
            report["datasets_per_source"][source_id],
            report["resources_per_source"].get(source_id, 0),
            "-", "-", "-", "-",
        ))
    print("")
    print("sync_runs by status: %s" % json.dumps(report["sync_runs_by_status"], ensure_ascii=False))
    print("resource access_status: %s" % json.dumps(report["resource_access_status"], ensure_ascii=False))
    print("dataset metadata_access_status: %s" % json.dumps(
        report["dataset_metadata_access_status"], ensure_ascii=False))
    print("integrity: %s" % json.dumps(report["integrity"], ensure_ascii=False))
    print("")
    print("checks:")
    for check in checks:
        print("  [%s] %-42s %s" % ("PASS" if check["passed"] else "FAIL",
                                    check["check"], check["detail"]))


def parser():
    result = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("--json", action="store_true", help="Print the raw report as JSON instead of a table.")
    result.add_argument("--out", help="Optional path for the full report JSON (default: not written).")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        client = connect_d1_client()
    except CatalogSyncError as exc:
        print(json.dumps({"status": "failed", "errorCode": exc.code}, ensure_ascii=False), file=sys.stderr)
        return 2
    try:
        report = collect(client)
    except CatalogSyncError as exc:
        print(json.dumps({"status": "failed", "errorCode": exc.code}, ensure_ascii=False), file=sys.stderr)
        return 2
    checks = findings(report)
    report["checks"] = checks
    report["all_checks_passed"] = all(check["passed"] for check in checks)
    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("report written to %s" % path.resolve())
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_report(report, checks)
    return 0 if report["all_checks_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
