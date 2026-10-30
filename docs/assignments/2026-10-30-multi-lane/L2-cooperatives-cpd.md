# Lane L2 — real CPD agricultural-cooperative counts for `/cooperatives` (2026-10-30)

Resource: `cpd_agricultural_coop_counts` · resource id `44463650-5d2e-482b-9919-b1c5b8bc5c6b`
dataset id `7e7e236d-790d-489d-a723-e0b1359530a4` · source `cpd` (ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ, กรมส่งเสริมสหกรณ์)
Catalog: https://catalog-cpd.data.go.th/th/dataset/st_001_01 · licence: `approved_public` in
`config/resource_licenses.json` (owner instruction AGENTS.md §3, commercial use NOT confirmed).

## 1. Inherited implementation (written by the previous L2 worker, uncommitted in the tree)

| File | State | Role |
| --- | --- | --- |
| `web/lib/hub/cpd-coop-counts.ts` | new (704 lines) | The whole read path. Constants for the approved resource, the three source status columns (`ยังไม่เริ่มดำเนินการ / ดำเนินการ / เลิกสหกรณ์` → `not_started / operating / dissolved`), strict contract validation per stored row, provenance extraction from `resources.metadata`, envelope builder (`buildCpdCoopCountsEnvelope`, pure — no clock-free claim), `unavailableCpdCoopCountsEnvelope`, and the single read-only `SELECT_SQL` + `loadCpdCoopCountsEnvelope` that binds `[resourceId, sourceId, sourceDatasetId]` with `LIMIT 1001`. |
| `web/lib/hub/cooperatives-data.ts` | +152 lines, appended | Real-read façade only: re-exports the CPD module, adds `CooperativesRealCountsEnvelope/Filters`, the internal invariant guard `assertCooperativesRealCounts` (fails closed on `sample:true`, non-null `dataAsOf`, non-null `unit`, totals, coverage, readiness/row mismatch), `loadCooperativesRealCounts()` and `cooperativesRealCountsUnavailable()`. The deterministic sample engine above is untouched, so the pre-existing source-scan test (`no clock, entropy, network or env access` in `cooperatives-data.ts`) still passes because `new Date()` lives in the CPD module, not here. |
| `web/app/api/v1/cooperatives/cpd-counts/route.ts` | new | `force-dynamic` GET. Whitelists `provinceCode` (2 digits) / `sourceStatus` (id or source column text) / `sourceYearLabel` (opaque text); unknown or repeated or malformed params → 400 `INVALID_QUERY` with a Thai message; 503 on `CPD_COOP_UNAVAILABLE` / `CPD_COOP_SNAPSHOT_INVALID`; a valid-but-empty read stays 200 with `availability:'empty'|'metadata_only'`. Never falls back to sample numbers. |
| `web/components/cooperatives-cpd-counts.tsx` | new (358 lines) | Server component. `ReadyView` (count cards + pivot of one source CSV row = province label × reporting office × year label with the three source status columns) vs `QuietView` for `empty/metadata_only/unavailable`. `unit` always renders `ไม่ทราบ`; `null` renders `ไม่มีข้อมูล`; `storedUnitLabels` shown only as an audit note. |
| `web/app/cooperatives/page.tsx` | +106 lines | Loads the real envelope (`loadCooperativesRealCounts()`, catch → `cooperativesRealCountsUnavailable()`), renders `<CooperativesCpdCounts>` above the CAMELS sample dashboard with an explicit divider and banner text that the two halves must never be read as each other. |
| `web/tests/lane-l2-cooperatives.test.ts` | new (573 lines) | 13 tests: grain/null/unit/year honesty, no totals, filters, metadata_only/empty degradation, contract-drift fail-closed, real-read guard, unavailable envelope, route surface (bound SQL, no INSERT/UPDATE, 400/503, no-store), sample endpoint keeps `sample:true`. Rows are rebuilt from the committed fixture `tests/fixtures/cpd_agricultural_coop_counts.csv` (4 data rows; the live catalogue has ~78) through the same crosswalk/digest rules as the Python writer. |

