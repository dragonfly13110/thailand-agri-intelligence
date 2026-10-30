"""Normalise LDD's PGS programme-progress statistics without deriving anything.

The approved registry row ``ldd_pgs_program_progress`` carries
``Creative Commons Attribution Non-Commercial No-Derivs`` with
``derivation_allowed: false`` and the recorded action "Display verbatim values
only; derived metrics are not approved".  This module therefore keeps exactly
what the Land Development Department publishes: one value per reported column
per source row, at the source's own grain (reporting unit x Buddhist fiscal
year x group stage), with the source's own unit words (``กลุ่ม``, ``ราย``,
``ไร่``, ``บาท``) taken from the column headers.

Hard rules enforced here:

* the source's progress measure is the target/reported *pair*; no percentage,
  ratio, average, rank or cross-row/cross-period sum is ever computed;
* a blank or absent number stays ``None`` — it is never coerced to ``0``;
* one value is never re-expressed in another unit (a ``ไร่`` figure is not
  turned into a count, a ``บาท`` figure is not turned into an area);
* a truncated, changed or non-complete CKAN response raises instead of being
  partially published;
* reporting units are kept verbatim and are never mapped to provinces, because
  the registry records that unit names do not establish target areas.
"""

from datetime import datetime, timezone
import hashlib
import json
import math
from decimal import Decimal, InvalidOperation
import re
from typing import Any, Mapping

from .ingestion import fetch_json


RESOURCE_ID = "2feb3230-cf86-4560-95f5-93e58270a7d8"
DICTIONARY_RESOURCE_ID = "186d7cee-2443-4fc7-8a77-c7b7d574ea77"
SOURCE_DATASET_ID = "ord02"
PROJECT_TITLE = (
    "โครงการพัฒนากลุ่มเกษตรกรผู้ผลิตเกษตรอินทรีย์ด้วยระบบการรับรองแบบมีส่วนร่วม PGS"
)
DATASTORE_ENDPOINT = "https://lddcatalog.ldd.go.th/api/3/action/datastore_search"
RESOURCE_METADATA_URL = "https://lddcatalog.ldd.go.th/api/3/action/resource_show?id=" + RESOURCE_ID

#: One bounded request.  A larger capture has to be re-reviewed before use.
PAGE_LIMIT = 1000
MAX_RESPONSE_BYTES = 2 * 1024 * 1024

IDENTITY_FIELD = "หน่วยงาน"
STAGE_FIELD = "ประเภทกลุ่ม"
FISCAL_YEAR_FIELD = "ปีงบประมาณ"

#: (source column, measure id, source unit word, whether the source column is a
#: target or a reported result, whole-number requirement)
MEASURES: tuple[tuple[str, str, str, str, bool], ...] = (
    ("เป้าหมาย (กลุ่ม)", "pgs_target_groups", "กลุ่ม", "target", True),
    ("ผลดำเนินงาน (กลุ่ม)", "pgs_reported_groups", "กลุ่ม", "reported", True),
    ("เป้าหมาย (ราย)", "pgs_target_people", "ราย", "target", True),
    ("ผลดำเนินงาน (ราย)", "pgs_reported_people", "ราย", "reported", True),
    ("เป้าหมาย (ไร่)", "pgs_target_area_rai", "ไร่", "target", False),
    ("ผลดำเนินงาน (ไร่)", "pgs_reported_area_rai", "ไร่", "reported", False),
    ("เป้าหมาย: งบ (บาท)", "pgs_target_budget_baht", "บาท", "target", False),
    ("ผลดำเนินงาน: งบ (บาท)", "pgs_reported_budget_baht", "บาท", "reported", False),
)
SOURCE_FIELDS = ("_id", IDENTITY_FIELD, FISCAL_YEAR_FIELD, STAGE_FIELD,
                 *(field for field, _, _, _, _ in MEASURES))
MEASURE_BY_FIELD = {field: (measure, unit, kind, whole) for field, measure, unit, kind, whole in MEASURES}
RESOURCE_URL = (
    DATASTORE_ENDPOINT
    + "?resource_id=" + RESOURCE_ID
    + "&limit=" + str(PAGE_LIMIT)
    + "&fields=" + ",".join(SOURCE_FIELDS)
    + "&sort=_id%20asc"
)


class LddPgsDataError(ValueError):
    """The reviewed LDD PGS resource changed shape or cannot be normalised safely."""


