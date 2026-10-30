"""MODIS MOD13A1 NDVI point samples -> Cloudflare D1 observations (Round 2, Lane L6).

This module is the numeric adapter for the registry row
``planetary_computer_modis13a1_point`` (resource ``modis-13A1-061``). It turns
Microsoft Planetary Computer point queries (NASA LP DAAC / USGS MODIS 16-day
composites, 500 m pixels) into shared-writer batches.

Governance rules enforced here
------------------------------
* The licence gate is checked before anything else. Today the registry row
  still carries an unresolved review item, so ``assert_resource_approved``
  refuses and ``--write`` fails closed with ``RESOURCE_NOT_APPROVED``; a
  ``--dry-run`` still prepares and validates the full batch and reports the
  exact blocking item instead of hiding it.
* ``--dry-run`` is the default and never touches D1. ``--write`` only publishes
  through ``publish_observations`` after the gate passes.
* Point grain is preserved: one row per (grid point x composite x measure);
  cloud/snow/filled NDVI stays ``null`` and is never rewritten to 0, and the
  unitless ``index`` unit is published verbatim (NDVI is not a percentage).
* No interpolation across missing composites: only composites that were
  actually fetched are present in a batch.

The web read path (``web/lib/hub/crop-evidence-ndvi.ts``) serves exactly these
rows and adds no second source.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping, Sequence

from .modis_ndvi import (
    ADAPTER_VERSION,
    COLLECTION,
    DATASET_ID,
    RESOURCE_KEY,
    dimensions_for_factory,
    prepare_batch,
    publication_gate,
)
from .observations import ObservationWriteError, load_approved_resource, publish_observations, register_resource
from .satellite import fetch_modis_point

ROOT = Path(__file__).resolve().parents[2]

SOURCE_ID = "modis"

#: Thailand anchor points (same register as ``tadih.ingestion.THAI_SAMPLE_POINTS``)
#: with the province label used only for the human-readable location name.
DEFAULT_ANCHORS: tuple[tuple[str, float, float], ...] = (
    ("นครปฐม", 13.8, 100.25),
    ("เชียงใหม่", 18.75, 99.0),
    ("ขอนแก่น", 16.44, 102.83),
    ("อุบลราชธานี", 15.24, 104.85),
    ("สุราษฎร์ธานี", 9.14, 99.33),
)


class ModisAdapterError(RuntimeError):
    """A stable-code failure that is safe to print (never echoes credentials)."""

    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or code)
        self.code = code


def load_snapshot_envelopes(snapshot_dir: str | Path) -> list[dict[str, Any]]:
    """Read committed-free local snapshots (``data/local/satellite/*/payload.json``)."""
    base = Path(snapshot_dir)
    envelopes: list[dict[str, Any]] = []
    for folder in sorted(p for p in base.glob("point-*") if p.is_dir()):
        payload_path = folder / "payload.json"
        if not payload_path.exists():
            continue
        envelope = json.loads(payload_path.read_text(encoding="utf-8"))
        if not isinstance(envelope, Mapping) or "payload" not in envelope:
            raise ModisAdapterError("SNAPSHOT_INVALID", f"{payload_path} is not a point envelope")
        envelopes.append(dict(envelope))
    if not envelopes:
        raise ModisAdapterError("SNAPSHOT_NOT_FOUND", f"no point-*/payload.json under {base}")
    return envelopes


def fetch_live_envelopes(
    anchors: Sequence[tuple[str, float, float]] = DEFAULT_ANCHORS,
    *,
    item_id: str | None = None,
    timeout: float = 15.0,
    fetcher: Callable[..., dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """One bounded point query per anchor; failures are skipped, never faked.

    Without an explicit item id the Planetary Computer STAC lookup inside
    ``fetch_modis_point`` resolves each anchor to its own latest composite —
    guessing an item id from a date would pick the wrong tile.
    """
    call = fetcher or fetch_modis_point
    candidates = [item_id] if item_id else [None]
    envelopes: list[dict[str, Any]] = []
    for label, lat, lon in anchors:
        for wanted in candidates:
            try:
                envelope = call(latitude=lat, longitude=lon, item_id=wanted, timeout=timeout)
            except (RuntimeError, ValueError, OSError) as exc:
                # The anchor contributes no row; a missing point is absent, never 0.
                print(f"[warn] anchor {label}: {exc}", file=sys.stderr)
                continue
            envelope["anchor_label"] = label
            envelopes.append(envelope)
            break
    if not envelopes:
        raise ModisAdapterError("NO_POINTS_FETCHED", "every anchor failed its point query")
    return envelopes


def run_adapter(
    *,
    client: Any = None,
    dry_run: bool = False,
    write: bool = False,
    date: str | None = None,
    item: str | None = None,
    snapshots: str | Path | None = None,
    anchors: Sequence[tuple[str, float, float]] = DEFAULT_ANCHORS,
    timeout: float = 15.0,
    registry_path: str | Path | None = None,
    fetcher: Callable[..., dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Prepare (and optionally publish) one MODIS NDVI point batch.

    ``write=False`` (the default) never touches D1. ``--write`` additionally
    requires the registry gate to pass; while the row keeps its unresolved
    review item the publish is refused with ``RESOURCE_NOT_APPROVED`` — the
    honest outcome, not a bug to route around.
    """
    if dry_run and write:
        raise ModisAdapterError("ADAPTER_FLAGS_CONFLICT", "--dry-run and --write cannot be combined")

    gate = publication_gate(registry_path=registry_path)
    resource = gate.get("resource")
    if write and not gate["passed"]:
        # Re-read through the approved loader so the error code/message match
        # exactly what the shared writer would enforce.
        resource = load_approved_resource(RESOURCE_KEY, registry_path=registry_path)

    license_status = (resource or {}).get("license_status", "approved_public")
    if snapshots is not None:
        envelopes = load_snapshot_envelopes(snapshots)
        source_mode = "snapshot"
    else:
        envelopes = fetch_live_envelopes(anchors, item_id=item, timeout=timeout, fetcher=fetcher)
        source_mode = "live"

    batch = prepare_batch(envelopes, license_status=license_status)
    rows = batch["rows"]
    if not rows:
        raise ModisAdapterError("NO_ROWS", "the batch produced no observation rows")

    if not write:
        return {
            "mode": "dry_run",
            "status": "dry_run",
            "adapter_version": ADAPTER_VERSION,
            "source_id": SOURCE_ID,
            "resource_key": RESOURCE_KEY,
            "resource_id": (resource or {}).get("resource_id"),
            "collection": COLLECTION,
            "dataset_id": DATASET_ID,
            "source_mode": source_mode,
            "publication_gate": {
                "passed": gate["passed"],
                "errorCode": gate["errorCode"],
                "message": gate["message"],
                "unresolved": gate.get("unresolved") or [],
            },
            "retrieved_at": batch["retrieved_at"],
            "records_read": len(rows),
            "records_written": 0,
            "coverage": batch["coverage"],
            "points": batch["points"],
            "rows": [
                {
                    "observation_id": row["observation_id"],
                    "location_id": row["location_id"],
                    "measure": row["measure"],
                    "value": row["value"],
                    "unit": row["unit"],
                    "quality_flag": row["quality_flag"],
                }
                for row in rows
            ],
        }

    if client is None:
        raise ModisAdapterError("D1_CLIENT_MISSING", "a D1 client is required for --write")

    register_resource(
        client,
        resource=resource,
        source_name="NASA LP DAAC / USGS MODIS (Microsoft Planetary Computer)",
        base_url="https://planetarycomputer.microsoft.com",
        connector_kind="api",
        dataset_id=DATASET_ID,
        dataset_title="MODIS MOD13A1 v061 16-day NDVI point samples (Thailand grid points)",
        dataset_description=(
            "ค่า NDVI จุดกริด 500 ม. จาก composite 16 วัน (MOD13A1 v061) ผ่าน Planetary Computer "
            "Data API — เป็นจุดตัวอย่าง ไม่ใช่ข้อมูลครอบคลุมทั้งพื้นที่"
        ),
        dataset_category="vegetation",
        resource_format="JSON",
        grain="grid point x 16-day MOD13A1 composite",
        attribution_url=(resource or {}).get("attribution_url"),
        metadata={
            "spatialSupport": "grid_point",
            "resolutionMeters": 500,
            "compositeDays": 16,
            "scope": "point samples only — never field-wide coverage",
            "registryResourceKey": RESOURCE_KEY,
        },
    )

    result = publish_observations(
        client,
        resource=resource,
        rows=rows,
        adapter_version=ADAPTER_VERSION,
        coverage=batch["coverage"],
        completeness="partial",
        unit=None,
        retrieved_at=batch["retrieved_at"],
        product="MOD13A1 v061 NDVI 500m point sample",
        period_grain="point",
        dimensions_for=dimensions_for_factory(batch),
        locations=batch["locations"],
    )
    return {"mode": "write", "source_mode": source_mode, **result}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih-ingest-modis",
        description="Publish MODIS MOD13A1 NDVI point samples to Cloudflare D1 (dry-run by default).",
    )
    result.add_argument("--dry-run", action="store_true", help="prepare and validate the batch without writing (default)")
    result.add_argument("--write", action="store_true", help="publish to the configured Cloudflare D1 (requires the registry gate to pass)")
    result.add_argument("--date", help="reserved batch label YYYY-MM-DD (composites are addressed by item id)")
    result.add_argument("--item", help="explicit MOD13A1 item id, e.g. MOD13A1.A2026273.h27v07.061.2026295123456")
    result.add_argument("--snapshots", help="directory of local point snapshots (data/local/satellite) instead of live fetches")
    result.add_argument("--timeout", type=float, default=15.0, help="upstream timeout in seconds")
    result.add_argument("--registry", help="override path to config/resource_licenses.json (read-only)")
    return result


def main(argv: list[str] | None = None, *, client: Any = None) -> int:
    args = parser().parse_args(list(argv) if argv is not None else [])
    if args.dry_run and args.write:
        print(json.dumps({
            "status": "failed", "errorCode": "ADAPTER_FLAGS_CONFLICT",
            "message": "--dry-run and --write cannot be combined",
        }, ensure_ascii=False), file=sys.stderr)
        return 2
    write = bool(args.write)
    if write and client is None:
        from .hub_catalog_sync import connect_d1_client
        try:
            client = connect_d1_client()
        except Exception as exc:
            code = getattr(exc, "code", None) or "D1_NOT_CONFIGURED"
            print(json.dumps({
                "status": "failed", "errorCode": code, "message": str(exc)[:200],
            }, ensure_ascii=False), file=sys.stderr)
            return 2
    try:
        result = run_adapter(
            client=client,
            write=write,
            date=args.date,
            item=args.item,
            snapshots=args.snapshots,
            timeout=args.timeout,
            registry_path=args.registry,
        )
    except ObservationWriteError as exc:
        print(json.dumps({
            "status": "failed", "errorCode": exc.code, "message": str(exc)[:300],
        }, ensure_ascii=False), file=sys.stderr)
        return 1
    except ModisAdapterError as exc:
        print(json.dumps({
            "status": "failed", "errorCode": exc.code, "message": str(exc)[:300],
        }, ensure_ascii=False), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({
            "status": "failed", "errorCode": "ADAPTER_FAILED", "message": str(exc)[:300],
        }, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
