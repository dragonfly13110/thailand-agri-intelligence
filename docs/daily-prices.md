# NABC daily market-price sample

Verified 22 October 2026. The official frontend bundle `https://agriapi.nabc.go.th/main.eb4045b9bd8a7631.js` exposes `/api/daily-prices/product` with exact `product_name`, `page` and `limit` parameters. Documentation examples include API-token headers; this specific bounded request succeeded anonymously. That does not establish anonymous access or permission for all services.

## Actual sample

Selected source product: มะนาว ผลขนาดใหญ่พิเศษ. First page returned 100 records of advertised total 672, dated 2026-05-22 through 2026-10-22. `complete=false`: this is a sample, not complete daily history or continuous daily coverage. The source latest-date endpoint returned 2026-10-22, which is a data date, not an issue/release timestamp.

All sampled rows explicitly identify market ตลาดกลางหนองบ้วย, province เพชรบุรี and native unit บาท/ร้อยผล. These are prices at that named market, not a provincial average. No national/provincial spatial expansion or baht/kg conversion is performed. Market location is source text only, with no coordinate verification or canonical province ID assignment.

Neither these response fields nor the inspected API service definition establishes farmgate, wholesale or retail classification; `price_type` remains null. Product wording carries the stated size; no cross-frequency product matching or grade conversion is attempted. `observation_date` retains the source calendar date. `observed_at`, `release_at` and `issue_at` remain null because no intraday timestamps were provided. All values stay `pending` and `rollup_eligible=false`. No warehouse import or public data export was produced.

## Adapter and evidence

`tadih.daily_prices.capture_daily_prices(product_name, output_dir)` makes one bounded request, validates date agreement (Gregorian date against Buddhist year/day/month), pagination, finite nonnegative numeric prices, native units, market identity and duplicate keys. It saves immutable raw through the existing writer and returns `{manifest, rows, complete, total}`. Null remains null; zero remains zero. It intentionally captures one page until definitions pass review.

- Raw source response: `data/local/source-expansion/nabc-daily-page1.json`.
- Staging: `data/local/source-expansion/nabc-daily-staged.json` (built from that captured live response without another network request).
- Immutable raw: `data/local/raw/oae/daily-product-sample-3804ea2e932f56b452633193/manifest.json`; canonical checksum `09177dca3deced2076bb7996836ff49e51253e61abb23355d20ed8bf4b480486`. Envelope capture time is the staging/save time, not a provider release time.
- Frontend evidence: `data/local/source-expansion/nabc-frontend.js`, SHA-256 `33496cb148fc895c3854de7502cd2c9674feb2eec2bec9098553700b5a3e21c9`.
- Latest-date evidence: `data/local/source-expansion/nabc-daily-latest.json`.

Network budget used: four requests (frontend initially returned 403; explicit browser User-Agent succeeded, latest-date and one product page succeeded). No credentials were used or stored. No pagination beyond the first page was attempted.

Focused tests: `.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -p test_daily_prices.py -q` (2 tests). Next: confirm market pricing definition and rights, then implement complete bounded pagination and revision/duplicate handling before analytical use. BI remains deferred.
