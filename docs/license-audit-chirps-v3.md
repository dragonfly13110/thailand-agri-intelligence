# CHIRPS v3: ตรวจสิทธิ์และความพร้อมของ resource

ตรวจเอกสารทางการวันที่ 25 ตุลาคม 2569. งานนี้อ่านเฉพาะหน้าเอกสาร/README ไม่ดาวน์โหลด raster หรือเปลี่ยนทะเบียนสิทธิ์.

## ผลตรวจ

| หัวข้อ | หลักฐาน |
|---|---|
| เจ้าของ/ผู้ผลิต | Climate Hazards Center, Department of Geography, University of California Santa Barbara; README ระบุความร่วมมือกับ FEWS NET และ USGS EROS |
| ชุด/รุ่น | CHIRPS v3.0; quasi-global rainfall estimates เหนือพื้นดิน 60°N–60°S, 0.05° grid, 1981 ถึง near-present |
| สิทธิ์ | หน้า CHC ระบุว่า CHIRPS3 อยู่ใน public domain และ licensed under Creative Commons Attribution 4.0 International; CHC ระบุว่าได้สละลิขสิทธิ์และสิทธิ์ข้างเคียงเท่าที่กฎหมายอนุญาต. หลักฐานนี้รองรับการใช้และเผยแพร่ชุด CHIRPS v3 โดยใส่ attribution/ลิงก์ CC BY 4.0 และ citation ตามคำแนะนำของ CHC |
| Attribution | อ้างอิง CHIRPS3 Data Repository DOI `10.15780/G2JQ0P` และบทความ Funk et al. (2026), *Scientific Data* 13, 718 ตามหน้า CHC; เก็บรุ่นและวันเข้าถึงใน metadata |
| Grain / หน่วย | grid cell 0.05° × time step; CHIRPS3 FAQ ระบุปริมาณฝนเป็น total mm ต่อ time step (เช่น mm/pentad หรือ mm/month). ไม่ใช่ค่าจังหวัดหรือสถานี |
| ช่วงเวลา / รุ่นย่อย | มี preliminary และ final. Preliminary ออกหลังจบ pentad 2 วัน; final ออกประมาณสัปดาห์ที่สามของเดือนถัดไป. CHIRPS เป็นผลิตภัณฑ์ pentad/monthly โดยพื้นฐาน; daily เป็นการกระจายยอด pentad ด้วย ERA5 (`rnl`) หรือ IMERG (`sat`) |
| ข้อควรระวัง | Daily README แนะนำ pentad/monthly เมื่อเหมาะสม; daily date เป็น label UTC สำหรับการกระจาย ไม่ใช่หน้าต่างสังเกตการณ์เดียวกันของทุกสถานี. `rnl` มีตั้งแต่ 1981; README ระบุ `sat` ตั้งแต่ 1998 แต่ CHIRPS3 FAQ ที่ค้นพบระบุ archive เริ่ม 2001 จึงต้องตรวจ directory/manifest จริงก่อนประกาศช่วง `sat` |

## ข้อเสนอสำหรับ M4/M5

หลักฐานสิทธิ์ของชุด CHIRPS v3 ชัดพอให้พิจารณาผ่าน gate ด้าน license สำหรับ resource รุ่นนี้ เมื่อบันทึก attribution ตามข้างต้น. ยังไม่เปลี่ยน `config/resource_licenses.json`; จนกว่าจะลงทะเบียน resource เฉพาะและตรวจสัญญาข้อมูลที่จะ ingest ให้คงสถานะที่ระบบใช้อยู่.

ยังไม่พร้อมเริ่ม numeric vertical slice: ต้องระบุ resource/path ที่แน่นอน (แนะนำ final pentad หรือ monthly), ยืนยัน units/nodata และรูปแบบ raster จาก metadata ไฟล์, ตรวจ revision/availability, แล้วกำหนดวิธี clip/aggregate ที่ไม่เรียก grid ว่าค่าจังหวัด. ห้ามนำค่ากริดออก public API ก่อนลงทะเบียนและผ่านเกณฑ์ดังกล่าว.

## เอกสารทางการที่ตรวจ

- [CHIRPS v3 — Climate Hazards Center, UCSB](https://www.chc.ucsb.edu/data/chirps3) — ขอบเขต, spatial resolution, products, revision cadence, citation และ license.
- [CHIRPS v3.0 README](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/README-CHIRPSv3.0.txt) — ผู้ผลิต, version, availability และการผลิต preliminary/final.
- [CHIRPS v3 Daily README](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/readme.txt) — วิธี daily disaggregation, UTC label และข้อจำกัดด้านการตีความ.
- [CHIRPS3 FAQ — Climate Hazards Group Wiki](https://wiki.chc.ucsb.edu/CHIRPS3_FAQ) — units; หน้าดังกล่าวตอบช้าตอนเปิดตรง จึงยังต้องตรวจ units กับ metadata ของไฟล์เฉพาะก่อน ingest.

**ตรวจแบบ bounded:** เปิดหน้า CHC, README v3 และ daily README วันที่ 25 ต.ค. 2569; FAQ ปรากฏในผลค้นหาของโดเมน CHC แต่การเปิดตรง timeout. ไม่เรียกหรือบันทึกตัวเลขฝน.
