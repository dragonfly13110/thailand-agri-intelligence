"""Validate or sync the reviewed CHIRPS raster observations to D1."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from tadih.hub_catalog_sync import CatalogSyncError, connect_d1_client  # noqa: E402
from tadih.hub_numeric_sync import (  # noqa: E402
    NumericSyncError,
    SAMPLE_CELL_COUNT,
    sync_numeric_resource_d1,
    validate_numeric_batch,
)


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--input", type=Path, help="JSON envelope from read_chirps_observations; defaults to a bounded live sample")
    result.add_argument("--registry", type=Path, help="resource_licenses.json path (defaults to this checkout)")
    result.add_argument("--write", action="store_true", help="write the validated batch to configured Cloudflare D1")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    if args.write and args.input:
        print(json.dumps({"status": "failed", "errorCode": "INPUT_WRITE_UNSUPPORTED"}, ensure_ascii=False), file=sys.stderr)
        return 1
    try:
        if args.write:
            from tadih.env import load_dotenv

            load_dotenv(override=True)
            client = connect_d1_client()
            result = sync_numeric_resource_d1(client, registry_path=args.registry)
        else:
            batch = _load_batch(args.input)
            _, revision, retrieved_at, rows = validate_numeric_batch(batch, registry_path=args.registry)
            result = {
                "status": "dry_run",
                "resource_id": batch["resource_url"],
                "revision_id": revision,
                "retrieved_at": retrieved_at.isoformat().replace("+00:00", "Z"),
                "records_read": len(rows),
                "records_written": 0,
                "completeness": "partial",
                "coverage": {"mode": "sample_only", "sample_count": len(rows), "full_raster_ingested": False},
            }
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (CatalogSyncError, NumericSyncError, OSError, ValueError) as exc:
        code = getattr(exc, "code", None) or ("INPUT_INVALID" if isinstance(exc, (OSError, ValueError)) else "SYNC_FAILED")
        print(json.dumps({"status": "failed", "errorCode": code}, ensure_ascii=False), file=sys.stderr)
        return 1


def _load_batch(path):
    if path:
        return json.loads(path.read_text(encoding="utf-8"))
    from tadih.chirps_raster import read_chirps_observations

    batch = read_chirps_observations()
    # The current reader is hard-coded to three 1x1 verification windows.
    # Add that known limit only when the reader has no completeness contract yet.
    if isinstance(batch, dict) and "completeness" not in batch and "coverage" not in batch:
        rows = batch.get("rows")
        if not isinstance(rows, list) or len(rows) != SAMPLE_CELL_COUNT:
            raise NumericSyncError("CHIRPS_SAMPLE_COUNT_MISMATCH")
        batch["completeness"] = "partial"
        batch["coverage"] = {
            "mode": "sample_only",
            "sample_count": SAMPLE_CELL_COUNT,
            "full_raster_ingested": False,
        }
    return batch


if __name__ == "__main__":
    raise SystemExit(main())
