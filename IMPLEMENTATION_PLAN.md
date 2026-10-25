# Thailand Agricultural Data Hub: Implementation Plan

อัปเดต 25 ตุลาคม 2569 เวลา 02:52 น. ICT ตาม [handoff](HANDOFF.md). เป้าหมายช่วงแรกยังเป็น catalog metadata จาก API ต้นทางเข้า Cloudflare D1 แล้วเปิดค้นผ่านเว็บ โดยไม่อ่าน raw ในเครื่อง

## ผลลัพธ์ที่ต้องได้

1. ผู้ใช้ค้นข้อมูลจากหลายหน่วยงาน เห็นแหล่งที่มา เวลา พื้นที่ และข้อจำกัดได้
2. หน้าเว็บใช้ API ของ Hub; ข้อมูลต้นทางเข้าผ่าน API หรือสคริปต์ sync ไม่อ่านไฟล์ตัวเลขใน checkout
3. ตัวเลขเผยแพร่เมื่อมีหลักฐานสิทธิ์ นิยาม และพื้นที่/เวลาที่ชัดเจนเท่านั้น
4. เจ้าหน้าที่เปิดหน้าเว็บบนมือถือและคอมแล้วค้นชุดข้อมูลหรือหลักฐานพื้นที่ได้ แม้บางหมวดยังไม่มีตัวเลข

**เกณฑ์ความสำเร็จ:** catalog ต้องมาจากต้นทางจริงและมีที่มา; หน้าเว็บบอกได้เมื่อไม่มีข้อมูล; ถ้าจะเปิดตัวเลข ต้องเทียบกับต้นทางอย่างน้อยหนึ่ง resource ที่ได้รับอนุญาต การมี API, schema หรือ build ผ่านอย่างเดียวไม่ถือว่าเสร็จ

## สถานะที่ตรวจแล้ว ณ 25 ตุลาคม 2569

| ส่วน | สถานะที่ตรวจได้ | หลักฐาน |
|---|---|---|
| API contract และฐาน | มี JSON Schema; D1 `tadih-hub` สร้างใน APAC และ apply schema 6 ตาราง/7 index; มี catalog metadata ที่ sync แล้ว | `data_contracts/hub-api.schema.json`, `db/cloudflare/0001_hub.sql`, [M2 audit](docs/m2-sync-audit.md) |
| API v1 | มี routes สำหรับ source, catalog, detail, record, series, observation, area และ sync status | `web/app/api/v1/` |
| Catalog ต้นทาง | D1 read-only audit พบ 12 sources และ 1,237 datasets แบบ `metadata_only`; local CKAN fallback เดิมยังมีเพดาน NABC 300/591 | [M2 audit](docs/m2-sync-audit.md), `web/lib/hub/source-fallback.ts` |
| Catalog sync | Python sync รองรับ D1 sink; D1 มี 19 sync runs และ latest run ของ 12 sources สำเร็จ. Workflow ยัง untracked และ GitHub secret/schedule run ยังไม่ตรวจ | `src/tadih/hub_catalog_sync.py`, `scripts/sync_hub_catalog.py`, [workflow review](docs/m2-workflow-review.md) |
| เว็บ | catalog, explorer, ราคา และจังหวัดต่อ `/api/v1`; legacy local-data routes ถูกถอดแล้ว | `web/app/`, `web/components/` |
| ฐานกลางและ schedule | D1 มี 12 sources, 1,237 datasets, 3,777 resources และ 19 sync runs; ไม่มี observations. Workflow มีใน working tree แต่ยัง untracked และยังไม่ยืนยัน secret หรือ run บน GitHub | [M2 audit](docs/m2-sync-audit.md), `.github/workflows/sync-hub-catalog.yml` |
| Numeric rights/data | ทะเบียน 72 resources มี CHIRPS exact file หนึ่งรายการ `approved_public` และ 71 `pending`; source comparison ผ่าน 3 cells แต่ยังไม่มี active D1 run หรือ numeric API output | `config/resource_licenses.json`, [M5 sample](docs/m5-chirps-sample.md) |
| Preview | มี Workers Preview ที่ตรวจแล้วสำหรับ code รุ่นก่อน M3/M5; checkout ปัจจุบันยังต้อง deploy และตรวจซ้ำเมื่อ `cf` CLI auth พร้อม | [HANDOFF](HANDOFF.md), [preview QA](docs/preview-browser-qa.md) |

