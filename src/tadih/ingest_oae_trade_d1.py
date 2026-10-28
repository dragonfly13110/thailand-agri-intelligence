"""Ingest the exact OAE agricultural export CSV through the shared D1 writer."""

import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any, Mapping, Sequence

from .oae_trade import (
    DATASET_ID,
    SOURCE_ID,
    SOURCE_METADATA_URL,
    RESOURCE_ID,
    SOURCE_RESOURCE_URL,
    UNIT,
    OAETradeSnapshot,
    fetch_oae_trade_snapshot,
)
from .observations import (
    ObservationWriteError,
    SOURCE_YEAR_REVIEW_FUTURE_SKEW,
    _logical_payload_sha256,
    _prepare_batch,
    _source_version_order_key,
    load_approved_resource,
    publish_observations,
)


ADAPTER_NAME = "oae_trade_exports"
ADAPTER_VERSION = "oae-trade-exports/1.0.0"
RESOURCE_KEY = "oae_agricultural_exports"
RESOURCE_GRAIN = "product × opaque source-year label; geography not reported"
PRODUCT_LABEL = "มูลค่าการส่งออกสินค้าเกษตร"
MEASURE = "agricultural_export_value"
_ROWSET_REVIEW_FIELDS = {
    "reviewed_by", "reviewed_at", "reason", "resource_id",
    "active_run_id", "active_payload_sha256", "active_source_year_label",
    "active_source_version", "active_source_hash", "active_source_revision_id",
    "candidate_run_id", "candidate_payload_sha256", "source_year_label",
    "source_version", "source_hash", "source_revision_id",
}
BASE_URL = "https://catalog.oae.go.th"
CATALOG = {
    "source_name": "สำนักงานเศรษฐกิจการเกษตร (OAE)",
    "base_url": BASE_URL,
    "connector_kind": "api",
    "category": "trade",
    "dataset_title": PRODUCT_LABEL,
    "dataset_description": (
        "OAE source-reported agricultural export values. Each snapshot retains the opaque year label "
        "from the CSV; calendar/fiscal convention and geographic scope are not reported by this adapter."
    ),
    "resource_format": "CSV",
    "grain": RESOURCE_GRAIN,
}


class OaeTradeAdapterError(ValueError):
    """Adapter invocation or exact-resource validation failed."""


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih ingest --adapter oae_trade_exports",
        description="Fetch the exact OAE export resource and preserve its source-year token.",
    )
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Prepare only; the default mode.")
    mode.add_argument("--write", action="store_true", help="Publish the validated source snapshot to D1.")
    result.add_argument("--date", help="Not supported: this resource uses an opaque source-year label.")
    result.add_argument("--registry", help="Exact-resource registry JSON path.")
    result.add_argument(
        "--rowset-review-file",
        help="JSON review manifest for an explicitly reviewed source-row removal; write mode only.",
    )
    return result


