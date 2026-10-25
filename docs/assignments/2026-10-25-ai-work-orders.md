# ใบสั่งงาน AI 3 ตัว — Thailand Agricultural Data Hub

วันที่: 25 ตุลาคม 2569  
สถานะ: ใบสั่งงานสำหรับรอบถัดไป (ยังไม่ใช่รายงานผลการทำงาน)  
อ่านคู่กับ: [AGENTS.md](../../AGENTS.md), [HANDOFF.md](../../HANDOFF.md), [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md), [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md), [docs/progress.md](../progress.md)

---

## 0. สรุปสำหรับเจ้าของงาน

งานที่ควรทำต่อไม่ใช่ “deploy checkout ปัจจุบันทันที” เพราะการตรวจรอบนี้พบว่า checkout มีการเปิดตัวเลขที่สิทธิ์ยัง `pending` อยู่ในหน้าเว็บและ API หลายจุด ถ้า deploy ก่อนแก้ จะยิ่งทำให้ข้อมูลที่ยังไม่ได้รับอนุญาตถูกเผยแพร่วงกว้างขึ้น

ลำดับที่ถูกต้องคือ:

1. **หยุดการรั่วของตัวเลขที่ยังไม่ได้รับสิทธิ์ (P0)**
2. **ทำให้ทุกหน้า/API บอกสถานะข้อมูลตรงกับความจริง**
3. **ผูกหน้าใหม่เข้าเมนูและทำ API contract ให้ครบ**
4. **เพิ่ม test/CI และตรวจ mobile/desktop**
5. **ค่อย deploy Preview และทำ D1 numeric acceptance**

การแบ่ง AI 3 ตัว:

| AI | เลน | เป้าหมายหลัก | แตะโค้ดเว็บหรือไม่ |
|---|---|---|---|
| AI-1 | Data Governance Containment | ปิดการเผยแพร่ตัวเลข RID/OAE/Open-Meteo ที่ยัง pending และทำ guard test | ใช่ เฉพาะไฟล์ water/prices/early-warning/weather-engine |
| AI-2 | Product Integration & Contract | เมนู หน้าใหม่ contract 23 endpoints และ domain tests | ใช่ เฉพาะ shell/pages/contract/tests |
| AI-3 | Release Engineering & Verification | baseline git, CI, regression, browser QA, deploy preflight และรวมเอกสาร | ไม่แตะ product code; แตะ CI/tests harness/docs |

**Gate สำคัญก่อนเริ่ม:** เจ้าของงานต้องเลือกวิธีแยกงานก่อน เพราะ `web/` ทั้งโฟลเดอร์ยังไม่ถูก track ใน git (ดูข้อ 2.5) แนะนำให้ commit baseline หรือใช้ git worktree แยก 3 เลน ห้ามให้ AI 3 ตัวแก้ไฟล์ร่วมกันใน working tree เดียว

---

## 1. Baseline ที่ตรวจล่าสุด (25 ตุลาคม 2569)

ผลที่รันจริงระหว่างจัดทำใบสั่งงาน:

| รายการ | ผล | หมายเหตุ |
|---|---|---|
| Web unit tests | **42 pass / 0 fail** | `npm --prefix web run test` ใช้เวลา ~1.09 วินาที |
| TypeScript | **0 error** | `npm --prefix web run typecheck` ผ่าน (Next typegen + tsc) |
| Python tests | **407 tests OK (skipped=1)** | `.venv/Scripts/python.exe -m unittest discover -s tests` ใช้เวลา ~63.7 วินาที |
| ViNext build | ยังไม่รันในรอบวางแผนนี้ | HANDOFF บันทึกว่า รอบก่อนผ่าน; ต้องรันซ้ำใน AI-3 |
| API routes | **23 GET routes** | `web/app/api/v1/**/route.ts` |
| API contract | **8 endpoints** | `data_contracts/hub-api.schema.json` → `x-endpoints` |
| API catalog | **13 endpoints** | `web/lib/hub/api-catalog.ts` |
| Resource registry | **82 รายการ: 81 pending + 1 approved_public** | `config/resource_licenses.json`; เอกสารบางฉบับยังเขียน 72 รายการ |
| Git tracked web files | **0 ไฟล์** | `git ls-files web` ได้ 0; ทั้ง `web/` เป็น untracked |
| Branch | `main` เหนือ `origin/main` 10 commits | working tree มีไฟล์แก้/ใหม่จำนวนมาก |

ข้อสังเกตจากการรัน Python suite: ระหว่างชุดทดสอบมีการยิง RID จริงและเขียน snapshot ลง temp directory แม้ไฟล์ test บางไฟล์จะระบุว่า mocked ก็ตาม นี่เป็นความเสี่ยงต่อ CI และเป็นงานของ AI-3 ที่ต้องหา root cause ก่อนเพิ่ม CI

---

## 2. สิ่งที่ต้องแก้เป็นลำดับแรก

### 2.1 P0 — หน้าแรกและ `/water` เปิดตัวเลข RID ที่ยัง pending

`web/lib/hub/water-data.ts` มีอ่างเก็บน้ำ **461 แห่ง** พร้อมความจุ ปริมาตร เปอร์เซ็นต์ และ inflow/outflow ที่ระบุว่าเป็น “Normalized and validated daily snapshot: 2026-10-24” จาก RID ข้อมูลชุดนี้ถูกใช้ใน:

- `web/app/page.tsx` (หน้าแรก)
- `web/app/water/page.tsx` และ `web/components/water-dashboard.tsx`
- `web/app/api/v1/water/reservoirs/route.ts`
- `web/lib/hub/early-warning-data.ts` (import `RESERVOIRS` โดยตรง)

ทะเบียนสิทธิ์ระบุ RID reservoir daily report เป็น `pending` และ AGENTS.md ห้ามนำค่า pending ออก public API, HTML, props หรือ cache การมีหน้าเว็บสวยและมีแหล่งอ้างอิงไม่ทำให้สิทธิ์ผ่าน

