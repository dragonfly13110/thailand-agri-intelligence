# Lane 5 — หน้าสถานะแหล่งข้อมูล `/data-status` (AI ตัวที่ 5, 27 ต.ค. 2569)

สถานะสรุป: **implemented + locally tested** · **ยังไม่ live verified** · **ยังไม่ deploy**
ไม่รัน dev server / build / full suite / `next typegen` / prepare-data / npm install ตามกติกาข้อ 9 เพราะ 7 lane ทำงานพร้อมกัน

## สิ่งที่สร้าง (allowlist เท่านั้น)

| ไฟล์ | บรรทัด | สถานะ |
|---|---|---|
| [web/app/data-status/page.tsx](../../../web/app/data-status/page.tsx) | 19 | ใหม่ — `<Shell active="open-data">` + `dynamic = 'force-dynamic'` + metadata ไทย |
| [web/components/data-status-dashboard.tsx](../../../web/components/data-status-dashboard.tsx) | 444 | ใหม่ — client component อ่าน API เดิม 2 endpoint |
| [web/lib/hub/data-status.ts](../../../web/lib/hub/data-status.ts) | 254 | ใหม่ — types/helper เฉพาะ feature (ไม่มี `server-only`, ไม่แตะ DB) |
| [web/tests/data-status.test.ts](../../../web/tests/data-status.test.ts) | 363 | ใหม่ — offline 24 tests ไม่มี network/.env |
| [web/app/open-data/page.tsx](../../../web/app/open-data/page.tsx) | 32 | แก้เพิ่ม 7 บรรทัด = ลิงก์ไป `/data-status` เท่านั้น |

ไม่แก้ `page-registry.ts`, `shell.tsx`, `http.ts`, `types.ts`, schemas, repositories, configs, package/lock, workflows ไม่รัน ingestion/publish `--write` ไม่เขียน D1 ไม่ commit/push/deploy
Baseline snapshot ของไฟล์เดียวที่มีอยู่ก่อน (open-data page) เก็บไว้ที่ `.tmp_qa/new-feature-lane-5/open-data.page.tsx.baseline` (โฟลเดอร์นี้อยู่ใน `.gitignore` แล้ว จึงไม่ติดมากับ commit — ลบทิ้งหลังรวมงานเสร็จเพื่อไม่ให้ค้างในเครื่อง)

## Contract ที่ใช้ (อ่านอย่างเดียว ไม่สร้าง endpoint/schema/query ใหม่)

- `GET /api/v1/sources?page=&pageSize=&status=` → `ApiResponse<HubSource[]>` + `pagination {page,pageSize,total}`; ฝั่ง runtime ตอบได้ทั้ง `database` (Postgres/D1) และ `source_api_fallback`
- `GET /api/v1/sources/{id}/status` → `ApiResponse<SourceStatus>` (= `HubSource` + `latestStatus: SourceRun['status'] | null` + `recentRuns: SourceRun[]`)
- ประเภทนำเข้าจาก `lib/hub/types.ts` แบบ `import type` เท่านั้น · `meta` ที่ใช้จริง: `runtimeMode`, `retrievedAt`, `warnings`
- Client fetch ใช้ `pageSize=100` (เพดานของ `parsePage`) ไล่ `page` ต่อเนื่องสูงสุด 8 หน้า แล้วรวมด้วย `mergeSourcePages()` — ไม่ hard-code ว่ามี 12/23 แหล่ง ถ้ายังไม่ครบ `total` จะแสดงช่องว่างและคำอธิบาย
- ยิง request `status` เฉพาะแหล่งที่ผู้ใช้กดเลือกเท่านั้น (ไม่มี N+1 ทั่วทะเบียน) และกด "ลองอ่านใหม่" ได้ทั้งรายการและรายละเอียด

## ความหมายที่ UI แสดง (ยืนยันด้วย fixtures ใน tests)

