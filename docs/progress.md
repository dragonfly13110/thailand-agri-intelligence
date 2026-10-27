# ความคืบหน้า

อัปเดต 27 ตุลาคม 2569 เวลา 16:38 น. ICT — รวมและตรวจงาน AI 1–7; แยกสถานะรอบล่าสุดจากเวลา/ข้อผิดพลาดของรอบล่าสุดที่เปิดเผยได้ในหน้าสถานะแหล่งข้อมูล. Web tests 248/248 และ typecheck ผ่าน; vinext build ผ่านหลังแก้. Python 680 tests มี failures 3/errors 11/skipped 1 โดย 14 รายการตรง baseline เดิม. Local preview คลิกลิงก์ไปหน้า status และฝนรายเดือนได้ แต่ไม่มีคลังข้อมูลกลาง จึงยังไม่ยืนยัน flow ข้อมูลจริง/mobile/CSV. API catalog ยังไม่รวม endpoint ใหม่ทั้งสอง; ไม่ deploy หรือเขียน D1

อัปเดต 27 ตุลาคม 2569 เวลา 16:00 น. ICT — แก้ข้อพบ AI 1–4 ทั้ง 4 จุด: ป้องกัน NWP เขียนซ้อน/ล้าง child ที่หายไปตาม revision และตรวจ identity, early-warning น้ำท่วมไม่มีหลักฐานเป็น null/ไม่ทราบ, unknown price category ไม่เรียก probe. Python NWP 119 และ web targeted 87 ผ่าน, typecheck เฉพาะขอบเขตแก้ผ่าน; D1 read-only และ TMD HEAD ตอบกลับ; component fixture desktop/mobile ผ่าน. Build ผ่านในสำเนาทดสอบที่ตัดงาน AI 5/6 และแก้ syntax ของ lane ฝนรายเดือนเฉพาะสำเนา; typecheck สำเนายังพบ 2 type errors ใน lane ฝนรายเดือน; checkout จริงยังมีงานขนานและยังไม่ยืนยัน build/typecheck ทั้งหมด. Python full ไม่ได้รันซ้ำ (รอบตรวจก่อนหน้ามี 14 failures/errors ตรง baseline); ไม่เขียน D1/commit/push/deploy. รับต่อรวม AI 5–7 แล้วตรวจ build และ UI จริง

อัปเดต 27 ตุลาคม 2569 เวลา 15:40 น. ICT — รับตรวจงาน AI 1–4: Python targeted 212 และ web 180/180 ผ่าน, typecheck/build:vinext ผ่าน; Python full 676 มี 3 failures/11 errors/1 skipped ตรง 14 ชื่อ baseline เดิม. Local API prices filter และ early-warning null ผ่านกรณีที่ตรวจ. พบข้อค้างที่ทำซ้ำ: **P1** NWP publishers คนละเวอร์ชันของ run เดียวกันเขียนซ้อนแล้วข้อมูลปนแต่ retry ถูก skip; **P2** NWP export รุ่นใหม่เก็บแถวจังหวัดที่ถูกถอดไว้; **P2** early-warning ที่มี heat อย่างเดียวแสดง flood score 0/normal ทั้งที่ไม่มีหลักฐาน; **P3** unknown price category เมื่อเปิด probe ยังเรียก catalogue แต่ warning บอกไม่มี request. ดู [review](review-ai-1-4-2026-10-27.md). Browser UI acceptance ยังไม่ผ่านเพราะ Next dev Fast Refresh ซ้ำ/Playwright timeout; พบ AI 5/6 ยังแก้ไฟล์อยู่จึงปิด server. ไม่แก้แอป/เขียน D1/commit/push/deploy

อัปเดต 27 ตุลาคม 2569 เวลา 15:00 น. ICT — ผู้ใช้ให้เตรียมคำสั่ง AI 5–7 สำหรับสร้างงานใหม่โดยยังไม่ตรวจงาน AI 1–4 จัด [prompts ใหม่](assignments/2026-10-27-new-features-agents-5-7.md) และ checklist ใน IMPLEMENTATION_PLAN: หน้าสถานะแหล่งข้อมูล, CSV export ที่มี provenance/ขอบเขต, ฝนรายเดือนจากสถานีจริง. กำหนดไฟล์/ทางเข้า/acceptance แยกจาก 4 lanes เดิม; API catalog/CI/รับรวมคงไว้รอบท้าย. รอบนี้เป็นเอกสารคำสั่ง ไม่ได้เริ่ม agent หรือแก้แอป/เรียก API/เขียน D1/รันทดสอบ/ตรวจงานเก่า/Deploy

อัปเดต 27 ตุลาคม 2569 เวลา 13:46 น. ICT — จัด [prompts AI 4 ตัว](assignments/2026-10-27-audit-repair-4-agents.md) สำหรับ audit bugs 1–7 ตาม file ownership ที่ไม่ซ้ำกัน: writer, NWP, early-warning และราคา. แต่ละตัวส่ง lane report ของตน; เอกสารกลาง/CI/lint/full validation เป็นหน้าที่ผู้รวมงานหลังงานขนานจบ. ข้อ 8 CI ยังเป็นงานค้าง. รอบนี้เป็นเอกสารคำสั่งเท่านั้น ไม่ได้เรียก agent หรือแก้ production code/ฐานข้อมูล/Deploy; ตรวจ ownership และ whitespace โดยไม่รันชุดทดสอบแอปซ้ำ

อัปเดต 27 ตุลาคม 2569 เวลา 13:14 น. ICT — ตรวจทั้งโปรเจคแบบ audit พบ 7 data/logic bugs ที่ทำซ้ำได้ + 1 CI fixture/web-validation gap; รายละเอียดใน [project-audit-2026-10-27.md](project-audit-2026-10-27.md). Python discover 666: 651 pass, 3 failures, 11 errors, 1 skipped; web tests 162/162 และ typecheck/build:vinext/offline build+verify ผ่าน; lint ไม่ผ่าน (source-only 8 errors/31 warnings). Local API 29 paths, meta schema 25 responses, browser 6 หน้าที่ desktop/mobile ไม่มี overflow/pageerror และเทียบ RID 100 rows กับต้นทางตรงทุกค่า. Read-only D1 ล่าสุด: NWP ready 220 snapshots/16,940 province rows ครบ 77 ต่อ snapshot (ใหม่กว่ายอด 8,657 ในบันทึกเก่า). ไม่แก้ application code ไม่เขียน D1 ไม่ commit/push/deploy; logs/repro ที่ `.tmp_qa/audit-20261027/` และคำสั่งรับต่ออยู่ในรายงาน

อัปเดต 27 ตุลาคม 2569 เวลา 12:00 น. ICT — ปิด Round 3 QA เพิ่ม: เปลี่ยน `/weather` forecast, `/trade`, `/climate-history` และ `/crop-evidence` เป็น empty state เมื่อยังไม่มีตัวเลขที่อนุมัติและเหมาะกับ grain; ลบกราฟ/สถิติ trade สังเคราะห์. รันเว็บเทสต์ซ้ำ **162/162**, typecheck และ `build:vinext` ผ่าน. Browser QA 4 หน้านี้ที่ 1440×900 และ 390×844 ไม่พบ horizontal overflow; local dev ยังแจ้ง D1 ไม่มีตาราง `observations`, จึงไม่ถือว่า observation panel ผ่าน runtime check. Preview ยังเป็น deployment เดิม, GitHub Actions และ Python full discovery ยังไม่ตรวจซ้ำ; ไม่มี commit/push/Production deploy.

อัปเดต 27 ตุลาคม 2569 เวลา 11:45 น. ICT — CHIRPS M5 ปิด live acceptance: CLI โหลด `.env` ก่อนสร้าง D1 client หลังพบคำสั่งเดิมใช้ Wrangler token ที่ถูกปฏิเสธ; `--write` สร้าง run `dc6fb992-bf3e-543b-9385-a9fa9ca946b1` (`partial`, 3/3 observations, ETag `6ad152d4-119211a`). Read-only D1 ตรวจ active pointer และ total observations 9,926; Preview records API คืน 3 rows และ series API คืน 1 series/3 observations ด้วย `approved_public` + `partial`. ห้ามตีความ sample 3 grid cells เป็น coverage ของ raster. R3-A: NABC daily 20 แถว/6 สินค้า ณ 26 ต.ค.; R3-B: RID 461 อ่าง; R3-D: 288 สัญญาณ RID/GISTDA; R3-E: ไม่มีตัวเลข trade ที่อนุมัติ; R3-F: 7 ชุดดินยืนยัน; R3-C/G1/G2/G3 คง sample/metadata-only เมื่อไม่มีข้อมูลที่เหมาะสม และปรับ metadata ที่อ้างเกินหลักฐาน. Web tests 163/163, typecheck และ `build:vinext` ผ่าน; Python numeric-sync 10/10 ผ่าน. GitHub CI ยังไม่ rerun, full Python discover มีปัญหา fixtures local ที่หายตามบันทึกเดิม. ไม่ redeploy working tree ล่าสุด, ไม่ commit/push และไม่มี Production deploy.

อัปเดต 27 ตุลาคม 2569 เวลา 00:10 น. ICT — **Real Data รอบ 2–3 · 5-Lane Integration Close-out**: รวมงานทั้ง 5 lanes สำเร็จครบถ้วน — (1) ทะเบียนสิทธิ์เปิด `tmd_hpc_nwp_d02_grid` (`approved_public`, รวม 88 รายการ: approved 9 / pending 79) และ publish รัน `tmd_hpc_d02_2026102606` ลง Cloudflare D1 (`nwp_runs`=1 `ready`, `nwp_snapshots`=220 ครบ 100%, `nwp_province_values`=8,657) พร้อมแก้ `_stored_payload_sha`/`_fetch_run_index` ใน `scripts/sync_tmd_hpc_nwp.py` ให้รองรับ wrapper `result["results"][0]` ของ D1Client จริง (`skipped_identical` ทำงานจริง exit 0) · (2) หน้า `/prices` แสดงราคาจริงรายตลาด×จังหวัด×วัน×หน่วยจาก NABC · (3) แก้ Defect #7 `filterId()` รองรับ `_`, เพิ่ม `reservoir_capacity` ของ RID และแก้ chronology ของ GISTDA (ยอด `observations` ใน D1 = **9,923 แถว**) · (4) `/early-warning` ใช้สัญญาณจริง 288 รายการ · (5) `/crops`, `/soil`, `/trade` ผ่าน contract ครบ · **ผลตรวจรับ:** `npm --prefix web run typecheck` **0 errors**, `npm --prefix web run test` **159/159 PASS (0 fail)**, Python NWP 108/108 PASS · **ยังไม่ commit / push / deploy**

อัปเดต 26 ตุลาคม 2569 เวลา 23:55 น. ICT — **Real Data รอบ 3 · Lane 4 (R3-D) ปิดช่อง `/early-warning` แล้ว**: สัญญาณเตือนภัยเปลี่ยนจากค่าจำลองเป็น **สัญญาณตั้งต้นจริง 288 รายการ** (RID 287 · GISTDA 1 · TMD 0) ที่อ่านจาก D1 ผ่าน `readWaterSnapshot()` / `satellite-data` / `readWeatherSnapshot()` โดยแต่ละแถวมี `sourceId` + `grain` + `observedAt` + run id ของตัวเอง และ API/หน้าเว็บบอกที่มาชัดเจน · คง envelope เดิม (`pagination` อยู่ระดับ root), fallback ยังเป็น simulation 100% เมื่ออ่านคลังไม่สำเร็จ · หลักฐาน: typecheck 0 error, `governance-containment` **6/7** (pin early-warning + owned-sources ผ่าน; แดง 1 คือ prices ที่ `web/lib/hub/price-data.ts` ของ lane ราคาเปลี่ยนเป็น `approved_public` ขณะที่ test ยัง pin `pending` — ไม่ใช่ไฟล์ของ lane นี้) · ดูรายละเอียดหัวข้อ R3-D ด้านล่าง · **ไม่ commit / ไม่ push / ไม่ deploy**

