# เช็กลิสต์และเอกสารส่งต่องาน TADIH

## ความคืบหน้าล่าสุด 23 ต.ค. 2569: P1 และ RAR ปี 2567

- P1 capture/staging 21 resources (19 CSV + สำนักงาน JSON-LD + GeoJSON จังหวัด) จาก 12 datasets ครบ: **71,240,721 bytes / 202,747 source records = 202,223 staged + 524 quarantine** ตรวจ hash และเทียบทุก record ผ่าน; `data/local/probes/doae-p1-verification.json` เป็น `all_p1_resources_verified=true` และรันซ้ำครบเป็น skipped_verified
- ตัวดึงรองรับ schema encoding/preamble ที่ตรวจจริง: ออนไลน์ปี 2567 เป็น CP874; โครงการรัฐปี 2566 มี preamble 3 บรรทัด; ออนไลน์ปี 2568 มีข้อมูลหมวดอยู่ใต้หัวมูลค่าทั้ง 524 แถว กักไว้ไม่สลับคอลัมน์เอง
- สำนักงาน JSON-LD 955 รายการ (อำเภอ 878/จังหวัด 76/พื้นที่ 1), มีพิกัด 954 / missing 1; GeoJSON 77 features คง Polygon/MultiPolygon และ altitude ต้นทาง ไม่ถือเป็นการยืนยันขอบเขต/ปีหรือจังหวัดจากพิกัด
- RAR 4 files (วิสาหกิจ 2566/2567 และพืชอายุสั้น/ยาว 2567) ตรวจ magic/outer SHA แล้วคลาย CSV ผ่าน stdout ลง local quarantine: compressed 10,778,379 / extracted 245,266,945 bytes; **984,720 source = 984,547 staged + 173 quarantine** ค่าในวงเล็บ 173 แถวรอยืนยัน; ไม่เดาหน่วย English fields หรือบวกซ้ำข้าม resource
- ตรวจคลายซ้ำเป็น digest และเทียบทุกแถวผ่าน 4 resources ใน `data/local/probes/doae-archives-verification.json` เป็น `all_archives_resources_verified=true`; raw/inner/staging resume ผ่าน CSV วิสาหกิจ 2566 ใน RAR hash ตรงกับ CSV P1 จึงห้ามนับรวมซ้ำ
- รวม 178 tests ผ่าน (22.815s), pip check ผ่าน; ตรวจทะเบียนเพิ่ม 6 tests ผ่าน หลักฐาน `data/local/probes/doae-p1-archives-tests.log`; ทะเบียนสิทธิ์รวม 58 exact resources ทั้งหมดยัง pending ไม่มี public/warehouse/Power Query/Online import จากรอบนี้
- เอกสาร [docs/doae-p1-archives.md](docs/doae-p1-archives.md) และ [ร่าง Data Contract](docs/doae-aggregate-data-contract-draft.md) พร้อมทบทวน ยังไม่ส่งบุคคลภายนอกและไม่ได้เชื่อมฐานทะเบียนรายบุคคล
- งานต่อ: ตรวจ source semantics/units/period และสิทธิ์, temporal DOPA crosswalk, revisions/duplicates/subtotals และ coverage, คอลัมน์ออนไลน์ 2568/ตัวเลขวงเล็บ ก่อนเข้าโมเดลและเชื่อม workflow ตาม roadmap; ห้ามตีความ staging ครบเป็น model/BI acceptance ผ่าน

```powershell
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-p1
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py --priority p1
.\.venv\Scripts\python.exe -X utf8 scripts/capture_doae_archives.py --stage
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py --priority archives
```

## ความคืบหน้าล่าสุด 23 ต.ค. 2569: DOAE P0 capture/staging ครบ

- เพิ่ม `doae-p0` ดึงครบ **21 CSV / 10 datasets / 9 schemas** ตาม inventory ที่ตรวจจริง: แผนฤดูแล้งปี 2561–2569 และไฟล์สรุป, รต.01-04, เฝ้าระวังขาดแคลนน้ำ, ภัยใน/นอกเขตชลประทาน, แผน/ผล/สรุปฤดูฝนและผล/สรุปฤดูแล้ง รวม 585,506,130 bytes
- **1,943,298 source rows = 1,943,296 staged + 2 quarantined**; ไม่ใช่ warehouse observations เพิ่มใหม่ แผนฤดูแล้งครบ 10 CSV รวม 1,857,553 แถว แยก subtotal ประเทศ/ภาค/จังหวัดออกจากรายตำบล
- รต.01-02 มีเพียง 1 แถว `(mock)` ทั้งแถว เข้า quarantine จึงยังไม่มีข้อมูลพืชจริงจาก resource นี้; นาเกลือแถว 37 มี `area_start_rai=-384.0` เข้า quarantine ไม่แก้เป็นศูนย์ แมลงมี repeated identities 48 / เกลือ 96 เก็บทุกแถวไว้ไม่รวมยอด; snapshot ใช้ `reported_at` เป็นส่วนหนึ่งของ grain
- ตรวจ hash raw/staging และเทียบ source fields/ตัวเลข/เลขแถวกับ CSV **ครบทั้ง 1,943,298 แถว** ผ่าน `scripts/verify_doae_p0.py`: `verified_resources=21`, `all_p0_resources_verified=true`; `data/local/probes/doae-p0-verification.json` รันซ้ำครบ 21 resources เป็น `skipped_verified` ไม่มี network ใหม่ (`doae-p0-resume-cli.json`)
- Unit/regression **172 tests ผ่าน (19.820s)**, pip check ผ่าน; `data/local/probes/doae-p0-tests.log`; ทดสอบ downloader ร่วมกับคำสั่งปี 2569 เดิม ผ่าน null/zero/schema/quarantine/revisions/bounds/corruption/partial failure และ verifier
- ทะเบียนสิทธิ์ exact resources รวม 33 รายการ คง pending ทั้งหมด ข้อมูลอยู่ใน `data/local/doae-p0/` ซึ่ง gitignore; release null ไม่ใช้ approved_at/updated_at/reported_at แทนวันเผยแพร่ ไม่มี warehouse import, public export, Power Query หรือ Online จากชุดนี้
- เอกสารหลัก [docs/doae-p0-ingestion.md](docs/doae-p0-ingestion.md) และบัญชี `config/doae_p0_resources.json`; source metadata หลักฐานอยู่ `data/local/probes/doae-p0-inventory.json`
- **งานต่อ:** ดึง P1 ตาม roadmap (สำนักงานเกษตร/GIS สถิติพื้นที่ประสบภัย วิสาหกิจชุมชน สมุนไพร/แมลง) หลังตรวจ schema/ขอบเขตความเป็นส่วนตัว; ตรวจ native units/period, DOPA temporal crosswalk, revisions และ coverage ของ P0 ก่อนใช้ Risk Signal หรือคำนวณ actual/plan; P2 RAR และ data contract ยังค้าง ไม่มีการติดต่อบุคคลภายนอกหรือรับรองสิทธิ์

```powershell
Set-Location -LiteralPath 'D:\code\thailand-agri-intelligence'
git status --short --branch
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-p0
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py
```

## ความคืบหน้าล่าสุด 23 ต.ค. 2569 เวลา 07:29 Asia/Bangkok

