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

`python -m unittest tests.test_hub_numeric_sync` passed 9/9. The SQLite mock verifies partial/null handling, failed-write preservation, D1 revocation preservation and blocking, refusal of caller-supplied observations, registry approval, sample validation, and CLI dry-run/write input behavior. No command above has been run against live D1: the runner token was rejected with `D1_UNAUTHORIZED`.

## Remaining integration

Records, series, and observation routes support D1 reads, and the Explorer labels an active run as partial. Live D1 write/read acceptance and browser verification on the current checkout remain pending. The existing Workers Preview is an older M3/M5 build; redeploy requires a separate authenticated `cf` CLI session.
