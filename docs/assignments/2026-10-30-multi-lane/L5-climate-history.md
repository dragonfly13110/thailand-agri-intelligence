# Lane L5 — real CHIRPS/ERA5 climate history for `/climate-history` (2026-10-30)

## Deliverables shipped

1. **Real read path** in `web/lib/hub/climate-history-data.ts` (`buildClimateHistoryOverview`,
   version `climate-history-era5-real-v2`). It serves only values genuinely read from:
   - **Tier A `d1_published_batch`** — active published ERA5 numeric run in D1 via the existing
     governed reader `listD1Observations` (`approved_public` + `project_publication_approved=1`
     + active `kind='numeric'` run), wrapped by the new bounded reader
     `web/lib/hub/climate-history-store.ts` (500-row pages, 10,000-row ceiling, honest `capped`).
   - **Tier B `reviewed_cache_point`** — the reviewed full-calendar ERA5 snapshots the existing
     ingest (`src/tadih/ingestion.py`, source `open_meteo`) already fetched to
     `data/local/raw/open_meteo/`, re-validated fail-closed by the new reader
     `web/lib/hub/climate-history-cache.ts`.
   - No new migration, no new ingest dependency, no outbound fetch anywhere in the read path.
2. **`sample:false` + provenance + availability for read data only.** Real responses carry
   `dataKind:'real'`, `sample:false`, full `scope` (tier, requested vs provider grid coords,
   first/last day with data, `dailyRowsRead`, `rowsCapped`, `variablesPublished` /
   `variablesNotPublishedHere`, `yearsMissing`, rejected cache partitions with reasons) and
   `provenance` (resource id, licence, attribution, runId/runStatus/runCount, payload sha256,
   source retrieved-at, per-year snapshot checksums). API meta: `availability:'ready'`,
   `access:'approved_public'`, `sourceIds:['open_meteo']`, `dataAsOf`/`sourceUpdatedAt` from the
   actual read, `datasetVersion` = payload sha (D1) or snapshot checksum (cache),
   completeness `complete|partial`, freshness `fresh|stale` from dataAsOf age (45-day rule),
   dynamic honest warnings (`climateHistoryMetaWarnings`).
3. **Explicit scope labels.** `/climate-history` renders a real-data banner, a
   `scope`/provenance panel (grid-point identity, day coverage per year, published vs
   permanently-null variables) and per-response Thai warnings that values are ONE 0.25° grid
   point (≈27 km), not a station and not a provincial average. The 77-code registry stays a
   coordinate registry (module fails closed if it ever holds ≠77 entries).
4. **Honest empty otherwise.** The empty branch is byte-key-identical to the pinned contract in
   `web/tests/climate-crop-empty-state.test.ts` (13 data keys, meta `empty/metadata_only`,
   CHIRPS warning kept). The deterministic sample generator remains ONLY as an offline dev
   helper (`buildClimateHistorySampleOverview`) and is unreachable from the public API.
5. **CHIRPS annex (server component)** `web/components/climate-history-chirps-sample.tsx` —
   reads the published `chirps_v3_daily_rnl_2026_09_30` rows and renders exactly the 3 grid
   cells × 1 day with coords, rainfall mm, null-vs-0 distinction, run status `partial`,
   payload sha, CC BY 4.0 attribution — labelled "3 เซลล์จาก ~7,200×2,400 ของวันเดียว,
   ไม่ใช่ coverage". Plain "cannot reach D1" state when no token (never fabricated cells).

## Correctness rules implemented

- Missing stays `null`: absent variables (cache tier has no tmean/tmin — permanently null),
  null-published days (excluded from sums/counts, they break dry-spell runs) — never 0.
- Grid-cell grain kept: one response = one cell; tiers are never merged; province selection in
  JS is by the writer's `dimensions.provinceCode` because grid rows keep
  `observations.province_code` NULL by design.
- Units/anomaly semantics: CHIRPS rows published by `hub_numeric_sync.py` are measure `rainfall`
  unit `mm` (daily rainfall) — displayed as rainfall, never as an anomaly, despite the lane
  text calling the file "rnl".