def run(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
        registry_path: str | None = None) -> dict[str, Any]:
    """Fetch one bounded snapshot, validate it, and write only with ``--write``."""
    args = parser().parse_args(list(argv or []))
    if args.date:
        raise OaeTradeAdapterError("--date is unsupported because the source provides a year label")
    if args.rowset_review_file and not args.write:
        raise OaeTradeAdapterError("--rowset-review-file requires --write")

    # The exact-resource approval and owner authorization are checked before
    # the source is contacted. License status is reported separately as unverified.
    resource = load_approved_resource(RESOURCE_KEY, registry_path=registry_path or args.registry)
    snapshot = (
        fetch_oae_trade_snapshot() if fetcher is None
        else fetch_oae_trade_snapshot(opener=fetcher)
    )
    _source_version_order_key(snapshot.source_version)
    rows, row_dimensions, product_labels = _adapt_snapshot(snapshot, resource["license_status"])
    labels = sorted({row["source_year_label"] for row in rows})
    if len(labels) != 1:
        raise OaeTradeAdapterError("OAE snapshot must report exactly one source-year label")

    source_hash = snapshot.source_hash.lower()
    source_revision = f"{snapshot.source_version}|md5:{source_hash}"
    retrieved_at = _iso_retrieved(snapshot)
    coverage = {
        "mode": "source_resource_snapshot",
        "sourceRowsReceived": len(snapshot.records),
        "sourceResourceBytesVerified": True,
        "sourceMetadataStableDuringFetch": True,
        "sourceScopeReported": "not_reported",
        "sourceHashAlgorithm": "MD5 (source-provided integrity check only)",
    }
    dimensions_for = lambda row: row_dimensions[row["observation_id"]]
    writer_plan, quarantined = _prepare_batch(
        resource,
        rows,
        unit=UNIT,
        completeness="complete",
        coverage=coverage,
        retrieved_at=retrieved_at,
        adapter_version=ADAPTER_VERSION,
        period_grain="source_year_token",
        locations={},
        product=product_labels,
        metric_name="มูลค่าการส่งออก",
        dimensions_for=dimensions_for,
    )
    if not writer_plan:
        raise ObservationWriteError(
            "ALL_ROWS_REJECTED", f"OAE snapshot produced no writer-valid rows: {quarantined[:3]}"
        )
    if quarantined:
        # Never publish a valid-looking subset of a source snapshot.
        raise ObservationWriteError(
            "OAE_SNAPSHOT_ROWS_REJECTED",
            f"writer rejected {len(quarantined)} of {len(rows)} source rows",
        )

    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if args.write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapterVersion": ADAPTER_VERSION,
        "resourceId": resource["resource_id"],
        "resourceKey": RESOURCE_KEY,
        "publicationAuthorization": resource.get("publication_authorization"),
        "sourceLicenseStatus": "unverified",
        "unresolvedSourceTerms": resource.get("unresolved", []),
        "sourceGrain": RESOURCE_GRAIN,
        "sourceYearLabels": labels,
        "sourceYearLabelOrigin": "CSV year column",
        "sourceYearConvention": "unknown",
        "observedAt": None,
        "spatialSupport": "not_reported",
        "areaCode": None,
        "unit": UNIT,
        "measure": MEASURE,
        "dataKind": "official",
        "sourceRowsReceived": len(snapshot.records),
        "missingValues": sum(record.value is None for record in snapshot.records),
        "retrievedAt": retrieved_at,
        "sourceVersion": snapshot.source_version,
        "revisionId": source_revision,
        "sourceHash": snapshot.source_hash,
        "sourceHashAlgorithm": "MD5 (source-provided integrity check only)",
        "contentSha256": snapshot.content_sha256,
        "sourceResourceUrl": snapshot.source_url,
        "payloadSha256": _logical_payload_sha256(resource["resource_id"], writer_plan),
        "writerValidationStatus": "valid",
        "completeness": "complete",
        "coverage": coverage,
        "upstreamRequests": 3,
        "upstreamRequestUrls": [SOURCE_METADATA_URL, SOURCE_RESOURCE_URL, SOURCE_METADATA_URL],
        "written": False,
    }
    if not args.write:
        return summary

    review = _read_review(args.rowset_review_file) if args.rowset_review_file else None
    if client is None:
        from .hub_catalog_sync import connect_d1_client
        client = connect_d1_client()
    if review is not None:
        review = _validate_rowset_review(
            review,
            client=client,
            resource_id=resource["resource_id"],
            source_year_label=labels[0],
            source_version=snapshot.source_version,
            source_hash=source_hash,
            source_revision_id=source_revision,
            candidate_payload_sha256=summary["payloadSha256"],
        )
    published = publish_observations(
        client,
        resource=resource,
        rows=rows,
        adapter_version=ADAPTER_VERSION,
        coverage=coverage,
        completeness="complete",
        unit=UNIT,
        retrieved_at=retrieved_at,
        source_version=snapshot.source_version,
        source_hash=source_hash,
        catalog=dict(CATALOG, resource_url=snapshot.source_url),
        product=product_labels,
        metric_name="มูลค่าการส่งออก",
        period_grain="source_year_token",
        dimensions_for=dimensions_for,
        source_year_rowset_change_review=review,
    )
    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    if published.get("active_run_blocked_reason") == "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW":
        summary["rowsetReviewContext"] = _rowset_review_context(
            client=client,
            resource_id=resource["resource_id"],
            candidate_run_id=published["run_id"],
            candidate_payload_sha256=summary["payloadSha256"],
            source_year_label=labels[0],
            source_version=snapshot.source_version,
            source_hash=source_hash,
            source_revision_id=source_revision,
        )
    return summary


