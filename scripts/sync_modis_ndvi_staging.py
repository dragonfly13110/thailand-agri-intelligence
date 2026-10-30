#!/usr/bin/env python3
"""Lane L6 staging sync: MODIS NDVI point batches prepared locally, NEVER written to D1.

This is the hard rule for this lane: the Cloudflare D1 warehouse gets numeric
rows only through ``tadih.ingest_modis_d1 --write`` after governance clears the
registry row. This script deliberately does not import any D1 client — it runs
the adapter in dry-run mode, prints the summary, and optionally stores the
prepared batch as a local staging artifact under ``data/local``.

Usage:
    PYTHONPATH=src .venv/Scripts/python.exe scripts/sync_modis_ndvi_staging.py
    PYTHONPATH=src .venv/Scripts/python.exe scripts/sync_modis_ndvi_staging.py --live
    PYTHONPATH=src .venv/Scripts/python.exe scripts/sync_modis_ndvi_staging.py --out data/local/modis_ndvi/staging.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from tadih.ingest_modis_d1 import DEFAULT_ANCHORS, ModisAdapterError, run_adapter  # noqa: E402

DEFAULT_SNAPSHOTS = ROOT / "data" / "local" / "satellite"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="sync-modis-ndvi-staging",
        description="Prepare a MODIS NDVI point batch locally (dry-run only; never touches D1).",
    )
    parser.add_argument("--live", action="store_true", help="query Planetary Computer instead of local snapshots")
    parser.add_argument("--item", help="explicit MOD13A1 item id for the live query")
    parser.add_argument("--out", help="also write the prepared batch JSON to this local path")
    args = parser.parse_args(argv)

    snapshots = None if args.live or not DEFAULT_SNAPSHOTS.exists() else str(DEFAULT_SNAPSHOTS)
    try:
        summary = run_adapter(
            dry_run=True,
            write=False,
            item=args.item,
            snapshots=snapshots,
            anchors=DEFAULT_ANCHORS,
        )
    except (ModisAdapterError, ValueError, OSError) as exc:
        print(json.dumps({
            "status": "failed",
            "errorCode": getattr(exc, "code", "STAGING_FAILED"),
            "message": str(exc)[:300],
        }, ensure_ascii=False), file=sys.stderr)
        return 1

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    slim = {key: value for key, value in summary.items() if key != "rows"}
    print(json.dumps(slim, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
