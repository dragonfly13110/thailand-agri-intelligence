# DOF annual aquatic production staging

Verified 22 October 2026 from official package `dofd07_05_0101_02`, https://catalog.fisheries.go.th/api/3/action/package_show?id=dofd07_05_0101_02 .

## Verified source definitions

- Dataset describes annual saltwater/freshwater aquatic production quantity and value, by aquatic animal group. Official `geo_coverage` is ประเทศ (national).
- Quantity resource `42c751e0-0569-4df6-9580-a0f80c123b0f` explicitly declares `resource_unit_of_measure=พันตัน` (thousand tonnes).
- Value resource `87357769-f93c-482d-adb2-2c83c49bf3c6` explicitly declares `resource_unit_of_measure=ล้านบาท` (million THB).
- Each datastore returned exactly 27 records, equal to exact reported total, Buddhist years 2541–2567. Both contain total plus nine animal-group columns. Staging preserves each separately and marks totals; never add total to components. These are national statistics, not provincial or port observations.
- Source describes annual statistics but does not establish calendar versus fiscal reference year in the retrieved metadata. `reference_year_convention` remains `unverified`; CE labels are BE minus 543 only.
- Catalog declares `Open Data Common`, `data_category=ข้อมูลสาธารณะ`, access unrestricted, but `isopen=false`. These declarations do not constitute project approval. All rows remain `pending`, `rollup_eligible=false`.
- `resource_data_release_calendar=2026-06-24` and resource modification dates apply to the currently retrieved resource version. They do not establish historical availability for every year. `release_at` and `issue_at` remain null for staged rows, and this data cannot certify historical as-of backtests.

## Callable and evidence

`tadih.fisheries.capture_fisheries(output_dir)` fetches official metadata and two fixed resources, validates units/scope/schema/completeness, writes immutable snapshots using the existing writer, and returns `{captures, rows}`. Each resource request is bounded at 100 records; if the resource exceeds that limit it fails explicitly rather than silently accepting a partial page. No warehouse or public export is written.

Live staging has 540 rows (27 years × 10 groups × 2 metrics), stored at `data/local/source-expansion/dof-production-staged.json`. Snapshot manifests:

| Local directory below `data/local/raw/dof/` | Canonical SHA-256 |
|---|---|
| `production-metadata/` | `8b155acc95f9b92862ab0291caba2173956cbf781f1e248dc8fd66d9799e75e0` |
| `production-quantity/` | `ad6456a3eecbdda3e9ad4e2cbbdcde25c4b9fbdd8a8e746a0fe56dcdab2d2c83` |
| `production-value/` | `fd1a3ed2e855ef8df25671a389fa6e36f8ae87916b800671c06fd156c2aca1fd` |

Focused tests: `.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -p test_fisheries.py -q`. Tests cover native units, null versus zero, total tagging, incomplete responses, changed scope/schema and invalid values.

Next: confirm annual reference conventions and publication terms with official documentation; collect historical release/revision evidence before warehouse analytical joins or forecast evaluation. BI remains deferred.

CLI integration verified locally: `python -m tadih dof-production`. This command saves derived staging beside local raw captures and prints only paths/counts/status; it does not import the warehouse.
