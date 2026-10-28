AI 2 — Web catalog CSV UX

วันที่: 2026-10-28 · กิ่ง: `codex/checkpoint-2026-10-28` (ไม่สลับกิ่ง) · สถานะ: งานตามใบสั่งงานครบทั้ง 5 ข้อ + ปิด UX defects รอบ 2 + ปิด diff review รอบ 3 แล้ว, เทสต์ 315/315, typecheck ผ่าน, **source freeze** (หยุดแก้ source หลังรอบ 3) · browser proof รันซ้ำบน stable server 28 ต.ค. 23:15–23:17 น. และหลังแก้รอบ 3 เวลา 23:22–23:23 น. ผ่าน exit 0 ไม่มี reload · รันสุดท้ายแบบ output อยู่นอก repo ทั้งหมด 23:28–23:31 น. ผ่าน exit 0 (§11.7–§11.9)

## สรุปสั้น

- รอบ 1 แก้เฉพาะ `web/lib/hub/api-catalog.ts` และ `web/tests/api-catalog.test.ts` (อยู่ใน allowlist) — ตรวจแล้ว playground/contract/CSV export ทำงานถูกในระดับสัญญา
- รอบ 2 ปิด UX defects ที่รายงานเองใน `web/components/api-playground.tsx`, `web/lib/hub/api-playground-contract.ts`, `web/tests/api-playground.test.ts`: ข้อความ suggest ตรงกับการกระทำจริง, ไม่ prefill from/to ของ CSV, และ suggest เลือก dataset+resource ที่อนุมัติ+มี active run+มีแถวจริงให้อัตโนมัติ
- ทดสอบ playground 2 endpoint บน runtime ที่อ่าน D1 จริง: monthly-rainfall ได้ HTTP 200 `availability=ready` total 131, CSV export ได้ HTTP 200 `text/csv`
- พิสูจน์ดาวน์โหลด CSV ผ่าน Chrome จริง: `Browser.downloadWillBegin` + `downloadProgress=completed`, ไฟล์ 5,209 ไบต์ มี BOM, 34 คอลัมน์, 3 แถวข้อมูล; รอบ 2 ทดสอบซ้ำหลังแก้และได้ผลเดิม
- UX 1440/390 ของ 4 หน้า: h1 ครบ, ไม่มี overflow แนวนอน, console error 0 ทุกหน้า; รอบ 2 ตรวจซ้ำ `/api-docs` 1440/390 ไม่มี overflow และ console error 0
- ยังเหลือ 1 เรื่องที่ต้องแจ้งต่อ: `/livestock` ขึ้นกล่อง error เพราะ D1 ยังไม่มีชุดข้อมูล DLD (404 `DATASET_NOT_FOUND`) — อยู่นอก allowlist และห้าม AI 2 เขียน D1

## 1. สิ่งที่แก้ (เฉพาะ allowlist)

### `web/lib/hub/api-catalog.ts`

1. **`water-reservoirs` เดิมไม่ตรง route จริง** (แก้ทั้ง entry):
   - เดิม: `access: 'pending'`, `contract: 'domain'`, `responseType` เป็น shape เก่า, query มี `region`/`risk`/`q`
   - จริง: route ตอบ Hub v1 และกรองได้แค่ `date`, `page`, `pageSize`
   - แก้เป็น: `access: 'approved_public'`, `contract: 'hub-v1'`, `responseType: 'ApiResponse<WaterPayload>'`, query `date/page/pageSize`, เขียน notes ใหม่ให้ตรงสัญญา (summary คำนวณจาก report date เดียว, metadata_only คืน `reservoirs: []` + `summary: null` ไม่ใช่ 0, เกรน reservoir × report_date, unit MCM)
   - แก้ `description` ที่ยังโฆษณาตัวกรอง "ภาค/ระดับความเสี่ยง/คำค้น" ที่ไม่มีจริง และเลิก hardcode จำนวนอ่าง 461 แห่ง (ตัวเลขขึ้นกับ snapshot รายวัน)
2. **ลบข้อความค้าง 3 จุด** ที่เขียนว่า "D1 ปัจจุบันมี 0 observations" ใน `datasets-records`, `datasets-series`, `series-observations` — ขัดกับข้อมูลจริงใน D1 วันนี้ เปลี่ยนเป็นข้อความที่ไม่ผูกกับสถานะคลัง (ว่าง = `data: []` + `availability empty/metadata_only` ไม่ใช่ศูนย์)
3. **`livestock-beef-cattle`** เพิ่ม note เรื่อง `404 DATASET_NOT_FOUND` เมื่อคลังยังไม่มีชุดข้อมูลนี้ (เดิมระบุแค่ 503) — มาจากพฤติกรรมจริงที่เจอใน QA รอบนี้

### `web/tests/api-catalog.test.ts`

- เพิ่มเทสต์ `api catalog: every documented path is served by an existing route module` — แปลง path ทุก entry (21 endpoints) เป็นไฟล์ `web/app/api/v1/**/route.ts` แล้วเช็ก `existsSync` (กัน entry ลอย)
- เพิ่มเทสต์ `api catalog: water reservoirs documents the hub-v1 envelope and filters the route serves` — ล็อก path/contract/access/responseType/query names/notes ของ water ให้ตรง route
- ผล: `api-catalog.test.ts` 14/14 ผ่าน; ทั้งชุด 298/298 ผ่าน (baseline 296 + 2 เทสต์ใหม่)

### รอบ 2 (ปิด UX defects) — ไฟล์ที่แก้เพิ่ม

