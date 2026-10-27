#!/usr/bin/env python
"""TMD HPC NWP CLI: list / fetch / normalize / export / publish to Cloudflare D1.

This script is the entry point of the TMD HPC NWP pipeline described in
``docs/assignments/2026-10-26-tmd-hpc-nwp-integration.md`` (Round 2 / Lane C).
It reuses the modules owned by the other lanes and owns the D1 publisher:

* Lane A — ``tadih.tmd_hpc_nwp``: listing, bounded probing, download, manifest.
* Lane B — ``tadih.tmd_hpc_normalize``: CSV parsing, 0.15 deg downsampling and
  province aggregation (imported lazily so the other commands still work while
  Lane B is being written).
* Lane C — this file plus ``db/cloudflare/0003_nwp.sql``: export contract,
  payload validation, D1 writer, retention.

Ownership note: ``src/tadih/cli.py`` belongs to Round 1 of the programme and is
NOT modified here; this script is the command line entry point instead.

Governance rules that are enforced (not just documented):

* Forecast values never enter the ``observations`` table; they are written to
  ``nwp_runs`` / ``nwp_snapshots`` / ``nwp_province_values`` only.
* ``unit`` stays NULL until TMD confirms the variable definitions. The writer
  takes ``license_status`` from the exact approved registry row; an export
  payload may never self-declare ``approved_public``.
* ``--write`` fails closed without D1 credentials (``D1_NOT_CONFIGURED``,
  exit code 2) and without an approved licence registry entry
  (``RESOURCE_APPROVAL_MISSING`` / ``RESOURCE_NOT_APPROVED``). There is no
  mock or partial fallback.
* Every statement is a prepared statement with bound parameters; no data value
  is ever interpolated into SQL.
* Writes are idempotent: the canonical export payload is hashed
  (``payload_sha256``) and stored on ``nwp_runs``; republishing an identical
  payload reports ``skipped_identical`` instead of duplicating rows — but only
  when the stored run finished (``ready``/``partial``) and its child rows still
  match the export. A failed or incomplete run is repaired by re-upserting all
  of its children.
* A run stays unreadable while it is written: the row is saved as ``failed``
  (the only non-publishable status the schema allows) and is switched to its
  declared status only after every snapshot and province row exists.

Exit codes: 0 = ok, 1 = validation/data error, 2 = configuration missing
(``D1_NOT_CONFIGURED``).

The last line printed on stdout is always a machine-readable JSON summary.
"""

from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

import tadih.env  # noqa: F401  (importing the module loads .env into os.environ)

from tadih.catalog import load_resource_licenses  # noqa: E402
from tadih.hub_catalog_sync import CatalogSyncError, connect_d1_client  # noqa: E402
from tadih.tmd_hpc_nwp import (  # noqa: E402
    DEFAULT_DOMAIN,
    DOMAINS,
    V1_VARIABLES,
    TmdHpcError,
    download_run,
    list_download_files,
    load_manifest,
    probe_files,
    verify_manifest,
)

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

LOCAL_ROOT = ROOT / "data/local/tmd_nwp_hpc"
MANIFEST_DIR = LOCAL_ROOT / "manifests"
NORMALIZED_DIR = LOCAL_ROOT / "normalized"
EXPORT_DIR = LOCAL_ROOT / "exports"
RAW_ROOT = LOCAL_ROOT / "raw"

SOURCE_ID = "tmd_hpc_nwp"
NWP_RESOURCE_KEY = "tmd_hpc_nwp_d02_grid"
EXPORT_VERSION = 1
DEFAULT_MAX_BYTES = 200_000_000
MAX_GRID_CELLS = 12_000            # work order §4.5 / gate G8
MAX_ROW_BYTES = 1_500_000          # D1 row budget for one snapshot row
RETENTION_KEEP_PER_DOMAIN = 3      # work order §3.6
RETENTION_MAX_AGE_DAYS = 7         # work order §3.6
PROBE_BYTES = 2048                 # bounded probe body (work order Lane A)
RISK_LEVELS = ("normal", "watch", "high", "severe")
PUBLICATION_MODES = ("numeric_preview", "metadata_only")
# Statuses the public readers serve. Anything else (notably the transient
# ``failed`` written while children are being stored) is not published.
FINAL_RUN_STATUSES = ("ready", "partial")
TRANSIENT_RUN_STATUS = "failed"
RUN_ID_RE = re.compile(r"^[a-z0-9_]{8,80}$")
INIT_TIME_RE = re.compile(r"^[0-9]{10}$")

NWP_INVALID_ARGUMENT = "NWP_INVALID_ARGUMENT"
NWP_MANIFEST_NOT_FOUND = "NWP_MANIFEST_NOT_FOUND"
NWP_NORMALIZED_NOT_FOUND = "NWP_NORMALIZED_NOT_FOUND"
NWP_EXPORT_NOT_FOUND = "NWP_EXPORT_NOT_FOUND"
NWP_EXPORT_INVALID = "NWP_EXPORT_INVALID"
NWP_GRID_LENGTH_MISMATCH = "NWP_GRID_LENGTH_MISMATCH"
NWP_GRID_TOO_LARGE = "NWP_GRID_TOO_LARGE"
NWP_NON_FINITE_VALUE = "NWP_NON_FINITE_VALUE"
NWP_UNKNOWN_SNAPSHOT_REFERENCE = "NWP_UNKNOWN_SNAPSHOT_REFERENCE"
NWP_MISSING_UNIT_FIELD = "NWP_MISSING_UNIT_FIELD"
NWP_LICENSE_CLAIM_INVALID = "NWP_LICENSE_CLAIM_INVALID"
NWP_PAYLOAD_TOO_LARGE = "NWP_PAYLOAD_TOO_LARGE"
NWP_NORMALIZER_UNAVAILABLE = "NWP_NORMALIZER_UNAVAILABLE"
NWP_WRITE_FAILED = "NWP_WRITE_FAILED"
D1_NOT_CONFIGURED = "D1_NOT_CONFIGURED"
RESOURCE_APPROVAL_MISSING = "RESOURCE_APPROVAL_MISSING"
RESOURCE_NOT_APPROVED = "RESOURCE_NOT_APPROVED"

EXIT_OK = 0
EXIT_INVALID = 1
EXIT_NOT_CONFIGURED = 2


class NwpCliError(RuntimeError):
    """A user-visible failure carrying a stable machine-readable ``code``."""

    def __init__(self, code: str, message: str, *, exit_code: int = EXIT_INVALID):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.exit_code = exit_code


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------


def run_id_for(init_time: str, domain: str = DEFAULT_DOMAIN) -> str:
    """Build the canonical run id: ``tmd_hpc_<domain>_<YYYYMMDDHH>``."""
    return f"tmd_hpc_{domain}_{init_time}"


def canonical_json(value: Any) -> str:
    """Compact, key-sorted JSON used for hashing and for TEXT JSON columns."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False)


def payload_sha256(payload: Any) -> str:
    """SHA-256 over the canonical export payload (stable across re-runs)."""
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def _reject_constant(name: str) -> Any:
    raise NwpCliError(NWP_NON_FINITE_VALUE,
                      f"payload contains the non-finite JSON constant {name}")


def read_json(path: Path, *, missing_code: str = NWP_EXPORT_NOT_FOUND) -> Any:
    """Read JSON, refusing NaN/Infinity literals."""
    target = Path(path)
    try:
        text = target.read_text(encoding="utf-8")
    except OSError as exc:
        raise NwpCliError(missing_code, f"cannot read {target}: {exc}") from exc
    try:
        return json.loads(text, parse_constant=_reject_constant)
    except json.JSONDecodeError as exc:
        raise NwpCliError(NWP_EXPORT_INVALID, f"{target} is not valid JSON: {exc}") from exc


def write_json(path: Path, payload: Any) -> Path:
    """Write JSON atomically (temporary file + replace)."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        temporary.replace(target)
    except BaseException:
        try:
            temporary.unlink()
        except OSError:
            pass
        raise
    return target


