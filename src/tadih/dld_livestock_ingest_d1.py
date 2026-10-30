"""Publish approved DLD livestock resources through the shared D1 writer.

Dry-run is the default. The shared approval gate in ``observations`` fails
closed for registry rows whose unresolved items are not covered by an explicit
project-owner authorization, so this adapter must be run against the real
registry before any ``--write`` is attempted.
"""

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

from .dld_livestock import (
    NATIONAL_VALUE_KEY,
    NATIONAL_VALUE_MEASURE,
    NATIONAL_VALUE_UNIT,
    PROVINCE_RESOURCES,
    fetch_dld_livestock_csv,
    fetch_dld_livestock_datastore,
    fetch_dld_national_livestock_value,
)
from .observations import (
    ObservationWriteError,
    _logical_payload_sha256,
    _prepare_batch,
    load_approved_resource,
    publish_observations,
)


ADAPTER_NAME = "dld_livestock"
ADAPTER_VERSION = "dld-livestock/1.0.0"
SOURCE_ID = "dld"
BASE_URL = "https://dld.gdcatalog.go.th"

#: observation-id prefix and display labels per approved province resource key.
PROVINCE_PUBLISHING = {
    "dld_livestock_cattle_province": {"prefix": "dld-beef-cattle", "label": "จำนวนโคเนื้อ", "species": "beef_cattle"},
    "dld_livestock_dairy_province": {"prefix": "dld-dairy-cattle", "label": "จำนวนโคนม", "species": "dairy_cattle"},
    "dld_livestock_swine_province": {"prefix": "dld-swine", "label": "จำนวนสุกร", "species": "swine"},
    "dld_livestock_poultry_province": {"prefix": "dld-poultry", "label": "จำนวนไก่", "species": "poultry"},
    "dld_livestock_duck_province": {"prefix": "dld-duck", "label": "จำนวนเป็ด", "species": "duck"},
}
NATIONAL_PUBLISHING = {"prefix": "dld-national-value", "label": "มูลค่าผลผลิตปศุสัตว์"}

SUPPORTED_RESOURCE_KEYS = (*PROVINCE_RESOURCES.keys(), NATIONAL_VALUE_KEY)


class DldLivestockAdapterError(ValueError):
    """Adapter invocation or review-manifest error."""


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih ingest --adapter dld_livestock",
        description="Fetch one approved DLD livestock resource and normalize its rows.",
    )
    result.add_argument("--resource-key", required=True, choices=SUPPORTED_RESOURCE_KEYS)
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Prepare and report the batch without writing (default).")
    mode.add_argument("--write", action="store_true", help="Publish the validated batch to D1.")
    result.add_argument("--date", help="Not supported: these resources are published by source-year label.")
    result.add_argument("--registry", help="Exact-resource registry JSON path.")
    result.add_argument(
        "--rowset-review-file",
        help="JSON review manifest for an explicitly reviewed source-row removal; write mode only.",
    )
    return result


def run(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
        reader: Any = None, registry_path: str | None = None) -> dict[str, Any]:
    """Fetch and normalize a bounded source snapshot; write only with ``--write``."""
    args = parser().parse_args(list(argv or []))
    resource_key = args.resource_key
    if args.date:
        raise DldLivestockAdapterError("--date is unsupported because the source has year labels, not dates")
    if args.rowset_review_file and not args.write:
        raise DldLivestockAdapterError("--rowset-review-file requires --write")

    # Approval is verified before contacting the source; unresolved rights
    # questions keep failing closed even though the row is approved_public.
    resource = load_approved_resource(resource_key, registry_path=registry_path or args.registry)
    batch = _fetch(resource_key, fetcher=fetcher, reader=reader)
    if resource_key == NATIONAL_VALUE_KEY:
        observations, location_overrides, row_dimensions = _adapt_national_rows(batch, resource["license_status"])
        product = "มูลค่าผลผลิตปศุสัตว์ระดับประเทศ กรมปศุสัตว์"
        metric_name = "มูลค่าผลผลิตปศุสัตว์ (ล้านบาท)"
        unit = NATIONAL_VALUE_UNIT
    else:
        observations, location_overrides, row_dimensions = _adapt_province_rows(batch, resource["license_status"])
        product = PROVINCE_PUBLISHING[resource_key]["label"] + " รายจังหวัด กรมปศุสัตว์"
        metric_name = PROVINCE_PUBLISHING[resource_key]["label"]
        unit = "ตัว"
    coverage = {
        "mode": "source_reported_rows",
        "sourceReportedRows": batch["source_reported_rows"],
        "rowsFetched": batch["records_fetched"],
        "pageCount": batch["page_count"],
        "sourceResponseComplete": batch["source_response_complete"],
        "provinceListingByYear": batch.get("province_listing_by_year", []),
        "categories": batch.get("categories", []),
    }
    dimensions_for = lambda row: row_dimensions[row["observation_id"]]
    writer_plan, quarantined = _prepare_batch(
        resource, observations, unit=unit, completeness=("complete" if batch["source_response_complete"] else "partial"),
        coverage=coverage, retrieved_at=batch["retrieved_at"], adapter_version=ADAPTER_VERSION,
        period_grain="source_year_label", locations=location_overrides,
        product=product, metric_name=metric_name, dimensions_for=dimensions_for,
    )
    if not writer_plan:
        raise ObservationWriteError("ALL_ROWS_REJECTED", "DLD snapshot produced no writer-valid rows")
    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if args.write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapterVersion": ADAPTER_VERSION,
        "resourceId": resource["resource_id"],
        "resourceKey": resource_key,
        "publicationAuthorization": resource.get("publication_authorization"),
        "sourceLicenseStatus": "unverified",
        "unresolvedSourceTerms": resource.get("unresolved", []),
        "sourceGrain": batch["source_grain"],
        "sourceYearLabelsBe": sorted({row["source_year_be"] for row in batch["rows"]}),
        "sourceYearConvention": "unverified; values remain source Buddhist-year labels",
        "observedAt": None,
        "unit": unit,
        "measure": batch["measure"],
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
        "upstreamRequests": batch["page_count"] + (1 if batch.get("delivery") == "csv" else 2),
        "upstreamRequestUrls": _request_urls(batch),
        "written": False,
    }
    if not args.write:
        return summary

    review = _read_review(args.rowset_review_file) if args.rowset_review_file else None
    if client is None:
        from .hub_catalog_sync import connect_d1_client
        client = connect_d1_client()
    catalog = _catalog(resource_key, batch)
    published = publish_observations(
        client,
        resource=resource,
        rows=observations,
        adapter_version=ADAPTER_VERSION,
        coverage=coverage,
        completeness=summary["completeness"],
        unit=unit,
        retrieved_at=batch["retrieved_at"],
        catalog=catalog,
        product=product,
        metric_name=metric_name,
        period_grain="source_year_label",
        dimensions_for=dimensions_for,
        locations=location_overrides,
        source_year_rowset_change_review=review,
    )
    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    return summary