API ยังตั้ง `Cache-Control: public, max-age=1800, s-maxage=3600` ซึ่งจะแคชตัวเลข pending ที่ edge ด้วย

### 2.2 P0 — `/prices` และหน้าแรกเปิดราคาที่อ้าง OAE/NABC โดยไม่มีสถานะ sample

`web/lib/hub/price-data.ts` มีราคาสินค้า 6 รายการพร้อมประวัติ 12 เดือน ระบุแหล่ง OAE/NABC แต่ไม่มี `sample: true`, `meta.access`, warnings หรือข้อความ “ข้อมูลตัวอย่าง” และถูกใช้ในหน้าแรกกับ `/api/v1/prices/daily` ทะเบียน OAE/NABC ราคาข้าวหอมมะลิยัง `pending`

ต้องพิสูจน์ก่อนว่าค่าเหล่านี้เป็นค่าจริงจาก OAE/NABC หรือเป็นชุดสังเคราะห์ ถ้าเป็นค่าจริง ต้องปิดการเผยแพร่ทันที ห้ามแก้ด้วยการเติม `sample: true` ทั้งที่ยังใช้ค่าจริงจาก snapshot เดิม เพราะนั่นยังเป็นการเผยแพร่ค่าจริงที่ไม่มีสิทธิ์ ต้องเลือกอย่างใดอย่างหนึ่ง:

- แสดงเฉพาะ metadata และลิงก์ต้นทาง (แนะนำเป็นค่าเริ่มต้น), หรือ
- ใช้ชุดข้อมูลสังเคราะห์ที่ deterministic และไม่ใช่ค่าจริงจาก RID/OAE/NABC พร้อมป้าย “ตัวอย่าง” ทุกจุด

### 2.3 P0 — `/early-warning` อ้าง “สถิติจริง” แต่ใช้ข้อมูล RID pending

`web/lib/hub/early-warning-data.ts` import `RESERVOIRS` จาก `water-data.ts` และเขียนไว้ชัดว่า “อิงสถิติจริงจาก 461 อ่างเก็บน้ำ” แม้ API จะติด `sample: true` และ `metadata_only` แล้ว การติดธง sample ไม่ได้เปลี่ยนข้อเท็จจริงว่าค่าที่แสดงคือค่าจริงที่ยังไม่ได้รับอนุญาต

ต้องแยกข้อมูล simulation ออกจากข้อมูล RID จริงอย่างเด็ดขาด: ใช้ generator สังเคราะห์ของ early-warning เอง หรือดำเนินการกับ metadata-only และลบการอ้างสถิติจริงออก

### 2.4 P0 — `/api/v1/weather-engine` ประกาศ `approved_public` ทั้งที่ทะเบียนยัง pending

`web/app/api/v1/weather-engine/route.ts` ตอบ:

- `availability: 'ready'`
- `completeness: 'complete'`
- `access: 'approved_public'`
- `dataAsOf: new Date().toISOString()`
- เรียก Open-Meteo สดจาก public API route

ทะเบียนระบุ Open-Meteo ERA5/forecast เป็น `pending` ทั้งการใช้บริการและ attribution อีกทั้ง route นี้ไม่ได้อ่าน active approved batch จาก D1 ตามหลักระบบ ต้องเปลี่ยนเป็น demo/metadata-only หรือปิด route จนกว่าจะอนุมัติ และห้ามใช้ `approved_public` กับข้อมูลที่ยัง pending

### 2.5 P1 — `web/` ยังไม่เข้า git และไม่มี CI สำหรับเว็บ

`git ls-files web` คืน 0 ไฟล์ หมายความว่างานเว็บทั้งหมดใน checkout นี้ยังไม่ถูก version control แม้จะรัน test ผ่านก็ตาม ความเสี่ยง:

- AI 3 ตัวแก้ไฟล์พร้อมกันแล้วตามรอย/rollback ไม่ได้
- การเปลี่ยนแปลงของ AI ตัวหนึ่งอาจทับงานอีกตัวโดยไม่มี diff ให้ตรวจ
- deploy จาก checkout ที่ไม่มีประวัติ commit ทำให้ตรวจย้อนหลังไม่ได้

ต้องแก้ก่อนเริ่มงานขนาน: baseline commit หรือแยก worktree ต่อเลน และเพิ่ม CI ภายหลัง

### 2.6 P1 — API contract ไม่ครบ 23 routes

- `data_contracts/hub-api.schema.json` มี 8 endpoints
- `web/lib/hub/api-catalog.ts` มี 13 endpoints
- ของจริงมี 23 GET routes

endpoint ที่ยังไม่ถูก document ได้แก่ carbon, finance, machinery, food-safety, livestock, logistics, smart-farming, trade, early-warning, weather-engine และ endpoint เดิม weather/water/crops/soil/prices บางส่วนยังไม่ครบใน schema

### 2.7 P1 — หน้าใหม่ 4 หน้ายังไม่ถูกผูกเมนู

`web/components/shell.tsx` ยังไม่มี `ActiveNav` และเมนูสำหรับ:

- `/carbon`
- `/finance`
- `/machinery`
- `/food-safety`

หน้าเหล่านี้ใช้ `active="crops"` หรือ `active="explore"` ชั่วคราว ทำให้ active state ไม่ตรง และผู้ใช้เข้าไม่ถึงจากเมนูหลัก

### 2.8 P1 — domain tests ยังไม่ครอบคลุมหน้า sample ใหม่

tests ที่มีครอบคลุม weather/crops/soil/livestock เป็นหลัก ยังไม่มี contract test สำหรับ carbon, finance, machinery, food-safety, trade, logistics, early-warning, smart-farming ทำให้การเปลี่ยน data lib ในอนาคตอาจหลุด governance flag ได้โดยไม่รู้

### 2.9 P1 — ทะเบียนสิทธิ์ 82 รายการ แต่เอกสารยังเขียน 72

