# รายการสินค้าจากต้นทาง

`tadih commodities` เก็บทุก item ที่ API ส่งกลับ ภายใต้ page budget ไม่มีการตัดให้เหลือ 3 หรือ 20 สินค้า เก็บชื่อ หน่วย กลุ่มสินค้า ชนิด/พันธุ์/เกรดตามต้นทางเมื่อมี ช่องที่ต้นทางไม่ให้คง null ไม่แยกพันธุ์ด้วยการเดาจากชื่อ

แต่ละ inventory ใช้ source-scoped identity จากรหัสสินค้าและนิยาม หรือ hash ของชื่อ/นิยามเมื่อไม่มีรหัสจริง Hash ไม่ใช่รหัสทางการ และไม่ยืนยันว่าเป็นสินค้าชนิดเดียวกับ DOAE/MOC รายการที่ยังไม่ทำ crosswalk ใช้ `mapping_status=unmapped`

```powershell
./.venv/Scripts/python.exe -m tadih commodities --source nabc_monthly --year-th 2569 --max-pages 10
./.venv/Scripts/python.exe -m tadih commodities --source nabc_daily
```

NABC endpoints ตรวจจาก [frontend ทางการ](https://agriapi.nabc.go.th/) และ JavaScript ของผู้ให้บริการ พบ product names รายวัน 41 ชื่อ, รายสัปดาห์ 44 ชื่อ และรายเดือนปี 2569 จำนวน 44 ชื่อ Endpoints รายเดือน/สัปดาห์ต้องระบุ year_th รายการแบบไม่มี pagination ไม่มี total ให้ตรวจความครบ จึงคืน `complete=null`

การทดสอบ NABC monthly แบบแบ่งหน้า ปี 2569 ดึงได้ 387 raw price records ใน 4 pages และสินค้า 44 identities พร้อม `complete=true` ขอบเขตความครบนี้เฉพาะข้อมูลที่ API รายปีนี้รายงาน ไม่ได้หมายถึงทุกสินค้าหรือทุกปีของ NABC ต้องตรวจ duplicate/conflict ก่อนนำเข้า facts ตามรายละเอียดด้านล่าง

อัปเดต: มี normalizer ใน `prices.py` แล้ว ตรวจ raw checkpoint ก่อนเข้า warehouse ปี 2569 มี 376 monthly identities หลังแยกแถวซ้ำตรงกัน 11 แถว ไม่ถือว่า 387 raw rows เป็น 387 เดือนที่ต่างกัน จากนั้นใช้รายการ 44 สินค้านี้ดึงประวัติแยกรายสินค้าครบตาม pagination ที่ provider รายงาน ได้ raw 7,669 แถว, ราคาไม่ขัดแย้ง 7,657 เดือน, exact duplicates 10 แถว และ conflict 1 เดือน/2 แถว ช่วงรวม ม.ค. 2011 ถึง ก.ย. 2026 ประวัติแต่ละสินค้ามี 40 ถึง 189 เดือน ไม่ใช่การยืนยันว่าทุกสินค้าในอดีตหรือทุกเดือนครบ

ไฟล์หลักฐานคือ `data/local/probes/monthly-price-backfill.json` และ `monthly-price-import.json` raw snapshots แยก partition `monthly-product-<product hash>` ภายใต้ `data/local/raw/oae/` รันซ้ำจะตรวจ hash/identity/pagination/quality ก่อนข้าม ไม่มีการนำเวลา retrieval ไปใช้เป็น release date

หน่วยต้นทาง 5 แบบถูกเก็บอย่างชัดเจน: บาท/ตันหาร 1,000 เป็น `THB/kg`; บาท/กก.เป็น `THB/kg`; บาท/ตัว, บาท/ร้อยฟอง และบาท/ร้อยผลเป็น `THB/head`, `THB/100_eggs`, `THB/100_fruit` ตามลำดับ ไม่เดาน้ำหนักสัตว์ ไข่ หรือผลไม้เพื่อแปลงให้เป็นกิโลกรัม

พบราคาข้าวเปลือกเจ้า ความชื้น 15 เดือนตุลาคม พ.ศ. 2555 สองค่าต่างกันใน capture เดียว โดยไม่มีลำดับเวลาการเผยแพร่ จึงเก็บ raw ทั้งคู่, quarantine เฉพาะเดือนนั้น และสร้าง unknown/null quality revision เพื่อไม่ให้ค่าเก่าปรากฏเป็นค่าปัจจุบันโดยเงียบ ๆ เดือนอื่นทำงานต่อได้ การปลด quarantine ต้องมีหลักฐานแก้ไขจากต้นทางและ quality-resolution revision ใหม่ ไม่เลือกค่าเฉลี่ยหรือค่าหนึ่งจากการเรียงแถว

```powershell
./.venv/Scripts/python.exe -m tadih price-backfill data/local/raw/oae/commodities-nabc_monthly-2569-page1
./.venv/Scripts/python.exe -m tadih nabc-monthly 'data/local/raw/oae/<monthly-product partition>'
```

คำสั่งแรกเก็บ raw/checkpoints ส่วนคำสั่งที่สอง normalize/import partition ที่ผ่าน hash validation ข้อมูลที่ทราบแค่เดือนใช้วันแรกของเดือนเป็น period marker และคง `release_at=null` จึงใช้แสดงประวัติได้ แต่ยังรับรอง as-of backtest ไม่ได้ สิทธิ์ของสินค้าอื่นไม่ได้อนุมานจาก licence ของชุดข้าว รายการทั้งหมดคง pending และอยู่ในเครื่อง

ตัวเชื่อม MOC ใช้ [เอกสาร GIS Products ทางการ](https://data.moc.go.th/OpenData/GISProducts) ผล direct probe พบ timeout จึงไม่ยืนยันว่าดึงรายการได้ หาก 401/403 หรือ timeout จะเป็น failure envelope และ CLI exit 1 ไม่ใช่ผลสำเร็จที่ไม่มีสินค้า ไฟล์บันทึก failure ไม่ทับ checkpoint สำเร็จ

ไฟล์ raw และ inventory อยู่ใน data/local/ สิทธิ์ข้อมูลยัง pending จึงไม่เผยแพร่ raw price/master responses ลง GitHub รายการสินค้า DOAE อีก 537 identities อยู่ใน staging ผลผลิต ดู [production.md](production.md)