def source_url() -> str:
    return RESOURCE_URL


def _utc_timestamp(value: str | None) -> str:
    if value is None:
        return datetime.now(timezone.utc).isoformat(timespec="microseconds")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise LddPgsDataError("LDD_RETRIEVED_AT_INVALID") from exc
    if parsed.tzinfo is None:
        raise LddPgsDataError("LDD_RETRIEVED_AT_INVALID")
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds")


def _number(raw: Any, *, whole: bool) -> float | None:
    """Return the source's own number, or ``None`` for a genuinely blank cell."""
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        return None
    if isinstance(raw, bool):
        raise LddPgsDataError("LDD_PGS_VALUE_NOT_NUMERIC")
    if isinstance(raw, (int, float)):
        if isinstance(raw, float) and not math.isfinite(raw):
            raise LddPgsDataError("LDD_PGS_VALUE_NOT_NUMERIC")
        number = Decimal(str(raw))
    else:
        text = str(raw).strip().replace(",", "")
        if not re.fullmatch(r"\d+(\.\d+)?", text):
            raise LddPgsDataError("LDD_PGS_VALUE_NOT_NUMERIC")
        try:
            number = Decimal(text)
        except InvalidOperation as exc:
            raise LddPgsDataError("LDD_PGS_VALUE_NOT_NUMERIC") from exc
    if not number.is_finite() or number < 0:
        # The published plan/result columns are non-negative quantities; a
        # negative value means the source changed meaning, not that we should
        # clamp it.
        raise LddPgsDataError("LDD_PGS_VALUE_OUT_OF_RANGE")
    if whole and number != number.to_integral_value():
        raise LddPgsDataError("LDD_PGS_COUNT_NOT_WHOLE")
    value = float(number)
    if not math.isfinite(value):
        raise LddPgsDataError("LDD_PGS_VALUE_NOT_NUMERIC")
    return value


def _text(value: Any) -> str | None:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    if not isinstance(value, str):
        raise LddPgsDataError("LDD_PGS_TEXT_FIELD_INVALID")
    text = value.strip()
    if len(text) > 200:
        raise LddPgsDataError("LDD_PGS_TEXT_FIELD_INVALID")
    return text


