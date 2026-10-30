# Lane L6 — MODIS NDVI point evidence for `/crop-evidence` (2026-10-30)

## Deliverables shipped

1. **Read path for real NDVI observations** — `web/lib/hub/crop-evidence-data.ts` gained a pure
   `crop-evidence-ndvi-v1` sub-contract (`buildCropEvidenceNdvi` / `emptyCropEvidenceNdvi` /
   `unavailableCropEvidenceNdvi`), served through the server-only reader
   `web/lib/hub/crop-evidence-ndvi.ts` which reuses the EXISTING published-observation join
   (`listD1Observations({sourceId:'modis', resourceId:'modis-13A1-061', locationKind:'grid'})`,
   500-row pages, 2,000-row ceiling with `capped` partial semantics). No new migration, no new gate —
   the shared reader already enforces `resources.access_status='approved_public'`,
   `project_publication_approved=1` and the active `kind='numeric'` run.
2. **`sample:false`, provenance, `availability`, explicit scope** — every payload carries
   `sample:false`, `dataKind`, `availability` (`ready|empty|unavailable`), provenance (run ids,
   adapter version, payload sha256, source retrieval, row count) and a Thai scope statement with
   point/tile/composite counts (MODIS = 500 m single grid pixels × 16-day composites; "ไม่ใช่ข้อมูลครอบคลุมทั้งแปลง/อำเภอ/จังหวัด").
   Missing composites stay `null` (never 0, never interpolated); NDVI keeps unit `index`
   (unitless −1..1); out-of-range warehouse values are shown raw + warned, never edited.
3. **Honest empty/unavailable** — today D1 holds **zero** published modis rows, so the page/API
   render `empty` (D1 reachable) or `unavailable` (`D1_READ_FAILED`) states; no sample fallback exists
   anywhere in the lane.

## Endpoints / surfaces

- `GET /api/v1/crop-evidence/ndvi` (new sub-route) — `no-store`, meta mirrors the evidence state.
  The main `/api/v1/crop-evidence` route and `CropEvidencePayload` keys are **untouched**
  (pinned by `web/tests/climate-crop-empty-state.test.ts`).
- `/crop-evidence` page is now `force-dynamic` and renders `<CropEvidenceNdvi>` (global CSS classes only).
- `web/lib/hub/satellite-data.ts` NOT modified (strict rule).

## Bounded-read evidence (D1: ZERO writes)

- Exactly the two permitted read-only probes were used (pre-implementation):
  1. `SELECT count(*)` of published modis observations under the public join conditions → `0`
  2. `SELECT ... FROM resources JOIN datasets WHERE source_id='modis' LIMIT 5` → `[]`
  Therefore the live web state is honestly `empty`; no further probes were run.
- Real-data dry-run offline (no D1, no network): `PYTHONPATH=src .venv/Scripts/python.exe scripts/sync_modis_ndvi_staging.py`
  over the 5 local Planetary Computer snapshots (`data/local/satellite/point-*`):
  20 rows prepared (5 points × 4 measures), tiles h27v07/h27v08/h28v07, composite
  2026-09-30 → 2026-10-15, 3 points with NDVI (0.6737 / 0.4289 / 0.5125), 2 cloud-masked points
  published as `null` + `quality_flag='missing'` (fail-closed masking), `records_written: 0`.

## License / registry status

