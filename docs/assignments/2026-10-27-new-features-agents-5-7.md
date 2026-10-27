# คำสั่ง AI ตัวที่ 5, 6, 7: เพิ่มความสามารถจากข้อมูลจริงที่มีอยู่

เอกสารนี้เตรียมงานใหม่ตามเป้าหมาย Thailand Agricultural Data Hub ไม่ใช่ผลตรวจงานของ AI 1–4 และไม่ได้ยืนยันว่างานเหล่านั้นเสร็จแล้ว รอบนี้ยังไม่เริ่ม implementation หรือรัน QA ใด

## ผลลัพธ์ที่เลือกสำหรับรอบนี้

| AI | สิ่งที่ผู้ใช้จะทำได้ | เชื่อมกับแผนเดิม | ทางเข้าหน้าใช้งาน |
|---|---|---|---|
| 5 | ดูว่าแหล่งไหนดึงข้อมูลสำเร็จล่าสุด ล้มเหลว หรือยังไม่ทราบ | SYSTEM_DESIGN เป้าหมายผู้ใช้ข้อ 4: สถานะ connector และเวลาที่ดึง | ลิงก์จาก `/open-data` ไป `/data-status` |
| 6 | ดาวน์โหลดแถวข้อมูลที่ Hub เผยแพร่แล้วเป็น CSV พร้อมที่มาและข้อจำกัด | เป้าหมายการนำข้อมูลไปใช้ต่อ; ขยาย public download แบบจำกัดขอบเขต ไม่ใช่เปิดทุก dataset | ปุ่มใน `/explore` สำหรับ resource ที่เลือก |
| 7 | ดูค่าฝนรายเดือนของสถานีและช่วงเวลาที่มีข้อมูลจริง | เป้าหมายข้อ 2: ตาราง/กราฟจาก numeric resource; ต่อจาก M5 โดยใช้ resource TMD รายเดือนที่มีอยู่ | ลิงก์จาก `/weather` ไป `/monthly-rainfall` |

งาน 7 ใช้ข้อมูลสถานี × เดือนที่มีอยู่ ไม่เติมเรื่องประวัติ 10–20 ปี และไม่เปลี่ยน `/climate-history` ให้ดูเหมือนมีข้อมูลครบ งาน 5/6/7 ใช้ read contracts เดิมของ Hub ไม่ต้องรอให้ AI 1–4 เปลี่ยน interface

## กติกากลางสำหรับ AI 5–7

