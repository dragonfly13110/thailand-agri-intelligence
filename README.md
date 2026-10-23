# Thailand Agricultural Decision Intelligence Hub

พัฒนาจากสเปก [Thailand First v1.4](Thailand_Agricultural_Decision_Intelligence_Hub_Thailand_First_v1.4_2026.md) ด้วย Python + DuckDB + ไฟล์ CSV/Parquet เป้าหมายปัจจุบันคือ [ศูนย์รวมข้อมูลเกษตรทั้งประเทศ](docs/national-agriculture-data-center.md) ให้กรมส่งเสริมการเกษตรและหน่วยงานอื่นใช้หลักฐานเดียวกันเลือกพื้นที่ วางโครงการ และติดตามผล

สถานะ: มี raw/staging หลายแหล่งและระบบต้นแบบ แต่ยังไม่มีบัญชี coverage จากทุก resource, crosswalk พื้นที่ตามเวลา, ทะเบียนโครงการข้ามหน่วยงาน หรือข้อมูลที่ผ่านสิทธิ์พร้อมเปิดใช้ร่วมกันทั้งประเทศ

**เริ่มทำงานต่อที่ [เช็กลิสต์และเอกสารส่งต่องาน](HANDOFF.md)** อัปเดต 23 ตุลาคม 2569 ระยะนี้ทำบัญชี coverage, ความหมายข้อมูล, รหัสเชื่อม และตรรกะแผน/ผลจากไฟล์ที่มีอยู่ก่อน งาน Power BI เป็นขั้นปลายทางเมื่อข้อมูลผ่านเกณฑ์

## สิ่งที่มีแล้ว

- [แผนที่แหล่งข้อมูลที่เข้าถึงได้](docs/accessible-data-map.md): บัญชีกลาง/เจ้าของข้อมูล, API ใน environment, ระบบในสเปก และคอลัมน์ที่อาจใช้เชื่อม; ผลตรวจรายรายการอยู่ใน `data/local/access-map/` แยกจากข้อมูลที่ผ่านคุณภาพ/สิทธิ์แล้ว
- รหัสจังหวัดครบ 77 แห่ง รวมกรุงเทพมหานครและบึงกาฬ พร้อมที่มา แยกจากการมีข้อมูลจริง
- Registry 16 แหล่ง และ Coverage Matrix 77 จังหวัด × 20 หมวด แสดง `UNVERIFIED` จนกว่าจะมีหลักฐาน
- CKAN DOAE/OAE discovery แบบแบ่งหน้า, snapshot พร้อม SHA-256 และ checkpoint
- ราคาข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15 จาก OAE/NABC ระดับประเทศ 189 เดือน ม.ค. 2011 ถึง ก.ย. 2026 ทดลองดึงจริงแล้ว แปลงบาท/ตันเป็นบาท/กก. เก็บต้นฉบับไว้
- ขยายประวัติราคา NABC เป็น 44 สินค้าที่พบใน inventory ปี 2569: 7,657 ค่ารายเดือนที่ไม่ขัดแย้ง และ Unknown 1 เดือน เก็บหน่วยสัตว์/ไข่/ผลไม้แยกจาก THB/kg พร้อม checkpoint และ quarantine
- Open-Meteo ERA5 ย้อนหลังปี 2016 ถึง 2025 รวม 3,653 วัน ณ จุดตัวอย่างไทย แยก reanalysis, forecast และเวลาการเผยแพร่
- Warehouse เก็บ revisions, ปฏิเสธข้อมูลผิด schema และเก็บ `null` ต่างจาก 0
- กฎทดลองตรวจฝนน้อยและราคา/ผลผลิต พร้อม evidence; หลักฐานไม่พอคืน `unknown`
- Baseline forecast และ walk-forward backtest ป้องกันข้อมูลอนาคตรั่วเข้าอดีต ซ่อนผลเมื่อไม่ผ่านเกณฑ์
- ส่งออก snapshot CSV/Parquet แยกสาธารณะกับภายใน พร้อมตรวจ checksum และไฟล์นำเข้า Power BI
- มี PBIP ร่างในเครื่องและตรวจโครงสร้างแล้ว ยังไม่ทดสอบ Refresh/DAX/render ใน Desktop; สถานะและไฟล์รุ่นล่าสุดดู [Power BI handoff](powerbi/README.md)
- CI สำหรับ tests/build และ workflow ตรวจ catalog รายสัปดาห์เมื่อเชื่อม GitHub แล้ว