- ทำ P0 ถัดจาก DOAE roadmap: เพิ่ม `doae-dryplant` สำหรับ capture/staging resource รายตำบลปี 2569 พร้อม bounded download 2 MiB, SHA-256, immutable revisions, quarantine และ verified resume; ใช้ helper ตัวเลข/hash เดิม ไม่เพิ่ม dependency
- Live CSV 177,936 bytes SHA-256 `35448b082d4aad525f637ff3f26d7fc75776e8ecc3a704d79f3816f587e69c1c`: 599 source = 599 staged, quarantine 0, duplicate identity 0; 4 จังหวัด (20/46/81/90), 69 รหัสตำบลต้นทาง ศูนย์พื้นที่จริง 317 แถว และครัวเรือน null 599 แถว ไม่รับรอง coverage ทั้งประเทศหรือ temporal admin mapping
- เทียบค่าพื้นที่/รหัสตำบล/updated_at ทุกแถวกับ raw CSV, hash raw/staging และ rerun `skipped_verified` ผ่าน หลักฐาน `data/local/probes/dryplant-staging-cli.json`, `dryplant-verification.json`; `release_at=null`, `license_status=pending`, `rollup_eligible=false` ทุกแถว ไม่เข้า warehouse หรือ public/Online
- ทะเบียนสิทธิ์เพิ่ม exact resource เป็น 13 รายการ: CKAN ระบุ `อื่นๆ` ยังไม่ยืนยันสิทธิ์ใช้ซ้ำ ดู `docs/plan-dryplant.md` และ `docs/source-license-register.md`
- ทดสอบรวม **166 tests ผ่าน** (15.774s), `pip check` ผ่าน หลักฐาน `data/local/probes/dryplant-cycle-tests.log`; tests เฉพาะส่วนใหม่ 4 รายการครอบคลุม null/zero/schema/quarantine/size/truncation/redirect/revisions/resume/corruption
- งานต่อ: ตรวจ schema ไฟล์สรุปปี 2568 (มีประเทศ/ภาค/จังหวัดและ subtotal) และรายตำบลย้อนหลังแยกกันก่อน backfill; ตรวจขอบเขตปีเพาะปลูก/พื้นที่และสิทธิ์ก่อนเชื่อม Power Query หรือคำนวณ actual/plan สถานะ DAX runtime/refresh/render ยังไม่ผ่านจาก simulation

คำสั่งทำต่อใน checkout นี้:

```powershell
Set-Location -LiteralPath 'D:\code\thailand-agri-intelligence'
git status --short --branch
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-dryplant
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -p test_plan_dryplant.py -q
```

## ความคืบหน้าล่าสุด (22 ต.ค. 2569 เวลา 23:28 Asia/Bangkok)

ตรวจรวม 162 tests ผ่าน 100%; pip check ผ่าน. สภาพแวดล้อม: Python 3.12, DuckDB warehouse 141,699 observations ล่าสุด, exports ครบทั้ง private/public.

- **DOAE CKAN Catalog Ingestion Roadmap:** สแกนโครงสร้างและสำรวจชุดข้อมูลจริงบน `https://ckan.doae.go.th/` ผ่าน CKAN API v3 พบบัญชีข้อมูล 41 ชุดข้อมูลจริง (คัดแยกชุดทดสอบ uitest 59 รายการออก); จัดหมวดหมู่ 5 กลุ่มหลัก (การผลิตพืช/รต.01-04/แผนเพาะปลูก, ภัยพิบัติและน้ำ, ทะเบียนเกษตรกร, วิสาหกิจชุมชน, ที่ตั้ง GIS); จัดทำแผนงานและเกณฑ์ธรรมาภิบาลข้อมูล P0/P1/P2 ใน `docs/doae-catalog-expansion.md`
- **Monthly Forecasting & Seasonal Naïve Baseline (B9):** ขยายสถาปัตยกรรมโมเดลพยากรณ์ใน `src/tadih/forecast.py` ให้รองรับความถี่รายเดือนโดยตรง (ไม่ downsample ราคารายเดือนเป็นรายวัน); รองรับโมเดลฐาน `seasonal_naive` (lag 12 เดือน), `last_value` (naïve), และ `moving_average` (3 เดือน); สร้าง walk-forward backtest รายเดือนพร้อม split calibration/verification และ embargo ป้องกัน leakage; ประเมิน scorecard (MAE, RMSE, Bias, WAPE, skill score) และช่วงความเชื่อมั่นเชิงประจักษ์ (P10/P90); บังคับ gate ห้ามใช้ `retrieved_at` แทน `release_at` (หากไม่มีวันเผยแพร่จริงจะระงับและคืน Unknown ทันที); จัดทำ `docs/forecast-methodology.md` และ unit tests 20 รายการใน `tests/test_forecast.py` ผ่าน 100%
- **DAX Measures Simulation Audit (C2):** จัดทำ `docs/dax-simulation-audit.md` และ unit tests จำลองคำนวณ 13 รายการใน `tests/test_dax_simulation.py` ผ่าน 100% ครอบคลุม 35 DAX measures ใน `powerbi/measures.dax` กับข้อมูลจริง 141,699 แถวใน `data/local/powerbi/offline-v11/Data/`; พิสูจน์ guard rails สำเร็จ: ราคาระดับประเทศคืนค่าว่างทันทีเมื่อ filter จังหวัด/อำเภอ (ป้องกัน leak ลงจังหวัด), สภาพอากาศรายจุดคืนค่าว่างเมื่อเลือกหลายจุดพร้อมกัน, ราคาขายส่ง/ขายปลีกไม่ปนเข้า farmgate, แยกหน่วย บาท/กก. ออกจากหน่วยนับเฉพาะ (บาท/ร้อยผล, บาท/ฟอง, บาท/ตัว), อ่างเก็บน้ำ RID 461 แห่ง (457 แห่งที่มีปริมาตรน้ำ) คำนวณความจุ/ปริมาตร/%น้ำ ถูกต้อง, และ `Reviewed Production kg` ถูกบล็อกเป็นค่าว่างตามสเปก
- **Scheduled Price Refresh:** เพิ่ม `scripts/refresh_prices.ps1` สำหรับตั้ง Windows Task Scheduler (`TADIH-Price-Refresh` ทุกวัน 07:15 Asia/Bangkok) พร้อม lock file `data/local/scheduled/refresh.lock` ป้องกันชนกัน; ผลทดสอบ live run สำเร็จ (exit code 0, 7,658 price observations ingested, snapshots สร้างและ verify ผ่าน 8 ไฟล์ทั้ง private และ public); unit test `tests/test_refresh_script.py` ผ่าน
- **Daily Market-Price Staging:** เพิ่ม `src/tadih/daily_prices.py`, `tests/test_daily_prices.py` และ `docs/daily-prices.md`; ตัวอย่าง bounded request มะนาว ผลขนาดใหญ่พิเศษ ตลาดกลางหนองบ้วย จ.เพชรบุรี 100 แถว (บาท/ร้อยผล) คง spatial_support เป็น `market`, price_type เป็น null, release_at เป็น null, ไม่ rollup หรือเข้า warehouse ก่อนรีวิวความหมายสิทธิ์
- **Weekly Native Price Staging:** เพิ่ม `src/tadih/weekly_prices.py`, `tests/test_weekly_prices.py` และ `docs/weekly-prices.md`; ตัวอย่าง กระบือ ขนาดกลาง 42 แถว ปี 2569 หน่วย บาท/ตัว (TH00 ระดับประเทศ) คงรหัสสัปดาห์ 1–5 และเดือน ไม่แปลงเป็นวันหรือ ISO week; เก็บ revisions ครบถ้วน ไม่เข้า warehouse
- **DAX Measures Simulation Audit (C2):** จัดทำ `docs/dax-simulation-audit.md` และ unit tests จำลองคำนวณ 13 รายการใน `tests/test_dax_simulation.py` ผ่าน 100% ครอบคลุม 35 DAX measures ใน `powerbi/measures.dax` กับข้อมูลจริง 141,699 แถวใน `data/local/powerbi/offline-v11/Data/`; พิสูจน์ guard rails สำเร็จ: ราคาระดับประเทศคืนค่าว่างทันทีเมื่อ filter จังหวัด/อำเภอ (ป้องกัน leak ลงจังหวัด), สภาพอากาศรายจุดคืนค่าว่างเมื่อเลือกหลายจุดพร้อมกัน, ราคาขายส่ง/ขายปลีกไม่ปนเข้า farmgate, แยกหน่วย บาท/กก. ออกจากหน่วยนับเฉพาะ (บาท/ร้อยผล, บาท/ฟอง, บาท/ตัว), อ่างเก็บน้ำ RID 461 แห่ง (457 แห่งที่มีปริมาตรน้ำ) คำนวณความจุ/ปริมาตร/%น้ำ ถูกต้อง, และ `Reviewed Production kg` ถูกบล็อกเป็นค่าว่างตามสเปก
- **Power BI Offline Project Build (offline-v11):** สร้าง build โปรเจกต์ล่าสุด `data/local/powerbi/offline-v11/` มี 141,699 fact_observation rows จาก 5 แหล่งข้อมูล, 12 ตาราง, 15 relationships, 35 measures, 5 หน้า PBIR; ตรวจ integrity hash 34 ไฟล์ และตรวจสอบความถูกต้องของ Microsoft Fabric JSON schemas ผ่าน 21 metadata files 100% ด้วย `scripts/validate_powerbi_project.py`
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