- `web/lib/hub/api-playground-contract.ts`: เพิ่ม `buildInitialQueryValues` (ข้าม example ของ date ที่ optional เฉพาะ contract `csv`), `describeSuggestOutcome` (แยกข้อความ "เติมจาก API" กับ "ใช้ค่าที่กรอกไว้"), `firstExportableResourceId`/`exportDatasetCandidates`/`readExportDatasets`/`readExportResources`/`readPaginationTotal` (คัด resource ที่อนุมัติ+มี active run+มีแถว)
- `web/components/api-playground.tsx`: ใช้ helper ข้างบน; suggest ของ export จะตรวจ id ที่กรอกก่อน แล้วสแกน `/api/v1/datasets?pageSize=100` (ready ก่อน, ไม่เอา metadata-only) → ตรวจ detail → ตรวจ records ว่ามีแถว → เติมทั้ง `id` และ `resourceId`; ไม่สร้าง route/API ใหม่
- `web/tests/api-playground.test.ts`: เพิ่ม regression tests 5 ชุด (date prefill, ข้อความ suggest, resource ที่ export ได้, ลำดับ candidate, parse payload จริง)
- ไม่แตะ `web/lib/hub/dataset-csv-export.ts`, `numeric-repository` หรือ UI ของ DLD

### รอบ 3 (ตาม diff review) — ไฟล์ที่แก้เพิ่ม

- `web/lib/hub/api-playground-contract.ts`: แทน `firstExportableResourceId` ด้วย `exportResourceCandidates(resources, currentResource)` — คงเฉพาะ resource ที่ approved + active run และยก resource ที่ผู้ใช้พิมพ์ไว้ขึ้นก่อนถ้ามันผ่านเงื่อนไข; ย่อ comment ของ `buildInitialQueryValues` เป็นบรรทัดเดียว (WHY) และลบ comment/property comment ที่เป็น WHAT ออก
- `web/components/api-playground.tsx`: export suggest ใช้ `firstResourceWithRows` ตรวจ `hasRows` ของทุก candidate ก่อนรายงานผล; typed pair ที่ approved+active แต่ไม่มีแถวจะไม่ขึ้นข้อความ "ส่งออกได้" อีก
- `web/tests/api-playground.test.ts`: เปลี่ยนเทสต์เดิมเป็น `export resource candidates only keep approved active resources and put the typed one first`
- ไม่สร้าง route/API ใหม่; ไม่เขียน D1

## 2. หลักฐาน: catalog ตรง route จริง

- ทุก path ใน catalog มี route module จริง (เทสต์อัตโนมัติข้างบน + ตรวจมือ)
- monthly-rainfall: query ที่ catalog ระบุ (`provinceCode`, `stationCode`, `year`, `page`, `pageSize`) ตรงกับ `parseMonthlyRainfallFilters` + `parsePage` ของ route; responseType `ApiResponse<MonthlyRainfallBody>` ตรงกับ payload จริง
- CSV export: path `/api/v1/datasets/{id}/export`, query `resourceId` (required), `from`, `to` ตรงกับ `parseExportQuery`; responseType `text/csv; charset=utf-8` ตรงกับ response จริง
- water-reservoirs: ตรวจซ้ำบนหน้า `/api-docs` หลังแก้ — การ์ดแสดง `มีสิทธิ์เผยแพร่` + `สัญญา Hub v1`, query `date, page, pageSize`, description/notes ชุดใหม่ และเรียกจริงได้ HTTP 200 (รายละเอียดข้อ 3)

## 3. Playground บน runtime ที่มี D1

Runtime: `next dev` เปิดที่ `127.0.0.1:3100` โหลด `.env.local` (D1 read-only) — ตัวเลขทั้งหมดข้างล่างมาจาก API จริงในคลัง ไม่ใช่ fixture/mock

**water-reservoirs (ตรวจประกอบการแก้ catalog):** request `/api/v1/water/reservoirs?date=2026-10-26&page=1&pageSize=25` → HTTP 200
- `meta.availability=ready`, `meta.access=approved_public`, `pagination.total=461`, หน้านี้ 25 อ่าง
- `summary`: reportDate `2026-10-26`, reservoirCount 461, totalVolumeMcm 4746.61, totalCapacityMcm 5827.8, min 2.79%, max 133.3%, aboveDesign 86, missing volume/percent 4/4, `unitStatus=volume=MCM`

**weather-monthly-rainfall:** request `/api/v1/weather/monthly-rainfall?year=2026&page=1&pageSize=25` → HTTP 200
- `availability=ready`, `access=approved_public`, `runtimeMode=database`, `pagination.total=131`, หน้านี้ 25 สถานี
- `summary`: stationCount 131, provincesWithReportingStation 71, valueCount 2358, missingValueCount 0, months 1–9
- `datasetVersion` 502c4b4d…f4ed11edf6, warnings 4 ข้อ, response ~101.5 KB ใช้เวลา ~3.0 วินาที
- ข้อความ warning บนผลลัพธ์ยืนยันเกรนสถานี × เดือน และหน่วยยัง `pending_official_confirmation`

**validation UX:** ใส่ `provinceCode=9` → แสดง `provinceCode: รูปแบบไม่ถูกต้อง` และปุ่ม submit ถูก disable (true)

**datasets-export (CSV):**
- กรณีใช้ค่าตัวอย่างจากฟอร์ม (`from=2026-10-01&to=2026-10-24`) กับ dataset CHIRPS ที่มีแถววันที่ 2026-09-30 → **HTTP 404 `EXPORT_NO_ROWS`** (388 B, ~1.0 วินาที, requestId `696908f0-…3a99`) — ถูกต้องตามสัญญา แต่เป็นกับดัก UX (ดูข้อ 6)
- ล้าง from/to แล้วเรียกใหม่ → **HTTP 200 `text/csv; charset=utf-8`** 5.1 KB (~0.96 วินาที)
- request ที่ใช้จริง: `/api/v1/datasets/chirps-v3.0-daily-final-rnl/export?resourceId=https%3A%2F%2Fdata.chc.ucsb.edu%2Fproducts%2FCHIRPS%2Fv3.0%2Fdaily%2Ffinal%2Frnl%2F2026%2Fchirps-v3.0.rnl.2026.09.30.tif`
- ปุ่มดาวน์โหลดแสดงชื่อไฟล์ปลอดภัย: `tadih-chirps-v3.0-daily-final-rnl-https-data.chc.ucsb.edu-products-CHIRPS-v3.0-daily-final-rnl-all_all-20261028154445.csv`

