# NABC weekly prices: native staging

Checked 22 October 2026 (Asia/Bangkok), four HTTP requests: official frontend bundle, endpoint documentation shell, weekly product names for 2569, and one weekly product response. No credentials were required for these calls.

Official evidence: https://agriapi.nabc.go.th/home/endpoint/weekly-prices-product and https://agriapi.nabc.go.th/main.eb4045b9bd8a7631.js . The frontend service uses `year_th`; documentation examples instead show `year` and `price`. Live response uses `year_th` and `value`. The adapter follows the observed schema.

Selected product: กระบือ ขนาดกลาง. One response returned 42 rows (pagination count=total=42). Native unit is บาท/ตัว; province_code is TH00, national grain. Columns: year_th, month, week, province_code, province_name, product_name, commod, subcommod, value, unit. Source week codes observed 1 through 5 alongside month. They cannot be interpreted as ISO week numbers. Week boundary dates and publication timestamps were not established from the retrieved material.

`stage_weekly_prices` retains native year/month/week and unit. It preserves nulls and every raw revision, including two differing rows under one staging identity. Native decimal strings avoid rounding and no prices are averaged. `period_start`, `period_end`, `release_at` and `market_id` stay null. The farm_gate label follows the existing source registry; a specific market is not supplied by this endpoint. All rows remain pending; warehouse_ready is false. The reviewed week-code range is 1–5; other codes require source review.

Local evidence: `data/local/probes/weekly-prices/manifest.json`, `product.json` and `staged.json`, with SHA-256 hashes. Raw/staged prices are local only. This document contains no price values. Completion means all rows reported by this one capture, not every historical product/week. No warehouse writes or CLI/config changes.

Validation: one focused unittest covers native identity, differing revisions, decimal parsing, missing values, unresolved dates, and invalid week/month/unit/grain/value rejection. Live response staged 42 rows with complete pagination and unresolved date/release fields retained as null.
