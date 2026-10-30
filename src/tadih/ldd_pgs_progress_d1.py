"""Publish LDD PGS programme-progress values through the shared D1 writer.

The batch is deliberately vertical: one observation per published source column
so a target and its reported result stay two separate numbers with two separate
units.  The registry records ``derivation_allowed: false`` for this resource, so
this adapter never emits a percentage, ratio, average or aggregate measure -- the
Hub displays the published pair and lets the reader compare them.
"""

import argparse
import json
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

from .ldd_pgs_progress import (
    CANONICAL_DATASET_ID,
    PROJECT_TITLE,
    RESOURCE_ID,
    SOURCE_DATASET_ID,
    canonical_ldd_pgs_key,
    fetch_ldd_pgs_progress,
)
from .observations import (
    ObservationWriteError,
    _logical_payload_sha256,
    _prepare_batch,
    load_approved_resource,
    publish_observations,
)


ADAPTER_NAME = "ldd_pgs_progress"
ADAPTER_VERSION = "ldd-pgs-progress/1.0.0"
RESOURCE_KEY = "ldd_pgs_program_progress"
SOURCE_ID = "ldd"
BASE_URL = "https://lddcatalog.ldd.go.th"
DATASET_TITLE = "สถิติแผนและผลโครงการ PGS จำแนกตามหน่วยงาน"
RESOURCE_GRAIN = (
    "reporting unit (verbatim, source-labelled) x Buddhist fiscal-year label x "
    "PGS group stage; one value per published target/result column"
)
# ``dataset_id`` is the crawler's stable key; the CKAN ids stay on the row so it
# matches the crawled package and keeps the source identity.
CATALOG = {
    "source_name": "Land Development Department",
    "base_url": BASE_URL,
    "connector_kind": "api",
    "category": "land_use",
    "dataset_id": CANONICAL_DATASET_ID,
    "source_dataset_id": SOURCE_DATASET_ID,
    "dataset_title": DATASET_TITLE,
    "dataset_description": (
        "แผนและผลการดำเนินงานโครงการ PGS ตามหน่วยงานผู้รายงาน ต้นทางเผยแพร่ค่าเป้าหมายและ"
        "ผลที่รายงานแยกกันต่อหน่วย (กลุ่ม ราย ไร่ บาท) ไม่มีการเผยแพร่ร้อยละความก้าวหน้า"
    ),
    "dataset_source_url": BASE_URL + "/dataset/" + SOURCE_DATASET_ID,
    "resource_format": "JSON",
    "source_resource_id": RESOURCE_ID,
    "grain": RESOURCE_GRAIN,
    "attribution_url": BASE_URL + "/dataset/" + SOURCE_DATASET_ID,
}

#: measure id -> (Thai column header, unit word, plan-or-result label)
MEASURES: tuple[tuple[str, str, str, str], ...] = (
    ("pgs_target_groups", "เป้าหมาย (กลุ่ม)", "กลุ่ม", "target"),
    ("pgs_reported_groups", "ผลดำเนินงาน (กลุ่ม)", "กลุ่ม", "reported"),
    ("pgs_target_people", "เป้าหมาย (ราย)", "ราย", "target"),
    ("pgs_reported_people", "ผลดำเนินงาน (ราย)", "ราย", "reported"),
    ("pgs_target_area_rai", "เป้าหมาย (ไร่)", "ไร่", "target"),
    ("pgs_reported_area_rai", "ผลดำเนินงาน (ไร่)", "ไร่", "reported"),
    ("pgs_target_budget_baht", "เป้าหมาย: งบ (บาท)", "บาท", "target"),
    ("pgs_reported_budget_baht", "ผลดำเนินงาน: งบ (บาท)", "บาท", "reported"),
)
MEASURE_LOOKUP = {measure: (field, unit, kind) for measure, field, unit, kind in MEASURES}


class LddPgsAdapterError(ValueError):
    """Adapter invocation or review-manifest error."""


