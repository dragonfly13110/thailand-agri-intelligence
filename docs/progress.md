# สถานะโครงการ 22 ตุลาคม 2569

ช่วงนี้ทำฐานระบบ Thailand Core ตาม PART IV เป็นลำดับแรก ไม่ได้ถือว่าแผน 59 วันเสร็จแล้ว

เช็กลิสต์ส่งต่องานและไฟล์ทั้งหมด: [HANDOFF.md](../HANDOFF.md) เป็นจุดเริ่มสำหรับ AI ตัวถัดไป มีคำสั่งตรวจ พาธข้อมูลจริง และงานต่อ B1–D5

คำสั่งล่าสุดของเจ้าของงาน: ทำข้อมูลและโมเดล/DAX ในเครื่องก่อน แล้วจึงอัปโหลด Online หยุดการจัด visual ผ่าน browser ไว้แล้ว มีเพียง semantic model Coverage ทดลองจากช่วงก่อนเปลี่ยนวิธีทำงาน ยังไม่ใช่งานปลายทาง

อัปเดต: Public repo สร้างตามเจ้าของงานอนุมัติแล้ว Source งานล่าสุดอยู่ `e7ad054` รวม offline model และราคา 44 สินค้า [CI รอบนี้ผ่าน](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39755251646) และ [DOAE/OAE live catalog probe](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39744139935) สำเร็จ ไม่มี raw สิทธิ์ pending ใน repo/artifacts

| งาน | หลักฐาน | สถานะ |
|---|---|---|
| พื้นที่ 77 จังหวัด | config/provinces.csv + tests | รหัส/ชื่อพร้อม; ไม่มี geometry |
| Registry ไทยและบริการพื้นที่ไทย 15 แหล่ง | config/sources.json | รายการพร้อม; สิทธิ์ราย resource ยัง pending |
| DOAE/OAE discovery | data/local/probes, raw checksum | เชื่อม metadata จริง; แบ่งหน้าได้ |
| ราคา OAE/NABC | 44 histories; ราคาไม่ขัดแย้ง 7,657 เดือน ช่วงรวม ม.ค. 2011 ถึง ก.ย. 2026 | ระดับประเทศ; อีก 1 เดือน Unknown จาก source conflict |
| ผลผลิต DOAE | CSV เต็ม 50,103 records /77 ชื่อจังหวัด/537 commodity identities | staging จริง; ยังไม่รวมพื้นที่เป็น fact |
| พื้นที่ระดับย่อย | DOPA snapshot2023:928 อำเภอ/7,436 ตำบล, retired1,584 | แยก active/retired; ไม่อ้าง current2026 |
| Commodity inventory NABC | ปี2569:raw387/unique376/duplicates11; 44 identities/4pages | normalize แล้ว; product histories 44 captures; taxonomy ข้าม provider ยังไม่ทำ |
| อากาศ ERA5 | 1 จุดไทย / 3,653 วัน ปี 2016 ถึง 2025 / 3 ตัวแปร | ดึงจริง 10 partitions; ตรวจ resume ไม่เรียก API ซ้ำ |
| Data quality + revision | unittest + JSON schemas | รันได้; ข้อมูลขาดเป็น null |
| Coverage 77 × 20 | export CSV | พร้อมสถานะ UNVERIFIED; ไม่มีการแต่งข้อมูล |
| Decision workflows น้ำ/ตลาด | CLI + evidence rules/tests | prototype; ขาด evidence จริงที่เชื่อมครบ |
| Forecast/backtest | release-aware daily baselines/tests | prototype; ยังไม่มี forecast ปฏิบัติงาน |
| Power BI | local PBIP v4: 12 ตาราง/15 relationships/26 measures/ร่าง 5 หน้า | schema/TOM ผ่าน; ยังไม่ Refresh/execute DAX/render ใน Desktop |
| ทะเบียนสิทธิ์ราย resource | config/resource_licenses.json + docs/source-license-register.md | ตรวจ 6 ชุดพร้อมหลักฐาน ทุกชุดยัง pending |
| GitHub Actions | workflows สองชุด | CI และ catalog probe ผ่านจริง; schedule รายสัปดาห์ |

## ผลตรวจรับฐานระบบ