`config/resource_licenses.json` มี 82 entries (81 pending, 1 approved) แต่ `docs/source-license-register.md` และ HANDOFF หลายจุดยังเขียน 72/71 ต้องปรับให้ตรงกันและระบุวันที่ตรวจ เพื่อไม่ให้ตัวเลข coverage/สิทธิ์สับสน

### 2.10 P1 — test บางตัวยิง network จริง

จากผลรัน Python suite มี request ไป RID จริงและเขียน snapshot ลง temp แม้ test บางไฟล์จะบอกว่า mocked ต้องตรวจ root cause (เช่น default fetcher ถูก bind ตอน import ทำให้ patch ไม่มีผล) และทำ guard สำหรับ CI ก่อนเพิ่ม workflow

---

## 3. กติกากลางของทั้ง 3 AI

### 3.1 ขอบเขตไฟล์

| ไฟล์/กลุ่ม | เจ้าของ | ห้าม |
|---|---|---|
| `web/lib/hub/water-data.ts`, `price-data.ts`, `early-warning-data.ts`, `open-meteo-client.ts` | AI-1 | AI-2, AI-3 |
| `web/app/api/v1/water/reservoirs/route.ts`, `prices/daily/route.ts`, `early-warning/route.ts`, `weather-engine/route.ts` | AI-1 | AI-2, AI-3 |
| `web/app/page.tsx`, `web/app/water/page.tsx`, `web/app/prices/page.tsx`, `web/app/early-warning/page.tsx` | AI-1 | AI-2, AI-3 |
| `web/components/water-dashboard.*`, `price-dashboard.*`, `early-warning-dashboard.*` | AI-1 | AI-2, AI-3 |
| `web/components/shell.tsx` | AI-2 | AI-1, AI-3 |
| `web/app/{carbon,finance,machinery,food-safety,livestock,logistics,smart-farming,trade,crops,soil,weather}/page.tsx` | AI-2 | AI-1, AI-3 |
| `data_contracts/hub-api.schema.json`, `web/lib/hub/api-catalog.ts`, `web/tests/api-catalog.test.ts` | AI-2 | AI-1, AI-3 |
| `web/tests/governance-*.test.ts` | AI-1 | AI-2, AI-3 |
| `web/tests/domain-*.test.ts` | AI-2 | AI-1, AI-3 |
| `.github/workflows/*`, `tests/*.py` (เฉพาะ hermeticity/CI guard), `docs/qa/*`, `docs/release/*`, `docs/lanes/*` | AI-3 | AI-1, AI-2 |
| `HANDOFF.md`, `docs/progress.md`, `docs/README.md` | AI-3 (ช่วง integrate เท่านั้น) | AI-1, AI-2 |
| `config/resource_licenses.json`, `docs/source-license-register.md` | AI-1 | AI-2, AI-3 |

ถ้าจำเป็นต้องแก้ไฟล์ของอีกเลน ให้หยุดและส่ง report แทนการแก้เอง

### 3.2 ห้ามทำ

- ห้าม commit, push, deploy, ลบไฟล์ หรือแก้ `.env` โดยไม่ได้รับอนุญาตจากเจ้าของงาน
- ห้ามพิมพ์/ส่ง token, secret, connection string หรือค่า `.env` ในแชต/ไฟล์/PR
- ห้ามอ่านหรือคัดลอก `data/local/`, `exports/private/` เข้าเว็บหรือ git
- ห้ามเปิดตัวเลข resource ที่สิทธิ์ `pending` ผ่าน public API, HTML, props, cache
- ห้ามเปลี่ยน schema/response field จนกว่าจะแจ้ง AI-2 และได้รับ freeze
- ห้ามรัน suite ทั้ง repo ซ้ำหลายรอบโดยไม่มีเหตุผล; ใช้ targeted test ก่อน แล้วรันเต็มตอน integrate
- ห้ามอ้างว่า deploy/visual QA ผ่านหากไม่ได้ทำจริง

### 3.3 วิธีแยกงาน

แนะนำ:

1. เจ้าของงาน commit baseline หรือสร้าง branch/worktree 3 เลน:
   - `ai/data-governance`
   - `ai/web-integration`
   - `ai/release-qa`
2. AI แต่ละตัวทำงานใน worktree ของตน
3. AI-3 เป็นผู้รวมและตรวจซ้ำหลัง merge
4. ถ้าเจ้าของงานไม่อนุญาต commit ให้ทุกเลนส่งเป็น patch/diff พร้อมรายการไฟล์ ห้ามแก้ working tree เดียวกัน

### 3.4 รูปแบบรายงานที่ต้องส่ง

ทุก AI เขียนรายงานของเลนตัวเองที่ `docs/lanes/<lane>.md` (AI-3 สร้างโฟลเดอร์) ประกอบด้วย:

- เป้าหมายและขอบเขตที่ทำ
- ไฟล์ที่แก้/สร้าง (absolute path)
- สิ่งที่ตรวจจริง: command + ผลลัพธ์ + เวลา
- สิ่งที่ยังไม่ตรวจ/ข้อจำกัด
- ความเสี่ยงและสิ่งที่ต้องให้เจ้าของงานตัดสิน
- งานที่ส่งต่อให้เลนอื่น

ห้ามแก้ HANDOFF.md เอง; AI-3 จะรวมให้ตอนท้าย

---

## 4. AI-1 — Data Governance Containment

### 4.1 Mission

หยุดการเผยแพร่ตัวเลขที่ยังไม่ได้รับสิทธิ์ ทำให้ทุกจุดบอกสถานะ `sample`/`metadata_only` ตรงกับความจริง และเพิ่ม regression test ที่กันการรั่วซ้ำ โดยไม่ทำให้เส้นทาง CHIRPS ที่อนุมัติแล้วเสียหาย

### 4.2 Sub-agents

