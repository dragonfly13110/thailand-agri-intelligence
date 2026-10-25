# CAD CKAN API ตรวจสอบ

ตรวจ metadata จาก API ทางการของกรมตรวจบัญชีสหกรณ์เมื่อ 25 ตุลาคม 2569 เวลา 01:57 น. ICT ไม่ดาวน์โหลด resource file หรือค่าตัวเลข

## ผลตรวจ

- Catalog: [cadckan.cad.go.th](https://cadckan.cad.go.th)
- ค้นรายการด้วย `GET /api/3/action/package_search?rows=10&start={0,10,20,30,40}&sort=id+asc` ครบ 5 หน้า; ทุกคำขอตอบ HTTP 200 และ `success=true`
- API รายงาน 49 packages ทุกหน้า; ได้ 10, 10, 10, 10 และ 9 รายการตามลำดับ รวม 49 ID ไม่ซ้ำกัน
- ขนาด response อยู่ที่ 72,899–94,098 bytes; เวลาตอบ 388–2,008 ms
- เรียก [package_show ตัวอย่าง](https://cadckan.cad.go.th/api/3/action/package_show?id=031974ed-044d-4325-941d-3179c98d3670) ได้ HTTP 200; ID ที่คืนมาตรงกับคำขอ, มี resource metadata 1 รายการ และ `license_id` เป็น `อื่นๆ`

ตัวอย่าง shape ที่ตรวจ: `success`, `result.count`, `result.results[].id`; `package_show` คืน `result.id`, `result.resources[]` และ `result.license_id` รายงานนี้ไม่บันทึกชื่อผู้ติดต่อหรือ metadata ที่อาจมีข้อมูลส่วนบุคคล

## ขอบเขตและข้อจำกัด

- การตรวจยืนยันว่า CKAN API ตอบและแบ่งหน้าได้ครบ 49 รายการ ณ เวลาที่ตรวจเท่านั้น; การเปลี่ยน catalog ระหว่างเรียกหลายหน้าอาจทำให้ผลต่างจาก snapshot เดียว
- `license_id=อื่นๆ` ยังไม่ระบุเงื่อนไขใช้ซ้ำหรือเผยแพร่; resource ทั้งหมดคงสถานะ `pending`
- ยังไม่ได้ตรวจไฟล์ resource, นิยามบัญชี/ต้นทุน, หน่วย, geography, ช่วงข้อมูล, revision, วันเผยแพร่ หรือความครอบคลุมตัวเลข
- จำนวน packages เป็น metadata discovery ไม่ใช่จำนวนชุดตัวเลขที่พร้อมใช้หรือครอบคลุมพื้นที่
- `config/sources.json` ยังคง `runtime_verified=false`; การตรวจนี้ไม่ได้ทดสอบ Hub sync, D1 write, หรือการแสดงผลในเว็บ

คำขอที่ทำซ้ำได้: ตั้ง `rows=10`, ไล่ `start=0,10,20,30,40` ตาม endpoint ข้างต้น แล้วเรียก `package_show?id=031974ed-044d-4325-941d-3179c98d3670`; ไม่ต้องเรียก resource URL