- Annual totals, extremes, baselines, trends and notable years are computed **only from years
  whose calendar is fully covered** (`completeYear`); a 7-day batch can never masquerade as an
  annual value (charts draw such years as grey gap markers, not bars).
- Rainfall (mm) and temperature (°C) trends are separate measures; `warmingDeltaC` falls back to
  a Tmax-based series when Tmean is not published, and the UI/warnings say so.

## Files changed (lane-owned only)

- `web/lib/hub/climate-history-data.ts` — rewritten overview (real tiers + null-safe aggregation),
  `CLIMATE_MAX_END_YEAR` raised 2025→**2026** (the only published D1 batch is Oct 2026; the
  validation window otherwise excludes real data — see risks), `climateHistoryMetaWarnings`.
- `web/lib/hub/climate-history-store.ts` — NEW bounded D1 readers (ERA5 days, CHIRPS cells,
  grid-point identity from row dimensions).
- `web/lib/hub/climate-history-cache.ts` — NEW reviewed-snapshot reader with fail-closed
  structural validation (point coords, licence, timezone, exact full-calendar date array,
  array lengths, units, request_url prefix, retrieved_at, checksum↔artifact-name binding).
- `web/app/api/v1/climate-history/route.ts` — state-derived meta; empty branch unchanged.
- `web/components/climate-history-dashboard.tsx` — 'real' variant, null-safe SVG charts,
  scope/provenance panel, real badge; default province 73, default range 2016–2025.
- `web/components/climate-history-chirps-sample.tsx` — NEW server-rendered annex.
- `web/app/climate-history/page.tsx` — mounts the annex, rewrites the area-note to the true
  current scope (D1: 42 rows prov.73 Oct-2026; cache: 5 reviewed points 2016–2025).
- `web/tests/lane-l5-climate-history.test.ts` — NEW lane tests (no network, no D1).
- Not touched: `scripts/sync_hub_numeric.py` (STRICT rule honoured — and **no change to it is
  needed** for this lane), all shared `web/lib/hub/*` readers, `config/**`, `db/cloudflare/**`.

## Bounded-read evidence (D1: ZERO writes)

- Probes used this lane: **1 of 2** (read-only, pre-implementation):
  - ERA5 archive resource, publication-gated join: **42 visible rows** — province 73 only,
    7 ICT days 2026-10-13..19, 6 metrics, run `succeeded`, payload sha
    `18754aec2cac…cedf24808`, retrieved `2026-10-26T15:58:50.934521Z`.
  - CHIRPS 2026-09-30 resource: **3 rows** (cells row/col 924/5605, 825/5580, 871/5656),
    run `partial`, payload sha `50f2fc4484…f383de53`, `province_code`/province dim NULL.
- No `--write` was ever run; no table dumps; no further D1 calls (all tests inject fakes).
- Local reviewed cache (read-only inspection + live read check on this machine):
  5 points × years 2016–2025 = **50 partitions**, every manifest `status:'success'`,
  **3,653 days per point** (10 full calendars), all 3 daily arrays complete, 0 nulls in
  source files, vars `precipitation_sum` (mm) / `temperature_2m_max` (°C) /
  `et0_fao_evapotranspiration` (mm), licence CC-BY-4.0, point 73 example: 2024 rainfall
  1,151.7 mm, 3 hot days, longest dry spell 25 days — plausible real values, never inflated.
- Live machine check (read-only, no token): provinces 73 and 50 return `real` cache-tier
  overviews (10 complete years each), province 10 returns the honest `empty` branch.

## Licence / registry status

- `open_meteo_thailand_era5_archive` — `approved_public`, CC BY 4.0, reviewed 2026-10-26
  (outcome: official licence page read, attribution confirmed).
- `chirps_v3_daily_rnl_2026_09_30` — `approved_public`, CC BY 4.0, reviewed 2026-10-25
  (CHC public-domain + CC BY 4.0 cover the exact v3.0 file URL).