`records_written` ใน dry-run คือจำนวน metadata records ที่เตรียมเขียน ไม่ใช่จำนวน observation ตัวเลข ดูผลและเวลาตรวจล่าสุดใน [HANDOFF](HANDOFF.md)

## ลำดับลงมือ

### M1: เปิด catalog preview

- [x] ต่อหน้าเว็บเข้ากับ `/api/v1` และทำ empty/metadata-only state
- [x] เปิด catalog fallback จาก API ต้นทาง 12 CKAN sources และตรวจ desktop: ค้น catalog → รายละเอียดชุด
- [x] ตรวจ catalog และ detail บน mobile viewport 390x844; ไม่มี horizontal overflow
- [x] Deploy preview ของ catalog ให้ผู้ใช้ลอง; Cloudflare Workers preview ตอบ API/หน้าเว็บตามหลักฐานใน [handoff](HANDOFF.md); ตัวเลขยังปิดและระบุเป็น metadata-only

**รับงานได้เมื่อ:** ค้นพบรายการจากต้นทางจริง, เปิดรายละเอียดและย้อนกลับได้, ลิงก์ไปต้นทางทำงาน, ไม่มีการอ้างว่ามีตัวเลข/coverage ที่ยังไม่มี

**ไฟล์หลัก:** `web/app/`, `web/components/`, `web/lib/hub/source-fallback.ts`, `web/README.md`

### M2: เชื่อม Cloudflare D1 และบันทึก catalog

- [x] สร้าง D1 `tadih-hub` ใน APAC โดยไม่แก้ฐาน Cloudflare เดิม
- [x] Apply `db/cloudflare/0001_hub.sql` แล้ว; เพิ่ม binding `DB` ใน `web/cloudflare.config.ts`
- [x] เพิ่ม D1 catalog repository ให้เว็บอ่าน sources, datasets, detail และสถานะจาก SQLite; อย่าใช้ `pg.Pool`/PostgreSQL SQL บน Workers
- [x] เพิ่ม D1 sink ให้ Python sync ส่ง metadata ที่ normalize แล้ว; live audit พบ sync runs จริง 12 แหล่งและ resources ทั้งหมดยัง pending
- [ ] ให้ GitHub Actions เรียก sync ตามรอบโดยใช้ secret; workflow มีใน working tree แต่ยัง untracked และยังไม่ได้ยืนยัน secret หรือ run บน GitHub
- [x] Sync catalog 12 แหล่งและอ่าน `/api/v1/datasets`/source status จาก D1; ตรวจพบ 1,237 datasets และ latest run สำเร็จครบ 12 แหล่ง
- [x] ตรวจ retry/upsert ไม่สร้างรายการซ้ำและ failed run ไม่ลบข้อมูลเดิมด้วย targeted tests และ audit D1 read-only

**รับงานได้เมื่อ:** มี `sync_runs` ที่อ้างแหล่งและเวลาจริง, catalog อ่านจาก D1, รายการ pending แสดงได้เฉพาะ metadata

**ไฟล์หลัก:** `db/cloudflare/0001_hub.sql`, `src/tadih/hub_catalog_sync.py`, `scripts/sync_hub_catalog.py`, `web/lib/hub/`, `web/cloudflare.config.ts`, `.github/workflows/sync-hub-catalog.yml`

### M3: เพิ่ม catalog จากแหล่งอื่น

- [x] รวม CKAN 12 แหล่งใน `config/sources.json`, API fallback และ dry-run sync; รวม 1,399 metadata packages ในผลตรวจรอบนี้
- [x] บันทึก URL/API, pagination, ข้อจำกัด, วันที่ตรวจ และ license metadata สำหรับแหล่ง CKAN 12 แห่ง; รายงานรายแหล่งอยู่ใน `docs/source-expansion-*.md` และ `docs/doae-acquisition-audit.md`
- [ ] ทำ source APIs เพิ่มจากงานสำรวจใน [source-expansion-api.md](docs/source-expansion-api.md); ตรวจสิทธิ์และความพร้อมแยกจาก metadata discovery
- [x] ให้ catalog ระบุ complete/partial/unknown จากผล metadata fetch; แยกจาก availability/access และคง `unavailable` ไว้ใน source status. Local regression 2/2 ผ่าน; preview หลังแก้ยังไม่ตรวจ.