def parse_iso(value: Any) -> Optional[datetime]:
    """Parse an ISO-8601 UTC timestamp; ``None`` when it cannot be parsed."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _number(value: Any, *, field: str, allow_none: bool = True) -> Optional[float]:
    """Return a finite float, or ``None``; raises on NaN/Infinity/garbage."""
    if value is None:
        if allow_none:
            return None
        raise NwpCliError(NWP_EXPORT_INVALID, f"{field} must not be null")
    if isinstance(value, bool):
        raise NwpCliError(NWP_EXPORT_INVALID, f"{field} must be a number, not a boolean")
    if isinstance(value, int):
        return float(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise NwpCliError(NWP_NON_FINITE_VALUE,
                              f"{field} contains a non-finite value")
        return value
    raise NwpCliError(NWP_EXPORT_INVALID, f"{field} must be a number, got {value!r}")


def _human_bytes(value: Any) -> str:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        return "-"
    number = float(value)
    for unit in ("B", "KB", "MB", "GB"):
        if number < 1024 or unit == "GB":
            return f"{number:.0f} {unit}" if unit == "B" else f"{number:.1f} {unit}"
        number /= 1024.0
    return "-"


# --------------------------------------------------------------------------
# Export contract (canonical shape produced by `export`, consumed by `publish`)
# --------------------------------------------------------------------------
#
# {
#   "export_version": 1,
#   "run": {
#     "run_id": "tmd_hpc_d02_2026102600",
#     "source_id": "tmd_hpc_nwp",
#     "domain": "d02",
#     "init_at": "2026-10-26T00:00:00Z",
#     "retrieved_at": "2026-10-26T08:30:00Z",
#     "license_status": "pending",
#     "unit_status": "pending_official_confirmation",
#     "publication_mode": "numeric_preview",
#     "variables": ["p1h", "p24h", ...],
#     "lead_hours": [0, 6, 12, 24, 48, 72],
#     "grid": {"bbox": [96.0, 5.0, 106.0, 21.0], "nx": 67, "ny": 107, ...},
#     "manifest_sha256": "..."            # optional
#   },
#   "snapshots": [
#     {"variable": "p24h", "valid_at": "2026-10-27T00:00:00Z", "unit": null,
#      "bbox": [96.0, 5.0, 106.0, 21.0], "nx": 67, "ny": 107,
#      "mean": [null, 0.0, ...], "max": [null, 1.2, ...], "quality": {}}
#   ],
#   "province_values": [
#     {"variable": "p24h", "valid_at": "2026-10-27T00:00:00Z",
#      "province_code": "10", "province_name": "กรุงเทพมหานคร", "value": 12.3,
#      "method": "max_within_25km", "radius_km": 25.0, "distance_km": 1.2,
#      "risk_level": "watch"}
#   ]
# }
#
# `mean` / `max` are row-major over the bbox and are exactly nx*ny long;
# `null` means "no source cell in that block" and is never replaced by 0.

RUN_REQUIRED_FIELDS = (
    "run_id", "source_id", "domain", "init_at", "retrieved_at",
    "license_status", "unit_status", "publication_mode",
)
RUN_COLUMNS = (
    "run_id", "source_id", "domain", "init_at", "retrieved_at", "license_status",
    "unit_status", "publication_mode", "variables_json", "lead_hours_json",
    "grid_json", "manifest_sha256", "payload_sha256", "status",
)
SNAPSHOT_COLUMNS = (
    "run_id", "variable", "valid_at", "unit", "bbox_json", "nx", "ny",
    "mean_json", "max_json", "quality_json",
)
PROVINCE_COLUMNS = (
    "run_id", "variable", "valid_at", "province_code", "province_name", "value",
    "method", "radius_km", "distance_km", "risk_level", "cell_count",
)


def _maybe_json(value: Any) -> Any:
    """Accept a JSON string as well as an already decoded structure."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            raise NwpCliError(NWP_EXPORT_INVALID, f"embedded JSON is invalid: {exc}") from exc
    return value


def canonicalize_export(raw: Any) -> dict:
    """Map a Lane B export onto the canonical export contract.

    Lane B owns ``build_export``; this function only accepts the shapes it may
    reasonably produce (flat run fields, a nested ``run`` block, ``*_json``
    string columns) and normalises them. It never invents data: a missing
    ``unit`` field stays missing so the validator can reject it.
    """
    if not isinstance(raw, dict):
        raise NwpCliError(NWP_EXPORT_INVALID, "export payload must be a JSON object")

    run = raw.get("run")
    if not isinstance(run, dict):
        run = raw.get("run_meta")
    if not isinstance(run, dict):
        run = raw.get("nwp_runs")
    if not isinstance(run, dict):
        run = {key: raw[key] for key in RUN_REQUIRED_FIELDS if key in raw}
    else:
        run = dict(run)
    for key in RUN_REQUIRED_FIELDS:
        if key not in run and key in raw:
            run[key] = raw[key]
    if "variables" not in run and isinstance(raw.get("variables"), list):
        run["variables"] = raw["variables"]
    if "lead_hours" not in run and isinstance(raw.get("lead_hours"), list):
        run["lead_hours"] = raw["lead_hours"]
    if "grid" not in run and isinstance(raw.get("grid"), dict):
        run["grid"] = raw["grid"]
    # Lane B derives the lead hours from the source time columns: they may come
    # as integral floats (0.0, 6.0, ...). Store them as integers.
    if isinstance(run.get("lead_hours"), list):
        run["lead_hours"] = [
            int(value) if isinstance(value, float) and float(value).is_integer() else value
            for value in run["lead_hours"]
        ]

    snapshots_raw = raw.get("snapshots")
    if not isinstance(snapshots_raw, list):
        snapshots_raw = raw.get("nwp_snapshots")
    if not isinstance(snapshots_raw, list):
        snapshots_raw = []

    provinces_raw = raw.get("province_values")
    if not isinstance(provinces_raw, list):
        provinces_raw = raw.get("nwp_province_values")
    if not isinstance(provinces_raw, list):
        provinces_raw = raw.get("provinces")
    if not isinstance(provinces_raw, list):
        provinces_raw = []

    snapshots: list[dict] = []
    for item in snapshots_raw:
        if not isinstance(item, dict):
            raise NwpCliError(NWP_EXPORT_INVALID, "snapshot entry must be an object")
        snapshot = dict(item)
        for source_key, target_key in (("mean", "mean"), ("mean_json", "mean"),
                                       ("max", "max"), ("max_json", "max"),
                                       ("bbox", "bbox"), ("bbox_json", "bbox"),
                                       ("quality", "quality"), ("quality_json", "quality")):
            if target_key not in snapshot and source_key in snapshot:
                snapshot[target_key] = snapshot[source_key]
        if "mean" in snapshot:
            snapshot["mean"] = _maybe_json(snapshot["mean"])
        if "max" in snapshot:
            snapshot["max"] = _maybe_json(snapshot["max"])
        if "bbox" in snapshot:
            snapshot["bbox"] = _maybe_json(snapshot["bbox"])
        if "quality" in snapshot:
            snapshot["quality"] = _maybe_json(snapshot["quality"])
        snapshots.append(snapshot)

    provinces: list[dict] = []
    for item in provinces_raw:
        if not isinstance(item, dict):
            raise NwpCliError(NWP_EXPORT_INVALID, "province entry must be an object")
        row = dict(item)
        for source_key, target_key in (("radius_km", "radius_km"), ("radiusKm", "radius_km"),
                                       ("distance_km", "distance_km"), ("distanceKm", "distance_km"),
                                       ("province_code", "province_code"), ("provinceCode", "province_code"),
                                       ("province_name", "province_name"), ("provinceName", "province_name"),
                                       ("risk_level", "risk_level"), ("riskLevel", "risk_level")):
            if target_key not in row and source_key in row:
                row[target_key] = row[source_key]
        provinces.append(row)

    export: dict[str, Any] = {
        "export_version": raw.get("export_version", raw.get("schema_version", EXPORT_VERSION))
    }
    export["run"] = run
    export["snapshots"] = snapshots
    export["province_values"] = provinces
    # Keep Lane B's provenance blocks (excluded variables, unit policy, ...)
    # so nothing is silently dropped from the export file.
    for key, value in raw.items():
        if key in ("run", "run_meta", "nwp_runs", "snapshots", "nwp_snapshots",
                   "province_values", "nwp_province_values", "provinces",
                   "export_version", "schema_version"):
            continue
        export.setdefault(key, value)
    return export


