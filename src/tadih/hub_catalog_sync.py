"""Bounded CKAN metadata harvest for the Hub's central catalog."""

from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
from html import unescape
import json
import os
import re
import time
from typing import Any, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, HTTPSHandler
import uuid

from .catalog import load_resource_licenses, load_sources
from .ingestion import trusted_ssl_context

MAX_PAGE_SIZE = 100
MAX_PAGES = 20  # At the default 50 rows/page, a run reads at most 1,000 packages per source.
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 12
DEFAULT_SOURCE_IDS = (
    "doae", "oae", "ldd", "dld", "dof",
    "nabc", "cad", "alro", "acfs", "royalrain", "hii", "opsmoac",
)
ALLOWED_SOURCE_IDS = frozenset(DEFAULT_SOURCE_IDS)
ADAPTER_VERSION = "hub-ckan-metadata-v1"


class CatalogSyncError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _safe_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    value = value[:max(1000, limit * 4)]
    value = re.sub(r"<[^>]*>", " ", value)
    value = unescape(value)
    value = "".join(ch for ch in value if ch in "\t\n\r" or ord(ch) >= 32)
    return " ".join(value.split())[:limit]


def _optional_text(value: Any, limit: int = 500) -> str | None:
    text = _safe_text(value, limit)
    return text or None


def _safe_url(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 2048:
        return None
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return None
    if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
        return None
    return value.strip()


def _source_config(source_id: str, sources: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if source_id not in ALLOWED_SOURCE_IDS:
        raise CatalogSyncError("SOURCE_NOT_ALLOWLISTED", "This CKAN catalog is not allowlisted for sync")
    rows = sources if sources is not None else load_sources()
    source = next((row for row in rows if row.get("source_id") == source_id), None)
    if not source or source.get("type") != "ckan" or source.get("deferred") is True:
        raise CatalogSyncError("SOURCE_CONFIG_INVALID", "CKAN source is missing or disabled in config/sources.json")
    url = source.get("base_url") or source.get("url")
    parsed = urlsplit(url if isinstance(url, str) else "")
    registered = urlsplit(source.get("url") if isinstance(source.get("url"), str) else "")
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.port is not None or parsed.path not in ("", "/") or parsed.query or parsed.fragment
            or parsed.hostname != registered.hostname or registered.scheme != "https"
            or registered.port is not None):
        raise CatalogSyncError("SOURCE_HOST_NOT_ALLOWLISTED", "CKAN host must match the HTTPS source registry entry")
    source["_catalog_base_url"] = f"https://{parsed.hostname}"
    freshness_days = source.get("freshness_days")
    if (freshness_days is not None and
            (isinstance(freshness_days, bool) or not isinstance(freshness_days, int) or freshness_days <= 0)):
        raise CatalogSyncError("SOURCE_CONFIG_INVALID", "freshness_days must be a positive integer or null")
    return source


def _fetch_page(source: dict[str, Any], start: int, page_size: int, timeout: float) -> tuple[dict[str, Any], str]:
    query = urlencode({"rows": page_size, "start": start, "sort": "id asc"})
    url = f"{source['_catalog_base_url']}/api/3/action/package_search?{query}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Thailand-Agricultural-Data-Hub/0.1 metadata-catalog-sync",
        },
    )
    opener = build_opener(_NoRedirect(), HTTPSHandler(context=trusted_ssl_context()))
    try:
        with opener.open(request, timeout=timeout) as response:
            declared = response.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > MAX_RESPONSE_BYTES:
                raise CatalogSyncError("RESPONSE_TOO_LARGE", "CKAN metadata page exceeded the response limit")
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            exc.close()
            raise CatalogSyncError("REDIRECT_REJECTED", "CKAN redirected outside the configured request") from exc
        code = f"HTTP_{exc.code}" if exc.code in (401, 403) else "HTTP_ERROR"
        exc.close()
        raise CatalogSyncError(code, f"CKAN returned HTTP {exc.code}") from exc
    except (TimeoutError, URLError) as exc:
        raise CatalogSyncError("UPSTREAM_UNAVAILABLE", "CKAN request timed out or could not connect") from exc
    if len(body) > MAX_RESPONSE_BYTES:
        raise CatalogSyncError("RESPONSE_TOO_LARGE", "CKAN metadata page exceeded the response limit")
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CatalogSyncError("INVALID_JSON", "CKAN did not return valid JSON") from exc
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise CatalogSyncError("CKAN_ACTION_FAILED", "CKAN package_search did not succeed")
    return payload, hashlib.sha256(body).hexdigest()


def _iso_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or len(value) > 80:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _stable_id(source_id: str, *parts: str) -> str:
    components = (source_id, *parts)
    if all(re.fullmatch(r"[A-Za-z0-9._~-]{1,180}", part) for part in components):
        return ":".join(components)
    raw = "\0".join(components).encode("utf-8", "replace")
    return f"{source_id}:sha256:{hashlib.sha256(raw).hexdigest()}"


def _license_map() -> dict[tuple[str, str], dict[str, Any]]:
    result = {}
    for item in load_resource_licenses():
        source_id = item.get("source_id")
        resource_id = item.get("resource_id")
        if source_id in ALLOWED_SOURCE_IDS and isinstance(resource_id, str):
            result[(source_id, resource_id)] = item
    return result


