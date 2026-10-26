"""TMD NWP (Thai Meteorological Department Numerical Weather Prediction) client.

The public NWP API publishes daily WRF forecasts for a place (province/amphoe/tambon)
or a point. This module keeps the provider grain: one location and one forecast
timestamp per record. Missing fields stay null; unknown codes stay unmapped.

Licensing and units are not confirmed in writing yet, so output is staged locally
with ``license_status: pending`` and is not imported into the warehouse.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import re
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    from tadih.catalog import ROOT
    from tadih.env import get_tmd_nwp_access_token, get_tmd_nwp_base_url
    from tadih.ingestion import trusted_ssl_context
except ImportError:  # pragma: no cover - direct module execution fallback
    ROOT = Path(__file__).resolve().parents[2]
    from env import get_tmd_nwp_access_token, get_tmd_nwp_base_url
    from ingestion import trusted_ssl_context

SOURCE_ID = "tmd_nwp"
SOURCE_AGENCY = "กรมอุตุนิยมวิทยา (TMD)"
CONTRACT_VERSION = 1
DEFAULT_BASE_URL = "https://data.tmd.go.th/nwpapi/v1"
DEFAULT_FIELDS = ("tc_max", "tc_min", "cond")
DEFAULT_OUTPUT_DIR = ROOT / "data/local/tmd_nwp"
ICT = timezone(timedelta(hours=7))
MAX_FIELDS = 20
MAX_RESPONSE_BYTES = 1_000_000

# Community-maintained mapping used by published TMD NWP scripts; official
# confirmation is still pending, so the status is carried in the envelope.
CONDITION_LABELS_TH = {
    1: "ท้องฟ้าแจ่มใส",
    2: "มีเมฆบางส่วน",
    3: "มีเมฆมาก",
    4: "มืดครึ้ม",
    5: "ฝนเล็กน้อย",
    6: "ฝนปานกลาง",
    7: "ฝนหนัก",
    8: "ฝนฟ้าคะนอง",
    9: "หนาวมาก",
    10: "หนาว",
    11: "เย็น",
    12: "ร้อนมาก",
}

_FIELD_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
_FETCHER = Callable[[str, str, float], Dict[str, Any]]


def _number(value: Any, name: str, *, min_val: Optional[float] = None,
            max_val: Optional[float] = None) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"TMD NWP field {name} is not numeric: {value!r}")
    val = float(value)
    if not math.isfinite(val):
        raise ValueError(f"TMD NWP field {name} is not finite")
    if min_val is not None and val < min_val:
        raise ValueError(f"TMD NWP field {name}={val} is below {min_val}")
    if max_val is not None and val > max_val:
        raise ValueError(f"TMD NWP field {name}={val} exceeds {max_val}")
    return val


def _fields(fields: Optional[Sequence[str]]) -> List[str]:
    if fields is None:
        return list(DEFAULT_FIELDS)
    if isinstance(fields, str):
        fields = [part.strip() for part in fields.split(",")]
    cleaned: List[str] = []
    for field in fields:
        if not isinstance(field, str) or not _FIELD_RE.fullmatch(field.strip()):
            raise ValueError(f"Invalid TMD NWP field name: {field!r}")
        if field.strip() not in cleaned:
            cleaned.append(field.strip())
    if not cleaned:
        raise ValueError("At least one TMD NWP field is required")
    if len(cleaned) > MAX_FIELDS:
        raise ValueError(f"TMD NWP field list exceeds {MAX_FIELDS} entries")
    return cleaned


def _valid_at(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("TMD NWP forecast time is not a string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("TMD NWP forecast time has no timezone")
    return parsed.astimezone(ICT)


def _fetch_json(url: str, token: str, timeout: float) -> Dict[str, Any]:
    request = Request(url, headers={
        "Authorization": f"Bearer {token}",
        "User-Agent": "TADIH-AgriIntelligence/1.0",
        "Accept": "application/json",
    })
    try:
        with urlopen(request, timeout=timeout, context=trusted_ssl_context()) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise ValueError("TMD NWP rejected the access token") from exc
        if exc.code == 429:
            raise ValueError("TMD NWP rate limit reached") from exc
        raise ValueError(f"TMD NWP returned HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ValueError(f"TMD NWP network failure: {exc}") from exc
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("TMD NWP response exceeded 1 MB")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("TMD NWP returned malformed JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("TMD NWP response must be a JSON object")
    return payload


def _records(payload: Dict[str, Any], *, requested_fields: Sequence[str],
             request: Dict[str, Any], spatial_support: str,
             retrieved_at: str) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    forecasts = payload.get("WeatherForecasts")
    if not isinstance(forecasts, list) or len(forecasts) != 1:
        raise ValueError("TMD NWP response must contain exactly one location")
    item = forecasts[0]
    if not isinstance(item, dict):
        raise ValueError("TMD NWP location entry is malformed")
    location = item.get("location")
    if not isinstance(location, dict):
        raise ValueError("TMD NWP response has no location object")

    kind = request.get("kind")
    if kind == "place":
        if str(location.get("province") or "").strip() != request["province"]:
            raise ValueError("TMD NWP returned a different province; refusing substituted data")
        if request.get("amphoe") and str(location.get("amphoe") or "").strip() != request["amphoe"]:
            raise ValueError("TMD NWP returned a different amphoe; refusing substituted data")
        if request.get("tambon") and str(location.get("tambon") or "").strip() != request["tambon"]:
            raise ValueError("TMD NWP returned a different tambon; refusing substituted data")
    elif kind == "point":
        _number(location.get("lat"), "lat", min_val=-90.0, max_val=90.0)
        _number(location.get("lon"), "lon", min_val=-180.0, max_val=180.0)

    days = item.get("forecasts")
    if not isinstance(days, list) or not days:
        raise ValueError("TMD NWP response has no forecasts")

    geocode = str(location.get("geocode") or "").strip()
    lat = _number(location.get("lat"), "lat", min_val=-90.0, max_val=90.0)
    lon = _number(location.get("lon"), "lon", min_val=-180.0, max_val=180.0)
    if geocode:
        location_id = f"tmd_nwp:geocode:{geocode}"
    elif lat is not None and lon is not None:
        location_id = f"tmd_nwp:point:{lat:.4f}:{lon:.4f}"
    else:
        raise ValueError("TMD NWP location has neither geocode nor coordinates")

    records: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for day in days:
        if not isinstance(day, dict) or not isinstance(day.get("data"), dict):
            raise ValueError("TMD NWP forecast day is malformed")
        valid = _valid_at(day.get("time"))
        valid_at = valid.isoformat()
        if valid_at in seen:
            raise ValueError("TMD NWP returned a duplicate forecast timestamp")
        seen.add(valid_at)

        data = day["data"]
        values: Dict[str, Optional[float]] = {}
        for field in requested_fields:
            if field == "cond":
                continue  # a code, not a measurement; kept in condition_code
            minimum, maximum = (0.0, 100.0) if field == "rh" else (
                (-30.0, 60.0) if field.startswith("tc") else (None, None))
            values[field] = _number(data.get(field), field, min_val=minimum, max_val=maximum)

        if values.get("tc_max") is not None and values.get("tc_min") is not None \
                and values["tc_max"] < values["tc_min"]:
            raise ValueError("TMD NWP tc_max is lower than tc_min")

        code_raw = data.get("cond")
        if code_raw is None:
            condition_code = None
        else:
            if isinstance(code_raw, bool) or not isinstance(code_raw, int):
                raise ValueError("TMD NWP cond code is not an integer")
            condition_code = code_raw

        records.append({
            "source_id": SOURCE_ID,
            "location_id": location_id,
            "spatial_support": spatial_support,
            "geocode": geocode or None,
            "province_name_th": str(location.get("province") or "").strip() or None,
            "amphoe_name_th": str(location.get("amphoe") or "").strip() or None,
            "tambon_name_th": str(location.get("tambon") or "").strip() or None,
            "region_code": str(location.get("region") or "").strip() or None,
            "latitude": lat,
            "longitude": lon,
            "valid_at": valid_at,
            "valid_date": valid.date().isoformat(),
            "values": values,
            "condition_code": condition_code,
            "condition_label_th": CONDITION_LABELS_TH.get(condition_code),
            "retrieved_at": retrieved_at,
            "data_kind": "forecast",
            "license_status": "pending",
        })

    records.sort(key=lambda row: row["valid_at"])
    return records, {
        "location_id": location_id,
        "geocode": geocode or None,
        "province_name_th": str(location.get("province") or "").strip() or None,
        "amphoe_name_th": str(location.get("amphoe") or "").strip() or None,
        "tambon_name_th": str(location.get("tambon") or "").strip() or None,
        "areatype": str(location.get("areatype") or "").strip() or None,
        "latitude": lat,
        "longitude": lon,
    }


def _save(envelope: Dict[str, Any], output_path: Optional[Path], *,
          request: Dict[str, Any], valid_dates: Sequence[str]) -> str:
    if output_path is None:
        key = (envelope.get("location") or {}).get("location_id") or request.get("location_key") or "point"
        safe = re.sub(r"[^A-Za-z0-9._-]+", "-", str(key)).strip("-") or "point"
        stamp = valid_dates[0] if valid_dates else datetime.now(ICT).date().isoformat()
        target = DEFAULT_OUTPUT_DIR / f"{request['kind']}-{safe}-{stamp}.json"
    else:
        target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(envelope, ensure_ascii=False, indent=2, allow_nan=False),
                      encoding="utf-8")
    return str(target)


def _fetch(kind: str, request: Dict[str, Any], endpoint: str, *,
           fields: Sequence[str], token: Optional[str], requester: Optional[_FETCHER],
           timeout: float, output_path: Optional[Path], save: bool) -> Dict[str, Any]:
    if not isinstance(timeout, (int, float)) or not 0 < float(timeout) <= 60:
        raise ValueError("timeout must be between 0 and 60 seconds")
    resolved = (token if token is not None else get_tmd_nwp_access_token() or "").strip()
    if not resolved:
        raise ValueError("TMD_NWP_ACCESS_TOKEN is not configured")

    params = {key: value for key, value in request.items()
              if key in ("province", "amphoe", "tambon", "lat", "lon")}
    params["fields"] = ",".join(fields)
    url = f"{endpoint}?{urlencode(params)}"
    payload = (requester or _fetch_json)(url, resolved, float(timeout))
    retrieved_at = datetime.now(timezone.utc).isoformat()
    spatial_support = request["spatial_support"]
    records, location = _records(payload, requested_fields=fields, request=request,
                                 spatial_support=spatial_support, retrieved_at=retrieved_at)
    valid_dates = sorted({row["valid_date"] for row in records})
    envelope: Dict[str, Any] = {
        "source_id": SOURCE_ID,
        "source_agency": SOURCE_AGENCY,
        "contract_version": CONTRACT_VERSION,
        "endpoint": endpoint,
        "request": {key: value for key, value in request.items()
                    if key not in ("spatial_support", "location_key")},
        "requested_fields": list(fields),
        "data_kind": "forecast",
        "spatial_support": spatial_support,
        "location": location,
        "valid_dates": valid_dates,
        "record_count": len(records),
        "status": "ok" if any(value is not None for row in records
                              for value in row["values"].values()) or any(
                                  row["condition_code"] is not None for row in records) else "empty",
        "retrieved_at": retrieved_at,
        "license_status": "pending",
        "unit_status": "pending_official_confirmation",
        "condition_mapping_status": "pending_official_confirmation",
        "warehouse_status": "not_imported_units_and_licence_pending",
        "records": records,
    }
    if save:
        envelope["path"] = _save(envelope, output_path, request=request,
                                 valid_dates=valid_dates)
    return envelope


def fetch_nwp_daily_place(province: str, *, amphoe: Optional[str] = None,
                          tambon: Optional[str] = None,
                          fields: Optional[Sequence[str]] = None,
                          token: Optional[str] = None,
                          requester: Optional[_FETCHER] = None,
                          timeout: float = 25.0,
                          output_path: Optional[Path] = None,
                          save: bool = True) -> Dict[str, Any]:
    """Fetch one TMD NWP daily forecast for a province/amphoe/tambon."""
    if not isinstance(province, str) or not province.strip():
        raise ValueError("province is required")
    request: Dict[str, Any] = {"kind": "place", "province": province.strip()}
    if amphoe:
        request["amphoe"] = amphoe.strip()
    if tambon:
        request["tambon"] = tambon.strip()
    if tambon and not amphoe:
        raise ValueError("tambon requires amphoe")
    request["spatial_support"] = "amphoe" if amphoe else "province"
    request["location_key"] = request.get("amphoe") or province.strip()
    return _fetch("place", request, f"{get_tmd_nwp_base_url()}/forecast/location/daily/place",
                  fields=_fields(fields), token=token, requester=requester,
                  timeout=timeout, output_path=output_path, save=save)


def fetch_nwp_daily_point(latitude: float, longitude: float, *,
                          fields: Optional[Sequence[str]] = None,
                          token: Optional[str] = None,
                          requester: Optional[_FETCHER] = None,
                          timeout: float = 25.0,
                          output_path: Optional[Path] = None,
                          save: bool = True) -> Dict[str, Any]:
    """Fetch one TMD NWP daily forecast for a model grid point."""
    lat = _number(latitude, "latitude", min_val=-90.0, max_val=90.0)
    lon = _number(longitude, "longitude", min_val=-180.0, max_val=180.0)
    if lat is None or lon is None:
        raise ValueError("latitude and longitude are required")
    request: Dict[str, Any] = {
        "kind": "point",
        "lat": f"{lat:.5f}",
        "lon": f"{lon:.5f}",
        "spatial_support": "grid_point",
        "location_key": f"{lat:.4f}-{lon:.4f}",
    }
    return _fetch("point", request, f"{get_tmd_nwp_base_url()}/forecast/location/daily/at",
                  fields=_fields(fields), token=token, requester=requester,
                  timeout=timeout, output_path=output_path, save=save)