| Sub-agent | งาน | ไฟล์ที่แตะ | Deliverable |
|---|---|---|---|
| **1A Exposure Auditor** | ตรวจ 20 หน้า + 23 API routes + data libs; จำแนกค่าที่แสดง/แหล่ง/สิทธิ์/flag/cache/banner; หา P0/P1 ทั้งหมด | อ่านเท่านั้น; เขียน `docs/governance/public-data-exposure-audit.md` | ตาราง exposure matrix + รายการแก้ |
| **1B Water & Early-warning Containment** | แก้ water-data/early-warning-data ให้ไม่ใช้ค่า RID จริง; ทำ metadata-only หรือ synthetic sample; ลบ public cache; ใช้ envelope มาตรฐาน; แก้หน้าแรก/หน้า water/early-warning | ไฟล์กลุ่ม water/early-warning ตามข้อ 3.1 | โค้ด + test + หลักฐาน |
| **1C Prices Containment** | แก้ price-data และหน้าแรก/prices/API ให้ไม่เปิดราคา OAE/NABC จริง; metadata-only หรือ synthetic sample; ลบ public cache | ไฟล์กลุ่ม prices ตามข้อ 3.1 | โค้ด + test + หลักฐาน |
| **1D Weather-engine Gate** | เลิกตอบ `approved_public`/`complete`; ทำ demo guard หรือ metadata-only; ไม่เรียก Open-Meteo สดใน public route จนอนุมัติ | `web/app/api/v1/weather-engine/route.ts`, `web/lib/hub/open-meteo-client.ts` | โค้ด + test + หลักฐาน |
| **1E Governance Tests** | เพิ่ม test กันการรั่ว: flag, access, cache, determinism, ไม่มีค่า RID/OAE จริงใน metadata-only output | `web/tests/governance-*.test.ts` | test ผ่าน + รายงาน |

### 4.3 แนวทางแก้ที่แนะนำ

**`/water` และ `/api/v1/water/reservoirs`**

ค่าเริ่มต้นที่ปลอดภัยที่สุดคือ **metadata-only**:

- แสดงชื่อแหล่ง RID, คำอธิบายชุดข้อมูล, วันที่รายงาน, ข้อจำกัดสิทธิ์ และลิงก์ต้นทาง
- ไม่แสดงความจุ/ปริมาตร/เปอร์เซ็นต์/จำนวนอ่างจริงใน HTML, props, API หรือ cache
- API ตอบ `data: []` หรือ payload อธิบาย metadata ที่ไม่ใช่ตัวเลข พร้อม `availability: 'metadata_only'`, `access: 'metadata_only'`, `completeness: 'unknown'`, warnings และ `Cache-Control: no-store`
- ถ้าเจ้าของงานต้องการ demo UI ให้ใช้ generator สังเคราะห์แยกไฟล์ ห้าม reuse ค่า 461 อ่างจริง และต้องมีป้าย “ข้อมูลตัวอย่าง” ทุกจุด

**`/early-warning`**

- ลบ import `RESERVOIRS` จาก `water-data.ts`
- ใช้ generator simulation ของ early-warning เอง หรือระบุว่าเป็นแบบจำลองเชิงโครงสร้างที่ไม่ใช้ค่าจริง
- ลบข้อความ “อิงสถิติจริงจาก 461 อ่าง” และข้อความที่ทำให้เข้าใจว่าเป็นข้อมูล RID จริง
- คง `sample: true`, `meta.access = 'metadata_only'`, warnings และ banner
- ถ้าไม่มีข้อมูลจริงที่อนุมัติ ให้แสดง empty/metadata-only state แทนการสร้างตัวเลขแทน

**`/prices` และ `/api/v1/prices/daily`**

- ค่าเริ่มต้น metadata-only: แสดงรายการสินค้า/แหล่ง/หน่วย/ความถี่/ลิงก์ต้นทาง โดยไม่แสดงราคา
- ถ้าต้องการ demo ให้ใช้ synthetic series ที่ deterministic และไม่ตรงกับค่าจริง พร้อมป้าย sample
- API ใช้ `handleApi`/`jsonData` หรือ envelope เดียวกัน, `no-store`, ไม่มี `public` cache

**`/api/v1/weather-engine`**

- ถ้าไม่เปิดใช้จริง: ตอบ 503 `SOURCE_UNAVAILABLE` พร้อมข้อความสิทธิ์ หรือซ่อน route จาก public
- ถ้าต้องการ demo: ใช้ `access: 'metadata_only'`, `availability: 'metadata_only'`, `completeness: 'unknown'`, `sample: true` และ warnings; ห้าม `approved_public`/`complete`
- ห้าม fetch Open-Meteo สดใน request ของ public route จนกว่าทะเบียนจะอนุมัติ; ถ้าจำเป็นต้องมี demo ให้ใช้ cached/synthetic sample

**หน้าแรก**

- ลบ KPI/การ์ดที่อ้างตัวเลขน้ำ/ราคาจริง หรือเปลี่ยนเป็นสถานะ “metadata-only/รอตรวจสิทธิ์”
- ลบข้อความ “เรียกดูตัวเลขจริง” หากยังไม่มีตัวเลขที่อนุมัติ
- คงทางเข้า catalog/แหล่งข้อมูลและป้ายสถานะที่ตรวจสอบได้

### 4.4 Acceptance criteria

- [ ] `rg`/test ยืนยันว่าไม่มีค่า RID 461 อ่างจริงใน HTML/props/API/cache ของหน้า water, early-warning, home
- [ ] ไม่มีราคา OAE/NABC จริงในหน้า prices/home/API
- [ ] `weather-engine` ไม่ตอบ `approved_public` หรือ `complete` อีก
- [ ] numeric routes ที่แก้ใช้ `Cache-Control: no-store` และ envelope มาตรฐาน
- [ ] ทุกจุดที่แสดงตัวเลข demo มี `sample: true`, `meta.access = 'metadata_only'` และ warnings
- [ ] `npm --prefix web run test`, `typecheck`, `build:vinext` ผ่าน
- [ ] `docs/governance/public-data-exposure-audit.md` ครบทุกหน้า/route
- [ ] ไม่มี deploy/commit

