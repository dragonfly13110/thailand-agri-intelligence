"""Daily RID medium-reservoir ingestion: fetch, fail-closed validate, snapshot, log.

Daily report endpoint (anonymous; see docs/source-expansion-api.md and
docs/reservoir-adapter-spec.md):

    GET https://app.rid.go.th/reservoir/api/reservoir/public              (current day)
    GET https://app.rid.go.th/reservoir/api/reservoir/public/YYYY-MM-DD   (history)

Validation reuses src/tadih/reservoirs.py unchanged: strict schema checks
("_records" inside the adapter), content-signature guards against silently
substituted reports, duplicate-ID/finiteness/date-window rejection, plus the
percent-capacity calibration (100 x volume / storage within +/-0.05 percentage
points) from `normalize_reservoirs`. Any structural surprise raises before
anything is written (fail-closed).

Artifacts (all inside --output-dir, default data/local/raw; the directory is
git-ignored, and license_status stays "pending", so numbers must never reach
the public API, web pages or props until RID/SWOC approves redistribution):

    rid/reservoir-<report_date>.json   raw daily snapshot (validated envelope
                                       with the provider payload embedded)
    rid/sync-log.jsonl                 one metadata line per completed run:
                                       retrieval date/time, HTTP status,
                                       duration, reservoir count, checksum, ...

Usage:
    python scripts/sync_rid_reservoirs.py --dry-run
    python scripts/sync_rid_reservoirs.py                  # today's report
    python scripts/sync_rid_reservoirs.py --date 2026-10-24
    python scripts/sync_rid_reservoirs.py --output-dir data/local/raw --refresh

Exit codes: 0 = validated (dry-run also prints the capacity summary without
writing any file), 1 = fetch/validation/write failure, 2 = argparse usage error.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.ingestion import fetch_json  # noqa: E402
from tadih.reservoirs import (  # noqa: E402
    _report_day,  # the same pre-request date gate as the adapter (spec section 2)
    fetch_reservoirs,
    normalize_reservoirs,
    report_signature,
)

SCRIPT_NAME = "scripts/sync_rid_reservoirs.py"
SNAPSHOT_PATTERN = "reservoir-{report_date}.json"
SYNC_LOG_FILENAME = "sync-log.jsonl"
# Provider medium-reservoir registry per docs/reservoir-adapter-spec.md and the
# 15-day backfill evidence (461 every day). The band tolerates small registry
# drift but rejects partial responses (one missing macroregion would cut ~77).
EXPECTED_RESERVOIR_COUNT = 461
EXPECTED_RESERVOIR_COUNT_BAND = 0.05
ICT = timezone(timedelta(hours=7))


def require_reservoir_document(payload):
    """Fail closed unless the answer carries the report's top-level `document`."""
    document = payload.get("document") if isinstance(payload, dict) else None
    if not isinstance(document, str) or not document.strip():
        raise ValueError("RID response lacks top-level `document` metadata; refusing an answer that is not the documented reservoir report")
    return document


def check_expected_reservoir_count(count):
    """Refuse any day far from the 461-provider registry (partial region loss)."""
    floor = EXPECTED_RESERVOIR_COUNT * (1 - EXPECTED_RESERVOIR_COUNT_BAND)
    ceiling = EXPECTED_RESERVOIR_COUNT * (1 + EXPECTED_RESERVOIR_COUNT_BAND)
    if not floor <= count <= ceiling:
        raise ValueError(
            f"RID medium-reservoir count {count} is outside the expected window "
            f"{floor:.0f}-{ceiling:.0f} (registry: {EXPECTED_RESERVOIR_COUNT}); refusing to sync. "
            "Verify the provider registry with a probe first, then update "
            "EXPECTED_RESERVOIR_COUNT in this script with documented evidence")


def fetch_report(report_date, *, meta):
    """Fetch the target report; historical days are seeded with the current one.

    A past --date first fetches the current report once so its content signature
    feeds `fetch_reservoirs`' substitution guards (spec section 3.3). No other
    network traffic happens. `meta["requests"]` receives one entry per request.
    """
    requested_day = _report_day(report_date) if report_date is not None else datetime.now(ICT).date()

    def timed_fetcher(url):
        entry = {"url": url}
        started = time.monotonic()
        payload = fetch_json(url)
        entry.update(http_status=200, duration_seconds=round(time.monotonic() - started, 3))
        meta["requests"].append(entry)
        return payload

    reference, known = None, None
    if report_date is not None and requested_day < datetime.now(ICT).date():
        current = fetch_reservoirs(None, fetcher=timed_fetcher)
        reference = current["content_signature"]
        known = {reference: "current_report"}
    return fetch_reservoirs(report_date, fetcher=timed_fetcher,
                            reference_signature=reference, known_signatures=known), reference


