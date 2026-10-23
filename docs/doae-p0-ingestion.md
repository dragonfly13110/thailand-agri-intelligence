# ดึง DOAE P0 และเก็บ source-grain staging

บัญชีที่ตรวจจริงวันที่ 23 ต.ค. 2569 อยู่ใน `config/doae_p0_resources.json`: 21 CSV, 10 datasets, 9 schemas จาก CKAN DOAE ไม่รวม RDF ที่เป็น linked metadata หรือฐานข้อมูลรายบุคคล

| Dataset | CSV | Schema |
|---|---:|---|
| plan_dryplant | 10 | รายตำบลปี 2561–2569 และไฟล์สรุปปี 2568 แยกกัน |
| production-rt01-04 | 3 | พืช รต.01-02, แมลง รต.03, นาเกลือ รต.04 แยกกัน |
| water-shortage-risk-area | 1 | พื้นที่เฝ้าระวังตามรอบต้นทาง |
| disaster_inthearea / disaster_outsidethearea | 2 | ชื่อพื้นที่และช่องผลกระทบตามต้นทาง |
| rainy-season-crop-plan | 1 | แผนเพาะปลูกตามปี/ประเภทชลประทาน |
| rainy-season-crop-result / dry-season-crop-result | 2 | metric key/label/kind รายจังหวัด |
| rainy-season-crop-summary-moa / dry-season-crop-summary-moa | 2 | report snapshot รายจังหวัด/zone |

## รัน

```powershell
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-p0
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-p0 --dataset production-rt01-04
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-p0 --dataset plan_dryplant --refresh
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py
```

`--dataset` ระบุซ้ำได้เฉพาะชื่อในบัญชีที่ตรวจแล้ว ค่าเริ่มต้นดึงครบ 21 resources จำกัด GET หนึ่งครั้งต่อ resource ไม่เกิน 90 MiB/ไฟล์ (ขนาด inventory ที่ตรวจรวม 585,506,130 bytes) ไม่มี retry ไม่จำกัด การดาวน์โหลดเป็น stream ไม่อ่านไฟล์ใหญ่ทั้งหมดเข้า RAM

`data/local/doae-p0/raw/<resource-id>/` เก็บ CSV ตาม SHA-256 กับ manifest ที่เลื่อนหลังตรวจขนาดและ header สำเร็จเท่านั้น `--refresh` เก็บ bytes รุ่นเดิม รันปกติจะตรวจ hash/ขนาด/schema ก่อนข้าม network หาก checkpoint เสียจะหยุด resource นั้นและบันทึก failure การย้ายไฟล์หรือแก้ schema ต้องมีการตรวจใหม่

ผลแต่ละ resource อยู่ใน `data/local/doae-p0/p0-run.json` ระหว่างทำงานระบุ `running`; เมื่อจบเป็น `success` หรือ `partial` หาก resource ใดล้มเหลว CLI คืน exit 1 สำหรับ partial และทำ resources อื่นต่อได้ รันซ้ำจะใช้ checkpoint ที่สำเร็จ ห้ามตีความไฟล์รายงานว่า process ยังมีชีวิตอยู่ ต้องตรวจ process/session handle จริง

## ความหมาย staging

เก็บผลใน `data/local/doae-p0/staged/<resource-id>/<raw-sha>-<schema-sha>/` พร้อม inventory และ output hashes:

- `source_fields` คงทุกคอลัมน์ต้นทางเป็นข้อความ รหัสไม่เสียศูนย์นำหน้า Missing tokens เปลี่ยนเป็น null และ raw CSV เก็บค่าเดิมทุก byte
- `numeric_values` แปลงเฉพาะคอลัมน์ที่ตรวจและระบุไว้ใน schema เก็บศูนย์จริงและ null แยกกัน ตัวเลขติดลบ/ไม่ finite/รูปแบบผิดเข้า quarantine พร้อม raw/เลขแถว/เหตุผล
- source record ทุกแถวคงลำดับและ resource/hash เดิม ไม่ทิ้งแถวซ้ำ Inventory นับ `duplicate_identities` โดยเว้น numeric fields และ timestamps จาก identity; ไม่ตัดสิน latest revision จาก updated_at/approved_at/reported_at
- header ที่เปลี่ยนหรือซ้ำหยุด capture; จำนวนคอลัมน์ผิดกักแถวนั้น Header-only CSV รับเป็นหลักฐาน source 0 แถว ไม่สร้าง observation ศูนย์
- ปี ช่วงเวลา กลุ่มพืช หน่วยนับแมลง ระดับสีเกลือ report zone และ subtotal คงตาม source fields ไม่รวมข้ามกัน ไม่แปลงเป็นปฏิทินใหม่หรือ actual/plan โดยยังไม่ยืนยัน grain
- `resource_year_mismatch_rows` แจ้งเมื่อปีในแถวไม่ตรงชื่อ resource โดยไม่เขียนทับปีใดปีหนึ่ง
- ทุกแถว `pending`, `release_at=null`, `rollup_eligible=false` ไม่มี warehouse import หรือ public export; ตัวเลขใน staging ยังไม่รับรองหน่วย/พื้นที่/semantic correctness จนตรวจเอกสารของ resource นั้น

