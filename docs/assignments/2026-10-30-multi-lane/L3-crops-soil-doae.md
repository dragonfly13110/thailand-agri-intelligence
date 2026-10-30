# Lane L3 — DOAE subdistrict crop production for `/crops` and `/soil` (2026-10-30)

Row scope: `doae_production_subdistrict_2023` (annual crops, short-lived) and
`doae_perennial_subdistrict_2023` (perennial/fruit). Source `doae`, grain = **subdistrict
(ตำบล)**. Both registry rows are `approved_public` + `project_publication_approved`
(reviewed 2026-10-22, policy `publication-policy-2026-10-29`). This lane is READ/PREPARE only —
**ZERO D1 writes** (never passed `--write`).

## What already existed before this worker (measured, uncommitted in the tree)

- `web/lib/hub/crops-soil-data.ts` +224 lines: DOAE catalog types + `DOAE_CROP_RESOURCES`
  (client-safe, no server-only), `DoaeProductionBlock*` types, `DOAE_APPROVED_SCHEMA_UNVERIFIED`
  (the 2567 resources stay unpublished: unresolved semantics/units/privacy), `sample:false` field.
- `web/lib/hub/doae-production-data.ts` (new, server-only): `loadDoaeProductionBlock` /
  `buildDoaeProductionBlock` / `mapDoaeObservationRow`. Reads ONLY published `observations` via the
  shared `listD1Observations` join (enforces `approved_public` + publication + active numeric run),
  bounded window (default 1,000, page cap 8), `assertGrain` rejects any row not source=doae /
  matching resourceId / locationKind=subdistrict / no date period. Missing value → null; unconfirmed
  unit → null; NO province roll-up (counting rows is not aggregation).
- `web/components/crops-doae-production.tsx` + `.module.css` and
  `web/components/soil-doae-production.tsx` (new client components; nothing imported them yet).
- Python: `src/tadih/doae_production_bridge.py`, `scripts/sync_doae_production_to_d1.py`,
  `tests/test_doae_production_bridge.py` (14/14 PASS locally).

## What this worker did (in progress — update as it goes)

1. Wire `<CropsDoaeProduction>` into `/crops` (page) and the DOAE block into `/api/v1/crops`, and
   `<SoilDoaeProduction>` into `/soil` (page) + `/api/v1/soil`. Envelope: pages become
   `force-dynamic` async server components that call `loadDoaeProductionBlock` and pass the block
   prop directly (L6 pattern). API routes keep the reference tabs/meta ENVELOPE UNCHANGED
   (`availability: metadata_only`, `sourceIds ['oae','doae']` / `['ldd','doae']`, `data` shape
   pinned by `hub-data-domains` + `phase2` tests) and add a sibling `doaeProduction` field carrying
   the block. `sample:false` lives only on that block.
2. If D1 has no published doae rows, `loadDoaeProductionBlock` returns an honest
   `empty`/`catalog_pending`/`no_numeric_run`/`unavailable` block; components render it with an
   explicit status + warnings, never a substitute number.
3. `web/tests/lane-l3-crops-soil-doae.test.ts` proving grain preserved, no province sum, null stays
   null (never 0), crops/years/units never merged, empty store ⇒ empty state.
4. Run lane Python tests + the sync script DRY-RUN ONLY; bounded D1 read probes only (max 2).

## Evidence (commands actually run)

- Web lane test: `node --experimental-strip-types --test tests/lane-l3-crops-soil-doae.test.ts` → **10/10 pass**.
  Covers: `sample:false` always; subdistrict grain kept (province/district/subdistrict distinct,
  month/planting-round stay raw labels); wrong-grain rows (province-kind / other source / dated period)
  are **refused** via `DOAE_GRAIN_CONTRACT_INVALID` / `DOAE_PROVENANCE_MISMATCH` /
  `DOAE_PERIOD_CONTRACT_INVALID`; the only province-level number is a labelled **count** with a stated
  window/coverage method and no summed-value field exists; null value / null unit / unparseable year all
  stay null (never 0) with warnings; mixed units collapse to null and counts never sum values; different
  crop/year rows stay separate buckets; bounded reads surface truncation warnings; empty store → honest
  `empty/catalog_missing/catalog_pending/no_numeric_run/unavailable` with no substitute number;
  and `/api/v1/crops`+`/api/v1/soil` keep the reference `data`/`meta` (`metadata_only`, 6 tabs /
  7 series) untouched with `doaeProduction` as a `sample:false` sibling.
