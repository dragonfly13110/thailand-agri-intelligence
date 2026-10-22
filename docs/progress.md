# สถานะโครงการ 22 ตุลาคม 2569

ช่วงนี้ทำฐานระบบ Thailand Core ตาม PART IV เป็นลำดับแรก ไม่ได้ถือว่าแผน 59 วันเสร็จแล้ว

เช็กลิสต์ส่งต่องานและไฟล์ทั้งหมด: [HANDOFF.md](../HANDOFF.md) เป็นจุดเริ่มสำหรับ AI ตัวถัดไป มีคำสั่งตรวจ พาธข้อมูลจริง และงานต่อ B1–D5

คำสั่งล่าสุดของเจ้าของงาน: ทำข้อมูลและโมเดล/DAX ในเครื่องก่อน แล้วจึงอัปโหลด Online หยุดการจัด visual ผ่าน browser ไว้แล้ว มีเพียง semantic model Coverage ทดลองจากช่วงก่อนเปลี่ยนวิธีทำงาน ยังไม่ใช่งานปลายทาง

อัปเดต: Public repo สร้างตามเจ้าของงานอนุมัติแล้ว Source งานล่าสุดอยู่ `e7ad054` รวม offline model และราคา 44 สินค้า [CI รอบนี้ผ่าน](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39755251646) และ [DOAE/OAE live catalog probe](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39744139935) สำเร็จ ไม่มี raw สิทธิ์ pending ใน repo/artifacts

| งาน | หลักฐาน | สถานะ |
|---|---|---|
| พื้นที่ 77 จังหวัด | config/provinces.csv + tests | รหัส/ชื่อพร้อม; ไม่มี geometry |
| Registry ไทยและบริการพื้นที่ไทย 16 แหล่ง | config/sources.json | รายการพร้อม; สิทธิ์ราย resource ยัง pending |
| DOAE/OAE discovery | data/local/probes, raw checksum | เชื่อม metadata จริง; แบ่งหน้าได้ |
| ราคา OAE/NABC | 44 histories; ราคาไม่ขัดแย้ง 7,657 เดือน ช่วงรวม ม.ค. 2011 ถึง ก.ย. 2026 | ระดับประเทศ; อีก 1 เดือน Unknown จาก source conflict |
| ผลผลิต DOAE | CSV เต็ม 50,103 records /77 ชื่อจังหวัด/537 commodity identities | staging จริง; ยังไม่รวมพื้นที่เป็น fact |
| พื้นที่ระดับย่อย | DOPA snapshot2023:928 อำเภอ/7,436 ตำบล, retired1,584 | แยก active/retired; ไม่อ้าง current2026 |
| Commodity inventory NABC | ปี2569:raw387/unique376/duplicates11; 44 identities/4pages | normalize แล้ว; product histories 44 captures; taxonomy ข้าม provider ยังไม่ทำ |
| อากาศ ERA5 | 1 จุดไทย / 3,653 วัน ปี 2016 ถึง 2025 / 3 ตัวแปร | ดึงจริง 10 partitions; ตรวจ resume ไม่เรียก API ซ้ำ |
| น้ำ RID อ่างเก็บน้ำขนาดกลาง | 461 อ่าง/วัน (ความจุ, dead storage, ปริมาตรน้ำ, %น้ำ) รวม 1,844 obs/วัน | เชื่อมต่อ pipeline, DuckDB และ CLI แล้ว; spatial_support=reservoir; สิทธิ์ pending |
| ดาวเทียม MODIS NDVI/QA | 8 observations (2 composites 16-day: 2024-09-29, 2026-09-30) | ดึงและ normalize ผ่าน Planetary Computer ณ จุด 13.8, 100.25; scale 0.0001; cloud flags; spatial_support=grid_point; สิทธิ์ pending |
| Data quality + revision | unittest + JSON schemas | รันได้; ข้อมูลขาดเป็น null; รองรับ spatial_support=reservoir และ grid_point |
| Coverage 77 × 20 | export CSV | พร้อมสถานะ UNVERIFIED (1,232 provider×province entries); ไม่มีการแต่งข้อมูล |
| Decision workflows น้ำ/ตลาด | CLI + 5 real evidence cards + tests | ผ่านการทดสอบ (D01 watch/unknown, D02 watch/normal/unknown); รวมเข้าโมเดล offline-v7 |
| Forecast/backtest | release-aware daily baselines/tests | prototype; ยังไม่มี forecast ปฏิบัติงาน |
| Power BI | local PBIP v8: 12 ตาราง/15 relationships/35 measures/ร่าง 5 หน้า (20,469 obs + 5 decision cards) | schema 21 files / hashes 34 files / TOM 19.114.12 ผ่าน 100%; แก้ crash Desktop `version.json`; ร่างเก่าจัดเก็บใน archive/ |
| ทะเบียนสิทธิ์ราย resource | config/resource_licenses.json + docs/source-license-register.md | ตรวจ 8 ชุดพร้อมหลักฐาน ทุกชุดยัง pending (รวม MODIS ผ่าน Planetary Computer) |
| GitHub Actions | workflows สองชุด | CI และ catalog probe ผ่านจริง; schedule รายสัปดาห์ |

