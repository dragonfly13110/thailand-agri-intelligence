# DOAE P1 และ RAR: ผลดึงและ staging วันที่ 23 ตุลาคม 2569

ใช้ schema ที่ตรวจจาก resource จริงใน `config/doae_p1_resources.json` และ `config/doae_archive_resources.json` ทุกชุดยัง `pending`, `release_at=null`, `rollup_eligible=false` ไม่มี warehouse import, Power Query หรือ Online จากรอบนี้

## P1: 19 CSV และ 2 JSON/GIS

ดึง 21 resources จาก 12 datasets รวม **71,240,721 bytes / 202,747 source records = 202,223 staged + 524 quarantined** ตรวจ hash และเทียบ source fields/ตัวเลข/เลขแถวทุก record ผ่าน (`all_p1_resources_verified=true`) รันซ้ำครบชุด `skipped_verified`

| Dataset | จำนวนต้นทาง | ขอบเขต/ข้อค้นพบ |
|---|---:|---|
| smce-province | 312 / 312 / 308 | ปี 2566/2567/2568 ตาม resource; มีระดับพื้นที่/ศักยภาพหลายประเภท ไม่รวม subtotal ซ้ำ |
| smce | 312 / 312 / 308 | เก็บจำนวนและร้อยละต้นทาง ไม่เฉลี่ยร้อยละข้ามพื้นที่ |
| doae_14_02 | 181,835 | สินค้าวิสาหกิจปี 2566 มีชื่อกลุ่ม/รหัสทะเบียน/รายละเอียด เก็บภายในเท่านั้น ไม่ออก public artifacts |
| herbs-spices | 55 / 58 / 60 | มูลค่าปี 2566/2567/2568; คง blank column ที่ต้นทางมี ไม่เดาความหมาย |
| econ_insect_doae | 36 | คงสินค้าและปีในแถว ไม่รวมมูลค่าข้ามปีหรือสินค้า |
| province-unified-data | 14,824 | คง crop/insect/salt type, พื้นที่, unit label และ period ตามต้นทาง |
| doae-area-type | 546 | คงปี ประเภทถือครอง ครัวเรือนและพื้นที่ แยก total/owner/rent/other |
| online-product | 533 / 532 / 524 | ปี 2567 เป็น CP874; ปี 2568 ทั้ง 524 แถวมีข้อความหมวดสินค้าภายใต้หัวมูลค่า เข้า quarantine ไม่สลับคอลัมน์เอง |
| doae_15_01 | 78 / 77 | ปี 2566 มี preamble 3 บรรทัดที่ระบุโครงการก่อน header และมีแถวประเทศ ไม่รวมเป็นยอดจังหวัดโดยอัตโนมัติ |
| disaster | 693 | คงจังหวัด/ชนิดภัย/ครัวเรือน/พื้นที่เสียหายตาม resource ไม่รวมครัวเรือนข้ามชนิดภัย |
| doae-office-location | 955 | JSON-LD: สำนักงานอำเภอ 878, จังหวัด 76, พื้นที่ 1; 954 รายการมี lat/long อีก 1 รายการไม่มีพิกัด คง null ไม่เดาตำแหน่ง |
| agricultural-households-disaster-affected-area-province | 77 | GeoJSON 77 features, Polygon/MultiPolygon พร้อมพิกัด 3 ค่า คง geometry และทุก property ตามต้นทาง ยังไม่รับรองรุ่นขอบเขตหรือปีสถิติ |