def _clean_resource(source_id: str, dataset_id: str, raw: Any,
                    license_rows: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    source_resource_id = _optional_text(raw.get("id"), 200)
    name = _safe_text(raw.get("name"), 240)
    if not source_resource_id or not name:
        return None
    license_row = license_rows.get((source_id, source_resource_id))
    license_status = license_row.get("license_status") if license_row else "pending"
    if not license_row or not license_row.get("project_publication_approved"):
        license_status = "pending"
    if license_status not in {"approved_public", "metadata_only", "pending", "restricted", "internal"}:
        license_status = "pending"
    registered_declaration = license_row.get("declared_license") if license_row else {}
    if not isinstance(registered_declaration, dict):
        registered_declaration = {}
    declared_license = (
        _optional_text(raw.get("license_title"), 160)
        or _optional_text(raw.get("license_id_other"), 160)
        or _optional_text(raw.get("license_id"), 120)
        or _optional_text(registered_declaration.get("license_title"), 160)
        or _optional_text(registered_declaration.get("license_id_other"), 160)
        or _optional_text(registered_declaration.get("license_id"), 120)
    )
    license_url = _safe_url(raw.get("license_url")) or _safe_url(registered_declaration.get("license_url"))
    publication_approved = bool(
        license_row and license_row.get("project_publication_approved") is True
    )
    metadata = {
        "licenseId": _optional_text(raw.get("license_id"), 120),
        "licenseIdOther": _optional_text(raw.get("license_id_other"), 200),
        "commercialUseConfirmed": bool(license_row and license_row.get("commercial_use_confirmed") is True),
        "size": raw.get("size") if isinstance(raw.get("size"), int) and not isinstance(raw.get("size"), bool) and raw.get("size") >= 0 else None,
        "hash": _optional_text(raw.get("hash"), 160),
    }
    return {
        "resource_id": _stable_id(source_id, dataset_id, source_resource_id),
        "source_resource_id": source_resource_id,
        "name": name,
        "format": _optional_text(raw.get("format"), 80),
        "resource_url": _safe_url(raw.get("url")),
        "declared_license": declared_license,
        "license_url": license_url,
        "project_publication_approved": publication_approved,
        "access_status": license_status,
        "grain": None,
        "source_updated_at": _iso_timestamp(raw.get("last_modified") or raw.get("created")),
        "metadata": metadata,
    }


def _clean_dataset(source: dict[str, Any], raw: Any,
                   license_rows: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or raw.get("private") is True or raw.get("state") not in (None, "active"):
        return None
    source_id = source["source_id"]
    source_dataset_id = _optional_text(raw.get("name"), 180) or _optional_text(raw.get("id"), 180)
    title = _safe_text(raw.get("title"), 300) or source_dataset_id or ""
    if not source_dataset_id or not title:
        return None
    # Exclude the exact DOAE test placeholders recorded in docs/doae-acquisition-audit.md.
    if source_id == "doae" and (
            source_dataset_id.lower().startswith("uitest-")
            or source_dataset_id.lower() in {"testdataset", "emptydataset"}):
        return None
    organization = raw.get("organization") if isinstance(raw.get("organization"), dict) else {}
    resources_raw = raw.get("resources") if isinstance(raw.get("resources"), list) else []
    resources = []
    invalid_resources = 0
    for item in resources_raw[:500]:
        cleaned = _clean_resource(source_id, source_dataset_id, item, license_rows)
        if cleaned is None:
            invalid_resources += 1
        else:
            resources.append(cleaned)
    invalid_resources += max(0, len(resources_raw) - 500)
    tags_raw = raw.get("tags") if isinstance(raw.get("tags"), list) else []
    tags = [
        _safe_text(item.get("name"), 80)
        for item in tags_raw[:50]
        if isinstance(item, dict) and _safe_text(item.get("name"), 80)
    ]
    groups_raw = raw.get("groups") if isinstance(raw.get("groups"), list) else []
    groups = [
        _safe_text(item.get("title") or item.get("name"), 100)
        for item in groups_raw[:25]
        if isinstance(item, dict) and _safe_text(item.get("title") or item.get("name"), 100)
    ]
    source_url = f"{source['_catalog_base_url']}/dataset/{quote(source_dataset_id, safe='')}"
    metadata = {
        "tags": tags,
        "groups": groups,
        "licenseId": _optional_text(raw.get("license_id"), 120),
        "licenseTitle": _optional_text(raw.get("license_title"), 160),
        "licenseUrl": _safe_url(raw.get("license_url")),
        "isOpen": raw.get("isopen") if isinstance(raw.get("isopen"), bool) else None,
        "sourceState": _optional_text(raw.get("state"), 40),
        "resourceCount": len(resources),
        "category": _optional_text(source.get("category"), 80),
    }
    return {
        "dataset_id": _stable_id(source_id, source_dataset_id),
        "source_id": source_id,
        "source_dataset_id": source_dataset_id,
        "title": title,
        "description": _safe_text(raw.get("notes"), 1800),
        "category": _optional_text(source.get("category"), 80),
        "owner": _safe_text(organization.get("title"), 200) or _safe_text(source.get("owner"), 200),
        "source_url": source_url,
        "modified_at": _iso_timestamp(raw.get("metadata_modified")),
        "metadata_access_status": "metadata_only",
        "metadata": metadata,
        "resources": resources,
        "_invalid_resource_count": invalid_resources,
    }


def harvest_ckan_metadata(source_id: str, *, page_size: int = 50, max_pages: int = MAX_PAGES,
                          timeout: float = DEFAULT_TIMEOUT_SECONDS,
                          page_delay: float = 0.25) -> dict[str, Any]:
    """Fetch and sanitize public CKAN metadata only; never dereference resource URLs."""
    if isinstance(page_size, bool) or not isinstance(page_size, int) or not 1 <= page_size <= MAX_PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {MAX_PAGE_SIZE}")
    if isinstance(max_pages, bool) or not isinstance(max_pages, int) or not 1 <= max_pages <= MAX_PAGES:
        raise ValueError(f"max_pages must be between 1 and {MAX_PAGES}")
    if isinstance(timeout, bool) or not 1 <= timeout <= 30:
        raise ValueError("timeout must be between 1 and 30 seconds")
    if not 0 <= page_delay <= 5:
        raise ValueError("page_delay must be between 0 and 5 seconds")
    source = _source_config(source_id)
    license_rows = _license_map()
    datasets: dict[str, dict[str, Any]] = {}
    page_hashes: list[str] = []
    total_count: int | None = None
    records_read = 0
    rejected = 0
    duplicate_count = 0
    complete = False
    incomplete_reason = None
    start = 0
    pages = 0
    for page_index in range(max_pages):
        payload, page_hash = _fetch_page(source, start, page_size, timeout)
        result = payload.get("result")
        if not isinstance(result, dict) or not isinstance(result.get("results"), list):
            raise CatalogSyncError("CKAN_SCHEMA_CHANGED", "CKAN package_search result is missing results")
        count = result.get("count")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise CatalogSyncError("CKAN_SCHEMA_CHANGED", "CKAN package_search count is invalid")
        if total_count is None:
            total_count = count
        elif count != total_count:
            incomplete_reason = "SOURCE_COUNT_CHANGED"
            break
        rows = result["results"]
        if len(rows) > page_size:
            raise CatalogSyncError("CKAN_SCHEMA_CHANGED", "CKAN returned more rows than requested")
        pages += 1
        page_hashes.append(page_hash)
        records_read += len(rows)
        for raw in rows:
            if not isinstance(raw, dict):
                rejected += 1
                continue
            dataset = _clean_dataset(source, raw, license_rows)
            if dataset is None:
                rejected += 1
                continue
            rejected += dataset.pop("_invalid_resource_count", 0)
            if dataset["dataset_id"] in datasets:
                duplicate_count += 1
            datasets[dataset["dataset_id"]] = dataset
        start += len(rows)
        if start >= total_count:
            complete = True
            break
        if not rows:
            incomplete_reason = "EMPTY_PAGE_BEFORE_TOTAL"
            break
        if page_index + 1 < max_pages and page_delay:
            time.sleep(page_delay)
    if not complete and incomplete_reason is None:
        incomplete_reason = "PAGE_LIMIT_REACHED"
    digest = hashlib.sha256("".join(page_hashes).encode("ascii")).hexdigest() if page_hashes else None
    return {
        "source": {
            "source_id": source_id,
            "source_name": _safe_text(source.get("name"), 200),
            "base_url": source["_catalog_base_url"],
            "connector_kind": "ckan",
            "status": "enabled",
            "metadata_access_status": "metadata_only",
            "freshness_days": source.get("freshness_days"),
        },
        "datasets": list(datasets.values()),
        "page_count": pages,
        "source_total_count": total_count,
        "records_read": records_read,
        "records_written": len(datasets) + sum(len(item["resources"]) for item in datasets.values()),
        "records_quarantined": rejected,
        "duplicates_removed": duplicate_count,
        "complete": complete,
        "incomplete_reason": incomplete_reason,
        "payload_sha256": digest,
        "retrieved_at": datetime.now(timezone.utc),
        "adapter_version": ADAPTER_VERSION,
    }


def _upsert_source(cursor, source: dict[str, Any]) -> None:
    cursor.execute(
        """INSERT INTO hub.sources
           (source_id, source_name, base_url, connector_kind, status, metadata_access_status, freshness_days)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (source_id) DO UPDATE SET
             source_name = EXCLUDED.source_name,
             base_url = EXCLUDED.base_url,
             connector_kind = EXCLUDED.connector_kind,
             status = EXCLUDED.status,
             metadata_access_status = EXCLUDED.metadata_access_status,
             freshness_days = EXCLUDED.freshness_days,
             updated_at = now()""",
        (source["source_id"], source["source_name"], source["base_url"],
         source["connector_kind"], source["status"], source["metadata_access_status"],
         source["freshness_days"]),
    )


def _upsert_dataset(cursor, dataset: dict[str, Any], harvested_at: datetime) -> None:
    cursor.execute(
        """INSERT INTO hub.datasets
           (dataset_id, source_id, source_dataset_id, title, description, category, owner,
            source_url, modified_at, metadata_access_status, metadata, harvested_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
           ON CONFLICT (dataset_id) DO UPDATE SET
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             owner = EXCLUDED.owner,
             source_url = EXCLUDED.source_url,
             modified_at = EXCLUDED.modified_at,
             metadata_access_status = EXCLUDED.metadata_access_status,
             metadata = EXCLUDED.metadata,
             harvested_at = EXCLUDED.harvested_at""",
        (dataset["dataset_id"], dataset["source_id"], dataset["source_dataset_id"],
         dataset["title"], dataset["description"], dataset["category"], dataset["owner"],
         dataset["source_url"], dataset["modified_at"], dataset["metadata_access_status"],
         json.dumps(dataset["metadata"], ensure_ascii=False), harvested_at),
    )
    for resource in dataset["resources"]:
        cursor.execute(
            """INSERT INTO hub.resources
               (resource_id, dataset_id, source_resource_id, name, format, resource_url,
                declared_license, license_url, project_publication_approved,
                access_status, grain, source_updated_at, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
               ON CONFLICT (resource_id) DO UPDATE SET
                 name = EXCLUDED.name,
                 format = EXCLUDED.format,
                 resource_url = EXCLUDED.resource_url,
                 declared_license = EXCLUDED.declared_license,
                 license_url = EXCLUDED.license_url,
                 project_publication_approved = EXCLUDED.project_publication_approved,
                 access_status = EXCLUDED.access_status,
                 grain = EXCLUDED.grain,
                 source_updated_at = EXCLUDED.source_updated_at,
                 metadata = EXCLUDED.metadata""",
            (resource["resource_id"], dataset["dataset_id"], resource["source_resource_id"],
             resource["name"], resource["format"], resource["resource_url"],
             resource["declared_license"], resource["license_url"],
             resource["project_publication_approved"], resource["access_status"],
             resource["grain"], resource["source_updated_at"],
             json.dumps(resource["metadata"], ensure_ascii=False)),
        )


def sync_catalog_source(connection: Any, source_id: str, *, page_size: int = 50,
                        max_pages: int = MAX_PAGES, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> dict[str, Any]:
    """Harvest one owner catalog and atomically upsert sanitized metadata."""
    run_id = None
    started_at = datetime.now(timezone.utc)
    try:
        source = _source_config(source_id)
        with connection.cursor() as cursor:
            _upsert_source(cursor, {
                "source_id": source_id,
                "source_name": _safe_text(source.get("name"), 200),
                "base_url": source["_catalog_base_url"],
                "connector_kind": "ckan",
                "status": "enabled",
                "metadata_access_status": "metadata_only",
                "freshness_days": source.get("freshness_days"),
            })
            cursor.execute(
                """INSERT INTO hub.sync_runs (source_id, kind, status, started_at, adapter_version)
                   VALUES (%s, 'metadata', 'running', %s, %s)
                   RETURNING run_id""",
                (source_id, started_at, ADAPTER_VERSION),
            )
            run_id = cursor.fetchone()[0]
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    try:
        harvested = harvest_ckan_metadata(
            source_id, page_size=page_size, max_pages=max_pages, timeout=timeout,
        )
        now = harvested["retrieved_at"]
        with connection.cursor() as cursor:
            for dataset in harvested["datasets"]:
                _upsert_dataset(cursor, dataset, now)
            status = "succeeded" if harvested["complete"] else "partial"
            cursor.execute(
                """UPDATE hub.sync_runs SET
                     status = %s, completed_at = %s, source_retrieved_at = %s,
                     records_read = %s, records_written = %s, records_quarantined = %s,
                     payload_sha256 = %s, error_code = %s
                   WHERE run_id = %s""",
                (status, now, now, harvested["records_read"], harvested["records_written"],
                 harvested["records_quarantined"], harvested["payload_sha256"],
                 harvested["incomplete_reason"], run_id),
            )
        connection.commit()
        return {
            "source_id": source_id,
            "run_id": str(run_id),
            "status": status,
            "datasets_upserted": len(harvested["datasets"]),
            "records_read": harvested["records_read"],
            "records_written": harvested["records_written"],
            "records_quarantined": harvested["records_quarantined"],
            "duplicates_removed": harvested["duplicates_removed"],
            "pages": harvested["page_count"],
            "source_total_count": harvested["source_total_count"],
            "complete": harvested["complete"],
            "incomplete_reason": harvested["incomplete_reason"],
        }
    except CatalogSyncError as exc:
        connection.rollback()
        with connection.cursor() as cursor:
            cursor.execute(
                """UPDATE hub.sync_runs SET status = 'failed', completed_at = %s,
                     error_code = %s WHERE run_id = %s""",
                (datetime.now(timezone.utc), exc.code, run_id),
            )
            cursor.execute(
                "UPDATE hub.sources SET status = %s, updated_at = now() WHERE source_id = %s",
                ("needs_access" if exc.code in {"HTTP_401", "HTTP_403"} else "unavailable", source_id),
            )
        connection.commit()
        raise
    except Exception as exc:
        connection.rollback()
        with connection.cursor() as cursor:
            cursor.execute(
                """UPDATE hub.sync_runs SET status = 'failed', completed_at = %s,
                     error_code = 'SYNC_FAILED' WHERE run_id = %s""",
                (datetime.now(timezone.utc), run_id),
            )
        connection.commit()
        raise CatalogSyncError("SYNC_FAILED", "Catalog sync failed; see run status for the error code") from exc


def connect_database(dsn: str) -> Any:
    try:
        import psycopg
    except ImportError as exc:
        raise CatalogSyncError(
            "PSYCOPG_NOT_INSTALLED",
            "Install the optional psycopg[binary] dependency before database sync",
        ) from exc
    return psycopg.connect(dsn, sslmode="require")


# -----------------------------------------------------------------------------
# Cloudflare D1 sink (REST API). Schema: db/cloudflare/0001_hub.sql.
# Every statement is an idempotent upsert or a run bookkeeping row, so a
# retried statement or a rerun of the whole sync can never duplicate catalog
# rows and a failed run never deletes data written by earlier successful runs.
# -----------------------------------------------------------------------------

D1_API_BASE = "https://api.cloudflare.com/client/v4"
D1_ENV_ACCOUNT_ID = "CF_ACCOUNT_ID"
D1_ENV_TOKEN = "CF_D1_TOKEN"
D1_ENV_DATABASE_ID = "CF_D1_DATABASE_ID"
DEFAULT_CF_ACCOUNT_ID = "e00f22a8994eaa5a08e0ec523f64a14d"
DEFAULT_CF_DATABASE_ID = "c95fd817-4a46-4303-b008-382f7e82c4dc"
MAX_D1_SQL_VARIABLES = 100
DEFAULT_D1_BATCH_SIZE = 7
D1_MAX_ATTEMPTS = 4
D1_BACKOFF_SECONDS = 1.0
D1_MAX_BACKOFF_SECONDS = 8.0
D1_STATEMENT_TIMEOUT = 30.0
D1_RESPONSE_BYTES = 2 * 1024 * 1024


def _load_wrangler_token() -> str | None:
    """Read OAuth token saved by `wrangler login` on the local machine."""
    candidates: list[str] = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        candidates.append(os.path.join(appdata, "xdg.config", ".wrangler", "config", "default.toml"))
    home = os.path.expanduser("~")
    candidates.append(os.path.join(home, ".config", ".wrangler", "config", "default.toml"))
    candidates.append(os.path.join(home, "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"))
    for path in candidates:
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as file:
                    content = file.read()
                match = re.search(r'oauth_token\s*=\s*["\']([^"\']+)["\']', content)
                if match:
                    return match.group(1).strip()
            except Exception:
                pass
    return None

# All statements use `?` positional parameters as accepted by D1's REST query API.

_UPSERT_SOURCE_D1_SQL = """\
INSERT INTO sources
  (source_id, source_name, base_url, connector_kind, status,
   metadata_access_status, freshness_days, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (source_id) DO UPDATE SET
  source_name = excluded.source_name,
  base_url = excluded.base_url,
  connector_kind = excluded.connector_kind,
  status = excluded.status,
  metadata_access_status = excluded.metadata_access_status,
  freshness_days = excluded.freshness_days,
  updated_at = excluded.updated_at"""

# Datasets are keyed on the catalog pair (source_id, source_dataset_id);
# dataset_id is derived deterministically from that pair and is not rewritten.
_UPSERT_DATASET_D1_SQL = """\
INSERT INTO datasets
  (dataset_id, source_id, source_dataset_id, title, description, category, owner,
   source_url, modified_at, metadata_access_status, metadata, harvested_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (source_id, source_dataset_id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  owner = excluded.owner,
  source_url = excluded.source_url,
  modified_at = excluded.modified_at,
  metadata_access_status = excluded.metadata_access_status,
  metadata = excluded.metadata,
  harvested_at = excluded.harvested_at"""

# Resources are keyed on resource_id; dataset_id and source_resource_id are
# stable identifiers and are left untouched on conflict.
_UPSERT_RESOURCE_D1_SQL = """\
INSERT INTO resources
  (resource_id, dataset_id, source_resource_id, name, format, resource_url,
   access_status, declared_license, license_url, project_publication_approved,
   grain, source_updated_at, metadata)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (resource_id) DO UPDATE SET
  dataset_id = excluded.dataset_id,
  name = excluded.name,
  format = excluded.format,
  resource_url = excluded.resource_url,
  access_status = excluded.access_status,
  declared_license = excluded.declared_license,
  license_url = excluded.license_url,
  project_publication_approved = excluded.project_publication_approved,
  grain = excluded.grain,
  source_updated_at = excluded.source_updated_at,
  metadata = excluded.metadata"""

# A metadata sync run owns no resource rows, so active_run_id stays NULL and
# the composite (resource_id, active_run_id) foreign key is satisfied by NULL.
_INSERT_RUN_D1_SQL = """\
INSERT INTO sync_runs
  (run_id, source_id, kind, status, started_at, adapter_version)
VALUES (?, ?, 'metadata', 'running', ?, ?)
ON CONFLICT (run_id) DO UPDATE SET started_at = excluded.started_at"""

_FINISH_RUN_D1_SQL = """\
UPDATE sync_runs SET
  status = ?, completed_at = ?, source_retrieved_at = ?,
  records_read = ?, records_written = ?, records_quarantined = ?,
  payload_sha256 = ?, error_code = ?
WHERE run_id = ?"""

_FAIL_RUN_D1_SQL = """\
UPDATE sync_runs SET status = 'failed', completed_at = ?, error_code = ?
WHERE run_id = ?"""

_SET_SOURCE_STATUS_D1_SQL = """\
UPDATE sources SET status = ?, updated_at = ? WHERE source_id = ?"""


def _d1_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _d1_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class D1Client:
    """Minimal Cloudflare D1 REST client with bounded retry on transient errors."""

    def __init__(self, account_id: str, token: str, database_id: str, *,
                 max_attempts: int = D1_MAX_ATTEMPTS,
                 backoff_seconds: float = D1_BACKOFF_SECONDS,
                 timeout: float = D1_STATEMENT_TIMEOUT,
                 post: Any = None):
        for name, value in (("account_id", account_id), ("token", token), ("database_id", database_id)):
            if not isinstance(value, str) or not value.strip():
                raise CatalogSyncError("D1_CONFIG_MISSING", f"D1 {name} is missing")
        if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or not 1 <= max_attempts <= 10:
            raise ValueError("max_attempts must be between 1 and 10")
        if backoff_seconds < 0 or backoff_seconds > 30:
            raise ValueError("backoff_seconds must be between 0 and 30")
        self._url = (
            f"{D1_API_BASE}/accounts/{quote(account_id.strip(), safe='')}"
            f"/d1/database/{quote(database_id.strip(), safe='')}/query"
        )
        self._token = token.strip()
        self._max_attempts = max_attempts
        self._backoff_seconds = backoff_seconds
        self._timeout = timeout
        self._post = post if post is not None else self._http_post

    def _http_post(self, url: str, headers: dict[str, str], body: bytes,
                   timeout: float) -> tuple[int, bytes]:
        request = Request(url, data=body, headers=headers, method="POST")
        opener = build_opener(HTTPSHandler(context=trusted_ssl_context()))
        try:
            with opener.open(request, timeout=timeout) as response:
                return response.status, response.read(D1_RESPONSE_BYTES + 1)
        except HTTPError as exc:
            status = exc.code
            try:
                body = exc.read(D1_RESPONSE_BYTES + 1)
            finally:
                exc.close()
            return status, body
        except (TimeoutError, URLError) as exc:
            raise CatalogSyncError("D1_UNAVAILABLE", "D1 request timed out or could not connect") from exc

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> dict[str, Any]:
        """Run one parameterized statement; retry only transient failures."""
        if not isinstance(sql, str) or not sql.strip():
            raise ValueError("sql must be a non-empty string")
        body = json.dumps({
            "sql": sql,
            "params": [self._param(value) for value in (params or [])],
        }, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Thailand-Agricultural-Data-Hub/0.1 d1-catalog-sync",
        }
        for attempt in range(1, self._max_attempts + 1):
            status, raw = self._post(self._url, headers, body, self._timeout)
            if status in (401, 403):
                raise CatalogSyncError("D1_UNAUTHORIZED", "D1 rejected the API token")
            if status == 429 or 500 <= status < 600:
                if attempt < self._max_attempts:
                    self._sleep(attempt)
                    continue
                code = "D1_RATE_LIMITED" if status == 429 else f"D1_HTTP_{status}"
                raise CatalogSyncError(code, f"D1 returned HTTP {status} after {self._max_attempts} attempts")
            if status != 200:
                err_text = raw.decode("utf-8", errors="replace")[:300]
                raise CatalogSyncError("D1_HTTP_ERROR", f"D1 returned HTTP {status}: {err_text}")
            try:
                payload = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise CatalogSyncError("D1_INVALID_RESPONSE", "D1 did not return valid JSON") from exc
            if not isinstance(payload, dict) or payload.get("success") is not True:
                errors = payload.get("errors") if isinstance(payload, dict) else None
                message = ""
                if isinstance(errors, list) and errors and isinstance(errors[0], dict):
                    message = str(errors[0].get("message") or "")[:300]
                raise CatalogSyncError("D1_QUERY_FAILED", message or "D1 rejected the statement")
            result = payload.get("result")
            if isinstance(result, list) and result and isinstance(result[0], dict):
                return result[0]
            return result if isinstance(result, dict) else {}

    @staticmethod
    def _param(value: Any) -> Any:
        if isinstance(value, bool):
            return 1 if value else 0
        if isinstance(value, datetime):
            return _d1_iso(value)
        if value is None or isinstance(value, (str, int, float)):
            return value
        return str(value)

    def _sleep(self, attempt: int) -> None:
        delay = min(self._backoff_seconds * (2 ** (attempt - 1)), D1_MAX_BACKOFF_SECONDS)
        if delay:
            time.sleep(delay)


def connect_d1_client(env: dict[str, str] | None = None, **kwargs: Any) -> D1Client:
    """Build a D1Client from CF_ACCOUNT_ID / CF_D1_TOKEN / CF_D1_DATABASE_ID.

    When env is None, defaults to the project's configured D1 database and
    auto-discovers the local Wrangler OAuth token if CF_D1_TOKEN is not in
    os.environ. When env is explicitly provided, only reads from that dictionary.
    """
    if env is not None:
        return D1Client(
            env.get(D1_ENV_ACCOUNT_ID, ""),
            env.get(D1_ENV_TOKEN, ""),
            env.get(D1_ENV_DATABASE_ID, ""),
            **kwargs,
        )
    account_id = os.environ.get(D1_ENV_ACCOUNT_ID) or DEFAULT_CF_ACCOUNT_ID
    database_id = os.environ.get(D1_ENV_DATABASE_ID) or DEFAULT_CF_DATABASE_ID
    token = os.environ.get(D1_ENV_TOKEN)
    if not token:
        token = _load_wrangler_token() or ""
    return D1Client(
        account_id,
        token,
        database_id,
        **kwargs,
    )


def d1_source_statement(source: dict[str, Any], now: datetime) -> tuple[str, list[Any]]:
    return _UPSERT_SOURCE_D1_SQL, [
        source["source_id"], source["source_name"], source["base_url"],
        source["connector_kind"], source["status"], source["metadata_access_status"],
        source["freshness_days"], _d1_iso(now),
    ]


def d1_dataset_statement(dataset: dict[str, Any], harvested_at: datetime) -> tuple[str, list[Any]]:
    return _UPSERT_DATASET_D1_SQL, [
        dataset["dataset_id"], dataset["source_id"], dataset["source_dataset_id"],
        dataset["title"], dataset["description"], dataset["category"], dataset["owner"],
        dataset["source_url"], _d1_iso(dataset["modified_at"]),
        dataset["metadata_access_status"], _d1_json(dataset["metadata"]), _d1_iso(harvested_at),
    ]


def d1_batch_dataset_statements(
    datasets: Sequence[dict[str, Any]],
    harvested_at: datetime,
    *,
    batch_size: int = DEFAULT_D1_BATCH_SIZE,
) -> list[tuple[str, list[Any]]]:
    """Build multi-row upsert statements for datasets up to batch_size (capped at D1 variable limit)."""
    if not datasets:
        return []
    effective_batch = max(1, min(batch_size, MAX_D1_SQL_VARIABLES // 12))
    if effective_batch <= 1:
        return [d1_dataset_statement(ds, harvested_at) for ds in datasets]
    statements: list[tuple[str, list[Any]]] = []
    for i in range(0, len(datasets), effective_batch):
        chunk = datasets[i : i + effective_batch]
        if len(chunk) == 1:
            statements.append(d1_dataset_statement(chunk[0], harvested_at))
            continue
        row_sql = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        sql = (
            "INSERT INTO datasets\n"
            "  (dataset_id, source_id, source_dataset_id, title, description, category, owner,\n"
            "   source_url, modified_at, metadata_access_status, metadata, harvested_at)\n"
            f"VALUES\n  {', '.join([row_sql] * len(chunk))}\n"
            "ON CONFLICT (source_id, source_dataset_id) DO UPDATE SET\n"
            "  title = excluded.title,\n"
            "  description = excluded.description,\n"
            "  category = excluded.category,\n"
            "  owner = excluded.owner,\n"
            "  source_url = excluded.source_url,\n"
            "  modified_at = excluded.modified_at,\n"
            "  metadata_access_status = excluded.metadata_access_status,\n"
            "  metadata = excluded.metadata,\n"
            "  harvested_at = excluded.harvested_at"
        )
        params: list[Any] = []
        for ds in chunk:
            _, p = d1_dataset_statement(ds, harvested_at)
            params.extend(p)
        statements.append((sql, params))
    return statements


def d1_resource_statement(dataset_id: str, resource: dict[str, Any]) -> tuple[str, list[Any]]:
    approved = 1 if resource["project_publication_approved"] else 0
    return _UPSERT_RESOURCE_D1_SQL, [
        resource["resource_id"], dataset_id, resource["source_resource_id"],
        resource["name"], resource["format"], resource["resource_url"],
        resource["access_status"], resource["declared_license"], resource["license_url"],
        approved, resource["grain"],
        _d1_iso(resource["source_updated_at"]), _d1_json(resource["metadata"]),
    ]


def d1_batch_resource_statements(
    items: Sequence[tuple[str, dict[str, Any]]],
    *,
    batch_size: int = DEFAULT_D1_BATCH_SIZE,
) -> list[tuple[str, list[Any]]]:
    """Build multi-row upsert statements for resources up to batch_size (capped at D1 variable limit)."""
    if not items:
        return []
    effective_batch = max(1, min(batch_size, MAX_D1_SQL_VARIABLES // 13))
    if effective_batch <= 1:
        return [d1_resource_statement(ds_id, res) for ds_id, res in items]
    statements: list[tuple[str, list[Any]]] = []
    for i in range(0, len(items), effective_batch):
        chunk = items[i : i + effective_batch]
        if len(chunk) == 1:
            statements.append(d1_resource_statement(chunk[0][0], chunk[0][1]))
            continue
        row_sql = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        sql = (
            "INSERT INTO resources\n"
            "  (resource_id, dataset_id, source_resource_id, name, format, resource_url,\n"
            "   access_status, declared_license, license_url, project_publication_approved,\n"
            "   grain, source_updated_at, metadata)\n"
            f"VALUES\n  {', '.join([row_sql] * len(chunk))}\n"
            "ON CONFLICT (resource_id) DO UPDATE SET\n"
            "  dataset_id = excluded.dataset_id,\n"
            "  name = excluded.name,\n"
            "  format = excluded.format,\n"
            "  resource_url = excluded.resource_url,\n"
            "  access_status = excluded.access_status,\n"
            "  declared_license = excluded.declared_license,\n"
            "  license_url = excluded.license_url,\n"
            "  project_publication_approved = excluded.project_publication_approved,\n"
            "  grain = excluded.grain,\n"
            "  source_updated_at = excluded.source_updated_at,\n"
            "  metadata = excluded.metadata"
        )
        params: list[Any] = []
        for ds_id, res in chunk:
            _, p = d1_resource_statement(ds_id, res)
            params.extend(p)
        statements.append((sql, params))
    return statements


def sync_catalog_source_d1(client: Any, source_id: str, *, page_size: int = 50,
                           max_pages: int = MAX_PAGES, timeout: float = DEFAULT_TIMEOUT_SECONDS,
                           harvest: Any = None, batch_size: int = DEFAULT_D1_BATCH_SIZE) -> dict[str, Any]:
    """Harvest one CKAN catalog and idempotently upsert it into Cloudflare D1.

    The harvest completes before any dataset/resource write, so an upstream
    failure leaves the previously synced catalog untouched. Writes are
    upserts keyed on the schema's unique keys, so retries and reruns cannot
    duplicate rows. A failed run only marks sync_runs; it deletes nothing.
    """
    harvest_fn = harvest if harvest is not None else harvest_ckan_metadata
    if isinstance(page_size, bool) or not isinstance(page_size, int) or not 1 <= page_size <= MAX_PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {MAX_PAGE_SIZE}")
    if isinstance(max_pages, bool) or not isinstance(max_pages, int) or not 1 <= max_pages <= MAX_PAGES:
        raise ValueError(f"max_pages must be between 1 and {MAX_PAGES}")
    if isinstance(timeout, bool) or not 1 <= timeout <= 30:
        raise ValueError("timeout must be between 1 and 30 seconds")
    if isinstance(batch_size, bool) or not isinstance(batch_size, int) or not 1 <= batch_size <= 100:
        raise ValueError("batch_size must be between 1 and 100")
    started_at = datetime.now(timezone.utc)
    run_id = str(uuid.uuid4())
    source = _source_config(source_id)
    source_row = {
        "source_id": source_id,
        "source_name": _safe_text(source.get("name"), 200),
        "base_url": source["_catalog_base_url"],
        "connector_kind": "ckan",
        "status": "enabled",
        "metadata_access_status": "metadata_only",
        "freshness_days": source.get("freshness_days"),
    }
    client.execute(*d1_source_statement(source_row, started_at))
    client.execute(_INSERT_RUN_D1_SQL, [run_id, source_id, _d1_iso(started_at), ADAPTER_VERSION])
    try:
        harvested = harvest_fn(source_id, page_size=page_size, max_pages=max_pages, timeout=timeout)
    except CatalogSyncError as exc:
        _d1_mark_run_failed(client, run_id, source_id, exc.code)
        raise
    except Exception as exc:
        _d1_mark_run_failed(client, run_id, source_id, "SYNC_FAILED")
        raise CatalogSyncError("SYNC_FAILED", "Catalog sync failed; see run status for the error code") from exc
    now = harvested["retrieved_at"]
    try:
        for sql, params in d1_batch_dataset_statements(harvested["datasets"], now, batch_size=batch_size):
            client.execute(sql, params)
        all_resources = [
            (dataset["dataset_id"], resource)
            for dataset in harvested["datasets"]
            for resource in dataset["resources"]
        ]
        for sql, params in d1_batch_resource_statements(all_resources, batch_size=batch_size):
            client.execute(sql, params)
    except CatalogSyncError as exc:
        _d1_mark_run_failed(client, run_id, source_id, exc.code)
        raise
    except Exception as exc:
        _d1_mark_run_failed(client, run_id, source_id, "SYNC_FAILED")
        raise CatalogSyncError("SYNC_FAILED", "D1 write failed; see run status for the error code") from exc
    status = "succeeded" if harvested["complete"] else "partial"
    completed_at = datetime.now(timezone.utc)
    client.execute(_FINISH_RUN_D1_SQL, [
        status, _d1_iso(completed_at), _d1_iso(now),
        harvested["records_read"], harvested["records_written"], harvested["records_quarantined"],
        harvested["payload_sha256"], harvested["incomplete_reason"], run_id,
    ])
    return {
        "source_id": source_id,
        "run_id": run_id,
        "status": status,
        "datasets_upserted": len(harvested["datasets"]),
        "resources_upserted": sum(len(item["resources"]) for item in harvested["datasets"]),
        "records_read": harvested["records_read"],
        "records_written": harvested["records_written"],
        "records_quarantined": harvested["records_quarantined"],
        "duplicates_removed": harvested["duplicates_removed"],
        "pages": harvested["page_count"],
        "source_total_count": harvested["source_total_count"],
        "complete": harvested["complete"],
        "incomplete_reason": harvested["incomplete_reason"],
    }


def _d1_mark_run_failed(client: Any, run_id: str, source_id: str, error_code: str) -> None:
    """Record a failed run and source status without touching catalog rows."""
    now = datetime.now(timezone.utc)
    try:
        client.execute(_FAIL_RUN_D1_SQL, [_d1_iso(now), error_code, run_id])
        client.execute(_SET_SOURCE_STATUS_D1_SQL, [
            "needs_access" if error_code in {"HTTP_401", "HTTP_403"} else "unavailable",
            _d1_iso(now), source_id,
        ])
    except CatalogSyncError:
        # The original failure already happened; bookkeeping must not mask it.
        pass