def _canonical_resource(resource: Mapping[str, Any]) -> dict[str, Any]:
    """Rewrite the registry row's CKAN ids to the D1 keys the crawler and page use."""
    canonical = dict(resource)
    try:
        canonical["dataset_id"] = canonical_ldd_pgs_key(resource["dataset_id"], kind="dataset")
        canonical["resource_id"] = canonical_ldd_pgs_key(resource["resource_id"], kind="resource")
    except (KeyError, TypeError) as exc:
        raise LddPgsAdapterError("LDD_PGS_REGISTRY_ID_MISSING") from exc
    return canonical


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih ingest --adapter ldd_pgs_progress",
        description="Fetch LDD PGS plan and reported-result values by reporting unit.",
    )
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Prepare and report the batch without writing (default).")
    mode.add_argument("--write", action="store_true", help="Publish the validated batch to D1.")
    result.add_argument("--date", help="Not supported: this resource is published by fiscal-year label.")
    result.add_argument("--registry", help="Exact-resource registry JSON path.")
    result.add_argument(
        "--rowset-review-file",
        help="JSON review manifest for an explicitly reviewed source-row removal; write mode only.",
    )
    return result


def _adapt_rows(batch: Mapping[str, Any], license_status: str):
    observations = []
    dimensions = {}
    for row in batch["rows"]:
        for measure, source_field, unit, kind in MEASURES:
            value = row["values"][measure]
            observation_id = "ldd-pgs:{}:{}".format(row["source_row_id"], measure)
            observations.append({
                "observation_id": observation_id,
                "source_id": SOURCE_ID,
                "area_code": None,
                # Reporting units are office/project labels, not administrative
                # areas; the registry records that they do not establish target
                # areas, so no province or location is claimed here.
                "spatial_support": "not_reported",
                "location_id": None,
                "commodity_id": None,
                "observed_at": None,
                "source_year_be": row["fiscal_year_be"],
                "source_row_id": row["source_row_id"],
                "release_at": None,
                "retrieved_at": batch["retrieved_at"],
                "measure": measure,
                "value": value,
                "unit": unit,
                "data_kind": "official",
                "revision_id": row.get("revision_id") or batch["revision_id"],
                "quality_flag": "missing" if value is None else "good",
                "source_url": batch["resource_url"],
                "license_status": license_status,
                "market_id": None,
                "price_type": None,
                "grade": None,
                "season": None,
            })
            dimensions[observation_id] = {
                "spatialSupport": "not_reported",
                "dataKind": "official",
                "measure": measure,
                "sourceYearBe": row["fiscal_year_be"],
                "fiscalYearBe": row["fiscal_year_be"],
                "reportingUnit": row["reporting_unit"],
                "groupStage": row["group_stage"],
                "planOrResult": kind,
                "sourceField": source_field,
                "unitSource": "source column header",
                "derivedFromSource": False,
            }
    return observations, dimensions


