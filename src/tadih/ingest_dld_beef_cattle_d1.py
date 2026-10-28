"""Publish DLD beef-cattle source-year labels through the shared D1 writer."""

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

from .dld_livestock_cattle import fetch_dld_beef_cattle
from .observations import (
    ObservationWriteError,
    _logical_payload_sha256,
    _prepare_batch,
    load_approved_resource,
    publish_observations,
)


ADAPTER_NAME = "dld_beef_cattle"
ADAPTER_VERSION = "dld-beef-cattle/1.0.0"
RESOURCE_KEY = "dld_livestock_cattle_province"
SOURCE_ID = "dld"
BASE_URL = "https://dld.gdcatalog.go.th"
DATASET_TITLE = "ข้อมูลปศุสัตว์ รายจังหวัด กรมปศุสัตว์"
RESOURCE_GRAIN = "province × Buddhist source-year label; reference-year convention unverified"
CATALOG = {
    "source_name": "Department of Livestock Development",
    "base_url": BASE_URL,
    "connector_kind": "api",
    "category": "livestock",
    "dataset_title": DATASET_TITLE,
    "dataset_description": (
        "Counts by DLD province and source-year label. The source year is retained as Buddhist-year text; "
        "calendar/fiscal convention is unverified."
    ),
    "resource_format": "JSON",
    "grain": RESOURCE_GRAIN,
}


class DldBeefCattleAdapterError(ValueError):
    """Adapter invocation or review-manifest error."""


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih ingest --adapter dld_beef_cattle",
        description="Fetch DLD beef-cattle counts by province and Buddhist source-year label.",
    )
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Prepare and report the batch without writing (default).")
    mode.add_argument("--write", action="store_true", help="Publish the validated batch to D1.")
    result.add_argument("--date", help="Not supported: this resource is published by source-year label.")
    result.add_argument("--registry", help="Exact-resource registry JSON path.")
    result.add_argument(
        "--rowset-review-file",
        help="JSON review manifest for an explicitly reviewed source-row removal; write mode only.",
    )
    return result


def run(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
        registry_path: str | None = None) -> dict[str, Any]:
    """Fetch and normalize a bounded source snapshot; write only with ``--write``."""
    args = parser().parse_args(list(argv or []))
    if args.date:
        raise DldBeefCattleAdapterError("--date is unsupported because the source has year labels, not dates")
    if args.rowset_review_file and not args.write:
        raise DldBeefCattleAdapterError("--rowset-review-file requires --write")

    # Approval is verified before contacting the source. The authorization
    # basis remains separate from the still-unverified source license facts.
    resource = load_approved_resource(RESOURCE_KEY, registry_path=registry_path or args.registry)
    batch = fetch_dld_beef_cattle() if fetcher is None else fetch_dld_beef_cattle(fetcher=fetcher)
    observations, location_overrides, row_dimensions = _adapt_rows(batch, resource["license_status"])
    coverage = {
        "mode": "source_reported_rows",
        "sourceReportedRows": batch["source_reported_rows"],
        "rowsFetched": batch["records_fetched"],
        "pageCount": batch["page_count"],
        "sourceResponseComplete": batch["source_response_complete"],
        "provinceListingByYear": batch["province_listing_by_year"],
    }
    dimensions_for = lambda row: row_dimensions[row["observation_id"]]
    writer_plan, quarantined = _prepare_batch(
        resource, observations, unit="ตัว", completeness=("complete" if batch["source_response_complete"] else "partial"),
        coverage=coverage, retrieved_at=batch["retrieved_at"], adapter_version=ADAPTER_VERSION,
        period_grain="source_year_label", locations=location_overrides,
        product="จำนวนโคเนื้อ รายจังหวัด กรมปศุสัตว์", metric_name="จำนวนโคเนื้อ",
        dimensions_for=dimensions_for,
    )
    if not writer_plan:
        raise ObservationWriteError("ALL_ROWS_REJECTED", "DLD snapshot produced no writer-valid rows")
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
        "sourceGrain": batch["source_grain"],
        "sourceYearLabelsBe": sorted({row["source_year_be"] for row in batch["rows"]}),
        "sourceYearConvention": "unverified; values remain source Buddhist-year labels",
        "observedAt": None,
        "unit": "ตัว",
        "measure": "beef_cattle_count",
        "dataKind": "official",
        "sourceReportedRows": batch["source_reported_rows"],
        "rowsFetched": len(observations),
        "missingValues": sum(row["value"] is None for row in batch["rows"]),
        "retrievedAt": batch["retrieved_at"],
        "sourceRevision": batch["source_revision"],
        "revisionId": batch["revision_id"],
        "payloadSha256": _logical_payload_sha256(resource["resource_id"], writer_plan),
        "writerRowsQuarantined": len(quarantined),
        "writerValidationStatus": "valid" if not quarantined else "partial",
        "wouldPassSourceBatchGate": (
            batch["source_response_complete"] and not quarantined
        ),
        "completeness": "complete" if batch["source_response_complete"] else "partial",
        "coverage": coverage,
        "upstreamRequests": batch["page_count"] + 2,
        "upstreamRequestUrls": _request_urls(batch),
        "written": False,
    }
    if not args.write:
        return summary

    review = _read_review(args.rowset_review_file) if args.rowset_review_file else None
    if client is None:
        from .hub_catalog_sync import connect_d1_client
        client = connect_d1_client()
    published = publish_observations(
        client,
        resource=resource,
        rows=observations,
        adapter_version=ADAPTER_VERSION,
        coverage=coverage,
        completeness=summary["completeness"],
        unit="ตัว",
        retrieved_at=batch["retrieved_at"],
        catalog=dict(CATALOG, resource_url=batch["resource_url"]),
        product="จำนวนโคเนื้อ รายจังหวัด กรมปศุสัตว์",
        metric_name="จำนวนโคเนื้อ",
        period_grain="source_year_label",
        dimensions_for=dimensions_for,
        locations=location_overrides,
        source_year_rowset_change_review=review,
    )
    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    return summary


