"""Small, bounded public-data probes with immutable provenance snapshots."""

from datetime import date, datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import ssl
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


CKAN_SOURCES = {
    "https://ckan.doae.go.th": "doae",
    "https://catalog.oae.go.th": "oae",
}
# Verified Thailand agricultural sample points (tested against DDPM province boundaries).
THAI_SAMPLE_POINTS = {
    (13.8, 100.25),      # Central: Nakhon Pathom agricultural plain (rice/sugarcane)
    (13.7563, 100.5018), # Bangkok center
    (18.75, 99.0),       # North: Chiang Mai basin (rice/corn/orchards)
    (16.82, 100.26),     # Lower North: Phitsanulok plains (rice)
    (16.44, 102.83),     # Upper Northeast: Khon Kaen (cassava/sugarcane/rice)
    (15.24, 104.85),     # Lower Northeast: Ubon Ratchathani (Jasmine rice)
    (12.61, 102.10),     # East: Chanthaburi fruit belt (durian/rubber)
    (14.02, 99.53),      # West: Kanchanaburi (sugarcane/cassava)
    (9.14, 99.33),       # South: Surat Thani (oil palm/rubber)
}
DAILY_VARIABLES = ("precipitation_sum", "temperature_2m_max", "et0_fao_evapotranspiration")
MAX_RESPONSE_BYTES = 10 * 1024 * 1024
OAE_RICE_PRODUCT = "ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15"


def trusted_ssl_context():
    """Use Windows server-auth ROOT anchors, excluding stale cached intermediates."""
    if sys.platform != "win32" or os.environ.get("SSL_CERT_FILE") or os.environ.get("SSL_CERT_DIR"):
        return ssl.create_default_context()
    roots = [ssl.DER_cert_to_PEM_cert(cert) for cert, encoding, trust in ssl.enum_certificates("ROOT")
             if encoding == "x509_asn" and (trust is True or ssl.Purpose.SERVER_AUTH.oid in trust)]
    if not roots:
        raise ssl.SSLError("Windows ROOT store has no server-auth trust anchors")
    return ssl.create_default_context(cadata="".join(roots))


