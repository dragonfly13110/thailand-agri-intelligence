"""Verify the RID medium-reservoir backfill: integrity, percent calibration and licence status.

Reads only local checkpoints under <out-dir>/rid and prints aggregate counts plus a short
mismatch list (reservoir id, date, percentage-point difference). No reservoir observation
values are printed or written, so the output is safe to keep.

Usage:
    python scripts/check_rid_calibration.py --start-date 2026-10-10 --end-date 2026-10-24
"""

import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.ingestion import snapshot_complete  # noqa: E402
from tadih.reservoirs import normalize_reservoirs  # noqa: E402


def parser():
    result = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("--start-date", required=True, help="First backfill day (YYYY-MM-DD).")
    result.add_argument("--end-date", required=True, help="Last backfill day inclusive (YYYY-MM-DD).")
    result.add_argument("--out-dir", default=str(ROOT / "data/local/raw"), help="Snapshot root (default: data/local/raw).")
    return result


def check_day(out_dir, day):
    """One checkpoint: manifest checksum, adapter signature re-check, calibration counts."""
    partition = "medium-reservoirs-" + day
    directory = Path(out_dir) / "rid" / partition
    result = {"report_date": day, "partition": partition}
    if not snapshot_complete("rid", out_dir, partition):
        result["status"] = "missing_or_checksum_failed"
        return result
    record = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    envelope = json.loads((directory / record["artifact"]).read_text(encoding="utf-8"))
    # normalize_reservoirs re-verifies schema, the date label and the content signature.
    normalized = normalize_reservoirs(envelope)
    if normalized["report_date"] != day:
        raise ValueError("checkpoint " + partition + " holds another report date")
    if envelope["license_status"] != "pending":
        raise ValueError("checkpoint " + partition + " is not licence-pending")
    for row in normalized["observations"] + normalized["pending_unit_observations"]:
        if row["license_status"] != "pending":
            raise ValueError("observation escaped the pending licence status")
    counts = normalized["percent_calibration_counts"]
    mismatches = [{"reservoir_id": row["reservoir_id"], "report_date": row["report_date"],
                   "difference_percentage_points": round(row["difference_percentage_points"], 4)}
                  for row in normalized["percent_calibration"] if row["status"] == "mismatch"]
    result.update({
        "status": "ok",
        "checksum": record["checksum"],
        "content_signature": envelope["content_signature"],
        "retrieved_at": envelope["retrieved_at"],
        "reservoir_count": normalized["reservoir_count"],
        "observation_count": normalized["observation_count"],
        "pending_unit_observation_count": normalized["pending_unit_observation_count"],
        "percent_calibration": counts,
        "mismatches": mismatches,
    })
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    start, end = date.fromisoformat(args.start_date), date.fromisoformat(args.end_date)
    if end < start or (end - start).days >= 366:
        raise SystemExit("date range must be ordered and under a year")
    days = [(start + timedelta(days=offset)).isoformat() for offset in range((end - start).days + 1)]
    results = [check_day(args.out_dir, day) for day in days]

    ok = [row for row in results if row["status"] == "ok"]
    signatures = [row["content_signature"] for row in ok]
    if len(signatures) != len(set(signatures)):
        raise SystemExit("two days share one content signature; inspect the provider substitution trap")
    calibration = {key: sum(row["percent_calibration"][key] for row in ok)
                   for key in ("consistent", "mismatch", "uncheckable")}
    report = {
        "source_id": "rid",
        "check": "rid_backfill_integrity_and_calibration",
        "checked_range": {"start": days[0], "end": days[-1], "days_requested": len(days)},
        "days_ok": len(ok),
        "days_failed": [row["report_date"] for row in results if row["status"] != "ok"],
        "content_signatures_unique": True,
        "reservoirs_per_day": sorted({row["reservoir_count"] for row in ok}),
        "observations_total": sum(row["observation_count"] for row in ok),
        "pending_unit_observations_total": sum(row["pending_unit_observation_count"] for row in ok),
        "percent_calibration_total": calibration,
        "percent_calibration_rate": {key: round(calibration[key] / sum(calibration.values()), 6) for key in calibration},
        "percent_tolerance_points": 0.05,
        "license_status": "pending",
        "approved_public_rows": 0,
        "mismatch_details": [detail for row in ok for detail in row["mismatches"]],
        "retrieved_window_utc": {"first": min((row["retrieved_at"] for row in ok), default=None),
                                 "last": max((row["retrieved_at"] for row in ok), default=None)},
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if len(ok) == len(days) else 1


if __name__ == "__main__":
    raise SystemExit(main())
