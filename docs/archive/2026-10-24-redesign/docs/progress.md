# สถานะโครงการ 24 ตุลาคม 2569

## การสำรองและกู้คืนคลังข้อมูลและการตรวจสอบความถูกต้องทั้งระบบ (Automated Backup & Restore Verification)

พัฒนา `src/tadih/backup_restore.py`, `scripts/verify_backup_restore.py` และชุดการทดสอบ `tests/test_backup_restore.py` เพื่อให้เป็นไปตามข้อกำหนดความน่าเชื่อถือและการกู้คืนระบบ (Disaster Recovery & Reliability Requirements) สำหรับศูนย์ข้อมูลเกษตรระดับประเทศ:
1. **การสำรอง DuckDB Warehouse เชิงประจักษ์:**
   - ทำการสำรองฐานข้อมูล `data/local/tadih.duckdb` สู่ `data/local/backups/tadih_20261024T170321Z_a6e191942008779b.duckdb` (ขนาด 61,353,984 bytes)
   - ตรวจสอบความถูกต้องของ SHA-256 checksum ของไฟล์สำรอง เทียบกับไฟล์ต้นฉบับ 100%
2. **การจำลองการกู้คืนและตรวจสอบตารางแบบ Read-Only:**
   - เปิดไฟล์สำรองในโหมด Read-Only เพื่อทดสอบความสมบูรณ์
   - ตรวจสอบโครงสร้าง 24 ตารางในคลังข้อมูลครบถ้วน: `dim_province`, `dim_source`, `observations`, `latest_observations`, `fact_spatial_evidence`, `fact_natural_water_reservoir`, `fact_evidence_policy_match` ฯลฯ
   - ยืนยันข้อมูลจริงตรงกับต้นฉบับ: Latest Observations 141,699 แถว, Spatial Evidence 115 แถว, Natural Water Reservoirs 302 แถว, Policy Matches 77 แถว
3. **การตรวจสอบความสมบูรณ์ของชุด Export Snapshots ทุกชุด (Private และ Public):**
   - ตรวจสอบความถูกต้องของ 17 ชุด export snapshots (9 private snapshots และ 8 public snapshots)
   - คำนวณ SHA-256 ของไฟล์ `.csv`, `.parquet`, `.json` ทุกไฟล์เทียบกับ `manifest.json` ของแต่ละ snapshot ปรากฏว่าผ่าน 100% ไม่มีไฟล์เสียหายหรือถูกดัดแปลง
4. **การบันทึกหลักฐานและการทดสอบ:**
   - รายงานผลอย่างเป็นทางการบันทึกไว้ใน `data/local/probes/backup-restore-audit.json`
   - Python unit tests: 4 tests ใน `tests/test_backup_restore.py` ผ่าน 100% ใน 0.75 วินาที
   - ยอดรวมชุดการทดสอบ Python ของโครงการเพิ่มเป็น **289 tests ผ่านทั้งหมด 100%** (ข้าม 1 test ที่อิง legacy PBIP)

## ระบบบูรณาการหลักฐานเชิงพื้นที่หลายแหล่ง (Multi-Source Area Evidence Engine) ครบ 77 จังหวัด

พัฒนา `src/tadih/area_evidence.py` และบูรณาการใน Next.js web application (`web/components/province-evidence.tsx`, `web/app/areas/[provinceCode]/page.tsx`, `web/app/api/local-data/route.ts`) เพื่อให้เจ้าหน้าที่และหน่วยงานวิเคราะห์และวางโครงการตรงพื้นที่และปัญหาจริง โดยเชื่อมโยง 4 มิติหลักฐาน:
1. **รายงานความเสียหายจากภัยพิบัติ (DOAE P0):** ดึงข้อมูลจาก `fact_spatial_evidence` ใน `tadih.duckdb` แสดงพื้นที่เสียหายจริงจากอุทกภัยในเขตชลประทาน, นอกเขตชลประทาน, ภัยแล้ง, และพื้นที่เฝ้าระวังเสี่ยงขาดแคลนน้ำ ระดับจังหวัด โดยไม่สังเคราะห์คะแนนรวมจำลอง
2. **แหล่งน้ำธรรมชาติและอ่างเก็บน้ำ (DWR):** ดึงข้อมูลจาก `fact_natural_water_reservoir` แสดงอ่างเก็บน้ำขนาดเล็กและขนาดกลางในพื้นที่ พร้อมชื่อ, อำเภอ, ความจุ, และปริมาตรกักเก็บ (ล้าน ลบ.ม.) รักษาระดับพื้นที่ native spatial grain `reservoir`
3. **สรุปแถวเพาะปลูกในเครื่อง 3 ชุด:** แสดงจำนวนแถวข้อมูลจริงที่รวบรวมไว้สำหรับจังหวัดนั้น ได้แก่ พืชล้มลุก (รต.01 50,103 แถว), ไม้ยืนต้น (54,192 แถว), และแผนเพาะปลูกฤดูแล้ง (599 แถว) พร้อมชิปนำทางเปิดตารางจริงทันที
4. **การจับคู่มาตรการและโครงการเตรียมการ (Intervention Matching):** วิเคราะห์จับคู่ปัญหากับมาตรการตาม `fact_evidence_policy_match` โดยคงสถานะ Fail-Closed `UNVERIFIED` ป้องกันการอนุมานช่องว่างเป็นศูนย์ พร้อมแสดง Candidate Initiatives จากประกาศทางการ DOAE 4 เม.ย. 2566
5. **หลักการคุ้มครองข้อมูล 5 ประการ:**
   - Zero Synthetic Risk Scores: ห้ามสร้างคะแนนความเสี่ยงสังเคราะห์
   - Fail-Closed Gap Inference: ช่องว่างข้อมูลแสดง UNVERIFIED ห้ามตีความว่าไม่มีปัญหา
   - Native Spatial Support: รักษา grain ระดับจังหวัด/อ่างเก็บน้ำ ไม่เฉลี่ยข้ามเขต
   - Pending License Preservation: ข้อมูลคงสถานะ pending license เข้าถึงเฉพาะ workstation session
   - Workstation Session Gate: มี concurrency protection รองรับ 4 readers พร้อม graceful retry

ผลการทดสอบและการรับรอง:
- **Python Unit Tests:** 285 tests ผ่าน 100% (`tests/test_area_evidence.py` 4 tests ครอบคลุม query logic, fail-closed policy, candidate project matching, input validation, และ local_data router)
- **Node Unit Tests:** 8 tests ผ่าน 100% (`web/tests/area-evidence.test.ts` ตรวจสอบ schema bounds, injection safety, และ strict dataset/view validation)
- **Next.js Production Build:** 108 static/dynamic pages ผ่านใน 1.5 วินาที
- **Playwright Browser Test Suites ครบ 5 ชุด ผ่าน 100%:**
  1. `check_area_web.mjs`: ผ่านครบ 6 checks (77 ทะเบียนอ้างอิง, ตรวจสอบความถูกต้องแถวพืชข้าวนาปีนครปฐม 97 แถวตรงกับ independent JSONL scan, pagination, reload, mobile viewport, build traces 18 traces ปลอดภัย)
  2. `check_web_browser.mjs`: ผ่านครบ 13 checks (17 catalog records, 6 categories, navigation, mobile, desktop)
  3. `check_local_web.mjs`: ผ่านครบ 7 checks ครอบคลุม 9 มุมมองตารางจริง
  4. `check_price_web.mjs`: ผ่านครบ 7 checks ครอบคลุม 24 เดือนเทียบ raw capture checksum
  5. `check_rice_pilot_web.mjs`: ผ่านครบ 5 checks ครอบคลุมกรณีข้าวนาปีนครปฐม เชื่อมโยง 3 แหล่งจริง
- **Trace & Secret Audit:** 18 build traces ตรวจสอบไม่พบการรั่วไหลของ private data หรือ .venv สู่ client bundle, static HTML และ source files 495+ ไฟล์ ปลอดภัยจาก configured secrets

## สถิติแผน-ผลโครงการเกษตรอินทรีย์ PGS (กรมพัฒนาที่ดิน) และ 9 มุมมองตารางจริง

เพิ่มสถิติเป้าหมายและผลการดำเนินงานโครงการพัฒนากลุ่มเกษตรกรผู้ผลิตเกษตรอินทรีย์ด้วยระบบการรับรองแบบมีส่วนร่วม PGS จากกรมพัฒนาที่ดิน (LDD CKAN package `ord02`, resource `2feb3230-cf86-4560-95f5-93e58270a7d8` 202 แถว พร้อมพจนานุกรมข้อมูล `186d7cee-2443-4fc7-8a77-c7b7d574ea77` 11 แถว) เก็บใน `data/local/pgs-progress/` มี staging SHA `6f8fe5438843e7cafb75c1a07f79ee64ee96f0890a0a7e7e1ee25c9fd6999a88`

ตรวจความสมบูรณ์และเกณฑ์ความปลอดภัยข้อมูลเข้มงวด:
1. Native grain คือ "หน่วยงานผู้รายงาน × ปีงบประมาณ × ประเภทกลุ่ม" ไม่ใช้ชื่อหน่วยงานแทนพื้นที่เป้าหมายหรือจังหวัดที่ได้รับประโยชน์
2. แยก 4 ตัวชี้วัด: กลุ่ม (กลุ่ม), เกษตรกร (ราย), พื้นที่ (ไร่) และงบประมาณที่รายงานว่าดำเนินการได้ (บาท)
3. Guard rails รายแถว: เป้าหมายศูนย์หรือขาดค่าให้ร้อยละเป็น null, แถวผลรวม/หน่วยงานแม่ (สพข./รวมประเทศ) และประเภทกลุ่มขั้นที่ไม่ได้รับรองถูกกันไม่ให้คำนวณร้อยละ, ปฏิเสธการรวมยอดข้ามหน่วยงานหรือประเภทกลุ่ม
4. เพิ่มรายการที่ 17 ใน `web/data/catalog.json` (17 รายการ) และเชื่อมโยงใน `/projects` สำหรับเปิดสถิติที่หน่วยงาน “นครปฐม” รายงานในเครื่อง
5. ขยายมุมมองตารางจริงใน workstation mode เป็น 9 มุมมอง (พืชอายุสั้น 50,103, พืชอายุยาว 54,192, แผนฤดูแล้ง 599, ราคาหอมมะลิ 189, ราคาทุกสินค้า 7,658, น้ำ 25,816, ฝน ERA5 54,795, MODIS 20, และ PGS 202 แถว)

ผลการตรวจรอบล่าสุด 24 ต.ค. 2569:
- PGS focused tests 4 tests ผ่าน; Python full suite 290 tests ผ่านและข้าม 1 legacy test ที่อิง PBIP
- Node tests 8 ผ่าน, typecheck ผ่าน, ESLint 0 errors และ 1 warning เดิมใน `province-evidence.tsx`; Next.js production build 108 pages ผ่าน
- Playwright: local 10 checks ครบ 9 views, catalog 13, areas 6, prices 7, rice pilot 5 checks ผ่านทั้งหมด; local test ตรวจปีงบ/ไม่มีตัวกรองพืช/สถานะภาษาไทย/ตาราง mobile และ public mode ไม่แสดงตัวเลขแม้มี local-session cookie
- Build trace 18 รายการไม่มี private paths; ตรวจ 24 rendered public files ไม่พบ sentinel แถว PGS; staging SHA ตรง ดู `data/local/probes/web-pgs-v1/final-artifact-check.json`
- ภาพ PGS desktop/mobile อยู่ `data/local/probes/web-data-v1/desktop-pgs-progress.png` และ `mobile-pgs-progress.png`; สิทธิ์ยัง pending และไม่ได้ deploy/push

## ดัชนีจำนวนแถวตามจังหวัด

เพิ่ม summary view บน `/areas` ให้นับแถวต้นทางใน staging ของพืชอายุสั้น พืชอายุยาว และแผนฤดูแล้งแยก 77 จังหวัดผ่าน workstation session เท่านั้น ตรวจ SHA-256 ของแต่ละไฟล์ก่อนอ่านและส่งเฉพาะจำนวนแถว; ชื่อจังหวัดที่ไม่ตรงทะเบียนแยกไว้ ไม่ส่งค่า observation หรือสรุปผลผลิต/พื้นที่ และระบุว่า “ไม่พบแถว” ไม่ได้แปลว่าผลผลิตเป็นศูนย์

ผลที่ตรวจรอบนี้: Python `py_compile` ผ่าน, web typecheck ผ่าน, lint 0 errors/1 warning เดิมใน `province-evidence.tsx`, production build 108 pages ผ่าน. เปิดหน้า local 3123, เริ่ม workstation session และเห็นตารางครบ 77 จังหวัด; นครปฐมมี 998/792 แถวในสองชุดผลิตและไม่พบแถวในแผนฤดูแล้ง 2569. default mode 3124 ซ่อนตัวเลขแม้ browser มี local cookie; หยุด test server หลังตรวจ. เป็น manual browser check ไม่ใช่ production acceptance. สิทธิ์ตัวเลขทุกชุดยัง pending และยังไม่ deploy/push.

## ตรวจพื้นที่ดิสก์

ตรวจแบบอ่านอย่างเดียวเมื่อ 24 ต.ค. 2569: C: เหลือ 112.40 GB และ D: เหลือ 67.90 GB. `data/local` ใช้ 5.77 GB โดยหลักคือ DOAE P0 2.98 GB และ archives 1.69 GB; `exports/private` ใช้ 0.72 GB. ไม่มีการลบ เพราะชุดใหญ่เป็น staging/backup ที่ยังมีประโยชน์หรือยังตรวจการกู้คืนไม่ได้ครบ. `data/local/powerbi` ใช้ 0.26 GB และไม่อยู่ในเส้นทางเว็บปัจจุบัน แต่ยังไม่ได้ลบจนกว่าจะตรวจ manifest/สำเนาที่กู้คืนได้.

## หน้าโครงการที่มีหลักฐานประกาศและผลตรวจช่วงนำร่อง

ปิดงานตรวจช่วงนี้แล้ว fresh reviewer `/projects` ให้ `ship` สำหรับหน้านั้น/nav/cross-linkตามภาพสามขนาด ไม่ใช่ verified implementation หรือ full-goal acceptance documenterบันทึกทั้ง pilot และ projects ใน DESIGN/sidecarแล้ว เปิดกรณีในเบราว์เซอร์เจ้าของงานจริง เลือกบริบทราคาด้วย UI และยืนยันราคา/ฝน12เดือน มี proof กับ actualviewport956×884/no page overflow ใน `web-rice-pilot-v1/user-visible-check.json`/`user-visible-proof.png` หยุด test public server3124 เหลือ local3123 ไม่ deploy/push ในช่วงนี้

