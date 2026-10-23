# คู่มือปฏิบัติงาน

## ลำดับการทำงานปัจจุบัน (23 ต.ค. 2569)

ใช้ [เช็กลิสต์ส่งต่องาน](../HANDOFF.md) เป็นสถานะปัจจุบัน และ [เป้าหมายศูนย์ข้อมูลกลาง](national-agriculture-data-center.md) เป็นลำดับงาน: ตรวจ manifest/สิทธิ์และ coverage ของข้อมูลที่มีในเครื่อง, นิยาม grain/หน่วย/เวลาและรหัสเชื่อม, ตรวจตรรกะแผนเทียบผล, แล้วสำรวจทะเบียนโครงการข้ามหน่วยงานก่อนกำหนดชุดเผยแพร่ ระยะนี้ไม่โหลดซ้ำโดยไม่มีช่องว่างข้อมูลที่ระบุชัด

## ขั้นตอน Power BI เมื่อแกนข้อมูลพร้อม

เมื่อข้อมูลและสิทธิ์ผ่านแล้ว ให้ทำโมเดล ความสัมพันธ์ Power Query และ DAX ในเครื่อง ตรวจผลคำนวณและหน้ารายงาน ก่อนนำชุดที่พร้อมขึ้น Power BI Online หลีกเลี่ยงการแก้ผ่าน browser ทีละ visual เป็นวิธีพัฒนาหลัก

ไฟล์ DAX เป็น source code ของมาตรวัด เขียนและจัดการเวอร์ชันในเครื่องได้ แต่ Python tests และการตรวจชื่อคอลัมน์ยังไม่ใช่หลักฐานว่า DAX รันถูก ต้องตรวจใน Power BI Desktop/Tabular engine ก่อนถือว่าพร้อมเผยแพร่ การเขียนโมเดลเป็นไฟล์ PBIP/TMDL ทำในเครื่องได้ตามรูปแบบที่ Microsoft รองรับ ไม่อ้างว่าสร้าง PBIX binary ได้โดยตรงจาก Python

บันทึก 22 ตุลาคม 2569: เคยเริ่ม semantic model Coverage ทดลองบน Online แล้ว แต่ยังไม่ใช่รายงานปลายทาง ไม่เปลี่ยนหรือลบรายการนั้นระหว่างเตรียมงานในเครื่อง

## โครงสร้างและการรัน

ติดตั้งจาก README แล้วใช้ `python -m tadih --help` ไฟล์ฐานข้อมูลเริ่มต้น `data/local/tadih.duckdb` เปลี่ยนได้ด้วย `--db` ก่อนชื่อคำสั่ง เช่น `python -m tadih --db data/local/check.duckdb build`

ขั้นตอนรับข้อมูลเมื่อจำเป็น: ตรวจ inventory/manifest ก่อน → ดึง raw เฉพาะส่วนที่ขาด → เก็บ checksum/checkpoint → แปลงตาม data contract → ตรวจ schema/เวลา/หน่วย/พื้นที่และสิทธิ์ → บันทึก coverage และเหตุผลช่องว่าง → เพิ่ม revision ที่ผ่านเกณฑ์ลง DuckDB → สร้าง immutable export → ตรวจ checksum; การนำเข้าเครื่องมือรายงานเป็นขั้นหลัง

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

## กู้ข้อมูลและสำรอง

หยุดงานที่เขียน DuckDB ก่อนสำรอง `data/local/tadih.duckdb`, raw snapshot ทั้งหมด, manifest และ export metadata ไปพื้นที่องค์กรที่อนุมัติ ทดสอบเปิดสำเนาฐานและ `tadih verify` ที่ snapshot สำเนา ไม่ใช้ Git เก็บ raw จำนวนมาก

ตรวจ `snapshot_complete` ก่อนข้าม partition ย้อนหลัง manifest เก็บเฉพาะความสำเร็จล่าสุดใน partition; ไฟล์ checksum รุ่นเก่ายังคงอยู่ ต้องมีผู้เขียนเพียงงานเดียวต่อ partition งาน refresh ข้อมูลเดิมต้องตรวจ revision ต้นทางอีกครั้ง ไม่ใช้ checkpoint เป็นเหตุผลข้ามข้อมูลแก้ไขตลอดไป

Export แต่ละ run อยู่คนละโฟลเดอร์ ไม่ทับ run เดิม หาก build ล้มเหลวระหว่างทาง จะไม่มี metadata สำเร็จ ห้าม import โฟลเดอร์นั้น ตัวตรวจ hash ตรวจความครบและการเปลี่ยนไฟล์ ไม่ใช่ลายเซ็นยืนยันตัวผู้เผยแพร่

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