อัปเดต 22 ตุลาคม 2569 (Asia/Bangkok) จากไฟล์และผลรันในเครื่องนี้

## งานข้อมูลรอบ 22 ต.ค. 2569 บน `D:\code\thailand-agri-intelligence`

กำลังสร้างฐานใหม่จาก raw/checkpoints ใน `data/local/` ของเครื่องนี้ เพราะ checkout ไม่มีข้อมูลจาก `T:\coding+\BI AGRI THAILAND`; ตัวเลข warehouse/PBIP รุ่นเก่าด้านล่างเป็นหลักฐานของเครื่องเดิม ไม่ใช่ผลตรวจใน checkout นี้ ให้ดูผลล่าสุดที่ `data/local/probes/warehouse-rebuild.json` และ snapshot manifest ก่อนใช้งาน

- แก้ DOAE provincial aggregate ให้คง `จังหวัด × ปี × เดือนต้นทาง × สินค้า × รอบปลูก` และไม่เรียกยอดนี้ว่ายอดปี; ยอดราย metric ที่มีองค์ประกอบ missing คง null, yield คิดจากผลผลิตรวม/พื้นที่เก็บเกี่ยวรวมเมื่อครบทั้งคู่, 2 แถวบางบอนอยู่ใน audit. รุ่นใหม่ `source-period-v2` มี 10,682 กลุ่มจาก 50,103 แถว ตรวจกับ `data/local/production/provincial-source-period-v2/provincial_production_inventory.json`; ไม่ใช้ฐานเก่าที่มี `doae-prov:` ปนกับรุ่นใหม่
- ตรวจรายการชื่อสินค้า NABC รายปี 2554–2569: union 44 ชื่อ ไม่มีชื่อที่เกิน inventory 2569; ขอบเขตคือ endpoint product-names ที่ตรวจ ไม่ใช่หลักฐานว่าราคาทุกเดือนครบ. Daily 41 ชื่อ, weekly ปี 2569 44 ชื่อ, production master 5 กลุ่ม; endpoint ไม่ส่ง total จึงคง `complete=null`. MOC ยัง unreachable. หลักฐานอยู่ `data/local/probes/`
- ดึง DOPA snapshot 2023, ขอบเขตจังหวัด DDPM 77, ERA5 5 จุด × 2016–2025, RID 14 วัน, MODIS 5 จุด และราคา 44 histories กลับมาใน `data/local/` สิทธิ์ยัง pending. แก้ MODIS ให้ `release_at=null` เมื่อทราบเพียงวันจบรอบภาพ และการดึงซ้ำ payload เดิมใช้ revision เดิม
- ฐานใหม่ `data/local/tadih.duckdb` มี 141,699 latest/revision rows: DOAE 53,410 (25,973 ค่าไม่ว่าง), ERA5 54,795, RID 25,816 (25,752 ไม่ว่าง), OAE 7,658 (7,657 ไม่ว่าง), MODIS 20. แยก spatial grain ตรงแหล่ง (DOAE province, OAE national, ERA5/MODIS grid_point, RID reservoir). ทุกแถว pending; `release_at` ของ MODIS เป็น null; ไม่มี `doae-prov:` รุ่นเก่าและไม่มี ID ซ้ำ. ดู `data/local/probes/warehouse-audit.json`
- ตรวจ checksum raw 113 partitions ผ่าน `data/local/probes/checkpoint-verification.json`; Python unittest 122 ผ่าน และ `pip check` ผ่าน. Internal snapshot `exports/private/20261022T145736Z-cf1e49b9` 141,699 แถว, public snapshot `exports/public/20261022T145919Z-dfea41a7` 0 แถว; ตรวจ SHA-256 ครบชุดละ 8 ไฟล์ `data/local/probes/snapshot-verification.json`. Coverage เดือน 2023-01 ในชุดภายในขึ้น AVAILABLE 77 provider×province เฉพาะ DOAE ไม่ใช่การรับรองยอดปีหรือ coverage ทุกเดือน
- งานต่อด้านข้อมูล: ตรวจความหมายเดือน/รอบปลูกและช่วงเวลาพื้นที่กับ DOAE, ยืนยันสิทธิ์ 7 resources/วันเผยแพร่ราคา, ตรวจสินค้าและข้อมูล daily/weekly จริง, เพิ่ม P1/P2 ตามสเปก, ทำ backtest เมื่อมี issue/release lineage; ห้ามใช้ snapshot นี้เป็น historical as-of certified forecast. ฐานเก่าที่หยุดกลางทางเก็บใน `data/local/backups/partial-before-bulk.duckdb*` เพื่อสอบสวน ไม่ใช่ฐานใช้งาน
- ช่วงนี้พัก BI ตามคำสั่งล่าสุด: **ทำข้อมูลก่อน**. ยังไม่ทดสอบ Desktop/DAX หรืออัปโหลด Online

## อ่านตรงนี้ก่อนเริ่ม

โครงการอยู่ระหว่างพัฒนา Thailand Core มี pipeline ที่รันได้ ข้อมูลจริงบางชุด และ Power BI Project ร่างในเครื่อง ยังไม่ผ่านเกณฑ์จบโครงการตามสเปก v1.4 และยังไม่มีรายงานพร้อมใช้งานครบประเทศ

คำสั่งล่าสุดของเจ้าของงาน: **ดึงและเตรียมข้อมูล ทำโมเดล ความสัมพันธ์ Power Query และ DAX ในเครื่องก่อน ตรวจผล แล้วค่อยอัปโหลด Power BI Online เมื่อพร้อม** หยุดการจัด visual ผ่าน browser ไว้แล้ว

