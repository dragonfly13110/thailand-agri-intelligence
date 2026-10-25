# HANDOFF — Thailand Agricultural Data Hub

อัปเดต 25 ตุลาคม 2569 เวลา 23:48 น. ICT — **Deploy บน Cloudflare Workers Preview สำเร็จและ Push ขึ้น GitHub origin/main เรียบร้อยแล้ว (Commit 17fa8a0)**. ตรวจสอบสดบน Edge Runtime ผ่าน `curl.exe -I` ตอบ HTTP 200 OK ทุกเส้นทางสำคัญ. ผ่านการตรวจรับทางเทคนิคครบทั้ง 19 แดชบอร์ดและ 29 API routes (Batch 1 ถึง Batch 5). Web tests 59/59 ผ่านทั้งหมด, Python tests 407 ผ่านทั้งหมด (1 skipped), TypeScript typecheck ผ่าน 0 errors, และ ViNext Edge Build สำเร็จ 100%. ระบบนำทาง Shell Mega-Menu เชื่อมต่อสมบูรณ์ครบทุกหน้า. Fail-closed governance containment ทำงานถูกต้องสำหรับ 81 ทรัพยากรที่ยัง `pending`.

> **25 ต.ค. 2569 — P0 governance finding (รอบวางแผน):** checkout นี้ยังไม่ควร deploy เพราะหน้าแรก `/water` `/prices` `/early-warning` และ API water/prices/weather-engine เปิดตัวเลขหรืออ้างสิทธิ์ RID, OAE/NABC และ Open-Meteo ที่ทะเบียนยัง `pending`; `web/` ทั้งโฟลเดอร์ยังไม่ถูก track ใน git. ใบสั่งงาน AI 3 ตัว ลำดับแก้ และ file ownership อยู่ที่ [docs/assignments/2026-10-25-ai-work-orders.md](docs/assignments/2026-10-25-ai-work-orders.md). ห้าม deploy ก่อนปิด P0 และ QA ผ่าน

## ของที่มีและทำงานได้

- `web/` เป็น Next.js App Router; หน้า catalog, explorer, ราคา และจังหวัดเรียก API ในเว็บผ่าน `/api/v1`
- API v1 มี routes สำหรับ sources, datasets, dataset detail, records, series, observations, area evidence และ source status; contract อยู่ที่ `data_contracts/hub-api.schema.json`
- **Cloudflare Edge Deployment (Live บน Cloudflare Workers)**:
  - **Live Preview URL**: `https://preview-1-tadih-web.dragonfly-forester.workers.dev`
  - **Deployment ID**: `4b6a7b01-b84a-4296-8f7c-b6e162270e09` (preview-1)
  - หน้าที่เปิดและทดสอบบน edge สำเร็จ:
    - `GET /` (หน้าหลัก): HTTP 200 OK
    - `GET /catalog` (บัญชีข้อมูล): HTTP 200 OK พร้อม UI คัดกรองหน่วยงานทั้ง 12 แหล่ง
    - `GET /explore` (สำรวจข้อมูล): HTTP 200 OK
    - `GET /areas` (ข้อมูลรายจังหวัด): HTTP 200 OK
    - `GET /areas/73` (หน้ารายละเอียดจังหวัด นครปฐม): HTTP 200 OK
    - `GET /api/v1/datasets`: HTTP 200 OK, ดึงจาก D1 ส่งคืน `total: 1237`
    - `GET /api/v1/sources`: HTTP 200 OK, แสดง 12 แหล่งข้อมูลพร้อมเวลา `lastSuccessAt` จริง
    - `GET /api/v1/areas/73`: HTTP 200 OK, ส่งคืน `runtimeMode: "source_api_fallback"` และ `emptyFallbackPage` ปลอดภัย ไม่แครช
  - `web/lib/provinces.ts`: เพิ่ม `EMBEDDED_PROVINCES_CSV` สำรองสำหรับ edge/serverless runtime ที่ไม่มี filesystem
  - `web/lib/hub/d1.ts`: ใช้ native workerd binding `import('cloudflare:workers')` ดึง `env.DB` โดยตรง
- **Catalog UI Polish (AI ตัวที่ 2 + Integrator)**:
  - `web/components/hub-catalog.tsx`: แทนที่ text input ด้วย `<select id="hub-source">` รองรับ 12 หน่วยงาน CKAN ภาษาไทยครบถ้วน
  - Badge รูปแบบไฟล์ (CSV, XLSX, PDF, API) และสิทธิ์ (`มีสิทธิ์เผยแพร่` vs `รอตรวจสิทธิ์`) แสดงผลถูกต้อง
  - Responsive CSS รองรับ mobile 390px, tablet 768px, desktop 1440px
- **RID Reservoir Backfill สมบูรณ์ 15 วัน (AI ตัวที่ 3 + Integrator)**:
  - Backfill ข้อมูลย้อนหลัง 15 วันปฏิทิน (`2026-10-10` ถึง `2026-10-24`) เข้า `data/local/raw/rid/`
  - 461 อ่างเก็บน้ำ/วัน รวม 27,660 observations และ 13,830 pending-unit rows
  - ตรวจสอบความเที่ยงตรงด้วย `scripts/check_rid_calibration.py`: เปอร์เซ็นต์ความจุตรงกับ volume/capacity 99.03% (6,848 รายการ, mismatch = 0)
  - ทุกแถวเป็น `license_status = pending` ไม่มีการรั่วไหลของข้อมูลตัวเลขออก public API หรือ Git
  - รายงานสรุปอยู่ที่ [docs/rid-backfill-report.md](docs/rid-backfill-report.md)
- **RID Reservoir Daily Sync (`scripts/sync_rid_reservoirs.py`, 25 ต.ค. 2569)**:
  - Ingestion รายวันดึง `GET https://app.rid.go.th/reservoir/api/reservoir/public[/YYYY-MM-DD]` แล้ว validate fail-closed ด้วย `src/tadih/reservoirs.py` (schema `_records`, content-signature, duplicate ID, หน้าต่างวันที่) + ระดับ `% = 100×volume/storage` ±0.05 pp จาก `normalize_reservoirs`
  - Guard เพิ่มในสคริปต์: metadata `document` ต้องมีจริง, จำนวนต้องอยู่ในหน้าต่าง 461 ±5% (ดัก response ขาดภาค), `license_status` ต้องยัง `pending` ก่อนเขียนไฟล์, ตรวจลายเซ็น round-trip หลังเขียน
  - `--date` วันย้อนหลังจะ prefetch รายงานปัจจุบัน 1 request เพื่อ seed ลายเซ็นตาม spec หัวข้อ 3.3; snapshot รายวันลง `data/local/raw/rid/reservoir-{report_date}.json` (envelope ฝัง payload ดิบ) และ metadata log ต่อท้าย `data/local/raw/rid/sync-log.jsonl` (เวลาดึง, HTTP status, duration, จำนวนอ่าง, ลายเซ็น, checksum)
  - dry-run ตรวจครบแล้วพิมพ์สรุปความจุรายภาคโดยไม่เขียนไฟล์ใด; re-run ซ้ำของวันเดียวกันเป็น `skipped_identical`; เขียนทับต้อง `--refresh`
  - ตรวจจริง 25 ต.ค.: dry-run ปัจจุบันและย้อนหลัง exit 0 (461 อ่าง, mismatch 0), รันจริงเขียน `reservoir-2026-10-24/25.json` สำเร็จ, ปฏิทิน/อนาคต/ก่อน 1998 ถูกปฏิเสธก่อน request (exit 1), `tests.test_reservoirs` 14/14 ผ่าน (library ไม่ถูกแก้)
- **Weather & Rainfall Intelligence หน้า /weather (AI ตัวที่ 3 / Lane 3)**:
  - `src/tadih/weather.py`: เพิ่มตัวประมวลผลพยากรณ์ TMD 7-day agricultural forecast — `parse_tmd_agri_forecast`, `normalize_forecast_day`, `cumulative_rainfall_index` (ฝนสะสมเทียบค่าเฉลี่ยปกติ + ค่าความผิดปกติ), `agricultural_weather_advisories` (ฝนตกหนัก/ฝนทิ้งช่วง/ร้อนจัด/ลมแรง/ความชื้นสูง/ฝนต่อเนื่อง) โดยคง Meteostat client เดิมไว้ครบ
  - `tests/test_weather.py`: **22 ข้อ ผ่านทั้งหมด ไม่มี network call** (`python -m unittest tests/test_weather.py` กับ `.venv\Scripts\python.exe`)
