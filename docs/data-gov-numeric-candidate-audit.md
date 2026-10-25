# M4 candidate: OAE plant and feed crop export data

Reviewed official data.go.th catalog metadata on 25 October 2026. No resource payload was downloaded or opened.

## Candidate

- Dataset: [ปริมาณส่งออกพืชและพืชอาหารสัตว์](https://data.go.th/dataset/exp-plantfeed)
- Dataset ID: `33173bdf-d141-402a-81ec-56210a3f8d74`
- Candidate resource: CSV `ปริมาณส่งออกพืชและพืชอาหารสัตว์`, resource ID `4396c2a2-5868-4ca1-b2fa-8698d5b07e7e`
- Publisher shown by the catalog: Office of Agricultural Economics (OAE). The catalog says the source is import/export data from the Customs Department, processed by OAE.
- Catalog license label: `Creative Commons Attributions`; access condition says there is no access restriction. The catalog page does not show a license version, license URL, or resource-level license record.

## Data definition visible in catalog metadata

- Format: `text/csv`; an accompanying data-dictionary resource is listed.
- Period: Buddhist years 2563–2565. Content last updated `2023-01-01`; released `2023-01-31`. Catalog metadata was updated `2026-07-13`, which is not evidence that the observations were refreshed.
- Fields shown in the catalog preview: `_id`, `year_th`, `trade_type`, `hs_code`, `hs_des`, `hs_subdes`, `attribute`, `value`, `unit`.
- Units shown: baht and kilograms. Geography is listed as none; the series therefore cannot support provincial comparisons.
- Likely grain, inferred from the listed fields: year × trade type × customs HS code × attribute. Confirm against the data dictionary before writing an adapter.
- Semantic conflict: the dataset title and summary describe exports, while the resource description says imports. The `trade_type` field may distinguish them, but the definition still needs confirmation from OAE.

## M4 verdict

**Candidate for follow-up, not approved for publication or M5.** This resource has a named CSV, a catalog preview of its schema, a stated period and units, and a package-level CC Attribution label. The license version and link are missing, the source is attributed to Customs and processed by OAE, and the export/import descriptions conflict. The last observation year is 2565, and geographic coverage is absent.

Before changing `config/resource_licenses.json`, request written confirmation from OAE (and Customs if required) covering the applicable license/version, attribution text, redistribution and derivative use, plus the export/import meaning and data-dictionary definition of `value` and `unit`. Keep `license_status=pending` until that evidence is recorded. If confirmed, present only as a historical national trade series, not a provincial price or production measure.

## Evidence and limits

- [Official data.go.th dataset page](https://data.go.th/dataset/exp-plantfeed) was inspected on 25 October 2026 for package/resource identifiers, license label, periods, units, source, listed fields and catalog preview.
- The data.go.th page identifies OAE's agricultural information center as contact and lists `prcai@oae.go.th`.
- The CKAN API request from this environment timed out after 20 seconds. The HTML page and its indexed catalog preview were available; the CSV and data dictionary were not opened. No data values were copied into this report.
- This audit does not certify numeric accuracy, completeness, current availability, or rights in Customs source records.