| กรณี | สิ่งที่หน้าจอแสดง |
|---|---|
| latest `failed` + มี success เก่า | badge "สถานะรอบงานล่าสุด: ล้มเหลว" สี danger + บรรทัด "ดึงข้อมูลสำเร็จล่าสุด: 26 ต.ค. 2569 08:00" (ไม่เปลี่ยนเป็นเขียว) |
| latest `partial` / `running` / `succeeded` | "เสร็จบางส่วน" (amber) / "กำลังรัน" / "สำเร็จ" (สีเขียวเฉพาะ succeeded จริง) |
| `latestStatus = null` ไม่มี round | "ยังไม่ทราบ" (grey) · `isLatestRunSuccess(null) === false` · ห้ามแปลง unknown เป็น success |
| `lastSuccessAt = null` | "ยังไม่ทราบ" + "ไม่มีบันทึกครั้งที่สำเร็จในทะเบียน" — ไม่เขียนว่า "ไม่เคยมีข้อมูล" |
| `recentRuns = []` แต่ latest มีค่า | "รอบล่าสุดอ่านจากทะเบียนรอบงาน ไม่พบรายการรอบที่เปิดเผยได้" |
| `runtimeMode = source_api_fallback` | แถบข้อความ "…ไม่ใช่หลักฐานว่างาน sync เข้าคลังกลางสำเร็จ" และ latest ยังเป็น "ยังไม่ทราบ" |
| request error (`404/503/500`) | การ์ด `role="alert"` = ข้อความไทยจาก Hub + `รหัสสถานะ <code>` + ปุ่ม "ลองอ่านใหม่" |
| pagination ครบ/ไม่ครบ/id ซ้ำ | "โหลดมา 75 จาก 200 แหล่งที่ pagination ของ API แจ้ง (จำกัดจำนวนหน้าต่อรอบ)" / "พบรายการ id ซ้ำระหว่าง 1 แถวที่ข้ามไป" |
| ค้นหาชื่อแหล่ง | กรองเฉพาะรายการที่โหลดมาแล้วบอก "พบ 2 จาก 3 แหล่งที่โหลดมา" ไม่อ้างว่าค้นทั้งทะเบียน |

เวลาทุกจุด format ด้วย `Intl` `th-TH` `timeZone: 'Asia/Bangkok'` (ตรวจแล้ว `2026-10-27T01:00:00Z` → `27 ต.ค. 2569 08:00`) ค่าที่อ่านไม่ออก/null → `{text:'ยังไม่ทราบ', unknown:true}`

การรักษาความซื่อสัตย์อื่น: "เวลาที่ Hub API อ่านข้อมูล" เป็นป้ายแยก ไม่เรียกว่า `dataAsOf` และไม่เรียกว่าข้อมูลถึงวัน · `recordsRead`/`recordsWritten` แสดงรายรอบพร้อมชนิดงาน ("คำอธิบาย (metadata)" / "ตัวเลข (numeric)") ไม่บวกข้ามรอบ/ข้ามชนิด (test ห้ามยอด `1,534`/`1,537` ปรากฏ) · ลิงก์ต้นทางผ่าน `safeHttpUrl()` รับเฉพาะ http(s) ที่ไม่มี username/password และยาว ≤2048 · ข้อ error และ `errorCode` ผ่าน `sanitizeErrorText()` ตัด URL/query/token ก่อนเข้า DOM (test ยืนยันว่า `token=abc123def456` และ `api.example.com` หายไป) · feature นี้เรียกเฉพาะ API ในแอป ไม่เรียกต้นทางภายนอกจาก client · ป้ายท้ายการ์ด "สรุปไม่ได้ว่าครบทุกจังหวัด"

Style ใช้ของเดิมทั้งชุด (`.page-heading .area-note .local-data .real-data-heading .data-filters .data-count .metadata-table .data-table-scroll/.data-table .data-empty .loading-state .data-notes .page-note .badge .button.secondary`) + inline style เฉพาะคู่สีของ badge รอบงาน เพราะ lane ไม่มีสิทธิ์สร้าง `*.module.css` ตารางอยู่ใน container เลื่อนแนวนอนตามที่ใช้บนมือถือในหน้าอื่น

## คำสั่งและผลที่รันจริง (จากโฟลเดอร์ `web`)

```
node --experimental-strip-types --test tests/data-status.test.ts
→ tests 24 · pass 24 · fail 0 · duration 196–230 ms  (RED ยืนยันก่อน: ERR_MODULE_NOT_FOUND lib/hub/data-status.ts)

node_modules/.bin/tsc.cmd --noEmit --incremental false
→ exit 2 · 5 errors · ไม่มีerror ใดในไฟล์ของ lane นี้ (grep "data-status|open-data" = 0)
   ├─ .next/types/validator.ts(5,15/26/40/50) TS2305 ×4 — ไฟล์ generated ต้องรัน `next typegen` ใหม่
   └─ app/api/v1/datasets/[id]/export/route.ts(111,5) TS2322 — ไฟล์ของ lane 6 รายงาน ไม่แก้ข้ามขอบเขต
```

ตรวจเพิ่มเฉพาะไฟล์ lane ด้วย tsconfig ชั่วคราวใน `.tmp_qa` (extends `web/tsconfig.json`, include ไฟล์ lane + `shell.tsx`) → เหลือ error เดียวคือ `lib/hub/d1.ts(125,30) Cannot find module 'cloudflare:workers'` ซึ่งเป็น artifact ของ config แคบ (ชุดเต็ม resolve ได้ เพราะมี ambient types จาก `.next/types`) ไฟล์ชั่วคราวนั้นลบแล้ว

