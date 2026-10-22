# LDD rice zoning staging

Verified 22 October 2026 from official package `lpd`: https://lddcatalog.ldd.go.th/api/3/action/package_show?id=lpd . No warehouse import, public values or map were produced.

## Live evidence and definitions

- Rice provincial resource `7f508d88-3c31-4cad-b95a-68ca0ce89356` returned 77 records, matching the exact datastore total. All province names are unique in this response. Four source columns, `ข้าว_S1`, `ข้าว_S2`, `ข้าว_S3`, `ข้าว_N`, become 308 staged values. Province names remain verbatim, including source Unicode spelling, and `province_id` remains null until crosswalk review.
- Package description defines S1 high suitability, S2 moderate, S3 marginal and N unsuitable. Resource title explicitly states provincial statistics, although package-level geography says subdistrict. Staging follows the provincial resource grain; no district-level attribution is inferred.
- Neither the provincial CSV headers nor retrieved resource metadata identifies the numeric unit or survey year. The package's polygon dictionary describes both `Area` (square metres) and `Rai` (rai), but does not map either to these provincial CSV columns. Therefore `unit`, `reference_year` and `release_at` remain null. Modification dates are preserved in raw metadata and never substituted for survey year.
- Package declares Creative Commons Attribution No-Derivs and `isopen=false`. Dictionary field `ขอบเขตการเผยแพร่` says ระหว่างหน่วยงาน (between agencies). These declarations require terms review; every staged row remains `pending`, `rollup_eligible=false`, with `semantics_status=unit_and_survey_year_unverified`. No publication rights are inferred from successful anonymous access.
- Resource metadata says `datastore_contains_all_records_of_source_file=false`. A separate download of its linked CSV yielded 77 source rows and an exact ordered match of all five CSV columns against the current datastore response. That comparison proves consistency for this captured version only. It does not override the metadata flag or certify national completeness beyond the returned 77 names.

## Callable and local files

`tadih.land.capture_rice_zoning(output_dir)` makes three bounded requests (package, dictionary, statistics), writes immutable snapshots using the existing writer and returns `{captures, rows}`. Statistics reject incomplete/estimated totals, more than 100 records, unexpected columns, duplicate province strings and invalid values. Missing stays null and zero stays zero. Dictionary/metadata are evidence, not authority to fill missing semantic fields.

Live staging: `data/local/source-expansion/ldd-rice-zoning-staged.json`. Snapshot manifests under `data/local/raw/ldd/`:

| Directory | Canonical SHA-256 |
|---|---|
| `rice-zoning-metadata/` | `b858ac8a087c24d9c8e48ddf9be3fde9f2df36e1e64519d74797ab588d78a3e7` |
| `rice-zoning-dictionary/` | `74aedac4f7e8d999d43da094e935d3ea1e81ec31ca2ce4f8b1ae1949f26425f8` |
| `rice-zoning/` | `f37fb276b6fbbd79c1f64e2588dc8d83d4437cb9321b7fafbe78bb8489a158c3` |

Original CSV: `data/local/source-expansion/ldd-zoning-source.csv`, SHA-256 `f34e712013b806f4180594bbcec07a0b02adee4a7cf6ebb6b88c269899fdb799`. Comparison: `data/local/source-expansion/ldd-csv-datastore-comparison.json`. Dictionary raw also at `data/local/source-expansion/ldd-zoning-dictionary.json`.

Focused tests: `.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -p test_land.py -q` (2 tests). Next: verify the provincial CSV unit, survey date/version, current-name crosswalk and permitted derivation/publication before analytical imports. BI remains deferred.