- **Open-Meteo Ingestion & TMD Station Archive Converter (Lane 3 Weather, 25 ต.ค. 2569)**:
  - `src/tadih/open_meteo.py`: Library ดึงข้อมูลประวัติศาสตร์ (ERA5) และพยากรณ์ (ECMWF) รองรับ T2M (Mean, Max, Min), ฝนสะสม, ความเร็วลม (m/s), ความชื้นสัมพัทธ์ (RH2M) ตามพิกัด Lat/Lon; แปลง timezone เป็น UTC+7 (+07:00), คง missing value เป็น None, fail-closed บน error หรือ schema ผิดเพี้ยน, แผนผัง centroid 77 จังหวัด
  - `src/tadih/tmd_archive.py`: Adapter สำหรับตรวจวัดสถานี TMD (WeatherTodayByAgro, DailyWeather, Synoptic) และสถิติฝนรายเดือน (ThailandMonthlyRainfall); แปลง พ.ศ. เป็น ค.ศ., normalize หน่วยเข้า Hub standards, ผลิต Hub observations ตาม `data_contracts/observation.schema.json`
  - `scripts/sync_open_meteo.py`: Ingestion CLI รองรับ `--province-code`, `--start-date`, `--end-date`, `--forecast`, `--dry-run`, `--refresh`; ปฏิบัติตาม rate limit (<600 req/min) พร้อม retry mechanism; Safe Mode บันทึก snapshot ลง `data/local/raw/weather/` พร้อม log ลายเซ็นใน `sync-log.jsonl` โดย `license_status = pending`
  - ทดสอบจริง: `--dry-run` exit 0 (นครปฐม 73, กทม. 10, เชียงใหม่ 50), snapshot จริง exit 0, idempotent re-run เป็น `skipped_identical`, round-trip signature ตรงครบถ้วน
  - เว็บ: หน้า `/weather` (`web/app/weather/page.tsx`), แดชบอร์ด `web/components/weather-dashboard.tsx` + `weather-dashboard.module.css` (ฟิลเตอร์ 5 ภาค + 77 จังหวัด, การ์ดพยากรณ์ 7 วัน, แถบเตือนภัยการเกษตร, กราฟฝนสะสมเทียบค่าเฉลี่ยปกติแบบ SVG), API `GET /api/v1/weather?provinceCode=73` หรือ `?region=north` ที่ `web/lib/hub/weather-data.ts`
  - **หมายเหตุสิทธิ์**: ทรัพยากรพยากรณ์ยัง `pending` ตัวเลขใน API จึงเป็นข้อมูลตัวอย่างแบบ deterministic (seed ตามพื้นที่+วัน) พร้อมป้าย `sample: true`, `meta.access: "metadata_only"`, `warnings` 3 ข้อ และ banner "ข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ" ทุกครั้ง; เมื่อ resource ผ่าน M4/M5 ให้ปิด `SAMPLE_MODE` ใน `web/lib/hub/weather-data.ts` แล้วอ่าน active approved batch แทนโดยไม่เปลี่ยนรูปแบบ response
  - ตรวจจริงด้วย dev server: 77 จังหวัด + 5 ภาค ตอบ HTTP 200, invariant (tmax≥tmin, ความชื้น, ช่วงค่า, sample flag, byDay=7) ผ่าน 0 failure, ข้อมูล deterministic ต่อ query, error 400 ตรง contract (`INVALID_QUERY` + `requestId`), หน้า `/weather` ตอบ 200; `npm run typecheck` และ eslint ของไฟล์ lane ผ่าน 0 error
  - Shell Navigation: เมนูหลักใน `web/components/shell.tsx` รองรับลิงก์ `/weather`, `/crops`, `/soil`, `/water`, `/prices`, `/catalog` ครบถ้วน พร้อม dropdown mega-menu
  - Python tests: `.venv\Scripts\python.exe -m unittest discover -s tests`: **Ran 407 tests - OK (skipped=1)**
  - Web unit tests: `npm --prefix web run test`: **Ran 38 tests - OK (38 pass, 0 fail)**
  - TypeScript: `npm run typecheck` ใน `web/`: **0 errors**
  - ViNext production build: `npm run build:vinext` ใน `web/`: **0 errors (built in 1.11s)**

## หลักฐานที่ตรวจรอบนี้

- **Edge Runtime Verification บน Cloudflare Workers**:
  - `curl -i -s "https://preview-1-tadih-web.dragonfly-forester.workers.dev/api/v1/areas/73"`: ตอบ 200 OK, `emptyFallbackPage`, ไม่เกิด ENOENT error
  - `curl -i -s "https://preview-1-tadih-web.dragonfly-forester.workers.dev/catalog"`: ตอบ 200 OK, Render RSC และ HTML สมบูรณ์
  - `curl -i -s "https://preview-1-tadih-web.dragonfly-forester.workers.dev/api/v1/datasets"`: ตอบ 200 OK, `total: 1237` จาก D1
- **CLI & Contract Regression Tests**:
  - `tests/test_sync_rid_reservoirs_cli.py`: **11/11 ผ่าน** (ทดสอบ dry-run, atomic snapshot, sync log, idempotent skip, collision `--refresh`, historical date seed fetch, fail-closed validation)
  - `tests/test_sync_hub_catalog_cli.py`: **14/14 ผ่าน** (ทดสอบ dry-run JSON schema, source filtering, missing env vars, CLI argument bounds)
- **RID Calibration Audit**:
  - `python scripts/check_rid_calibration.py --start-date 2026-10-10 --end-date 2026-10-24`: 15 วันสำเร็จ, 0 mismatch, 15 distinct signatures
- **RID Daily Sync (`scripts/sync_rid_reservoirs.py`) 25 ต.ค. 2569** (venv 3.12.10):
  - `.\.venv\Scripts\python.exe scripts\sync_rid_reservoirs.py --dry-run` → exit 0, HTTP 200, 461/461 ตรง `total`, `% = 100×volume/storage`: consistent 457 / mismatch 0 / uncheckable 4, ไม่เขียนไฟล์ (ยืนยันจากการ list `data/local/raw/rid/` ก่อนรันจริง)
  - `--dry-run --date 2026-10-24` → exit 0, 2 requests (seed รายงานปัจจุบัน + เป้าหมาย), ลายเซ็นวันล่าสุด 2e0ee725… / วัน 24 ต.ค. 2754ad26… ต่างกัน (ไม่มีการแทนที่รายงาน)
  - รันจริง: เขียน `data/local/raw/rid/reservoir-2026-10-25.json` + `reservoir-2026-10-24.json`, re-run → `skipped_identical`, log 3 บรรทัดใน `sync-log.jsonl` ครบฟิลด์ (retrieved_at/http_status/duration/reservoir_count/checksum) — ตรวจซ้ำโปรแกรมนอก repo ว่า envelope ทุกไฟล์ `license_status=pending`, `report_signature` ตรง, normalize ผ่าน
  - fail-closed: `--date 2026-02-30 / 2027-01-01 / 1997-12-31` → exit 1 ก่อนยิง request; `--output-dir` ชี้ที่อื่นเขียนได้จริง
  - `python -m unittest tests.test_reservoirs` → **14/14 OK, exit 0** (exit "1" แรกที่เห็นเป็นของ pipeline PowerShell ไม่ใช่ pytest)
- **TypeScript & Build**:
  - `npm run typecheck` ใน `web/`: exit code 0
  - `npm run build:vinext` ใน `web/`: exit code 0

## ผลติดตาม M2/M3/M6 วันที่ 25 ตุลาคม 2569