## 4. ดาวน์โหลด CSV ผ่าน browser จริง (งานที่ยังไม่เคยยืนยัน)

ใช้ Chrome headless + CDP (`Browser.setDownloadBehavior` events enabled) กดปุ่ม "ดาวน์โหลด CSV" ใน playground จริง:

- `Browser.downloadWillBegin`: URL เป็น blob, suggestedFilename ตรงชื่อข้างบน
- `Browser.downloadProgress`: `receivedBytes=5209 / totalBytes=5209`, `state=completed`
- ไฟล์บนดิสก์: 5,209 ไบต์ (ตรงกับ response panel 5.1 KB และตรงกับที่ curl วัดไว้ก่อนหน้า)
- เปิดอ่านไฟล์: มี UTF-8 BOM (`EF BB BF`), 34 คอลัมน์, 3 แถวข้อมูล
- header มี provenance ครบ: `datasetId, resourceId, resourceGrain, sourceIds, sourceUrl, datasetVersion, sourceRetrievedAt, sourceUpdatedAt, dataAsOf, publicationCompleteness, publicationWarnings, exportGeneratedAt, exportRowCount`
- แถวแรกมี `periodStart/periodEnd = 2026-09-30`, `unit=mm`, ค่า grid cell ของ CHIRPS

ไฟล์หลักฐาน (gitignored, อยู่ใน `.tmp_qa/`): `.tmp_qa/ai2-web/results.json`, `.tmp_qa/ai2-web/downloads/…csv`, `.tmp_qa/ai2-web/shots/*.png`

## 5. UX desktop 1440 / mobile 390

วัด `documentElement.scrollWidth` เทียบ `window.innerWidth`, เก็บ console error ระหว่างโหลด และถ่ายภาพหน้าจอ (8 ภาพใน `.tmp_qa/ai2-web/shots/`)

| หน้า | viewport | h1 | scrollWidth/innerWidth | overflow | console error |
|---|---|---|---|---|---|
| /livestock | 1440 | จำนวนโคเนื้อรายจังหวัด | 1440/1440 | ไม่มี | 0 |
| /trade | 1440 | มูลค่าการส่งออกสินค้าเกษตร | 1440/1440 | ไม่มี | 0 |
| /api-docs | 1440 | API สำหรับนักพัฒนา | 1425/1440 | ไม่มี | 0 |
| price-trend (/explore?view=price_trend) | 1440 | สำรวจข้อมูล | 1440/1440 | ไม่มี | 0 |
| /livestock | 390 | จำนวนโคเนื้อรายจังหวัด | 390/390 | ไม่มี | 0 |
| /trade | 390 | มูลค่าการส่งออกสินค้าเกษตร | 390/390 | ไม่มี | 0 |
| /api-docs | 390 | API สำหรับนักพัฒนา | 390/390 | ไม่มี | 0 |
| price-trend (/explore?view=price_trend) | 390 | สำรวจข้อมูล | 390/390 | ไม่มี | 0 |

หมายเหตุ `/api-docs` mobile: มี 2 element ล้นขอบวิวพอร์ต (`button...tab right=456`, `code right=1035`) แต่อยู่ในกล่องเลื่อนแนวนอนของ snippet/code และ `scrollWidth` ของหน้าอยู่ที่ 390 → ไม่ใช่ overflow ของหน้า

## 6. ปัญหาที่พบ

1. **`/livestock` แสดงกล่องแดง "ขณะนี้อ่านข้อมูลจริงจากคลังข้อมูลกลางไม่ได้ กรุณาลองใหม่ภายหลัง" (ยังไม่แก้ — นอก allowlist)**
   - API `/api/v1/livestock/beef-cattle` ตอบ **HTTP 404 `DATASET_NOT_FOUND`** (ไม่ใช่ 503) → ชุดข้อมูล DLD ยังไม่ถูกขึ้นทะเบียนใน D1 ปัจจุบัน
   - ผลคือ "ลองใหม่ภายหลัง" จะไม่ช่วยจนกว่าจะมีข้อมูล; ต้องให้ lane ข้อมูลลงทะเบียน/เผยแพร่ชุดนี้ (ห้าม AI 2 เขียน D1)
   - ผมเพิ่ม note เรื่อง 404 นี้ใน catalog แล้ว (รอบ 1) แต่ไม่ได้แก้หน้าเว็บ (นอก allowlist)
2. **playground suggest รายงานเกินจริง — แก้แล้วในรอบ 2** → §11.1: ข้อความแยก "เติมจาก API จริง" กับ "ใช้ค่าที่กรอกไว้"; กรณีใช้ค่าเดิมไม่มี request เลย
3. **ตัวอย่าง from/to ในฟอร์ม export ทำให้ได้ 404 — แก้แล้วในรอบ 2** → §11.2: ไม่ prefill date ที่ optional ของ CSV export อีก; ปุ่ม suggest เติม dataset+resource ที่พร้อมส่งออกให้ด้วย (§11.3)

## 7. Blocker ด้านสิ่งแวดล้อมที่เจอและวิธีแก้ (สำคัญต่อการ reproduce ของ AI 3)

`next dev` ที่ค้างจากรอบก่อนเขียน log ไว้ที่ `.tmp_qa/ai2-dev.log` **inside repo** ทำให้ Turbopack watcher เห็นไฟล์เปลี่ยนทุก request → "✓ Compiled" → Fast Refresh → หน้า reload ทุก ~3 วินาที → React hydrate ไม่เสร็จ ค่าในฟอร์มถูก reset

