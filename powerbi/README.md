# Power BI Import handoff

วิธีทำงานปัจจุบัน: เตรียมข้อมูล โมเดล และ DAX ในเครื่องให้เสร็จ ตรวจด้วย Power BI Desktop/Tabular engine แล้วค่อยอัปโหลด Online การสร้าง/จัด visual ผ่าน browser ถูกหยุดตามคำสั่งเจ้าของงาน

มีร่าง PBIP ล่าสุดที่ `data/local/powerbi/offline-v4/TADIH.pbip` พร้อม `Data/`, `TADIH.SemanticModel/model.bim` และ PBIR ร่าง 5 หน้า รวม 12 ตาราง 15 relationships 26 measures และราคา 44 สินค้า ตรวจ Microsoft schemas และ TOM round trip ผ่าน ยังไม่มี PBIX หรือหลักฐานเปิด/Refresh/execute DAX/ตรวจภาพใน Desktop ข้อมูลจริงในร่างยังสิทธิ์ pending จึงใช้ในเครื่องและยังไม่นำขึ้น Online

ดูรายการไฟล์ คำสั่งสร้าง/ตรวจ และเช็กลิสต์ทำต่อใน [HANDOFF.md](../HANDOFF.md) Generated PBIP มี M partitions และ parameter ของตัวเอง ขั้นตอน manual ด้านล่างเป็นฐานเดิม 9 ตารางสำหรับ coverage/single-observation measures หากใช้ domain DAX ใหม่ที่อ้าง `dim_admin_area`, `fact_production_source` หรือ `dim_period[month_start]` ให้ใช้ generated model ซึ่งมี schema ครบ

ราคา descriptive ยอมรับ flag `release_unknown` พร้อมป้ายว่าไม่ทราบเวลาเผยแพร่ ไม่ใช้ flag นี้เปิด forecast/backtest ราคาที่ต้นทางให้หลายค่าขัดแย้งในเดือนเดียวเป็น Unknown/null และไม่อยู่ใน measures ราคา รักษาหน่วย `THB/kg`, `THB/head`, `THB/100_eggs`, `THB/100_fruit` แยกกัน ตารางหน้าราคาแสดงสินค้าและหน่วยคู่กับตัวเลข ไม่รวมสินค้าทุกหน่วยเป็นราคาเดียว

## นำเข้า snapshot

1. สร้างและตรวจ snapshot ด้วย CLI ตาม README หลัก เลือกโฟลเดอร์ snapshot เดียวที่ผ่าน `verify` แล้ว ห้ามผสมตารางข้าม snapshot
2. ใน Power BI Desktop สร้าง text parameter ชื่อ `ExportFolder` เป็น absolute path ของโฟลเดอร์นั้น ตัวอย่าง `T:\coding+\BI AGRI THAILAND\exports\build\<snapshot>` โดยไม่ใส่ `<snapshot>` ตามตัวอักษร
3. สร้าง Blank Query ชื่อ `HubData` วาง [queries.pq](queries.pq) ใน Advanced Editor แล้วปิด Enable load ของ `HubData` สร้าง Reference queries ชื่อตรงกับ table fields โดยใช้ `= HubData[dim_area]` เป็นต้น
4. เปิด load สำหรับ `dim_area`, `dim_source`, `dim_category`, `dim_period`, `fact_observation`, `fact_data_coverage`, `fact_category_coverage`, `decision_cards`, `snapshot_metadata`
5. ปิด auto-detect relationships ตั้ง `area_code`, `province_code`, source/category/location/commodity IDs เป็น Text และ `value` เป็น Do not summarize
6. สร้างความสัมพันธ์ตามตารางด้านล่าง สร้างแต่ละ measure ใน [measures.dax](measures.dax) แยกกัน แล้วนำเข้า [theme.json](theme.json)

Power Query อ่าน UTF-8 CSV โดยไม่ใช้การเดาชนิดข้อมูลอัตโนมัติ รหัสคงเป็นข้อความ ช่องว่างแปลงเป็น null ก่อนแปลงชนิดตัวเลข ไม่แปลง missing เป็น 0 ชื่อคอลัมน์ผิด/schema เปลี่ยนจะเกิด error เพื่อให้ตรวจแก้ ไม่เงียบข้ามข้อมูล Timestamp ถูกแปลงเป็น UTC แล้วเก็บเป็น datetime สำหรับ semantic model; ชื่อ visual ต้องระบุ UTC หากต้องแสดงเวลาไทยให้เพิ่ม conversion เฉพาะชั้นแสดงผล ส่วนคอลัมน์ `period` คำนวณเดือนตามเวลาไทย UTC+7 ให้ตรง coverage ของ publisher

