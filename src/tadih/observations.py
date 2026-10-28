"""Shared fail-closed writer that publishes approved observations to Cloudflare D1.

Contract owner: Lane B (docs/assignments/2026-10-26-real-data-initiative.md §3.1-§3.2).
Every numeric adapter (CHIRPS, RID, TMD, Open-Meteo, GISTDA, ...) must write
observation rows through :func:`publish_observations` so that a single place
enforces the license gate, the canonical observation contract, the run
lifecycle and the ``resources.active_run_id`` switch.

Rules enforced here (never relaxed by CLI flags or caller arguments):

1. Publication gate first. The registry row handed in must be
   ``license_status == "approved_public"`` with ``project_publication_approved
   is True``. Unresolved source-license questions remain blocked unless the
   registry also carries the project owner's explicit numeric-publication
   authorization; that authorization is recorded separately and never means
   the source license itself was verified.
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
   covers each row's durable identity and publication semantics —
   ``(resource_id, observation_id, period start/end, unit, value, measure,
   spatial support, data kind, area/province, commodity, market, grade,
   price type, season, location identity, product, metric name)`` plus the
   published ``dimensions`` minus volatile request keys — so a corrected
   province/area, commodity, market or grade mints a new run and updates what
   readers serve (defect D-4). Volatile per-row ``retrieved_at`` and
   ``revision_id`` values (LastBuildDate/ETag churn), ``release_at`` and
   echoed per-request stamps (GISTDA's ``sourceTimeStamp``) never mint a new
   run (defect D-2); the intra-day instant of a daily/monthly product is
   folded to its period, while point-grain runs keep the exact instant.
   Re-running the same logical day reuses the run instead of orphaning a
   fresh batch of rows. The envelope and the ``quality``/``sync_runs``
   provenance still store the real ``revision_id``/``retrieved_at`` as-is.
   Limitation of the rollout: derived run ids change once — runs written
   before this rule keep their old ids and rows, and the first republish after
   deployment mints one new run per resource before idempotency resumes.
7. A failed run is only marked ``failed``; previously published data and the
   active run pointer are never deleted or clobbered. A source-year claim
   whose response is lost is closed as ``failed`` under its own writer token,
   so the next attempt reclaims the run instead of meeting a stuck
   ``running`` run.
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
9. Monotonic activation (defect D-1): ``resources.active_run_id`` is only
   repointed when the candidate run's newest ``period_start`` is not older
   than the current active run's newest ``period_start``. The comparison and
   the pointer write run in a single UPDATE, so two ingestion jobs cannot
   interleave a check-then-write and move the dashboard backwards. Old
   backfills and retries of earlier days still store their rows and reuse
   their run, but they never become active; the envelope reports
   ``active_run_switched = False`` with
   ``active_run_blocked_reason = ACTIVE_RUN_OLDER_THAN_ACTIVE``. Data periods
   decide, never ``retrieved_at``.

10. Source-year labels: annual source records carry ``source_year_be`` as a
    label and keep ``observed_at``, ``period_start`` and ``period_end`` NULL.
    Their ``period_label`` is the source's Buddhist-year label. Complete
    source-year snapshots activate atomically only when the maximum source
    year does not regress, the retrieval snapshot is newer, and every active
    row key remains present. Row removals require an explicit review tied to
    the exact active and candidate payload hashes and source revision.

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
import re
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

#: Activation guard (D-1): a candidate run whose newest period is older than
#: the current active run's newest period is written but never activated; this
#: is the envelope ``active_run_blocked_reason``.
OLDER_THAN_ACTIVE_RUN_REASON = "ACTIVE_RUN_OLDER_THAN_ACTIVE"
SOURCE_YEAR_INCOMPLETE_REASON = "SOURCE_YEAR_BATCH_INCOMPLETE"
SOURCE_YEAR_QUARANTINED_REASON = "SOURCE_YEAR_BATCH_QUARANTINED"
SOURCE_YEAR_REGRESSION_REASON = "SOURCE_YEAR_LABEL_REGRESSION"
SOURCE_YEAR_STALE_SNAPSHOT_REASON = "SOURCE_YEAR_SNAPSHOT_NOT_NEWER"
SOURCE_YEAR_ROWSET_REVIEW_REASON = "SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW"
SOURCE_YEAR_STALE_REVIEW_REASON = "SOURCE_YEAR_ROWSET_REVIEW_STALE"
SOURCE_YEAR_REVIEW_FUTURE_SKEW = timedelta(minutes=5)
SOURCE_VERSION_NOT_NEWER_REASON = "SOURCE_VERSION_NOT_NEWER"
SOURCE_VERSION_INCOMPARABLE_REASON = "SOURCE_VERSION_INCOMPARABLE"

#: Dimension keys that carry request/retrieval/release stamps or ETags rather
#: than published content. Providers that re-stamp the same product on every
#: request (GISTDA's ``sourceTimeStamp``, feed ``releaseAt``) must still reuse
#: their run (defect D-2), so these keys are excluded from the logical
#: fingerprint. Keys are matched case- and separator-insensitively.
VOLATILE_DIMENSION_KEYS = frozenset({
    "sourcetimestamp", "releaseat", "retrievedat", "revisionid", "etag",
    "lastmodified", "lastbuilddate", "generatedat", "fetchedat",
})

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
    if unresolved != [] and not _has_explicit_publication_authorization(resource):
        raise ObservationWriteError("RESOURCE_NOT_APPROVED", "resource review still has unresolved items")
    resource_id = resource.get("resource_id")
    if not isinstance(resource_id, str) or not resource_id.strip():
        raise ObservationWriteError("RESOURCE_ID_MISSING", "registry row requires a non-empty resource_id")
    source_id = resource.get("source_id")
    if not isinstance(source_id, str) or not source_id.strip():
        raise ObservationWriteError("SOURCE_ID_MISSING", "registry row requires a non-empty source_id")
    return resource


def _has_explicit_publication_authorization(resource: Mapping[str, Any]) -> bool:
    """Check the repository-owner grant without treating it as license evidence."""
    authorization = resource.get("publication_authorization")
    if not isinstance(authorization, dict):
        return False
    required_scope = {"fetch", "process", "store_in_D1", "public_numeric_display"}
    scope = authorization.get("scope")
    return (
        authorization.get("basis") == "project_owner_instruction"
        and authorization.get("document") == "AGENTS.md"
        and authorization.get("section") == 3
        and authorization.get("source_license_verified") is False
        and isinstance(scope, list)
        and required_scope.issubset(set(scope))
    )


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
    source_version: str | None = None,
    source_hash: str | None = None,
    run_id: str | None = None,
    catalog: Mapping[str, Any] | None = None,
    product: str | Mapping[str, str] | None = None,
    metric_name: str | None = None,
    period_grain: str | None = None,
    dimensions_for: Callable[[dict], dict] | None = None,
    locations: Mapping[str, Mapping[str, Any]] | None = None,
    source_year_rowset_change_review: Mapping[str, Any] | None = None,
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
    ``source_year_rowset_change_review``
        is a one-time review manifest for an annual/source-year batch that
        removes row keys from the active snapshot. The candidate hash, active
        hash and source revision are checked before publication; the active
        hash is checked again inside the atomic pointer update.

    Returns the run envelope: ``run_id``, ``status``, ``resource_id``,
    ``source_id``, ``completeness``, ``coverage``, ``records_read``,
    ``records_written``, ``records_inserted``, ``records_skipped``,
    ``records_quarantined``, ``quarantine_reasons``, ``skipped_identical``,
    ``locations_written``, ``active_run_switched``, ``activation_blocked_reason``,
    ``active_run_blocked_reason``, ``revision_id``, ``payload_sha256``,
    ``adapter_version``, ``retrieved_at``, ``started_at``, ``completed_at``.
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
    source_year_mode = period_grain == "source_year_label"
    source_year_token_mode = period_grain == "source_year_token"
    source_snapshot_mode = source_year_mode or source_year_token_mode
    if source_snapshot_mode:
        source_year_location_ids = _validate_source_year_location_mappings(plan)
    else:
        source_year_location_ids = None
        # Daily/monthly batches share the locations table, so the same one-to-one identity rule applies.
        _validate_batch_location_identity(plan)
    source_year_token_label = None
    if source_year_token_mode:
        labels = {entry["observation"].get("source_year_label") for entry in plan}
        if len(labels) != 1 or not isinstance(next(iter(labels)), str):
            raise ObservationWriteError("SOURCE_YEAR_TOKEN_LABEL_MIXED")
        source_year_token_label = next(iter(labels))
        _source_version_order_key(source_version)
        if not isinstance(source_hash, str) or not re.fullmatch(r"[0-9a-f]{32}", source_hash, re.ASCII):
            raise ObservationWriteError("SOURCE_HASH_INVALID")
    if source_year_rowset_change_review is not None and not source_snapshot_mode:
        raise ObservationWriteError("SOURCE_YEAR_REVIEW_NOT_APPLICABLE")
    source_year_revision = None
    if source_snapshot_mode:
        revisions = {entry["observation"]["revision_id"] for entry in plan}
        if len(revisions) != 1:
            raise ObservationWriteError("SOURCE_YEAR_REVISION_MIXED")
        source_year_revision = next(iter(revisions))
    source_year_review = _validate_source_year_review(
        source_year_rowset_change_review,
        payload_sha256=payload_sha256,
        source_revision_id=source_year_revision,
        retrieved_at=retrieved_at,
        allow_source_year_token_fields=source_year_token_mode,
    ) if source_snapshot_mode else None
    run_identity = f"{resource_id}|{adapter_version}|{payload_sha256}"
    if source_year_mode:
        # A source revision is part of an annual snapshot's identity. Equal
        # logical values from a new DLD revision get a fresh immutable run so
        # all row provenance is written together before the active pointer moves.
        run_identity += f"|source_revision_id|{source_year_revision!r}"
    elif source_year_token_mode:
        # The opaque year token is not ordered or interpreted as a date. A
        # complete source metadata version is the run version; the exact label
        # and source hash remain separate provenance fields.
        run_identity += (
            f"|source_revision_id|{source_year_revision!r}"
            f"|source_year_label|{source_year_token_label!r}"
            f"|source_version|{source_version!r}|source_hash|{source_hash!r}"
        )
    derived_run_id = run_id or str(uuid.uuid5(RUN_ID_NAMESPACE, run_identity))
    if source_snapshot_mode:
        # One read-only schema query checks the complete annual writer contract
        # before resource registration can mutate catalog rows. Migration 0002
        # extensions are optional: provenance is retained in quality JSON.
        _preflight_source_year_schema(
            client,
            source_year_token_mode=source_year_token_mode,
            include_locations=any(entry["location"] is not None for entry in plan),
        )
        has_run_source_revision = True
    else:
        # Daily/monthly writers still inspect this optional column so their
        # existing-run query remains compatible with pre- and post-0004 D1.
        has_run_source_revision = _has_run_source_revision_column(client)
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
    source_year_preblock = None
    if source_snapshot_mode and activation_guard is None:
        if completeness != "complete":
            source_year_preblock = SOURCE_YEAR_INCOMPLETE_REASON
        elif quarantined:
            source_year_preblock = SOURCE_YEAR_QUARANTINED_REASON

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

    source_year_writer_token = None
    source_year_retrieved_at = None
    if source_snapshot_mode:
        source_year_writer_token = str(uuid.uuid4())
        source_year_retrieved_at = _iso(_utc(retrieved_at))

        def reuse_completed_source_year(existing_row):
            if existing_row is None:
                raise ObservationWriteError("RUN_CREATION_FAILED")
            status = existing_row.get("status")
            # run_id owns one immutable source snapshot, including while its
            # first attempt is failed and eligible for retry.  Check identity
            # before reclaiming a failed row so an explicit run_id cannot make
            # old staged rows bleed into a different revision or rowset.
            if (existing_row.get("payload_sha256") != payload_sha256
                    or existing_row.get("source_revision_id") != source_year_revision):
                raise ObservationWriteError("SOURCE_YEAR_RUN_IDENTITY_CONFLICT")
            if source_year_token_mode and (
                existing_row.get("source_year_label") != source_year_token_label
                or existing_row.get("source_version") != source_version
                or existing_row.get("source_hash") != source_hash
            ):
                raise ObservationWriteError("SOURCE_YEAR_RUN_IDENTITY_CONFLICT")
            if status == "running":
                raise ObservationWriteError("SOURCE_YEAR_RUN_IN_PROGRESS")
            if status == "failed":
                return None
            if status not in FINAL_STATUSES:
                raise ObservationWriteError("SOURCE_YEAR_RUN_STATE_INVALID")
            stored = _row_count(client, derived_run_id, resource_id)
            if stored < len(plan):
                raise ObservationWriteError("SOURCE_YEAR_FINAL_RUN_INCOMPLETE")
            return _finish_existing_run(
                client, resource_id=resource_id, run_id=derived_run_id, status=status,
                plan=plan, payload_sha256=payload_sha256, coverage=coverage, completeness=completeness,
                adapter_version=adapter_version, retrieved_at=retrieved_at, revision_id=revision_id,
                skipped_identical=len(plan), records_written=stored,
                records_quarantined=len(quarantined), quarantine_reasons=quarantine_reasons,
                require_d1_approval=require_d1_approval, activation_guard=activation_guard,
                period_grain=period_grain, source_year_preblock=source_year_preblock,
                source_year_review=source_year_review,
                source_year_label=source_year_token_label,
                source_version=source_version if source_year_token_mode else None,
                source_hash=source_hash if source_year_token_mode else None,
            )

        def own_committed_claim(row) -> bool:
            """A claim that committed before the response arrived still proves itself by its own token."""
            if not row or row.get("status") != "running":
                return False
            if row.get("source_year_writer_token") != source_year_writer_token:
                return False
            if (row.get("payload_sha256") != payload_sha256
                    or row.get("source_revision_id") != source_year_revision):
                return False
            if source_year_token_mode and (
                row.get("source_year_label") != source_year_token_label
                or row.get("source_version") != source_version
                or row.get("source_hash") != source_hash
            ):
                return False
            return True

        snapshot_extra_select = ",source_year_label,source_version,source_hash" if source_year_token_mode else ""
        existing = client.execute(
            "SELECT run_id,status,payload_sha256,source_revision_id,source_retrieved_at,"
            "source_year_writer_token" + snapshot_extra_select
            + " FROM sync_runs WHERE run_id=? AND resource_id=?",
            [derived_run_id, resource_id],
        )
        existing_row = _first_row(existing)
        claimed = False
        if existing_row is None:
            if source_year_token_mode:
                created = _execute_claim(
                    client,
                    "INSERT INTO sync_runs (run_id,source_id,resource_id,kind,status,started_at,adapter_version,"
                    "source_retrieved_at,source_revision_id,payload_sha256,source_year_writer_token,"
                    "source_year_label,source_version,source_hash) "
                    "VALUES (?,?,?,?,'running',?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING run_id",
                    [derived_run_id, source_id, resource_id, RUN_KIND, _iso(started_at), adapter_version,
                     source_year_retrieved_at, source_year_revision, payload_sha256, source_year_writer_token,
                     source_year_token_label, source_version, source_hash],
                    run_id=derived_run_id, writer_token=source_year_writer_token,
                )
            else:
                created = _execute_claim(
                    client,
                    "INSERT INTO sync_runs (run_id,source_id,resource_id,kind,status,started_at,adapter_version,"
                    "source_retrieved_at,source_revision_id,payload_sha256,source_year_writer_token) "
                    "VALUES (?,?,?,?,'running',?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING run_id",
                    [derived_run_id, source_id, resource_id, RUN_KIND, _iso(started_at), adapter_version,
                     source_year_retrieved_at, source_year_revision, payload_sha256, source_year_writer_token],
                    run_id=derived_run_id, writer_token=source_year_writer_token,
                )
            claimed = _returned(created, "run_id", derived_run_id)
            if not claimed:
                # Unique run ids make simultaneous create attempts converge on
                # one row. Only its token owner can continue writing rows.
                existing = _execute_claim(
                    client,
                    "SELECT run_id,status,payload_sha256,source_revision_id,source_retrieved_at,"
                    "source_year_writer_token" + snapshot_extra_select
                    + " FROM sync_runs WHERE run_id=? AND resource_id=?",
                    [derived_run_id, resource_id],
                    run_id=derived_run_id, writer_token=source_year_writer_token,
                )
                existing_row = _first_row(existing)
                claimed = own_committed_claim(existing_row)

        if not claimed:
            reused = reuse_completed_source_year(existing_row)
            if reused is not None:
                return reused
            # A failed attempt can be reclaimed by one writer using an atomic
            # status transition and a fresh UUID, independent of started_at.
            if source_year_token_mode:
                claimed_result = _execute_claim(
                    client,
                    "UPDATE sync_runs SET status='running',started_at=?,adapter_version=?,"
                    "source_retrieved_at=?,source_revision_id=?,payload_sha256=?,source_year_writer_token=?,"
                    "source_year_label=?,source_version=?,source_hash=?,completed_at=NULL,error_code=NULL,"
                    "records_read=0,records_written=0,records_quarantined=0 "
                    "WHERE run_id=? AND resource_id=? AND status='failed' "
                    "AND payload_sha256 IS ? AND source_revision_id IS ? "
                    "AND source_year_label IS ? AND source_version IS ? AND source_hash IS ? RETURNING run_id",
                    [_iso(started_at), adapter_version, source_year_retrieved_at, source_year_revision,
                     payload_sha256, source_year_writer_token, source_year_token_label, source_version,
                     source_hash, derived_run_id, resource_id, payload_sha256, source_year_revision,
                     source_year_token_label, source_version, source_hash],
                    run_id=derived_run_id, writer_token=source_year_writer_token,
                )
            else:
                claimed_result = _execute_claim(
                    client,
                    "UPDATE sync_runs SET status='running',started_at=?,adapter_version=?,"
                    "source_retrieved_at=?,source_revision_id=?,payload_sha256=?,source_year_writer_token=?,"
                    "completed_at=NULL,error_code=NULL,records_read=0,records_written=0,records_quarantined=0 "
                    "WHERE run_id=? AND resource_id=? AND status='failed' RETURNING run_id",
                    [_iso(started_at), adapter_version, source_year_retrieved_at, source_year_revision,
                     payload_sha256, source_year_writer_token, derived_run_id, resource_id],
                    run_id=derived_run_id, writer_token=source_year_writer_token,
                )
            claimed = _returned(claimed_result, "run_id", derived_run_id)
            if not claimed:
                latest = _first_row(_execute_claim(
                    client,
                    "SELECT run_id,status,payload_sha256,source_revision_id,source_retrieved_at,"
                    "source_year_writer_token" + snapshot_extra_select
                    + " FROM sync_runs WHERE run_id=? AND resource_id=?",
                    [derived_run_id, resource_id],
                    run_id=derived_run_id, writer_token=source_year_writer_token,
                ))
                if own_committed_claim(latest):
                    claimed = True
                else:
                    reused = reuse_completed_source_year(latest)
                    if reused is not None:
                        return reused
                    if latest is not None and latest.get("status") == "running":
                        raise ObservationWriteError("SOURCE_YEAR_RUN_IN_PROGRESS")
                    raise ObservationWriteError("SOURCE_YEAR_RUN_CLAIM_LOST")
    else:
        existing_columns = "run_id, status, payload_sha256"
        if has_run_source_revision:
            existing_columns += ", source_revision_id"
        existing = client.execute(
            f"SELECT {existing_columns} FROM sync_runs WHERE run_id=? AND resource_id=?",
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
                    period_grain=period_grain, source_year_preblock=source_year_preblock,
                    source_year_review=source_year_review,
                )
        if existing_row is not None:
            # Daily/monthly behavior remains backward compatible with old schemas.
            client.execute(
                "UPDATE sync_runs SET status='running', error_code=NULL, started_at=?, adapter_version=? "
                "WHERE run_id=? AND resource_id=?",
                [_iso(started_at), adapter_version, derived_run_id, resource_id],
            )
        else:
            client.execute(
                "INSERT INTO sync_runs (run_id, source_id, resource_id, kind, status, started_at, adapter_version) "
                "VALUES (?, ?, ?, ?, 'running', ?, ?) ON CONFLICT DO NOTHING",
                [derived_run_id, source_id, resource_id, RUN_KIND, _iso(started_at), adapter_version],
            )
            existing = client.execute(
                "SELECT run_id, status, payload_sha256 FROM sync_runs WHERE run_id=? AND resource_id=?",
                [derived_run_id, resource_id],
            )
            existing_row = _first_row(existing)
            if existing_row is None:
                raise ObservationWriteError("RUN_CREATION_FAILED")
            if (existing_row.get("payload_sha256") == payload_sha256
                    and existing_row.get("status") in FINAL_STATUSES
                    and _row_count(client, derived_run_id, resource_id) >= len(plan)):
                return _finish_existing_run(
                    client, resource_id=resource_id, run_id=derived_run_id, status=existing_row["status"],
                    plan=plan, payload_sha256=payload_sha256, coverage=coverage, completeness=completeness,
                    adapter_version=adapter_version, retrieved_at=retrieved_at, revision_id=revision_id,
                    skipped_identical=len(plan), records_written=_row_count(client, derived_run_id, resource_id),
                    records_quarantined=len(quarantined), quarantine_reasons=quarantine_reasons,
                    require_d1_approval=require_d1_approval, activation_guard=activation_guard,
                    period_grain=period_grain, source_year_preblock=source_year_preblock,
                    source_year_review=source_year_review,
                )
            if existing_row.get("status") in FINAL_STATUSES:
                client.execute(
                    "UPDATE sync_runs SET status='running', error_code=NULL, started_at=?, adapter_version=? "
                    "WHERE run_id=? AND resource_id=? AND status IN ('succeeded','partial','failed')",
                    [_iso(started_at), adapter_version, derived_run_id, resource_id],
                )

    extended = _extended_columns(client)
    if source_year_mode:
        source_year_owner_guard = (
            resource_id, derived_run_id, source_year_writer_token, source_year_retrieved_at,
            source_year_revision, payload_sha256,
        )
    elif source_year_token_mode:
        source_year_owner_guard = (
            resource_id, derived_run_id, source_year_writer_token, source_year_retrieved_at,
            source_year_revision, payload_sha256, source_year_token_label, source_version, source_hash,
        )
    else:
        source_year_owner_guard = None
    inserted = 0
    skipped = 0
    source_year_locations_upserted = set()
    try:
        if not source_snapshot_mode:
            # One upsert per distinct location before the rows, so a conflict aborts without half a batch.
            for location in _distinct_locations(plan):
                _upsert_location(client, location)
        for entry in plan:
            if source_snapshot_mode:
                location = entry["location"]
                if (location is not None
                        and location["location_id"] in source_year_location_ids
                        and location["location_id"] not in source_year_locations_upserted):
                    _upsert_location(client, location, source_year_guard=source_year_owner_guard)
                    source_year_locations_upserted.add(location["location_id"])
            if _row_matches(client, resource_id, derived_run_id, entry):
                skipped += 1
                continue
            if source_snapshot_mode:
                statement, parameters = _observation_statement(
                    derived_run_id, resource_id, entry, extended,
                    source_snapshot_guard=source_year_owner_guard,
                )
                row_result = client.execute(statement, parameters)
                if not _returned(row_result, "row_key", entry["observation"]["observation_id"]):
                    raise ObservationWriteError("SOURCE_YEAR_RUN_OWNERSHIP_LOST")
            else:
                client.execute(*_observation_statement(derived_run_id, resource_id, entry, extended))
            inserted += 1
        records_written = _row_count(client, derived_run_id, resource_id)
        completed_at = _now()
        if source_year_mode:
            result = client.execute(
                "UPDATE sync_runs SET status=?,completed_at=?,records_read=?,records_written=?,"
                "records_quarantined=?,error_code=? WHERE run_id=? AND resource_id=? AND status='running' "
                "AND source_year_writer_token IS ? AND source_retrieved_at IS ? "
                "AND source_revision_id IS ? AND payload_sha256 IS ? RETURNING run_id",
                [final_status, _iso(completed_at), len(rows), records_written, len(quarantined),
                 activation_guard, derived_run_id, resource_id, source_year_writer_token,
                 source_year_retrieved_at, source_year_revision, payload_sha256],
            )
        elif source_year_token_mode:
            result = client.execute(
                "UPDATE sync_runs SET status=?,completed_at=?,records_read=?,records_written=?,"
                "records_quarantined=?,error_code=? WHERE run_id=? AND resource_id=? AND status='running' "
                "AND source_year_writer_token IS ? AND source_retrieved_at IS ? "
                "AND source_revision_id IS ? AND payload_sha256 IS ? "
                "AND source_year_label IS ? AND source_version IS ? AND source_hash IS ? RETURNING run_id",
                [final_status, _iso(completed_at), len(rows), records_written, len(quarantined),
                 activation_guard, derived_run_id, resource_id, source_year_writer_token,
                 source_year_retrieved_at, source_year_revision, payload_sha256,
                 source_year_token_label, source_version, source_hash],
            )
        else:
            result = client.execute(
                "UPDATE sync_runs SET status=?, completed_at=?, source_retrieved_at=?, "
                "records_read=?, records_written=?, records_quarantined=?, payload_sha256=?, error_code=? "
                "WHERE run_id=? AND resource_id=? AND status='running' RETURNING run_id",
                [final_status, _iso(completed_at), _iso(_utc(retrieved_at)), len(rows), records_written,
                 len(quarantined), payload_sha256, activation_guard, derived_run_id, resource_id],
            )
        if not _returned(result, "run_id", derived_run_id):
            if source_snapshot_mode:
                # Annual rows and finalization are guarded by the same unique
                # owner token. A lost CAS must never turn into a successful
                # response assembled from another writer's run.
                raise ObservationWriteError("SOURCE_YEAR_RUN_OWNERSHIP_LOST")
            # A competing publisher may have completed the same deterministic
            # run after our row writes. Reuse that completed run when its
            # logical payload is identical; other completion failures remain
            # errors.
            completed = _first_row(client.execute(
                "SELECT status, payload_sha256 FROM sync_runs WHERE run_id=? AND resource_id=?",
                [derived_run_id, resource_id],
            ))
            if (completed is None or completed.get("status") not in FINAL_STATUSES
                    or completed.get("payload_sha256") != payload_sha256
                    or _row_count(client, derived_run_id, resource_id) < len(plan)):
                raise ObservationWriteError("RUN_COMPLETION_FAILED")
            return _finish_existing_run(
                client, resource_id=resource_id, run_id=derived_run_id, status=completed["status"],
                plan=plan, payload_sha256=payload_sha256, coverage=coverage, completeness=completeness,
                adapter_version=adapter_version, retrieved_at=retrieved_at, revision_id=revision_id,
                skipped_identical=len(plan), records_written=_row_count(client, derived_run_id, resource_id),
                records_quarantined=len(quarantined), quarantine_reasons=quarantine_reasons,
                require_d1_approval=require_d1_approval, activation_guard=activation_guard,
                period_grain=period_grain, source_year_preblock=source_year_preblock,
                source_year_review=source_year_review,
                source_year_label=source_year_token_label,
                source_version=source_version if source_year_token_mode else None,
                source_hash=source_hash if source_year_token_mode else None,
            )
    except ObservationWriteError:
        _mark_failed(client, derived_run_id, "RUN_COMPLETION_FAILED",
                     source_year_writer_token=source_year_writer_token)
        raise
    except Exception as exc:
        _mark_failed(client, derived_run_id, "NUMERIC_WRITE_FAILED",
                     source_year_writer_token=source_year_writer_token)
        raise ObservationWriteError("NUMERIC_WRITE_FAILED") from exc

    if source_year_preblock is not None:
        active_run_switched = False
        active_run_blocked_reason = source_year_preblock
        _mark_source_year_blocked(client, resource_id, derived_run_id, source_year_preblock)
        final_status = "partial"
    else:
        active_run_switched, active_run_blocked_reason = _switch_active_run(
            client, resource_id=resource_id, run_id=derived_run_id, status=final_status,
            enabled=require_d1_approval and records_written > 0 and activation_guard is None,
            period_grain=period_grain, source_year_rowset_change_review=source_year_review,
        )
        if source_snapshot_mode and not active_run_switched and active_run_blocked_reason:
            _mark_source_year_blocked(client, resource_id, derived_run_id, active_run_blocked_reason)
            final_status = "partial"
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
        "locations_written": _plan_location_count(plan),
        "active_run_switched": active_run_switched,
        "activation_blocked_reason": activation_guard,
        "active_run_blocked_reason": active_run_blocked_reason,
        "revision_id": revision_id,
        "source_snapshot_updated": source_snapshot_mode,
        "source_snapshot_blocked_reason": None,
        "source_snapshot_retrieved_at": _iso(_utc(retrieved_at)) if source_snapshot_mode else None,
        "source_year_label": source_year_token_label,
        "source_version": source_version if source_year_token_mode else None,
        "source_hash": source_hash if source_year_token_mode else None,
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
    period_grain=None, source_year_preblock=None, source_year_review=None,
    source_year_label=None, source_version=None, source_hash=None,
) -> dict:
    """Reuse an identical published run instead of writing the same rows twice."""
    source_snapshot_updated = False
    source_snapshot_accepted = False
    source_snapshot_blocked_reason = None
    verification_at = None
    if (period_grain == "source_year_label" and source_year_preblock is None
            and not records_quarantined):
        # A replay of the same payload and source revision is fully immutable.
        # Do not refresh observations or their source_retrieved_at: those rows
        # still represent the original retrieval. Report this verification in
        # the response only. A changed revision has a different run id and is
        # staged/activated as a complete run by the normal write path.
        stored_snapshot = _first_row(client.execute(
            "SELECT source_retrieved_at, source_revision_id FROM sync_runs "
            "WHERE run_id=? AND resource_id=?",
            [run_id, resource_id],
        )) or {}
        if stored_snapshot.get("source_revision_id") != revision_id:
            source_snapshot_blocked_reason = "SOURCE_YEAR_RUN_REVISION_CONFLICT"
        else:
            source_snapshot_accepted = True
            verification_at = _iso(_now())
    elif (period_grain == "source_year_token" and source_year_preblock is None
            and not records_quarantined):
        stored_snapshot = _first_row(client.execute(
            "SELECT source_retrieved_at,source_revision_id,source_year_label,source_version,source_hash "
            "FROM sync_runs WHERE run_id=? AND resource_id=?",
            [run_id, resource_id],
        )) or {}
        if (stored_snapshot.get("source_revision_id") != revision_id
                or stored_snapshot.get("source_year_label") != source_year_label
                or stored_snapshot.get("source_version") != source_version
                or stored_snapshot.get("source_hash") != source_hash):
            source_snapshot_blocked_reason = "SOURCE_YEAR_RUN_IDENTITY_CONFLICT"
        else:
            source_snapshot_accepted = True
            verification_at = _iso(_now())
    source_snapshot_retrieved_at = None
    if period_grain in ("source_year_label", "source_year_token"):
        stored_snapshot = _first_row(client.execute(
            "SELECT source_retrieved_at FROM sync_runs WHERE run_id=? AND resource_id=?",
            [run_id, resource_id],
        )) or {}
        source_snapshot_retrieved_at = stored_snapshot.get("source_retrieved_at")
    if source_snapshot_blocked_reason is not None:
        active_run_switched = False
        active_run_blocked_reason = source_snapshot_blocked_reason
        _mark_source_year_blocked(client, resource_id, run_id, source_snapshot_blocked_reason)
        status = "partial"
    elif source_year_preblock is not None:
        active_run_switched = False
        active_run_blocked_reason = source_year_preblock
        _mark_source_year_blocked(client, resource_id, run_id, source_year_preblock)
        status = "partial"
    else:
        active_run_switched, active_run_blocked_reason = _switch_active_run(
            client, resource_id=resource_id, run_id=run_id, status=status,
            enabled=require_d1_approval and records_written > 0 and activation_guard is None,
            period_grain=period_grain, source_year_rowset_change_review=source_year_review,
        )
        # A replay of a finalized snapshot is read-only. The activation result
        # describes this attempt and does not rewrite that snapshot's status.
    if period_grain in ("source_year_label", "source_year_token") and active_run_switched:
        # A previously blocked, complete snapshot may activate after its
        # explicit row-removal review is supplied on an identical replay.
        client.execute(
            "UPDATE sync_runs SET status='succeeded', error_code=NULL "
            "WHERE run_id=? AND resource_id=? AND status='partial'",
            [run_id, resource_id],
        )
        status = "succeeded"
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
        "locations_written": _plan_location_count(plan),
        "active_run_switched": active_run_switched,
        "activation_blocked_reason": activation_guard,
        "active_run_blocked_reason": active_run_blocked_reason,
        "revision_id": revision_id,
        "source_snapshot_updated": source_snapshot_updated,
        "source_snapshot_accepted": source_snapshot_accepted,
        "source_snapshot_blocked_reason": source_snapshot_blocked_reason,
        "source_snapshot_retrieved_at": source_snapshot_retrieved_at,
        "source_year_label": source_year_label,
        "source_version": source_version,
        "source_hash": source_hash,
        "verification_at": verification_at,
        "payload_sha256": payload_sha256,
        "adapter_version": adapter_version,
        "retrieved_at": _iso(_utc(retrieved_at)),
        "started_at": None,
        "completed_at": None,
    }


def _switch_active_run(
    client, *, resource_id, run_id, status, enabled, period_grain=None,
    source_year_rowset_change_review=None,
) -> tuple[bool, str | None]:
    """Point the resource at this run unless a newer run is already active.

    The candidate's newest ``period_start`` and the current ``active_run_id``
    are compared inside the same UPDATE that writes the pointer (defect D-1),
    so a concurrent job that activates a newer run between this run's data
    write and this statement cannot be overwritten by an older backfill. A
    blocked candidate keeps the existing pointer and is reported as
    ``(False, OLDER_THAN_ACTIVE_RUN_REASON)``; data periods decide, never
    ``retrieved_at``.

    A revoked ``resources`` row or a candidate that is no longer final keeps
    its previous pointer and the caller gets ``ACTIVE_RUN_SWITCH_FAILED``;
    published rows and the old active run are never deleted.
    """
    if not enabled:
        return False, None
    if period_grain == "source_year_label":
        return _switch_source_year_run(
            client, resource_id=resource_id, run_id=run_id, status=status,
            review=source_year_rowset_change_review,
        )
    if period_grain == "source_year_token":
        return _switch_source_year_token_run(
            client, resource_id=resource_id, run_id=run_id, status=status,
            review=source_year_rowset_change_review,
        )
    try:
        result = client.execute(
            "UPDATE resources SET active_run_id = CASE "
            "WHEN active_run_id IS NULL "
            "OR NOT EXISTS (SELECT 1 FROM observations WHERE resource_id=? "
            "AND run_id=resources.active_run_id) "
            "OR (SELECT MAX(period_start) FROM observations WHERE resource_id=? AND run_id=?) "
            ">= (SELECT MAX(period_start) FROM observations WHERE resource_id=? "
            "AND run_id=resources.active_run_id) "
            "THEN ? ELSE active_run_id END "
            "WHERE resource_id=? "
            "AND access_status='approved_public' AND project_publication_approved=1 "
            "AND EXISTS (SELECT 1 FROM sync_runs WHERE run_id=? AND resource_id=? AND status=?) "
            "RETURNING active_run_id",
            [resource_id, resource_id, run_id, resource_id, run_id,
             resource_id, run_id, resource_id, status],
        )
    except Exception as exc:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED") from exc
    row = _first_row(result)
    if row is None or row.get("active_run_id") is None:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED")
    if row["active_run_id"] == run_id:
        return True, None
    return False, OLDER_THAN_ACTIVE_RUN_REASON


def _switch_source_year_run(client, *, resource_id, run_id, status, review):
    """Atomically activate a complete source-year snapshot against its active one."""
    state = _first_row(client.execute(
        "SELECT active_run_id FROM resources WHERE resource_id=?", [resource_id],
    ))
    if state is None:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED")
    active_id = state.get("active_run_id")
    candidate_run = _first_row(client.execute(
        "SELECT source_retrieved_at,payload_sha256,source_revision_id FROM sync_runs "
        "WHERE resource_id=? AND run_id=?",
        [resource_id, run_id],
    ))
    if candidate_run is None:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED")
    candidate_retrieved_at = candidate_run.get("source_retrieved_at")
    candidate_payload_sha256 = candidate_run.get("payload_sha256")
    candidate_revision_id = candidate_run.get("source_revision_id")
    try:
        candidate_datetime = _utc(candidate_retrieved_at)
    except ObservationWriteError:
        return False, "SOURCE_YEAR_CANDIDATE_RETRIEVAL_TIME_INVALID"
    if review is not None:
        try:
            reviewed_datetime = _utc(review["reviewed_at"])
        except (KeyError, ObservationWriteError):
            return False, "SOURCE_YEAR_REVIEW_INVALID"
        if reviewed_datetime < candidate_datetime:
            return False, SOURCE_YEAR_STALE_REVIEW_REASON

    active_retrieved_at = None
    active_payload_sha256 = None
    active_revision_id = None
    retrieval_is_newer = False
    if active_id is not None:
        active_run = _first_row(client.execute(
            "SELECT source_retrieved_at,payload_sha256,source_revision_id FROM sync_runs "
            "WHERE resource_id=? AND run_id=?",
            [resource_id, active_id],
        ))
        if active_run is None:
            return False, "SOURCE_YEAR_ACTIVE_RUN_MISSING"
        active_retrieved_at = active_run.get("source_retrieved_at")
        active_payload_sha256 = active_run.get("payload_sha256")
        active_revision_id = active_run.get("source_revision_id")
        try:
            active_datetime = _utc(active_retrieved_at)
        except ObservationWriteError:
            return False, "SOURCE_YEAR_ACTIVE_RETRIEVAL_TIME_INVALID"
        retrieval_is_newer = candidate_datetime > active_datetime
        if active_id != run_id and not retrieval_is_newer:
            return False, SOURCE_YEAR_STALE_SNAPSHOT_REASON

    candidate_year = (
        "(SELECT MAX(CAST(json_extract(dimensions, '$.sourceYearBe') AS INTEGER)) "
        "FROM observations WHERE resource_id=resources.resource_id AND run_id=?)"
    )
    active_year = (
        "(SELECT MAX(CAST(json_extract(dimensions, '$.sourceYearBe') AS INTEGER)) "
        "FROM observations WHERE resource_id=resources.resource_id AND run_id=resources.active_run_id)"
    )
    candidate_retrieved_expr = (
        "(SELECT source_retrieved_at FROM sync_runs "
        "WHERE resource_id=resources.resource_id AND run_id=?)"
    )
    active_retrieved_expr = (
        "(SELECT source_retrieved_at FROM sync_runs "
        "WHERE resource_id=resources.resource_id AND run_id=resources.active_run_id)"
    )
    rowset_shrunk = (
        "EXISTS (SELECT 1 FROM observations old_row "
        "WHERE old_row.resource_id=resources.resource_id AND old_row.run_id=resources.active_run_id "
        "AND NOT EXISTS (SELECT 1 FROM observations new_row "
        "WHERE new_row.resource_id=resources.resource_id AND new_row.run_id=? "
        "AND new_row.row_key=old_row.row_key))"
    )
    review_matches_active = (
        "(?=1 AND (SELECT payload_sha256 FROM sync_runs "
        "WHERE resource_id=resources.resource_id AND run_id=resources.active_run_id)=?)"
    )
    eligible_over_active = (
        f"{candidate_year} IS NOT NULL AND {active_year} IS NOT NULL "
        f"AND ({candidate_year}>={active_year} OR {rowset_shrunk}) "
        f"AND {candidate_retrieved_expr} IS NOT NULL AND {active_retrieved_expr} IS NOT NULL "
        f"AND ?=1 AND {candidate_retrieved_expr} IS ? AND {active_retrieved_expr} IS ? "
        f"AND (NOT {rowset_shrunk} OR {review_matches_active})"
    )
    has_review = review is not None
    review_active_hash = review.get("active_payload_sha256") if has_review else None
    review_json = _json(review) if has_review else None
    # The timestamp strings are opaque compare-and-swap tokens in SQL. Their
    # chronological order is evaluated as aware datetimes in Python above,
    # which supports fractional seconds and timezone offsets without SQLite
    # date-function precision loss. These exact tokens and active_run_id are
    # checked inside the pointer UPDATE before it can commit.
    eligibility_params = [
        run_id, run_id, run_id, run_id, int(retrieval_is_newer), run_id,
        candidate_retrieved_at, active_retrieved_at, run_id, int(has_review), review_active_hash,
    ]
    # Pointer selection and the one-time removal review audit share a single
    # UPDATE. The active payload hash is checked against the pointer's current
    # run inside the SQL statement, so an interleaved publisher invalidates a
    # stale review instead of applying it to a different snapshot.
    sql = (
        "UPDATE resources SET active_run_id=CASE "
        "WHEN active_run_id=? THEN ? "
        "WHEN active_run_id IS NULL OR NOT EXISTS (SELECT 1 FROM observations "
        "WHERE resource_id=resources.resource_id AND run_id=resources.active_run_id) THEN ? "
        f"WHEN {eligible_over_active} THEN ? ELSE active_run_id END, "
        "metadata=CASE WHEN active_run_id IS NOT NULL AND active_run_id<>? "
        f"AND {rowset_shrunk} AND {review_matches_active} AND {eligible_over_active} "
        "THEN json_set(COALESCE(metadata, '{}'), '$.sourceYearRowsetChangeReviews', "
        "json_insert(json(COALESCE(json_extract(metadata, '$.sourceYearRowsetChangeReviews'), '[]')), "
        "'$[#]', json(?))) ELSE metadata END "
        "WHERE resource_id=? AND access_status='approved_public' "
        "AND project_publication_approved=1 "
        "AND active_run_id IS ? "
        "AND EXISTS (SELECT 1 FROM sync_runs WHERE run_id=? AND resource_id=? "
        "AND status=? AND source_retrieved_at IS ? AND payload_sha256 IS ? "
        "AND source_revision_id IS ?) "
        "AND (active_run_id IS NULL OR EXISTS (SELECT 1 FROM sync_runs active_snapshot "
        "WHERE active_snapshot.run_id=resources.active_run_id "
        "AND active_snapshot.resource_id=resources.resource_id "
        "AND active_snapshot.source_retrieved_at IS ? "
        "AND active_snapshot.payload_sha256 IS ? AND active_snapshot.source_revision_id IS ?)) "
        "RETURNING active_run_id"
    )
    params = [
        # Pointer CASE.
        run_id, run_id, run_id, *eligibility_params, run_id,
        # Metadata CASE. Record review only when rows are actually removed.
        run_id, run_id, int(has_review), review_active_hash,
        *eligibility_params, review_json,
        # Resource and final-run gate.
        resource_id, active_id, run_id, resource_id, status, candidate_retrieved_at,
        candidate_payload_sha256, candidate_revision_id, active_retrieved_at,
        active_payload_sha256, active_revision_id,
    ]
    try:
        result = client.execute(sql, params)
    except Exception as exc:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED") from exc
    row = _first_row(result)
    if row is None or row.get("active_run_id") is None:
        latest_state = _first_row(client.execute(
            "SELECT active_run_id FROM resources WHERE resource_id=?", [resource_id],
        )) or {}
        if latest_state.get("active_run_id") != active_id:
            return False, "SOURCE_YEAR_POINTER_CHANGED_DURING_ACTIVATION"
        latest_candidate = _first_row(client.execute(
            "SELECT source_retrieved_at,payload_sha256,source_revision_id FROM sync_runs "
            "WHERE resource_id=? AND run_id=?",
            [resource_id, run_id],
        )) or {}
        if (latest_candidate.get("source_retrieved_at") != candidate_retrieved_at
                or latest_candidate.get("payload_sha256") != candidate_payload_sha256
                or latest_candidate.get("source_revision_id") != candidate_revision_id):
            return False, "SOURCE_YEAR_CANDIDATE_CHANGED_DURING_ACTIVATION"
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED")
    if row["active_run_id"] == run_id:
        return True, None
    reason = _source_year_block_reason(client, resource_id=resource_id, run_id=run_id, review=review)
    return False, reason


def _switch_source_year_token_run(client, *, resource_id, run_id, status, review):
    """Activate an opaque year-label snapshot by source revision metadata only.

    The source label is never sorted or converted to a date. A later source
    snapshot must carry a strictly newer, comparable source ``last_modified``
    token and retrieval timestamp. Row removals still require the reviewed
    manifest, and the active/candidate identities are checked atomically.
    """
    state = _first_row(client.execute(
        "SELECT active_run_id FROM resources WHERE resource_id=?", [resource_id],
    ))
    if state is None:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED")
    active_id = state.get("active_run_id")
    candidate = _first_row(client.execute(
        "SELECT source_retrieved_at,payload_sha256,source_revision_id,source_year_label,"
        "source_version,source_hash FROM sync_runs WHERE resource_id=? AND run_id=?",
        [resource_id, run_id],
    ))
    if candidate is None:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED")
    candidate_retrieved_at = candidate.get("source_retrieved_at")
    candidate_payload = candidate.get("payload_sha256")
    candidate_revision = candidate.get("source_revision_id")
    candidate_label = candidate.get("source_year_label")
    candidate_version = candidate.get("source_version")
    candidate_hash = candidate.get("source_hash")
    try:
        candidate_retrieved = _utc(candidate_retrieved_at)
        candidate_version_key = _source_version_order_key(candidate_version)
    except ObservationWriteError:
        return False, "SOURCE_YEAR_CANDIDATE_VERSION_INVALID"
    if review is not None:
        try:
            reviewed_datetime = _utc(review["reviewed_at"])
        except (KeyError, ObservationWriteError):
            return False, "SOURCE_YEAR_REVIEW_INVALID"
        if reviewed_datetime < candidate_retrieved:
            return False, SOURCE_YEAR_STALE_REVIEW_REASON

    active_retrieved_at = None
    active_payload = None
    active_revision = None
    active_label = None
    active_version = None
    active_hash = None
    rowset_shrunk = False
    review_matches = False
    if active_id is not None:
        active = _first_row(client.execute(
            "SELECT source_retrieved_at,payload_sha256,source_revision_id,source_year_label,"
            "source_version,source_hash FROM sync_runs WHERE resource_id=? AND run_id=?",
            [resource_id, active_id],
        ))
        if active is None:
            return False, "SOURCE_YEAR_ACTIVE_RUN_MISSING"
        active_retrieved_at = active.get("source_retrieved_at")
        active_payload = active.get("payload_sha256")
        active_revision = active.get("source_revision_id")
        active_label = active.get("source_year_label")
        active_version = active.get("source_version")
        active_hash = active.get("source_hash")
        try:
            active_retrieved = _utc(active_retrieved_at)
            active_version_key = _source_version_order_key(active_version)
        except ObservationWriteError:
            return False, "SOURCE_YEAR_ACTIVE_VERSION_INVALID"
        if active_id != run_id:
            if candidate_version_key[0] != active_version_key[0]:
                return False, SOURCE_VERSION_INCOMPARABLE_REASON
            if candidate_version_key[1] <= active_version_key[1]:
                return False, SOURCE_VERSION_NOT_NEWER_REASON
            if candidate_retrieved <= active_retrieved:
                return False, SOURCE_YEAR_STALE_SNAPSHOT_REASON

        shrink_result = _first_row(client.execute(
            "SELECT EXISTS (SELECT 1 FROM observations old_row "
            "WHERE old_row.resource_id=? AND old_row.run_id=? "
            "AND NOT EXISTS (SELECT 1 FROM observations new_row "
            "WHERE new_row.resource_id=? AND new_row.run_id=? AND new_row.row_key=old_row.row_key)) "
            "AS rowset_shrunk",
            [resource_id, active_id, resource_id, run_id],
        )) or {}
        rowset_shrunk = bool(shrink_result.get("rowset_shrunk"))
        review_matches = (
            review is not None
            and review.get("active_payload_sha256") == active_payload
            and review.get("candidate_payload_sha256") == candidate_payload
            and review.get("source_revision_id") == candidate_revision
            and review.get("resource_id") == resource_id
            and review.get("active_run_id") == active_id
            and review.get("active_source_year_label") == active_label
            and review.get("active_source_version") == active_version
            and review.get("active_source_hash") == active_hash
            and review.get("active_source_revision_id") == active_revision
            and review.get("candidate_run_id") == run_id
            and review.get("source_year_label") == candidate_label
            and review.get("source_version") == candidate_version
            and review.get("source_hash") == candidate_hash
        )
        if rowset_shrunk and review is None:
            return False, SOURCE_YEAR_ROWSET_REVIEW_REASON
        if rowset_shrunk and not review_matches:
            return False, SOURCE_YEAR_STALE_REVIEW_REASON

    has_review = review is not None and review_matches
    review_active_hash = review.get("active_payload_sha256") if has_review else None
    review_json = _json(review) if has_review else None
    rowset_shrunk_expr = (
        "EXISTS (SELECT 1 FROM observations old_row "
        "WHERE old_row.resource_id=resources.resource_id AND old_row.run_id=resources.active_run_id "
        "AND NOT EXISTS (SELECT 1 FROM observations new_row "
        "WHERE new_row.resource_id=resources.resource_id AND new_row.run_id=? "
        "AND new_row.row_key=old_row.row_key))"
    )
    review_matches_expr = (
        "(?=1 AND (SELECT payload_sha256 FROM sync_runs "
        "WHERE resource_id=resources.resource_id AND run_id=resources.active_run_id)=? "
        "AND (SELECT payload_sha256 FROM sync_runs WHERE resource_id=resources.resource_id AND run_id=?)=? "
        "AND (SELECT source_revision_id FROM sync_runs WHERE resource_id=resources.resource_id AND run_id=?)=?)"
    )
    sql = (
        "UPDATE resources SET active_run_id=?, "
        "metadata=CASE WHEN active_run_id IS NOT NULL AND active_run_id<>? "
        f"AND {rowset_shrunk_expr} AND {review_matches_expr} "
        "THEN json_set(COALESCE(metadata, '{}'), '$.sourceYearRowsetChangeReviews', "
        "json_insert(json(COALESCE(json_extract(metadata, '$.sourceYearRowsetChangeReviews'), '[]')), "
        "'$[#]', json(?))) ELSE metadata END "
        "WHERE resource_id=? AND access_status='approved_public' AND project_publication_approved=1 "
        "AND active_run_id IS ? "
        "AND EXISTS (SELECT 1 FROM sync_runs candidate WHERE candidate.run_id=? "
        "AND candidate.resource_id=? AND candidate.status=? "
        "AND candidate.source_retrieved_at IS ? AND candidate.payload_sha256 IS ? "
        "AND candidate.source_revision_id IS ? AND candidate.source_year_label IS ? "
        "AND candidate.source_version IS ? AND candidate.source_hash IS ?) "
        "AND (active_run_id IS NULL OR EXISTS (SELECT 1 FROM sync_runs active_snapshot "
        "WHERE active_snapshot.run_id=resources.active_run_id "
        "AND active_snapshot.resource_id=resources.resource_id "
        "AND active_snapshot.source_retrieved_at IS ? AND active_snapshot.payload_sha256 IS ? "
        "AND active_snapshot.source_revision_id IS ? AND active_snapshot.source_year_label IS ? "
        "AND active_snapshot.source_version IS ? AND active_snapshot.source_hash IS ?)) "
        "AND (NOT " + rowset_shrunk_expr + " OR " + review_matches_expr + ") "
        "RETURNING active_run_id"
    )
    params = [
        run_id,
        run_id,  # metadata active_run_id<>?
        run_id,  # rowset comparison in metadata audit
        int(has_review), review_active_hash, run_id, candidate_payload, run_id, candidate_revision,
        review_json,
        resource_id, active_id,
        run_id, resource_id, status, candidate_retrieved_at, candidate_payload,
        candidate_revision, candidate_label, candidate_version, candidate_hash,
        active_retrieved_at, active_payload, active_revision, active_label, active_version, active_hash,
        # The final predicate rechecks rowset shrink and the reviewed payloads.
        run_id, int(has_review), review_active_hash, run_id, candidate_payload, run_id, candidate_revision,
    ]
    try:
        result = client.execute(sql, params)
    except Exception as exc:
        raise ObservationWriteError("ACTIVE_RUN_SWITCH_FAILED") from exc
    row = _first_row(result)
    if row is None or row.get("active_run_id") != run_id:
        latest_state = _first_row(client.execute(
            "SELECT active_run_id FROM resources WHERE resource_id=?", [resource_id],
        )) or {}
        if latest_state.get("active_run_id") != active_id:
            return False, "SOURCE_YEAR_POINTER_CHANGED_DURING_ACTIVATION"
        latest_candidate = _first_row(client.execute(
            "SELECT source_retrieved_at,payload_sha256,source_revision_id,source_year_label,"
            "source_version,source_hash FROM sync_runs WHERE resource_id=? AND run_id=?",
            [resource_id, run_id],
        )) or {}
        if latest_candidate != candidate:
            return False, "SOURCE_YEAR_CANDIDATE_CHANGED_DURING_ACTIVATION"
        if rowset_shrunk and not review_matches:
            return False, SOURCE_YEAR_ROWSET_REVIEW_REASON
        return False, "SOURCE_YEAR_POINTER_SWITCH_FAILED"
    return True, None


def _source_year_block_reason(client, *, resource_id, run_id, review):
    state = client.execute(
        "SELECT active_run_id FROM resources WHERE resource_id=?", [resource_id],
    )
    active_id = (_first_row(state) or {}).get("active_run_id")
    if active_id == run_id:
        return None
    if not active_id:
        return "SOURCE_YEAR_POINTER_SWITCH_FAILED"
    candidate = client.execute(
        "SELECT MAX(CAST(json_extract(dimensions, '$.sourceYearBe') AS INTEGER)) AS year_be, "
        "(SELECT source_retrieved_at FROM sync_runs WHERE resource_id=? AND run_id=?) AS retrieved_at "
        "FROM observations WHERE resource_id=? AND run_id=?",
        [resource_id, run_id, resource_id, run_id],
    )
    active = client.execute(
        "SELECT MAX(CAST(json_extract(dimensions, '$.sourceYearBe') AS INTEGER)) AS year_be, "
        "(SELECT source_retrieved_at FROM sync_runs WHERE resource_id=? AND run_id=?) AS retrieved_at, "
        "(SELECT payload_sha256 FROM sync_runs WHERE resource_id=? AND run_id=?) AS payload_sha256 "
        "FROM observations WHERE resource_id=? AND run_id=?",
        [resource_id, active_id, resource_id, active_id, resource_id, active_id],
    )
    candidate_row = _first_row(candidate) or {}
    active_row = _first_row(active) or {}
    if candidate_row.get("year_be") is None or active_row.get("year_be") is None:
        return "SOURCE_YEAR_ACTIVE_GRAIN_MISMATCH"
    try:
        candidate_datetime = _utc(candidate_row.get("retrieved_at"))
    except ObservationWriteError:
        return "SOURCE_YEAR_CANDIDATE_RETRIEVAL_TIME_INVALID"
    try:
        active_datetime = _utc(active_row.get("retrieved_at"))
    except ObservationWriteError:
        return "SOURCE_YEAR_ACTIVE_RETRIEVAL_TIME_INVALID"
    shrink = client.execute(
        "SELECT EXISTS (SELECT 1 FROM observations old_row "
        "WHERE old_row.resource_id=? AND old_row.run_id=? "
        "AND NOT EXISTS (SELECT 1 FROM observations new_row WHERE new_row.resource_id=? "
        "AND new_row.run_id=? AND new_row.row_key=old_row.row_key)) AS rowset_shrunk",
        [resource_id, active_id, resource_id, run_id],
    )
    rowset_shrunk = bool((_first_row(shrink) or {}).get("rowset_shrunk"))
    review_matches = (review is not None
                      and active_row.get("payload_sha256") == review.get("active_payload_sha256"))
    if candidate_row["year_be"] < active_row["year_be"] and not (rowset_shrunk and review_matches):
        if rowset_shrunk and review is None:
            return SOURCE_YEAR_ROWSET_REVIEW_REASON
        if rowset_shrunk and review is not None:
            return SOURCE_YEAR_STALE_REVIEW_REASON
        return SOURCE_YEAR_REGRESSION_REASON
    if candidate_datetime <= active_datetime:
        return SOURCE_YEAR_STALE_SNAPSHOT_REASON
    if rowset_shrunk:
        if review is None:
            return SOURCE_YEAR_ROWSET_REVIEW_REASON
        if active_row.get("payload_sha256") != review.get("active_payload_sha256"):
            return SOURCE_YEAR_STALE_REVIEW_REASON
    return "SOURCE_YEAR_POINTER_SWITCH_FAILED"


def _mark_source_year_blocked(client, resource_id, run_id, reason):
    client.execute(
        "UPDATE sync_runs SET status='partial', error_code=? "
        "WHERE run_id=? AND resource_id=? AND status IN ('succeeded','partial') "
        "AND NOT EXISTS (SELECT 1 FROM resources WHERE resource_id=? AND active_run_id=?)",
        [reason, run_id, resource_id, resource_id, run_id],
    )


def _validate_source_year_review(
    review, *, payload_sha256, source_revision_id, retrieved_at,
    allow_source_year_token_fields=False,
):
    if review is None:
        return None
    base_fields = {
        "reviewed_by", "reviewed_at", "reason", "source_revision_id",
        "active_payload_sha256", "candidate_payload_sha256",
    }
    token_fields = {
        "resource_id", "active_run_id", "active_source_year_label", "active_source_version",
        "active_source_hash", "active_source_revision_id", "candidate_run_id", "source_year_label",
        "source_version", "source_hash",
    }
    keys = set(review) if isinstance(review, Mapping) else set()
    if (keys != base_fields
            and not (allow_source_year_token_fields and keys == base_fields | token_fields)):
        raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
    for key in ("reviewed_by", "reason"):
        value = review.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 500:
            raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
        if "://" in value or any(marker in value.lower() for marker in ("api_key", "apikey", "token=")):
            raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
    try:
        reviewed_at = _utc(review["reviewed_at"])
        _utc(retrieved_at)
    except (KeyError, ObservationWriteError) as exc:
        raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID") from exc
    # The source timestamp belongs to the candidate snapshot, not to a later
    # verification fetch that reuses the same immutable run. A small future
    # allowance accommodates ordinary clock skew without accepting arbitrary
    # future-dated approvals.
    if reviewed_at > _now() + SOURCE_YEAR_REVIEW_FUTURE_SKEW:
        raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
    for key in ("active_payload_sha256", "candidate_payload_sha256"):
        if (not isinstance(review[key], str) or len(review[key]) != 64
                or any(character not in "0123456789abcdef" for character in review[key].lower())):
            raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
    if (review["candidate_payload_sha256"] != payload_sha256
            or review["source_revision_id"] != source_revision_id):
        raise ObservationWriteError("SOURCE_YEAR_REVIEW_STALE")
    if keys == base_fields | token_fields:
        for key in token_fields:
            value = review.get(key)
            if not isinstance(value, str) or not value.strip() or len(value) > 500:
                raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
        for key in ("active_payload_sha256", "candidate_payload_sha256"):
            if re.fullmatch(r"[0-9a-f]{64}", review[key]) is None:
                raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
        for key in ("active_source_hash", "source_hash"):
            if re.fullmatch(r"[0-9a-f]{32}", review[key]) is None:
                raise ObservationWriteError("SOURCE_YEAR_REVIEW_INVALID")
        if review["source_revision_id"] != f"{review['source_version']}|md5:{review['source_hash']}":
            raise ObservationWriteError("SOURCE_YEAR_REVIEW_STALE")
        if review["active_source_revision_id"] != (
            f"{review['active_source_version']}|md5:{review['active_source_hash']}"
        ):
            raise ObservationWriteError("SOURCE_YEAR_REVIEW_STALE")
    return dict(review)


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

    try:
        grain = period_grain or _infer_grain(observation["observed_at"])
    except (TypeError, ObservationWriteError) as exc:
        raise ObservationWriteError("PERIOD_GRAIN_INVALID") from exc
    if grain == "source_year_label":
        source_year_be = observation.get("source_year_be")
        if source_year_be is None or observation["observed_at"] is not None:
            raise ObservationWriteError("PERIOD_GRAIN_INVALID")
        period_start, period_end, period_label = None, None, f"พ.ศ. {source_year_be}"
    elif grain == "source_year_token":
        source_year_label = observation.get("source_year_label")
        if not isinstance(source_year_label, str) or observation["observed_at"] is not None:
            raise ObservationWriteError("PERIOD_GRAIN_INVALID")
        if observation.get("source_year_be") is not None:
            raise ObservationWriteError("PERIOD_GRAIN_INVALID")
        period_start, period_end, period_label = None, None, source_year_label
    elif grain in ("daily", "monthly", "point"):
        if (observation.get("source_year_be") is not None
                or observation.get("source_year_label") is not None
                or observation["observed_at"] is None):
            raise ObservationWriteError("PERIOD_GRAIN_INVALID")
        period_start, period_end, period_label = _period(observation["observed_at"], grain)
    else:
        raise ObservationWriteError("PERIOD_GRAIN_INVALID")
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
        "source_row_ref": observation.get("source_row_id") or observation["observation_id"],
        "product": _row_product(product, observation, resource),
        "metric_name": metric_name or _default_metric_name(measure),
        "unit": effective_unit,
        "dimensions": _json(dimensions),
        "quality": _json(quality),
        "provenance": (
            observation["data_kind"], observation["quality_flag"], observation["license_status"],
            observation["source_url"], observation["release_at"], observation["revision_id"],
        ),
    }


def _row_product(product: str | Mapping[str, str] | None, observation: Mapping[str, Any],
                 resource: Mapping[str, Any]) -> str | None:
    """Resolve a fixed product label or an exact per-observation label map."""
    if isinstance(product, Mapping):
        value = product.get(observation["observation_id"])
        if not isinstance(value, str) or not value.strip():
            raise ObservationWriteError("PRODUCT_MAPPING_MISSING")
        return value
    return product if product is not None else resource.get("name")


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


def _observation_sql(columns: tuple, *, source_snapshot_guard_fields: int = 0) -> str:
    cache_key = (columns, source_snapshot_guard_fields)
    cached = _OBSERVATION_SQL_CACHE.get(cache_key)
    if cached is not None:
        return cached
    updates = ", ".join(f"{column}=excluded.{column}" for column in columns if column not in _KEY_COLUMNS)
    if source_snapshot_guard_fields:
        owner_predicate = (
            "snapshot.resource_id=? AND snapshot.run_id=? AND snapshot.status='running' "
            "AND snapshot.source_year_writer_token IS ? AND snapshot.source_retrieved_at IS ? "
            "AND snapshot.source_revision_id IS ? AND snapshot.payload_sha256 IS ?"
        )
        if source_snapshot_guard_fields == 9:
            owner_predicate += (
                " AND snapshot.source_year_label IS ? AND snapshot.source_version IS ? "
                "AND snapshot.source_hash IS ?"
            )
        sql = (
            "INSERT INTO observations (" + ", ".join(columns) + ") "
            + "SELECT " + ", ".join("?" for _ in columns) + " FROM sync_runs snapshot WHERE "
            + owner_predicate
            + " ON CONFLICT(" + ", ".join(_KEY_COLUMNS) + ") DO UPDATE SET " + updates
            + " WHERE EXISTS (SELECT 1 FROM sync_runs snapshot WHERE " + owner_predicate + ")"
            + " RETURNING row_key"
        )
    else:
        sql = (
            "INSERT INTO observations (" + ", ".join(columns) + ") "
            + "VALUES (" + ", ".join("?" for _ in columns) + ") "
            + "ON CONFLICT(" + ", ".join(_KEY_COLUMNS) + ") DO UPDATE SET " + updates
        )
    _OBSERVATION_SQL_CACHE[cache_key] = sql
    return sql


def _extended_columns(client) -> tuple:
    """Return the optional provenance columns this D1 database already has."""
    try:
        client.execute(_EXTENSION_PROBE_SQL, [])
    except Exception:
        return ()
    return _EXTENSION_OBSERVATION_COLUMNS


def _has_run_source_revision_column(client) -> bool:
    """Check for the additive annual snapshot revision migration."""
    try:
        client.execute("SELECT source_revision_id FROM sync_runs WHERE 0=1", [])
    except Exception as exc:
        if "no such column" in str(exc).lower():
            return False
        raise ObservationWriteError("SYNC_RUN_SCHEMA_PROBE_FAILED") from exc
    return True


def _preflight_source_year_schema(
    client, *, source_year_token_mode: bool, include_locations: bool,
) -> None:
    """Check annual columns, unique targets, and foreign keys in one read-only query.

    SQLite's table-valued PRAGMA functions expose index and foreign-key metadata
    inside one SELECT. This runs before catalog/run/location/observation writes.
    """
    required_columns = {
        "sources": (
            "source_id", "source_name", "base_url", "connector_kind", "status", "metadata_access_status",
        ),
        "datasets": (
            "dataset_id", "source_id", "source_dataset_id", "title", "description", "category", "owner",
            "source_url", "metadata_access_status", "metadata",
        ),
        "resources": (
            "resource_id", "dataset_id", "source_resource_id", "name", "format", "resource_url",
            "access_status", "declared_license", "license_url", "project_publication_approved", "grain",
            "source_updated_at", "metadata", "active_run_id",
        ),
        "sync_runs": (
            "run_id", "source_id", "resource_id", "kind", "status", "started_at", "completed_at",
            "source_retrieved_at", "records_read", "records_written", "records_quarantined",
            "payload_sha256", "adapter_version", "error_code", "source_revision_id",
            "source_year_writer_token",
        ),
        "observations": (
            "resource_id", "run_id", "row_key", "series_key", "period_start", "period_end", "period_label",
            "location_id", "location_code", "location_kind", "location_name", "province_code", "crop_code",
            "crop_name", "metric_id", "metric_name", "product", "grade", "market", "unit", "value",
            "dimensions", "source_row_ref", "quality_status", "quality",
        ),
    }
    if source_year_token_mode:
        required_columns["sync_runs"] += ("source_year_label", "source_version", "source_hash")
    if include_locations:
        required_columns["locations"] = (
            "location_id", "source_id", "kind", "native_code", "name", "province_code",
        )

    value_rows = [
        f"('{table}','{column}')"
        for table, columns in required_columns.items()
        for column in columns
    ]
    values_sql = ", ".join(value_rows)
    sql = f"""
        WITH required_columns(table_name,column_name) AS (VALUES {values_sql}),
        selected_tables(table_name) AS (
            SELECT DISTINCT table_name FROM required_columns
        ),
        column_metadata AS (
            SELECT required.table_name,required.column_name,actual.name AS matched_column
            FROM required_columns required
            LEFT JOIN pragma_table_info(required.table_name) actual
              ON lower(actual.name)=lower(required.column_name)
        ),
        index_metadata AS (
            SELECT selected.table_name,indexes.name AS index_name,indexes."unique" AS is_unique,
                   indexes.partial AS is_partial,columns.seqno,columns.name AS column_name
            FROM selected_tables selected
            JOIN pragma_index_list(selected.table_name) indexes
            JOIN pragma_index_info(indexes.name) columns
        ),
        foreign_key_metadata AS (
            SELECT selected.table_name,foreign_keys.id AS fk_id,foreign_keys.seq AS fk_seq,
                   foreign_keys."table" AS parent_table,foreign_keys."from" AS from_column,
                   foreign_keys."to" AS to_column
            FROM selected_tables selected
            JOIN pragma_foreign_key_list(selected.table_name) foreign_keys
        )
        SELECT 'missing_column' AS kind,table_name,column_name,NULL AS index_name,
               NULL AS is_unique,NULL AS is_partial,NULL AS seqno,NULL AS fk_id,NULL AS fk_seq,
               NULL AS parent_table,NULL AS from_column,NULL AS to_column
        FROM column_metadata WHERE matched_column IS NULL
        UNION ALL
        SELECT 'index' AS kind,table_name,column_name,index_name,is_unique,is_partial,seqno,
               NULL AS fk_id,NULL AS fk_seq,NULL AS parent_table,NULL AS from_column,NULL AS to_column
        FROM index_metadata
        UNION ALL
        SELECT 'foreign_key' AS kind,table_name,NULL AS column_name,NULL AS index_name,
               NULL AS is_unique,NULL AS is_partial,NULL AS seqno,fk_id,fk_seq,parent_table,
               from_column,to_column
        FROM foreign_key_metadata
    """
    try:
        result = client.execute(sql, [])
    except Exception as exc:
        raise ObservationWriteError("SOURCE_YEAR_SCHEMA_PROBE_FAILED") from exc
    rows = result.get("results") if isinstance(result, dict) else None
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ObservationWriteError("SOURCE_YEAR_SCHEMA_PROBE_FAILED")

    base_columns = {
        (table, column)
        for table, columns in required_columns.items()
        for column in columns
    } - {
        ("sync_runs", "source_revision_id"),
        ("sync_runs", "source_year_writer_token"),
        ("sync_runs", "source_year_label"),
        ("sync_runs", "source_version"),
        ("sync_runs", "source_hash"),
    }
    missing_columns = {
        (str(row.get("table_name")), str(row.get("column_name")))
        for row in rows if row.get("kind") == "missing_column"
    }
    if missing_columns & base_columns:
        raise ObservationWriteError("SOURCE_YEAR_BASE_SCHEMA_REQUIRED")
    if ("sync_runs", "source_revision_id") in missing_columns:
        raise ObservationWriteError("SOURCE_YEAR_SNAPSHOT_SCHEMA_REQUIRED")
    if ("sync_runs", "source_year_writer_token") in missing_columns:
        raise ObservationWriteError("SOURCE_YEAR_WRITER_TOKEN_SCHEMA_REQUIRED")
    if source_year_token_mode and missing_columns & {
        ("sync_runs", "source_year_label"), ("sync_runs", "source_version"), ("sync_runs", "source_hash"),
    }:
        raise ObservationWriteError("SOURCE_YEAR_TOKEN_SCHEMA_REQUIRED")

    unique_keys = set()
    index_groups = {}
    for row in rows:
        if row.get("kind") != "index" or row.get("index_name") is None:
            continue
        group_key = (str(row.get("table_name")).casefold(), str(row["index_name"]))
        group = index_groups.setdefault(group_key, {
            "unique": row.get("is_unique") == 1 or row.get("is_unique") is True,
            "partial": row.get("is_partial") == 1 or row.get("is_partial") is True,
            "columns": [],
        })
        group["columns"].append((int(row.get("seqno", -1)), row.get("column_name")))
    for (table, _index_name), group in index_groups.items():
        if not group["unique"] or group["partial"]:
            continue
        ordered = sorted(group["columns"], key=lambda item: item[0])
        if any(not isinstance(column, str) for _seq, column in ordered):
            continue
        unique_keys.add((table, tuple(column.casefold() for _seq, column in ordered)))

    required_unique_keys = {
        ("sources", ("source_id",)),
        ("datasets", ("dataset_id",)),
        ("datasets", ("source_id", "source_dataset_id")),
        ("resources", ("resource_id",)),
        ("sync_runs", ("run_id",)),
        ("sync_runs", ("resource_id", "run_id")),
        ("observations", ("resource_id", "run_id", "row_key")),
    }
    if include_locations:
        required_unique_keys.update({
            ("locations", ("location_id",)),
            ("locations", ("source_id", "kind", "native_code")),
        })
    if not required_unique_keys.issubset(unique_keys):
        missing_key = sorted(required_unique_keys - unique_keys)[0]
        raise ObservationWriteError(
            "SOURCE_YEAR_SCHEMA_CONSTRAINT_REQUIRED",
            f"missing unique key {missing_key[0]}({','.join(missing_key[1])})",
        )

    foreign_key_groups = {}
    for row in rows:
        if row.get("kind") != "foreign_key":
            continue
        group_key = (str(row.get("table_name")).casefold(), str(row.get("fk_id")))
        foreign_key_groups.setdefault(group_key, []).append((
            int(row.get("fk_seq", -1)),
            row.get("parent_table"),
            row.get("from_column"),
            row.get("to_column"),
        ))
    foreign_keys = set()
    for (table, _fk_id), entries in foreign_key_groups.items():
        ordered = sorted(entries, key=lambda item: item[0])
        parent_tables = {str(parent).casefold() for _seq, parent, _from, _to in ordered}
        if len(parent_tables) != 1:
            continue
        from_columns = tuple(str(source).casefold() for _seq, _parent, source, _to in ordered)
        to_columns = tuple(str(target).casefold() for _seq, _parent, _from, target in ordered)
        foreign_keys.add((table, next(iter(parent_tables)), from_columns, to_columns))
    required_foreign_keys = {
        ("datasets", "sources", ("source_id",), ("source_id",)),
        ("resources", "datasets", ("dataset_id",), ("dataset_id",)),
        ("resources", "sync_runs", ("resource_id", "active_run_id"), ("resource_id", "run_id")),
        ("sync_runs", "sources", ("source_id",), ("source_id",)),
        ("sync_runs", "resources", ("resource_id",), ("resource_id",)),
        ("observations", "resources", ("resource_id",), ("resource_id",)),
        ("observations", "sync_runs", ("resource_id", "run_id"), ("resource_id", "run_id")),
    }
    if include_locations:
        required_foreign_keys.update({
            ("locations", "sources", ("source_id",), ("source_id",)),
            ("observations", "locations", ("location_id",), ("location_id",)),
        })
    if not required_foreign_keys.issubset(foreign_keys):
        missing_fk = sorted(required_foreign_keys - foreign_keys)[0]
        raise ObservationWriteError(
            "SOURCE_YEAR_SCHEMA_CONSTRAINT_REQUIRED",
            f"missing foreign key {missing_fk[0]}({','.join(missing_fk[2])}) "
            f"to {missing_fk[1]}({','.join(missing_fk[3])})",
        )


def _has_source_year_writer_token_column(client) -> bool:
    """Check the additive CAS-token migration used only by annual snapshots."""
    try:
        client.execute("SELECT source_year_writer_token FROM sync_runs WHERE 0=1", [])
    except Exception as exc:
        if "no such column" in str(exc).lower():
            return False
        raise ObservationWriteError("SYNC_RUN_SCHEMA_PROBE_FAILED") from exc
    return True


def _has_source_year_token_columns(client) -> bool:
    """Check additive metadata columns required for opaque source-year snapshots."""
    try:
        client.execute(
            "SELECT source_year_label,source_version,source_hash FROM sync_runs WHERE 0=1", []
        )
    except Exception as exc:
        if "no such column" in str(exc).lower():
            return False
        raise ObservationWriteError("SYNC_RUN_SCHEMA_PROBE_FAILED") from exc
    return True


def _observation_statement(run_id: str, resource_id: str, entry: dict,
                           extended: tuple = (),
                           source_snapshot_guard: tuple | None = None
                           ) -> tuple[str, list]:
    observation = entry["observation"]
    location = entry["location"]
    period_start, period_end, period_label = entry["period"]
    values = [
        resource_id, run_id, observation["observation_id"], entry["series_key"],
        period_start, period_end, period_label,
        location["location_id"] if location else None,
        location["location_id"] if location else None,
        location["kind"] if location else None,
        location["name"] if location else None,
        observation["area_code"], None,
        observation["measure"], entry["metric_name"], entry["product"],
        observation["grade"], observation["market_id"],
        entry["unit"], observation["value"],
        entry["dimensions"], entry["source_row_ref"], observation["quality_flag"], entry["quality"],
    ]
    if extended:
        values.extend(entry["provenance"])
    if source_snapshot_guard is not None:
        values.extend(source_snapshot_guard)
        values.extend(source_snapshot_guard)
    return _observation_sql(
        _BASE_OBSERVATION_COLUMNS + extended,
        source_snapshot_guard_fields=(len(source_snapshot_guard) if source_snapshot_guard is not None else 0),
    ), values


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


def _location(source_id: str, observation: dict, override: Mapping[str, Any] | None) -> dict | None:
    spatial = observation["spatial_support"]
    if spatial == "not_reported":
        return None
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


def _validate_source_year_location_mappings(plan: Sequence[Mapping[str, Any]]) -> set[str]:
    """Require each source-year location ID and natural key to map one-to-one.

    The shared ``locations`` table is global across snapshots. Conflicting
    duplicate metadata must be rejected before catalog or run writes, since
    ``(source_id, kind, native_code)`` is the upsert key while ``location_id``
    is the primary key.
    """
    metadata_by_id = {}
    metadata_by_natural_key = {}
    for entry in plan:
        location = entry["location"]
        if location is None:
            continue
        location_id = location.get("location_id")
        source_id = location.get("source_id")
        kind = location.get("kind")
        native_code = location.get("native_code")
        name = location.get("name")
        province_code = location.get("province_code")
        if (not isinstance(location_id, str) or not location_id.strip()
                or not isinstance(source_id, str) or not source_id.strip()
                or not isinstance(kind, str) or not kind.strip()
                or not isinstance(native_code, str) or not native_code.strip()
                or not isinstance(name, str) or not name.strip()
                or (province_code is not None and not isinstance(province_code, str))):
            raise ObservationWriteError("SOURCE_YEAR_LOCATION_CONFLICT")

        metadata = (location_id, source_id, kind, native_code, name, province_code)
        natural_key = (source_id, kind, native_code)
        prior_by_id = metadata_by_id.get(location_id)
        prior_by_natural_key = metadata_by_natural_key.get(natural_key)
        if ((prior_by_id is not None and prior_by_id != metadata)
                or (prior_by_natural_key is not None and prior_by_natural_key != metadata)):
            raise ObservationWriteError(
                "SOURCE_YEAR_LOCATION_CONFLICT",
                "location_id and (source_id, kind, native_code) must identify one matching metadata record",
            )
        metadata_by_id[location_id] = metadata
        metadata_by_natural_key[natural_key] = metadata
    return set(metadata_by_id)


def _validate_batch_location_identity(plan: Sequence[Mapping[str, Any]]) -> None:
    """Refuse a batch whose location IDs and natural keys are not one-to-one."""
    key_by_location_id: dict[str, tuple] = {}
    location_id_by_key: dict[tuple, str] = {}
    for entry in plan:
        location = entry["location"]
        if location is None:
            continue
        location_id = location["location_id"]
        natural_key = (location["source_id"], location["kind"], location["native_code"])
        prior_key = key_by_location_id.get(location_id)
        if prior_key is not None and prior_key != natural_key:
            raise ObservationWriteError("LOCATION_IDENTITY_CONFLICT")
        prior_location_id = location_id_by_key.get(natural_key)
        if prior_location_id is not None and prior_location_id != location_id:
            raise ObservationWriteError("LOCATION_IDENTITY_CONFLICT")
        key_by_location_id[location_id] = natural_key
        location_id_by_key[natural_key] = location_id


def _distinct_locations(plan: Sequence[Mapping[str, Any]]) -> list[dict]:
    """The distinct locations of one batch, in first-seen order."""
    distinct: dict[str, dict] = {}
    for entry in plan:
        location = entry["location"]
        if location is None:
            continue
        stored = distinct.get(location["location_id"])
        if stored is None:
            distinct[location["location_id"]] = dict(location)
        elif location.get("province_code") is not None:
            stored["province_code"] = location["province_code"]
    return list(distinct.values())


def _plan_location_count(plan: Sequence[Mapping[str, Any]]) -> int:
    """The number of distinct locations a batch covers."""
    return len({
        entry["location"]["location_id"]
        for entry in plan if entry["location"] is not None
    })


def _dimensions(observation: dict, effective_unit: str | None,
                dimensions_for: Callable[[dict], dict] | None) -> dict:
    if dimensions_for is not None:
        custom = dimensions_for(observation)
        if not isinstance(custom, dict):
            raise ObservationWriteError("DIMENSIONS_INVALID")
        dimensions = dict(custom)
        if observation.get("source_year_be") is not None:
            dimensions.setdefault("sourceYearBe", observation["source_year_be"])
        if observation.get("source_year_label") is not None:
            dimensions.setdefault("sourceYearLabel", observation["source_year_label"])
        return dimensions
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
    if observation.get("source_year_be") is not None:
        dimensions["sourceYearBe"] = observation["source_year_be"]
    if observation.get("source_year_label") is not None:
        dimensions["sourceYearLabel"] = observation["source_year_label"]
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
        # Daily products follow the calendar day encoded by the observation's
        # timezone offset.  Converting an ICT midnight to UTC first would move
        # it to the previous date and lose the provider's daily period label.
        day = datetime.fromisoformat(observed_at.replace("Z", "+00:00")).date().isoformat()
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
    if resource.get("publication_authorization") is not None:
        metadata["publicationAuthorization"] = resource["publication_authorization"]
    if resource.get("unresolved"):
        metadata["sourceLicenseReview"] = {
            "status": "unverified",
            "unresolved": list(resource["unresolved"]),
            "declaredLicense": license_info,
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
    """Hash the *logical* batch for run-id derivation (defects D-2/D-4).

    Only the durable identity and publication semantics of each observation
    take part (see :func:`_logical_row`): the observation id, its period, unit
    and value, the fields that give the value meaning (measure, spatial
    support, data kind, area/province, commodity, market, grade, price type,
    season), the location identity, the publication labels and the published
    ``dimensions`` minus volatile request keys. A corrected province/area,
    commodity, market or grade therefore derives a new run id instead of being
    skipped as identical (defect D-4).

    Volatile per-row fields are excluded on purpose so that re-running the
    same logical day derives the same run id and reports ``skipped_identical``
    instead of minting a new run and orphaning the previous rows (defect D-2):
    ``retrieved_at``, provider ``revision_id`` values (LastBuildDate/ETag
    churn), ``release_at`` and echoed per-request stamps such as GISTDA's
    ``sourceTimeStamp``. ``observed_at`` participates at the run's declared
    grain: a daily/monthly product is identified by its period (period start
    and end), because some providers — the GISTDA flood service is the live
    example — echo a per-request timestamp into ``observed_at`` and an
    instant-level comparison would keep churning runs for an unchanged day.
    Point-grain runs keep the raw instant (their period is the exact
    ``observed_at``), so genuinely different measurements still derive
    different runs. The rows still store their real ``retrieved_at``/
    ``revision_id``/``observed_at`` provenance as-is.
    """
    logical = sorted(
        _json(_logical_row(resource_id, entry))
        for entry in plan
    )
    return hashlib.sha256(_json(logical).encode("utf-8")).hexdigest()


def _logical_row(resource_id: str, entry: Mapping[str, Any]) -> list:
    """Durable identity and publication semantics of one planned observation."""
    observation = entry["observation"]
    location = entry["location"] or {}
    return [
        resource_id,
        observation["observation_id"],
        entry["period"][0],
        entry["period"][1],
        entry["unit"],
        observation["value"],
        observation["measure"],
        observation["spatial_support"],
        observation["data_kind"],
        observation["area_code"],
        observation["commodity_id"],
        observation["market_id"],
        observation["grade"],
        observation["price_type"],
        observation["season"],
        location.get("location_id"),
        location.get("kind"),
        location.get("native_code"),
        location.get("province_code"),
        location.get("name"),
        entry["product"],
        entry["metric_name"],
        _semantic_dimensions(entry["dimensions"]),
    ]


def _semantic_dimensions(dimensions_json: str) -> str:
    """Canonical digest of published dimensions minus volatile request stamps."""
    dimensions = json.loads(dimensions_json)
    semantic = {
        key: value for key, value in dimensions.items()
        if _dimension_key(key) not in VOLATILE_DIMENSION_KEYS
    }
    return json.dumps(semantic, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"), allow_nan=False)


def _dimension_key(key: Any) -> str:
    return "".join(character for character in str(key).lower() if character.isalnum())


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


def _upsert_location(
    client, location: Mapping[str, Any] | None, *,
    source_year_guard: tuple | None = None,
) -> None:
    if location is None:
        return
    values = [location["location_id"], location["source_id"], location["kind"],
              location["native_code"], location["name"], location["province_code"]]
    if source_year_guard is None:
        sql = (
            "INSERT INTO locations (location_id, source_id, kind, native_code, name, province_code) "
            "SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS ("
            "SELECT 1 FROM locations existing_id WHERE existing_id.location_id=? AND ("
            "existing_id.source_id IS NOT ? OR existing_id.kind IS NOT ? OR "
            "existing_id.native_code IS NOT ?)) "
            "ON CONFLICT(source_id, kind, native_code) DO UPDATE SET "
            "name=excluded.name, province_code=COALESCE(excluded.province_code, locations.province_code) "
            "WHERE locations.location_id=excluded.location_id RETURNING location_id"
        )
        result = client.execute(sql, values + values[:1] + values[1:4])
        if _returned(result, "location_id", location["location_id"]):
            return
        if _daily_location_identity_conflicts(client, location):
            raise ObservationWriteError("LOCATION_IDENTITY_CONFLICT")
        raise ObservationWriteError("LOCATION_UPSERT_FAILED")

    owner_predicate = (
        "snapshot.resource_id=? AND snapshot.run_id=? AND snapshot.status='running' "
        "AND snapshot.source_year_writer_token IS ? AND snapshot.source_retrieved_at IS ? "
        "AND snapshot.source_revision_id IS ? AND snapshot.payload_sha256 IS ?"
    )
    if len(source_year_guard) == 9:
        owner_predicate += (
            " AND snapshot.source_year_label IS ? AND snapshot.source_version IS ? "
            "AND snapshot.source_hash IS ?"
        )
    sql = (
        "INSERT INTO locations (location_id, source_id, kind, native_code, name, province_code) "
        "SELECT ?, ?, ?, ?, ?, ? FROM sync_runs snapshot WHERE " + owner_predicate
        + " AND NOT EXISTS (SELECT 1 FROM locations existing_id WHERE "
        "existing_id.location_id=? AND (existing_id.source_id IS NOT ? OR "
        "existing_id.kind IS NOT ? OR existing_id.native_code IS NOT ?)) "
        + " ON CONFLICT(source_id, kind, native_code) DO UPDATE SET "
        "name=excluded.name, province_code=COALESCE(excluded.province_code, locations.province_code) "
        "WHERE locations.location_id=excluded.location_id AND "
        "EXISTS (SELECT 1 FROM sync_runs snapshot WHERE " + owner_predicate + ") "
        "RETURNING location_id"
    )
    result = client.execute(
        sql,
        values + list(source_year_guard) + values[:1] + values[1:4] + list(source_year_guard),
    )
    if not _returned(result, "location_id", location["location_id"]):
        diagnosis = client.execute(
            "SELECT EXISTS(SELECT 1 FROM sync_runs snapshot WHERE " + owner_predicate + ") AS is_owner, "
            "(SELECT location_id FROM locations WHERE source_id=? AND kind=? AND native_code=?) "
            "AS natural_location_id, "
            "(SELECT source_id FROM locations WHERE location_id=?) AS stored_id_source, "
            "(SELECT kind FROM locations WHERE location_id=?) AS stored_id_kind, "
            "(SELECT native_code FROM locations WHERE location_id=?) AS stored_id_native_code",
            list(source_year_guard) + [location["source_id"], location["kind"], location["native_code"]]
            + [location["location_id"]] * 3,
        )
        diagnostic = _first_row(diagnosis)
        if diagnostic is None or diagnostic.get("is_owner") not in (1, True, "1"):
            raise ObservationWriteError("SOURCE_YEAR_RUN_OWNERSHIP_LOST")
        natural_location_id = diagnostic.get("natural_location_id")
        stored_id_natural_key = (
            diagnostic.get("stored_id_source"),
            diagnostic.get("stored_id_kind"),
            diagnostic.get("stored_id_native_code"),
        )
        if (natural_location_id not in (None, location["location_id"])
                or (stored_id_natural_key[0] is not None and stored_id_natural_key != (
                    location["source_id"], location["kind"], location["native_code"],
                ))):
            raise ObservationWriteError("SOURCE_YEAR_LOCATION_IDENTITY_CONFLICT")
        raise ObservationWriteError("SOURCE_YEAR_LOCATION_WRITE_FAILED")


def _daily_location_identity_conflicts(client, location: Mapping[str, Any]) -> bool:
    result = client.execute(
        "SELECT "
        "(SELECT location_id FROM locations WHERE source_id=? AND kind=? AND native_code=?) "
        "AS natural_location_id, "
        "(SELECT source_id FROM locations WHERE location_id=?) AS stored_id_source, "
        "(SELECT kind FROM locations WHERE location_id=?) AS stored_id_kind, "
        "(SELECT native_code FROM locations WHERE location_id=?) AS stored_id_native_code",
        [location["source_id"], location["kind"], location["native_code"]]
        + [location["location_id"]] * 3,
    )
    row = _first_row(result)
    if row is None:
        return False
    natural_location_id = row.get("natural_location_id")
    stored_id_natural_key = (
        row.get("stored_id_source"), row.get("stored_id_kind"), row.get("stored_id_native_code"),
    )
    return (
        natural_location_id not in (None, location["location_id"])
        or (stored_id_natural_key[0] is not None
            and stored_id_natural_key != (location["source_id"], location["kind"], location["native_code"]))
    )


def _row_matches(client, resource_id: str, run_id: str, entry: dict) -> bool:
    """True when the run already stores exactly this row (idempotent re-run)."""
    result = client.execute(
        "SELECT value, unit, dimensions, quality, source_row_ref FROM observations "
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
        and row.get("source_row_ref") == entry["source_row_ref"]
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


def _execute_claim(client, sql: str, params: Sequence[Any], *, run_id: str, writer_token: str):
    """A claim whose response is lost must not strand the run as ``running``: close it under our own token."""
    try:
        return client.execute(sql, params)
    except Exception as exc:
        _mark_failed(client, run_id, "RUN_CLAIM_FAILED", source_year_writer_token=writer_token)
        raise ObservationWriteError("RUN_CLAIM_FAILED") from exc


def _mark_failed(client, run_id: str, error_code: str = "NUMERIC_WRITE_FAILED", *,
                 source_year_writer_token: str | None = None) -> None:
    try:
        if source_year_writer_token is None:
            client.execute(
                "UPDATE sync_runs SET status='failed', completed_at=?, error_code=? "
                "WHERE run_id=? AND status='running'",
                [_iso(_now()), error_code, run_id],
            )
        else:
            client.execute(
                "UPDATE sync_runs SET status='failed',completed_at=?,error_code=? "
                "WHERE run_id=? AND status='running' AND source_year_writer_token IS ?",
                [_iso(_now()), error_code, run_id, source_year_writer_token],
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


_SOURCE_VERSION_FORMAT = re.compile(
    r"\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})?\Z",
    re.ASCII,
)


def _source_version_order_key(value: str) -> tuple[str, datetime]:
    """Parse a source-owned ISO token without assigning a timezone to naive values.

    Comparable only within the same explicit-timezone class. Offset-aware
    tokens compare as instants; naive values compare as source wall-clock
    fields and are never normalized to UTC. Callers must fail closed when the
    active and candidate classes differ.
    """
    if not isinstance(value, str) or not _SOURCE_VERSION_FORMAT.fullmatch(value):
        raise ObservationWriteError("SOURCE_VERSION_INVALID")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ObservationWriteError("SOURCE_VERSION_INVALID") from exc
    if parsed.tzinfo is None:
        return "naive", parsed
    return "aware", parsed.astimezone(timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
