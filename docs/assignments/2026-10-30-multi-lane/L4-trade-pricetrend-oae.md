# Lane L4 — Real OAE numbers on `/trade` and the price-trend page

Date: 2026-10-30 · Owner lane: L4 · Scope: two approved OAE resources, existing `observations` schema, zero D1 writes.

## 1. What changed and why

The two approved registry rows are:
- `oae_agricultural_exports` — grain `product × opaque source-year label`, unit `ล้านบาท`, display category `การส่งออก`.
- `oae_nabc_monthly_jasmine_paddy_price` — monthly jasmine paddy price, country average, `บาท/ตัน`.

Investigation showed the **exports write + read paths already existed** (tracked in git, unchanged by me). The real gap was the **jasmine monthly write path** and the `sample` flag on the trade read envelope.

Changes made (all inside owned files):

1. `web/lib/hub/oae-trade-data.ts` (MODIFIED — only two lines): added `sample: false` to the `OaeTradeData` type and to the `baseData` object, so `/trade` and `/api/v1/trade/oae` present real D1 rows as non-sample. Nothing else touched (opaque-year handling, provenance, `availability`, nulls, honest empty states were already correct). `git diff` = exactly the two `sample: false` additions.
2. `src/tadih/oae_paddy_price.py` (NEW): bounded fetch + strict normalization of the pinned NABC monthly endpoint. Single GET, 256 KiB cap, 12 s timeout, redirect handler that refuses off-site hops. Rejects unexpected product/unit/week/scope, Buddhist-year and month format errors, duplicate `(year_th, month)`, non-numeric values, unsuccessful envelopes, and unreviewed URLs. Missing markers → `None` (never `0`).
3. `src/tadih/ingest_oae_paddy_price_d1.py` (NEW): adapter reusing the shared `observations` writer. `RESOURCE_KEY=oae_nabc_monthly_jasmine_paddy_price`, datasets category `"prices"`, `period_grain="monthly"`, location `country`/`TH00`/`ประเทศไทย`, product `ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15`, unit `บาท/ตัน`, measure `monthly_jasmine_paddy_price`. All-or-nothing: aborts before any DB write if the writer plan is empty or any row is quarantined. Auto-discovered by `tadih ingest --adapter oae_paddy_price` (CLI name pattern; no shared `cli.py` edit). `--date` rejected (months come from source fields).
4. `tests/fixtures/oae_trade/nabc_monthly_jasmine_2569.json` (NEW): genuine trimmed capture — 3,805 bytes, envelope `pagination {limit:100, offset:0, page:1, count:8, total:189}`, first row `2569|09|TH00|ประเทศไทย|16545.45|บาท/ตัน`.
5. `tests/test_oae_paddy_price.py` (NEW, 16 tests) and `tests/test_ingest_oae_paddy_price_d1.py` (NEW, 6 tests).
6. `web/tests/lane-l4-trade-pricetrend.test.ts` (NEW, 3 tests).

No migration needed: the adapter writes through the existing `observations`/`datasets`/`resources`/`sync_runs` schema. This is proven by the writer test which runs against a SQLite client created from `db/cloudflare/0001_hub.sql` **only** (no new columns).

### Read paths (deliverable 2)
- `/trade` (`web/app/trade/page.tsx` → `loadOaeTradeEnvelope()` → `OaeTradeDashboard`) already surfaces the exports resource with provenance, `availability`, and now `sample:false`. Year labels stay opaque: `period_label` is rendered verbatim (e.g. `2568`), `dataAsOf` is null, no date is invented from a year token.
- The price-trend page (`web/components/price-trend.tsx` via `/explore?view=price_trend`) is a generic reader over `/api/v1/datasets?category=prices`. Because the jasmine adapter writes under category `"prices"` with the same `observations` shape, it lights up automatically once D1 has rows — gated by `access_status='approved_public' AND project_publication_approved=1 AND activeRunId`. It renders `periodLabel || periodStart`, product, unit, value, qualityStatus. Left untouched.
- The legacy static `/api/v1/trade` (`web/lib/hub/trade-data.ts`) was deliberately NOT rewired: `buildTradeDashboard` is asserted by the SHARED test `web/tests/phase2-weather-crops-soil.test.ts`, so editing it would break a non-owned test.

## 2. Exact OAE resources, licence status, bounded-read evidence

Both from `config/resource_licenses.json`; publication bases differ and are enforced by the SHARED `web/tests/governance-containment.test.ts` (passing 10/10):

