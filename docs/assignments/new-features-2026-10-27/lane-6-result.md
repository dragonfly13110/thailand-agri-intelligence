# Lane 6 — ส่งออกข้อมูลที่เผยแพร่แล้วเป็น CSV จาก `/explore` (AI ตัวที่ 6, 27 ต.ค. 2569)

สถานะสรุป: **implemented + locally tested + live verified (read-only)** · **ยังไม่ deploy** · **ยังไม่ตรวจ browser desktop/mobile**
ไม่รัน dev server / build / full suite / `next typegen` / prepare-data / npm install / เขียน D1 / ingestion `--write` ตามกติกาข้อ 9 เพราะ 7 lane ทำงานพร้อมกัน

## สิ่งที่สร้าง (allowlist เท่านั้น)

| ไฟล์ | บรรทัด | สถานะ |
|---|---|---|
| [web/lib/hub/dataset-csv-export.ts](../../../web/lib/hub/dataset-csv-export.ts) | 316 | ใหม่ — แกนการส่งออก: query contract, สิทธิ์, อ่านหลายหน้าแบบ snapshot เดียว, escape CSV, filename, response headers |
| [web/app/api/v1/datasets/[id]/export/route.ts](../../../web/app/api/v1/datasets/%5Bid%5D/export/route.ts) | 137 | ใหม่ — wiring เท่านั้น เลือก backend ด้วย `getDatabaseKind()` แล้วเรียก reader ชุดเดิมของ Hub (ไม่มี SQL ใหม่) |
| [web/components/dataset-csv-download.tsx](../../../web/components/dataset-csv-download.tsx) | 80 | ใหม่ — client component: ช่องใส่ช่วงวันที่ + ปุ่มดาวน์โหลด + สถานะกำลังทำ + ข้อความ error จากเซิร์ฟเวอร์ |
| [web/components/data-explorer.tsx](../../../web/components/data-explorer.tsx) | 254 | แก้ **3 บรรทัด** = import + `<h4>` + ติด component ในบล็อก `{resourceId && access==='approved_public'}` เท่านั้น |
| [web/tests/dataset-csv-export.test.ts](../../../web/tests/dataset-csv-export.test.ts) | 595 | ใหม่ — offline 24 tests ไม่มี network ไม่มี `.env` ไม่เขียน D1 |

Baseline snapshot ของ `data-explorer.tsx` ก่อนแก้ เก็บไว้ที่ `.tmp_qa/new-feature-lane-6/data-explorer.tsx.orig` (โฟลเดอร์อยู่ใน `.gitignore` บรรทัด 22 แล้ว; `git diff HEAD -- web/components/data-explorer.tsx` → `3 insertions(+)` ไม่มีไฟล์อื่นของ lane อื่นแตะ)
ไม่แก้ `http.ts`, `types.ts`, repositories, `api-catalog.ts`, schemas, registry, page-registry, shell, `globals.css`, configs, package/lock, workflows · ไม่ commit/push/deploy · ไม่ลง dependency

## Endpoint และ contract ที่รักษา

`GET /api/v1/datasets/{id}/export?resourceId=…&from=YYYY-MM-DD&to=YYYY-MM-DD` → `text/csv; charset=utf-8` พร้อม BOM