- อาการที่เห็น: `readyState=loading` ค้าง, `__react` keys = 0, `performance.now()` เริ่มใหม่ทุก snapshot, `Page.frameNavigated` ซ้ำที่ `/api-docs` พร้อม log `[Fast Refresh] rebuilding/done`
- แก้: restart dev server ให้ stdout/stderr ไปที่ `%TEMP%\tadih-ai2-dev.log` (นอก repo) และย้าย Chrome profile/downloads ไปนอก repo เช่นกัน → หน้าอยู่ตัว `readyState=complete`, hydrated, navigate ครั้งเดียวใน 18 วินาที
- คำแนะนำ: ตอน AI 3 reproduce ให้เริ่ม dev server แบบ log นอก repo (หรือใช้ build/start) ไม่งั้นจะเจอ reload loop และสรุปผิดว่า playground พัง
- **รอบ 2 เจอสาเหตุที่สองของ loop เดียวกัน:** หลังแก้ source แล้ว restart dev โดยไม่ล้าง cache หน้า `/api-docs` จะได้ `[Fast Refresh] rebuilding` → `Page.frameRequestedNavigation` → GET `/api-docs` ซ้ำทุก ~1.3 วินาที และ React hydrate ไม่เสร็จ (ตรวจด้วย CDP: `reactKeys=0`) ทั้งที่ log อยู่นอก repo แล้ว
  - แก้: stop dev → ลบ `web/.next` (gitignored) → start ใหม่ แล้ว warm หน้า → hydrate ผ่าน (`reactKeys=3`) และไม่มี navigation ซ้ำ 12 วินาที
  - ข้อสังเกต: `/trade` มี Fast Refresh ครั้งเดียวหลังโหลดแล้วนิ่ง; อาการ loop เกิดกับหน้า `/api-docs` ที่มี playground
  - ไฟล์ `web/next-env.d.ts` ถูก `next dev` เขียนเป็น `./.next/dev/types/...`; ผม restore กลับเป็น HEAD หลัง stop server แล้ว เพื่อไม่ให้ working tree มี generated diff
- **ปิด blocker นี้แล้ว (28 ต.ค. 23:15 น.):** ตรวจว่าไม่มี dev server/`vinext`/node ของ lane อื่นรันอยู่ → ลบเฉพาะ `web/.next` (gitignored) → start dev ใหม่ port 3100 โดย log อยู่ที่ `%TEMP%\tadih-ai2-dev-final.log` → รันชุด phase 2 ทั้งหมดซ้ำ ได้ `Compiling` แค่ครั้งแรก, `Fast Refresh` 0, `Reloading` 0 และหน้า `/api-docs` นิ่ง 15 วินาที (navigation event 0, hydration keys คงที่) — รายละเอียดใน §11.7

## 8. คำสั่งที่รันจริง + ผลจริง

```text
node --experimental-strip-types --test tests/api-catalog.test.ts   → 14 pass / 0 fail
npm --prefix web run test                                          → 298 pass / 0 fail (18.5s; รันซ้ำหลังแก้ครั้งสุดท้าย 298/298 18.1s)
npm --prefix web run typecheck                                     → ผ่าน (next typegen + tsc --noEmit)
npm run dev -- -p 3100 (log ที่ %TEMP%\tadih-ai2-dev.log)          → พร้อมใช้งาน, /api-docs 200
node .tmp_qa/ai2-web/run.mjs                                       → browser QA ครบ (playground, CSV download, UX 8 ภาพ)
curl GET /api/v1/water/reservoirs?...                              → 200, total 461
curl GET /api/v1/weather/monthly-rainfall?...                      → 200, total 131
curl GET /api/v1/datasets/doae:production_doae                     → 200 availability metadata_only, resources []
curl GET /api/v1/livestock/beef-cattle                             → 404 DATASET_NOT_FOUND
curl GET /api/v1/trade                                             → 200 availability empty, metadata_only
```

รอบ 2 หลังแก้ source (stop dev → `rm -rf web/.next` → start ใหม่ log นอก repo):

```text
node --experimental-strip-types --test tests/api-playground.test.ts → 8 pass / 0 fail
npm --prefix web run test                                          → 303 pass / 0 fail (18.3s)
npm --prefix web run typecheck                                     → ผ่าน
node .tmp_qa/ai2-web/run-phase2.mjs                                → golden/empty/invalid + suggest + monthly + download ผ่านครบ (exit 0)
node .tmp_qa/ai2-web/run-phase2.mjs (stable-server rerun 23:15 น.)  → exit 0; stability 15s idle, navigation event 0, Fast Refresh 0 (§11.7)
curl GET /api/v1/weather/monthly-rainfall?year=2026&page=1&pageSize=25 → 200, availability ready, total 131
curl GET /api/v1/weather/monthly-rainfall?provinceCode=10&stationCode=48300&year=2026 → 200, availability empty, total 0 (ตัวกรองสถานีถูกต้อง)
```

`/trade` ขึ้น empty state "ยังไม่มีระเบียนที่เผยแพร่ได้" (ตรงกับ API) และ price-trend ขึ้น "ยังไม่พบชุดข้อมูลราคาใน API" — เป็นสถานะว่างที่ถูกต้อง ไม่ใช่หน้าเสีย

## 9. ข้อจำกัด / สิ่งที่ไม่ได้ทำ

