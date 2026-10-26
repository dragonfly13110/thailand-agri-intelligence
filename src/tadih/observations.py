"""Shared fail-closed writer that publishes approved observations to Cloudflare D1.

Contract owner: Lane B (docs/assignments/2026-10-26-real-data-initiative.md §3.1-§3.2).
Every numeric adapter (CHIRPS, RID, TMD, Open-Meteo, GISTDA, ...) must write
observation rows through :func:`publish_observations` so that a single place
enforces the license gate, the canonical observation contract, the run
lifecycle and the ``resources.active_run_id`` switch.

Rules enforced here (never relaxed by CLI flags or caller arguments):

1. License gate first. The registry row handed in must be
   ``license_status == "approved_public"`` with ``project_publication_approved
   is True`` and an empty ``unresolved`` list, otherwise ``RESOURCE_NOT_APPROVED``
   is raised before the client is touched at all.
2. Every row must pass ``validate_observation`` from :mod:`tadih.quality`
   (JSON-schema contract plus runtime rules: finite values, known sources,
   province grain, chronology, no credentials in provenance URLs).
3. Forecasts never reach this table. A row is quarantined when its
   ``data_kind`` is missing, ``unknown`` or outside
   ``{observed, official, estimated}``, or when the row carries a forecast
   marker (forecast/scenario/projection/hindcast/NWP). Forecast products
   belong in the forecast/NWP tables instead.
4. Missing measurements stay ``null``; units are never invented. When neither
   the row nor the batch supplies a confirmed unit, the ``unit`` column is
   written as NULL and the row's ``quality`` JSON records
   ``unitStatus = pending_official_confirmation``.
5. Invalid rows are quarantined, never silently dropped: the run is closed as
   ``partial`` and ``records_quarantined`` plus ``quarantine_reasons`` report
   what was refused. When *every* row of a batch is refused nothing is published
   at all and the call raises ``ALL_ROWS_REJECTED`` before D1 is touched.
6. Idempotency: the run id is derived from the *logical* payload hash and the
   row key is derived from the observation id, so republishing an identical
   batch reuses the run and reports ``skipped_identical``. The logical hash
   covers only ``(resource_id, observation_id, observed_at at the run's
   period grain, unit, value)`` per row (defect D-2): volatile per-row
   ``retrieved_at`` and ``revision_id`` values (LastBuildDate/ETag churn) and
   the intra-day instant of a daily/monthly product never mint a new run —
   the GISTDA flood service echoes a per-request timeStamp as
   ``observed_at``, so day-grain rows are identified by their period start
   while point-grain runs keep the exact instant. Re-running the same logical
   day reuses the run instead of orphaning a fresh batch of rows.
   The envelope and the ``quality``/``sync_runs`` provenance still store the
   real ``revision_id``/``retrieved_at`` as-is. Limitation of the rollout:
   derived run ids change once — runs written before this rule keep their old
   ids and rows.
7. A failed run is only marked ``failed``; previously published data and the
   active run pointer are never deleted or clobbered.
8. Activation guard (defect D-9): a run whose rows mix ``NULL`` and non-NULL
   units *for the same measure* is written but never activated — the run is
   closed as ``partial`` with ``error_code``/``activation_blocked_reason``
   ``UNIT_MIXED_NULL_BATCH`` and ``resources.active_run_id`` stays untouched.
   Decision note: the intended cross-check "all-NULL batch but the registry
   documents a unit" could not be made deterministic — the registry has no
   structured unit field (units only appear inside free-text
   ``rights_facts``/``evidence``), and a text heuristic would misfire on the
   lane D TMD contract, where every batch is intentionally all-NULL until
   official confirmation (``pending_official_confirmation``). The mixed
   NULL/non-NULL rule is fully deterministic: an all-NULL batch activates, a
   batch where the same measure carries both is quarantined from activation.

Adapter contract for the ingest commands (``tadih ingest --adapter <name>``):
the module ``tadih.ingest_<name>_d1`` exposes ``main(argv: list[str], *,
client=None) -> int`` (or ``run_adapter``/``run``) and honours ``--dry-run``
(default), ``--write`` and ``--date YYYY-MM-DD``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import uuid
from typing import Any, Callable, Mapping, Sequence

from .catalog import load_resource_licenses
from .quality import timestamp, validate_observation

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REGISTRY_PATH = ROOT / "config/resource_licenses.json"

RUN_KIND = "numeric"
APPROVED_LICENSE_STATUS = "approved_public"
FINAL_STATUSES = ("succeeded", "partial")
VALID_COMPLETENESS = ("partial", "complete")
UNIT_PENDING_STATUS = "pending_official_confirmation"
RUN_ID_NAMESPACE = uuid.UUID("6f0bd2c8-1a54-5b3e-9b2f-7d0c1e4a5b63")

#: Activation guard (D-9): a run that mixes NULL and non-NULL units for one
#: measure is written but never activated; this is the stored ``error_code``
#: and the envelope ``activation_blocked_reason``.
MIXED_UNIT_ACTIVATION_REASON = "UNIT_MIXED_NULL_BATCH"

# ``data_kind`` values that may be published as observations. The contract
# schema also allows "unknown"; the writer refuses it because an observation
# of an undetermined kind could be a forecast (hard rule 4 of the programme).
PUBLISHABLE_DATA_KINDS = ("observed", "official", "estimated")

# Any of these markers inside a row means "this is a forecast/scenario".
FORECAST_MARKERS = (
    "forecast", "scenario", "projection", "projected", "hindcast", "nwp",
)

# ``validate_observation`` requires a non-empty unit string; this token is used
# only as a validation probe and is never written to D1 (the column stays NULL).
_UNIT_VALIDATION_TOKEN = "unit_pending_official_confirmation"

# D1 ``locations.kind`` / ``observations.location_kind`` enumeration.
SPATIAL_LOCATION_KIND = {
    "province": "province",
    "station": "station",
    "grid_point": "grid",
    "grid_cell": "grid",
    "national": "country",
    "reservoir": "reservoir",
}


class ObservationWriteError(RuntimeError):
    """A publication was refused or a D1 write failed; carries a stable code."""

    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or code)
        self.code = code


# Alias kept so adapters written against the earlier draft of this contract
# (``ObservationPublishError``) keep importing cleanly.
ObservationPublishError = ObservationWriteError


class _Rejected(Exception):
    """Internal marker for a single row that must not be published."""

    def __init__(self, reason: str, detail: str = ""):
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail


# Writer codes that describe a row-level problem keep their own quarantine
# reason; everything else is reported as a contract violation.
_REASON_BY_CODE = {
    "UNIT_INVALID": "UNIT_INVALID",
    "UNIT_MISMATCH": "UNIT_MISMATCH",
    "PERIOD_GRAIN_INVALID": "PERIOD_GRAIN_INVALID",
    "SPATIAL_SUPPORT_UNSUPPORTED": "LOCATION_KIND_UNSUPPORTED",
    "DIMENSIONS_INVALID": "DIMENSIONS_INVALID",
}


# ---------------------------------------------------------------------------
# License gate
# ---------------------------------------------------------------------------

def assert_resource_approved(resource: Any) -> dict[str, Any]:
    """Fail closed unless the registry row is fully approved for publication."""
    if not isinstance(resource, dict):
        raise ObservationWriteError("RESOURCE_NOT_APPROVED", "resource must be a registry object")
    if resource.get("license_status") != APPROVED_LICENSE_STATUS:
        raise ObservationWriteError("RESOURCE_NOT_APPROVED", "resource license_status is not approved_public")
    if resource.get("project_publication_approved") is not True:
        raise ObservationWriteError("RESOURCE_NOT_APPROVED", "project publication is not approved")
    unresolved = resource.get("unresolved")
    if unresolved is None or unresolved != []:
        raise ObservationWriteError("RESOURCE_NOT_APPROVED", "resource review still has unresolved items")
    resource_id = resource.get("resource_id")
    if not isinstance(resource_id, str) or not resource_id.strip():
        raise ObservationWriteError("RESOURCE_ID_MISSING", "registry row requires a non-empty resource_id")
    source_id = resource.get("source_id")
    if not isinstance(source_id, str) or not source_id.strip():
        raise ObservationWriteError("SOURCE_ID_MISSING", "registry row requires a non-empty source_id")
    return resource


def load_approved_resource(resource_key: str, *, registry_path: Path | str | None = None) -> dict[str, Any]:
    """Return the unique registry row for ``resource_key`` after the license gate."""
    if not isinstance(resource_key, str) or not resource_key.strip():
        raise ObservationWriteError("RESOURCE_KEY_MISSING", "resource_key must be a non-empty string")
    rows = load_resource_licenses(registry_path or DEFAULT_REGISTRY_PATH)
    matches = [row for row in rows if row.get("resource_key") == resource_key]
    if len(matches) != 1:
        raise ObservationWriteError("RESOURCE_APPROVAL_MISSING", "registry must contain the resource exactly once")
    return assert_resource_approved(matches[0])


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------

def publish_observations(
    client: Any,
    *,
    resource: dict,
    rows: list[dict],
    adapter_version: str,
    coverage: dict,
    completeness: str,
    unit: str | None,
    retrieved_at: str,
    run_id: str | None = None,
    catalog: Mapping[str, Any] | None = None,
    product: str | None = None,
    metric_name: str | None = None,
    period_grain: str | None = None,
    dimensions_for: Callable[[dict], dict] | None = None,
    locations: Mapping[str, Mapping[str, Any]] | None = None,
    require_d1_approval: bool = True,
) -> dict:
    """Stage ``rows`` as one numeric run and activate it only when approved.

    The keyword-only arguments above ``catalog`` are the shared contract
    (assignment §3.2). The remaining keyword-only arguments are optional
    adapter refinements with safe defaults:

    ``catalog``
        D1 catalog values for the source/dataset/resource rows (source name,
        base URL, dataset title, grain, metadata JSON...). The upsert never
        rewrites ``resources.access_status`` or
        ``resources.project_publication_approved``, so a revocation applied in
        D1 survives every later sync and keeps blocking publication.
    ``product``/``metric_name``/``period_grain``/``dimensions_for``/``locations``
        control how canonical fields map onto the D1 ``observations`` columns.
    ``require_d1_approval``
        keeps the second gate against the D1 ``resources`` row (the published
        state readers actually serve from).

    Returns the run envelope: ``run_id``, ``status``, ``resource_id``,
    ``source_id``, ``completeness``, ``coverage``, ``records_read``,
    ``records_written``, ``records_inserted``, ``records_skipped``,
    ``records_quarantined``, ``quarantine_reasons``, ``skipped_identical``,
    ``locations_written``, ``active_run_switched``, ``activation_blocked_reason``,
    ``revision_id``, ``payload_sha256``, ``adapter_version``, ``retrieved_at``,
    ``started_at``, ``completed_at``.
    """
    assert_resource_approved(resource)  # gate first: nothing is written before this passes
    resource_id = resource["resource_id"]
    source_id = resource["source_id"]

    started_at = _now()
    plan, quarantined = _prepare_batch(
        resource, rows, unit=unit, completeness=completeness, coverage=coverage,
        retrieved_at=retrieved_at, adapter_version=adapter_version,
        period_grain=period_grain, locations=locations,
        product=product, metric_name=metric_name, dimensions_for=dimensions_for,
    )
    if not plan:
        # Fail closed: a batch whose rows are all rejected publishes nothing.
        raise ObservationWriteError(
            "ALL_ROWS_REJECTED",
            f"no row passed the observation contract: {_reason_counts(quarantined)}",
        )
    payload_sha256 = _logical_payload_sha256(resource_id, plan)
    derived_run_id = run_id or str(uuid.uuid5(
        RUN_ID_NAMESPACE, f"{resource_id}|{adapter_version}|{payload_sha256}",
    ))
    # Activation guard (D-9): rows are still written, but a run that mixes
    # NULL and non-NULL units for one measure never becomes the active run.
    activation_guard = _activation_unit_guard(plan)
    # A run is only 'succeeded' when the batch was complete and nothing was
    # quarantined; everything else stays 'partial' and is published as such.
    # A guarded batch is forced to 'partial' even if every row passed.
    final_status = (
        "partial" if activation_guard
        else ("succeeded" if (completeness == "complete" and not quarantined) else "partial")
    )
    revision_id = plan[0]["observation"]["revision_id"] if plan else None
    quarantine_reasons = _reason_counts(quarantined)

    # The resource row (and its source/dataset rows) must exist before the
    # resource can be approved in D1.
    register_resource(client, resource=resource, **dict(catalog or {}))

    if require_d1_approval:
        approval = client.execute(
            "SELECT resource_id FROM resources WHERE resource_id=? "
            "AND access_status='approved_public' AND project_publication_approved=1",
            [resource_id],
        )
        if not _returned(approval, "resource_id", resource_id):
            raise ObservationWriteError("RESOURCE_PUBLICATION_NOT_APPROVED")

    existing = client.execute(
        "SELECT run_id, status, payload_sha256 FROM sync_runs WHERE run_id=? AND resource_id=?",
        [derived_run_id, resource_id],
    )
    existing_row = _first_row(existing)
    if existing_row is not None and existing_row.get("payload_sha256") == payload_sha256 \
            and existing_row.get("status") in FINAL_STATUSES:
        stored = _row_count(client, derived_run_id, resource_id)
        if stored >= len(plan):
            return _finish_existing_run(
                client, resource_id=resource_id, run_id=derived_run_id, status=existing_row["status"],
                plan=plan, payload_sha256=payload_sha256, coverage=coverage, completeness=completeness,
                adapter_version=adapter_version, retrieved_at=retrieved_at, revision_id=revision_id,
                skipped_identical=len(plan), records_written=stored,
                records_quarantined=len(quarantined), quarantine_reasons=quarantine_reasons,
                require_d1_approval=require_d1_approval, activation_guard=activation_guard,
            )
    if existing_row is not None:
        # Resuming a run that failed or never completed: the identical rows are
        # re-upserted, existing rows are never deleted.
        client.execute(
            "UPDATE sync_runs SET status='running', error_code=NULL, started_at=?, adapter_version=? "
            "WHERE run_id=? AND resource_id=?",
            [_iso(started_at), adapter_version, derived_run_id, resource_id],
        )
    else:
        client.execute(
            "INSERT INTO sync_runs (run_id, source_id, resource_id, kind, status, started_at, adapter_version) "
            "VALUES (?, ?, ?, ?, 'running', ?, ?)",
            [derived_run_id, source_id, resource_id, RUN_KIND, _iso(started_at), adapter_version],
        )

    extended = _extended_columns(client)
    inserted = 0
    skipped = 0
    try:
        for entry in plan:
            _upsert_location(client, entry)
            if _row_matches(client, resource_id, derived_run_id, entry):
                skipped += 1
                continue
            client.execute(*_observation_statement(derived_run_id, resource_id, entry, extended))
            inserted += 1
        records_written = _row_count(client, derived_run_id, resource_id)
        completed_at = _now()
        result = client.execute(
            "UPDATE sync_runs SET status=?, completed_at=?, source_retrieved_at=?, "
            "records_read=?, records_written=?, records_quarantined=?, payload_sha256=?, error_code=? "
            "WHERE run_id=? AND resource_id=? AND status='running' RETURNING run_id",
            [final_status, _iso(completed_at), _iso(_utc(retrieved_at)), len(rows), records_written,
             len(quarantined), payload_sha256, activation_guard, derived_run_id, resource_id],
        )
        if not _returned(result, "run_id", derived_run_id):
            raise ObservationWriteError("RUN_COMPLETION_FAILED")
    except ObservationWriteError:
        _mark_failed(client, derived_run_id, "RUN_COMPLETION_FAILED")
        raise
    except Exception as exc:
        _mark_failed(client, derived_run_id, "NUMERIC_WRITE_FAILED")
        raise ObservationWriteError("NUMERIC_WRITE_FAILED") from exc

    active_run_switched = _switch_active_run(
        client, resource_id=resource_id, run_id=derived_run_id, status=final_status,
        enabled=require_d1_approval and records_written > 0 and activation_guard is None,
    )
    return {
        "resource_id": resource_id,
        "source_id": source_id,
        "run_id": derived_run_id,
        "status": final_status,
        "completeness": completeness,
        "coverage": coverage,
        "records_read": len(rows),
        "records_written": records_written,
        "records_inserted": inserted,
        "records_skipped": skipped,
        "records_quarantined": len(quarantined),
        "quarantine_reasons": quarantine_reasons,
        "skipped_identical": skipped,
        "locations_written": len({entry["location"]["location_id"] for entry in plan}),
        "active_run_switched": active_run_switched,
        "activation_blocked_reason": activation_guard,
        "revision_id": revision_id,
        "payload_sha256": payload_sha256,
        "adapter_version": adapter_version,
        "retrieved_at": _iso(_utc(retrieved_at)),
        "started_at": _iso(started_at),
        "completed_at": _iso(completed_at),
    }


def _finish_existing_run(
    client, *, resource_id, run_id, status, plan, payload_sha256, coverage, completeness,
    adapter_version, retrieved_at, revision_id, skipped_identical, records_written,
    records_quarantined, quarantine_reasons, require_d1_approval, activation_guard=None,
) -> dict:
    """Reuse an identical published run instead of writing the same rows twice."""
    active_run_switched = _switch_active_run(
        client, resource_id=resource_id, run_id=run_id, status=status,
        enabled=require_d1_approval and records_written > 0 and activation_guard is None,
    )
    return {
        "resource_id": resource_id,
        "source_id": plan[0]["observation"]["source_id"] if plan else None,
        "run_id": run_id,
        "status": status,
        "completeness": completeness,
        "coverage": coverage,
        "records_read": skipped_identical + records_quarantined,
        "records_written": records_written,
        "records_inserted": 0,
        "records_skipped": skipped_identical,
        "records_quarantined": records_quarantined,
        "quarantine_reasons": quarantine_reasons,
        "skipped_identical": skipped_identical,
        "locations_written": 0,
        "active_run_switched": active_run_switched,
        "activation_blocked_reason": activation_guard,
        "revision_id": revision_id,
        "payload_sha256": payload_sha256,
        "adapter_version": adapter_version,
        "retrieved_at": _iso(_utc(retrieved_at)),
        "started_at": None,
        "completed_at": None,
    }


def _switch_active_run(client, *, resource_id, run_id, status, enabled) -> bool:
    """Point the resource at this run only while the resource stays approved.

    A revoked ``resources`` row keeps its previous pointer and the caller gets
    ``ACTIVE_RUN_SWITCH_FAILED``; published rows and the old active run are
    never deleted.
    """
    if not enabled:
        return False
    try:
        result = client.execute(
            "UPDATE resources SET active_run_id=? WHERE resource_id=? "
            "AND access_status='approved_public' AND project_publication_approved=1 "
            "AND EXISTS (SELECT 1 FROM sync_runs WHERE run_id=? AND resource_id=? AND status=?) "
            "RETURNING active_run_id",
            [run_id, resource_id, run_id, resource_id, status],
        )
    except Exception as exc:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED") from exc
    if not _returned(result, "active_run_id", run_id):
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED")
    return True


# ---------------------------------------------------------------------------
# Batch preparation
# ---------------------------------------------------------------------------

def _prepare_batch(
    resource, rows, *, unit, completeness, coverage, retrieved_at, adapter_version,
    period_grain, locations, product, metric_name, dimensions_for,
) -> tuple[list[dict], list[dict]]:
    """Split a batch into publishable rows and quarantined rows.

    Batch-level problems (missing adapter version, unknown completeness, an
    empty batch, ...) raise before anything is written to D1. Row-level
    problems quarantine that single row: the row is never published, the run
    is closed as ``partial`` and ``records_quarantined``/``quarantine_reasons``
    report what was refused.
    """
    if not isinstance(adapter_version, str) or not adapter_version.strip():
        raise ObservationWriteError("ADAPTER_VERSION_MISSING")
    if completeness not in VALID_COMPLETENESS:
        raise ObservationWriteError("COMPLETENESS_MISSING_OR_UNKNOWN")
    if not isinstance(coverage, dict) or not isinstance(coverage.get("mode"), str) or not coverage["mode"].strip():
        raise ObservationWriteError("COVERAGE_INVALID")
    if unit is not None and (not isinstance(unit, str) or not unit.strip()):
        raise ObservationWriteError("UNIT_INVALID")
    if not isinstance(retrieved_at, str) or not retrieved_at:
        raise ObservationWriteError("RETRIEVAL_TIME_MISSING")
    retrieved = _utc(retrieved_at)
    if not isinstance(rows, list) or not rows:
        raise ObservationWriteError("NO_OBSERVATIONS")
    if len(rows) > 100_000:
        raise ObservationWriteError("BATCH_TOO_LARGE")

    source_id = resource["source_id"]
    resource_license = resource.get("license_status")
    overrides = locations if isinstance(locations, Mapping) else {}
    seen_ids: set[str] = set()
    units_by_measure: dict[str, str] = {}
    plan: list[dict] = []
    quarantined: list[dict] = []
    for index, raw in enumerate(rows):
        try:
            entry = _plan_row(
                raw,
                resource=resource,
                source_id=source_id, resource_license=resource_license, unit=unit,
                retrieved=retrieved, retrieved_at=retrieved_at, period_grain=period_grain,
                locations=overrides, product=product, metric_name=metric_name,
                dimensions_for=dimensions_for, seen_ids=seen_ids,
                units_by_measure=units_by_measure,
            )
        except _Rejected as exc:
            quarantined.append({"index": index, "reason": exc.reason, "detail": exc.detail})
            continue
        except ObservationWriteError as exc:
            # Row-level mapping problems (unsupported spatial support, a bad
            # period grain, mixed units...) refuse that row only.
            quarantined.append({
                "index": index,
                "reason": _REASON_BY_CODE.get(exc.code, "CONTRACT_INVALID"),
                "detail": str(exc),
            })
            continue
        seen_ids.add(entry["observation"]["observation_id"])
        plan.append(entry)
    return plan, quarantined


def _plan_row(
    raw, *, resource, source_id, resource_license, unit, retrieved, retrieved_at, period_grain,
    locations, product, metric_name, dimensions_for, seen_ids, units_by_measure,
) -> dict:
    """Validate one row and map it onto the D1 observation columns."""
    if not isinstance(raw, dict):
        raise _Rejected("CONTRACT_INVALID", "row must be an object")
    data_kind = raw.get("data_kind")
    if _has_forecast_marker(raw):
        raise _Rejected(
            "FORECAST_REFUSED",
            "forecast/scenario rows must be stored outside the observations table")
    if not isinstance(data_kind, str) or data_kind not in PUBLISHABLE_DATA_KINDS:
        raise _Rejected(
            "DATA_KIND_UNSUPPORTED",
            f"data_kind {data_kind!r} is not publishable as an observation")
    try:
        effective_unit = _effective_unit(raw, unit)
        observation = _validate_row(raw, effective_unit)
    except ObservationWriteError as exc:
        raise _Rejected(_REASON_BY_CODE.get(exc.code, "CONTRACT_INVALID"), str(exc)) from exc
    if observation["source_id"] != source_id:
        raise _Rejected(
            "SOURCE_MISMATCH",
            f"row source {observation['source_id']!r} differs from the resource source")
    if observation["license_status"] != resource_license:
        raise _Rejected(
            "LICENSE_STATUS_MISMATCH",
            f"row license {observation['license_status']!r} differs from the approved resource")
    if observation["retrieved_at"] != retrieved_at and _utc(observation["retrieved_at"]) > retrieved:
        raise _Rejected("RETRIEVAL_AFTER_BATCH", "the row was retrieved after the batch")
    observation_id = observation["observation_id"]
    if observation_id in seen_ids:
        raise _Rejected(
            "DUPLICATE_ROW_KEY", f"observation {observation_id!r} appears twice in the batch")
    measure = observation["measure"]
    previous_unit = units_by_measure.setdefault(measure, effective_unit)
    if effective_unit is not None and previous_unit is not None and effective_unit != previous_unit:
        raise _Rejected("UNIT_MISMATCH", "one batch must not mix units for one measure")
    flag = observation["quality_flag"]
    if flag not in ("good", "missing") or (observation["value"] is None) != (flag == "missing"):
        raise _Rejected(
            "QUALITY_FLAG_MISMATCH",
            "quality_flag must be 'good' or 'missing' and must match the missing value")

    grain = period_grain or _infer_grain(observation["observed_at"])
    if grain not in ("daily", "monthly", "point"):
        raise ObservationWriteError("PERIOD_GRAIN_INVALID")
    period_start, period_end, period_label = _period(observation["observed_at"], grain)
    series_key = ":".join([
        measure, grain, observation["spatial_support"], effective_unit or _UNIT_VALIDATION_TOKEN,
    ])
    location = _location(source_id, observation, locations.get(observation["location_id"]))
    dimensions = _dimensions(observation, effective_unit, dimensions_for)
    quality = _quality(observation, effective_unit)
    return {
        "observation": observation,
        "location": location,
        "series_key": series_key,
        "period": (period_start, period_end, period_label),
        "product": product if product is not None else resource.get("name"),
        "metric_name": metric_name or _default_metric_name(measure),
        "unit": effective_unit,
        "dimensions": _json(dimensions),
        "quality": _json(quality),
        "provenance": (
            observation["data_kind"], observation["quality_flag"], observation["license_status"],
            observation["source_url"], observation["release_at"], observation["revision_id"],
        ),
    }


def _has_forecast_marker(row: Mapping[str, Any]) -> bool:
    """True when a row looks like a forecast/scenario instead of an observation."""
    for key in ("data_kind", "measure", "series_key", "metric_id", "product"):
        value = row.get(key)
        if isinstance(value, str) and any(marker in value.lower() for marker in FORECAST_MARKERS):
            return True
    for key, value in row.items():
        if "forecast" in key.lower() and value:
            return True
    return False


# ``db/cloudflare/0001_hub.sql`` already holds every grain this program needs;
# migration 0002 only lifts provenance fields out of the ``quality`` JSON so
# readers and auditors can filter them directly. The writer probes for those
# columns once per run, so it works with or without the migration applied.
_BASE_OBSERVATION_COLUMNS = (
    "resource_id", "run_id", "row_key", "series_key", "period_start", "period_end", "period_label",
    "location_id", "location_code", "location_kind", "location_name", "province_code", "crop_code",
    "metric_id", "metric_name", "product", "grade", "market", "unit", "value", "dimensions",
    "source_row_ref", "quality_status", "quality",
)
_EXTENSION_OBSERVATION_COLUMNS = (
    "data_kind", "quality_flag", "license_status", "source_url", "release_at", "revision_id",
)
_KEY_COLUMNS = ("resource_id", "run_id", "row_key")
_EXTENSION_PROBE_SQL = (
    "SELECT data_kind, quality_flag, license_status, source_url, release_at, revision_id "
    "FROM observations WHERE 0=1"
)
_OBSERVATION_SQL_CACHE: dict[tuple, str] = {}


def _observation_sql(columns: tuple) -> str:
    cached = _OBSERVATION_SQL_CACHE.get(columns)
    if cached is not None:
        return cached
    updates = ", ".join(f"{column}=excluded.{column}" for column in columns if column not in _KEY_COLUMNS)
    sql = (
        "INSERT INTO observations (" + ", ".join(columns) + ") "
        + "VALUES (" + ", ".join("?" for _ in columns) + ") "
        + "ON CONFLICT(" + ", ".join(_KEY_COLUMNS) + ") DO UPDATE SET " + updates
    )
    _OBSERVATION_SQL_CACHE[columns] = sql
    return sql


def _extended_columns(client) -> tuple:
    """Return the optional provenance columns this D1 database already has."""
    try:
        client.execute(_EXTENSION_PROBE_SQL, [])
    except Exception:
        return ()
    return _EXTENSION_OBSERVATION_COLUMNS


def _observation_statement(run_id: str, resource_id: str, entry: dict,
                           extended: tuple = ()) -> tuple[str, list]:
    observation = entry["observation"]
    location = entry["location"]
    period_start, period_end, period_label = entry["period"]
    values = [
        resource_id, run_id, observation["observation_id"], entry["series_key"],
        period_start, period_end, period_label,
        location["location_id"], location["location_id"], location["kind"], location["name"],
        observation["area_code"], None,
        observation["measure"], entry["metric_name"], entry["product"],
        observation["grade"], observation["market_id"],
        entry["unit"], observation["value"],
        entry["dimensions"], observation["observation_id"], observation["quality_flag"], entry["quality"],
    ]
    if extended:
        values.extend(entry["provenance"])
    return _observation_sql(_BASE_OBSERVATION_COLUMNS + extended), values


def _validate_row(raw: dict, effective_unit: str | None) -> dict:
    try:
        probe = dict(raw)
        probe["unit"] = effective_unit if effective_unit is not None else _UNIT_VALIDATION_TOKEN
        validated = validate_observation(probe)
    except (TypeError, ValueError) as exc:
        raise ObservationWriteError("OBSERVATION_INVALID", str(exc)) from exc
    validated["unit"] = effective_unit
    return validated


def _effective_unit(row: dict, batch_unit: str | None) -> str | None:
    own = row.get("unit")
    if own is not None and (not isinstance(own, str) or not own.strip()):
        raise ObservationWriteError("UNIT_INVALID")
    if own and batch_unit and own != batch_unit:
        raise ObservationWriteError("UNIT_MISMATCH")
    return own or batch_unit


def _location(source_id: str, observation: dict, override: Mapping[str, Any] | None) -> dict:
    spatial = observation["spatial_support"]
    kind = SPATIAL_LOCATION_KIND.get(spatial)
    if kind is None:
        raise ObservationWriteError("SPATIAL_SUPPORT_UNSUPPORTED")
    override = override or {}
    return {
        "location_id": observation["location_id"],
        "source_id": source_id,
        "kind": override.get("kind") or kind,
        "native_code": override.get("nativeCode") or observation["location_id"],
        "name": override.get("name") or observation["location_id"],
        "province_code": override.get("provinceCode", observation["area_code"]),
    }


def _dimensions(observation: dict, effective_unit: str | None,
                dimensions_for: Callable[[dict], dict] | None) -> dict:
    if dimensions_for is not None:
        custom = dimensions_for(observation)
        if not isinstance(custom, dict):
            raise ObservationWriteError("DIMENSIONS_INVALID")
        return custom
    dimensions = {
        "spatialSupport": observation["spatial_support"],
        "dataKind": observation["data_kind"],
        "measure": observation["measure"],
    }
    if observation["area_code"] is not None:
        dimensions["areaCode"] = observation["area_code"]
    if observation["commodity_id"] is not None:
        dimensions["commodityId"] = observation["commodity_id"]
    if observation["release_at"] is not None:
        dimensions["releaseAt"] = observation["release_at"]
    if observation["price_type"] is not None:
        dimensions["priceType"] = observation["price_type"]
    if observation["season"] is not None:
        dimensions["season"] = observation["season"]
    if effective_unit is None:
        dimensions["unitStatus"] = UNIT_PENDING_STATUS
    return dimensions


def _quality(observation: dict, effective_unit: str | None) -> dict:
    quality = {
        "revisionId": observation["revision_id"],
        "sourceUrl": observation["source_url"],
        "licenseStatus": observation["license_status"],
        "qualityFlag": observation["quality_flag"],
    }
    if effective_unit is None:
        quality["unitStatus"] = UNIT_PENDING_STATUS
    return quality


def _default_metric_name(measure: str) -> str:
    return " ".join(part.capitalize() for part in measure.replace("-", "_").split("_"))


def _infer_grain(observed_at: str) -> str:
    parsed = _utc(observed_at)
    return "daily" if (parsed.hour, parsed.minute, parsed.second, parsed.microsecond) == (0, 0, 0, 0) else "point"


def _period(observed_at: str, grain: str) -> tuple[str, str, str]:
    parsed = _utc(observed_at)
    if grain == "daily":
        day = parsed.date().isoformat()
        return day, day, day
    if grain == "monthly":
        first = parsed.date().replace(day=1)
        last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return first.isoformat(), last.isoformat(), first.isoformat()[:7]
    instant = _iso(parsed)
    return instant, instant, instant


# ---------------------------------------------------------------------------
# Resource registration (sources / datasets / resources)
# ---------------------------------------------------------------------------

def register_resource(
    client: Any,
    *,
    resource: dict,
    source_name: str | None = None,
    base_url: str | None = None,
    connector_kind: str = "api",
    source_status: str = "enabled",
    source_metadata_access_status: str = "approved_public",
    dataset_id: str | None = None,
    source_dataset_id: str | None = None,
    dataset_title: str | None = None,
    dataset_description: str = "",
    dataset_category: str | None = None,
    category: str | None = None,
    dataset_owner: str | None = None,
    dataset_source_url: str | None = None,
    dataset_metadata_access_status: str = "approved_public",
    dataset_metadata: dict | None = None,
    resource_format: str | None = None,
    resource_url: str | None = None,
    source_resource_id: str | None = None,
    grain: str | None = None,
    source_updated_at: str | None = None,
    metadata: dict | None = None,
    attribution_url: str | None = None,
) -> dict:
    """Idempotently register an approved registry row as catalog rows in D1.

    The license gate runs first, so this helper can only ever publish
    ``approved_public`` state into ``resources.access_status``. The upsert
    never rewrites ``access_status``/``project_publication_approved`` on
    conflict: a revocation applied by governance survives every later sync
    and keeps blocking publication.

    ``category`` is accepted as an alias for ``dataset_category``.
    """
    assert_resource_approved(resource)
    dataset_category = dataset_category or category
    source_id = resource["source_id"]
    resource_id = resource["resource_id"]
    resource_key = resource.get("resource_key") or resource_id
    license_info = resource.get("declared_license") or {}

    source_name = source_name or resource.get("name") or source_id
    base_url = base_url or resource.get("resource_url") or resource_id
    dataset_id = dataset_id or resource.get("dataset_id") or f"{source_id}:{resource_key}"
    source_dataset_id = source_dataset_id or dataset_id
    dataset_title = dataset_title or resource.get("name") or dataset_id
    dataset_source_url = dataset_source_url or base_url
    dataset_owner = dataset_owner or source_name
    resource_url = resource_url or resource.get("resource_url") or resource_id
    source_resource_id = source_resource_id or resource_id
    resource_name = resource.get("name") or resource_id
    if source_updated_at is None:
        source_updated_at = _source_updated_at((resource.get("access_evidence") or {}).get("last_modified"))

    metadata = metadata if isinstance(metadata, dict) else {}
    metadata = {
        **metadata,
        "resourceKey": resource.get("resource_key"),
        "attribution": resource.get("attribution_text"),
        "attributionUrl": attribution_url or resource.get("attribution_url"),
        "completeness": metadata.get("completeness", "unknown"),
    }
    dataset_metadata = dataset_metadata if isinstance(dataset_metadata, dict) else {}

    client.execute(
        "INSERT INTO sources (source_id, source_name, base_url, connector_kind, status, metadata_access_status) "
        "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_id) DO NOTHING",
        [source_id, source_name, base_url, connector_kind, source_status, source_metadata_access_status],
    )
    client.execute(
        "INSERT INTO datasets (dataset_id, source_id, source_dataset_id, title, description, category, owner, "
        "source_url, metadata_access_status, metadata) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(source_id, source_dataset_id) DO NOTHING",
        [dataset_id, source_id, source_dataset_id, dataset_title, dataset_description, dataset_category,
         dataset_owner, dataset_source_url, dataset_metadata_access_status, _json(dataset_metadata)],
    )
    # The dataset row may already exist under a different dataset_id; the
    # resources row must point at the row that really exists.
    stored_dataset = client.execute(
        "SELECT dataset_id FROM datasets WHERE source_id=? AND source_dataset_id=?",
        [source_id, source_dataset_id],
    )
    dataset_row = _first_row(stored_dataset)
    if dataset_row and isinstance(dataset_row.get("dataset_id"), str):
        dataset_id = dataset_row["dataset_id"]

    client.execute(
        "INSERT INTO resources (resource_id, dataset_id, source_resource_id, name, format, resource_url, "
        "access_status, declared_license, license_url, project_publication_approved, grain, source_updated_at, "
        "metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(resource_id) DO NOTHING",
        [resource_id, dataset_id, source_resource_id, resource_name, resource_format, resource_url,
         resource.get("license_status"), license_info.get("license_id"), license_info.get("license_url"),
         1 if resource.get("project_publication_approved") else 0, grain, source_updated_at,
         _json(metadata)],
    )
    return {"resource_id": resource_id, "dataset_id": dataset_id, "source_id": source_id}


# ---------------------------------------------------------------------------
# Shared low-level helpers
# ---------------------------------------------------------------------------

def payload_sha256(rows: Sequence[dict]) -> str:
    """Stable content hash of a batch of canonical observation rows."""
    return hashlib.sha256(json.dumps(
        list(rows), sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")).hexdigest()


_payload_hash = payload_sha256


def _logical_payload_sha256(resource_id: str, plan: Sequence[Mapping[str, Any]]) -> str:
    """Hash the *logical* batch for run-id derivation (defect D-2).

    Only the durable identity of each observation takes part:
    ``(resource_id, observation_id, observed_at at the run's period grain,
    unit, value)``. Volatile per-row fields (``retrieved_at`` and provider
    ``revision_id`` values such as a LastBuildDate ETag) are excluded on
    purpose so that re-running the same logical day derives the same run id
    and reports ``skipped_identical`` instead of minting a new run and
    orphaning the previous rows. ``observed_at`` participates at the batch's
    declared grain: a daily/monthly product is identified by its period
    (period start), because some providers — the GISTDA flood service is the
    live example — echo a per-request timestamp into ``observed_at`` and an
    instant-level comparison would keep churning runs for an unchanged day.
    Point-grain runs keep the raw instant (their period start is the exact
    ``observed_at``), so genuinely different measurements still derive
    different runs. The rows still store their real ``retrieved_at``/
    ``revision_id``/``observed_at`` provenance as-is.
    """
    logical = sorted(
        _json([
            resource_id,
            entry["observation"]["observation_id"],
            entry["period"][0],
            entry["unit"],
            entry["observation"]["value"],
        ])
        for entry in plan
    )
    return hashlib.sha256(_json(logical).encode("utf-8")).hexdigest()


def _activation_unit_guard(plan: Sequence[Mapping[str, Any]]) -> str | None:
    """Return the activation-block reason for a run that mixes NULL units.

    Deterministic rule (module docstring rule 8, defect D-9): when the planned
    rows of one run carry both ``NULL`` and non-``NULL`` units for the same
    measure, the writer must not point ``resources.active_run_id`` at that
    run. All-NULL batches (lane D TMD, ``pending_official_confirmation``) and
    fully non-NULL batches activate normally.
    """
    units_by_measure: dict[str, set] = {}
    for entry in plan:
        units_by_measure.setdefault(entry["observation"]["measure"], set()).add(entry["unit"])
    for units in units_by_measure.values():
        if None in units and len(units) > 1:
            return MIXED_UNIT_ACTIVATION_REASON
    return None


def _upsert_location(client, entry: dict) -> None:
    location = entry["location"]
    client.execute(
        "INSERT INTO locations (location_id, source_id, kind, native_code, name, province_code) "
        "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_id, kind, native_code) DO UPDATE SET "
        "name=excluded.name, province_code=COALESCE(excluded.province_code, locations.province_code)",
        [location["location_id"], location["source_id"], location["kind"],
         location["native_code"], location["name"], location["province_code"]],
    )


def _row_matches(client, resource_id: str, run_id: str, entry: dict) -> bool:
    """True when the run already stores exactly this row (idempotent re-run)."""
    result = client.execute(
        "SELECT value, unit, dimensions, quality FROM observations "
        "WHERE resource_id=? AND run_id=? AND row_key=?",
        [resource_id, run_id, entry["observation"]["observation_id"]],
    )
    row = _first_row(result)
    if row is None:
        return False
    return (
        row.get("value") == entry["observation"]["value"]
        and row.get("unit") == entry["unit"]
        and row.get("dimensions") == entry["dimensions"]
        and row.get("quality") == entry["quality"]
    )


def _row_count(client, run_id: str, resource_id: str) -> int:
    result = client.execute(
        "SELECT count(*) AS total FROM observations WHERE resource_id=? AND run_id=?",
        [resource_id, run_id],
    )
    row = _first_row(result)
    try:
        return int(row["total"]) if row else 0
    except (KeyError, TypeError, ValueError):
        return 0


def _mark_failed(client, run_id: str, error_code: str = "NUMERIC_WRITE_FAILED") -> None:
    try:
        client.execute(
            "UPDATE sync_runs SET status='failed', completed_at=?, error_code=? "
            "WHERE run_id=? AND status='running'",
            [_iso(_now()), error_code, run_id],
        )
    except Exception:
        # The original write failure matters most; the old active run is untouched.
        pass


def _reason_counts(quarantined: Sequence[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in quarantined:
        reason = item["reason"]
        counts[reason] = counts.get(reason, 0) + 1
    return counts


def _first_row(result: Any) -> dict | None:
    if not isinstance(result, dict):
        return None
    rows = result.get("results")
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return rows[0]
    return None


def _returned(result: Any, field: str, value: Any) -> bool:
    rows = result.get("results") if isinstance(result, dict) else None
    return isinstance(rows, list) and any(
        isinstance(row, dict) and row.get(field) == value for row in rows
    )


def _source_updated_at(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return _iso(_utc(value))
    except ObservationWriteError:
        return None


def _utc(value: str) -> datetime:
    try:
        return timestamp(value)
    except (TypeError, ValueError) as exc:
        raise ObservationWriteError("INVALID_TIMESTAMP", str(exc)) from exc


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
