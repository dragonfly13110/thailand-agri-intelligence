# OAE CKAN: ตรวจ endpoint และ pagination

ตรวจ API ทางการวันที่ 25 ตุลาคม 2569 เวลา 02:00 ICT เพื่อยืนยันการค้นพบ metadata สำหรับ M3 เท่านั้น ไม่ดาวน์โหลด resource หรืออ่านค่าราคา

## Endpoint และผลตรวจ

- Catalog: [OAE Data Catalog](https://catalog.oae.go.th)
- Search: `GET https://catalog.oae.go.th/api/3/action/package_search?rows=25&start={0,25,...,200}&sort=id+asc`
- ทั้ง 9 หน้าในการตรวจซ้ำตอบ HTTP 200 และ `success=true`; `count=202` คงที่
- ได้ 25 รายการต่อหน้า 8 หน้า และ 2 รายการที่ `start=200`; รวม 202 package IDs ไม่ซ้ำใน traversal ที่เสถียร
- Response ขนาด 20,925–358,251 bytes; เวลาตอบ 103–681 ms
- Traversal แรกในเวลาใกล้กันพบ `count` สลับ 201/202 และมี ID ซ้ำ 1 รายการ; สาเหตุไม่ยืนยัน แต่ traversal ซ้ำได้ count 202 คงที่และไม่มี ID ซ้ำ จึงควรตรวจ `count`/ID ซ้ำทุกครั้งและรายงาน `partial` เมื่อจำนวนไม่ตรง

`package_show?id=monthly_prices_rice` ตอบ HTTP 200 และ `success=true`; คืน package ID `93ac1a96-7933-4653-a21e-91b0c42a8216` และ resource metadata 1 รายการ (`4570daca-e727-4036-bde9-35fd84d0ffd4`, format `JSON`) ซึ่ง URL ชี้ไป NABC monthly price API

## สิทธิ์และข้อจำกัด

- Package `monthly_prices_rice` ระบุ `license_id=อื่นๆ`, `license_id_other=Creative Commons Attributions Non-Commercial`; ไม่มี version หรือ license URL และยังไม่ยืนยันเงื่อนไขการใช้ NABC API จึงคง resource เป็น `pending`
- รายละเอียดสินค้า/หน่วย/grain ที่ตรวจไว้ก่อนหน้าอยู่ใน [numeric-source-candidate-review.md](numeric-source-candidate-review.md); ราคา national-level ไม่ใช่ข้อมูลจังหวัด
- จำนวน 202 เป็น package metadata ไม่ใช่จำนวนชุดตัวเลขที่เผยแพร่ได้หรือ coverage
- การตรวจนี้ยืนยัน CKAN search/show และ pagination ของ metadata เท่านั้น ไม่ได้ยืนยัน API ราคาปลายทาง, schema/ความสดของตัวเลข, การ sync batch เข้า D1 หรือสิทธิ์เผยแพร่

คำสั่งตรวจซ้ำ: ใช้ `rows=25`, ไล่ `start=0,25,...,200`, เปรียบเทียบ `count`, จำนวน ID และ ID ซ้ำ; ตรวจ detail ด้วย `package_show?id=monthly_prices_rice` โดยไม่เรียก resource URL