- อ่านผ่าน **reader ชุดเดิมของ Hub** บนเซิร์ฟเวอร์เท่านั้น: `getD1Dataset`/`getDbDataset` (ตรวจสิทธิ์) + `listD1Records`/`listDbRecords` (เอาแถว) เลือกด้วย `await getDatabaseKind()` — ไม่ loopback HTTP เข้าตัวเอง, ไม่เขียน SQL ใหม่, ไม่แตะไฟล์ raw ของ repo
- **สิทธิ์บังคับฝั่งเซิร์ฟเวอร์ทุกครั้ง** ไม่ได้มีแค่ปุ่มที่ client ปิด: ต้อง `dataset.access === 'approved_public'` + resource `accessStatus='approved_public'` + `projectPublicationApproved=true` + `activeRunId` + `meta.access` ของหน้า records ต้องเป็น `approved_public` ด้วย (ยืนยันซ้ำตอนอ่านจริง [web/lib/hub/dataset-csv-export.ts:194](../../../web/lib/hub/dataset-csv-export.ts#L194), [:237](../../../web/lib/hub/dataset-csv-export.ts#L237))
- ส่งออก **ทรัพยากรเดียวต่อไฟล์**เสมอ (`resourceId` จำเป็น) แล้วอ่าน `pageSize=100` สูงสุด 10 หน้า, เพดาน **1,000 แถว/คำขอ**; ถ้าเกินจะ 413 ก่อนต่อไฟล์ ไม่เคยส่ง 1,000 แถวแรกแล้วอ้างว่าครบ ([.../dataset-csv-export.ts:6](../../../web/lib/hub/dataset-csv-export.ts#L6), [:229](../../../web/lib/hub/dataset-csv-export.ts#L229))
- snapshot เดียว พิสูจน์ด้วย 6 จุดตรวจ → ทั้งหมดให้ 409: `datasetVersion` เปลี่ยนระหว่างหน้า, หน้าที่ได้กลับมาไม่ตรงกับที่ขอ, **ยืนยันเวอร์ชันไม่ได้** (meta ไม่มี `datasetVersion`), จำนวนแถวรวมไม่ตรง `pagination.total`, พบ `rowKey` ซ้ำ, พบแถวที่ `seriesId` ไม่ใช่ของทรัพยากรที่เลือก ([.../dataset-csv-export.ts:208](../../../web/lib/hub/dataset-csv-export.ts#L208))
- header ทุกไฟล์: `cache-control: no-store`, `x-content-type-options: nosniff`, `content-disposition` filename ASCII (ตัด query/fragment/userinfo ทิ้งก่อน slug กัน credential หลุด) — [lib:175](../../../web/lib/hub/dataset-csv-export.ts#L175), [lib:306](../../../web/lib/hub/dataset-csv-export.ts#L306)
- ไม่มีการตรวจสอบสิทธิ์แบบ client-side อย่างเดียว: `resourceId` ผิดชุด/ไม่เผยแพร่ → เซิร์ฟเวอร์ตอบ 404/403 แล้ว UI แสดงข้อความไทยนั้นตรง ๆ

## คอลัมน์ CSV (34 คอลัมน์ = 21 แถวข้อมูล + 13 provenance)

`rowKey, seriesId, periodStart, periodEnd, periodLabel, locationCode, locationKind, locationName, provinceCode, cropCode, cropName, metricId, metricName, product, grade, market, unit, value, dimensions, qualityStatus, sourceRowRef`
`datasetId, resourceId, resourceGrain, sourceIds, sourceUrl, datasetVersion, sourceRetrievedAt, sourceUpdatedAt, dataAsOf, publicationCompleteness, publicationWarnings, exportGeneratedAt, exportRowCount`

- **คอลัมน์ข้อมูลคง source grain เต็ม** — station/grid/grid_point/reservoir แยกด้วย `locationKind`/`locationCode`/`locationName`, หน่วยงาน/สินค้า/เกรด/ตลาด/หน่วยคงรายคอลัมน์ ห้ามรวมราคาต่างสินค้า-เกรด-หน่วย-ตลาด และไม่เคยบวก subtotal ซ้ำ; `dimensions` เก็บ JSON ต่อแถว (grain เพิ่มที่ต้นทางให้ เช่น `{"hour":…}`) ไม่ยุบรวมเป็นแถวเดียว
- **null convention**: `null`/`undefined` → เซลล์ว่าง **ไม่แทนด้วย 0**, ค่า 0 ที่วัดจริงเขียน `0` (test แยกสองกรณีไว้); `NaN`/`Infinity` → เซลล์ว่าง; `unit` ที่ยังรอการยืนยันจากต้นทาง (`unit_pending_official_confirmation`) จึงเป็นช่องว่างตามจริง ไม่แต่งหน่วย
- provenance **มาจาก `meta` ของรอบที่เผยแพร่** ไม่ใช่เวลาส่งออก: `sourceRetrievedAt`/`sourceUpdatedAt`/`dataAsOf` แยกจาก `exportGeneratedAt` ชัดเจน ส่วน `exportRowCount` คือจำนวนแถวที่เขียนลงไฟล์จริง
- ไฟล์ **ไม่อ้างว่าครบ** ถ้ารอบเป็น partial: `publicationCompleteness` = `partial` + `publicationWarnings` ถูกเขียนทุกแถว (test ยืนยันว่าแถวตัวอย่างมีค่า `partial` พร้อมข้อความเตือน ไม่ใช่เซลล์ว่าง)

## การป้องกัน formula injection

ที่ [web/lib/hub/dataset-csv-export.ts:92-118](../../../web/lib/hub/dataset-csv-export.ts#L92) — เฉพาะ **เซลล์ข้อความ**:
1. ตัด control bytes `U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+007F` ก่อนเสมอ
2. ขึ้นต้นด้วย tab/CR/LF → เติม `'` นำหน้า (Excel trim ตัวนั้นก่อนตัดสินใจว่าเป็นสูตร)
3. ขึ้นต้นด้วย `=`, `+`, `-`, `@` (หลังเว้นช่องว่างนำ) → เติม `'` นำหน้า
4. **ตัวเลขไม่ถูกแตะ**: `typeof value === 'number'` ออกจากฟังก์ชันก่อน → `-12.5` ยังเป็น `-12.5` คำนวณต่อใน Excel ได้ (test ผูกไว้ทั้งสองฝั่ง)
5. `"` ซ้อนเป็น `""` และครอบด้วย `"` เมื่อมี `,` `"` CR LF — Thai + comma + quote + newline in-field ผ่าน round trip ครบ (test parser ของตัวเอง)

## status / error code ที่ตอบจริง (ผ่าน `handleApi` ทั้งหมด → JSON `{error:{code,message,requestId}}`)

| สถานะ | code | เงื่อนไข |
|---|---|---|
| 400 | `INVALID_ID` | dataset id ว่าง หรือยาว >260 |
| 400 | `INVALID_QUERY` | ไม่ใส่ `resourceId` · `from`/`to` ไม่ใช่ YYYY-MM-DD ที่ถูกต้อง · `from > to` |
| 403 | `EXPORT_NOT_PUBLISHED` | dataset เป็น metadata-only · ทรัพยากรไม่ approved/ไม่มี active run · records meta ปฏิเสธสิทธิ์ |
| 404 | `EXPORT_RESOURCE_NOT_FOUND` | `resourceId` ไม่ใช่ของชุดข้อมูลนี้ |
| 404 | `EXPORT_NO_ROWS` | รอบที่ใช้อยู่ไม่มีแถวที่เผยแพร่ (ช่วงวันที่ว่าง) → ไม่มีไฟล์ให้ดาวน์โหลด |
| 404 | `DATASET_NOT_FOUND` | ส่งต่อจาก reader รายละเอียดชุดข้อมูลเดิม |
| 409 | `EXPORT_CHANGED` | 6 จุดตรวจในโค้ด (ทดสอบ 5 เคส): snapshot/total เปลี่ยนระหว่างหน้า · หน้าที่กลับมาไม่ตรงที่ขอ · ยืนยัน `datasetVersion` ไม่ได้ · แถวรวมไม่ตรง `total` · `rowKey` ซ้ำ · แถวของทรัพยากรอื่น |
| 413 | `EXPORT_TOO_LARGE` | เกิน 1,000 แถว หรือต้องอ่านเกิน 10 หน้า — บอกจำนวนจริงและให้แคบช่วงวันที่ |
| 503 | `EXPORT_DATABASE_UNAVAILABLE` | `getDatabaseKind() === 'none'` (ยืนยันว่าไม่แต่งไฟล์เปล่า) |
| 500 | `EXPORT_READ_FAILED` | reader เดิมตอบรูปร่างไม่ถูกต้อง (ส่งต่อ status/code เดิมถ้าต้นทางตอบ error ไว้แล้ว) |

## คำสั่งและผลที่รันจริง (จากโฟลเดอร์ `web`)

```
node --experimental-strip-types --test tests/dataset-csv-export.test.ts
→ tests 24 · pass 24 · fail 0 · duration 288 ms   (รันซ้ำหลังแก้ component ครั้งสุดท้าย: 24/24)

node_modules/.bin/tsc.cmd --noEmit --incremental false
→ exit มี error รวม 1 รายการ = lib/hub/weather-monthly-data.ts(503,117) TS1005 (ไฟล์ของ lane อื่น กำลังแก้พร้อมกัน ไม่ข้ามขอบเขตไปแตะ)
   grep "dataset-csv|data-explorer|datasets/\[id\]/export" บน output = 0 → ไฟล์ของ lane 6 ผ่าน typecheck ทั้งหมด
   (error 4 รายการของ .next/types/validator.ts ที่เคยมีตอนนี้หายไปแล้ว เพราะ lane อื่นรัน typegen ระหว่างรอบ)

node_modules/.bin/eslint.cmd lib/hub/dataset-csv-export.ts "app/api/v1/datasets/[id]/export/route.ts" components/dataset-csv-download.tsx components/data-explorer.tsx tests/dataset-csv-export.test.ts
→ ไม่มีผลลัพท์ (0 warning / 0 error) exit 0
```

test 24 ชื่อ (ครอบคลุมทุกเงื่อนไขที่ order สั่ง): `parseExportQuery` 400 ครบ 4 เคส · null vs 0 · Thai/comma/quote/CRLF round trip · formula injection (`=1+1`, `+8`, `@cmd`, `-4`, tab-leading) พร้อม `-12.5` คงค่า · dimensions JSON · provenance ทุกแถว · partial ถูกทำเครื่องหมายในไฟล์ · หลาย source ในคอลัมน์เดียวโดยไม่รวมค่า · อ่าน 100×10 หน้า + ยืนยันเวอร์ชันเดียว · 413 ก่อนต่อไฟล์ (assert ว่าอ่านแค่ 1 หน้า) · 409 ครบ 5 เคสทดสอบ (version / total / ยืนยันไม่ได้ / แถวซ้ำ / แถวของคนอื่น) · 404 resource นอกชุด (ไม่มีการอ่านแถว) · 403 metadata-only + ถอนสิทธิ์ · 403 records meta · 404 ไม่มีแถว · 200 headers + BOM ระดับไบต์ · filename slug ปลอด `token|secret` · route เรียก reader เดิมเฉพาะทรัพยากรที่เลือก · route ตอบ JSON error ตาม code · route 503 เมื่อไม่มีฐานข้อมูล

## หลักฐานกับข้อมูลจริง (read-only ผ่าน runtime D1 เดิม, ไม่มีการเขียน)

สแกนชุดข้อมูลทั้งทะเบียน (catalogued 1,247 รายการ) พบ 8 ทรัพยากรที่เผยแพร่จริง; ยืนยันด้วยการ export ผ่านโค้ด route จริง 7 ทรัพยากร (6 ไฟล์ตามตาราง + `rid:rid_medium_reservoirs` ที่ถูกปฏิเสธด้วย 413) แล้ว parse ไฟล์ทั้ง 6 ใบกลับมาตรวจสอบจากไบต์:

| dataset / resource | แถวในไฟล์ | exportRowCount | columns | datasetVersion | completeness |
|---|---|---|---|---|---|
| `tmd:tmd_monthly_rainfall_monthly` (ช่วง 2026-09-01→09-30) | 262 | 262 ✓ | 34 | 1 ค่า (`502c4b4d…`) | complete |
| `tmd:tmd_weather_today_by_agro_daily` | 272 (3 หน้า) | 272 ✓ | 34 | 1 ค่า | complete |
| `open_meteo:open_meteo_thailand_era5_archive` | 42 | 42 ✓ | 34 | 1 ค่า | complete |
| `tmd:tmd_weather_today_by_synop_daily` | 24 | 24 ✓ | 34 | 1 ค่า | partial |
| `tmd:tmd_weather_today_station_daily` | 24 | 24 ✓ | 34 | 1 ค่า | partial |
| `chirps-v3.0-daily-final-rnl` | 3 | 3 ✓ | 34 | 1 ค่า | partial |

ทุกไฟล์ขึ้นต้นด้วย BOM `EF BB BF` · ชื่อสถานีไทย (`เชียงราย สกษ. (48304)`, `แม่ฮ่องสอน (48300)`, `ERA5 grid point (นครปฐม 73)`) อยู่ครบ · `unit` ที่รอการยืนยันออกเป็นช่องว่าง · `resourceGrain` คง text จากต้นทาง เช่น `grid_cell × UTC date; 3-cell sample`

ช่อง `value` ของ 627 แถวที่ export มาได้ **มีค่าทั้งหมด (0 เซลล์ว่าง)** จึงยังไม่มีหลักฐาน live ของ null→ช่องว่าง จากข้อมูลจริง — เคสนั้นผูกหลักฐานไว้ที่ offline test (`null stays a blank cell while a measured zero is written as 0`) ส่วนเซลล์ว่างที่เห็นจริงในไฟล์คือ `unit`/`grade`/`market`/`sourceUpdatedAt` ที่ต้นทางไม่ได้ให้มา และไม่มีเซลล์ใดในไฟล์จริงขึ้นต้นด้วย `'` (ไม่มีข้อความสูตรในข้อมูลชุดนี้) การป้องกัน injection จึงยืนยันด้วย test เช่นกัน

error matrix ที่ยิงจริงกับข้อมูล (`.tmp_qa/new-feature-lane-6/live-check{2,3,5}.mjs`):
- `413` จริง 2 ทรัพยากร: `tmd:tmd_monthly_rainfall_monthly` total 2,358 และ `rid:rid_medium_reservoirs` total 1,383 → ข้อความไทยบอกจำนวนจริง + ให้แคบช่วงวันที่; retry `from=2026-09-01&to=2026-09-30` → `200` (262 แถว, 428,989 bytes, 1 datasetVersion)
- `403` จริง: `nabc:90silkcolor` (`metadata_only`/`metadata_only`) → `EXPORT_NOT_PUBLISHED` ไม่ได้ไฟล์
- `404` จริง: `chirps-v3.0-daily-final-rnl` + `resourceId` ของ `open_meteo` → `EXPORT_RESOURCE_NOT_FOUND`
- `400` จริง: `from=2026-13-45` → `INVALID_QUERY` "วันที่ from ไม่ถูกต้อง"
- ยังไม่มี 409/503 จากของจริง (ไม่มีการเขียน D1 จึงทำให้รอบข้อมูลเปลี่ยนกลางทางไม่ได้ และคลังจริงไม่ใช่ `none`) — ผูกหลักฐานไว้ที่ offline tests (409 ×5 เคส, 503 ×1 เคส)

## ข้อจำกัดที่ยังเหลือ

1. **ทรัพยากร snapshot grain ที่ >1,000 แถวในงวดเดียวส่งออกไม่ได้** — พิสูจน์จริงกับ `rid:rid_medium_reservoirs`: ทุกแถวเป็นวันที่ `2026-10-26` ทั้ง 1,383 แถว (`from=2026-10-25&to=2026-10-25` → 0 แถว) จึง **แคบช่วงวันที่ให้ต่ำกว่าเพดานไม่ได้** ตามกติกาข้อ 2 ห้ามส่ง 1,000 แถวแรกแล้วอ้างว่าครบ lane นี้จึงตอบ 413 พร้อมคำอธิบาย (ไม่แก้เพดาน ไม่เพิ่ม filter เองเพราะเกิน allowlist) ทางออกต้องให้ผู้รวมงานตัดสินใจ: เพิ่ม param กรอง `locationCode`/`metricId` เข้า export หรือตกลงเพดานใหม่
2. **ยังไม่ตรวจ browser desktop/mobile** — ปุ่มอยู่ในบล็อกที่แสดงเฉพาะทรัพยากรที่เลือกและเผยแพร่แล้ว แต่ยังไม่ได้คลิกจริงบน dev server (กติกาห้ามรัน dev ขณะ 7 lane ทำงาน)
3. **endpoint ยังไม่อยู่ใน `lib/hub/api-catalog.ts`** — เป็นไฟล์ของ AI 4 ผู้รวมงานจึงเพิ่มรายการ `/datasets/{id}/export` เอง (ตาม order)
4. `exportRowCount` เป็นจำนวนแถว ไม่ใช่จำนวนช่วงเวลาหรือจำนวนสถานี จึงไม่ถูกใช้เป็นข้ออ้างว่า "ครบทุกจังหวัด/ครบทุกวันที่"; ถ้ารอบเป็น partial ไฟล์ยังมี `publicationWarnings` กำกับทุกแถว
5. ไฟล์ CSV ไม่ถูกเก็บถาวรบนเซิร์ฟเวอร์ (`no-store`, ไม่เขียนดิสก์, ไม่มี background job) ถ้าต้องการ export อัตโนมัติ/ขนาดใหญ่ต้องออกแบบ job ใหม่ ซึ่งเป็นงานของผู้รวมงาน

## สิ่งที่ผู้รวมงานต้องทำต่อ

- เพิ่ม endpoint ใน `api-catalog.ts` (ของ AI 4) + รันรอบ typecheck/build/typegen เดียวหลัง AI 5–7 หยุดเขียน เพื่อยืนยัน error ของ `lib/hub/weather-monthly-data.ts` หายไปและ route ใหม่เข้า build graph
- Browser acceptance ที่ `/explore`: เลือก dataset ที่เผยแพร่ → เลือก resource → กด "ดาวน์โหลด CSV" ที่ 1440×900 และ 390×844 → เปิดไฟล์ใน Excel ไทย (ต้องอ่านภาษาไทยได้, ช่องว่าง ≠ 0) → ทดสอบเคส 403/404/413 โดยพิมพ์ `resourceId` อื่น/ช่วงวันที่กว้างเกิน ผ่าน URL `curl` เพื่อเทียบข้อความในหน้าจอ
- Live curl sample: `curl -D - "http://127.0.0.1:3010/api/v1/datasets/tmd%3Atmd_weather_today_by_agro_daily/export?resourceId=https%3A%2F%2Fdata.tmd.go.th%2Fapi%2FWeatherTodayByAgro%2FV1%2F" -o out.csv`
- ถ้าต้องการ export เกิน 1,000 แถว ให้พิจารณา filter เพิ่ม (ข้อจำกัดข้อ 1) แล้วแก้เพดาน/คำเตือนใน `dataset-csv-export.ts` ที่เดียว พร้อมอัปเดต 24 tests
- ลบ `.tmp_qa/new-feature-lane-6/` หลังรวมงาน (script scratch + ไฟล์ CSV จริง 6 ตัวอย่าง ไม่มี credential; `.env`/`.env.local` ไม่ถูก commit และไม่ถูกเขียนลงไฟล์ใน repo)
