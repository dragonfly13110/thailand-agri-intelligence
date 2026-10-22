# NABC Historical Commodity Inventory Audit (2554–2569 BE)

**Date of Audit:** 22 October 2026 (Asia/Bangkok)  
**Scope:** 16 annual snapshots of `/api/monthly-prices/product-names?year_th={year}` for years 2554 to 2569 BE (2011 to 2026 CE).  
**Source Evidence:** `data/local/probes/historical-monthly-inventory.json` (SHA-256 verified per partition in `data/local/raw/oae/`).  
**License Status:** Pending redistribution review. No price values are included in this audit.

---

## 1. Executive Summary & Resolution of Checklist B2

Checklist item **B2** requires: *"ตรวจรายชื่อสินค้าในอดีตที่ไม่อยู่ใน inventory ปี 2569"* (Examine historical commodities not present in the 2569 inventory).

### Key Audit Findings:
1. **Zero Discontinued Commodities:** Across all 16 years (2554–2569), the union of all returned product names equals **exactly 44 distinct product identities**.
2. **100% Inventory Coverage:** The 2569 inventory contains all 44 product names (`inventory_2569 == union_2554_2569`). There are **zero** historical products published on this endpoint in past years that were dropped or absent in 2569.
3. **Temporal Inception of Series:** 39 products have been continuously published since 2554 (2011). Exactly 5 products were introduced as new official series in later years:
   * **มันสำปะหลังสดเชื้อแป้ง 25%:** Introduced in BE 2559 (2016 CE). Warehouse series begins 2016-02 (128 continuous months, **0 internal gaps**).
   * **ไข่เป็ด ขนาดกลาง:** Introduced in BE 2560 (2017 CE). Warehouse series begins 2017-01 (117 continuous months, **0 internal gaps**).
   * **ไข่เป็ด ขนาดเล็ก:** Introduced in BE 2560 (2017 CE). Warehouse series begins 2017-01 (117 continuous months, **0 internal gaps**).
   * **ไข่เป็ด ขนาดใหญ่:** Introduced in BE 2560 (2017 CE). Warehouse series begins 2017-01 (117 continuous months, **0 internal gaps**).
   * **ผลปาล์มน้ำมันทั้งทะลาย คละ:** Introduced in BE 2566 (2023 CE). Warehouse series begins 2023-06 (40 continuous months, **0 internal gaps**).
4. **Conclusion:** The shorter observation counts for these 5 series are due to official product creation dates, not ingestion drops or data loss.

---

## 2. Annual Product Counts

| Buddhist Year (BE) | Gregorian Year (CE) | Active Product Count | New Introductions |
|---:|---:|---:|---|
| 2554 | 2011 | 39 | Initial baseline (39 products) |
| 2555 | 2012 | 39 | — |
| 2556 | 2013 | 39 | — |
| 2557 | 2014 | 39 | — |
| 2558 | 2015 | 39 | — |
| 2559 | 2016 | 40 | + มันสำปะหลังสดเชื้อแป้ง 25% |
| 2560 | 2017 | 43 | + ไข่เป็ด ขนาดเล็ก, กลาง, ใหญ่ |
| 2561 | 2018 | 43 | — |
| 2562 | 2019 | 43 | — |
| 2563 | 2020 | 43 | — |
| 2564 | 2021 | 43 | — |
| 2565 | 2022 | 43 | — |
| 2566 | 2023 | 44 | + ผลปาล์มน้ำมันทั้งทะลาย คละ |
| 2567 | 2024 | 44 | — |
| 2568 | 2025 | 44 | — |
| 2569 | 2026 | 44 | — |

---

## 3. Product Inception vs Warehouse Lifespan Correlation

| Product Name | Introduced Year (BE) | Warehouse Start Month | Warehouse End Month | Total Months | Internal Gaps |
|---|---:|---|---|---:|---:|
| มันสำปะหลังสดเชื้อแป้ง 25% | 2559 | 2016-02 | 2026-09 | 128 | 0 |
| ไข่เป็ด ขนาดกลาง | 2560 | 2017-01 | 2026-09 | 117 | 0 |
| ไข่เป็ด ขนาดเล็ก | 2560 | 2017-01 | 2026-09 | 117 | 0 |
| ไข่เป็ด ขนาดใหญ่ | 2560 | 2017-01 | 2026-09 | 117 | 0 |
| ผลปาล์มน้ำมันทั้งทะลาย คละ | 2566 | 2023-06 | 2026-09 | 40 | 0 |

---

## 4. Methodological Note for Analysis & Semantic Model

1. **No False Missingness:** Analysts and DAX measures must **not** mark pre-2559 data for cassava 25% or pre-2566 data for oil palm fruit as "missing" or "incomplete" in data quality dashboards; these series did not exist prior to those dates.
2. **Grain Integrity:** The 3 size grades for duck eggs (`ไข่เป็ด ขนาดเล็ก/กลาง/ใหญ่`) coexist with the general grade (`ไข่เป็ดสด คละ` which spans all 189 months 2011–2026). They must remain distinct identities and must never be averaged or summed together.
3. **Immutability:** This audit is reproducible from the local immutable snapshots in `data/local/raw/oae/historical-product-names-*/`.
