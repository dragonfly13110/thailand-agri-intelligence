-- Preserve an opaque source-year label and the source's own revision token for
-- annual resources whose year convention is not verified. These are nullable
-- run-level fields; DLD's source_year_be semantics and dated writers remain
-- unchanged. Generic source-token snapshots require this migration before use.
ALTER TABLE sync_runs ADD COLUMN source_year_label TEXT;
ALTER TABLE sync_runs ADD COLUMN source_version TEXT;
ALTER TABLE sync_runs ADD COLUMN source_hash TEXT;
