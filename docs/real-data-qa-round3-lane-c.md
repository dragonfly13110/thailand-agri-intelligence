# QA & Verification — Real Data รอบ 3 · Lane C (`/weather` ตัวเลขจริง) — 26 ต.ค. 2569

เอกสารนี้บันทึกเฉพาะ **R3-C**: เผยแพร่ค่าตรวจวัดจริงจากสถานี TMD + ชุด ERA5 ที่อยู่ใน D1 แล้ว ผ่าน API ใหม่และหน้า `/weather` · รันทุกคำสั่งใน working tree ปัจจุบัน **ไม่ commit / ไม่ push / ไม่ deploy** ตามกฎเจ้าของงาน · เวลาตรวจทั้งหมดเป็น UTC วันที่ 2026-10-26 · dev server `http://127.0.0.1:3000`

## ขอบเขตไฟล์ (lane C)

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| [web/lib/hub/weather-observations-data.ts](../web/lib/hub/weather-observations-data.ts) | แก้ไข | shared builder + สัญญา source/metrics ของฝั่ง API และฝั่งหน้าเว็บ |
| [web/lib/hub/weather-repository.ts](../web/lib/hub/weather-repository.ts) | ใช้ต่อ (round 1) | อ่าน D1 แบบ paginate + gather provenance ต่อทรัพยากร |
| [web/app/api/v1/weather/observations/route.ts](../web/app/api/v1/weather/observations/route.ts) | ใหม่ | endpoint ตัวเลขจริง 3 สถานะซื่อสัตย์ |
| [web/components/weather-observations-panel.tsx](../web/components/weather-observations-panel.tsx) + `.module.css` | ใหม่ | บล็อกข้อมูลจริง server-rendered บน `/weather` |
| [web/app/weather/page.tsx](../web/app/weather/page.tsx) | เขียนใหม่ | อ่าน repository ตรง ๆ + `?province=NN` + แยก state "อ่านไม่สำเร็จ" ≠ "ไม่มีข้อมูล" |
| [web/lib/hub/api-catalog.ts](../web/lib/hub/api-catalog.ts) | แก้ไข | ลงทะเบียน endpoint `weather-observations` (17 endpoints) |
| [web/tests/weather-observations.test.ts](../web/tests/weather-observations.test.ts) · [web/tests/api-catalog.test.ts](../web/tests/api-catalog.test.ts) | แก้ไข | ผูกสัญญา 13 tests + นับ endpoint |

ไม่แตะ `web/lib/hub/weather-data.ts` (เส้นทางพยากรณ์ 7 วันยัง `sample:true` คนละสัญญา) · ไม่แตะ `config/resource_licenses.json`, `.env*`, `data/local/**`

## ผลตรวจ API จริง (curl ต่อ dev server)

| Query | HTTP | `availability` | `access` | `runtimeMode` | stations | `pagination.total` | reanalysis |
|---|---|---|---|---|---|---|---|
| *(ไม่มีพารามิเตอร์, default page)* | 200 | `ready` | `approved_public` | `database` | 25 | 37 | 10 |
| `?pageSize=100` | 200 | `ready` | `approved_public` | `database` | **37** | 37 | 10 |
| `?provinceCode=57` | 200 | `ready` | `approved_public` | `database` | 2 | 2 | 0 |
| `?provinceCode=51` | 200 | `metadata_only` | `metadata_only` | `database` | 0 | 0 | 0 |
| `?date=2026-10-25` | 200 | `metadata_only` | `metadata_only` | `database` | 0 | 0 | 0 |
| `?provinceCode=99` | **400** | `INVALID_QUERY` | — | — | — | — | — |
| `?date=bad` | **400** | `INVALID_QUERY` | — | — | — | — | — |
| `?page=0` | **400** | `INVALID_QUERY` ("1 ถึง 10000") | — | — | — | — | — |
| `?pageSize=101` | **400** | `INVALID_QUERY` ("1 ถึง 100") | — | — | — | — | — |

`metadata_only` ตอบ `stations: []`, `summary: null` พร้อม warning ว่า "อ่านคลังข้อมูลกลางสำเร็จ แต่ไม่มี… " — ไม่เคยแปลว่า "ไม่มีฝน" · 503 path (D1 อ่านไม่สำเร็จ) ทำหน้าที่เดียวกันโดย `runtimeMode=source_api_fallback`

## ความซื่อสัตย์ของตัวเลข (ตรวจจาก payload จริง `?pageSize=100`)

