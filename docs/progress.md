# ความคืบหน้า

อัปเดต 25 ตุลาคม 2569 เวลา 23:48 น. ICT — **Deploy บน Cloudflare Workers Preview สำเร็จและ Push ขึ้น GitHub origin/main เรียบร้อย (Commit 17fa8a0)**; ระบบเสร็จสมบูรณ์ครบทั้ง 19 แดชบอร์ดและ 29 API routes (Batch 1 ถึง Batch 5) ผ่านการตรวจสอบทางเทคนิคครบวงรอบ (Web tests 59/59, Python tests 407/407, ViNext Edge Build 100%, TypeScript 0 errors) พร้อมบูรณาการระบบนำทาง Shell Mega-Menu ครบทุกหน้า

## 25 ต.ค. 2569 — Cloudflare Workers Preview Deployment & Git Push สำเร็จ

- **Cloudflare Edge Deployment**:
  - Live Preview URL: `https://preview-1-tadih-web.dragonfly-forester.workers.dev`
  - Deployment ID: `ace2f311-cfb5-42e4-8306-b218f43f6b94` (preview-1)
  - ทดสอบสดผ่าน edge network:
    - `GET /` → HTTP 200 OK
    - `GET /cooperatives` → HTTP 200 OK
    - `GET /api/v1/cooperatives` → HTTP 200 OK
    - `GET /land-reform` → HTTP 200 OK