- Workspace ปัจจุบัน: `D:\code\thailand-agri-intelligence`; `T:\coding+\BI AGRI THAILAND` เป็นเครื่องเดิม
- สเปกหลัก: [Thailand First v1.4](Thailand_Agricultural_Decision_Intelligence_Hub_Thailand_First_v1.4_2026.md) ให้ยึด PART IV เป็นลำดับแรก และคงข้อกำหนด historical/forecast ของ PART III
- Repository: [dragonfly13110/thailand-agri-intelligence](https://github.com/dragonfly13110/thailand-agri-intelligence), public ตามที่เจ้าของงานอนุมัติ เก็บเฉพาะโค้ดและข้อมูลที่อนุญาตเผยแพร่
- Source snapshot ที่เผยแพร่แล้ว: `e7ad054` รวม PBIP generator, crosswalk, ราคา 44 สินค้า, DAX, tests และเอกสาร; ดู `git log` สำหรับ revision เอกสารที่อาจใหม่กว่า
- Python: `.venv/Scripts/python.exe` รุ่น 3.12 ใน checkout นี้; รุ่น 3.14 ในบันทึกเก่าเป็นอีกเครื่อง; package ติดตั้งแบบ editable
- ข้อมูล raw, DuckDB, exports ภายใน, SDK และ PBIP ที่มีข้อมูลจริง **ถูก gitignore** การ clone repository อย่างเดียวไม่ได้ข้อมูลเหล่านี้กลับมา
- Agent ที่เคยติด usage limit กลับมาทำงานต่อได้แล้ว: geography_registry ส่งทะเบียนสิทธิ์ 6 resources, ingestion ส่ง price backfill และ tests งานที่ระบุในเอกสารนี้เป็นผลที่ส่งคืนแล้ว ไม่ต้องรอ agent ค้าง

เครื่องหมาย `[x]` หมายถึงเสร็จเฉพาะขอบเขตที่บรรทัดนั้นระบุ `[ ]` หมายถึงยังไม่ผ่านเกณฑ์นั้น คำว่า prototype/ร่างไม่ใช่งานพร้อมใช้งานจริง

## 1. มีไฟล์อะไรแล้ว

| ไฟล์/โฟลเดอร์ | ใช้ทำอะไร | สถานะ |
|---|---|---|
| `README.md` | ติดตั้งและคำสั่งเริ่มต้น | มีแล้ว |
| `config/provinces.csv` | รหัสและชื่อ 77 จังหวัด | ตรวจแล้ว; geometry แยกต่างหาก |
| `config/sources.json`, `categories.json` | registry 16 providers และ 20 หมวด | ไม่ได้แปลว่าเชื่อมข้อมูลครบ 16 แหล่ง; modis เป็น `documented_not_runtime_verified` |
| `config/commodity_sources.json`, `resource_licenses.json` | endpoints รายการสินค้าและทะเบียนสิทธิ์ราย resource | 7 resources ตรวจแล้วแต่ยัง pending (รวม RID อ่างเก็บน้ำขนาดกลาง); บาง endpoint ยังต้องตรวจ schema จริง |
| `config/thresholds.json`, `models.json` | เกณฑ์ทดลองและ baseline models | provisional ไม่ใช่เกณฑ์ทางราชการ |
| `data_contracts/*.schema.json` | 7 contracts: observation, coverage, geography, price, production, risk, forecast | มี schema/tests (observation รองรับ spatial_support=reservoir) |
| `src/tadih/ingestion.py`, `transform.py` | CKAN, ราคา OAE, weather, backfill/checkpoint, normalize | ใช้งานกับชุดตัวอย่างจริงแล้ว |
| `src/tadih/production.py`, `commodities.py` | staging ผลผลิตและรายการสินค้าจากต้นทาง | ไม่รวมสินค้าข้าม provider ด้วยชื่ออย่างเดียว |
| `src/tadih/prices.py`, `price_backfill.py` | ประวัติราคา 44 สินค้า, fixed IDs, native units และ quarantine | รันรับข้อมูลจริงและ reimport แล้ว |
| `src/tadih/reservoirs.py` | ดึง ตรวจสอบ และ normalize รายงานอ่างเก็บน้ำขนาดกลาง RID 461 แห่ง | ใช้งานจริง มี tests และคำสั่ง CLI |
| `src/tadih/geography.py` | DOPA hierarchy, ตรวจ polygon จังหวัด, crosswalk ชื่อภายใต้ parent | มีแล้ว; รุ่นรหัสปี 2023 |
| `src/tadih/warehouse.py`, `quality.py`, `publish.py` | validate/revisions, DuckDB, exports และ SHA-256 | มี tests และรันจริง |
| `src/tadih/decisions.py`, `forecast.py` | 2 decision rules, daily baseline/backtest และ gates | prototype; ยังไม่รับรองผลกับ evidence จริงครบ |
| `src/tadih/local_project.py`, `cli.py` | สร้าง PBIP, ตาราง, relationships และรายงานร่าง 5 หน้าในเครื่อง | สร้างไฟล์จริงแล้ว (offline-v4 ถึง offline-v6) |
| `powerbi/measures.dax` | 31 measures (26 เดิม + 5 อ่างเก็บน้ำ RID) รวม coverage/ราคา/อากาศ/น้ำ/ผลผลิตที่มีข้อจำกัด | descriptive price รับ release_unknown แต่ forecast ยังไม่ผ่าน; reservoir measures ยังไม่ยืนยันด้วย engine |
| `powerbi/queries.pq`, `theme.json`, `README.md` | M handoff แบบเดิม, theme และคำอธิบายโมเดล | generated PBIP มี M partitions ของตัวเอง |
| `scripts/validate_powerbi_project.py` | ตรวจ hash และ Microsoft JSON schemas ของ PBIP/PBIR | ผ่านกับร่าง offline-v4 ถึง offline-v6 |
| `scripts/validate_powerbi_model.ps1` | TOM deserialize และ TMDL round trip | ผ่าน; ไม่ใช่การทดสอบ DAX/Refresh |
| `tests/` | Python unit/integration/regression tests | ล่าสุด 115 tests ผ่าน |
| `.github/workflows/ci.yml`, `discover-sources.yml` | CI และ weekly catalog probe | มีผลรันสำเร็จ; ยังไม่ครบ 14 วัน |
| `docs/` | วิธี ingestion, production, geography, commodities, methodology, runbook, source registry, progress | อ่านตามส่วนที่จะแก้ |

## 2. ข้อมูลจริงที่เก็บแล้ว

| ชุดข้อมูล | จำนวน/ช่วงเวลา | พาธและข้อจำกัด |
|---|---|---|
| Warehouse | 109,144 observations ล่าสุด (ขนาดไฟล์ 44.76 MB) | `data/local/tadih.duckdb`; ราคา 7,658 ค่า + อากาศ 54,795 ค่า (5 จุดภูมิภาค × 10 ปี) + อ่างเก็บน้ำ RID 25,816 ค่า (461 อ่าง × 14 วัน) + ดาวเทียม MODIS 24 ค่า (5 จุดภูมิภาค) + ผลผลิตและพื้นที่ระดับจังหวัด DOAE 20,851 ค่า (77 จังหวัด) |
| ประวัติราคา OAE/NABC | 44 สินค้า ช่วงรวม ม.ค. 2011 ถึง ก.ย. 2026 | สินค้าละ 40–189 เดือน; ระดับประเทศ; `release_at` ยังไม่ทราบ; ห้ามกระจายลงจังหวัด |
| ERA5/Open-Meteo | 5 จุดภูมิภาคเกษตรไทย จุดละ 3,653 วัน ปี 2016–2025 × 3 ตัวแปร (รวม 54,795 obs) | นครปฐม (13.8, 100.25), เชียงใหม่ (18.75, 99.0), ขอนแก่น (16.44, 102.83), อุบลราชธานี (15.24, 104.85), สุราษฎร์ธานี (9.14, 99.33); ฝน, Tmax, ET0; spatial_support เป็น grid_point ไม่ใช่ค่าเฉลี่ยจังหวัด |
| RID อ่างเก็บน้ำขนาดกลาง | 461 อ่าง × 14 วันต่อเนื่อง (9–22 ต.ค. 2569) รวม 25,816 observations | `data/local/raw/rid/` 14 partitions; ความจุ, dead storage, ปริมาตรน้ำ, %น้ำ; percent calibration mismatch = 0; spatial_support เป็น reservoir |
| MODIS ดาวเทียม NDVI/QA | 28 observations (5 จุดภูมิภาคเกษตรไทย) | ครบ 5 จุดพิกัดเดียวกับ ERA5; NDVI (scale 0.0001), valid pixel fraction, pixel reliability, VI Quality; spatial_support เป็น grid_point; มีระบบตรวจจับเมฆบังอัตโนมัติ |
| DOAE production | 50,103 records, 77 ชื่อจังหวัด, 537 commodity identities | `data/local/production/staged/<source hash>/`; ปีในแถวมี 2023 และ 2024 แม้ชื่อไฟล์ระบุ 2023 |
| NABC monthly inventory | ปี พ.ศ. 2569: raw 387 / unique 376 / exact duplicates 11, 44 identities | นำเข้าแล้ว; page completion ไม่ยืนยันว่าเดือน/สินค้าครบ |
| NABC product histories | raw 7,669, valid 7,657, duplicate 10, conflict 1 เดือน/2 แถว; 44 captures ครบตาม pagination | `data/local/probes/monthly-price-backfill.json`, `monthly-price-import.json`; raw อยู่ partition monthly-product; ไม่ถือว่าครบทุกสินค้าในอดีต |
| DOPA hierarchy | active 77 จังหวัด + 928 อำเภอ/เขต + 7,436 ตำบล/แขวง; retired 1,584 | `data/local/geography/dopa_ccaatt.xlsx`; source snapshot **2023-09-01** ไม่ใช่ master ปัจจุบันปี 2026 |
| DDPM province geometry | GeoJSON 77 จังหวัด | `data/local/geography/ddpm_province.geojson`; simplified display polygons, ตรวจสอบจุดพิกัดเกษตร 5 ภูมิภาคตกในขอบเขตจังหวัดถูกต้อง |
| DOAE admin crosswalk | match 50,101/50,103 records | `data/local/production/admin_crosswalk.csv`, `crosswalk-result.json`; temporal boundary ยังไม่รับรอง |
| Weather forecast sample | 22–28 ต.ค. 2026 | raw แยกใน `data/local/raw/`; ไม่ทราบ issue time ที่ยืนยันได้ ไม่เข้า observations/backtest |
| Internal export | 88,293 observations พร้อม CSV/Parquet และ 8 decision cards | ดูพาธใน `data/local/private-build.json` (`exports/private/20261022T114836Z-409364b9`); `redistribution_allowed=false` |
| Public export | observations 0 แถว | ดู `data/local/public-build.json`; สิทธิ์ข้อมูลจริงยัง pending จึงไม่ออกสาธารณะ |
| Public coverage view | 1,232 provider×province entries | `exports/public/small/coverage.csv`; 77 จังหวัด × 16 แหล่ง; เป็น metadata `UNVERIFIED` ไม่ใช่ข้อมูลวัด |

รายการที่ match ไม่ได้คือ กรุงเทพฯ / เขตบางบอน / `บางบอน*` จำนวน 2 records เก็บไว้ ไม่เดารหัสตำบลหรือโอนยอดไปตำบลใหม่

ราคา conflicting คือข้าวเปลือกเจ้า ความชื้น 15 เดือนตุลาคม 2012 ต้นทางให้สองค่าต่างกัน ไม่มี release ordering จึงเก็บ raw ทั้งคู่และสร้าง quality revision ค่า null/Unknown เพื่อไม่ให้ค่าเก่ารอดเป็นค่าปัจจุบัน การปลด quarantine ต้องมีหลักฐานยืนยันและ quality-resolution revision ใหม่ ดู docs/commodities.md

แก้ legacy observation ID ของข้าวที่เคยผูกกับค่าราคาแล้ว ตอนนี้ source/product/unit/month/area คงที่ ส่วนค่าที่เปลี่ยนเป็น revision สำรองฐานเดิมไว้ใน `data/local/backups/` ก่อนเปลี่ยน หลักฐานและพาธสำรองอยู่ `data/local/verification/price-identity-migration-2026-10-22.json` raw และ immutable exports เก่าไม่ถูกแก้

แหล่งหลักฐานเพิ่มเติม: `data/local/probes/`, `data/local/production/cli-result.json`, `data/local/geography/cli-result.json` และ manifests ในแต่ละ staging/raw partition ห้ามเติมค่าว่างเป็น 0 หรือสรุปว่า provider ไม่เผยแพร่จากการที่ยังดึงไม่ได้

## 3. Power BI ที่ทำถึงแล้ว

เปิดโครงการร่างล่าสุดจาก `data/local/powerbi/offline-v10/TADIH.pbip` และดู manifest ล่าสุดที่ `data/local/powerbi/latest-build.json` โครงการนี้ใช้ข้อมูลภายในที่ยังไม่อนุมัติเผยแพร่ จึงยังไม่พร้อมนำขึ้น Online รุ่น offline-v1 ถึง v9 และโฟลเดอร์ตรวจชั่วคราวจัดเก็บเข้า `data/local/powerbi/archive/` อย่างเป็นระเบียบ

- [x] สร้าง `TADIH.SemanticModel/model.bim` และ `definition.pbism`
- [x] สร้าง M parameter `ExportFolder` กับ CSV reader ที่ระบุชนิดข้อมูลและเก็บ missing เป็น null
- [x] สร้าง 12 ตาราง: dim_area, dim_source, dim_category, dim_period, dim_admin_area, dim_commodity, fact_observation (109,144 แถว), fact_data_coverage, fact_category_coverage, fact_production_source, decision_cards (8 รายการประเมินจาก evidence จริง ครอบคลุม 4 ภูมิภาคหลัก), snapshot_metadata
- [x] สร้าง 15 relationships แบบ filter ทิศเดียว ตรวจ dimension keys ไม่ซ้ำและ foreign keys ที่ไม่ว่างมีปลายทาง
- [x] นำ 35 DAX measures เข้า model source (26 เดิม + 5 reservoir ของ RID + 4 satellite NDVI/QA); ปิด implicit SUM ของคอลัมน์ตัวเลข แยก native price unit กับ THB/kg และไม่ซ่อนราคา descriptive เพียงเพราะยังไม่รู้ release date
- [x] สร้าง PBIR ร่าง 5 หน้า: Situation Room, Crop/Price, Water, Satellite (เชื่อมโยง dim_period กับ 4 measures ดาวเทียมและ snapshot metadata), Forecast/Decision Audit (แสดง decision screening cards 8 รายการและ audit metadata)
- [x] แก้ไข Desktop Frown Crash `Cannot find file 'version.json'`: เพิ่ม `TADIH.Report/definition/version.json` (schema `versionMetadata/1.0.0/schema.json`, version `"2.0.0"`) ตามข้อกำหนดของ Power BI Desktop ExplorationSerializer
- [x] ตรวจ SHA-256 ครบ 34 project files และ Microsoft JSON schemas ผ่าน 21 metadata files (offline-v10)
- [x] TOM SDK 19.114.12 deserialize และ TMDL round trip ผ่าน (12 tables / 15 relationships / 35 measures / 8 real decision cards / 109,144 fact rows) บันทึกใน `data/local/powerbi/archive/offline-v10-tmdl-check`
- [ ] เปิด PBIP และ Refresh ใน Power BI Desktop จริง
- [ ] Execute DAX ใน engine แล้วเทียบผลกับข้อมูลต้นทาง รวม filter context/blank/zero/เดือนก่อน
- [ ] ตรวจภาพ ภาษาไทย การเข้าถึงบนมือถือ และการใช้งานจริง
- [ ] เพิ่ม slicers, drill-through, charts, source tooltips, map และรายละเอียด UX ตามสเปก ขณะนี้ visuals เป็นตารางพื้นฐาน
- [x] ทำ Satellite จากข้อมูลจริง เชื่อมต่อ MODIS 500m 16-day NDVI และ Cloud QA ครบ 5 จุดตัวแทนภูมิภาคเกษตรกรรมไทย ผ่าน Planetary Computer พร้อม cloud flag และ valid fraction
- [x] เชื่อม evidence น้ำ/ราคา/ผลผลิตเข้า decision screening workflow (D01 ตลาด watch/unknown, D02 น้ำ watch/normal/unknown) ครบ 8 cards ใน decision_cards.csv ครอบคลุม 4 ภูมิภาค
- [ ] ตรวจสิทธิ์ การแชร์ refresh และข้อมูลที่จะเผยแพร่ ก่อนนำขึ้น Online

`dim_commodity` ในร่างมี 581 identities: DOAE 537 + ราคา OAE 44 ไม่ใช่ taxonomy กลางที่รวมสินค้าเทียบกันแล้ว ผลผลิตยัง `rollup_eligible=false`; measure `Reviewed Production kg` ตั้งเป็น BLANK จนกว่าจะตรวจ grain/admin/time/completeness

`model.bim` และ `definition/` แบบ TMDL เป็นทางเลือกกัน อย่าใส่ทั้งสองใน semantic-model folder เดียวกัน โฟลเดอร์ `data/local/powerbi/offline-v4-tmdl-check/` เป็นผลตรวจแยก ไม่ใช่โมเดลอีกชุดที่ต้อง publish

บน Online เคยสร้าง prototype ชื่อ `TADIH Coverage 77 Provinces` จาก metadata สาธารณะไว้ก่อนเจ้าของงานเปลี่ยนวิธีทำ ยังไม่ใช่รายงานปลายทาง ไม่มีข้อมูลวัดสิทธิ์ pending ที่ส่งขึ้นจากชุด local นี้ อย่าเริ่มจัด visual บน browser ต่อหรือทับ prototype ระหว่างเตรียมข้อมูล

## 4. เช็กลิสต์งานรวมและลำดับทำต่อ

### A. สิ่งที่พิสูจน์แล้วในขอบเขตฐานระบบ

- [x] รหัส/ชื่อจังหวัด 77 แห่งพร้อม source registry และ coverage schema
- [x] รับ metadata DOAE/OAE ผ่าน catalog จริงแบบแบ่งหน้า
- [x] รับประวัติราคา 44 series ตาม inventory ปี 2569, อากาศจุดตัวอย่าง 10 ปี และผลผลิตไฟล์ DOAE เต็ม
- [x] ตรวจสิทธิ์ราย resource 6 ชุดและบันทึกหลักฐาน; ทุกชุดยัง pending ไม่มีการอนุมัติเผยแพร่
- [x] แยก duplicate/conflicting prices และทดสอบ revision/รีรันไม่เพิ่มแถวซ้ำ
- [x] เก็บ raw hashes/checkpoints, missing, source grain และ revisions
- [x] แยก public/internal exports และไม่ปล่อย pending data ใน public CI
- [x] มี decision/forecast prototype ที่คืน unknown หรือ suppress เมื่อหลักฐานไม่พอ
- [x] สร้าง Power BI source project ในเครื่องและตรวจโครงสร้างได้

### B. ทำต่อก่อนรับรองข้อมูล/โมเดล

- [ ] **B1 สิทธิ์และเวลาเผยแพร่:** ปิดเงื่อนไขที่ยังค้างในทะเบียน 7 resources (DOAE, OAE ข้าว, DOPA, DDPM, Open-Meteo archive/forecast, RID อ่างเก็บน้ำขนาดกลาง) และเพิ่มสิทธิ์รายสินค้า/endpoint ที่ยังไม่ได้ตรวจ พร้อม historical earliest/latest; อย่าแก้ `pending` เป็น `approved_public` โดยไม่มีหลักฐาน
- [ ] **B2 สินค้าและราคา:** monthly 44 histories normalize แล้ว; ตรวจ union ชื่อสินค้ารายปีย้อนหลัง 16 ปี (2554–2569) พบ 44 ชนิดตรงกับ inventory 2569 พอดี ไม่มีสินค้าตกหล่นในอดีต (docs/commodity-history-audit.md); ยังต้องตรวจ daily/weekly/production จริงต่อเนื่อง, taxonomy ข้าม provider, release lineage และ conflict 1 เดือน; MOC เคย timeout ยังไม่ถือว่าเชื่อมสำเร็จ
- [ ] **B3 พื้นที่และผลผลิต (ช่วงก่อนบนเครื่องเดิม; ต้องทบทวนเวลา):** ตรวจ 2 records บางบอนที่ยัง unmatched (`บางบอน*` แขวงที่ถูกยกเลิกใน DOPA 2023) เก็บแยกไว้ใน audit ไม่เดารหัสตำบล; ตรวจสอบ 50,103 source rows ไม่มี subtotal แฝงและไม่มี duplicate identity; เคยสร้าง annual aggregates 6,696 กลุ่ม (50,101 rows matched snapshot); คำนวณ derived weighted yield (sum(production)/sum(harvested)) ห้าม average; ingest 20,851 observations เข้า DuckDB warehouse สำเร็จ ผ่าน 120 unit tests 100%
- [x] **B4 Coverage จริง:** ปรับปรุง Coverage matrix และ Category coverage โดยใช้ USABLE_QUALITY_FLAGS ครอบคลุม gold_provincial_aggregate, partial_unmatched_subdistrict, percent_calibration_consistent, release_unknown; กำหนด missing reason และ data grain ซื่อสัตย์ราย resource (แยก grid_point, reservoir, national ชัดเจน); เมื่อเลือก period 2023-12 แสดง DOAE ระดับจังหวัดเป็น AVAILABLE ครบ 77 จังหวัด; ผ่านสัญญา coverage.schema.json และ unit tests 121 ผ่าน 100%
- [x] **B5 อากาศระดับประเทศ:** ขยายเก็บอากาศ 5 จุดตัวแทนเกษตรกรรมไทย (นครปฐม กลาง, เชียงใหม่ เหนือ, ขอนแก่น อีสานบน, อุบลราชธานี อีสานล่าง, สุราษฎร์ธานี ใต้) ย้อนหลัง 10 ปี (2016–2025) รวม 54,795 observations; คำนวณ rainfall percentiles ย้อนหลัง 10 ปีสำหรับเกณฑ์ตัดสินใจฝนแล้งได้แล้ว; ตรวจสอบพิกัดตกในขอบเขตจังหวัด DDPM ครบถ้วน
- [x] **B6 น้ำและดาวเทียม:** ขยาย RID อ่างเก็บน้ำขนาดกลาง 461 แห่งย้อนหลัง 14 วันต่อเนื่อง (25,816 observations, percent calibration mismatch = 0) และขยายดาวเทียม MODIS 500m 16-day NDVI/QA ครบ 5 จุดตัวแทนเกษตรกรรมไทย (28 observations) พร้อมระบบตรวจจับเมฆบังอัตโนมัติ
- [ ] **B7 หมวดอื่นตามสเปก:** พัฒนาข้อมูลดิน ภัยพิบัติ ปศุสัตว์ ประมง ตามลำดับ P1/P2: เชื่อมโยงและ staging สำเร็จ 3 ชุด (LDD zoning 308 ค่า 77 จังหวัด, DOF ประมง 540 ค่า 27 ปี, DLD ปศุสัตว์ 35 ค่า 7 ปี) พร้อมทะเบียนสิทธิ์ pending ครบใน config/resource_licenses.json (12 resources); ตรวจผ่าน CLI และ unit tests 100%; คงสถานะ staging ไม่ aggregate ข้ามหน่วยหรือนำเข้า warehouse จนกว่าจะยืนยันปีสำรวจ/ปฏิทินเผยแพร่
- [x] **B8 Decision workflows:** ขยายทดสอบ D01 ตลาด/ผลผลิต และ D02 น้ำกับ evidence จริงครอบคลุม 4 ภูมิภาคหลัก รวม 8 cards (Watch 2, Normal 3, Unknown 3 จาก cloud safety และ spatial mismatch); เคยรวมเข้า snapshot ภายใน 88,293 observations บนเครื่องเดิม พร้อม unit tests 119 ผ่าน 100%
- [x] **B9 Forecast:** ขยายสถาปัตยกรรมโมเดลพยากรณ์รายเดือนและ Seasonal Naïve (docs/forecast-methodology.md และ tests/test_forecast.py รวม 20 tests ผ่าน 100%); ตรงความถี่จริง ไม่ downsample รายเดือนเป็นรายวัน; มี walk-forward backtest, scorecard (MAE/RMSE/Bias/WAPE/skill) และ empirical interval calibration; บังคับ gate ห้ามใช้ retrieved_at แทน release_at (ราคารายเดือน OAE ที่ยังไม่ทราบวันเผยแพร่จริงจะถูกระงับเป็น Unknown ตามสเปก)

### C. ตรวจ Power BI ในเครื่องแล้วจึงขึ้น Online

- [ ] **C1 Runtime:** เปิด PBIP, refresh ทุกตาราง, ตรวจชนิดข้อมูล/null และ relationships ใน Desktop รุ่นที่รองรับ project format
- [ ] **C2 DAX runtime:** มี Python simulation ของ 35 measures (tests/test_dax_simulation.py และ docs/dax-simulation-audit.md) สำหรับตรวจ guard rails เบื้องต้น; ยังต้อง execute DAX ใน engine และเทียบ filter context/blank/zero/เดือนก่อนกับต้นทาง จึงยังไม่ผ่าน C2 จาก simulation เพียงอย่างเดียว
- [ ] **C3 Report:** ทำรายงาน 5 หน้าให้ใช้ตัดสินใจได้ตามข้อ 49 ของสเปก พร้อม map/drill-down เท่าที่ข้อมูลมีจริงและแสดง quality/freshness/หน่วย/ที่มา
- [ ] **C4 Acceptance:** ตรวจผู้ใช้จริง mobile/accessibility/privacy/RLS ตามกลุ่มผู้ใช้ที่ตกลง และแยก Official/Observed/Estimated/Forecast/Scenario/Unknown
- [ ] **C5 Publish:** คัดชุดที่สิทธิ์ผ่านและ runtime ผ่านแล้วขึ้น Online ตั้ง refresh/credentials/gateway ตาม deployment จริง ทดสอบหลัง publish แล้วบันทึก workspace/model/report และวิธี rollback

### D. งานอัตโนมัติและการส่งมอบ

- [ ] **D1 Scheduled ingest:** ปัจจุบันมี weekly catalog probe เท่านั้น ต้องเพิ่ม refresh ข้อมูลจริงที่อนุญาต พร้อม request budget/retry/failure handling ที่ตรวจได้
- [ ] **D2 ต่อเนื่อง 14 วัน:** เก็บหลักฐานรันจริงและการจัดการ failure ครบ 14 วัน ผล CI สำเร็จครั้งเดียวไม่ใช่หลักฐานข้อนี้
- [ ] **D3 Backup/restore:** สำรอง DuckDB/raw/manifests/local PBIP ไปพื้นที่องค์กรที่อนุมัตินอก trial แล้วทดสอบ restore จริง; Git ไม่มีข้อมูล ignored เหล่านี้
- [ ] **D4 ส่งมอบ:** จัด data dictionary/source-license register/model scorecard/cost/quota/runbook ฉบับใช้งานจริง และทดสอบทำงานต่อโดยไม่พึ่ง Fabric trial
- [x] **D5 Git:** review/diff/test และ commit/push source ที่อนุญาตเผยแพร่แล้วใน `e7ad054`; raw, DuckDB, SDK และ PBIP ที่มีข้อมูลจริงยังถูก ignore ไม่อยู่บน remote

ไม่กำหนดเปอร์เซ็นต์เสร็จทั้งโครงการจากจำนวนไฟล์หรือจำนวนแถว ให้ตรวจเกณฑ์ข้อ 46 และ 53 ของสเปกทีละข้อ

## 5. คำสั่งเริ่มต่อสำหรับ AI

ทำจาก workspace เดิมด้วย PowerShell อ่าน `git status` ก่อนแก้ อย่าทับงานค้างหรือดึงข้อมูลใหม่ซ้ำโดยไม่ตรวจ checkpoint

```powershell
Set-Location -LiteralPath 'T:\coding+\BI AGRI THAILAND'
git status --short
./.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -q
./.venv/Scripts/python.exe -m pip check
./.venv/Scripts/python.exe -m tadih status
./.venv/Scripts/python.exe -X utf8 scripts/validate_powerbi_project.py data/local/powerbi/offline-v6
```

Validator ใช้ schema cache ที่ `data/local/tools/schemas` หากย้ายเครื่องและไม่มี cache ให้ใช้ `--download-schemas` เพื่อรับ schemas จาก Microsoft ผ่าน HTTPS แล้วตรวจแบบ offline ซ้ำได้ SDK อยู่ `data/local/tools/tom/lib/net8.0` และไม่ได้อยู่ใน Git

ตรวจ model source ด้วย TOM โดยใช้ output directory ใหม่ที่ยังไม่มี:

```powershell
./scripts/validate_powerbi_model.ps1 `
  -Project data/local/powerbi/offline-v6 `
  -TomLibrary data/local/tools/tom/lib/net472 `
  -TmdlOutput data/local/powerbi/tmdl-check-next
```

บนเครื่องนี้ PowerShell เป็น 5.1 (.NET Framework) จึงรันกับ `lib/net8.0` ไม่ได้ (`ReflectionTypeLoadException`) ต้องใช้ `lib/net472` ซึ่ง extract จาก nupkg เดียวกัน และคัดลอก `Microsoft.Identity.Client.dll` รุ่น 4.83.3.0 จาก `C:\Program Files\Microsoft Power BI Desktop\bin\` ไปวางใน `lib/net472/` (dependency ของ AMO net472) ทั้งสองส่วนอยู่ใน `data/local/` ที่ถูก gitignore ไม่มีใน repo

วิธีสร้างร่างใหม่จาก snapshots เดิม ใช้ output directory ใหม่เสมอ ไม่ทับร่างที่แก้ใน Desktop แล้ว:

```powershell
$snapshotPath = (Get-Content data/local/private-build.json -Raw -Encoding utf8 | ConvertFrom-Json).snapshot
$productionHash = 'a505aa24d0706a162a1d56265cc61fb6ce33df8c9760dab414bf0ad01762e445'
./.venv/Scripts/python.exe -m tadih local-project $snapshotPath `
  "data/local/production/staged/$productionHash/inventory.json" `
  data/local/geography/dopa_ccaatt.xlsx `
  --output data/local/powerbi/offline-v9
```

หมายเหตุ: `ExportFolder` ของ generated model เป็น absolute path ไป `Data/` ของร่างนั้น ย้ายโฟลเดอร์หรือเครื่องแล้วต้องแก้ parameter นี้ ผล build มี `build_manifest.json` เก็บ counts และ hashes; การแก้ไฟล์ใน Desktop ทำให้ hash เก่าต่างได้ ต้องเก็บต้นฉบับและสร้างหลักฐานตรวจใหม่ตามจริง

## 6. คำแนะนำเมื่อต้องย้ายไปทำงานอีกเครื่องหนึ่ง (Multi-Machine Migration)

เนื่องจาก Repository นี้เป็น Public ตามข้อกำหนดสิทธิ์:
1. **โค้ดและสคริปต์ (อยู่ใน Git):**
   - ให้ commit และ push จากเครื่องนี้ (`git push origin main`)
   - บนเครื่องใหม่ ทำ `git clone` หรือ `git pull` แล้วตั้งค่า virtual environment:
     ```cmd
     cmd /c python -m venv .venv
     cmd /c .venv\Scripts\pip install -e .
     cmd /c .venv\Scripts\python -m unittest discover -s tests
     ```
2. **ข้อมูลภายในและไฟล์ที่ถูก Gitignore (`data/local/` และ `exports/private/`):**
   - ข้อมูลจริงทุกชุด (DuckDB warehouse 88k rows, DOAE staging, DOPA excel master, โมเดล PBIP, TOM DLLs) มีสถานะสิทธิ์ pending จึง **ถูก gitignore ห้ามนำเข้า Git เด็ดขาด**
   - ให้คัดลอกโฟลเดอร์ `data/local/` และ `exports/private/` ใส่ External Drive / Flash Drive / เครือข่ายส่วนตัว ไปวางที่ root ของ repo บนเครื่องใหม่
   - หรือหากต้องการนำเฉพาะโปรเจกต์ Power BI ไปเปิดบนเครื่องใหม่: ให้คัดลอกโฟลเดอร์ `data/local/powerbi/offline-v9/` ไปด้วย
3. **การปรับแก้ Data Path ใน Power BI Desktop เมื่อย้ายเครื่อง:**
   - ใน `TADIH.SemanticModel/model.bim` มี Parameter ชื่อ `ExportFolder` ซึ่งปัจจุบันชี้ไปที่ `T:\coding+\BI AGRI THAILAND\data\local\powerbi\offline-v9\Data`
   - หากพาธของโฟลเดอร์โปรเจกต์บนเครื่องใหม่ต่างไป (เช่น อยู่ไดรฟ์ `C:\` หรือ `D:\`):
     - **วิธีที่ 1 (ผ่าน UI):** เปิด `TADIH.pbip` ใน Power BI Desktop -> ไปที่แท็บ `Home` -> คลิกเมนู `Transform Data` -> เลือก `Edit Parameters` -> แก้ไขค่า `ExportFolder` ให้เป็นพาธโฟลเดอร์ `Data` บนเครื่องใหม่ -> กด `OK` และ `Apply Changes`
     - **วิธีที่ 2 (ผ่าน CLI):** รันคำสั่งสร้าง build ใหม่ในเครื่องใหม่ `python -m tadih local-project ...` ตัว script จะจับ path ปัจจุบันของเครื่องใหม่ให้อัตโนมัติ

## 7. หลักฐานการตรวจและข้อจำกัดล่าสุด

- Python tests ล่าสุด: **119 ผ่าน**; `pip check` ผ่าน รวม regression สำหรับ schema cache, price identities, units, quarantine, no-network resume, RID reservoirs contract/idempotence, MODIS satellite NDVI/QA normalization/idempotence, decision workflows (D01/D02) และ `version.json` report metadata
- Local PBIP: hashes 34 files และ Microsoft schemas 21 metadata files ผ่านร่าง offline-v9 (**88,293 observations**, 35 measures, **8 decision cards**) แก้ไขปัญหา Frown crash `Cannot find file 'version.json'` ใน Power BI Desktop แล้ว
- Independent review ตรวจหน่วย ราคา/revisions/quarantine และพบข้อแก้ DAX 2 จุด: ให้หน่วยใช้ context เดียวกับค่าราคา และบังคับ farm_gate ไม่รับ wholesale/retail ทั้งสองจุดแก้ใน source แล้ว
- TOM SDK 19.114.12: model deserialize/TMDL round trip ผ่านทั้ง offline-v4 (26 measures), offline-v5 (31 measures), offline-v6 (35 measures), offline-v7, offline-v8 และ offline-v9 (12 tables / 15 relationships / 35 measures / 8 real decision cards) ด้วย `lib/net472` + MSAL 4.83.3.0 จาก Power BI Desktop; บันทึกใน `data/local/powerbi/archive/offline-v9-tmdl-check`
- Internal snapshot: ตรวจ hashes ครบ 8 artifacts; **88,293 observation rows** + **8 decision cards** ล่าสุดอยู่ใน `data/local/private-build.json` (`exports/private/20261022T114836Z-409364b9`)
- Public snapshot: ตรวจ hashes ครบ 8 artifacts; 0 observation rows (สิทธิ์ยัง pending) ล่าสุดอยู่ใน `data/local/public-build.json` (`exports/public/20261022T114949Z-1eb57f80`)
- Source `license_status` ของชุดจริงยัง pending, unknown timestamps คง null, forecast ยัง suppressed และไม่มีการตรวจ DAX runtime/Power BI rendering

ทุกครั้งที่ทำต่อ ให้แก้เช็กลิสต์นี้พร้อมหลักฐาน/พาธ/จำนวน tests และระบุขอบเขตที่ผ่าน อย่าติ๊กผ่านจากการมีโค้ดหรือไฟล์เพียงอย่างเดียว