def _fetch(resource_key, *, fetcher, reader):
    if resource_key == NATIONAL_VALUE_KEY:
        return fetch_dld_national_livestock_value() if fetcher is None else (
            fetch_dld_national_livestock_value(fetcher=fetcher))
    spec = PROVINCE_RESOURCES[resource_key]
    if spec["delivery"] == "datastore":
        return fetch_dld_livestock_datastore(resource_key) if fetcher is None else (
            fetch_dld_livestock_datastore(resource_key, fetcher=fetcher))
    return fetch_dld_livestock_csv(resource_key) if reader is None else (
        fetch_dld_livestock_csv(resource_key, reader=reader))


def _adapt_province_rows(batch, license_status):
    resource_key = batch["resource_key"]
    prefix = PROVINCE_PUBLISHING[resource_key]["prefix"]
    commodity = PROVINCE_PUBLISHING[resource_key]["species"]
    observations = []
    locations = {}
    dimensions = {}
    for row in batch["rows"]:
        observation_id = f"{prefix}:{row['source_year_be']}:{row['area_code']}"
        location_id = f"dld:province:{row['area_code']}"
        observations.append({
            "observation_id": observation_id,
            "source_id": SOURCE_ID,
            "area_code": row["area_code"],
            "spatial_support": "province",
            "location_id": location_id,
            "commodity_id": commodity,
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
            "source_url": row.get("source_url") or batch["resource_url"],
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


def _adapt_national_rows(batch, license_status):
    observations = []
    locations = {}
    dimensions = {}
    for row in batch["rows"]:
        observation_id = f"{NATIONAL_PUBLISHING['prefix']}:{row['source_year_be']}:{row['category']}"
        location_id = "dld:country:TH"
        observations.append({
            "observation_id": observation_id,
            "source_id": SOURCE_ID,
            "area_code": None,
            "spatial_support": "national",
            "location_id": location_id,
            "commodity_id": None,
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
            "source_url": batch["resource_url"],
            "license_status": license_status,
            "market_id": None,
            "price_type": None,
            "grade": None,
            "season": None,
        })
        locations[location_id] = {
            "kind": "country",
            "nativeCode": "TH",
            "name": "ประเทศไทย",
            "provinceCode": None,
        }
        dimensions[observation_id] = {
            "spatialSupport": "national",
            "dataKind": "official",
            "measure": row["measure"],
            "sourceYearBe": row["source_year_be"],
            "referenceYearConvention": row["reference_year_convention"],
            "categorySource": row["category"],
            "sourceLabel": row["source_label"],
        }
    return observations, locations, dimensions


def _catalog(resource_key, batch):
    if resource_key == NATIONAL_VALUE_KEY:
        dataset_title = "มูลค่าผลผลิตปศุสัตว์ระดับประเทศ กรมปศุสัตว์"
        grain = batch["source_grain"]
    else:
        spec = PROVINCE_RESOURCES[resource_key]
        dataset_title = PROVINCE_PUBLISHING[resource_key]["label"] + " รายจังหวัด กรมปศุสัตว์"
        grain = batch["source_grain"]
    return {
        "source_name": "Department of Livestock Development",
        "base_url": BASE_URL,
        "connector_kind": "api",
        "category": "livestock",
        "dataset_title": dataset_title,
        "dataset_description": (
            "Counts/value by DLD source and source-year label. The source year is retained as "
            "Buddhist-year text; calendar/fiscal convention is unverified."
        ),
        "resource_format": "JSON" if resource_key != NATIONAL_VALUE_KEY else "JSON",
        "grain": grain,
        "resource_url": batch["resource_url"],
    }


def _read_review(path: str) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DldLivestockAdapterError("SOURCE_YEAR_REVIEW_FILE_INVALID") from exc
    if not isinstance(value, dict):
        raise DldLivestockAdapterError("SOURCE_YEAR_REVIEW_FILE_INVALID")
    return value


def _request_urls(batch: Mapping[str, Any]) -> list[str]:
    # The normalizer fixes the CKAN datastore and metadata URLs; do not include
    # arbitrary redirects or caller-supplied query parameters in this list.
    return list(batch.get("request_urls") or [])


def main(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
         reader: Any = None, registry_path: str | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, fetcher=fetcher, reader=reader, registry_path=registry_path)
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