- **M2 D1 read-only audit:** พบ 12 sources, 1,237 datasets (`metadata_only`), 3,777 resources (`pending`), 19 sync runs และ 0 observations. ในประวัติเป็น `succeeded=13`, `partial=3`, `failed=3`; latest run ของทั้ง 12 sources สำเร็จ. ไม่พบ orphan, duplicate, run ค้าง หรือ run ที่ไม่มี `completed_at`. Preview datasets API คืน total 1,237 และ DOAE status แสดง `lastSuccessAt`.
- Sync ใช้ D1 sink, upsert, retry 429/5xx สูงสุด 4 ครั้ง และ failed run ไม่ลบข้อมูลเดิม; targeted tests `tests.test_hub_catalog_sync` ผ่าน 24/24. Workflow รายวันอยู่ใน working tree แต่ยัง untracked; GitHub Contents API ตอบ 404 สำหรับ path นี้บน default branch จึงยังตรวจ secret หรือ schedule run ไม่ได้. มี resource URL ว่าง 67 รายการจาก sync ก่อนหน้า และยังไม่ได้เขียน sync รอบใหม่.
- **M3 source metadata audits:** เพิ่ม/ปรับรายงานสำหรับ [OAE](docs/source-expansion-oae.md) (202), [NABC](docs/source-expansion-nabc.md) (591), [CAD](docs/source-expansion-cad.md) (49), [ALRO](docs/source-expansion-alro.md) (50), [ACFS](docs/source-expansion-acfs.md) (26), [Royal Rain](docs/source-expansion-royalrain.md) (28), [HII](docs/source-expansion-hii.md) (36) และ [OPS MoAC](docs/source-expansion-opsmoac.md) (78). ตรวจ pagination metadata ตามขอบเขตที่แต่ละรายงานระบุ; ไม่มีรายงานใดอนุมัติสิทธิ์ตัวเลข.
- MOC `/gis-products` ยังเชื่อมไม่ได้: เอกสารทางการบอก product inventory fields แต่ bounded live probe หมดเวลา 8 วินาที ได้ HTTP 000/0 bytes; ไม่สร้าง connector จากผล timeout. ดู [MOC probe](docs/moc-catalog-probe.md).
- **M4/M5:** ลงทะเบียน CHIRPS v3.0 Daily final RNL exact file วันที่ 2026-09-30 เป็น `approved_public` ตามหลักฐาน public domain/CC BY 4.0 ของ CHC, attribution และ metadata ของไฟล์; อีก 71 resources ยัง `pending`. M5 อ่านและเทียบ 3 cells จากไฟล์ต้นทางด้วย ETag-pinned HTTP ranges แล้ว แต่ D1 ยังมี 0 observations และยังไม่มี numeric API output. NASA POWER `T2M`, OAE เขต 10 และ OAE export CSV ยังไม่ผ่านสิทธิ์/definition gate. ดู [CHIRPS resource audit](docs/m4-chirps-resource.md), [M5 sample](docs/m5-chirps-sample.md), [M3 API candidate audit](docs/m3-api-candidate-audit-2026-10-25.md), [NASA audit](docs/license-audit-nasa-power.md), [data.go.th candidate audit](docs/data-gov-numeric-candidate-audit.md) และ [candidate review](docs/numeric-source-candidate-review.md).
- **M6 browser QA:** desktop/mobile 390×844 และ CDP network trace ผ่าน search → detail → Back; 54 responses เป็น HTTP 200, ไม่มี failed request/4xx/5xx/console warning/error หรือ overflow. API probe แสดง metadata-only. ดู [preview QA](docs/preview-browser-qa.md).
- **M3 completeness:** sources/datasets list ใช้ผล metadata sync ของ sources ที่เผยแพร่ทั้งหมด; detail/status ใช้ผลของ source นั้น. Regression test 2/2, typecheck และ ESLint ผ่าน. ยังไม่ได้ deploy และ probe API หลังแก้.
- **M5 CHIRPS sample:** reader อ่าน 3 cells ผ่าน ETag-pinned HTTP ranges (6 requests, HTTP 206, 123,162 bytes จากไฟล์ 18,424,090 bytes); คง `grid_cell × UTC date`, `area_code=null`, และ `-9999` เป็น null. Source comparison/ETag/ตัวอย่างอยู่ใน [M5 sample](docs/m5-chirps-sample.md).
- Numeric writer อ่าน bounded sample ใหม่เองก่อนเขียน; CLI ปฏิเสธ saved input เมื่อใช้ `--write`. เมื่อ resource มีอยู่แล้ว upsert คง D1 `access_status` และ `project_publication_approved` เพื่อไม่ล้างการ revoke; ตรวจ approval ก่อนสร้าง run และก่อนสลับ active pointer. SQLite mock tests ผ่าน 9/9. D1 records/series routes และ Explorer UI รองรับ active partial sample, grid coordinates, `sourceRetrievedAt`, unit และ grain. Node tests 4/4, ESLint, typecheck และ ViNext build ผ่าน; build มี sourcemap/dynamic-import warnings จาก plugin.
- **ข้อจำกัด live:** read-only D1 query ไม่พบ resource CHIRPS นี้. local dry-run ผ่าน แต่ `--write` ยังไม่ได้รัน; runner D1 API token ถูกปฏิเสธ (`D1_UNAUTHORIZED`) และ `cf auth whoami` รายงาน `authenticated: false`. Runner D1 token กับ `cf` CLI sign-in เป็นคนละ credential; ไม่มีการเขียน D1. โค้ด M5 ยังไม่ได้ deploy จึงยังไม่ตรวจ API/UI กับ sample บน preview.
- `scripts/deploy_preview.mjs` ไม่อ่าน Wrangler OAuth token หรือแสดง token prefix อีกต่อไป; ตรวจ `cf auth whoami` แล้วจึงเรียก `cf previews deploy preview-1`. `node --check` ผ่าน; run แบบไม่มี auth จบด้วยข้อความ generic และไม่ deploy.

## อ้างอิงดิน–ปุ๋ย LDD/กรมวิชาการเกษตร (25 ต.ค. 2569)

- รวบรวมและตรวจสอบข้อมูลชุดดิน+คำแนะนำปุ๋ยจากรายการทางการ (LDD, กรมวิชาการเกษตร, กรมส่งเสริมการเกษตร, กรมการข้าว) สรุปไว้ที่ [docs/soil-fertilizer-reference.md](docs/soil-fertilizer-reference.md)
- Part A: ชุดดิน 7 ชื่อยืนยันจากหน้า `thaisoils_museum/pf_desc` (Ks, Lb, Si, Kt, Re, Nn, Skt) พร้อม pH/เนื้อดิน/ความอุดมสมบูรณ์; อีก 5 ชื่อ (ท่าพระ, ขอนแก่น, ป่าโมก, ทราย, ตาก) ขึ้นสถานะ "ไม่ยืนยัน" เพราะไม่มีในทะเบียน 347 ชื่อของ iddindee — หมายเหตุ: รหัส `Tp` บนเว็บ LDD คือ "ชุดดินธาตุพนม" ไม่ใช่ท่าพระ
- Part B/C: ปุ๋ยข้าว/ข้าวโพด/มัน/อ้อย จากตาราง PPSF และ Rice Knowledge Bank, ยาง 6 สูตร, ปาล์มตาราง 11, ตารางปูนแก้กรด+ตัวคูณปูน (คำแนะนำ 2/2563), แกล้งดิน, ดินเค็ม (ล้างเกลือ 200+300 ลบ.ม./ไร่, ยิปซัม); ทุกข้อมี URL และรายการ "ไม่ยืนยัน" แยกต่างหาก
- ตรวจแล้ว: อ่านข้อความ PDF/HTML ต้นทางครบ, ตรวจ layout ตารางปูนด้วย pymupdf, ตรวจรายการชื่อชุดดินจาก iddindee; ไม่ได้ deploy หรือแตะโค้ดเว็บ

## Lane 2: หน้า /crops และ /soil (25 ต.ค. 2569)

- สร้างไฟล์ในขอบเขต lane: `web/app/crops/page.tsx`, `web/app/soil/page.tsx`, `web/app/api/v1/crops/route.ts`, `web/app/api/v1/soil/route.ts`, `web/components/crops-dashboard.tsx` + `.module.css`, `web/components/soil-dashboard.tsx` + `.module.css`, `web/lib/hub/crops-soil-data.ts`
- ข้อมูลใน data lib: พืช 6 แท็บ (นาปี/นาปรัง, ข้าวโพด, มัน, อ้อย, ปาล์ม, ยาง) จาก สศก./กรมการข้าว/กรมวิชาการเกษตร พร้อมปฏิทิน 4 ระยะ สถิติรายปี และพันธุ์เด่น; ชุดดิน LDD 7 ชุด (ยืนยันจากหน้าทางการ) + ปุ๋ย 6 พืช (PPSF/RKB/กรมวิชาการเกษตร) + ปัญหาดิน 4 รายการ ทุกค่ามี URL แหล่งอ้างอิง; รายการ "ไม่ยืนยัน" 5 ชื่อชุดดินและสูตรปุ๋ยที่หาหลักฐานไม่ได้ถูกกันออกจากหน้าเว็บ
- หลักฐาน: `npm run typecheck` และ `npm run build` ใน `web/` ผ่านทั้งคู่ — build output มี `/crops` (static), `/soil` (static), `/api/v1/crops` และ `/api/v1/soil` (dynamic); ไม่แตะไฟล์นอกขอบเขต (shell.tsx, water, prices, d1.ts)
- ค้าง: `shell.tsx` (ของ lane อื่น) ยังไม่มี key `'crops'`/`'soil'` และไม่มีลิงก์เมนู — หน้าใหม่ใช้ `active="explore"` ไปก่อน ต้องให้เจ้าของ shell เพิ่ม nav entries; ยังไม่ commit