1. ทำงานใน `T:\coding+\BI AGRI THAILAND` อ่าน `AGENTS.md`, `web/AGENTS.md`, `HANDOFF.md`, `SYSTEM_DESIGN.md`, `IMPLEMENTATION_PLAN.md`, เอกสารนี้ และ allowlist ของ AI 1–4 ใน `docs/assignments/2026-10-27-audit-repair-4-agents.md` ก่อนเริ่ม อ่าน Next guide ที่เกี่ยวข้องใน `web/node_modules/next/dist/docs/` ก่อนแก้เว็บ
2. เริ่มจาก working tree ปัจจุบันรวม uncommitted/untracked files ที่จำเป็น ไม่เริ่มจาก HEAD อย่างเดียว บันทึกสภาพตั้งต้นเฉพาะไฟล์ที่ตัวเองจะเปลี่ยนใน `.tmp_qa/new-feature-lane-N/` และเก็บงานเดิมไว้
3. อ่านโค้ดที่ต้องใช้ได้ แต่แก้ได้เฉพาะ allowlist ของตัวเอง ห้ามตรวจทบทวนหรือซ่อมงานของ AI 1–4 ห้ามแก้ shared repositories, `http.ts`, `types.ts`, schemas, registry, configs, page registry, shell, globals, package/lock files หรือ workflows
4. ห้ามเปลี่ยน branch, stash/reset/clean/checkout, commit/push/deploy, ลง dependency ใหม่, เปลี่ยน credentials หรือเขียนฐาน D1 ในรอบนี้ ไม่รัน ingestion/publish ด้วย `--write` ใช้แถวที่อ่านผ่าน Hub ได้อยู่แล้ว
5. ไม่แก้ HANDOFF/progress/IMPLEMENTATION_PLAN พร้อมกัน แต่ละคนเขียน lane result file ของตน ผู้รวมงานจะนำผลจริงไปอัปเดตเอกสารกลาง
6. ใช้ components, styles, types, validators และ helpers เดิมก่อน สร้างแค่ความสามารถใน prompt ไม่เพิ่มระบบ login, background job, notification, map หรือ analytics ใหม่
7. null ต้องยังเป็น null สิทธิ์ใช้ข้อมูลตาม AGENTS.md ไม่เท่ากับการรู้หน่วย ค่าสถานี/กริด/อ่างไม่ใช่ค่าเฉลี่ยทั้งจังหวัด ห้ามสร้างตัวเลขจำลองเพื่อทำให้หน้าใหม่ดูมีข้อมูล
8. เพิ่ม test แบบ offline สำหรับ logic ใหม่และรันเฉพาะ tests ของตัวเอง ไม่ลด/skip tests เดิม ไม่อ่าน credentials ใน tests หากยังไม่มีข้อมูลจริงให้ทำ empty/unavailable state ที่บอกเหตุผลตามจริง และระบุ live acceptance ที่ยังค้าง
9. ระหว่าง 7 ตัวทำงานพร้อมกัน ห้ามรัน full suite/build/dev/next typegen/prepare-data/npm install หรือ auto-fix ทั้ง repo เพราะแก้ generated output ร่วมกันได้ ใช้ targeted Node tests กับ `tsc --noEmit --incremental false` ได้ ผู้รวมงานจะรัน build และ browser acceptance ของหน้าใหม่หลังทุก lane หยุดแก้
10. ปิดงานด้วยรายงานไฟล์ของตัวเอง: สิ่งที่สร้าง, URL/วิธีใช้, ไฟล์ที่แก้เพิ่มจากฐานเดิม, contract ที่ใช้/เพิ่ม, คำสั่งและผลตรวจจริง, ข้อจำกัด และสิ่งที่ยังต้องรวม/ตรวจ ห้ามประกาศว่า production ใช้งานแล้วหากยังไม่ deploy

## Prompt 5: หน้าสถานะแหล่งข้อมูล

