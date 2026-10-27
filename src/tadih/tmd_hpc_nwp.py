"""TMD HPC NWP Data Download Center client (gridded forecast files).

The Thai Meteorological Department HPC centre publishes one static bundle per
model run under ``https://hpc.tmd.go.th``. The listing endpoint
``/api/download-files?init_time=YYYYMMDDHH`` returns metadata only; the data
itself lives in large CSV/NetCDF files served over HTTPS (plain HTTP is reset).

This module keeps the source grain: one run, one domain, one variable per file.
It downloads only the requested variables, verifies size and SHA-256 while
streaming, and records the result in a manifest that matches the TADIH data
contract. Units are not confirmed in writing, so the manifest carries
``unit_status: pending_official_confirmation`` and keeps its ingest-stage
``license_status`` pending. The D1 publisher applies the current approved
resource status from the exact licence-register row.

Fail-closed rules: no manifest is ever marked ``ready`` when a requested file
is missing or invalid, partially written files are deleted, and listing /
content checks reject HTML or JSON error bodies served instead of data.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from http.client import HTTPException
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

try:
    from tadih.catalog import ROOT
    from tadih.env import get_tmd_hpc_base_url, get_tmd_hpc_publication_mode
    from tadih.ingestion import trusted_ssl_context
except ImportError:  # pragma: no cover - direct module execution fallback
    ROOT = Path(__file__).resolve().parents[2]
    from env import get_tmd_hpc_base_url, get_tmd_hpc_publication_mode
    from ingestion import trusted_ssl_context


SOURCE_ID = "tmd_hpc_nwp"
SOURCE_AGENCY = "กรมอุตุนิยมวิทยา (TMD)"
CONTRACT_VERSION = 1
DOMAINS = {"d01", "d02"}
DEFAULT_DOMAIN = "d02"
DOMAIN_LABELS = {"d01": "Indochina 9km", "d02": "Thailand 3km"}
V1_VARIABLES = ("p1h", "p24h", "t2m", "rhum", "ws10m")
DEFAULT_OUTPUT_DIR = ROOT / "data/local/tmd_nwp_hpc"
DEFAULT_TIMEOUT = 60
MAX_RETRIES = 2
DEFAULT_MAX_BYTES = 200_000_000
USER_AGENT = "TADIH/1.0 (+https://hpc.tmd.go.th)"
LEAD_HOURS = (0, 6, 12, 24, 48, 72)
GRID = {
    "bbox": [96.0, 5.0, 106.0, 21.0],
    "source_cell_deg": 0.0277,
    "output_cell_deg": 0.15,
    "nx": 67,
    "ny": 107,
}

MAX_LISTING_BYTES = 4_000_000
MAX_PROBE_BYTES_LIMIT = 65_536
CHUNK_SIZE = 1024 * 1024
RETRY_DELAYS = (0.5, 1.0)

TMD_HPC_INVALID_INIT_TIME = "TMD_HPC_INVALID_INIT_TIME"
TMD_HPC_UNSUPPORTED_DOMAIN = "TMD_HPC_UNSUPPORTED_DOMAIN"
TMD_HPC_NO_VARIABLES = "TMD_HPC_NO_VARIABLES"
TMD_HPC_LISTING_FAILED = "TMD_HPC_LISTING_FAILED"
TMD_HPC_INVALID_LISTING = "TMD_HPC_INVALID_LISTING"
TMD_HPC_FILE_NOT_FOUND = "TMD_HPC_FILE_NOT_FOUND"
TMD_HPC_HTTP_ERROR = "TMD_HPC_HTTP_ERROR"
TMD_HPC_FILE_TOO_LARGE = "TMD_HPC_FILE_TOO_LARGE"
TMD_HPC_CHECKSUM_MISMATCH = "TMD_HPC_CHECKSUM_MISMATCH"
TMD_HPC_BAD_CONTENT = "TMD_HPC_BAD_CONTENT"
TMD_HPC_MANIFEST_INVALID = "TMD_HPC_MANIFEST_INVALID"

_RUN_ID_RE = re.compile(r"^[a-z0-9_]{8,80}$")
_INIT_TIME_RE = re.compile(r"^[0-9]{10}$")
_VARIABLE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")
_CSV_NAME_RE = re.compile(
    r"^(?P<variable>[A-Za-z0-9][A-Za-z0-9_-]*)\.(?P<domain>d[0-9]{2})\.(?P<init>[0-9]{10})\.csv$")
_NC_NAME_RE = re.compile(
    r"^(?P<init>[0-9]{10})\.(?P<variable>[A-Za-z0-9][A-Za-z0-9_-]*)\.(?P<domain>d[0-9]{2})\.nc$")
_SIZE_RE = re.compile(r"^([0-9]+(?:\.[0-9]+)?)\s*([KMGT]?B?)$", re.IGNORECASE)
_CONTENT_RANGE_RE = re.compile(r"^bytes\s+[0-9]+-[0-9]+/([0-9]+|\*)$", re.IGNORECASE)

_FETCHER = Callable[..., Any]
_sleep = time.sleep


class TmdHpcError(ValueError):
    """Provider error carrying a stable machine-readable ``code``."""

    def __init__(self, code: str, message: str, *, retryable: bool = False):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.retryable = retryable


def iso_utc(value: datetime) -> str:
    """Format a datetime as ISO-8601 UTC with a trailing ``Z``."""
    if not isinstance(value, datetime):
        raise ValueError("iso_utc requires a datetime")
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_init_time(value: Any) -> tuple[str, datetime]:
    if not isinstance(value, str) or not _INIT_TIME_RE.fullmatch(value):
        raise TmdHpcError(TMD_HPC_INVALID_INIT_TIME,
                          f"init_time must be 10 digits YYYYMMDDHH, got {value!r}")
    try:
        parsed = datetime.strptime(value, "%Y%m%d%H")
    except ValueError as exc:
        raise TmdHpcError(TMD_HPC_INVALID_INIT_TIME,
                          f"init_time is not a real UTC hour: {value}") from exc
    if int(value[8:10]) > 23:
        raise TmdHpcError(TMD_HPC_INVALID_INIT_TIME, f"init_time hour out of range: {value}")
    return value, parsed.replace(tzinfo=timezone.utc)


def _validated_domain(domain: Any) -> str:
    if not isinstance(domain, str) or domain.strip() not in DOMAINS:
        raise TmdHpcError(TMD_HPC_UNSUPPORTED_DOMAIN,
                          f"domain must be one of {sorted(DOMAINS)}, got {domain!r}")
    return domain.strip()


def _requested_variables(variables: Any) -> List[str]:
    if variables is None:
        variables = V1_VARIABLES
    if isinstance(variables, str):
        variables = [part.strip() for part in variables.split(",")]
    if not isinstance(variables, (list, tuple)):
        raise ValueError("variables must be a sequence of variable names")
    cleaned: List[str] = []
    for item in variables:
        if not isinstance(item, str) or not _VARIABLE_RE.fullmatch(item.strip()):
            raise ValueError(f"invalid variable name: {item!r}")
        name = item.strip()
        if name in cleaned:
            raise ValueError(f"duplicate variable requested: {name}")
        cleaned.append(name)
    if not cleaned:
        raise TmdHpcError(TMD_HPC_NO_VARIABLES, "at least one variable is required")
    return cleaned


def _parse_size(value: Any) -> Optional[int]:
    """Parse listing display sizes such as ``15101.7 KB`` into bytes."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if not isinstance(value, str):
        return None
    match = _SIZE_RE.fullmatch(value.strip())
    if not match:
        return None
    number = float(match.group(1))
    unit = (match.group(2) or "").upper()
    factor = {"": 1, "B": 1, "KB": 1024, "MB": 1024 ** 2,
              "GB": 1024 ** 3, "TB": 1024 ** 4}.get(unit)
    if factor is None:
        return None
    return int(round(number * factor))


