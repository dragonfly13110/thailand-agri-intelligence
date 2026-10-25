# คู่มือปฏิบัติงาน

## ลำดับการทำงานปัจจุบัน (23 ต.ค. 2569)

ใช้ [เช็กลิสต์ส่งต่องาน](../HANDOFF.md) เป็นสถานะปัจจุบัน และ [เป้าหมายศูนย์ข้อมูลกลาง](national-agriculture-data-center.md) กับ [แผนเว็บ Next.js](../tasks/plan.md) เป็นลำดับงาน: ตรวจ manifest/สิทธิ์และ coverage ของข้อมูลที่มีในเครื่อง → เตรียม catalog snapshot สำหรับเว็บ → ส่งมอบเว็บค้นหา/รายละเอียด → เพิ่มหน้าพื้นที่/ตัวชี้วัดที่เชื่อมได้จริง → ทะเบียนโครงการและแผนเทียบผล ระยะนี้ไม่โหลดซ้ำโดยไม่มีช่องว่างข้อมูลที่ระบุชัด

## ขั้นตอนส่งมอบเว็บ Next.js

ยุติ Power BI เป็นช่องทางส่งมอบตาม [ADR-001](decisions/0001-nextjs-web-delivery.md) ใช้ Python/DuckDB เดิม ไม่สร้าง PBIP หรือทำ Desktop/DAX/Service เพิ่ม เอกสาร [Power BI](../powerbi/README.md) และส่วนประวัติใน HANDOFF ใช้อ่านหลักฐานเดิมเท่านั้น

1. ตรวจ exporter/สัญญาเดิม เลือกข้อมูล/metadata ที่ผ่านสิทธิ์และ PII แล้ว เตรียม snapshot ขนาดจำกัดพร้อม revision/manifest/checksum; pending ต้องไม่ออกสาธารณะ แม้เป็น metadata
2. มีแอป Next.js + TypeScript ชุดแรกใน `web/` แล้ว ตาม [คู่มือเว็บ](../web/README.md) อ่าน snapshot ฝั่ง server มีหน้าแรก ค้นหา และรายละเอียด ใช้ฟอร์ม GET/URL สำหรับตัวกรองโดยไม่เพิ่ม client state store; สร้าง export และ build/start เป็น release เดียว ไม่แก้ snapshot สดหลัง build
3. เก็บ API keys ฝั่ง server ห้ามนำ `data/local/` หรือ `exports/private/` เข้า public/build หรือส่งใน HTML/JSON/props/cache; internal บนเว็บต้องรอการยืนยันตัวตนและตรวจสิทธิ์ฝั่ง server ไม่เชื่อ `license_scope` ที่ผู้เรียกส่งเอง
4. ตรวจ contract/ยอด/null/หน่วย/เวลา/พื้นที่/สิทธิ์ เทียบข้อมูลที่ render กับต้นทาง และทดสอบ browser จริงบน desktop/mobile ทั้งตัวกรอง ลิงก์ตรง empty/partial/error และคีย์บอร์ด; type/lint/build ผ่านไม่เท่ากับ browser หรือ deployment ผ่าน
5. ก่อนเผยแพร่ ตรวจ artifact ว่าไม่มีข้อมูลภายใน มี snapshot rollback/backup และรอบ refresh แล้วตรวจ preview/production แยกกัน ขั้นตอน hosting และคำสั่ง deploy จะบันทึกเมื่อเลือกและทดสอบจริง

เปิดตัวเลขที่มีในเครื่อง: จาก `web/` ใช้ `npm.cmd run local -- --port 3123` แล้วกด “เปิดตารางข้อมูลจริง” ที่ `/explore` หรือหน้ารายละเอียด ดู [ขั้นตอนและข้อจำกัด](../web/README.md) ตัว reader อ่าน fixed statistical columns จาก staging/DuckDB แบบ read-only หลังผ่าน local session เท่านั้น ไม่คัด raw เข้า snapshot/build ไม่ใช่ internal deployment สำหรับหลายคน อย่าเปิด flag ผ่าน proxy/network; หลัง restart ต้องเริ่ม session ใหม่ โหมด `npm run start` ปกติแสดงเฉพาะ metadata

บันทึกประวัติ 22 ตุลาคม 2569: เคยเริ่ม semantic model Coverage ทดลองบน Online ไม่ใช่ผลิตภัณฑ์ปัจจุบัน การปรับแผนนี้ไม่ได้เปลี่ยนหรือลบระบบออนไลน์เดิม

