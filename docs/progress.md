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
| อากาศ ERA5 | 5 จุดภูมิภาคเกษตรไทย / จุดละ 3,653 วัน ปี 2016 ถึง 2025 / 3 ตัวแปร | ดึงจริง 50 partitions (นครปฐม, เชียงใหม่, ขอนแก่น, อุบลฯ, สุราษฎร์ฯ) รวม 54,795 observations; คำนวณ 10-year percentile รายจุดได้ |
| น้ำ RID อ่างเก็บน้ำขนาดกลาง | 461 อ่าง × 14 วันต่อเนื่อง (9–22 ต.ค. 2569) รวม 25,816 observations | ความจุ, dead storage, ปริมาตรน้ำ, %น้ำ; percent calibration mismatch = 0; spatial_support=reservoir; สิทธิ์ pending |
| ดาวเทียม MODIS NDVI/QA | 28 observations (5 จุดภูมิภาคเกษตรไทย 2024-09-29 และ 2026-09-30) | ดึงและ normalize ผ่าน Planetary Computer ณ 5 จุดพิกัดเดียวกับ ERA5; scale 0.0001; cloud flags; spatial_support=grid_point; สิทธิ์ pending |
| Data quality + revision | unittest + JSON schemas | รันได้; ข้อมูลขาดเป็น null; รองรับ spatial_support=reservoir และ grid_point |
| Coverage 77 × 20 | export CSV | พร้อมสถานะ UNVERIFIED (1,232 provider×province entries); ไม่มีการแต่งข้อมูล |
| Decision workflows น้ำ/ตลาด | CLI + 8 real evidence cards + tests | ผ่านการทดสอบ ครอบคลุม 4 ภูมิภาคหลัก (D01 watch/unknown, D02 watch/normal/unknown รวม 8 cards) |
| Forecast/backtest | release-aware daily baselines/tests | prototype; ยังไม่มี forecast ปฏิบัติงาน |
| Power BI | local PBIP v8: 12 ตาราง/15 relationships/35 measures/ร่าง 5 หน้า | schema 21 files / hashes 34 files / TOM 19.114.12 ผ่าน 100%; แก้ crash Desktop `version.json`; ร่างเก่าจัดเก็บใน archive/ |
| ทะเบียนสิทธิ์ราย resource | config/resource_licenses.json + docs/source-license-register.md | ตรวจ 8 ชุดพร้อมหลักฐาน ทุกชุดยัง pending (รวม MODIS ผ่าน Planetary Computer) |
| GitHub Actions | workflows สองชุด | CI และ catalog probe ผ่านจริง; schedule รายสัปดาห์ |

## ผลตรวจรับฐานระบบ

- Tests 119 รายการผ่าน ครอบคลุม schema, missing/zero, native price units, fixed IDs/revisions, conflict quarantine, transaction rollback, ข้อมูลอนาคต, ปฏิทินไทย, coverage, TLS, staging, snapshot integrity, model keys, schema cache, no-network resume, RID reservoirs contract/idempotence, MODIS satellite NDVI/QA normalization/idempotence, decision workflows (D01/D02 fail-closed, spatial mismatch, cloud-safety) และ PBIR `version.json` metadata
- Warehouse ใน `data/local/tadih.duckdb` มีข้อมูลล่าสุด **88,293 แถว** (revision 88,301 แถว ขนาดเพียง 45 MB): ราคาประเทศ 7,658 ค่า, อากาศ 5 ภูมิภาค 54,795 ค่า, อ่างเก็บน้ำ RID 461 แห่ง 14 วัน 25,816 ค่า และดาวเทียม MODIS 5 ภูมิภาค 28 ค่า
- Decision Workflows D01 (ตลาด/ผลผลิต) และ D02 (น้ำ/ภัยพิบัติ) ขยายทดสอบกับ evidence จริงครบ 8 cards ครอบคลุม 4 ภูมิภาค:
  - D02 Watch (กทม./ปริมณฑล): ฝน percentile 0.10 + ฟ้าเปิด NDVI 0.6737 + ระดับน้ำ 2.45m -> `watch`
  - D02 Normal (กทม./ปริมณฑล): ฝน percentile 0.65 -> `normal`
  - D02 Normal (เชียงใหม่ เหนือ): ฝน percentile 0.40 + ฟ้าเปิด NDVI 0.5125 (valid 1.0) -> `normal`
  - D02 Normal (สุราษฎร์ธานี ใต้): ฝน percentile 0.90 + ฟ้าเปิด NDVI 0.3217 -> `normal`
  - D02 Unknown (กทม./ปริมณฑล): เมฆบัง (valid fraction 0.0) -> `unknown`
  - D02 Unknown (ขอนแก่น อีสานบน): เมฆบัง (valid fraction 0.0) -> `unknown` ปฏิเสธประเมินความเสียหายตามสเปกเมฆบัง
  - D01 Watch: ราคาลดลง 24% และผลผลิตเปลี่ยน 6.7% -> `watch`
  - D01 Unknown: ส่งราคา grain ประเทศ (TH) เข้าประเมินระดับจังหวัด (10) -> ปฏิเสธ fail-closed `incompatible_spatial_grain` ป้องกันการปะปน grain ข้ามระดับ
- Crosswalk ผลผลิต DOAE จับคู่ชื่อภายใต้ parent hierarchy ได้ 50,101 จาก 50,103 records เหลือ 1 ชุดชื่อพื้นที่/2 records ที่ยังไม่ match ไม่เดารหัสแทน ใช้ DOPA snapshot2023 จึงยังไม่รับรอง boundary ของทุกช่วงเวลา
- Snapshot ภายในมี 88,293 แถว และ decision cards 8 ใบ พร้อม CSV/Parquet และ metadata `redistribution_allowed=false` ผล build ล่าสุดอยู่ใน `data/local/private-build.json` (`exports/private/20261022T114836Z-409364b9`)
- Snapshot สาธารณะมีข้อมูลวัด 0 แถว เพราะสิทธิ์ resource ยัง pending ผล build ล่าสุดอยู่ใน `data/local/public-build.json` (`exports/public/20261022T114949Z-1eb57f80`)
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