- Tests 101 รายการผ่าน ครอบคลุม schema, missing/zero, native price units, fixed IDs/revisions, conflict quarantine, transaction rollback, ข้อมูลอนาคต, ปฏิทินไทย, coverage, TLS, staging, snapshot integrity, model keys, schema cache และ no-network resume ยังไม่ใช่การทดสอบ DAX ด้วย Tabular engine
- ร่าง `data/local/powerbi/offline-v4/TADIH.pbip` มีข้อมูลจริงแบบ local only: ตรวจ hash 32 files และ Microsoft schemas 19 metadata files ผ่าน; TOM SDK 19.114.12 แปลง model ไปกลับเป็น TMDL ผ่าน ไม่ใช่หลักฐาน runtime/ภาพ
- Crosswalk ผลผลิต DOAE จับคู่ชื่อภายใต้ parent hierarchy ได้ 50,101 จาก 50,103 records เหลือ 1 ชุดชื่อพื้นที่/2 records ที่ยังไม่ match ไม่เดารหัสแทน ใช้ DOPA snapshot2023 จึงยังไม่รับรอง boundary ของทุกช่วงเวลา
- Warehouse มีข้อมูลล่าสุด 18,617 แถว: ราคาประเทศ 7,657 ค่า, Unknown ราคา 1 เดือน และอากาศจุดตัวอย่าง 10,959 ค่า ไม่มีการนับเป็นข้อมูลจังหวัด
- NABC history raw 7,669 แถว: exact duplicates 10, conflict 1 เดือน/2 แถว ไม่มีการเลือกราคาใดแทนกัน ใช้ quality revision ค่า null; หลักฐาน `data/local/probes/monthly-price-backfill.json` และ `monthly-price-import.json`
- แก้ price IDs ที่เคยผูกกับค่าให้คง source/product/unit/month/area และเก็บค่าที่เปลี่ยนเป็น revision สำรองฐานเดิมก่อน migration; raw/export snapshots เก่าไม่ถูกแก้
- ลองนำเข้า archive ซ้ำผ่าน CLI แล้ว จำนวนแถวและ revisions ไม่เพิ่ม ทุกปีใช้ checkpoint ที่ตรวจ hash แล้ว
- Snapshot ภายในมี 18,617 แถว พร้อม CSV/Parquet และ metadata `redistribution_allowed=false` ผล build ล่าสุดอยู่ใน `data/local/private-build.json`
- Snapshot สาธารณะมีข้อมูลวัด 0 แถว เพราะสิทธิ์ resource ยัง pending แต่มี master/registry/coverage ที่ตรวจได้ ผล build ล่าสุดอยู่ใน `data/local/public-build.json`
- ตรวจ SHA-256 และขนาดไฟล์ครบทั้ง snapshot ภายใน/สาธารณะแล้ว `pip check` ผ่าน
- ดึง forecast อากาศ 22 ถึง 28 ตุลาคม 2026 ได้ เก็บเป็น raw แยก ไม่เข้า observations และยังไม่รับรอง model issue time

ผลทดสอบนี้เป็นการรันในเครื่องกับ unit/integration tests ไม่ใช่การรับรอง accuracy ของแบบจำลองหรือความพร้อมใช้งานทั้ง 77 จังหวัด

## งานต่อที่มีลำดับ

1. ยืนยันใบอนุญาตราย resource DOAE/OAE และวันเผยแพร่ย้อนหลัง แยก commercial/noncommercial กับสิทธิ์แจกจ่าย
2. ดึงสินค้าทั้งหมดและ master mapping ตาม provider แบบแบ่งหน้า เก็บลง staging ไม่ใช้ชื่อ “ข้าว” รวมสินค้า/เกรดต่างกัน
3. จัดหารหัสอำเภอ/ตำบลและ polygon ที่มีรุ่น/สิทธิ์ ตรวจ mapping ชื่อ DOAE ก่อนรวมระดับจังหวัด โดยไม่รวม subtotal ซ้ำ
4. ขยายการทดสอบอากาศจากจุดเดียวที่มี archive 10 ปี ไปหลายภาค เมื่อมีการตรวจพิกัด/โควตา ก่อนคำนวณค่าเฉลี่ยพื้นที่ทั้งประเทศ
5. เชื่อมข้อมูลน้ำที่มี datum/สถานีและ NDVI ที่มี cloud mask/valid fraction แล้วทดสอบ 2 workflows ด้วย evidence จริง
6. ทดสอบ backtest ตามความถี่ข้อมูลจริงและ release lineage ราคาชุดที่พบเป็นรายเดือน จึงไม่ป้อนเข้าโมเดลรายวันโดยเติมค่าเอง
7. นำเข้า Power BI Desktop จัด 5 หน้า ทดสอบผู้ใช้จริง/สิทธิ์/backup และรัน refresh ต่อเนื่องอย่างน้อย 14 วัน

ยังไม่พึ่ง Fabric ไม่เก็บข้อมูลเกษตรทั่วโลก และไม่ส่งข้อความถึงบุคคลภายนอกจากการทดลองนี้
