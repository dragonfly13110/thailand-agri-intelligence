# Thailand Agricultural Data Hub: Implementation Plan

อัปเดตสถานะ 27 ตุลาคม 2569 โดยอ้างอิง `main` commit `14026f0`, [handoff](HANDOFF.md) และ [progress](docs/progress.md). แผน M1–M6 ด้านล่างเก็บประวัติการวางงานช่วง 25 ต.ค.; ให้ตรวจตารางสถานะปัจจุบันก่อนทำงานต่อ

## ผลลัพธ์ที่ต้องได้

1. ผู้ใช้ค้นข้อมูลจากหลายหน่วยงาน เห็นแหล่งที่มา เวลา พื้นที่ และข้อจำกัดได้
2. หน้าเว็บใช้ API ของ Hub; ข้อมูลต้นทางเข้าผ่าน API หรือสคริปต์ sync ไม่อ่านไฟล์ตัวเลขใน checkout
3. ตัวเลขเผยแพร่เมื่อมีหลักฐานสิทธิ์ นิยาม และพื้นที่/เวลาที่ชัดเจนเท่านั้น
4. เจ้าหน้าที่เปิดหน้าเว็บบนมือถือและคอมแล้วค้นชุดข้อมูลหรือหลักฐานพื้นที่ได้ แม้บางหมวดยังไม่มีตัวเลข

**เกณฑ์ความสำเร็จ:** catalog ต้องมาจากต้นทางจริงและมีที่มา; หน้าเว็บบอกได้เมื่อไม่มีข้อมูล; ถ้าจะเปิดตัวเลข ต้องเทียบกับต้นทางอย่างน้อยหนึ่ง resource ที่ได้รับอนุญาต การมี API, schema หรือ build ผ่านอย่างเดียวไม่ถือว่าเสร็จ

## สถานะปัจจุบันที่บันทึกไว้ ณ 27 ตุลาคม 2569

| ส่วน | สถานะที่บันทึกล่าสุด | หลักฐาน/ขอบเขต |
|---|---|---|
| Runtime และ API | Next.js App Router + vinext บน Cloudflare Workers; D1 เป็น catalog/numeric store; Python ใช้ดึงและ normalize | `web/`, `src/tadih/`, `web/app/api/v1/` |
| Source registry/catalog | `config/sources.json` มี 23 sources; D1 catalog audit ก่อนหน้านี้มี 12 CKAN sources, 1,237 datasets และ 3,777 resources | Catalog counts เป็น metadata discovery ไม่ใช่ numeric availability/coverage |
| Numeric data | Read-only D1 audit 27 ต.ค. ยืนยัน 9,926 observations; เพิ่ม CHIRPS exact-file verification run `dc6fb992-bf3e-543b-9385-a9fa9ca946b1` แบบ `partial` 3 grid cells. `/water` มี RID 461 อ่าง; `/weather/observations` มี TMD 37 สถานีและ ERA5 10 จุดกริด × 30 วัน | D1 count และ active CHIRPS run ตรวจสดหลัง sync; CHIRPS เป็น `sample_only`, ไม่ใช่ coverage ทั้ง raster |
| NWP | Run `tmd_hpc_d02_2026102606` สถานะ `ready`, 220/220 snapshots และ 8,657 province values; แยกจาก `observations` | `scripts/sync_tmd_hpc_nwp.py`, `db/cloudflare/0003_nwp.sql` |
| แดชบอร์ดรอบ 3 | `/prices` อ่านราคาจริง NABC daily; `/water` มี RID 461 อ่าง; `/early-warning` มี 288 สัญญาณ RID/GISTDA; soil มี 7 ชุดดินอ้างอิงที่ยืนยัน. `/weather`, `/trade`, `/climate-history`, `/crop-evidence` และ G1/G2 ยัง sample/metadata-only ตาม source availability | Trade ยังไม่มี numeric records ที่อนุมัติ; forecast จริงแยกอยู่ที่ `/nwp`; คะแนนเตือนเป็นเกณฑ์ภายใน ไม่ใช่ประกาศภัยทางการ; sample ไม่ถูกนับเป็น coverage |
| Rights registry | 89 resources: 10 `approved_public`, 79 `pending`; owner authorization บันทึกใน `AGENTS.md`. NWP API projects `approved_public` จาก registry แต่ D1 run row เดิมยัง pending; unit status ยัง pending และ unit/risk ยังคง null | `config/resource_licenses.json`, `AGENTS.md`, `/api/v1/nwp/runs` |
| Sync automation | `ci.yml`, `discover-sources.yml`, `sync-hub-catalog.yml`, `sync-hub-numeric.yml` อยู่ใน Git; ยังไม่ยืนยัน secrets/ผลรันล่าสุดของ GitHub Actions | `.github/workflows/` |
| QA | Web typecheck ผ่าน, tests 163/163 และ Preview production build สำเร็จ; focused Python NWP tests 69/69. Full Python CI run เดิมยัง fail (661 tests, failures 3, errors 20, skipped 3) | รายละเอียดและ run `40366465177` อยู่ใน HANDOFF |
| Deployment/quota | Preview deployment `761a2138-5608-46c9-affa-de32cafab964` ตอบ 200 บน 9 API smoke routes; หลังเขียน CHIRPS แล้ว records/series Preview API ส่ง 3 observations พร้อม `approved_public` + `partial`. NWP ยังไม่ยืนยันหน่วย. Scheduled catalog sync run หยุดเพราะขาด repository secret | [HANDOFF](HANDOFF.md); ยังไม่ได้ redeploy การเปลี่ยน working tree ล่าสุด |