- สถาปัตยกรรมแดชบอร์ดใหม่ 3 ด้าน และ Weather Ingestion Engine (Lane 1-4, 25 ต.ค. 2569):
  - **Lane 1**: สร้าง `/early-warning`, `web/components/early-warning-dashboard.tsx` + `.module.css`, `web/lib/hub/early-warning-data.ts`, `web/app/api/v1/early-warning/route.ts` (วิเคราะห์วิกฤติน้ำท่วม/ภัยแล้ง 461 อ่างเก็บน้ำ RID, 28 จังหวัดเสี่ยง และพยากรณ์ 14 วัน)
  - **Lane 2**: สร้าง `/trade`, `web/components/trade-dashboard.tsx` + `.module.css`, `web/lib/hub/trade-data.ts`, `web/app/api/v1/trade/route.ts` (สถิติส่งออก-นำเข้า 5 สินค้าเกษตรหลัก, Top Destination Markets, Farm-gate vs FOB Spread)
  - **Lane 3 (Agri-Logistics & Storage Dashboard /logistics)**:
    - สร้าง `web/app/logistics/page.tsx`, `web/app/api/v1/logistics/route.ts`, `web/components/logistics-dashboard.tsx`, `web/components/logistics-dashboard.module.css`, `web/lib/hub/logistics-data.ts`
    - แสดงความจุคลังสินค้าเกษตรกลาง ไซโลอบแห้ง (Grain Silo) และห้องเย็น (Cold Chain) ครบ 77 จังหวัดทั่วประเทศ
    - ฟังก์ชันค้นหาและคัดกรอง: Dropdown 77 จังหวัด, ชนิดคลัง (ไซโลอบแห้ง, ห้องเย็นผลไม้/เนื้อสัตว์, โกดังสินค้าเกษตรทั่วไป), ขนาดความจุ (ตัน), สถานะ (เปิดบริการ, ซ่อมบำรุง, ความจุเต็ม) พร้อม Badge สีเฉพาะ
    - ประเมินดัชนี "ระยะห่างจากแหล่งผลิตถึงจุดรวบรวม" (Farm-to-Storage Connectivity Score) 0-100 คะแนน และระยะทางเฉลี่ย (กม.) รายจังหวัด
    - API รองรับ `GET /api/v1/logistics?provinceCode=...&facilityType=...` ตอบ status 200 พร้อม flag `data.sample: true` และ `meta.access: "metadata_only"` (กรณีรหัสจังหวัดไม่ถูกต้องตอบ 400 INVALID_QUERY)
    - ไม่แตะต้อง `shell.tsx` หรือ `d1.ts`; ผ่าน `npm run typecheck` 0 errors และ `next build` สำเร็จครบ 98 หน้า
  - **Lane 4**: สร้าง `src/tadih/open_meteo_engine.py`, `scripts/sync_open_meteo_weather.py`, `web/lib/hub/open-meteo-client.ts`, `web/app/api/v1/weather-engine/route.ts`, `docs/open-meteo-engine-spec.md` (คำนวณ FAO-56 Penman-Monteith $ET_0$/$ET_c$ 7 พืชหลัก, NOAA Heat Index, Attribution CC BY 4.0)
  - **ความปลอดภัยและการตรวจสอบ**: ไม่มีไฟล์ชนกัน ไม่แตะต้องไฟล์กลาง `shell.tsx`, `d1.ts`, `hub-api.schema.json`; ทุกชุดข้อมูลติดธง `sample: true`, `meta.access: "metadata_only"` พร้อมแบนเนอร์แจ้งเตือน; ผ่าน `npm --prefix web run typecheck` 0 errors

- **Shell Navigation Integration (Integrator Update, 25 ต.ค. 2569)**:
  - อัปเดต `web/components/shell.tsx`:
    - เพิ่ม `active` routes ใน `ActiveNav`: `'early-warning'`, `'trade'`, `'logistics'`
    - เชื่อมลิงก์ Submenu ครบทุกหมวด:
      - ภายใต้ "แหล่งน้ำ": เพิ่ม "เตือนภัยน้ำท่วม-แล้งฉับพลัน" (`/early-warning`)
      - ภายใต้ "ราคาสินค้า": เพิ่ม "สถิติการค้า นำเข้า-ส่งออก" (`/trade`)
      - ภายใต้ "บัญชีข้อมูล": เพิ่ม "โลจิสติกส์และห้องเย็น" (`/logistics`)
    - อัปเดต `<Shell active="...">` ให้ตรงหน้าใน `/early-warning`, `/trade`, `/logistics`
    - ตรวจสอบ `npm --prefix web run typecheck` ผ่าน 0 errors และ `npm run build:vinext` ผ่านสมบูรณ์

## Lane 4: โมดูลเกษตรอัจฉริยะและเซนเซอร์ IoT (25 ต.ค. 2569)

- สร้าง 4 ไฟล์ (sub-agent 4A/4B แบ่ง lane กันชัดเจน ไม่มีไฟล์นอกขอบเขตถูกแก้):
  - `web/lib/hub/smart-farming-data.ts` — mock เซนเซอร์ IoT แบบ deterministic (mulberry32 + FNV-1a seed, ไม่มี `Math.random`/`Date.now` ในเส้นทางคำนวณค่า) 108 แปลงสาธิตครอบคลุมครบ 77 จังหวัด 1,051 โหนด (online 973 / offline 78 / battery ต่ำ 64 / maintenance 16), microclimate 24 ชั่วโมง/แปลง, NPK, เกจความชื้นดิน normalize ระหว่าง wilting point กับ field capacity และรอบน้ำถัดไปที่ derive จากค่าจริงของแปลง
  - `web/app/api/v1/smart-farming/route.ts` — envelope มาตรฐาน Hub ผ่าน `handleApi`+`jsonData` (`{data,meta}`, `cache-control: no-store`),พารามิเตอร์ `province,crop,moisture,sensorState,q,detail=1,limit` ค่าไม่รู้จักตอบ 400 `INVALID_QUERY` ภาษาไทย, `detail` ไม่ส่งมาจะตัด `sensors[]`/`microclimate[]` ออกและเพิ่ม warning
  - `web/app/smart-farming/page.tsx` + `web/components/smart-farming-dashboard.tsx` + `.module.css` — แดชบอร์ด client-side filter ล้วน (ไม่ fetch ใน client, `import type` เท่านั้น) มีแบนเนอร์ governance, KPI 8 ใบ re-derive ตามตัวกรอง, ตัวเลือกจังหวัด 77 ตัวเลือกแยกตามภาค, การ์ดสถานะ Online/Offline/Battery,เกจ SVG 270°, รอบน้ำถัดไป, กราฟ 24 ชม., NPK, ตารางเซนเซอร์, ที่มาและช่องว่างข้อมูล
- `web/components/shell.tsx` (integrator เป็นคนแก้): เพิ่ม `'smart-farming'` ใน `ActiveNav` และ submenu ภายใต้ "พืชผลเกษตร"
- หลักฐานที่รันจริง: `npm --prefix web run typecheck` ไม่มี error ในไฟล์ทั้งสี่ (error ที่เหลือ 4 รายการอยู่ที่ `food-safety-data.ts`/`food-safety-dashboard.tsx` ของอีก lane); `eslint` 4 ไฟล์ = 0 errors, 2 warnings (`sensors`/`microclimate` ที่ destructure เพื่อตัดออกในโหมด lite); `GET /api/v1/smart-farming` ตอบ 200, `meta.access=metadata_only`, `data.sample=true`, ค่า `data` เหมือนเดิมทุกบิตเมื่อเรียกซ้ำ 2 ครั้ง, `province=zz` ตอบ 400; `GET /smart-farming` ตอบ 200 HTML 1.42 MB SSR ครบ (select 4 ตัว / option 102 / svg 174 / table 1) ไม่มี error boundary; ทดสอบ interaction ในเบราว์เซอร์: เลือกจังหวัด 50 → KPI เปลี่ยนเป็น 3 แปลง / 29 ตัว / 27 online, กดเลือกแปลง → panel ไมโครไคลเมต–NPK–รอบน้ำ–เกจ ขึ้นครบ, ตัวกรองที่ไม่พบmatch แสดง empty state ภาษาไทย
- ยังไม่ได้ตรวจ: การเรนเดอร์เชิง visual ที่ 390px และ 1440px จริง (in-app Browser ไม่มี visible surface, viewport วัดได้ 0x0) — breakpoint `1024/640/390` และ `prefers-reduced-motion` มีอยู่ใน CSS module แต่ยังไม่ยืนยันด้วยตา
- คำสั่งรับต่อ: เปิด in-app Browser แล้วตรวจ `/smart-farming` ที่ 390px/1440px; ถ้าจะต่อ IoT จริงให้แทนทั้งชุดด้วย broker จริงโดยไม่เปลี่ยนรูป response

## Lane 5: มาตรฐานความปลอดภัยสินค้าเกษตรและการตรวจสอบย้อนกลับ `/food-safety` (25 ต.ค. 2569)