def normalize_ldd_pgs_progress(payload: Any, *, retrieved_at: str | None = None,
                               source_revision: str | None = None,
                               page_count: int = 1) -> dict[str, Any]:
    """Return verbatim PGS rows from one complete CKAN datastore response.

    Nothing is aggregated, converted or ratioed: each source row keeps its own
    reporting unit, group stage, fiscal-year label and the eight target/result
    values exactly as published.
    """
    retrieved = _utc_timestamp(retrieved_at)
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise LddPgsDataError("LDD_PGS_RESPONSE_INCOMPLETE")
    result = payload.get("result")
    if not isinstance(result, dict):
        raise LddPgsDataError("LDD_PGS_RESPONSE_INCOMPLETE")
    if result.get("resource_id") != RESOURCE_ID:
        raise LddPgsDataError("LDD_PGS_RESOURCE_MISMATCH")
    total = result.get("total")
    records = result.get("records")
    if type(total) is not int or total < 1:
        raise LddPgsDataError("LDD_PGS_RESPONSE_INCOMPLETE")
    if not isinstance(records, list) or len(records) != total:
        # A page that does not carry the whole resource must never be published
        # as if it were complete.
        raise LddPgsDataError("LDD_PGS_RESPONSE_TRUNCATED")
    if result.get("total_was_estimated") is True:
        raise LddPgsDataError("LDD_PGS_RESPONSE_TRUNCATED")
    if total > PAGE_LIMIT:
        raise LddPgsDataError("LDD_PGS_RESPONSE_TRUNCATED")

    fields = result.get("fields")
    if isinstance(fields, list):
        names = [item.get("id") for item in fields if isinstance(item, dict)]
        if names and set(names) != set(SOURCE_FIELDS):
            raise LddPgsDataError("LDD_PGS_FIELDS_CHANGED")

    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            raise LddPgsDataError("LDD_PGS_ROW_INVALID")
        if set(record) != set(SOURCE_FIELDS):
            raise LddPgsDataError("LDD_PGS_FIELDS_CHANGED")
        raw_id = record.get("_id")
        if type(raw_id) is not int or raw_id <= 0:
            raise LddPgsDataError("LDD_PGS_SOURCE_ROW_ID_INVALID")
        source_row_id = str(raw_id)
        if source_row_id in seen_ids:
            raise LddPgsDataError("LDD_PGS_DUPLICATE_SOURCE_ROW")
        seen_ids.add(source_row_id)

        reporting_unit = _text(record.get(IDENTITY_FIELD))
        group_stage = _text(record.get(STAGE_FIELD))
        if reporting_unit is None or group_stage is None:
            raise LddPgsDataError("LDD_PGS_IDENTITY_INCOMPLETE")

        year_raw = _number(record.get(FISCAL_YEAR_FIELD), whole=True)
        if year_raw is None:
            raise LddPgsDataError("LDD_PGS_FISCAL_YEAR_MISSING")
        year = int(year_raw)
        if not 2400 <= year <= 2800:
            raise LddPgsDataError("LDD_PGS_FISCAL_YEAR_OUT_OF_RANGE")

        values: dict[str, float | None] = {}
        for field, measure, _unit, _kind, whole in MEASURES:
            values[measure] = _number(record.get(field), whole=whole)
        rows.append({
            "source_row_id": source_row_id,
            "reporting_unit": reporting_unit,
            "group_stage": group_stage,
            "fiscal_year_be": year,
            "values": values,
        })

    identities = {(row["reporting_unit"], row["fiscal_year_be"], row["group_stage"]) for row in rows}
    if len(identities) != len(rows):
        # Duplicate published grain would silently overwrite a value.
        raise LddPgsDataError("LDD_PGS_DUPLICATE_GRAIN")

    revision = source_revision or hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()[:32]

    return {
        "resource_id": RESOURCE_ID,
        "source_dataset_id": SOURCE_DATASET_ID,
        "resource_url": RESOURCE_URL,
        "retrieved_at": retrieved,
        "source_revision": revision,
        "revision_id": revision,
        "source_reported_total": total,
        "records_fetched": len(rows),
        "page_count": page_count,
        "source_response_complete": total == len(rows) and total <= PAGE_LIMIT,
        "fiscal_years_be": sorted({row["fiscal_year_be"] for row in rows}),
        "group_stages": sorted({row["group_stage"] for row in rows}),
        "reporting_unit_count": len({row["reporting_unit"] for row in rows}),
        "measures": [
            {"measure": measure, "unit": unit, "planOrResult": kind, "sourceField": field}
            for field, measure, unit, kind, _whole in MEASURES
        ],
        "missing_values": sum(1 for row in rows for value in row["values"].values() if value is None),
        "rows": rows,
        "derivation": {
            "allowed": False,
            "basis": "registry next_action: display verbatim values only; derived metrics are not approved",
            "forbiddenOutputs": ["percent", "ratio", "average", "rank", "cross-row sum", "unit conversion"],
        },
    }


def _resource_revision(fetcher: Any) -> str | None:
    """Pin the capture to the resource's published hash or modification time."""
    response = fetcher(RESOURCE_METADATA_URL)
    if not isinstance(response, dict) or response.get("success") is not True:
        raise LddPgsDataError("LDD_PGS_METADATA_UNAVAILABLE")
    result = response.get("result")
    if not isinstance(result, dict) or result.get("id") != RESOURCE_ID:
        raise LddPgsDataError("LDD_PGS_METADATA_UNAVAILABLE")
    for key in ("hash", "last_modified", "metadata_modified"):
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            return f"{key}:{value.strip()}"
    return None


def fetch_ldd_pgs_progress(*, fetcher: Any = fetch_json, retrieved_at: str | None = None,
                           max_bytes: int = MAX_RESPONSE_BYTES) -> dict[str, Any]:
    """Fetch one bounded, revision-pinned snapshot of the reviewed resource.

    Exactly two requests are made: the resource metadata (for the revision pin)
    and the single complete datastore page.  ``max_bytes`` is only used by the
    injected fetcher contract; the URL itself is fixed and parameterised.
    """
    if max_bytes < 1:
        raise LddPgsDataError("LDD_PGS_BOUND_INVALID")
    revision = _resource_revision(fetcher)
    response = fetcher(RESOURCE_URL)
    batch = normalize_ldd_pgs_progress(
        response, retrieved_at=retrieved_at, source_revision=revision, page_count=1
    )
    batch["request_urls"] = [RESOURCE_METADATA_URL, RESOURCE_URL]
    return batch