**รับงานได้เมื่อ:** catalog มี source ID คงที่, source URL ย้อนถึงเจ้าของ, pagination ไม่ซ้ำ/ขาดเงียบ และ error มีสถานะให้ผู้ใช้เข้าใจ

**แบ่งงานขนานได้:** งานสำรวจแต่ละหน่วยงานเขียนไฟล์ของตนใน `docs/source-expansion-<source>.md`; การแก้ `config/sources.json`, sync entry point และ API contract ให้ coordinator รวมทีละชุดเพื่อกัน conflict

### M4: เลือกและอนุมัติตัวเลขแรก

- [x] ตรวจ CHIRPS v3.0 Daily final RNL exact file วันที่ 2026-09-30 จากหน้า CHC และ response metadata; สิทธิ์ public domain/CC BY 4.0 ลงทะเบียนพร้อม attribution ใน `config/resource_licenses.json`
- [x] ยืนยันนิยาม daily RNL, หน่วย total mm/time step, grid-cell × UTC-date, EPSG:4326/0.05°, วันข้อมูล และ ETag/Last-Modified จากเอกสาร/metadata; ดู [M4 resource audit](docs/m4-chirps-resource.md)
- [x] อัปเดต `config/resource_licenses.json` สำหรับ exact file นี้เท่านั้น; resources อื่นคง `pending`

**M4 ผ่านหนึ่ง exact CHIRPS file เท่านั้น.** ในทะเบียน 72 รายการมี 1 `approved_public` และอีก 71 `pending`; M5 อ่านและเทียบ source values 3 cells ด้วย ETag-pinned ranges แล้ว แต่ยังไม่มี D1 active run หรือ public numeric API output. งานสิทธิ์แหล่งอื่นทำขนานกับ M1–M3 ได้

### M5: ทำ numeric vertical slice หนึ่งชุด

- [x] เพิ่ม bounded CHIRPS reader/job ที่อ่าน 3 verification cells ผ่าน HTTP ranges; ไม่เก็บ raster ถาวร. Envelope ระบุ `partial/sample_only`, ไม่อ้าง coverage ทั้งไฟล์.
- [x] ตรวจ schema, duplicate key, null, unit, revision และ source grain; writer อ่าน bounded sample ใหม่เอง, ไม่รับ caller-supplied observations, และ preserves D1-side publication revocation. Focused SQLite tests ผ่าน 9/9.
- [ ] เขียน live D1 และตรวจ active run/3 observations แบบ read-only; runner token ปัจจุบันถูกปฏิเสธ `D1_UNAUTHORIZED`.
- [x] เปลี่ยน active batch หลังเขียนครบ sample; failure injection ยืนยัน active batch เดิมยังอยู่และ run ใหม่เป็น failed. ทดสอบด้วย SQLite mock เท่านั้น.
- [x] ต่อ records/series/observations routes และ Explorer ให้รู้จัก active `partial` sample; แสดง source, unit, grid grain, data date, source retrieval time และ partial warning. Typecheck/build ผ่าน; deployment/API/UI live ยัง pending.
- [x] เทียบ 3 cells จากไฟล์ต้นทางโดย ETag-pinned ranges; บันทึก URL, วันข้อมูล, ETag, retrieval time และค่าตัวอย่างใน [M5 sample](docs/m5-chirps-sample.md).

**ไฟล์หลัก:** ระบุหลังเลือกรายการ M4; ใช้ parser ที่มีใน `src/tadih/` ก่อนเพิ่มตัวใหม่, `scripts/`, `web/lib/hub/numeric-repository.ts` และ `web/components/price-trend.tsx` หรือหน้าเฉพาะชุดนั้น

**สถานะ M5:** source comparison และ local implementation ใช้ได้กับ verification sample 3 cells เท่านั้น; writer อ่าน source ใหม่เองและคง D1-side revocation, ผ่าน focused tests 9/9. Active live D1 run และ preview acceptance ยังไม่เกิดเพราะ runner token ถูกปฏิเสธและ `cf` CLI ยังไม่มี auth. Preview ปัจจุบันเป็น code ก่อน M3/M5. ห้ามแสดง sample นี้เป็น complete หรือเป็น coverage ของทั้ง raster.