- ไม่ commit / push / deploy; ไม่เขียน D1 (อ่านอย่างเดียวทั้งรอบ); ไม่แตะ `.env*` หรือ `data/local/**`; ไฟล์ชั่วคราว/หลักฐานอยู่ใน `.tmp_qa/` (gitignored) และระหว่างรัน browser ไฟล์ทั้งหมด (log, Chrome profile, downloads, screenshots, results) อยู่ `%TEMP%` แล้วค่อย copy เข้า `.tmp_qa/` หลัง Chrome ปิด (§11.9)
- รอบ 1 ไม่ได้แก้ playground/contract; รอบ 2 แก้เฉพาะ `web/components/api-playground.tsx`, `web/lib/hub/api-playground-contract.ts`, `web/tests/api-playground.test.ts` ตาม allowlist ที่เพิ่มให้ — ไม่ได้แก้ `dataset-csv-export.ts`, `numeric-repository`, `d1-numeric-repository` หรือ UI ของ DLD
- ตรวจ path ↔ route ของทั้ง 21 endpoints อัตโนมัติ แต่ตรวจ "พารามิเตอร์ระดับลึก" เฉพาะ monthly-rainfall, CSV export, water, livestock, trade (endpoint อื่นมีเทสต์สัญญาเดิมอยู่แล้ว ไม่ได้ไล่ยิง runtime ทุกตัว)
- ไม่ได้ทดสอบการคลิกเมนูนำทาง/ฟอร์มอื่นบน 4 หน้า (โหลดหน้าเต็ม วัด layout และ console ตามใบสั่งงาน); รอบ 2 ตรวจ layout ซ้ำเฉพาะ `/api-docs`
- ไฟล์ที่ lane อื่นแก้ (`src/tadih/observations.py`, `tests/*.py`, `web/lib/hub/numeric-repository.ts`, `web/lib/hub/d1-numeric-repository.ts`, `web/tests/series-readers.test.ts`, `HANDOFF.md`, `docs/progress.md`) มีอยู่ใน working tree และผมไม่ได้แตะ; เทสต์ 303/303 รันบน working tree ที่มีไฟล์เหล่านี้
- `web/next-env.d.ts` ถูก `next dev` เขียนระหว่างทดสอบ แล้ว restore กลับเป็น HEAD หลัง stop server; working tree ของ lane นี้เหลือเฉพาะไฟล์ source ที่ตั้งใจแก้

## 10. คำสั่งรับต่อ

- AI 3: รัน `npm --prefix web run test`, `npm --prefix web run typecheck`, `npm --prefix web run build:vinext` **ในสำเนา `.tmp_qa/` หรือ worktree แยก** (อย่าให้ `next typegen` เขียน `web/next-env.d.ts`/`.next` ทับ checkout) แล้วเปิด `.tmp_qa/ai2-web/results.json`, `results-phase2.json`, `shots/`, `downloads/` และ `downloads-phase2/` เพื่อทวนหลักฐาน browser (แนะนำให้คัดลอก artifacts ออกจาก `.tmp_qa` ก่อน cleanup) — `results-phase2.json` รอบล่าสุดมีบล็อก `stability` (idle 15s, navigation event 0, `ok: true`) และ `typedEmptyPair` (intercept เฉพาะ GET, `claimsReady=false`) พร้อม `finishedAt = 2026-10-28T16:30:49Z` (รอบสุดท้ายหลัง hardening output ไป `%TEMP%` — §11.9); dev server ที่ใช้ปิดแล้ว ไม่มี process ค้าง
- Integrator/lane ข้อมูล: ลงทะเบียน + เผยแพร่ชุดข้อมูล DLD beef-cattle ใน D1 (ต้องมีสิทธิ์เขียน ซึ่ง AI 2 ไม่มี) แล้วตรวจ `/livestock` และ `/api/v1/livestock/beef-cattle` อีกครั้ง
- ถ้าต้องการให้ suggest เลือก dataset ที่ตรงโดเมนกว้างกว่านี้ (เช่น จำกัดตามกลุ่ม endpoint) ต้องออกแบบเพิ่ม — รอบ 2 ตั้งใจเลือกคู่ที่ "ส่งออกได้จริง" ตัวแรกใน catalog เท่านั้น

## 11. รอบ 2: ปิด UX defects + หลักฐานหลังแก้

### 11.1 ข้อความ suggest ตรงกับการกระทำจริง

- เดิม: ถ้าช่อง id มีค่าอยู่แล้ว ปุ่มจะไม่เรียก API แต่ขึ้นว่า "เติม id จาก API จริงแล้ว"
- ใหม่: `describeSuggestOutcome` แยก 3 กรณี — เติมจาก API จริง (success/partial), ใช้ค่าที่กรอกไว้ (kept/partial), และค้นไม่สำเร็จ (error) พร้อมบอกชื่อ param ที่เติม/ใช้ค่าเดิม
- หลักฐาน browser (`datasets-detail`, id prefilled `doae:production_doae`):
  - ข้อความ `ใช้ค่าที่กรอกไว้ (id) โดยไม่ได้ค้นหาใหม่`
  - `Network` events ระหว่างกดปุ่ม = **0 request** (ยืนยันว่าไม่ได้ค้นหา)
- หลังล้าง id แล้วกดซ้ำ: ข้อความ `เติม id จาก API จริงแล้ว (id) · ตรวจ id ก่อนเรียก API`, มี request `GET /api/v1/datasets?pageSize=1`, ได้ id `nabc:90silkcolor`
- เทสต์: `suggest messages describe whether ids were fetched or the typed value was reused`

### 11.2 CSV export ไม่ prefill from/to

- `buildInitialQueryValues` ข้าม example ของ query ที่เป็น `date` และ optional **เฉพาะ endpoint contract `csv`**; endpoint hub-v1 (เช่น water-reservoirs) ยังคง example เดิมเพื่อไม่เปลี่ยนพฤติกรรมหน้าแรก
- หลักฐาน browser: เปิด `datasets-export` ครั้งแรก `from=""`, `to=""`, `resourceId=""`, id ตัวอย่าง `doae:production_doae`; validation แสดง `resourceId: ต้องระบุค่า` และปุ่ม submit disabled
- Request URL หลัง suggest: `/api/v1/datasets/chirps-v3.0-daily-final-rnl/export?resourceId=…` — ไม่มี `from`/`to`
- เทสต์: `CSV export starts with empty optional dates so real rows are not filtered out`

