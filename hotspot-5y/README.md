# โปรเจกต์ย่อย: วิเคราะห์จุดความร้อนและร่องรอยเผาไหม้ (GISTDA ล้วน 2022–2026) ด้วย DuckDB

โปรเจกต์ย่อยนี้แยกออกจากเว็บหลัก (`web/`) และคลัง Cloudflare D1 โดยสมบูรณ์ ใช้ข้อมูลจาก **GISTDA** ทั้งระบบ (จุด Hotspot VIIRS รายวัน 2022–ปัจจุบัน + ร่องรอยพื้นที่เผาไหม้ `burn-scar` + พื้นที่เผาซ้ำซาก `burn-freq`) มาวิเคราะห์ใน **DuckDB** บนเครื่อง

## โครงสร้างไฟล์

- `config.py` — ตั้งค่าช่วงปี GISTDA (`2022–2026`) และตำแหน่งไฟล์
- `download_boundaries.py` — ดาวน์โหลดขอบเขตอำเภอ (Layer 2) และตำบล (Layer 3) ทั่วประเทศจาก ปภ. (DDPM) ลง `data/boundaries/`
- `download_gistda_viirs.py` — ดาวน์โหลดจุด Hotspot VIIRS รายวันของประเทศไทย (`ct_en=Thailand`) จาก GISTDA STAC พร้อมพิกัดอำเภอ/ตำบลและหมู่บ้านใกล้เคียง (`village`, `v_dist`, `v_direct`)
- `download_gistda.py` — ดาวน์โหลดร่องรอยพื้นที่เผาไหม้ (`burn-scar`) และพื้นที่เผาไหม้ซ้ำซาก (`burn-freq`) จาก GISTDA API Gateway
- `build_db.py` — นำเข้าขอบเขตจังหวัด/อำเภอ/ตำบล, จุดความร้อน VIIRS 5 ปี (พร้อมชื่อหมู่บ้านใกล้เคียง) และ burn-scar/burn-freq ลง DuckDB, แยกประเภทพื้นที่/ดาวเทียม และปักธงจุดความร้อนถาวรที่ซ้ำพิกัดเดิมเกิน 25 วัน
- `analyze.py` — รันสรุปรายปี, ประเภทพื้นที่/พืช, ฤดูกาลรายเดือน, อันดับจังหวัด/อำเภอ/ตำบล/หมู่บ้าน และส่งออก CSV/JSON ไปที่ `data/output/`
- `map_data.py`, `map_template.py`, `build_interactive_map.py` — รวมข้อมูล Hotspot 5 ปี + อากาศ ERA5 + น้ำท่วมซ้ำ HII สร้างแผนที่โต้ตอบไฟล์ HTML เดี่ยว `data/output/hotspot_5y_interactive_map.html`
- `tests/test_hotspot_5y.py`, `tests/test_interactive_map.py` — ชุดทดสอบการทำงานแบบออฟไลน์

## วิธีใช้งาน (รันจากรากโปรเจกต์)

```cmd
.venv\Scripts\python.exe hotspot-5y\download_boundaries.py
.venv\Scripts\python.exe hotspot-5y\download_gistda_viirs.py
.venv\Scripts\python.exe hotspot-5y\download_gistda.py --dataset burn-scar
.venv\Scripts\python.exe hotspot-5y\download_gistda.py --dataset burn-freq --centroid-only
.venv\Scripts\python.exe hotspot-5y\build_db.py
.venv\Scripts\python.exe hotspot-5y\analyze.py
.venv\Scripts\python.exe hotspot-5y\build_interactive_map.py
```
