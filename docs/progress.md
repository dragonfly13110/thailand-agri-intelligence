# สถานะโครงการ 22 ตุลาคม 2569

## ความคืบหน้าล่าสุด (22 ต.ค. 2569 เวลา 23:28 Asia/Bangkok)

ตรวจรวม 142 tests ผ่าน; pip check ผ่าน. DuckDB warehouse 141,699 latest observations จาก 5 แหล่งข้อมูล (DOAE, ERA5, RID, OAE, MODIS).

- **Resource License Register (B1):** ขยายทะเบียนสิทธิ์ราย resource ใน `config/resource_licenses.json` และ `docs/source-license-register.md` เพิ่ม 4 ทรัพยากรใหม่ (LDD rice zoning, DOF aquatic production, DLD livestock value, DOAE perennial crops 2566) รวมเป็น 12 resources ตรวจครบถ้วน; ทุกชุดคงสถานะ `pending` ซื่อสัตย์ตามข้อเท็จจริง; เพิ่มฟังก์ชัน `tadih.catalog.load_resource_licenses` และ unit test ใน `tests/test_catalog.py` ผ่าน 100%
- **Scheduled Price Refresh:** เพิ่ม `scripts/refresh_prices.ps1` ติดตั้ง Windows Task Scheduler (`TADIH-Price-Refresh` ทุกวัน 07:15 Asia/Bangkok) พร้อม lock file `data/local/scheduled/refresh.lock`; ทดสอบ live run สำเร็จ (exit code 0, 7,658 price observations ingested, snapshots สร้างและ verify ครบ 8 ไฟล์ทั้ง private และ public); มี unit test `tests/test_refresh_script.py` ผ่าน
- **Daily Market-Price Staging:** เพิ่ม `src/tadih/daily_prices.py`, `tests/test_daily_prices.py` และ `docs/daily-prices.md`; ตัวอย่าง bounded request มะนาว ผลขนาดใหญ่พิเศษ ตลาดกลางหนองบ้วย จ.เพชรบุรี 100 แถว (บาท/ร้อยผล) คง spatial_support เป็น `market`, price_type เป็น null, release_at เป็น null, ไม่ rollup หรือเข้า warehouse ก่อนรีวิวความหมายสิทธิ์
- **Weekly Native Price Staging:** เพิ่ม `src/tadih/weekly_prices.py`, `tests/test_weekly_prices.py` และ `docs/weekly-prices.md`; ตัวอย่าง กระบือ ขนาดกลาง 42 แถว ปี 2569 หน่วย บาท/ตัว (TH00 ระดับประเทศ) คงรหัสสัปดาห์ 1–5 และเดือน ไม่แปลงเป็นวันหรือ ISO week; เก็บ revisions ครบถ้วน ไม่เข้า warehouse
- **Commodity History Audit (B2 Part 1):** จัดทำ `docs/commodity-history-audit.md` และ unit test `test_historical_inventory_union_matches_2569` ใน `tests/test_commodities.py` ผ่าน 100%; พิสูจน์ทางคณิตศาสตร์จาก 16 annual snapshots (พ.ศ. 2554–2569) ว่า union ของชื่อสินค้าทุกปีมี 44 ชนิด เท่ากับ inventory ปี 2569 พอดี (ไม่มีสินค้าอดีตที่ตกหล่นหรือเลิกผลิต); 39 ชนิดมีครบ 16 ปี และ 5 ชนิดเป็นสินค้าที่เริ่มเก็บสถิติในภายหลัง (มันสำปะหลัง 25% ปี 2559, ไข่เป็ด 3 ขนาด ปี 2560, ปาล์มน้ำมัน ปี 2566) ทุกตัวมีประวัติต่อเนื่องไม่มี gap ภายใน
- **DOAE Perennial Staging Readiness Audit:** จัดทำ `docs/perennial-readiness.md`, `data/local/probes/perennial-readiness.json` และ `perennial-admin-crosswalk.csv`; ตรวจสอบพืชอายุยาว 2566 รวม 54,195 แถว: 54,186 แถว match กับ DOPA 2023, 6 แถว unmatched จากตำบลที่ติดเครื่องหมายยกเลิก, 3 แถวติด numeric quarantine จากค่าพื้นที่ติดลบ, 5 กลุ่ม repeated identities ที่มีค่าขัดแย้ง; คงสถานะ staging/quarantine ไม่ aggregate หรือนำเข้า warehouse