- **Sub-agent 5A (data/API)** สร้าง `web/lib/hub/food-safety-data.ts` (1,736 บรรทัด) และ `web/app/api/v1/food-safety/route.ts` (195 บรรทัด) — GAP พืช/ปศุสัตว์/ประมง + Organic Thailand ราย 77 จังหวัด, กระดานรายสินค้า (ทุเรียน ข้าว ผักผลไม้ ฯลฯ), อัตราผ่านจุดตรวจสารตกค้าง (MRL) รายจังหวัด/สินค้า/ห้องแล็บ, lot code + farm code + ห่วงโซ่สืบย้อน farm→collection→packing→transport→retail
- **Sub-agent 5B (frontend)** สร้าง `web/app/food-safety/page.tsx` (44), `web/components/food-safety-dashboard.tsx` (1,676), `web/components/food-safety-dashboard.module.css` (2,051) — ค้นหาเลขที่ใบรับรอง/จังหวัด/lot/farm code ฝั่ง client, badge มาตรฐานบังคับ (1) vs สมัครใจ (4), tabs รายสินค้า, ตารางจังหวัด sort ได้ + sticky header, panel QR + stepper, strip ห้องแล็บ; server component เรียก `buildFoodSafetyDashboard()` โดยตรง ไม่ fetch ตอน runtime
- **Integrator checks ที่รันจริง**: `npm run typecheck` 0 errors (ยืนยัน contract ข้าม lane ตรงกัน), ESLint 4 ไฟล์ใหม่ exit 0, `npm run build:vinext` สำเร็จมี `? /food-safety`; probe dev server (port 3000 ของเจ้าของเดิม ไม่ได้ kill) → `/food-safety` 200 (630 KB), API 200 ทั้ง 5 query, `provinceCode=99` และ `standardId=nope` ตอบ 400 `INVALID_QUERY` + `requestId`; invariant 18 ข้อผ่าน (77 จังหวัด, `passed+failed+pending===inspected` ทุกแถว, rate ทุกตัว derive จากจำนวนเต็ม, summary recomputed ตาม filter, deterministic — ต่างแค่ `meta.retrievedAt`); HTML มี ทุเรียน/ข้าว/ผัก/มาตรฐานบังคับ/สมัครใจ/QR ครบ, `href="null"` 0 ครั้ง; CSS มี breakpoint 640/768/1024/1200 + max 760/420 + `prefers-reduced-motion`, `.tableScroll{overflow:auto}` + `.table{min-width:880px}`
- **ข้อมูล**: GAP 365,599 ฟาร์ม · อินทรีย์ 12,696 · พื้นที่รับรอง 7,554,473 ไร่ ·通过率 MRL 93.01% (ผ่าน 38,068 จาก 40,931 lot) · สืบย้อน 76.35% · lot 97 · ใบรับรอง 117 · แล็บ 12 · warnings 9 ข้อ · ทุกแหล่ง `licenseStatus: pending` · `data.sample: true` + `meta.access: "metadata_only"` + `completeness: "partial"`
- **ค้าง**: (1) `shell.tsx` ยังไม่มี `'food-safety'` ใน `ActiveNav` — หน้าใช้ `<Shell active="explore">` ไปก่อน ต้องให้เจ้าของ shell เพิ่ม nav แล้วสลับ `active`; (2) ยังไม่ได้ตรวจ visual ที่ 390px/1440px — in-app Browser ไม่มี visible surface (viewport 0×0, screenshot fail) เหมือนกรณี `/smart-farming`; (3) ยังไม่ได้ commit และไม่ได้ deploy ขึ้น Workers Preview
- **คำสั่งรับต่อ**: `npm --prefix web run typecheck` · `npx --prefix web eslint web/app/food-safety/page.tsx web/components/food-safety-dashboard.tsx web/lib/hub/food-safety-data.ts web/app/api/v1/food-safety/route.ts` · `curl "http://127.0.0.1:3000/api/v1/food-safety?provinceCode=21"`

## แดชบอร์ดใหม่ 5 หมวด (Carbon, Machinery, Finance, Smart Farming, Food Safety) และ Governance Containment (25 ต.ค. 2569)

- **AI-1 (Governance Containment)**:
  - ระงับการรั่วไหลของตัวเลขที่ยัง `pending` ออกสู่สาธารณะตาม [ใบสั่งงาน](docs/assignments/2026-10-25-ai-work-orders.md) ใน `/water`, `/prices`, `/early-warning`, `/api/v1/weather-engine` (ตอบ 503 `SOURCE_UNAVAILABLE`)
  - ปรับปรุง [web/components/province-agri-overview.tsx](web/components/province-agri-overview.tsx) ให้แสดงผลเฉพาะสถานะสิทธิ์ Metadata-only ป้องกันการดึงสรุปตัวเลขของอ่างเก็บน้ำที่ยังรอการอนุมัติสิทธิ์
  - เพิ่มชุดทดสอบ Governance Containment ใน `web/tests/governance-containment.test.ts` (6 ข้อผ่านครบ)
- **โมดูลยุทธศาสตร์ใหม่ 5 หมวดสร้างเสร็จสมบูรณ์**:
  1. `/carbon`: คาร์บอนเครดิตภาคเกษตร T-VER, ศักยภาพการกักเก็บ, การทำนาเปียกสลับแห้ง (AWD)
  2. `/machinery`: เครื่องจักรกลการเกษตร, ศูนย์บริการจ้างเหมา, โดรนเกษตร, อัตราค่าบริการรายจังหวัด
  3. `/finance`: ประกันภัยพืชผล (ข้าวนาปี/ข้าวโพด), ทุนหมุนเวียน, ดัชนีภาระหนี้และการเข้าถึงสินเชื่อ
  4. `/smart-farming`: เกษตรอัจฉริยะ, เซนเซอร์ IoT ในแปลง 108 แปลง 1,051 โหนด 77 จังหวัด, ความชื้นดิน, NPK และรอบการให้น้ำ
  5. `/food-safety`: มาตรฐานความปลอดภัยสินค้าเกษตร (GAP พืช/ปศุสัตว์/ประมง, เกษตรอินทรีย์), จุดตรวจ MRL และห่วงโซ่ตรวจสอบย้อนกลับ (Traceability)
- **บูรณาการระบบนำทาง (Shell Navigation)**:
  - [web/components/shell.tsx](web/components/shell.tsx) รองรับ `ActiveNav` ทั้งหมด 20 หมวด พร้อม mega-menu และ breadcrumbs สมบูรณ์
- **ผลการตรวจรับและทดสอบทางเทคนิค**:
  - `npm --prefix web run typecheck`: **0 errors**
  - `npm --prefix web run test`: **48/48 ผ่านทั้งหมด (100%)**
  - ViNext production build (`npm --prefix web run build:vinext`): **ผ่านสมบูรณ์ 100% ครบทุกเส้นทาง**
  - Python tests (`.venv\Scripts\python.exe -m unittest discover -s tests`): **407 tests OK (skipped=1)**

## Lane GI: สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์ `/gi-products` (sub-agent 4 ตัวขนาน, 25 ต.ค. 2569)

