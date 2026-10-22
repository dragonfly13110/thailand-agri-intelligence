# รายการสินค้าจากต้นทาง

`tadih commodities` เก็บทุก item ที่ API ส่งกลับ ภายใต้ page budget ไม่มีการตัดให้เหลือ 3 หรือ 20 สินค้า เก็บชื่อ หน่วย กลุ่มสินค้า ชนิด/พันธุ์/เกรดตามต้นทางเมื่อมี ช่องที่ต้นทางไม่ให้คง null ไม่แยกพันธุ์ด้วยการเดาจากชื่อ

แต่ละ inventory ใช้ source-scoped identity จากรหัสสินค้าและนิยาม หรือ hash ของชื่อ/นิยามเมื่อไม่มีรหัสจริง Hash ไม่ใช่รหัสทางการ และไม่ยืนยันว่าเป็นสินค้าชนิดเดียวกับ DOAE/MOC รายการที่ยังไม่ทำ crosswalk ใช้ `mapping_status=unmapped`

```powershell
./.venv/Scripts/python.exe -m tadih commodities --source nabc_monthly --year-th 2569 --max-pages 10
./.venv/Scripts/python.exe -m tadih commodities --source nabc_daily
```

NABC endpoints ตรวจจาก [frontend ทางการ](https://agriapi.nabc.go.th/) และ JavaScript ของผู้ให้บริการ พบ product names รายวัน 41 ชื่อ, รายสัปดาห์ 44 ชื่อ และรายเดือนปี 2569 จำนวน 44 ชื่อ Endpoints รายเดือน/สัปดาห์ต้องระบุ year_th รายการแบบไม่มี pagination ไม่มี total ให้ตรวจความครบ จึงคืน `complete=null`

การทดสอบ NABC monthly แบบแบ่งหน้า ปี 2569 ดึงได้ 387 price records ใน 4 pages และสินค้า 44 identities พร้อม `complete=true` ขอบเขตความครบนี้เฉพาะข้อมูลที่ API รายปีนี้รายงาน ไม่ได้หมายถึงทุกสินค้าหรือทุกปีของ NABC และยังไม่เอา price records นี้เข้า observed facts โดยไม่มี normalizer/วันเผยแพร่ที่ตรวจแล้ว

ตัวเชื่อม MOC ใช้ [เอกสาร GIS Products ทางการ](https://data.moc.go.th/OpenData/GISProducts) ผล direct probe พบ timeout จึงไม่ยืนยันว่าดึงรายการได้ หาก 401/403 หรือ timeout จะเป็น failure envelope และ CLI exit 1 ไม่ใช่ผลสำเร็จที่ไม่มีสินค้า ไฟล์บันทึก failure ไม่ทับ checkpoint สำเร็จ

ไฟล์ raw และ inventory อยู่ใน data/local/ สิทธิ์ข้อมูลยัง pending จึงไม่เผยแพร่ raw price/master responses ลง GitHub รายการสินค้า DOAE อีก 537 identities อยู่ใน staging ผลผลิต ดู [production.md](production.md)
