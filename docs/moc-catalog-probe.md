# MOC product inventory API: bounded probe

ตรวจวันที่ 25 ตุลาคม 2569. งานนี้เรียกเฉพาะ inventory `GET /gis-products`; ไม่เรียก endpoint ราคาและไม่บันทึก response payload.

## ผล

- เอกสาร [MOC Open Data: ข้อมูลสินค้าเกษตร](https://data.moc.go.th/OpenData/GISProducts) ระบุ query `keyword` และ `sell_type` และ fields `product_id`, `product_name`, `category_name`, `sell_type` ใน response แบบ array. เอกสารไม่ได้ระบุ pagination.
- Probe `GET https://dataapi.moc.go.th/gis-products?keyword=rice&sell_type=retail` ด้วย `curl.exe --max-time 8 --max-filesize 200000` จบด้วย timeout หลัง 8.008 วินาที, HTTP 000, 0 bytes.
- ก่อนหน้านี้ในวันที่เดียวกัน probe แบบคำค้นภาษาไทยด้วย timeout 12 วินาทีก็หมดเวลาก่อนรับข้อมูล; ไม่มี schema หรือจำนวนรายการที่ยืนยันจาก live response.

## ข้อสรุป

ยังไม่เพิ่ม CLI หรือ connector เพราะ endpoint ไม่ตอบใน bounded probe และไม่มี inventory ที่ตรวจ schema ได้จริง. คง MOC `runtime_verified=false`, `auth_status=needs_preflight_check`, และ resource rights `pending`; timeout เป็น unavailable ไม่ใช่รายการว่าง. ลองใหม่เมื่อ host ตอบหรือเจ้าของ API ยืนยันช่องทาง/เงื่อนไขเข้าถึง.
