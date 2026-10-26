-- Thailand Agricultural Data Hub - D1 migration 0002 (observation extensions).
--
-- Why: data_contracts/observation.schema.json carries provenance fields that
-- 0001_hub.sql has no column for. Without them the numeric writer can only
-- bury the contract inside the `quality` JSON blob, and readers cannot filter
-- or audit a published row:
--   * data_kind      observed | official | estimated | unknown
--                     (forecast/scenario rows are refused by the writer, so a
--                     published row is always an observation)
--   * quality_flag   good | missing  (missing is exactly the null value case)
--   * license_status approved_public | restricted | pending
--   * source_url     the exact HTTPS URL the value was read from
--   * release_at     the upstream publication timestamp (ISO 8601) or NULL
--   * revision_id    ETag / Last-Modified / dataset revision reference
--
-- How: plain SQLite ALTER TABLE ... ADD COLUMN, so the file is safe on
-- Cloudflare D1 (Wrangler applies each migration exactly once and records it
-- in the d1_migrations table). SQLite has no "ADD COLUMN IF NOT EXISTS", so
-- a manual re-apply must skip the columns that already exist; check first
-- with:
--     SELECT name FROM pragma_table_info('observations');
-- The writer in src/tadih/observations.py detects the columns at runtime and
-- works with or without this migration, so the file can be applied after the
-- first numeric publications without rewriting history.
--
-- Every added column is nullable, so existing rows stay valid and no data is
-- rewritten or deleted. NULL simply means "not recorded for this row".

ALTER TABLE observations ADD COLUMN data_kind TEXT
    CHECK (data_kind IS NULL OR data_kind IN ('observed', 'official', 'estimated', 'unknown'));

ALTER TABLE observations ADD COLUMN quality_flag TEXT;

ALTER TABLE observations ADD COLUMN license_status TEXT
    CHECK (license_status IS NULL OR license_status IN ('approved_public', 'restricted', 'pending'));

ALTER TABLE observations ADD COLUMN source_url TEXT;

ALTER TABLE observations ADD COLUMN release_at TEXT;

ALTER TABLE observations ADD COLUMN revision_id TEXT;

-- Supports the generic observations read used by the web dashboards
-- (filter by metric_id inside a period range).
CREATE INDEX IF NOT EXISTS observations_metric_period_idx
    ON observations(metric_id, period_start, period_end);
