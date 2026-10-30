# Lane L1 — real DLD livestock numbers for `/livestock` + `/api/v1/livestock` (2026-10-30)

Resumed after the previous worker was killed by an API error with uncommitted work in the
tree. This report describes the inherited code as it actually behaves, then records the
fixes made in this session.

## What the inherited code does

### Read path (web)

- `web/lib/hub/dld-livestock.ts` (new): governed reader for the five approved DLD
  province-count resources (cattle/dairy/swine/poultry/duck, registry UUIDs hardcoded).
  Reads ONLY D1 observations via `listD1Observations` (which fail-closes in SQL on
  `approved_public` + `project_publication_approved=1` + active succeeded/partial numeric
  run).paged at `D1_OBSERVATION_ROW_LIMIT`, 5,000-row ceiling. Per species it returns one of:
  - `real` — rows + full provenance (runId, payloadSha256, sourceRetrievedAt, adapterVersion,
    revisionId, rowCount). Fails CLOSED to `unavailable` if: total changes mid-read, rows are
    incomplete, run/sha/retrieval/adapter/revision are not uniform (one snapshot = one run),
    any row breaks the year×province contract (`sourceYearBe` 2400–9999 integer, no
    periodStart/End/observedAt), or rowKeys duplicate.
  - `empty` — approved resource but zero published rows in D1 (honest note, no numbers).
  - `unavailable` — D1 unreadable. NEVER falls back to sample numbers.
- `web/lib/hub/livestock-data.ts` (rewritten, +436/−): `buildLivestockDashboard()` is now
  `async`. DLD species summaries come only from the governed reader:
  - `real` → aggregates the latest Buddhist source-year only; region totals from the DLD
    4-region source labels; null value rows keep the region total null and therefore the
    national total null; mixed units ⇒ unit null; sharePct only when total exists.
  - `empty`/`unavailable` → all numbers null, `sample:false`, explanatory Thai note.
  - DOF aquaculture species (shrimp/tilapia/catfish, licence still `pending`) remain
    deterministic samples (FNV-1a + mulberry32, no wall clock), labelled `readState:'sample'`.
  - Region bases stay distinct: `dld-*` (4, basis source, east folded into central per DLD)
    vs `dof-*` (6, source) vs `std-*` (5, crosswalk). Province-code guard matches the
    77-province registry and standard crosswalk at module load.
  - `payload.sample` = true only because the DOF side is still sample.
- `web/app/api/v1/livestock/route.ts`: awaits the dashboard; sector/species filters with
  explicit 400s (unknown species, species/sector mismatch); meta availability =
  `ready` only when at least one DLD summary is `real`, else `unavailable`/`empty`;
  `runtimeMode:'database'`; access stays `metadata_only` because the payload still contains
  DOF sample sections.
- `web/app/livestock/page.tsx` + `web/components/livestock-dashboard.tsx`: async page; if the
  dashboard throws, the page renders an explicit "store unreadable" card — no sample fallback.
  The UI shows per-species readState (real / still-no-rows / unavailable / sample) and null as
  "ไม่ทราบ", never 0.

### Ingest path (Python, dry-run by default — not used by this lane, ZERO D1 writes here)

- `src/tadih/dld_livestock.py` (new): normalizes the 5 province resources (datastore for
  cattle/dairy, CSV for swine/poultry/duck) + `dld_national_livestock_value`; keeps source
  year label, DLD region text, native unit; bounded pages (500×10) and 4 MB CSV cap.
- `src/tadih/dld_livestock_ingest_d1.py` + `scripts/ingest_dld_livestock_to_d1.py` (new):
  writer gated on the shared approval gate; fails closed for resources whose unresolved
  licence items lack explicit project-owner authorization (per registry, only cattle has
  `project_owner_authorized_public_numeric_display` as review outcome — see gaps note).
- `tests/test_dld_livestock.py`: 15 tests, all passing (baseline measured this session:
  `Ran 15 tests ... OK`).

## What was broken when this session started (measured)

1. `npx tsc --noEmit`: 6 type errors in `web/tests/lane-l1-livestock.test.ts` (nullable
   `summary.note` deref, region map callbacks typed `{regionId}` then `.value`, province map
   callback typed `{value:number}` vs `LivestockProvinceStat` which is `number|null`) and
   12 in `web/tests/hub-data-domains.test.ts` (`.sectors`/`.sample`/`.warnings` on
   `Promise<LivestockDashboardPayload>` because `LivestockApiPayload` used
   `ReturnType<typeof buildLivestockDashboard>` after it became async).
2. 3 shared livestock tests failed: two sync tests called the now-async builder without
   awaiting, and the third asserted the OLD contract (`availability:'ready'`, every species
   `sample:true` with total > 0) which the new honest read path no longer provides.

## Fixes applied this session

- Lane test: typed against real payload types; `null` kept `null` (note guarded via
  `assert.extract`-style non-null assertions only where the state contract guarantees a
  string; no coercion to 0).
- Shared livestock tests in `web/tests/hub-data-domains.test.ts` (only those edited):
  `LivestockApiPayload.data` is now `Awaited<ReturnType<...>>`; the two async-native tests
  await the payload; sector/species registry assertions and the DLD-vs-DOF region-separation
  assertions are preserved; the API contract test now proves the NEW guarantee: DLD species
  are never `sample:true`, `sample:false` with numbers only from approved D1 rows, otherwise
  honest empty/unavailable nulls; `availability` matches the observed DLD states.

## Verification log (this session)

- Web lane+shared: `cd web && node --experimental-strip-types --test tests/lane-l1-livestock.test.ts tests/hub-data-domains.test.ts`
  → 29 tests / 29 pass / 0 fail (the 3 previously failing livestock shared tests now pass).
- Types: `cd web && npx tsc --noEmit` filtered to `livestock|hub-data-domains` → 0 errors in
  lane L1 files (remaining errors in the full output belong to lanes L2/L5/L6/L7 files, not mine).
- Python lane: `PYTHONPATH='src;.' ./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_dld_livestock -q`
  → Ran 15 tests, OK.
- Live DLD source (1 bounded read, `limit=1`, cattle resource):
  `https://dld.gdcatalog.go.th/api/3/action/datastore_search?resource_id=d3667ca5-…` → HTTP 200,
  `success:true`, total 385 rows, columns `year/particular/region/livestock_area/province/value/unit/source`
  — matches the adapter contract and the metadata shown on `/livestock`.
- D1 state (1 read-only count probe via the project's D1 REST client, no writes, no credentials
  printed): zero published observations for all five DLD province resources ⇒ the page/API serve
  `readState:'empty'`, `sample:false`, `total:null` and the API meta reports `availability:'empty'`.
  No sample fallback exists anywhere in the DLD path (enforced by the lane tests).
- Page/API with no DLD rows: proven by the empty-store and unreachable-store lane tests plus the
  restated shared API test; the page renders explicit Thai status cards and nulls as "ไม่ทราบ"
  (component `formatNumber(null)` → 'ไม่ทราบ', never 0).

## Remaining risks / notes for the orchestrator

- Real numbers appear on `/livestock` only after the DLD ingest is authorized+run; the ingest
  scripts exist and are dry-run by default, but the shared writer gate fails closed for the four
  resources whose licence has unresolved items (only cattle carries the project-owner review
  outcome). This is recorded in the payload `gaps`, not hidden.
- `docs/assignments/.../L1-livestock-dld.md` is this lane's only report; HANDOFF.md and
  docs/progress.md are intentionally untouched (shared files, orchestrator-owned).
- No commits made (hard rule). Working tree keeps the inherited + fixed lane files.

