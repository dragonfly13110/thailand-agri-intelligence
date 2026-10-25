"""CLI runner to capture and backfill RID medium-reservoir daily reports.

Usage:
    python scripts/backfill_rid_reservoirs.py --start-date 2026-10-09 --end-date 2026-10-22
    python scripts/backfill_rid_reservoirs.py --today
    python scripts/backfill_rid_reservoirs.py --date 2026-10-24
"""

import argparse
from datetime import date, datetime
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.reservoirs import backfill_reservoirs, capture_reservoirs  # noqa: E402


def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--today", action="store_true", help="Capture today's latest daily report.")
    group.add_argument("--date", help="Capture a single specific historical day (YYYY-MM-DD).")
    group.add_argument("--start-date", help="Start of backfill date range (YYYY-MM-DD). Requires --end-date.")

    p.add_argument("--end-date", help="End of backfill date range (YYYY-MM-DD). Required if --start-date is used.")
    p.add_argument("--out-dir", default=str(ROOT / "data/local/raw"), help="Output directory for snapshots (default: data/local/raw).")
    p.add_argument("--refresh", action="store_true", help="Re-fetch and overwrite existing cached daily snapshots.")
    p.add_argument("--max-days", type=int, default=31, help="Safety limit for date range backfill (default: 31 days).")
    p.add_argument("--json", action="store_true", help="Output summary in JSON format.")
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    out_dir = Path(args.out_dir)

    if args.start_date:
        if not args.end_date:
            print("Error: --end-date is required when --start-date is given", file=sys.stderr)
            return 2
        results = backfill_reservoirs(
            args.start_date,
            args.end_date,
            out_dir,
            refresh=args.refresh,
            max_days=args.max_days,
        )
        if args.json:
            print(json.dumps(results, ensure_ascii=False, indent=2))
        else:
            print("Backfilled %d days (%s to %s) into %s:" % (len(results), args.start_date, args.end_date, out_dir))
            for res in results:
                print("  [%s] %s: %d reservoirs, %d observations (%s)" % (
                    res.get("action", "ok"),
                    res.get("report_date"),
                    res.get("reservoir_count", 0),
                    res.get("observation_count", 0),
                    res.get("artifact", "-"),
                ))
        return 0

    target_date = args.date if args.date else None
    result = capture_reservoirs(out_dir, target_date, refresh=args.refresh)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("Captured RID report for %s:" % result.get("report_date"))
        print("  action: %s" % result.get("action"))
        print("  reservoirs: %d" % result.get("reservoir_count", 0))
        print("  observations: %d" % result.get("observation_count", 0))
        print("  path: %s" % result.get("path"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
