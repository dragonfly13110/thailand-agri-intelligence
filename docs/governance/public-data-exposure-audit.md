# Public data exposure audit — 25 หน้า และ 23 API routes

ตรวจเมื่อ 25 ตุลาคม 2569 โดย AI-1 (Data Governance Containment) จาก source code, route handlers, `meta` envelope และ test ที่รันในเครื่อง ไม่ได้เปิด browser หรือ deploy

ขอบเขต: `web/app/**/page.tsx` ทุกไฟล์ (25 ไฟล์ รวม dynamic 2 ไฟล์), `web/app/api/v1/**/route.ts` ทุกไฟล์ (23 ไฟล์), `web/lib/hub/*` ที่ป้อนข้อมูลให้หน้า/route, และ `config/resource_licenses.json`

หลักการที่ใช้ตัดสิน:

- resource ที่ `pending` เผยแพร่ได้เฉพาะ metadata, คำอธิบาย, ลิงก์ต้นทาง และ warning — ห้ามมีตัวเลข observation/capacity/price/percent/count ที่มาจากต้นทาง
- ค่าที่เป็น simulation ต้องมี `sample: true`, `access: metadata_only`, warning และข้อความ "จำลอง/ตัวอย่าง" ใน UI
- ค่าที่เป็น `approved_public` เท่านั้นที่ผ่าน numeric repository และแสดงเป็นตัวเลขจริงได้
- API ทุก route ต้องผ่าน `jsonData`/`handleApi` ซึ่งใส่ `cache-control: no-store`
- ค่า missing ต้องเป็น `null`/empty ไม่ใช่ 0

## สรุปผล

| ระดับ | จำนวน | ความหมาย |
|---|---:|---|
| ปิดแล้วใน lane AI-1 | 4 หน้า + 4 routes | ไม่มีตัวเลขจริงของ RID/OAE ใน HTML/props/API/cache และ route ตอบ flag ถูกต้อง |
| ปลอดภัยอยู่แล้ว/แก้ไขแล้ว | 18 หน้า + 18 routes | metadata-only, simulation sample, approved-only numeric หรือ static content ที่ไม่มีตัวเลข pending |
| ความเสี่ยง cross-lane ที่ยังเปิด | 3 หน้า + 1 route + shared shell | `/crops`, `/areas/compare`, `/areas/[provinceCode]`, `/api/v1/crops` และเมนู 461 (รายละเอียด G-01 ถึง G-05) |

## หน้าเว็บทั้งหมด (25 ไฟล์)

