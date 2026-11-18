#!/usr/bin/env python3
"""Build the reviewed 77-province ERA5 annual extract (2016-2025).

Usage:
    PYTHONPATH=src python scripts/build_era5_annual_extract.py

Reads the centroid registry from web/lib/hub/climate-history-data.ts, fetches
the four daily variables once per province, reduces them to yearly statistics
with the same rules as the web aggregator, and writes
web/data/climate-history/era5-annual-2016-2025.json atomically.

Each province is checkpointed under data/local/era5-annual/checkpoint/ after a
successful fetch and validation, so an hourly rate limit (HTTP 429) only pauses
the run: rerunning the same command resumes at the first missing province.
The final bundle is written only when all 77 provinces pass validation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.era5_annual_extract import (  # noqa: E402
    Era5AnnualExtractError,
    assemble_extract,
    build_province_record,
    fetch_era5_daily,
    load_centroids,
)

DEFAULT_CENTROIDS = ROOT / "web" / "lib" / "hub" / "climate-history-data.ts"
DEFAULT_OUTPUT = ROOT / "web" / "data" / "climate-history" / "era5-annual-2016-2025.json"
DEFAULT_CHECKPOINT = ROOT / "data" / "local" / "era5-annual" / "checkpoint"


def write_json_atomic(path: Path, payload: object) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(payload, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(raw)
    os.replace(temporary, path)
    return raw


def read_checkpoint(path: Path, province: dict, first_year: int, last_year: int) -> dict | None:
    try:
        record = json.loads(path.read_text("utf-8"))
        if not isinstance(record, dict):
            return None
        if record.get("province_code") != str(province["code"]):
            return None
        if record.get("requested_latitude") != round(float(province["latitude"]), 4):
            return None
        if record.get("requested_longitude") != round(float(province["longitude"]), 4):
            return None
        years = record.get("years")
        if not isinstance(years, list) or not years:
            return None
        if not isinstance(years[0], dict) or not isinstance(years[-1], dict):
            return None
        if years[0].get("year") != first_year or years[-1].get("year") != last_year:
            return None
        return record
    except (OSError, ValueError, TypeError):
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--centroids", type=Path, default=DEFAULT_CENTROIDS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--start-year", type=int, default=2016)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument(
        "--delay-seconds",
        type=float,
        default=12.0,
        help="minimum seconds between provider requests; a 10-year 4-variable "
        "request weighs ~104 calls against the free tier's 600/minute limit",
    )
    args = parser.parse_args(argv)
    if args.delay_seconds < 11.0:
        parser.error("--delay-seconds must be >= 11.0 to stay under 600 weighted calls/minute")

    provinces = load_centroids(args.centroids)
    total = len(provinces)
    records: dict[str, dict] = {}
    replayed = 0
    fetched_count = 0
    last_request_finished = 0.0

    print(
        f"{total} province centroids, {args.start_year}-{args.end_year}, "
        f"variables: temperature_2m_mean/max/min, precipitation_sum",
        file=sys.stderr,
    )

    for index, province in enumerate(sorted(provinces, key=lambda row: str(row["code"])), start=1):
        code = str(province["code"])
        label = f"[{index}/{total}] {code} {province.get('name_en', '')}".strip()
        saved = read_checkpoint(
            args.checkpoint / f"{code}.json", province, args.start_year, args.end_year
        )
        if saved is not None:
            records[code] = saved
            replayed += 1
            print(f"{label}: checkpoint", file=sys.stderr)
            continue

        pause = args.delay_seconds - (time.monotonic() - last_request_finished)
        if last_request_finished and pause > 0:
            time.sleep(pause)
        started = time.monotonic()
        try:
            fetched = fetch_era5_daily(
                province["latitude"],
                province["longitude"],
                f"{args.start_year}-01-01",
                f"{args.end_year}-12-31",
                # 77x10-year requests exceed the free tier's 5,000 weighted calls/hour,
                # so keep retrying across the hourly window instead of aborting.
                max_retries=70,
            )
            record = build_province_record(
                province, fetched, years=(args.start_year, args.end_year)
            )
        except Era5AnnualExtractError as exc:
            print(f"{label}: FAILED after {fetched_count} fetched: {exc}", file=sys.stderr)
            print(
                f"Progress kept: {len(records)} of {total} provinces in {args.checkpoint}. "
                "Rerun the same command to resume.",
                file=sys.stderr,
            )
            return 1
        finally:
            last_request_finished = time.monotonic()

        write_json_atomic(args.checkpoint / f"{code}.json", record)
        records[code] = record
        fetched_count += 1
        print(
            f"{label}: grid {record['provider_grid_latitude']},"
            f"{record['provider_grid_longitude']} ({record['daily_rows']} days, "
            f"{time.monotonic() - started:.1f}s)",
            file=sys.stderr,
        )

    if len(records) != total:
        print(f"Only {len(records)} of {total} province records; refusing to write", file=sys.stderr)
        return 1

    envelope = assemble_extract(records, years=(args.start_year, args.end_year))
    raw = write_json_atomic(args.output, envelope)
    year_rows = sum(len(record["years"]) for record in envelope["provinces"].values())
    print(
        f"Wrote {args.output.relative_to(ROOT)}: {len(envelope['provinces'])} provinces, "
        f"{year_rows} province-years, {len(raw)} bytes, "
        f"sha256 {hashlib.sha256(raw).hexdigest()} "
        f"(fetched {fetched_count}, replayed {replayed})",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