- Existing regression suites (unmodified): `phase2-weather-crops-soil` + `hub-data-domains` +
  `climate-crop-empty-state` → **41/41 pass**. Full web suite `node --test tests/*.test.ts` → **364/365**;
  the single failure is `lane-l2-cooperatives.test.ts` (`sortedThai is not defined` in
  `web/lib/hub/cpd-coop-counts.ts`) — a different lane's shared file, NOT L3.
- Typecheck: `cd web && npx tsc --noEmit` → **zero** errors across all L3 files
  (`crops/page.tsx`, `soil/page.tsx`, `api/v1/crops/route.ts`, `api/v1/soil/route.ts`,
  `crops-doae-production.tsx`, `soil-doae-production.tsx`, `doae-production-data.ts`, the new test).
- Python bridge: `PYTHONPATH='src;.' ./.venv/Scripts/python.exe -X utf8 -m unittest
  tests.test_doae_production_bridge -q` → **14/14 OK** (real staging fixtures under
  `data/local/production/{staged,perennial-staged}` are present, so the real-fixture tests run, not skip).
- Dry-run sync (DRY-RUN ONLY, no `--write`, bounded `--limit 40`, offline — dry run never opens D1):
  - `scripts/sync_doae_production_to_d1.py --resource doae_production_subdistrict_2023 --dry-run --limit 40`
    → `status: prepared`, `mode: dry_run`, `written: false`, registry gate `passed`,
    `rowsPrepared/rowsBridged: 109`, `distinctSubdistrictLocations: 11`, `provinceLabelCount: 1`,
    `writerRowsQuarantined: 0`, `completeness: partial`.
  - `scripts/sync_doae_production_to_d1.py --resource doae_perennial_subdistrict_2023 --dry-run --limit 40`
    → `status: prepared`, `mode: dry_run`, `written: false`, registry gate **`blocked_for_write`**
    (perennial governance items still open), `rowsPrepared/rowsBridged: 116`,
    `distinctSubdistrictLocations: 5`, `writerRowsQuarantined: 0`.

## Doae rows in D1 (record honestly)

**There are ZERO DOAE rows in D1 — neither resource is even registered there.**
Evidence: one read-only probe (probe 1 of the 2-permitted budget) against the live D1 REST endpoint
mirroring the web read join returned `PROBE_OK` with `[]` for
`resource_id IN ('f9ab6055-6364-4f78-812e-15989e300979','61f3f241-92c7-4cdc-9918-41ce73545268')` —
i.e. no `resources` rows, so no `observations` and no numeric run. This lane performed **no D1 writes**
(`--write` never passed; the dry-run path never opens a DB connection). Real staging data exists only
as gitignored local files under `data/local/production/...`. Consequently the `/crops` and `/soil`
DOAE blocks render the honest `catalog_missing` empty state (no substitute numbers), which the lane
test proves.

## What stays sample / metadata_only / unknown

- The 6 reference crop tabs + 7 soil series + fertilizer tables stay `metadata_only` exactly as
  before (their own pinned tests). Only the DOAE production block is real-data-backed (`sample:false`).
- `doae_perennial_subdistrict_2023`: registry still carries unresolved governance items (duplicate
  rows, negative values) → writer gate blocks `--write`; even if a run existed, the read path would
  only show published rows.
- 2567 resources (`DOAE_APPROVED_SCHEMA_UNVERIFIED`): approved licence but semantics/units/period/
  privacy unresolved and no staging → never exposed as numbers.
- `freshness` stays `unknown` (no invented recency).

## Risks

- Route tests now trigger a D1 read attempt inside `loadDoaeProductionBlock`; it is wrapped in
  try/catch and returns `unavailable` when the DB is unconfigured, so `/api/v1/crops` &
  `/api/v1/soil` still answer 200 with the unchanged reference envelope. Verified no hang.
- Client-side year/measure/province filters only see rows inside the bounded read window; the
  component warns that counts are "in the window read", not coverage.

## Orchestrator action needed

- To put real numbers on the pages someone must run the write path (NOT this lane):
  `PYTHONPATH=src .venv/Scripts/python.exe scripts/sync_doae_production_to_d1.py --resource
  doae_production_subdistrict_2023 --write` after clearing any registry gate; the perennial resource
  must first close its unresolved (duplicate/negative) governance items.