TDD: เขียน test ก่อนทุกฟังก์ชัน เห็นแดงด้วยเหตุผลถูก (โมดูลยังไม่มี) แล้วเขียนโค้ด minimal ผ่านทีละข้อ; แก้เฉพาะ test ที่เรียก `.text` ผิด accessor ตอน RED ไม่ใช่การลด assertion; ไม่ skip ไม่ลบ test เดิมของ repo ไม่รัน suite ของ lane อื่น

## ข้อจำกัดที่ยังเหลือ

1. **ยังไม่ verify กับข้อมูลจริง** — ไม่ได้เปิดหน้าจริง ไม่ได้เรียก `/api/v1/sources` ด้วย runtime ที่มี D1 ตัวเลข/เวลาจริงจึงยังไม่มีหลักฐาน; fixture ทั้งหมดเป็น in-memory
2. **ยังไม่ตรวจ browser desktop/mobile** — ต้องให้ผู้รวมงานรันหลังทุก lane หยุดแก้ (CSS เดิมรองรับ `.data-filters` stacking และ `.data-table-scroll` เลื่อน ที่ ≤760px แล้ว แต่ยังไม่ได้วัดจริง)
3. **หน้า `/data-status` ยังไม่มีในเมนู/page-registry** — เข้าได้ทางลิงก์ท้าย `/open-data` และ URL ตรง เท่านั้น (registry/menu เป็นของผู้รวมงาน)
4. **ค้นหาทำได้เฉพาะรายการที่โหลดมา** (endpoint `/sources` ไม่มี param `q`) จึงบอกขอบเขตข้อความไว้บนหน้าจอ ไม่อ้างว่าค้นทั้งทะเบียน หากต้องการค้นทั้งทะเบียนต้องให้ผู้รวมงานตัดสินใจเพิ่ม param ฝั่ง repository
5. **พบความไม่สอดคล้องของ contract เดิม (รายงาน ไม่แก้):** `getD1SourceStatus` คำนวณ `latestStatus` จาก round ล่าสุดทุก kind แต่ `recentRuns` กรอง round ที่ resource ยังไม่ approved+published → อาจได้ latest มีค่าแต่ history ว่าง; UI lane นี้แสดงตามจริงพร้อมข้อความอธิบายแล้ว ถ้าจะแก้ต้องเป็นที่ shared repository ซึ่งเป็นงานของผู้รวมงาน
6. `errorCode` จาก `sync_runs` เป็น text อิสระ จึง sanitize ก่อนแสดงเสมอ (อาจหายไปบางส่วนถ้าต้นทางฝัง URL ใน code)
7. badge สีรอบงานเป็น inline style เพราะห้ามสร้าง CSS module — ถ้าผู้รวมงานต้องการ token สีสำเร็จ/ล้มเหลวอย่างเป็นทางการ ควรย้ายเข้า `globals.css` ครั้งเดียวทั้งระบบ

## สิ่งที่ผู้รวมงานต้องทำต่อ

- รัน `npm --prefix web run typecheck` (รวม `next typegen`) + `npm --prefix web run test` + `build:vinext` หลัง AI 5–7 หยุดเขียน เพื่อยืนยัน 4 errors ของ `.next/types/validator.ts` หายไปและ `/data-status` เข้า build graph
- Browser flow: เปิด `/open-data` → กดลิงก์ "เปิดหน้าสถานะแหล่งข้อมูล" → `/data-status` → พิมพ์คำค้น → เลือกแหล่ง → อ่าน badge สองตัว/เวลา/`recentRuns`/ลิงก์ต้นทาง → กด "ลองอ่านใหม่" · ตรวจที่ 1440×900 และ 390×844 ว่าตารางไม่ล้นจอ
- Live acceptance ที่ยังค้าง (ต้องรันใน runtime ที่มี D1): `curl "http://127.0.0.1:3010/api/v1/sources?page=1&pageSize=100"` แล้วเทียบ `pagination.total` กับ "โหลดมา N จาก M" บนหน้าจอ · `curl ".../api/v1/sources/<id>/status"` เทียบ `latestStatus`/`lastSuccessAt`/`recentRuns` กับ badge · ทำ runtime ให้ตกไปเป็น `source_api_fallback` เพื่อยืนยันแถบ "ไม่ใช่หลักฐานว่า sync สำเร็จ"
- ถ้าจะประกาศหน้านี้ในเมนู/คู่มือ/API catalog ให้เพิ่ม `data-status` ใน `page-registry.ts` (ของผู้รวมงาน) และคงข้อความที่ระบุว่า "เวลาอ่าน API ≠ ความสดของข้อมูลต้นทาง"