def region_totals(envelope):
    """Display-only per-region sums over distinct reservoir rows (nulls excluded)."""
    totals = []
    for group in envelope["payload"]["data"]:
        rows = group["reservoir"]
        storage = [row["storage"] for row in rows if row["storage"] is not None]
        volume = [row["volume"] for row in rows if row["volume"] is not None]
        percent = [row["percent_storage"] for row in rows if row["percent_storage"] is not None]
        storage_sum, volume_sum = math.fsum(storage), math.fsum(volume)
        totals.append({
            "region": group["region"], "reservoirs": len(rows),
            "storage_mcm": storage_sum, "volume_mcm": volume_sum,
            "fill_percent": None if storage_sum <= 0 else 100 * volume_sum / storage_sum,
            "percent_min": min(percent) if percent else None,
            "percent_max": max(percent) if percent else None,
        })
    return totals


def print_summary(envelope, normalized, document, meta, *, dry_run, wall_seconds):
    overall = region_totals(envelope)
    storage_sum = math.fsum(row["storage_mcm"] for row in overall)
    volume_sum = math.fsum(row["volume_mcm"] for row in overall)
    percents = [row["percent_storage"] for group in envelope["payload"]["data"]
                for row in group["reservoir"] if row["percent_storage"] is not None]
    calibration = normalized["percent_calibration_counts"]
    print(f"RID medium-reservoir report {envelope['report_date']} (requested {envelope['requested_date'] or 'current day'})")
    print(f"  endpoint: {envelope['request_url']}")
    print(f"  provider document metadata: {document}")
    print(f"  reservoirs: {normalized['reservoir_count']} (payload total {envelope['payload']['total']});"
          f" expected ~{EXPECTED_RESERVOIR_COUNT} per RID registry [passed +/-{EXPECTED_RESERVOIR_COUNT_BAND:.0%} window check]")
    print(f"  total storage capacity: {storage_sum:,.2f} MCM; total current volume: {volume_sum:,.2f} MCM"
          " (display-only sums of distinct reservoir rows, nulls excluded)")
    if storage_sum > 0:
        print(f"  implied overall fill from sums: {100 * volume_sum / storage_sum:.2f}%")
    if percents:
        print(f"  reported percent_storage range: {min(percents):.2f}% - {max(percents):.2f}% (kept unclipped, >100 stays)")
    for row in overall:
        fill = f"{row['fill_percent']:.2f}%" if row["fill_percent"] is not None else "n/a"
        print(f"    region {row['region']}: {row['reservoirs']} reservoirs, "
              f"capacity {row['storage_mcm']:,.2f} MCM, volume {row['volume_mcm']:,.2f} MCM, fill {fill}")
    print(f"  percent calibration (100 x volume / storage, +/-0.05 pp): consistent {calibration['consistent']},"
          f" mismatch {calibration['mismatch']}, uncheckable {calibration['uncheckable']}")
    print(f"  observations ready-but-withheld: {normalized['observation_count']} (4 documented-unit measures);"
          f" pending-unit rows (inflow/outflow, unit null): {normalized['pending_unit_observation_count']}")
    print(f"  content_signature: {envelope['content_signature'][:16]}...")
    print(f"  license_status: {envelope['license_status']} - local/staging use only; no public API, web, props or cache until RID/SWOC approves")
    status = meta["requests"][-1]["http_status"]
    print(f"  run: HTTP {status}, {wall_seconds:.3f}s total, {len(meta['requests'])} request(s), retrieved_at {envelope['retrieved_at']} (UTC)")


