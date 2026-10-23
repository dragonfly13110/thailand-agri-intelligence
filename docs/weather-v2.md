# ข้อมูลสถานีอากาศรุ่น 2

แก้ client Meteostat จากข้อผิดพลาดที่พบระหว่าง [สำรวจแผนที่ข้อมูล](accessible-data-map.md) วันที่ 23 ตุลาคม 2569 ผลใหม่เป็น staging รุ่น 2 ยังไม่ใช้แทนข้อมูลใน warehouse หรือปลดการพักค่าอากาศใน Master View

## สิ่งที่แก้แล้ว

- รักษา station IDs เดิม แต่แก้ชื่อจังหวัด 4 IDs ให้ตรงเจ้าของข้อมูล: 48381 ขอนแก่น, 48383 มุกดาหาร, 48475 ประจวบคีรีขันธ์/Hua Hin, 48565 ภูเก็ต/Phuket Airport; ปรับชื่อ พิกัด และระดับความสูงทั้ง 12 แห่งตามทะเบียนที่ตรวจแล้ว
- ทะเบียน 12 จุดเป็น snapshot ที่ตรวจวันที่ 23 ต.ค. 2569 `fetch_weather_stations()` ไม่เรียกข้อมูลสด จึงเก็บ `generated_at` แยกจากวันตรวจ metadata และ `live_fetch=false`
- ส่ง `units=metric&model=false` ทุกคำขอรายวัน ปิดการเติมค่าที่หายด้วยแบบจำลองตาม parameter ของ API ไม่อ้างว่าทุกค่าผ่านการตรวจวัด/คุณภาพภาคสนามแล้ว
- เก็บ `wind_speed_kmh` จากต้นทาง และแปลง `wind_speed_ms = wind_speed_kmh / 3.6` เก็บ null ต่างจาก 0 และปฏิเสธ non-finite/boolean values
- ตรวจ station ID, ช่วงวัน, วันที่ซ้ำ/นอกช่วง และขนาด response จำกัด 1 MB ต่อคำขอ; ถ้าชุดสถานีใดแปลงไม่ผ่านจะไม่เก็บแถวบางส่วนของสถานีนั้น
- บันทึก `ok/partial/empty/failed`, `empty_stations` และ `failures` ที่ไม่มีข้อความ exception/key; นับ `requested_station_days` จากช่วงที่ผู้ใช้ขอ สถานะสะท้อนผลคำขอ ไม่ใช่การรับรองสิทธิ์หรือคุณภาพทุกตัวแปร
- เว้นจังหวะคำขอระหว่างสถานี 1.2 วินาที และระบุ HTTP error โดยไม่แปลงเป็นปริมาณฝน 0

นิยามหน่วยและค่าเริ่มต้น model อ้างอิง [Meteostat daily API](https://dev.meteostat.net/api/stations/daily) ส่วน metadata สถานีอ้างอิง [weather-stations](https://github.com/meteostat/weather-stations) ซึ่งระบุใบอนุญาต CC BY 4.0; โค้ดแสดง attribution และระบุการแก้ชื่อ/พิกัด ข้อมูลรายวันและชุดส่งออกยังคง `license_status=pending` ไม่มีการอนุมัติสิทธิ์ย้อนหลังให้ cache เดิม

## ไฟล์และหลักฐานในเครื่อง

- `data/local/weather/dim_weather_stations_v2.json`: snapshot สถานีที่แก้แล้ว 12 แห่ง ไม่ใช่สถานีทั้งหมดในประเทศไทยหรือสถิติระดับจังหวัด
- `data/local/weather/fact_daily_weather_v2.json`: ผลทดสอบกรุงเทพฯ/นครปฐม 10–12 ต.ค. 2569 ส่ง model=false; กรุงเทพฯได้ 3 แถว นครปฐม array ว่าง จึงเป็น partial ตามคำขอ 6 station-days และไม่เติมแถว/ฝนจำลอง
- `data/local/probes/weather-v2-audit.json`: ตรวจ tuple ชื่อ/region/พิกัด/ความสูงตรง metadata 12/12, หน่วยลมสัมพันธ์กัน และ SHA-256 ของ legacy caches กับ DuckDB ไม่เปลี่ยน
- cache เดิม `dim_weather_stations.json` / `fact_daily_weather.json` และ warehouse ยังเป็นหลักฐานรุ่นเดิม; consumers ใน `warehouse.py` และ `local_project.py` ยังอ่าน path เดิม จึงยังไม่นำข้อมูล v2 เข้าคลังโดยอัตโนมัติ

แหล่ง metadata ระบุ region แบบ ISO 3166-2 การแก้ฉลากไม่รับรอง DOPA crosswalk/ขอบเขตตามช่วงเวลา หรือความเป็นตัวแทนทั้งจังหวัด วันรายวันเป็นวันตามผู้ให้บริการ ยังไม่ตีความ timezone/observation cutoff เพิ่มเอง

## งานต่อ

- [ ] ตรวจ contract วัน/เวลา ขอบเขตพื้นที่ และสิทธิ์ราย resource แล้วออกแบบ migration ไปยัง warehouse/exports โดยเก็บ legacy 6 แถวและ provenance ไว้
- [ ] ให้ consumers บังคับตรวจ contract/version/unit/model policy ก่อนอ่าน v2 ป้องกันการผสมหน่วยกับ cache เดิม
- [ ] เลือกสถานี/ช่วงเวลาตามโจทย์จริงจาก directory ประเทศ TH 123 สถานี ไม่ใช้ทุกสถานีหรืออนุมานจังหวัดจากจุดโดยอัตโนมัติ
- [ ] ตรวจ coverage ของวัน/ตัวแปรจริงก่อนสร้างสถิติ ทั้ง array ว่างและ null ไม่ใช่ฝน 0
