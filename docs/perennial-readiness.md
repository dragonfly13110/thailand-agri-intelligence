# DOAE perennial staging readiness

Reviewed 22 October 2026 (Asia/Bangkok), using local immutable source and staging artifacts only. This is a readiness audit, not approval to aggregate or publish. No raw production amounts, area values, prices, or row-level source payloads are included in this document.

## Evidence and scope

Detailed pending data remain in `data/local/probes/perennial-readiness.json`; the name crosswalk is `data/local/probes/perennial-admin-crosswalk.csv`. The audit reused `geography.production_crosswalk`, `parse_dopa_workbook` and `match_admin_names`, matching province, district and subdistrict under their actual parent. Raw/staging/quarantine hashes were verified against the staging inventory before review.

The raw source hash is `996e6e16e866d7720fedf860afafd77cec62f8bf3dd19ede426efe3c1ed33f9d`; the DOPA workbook hash is `5977e39e689d229668dabb2ff47f1a1a4bec341bd1efa0792cb45cad8e16d6e9`, version 2023-09-01. Detailed row numbers, conflicting fields, negative-cell evidence and unresolved administrative labels are recorded locally.

## Administrative readiness

| Scope | Records | Matched DOPA snapshot | Unmatched |
|---|---:|---:|---:|
| Numerically valid staging | 54,192 | 54,186 | 6 |
| Numeric quarantine | 3 | 3 | 0 |
| All source rows | 54,195 | 54,189 | 6 |

The valid staging has 7,094 unique province/district/subdistrict label tuples. One tuple fails at subdistrict level; its six records share a source label marked as retired. The audit found a retired-name candidate under the same district after removing the source retirement marker for inspection only. That candidate was not substituted into the active crosswalk. Province and district parent matching had succeeded for these records.

A match to the 2023-09-01 workbook is a name match to that snapshot. It does not certify historical boundary validity, effective start dates, current 2026 geography, or a safe rollup of source areas.

## Repeated grain identities

All five repeated identities are conflicting, not identical. Each group has two source rows, for ten affected records and five extra records beyond unique keys. Three groups differ only in total standing area. Two groups differ in bearing area, standing area, production and average price. Group/type/variety and administrative labels plus year are identical within each pair.

The source header has no month or planting-round column to distinguish these pairs. No explanation establishing separate legitimate subperiods, reporting categories or a superseding correction was found in the local resource metadata. Row order does not establish revision order. Retain both rows and the conflict flag; do not average, sum, deduplicate by choosing the last row, or treat either value as a confirmed correction.

## Numeric quarantine

Three rows contain four negative area cells. One row has both a negative bearing area and negative standing area; two rows each have a negative bearing area. All three administrative tuples match the DOPA snapshot. The numeric issue therefore remains independent of administrative mapping. The file parsed correctly; these are source values that violate the non-negative area contract, not missing-value tokens or encoding failures.

Raw rows and reasons remain in quarantine. No replacement, zero fill, sign reversal or inferred correction was applied. Obtain a source correction or explicit field definition before admitting these rows as valid measurements.

## Remaining gates

- Resolve five conflicting identity groups through source definitions or a documented version correction.
- Resolve three numeric quarantine rows through source evidence.
- Review the retired subdistrict labels and period boundaries without guessing an active replacement.
- Confirm exact licence/version and intended reuse terms; pending status remains in force.
- Keep `rollup_eligible=false` until these issues and annual measure semantics are resolved.

Readiness count reconciliation passed for all 54,195 source rows. This review made no production-module changes, warehouse writes, aggregations, publication decisions or commits.
