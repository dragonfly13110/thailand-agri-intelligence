# AI-1 — Data Governance Containment: รายงานส่งงาน

วันที่: 25 ตุลาคม 2569
เจ้าของ lane: AI-1 (Data Governance Containment)
Workspace: `D:\code\thailand-agri-intelligence`

## 0. หมายเหตุการทำงานและ sub-agents

Session นี้ไม่มี Agent tool ในชุดเครื่องมือที่ใช้งานได้ จึง **ไม่ได้ spawn sub-agent จริง** ตามคำสั่งงานที่ให้ fallback ไว้ AI-1 ดำเนินการเองครบ 5 บทบาทแบบลำดับ:

1. 1A Exposure Auditor
2. 1B Water & Early-warning Containment
3. 1C Prices Containment
4. 1D Weather-engine Gate
5. 1E Governance Tests

ไม่มี worktree, ไม่มี branch ใหม่ และทำงานใน working tree เดียวกันตลอด

## 1. ภารกิจและผลลัพธ์

เป้าหมาย: หยุดเผยแพร่ตัวเลขจาก resource ที่ licence ยัง `pending` ผ่าน HTML, props, public API และ cache โดยไม่ทำลายเส้นทาง CHIRPS ที่อนุมัติแล้ว

ผลลัพธ์:

- `/water` และ `/api/v1/water/reservoirs` ไม่มีปริมาณน้ำ ความจุ เปอร์เซ็นต์ หรือจำนวนอ่างจริงอีกต่อไป; ตอบ `metadata_only` / `unknown` / `no-store`
- `/prices` และ `/api/v1/prices/daily` ไม่มีราคา เปลี่ยนแปลง หรือประวัติราคา; เหลือ metadata สินค้า/หน่วย/ตลาด
- `/early-warning` และ API เปลี่ยนเป็น deterministic simulation ล้วน ไม่ import `RESERVOIRS` และไม่มีข้อความ "สถิติจริงจาก 461 อ่าง"
- `/api/v1/weather-engine` ตอบ 503 `SOURCE_UNAVAILABLE` พร้อมข้อความสิทธิ์และ `no-store`; ไม่เรียก Open-Meteo และไม่ตอบ `approved_public`/`complete`
- หน้าแรกเหลือการ์ดสถานะ metadata-only และไม่มี KPI น้ำ/ราคา/จำนวนชุดข้อมูล hardcode
- ทะเบียนสิทธิ์เอกสารแก้เป็น 82 รายการ / 81 pending / 1 approved_public พร้อมวันที่และคำสั่งตรวจนับ
- เพิ่ม governance regression test 6 เคส
- Audit ทุกหน้า (25 ไฟล์) และทุก API route (23 ไฟล์) พร้อมระบุความเสี่ยง cross-lane

## 2. ไฟล์ที่แก้ไข/สร้าง

Absolute paths:

### แก้ไข

- `D:\code\thailand-agri-intelligence\web\lib\hub\water-data.ts`
- `D:\code\thailand-agri-intelligence\web\lib\hub\price-data.ts`
- `D:\code\thailand-agri-intelligence\web\lib\hub\early-warning-data.ts`
- `D:\code\thailand-agri-intelligence\web\lib\hub\open-meteo-client.ts` (เพิ่ม governance gate comment; ไม่เปลี่ยนพฤติกรรม)
- `D:\code\thailand-agri-intelligence\web\app\api\v1\water\reservoirs\route.ts`
- `D:\code\thailand-agri-intelligence\web\app\api\v1\prices\daily\route.ts`
- `D:\code\thailand-agri-intelligence\web\app\api\v1\early-warning\route.ts`
- `D:\code\thailand-agri-intelligence\web\app\api\v1\weather-engine\route.ts`
- `D:\code\thailand-agri-intelligence\web\app\page.tsx`
- `D:\code\thailand-agri-intelligence\web\app\water\page.tsx`
- `D:\code\thailand-agri-intelligence\web\app\prices\page.tsx`
- `D:\code\thailand-agri-intelligence\web\app\early-warning\page.tsx` (เพิ่ม `dynamic = 'force-dynamic'`)
- `D:\code\thailand-agri-intelligence\web\components\water-dashboard.tsx`
- `D:\code\thailand-agri-intelligence\web\components\price-dashboard.tsx`
- `D:\code\thailand-agri-intelligence\web\components\early-warning-dashboard.tsx`
- `D:\code\thailand-agri-intelligence\docs\source-license-register.md`

### สร้าง

