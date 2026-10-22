# รหัสพื้นที่และขอบเขต

รับ [ไฟล์ ccaatt.xlsx ของกรมการปกครอง](https://stat.bora.dopa.go.th/dload/ccaatt.xlsx) ผ่าน HTTPS วันที่ 22 ตุลาคม 2026 SHA-256 `5977e39e689d229668dabb2ff47f1a1a4bec341bd1efa0792cb45cad8e16d6e9` วันที่ใน workbook คือ 1 กันยายน 2566 แม้หน้า download จะมีวันที่เก่ากว่านั้น จึงไม่เรียกข้อมูลนี้ว่ารุ่นปัจจุบันปี 2026

ผล parse: จังหวัด 77 แห่ง, อำเภอ/เขต 928 แห่ง, ตำบล/แขวง 7,436 แห่งที่ยัง active ใน snapshot แยก records ที่ยกเลิก 1,584 รายการตามเครื่องหมาย `*` และวันจำหน่ายรหัส คอลัมน์วันที่ยกเลิกแปลง พ.ศ. เป็น ค.ศ. ส่วนวันเริ่มมีผลไม่ทราบจึงคง null

หนึ่งรหัสเก่าต้นทางคือ `97059600` มี prefix ไม่ตรงกับ 77 จังหวัดปัจจุบัน เก็บใน retired records พร้อม `scope_status=unverified_historical_prefix` ไม่แก้เป็นรหัสที่เดาและไม่ให้เข้าตาราง active

```powershell
./.venv/Scripts/python.exe -m tadih geography data/local/geography/dopa_ccaatt.xlsx --boundary data/local/geography/ddpm_province.geojson
```

คำสั่งอ่าน source file ที่รับมาแล้ว ตรวจเวอร์ชัน 2023-09-01 ก่อนสร้าง active.csv และ retired.csv แบบ immutable มี hash ใน inventory หากต้นทางเปลี่ยนเวอร์ชันจะหยุดให้ตรวจ date/schema ก่อน ไม่ยอมใช้เป็นรุ่นเดิมเงียบ ๆ

ขอบเขตจังหวัดมาจาก [DDPM FeatureServer](https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Boundary/FeatureServer/1) ดาวน์โหลด GeoJSON ผ่าน query ที่ขอ EPSG:4326, `maxAllowableOffset=0.005` และ `geometryPrecision=5` ได้ครบ 77 province codes ขนาด 306,940 bytes SHA-256 `0c6f230a3b8ec3cff0b36c2246730143d5d5ebaed47f7d1b576fd8e044a94859`

เป็นขอบเขตลดรายละเอียดสำหรับตรวจการแสดงผล ยังไม่ได้ตรวจ topology เพื่อคำนวณพื้นที่จริงหรือ zonal statistics ใบอนุญาตใน service metadata ยังว่าง จึงเก็บ geometry ภายในและไม่ push ไป Public repo

สิทธิ์ไฟล์ DOPA รุ่นนี้ยัง pending แยกจากตารางอ้างอิงรหัสจังหวัดใน config ต้องตรวจเงื่อนไขและ attribution ก่อนกระจายไฟล์ต่อ การจับคู่ชื่อพื้นที่ต้องใช้ parent code ทุกระดับ ไม่ใช้ชื่ออำเภอหรือตำบลอย่างเดียวทั่วประเทศ และห้ามถือว่าชื่อที่ match กับ snapshot เก่ายืนยันขอบเขตปีอื่นแล้ว