ตัวเลขข้างต้นมาจากสถานะล่าสุดใน repo ไม่ใช่การตรวจ D1/API สด. `records_written` ใน dry-run ของ catalog หมายถึง metadata records ที่เตรียมเขียน ไม่ใช่ observations

## งานใหม่ที่เตรียมให้ AI 5–7 (27 ตุลาคม 2569)

ผู้ใช้ขอคำสั่งสำหรับสร้างงานใหม่ระหว่าง AI 1–4 ทำงานแก้ audit โดยยังไม่ให้ตรวจผลงานที่กำลังทำอยู่ งานด้านล่างเป็นรายการมอบหมายที่เตรียมไว้ ยังไม่ได้ยืนยันว่า implement/test/deploy แล้ว รายละเอียด ownership/acceptance อยู่ใน [prompts AI 5–7](docs/assignments/2026-10-27-new-features-agents-5-7.md)

- [ ] AI 5: `/data-status` ใช้ sources/status APIs เดิม แสดงรอบดึงข้อมูลสำเร็จ/ล้มเหลว/unknown พร้อมที่มาและเวลาที่แยก metadata/numeric มีลิงก์จาก `/open-data`
- [ ] AI 6: CSV export สำหรับหนึ่ง active public resource ผ่าน `/explore` จำกัด 1,000 rows พร้อม version/provenance/partial status และป้องกันข้อมูลต่าง run ปนกัน ไม่เปิดทุกชุดแบบ bulk download
- [ ] AI 7: `/monthly-rainfall` และ read API จาก TMD station × month ที่มีอยู่ ใช้ builder เดิม มีลิงก์จาก `/weather` คง null/หน่วย pending/ช่วงเวลาจริง ไม่อ้างประวัติ 10–20 ปีหรือค่าเฉลี่ยจังหวัด

เอกสารกลาง/API catalog/CI/build และการรับรวมเป็นหน้าที่ผู้รวมงานภายหลัง ไม่ให้ AI 5–7 เปลี่ยน shared files ของ AI 1–4 ไม่มีการสร้าง agent หรือรันตรวจแอปจากการเพิ่มแผนส่วนนี้

## ประวัติแผน M1–M6 (snapshot 25 ตุลาคม 2569)

Checklist ด้านล่างเก็บการวางงานและผลตรวจในรอบเริ่มต้นไว้เป็นประวัติ; สถานะ numeric data, workflow tracking และ deployment ที่ขัดกับ snapshot เก่าให้ยึดตารางปัจจุบันและ [HANDOFF](HANDOFF.md)

### ลำดับ milestone เดิม

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
- [x] เพิ่ม D1 sink ให้ Python sync ส่ง metadata ที่ normalize แล้ว; audit ในรอบ M2 พบ 12 แหล่งและ resources ยัง pending ณ เวลานั้น (สถานะปัจจุบันคือ 89 resources: 10 approved, 79 pending)
- [x] เพิ่มและ track GitHub Actions workflows สำหรับ catalog และ numeric sync; การยืนยัน repository secrets และ run สำเร็จบน GitHub ยังเป็นงานค้าง
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
- [x] อัปเดต `config/resource_licenses.json` สำหรับ exact file นี้เท่านั้น; resources อื่นยัง pending ณ snapshot 25 ต.ค. (registry ปัจจุบันเปลี่ยนเป็น 10 approved, 79 pending)

**บันทึก M4 ณ 25 ต.ค.:** ผ่านหนึ่ง exact CHIRPS file. ทะเบียนปัจจุบันมี 89 รายการ (10 `approved_public`, 79 `pending`) ตามตารางสถานะด้านบน; M5 CHIRPS sample เป็นสถานะเฉพาะ resource นั้น ไม่ใช่สถานะรวมของ numeric feeds ที่ publish ภายหลัง