```text
คุณคือ AI ตัวที่ 5 สร้างหน้า "สถานะแหล่งข้อมูล" ให้ผู้ใช้เห็นว่า Hub ดึงข้อมูลสำเร็จครั้งล่าสุดเมื่อใด และรอบล่าสุดมีปัญหาหรือไม่
โฟลเดอร์งาน: T:\coding+\BI AGRI THAILAND
อ่านและทำตามกติกากลางของ docs/assignments/2026-10-27-new-features-agents-5-7.md ก่อนเริ่ม ลงมือสร้างเฉพาะงานนี้จนมี vertical slice ที่เรียกใช้ได้ ไม่จบแค่ mockup/แผน

ไฟล์ที่แก้/สร้างได้เท่านั้น:
- web/app/data-status/page.tsx (ใหม่)
- web/components/data-status-dashboard.tsx (ใหม่)
- web/lib/hub/data-status.ts (ใหม่; types/helper เฉพาะ feature นี้)
- web/tests/data-status.test.ts (ใหม่)
- web/app/open-data/page.tsx (เพิ่มลิงก์ไป /data-status เท่านั้น)
- docs/assignments/new-features-2026-10-27/lane-5-result.md

สิ่งที่ต้องทำ:
1. อ่านรูปแบบจริงจาก /api/v1/sources และ /api/v1/sources/{id}/status รวม SourceStatus/SourceRun ใน lib/hub/types.ts ใช้ API เดิม ไม่สร้าง query/schema หรือ endpoint ซ้ำ
2. หน้า /data-status ใช้ Shell active="open-data" แสดงรายชื่อ/ค้นหาชื่อแหล่ง และสถานะแหล่งตามทะเบียน แยกจากสถานะ job ล่าสุดให้ชัด โหลดรายละเอียดและ recentRuns เมื่อเลือกแหล่ง ไม่ยิง status requests ของทุกแหล่งพร้อมกันโดยไม่จำเป็น
3. แสดง latest run status, เวลารอบล่าสุด, last successful sync และ recentRuns แยกชนิด metadata/numeric ใช้เวลา Asia/Bangkok มีลิงก์ต้นทางที่เป็น HTTP(S) และปุ่มลองอ่านใหม่สำหรับข้อผิดพลาด
4. แสดง failed/partial/running/succeeded/unknown อย่างตรงความหมาย failed ล่าสุดยังแสดง last success เก่าได้ แต่ห้ามทำเป็นสีเขียวว่า job ล่าสุดสำเร็จ lastSuccessAt=null ต้องเป็น "ยังไม่ทราบ" ไม่ใช่ไม่เคยมีข้อมูล
5. เวลา fetch สำเร็จไม่ยืนยันว่าข้อมูลต้นทางสด ห้ามเรียก last sync ว่า dataAsOf ห้ามรวม recordsRead/recordsWritten ต่างชนิด/ต่างหน่วยเป็นยอดข้อมูลพร้อมใช้ หรือสรุปว่ามีข้อมูลครบทุกจังหวัด
6. จัดการ pagination ของ /sources ตาม response ไม่ hard-code ว่ามี 12/23 แหล่ง แยก loading, empty, error และ source_api_fallback: fallback metadata ไม่มีหลักฐานว่างาน sync สำเร็จ
7. เพิ่มลิงก์จาก /open-data โดยไม่รื้อเนื้อหาเดิม ใช้ styles เดิมและตารางเลื่อนในมือถือได้ ไม่แก้เมนูกลาง/page-registry

เกณฑ์ส่งมอบ:
- ผู้ใช้เปิด /open-data -> /data-status -> เลือกแหล่ง -> อ่านประวัติและที่มาได้
- fixtures ครอบคลุม latest failed + previous success, partial, ไม่มี run, metadata-only fallback, request error และ pagination โดยไม่มีการแปลง unknown เป็น success
- ไม่เรียกต้นทางภายนอกจาก feature นี้ และไม่เปิดรายละเอียด error ที่มี URL credentials/token

ตรวจเฉพาะ feature ของตนจากโฟลเดอร์ web:
node --experimental-strip-types --test tests/data-status.test.ts
node_modules/.bin/tsc.cmd --noEmit --incremental false
ใช้รูปแบบ module hooks/fixture ที่มีใน web/tests เมื่อจำเป็น ไม่เพิ่ม dependency เพื่อทดสอบ

บันทึก lane-5-result.md พร้อมตัวอย่างสถานะที่ UI แสดง ผลทดสอบ และ flow ที่ต้องให้ผู้รวมงานเปิด desktop/mobile ตอนท้าย ไม่รีวิวหรือซ่อมงาน AI ตัวอื่น
```

## Prompt 6: ส่งออกข้อมูลที่เผยแพร่แล้วเป็น CSV