def fetch_json(url, *, opener=None, sleep=time.sleep, attempts=3, timeout=20):
    """Retry rate limits/transient failures only; never bypass TLS verification."""
    if not 1 <= attempts <= 5:
        raise ValueError("attempts must be between 1 and 5")
    request = Request(url, headers={"User-Agent": "TADIH/0.1 public-data-probe", "Accept": "application/json"})
    context = trusted_ssl_context() if opener is None else None
    for attempt in range(attempts):
        try:
            response = urlopen(request, timeout=timeout, context=context) if opener is None else opener(request, timeout=timeout)
            with response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError("response exceeds 10 MiB probe limit")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("provider response must be a JSON object")
            return payload
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise
            retry_after = exc.headers.get("Retry-After", "") if exc.headers else ""
            delay = min(float(retry_after), 30) if retry_after.isdigit() else 2 ** attempt
            exc.close()
        except (URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            delay = 2 ** attempt
        sleep(delay)


def _envelope(source_id, request_url, payload, **metadata):
    return {
        "source_id": source_id,
        "request_url": request_url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "release_at": None,
        "issue_at": None,
        "payload": payload,
        **metadata,
    }


def discover_ckan(base_url, limit=5, *, start=0, fetcher=fetch_json):
    """Discover metadata only. A resource URL is not proof of downloadable data."""
    base_url = base_url.rstrip("/")
    if base_url not in CKAN_SOURCES:
        raise ValueError("only registered DOAE/OAE HTTPS catalogs are supported")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ValueError("limit must be an integer from 1 to 100")
    if isinstance(start, bool) or not isinstance(start, int) or start < 0:
        raise ValueError("start must be a non-negative integer")
    url = base_url + "/api/3/action/package_search?" + urlencode({"rows": limit, "start": start, "sort": "id asc"})
    payload = fetcher(url)
    result = payload.get("result", {})
    if payload.get("success") is not True or not isinstance(result, dict) or not isinstance(result.get("results"), list):
        raise ValueError("CKAN response failed or package_search schema changed")
    return _envelope(
        CKAN_SOURCES[base_url], url, payload,
        data_kind="metadata", spatial_support="catalog_metadata",
        pagination={"start": start, "page_size": limit, "next_start": start + len(result["results"]), "total_count": result.get("count"), "complete": isinstance(result.get("count"), int) and start + len(result["results"]) >= result["count"]},
        limitations=["Catalog discovery does not verify resource access, licence, geography or measurement coverage."],
    )


def discover_ckan_pages(base_url, *, page_size=100, max_pages=10, start=0, fetcher=fetch_json, sleep=time.sleep):
    """Bounded metadata pagination, retaining explicit completion/checkpoint state."""
    if isinstance(max_pages, bool) or not isinstance(max_pages, int) or not 1 <= max_pages <= 100:
        raise ValueError("max_pages must be an integer from 1 to 100")
    combined, urls, first, complete = [], [], None, False
    for index in range(max_pages):
        page = discover_ckan(base_url, page_size, start=start, fetcher=fetcher)
        first = first or page
        rows = page["payload"]["result"]["results"]
        combined.extend(rows)
        urls.append(page["request_url"])
        start = page["pagination"]["next_start"]
        complete = page["pagination"]["complete"]
        if complete or not rows:
            break
        if index < max_pages - 1:
            sleep(0.25)
    first["payload"]["result"]["results"] = combined
    first["request_urls"] = urls
    first["pagination"].update(next_start=start, pages=len(urls), complete=complete)
    first["retrieved_at"] = page["retrieved_at"]
    return first


def fetch_weather(latitude, longitude, start_date, end_date, forecast=False, *, fetcher=fetch_json):
    """Fetch one approved Thai grid point, never a province area average."""
    if isinstance(latitude, bool) or isinstance(longitude, bool):
        raise ValueError("coordinates must be numeric")
    latitude, longitude = float(latitude), float(longitude)
    if not math.isfinite(latitude) or not math.isfinite(longitude) or (latitude, longitude) not in THAI_SAMPLE_POINTS:
        raise ValueError("coordinate not in approved Thailand sample points")
    start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
    if end < start or (end - start).days > 366:
        raise ValueError("date window must be ordered and at most 367 days inclusive")
    if not isinstance(forecast, bool):
        raise ValueError("forecast must be a boolean")
    endpoint = "https://api.open-meteo.com/v1/forecast" if forecast else "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": latitude, "longitude": longitude,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": ",".join(DAILY_VARIABLES), "timezone": "Asia/Bangkok",
    }
    if not forecast:
        params["models"] = "era5"
    url = endpoint + "?" + urlencode(params)
    payload = fetcher(url)
    daily, units = payload.get("daily"), payload.get("daily_units")
    if payload.get("error") or not isinstance(daily, dict) or not isinstance(units, dict):
        raise ValueError("Open-Meteo response failed or daily schema changed")
    expected_dates = [(start.fromordinal(start.toordinal() + offset)).isoformat() for offset in range((end - start).days + 1)]
    if daily.get("time") != expected_dates:
        raise ValueError("Open-Meteo returned an incomplete or unexpected date window")
    expected_units = {"precipitation_sum": "mm", "temperature_2m_max": "°C", "et0_fao_evapotranspiration": "mm"}
    for variable in DAILY_VARIABLES:
        values = daily.get(variable)
        if not isinstance(values, list) or len(values) != len(expected_dates) or units.get(variable) != expected_units[variable]:
            raise ValueError("Open-Meteo daily variable shape or unit mismatch: " + variable)
        if any(value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)) for value in values):
            raise ValueError("Open-Meteo values must be finite numbers or null")
    return _envelope(
        "open_meteo", url, payload,
        data_kind="forecast" if forecast else "estimated",
        spatial_support="grid_point", requested_location={"latitude": latitude, "longitude": longitude},
        start_date=start.isoformat(), end_date=end.isoformat(),
        provider_model="best_match" if forecast else "era5",
        licence="CC-BY-4.0", attribution="Weather data by Open-Meteo (https://open-meteo.com/)",
        limitations=[
            "Approved sample point, not province coverage or a station observation.",
            "Free API access is non-commercial only; verify terms before operational use.",
            "Provider release/run time unavailable; issue_at and release_at remain null. Retrieval time is not provider issue time.",
            "Archive is reanalysis, including later revisions; do not use as as-of historical features without availability evidence.",
        ],
    )


