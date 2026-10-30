# LDD PGS — one canonical dataset/resource identity

Status: done (code + tests). A real `--write` is still blocked by the registry gate,
not by this fix.

## 1. Id forms found

| side | dataset key | resource key |
| --- | --- | --- |
| CKAN source / `config/resource_licenses.json` / attribution URLs | `ord02` | `2feb3230-cf86-4560-95f5-93e58270a7d8` |
| metadata crawler `hub_catalog_sync._stable_id(source_id, …)` | `ldd:ord02` | `ldd:ord02:2feb3230-cf86-4560-95f5-93e58270a7d8` |

- `_clean_dataset` mints `datasets.dataset_id = _stable_id("ldd", "ord02")`.
- `_clean_resource` mints `resources.resource_id = _stable_id("ldd", "ord02", <resource id>)`.
- The Python writer took `resource["resource_id"]` straight from the registry (native form) and
  `CATALOG["dataset_id"] = "ord02"`; the web reader queried `ord02` / `2feb3230-…`.
- `db/cloudflare/0001_hub.sql` holds `resources UNIQUE (dataset_id, source_resource_id)` and both
  writers resolve the dataset row by `(source_id, source_dataset_id)`, so the two forms cannot
  coexist for one package.

Reproduced on the old code (in-memory SQLite, real schema, no D1):

| situation | old code | new code |
| --- | --- | --- |
| numeric write first, page query afterwards | rows stored under `2feb3230-…`; the reader's key returns **0 rows** (page empty, DB full) | rows under `ldd:ord02:2feb3230-…`; reader query returns **24 rows** |
| catalog crawl already wrote the package, then `--write` | `sqlite3.IntegrityError: UNIQUE constraint failed: resources.dataset_id, resources.source_resource_id` — the ingest dies | succeeds; still one `datasets` row and one `resources` row |

## 2. Canonical choice

**Canonical = the crawler's stable form** (`ldd:ord02`, `ldd:ord02:2feb3230-…`), kept as literal
constants on both sides.

Why this direction:

- the shared crawler cannot be edited from this lane, and the schema's
  `UNIQUE (dataset_id, source_resource_id)` means only one id set can exist per package. Choosing the
  native form would make whichever writer runs second fail exactly as reproduced above;
- choosing the stable form makes the numeric writer's `INSERT ... ON CONFLICT(resource_id)` hit the
  crawled row instead of colliding with it, in **either** run order;
- the CKAN ids are not lost: they stay in `resources.source_resource_id` / `datasets.source_dataset_id`,
  in `config/resource_licenses.json`, in the source URL, and in the page's provenance panel.

Small LDD-specific helper (no shared code touched):

- `src/tadih/ldd_pgs_progress.py`: `CANONICAL_DATASET_ID`, `CANONICAL_RESOURCE_ID`,
  `resolve_ldd_pgs_key()` (either form → `{kind, canonical, sourceId}`), `canonical_ldd_pgs_key()`
  (kind-checked), plus `_stable_id()` mirrored locally — a test asserts the mirror equals
  `hub_catalog_sync._stable_id`, so a change in the shared rule fails loudly instead of drifting.
- `src/tadih/ldd_pgs_progress_d1.py`: the registry row is canonicalised before it reaches
  `publish_observations`; `CATALOG` now carries `dataset_id = ldd:ord02` with
  `source_dataset_id = ord02` / `source_resource_id = 2feb3230-…`; the summary reports
  `resourceId`/`datasetId` (storage keys) and `sourceResourceId`/`sourceDatasetId` (register ids).
- `web/lib/hub/ldd-pgs-progress.ts`: `LDD_PGS_CKAN_*` (source) vs `LDD_PGS_DATASET_ID` /
  `LDD_PGS_RESOURCE_ID` (storage, what the reader queries), `resolveLddPgsKey()`, and a row guard
  that refuses rows that do not resolve to this resource.
- `web/lib/hub/land-reform-data.ts`: registry panel keeps the CKAN ids and gains
  `warehouseDatasetId` / `warehouseResourceId` (pinned to the reader constants by a test).

## 3. Files changed