```text
คุณคือ AI ตัวที่ 6 เพิ่มการดาวน์โหลด CSV จาก /explore สำหรับหนึ่ง resource ที่ Hub อนุญาตเผยแพร่และมี active batch
โฟลเดอร์งาน: T:\coding+\BI AGRI THAILAND
อ่านและทำตามกติกากลางของ docs/assignments/2026-10-27-new-features-agents-5-7.md ก่อนเริ่ม สร้างทั้งปุ่มใช้งานและ server export ไม่จบแค่ formatter หรือ UI ตัวอย่าง

ไฟล์ที่แก้/สร้างได้เท่านั้น:
- web/app/api/v1/datasets/[id]/export/route.ts (ใหม่)
- web/lib/hub/dataset-csv-export.ts (ใหม่)
- web/components/dataset-csv-download.tsx (ใหม่)
- web/components/data-explorer.tsx (ต่อปุ่ม/component เข้า resource ที่เลือกเท่านั้น)
- web/tests/dataset-csv-export.test.ts (ใหม่)
- docs/assignments/new-features-2026-10-27/lane-6-result.md

ขอบเขตและ contract ที่กำหนด:
1. GET /api/v1/datasets/{id}/export?resourceId=...&from=YYYY-MM-DD&to=YYYY-MM-DD คืน UTF-8 CSV เมื่อมีแถวเผยแพร่ได้ resourceId จำเป็นและต้องเป็นของ dataset นี้ from/to ไม่จำเป็น วันที่ผิดหรือ from>to คืน 400 ผ่าน handleApi/HubRequestError เดิม
2. จำกัดไม่เกิน 1,000 แถวต่อคำขอ ถ้าเกินคืน 413 EXPORT_TOO_LARGE พร้อมข้อความให้จำกัดช่วงวันที่ ห้ามส่งแถวแรก 1,000 แล้วทำเหมือนครบทั้งหมด ไม่มี background export หรือ dependency ใหม่
3. ใช้ records route GET เดิมแบบ direct invocation ภายใน server หรือ listD1Records/listDbRecords ที่ route นั้นใช้ เลือก backend ตาม getDatabaseKind เดิม ไม่ยิง HTTP กลับ localhost และไม่เขียน SQL/read data/local ใหม่ ตรวจสิทธิ์ฝั่ง server ทุกครั้ง ไม่พึ่งแค่ปุ่ม disabled ฝั่ง client
4. ดาวน์โหลดเฉพาะหนึ่ง resource เพื่อให้ตรวจ datasetVersion เดียวกันทุกหน้าได้ ดึง pageSize=100 ไม่เกิน 10 หน้า ตรวจ version/total ระหว่าง pagination ถ้าเปลี่ยน/ไม่ยืนยัน snapshot consistency ได้ให้คืน 409 EXPORT_CHANGED และไม่ปล่อยไฟล์ปน run หากไม่พร้อมเผยแพร่หรือไม่มี active numeric rows ให้คืน error อธิบายได้ ไม่ส่ง CSV ปลอม
5. รักษา value, unit, period, station/grid/reservoir grain, grade, market, quality และ dimensions ตาม source ห้ามรวมราคา/แปลง null เป็น 0 เพิ่มคอลัมน์ที่มาจาก meta/detail จริง เช่น datasetId/resourceId/sourceIds/sourceUrl/datasetVersion/sourceRetrievedAt/publicationCompleteness และ export time แยกกัน หาก sample/partial ต้องติดสถานะในไฟล์ให้เห็น ไม่อ้างว่าครบทั้ง resource
6. ใช้ CSV escaping ที่ถูกต้องกับ comma/quote/CR/LF และภาษาไทย มี UTF-8 BOM สำหรับ Excel ป้องกัน formula injection ในฟิลด์ข้อความจากต้นทาง เช่น =,+,-,@ และ control/leading whitespace โดยไม่ทำให้ negative numeric values เปลี่ยนความหมาย ตั้ง filename ที่ปลอดภัยและ cache-control:no-store ไม่ใส่ credentials ลงไฟล์/headers
7. component รับ datasetId และ resourceId ที่ DataExplorer เลือกอยู่ มีช่วงวันที่สำหรับการส่งออก ปุ่มดาวน์โหลด สถานะกำลังทำงาน และข้อความ error จาก server เก็บ query ให้ตรง resource ห้ามเอาตารางหน้าปัจจุบันมาทำเหมือนเป็นไฟล์ครบทุกหน้า

เกณฑ์ส่งมอบ:
- เลือก dataset/resource ใน /explore -> ดาวน์โหลดไฟล์ที่ตรงตัวเลือกพร้อม source/version/partial warning ได้
- ทดสอบครบ: null กับ 0 ต่างกัน, ข้อความไทย/quote/comma/newline, text formula injection, negative numeric value, metadata-only/revoked ไม่มีตัวเลข, resource ไม่ตรง dataset, >1,000 แถว, active version เปลี่ยนระหว่างหน้า และ date ผิด
- tests ใช้ fake records reader/route responses แบบ offline ห้าม export จาก private files หรือทดสอบเขียน D1 จริง

ตรวจจากโฟลเดอร์ web:
node --experimental-strip-types --test tests/dataset-csv-export.test.ts
node_modules/.bin/tsc.cmd --noEmit --incremental false

ส่ง lane-6-result.md ระบุคอลัมน์ CSV, null convention, วิธีป้องกัน formula injection, error/status codes และหลักฐาน tests เก็บการเพิ่ม endpoint เข้า API catalog ให้ผู้รวมงาน เพราะ api-catalog.ts เป็นไฟล์ของ AI 4
```