def _absolute_url(base_url: str, raw: Any) -> str:
    if not isinstance(raw, str) or not raw.strip():
        raise TmdHpcError(TMD_HPC_INVALID_LISTING, "listing entry has no url")
    candidate = raw.strip()
    parsed = urlparse(candidate)
    if parsed.scheme:
        if parsed.scheme.lower() != "https":
            raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                              f"refusing non-HTTPS source url: {candidate}")
        if parsed.hostname != urlparse(base_url).hostname:
            raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                              f"refusing off-host source url: {candidate}")
        return candidate
    return urljoin(base_url.rstrip("/") + "/", candidate.lstrip("/"))


def _format_of(entry: Mapping[str, Any], filename: str) -> Optional[str]:
    raw = entry.get("format")
    text = raw.strip().upper() if isinstance(raw, str) else ""
    if text == "CSV":
        return "CSV"
    if text in ("NETCDF", "NETCDF-4", "NC") or "NETCDF" in text:
        return "NETCDF"
    lower = filename.lower()
    if lower.endswith(".csv"):
        return "CSV"
    if lower.endswith(".nc"):
        return "NETCDF"
    return text or None


def _normalize_file(entry: Any, *, base_url: str, init_time: str,
                    init_at: str) -> Dict[str, Any]:
    if not isinstance(entry, dict):
        raise TmdHpcError(TMD_HPC_INVALID_LISTING, "listing entry is not an object")
    filename = entry.get("filename")
    if not isinstance(filename, str) or not filename.strip():
        raise TmdHpcError(TMD_HPC_INVALID_LISTING, "listing entry has no filename")
    filename = filename.strip()
    if "/" in filename or "\\" in filename or filename in (".", ".."):
        raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                          f"unsafe listing filename: {filename}")

    derived_variable: Optional[str] = None
    derived_domain: Optional[str] = None
    csv_match = _CSV_NAME_RE.fullmatch(filename)
    nc_match = _NC_NAME_RE.fullmatch(filename)
    if csv_match:
        derived_variable = csv_match.group("variable")
        derived_domain = csv_match.group("domain")
        parsed_init = csv_match.group("init")
    elif nc_match:
        derived_variable = nc_match.group("variable")
        derived_domain = nc_match.group("domain")
        parsed_init = nc_match.group("init")
    else:
        parsed_init = None
    if parsed_init is not None and parsed_init != init_time:
        raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                          f"filename {filename} belongs to init {parsed_init}, not {init_time}")

    explicit_variable = entry.get("variable")
    if isinstance(explicit_variable, str) and _VARIABLE_RE.fullmatch(explicit_variable.strip()):
        explicit_variable = explicit_variable.strip()
        if derived_variable and explicit_variable.lower() != derived_variable.lower():
            raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                              f"variable mismatch for {filename}")
        variable = explicit_variable
    else:
        variable = derived_variable

    raw_domain = entry.get("domain_code")
    domain_code = raw_domain.strip().lower() if isinstance(raw_domain, str) else None
    if domain_code not in DOMAINS:
        domain_code = None
    if derived_domain not in DOMAINS:
        derived_domain = None
    if domain_code and derived_domain and domain_code != derived_domain:
        raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                          f"domain mismatch for {filename}: "
                          f"{domain_code} != {derived_domain}")
    domain = domain_code or derived_domain

    size = _parse_size(entry.get("size"))
    if size is None:
        for key in ("bytes", "size_bytes"):
            candidate = entry.get(key)
            if isinstance(candidate, int) and not isinstance(candidate, bool) and candidate >= 0:
                size = candidate
                break

    return {
        "variable": variable,
        "domain": domain,
        "filename": filename,
        "url": _absolute_url(base_url, entry.get("url")),
        "bytes": size,
        "format": _format_of(entry, filename),
        "init_at": init_at,
        "raw": entry,
    }


