"""Publish the RID medium-reservoir daily report to Cloudflare D1.

Lane C (Round 1) of the Real Data programme.  The writer contract is owned by
lane B; see ``docs/assignments/2026-10-26-real-data-initiative.md`` sections
3.1-3.2 and :mod:`tadih.observations`.

What this adapter does
----------------------
1. Fetches the provider's daily medium-reservoir report with the machinery
   that already exists in this repository: :mod:`tadih.reservoirs` supplies the
   schema / content-signature / duplicate-id / date-window guards and the
   ``100 x volume / storage`` calibration rule, and
   ``scripts/sync_rid_reservoirs.py`` supplies the historical-substitution
   prefetch, the ``document`` metadata check and the 461-reservoir
   partial-response guard.  Both are imported, never copied.
2. Fails closed when the provider's own percentage disagrees with that
   calibration rule, and when the reservoir count leaves the expected band.
3. Builds canonical observation rows (one per reservoir and measure) and
   publishes them through the shared fail-closed writer
   (:func:`tadih.observations.publish_observations`) so the licence gate, the
   observation contract, the run lifecycle and the ``active_run_id`` switch
   stay in one place.

Data-quality decisions (AGENTS.md rule 4)
-----------------------------------------
* A reservoir is not a province: ``area_code`` stays NULL and the spatial
  support stays ``"reservoir"``.  The 77 province codes are a code registry,
  not coverage, and are never used here.
* Missing stays missing: a null volume is never re-derived into a percentage
  and never turned into 0.  The row is published with ``value = NULL`` and
  ``quality_flag = "missing"``.
* Units are only published when the source documents them (gate G3).  The
  provider's API documentation page states volume and capacity in
  ``ล้าน ลบ.ม.`` (million cubic metres) - confirmed in the approved license
  registry's rights facts and in :data:`tadih.reservoirs.DOCUMENTED_UNITS` -
  so ``reservoir_volume`` is published with the repository token ``"MCM"`` at
  the provider's own grain (the raw million-m3 number is never silently
  multiplied into m3, which would misstate the magnitude by 1e6), and the
  calibrated ``reservoir_storage_pct`` is published as ``"percent"``.  Only
  measures without a documented unit (inflow/outflow) would fall to
  ``unit = null`` + ``pending_official_confirmation``; this adapter does not
  publish them.
* ``data_kind`` is ``"official"``: RID is the agency that measures and
  publishes the state of its own reservoirs, and :mod:`tadih.reservoirs` uses
  the same value for exactly these numbers.
* ``revision_id`` is the provider report's content fingerprint
  (``tadih.reservoirs.report_signature``): a SHA-256 over the report values,
  so a revised report is a new revision and never an overwrite.

Time-zone assumption
--------------------
The provider labels a report with the Thai (ICT, UTC+7) calendar day and
publishes no observation time.  ``observed_at`` is therefore the report day
anchored at ``00:00:00Z`` - 07:00 ICT of that same ICT day - so the daily
period label equals the provider's own report date.  ``retrieved_at`` is the
UTC capture time of the payload.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

from .observations import (
    ObservationWriteError,
    load_approved_resource,
    publish_observations,
    register_resource,
)
from .reservoirs import BASE_URL, normalize_reservoirs

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "sync_rid_reservoirs.py"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "local" / "raw"

ADAPTER_NAME = "rid"
ADAPTER_VERSION = "rid-reservoir-d1/1.1"
RESOURCE_KEY = "rid_medium_reservoirs"
SOURCE_ID = "rid"
REPORT_URL = BASE_URL  # https://app.rid.go.th/reservoir/api/reservoir/public
DOCUMENTATION_URL = "https://app.rid.go.th/reservoir/api/document/reservoir"

MEASURE_STORAGE_PCT = "reservoir_storage_pct"
MEASURE_VOLUME = "reservoir_volume"
MEASURES = (MEASURE_STORAGE_PCT, MEASURE_VOLUME)
# Units are documented by the provider itself (API documentation page:
# volume/capacity in ล้าน ลบ.ม. = million cubic metres; confirmed by the
# approved registry's rights facts and tadih.reservoirs.DOCUMENTED_UNITS).
# "MCM" is the repository token for that documented unit; raw values are
# published at the provider grain, never rescaled into m3.
MEASURE_UNITS = {MEASURE_STORAGE_PCT: "percent", MEASURE_VOLUME: "MCM"}

# The percentage is derived by this adapter with the repository's own
# calibration rule (tadih.reservoirs.normalize_reservoirs):
#     expected = 100 * volume / storage
# and the provider's own percent_storage must agree within the same tolerance.
PERCENT_TOLERANCE_PP = 0.05
# The provider publishes its percentages with two decimals; the derived value
# keeps the same precision so the published number matches the source grain.
PERCENT_DECIMALS = 2

SPATIAL_SUPPORT = "reservoir"
LOCATION_KIND = "reservoir"
# RID publishes the state of its own reservoirs; the repository's validated
# pipeline (tadih.reservoirs) labels exactly these values "official", and the
# shared writer treats it as a publishable non-forecast kind.
DATA_KIND = "official"

CATALOG: dict[str, Any] = {
    "source_name": "Royal Irrigation Department (RID)",
    "base_url": "https://app.rid.go.th",
    "connector_kind": "api",
    "dataset_id": "rid:reservoir-daily",
    "dataset_title": "RID medium-reservoir daily report",
    "dataset_description": (
        "Daily state of the medium reservoirs listed in the RID public report: "
        "capacity, current volume and the storage percentage."
    ),
    "dataset_category": "water",
    "dataset_owner": "Royal Irrigation Department (RID)",
    "dataset_source_url": REPORT_URL,
    "dataset_metadata_access_status": "approved_public",
    "resource_format": "JSON",
    "resource_url": REPORT_URL,
    "grain": "reservoir x provider report day",
    "attribution_url": DOCUMENTATION_URL,
}

# Evidence note for the published units: the provider documents the volume
# unit on its own API page; the percentage unit follows from the calibration
# rule the provider's payload satisfies (+/-0.05 pp).
UNIT_EVIDENCE = {
    MEASURE_VOLUME: (
        "provider API documentation (https://app.rid.go.th/reservoir/api/document/reservoir) "
        "states volume in ล้าน ลบ.ม. (million cubic metres, repo token MCM); values kept at "
        "provider grain, not rescaled to m3"
    ),
    MEASURE_STORAGE_PCT: (
        "percent = 100 x volume / storage, calibrated against the provider's own "
        "percent_storage within +/-0.05 percentage points"
    ),
}

_SCRIPT_MODULE: Any = None


# ---------------------------------------------------------------------------
# Reuse of the existing daily-report machinery
# ---------------------------------------------------------------------------

def _script_module() -> Any:
    """Import ``scripts/sync_rid_reservoirs.py`` so its guards are reused."""
    global _SCRIPT_MODULE
    if _SCRIPT_MODULE is None:
        spec = importlib.util.spec_from_file_location("tadih_sync_rid_reservoirs_cli", SCRIPT_PATH)
        if spec is None or spec.loader is None:  # pragma: no cover - defensive
            raise RuntimeError(f"cannot load the RID daily report script at {SCRIPT_PATH}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _SCRIPT_MODULE = module
    return _SCRIPT_MODULE


def fetch_report(report_date: str | None = None, *, meta: dict | None = None,
                 fetcher: Any = None) -> tuple[dict, dict, dict]:
    """Fetch and validate one provider report.

    Returns ``(envelope, normalized, meta)``.  The envelope comes from
    :func:`tadih.reservoirs.fetch_reservoirs` (through the existing daily
    script, which also prefetches the current report so a silently substituted
    history is refused); ``normalized`` comes from
    :func:`tadih.reservoirs.normalize_reservoirs` (schema, content signature,
    duplicate ids, date window and the percent calibration table).

    ``fetcher`` replaces the network call (offline tests); the default is the
    real public endpoint.
    """
    script = _script_module()
    requests = meta if meta is not None else {"requests": []}
    if fetcher is None:
        envelope, _reference = script.fetch_report(report_date, meta=requests)
    else:
        original = script.fetch_json
        script.fetch_json = fetcher
        try:
            envelope, _reference = script.fetch_report(report_date, meta=requests)
        finally:
            script.fetch_json = original
    # Fail closed: the answer must carry the documented report metadata and the
    # full provider registry (a partial answer would look like a valid report).
    script.require_reservoir_document(envelope["payload"])
    normalized = normalize_reservoirs(envelope)
    script.check_expected_reservoir_count(normalized["reservoir_count"])
    return envelope, normalized, requests


def assert_percent_calibration(normalized: Mapping[str, Any]) -> dict[str, int]:
    """Fail closed when the provider percentage disagrees with the calibration.

    The repository rule is ``percent_storage == 100 x volume / storage`` within
    +/-0.05 percentage points (``tadih.reservoirs.normalize_reservoirs``).  A
    mismatch means the provider's numbers and its own percentage no longer
    agree, so nothing is published for that report.
    """
    counts = dict(normalized.get("percent_calibration_counts") or {})
    mismatches = [row for row in normalized.get("percent_calibration") or []
                  if row.get("status") == "mismatch"]
    if mismatches:
        sample = mismatches[0]
        raise ValueError(
            f"RID percent calibration mismatch on {len(mismatches)} reservoir(s) "
            f"(tolerance {PERCENT_TOLERANCE_PP} pp); first: reservoir {sample.get('reservoir_id')} "
            f"reported {sample.get('reported_percent')} vs computed "
            f"{sample.get('computed_volume_over_capacity_percent')} "
            f"(difference {sample.get('difference_percentage_points')} pp); refusing to publish"
        )
    return counts


# ---------------------------------------------------------------------------
# Canonical rows
# ---------------------------------------------------------------------------

def _iso_utc(value: str) -> str:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _digest(parts: Sequence[Any]) -> str:
    blob = json.dumps(list(parts), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def observation_id_for(reservoir_id: str, report_date: str, measure: str) -> str:
    """Stable row key per reservoir, report day and measure."""
    return "rid-" + _digest([reservoir_id, report_date, measure])


def build_observation_rows(envelope: Mapping[str, Any], normalized: Mapping[str, Any], *,
                           license_status: str) -> dict[str, Any]:
    """Turn one validated provider report into canonical observation rows.

    The returned mapping holds ``rows`` (canonical observation dicts),
    ``locations`` (the D1 ``locations`` overrides), ``dimensions`` (per row) and
    a small ``stats`` block for the CLI summary.  No network and no D1 access
    happens here, so the whole row contract is testable offline.
    """
    report_date = str(envelope["report_date"])
    observed_at = f"{report_date}T00:00:00Z"
    retrieved_at = _iso_utc(str(envelope["retrieved_at"]))
    revision_id = str(envelope["content_signature"])
    request_url = str(envelope.get("request_url") or REPORT_URL)

    inventory = {str(item["location_id"]): item for item in normalized.get("reservoirs") or []}
    values_by_location: dict[str, dict[str, Any]] = {}
    for observation in normalized.get("observations") or []:
        bucket = values_by_location.setdefault(str(observation["location_id"]), {})
        bucket[str(observation["measure"])] = observation["value"]
    calibration = {str(item["reservoir_id"]): item
                   for item in normalized.get("percent_calibration") or []}

    rows: list[dict[str, Any]] = []
    locations: dict[str, dict[str, Any]] = {}
    dimensions: dict[tuple[str, str], dict[str, Any]] = {}
    stats = {"reservoirs": 0, "rows": 0, "missingValues": 0, "rowsByMeasure": {measure: 0 for measure in MEASURES}}

    for location_key, item in inventory.items():
        reservoir_id = str(item["reservoir_id"])
        values = values_by_location.get(location_key, {})
        storage = values.get("reservoir_storage_capacity")
        volume = values.get("reservoir_volume")
        check = calibration.get(reservoir_id, {})
        computed = check.get("computed_volume_over_capacity_percent")
        derived = None if computed is None else round(float(computed), PERCENT_DECIMALS)

        base_dimensions = {
            "spatialSupport": SPATIAL_SUPPORT,
            "dataKind": DATA_KIND,
            "reportDate": report_date,
            "requestUrl": request_url,
            "providerReservoirId": reservoir_id,
            "region": item.get("region"),
            "areaCode": None,
        }
        locations[reservoir_id] = {
            "kind": LOCATION_KIND,
            "nativeCode": reservoir_id,
            "name": item.get("name"),
        }

        pct_dimensions = dict(base_dimensions)
        pct_dimensions.update({
            "measure": MEASURE_STORAGE_PCT,
            "unit": MEASURE_UNITS[MEASURE_STORAGE_PCT],
            "unitEvidence": UNIT_EVIDENCE[MEASURE_STORAGE_PCT],
            "method": "100*volume/storage",
            "volumeField": "volume",
            "storageField": "storage",
            "calibrationTolerancePp": PERCENT_TOLERANCE_PP,
            "calibrationStatus": check.get("status"),
            "calibrationDifferencePp": check.get("difference_percentage_points"),
            "rounding": f"{PERCENT_DECIMALS} decimals (provider precision)",
        })
        if check.get("status") != "uncheckable":
            # The provider's own percentage is only echoed when it is checkable;
            # a placeholder 0 for a missing volume is never stored.
            pct_dimensions["reportedPercentStorage"] = check.get("reported_percent")

        rows.append(_row(
            reservoir_id=reservoir_id, measure=MEASURE_STORAGE_PCT, value=derived,
            unit=MEASURE_UNITS[MEASURE_STORAGE_PCT],
            observed_at=observed_at, retrieved_at=retrieved_at, revision_id=revision_id,
            license_status=license_status, source_url=REPORT_URL, report_date=report_date,
        ))
        dimensions[(reservoir_id, MEASURE_STORAGE_PCT)] = pct_dimensions

        volume_dimensions = dict(base_dimensions)
        volume_dimensions.update({
            "measure": MEASURE_VOLUME,
            "unit": MEASURE_UNITS[MEASURE_VOLUME],
            "unitEvidence": UNIT_EVIDENCE[MEASURE_VOLUME],
            "method": "provider_field",
            "volumeField": "volume",
        })
        rows.append(_row(
            reservoir_id=reservoir_id, measure=MEASURE_VOLUME, value=volume,
            unit=MEASURE_UNITS[MEASURE_VOLUME],
            observed_at=observed_at, retrieved_at=retrieved_at, revision_id=revision_id,
            license_status=license_status, source_url=REPORT_URL, report_date=report_date,
        ))
        dimensions[(reservoir_id, MEASURE_VOLUME)] = volume_dimensions

        stats["reservoirs"] += 1
        stats["rows"] += 2
        stats["rowsByMeasure"][MEASURE_STORAGE_PCT] += 1
        stats["rowsByMeasure"][MEASURE_VOLUME] += 1
        stats["missingValues"] += (1 if derived is None else 0) + (1 if volume is None else 0)

    return {
        "rows": rows,
        "locations": locations,
        "dimensions": dimensions,
        "stats": stats,
        "observed_at": observed_at,
        "retrieved_at": retrieved_at,
        "report_date": report_date,
        "revision_id": revision_id,
    }


def _row(*, reservoir_id: str, measure: str, value: Any, unit: str, observed_at: str,
         retrieved_at: str, revision_id: str, license_status: str, source_url: str,
         report_date: str) -> dict[str, Any]:
    """One canonical observation row (exactly the contract fields, nothing else)."""
    return {
        "observation_id": observation_id_for(reservoir_id, report_date, measure),
        "source_id": SOURCE_ID,
        "area_code": None,
        "spatial_support": SPATIAL_SUPPORT,
        "location_id": reservoir_id,
        "commodity_id": None,
        "observed_at": observed_at,
        "release_at": None,
        "retrieved_at": retrieved_at,
        "measure": measure,
        "value": value,
        "unit": unit,
        "data_kind": DATA_KIND,
        "revision_id": revision_id,
        "quality_flag": "missing" if value is None else "good",
        "source_url": source_url,
        "license_status": license_status,
        "market_id": None,
        "price_type": None,
        "grade": None,
        "season": None,
    }


def dimensions_factory(dimensions: Mapping[tuple[str, str], Mapping[str, Any]]):
    """Return the writer callback that attaches the per-row dimensions."""
    def _dimensions(observation: Mapping[str, Any]) -> dict[str, Any]:
        key = (str(observation["location_id"]), str(observation["measure"]))
        found = dimensions.get(key)
        if found is None:
            raise ObservationWriteError("DIMENSIONS_INVALID")
        return dict(found)
    return _dimensions


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="tadih ingest --adapter rid",
        description="Publish the RID medium-reservoir daily report to Cloudflare D1.",
    )
    p.add_argument("--dry-run", action="store_true",
                   help="Validate the report and print the summary; write nothing (default).")
    p.add_argument("--write", action="store_true",
                   help="Publish the validated batch to Cloudflare D1.")
    p.add_argument("--date", help="Provider report day YYYY-MM-DD (1998-01-01..today ICT).")
    p.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR),
                   help="Local snapshot directory (default: data/local/raw).")
    p.add_argument("--registry", default=None,
                   help="License registry path (default: config/resource_licenses.json).")
    return p


def run(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
        registry_path: str | None = None, output_dir: str | None = None) -> dict[str, Any]:
    """Prepare (and optionally publish) one RID report batch."""
    args, unknown = parser().parse_known_args(list(argv or []))
    if args.dry_run and args.write:
        raise ValueError("--dry-run and --write cannot be combined")

    # The licence gate runs before anything else: a resource that is not
    # approved never reaches the provider and never reaches D1.
    resource = load_approved_resource(RESOURCE_KEY, registry_path=registry_path)

    envelope, normalized, requests = fetch_report(args.date, meta={"requests": []}, fetcher=fetcher)
    calibration = assert_percent_calibration(normalized)

    prepared = build_observation_rows(envelope, normalized, license_status=resource["license_status"])
    rows = prepared["rows"]
    if not rows:
        raise ValueError("the RID report produced no observation rows")
    stats = prepared["stats"]
    report_date = prepared["report_date"]

    coverage = {
        "mode": "daily_full",
        "count": stats["reservoirs"],
        "reservoirs": stats["reservoirs"],
        "rows": stats["rows"],
        "rowsByMeasure": stats["rowsByMeasure"],
        "reportDate": report_date,
        "grain": "reservoir x provider report day",
        "spatialSupport": SPATIAL_SUPPORT,
        "areaCode": None,
    }
    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if args.write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapterVersion": ADAPTER_VERSION,
        "resourceId": resource["resource_id"],
        "resourceKey": RESOURCE_KEY,
        "licenseStatus": resource["license_status"],
        "attribution": resource.get("attribution_text"),
        "attributionUrl": resource.get("attribution_url") or DOCUMENTATION_URL,
        "spatialSupport": SPATIAL_SUPPORT,
        "areaCode": None,
        "reportDate": report_date,
        "requestedDate": envelope.get("requested_date"),
        "observedAt": prepared["observed_at"],
        "observedAtTimeZone": "UTC anchor of the provider's ICT (UTC+7) report day",
        "retrievedAt": prepared["retrieved_at"],
        "dataKind": DATA_KIND,
        "units": dict(MEASURE_UNITS),
        "unitPolicy": "published only because the provider documents them (gate G3); "
                      "see unitEvidence in each row's dimensions",
        "measures": list(MEASURES),
        "reservoirs": stats["reservoirs"],
        "rows": stats["rows"],
        "rowsByMeasure": stats["rowsByMeasure"],
        "missingValues": stats["missingValues"],
        "completeness": "complete",
        "coverage": coverage,
        "percentCalibration": dict(calibration, tolerancePercentagePoints=PERCENT_TOLERANCE_PP),
        "contentSignature": prepared["revision_id"],
        "upstreamRequests": len(requests.get("requests") or []),
        "upstreamRequestUrls": [item.get("url") for item in requests.get("requests") or []],
        "unknownFlags": list(unknown),
        "written": False,
    }
    if not args.write:
        # ``--dry-run`` is the default: without an explicit ``--write`` nothing
        # is snapshotted and the D1 client is never contacted.
        return summary

    if client is None:
        from .hub_catalog_sync import connect_d1_client
        client = connect_d1_client()

    target = Path(output_dir or args.output_dir)
    snapshot = _write_snapshot(envelope, target, report_date)
    summary["snapshot"] = snapshot

    log_path = target / "rid" / "sync-log.jsonl"
    record: dict[str, Any] = {
        "script": "scripts/sync_rid_to_d1.py",
        "adapter": ADAPTER_NAME,
        "adapter_version": ADAPTER_VERSION,
        "run_started_at": prepared["retrieved_at"],
        "run_completed_at": _iso_utc(datetime.now(timezone.utc).isoformat()),
        "retrieved_at_utc": prepared["retrieved_at"],
        "requested_date": envelope.get("requested_date"),
        "report_date": report_date,
        "request_url": envelope.get("request_url"),
        "request_count": summary["upstreamRequests"],
        "requests": requests.get("requests") or [],
        "reservoir_count": stats["reservoirs"],
        "row_count": stats["rows"],
        "missing_values": stats["missingValues"],
        "percent_calibration_counts": calibration,
        "content_signature": prepared["revision_id"],
        "snapshot_path": snapshot.get("path"),
        "snapshot_checksum": snapshot.get("checksum"),
        "checksum_basis": "canonical_json_utf8",
        "license_status": resource["license_status"],
    }

    # Ensure the source/dataset/resource catalog rows exist before the
    # observations (idempotent; never rewrites a revoked access_status).
    try:
        register_resource(client, resource=resource, **CATALOG)
        published = publish_observations(
            client,
            resource=resource,
            rows=rows,
            adapter_version=ADAPTER_VERSION,
            coverage=coverage,
            completeness=summary["completeness"],
            unit=None,
            retrieved_at=prepared["retrieved_at"],
            catalog=CATALOG,
            product="RID medium-reservoir daily report",
            period_grain="daily",
            dimensions_for=dimensions_factory(prepared["dimensions"]),
            locations=prepared["locations"],
        )
    except Exception as exc:
        record.update({"action": "failed", "error_code": getattr(exc, "code", type(exc).__name__)})
        _append_log(log_path, record)
        raise

    record.update({
        "action": "published",
        "run_id": published["run_id"],
        "status": published["status"],
        "records_read": published["records_read"],
        "records_written": published["records_written"],
        "records_quarantined": published["records_quarantined"],
        "payload_sha256": published["payload_sha256"],
    })
    _append_log(log_path, record)

    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    return summary


def _write_snapshot(envelope: Mapping[str, Any], target: Path, report_date: str) -> dict[str, Any]:
    """Checkpoint the validated report locally (git-ignored data lake)."""
    from .ingestion import save_snapshot

    record = save_snapshot(dict(envelope), SOURCE_ID, str(target),
                           partition_key=f"medium-reservoirs-{report_date}")
    return {
        "path": str((target / SOURCE_ID / f"medium-reservoirs-{report_date}"
                     / str(record["artifact"])).resolve()),
        "checksum": record["checksum"],
        "artifact": record["artifact"],
    }


def _append_log(log_path: Path, record: Mapping[str, Any]) -> None:
    """Append one metadata line to the daily sync log (repo pattern)."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True, default=str) + "\n")