### 4.5 Commands

```powershell
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build:vinext
.venv\Scripts\python.exe -m unittest tests.test_web_catalog  # ถ้าแก้ส่วนที่เกี่ยวข้อง
git status --short
```

---

## 5. AI-2 — Product Integration & Contract

### 5.1 Mission

ทำให้หน้าใหม่ทั้งหมดเข้าถึงได้จากเมนู มี active state ถูกต้อง มี API contract ครบ 23 routes และมี domain tests ที่กัน regression โดยไม่แตะ data governance ของ AI-1

### 5.2 Sub-agents

| Sub-agent | งาน | ไฟล์ที่แตะ | Deliverable |
|---|---|---|---|
| **2A Nav Integrator** | เพิ่ม ActiveNav และ submenu สำหรับ carbon/finance/machinery/food-safety; ตรวจ mobile drawer; ให้ทุกหน้าเข้าถึงได้ | `web/components/shell.tsx` | เมนู + typecheck |
| **2B Page Metadata** | ตั้ง `active` ให้ตรงหน้า; title/description; ลิงก์แหล่งข้อมูล; empty state; ไม่แตะ data lib | `web/app/*/page.tsx` ตามข้อ 3.1 | หน้าเว็บ + typecheck |
| **2C Contract Owner** | อัปเดต schema และ api-catalog เป็น 23 endpoints; รอ freeze รูป response จาก AI-1 ก่อน document water/prices/early-warning/weather-engine | `data_contracts/hub-api.schema.json`, `web/lib/hub/api-catalog.ts`, `web/tests/api-catalog.test.ts` | contract + tests |
| **2D Domain Tests** | เพิ่ม contract tests ของ 8 domain ที่ยังขาด | `web/tests/domain-*.test.ts` | tests ผ่าน/รายงาน bug |
| **2E Mobile & A11y** | ตรวจ 390/1440, keyboard, ตาราง, contrast, reduced motion; แก้ CSS เฉพาะไฟล์ของ AI-2 | CSS modules ของ domain ที่ AI-2 เป็นเจ้าของ | QA report + fix |

### 5.3 รายละเอียด

**2A Nav**

- เพิ่ม `'carbon' | 'finance' | 'machinery' | 'food-safety'` ใน `ActiveNav`
- เพิ่ม submenu:
  - ภายใต้ “พืชผลเกษตร”: carbon, machinery
  - ภายใต้ “ราคาสินค้า” หรือ “บัญชีข้อมูล”: finance, food-safety ตามความเหมาะสมของ IA
- ตรวจว่าทุกหน้าหลักมีทางเข้าจาก desktop และ mobile
- ระวัง: `shell.tsx` เป็นไฟล์ร่วม ห้าม AI อื่นแก้พร้อมกัน

**2B Page Metadata**

- `carbon`, `finance`, `machinery`, `food-safety` ต้องไม่ใช้ `active="crops"`/`active="explore"` อีก
- เพิ่ม metadata title/description ที่บอกชัดว่าเป็น sample/metadata-only
- หน้าไหนที่ยังไม่มีข้อมูลจริง ให้ใช้ empty state ที่อธิบาย ไม่เติมตัวเลข
- ไม่แตะ `page.tsx` (home), water, prices, early-warning เพราะเป็นของ AI-1

**2C Contract**

- `x-endpoints` ต้องมี 23 GET routes
- `api-catalog.ts` ต้องมี 23 endpoints ตามกลุ่มที่สมเหตุสมผล
- `api-catalog.test.ts` ต้องอัปเดตจำนวน/ลำดับ/พารามิเตอร์
- ห้ามเปลี่ยน response shape ของ route; ถ้า AI-1 เปลี่ยน water/prices/early-warning/weather-engine ให้ document ตามผลลัพธ์จริงหลัง freeze
- endpoint ที่ยังไม่พร้อมให้ document เป็น `metadata_only`/demo ตามจริง

**2D Domain Tests**

- อย่างน้อยต่อ domain:
  - 200 + envelope `{data, meta}`
  - `sample: true` (ถ้าเป็น demo)
  - `meta.access === 'metadata_only'`
  - warnings ไม่ว่าง
  - query ผิด → 400 `INVALID_QUERY` + `requestId`
  - เรียกซ้ำแล้ว deterministic (ยกเว้น timestamp)
  - invariant เฉพาะ domain (เช่น 77 จังหวัด, ผลรวม)
- ถ้า test fail เพราะ bug ใน production ให้รายงานไปยังเจ้าของไฟล์ ห้ามแก้ข้ามเลน

**2E Mobile & A11y**

- ตรวจ 390×844 และ 1440×900 อย่างน้อยหน้า carbon, finance, machinery, food-safety, livestock, logistics, trade, smart-farming
- ตรวจ horizontal overflow, ตาราง scroll, focus ring, ปุ่ม/select ที่ใช้คีย์บอร์ดได้, `prefers-reduced-motion`
- ใช้ browser-use/Playwright ที่มี; ถ้า browser ไม่มี visible surface ให้บันทึกเป็นข้อจำกัด ไม่กล่าวอ้างว่าผ่าน

### 5.4 Acceptance criteria

- [ ] ทุกหน้าใน `web/app/*/page.tsx` มีทางเข้าจาก shell หรือมีเหตุผลชัดเจนว่าเป็น hidden route
- [ ] `ActiveNav` ครอบคลุมทุกหน้า; typecheck ผ่าน
- [ ] contract = 23 endpoints; api-catalog = 23; test ผ่าน
- [ ] domain tests ใหม่ผ่าน หรือมีรายงาน bug พร้อมหลักฐาน
- [ ] mobile/desktop QA มีหลักฐานจริง
- [ ] ไม่แตะไฟล์ AI-1; ไม่ deploy/commit