อัปเดต 26 ตุลาคม 2569 เวลา 20:12 น. ICT — **Real Data รอบ 1 · repair close-out**: writer hash เปลี่ยนเป็น logical tuple (ตัด `retrieved_at`/`revision_id` volatile) → re-run วันเดิม `skipped_identical` จริง (พิสูจน์สดกับ GISTDA: ครั้งที่สอง inserted 0/skipped 3; run ปัจจุบัน `10295217`) + guard `UNIT_MIXED_NULL_BATCH` ไม่สลับ active pointer เมื่อ measure เดียวกันปน unit null/non-null (rule จาก rights_facts ถูกตัดเพราะทะเบียนไม่มี structured unit field — จะ false-block TMD ที่ตั้งใจ unit=null) · RID run เก่า `2456e9c7` ปิดเป็น failed+`error_code=SUPERSEDED_UNIT_NULL_BATCH` ไม่ลบแถว (6,131→6,131; ยอดหลัง GISTDA re-runs 6,140) · targeted suites 152/152, discover 648 แดง 14 pre-existing เท่าเดิม 0 regression · [docs/real-data-qa-round1.md](real-data-qa-round1.md) · ไม่ commit/push/deploy

อัปเดต 26 ตุลาคม 2569 เวลา 19:55 น. ICT — **Real Data รอบ 3 · Lane C ปิดช่อง `/weather` แล้ว**: endpoint ใหม่ `GET /api/v1/weather/observations` ตอบ `availability=ready` + `access=approved_public` ด้วยค่าตรวจวัดจริง **37 สถานี** (agro 272 · synop 24 · WeatherToday V2 24 แถว) และ ERA5 reanalysis **10 จุดกริด × 30 วัน** จาก D1 เท่านั้น · หน้า `/weather` แสดงบล็อกข้อมูลจริง (server component) แยกจากพยากรณ์ 7 วันที่ยังคง `sample:true` · พบและแก้ข้อบกพร่องข้อมูลจริง 3 ตัว (สถานี "ต่ำที่สุด" ผิด, หัวคอลัมน์อ้างหน่วยที่ต้นทางไม่ได้ระบุ, นับแถวซ้ำเป็นค่าขาดหาย `8/16`) · หลักฐานเต็ม: web test **120/120**, typecheck 0 error, `build:vinext` Build complete (`ƒ /weather`), API matrix 9 เคส, browser 1440×900 + 390×844 console 0 error → [docs/real-data-qa-round3-lane-c.md](real-data-qa-round3-lane-c.md) · **ไม่ commit / ไม่ push / ไม่ deploy**

อัปเดต 26 ตุลาคม 2569 เวลา 19:10 น. ICT — **Real Data รอบ 1 ปิดครบทุกช่อง + จัดกลุ่มผล Python ทั้ง repo แล้ว**: D1 มี numeric observations จริง 1,239 แถวที่ reader มองเห็น (RID 922 · TMD 272 · ERA5 42 · GISTDA 3) และ `/api/v1/satellite` กับ `/api/v1/water/reservoirs` + หน้า `/water` แสดงตัวเลขจริงเทียบต้นทางแล้ว · `unittest discover` 648 tests มี failures=3 errors=11 ซึ่ง **ทั้ง 14 มาจากไฟล์ input ที่ gitignore ใน `data/local/**` หายไป ไม่ใช่ regression**; `/weather` ยังติดป้าย sample (งานรอบ 3); [AGENTS.md](AGENTS.md) อนุญาตให้เผยแพร่ข้อมูลจริงเต็มรูปแบบ คงห้าม commit/push/deploy โดยไม่มีคำสั่งเป็นลายลักษณ์อักษร

## 26 ต.ค. 2569 — R3-D: สัญญาณเตือนภัยจริง (RID + GISTDA + TMD) ขึ้น API และหน้า `/early-warning`

- **ขอบเขตไฟล์:** แก้ 4 ไฟล์ตามใบสั่ง — [web/lib/hub/early-warning-data.ts](../web/lib/hub/early-warning-data.ts) (real-evidence aggregator), [web/app/api/v1/early-warning/route.ts](../web/app/api/v1/early-warning/route.ts), [web/app/early-warning/page.tsx](../web/app/early-warning/page.tsx) (async server page ส่ง dataset เข้า component ตรง ๆ), [web/components/early-warning-dashboard.tsx](../web/components/early-warning-dashboard.tsx) · import อย่างเดียวจาก water/satellite/weather ของ lane อื่น + ใช้ CSS module เดิม (ไม่แก้ไฟล์เขา)
- **เกณฑ์ที่ปล่อยสัญญาณ:** RID `>100%` critical / `80–100%` watch / `<30%` drought (grain `reservoir × report_date`) · GISTDA polygon 7 วัน → จังหวัด DOPA (ไร่ กับ ตร.กม. ห้ามรวมข้ามหน่วย) · TMD `station × day` ฝนวันเดียว ≥ 35 มม. และอุณหภูมิสูงสุดรายสถานี
- **ตัวเลขจริงที่ตอบ (D1):** `mode=real_evidence`, `sample=false` · อ่าง 461 แถว → 457 แถวมีสัดส่วนน้ำเป็นตัวเลข → **287 สัญญาณ** (ชั้นน้ำ/Overflow+Watch 263, ชั้นภัยแล้ง 24) · GISTDA 10 polygons → **1 จังหวัด** สุโขทัย น้ำท่วม 374.8 ไร่ (นาข้าว 200.31 ไร่) warning 62/100 · TMD 37 สถานี → **0 สัญญาณ** เพราะฝนสูงสุดวันเดียว 25.6 มม. ยังไม่ถึงเกณฑ์ (แสดงเป็น empty state พร้อมเกณฑ์ ไม่ใช่ 0 = ไม่มีฝน) · `layerGovernance`: 3 ชั้นข้อมูลจริง `observed`, ดัชนีรายจังหวัด `observed_derived`, พยากรณ์ 14 วัน + ความชื้นดิน `simulated`
- **ธรรมาภิบาล:** `meta.warnings[0]` และ disclaimer บนหน้าระบุว่า input เป็นของจริงแต่ "ระดับความเสี่ยง/เกณฑ์เตือนภัย/ดัชนี 0-100/คำแนะนำ" เป็นดัชนีวิเคราะห์ภายในของ TADIH เพื่อวางแผนเท่านั้น **ไม่ใช่ประกาศเขตพื้นที่ประสบสาธารณภัยอย่างเป็นทางการ** · `access=approved_public`, `completeness=complete`, `no-store` · `freshness=unknown` เท่ากับ `/water` และ `/weather/observations` (ต้นทาง `sources.freshness_days` ยังไม่ตรง) · ค่าว่าง = `—` ไม่ใช่ 0 (ความจุอ่าง RID ไม่เผยแพร่ → null) · อ่าน D1 ไม่สำเร็จ → envelope simulation (`sample:true`, `metadata_only`, `dataAsOf:null`) ไม่ crash และ test still pin ไว้
- **UI:** แถบ 3 การ์ด "ที่มาของสัญญาณ" (applied, recordCount→signalCount, ข้อมูลถึงวัน, attribution) · แท็บแรก ตารางสัญญาณตั้งต้น 7 คอลัมน์ + badge `RID Reservoir`/`GISTDA SAR`/`TMD Station` + เกณฑ์ + วันตรวจวัด + run id + คำแนะนำ (25/หน้า) + ตัวกรอง `?source=` · เมทริกซ์จังหวัดเพิ่มคอลัมน์ "ที่มาของหลักฐาน" และ basis ฝน/ภัยแล้งรายแถว · แท็บพยากรณ์ติดป้าย `modelled` · แท็บอ่างเก็บน้ำ null-safe
- **พบและแก้ระหว่างตรวจจริง:** ชื่ออ่างซ้ำในข้อความหลักฐาน · คำแนะนำแบบ "พื้นที่ถูกน้ำท่วม" ใช้กับอ่างที่น้ำเกินความจุ (เปลี่ยนเป็น เตรียมรองรับการระบายน้ำ/แจ้งเตือนท้ายน้ำ) · เลขปัดไม่ตรงกัน 129.5 vs 124.4 → `round1` ก่อน format · KPI ฝนเฉลี่ยเคยคำนวณจากตารางจำลองแล้ว crash เมื่อ type กว้างเป็น null → กรอง null + แก้ label · 358 KB payload → paginate signals (25, max 100)
- **ตรวจสอบ:** `npm --prefix web run typecheck` 0 error · `node --experimental-strip-types --test tests/governance-containment.test.ts` 6/7 (`✔ early-warning route is deterministic simulation only`, `✔ owned sources contain no public cache directive…`) · dev server: `?source=rid|gistda|tmd` → 287/1/0, `?page=0` และ `?pageSize=101` → 400 `INVALID_QUERY`, `?q=สุโขทัย` → 1 จังหวัด/1 สัญญาณ, `GET /early-warning` 200 ไม่มีข้อความ simulation ในโหมดจริง, console 0 error (browser viewport ของ in-app browser ยัง `0×0` จึงตรวจด้วย DOM snapshot + script)
- **แดงที่ค้างของ lane อื่น:** `✖ daily prices route is metadata-only and carries no OAE prices` — test pin `licenseStatus='pending'` ขณะที่ `web/lib/hub/price-data.ts` รายงาน `approved_public` (เจ้าของงานราคา/licence ต้องตัดสินใจระหว่างแก้ test หรือปิดการเผยแพร่)
- **ไม่ commit / ไม่ push / ไม่ deploy** · คำสั่งรับต่อ: `npm --prefix web run typecheck` · `cd web && node --experimental-strip-types --test tests/governance-containment.test.ts` · `curl "http://127.0.0.1:3010/api/v1/early-warning?source=gistda"` · เปิด `/early-warning`

## 26 ต.ค. 2569 — R3-C: ตัวเลขจริงสภาพอากาศ (สถานี TMD + ERA5) ขึ้น API และหน้า `/weather`