def fetch_oae_rice_prices(*, max_pages=5, start_page=1, fetcher=fetch_json, sleep=time.sleep):
    """Read bounded pages of one verified OAE national monthly farmgate series."""
    if isinstance(max_pages, bool) or not isinstance(max_pages, int) or not 1 <= max_pages <= 100:
        raise ValueError("max_pages must be an integer from 1 to 100")
    if isinstance(start_page, bool) or not isinstance(start_page, int) or start_page < 1:
        raise ValueError("start_page must be a positive integer")
    pages, urls, rows, complete = [], [], [], False
    for index in range(max_pages):
        page_number = start_page + index
        url = "https://agriapi.nabc.go.th/api/monthly-prices/product?" + urlencode({"product_name": OAE_RICE_PRODUCT, "page": page_number, "limit": 100})
        payload = fetcher(url)
        pagination = payload.get("pagination", {})
        if payload.get("success") is not True or not isinstance(payload.get("data"), list) or not isinstance(pagination, dict):
            raise ValueError("OAE price response failed or schema changed")
        if pagination.get("page") != page_number or not isinstance(pagination.get("total"), int) or not isinstance(pagination.get("offset"), int):
            raise ValueError("OAE pagination metadata missing or unexpected")
        pages.append(payload)
        urls.append(url)
        rows.extend(payload["data"])
        complete = pagination["offset"] + len(payload["data"]) >= pagination["total"]
        if complete or not payload["data"]:
            break
        if index < max_pages - 1:
            sleep(0.25)
    return _envelope(
        "oae", urls[0], {"data": rows, "pages": pages},
        request_urls=urls, data_kind="official", spatial_support="national",
        licence="Creative Commons Attributions Non-Commercial; exact version pending review",
        license_status="pending", product_name=OAE_RICE_PRODUCT,
        pagination={"start_page": start_page, "next_page": page_number + 1, "pages": len(pages), "total_count": pagination["total"], "complete": complete},
        limitations=["National monthly farmgate price, not province coverage.", "Unknown publication dates; not eligible for as-of backtesting.", "Public redistribution requires exact licence review."],
    )


def normalize_oae_rice_prices(envelope):
    """Map this provider series only; retain raw BE year/value/unit in snapshot."""
    if envelope.get("source_id") != "oae":
        raise ValueError("expected OAE envelope")
    from .prices import monthly_price_observation
    rows, seen = [], set()
    for raw in envelope["payload"]["data"]:
        if raw.get("province_code") != "TH00" or raw.get("product_name") != OAE_RICE_PRODUCT:
            raise ValueError("OAE sample is not the verified national rice series")
        if raw.get("unit") != "บาท/ตัน":
            raise ValueError("OAE sample unit changed; expected THB/tonne")
        row = monthly_price_observation(raw, envelope["retrieved_at"])
        if row["observation_id"] in seen:
            raise ValueError("duplicate monthly OAE observation; inspect source revisions")
        seen.add(row["observation_id"])
        rows.append(row)
    return rows


def _safe_key(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}", value) or ".." in value:
        raise ValueError("source and partition keys must be safe file-name components")
    return value