## Pipeline และข้อมูลเพิ่มเติม 22 ต.ค. 2569

ตรวจรวม 136 tests ผ่าน; pip check/diff check ผ่าน. หลักฐาน data/local/probes/pipeline-cycle-tests.log และ price-pipeline-lineage.json.

- เพิ่ม `price-pipeline --year-th 2569` ครบ capture/checkpoint → normalize/quarantine → ingest → internal/public export → verify พร้อม failure report และ immutable raw checksums ใน data/local/runs/. Live resume สองรอบผ่าน: fetched 0, added revisions 0, public 0. Transaction ต่อสินค้า รอบที่ล้มอาจมีสินค้าก่อนหน้าบันทึกแล้ว; ยังไม่ใช่ scheduled refresh ทุกแหล่งหรือหลักฐาน14วัน. ดู docs/runbook.md
- LDD rice zoning ดึงครบ77ชื่อจังหวัด×4ระดับ=308ค่า พร้อมเทียบ CSV/datastore ตรงกัน แต่ unit/year ยัง null, province mapping unresolved, pending และไม่ warehouse. CLI `ldd-rice-zoning`; docs/source-expansion-ldd.md
- DOAE พืชอายุยาว2566 โครงสร้างรายปีแยกจากพืชอายุสั้น: 54,195 source → 54,192 staged + quarantine3แถวค่าพื้นที่ติดลบ; พบ5 repeated grain identities. 77จังหวัด/264 commodity identities. CLI `doae-perennial`; docs/production-perennial.md. ไม่รวมยอด/เข้าwarehouseจนกว่าจะตรวจครบ
- ตรวจช่องว่างราคากับ annual endpoint แบบจำกัด6requests: 77จาก221เดือนยังไม่พบใน annual responses ที่ตรวจ อีก144เดือนยังไม่ตรวจ; conflict ต.ค.2012ยังมี2ค่าต่างกันจึงคง quarantine. docs/price-gap-verification.md


## งานขนานต่อเนื่อง 22 ต.ค. 2569

DOF staging เพิ่มแล้ว: `python -m tadih dof-production` ดึงจริง 540 ค่า (27 ปี พ.ศ.2541–2567 × 10 กลุ่ม × ปริมาณ/มูลค่า) หน่วยพันตันและล้านบาทตาม metadata แยก total ไม่บวกซ้ำ ยัง pending และไม่ import warehouse. ดู docs/source-expansion-dof.md และ data/local/probes/dof-staging-cli.json. Full unittest หลังรวมงาน agents ผ่าน 131 tests (data/local/probes/parallel-final-tests.log).


