"""Publish CPD agricultural-cooperative counts with opaque source-year labels."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any, Mapping, Sequence

from .catalog import load_provinces
from .cpd_agricultural_coop_counts import (
    DATASET_NAME,
    METADATA_URL,
    RESOURCE_ID,
    RESOURCE_URL,
    SOURCE_ID,
    SOURCE_UNIT,
    CpdCoopCountSnapshot,
    fetch_cpd_agricultural_coop_counts,
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


ADAPTER_NAME = "cpd_agricultural_coop_counts"
ADAPTER_VERSION = "cpd-agricultural-coop-counts/1.0.0"
RESOURCE_KEY = "cpd_agricultural_coop_counts"
BASE_URL = "https://catalog-cpd.data.go.th"
RESOURCE_GRAIN = "province label × reporting-unit label × source status; opaque source-year token"
PRODUCT_LABEL = DATASET_NAME
MEASURE_NAME = "จำนวนสหกรณ์การเกษตรตามสถานะต้นทาง"
_ROWSET_REVIEW_FIELDS = {
    "reviewed_by", "reviewed_at", "reason", "resource_id",
    "active_run_id", "active_payload_sha256", "active_source_year_label",
    "active_source_version", "active_source_hash", "active_source_revision_id",
    "candidate_run_id", "candidate_payload_sha256", "source_year_label",
    "source_version", "source_hash", "source_revision_id",
}
_STATUS_COLUMNS = (
    ("ยังไม่เริ่มดำเนินการ", "not_started_count", "agricultural_cooperative_count_not_started"),
    ("ดำเนินการ", "operating_count", "agricultural_cooperative_count_operating"),
    ("เลิกสหกรณ์", "dissolved_count", "agricultural_cooperative_count_dissolved"),
)
CATALOG = {
    "source_name": "ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ",
    "base_url": BASE_URL,
    "connector_kind": "api",
    "category": "cooperatives",
    "dataset_id": "7e7e236d-790d-489d-a723-e0b1359530a4",
    "source_dataset_id": "7e7e236d-790d-489d-a723-e0b1359530a4",
    "dataset_title": DATASET_NAME,
    "dataset_description": (
        "The exact CPD catalog resource reports agricultural-cooperative counts by source province label "
        "and reporting-unit label, with three source status columns. Its year label is kept as text; the "
        "calendar or fiscal convention and source licence terms are unverified."
    ),
    "dataset_owner": "ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ",
    "dataset_source_url": METADATA_URL,
    "resource_format": "CSV",
    "resource_url": RESOURCE_URL,
    "source_resource_id": RESOURCE_ID,
    "grain": RESOURCE_GRAIN,
}


class CpdCoopAdapterError(ValueError):
    """CPD snapshot cannot be mapped to the approved observation contract."""

    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or code)
        self.code = code


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih ingest --adapter cpd_agricultural_coop_counts",
        description="Fetch one exact CPD cooperative-count resource; publish only with explicit --write.",
    )
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Prepare the source snapshot without writing (default).")
    mode.add_argument("--write", action="store_true", help="Publish the validated snapshot through the shared D1 writer.")
    result.add_argument("--date", help="Not supported: CPD publishes an opaque year label in the resource name.")
    result.add_argument("--registry", help="Exact-resource registry JSON path.")
    result.add_argument(
        "--rowset-review-file",
        help="JSON review manifest for an explicitly reviewed source-row removal; write mode only.",
    )
    return result


def run(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
        registry_path: str | None = None) -> dict[str, Any]:
    """Prepare a bounded CPD snapshot; write only when explicitly requested."""
    args = parser().parse_args(list(argv or []))
    if args.date:
        raise CpdCoopAdapterError("CPD_SOURCE_YEAR_IS_NOT_A_DATE", "--date is unsupported for CPD's opaque year label")
    if args.rowset_review_file and not args.write:
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID", "--rowset-review-file requires --write")

    # The exact resource grant is checked before any network access. Its project
    # authorization is separate from the still-unverified source license terms.
    resource = load_approved_resource(RESOURCE_KEY, registry_path=registry_path or args.registry)
    snapshot = (
        fetch_cpd_agricultural_coop_counts() if fetcher is None
        else fetch_cpd_agricultural_coop_counts(opener=fetcher)
    )
    return _prepare_snapshot(
        snapshot,
        resource=resource,
        client=client,
        write=bool(args.write),
        rowset_review_file=args.rowset_review_file,
    )


def _prepare_snapshot(snapshot: CpdCoopCountSnapshot, *, resource: dict,
                      client: Any = None, write: bool = False,
                      rowset_review_file: str | None = None) -> dict[str, Any]:
    if snapshot.resource_id != RESOURCE_ID or snapshot.source_id != SOURCE_ID:
        raise CpdCoopAdapterError("CPD_RESOURCE_IDENTITY_MISMATCH")
    if resource.get("resource_id") != snapshot.resource_id:
        raise CpdCoopAdapterError("CPD_REGISTRY_RESOURCE_MISMATCH")
    if not snapshot.source_year_label or snapshot.source_year_convention != "unknown":
        raise CpdCoopAdapterError("CPD_SOURCE_YEAR_CONTRACT_INVALID")
    source_credit = snapshot.dataset_organization_title or snapshot.dataset_maintainer
    if not source_credit or source_credit != resource.get("attribution_text"):
        raise CpdCoopAdapterError("CPD_ATTRIBUTION_METADATA_CHANGED")
    declared_license = resource.get("declared_license") or {}
    if (snapshot.dataset_license_id != declared_license.get("license_id")
            or snapshot.dataset_license_title != declared_license.get("license_title")
            or snapshot.dataset_license_url != declared_license.get("license_url")
            or snapshot.resource_license_id is not None
            or snapshot.resource_license_url is not None):
        raise CpdCoopAdapterError("CPD_SOURCE_LICENSE_METADATA_CHANGED")
    if snapshot.retrieved_at is None or snapshot.retrieved_at.tzinfo is None:
        raise CpdCoopAdapterError("CPD_RETRIEVAL_TIME_MISSING")

    source_version = snapshot.resource_last_modified
    _source_version_order_key(source_version)
    source_hash = snapshot.resource_hash.lower()
    source_revision = f"{source_version}|md5:{source_hash}"
    retrieved_at = snapshot.retrieved_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    rows, locations, row_dimensions, crosswalk = _adapt_snapshot(snapshot, resource["license_status"])
    coverage = {
        "mode": "source_resource_snapshot",
        "sourceRowsReceived": snapshot.source_rows_received,
        "sourceResourceBytesVerified": True,
        "sourceMetadataStableDuringFetch": True,
        "sourceScopeReported": "source province label × source reporting-unit label",
        "sourceProvinceLabelsObserved": snapshot.source_province_labels_observed,
        "sourceReportingUnitsObserved": snapshot.source_reporting_units_observed,
        "spatialCoverageAssertion": "not_made",
    }
    dimensions_for = lambda row: row_dimensions[row["observation_id"]]
    writer_plan, quarantined = _prepare_batch(
        resource,
        rows,
        unit=SOURCE_UNIT,
        completeness="complete",
        coverage=coverage,
        retrieved_at=retrieved_at,
        adapter_version=ADAPTER_VERSION,
        period_grain="source_year_token",
        locations=locations,
        product=PRODUCT_LABEL,
        metric_name=MEASURE_NAME,
        dimensions_for=dimensions_for,
    )
    if not writer_plan:
        raise ObservationWriteError("ALL_ROWS_REJECTED", "CPD snapshot produced no writer-valid observations")
    if quarantined:
        raise ObservationWriteError(
            "CPD_SNAPSHOT_ROWS_REJECTED",
            f"writer rejected {len(quarantined)} of {len(rows)} CPD observations",
        )

    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapterVersion": ADAPTER_VERSION,
        "resourceKey": RESOURCE_KEY,
        "resourceId": snapshot.resource_id,
        "publicationAuthorization": resource.get("publication_authorization"),
        "sourceLicenseStatus": "unverified",
        "sourceLicenseLabel": snapshot.dataset_license_id,
        "sourceLicenseTitle": snapshot.dataset_license_title,
        "sourceLicenseUrl": snapshot.dataset_license_url,
        "sourceLicenseVersion": snapshot.license_version,
        "sourceOrganizationTitle": snapshot.dataset_organization_title,
        "sourceMaintainer": snapshot.dataset_maintainer,
        "unresolvedSourceTerms": resource.get("unresolved", []),
        "attributionText": resource.get("attribution_text"),
        "attributionUrl": resource.get("attribution_url"),
        "sourceGrain": RESOURCE_GRAIN,
        "sourceYearLabel": snapshot.source_year_label,
        "sourceYearLabelOrigin": snapshot.source_year_extracted_from,
        "sourceYearConvention": snapshot.source_year_convention,
        "observedAt": None,
        "spatialSupport": "province",
        "provinceCrosswalk": crosswalk,
        "unit": SOURCE_UNIT,
        "measure": "agricultural_cooperative_count_by_source_status",
        "sourceStatuses": [status for status, _field, _measure in _STATUS_COLUMNS],
        "sourceRowsReceived": snapshot.source_rows_received,
        "sourceProvinceLabelsObserved": snapshot.source_province_labels_observed,
        "sourceReportingUnitsObserved": snapshot.source_reporting_units_observed,
        "observationRowsPrepared": len(rows),
        "missingValues": sum(row["value"] is None for row in rows),
        "retrievedAt": retrieved_at,
        "sourceVersion": source_version,
        "revisionId": source_revision,
        "sourceHash": source_hash,
        "sourceHashAlgorithm": "MD5 (source-provided catalog integrity check only)",
        "resourceSizeBytes": snapshot.resource_size_bytes,
        "contentSha256": snapshot.content_sha256,
        "sourceResourceUrl": snapshot.source_url,
        "sourceMetadataUrl": METADATA_URL,
        "payloadSha256": _logical_payload_sha256(resource["resource_id"], writer_plan),
        "writerValidationStatus": "valid",
        "completeness": "complete",
        "coverage": coverage,
        "upstreamRequests": 3,
        "upstreamRequestUrls": [METADATA_URL, snapshot.source_url, METADATA_URL],
        "written": False,
    }
    if not write:
        return summary

    review = _read_review(rowset_review_file) if rowset_review_file else None
    if client is None:
        from .hub_catalog_sync import connect_d1_client
        client = connect_d1_client()
    if review is not None:
        review = _validate_rowset_review(
            review,
            client=client,
            resource_id=snapshot.resource_id,
            source_year_label=snapshot.source_year_label,
            source_version=source_version,
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
        unit=SOURCE_UNIT,
        retrieved_at=retrieved_at,
        source_version=source_version,
        source_hash=source_hash,
        catalog=dict(CATALOG, resource_url=snapshot.source_url),
        product=PRODUCT_LABEL,
        metric_name=MEASURE_NAME,
        period_grain="source_year_token",
        dimensions_for=dimensions_for,
        locations=locations,
        source_year_rowset_change_review=review,
    )
    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    if published.get("active_run_blocked_reason") == "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW":
        summary["rowsetReviewContext"] = _rowset_review_context(
            client=client,
            resource_id=snapshot.resource_id,
            candidate_run_id=published["run_id"],
            candidate_payload_sha256=summary["payloadSha256"],
            source_year_label=snapshot.source_year_label,
            source_version=source_version,
            source_hash=source_hash,
            source_revision_id=source_revision,
        )
    return summary


def _read_review(path: str) -> dict[str, Any]:
    """Read a bounded strict JSON manifest and reject duplicate object keys."""
    try:
        with Path(path).open("rb") as source_file:
            raw = source_file.read(16_385)
        if len(raw) > 16_384:
            raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object)
    except CpdCoopAdapterError:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, RecursionError) as exc:
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID") from exc
    if not isinstance(value, dict) or set(value) != _ROWSET_REVIEW_FIELDS:
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")
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
    """Bind review to the exact active and candidate source-year snapshots."""
    if set(review) != _ROWSET_REVIEW_FIELDS:
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")
    for key in ("reviewed_by", "reason"):
        value = review.get(key)
        if (not isinstance(value, str) or not value.strip() or len(value) > 500
                or "://" in value
                or any(marker in value.lower() for marker in ("api_key", "apikey", "token="))):
            raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")

    reviewed_at = _aware_timestamp(review.get("reviewed_at"))
    if (reviewed_at is None
            or reviewed_at > datetime.now(timezone.utc) + SOURCE_YEAR_REVIEW_FUTURE_SKEW):
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")

    for key in ("active_payload_sha256", "candidate_payload_sha256"):
        if not isinstance(review.get(key), str) or re.fullmatch(r"[0-9a-f]{64}", review[key]) is None:
            raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")
    for key in ("active_source_hash", "source_hash"):
        if not isinstance(review.get(key), str) or re.fullmatch(r"[0-9a-f]{32}", review[key]) is None:
            raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")
    for key in (
        "resource_id", "active_run_id", "active_source_year_label", "active_source_version",
        "active_source_revision_id", "candidate_run_id", "source_year_label", "source_version",
        "source_revision_id",
    ):
        value = review.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 500:
            raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_INVALID")

    expected_candidate = {
        "resource_id": resource_id,
        "candidate_payload_sha256": candidate_payload_sha256,
        "source_year_label": source_year_label,
        "source_version": source_version,
        "source_hash": source_hash,
        "source_revision_id": source_revision_id,
    }
    if any(review.get(key) != value for key, value in expected_candidate.items()):
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STALE")
    if review.get("source_revision_id") != f"{review.get('source_version')}|md5:{review.get('source_hash')}":
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STALE")

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
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STALE")
    if review.get("active_source_revision_id") != (
        f"{review.get('active_source_version')}|md5:{review.get('active_source_hash')}"
    ):
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STALE")

    candidate = _candidate_snapshot_identity(client, resource_id, review["candidate_run_id"])
    if candidate is None:
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STALE")
    candidate_retrieved = _aware_timestamp(candidate.get("source_retrieved_at"))
    if candidate_retrieved is None or reviewed_at < candidate_retrieved:
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STALE")
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
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STALE")
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
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STATE_UNAVAILABLE") from exc
    row = _first_row(result)
    if row is None or not row.get("active_run_id"):
        return None
    if any(row.get(key) is None for key in (
        "payload_sha256", "source_year_label", "source_version", "source_hash", "source_revision_id",
    )):
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_ACTIVE_SNAPSHOT_UNAVAILABLE")
    return row


def _candidate_snapshot_identity(client: Any, resource_id: str, run_id: str) -> dict[str, Any] | None:
    try:
        result = client.execute(
            "SELECT run_id,payload_sha256,source_year_label,source_version,source_hash,source_revision_id,"
            "source_retrieved_at FROM sync_runs WHERE resource_id=? AND run_id=? "
            "AND status IN ('succeeded','partial')",
            [resource_id, run_id],
        )
    except Exception as exc:
        raise CpdCoopAdapterError("SOURCE_YEAR_REVIEW_STATE_UNAVAILABLE") from exc
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


def _adapt_snapshot(snapshot: CpdCoopCountSnapshot, license_status: str):
    provinces = load_provinces()
    province_by_name: dict[str, dict[str, str]] = {}
    for province in provinces:
        name = province["name_th"]
        if name in province_by_name:
            raise CpdCoopAdapterError("CPD_PROVINCE_CROSSWALK_AMBIGUOUS", f"duplicate province reference name: {name}")
        province_by_name[name] = province

    source_labels = {row.province_name for row in snapshot.records}
    unmatched = sorted(source_labels - province_by_name.keys())
    if unmatched:
        raise CpdCoopAdapterError(
            "CPD_PROVINCE_CROSSWALK_UNMATCHED",
            f"CPD source province label has no exact name_th reference match: {unmatched[0]}",
        )

    observations: list[dict[str, Any]] = []
    locations: dict[str, dict[str, str]] = {}
    dimensions: dict[str, dict[str, str]] = {}
    for source_row in snapshot.records:
        province = province_by_name[source_row.province_name]
        area_code = province["area_code"]
        office_digest = hashlib.sha256(source_row.reporting_unit.encode("utf-8")).hexdigest()
        location_id = f"cpd:province:{area_code}"
        locations[location_id] = {
            "kind": "province",
            "nativeCode": area_code,
            "name": province["name_th"],
            "provinceCode": area_code,
        }
        source_row_ref = f"sha256:{source_row.row_sha256}"
        for source_status, value_field, measure in _STATUS_COLUMNS:
            observation_id = f"cpd:coop:{area_code}:{office_digest}:{measure}"
            value = getattr(source_row, value_field)
            observation = {
                "observation_id": observation_id,
                "source_id": SOURCE_ID,
                "area_code": area_code,
                "spatial_support": "province",
                "location_id": location_id,
                "commodity_id": None,
                "observed_at": None,
                "source_year_label": snapshot.source_year_label,
                "source_row_id": source_row_ref,
                "release_at": None,
                "retrieved_at": _retrieved_iso(snapshot),
                "measure": measure,
                "value": value,
                "unit": SOURCE_UNIT,
                "data_kind": "official",
                "revision_id": f"{snapshot.resource_last_modified}|md5:{snapshot.resource_hash.lower()}",
                "quality_flag": "missing" if value is None else "good",
                "source_url": snapshot.source_url,
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            }
            observations.append(observation)
            dimensions[observation_id] = {
                "spatialSupport": "province",
                "dataKind": "official",
                "measure": measure,
                "sourceYearLabel": snapshot.source_year_label,
                "sourceYearLabelOrigin": "resource_name",
                "sourceYearLabelConvention": "unknown",
                "sourceProvinceLabel": source_row.province_name_source,
                "provinceCrosswalkMethod": "exact name_th match in config/provinces.csv",
                "reportingUnit": source_row.reporting_unit,
                "reportingUnitSourceLabel": source_row.reporting_unit_source,
                "sourceStatus": source_status,
            }
    crosswalk = {
        "method": "exact source province label to config/provinces.csv name_th",
        "matchedSourceLabels": len(source_labels),
        "unmatchedSourceLabels": 0,
        "interpretation": "reference crosswalk only; no province coverage is claimed",
    }
    return observations, locations, dimensions, crosswalk


def _retrieved_iso(snapshot: CpdCoopCountSnapshot) -> str:
    if snapshot.retrieved_at is None or snapshot.retrieved_at.tzinfo is None:
        raise CpdCoopAdapterError("CPD_RETRIEVAL_TIME_MISSING")
    return snapshot.retrieved_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def main(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
         registry_path: str | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, fetcher=fetcher, registry_path=registry_path)
    except Exception as exc:  # noqa: BLE001 - adapter CLI reports bounded failure details
        code = getattr(exc, "code", None) or getattr(exc, "args", [None])[0] or type(exc).__name__
        print(json.dumps({"status": "failed", "errorCode": code, "message": str(exc)[:300]}, ensure_ascii=False),
              file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
    published = summary.get("published") if isinstance(summary, dict) else None
    if summary.get("mode") == "write" and summary.get("written") is True and isinstance(published, dict):
        if published.get("active_run_blocked_reason") or published.get("activation_blocked_reason"):
            return 1
        if summary.get("status") == "partial" and not published.get("active_run_switched"):
            return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