def _claims_approval(run: Mapping[str, Any], snapshots: Sequence[Mapping[str, Any]]) -> bool:
    """True when the payload claims an approved public licence on its own."""
    for value in (run.get("license_status"), run.get("access")):
        if isinstance(value, str) and value.strip().lower() == "approved_public":
            return True
    for snapshot in snapshots:
        for key in ("license_status", "access"):
            value = snapshot.get(key)
            if isinstance(value, str) and value.strip().lower() == "approved_public":
                return True
    return False


def validate_export(payload: Any) -> dict:
    """Validate a D1-ready export payload and return its count summary.

    Raises :class:`NwpCliError` (exit code 1) on the first problem found.
    """
    if not isinstance(payload, dict):
        raise NwpCliError(NWP_EXPORT_INVALID, "export payload must be a JSON object")
    version = payload.get("export_version", EXPORT_VERSION)
    if version != EXPORT_VERSION:
        raise NwpCliError(NWP_EXPORT_INVALID,
                          f"unsupported export_version {version!r} (expected {EXPORT_VERSION})")

    run = payload.get("run")
    if not isinstance(run, dict):
        raise NwpCliError(NWP_EXPORT_INVALID, "export payload has no 'run' block")

    run_id = run.get("run_id")
    if not isinstance(run_id, str) or not RUN_ID_RE.fullmatch(run_id):
        raise NwpCliError(NWP_EXPORT_INVALID, f"invalid run_id {run_id!r}")
    for field in ("source_id", "domain", "init_at", "retrieved_at",
                  "license_status", "unit_status"):
        value = run.get(field)
        if not isinstance(value, str) or not value.strip():
            raise NwpCliError(NWP_EXPORT_INVALID, f"run.{field} must be a non-empty string")
    if run["source_id"] != SOURCE_ID:
        raise NwpCliError(NWP_EXPORT_INVALID,
                          f"run.source_id must be {SOURCE_ID!r}, got {run['source_id']!r}")
    if run["domain"] not in DOMAINS:
        raise NwpCliError(NWP_EXPORT_INVALID, f"run.domain must be one of {sorted(DOMAINS)}")
    if parse_iso(run["init_at"]) is None:
        raise NwpCliError(NWP_EXPORT_INVALID, "run.init_at must be an ISO-8601 UTC timestamp")
    if parse_iso(run["retrieved_at"]) is None:
        raise NwpCliError(NWP_EXPORT_INVALID,
                          "run.retrieved_at must be an ISO-8601 UTC timestamp")
    publication_mode = run.get("publication_mode")
    if publication_mode not in PUBLICATION_MODES:
        raise NwpCliError(NWP_EXPORT_INVALID,
                          f"run.publication_mode must be one of {list(PUBLICATION_MODES)}")
    variables = run.get("variables")
    if not isinstance(variables, list) or not variables or \
            not all(isinstance(item, str) and item.strip() for item in variables):
        raise NwpCliError(NWP_EXPORT_INVALID, "run.variables must be a non-empty list of names")
    lead_hours = run.get("lead_hours")
    if not isinstance(lead_hours, list) or \
            not all(isinstance(item, (int, float)) and not isinstance(item, bool)
                    for item in lead_hours):
        raise NwpCliError(NWP_EXPORT_INVALID, "run.lead_hours must be a list of numbers")
    status = run.get("status", "ready")
    if status not in ("ready", "partial", "failed"):
        raise NwpCliError(NWP_EXPORT_INVALID,
                          f"run.status must be ready, partial or failed (got {status!r})")
    grid = run.get("grid")
    if not isinstance(grid, dict):
        raise NwpCliError(NWP_EXPORT_INVALID, "run.grid must be an object")

    snapshots = payload.get("snapshots")
    if not isinstance(snapshots, list) or not snapshots:
        raise NwpCliError(NWP_EXPORT_INVALID, "export.snapshots must be a non-empty list")
    provinces = payload.get("province_values")
    if not isinstance(provinces, list):
        raise NwpCliError(NWP_EXPORT_INVALID, "export.province_values must be a list")

    snapshot_keys: set[tuple[str, str]] = set()
    cells = 0
    numeric_values = 0
    by_key: dict[str, dict[str, int]] = {}
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            raise NwpCliError(NWP_EXPORT_INVALID, "snapshot entry must be an object")
        variable = snapshot.get("variable")
        valid_at = snapshot.get("valid_at")
        if not isinstance(variable, str) or not variable.strip():
            raise NwpCliError(NWP_EXPORT_INVALID, "snapshot.variable must be a non-empty string")
        if not isinstance(valid_at, str) or parse_iso(valid_at) is None:
            raise NwpCliError(NWP_EXPORT_INVALID,
                              f"snapshot.valid_at must be an ISO-8601 UTC timestamp ({valid_at!r})")
        if "unit" not in snapshot:
            raise NwpCliError(NWP_MISSING_UNIT_FIELD,
                              f"snapshot {variable}@{valid_at} has no 'unit' field "
                              "(use null until TMD confirms the unit)")
        unit = snapshot.get("unit")
        if unit is not None and not isinstance(unit, str):
            raise NwpCliError(NWP_EXPORT_INVALID,
                              f"snapshot {variable}@{valid_at} unit must be a string or null")
        bbox = snapshot.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4 or \
                not all(isinstance(item, (int, float)) and not isinstance(item, bool)
                        for item in bbox):
            raise NwpCliError(NWP_EXPORT_INVALID,
                              f"snapshot {variable}@{valid_at} bbox must be 4 numbers")
        nx = snapshot.get("nx")
        ny = snapshot.get("ny")
        for name, value in (("nx", nx), ("ny", ny)):
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise NwpCliError(NWP_EXPORT_INVALID,
                                  f"snapshot {variable}@{valid_at} {name} must be a positive integer")
        if nx * ny > MAX_GRID_CELLS:
            raise NwpCliError(NWP_GRID_TOO_LARGE,
                              f"snapshot {variable}@{valid_at} has {nx * ny} cells "
                              f"(limit {MAX_GRID_CELLS})")
        for name in ("mean", "max"):
            array = snapshot.get(name)
            if not isinstance(array, list):
                raise NwpCliError(NWP_EXPORT_INVALID,
                                  f"snapshot {variable}@{valid_at} {name} must be an array")
            if len(array) != nx * ny:
                raise NwpCliError(NWP_GRID_LENGTH_MISMATCH,
                                  f"snapshot {variable}@{valid_at} {name} has {len(array)} values "
                                  f"but nx*ny = {nx * ny}")
            for value in array:
                if value is None:
                    continue
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise NwpCliError(NWP_EXPORT_INVALID,
                                      f"snapshot {variable}@{valid_at} {name} holds a non-numeric value")
                if isinstance(value, float) and not math.isfinite(value):
                    raise NwpCliError(NWP_NON_FINITE_VALUE,
                                      f"snapshot {variable}@{valid_at} {name} holds a non-finite value")
                numeric_values += 1
        quality = snapshot.get("quality", {})
        if not isinstance(quality, dict):
            raise NwpCliError(NWP_EXPORT_INVALID,
                              f"snapshot {variable}@{valid_at} quality must be an object")
        if publication_mode == "metadata_only" and numeric_values:
            raise NwpCliError(NWP_EXPORT_INVALID,
                              "publication_mode is metadata_only but the payload carries numeric values")
        snapshot_keys.add((variable, valid_at))
        cells += nx * ny
        bucket = by_key.setdefault(f"{variable}@{valid_at}", {"snapshots": 0, "province_rows": 0, "cells": 0})
        bucket["snapshots"] += 1
        bucket["cells"] += nx * ny

    for row in provinces:
        if not isinstance(row, dict):
            raise NwpCliError(NWP_EXPORT_INVALID, "province entry must be an object")
        variable = row.get("variable")
        valid_at = row.get("valid_at")
        if not isinstance(variable, str) or not isinstance(valid_at, str):
            raise NwpCliError(NWP_EXPORT_INVALID,
                              "province row must carry variable and valid_at")
        if (variable, valid_at) not in snapshot_keys:
            raise NwpCliError(NWP_UNKNOWN_SNAPSHOT_REFERENCE,
                              f"province row references unknown snapshot {variable}@{valid_at}")
        code = row.get("province_code")
        if not isinstance(code, str) or not code.strip():
            raise NwpCliError(NWP_EXPORT_INVALID,
                              f"province row {variable}@{valid_at} has no province_code")
        if not isinstance(row.get("province_name"), str):
            raise NwpCliError(NWP_EXPORT_INVALID,
                              f"province row {code} has no province_name")
        _number(row.get("value"), field=f"province {code} value")
        _number(row.get("radius_km"), field=f"province {code} radius_km")
        _number(row.get("distance_km"), field=f"province {code} distance_km")
        method = row.get("method")
        if not isinstance(method, str) or not method.strip():
            raise NwpCliError(NWP_EXPORT_INVALID, f"province row {code} has no method")
        risk_level = row.get("risk_level")
        if risk_level is not None and risk_level not in RISK_LEVELS:
            raise NwpCliError(NWP_EXPORT_INVALID,
                              f"province row {code} has an unknown risk_level {risk_level!r}")
        bucket = by_key.setdefault(f"{variable}@{valid_at}", {"snapshots": 0, "province_rows": 0, "cells": 0})
        bucket["province_rows"] += 1

    if _claims_approval(run, snapshots):
        raise NwpCliError(NWP_LICENSE_CLAIM_INVALID,
                          "export payload claims 'approved_public'; the licence status must come "
                          "from config/resource_licenses.json, not from the payload")

    row_bytes = 0
    for snapshot in snapshots:
        row_bytes = max(row_bytes, len(canonical_json(snapshot).encode("utf-8")))
    if row_bytes > MAX_ROW_BYTES:
        raise NwpCliError(NWP_PAYLOAD_TOO_LARGE,
                          f"largest snapshot row is {row_bytes} bytes (limit {MAX_ROW_BYTES})")

    return {
        "runs": 1,
        "snapshots": len(snapshots),
        "province_rows": len(provinces),
        "cells": cells,
        "max_snapshot_bytes": row_bytes,
        "by_variable_valid_at": by_key,
    }