- Both travel in every response (`source`, `provenance.license/attribution/attributionUrl`)
  with the exact resource URLs; annex links the source GeoTIFF and the Climate Hazards Center.

## Known limitation: cache checksum basis

`manifest.checksum` is a **canonical-JSON SHA-256** computed by Python
(`canonical_json_utf8`), so the artifact file's byte-level hash does NOT equal the checksum
(verified: 0/50 byte matches). The JS reader therefore binds the checksum via
`artifact filename == checksum` (the ingest's own naming contract) and re-validates the full
structure fail-closed instead of trusting contents. A future ingest could add a byte-hash
field; until then this is the honest strongest JS-side check.

## Test evidence

- `node --experimental-strip-types --test tests/lane-l5-climate-history.test.ts` (from `web/`):
  **7/7 pass** — cache-tier exact aggregates (sums, hot days, dry spells, null day ≠ 0,
  incomplete-year exclusion), D1 2026 partial batch (null kept, decoy province filtered,
  baseline/trends/notables all null, yearsMissing 9), tie→D1 tier rule + D1-outage cache
  fallback, corrupt-partition rejection with reason, route empty contract, route 400 boundaries
  (incl. 2026 ceiling), CHIRPS 3-cell mapping with null vs 0.0 + capped flag.
- `node --experimental-strip-types --test tests/climate-crop-empty-state.test.ts` (shared pin):
  **4/4 pass** (climate + crop-evidence branches).
- Combined run of both files: **11/11 pass**.
- `./node_modules/.bin/tsc --noEmit` filtered to lane files: **0 errors** (one cache-reader type
  error found and fixed; project-wide check left to the orchestrator gate).
- No `npm run build`, no dev server, no Playwright, no git operations, no new dependencies.

## What remains sample / unknown (no claims made)

- 72 of 77 provinces have no readable rows today → API/page show the honest empty state
  (only 73 has a D1 batch; 73/50/40/34/84 have reviewed cache points).
- ERA5 before 2016: no data anywhere in the repo for Thai points; windows like 2005–2024
  serve only the years that exist (cache tier 2016–2024) with `yearsMissing` listing 2005–2015.
- `tmean`/`tmin` in cache-tier responses stay `null` forever (not published by that snapshot).
- CHIRPS remains a 3-cell × 1-day verification annex; no raster coverage is claimed or served.
- The sample generator exists solely for offline development and is not reachable from any route.

## Risks / notes for the gate

1. **Cache tier is local-file dependent**: on Cloudflare hosting `data/local/**` is not
   deployed, so production falls back to Tier A (currently only prov. 73 × 7 days) or empty.
   If hosted real coverage is wanted now, D1 backfill (below) is the fix.
2. `CLIMATE_MAX_END_YEAR` moved 2025→2026; `HANDOFF.md` (orchestrator-owned) documents the
   2025 ceiling and should be amended, or the constant reverted once D1 holds 2016–2025.
3. Year-range defaults in the dashboard changed (province 73, 2016–2025) — visible UX change.
4. `climateHistoryMetaWarnings` returns 4 Thai warnings for the empty branch and 2–7 dynamic
   warnings for real responses; message wording may need copy review but semantics are locked
   by tests.

## Orchestrator action needed

- **Multi-year ERA5 D1 backfill** (lane is zero-write): run the existing
  `scripts/ingest_open_meteo_d1.py` with `--write` for 2016–2025 (at minimum the 5 reviewed
  points) under the approved resource row, so the governed store — not local files — serves
  `/climate-history` in production. No changes to `scripts/sync_hub_numeric.py` are required.
- Decide whether `data/local/raw/open_meteo` stays a legitimate read tier for self-hosted
  deployments (current lane behaviour) or should be gated behind an env flag.
- Update `HANDOFF.md` / `IMPLEMENTATION_PLAN.md` / `docs/progress.md` with: max end year 2026,
  the two real tiers, the checksum-binding limitation, and CHIRPS annex semantics.
- Run the full web suite + build at the gate (lane ran targeted tests only).