def run(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
        batch: Mapping[str, Any] | None = None, registry_path: str | None = None) -> dict[str, Any]:
    """Fetch and normalize one bounded snapshot; write only with ``--write``."""
    args = parser().parse_args(list(argv or []))
    if args.date:
        raise LddPgsAdapterError("--date is unsupported because the source publishes fiscal-year labels")
    if args.rowset_review_file and not args.write:
        raise LddPgsAdapterError("--rowset-review-file requires --write")

    # Approval is verified before contacting the source so a revoked resource
    # never costs a request and never reaches the writer.
    registry_row = load_approved_resource(RESOURCE_KEY, registry_path=registry_path or args.registry)
    resource = _canonical_resource(registry_row)
    if batch is None:
        batch = fetch_ldd_pgs_progress() if fetcher is None else fetch_ldd_pgs_progress(fetcher=fetcher)
    observations, row_dimensions = _adapt_rows(batch, resource["license_status"])
    coverage = {
        "mode": "source_reported_rows",
        "sourceReportedRows": batch["source_reported_total"],
        "rowsFetched": batch["records_fetched"],
        "pageCount": batch["page_count"],
        "sourceResponseComplete": batch["source_response_complete"],
        "reportingUnits": batch["reporting_unit_count"],
        "fiscalYearsBe": batch["fiscal_years_be"],
        "groupStages": batch["group_stages"],
        "spatialSupport": "not_reported",
    }
    dimensions_for = lambda row: row_dimensions[row["observation_id"]]
    completeness = "complete" if batch["source_response_complete"] else "partial"
    writer_plan, quarantined = _prepare_batch(
        resource, observations, unit=None, completeness=completeness,
        coverage=coverage, retrieved_at=batch["retrieved_at"], adapter_version=ADAPTER_VERSION,
        period_grain="source_year_label", locations={},
        product=PROJECT_TITLE, metric_name=None, dimensions_for=dimensions_for,
    )
    if not writer_plan:
        raise ObservationWriteError("ALL_ROWS_REJECTED", "LDD PGS snapshot produced no writer-valid rows")

    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if args.write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapterVersion": ADAPTER_VERSION,
        "resourceId": resource["resource_id"],
        "resourceKey": RESOURCE_KEY,
        "datasetId": resource.get("dataset_id"),
        # The register keeps the CKAN ids; D1 stores the crawler's keys above so
        # the catalog row, the numeric run and the page all name one resource.
        "sourceResourceId": registry_row["resource_id"],
        "sourceDatasetId": registry_row["dataset_id"],
        "publicationAuthorization": resource.get("publication_authorization"),
        "derivationAllowed": bool((resource.get("publication_authorization") or {}).get("derivation_allowed")),
        "sourceLicenseStatus": resource.get("license_status"),
        "unresolvedSourceTerms": resource.get("unresolved", []),
        "attributionText": resource.get("attribution_text"),
        "sourceGrain": RESOURCE_GRAIN,
        "sourceProjectTitle": PROJECT_TITLE,
        "sourceYearLabelsBe": batch["fiscal_years_be"],
        "groupStages": batch["group_stages"],
        "reportingUnits": batch["reporting_unit_count"],
        "observedAt": None,
        "measures": [
            {"measure": measure, "sourceField": field, "unit": unit, "planOrResult": kind}
            for measure, field, unit, kind in MEASURES
        ],
        "unitPolicy": "each measure keeps the unit word printed in its own source column header",
        "noDerivedMetrics": (
            "NoDerivs: only verbatim published values are stored; percentages, ratios and "
            "cross-row aggregates are not produced by this adapter"
        ),
        "dataKind": "official",
        "sourceReportedRows": batch["source_reported_total"],
        "rowsFetched": batch["records_fetched"],
        "observationsPrepared": len(observations),
        "missingValues": batch["missing_values"],
        "retrievedAt": batch["retrieved_at"],
        "sourceRevision": batch["source_revision"],
        "revisionId": batch["revision_id"],
        "payloadSha256": _logical_payload_sha256(resource["resource_id"], writer_plan),
        "writerRowsQuarantined": len(quarantined),
        "writerValidationStatus": "valid" if not quarantined else "partial",
        "quarantineReasons": sorted({item.get("reason", "UNKNOWN") for item in quarantined}),
        "wouldPassSourceBatchGate": bool(batch["source_response_complete"]) and not quarantined,
        "completeness": completeness,
        "coverage": coverage,
        "upstreamRequests": batch["page_count"] + 1,
        "upstreamRequestUrls": list(batch.get("request_urls") or [batch["resource_url"]]),
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
        completeness=completeness,
        unit=None,
        retrieved_at=batch["retrieved_at"],
        catalog=dict(CATALOG, resource_url=batch["resource_url"]),
        product=PROJECT_TITLE,
        metric_name=None,
        period_grain="source_year_label",
        dimensions_for=dimensions_for,
        locations={},
        source_year_rowset_change_review=review,
    )
    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    return summary


def _read_review(path: str) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LddPgsAdapterError("SOURCE_YEAR_REVIEW_FILE_INVALID") from exc
    if not isinstance(value, dict):
        raise LddPgsAdapterError("SOURCE_YEAR_REVIEW_FILE_INVALID")
    return value


def main(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
         batch: Mapping[str, Any] | None = None, registry_path: str | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        summary = run(argv, client=client, fetcher=fetcher, batch=batch, registry_path=registry_path)
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