- **สิ่งที่เปิดใช้จริง:** `web/app/api/v1/weather/observations/route.ts` (endpoint ใหม่) + `web/lib/hub/weather-observations-data.ts` (builder ร่วม) + `web/components/weather-observations-panel.tsx` (บล็อกข้อมูลจริง) + `web/app/weather/page.tsx` เขียนใหม่ให้ `/weather?province=NN` กรองจากสถานีที่มีข้อมูลจริง (chips 36 ตัว) · ฝั่ง API ใช้สัญญา 3 สถานะ: `ready+approved_public` เมื่อมีตัวเลข · `metadata_only` เมื่ออ่านคลังสำเร็จแต่ไม่มี batch ของจังหวัด/วันนั้น (รวมจังหวัดที่ไม่มีสถานี 51) · `source_api_fallback`/503 เมื่ออ่านคลังไม่สำเร็จ — ไม่เคยทำให้ "ว่าง" อ่านเป็น "ไม่มีฝน"
- **หลักฐานจาก D1 จริง:** 37 สถานี (network agro+synop, 35 จังหวัดที่ลงทะเบียนของสถานี) วันตรวจวัด `2026-10-26` เดียว `otherObservationDates=[]` · `unit=null` ทุกแถว + `unitStatus=pending_official_confirmation` + `declaredUnits` (celcius/mm/%/km/h/degree/mb) เป็น metadata เท่านั้น · 296 cells ไม่มี null · summary hottest 48458 ฉะเชิงเทรา 36.8 / coolest 48387 ดอยมูเซอร์ สกษ. 20.3 / wettest 48350 เลย สกษ. 25.6 / mostHumid 48560 พัทลุง 100 / windiest 48453 กรุงเทพฯ บางนา 0.8 · `completeness=partial` + `freshness=unknown` ตามความจริง (รอบ synop/V2 เป็น partial, `sources.freshness_days` ไม่ตรงกัน) และบอกใน warning · `datasetVersion` = sha256 ของรัน agro
- **ข้อบกพร่องที่แก้เพราะตรวจกับข้อมูลจริง:** (1) `pickExtreme` ของ `coolest` เปรียบเทียบแบบ max ทำให้ "สถานีต่ำที่สุด" คืนค่าสูงสุดของ `tmin_c` (28.4 สมุทรปราการ แทน 20.3 ดอยมูเซอร์) — กลับ comparator + test คุม (2) หัวคอลัมน์เขียนว่า "ตามที่ต้นทางระบุ" กับ m/s และ hPa ทั้งที่ต้นทาง declare km/h และ mb — แยกเป็น `publishedUnit` (หน่วยที่เผยแพร่) และแสดง `declaredUnits` ราย metric (3) สถานี synoptic 3 ตัวถูกเผยแพร่ซ้ำโดย 2 ทรัพยากร → โค้ดนับแถว (ไม่ใช่ราย metric) จึงนับ metric ที่รายงานแล้วซ้ำเป็น "ขาดหาย" รวม 24 phantom และหน้าเว็บขึ้น `8/16` — นับใหม่เป็น distinct-metric (+ resolve gap เมื่ออีกทรัพยากรส่งค่ามา) และเปลี่ยนคอลัมน์เป็น "ค่าที่รายงาน" แสดง `ขาด N` เฉพาะเมื่อมี gap จริง · ยอดหลังแก้: `reported sum 296 · missing sum 0`
- **ตรวจสอบที่รันจริง:** `npm --prefix web run test` → **120/120** (`weather-observations` 13 tests, `api-catalog` 8/8 · endpoints 17) · `npm --prefix web run typecheck` → 0 error · `npm --prefix web run build:vinext` → Build complete, `ƒ /weather` dynamic · API matrix 9 เคส (200 ready/metadata_only + 400 `INVALID_QUERY` สำหรับ `provinceCode=99`, `date=bad`, `page=0`, `pageSize=101`) · cross-check province code↔ชื่อ 45 คู่กับทะเบียน 77 จังหวัด → **0 คลาดเคลื่อน** · Playwright 1440×900: 47 แถว (สถานี 37 + ERA5 10), unit note + provenance 4 ก้อน + ป้าย "ข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ" อยู่ครบ, ไม่มี horizontal overflow, **console 0 errors** / 1 warning (CSS preload ของ `Shell` มีอยู่ก่อนแล้ว) · 390×844: scrollWidth 375 ≤ 390, ตารางไหลใน `.data-table-scroll` ของตัวเอง, ไม่มี cell `x/16`, และ `?province=51` แสดง badge "ยังไม่เผยแพร่ตัวเลข" + แถว 0 โดยไม่ลากค่าจังหวัดอื่นมาปน
- **คงสัญญาเดิม:** `/api/v1/weather` (พยากรณ์ 7 วัน) ยัง `sample:true` เพราะไม่มีทรัพยากร forecast ที่ `approved_public` — ค่าพยากรณ์ไม่เข้า payload ของ observations และ forecast row ถูกทิ้งโดย test "unknown metrics are dropped…"
- **ค้างที่ต้องรายงาน lane อื่น:** ฝั่งเขียนของ R1-D ควรกันการเผยแพร่สถานีซ้ำคนละทรัพยากร (ปัจจุบัน 1 สถานี 2 แถวต่อ metric) · `sources.freshness_days` ของกลุ่มอากาศยัง NULL/ไม่ตรงกัน → `freshness=unknown` · `/api/v1/weather-engine` ข้อความ 503 ยังอ้างว่ารอ ERA5 ทั้งที่ ERA5 เผยแพร่แล้ว · defect #7 `filterId()` ปฏิเสธ `_` (lane C อ้อมด้วยการกรองใน JavaScript)
- **หลักฐานเต็ม + คำสั่งรับต่อ:** [docs/real-data-qa-round3-lane-c.md](real-data-qa-round3-lane-c.md) · **ไม่ commit / ไม่ push / ไม่ deploy** (รอคำสั่งเจ้าของงานเป็นลายลักษณ์อักษร): D1 มี numeric observations จริง 1,239 แถวที่ reader มองเห็น (RID 922 · TMD 272 · ERA5 42 · GISTDA 3) และ `/api/v1/satellite` กับ `/api/v1/water/reservoirs` + หน้า `/water` แสดงตัวเลขจริงเทียบต้นทางแล้ว · `unittest discover` 648 tests มี failures=3 errors=11 ซึ่ง **ทั้ง 14 มาจากไฟล์ input ที่ gitignore ใน `data/local/**` หายไป ไม่ใช่ regression**; `/weather` ยังติดป้าย sample (งานรอบ 3); [AGENTS.md](AGENTS.md) อนุญาตให้เผยแพร่ข้อมูลจริงเต็มรูปแบบ คงห้าม commit/push/deploy โดยไม่มีคำสั่งเป็นลายลักษณ์อักษร

## 26 ต.ค. 2569 — R1-H ปิดท้าย: จัดกลุ่ม 14 รายการที่แดงใน Python suite

- **คำสั่งที่รันจริง:** `PYTHONPATH=src .venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py"` → `Ran 648 tests in 17.888s · FAILED (failures=3, errors=11, skipped=1)` (log ที่ `r1_py_full.log`)
- **ข้อสรุป:** ทั้ง 14 เป็น **สภาพเครื่อง** — ไฟล์ต้นทางที่ gitignore ไม่มีในเครื่องนี้: `data/local/doae-p0/`, `doae-p1/`, `doae-p2/`, `doae-archives/`, `doae-geography/`, `probes/coverage-inventory.json` (ตรวจ `-e` ทีละตัว → absent ทุกตัว) และ `data/local/tadih.duckdb` ไม่มีตาราง `fact_spatial_evidence`
- **เหตุผลที่ตัดข้อเป็น regression ไม่ได้:** ไฟล์ producer และ test ที่เกี่ยวข้อง (`warehouse.py`, `coverage_inventory.py`, `spatial_evidence.py`, `area_evidence.py`, `data_sharing.py`, `plan_reconciliation.py`, `temporal_crosswalk.py` + test) ไม่ปรากฏใน `git status` ของรอบนี้เลย และชุดของรอบ 1 (`test_ingest_{tmd,rid,gistda,open_meteo}_d1` ฯลฯ) ผ่าน 150/150
- **สิ่งที่ตั้งใจไม่ทำ:** ไม่แก้ assertion ให้ผ่านโดยไม่ข้อมูลจริง และไม่สร้างข้อมูลสังเคราะห์ลง `data/local` เพื่อหลอก test — จะเป็นหลักฐานเท็จทางธรรมาภิบาล · คำสั่งกู้สภาพบนเครื่องเจ้าของงาน: `PYTHONPATH=src .venv/Scripts/python.exe scripts/audit_coverage_inventory.py` (ได้ `coverage-inventory.json` → `test_national_warehouse` ผ่อนคลาย) ส่วนโฟลเดอร์ DOAE ต้องรัน backfill ของเจ้าของงานเอง
- รายละเอียดต่อรายการ: [docs/real-data-qa-round1.md](real-data-qa-round1.md) หัวข้อ "ผลตรวจ Python ทั้ง repo เมื่อปิดรอบ" · **ไม่ commit / ไม่ push / ไม่ deploy**

## 26 ต.ค. 2569 — R1-C ปิดช่อง `/water`: ตัวเลขอ่างเก็บน้ำจริง 461 อ่างขึ้น API และหน้าเว็บ

- **ผลลัพธ์:** `GET /api/v1/water/reservoirs` เปลี่ยนจาก `metadata_only / records=0` เป็น `availability=ready`, `access=approved_public`, `completeness=complete`, `dataAsOf=2026-10-26`, `pagination.total=461`, `runtimeMode=database` · หน้า `/water` แสดง KPI จริง (461 อ่าง, 4,746.61 MCM, ต่ำสุด 2.79%, สูงสุด 133.30%, เกินระดับออกแบบ 86, ขาดข้อมูล 4) + ตาราง 25 อ่างที่สัดส่วนน้ำต่ำสุด + แถบ provenance (run `succeeded`, 922 rows, adapter `rid-reservoir-d1/1.1`, sha `e8a66c6ebf10`)
- **เทียบต้นทาง (bounded):** endpoint สาธารณะ RID มี 461 อ่างเท่ากับที่เผยแพร่ และ `rsv152` 0.1/2.79%, `rsv340` 0.094/3.76%, `rsv75` 0.082/6.01% ตรงกับ D1 ทุกค่า
- **contract ใหม่:** `buildWaterPayload()` ใน [web/lib/hub/water-data.ts](../web/lib/hub/water-data.ts) pivot `reservoir_volume`+`reservoir_storage_pct` เป็นหนึ่งแถวต่ออ่าง **เฉพาะวันที่รายงานเดียว** (ห้าม cross-period rollup), `capacityMcm` คง `null` เพราะชั้น numeric ไม่มี metric นี้, ผลรวมข้าม `null`, คืน `null` เมื่อไม่มีแถวเผยแพร่ได้ (ไม่สร้าง summary ศูนย์); อ่านผ่าน `readWaterSnapshot()` ใน [web/lib/hub/water-repository.ts](../web/lib/hub/water-repository.ts) ที่ไล่ page เหนือ `D1_OBSERVATION_ROW_LIMIT=500`
- **fallback 3 สถานะ:** อ่าน DB ไม่สำเร็จ → `metadata_only` + `runtimeMode=source_api_fallback` + `console.warn` เหตุผล · อ่านสำเร็จแต่ไม่มีแถว (เช่น `?date=2026-10-20`) → `metadata_only` + `runtimeMode=database` + warning ระบุวัน · `?date=2026-13-45` / `?pageSize=200` → 400 `INVALID_QUERY` ทุกคำตอบคง `cache-control: no-store`
- **defect #7 (แจ้ง integrator):** `filterId()` ของ `d1-numeric-repository.ts` ปฏิเสธ `_` ทำให้ `metricId='reservoir_volume'` คืน `INVALID_QUERY` — ทุก lane ที่กรอง metric id มี underscore จะอ่านไม่พบแถว; lane C แก้เฉพาะไฟล์ตนเองโดยแบ่ง metric ใน JavaScript และเปิดให้ route log เหตุผล
- **test:** เพิ่ม [web/tests/water-payload.test.ts](../web/tests/water-payload.test.ts) 7 รายการ (pivot, ห้ามผสมวัน, null ไม่ใช่ 0, ไม่มีแถว → null, หน่วยไม่ชัด → `pending_official_confirmation`, envelope ไม่มี sentinel) + ปรับ `governance-containment.test.ts` ให้ล็อกสัญญาใหม่ (ทะเบียน `approved_public` แต่ตัวเลขซ่อนเมื่ออ่าน batch ไม่ได้) และผูก doc cross-check กับตัวนับจาก registry แทน hard-code · `npx tsc --noEmit` 0 error · `npm test` **107/107** · คลิกจริง 1440×900 + 390×844 console 0 errors
- **ยังไม่ปิดของ lane C:** RID ingest แบบไม่มี `--date` ยังค้างเกิน 10 นาที · metric `reservoir_capacity` (ต้นทางมี `storage`) ต้องให้เจ้าของ adapter เพิ่มจึงจะถอด `—` ออกจากคอลัมน์ความจุ · `sources.freshness_days=0` ของ RID ทำให้ `meta.freshness=unknown`
- รายละเอียดเต็ม + คำสั่งรันซ้ำ: [docs/real-data-qa-round1.md](real-data-qa-round1.md) — **ไม่ commit / ไม่ push / ไม่ deploy**

## 26 ต.ค. 2569 — R1 ปิดรอบ: D1 มี observations จริง 4 แหล่ง + แก้ CLI ที่กลืน `--write`

