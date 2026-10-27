# Lane 7 — ฝนรายเดือนจากสถานีจริง (AI ตัวที่ 7, 27 ต.ค. 2569)

สถานะสรุป: **implemented + locally tested (18 offline tests) + live verified read-only (repository/builder/route เรียกโค้ดจริงกับ D1)** · **ยังไม่ deploy** · **ยังไม่ตรวจ browser desktop/mobile**
ไม่รัน dev server / build / full suite / `next typegen` / prepare-data / npm install / เขียน D1 / ingestion `--write` ตามกติกาข้อ 4 และ 9 เพราะ 7 lane ทำงานพร้อมกัน · ไม่ commit/push/เปลี่ยน branch · ไม่ลง dependency ใหม่

## สิ่งที่สร้าง (allowlist เท่านั้น)

| ไฟล์ | บรรทัด | สถานะ |
|---|---|---|
| [web/lib/hub/weather-monthly-data.ts](../../../web/lib/hub/weather-monthly-data.ts) | 687 (เดิม 429) | **แก้ +260/−2** — เพิ่ม directory ของ batch (`buildMonthlyRainfallDirectory`), envelope สี่สถานะ (`monthlyRainfallResponse`), type `MonthlyRainfallBatch/Filters/Read/Body/Meta/Envelope` และซ่อม merge พิกัด 1 จุด ([lib:322](../../../web/lib/hub/weather-monthly-data.ts#L322)) · **builder เดิมยังอยู่ครบ** `buildMonthlyRainfall` ไม่ได้เปลี่ยนตรรกะตัวเลข |
| [web/lib/hub/monthly-rainfall-repository.ts](../../../web/lib/hub/monthly-rainfall-repository.ts) | 206 | ใหม่ — อ่านแถวที่เผยแพร่แล้วของทรัพยากรเดียว ผ่าน `listD1Observations` ชุดเดิม of Hub + เดินหน้า pagination แบบมีเพดาน + validator ของ query |
| [web/app/api/v1/weather/monthly-rainfall/route.ts](../../../web/app/api/v1/weather/monthly-rainfall/route.ts) | 80 | ใหม่ — `GET` อย่างเดียว ผ่าน `handleApi`/`jsonData` ทั้งหมด |
| [web/app/monthly-rainfall/page.tsx](../../../web/app/monthly-rainfall/page.tsx) | 104 | ใหม่ — Server Component, `Shell active="weather"`, ใช้ validator ของ API เอง ([page:35](../../../web/app/monthly-rainfall/page.tsx#L35)) |
| [web/components/monthly-rainfall-dashboard.tsx](../../../web/components/monthly-rainfall-dashboard.tsx) | 625 | ใหม่ — ตัวกรอง/ตาราง/SVG กราฟ/รายชื่อสถานี/ที่มา/empty state (ไม่มี `"use client"`, ไม่มี state ฝั่ง client) |
| [web/tests/monthly-rainfall.test.ts](../../../web/tests/monthly-rainfall.test.ts) | 499 | ใหม่ — offline 18 tests · fake reader ล้วน ไม่มี network ไม่มี `.env` ไม่เขียน D1 |
| [web/app/weather/page.tsx](../../../web/app/weather/page.tsx) | +7/−2 | **เฉพาะ 4 บรรทัดของ lane นี้**: `import Link` + `<p>` หนึ่งบล็อกที่<link>ไป `/monthly-rainfall` พร้อมระบุว่าคนละเกรน · อีก 3 บรรทัดใน diff เป็น copy edit ของ lane อื่น ซึ่งเก็บไว้ตามเดิมไม่แตะ |

Baseline snapshot ก่อนแก้: `.tmp_qa/new-feature-lane-7/web/lib/hub/weather-monthly-data.ts.orig` และ `.../web/app/weather-page.tsx.orig` (โฟลเดอร์อยู่ใน `.gitignore` แล้ว)
ไม่แก้ `http.ts`, `types.ts`, `d1.ts`, `d1-numeric-repository.ts`, `province.ts`, registry/`api-catalog.ts`, schemas, page-registry, `shell.tsx`, `globals.css`, configs, package/lock, workflows · ไม่แก้ไฟล์ของ AI 1–6 (ตรวจเฉพาะ signature ที่เรียกใช้)

ตรวจสอบแล้วว่า `weather-monthly-data.ts` ถูก import โดยไฟล์ของ lane 7 เท่านั้น (5 ไฟล์) → การซ่อม merge พิกัดไม่มีผลต่อ lane อื่น

## API shape (ยืนยันด้วยการเรียก route handler จริงกับ D1)

`GET /api/v1/weather/monthly-rainfall` → envelope เดิมของ Hub `{ data, meta, pagination }`

```jsonc
{
  "data": {
    "source": { "sourceId": "tmd", "resourceUrl": "https://data.tmd.go.th/api/ThailandMonthlyRainfall/v1/index.php",
                "grain": "station × calendar_month", "licenseStatus": "approved_public", "limitations": ["…"] },
    "year": null,                    // ไม่ใช่ null เมื่อ batch มีปีเดียวจริง ๆ
    "months": [1,2,3,4,5,6,7,8,9],   // เดือนที่มีแถวเผยแพร่เท่านั้น
    "summary": { "stationCount": 131, "provincesWithReportingStation": 71, "years": [2026],
                 "monthsAvailable": [1,2,3,4,5,6,7,8,9], "valueCount": 2358, "missingValueCount": 0,
                 "wettest": { "stationCode": "48357", "stationNameTh": "นครพนม", "year": 2026, "month": 8, "value": 1131.3 },
                 "rainiestDays": { "stationCode": "48417", "stationNameTh": "นครนายก", "year": 2026, "month": 8, "value": 31 } },
    "stations": [ { "stationCode": "48452", "stationNameTh": "กรุงเทพฯ บางเขน สกษ.", "provinceCode": "10",
                    "latitude": null, "longitude": null, "coordinateStatus": "provider_field_order_suspect",
                    "unit": null, "unitStatus": "pending_official_confirmation",
                    "declaredUnits": { "monthly_rainfall_mm": "mm", "monthly_rainy_days": "day" },
                    "months": [ { "year": 2026, "month": 1, "periodStart": "2026-01-01", "periodEnd": "2026-01-31",
                                  "values": { "monthly_rainfall_mm": 0, "monthly_rainy_days": 0 } } ],
                    "valueCount": 18, "missingValueCount": 0, "sourceRowRefs": ["…"] } ],
    "calculationVersion": "weather-monthly-rainfall-v1",
    "filters":   { "provinceCode": null, "stationCode": null, "year": null },
    "directory": { "years": [2026], "provinces": [{ "code": "51", "name": "เชียงใหม่", "stationCount": 2 }], "stations": ["…131 รายการ"] }
  },
  "meta": { "availability": "ready", "completeness": "complete", "access": "approved_public", "freshness": "unknown",
            "sourceIds": ["tmd"], "dataAsOf": "2026-09-30", "sourceUpdatedAt": null,
            "sourceRetrievedAt": "2026-10-26T13:28:35Z", "datasetVersion": "502c4b4d8246dd9ded1633dddab3d3dbc449921ed53e0ad3faf9adf4ed11edf6",
            "runtimeMode": "database", "warnings": ["…"] },
  "pagination": { "page": 1, "pageSize": 25, "total": 131 }   // total = จำนวนสถานี ไม่ใช่จำนวนแถว
}
```

- `directory` อยู่ทั้งใน body และในหน้าเว็บ เพื่อให้ empty state ยังบอกได้ว่า "เลือกอะไรได้บ้าง"
- `pagination` เดินตาม **สถานี** (หนึ่งสถานีมี 9 เดือนต่อ 2 metric) จึงไม่มีทางที่หน้าเดียวตัดเดือนของสถานีใดกลาง
- `data.stations[]` ถูก slice หลัง build แล้วทั้ง batch → ค่าของสถานีหนึ่งไม่ปนกับสถานีอื่น

### Query ที่รองรับ + ผลจริง

| query | ผลจริง |
|---|---|
| `?pageSize=2` | 200 `ready` · total 131 · 2 สถานีแรกตามเรียงจังหวัด→รหัสสถานี |
| `?page=2&pageSize=2` | 200 `ready` · ได้ `48454`,`48455` ต่อหน้าแรกถูกต้อง |
| `?provinceCode=51&year=2026` | 200 `ready` · 1 สถานี (ลำพูน 48329) · summary นับเฉพาะสถานีนั้น |
| `?provinceCode=77&year=2026` | 200 `ready` · 3 สถานี |
| `?stationCode=48452&year=2026` | 200 `ready` · 1 สถานี 9 เดือน |
| `?year=2015` | 200 `availability=empty` `completeness=complete` · `stations: []` `summary: null` · **directory ยังส่งกลับมา** · warning: "…ไม่ใช่ \"ไม่มีฝน\"" |
| `?year=26` | **400** `INVALID_QUERY` "ปีต้องเป็นปี ค.ศ. 4 หลัก" |
| `?stationCode=48` | **400** `INVALID_QUERY` "รหัสสถานีไม่ถูกต้อง" |
| `?provinceCode=777` | **400** `INVALID_QUERY` "ค่า provinceCode ยาวเกินกำหนด" |
| `?provinceCode=99` | **400** `INVALID_QUERY` "รหัสจังหวัดไม่อยู่ในทะเบียนที่รองรับ" (ตรวจกับทะเบียนจริงของ Hub) |
| `?pageSize=101` | **400** `INVALID_QUERY` "ค่า pageSize ต้องอยู่ระหว่าง 1 ถึง 100" |

`provinceCode` ต้องเป็น 2 หลัก**และ**อยู่ในทะเบียน 77 จังหวัด, `stationCode` `[A-Za-z0-9_-]{3,20}` ตาม `normalize_station_id` ของ writer ([repo:58](../../../web/lib/hub/monthly-rainfall-repository.ts#L58)), `year` 4 หลัก ([repo:61](../../../web/lib/hub/monthly-rainfall-repository.ts#L61)) — ทุกค่าใช้ `parseText` ของ `http.ts` ไม่มี validator ใหม่

### สี่สถานะที่แยกจากกัน ([weather-monthly-data.ts:582](../../../web/lib/hub/weather-monthly-data.ts#L582))

| สถานะ | `availability` | `access` | `runtimeMode` | ตัวเลขใน body |
|---|---|---|---|---|
| อ่านคลังไม่สำเร็จ | `metadata_only` | `metadata_only` | `source_api_fallback` | ไม่มี (`stations: []`) + warning "อ่านคลังข้อมูลกลางไม่สำเร็จ… shown values: none" |
| อ่านได้แต่ไม่มี active numeric batch | `metadata_only` | `metadata_only` | `database` | ไม่มี + "ไม่พบ active numeric batch ของทรัพยากรฝนรายเดือน" |
| batch อยู่จริง แต่ตัวกรองไม่ตรง | `empty` | `approved_public` | `database` | ไม่มี + ตัวกรองที่ใช้ + directory ที่เลือกได้ |
| มีแถวเผยแพร่ | `ready` | `approved_public` | `database` | ค่าจริงจากแถว + provenance ของรอบ |

## ที่มาของ year / ช่วงเวลา / version — ทั้งหมดจากแถว ไม่ใช่ค่าคงที่

| ฟิลด์ | ที่มา | ค่าจริงวันนี้ |
|---|---|---|
| `directory.years` / `summary.years` | `year` ใน `observations.dimensions` ของแถวที่ผ่าน gate เท่านั้น ([repo:190](../../../web/lib/hub/monthly-rainfall-repository.ts#L190)) | `[2026]` เดียว — **หน้าจึงไม่อ้างประวัติ 10–20 ปี** และ dropdown มีเฉพาะ 2026 |
| `meta.dataAsOf` | `max(period_end)` ของแถวที่อ่านได้ ([repo:166](../../../web/lib/hub/monthly-rainfall-repository.ts#L166)) | `2026-09-30` (เดือน ต.ค. ยังไม่ปิดเดือน จึงไม่มีช่อง 0 แทน) |
| period ของหน้า | `min(period_start)` → `max(period_end)` | `2026-01-01 → 2026-09-30` แสดงในตาราง "ที่มา" |
| `meta.datasetVersion` | `run.payload_sha256` (fallback `run_id`) **เฉพาะเมื่อทั้ง batch มาจากรอบเดียว** ([data:641](../../../web/lib/hub/weather-monthly-data.ts#L641)) | `502c4b4d8246…` (1 run) · ถ้า mixing runs → `null` พร้อม completeness `partial` (test ผูกไว้) |
| `meta.sourceRetrievedAt` / run time | `sync_runs.source_retrieved_at` / `completed_at` | `2026-10-26T13:28:35Z` / `2026-10-26T13:55:33Z` |
| `meta.freshness` | `freshness(resources.source_updated_at, sources.freshness_days)` ตามสูตรกลาง — route เป็นผู้เรียก ([route:75](../../../web/app/api/v1/weather/monthly-rainfall/route.ts#L75)) | `unknown` เพราะคอลัมน์ทั้งสองเป็น **NULL** จริง จึงไม่แต่งเวลา "อัปเดตเมื่อ" ขึ้นมา ([repo:118](../../../web/lib/hub/monthly-rainfall-repository.ts#L118)) |

การอ่านมีเพดานและรายงานตัวเอง: `listD1Observations` จำกัด 500 แถว/call → เดินหน้าสูงสุด **20,000 แถว / 40 หน้า** ([repo:28](../../../web/lib/hub/monthly-rainfall-repository.ts#L28)) ถ้าคลังรายงานมากกว่าที่เดินได้ จะได้ `batch.capped=true` → `completeness: partial` + warning ระบุ "อ่านถึงเพดาน 20000 แถวจากที่คลังรายงาน N แถว" **ไม่เคยอ้างว่าครบ** และหน้าว่าง (batch หดระหว่างเดิน) หยุดการเดินทันที

## ฟิลด์ที่ยัง unit pending และสิ่งที่ตั้งใจไม่คำนวณ

- `stations[].unit` = **null** ทุกแถว (คอลัมน์ `observations.unit` เป็น NULL จริง — ยืนยันด้วย query ตรง), `unitStatus` = `pending_official_confirmation`, หน่วยที่ต้นทางประกาศอยู่ใน `declaredUnits` (`mm`, `day`) เป็น **ข้อความประกอบเท่านั้น** — test ยืนยันว่า JSON ไม่เคยมี `"unit":"mm"`
- หน้าเว็บแสดงหน่วยที่ `<th>` จาก `declaredUnits` ของสถานีนั้นจริง ("ตามที่แถวระบุ: mm (ยังไม่ยืนยันอย่างเป็นทางการ)") ไม่ได้พิมพ์คำว่า มม./วัน จากระบบเอง
- **ไม่คำนวณ**: เกณฑ์ภัยแล้ง/เกณฑ์เตือน, anomaly, ค่าเฉลี่ยจังหวัด, ยอดรวมปี (ปี 2026 มี 9 เดือน การรวมปีจะหลอกทันที), การเทียบข้ามสถานีเป็นเปอร์เซ็นต์
- สิ่งที่แสดงนอกเหนือค่าดิบมีแค่ `valueCount`/`missingValueCount` (นับแถว), จำนวนสถานี/จังหวัดที่มีสถานีรายงาน, และ "ค่ามากสุดที่เห็นในสถานีนี้" ซึ่งกำกับในคอลัมน์และ note ชัดว่า **ไม่ใช่ยอดรวมปี ไม่ใช่ค่าเฉลี่ยจังหวัด**
- `missing ≠ 0`: แถว `quality_status='missing'` → `null` แสดงเป็น `—`; เดือนที่ไม่มีแถวเผยแพร่แสดงเป็น `–`; ค่า 0 ที่วัดจริงคงเป็น `0` และมีเลข `0` กำกับบนแท่งกราฟด้วย

## ขอบเขตที่ทดสอบจริง — 18 offline tests (`node --experimental-strip-types --test tests/monthly-rainfall.test.ts` → pass 18 / fail 0)

paging: 500-row cap ของ reader + เพดาน 20,000 (=40 หน้า) · batch 2,358 แถว เดิน 5 call ที่ offset `[0,500,1000,1500,2000]` และ `capped=false` · เพดานจริงกับ `total=30,000` → `collectedRows 20000, pages 40, capped true, completeness partial` + ข้อความเพดานใน warnings · หน้าว่างหยุดการเดินแม้ total จะใหญ่กว่า
ค่า: หนึ่งสถานีเก็บเดือนของตัวเอง, `0` คงเป็น `0`, แถวที่ไม่มีค่าเป็น `null` (`valueCount 4 / missingValueCount 2`), `unit null` + `pending_official_confirmation`, `declaredUnits` ตรงตามที่แถวระบุ · พิกัดถูกปฏิเสธ `latitude/longitude = null` **เมื่อสถานีมีหลายแถว** (เคสที่เพิ่งซ่อม — ดูหัวข้อถัดไป) · แถวของทรัพยากรอื่น/metric อื่นไม่เข้า payload แต่ก็ถูกนับใน "แถวที่อ่าน"
filter: จังหวัดที่ไม่มีสถานีรายงาน → `payload=null` แต่ `batch` และ `directory` อยู่ครบ → `empty` ไม่ใช่ "ไม่มีฝน" · ปีที่ไม่อยู่ใน batch → `[]` ไม่ดึงปีข้างเคียง · กรองสถานีอ่านเฉพาะสถานีนั้น · validator รับรูปแบบที่เอกสารระบุและปฏิเสธ `year=26|026|20260|abcd|2026-01`, `provinceCode=7|777|ab`, `stationCode=48|x21|'48 300'` (และยืนยันว่า `%30` decode เป็น `4800` ก่อนตรวจ จึงใช้ได้อย่างถูกต้อง)
สถานะ: reader โยน error → repository reject → envelope `metadata_only`/`source_api_fallback` "shown values: none" · ไม่มี batch → `metadata_only` + ข้อความตรง · ready → `dataAsOf`/`datasetVersion`/`sourceRetrievedAt`/`sourceIds` มาจากแถว, pagination เดินตามสถานี, ไม่มี `"unit":"mm"` ผุดใน JSON · mixed runs → `runCount 2`, `runId null`, `datasetVersion null`, `partial` · source register + limitations ติดไปกับทุก body · directory สร้างจาก record ของ builder (ไม่ map จังหวัดซ้ำ) รวม bucket ที่ไม่มีรหัสจังหวัด

## หลักฐานกับข้อมูลจริง (read-only ทั้งหมด · `.tmp_qa/new-feature-lane-7/probe-*.mjs`)

ทรัพยากร `ThailandMonthlyRainfall` ในคลัง: `access_status=approved_public`, `project_publication_approved=1`, `active_run_id=43547a08-b21a-5638-be59-070e3ebe3e42` (status `succeeded`)

| ข้อเท็จจริง | ค่า |
|---|---|
| แถวใน `observations` ของทรัพยากรนี้ | 2,370 (run `succeeded` 2,358 + run `partial` เก่า `33aad167…` อีก **12**) |
| ที่ API ส่งออกจริง | **2,358** — 12 แถวของ run เก่าถูก gate กันไว้ (ไม่แสดง ไม่ซ่อนแบบเงียบ ๆ) |
| สถานี / เดือน / ปี | 131 สถานี · เดือน 1–9 ของ **2026 ปีเดียว** · 2,358 ค่า มีตัวเลขครบ (`missingValueCount 0`) |
| จังหวัดตามทะเบียนสถานี | 130 สถานีมีรหัสจังหวัด (2,340 แถว) + **1 สถานี/18 แถวที่ไม่มีรหัสจังหวัด** → directory มี 72 bucket (71 จังหวัด + "ไม่ระบุจังหวัด" เรียงท้าย) · summary นับ `provincesWithReportingStation=71` |
| ค่า 0 ที่วัดจริง | ในรอบที่เผยแพร่ (2,358 แถว) มี **274 แถว `value=0`** และทุกแถวของ round นี้ `quality_status='good'` (ตรวจ raw rows ของสถานี 48452 ซ้ำ: เป็น 0 ที่ต้นทางรายงาน ไม่ใช่ gap) → หน้าแสดง `0` ไม่ใช่ `—` |
| พิกัด | ฟิลด์ละติจูด/ลองจิจูดสลับกันจริง (เช่น 100.58333 / 13.85) → `coordinateStatus=provider_field_order_suspect`, ไม่แสดงพิกัด |
| เพดานการเดิน | 2,358 < 20,000 จึง `capped=false, pages=5` — เคสชนเพดานผูกหลักฐานไว้ที่ offline test |
| `?year=2015` | 200 `empty` พร้อม directory — ยืนยันว่า "ไม่มีข้อมูล" กับ "ไม่มีฝน" แยกกันจริงบนข้อมูลชุดนี้ |

**ซ่อมใน builder เดิม 1 จุด** ([weather-monthly-data.ts:322](../../../web/lib/hub/weather-monthly-data.ts#L322)): `readCoordinates` ปฏิเสธพิกัดที่ฟิลด์สลับ แต่ branch รวมสถานีของแถวถัดไปยังเขียน `station.latitude ?? dimensionNumber(row,'latitude')` ทำให้แถวที่ 2 ของสถานีเดียวกัน **เติมค่าที่เดาไม่ได้กลับเข้ามา** (พบจากข้อมูลจริง: สถานีสถานะ suspect แต่ latitude=100.58) จึงเปลี่ยนเป็นเรียก `readCoordinates` ซ้ำและให้ suspect มีผลถาวร (sticky) ค่าตัวเลขอื่นไม่ได้รับผลกระทบ — ไม่มีไฟล์อื่น import module นี้

## ข้อจำกัดที่ยังเหลือ

1. **ยังไม่ deploy และยังไม่ตรวจ browser** — กติกาข้อ 9 ห้ามรัน dev/build ขณะ 7 lane ทำงาน หน้า `/monthly-rainfall` จึงยังยืนยันได้แค่ระดับ type + logic + data layer
2. **endpoint ยังไม่อยู่ใน `lib/hub/api-catalog.ts`** (ไฟล์ของผู้รวมงาน/AI 4) — ต้องเพิ่ม `/api/v1/weather/monthly-rainfall` เอง พร้อมไม่นำไปผูกกับ claims เรื่องสิทธิ์ใหม่
3. **ประวัติมีปีเดียว (2026)** — ผู้ใช้ต้องเห็น "2026 เท่านั้น" จาก dropdown; จะยืนยันได้ว่ามี 10–20 ปีต่อเมื่อ ingestion ย้อนหลังเสร็จ (ไม่ใช่งาน lane นี้) และ `directory` จะเพิ่มปีให้อัตโนมัติเมื่อแถวใหม่ผ่าน gate
4. **unit ยัง `pending_official_confirmation`** — จนกว่า TMD ยืนยันเป็นเอกสาร คอลัมน์ `unit` ต้องคง NULL; ถ้าผู้รวมงานตัดสินใจปล่อยหน่วยเมื่อไหร่ จุดแก้คือ `readUnits` ของ writer + test ไม่ใช่หน้าเว็บ
5. **จังหวัดที่ไม่มีสถานีในชุดนี้ไม่ได้แปลว่าไม่มีฝน** — หน้าเขียนไว้ทั้งใน badge, note และ empty state แต่ยังเป็นข้อความ ไม่ใช่กลไกบังคับ
6. เพดาน 20,000 แถวเพียงพอกับ batch ปัจจุบัน (2,358) มาก แต่ถ้ามีการย้อนหลังหลายปี ต้องเพิ่ม filter ฝั่ง SQL (`dimensions.year` JSON) หรือแบ่ง resource — ตอนนี้เป็นการเดินเต็ม batch แล้วกรองใน JS เพราะปี/จังหวัดอยู่ใน `dimensions` ไม่ใช่คอลัมน์ (`observations.province_code` เป็น NULL สำหรับแถว TMD ทุกแถว)

## สิ่งที่ผู้รวมงานต้องทำต่อ (browser flows ที่ต้องเปิดจริง)

1. `node_modules/.bin/tsc.cmd --noEmit --incremental false` ทั้ง repo หลัง AI 5–7 หยุดเขียน — ของ lane 7 ตอนนี้ **เหลือเฉพาะ error เก่าของไฟล์ generated** `.next/types/validator.ts:5` 4 บรรทัด (`AppRoutes`/`LayoutRoutes`/`ParamMap`/`AppRouteHandlerRoutes`) ซึ่งไฟล์ validator นั้นเป็นของเก่าที่ Next สร้างค้างไว้ใน `.next/` (gitignore) ขณะที่ `routes.d.ts` ปัจจุบันถูก generate ใหม่โดย **vinext** จึงไม่ export ชื่อเหล่านั้น — ไฟล์ validator ไม่อ้างถึง `/monthly-rainfall` เลย (grep = 0) จึงไม่ใช่ผลของ lane 7 · ทางแก้คือรัน `next typegen` / build รอบเดียว ไม่ใช่แก้ source
2. รัน dev → เปิด `http://127.0.0.1:3010/monthly-rainfall` ที่ 1440×900 และ 390×844:
   - จาก `/weather` กดลิงก์ "ดูยอดฝนรายเดือนต่อสถานีที่ /monthly-rainfall" แล้วกลับ ← ได้
   - หน้าแรก: badge "ข้อมูลจริง · 131 สถานี", unit note, coverage note (จังหวัดที่มีสถานีรายงาน 71 ไม่ใช่ 77), ตารางรายชื่อสถานี 131 แถว, กล่อง "ที่มา" (run sha `502c4b4d…`, ช่วง 2026-01-01→2026-09-30, 2358/2358 แถว 5 หน้า)
   - เลือก ปี=2026 + จังหวัด=ลำพูน(51) → submit → ต้องเหลือ 1 สถานี แล้วกดเข้าหน้าสถานี → กราฟ SVG มี 12 ช่อง (9 เดือนเผยแพร่ + 3 เดือนเป็น `–`) และเดือน 0 มีเลข `0` กำกับ
   - reload / copy URL ที่มี `?provinceCode=51&stationCode=48329&year=2026&metric=monthly_rainy_days` ต้องได้หน้าจอเดิม ( Server Component ไม่มี client state)
   - พิมพ์ URL ที่ไม่ตรงกับข้อมูลจริง `/monthly-rainfall?year=2015` → ต้องเห็น empty state พร้อม "เลือกได้: …" ไม่ใช่ตารางค่า 0; `?provinceCode=99` → ต้องเห็น note "ไม่ผ่านสัญญาของ API" แล้วแสดงทั้ง batch ที่อ่านได้แทน
   - สลับ metric เป็น "จำนวนวันฝนตกสะสมรายเดือน" แล้วเทียบว่ากราฟ/คอลัมน์ที่เน้นเปลี่ยน แต่ตัวเลขในตารางทั้งสอง metric ยังแสดงคู่กัน
3. ยืนยันด้วย `curl` ว่าสิทธิ์ไม่ถอย: `curl -s "http://127.0.0.1:3010/api/v1/weather/monthly-rainfall?pageSize=1" | jq '.meta, .pagination'` → ต้อง `ready/approved_public/database` และ `total=131`
4. ถ้าต้องการให้หน้า `/nwp` หรือ `/weather` link หน้าที่ 1 ของ series มาที่หน้านี้ ให้เพิ่มที่ไฟล์ของ lane นั้น (lane 7 ไม่ได้แตะ navigation/shared shell ตามกติกาข้อ 3)
5. ลบ `.tmp_qa/new-feature-lane-7/` หลังรวมงาน (probe `.mjs` 9 ไฟล์ + baseline `.orig` 2 ไฟล์ — ทุกไฟล์อ่าน `.env.local` เข้า process.env เท่านั้น ไม่พิมพ์ค่า credential และไม่เขียนไฟล์ใน repo)
