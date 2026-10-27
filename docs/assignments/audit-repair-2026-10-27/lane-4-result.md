# Lane 4 result — Price category filtering + API catalog entry (audit item 7)

วันที่: 2026-10-27
เจ้าของ: lane 4 (`/api/v1/prices/daily` route, price repository, catalog entry ของ endpoint นี้)
ฐานงาน: working tree ปัจจุบันของ `T:\coding+\BI AGRI THAILAND` (HEAD `14026f0` + งาน uncommitted ของเจ้าของเดิม) — ไฟล์ทั้ง 4 ใน lane นี้ modified อยู่ก่อนเริ่มแล้ว; snapshot ตั้งต้นเก็บไว้ที่ `.tmp_qa/audit-repair-lane-4/baseline.diff` ไม่ได้ checkout/reset/stash/commit/push/deploy ไม่ได้เขียน D1 และไม่ได้เรียกต้นทางจริงจากเทสต์

## สิ่งที่แก้

### 1. `web/lib/hub/price-repository.ts`

- เพิ่ม `findUpstreamProducts(category?)` ([price-repository.ts:459](../../../web/lib/hub/price-repository.ts#L459)) — resolve หมวดเป็นรายการ `PriceUpstreamProduct` โดยอ่าน `PRICE_COMMODITIES` (field `category`) และ `PRICE_UPSTREAM_PRODUCTS` (field `commodityId`) ตาม mapping เดิม ไม่สร้างตารางหมวดที่สอง
  - ไม่ระบุ category / `''` / `all` → ทุกสินค้าที่ติดตาม (6 รายการ) เท่ากับ `PRICE_UPSTREAM_PRODUCTS` เดิม
  - หมวดที่ตรง → เฉพาะสินค้าของหมวดนั้น
  - หมวดที่ไม่ตรงกับหมวดใด หรือหมวดที่มี metadata แต่ไม่มี upstream product (เช่น `ปศุสัตว์`) → `[]` ไม่ fallback เป็นทุกสินค้า
- `readPriceSnapshot` ไม่เปลี่ยน contract เดิม แต่ตอนนี้รับชุดสินค้าที่กรองแล้วผ่าน `options.products` ที่มีอยู่แล้ว และแก้เกณฑ์ `complete` ([price-repository.ts:527](../../../web/lib/hub/price-repository.ts#L527)) เป็น `products.length > 0 && productsSucceeded === products.length` — ชุดว่างเรียก 0 ครั้งจึงไม่ถูกอ้างว่า complete อีกต่อไป
- เอกสารหัวโมดูล (BOUNDS) ระบุว่าการอ่านจำกัดตามสินค้าที่เลือก ไม่เปลี่ยนพฤติกรรม null/unit/dedup/date ของ `normalizeDailyPriceRows` หรือ `fetchDailyPricePage`

### 2. `web/app/api/v1/prices/daily/route.ts`

- คำขอเรียก `readPriceSnapshot({ date, products: findUpstreamProducts(category) })` ([route.ts:100](../../../web/app/api/v1/prices/daily/route.ts#L100)) ดังนั้น `category` กรองทั้ง `commodities` (metadata ที่กรองแล้วเหมือนเดิม) และ `prices` เพราะแถวที่อ่านได้มาจากสินค้าของหมวดนั้นเท่านั้น; ไม่มีการเฉลี่ย/รวมราคาข้ามสินค้า เกรด หน่วย หรือตลาด
- สาขา response ว่างแยกสาเหตุตามจริง ([route.ts:102](../../../web/app/api/v1/prices/daily/route.ts#L102)):
  - `productsRequested === 0` (หมวดไม่ตรง/ไม่มีสินค้าที่ติดตาม) → warning "…จึงไม่มีการเรียกต้นทางในคำขอนี้…" และ **ไม่** ใส่ข้อความ "ต้นทางตอบกลับแต่ไม่มีแถวของวันที่ต้องการ" เพราะไม่มีการเรียกเลย; `availability=empty`, `completeness=unknown`, `dataAsOf=null`
  - มีสินค้าแต่ไม่มีแถว publish ได้ → ข้อความเดิมพร้อมรายชื่อสินค้าที่ล้มเหลวและ failure code ตามสัญญาเดิม
- warning ของสาขา ready ระบุจำนวนจริงตามหมวดที่กรอง: `อ่านต้นทางครบทุกสินค้าที่เลือกในรอบนี้ (n/m รายการ)` / `อ่านต้นทางไม่ครบทุกสินค้าที่เลือกในรอบนี้ (n/m รายการ)` ([route.ts:151](../../../web/app/api/v1/prices/daily/route.ts#L151))
- เอกสาร Query ในหัวไฟล์อธิบายว่า `category` กรองทั้งสองรายการและเรียกเฉพาะสินค้าของหมวดนั้น; `date` ยัง validate ด้วย `parseDate` ก่อนอ่านเสมอ → `400 INVALID_QUERY`

### 3. `web/lib/hub/api-catalog.ts` (เฉพาะ entry `prices-daily`)

- entry เดิมอ้าง "snapshot คงที่ของ OAE และ DIT", `access: 'pending'`, `contract: 'domain'`, `responseType: { data: CommodityPrice[]; meta: { source; asOf; retrievedAt; currency } }` ซึ่งไม่ตรงกับโค้ดจริงเลย
- เขียนใหม่ตามสิ่งที่ route ส่งจริง ([api-catalog.ts:733](../../../web/lib/hub/api-catalog.ts#L733)):
  - `access: 'approved_public'` (ตาม `PRICE_PUBLICATION_APPROVED` + `meta.access` ที่ route ส่ง), `contract: 'hub-v1'`
  - `responseType: ApiResponse<{ source: PriceSourceMetadata; commodities: PriceCommodityMetadata[]; prices: PriceObservation[] }>` — ไม่มี pagination
  - query: `category` (enum, ระบุผลต่อทั้งสองรายการ) และ `date` (type `date`, ใช้ร่วมกับ category ได้, ผิดรูปแบบ → 400)
  - notes 8 ข้อ: grain ต่อแถว, null ไม่เป็น 0, การกรองหมวดกำหนดสินค้าที่เรียกจริง + หมวดไม่ตรงได้ empty โดยไม่เรียกต้นทางและ ไม่อ้าง complete, ขอบเขต limit=100/page=1, ค่า `meta.availability` ที่เป็นไปได้ (`ready`/`empty`/`metadata_only`), error behavior (`400 INVALID_QUERY`, `500 INTERNAL_ERROR` ผ่าน `handleApi`), สิทธิ์ตาม AGENTS.md ข้อ 3 และข้อเท็จจริงว่า resource ราคารายเดือนยัง pending คนละ endpoint
- ไม่แตะ entry `nwp-*`, `weather-*`, `water-reservoirs` หรือ API_GROUPS (ดู "ข้อค้าง")

### 4. `web/tests/price-daily-data.test.ts`

- เพิ่ม helper `installRowsStub(rowsByProduct)` ที่ fake `globalThis.fetch` และ **บันทึก `product_name` ทุกครั้งที่เรียก** ทำให้เห็นว่าตัวกรองใช้จริง;  extend `PriceRouteBody.commodities` เป็นชนิดที่มี `id/category/sourceProductName`
- เทสต์ใหม่ 7 ตัว (ทั้งหมด offline, probe ปิด, ไม่มี network/D1 จริง):
  1. `findUpstreamProducts` mapping — ทุกหมวด/`all`/ค่าว่าง = 6 สินค้า, `ข้าว` = jasmine-rice+white-rice พร้อมตรวจ `commodityId → category`, `unknown` = [], `ปศุสัตว์` = []
  2. `readPriceSnapshot({ products: [] })` — เรียก 0 ครั้ง, observations/probes ว่าง, `complete === false`, `latestDate === null`
  3. `category=ข้าว` ผ่าน route — calls เท่ากับ 2 สินค้าข้าวเท่านั้น, `commodities` = jasmine-rice+white-rice, `prices` 2 แถวเป็นข้าว, แถวยางไม่โผล่, `value: null` ของข้าวเปลือกเจ้าสุพรรณบุรียังเป็น null, `grade/priceType` null, `availability=ready`, `completeness=complete`, `dataAsOf=2026-10-26`
  4. `category=unknown` — HTTP 200, `commodities=[]`, `prices=[]`, `calls=[]`, `availability=empty`, `completeness=unknown`, `dataAsOf=null`, warning อธิบายว่าไม่มีการเรียกต้นทาง, ไม่มีข้อความ "อ่านหน้าต้นทางแล้ว", และ serialized body ไม่มี `"complete"`
  5. `category=ข้าว&date=2026-10-25` — ใช้ร่วมกัน, เรียกเฉพาะสินค้าข้าว, ได้ 1 แถวของวันนั้น (14300, โรงสีเก่า), `dataAsOf=2026-10-25`
  6. `category=ยางพาราและปาล์ม` + upstream ล้มเหลว — calls เท่ากับ 2 สินค้าของหมวดนั้น, `prices=[]` (ไม่ปลอมเป็น 0), `availability=empty`, `completeness=unknown`, warning มี `UPSTREAM_UNAVAILABLE`
  7. `category=unknown&date=2026-02-30` → `400 INVALID_QUERY` (date ยังตรวจก่อนเสมอ)
- ไม่ลบ/skip assertion เดิม; เทสต์เดิม 11 ตัว รวมถึง "no category = 6 calls one bounded request per tracked product" และ "missing stays null" ยังผ่าน unchanged

## จำนวน fake upstream calls ต่อ category (หลักฐานว่ากรองจริง)

วัดจาก `findUpstreamProducts` + stub ในเทสต์ (1 call = 1 request ต่อ 1 `product_name`, limit=100&page=1):

| category | commodities ใน response | upstream calls | ชื่อสินค้าที่เรียก |
|---|---|---|---|
| (ไม่ระบุ) | 6 | 6 | ข้าวหอมมะลิ 105, ข้าวสุพรรณบุรี 15%, ยางแผ่นดิบ ชั้น 3, ปาล์มทั้งทะลาย คละ, มันสด 25%, ข้าวโพด 14.5% |
| `all` | 6 | 6 | เหมือนไม่ระบุ |
| `` (ค่าว่าง) | 6 | 6 | เหมือนไม่ระบุ (route แปลงเป็น undefined) |
| `ข้าว` | 2 | 2 | ข้าวเปลือกเจ้าหอมมะลิ 105, ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15% |
| `ยางพาราและปาล์ม` | 2 | 2 | ยางพาราแผ่นดิบ ชั้น 3, ผลปาล์มน้ำมันทั้งทะลาย คละ |
| `พืชไร่` | 2 | 2 | หัวมันสำปะหลังสด (แป้ง 25%), ข้าวโพดเลี้ยงสัตว์ ความชื้น 14.5% |
| `ปศุสัตว์` | 0 | **0** | — (หมวดมีใน type แต่ไม่มีสินค้าที่ติดตาม) |
| `unknown` | 0 | **0** | — |

## ตัวอย่าง response shape (จาก stub ในเทสต์ ไม่ใช่ตัวเลขต้นทางจริง)

`GET /api/v1/prices/daily?category=ข้าว` → 200, calls = 2

```json
{
  "data": {
    "source": { "sourceId": "oae-nabc-prices", "licenseStatus": "approved_public", "access": "approved_public", "publicationApproved": true, "grain": "market × commodity(grade) × province × day", "endpointUrl": "https://agriapi.nabc.go.th/api/daily-prices/product", "limitations": ["…"] },
    "commodities": [
      { "id": "jasmine-rice", "name": "ข้าวเปลือกเจ้าหอมมะลิ 105", "category": "ข้าว", "unit": "บาท/ตัน", "sourceProductName": "ข้าวเปลือกเจ้าหอมมะลิ 105", "access": "approved_public" },
      { "id": "white-rice", "name": "ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%", "category": "ข้าว", "unit": "บาท/ตัน", "sourceProductName": "ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%", "access": "approved_public" }
    ],
    "prices": [
      { "product": "ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%", "productCategory": "ข้าว", "grade": null, "gradeStatus": "not_published_by_source", "priceType": null, "priceTypeStatus": "not_published_by_source", "market": "โรงสีสุพรรณบุรี", "province": "สุพรรณบุรี", "periodStart": "2026-10-26", "periodLabel": "2026-10-26", "value": null, "unit": "บาท/ตัน", "unitStatus": "declared_by_source", "grain": "market × commodity(grade) × province × day", "dataKind": "observed", "sourceUrl": "https://agriapi.nabc.go.th/api/daily-prices/product?product_name=…&limit=100&page=1", "retrievedAt": "2026-10-27T07:57:47.817Z" },
      { "product": "ข้าวเปลือกเจ้าหอมมะลิ 105", "value": 14400, "unit": "บาท/ตัน", "market": "โรงสีกิจทวียโสธร", "province": "ยโสธร", "periodStart": "2026-10-26", "grade": null, "priceType": null }
    ]
  },
  "meta": {
    "availability": "ready", "freshness": "unknown", "completeness": "complete", "access": "approved_public",
    "sourceIds": ["oae", "nabc"], "dataAsOf": "2026-10-26", "sourceUpdatedAt": null, "datasetVersion": null,
    "warnings": [
      "ค่าที่เผยแพร่มาจากต้นทางโดยตรง แยกตามสินค้า/เกรด ตลาด จังหวัด วัน และหน่วย — ห้ามนำไปรวมกับสินค้า เกรด หน่วย หรือตลาดอื่น",
      "ต้นทางไม่ประกาศประเภทราคา (หน้าสวน/ตลาดกลาง) และไม่ประกาศคอลัมน์เกรดแยก ฟิลด์ priceType และ grade จึงเป็น null",
      "ต้นทางไม่ระบุเวลาอัปเดตหรือเกณฑ์ความสดของข้อมูล จึงยังยืนยัน freshness ไม่ได้",
      "อ่านต้นทางครบทุกสินค้าที่เลือกในรอบนี้ (2/2 รายการ)"
    ],
    "runtimeMode": "source_api_fallback"
  }
}
```

`GET /api/v1/prices/daily?category=unknown` → 200, calls = 0

```json
{
  "data": { "source": { "sourceId": "oae-nabc-prices" }, "commodities": [], "prices": [] },
  "meta": {
    "availability": "empty", "completeness": "unknown", "access": "approved_public",
    "dataAsOf": null, "sourceUpdatedAt": null, "datasetVersion": null,
    "warnings": ["…6 คำเตือนเดิม…", "หมวดที่เลือกไม่มีสินค้าที่ติดตามจากต้นทางใน endpoint นี้ จึงไม่มีการเรียกต้นทางในคำขอนี้ — ข้อมูลว่างหมายถึงไม่มีสินค้าในหมวดนั้น ไม่ใช่ราคา 0 และไม่ใช่หลักฐานว่าอ่านครบทุกสินค้า"],
    "runtimeMode": "source_api_fallback"
  }
}
```

`?category=unknown&date=2026-10-25` → shape เดียวกัน (empty) พร้อม `date` ที่ยัง validate; `?category=unknown&date=2026-02-30` → `400 {"error":{"code":"INVALID_QUERY", …}}`

## API/type behavior ที่เปลี่ยน

- `GET /api/v1/prices/daily?category=<อะไรก็ได้ที่ไม่ใช่ 3 หมวดแรก>`: เดิมคืน `commodities=[]` แต่ `prices` ของทุกสินค้า (audit วัดจริง 20 แถว/6 สินค้า) พร้อม `completeness=complete` — ตอนนี้คืน `prices=[]`, `availability=empty`, `completeness=unknown`, `dataAsOf=null` และไม่เรียกต้นทางเลย (HTTP status ยัง 200 ตามสัญญาเดิม)
- `?category=ข้าว|ยางพาราและปาล์ม|พืชไร่`: `prices` มีเฉพาะแถวของสินค้าในหมวดนั้น และ request ต่อต้นทางมีเท่าจำนวนสินค้าของหมวด (2 ครั้ง) แทน 6 ครั้ง
- ไม่มีคำขอ: ไม่เปลี่ยน `prices` shape ของแถวรายตัว, ไม่เปลี่ยน null/unit/grade/priceType/provenance, ไม่เปลี่ยน pagination (ยังไม่มี), ไม่เปลี่ยน route อื่น
- Export ใหม่ใน repository: `findUpstreamProducts(category?)`; semantics ของ `PriceSnapshot.complete` แคบลง (ต้องมีการเรียกอย่างน้อย 1 สินค้า) — ไม่มี caller อื่นที่ใช้ `complete` นอกจาก route นี้
- Catalog: `prices-daily` เปลี่ยนจาก `pending`/`domain` เป็น `approved_public`/`hub-v1` พร้อม `responseType` ของอ็อบเจกต์จริง — หน้า developer portal/playground อ่านจาก entry นี้จึงแสดง contract ที่ตรงกับโค้ด

## คำสั่งที่รันจริง (จากโฟลเดอร์ `web`)

```
node --experimental-strip-types --test tests/price-daily-data.test.ts
→ tests 18, pass 18, fail 0 (เดิม 11 + ใหม่ 7)

node --experimental-strip-types --test tests/api-catalog.test.ts tests/governance-containment.test.ts
→ tests 16, pass 16, fail 0 (governance still asserts: upstream ล้มเหลว → prices=[], availability=empty, completeness=unknown, route ไม่มี `fetch(` และไม่มี cache public)

node_modules/.bin/tsc.cmd --noEmit --incremental false
→ 4 errorLines ทั้งหมดอยู่ใน `.next/types/validator.ts` (ไฟล์ generated: vinext เขียน `routes.d.ts` แต่ validator ของ Next ยัง import `AppRoutes/LayoutRoutes/ParamMap/AppRouteHandlerRoutes` ที่ไม่มีในไฟล์นั้น) — เป็นของค้างเดิมของ tooling ตาม audit ข้อ 8/lint ไม่ใช่ regression จาก lane นี้ และมี 0 error ในไฟล์ source
```

ไม่รัน full suite, `next typegen`, dev server, build, prepare-data, npm install หรือ lint ทั้ง repo ตามกติกาข้อน 9; ไม่ได้เรียก API NABC จริงในระหว่างงานนี้

## ข้อค้าง / สิ่งที่ไม่ได้ทำใน lane นี้

- `API_GROUPS` ของ prices ยังเขียนว่า "ราคาสินค้าเกษตรรายวันจาก snapshot คงที่ของ OAE และ DIT" ([api-catalog.ts:60](../../../web/lib/hub/api-catalog.ts#L60)) — เป็น record คนละตัวกับ entry ที่ได้รับ allowlist จึงไม่ได้แก้ ผู้รวมงานควรเปลี่ยนเป็น "ราคาอ่านสดจาก NABC daily-prices (OAE) รายสินค้า × ตลาด × จังหวัด × วัน × หน่วย"
- หน้า `/prices` ([web/app/prices/page.tsx:17](../../../web/app/prices/page.tsx#L17)) ยังเรียก `readPriceSnapshot()` โดยไม่กรอง (ทุกหมวด) และ filter บน dashboard เป็น client-side — ไม่กระทบ correctness ของ API แต่ไม่ได้ตรวจ browser flow ใน lane นี้ (กติกาข้อ 9 ห้ามรัน dev server)
- `category` ที่สะกดต่างจากหมวดเล็กน้อย (เช่น "ข้าวสาร", "ข้าว " ที่มีช่องว่าง) คืน empty ตามกติกา ไม่ fuzzy-match และตอบ 400 — ตรงกับ contract ที่เอกสารไว้; หากต้องการ alias ต้องเป็นการตัดสินใจระดับโครงการ
- `meta.sourceIds` ยังเป็น `['oae','nabc']` ตามเดิม ไม่ได้เพิ่ม/ลดทะเบียนสิทธิ์ (ไฟล์ registry เป็นของผู้รวมงาน)
- ยังไม่ได้ตรวจ live: ผล audit ข้อ 7 อ้าง response จริง `?category=unknown` ที่ได้ 20 แถว — หลักฐานใน lane นี้เป็น fake upstream ทั้งหมด ผู้รวมงานควรยืนยัน 1 ครั้งด้วย call จริงหลังรวมงานเสร็จ (คาดการณ์: `unknown` → 0 calls/`prices=[]`, `ข้าว` → 2 calls)
- `npm run lint` ทั้ง repo ยังแดงอยู่เดิม (audit ข้อ 8) และไม่อยู่ในขอบเขต lane 4; ไฟล์ที่แก้ไม่เพิ่ม pattern `any`/non-null assertion ใหม่
- ข้อสังเกตของไฟล์เดิม (ไม่ได้แก้): [price-repository.ts:240](../../../web/lib/hub/price-repository.ts#L240) ใช้ `join('\0')` เพื่อสร้าง dedup key — มี NUL byte จริงใน source ตั้งแต่ละ commit `14026f0` ทำให้ grep/บางเครื่องมืออ่านไฟล์เป็น binary พฤติกรรม dedup ยังถูกต้อง (ยืนยันด้วยเทสต์ "a repeated market identity is dropped") แต่ผู้รวมงานอาจเปลี่ยนเป็น escape literal `'\u0000' เพื่อให้ไฟล์เป็นข้อความล้วน
