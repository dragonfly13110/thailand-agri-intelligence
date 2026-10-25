# ACFS CKAN catalog audit

ตรวจเฉพาะ metadata จาก API ทางการวันที่ 25 ตุลาคม 2569 เวลา 01:58 น. ICT ไม่ดาวน์โหลด resource หรือตัวเลข

- Catalog: [ACFS Data Catalog](https://catalog-acfs.data.go.th)
- Search API: `https://catalog-acfs.data.go.th/api/3/action/package_search`
- Package API: `https://catalog-acfs.data.go.th/api/3/action/package_show?id=<package-id>`

## ผลตรวจ pagination

เรียก `package_search?rows=10&start={0,10,20}&sort=id+asc` ครบทั้ง 3 หน้า โดยตั้ง timeout 15 วินาที

| `start` | HTTP | CKAN `success` | `count` | รายการ | ขนาด response |
|---:|---:|---:|---:|---:|---:|
| 0 | 200 | true | 26 | 10 | 175,115 bytes |
| 10 | 200 | true | 26 | 10 | 159,597 bytes |
| 20 | 200 | true | 26 | 6 | 113,488 bytes |

รวม 26 IDs ไม่ซ้ำกัน และจำนวนที่ได้ตรงกับ `count`. เรียก `package_show` ของรายการแรก (`0e7b12d8-f5dd-4f81-ab07-7535f536da71`) ได้ HTTP 200, `success=true`, ID ตรงกับคำขอ และมี resource descriptor 1 รายการ

ตัวอย่าง metadata ที่ตรวจ: “ผลการตรวจสอบการแสดงเครื่องหมายรับรองมาตรฐานสินค้าเกษตรที่เป็นมาตรฐานบังคับ”; `license_id` ระบุ `Open Data Common`. นี่เป็นค่าที่ต้นทางประกาศใน metadata เท่านั้น ไม่ใช่การอนุมัติใช้หรือเผยแพร่ resource; คงสถานะสิทธิ์เป็น `pending` จนกว่าจะทบทวนข้อกำหนดของรายการนั้นโดยตรง

## ขอบเขต

การตรวจนี้ยืนยัน pagination และการอ่าน package metadata ครบ 26 รายการ ณ เวลาตรวจเท่านั้น ไม่ได้ตรวจการดาวน์โหลด resource, semantics/หน่วย/grain, วันที่ข้อมูล, ความเป็นส่วนบุคคล, สิทธิ์เผยแพร่ราย resource หรือ error/429/5xx. ขนาดหน้าสูงสุดและความครบถ้วนในรอบต่อไปยังไม่ยืนยัน; อย่าตีจำนวน packages เป็น coverage หรือตัวเลขที่พร้อมเผยแพร่

คำขอตรวจซ้ำ:

```text
https://catalog-acfs.data.go.th/api/3/action/package_search?rows=10&start=0&sort=id+asc
https://catalog-acfs.data.go.th/api/3/action/package_search?rows=10&start=10&sort=id+asc
https://catalog-acfs.data.go.th/api/3/action/package_search?rows=10&start=20&sort=id+asc
https://catalog-acfs.data.go.th/api/3/action/package_show?id=0e7b12d8-f5dd-4f81-ab07-7535f536da71
```