## Prompt 7: หน้าฝนรายเดือนจากสถานีจริง

```text
คุณคือ AI ตัวที่ 7 ทำให้ผู้ใช้เปิดดูข้อมูล TMD รายสถานีรายเดือนที่มีใน Hub แล้วได้ผ่าน API และหน้าเว็บใหม่
โฟลเดอร์งาน: T:\coding+\BI AGRI THAILAND
อ่านและทำตามกติกากลางของ docs/assignments/2026-10-27-new-features-agents-5-7.md ก่อนเริ่ม สร้าง end-to-end read feature โดยใช้ข้อมูลเดิม ไม่สร้าง dataset จำลองหรือเปิดโครงการ backfill หลายปี

ไฟล์ที่แก้/สร้างได้เท่านั้น:
- web/lib/hub/weather-monthly-data.ts (ใช้ builder เดิมก่อน แก้เฉพาะเมื่อ feature จำเป็น)
- web/lib/hub/monthly-rainfall-repository.ts (ใหม่)
- web/app/api/v1/weather/monthly-rainfall/route.ts (ใหม่)
- web/app/monthly-rainfall/page.tsx (ใหม่)
- web/components/monthly-rainfall-dashboard.tsx (ใหม่)
- web/tests/monthly-rainfall.test.ts (ใหม่)
- web/app/weather/page.tsx (เพิ่มลิงก์ไป /monthly-rainfall เท่านั้น)
- docs/assignments/new-features-2026-10-27/lane-7-result.md

ทำทีละช่วงให้จบ:
1. อ่าน weather-monthly-data.ts ซึ่งมี MONTHLY_RAINFALL_RESOURCE_URL, metrics, buildMonthlyRainfall และ metadata-only builder อยู่แล้ว อ่าน data contract ของ ingest_tmd_d1.py โดยไม่แก้ writer/adapter นั้น ห้ามทำ parser และ mapping จังหวัดซ้ำขึ้นใหม่
2. repository อ่านเฉพาะ active public observations ของ resource https://data.tmd.go.th/api/ThailandMonthlyRainfall/v1/index.php ผ่าน listD1Observations เดิม ตาม pagination ให้ครบ bounded maximum 20,000 rows ถ้าชนเพดานให้แจ้ง partial/limit ชัด ไม่แอบอ้าง complete ไม่รวม daily weather/ERA5/NWP มาแทนข้อมูลรายเดือน
3. เพิ่ม GET /api/v1/weather/monthly-rainfall รองรับ provinceCode/stationCode/year ที่เป็น optional ใช้ validators เดิมตามเหมาะสม provinceCode ต้องอยู่ในทะเบียนและ year เป็นปี ค.ศ. 4 หลักที่ถูกต้อง ใช้ handleApi/jsonData เดิม แยกพร้อมใช้งาน/ตัวกรองไม่พบแถว/ไม่มี batch/ฐานอ่านไม่ได้ตามจริง วันที่/ความสด/version/provenance ต้องมาจากแถวหรือ run จริง ไม่ hard-code ปีหรือสถานี/จำนวนข้อมูล
4. สร้าง /monthly-rainfall ใช้ Shell active="weather" ให้เลือกปี จังหวัด และสถานี ดูตารางเดือนของสถานีที่เลือก และกราฟเรียบง่ายด้วย SVG/รูปแบบเดิม เมื่อ URL query เปลี่ยน reload/share link แล้วได้ตัวเลือกเดิม สถานีต้องเลือกจากชุดที่อ่านได้จริง
5. ต้นทางยังมี unit=null/unitStatus=pending_official_confirmation ต้องแสดงสถานะนี้ชัด แสดงค่าดิบตามต้นทางได้พร้อม declaredUnits เป็นข้อความประกอบ ห้ามเปลี่ยนตัวเลขเป็นหน่วย mm/วัน ที่อ้างว่ายืนยันแล้ว ไม่คำนวณ threshold/ภัยแล้ง/anomaly/ค่าเฉลี่ยจังหวัดหรือยอดรวมปีจากหน่วยที่ยังไม่ยืนยัน
6. แสดงเฉพาะเดือนที่ปิดเดือนตามข้อมูลที่รองรับ เดือนที่ยังไม่ถึงหรือ missing ไม่กลายเป็นฝน 0 station × month ไม่ใช่ข้อมูลครบจังหวัด และห้ามอ้างประวัติย้อนหลัง 10–20 ปีจากแค่ปีที่มีข้อมูลจริง แยกการไม่มีข้อมูลกับต้นทาง/ฐานล้มเหลว
7. เพิ่มลิงก์จาก /weather โดยไม่เปลี่ยน dashboard/observations logic เดิม ไม่แตะ early-warning และไม่เพิ่มข้อมูลทดลองเข้า D1

เกณฑ์ส่งมอบ:
- /weather -> /monthly-rainfall -> เลือกสถานี/ปี -> อ่านตารางและกราฟพร้อมที่มา/ช่วงเวลา/สถานะหน่วยได้ และแชร์ URL เดิมแล้วตัวกรองตรงกัน
- tests ครอบคลุม pagination เกิน 500 แถว, สถานีเดียวหลายเดือน, null กับ measured zero, ไม่มีสถานีในจังหวัด, ปีไม่ตรง, pending units, metadata-only และ read error โดยไม่มี fabricated numbers
- ไม่มีข้อมูลให้แสดง empty state พร้อมข้อจำกัดและรายการ input ที่ขาด ไม่แต่งแถวเพื่อให้กราฟเต็ม บอกผู้รวมงานว่าการยืนยัน live data/UI ยังรอการเปิดจริง ไม่สรุปว่าเสร็จ production จาก fixture tests

ตรวจจากโฟลเดอร์ web:
node --experimental-strip-types --test tests/monthly-rainfall.test.ts
node_modules/.bin/tsc.cmd --noEmit --incremental false

ส่ง lane-7-result.md พร้อม API shape/query examples, ที่มาของ year/period/version, fields ที่ยัง unit pending, จำนวน/ขอบเขตที่ทดสอบจริง และ flow browser ที่ต้องรับต่อ ไม่เปลี่ยน registry หรือ claims เรื่องสิทธิ์เอง
```