# --------------------------------------------------------------------------
# D1 statements (all values are bound parameters)
# --------------------------------------------------------------------------


def _upsert_sql(table: str, columns: Sequence[str], conflict: Sequence[str],
                updates: Sequence[str], *, guarded: bool = False) -> str:
    placeholders = ", ".join("?" for _ in columns)
    assignments = ",\n  ".join(f"{column} = excluded.{column}" for column in updates)
    values = f"SELECT {placeholders} WHERE EXISTS (SELECT 1 FROM nwp_runs " \
             "WHERE run_id = ? AND payload_sha256 = ? AND status = 'failed')" if guarded \
        else f"VALUES ({placeholders})"
    return (
        f"INSERT INTO {table}\n  ({', '.join(columns)})\n"
        f"{values}\n"
        f"ON CONFLICT ({', '.join(conflict)}) DO UPDATE SET\n  {assignments}"
        + (" RETURNING run_id" if guarded else "")
    )


_UPSERT_RUN_SQL = _upsert_sql(
    "nwp_runs", RUN_COLUMNS, ("run_id",),
    [column for column in RUN_COLUMNS if column != "run_id"],
)
_UPSERT_SNAPSHOT_SQL = _upsert_sql(
    "nwp_snapshots", SNAPSHOT_COLUMNS, ("run_id", "variable", "valid_at"),
    [column for column in SNAPSHOT_COLUMNS if column not in ("run_id", "variable", "valid_at")], guarded=True,
)
_UPSERT_PROVINCE_SQL = _upsert_sql(
    "nwp_province_values", PROVINCE_COLUMNS,
    ("run_id", "variable", "valid_at", "province_code"),
    [column for column in PROVINCE_COLUMNS
     if column not in ("run_id", "variable", "valid_at", "province_code")], guarded=True,
)
_SELECT_RUN_STATE_SQL = "SELECT payload_sha256, status FROM nwp_runs WHERE run_id = ?"
_SELECT_SNAPSHOT_KEYS_SQL = (
    "SELECT json_group_array(json_object('variable', variable, 'valid_at', valid_at)) "
    "AS keys_json FROM nwp_snapshots WHERE run_id = ?"
)
_SELECT_PROVINCE_KEYS_SQL = (
    "SELECT json_group_array(json_object('variable', variable, 'valid_at', valid_at, 'codes', codes)) "
    "AS groups_json FROM (SELECT variable, valid_at, json_group_array(province_code) AS codes "
    "FROM nwp_province_values WHERE run_id = ? GROUP BY variable, valid_at)"
)
_SELECT_RUN_INDEX_SQL = (
    "SELECT json_group_array(json_object('run_id', run_id, 'domain', domain, "
    "'init_at', init_at)) AS runs_json FROM nwp_runs"
)
_DELETE_RUN_SQL = "DELETE FROM nwp_runs WHERE run_id = ?"
_FINALIZE_RUN_SQL = (
    "UPDATE nwp_runs SET status = ? WHERE run_id = ? AND payload_sha256 = ? "
    "AND status = 'failed' RETURNING run_id"
)
_UPDATE_RUN_LICENSE_SQL = (
    "UPDATE nwp_runs SET license_status = ?, payload_sha256 = ? "
    "WHERE run_id = ? AND payload_sha256 = ? AND status IN ('ready','partial') RETURNING run_id"
)
_DELETE_PROVINCES_SQL = (
    "DELETE FROM nwp_province_values WHERE run_id = ? AND variable = ? AND valid_at = ? "
    "AND province_code IN (SELECT value FROM json_each(?)) "
    "AND EXISTS (SELECT 1 FROM nwp_runs WHERE run_id = ? AND payload_sha256 = ? AND status = 'failed')"
)
_DELETE_SNAPSHOT_SQL = (
    "DELETE FROM nwp_snapshots WHERE run_id = ? AND variable = ? AND valid_at = ? "
    "AND EXISTS (SELECT 1 FROM nwp_runs WHERE run_id = ? AND payload_sha256 = ? AND status = 'failed')"
)
_PROBE_D1_SQL = "SELECT 1 AS ok"


# --------------------------------------------------------------------------
# Licence gate (fail closed)
# --------------------------------------------------------------------------