def _normalize_listing(payload: Any, *, init_time: str, init_at: str,
                       base_url: str) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise TmdHpcError(TMD_HPC_INVALID_LISTING, "listing payload is not a JSON object")
    files = payload.get("files")
    if not isinstance(files, list) or not files:
        raise TmdHpcError(TMD_HPC_INVALID_LISTING, "listing has no files")

    status = payload.get("status")
    if status is not None and str(status).strip().lower() not in ("success", "ok"):
        raise TmdHpcError(TMD_HPC_INVALID_LISTING, f"listing status is {status!r}")

    reported_init = payload.get("initial_time")
    if reported_init is not None and str(reported_init).strip() != init_time:
        raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                          f"listing reports init {reported_init}, requested {init_time}")

    count = payload.get("count")
    if isinstance(count, int) and not isinstance(count, bool) and count != len(files):
        raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                          f"listing count {count} != {len(files)} files")

    normalized: List[Dict[str, Any]] = []
    seen: set[tuple[Any, Any, Any]] = set()
    for entry in files:
        item = _normalize_file(entry, base_url=base_url, init_time=init_time,
                               init_at=init_at)
        key = (item["domain"], item["variable"], item["format"])
        if item["domain"] is not None and item["variable"] is not None:
            if key in seen:
                raise TmdHpcError(TMD_HPC_INVALID_LISTING,
                                  f"duplicate listing entry for {key}")
            seen.add(key)
        normalized.append(item)

    return {
        "source_id": SOURCE_ID,
        "init_time": init_time,
        "init_at": init_at,
        "base_url": base_url,
        "count": len(normalized),
        "status": "ok",
        "files": normalized,
    }


def _http_fetch(url: str, *, method: str = "GET",
                headers: Optional[Mapping[str, str]] = None,
                timeout: float = DEFAULT_TIMEOUT) -> Any:
    merged = {"User-Agent": USER_AGENT}
    if headers:
        merged.update(headers)
    request = Request(url, method=method, headers=merged)
    return urlopen(request, timeout=timeout, context=trusted_ssl_context())


def _response_status(response: Any) -> int:
    try:
        return int(getattr(response, "status", 200))
    except (TypeError, ValueError):
        return 200


