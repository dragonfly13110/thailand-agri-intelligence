"""Ingest the exact OAE/NABC monthly jasmine-paddy price into the shared D1 observations table.

This writer reuses ``tadih.observations`` unchanged and the existing ``observations``
schema (migration 0001): monthly rows carry an evidenced Gregorian ``period_start`` /
``period_end`` from the source's own Buddhist-Era year + calendar month. No new migration
is required, and the daily/monthly writer path needs neither the source-year token nor
the optional provenance extension columns.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Any, Sequence

from .oae_paddy_price import (
    DATASET_ID,
    PROVINCE_CODE,
    PROVINCE_NAME,
    PRODUCT_NAME,
    RESOURCE_ID,
    SOURCE_ID,
    SOURCE_RESOURCE_URL,
    UNIT,
    OAEPaddyPriceSnapshot,
    fetch_oae_paddy_price_snapshot,
)
from .observations import (
    ObservationWriteError,
    _logical_payload_sha256,
    _prepare_batch,
    load_approved_resource,
    publish_observations,
)


ADAPTER_NAME = "oae_paddy_price"
ADAPTER_VERSION = "oae-paddy-price/1.0.0"
RESOURCE_KEY = "oae_nabc_monthly_jasmine_paddy_price"
MEASURE = "monthly_jasmine_paddy_price"
METRIC_NAME = "ราคาที่เกษตรกรขายได้รายเดือน"
LOCATION_ID = "oae:country:TH00"
RESOURCE_GRAIN = "product x calendar month x country average"
BASE_URL = "https://agriapi.nabc.go.th"
CATALOG = {
    "source_name": "สำนักงานเศรษฐกิจการเกษตร (OAE)",
    "base_url": BASE_URL,
    "connector_kind": "api",
    "category": "prices",
    "dataset_title": PRODUCT_NAME,
    "dataset_description": (
        "ราคาที่เกษตรกรขายได้รายเดือน ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15 เฉลี่ยประเทศ จาก OAE/NABC "
        "แต่ละแถวคงเดือนตามปีพุทธศักราชและเดือนปฏิทินที่ต้นทางระบุ ไม่มีการแปลงค่าหรือเฉลี่ยเพิ่มเติม"
    ),
    "resource_format": "JSON",
    "grain": RESOURCE_GRAIN,
}


class OaePaddyPriceAdapterError(ValueError):
    """Adapter invocation or exact-resource validation failed."""


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        prog="tadih ingest --adapter oae_paddy_price",
        description="Fetch the exact NABC monthly jasmine-paddy page and store its evidenced months.",
    )
    mode = result.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Prepare only; the default mode.")
    mode.add_argument("--write", action="store_true", help="Publish the validated source page to D1.")
    result.add_argument("--date", help="Not supported: months come from the source year and month fields.")
    result.add_argument("--registry", help="Exact-resource registry JSON path.")
    return result


def run(argv: Sequence[str] | None = None, *, client: Any = None, fetcher: Any = None,
        registry_path: str | None = None) -> dict[str, Any]:
    """Fetch one bounded page, validate it, and write only with ``--write``."""
    args = parser().parse_args(list(argv or []))
    if args.date:
        raise OaePaddyPriceAdapterError("--date is unsupported because months come from the source fields")

    resource = load_approved_resource(RESOURCE_KEY, registry_path=registry_path or args.registry)
    snapshot = (
        fetch_oae_paddy_price_snapshot() if fetcher is None
        else fetch_oae_paddy_price_snapshot(opener=fetcher)
    )
    rows, row_dimensions = _adapt_snapshot(snapshot, resource["license_status"])
    retrieved_at = _iso_retrieved(snapshot)
    coverage = {
        "mode": "source_resource_pages",
        "sourceRowsReceived": len(snapshot.records),
        "upstreamTotalRows": snapshot.source_total,
        "pagesFetched": snapshot.pages_fetched,
        "pageFollowed": snapshot.pages_fetched > 1,
        "scope": "national_average",
        "periodConvention": "Gregorian calendar month from Buddhist-Era year + calendar month (CE = BE - 543)",
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
        period_grain="monthly",
        locations={LOCATION_ID: {"kind": "country", "nativeCode": PROVINCE_CODE, "name": PROVINCE_NAME}},
        product=PRODUCT_NAME,
        metric_name=METRIC_NAME,
        dimensions_for=dimensions_for,
    )
    if not writer_plan:
        raise ObservationWriteError(
            "ALL_ROWS_REJECTED", f"OAE paddy page produced no writer-valid rows: {quarantined[:3]}"
        )
    if quarantined:
        # Never publish a valid-looking subset of a single source page.
        raise ObservationWriteError(
            "OAE_PADDY_ROWS_REJECTED",
            f"writer rejected {len(quarantined)} of {len(rows)} source rows",
        )

    months = sorted({row["observed_at"][:7] for row in rows})
    summary: dict[str, Any] = {
        "status": "prepared",
        "mode": "write" if args.write else "dry_run",
        "adapter": ADAPTER_NAME,
        "adapterVersion": ADAPTER_VERSION,
        "resourceId": resource["resource_id"],
        "resourceKey": RESOURCE_KEY,
        "publicationAuthorization": resource.get("publication_authorization"),
        "sourceLicenseStatus": resource.get("license_status"),
        "commercialUseConfirmed": resource.get("commercial_use_confirmed"),
        "sourceGrain": RESOURCE_GRAIN,
        "periodConvention": "Gregorian calendar month from Buddhist-Era year + calendar month (CE = BE - 543)",
        "product": PRODUCT_NAME,
        "spatialSupport": "national",
        "locationName": PROVINCE_NAME,
        "unit": UNIT,
        "measure": MEASURE,
        "dataKind": "official",
        "sourceRowsReceived": len(snapshot.records),
        "upstreamTotalRows": snapshot.source_total,
        "pagesFetched": snapshot.pages_fetched,
        "observedMonthRange": [months[0], months[-1]] if months else [],
        "missingValues": sum(record.value is None for record in snapshot.records),
        "retrievedAt": retrieved_at,
        "contentSha256": snapshot.content_sha256,
        "sourceResourceUrl": snapshot.source_url,
        "payloadSha256": _logical_payload_sha256(resource["resource_id"], writer_plan),
        "writerValidationStatus": "valid",
        "completeness": "complete",
        "coverage": coverage,
        "upstreamRequests": 1,
        "upstreamRequestUrls": [SOURCE_RESOURCE_URL],
        "written": False,
    }
    if not args.write:
        return summary

    if client is None:
        from .hub_catalog_sync import connect_d1_client
        client = connect_d1_client()
    published = publish_observations(
        client,
        resource=resource,
        rows=rows,
        adapter_version=ADAPTER_VERSION,
        coverage=coverage,
        completeness="complete",
        unit=UNIT,
        retrieved_at=retrieved_at,
        catalog=dict(CATALOG, resource_url=snapshot.source_url),
        product=PRODUCT_NAME,
        metric_name=METRIC_NAME,
        period_grain="monthly",
        dimensions_for=dimensions_for,
        locations={LOCATION_ID: {"kind": "country", "nativeCode": PROVINCE_CODE, "name": PROVINCE_NAME}},
    )
    summary["status"] = published["status"]
    summary["written"] = True
    summary["published"] = published
    return summary


def _adapt_snapshot(snapshot: OAEPaddyPriceSnapshot, license_status: str):
    rows = []
    dimensions = {}
    retrieved_at = _iso_retrieved(snapshot)
    for record in snapshot.records:
        value = None if record.value is None else float(record.value)
        observation_id = f"oae:paddy:{record.gregorian_month}"
        row = {
            "observation_id": observation_id,
            "source_id": SOURCE_ID,
            "area_code": None,
            "spatial_support": "national",
            "location_id": LOCATION_ID,
            "commodity_id": None,
            "observed_at": f"{record.gregorian_month}-01T00:00:00Z",
            "source_row_id": f"{record.year_th}|{record.month}|{record.product_name}|{PROVINCE_CODE}",
            "release_at": None,
            "retrieved_at": retrieved_at,
            "measure": MEASURE,
            "value": value,
            "unit": record.unit,
            "data_kind": "official",
            "revision_id": f"nabc-monthly|sha256:{snapshot.content_sha256}",
            "quality_flag": "missing" if value is None else "good",
            "source_url": snapshot.source_url,
            "license_status": license_status,
            "market_id": None,
            "price_type": None,
            "grade": None,
            "season": None,
        }
        rows.append(row)
        dimensions[observation_id] = {
            "spatialSupport": "national",
            "locationKind": "country",
            "locationName": PROVINCE_NAME,
            "provinceCode": PROVINCE_CODE,
            "dataKind": "official",
            "measure": MEASURE,
            "priceUnit": record.unit,
            "sourceGrain": RESOURCE_GRAIN,
            "scope": "national_average",
            "sourceYearBuddhist": record.year_th,
            "sourceMonth": record.month,
            "sourcePeriodLabel": f"{record.month}/{record.year_th}",
            "periodConvention": "Gregorian calendar month from Buddhist-Era year + calendar month (CE = BE - 543)",
        }
    return rows, dimensions


def _iso_retrieved(snapshot: OAEPaddyPriceSnapshot) -> str:
    if snapshot.retrieved_at is None or snapshot.retrieved_at.tzinfo is None:
        raise OaePaddyPriceAdapterError("OAE paddy retrieval timestamp missing or not timezone-aware")
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
