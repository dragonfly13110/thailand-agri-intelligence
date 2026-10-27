# M5: D1 numeric write path

The writer in `src/tadih/hub_numeric_sync.py` reads its own fresh bounded sample using `read_chirps_observations()`, validates that sample against the exact approved resource registry entry, and writes only three distinct grid cells as `partial` / `sample_only`. Callers cannot supply a batch to the writer. The CLI allows `--input` only for a local dry-run and rejects `--input --write` before connecting to D1.

The validator pins the reviewed ETag, validates every observation with `validate_observation`, and requires the reviewed date, unit, grid grain, null/quality pairing, three distinct cells, and explicit partial sample coverage. It rejects unknown or `complete` coverage because the reader does not ingest the full raster.

## Approval and D1 behavior

The checked-in resource registry must approve the exact CHIRPS file, publication, and license before any D1 statement. On a new D1 resource row, the writer seeds publication flags from that registry. On conflict it updates descriptive metadata but preserves existing D1 `access_status` and `project_publication_approved`, so a D1-side revocation is not reset. It checks the existing D1 approval before creating a sync run, then checks approval again in the conditional active-run update.

The writer creates missing source and dataset metadata as `deferred` / `metadata_only`. It stages observations under a new numeric run with `status='partial'`, grid locations, and keys `(resource_id, run_id, row_key)`. `-9999` is converted to null by the reader; null remains null.

Each D1 REST statement is independent. Rows stage under a new run while the old run remains active. A write failure marks the new run `failed` and leaves staged rows unreferenced; it does not delete the previous run or its observations. The active pointer changes only after all three rows land and only while D1 publication flags still allow it. If approval fails, the previous active pointer remains unchanged.

## CLI

The default command performs a bounded source read, validates it, and prints a dry-run summary. A saved envelope may be used for an offline dry-run only. `--write` always reads a fresh bounded sample and requires `CF_ACCOUNT_ID`, `CF_D1_TOKEN`, and `CF_D1_DATABASE_ID`.

```powershell
python scripts/sync_hub_numeric.py
python scripts/sync_hub_numeric.py --input .\chirps-batch.json
python scripts/sync_hub_numeric.py --write
```

`python -m unittest tests.test_hub_numeric_sync` passed 10/10. The SQLite mock verifies partial/null handling, failed-write preservation, D1 revocation preservation and blocking, refusal of caller-supplied observations, registry approval, sample validation, CLI dry-run/write input behavior, and that local D1 credentials load before connecting.

Live acceptance on 27 October 2026: the first `--write` used an expired Wrangler OAuth token because this CLI had not loaded the ignored `.env`; it failed before any D1 write with `D1_UNAUTHORIZED`. The CLI now loads `.env` through the existing `tadih.env` helper before creating the D1 client. A fresh bounded write then returned run `dc6fb992-bf3e-543b-9385-a9fa9ca946b1`, `status=partial`, `records_read=3`, `records_written=3`, ETag `6ad152d4-119211a`, and `sample_only` coverage. A read-only D1 query confirmed that this run is active and has exactly three observations. The deployed D1 schema has no separate `revision_id` column, so each observation's `quality` JSON carries the reviewed revision and source URL.

## Remaining integration

Records and series routes were checked on the existing Workers Preview after the D1 write: the records endpoint returned 3 rows with `availability=ready`, `access=approved_public`, `completeness=partial`, and `dataAsOf=2026-09-30`; the series endpoint returned one partial series with three observations. Total D1 `observations` count is now 9,926. These three cells remain a verification sample, not full-raster coverage. Browser review of the Explorer UI on this checkout remains pending; the Preview has not been redeployed for the other current working-tree changes.