def _header(response: Any, name: str) -> Optional[str]:
    headers = getattr(response, "headers", None)
    if headers is None:
        return None
    value = None
    try:
        value = headers.get(name)
    except (AttributeError, TypeError):
        value = None
    if value is None:
        try:
            value = headers.get(name.lower())
        except (AttributeError, TypeError):
            value = None
    return str(value) if value is not None else None


def _content_length(response: Any) -> Optional[int]:
    value = _header(response, "Content-Length")
    if value is None:
        return None
    try:
        length = int(value.strip())
    except ValueError:
        return None
    return length if length >= 0 else None


def _close(response: Any) -> None:
    closer = getattr(response, "close", None)
    if callable(closer):
        try:
            closer()
        except Exception:  # pragma: no cover - closing must never mask errors
            pass


def _network_error(prefix: str, exc: BaseException) -> TmdHpcError:
    return TmdHpcError(TMD_HPC_HTTP_ERROR, f"{prefix}: {exc}", retryable=True)


def list_download_files(init_time: str, *, fetcher: Optional[_FETCHER] = None) -> Dict[str, Any]:
    """Fetch and normalize the run's file listing (metadata only)."""
    init_time, init_dt = _parse_init_time(init_time)
    base_url = get_tmd_hpc_base_url()
    if urlparse(base_url).scheme.lower() != "https":
        raise TmdHpcError(TMD_HPC_LISTING_FAILED,
                          f"TMD_HPC_BASE_URL must use HTTPS, got {base_url!r}")
    url = f"{base_url}/api/download-files?init_time={init_time}"
    fetch = fetcher or _http_fetch
    try:
        response = fetch(url, method="GET",
                         headers={"Accept": "application/json", "User-Agent": USER_AGENT},
                         timeout=DEFAULT_TIMEOUT)
    except HTTPError as exc:
        code = exc.code
        _close(exc)
        raise TmdHpcError(TMD_HPC_LISTING_FAILED, f"listing returned HTTP {code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise TmdHpcError(TMD_HPC_LISTING_FAILED, f"listing network failure: {exc}") from exc

    try:
        status = _response_status(response)
        if status != 200:
            raise TmdHpcError(TMD_HPC_LISTING_FAILED, f"listing returned HTTP {status}")
        raw = response.read(MAX_LISTING_BYTES + 1)
        if len(raw) > MAX_LISTING_BYTES:
            raise TmdHpcError(TMD_HPC_LISTING_FAILED, "listing exceeded 4 MB")
    except (URLError, TimeoutError, OSError) as exc:
        raise TmdHpcError(TMD_HPC_LISTING_FAILED, f"listing read failed: {exc}") from exc
    finally:
        _close(response)

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise TmdHpcError(TMD_HPC_INVALID_LISTING, "listing is not valid UTF-8 JSON") from exc

    return _normalize_listing(payload, init_time=init_time,
                              init_at=iso_utc(init_dt), base_url=base_url)


def _format_rank(entry: Mapping[str, Any]) -> int:
    return {"CSV": 0, "NETCDF": 1}.get(str(entry.get("format")), 2)


def _index_by_variable(listing: Mapping[str, Any], domain: str) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for entry in listing["files"]:
        if entry["domain"] != domain or entry["variable"] is None:
            continue
        current = index.get(entry["variable"])
        if current is None or _format_rank(entry) < _format_rank(current):
            index[entry["variable"]] = entry
    return index


def _total_from_content_range(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    match = _CONTENT_RANGE_RE.match(value.strip())
    if not match or match.group(1) == "*":
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _probe_missing(variable: str, message: str = "variable not listed for this run") -> Dict[str, Any]:
    return {
        "variable": variable,
        "filename": None,
        "url": None,
        "status": "missing",
        "http_status": None,
        "bytes": None,
        "content_type": None,
        "probe_mode": None,
        "error": {"code": TMD_HPC_FILE_NOT_FOUND, "message": message},
    }


def _probe_error(variable: str, entry: Mapping[str, Any], code: str, message: str,
                 *, http_status: Optional[int] = None,
                 probe_mode: Optional[str] = None) -> Dict[str, Any]:
    return {
        "variable": variable,
        "filename": entry.get("filename"),
        "url": entry.get("url"),
        "status": "error",
        "http_status": http_status,
        "bytes": None,
        "content_type": None,
        "probe_mode": probe_mode,
        "error": {"code": code, "message": message},
    }


def _probe_head(variable: str, entry: Mapping[str, Any], fetch: _FETCHER) -> Optional[Dict[str, Any]]:
    """HEAD probe; returns a result dict or ``None`` to fall back to Range GET."""
    try:
        response = fetch(entry["url"], method="HEAD",
                         headers={"Accept": "*/*", "User-Agent": USER_AGENT},
                         timeout=DEFAULT_TIMEOUT)
    except HTTPError as exc:
        code = exc.code
        _close(exc)
        if code == 404:
            return _probe_missing(variable, "file does not exist on source")
        if code in (403, 405, 501):
            return None
        return _probe_error(variable, entry, TMD_HPC_HTTP_ERROR,
                            f"HEAD returned HTTP {code}", http_status=code,
                            probe_mode="head")
    except (URLError, TimeoutError, OSError) as exc:
        return _probe_error(variable, entry, TMD_HPC_HTTP_ERROR,
                            f"HEAD network failure: {exc}", probe_mode="head")

    try:
        status = _response_status(response)
        content_type = _header(response, "Content-Type")
        length = _content_length(response)
    finally:
        _close(response)

    if status == 404:
        return _probe_missing(variable, "file does not exist on source")
    if status in (403, 405, 501):
        return None
    if status != 200 or length is None or length <= 0:
        return None
    lowered = (content_type or "").lower()
    if "html" in lowered or "json" in lowered:
        return _probe_error(variable, entry, TMD_HPC_BAD_CONTENT,
                            f"unexpected content-type {content_type!r}",
                            http_status=status, probe_mode="head")
    return {
        "variable": variable,
        "filename": entry["filename"],
        "url": entry["url"],
        "status": "ok",
        "http_status": status,
        "bytes": length,
        "content_type": content_type,
        "probe_mode": "head",
    }


def _probe_range(variable: str, entry: Mapping[str, Any], fetch: _FETCHER,
                 max_probe_bytes: int) -> Dict[str, Any]:
    headers = {
        "Accept": "*/*",
        "Range": f"bytes=0-{max_probe_bytes - 1}",
        "User-Agent": USER_AGENT,
    }
    try:
        response = fetch(entry["url"], method="GET", headers=headers,
                         timeout=DEFAULT_TIMEOUT)
    except HTTPError as exc:
        code = exc.code
        _close(exc)
        if code == 404:
            return _probe_missing(variable, "file does not exist on source")
        return _probe_error(variable, entry, TMD_HPC_HTTP_ERROR,
                            f"range GET returned HTTP {code}",
                            http_status=code, probe_mode="range_get")
    except (URLError, TimeoutError, OSError) as exc:
        return _probe_error(variable, entry, TMD_HPC_HTTP_ERROR,
                            f"range GET network failure: {exc}",
                            probe_mode="range_get")

    try:
        status = _response_status(response)
        content_type = _header(response, "Content-Type")
        total = (_total_from_content_range(_header(response, "Content-Range"))
                 or _content_length(response) or entry.get("bytes"))
        if status not in (200, 206):
            return _probe_error(variable, entry, TMD_HPC_HTTP_ERROR,
                                f"range GET returned HTTP {status}",
                                http_status=status, probe_mode="range_get")
        lowered = (content_type or "").lower()
        if "html" in lowered or "json" in lowered:
            return _probe_error(variable, entry, TMD_HPC_BAD_CONTENT,
                                f"unexpected content-type {content_type!r}",
                                http_status=status, probe_mode="range_get")
        body = response.read(max_probe_bytes)
    except (URLError, TimeoutError, OSError) as exc:
        return _probe_error(variable, entry, TMD_HPC_HTTP_ERROR,
                            f"range GET read failed: {exc}",
                            probe_mode="range_get")
    finally:
        _close(response)

    if not body:
        return _probe_error(variable, entry, TMD_HPC_BAD_CONTENT,
                            "empty probe body", http_status=status,
                            probe_mode="range_get")
    if body.lstrip()[:1] == b"<":
        return _probe_error(variable, entry, TMD_HPC_BAD_CONTENT,
                            "source served an HTML body instead of data",
                            http_status=status, probe_mode="range_get")

    return {
        "variable": variable,
        "filename": entry["filename"],
        "url": entry["url"],
        "status": "ok",
        "http_status": status,
        "bytes": int(total) if isinstance(total, int) else None,
        "content_type": content_type,
        "probe_mode": "range_get",
    }


def probe_files(init_time: str, *, variables: Sequence[str] = V1_VARIABLES,
                domain: str = DEFAULT_DOMAIN, fetcher: Optional[_FETCHER] = None,
                max_probe_bytes: int = 2048) -> Dict[str, Any]:
    """HEAD/Range-probe requested variables without downloading full files."""
    init_time, _ = _parse_init_time(init_time)
    domain = _validated_domain(domain)
    requested = _requested_variables(variables)
    if isinstance(max_probe_bytes, bool) or not isinstance(max_probe_bytes, int) \
            or not 1 <= max_probe_bytes <= MAX_PROBE_BYTES_LIMIT:
        raise ValueError(f"max_probe_bytes must be 1..{MAX_PROBE_BYTES_LIMIT}")

    fetch = fetcher or _http_fetch
    listing = list_download_files(init_time, fetcher=fetcher)
    index = _index_by_variable(listing, domain)

    results: Dict[str, Dict[str, Any]] = {}
    for variable in requested:
        entry = index.get(variable)
        if entry is None:
            results[variable] = _probe_missing(variable)
            continue
        probed = _probe_head(variable, entry, fetch)
        if probed is None:
            probed = _probe_range(variable, entry, fetch, max_probe_bytes)
        results[variable] = probed

    missing = [name for name, item in results.items() if item["status"] == "missing"]
    if len(missing) == len(requested):
        raise TmdHpcError(TMD_HPC_FILE_NOT_FOUND,
                          f"none of the requested variables are listed for {init_time} {domain}")
    if any(item["status"] == "error" for item in results.values()):
        overall = "error"
    elif missing:
        overall = "partial"
    else:
        overall = "ok"

    return {
        "source_id": SOURCE_ID,
        "run_id": f"tmd_hpc_{domain}_{init_time}",
        "init_time": init_time,
        "domain": domain,
        "base_url": listing["base_url"],
        "variables": list(requested),
        "files": results,
        "missing": missing,
        "status": overall,
    }


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(CHUNK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _write_json_atomic(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp",
                                    dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _download_attempt(entry: Mapping[str, Any], target: Path, fetch: _FETCHER,
                      max_bytes: int) -> tuple[int, str]:
    headers = {
        "Accept": "text/csv, application/octet-stream",
        "User-Agent": USER_AGENT,
    }
    try:
        response = fetch(entry["url"], method="GET", headers=headers,
                         timeout=DEFAULT_TIMEOUT)
    except HTTPError as exc:
        code = exc.code
        _close(exc)
        raise TmdHpcError(TMD_HPC_HTTP_ERROR, f"download returned HTTP {code}",
                          retryable=code >= 500 or code in (408, 429)) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise _network_error("download network failure", exc) from exc

    completed = False
    tmp_name: Optional[str] = None
    try:
        status = _response_status(response)
        if status != 200:
            raise TmdHpcError(TMD_HPC_HTTP_ERROR,
                              f"download returned HTTP {status}",
                              retryable=status >= 500)
        content_type = _header(response, "Content-Type")
        lowered = (content_type or "").lower()
        if content_type and "csv" not in lowered and "octet-stream" not in lowered:
            raise TmdHpcError(TMD_HPC_BAD_CONTENT,
                              f"download content-type {content_type!r} is not CSV")
        expected = _content_length(response)
        if expected is not None and expected > max_bytes:
            raise TmdHpcError(TMD_HPC_FILE_TOO_LARGE,
                              f"file advertises {expected} bytes > limit {max_bytes}")

        target.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".part",
                                        dir=str(target.parent))
        digest = hashlib.sha256()
        total = 0
        first_chunk = True
        with os.fdopen(fd, "wb") as handle:
            while True:
                try:
                    chunk = response.read(CHUNK_SIZE)
                except HTTPException as exc:
                    raise TmdHpcError(TMD_HPC_HTTP_ERROR,
                                      f"download read failed: {exc}",
                                      retryable=True) from exc
                if not chunk:
                    break
                if first_chunk:
                    first_chunk = False
                    if chunk.lstrip()[:1] == b"<":
                        raise TmdHpcError(TMD_HPC_BAD_CONTENT,
                                          "source served an HTML body instead of data")
                total += len(chunk)
                if total > max_bytes:
                    raise TmdHpcError(TMD_HPC_FILE_TOO_LARGE,
                                      f"file exceeded limit {max_bytes} bytes")
                digest.update(chunk)
                handle.write(chunk)
        if total == 0:
            raise TmdHpcError(TMD_HPC_BAD_CONTENT, "download produced an empty file")
        if expected is not None and total != expected:
            raise TmdHpcError(TMD_HPC_HTTP_ERROR,
                              f"download truncated: {total} of {expected} bytes",
                              retryable=True)
        os.replace(tmp_name, target)
        completed = True
        return total, digest.hexdigest()
    finally:
        _close(response)
        if not completed and tmp_name is not None:
            try:
                os.unlink(tmp_name)
            except OSError:
                pass


def _download_file(entry: Mapping[str, Any], target: Path, *, fetch: _FETCHER,
                   max_bytes: int) -> tuple[int, str]:
    last_error: Optional[TmdHpcError] = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return _download_attempt(entry, target, fetch, max_bytes)
        except TmdHpcError as exc:
            if not exc.retryable or attempt >= MAX_RETRIES:
                raise
            last_error = exc
            _sleep(RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)])
    if last_error is not None:  # pragma: no cover - defensive
        raise last_error
    raise TmdHpcError(TMD_HPC_HTTP_ERROR, "download failed")  # pragma: no cover


def _prior_entries(manifest_path: Path) -> Dict[str, Dict[str, Any]]:
    if not manifest_path.is_file():
        return {}
    try:
        manifest = load_manifest(manifest_path)
    except TmdHpcError:
        return {}
    entries: Dict[str, Dict[str, Any]] = {}
    for item in manifest.get("files", []):
        if isinstance(item, dict) and isinstance(item.get("filename"), str):
            entries[item["filename"]] = item
    return entries


def _cached_entry(prior: Mapping[str, Any], target: Path) -> bool:
    if not target.is_file():
        return False
    expected_bytes = prior.get("bytes")
    expected_sha = prior.get("sha256")
    if not isinstance(expected_bytes, int) or isinstance(expected_bytes, bool):
        return False
    if not isinstance(expected_sha, str) or not expected_sha:
        return False
    if target.stat().st_size != expected_bytes:
        return False
    return _sha256_file(target) == expected_sha.lower()


def _overall_status(files: Sequence[Mapping[str, Any]]) -> str:
    statuses = [item.get("status") for item in files]
    if statuses and all(status in ("ok", "cached") for status in statuses):
        return "ready"
    if any(status in ("ok", "cached") for status in statuses):
        return "partial"
    return "failed"


def download_run(init_time: str, *, variables: Sequence[str] = V1_VARIABLES,
                 domain: str = DEFAULT_DOMAIN,
                 output_dir: Optional[Path] = None,
                 max_bytes: int = DEFAULT_MAX_BYTES,
                 fetcher: Optional[_FETCHER] = None,
                 refresh: bool = False) -> Dict[str, Any]:
    """Download the requested variables of one run and write a manifest.

    Per-file failures are recorded in the manifest with their error code; the
    run is never marked ``ready`` unless every requested file is ``ok`` or
    ``cached``. Listing failures and missing requested variables raise
    :class:`TmdHpcError`.
    """
    init_time, init_dt = _parse_init_time(init_time)
    domain = _validated_domain(domain)
    requested = _requested_variables(variables)
    if isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or max_bytes <= 0:
        raise ValueError("max_bytes must be a positive integer")
    publication_mode = get_tmd_hpc_publication_mode()
    if not isinstance(refresh, bool):
        raise ValueError("refresh must be a boolean")

    output = Path(output_dir) if output_dir is not None else DEFAULT_OUTPUT_DIR
    run_id = f"tmd_hpc_{domain}_{init_time}"
    if not _RUN_ID_RE.fullmatch(run_id):  # pragma: no cover - guarded by parsers
        raise ValueError(f"computed run_id is invalid: {run_id}")

    fetch = fetcher or _http_fetch
    listing = list_download_files(init_time, fetcher=fetcher)
    index = _index_by_variable(listing, domain)
    if not any(name in index for name in requested):
        raise TmdHpcError(TMD_HPC_FILE_NOT_FOUND,
                          f"none of {requested} are listed for {init_time} {domain}")

    manifest_path = output / "manifests" / f"{run_id}.json"
    raw_dir = output / "raw" / run_id
    prior = {} if refresh else _prior_entries(manifest_path)

    files: List[Dict[str, Any]] = []
    for variable in requested:
        entry = index.get(variable)
        if entry is None:
            files.append({
                "variable": variable,
                "filename": None,
                "url": None,
                "bytes": None,
                "sha256": None,
                "format": None,
                "status": "missing",
                "error": {"code": TMD_HPC_FILE_NOT_FOUND,
                          "message": "variable not listed for this run"},
            })
            continue

        target = raw_dir / entry["filename"]
        previous = prior.get(entry["filename"])
        if previous is not None and _cached_entry(previous, target):
            files.append({
                "variable": variable,
                "filename": entry["filename"],
                "url": entry["url"],
                "bytes": previous["bytes"],
                "sha256": previous["sha256"],
                "format": entry["format"],
                "status": "cached",
            })
            continue

        try:
            size, sha256 = _download_file(entry, target, fetch=fetch, max_bytes=max_bytes)
        except TmdHpcError as exc:
            files.append({
                "variable": variable,
                "filename": entry["filename"],
                "url": entry["url"],
                "bytes": None,
                "sha256": None,
                "format": entry["format"],
                "status": "failed",
                "error": {"code": exc.code, "message": exc.message},
            })
            continue

        files.append({
            "variable": variable,
            "filename": entry["filename"],
            "url": entry["url"],
            "bytes": size,
            "sha256": sha256,
            "format": entry["format"],
            "status": "ok",
        })

    manifest: Dict[str, Any] = {
        "source_id": SOURCE_ID,
        "source_agency": SOURCE_AGENCY,
        "contract_version": CONTRACT_VERSION,
        "run_id": run_id,
        "domain": domain,
        "domain_label": DOMAIN_LABELS[domain],
        "init_at": iso_utc(init_dt),
        "retrieved_at": iso_utc(datetime.now(timezone.utc)),
        "base_url": listing["base_url"],
        "license_status": "pending",
        "unit_status": "pending_official_confirmation",
        "publication_mode": publication_mode,
        "variables": list(requested),
        "lead_hours": list(LEAD_HOURS),
        "grid": {key: (list(value) if isinstance(value, list) else value)
                 for key, value in GRID.items()},
        "files": files,
        "status": _overall_status(files),
    }
    _write_json_atomic(manifest_path, manifest)
    return manifest


_MANIFEST_REQUIRED = (
    "source_id", "source_agency", "contract_version", "run_id", "domain",
    "domain_label", "init_at", "retrieved_at", "base_url", "license_status",
    "unit_status", "publication_mode", "variables", "lead_hours", "grid",
    "files", "status",
)


def _validate_manifest(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID, "manifest is not a JSON object")
    missing = [key for key in _MANIFEST_REQUIRED if key not in payload]
    if missing:
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID,
                          f"manifest is missing keys: {', '.join(missing)}")
    if payload.get("source_id") != SOURCE_ID:
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID,
                          f"unexpected source_id {payload.get('source_id')!r}")
    run_id = payload.get("run_id")
    if not isinstance(run_id, str) or not _RUN_ID_RE.fullmatch(run_id):
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID, f"invalid run_id {run_id!r}")
    if payload.get("domain") not in DOMAINS:
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID,
                          f"invalid manifest domain {payload.get('domain')!r}")
    if payload.get("status") not in ("ready", "partial", "failed"):
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID,
                          f"invalid manifest status {payload.get('status')!r}")
    if not isinstance(payload.get("files"), list):
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID, "manifest files must be a list")
    for item in payload["files"]:
        if not isinstance(item, dict):
            raise TmdHpcError(TMD_HPC_MANIFEST_INVALID, "manifest file entry is malformed")
        filename = item.get("filename")
        if isinstance(filename, str) and filename:
            continue
        if filename is None and item.get("status") in ("missing", "failed"):
            continue
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID,
                          "manifest file entry has no usable filename")