- Row used: `planetary_computer_modis13a1_point` (resource_id `modis-13A1-061`, dataset `MOD13A1.061`,
  source `modis`, `approved_public`, `project_publication_approved=true`,
  attribution "NASA LP DAAC / USGS MODIS data accessed via Microsoft Planetary Computer",
  DOI https://doi.org/10.5067/MODIS/MOD13A1.061).
- **Publication gate currently refuses `--write`**: `unresolved = ["Validation of cloud masking vs
  field survey references across Thai agricultural regions"]` and the row's
  `publication_authorization.basis` is `open_license_policy`, while the shared writer's
  `_has_explicit_publication_authorization` only accepts basis `project_owner_instruction` with
  `source_license_verified=false` + full scope. `assert_resource_approved` raises
  `RESOURCE_NOT_APPROVED`; the adapter surfaces this verbatim in dry-run output and the write test
  proves the refusal happens **before** any client call (ForbiddenClient sentinel never touched).

## Test evidence

- Web: `npm --prefix web run test -- tests/lane-l6-crop-evidence-ndvi.test.ts` —
  new `tests/lane-l6-crop-evidence-ndvi.test.ts`: 6/6 pass; whole web suite 329/329 pass (incl.
  `climate-crop-empty-state.test.ts` → main crop-evidence contract intact).
  Coverage: null-stays-null, unit `index` verbatim, scope counts (points/tiles/composites), capped
  partial warning, out-of-range warn-don't-edit, empty vs unavailable, paged/throwing fake readers,
  main payload key list unchanged.
- Python: `PYTHONPATH='src;.' ./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_lane_l6_modis_ndvi -q` — 11/11 pass.
  Also `tests.test_satellite` 6/6 pass (shared module untouched behaviour re-verified).

## Files

- Edited: `web/lib/hub/crop-evidence-data.ts` (appended pure NDVI section only),
  `web/app/crop-evidence/page.tsx`.
- Created: `web/lib/hub/crop-evidence-ndvi.ts`, `web/app/api/v1/crop-evidence/ndvi/route.ts`,
  `web/components/crop-evidence-ndvi.tsx`, `web/tests/lane-l6-crop-evidence-ndvi.test.ts`,
  `src/tadih/modis_ndvi.py`, `src/tadih/ingest_modis_d1.py`, `scripts/sync_modis_ndvi_staging.py`,
  `tests/test_lane_l6_modis_ndvi.py`.

## What remains empty / unknown

- `/api/v1/crop-evidence/ndvi` serves `empty` until someone registers + ingests modis rows into D1
  (catalog currently has no `modis` resources at all).
- `freshness` is `unknown` (no `sources.freshness_days` for modis; not invented).
- Point names come from coordinates (no verified province binding): grid point ≠ province, so
  `province_code` stays NULL on purpose — the page cannot filter NDVI by province and must not.

## Risks

- Grain honesty depends on the scope statement being read; a future "coverage map" feature could
  silently over-claim if it forgets the 500 m/16-day grain. The scope object is mandatory in every
  payload to make that hard.
- Multiple composite periods per point multiply rows quickly (4 measures × N composites); the
  2,000-row ceiling + `capped` partial keeps reads bounded.

## Orchestrator action needed

1. **Gate L8 → ingest**: clear `planetary_computer_modis13a1_point`'s `unresolved` item (cloud-mask
   validation vs field references) or add an owner grant (`basis: project_owner_instruction`,
   `document: AGENTS.md`, `section: 3`, `source_license_verified: false`, full scope) so
   `assert_resource_approved` passes — I may not edit `config/**`.
2. Then run registration + publish (NOT by this lane — D1 zero-writes here):
   `PYTHONPATH=src .venv/Scripts/python.exe -m tadih.ingest_modis_d1 --write [--snapshots data/local/satellite | --live]`.
3. `web/lib/hub/satellite-data.ts` NDVI banner still claims no real source exists (and its catalog
   entry shows stale `pending`); needs a one-line honesty update once rows are published — owned by
   another lane/orchestrator, forbidden to me. Same for the stale `licenseStatus:'pending'` for
   vegetation MODIS in `web/data/catalog.json`.
4. Optional: register `modis` adapter in `src/tadih/cli.py` dispatch (`--adapter modis`) — cli.py is
   outside my allowlist; `python -m tadih.ingest_modis_d1` works standalone today.
5. Full-suite typecheck/build gate remains for the round closer (lane ran only targeted tests).
