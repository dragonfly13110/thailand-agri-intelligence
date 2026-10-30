# Lane L7 — LDD PGS programme-progress block for `/land-reform` (2026-10-30)

Row used: `ldd_pgs_program_progress` (source `ldd`,
resource_id `2feb3230-cf86-4560-95f5-93e58270a7d8`, dataset `ord02`).
Neighbouring row `ldd_rice_zoning_provincial` (`7f508d88-3c31-4cad-b95a-68ca0ce89356`, dataset `lpd`) is still
`license_status: pending` and must never be exposed by any surface in this lane.

## 1. Inherited state (measured before touching anything)

Already built by the previous worker (uncommitted in the tree, left untouched):

- `src/tadih/ldd_pgs_progress.py` — CKAN normaliser. One bounded datastore page
  (`PAGE_LIMIT = 1000`, 2 MiB cap), keeps the source grain
  *reporting unit × Buddhist fiscal year × group stage*, emits the eight published
  target/result columns with their own unit words (`กลุ่ม` `ราย` `ไร่` `บาท`),
  blanks stay `None`, raises on truncated/changed responses, `derivation.allowed = false`.
- `src/tadih/ldd_pgs_progress_d1.py` — vertical adapter (one observation per published
  column), `period_grain="source_year_label"`, `spatial_support="not_reported"`,
  no location/province, `derivedFromSource: false` on every dimension.
- `scripts/sync_ldd_pgs_progress_to_d1.py`, `tests/test_ldd_pgs_progress.py`,
  `tests/test_ldd_pgs_progress_d1.py`.
- `web/lib/hub/ldd-pgs-progress.ts` — server-only reader + envelope builder.
  **1 `tsc` error** (line 300): a bare `'metadata_only' | 'unavailable'` string was passed
  where `Partial<ApiMeta>` is expected.

Contract verified by reading the code (no DB touch needed):
`src/tadih/observations.py:1582` writes `period_label = "พ.ศ. <BE>"` with
`period_start`/`period_end` NULL for `source_year_label` batches, which is exactly what
`ldd-pgs-progress.ts` asserts — so the Python writer and the TS reader agree.

Not wired at all when I started: `web/lib/hub/land-reform-data.ts`,
`web/app/land-reform/page.tsx`, `web/app/api/v1/land-reform/route.ts` (still the pure ALRO
deterministic simulation), no lane web test, no report file.

## 2. What this lane will do

1. Fix the single type error in `web/lib/hub/ldd-pgs-progress.ts` (no other edit to it).
2. Add a real-LDD block to `/land-reform`:
   - `web/lib/hub/land-reform-data.ts` gains an additive `lddPgs` section
     (source metadata + `buildLandReformLddPgsSection`) — the existing simulation types,
     values, warnings and labels stay byte-identical.
   - `web/app/api/v1/land-reform/route.ts` composes the real envelope: `sample:false`
     applies **only** to `data.lddPgs` (backed by `ldd_pgs_program_progress`);
     `data.landReformSample` keeps `sample:true` for the ALRO simulation.
   - `web/app/land-reform/page.tsx` renders `<LandReformLddPgs>` above the sample dashboard.
3. Add `web/tests/lane-l7-land-reform.test.ts`: grain preserved, no cross-period/cross-unit
   summation, empty store ⇒ empty state (never sample fallback), pending LDD zoning resource
   never reachable.
4. ONE bounded live request to the LDD CKAN endpoint to establish reality; stop at a tested
   unavailable state if unreachable or the returned terms are ambiguous.

## 3. Findings

### 3.1 ONE bounded live request to the source (real, not simulated)

`curl --max-time 35 --max-filesize 2000000` on the reviewed datastore URL
(`https://lddcatalog.ldd.go.th/api/3/action/datastore_search?resource_id=2feb3230-cf86-4560-95f5-93e58270a7d8&limit=3&sort=_id asc`)

- `HTTP 200`, 3,600 bytes, 1.81 s → **the source is reachable and returns data**.
- `success: true`, `total: 202`, `total_was_estimated: false`, `resource_id` matches the
  reviewed row exactly. 202 ≤ `PAGE_LIMIT = 1000`, so a single complete page can be published.
