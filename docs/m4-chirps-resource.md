# M4: CHIRPS v3 daily RNL resource

ตรวจ 25 ตุลาคม 2569 เพื่อยืนยัน resource ก่อนทำ M5. ใช้เอกสาร CHC, directory listing, `HEAD` และ HTTP `Range` อ่านเฉพาะ TIFF header/IFD กับ metadata tags; ไม่อ่านหรือบันทึก pixel values.

## Resource ที่ตรวจ

- **ไฟล์:** [chirps-v3.0.rnl.2026.09.30.tif](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/chirps-v3.0.rnl.2026.09.30.tif)
- **ผลิตภัณฑ์:** CHIRPS v3.0, daily, final, `rnl` (ERA5-based temporal disaggregation)
- **วันที่ข้อมูลล่าสุดที่พบ:** 2026-09-30. Directory ปี 2026 ตอบ HTTP 200 และมีวันต่อเนื่อง 273 วัน ตั้งแต่ 2026-01-01 ถึง 2026-09-30; ไม่พบวันขาดในช่วงนี้ ณ วันที่ตรวจ
- **HTTP HEAD:** 200, `image/tiff`, 18,424,090 bytes, `Last-Modified: Thu, 15 Oct 2026 22:25:24 GMT`, ETag `"6ad152d4-119211a"`, รองรับ byte ranges

## Metadata จาก TIFF header

อ่าน byte range แรก 8 bytes เพื่อหาตำแหน่ง IFD จากนั้นอ่านเฉพาะ IFD entries และ metadata arrays ของ GeoTIFF; ไม่อ่าน `StripOffsets` หรือ strip bytes.

| รายการ | ค่าที่ตรวจได้ |
|---|---|
| TIFF | classic TIFF, little-endian; sample `float32` (32 bits), LZW compression |
| ขนาด | 7,200 columns × 2,400 rows |
| CRS | EPSG:4326 จาก GeoKey `GeographicTypeGeoKey=4326` |
| Grid | pixel scale 0.0500000007° × 0.0500000007°; tiepoint ที่ (-180°, 60°); pixel-is-area |
| Scale/offset | ตรวจ TIFF IFD ครบ 23 tags; ไม่มี sample scale/offset metadata tag. ค่า scale ที่พบคือ GeoTIFF pixel scale ข้างต้น |
| NoData tag | ไม่พบ GDAL `42113` NoData tag ใน IFD |

CHC ระบุค่าฝนเป็น total mm ต่อ time step; เมื่อใช้กับ daily product จึงเป็นปริมาณสะสมรายวันหน่วย mm/day. FAQ ของ CHC ระบุ `-9999` เป็น bad value และหน้า Diagnostics ระบุข้อมูลที่หายจาก IR ตั้งแต่ปี 2023 แสดงเป็น `-9999`; ให้ normalize ค่านี้เป็น `null` และตรวจ sentinel ใน parser เพราะไฟล์ตัวอย่างไม่มี NoData tag ฝังใน TIFF. หน้า FAQ เปิดตรงไม่สำเร็จในรอบตรวจนี้ จึงควรทวนหน่วย/marker กับ metadata ตอนทำ M5.

## สิทธิ์และกติกาใช้

หน้า CHC ระบุ CHIRPS3 เป็น public domain และ licensed under CC BY 4.0. ตามเงื่อนไขที่เผยแพร่ ไม่พบข้อกำหนดให้ขออนุญาตเพิ่มสำหรับการใช้/เผยแพร่ชุดนี้; ต้องแสดงเครดิตและลิงก์ license รวมทั้งอ้าง citation ของ CHIRPS3 Data Repository DOI `10.15780/G2JQ0P` และบทความ Funk et al. (2026). Coordinator ควรลงทะเบียน attribution/URL/variant/file date ใน `config/resource_licenses.json` ก่อนเปิด public API; ไฟล์นี้ไม่ได้แก้ทะเบียน.

Grain ต้องเป็น **grid cell × UTC date**, ไม่ใช่สถานีหรือจังหวัด. Daily RNL แบ่ง pentad total ด้วย ERA5; CHC แนะนำใช้ pentad/monthly หากคำถามไม่ต้องใช้รายวัน. ห้ามเฉลี่ยหรือรวมเป็นจังหวัดจนกว่าจะกำหนดและตรวจวิธีพื้นที่/น้ำหนักใหม่.

## สถานะ M4/M5

หลักฐานสิทธิ์, resource URL, file date, daily unit, CRS, grid spacing และ revision marker พอให้ coordinator พิจารณาผ่าน M4 สำหรับ resource นี้ได้. ETag/Last-Modified เป็นตัวบ่งชี้ revision ของไฟล์ที่เห็นรอบนี้; ให้บันทึก ETag หรือ checksum ในแต่ละ batch เพราะ CHC ออก final รายเดือนและ archive เก่าอาจถูกปรับปรุง.

ก่อน M5 ยังต้องให้ connector ใช้ decoder ที่อ่าน GeoTIFF window เฉพาะจุด/ขอบเขต (ห้ามดึง global raster เข้าเครื่องถาวร), ตรวจ `-9999` เป็น null, คง grid/UTC/version, และเทียบอย่างน้อย 3 cells กับไฟล์ต้นทางตามแผน. การตรวจครั้งนี้ไม่อ่านค่าฝน จึงยังไม่ยืนยันตัวเลขตัวอย่างหรือการทำงานของ ingestion/API.

## แหล่งอ้างอิง

- [CHC CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3) — resolution, products, revision cadence, daily date convention, license และ citation.
- [CHIRPS v3 README](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/README-CHIRPSv3.0.txt) — ผู้ผลิต, ช่วงข้อมูล, grid และการเผยแพร่ preliminary/final.
- [CHIRPS v3 Daily README](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/readme.txt) — daily disaggregation, UTC label และคำเตือนเรื่องการตีความฝนรายวัน.
- [CHC CHIRPS3 Diagnostics](https://www.chc.ucsb.edu/data/chirps3/diagnostics) — ค่า `-9999` สำหรับข้อมูลที่หายหลังปี 2022.
- [CHIRPS3 FAQ](https://wiki.chc.ucsb.edu/CHIRPS3_FAQ) — search excerpt จากหน้า CHC ระบุ total mm ต่อ time step และ bad value `-9999`; direct page เปิดไม่สำเร็จตอนตรวจ. [CHC Diagnostics](https://www.chc.ucsb.edu/data/chirps3/diagnostics) ยังระบุ `-9999` สำหรับข้อมูล IR ที่หายหลังปี 2022.
- [Funk et al. (2026), Scientific Data](https://doi.org/10.1038/s41597-026-07096-4) — วิธีผลิต CHIRPS3, daily disaggregation, data availability และ license.
