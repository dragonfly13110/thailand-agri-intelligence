-- Thailand Agricultural Data Hub schema for Cloudflare D1 (SQLite).
-- Apply through Wrangler's D1 migration workflow. This database is dedicated
-- to the Hub, so PostgreSQL's `hub` schema namespace and role grants do not
-- have equivalents here; access is controlled by Worker bindings.
--
-- PostgreSQL mappings: jsonb -> validated JSON TEXT, boolean -> INTEGER 0/1,
-- uuid/date/timestamptz -> TEXT (UUID, ISO date, and UTC timestamp strings).
-- Numeric observations use SQLite NUMERIC affinity; fractional values may be
-- stored as IEEE-754 REAL, so exact-decimal consumers must preserve source text.

CREATE TABLE sources (
    source_id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    connector_kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'enabled'
        CHECK (status IN ('enabled', 'deferred', 'needs_access', 'unavailable')),
    metadata_access_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (metadata_access_status IN ('approved_public', 'metadata_only', 'pending', 'restricted')),
    freshness_days INTEGER CHECK (freshness_days IS NULL OR freshness_days > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE datasets (
    dataset_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    source_dataset_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT,
    owner TEXT,
    source_url TEXT NOT NULL,
    modified_at TEXT,
    metadata_access_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (metadata_access_status IN ('approved_public', 'metadata_only', 'pending', 'restricted')),
    metadata TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(metadata)),
    harvested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_id, source_dataset_id)
);

CREATE TABLE resources (
    resource_id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
    source_resource_id TEXT NOT NULL,
    name TEXT NOT NULL,
    format TEXT,
    resource_url TEXT,
    access_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (access_status IN ('approved_public', 'metadata_only', 'pending', 'restricted', 'internal')),
    declared_license TEXT,
    license_url TEXT,
    project_publication_approved INTEGER NOT NULL DEFAULT 0
        CHECK (project_publication_approved IN (0, 1)),
    grain TEXT,
    source_updated_at TEXT,
    metadata TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(metadata)),
    active_run_id TEXT,
    UNIQUE (dataset_id, source_resource_id),
    FOREIGN KEY (resource_id, active_run_id)
        REFERENCES sync_runs(resource_id, run_id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE sync_runs (
    run_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    resource_id TEXT REFERENCES resources(resource_id),
    kind TEXT NOT NULL CHECK (kind IN ('metadata', 'numeric')),
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    source_retrieved_at TEXT,
    records_read INTEGER NOT NULL DEFAULT 0 CHECK (records_read >= 0),
    records_written INTEGER NOT NULL DEFAULT 0 CHECK (records_written >= 0),
    records_quarantined INTEGER NOT NULL DEFAULT 0 CHECK (records_quarantined >= 0),
    payload_sha256 TEXT,
    adapter_version TEXT,
    error_code TEXT,
    UNIQUE (resource_id, run_id)
);

CREATE TABLE locations (
    location_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    kind TEXT NOT NULL
        CHECK (kind IN ('country', 'province', 'district', 'subdistrict', 'station', 'reservoir', 'grid')),
    native_code TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_location_id TEXT REFERENCES locations(location_id),
    province_code TEXT,
    crosswalk_version TEXT,
    UNIQUE (source_id, kind, native_code)
);

CREATE TABLE observations (
    resource_id TEXT NOT NULL REFERENCES resources(resource_id),
    run_id TEXT NOT NULL,
    row_key TEXT NOT NULL,
    series_key TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    period_label TEXT,
    location_id TEXT REFERENCES locations(location_id),
    location_code TEXT,
    location_kind TEXT
        CHECK (location_kind IS NULL OR location_kind IN ('country', 'province', 'district', 'subdistrict', 'station', 'reservoir', 'grid')),
    location_name TEXT,
    province_code TEXT,
    crop_code TEXT,
    crop_name TEXT,
    metric_id TEXT,
    metric_name TEXT,
    product TEXT,
    grade TEXT,
    market TEXT,
    unit TEXT,
    value NUMERIC,
    dimensions TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(dimensions)),
    source_row_ref TEXT,
    quality_status TEXT NOT NULL DEFAULT 'unknown',
    quality TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(quality)),
    PRIMARY KEY (resource_id, run_id, row_key),
    FOREIGN KEY (resource_id, run_id)
        REFERENCES sync_runs(resource_id, run_id)
        ON DELETE CASCADE
);

-- SQLite B-tree approximation of PostgreSQL's GIN/tsvector search index.
-- It keeps the same source fields available but does not provide token search.
CREATE INDEX datasets_search_idx ON datasets(title, description, owner);
CREATE INDEX datasets_source_category_idx ON datasets(source_id, category, title);
CREATE INDEX resources_dataset_access_idx ON resources(dataset_id, access_status);
CREATE INDEX sync_runs_source_latest_idx ON sync_runs(source_id, completed_at DESC);
CREATE INDEX observations_series_period_idx ON observations(series_key, period_start, row_key);
CREATE INDEX observations_resource_run_idx ON observations(resource_id, run_id, period_start, row_key);
CREATE INDEX observations_province_crop_idx ON observations(province_code, crop_code, period_start);