### M5: ทำ numeric vertical slice หนึ่งชุด

- [x] เพิ่ม bounded CHIRPS reader/job ที่อ่าน 3 verification cells ผ่าน HTTP ranges; ไม่เก็บ raster ถาวร. Envelope ระบุ `partial/sample_only`, ไม่อ้าง coverage ทั้งไฟล์.
- [x] ตรวจ schema, duplicate key, null, unit, revision และ source grain; writer อ่าน bounded sample ใหม่เอง, ไม่รับ caller-supplied observations, และ preserves D1-side publication revocation. Focused SQLite tests ผ่าน 9/9.
- [x] CHIRPS sample เฉพาะ resource นี้: เขียน live D1 และตรวจ active run/3 observations แบบ read-only; run `dc6fb992-bf3e-543b-9385-a9fa9ca946b1` เป็น `partial`, active pointer ถูกต้อง, และ Preview records/series API คืน 3 observations. เพิ่มโหลด `.env` ก่อนสร้าง D1 client หลังพบ CLI ใช้ Wrangler OAuth token เก่าที่ถูกปฏิเสธ `D1_UNAUTHORIZED`.
- [x] เปลี่ยน active batch หลังเขียนครบ sample; failure injection ยืนยัน active batch เดิมยังอยู่และ run ใหม่เป็น failed. ทดสอบด้วย SQLite mock เท่านั้น.
- [x] ต่อ records/series/observations routes และ Explorer ให้รู้จัก active `partial` sample; แสดง source, unit, grid grain, data date, source retrieval time และ partial warning. Typecheck/build ผ่าน; deployment/API/UI live ยัง pending.
- [x] เทียบ 3 cells จากไฟล์ต้นทางโดย ETag-pinned ranges; บันทึก URL, วันข้อมูล, ETag, retrieval time และค่าตัวอย่างใน [M5 sample](docs/m5-chirps-sample.md).

**ไฟล์หลัก:** ระบุหลังเลือกรายการ M4; ใช้ parser ที่มีใน `src/tadih/` ก่อนเพิ่มตัวใหม่, `scripts/`, `web/lib/hub/numeric-repository.ts` และ `web/components/price-trend.tsx` หรือหน้าเฉพาะชุดนั้น

**สถานะ M5 เฉพาะ CHIRPS:** source comparison และ local implementation ใช้กับ verification sample 3 cells; writer อ่าน source ใหม่เองและคง D1-side revocation. วันที่ 27 ต.ค. D1 read-only ยืนยัน observations รวม 9,926 และ CHIRPS active run ข้างต้น; Preview records API คืน 3 แถว (`availability=ready`, `access=approved_public`, `completeness=partial`, `dataAsOf=2026-09-30`) และ series API คืนหนึ่ง series/3 observations. `python -m unittest tests.test_hub_numeric_sync` ผ่าน 10/10. ห้ามแสดง sample 3 cells นี้เป็น complete หรือ coverage ของทั้ง raster; browser UI review และ redeploy ของ working tree ล่าสุดยังไม่ทำ.

### M6: ตรวจ preview และเปิดใช้งาน

- [x] ตรวจ desktop flow ค้น catalog → รายละเอียด → กลับหน้าค้น, ป้ายสิทธิ์ และ keyboard focus บน preview; ผลอยู่ใน `docs/preview-browser-qa.md`
- [x] ตรวจ mobile viewport 390×844, flow search/detail/back, horizontal overflow และ console warnings/errors บน preview
- [x] ตรวจ network trace ของ subresources ด้วย Chrome CDP บน isolated headless profile; 54 responses เป็น HTTP 200 และไม่มี failed request หรือ console warning/error
- [x] Deploy preview และบันทึก URL, เวลา, แหล่งข้อมูลและข้อจำกัดไว้ใน [handoff](HANDOFF.md) และ `docs/preview-browser-qa.md`
- [ ] ค่อยตัดสินใจ production หลังยืนยัน hosting, database, ต้นทุนและสิทธิ์ของข้อมูลที่จะเผย

Preview ที่ตรวจใน M6 เป็นรุ่นก่อนงาน M3/M5. เมื่อ 27 ต.ค. 2569 deploy working tree ขึ้น Preview (`761a2138-5608-46c9-affa-de32cafab964`) และ API smoke checks ผ่าน; NWP API ใช้สิทธิ์จาก registry เป็น `approved_public`, แต่หน่วยยังไม่ยืนยันและ D1 run row เดิมยัง pending เพราะไม่ได้เขียน D1. `scripts/deploy_preview.mjs` ตรวจ auth ผ่าน `cf` CLI โดยไม่พิมพ์ token.

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