def _read_review(path: str) -> dict[str, Any]:
    """Read a small, strict JSON manifest without accepting duplicate keys."""
    try:
        file_path = Path(path)
        if file_path.stat().st_size > 16_384:
            raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")
        value = json.loads(file_path.read_text(encoding="utf-8"), object_pairs_hook=_unique_object)
    except OaeTradeAdapterError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID") from exc
    if not isinstance(value, dict) or set(value) != _ROWSET_REVIEW_FIELDS:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")
    return value


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _validate_rowset_review(
    review: Mapping[str, Any], *, client: Any, resource_id: str,
    source_year_label: str, source_version: str, source_hash: str,
    source_revision_id: str, candidate_payload_sha256: str,
) -> dict[str, Any]:
    """Bind a human review to exact immutable active and candidate snapshots."""
    if set(review) != _ROWSET_REVIEW_FIELDS:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")
    for key in ("reviewed_by", "reason"):
        value = review.get(key)
        if (not isinstance(value, str) or not value.strip() or len(value) > 500
                or "://" in value
                or any(marker in value.lower() for marker in ("api_key", "apikey", "token="))):
            raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")

    reviewed_at = _aware_timestamp(review.get("reviewed_at"))
    if (reviewed_at is None
            or reviewed_at > datetime.now(timezone.utc) + SOURCE_YEAR_REVIEW_FUTURE_SKEW):
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")

    for key in ("active_payload_sha256", "candidate_payload_sha256"):
        if not isinstance(review.get(key), str) or re.fullmatch(r"[0-9a-f]{64}", review[key]) is None:
            raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")
    for key in ("active_source_hash", "source_hash"):
        if not isinstance(review.get(key), str) or re.fullmatch(r"[0-9a-f]{32}", review[key]) is None:
            raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")
    for key in (
        "resource_id", "active_run_id", "active_source_year_label", "active_source_version",
        "active_source_revision_id", "candidate_run_id", "source_year_label", "source_version",
        "source_revision_id",
    ):
        value = review.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 500:
            raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_INVALID")

    expected_candidate = {
        "resource_id": resource_id,
        "candidate_payload_sha256": candidate_payload_sha256,
        "source_year_label": source_year_label,
        "source_version": source_version,
        "source_hash": source_hash,
        "source_revision_id": source_revision_id,
    }
    if any(review.get(key) != value for key, value in expected_candidate.items()):
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")
    if review.get("source_revision_id") != f"{review.get('source_version')}|md5:{review.get('source_hash')}":
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")

    active = _active_snapshot_identity(client, resource_id)
    if active is None or any(
        review.get(review_key) != active.get(active_key)
        for review_key, active_key in (
            ("active_run_id", "active_run_id"),
            ("active_payload_sha256", "payload_sha256"),
            ("active_source_year_label", "source_year_label"),
            ("active_source_version", "source_version"),
            ("active_source_hash", "source_hash"),
            ("active_source_revision_id", "source_revision_id"),
        )
    ):
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")
    if review.get("active_source_revision_id") != (
        f"{review.get('active_source_version')}|md5:{review.get('active_source_hash')}"
    ):
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")

    candidate = _candidate_snapshot_identity(client, resource_id, review["candidate_run_id"])
    if candidate is None:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")
    candidate_retrieved = _aware_timestamp(candidate.get("source_retrieved_at"))
    if candidate_retrieved is None:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")
    if reviewed_at < candidate_retrieved:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")
    if any(
        candidate.get(candidate_key) != review.get(review_key)
        for candidate_key, review_key in (
            ("run_id", "candidate_run_id"),
            ("payload_sha256", "candidate_payload_sha256"),
            ("source_year_label", "source_year_label"),
            ("source_version", "source_version"),
            ("source_hash", "source_hash"),
            ("source_revision_id", "source_revision_id"),
        )
    ):
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STALE")
    return dict(review)


def _active_snapshot_identity(client: Any, resource_id: str) -> dict[str, Any] | None:
    try:
        result = client.execute(
            "SELECT r.active_run_id,s.payload_sha256,s.source_year_label,s.source_version,s.source_hash,"
            "s.source_revision_id FROM resources r LEFT JOIN sync_runs s "
            "ON s.resource_id=r.resource_id AND s.run_id=r.active_run_id WHERE r.resource_id=?",
            [resource_id],
        )
    except Exception as exc:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STATE_UNAVAILABLE") from exc
    row = _first_row(result)
    if row is None or not row.get("active_run_id"):
        return None
    if any(row.get(key) is None for key in (
        "payload_sha256", "source_year_label", "source_version", "source_hash", "source_revision_id",
    )):
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_ACTIVE_SNAPSHOT_UNAVAILABLE")
    return row