## ผลตรวจรับฐานระบบ

- Tests 119 รายการผ่าน ครอบคลุม schema, missing/zero, native price units, fixed IDs/revisions, conflict quarantine, transaction rollback, ข้อมูลอนาคต, ปฏิทินไทย, coverage, TLS, staging, snapshot integrity, model keys, schema cache, no-network resume, RID reservoirs contract/idempotence, MODIS satellite NDVI/QA normalization/idempotence, decision workflows (D01/D02 fail-closed, spatial mismatch, cloud-safety) และ PBIR `version.json` metadata
- ร่าง `data/local/powerbi/offline-v8/TADIH.pbip` มีข้อมูลจริงแบบ local only: 20,469 fact_observation แถว และ 5 decision cards ตรวจ hash 34 files และ Microsoft schemas 21 metadata files ผ่าน (12 ตาราง/15 relationships/35 measures) หน้า Satellite Crop Watch แสดงค่า Latest NDVI, Valid Pixel Fraction, Observation Count, Cloud Contaminated Count คู่กับ dim_period; หน้า Audit แสดง decision cards 5 รายการ (watch 2, normal 1, unknown 2) เพิ่ม `definition/version.json` แก้ไขปัญหา Power BI Desktop Frown error แล้ว ร่างเก่า v1-v7 และ check folders ย้ายไป `data/local/powerbi/archive/`
- Decision Workflows D01 (ตลาด/ผลผลิต) และ D02 (น้ำ/ภัยพิบัติ) ทดสอบกับ evidence จริง:
  - D02 Watch: ฝนเดือนตุลาคม 10 ปีย้อนหลัง percentile 0.10 ต่ำกว่าเกณฑ์ 0.20 + ดาวเทียมฟ้าเปิด NDVI 0.6737 (valid fraction 1.0) + อ่างเก็บน้ำ/ระดับน้ำ 2.45m -> สถานะ `watch`, สัญญาณ `low_rain_monitoring_candidate`
  - D02 Normal: ฝน percentile 0.65 -> สถานะ `normal`, สัญญาณ `no_provisional_low_rain_signal`
  - D02 Unknown: ดาวเทียม MODIS มีเมฆบัง (valid fraction 0.0 < เกณฑ์ 0.7) -> สถานะ `unknown`, ปฏิเสธการประเมินความเสียหายตามสเปกเมฆบัง
  - D01 Watch: ราคาลดลง 24% (เกินเกณฑ์ 20%) และผลผลิตเปลี่ยน 6.7% -> สถานะ `watch`
  - D01 Unknown: ทดสอบส่งราคา grain ประเทศ (TH) เข้าประเมินระดับจังหวัด (10) -> ปฏิเสธ fail-closed ทันทีด้วย `incompatible_spatial_grain` ป้องกันการปะปน grain ข้ามระดับ
- Crosswalk ผลผลิต DOAE จับคู่ชื่อภายใต้ parent hierarchy ได้ 50,101 จาก 50,103 records เหลือ 1 ชุดชื่อพื้นที่/2 records ที่ยังไม่ match ไม่เดารหัสแทน ใช้ DOPA snapshot2023 จึงยังไม่รับรอง boundary ของทุกช่วงเวลา
- Warehouse มีข้อมูลล่าสุด 20,469 แถว: ราคาประเทศ 7,657 ค่า, Unknown ราคา 1 เดือน, อากาศจุดตัวอย่าง 10,959 ค่า, รายงานอ่างเก็บน้ำขนาดกลาง RID 1,844 ค่า (22 ต.ค. 2026) และดาวเทียม MODIS NDVI/QA 8 ค่า (ณ จุดพิกัด 13.8, 100.25) ไม่มีการนับอ่างเก็บน้ำหรือจุดกริดเป็นข้อมูลจังหวัด
- NABC history raw 7,669 แถว: exact duplicates 10, conflict 1 เดือน/2 แถว ไม่มีการเลือกราคาใดแทนกัน ใช้ quality revision ค่า null; หลักฐาน `data/local/probes/monthly-price-backfill.json` และ `monthly-price-import.json`
- แก้ price IDs ที่เคยผูกกับค่าให้คง source/product/unit/month/area และเก็บค่าที่เปลี่ยนเป็น revision สำรองฐานเดิมก่อน migration; raw/export snapshots เก่าไม่ถูกแก้
- ลองนำเข้า archive ซ้ำผ่าน CLI แล้ว จำนวนแถวและ revisions ไม่เพิ่ม ทุกปีใช้ checkpoint ที่ตรวจ hash แล้ว
- Snapshot ภายในมี 20,469 แถว และ decision cards 5 ใบ พร้อม CSV/Parquet และ metadata `redistribution_allowed=false` ผล build ล่าสุดอยู่ใน `data/local/private-build.json` (`exports/private/20261022T104902Z-852c9ca1`)
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