| Path | ข้อมูลที่แสดง | แหล่ง/licence | sample / access | Cache ของ HTML | ผล |
|---|---|---|---|---|---|
| `/` | สถานะ metadata ของ RID และ OAE/NABC, รายชื่อสินค้าและหน่วย, ทางเข้า catalog | RID pending, OAE/NABC pending | metadata only, ไม่มีตัวเลข | static HTML; ไม่มีตัวเลข pending | ปิดแล้ว (AI-1) |
| `/water` | metadata อ่างเก็บน้ำ, ข้อจำกัด, warning, ลิงก์ต้นทาง | RID pending | `metadata_only`, `unknown` | static HTML; ไม่มีตัวเลข | ปิดแล้ว (AI-1) |
| `/prices` | metadata สินค้า/หน่วย/ตลาด/ความถี่, ไม่มีราคา | OAE/NABC pending | `metadata_only`, `unknown` | static HTML; ไม่มีราคา | ปิดแล้ว (AI-1) |
| `/early-warning` | deterministic simulation 14 วัน + อ่างจำลอง `sim-rsv-*` | simulation model | `sample: true`, `metadata_only` | `force-dynamic` (ไม่แชร์ HTML cache) | ปิดแล้ว (AI-1) |
| `/weather` | พยากรณ์ 7 วันแบบ deterministic sample | TMD pending | `sample: true`, API `metadata_only` | static HTML + client fetch no-store | มี sample/warning ครบ; route ยังรายงาน `completeness: complete` ของ sample (G-04) |
| `/crops` | ปฏิทิน/พันธุ์พืช และสถิติผลผลิต OAE รายปี | OAE/DOAE pending | API `metadata_only` แต่มีตัวเลขสถิติจริง | static HTML | ความเสี่ยง G-03 |
| `/soil` | กลุ่มชุดดิน/คำแนะนำปุ๋ยอ้างอิง | LDD pending | API `metadata_only` | static HTML | ตัวเลขเป็นคำแนะนำอ้างอิง ไม่ใช่แถวสถิติ LDD; เฝ้าระวัง G-03 |
| `/carbon` | deterministic sample | โครงการจำลอง | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/finance` | deterministic sample | โครงการจำลอง | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/food-safety` | deterministic sample | โครงการจำลอง | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/livestock` | deterministic sample | DLD/DOF pending | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/logistics` | deterministic sample | โครงการจำลอง | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/machinery` | deterministic sample | โครงการจำลอง | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/smart-farming` | deterministic sample | โครงการจำลอง | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/trade` | deterministic sample | โครงการจำลอง | `sample: true`, `metadata_only` | static HTML | ผ่าน (AI-2) |
| `/catalog` | metadata catalog จาก API | หลายแหล่ง pending/approved | metadata only | static shell + client fetch no-store | ผ่าน (AI-2) |
| `/catalog/[id]` | metadata รายละเอียดชุดข้อมูล | หลายแหล่ง | metadata only | `force-dynamic` | ผ่าน (AI-2) |
| `/data` | redirect ไป `/catalog` | — | — | — | ผ่าน |
| `/explore` | ค้น metadata และเปิด numeric เฉพาะ resource/series ที่อนุมัติ | approved-only | ตัวเลขเฉพาะ approved | client fetch no-store | ผ่าน (AI-2) |
| `/areas` | coverage/evidence รายจังหวัด | D1/fallback | numeric เฉพาะ approved; ไม่มี DB = empty | client fetch no-store | ผ่าน (AI-2) |
| `/areas/compare` | เปรียบเทียบ weather sample + soil/crops reference + water | TMD pending, RID pending | water panel fail-closed | client fetch no-store | water contract เก่า ทำให้ panel error (G-02) |
| `/areas/73/rice` | rice pilot จาก price series ที่อนุมัติ | approved-only | numeric เฉพาะ approved | client fetch no-store | ผ่าน (AI-2) |
| `/areas/[provinceCode]` | weather sample, province evidence, water/soil/crops | TMD/RID pending, approved evidence | water panel fail-closed | client fetch no-store | water contract เก่า + ข้อความ 461 ใน component (G-02) |
| `/projects` | empty state; ไม่มีตัวเลขโครงการ | — | — | static HTML | ผ่าน |
| `/about` | วิธีใช้/ที่มา metadata | — | — | static HTML | ผ่าน |

หมายเหตุ: ทุกหน้าอยู่ใต้ `Shell` ซึ่งยังมีเมนู `สถานการณ์ 461 อ่างเก็บน้ำ` — ตัวเลข 461 ปรากฏใน HTML ทุกหน้าแม้เนื้อหาหน้าเองจะไม่มีตัวเลขแล้ว (G-01)

## API routes ทั้งหมด (23 ไฟล์)

ทุก route ใช้ `jsonData`/`handleApi` จาก `web/lib/hub/http.ts` จึงตอบ `cache-control: no-store` รวมถึง error envelope

| Route | ข้อมูล | Licence/access | availability / completeness | ผล |
|---|---|---|---|---|
| `/api/v1/sources` | metadata แหล่งข้อมูล | metadata-only | ตาม repository | ผ่าน |
| `/api/v1/sources/{id}/status` | สถานะ/metadata | metadata-only | ตาม repository | ผ่าน |
| `/api/v1/datasets` | metadata catalog | metadata-only | ตาม repository | ผ่าน |
| `/api/v1/datasets/{id}` | metadata รายละเอียด | metadata-only | ตาม repository | ผ่าน |
| `/api/v1/datasets/{id}/records` | numeric เฉพาะ approved batch | `approved_public` เมื่อมีแถว; ไม่มี = `metadata_only`/empty | ตาม repository | ผ่าน |
| `/api/v1/datasets/{id}/series` | numeric เฉพาะ approved batch | เช่นเดียวกัน | ตาม repository | ผ่าน |
| `/api/v1/series/{id}/observations` | numeric เฉพาะ approved batch | เช่นเดียวกัน | ตาม repository | ผ่าน |
| `/api/v1/weather` | deterministic sample 7 วัน | `metadata_only` | `ready` / `complete` ของ sample | ผ่านเรื่องตัวเลข; G-04 เรื่องความหมาย `complete` |
| `/api/v1/water/reservoirs` | metadata RID เท่านั้น | `metadata_only` | `metadata_only` / `unknown` | ปิดแล้ว (AI-1) |
| `/api/v1/crops` | reference + สถิติ OAE จริง | `metadata_only` | `ready` / `complete` | G-03 |
| `/api/v1/soil` | reference ชุดดิน/ปุ๋ย | `metadata_only` | `ready` / `complete` | ผ่านในฐานะ reference; G-04 |
| `/api/v1/areas/{provinceCode}` | evidence เฉพาะ approved | `approved_public` เมื่อมีแถว; ไม่มี = metadata-only empty | ตาม repository | ผ่าน |
| `/api/v1/prices/daily` | metadata OAE/NABC เท่านั้น | `metadata_only` | `metadata_only` / `unknown` | ปิดแล้ว (AI-1) |
| `/api/v1/carbon` | deterministic sample | `metadata_only` | `ready` / `partial` | ผ่าน (sample flag) |
| `/api/v1/finance` | deterministic sample | `metadata_only` | `ready`/`empty` / `partial`/`unknown` | ผ่าน |
| `/api/v1/food-safety` | deterministic sample | `metadata_only` | `ready` / `complete`/`partial` | ผ่าน (sample flag); G-04 |
| `/api/v1/livestock` | deterministic sample | `metadata_only` | `ready` / `complete` | ผ่าน (sample flag); G-04 |
| `/api/v1/logistics` | deterministic sample | `metadata_only` | `ready` / `complete` | ผ่าน (sample flag); G-04 |
| `/api/v1/machinery` | deterministic sample | `metadata_only` | `ready` / `partial` | ผ่าน |
| `/api/v1/smart-farming` | deterministic sample | `metadata_only` | `ready` / `partial` | ผ่าน |
| `/api/v1/trade` | deterministic sample | `metadata_only` | ตาม payload / `complete` | ผ่าน (sample flag); G-04 |
| `/api/v1/early-warning` | deterministic simulation | `metadata_only` | `metadata_only` / `unknown` | ปิดแล้ว (AI-1) |
| `/api/v1/weather-engine` | ไม่มีข้อมูล; 503 | ไม่มี | ไม่มี | ปิดแล้ว (AI-1) |

## ก่อน/หลังของจุดที่ AI-1 ปิด

| จุด | ก่อน | หลัง |
|---|---|---|
| `/water` HTML | KPI/ตาราง/กราฟจาก snapshot อ่างจริง 461 แถว | metadata + limitation + warning; `reservoirs: []`, `summary: null` |
| `/api/v1/water/reservoirs` | `summary` + `data` จาก snapshot จริง, ไม่มี governance flag/no-store | `{source, reservoirs: [], summary: null}`; `metadata_only`/`unknown`; `no-store`; pagination total 0 |
| `/prices` HTML | ราคา/เปลี่ยนแปลง/กราฟจาก snapshot OAE | รายการสินค้า/หน่วย/ตลาดเท่านั้น; ไม่มีราคา |
| `/api/v1/prices/daily` | `data: CommodityPrice[]` + `meta` เดิม ไม่มี access/sample | `{source, commodities, prices: []}`; `metadata_only`/`unknown`; `no-store` |
| `/early-warning` HTML | import `RESERVOIRS` จริง, อ้าง "สถิติจริงจาก 461 อ่าง" | deterministic simulation, อ่าง `sim-rsv-*`/ชื่อ "อ่างเก็บน้ำจำลอง", banner simulation |
| `/api/v1/early-warning` | ตัวเลขจาก RID snapshot | simulation + `sample: true`, `metadata_only`, `unknown`, warning, `no-store` |
| `/api/v1/weather-engine` | เรียก Open-Meteo สด และตอบ `approved_public`/`complete` | 503 `SOURCE_UNAVAILABLE`, ข้อความสิทธิ์, `no-store`, ไม่เรียก upstream |
| `/` | KPI น้ำ/ราคาจริงจากการ import snapshot | การ์ดสถานะ metadata-only, ไม่มีตัวเลขน้ำ/ราคา/จำนวนชุดข้อมูลแบบ hardcode |
| `docs/source-license-register.md` | 72 รายการ / 71 pending / "70" | 82 รายการ / 81 pending / 1 approved_public พร้อมวันที่และคำสั่งตรวจนับ |

## ความเสี่ยงที่ยังเปิดและเจ้าของ

### G-01 — shared shell ยังพิมพ์ "461 อ่างเก็บน้ำ" (P0, เจ้าของ AI-2)

`web/components/shell.tsx:48` มี `title: 'สถานการณ์ 461 อ่างเก็บน้ำ'` และถูก render ในทุกหน้า รวม `/`, `/water`, `/prices`, `/early-warning` ทำให้ตัวเลขจำนวนอ่างจริงยังอยู่ใน HTML/navigation แม้เนื้อหาหน้าจะปิดแล้ว ห้าม AI-1 แก้ไฟล์นี้ตามคำสั่งงาน ต้องให้ AI-2 เปลี่ยนเป็นข้อความที่ไม่มีจำนวน เช่น "สถานะข้อมูลอ่างเก็บน้ำ"

### G-02 — consumers ของ water API ยังใช้ contract เก่า (เจ้าของ AI-2)

- `web/components/province-agri-overview.tsx` ตรวจ `summary.regionSummaries`/`riskCounts`/`meta.verifiedGrain` และมีข้อความ "461 อ่างทั้งประเทศ" ที่บรรทัด 468/470; เมื่อ API ใหม่คืน `summary: null` panel จะ fail-closed ด้วย error (ไม่แสดงเลข) แต่ component ยังมีเลข 461 อยู่ใน bundle
- `web/components/province-compare.tsx` ตรวจ `summary.regionSummaries` เช่นกัน จึงแสดง water error
- `web/lib/hub/api-catalog.ts` ยังอธิบาย response shape เก่าของ water/prices และไม่มี route ใหม่ของ AI-2 ครบ ต้องอัปเดตพร้อม owner

ผลกระทบ: `/areas/[provinceCode]` และ `/areas/compare` สูญเสีย panel น้ำชั่วคราว (ไม่รั่วตัวเลข) จน AI-2 แก้ contract

### G-03 — `/crops` และ `/api/v1/crops` เผยแพร่สถิติ OAE จริงขณะ licence pending (P0, เจ้าของ AI-2)

`web/lib/hub/crops-soil-data.ts` มีตัวเลขพื้นที่/ผลผลิต/ผลผลิตเฉลี่ยรายปี (เช่น 62.10 ล้านไร่, 26.93 ล้านตัน, 434 กก./ไร่) พร้อม source URL OAE ขณะที่ API ประกาศ `access: metadata_only` และ registry ของ OAE/DOAE เป็น pending ตามกฎ "pending = metadata/link only" ตัวเลขเหล่านี้ไม่ควรอยู่ใน public HTML/props/API จนกว่าจะมีหลักฐานสิทธิ์หรือเปลี่ยนเป็น sample ที่ไม่ใช่ค่าจริง ต้องให้ AI-2 ตัดสินใจและแก้ `crops-soil-data.ts`/`crops-dashboard`

### G-04 — sample routes ใช้ `completeness: complete` (เจ้าของ AI-2)

`/api/v1/weather`, `/crops`, `/soil`, `/food-safety`, `/livestock`, `/logistics`, `/trade` ตอบ `completeness: complete` ขณะ `access: metadata_only` และ (บาง route) `sample: true` ความหมายอาจถูกอ่านว่า "ต้นทางครบ" แม้เป็น sample/reference ไม่ใช่ numeric leak แต่ควรทบทวนให้ใช้ `partial`/`unknown` หรือเพิ่มคำอธิบายว่า complete หมายถึงความครบของชุดตัวอย่าง

### G-05 — เอกสารนอก lane ยังเขียน 72/71 (เจ้าของ AI-3)

- `HANDOFF.md:162` — 72/71 (ห้าม AI-1 แก้)
- `SYSTEM_DESIGN.md:129` — 72/71
- `IMPLEMENTATION_PLAN.md:24`, `:73` — 72/71
- `docs/decisions/0002-source-backed-web-data.md:40` — "71 รายการ"
- `docs/archive/2026-10-24-redesign/HANDOFF.md:72` — historical archive ไม่ต้องแก้

`docs/source-license-register.md` แก้แล้วในรอบนี้; ส่วนที่เหลือต้องให้เจ้าของเอกสารนั้นเปลี่ยนเพื่อไม่ให้ตัวเลข coverage ขัดกับ registry 82/81/1

## วิธีตรวจซ้ำ

```bash
python -c "import json,collections; d=json.load(open('config/resource_licenses.json',encoding='utf-8')); print(len(d['resources']), collections.Counter(r['license_status'] for r in d['resources']))"
cd web && node --experimental-strip-types --test tests/governance-containment.test.ts
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build:vinext
```

## ข้อจำกัด

- ตรวจจาก source/Response object ใน Node test ไม่ได้เปิด browser จริง จึงไม่ยืนยันภาพที่ผู้ใช้เห็นหรือ header จาก CDN จริง
- ไม่ได้ตรวจ `data/local/` หรือ `exports/private/` ตามข้อห้าม
- สถานะ licence อ้างอิง `config/resource_licenses.json` ณ `reviewed_at` 2026-10-25; ไม่ได้เรียก upstream ใหม่ในรอบ audit นี้