## โครงสร้างและการรัน

ติดตั้งจาก README แล้วใช้ `python -m tadih --help` ไฟล์ฐานข้อมูลเริ่มต้น `data/local/tadih.duckdb` เปลี่ยนได้ด้วย `--db` ก่อนชื่อคำสั่ง เช่น `python -m tadih --db data/local/check.duckdb build`

ขั้นตอนรับข้อมูลเมื่อจำเป็น: ตรวจ inventory/manifest ก่อน → ดึง raw เฉพาะส่วนที่ขาด → เก็บ checksum/checkpoint → แปลงตาม data contract → ตรวจ schema/เวลา/หน่วย/พื้นที่และสิทธิ์ → บันทึก coverage และเหตุผลช่องว่าง → เพิ่ม revision ที่ผ่านเกณฑ์ลง DuckDB → สร้าง immutable export → ตรวจ checksum → ให้เว็บอ่านชุดที่ได้รับสิทธิ์

รับ JSON ที่แปลงเป็น observation contract แล้วด้วย `python -m tadih ingest path/to/observations.json` ต้องเป็น array และใช้รหัสพื้นที่ที่ตรวจแล้ว ไม่มีการเติมช่องว่างเป็นศูนย์ ถ้าแถวใดผิดจะยกเลิกทั้งชุดก่อนบันทึก หรือ rollback transaction เมื่อ revision ชนกัน

`observation_id` ต้องคงเอกลักษณ์ source/พื้นที่/สถานที่/สินค้า/เวลา/metric/หน่วย/ตลาด/เกรด/ฤดู การแก้ค่าต้องมี `revision_id` ใหม่ การเรียกข้อมูลซ้ำ revision เดิมทำซ้ำได้โดยไม่เพิ่มแถว แต่เนื้อหา revision เดิมเปลี่ยนไม่ได้

ราคาข้าวรุ่นต้นเคยผูก observation ID กับค่าราคา ข้อมูลในเครื่องถูก migrate แล้วโดยสำรองฐานเดิมก่อนเปลี่ยน ดู `data/local/verification/price-identity-migration-2026-10-22.json` ถ้าใช้ฐานรุ่นก่อน migration อย่านำ normalizer รุ่นใหม่เข้าไปผสมโดยตรง ต้องสำรองและเทียบทุก historical revision ก่อนย้าย IDs และ canonical source URLs

ราคาหลายค่าขัดแย้งใน source/month เดียวกันจะเก็บ raw ทั้งหมดใน snapshot แต่ไม่เลือกค่ามาเป็น actual ใช้ derived unknown/null quality revision เพื่อบล็อกค่าเก่าด้วย การปลด quarantine ต้องมีหลักฐานและ quality-resolution revision ใหม่ การรัน raw revision เดิมซ้ำไม่แก้ประวัติหรือปลดบล็อกเอง

## ความหมายของ coverage

ก่อนดาวน์โหลด resource ใหม่ ให้ค้น [แผนที่ข้อมูล/API](accessible-data-map.md) และ `data/local/access-map/REPORT.md` ซึ่งมี dataset/resource links, schema, join candidates และผลเข้าถึงจริง การสำรวจนี้เป็น metadata inventory แยกจาก coverage ที่ผ่านตรวจแล้ว ใช้ `scripts/map_accessible_sources.py --build` รวมหลักฐานเดิม; คำสั่งสำรวจ/วิธี resume และข้อจำกัดอยู่ในคู่มือดังกล่าว อย่าเปิดเผย environment values หรือส่ง key ตาม redirect ข้าม host

`fact_data_coverage.csv` แสดง 1 แถวต่อ provider × จังหวัด × เดือน × กลุ่ม metric ที่นำเข้า เป็น readiness ขั้นแรก ยังไม่ใช่ inventory ครบทุก resource ของหน่วยงาน `expected_count` และ `gap_count` ว่างจนกว่าจะรู้จำนวนที่ควรมี

`fact_category_coverage.csv` มี 77 × 20 แถว ใช้ metric ที่นำเข้าจริงในการกำหนดหมวด ไม่ใช้รายชื่อหมวดที่ provider อาจให้บริการ ข้อมูลระดับประเทศ จุด หรือสถานีไม่ทำให้จังหวัดมีสถานะ AVAILABLE เดือนคำนวณตามเวลาไทย UTC+7 แม้ข้อมูลในฐานเก็บเวลา UTC

