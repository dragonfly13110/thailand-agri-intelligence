# Royal Rain CKAN API ตรวจสอบ

ตรวจ metadata จาก catalog ทางการเมื่อ 25 ตุลาคม 2569 เวลา 02:00 ICT สำหรับ M3 เท่านั้น ไม่ดาวน์โหลด resource files หรือค่าตัวเลข

## Endpoint และผลตรวจ

- Catalog: [กรมฝนหลวงและการบินเกษตร](https://catalog.royalrain.go.th)
- Search: `GET https://catalog.royalrain.go.th/api/3/action/package_search?rows=10&start={0,10,20}&sort=id+asc`
- Detail: `GET https://catalog.royalrain.go.th/api/3/action/package_show?id={package_id}`
- ทั้ง 3 หน้าและ `package_show` ตอบ HTTP 200 พร้อม `success=true`; API รายงาน `count=28`
- ได้รายการ 10, 10 และ 8 package ตามลำดับ รวม 28 ID ไม่ซ้ำใน snapshot นี้

| `start` | รายการ | ขนาด response | เวลาตอบ |
|---:|---:|---:|---:|
| 0 | 10 | 109,739 bytes | 606 ms |
| 10 | 10 | 130,817 bytes | 125 ms |
| 20 | 8 | 75,314 bytes | 103 ms |

ตรวจ `package_show` ของ ID `019e9ba7-7395-44ff-b018-b10c4f220c4c` ได้ ID ตรงกับคำขอและ resource metadata 3 รายการ; `license_id`/`license_title` เป็น `Open Data Common` และไม่มี `license_url`.

## ขอบเขตและข้อค้าง

- ผลนี้ยืนยัน CKAN metadata ทั้ง 28 packages ในรอบตรวจเท่านั้น; catalog อาจเปลี่ยนระหว่างรอบ pagination ถัดไป
- ยังไม่ได้ตรวจไฟล์ resource, นิยาม, หน่วย, พื้นที่/เวลา, revision หรือความครบถ้วนของข้อมูลตัวเลข
- ไม่มี license URL หรือหลักฐานสิทธิ์ราย resource เพิ่มเติม; คงสิทธิ์ทั้งหมดเป็น `pending` และห้ามเปิดตัวเลขใน public API
- `config/sources.json` ไม่ได้แก้ไข; สถานะ `runtime_verified=false` และ `license_status=pending` ยังคงเดิม. ไม่ได้ทดสอบ Hub sync, D1 write, browser UI หรือการเผยแพร่

คำสั่งตรวจซ้ำ: เรียก `package_search` ด้วย `rows=10` ที่ `start=0,10,20`, เทียบ `result.count`/ID และเรียก `package_show` ด้วย ID หนึ่งรายการจากผลค้นหา โดยไม่เรียก URL ของ resource