## ขอบเขตรวมงาน 7 ตัว

- AI 1–4 แก้ correctness ตามเอกสาร audit-repair เดิม AI 5–7 เพิ่ม read features ตามเอกสารนี้ ทุกตัวมี source/test/report คนละไฟล์
- ข้อ 8 CI/lint จาก audit ยังอยู่กับผู้รวมงาน ไม่ถูกย้ายเข้า 3 feature นี้ และไม่ได้ถือว่าแก้แล้ว
- ผู้รวมงานจะเพิ่ม API catalog สำหรับ export/monthly-rainfall หลัง AI 4 ส่งงาน ตรวจรายการ URL/เมนูรวม และตรวจ filters/types ที่เปลี่ยนหลังทุกตัวหยุดเขียนแล้ว
- ขั้นรับรวมภายหลังคือ web tests/typecheck/build หนึ่งรอบและ browser flows ของทั้ง 3 feature; การตรวจความถูกต้องงาน AI 1–4 จะทำเมื่อผู้ใช้ให้ดำเนินการต่อ รอบนี้ยังไม่ทำ
- เกณฑ์จบตามแผนต้องมีข้อมูล/ที่มาตามจริงหรือ empty state ที่ซื่อตรง มีทางเข้าหน้าและ flow ที่ใช้ได้ ไม่ใช่แค่สร้างไฟล์หรือใช้ fixture แทน production data ทุก lane ต้องแยก implemented / locally tested / live verified / deployed ในรายงาน