ค่าว่างกับศูนย์แยกกัน ข้อมูล JSON-LD อ่านเฉพาะ bytes ที่ได้รับ ไม่ resolve context ไปยังเว็บอื่น Geometry ตรวจวงปิด จำนวนตำแหน่ง และช่วง longitude/latitude พร้อมเก็บ altitude ตาม [RFC 7946 ข้อ 3.1.1](https://www.rfc-editor.org/rfc/rfc7946#section-3.1.1) การผ่านโครงสร้างไม่ใช่การรับรองพื้นที่จริงหรือ DOPA temporal mapping

## RAR 4 resources: ดาวน์โหลด คลาย และ staging

CKAN ระบุ format เป็น CSV แต่ bytes จริงเป็น RAR ตรวจ magic และเก็บ raw **10,778,379 bytes** พร้อม SHA-256; คลายเป็น CSV รวม **245,266,945 bytes** ใช้ `tar.exe` (bsdtar 3.8.9) ในเครื่อง ไม่ติดตั้ง dependency เพิ่ม

ตัวคลายยอมรับ archive ที่มี regular CSV เพียงไฟล์เดียว ชื่อเป็น basename ไม่มี path ใช้ `tar -xO` ส่ง bytes ผ่าน stdout ไปยัง temporary file ที่โปรแกรมกำหนด ไม่ใช้ชื่อ path ใน archive เป็นปลายทาง จำกัด 90 MiB ต่อ CSV และเวลา 60 วินาที ตรวจ outer hash ก่อนคลาย และตรวจ inner hash/checkpoint ก่อน resume

| Resource | Source rows | Staged | Quarantine | Repeated identities |
|---|---:|---:|---:|---:|
| วิสาหกิจสินค้า 2566 `9a0342f0-…` | 181,835 | 181,835 | 0 | 81 |
| วิสาหกิจสินค้า 2567 `495726cb-…` | 155,129 | 155,129 | 0 | 60 |
| พืชอายุสั้น 2567 `0719c5ce-…` | 462,777 | 462,604 | 173 | 48 |
| พืชอายุยาว 2567 `a130f9e0-…` | 184,979 | 184,979 | 0 | 1 |
| รวมตาม 4 resources | 984,720 | 984,547 | 173 | 190 |

173 แถวในพืชอายุสั้นมีรูปแบบตัวเลขในวงเล็บ เช่น `(7.00)` และ `(2,922.00)` คง raw/quarantine ไม่ตีความว่าเป็นค่าบวกหรือลบเอง ชื่อคอลัมน์ปี 2567 ต่างจากไฟล์ปี 2566 และหน่วยใน English fields ยังไม่ยืนยัน จึง parse ตัวเลขตาม field เดิมโดยไม่เปลี่ยนหน่วยหรือรวมเข้าฐานหลัก

CSV วิสาหกิจ 2566 ใน RAR มี SHA-256 `df471d88af2d5d49737169a6c09768030c048b2d357f9d4b3cefc8b8760709e1` ตรงกับ resource CSV โดยตรง `c280820d-e70a-4269-b728-4698b086e85f` เป็น bytes ชุดเดียวกัน ห้ามนำจำนวนแถว P1 กับ RAR มาบวกเป็นข้อมูลใหม่ซ้ำ

Verifier คลาย RAR ซ้ำเป็น digest แบบจำกัดขนาด เทียบ outer/inner hashes แล้วเทียบ CSV ทุกแถวกับ records/quarantine ผ่านครบ 4 resources (`all_archives_resources_verified=true`) รันซ้ำทั้ง raw/inner CSV/staging ผ่านจาก checkpoint

## คำสั่งและหลักฐาน

```powershell
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-p1
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py --priority p1
.\.venv\Scripts\python.exe -X utf8 scripts/capture_doae_archives.py --stage
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py --priority archives
```

ชื่อ verifier เดิมคงไว้ให้คำสั่ง P0 ใช้งานต่อได้ ตอนนี้เลือก priority ได้ทั้ง p0/p1/archives ข้อมูลจริงและหลักฐานอยู่ใต้ `data/local/` ทั้งหมด:

- `doae-p1/p1-run.json` และ `doae-archives/archive-run.json`: raw/inner/staging manifests และจำนวนแถว
- `probes/doae-p1-inventory.json`: metadata ของ P1 พร้อม header/format ที่ตรวจจริง
- `probes/doae-p1-verification.json`, `doae-archives-verification.json`: ผลเทียบทุกแถวและ hashes
- `probes/doae-p1-resume-cli.json`, `doae-archive-resume-cli.json`: ผล verified resume
- `probes/doae-p1-archives-tests.log`: 178 tests ผ่าน (22.815s); pip check ผ่าน ตรวจทะเบียนสิทธิ์เพิ่มเติม 6 tests ผ่าน

ทะเบียน exact resources รวม 58 รายการ คง pending ทุกชุด พร้อม metadata/raw hashes และ URL การดาวน์โหลดสำเร็จไม่ได้อนุมัติสิทธิ์เผยแพร่ ชื่อกลุ่ม/รหัสทะเบียน/รายละเอียดในวิสาหกิจต้องผ่าน privacy review ก่อนแชร์

## งานต่อ

ยังต้องตรวจหน่วย/ปี/รอบและคอลัมน์คลาดเคลื่อนกับหลักฐานต้นทาง, แยก revisions/duplicate identities, ทำ temporal area crosswalk, ตรวจ subtotal/coverage และสิทธิ์ก่อนเชื่อม Risk Signal/actual-vs-plan/Power BI ไม่รับรอง model หรือ DAX runtime จากผล staging นี้

P2 มี [ร่าง Data Contract สำหรับสถิติรวม](doae-aggregate-data-contract-draft.md) แล้ว ยังไม่ส่งหรือเชื่อมระบบทะเบียนรายบุคคล การประสานและสิทธิ์ต้องดำเนินการผ่านผู้รับผิดชอบที่ได้รับอนุญาต