- `observationDate=2026-10-26`, `otherObservationDates=[]`, `calculationVersion=weather-observations-v1` — วันเดียวต่อหนึ่งคำตอบ
- สถานี 37 ตัว · `unit === null` **ทุกแถว** · `unitStatus=pending_official_confirmation` ทุกแถว · หน่วยที่ต้นทางประกาศ (`celcius/mm/%/km/h/degree/mb`) แสดงเฉพาะเป็น metadata (`declaredUnits`) ไม่เคย assert เป็นหน่วยทางการ; มีเพียง `wind_speed_ms` ที่ผ่าน km/h→m/s ตามเอกสาร adapter
- ค่า `null` ในตาราง = em dash ไม่ใช่ 0: cells ทั้งหมด 296 ช่อง (37×8) มี null 0 ช่อง และ `stationsWithMissingRainfall=0` ในรอบนี้
- ไม่มี rollup: payload ไม่มี `provinceAverage` / `averageRainfallMm` / `totalRainfallMm` / `coverageProvinces` (test ผูกไว้) · `provincesWithReportingStation=35` คือ "นับจากสถานี" ไม่ใช่ coverage 77 จังหวัด (77 เป็นทะเบียนอ้างอิง)
- province code ↔ ชื่อจังหวัด ตรงกับทะเบียน 77 รายการใน `web/lib/provinces.ts` **0 รายการคลาดเคลื่อน** (ตรวจคู่ของสถานี 35 จังหวัด + ERA5 10 จุดกริด)
- forecast ไม่ปะปน: ทรัพยากรพยากรณ์ TMD ไม่มีใน `RESOURCE_META` ของฝั่งนี้ และ test "unknown metrics are dropped…" กันแถว metric ที่ไม่อยู่ใน 8 ตัว
- `meta.freshness=unknown` เพราะ `sources.freshness_days` ของกลุ่มอากาศยังไม่ตรงกัน/เป็น NULL → ไม่แต่งตัวเลข · `completeness=partial` เพราะรอบ synop/V2 มีสถานะ `partial` (บอกใน warning ข้อ 5)

## ข้อบกพร่องที่พบระหว่างทางและแก้ใน lane นี้ (มี test คุมทุกตัว)

1. **`coolest` ผิดสถานี (ข้อมูลผิดจริง)** — `pickExtreme` เปรียบเทียบแบบ max ทุกตัว ทำให้ "ต่ำที่สุด" คืนค่า *สูงสุด* ของ `tmin_c` บนหน้า (`28.4` สมุทรปราการ) ทั้งที่จริง `20.3` ดอยมูเซอร์ สกษ. (48387) → กลับ comparator เฉพาะ `tmin_c` + เพิ่ม test "summary extremes name the station that actually holds them"; ยืนยันกับ D1 จริงแล้ว `coolest={"stationCode":"48387","value":20.3}`
2. **หัวคอลัมน์อ้างหน่วยที่ต้นทางไม่ได้ระบุ** — เคยเขียน "ตามที่ต้นทางระบุ" ต่อท้าย m/s และ hPa ทั้งที่ payload declares km/h และ mb → เปลี่ยนเป็น `publishedUnit` (สิ่งที่เผยแพร่จริง) + `publishedUnit` ของลมเขียนว่า "แปลงจาก km/h ตามที่ต้นทางระบุ" และแสดง `declaredUnits` ราย metric ในแถบสถานะหน่วย
3. **นับแถวเป็นค่าขาดหาย (ของใหม่ในการตรวจครั้งสุดท้าย)** — สถานี synoptic 3 ตัวถูกเผยแพร่ซ้ำโดย 2 ทรัพยากร (`WeatherTodayBySynop` + `WeatherToday V2`) ทำให้ 16 แถว/สถานี และโค้ดเดิม `else { missingMetricCount += 1 }` นับแถวที่สองของ metric ที่รายงานแล้วเป็น "ขาดหาย" → หน้าเว็บแสดง `8/16` ทั้งที่ 8 ค่าครบจริง (ทั้ง payload มียอด phantom 24) → นับใหม่เป็น **ราย metric ที่ไม่ซ้ำ** (`reportedMetricCount` = จำนวน metric ที่มีค่า, `missingMetricCount` = metric ที่ทุกแถวที่ส่งมามีคุณภาพ `missing` เท่านั้น) + เพิ่ม 2 tests ("a station published by two resources reports each metric once…" และ "one resource reporting a gap while another reports the value leaves no miss") · ผลหลังแก้: `reported sum 296 · missing sum 0` และคอลัมน์เปลี่ยนหัวเป็น "ค่าที่รายงาน" แสดงเฉพาะตัวเลข (มี `ขาด N` + tooltip เมื่อมี gap จริง)

## หลักฐานการตรวจสอบ (รันจริงทุกลำดับ)

