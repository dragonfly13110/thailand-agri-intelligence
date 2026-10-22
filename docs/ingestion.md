# Ingestion probes

`tadih.ingestion` uses Python standard library. Public endpoints only, no keys. Every JSON envelope retains request URL, source, retrieval time and unmodified provider payload. Missing measurements remain `null`.

## APIs

- `discover_ckan(base_url, limit=5, *, start=0, fetcher=fetch_json)`: accepts `https://ckan.doae.go.th` or `https://catalog.oae.go.th`. Reads one metadata page, `limit` 1–100, stable ID sorting. Metadata success does not establish resource access, licensing or provincial measurement coverage.
- `discover_ckan_pages(base_url, *, page_size=100, max_pages=10, start=0, fetcher=fetch_json, sleep=time.sleep)`: paginates metadata within explicit page budget (maximum 100 pages), pauses between requests. Retains each request URL, advertised total, next offset and `complete` flag. An incomplete budgeted run must not be described as a complete catalog. Save the next offset as a new partition checkpoint. Catalogs can change during pagination, so completion is a scan status, not a versioned provider snapshot guarantee.
- `fetch_weather(latitude, longitude, start_date, end_date, forecast=False, *, fetcher=fetch_json)`: daily precipitation (mm), maximum temperature (°C), ET0 (mm), Bangkok timezone; window at most 367 days. Archive explicitly selects ERA5 reanalysis. Forecast uses provider best-match. Approved sample coordinates currently `(13.8, 100.25)` and `(13.7563, 100.5018)` only. A bounding box cannot establish Thailand membership. Add arbitrary coordinates only after licensed boundary validation.
- `fetch_oae_rice_prices(*, max_pages=5, start_page=1, fetcher=fetch_json, sleep=time.sleep)`: reads one verified national monthly jasmine paddy farmgate series through the public NABC endpoint linked by OAE. Each page is at most 100 rows, at most 100 requests per call; original pages and pagination remain in the envelope. An incomplete scan remains explicitly incomplete.
- `normalize_oae_rice_prices(envelope)`: emits warehouse observation fields, with national `location_id="TH"`, no province code, farmgate type, exact provider product identity and grade. Buddhist year converts to Gregorian by subtracting 543; THB/tonne converts to THB/kg by dividing by 1,000. `observed_at` represents the **first day of the monthly period**, never a daily measurement or release date. `season="month-MM"` is a calendar marker, not crop season. `release_at` remains null and `license_status` pending. Missing blank/dash/null becomes `None`; content-hash revision IDs preserve source changes. Original year, value and unit remain in the raw snapshot.
- `prices.py` now shares the monthly row normalizer across the historical rice and all-product adapters. Observation IDs depend on source/product/unit/month/area, never value; changing a price creates a revision of the same observation. Canonical product URLs keep two API access paths from conflicting over identical revisions. The original local warehouse was backed up before migrating legacy value-dependent rice IDs; evidence is `data/local/verification/price-identity-migration-2026-10-22.json`. Immutable old raw/export snapshots remain unchanged.
- `price_backfill.backfill_monthly_prices(inventory_snapshot, output_dir, refresh=False, max_pages=10)`: captures bounded national histories for every distinct exact product name in the verified input inventory. Per-product checkpoint hashes, pagination totals, field/unit checks and quality counts are revalidated before resume. The 44-product year-2569 inventory does not establish every historical provider product. `refresh=True` fetches revised histories while retaining prior raw snapshots.
- `prices.normalize_nabc_monthly(envelope)`: supports year partitions and product-history captures. Exact duplicate records are deduplicated. All raw versions of a conflicting source/month stay in quarantine; unrelated months remain usable. A derived unknown/null quality revision blocks an earlier value until reviewed resolution, without selecting an unordered source value. Release time stays unknown. Native count price units remain separate from THB/kg; animal/egg/fruit weights are never inferred.
- `save_snapshot(envelope, source_id, output_dir, partition_key="probe")`: canonical JSON SHA-256, immutable version files, atomic latest-success manifest per source/partition. Source and partition keys reject path traversal.
- `snapshot_complete(source_id, output_dir, partition_key="probe")`: checks checkpoint, artifact existence and canonical checksum. Caller skips only matching requested partitions and should choose new partition keys for planned revision refreshes. Earlier snapshots remain retained. One writer per partition is required.
- `fetch_json(url, *, opener=None, sleep=time.sleep, attempts=3, timeout=20)`: default urllib uses the verified SSL context; an injected opener enables isolated tests. TLS verification enabled, at most 5 attempts, bounded response size. Retries 429 and transient server/network failures, exponential delay; numeric Retry-After capped at 30 seconds. No retries for authorization failures.
- `trusted_ssl_context()`: standard secure defaults on other platforms; Windows server-authentication trust anchors from the OS ROOT store. Explicit `SSL_CERT_FILE` / `SSL_CERT_DIR` settings retain Python's configured default behavior. Certificate chain, expiration and hostname verification stay enabled.
- `backfill_weather(latitude, longitude, start_year, end_year, output_dir, *, refresh=False, fetcher=fetch_json, sleep=time.sleep)`: at most 20 completed years, one approved Thai point, yearly ERA5 partitions. Checksums, point, year and model are verified before a completed partition is skipped. Return records include absolute snapshot `path`, `action` and `daily_rows`. If a partition fails, previous checkpoints survive; retry the same call to resume. `refresh=True` deliberately re-fetches completed partitions for revised provider history, retaining previous immutable versions. Single writer per partition.