def load_manifest(path: Path) -> Dict[str, Any]:
    """Read and structurally validate a run manifest."""
    target = Path(path)
    try:
        raw = target.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID,
                          f"cannot read manifest {target}: {exc}") from exc
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise TmdHpcError(TMD_HPC_MANIFEST_INVALID,
                          f"manifest {target} is not valid JSON") from exc
    _validate_manifest(payload)
    return payload


def verify_manifest(manifest: Mapping[str, Any], raw_dir: Path) -> Dict[str, Any]:
    """Check every recorded file exists with the recorded size and SHA-256."""
    _validate_manifest(dict(manifest))
    root = Path(raw_dir)
    checked = 0
    files: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    for item in manifest["files"]:
        filename = item.get("filename")
        if item.get("status") not in ("ok", "cached") or not filename:
            continue
        checked += 1
        target = root / filename
        record: Dict[str, Any] = {"filename": filename, "status": "ok"}
        if not target.is_file():
            record["status"] = "missing"
            errors.append({"filename": filename, "code": "missing_file",
                           "message": "recorded file is absent"})
        else:
            actual_size = target.stat().st_size
            expected_bytes = item.get("bytes")
            if isinstance(expected_bytes, int) and not isinstance(expected_bytes, bool) \
                    and actual_size != expected_bytes:
                record["status"] = "size_mismatch"
                record["bytes"] = actual_size
                record["expected_bytes"] = expected_bytes
                errors.append({"filename": filename, "code": "size_mismatch",
                               "message": f"{actual_size} != {expected_bytes} bytes"})
            else:
                expected_sha = item.get("sha256")
                if isinstance(expected_sha, str) and expected_sha:
                    actual_sha = _sha256_file(target)
                    if actual_sha != expected_sha.lower():
                        record["status"] = "checksum_mismatch"
                        record["sha256"] = actual_sha
                        errors.append({"filename": filename,
                                       "code": TMD_HPC_CHECKSUM_MISMATCH,
                                       "message": "sha256 differs from manifest"})
        files.append(record)
    return {
        "run_id": manifest.get("run_id"),
        "checked": checked,
        "ok": not errors,
        "files": files,
        "errors": errors,
    }