def _is_nwp_resource(row: Mapping[str, Any]) -> bool:
    source_id = str(row.get("source_id") or "").strip().lower()
    resource_key = str(row.get("resource_key") or "").strip().lower()
    return source_id == SOURCE_ID and resource_key == NWP_RESOURCE_KEY


def approved_nwp_resource(registry_path: Optional[Path] = None) -> dict:
    """Return the approved TMD HPC NWP licence row or fail closed.

    The writer never trusts a payload flag: the licence register must list the
    exact d02 grid resource with ``license_status == 'approved_public'``,
    ``project_publication_approved is True`` and no unresolved item.
    """
    try:
        rows = load_resource_licenses(registry_path or (ROOT / "config/resource_licenses.json"))
    except (OSError, ValueError) as exc:
        raise NwpCliError(RESOURCE_APPROVAL_MISSING,
                          f"cannot read the licence register: {exc}") from exc
    matches = [row for row in rows if _is_nwp_resource(row)]
    if len(matches) != 1:
        raise NwpCliError(RESOURCE_APPROVAL_MISSING,
                          "the licence register holds no single approved TMD HPC NWP resource")
    resource = matches[0]
    if (resource.get("license_status") != "approved_public"
            or resource.get("project_publication_approved") is not True
            or resource.get("unresolved")):
        raise NwpCliError(RESOURCE_NOT_APPROVED,
                          "the TMD HPC NWP resource is not approved for publication")
    return resource


# --------------------------------------------------------------------------
# Publisher
# --------------------------------------------------------------------------


def _first_row(result: Any) -> Optional[Mapping[str, Any]]:
    """Extract the first row from either a real D1Client response or a flat test dict."""
    if not isinstance(result, Mapping):
        return None
    rows = result.get("results")
    if isinstance(rows, Sequence) and not isinstance(rows, (str, bytes)):
        if rows and isinstance(rows[0], Mapping):
            return rows[0]
        return None
    return result


def _stored_run_state(client: Any, run_id: str) -> Optional[dict]:
    """Stored ``payload_sha256`` and ``status`` of one run, or ``None``."""
    row = _first_row(client.execute(_SELECT_RUN_STATE_SQL, [run_id]))
    if not row:
        return None
    sha = row.get("payload_sha256")
    status = row.get("status")
    return {
        "payload_sha256": sha if isinstance(sha, str) else None,
        "status": status if isinstance(status, str) else None,
    }


def _json_array(raw: Any) -> list:
    """Decode a JSON array text column; malformed values mean "no rows"."""
    if not isinstance(raw, str):
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def _stored_children(client: Any, run_id: str) -> tuple[set, dict]:
    """Snapshot keys and per-snapshot province codes stored for a run."""
    snapshot_row = _first_row(client.execute(_SELECT_SNAPSHOT_KEYS_SQL, [run_id])) or {}
    snapshots: set[tuple[str, str]] = set()
    for item in _json_array(snapshot_row.get("keys_json")):
        if not isinstance(item, Mapping):
            continue
        variable, valid_at = item.get("variable"), item.get("valid_at")
        if isinstance(variable, str) and isinstance(valid_at, str):
            snapshots.add((variable, valid_at))

    count_row = _first_row(client.execute(_SELECT_PROVINCE_KEYS_SQL, [run_id])) or {}
    provinces: dict[tuple[str, str], set[str]] = {}
    for item in _json_array(count_row.get("groups_json")):
        if not isinstance(item, Mapping):
            continue
        variable, valid_at = item.get("variable"), item.get("valid_at")
        if isinstance(variable, str) and isinstance(valid_at, str):
            provinces[(variable, valid_at)] = set(_json_array(item.get("codes")))
    return snapshots, provinces


def _child_completeness(client: Any, run_id: str, payload: Mapping[str, Any]) -> dict:
    """Compare a run's stored children with the rows its export requires.

    Snapshot and province identities must exactly match the export.
    """
    expected_snapshots = {(snapshot["variable"], snapshot["valid_at"])
                          for snapshot in payload["snapshots"]}
    expected_provinces: dict[tuple[str, str], set[str]] = {}
    for row in payload["province_values"]:
        expected_provinces.setdefault((row["variable"], row["valid_at"]), set()).add(row["province_code"])
    stored_snapshots, stored_provinces = _stored_children(client, run_id)

    missing_snapshots = sorted(expected_snapshots - stored_snapshots)
    short_groups = [{"variable": key[0], "valid_at": key[1],
                     "expected": len(expected_provinces.get(key, set())),
                     "stored": len(stored_provinces.get(key, set()))}
                    for key in sorted(expected_provinces.keys() | stored_provinces.keys())
                    if expected_provinces.get(key, set()) != stored_provinces.get(key, set())]

    return {
        "complete": expected_snapshots == stored_snapshots and not short_groups,
        "expected_snapshots": len(expected_snapshots),
        "stored_snapshots": len(stored_snapshots),
        "missing_snapshots": [{"variable": variable, "valid_at": valid_at}
                              for variable, valid_at in missing_snapshots],
        "expected_province_rows": sum(map(len, expected_provinces.values())),
        "stored_province_rows": sum(map(len, stored_provinces.values())),
        "short_province_groups": short_groups,
    }


def _fetch_run_index(client: Any) -> list[dict]:
    """All stored runs as a list of {run_id, domain, init_at}."""
    try:
        row = _first_row(client.execute(_SELECT_RUN_INDEX_SQL))
    except Exception:  # pragma: no cover - defensive; the SQL fallback applies
        return []
    raw = row.get("runs_json") if row is not None else None
    if not isinstance(raw, str):
        return []
    try:
        rows = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def prune_runs(client: Any, *, keep_per_domain: int = RETENTION_KEEP_PER_DOMAIN,
               max_age_days: int = RETENTION_MAX_AGE_DAYS,
               reference: Optional[datetime] = None) -> list[dict]:
    """Apply the §3.6 retention policy.

    A run is removed when it falls outside the ``keep_per_domain`` newest runs
    of its domain OR when it is older than ``max_age_days``. Child rows are
    removed by ``ON DELETE CASCADE``. The age reference defaults to the wall
    clock and can be injected to keep a run reproducible.
    """
    reference_dt = reference or datetime.now(timezone.utc)
    if reference_dt.tzinfo is None:
        reference_dt = reference_dt.replace(tzinfo=timezone.utc)
    cutoff = reference_dt.astimezone(timezone.utc) - timedelta(days=max_age_days)
    rows = _fetch_run_index(client)
    if not rows:
        return []
    groups: dict[str, list[dict]] = {}
    for row in rows:
        groups.setdefault(str(row.get("domain") or ""), []).append(row)
    deleted: list[dict] = []
    for domain in sorted(groups):
        ordered = sorted(
            groups[domain],
            key=lambda row: (str(row.get("init_at") or ""), str(row.get("run_id") or "")),
            reverse=True,
        )
        for index, row in enumerate(ordered):
            run_id = row.get("run_id")
            if not isinstance(run_id, str) or not run_id:
                continue
            reasons = []
            if index >= keep_per_domain:
                reasons.append("beyond_keep_per_domain")
            init_at = parse_iso(row.get("init_at"))
            if init_at is not None and init_at < cutoff:
                reasons.append("older_than_max_age")
            if not reasons:
                continue
            client.execute(_DELETE_RUN_SQL, [run_id])
            deleted.append({
                "run_id": run_id,
                "domain": domain,
                "init_at": row.get("init_at"),
                "reason": "+".join(reasons),
            })
    return deleted


def _require_owned_write(result: Any, run_id: str) -> None:
    row = _first_row(result)
    if not row or row.get("run_id") != run_id:
        raise NwpCliError(NWP_WRITE_FAILED, f"publication ownership lost for run {run_id}")