- `oae_agricultural_exports` — `resource_id 05a5c2b7-f43b-4232-b7ae-04aca5c63329`, `dataset_id 990f9c44-...`, URL pinned to `sta_cai10_cai_exp1.csv`. `license_status: approved_public`, `review_outcome: owner_authorisation_under_agents_md_rule_3_..._source_license_unverified`, **in** `owner_authorisation.approved_resource_keys`, `commercial_use_confirmed: false`, source licence/redistribution/commercial terms unverified.
- `oae_nabc_monthly_jasmine_paddy_price` — `resource_id 4570daca-e727-4036-bde9-35fd84d0ffd4`, `dataset_id 93ac1a96-...`, pinned NABC `monthly-prices/product?product_name=ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15&page=1`. `license_status: approved_public`, `review_outcome: auto_approved_open_noncommercial`, `publication_authorization.basis: open_license_policy` (config/publication_policy.json §3), **deliberately NOT** in `owner_authorisation.approved_resource_keys`, declared licence CC Attributions Non-Commercial, `commercial_use_confirmed: false` (non-commercial). The writer's fail-closed gate (`assert_resource_approved`) reads only `license_status=='approved_public'` + `project_publication_approved==True`, both true.

Bounded live read (this lane, dry-run only, `written:false`, 1 request):
`mode dry_run · rowsReceived 100 · upstreamTotalRows 189 · observedMonthRange [2018-06, 2026-09] · missingValues 0 · contentSha256 a364408d38d3fe43b35fa48441366f11c15ef6bfbdac6bec2dc18cbc7bfb6b7e · payloadSha256 2fd73bf91e383bed577dffda8c4e7253de50cfa8f8db4c8b68a19caf03a13a6c · writerValidationStatus valid · unit บาท/ตัน · retrievedAt 2026-10-30T11:24:05Z`.
`pageFollowed:false` → only the 100 most-recent evidenced months are captured; ~89 older months sit on un-followed pages and are NOT claimed.

## 3. Test commands and pass counts (all green this session)

- `PYTHONPATH='src;.' ./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_oae_trade tests.test_ingest_oae_trade_d1 tests.test_oae_paddy_price tests.test_ingest_oae_paddy_price_d1 -q` → `Ran 63 tests ... OK`
- `... -m unittest tests.test_oae_paddy_price -q` → `Ran 16 tests ... OK` (parser)
- `... -m unittest tests.test_ingest_oae_paddy_price_d1 -q` → `Ran 6 tests ... OK` (writer, schema-0001-only SQLite)
- `cd web && node --experimental-strip-types --test tests/lane-l4-trade-pricetrend.test.ts` → `pass 3 fail 0`
- `cd web && node --experimental-strip-types --test tests/oae-trade.test.ts` → `pass 6 fail 0` (existing test still passes after `sample:false`)
- `cd web && node --experimental-strip-types --test tests/governance-containment.test.ts` (SHARED, read-only check) → `pass 10 fail 0`

Writer test asserts on `0001_hub.sql`-only DB: 8 rows written; `period_start 2026-09-01` / `period_end 2026-09-30` / `period_label 2026-09`; value 16545.45; `location_kind country`; `location_name ประเทศไทย`; resource `approved_public`; datasets.category `'prices'`; missing value stays null not 0; a rejected row aborts with `client.queries==0`; unapproved resource raises `ObservationWriteError`.

## 4. What remains sample / unknown

- `web/lib/hub/trade-data.ts` + `/api/v1/trade` + `trade-dashboard.tsx` are still the legacy static/empty surface — untouched by design (shared-test dependency). Real exports data flows only through `/api/v1/trade/oae` + `/trade`.
- Whether `/trade` and price-trend actually show numbers depends on D1 rows existing; the pipeline is validated end-to-end only against SQLite fixtures + one live dry-run. No D1 was written (zero-write rule honoured).
- Jasmine `commercial_use_confirmed: false` (non-commercial licence) and exports source-licence unverified — display-only, no commercial reuse.
- Exports unit is `ล้านบาท` (source-reported); no currency/date derivation is performed.

## 5. Risks

- **Zero rows in D1 → honest empty state**, not numbers. The read paths return `availability` reflecting empty/metadata_only; the pages must show empty state, never fabricated data.
- **Pagination**: only 100 recent months are ingested per run; a naive reader assuming "full history" would be wrong. `upstreamTotalRows` (189) is carried in the summary for transparency.
- **Shared governance invariant**: jasmine must remain OUT of `owner_authorisation.approved_resource_keys` and keep `publication_authorization.basis=open_license_policy`; any registry edit could flip `governance-containment.test.ts` red.
- Concurrent agents own overlapping `web/lib/hub/` files; L4 touched only `oae-trade-data.ts` (2 lines) + new lane test.

## 6. Orchestrator action needed

1. Run the two ingest writes against D1 (this lane ran dry-run only):
   - `tadih ingest --adapter oae_trade` then re-run with `--write`
   - `tadih ingest --adapter oae_paddy_price --write`
2. Verify both pages light up with real rows + `sample:false`: `/trade` (exports) and `/explore?view=price_trend` (jasmine, category `prices`).
3. Decide whether to also rewire the legacy `/api/v1/trade` static route — deferred here to avoid breaking the SHARED `phase2-weather-crops-soil.test.ts`; needs an owner-approved refactor + test update.
4. Confirm publication posture: exports = owner-attestation (source licence unverified); jasmine = open-license non-commercial, **not** owner-attestation. Both `commercial_use_confirmed:false`.
5. At the integration gate (#9): re-run `governance-containment.test.ts` + this lane's suites; do not move jasmine into the owner-authorisation list.