ไฟล์สรุปประเทศ/ภาค/จังหวัดปี 2568 ไม่รวมกับข้อมูลรายตำบล แม้มีชื่อ dataset เดียวกัน ข้อมูลผลกระทบภัยที่ไม่มีปี/หน่วยจะคงช่องเดิมโดยไม่มีการเดาปีหรือแปลงเป็นพื้นที่เสียหาย

ทะเบียนสิทธิ์ `config/resource_licenses.json` มี exact resource ของ CSV P0 ทุกไฟล์ในสถานะ pending โดยเก็บ dataset metadata snapshot/hash และ URL ที่ตรวจ header แล้ว Metadata หลักฐานอยู่ใน `data/local/probes/doae-p0-inventory.json` และ `data/local/raw/doae/catalog-*/`

## การตรวจและงานต่อ

ผล capture/staging รอบจริง 23 ต.ค. 2569: **21/21 resources, 585,506,130 bytes, 1,943,298 source rows = 1,943,296 staged + 2 quarantined** รันซ้ำครบทุก resource ได้ `skipped_verified` โดยไม่ดึง network เพิ่ม

| ชุด | Source rows | Quarantine | Repeated identities |
|---|---:|---:|---:|
| แผนฤดูแล้ง 10 ไฟล์ (รวมไฟล์สรุปแยก) | 1,857,553 | 0 | 0 |
| รต.01-02 พืช | 1 | 1 | 0 |
| รต.03 แมลง | 78,762 | 0 | 48 |
| รต.04 นาเกลือ | 450 | 1 | 96 |
| เฝ้าระวังขาดแคลนน้ำ | 72 | 0 | 0 |
| ภัยใน/นอกเขตชลประทาน | 2,883 / 2,884 | 0 | 0 |
| แผนฤดูฝน | 477 | 0 | 0 |
| ผลฤดูฝน/แล้ง | 3 / 10 | 0 | 0 |
| report snapshot ฤดูฝน/แล้ง | 102 / 101 | 0 | 0 |

รต.01-02 ต้นทางมีเพียงแถว `(mock)` ทุกช่อง จึง **ยังไม่มีข้อมูลพืชจริงจาก endpoint นี้** แถวนาเกลือลำดับ 37 มี `area_start_rai=-384.0` คง raw และ quarantine ไม่เปลี่ยนเป็นศูนย์ แถวซ้ำแมลง/เกลือเก็บทั้งหมด ยังต้องตรวจว่าเป็น revisions หรือ identity ที่ขาด field ส่วน `reported_at` ของ snapshot เป็นส่วนหนึ่งของ identity จึงไม่ปนรายงานคนละวันเข้าด้วยกัน

Unit/regression รวม 172 tests ผ่าน (19.820s) และ pip check ผ่าน หลักฐาน `data/local/probes/doae-p0-tests.log` ผลเริ่มรันและ resume อยู่ `doae-p0-cli.json` / `doae-p0-resume-cli.json` ในโฟลเดอร์ probes

`scripts/verify_doae_p0.py` ตรวจ hash raw/outputs, เทียบ source fields และ numeric values กับ CSV ทุกแถว และพิสูจน์ว่าแต่ละ source row อยู่ใน records หรือ quarantine เพียงแห่งเดียว ผลอยู่ใน `data/local/probes/doae-p0-verification.json` การรันบน subset จะแจ้ง `all_p0_resources_verified=false` จึงไม่รับรองว่าครบ P0

ทดสอบ capture/staging/resume/revisions/corruption/schema/partial failure และตัว verifier ด้วย `tests/test_doae.py` ตัวดึงปี 2569 เดิมใช้ downloader ตัวเดียวกัน แต่ยังคงคำสั่ง/ที่เก็บ/limit 2 MiB เดิม

หลังดึงครบ ต้องตรวจข้อมูลและนิยามราย schema, DOPA temporal crosswalk, หน่วย, ขอบเขตปี/รอบ, coverage และสิทธิ์ก่อนเชื่อม Risk Signal/Power Query หรือคำนวณอัตราส่วน งาน P1 และ P2 ใน roadmap ยังเป็นรายการถัดไป ไม่ถือว่าจบแผน DOAE ทั้งหมดจากการดึง P0