def _remove_obsolete_children(client: Any, run_id: str, digest: str, payload: Mapping[str, Any]) -> None:
    snapshots, provinces = _stored_children(client, run_id)
    expected_snapshots = {(row["variable"], row["valid_at"]) for row in payload["snapshots"]}
    expected_provinces: dict[tuple[str, str], set[str]] = {}
    for row in payload["province_values"]:
        expected_provinces.setdefault((row["variable"], row["valid_at"]), set()).add(row["province_code"])
    for key, codes in provinces.items():
        obsolete = codes - expected_provinces.get(key, set())
        if obsolete and key in expected_snapshots:
            client.execute(_DELETE_PROVINCES_SQL, [run_id, *key, canonical_json(sorted(obsolete)), run_id, digest])
    for variable, valid_at in snapshots - expected_snapshots:
        client.execute(_DELETE_SNAPSHOT_SQL, [run_id, variable, valid_at, run_id, digest])


def publish_export(client: Any, payload: Mapping[str, Any], *,
                   registry_path: Optional[Path] = None,
                   reference: Optional[datetime] = None) -> dict:
    """Write one validated export to D1 and apply the retention policy.

    The run row is written first with the transient ``failed`` status, then its
    snapshots, then the province values (the province table has a foreign key
    onto the snapshot table), and only then is the run switched to the status
    its export declares. Readers serve ``ready``/``partial`` only, so a run is
    never published while its children are incomplete. Guarded writes prevent
    a superseded publisher from changing another revision. Obsolete children
    are removed after the new children are written, before the run is ready.

    An identical payload is skipped only when the stored run finished and its
    children still match the export; a failed or incomplete run is repaired by
    re-upserting every child row.
    """
    summary = validate_export(payload)
    resource = approved_nwp_resource(registry_path)
    publishable_payload = dict(payload)
    run = dict(payload["run"])
    run["license_status"] = resource["license_status"]
    publishable_payload["run"] = run
    run_id = run["run_id"]
    input_digest = payload_sha256(payload)
    digest = payload_sha256(publishable_payload)
    final_status = run.get("status", "ready")

    stored = _stored_run_state(client, run_id)
    stored_sha = stored["payload_sha256"] if stored is not None else None
    if stored is not None and stored["status"] in FINAL_RUN_STATUSES \
            and stored_sha in (digest, input_digest) \
            and _child_completeness(client, run_id, publishable_payload)["complete"]:
        if stored_sha == digest:
            return {
                "outcome": "skipped_identical",
                "run_id": run_id,
                "payload_sha256": digest,
                "counts": summary,
                "written": {"runs": 0, "snapshots": 0, "province_values": 0},
                "pruned_runs": [],
            }

        # A registry approval changes only run metadata for an otherwise
        # identical payload; update that row without rewriting forecast rows.
        try:
            result = client.execute(_UPDATE_RUN_LICENSE_SQL, [
                resource["license_status"], digest, run_id, input_digest,
            ])
            _require_owned_write(result, run_id)
        except Exception as exc:
            raise NwpCliError(NWP_WRITE_FAILED,
                              f"D1 licence metadata update failed for run {run_id}: {exc}") from exc
        return {
            "outcome": "metadata_updated",
            "run_id": run_id,
            "payload_sha256": digest,
            "counts": summary,
            "written": {"runs": 1, "snapshots": 0, "province_values": 0},
            "pruned_runs": [],
        }

    try:
        client.execute(_UPSERT_RUN_SQL, [
            run_id,
            run["source_id"],
            run["domain"],
            run["init_at"],
            run["retrieved_at"],
            run["license_status"],
            run["unit_status"],
            run["publication_mode"],
            canonical_json(run["variables"]),
            canonical_json(run["lead_hours"]),
            canonical_json(run["grid"]),
            run.get("manifest_sha256"),
            digest,
            TRANSIENT_RUN_STATUS,
        ])
        for snapshot in publishable_payload["snapshots"]:
            result = client.execute(_UPSERT_SNAPSHOT_SQL, [
                run_id,
                snapshot["variable"],
                snapshot["valid_at"],
                snapshot.get("unit"),
                canonical_json(snapshot["bbox"]),
                int(snapshot["nx"]),
                int(snapshot["ny"]),
                canonical_json(snapshot["mean"]),
                canonical_json(snapshot["max"]),
                canonical_json(snapshot.get("quality") or {}), run_id, digest,
            ])
            _require_owned_write(result, run_id)
        for row in publishable_payload["province_values"]:
            result = client.execute(_UPSERT_PROVINCE_SQL, [
                run_id,
                row["variable"],
                row["valid_at"],
                row["province_code"],
                row["province_name"],
                row.get("value"),
                row["method"],
                row.get("radius_km"),
                row.get("distance_km"),
                row.get("risk_level"),
                row.get("cell_count"), run_id, digest,
            ])
            _require_owned_write(result, run_id)
        _remove_obsolete_children(client, run_id, digest, publishable_payload)
        completeness = _child_completeness(client, run_id, publishable_payload)
        if not completeness["complete"]:
            raise NwpCliError(
                NWP_WRITE_FAILED,
                f"D1 write for run {run_id} is incomplete after writing "
                f"(snapshots {completeness['stored_snapshots']}/"
                f"{completeness['expected_snapshots']}, province rows "
                f"{completeness['stored_province_rows']}/"
                f"{completeness['expected_province_rows']})",
            )
        _require_owned_write(client.execute(_FINALIZE_RUN_SQL, [final_status, run_id, digest]), run_id)
    except NwpCliError:
        raise
    except Exception as exc:
        raise NwpCliError(NWP_WRITE_FAILED,
                          f"D1 write failed for run {run_id}: {exc}") from exc

    pruned = prune_runs(client, reference=reference)
    return {
        "outcome": "written",
        "run_id": run_id,
        "payload_sha256": digest,
        "counts": summary,
        "written": {
            "runs": 1,
            "snapshots": len(publishable_payload["snapshots"]),
            "province_values": len(publishable_payload["province_values"]),
        },
        "pruned_runs": pruned,
    }


def connect_publisher_client() -> Any:
    """Connect to D1 or fail closed with ``D1_NOT_CONFIGURED`` (exit code 2)."""
    try:
        client = connect_d1_client()
    except CatalogSyncError as exc:
        raise NwpCliError(
            D1_NOT_CONFIGURED,
            "Set CF_ACCOUNT_ID, CF_D1_TOKEN and CF_D1_DATABASE_ID to publish NWP forecasts "
            f"(reason: {exc})",
            exit_code=EXIT_NOT_CONFIGURED,
        ) from exc
    if client is None:
        raise NwpCliError(D1_NOT_CONFIGURED, "no D1 client could be created",
                          exit_code=EXIT_NOT_CONFIGURED)
    try:
        client.execute(_PROBE_D1_SQL)
    except Exception as exc:
        raise NwpCliError(
            D1_NOT_CONFIGURED,
            f"D1 is not reachable (reason: {exc})",
            exit_code=EXIT_NOT_CONFIGURED,
        ) from exc
    return client


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------


def _parse_variables(raw: Optional[str]) -> Optional[list[str]]:
    if raw is None:
        return None
    names = [part.strip() for part in raw.split(",") if part.strip()]
    if not names:
        raise NwpCliError(NWP_INVALID_ARGUMENT, "--variables must list at least one variable")
    for name in names:
        if name not in V1_VARIABLES:
            raise NwpCliError(NWP_INVALID_ARGUMENT,
                              f"unknown variable {name!r}; allowed: {', '.join(V1_VARIABLES)}")
    return names


def _local_init_times() -> list[str]:
    """Init times of the manifests already stored locally."""
    found: list[str] = []
    if not MANIFEST_DIR.is_dir():
        return found
    for path in sorted(MANIFEST_DIR.glob("*.json")):
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        init_at = manifest.get("init_at")
        parsed = parse_iso(init_at)
        if parsed is not None:
            found.append(parsed.strftime("%Y%m%d%H"))
    return sorted(set(found), reverse=True)


