# กรณีนำร่องข้าวนครปฐม

เป้าหมายคือให้เจ้าหน้าที่เห็นหลักฐานการผลิต บริบทราคาประเทศ และฝนจากจุดกริดในหน้าเดียว โดยตรวจย้อนกลับได้ ใช้ข้อมูลจริงในเครื่องผ่าน workstation session เดิม ไม่สร้างค่าจำลอง ไม่แจกข้อมูลประเทศ/จุดลงจังหวัด และไม่เผยแพร่ตัวเลขที่สิทธิ์ยัง pending

## ขอบเขตข้อมูลและการเชื่อม

- DOAE: พืช `ข้าวนาปี` จังหวัดตามชื่อ `นครปฐม` รหัสอ้างอิง 73 ฉลากปี 2023 หรือ 2024 รักษาปี/เดือน/ตำบล/พืช/พันธุ์/รอบปลูก ตรวจ SHA staging, row count และ cardinality ของชื่อพื้นที่สามระดับกับ snapshot แสดงแถวต้นทางและ missing counts ไม่บวกผลผลิตหรือรับรองปีปฏิทิน/ปีเพาะปลูก
- OAE/NABC: ผู้ใช้เลือกสินค้า/คุณภาพข้าวเองจากราคาแห่งชาติ 3 series หน่วยเดียวกัน แยกสินค้า/เกรด/ตลาด/เดือน/หน่วย/revision ไม่ใช้ค่าเริ่มต้นหอมมะลิแทนสินค้าที่พื้นที่ผลิต ไม่เชื่อมพันธุ์ DOAE กับความชื้นของ OAE อัตโนมัติ
- ERA5: ข้อมูลฝนรายวัน ณ จุดตัวอย่างที่โครงการขอ ใช้ actual provider grid จาก raw checkpoint ที่ตรวจ checksum แล้ว แสดงพิกัดที่ขอและที่ได้รับทั้งคู่ รวมเดือนเฉพาะเมื่อทุกวันครบ ไม่มีวันซ้ำ/null/คุณภาพผิดหรือหน่วยผิด กรณีไม่ครบคืนยอดเดือน null ไม่เติมศูนย์ คง source/revision lineage
- ฉลากปีของ DOAE กับปีปฏิทินราคา/ฝนยังไม่ถือว่าตรงรอบการผลิตหรือขาย เป็นการจัดบริบทแยกกัน ไม่ใช่ numerical join และไม่ใช้ระบุสาเหตุ
- RID ในเครื่องไม่มีช่วงเวลาตรงปี 2023/2024 จึงไม่ใช้สถานการณ์อ่างปี 2026 แทนน้ำที่ใช้ปลูกในปีเก่า ฝนไม่ใช่ปริมาณน้ำชลประทานหรือหลักฐานน้ำเพียงพอ

## ช่องทางและเกณฑ์ตรวจ

หน้า `/areas/73/rice` รับเฉพาะฉลากปี 2023/2024, opaque series ID และหน้าตาราง อ่านตัวเลขผ่าน fixed view `rice_pilot` ใน `/api/local-data` หลัง flag/loopback/origin/session gate เดิมเท่านั้น ใช้ Python/DuckDB แบบ read-only ไม่มี arbitrary SQL/path/URL ตัวเลขไม่เข้า HTML/SSG/props/public snapshot/cache ปิด default/public mode ตามเดิม

เกณฑ์ตรวจรอบนี้: synthetic checks ของ null/zero, พื้นที่/ปี/รหัสสินค้า/หน่วย/วันซ้ำ/ขาดวัน, SHA และ source identity; เทียบแถวผลิตและราคากับ staging/raw เดิม ฝนเทียบ daily raw/checkpoint กับเดือนที่แสดง; ทดสอบ browser desktop/mobile/หน้าต่างผู้ใช้, session/URL/reload/pagination/empty/error/public gate; ตรวจ artifact และบันทึกข้อจำกัดตามจริง

annual production rollup, historical boundary verification, numerical production–price join, public release, plan/actual comparison และ causal weather claims ยังไม่อนุมัติจนมีหลักฐานครบ การสร้างหน้านำร่องไม่ปิดเกณฑ์ W3/W4 ทั้งหมดโดยอัตโนมัติ

## ผลที่ตรวจแล้วในเครื่อง 24 ต.ค. 2569

