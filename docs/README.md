# สารบัญเอกสาร Thailand Agricultural Data Hub

ทางเข้าหลัก: [แบบระบบ](../SYSTEM_DESIGN.md) · [แผนลงมือ](../IMPLEMENTATION_PLAN.md) · [สถานะล่าสุด](../HANDOFF.md) · [ความคืบหน้า](progress.md)

## แหล่งข้อมูลและการเข้าถึง

| ใช้ทำอะไร | เอกสาร |
|---|---|
| ค้นแหล่งและ endpoint | [accessible-data-map.md](accessible-data-map.md), [source-registry.md](source-registry.md), [current-data-inventory.md](current-data-inventory.md), [ingestion.md](ingestion.md) |
| ตรวจสิทธิ์และ lineage | [source-license-register.md](source-license-register.md), [data-lineage-review.md](data-lineage-review.md), [coverage-inventory.md](coverage-inventory.md) |
| สำรวจแหล่งเพิ่ม | [source-expansion-ldd.md](source-expansion-ldd.md), [source-expansion-dld.md](source-expansion-dld.md), [source-expansion-dof.md](source-expansion-dof.md), [doae-acquisition-audit.md](doae-acquisition-audit.md), [doae-catalog-expansion.md](doae-catalog-expansion.md) |

## ความหมายและการเชื่อมพื้นที่

| เรื่อง | เอกสาร |
|---|---|
| พื้นที่และ crosswalk | [geography.md](geography.md), [geography-crosswalk-resolution.md](geography-crosswalk-resolution.md), [spatial-evidence-matching.md](spatial-evidence-matching.md) |
| ผลผลิตและสถิติ DOAE | [production.md](production.md), [production-perennial.md](production-perennial.md), [doae-production-semantics.md](doae-production-semantics.md), [doae-p0-ingestion.md](doae-p0-ingestion.md), [doae-p1-archives.md](doae-p1-archives.md) |
| ราคาและสินค้า | [commodities.md](commodities.md), [daily-prices.md](daily-prices.md), [weekly-prices.md](weekly-prices.md), [commodity-history-audit.md](commodity-history-audit.md), [price-history-readiness.md](price-history-readiness.md), [price-gap-verification.md](price-gap-verification.md) |
| น้ำ อากาศ ภาพถ่ายดาวเทียม | [weather-v2.md](weather-v2.md), [methodology.md](methodology.md), [forecast-methodology.md](forecast-methodology.md), [perennial-readiness.md](perennial-readiness.md) |
| โครงการและ pilot | [project-register.md](project-register.md), [plan-actual-reconciliation.md](plan-actual-reconciliation.md), [plan-dryplant.md](plan-dryplant.md), [rice-pilot.md](rice-pilot.md) |

## การตัดสินใจและประวัติ

- [ADR-001: Next.js เป็นเว็บหลัก](decisions/0001-nextjs-web-delivery.md)
- [ADR-002: ใช้ API/connector จากต้นทาง](decisions/0002-source-backed-web-data.md)
- [ใบสั่งงาน AI 3 ตัว (25 ต.ค. 2569)](assignments/2026-10-25-ai-work-orders.md) — P0 governance containment, product integration/contract, release QA/CI
- [เอกสารเก่าที่ archive แล้ว](archive/2026-10-24-redesign/README.md); ไม่ใช้เป็นแผนงานปัจจุบัน

เอกสารแหล่งข้อมูลเป็นหลักฐานตามวันที่สำรวจ ไม่รับรองว่า API ยังตอบหรือสิทธิ์ยังเหมือนเดิม ตรวจ URL และเงื่อนไขล่าสุดก่อนทำ connector การพบ catalog ไม่เท่ากับสิทธิ์อ่านหรือเผยแพร่ตัวเลข