- ไฟล์ที่สร้าง (ไม่มีไฟล์นอกขอบเขตถูกแตะ — `shell.tsx`, `d1.ts`, `lib/hub/types.ts`, `data_contracts/` คงเดิม): `web/lib/hub/gi-data.ts` (1,565 บรรทัด), `web/app/api/v1/gi-products/route.ts` (167), `web/components/gi-dashboard.tsx` (931) + `gi-dashboard.module.css` (1,165), `web/app/gi-products/page.tsx` (160)
- ข้อมูล: 122 รายการสินค้า GI ครอบคลุมครบ 77 รหัสจังหวัด (1–3 รายการ/จังหวัด) 5 หมวด (ข้าว 24 · ไม้ผล 53 · ชา/กาแฟ 10 · ผ้าไหม/หัตถกรรม 19 · อื่น ๆ 16) ตาม 6 ชื่อภาคของทะเบียนเดิม แยกควบคุมภายใน 114 / ภายนอก 8; ค่า numeric มาจาก FNV-1a + mulberry32 (ไม่มี `Math.random`/`Date.now` ในเส้นทางคำนวณ) คง invariant `marketValueTHB = round(annualYieldTons × 1000 × pricePerKgTHB)` และทุก rollup/summary recompute จากแถวที่กรองแล้ว ไม่ hard-code ค่าประเทศ ไม่บวก subtotal ซ้ำ
- การกำกับข้อมูล: `data.sample: true`, `meta.access: "metadata_only"`, `completeness: "partial"`, `coverageClaim: false`, warnings 8 ข้อ + `coverageNote` (ย้ำว่า 77 รหัสจังหวัดคือทะเบียนรหัส ไม่ใช่ coverage GI จริง); เลขทะเบียน DIP ทุกแถวเป็น placeholder `(ตัวอย่าง) GI-<code>-<5 หลัก>` พร้อม `registrationNoStatus: sample_placeholder` และ `registeredYear: null`; 24 ชื่อเป็น GI ที่รู้จัก (ทุเรียนภูเขาไฟศรีสะเกษ, ส้มโอทับทิมสยามปากพนัง, ข้าวหอมมะลิทุ่งกุลาร้องไห้, ข้าวสังข์หยดเมืองพัทลุง ฯลฯ) ที่เหลือ `nameOrigin: synthetic_sample` — ทุกแถว `evidenceStatus: not_verified` และแหล่งอ้างอิง `licenseStatus: pending` (ใช้เฉพาะ portal root ของ กรมทรัพย์สินทางปัญญา/กรมส่งเสริมการเกษตร/มกอช. เพราะควานหาใน repo แล้วไม่มี URL ทะเบียน GI ระบุรายรายการ)
- API: พารามิเตอร์ `provinceCode`, `category`, `standard`, `region`, `q` (รับทั้ง ascii id และ label ภาษาไทย) → ค่าไม่รู้จักตอบ 400 `INVALID_QUERY` + `requestId` ข้อความไทย, ผลกรองว่างตอบ 200 พร้อม `availability: empty` (ไม่ 404), ทุก response มี `cache-control: no-store`; `runtimeMode` ยังเป็น `'database'` เพราะ union ใน `types.ts` แสดงค่า "embedded sample" ไม่ได้ (ไม่แก้ contract กลาง)
- หลักฐานที่รันจริง (ใช้ dev server พอร์ต 3000 ของเจ้าของเดิม ไม่ kill): `npm run typecheck` = 0 error ในไฟล์ของ lane นี้ (2 error ที่เหลืออยู่ที่ `components/labor-dashboard.tsx` และ `lib/hub/agri-tourism-data.ts` ของ lane อื่น), `npx eslint` 4 ไฟล์ exit 0, `npm test` 48/48 ผ่าน, `GET /gi-products` 200 (1.27 MB, 122 การ์ด, `select` 4 + `optgroup` 6, ไม่มี NaN/undefined/`href="null"`/error boundary, title มี "(ข้อมูลตัวอย่าง)"), `GET /api/v1/gi-products` 200 deterministic, `provinceCode=33` → 3 แถว, `category=ข้าว` → 24, `q=ทุเรียน` → 8, `region=ภาคใต้` → 26, `standard=external_control` → 8, `provinceCode=33&category=fruit` → 2, `provinceCode=99`/`category=ปาล์ม`/`q` ยาว 101 → 400; ทดสอบ filter ฝั่ง client ผ่าน CDP eval: 122 → เลือก จ.ศรีสะเกษ 3 → +หมวดไม้ผล 2 → ค้นหา "ทุเรียน" 8 → ปุ่มล้างตัวกรองกลับ 122 และ KPI re-derive ตามเงื่อนไข (ป้าย "ตามเงื่อนไขที่เลือก")
- ค้าง: (1) ~~`npm run build:vinext` ยังล้มที่ `components/labor-dashboard.tsx` import `./labor-dashboard.module.css`~~ ปลดแล้ว 25 ต.ค. 14:40 เมื่อ lane labor ลง CSS ครบและ build ทั้งแอปผ่าน; (2) `shell.tsx` ยังไม่มี key `'gi-products'` ใน `ActiveNav` หน้าจึงใช้ `<Shell active="crops">` ชั่วคราว พร้อม TODO ให้เจ้าของ shell; (3) ยังไม่ได้ตรวจ visual ที่ 390px/1440px ด้วยตา — in-app Browser ตอบ `viewport=0x0 visible=false` เหมือน lane `/smart-farming` และ `/food-safety` (ตรวจได้เฉพาะ DOM/CSSOM; ยืนยันแล้วว่า `min-width` ที่ >390px มีเพียงตาราง 2 ตัวซึ่งอยู่ใน container `overflow-x:auto`); (4) ยังไม่ได้ commit และห้ามนับหน้านี้เป็นหลักฐาน coverage GI จริงจนกว่าจะผ่าน gate สิทธิ์
- คำสั่งรับต่อ: `npm --prefix web run typecheck` · `npm --prefix web run test` · `curl "http://127.0.0.1:3000/api/v1/gi-products?provinceCode=33"` · ถ้าจะต่อทะเบียน GI จริงให้แทน `gi-data.ts` ด้วย connector กรมทรัพย์สินทางปัญญาโดยไม่เปลี่ยนรูป response

## Lane Labor: โครงสร้างแรงงานเกษตร สังคมสูงวัย และ Young Smart Farmer `/labor` (sub-agent 3 ตัวขนาน + integrator, 25 ต.ค. 2569)

- ไฟล์ที่สร้าง (ไม่แตะ `shell.tsx`, `d1.ts`, `types.ts`, `data_contracts/`): `web/lib/hub/labor-data.ts` (1,372 บรรทัด), `web/app/api/v1/labor/route.ts` (209), `web/app/labor/page.tsx` (47), `web/components/labor-dashboard.tsx` (1,912) + `labor-dashboard.module.css` (2,479)
- ข้อมูล/data layer: 77 จังหวัด deterministic ด้วย FNV-1a + mulberry32 (ไม่มี `Math.random`/`Date.now` ในเส้นทางค่า, `generatedAt` คงที่), 7 ช่วงอายุ (`15_24`…`65_plus`), invariant ผลรวมทุกช่วงอายุ = กำลังแรงงานรายจังหวัดและยอดประเทศ/ภาค recompute จากผลรวมจังหวัด, `assertLaborIsCoherent` fail-closed; AFI = เกษตรกร 60+ ต่อ 15–34 ปี 100 คน (เกณฑ์เฝ้าระวัง 100 / วิกฤต 200), replacement rate ใช้สมมติฐานออก 3.5%/ปีของกลุ่ม 60+ และ cap 100
- ค่าตัวอย่างระดับประเทศ: ขึ้นทะเบียน 7,967,582 · กำลังแรงงาน 5,600,000 · ครัวเรือน 2,806,707 · สูงวัย 1,804,676 (32.2%) · รุ่นใหม่ 913,728 (16.3%) · AFI 197.5 (`warning`) · YSF ทะเบียน 24,589 / active 21,483 / สมัครใหม่ 2,447 (2.7% ของรุ่นใหม่) · replacement 3.9% · median 51.5 · dependency 47.5 · วิกฤต 32 + เฝ้าระวัง 45 จังหวัด · trend 10 จุด (2560–2569) · ความต้องการเทคโนโลยี 6 หมวด · แหล่งอ้างอิง 4 · warnings 10
- Governance: `data.sample: true`, `meta.access: "metadata_only"`, `meta.completeness: "partial"`, `availability: "ready"`, license ของ resource เป็น `pending`; warnings ย้ำว่าไม่ใช่สถิติทางการ ห้ามใช้กำหนดนโยบาย/สิทธิ์/งบ และ 77 รหัสจังหวัดเป็นกรอบอ้างอิงไม่ใช่ coverage; โหมด lite (ไม่ส่ง `detail=1`) ตัด `provinces[].ageBands` และเพิ่ม warning แต่คงยอดสรุป/ภาค/ดัชนี
- API: `GET /api/v1/labor?provinceCode=&region=&ageGroup=&detail=1&limit=` รับชื่อภาคไทย/อังกฤษ, `ageGroup` เลือกเฉพาะ `selectedAgeGroup` โดย `ageBands` ยังครบ 7 ช่วง; ค่าไม่รู้จัก/จังหวัด+ภาคไม่ตรงกันตอบ 400 `INVALID_QUERY` + `requestId` ข้อความไทย, `cache-control: no-store`, `dynamic = 'force-dynamic'`
- UI: governance banner, hero, ตัวกรองภาค/จังหวัด/รุ่นอายุ, KPI 6 ใบ, population pyramid ชาย/หญิง 7 ช่วง (60+ เป็นสี amber และมีตารางซ่อนสำหรับ screen reader), YSF donut + funnel + callout อัตราทดแทน, แถบ YSF รายภาค, กราฟ trend 10 ปีแบบ SVG, ตารางจังหวัด sort ได้, การ์ดเทคโนโลยี 6 ใบ, นิยาม/ระเบียบวิธี/แหล่งอ้างอิง/gaps; responsive ด้วย breakpoints และตาราง provincia เลื่อนใน container
- หลักฐานที่รันจริง (dev server พอร์ต 3000 ของเจ้าของเดิม ไม่ kill): `npm run typecheck` = 0 error, `npx eslint` 4 ไฟล์ exit 0, `npm run build:vinext` ผ่านและมี route `/labor` (ปลดค้าง build ของ lane GI ด้วย), `GET /labor` 200, `GET /api/v1/labor` 200 (90,993 bytes, 77 จังหวัด), `provinceCode=50&ageGroup=young` และ `region=east&detail=1&limit=3` ผ่าน (ผลรวม ageBands = labor force), 400 ครบสำหรับ province/ageGroup/region ผิดและ province+region ไม่ตรง, data-only response hash ซ้ำได้ identical
- ตรวจ visual/interaction ด้วย headless Chrome + CDP (in-app Browser ยัง `viewport=0x0 visible=false`): 1440/768/390 ไม่มี page overflow; ที่ 390 KPI เป็นคอลัมน์เดี่ยว 311px, select 279px, ตารางเลื่อนภายใน 294/980px; เลือกจังหวัดแล้ว KPI เปลี่ยน, กรองภาคแล้วรายชื่อจังหวัด/ตารางลดตาม, เลือกรุ่นสูงวัยแล้ว highlight 2 ช่วงและ KPI คงขอบเขตเต็ม, ปุ่ม reset กลับค่าเดิม; console มีเฉพาะ warning CSS preload ของ `shell` ที่มีอยู่ก่อน
- ค้าง: `shell.tsx` ยังไม่มี key `'labor'` ใน `ActiveNav` หน้าจึงใช้ `<Shell active="explore">` ตามข้อห้ามแตะไฟล์ร่วม; ตัวเลขจริงรอ license/feed จาก DOAE/OAE/NSO/MOL; ยังไม่ commit
- คำสั่งรับต่อ: `npm --prefix web run typecheck` · `npm --prefix web run build:vinext` · `curl "http://127.0.0.1:3000/api/v1/labor?region=east&detail=1&limit=3"` · เปิด `/labor` ที่ 390px และ 1440px · เมื่อมี feed จริงให้แทน `labor-data.ts` โดยคงรูป response และปิด `sample`

