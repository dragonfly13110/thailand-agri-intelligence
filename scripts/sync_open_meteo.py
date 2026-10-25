#!/usr/bin/env python3
"""Open-Meteo Weather Ingestion CLI.

Fetches historical reanalysis (ERA5) and weather forecasts from Open-Meteo API
for Thailand provinces, normalizes to Hub standards (UTC+7, missing preserved as null),
validates data integrity, and atomically writes snapshots and metadata logs.

Adheres strictly to CC BY 4.0 attribution and non-commercial rate limits (<600 req/min).

Usage:
    python scripts/sync_open_meteo.py --dry-run
    python scripts/sync_open_meteo.py --province-code 73 --start-date 2024-01-01 --end-date 2024-01-07 --dry-run
    python scripts/sync_open_meteo.py --province-code 10 --start-date 2024-01-01 --end-date 2024-01-07
    python scripts/sync_open_meteo.py --province-code 73 --forecast --dry-run

Exit codes:
    0 = Success (dry-run validated or snapshot written and verified)
    1 = Failure (HTTP error, validation error, rate-limit failure)
    2 = Argparse usage error
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
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.open_meteo import (
    ATTRIBUTION_TEXT,
    ATTRIBUTION_URL,
    DECLARED_LICENSE,
    LICENSE_STATUS,
    OPEN_METEO_ARCHIVE_URL,
    OPEN_METEO_FORECAST_URL,
    SPATIAL_SUPPORT,
    THAILAND_PROVINCE_CENTROIDS,
    OpenMeteoClient,
    content_signature,
    normalize_open_meteo_daily,
    open_meteo_to_hub_observations,
)

SCRIPT_NAME = "scripts/sync_open_meteo.py"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "local" / "raw" / "weather"
SYNC_LOG_FILENAME = "sync-log.jsonl"
DEFAULT_PROVINCE_CODE = "73"  # Nakhon Pathom agricultural plain


def canonical_checksum(payload: Any) -> str:
    """Deterministic SHA-256 over canonical UTF-8 JSON representation."""
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def write_snapshot_atomic(path: Path, payload: Dict[str, Any]) -> None:
    """Write snapshot atomically via temporary file replacement."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as handle:
        temporary = Path(handle.name)
        json.dump(payload, handle, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        handle.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def append_sync_log(log_path: Path, record: Dict[str, Any]) -> None:
    """Append one JSON line to sync-log.jsonl."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def print_summary(
    province_code: str,
    prov_meta: Dict[str, Any],
    envelope: Dict[str, Any],
    normalized_records: List[Dict[str, Any]],
    observations: List[Dict[str, Any]],
    *,
    wall_seconds: float,
    dry_run: bool,
) -> None:
    """Print structured agrometeorology summary to stdout."""
    grid_loc = envelope.get("provider_grid_location", {})
    grid_lat = grid_loc.get("latitude")
    grid_lon = grid_loc.get("longitude")
    elev = grid_loc.get("elevation")

    print(f"Open-Meteo Weather Report: Province {province_code} ({prov_meta.get('name_th')} / {prov_meta.get('name_en')})")
    print(f"  Endpoint: {envelope['request_url']}")
    print(f"  Model: {envelope['provider_model']} | Data Kind: {envelope['data_kind']}")
    print(f"  Requested Centroid: lat={prov_meta.get('lat')}, lon={prov_meta.get('lon')}")
    print(f"  Grid Point: lat={grid_lat}, lon={grid_lon}, elevation={elev}m (spatial_support={SPATIAL_SUPPORT})")
    print(f"  Attribution: {ATTRIBUTION_TEXT} ({ATTRIBUTION_URL}) - {DECLARED_LICENSE}")
    print(f"  License Status: {envelope['license_status']} (restricted/pending redistribution)")
    print(f"  Retrieved At (UTC): {envelope['retrieved_at']}")
    print(f"  Days Ingested: {len(normalized_records)} | Atomic Hub Observations: {len(observations)}")
    print(f"  Content Signature (SHA-256): {envelope['content_signature'][:16]}...")
    print(f"  Fetch Duration: {wall_seconds:.3f}s")
    print("\n  Daily Summary (UTC+7):")
    print("  Date       | T2M Mean (°C) | Tmin (°C) | Tmax (°C) | Rain (mm) | Wind (m/s) | RH (%)")
    print("  -----------+---------------+-----------+-----------+-----------+------------+-------")

    for row in normalized_records:
        tmean_s = f"{row['t2m_c']:.1f}" if row['t2m_c'] is not None else " null"
        tmin_s = f"{row['tmin_c']:.1f}" if row['tmin_c'] is not None else " null"
        tmax_s = f"{row['tmax_c']:.1f}" if row['tmax_c'] is not None else " null"
        rain_s = f"{row['rainfall_mm']:.1f}" if row['rainfall_mm'] is not None else " null"
        wind_s = f"{row['wind_speed_ms']:.1f}" if row['wind_speed_ms'] is not None else " null"
        rh_s = f"{row['rh2m_pct']:.0f}%" if row['rh2m_pct'] is not None else " null"
        print(f"  {row['observation_date']} | {tmean_s:>13} | {tmin_s:>9} | {tmax_s:>9} | {rain_s:>9} | {wind_s:>10} | {rh_s:>5}")

    if dry_run:
        print("\n  [DRY RUN] All validation checks passed. No files written.")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--province-code",
        default=DEFAULT_PROVINCE_CODE,
        help="Two-digit DOPA province code (e.g. 73, 10), comma-separated list, or 'all' (default: 73)",
    )
    p.add_argument(
        "--start-date",
        default=None,
        help="Start date YYYY-MM-DD for historical archive (default: 7 days ago)",
    )
    p.add_argument(
        "--end-date",
        default=None,
        help="End date YYYY-MM-DD for historical archive (default: yesterday)",
    )
    p.add_argument(
        "--forecast",
        action="store_true",
        help="Fetch forecast data instead of historical archive",
    )
    p.add_argument(
        "--forecast-days",
        type=int,
        default=7,
        help="Forecast lead days between 1 and 16 (default: 7)",
    )
    p.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Target directory for snapshots and logs (default: {DEFAULT_OUTPUT_DIR})",
    )
    p.add_argument(
        "--refresh",
        action="store_true",
        help="Overwrite existing snapshot if different",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch, validate and display weather metrics without writing files",
    )
    return p


def main(argv: Optional[List[str]] = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    args = parser().parse_args(argv)
    output_dir = Path(args.output_dir)

    # Resolve target province codes
    if args.province_code.lower() == "all":
        target_codes = sorted(THAILAND_PROVINCE_CENTROIDS.keys())
    else:
        target_codes = [c.strip() for c in args.province_code.split(",") if c.strip()]

    if not target_codes:
        print("Error: No valid province code specified", file=sys.stderr)
        return 2

    for c in target_codes:
        if c not in THAILAND_PROVINCE_CENTROIDS:
            print(f"Error: Unknown Thailand province code: {c!r}", file=sys.stderr)
            return 2

    # Date resolution for archive
    start_date = args.start_date
    end_date = args.end_date
    if not args.forecast:
        if not end_date:
            # ERA5 lag is ~5 days; pick a safe recent window if unspecified
            end_dt = date.today() - timedelta(days=5)
            end_date = end_dt.isoformat()
        if not start_date:
            start_dt = date.fromisoformat(end_date) - timedelta(days=6)
            start_date = start_dt.isoformat()

    client = OpenMeteoClient(min_delay_seconds=0.20, max_retries=3, timeout_seconds=20.0)

    overall_success = True
    run_started_at = datetime.now(timezone.utc).isoformat()

    for p_code in target_codes:
        prov_meta = THAILAND_PROVINCE_CENTROIDS[p_code]
        lat = prov_meta["lat"]
        lon = prov_meta["lon"]

        started = time.monotonic()
        try:
            envelope = client.fetch_weather(
                lat,
                lon,
                forecast=args.forecast,
                start_date=start_date,
                end_date=end_date,
                forecast_days=args.forecast_days,
            )
            wall_seconds = time.monotonic() - started

            # Validation and normalization
            normalized = normalize_open_meteo_daily(envelope, province_code=p_code)
            observations = open_meteo_to_hub_observations(envelope, province_code=p_code)

            # Print summary table
            print_summary(
                p_code,
                prov_meta,
                envelope,
                normalized,
                observations,
                wall_seconds=wall_seconds,
                dry_run=args.dry_run,
            )

            if args.dry_run:
                continue

            # Safe Mode Snapshot Writing
            envelope_with_normalized = {
                **envelope,
                "province_code": p_code,
                "province_name_th": prov_meta["name_th"],
                "normalized_records": normalized,
            }

            if args.forecast:
                date_tag = f"forecast_{date.today().isoformat()}"
            else:
                date_tag = f"{start_date}_{end_date}"

            snapshot_filename = f"open_meteo_{p_code}_{date_tag}.json"
            snapshot_path = output_dir / snapshot_filename

            # Idempotency and overwrite check
            action = "written"
            if snapshot_path.exists():
                if not args.refresh:
                    try:
                        existing = json.loads(snapshot_path.read_text(encoding="utf-8"))
                        if existing.get("content_signature") == envelope["content_signature"]:
                            action = "skipped_identical"
                        else:
                            raise ValueError(
                                f"Snapshot {snapshot_path} already exists with different signature; pass --refresh to overwrite"
                            )
                    except (json.JSONDecodeError, KeyError):
                        if not args.refresh:
                            raise ValueError(f"Corrupted snapshot exists at {snapshot_path}; pass --refresh to overwrite")

            if action == "written":
                write_snapshot_atomic(snapshot_path, envelope_with_normalized)
                # Round-trip verification
                written = json.loads(snapshot_path.read_text(encoding="utf-8"))
                if written.get("content_signature") != envelope["content_signature"]:
                    raise ValueError(f"Snapshot round-trip verification failed for {snapshot_path}")

            chk = canonical_checksum(envelope_with_normalized)
            log_record = {
                "script": SCRIPT_NAME,
                "run_started_at": run_started_at,
                "run_completed_at": datetime.now(timezone.utc).isoformat(),
                "retrieved_at_utc": envelope["retrieved_at"],
                "province_code": p_code,
                "start_date": start_date if not args.forecast else None,
                "end_date": end_date if not args.forecast else None,
                "forecast": args.forecast,
                "request_url": envelope["request_url"],
                "http_status": 200,
                "duration_seconds": round(wall_seconds, 3),
                "daily_record_count": len(normalized),
                "observation_count": len(observations),
                "content_signature": envelope["content_signature"],
                "snapshot_checksum": chk,
                "snapshot_path": str(snapshot_path.relative_to(ROOT)).replace("\\", "/"),
                "action": action,
                "license_status": envelope["license_status"],
            }

            log_path = output_dir / SYNC_LOG_FILENAME
            append_sync_log(log_path, log_record)
            print(f"  Snapshot {action} -> {snapshot_path}")
            print(f"  Sync log updated -> {log_path}")

        except Exception as exc:
            overall_success = False
            print(f"Open-Meteo sync failed for province {p_code}: {type(exc).__name__}: {exc}", file=sys.stderr)

    return 0 if overall_success else 1


if __name__ == "__main__":
    sys.exit(main())