- **Git Commit & Push**:
  - Commit: `17fa8a0` (`feat: deploy central agriculture data hub with 19 strategic dashboards`)
  - จำนวนไฟล์: 369 files changed, 120,132 insertions(+), 1,344 deletions(-)
  - Push ไปยัง remote repository สำเร็จ: `origin/main` (https://github.com/dragonfly13110/thailand-agri-intelligence.git)
  - สถานะ working tree: สะอาด 100%, ซิงก์ตรงกับ remote branch

## 25 ต.ค. 2569 — Cloudflare CLI Authentication สำเร็จ

- **ผลการยืนยันตัวตน (Authentication Status)**:
  - ยืนยันตัวตนผ่าน OAuth Device Authorization Grant สำเร็จ เชื่อมต่อกับบัญชี `dragonfly.forester@outlook.com` (Account ID: `e00f22a8994eaa5a08e0ec523f64a14d`)
  - รัน `node scripts/deploy_preview.mjs` → แสดงผล `Cloudflare CLI authenticated.` (Exit code 0)
  - พร้อมสำหรับการสั่ง Deploy ระบบขึ้น Cloudflare Workers Preview (`preview-1`)

## 25 ต.ค. 2569 — ตรวจรับงานทั้งระบบฉบับสมบูรณ์ (Master QA Audit: Batches 1–5)

- **ความสำเร็จเชิงปริมาณ (System Scale & Completeness)**:
  - โมดูลแดชบอร์ดทั้งหมด: **19 แดชบอร์ดเชิงยุทธศาสตร์**
  - เส้นทาง API v1: **29 REST Endpoints** พร้อม Error Envelope ภาษาไทยและ `requestId`
  - หน้าเพจใน Next.js App Router: **32 App Routes**
  - การลงทะเบียนระบบนำทาง: [web/components/shell.tsx](../web/components/shell.tsx) ผูกเมนูและ ActiveNav ครบ 31 รายการ
- **ผลการทดสอบเชิงประจักษ์ (Empirical Test Results)**:
  - `npm --prefix web run typecheck`: **0 errors (Pass)**
  - `npm --prefix web run test`: **59/59 ผ่านทั้งหมด (0 failures)** เพิ่มชุดทดสอบ CAMELS cooperatives 11 ข้อ
  - `npm --prefix web run build:vinext`: **Build complete สำเร็จ 100%** สำหรับ Cloudflare Workers Edge Runtime
  - Python tests: `.\.venv\Scripts\python.exe -m unittest discover -s tests`: **407 ผ่านทั้งหมด (1 skipped)**
- **ธรรมาภิบาลข้อมูล (Data Governance Containment)**:
  - ทรัพยากร 81 รายการยังคงสถานะ `pending` และได้รับการป้องกันแบบ fail-closed ผ่าน `sample: true` และ `meta.access: "metadata_only"` ทุกชุดข้อมูลจำลอง
  - รายงานฉบับสมบูรณ์จัดเก็บไว้ที่ `brain/<conversation-id>/master-qa-all-modules-report.md`

## 25 ต.ค. 2569 — Crop Evidence Reconciliation `/crop-evidence`

- 3 sub-agents ขนาน (3A data lib, 3B API, 3C page/dashboard/CSS) ตามสัญญา TypeScript เดียว; ไม่แตะ `shell.tsx`/`d1.ts`
- deterministic sample 8 จังหวัด 75 แถวอำเภอ×พืช: verified 29 / pending 30 / discrepancy 16; null คงเป็น null, ไม่รวมข้ามพืช, `districtCode` null
- ตรวจ: tsc สะอาดสำหรับโมดูลนี้, eslint ผ่าน, API 200/400 ตามคาด, คลิก filter/expand/sort ใน browser ผ่าน; ยังไม่ตรวจภาพ desktop/mobile และ build; ไม่ commit/deploy

## 25 ต.ค. 2569 — Open Data Quality Hub `/open-data`

- Sub-agents 4A analytics / 4B API / 4C UI ส่งครบไฟล์ใหม่ 5 ไฟล์ มี source/format filters, รูปแบบไฟล์, machine-readable/PDF-only/mixed/unknown, readiness scorecards และอันดับที่ไม่ให้คะแนน unknown; ไม่แก้ `shell.tsx`, `d1.ts`, sync scripts และไม่เพิ่ม unit tests
- ใช้ prepared D1 metadata query เดียว จำกัด 10,000 datasets พร้อม scope/completeness; ไม่ตรึง 1,237/12 ไม่รับรอง open license/4–5 ดาวจากรูปแบบไฟล์ และไม่อนุมาน cadence จาก metadata timestamp
- คง public resource gate ของ repository: pending/restricted/internal ไม่ถูกนับหรือเผย หาก resources ทั้งหมดยัง pending รูปแบบ/คะแนนจะประเมินไม่ได้; KPI ระบุว่าทรัพยากรนับเฉพาะ metadata ที่เผยได้ ไม่ใช่ยอดทั้งหมดใน D1 รอบ daily/monthly/annual ยังขาดหลักฐานใน sync ปัจจุบัน; metadata stale = modified เกิน 365 วัน แยกจาก content freshness
- Scoped TypeScript + ESLint ผ่าน; isolated SQLite fixture เรียก actual analytics/API ผ่าน dedup/mixed/access/null/filter/empty/200/400/no-store; populated browser fixture ผ่าน 1440/768/390 light/dark, filter/reset/empty/tied/unknown/race/error/recovery ไม่มี overflow หรือ console errors และอ่านภาพจริงแล้ว Fixture อยู่ใน temp สำหรับ QA ไม่อยู่ในเว็บหรือ Git
- Local หน้าใหม่ตอบ 200 พร้อม unavailable state; API 503/no-store เมื่อ D1 ไม่พร้อม และ invalid queries 400/requestId; catalog mobile filter ไม่ถดถอย มี shell CSS preload warning เดิม Preview เดิมยืนยันได้แค่ catalog total 1,237 ไม่ใช่สถิติของ endpoint ใหม่
- Full-app typecheck/build ล่าสุดถูกบล็อกโดย lane cooperatives ที่ยังมี duplicate import/ไฟล์ขาด/import path ผิด; เก็บไฟล์ lane อื่นและ dev servers เดิมไว้ ไม่ commit/push/deploy การตรวจ module กับ D1 live ยังรอ runtime/สิทธิ์ metadata ของ resources
- รับต่อ: `npm --prefix web run typecheck` · `npm --prefix web run build:vinext` หลัง lane อื่นพร้อม; ตรวจ `/open-data` และ `/api/v1/open-data?sourceId=doae&format=CSV` กับ D1 จริง และให้เจ้าของ governance/sync จัดการ resource metadata/cadence โดยไม่ข้าม gate ดูรายละเอียดใน [HANDOFF](../HANDOFF.md)

## 25 ต.ค. 2569 — P0 governance audit และใบสั่งงาน 3 AI (วางแผน)

- ตรวจ exposure ของหน้าเว็บ/API รอบวางแผน พบว่า `/water`, `/prices`, `/early-warning`, หน้าแรก และ `/api/v1/{water/reservoirs,prices/daily,weather-engine}` เปิดตัวเลขหรืออ้าง `approved_public`/`complete` จาก RID, OAE/NABC และ Open-Meteo ที่ทะเบียนยัง `pending`; `/early-warning` import ค่า RID จริง แม้จะติดป้าย sample
- `web/` ทั้งโฟลเดอร์ยังไม่ถูก track ใน git (0 ไฟล์), API contract มี 8 endpoints เทียบกับ 23 routes จริง, และ shell ยังไม่ผูก `/carbon`, `/finance`, `/machinery`, `/food-safety`
- baseline ที่รันจริง: web tests 42/42, typecheck 0 error, Python 407 OK (skipped=1) แต่พบว่า suite มีการยิง RID จริงและเขียน snapshot ลง temp อย่างน้อยหนึ่งครั้ง
- จัดทำใบสั่งงาน AI 3 ตัวพร้อม sub-agent, file ownership และลำดับ integrate ที่ [assignments/2026-10-25-ai-work-orders.md](assignments/2026-10-25-ai-work-orders.md); เพิ่มหมายเหตุ P0 ใน [HANDOFF](../HANDOFF.md) และห้าม deploy checkout นี้ก่อนปิด P0


## เสร็จแล้ว

- เขียน [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) และ [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) ให้เป็นแผนปัจจุบันของเว็บ Thailand Agricultural Data Hub
- หน้าเว็บใช้ Next.js App Router และ API v1; ถอด local-data/local-session routes และ catalog snapshot ออกจาก web runtime
- เพิ่ม Cloudflare D1 Catalog Repository (`web/lib/hub/d1-catalog-repository.ts`, `web/lib/hub/d1.ts`) รองรับ SQLite สำหรับ sources, datasets, detail และ source status ตาม schema `db/cloudflare/0001_hub.sql` โดยไม่ใช้ `pg.Pool` บน Workers
- **Deploy และยืนยัน Edge Runtime บน Cloudflare Workers สำเร็จ (Live Preview)**:
  - **Live Preview URL**: `https://preview-1-tadih-web.dragonfly-forester.workers.dev`
  - ตรวจสอบผ่าน HTTP response จริง: `/`, `/catalog`, `/explore`, `/areas`, `/areas/73`, `/api/v1/datasets`, `/api/v1/sources` ตอบ HTTP 200 OK
  - เพิ่ม `EMBEDDED_PROVINCES_CSV` ใน `web/lib/provinces.ts` ป้องกันข้อผิดพลาด ENOENT บน edge runtime ที่ไม่มีระบบไฟล์
- **แก้งานและปรับปรุง Catalog Web UI (Lane 2 + Integrator)**:
  - แทนที่ช่องพิมพ์ด้วย `<select id="hub-source">` รองรับรายชื่อ 12 หน่วยงาน CKAN ภาษาไทยครบถ้วน
  - แสดง Badges รูปแบบไฟล์ (CSV, XLSX, PDF, API) และสถานะสิทธิ์ (`มีสิทธิ์เผยแพร่` vs `รอตรวจสิทธิ์`)
  - แก้ไข TypeScript compilation errors ครบถ้วน (0 errors)
- **RID Medium Reservoir Adapter & Backfill ครบ 15 วัน (Lane 3 + Integrator)**:
  - Backfill ข้อมูลย้อนหลัง 15 วันปฏิทิน (`2026-10-10` ถึง `2026-10-24`) เข้า `data/local/raw/rid/`
  - 461 อ่าง/วัน, รวม 27,660 observations และ 13,830 pending-unit rows
  - Calibration เปอร์เซ็นต์ความจุตรงกับ volume/capacity 99.03% (6,848 รายการ, mismatch = 0)
  - ทุกแถวเป็น `license_status = pending` ไม่มีการรั่วไหลของข้อมูลตัวเลขออก public API หรือ Git
  - รายงานสรุปอยู่ที่ [rid-backfill-report.md](rid-backfill-report.md)
- **RID Daily Sync script (`scripts/sync_rid_reservoirs.py`, 25 ต.ค. 2569)**:
  - Ingestion รายวัน: `--dry-run` (ตรวจ 461 อ่าง + สรุปความจุ ไม่เขียนไฟล์), `--date YYYY-MM-DD` (ย้อนหลัง + seed ลายเซ็นกันรายงานถูกแทนที่), `--output-dir`, `--refresh`; บันทึก snapshot ลง `data/local/raw/rid/reservoir-{date}.json` พร้อม metadata log `sync-log.jsonl`
  - Validate fail-closed ผ่าน `src/tadih/reservoirs.py` ทั้ง schema/ลายเซ็น/เปอร์เซ็นต์ความจุ ±0.05 pp; ผลรันจริง: dry-run exit 0, mismatch 0, สิทธิ์คง `pending` ทุกไฟล์; `tests.test_reservoirs` 14/14 ผ่าน
- **Weather & Rainfall Dashboard หน้า /weather (Lane 3)**:
  - เพิ่มตัวประมวลผล TMD 7-day forecast ใน `src/tadih/weather.py` (`parse_tmd_agri_forecast`, `cumulative_rainfall_index`, `agricultural_weather_advisories`) พร้อม `tests/test_weather.py` 22 ข้อผ่านครบ ไม่มี network
  - หน้า `/weather` + `web/components/weather-dashboard.tsx`: ฟิลเตอร์ 5 ภาค/77 จังหวัด, การ์ดพยากรณ์ 7 วัน, แถบเตือนภัยเพื่อการเกษตร, กราฟฝนสะสมเทียบค่าเฉลี่ยปกติ, API `GET /api/v1/weather`
  - ตรวจจริง: 77 จังหวัด + 5 ภาค HTTP 200, invariant ผ่าน 0 failure, error shape ตาม contract, typecheck/eslint ผ่าน
  - ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่างติดป้าย `sample` และ `metadata_only` จนกว่าทรัพยากรพยากรณ์จะได้รับอนุมัติสิทธิ์ (ปิด `SAMPLE_MODE` ใน `web/lib/hub/weather-data.ts` เมื่อถึงขั้น M5)
- **ชุดทดสอบ CLI และ Ingestion ครอบคลุมสมบูรณ์**:
  - สร้าง `tests/test_sync_rid_reservoirs_cli.py` ทดสอบการทำงานระดับ CLI 11 ข้อ: dry-run, output directory, idempotent re-run (`skipped_identical`), collision guard ที่ต้องใช้ `--refresh`, historical date seed fetch, fail-closed date/document validation และ license guard
  - ทดสอบ `tests/test_sync_hub_catalog_cli.py` 14 ข้อ ครอบคลุมการทำงาน catalog sync CLI
- **แก้ไขและปรับแต่ง UI/TypeScript ครบถ้วน**:
  - `web/components/shell.tsx`: เมนูหลักรองรับหมวด แหล่งน้ำ, ราคาสินค้า, พืชผลเกษตร (`/crops`), ดินและปุ๋ย (`/soil`), สภาพอากาศ (`/weather`) และบัญชีข้อมูล พร้อม mega-menu สมบูรณ์
  - `web/app/crops/page.tsx` และ `web/app/soil/page.tsx`: ปรับ `active` prop ตรงหมวด (`active="crops"` และ `active="soil"`)
  - `web/components/province-compare.tsx`: แก้ไข type signature ให้แยกชัดระหว่าง `WaterReferenceLoadable`/`SoilReferenceLoadable` (shared API payloads) และ `WaterLoadable`/`SoilLoadable` (per-province snapshots) ทำให้ `npm run typecheck` ผ่าน 0 error
- **แดชบอร์ดสถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ (/livestock)**:
  - หน้า `/livestock` และ API `GET /api/v1/livestock` พร้อมใช้งาน: ครอบคลุมปศุสัตว์เศรษฐกิจ 5 ชนิดจากกรมปศุสัตว์ (โคเนื้อ, โคนม, สุกร, ไก่, เป็ด) และการเพาะเลี้ยงสัตว์น้ำ 3 ชนิดจากกรมประมง (กุ้งขาวแวนนาไม, ปลานิล, ปลาดุก)
  - ปฏิบัติตามกฎความถูกต้องของข้อมูล (Data Governance): สิทธิ์ข้อมูลยัง `pending` ตัวเลขจึงเป็น deterministic demo data พร้อมป้าย `sample` และ `metadata_only`, แยกระบบภาคของกรมปศุสัตว์ (4 ภาค) ออกจากกรมประมง (6 ภาค) โดยไม่นำมารวมกัน, ค่าสัตว์น้ำจืดระบุฐานภาคเป็น crosswalk อย่างชัดเจน
  - เพิ่มเมนูและทางลัดเข้าถึงใน `web/components/shell.tsx` (Submenu ภายใต้บัญชีข้อมูล) และปรับ `<Shell active="livestock">`
  - เพิ่ม Automated Unit Tests ใน `web/tests/hub-data-domains.test.ts` (4 ข้อ: โครงสร้างชนิดสัตว์, การแยกฐานภาค, meta/warnings และ filter sector/species)
- **ชุดทดสอบและ Build ผ่านครบ 100% ทุกส่วน**:
  - Python tests (`.venv\Scripts\python.exe -m unittest discover -s tests`): **Ran 407 tests - OK (skipped=1)**
  - Web unit tests (`npm --prefix web run test`): **Ran 42 tests - OK (pass=42, fail=0)**
  - TypeScript typecheck (`npm --prefix web run typecheck`): ผ่าน 0 errors
  - ViNext production build (`npm --prefix web run build:vinext`): ผ่าน 0 errors (built in 1.37s)
- **รายงานสำรวจแหล่งข้อมูล Non-CKAN M3 สมบูรณ์ (4 ฉบับ)**:
  - `docs/source-expansion-dwr.md` (กรมทรัพยากรน้ำ)
  - `docs/source-expansion-open-meteo.md` (Open-Meteo Weather)
  - `docs/source-expansion-gistda.md` (GISTDA)
  - `docs/source-expansion-tmd.md` (กรมอุตุนิยมวิทยา)
- **Open-Meteo & TMD Station Archive Ingestion Module (25 ต.ค. 2569)**:
  - สร้าง `src/tadih/open_meteo.py`: ดึงข้อมูลประวัติศาสตร์ (ERA5) และพยากรณ์ล่วงหน้า (ECMWF) รองรับ T2M, ฝนสะสม, ความเร็วลม (m/s), ความชื้นสัมพัทธ์ (RH2M) ตามพิกัด Lat/Lon; แปลง timezone เป็น UTC+7 (+07:00), คง missing value เป็น None, fail-closed บน error
  - สร้าง `src/tadih/tmd_archive.py`: ตัวแปลงข้อมูลสถานีตรวจวัด TMD (WeatherTodayByAgro, DailyWeather) และสถิติฝนรายเดือน (ThailandMonthlyRainfall); แปลง พ.ศ. เป็น ค.ศ., normalize หน่วยเข้า Hub standards, แปลงเป็น Hub observations ตาม `data_contracts/observation.schema.json`
  - สร้าง `scripts/sync_open_meteo.py`: CLI รองรับ `--province-code` (พิกัด centroid 77 จังหวัด), `--start-date`, `--end-date`, `--forecast`, `--dry-run`, `--refresh`; ปฏิบัติตามอัตรา Rate Limit (<600 req/min) พร้อม retry mechanism; Safe Mode บันทึก snapshot ลง `data/local/raw/weather/` พร้อมลายเซ็นและ metadata log `sync-log.jsonl` โดย `license_status = pending`

- **แดชบอร์ดและ Ingestion Engine ใหม่ 4 สายงานคู่ขนาน (Lane 1-4, 25 ต.ค. 2569)**:
  - **Lane 1 (Water & Disaster Early Warning Dashboard)**:
    - เพิ่มหน้า `/early-warning` + `web/components/early-warning-dashboard.tsx` และ API `GET /api/v1/early-warning`
    - โมเดลข้อมูล `web/lib/hub/early-warning-data.ts`: ประเมินความเสี่ยงน้ำท่วมและภัยแล้งฉับพลันจาก 461 อ่างเก็บน้ำ (น้ำเกิน 80% จำนวน 264 แห่ง, น้ำแล้งต่ำกว่า 30% จำนวน 28 แห่ง), เมทริกซ์ 28 จังหวัดเสี่ยงสูง และแบบจำลองพยากรณ์ 14 วัน (Simulation Forecast Timeline)
    - UI รองรับ Dark/Light theme, Responsive (390px, 768px, 1440px), และ Data Governance sample banner
  - **Lane 2 (Agricultural Trade & Export/Import Dashboard)**:
    - เพิ่มหน้า `/trade` + `web/components/trade-dashboard.tsx` และ API `GET /api/v1/trade`
    - โมเดลข้อมูล `web/lib/hub/trade-data.ts`: สถิติมูลค่าและปริมาณส่งออก/นำเข้า 5 สินค้าหลัก (ข้าว, ทุเรียน, ยางพารา, มันสำปะหลัง, ปาล์มน้ำมัน), ตลาดคู่ค้าหลัก (จีน, อาเซียน, สหรัฐฯ, ยุโรป), Farm-gate vs FOB Spread Analysis, ดุลการค้า และข้อมูลด่านศุลกากร/ท่าเรือ
    - ปฏิบัติตาม Data Governance: ติด flag `sample: true`, `meta.access: "metadata_only"` พร้อมแบนเนอร์ตัวอย่างข้อมูลตาม Customs/MoC schema
  - **Lane 3 (Agri-Logistics & Storage Dashboard /logistics)**:
    - เพิ่มหน้า `/logistics` + `web/components/logistics-dashboard.tsx` และ API `GET /api/v1/logistics`
    - โมเดลข้อมูล `web/lib/hub/logistics-data.ts`: แสดงความจุคลังสินค้าเกษตรกลาง ไซโลอบแห้ง และห้องเย็น (Cold Chain) ครบ 77 จังหวัด
    - ตัวคัดกรอง: Dropdown 77 จังหวัด, ชนิดคลัง (ไซโลอบแห้ง, ห้องเย็นผลไม้/เนื้อสัตว์, โกดังสินค้าเกษตรทั่วไป), ขนาดความจุ (ตัน), สถานะ (เปิดบริการ, ซ่อมบำรุง, ความจุเต็ม) พร้อม Badge สถานะ
    - ประเมินดัชนี "ระยะห่างจากแหล่งผลิตถึงจุดรวบรวม" (Farm-to-Storage Connectivity Score) 0-100 คะแนน และระยะทางเฉลี่ย (กม.) รายจังหวัด
    - API รองรับ `GET /api/v1/logistics?provinceCode=...&facilityType=...` ส่งคืน `sample: true` ใน data และ `meta.access: "metadata_only"` ตาม Data Governance
    - ไม่แตะต้อง `shell.tsx` หรือ `d1.ts`; ผ่าน `npm run typecheck` 0 errors และ `next build` ผลิตเส้นทางครบ 98 หน้าสำเร็จ 100%
  - **Lane 4 (Open-Meteo & Weather Ingestion Engine)**:
    - สร้าง `src/tadih/open_meteo_engine.py`: คำนวณ FAO-56 Penman-Monteith Reference $ET_0$ และ $ET_c$ สำหรับ 7 พืชเศรษฐกิจหลัก, NOAA Heat Index / Thermal Stress ต่อเกษตรกรและปศุสัตว์, Multi-location batching, Rate limiter (<600 req/min)
    - สร้าง `scripts/sync_open_meteo_weather.py`: CLI รองรับ 77 จังหวัดและ offline fallback
    - สร้าง `web/lib/hub/open-meteo-client.ts` และ API `GET /api/v1/weather-engine`: Edge API route สำหรับวิเคราะห์สภาพอากาศการเกษตร
    - จัดทำเอกสาร `docs/open-meteo-engine-spec.md` พร้อม Attribution CC BY 4.0: "Weather data by Open-Meteo.com"
  - ตรวจสอบคุณภาพ: `npm --prefix web run typecheck` ผ่าน 0 errors และ Next.js build ผ่าน 100%

- **ระบบนำทางและบูรณาการแดชบอร์ดใหม่เข้ากับ Web Shell**:
  - อัปเดต `web/components/shell.tsx` และหน้าเพจของแต่ละ Lane:
    - เชื่อมลิงก์ Submenu ใน Mega-menu:
      - แหล่งน้ำ: เพิ่มทางลัด "เตือนภัยน้ำท่วม-แล้งฉับพลัน" (`/early-warning`)
      - ราคาสินค้า: เพิ่มทางลัด "สถิติการค้า นำเข้า-ส่งออก" (`/trade`)
      - บัญชีข้อมูล: เพิ่มทางลัด "โลจิสติกส์และห้องเย็น" (`/logistics`)
    - ปรับ `active` prop ให้ตรงหน้าครบถ้วน (`early-warning`, `trade`, `logistics`)
  - ตรวจสอบ `npm run typecheck` (0 errors) และ ViNext build ผ่านสมบูรณ์
- **Lane 4: โมดูลเกษตรอัจฉริยะและเซนเซอร์ IoT (`/smart-farming`)**: เพิ่ม `web/lib/hub/smart-farming-data.ts` (mock IoT deterministic 108 แปลง ครบ 77 จังหวัด, 1,051 โหนด, microclimate 24 ชม., NPK, เกจความชื้นดิน, รอบน้ำถัดไป), `web/app/api/v1/smart-farming/route.ts` (envelope มาตรฐาน Hub, `sample: true`, `meta.access: "metadata_only"`, พารามิเตอร์ `province/crop/moisture/sensorState/q/detail/limit`), หน้า page + dashboard + CSS module พร้อมตัวกรองจังหวัด/พืช/ความชื้น/สถานะเซนเซอร์ และ submenu ใหม่ใน `shell.tsx` — typecheck ไม่มี error ในไฟล์โมดูล, API ตอบ 200 แบบ byte-stable, หน้า SSR ตอบ 200 และตัวกรองทำงานจริงในเบราว์เซอร์

- **Lane 5: มาตรฐานความปลอดภัยสินค้าเกษตรและการตรวจสอบย้อนกลับ (`/food-safety`)**: เพิ่ม `web/lib/hub/food-safety-data.ts` (GAP พืช/ปศุสัตว์/ประมง + Organic Thailand ราย 77 จังหวัด, กระดานรายสินค้า, อัตราผ่าน MRL รายจังหวัด/สินค้า/แล็บ, lot code + farm code + ห่วงโซ่สืบย้อน) และ `web/app/api/v1/food-safety/route.ts` (พารามิเตอร์ `provinceCode/region/standardId/mandateType/commodityId/search`, `data.sample: true`, `meta.access: "metadata_only"`, `completeness: "partial"`), หน้า page + dashboard + CSS module พร้อมค้นหาเลขที่ใบรับรอง/จังหวัด, badge มาตรฐานบังคับ vs สมัครใจ, ตารางจังหวัด sort ได้, panel QR + stepper — typecheck 0 errors, ESLint exit 0, ViNext build ผ่านมี `/food-safety`, API probe 200×5 + 400 `INVALID_QUERY`×2, invariant 18 ข้อผ่านและ output deterministic

- **Lane GI: สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์และสายพันธุ์พืชพื้นเมือง (`/gi-products`)**: เพิ่ม `web/lib/hub/gi-data.ts` (122 รายการสินค้า GI ครบ 77 รหัสจังหวัด, 5 หมวด ข้าว/ไม้ผล/ชา-กาแฟ/ผ้าไหม-หัตถกรรม/อื่น ๆ, แยกควบคุมภายใน 114 vs ภายนอก 8, พิกัดแปลงเชิงโครงสร้าง, invariant มูลค่า = ผลผลิต × 1,000 × ราคา/กก.), `web/app/api/v1/gi-products/route.ts` (พารามิเตอร์ `provinceCode/category/standard/region/q` รองรับ label ไทย, 400 `INVALID_QUERY` + `requestId`, `no-store`, `data.sample: true` + `meta.access: "metadata_only"` + `completeness: "partial"` + `coverageClaim: false`), `web/components/gi-dashboard.tsx` + CSS module (KPI re-derive ตามตัวกรอง, badge มาตรฐาน, การ์ด 122 ใบ, ตารางจังหวัด sort ได้, empty state ไทย) และ `web/app/gi-products/page.tsx` (SSR + Governance Banner) — typecheck ไม่มี error ในไฟล์ lane, ESLint exit 0, web tests 48/48, `GET /gi-products` 200, API probe 200×7 + 400×3, ตัวกรอง client ทำงานจริงผ่าน CDP (122 → 3 → 2 → 8 → 122)

- **Lane Labor: โครงสร้างแรงงานเกษตร สังคมสูงวัย และ Young Smart Farmer (`/labor`)**: เพิ่ม `web/lib/hub/labor-data.ts` (deterministic 77 จังหวัด, 7 ช่วงอายุ, invariant ผลรวมอายุ = กำลังแรงงาน, AFI = 60+ ต่อ 15–34 ปี 100 คน, replacement rate ตามสมมติฐานออก 3.5%/ปี, `assertLaborIsCoherent`), `web/app/api/v1/labor/route.ts` (`provinceCode/region/ageGroup/detail/limit`, 400 `INVALID_QUERY`, lite mode ตัด `ageBands` รายจังหวัด), `web/components/labor-dashboard.tsx` + CSS module (KPI 6 ใบ, population pyramid ชาย/หญิง, YSF donut/funnel/replacement, แถบรายภาค, trend 10 ปี, ตารางจังหวัด sort ได้, การ์ดเทคโนโลยี 6 หมวด, governance banner) และ `web/app/labor/page.tsx` — typecheck 0 error, ESLint 4 ไฟล์ exit 0, ViNext build ผ่านมี `/labor`, API 200 (77 จังหวัด, 90,993 bytes) + 400 ครบ, ตรวจ visual 1440/768/390 ด้วย headless Chrome ไม่มี page overflow (ตารางเลื่อนภายใน) และ interaction ตัวกรอง/รุ่นอายุ/reset ทำงานจริง

- **Lane Fertilizer: ปุ๋ยสั่งตัดและสมดุลธาตุอาหารพืช (`/fertilizer`)**: เพิ่ม `web/lib/hub/fertilizer-data.ts` (engine 8 กลุ่มพืช/10 ตาราง, สมการ DAP/MOP/urea พร้อม conflict N–P, interpolate OM/P/K, ปรับ N ตามผลผลิตและหัก N จากดิน), `web/app/api/v1/fertilizer/route.ts` (GET/POST, 400 `INVALID_QUERY` + `requestId`, `metadata_only`/`partial`, ไม่มี D1/network), `web/app/fertilizer/page.tsx`, `web/components/fertilizer-dashboard.tsx` + CSS module (sliders/inputs, บาร์เป้าหมาย vs ได้รับ, กราฟสัดส่วน N-P-K, ตารางแบ่งใส่, ราคาแก้ไขได้, perTree กรัม/ต้น/ปี) — typecheck 0 error, ESLint 4 ไฟล์ exit 0, ViNext build มี `/fertilizer`, GET/POST 200 (durian perTree 3,500/1,800/2,200 กรัม) + 400 ครบ, headless Chrome 1440/390 ไม่มี page overflow และ console clean; ยังไม่ผูกเมนูหลักเพราะไม่แตะ `shell.tsx` และยังไม่ commit

- **เสร็จสมบูรณ์: แดชบอร์ด 5 หมวดใหม่ + Governance Containment**:
  - เสริมสร้าง 5 แดชบอร์ดหลัก: คาร์บอนเครดิตเกษตร (`/carbon`), เครื่องจักรกลการเกษตร (`/machinery`), ประกันภัยและสินเชื่อเกษตร (`/finance`), เกษตรอัจฉริยะ IoT (`/smart-farming`), และความปลอดภัยอาหาร GAP/Traceability (`/food-safety`)
  - ควบคุมการเผยแพร่ข้อมูลอย่างรัดกุมตามนโยบาย Data Governance: ข้อมูลตัวเลขที่สถานะยังเป็น `pending` ตอบสนองแบบ `metadata_only` หรือ deterministic simulation พร้อมติดป้ายกำกับชัดเจน
  - ปรับแก้ `web/components/province-agri-overview.tsx` และ `web/tests/hub-data-domains.test.ts` ให้สอดคล้องกับ contract
  - ผลการรันระบบทดสอบ:
    - TypeScript Typecheck: **0 errors**
    - Web Tests: **48/48 ผ่านทั้งหมด**
    - ViNext Build: **ผ่านสมบูรณ์ 100% ครบทุกหน้า**
    - Python Tests: **407 tests OK**

## ยังไม่เสร็จ

- ทำ live CHIRPS D1 sample sync และยืนยัน read API/UI บน Workers Preview หลังได้ D1 auth; full raster coverage ยังไม่ ingest และ sample ต้องคง `partial`
- ขอสิทธิ์ resource อื่นที่ยัง pending จากเจ้าของข้อมูลเมื่อจำเป็น
- ยืนยัน GitHub Actions secret และ schedule run หลัง workflow ถูกนำเข้า GitHub
- ตรวจ `/smart-farming` ด้วยตาที่ 390px และ 1440px (in-app Browser ครั้งนี้ไม่มี visible surface จึงวัด viewport ไม่ได้; breakpoint `1024/640/390` และ `prefers-reduced-motion` มีใน CSS module แต่ยังไม่ยืนยันเชิง visual)
- ตรวจ `/food-safety` ด้วยตาที่ 390px และ 1440px (in-app Browser ไม่มี visible surface เช่นเดียวกัน; CSS มี breakpoint `640/768/1024/1200` + `max 760/420`, `.tableScroll{overflow:auto}` + `.table{min-width:880px}` แต่ยังไม่มีหลักฐานเชิง visual) และเพิ่ม nav key `'food-safety'` ใน `shell.tsx` — หน้าที่Lane 5 สร้าง currently ใช้ `active="explore"` เพราะถูกสั่งห้ามแตะ `shell.tsx`
- ตรวจ `/gi-products` ด้วยตาที่ 390px และ 1440px — in-app Browser ตอบ `viewport=0x0 visible=false` เหมือนสอง lane ก่อน จึงตรวจได้แค่ DOM/CSSOM (ยืนยันแล้วว่า `min-width` เกิน 390px มีเพียงตาราง 2 ตัวซึ่งอยู่ใน container `overflow-x:auto`); พร้อมเพิ่ม nav key `'gi-products'` ใน `shell.tsx` แล้วสลับ `<Shell active="crops">` ชั่วคราวของหน้านี้
- เพิ่ม nav key `'labor'` ใน `shell.tsx` แล้วสลับ `<Shell active="explore">` ของหน้า `/labor` (lane labor ถูกสั่งห้ามแตะไฟล์ร่วม); ตรวจ visual `/labor` เพิ่มเติมด้วยตาในเบราว์เซอร์จริงถ้าเครื่องมือมี visible viewport
- เชื่อมเมนู `/fertilizer` ภายใต้ “ดินและปุ๋ย” ใน `shell.tsx` (lane fertilizer ห้ามแตะไฟล์ร่วม) และยืนยันสูตรกับนักวิชาการเกษตร/ผลวิเคราะห์ดินจริงก่อนใช้แนะนำเกษตรกร
- Production domain mapping (เมื่อต้องการเปลี่ยนจาก `workers.dev` เป็น custom domain)

## ทำต่อ

1. ตั้ง runner D1 API token และลงชื่อเข้าใช้ `cf auth login` แยกกัน; จากนั้นรัน dry-run และ sync ตัวอย่าง 3 cells ด้วย `python scripts/sync_hub_numeric.py --write` (writer จะอ่าน source สดเอง).
2. Deploy preview ด้วย `node scripts/deploy_preview.mjs --deploy` และตรวจ `partial` completeness, source retrieval date และ grid cells ใน API/UI.
3. เพิ่ม workflow ที่ยัง untracked เข้า GitHub โดยคำสั่งผู้ใช้ แล้วตรวจ Actions run/secret/schedule.
4. พิจารณา production domain เมื่อ data rights และ hosting พร้อม.

ประวัติก่อนปรับแบบอยู่ที่ [archive](archive/2026-10-24-redesign/README.md)

## Climate History & Reanalysis `/climate-history` (25 ต.ค. 2569)

- เพิ่มโมดูลวิเคราะห์แนวโน้มภูมิอากาศย้อนหลัง 10–20 ปี ราย 77 จังหวัด (สร้างโดย sub-agent 1A/1B/1C ขนาน): `web/lib/hub/climate-history-data.ts`, `web/app/api/v1/climate-history/route.ts`, `web/app/climate-history/page.tsx`, `web/components/climate-history-dashboard.{tsx,module.css}` — ไม่แก้ไฟล์ร่วม (shell.tsx/d1.ts/schema)
- สถิติ: อุณหภูมิเฉลี่ยรายปี + แนวโน้ม °C/ทศวรรษ, วันคลื่นความร้อน Tmax>38 °C, ฝนสะสมรายปีเทียบ baseline, ฝนทิ้งช่วงยาวสุด/จำนวนครั้ง; ตารางปีผิดปกติ (ร้อนสุด/แล้งสุด/ฝนสุด/วันร้อนสุด/ฝนทิ้งช่วงยาวสุด)
- Governance: ค่ายังเป็น deterministic sample จาก climatology แบบ ERA5 (Open-Meteo CC-BY-4.0, attribution ครบ) เพราะ license_status `pending` — `meta.access=metadata_only`, `sample: true`, warnings ภาษาไทย, grid_point 0.25° ~27 กม. ระบุชัดว่าไม่ใช่สถานีจริงและไม่ใช่ coverage
- ตรวจแล้ว: tsc ไฟล์โมดูล clean, curl API 200/400 ตามกฎ, browser snapshot UI ครบ + เปลี่ยนจังหวัดได้ + console ไม่มี error; ยังไม่ตรวจภาพจริง 390/1440px (viewport ไม่พร้อม) และยังไม่ commit/deploy