def canonical_checksum(payload):
    """SHA-256 over canonical JSON (sorted keys, compact), matching repo snapshots."""
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def write_snapshot_atomic(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as handle:
        temporary = Path(handle.name)
        json.dump(payload, handle, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        handle.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def read_existing_snapshot(path):
    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeDecodeError):
        return None
    if not isinstance(snapshot, dict) or snapshot.get("source_id") != "rid" \
            or snapshot.get("inventory_id") != "rid_medium_reservoirs":
        return None
    return snapshot


def save_snapshot(envelope, path, *, refresh):
    """Idempotent flat snapshot; overwrite needs --refresh; verify on round trip."""
    existing = read_existing_snapshot(path)
    if existing is not None and (
        existing.get("content_signature") == envelope["content_signature"]
        and existing.get("report_date") == envelope["report_date"]
        and existing.get("requested_date") == envelope.get("requested_date")
    ):
        return {"action": "skipped_identical", "checksum": canonical_checksum(existing)}
    if path.exists() and not refresh:
        raise ValueError(f"snapshot {path} already exists with different content; pass --refresh to overwrite it")
    write_snapshot_atomic(path, envelope)
    written = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(written, dict) or written.get("content_signature") != envelope["content_signature"] \
            or report_signature(written["payload"]) != envelope["content_signature"]:
        raise ValueError("written RID snapshot failed content-signature round-trip verification; remove the file and re-run")
    return {"action": "written", "checksum": canonical_checksum(written), "path": path}


def append_log(log_path, record):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true",
                   help="Fetch, validate and print the capacity summary; write no files. Exit 0 when everything passes.")
    p.add_argument("--date", help="Historical report day YYYY-MM-DD (1998-01-01..today ICT). "
                                  "Adds one current-report fetch to seed substitution guards.")
    p.add_argument("--output-dir", default=str(ROOT / "data" / "local" / "raw"),
                   help="Destination directory (default: data/local/raw). Snapshot goes to <dir>/rid/.")
    p.add_argument("--refresh", action="store_true",
                   help="Overwrite an existing snapshot of the same report day with this retrieval.")
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    output_dir = Path(args.output_dir)
    run_started = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    meta = {"requests": []}
    try:
        envelope, reference = fetch_report(args.date, meta=meta)
        document = require_reservoir_document(envelope["payload"])
        normalized = normalize_reservoirs(envelope)
        check_expected_reservoir_count(normalized["reservoir_count"])
        wall_seconds = time.monotonic() - started
        print_summary(envelope, normalized, document, meta, dry_run=args.dry_run, wall_seconds=wall_seconds)
        if args.dry_run:
            print("Dry run OK: report validated; no files written.")
            return 0
        if envelope.get("license_status") != "pending":
            raise ValueError("RID envelope license_status is no longer 'pending'; ingestion halts until the pipeline is revised")
        snapshot_path = output_dir / "rid" / SNAPSHOT_PATTERN.format(report_date=envelope["report_date"])
        saved = save_snapshot(envelope, snapshot_path, refresh=args.refresh)
        record = {
            "script": SCRIPT_NAME,
            "run_started_at": run_started,
            "run_completed_at": datetime.now(timezone.utc).isoformat(),
            "retrieved_at_utc": envelope["retrieved_at"],
            "requested_date": envelope.get("requested_date"),
            "report_date": envelope["report_date"],
            "request_url": envelope["request_url"],
            "http_status": meta["requests"][-1]["http_status"],
            "request_count": len(meta["requests"]),
            "requests": meta["requests"],
            "substitution_reference_prefetched": bool(reference),
            "duration_seconds": round(wall_seconds, 3),
            "expected_reservoir_count": EXPECTED_RESERVOIR_COUNT,
            "reservoir_count": normalized["reservoir_count"],
            "observation_count": normalized["observation_count"],
            "pending_unit_observation_count": normalized["pending_unit_observation_count"],
            "percent_calibration_counts": normalized["percent_calibration_counts"],
            "content_signature": envelope["content_signature"],
            "license_status": envelope["license_status"],
            "document": document,
            "action": saved["action"],
            "snapshot_path": snapshot_path.relative_to(output_dir).as_posix(),
            "snapshot_checksum": saved["checksum"],
            "checksum_basis": "canonical_json_utf8",
        }
        log_path = output_dir / "rid" / SYNC_LOG_FILENAME
        append_log(log_path, record)
        print(f"Snapshot {saved['action']} -> {snapshot_path}")
        print(f"Metadata log appended -> {log_path}")
        return 0
    except Exception as exc:  # fail-closed: no partial writes, clear exit code
        print(f"RID sync failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