- The 12 returned fields are **exactly** the 12 the Python contract expects
  (`_id`, `หน่วยงาน`, `ปีงบประมาณ`, `ประเภทกลุ่ม` + the eight `เป้าหมาย/ผลดำเนินงาน` columns),
  which also **machine-confirms the unit words** — the unit is printed in each header
  (`(กลุ่ม)`, `(ราย)`, `(ไร่)`, `(บาท)`).
- Real row 1: `นครปฐม | 2566 | กลุ่มใหม่ขั้นที่ 1` with
  target 2 กลุ่ม / 11 ราย / 24.5 ไร่ / 11,000 บาท and reported 2 / 11 / 25.25 / 11,000.
  Row 3 carries genuine published `0`s (not blanks) → the lane must keep 0 as 0 and blanks as null.
- Offline replay of that captured response through `normalize_ldd_pgs_progress`:
  the 3-of-202 page is correctly **refused** (`LDD_PGS_RESPONSE_TRUNCATED`); a complete 3-row
  response normalises to 3 rows, 1 fiscal year, 1 stage, 3 reporting units, 0 missing values,
  `derivation.allowed = false`, units `กลุ่ม/ราย/ไร่/บาท` preserved.

### 3.2 Licence/terms state

`config/resource_licenses.json` → `approved_public`, `project_publication_approved: true`,
`derivation_allowed: false`, `commercial_use_confirmed: false`, CC BY-NC-ND, attribution text recorded.
`publication_authorization.source_license_verified` is **false** (approved by the open-licence policy,
not re-verified at the provider) and `unresolved` still lists the reporting cutoff and the
reporting-unit meaning. The datastore response carries no licence field, so a single probe cannot
re-verify the licence itself. Consequence applied in code: display is **verbatim + attribution +
non-commercial only**, no derived metric of any kind, and both facts are surfaced as warnings
instead of being smoothed over. The neighbouring `ldd_rice_zoning_provincial` row stays `pending`
and is never requested, never rendered and never named as a data source by this lane.

### 3.3 D1 reality (two read-only probes, ZERO writes, no `--write` anywhere)

1. `SELECT count(*)` of published observations for resource `2feb3230-…` under the reader's
   own approval join → **0 rows**.
2. `SELECT … FROM resources WHERE resource_id IN (pgs uuid, zoning uuid) LIMIT 5` → **[]** —
   neither LDD resource is registered in D1 under its CKAN resource id yet.

So the page/API honestly render the non-ready state today: `metadata_only` when the register read
resolves to no dataset, `unavailable` when the store cannot be read, `empty` once the resource is
registered but has no numeric run. No number on this block is invented.

### 3.4 What was built

- `web/lib/hub/ldd-pgs-progress.ts` — fixed the inherited type error (line 300, a bare availability
  string passed where `Partial<ApiMeta>` belongs), removed the dead `registerMetaFallback` helper
  (it was an eslint warning), and extracted `readPublishedRows()` + `metaFromRows()`.
  **Deliberate addition, flagged for review:** when the *dataset* register lookup fails
  (`DATASET_NOT_FOUND` — see 3.5) the reader now still tries the *resource-level* published join,
  which is already rights-gated (`approved_public` + `project_publication_approved=1` + active
  numeric run). If it yields no rows the envelope is exactly the old honest
  `metadata_only`/`unavailable` result; if it yields rows they are served with a warning naming the
  fallback. Nothing was relaxed.
- `web/lib/hub/land-reform-data.ts` — appended (nothing above it changed) `LDD_PGS_REGISTRY`,
  `LandReformLddPgsSection`, `buildLandReformLddPgsSection()`, `buildLandReformLddPgsUnavailable()`,
  `measuresFromRows()`, `lddPgsRowsForPage()` + `LDD_PGS_PAGE_ROW_LIMIT = 80`. Import of the
  server-only reader is `import type` only, because `land-reform-dashboard.tsx` (`'use client'`)
  also imports this module. The measure list and unit words are read **back from the rows**, so a
  column is never described by a hardcoded guess; two different unit words for one column ⇒
  `unit: null` + a note (shown as "ไม่ระบุ").
- `web/components/land-reform-ldd-pgs.tsx` (new, server component) — pivots rows back into the
  source's own shape (1 row = reporting unit × fiscal year × stage, one column per published header),
  `null` → "ไม่มีข้อมูล", unknown unit → "ไม่ระบุ", truncation announced, quiet
  empty/metadata_only/unavailable views that state they are not falling back to the simulation.
  Falls back to a per-record table if the warehouse rows do not match the promised grain.