เพิ่ม `/projects` และเมนู “โครงการและหลักฐาน” ใช้ project-authored descriptive facts จาก [ประกาศ DOAE 4 เม.ย. 2566](https://doaenews.doae.go.th/archives/17775) ระบุนครปฐมเป็น planned target province สำหรับกิจกรรมพืชใช้น้ำน้อยแทนนาปรังปีงบ2566/2567 แยกจาก local implementation/budget/targets/results ที่ไม่ยืนยันและเป็นคนละฤดูจาก pilot ข้าวนาปี ไม่อ่าน private DB/observations หรือเรียก numeric API ไม่มีตัวเลขเป้าหมายที่คัดจากข่าวมาจัดสรรลงจังหวัด และไม่เพิ่ม verified project registry จาก 0 เป็น 1 เพียงเพราะพบประกาศ

Browser catalog/inventory/projects รอบสุดท้ายผ่าน 13 กลุ่ม checks รวม source/date/two fiscal years/planned vs actual/season mismatch/no numeric API reads/URL/มือถือ/693px/no overflow และไม่พบ console errors; regression local tables 7 และ areas 6 ผ่านทั้ง 8 มุมมองเดิม หลักฐาน `web-v1/browser-check.json`, `web-data-v1/browser-check.json`, `web-areas-v1/browser-check.json` ไม่พบความเปลี่ยนแปลงจำนวน source rows หลังแก้สอง diagnostic rows

Pilot final browser 5 กลุ่ม checks ผ่าน และตรวจ computed SVG labels อย่างน้อย 12 CSS pixels พร้อม keyboard/contained chart scrolling เพิ่มตาม finding Fresh reviewer ให้ `ship` สำหรับ finding เดียวที่ resolved documenterบันทึก DESIGN.md/sidecar จาก final code/captures แบบโครงสร้าง ไม่ใส่ค่าผลผลิต/ราคา/ฝน/revisions ใน preview Final artifact scan `web-rice-pilot-v1/final-artifact-check.json` ตรวจ 495 source/build files ไม่มี configured secret matches และ 18 traces ไม่มี private/local/exports/venv เป็น bounded evidence เท่านั้น ไม่มี deployment และเป้าหมาย 4 ข้อยังไม่ถือว่าเสร็จ

## กรณีข้าวนครปฐมและแก้ตรรกะแผนเทียบผล

เพิ่ม `/areas/73/rice` ให้เปิดแถวผลิตข้าวนาปีตามจังหวัดต้นทาง เลือกบริบทราคาประเทศเอง และดูฝนรวมเดือนจากจุดกริด ERA5 ผ่าน workstation session เดิม รวม production evidence index/ตารางราคา/read-only warehouse/raw provenance โดยยังไม่ numerical join ข้ามแหล่ง อ่าน [รายละเอียด](rice-pilot.md) ตารางทั่วไปเดิมยัง 8 มุมมอง; pilot เป็น workflow ใช้ข้อมูลเดิมและเพิ่มการรวมฝนรายเดือนที่ผ่าน contract ไม่ใช่ source ใหม่หรือ coverage ประเทศเพิ่ม

ตรวจปี 2023 มีผลิต 97 แถว/ผลผลิต null 1/ชื่อพื้นที่ snapshot match 97 ปี 2024 ไม่มีแถวผลิตตรงกรณีและแสดง empty จริง ราคาไม่เลือกหอมมะลิเป็นค่าเริ่มต้น ต้องเลือกเองจากข้าว 3 series; ตารางและกราฟรักษาหน่วย/สินค้า/คุณภาพ/market/revision เดิม ฝนใช้ raw checkpoint canonical checksum และเทียบทุก daily observation/revision/ค่า ก่อนรวมเฉพาะเดือนครบ 365/366 วันของปี 2023/2024 ได้ 24 เดือนตรง independent Decimal sums พิกัด requested 13.8,100.25 และ provider 13.75,100.25 แสดงทั้งคู่ ไม่แทนฝนจังหวัด/น้ำชลประทาน RID ไม่มีช่วงปีตรงกับกรณีนี้

Python focused 17 tests ของ crop/pilot/rainfall/local/price/catalog ผ่าน และ plan reconciliation 14 tests ผ่าน Node query/gate tests 7 ผ่าน typecheck/lint/build ผ่าน Browser ใหม่ `web-rice-pilot-v1/browser-check.json` ตรวจ real source rows/12 ราคา/12 ยอดฝนกับ JSONL/raw อิสระ, explicit price selection, six gates ปิด, session/URL/pagination/year/empty/leap year, invalid filters/public/cross-origin/forged cookie, desktop/mobile/user window และ keyboard scroll ไม่พบ console errors ใน flow ที่ตรวจ ตรวจภาพโดยอิสระพบป้ายแกนกราฟถูกย่อเล็ก แก้ minimum native SVG width เพื่อให้ข้อความอย่างน้อย 12 CSS pixelsและตรวจซ้ำตามหลักฐานรอบสุดท้าย ไม่ใช้ผล narrow tests รับรอง deployment หรือทั้งระบบ

แก้ `plan_reconciliation.py` จากการรวมทุกพืช/หน่วยคงที่/null-or-zero/เลือก first resource เป็นการจับคู่ exact native rows ที่มี verified semantic context ครบ ปฏิเสธ subtotal/duplicate/parent code ขัดกัน/null/zero denominator/หน่วยหรือช่วงไม่ตรง Peer reviewer ยืนยัน conflicting hierarchy ถูกบล็อกแต่ valid pair ยังเทียบได้ Current audit v3 ใช้แผนฤดูแล้งปี 2569 จริง 599 แถว ไม่ใช่ summary คนละปี ฤดูฝนแผน477/ผล3 ฤดูแล้ง599/10 พื้นที่ไม่ทับซ้อน คง INCOMPARABLE ไม่มี ratio

ซ่อม `fact_plan_actual_reconciliation` เฉพาะ 2 rows จาก comparison_status null เป็น INCOMPARABLE พร้อม aliases ให้ future warehouse bridge อ่านชื่อฟิลด์ตรง สำเนาก่อนแก้ `plan-actual-warehouse-before-174c6391818c.json` และ `plan-actual-warehouse-correction-2026-10-24.json` อยู่ใน private probes ทำ transaction และตรวจ observations 141,699/projects0/project coverage0 คงเดิม ไม่เขียนค่าตัวชี้วัดหรือ sync แหล่งอื่น

ค้น official sources แบบจำกัดพบ [ประกาศ DOAE 4 เม.ย. 2566](https://doaenews.doae.go.th/archives/17775) ที่ระบุนครปฐมเป็นจังหวัดเป้าหมายในกิจกรรมพืชใช้น้ำน้อยทดแทนนาปรัง ปีงบ2566/67 แต่ไม่มีผล/เป้าหมายเฉพาะนครปฐม/พุทธมณฑลและเป็นคนละฤดู เก็บ `official-project-candidates-2026-10-24.json` เป็น candidate เท่านั้น ทะเบียนโครงการที่ตรวจยืนยันยัง 0 ไม่คืนข้อสรุป coverage/ผลสัมฤทธิ์ W3/W4 ยังไม่ครบเกณฑ์ตาม [แผน](../tasks/plan.md) สิทธิ์ pending ไม่มี numeric public export ไม่มี raw เพิ่มนอกจากการอ่านหน้าเว็บทางการเพื่อทบทวน metadata และยังไม่ deploy

## หน้า “ข้อมูลที่มี” และแก้การเลือกมุมมองราคา

เพิ่ม `/data` ด้วยคำอธิบายสาธารณะที่ผ่าน review เดิม 16 รายการ แบ่ง 6 หมวด แสดง source/grain/period/unit พร้อมลิงก์เข้าตารางที่ local reader รองรับและแนวโน้มราคา เพิ่มเมนูหลักและทางเข้าจากหน้าแรก ไม่อ่าน private inventory/raw/observations ในหน้าใหม่ ระบุว่าเป็นบัญชีคัดเลือก ไม่ใช่ข้อมูลทั้งหมดหรือ coverage ประเทศ และหอมมะลิเป็น subset ของราคาทุกสินค้า

Metadata reviewer แก้ project-authored descriptions 8 records ตาม inventory ที่ตรวจแล้ว รวมช่วงฉลากเดือนพืชอายุสั้น ม.ค. 2566–ก.พ. 2567, product MOD13A1/วันภาพ และ native grain/หน่วย/เวลาที่มีหลักฐาน คง 16 IDs/keys/สิทธิ์ pending ไม่เพิ่มค่าระเบียนหรือ counts จากต้นทาง Export ใหม่ `web/data/catalog.json` 14,302 bytes พร้อม manifest SHA ตรงกัน

พบข้อผิดพลาดจริงสองจุดและแก้แล้ว: `/explore?dataset=rainfall-reanalysis&view=price_trend` เคยเปิดกราฟราคาประเทศเพราะหน้าเว็บดูเฉพาะ view และ component ใช้ dataset ราคาคงที่ ตอนนี้หน้าและ API ใช้ `validPriceView` เดียวกัน ปฏิเสธมุมมองที่ dataset/ตัวกรองไม่เข้ากันพร้อม recovery links รักษาตัวกรองเดิม ไม่อ่าน numeric API; ลิงก์ใน source notes ของกราฟราคาเคยชี้ `/catalog/all-farmgate-prices` ที่ไม่มี record เปลี่ยนเป็น `/catalog?category=prices` ซึ่งเปิดได้จริง

Python focused 12 tests (`test_web_catalog`, `test_local_data`, `test_price_trend`, `test_catalog`), Node 6 tests, typecheck/lint/build ผ่าน Browser 12 กลุ่ม checks ของ catalog/inventory ผ่าน รวม 16 descriptions ตรง snapshot, detail URLs ทั้ง 16 ตอบ 200, หน้ารวมไม่เรียก numeric API, invalid price-view recovery, desktop/mobile/693px และไม่พบ console errors ราคา regression 7 กลุ่ม checks ผ่าน รวม 24 ค่า/revisions/สูตรเทียบกับ raw capture เดิม, valid catalog link, session/URL, gaps/null, public gate และ keyboard/mobile หลักฐานใน `data/local/probes/web-v1/` และ `web-prices-v1/` ไม่มีการดาวน์โหลด raw เพิ่ม

ภาพหน้าใหม่ desktop1440/mobile390/user693 อยู่ใน `data/local/probes/web-inventory-v1/` Artifact audit 440 source/server files ไม่พบ configured secret matches, 14 traces ไม่มี private/exports/venv, catalog SHA และ province reference bytes ตรง, public observations 0 และไม่พบ selected price sample ใน 43 static HTML เป็น bounded audit ไม่ใช่ security certification ทั้งระบบ W3/W4/W5 ยังไม่ปิดและยังไม่ deploy

Fresh finish reviewer ให้ `ship` สำหรับ `/data` และทางเข้าจาก home/nav ตามภาพที่ส่งทั้งสามขนาด ไม่ใช่ release acceptance ของศูนย์ข้อมูลทั้งหมด เปิดหน้าใหม่ในเบราว์เซอร์ของเจ้าของงานแล้ว ภาพ `web-inventory-v1/user-visible-proof.png` ทดสอบ public server 3124 เสร็จและหยุดแล้ว เหลือ local server 3123; การ restart ทำให้ session ตัวเลขเดิมหมด ต้องเริ่มใหม่จากปุ่มบนเว็บ

## บัญชีข้อมูลปัจจุบันและแฟ้มหลักฐานรายพื้นที่

ทำงานขนาน 3 agents กระทบยอดไฟล์จริงกับ current manifests/DuckDB, ตรวจแผนที่ API/schema และตรวจนิยามเดือน/รอบปลูก บัญชี [current-data-inventory.md](current-data-inventory.md) แยกข้อมูลที่เก็บจริง เว็บที่ใช้ได้ และ discovery ที่ยังไม่มีระเบียน หลักฐาน private `current-data-inventory-2026-10-24.json`, `current-access-map-inventory-2026-10-24.json` และ `production-semantics-review-2026-10-24.json` อยู่ใต้ `data/local/probes/` ไม่ดาวน์โหลด raw เพิ่ม ไม่เปลี่ยนสถานะสิทธิ์

นับ DOAE ที่ current runs เลือกจริง 51 resources: source 3,436,779 = staged 3,436,080 + quarantine 699 ตรง manifests แต่บาง CSV/archive ซ้ำเนื้อหาจึงไม่ใช่จำนวน facts อิสระ DuckDB latest ปัจจุบัน 141,699 รวม derived DOAE ที่ยังไม่ผ่านความหมายเวลา/พื้นที่ บัญชี coverage เดิม 59 entries ไม่ใช่ inventory ทั้งดิสก์ เพิ่มหมายเหตุหน้าบัญชีเดิม โดยเฉพาะ production period, MODIS product/latest และราคา conflict-null ไม่ถือ `AVAILABLE` เดิมเป็นการรับรองใช้งาน

เพิ่ม `scripts/audit_crop_evidence.py` ใช้ stdlib และ helpers เดิม สร้างดัชนีอ้างกลับแถวพืชอายุสั้นหลังตรวจ staging SHA/count และ crosswalk ชื่อสามระดับ many-to-one ไม่ให้คูณแถว ปฏิเสธชื่อ reference ซ้ำหรือรหัสผิดจังหวัด จำกัด 5,000 references ต่อกรณี เก็บ lineage, snapshot candidate codes, missing/nonnull counts และฉลากเดือน/รอบ ไม่คัดตัวเลข metric หรือ arbitrary source fields ไม่รวมยอด/ราคา/รายได้ เก็บรายงานเฉพาะ private directory ไม่เพิ่ม API/HTML/props/public export

กรณีนครปฐมรหัส 73 ข้าวนาปีฉลากปี 2566: รายงาน `crop-evidence-e13f8047beee0ebb.json` พบ 97 แถว name snapshot match 97 แถว ผลผลิต missing 1 พันธุ์ตรงตัว `ข้าวปทุมธานี 1` มี 26 แถว เทียบจำนวน/ทุก completeness metric กับ local reader เดิมตรง ตรวจ unique row refs และ evidence SHA ผ่าน สิทธิ์ pending; annual rollup, historical-boundary verification, numerical production–price join และ public release ปิดทั้งสี่ gate ไม่ใช้ label ปีรับรอง calendar/crop-year semantics

Focused Python 17 tests (`test_crop_evidence`, `test_local_data`, `test_production`, `test_catalog`) ผ่าน รวม null/zero, empty, duplicate crosswalk, wrong province, unmatched และ checksum rejection Code review แบบ read-only แก้ข้อความปีที่เคยสื่อว่าเป็น calendar year แล้ว รอบนี้ไม่มีการแก้ DB/ดาวน์โหลด raw/เพิ่ม dependency หรือ build/browser/deploy ใหม่ เว็บชุดเดิมไม่เปลี่ยน

งานต่อคือขอ dictionary/export query หรือหลักฐาน mapping ของต้นทางสำหรับเดือน/รอบปลูก แล้วเทียบหนึ่งตำบล×พืช×พันธุ์กับ RT.01 ก่อนอนุมัติผลรวม ชื่อพื้นที่ตรง snapshot ไม่ยืนยันเขตย้อนหลัง และพันธุ์ตรงกันไม่ยืนยัน moisture grade/ตลาด/เวลาขายสำหรับราคาประเทศ W3 ยังไม่ครบเกณฑ์ workflow หลายแหล่งบนเว็บ

## W3 ต่อ 24 ต.ค. 2569: แนวโน้มราคาย้อนหลังในเครื่อง

ตรวจ changed public files 75 ไฟล์และลิงก์เอกสาร 158 จุดผ่านตาม artifact report; แก้ browser harness ที่มี session 3 scripts ไม่ให้คัด raw call log/stack ที่อาจมี headers ลง failure report ใช้ error บรรทัดแรกกับ exit code แทน เปลี่ยน session และรันราคาอีกครั้งผ่านหลังแก้ harness ผลนี้ไม่ใช่การรับรองการป้องกันข้อมูลลับทุกชนิดในระบบ

งานขนานสามสายเสร็จแล้ว: ตรวจสูตรและ API path แบบ read-only, ปรับคู่มือ/checklist และบันทึก DESIGN/sidecar ตามภาพจริง ไม่มีการนำค่าราคา/ร้อยละ/revision จาก private observations เข้าเอกสารออกแบบ ผู้ตรวจเสนอแฟ้มหลักฐานข้าวนครปฐมปี 2566 เป็นงานต่อ และ parent ตรวจ SHA staging/ชื่อสามระดับ/จำนวนแถวกับ crosswalk ซ้ำ เก็บ `data/local/probes/next-workflow-review-2026-10-24.json` ใช้เป็น context composition เท่านั้น ต้องยืนยันความหมาย month/planting_round จากต้นทางก่อนรวมผลผลิต รวมทั้ง moisture grade/ตลาด/เวลาขายก่อนผูกเป็น numerical production–price join

เพิ่ม `/explore?dataset=all-farmgate-prices&view=price_trend` ใน workstation mode เดิม เลือก 44 series โดยรักษา source/product/grade/unit/market/price type/พื้นที่เดียวกัน เลือกช่วงเดือนด้วย native controls ไม่เกิน 240 เดือน อ่าน `latest_observations` จาก DuckDB แบบ read-only เป็นราคาที่เกษตรกรขายได้ระดับประเทศจาก สศก. ผ่าน NABC ไม่ใช่ค่าจังหวัด การพยากรณ์ หรือกำไร ไม่ดาวน์โหลด raw ใหม่และไม่เพิ่ม dependencies

เทียบเดือนปลายช่วงกับเดือนก่อนและเดือนเดียวกันปีก่อนตามปฏิทิน ไม่ใช้เดือนใกล้ที่สุดแทน ส่วนต่างและร้อยละใช้ค่าก่อนปัดแสดงผล ฐานศูนย์ให้เฉพาะส่วนต่าง ร้อยละเป็น null; เดือนขาดค่า/ขัดแย้งคง null และเว้นเส้น SVG ทั้งช่วงไม่มีค่าต้องแสดง empty ไม่แทนด้วยศูนย์ มี observation/revision/retrieved/release lineage ของทุกแถวที่ใช้ รวมเดือนฐานนอกช่วงกราฟ พร้อม `calculation_version` และ `evidence_sha256` วันเผยแพร่ต้นทางยังอาจไม่ทราบ จึงวิเคราะห์ย้อนหลังเท่านั้น ไม่รับรอง as-of backtest

ผลตรวจ Python focused 18 tests (`tests.test_price_trend`, `tests.test_prices`, `tests.test_local_data`, `tests.test_web_catalog`, `tests.test_catalog`), Node 5 tests, typecheck/lint/build ผ่าน Browser ใหม่ 6 กลุ่ม checks ผ่าน: เทียบ 24 ค่ากับ raw capture ที่ตรวจ checksum โดยวิธีอิสระ รวม revision/การแปลงหน่วย/ผลคำนวณ, session/URL/reload, conflict-gap จริง, gate/bounds, no-data และ mobile/keyboard หลักฐาน `data/local/probes/web-prices-v1/browser-check.json` และภาพ 3 ไฟล์ เก็บค่าราคา/ร้อยละในหลักฐานภายในเท่านั้น Detector ครั้งเดียว `[]`; finish reviewer ให้ `ship` สำหรับ 3 ภาพที่ตรวจ และ code review ไม่พบ material defect ใน price path ที่ตรวจ ไม่ใช่การรับรองทั้งระบบ

Final regression หลัง build: public catalog 9, area 6 และ local tables 7 กลุ่ม checks ผ่าน ครบ 8 มุมมองเดิม ไม่พบ console errors ใน flow ที่ตรวจ รายงานอยู่ `data/local/probes/web-v1/`, `web-areas-v1/` และ `web-data-v1/` รอบ area ตรวจ traces 15 ชุดไม่มี private/exports/venv สิทธิ์ข้อมูลคง pending ตัวเลขยังอยู่หลัง workstation gate ไม่เพิ่ม public numeric export และยังไม่ deploy

Artifact audit รอบราคา `data/local/probes/web-prices-v1/artifact-check.json` ตรวจ source/server files 237 ไฟล์ ไม่พบค่า secret ที่กำหนด ตรวจ 15 traces ไม่มี `data/local`/`exports/private`/`.venv` และมี public province reference ที่ bytes ตรง config; catalog SHA ตรง public observation rows 0 และไม่พบ numeric sample ที่เลือกใน static HTML เป็นการตรวจตามขอบเขตนี้ ไม่ใช่การรับรองทุกข้อความ/ช่องทางว่าไม่มีข้อมูลภายใน

W3 ยังไม่เสร็จ: แนวโน้มแหล่งเดียวกับจำนวนค่า missing ยังไม่ใช่ workflow เชื่อมหลายแหล่งเพื่อวางโครงการ ต้องตรวจพื้นที่/เวลา/หน่วย/revisions/coverage ตามกรณีใช้จริง W4 ทะเบียนโครงการและ W5 สิทธิ์/preview/refresh/backup/rollback/deployment ยังเป็นงานค้าง ดู [แผนเว็บ](../tasks/plan.md) และ [คู่มือวิธีใช้/contract/คำสั่งตรวจ](../web/README.md)

## ประวัติรอบ 23 ตุลาคม 2569

## W3 ต่อ: จังหวัด พืช ปี และข้อเท็จจริงเรื่องข้อมูลที่ขาด

บันทึก DESIGN/sidecar ตามภาพจริงแล้ว ตรวจ public source/server artifacts 235 ไฟล์ไม่พบค่า secret ที่กำหนด reference bytes และ catalog SHA ตรง ไม่มี observation ใน public snapshot หรือแถวตัวอย่างใน static HTML ลิงก์เอกสาร 154 จุดครบ ดู `data/local/probes/web-areas-v1/artifact-check.json`; เป็นขอบเขตการตรวจที่ระบุ ไม่ใช่ security/privacy certification ทั้งระบบ

เพิ่ม `/areas` และ `/areas/[provinceCode]` เลือกจังหวัดจากทะเบียนอ้างอิงครบ 77 รหัส โดยใช้ 3 ตารางพืชที่มีชื่อจังหวัดในต้นทาง ตัวเลือกจังหวัดไม่ได้รับรอง coverage, code/name lookup ใช้เพื่อกรองแถวตามชื่อเท่านั้น ยังไม่รับรองรหัสตำบล/การเปลี่ยนเขตย้อนหลัง เลือกพืช/ปีร่วมกับคำค้น เปิดลิงก์ตรง เปลี่ยนหน้า refresh และล้างตัวกรองโดยคงจังหวัดได้ Session เริ่มจากหน้าเดิมแล้วรักษาตัวกรอง

เพิ่ม `facets` พืช/ปีตามจังหวัด และ `completeness` ทุกแถวที่ตรงตัวกรอง: `present_rows=count(metric)` รวมศูนย์, `missing_rows=matched_rows-present_rows` ไม่คำนวณยอดพื้นที่/ผลผลิตหรือราคา ไม่ใช้ค่าประเทศหรือกริดแทนจังหวัด ไม่ถือว่ามีค่าแล้วถูกต้อง และไม่ถือแถวซ้ำเป็นหน่วยอิสระสำหรับบวก ตรวจแบบอิสระโดย Python scan JSONL ต้นทาง ไม่เรียก reader ที่กำลังทดสอบ พบข้าวนาปีนครปฐมปี 2566 ตรงเงื่อนไข 97 แถว ผลผลิตมีค่า 96 และไม่ทราบ 1 แถว; API ทุก cell หน้าแรกและตัวนับตรงกัน

แก้ 404 จังหวัดที่ไม่รู้จัก: root loading boundary เดิมทำให้ response เริ่ม streaming ก่อน `notFound` จึงตอบ 200 ลบ root loading ที่ซ้ำกับ client data loading แล้วตรวจ unknown area กลับเป็น HTTP404 จริง ส่วน invalid API year เป็น HTTP400 การอ่านจริงยังมี loading/error/empty ของ DataExplorer

ระหว่าง build ตรวจพบ parent-path tracing glob ของ Turbopack ใช้ไม่ได้ตาม [ขอบเขต project root](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory) และทดลองขยาย root ทำให้ trace อ้าง Python runtime จึงไม่ใช้แนวทางนั้น เปลี่ยนเป็น prebuild คัดเฉพาะทะเบียนจังหวัดสาธารณะไป `web/data/provinces.csv` ตรวจ bytes กับ `config/provinces.csv` และคง root เดิม ตรวจ 15 traces มี reference และไม่มี private/exports/venv ไม่ดาวน์โหลดข้อมูลใหม่หรือคัด raw เข้า Git

ผลตรวจสุดท้าย: Python focused 10 tests, Node 4 tests, lint/production build ผ่าน; `scripts/check_area_web.mjs` ผ่าน 6 กลุ่ม checks ครอบคลุม 77 refs, independent source match, session/URL, pagination/reload/clear, empty, HTTP404/400, public gate, mobile ไม่ล้นหน้า และ tracing หลักฐานพร้อมภาพ 3 ไฟล์อยู่ `data/local/probes/web-areas-v1/`; regression local data เดิม 7 และ public catalog 9 checks ผ่าน ไม่มี console warning/error ใน flow ที่ตรวจ detector ครั้งเดียว `[]` Finish reviewer อ่านภาพ desktop/mobile/empty ครบและให้ `ship` เฉพาะส่วนขยายโลกภาพเดิม ไม่มี comp/direction ใหม่ ยังไม่ deploy/เปิดสิทธิ์หรือปิด W3 เพราะยังไม่มี workflow วิเคราะห์หลายแหล่งเพื่อวางโครงการ

## แก้เว็บมีแต่สารบัญ: เปิดตารางตัวเลขจริงในเครื่อง

เพิ่ม `/explore` และตารางในหน้าแรก/รายละเอียด อ่านสถิติจาก staging ที่ตรวจ SHA และ `latest_observations` ใน DuckDB แบบ read-only โดยไม่ดาวน์โหลดหรือคัดลอก raw เพิ่ม: พืชอายุสั้น 50,103 แถว พืชอายุยาว 54,192 แผนฤดูแล้ง 599 ราคาทุกสินค้า 7,658 (หอมมะลิ 189 เป็น subset) น้ำรายอ่าง 25,816 อากาศรายจุดกริด 54,795 และ MODIS latest revision 20 แถว จำนวนนี้คือแถวในแต่ละมุมมอง ไม่ใช่จำนวนเกษตรกร/พื้นที่ครอบคลุมหรือยอดที่รวมข้ามมุมมองได้

แสดง 25 แถวต่อหน้า ค้นคำ/จังหวัดที่มีในต้นทางและเปิด URL ตัวกรองได้ ตัวอย่างแถวแรกมีพืช/พันธุ์/พื้นที่/เวลา/รอบปลูกกำกับ ไม่ตีค่าเป็นยอดจังหวัดหรือสถานการณ์ปัจจุบัน แสดง null เป็นไม่ทราบ และไม่เฉลี่ย/รวมราคาข้ามสินค้า หน่วย หรือจุด ดู [คู่มือเว็บ](../web/README.md)

โหมดตัวเลขใช้ `npm run local` bind loopback พร้อม session HttpOnly/SameSite=Strict อายุ 1 ชั่วโมง ตรวจ flag/host/origin/cookie ฝั่ง serverก่อนเรียก fixed Python module ผ่าน stdin ไม่มี shell จำกัดคอลัมน์/IDs/ขนาด query/25 แถว/เวลาอ่าน/2 readers และ no-store ข้อมูลจริงไม่อยู่ใน snapshot/static HTML โหมด start ปกติปิดตัวเลข สิทธิ์ทั้งหมดคง pending; เป็น workstation trust ไม่ใช่ multi-user authentication และยังไม่ deploy หรือเปิด partner API

ตรวจ Python focused 10 tests และ Node 3 tests พร้อม typecheck/lint/production build ผ่าน Chromium 1440×1000 กับ 390×844 ผ่าน 7 กลุ่ม checks: จำนวนแถวครบ 8 มุมมอง เทียบแถวข้าวนครปฐมกับ direct source query ตรงกัน หน่วยราคา pagination mobile และปฏิเสธ anonymous/forged session/cross-origin/public mode ไม่มี console warning/error ใน flow ที่ตรวจ หลักฐาน `data/local/probes/web-data-v1/browser-check.json` และภาพ desktop-production/desktop-prices/mobile-production ไม่ใช่การรับรองความถูกต้องทุก resource หรือ production acceptance งาน W3 ยังเหลือการเชื่อมตัวชี้วัดและหน้าพื้นที่

ตรวจ regression สาธารณะผ่าน 9 checks หลัง build สุดท้าย ตรวจ 13 file traces ไม่พบ private/venv และ source/server artifacts 211 ไฟล์ไม่พบค่า secret ที่กำหนดใน environment ไม่พบแถวตัวอย่างใน static HTML, snapshot SHA ตรง ลิงก์เอกสารภายใน 154 จุดครบ ตาม `artifact-check.json` ผู้ตรวจ finish recapture ครบ 3 ภาพแล้วให้ `ship` เฉพาะสองข้อที่แก้: บริบทแถวตัวอย่างครบและปีไม่มีตัวคั่นหลักพัน; ปรับ DESIGN/sidecar ให้ AI ถัดไปอ่านรูปแบบจริง โดยไม่ใส่ observation ในเอกสารออกแบบ

## W1/W2: เว็บ Next.js catalog ชุดแรกในเครื่อง

สร้าง `web/` ด้วย Next.js 16.4.3 / React 19.3.1 / TypeScript 5.9.3 ทดสอบบน Windows Node 24.18.0 มีหน้าแรก ค้น/กรอง/เปลี่ยนหน้า รายละเอียดข้อมูล ที่มา/แนวทางใช้ และดาวน์โหลดบัญชี JSON; URL เก็บคำค้น หมวด หน่วยงานและหน้า ใช้ snapshot ที่โครงการเรียบเรียงจากทะเบียนจริง 16 รายการ ไม่มี observation/ข้อมูลดิบ และสิทธิ์ต้นทางยัง pending ทั้ง 16 ชุด ดู [คู่มือเว็บ](../web/README.md)

`tadih.web_catalog` แยกการตรวจคำอธิบายของโครงการออกจากสิทธิ์ข้อมูลต้นทาง ปฏิเสธ metadata ที่ไม่ผ่าน review ฟิลด์เพิ่ม URL ที่มี credential/query และสถานะสิทธิ์ที่เปลี่ยนโดยยังไม่ทบทวน พร้อม manifest SHA-256 ก่อนอ่านฝั่ง server; export รวม 13,663 bytes ไม่อ่าน private data/ฐาน DuckDB จากเว็บ และไม่เรียก upstream API ขณะเปิดหน้า

ตรวจ Python `tests.test_web_catalog` + `tests.test_catalog` ผ่าน 8 tests และ Node tests ผ่าน 2; typecheck, ESLint และ production build ผ่าน ตรวจ Chromium จริง 1440×1000 กับ 390×844 ผ่าน 9 checks มีภาพ home/catalog ทั้ง desktop/mobile และ mobile detail รวม 5 ภาพใน `data/local/probes/web-v1/` พร้อม `browser-check.json` ไม่มี console warning/error ใน flow ที่ทดสอบ รวม null/pending, URL refresh, pagination, script-like query, download checksum/ETag/headers และ HTTP 404 จริงสำหรับ ID ที่ไม่รู้จัก แก้ 404 หลังพบ root loading ทำให้ notFound หลังเริ่ม streaming ตอบ 200 โดยตรึงรายละเอียดกับ IDs ของ snapshot release ผ่าน `generateStaticParams`/`dynamicParams=false`

Finish review พบข้อความรองเล็กและหมวดอยู่เหนือ heading แก้คำอธิบายเป็น 14px กับ mobile metadata 12px และย้ายหมวดสู่ข้อมูลกำกับ ตรวจ recapture ทั้ง 5 ภาพแล้ว reviewer ให้ `ship` เฉพาะ 2 fixes ที่ resolved; detector ครั้งเดียวได้ `[]` ผล npm audit ทั้งชุดและเฉพาะ production dependencies รายงาน 0 vulnerabilities ตรวจ public source/server artifacts 209 ไฟล์ไม่พบค่า secret ที่กำหนดใน environment, snapshot SHA ตรง และลิงก์เอกสารภายใน 150 จุดมีปลายทางครบ บันทึก `artifact-check.json` ไม่ใช่การตรวจความปลอดภัยครบหรือการยืนยันข้อมูลพร้อมใช้ทั้งประเทศ

เพิ่ม packages/build ที่จำเป็นรวมประมาณ 433.6 MiB (node_modules 400.38 + .next 33.20) ไม่ดาวน์โหลด raw ใหม่ ภาพ/ผลตรวจเป็น private artifacts ที่ถูก ignore ยังไม่ deploy, ไม่มี auth/partner API จริง, กราฟ/แผนที่/ทะเบียนโครงการ หรือการนำข้อมูลอากาศ v2 เข้า warehouse งานต่อ W3 ต้องเลือกตัวชี้วัดที่ผ่านพื้นที่/หน่วย/เวลา/สิทธิ์ก่อน

## เปลี่ยนเป้าหมายเป็นเว็บ Next.js ตามคำสั่งเจ้าของงาน

ยุติ Power BI ในฐานะผลิตภัณฑ์และช่องทางส่งมอบ ไม่ใช่พักไว้รอข้อมูลพร้อม ใช้ Next.js + TypeScript + App Router เป็นเว็บหลัก และคง Python/DuckDB, ingestion, coverage, crosswalk, lineage และสิทธิ์เดิม ตาม [ADR-001](decisions/0001-nextjs-web-delivery.md), [เป้าหมายศูนย์ข้อมูล](national-agriculture-data-center.md) และ [แผนเว็บ](../tasks/plan.md)

- [x] ปรับ README, AGENTS, HANDOFF, สเปกเดิม, คู่มือ และ roadmap ที่ชี้ไป BI; แยกเอกสาร BI/บันทึกเดิมเป็น legacy
- [x] กำหนดหน้าค้นหา/รายละเอียดชุดข้อมูลเป็นงานเว็บชุดแรก ตามด้วยหน้าพื้นที่ สำรวจตัวชี้วัด และทะเบียนโครงการ พร้อมเกณฑ์ contract/browser/mobile/สิทธิ์/deployment
- [x] ระบุขอบเขตย้าย: ใช้ pipeline และ exports เดิมก่อน ไม่เขียน ingestion ใหม่ ไม่เพิ่มฐานข้อมูลหรือ backend service โดยไม่มีเหตุจำเป็น และไม่ให้เว็บอ่าน raw/private โดยตรง
- [ ] W1 catalog snapshot ที่ตรวจสิทธิ์แล้ว → W2 แอปเว็บจริง → W3 พื้นที่/ข้อค้นพบ → W4 โครงการ → W5 เผยแพร่; ใช้ checklist ใน [HANDOFF](../HANDOFF.md) เป็นรายการกลาง

รอบนี้เป็นการปรับเอกสาร ยังไม่มีแอป Next.js, dependencies หรือ API/deployment ใหม่ ไม่เปลี่ยนข้อมูล สิทธิ์ environment หรือระบบออนไลน์ และไม่ลบไฟล์ BI/raw เดิม ตรวจเอกสารเปลี่ยน/เพิ่ม 18 ไฟล์และลิงก์ไฟล์ภายใน 138 จุด ปลายทางครบทุกจุด ตรวจข้อความทิศทาง/ป้าย legacy และ `git diff --check` ผ่าน ไม่รัน Python runtime suite หรือ browser; ผลตรวจเอกสารไม่ใช่ runtime/browser acceptance

## ประวัติงานก่อนเปลี่ยนช่องทางส่งมอบ

รายการด้านล่างเป็นหลักฐานตามเวลาที่ทำ ข้อความ/checkbox ที่เสนอให้กลับไปทำ Desktop/DAX/Power BI/Fabric ไม่ใช่ backlog ปัจจุบัน ให้ยึดแผนเว็บและ HANDOFF ล่าสุด

## ทำต่อ: แก้ client สถานีอากาศเป็นรุ่น 2

แก้ชื่อ/จังหวัด 4 station IDs และปรับ metadata ทั้ง 12 แห่งให้ตรงทะเบียน Meteostat ที่ตรวจแล้ว รักษา IDs เดิม; ขอ `model=false&units=metric`, แปลง `wspd` จาก km/h เป็น m/s พร้อมเก็บค่า km/h ต้นทาง, เก็บ null ตามจริง, ตรวจวัน/ID/ค่าตัวเลขและ response cap, แยก partial/empty/failed โดยไม่บันทึกข้อความ exception หรือ key ค่าเริ่มต้นเขียน `dim_weather_stations_v2.json` และ `fact_daily_weather_v2.json` เพื่อไม่แทน cache เดิมก่อน migration ดู [weather-v2](weather-v2.md)

API จริง 10–12 ต.ค. 2569 ที่ IDs 48455/48451 ได้กรุงเทพฯ 3 แถวและนครปฐม array ว่าง จึงเป็น partial 3/6 requested station-days; ตรวจ metadata สถานีตรงต้นทาง 12/12 และ conversion ของลมผ่าน หลักฐาน `data/local/probes/weather-v2-audit.json` ยืนยัน SHA-256 ของ legacy caches และ DuckDB เท่าเดิม ไม่มี warehouse ingestion/ปลดการพัก metric หรืออนุมัติสิทธิ์ ข้อมูลรายวันยัง pending และ timezone/ความเป็นตัวแทนพื้นที่ยังต้องตรวจ

ตรวจ regression แบบ red → green และ full suite สุดท้าย `python -m unittest discover -s tests -q` รัน 244 tests ผ่านโดย skipped 1 ที่อิง PBIP เก่า ใช้เวลา 78.409 วินาที; log `data/local/probes/access-map-weather-tests.log` ไม่อ้างว่า integration warehouse/Power BI v2 ผ่าน เพราะ consumers ยังอ่าน path รุ่นเดิมตามที่บันทึกในคู่มือ

## สำรวจแผนที่ข้อมูลและ API ที่เข้าถึงได้

ตรวจรายชื่อระบบ TH/GL/RS ในสเปกครบ 84 รายการผ่าน 81 entry URLs และแค็ตตาล็อก 21 เส้นทาง อ่าน metadata ครบ 15 แห่ง: data.go.th 44,383 datasets จาก 444 หน้า (ID ไม่ซ้ำ/count ตรงก่อนและหลัง) และบัญชีเจ้าของข้อมูล 14 แห่ง 2,387 รายการ รวม mapping 46,770 catalog entries และ 127,050 resource links ไม่ใช่ชุดข้อมูลอิสระทั้งหมด เพราะมี mirror/harvest; ตรวจ source identity/URL ซ้ำเป็นคำใบ้เท่านั้น ไม่รวมยอด observations ข้ามบัญชี

อ่าน schema ของ DataStore ที่ระบุ active ครบ 2,884 resources ได้ 22,512 คอลัมน์ โดย `limit=0` ได้ records 0 ทุกคำขอสำเร็จ NABC เคยติด 429 จำนวน 246 resources แล้วเว้นจังหวะตรวจซ้ำทีละคำขอจนสำเร็จครบ เก็บประวัติ attempts แต่ mapping ใช้ผลล่าสุดต่อ catalog/resource แยก data dictionary/สารบัญรายงานจากตารางที่ยังไม่ตรวจความหมาย; `join-candidates.csv.gz` ระบุคอลัมน์จริง ตารางเทียบที่เสนอ และเงื่อนไขตรวจ โดยทุก join ยัง blocked/unverified

GISTDA OpenAPI มี 54 GET operations; อ่าน feature samples 12 และ WMS/WMTS capabilities 28 ได้ อีก 14 tile templates เก็บเฉพาะรายการ DWR ArcGIS directory 67 services อ่าน layer metadata 37 ชั้น อีก 30 services มี application error แม้ HTTP 200; ไม่แปลง error เป็นข้อมูลว่าง Meteostat directory กรองประเทศ TH ได้ 123 สถานีและ inventory 2,313 รายการ ตรวจสถานีเดิม 12 IDs พบชื่อจังหวัดขัด 4 แห่งและพิกัดเดิมหลายแห่งไม่ตรง metadata; หน่วย `wspd` เป็น km/h แต่ client เดิมตั้งชื่อ `wind_speed_ms` ต้องแก้ก่อนใช้งาน

ตรวจเฉพาะชื่อ/สถานะตัวแปร environment ไม่บันทึก key หรือ headers DWR RSS ยังติด TLS issuer verification, OpenD gateway redirect ถูกบล็อกการส่ง key ข้าม host, THAGRI มี 542 ลิงก์เอกสาร แต่ generator schema ต้องมี token และตัวอย่างไม่มี token ตอบ 422; ไม่ใช้ OpenD/GISTDA key แทน token อีกระบบ DOAE private/partner key ว่าง; TADIH interface ยังไม่ใช่หลักฐาน deploy API จริง บัญชี RID/DOA/Rice/CPD/QSDS/ARDA ยังเข้าไม่สำเร็จตามผลใน mapping

หลักฐาน/ตารางทั้งหมดอยู่ `data/local/access-map/` รวม `REPORT.md`, `mapping-summary.json`, datasets/resource-links/schema-fields/join-candidates/API/systems/spatial-layers/weather-stations CSV gzip; เอกสารสาธารณะเฉพาะวิธีใช้/ผลรวมอยู่ [accessible-data-map.md](accessible-data-map.md) ไม่มี ingestion, warehouse refresh, การอนุมัติสิทธิ์ หรือข้อมูลดิบใหม่ลง Git ตรวจ focused suite `tests.test_access_map` + `tests.test_env` ผ่าน 11 tests และ `git diff --check` ผ่าน ไม่ได้ทดสอบ Power BI/DAX หรือความถูกต้องเชิงพื้นที่ทุก resource

ไฟล์สุดท้ายมี 3,780 join candidates และ 707 API/discovery entries (รวม 542 ลิงก์ THAGRI ไม่ใช่จำนวน API ที่อ่านข้อมูลสำเร็จ) ตรวจผลลัพธ์ 508 ไฟล์ด้วย `verification.json`: ไม่พบค่า secret จาก environment, ยอด CSV ตรงกับ summary ทุกตาราง และบันทึก SHA-256 manifest; metadata และตารางบีบอัดใช้พื้นที่ตรรกะรวม 32,041,064 bytes ก่อนเพิ่มตัว verification manifest

## สำรวจ insight จาก snapshot ในเครื่อง

สำรวจ insight จาก snapshot ในเครื่องและบันทึก `data/local/reports/insight-scan-2026-10-23.json`: เปรียบเทียบราคาสินค้า ก.ย. 2569, ระดับน้ำอ่างเดิม 461 แห่งระหว่าง 9–22 ต.ค., ฝน ERA5 ปี 2568 เทียบค่าเฉลี่ย 9 ปีก่อน ณ 5 จุดโดยตัด leap day, โครงสร้างปริมาณ/มูลค่าสัตว์น้ำ และการเปลี่ยนมูลค่าปศุสัตว์ เป็น descriptive analysis ตาม grain เดิม ยังไม่ยืนยันสาเหตุ กำไร หรือสถานการณ์ปัจจุบัน ไม่มีการดึงข้อมูลใหม่หรือเปลี่ยนสิทธิ์

## ตรวจแก้ผลวิเคราะห์มาตรการจาก AI รอบก่อน

ตรวจโค้ดกับหลักฐานต้นทางแล้วพบว่ารายการโครงการ 3 รายการมีงบ/จังหวัดเป้าหมายเขียนคงที่โดยไม่มีหลักฐาน resource-level และ `doae_15_01` เป็นสถิติผู้เข้าร่วม ไม่ใช่บัญชีเป้าหมายโครงการ จึงถอนการจัดจังหวัดเป็นช่องว่าง 46 จังหวัด, ครอบคลุม 12 และซ้ำซ้อน 3 ผล audit รุ่น 2: โครงการที่ยืนยันพื้นที่เป้าหมายได้ **0 รายการ**, บัตรหลักฐาน DOAE **115 รายการ**, สถานะมาตรการ **`UNVERIFIED` 77 จังหวัด**; ซิงค์ DuckDB แล้วให้ `dim_project=0`, `fact_project_coverage=0` และจำนวนโครงการใน Master View เป็น `null` เมื่อทะเบียนยังไม่พร้อม `offline-v12/v13` เป็น snapshot ก่อนแก้ ห้ามใช้อ้างตัวเลขมาตรการหรือเผยแพร่ ตรวจ [ทะเบียนโครงการ](project-register.md), [หลักฐานพื้นที่](spatial-evidence-matching.md) และ [HANDOFF](../HANDOFF.md)

แก้ DWR client ให้ตรวจ TLS certificate/hostname ตามปกติ; รอบนี้ไม่ได้ดึงข้อมูล DWR ใหม่ พักค่าข้ามแหล่ง DWR/GISTDA/HII/Meteostat ใน `v_provincial_national_intelligence` เป็น `null` จนกว่าจะตรวจ provenance/หน่วย/ช่วงเวลา/สิทธิ์ ข้อมูล HII มีคอลัมน์ `Month` กับ `COUNT 17 YEAR` แต่ยังไม่ยืนยันขอบเขตพยากรณ์จาก metadata ต้นทาง จึงไม่อ้างว่าเป็นพยากรณ์ 12 เดือนข้างหน้า และ Meteostat เก็บฝนที่ไม่รายงานเป็น `null`

ตรวจ DuckDB หลังซิงค์: โครงการที่ยืนยันได้ 0, เป้าหมายโครงการ 0, หลักฐานพื้นที่ 115, จังหวัดสถานะ `UNVERIFIED` 77/77, ค่า DWR/GISTDA/HII/Meteostat ใน Master View ที่พักไว้ไม่เป็น non-null แม้แต่แถวเดียว; `python -m unittest discover -s tests -q` ผ่าน **236 tests, skipped 1** รายการที่อิง snapshot PBIP `offline-v13` เก่า ไม่มี DAX runtime หรือการตรวจภาพ Desktop ในรอบนี้

**เช็กลิสต์ปัจจุบันสำหรับ AI รับงานต่อ:** [HANDOFF.md](../HANDOFF.md) มีงานที่ตรวจแล้ว งานค้าง ลำดับถัดไป และคำสั่งเริ่ม ส่วนหัวข้อด้านล่างเป็นบันทึกผลแต่ละรอบตามเวลา อาจมี “งานต่อ” ที่ปิดไปแล้วในรอบใหม่

รอบเอกสารนี้ปรับ [README](../README.md), [AGENTS](../AGENTS.md), [runbook](runbook.md), [roadmap DOAE](doae-catalog-expansion.md) และ [คู่มือ Power BI](../powerbi/README.md) ให้ชี้เป้าหมายศูนย์ข้อมูลเกษตรทั้งประเทศและเช็กลิสต์เดียวกัน อ้างหลักฐาน acquisition/geography/cleanup ที่มีอยู่ ไม่ได้ดึงข้อมูลใหม่ นำเข้า warehouse เผยแพร่ หรือทดสอบ DAX เพิ่ม

## การยกระดับความเชื่อมโยงระดับชาติ (Master Inter-Agency Linkage) และเตรียมโมเดล Power BI Offline (offline-v13) 23 ต.ค. 2569

- **Master Inter-Agency Database & Star Schema Linkage:**
  - เพิ่มมิติข้อมูลหลัก `dim_province` (77 จังหวัด DOPA ครบถ้วน) และ `dim_source` (17 แหล่งข้อมูลพหุภาคี) ลงสู่ฐานข้อมูลกลาง `data/local/tadih.duckdb`
  - สร้าง Master Analytical View `v_provincial_national_intelligence` เชื่อมโยง 77 จังหวัดเข้ากับข้อมูลทุกมิติแบบ Single Pane of Glass:
    - สถานะหลักฐานพื้นที่ (`fact_evidence_policy_match`); ผลมาตรการใน snapshot รุ่นนั้นถูกถอน
    - โครงการภาครัฐใน snapshot รุ่นนั้นยังไม่มีเป้าหมายรายจังหวัดที่ตรวจแล้ว (`fact_project_coverage`)
    - แหล่งน้ำธรรมชาติและปริมาตรน้ำใช้การได้ (`fact_natural_water_reservoir`) จาก DWR
    - พื้นที่นาข้าวแช่น้ำท่วมขังจากดาวเทียม Sentinel/Landsat (`fact_satellite_flood_7days`) จาก GISTDA
    - จำนวนระเบียน HII ที่มี `Month` และ `COUNT 17 YEAR` (`fact_flood_risk_forecast` ชื่อเดิม); ยังยืนยัน forecast horizon ไม่ได้
    - ข้อมูลสภาพอากาศ สถิติฝนสะสม และอุณหภูมิเฉลี่ย (`fact_daily_weather` + `dim_weather_station`) จาก TMD / Meteostat
  - ตรวจสอบความถูกต้องของ Foreign Keys (Referential Integrity) 100% ครบทุกตาราง ไม่มี orphaned records หรือรหัสจังหวัดผิดเพี้ยน
- **Power BI Offline Project Build (offline-v13):**
  - ยกระดับโครงสร้างโปรเจกต์สู่ `data/local/powerbi/offline-v13/` มี **23 ตาราง** (เพิ่มขึ้นจาก 17 ตาราง), **25 relationships** (เพิ่มขึ้นจาก 20), **49 measures** (เพิ่มขึ้นจาก 42), **8 หน้า PBIR** (เพิ่มหน้าใหม่ `water_satellite_disaster`: "Water Security & Satellite Early Warning")
  - นำเข้า 6 ตารางพหุภาคีสู่โมเดล: `dim_crop_master` (831 แถว), `fact_natural_water_reservoir` (302 แถว), `dim_weather_station` (12 แถว), `fact_daily_weather` (6 แถว), `fact_satellite_flood_7days` (10 แถว), `fact_flood_risk_forecast` (27,023 แถว)
  - เพิ่ม 7 DAX measures สำหรับงานเตือนภัยและการบริหารจัดการน้ำ:
    - `Natural Water Active Storage m3`, `Natural Water Reservoir Count`
    - `Satellite Flood Rice Area Rai`, `Satellite Flood Polygon Count`
    - `High Risk Flood Tambons Count`, `Medium Risk Flood Tambons Count`
    - `Weather Station Recent Rainfall mm`
  - ตรวจสอบความสมบูรณ์ไฟล์ (Integrity SHA-256) ผ่านครบ 54 ไฟล์ และตรวจสอบความถูกต้องของ Microsoft Fabric JSON schemas ผ่าน 30 metadata files 100% ด้วย `scripts/validate_powerbi_project.py`
  - บีบอัด NTFS บน `data/local/powerbi/offline-v13` ประหยัดพื้นที่ดิสก์ 2.1 ต่อ 1 (ลดจาก 98.9 MB เหลือ 48.0 MB)
  - จำลองคำนวณ DAX measures 15 รายการใน `tests/test_dax_simulation.py` ผ่าน 100%
  - รวมชุดทดสอบ unit tests ทั้งคลังระบบผ่าน **232/232 รายการ (100% green)** ใน 34.365s

## การนำเข้า DuckDB Warehouse และเตรียมโมเดล Power BI Offline (offline-v12) 23 ต.ค. 2569

- **National DuckDB Warehouse Sync:**
  - พัฒนาฟังก์ชัน `init_national_hub_tables()` และ `sync_national_hub_data()` ใน `src/tadih/warehouse.py` และสคริปต์ `scripts/sync_duckdb_hub.py`
  - ซิงค์แกนข้อมูลศูนย์รวมข้อมูลเกษตรทั้งประเทศสู่ฐานข้อมูลกลาง `data/local/tadih.duckdb`:
    - `national_coverage_inventory`: 59 ทรัพยากร (จำแนก native grain, missing reasons, license status)
    - `dim_project` และ `fact_project_coverage`: เนื้อหาเดิมถูกถอนหลังตรวจหลักฐาน ปัจจุบันมี 0 รายการที่ผ่านเกณฑ์
    - `fact_spatial_evidence`: 115 รายการหลักฐานความเสียหายจากอุทกภัย ภัยแล้ง และพื้นที่เสี่ยงขาดแคลนน้ำ
    - `fact_evidence_policy_match`: 77 จังหวัด; ปัจจุบันเป็น `UNVERIFIED` ทั้งหมด
    - `fact_plan_actual_reconciliation`: 2 ฤดูกาล (ฤดูฝน/แล้ง 2569) ยืนยันสถานะ `INCOMPARABLE`
  - สร้าง 3 Analytical Views สำหรับการสืบค้นเชิงวิเคราะห์; `v_unaddressed_policy_gaps` และ `v_project_intervention_summary` ปัจจุบันไม่มีรายการที่ยืนยันได้ ต้องอ่านสถานะ `UNVERIFIED` ประกอบ
  - เพิ่ม unit tests 2 รายการใน `tests/test_national_warehouse.py` ทดสอบการสร้างตาราง, view calculation, และ idempotency ผ่าน 100%
- **Power BI Offline Project Build (offline-v12):**
  - พัฒนาโครงสร้างโปรเจกต์ `data/local/powerbi/offline-v12/` มี 17 ตาราง (เพิ่มขึ้นจาก 12 ตาราง), 20 relationships (เพิ่มขึ้นจาก 15), 42 measures (เพิ่มขึ้นจาก 35), 7 หน้า PBIR (เพิ่ม 2 หน้าใหม่: `policy_gap` และ `national_coverage`)
  - อัปเดต `powerbi/measures.dax` เพิ่ม 7 measures สำคัญสำหรับศูนย์ข้อมูลเกษตรทั้งประเทศ:
    - `Unaddressed Gap Provinces Count`, `Covered Problem Provinces Count`, `Redundant Intervention Provinces Count`
    - `Total Flood Damaged Rai`, `Total Drought Damaged Rai`, `Registered Projects Count`, `National Profiled Resources Count`
  - ตรวจ integrity hash ผ่านครบ 45 ไฟล์ และตรวจสอบความถูกต้องของ Microsoft Fabric JSON schemas ผ่าน 27 metadata files 100% ด้วย `scripts/validate_powerbi_project.py`
  - จำลองคำนวณ DAX measures 14 รายการใน `tests/test_dax_simulation.py` ผ่าน 100%
  - เพิ่มการบีบอัด NTFS บน `data/local/powerbi/offline-v12` ลดขนาดดิสก์ลง 2.0 ต่อ 1 (จาก 92.6 MB เหลือ 46.4 MB)
  - รวมชุดทดสอบ unit tests ทั้งคลังระบบผ่าน **226/226 รายการ (31.500s)**

## ระบบจัดการ Environment Variables (.env) และ Open Government Data Client (opend.data.go.th) 23 ต.ค. 2569

- จัดทำไฟล์ต้นแบบ `.env.example` และสร้างไฟล์คอนฟิกในเครื่อง `.env` (ป้องกันด้วย `.gitignore` อย่างปลอดภัย) สำหรับกรอก API Key จากระบบศูนย์กลางข้อมูลเปิดภาครัฐ (`https://opend.data.go.th/register_api/profile.php`) และระบบ DOAE CKAN
- พัฒนาโมดูล `src/tadih/env.py` สำหรับโหลด `.env` เข้าสู่ `os.environ` อัตโนมัติโดยไม่ต้องพึ่งพา external package พร้อมฟังก์ชันช่วยดึงค่า `get_opend_api_key()`, `get_doae_api_key()`
- พัฒนาโมดูล `src/tadih/opend_client.py` สำหรับเรียกใช้งาน API บริการ `Opend` (opend-search) ด้วยมาตรฐาน Header `api-key` และสคริปต์ตรวจสอบสถานะ `scripts/test_opend_connection.py`
- เพิ่ม unit tests 5 รายการใน `tests/test_env.py` ทดสอบการ parse `.env`, การมาสก์คีย์ (Masked Key เช่น `....fun4`), การส่ง Header และการดักจับข้อผิดพลาด (ผ่านรวม 222 tests 100%)

## สัญญาและส่วนต่อประสานการแบ่งปันข้อมูลสำหรับหน่วยงานพันธมิตร (Data Sharing Interface & External Partner API Contracts) 23 ต.ค. 2569

- เพิ่มสัญญาข้อมูล `data_contracts/data_sharing.schema.json` รองรับมาตรฐาน JSON Schema draft-2020-12 สำหรับ Data Sharing Feeds และ Inter-Agency API Responses
- เพิ่มโมดูล `src/tadih/data_sharing.py`, สคริปต์ `scripts/audit_data_sharing.py` และ unit tests 8 รายการใน `tests/test_data_sharing.py` (ผ่านรวม 217 tests 100%)
- รองรับ 4 จุดเชื่อมต่อหลัก (Standard Endpoints):
  - `/v1/catalog`: บัญชีชุดข้อมูล ทรัพยากร และสถานะสิทธิ์
  - `/v1/coverage`: บัญชีความครอบคลุมข้อมูล 77 จังหวัดระดับ `source × area × period × metric`
  - `/v1/spatial-evidence`: บัตรหลักฐานเชิงพื้นที่ ชี้เป้าปัญหาจริง (น้ำท่วม 1.83M ไร่, แล้ง 16.7K ไร่) และการจับคู่โครงการ
  - `/v1/projects`: สัญญาทะเบียนโครงการ; ปัจจุบันไม่มีรายการที่ตรวจเป้าหมายระดับโครงการผ่าน
- ระบบ License Gating และการคุ้มครองข้อมูล:
  - การกำหนด `public_only` เป็นเพียงการกรองข้อมูลในเครื่อง ยังไม่มีระบบยืนยันตัวตนหรือการอนุมัติเผยแพร่จริง; บัตรหลักฐาน pending ถูกงดส่งจาก feed สาธารณะ
  - คุ้มครองข้อมูลส่วนบุคคลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 โดยให้บริการเฉพาะสถิติรวมเชิงพื้นที่ (Aggregate Spatial Layer)
- สถาปัตยกรรมความสมบูรณ์ข้อมูลเชิงรหัสวิทยา (Cryptographic Integrity):
  - ทุกคำตอบ API คำนวณค่าแฮช `payload_sha256` แบบ deterministic
  - พัฒนาระบบส่งออก Partner Feed Export Bundle พร้อมไฟล์ `manifest.json` สำหรับการแลกเปลี่ยนข้อมูลแบบ Batch/Scheduled Sync ระหว่างหน่วยงาน
- เอกสารและหลักฐาน: [docs/data-sharing-interface.md](data-sharing-interface.md), สัญญาข้อมูล [data_contracts/data_sharing.schema.json](../data_contracts/data_sharing.schema.json), หลักฐาน `data/local/probes/data-sharing-audit.json`

## ทะเบียนโครงการและหลักฐานพื้นที่: สถานะหลังตรวจแก้ 23 ต.ค. 2569

งานเดิมสร้าง schema และ audit scripts ได้ แต่ข้อสรุปด้านมาตรการจากข้อมูลไม่ครบถูกถอน ผลปัจจุบันให้ยึดหัวข้อ “ตรวจแก้ผลวิเคราะห์มาตรการจาก AI รอบก่อน” ด้านบน, [project-register.md](project-register.md) และ [spatial-evidence-matching.md](spatial-evidence-matching.md) การนับ 0 รายการที่ยืนยันได้ไม่ใช่การยืนยันว่าไม่มีโครงการจริง

## กลไกกระทบยอดแผนและผลเพาะปลูก (Plan vs Actual Reconciliation Engine) 23 ต.ค. 2569

- เพิ่มโมดูล `src/tadih/plan_reconciliation.py`, สคริปต์ `scripts/reconcile_plan_actual.py` และ unit tests 5 รายการใน `tests/test_plan_reconciliation.py`
- วางรากฐาน Fail-Closed Guard Rails สำหรับการเปรียบเทียบแผนและผลการเพาะปลูก:
  - กำหนดเกณฑ์เข้มงวด: ต้องตรงกันทั้ง 5 แกน (ปีเพาะปลูก, ฤดูกาล, ระดับพื้นที่, ชนิดพืช, หน่วยวัด)
  - กำหนด threshold ความครอบคลุมขั้นต่ำ `min_overlap_ratio=0.5`
- ผลการพิสูจน์ทางคณิตศาสตร์จากข้อมูลจริง:
  - **แผนฤดูฝน 2569:** แผน 477 แถว (3 จังหวัด: 20 ชลบุรี, 40 ขอนแก่น, 94 ปัตตานี) เทียบกับผล 3 แถว (1 จังหวัด: 10 กรุงเทพฯ) มีความทับซ้อนเป็นเซตว่าง `{20, 40, 94} ∩ {10} = ∅` (overlap ratio = 0.0)
  - **แผนฤดูแล้ง 2569:** แผน 599 แถว (4 จังหวัด: 20, 40, 46, 81) เทียบกับผล (5 จังหวัด: 10, 11, 12, 13, 14) มีความทับซ้อนเป็นเซตว่าง (overlap ratio = 0.0)
  - ระบบคืนสถานะ `status = "INCOMPARABLE"` พร้อมแจกแจงสาเหตุเชิงลึก ป้องกันความผิดพลาดทางสถิติในการนำตัวเลขคนละจังหวัดมาคำนวณ % ความสำเร็จ
- รายละเอียดและผลการกระทบยอด: [docs/plan-actual-reconciliation.md](plan-actual-reconciliation.md), หลักฐาน `data/local/probes/plan-actual-reconciliation.json`

## การแก้ปัญหาข้อขัดแย้งเชิงพื้นที่และ Temporal Administrative Crosswalk 23 ต.ค. 2569

- เพิ่มโมดูล `src/tadih/temporal_crosswalk.py`, สคริปต์ `scripts/audit_temporal_crosswalk.py` และ unit tests 5 รายการใน `tests/test_temporal_crosswalk.py`
- แก้ไขปัญหาข้อขัดแย้งชื่อ-รหัสพื้นที่ 947 รายการ และชุดข้อมูลเอกภาพ 14,824 รายการ:
  - **การสลับรหัส-ชื่อ ต.แจ่มหลวง / ต.บ้านจันทร์ / ต.แม่แดด อ.กัลยาณิวัฒนา จ.เชียงใหม่ (1,015 แถว):** จับคู่ด้วยชื่อภาษาไทยมาตรฐานเพื่อแมปสู่รหัส DOPA 2566 ที่ถูกต้อง (แจ่มหลวง -> 502503, บ้านจันทร์ -> 502501, แม่แดด -> 502502) พร้อมบันทึกหมายเหตุการแก้ไข
  - **การแยกแขวงบางบอน (105001) เมื่อ 26 ก.ค. 2560 (349 แถว):** กำหนดเงื่อนไข `valid_to: 2017-07-26` ให้ fallback สู่ระดับเขต `1050` เนื่องจากข้อมูลก่อนปี 2560 ไม่สามารถระบุแยกเป็นบางบอนเหนือ (105002) หรือบางบอนใต้ (105003) ได้โดยไม่เกิดภาพลวงตา
  - **รหัสดัมมี่ จ.ตรัง `xxxxxxxx` (45 แถว):** กักกัน (quarantine) เป็น `INVALID_CODE` ไม่นำเข้าสู่ระบบพื้นที่
  - **ชุดข้อมูลเอกภาพ 10 รายการ (`province_unified_data_10` 14,824 แถว):** จำแนก Native Grain เป็นจังหวัด 1,320 แถว และอำเภอ 13,653 แถว โดยคงค่า `rollup_eligible=False`
- รายละเอียดการตรวจสอบ: [docs/geography-crosswalk-resolution.md](geography-crosswalk-resolution.md), หลักฐาน `data/local/probes/temporal-crosswalk-audit.json`

## ตรวจและจัดทำบัญชีความครอบคลุมข้อมูลระดับประเทศ (Coverage Inventory) 23 ต.ค. 2569

- เพิ่มโมดูล `src/tadih/coverage_inventory.py`, สคริปต์ `scripts/audit_coverage_inventory.py` และ unit tests 5 รายการใน `tests/test_coverage_inventory.py` (ผ่านรวม 189 tests 100%)
- กระทบยอดข้อมูล DOAE ทุก Phase กับ manifest ในเครื่องตรงกัน 100%:
  - P0: 1,943,298 แถว
  - P1: 202,747 แถว
  - P2: 1,534 แถว
  - Archives (RAR): 1,289,200 แถว
  - รวมต้นทาง 3,436,779 แถว (Staged 3,436,080 + Quarantined 699 แถว)
- บันทึกบัญชีความครอบคลุมระดับ `source × area × period × metric` รวม 59 ทรัพยากรข้าม 8 ผู้ให้บริการ (DOAE 52, OAE 1, RID 1, Open-Meteo 1, Planetary Computer 1, LDD 1, DOF 1, DLD 1)
- รักษาระดับพื้นที่ดั้งเดิม (Native Grain) อย่างเข้มงวด: country 7, subdistrict 15, province 21, enterprise_group 7, disaster_area 3, grid_point 2, reservoir 1, office_point 1, province_gis_polygon 1, province+district_mixed 1 ไม่กระจายตัวเลขระดับประเทศหรือจุดกริดลงสู่จังหวัดโดยไม่มีหลักฐาน
- บันทึก missing reasons ชัดเจน: ข้อมูล mock รต.01-02 (กักกัน 1 แถว), ค่าพื้นที่ติดลบนาเกลือ (กักกัน 1 แถว), คอลัมน์เลื่อนออนไลน์ 2568 (กักกัน 524 แถว), ตัวเลขวงเล็บพืชอายุสั้น 2567 (กักกัน 173 แถว) สถานะสิทธิ์ทุกทรัพยากรคง `pending` และไม่นำเข้า public
- รายละเอียดและตารางสรุป: [docs/coverage-inventory.md](coverage-inventory.md), หลักฐาน `data/local/probes/coverage-inventory.json`

## ปรับลำดับงานตามเป้าหมายศูนย์ข้อมูลเกษตรระดับประเทศ

บันทึก [data contract และลำดับงาน](national-agriculture-data-center.md): ให้หลายหน่วยงานใช้หลักฐานพื้นที่/พืช/ช่วงเวลา/สิทธิ์ร่วมกันเพื่อวางและติดตามโครงการ เริ่มจาก coverage 77 จังหวัดตามจริง แล้วตรวจตรรกะเชื่อมและสำรวจทะเบียนโครงการ งานนี้เป็นการกำหนดทิศทาง ยังไม่ได้สร้างข้อมูลโครงการข้ามหน่วยงานหรือเปิดข้อมูล pending ให้สาธารณะ

## ตรวจภูมิศาสตร์ DOAE วันที่ 23 ตุลาคม 2569

สร้าง audit offline สำหรับ raw 21 resources รวม 2,757,305 แถว โดยเก็บตารางพื้นที่ไม่ซ้ำ 92,226 signatures ใน `data/local/doae-geography/` และตรวจ SHA/ยอดแถวของไฟล์ผลลัพธ์ผ่าน รหัสและชื่อครบตรง DOPA snapshot ปี 2566 จำนวน 2,579,775 แถว แต่ temporal validity ยังไม่ยืนยัน จึงยังใช้รวมยอดหรือ join เป็นข้อมูลที่รับรองไม่ได้ ชุดเอกภาพมีแถวจังหวัด 1,320 และอำเภอ 13,504 แยก grain ดู [รายละเอียด](doae-geography-audit.md) และงานค้าง crosswalk

## ลดพื้นที่ข้อมูลในเครื่อง 23 ต.ค. 2569

- หยุดโหลดเพิ่มตามคำสั่งเจ้าของงาน ตรวจ repository รวมประมาณ 6.38 GB; ก้อนหลักคือ DOAE raw/staging และ private exports ไม่แตะข้อมูลของโครงการอื่น
- บีบอัดแบบ NTFS ด้วย `compact.exe /C` เฉพาะ `data/local/doae-p0`, `doae-p1`, `doae-p2`, `doae-archives` และ `exports/private` รวม 347 files; พาธ/เนื้อหา/manifest เดิมยังอ่านได้ โปรแกรมไม่ต้องคลาย ZIP เอง โฟลเดอร์เหล่านี้ตั้งให้ไฟล์ใหม่สืบทอด compression
- ผลรวมพื้นที่ไฟล์จาก `GetCompressedFileSizeW` ลดจาก **5,939,104,827 เป็น 2,221,917,141 bytes** (ลด 3,717,187,686 bytes); พื้นที่ว่างไดรฟ์ D ที่วัดทั้ง volume เพิ่มสุทธิ **1,167,630,336 bytes** จาก 95,586,549,760 เป็น 96,754,180,096 bytes จึงไม่อ้างว่าคืนพื้นที่ว่างสุทธิทั้งไดรฟ์ 3.72 GB
- ตรวจข้อมูล export เก่า 6 ชุด: CSV และ Parquet เทียบ `EXCEPT ALL` ทั้งสองทิศทางกับ `20261022T155531Z-ef13f544` แล้วแถวตรงกันทั้งหมด แม้ file SHA ต่างจากลำดับแถว/serialization; พบ staging schema เก่าอีก 3 ชุดมีรุ่นปัจจุบันทดแทน รวมไฟล์ที่เสนอให้ลบ 21 files / 517,762,353 bytes ระบบ automatic approval บล็อกคำสั่งลบด้วย `blocked by policy` จึง **ยังไม่ได้ลบไฟล์ใด** ทั้งรายการยังเก็บอยู่และบีบอัดแล้ว
- เก็บต้นฉบับที่มีประโยชน์และหลักฐานทั้งหมด, staging ปัจจุบัน, warehouse/backup และ PBIP ล่าสุดไว้; แยกใช้ไม่ได้ตอนนี้เป็น quarantine: ออนไลน์ 2568 คอลัมน์ผิด 524 แถว, RAR ค่าตัวเลขวงเล็บรอยืนยัน 173 แถว, พื้นที่ติดลบ 1 แถว และข้อมูล mock 1 แถว ห้ามนำไปวิเคราะห์เป็นข้อมูลจริง ไม่ลบ raw เพียงเพราะยังตีความไม่ได้หรือสิทธิ์ pending
- หลังบีบอัด `scripts/audit_doae_acquisition.py` exit 0: raw SHA ผ่าน 60 resources, CSV 58/58 และ staging hashes ตรงหลักฐานเทียบทุกแถวเดิม; latest private export ตรวจ SHA ผ่านครบ 8 files ไม่อ้างว่าได้รัน DAX/visual หรือเทียบทุกแถวใหม่ในรอบนี้ ไม่มี network acquisition ใหม่
- หลักฐาน local: `data/local/probes/storage-before-cleanup.json`, `storage-cleanup-plan.json`, `storage-cleanup-result.json`, `storage-post-cleanup-audit.log`; งานลบสำเนาซ้ำยังค้างเพราะ policy ไม่เปลี่ยนสิทธิ์เผยแพร่และไม่ลดเกณฑ์ roadmap

## P2 และ catalog acquisition audit วันที่ 23 ตุลาคม 2569

ตรวจ catalog 3 หน้าครบ 201 datasets: uitest 160, demo/empty 2, Database 6, public datasets 33 เทียบ raw กับ metadata และตรวจ hashes/schema/output/ผลเทียบทุกแถวแล้ว CSV ที่ catalog ระบุมี capture ครบ 58/58 resources, 33/33 public datasets และ raw hash ผ่าน 60 resources ยังไม่เลือก non-CSV 24 resources ไม่อ้างว่าเป็นสำเนาเทียบเท่าหรืออ่าน PDF ที่ reference CSV ลิงก์ไว้ ดู [acquisition audit และงานค้าง](doae-acquisition-audit.md)

P2 เพิ่มคำขอสินค้า 1,534 แถว และ RAR รายชื่อ/ที่ตั้งวิสาหกิจ 4 resources รวม 304,480 แถว เก็บ private พร้อม privacy flags; archives ทั้ง 8 รวม source 1,289,200 / staged 1,289,027 / quarantine 173 ผ่านการคลายซ้ำและเทียบทุกแถว Reference CSV 7 ชุดเก็บ positional raw index ไม่ใช่ metric observations

ทดสอบ 182 tests ผ่าน (22.500s), pip check ผ่าน และตรวจทะเบียนเพิ่ม 6 tests ผ่าน ทะเบียน exact resources 70 รายการคง pending ไม่มีข้อมูลจริงเข้า Git/public/warehouse/Power Query/Online งานต่อยังเป็นหน่วย/เวลา/พื้นที่/revisions/coverage และเชื่อม workflow/Dimension ตาม roadmap ไม่ปิดเกณฑ์เหล่านี้จากการดึง CSV ครบ

## DOAE P1 และ RAR เพิ่มเติม 23 ตุลาคม 2569

ดึงและ staging P1 21 resources / 12 datasets: 202,747 source = 202,223 staged + 524 quarantined (ออนไลน์ปี 2568 คอลัมน์คลาดเคลื่อน) พร้อมสำนักงาน JSON-LD 955 รายการ (พิกัด missing 1) และ GeoJSON จังหวัด 77 features คง geometry 3 ค่า; source fields/code/null/หน่วย/ช่วงเวลาคงต้นทาง ไม่เข้า warehouse/BI

ดาวน์โหลดและคลาย RAR 4 resources (วิสาหกิจ 2566/2567, พืชอายุสั้น/ยาว 2567) แบบจำกัดขนาด/เวลา ผ่าน stdout ไม่ใช้ path ใน archive เป็นปลายทาง: source 984,720 / staged 984,547 / quarantine 173 รูปแบบตัวเลขวงเล็บรอยืนยัน CSV วิสาหกิจ 2566 ใน RAR bytes ตรงกับ CSV P1 จึงไม่รวมจำนวนซ้ำ

ตรวจ hash และเทียบทุกแถวผ่านครบ P1 21 + archives 4 พร้อมคลายซ้ำเป็น digest และ verified resume; `data/local/probes/doae-p1-verification.json`, `doae-archives-verification.json` ทดสอบรวม 178 tests ผ่าน (22.815s), pip check ผ่าน และตรวจ license registry 6 tests ผ่าน ทะเบียน exact resources รวม 58 คง pending ดู [รายละเอียด](doae-p1-archives.md)

ทำ [ร่าง Data Contract](doae-aggregate-data-contract-draft.md) สำหรับสถิติรวมแล้ว ยังไม่ส่งหรือรับข้อมูลรายบุคคล งานต่อเป็น source semantics/temporal geography/coverage/revisions/สิทธิ์และการเชื่อม workflow ตาม roadmap ยังไม่รับรองความถูกต้องเชิงความหมายหรือ DAX/BI runtime จากการผ่าน staging

## DOAE P0 capture/staging ครบ 23 ตุลาคม 2569

ดึง 21 CSV จาก 10 datasets รวม 585,506,130 bytes และ 1,943,298 source rows; staged 1,943,296 / quarantine 2 แถว ครอบคลุมแผนฤดูแล้งย้อนหลัง 2561–2569 (รวมไฟล์สรุปแยก), รต.01-04, เฝ้าระวังขาดแคลนน้ำ, ภัยใน/นอกเขตชลประทาน และแผน/ผล/report snapshot ฤดูฝนและแล้ง รายละเอียด [doae-p0-ingestion.md](doae-p0-ingestion.md)

ตรวจ hash และเทียบ source fields/ตัวเลข/ลำดับทุกแถวกับ raw CSV ผ่านครบทั้ง 21 resources ผล `all_p0_resources_verified=true` ใน `data/local/probes/doae-p0-verification.json` รันซ้ำทุก resource เป็น skipped_verified; ทดสอบรวม 172 tests ผ่าน (19.820s), pip check ผ่าน และทะเบียน exact resources เพิ่มเป็น 33 รายการ คง pending ทุกชุด

ข้อค้นพบ: resource รต.01-02 มีเพียงแถว mock ซึ่งกักไว้ จึงยังไม่มีข้อมูลพืชจริงจาก endpoint นี้; นาเกลือมีค่าพื้นที่ติดลบ 1 แถวกักไว้ แมลง/เกลือมี repeated identities 48/96 เก็บทั้งหมด; report snapshot คง reported_at ใน grain ไม่มีการรวม subtotal, หน่วย หรือช่วงเวลา และยังไม่เข้า warehouse/Power BI

งานต่อคือ P1 และ P2 ตาม roadmap พร้อม semantic/temporal/geographic/license review ก่อนเชื่อมโมเดล การดึง P0 ครบยังไม่ใช่การจบแผน DOAE หรือเกณฑ์รับรองโครงการทั้งหมด

## เพิ่มเติม 23 ต.ค. 2569 เวลา 07:29 Asia/Bangkok

ทำ P0 DOAE แผนเพาะปลูกฤดูแล้งปี 2569 ต่อจาก roadmap: CLI `doae-dryplant` capture/staging จริง 599 แถว, 4 จังหวัด / 69 รหัสตำบลต้นทาง, quarantine และ repeated identity เป็น 0; พื้นที่ศูนย์จริง 317 แถว ครัวเรือน null 599 แถว คงแผนแยกผลปลูกจริง ไม่ aggregate และไม่เข้า warehouse/Online เนื่องจากปีเพาะปลูก/พื้นที่ยังไม่รับรองและสิทธิ์ `อื่นๆ` คง pending

ตรวจ raw/staging SHA-256, เทียบพื้นที่/รหัส/updated_at ครบ 599 แถว และ rerun จาก checkpoint ผ่าน ทะเบียน exact resources เพิ่มเป็น 13 รายการ Unit/regression รวม 166 tests ผ่าน (15.774s) และ pip check ผ่าน หลักฐาน `data/local/probes/dryplant-verification.json` และ `dryplant-cycle-tests.log` ดู [วิธีรันและขอบเขต](plan-dryplant.md)

งานต่อ: ทบทวน schema รายปี/ไฟล์สรุปก่อน backfill (ปี 2568 มี subtotal ประเทศ/ภาค/จังหวัด), ยืนยัน temporal mapping/ปีเพาะปลูก/สิทธิ์ก่อนเข้าโมเดล ปรับ C2 ใน HANDOFF กลับเป็นงานค้างให้ตรงหลักฐาน เพราะ Python simulation ยังไม่ใช่ DAX engine runtime

## ความคืบหน้าล่าสุด (22 ต.ค. 2569 เวลา 23:28 Asia/Bangkok)

ตรวจรวม 162 tests ผ่าน 100%; pip check ผ่าน. DuckDB warehouse 141,699 latest observations จาก 5 แหล่งข้อมูล (DOAE, ERA5, RID, OAE, MODIS).

- **DOAE CKAN Catalog Ingestion Roadmap:** สแกนโครงสร้างและสำรวจชุดข้อมูลจริงบน `https://ckan.doae.go.th/` ผ่าน CKAN API v3 พบบัญชีข้อมูล 41 ชุดข้อมูลจริง (คัดแยกชุดทดสอบ uitest 59 รายการออก); จัดหมวดหมู่ 5 กลุ่มหลัก (การผลิตพืช/รต.01-04/แผนเพาะปลูก, ภัยพิบัติและน้ำ, ทะเบียนเกษตรกร, วิสาหกิจชุมชน, ที่ตั้ง GIS); จัดทำแผนงานและเกณฑ์ธรรมาภิบาลข้อมูล P0/P1/P2 ใน `docs/doae-catalog-expansion.md`
- **Monthly Forecasting & Seasonal Naïve Baseline (B9):** ขยายสถาปัตยกรรมโมเดลพยากรณ์ใน `src/tadih/forecast.py` ให้รองรับความถี่รายเดือนโดยตรง (ไม่ downsample ราคารายเดือนเป็นรายวัน); รองรับโมเดลฐาน `seasonal_naive` (lag 12 เดือน), `last_value` (naïve), และ `moving_average` (3 เดือน); สร้าง walk-forward backtest รายเดือนพร้อม split calibration/verification และ embargo ป้องกัน leakage; ประเมิน scorecard (MAE, RMSE, Bias, WAPE, skill score) และช่วงความเชื่อมั่นเชิงประจักษ์ (P10/P90); บังคับ gate ห้ามใช้ `retrieved_at` แทน `release_at` (หากไม่มีวันเผยแพร่จริงจะระงับและคืน Unknown ทันที); จัดทำ `docs/forecast-methodology.md` และ unit tests 20 รายการใน `tests/test_forecast.py` ผ่าน 100%
- **DAX Measures Simulation Audit (C2):** จัดทำ `docs/dax-simulation-audit.md` และ unit tests จำลองคำนวณ 13 รายการใน `tests/test_dax_simulation.py` ผ่าน 100% ครอบคลุม 35 DAX measures ใน `powerbi/measures.dax` กับข้อมูลจริง 141,699 แถวใน `data/local/powerbi/offline-v11/Data/`; พิสูจน์ guard rails สำเร็จ: ราคาระดับประเทศคืนค่าว่างทันทีเมื่อ filter จังหวัด/อำเภอ (ป้องกัน leak ลงจังหวัด), สภาพอากาศรายจุดคืนค่าว่างเมื่อเลือกหลายจุดพร้อมกัน, ราคาขายส่ง/ขายปลีกไม่ปนเข้า farmgate, แยกหน่วย บาท/กก. ออกจากหน่วยนับเฉพาะ (บาท/ร้อยผล, บาท/ฟอง, บาท/ตัว), อ่างเก็บน้ำ RID 461 แห่ง (457 แห่งที่มีปริมาตรน้ำ) คำนวณความจุ/ปริมาตร/%น้ำ ถูกต้อง, และ `Reviewed Production kg` ถูกบล็อกเป็นค่าว่างตามสเปก
- **Power BI Offline Project Build (offline-v11):** สร้าง build โปรเจกต์ล่าสุด `data/local/powerbi/offline-v11/` มี 141,699 fact_observation rows จาก 5 แหล่งข้อมูล, 12 ตาราง, 15 relationships, 35 measures, 5 หน้า PBIR; ตรวจ integrity hash 34 ไฟล์ และตรวจสอบความถูกต้องของ Microsoft Fabric JSON schemas ผ่าน 21 metadata files 100% ด้วย `scripts/validate_powerbi_project.py`
- **Resource License Register (B1):** ขยายทะเบียนสิทธิ์ราย resource ใน `config/resource_licenses.json` และ `docs/source-license-register.md` เพิ่ม 4 ทรัพยากรใหม่ (LDD rice zoning, DOF aquatic production, DLD livestock value, DOAE perennial crops 2566) รวมเป็น 12 resources ตรวจครบถ้วน; ทุกชุดคงสถานะ `pending` ซื่อสัตย์ตามข้อเท็จจริง; เพิ่มฟังก์ชัน `tadih.catalog.load_resource_licenses` และ unit test ใน `tests/test_catalog.py` ผ่าน 100%
- **Scheduled Price Refresh:** เพิ่ม `scripts/refresh_prices.ps1` ติดตั้ง Windows Task Scheduler (`TADIH-Price-Refresh` ทุกวัน 07:15 Asia/Bangkok) พร้อม lock file `data/local/scheduled/refresh.lock`; ทดสอบ live run สำเร็จ (exit code 0, 7,658 price observations ingested, snapshots สร้างและ verify ครบ 8 ไฟล์ทั้ง private และ public); มี unit test `tests/test_refresh_script.py` ผ่าน
- **Daily Market-Price Staging:** เพิ่ม `src/tadih/daily_prices.py`, `tests/test_daily_prices.py` และ `docs/daily-prices.md`; ตัวอย่าง bounded request มะนาว ผลขนาดใหญ่พิเศษ ตลาดกลางหนองบ้วย จ.เพชรบุรี 100 แถว (บาท/ร้อยผล) คง spatial_support เป็น `market`, price_type เป็น null, release_at เป็น null, ไม่ rollup หรือเข้า warehouse ก่อนรีวิวความหมายสิทธิ์
- **Weekly Native Price Staging:** เพิ่ม `src/tadih/weekly_prices.py`, `tests/test_weekly_prices.py` และ `docs/weekly-prices.md`; ตัวอย่าง กระบือ ขนาดกลาง 42 แถว ปี 2569 หน่วย บาท/ตัว (TH00 ระดับประเทศ) คงรหัสสัปดาห์ 1–5 และเดือน ไม่แปลงเป็นวันหรือ ISO week; เก็บ revisions ครบถ้วน ไม่เข้า warehouse
- **Commodity History Audit (B2 Part 1):** จัดทำ `docs/commodity-history-audit.md` และ unit test `test_historical_inventory_union_matches_2569` ใน `tests/test_commodities.py` ผ่าน 100%; พิสูจน์ทางคณิตศาสตร์จาก 16 annual snapshots (พ.ศ. 2554–2569) ว่า union ของชื่อสินค้าทุกปีมี 44 ชนิด เท่ากับ inventory ปี 2569 พอดี (ไม่มีสินค้าอดีตที่ตกหล่นหรือเลิกผลิต); 39 ชนิดมีครบ 16 ปี และ 5 ชนิดเป็นสินค้าที่เริ่มเก็บสถิติในภายหลัง (มันสำปะหลัง 25% ปี 2559, ไข่เป็ด 3 ขนาด ปี 2560, ปาล์มน้ำมัน ปี 2566) ทุกตัวมีประวัติต่อเนื่องไม่มี gap ภายใน
- **DOAE Perennial Staging Readiness Audit:** จัดทำ `docs/perennial-readiness.md`, `data/local/probes/perennial-readiness.json` และ `perennial-admin-crosswalk.csv`; ตรวจสอบพืชอายุยาว 2566 รวม 54,195 แถว: 54,186 แถว match กับ DOPA 2023, 6 แถว unmatched จากตำบลที่ติดเครื่องหมายยกเลิก, 3 แถวติด numeric quarantine จากค่าพื้นที่ติดลบ, 5 กลุ่ม repeated identities ที่มีค่าขัดแย้ง; คงสถานะ staging/quarantine ไม่ aggregate หรือนำเข้า warehouse


## Pipeline และข้อมูลเพิ่มเติม 22 ต.ค. 2569

ตรวจรวม 136 tests ผ่าน; pip check/diff check ผ่าน. หลักฐาน data/local/probes/pipeline-cycle-tests.log และ price-pipeline-lineage.json.

- เพิ่ม `price-pipeline --year-th 2569` ครบ capture/checkpoint → normalize/quarantine → ingest → internal/public export → verify พร้อม failure report และ immutable raw checksums ใน data/local/runs/. Live resume สองรอบผ่าน: fetched 0, added revisions 0, public 0. Transaction ต่อสินค้า รอบที่ล้มอาจมีสินค้าก่อนหน้าบันทึกแล้ว; ยังไม่ใช่ scheduled refresh ทุกแหล่งหรือหลักฐาน14วัน. ดู docs/runbook.md
- LDD rice zoning ดึงครบ77ชื่อจังหวัด×4ระดับ=308ค่า พร้อมเทียบ CSV/datastore ตรงกัน แต่ unit/year ยัง null, province mapping unresolved, pending และไม่ warehouse. CLI `ldd-rice-zoning`; docs/source-expansion-ldd.md
- DOAE พืชอายุยาว2566 โครงสร้างรายปีแยกจากพืชอายุสั้น: 54,195 source → 54,192 staged + quarantine3แถวค่าพื้นที่ติดลบ; พบ5 repeated grain identities. 77จังหวัด/264 commodity identities. CLI `doae-perennial`; docs/production-perennial.md. ไม่รวมยอด/เข้าwarehouseจนกว่าจะตรวจครบ
- ตรวจช่องว่างราคากับ annual endpoint แบบจำกัด6requests: 77จาก221เดือนยังไม่พบใน annual responses ที่ตรวจ อีก144เดือนยังไม่ตรวจ; conflict ต.ค.2012ยังมี2ค่าต่างกันจึงคง quarantine. docs/price-gap-verification.md


## งานขนานต่อเนื่อง 22 ต.ค. 2569

DOF staging เพิ่มแล้ว: `python -m tadih dof-production` ดึงจริง 540 ค่า (27 ปี พ.ศ.2541–2567 × 10 กลุ่ม × ปริมาณ/มูลค่า) หน่วยพันตันและล้านบาทตาม metadata แยก total ไม่บวกซ้ำ ยัง pending และไม่ import warehouse. ดู docs/source-expansion-dof.md และ data/local/probes/dof-staging-cli.json. Full unittest หลังรวมงาน agents ผ่าน 131 tests (data/local/probes/parallel-final-tests.log).


- Agents ตรวจ source expansion, release lineage และ pipeline/price readiness; เอกสารใหม่ docs/data-lineage-review.md, docs/source-expansion-dld.md และ docs/price-history-readiness.md
- DLD staging-only: `python -m tadih dld-livestock-value` ดึงจริง 35 แถวระดับประเทศ ปี 2562–2568 หน่วยล้านบาท เก็บ pending และยังไม่นำเข้าฐานหลักเพราะนิยามปี/release ไม่ยืนยัน; หลักฐาน data/local/probes/dld-staging-cli.json
- ตรวจ metadata สิทธิ์ราคา OAE ราย resource เพิ่มเป็น 12 ชุด และหลักฐาน 24 responses. DOAE declared release calendars ยังไม่ผูกกับ current revision จึงคง release null
- Price readiness: 44 series; 6 series มีเดือนขาดภายใน min/max รวม 221 เดือน. Pagination ครบไม่เท่ากับประวัติครบ; known release เป็น 0 จึงยังไม่รับรอง historical as-of forecast
- Coverage เปลี่ยนเป็นดัชนีรอบเดียว เลิกข้อความอ้างจำนวนแถวตายตัว; live build 141,699 แถวใช้ 5.86 วินาที ตรวจ hash 8 artifacts และเทียบ coverage ทุกแถวผ่าน. หลักฐาน data/local/probes/indexed-export.json; snapshot exports/private/20261022T151043Z-cc438e07
- ทดสอบสำเนาฐานในเครื่องเปิด read-only ได้ 141,699 แถวและ SHA-256 ตรงกัน: data/local/probes/local-restore-check.json. ยังไม่ใช่ backup นอกเครื่องตาม D3
- เพิ่ม regression COPY Unicode/null/idempotency/rollback และแก้ NDVI invalid ไม่ถูกนับ valid pixel. ยังไม่รับรองสิทธิ์/นิยามเดือน DOAE/BI runtime


งานข้อมูลใน checkout `D:\code\thailand-agri-intelligence` วันที่ 22 ต.ค. 2569: ดึง raw/checkpoints ใหม่ใน `data/local/` และแก้การรวม DOAE ให้คงเดือนกับรอบปลูกตามต้นทาง (10,682 กลุ่ม); ราคา historical names ปี 2554–2569 รวม 44 ชื่อ, daily master 41, weekly 44, production 5 กลุ่ม, MOC ยัง unreachable. MODIS คงวันเผยแพร่เป็น null ตามหลักฐานที่มี. บันทึกผลและข้อจำกัดใน [HANDOFF.md](../HANDOFF.md) และไฟล์ `data/local/probes/`; งดงาน BI ตามคำสั่งล่าสุด

ผลตรวจในเครื่องนี้: DuckDB 141,699 latest observations จาก 5 แหล่ง (DOAE 53,410; ERA5 54,795; RID 25,816; OAE 7,658; MODIS 20) ตรวจ 113 raw checkpoints และ 122 unit tests ผ่าน. ชุดภายใน `exports/private/20261022T145736Z-cf1e49b9` มี 141,699 แถว ชุด public `exports/public/20261022T145919Z-dfea41a7` มี 0 แถว เพราะสิทธิ์ยัง pending; ตรวจ hash 8 ไฟล์ต่อชุดแล้ว. หลักฐาน `data/local/probes/warehouse-audit.json`, `checkpoint-verification.json`, `snapshot-verification.json`. ยังต้องตรวจนิยามเดือน DOAE และวันเผยแพร่ก่อนใช้พยากรณ์ย้อนหลัง

ช่วงนี้ทำฐานระบบ Thailand Core ตาม PART IV เป็นลำดับแรก ไม่ได้ถือว่าแผน 59 วันเสร็จแล้ว

เช็กลิสต์ส่งต่องานและไฟล์ทั้งหมด: [HANDOFF.md](../HANDOFF.md) เป็นจุดเริ่มสำหรับ AI ตัวถัดไป มีคำสั่งตรวจ พาธข้อมูลจริง และงานต่อ B1–D5

คำสั่งล่าสุดของเจ้าของงาน: ทำข้อมูลและโมเดล/DAX ในเครื่องก่อน แล้วจึงอัปโหลด Online หยุดการจัด visual ผ่าน browser ไว้แล้ว มีเพียง semantic model Coverage ทดลองจากช่วงก่อนเปลี่ยนวิธีทำงาน ยังไม่ใช่งานปลายทาง

อัปเดต: Public repo สร้างตามเจ้าของงานอนุมัติแล้ว Source งานล่าสุดอยู่ `e7ad054` รวม offline model และราคา 44 สินค้า [CI รอบนี้ผ่าน](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39755251646) และ [DOAE/OAE live catalog probe](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39744139935) สำเร็จ ไม่มี raw สิทธิ์ pending ใน repo/artifacts

| งาน | หลักฐาน | สถานะ |
|---|---|---|
| พื้นที่ 77 จังหวัด | config/provinces.csv + tests | รหัส/ชื่อพร้อม; ไม่มี geometry |
| Registry ไทยและบริการพื้นที่ไทย 16 แหล่ง | config/sources.json | รายการพร้อม; สิทธิ์ราย resource ยัง pending |
| DOAE/OAE discovery | data/local/probes, raw checksum | เชื่อม metadata จริง; แบ่งหน้าได้ |
| ราคา OAE/NABC | 44 histories; ราคาไม่ขัดแย้ง 7,657 เดือน ช่วงรวม ม.ค. 2011 ถึง ก.ย. 2026 | ระดับประเทศ; อีก 1 เดือน Unknown จาก source conflict |
| ผลผลิต DOAE | 50,103 records staging -> source-period spatial aggregates 10,682 กลุ่มใน checkout ปัจจุบัน (6,696 กลุ่มเป็นรุ่นรวมปีเครื่องเดิม) (50,101 แถว matched, 2 แถว unmatched บางบอน แยก audit ชัดเจน ไม่เดารหัส); ตัวเลข ingest 20,851 observations เป็นฐานเก่า | ผ่านการทดสอบ; คำนวณ weighted yield (sum(production)/sum(harvested)) ห้าม average |
| พื้นที่ระดับย่อย | DOPA snapshot2023:928 อำเภอ/7,436 ตำบล, retired1,584 | แยก active/retired; ไม่อ้าง current2026 |
| Commodity inventory NABC | ปี2569:raw387/unique376/duplicates11; 44 identities/4pages | normalize แล้ว; product histories 44 captures; taxonomy ข้าม provider ยังไม่ทำ |
| อากาศ ERA5 | 5 จุดภูมิภาคเกษตรไทย / จุดละ 3,653 วัน ปี 2016 ถึง 2025 / 3 ตัวแปร | ดึงจริง 50 partitions (นครปฐม, เชียงใหม่, ขอนแก่น, อุบลฯ, สุราษฎร์ฯ) รวม 54,795 observations; คำนวณ 10-year percentile รายจุดได้ |
| น้ำ RID อ่างเก็บน้ำขนาดกลาง | 461 อ่าง × 14 วันต่อเนื่อง (9–22 ต.ค. 2569) รวม 25,816 observations | ความจุ, dead storage, ปริมาตรน้ำ, %น้ำ; percent calibration mismatch = 0; spatial_support=reservoir; สิทธิ์ pending |
| ดาวเทียม MODIS NDVI/QA | 28 observations (5 จุดภูมิภาคเกษตรไทย 2024-09-29 และ 2026-09-30) | ดึงและ normalize ผ่าน Planetary Computer ณ 5 จุดพิกัดเดียวกับ ERA5; scale 0.0001; cloud flags; spatial_support=grid_point; สิทธิ์ pending |
| Data quality + revision | unittest + JSON schemas | รันได้; ข้อมูลขาดเป็น null; รองรับ spatial_support=reservoir และ grid_point |
| Coverage 77 × 20 | export CSV พร้อมสัญญา coverage.schema.json | รองรับ USABLE_QUALITY_FLAGS, missing reason ซื่อสัตย์ราย resource, DOAE 77 จังหวัด AVAILABLE ในรอบปี 2023-12 |
| Decision workflows น้ำ/ตลาด | CLI + 8 real evidence cards + tests | ผ่านการทดสอบ ครอบคลุม 4 ภูมิภาคหลัก (D01 watch/unknown, D02 watch/normal/unknown รวม 8 cards) |
| Forecast/backtest | release-aware daily baselines/tests | prototype; ยังไม่มี forecast ปฏิบัติงาน |
| Power BI | local PBIP offline-v10: 12 ตาราง/15 relationships/35 measures/109,144 fact rows | schema 21 files / hashes 34 files / TOM 19.114.12 ผ่าน 100%; ร่างเก่าจัดเก็บใน archive/ |
| ทะเบียนสิทธิ์ราย resource | config/resource_licenses.json + docs/source-license-register.md | ตรวจ 8 ชุดพร้อมหลักฐาน ทุกชุดยัง pending (รวม MODIS ผ่าน Planetary Computer) |
| GitHub Actions | workflows สองชุด | CI และ catalog probe ผ่านจริง; schedule รายสัปดาห์ |

## ผลตรวจรับฐานระบบ

- Tests 121 รายการผ่าน ครอบคลุม schema, missing/zero, native price units, fixed IDs/revisions, conflict quarantine, transaction rollback, ข้อมูลอนาคต, ปฏิทินไทย, coverage, TLS, staging, snapshot integrity, model keys, schema cache, no-network resume, RID reservoirs contract/idempotence, MODIS satellite NDVI/QA normalization/idempotence, decision workflows (D01/D02 fail-closed, spatial mismatch, cloud-safety), PBIR `version.json` metadata, DOAE provincial gold aggregation (weighted yield, unmatched isolation) และ B4 coverage inventory verification
- Warehouse บนเครื่องเดิมเคยมีข้อมูล **109,144 แถว** (revision 109,148 แถว ขนาดเพียง 44.76 MB): ราคาประเทศ 7,658 ค่า, อากาศ 5 ภูมิภาค 54,795 ค่า, อ่างเก็บน้ำ RID 461 แห่ง 14 วัน 25,816 ค่า, ดาวเทียม MODIS 5 ภูมิภาค 24 ค่า และผลผลิตและพื้นที่ระดับจังหวัด DOAE 20,851 ค่า (77 จังหวัด)
- Decision Workflows D01 (ตลาด/ผลผลิต) และ D02 (น้ำ/ภัยพิบัติ) ขยายทดสอบกับ evidence จริงครบ 8 cards ครอบคลุม 4 ภูมิภาค:
  - D02 Watch (กทม./ปริมณฑล): ฝน percentile 0.10 + ฟ้าเปิด NDVI 0.6737 + ระดับน้ำ 2.45m -> `watch`
  - D02 Normal (กทม./ปริมณฑล): ฝน percentile 0.65 -> `normal`
  - D02 Normal (เชียงใหม่ เหนือ): ฝน percentile 0.40 + ฟ้าเปิด NDVI 0.5125 (valid 1.0) -> `normal`
  - D02 Normal (สุราษฎร์ธานี ใต้): ฝน percentile 0.90 + ฟ้าเปิด NDVI 0.3217 -> `normal`
  - D02 Unknown (กทม./ปริมณฑล): เมฆบัง (valid fraction 0.0) -> `unknown`
  - D02 Unknown (ขอนแก่น อีสานบน): เมฆบัง (valid fraction 0.0) -> `unknown` ปฏิเสธประเมินความเสียหายตามสเปกเมฆบัง
  - D01 Watch: ราคาลดลง 24% และผลผลิตเปลี่ยน 6.7% -> `watch`
  - D01 Unknown: ส่งราคา grain ประเทศ (TH) เข้าประเมินระดับจังหวัด (10) -> ปฏิเสธ fail-closed `incompatible_spatial_grain` ป้องกันการปะปน grain ข้ามระดับ
- Crosswalk ผลผลิต DOAE จับคู่ชื่อภายใต้ parent hierarchy ได้ 50,101 จาก 50,103 records เหลือ 1 ชุดชื่อพื้นที่/2 records ที่ยังไม่ match ไม่เดารหัสแทน ใช้ DOPA snapshot2023 จึงยังไม่รับรอง boundary ของทุกช่วงเวลา
- Snapshot ภายในจากเครื่องเดิมมี 88,293 แถว และ decision cards 8 ใบ พร้อม CSV/Parquet และ metadata `redistribution_allowed=false` ผล build ล่าสุดอยู่ใน `data/local/private-build.json` (`exports/private/20261022T114836Z-409364b9`)
- Snapshot สาธารณะมีข้อมูลวัด 0 แถว เพราะสิทธิ์ resource ยัง pending ผล build ล่าสุดอยู่ใน `data/local/public-build.json` (`exports/public/20261022T114949Z-1eb57f80`)
- NABC history raw 7,669 แถว: exact duplicates 10, conflict 1 เดือน/2 แถว ไม่มีการเลือกราคาใดแทนกัน ใช้ quality revision ค่า null; หลักฐาน `data/local/probes/monthly-price-backfill.json` และ `monthly-price-import.json`
- แก้ price IDs ที่เคยผูกกับค่าให้คง source/product/unit/month/area และเก็บค่าที่เปลี่ยนเป็น revision สำรองฐานเดิมก่อน migration; raw/export snapshots เก่าไม่ถูกแก้
- ลองนำเข้า archive ซ้ำผ่าน CLI แล้ว จำนวนแถวและ revisions ไม่เพิ่ม ทุกปีใช้ checkpoint ที่ตรวจ hash แล้ว
- Snapshot ภายในมี 20,469 แถว และ decision cards 5 ใบ พร้อม CSV/Parquet และ metadata `redistribution_allowed=false` ผล build ล่าสุดอยู่ใน `data/local/private-build.json` (`exports/private/20261022T104902Z-852c9ca1`)
- Snapshot สาธารณะมีข้อมูลวัด 0 แถว เพราะสิทธิ์ resource ยัง pending แต่มี master/registry/coverage ที่ตรวจได้ ผล build ล่าสุดอยู่ใน `data/local/public-build.json`
- ตรวจ SHA-256 และขนาดไฟล์ครบทั้ง snapshot ภายใน/สาธารณะแล้ว `pip check` ผ่าน
- ดึง forecast อากาศ 22 ถึง 28 ตุลาคม 2026 ได้ เก็บเป็น raw แยก ไม่เข้า observations และยังไม่รับรอง model issue time

ผลทดสอบนี้เป็นการรันในเครื่องกับ unit/integration tests ไม่ใช่การรับรอง accuracy ของแบบจำลองหรือความพร้อมใช้งานทั้ง 77 จังหวัด

## งานต่อที่มีลำดับ

1. ยืนยันใบอนุญาตราย resource DOAE/OAE และวันเผยแพร่ย้อนหลัง แยก commercial/noncommercial กับสิทธิ์แจกจ่าย
2. ดึงสินค้าทั้งหมดและ master mapping ตาม provider แบบแบ่งหน้า เก็บลง staging ไม่ใช้ชื่อ “ข้าว” รวมสินค้า/เกรดต่างกัน
3. จัดหารหัสอำเภอ/ตำบลและ polygon ที่มีรุ่น/สิทธิ์ ตรวจ mapping ชื่อ DOAE ก่อนรวมระดับจังหวัด โดยไม่รวม subtotal ซ้ำ
4. ขยายการทดสอบอากาศจากจุดเดียวที่มี archive 10 ปี ไปหลายภาค เมื่อมีการตรวจพิกัด/โควตา ก่อนคำนวณค่าเฉลี่ยพื้นที่ทั้งประเทศ
5. เชื่อมข้อมูลน้ำที่มี datum/สถานีและ NDVI ที่มี cloud mask/valid fraction แล้วทดสอบ 2 workflows ด้วย evidence จริง
6. ทดสอบ backtest ตามความถี่ข้อมูลจริงและ release lineage ราคาชุดที่พบเป็นรายเดือน จึงไม่ป้อนเข้าโมเดลรายวันโดยเติมค่าเอง
7. นำเข้า Power BI Desktop จัด 5 หน้า ทดสอบผู้ใช้จริง/สิทธิ์/backup และรัน refresh ต่อเนื่องอย่างน้อย 14 วัน

ยังไม่พึ่ง Fabric ไม่เก็บข้อมูลเกษตรทั่วโลก และไม่ส่งข้อความถึงบุคคลภายนอกจากการทดลองนี้

## 24 ตุลาคม 2569: เปลี่ยนเกณฑ์เว็บเป็น source-backed API

- เจ้าของงานกำหนดให้ข้อมูลการเกษตรที่เว็บแสดงมาจาก API หรือ connector/script ที่ดึงจากแหล่งต้นทาง และไม่ใช้ raw/local files เป็น runtime input; บันทึกไว้ใน ADR-002, HANDOFF และแผนเว็บ
- ตรวจเส้นทางเว็บ: ตัวเลขส่วนใหญ่ยังผ่าน /api/local-data ไปอ่าน staging JSONL กับ DuckDB ใน data/local; หน้าข้าวอ่าน raw Open-Meteo ระหว่าง request และ PGS ตรวจ raw JSON/hash ระหว่าง requestด้วย การมี BFF ไม่ได้ทำให้ข้อมูลนั้นเป็น source API
- ต่อ server-side metadata fetch ของ DOAE CKAN package_show?id=production_doae ใน /catalog จำกัด response 256 KiB, timeout 8 วินาที, no-store, ตรวจชื่อ package/schema และแสดง metadata เท่านั้น; live source ตอบ success=true, 4 resources, license title Open Data Common
- package_search 201 รายการมี test/empty entries ปะปน และ isopen=false ทั้งหมด จึงไม่เปิดรายการทั้งบัญชีเป็นชุดข้อมูลพร้อมใช้; observations ยัง license pending
- ยังไม่ได้ build หรือทดสอบ browser หลังเพิ่ม connector; ห้ามอ้างว่า integration หน้าเว็บผ่านแล้ว
- ขั้นต่อไป: ตรวจหน้า catalog ด้วย build/browser; ย้าย raw validation ออกจาก request ไป acquisition; เลือกตัวเลขชุดแรกจาก resource ที่ผ่าน license/grain review แล้วค่อยย้าย query จาก local readers ไป source-backed server API