- `AVAILABLE`: มีค่าไม่ว่างของจังหวัดนั้น ผ่าน quality flag และสิทธิ์ตาม audience
- `UNVERIFIED`: ยังไม่มีข้อมูลจังหวัดผ่านเกณฑ์ ไม่ได้บอกว่าต้นทางไม่เผยแพร่
- `NOT_PUBLISHED`, `NOT_APPLICABLE`, `PIPELINE_ERROR`: นิยามเตรียมไว้ใน schema ต้องมีหลักฐานราย dataset ก่อนใช้งาน รุ่นนี้ยังไม่อนุมานสถานะเหล่านี้

ความสดแสดง `unknown` ถ้าไม่รู้รอบเผยแพร่ของ provider ไม่ตั้ง SLA ขึ้นเอง การมีข้อมูล 1 metric ไม่ได้ยืนยันว่าทุกสินค้าหรือทุกช่วงเวลาครบ

## กู้ข้อมูลและสำรอง (Backup & Restore Verification)

หยุดงานที่เขียน DuckDB ก่อนสำรอง `data/local/tadih.duckdb`, raw snapshot ทั้งหมด, manifest และ export metadata ไปพื้นที่องค์กรที่อนุมัติ ไม่ใช้ Git เก็บ raw หรือ DuckDB

ระบบมีสคริปต์ตรวจสอบการสำรองและกู้คืนคลังข้อมูลอัตโนมัติ (Deterministic Warehouse Backup & Read-Only Restore Verification):

```powershell
.\.venv\Scripts\python.exe scripts/verify_backup_restore.py
.\.venv\Scripts\python.exe -m unittest tests/test_backup_restore.py -q
```

สคริปต์จะดำเนินการ:
1. **คัดลอกสำรอง DuckDB พร้อมตรวจ SHA-256:** บันทึกสำเนาแบบ Snapshot ไว้ที่ `data/local/backups/tadih_<timestamp>_<sha>.duckdb` และเทียบ hash กับไฟล์ต้นฉบับ
2. **จำลองการกู้คืนและเปิดแบบ Read-Only:** ตรวจสอบความถูกต้องของ 24 ตารางในคลังข้อมูล (dim_province, dim_source, observations, latest_observations, fact_spatial_evidence, fact_natural_water_reservoir, fact_spatial_policy_match ฯลฯ) ยืนยันจำนวนแถวตรงกับฐานต้นฉบับ 100% (141,699 latest observations)
3. **ตรวจสอบความสมบูรณ์ของ Export Snapshots ทุกชุด (Private และ Public):** ตรวจสอบไฟล์ `.csv`, `.parquet`, `.json` ทั้งหมด 17 ชุด snapshots โดยคำนวณและเทียบ SHA-256 กับ `manifest.json` เพื่อยืนยันว่าไม่มีไฟล์ใดสูญหายหรือถูกดัดแปลง
4. บันทึกผลการตรวจสอบอย่างละเอียดลงใน `data/local/probes/backup-restore-audit.json`

## GitHub Actions

`ci.yml` รัน tests และสร้าง export ว่างที่อธิบายสถานะจริงบน push/PR ไม่มี network ingest ส่วน `discover-sources.yml` ทดลอง catalog รายสัปดาห์ เวลา cron เป็น UTC อาจล่าช้าหรือข้ามรอบได้ ขั้นตอนล้มเหลวทำให้ workflow ล้มเหลว ดู Actions logs และรับผิดชอบ retry โดยผู้ดูแล repository

ทั้งสอง workflow ใช้ `contents: read` ไม่มี secrets และไม่มีขั้นตอน push กลับ repository ไม่มีบริการส่งข้อความ/อีเมลจากโค้ดนี้ Artifact เก็บ 14 วันเพื่อใช้ตรวจงาน ไม่ใช่คลังข้อมูลถาวร ข้อมูลภายในและข้อมูลที่สิทธิ์ยัง pending ไม่อยู่ใน public CI exports

หลังสร้าง remote และ push โดยเจ้าของงาน ให้ตรวจ Actions เปิดใช้งาน ดูผลรันจริง และกำหนดพื้นที่สำรองก่อนเพิ่ม scheduled ingest การขยายเก็บย้อนหลังต้องกำหนดงบ request/พื้นที่เก็บ และใช้ partition ปี × จุด/พื้นที่ ไม่ยิงทุกจังหวัดทุกปีพร้อมกัน

## เมื่อระบบหยุด

