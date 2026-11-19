# โปรเจกต์ย่อย: วิเคราะห์จุดความร้อนและร่องรอยเผาไหม้ (GISTDA ล้วน 2022–2026) ด้วย DuckDB

โปรเจกต์ย่อยนี้แยกออกจากเว็บหลัก (`web/`) และคลัง Cloudflare D1 โดยสมบูรณ์ ใช้ข้อมูลจาก **GISTDA** ทั้งระบบ (จุด Hotspot VIIRS รายวัน 2022–ปัจจุบัน + ร่องรอยพื้นที่เผาไหม้ `burn-scar` + พื้นที่เผาซ้ำซาก `burn-freq`) มาวิเคราะห์ใน **DuckDB** บนเครื่อง

## โครงสร้างไฟล์

- `config.py` — ตั้งค่าช่วงปี GISTDA (`2022–2026`) และตำแหน่งไฟล์
- `download_boundaries.py` — ดาวน์โหลดขอบเขตอำเภอ (Layer 2) และตำบล (Layer 3) ทั่วประเทศจาก ปภ. (DDPM) ลง `data/boundaries/`
- `download_gistda_viirs.py` — ดาวน์โหลดจุด Hotspot VIIRS รายวันของประเทศไทย (`ct_en=Thailand`) จาก GISTDA STAC พร้อมพิกัดอำเภอ/ตำบลและหมู่บ้านใกล้เคียง (`village`, `v_dist`, `v_direct`)
- `download_gistda.py` — ดาวน์โหลดร่องรอยพื้นที่เผาไหม้ (`burn-scar`) และพื้นที่เผาไหม้ซ้ำซาก (`burn-freq`) จาก GISTDA API Gateway
- `download_tamroypao.py` — ดาวน์โหลด CSV รายจังหวัด/รายเดือน และ GeoTIFF 20 ม. รายฤดูฝุ่น (`MB3A` เกษตร + `MB3F` ป่า, 3 ฤดู 2567–2569) ของระบบ "ตามรอยเผา" (สสน./HII) มาซ้อนพิกัด `dim_tambon` (62 จังหวัดในขอบเขต สสน., 1 พิกเซล = 0.25 ไร่) ลงตาราง `tamroypao_burn_tambon` ใน DuckDB
- `download_weather.py` — ดึงสภาพอากาศรายวัน 5 ปี (`2022-01-01..2026-11-15`) ครบทั้ง 77 จังหวัดจาก Open-Meteo ERA5 (`CC-BY-4.0`) สรุปรายเดือน 59 เดือน (`4,543` แถว: Tmax, Tmean, ฝน, วันไม่ตกฝน, ความชื้นต่ำสุด RHmin, วันแห้งจัด RH<35%, ลมแรง, ET0 และดัชนีอากาศเอื้อไฟ FWI 0–100) ลงตาราง `era5_monthly_fire_weather` และวิว `v_era5_annual_fire_weather`
- `build_db.py` — นำเข้าขอบเขตจังหวัด/อำเภอ/ตำบล, จุดความร้อน VIIRS 5 ปี (พร้อมชื่อหมู่บ้านใกล้เคียง) และ burn-scar/burn-freq ลง DuckDB, แยกประเภทพื้นที่/ดาวเทียม และปักธงจุดความร้อนถาวรที่ซ้ำพิกัดเดิมเกิน 25 วัน
- `analyze.py` — รันสรุปรายปี, ประเภทพื้นที่/พืช, ฤดูกาลรายเดือน, อันดับจังหวัด/อำเภอ/ตำบล/หมู่บ้าน และส่งออก CSV/JSON ไปที่ `data/output/`
- `map_data.py`, `map_template.py`, `ui_pages.py`, `explorer_asset.py`, `build_interactive_map.py`, `build_web_app.py` — สร้างศูนย์วิเคราะห์ 5 หน้า (**ภาพรวมประเทศ · แผนที่เจาะลึก · ห้องแล็บอากาศ × ไฟ + พยากรณ์สด 7 วัน · รอยเผา 3 ฤดู & เทียบจังหวัด · ศูนย์ค้นข้อมูลดิบ DuckDB-Wasm**) ได้ทั้งไฟล์ออฟไลน์เดี่ยว `data/output/hotspot_5y_interactive_map.html` (4 หน้าหลัก) และเว็บสแตนด์อโลน `web_app/index.html` (ครบ 5 หน้า เชื่อม Hugging Face Parquet + Open-Meteo Forecast)
- `publish_hf.py` — ส่งออก Parquet 14 ชุด (`hotspots_2022..2026`, `tamroypao_*`, `era5_monthly_fire_weather`, `gistda_burn_*`, `era5_annual_2016_2025`, `hii_flood_risk`, `dim_areas`) + `summary/map_payload.json.gz` + `README.md` ขึ้น Hugging Face Datasets ด้วยคำสั่งเดียว (อ่าน `HF_TOKEN` จาก `.env`)
- `tests/test_hotspot_5y.py`, `tests/test_interactive_map.py`, `tests/test_weather.py` — ชุดทดสอบการทำงานแบบออฟไลน์

## วิธีใช้งาน (รันจากรากโปรเจกต์)

```cmd
.venv\Scripts\python.exe hotspot-5y\download_boundaries.py
.venv\Scripts\python.exe hotspot-5y\download_gistda_viirs.py
.venv\Scripts\python.exe hotspot-5y\download_gistda.py --dataset burn-scar
.venv\Scripts\python.exe hotspot-5y\download_gistda.py --dataset burn-freq --centroid-only
.venv\Scripts\python.exe hotspot-5y\build_db.py
.venv\Scripts\python.exe hotspot-5y\download_tamroypao.py
.venv\Scripts\python.exe hotspot-5y\download_weather.py
.venv\Scripts\python.exe hotspot-5y\analyze.py
.venv\Scripts\python.exe hotspot-5y\build_interactive_map.py
.venv\Scripts\python.exe hotspot-5y\publish_hf.py
.venv\Scripts\python.exe hotspot-5y\build_web_app.py
```
