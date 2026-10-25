# ตรวจการรับข้อมูล DOAE เทียบ catalog ครบทุกหน้า

ตรวจวันที่ 23 ต.ค. 2569 จาก CKAN `package_search` 3 หน้า (100 + 100 + 1) พบ 201 datasets: `uitest-*` 160, `testdataset` 1, `emptydataset` 1, แหล่ง Database ที่แผนให้ขอสถิติรวม 6 และ datasets ที่มีทรัพยากรเปิดให้ดาวน์โหลดอีก 33

หลักฐาน `data/local/probes/doae-acquisition-audit.json` ตรวจ SHA-256 ของ raw ปัจจุบัน ขนาด/URL เทียบ resource metadata, schema/output hashes และผลเทียบทุกแถวที่อ้างถึงไฟล์ชุดเดียวกันแล้ว ไม่ใช้แค่จำนวนไฟล์หรือสถานะ tests เป็นหลักฐานการดึงครบ

## ผลด้านการรับข้อมูล

| เกณฑ์ | ผลตรวจ |
|---|---|
| CSV ที่ catalog ระบุใน datasets สาธารณะจริง | 58/58 resources ดาวน์โหลดและตรวจ hash แล้ว รวม RAR ที่ต้นทางระบุ format เป็น CSV |
| แหล่งสาธารณะที่มี primary capture | 33/33 datasets |
| Raw resources ที่ตรวจ hash เทียบปัจจุบัน | 60: CSV/RAR 58 + สำนักงาน JSON-LD 1 + GeoJSON จังหวัด 1 |
| CSV ที่ยังไม่ได้ดึง | 0 ตาม snapshot catalog ที่ตรวจ |
| ทะเบียน exact resources | 70 รายการรวมแหล่งเดิม ทุกชุดยัง pending |
| แหล่ง Database | 6 datasets ไม่อ่านข้อมูลรายบุคคลหรือใช้สิทธิ์ระบบภายใน |
| รูปแบบอื่นที่ยังไม่เลือก | 24 resources: PDF 10, RDF 5, KML 2, SHP 2, HTML/ODS/JSON/KMZ/XML อย่างละ 1 ไม่อ้างว่าเท่ากับรูปแบบที่ดึงมา |

CSV เอกสารบริหาร 7 datasets เป็น **ดัชนีอ้างอิงดิบ** ไม่ใช่ observations และยังไม่ใช่เนื้อหา PDF ที่ลิงก์ไปหา ต้นทางมี header ว่างซ้ำ จึงใช้ `csv.reader` แบบ positional เก็บ bytes เดิม ไม่ใช้ DictReader ทับคอลัมน์ทิ้ง CSV ผู้บริหารมีชื่อ/โทรศัพท์ เก็บเฉพาะภายในเหมือนข้อมูลติดต่อวิสาหกิจ ไม่ออก public artifacts

## P2 ที่รับเพิ่ม

- `new-agri-item-request`: 1,534 แถว, quarantine 0, repeated identities 28 เก็บเป็นคำขอสินค้า/พันธุ์และสถานะ ไม่ตีความเป็นการอนุมัติหรือปริมาณผลิต ข้อความอิสระคงเป็นข้อมูลภายในที่ต้องตรวจ privacy ก่อนใช้
- `doae_13_01` ปี 2566/2567: 83,517 / 68,723 source rows พร้อมวันที่และจำนวนสมาชิกตามต้นทาง
- `location_smce` ปี 2566/2567: 83,517 / 68,723 source rows มีที่อยู่/ช่องทางติดต่อ คง private staging พร้อม `privacy_status=internal_only_no_public_records`
- RAR ทั้งหมดเพิ่มจาก 4 เป็น 8 resources: **1,289,200 source = 1,289,027 staged + 173 quarantine** ตรวจคลายซ้ำเป็น digest และเทียบทุกแถวผ่าน ครัวเรือน/สมาชิก/กลุ่มไม่ถูกบวกข้ามทะเบียนหรือปี
- CSV วิสาหกิจสินค้า 2566 ใน RAR และ CSV โดยตรงยังมี inner hash เดียวกัน ระบุ duplicate payload group ไว้ ไม่รวมจำนวนแถวเป็นข้อมูลใหม่ซ้ำ