ตรวจ `snapshot_metadata[audience]` และ `redistribution_allowed` ก่อนแชร์รายงาน Snapshot internal อาจมีข้อมูลที่ยังไม่ได้อนุมัติสิทธิ์เผยแพร่ จึงใช้ได้เฉพาะภายในที่มีสิทธิ์ ไม่ใช้ Publish to web จาก snapshot นี้

การอ่าน CSV และการจัดชนิดข้อมูลอิง [Csv.Document](https://learn.microsoft.com/en-us/powerquery-m/csv-document) และ [Table.TransformColumnTypes](https://learn.microsoft.com/en-us/powerquery-m/table-transformcolumntypes) ของ Microsoft

## ความสัมพันธ์

ทุก relationship เป็น one-to-many และ filter direction เดียวจาก dimension ไป fact ไม่มี fact-to-fact relationship

| One side | Many side |
|---|---|
| `dim_area[area_code]` | `fact_observation[area_code]` |
| `dim_area[area_code]` | `fact_data_coverage[area_code]` |
| `dim_area[area_code]` | `fact_category_coverage[area_code]` |
| `dim_source[source_id]` | `fact_observation[source_id]` |
| `dim_source[source_id]` | `fact_data_coverage[source_dataset_id]` |
| `dim_category[category_id]` | `fact_category_coverage[category_id]` |
| `dim_period[period]` | `fact_observation[period]` |
| `dim_period[period]` | `fact_data_coverage[period]` |
| `dim_period[period]` | `fact_category_coverage[period]` |

`decision_cards` และ `snapshot_metadata` เป็นตารางข้อมูลประกอบที่ยังไม่สร้าง relationship เพราะ card เริ่มต้นมีพื้นที่เป็น null และ metadata เป็นระดับ snapshot `decision_id` D01 คือราคา/ผลผลิต และ D02 คือเฝ้าระวังฝน จุดอากาศหรือข้อมูลระดับประเทศที่ `area_code` เป็น null อยู่ใน blank member ไม่ถือว่ามีข้อมูลเฉลี่ยจังหวัด ชุดราคาประเทศ 44 สินค้าห้ามกระจายให้แต่ละจังหวัดหรืออ้างว่าใช้ province slicer ดูราคาประจำจังหวัดได้

`release_at=null` หมายถึงยังไม่รู้วันเผยแพร่จริง ไม่ใช่วันที่สืบค้น ห้ามใช้รายการนี้เป็นข้อมูลที่พิสูจน์ว่าโมเดลรู้แล้ว ณ วันออกพยากรณ์ย้อนหลัง Forecast API ปฏิเสธ input ที่ไม่มี release_at

Category slicer ใช้กับ category coverage เท่านั้น Source slicer ใช้กับ observation และ source coverage เท่านั้น คอลัมน์ `dim_source[domains]` เป็น JSON text เพื่ออ้างอิง ยังไม่ใช่ bridge ที่ใช้ส่ง filter ข้ามสองหมวด ห้ามสร้าง bidirectional relationship เพื่อให้ slicer ดูเหมือนส่งผลถึงตารางที่ยังไม่มี mapping

## อ่าน coverage ให้ตรงความหมาย

`fact_data_coverage` ปัจจุบันมี grain เป็น provider × province × period โดยชื่อ `source_dataset_id` ยังอ้าง provider registry ไม่ได้หมายความว่าพิสูจน์ทุก resource/dataset ของหน่วยงานนั้นแล้ว

| Status | ความหมาย | ใช้เป็น denominator ของ verified coverage |
|---|---|---|
| `AVAILABLE` | มี observation aggregate จังหวัดที่ผ่านเกณฑ์และอยู่ใน audience ของ snapshot | รวม |
| `NOT_PUBLISHED` | มีหลักฐานยืนยันว่าต้นทางไม่เผยแพร่ตาม scope ที่ระบุ | รวม |
| `PIPELINE_ERROR` | ตรวจแล้วพบปัญหาการดึงข้อมูลที่ต้องแก้ | รวม |
| `UNVERIFIED` | ยังไม่มีหลักฐานเพียงพอ | ไม่รวม |
| `NOT_APPLICABLE` | แหล่งนี้ใช้ไม่ได้กับพื้นที่/หมวดนั้นโดยนิยาม | ไม่รวม |

อัตราใช้ `AVAILABLE / (AVAILABLE + NOT_PUBLISHED + PIPELINE_ERROR)` ไม่ใช้ 77 เป็น denominator และไม่ทำให้พื้นที่ที่ยังไม่ตรวจสอบกลายเป็น “ไม่มีข้อมูล” ถ้ายังไม่มี verified entry ให้แสดง “ยังไม่ตรวจสอบความครอบคลุม” ไม่แสดง 0% Measures อัตรานี้ตั้งใจไม่รับ status filter แต่ยังรับพื้นที่ แหล่ง และเดือนที่เลือก ตัวเลข `Supported Provinces` เป็นขนาด geography master เท่านั้น

เอกสาร Microsoft อธิบาย [CALCULATE/filter context](https://learn.microsoft.com/en-us/dax/calculate-function-dax) และ [DIVIDE ที่คืน BLANK เมื่อหารด้วย 0](https://learn.microsoft.com/en-us/dax/divide-function-dax) ซึ่งใช้รักษา Unknown ใน measures ชุดนี้

## โครงหน้า 5 หน้า

ใช้ canvas Desktop 16:9 และทำ mobile layout แยก จัดหัวข้อใหญ่ พื้นที่ว่าง และสถานะด้วยข้อความคู่กับสี Theme ใช้ฟอนต์ไทย `Leelawadee UI`; เปลี่ยนเป็น Itim ได้เมื่อมีฟอนต์ครบเครื่องสร้างรายงานและเครื่องแสดงผล

| หน้า | Visual หลักและคำถามตัดสินใจ | สิ่งที่ยังต้องมีข้อมูลก่อนเปิดใช้ |
|---|---|---|
| Thailand Situation Room | supported provinces, coverage label, source/category coverage matrix, freshness table และช่องข้อจำกัด “จังหวัดใดควรตรวจข้อมูลก่อน” | แผนที่จังหวัดต้องมี geometry ที่ตรวจรุ่นและสิทธิ์แล้ว ห้ามวางจุด sample แทนพื้นที่เฉลี่ยจังหวัด |
| Crop Production & Price | ตารางเลือกสินค้า/จังหวัด/ตลาด/เกรด/หน่วย/ฤดู; series ราคากับผลผลิตแยก visual พร้อมนิยาม “มีอะไรเปลี่ยนจนควรตรวจสอบ” | ห้าม SUM(value) รวมหลายสินค้า/หน่วย; forecast 7/30/90 วันยังซ่อนจนมีผล backtest ผ่าน |
| Water, Rain & Disaster Watch | ฝนย้อนหลังแยก observed/estimated, evidence ของ percentile และระดับน้ำ, card ขั้นตอนตรวจพื้นที่ “หลักฐานพอเฝ้าระวังหรือยัง” | station/grid point ไม่ใช่จังหวัด; ขาด baseline/water/quality ให้ Unknown และไม่เรียกประกาศภัย |
| Satellite Crop Watch | ตาราง/ภาพ seasonal anomaly และ valid-pixel fraction พร้อม cloud flag “การเปลี่ยนแปลงนี้ควรตรวจอะไรต่อ” | ยังไม่มี approved zonal statistics/crop mask ไม่สร้าง anomaly แทนข้อมูล; NDVI ตัวเดียวไม่ยืนยันพืชเสียหาย |
| Forecast & Decision Audit | card status/reasons/evidence, snapshot metadata, model/issue/valid/cutoff/scorecard เมื่อมี “พยากรณ์นี้ผ่านเกณฑ์ใดและใครต้องตรวจ” | ตอนนี้ metadata `forecast_status` เป็น suppressed; ยังไม่มี model_scorecard fact ที่ใช้เปิด forecast จริง |

ทุกหน้ามีจังหวัด แหล่งข้อมูล ช่วงเวลา ความละเอียดพื้นที่ วันข้อมูลล่าสุด นิยาม หน่วย และลิงก์ต้นทางตามข้อมูลที่มี แยก `observed`, `official`, `estimated`, `forecast`, `scenario`, `unknown` ด้วยคำกำกับ ห้ามรวม forecast/scenario เข้า fact_observation หรือใช้สีเขียวแทนผลที่ยังไม่ทราบ

## ตรวจใน Desktop ก่อนนำไปใช้

ตรวจ import ทั้งกรณี fact ว่างและมีข้อมูลจริง รหัสเป็น Text, blank numeric ยัง null, relation ไม่คูณแถว และ slicer ไม่ข้ามตารางที่ไม่มี mapping จากนั้นตรวจ DAX ในบริบทเดือน/จังหวัด/source รวมถึงกรณี denominator ว่างและมีแต่ UNVERIFIED ตรวจภาพ Thai typography, keyboard/screen-reader labels, mobile layout และ tooltip แหล่งอ้างอิง แล้วจึงบันทึก PBIX/PBIP

ไฟล์ JSON theme เป็นรูปแบบ custom theme ตาม [เอกสาร Microsoft](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes) แต่ยังไม่ได้ตรวจด้วย Power BI Desktop รุ่นที่ผู้ใช้ติดตั้ง ไม่อ้างว่าทดสอบ M/DAX/render แล้ว