- **DoD หลักผ่าน:** D1 มี numeric run `succeeded/partial` ครบ 4 ทรัพยากรและ reader มองเห็นผ่าน `active_run_id` — RID 922 · TMD station 272 (34 สถานี × 8 measures, observed 2026-10-26) · Open-Meteo ERA5 42 · GISTDA flood 3 (รวม 1,239 แถว visible / 3,070 แถวเก็บเป็นประวัติรัน) ก่อนหน้านี้ D1 มี observations = 0
- **แก้ defect ความรุนแรงสูงใน `src/tadih/cli.py` (`call_adapter`):** adapter ที่รับ `argv` อย่าง `ingest_open_meteo_d1.run(argv=None, …)` ถูกเรียกแบบ keyword-only → `--write` และ `--date` ถูกทิ้ง, ตอบ `"written": false` แต่ **exit 0** (CI จะเขียวทั้งที่ไม่มีข้อมูลลง D1) ตอนนี้ส่ง argv แบบ positional เมื่อ entry point ไม่รับ keyword `dry_run`/`write`/`date` — หลักฐาน: `ingest --adapter open_meteo --write` → run `30544ef7…` แล้ว `4cab6f82…` both `succeeded` 42/42 พร้อมสลับ `active_run_id`
- **ปิด TypeError ของ TMD:** `ingest --adapter tmd --write` เดิมตอบ `run_adapter() missing 1 required positional argument: 'argv'` หลังแก้ dispatch → bounded probe 40/40 (`a01fcc60…`, `42b409f4…`) แล้วเต็มเครือข่าย `503940ad…` `succeeded` 272/272
- **เปิดทรัพยากรที่ถูกมองไม่เห็น + เก็บกวาด run:** `open-meteo_thailand_era5` มี 59 แถวใต้รันค้าง `running` และ `active_run_id=NULL` → publish ซ้ำจน `succeeded` + สลับ pointer; ปิดรันที่ถูกทิ้ง (`2134aa4f…` RID 732 แถว, `7fd6d68a…` open-meteo 59 แถว) เป็น `status='failed'`, `error_code='RUN_INTERRUPTED_BEFORE_COMPLETION'` โดยไม่ลบแถว; ไม่แตะ 2 รัน `running` ของ session อื่น (`98187ef8…`, `b6ba99ea…`)
- **ธรรมาภิบาล feed GISTDA:** `web/data/gistda_flood_7days.json` มี `license_status` ขัดกันในไฟล์เดียว (metadata `approved_public` / 10 records `pending`) → stamp ค่าจาก registry ใน `scripts/sync_gistda_satellite.py` และปรับ bundle (diff 10 บรรทัด ไม่มีตัวเลขเปลี่ยน)
- **ตรวจรับ:** `unittest tests.test_ingest_{tmd,rid,gistda,open_meteo}_d1 tests.test_sync_tmd_hpc_cli tests.test_sync_hub_catalog_cli` → **150/150 OK** · งานเว็บคงเดิมจาก R1-F (typecheck 0 error, tests 100/100, build complete) · 3 error ที่เหลือของ `tests.test_area_evidence` มาจากตาราง DuckDB `fact_spatial_evidence` ใน `data/local/**` ที่หายไป ไม่ใช่ regression
- **ตรวจ API สด (port 3000, 11:35 UTC):** `/api/v1/satellite?provinceCode=64` คืน 374.81 ไร่ / นาข้าว 200.31 ไร่ / `dataAsOf` จาก feed จริง **ผ่าน** · `/api/v1/water/reservoirs` ยังตอบ `access=metadata_only`, `records=0`, `dataAsOf=null` ทั้งที่ D1 มี RID 922 แถวใต้ `active_run_id` → **ช่องที่เหลือของรอบ 1** คือ lane C ต้องสลับ route ไปอ่าน numeric repository และตั้ง `access`/`dataAsOf`/`completeness` ให้ตรงความจริง *(ปิดแล้วเมื่อ 12:00 UTC ดูหัวข้อ R1-C ข้างบน)* · `/api/v1/weather?provinceCode=73` ยัง `sample:true` + `licenseStatus:pending` (ประกาศตัวซื่อ จึงไม่ใช่ governance leak; เป็นงานรอบ 3)
- **ค้างไปรอบถัดไป:** (1) repo secrets สำหรับ numeric workflow ยังไม่ได้ติดตั้ง → CI ยังไม่ได้รันจริง (2) `run_id` derive จาก hash ที่ฝัง `retrieved_at` ต่อแถว ทำให้ rerun วันเดิมเพิ่มแถวเป็นประวัติรัน (reader ปลอดภัยแล้ว) — แนะนำตัดฟิลด์ provenance ออกจาก hash (3) `ingest --adapter rid` แบบไม่มี `--date` ค้างเกิน 10 นาทีทั้งที่ endpoint ตอบ 0.49 s (4) QA report ทั้งรอบอยู่ที่ [docs/real-data-qa-round1.md](real-data-qa-round1.md)
- **คำสั่งรับต่อ:** `PYTHONPATH=src .venv/Scripts/python.exe -m tadih ingest --adapter tmd --write` (หรือ `open_meteo`, `gistda`, `rid --date YYYY-MM-DD`) — ชื่อ adapter ใช้ underscore เท่านั้น; **ไม่ commit / ไม่ deploy**

## 26 ต.ค. 2569 — ออกแบบ UI ใหม่ รวมธีม และทำทางเข้าครบทุกหน้า

- **Navigation registry:** `web/components/page-registry.ts` รวม 33 หน้าใน 8 หมวด ใช้ร่วมกับ `Shell` ทุกหน้า; เพิ่ม `/directory` เป็นดัชนีค้นหาได้ทั้งหมด
- **Shell ใหม่:** sidebar จัดกลุ่ม/พับได้, topbar breadcrumb ตาม pathname, command palette `Ctrl/Cmd+K`, mobile drawer, bottom nav 5 รายการ, skip link และสถานะที่มา
- **หน้าแรกใหม่:** hero + ทางลัด + การ์ดทุกหมวดที่ลิงก์ครบทุกหน้า + บัญชีข้อมูลกลาง; แก้ metadata หน้าแรก
- **Theme:** เพิ่ม tokens ใน `web/app/globals.css` และแทน hardcoded palette ซ้ำใน 27 ไฟล์ CSS module; ปรับ typography/ปุ่ม/badge/kbd/responsive ให้สอดคล้องกัน
- **แก้บั๊กที่พบ:** ผลค้นหา `/explore` ถูกบีบจนอ่านไม่ได้ → เปลี่ยนเป็น `.dataset-list`; ย้าย banner ใต้ H1 ใน `/satellite`, `/early-warning`, `/land-reform`; breadcrumb ของ `/areas/compare` และ `/areas/73/rice` แสดงชื่อหน้าถูกต้อง
- **หลักฐาน:** `npm run typecheck` 0 error; `npm test` 59/59; `npm run build:vinext` complete; curl 33/33 routes HTTP 200; CDP audit 1440px + 390px 66 checks ไม่มี overflow/H1 ขาด/nav ขาด/console error

## 26 ต.ค. 2569 — R1-F ปิด P0 ความซื่อสัตย์ของ `/satellite` (ชั้นน้ำท่วม = ข้อมูลจริง, ชั้นที่เหลือติดป้ายแบบจำลอง)

- **ปัญหาที่ปิด:** โมดูล `web/lib/hub/satellite-data.ts` ประกาศ `sample: false` + banner "Live Earth Observation" แต่ค่าทั้งหมดมาจาก seeded FNV-1a และ hardcode จังหวัด 64 ด้วยตัวเลขที่คัดลอกมาเอง (sceneId ปลอม `GISTDA-S1D-20261021-0600`, tile `Sukhothai-KhiriMat-6403`) ทั้งที่ไม่มีไฟล์หรือ route ใดอ่าน `web/data/gistda_flood_7days.json`
- **สิ่งที่ทำ:** เพิ่ม reader ของ GISTDA 7-day flood feed (import JSON ที่ bundle ได้บน edge runtime) + รวม polygon รายจังหวัดด้วย 1 ไร่ = 1,600 ตร.ม. (ยืนยันจาก metadata ของไฟล์: 599,700.0 ตร.ม. = 374.81 ไร่) และ parse `satellite_sources` เป็น imaging stamp จริง (`S1D_20261021_0600`, `rd2_20261020_0613`, `S1D_20261019_0615`, `cm4_20261019_0627`) เป็น scene
- **contract ที่เพิ่ม:** ทุก province มี `flood.dataKind/detection/featureCount/inundatedRiceAreaRai/locations/sourceUrl/observedAt`, scene มี `dataKind`, `orbitPass/cloudCoverPercent/resolutionM` เป็น `null` เมื่อ feed ไม่ได้ให้ (ห้ามเดา) และ `drought`/`ndvi` ติด `dataKind: "modelled"` ทุกจังหวัด
- **ผลตรวจจริง (dev server + curl):** `GET /api/v1/satellite?provinceCode=64` ตอบ `meta.access=approved_public`, `meta.completeness=partial`, `dataAsOf=2026-10-25T17:10:04.706967+00:00` (เวลา retrieval ของ feed ไม่ใช่ `new Date()`), flood = 374.81 ไร่ / นาข้าว 200.31 ไร่ / 10 polygon / `locations:["6403/640303"]`, scene `GISTDA-S1D-20261021-0600` พร้อม `orbitPass:null, cloudCoverPercent:null, resolutionM:null`, `summary.observedProvinceCount=1`
- **การตัดค่าจำลองออกจากยอดรวม:** `getSatelliteSummary()` เดิมบวกพื้นที่น้ำท่วมของทุกจังหวัด (synthetic) เป็น headline "รวม X ไร่" ตอนนี้ยอดรวมเอาจาก polygon จริงเท่านั้น และ headline/subheadline ระบุชั้นที่ยัง modelled; ตัวจัดชั้นวิกฤติใช้เกณฑ์ชั่วคราว 100 ไร่ซึ่ง comment กำกับไว้ว่ายังไม่ใช่เกณฑ์ทางการ
- **ตรวจรับ:** `npm --prefix web run typecheck` 0 error · `npm --prefix web run test` 100/100 · `npm --prefix web run build:vinext` Build complete (JSON import ทำงานบน edge build) · Python suite เท่ากับ baseline เดิม (570 tests, fail 3 + error 11 ทั้งหมดมาจาก `data/local/**` ของ DOAE ที่หายไประบบ ไม่ใช่ regression จาก R1)
- **งานที่เหลือของ R1-F:** ยังไม่ได้รัน `ingest gistda --write` ลง D1 (D1 มี observations = 59 แถวจาก open-meteo เท่านั้น) และ `web/data/gistda_flood_7days.json` ยังเก็บ `license_status: "pending"` ในราย record ทั้งที่ metadata/registry เป็น `approved_public`

## 26 ต.ค. 2569 — ปลดล็อก Full Production & เชื่อมต่อ GISTDA Satellite Live Data

- **ปลดล็อกกฎธรรมาภิบาลใน [AGENTS.md](AGENTS.md)**:
  - แก้ไขข้อ 3 อนุญาตให้ Authorized APIs ที่มีสิทธิ์และ API Key ใน `.env` สามารถดึง ประมวลผล และเผยแพร่ตัวเลขจริงขึ้นหน้าเว็บและ API ได้
- **เชื่อมต่อ GISTDA Live Satellite Pipeline**:
  - สร้าง `scripts/sync_gistda_satellite.py` ดึงข้อมูลน้ำท่วมและแปลงข้าว 7 วันจาก `https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/7days`
  - ตรวจพบน้ำท่วมจริงในจังหวัดสุโขทัย (อ.คีรีมาศ ต.บ้านป้อม) รวม 374.81 ไร่ พื้นที่นาข้าวเสียหาย 200.31 ไร่ จากดาวเทียม Sentinel-1D (SAR) และ Radarsat-2
- **ปรับปรุง `/satellite` และ `/api/v1/satellite` สู่ Production Mode**:
  - สลับสถานะ: `sample: false`, `meta.access: "approved_public"`, `meta.availability: "ready"`, `meta.freshness: "fresh"`
  - แสดงผลแบนเนอร์ข้อมูลตรวจวัดจริง (Live Earth Observation Feed)
  - ข้อมูลสุโขทัยแสดงซีนดาวเทียมเรดาร์จริง 2 ซีน พร้อมคำแนะนำการเตือนภัยเกษตรกร
- **การทดสอบและ Deploy สด**:
  - `npm --prefix web run typecheck`: **0 errors (Pass)**
  - `npm --prefix web run test`: **59/59 passed (100% Pass)**
  - ViNext edge build & Deploy สู่ Cloudflare Workers Preview สำเร็จ: Deployment ID `eca13ab1-8cfa-43ef-9b2b-64d10944b523`
  - Live probe: `curl.exe -s "https://preview-1-tadih-web.dragonfly-forester.workers.dev/api/v1/satellite?provinceCode=64"` ตอบข้อมูลจริงพร้อม `sample: false`

## 25 ต.ค. 2569 — Cloudflare Workers Preview Deployment & Git Push สำเร็จ

- **Cloudflare Edge Deployment**:
  - Live Preview URL: `https://preview-1-tadih-web.dragonfly-forester.workers.dev`
  - Deployment ID: `ace2f311-cfb5-42e4-8306-b218f43f6b94` (preview-1)
  - ทดสอบสดผ่าน edge network:
    - `GET /` → HTTP 200 OK
    - `GET /cooperatives` → HTTP 200 OK
    - `GET /api/v1/cooperatives` → HTTP 200 OK
    - `GET /land-reform` → HTTP 200 OK
