# HII CKAN: ตรวจ endpoint และ pagination

ตรวจเมื่อ 25 ตุลาคม 2569 เวลา 01:56 ICT เพื่อยืนยันการค้นพบ metadata สำหรับ M3 เท่านั้น ไม่ดาวน์โหลดไฟล์ resource หรืออ่านค่าตัวเลข

## Endpoint และผลตรวจ

- Catalog ทางการ: [data.hii.or.th](https://data.hii.or.th)
- Search: `GET https://data.hii.or.th/api/3/action/package_search?rows=10&start={0,10,20,30}&sort=id+asc`
- Detail: `GET https://data.hii.or.th/api/3/action/package_show?id=01b43fc8-6d57-4923-8117-2e6b580a0872`
- ทั้ง 4 หน้าและ detail ตอบ HTTP 200 พร้อม `success: true`; `result.count` คงที่ 36
- ได้ผล 10, 10, 10 และ 6 รายการตามลำดับ รวม 36 package ID ไม่ซ้ำใน snapshot นี้

| `start` | รายการ | ขนาด response | เวลาตอบ |
|---:|---:|---:|---:|
| 0 | 10 | 177,054 bytes | 576 ms |
| 10 | 10 | 196,475 bytes | 264 ms |
| 20 | 10 | 170,218 bytes | 246 ms |
| 30 | 6 | 90,227 bytes | 159 ms |

ตรวจ detail ของ ID แรกจากผลค้นพบว่า ID ตรงกัน ชื่อชุดข้อมูล “ระดับน้ำท่วม” มี resource metadata 1 รายการ และระบุ `license_id` เป็น `Creative Commons Attribution Non-Commercial` ผลนี้ยืนยันเฉพาะ metadata ของ package ตัวอย่าง ไม่ได้เปิดดู resource URL หรือค่าข้อมูล

## ขอบเขตและข้อค้าง

- Registry `config/sources.json` ยังระบุ HII เป็น `license_status: pending`, `runtime_verified: false`; การตรวจ catalog รอบนี้ยังไม่เปลี่ยนสถานะ
- ยังไม่ได้ตรวจนิยาม หน่วย พื้นที่จริง ช่วงเวลา revision ความครบถ้วนของข้อมูลตัวเลข หรือรูปแบบและเสถียรภาพของ resource API แยกรายชุด
- License ของ package ตัวอย่างมีข้อจำกัด Non-Commercial; ต้องประเมินเงื่อนไขของโครงการและสิทธิ์ของ resource รายชุดก่อนเปิดตัวเลขสู่ public API
- จำนวน 36 เป็นค่าที่ API รายงาน ณ เวลาตรวจ ไม่ใช่ coverage ของข้อมูลน้ำ/ฝน และไม่ยืนยันว่า resource ทั้งหมดเปิดอ่านหรือเผยแพร่ได้

คำสั่งตรวจ: PowerShell `Invoke-WebRequest` แบบจำกัด 4 หน้า `rows=10` พร้อมเทียบ `count`, package ID และ `package_show` ของหนึ่งรายการ ไม่มีการเรียก database หรือเปลี่ยนไฟล์นอกเอกสารนี้