- Agents ตรวจ source expansion, release lineage และ pipeline/price readiness; เอกสารใหม่ docs/data-lineage-review.md, docs/source-expansion-dld.md และ docs/price-history-readiness.md
- DLD staging-only: `python -m tadih dld-livestock-value` ดึงจริง 35 แถวระดับประเทศ ปี 2562–2568 หน่วยล้านบาท เก็บ pending และยังไม่นำเข้าฐานหลักเพราะนิยามปี/release ไม่ยืนยัน; หลักฐาน data/local/probes/dld-staging-cli.json
- ตรวจ metadata สิทธิ์ราคา OAE ราย resource เพิ่มเป็น 12 ชุด และหลักฐาน 24 responses. DOAE declared release calendars ยังไม่ผูกกับ current revision จึงคง release null
- Price readiness: 44 series; 6 series มีเดือนขาดภายใน min/max รวม 221 เดือน. Pagination ครบไม่เท่ากับประวัติครบ; known release เป็น 0 จึงยังไม่รับรอง historical as-of forecast
- Coverage เปลี่ยนเป็นดัชนีรอบเดียว เลิกข้อความอ้างจำนวนแถวตายตัว; live build 141,699 แถวใช้ 5.86 วินาที ตรวจ hash 8 artifacts และเทียบ coverage ทุกแถวผ่าน. หลักฐาน data/local/probes/indexed-export.json; snapshot exports/private/20261022T151043Z-cc438e07
- ทดสอบสำเนาฐานในเครื่องเปิด read-only ได้ 141,699 แถวและ SHA-256 ตรงกัน: data/local/probes/local-restore-check.json. ยังไม่ใช่ backup นอกเครื่องตาม D3
- เพิ่ม regression COPY Unicode/null/idempotency/rollback และแก้ NDVI invalid ไม่ถูกนับ valid pixel. ยังไม่รับรองสิทธิ์/นิยามเดือน DOAE/BI runtime


งานข้อมูลใน checkout `D:\code\thailand-agri-intelligence` วันที่ 22 ต.ค. 2569: ดึง raw/checkpoints ใหม่ใน `data/local/` และแก้การรวม DOAE ให้คงเดือนกับรอบปลูกตามต้นทาง (10,682 กลุ่ม); ราคา historical names ปี 2554–2569 รวม 44 ชื่อ, daily master 41, weekly 44, production 5 กลุ่ม, MOC ยัง unreachable. MODIS คงวันเผยแพร่เป็น null ตามหลักฐานที่มี. บันทึกผลและข้อจำกัดใน [HANDOFF.md](../HANDOFF.md) และไฟล์ `data/local/probes/`; งดงาน BI ตามคำสั่งล่าสุด