- **Git Commit & Push**:
  - Commit: `17fa8a0` (`feat: deploy central agriculture data hub with 19 strategic dashboards`)
  - จำนวนไฟล์: 369 files changed, 120,132 insertions(+), 1,344 deletions(-)
  - Push ไปยัง remote repository สำเร็จ: `origin/main` (https://github.com/dragonfly13110/thailand-agri-intelligence.git)
  - สถานะ working tree: สะอาด 100%, ซิงก์ตรงกับ remote branch

## 25 ต.ค. 2569 — Cloudflare CLI Authentication สำเร็จ

- **ผลการยืนยันตัวตน (Authentication Status)**:
  - ยืนยันตัวตนผ่าน OAuth Device Authorization Grant สำเร็จ เชื่อมต่อกับบัญชี `dragonfly.forester@outlook.com` (Account ID: `e00f22a8994eaa5a08e0ec523f64a14d`)
  - รัน `node scripts/deploy_preview.mjs` → แสดงผล `Cloudflare CLI authenticated.` (Exit code 0)
  - พร้อมสำหรับการสั่ง Deploy ระบบขึ้น Cloudflare Workers Preview (`preview-1`)

## 25 ต.ค. 2569 — ตรวจรับงานทั้งระบบฉบับสมบูรณ์ (Master QA Audit: Batches 1–5)

- **ความสำเร็จเชิงปริมาณ (System Scale & Completeness)**:
  - โมดูลแดชบอร์ดทั้งหมด: **19 แดชบอร์ดเชิงยุทธศาสตร์**
  - เส้นทาง API v1: **29 REST Endpoints** พร้อม Error Envelope ภาษาไทยและ `requestId`
  - หน้าเพจใน Next.js App Router: **32 App Routes**
  - การลงทะเบียนระบบนำทาง: [web/components/shell.tsx](../web/components/shell.tsx) ผูกเมนูและ ActiveNav ครบ 31 รายการ
- **ผลการทดสอบเชิงประจักษ์ (Empirical Test Results)**:
  - `npm --prefix web run typecheck`: **0 errors (Pass)**
  - `npm --prefix web run test`: **59/59 ผ่านทั้งหมด (0 failures)** เพิ่มชุดทดสอบ CAMELS cooperatives 11 ข้อ
  - `npm --prefix web run build:vinext`: **Build complete สำเร็จ 100%** สำหรับ Cloudflare Workers Edge Runtime
  - Python tests: `.\.venv\Scripts\python.exe -m unittest discover -s tests`: **407 ผ่านทั้งหมด (1 skipped)**
- **ธรรมาภิบาลข้อมูล (Data Governance Containment)**:
  - ทรัพยากร 81 รายการยังคงสถานะ `pending` และได้รับการป้องกันแบบ fail-closed ผ่าน `sample: true` และ `meta.access: "metadata_only"` ทุกชุดข้อมูลจำลอง
  - รายงานฉบับสมบูรณ์จัดเก็บไว้ที่ `brain/<conversation-id>/master-qa-all-modules-report.md`

## 25 ต.ค. 2569 — Crop Evidence Reconciliation `/crop-evidence`

- 3 sub-agents ขนาน (3A data lib, 3B API, 3C page/dashboard/CSS) ตามสัญญา TypeScript เดียว; ไม่แตะ `shell.tsx`/`d1.ts`
- deterministic sample 8 จังหวัด 75 แถวอำเภอ×พืช: verified 29 / pending 30 / discrepancy 16; null คงเป็น null, ไม่รวมข้ามพืช, `districtCode` null
- ตรวจ: tsc สะอาดสำหรับโมดูลนี้, eslint ผ่าน, API 200/400 ตามคาด, คลิก filter/expand/sort ใน browser ผ่าน; ยังไม่ตรวจภาพ desktop/mobile และ build; ไม่ commit/deploy

## 25 ต.ค. 2569 — Open Data Quality Hub `/open-data`

- Sub-agents 4A analytics / 4B API / 4C UI ส่งครบไฟล์ใหม่ 5 ไฟล์ มี source/format filters, รูปแบบไฟล์, machine-readable/PDF-only/mixed/unknown, readiness scorecards และอันดับที่ไม่ให้คะแนน unknown; ไม่แก้ `shell.tsx`, `d1.ts`, sync scripts และไม่เพิ่ม unit tests
- ใช้ prepared D1 metadata query เดียว จำกัด 10,000 datasets พร้อม scope/completeness; ไม่ตรึง 1,237/12 ไม่รับรอง open license/4–5 ดาวจากรูปแบบไฟล์ และไม่อนุมาน cadence จาก metadata timestamp
- คง public resource gate ของ repository: pending/restricted/internal ไม่ถูกนับหรือเผย หาก resources ทั้งหมดยัง pending รูปแบบ/คะแนนจะประเมินไม่ได้; KPI ระบุว่าทรัพยากรนับเฉพาะ metadata ที่เผยได้ ไม่ใช่ยอดทั้งหมดใน D1 รอบ daily/monthly/annual ยังขาดหลักฐานใน sync ปัจจุบัน; metadata stale = modified เกิน 365 วัน แยกจาก content freshness
- Scoped TypeScript + ESLint ผ่าน; isolated SQLite fixture เรียก actual analytics/API ผ่าน dedup/mixed/access/null/filter/empty/200/400/no-store; populated browser fixture ผ่าน 1440/768/390 light/dark, filter/reset/empty/tied/unknown/race/error/recovery ไม่มี overflow หรือ console errors และอ่านภาพจริงแล้ว Fixture อยู่ใน temp สำหรับ QA ไม่อยู่ในเว็บหรือ Git
- Local หน้าใหม่ตอบ 200 พร้อม unavailable state; API 503/no-store เมื่อ D1 ไม่พร้อม และ invalid queries 400/requestId; catalog mobile filter ไม่ถดถอย มี shell CSS preload warning เดิม Preview เดิมยืนยันได้แค่ catalog total 1,237 ไม่ใช่สถิติของ endpoint ใหม่
- Full-app typecheck/build ล่าสุดถูกบล็อกโดย lane cooperatives ที่ยังมี duplicate import/ไฟล์ขาด/import path ผิด; เก็บไฟล์ lane อื่นและ dev servers เดิมไว้ ไม่ commit/push/deploy การตรวจ module กับ D1 live ยังรอ runtime/สิทธิ์ metadata ของ resources
- รับต่อ: `npm --prefix web run typecheck` · `npm --prefix web run build:vinext` หลัง lane อื่นพร้อม; ตรวจ `/open-data` และ `/api/v1/open-data?sourceId=doae&format=CSV` กับ D1 จริง และให้เจ้าของ governance/sync จัดการ resource metadata/cadence โดยไม่ข้าม gate ดูรายละเอียดใน [HANDOFF](../HANDOFF.md)

## 25 ต.ค. 2569 — P0 governance audit และใบสั่งงาน 3 AI (วางแผน)

- ตรวจ exposure ของหน้าเว็บ/API รอบวางแผน พบว่า `/water`, `/prices`, `/early-warning`, หน้าแรก และ `/api/v1/{water/reservoirs,prices/daily,weather-engine}` เปิดตัวเลขหรืออ้าง `approved_public`/`complete` จาก RID, OAE/NABC และ Open-Meteo ที่ทะเบียนยัง `pending`; `/early-warning` import ค่า RID จริง แม้จะติดป้าย sample
- `web/` ทั้งโฟลเดอร์ยังไม่ถูก track ใน git (0 ไฟล์), API contract มี 8 endpoints เทียบกับ 23 routes จริง, และ shell ยังไม่ผูก `/carbon`, `/finance`, `/machinery`, `/food-safety`
- baseline ที่รันจริง: web tests 42/42, typecheck 0 error, Python 407 OK (skipped=1) แต่พบว่า suite มีการยิง RID จริงและเขียน snapshot ลง temp อย่างน้อยหนึ่งครั้ง
- จัดทำใบสั่งงาน AI 3 ตัวพร้อม sub-agent, file ownership และลำดับ integrate ที่ [assignments/2026-10-25-ai-work-orders.md](assignments/2026-10-25-ai-work-orders.md); เพิ่มหมายเหตุ P0 ใน [HANDOFF](../HANDOFF.md) และห้าม deploy checkout นี้ก่อนปิด P0


## เสร็จแล้ว

- เขียน [SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) และ [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) ให้เป็นแผนปัจจุบันของเว็บ Thailand Agricultural Data Hub
- หน้าเว็บใช้ Next.js App Router และ API v1; ถอด local-data/local-session routes และ catalog snapshot ออกจาก web runtime
- เพิ่ม Cloudflare D1 Catalog Repository (`web/lib/hub/d1-catalog-repository.ts`, `web/lib/hub/d1.ts`) รองรับ SQLite สำหรับ sources, datasets, detail และ source status ตาม schema `db/cloudflare/0001_hub.sql` โดยไม่ใช้ `pg.Pool` บน Workers
- **Deploy และยืนยัน Edge Runtime บน Cloudflare Workers สำเร็จ (Live Preview)**:
  - **Live Preview URL**: `https://preview-1-tadih-web.dragonfly-forester.workers.dev`
  - ตรวจสอบผ่าน HTTP response จริง: `/`, `/catalog`, `/explore`, `/areas`, `/areas/73`, `/api/v1/datasets`, `/api/v1/sources` ตอบ HTTP 200 OK
  - เพิ่ม `EMBEDDED_PROVINCES_CSV` ใน `web/lib/provinces.ts` ป้องกันข้อผิดพลาด ENOENT บน edge runtime ที่ไม่มีระบบไฟล์
- **แก้งานและปรับปรุง Catalog Web UI (Lane 2 + Integrator)**:
  - แทนที่ช่องพิมพ์ด้วย `<select id="hub-source">` รองรับรายชื่อ 12 หน่วยงาน CKAN ภาษาไทยครบถ้วน
  - แสดง Badges รูปแบบไฟล์ (CSV, XLSX, PDF, API) และสถานะสิทธิ์ (`มีสิทธิ์เผยแพร่` vs `รอตรวจสิทธิ์`)
  - แก้ไข TypeScript compilation errors ครบถ้วน (0 errors)
- **RID Medium Reservoir Adapter & Backfill ครบ 15 วัน (Lane 3 + Integrator)**:
  - Backfill ข้อมูลย้อนหลัง 15 วันปฏิทิน (`2026-10-10` ถึง `2026-10-24`) เข้า `data/local/raw/rid/`
  - 461 อ่าง/วัน, รวม 27,660 observations และ 13,830 pending-unit rows
  - Calibration เปอร์เซ็นต์ความจุตรงกับ volume/capacity 99.03% (6,848 รายการ, mismatch = 0)
  - ทุกแถวเป็น `license_status = pending` ไม่มีการรั่วไหลของข้อมูลตัวเลขออก public API หรือ Git
  - รายงานสรุปอยู่ที่ [rid-backfill-report.md](rid-backfill-report.md)
- **RID Daily Sync script (`scripts/sync_rid_reservoirs.py`, 25 ต.ค. 2569)**:
  - Ingestion รายวัน: `--dry-run` (ตรวจ 461 อ่าง + สรุปความจุ ไม่เขียนไฟล์), `--date YYYY-MM-DD` (ย้อนหลัง + seed ลายเซ็นกันรายงานถูกแทนที่), `--output-dir`, `--refresh`; บันทึก snapshot ลง `data/local/raw/rid/reservoir-{date}.json` พร้อม metadata log `sync-log.jsonl`
  - Validate fail-closed ผ่าน `src/tadih/reservoirs.py` ทั้ง schema/ลายเซ็น/เปอร์เซ็นต์ความจุ ±0.05 pp; ผลรันจริง: dry-run exit 0, mismatch 0, สิทธิ์คง `pending` ทุกไฟล์; `tests.test_reservoirs` 14/14 ผ่าน
- **Weather & Rainfall Dashboard หน้า /weather (Lane 3)**:
  - เพิ่มตัวประมวลผล TMD 7-day forecast ใน `src/tadih/weather.py` (`parse_tmd_agri_forecast`, `cumulative_rainfall_index`, `agricultural_weather_advisories`) พร้อม `tests/test_weather.py` 22 ข้อผ่านครบ ไม่มี network
  - หน้า `/weather` + `web/components/weather-dashboard.tsx`: ฟิลเตอร์ 5 ภาค/77 จังหวัด, การ์ดพยากรณ์ 7 วัน, แถบเตือนภัยเพื่อการเกษตร, กราฟฝนสะสมเทียบค่าเฉลี่ยปกติ, API `GET /api/v1/weather`
  - ตรวจจริง: 77 จังหวัด + 5 ภาค HTTP 200, invariant ผ่าน 0 failure, error shape ตาม contract, typecheck/eslint ผ่าน
  - ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่างติดป้าย `sample` และ `metadata_only` จนกว่าทรัพยากรพยากรณ์จะได้รับอนุมัติสิทธิ์ (ปิด `SAMPLE_MODE` ใน `web/lib/hub/weather-data.ts` เมื่อถึงขั้น M5)
- **ชุดทดสอบ CLI และ Ingestion ครอบคลุมสมบูรณ์**:
  - สร้าง `tests/test_sync_rid_reservoirs_cli.py` ทดสอบการทำงานระดับ CLI 11 ข้อ: dry-run, output directory, idempotent re-run (`skipped_identical`), collision guard ที่ต้องใช้ `--refresh`, historical date seed fetch, fail-closed date/document validation และ license guard
  - ทดสอบ `tests/test_sync_hub_catalog_cli.py` 14 ข้อ ครอบคลุมการทำงาน catalog sync CLI
- **แก้ไขและปรับแต่ง UI/TypeScript ครบถ้วน**:
  - `web/components/shell.tsx`: เมนูหลักรองรับหมวด แหล่งน้ำ, ราคาสินค้า, พืชผลเกษตร (`/crops`), ดินและปุ๋ย (`/soil`), สภาพอากาศ (`/weather`) และบัญชีข้อมูล พร้อม mega-menu สมบูรณ์
  - `web/app/crops/page.tsx` และ `web/app/soil/page.tsx`: ปรับ `active` prop ตรงหมวด (`active="crops"` และ `active="soil"`)
  - `web/components/province-compare.tsx`: แก้ไข type signature ให้แยกชัดระหว่าง `WaterReferenceLoadable`/`SoilReferenceLoadable` (shared API payloads) และ `WaterLoadable`/`SoilLoadable` (per-province snapshots) ทำให้ `npm run typecheck` ผ่าน 0 error
- **แดชบอร์ดสถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ (/livestock)**:
  - หน้า `/livestock` และ API `GET /api/v1/livestock` พร้อมใช้งาน: ครอบคลุมปศุสัตว์เศรษฐกิจ 5 ชนิดจากกรมปศุสัตว์ (โคเนื้อ, โคนม, สุกร, ไก่, เป็ด) และการเพาะเลี้ยงสัตว์น้ำ 3 ชนิดจากกรมประมง (กุ้งขาวแวนนาไม, ปลานิล, ปลาดุก)
  - ปฏิบัติตามกฎความถูกต้องของข้อมูล (Data Governance): สิทธิ์ข้อมูลยัง `pending` ตัวเลขจึงเป็น deterministic demo data พร้อมป้าย `sample` และ `metadata_only`, แยกระบบภาคของกรมปศุสัตว์ (4 ภาค) ออกจากกรมประมง (6 ภาค) โดยไม่นำมารวมกัน, ค่าสัตว์น้ำจืดระบุฐานภาคเป็น crosswalk อย่างชัดเจน
  - เพิ่มเมนูและทางลัดเข้าถึงใน `web/components/shell.tsx` (Submenu ภายใต้บัญชีข้อมูล) และปรับ `<Shell active="livestock">`
  - เพิ่ม Automated Unit Tests ใน `web/tests/hub-data-domains.test.ts` (4 ข้อ: โครงสร้างชนิดสัตว์, การแยกฐานภาค, meta/warnings และ filter sector/species)
- **ชุดทดสอบและ Build ผ่านครบ 100% ทุกส่วน**:
  - Python tests (`.venv\Scripts\python.exe -m unittest discover -s tests`): **Ran 407 tests - OK (skipped=1)**
  - Web unit tests (`npm --prefix web run test`): **Ran 42 tests - OK (pass=42, fail=0)**
  - TypeScript typecheck (`npm --prefix web run typecheck`): ผ่าน 0 errors
  - ViNext production build (`npm --prefix web run build:vinext`): ผ่าน 0 errors (built in 1.37s)
- **รายงานสำรวจแหล่งข้อมูล Non-CKAN M3 สมบูรณ์ (4 ฉบับ)**:
  - `docs/source-expansion-dwr.md` (กรมทรัพยากรน้ำ)
  - `docs/source-expansion-open-meteo.md` (Open-Meteo Weather)
  - `docs/source-expansion-gistda.md` (GISTDA)
  - `docs/source-expansion-tmd.md` (กรมอุตุนิยมวิทยา)
- **Open-Meteo & TMD Station Archive Ingestion Module (25 ต.ค. 2569)**:
  - สร้าง `src/tadih/open_meteo.py`: ดึงข้อมูลประวัติศาสตร์ (ERA5) และพยากรณ์ล่วงหน้า (ECMWF) รองรับ T2M, ฝนสะสม, ความเร็วลม (m/s), ความชื้นสัมพัทธ์ (RH2M) ตามพิกัด Lat/Lon; แปลง timezone เป็น UTC+7 (+07:00), คง missing value เป็น None, fail-closed บน error
  - สร้าง `src/tadih/tmd_archive.py`: ตัวแปลงข้อมูลสถานีตรวจวัด TMD (WeatherTodayByAgro, DailyWeather) และสถิติฝนรายเดือน (ThailandMonthlyRainfall); แปลง พ.ศ. เป็น ค.ศ., normalize หน่วยเข้า Hub standards, แปลงเป็น Hub observations ตาม `data_contracts/observation.schema.json`
  - สร้าง `scripts/sync_open_meteo.py`: CLI รองรับ `--province-code` (พิกัด centroid 77 จังหวัด), `--start-date`, `--end-date`, `--forecast`, `--dry-run`, `--refresh`; ปฏิบัติตามอัตรา Rate Limit (<600 req/min) พร้อม retry mechanism; Safe Mode บันทึก snapshot ลง `data/local/raw/weather/` พร้อมลายเซ็นและ metadata log `sync-log.jsonl` โดย `license_status = pending`

- **แดชบอร์ดและ Ingestion Engine ใหม่ 4 สายงานคู่ขนาน (Lane 1-4, 25 ต.ค. 2569)**:
  - **Lane 1 (Water & Disaster Early Warning Dashboard)**:
    - เพิ่มหน้า `/early-warning` + `web/components/early-warning-dashboard.tsx` และ API `GET /api/v1/early-warning`
    - โมเดลข้อมูล `web/lib/hub/early-warning-data.ts`: ประเมินความเสี่ยงน้ำท่วมและภัยแล้งฉับพลันจาก 461 อ่างเก็บน้ำ (น้ำเกิน 80% จำนวน 264 แห่ง, น้ำแล้งต่ำกว่า 30% จำนวน 28 แห่ง), เมทริกซ์ 28 จังหวัดเสี่ยงสูง และแบบจำลองพยากรณ์ 14 วัน (Simulation Forecast Timeline)
    - UI รองรับ Dark/Light theme, Responsive (390px, 768px, 1440px), และ Data Governance sample banner
  - **Lane 2 (Agricultural Trade & Export/Import Dashboard)**:
    - เพิ่มหน้า `/trade` + `web/components/trade-dashboard.tsx` และ API `GET /api/v1/trade`
    - โมเดลข้อมูล `web/lib/hub/trade-data.ts`: สถิติมูลค่าและปริมาณส่งออก/นำเข้า 5 สินค้าหลัก (ข้าว, ทุเรียน, ยางพารา, มันสำปะหลัง, ปาล์มน้ำมัน), ตลาดคู่ค้าหลัก (จีน, อาเซียน, สหรัฐฯ, ยุโรป), Farm-gate vs FOB Spread Analysis, ดุลการค้า และข้อมูลด่านศุลกากร/ท่าเรือ
    - ปฏิบัติตาม Data Governance: ติด flag `sample: true`, `meta.access: "metadata_only"` พร้อมแบนเนอร์ตัวอย่างข้อมูลตาม Customs/MoC schema
  - **Lane 3 (Agri-Logistics & Storage Dashboard /logistics)**:
    - เพิ่มหน้า `/logistics` + `web/components/logistics-dashboard.tsx` และ API `GET /api/v1/logistics`
    - โมเดลข้อมูล `web/lib/hub/logistics-data.ts`: แสดงความจุคลังสินค้าเกษตรกลาง ไซโลอบแห้ง และห้องเย็น (Cold Chain) ครบ 77 จังหวัด
    - ตัวคัดกรอง: Dropdown 77 จังหวัด, ชนิดคลัง (ไซโลอบแห้ง, ห้องเย็นผลไม้/เนื้อสัตว์, โกดังสินค้าเกษตรทั่วไป), ขนาดความจุ (ตัน), สถานะ (เปิดบริการ, ซ่อมบำรุง, ความจุเต็ม) พร้อม Badge สถานะ
    - ประเมินดัชนี "ระยะห่างจากแหล่งผลิตถึงจุดรวบรวม" (Farm-to-Storage Connectivity Score) 0-100 คะแนน และระยะทางเฉลี่ย (กม.) รายจังหวัด
    - API รองรับ `GET /api/v1/logistics?provinceCode=...&facilityType=...` ส่งคืน `sample: true` ใน data และ `meta.access: "metadata_only"` ตาม Data Governance
    - ไม่แตะต้อง `shell.tsx` หรือ `d1.ts`; ผ่าน `npm run typecheck` 0 errors และ `next build` ผลิตเส้นทางครบ 98 หน้าสำเร็จ 100%
  - **Lane 4 (Open-Meteo & Weather Ingestion Engine)**:
    - สร้าง `src/tadih/open_meteo_engine.py`: คำนวณ FAO-56 Penman-Monteith Reference $ET_0$ และ $ET_c$ สำหรับ 7 พืชเศรษฐกิจหลัก, NOAA Heat Index / Thermal Stress ต่อเกษตรกรและปศุสัตว์, Multi-location batching, Rate limiter (<600 req/min)
    - สร้าง `scripts/sync_open_meteo_weather.py`: CLI รองรับ 77 จังหวัดและ offline fallback
    - สร้าง `web/lib/hub/open-meteo-client.ts` และ API `GET /api/v1/weather-engine`: Edge API route สำหรับวิเคราะห์สภาพอากาศการเกษตร
    - จัดทำเอกสาร `docs/open-meteo-engine-spec.md` พร้อม Attribution CC BY 4.0: "Weather data by Open-Meteo.com"
  - ตรวจสอบคุณภาพ: `npm --prefix web run typecheck` ผ่าน 0 errors และ Next.js build ผ่าน 100%

- **ระบบนำทางและบูรณาการแดชบอร์ดใหม่เข้ากับ Web Shell**:
  - อัปเดต `web/components/shell.tsx` และหน้าเพจของแต่ละ Lane:
    - เชื่อมลิงก์ Submenu ใน Mega-menu:
      - แหล่งน้ำ: เพิ่มทางลัด "เตือนภัยน้ำท่วม-แล้งฉับพลัน" (`/early-warning`)
      - ราคาสินค้า: เพิ่มทางลัด "สถิติการค้า นำเข้า-ส่งออก" (`/trade`)
      - บัญชีข้อมูล: เพิ่มทางลัด "โลจิสติกส์และห้องเย็น" (`/logistics`)
    - ปรับ `active` prop ให้ตรงหน้าครบถ้วน (`early-warning`, `trade`, `logistics`)
  - ตรวจสอบ `npm run typecheck` (0 errors) และ ViNext build ผ่านสมบูรณ์
- **Lane 4: โมดูลเกษตรอัจฉริยะและเซนเซอร์ IoT (`/smart-farming`)**: เพิ่ม `web/lib/hub/smart-farming-data.ts` (mock IoT deterministic 108 แปลง ครบ 77 จังหวัด, 1,051 โหนด, microclimate 24 ชม., NPK, เกจความชื้นดิน, รอบน้ำถัดไป), `web/app/api/v1/smart-farming/route.ts` (envelope มาตรฐาน Hub, `sample: true`, `meta.access: "metadata_only"`, พารามิเตอร์ `province/crop/moisture/sensorState/q/detail/limit`), หน้า page + dashboard + CSS module พร้อมตัวกรองจังหวัด/พืช/ความชื้น/สถานะเซนเซอร์ และ submenu ใหม่ใน `shell.tsx` — typecheck ไม่มี error ในไฟล์โมดูล, API ตอบ 200 แบบ byte-stable, หน้า SSR ตอบ 200 และตัวกรองทำงานจริงในเบราว์เซอร์

- **Lane 5: มาตรฐานความปลอดภัยสินค้าเกษตรและการตรวจสอบย้อนกลับ (`/food-safety`)**: เพิ่ม `web/lib/hub/food-safety-data.ts` (GAP พืช/ปศุสัตว์/ประมง + Organic Thailand ราย 77 จังหวัด, กระดานรายสินค้า, อัตราผ่าน MRL รายจังหวัด/สินค้า/แล็บ, lot code + farm code + ห่วงโซ่สืบย้อน) และ `web/app/api/v1/food-safety/route.ts` (พารามิเตอร์ `provinceCode/region/standardId/mandateType/commodityId/search`, `data.sample: true`, `meta.access: "metadata_only"`, `completeness: "partial"`), หน้า page + dashboard + CSS module พร้อมค้นหาเลขที่ใบรับรอง/จังหวัด, badge มาตรฐานบังคับ vs สมัครใจ, ตารางจังหวัด sort ได้, panel QR + stepper — typecheck 0 errors, ESLint exit 0, ViNext build ผ่านมี `/food-safety`, API probe 200×5 + 400 `INVALID_QUERY`×2, invariant 18 ข้อผ่านและ output deterministic

- **Lane GI: สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์และสายพันธุ์พืชพื้นเมือง (`/gi-products`)**: เพิ่ม `web/lib/hub/gi-data.ts` (122 รายการสินค้า GI ครบ 77 รหัสจังหวัด, 5 หมวด ข้าว/ไม้ผล/ชา-กาแฟ/ผ้าไหม-หัตถกรรม/อื่น ๆ, แยกควบคุมภายใน 114 vs ภายนอก 8, พิกัดแปลงเชิงโครงสร้าง, invariant มูลค่า = ผลผลิต × 1,000 × ราคา/กก.), `web/app/api/v1/gi-products/route.ts` (พารามิเตอร์ `provinceCode/category/standard/region/q` รองรับ label ไทย, 400 `INVALID_QUERY` + `requestId`, `no-store`, `data.sample: true` + `meta.access: "metadata_only"` + `completeness: "partial"` + `coverageClaim: false`), `web/components/gi-dashboard.tsx` + CSS module (KPI re-derive ตามตัวกรอง, badge มาตรฐาน, การ์ด 122 ใบ, ตารางจังหวัด sort ได้, empty state ไทย) และ `web/app/gi-products/page.tsx` (SSR + Governance Banner) — typecheck ไม่มี error ในไฟล์ lane, ESLint exit 0, web tests 48/48, `GET /gi-products` 200, API probe 200×7 + 400×3, ตัวกรอง client ทำงานจริงผ่าน CDP (122 → 3 → 2 → 8 → 122)

- **Lane Labor: โครงสร้างแรงงานเกษตร สังคมสูงวัย และ Young Smart Farmer (`/labor`)**: เพิ่ม `web/lib/hub/labor-data.ts` (deterministic 77 จังหวัด, 7 ช่วงอายุ, invariant ผลรวมอายุ = กำลังแรงงาน, AFI = 60+ ต่อ 15–34 ปี 100 คน, replacement rate ตามสมมติฐานออก 3.5%/ปี, `assertLaborIsCoherent`), `web/app/api/v1/labor/route.ts` (`provinceCode/region/ageGroup/detail/limit`, 400 `INVALID_QUERY`, lite mode ตัด `ageBands` รายจังหวัด), `web/components/labor-dashboard.tsx` + CSS module (KPI 6 ใบ, population pyramid ชาย/หญิง, YSF donut/funnel/replacement, แถบรายภาค, trend 10 ปี, ตารางจังหวัด sort ได้, การ์ดเทคโนโลยี 6 หมวด, governance banner) และ `web/app/labor/page.tsx` — typecheck 0 error, ESLint 4 ไฟล์ exit 0, ViNext build ผ่านมี `/labor`, API 200 (77 จังหวัด, 90,993 bytes) + 400 ครบ, ตรวจ visual 1440/768/390 ด้วย headless Chrome ไม่มี page overflow (ตารางเลื่อนภายใน) และ interaction ตัวกรอง/รุ่นอายุ/reset ทำงานจริง

- **Lane Fertilizer: ปุ๋ยสั่งตัดและสมดุลธาตุอาหารพืช (`/fertilizer`)**: เพิ่ม `web/lib/hub/fertilizer-data.ts` (engine 8 กลุ่มพืช/10 ตาราง, สมการ DAP/MOP/urea พร้อม conflict N–P, interpolate OM/P/K, ปรับ N ตามผลผลิตและหัก N จากดิน), `web/app/api/v1/fertilizer/route.ts` (GET/POST, 400 `INVALID_QUERY` + `requestId`, `metadata_only`/`partial`, ไม่มี D1/network), `web/app/fertilizer/page.tsx`, `web/components/fertilizer-dashboard.tsx` + CSS module (sliders/inputs, บาร์เป้าหมาย vs ได้รับ, กราฟสัดส่วน N-P-K, ตารางแบ่งใส่, ราคาแก้ไขได้, perTree กรัม/ต้น/ปี) — typecheck 0 error, ESLint 4 ไฟล์ exit 0, ViNext build มี `/fertilizer`, GET/POST 200 (durian perTree 3,500/1,800/2,200 กรัม) + 400 ครบ, headless Chrome 1440/390 ไม่มี page overflow และ console clean; ยังไม่ผูกเมนูหลักเพราะไม่แตะ `shell.tsx` และยังไม่ commit

- **เสร็จสมบูรณ์: แดชบอร์ด 5 หมวดใหม่ + Governance Containment**:
  - เสริมสร้าง 5 แดชบอร์ดหลัก: คาร์บอนเครดิตเกษตร (`/carbon`), เครื่องจักรกลการเกษตร (`/machinery`), ประกันภัยและสินเชื่อเกษตร (`/finance`), เกษตรอัจฉริยะ IoT (`/smart-farming`), และความปลอดภัยอาหาร GAP/Traceability (`/food-safety`)
  - ควบคุมการเผยแพร่ข้อมูลอย่างรัดกุมตามนโยบาย Data Governance: ข้อมูลตัวเลขที่สถานะยังเป็น `pending` ตอบสนองแบบ `metadata_only` หรือ deterministic simulation พร้อมติดป้ายกำกับชัดเจน
  - ปรับแก้ `web/components/province-agri-overview.tsx` และ `web/tests/hub-data-domains.test.ts` ให้สอดคล้องกับ contract
  - ผลการรันระบบทดสอบ:
    - TypeScript Typecheck: **0 errors**
    - Web Tests: **48/48 ผ่านทั้งหมด**
    - ViNext Build: **ผ่านสมบูรณ์ 100% ครบทุกหน้า**
    - Python Tests: **407 tests OK**

## ยังไม่เสร็จ

- ทำ live CHIRPS D1 sample sync และยืนยัน read API/UI บน Workers Preview หลังได้ D1 auth; full raster coverage ยังไม่ ingest และ sample ต้องคง `partial`
- ขอสิทธิ์ resource อื่นที่ยัง pending จากเจ้าของข้อมูลเมื่อจำเป็น
- ยืนยัน GitHub Actions secret และ schedule run หลัง workflow ถูกนำเข้า GitHub
- ตรวจ `/smart-farming` ด้วยตาที่ 390px และ 1440px (in-app Browser ครั้งนี้ไม่มี visible surface จึงวัด viewport ไม่ได้; breakpoint `1024/640/390` และ `prefers-reduced-motion` มีใน CSS module แต่ยังไม่ยืนยันเชิง visual)
- ตรวจ `/food-safety` ด้วยตาที่ 390px และ 1440px (in-app Browser ไม่มี visible surface เช่นเดียวกัน; CSS มี breakpoint `640/768/1024/1200` + `max 760/420`, `.tableScroll{overflow:auto}` + `.table{min-width:880px}` แต่ยังไม่มีหลักฐานเชิง visual) และเพิ่ม nav key `'food-safety'` ใน `shell.tsx` — หน้าที่Lane 5 สร้าง currently ใช้ `active="explore"` เพราะถูกสั่งห้ามแตะ `shell.tsx`
- ตรวจ `/gi-products` ด้วยตาที่ 390px และ 1440px — in-app Browser ตอบ `viewport=0x0 visible=false` เหมือนสอง lane ก่อน จึงตรวจได้แค่ DOM/CSSOM (ยืนยันแล้วว่า `min-width` เกิน 390px มีเพียงตาราง 2 ตัวซึ่งอยู่ใน container `overflow-x:auto`); พร้อมเพิ่ม nav key `'gi-products'` ใน `shell.tsx` แล้วสลับ `<Shell active="crops">` ชั่วคราวของหน้านี้
- เพิ่ม nav key `'labor'` ใน `shell.tsx` แล้วสลับ `<Shell active="explore">` ของหน้า `/labor` (lane labor ถูกสั่งห้ามแตะไฟล์ร่วม); ตรวจ visual `/labor` เพิ่มเติมด้วยตาในเบราว์เซอร์จริงถ้าเครื่องมือมี visible viewport
- เชื่อมเมนู `/fertilizer` ภายใต้ “ดินและปุ๋ย” ใน `shell.tsx` (lane fertilizer ห้ามแตะไฟล์ร่วม) และยืนยันสูตรกับนักวิชาการเกษตร/ผลวิเคราะห์ดินจริงก่อนใช้แนะนำเกษตรกร
- Production domain mapping (เมื่อต้องการเปลี่ยนจาก `workers.dev` เป็น custom domain)

## ทำต่อ

1. ตั้ง runner D1 API token และลงชื่อเข้าใช้ `cf auth login` แยกกัน; จากนั้นรัน dry-run และ sync ตัวอย่าง 3 cells ด้วย `python scripts/sync_hub_numeric.py --write` (writer จะอ่าน source สดเอง).
2. Deploy preview ด้วย `node scripts/deploy_preview.mjs --deploy` และตรวจ `partial` completeness, source retrieval date และ grid cells ใน API/UI.
3. เพิ่ม workflow ที่ยัง untracked เข้า GitHub โดยคำสั่งผู้ใช้ แล้วตรวจ Actions run/secret/schedule.
4. พิจารณา production domain เมื่อ data rights และ hosting พร้อม.

ประวัติก่อนปรับแบบอยู่ที่ [archive](archive/2026-10-24-redesign/README.md)

## Climate History & Reanalysis `/climate-history` (25 ต.ค. 2569)

- เพิ่มโมดูลวิเคราะห์แนวโน้มภูมิอากาศย้อนหลัง 10–20 ปี ราย 77 จังหวัด (สร้างโดย sub-agent 1A/1B/1C ขนาน): `web/lib/hub/climate-history-data.ts`, `web/app/api/v1/climate-history/route.ts`, `web/app/climate-history/page.tsx`, `web/components/climate-history-dashboard.{tsx,module.css}` — ไม่แก้ไฟล์ร่วม (shell.tsx/d1.ts/schema)
- สถิติ: อุณหภูมิเฉลี่ยรายปี + แนวโน้ม °C/ทศวรรษ, วันคลื่นความร้อน Tmax>38 °C, ฝนสะสมรายปีเทียบ baseline, ฝนทิ้งช่วงยาวสุด/จำนวนครั้ง; ตารางปีผิดปกติ (ร้อนสุด/แล้งสุด/ฝนสุด/วันร้อนสุด/ฝนทิ้งช่วงยาวสุด)
- Governance: ค่ายังเป็น deterministic sample จาก climatology แบบ ERA5 (Open-Meteo CC-BY-4.0, attribution ครบ) เพราะ license_status `pending` — `meta.access=metadata_only`, `sample: true`, warnings ภาษาไทย, grid_point 0.25° ~27 กม. ระบุชัดว่าไม่ใช่สถานีจริงและไม่ใช่ coverage
- ตรวจแล้ว: tsc ไฟล์โมดูล clean, curl API 200/400 ตามกฎ, browser snapshot UI ครบ + เปลี่ยนจังหวัดได้ + console ไม่มี error; ยังไม่ตรวจภาพจริง 390/1440px (viewport ไม่พร้อม) และยังไม่ commit/deploy

## Local environment sync (26 ต.ค. 2569)

- รวม `.env` ที่ root จาก `T:/web/npt_dashboard` (`doc_2026-08-11_10-54-53.env` + `.env.local`): 68 คีย์ รวม GISTDA, Meteostat, DWR, TMD NWP/TMD API, CDSE, DOAE/PPSF, AI keys, Supabase และเพิ่ม default `TADIH_ENV`/`TADIH_DATA_DIR` กับ config D1 จาก `.env.example`; สร้าง `web/.env.local` สำหรับ Next.js (CF_ACCOUNT_ID, CF_D1_DATABASE_ID, token/DSN ว่าง)
- หลักฐาน: `git check-ignore` ยืนยัน `.env`, `.env.local`, `web/.env.local` ถูก ignore; `get_agency_keys_overview()` รายงาน GISTDA/METEOSTAT/DWR `configured=True`
- `OPEND_API_KEY` ตั้งค่าเมื่อ 26 ต.ค. 2569 และทดสอบผ่าน: `package_search?q=doae` → 200/count 480; `datastore_search` resource DOAE → 200/total 831 records; ยืนยันว่าโหลดจาก `.env` ด้วย `env -u OPEND_API_KEY` (ไม่พิมพ์ค่า key)
- ค้าง: `DATA_GO_TH_API_KEY`, `DOAE_CKAN_API_KEY`, `CF_D1_TOKEN`, `TADIH_DATABASE_URL` ยังไม่มีค่า

## API health check (26 ต.ค. 2569)

- ตรวจแบบ read-only/bounded 28 รายการ (ไม่พิมพ์ค่า credential): ผ่าน 25 — CKAN 12 แหล่ง (doae 201, oae 202, dof 72, cad 49, nabc 591, alro 50, acfs 26, royalrain 28, hii 36, opsmoac 78, ldd 30, dld 36 datasets), GISTDA flood 7d 10 polygons, Meteostat station 48455 (3 observations ช่วง 10–12 ต.ค.; ช่วง 20–22 ต.ค. ยังว่าง), DWR 302 records, RID 461 reservoirs, Open-Meteo, NABC (monthly 200; daily 200 แต่ 0 rows สำหรับสินค้าที่ทดสอบ), CHIRPS 819 tif links, Planetary Computer 1 STAC item, NASA POWER, TMD WeatherToday (XML 129 KB; ต้องใช้ browser User-Agent), CDSE OAuth token, Supabase (anon + service_role ใช้ได้), PPSF login page 200
- ไม่ผ่าน/ต้องแก้: MOC `https://dataapi.moc.go.th/gis-products` คืน HTTP 500 หลัง ~40s (ต้นทางล่ม; ไม่ใช่ connector ที่ใช้งาน) — **TMD NWP แก้แล้ว 26 ต.ค.:** path ที่ถูกต้องคือ `/nwpapi/v1/forecast/location/daily/place` (และ `/daily/at`) ไม่ใช่ `/forecast/location`; ทดสอบด้วย Bearer token ได้ 200 และเพิ่ม connector/CLI แล้ว (ดูหัวข้อ TMD NWP Connector ด้านล่าง)
- **D1 auth (26 ต.ค. 2569):** wrangler OAuth เดิมหมดอายุ 2026-07-13; หลัง `wrangler login --device` ใหม่เมื่อ 03:22 UTC อ่าน D1 ได้จริง — 12 sources, 1,237 datasets, 3,777 resources, 0 observations. ทดสอบ web ด้วย token ชั่วคราวแล้ว: `/sources`, `/datasets`, `/sources/doae/status` และ `/open-data` คืน `runtime=database` (1,237 datasets, 12 agencies) แทน `source_api_fallback`
- OAuth access token จาก wrangler หมดอายุ 04:22 UTC และ `CF_D1_TOKEN` ยังว่าง — ต้องสร้าง Cloudflare API token (Account > D1 > Edit) ใส่ทั้ง `.env` และ `web/.env.local` สำหรับใช้ต่อเนื่อง/CI; Python D1Client อ่าน wrangler token ได้แต่ไม่ refresh เอง
- Web API: 32 routes — 27 คืน 200 โดยตรง, 3 route (`/weather`, `/climate-history`, `/fertilizer`) คืน 200 เมื่อส่งพารามิเตอร์ครบ, `/open-data` คืน 200 เมื่อมี D1 token, `/weather-engine` 503 by design (license pending); dev server ไม่มี error แฝงใน log

## TMD NWP Connector (26 ต.ค. 2569)

- Endpoint จริง: `GET /nwpapi/v1/forecast/location/daily/place?province=…&amphoe=…&fields=tc_max,tc_min,cond` และ `/forecast/location/daily/at?lat=…&lon=…` ด้วย `Authorization: Bearer $TMD_NWP_ACCESS_TOKEN`; path `/forecast/location*` ที่เคยลองคืน 404
- เพิ่ม `src/tadih/tmd_nwp.py` (place/point, fail-closed, missing คง null, grain `location × valid_at`, `license_status=pending`, หน่วย/`cond` ยัง pending official), env getters + `TMD_NWP` overview, CLI `tmd-nwp`, และ `tests/test_tmd_nwp.py` 9 tests
- หลักฐาน: live call `--province นครปฐม --amphoe เมืองนครปฐม` → 200/`status=ok`, 1 record วันที่ 2026-10-26, `tc_max=36.43`, `tc_min=24.93`, `cond=4`; ไฟล์ staging `data/local/tmd_nwp/…` (gitignored); unittest 20/20 (new + cli + env)
- เปลี่ยน token ใหม่ใน `.env` (gitignored) เมื่อ 26 ต.ค. 2569: ออก 07:58 UTC หมดอายุ 2027-10-26 07:58 UTC; ทดสอบ place/point ด้วย `env -u TMD_NWP_ACCESS_TOKEN` → `status=ok` ทั้งคู่ แสดงว่าโหลดจาก `.env` ได้โดยไม่ต้องส่ง token inline
- ข้อจำกัด: docs ทางการตอบ 403 จาก WAF, CA bundle ของ Python เครื่องนี้เก่า (ใช้ `trusted_ssl_context()`), daily endpoint คืน 1 วัน; ยังไม่ ingest/deploy

## Cloudflare D1 persistent token (26 ต.ค. 2569)

- สร้าง API token `TADIH D1 sync` ใน Cloudflare Dashboard (Account > D1 > Edit) และเก็บใน `.env` + `web/.env.local` (gitignored; ไม่พิมพ์ค่า token)
- หลักฐาน: `/user/tokens/verify` → `success=true`, `status=active`, `expires_on=null`; D1 REST อ่าน sources 12, datasets 1,237, resources 3,777, observations 0; write probe CREATE/INSERT/DROP ตาราง `_tadih_token_probe` สำเร็จและลบแล้ว; `connect_d1_client()` อ่าน token จาก `.env` คืน 12 sources; `GET /api/v1/sources` คืน `runtimeMode=database` 12 sources; `npx wrangler d1 execute` ด้วย `CLOUDFLARE_API_TOKEN` สำเร็จ
- คงเหลือที่ยังไม่มีค่า: `DATA_GO_TH_API_KEY`, `DOAE_CKAN_API_KEY`, `TADIH_DATABASE_URL`

## TMD HPC NWP Grid Integration `/nwp` (26 ต.ค. 2569 — รอบ 2)

- เพิ่มหน้า `/nwp` + API 3 route (`/api/v1/nwp/runs|grid|provinces`) และ pipeline จริง: `src/tadih/tmd_hpc_nwp.py` (ดึงจาก hpc.tmd.go.th), `src/tadih/tmd_hpc_normalize.py` (gridded 0.15°, จังหวัด `max_within_25km`), `scripts/sync_tmd_hpc_nwp.py` (CLI `list|fetch|normalize|export|publish`), `db/cloudflare/0003_nwp.sql`, `config/nwp_thresholds.json`, `web/lib/hub/nwp-{data,types,risk,thresholds}.ts`, `web/app/nwp/page.tsx`, `web/components/nwp-{dashboard,heatmap}.tsx` (SVG ล้วน, ไม่มี dependency แผนที่)
- **ข้อมูลจริง:** run `tmd_hpc_d02_2026102600` (init 2026-10-26T00:00Z, d02) — ดึง 5 ไฟล์จริง 334,054,147 bytes (318.6 MiB) พร้อม SHA-256 ใน manifest; normalize ได้ 221 snapshot (p1h 72 / p24h 3 / t2m 73 / rhum 73) + 17,017 แถวจังหวัด, grid 67×107 = 7,169 เซลล์, `max_snapshot_bytes=111,074`; `export` → payload 73,136,072 bytes (69.7 MiB), `payload_sha256=f6db0d8c…`; `publish --dry-run` → exit 0, `write_performed=false`
- **ตรวจสอบ:** python `unittest` 3 ชุด NWP → 108/108 OK; `npm --prefix web run typecheck` 0 error; `npm --prefix web run test` ผ่าน 99/100 (fail เดียวคือ `governance-containment.test.ts` ที่ hardcode registry 82/81/1 ขณะที่ registry ถูก lane อื่นแก้เป็น 87 รายการ — เป็นของเจ้าของ licence lane, ไม่แตะ); `npm --prefix web run build:vinext` build complete มี route `ƒ /nwp`; `GET /nwp` 200 มี H1 + ลิงก์เมนู; `GET /api/v1/nwp/runs` 200 `runs:[]` `access=metadata_only` พร้อม warning 4 ข้อ, พารามิเตอร์ผิด → 400
- **D1:** apply `db/cloudflare/0003_nwp.sql` แล้วแบบเพิ่มเท่านั้น → ตาราง `nwp_runs/nwp_snapshots/nwp_province_values` + index 2 ตัวมีอยู่จริง แต่ **0 แถว**
- **API matrix ตรวจจริง:** 200 (`runs`) · 400 `INVALID_QUERY` (query ผิดรูปแบบ) · 404 `NWP_NOT_FOUND` (รอบไม่มี/ไม่พบ) · 403 `NWP_PUBLICATION_DISABLED` (แทรกแถว `metadata_only` ชั่วคราวแล้วลบ) · 503 `HUB_DATABASE_NOT_CONFIGURED` (เรียก route จริงใน process ที่ไม่มี credential) — ผ่านครบ 5 แบบ; เส้นทาง 200 ที่มีตัวเลขจริงทดสอบด้วย runner ในหน่วยความจำจาก export จริง (grid 57,066 bytes, 7,169 เซลล์, null 659 เซลล์, unit=null; provinces 77 จังหวัด) **โดยไม่เขียน D1**
- **บล็อก:** `config/resource_licenses.json` ยังไม่มีแถว TMD HPC NWP → writer fail-closed ที่ `RESOURCE_APPROVAL_MISSING`; ต้องเปิดทะเบียนในงาน licence review (R1-A) ก่อน หน้า `/nwp` จึงยังแสดง empty state
  - หลักฐาน: `publish --run-id tmd_hpc_d02_2026102600 --write` → exit 1, `errorCode=RESOURCE_APPROVAL_MISSING`, และ D1 ยังมี 0 แถวทั้ง 3 ตารางหลังรัน (gate ที่ `scripts/sync_tmd_hpc_nwp.py:651` เรียกก่อนเขียนแรก)
  - กุญแจสำหรับ R1-A: matcher ที่ `scripts/sync_tmd_hpc_nwp.py:645` รับ `source_id` = `tmd_hpc_nwp`/`tmd_hpc` หรือ `resource_key` ขึ้นต้นด้วย `tmd_hpc`; ต้องมีเพียงแถวเดียว พร้อม `license_status=approved_public` + `project_publication_approved=true` + `unresolved` ว่าง
- **สถานะ test ทั้ง repo:** `python -m unittest discover` → 538 tests, failures=13, errors=12, skipped=1 — **ไม่มีข้อผิดพลาดที่เกี่ยวกับ NWP** (ชุด NWP 108/108 + `tests.test_tmd_nwp` 10/10 + NWP web-only 41/41); ตัวที่แดงเป็นของ Round 1/ licence lane เดิม
- **กับดักระหว่างทดสอบ:** `.tmp_qa/` ไม่ได้ถูก gitignore จริง (`.gitignore:22` เป็นบรรทัดว่าง) — `git ls-files --others --exclude-standard .tmp_qa` ยังแสดงไฟล์ จึงต้องลบทิ้งก่อน `git add .`; `fetch --probe` ต้องมี `--init-time` ด้วย; browser-use MCP รายงาน viewport 0×0 ทำให้เช็ค overflow เพี้ยน ต้องใช้ CDP `Emulation.setDeviceMetricsOverride` แทน
- **ข้อจำกัด:** `t2m` ต้นทางเป็น Kelvin (แปลงแล้วแต่ unit ยัง null), `rhum` เป็น %, `ws10m` ระงับเพราะต้นทางสลับคอลัมน์กับ `wd10m`, `p24h` ใช้ layout `daily_z` (`HH:MMZ YYYY-MM-DD`)
- **คำสั่งรับต่อ:** `PYTHONPATH=src .venv/Scripts/python.exe scripts/sync_tmd_hpc_nwp.py publish --run-id tmd_hpc_d02_2026102600 --write` (หลังเปิดทะเบียน licence; เขียนซ้ำจะได้ `skipped_identical`)
- รอบนี้ไม่ commit และไม่ deploy; `.env`/`.env.local`/`data/local/` ยัง gitignored
