# DOAE period semantics and NABC release lineage review

Reviewed 22 October 2026 (Asia/Bangkok). Scope: B1/B2 official metadata, not permission approval or historical as-of certification. No data/config flags changed.

## Reproducible evidence

Live bodies and capture metadata are local only: `data/local/probes/lineage-review-20261022/manifest.json`. Each successful body has URL, retrieval timestamp and SHA-256; failed requests are retained as failures. HTTP dates and metadata modification times are transport/catalog evidence, not observation publication times.

## DOAE: month and planting round remain unresolved

The [official package metadata](https://ckan.doae.go.th/api/3/action/package_show?id=production_doae) describes annual subdistrict crop areas and quantities, with yearly update frequency and source `ระบบสารสนเทศการผลิตทางด้านการเกษตร`. It supplies four data resources, no separately listed data dictionary. The [production system](https://production.doae.go.th/service/site/login) returned a login form; no authenticated report definitions were inspected. Definitions from the farmer registration system would not establish meanings in this different source.

| Metadata scope | Declared value | Interpretation |
|---|---|---|
| Dataset `data_release_calendar` | 2024-04-18 | Dataset declaration, not row/version release |
| Short-lived crops 2566 resource `resource_data_release_calendar` | 2024-06-17 | Resource declaration, no original publication archive/hash linkage |
| Same resource `resource_last_updated_date` | 2023-01-01 | Catalog field, not harvest date or immutable release |
| Dataset `metadata_created` | 2026-09-01T12:23:28.448351 | Catalog record creation |
| Same resource year range | 2566 to 2566 | Does not explain 2567 rows already found in staged CSV |

These declarations differ in scope and time and do not establish when each current revised value first became available. Keep `release_at=null`; keep month as a source period marker and planting rounds 0/1/2 as uninterpreted labels. Do not declare annual totals, planting/harvest months, or official crop seasons from these fields.

Additional exact resource leads (not imported by this review):

| Resource | ID | Transport | Declared calendar |
|---|---|---|
| ข้อมูลภาวะการผลิตพืชอายุสั้น ระดับตำบล ปี 2566 | `f9ab6055-6364-4f78-812e-15989e300979` | text/csv | 2024-06-17 |
| ข้อมูลภาวะการผลิตพืชอายุยาว ระดับตำบล ปี 2566 | `61f3f241-92c7-4cdc-9918-41ce73545268` | text/csv | 2024-06-17 |
| ข้อมูลภาวะการผลิตพืชอายุสั้น ระดับตำบล ปี 2567 | `0719c5ce-108c-4373-93e8-6b27a9176c5e` | application/rar | 2025-01-01 |
| ข้อมูลภาวะการผลิตพืชอายุยาว ระดับตำบล ปี 2567 | `a130f9e0-0795-4ac8-8daf-008c686c484d` | application/rar | 2025-01-01 |

The 2567 resources declare CSV format while their MIME/URLs identify RAR archives. Validate actual archive contents before selecting a parser. All four inherit the dataset label `Open Data Common`; the exact licence variant/version is unresolved. Public accessibility does not grant project publication approval.

## OAE/NABC: resource-specific licence coverage expanded

[Official catalog search](https://catalog.oae.go.th/api/3/action/package_search?q=monthly_prices&rows=100) returned 12 matching datasets (count 12), each with one resource. Independently fetched all 12 `resource_show` records successfully. Each dataset declares `license_id=อื่นๆ`, `license_id_other=Creative Commons Attributions Non-Commercial`. No exact licence version/URL or row-level publication times were supplied in these reviewed metadata. The result is scoped to this catalog query; it does not establish complete NABC coverage.

| Dataset | Exact resource ID | Resource kind | Review outcome |
|---|---|---|
| [monthly_prices_pineapples](https://catalog.oae.go.th/dataset/monthly_prices_pineapples) | `55a07ec2-d778-4c17-8f96-b51f1638b262` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_rice](https://catalog.oae.go.th/dataset/monthly_prices_rice) | `4570daca-e727-4036-bde9-35fd84d0ffd4` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_beef](https://catalog.oae.go.th/dataset/monthly_prices_beef) | `77b9625d-af1b-4618-b42b-dabfd382a044` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_egg](https://catalog.oae.go.th/dataset/monthly_prices_egg) | `87be7c8e-72fe-425e-afe9-8d17041eb755` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_broiler-chicken](https://catalog.oae.go.th/dataset/monthly_prices_broiler-chicken) | `b0e9d7fa-4bf8-4346-9350-6390b49d32e5` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_rubber](https://catalog.oae.go.th/dataset/monthly_prices_rubber) | `7220a658-6ffb-41f4-b73c-171333d3c071` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_oil-plam](https://catalog.oae.go.th/dataset/monthly_prices_oil-plam) | `f110b1e1-6d31-43c1-a449-9f379afd4b16` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_coconut](https://catalog.oae.go.th/dataset/monthly_prices_coconut) | `a21f618a-8593-4440-ac96-1288b14f1493` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_cassava](https://catalog.oae.go.th/dataset/monthly_prices_cassava) | `2200afa5-2060-487a-92b8-6d3bb9726c50` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_vannamei-shrimp](https://catalog.oae.go.th/dataset/monthly_prices_vannamei-shrimp) | `e31b4ec6-1410-4a03-b735-2470b300a0b4` | OAE CSV | pending: NC label, version/project use unresolved |
| [monthly_prices_swine](https://catalog.oae.go.th/dataset/monthly_prices_swine) | `f21ad386-04b5-46cc-b764-e4ae8e9fadac` | NABC product API | pending: NC label, version/project use unresolved |
| [monthly_prices_maize](https://catalog.oae.go.th/dataset/monthly_prices_maize) | `aa8a0e38-f052-46d9-a1e0-6bf4c72cf99e` | NABC product API | pending: NC label, version/project use unresolved |

Eleven resources link directly to named NABC product APIs; shrimp links to an OAE-hosted CSV. This provides independent rights evidence for those exact linked products only. It does not transfer that label to the other monthly products, names inventories, daily/weekly endpoints, or production endpoint. No `approved_public` decision was made.

## Release lineage runtime check

The exact rice product resource URL returned HTTP 200: 100 rows on page 1, `pagination.total=189`, `limit=100`. All returned rows expose only `year_th`, `month`, `week`, `province_code`, `province_name`, `product_name`, `commod`, `subcommod`, `value`, `unit`. There is no row release/issue/revision timestamp in this capture. This was a page-level lineage check, not another full-history backfill.

Initial direct NABC frontend/document requests returned 403; retries with a browser User-Agent returned 200. Both attempts are recorded; the endpoint was accessible in the retry. Successful documentation page delivery alone does not establish timestamps for the observations. The live rice API response, catalog modification date, and retrieval time cannot certify historical as-of availability.

The [official farmgate report](https://daily-sheet.nabc.go.th/report/farmgate) was also captured successfully as a current display lead. Its current monthly display does not establish original release times of historical API rows.

## Concrete follow-up

1. Keep raw snapshots and revision hashes going forward; prospective captures establish what was seen at capture time, not original historical release times.
2. Before DOAE annual rollups, obtain a source-specific dictionary defining year/month, planting round codes, incremental versus cumulative areas/production, and the year-2567 rows in the 2566 resource. No external messages were sent.
3. Before public release, resolve exact licence URL/version, required credit, and intended non-commercial project-use scope for each linked resource; add these reviewed resource identities to the existing registry through the normal review process.
4. For historical as-of backtests, require dated version archives or immutable provider release records linked to the exact observation/version. Until then historical release time remains unknown and forecast certification remains gated.

## Integrity check

All 24 stored response bodies were rehashed against the capture manifest successfully. This validates stored evidence integrity only; no DAX, forecast accuracy or publication permission was tested.