### 11.3 suggest เลือก dataset + resource ที่พร้อมส่งออก

- กติกาที่ใช้ (ตรงกับ `assertPublishable` ของ route เดิม ไม่สร้าง route/API ใหม่):
  - dataset: ใช้ `availability` จาก `/api/v1/datasets` โดยเรียง `ready` ก่อน `empty` และ**ไม่เสนอ `metadata_only`** (จำกัด 10 candidates)
  - resource: `accessStatus === 'approved_public'` + `projectPublicationApproved === true` + มี `activeRunId`
  - ตรวจว่ามีแถวจริงด้วย `GET /api/v1/datasets/{id}/records?resourceId=…&pageSize=1` → `pagination.total > 0`
- ลำดับ request จริงตอนกด suggest:
  1. `GET /api/v1/datasets/doae%3Aproduction_doae` (id ตัวอย่างเดิม → เป็น metadata_only ไม่มี resource)
  2. `GET /api/v1/datasets?pageSize=100`
  3. `GET /api/v1/datasets/chirps-v3.0-daily-final-rnl`
  4. `GET /api/v1/datasets/chirps-v3.0-daily-final-rnl/records?resourceId=…&pageSize=1`
- ผล: เติม `id=chirps-v3.0-daily-final-rnl` และ `resourceId=https://data.chc.ucsb.edu/…/chirps-v3.0.rnl.2026.09.30.tif`, from/to ว่าง, submit enabled, ข้อความ `เติม id จาก API จริงแล้ว (id, resourceId)`
- เทสต์: `export suggest only accepts approved resources that have an active run`, `export dataset candidates prefer ready datasets and never offer metadata-only ones`, `export suggest parses the real list, detail and records payloads`

### 11.4 Golden / empty / invalid + download event (หลังแก้)

| เคส | request | ผล |
|---|---|---|
| golden | export ของ CHIRPS resource เดียว | **HTTP 200**, `text/csv`, 997.9 ms, 5.1 KB |
| empty | เพิ่ม `from=2030-01-01&to=2030-01-02` | **HTTP 404 `EXPORT_NO_ROWS`**, 1,202.9 ms, 388 B, requestId `3befda1a-…dad5b` |
| invalid | `resourceId=missing-resource-for-qa` | **HTTP 404 `EXPORT_RESOURCE_NOT_FOUND`**, 439.5 ms, 199 B, requestId `678baa6a-…3af2` |

- ดาวน์โหลดจริง: `Browser.downloadWillBegin` + `downloadProgress` ถึง `state=completed`, `receivedBytes=totalBytes=5209`
- ไฟล์: BOM UTF-8, 34 คอลัมน์, 3 แถวข้อมูล, provenance headers ครบ (`datasetId, resourceId, sourceIds, datasetVersion, …`), ชื่อไฟล์ปลอดภัย `tadih-chirps-v3.0-daily-final-rnl-…-20261028160923.csv`
- error panel แสดง `error.code`/`error.message`/`requestId` เป็น JSON ตามสัญญา Hub v1 ไม่มีหน้า crash

### 11.5 Regression: monthly-rainfall + layout

- monthly-rainfall (ล้าง province/station ตามรอบ 1): **HTTP 200**, `availability=ready`, `pagination.total=131`, หน้านี้ 25 สถานี; ใส่ `provinceCode=9` ได้ `provinceCode: รูปแบบไม่ถูกต้อง` และ submit disabled
- หมายเหตุ: ค่า default ของ monthly มี province `10` + station `48300` อยู่แล้ว; ถ้าไม่ล้างจะกรองเหลือ 0 แถว (`availability=empty`) — เป็นพฤติกรรมของตัวกรอง ไม่ใช่ regression และไม่เกี่ยวกับการแก้ date ของ CSV
- `/api-docs` 1440: `scrollWidth 1425 / innerWidth 1440` → ไม่ overflow, console error 0; 390: `390/390` → ไม่ overflow, console error 0 (element ที่ล้นเป็น tab/code ในกล่องเลื่อนของ snippets เหมือนรอบ 1)

### 11.6 Source freeze

- แก้ source รอบสุดท้ายเสร็จก่อนรัน browser รอบ 2; หลังได้ผลแล้ว **หยุดแก้ source** (ไฟล์ที่แก้: `web/components/api-playground.tsx`, `web/lib/hub/api-playground-contract.ts`, `web/lib/hub/api-catalog.ts`, `web/tests/api-playground.test.ts`, `web/tests/api-catalog.test.ts` + รายงานนี้)
- ปิด dev server แล้ว (port 3100 ตอบ 000); restore `web/next-env.d.ts` กลับ HEAD; ไม่ commit/push/deploy; ไม่เขียน D1
- หลักฐานรอบ 2 (gitignored): `.tmp_qa/ai2-web/results-phase2.json`, `downloads-phase2/`, `shots/export-golden-1440.png`, `shots/api-docs-{desktop-1440,mobile-390}-phase2.png`
- สคริปต์ที่ใช้: `.tmp_qa/ai2-web/run-phase2.mjs` (CDP; Chrome profile/downloads อยู่นอก repo ที่ `%TEMP%\tadih-ai2-qa-phase2`)
- รันซ้ำบน stable server หลังสถานะ source ทุก lane นิ่งแล้ว → §11.7

### 11.7 Final stable-server rerun (ปิด browser reload blocker + proof รอบสุดท้าย)