### 5.5 Commands

```powershell
npm --prefix web run test
npm --prefix web run typecheck
npx --prefix web eslint web/components/shell.tsx web/app/carbon/page.tsx web/app/finance/page.tsx web/app/machinery/page.tsx web/app/food-safety/page.tsx
npm --prefix web run build:vinext
```

---

## 6. AI-3 — Release Engineering & Verification

### 6.1 Mission

สร้าง baseline ที่ reproducibly ตรวจสอบได้, เพิ่ม CI ที่ไม่ยิง network จริง, รัน regression/browser QA, ตรวจ deploy preflight และรวมเอกสารสถานะ โดยไม่แก้ product code

### 6.2 Sub-agents

| Sub-agent | งาน | ไฟล์ที่แตะ | Deliverable |
|---|---|---|---|
| **3A Baseline Freeze** | inventory untracked, secrets scan, large files, commit plan | `docs/release/baseline-freeze.md` | รายงาน + แผน commit (ไม่ commit) |
| **3B CI Engineer** | review workflow sync; เพิ่ม CI Python/web; ทำ test hermetic; ไม่มี live network | `.github/workflows/*.yml`, `tests/` harness | workflow + หลักฐาน |
| **3C Regression Runner** | รัน suite เต็ม/typecheck/build หลัง merge; บันทึกผล | `docs/qa/regression-*.md` | ผลจริง |
| **3D Browser QA** | ตรวจทุกหน้า 390/1440, nav, banner, console, network, overflow | `docs/qa/full-site-*.md` | หลักฐาน + issue list |
| **3E Release Integrator** | deploy preflight, รวม HANDOFF/progress/docs, สรุป blocked | `HANDOFF.md`, `docs/progress.md`, `docs/README.md`, `docs/lanes/*` | เอกสารรวม |

### 6.3 รายละเอียด

**3A Baseline Freeze**

- ยืนยัน `git ls-files web` = 0 และระบุไฟล์ untracked ทั้งหมด
- ตรวจว่า `.env`, `data/local/`, `exports/private/`, `*.duckdb`, `node_modules` ไม่ถูก track
- สแกนหา token/secret ในไฟล์ที่จะ commit (เช่น `CF_D1_TOKEN`, `api_key`, `password`, `BEGIN PRIVATE KEY`)
- ระบุไฟล์ใหญ่ผิดปกติ (เช่น `web/lib/hub/water-data.ts` 6,500+ บรรทัด, dashboard 1,600+ บรรทัด) และผลต่อ bundle
- เสนอ commit plan เป็นชุด: infra/config → data libs → pages → tests → docs
- **ห้าม commit จนเจ้าของงานอนุมัติ**

**3B CI**

- ตรวจ `.github/workflows/sync-hub-catalog.yml`: secret names, fallback account/database IDs, schedule, permissions, `if` branch
- เพิ่ม `.github/workflows/ci.yml`:
  - Python: `python -m unittest discover -s tests` แบบ hermetic (ไม่ยิง network)
  - Web: `npm ci` (ถ้ามี lock), `npm run test`, `npm run typecheck`, `npm run build:vinext`
  - Path filters เพื่อไม่รันเกินจำเป็น
  - Minimal permissions: `contents: read`
- แก้ test ที่ยิง RID จริง: หา root cause และทำ hermeticity (mock/guard/env flag) ได้ใน `tests/*.py` ทุกไฟล์ แต่ห้ามลด assertion หรือลบ coverage; ถ้าต้องแก้ production script (`scripts/` หรือ `src/`) ให้รายงานเจ้าของงานก่อน เพราะอยู่นอกเลนของ AI-3
- ตรวจ YAML syntax และรัน CI commands ในเครื่องให้ได้ผลเดียวกัน

**3C Regression**

- รันหลัง AI-1/AI-2 merge:
  - Python 407+
  - Web 42+ (ต้องมากขึ้นหลัง AI-2 เพิ่ม tests)
  - typecheck
  - build:vinext
- บันทึก command, exit code, จำนวน test, fail/skip, เวลา
- ถ้า fail ให้แยกว่าเป็นของเลนไหนและส่งกลับ ห้ามแก้ข้ามเลน

**3D Browser QA**

- เปิด dev server (`npm --prefix web run dev` หรือ `build:vinext` + preview)
- ตรวจอย่างน้อย:
  - `/`, `/water`, `/prices`, `/early-warning`, `/catalog`, `/explore`, `/areas`, `/areas/73`, `/weather`, `/crops`, `/soil`, `/livestock`, `/logistics`, `/trade`, `/smart-farming`, `/food-safety`, `/carbon`, `/finance`, `/machinery`, `/projects`, `/about`
- 390×844 และ 1440×900
- ตรวจ:
  - banner sample/metadata-only ทุกหน้าที่มีตัวเลข demo
  - ไม่มีข้อความ “ตัวเลขจริง” ในหน้าที่ไม่มีสิทธิ์
  - ไม่มี horizontal overflow
  - console warning/error, failed request, 4xx/5xx
  - nav/mobile drawer ไปถึงหน้าใหม่
  - API ตัวอย่าง: `/api/v1/water/reservoirs`, `/api/v1/prices/daily`, `/api/v1/weather-engine`, `/api/v1/food-safety?provinceCode=21`
- บันทึก URL, viewport, เวลา, ผล, ข้อจำกัด (ถ้า browser ไม่มี visible surface)

**3E Release Integrator**

- ตรวจ `cf auth whoami` และ `node scripts/deploy_preview.mjs` แบบ preflight (ไม่ใส่ `--deploy` เว้นแต่เจ้าของงานอนุมัติ)
- ตรวจชื่อ env `CF_ACCOUNT_ID`, `CF_D1_TOKEN`, `CF_D1_DATABASE_ID` โดยไม่พิมพ์ค่า
- หลัง AI-1/AI-2/3D เสร็จ:
  - อัปเดต `HANDOFF.md` และ `docs/progress.md` ด้วยผลจริง
  - อัปเดต `docs/README.md` ลิงก์ใบสั่งงานนี้
  - สรุป blocked: D1 auth, deploy auth, GitHub secret, production domain