HTTP 401/403: หยุดและตรวจสิทธิ์/endpoint ไม่วน retry ขออนุญาตแบบไม่มีขอบเขต HTTP 429/5xx: retry แบบจำกัดและเก็บ raw เดิมไว้ ตรวจ pagination เมื่อเรียกซ้ำ TLS error: แก้ trust chain หรือใช้ trusted transport ที่ตรวจใบรับรองตามปกติ ห้ามใช้ insecure context

Schema/หน่วยเปลี่ยน: หยุดนำเข้าเก็บตัวอย่าง raw ตรวจ contract และเพิ่ม regression test ก่อนเปิดใหม่ แถวที่ไม่มีวันเผยแพร่ไม่เข้าสู่ backtest ที่ต้องใช้ as-of

กฎความเสี่ยงเป็นเกณฑ์ทดลอง เจ้าหน้าที่ต้องตรวจ evidence และติดตามผลจริงก่อนตัดสินใจ งบประมาณ/ประกาศภัย/การจ่ายช่วยเหลือไม่ถูกดำเนินการอัตโนมัติ

## Monthly price pipeline

`python -m tadih price-pipeline --year-th 2569` runs inventory/checkpoint verification, bounded product history capture, normalization/quarantine, per-product warehouse ingestion, then internal/public exports and checksum verification. `--refresh` explicitly re-fetches revised inventory and histories; without it verified checkpoints resume, but missing checkpoints still trigger network requests. Inventory and each history have a maximum 10-page budget. This is the first complete source cycle, not a scheduler for all providers.

Each run records immutable inventory/product artifact paths and checksums, database path, committed products, added revisions and verified export paths in `data/local/runs/<run>/report.json`. Failure marks the run failed and stops subsequent steps. Transactions are per product: earlier successful product imports persist if a later product fails; inspect the report, repair the source and rerun idempotently. No success is recorded until both exports verify. Pending data remain excluded by the public audience filter.

Live resume cycles on 22 October 2026 imported 7,658 validated rows with zero added revisions, all 44 histories reused; public exports remained empty. Evidence: `data/local/probes/price-pipeline-first.json`, `price-pipeline-second.json`, and `price-pipeline-lineage.json`. Automatic daily scheduling and 14-day reliability acceptance remain pending.

Additional local staging commands: `python -m tadih ldd-rice-zoning` (unit/year/province mapping unresolved), `python -m tadih doae-perennial` (annual grain with quarantine/duplicate flags). Neither command imports pending staging into the warehouse.
## แฟ้มตรวจหลักฐานพืชรายพื้นที่ในเครื่อง

ดู [บัญชีข้อมูลปัจจุบัน](current-data-inventory.md) ก่อนเลือกกรณี ใช้พืชอายุสั้น staging revision เดียวที่ตรวจ SHA จาก inventory แล้ว พร้อม `production/admin_crosswalk.csv` ไม่เรียกเครือข่ายหรือเขียนฐานข้อมูล

```powershell
.\.venv\Scripts\python.exe -X utf8 scripts/audit_crop_evidence.py --province 73 --year 2023 --crop "ข้าวนาปี"
.\.venv\Scripts\python.exe -X utf8 scripts/audit_crop_evidence.py --province 73 --year 2023 --crop "ข้าวนาปี" --variety "ข้าวปทุมธานี 1"
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_crop_evidence tests.test_local_data tests.test_production tests.test_catalog -q
```

`--year` คือฉลากปีต้นทางแปลงเป็น ค.ศ. รองรับ 2023/2024 ของ resource นี้ ไม่รับรองว่าหมายถึงปีปฏิทินหรือปีเพาะปลูก ชื่อพืช/พันธุ์ต้องตรงต้นทางรวมช่องว่าง รายงานชื่อ `crop-evidence-<digest>.json` อยู่เฉพาะ `data/local/probes/` รันกรณีเดิมได้ digest เดิม ไม่คัด raw ซ้ำ ไม่มี output path สำหรับเผยแพร่

แฟ้มมี source record number/hash, grain, candidate area codes/version, จำนวนแถว และ missing counts ของแต่ละ metric ไม่คัดค่าตัวชี้วัด ไม่แทน null ด้วยศูนย์ ปฏิเสธ reference name tuple ซ้ำและรหัสผิดจังหวัด ไม่รับรองเขตย้อนหลัง จำกัด 5,000 references ต่อกรณี หากเกินให้เลือกพันธุ์แยกก่อน ผล match snapshot ไม่เปิด annual rollup, historical boundaries, numerical production–price join หรือ public release สิทธิ์ยัง pending ห้ามนำรายงานนี้ไปใส่ public artifacts