- `tadih.crop_evidence` เป็น helper กลางที่ CLI และ pilot ใช้ร่วมกัน ตรวจ SHA/count/ชื่อพื้นที่สามระดับและลำดับรหัสเหมือนกัน API ไม่ส่ง paths หรือ row-reference index ทั้งไฟล์ แต่ส่งเฉพาะ statistical table ที่ allowlist ไว้และหลักฐาน checksum
- ตัวกรองปี 2023 พบแถวข้าวนาปีนครปฐม 97 แถว ผลผลิตมีค่า 96/ไม่ทราบ 1 จับคู่ชื่อกับ snapshot 97 แถว ปี 2024 ไม่มีแถวตรงกรณีในชุดนี้ แสดง empty จริง ไม่ยืนยันว่าไม่มีการผลิต และไม่แทนด้วยศูนย์
- ราคาต้องเลือกเองจากข้าว 3 series ไม่เลือกหอมมะลิหรือผูกพันธุ์/เกรดให้เอง ราคาและฝนใช้ปีปฏิทิน ส่วน DOAE ยังเป็นฉลากต้นทาง กราฟไม่ใช้แกนหรือสูตรรวมข้ามแหล่ง
- ฝนมี 365 วันในปี 2023 และ 366 วันในปี 2024 ตรวจทุก observation/revision กับ raw normalization และเทียบ 24 ยอดเดือนด้วย Decimal จาก raw โดยวิธีอิสระตรงกัน ที่ขอ 13.8,100.25 ต่างจาก provider grid 13.75,100.25 ต้องแสดงทั้งคู่ พิกัดในขอบเขต snapshot ไม่ใช่หลักฐานความเป็นตัวแทนจังหวัด
- `source_sha256` ของ ERA5 ใช้ `canonical_json_utf8` ตาม manifest ไม่ใช่ SHA ของ bytes ที่จัด indent ในไฟล์ ส่วน staging JSONL ใช้ SHA ของ bytes จริง
- Source rights คง pending ไม่มี raw เพิ่ม ไม่มี numeric public export/HTML/SSG/props/cache ไม่มี deployment หรือระบบผู้ใช้หลายคน

หลักฐาน private อยู่ใน `data/local/probes/`: `rice-pilot-water-review-2026-10-24.json`, `rice-pilot-rainfall-check-2026-10-24.json`, `rice-pilot-contract-review-2026-10-24.json` และ `web-rice-pilot-v1/browser-check.json` ตัวเลข observation อยู่ในหลักฐานภายในเท่านั้น

คำสั่งตรวจหลักจาก repository root หลังเปิด local server 3123 และ normal-mode server 3124:

```powershell
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_crop_evidence tests.test_rice_pilot tests.test_rainfall_context tests.test_local_data tests.test_price_trend tests.test_web_catalog tests.test_catalog -q
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_plan_reconciliation -q
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/drago/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/check_rice_pilot_web.mjs
```

## โครงการและแผนเทียบผลยังต้องแยกจากกรณีนี้

ทะเบียนที่ตรวจยืนยันระดับโครงการยัง 0 รายการ พบ [ประกาศกรมส่งเสริมการเกษตร 4 เม.ย. 2566](https://doaenews.doae.go.th/archives/17775) ที่ระบุนครปฐมเป็นจังหวัดเป้าหมายของกิจกรรมพืชใช้น้ำน้อยทดแทนนาปรังในปีงบประมาณ 2566/2567 แต่ยังไม่ยืนยันการจัดสรรเป้าหมาย งบ หรือผลของนครปฐม/พุทธมณฑล และเป็นคนละฤดูกับข้าวนาปีใน pilot จึงเก็บเป็น candidate ไม่จัดจังหวัดเป็นมีมาตรการครอบคลุมแล้ว ดู [ทะเบียนโครงการ](project-register.md)

แก้ `tadih.plan_reconciliation` ให้จับคู่เฉพาะ native rows ที่มี comparison context/พื้นที่และ parent hierarchy/พืช/ปี/ฤดู/ช่วง/รอบ/ตัวชี้วัด/หน่วย/lineage ยืนยันชัดเจน ไม่รวมพืชต่างชนิด ไม่บวกแถว ไม่ตี null เป็นศูนย์ และไม่ใช้ปีแบบ substring Current audit v3 เลือกแผนปี 2569 จาก schema/resource/year ที่ตรงพร้อม SHA: ฤดูฝน 477/3 แถว และฤดูแล้ง 599/10 แถว พื้นที่ไม่ทับซ้อนทั้งสองคู่ คง INCOMPARABLE ไม่มี achievement ratio และไม่ใช้แทนกรณีนครปฐมฉลากปี 2566

แก้ diagnostic rows ในคลังเฉพาะ 2 แถวให้ตรง audit v3 จากสถานะ null เป็น INCOMPARABLE แล้ว เก็บก่อนแก้ `data/local/probes/plan-actual-warehouse-before-174c6391818c.json` และผลตรวจ `plan-actual-warehouse-correction-2026-10-24.json` Counts observations/projects/project coverage คงเดิม ไม่รัน sync แหล่งอื่นหรือแก้ numeric observations รายงานตรวจโครงการก่อนหน้านี้เป็น snapshot ก่อน correction ไม่ใช่สถานะคลังล่าสุด
