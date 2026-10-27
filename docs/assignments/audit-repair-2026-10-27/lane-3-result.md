# Lane 3 result — Early-warning correctness (audit items 3, 5, 6)

วันที่: 2026-10-27
เจ้าของ: lane 3 (early-warning calculations + UI ที่ใช้ผลนั้น)
ฐานงาน: working tree ปัจจุบันของ `T:\coding+\BI AGRI THAILAND` (HEAD `14026f0` + งาน uncommitted ของเจ้าของเดิม) ไม่ได้ checkout/reset/commit/push/deploy และไม่ได้เขียน D1

## สรุปสิ่งที่แก้

### ข้อ 3 — หน่วย TMD ที่ยังไม่ยืนยัน

- เพิ่ม guard `hasConfirmedUnit()` ใน [early-warning-data.ts](../../../web/lib/hub/early-warning-data.ts#L1493) ใช้กติกาเดียวกับ `isNwpUnitConfirmed`: เฉพาะ `confirmed` หรือ `confirmed_*` (เช่น `confirmed_by_tmd`) เท่านั้นที่ถือว่ายืนยันหน่วย; `pending_official_confirmation`, ค่าว่าง หรือค่าอื่น = ยังไม่ยืนยัน
- [buildWeatherAlerts](../../../web/lib/hub/early-warning-data.ts#L1722) ไม่สร้าง alert ฝน/ร้อนจากสถานีที่หน่วยยังไม่ยืนยัน — ไม่มีการเทียบ mm/°C และไม่มีการเดาหน่วย
- [buildEvidenceSummary](../../../web/lib/hub/early-warning-data.ts#L2042) คำนวณค่าเฉลี่ย/สูงสุดฝนจากสถานีที่ยืนยันหน่วยเท่านั้น; ถ้ามีแต่สถานี pending จะคืน `null` และ `rainfallBasis` อธิบายว่า "หน่วยยังไม่ได้รับการยืนยัน … ยังไม่ทราบ ไม่ใช่ 0 มม."
- [buildEvidenceProvinces](../../../web/lib/hub/early-warning-data.ts#L1885) ใช้ค่าฝนรายสถานีที่ยืนยันหน่วยเท่านั้น (สูงสุดของ station × day ไม่ใช่ค่าเฉลี่ยจังหวัด) และถ้ามีแต่ค่าดิบ pending จะได้ `rainfall7dMm = null` พร้อม basis ที่ระบุเหตุผล
- การเผยแพร่ค่าดิบของสถานีไม่ได้ถูกแก้: `/api/v1/weather/observations` และ `weather-observations-data.ts` ยังคงเผยแพร่ raw value + `unitStatus` ตามสัญญาเดิม การกันนี้อยู่เฉพาะการตีความเป็น mm/°C เพื่อคำนวณเกณฑ์

### ข้อ 5 — heat severity ใน overallRisk/urgency

- [buildEvidenceProvinces](../../../web/lib/hub/early-warning-data.ts#L1942) คำนวณ `heatRiskScore`/`heatRiskLevel` จาก heat signals และรวมเข้า `overallRisk`; `urgency` ยัง derive จาก `overallRisk` จึงเป็น `urgent` เมื่อ heat critical
- `heatRiskScore`/`heatRiskLevel` ถูกใส่ในแถวจังหวัดเพื่อแสดงแยก (ไม่ยัดเป็น flood/drought) และเป็น `null` เมื่อไม่มี heat signal — ไม่ปลอม "heat ปกติ" ทั้งที่ไม่มีหลักฐาน
- Sort ลำดับจังหวัดใช้คะแนนสูงสุดของ flood/heat/drought เป็นตัวรองจาก `overallRisk`
- [early-warning-dashboard.tsx](../../../web/components/early-warning-dashboard.tsx#L949) แสดงป้าย "ร้อนจัด: <ระดับ> (<score>/100)" ในคอลัมน์ที่มาของหลักฐาน
- จังหวัดที่ไม่มีหลักฐานไม่ถูกเพิ่ม: รายชื่อจังหวัดยังสร้างจาก `provinceCode` ของ alert เท่านั้น (สถานี pending จึงไม่ทำให้เกิดจังหวัด)

### ข้อ 6 — null/unknown ของฝนและภัยแล้ง

- `EarlyWarningSummary.avgRainfall7dMm` และ `maxRainfall7dMm` เปลี่ยนเป็น `number | null`; ไม่มีสถานีที่ยืนยันหน่วย = `null` ไม่ใช่ `0`
- `ProvinceRiskItem.droughtRiskScore` และ `droughtRiskLevel` เปลี่ยนเป็น nullable; ไม่มี RID regional drought context = `null` (ไม่ทราบ) ไม่ใช่ `0`/`normal`
- `ProvinceRiskItem.rainfall7dMm` ยัง nullable และตอนนี้ใช้ค่าสูงสุดของสถานีที่ยืนยันหน่วยในจังหวัด (รวมค่าที่วัดได้ 0) ไม่ใช่เฉพาะค่าที่ผ่านเกณฑ์ฝนหนัก
- Dashboard:
  - KPI ฝนแสดง "ไม่ทราบ" และไม่แสดงหน่วย `มม.` เมื่อค่าเป็น null, footer แสดง basis แทน "สูงสุด 0 มม."
  - ช่องดัชนีภัยแล้งแสดง "ยังไม่มีข้อมูลภัยแล้ง / ไม่ทราบ" โดยไม่เรนเดอร์ 0/NaN และไม่มี meter bar; มี tooltip เป็น `droughtBasis`
  - ช่องฝนแสดง "ยังไม่มีข้อมูล" แทน `—`/0 พร้อม tooltip เป็น `rainfallBasis`
- Filters/counts: `filterProvinceRisks(type=drought)` และ dashboard filter ไม่ถือ row ที่ `droughtRiskLevel=null` เป็น warning/critical; `normalProvincesCount` ยังนับเฉพาะ `overallRisk=normal` ที่มีหลักฐานรองรับ (ไม่มี row ที่ overall เป็น unknown)

### สิ่งที่ไม่ได้เปลี่ยน

- ไม่แตะ simulation envelope, `PROVINCIAL_RISK_DATA`, `SIMULATION_FORECAST_14_DAYS`, ป้าย `Simulation` หรือ layer governance — forecast สังเคราะห์ยังเป็น modelled/simulated ตามเดิม
- ไม่แตะ shared hub types/schema, `weather-observations-data.ts`, route handler (`web/app/api/v1/early-warning/route.ts` ไม่มี diff) หรือไฟล์ของ lane อื่น
- `web/tests/governance-containment.test.ts` ไม่ได้แก้ใน lane นี้ (มี diff 31/8 อยู่ก่อนเริ่มงาน) และยังผ่านทั้งหมด

## Field ที่กลายเป็น nullable / status ที่ใช้จริง

| Field | เดิม | ใหม่ | ความหมาย |
|---|---|---|---|
| `EarlyWarningSummary.avgRainfall7dMm` | `number` (0 เมื่อไม่มีข้อมูล) | `number \| null` | null = ยังไม่มีสถานีที่ยืนยันหน่วยรายงานฝน |
| `EarlyWarningSummary.maxRainfall7dMm` | `number` (0 เมื่อไม่มีข้อมูล) | `number \| null` | เช่นเดียวกัน |
| `ProvinceRiskItem.droughtRiskScore` | `number` (0 เมื่อไม่มี context) | `number \| null` | null = ไม่มี input ระดับจังหวัด/ภูมิภาค |
| `ProvinceRiskItem.droughtRiskLevel` | `DisasterAlertLevel` | `DisasterAlertLevel \| null` | null = ไม่ทราบ |
| `ProvinceRiskItem.heatRiskScore` | ไม่มี | `number \| null` (optional) | null/ไม่ใส่ = ไม่มี heat signal |
| `ProvinceRiskItem.heatRiskLevel` | ไม่มี | `DisasterAlertLevel \| null` (optional) | null/ไม่ใส่ = ไม่มี heat signal |

สถานะหน่วยที่ใช้ตัดสิน:

- ยืนยัน: `confirmed`, `confirmed_*` (ทดสอบด้วย `confirmed_by_tmd`)
- ไม่ยืนยัน: `pending_official_confirmation` และค่าอื่นทั้งหมด

## Edge cases ที่ทดสอบ

1. station pending ฝน 120 มม. + อุณหภูมิ 45 °C → ไม่มี TMD alert, ไม่มีจังหวัด, summary ฝนเป็น `null`
2. station pending 120 + confirmed 10 → summary เฉลี่ย/สูงสุด = 10 (ไม่เอา 120)
3. pending ฝน 120 + GISTDA polygon → จังหวัดยังเกิดจาก polygon, `rainfall7dMm=null`, basis ระบุหน่วย pending
4. confirmed ฝน 120 + อุณหภูมิ 45 → rain alert critical, heat alert critical, summary 120/120
5. confirmed heat 45 อย่างเดียว → heat alert critical, province `overallRisk=critical`, `urgency=urgent`, drought/rain unknown, ไม่เพิ่มจังหวัดอื่น
6. ไม่มี weather rows + GISTDA polygon → summary ฝน `null`, drought `null`, heat `null`, type=drought filter ไม่ผ่าน
7. confirmed ฝน 0 + GISTDA polygon → `rainfall7dMm=0`, summary avg/max = 0 (measured zero ไม่ถูกแปลงเป็น null)
8. ไม่มี drought input → `droughtRiskScore/droughtRiskLevel = null`, ไม่นับเป็น normal

## ผลคำสั่งที่รันจริง (จากโฟลเดอร์ `web`)

```text
node --experimental-strip-types --test tests/early-warning-regression.test.ts tests/governance-containment.test.ts
# tests 16, pass 16, fail 0 (lane-3 ใหม่ 8 + governance เดิม 8)

node_modules/.bin/tsc.cmd --noEmit --incremental false
# exit 2 — 4 errors ทั้งหมดอยู่ใน .next/types/validator.ts (generated):
# TS2305 Module './routes.js' has no exported member 'AppRoutes' / 'LayoutRoutes' / 'ParamMap' / 'AppRouteHandlerRoutes'
```

สาเหตุ tsc: `.next/types/routes.d.ts` เป็นไฟล์ที่ vinext generate (namespace `VinextRouteTypes`) ขณะที่ `.next/types/validator.ts` เป็นไฟล์ที่ Next generate และ import named exports จาก `./routes.js`; artifact ทั้งคู่ถูกสร้างไว้ก่อน lane นี้ (mtime 13:03) และกติกากลางห้ามแก้ `.next`/ห้ามรัน `next typegen` ระหว่างงานขนาน ผมจึงไม่แตะไฟล์ generated

เพื่อยืนยัน type ของ source จริงใน lane นี้ รัน tsc ด้วย config ชั่วคราวใน `.tmp_qa/audit-repair-lane-3/tsconfig.lane3.json` (extends `web/tsconfig.json`, exclude `web/.next`, `web/node_modules`, `web/dist`):

```text
web/node_modules/.bin/tsc.cmd -p .tmp_qa/audit-repair-lane-3/tsconfig.lane3.json --noEmit --incremental false
# exit 0, ไม่มี output
```

Log ที่เก็บไว้: `.tmp_qa/audit-repair-lane-3/{tests,tsc-exact,tsc-source}.log` และ snapshot ไฟล์ตั้งต้น `*.orig` + `initial-diff.patch`

## สิ่งที่ยังไม่ตรวจ / ต้องให้ผู้รวมงานทำต่อ

1. รัน `next typegen` + `tsc --noEmit` + build ใหม่หลังทุก lane หยุดแก้ เพื่อล้าง conflict ของ `.next/types` ที่มาก่อน lane นี้; ผมยืนยันเฉพาะ source typecheck แบบ exclude generated
2. Browser check desktop/mobile ของ `/early-warning` ใน real-evidence mode: KPI ฝน "ไม่ทราบ", drought meter "ไม่ทราบ", heat badge, ไม่มี NaN/0 ปลอม (lane นี้ไม่มี D1/network ตามกติกา จึงไม่ได้เปิด browser กับข้อมูลจริง)
3. ตรวจ API consumer ที่อ่าน `summary.avgRainfall7dMm`, `summary.maxRainfall7dMm`, `provinces[].droughtRiskScore`, `provinces[].droughtRiskLevel` — ตอนนี้เป็น `null` ได้ (route ยังส่ง shape เดิม ไม่เปลี่ยน status code)
4. ใน D1 จริงของรอบตรวจ สถานี TMD ทั้งหมดยัง `pending_official_confirmation`; หลัง fix นี้ KPI ฝนของ real-evidence จะเป็น `null` จนกว่าหน่วยจะยืนยัน — เป็นพฤติกรรมที่ตั้งใจและตรงกับ audit ไม่ใช่ข้อมูลหาย
5. ยังไม่มีตัวกรอง `heat` ใน `RiskType` (มีเฉพาะ flood/drought/all) — heat signal แสดงในรายการสัญญาณและป้ายจังหวัด แต่การกรอง type=flood/drought จะไม่รวมจังหวัดที่มีเฉพาะ heat; เป็นพฤติกรรมเดิมที่ lane นี้ไม่ขยาย scope
6. จังหวัดที่มีเฉพาะ heat จะยังมี `floodRiskScore=0`/`floodRiskLevel=normal` เพราะไม่มีชั้นน้ำท่วมที่วัดได้; `overallRisk` ถูกยกด้วย heat แล้ว แต่ถ้าต้องการให้ flood เป็น unknown ด้วยต้องเปลี่ยน type/UI เพิ่มเติมนอกขอบเขต audit ข้อนี้