def _write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as handle:
        temporary = Path(handle.name)
        json.dump(payload, handle, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
        handle.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def save_snapshot(payload, source_id, output_dir, partition_key="probe"):
    """Save immutable JSON versions and atomically checkpoint latest successful one."""
    source_id, partition_key = _safe_key(source_id), _safe_key(partition_key)
    if payload.get("source_id") != source_id:
        raise ValueError("snapshot source_id does not match envelope")
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    checksum = hashlib.sha256(canonical).hexdigest()
    directory = Path(output_dir) / source_id / partition_key
    artifact = directory / (checksum + ".json")
    if not artifact.exists():
        _write_json(artifact, payload)
    record = {
        "source_id": source_id, "partition_key": partition_key,
        "status": "success" if payload.get("status") in (None, "ok", "success") else "failed",
        "checksum": checksum, "checksum_basis": "canonical_json_utf8",
        "artifact": artifact.name, "retrieved_at": payload.get("retrieved_at"),
        "request_url": payload.get("request_url"),
    }
    _write_json(directory / ("manifest.json" if record["status"] == "success" else "last_failed_attempt.json"), record)
    return record


def snapshot_complete(source_id, output_dir, partition_key="probe"):
    """Resume only when checkpoint and canonical artifact hash both verify."""
    directory = Path(output_dir) / _safe_key(source_id) / _safe_key(partition_key)
    try:
        record = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        checksum = record["checksum"]
        if not isinstance(checksum, str) or not re.fullmatch(r"[0-9a-f]{64}", checksum):
            return False
        if record.get("status") != "success" or record.get("artifact") != checksum + ".json":
            return False
        payload = json.loads((directory / record["artifact"]).read_text(encoding="utf-8"))
        canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        return payload.get("source_id") == source_id and hashlib.sha256(canonical).hexdigest() == checksum
    except (OSError, ValueError, KeyError, TypeError):
        return False


def backfill_weather(latitude, longitude, start_year, end_year, output_dir, *, refresh=False, fetcher=fetch_json, sleep=time.sleep):
    """Checkpoint completed years at one approved point; at most twenty requests."""
    if any(isinstance(year, bool) or not isinstance(year, int) for year in (start_year, end_year)):
        raise ValueError("backfill years must be integers")
    if not isinstance(refresh, bool):
        raise ValueError("refresh must be a boolean")
    if not 1940 <= start_year <= end_year < datetime.now(timezone.utc).year or end_year - start_year >= 20:
        raise ValueError("backfill requires at most twenty completed years, starting no earlier than 1940")
    if (float(latitude), float(longitude)) not in THAI_SAMPLE_POINTS:
        raise ValueError("coordinate not in approved Thailand sample points")
    records = []
    for year in range(start_year, end_year + 1):
        partition = f"era5-{float(latitude)}-{float(longitude)}-{year}"
        directory = Path(output_dir) / "open_meteo" / partition
        if not refresh and snapshot_complete("open_meteo", output_dir, partition):
            record = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
            envelope = json.loads((directory / record["artifact"]).read_text(encoding="utf-8"))
            if envelope.get("start_date") != f"{year}-01-01" or envelope.get("end_date") != f"{year}-12-31" or envelope.get("requested_location") != {"latitude": float(latitude), "longitude": float(longitude)} or envelope.get("provider_model") != "era5":
                raise ValueError("backfill checkpoint does not match requested point/year/model")
            action = "skipped_verified"
        else:
            envelope = fetch_weather(latitude, longitude, f"{year}-01-01", f"{year}-12-31", fetcher=fetcher)
            record = save_snapshot(envelope, "open_meteo", output_dir, partition)
            action = "fetched"
            sleep(0.25)
        records.append({**record, "action": action, "path": str((directory / record["artifact"]).resolve()), "daily_rows": len(envelope["payload"]["daily"]["time"])})
    return records
