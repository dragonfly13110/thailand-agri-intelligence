"""Versioned public reference catalog; metadata never implies observations exist."""

import csv
import json
import re
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
PROVINCE_CODES = frozenset(
    "10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 "
    "30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 "
    "50 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 67 "
    "70 71 72 73 74 75 76 77 80 81 82 83 84 85 86 90 91 92 93 94 95 96".split()
)


def load_provinces(path=None):
    """Load all 77 DOPA code/name references, preserving codes as text."""
    with Path(path or ROOT / "config/provinces.csv").open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    codes = [row.get("area_code") for row in rows]
    if len(rows) != 77 or set(codes) != PROVINCE_CODES:
        raise ValueError("Province catalog must contain each of the 77 DOPA province codes exactly once")
    for row in rows:
        if (row.get("province_code") != row["area_code"]
                or row.get("admin_level") != "province"
                or not row.get("name_th") or not row.get("source_url")):
            raise ValueError("Province catalog requires province grain, code, name and provenance")
    return rows


def load_sources(path=None):
    """Load source metadata; runtime and licence approvals remain independent."""
    with Path(path or ROOT / "config/sources.json").open(encoding="utf-8-sig") as stream:
        payload = json.load(stream)
    rows = payload.get("sources") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        raise ValueError("Source catalog must contain a nonempty sources list")
    seen = set()
    required = {"id", "source_id", "owner", "name", "category", "url", "type",
                "priority", "status", "geographic_scope", "data_grain", "license_status",
                "auth_status", "runtime_verified", "deferred", "domains"}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Each source must be an object")
        source_id = row.get("source_id")
        if (not required.issubset(row) or row.get("id") != source_id
                or not isinstance(source_id, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", source_id)
                or source_id in seen):
            raise ValueError("Source catalog requires complete metadata and unique source IDs")
        if row["geographic_scope"] != "Thailand" and not row["deferred"]:
            raise ValueError("Non-Thailand agricultural sources must remain deferred")
        if not isinstance(row["runtime_verified"], bool) or not isinstance(row["deferred"], bool):
            raise ValueError("Source runtime/deferred flags must be booleans")
        if not isinstance(row["data_grain"], list) or not row["data_grain"]:
            raise ValueError("Source grain must be explicit")
        if (not isinstance(row["domains"], list) or not row["domains"]
                or any(d not in {f"AG{i:02d}" for i in range(1, 21)} for d in row["domains"])):
            raise ValueError("Source domains must use AG01 through AG20")
        parsed = urlparse(row["url"])
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Source URL must be HTTPS without credentials")
        if row["license_status"] not in {"approved_public", "restricted", "pending"}:
            raise ValueError("Source licence status must be explicit")
        seen.add(source_id)
    return rows


def load_resource_licenses(path=None):
    """Load exact resource license register with explicit approved and pending entries."""
    source_path = Path(path or ROOT / "config/resource_licenses.json")
    with source_path.open(encoding="utf-8-sig") as stream:
        payload = json.load(stream)
    if not isinstance(payload, dict):
        raise ValueError("Resource license register must be an object")
    automatic = payload.get("automatic_approval")
    if not isinstance(automatic, bool):
        raise ValueError("Resource license register requires an explicit automatic_approval boolean")
    policy_ref = payload.get("automatic_approval_policy")
    if automatic:
        if not isinstance(policy_ref, str) or not policy_ref.strip():
            raise ValueError("Automatic publication approval requires automatic_approval_policy")
        policy_path = Path(policy_ref)
        if not policy_path.is_absolute():
            policy_path = source_path.parent / policy_path
            if not policy_path.is_file():
                policy_path = ROOT / policy_ref
        if not policy_path.is_file():
            raise ValueError("automatic_approval_policy must point to an existing policy file")
    elif policy_ref is not None:
        raise ValueError("automatic_approval_policy is only valid when automatic_approval is true")
    resources = payload.get("resources")
    if not isinstance(resources, list) or not resources:
        raise ValueError("Resource license register must contain a nonempty resources list")
    seen = set()
    required = {"resource_key", "source_id", "name", "license_status",
                "project_publication_approved", "commercial_use_confirmed", "unresolved", "evidence"}
    for row in resources:
        if not isinstance(row, dict) or not required.issubset(row):
            raise ValueError("Each resource entry must contain required review fields")
        key = row["resource_key"]
        if key in seen or not isinstance(key, str) or not key.strip():
            raise ValueError("Resource keys must be unique nonempty strings")
        if row["license_status"] not in {"approved_public", "restricted", "pending"}:
            raise ValueError("Resource license status must be explicit")
        if not isinstance(row["project_publication_approved"], bool) or not isinstance(row["commercial_use_confirmed"], bool):
            raise ValueError("Approval and commercial confirmation must be booleans")
        authorization = row.get("publication_authorization")
        if authorization is not None:
            if not isinstance(authorization, dict) or authorization.get("basis") not in {
                "project_owner_instruction",
                "open_license_policy",
            }:
                raise ValueError("Publication authorization must name a supported basis")
            if authorization["basis"] == "open_license_policy":
                for field in ("document", "policy_id", "license_class"):
                    if not isinstance(authorization.get(field), str) or not authorization[field].strip():
                        raise ValueError("Open-licence authorization requires document/policy_id/license_class")
        if not isinstance(row["evidence"], list) or not row["evidence"]:
            raise ValueError("Resource entry requires verifiable evidence items")
        seen.add(key)
    return resources