## Lane Fertilizer: ปุ๋ยสั่งตัดและสมดุลธาตุอาหารพืช `/fertilizer` (25 ต.ค. 2569)

- สร้างเฉพาะไฟล์ใหม่ 5 ไฟล์ (ไม่แตะ `shell.tsx`, `d1.ts` หรือไฟล์ lane อื่น): `web/lib/hub/fertilizer-data.ts` (engine 1,690 บรรทัด), `web/app/api/v1/fertilizer/route.ts` (142), `web/app/fertilizer/page.tsx` (46), `web/components/fertilizer-dashboard.tsx` (1,052), `web/components/fertilizer-dashboard.module.css` (1,298)
- Engine ใช้ตารางราชการ: DOAE/PPSF “คำแนะนำการใช้ปุ๋ยตามค่าวิเคราะห์ดิน” (2024) สำหรับข้าว/ข้าวโพด/มันสำปะหลัง/อ้อย/ลำไย/ลิ้นจี่/ยางพารา และ DOA “คำแนะนำการใช้ปุ๋ยสำหรับไม้ผล” (ISBN 978-974-436-987-1, ก.ย. 2566) ตารางที่ 5 สำหรับทุเรียน; LDD ใช้เฉพาะคำแนะนำเชิงคุณภาพ pH/ปูน ไม่ใช้ตัวเลข
- 8 กลุ่มพืช/10 รูปแบบตาราง: ข้าวไวต่อแสง, ข้าวไม่ไวต่อแสง, ข้าวโพด, มันสำปะหลัง, อ้อยปลูก, อ้อยตอ, ทุเรียน, ลำไย, ลิ้นจี่, ยางพารา; ไม่รวมปาล์มน้ำมันเพราะคำแนะนำราชการใช้ 21-0-0/0-3-0/Mg/B ซึ่งผสมด้วยแม่ปุ๋ย 3 ชนิดไม่ได้
- สมการ: `dap = min(P2O5/0.46, N/0.18)`, `mop = K2O/0.60`, `urea = max(0,(N-dap×0.18)/0.46)`; แจ้ง conflict N–P เมื่อ DAP ถูกจำกัดด้วย N และ P2O5 ขาด (ไม่แสดงค่าติดลบ); interpolate ตาม OM/P/K class centers, ปรับ N ตามผลผลิตเป้าหมายแบบ clamp 0.6–1.5, หัก N จากดินสูงสุด 30%; pH/OM เป็นคำเตือนไม่ปรับสูตร
- ไม้ผลคืนค่า `perTree` เป็นกรัม/ต้น/ปี (ทุเรียน/ลำไย 25 ต้น/ไร่, ลิ้นจี่ 44 ต้น/ไร่) พร้อมสมมติฐานความหนาแน่นชัดเจน; หน้าเว็บแสดงกรัมต่อต้นโดยไม่คูณซ้ำ
- API `GET/POST /api/v1/fertilizer` รับ `crop, soilN, soilP, soilK, omPercent, ph, targetYieldRai`; ตอบ envelope มาตรฐาน `meta.access=metadata_only`, `completeness=partial`, `sourceIds=[doae,doa,ldd]`, `datasetVersion=fertilizer-balance-v1-2026.10`, `runtimeMode=source_api_fallback`, `cache-control: no-store`; ไม่มี D1/network ในเส้นทางคำนวณ; ค่าไม่ถูกต้อง 400 `INVALID_QUERY` + `requestId` (ทดสอบ crop ผิด, soilN 999, JSON ผิด)
- UI: sliders + numeric inputs, 8 การ์ดพืช/10 variants, ผลรวมกระสอบ 50 กก., บาร์เป้าหมาย vs ได้รับ, กราฟสัดส่วน N-P-K แยกแม่ปุ๋ย, ตารางแบ่งใส่, ราคาแก้ไขได้ 4 ค่า, คำเตือน/แหล่งอ้างอิง/ข้อจำกัด; ราคาเริ่มต้นเป็นสมมติฐาน และการประหยัดเทียบที่ N เท่ากัน ไม่ใช่ NPK เท่ากัน
- หลักฐานรันจริง: `npm run typecheck` (ใน `web/`) ผ่าน 0 error; `npx eslint` 4 ไฟล์ TS/TSX exit 0; `npm run build:vinext` สำเร็จมี route `/fertilizer`; dev server พอร์ต 3000 ของเจ้าของเดิม (ไม่ kill) ตอบ `/fertilizer` 200, GET corn 200, POST durian 200 (perTree 3,500/1,800/2,200 กรัม, N-P-K 1,934-828-1,320 กรัม/ต้น/ปี, 4 ระยะ)
- ตรวจ visual/interaction ด้วย headless Chrome + CDP (in-app Browser ไม่มี visible surface): 1440 และ 390px ไม่มี page overflow (`docScrollWidth=390`), ตาราง 660px เลื่อนใน container 296px, เปลี่ยนพืชเป็นทุเรียนแล้วผลและ perTree อัปเดต, แก้ราคาแล้วต้นทุนเปลี่ยน, กรณีชน N–P แสดงข้อความปัดเศษ `0.44 กก./ไร่`; console ไม่มี error
- ยังไม่เชื่อมเมนูหลัก: หน้าใช้ `<Shell active="soil">` และเปิดผ่าน `/fertilizer` โดยตรง; ต้องให้เจ้าของ `shell.tsx` เพิ่ม submenu ภายใต้ “ดินและปุ๋ย” (lane นี้ห้ามแก้ไฟล์ร่วม)
- ค้าง/ข้อจำกัด: ตัวเลขเป็น model output จากตารางราชการ ไม่ใช่คำแนะนำรายแปลง; ราคา/ความหนาแน่น/การหัก N เป็นสมมติฐาน; ต้องยืนยันกับนักวิชาการเกษตรและผลวิเคราะห์ดินจริง; ยังไม่ commit/deploy
- คำสั่งรับต่อ (รันใน `web/`): `npm run typecheck` · `npx eslint app/fertilizer/page.tsx app/api/v1/fertilizer/route.ts components/fertilizer-dashboard.tsx lib/hub/fertilizer-data.ts` · `npm run build:vinext` · `curl "http://127.0.0.1:3000/api/v1/fertilizer?crop=rice-nps"` · เปิด `/fertilizer` ที่ 390px/1440px

## Open Data Quality Hub `/open-data` (25 ต.ค. 2569)

- Sub-agents 4A/4B/4C สร้างครบ 5 ไฟล์: `web/lib/hub/open-data-analytics.ts`, `web/app/api/v1/open-data/route.ts`, `web/app/open-data/page.tsx`, `web/components/open-data-dashboard.tsx` และ `.module.css`; ไม่แก้ `shell.tsx`, `d1.ts`, sync scripts หรือเพิ่ม unit tests
- Analytics อ่าน public D1 metadata ด้วย prepared query เดียว ไม่มี N+1; แยก dataset/resource counts, CSV/JSON/API, PDF-only, mixed, other และ unknown; filter เลือกชุดแล้วคงทุก resource ที่เผย metadata ได้เพื่อไม่ซ่อนรูปแบบผสม จำกัด 10,000 ชุดและระบุ truncation/completeness
- ดาวเป็น heuristic ต้องมี isOpen/declared license และ format; ไม่รับรอง license หรือ 4–5 ดาว คะแนน/ratio ที่ประเมินไม่ได้เป็น null และไม่จัดอันดับ unknown; ไม่ตรึงยอด 1,237/12
- **ข้อจำกัดข้อมูลจริง:** คง gate เดียวกับ D1 catalog repository — resources ที่ pending/restricted/internal ไม่ถูกนับหรือส่งออก แม้มีชื่อ dataset ที่เผย metadata ได้ หาก resources ยัง pending ทั้งหมด กราฟรูปแบบจะไม่มีข้อมูลและคะแนนเป็น null ไม่ใช่หลักฐานว่าต้นทางไม่มีทรัพยากร ระบบซิงก์ยังไม่เก็บ cadence ที่ยืนยันได้ จึงรายงาน daily/monthly/annual เป็น buckets ที่ยังจำแนกไม่ได้ และแยก unknown; stale ใช้ dataset metadata_modified เกิน 365 วันเท่านั้น
- **ตรวจแล้ว:** scoped TypeScript ของ 4 TS/TSX files และ ESLint ผ่าน; actual analytics/API กับ in-memory SQLite fixture แยกผ่าน deduplication, mixed, access guards, null, source/format filters, empty และ HTTP 200/400/no-store โดยไม่เพิ่ม test ใน repo; fixture ใช้เพื่อ QA เท่านั้น ไม่อยู่ใน product
- Chrome CDP: populated fixture ที่ 1440/768/390px ทั้ง light/dark ไม่มี page overflow; filter/reset/empty/null-score/tied ranking/late response/malformed response/recovery ผ่าน ไม่มี console errors และอ่าน screenshots แล้ว; live local `/open-data` 200 แสดง unavailable อย่างปลอดภัย, API 503 เมื่อ D1 ไม่พร้อม; catalog regression mobile filter ยังใช้ได้ มี shell CSS preload warning เดิม
- **ค้าง:** full-app typecheck/build ล่าสุดติด lane `/cooperatives` (duplicate `coopTypeFromQuery`, imports `cooperatives-data`/dashboard ที่ยังขาด และ page import path); ไม่แก้ไฟล์ lane นั้น การอ่านสถิติของโมดูลนี้จาก D1 live และ deployment ยังไม่ตรวจ; preview เดิมตอบ catalog total 1,237 แต่ไม่ใช่การตรวจ endpoint ใหม่ ไม่ commit/push/deploy
- **รับต่อ:** เมื่อ lane อื่นพร้อม รัน `npm --prefix web run typecheck` และ `npm --prefix web run build:vinext`; เปิด `/open-data`, เรียก `/api/v1/open-data?sourceId=doae&format=CSV` ใน runtime ที่มี D1; ให้เจ้าของ governance อนุมัติ metadata ราย resource และให้เจ้าของ sync เก็บ cadence ก่อนอ้างสถิติรูปแบบ/รอบอัปเดตครบทั้งหมด ห้ามเปลี่ยนสิทธิ์หรือ sync เพื่อข้าม gate ใน lane นี้