def _candidate_snapshot_identity(client: Any, resource_id: str, run_id: str) -> dict[str, Any] | None:
    try:
        result = client.execute(
            "SELECT run_id,payload_sha256,source_year_label,source_version,source_hash,source_revision_id,"
            "source_retrieved_at "
            "FROM sync_runs WHERE resource_id=? AND run_id=? AND status IN ('succeeded','partial')",
            [resource_id, run_id],
        )
    except Exception as exc:
        raise OaeTradeAdapterError("SOURCE_YEAR_REVIEW_STATE_UNAVAILABLE") from exc
    return _first_row(result)


def _rowset_review_context(
    *, client: Any, resource_id: str, candidate_run_id: str,
    candidate_payload_sha256: str, source_year_label: str, source_version: str,
    source_hash: str, source_revision_id: str,
) -> dict[str, Any] | None:
    active = _active_snapshot_identity(client, resource_id)
    if active is None:
        return None
    return {
        "resource_id": resource_id,
        "active_run_id": active["active_run_id"],
        "active_payload_sha256": active["payload_sha256"],
        "active_source_year_label": active["source_year_label"],
        "active_source_version": active["source_version"],
        "active_source_hash": active["source_hash"],
        "active_source_revision_id": active["source_revision_id"],
        "candidate_run_id": candidate_run_id,
        "candidate_payload_sha256": candidate_payload_sha256,
        "source_year_label": source_year_label,
        "source_version": source_version,
        "source_hash": source_hash,
        "source_revision_id": source_revision_id,
    }


def _aware_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc)


def _first_row(result: Any) -> dict[str, Any] | None:
    if not isinstance(result, dict):
        return None
    rows = result.get("results")
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return rows[0]
    return None


def _adapt_snapshot(snapshot: OAETradeSnapshot, license_status: str):
    rows = []
    dimensions = {}
    product_labels = {}
    for record in snapshot.records:
        if record.value is not None:
            if record.value != record.value.to_integral_value():
                raise ValueError("fractional OAE values are unsupported by the current exact D1 numeric contract")
            value = int(record.value)
        else:
            value = None
        product_key = hashlib.sha256(record.product.encode("utf-8")).hexdigest()[:32]
        observation_id = f"oae:export:{product_key}"
        row = {
            "observation_id": observation_id,
            "source_id": SOURCE_ID,
            "area_code": None,
            "spatial_support": "not_reported",
            "location_id": None,
            "commodity_id": None,
            "observed_at": None,
            "source_year_label": record.year_label,
            "source_row_id": f"{record.year_label}|{record.trade_type}|{record.product}",
            "release_at": None,
            "retrieved_at": _iso_retrieved(snapshot),
            "measure": MEASURE,
            "value": value,
            "unit": record.unit,
            "data_kind": "official",
            "revision_id": f"{snapshot.source_version}|md5:{snapshot.source_hash.lower()}",
            "quality_flag": "missing" if value is None else "good",
            "source_url": snapshot.source_url,
            "license_status": license_status,
            "market_id": None,
            "price_type": None,
            "grade": None,
            "season": None,
        }
        rows.append(row)
        product_labels[observation_id] = record.product
        dimensions[observation_id] = {
            "spatialSupport": "not_reported",
            "dataKind": "official",
            "measure": MEASURE,
            "tradeType": record.trade_type,
            "sourceYearLabel": record.year_label,
            "sourceYearLabelOrigin": "csv_year_column",
            "sourceYearLabelConvention": "unknown",
            "sourceRowId": row["source_row_id"],
        }
    return rows, dimensions, product_labels


def _iso_retrieved(snapshot: OAETradeSnapshot) -> str:
    if snapshot.retrieved_at is None or snapshot.retrieved_at.tzinfo is None:
        raise OaeTradeAdapterError("OAE retrieval timestamp missing or not timezone-aware")
    return snapshot.retrieved_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def main(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
         registry_path: str | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, fetcher=fetcher, registry_path=registry_path)
    except Exception as exc:  # noqa: BLE001 - CLI reports a bounded failure object
        code = getattr(exc, "code", None) or getattr(exc, "args", [None])[0] or type(exc).__name__
        print(json.dumps({"status": "failed", "errorCode": code,
                          "message": str(exc)[:300]}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    published = summary.get("published") if isinstance(summary, dict) else None
    if summary.get("mode") == "write" and summary.get("written") is True and isinstance(published, dict):
        if (published.get("active_run_blocked_reason") or published.get("activation_blocked_reason")
                or (summary.get("status") == "partial" and not published.get("active_run_switched"))):
            return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