- **ห้าม deploy จน P0 ผ่านและเจ้าของงานอนุมัติ**

### 6.4 Acceptance criteria

- [ ] `docs/release/baseline-freeze.md` ระบุ untracked/secret/large files ครบ
- [ ] CI workflow ผ่าน syntax และรันในเครื่องได้; ไม่มี live network
- [ ] regression report มีผลจริงครบ
- [ ] browser QA มีหลักฐาน 390/1440 ครบทุก route
- [ ] deploy preflight ระบุสถานะ auth ชัดเจนโดยไม่รั่ว secret
- [ ] HANDOFF/progress/docs อัปเดตตรงกับผลจริง
- [ ] ไม่มี deploy/commit โดยไม่ได้รับอนุญาต

### 6.5 Commands

```powershell
git status --short
git ls-files web | Measure-Object -Line
.venv\Scripts\python.exe -m unittest discover -s tests
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build:vinext
node --check scripts/deploy_preview.mjs
```

---

## 7. ลำดับการทำงานและการ integrate

```text
Gate 0: เจ้าของงานอนุมัติ baseline commit/worktree + สิทธิ์ deploy/D1
   |
Wave 1 (ขนานได้)
   AI-1A audit          AI-2A nav          AI-3A baseline + 3B CI
   |
Wave 2 (ขนานได้)
   AI-1B water/early-warning   AI-1C prices   AI-1D weather-engine
   AI-2B page metadata         AI-2C contract (รอ freeze จาก AI-1)
   AI-2D domain tests          AI-2E mobile/a11y
   |
Wave 3
   AI-1E governance tests
   AI-3C regression (หลัง merge AI-1/AI-2)
   |
Wave 4
   AI-3D browser QA -> fix รอบสุดท้าย
   AI-3E deploy preflight + HANDOFF/progress/docs
   |
Gate Final: เจ้าของงานอนุมัติ deploy
```

### Dependency ที่ห้ามข้าม

- AI-2C contract ต้องรอ AI-1B/1C/1D freeze รูป response ของ water/prices/early-warning/weather-engine
- AI-2D domain tests ต้องรอ API shape ของ AI-1 เช่นกัน
- AI-3C/3D ต้องรอ merge ของ AI-1/AI-2
- AI-3E ต้องรอ 3D และหลักฐานทั้งหมด
- Deploy ต้องรอ P0 + QA + owner approval

---

## 8. Prompt สำหรับคัดลอกให้ AI แต่ละตัว

### 8.1 Prompt AI-1

```text
คุณคือ AI-1 (Data Governance Containment) ของโปรเจกต์ Thailand Agricultural Data Hub ใน d:/code/thailand-agri-intelligence

ก่อนเริ่ม ให้อ่าน:
- AGENTS.md
- HANDOFF.md
- SYSTEM_DESIGN.md
- IMPLEMENTATION_PLAN.md
- docs/progress.md
- docs/assignments/2026-10-25-ai-work-orders.md (หัวข้อ AI-1)

เป้าหมาย:
หยุดการเผยแพร่ตัวเลข RID/OAE/NABC/Open-Meteo ที่สิทธิ์ยัง pending ผ่านหน้าเว็บ public API props หรือ cache; ทำให้ทุกจุดบอก sample/metadata_only ตรงกับความจริง; เพิ่ม governance regression tests; ห้าม deploy/commit

ให้สร้าง sub-agent 5 ตัวตามหัวข้อ 4.2:
1A Exposure Auditor (อ่านทุกหน้า/route/data lib แล้วเขียน docs/governance/public-data-exposure-audit.md)
1B Water & Early-warning Containment
1C Prices Containment
1D Weather-engine Gate
1E Governance Tests

ข้อบังคับ:
- แตะเฉพาะไฟล์ที่ระบุในหัวข้อ 3.1 ของใบสั่งงาน
- ห้ามแตะ shell.tsx, data_contracts/hub-api.schema.json, api-catalog.ts, .github/workflows, HANDOFF.md, docs/progress.md
- ห้ามใช้ค่าจริงจาก RID/OAE/NABC ในชุด demo; ถ้าทำ demo ต้องเป็น synthetic และติด sample: true + metadata_only ทุกจุด
- numeric endpoints ต้องใช้ Cache-Control: no-store จนกว่าจะมีสิทธิ์
- weather-engine ต้องไม่ตอบ approved_public/complete
- ห้าม commit/push/deploy หรือพิมพ์ secret

ตรวจ:
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build:vinext
และ targeted test ที่เกี่ยวข้อง

ส่งงาน:
- diff/ไฟล์ที่แก้
- ผลคำสั่งจริง
- ตารางก่อน/หลังของทุกจุดที่ปิดการเผยแพร่
- ข้อค้าง/ความเสี่ยง
- รายงานที่ docs/lanes/ai-1-governance.md
```

### 8.2 Prompt AI-2