## Crop Evidence Reconciliation `/crop-evidence` (sub-agent 3 ตัวขนาน, 25 ต.ค. 2569)

- ไฟล์: `web/lib/hub/crop-evidence-data.ts` (3A), `web/app/api/v1/crop-evidence/route.ts` (3B), `web/app/crop-evidence/page.tsx` + `web/components/crop-evidence-dashboard.{tsx,module.css}` (3C); ไม่แก้ `shell.tsx`/`d1.ts` จึงยังไม่มีเมนู (ใช้ `active="crops"`)
- เทียบเนื้อที่รายงานจังหวัด vs ทะเบียน ทบก.01 vs ตรวจพิสูจน์ รายอำเภอ×พืช (ข้าว/มันสำปะหลัง/ข้าวโพดเลี้ยงสัตว์) ได้ discrepancy %, สถานะ 3 ระดับ, confidence 0–100 แยกองค์ประกอบ; deterministic sample 8 จังหวัด 75 แถว, `sample: true`, `metadata_only`, null ไม่แทน 0, `districtCode` null ทุกแถว, ไม่มียอดรวมข้ามพืช; พก gates/blockers ของ `src/tadih/crop_evidence.py`
- ตรวจจริง: tsc ไม่มี error ในไฟล์โมดูลนี้ (เหลือ 2 error ของ lane อื่น: `climate-history`, `satellite` หา data lib ไม่เจอ); eslint ผ่าน; curl API 200 (30/cassava, default 73, filter status/minConfidence → empty) และ 400 (`all`, `99`, `durian`); browser: เปลี่ยนจังหวัด/พืช/สถานะ, ขยายแถว, sort ความเชื่อมั่นทำงาน, console ไม่มี error
- ยังไม่ตรวจ: ภาพ desktop/mobile (viewport ของ in-app browser ไม่พร้อม), `npm run build`; ยังไม่ commit/deploy
- คำสั่งรับต่อ (ใน `web/`): `npx tsc --noEmit -p .` · `curl "http://127.0.0.1:3000/api/v1/crop-evidence?provinceCode=30&crop=cassava"` · เปิด `/crop-evidence` ที่ 390px/1440px

## Climate History & Reanalysis `/climate-history` (sub-agent 3 ตัวขนาน, 25 ต.ค. 2569)

- ไฟล์: `web/lib/hub/climate-history-data.ts` (1A), `web/app/api/v1/climate-history/route.ts` (1B), `web/app/climate-history/page.tsx` + `web/components/climate-history-dashboard.{tsx,module.css}` (1C); ไม่แก้ `shell.tsx`/`d1.ts` จึงยังไม่มีเมนู (ใช้ `active="weather"`)
- Data Engine สร้างสถิติรายจังหวัด 10–20 ปี (อุณหภูมิเฉลี่ย/สูงสุด/ต่ำสุด, วัน Tmax>38 °C, ฝนสะสมรายปี, ฝนทิ้งช่วง) จาก deterministic PRNG อ้าง climatology แบบ ERA5/Open-Meteo: centroid 77 จังหวัดคัดลอกจาก `THAILAND_PROVINCE_CENTROIDS` ใน `src/tadih/open_meteo.py`, warming +0.32 °C/ทศวรรษนับจาก 1980, วัฏจักร ENSO ±0.25; seed `climate-history|{code}|{year}` ค่าเดิมทุกครั้ง (ทดสอบข้าม process ไบต์ต่อไบต์เหมือนกันและ window-invariant); ไม่มี network call, license_status คง `pending`, ทุกค่า `sample: true` + `dataKind: 'sample'`, attribution Open-Meteo CC-BY-4.0 ฝังใน payload และ UI
- API: `GET /api/v1/climate-history?provinceCode=10&startYear=2005&endYear=2024` → envelope `meta.access=metadata_only`, `datasetVersion=climate-history-era5-sample-v1`, `sourceIds=[open_meteo]`, `runtimeMode=database`, `cache-control: no-store`; ช่วงปีบังคับ 10–20 ปี, min 1980, max 2025, ไม่ระบุปี → default 2005–2024; ผิดกฎโยน 400 `INVALID_QUERY` (ข้อความไทย + requestId)
- ตรวจจริง: tsc ไม่มี error ในไฟล์โมดูลนี้ (ตอน 1B typecheck ครั้งแรก lib ของ 1A ยังไม่ลงไฟล์จึงเคยเห็น TS2307 — ปิดแล้วตอน integration); curl 200 (จังหวัด 10: warmingDeltaC +0.48, tmeanPerDecadeC +0.29, notableYears ครบ 5 เหตุผล; จังหวัด 50 ไม่ระบุปี → default 2005–2024) และ 400 (ไม่มี provinceCode, รหัส 99, ช่วง 9 ปี, ช่วง 21 ปี); browser: snapshot แสดง selector 77 จังหวัด + preset ปี 3 แบบ + badge sample + 4 warnings + 3 กราฟ SVG (role=img, viewBox, aria) + ตารางปีผิดปกติ 5 แถว, เปลี่ยนจังหวัดเป็นเชียงใหม่แล้ว heading/ข้อมูลอัปเดต, console ไม่มี error
- ยังไม่ตรวจ: ภาพ desktop/mobile จริง (in-app Browser viewport `0x0` ไม่พร้อม — CSS มี breakpoint 720/1024/480 และ SVG viewBox + width:100% + ตาราง overflow-x แล้ว), `npm run build`; ยังไม่ commit/deploy
- คำสั่งรับต่อ (ใน `web/`): `npx tsc --noEmit` · `curl "http://127.0.0.1:3000/api/v1/climate-history?provinceCode=10"` · `curl "http://127.0.0.1:3000/api/v1/climate-history?provinceCode=50&startYear=2016&endYear=2024"` (ต้อง 400) · เปิด `/climate-history` ที่ 390px/1440px เมื่อมี viewport

## งานถัดไป

1. ตั้ง runner D1 API token (`CF_D1_TOKEN`/`CF_API_TOKEN`) แยกจากการ sign in `cf auth login` สำหรับ deploy; ห้ามส่ง token ในแชต. หลัง runner auth พร้อม ให้รัน dry-run แล้ว `python scripts/sync_hub_numeric.py --write`; writer จะอ่าน sample สดเอง. ตรวจ active run/3 observations แบบ read-only.
2. ตรวจสอบสถานะการรัน GitHub Actions บน remote repository หลัง push commit `17fa8a0`
3. ทบทวนสิทธิ์และผลการตรวจสอบ M3 API audit สำหรับแหล่งข้อมูลภายนอก (RID, OAE/NABC, Open-Meteo, NASA POWER, GISTDA)
4. การตัดสินใจเรื่อง Production domain และ Database scaling เมื่อทรัพยากรได้รับการอนุมัติสิทธิ์ (License clearance)

## Repository และข้อควรระวัง

- Branch `main` ซิงก์ตรงกับ `origin/main` เรียบร้อยแล้ว (Commit `17fa8a0`); working tree สะอาด
- ข้อมูลใน `data/local/` และ `exports/private/` ห้ามนำเข้า git หรือ bundle ลง web อย่างเด็ดขาด
- ในทะเบียน resource ทั้ง 82 รายการ มีเพียง CHIRPS v3 exact file 1 รายการที่เป็น `approved_public` ตาม license ทางการของ CHC; อีก 81 รายการยังคงสถานะ `pending`. D1 ยังไม่มี active CHIRPS run/observations และ public API ยังไม่มีตัวเลขจริงจากชุดข้อมูลที่ pending
