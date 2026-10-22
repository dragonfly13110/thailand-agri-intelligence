"""One bounded monthly-price cycle using existing captures and publication gates."""

from datetime import datetime, timezone
import json
from pathlib import Path
import uuid

from .commodities import discover_commodities
from .ingestion import save_snapshot, snapshot_complete, _write_json
from .price_backfill import backfill_monthly_prices
from .prices import load_nabc_monthly_snapshot, normalize_nabc_monthly
from .publish import build_exports, verify_exports
from .warehouse import connect, ingest_rows


def run_price_pipeline(db_path, year_th, *, raw_dir="data/local/raw", run_dir="data/local/runs", refresh=False):
    if type(year_th) is not int or not 2400 <= year_th <= 2800 or type(refresh) is not bool:
        raise ValueError("explicit Buddhist year and boolean refresh required")
    run = Path(run_dir) / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    run.mkdir(parents=True)
    report = {"status": "running", "year_th": year_th, "refresh": refresh, "steps": [],
              "db_path": str(Path(db_path).resolve()), "transaction_scope": "per_product; earlier successful products persist on failure",
              "report_path": str((run / "report.json").resolve())}

    def record(step, **result):
        report["steps"].append({"step": step, **result})
        _write_json(run / "report.json", report)

    try:
        key = f"commodities-nabc_monthly-{year_th}-page1"
        inventory_path = Path(raw_dir) / "oae" / key
        if refresh or not snapshot_complete("oae", raw_dir, key):
            envelope = discover_commodities("nabc_monthly", year_th=year_th, max_pages=10)
            if envelope["status"] != "ok" or envelope["pagination"]["complete"] is not True:
                save_snapshot(envelope, "oae", raw_dir, key)
                raise ValueError("monthly inventory failed or pagination incomplete")
            save_snapshot(envelope, "oae", raw_dir, key)
        inventory = load_nabc_monthly_snapshot(inventory_path)
        if inventory.get("year_th") != year_th or inventory.get("pagination", {}).get("complete") is not True:
            raise ValueError("monthly inventory year or pagination is unverified")
        manifest = json.loads((inventory_path / "manifest.json").read_text(encoding="utf-8"))
        record("inventory", path=str((inventory_path / manifest["artifact"]).resolve()), checksum=manifest["checksum"])
        captures = backfill_monthly_prices(inventory_path, raw_dir, refresh=refresh, max_pages=10)
        if not captures or any(c["complete"] is not True for c in captures):
            raise ValueError("one or more product captures incomplete; export withheld")
        record("capture", products=len(captures), fetched=sum(c["action"] == "fetched" for c in captures),
               artifacts=[{"path": c["path"], "checksum": c["checksum"]} for c in captures])
        with connect(db_path) as db:
            before = db.execute("SELECT count(*) FROM observations").fetchone()[0]
            validated = conflicts = 0
            for capture in captures:
                normalized = normalize_nabc_monthly(load_nabc_monthly_snapshot(Path(capture["path"]).parent))
                rows = normalized.pop("observations") + normalized.pop("blocked_observations")
                validated += ingest_rows(db, rows)
                conflicts += capture["conflicting_observations"]
                record("product_ingested", checksum=capture["checksum"], path=capture["path"], validated_rows=len(rows))
            after = db.execute("SELECT count(*) FROM observations").fetchone()[0]
            record("ingest", validated_rows=validated, added_revisions=after-before, conflicts=conflicts)
            for audience in ("internal", "public"):
                folder = "exports/private" if audience == "internal" else "exports/public"
                path, metadata = build_exports(db, folder, audience=audience)
                verify_exports(path)
                record("export", audience=audience, snapshot=str(path.resolve()),
                       observations=metadata["observation_count"], verified_files=len(metadata["files"]))
        report["status"] = "success"
    except Exception as exc:
        report.update(status="failed", error=str(exc))
        raise
    finally:
        _write_json(run / "report.json", report)
    return report
