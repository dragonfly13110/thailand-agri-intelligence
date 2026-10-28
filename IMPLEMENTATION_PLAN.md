# Thailand Agricultural Data Hub: Implementation Plan

อัปเดต 28 ตุลาคม 2569: ตรวจรับและรวมกิ่ง `codex/checkpoint-2026-10-28` เข้า local main แล้วที่ repairs commit `2dc527c`; สถานะรวมและผล final gates ให้ยึด [HANDOFF](HANDOFF.md)/[progress](docs/progress.md). การตรวจโค้ดและ local merge แยกจากการอนุญาต push, remote CI, apply migrations, ingest และ deploy. แผน M1–M6 ด้านล่างเก็บประวัติช่วง 25 ต.ค.

## ผลลัพธ์ที่ต้องได้

1. ผู้ใช้ค้นข้อมูลจากหลายหน่วยงาน เห็นแหล่งที่มา เวลา พื้นที่ และข้อจำกัดได้
2. หน้าเว็บใช้ API ของ Hub; ข้อมูลต้นทางเข้าผ่าน API หรือสคริปต์ sync ไม่อ่านไฟล์ตัวเลขใน checkout
3. ตัวเลขเผยแพร่เมื่อมีหลักฐานสิทธิ์ นิยาม และพื้นที่/เวลาที่ชัดเจนเท่านั้น
4. เจ้าหน้าที่เปิดหน้าเว็บบนมือถือและคอมแล้วค้นชุดข้อมูลหรือหลักฐานพื้นที่ได้ แม้บางหมวดยังไม่มีตัวเลข

**เกณฑ์ความสำเร็จ:** catalog ต้องมาจากต้นทางจริงและมีที่มา; หน้าเว็บบอกได้เมื่อไม่มีข้อมูล; ถ้าจะเปิดตัวเลข ต้องเทียบกับต้นทางอย่างน้อยหนึ่ง resource ที่ได้รับอนุญาต การมี API, schema หรือ build ผ่านอย่างเดียวไม่ถือว่าเสร็จ

## สถานะล่าสุดที่บันทึกไว้ ณ 28 ตุลาคม 2569

| ส่วน | สถานะที่บันทึกล่าสุด | หลักฐาน/ขอบเขต |
|---|---|---|
| Runtime และ API | Next.js App Router + vinext/Cloudflare Workers; D1 catalog/numeric store; Python ingest | งาน checkpoint และ repairs ผ่าน gate และรวม local main แล้ว (`2dc527c`); ดู HANDOFF |
| Source registry/catalog | Checkout มี 24 sources; D1 catalog audit เก่า 12 CKAN sources/1,237 datasets/3,777 resources | Registry ไม่เท่ากับผล sync หรือ coverage |
| Numeric data | D1 read-only probe 28 ต.ค.: 9,926 observations/607 locations; CHIRPS partial sample 3 cells | ไม่ใช่ coverage ทั้ง raster; DLD/OAE/CPD ยังไม่มี numeric rows ใหม่ |
| NWP | Audit 27 ต.ค.: `tmd_hpc_d02_2026102606`, 220 snapshots/16,940 province rows; แยกจาก observations | ไม่ query NWP ซ้ำรอบนี้ |
| แดชบอร์ด/API docs | Catalog 21 endpoints รวมฝนรายเดือนและ CSV; browser อ่าน D1 จริงตรวจ monthly rainfall และ CSV download ได้ | DLD แสดง unavailable (404); trade/price-trend แสดง empty ตามข้อมูลจริง; ไม่อ้างว่า annual dashboards พร้อม |
| Rights registry | Checkout มี 91 resources: 13 `approved_public`, 78 `pending` | เป็นสิทธิ์ใน registry ไม่ใช่จำนวน resources ที่มีตัวเลขใน D1; หน่วยที่ยังไม่ยืนยันคง null |
| Sync automation | Workflows อยู่ใน Git; CI/catalog run เก่าที่บันทึกไว้ล้ม | ยังไม่ push หรือรัน remote CI ใหม่; local tests ไม่แทน Actions |
| QA | ผู้คุมและ AI 3 ตรวจอิสระผ่าน Python 836/web 315/typecheck/build; manifest 510/510 ตรง; local merge GO | DLD test-only clock fix ผ่าน 20 รอบ; Python discover ไม่รวม opt-in private integration tests |
| Deployment/production | ยังไม่ deploy/push/apply migrations/ingest รอบนี้ | D1 probe ไม่พบ schema effects ของ 0004–0006; production rollout เป็นงานแยก |

ตัวเลขสดมีขอบเขตตามรายงาน AI 1–3 และ HANDOFF/progress วันที่ 28 ต.ค.; ส่วน M1–M6 เก็บหลักฐานย้อนหลัง. `records_written` ของ catalog dry-run เป็น metadata records ไม่ใช่ observations

## งาน AI 5–7 ที่รวมอยู่ใน repo (27 ตุลาคม 2569)

งานด้านล่างถูกรวมใน repo ตาม HANDOFF วันที่ 27 ต.ค.; ผล local tests/typecheck/build ที่รายงานไว้ไม่เท่ากับ production acceptance. รายละเอียด ownership/acceptance อยู่ใน [prompts AI 5–7](docs/assignments/2026-10-27-new-features-agents-5-7.md)

- [x] AI 5: `/data-status` ใช้ sources/status APIs แสดงรอบดึงข้อมูลและที่มา แยก metadata/numeric และมีลิงก์จาก `/open-data`; local link ตรวจได้ตาม HANDOFF แต่ flow กับ D1/production ยังไม่ตรวจ
- [x] AI 6: CSV export หนึ่ง active public resource ผ่าน `/explore` จำกัด 1,000 rows พร้อม version/provenance/partial status; browser playground ที่อ่าน D1 จริงยืนยัน download event และไฟล์ CHIRPS sample แล้ววันที่ 28 ต.ค. ไม่ใช่ production deployment ใหม่
- [x] AI 7: `/monthly-rainfall` และ API แบบ station × month; browser playground ที่อ่าน D1 จริงได้ 131 stations/71 จังหวัดที่มีสถานีรายงาน คง grain และหน่วย pending ไม่อ้าง coverage จังหวัดทั้งหมด

- [x] API catalog มี monthly-rainfall/CSV และทั้ง 21 documented paths มี route modules จริง
- [x] ตรวจ desktop 1440/mobile 390 ของ livestock/trade/api-docs/price-trend และ CSV download จริง (BOM/34 columns/3 partial rows/provenance); suggest/date-prefill/typed-approved-empty follow-up ผ่าน browser รอบสุดท้ายแล้ว
- [ ] Deploy และตรวจ production หลังได้รับอนุญาต; ยังไม่ทำรอบนี้

Final source-freeze gates และ local merge ให้ยึดสถานะล่าสุดใน HANDOFF; browser download ข้างบนไม่ยืนยัน annual data rollout หรือ live PostgreSQL

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