## หลักฐานในเครื่อง

- `probes/doae-completion-catalog.json` และ raw `completion-catalog-*`: pagination และ metadata snapshot แบบ immutable
- `probes/doae-p2-verification.json`: คำขอสินค้าเทียบทุกแถวผ่าน
- `probes/doae-archives-verification.json`: RAR 8 resources เทียบ outer/inner/staging และทุกแถวผ่าน
- `doae-references/reference-run.json`: raw reference indexes 7 resources และ hashes
- `probes/doae-native-code-profile.json`: โปรไฟล์ native fields ของพืชปี 2567 พบ Province/Amphoe/Tambon components ยาว 2/2/2 หลัก ไม่ใช่ full DOPA district/subdistrict codes ยังไม่ concatenation หรือรับรอง temporal mapping
- `probes/doae-p2-tests.log`: 182 unit/regression tests ผ่าน (22.500s), pip check ผ่าน; ตรวจทะเบียนเพิ่มเติม 6 tests ผ่าน

```powershell
.\.venv\Scripts\python.exe -X utf8 -m tadih doae-p2
.\.venv\Scripts\python.exe -X utf8 scripts/capture_doae_archives.py --stage
.\.venv\Scripts\python.exe -X utf8 scripts/capture_doae_references.py
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py --priority p2
.\.venv\Scripts\python.exe -X utf8 scripts/verify_doae_p0.py --priority archives
.\.venv\Scripts\python.exe -X utf8 scripts/audit_doae_acquisition.py --refresh-catalog
```

Audit คืน exit 1 เมื่อ catalog มี CSV ที่ยังขาดหรือ dataset สาธารณะที่ไม่มี capture; CSV/GIS ที่ดึงได้ไม่เท่ากับตรวจความหมายพร้อมใช้แล้ว การ refresh catalog จำกัด 300 packages หากโตเกินขอบเขตจะไม่รับรอง pagination ครบ

## แผนที่ยังต้องทำต่อ

| ส่วนตาม roadmap | สิ่งที่พิสูจน์แล้ว | งานที่ยังไม่ผ่าน |
|---|---|---|
| P0 แผนฤดูแล้ง/รต.01-04/น้ำ/ฤดูฝน | มี raw/staging ครบ CSV ตาม resource และตรวจทุกแถว | หน่วย/ปี/รอบ, temporal DOPA crosswalk, revisions และ subtotal; รต.01-02 ยังเป็น mock |
| P0 Risk Signal และ actual/plan | มีข้อมูลต้นทางที่แยก grain ไว้ | ยังไม่เชื่อมโมเดลหรือรับรองอัตราส่วน ต้องมีพื้นที่/สินค้า/ช่วงเวลา/หน่วยตรงกันก่อน |
| P1 สำนักงาน/GIS/วิสาหกิจ/มูลค่า | มี selected native sources ครบชุด | ยังไม่เป็นตารางอ้างอิง/ชั้นแผนที่สำหรับเว็บหรือผลวิเคราะห์ที่รับรองแล้ว |
| P2 RAR และคำขอสินค้า | คลายและ stage พร้อม lineage/private flags | ตัวเลขวงเล็บ 173 แถว, คอลัมน์ออนไลน์ 524 แถว และหน่วย native fields ยังต้องยืนยัน |
| P2 ทะเบียนและภัยรายบุคคล | มี metadata และร่าง Data Contract สำหรับสถิติรวม | ยังไม่ได้รับอนุมัติหรือรับข้อมูลจาก doae_11_02/03 และ doae_12_01/02/04/05 ไม่ใช้ข้อมูลบุคคลทดแทน aggregate |
| เผยแพร่ผ่านเว็บ Next.js | คง pending และเก็บ data/local ที่ถูก ignore | ตรวจสิทธิ์/quality/contract/ค่าที่ render และ browser ตาม [แผนเว็บ](../IMPLEMENTATION_PLAN.md) ก่อนเผยแพร่ |

ผลนี้ปิดช่องว่างด้าน CSV acquisition ที่ตรวจพบ ยังไม่ใช่การปิด roadmap ทั้งแผนหรือการอนุมัติเผยแพร่