def _discover_init_times(limit: int = 4) -> dict:
    """Ask the source for its latest runs (bounded), falling back to manifests."""
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    base = now.replace(hour=(now.hour // 6) * 6)
    candidates = [(base - timedelta(hours=6 * step)).strftime("%Y%m%d%H")
                  for step in range(limit)]
    remote: list[dict] = []
    errors: list[dict] = []
    for candidate in candidates:
        try:
            listing = list_download_files(candidate)
        except TmdHpcError as exc:
            errors.append({"init_time": candidate, "code": exc.code})
            continue
        remote.append({
            "init_time": candidate,
            "init_at": listing.get("init_at"),
            "count": listing.get("count"),
        })
    local = _local_init_times()
    return {"remote": remote, "remote_errors": errors, "local": local}


def cmd_list(args: argparse.Namespace) -> dict:
    """List the files of one run (or the available init times)."""
    if not args.init_time:
        discovery = _discover_init_times()
        init_times = [item["init_time"] for item in discovery["remote"]]
        for value in discovery["local"]:
            if value not in init_times:
                init_times.append(value)
        print("Available TMD HPC NWP runs:")
        for item in discovery["remote"]:
            print(f"  {item['init_time']}  init_at={item['init_at']}  files={item['count']}")
        for value in discovery["local"]:
            if value not in init_times[: len(discovery["remote"])]:
                print(f"  {value}  (local manifest)")
        if not init_times:
            print("  (no run found - check the upstream connection)")
        return {
            "status": "ok",
            "command": "list",
            "init_times": init_times,
            "remote": discovery["remote"],
            "local_init_times": discovery["local"],
            "errors": discovery["remote_errors"],
        }

    listing = list_download_files(args.init_time)
    files = listing.get("files") or []
    print(f"{'variable':<10} {'domain':<7} {'format':<8} {'size':>12}  filename")
    for entry in files:
        print(f"{str(entry.get('variable') or '-'):<10} {str(entry.get('domain') or '-'):<7} "
              f"{str(entry.get('format') or '-'):<8} {_human_bytes(entry.get('bytes')):>12}  "
              f"{entry.get('filename') or '-'}")
    print(f"TMD HPC NWP files: {len(files)} items "
          f"(init {args.init_time}, domain {args.domain})")
    return {
        "status": "ok",
        "command": "list",
        "init_time": args.init_time,
        "init_at": listing.get("init_at"),
        "domain": args.domain,
        "count": len(files),
        "files": [
            {
                "variable": entry.get("variable"),
                "domain": entry.get("domain"),
                "format": entry.get("format"),
                "bytes": entry.get("bytes"),
                "filename": entry.get("filename"),
                "url": entry.get("url"),
            }
            for entry in files
        ],
    }


def cmd_fetch(args: argparse.Namespace) -> dict:
    """Probe (bounded) or download the files of one run."""
    variables = _parse_variables(args.variables)
    if args.probe:
        result = probe_files(
            args.init_time,
            variables=variables or list(V1_VARIABLES),
            domain=args.domain,
            max_probe_bytes=PROBE_BYTES,
        )
        print(f"{'variable':<10} {'status':<8} {'http':>5} {'size':>12}  probe")
        for name in result["variables"]:
            entry = result["files"][name]
            print(f"{name:<10} {entry.get('status') or '-':<8} "
                  f"{str(entry.get('http_status') or '-'):>5} "
                  f"{_human_bytes(entry.get('bytes')):>12}  {entry.get('probe_mode') or '-'}")
        print(f"Bounded TMD HPC NWP file probe (<= {PROBE_BYTES} B): "
              f"{len(result['variables'])} variables (init {args.init_time}, {args.domain})")
        return {
            "status": result.get("status"),
            "command": "fetch",
            "mode": "probe",
            "init_time": args.init_time,
            "domain": args.domain,
            "variables": result.get("variables"),
            "missing": result.get("missing"),
            "files": result.get("files"),
            "bytes_read_max": PROBE_BYTES,
        }

    manifest = download_run(
        args.init_time,
        variables=variables or list(V1_VARIABLES),
        domain=args.domain,
        output_dir=LOCAL_ROOT,
        max_bytes=args.max_bytes,
    )
    run_id = manifest["run_id"]
    verification = verify_manifest(manifest, RAW_ROOT / run_id)
    print(f"Downloaded TMD HPC NWP run {run_id}: "
          f"{sum(1 for item in manifest['files'] if item.get('status') in ('ok', 'cached'))}"
          f"/{len(manifest['files'])} files (status {manifest['status']})")
    return {
        "status": manifest["status"],
        "command": "fetch",
        "mode": "download",
        "run_id": run_id,
        "init_time": args.init_time,
        "domain": args.domain,
        "manifest_path": str(MANIFEST_DIR / f"{run_id}.json"),
        "files": manifest["files"],
        "verification": verification,
    }


def _load_normalizer() -> Any:
    try:
        from tadih import tmd_hpc_normalize  # noqa: WPS433 (lazy, Lane B module)
    except ImportError as exc:
        raise NwpCliError(NWP_NORMALIZER_UNAVAILABLE,
                          "tadih.tmd_hpc_normalize is not available yet (Lane B)") from exc
    return tmd_hpc_normalize


def cmd_normalize(args: argparse.Namespace) -> dict:
    """Normalize a downloaded run with Lane B's normalizer."""
    run_id = args.run_id
    if not run_id:
        if not args.init_time:
            raise NwpCliError(NWP_INVALID_ARGUMENT,
                              "normalize needs --init-time or --run-id")
        run_id = run_id_for(args.init_time, args.domain)
    manifest_path = MANIFEST_DIR / f"{run_id}.json"
    if not manifest_path.is_file():
        raise NwpCliError(NWP_MANIFEST_NOT_FOUND,
                          f"no manifest at {manifest_path}; run `fetch` first")
    manifest = load_manifest(manifest_path)
    normalizer = _load_normalizer()
    variables = _parse_variables(args.variables)
    # Lane B reads the raw CSV files from <output_dir>/raw/<run_id>, so the
    # output root must be the TMD HPC working directory, not the normalized
    # envelope directory.
    kwargs: dict[str, Any] = {"variables": variables, "output_dir": str(LOCAL_ROOT)}
    geojson = ROOT / "data/local/geography/ddpm_province.geojson"
    if geojson.is_file():
        try:
            supported = inspect.signature(normalizer.normalize_run).parameters
        except (TypeError, ValueError):  # pragma: no cover - defensive
            supported = {}
        if "province_geojson" in supported:
            kwargs["province_geojson"] = str(geojson)
    normalized = normalizer.normalize_run(manifest, **kwargs)
    target = write_json(NORMALIZED_DIR / f"{run_id}.json", normalized)
    snapshots = 0
    if isinstance(normalized, Mapping):
        for key in ("snapshots", "nwp_snapshots"):
            value = normalized.get(key)
            if isinstance(value, list):
                snapshots = len(value)
                break
    print(f"Normalized TMD HPC NWP run {run_id} -> {target}")
    return {
        "status": "ok",
        "command": "normalize",
        "run_id": run_id,
        "normalized_path": str(target),
        "snapshots": snapshots,
    }


def cmd_export(args: argparse.Namespace) -> dict:
    """Build the D1-ready export of a normalized run."""
    run_id = args.run_id
    normalized_path = NORMALIZED_DIR / f"{run_id}.json"
    if not normalized_path.is_file():
        raise NwpCliError(NWP_NORMALIZED_NOT_FOUND,
                          f"no normalized envelope at {normalized_path}; run `normalize` first")
    normalized = read_json(normalized_path, missing_code=NWP_NORMALIZED_NOT_FOUND)
    normalizer = _load_normalizer()
    raw_export = normalizer.build_export(normalized)
    export = canonicalize_export(raw_export)
    counts = validate_export(export)
    target = Path(args.output) if args.output else (EXPORT_DIR / f"{run_id}.json")
    write_json(target, export)
    digest = payload_sha256(export)
    print(f"Wrote D1 export: {target} "
          f"(snapshots={counts['snapshots']}, province rows={counts['province_rows']}, "
          f"cells={counts['cells']})")
    return {
        "status": "ok",
        "command": "export",
        "run_id": run_id,
        "export_path": str(target),
        "payload_sha256": digest,
        "counts": counts,
    }


def cmd_publish(args: argparse.Namespace) -> dict:
    """Validate (dry run) or publish an export to Cloudflare D1."""
    run_id = args.run_id
    export_path = Path(args.export_path) if args.export_path else (EXPORT_DIR / f"{run_id}.json")
    if not export_path.is_file():
        raise NwpCliError(NWP_EXPORT_NOT_FOUND,
                          f"no export at {export_path}; run `export` first")
    payload = canonicalize_export(read_json(export_path))
    counts = validate_export(payload)
    digest = payload_sha256(payload)
    token_configured = bool(os.environ.get("CF_D1_TOKEN") or os.environ.get("CF_API_TOKEN"))

    if not args.write:
        print(f"dry-run: nothing written to D1 (runs={counts['runs']}, snapshots={counts['snapshots']}, "
              f"province rows={counts['province_rows']}, cells={counts['cells']})")
        return {
            "status": "dry_run",
            "command": "publish",
            "mode": "dry_run",
            "run_id": payload["run"]["run_id"],
            "export_path": str(export_path),
            "payload_sha256": digest,
            "counts": counts,
            "written": {"runs": 0, "snapshots": 0, "province_values": 0},
            "d1": {"token_configured": token_configured, "write_performed": False},
        }

    client = connect_publisher_client()
    reference = parse_iso(args.reference) if args.reference else None
    if args.reference and reference is None:
        raise NwpCliError(NWP_INVALID_ARGUMENT,
                          "--reference must be an ISO-8601 UTC timestamp")
    report = publish_export(client, payload, registry_path=args.registry, reference=reference)
    counts = report["counts"]
    print(f"Published TMD HPC NWP run {report['run_id']}: {report['outcome']} "
          f"(snapshots={counts['snapshots']}, province rows={counts['province_rows']}, "
          f"cells={counts['cells']}, pruned runs={len(report['pruned_runs'])})")
    return {
        "status": "ok",
        "command": "publish",
        "mode": "write",
        "run_id": report["run_id"],
        "export_path": str(export_path),
        "payload_sha256": report["payload_sha256"],
        "outcome": report["outcome"],
        "counts": counts,
        "written": report["written"],
        "pruned_runs": report["pruned_runs"],
        "d1": {"token_configured": token_configured, "write_performed": True},
    }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sync_tmd_hpc_nwp.py",
        description=(
            "TMD HPC NWP pipeline: list -> fetch -> normalize -> export -> publish.\n"
            "publish defaults to --dry-run (no D1 write); --write needs D1 credentials "
            "and an approved licence registry entry."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    listing = sub.add_parser("list", help="list the files of a run (or the available init times)")
    listing.add_argument("--init-time", dest="init_time",
                          help="model run init time, YYYYMMDDHH (omit to list the available runs)")
    listing.add_argument("--domain", default=DEFAULT_DOMAIN, choices=sorted(DOMAINS))

    fetch = sub.add_parser("fetch", help="probe (bounded) or download the files of a run")
    fetch.add_argument("--init-time", dest="init_time", required=True,
                       help="model run init time, YYYYMMDDHH")
    fetch.add_argument("--variables", help=f"comma separated allowlist ({', '.join(V1_VARIABLES)})")
    fetch.add_argument("--domain", default=DEFAULT_DOMAIN, choices=sorted(DOMAINS))
    fetch.add_argument("--probe", action="store_true",
                       help="bounded HEAD/Range check (<= 2 KB body) without downloading")
    fetch.add_argument("--max-bytes", dest="max_bytes", type=int, default=DEFAULT_MAX_BYTES,
                       help="per-file download limit in bytes")

    normalize = sub.add_parser("normalize", help="normalize a downloaded run into a grid envelope")
    normalize.add_argument("--init-time", dest="init_time",
                           help="model run init time, YYYYMMDDHH (used to derive the run id)")
    normalize.add_argument("--run-id", dest="run_id", help="explicit run id")
    normalize.add_argument("--variables", help=f"comma separated allowlist ({', '.join(V1_VARIABLES)})")
    normalize.add_argument("--domain", default=DEFAULT_DOMAIN, choices=sorted(DOMAINS))

    export = sub.add_parser("export", help="write the D1-ready export of a normalized run")
    export.add_argument("--run-id", dest="run_id", required=True, help="run id to export")
    export.add_argument("--output", type=Path, help="output path (defaults to data/local/...)")

    publish = sub.add_parser("publish", help="validate (dry run) or publish an export to D1")
    publish.add_argument("--run-id", dest="run_id", required=True, help="run id to publish")
    publish.add_argument("--export", dest="export_path", type=Path,
                         help="export JSON path (defaults to data/local/tmd_nwp_hpc/exports/<run_id>.json)")
    publish.add_argument("--dry-run", dest="dry_run", action="store_true",
                         help="validate and print counts only (default when --write is absent)")
    publish.add_argument("--write", dest="write", action="store_true",
                         help="write to Cloudflare D1 (needs CF_D1_TOKEN and an approved licence)")
    publish.add_argument("--registry", type=Path,
                         help="licence register path (defaults to config/resource_licenses.json)")
    publish.add_argument("--reference", help="ISO-8601 UTC reference time for the retention age rule")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "publish" and args.write and args.dry_run:
        print(json.dumps({"status": "failed", "errorCode": NWP_INVALID_ARGUMENT,
                          "message": "--dry-run and --write are mutually exclusive"},
                         ensure_ascii=False), file=sys.stderr)
        return EXIT_INVALID
    try:
        if args.command == "list":
            summary = cmd_list(args)
        elif args.command == "fetch":
            summary = cmd_fetch(args)
        elif args.command == "normalize":
            summary = cmd_normalize(args)
        elif args.command == "export":
            summary = cmd_export(args)
        elif args.command == "publish":
            summary = cmd_publish(args)
        else:  # pragma: no cover - argparse already restricts the choices
            raise NwpCliError(NWP_INVALID_ARGUMENT, f"unknown command {args.command!r}")
    except NwpCliError as exc:
        payload = {"status": "failed", "errorCode": exc.code, "message": exc.message}
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        print(json.dumps(payload, ensure_ascii=False))
        return exc.exit_code
    except TmdHpcError as exc:
        payload = {"status": "failed", "errorCode": exc.code, "message": exc.message}
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        print(json.dumps(payload, ensure_ascii=False))
        return EXIT_INVALID
    except CatalogSyncError as exc:
        payload = {"status": "failed", "errorCode": exc.code, "message": str(exc)}
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        print(json.dumps(payload, ensure_ascii=False))
        return EXIT_NOT_CONFIGURED if exc.code == "D1_CONFIG_MISSING" else EXIT_INVALID
    except (OSError, ValueError) as exc:
        payload = {"status": "failed", "errorCode": NWP_EXPORT_INVALID, "message": str(exc)}
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        print(json.dumps(payload, ensure_ascii=False))
        return EXIT_INVALID
    print(json.dumps(summary, ensure_ascii=False))
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