## Time and space meaning

Weather samples represent selected model grid points, not station observations, province averages or province coverage. Requested coordinates and returned grid coordinates are both retained. The archive is `estimated`, current forecasts `forecast`, catalogs `metadata`.

Provider model run/publication time is unavailable in this basic endpoint response. `issue_at` and `release_at` stay null. `retrieved_at` cannot replace either field. These raw forecast envelopes are not eligible for a certified forecast fact table requiring known issue time, or historical as-of backtests. Later revised reanalysis likewise needs separate historical-availability evidence.

## Live probe evidence, 22 October 2026

Local evidence is in ignored `data/local/probes/`, summarized by `probe_results.json`:

| Source | Result | Meaning |
|---|---|---|
| DOAE CKAN | HTTPS Python probe succeeded, 1 package | Catalog metadata only |
| OAE CKAN | HTTPS Python probe succeeded, 1 package | Catalog metadata only |
| Open-Meteo ERA5 | 3 daily rows, 1–3 January 2020 at 13.8,100.25 | Point sample only; requested latitude 13.8, returned grid latitude 13.75 |

Initial Python urllib Open-Meteo access encountered `CERTIFICATE_VERIFY_FAILED: certificate has expired`; Windows `Invoke-RestMethod` succeeded with normal certificate verification. Investigation found 19 expired certificates in Python's default Windows CA/ROOT-loaded trust pool. Loading server-authentication anchors from the Windows ROOT store alone resolved the Python request. An obsolete cached intermediate/cross-sign affecting OpenSSL chain selection is the likely cause; the individual failing chain certificate was not identified. `trusted_ssl_context()` uses `ssl.create_default_context(cadata=...)`, preserving secure verification flags and hostname checks. It neither accepts expired certificates nor disables TLS verification. See official [Python SSL context and Windows store documentation](https://docs.python.org/3/library/ssl.html#ssl.SSLContext.load_default_certs).

After that fix, the default standard-library transport fetched **10 annual partitions, 2016–2025**, at point `(13.8,100.25)`: **3,653 days**, **10,959 metric values**, stored under ignored `data/local/raw/open_meteo/era5-13.8-100.25-{year}/`. Evidence: `data/local/probes/weather_backfill_2016_2025.json`; a second call with a fetcher that raises if invoked verified every checkpoint and made **zero network calls**, summarized in `weather_backfill_resume_check.json`. This remains one grid point, not nationwide weather coverage. Production scheduled execution has not been run.

Reproduce locally with Python import path set to `src`:

```python
from tadih.ingestion import backfill_weather
records = backfill_weather(13.8, 100.25, 2016, 2025, "data/local/raw")
```

## Production and price resource inspection

Exact URLs and raw evidence are retained in ignored `data/local/probes/resource_probe_results.json`, CKAN resource-review snapshots, `doae_production_2023_first8192.bin`, and `oae/rice-price-first-page/`.

- DOAE `production_doae`, resource `f9ab6055-6364-4f78-812e-15989e300979`: first 8,192 bytes of UTF-8 BOM CSV inspected, 35 complete rows. Fields include Buddhist year, month, province/district/subdistrict **names**, crop group/type/variety, planting round; planted/damaged/harvested area in **rai**, production in **kg**, yield in **kg/rai**, farmgate price in **THB/kg**. Missing tokens include blank and ` -   ` and must never become zero. Administrative names require validated mapping before linkage. Dataset licence label is `Open Data Common`, with exact variant unresolved: local inspection only, publication blocked pending review. Some additional resources are labelled CSV while their URLs end in `.rar`; do not trust catalog format alone.
- OAE `monthly_prices_rice`, resource `4570daca-e727-4036-bde9-35fd84d0ffd4`: linked `agriapi.nabc.go.th` monthly-price endpoint returned success without credentials, first page 100 of 189 monthly records. Fields include `year_th`, `month`, `product_name`, `unit`, string-valued `value`, and `province_code="TH00"`. These are **national** records with unit **THB/tonne**, not provincial values or THB/kg. Preserve grain; a conversion to THB/kg requires division by 1,000 with original unit lineage. The metadata states Creative Commons Attribution NonCommercial without exact version, so public redistribution remains subject to licence review. One successful endpoint does not establish access to all NABC APIs.

The initial bounded OAE scan completed **189 distinct monthly observations from January 2011 to September 2026**, 2 pages, no missing values in this particular sample. The current raw checkpoint is under `data/local/raw/oae/national-rice-monthly/`; `data/local/probes/oae_rice_normalized.json` is an older pre-migration inspection artifact, not the current ID mapping. This history is suitable for descriptive inspection. Historical as-of forecast certification remains blocked because actual release dates are unknown. The subsequent 44-product backfill and quarantine evidence are documented in [commodities.md](commodities.md).

## Provider documentation and terms

Checked official [forecast documentation](https://open-meteo.com/en/docs), [historical documentation](https://open-meteo.com/en/docs/historical-weather-api), and [terms](https://open-meteo.com/en/terms) on 22 October 2026. Free API service is restricted to non-commercial use. Data requires CC BY 4.0 attribution; operational users must recheck applicable plan, quotas and underlying attribution. Licensed commercial access is not implemented by these public probes. CKAN dataset licences require review per resource before any measurement export.

The probe deliberately omits bulk CKAN resource downloads, credentials, province aggregation, nationwide backfill and auto-publication. Those require data contracts, licence approval and quota/storage planning first.