รัน 28 ต.ค. 2026 เวลา 23:15–23:17 น. (เครื่อง local) เพื่อปิดข้อกังวลเรื่อง reload loop ก่อน AI 3 ทำ global freeze

**สภาพแวดล้อม**

- ตรวจก่อนเริ่ม: ไม่มี dev server/`vinext`/node ของ lane อื่น listen อยู่ (port 3000/3100 ว่าง) และไม่มี process ใดถือ `web/.next` อยู่ → ลบเฉพาะ `web/.next` (gitignored) ได้อย่างปลอดภัย
- start `next dev --port 3100` แยก process; stdout/stderr → `%TEMP%\tadih-ai2-dev-final.log` (นอก repo)
- Chrome profile/downloads/shots → `%TEMP%\tadih-ai2-qa-phase2` (นอก repo); ไม่มีการ copy `.env*` หรือไฟล์ config ใดเข้า/ออก repo
- ไม่แตะ source, cache, หรือ process ของ lane อื่น; ไม่ kill server ที่ไม่ใช่ของตัวเอง

**Stability probe** (เพิ่มใน `run-phase2.mjs`: หลัง hydrate รอ 2s แล้ววัด idle 15s)

| ตัวชี้วัด | ก่อน idle | หลัง idle 15s |
|---|---|---|
| `document.readyState` | `complete` | `complete` |
| React props/fiber keys บน select | 2 | 2 |
| endpoint ที่ playground เลือก | `/api/v1/datasets` | `/api/v1/datasets` |
| navigation/load/frame events | — | **0** |

- dev log ทั้งชุด: `Compiling` **1** ครั้ง (ครั้งแรกที่ warm), `Fast Refresh` **0**, `Reloading` **0**
- สรุป: ไม่เกิด reload loop เมื่อ cache สะอาดและ log อยู่นอก repo; blocker ด้านนี้ปิด (ไม่เหลือ blocker ฝั่ง AI 2)

**ผลชุด phase 2 ทั้งหมด (exit 0)**

| เคส | ผล |
|---|---|
| initial export | `id=doae:production_doae`, `resourceId=""`, `from=""`, `to=""`, submit disabled |
| suggest | `เติม id จาก API จริงแล้ว (id, resourceId) · ตรวจ id ก่อนเรียก API`; request: `/api/v1/datasets/doae%3Aproduction_doae` → `?pageSize=100` → `chirps-v3.0-daily-final-rnl` → `records?…pageSize=1`; เติม `chirps-v3.0-daily-final-rnl` + resource URL |
| golden | HTTP 200 `text/csv; charset=utf-8`, 5.1 KB, 2,064.4 ms |
| download | `downloadWillBegin` + `downloadProgress` → `state=completed`, 5,209/5,209 bytes; BOM UTF-8, 34 คอลัมน์, 3 แถว, provenance ครบ; ชื่อ `tadih-chirps-…-20261028161643.csv` |
| empty | HTTP 404 `EXPORT_NO_ROWS`, 388 B, 992.8 ms, requestId `3604cc12-…6926` |
| invalid | HTTP 404 `EXPORT_RESOURCE_NOT_FOUND`, 199 B, 432.8 ms, requestId `94d48775-…05b0` |
| monthly | HTTP 200, `availability=ready`, total 131, 25 stations/หน้า; `provinceCode=9` → validation + submit disabled |
| layout `/api-docs` | 1440 → 1425/1440; 390 → 390/390; overflow false; console error 0 |

**Artifacts (gitignored, รีเฟรชรอบนี้):** `results-phase2.json` (`finishedAt=2026-10-28T16:17:05Z`, มีบล็อก `stability`), `run-phase2.out.txt`, `downloads-phase2/…20261028161643.csv`, `shots/export-golden-1440.png`, `shots/api-docs-{desktop-1440,mobile-390}-phase2.png`

**Freeze:** ไม่มีการแก้ source หลังรอบนี้; ปิด dev server (port 3100 = 000); restore `web/next-env.d.ts` เป็น HEAD; ไม่ commit/push/deploy; ไม่เขียน D1

### 11.8 Diff-review fix: typed approved pair ต้องมีแถวจริงก่อนบอกว่า export ได้

**ปัญหา (ตาม diff review):** branch `resourceId === currentResource` เดิมรายงาน `kept` พร้อมข้อความ "ตรวจกับ API แล้วว่า resource นี้ส่งออกได้" โดยไม่เรียก `hasRows`; การมี `activeRunId` ไม่ได้แปลว่ามีแถว (resource อาจ approved + active แต่ 0 แถว) และการเลือก resource ใช้ `firstExportableResourceId` เท่านั้น ทำให้ resource ที่ผู้ใช้พิมพ์ไว้ (แต่ไม่ใช่ตัวแรก) ถูกมองข้าม

**ที่แก้ (ไม่เพิ่ม route/API)**

- `exportResourceCandidates(resources, currentResource)`: คงเฉพาะ resource ที่ `approved_public` + `projectPublicationApproved` + มี `activeRunId`; ถ้า typed resource ผ่านเงื่อนไข จะถูกจัดขึ้นก่อน (ไม่ใช่หยิบตัวแรกเสมอ)
- `firstResourceWithRows(datasetId, preferred)`: วน candidate แล้วเรียก `hasRows` (`/records?pageSize=1` → `pagination.total > 0`) ทุกตัวก่อน `finish`/`kept`; ถ้า typed pair ไม่มีแถว จะลอง resource อื่น/ชุดอื่นที่มีแถว และถ้าไม่มีเลยจะขึ้นข้อความ empty
- ข้อความ `kept` เปลี่ยนเป็น "…ตรวจกับ API แล้วว่า resource นี้มีแถวให้ส่งออก" (ตรงกับการตรวจจริง)
- comment: ย่อ docblock ของ `buildInitialQueryValues` เป็นบรรทัดเดียว และลบ property comment/docstring ที่เป็น WHAT ออก