- `D:\code\thailand-agri-intelligence\web\tests\governance-containment.test.ts`
- `D:\code\thailand-agri-intelligence\docs\governance\public-data-exposure-audit.md`
- `D:\code\thailand-agri-intelligence\docs\lanes\ai-1-governance.md` (ไฟล์นี้)

### ตรวจแล้วไม่แก้ในรอบนี้

- `D:\code\thailand-agri-intelligence\config\resource_licenses.json` — มี 82 entries / 81 pending / 1 approved_public และ `reviewed_at` 2026-10-25 อยู่แล้ว ไม่เปลี่ยนสถานะใด

## 3. ก่อน/หลังโดยย่อ

| จุด | ก่อน | หลัง |
|---|---|---|
| `/water` | snapshot อ่างจริง 461 แถว + KPI/กราฟ | metadata + limitations/warnings, `reservoirs: []`, `summary: null` |
| `/api/v1/water/reservoirs` | `summary` + `data` จาก snapshot, ไม่มี governance flag | `metadata_only`/`unknown`, `no-store`, `pagination.total: 0` |
| `/prices` | ราคา/เปลี่ยนแปลง/กราฟ OAE | metadata สินค้า/หน่วย/ตลาดเท่านั้น |
| `/api/v1/prices/daily` | `CommodityPrice[]` | `{source, commodities, prices: []}`, `metadata_only`/`unknown`, `no-store` |
| `/early-warning` | import `RESERVOIRS`, อ้างสถิติจริง 461 อ่าง | deterministic simulation, `sim-rsv-*`, banner simulation, force-dynamic |
| `/api/v1/early-warning` | ตัวเลข RID | `sample: true`, `metadata_only`/`unknown`, warnings, `no-store` |
| `/api/v1/weather-engine` | เรียก Open-Meteo สด, `approved_public`/`complete` | 503 `SOURCE_UNAVAILABLE`, ข้อความสิทธิ์, `no-store`, ไม่ fetch |
| `/` | KPI น้ำ/ราคา และตัวเลข hardcode | การ์ดสถานะ metadata-only, ไม่มีตัวเลขน้ำ/ราคา |
| `docs/source-license-register.md` | 72/71/70 | 82/81/1 พร้อมวันที่และคำสั่ง |

## 4. Governance tests

ไฟล์ `web/tests/governance-containment.test.ts` ใช้ pattern เดียวกับ `hub-data-domains.test.ts` (`registerHooks` + `stripTypeScriptTypes`, stub `server-only`) ครอบคลุม:

1. water route: 200, envelope, `metadata_only`/`unknown`, warnings, no-store, `reservoirs: []`, `summary: null`, ไม่มี key ตัวเลข (capacity/volume/percent/inflow/outflow) และไม่มี sentinel `461`, `rsv01`, `ห้วยแม่ออน`, `100.18`, `73.51`
2. prices route: 200, `prices: []`, commodity ทั้งหมด pending/metadata_only, ไม่มี key price/change/history, sentinel ราคาเดิมไม่ปรากฏ
3. early-warning: `sample: true`, simulation banner/disclaimer, meta ถูกต้อง, total = จำนวน simulation, id `sim-rsv-*`, ชื่อขึ้นต้น "อ่างเก็บน้ำจำลอง", deterministic ระหว่างสอง call
4. weather-engine: 503, `SOURCE_UNAVAILABLE`, requestId, no-store, ข้อความ pending, ไม่มี `approved_public`/`complete`/`ready`, global fetch ไม่ถูกเรียก
5. source guards: route ไม่มี public cache directive, water/prices ไม่ fetch, weather-engine ไม่ import `open-meteo-client`, early-warning ไม่ import water-data/Math.random, home ไม่มี identifier/ตัวเลขที่ถอดออก, early-warning page เป็น force-dynamic
6. licence register: registry 82/81/1 และ doc สอดคล้อง

## 5. คำสั่งที่รันและผล

| คำสั่ง | Exit code | ผล |
|---|---:|---|
| `cd web && node --experimental-strip-types --test tests/governance-containment.test.ts` | 0 | 6 tests, 6 pass, 0 fail |
| `npm --prefix web run test` | 0 | 48 tests, 48 pass, 0 fail (42 เดิม + 6 ใหม่) |
| `npm --prefix web run typecheck` | 0 | `next typegen` + `tsc --noEmit` ผ่าน ไม่มี error |
| `npm --prefix web run build:vinext` | 0 | `vite build` เสร็จ "Build complete."; มี warning `SOURCEMAP_BROKEN` และ route classification `?` ที่มีอยู่เดิม ไม่ใช่ error |
| `python -c "...resource_licenses.json..."` | 0 | 82 total, `{'pending': 81, 'approved_public': 1}`, reviewed_at 2026-10-25 |