```text
คุณคือ AI-2 (Product Integration & Contract) ของโปรเจกต์ Thailand Agricultural Data Hub ใน d:/code/thailand-agri-intelligence

ก่อนเริ่ม ให้อ่าน:
- AGENTS.md
- HANDOFF.md
- SYSTEM_DESIGN.md
- IMPLEMENTATION_PLAN.md
- docs/progress.md
- docs/assignments/2026-10-25-ai-work-orders.md (หัวข้อ AI-2)

เป้าหมาย:
ผูกหน้าใหม่เข้าเมนู, แก้ active state/metadata, ทำให้ API contract ครบ 23 routes, เพิ่ม domain tests และตรวจ mobile/a11y โดยไม่แตะ data governance ของ AI-1

ให้สร้าง sub-agent 5 ตัวตามหัวข้อ 5.2:
2A Nav Integrator
2B Page Metadata
2C Contract Owner
2D Domain Tests
2E Mobile & A11y

ข้อบังคับ:
- แตะเฉพาะไฟล์ที่ระบุในหัวข้อ 3.1
- ห้ามแตะ water-data/price-data/early-warning-data/open-meteo-client หรือ route ของ AI-1
- contract ต้องรอ freeze รูป response จาก AI-1 ก่อน document water/prices/early-warning/weather-engine
- ห้ามเปลี่ยน response shape ของ route เอง
- ห้าม commit/push/deploy หรือพิมพ์ secret

ตรวจ:
npm --prefix web run test
npm --prefix web run typecheck
npx --prefix web eslint <ไฟล์ที่แก้>
npm --prefix web run build:vinext

ส่งงาน:
- ไฟล์ที่แก้ + diff
- หลักฐาน typecheck/test/build
- ตารางหน้า→เมนู/active/สถานะข้อมูล
- contract 23 endpoints และ test ที่อัปเดต
- ผล mobile/a11y หรือข้อจำกัด
- รายงานที่ docs/lanes/ai-2-product.md
```

### 8.3 Prompt AI-3

```text
คุณคือ AI-3 (Release Engineering & Verification) ของโปรเจกต์ Thailand Agricultural Data Hub ใน d:/code/thailand-agri-intelligence

ก่อนเริ่ม ให้อ่าน:
- AGENTS.md
- HANDOFF.md
- SYSTEM_DESIGN.md
- IMPLEMENTATION_PLAN.md
- docs/progress.md
- docs/assignments/2026-10-25-ai-work-orders.md (หัวข้อ AI-3)

เป้าหมาย:
สร้าง baseline ที่ reproducibly ตรวจได้, เพิ่ม CI ที่ไม่ยิง network จริง, รัน regression/browser QA, ตรวจ deploy preflight และรวมเอกสาร โดยไม่แก้ product code

ให้สร้าง sub-agent 5 ตัวตามหัวข้อ 6.2:
3A Baseline Freeze
3B CI Engineer
3C Regression Runner
3D Browser QA
3E Release Integrator

ข้อบังคับ:
- ห้ามแก้ product code ใน web/; ถ้าพบ bug ให้รายงานเจ้าของเลน
- แตะได้เฉพาะ .github/workflows, tests harness/CI guard, docs/qa, docs/release, docs/lanes, HANDOFF.md, docs/progress.md, docs/README.md
- ห้าม commit/push/deploy จนเจ้าของงานอนุมัติ
- ห้ามพิมพ์ secret/token/.env
- ต้องแก้/test ปัญหา test ที่ยิง RID จริงก่อนเพิ่ม CI
- deploy preflight ใช้ node scripts/deploy_preview.mjs โดยไม่ใส่ --deploy เว้นแต่ได้รับอนุญาต

ตรวจ:
git status --short
git ls-files web
.venv\Scripts\python.exe -m unittest discover -s tests
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build:vinext
node --check scripts/deploy_preview.mjs

ส่งงาน:
- baseline/secret/large-file report
- CI workflow + หลักฐานว่าไม่ยิง network
- regression results
- browser QA 390/1440 พร้อม URL/เวลา/ข้อจำกัด
- deploy preflight status
- HANDOFF/progress/docs ที่อัปเดต
- รายงานที่ docs/lanes/ai-3-release.md
```

---

## 9. Definition of Done ของรอบนี้

ถือว่างานรอบนี้ “พร้อม deploy” เมื่อครบทุกข้อ:

- [ ] P0 ทั้ง 4 จุดถูกปิด และมี test ยืนยันว่าไม่มีตัวเลข pending ออก public
- [ ] ทุกหน้า/API ที่แสดง demo ระบุ `sample: true`, `metadata_only` และ warnings
- [ ] `weather-engine` ไม่กล่าวอ้าง `approved_public`/`complete`
- [ ] API contract และ api-catalog ครบ 23 routes
- [ ] ทุกหน้าเข้าถึงได้จากเมนู; active state ถูกต้อง
- [ ] domain tests + governance tests ผ่าน
- [ ] Python/Web/typecheck/build ผ่านหลัง merge
- [ ] browser QA 390/1440 ผ่านหรือมี issue list ที่ยอมรับได้
- [ ] baseline git/CI พร้อม; secret ไม่รั่ว
- [ ] HANDOFF/progress/docs อัปเดตตรงกับผลจริง
- [ ] เจ้าของงานอนุมัติ deploy

## 10. การตัดสินใจที่ต้องขอเจ้าของงาน

1. **Baseline:** อนุญาตให้ commit baseline ของ `web/` หรือใช้ worktree/patch?
2. **Water/prices:** ต้องการ metadata-only หรือ synthetic demo ที่ติดป้ายชัดเจน?
3. **Open-Meteo:** ปิด route ชั่วคราว หรือเปิดเฉพาะ demo หลังมี flag?
4. **D1/Deploy:** มี `CF_D1_TOKEN` และ `cf auth login` พร้อมหรือยัง? ห้ามส่งค่าในแชต
5. **Production:** จะใช้ `workers.dev` ต่อหรือ custom domain หลัง P0 ผ่าน?

## 11. Command cheat sheet

```powershell
# สถานะ repo
git status --short
git log --oneline -10
git ls-files web | Measure-Object -Line

# Python
.venv\Scripts\python.exe -m unittest discover -s tests
.venv\Scripts\python.exe -m unittest tests.test_reservoirs
.venv\Scripts\python.exe -m unittest tests.test_hub_numeric_sync

# Web
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build:vinext
npx --prefix web eslint <files>

# Local web
npm --prefix web run dev -- --port 3124
node scripts/check_local_web.mjs
node scripts/check_web_browser.mjs

# Deploy preflight (ห้าม --deploy จนเจ้าของงานอนุมัติ)
node scripts/deploy_preview.mjs
cf auth whoami
```
