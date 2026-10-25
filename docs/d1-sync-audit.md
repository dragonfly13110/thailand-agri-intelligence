# Cloudflare D1 Catalog Sync Audit Report

**Audited At:** 2026-10-24T23:33:52+07:00  
**Target Database:** Cloudflare D1 `tadih-hub` (`c95fd817-4a46-4303-b008-382f7e82c4dc`, APAC/HKG)  
**Verification Script:** [scripts/verify_d1_catalog_full.py](file:///d:/code/thailand-agri-intelligence/scripts/verify_d1_catalog_full.py)  
**Adapter:** [src/tadih/hub_catalog_sync.py](file:///d:/code/thailand-agri-intelligence/src/tadih/hub_catalog_sync.py)  

---

## 1. Executive Summary

A complete catalog synchronization of all 12 Thai agricultural data portals into Cloudflare D1 (`tadih-hub`) was executed and audited. All integrity and data-governance guardrails established in [AGENTS.md](file:///d:/code/thailand-agri-intelligence/AGENTS.md) and [SYSTEM_DESIGN.md](file:///d:/code/thailand-agri-intelligence/SYSTEM_DESIGN.md) passed without exception:

1. **Zero Observation Leakage:** The `observations` table contains exactly **0** rows. Catalog metadata discovery is strictly decoupled from numeric observation publication.
2. **Strict Access Governance:** All **3,777** resources are flagged with `access_status = "pending"` and `project_publication_approved = 0`. No unverified resource was marked `approved_public`.
3. **No Orphan or Corrupt Entities:** 0 orphan resources, 0 orphan datasets, 0 duplicate source dataset IDs, and 0 duplicate resource IDs.
4. **Complete Coverage Across 12 Catalogs:** All 12 MoAC agencies and state enterprises are represented with completed, succeeded sync runs.

---

## 2. Catalog Metrics & Sync Tallies

| Source ID | Agency / Catalog Name | Datasets | Resources | Read | Written | Quarantined | Duration (s) | Latest Status |
|:---|:---|---:|---:|---:|---:|---:|---:|:---:|
| `acfs` | สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ (ACFS) | 26 | 34 | 26 | 60 | 0 | 0.97s | `succeeded` |
| `alro` | สำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม (ALRO) | 50 | 90 | 50 | 140 | 0 | 1.75s | `succeeded` |
| `cad` | กรมตรวจบัญชีสหกรณ์ (CAD) | 49 | 74 | 49 | 123 | 0 | 1.58s | `succeeded` |
| `dld` | กรมปศุสัตว์ (DLD) | 36 | 78 | 36 | 114 | 0 | 3.22s | `succeeded` |
| `doae` | กรมส่งเสริมการเกษตร (DOAE) | 39 | 90 | 201 | 129 | 162 | 3.44s | `succeeded` |
| `dof` | กรมประมง (DOF) | 72 | 207 | 72 | 279 | 0 | 3.59s | `succeeded` |
| `hii` | สถาบันสารสนเทศทรัพยากรน้ำ (HII) | 36 | 76 | 36 | 112 | 0 | 1.36s | `succeeded` |
| `ldd` | กรมพัฒนาที่ดิน (LDD) | 30 | 106 | 30 | 136 | 0 | 3.06s | `succeeded` |
| `nabc` | ศูนย์ข้อมูลเกษตรแห่งชาติ (NABC) | 591 | 1,954 | 591 | 2,545 | 0 | 19.20s | `succeeded` |
| `oae` | สำนักงานเศรษฐกิจการเกษตร (OAE) | 202 | 528 | 202 | 730 | 0 | 3.36s | `succeeded` |
| `opsmoac` | สำนักงานปลัดกระทรวงเกษตรและสหกรณ์ (OPS MoAC) | 78 | 464 | 78 | 542 | 0 | 4.34s | `succeeded` |
| `royalrain` | กรมฝนหลวงและการบินเกษตร (Royal Rain) | 28 | 76 | 28 | 104 | 0 | 1.72s | `succeeded` |
| **Total** | **12 Open Data Portals** | **1,237** | **3,777** | **1,399** | **5,014** | **162** | **~47.6s** | **12 / 12 OK** |

> **Duration column is not wall-clock time.** It is `sync_runs.started_at → completed_at`, which currently measures only the harvest phase and excludes the D1 write phase. The real end-to-end wall time of the full 12-source run was **290.2 s** (`{"status": "succeeded", "elapsed_seconds": 290.234}` from the sync command's stdout). NABC is the clearest case: 19.20 s recorded versus 139.5 s actually elapsed. See Finding 6.1 in section 6.

---

## 3. NABC: Full 591 Coverage (the 300-row cap was ours, not the upstream's)

The 300-of-591 limitation recorded in earlier documents is **not** an upstream CKAN limit. It came from the web fallback in `web/lib/hub/source-fallback.ts` (`maxRowsPerSource = 300`). The Python sync paginates `package_search` with `start`, so it reads the entire catalog.

| Evidence | Result |
|:---|:---|
| `GET https://nabc-catalog1.oae.go.th/api/3/action/package_search?rows=0` | `count = 591` |
| Python sync (12 pages) | 591 datasets, 1,954 resources, 2,545 written, `complete = true`, `incomplete_reason = null` |
| Web CKAN fallback (pre-D1 path) | capped at 300 rows per source |
| `records_quarantined` for NABC | 0 |

**Implication for the web lane:** once the site reads from D1, the 300-row cap no longer applies and NABC will expose all 591 entries. The catalog page must be verified for pagination and response time at 1,237 total datasets, and any copy describing NABC as "300 of 591" must be updated.

---

## 4. Database Integrity & Guardrail Verification

| Check | Expected | Actual | Result | Notes |
|:---|:---:|:---:|:---:|:---|
| `all_expected_sources_present` | 12 sources | 12 sources | **PASS** | ACFS, ALRO, CAD, DLD, DOAE, DOF, HII, LDD, NABC, OAE, OPSMOAC, ROYALRAIN |
| `no_source_falls_back` | 0 missing | 0 missing | **PASS** | Every agency catalog has active synced datasets |
| `sync_runs_not_left_running` | 0 running | 0 running | **PASS** | All sync jobs reached terminal state |
| `every_run_has_completion` | 0 null | 0 null | **PASS** | Timestamps recorded for auditability |
| `no_orphan_resources` | 0 | 0 | **PASS** | Every resource references an existing `dataset_id` |
| `no_orphan_datasets` | 0 | 0 | **PASS** | Every dataset references an existing `source_id` |
| `no_duplicate_identifiers` | 0 | 0 | **PASS** | Primary keys and composite uniqueness verified |
| `no_numeric_observations_published`| 0 rows | 0 rows | **PASS** | Guardrail: metadata discovery never writes to `observations` |
| `no_resource_publication_approved` | 0 | 0 | **PASS** | Guardrail: bulk discovery does not approve reuse rights |
| `no_resource_approved_public` | 0 | 0 | **PASS** | All 3,777 resources kept in `pending` review |
| `no_source_failed_in_latest_run` | 0 failed | 0 failed | **PASS** | 12/12 agencies succeeded in current cycle |

---

## 5. Technical Insights & Fixes Applied

1. **D1 SQL Variable Ceiling Workaround:**  
   Cloudflare D1 enforces SQLite's default limit of `SQLITE_MAX_VARIABLE_NUMBER = 100` per prepared statement. Syncing large catalogs previously failed with `HTTP 400: too many SQL variables`.  
   *Resolution:* Implemented chunked multi-row inserts capped at 8 datasets ($8 \times 12 = 96$ parameters) and 7 resources ($7 \times 13 = 91$ parameters), achieving batch efficiency without exceeding the 100-variable ceiling.
2. **DOAE Quarantined Records Handling:**  
   DOAE metadata contains 162 **known test/empty placeholder packages** in the upstream catalog: `uitest-*` 160 + `testdataset` 1 + `emptydataset` 1 — exactly the set recorded in [doae-acquisition-audit.md](doae-acquisition-audit.md). The pipeline excludes them by policy (name prefix `uitest-` or exact `testdataset`/`emptydataset`), so the pipeline correctly quarantined them (`records_quarantined = 162`) while safely ingesting the 39 valid datasets and 90 resources without crashing. The arithmetic reconciles exactly: $201\text{ read} - 162\text{ quarantined} = 39\text{ datasets}$, and $39 + 90 = 129 = \texttt{records\_written}$. These are **not** malformed or identifier-less records.
3. **Automated Token Discovery:**  
   Both Python and Next.js tools automatically read local Cloudflare credentials from `%APPDATA%\xdg.config\.wrangler\config\default.toml`, eliminating hardcoded secrets in the codebase.
4. **Idempotency Verified Live:**  
   Re-running `python scripts/sync_hub_catalog.py --sink d1 --batch-size 7 --source acfs` after the full cycle reproduced identical counts (26 datasets, 34 resources, 60 written, 0 quarantined, `complete = true`) and **added no rows** — D1 stayed at 1,237 datasets / 3,777 resources, with only one additional `sync_runs` row. This confirms the upsert keys hold and the daily cron will not bloat the catalog.

---

## 6. Open Findings for the Integrator

These two items live in `src/tadih/hub_catalog_sync.py`, outside the file ownership of the auditing lane, so they are reported rather than patched.

### 6.1 `sync_runs.completed_at` records the harvest time, not the sync completion time

`sync_catalog_source_d1` sets `now = harvested["retrieved_at"]` and then passes that same value as both `completed_at` and `source_retrieved_at` to `_FINISH_RUN_D1_SQL`, which is executed **after** the rows are written. Because `now` was frozen at harvest time, the recorded interval excludes the entire D1 write phase.

| Measurement (NABC, 2,545 records) | Value |
|:---|---:|
| `sync_runs.started_at → completed_at` | 19.20 s |
| Actual client wall time (harvest + writes) | 139.5 s |

The recorded value understates the real duration by roughly 86% for the largest catalog. Anyone monitoring "is the sync slow or stuck?" from `sync_runs` will see a number that excludes the slow part, and `completed_at` can even precede the moment the data was actually written. **Suggested fix:** give `completed_at` the real end-of-write timestamp and keep `source_retrieved_at` as the harvest time — the two carry different meanings and should be separated.

### 6.2 67 resources lost their `resource_url` because upstream uses plain `http://`

`_safe_url()` in the module accepts `https://` only and returns `None` otherwise, so 67 resources (1.8% of 3,777) were stored with `resource_url = NULL` and cannot be linked back to their owner from the catalog.

| Source | Resources without URL | Upstream URL pattern |
|:---|---:|:---|
| nabc | 47 | `http://...` |
| hii | 12 | `http://www.thaiwater.net/...`, `http://tiservice.hii.or.th/...` |
| dof | 5 | `http://dataset.fisheries.go.th/...` |
| ldd | 1 | `http://...` |
| opsmoac | 1 | `http://...` |
| royalrain | 1 | `http://...` |
| **Total** | **67** | confirmed against upstream `package_show` responses |

The strict rule is safe and should stay, but the cost is a lost owner link. **Suggested fix:** keep the original URL in `resources.metadata` with an explicit `http://` flag so the catalog can show "source link is not HTTPS" instead of dropping the link entirely — still without dereferencing those URLs.

### 6.3 Evidence for the D1 variable ceiling

Verified directly against the live database: a read-only `SELECT` with 100 bound parameters succeeds, while 101 and 104 parameters return `HTTP 400` with `code 7500, "too many SQL variables at offset 307: SQLITE_ERROR"`. This is the confirmed root cause of the three historical `D1_HTTP_ERROR` runs in `sync_runs` (22:56–22:57 ICT), which predate the internal batch clamp now present in the module. The `partial` runs in the same window carry `error_code = PAGE_LIMIT_REACHED` and are the intended effect of testing with `--max-pages 1` and `--max-pages 2`, not upstream failures.

---

## 7. Not Verified in This Audit

- The web catalog page reading from D1 was **not** re-checked here: the local dev server was not running during the audit (`http://127.0.0.1:3124/api/v1/datasets` was unreachable). This belongs to the web lane.
- Query performance of the catalog page at 1,237 datasets was not measured.
- Cloudflare D1 rate-limit behaviour under a tighter cadence than this 290-second run was not tested. The full cycle issues roughly 750 D1 statements.
- The GitHub Actions workflow `.github/workflows/sync-hub-catalog.yml` was not executed (no CI run performed).
- Publication rights for individual resources were not assessed: `config/resource_licenses.json` remains `pending` for all entries, and no numeric data was published.

---

## 8. Commands to Re-run

```powershell
# Full sync, all 12 catalogs (~5 minutes)
python scripts/sync_hub_catalog.py --sink d1 --batch-size 7

# Single catalog
python scripts/sync_hub_catalog.py --sink d1 --batch-size 7 --source nabc

# Verify D1 state (table + 12 integrity checks; exit code 1 if any check fails)
python scripts/verify_d1_catalog_full.py

# Full machine-readable report
python scripts/verify_d1_catalog_full.py --json --out d1-verify.json
```