ไม่ได้รัน Python test suite ของ repo เพราะไม่มีการแก้โค้ด Python ใน lane นี้

## 6. สิ่งที่ยังไม่ยืนยัน / ข้อจำกัด

- Governance tests เรียก route handler ด้วย `Request` ใน Node ไม่ได้เปิด browser หรือ CDN จริง จึงไม่ยืนยัน header/HTML ที่ผู้ใช้เห็นจริงบน preview
- ไม่ได้รัน `npm --prefix web run lint`
- ไม่ได้ตรวจ `data/local/` หรือ `exports/private/` ตามข้อห้าม
- ไม่ได้ทดสอบ `/areas/[provinceCode]` และ `/areas/compare` แบบ browser; วิเคราะห์จาก source ว่า water panel จะ fail-closed
- สถานะ licence อ้างอิง registry ณ 2026-10-25 โดยไม่ได้เรียก upstream ใหม่
- Working tree มีการแก้ไข/ไฟล์ untracked อื่นอยู่ก่อนแล้ว (รวม `config/resource_licenses.json`, `HANDOFF.md`, `docs/progress.md`) รายงานนี้ไม่ถือว่าเป็นงานของ AI-1 และไม่ได้ commit สิ่งใด

## 7. ความเสี่ยงและ owner decisions

### ต้องให้ AI-2 แก้ (P0)

1. `web/components/shell.tsx:48` ยังมี `สถานการณ์ 461 อ่างเก็บน้ำ` และ render ทุกหน้า ทำให้จำนวนอ่างจริงยังอยู่ใน HTML แม้เนื้อหาหน้า AI-1 จะสะอาดแล้ว
2. `web/components/province-agri-overview.tsx` และ `web/components/province-compare.tsx` ใช้ water contract เก่า (`summary.regionSummaries`, `riskCounts`, `verifiedGrain`) และ province overview ยังมีข้อความ 461 ที่บรรทัด 468/470; เมื่อ API ใหม่คืน `summary: null` panel น้ำจะ error (fail-closed ไม่มีตัวเลข)
3. `web/lib/hub/api-catalog.ts` ยังอธิบาย response shape เก่าของ water/prices และไม่ครบทุก route
4. `web/lib/hub/crops-soil-data.ts` + `/crops` เผยแพร่สถิติ OAE จริง (พื้นที่/ผลผลิต/ผลผลิตเฉลี่ย) ขณะ licence pending และ API ประกาศ `metadata_only` — ถือเป็น exposure นอก lane ที่ต้องตัดสินใจและแก้
5. sample routes ของ AI-2 หลายตัวตอบ `completeness: complete` ขณะ `access: metadata_only` ควรทบทวนความหมาย

### ต้องให้ AI-3/AI-2 แก้เอกสาร

- `HANDOFF.md:162` — 72/71 (ห้าม AI-1 แตะ)
- `SYSTEM_DESIGN.md:129` — 72/71
- `IMPLEMENTATION_PLAN.md:24`, `:73` — 72/71
- `docs/decisions/0002-source-backed-web-data.md:40` — "71 รายการ"
- `docs/archive/2026-10-24-redesign/HANDOFF.md:72` — historical archive

### Owner decision ที่ต้องขอ

- จะเปิดตัวเลข RID/OAE เมื่อใด: ต้องมีหลักฐานสิทธิ์ + active approved batch + M4/M5 ครบ ไม่ใช่แค่แก้ flag
- จะทำ backward-compatible water response ให้ `/areas` หรือให้ AI-2 เปลี่ยน consumer เป็น contract ใหม่ (แนะนำอย่างหลัง)
- จะเก็บ `/crops` สถิติจริงไว้หรือเปลี่ยนเป็น sample/metadata-only จนกว่าสิทธิ์ OAE/DOAE จะชัด

## 8. สิ่งที่ไม่ได้ทำตามข้อห้าม

ไม่ได้ commit, push, deploy, ลบไฟล์, แก้ `.env`, พิมพ์ token/secret, หรืออ่าน/คัดลอก `data/local/`/`exports/private/` และไม่ได้แก้ไฟล์ต้องห้าม (`shell.tsx`, `data_contracts/hub-api.schema.json`, `api-catalog.ts`, `api-catalog.test.ts`, `.github/workflows/*`, `HANDOFF.md`, `docs/progress.md`, `docs/README.md`, หน้า AI-2)