- `web/app/land-reform/page.tsx` — now async, renders the real LDD block above the untouched ALRO
  simulation and prints the real block's status; simulation labels/warnings untouched.
- `web/app/api/v1/land-reform/route.ts` — `data.lddPgs` added; `sample:false` applies **only** to
  that block, `data.sample` stays `true` for the ALRO half, meta states which availability field
  describes which half, and `sourceIds` gains `ldd`.
- `web/tests/lane-l7-land-reform.test.ts` — 17 tests: grain one-for-one, duplicate grain refuses,
  derived row refuses, province-bound row refuses, two fiscal years stay two rows with no derived
  field name anywhere (`Object.keys` pinned), published `0` vs blank `null`, unconfirmed unit → null,
  empty/metadata_only/unavailable produce no numbers and never reference `alro`/`totalReformAreaRai`,
  the reader only ever asks for the approved resource id (zoning id and `'lpd'` never appear),
  zoning-shaped metrics are dropped, and the composed route keeps `data.sample = true` while
  `data.lddPgs.sample = false`.

## 4. Verification actually run

| command | result |
| --- | --- |
| `cd web && npx tsc --noEmit` | 0 errors in `ldd-pgs-progress.ts`, `land-reform-data.ts`, `land-reform-ldd-pgs.tsx`, `app/land-reform/page.tsx`, `app/api/v1/land-reform/route.ts`, `tests/lane-l7-land-reform.test.ts` (the 1 inherited error is gone) |
| `npx eslint <5 lane files>` | 0 errors, 0 warnings |
| `node --experimental-strip-types --test tests/lane-l7-land-reform.test.ts` | **17 pass / 0 fail** |
| `npm --prefix web run test -- tests/lane-l7-land-reform.test.ts` | **387 pass / 0 fail** (the npm script globs the whole `tests/` dir, so this is the full web suite + this lane, no regression) |
| `PYTHONPATH='src;.' ./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_ldd_pgs_progress tests.test_ldd_pgs_progress_d1 -q` | **Ran 15 tests … OK** |
| live source probe | 1 request, HTTP 200, `total 202`, fields match contract (see 3.1) |
| D1 probes | 2 read-only SELECTs (see 3.3); no `--write`, no D1 mutation, no build/dev-server/browser |

## 5. What stays sample / unknown

- Everything ALRO (ส.ป.ก.) on this page and in `/api/v1/land-reform` — `sample: true`,
  `access: metadata_only`, banner/disclaimer/warnings unchanged.
- LDD PGS numbers: **unknown today** (0 published rows in D1) → the block renders
  `metadata_only`/`unavailable`, never a number.
- `dataAsOf` stays `null` (no published cutoff; registry lists it as unresolved).
- Unit words are shown per column; a column whose unit words disagree stays `null` → "ไม่ระบุ".
- Reporting-unit names are never crosswalked to provinces (registry says they do not establish
  target areas), even though some values look like province names (`นครปฐม`).

## 6. Risks / orchestrator action needed

1. **Dataset-id divergence (blocks real numbers later).** The metadata crawler mints
   `datasets.dataset_id = _stable_id(source_id, source_dataset_id)` and
   `resources.resource_id = _stable_id(source_id, dataset_id, source_resource_id)`
   (`_clean_resource` / `_clean_dataset` in `src/tadih/hub_catalog_sync.py`), while the registry/numeric
   writer uses the CKAN ids (`ord02`, `2feb3230-…`). Probe 2 in 3.3 shows neither CKAN id is in
   `resources` today.
   The reader is now resilient to this (3.4), but the ids should be unified by one owner decision.
2. **Owner action to get numbers on the page:** run
   `PYTHONPATH=src ./.venv/Scripts/python.exe scripts/sync_ldd_pgs_progress_to_d1.py --write`
   (202 source rows → 1,616 observations). Not run here — zero-write rule.
3. **Licence re-verification:** `source_license_verified = false`; the display is verbatim,
   attributed and non-commercial only. If the provider publishes an exact licence variant, re-review.
4. A `next build` was not run (prohibited): the type-only import in `land-reform-data.ts` is what
   keeps the `'use client'` dashboard from pulling the `server-only` reader — worth one build check
   at integration time.