ผลตรวจในเครื่องนี้: DuckDB 141,699 latest observations จาก 5 แหล่ง (DOAE 53,410; ERA5 54,795; RID 25,816; OAE 7,658; MODIS 20) ตรวจ 113 raw checkpoints และ 122 unit tests ผ่าน. ชุดภายใน `exports/private/20261022T145736Z-cf1e49b9` มี 141,699 แถว ชุด public `exports/public/20261022T145919Z-dfea41a7` มี 0 แถว เพราะสิทธิ์ยัง pending; ตรวจ hash 8 ไฟล์ต่อชุดแล้ว. หลักฐาน `data/local/probes/warehouse-audit.json`, `checkpoint-verification.json`, `snapshot-verification.json`. ยังต้องตรวจนิยามเดือน DOAE และวันเผยแพร่ก่อนใช้พยากรณ์ย้อนหลัง

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
| ผลผลิต DOAE | 50,103 records staging -> source-period spatial aggregates 10,682 กลุ่มใน checkout ปัจจุบัน (6,696 กลุ่มเป็นรุ่นรวมปีเครื่องเดิม) (50,101 แถว matched, 2 แถว unmatched บางบอน แยก audit ชัดเจน ไม่เดารหัส); ตัวเลข ingest 20,851 observations เป็นฐานเก่า | ผ่านการทดสอบ; คำนวณ weighted yield (sum(production)/sum(harvested)) ห้าม average |
| พื้นที่ระดับย่อย | DOPA snapshot2023:928 อำเภอ/7,436 ตำบล, retired1,584 | แยก active/retired; ไม่อ้าง current2026 |
| Commodity inventory NABC | ปี2569:raw387/unique376/duplicates11; 44 identities/4pages | normalize แล้ว; product histories 44 captures; taxonomy ข้าม provider ยังไม่ทำ |
| อากาศ ERA5 | 5 จุดภูมิภาคเกษตรไทย / จุดละ 3,653 วัน ปี 2016 ถึง 2025 / 3 ตัวแปร | ดึงจริง 50 partitions (นครปฐม, เชียงใหม่, ขอนแก่น, อุบลฯ, สุราษฎร์ฯ) รวม 54,795 observations; คำนวณ 10-year percentile รายจุดได้ |
| น้ำ RID อ่างเก็บน้ำขนาดกลาง | 461 อ่าง × 14 วันต่อเนื่อง (9–22 ต.ค. 2569) รวม 25,816 observations | ความจุ, dead storage, ปริมาตรน้ำ, %น้ำ; percent calibration mismatch = 0; spatial_support=reservoir; สิทธิ์ pending |
| ดาวเทียม MODIS NDVI/QA | 28 observations (5 จุดภูมิภาคเกษตรไทย 2024-09-29 และ 2026-09-30) | ดึงและ normalize ผ่าน Planetary Computer ณ 5 จุดพิกัดเดียวกับ ERA5; scale 0.0001; cloud flags; spatial_support=grid_point; สิทธิ์ pending |
| Data quality + revision | unittest + JSON schemas | รันได้; ข้อมูลขาดเป็น null; รองรับ spatial_support=reservoir และ grid_point |
| Coverage 77 × 20 | export CSV พร้อมสัญญา coverage.schema.json | รองรับ USABLE_QUALITY_FLAGS, missing reason ซื่อสัตย์ราย resource, DOAE 77 จังหวัด AVAILABLE ในรอบปี 2023-12 |
| Decision workflows น้ำ/ตลาด | CLI + 8 real evidence cards + tests | ผ่านการทดสอบ ครอบคลุม 4 ภูมิภาคหลัก (D01 watch/unknown, D02 watch/normal/unknown รวม 8 cards) |
| Forecast/backtest | release-aware daily baselines/tests | prototype; ยังไม่มี forecast ปฏิบัติงาน |
| Power BI | local PBIP offline-v10: 12 ตาราง/15 relationships/35 measures/109,144 fact rows | schema 21 files / hashes 34 files / TOM 19.114.12 ผ่าน 100%; ร่างเก่าจัดเก็บใน archive/ |
| ทะเบียนสิทธิ์ราย resource | config/resource_licenses.json + docs/source-license-register.md | ตรวจ 8 ชุดพร้อมหลักฐาน ทุกชุดยัง pending (รวม MODIS ผ่าน Planetary Computer) |
| GitHub Actions | workflows สองชุด | CI และ catalog probe ผ่านจริง; schedule รายสัปดาห์ |

## ผลตรวจรับฐานระบบ

- Tests 121 รายการผ่าน ครอบคลุม schema, missing/zero, native price units, fixed IDs/revisions, conflict quarantine, transaction rollback, ข้อมูลอนาคต, ปฏิทินไทย, coverage, TLS, staging, snapshot integrity, model keys, schema cache, no-network resume, RID reservoirs contract/idempotence, MODIS satellite NDVI/QA normalization/idempotence, decision workflows (D01/D02 fail-closed, spatial mismatch, cloud-safety), PBIR `version.json` metadata, DOAE provincial gold aggregation (weighted yield, unmatched isolation) และ B4 coverage inventory verification
- Warehouse บนเครื่องเดิมเคยมีข้อมูล **109,144 แถว** (revision 109,148 แถว ขนาดเพียง 44.76 MB): ราคาประเทศ 7,658 ค่า, อากาศ 5 ภูมิภาค 54,795 ค่า, อ่างเก็บน้ำ RID 461 แห่ง 14 วัน 25,816 ค่า, ดาวเทียม MODIS 5 ภูมิภาค 24 ค่า และผลผลิตและพื้นที่ระดับจังหวัด DOAE 20,851 ค่า (77 จังหวัด)
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
- Snapshot ภายในจากเครื่องเดิมมี 88,293 แถว และ decision cards 8 ใบ พร้อม CSV/Parquet และ metadata `redistribution_allowed=false` ผล build ล่าสุดอยู่ใน `data/local/private-build.json` (`exports/private/20261022T114836Z-409364b9`)
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
