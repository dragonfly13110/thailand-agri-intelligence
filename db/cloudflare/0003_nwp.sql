-- 0003_nwp.sql — TMD HPC NWP gridded forecast tables for Cloudflare D1 (SQLite).
--
-- Numbering: 0002_observation_extensions.sql (Round 1, observation contract
-- extensions) already claimed the 0002 slot, so the NWP migration follows it
-- as 0003_nwp.sql. It still only depends on 0001_hub.sql.
--
-- Purpose: store the gridded model forecasts of the Thai Meteorological
-- Department HPC Data Download Center (https://hpc.tmd.go.th, domain d02 /
-- "Thailand 3km") in dedicated `nwp_*` tables.
--
-- Governance: a forecast is NOT an observation. Values published here must
-- never be written into the `observations` table (see src/tadih/quality.py:
-- "forecast/scenario must be stored separately from observations" and
-- AGENTS.md rule 4). `license_status` stays 'pending' and `unit` stays NULL
-- until TMD confirms definitions/licence in writing.
--
-- Follows db/cloudflare/0001_hub.sql (same D1 conventions: TEXT identifiers,
-- validated JSON TEXT columns, ON DELETE CASCADE, INTEGER booleans).
-- The DDL body below is copied verbatim from
-- docs/assignments/2026-10-26-tmd-hpc-nwp-integration.md §3.5.
--
-- Additive change (Round 2 / Lane C, `scripts/sync_tmd_hpc_nwp.py`):
--   nwp_runs.payload_sha256 — SHA-256 of the canonical export payload, used to
--   detect an identical republication (`skipped_identical`).
--   nwp_province_values.cell_count — number of 0.15 degree grid cells inside
--   the province watchlist radius. Section 3.4 requires `cell_count` to be
--   stored and section 4 exposes it as `cellCount`, but the section 3.5 DDL
--   has no column for it, so it is added here. No column is renamed, removed
--   or retyped.
--
-- Applied through Wrangler's D1 migration workflow (this file follows
-- 0001_hub.sql and 0002_observation_extensions.sql).

CREATE TABLE nwp_runs (
  run_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  init_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  license_status TEXT NOT NULL,
  unit_status TEXT NOT NULL,
  publication_mode TEXT NOT NULL
    CHECK (publication_mode IN ('numeric_preview', 'metadata_only')),
  variables_json TEXT NOT NULL CHECK (json_valid(variables_json)),
  lead_hours_json TEXT NOT NULL CHECK (json_valid(lead_hours_json)),
  grid_json TEXT NOT NULL CHECK (json_valid(grid_json)),
  manifest_sha256 TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'partial', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- additive (R2-C): canonical export payload hash for idempotent republish
  payload_sha256 TEXT
);

CREATE TABLE nwp_snapshots (
  run_id TEXT NOT NULL REFERENCES nwp_runs(run_id) ON DELETE CASCADE,
  variable TEXT NOT NULL,
  valid_at TEXT NOT NULL,
  unit TEXT,
  bbox_json TEXT NOT NULL CHECK (json_valid(bbox_json)),
  nx INTEGER NOT NULL,
  ny INTEGER NOT NULL,
  mean_json TEXT NOT NULL CHECK (json_valid(mean_json)),
  max_json TEXT NOT NULL CHECK (json_valid(max_json)),
  quality_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(quality_json)),
  PRIMARY KEY (run_id, variable, valid_at)
);

CREATE TABLE nwp_province_values (
  run_id TEXT NOT NULL,
  variable TEXT NOT NULL,
  valid_at TEXT NOT NULL,
  province_code TEXT NOT NULL,
  province_name TEXT NOT NULL,
  value REAL,
  method TEXT NOT NULL,
  radius_km REAL,
  distance_km REAL,
  risk_level TEXT,
  -- additive (R2-C): grid cells inside the province watchlist radius
  cell_count INTEGER,
  PRIMARY KEY (run_id, variable, valid_at, province_code),
  FOREIGN KEY (run_id, variable, valid_at)
    REFERENCES nwp_snapshots(run_id, variable, valid_at) ON DELETE CASCADE
);

CREATE INDEX nwp_runs_init_idx ON nwp_runs(init_at DESC);
CREATE INDEX nwp_province_lookup_idx
  ON nwp_province_values(run_id, variable, valid_at, province_code);
