# Python integration tests requiring private local data

The ordinary Python unit suite stays offline and uses synthetic fixtures. The
integration directory has no `__init__.py`, so the repository's default
`python -m unittest discover -s tests -v` does not recurse into it. Run these
opt-in checks separately from the repository root:

```powershell
python -m unittest discover -s tests/integration -v
```

The checks read owner-provided files under `data/local/`; that directory is
ignored by Git and must not be copied into commits or shared artifacts. Missing
inputs are reported as skipped with their required paths.

Prerequisites by check:

- `test_live_data_audits.CoverageInventoryIntegrationTests` requires
  `data/local/doae-p0/p0-run.json`, `data/local/doae-p1/p1-run.json`,
  `data/local/doae-p2/p2-run.json`, and
  `data/local/doae-archives/archive-run.json` with the reviewed current audit
  snapshot.
- `PlanReconciliationIntegrationTests` requires `data/local/doae-p0/p0-run.json`
  and the `records.jsonl` files referenced by the unique 2569 plan and result
  entries, with their recorded SHA-256 values intact.
- `TemporalCrosswalkIntegrationTests` requires
  `data/local/doae-geography/subdistrict-crosswalk.csv` from the reviewed
  acquisition run.
- `NationalWarehouseIntegrationTests` requires the current audit probes
  `data/local/probes/{coverage-inventory,project-register-audit,spatial-evidence-audit,plan-actual-reconciliation}.json`,
  plus `data/local/production/doae_crop_master.json`,
  `data/local/water/dwr_small_water_resources.json`,
  `data/local/weather/{dim_weather_stations,fact_daily_weather}.json`, and
  `data/local/satellite/{gistda_flood_7days,hii_monthly_flood_risk}.json`.
- `LocalArtifactIntegrationTests` requires its named private inputs:
  `data/local/satellite/pc_point_20240929.json`,
  `data/local/probes/historical-monthly-inventory.json`, and
  `data/local/geography/ddpm_province.geojson` respectively.
- `AreaEvidenceSnapshotIntegrationTests` requires
  `data/local/tadih.duckdb` and reviewed records under
  `data/local/production/staged/*/records.jsonl` and
  `data/local/production/perennial-staged/*/records.jsonl`. Its exact counts
  describe the reviewed snapshot and may need a deliberate update after that
  snapshot is replaced.
- `SpatialEvidenceSnapshotIntegrationTests` requires the two reviewed DOAE P0
  source files:
  `data/local/doae-p0/raw/ab68661c-52d7-4cdc-86b6-efdaf92a785e/9822798cfa03fd43f26eb887f31e55df3c9d8f366450c5af740ef39a62a42819.csv` and
  `data/local/doae-p0/raw/9e118afd-62fc-47ce-95b0-f47dcaee5721/e4833bb6d69c5b4cf08e7c2b0636b261489b01845cadfd5aed9d89b9f1e5206d.csv`.
- `DataSharingSnapshotIntegrationTests` requires the four DOAE coverage
  manifests listed above and those same two DOAE P0 source files. The audit
  writes derived probes and a sample bundle under ignored `data/local/probes/`
  and `data/local/feeds/sample_bundle/`.
- `test_dax_simulation.py` requires one offline Power BI data folder at
  `data/local/powerbi/offline-v13/Data`, `offline-v12/Data`, or
  `offline-v11/Data`, containing the CSV tables used by the simulation.

These assertions validate the recorded real-data audit and are not part of the
offline unit suite. The unit suite independently checks aggregation, native
grain, license state, null handling, filters, and warehouse-facing contracts
using small synthetic data.