def run_adapter(*, client: Any = None, dry_run: bool = False, write: bool = False,
                date: str | None = None) -> dict[str, Any]:
    """Entry point used by ``tadih ingest --adapter rid`` (``tadih.cli.call_adapter``).

    The shared CLI probes ``run_adapter`` before ``run`` and passes the parsed
    flags as keyword arguments only.  Without this entry point the CLI would
    call :func:`run` with no ``argv`` and the flags would be dropped - a
    ``--write`` would silently publish nothing.  This function rebuilds the
    flag list and forwards it to :func:`run`.
    """
    argv: list[str] = []
    if write:
        argv.append("--write")
    if dry_run:
        argv.append("--dry-run")
    if date:
        argv += ["--date", date]
    return run(argv, client=client)


def main(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
         registry_path: str | None = None, output_dir: str | None = None) -> int:
    """CLI entry point of the adapter (``--dry-run`` is the default)."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, fetcher=fetcher, registry_path=registry_path,
                      output_dir=output_dir)
    except ObservationWriteError as exc:
        print(json.dumps({"status": "failed", "errorCode": exc.code, "message": str(exc)},
                         ensure_ascii=False), file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - the CLI reports every failure
        print(json.dumps({"status": "failed", "errorCode": type(exc).__name__,
                          "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":  # pragma: no cover
    from .env import load_dotenv

    load_dotenv(override=True)
    sys.exit(main(sys.argv[1:]))