- `src/tadih/ldd_pgs_progress.py` — canonical constants + resolvers (native ids unchanged for CKAN calls)
- `src/tadih/ldd_pgs_progress_d1.py` — canonical resource/dataset keys, native ids passed through
- `web/lib/hub/ldd-pgs-progress.ts` — reader queries the stable key, resolver, row guard
- `web/lib/hub/land-reform-data.ts` — warehouse keys beside the CKAN ids
- `tests/test_ldd_pgs_progress.py` — resolver tests (CKAN form == stable form == canonical)
- `tests/test_ldd_pgs_progress_d1.py` — writer-key == reader-key, write → SQLite → reader query, crawl-then-write
- `web/tests/lane-l7-land-reform.test.ts` — reader/query key assertions, cross-language id contract
- `scripts/sync_ldd_pgs_progress_to_d1.py` — unchanged (already a thin `main()` wrapper)
- this report

## 4. Failing-then-passing evidence

Run for real:

| command | result |
| --- | --- |
| `PYTHONPATH='src;.' ./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_ldd_pgs_progress tests.test_ldd_pgs_progress_d1 -q` | **Ran 21 tests … OK** (15 before this round → +6) |
| `cd web && node --experimental-strip-types --test tests/lane-l7-land-reform.test.ts` | **tests 21 / pass 21 / fail 0** (17 before → +4) |
| `cd web && npx tsc --noEmit` | no error in any file above; the only output is 4 pre-existing `.next/types/validator.ts` errors from the QA agent's dev server |

New tests and the exact old-code failure each one catches:

1. `test_the_literal_keys_are_what_the_catalog_crawler_mints` — fails if this lane's canonical
   literals stop matching `hub_catalog_sync._stable_id`.
2. `test_ckan_and_stable_id_forms_resolve_to_the_same_canonical_key` — asserts both id forms of both
   objects resolve to the one key; unknown ids (e.g. the pending zoning resource) are refused.
3. `test_writer_key_equals_reader_query_key` — reads `LDD_PGS_RESOURCE_ID` / `LDD_PGS_DATASET_ID`
   out of the TypeScript reader and compares them to the writer's constants (cross-language proof
   that writer key == page query key). Fails on the old mismatch (native vs stable).
4. `test_write_then_reader_query_returns_the_row` — writer → `SqliteD1Mock` (real
   `db/cloudflare/0001_hub.sql`) → the reader's own join (`observationFrom`) returns **24** rows;
   also asserts no observation sits under the native CKAN id. Old code: 24 rows under
   `2feb3230-…`, reader query **0** rows → this test failed.
5. `test_a_crawled_catalog_row_neither_blocks_nor_duplicates_the_write` — pre-creates the crawled
   `datasets`/`resources` rows, then `--write`. Old code: `IntegrityError: UNIQUE constraint failed:
   resources.dataset_id, resources.source_resource_id`. New code: succeeds, 1 dataset, 1 resource, 24 rows.
6. `web: CKAN ids and crawler stable ids resolve to the same canonical key` and
   `the registry panel keeps the CKAN ids and names the warehouse keys beside them`.

Old-code behaviour was reproduced without editing git state by monkeypatching the adapter back to
the previous id handling in a throwaway `python -c` run (no D1, no credentials):
`OLD writer stored ids: {'2feb3230-…'}` / `OLD rows found by the page query: 0` /
`OLD writer after crawl fails: IntegrityError …` — the same inputs the new code turns into
`{'ldd:ord02:2feb3230-…'}` and `24` rows.

No `--write` was passed to any script, no D1 connection was opened, no credentials were used,
no build/dev server was started.

## 5. What still blocks a real ingest

1. **Registry gate (owner/config decision, not code).** `load_approved_resource('ldd_pgs_program_progress')`
   still raises `RESOURCE_NOT_APPROVED` today because the row keeps two `unresolved` items and its
   `publication_authorization.basis` is `open_license_policy`
   (`config/publication_policy.json`), which the shared gate does not accept as a substitute.
   `config/**` is out of this lane's ownership.
2. **D1 approval state.** Even past the gate, `publish_observations` re-checks the D1 `resources` row
   (`access_status='approved_public'`, `project_publication_approved=1`) and the run activation
   guard; the row must exist/be approved in the target database.
3. **Volume.** 202 source rows → 1,616 observations per run (one run is fine against the 100k
   rows/day budget, but a rerun loop is not).
4. **Ordering is no longer a blocker:** crawl-then-write and write-then-crawl both land on one
   `datasets` row and one `resources` row with this fix.

## 6. Orchestrator action needed

- Decide how a resource with open `unresolved` items gets write authorization (registry
  `publication_authorization` shape vs the gate's `project_owner_instruction` exemption). Code and
  config are untouched here.
- Longer term, consider having `hub_catalog_sync` look up registry-backed resources by
  `source_resource_id` so stable-id minting and registry ids never diverge for other sources either
  (shared code, not this lane).
