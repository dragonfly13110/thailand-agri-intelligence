"""Validate publication boundaries before any observation enters the warehouse."""

from datetime import datetime, timezone
from functools import lru_cache
import json
import math
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

from jsonschema import Draft202012Validator, FormatChecker

from .catalog import load_provinces, load_sources

FIELDS = (
    "observation_id", "source_id", "area_code", "spatial_support", "location_id",
    "commodity_id", "observed_at", "release_at", "retrieved_at", "measure", "value",
    "unit", "data_kind", "revision_id", "quality_flag", "source_url", "license_status",
    "market_id", "price_type", "grade", "season",
)
REQUIRED = set(FIELDS) - {"market_id", "price_type", "grade", "season"}


@lru_cache(maxsize=1)
def _contract():
    schema = json.loads((Path(__file__).resolve().parents[2] / "data_contracts/observation.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema, format_checker=FormatChecker())


@lru_cache(maxsize=1)
def _catalog_codes():
    return ({s["source_id"] for s in load_sources()}, {p["area_code"] for p in load_provinces()})


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError("timestamp must be an ISO 8601 string with timezone")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return result.astimezone(timezone.utc)


def validate_observation(row):
    if not isinstance(row, dict):
        raise ValueError("observation must be an object")
    if REQUIRED - row.keys():
        raise ValueError(f"missing fields: {sorted(REQUIRED - row.keys())}")
    if row.keys() - set(FIELDS):
        raise ValueError(f"unsupported fields: {sorted(row.keys() - set(FIELDS))}")
    errors = list(_contract().iter_errors(row))
    if errors:
        raise ValueError("observation contract: " + errors[0].message)
    for key in REQUIRED - {"area_code", "commodity_id", "value", "release_at"}:
        if not isinstance(row[key], str) or not row[key].strip():
            raise ValueError(f"{key} must be a nonempty string")
    sources, provinces = _catalog_codes()
    if row["source_id"] not in sources:
        raise ValueError("unknown source_id")
    if row["area_code"] is not None and row["area_code"] not in provinces:
        raise ValueError("unknown province code; lower admin levels need verified master data first")
    if row["spatial_support"] not in {"province", "station", "grid_point", "national"}:
        raise ValueError("unsupported spatial_support")
    if row["spatial_support"] == "province" and row["area_code"] is None:
        raise ValueError("province observations require area_code")
    if row["spatial_support"] == "national" and row["area_code"] is not None:
        raise ValueError("national observations cannot claim province coverage")
    value = row["value"]
    if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
        raise ValueError("value must be finite numeric or null")
    if row["data_kind"] not in {"observed", "official", "estimated", "unknown"}:
        raise ValueError("forecast/scenario must be stored separately from observations")
    if row["license_status"] not in {"approved_public", "restricted", "pending"}:
        raise ValueError("invalid license_status")
    if row["commodity_id"] is not None and (not isinstance(row["commodity_id"], str) or not row["commodity_id"]):
        raise ValueError("commodity_id must be nonempty or null")
    observed = timestamp(row["observed_at"])
    retrieved = timestamp(row["retrieved_at"])
    released = timestamp(row["release_at"]) if row["release_at"] is not None else None
    if observed > retrieved or (released is not None and (released > retrieved or released < observed)):
        raise ValueError("invalid observation/release/retrieval chronology")
    parsed = urlparse(row["source_url"])
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("source_url must be a public HTTPS URL without credentials")
    secret_keys = {"key", "apikey", "token", "accesstoken", "authorization", "password", "secret", "signature", "credential"}
    for key, _ in parse_qsl(parsed.query):
        compact = key.lower().replace("_", "").replace("-", "")
        if compact in secret_keys or compact.startswith(("xamz", "xgoog")):
            raise ValueError("source_url cannot contain credential query parameters")
    if parsed.fragment:
        raise ValueError("source_url must not contain fragments")
    if row["measure"] == "price":
        if row.get("price_type") not in {"farm_gate", "wholesale", "retail"}:
            raise ValueError("price requires farm_gate/wholesale/retail type")
        if any(not row.get(k) for k in ("market_id", "grade", "commodity_id")):
            raise ValueError("price requires market_id, grade, commodity_id")
        if row["unit"] not in {"THB/kg", "THB/head", "THB/100_eggs", "THB/100_fruit"}:
            raise ValueError("price requires a reviewed mass/count unit; normalize tonnes to kg and never infer animal/egg/fruit weights")
    return {key: row.get(key) for key in FIELDS}