```
$ npm --prefix web run test            → tests 120 · pass 120 · fail 0
$ npm --prefix web run typecheck       → ✓ Types generated · tsc --noEmit ไม่มี error
$ npm --prefix web run build:vinext    → Build complete. (exit 0) · └ ƒ /weather (dynamic)
$ curl /api/v1/weather/observations?pageSize=100
  meta {"ready","approved_public","partial","unknown"} · stations 37 · era5 10 blocks × 30 วัน
  summary hottest 48458 ฉะเชิงเทรา 36.8 · coolest 48387 ดอยมูเซอร์ 20.3 · wettest 48350 เลย สกษ. 25.6
          mostHumid 48560 พัทลุง 100 · windiest 48453 กรุงเทพฯ บางนา 0.8
  datasetVersion ee7f723a51b4634e… (sha256 ของรัน agro) · sourceUpdatedAt 2026-10-26T12:16:03Z
$ npm --prefix web run test (api-catalog) → 8/8 (17 endpoints · weather-observations ลงทะเบียนแล้ว)
```

provenance ที่หน้า `/weather` แสดงต่อทรัพยากร (จาก snapshot จริง): agro 272 แถว `succeeded` · synop 24 แถว `partial` · WeatherToday V2 24 แถว `partial` · ERA5 1,800 แถว `succeeded` — พร้อม adapter version, sha256 ย่อ, run id และเวลา retrieves ของแต่ละรอบ (ไม่รวมกันเป็นก้อนเดียว)

## ตรวจด้วย browser (Playwright, dev server จริง)

| Viewport | URL | ผล |
|---|---|---|
| 1440×900 | `/weather` | แถวในตาราง 47 (สถานี 37 + ERA5 10) · 2 ตาราง · มีแถบ `unit = null · pending_official_confirmation` · ไม่มี horizontal overflow ของเอกสาร · provenance + ERA5 + ป้าย "ข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ" อยู่ครบ · console **0 errors** / 1 warning (preload CSS ของ `Shell` มีอยู่ก่อนแล้ว ไม่เกี่ยวกับการแก้รอบนี้) |
| 390×844 | `/weather` | `documentOverflowX=false` (scrollWidth 375 ≤ 390) · ทั้งสองตารางไหลใน `.data-table-scroll` ของตัวเอง (1798px/778px ใน container 299px) เป็น pattern เดียวกับ `/water` · 47 แถว · chips จังหวัด 36 ตัว · ไม่มี cell แบบ `x/16` เหลืออยู่ |
| 390×844 | `/weather?province=51` | badge "ยังไม่เผยแพร่ตัวเลข" · แถว 0 · ข้อความแยก "อ่านคลังสำเร็จ แต่ไม่มีสถานี/จุดกริดของจังหวัดนี้ที่ผ่านเงื่อนไข" · ไม่ลากค่าจังหวัดอื่นมาปน · ไม่พูดว่าค่าว่าง = 0 · overflow ไม่เกิด · console 0 errors |

## ค้าง / ต้องรายงาน lane อื่น (ไม่แก้เอง)

- **Duplicate publication ของสถานี synoptic** — `tmd-station-d1/1.0.0` เขียนสถานี 48303/48304/… ทั้งจาก `WeatherTodayBySynop/V1` และ `WeatherToday/V2` ทำให้ 1 สถานีมี 2 แถวต่อ metric; ฝั่งอ่านกันไว้ด้วย metric-level dedup แล้ว แต่ **ฝั่งเขียนควรมี constraint** (owner: lane B / R1-D)
- **`sources.freshness_days` ของกลุ่มอากาศ** เป็น NULL/ไม่เท่ากัน → `meta.freshness=unknown` ตลอด (owner: governance)
- **`/api/v1/weather` ยัง `sample:true`** เพราะยังไม่มีทรัพยากร forecast ที่ `approved_public`; `weather-observations` จึงเป็นเส้นทางตัวเลขจริงเดียวของหมวดนี้
- **ข้อความ 503 ของ `/api/v1/weather-engine`** ยังอ้างว่ารอ ERA5 ทั้งที่ ERA5 เผยแพร่แล้ว — ถ้อยคำค้าง (owner: lane เดิมกับ weather-engine)
- **defect #7** `filterId()` ปฏิเสธค่าที่มี `_` → lane C กรอง metric/province ใน JavaScript แทน (เจ้าของไฟล์ `d1-numeric-repository.ts` ควรแก้)

## คำสั่งรับต่อ

```
npm --prefix web run test                     # ต้องได้ 120/120
npm --prefix web run typecheck && npm --prefix web run build:vinext
curl -s "http://127.0.0.1:3000/api/v1/weather/observations?pageSize=100" | node -e "…"   # ดู summary + missing sum ต้องเป็น 0
# กรองจังหวัด: /weather?province=57 (มีสถานี) · /weather?province=51 (metadata-only)
# อัปเดตตัวเลขใหม่: PYTHONPATH=src .venv/Scripts/python.exe -m tadih.cli ingest --adapter tmd-station --write (แล้วรัน ERA5 ต่อ)
```