def _adapt_rows(batch: Mapping[str, Any], license_status: str):
    observations = []
    locations = {}
    dimensions = {}
    for row in batch["rows"]:
        observation_id = f"dld-beef-cattle:{row['source_year_be']}:{row['area_code']}"
        location_id = f"dld:province:{row['area_code']}"
        observations.append({
            "observation_id": observation_id,
            "source_id": SOURCE_ID,
            "area_code": row["area_code"],
            "spatial_support": "province",
            "location_id": location_id,
            "commodity_id": "beef_cattle",
            "observed_at": None,
            "source_year_be": row["source_year_be"],
            "source_row_id": row["source_row_id"],
            "release_at": batch["release_at"],
            "retrieved_at": row["retrieved_at"],
            "measure": row["measure"],
            "value": row["value"],
            "unit": row["unit"],
            "data_kind": "official",
            "revision_id": row["revision_id"],
            "quality_flag": row["quality_flag"],
            "source_url": row["source_url"],
            "license_status": license_status,
            "market_id": None,
            "price_type": None,
            "grade": None,
            "season": None,
        })
        locations[location_id] = {
            "kind": "province",
            "nativeCode": row["area_code"],
            "name": row["province_name"],
            "provinceCode": row["area_code"],
        }
        dimensions[observation_id] = {
            "spatialSupport": "province",
            "dataKind": "official",
            "measure": row["measure"],
            "sourceYearBe": row["source_year_be"],
            "referenceYearConvention": row["reference_year_convention"],
            "regionSource": row["region_source"],
            "livestockAreaSource": row["livestock_area_source"],
            "sourceLabel": row["source_label"],
        }
    return observations, locations, dimensions


def _read_review(path: str) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DldBeefCattleAdapterError("SOURCE_YEAR_REVIEW_FILE_INVALID") from exc
    if not isinstance(value, dict):
        raise DldBeefCattleAdapterError("SOURCE_YEAR_REVIEW_FILE_INVALID")
    return value


def _request_urls(batch: Mapping[str, Any]) -> list[str]:
    # The normalizer fixes the CKAN datastore and metadata URLs; do not include
    # arbitrary redirects or caller-supplied query parameters in this list.
    return list(batch.get("request_urls") or [])


def main(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
         registry_path: str | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, fetcher=fetcher, registry_path=registry_path)
    except Exception as exc:  # noqa: BLE001 - adapter CLI reports a bounded failure object
        code = getattr(exc, "code", None) or getattr(exc, "args", [None])[0] or type(exc).__name__
        print(json.dumps({"status": "failed", "errorCode": code,
                          "message": str(exc)[:300]}, ensure_ascii=False), file=sys.stderr)
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