## เริ่มใช้งานบน Windows

ใช้จาก source checkout นี้แบบ editable install ไฟล์ config/schema อยู่ใน repository ไม่รองรับการติดตั้ง wheel แยกไปเครื่องอื่นในรุ่นนี้

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.lock
./.venv/Scripts/python.exe -m pip install --no-deps -e .
./.venv/Scripts/python.exe -m unittest discover -s tests -v
./.venv/Scripts/python.exe -m tadih build
```

Linux/macOS ใช้ `.venv/bin/python` แทน `.venv/Scripts/python.exe` รองรับ Python 3.11 ขึ้นไป; ทดสอบเครื่องนี้ด้วย Python 3.14 และกำหนด CI เป็น 3.12

คำสั่ง `build` ไม่เรียก API และไม่แต่งตัวเลขขึ้นเอง ไฟล์จะอยู่ในโฟลเดอร์ snapshot ใหม่ใต้ `exports/build/` ทุกครั้ง ดูพาธจากผลคำสั่ง แล้วตรวจไฟล์ได้ด้วย:

```powershell
./.venv/Scripts/python.exe -m tadih verify 'พาธ snapshot จากคำสั่ง build'
```

## ดึงข้อมูลจริง

คำสั่งส่วนนี้เป็นคู่มือ ingestion เดิม ตรวจ [HANDOFF](HANDOFF.md) และ manifest ก่อนใช้เพื่อไม่โหลดซ้ำหรือกินพื้นที่ดิสก์เพิ่ม งานรอบถัดไปเริ่มจากข้อมูลในเครื่อง

```powershell
./.venv/Scripts/python.exe -m tadih discover --source doae --limit 100 --max-pages 2
./.venv/Scripts/python.exe -m tadih discover --source oae --limit 100 --max-pages 2
./.venv/Scripts/python.exe -m tadih oae-rice
./.venv/Scripts/python.exe -m tadih doae-production
./.venv/Scripts/python.exe -m tadih commodities --source nabc_monthly --year-th 2569
./.venv/Scripts/python.exe -m tadih status
./.venv/Scripts/python.exe -m tadih build --audience internal --period 2026-09
```

Catalog อาจยังไม่ครบเมื่อถึง page budget ต้องดู `pagination.complete` และต่อจาก offset ที่บันทึกไว้ ประวัติราคา NABC ปัจจุบันมี 44 series ตามรายการสินค้าที่ API ปี 2569 ส่งกลับ ไม่ถือว่าเป็นทุกสินค้าที่เคยเผยแพร่ในอดีต รายละเอียดคำสั่ง backfill/import และ quality อยู่ใน [commodities.md](docs/commodities.md)

ไฟล์ raw/checkpoint และ DuckDB อยู่ใน `data/local/` และถูก gitignore ค่า `release_at` ของราคาที่ทดลองยังไม่ทราบ จึงใช้สำรวจย้อนหลังได้ แต่ยังใช้รับรอง as-of backtest ไม่ได้ ราคาประเทศไม่ถูกกระจายลงจังหวัด

การทดลอง weather:

```powershell
./.venv/Scripts/python.exe -m tadih weather --latitude 13.8 --longitude 100.25 --start 2020-01-01 --end 2020-01-03
./.venv/Scripts/python.exe -m tadih weather-backfill --latitude 13.8 --longitude 100.25 --start-year 2016 --end-year 2025
```

Open-Meteo API ฟรีจำกัดงานไม่เชิงพาณิชย์ ต้องดู [เงื่อนไขผู้ให้บริการ](https://open-meteo.com/en/terms) รุ่นนี้อนุญาตเพียง 2 จุดที่ตรวจแล้ว จนกว่าจะมีขอบเขตไทยที่ได้รับอนุญาตและตรวจพิกัดได้ แก้ปัญหา TLS ของ Python บน Windows โดยใช้ ROOT trust store แล้ว ดึงย้อนหลังจริงสำเร็จโดยยังตรวจ certificate/hostname ตามปกติ รายละเอียดอยู่ใน [คู่มือ ingestion](docs/ingestion.md)

Backfill ตรวจ checksum แล้วข้ามปีที่ดึงสำเร็จ ใช้ `--refresh` เมื่อต้องการตรวจข้อมูลย้อนหลังที่ต้นทางแก้ไข เก็บ snapshot รุ่นเดิมไว้ ข้อมูลอากาศนี้เป็นกริดจุดเดียว ไม่ใช่ค่าเฉลี่ยจังหวัด

## สิทธิ์ข้อมูลและการส่งออก

`build` ค่าเริ่มต้นส่งเฉพาะแถว `license_status=approved_public` หลังเลือก revision ล่าสุด ข้อมูล `pending/restricted` จึงไม่ออกสาธารณะ แม้ revision เก่าเคยเปิดเผยได้

`build --audience internal` เก็บแถวที่ผ่าน schema ทุกสถานะไว้ใน `exports/private/` เพื่อสำรวจในเครื่อง พร้อม `redistribution_allowed=false` ห้ามอัปโหลดโฟลเดอร์นี้เป็น public artifact หรือใช้ Publish to web สิทธิ์ใช้งานภายในยังต้องเป็นไปตามเจ้าของข้อมูล

การตั้ง `approved_public` เป็นการรับรองของผู้ตรวจข้อมูล ต้องอ่านใบอนุญาตราย resource ตรวจ attribution และข้อมูลส่วนบุคคลก่อน Schema ไม่สามารถตรวจความลับหรือชื่อเกษตรกรในทุกข้อความได้ ไม่มี token ใน config

ดู [Power BI handoff](powerbi/README.md), [ทะเบียนแหล่งข้อมูล](docs/source-registry.md), [วิธีคำนวณ](docs/methodology.md), [คู่มือปฏิบัติงาน](docs/runbook.md) และ [สถานะ/งานถัดไป](docs/progress.md)

## ขอบเขตรุ่นแรก

ยังไม่มี polygon อำเภอ/ตำบล, การถ่วงน้ำหนักกริดทั้งประเทศ, น้ำ/NDVI ที่เชื่อมจริง, หน้า Power BI ที่เปิดทดสอบแล้ว หรือ forecast ราคา/ผลผลิตที่ผ่านข้อมูลจริงครบเกณฑ์ การเพิ่มข้อมูลต้องคงระดับพื้นที่ หน่วย ตลาด ฤดู และเวลาเผยแพร่ตามต้นทาง

โค้ดอยู่ใน [GitHub Public repo](https://github.com/dragonfly13110/thailand-agri-intelligence) ตามที่เจ้าของงานอนุมัติ CI และ workflow ตรวจ DOAE/OAE catalog รันผ่านบน GitHub แล้ว raw และข้อมูลสิทธิ์ pending อยู่ในเครื่อง Artifact ของ catalog มีเฉพาะสถานะ/checksum งาน 14 วันต่อเนื่องยังต้องติดตามจริง

เพิ่ม staging ผลผลิต DOAE 50,103 แถว/537 commodity identities, inventory ราคาสินค้า NABC ปี 2569 จำนวน 44 identities และ geography snapshot ปี 2023 ระดับอำเภอ/ตำบลแล้ว ดู [production](docs/production.md), [commodities](docs/commodities.md), [geography](docs/geography.md) แต่ยังไม่อ้างว่าเป็น facts ที่ผ่านการรวมพื้นที่หรือรหัสปี 2026 ปัจจุบัน
