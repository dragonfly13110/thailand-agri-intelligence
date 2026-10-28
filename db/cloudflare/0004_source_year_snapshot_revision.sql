-- Preserve the source revision that currently owns an annual/source-year
-- snapshot. This nullable field is used by replay-safe provenance refreshes;
-- existing runs remain readable, and daily/monthly writers do not require it.

ALTER TABLE sync_runs ADD COLUMN source_revision_id TEXT;