### M6: ตรวจ preview และเปิดใช้งาน

- [x] ตรวจ desktop flow ค้น catalog → รายละเอียด → กลับหน้าค้น, ป้ายสิทธิ์ และ keyboard focus บน preview; ผลอยู่ใน `docs/preview-browser-qa.md`
- [x] ตรวจ mobile viewport 390×844, flow search/detail/back, horizontal overflow และ console warnings/errors บน preview
- [x] ตรวจ network trace ของ subresources ด้วย Chrome CDP บน isolated headless profile; 54 responses เป็น HTTP 200 และไม่มี failed request หรือ console warning/error
- [x] Deploy preview และบันทึก URL, เวลา, แหล่งข้อมูลและข้อจำกัดไว้ใน [handoff](HANDOFF.md) และ `docs/preview-browser-qa.md`
- [ ] ค่อยตัดสินใจ production หลังยืนยัน hosting, database, ต้นทุนและสิทธิ์ของข้อมูลที่จะเผย

Preview ข้างต้นเป็นรุ่นก่อน M3/M5; การ deploy checkout ปัจจุบันรอ `cf auth login`. `scripts/deploy_preview.mjs` ตรวจ auth ผ่าน `cf` CLI และไม่อ่าน/แสดง token.

## วิธีส่งงานให้ AI หลายค่าย

ก่อนเริ่มให้อ่าน `AGENTS.md`, `SYSTEM_DESIGN.md`, ไฟล์ใน task และ `HANDOFF.md`; ตรวจ `git status` แล้วเก็บงานเดิมไว้ เลือก task ID เดียวต่อ AI ระบุไฟล์ที่แก้ได้ชัดเจน ห้ามแก้ shared contract/registry พร้อมกันหลายตัว

ข้อความมอบงาน:

> ทำ Thailand Agricultural Data Hub งาน M[เลข] ตาม `IMPLEMENTATION_PLAN.md` เท่านั้น อ่าน `AGENTS.md`, `SYSTEM_DESIGN.md` และ `HANDOFF.md` ก่อนแก้ ยึด `data_contracts/hub-api.schema.json` และ `db/hub-schema.sql`; ไม่อ่าน/คัดลอก `data/local` หรือ `exports/private` เข้าเว็บ ไม่เปิด resource ที่สิทธิ์ pending และคง null/source grain/revision ส่ง diff, ไฟล์ที่แก้, source URL/หลักฐานสิทธิ์ถ้ามี, วิธีตรวจสั้นหนึ่งอย่างและผลจริง, ข้อค้าง ให้ coordinator; อย่ารันชุดทดสอบทั้ง repo หรือ claim deploy หากไม่ได้ทำจริง

### การขนานงาน

| ทำพร้อมกันได้ | ต้องรอ/รวมทีละงาน |
|---|---|
| สำรวจ API หน่วยงานละหนึ่ง source ลงเอกสารแยก | แก้ schema/API contract หรือ `config/sources.json` |
| ตรวจหน้าตาและ usability บน browser ขณะงาน catalog sync | Apply DB schema และเปลี่ยนฐาน/credential |
| ตรวจสิทธิ์ของ resource candidate คนละรายการ | แก้ `hub_catalog_sync.py` หรือ workflow ร่วมหลาย source |
| ทำ source-specific adapter หลัง contract พร้อมและ source แยกไฟล์ | เปลี่ยน active numeric batch และ API response |

## ตรวจเท่าที่จำเป็น

- Python connector เปลี่ยน: รัน dry-run/API call ที่จำกัดหน้าและเทียบผลหนึ่งครั้ง
- API เปลี่ยน: เรียก endpoint ที่แก้หนึ่งครั้ง ตรวจ status และ error/empty shape
- หน้าเว็บเปลี่ยน: คลิก flow ที่แก้บน desktop และ mobile
- ไม่รัน suite ทั้ง repo เว้นแต่เปลี่ยน schema/contract กลางหรือผู้ดูแลงานขอ

เก็บผลใน [HANDOFF](HANDOFF.md) และ [progress](docs/progress.md); แยก API/source check, browser, build, preview และ production ว่าอันใดตรวจแล้วจริง