**หลักฐาน**

- Unit: `export resource candidates only keep approved active resources and put the typed one first` — typed ที่อยู่ลำดับสองถูกยกขึ้นหน้า; typed ที่ไม่ผ่านเงื่อนไขถูกตัด; `api-playground.test.ts` 8/8
- Browser regression (ไม่เขียน D1; intercept เฉพาะ GET `/records` ผ่าน CDP `Fetch`, ตอบ `total=0`):
  - ตั้ง `id=chirps-v3.0-daily-final-rnl` + `resourceId=…chirps-v3.0.rnl.2026.09.30.tif` (คู่ approved+active จริง) แล้วกด "เติม id จาก API จริง"
  - ผล: `claimsReady=false`; ข้อความ `API จริงยังไม่พบชุดข้อมูลที่มี resource อนุมัติและมีแถวให้ส่งออก; กรอก id และ resourceId เองได้`; id/resource ยังเป็นค่าที่พิมพ์ (ไม่ถูกเขียนทับ); `interceptHits=5` (typed pair + candidate อีก 4 ชุด)
  - request แรกคือ `GET /api/v1/datasets/chirps-v3.0-daily-final-rnl/records?resourceId=…` — ยืนยันว่าตรวจแถวของคู่ที่พิมพ์จริง (โค้ดเดิมใน diff รายงานผลก่อนถึงจุดนี้)
- Full suite: `npm --prefix web run test` → **315/315** (37.1s); `npm --prefix web run typecheck` → ผ่าน; browser suite exit 0
- Stability ยังผ่าน: idle 15s → navigation event 0, `Fast Refresh` 0, `Reloading` 0; golden 200 `text/csv`; ดาวน์โหลด 5,209 ไบต์ (BOM, 34 คอลัมน์, 3 แถว) ชื่อ `…20261028162249.csv`; monthly ready/131; layout 1440/390 ไม่ overflow, console error 0
- Artifacts (gitignored, รีเฟรช): `.tmp_qa/ai2-web/results-phase2.json` (`finishedAt=2026-10-28T16:23:16Z`, มี `typedEmptyPair`), `run-phase2.out.txt`, `downloads-phase2/…20261028162249.csv`, `shots/…-phase2.png`

**Freeze:** หยุดแก้ source หลังรอบนี้; ปิด dev server (port 3100 = 000); restore `web/next-env.d.ts` เป็น HEAD; ไม่ commit/push/deploy; ไม่เขียน D1

### 11.9 QA output path hardening (ตรวจ hypothesis เรื่อง reload)

**Hypothesis:** สคริปต์ QA อาจเขียน `results-phase2.partial.json` หรือ screenshot ลง `.tmp_qa` ระหว่างแต่ละ request ทำให้ Turbopack watcher สั่ง reload

**ผลตรวจ (จากโค้ดจริง ไม่ได้รันซ้ำเพื่อวินิจฉัย):**

- `captureShot` เขียนลง `%TEMP%\tadih-ai2-qa-phase2\shots`; Chrome profile + downloads ก็อยู่ `%TEMP%` → ระหว่าง interact กับหน้าเว็บไม่มี write เข้า repo
- `results-phase2.json` และการ copy artifacts เดิมเขียนเข้า `.tmp_qa` ครั้งเดียวตอนจบ; `results-phase2.partial.json` เขียนเฉพาะตอน script fail (ไฟล์ที่ค้าง timestamp 22:58 มาจาก run เก่า ไม่ใช่ per-request) — ลบไฟล์เก่าแล้ว
- run ก่อนหน้า (16:23Z) ยัง redirect stdout ไว้ใน `.tmp_qa` แต่ dev log เป็น `Fast Refresh` 0, `Reloading` 0 → hypothesis นี้ไม่ใช่สาเหตุของ reload ใน run ที่ผ่านมา

**Hardening (แก้เฉพาะ temp script ไม่ใช่ source):**

- results/partial เขียนลง `%TEMP%` ก่อน; เรียก `stopChrome()` และรอ Chrome ออก แล้วจึง copy artifacts + results เข้า `.tmp_qa`
- stdout/stderr ของ run ไปที่ `%TEMP%\tadih-ai2-phase2-run.log`; copy เป็น `.tmp_qa/ai2-web/run-phase2.out.txt` หลังจบ
- ผลคือ **ไม่มี write เข้า repo เลยระหว่างที่เบราว์เซอร์ยังทำงาน**

**Final run (28 ต.ค. 23:28–23:31 น.):** exit 0

| ตัวชี้วัด | ผล |
|---|---|
| stability idle 15s | navigation events **0**, `readyState=complete`, reactKeys 2, `ok=true` |
| dev log | `Compiling` 1 (ครั้งแรก), `Fast Refresh` **0**, `Reloading` **0** |
| typedEmptyPair | `claimsReady=false`, `interceptHits=5`, `interceptErrors=0`, typed pair ไม่ถูกเขียนทับ |
| golden / download | HTTP 200 `text/csv`; 5,209 B, BOM, 34 คอลัมน์, 3 แถว, ชื่อ `…20261028163024.csv` |
| monthly / layout | ready, total 131; 1440/390 ไม่ overflow, console error 0 |

- Artifacts: `results-phase2.json` (`finishedAt=2026-10-28T16:30:49Z`), `run-phase2.out.txt`, `downloads-phase2/…20261028163024.csv`, `shots/…-phase2.png`
- สรุป: output path ไม่ใช่สาเหตุ reload; ตอนนี้ไม่มี write เข้า repo ระหว่างรัน browser และ blocker ยังปิดอยู่

**Freeze:** หยุดแก้ source; ปิด dev server (port 3100 = 000); restore `web/next-env.d.ts` เป็น HEAD; ไม่ commit/push/deploy; ไม่เขียน D1
