-- Bootstrap schema for a Supabase/PostgreSQL database dedicated to the Hub.
-- Apply with the provider's migration workflow after selecting a project.
-- This file intentionally does not create a Supabase project or grant Data API access.
BEGIN;

CREATE SCHEMA IF NOT EXISTS hub;
REVOKE ALL ON SCHEMA hub FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_reader') THEN
        CREATE ROLE hub_reader NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_sync') THEN
        CREATE ROLE hub_sync NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA hub TO hub_reader, hub_sync;

CREATE TABLE IF NOT EXISTS hub.sources (
    source_id text PRIMARY KEY,
    source_name text NOT NULL,
    base_url text NOT NULL,
    connector_kind text NOT NULL,
    status text NOT NULL DEFAULT 'enabled'
        CHECK (status IN ('enabled', 'deferred', 'needs_access', 'unavailable')),
    metadata_access_status text NOT NULL DEFAULT 'pending'
        CHECK (metadata_access_status IN ('approved_public', 'metadata_only', 'pending', 'restricted')),
    freshness_days integer CHECK (freshness_days IS NULL OR freshness_days > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hub.datasets (
    dataset_id text PRIMARY KEY,
    source_id text NOT NULL REFERENCES hub.sources(source_id),
    source_dataset_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    category text,
    owner text,
    source_url text NOT NULL,
    modified_at timestamptz,
    metadata_access_status text NOT NULL DEFAULT 'pending'
        CHECK (metadata_access_status IN ('approved_public', 'metadata_only', 'pending', 'restricted')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    harvested_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id, source_dataset_id)
);

CREATE TABLE IF NOT EXISTS hub.resources (
    resource_id text PRIMARY KEY,
    dataset_id text NOT NULL REFERENCES hub.datasets(dataset_id) ON DELETE CASCADE,
    source_resource_id text NOT NULL,
    name text NOT NULL,
    format text,
    resource_url text,
    access_status text NOT NULL DEFAULT 'pending'
        CHECK (access_status IN ('approved_public', 'metadata_only', 'pending', 'restricted', 'internal')),
    declared_license text,
    license_url text,
    project_publication_approved boolean NOT NULL DEFAULT false,
    grain text,
    source_updated_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    active_run_id uuid,
    UNIQUE (dataset_id, source_resource_id)
);

CREATE TABLE IF NOT EXISTS hub.sync_runs (
    run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id text NOT NULL REFERENCES hub.sources(source_id),
    resource_id text REFERENCES hub.resources(resource_id),
    kind text NOT NULL CHECK (kind IN ('metadata', 'numeric')),
    status text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    source_retrieved_at timestamptz,
    records_read integer NOT NULL DEFAULT 0 CHECK (records_read >= 0),
    records_written integer NOT NULL DEFAULT 0 CHECK (records_written >= 0),
    records_quarantined integer NOT NULL DEFAULT 0 CHECK (records_quarantined >= 0),
    payload_sha256 text,
    adapter_version text,
    error_code text,
    UNIQUE (resource_id, run_id)
);

CREATE TABLE IF NOT EXISTS hub.locations (
    location_id text PRIMARY KEY,
    source_id text NOT NULL REFERENCES hub.sources(source_id),
    kind text NOT NULL CHECK (kind IN ('country', 'province', 'district', 'subdistrict', 'station', 'reservoir', 'grid')),
    native_code text NOT NULL,
    name text NOT NULL,
    parent_location_id text REFERENCES hub.locations(location_id),
    province_code text,
    crosswalk_version text,
    UNIQUE (source_id, kind, native_code)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'resources_active_run_fkey'
          AND conrelid = 'hub.resources'::regclass
    ) THEN
        ALTER TABLE hub.resources
            ADD CONSTRAINT resources_active_run_fkey
            FOREIGN KEY (resource_id, active_run_id)
            REFERENCES hub.sync_runs(resource_id, run_id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS hub.observations (
    resource_id text NOT NULL REFERENCES hub.resources(resource_id),
    run_id uuid NOT NULL,
    row_key text NOT NULL,
    series_key text NOT NULL,
    period_start date,
    period_end date,
    period_label text,
    location_id text REFERENCES hub.locations(location_id),
    location_code text,
    location_kind text CHECK (location_kind IS NULL OR location_kind IN ('country', 'province', 'district', 'subdistrict', 'station', 'reservoir', 'grid')),
    location_name text,
    province_code text,
    crop_code text,
    crop_name text,
    metric_id text,
    metric_name text,
    product text,
    grade text,
    market text,
    unit text,
    value numeric,
    dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_row_ref text,
    quality_status text NOT NULL DEFAULT 'unknown',
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (resource_id, run_id, row_key),
    FOREIGN KEY (resource_id, run_id)
        REFERENCES hub.sync_runs(resource_id, run_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS datasets_search_idx
    ON hub.datasets USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(owner, '')));
CREATE INDEX IF NOT EXISTS datasets_source_category_idx ON hub.datasets(source_id, category, title);
CREATE INDEX IF NOT EXISTS resources_dataset_access_idx ON hub.resources(dataset_id, access_status);
CREATE INDEX IF NOT EXISTS sync_runs_source_latest_idx ON hub.sync_runs(source_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS observations_series_period_idx ON hub.observations(series_key, period_start, row_key);
CREATE INDEX IF NOT EXISTS observations_resource_run_idx ON hub.observations(resource_id, run_id, period_start, row_key);
CREATE INDEX IF NOT EXISTS observations_province_crop_idx ON hub.observations(province_code, crop_code, period_start);

REVOKE ALL ON ALL TABLES IN SCHEMA hub FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA hub TO hub_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hub TO hub_sync;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA hub
    GRANT SELECT ON TABLES TO hub_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA hub
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hub_sync;

COMMIT;