Write path (already committed earlier, not part of this lane's edits):
`src/tadih/cpd_agricultural_coop_counts.py` (`SOURCE_UNIT = "แห่ง"`, source grain, revision id) and
`src/tadih/ingest_cpd_agricultural_coop_counts_d1.py` (publishes observations to `observations`,
`run_id`-scoped, needs a rowset review). **No D1 write was run in this session.**

Contract points inherited and kept:
- grain = source province label × reporting office × source status column × opaque source-year label;
- missing stays `null` (`qualityStatus:'missing'`), a reported `0` stays `0`;
- `unit` is `null` with `unitStatus:'pending_official_confirmation'` — the CSV has no unit column, the
  string `แห่ง` only exists because our own writer stored it, so it is exposed as `storedUnit` /
  `storedUnitLabels` for audit and never asserted as the confirmed unit;
- year label `2568` comes from the resource name, convention `unknown`, so `meta.dataAsOf` is always `null`;
- no totals of any kind (`derivedTotalsProvided:false`), `coverageClaim:false`, the 77-province registry is not coverage.

## 2. Non-determinism diagnosis (the one failing test)

`real CPD counts keep source grain, opaque year label and unconfirmed unit` asserts that
`JSON.stringify(envelope)` is byte-identical across two reads of the same rows. It failed.

Measured root cause (probe outside the repo, fixture rows fed twice):
`data.rows` were **byte-identical**; the first differing byte is index 12400/13375, inside `meta`, at
`"retrievedAt":"2026-10-30T13:19:18.487Z"` vs `"...18.488Z"`.
→ **`metaFor()` in `web/lib/hub/cpd-coop-counts.ts` stamped `new Date().toISOString()` into the payload**,
i.e. a wall-clock field inside the byte-stable envelope. That is the primary defect.

Secondary latent defect found while reading the same function (must be fixed too, otherwise a real D1
read can reorder rows even with the clock removed):
- the row comparator only keyed `provinceCode → reportingUnit → source-status ordinal`, using
  `localeCompare(..., 'th')`, which can return `0` for different Thai strings; rows that differ only by
  year label / source row ref then tie, so the output order silently equals *row arrival order*;
- `sortedThai()` and `[...new Set(...)]` for `storedUnitLabels`, `availableReportingUnits`,
  `availableSourceYearLabels`, `availableProvinces` have the same property: the de-duplicated seed order
  is arrival order, and a collation tie keeps it.
`ORDER BY o.row_key` in the SQL is only a SQLite-side convenience; it is not part of the contract, so the
read path must impose its own total order.

## 3. Fixes applied in this session

1. **Volatile field removed from the byte-stable payload** — `metaFor()` now sets `meta.retrievedAt = null`
   (allowed by `ApiMeta`), and the time actually observed comes only from the stored run
   (`sourceRetrievedAt`, `completedAt`, `payloadSha256` as `datasetVersion`); a deterministic warning states
   that this payload carries no wall clock so repeat reads are byte-identical.
   *Caveat for the orchestrator:* the shared `createMeta()` in `web/lib/hub/http.ts` (not editable from this
   lane) re-injects `retrievedAt: new Date().toISOString()` at the HTTP boundary, so the *transport* response
   still carries serve time. The lane payload — and therefore the cached/exported numbers — is stable.
2. **Explicit total ordering in the production read path** — new helpers in `cpd-coop-counts.ts`:
   `compareText()` (Thai collation with a code-point fallback so a collation tie never leaks arrival order),
   a precomputed `STATUS_ORDINAL` map (replaces `findIndex` inside the comparator), and `compareCountRows()`
   which orders `provinceCode → reportingUnit → status ordinal → sourceYearLabel → sourceRowRef → rowKey`.
   Because `rowKey` uniqueness is already enforced fail-closed above the sort, the last key always breaks the
   tie, so the emitted order is independent of what order the store returns rows (proved by the 3 arrival
   permutations in §5.2). `sortedThai()` became `sortedDisplay()` (same total-order comparator) and is used for
   `availableSourceYearLabels`, `storedUnitLabels` and `availableReportingUnits`; `availableProvinces` is now
   built from a sorted code array instead of `Map` iteration order, and the display name per province code is
   chosen by the same comparator rather than "first row seen" — if one code ever carries several names the
   payload says so in a deterministic warning (`nameConflictCodes`) instead of silently hiding it.
3. Type errors in the lane files (8) — see §4.
4. Extra determinism assertions in the lane test — see §5.
5. Honest empty state — new test proves no number can be shown when nothing was read (§5.3).
6. Lane lint hygiene found while verifying (introduced by the inherited work, now fixed):
   - `web/app/cooperatives/page.tsx:276` had raw `"` inside JSX text → `react/no-unescaped-entities` (2 errors);
     replaced with typographic quotes, same wording.
   - `web/lib/hub/cooperatives-data.ts` imported `buildCpdCoopCountsEnvelope` / `cpdCoopStatusFromQuery` only to
     re-export them → 2 unused-import warnings; the re-export block is the single source now, public API unchanged.

## 4. Type errors (baseline inherited: 8 — all fixed, `npx tsc --noEmit` is silent for lane files)

| # | File:line | Error | Fix |
| --- | --- | --- | --- |
| 1-2 | `tests/lane-l2-cooperatives.test.ts:263-264` | `data.snapshot` possibly null | existence assertion before use |
| 3 | `:270` | `provenance` not on `CpdCoopCountRow` | assert the key is absent from the row (`'provenance' in first === false`) — provenance is payload-level only |
| 4-5 | `:309-310` | `gapRow` possibly undefined | existence assertion before use |
| 6 | `:449` | `string` → `null` cast | `as unknown as null` (the guard must still reject a claimed unit) |
| 7 | `:485` | `installFakeD1` not defined | implemented: a fake D1 with the exact `prepare → bind → all` shape used by `lib/hub/d1.ts`, installed on `globalThis.env.DB` before `getD1()` memoises; records sql + bound params, returns `state.rows`, rejects with `state.error`, and refuses `exec`/`dump` (read-only). The thrown ReferenceError had also aborted module evaluation, so the 4 route tests had never run. |
| 8 | `components/cooperatives-cpd-counts.tsx:255` | `CpdCoopCountRow[]` passed where `{ rows }` expected | call `StatusColumns({ rows: data.rows })` |

## 5. Determinism proof

1. The inherited byte-identity assertion is untouched: `JSON.stringify(envelope)` of two reads compared in
   full (no prefix compare, no weakening).
2. New test `two independent reads of the same fixture are byte-identical and arrival-order free`:
   a second read rebuilt from the fixture independently, plus three arrival permutations of the same row set
   (blocked reverse, status-major grouping, fully reversed) must all produce **the same bytes**;
   asserts `meta.retrievedAt === null`, that no `"retrievedAt":"` string exists in the payload, that
   `sourceRetrievedAt`/`snapshot.completedAt` still come from the stored run, and that rows come out in the
   declared order (province codes ascending, status columns left-to-right inside each province+office run).
3. New test `honest empty state: no rows means no numbers anywhere and the UI gates every count`:
   for `metadata_only` (resource absent / no published run), `empty` (approved run with zero records) and
   `unavailable`, the payload has `rows: []`, `snapshot: null`, every `counts.*` = 0, no `"value":` key, no
   sample marker (`(ข้อมูลตัวอย่าง)`/`CAMELS`) and no `แห่ง` presented as data; plus source scans proving
   `QuietView` never calls `CountCards`/`PivotTable`/`RowTable`/`ValueCell`/`intFormatter.format`, the numeric
   view is gated on `meta.availability === 'ready'`, and the page feeds `<CooperativesCpdCounts>` only from
   `loadCooperativesRealCounts()` / `cooperativesRealCountsUnavailable()`.
4. `SELECT_SQL` was validated against the committed schema in `:memory:` SQLite (all six
   `db/cloudflare/000*.sql` applied): it parses, returns 42 columns and 0 rows, contains no `INSERT`/`UPDATE`,
   and `LIMIT 1001` is present — so the read path is schema-correct without touching D1.

## 6. Evidence (commands actually run)

```
cd web && node --experimental-strip-types --test tests/lane-l2-cooperatives.test.ts     # 5 repeats, final code
run 1: tests 15  pass 15  fail 0
run 2: tests 15  pass 15  fail 0
run 3: tests 15  pass 15  fail 0
run 4: tests 15  pass 15  fail 0
run 5: tests 15  pass 15  fail 0
```
(before the fixes the same file reported `tests 9 pass 8 fail 1` — the byte-identity test failed and the
module-level ReferenceError in `installFakeD1` had silently cancelled the 4 route tests)

```
npm --prefix web run test -- tests/lane-l2-cooperatives.test.ts   → tests 370 / pass 370 / fail 0   (whole web suite, glob appended by the script)
cd web && node --experimental-strip-types --test tests/cooperatives-data.test.ts tests/lane-l2-cooperatives.test.ts
                                                                  → tests 26 / pass 26 / fail 0
cd web && node --experimental-strip-types --test tests/cooperatives-data.test.ts tests/governance-containment.test.ts
                                                                  → tests 21 / pass 21 / fail 0
                                                     (incl. "CPD cooperative counts retain exact resource authorization and unverified source terms")
cd web && npx tsc --noEmit | grep -E "cooperatives|cpd"           → no output (0 errors in lane files)
cd web && npx eslint <6 lane files>                                → 0 problems (was 2 errors + 2 warnings)
```
Python suite: not re-run in this session (no `src/tadih/**`, `scripts/**`, `tests/**.py` file was touched);
inherited state was 931/931 PASS. D1 writes: **zero** (`--write` never used). D1 read probes: **zero**
(0 of the 2 allowed used — everything ran on the committed fixture, the fake D1 and `:memory:` SQLite).
No build, no dev server, no browser, no `git add`/`commit`, no new dependency.

## 7. Remaining risks / orchestrator actions

- **`createMeta()` in shared `web/lib/hub/http.ts` overwrites `meta.retrievedAt`** at the HTTP boundary
  (`retrievedAt: new Date().toISOString()`, and its input type omits the field). The lane payload is
  byte-stable and the numbers/rows served are identical on repeat reads, but the JSON *response* still carries
  a volatile serve timestamp. If the gate wants end-to-end byte-stable responses (ETag/`datasetVersion`
  caching, snapshot export parity), `createMeta` must honour an explicit `retrievedAt`. Shared file → outside
  this lane's edit rights; **orchestrator action**.
- The committed fixture is a 4-row subset of the ~78-row live CSV, so byte-identity is proven at fixture level
  (with three arrival permutations). A live read-only probe is still worth one run once the CPD numeric run
  exists in D1 — 0 of the 2 allowed probes were used here because no CPD run has been published by this lane,
  so `/cooperatives` currently renders the honest `metadata_only` state (no numbers, no sample fallback).
- `unit` stays `null` + `unitStatus:'pending_official_confirmation'` until CPD publishes a machine-readable
  unit; `แห่ง` is exposed only as `storedUnit`/`storedUnitLabels` for audit. Claiming it as the confirmed unit
  would be a data-correctness bug even though the label exists in the store.
- Year label `2568` remains an opaque text token (`yearConvention:'unknown'`, `dataAsOf:null`) until the
  calendar-vs-fiscal question is answered with the agency.
- Province display names: if one province code ever carries several spellings in the store, the payload picks
  the first by the declared comparator and adds a warning; the row grain is never collapsed.
- `/cooperatives` page/UI verified by the payload contract + source-scan tests only (no dev server, no browser,
  no `build:vinext`, per lane rules). The lane touches no `config/**`, no `db/cloudflare/**`, no shared
  `web/lib/hub/` files outside `cooperatives-data.ts` / `cpd-coop-counts.ts`, and no other lane's files.

## 8. Commands to pick this lane up

```bash
cd web
node --experimental-strip-types --test tests/lane-l2-cooperatives.test.ts   # 15 tests, no D1, no network
node --experimental-strip-types --test tests/cooperatives-data.test.ts tests/governance-containment.test.ts
npx tsc --noEmit | grep -E "cooperatives|cpd"        # must print nothing
npx eslint lib/hub/cpd-coop-counts.ts lib/hub/cooperatives-data.ts \
  components/cooperatives-cpd-counts.tsx app/cooperatives/page.tsx \
  app/api/v1/cooperatives/cpd-counts/route.ts tests/lane-l2-cooperatives.test.ts
```

