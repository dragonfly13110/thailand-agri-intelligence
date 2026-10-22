# เช็กลิสต์และเอกสารส่งต่องาน TADIH

อัปเดต 22 ตุลาคม 2569 (Asia/Bangkok) จากไฟล์และผลรันในเครื่องนี้

## อ่านตรงนี้ก่อนเริ่ม

โครงการอยู่ระหว่างพัฒนา Thailand Core มี pipeline ที่รันได้ ข้อมูลจริงบางชุด และ Power BI Project ร่างในเครื่อง ยังไม่ผ่านเกณฑ์จบโครงการตามสเปก v1.4 และยังไม่มีรายงานพร้อมใช้งานครบประเทศ

คำสั่งล่าสุดของเจ้าของงาน: **ดึงและเตรียมข้อมูล ทำโมเดล ความสัมพันธ์ Power Query และ DAX ในเครื่องก่อน ตรวจผล แล้วค่อยอัปโหลด Power BI Online เมื่อพร้อม** หยุดการจัด visual ผ่าน browser ไว้แล้ว

- Workspace: `T:\coding+\BI AGRI THAILAND`
- สเปกหลัก: [Thailand First v1.4](Thailand_Agricultural_Decision_Intelligence_Hub_Thailand_First_v1.4_2026.md) ให้ยึด PART IV เป็นลำดับแรก และคงข้อกำหนด historical/forecast ของ PART III
- Repository: [dragonfly13110/thailand-agri-intelligence](https://github.com/dragonfly13110/thailand-agri-intelligence), public ตามที่เจ้าของงานอนุมัติ เก็บเฉพาะโค้ดและข้อมูลที่อนุญาตเผยแพร่
- Commit ล่าสุดที่เผยแพร่ก่อนเอกสารนี้: `5dcf130` ไม่รวมงาน PBIP/crosswalk และเอกสารล่าสุดที่ยังอยู่ใน working tree
- Python: `.venv/Scripts/python.exe` รุ่น 3.14 ในเครื่องนี้; CI ใช้ 3.12; package ติดตั้งแบบ editable
- ข้อมูล raw, DuckDB, exports ภายใน, SDK และ PBIP ที่มีข้อมูลจริง **ถูก gitignore** การ clone repository อย่างเดียวไม่ได้ข้อมูลเหล่านี้กลับมา
- Agent ที่เคยติด usage limit กลับมาทำงานต่อได้แล้ว: geography_registry ส่งทะเบียนสิทธิ์ 6 resources, ingestion ส่ง price backfill และ tests งานที่ระบุในเอกสารนี้เป็นผลที่ส่งคืนแล้ว ไม่ต้องรอ agent ค้าง

เครื่องหมาย `[x]` หมายถึงเสร็จเฉพาะขอบเขตที่บรรทัดนั้นระบุ `[ ]` หมายถึงยังไม่ผ่านเกณฑ์นั้น คำว่า prototype/ร่างไม่ใช่งานพร้อมใช้งานจริง

## 1. มีไฟล์อะไรแล้ว

| ไฟล์/โฟลเดอร์ | ใช้ทำอะไร | สถานะ |
|---|---|---|
| `README.md` | ติดตั้งและคำสั่งเริ่มต้น | มีแล้ว |
| `config/provinces.csv` | รหัสและชื่อ 77 จังหวัด | ตรวจแล้ว; geometry แยกต่างหาก |
| `config/sources.json`, `categories.json` | registry 15 providers และ 20 หมวด | ไม่ได้แปลว่าเชื่อมข้อมูลครบ 15 แหล่ง |
| `config/commodity_sources.json`, `resource_licenses.json` | endpoints รายการสินค้าและทะเบียนสิทธิ์ราย resource | 6 resources ตรวจแล้วแต่ยัง pending; บาง endpoint ยังต้องตรวจ schema จริง |
| `config/thresholds.json`, `models.json` | เกณฑ์ทดลองและ baseline models | provisional ไม่ใช่เกณฑ์ทางราชการ |
| `data_contracts/*.schema.json` | 7 contracts: observation, coverage, geography, price, production, risk, forecast | มี schema/tests |
| `src/tadih/ingestion.py`, `transform.py` | CKAN, ราคา OAE, weather, backfill/checkpoint, normalize | ใช้งานกับชุดตัวอย่างจริงแล้ว |
| `src/tadih/production.py`, `commodities.py` | staging ผลผลิตและรายการสินค้าจากต้นทาง | ไม่รวมสินค้าข้าม provider ด้วยชื่ออย่างเดียว |
| `src/tadih/prices.py`, `price_backfill.py` | ประวัติราคา 44 สินค้า, fixed IDs, native units และ quarantine | รันรับข้อมูลจริงและ reimport แล้ว |
| `src/tadih/geography.py` | DOPA hierarchy, ตรวจ polygon จังหวัด, crosswalk ชื่อภายใต้ parent | มีแล้ว; รุ่นรหัสปี 2023 |
| `src/tadih/warehouse.py`, `quality.py`, `publish.py` | validate/revisions, DuckDB, exports และ SHA-256 | มี tests และรันจริง |
| `src/tadih/decisions.py`, `forecast.py` | 2 decision rules, daily baseline/backtest และ gates | prototype; ยังไม่รับรองผลกับ evidence จริงครบ |
| `src/tadih/local_project.py`, `cli.py` | สร้าง PBIP, ตาราง, relationships และรายงานร่าง 5 หน้าในเครื่อง | สร้างไฟล์จริงแล้ว |
| `powerbi/measures.dax` | 26 measures รวม coverage/ราคา/อากาศ/ผลผลิตที่มีข้อจำกัด | descriptive price รับ release_unknown แต่ forecast ยังไม่ผ่าน |
| `powerbi/queries.pq`, `theme.json`, `README.md` | M handoff แบบเดิม, theme และคำอธิบายโมเดล | generated PBIP มี M partitions ของตัวเอง |
| `scripts/validate_powerbi_project.py` | ตรวจ hash และ Microsoft JSON schemas ของ PBIP/PBIR | ผ่านกับร่างปัจจุบัน |
| `scripts/validate_powerbi_model.ps1` | TOM deserialize และ TMDL round trip | ผ่าน; ไม่ใช่การทดสอบ DAX/Refresh |
| `tests/` | Python unit/integration/regression tests | ล่าสุด 101 tests ผ่าน |
| `.github/workflows/ci.yml`, `discover-sources.yml` | CI และ weekly catalog probe | มีผลรันสำเร็จ; ยังไม่ครบ 14 วัน |
| `docs/` | วิธี ingestion, production, geography, commodities, methodology, runbook, source registry, progress | อ่านตามส่วนที่จะแก้ |

## 2. ข้อมูลจริงที่เก็บแล้ว

| ชุดข้อมูล | จำนวน/ช่วงเวลา | พาธและข้อจำกัด |
|---|---|---|
| Warehouse | 18,617 observations ล่าสุด | `data/local/tadih.duckdb`; ราคา 7,657 ค่า + Unknown ราคา 1 เดือน + อากาศ 10,959 ค่า |
| ประวัติราคา OAE/NABC | 44 สินค้า ช่วงรวม ม.ค. 2011 ถึง ก.ย. 2026 | สินค้าละ 40–189 เดือน; ระดับประเทศ; `release_at` ยังไม่ทราบ; ห้ามกระจายลงจังหวัด |
| ERA5/Open-Meteo | 3,653 วัน ปี 2016–2025 × 3 ตัวแปร | จุด 13.8,100.25; ฝน, Tmax, ET0; เป็น reanalysis จุดกริด ไม่ใช่ค่าเฉลี่ยจังหวัด |
| DOAE production | 50,103 records, 77 ชื่อจังหวัด, 537 commodity identities | `data/local/production/staged/<source hash>/`; ปีในแถวมี 2023 และ 2024 แม้ชื่อไฟล์ระบุ 2023 |
| NABC monthly inventory | ปี พ.ศ. 2569: raw 387 / unique 376 / exact duplicates 11, 44 identities | นำเข้าแล้ว; page completion ไม่ยืนยันว่าเดือน/สินค้าครบ |
| NABC product histories | raw 7,669, valid 7,657, duplicate 10, conflict 1 เดือน/2 แถว; 44 captures ครบตาม pagination | `data/local/probes/monthly-price-backfill.json`, `monthly-price-import.json`; raw อยู่ partition monthly-product; ไม่ถือว่าครบทุกสินค้าในอดีต |
| DOPA hierarchy | active 77 จังหวัด + 928 อำเภอ/เขต + 7,436 ตำบล/แขวง; retired 1,584 | `data/local/geography/dopa_ccaatt.xlsx`; source snapshot **2023-09-01** ไม่ใช่ master ปัจจุบันปี 2026 |
| DDPM province geometry | GeoJSON 77 จังหวัด | `data/local/geography/ddpm_province.geojson`; simplified display polygons, ยังไม่ตรวจ topology/zonal statistics/สิทธิ์ |
| DOAE admin crosswalk | match 50,101/50,103 records | `data/local/production/admin_crosswalk.csv`, `crosswalk-result.json`; temporal boundary ยังไม่รับรอง |
| Weather forecast sample | 22–28 ต.ค. 2026 | raw แยกใน `data/local/raw/`; ไม่ทราบ issue time ที่ยืนยันได้ ไม่เข้า observations/backtest |
| Internal export | 18,617 observations พร้อม CSV/Parquet | ดูพาธใน `data/local/private-build.json`; `redistribution_allowed=false` |
| Public export | observations 0 แถว | ดู `data/local/public-build.json`; สิทธิ์ข้อมูลจริงยัง pending จึงไม่ออกสาธารณะ |
| Public coverage view | 1,155 provider×province entries | `exports/public/small/coverage.csv`; เป็น metadata `UNVERIFIED` ไม่ใช่ข้อมูลวัด |

รายการที่ match ไม่ได้คือ กรุงเทพฯ / เขตบางบอน / `บางบอน*` จำนวน 2 records เก็บไว้ ไม่เดารหัสตำบลหรือโอนยอดไปตำบลใหม่

ราคา conflicting คือข้าวเปลือกเจ้า ความชื้น 15 เดือนตุลาคม 2012 ต้นทางให้สองค่าต่างกัน ไม่มี release ordering จึงเก็บ raw ทั้งคู่และสร้าง quality revision ค่า null/Unknown เพื่อไม่ให้ค่าเก่ารอดเป็นค่าปัจจุบัน การปลด quarantine ต้องมีหลักฐานยืนยันและ quality-resolution revision ใหม่ ดู docs/commodities.md

แก้ legacy observation ID ของข้าวที่เคยผูกกับค่าราคาแล้ว ตอนนี้ source/product/unit/month/area คงที่ ส่วนค่าที่เปลี่ยนเป็น revision สำรองฐานเดิมไว้ใน `data/local/backups/` ก่อนเปลี่ยน หลักฐานและพาธสำรองอยู่ `data/local/verification/price-identity-migration-2026-10-22.json` raw และ immutable exports เก่าไม่ถูกแก้

แหล่งหลักฐานเพิ่มเติม: `data/local/probes/`, `data/local/production/cli-result.json`, `data/local/geography/cli-result.json` และ manifests ในแต่ละ staging/raw partition ห้ามเติมค่าว่างเป็น 0 หรือสรุปว่า provider ไม่เผยแพร่จากการที่ยังดึงไม่ได้

## 3. Power BI ที่ทำถึงแล้ว

เปิดโครงการร่างล่าสุดจาก `data/local/powerbi/offline-v4/TADIH.pbip` และดู manifest ล่าสุดที่ `data/local/powerbi/latest-build.json` โครงการนี้ใช้ข้อมูลภายในที่ยังไม่อนุมัติเผยแพร่ จึงยังไม่พร้อมนำขึ้น Online รุ่น offline-v1 เก็บไว้เป็นประวัติ ไม่แก้ทับ

- [x] สร้าง `TADIH.SemanticModel/model.bim` และ `definition.pbism`
- [x] สร้าง M parameter `ExportFolder` กับ CSV reader ที่ระบุชนิดข้อมูลและเก็บ missing เป็น null
- [x] สร้าง 12 ตาราง: dim_area, dim_source, dim_category, dim_period, dim_admin_area, dim_commodity, fact_observation, fact_data_coverage, fact_category_coverage, fact_production_source, decision_cards, snapshot_metadata
- [x] สร้าง 15 relationships แบบ filter ทิศเดียว ตรวจ dimension keys ไม่ซ้ำและ foreign keys ที่ไม่ว่างมีปลายทาง
- [x] นำ 26 DAX measures เข้า model source; ปิด implicit SUM ของคอลัมน์ตัวเลข แยก native price unit กับ THB/kg และไม่ซ่อนราคา descriptive เพียงเพราะยังไม่รู้ release date
- [x] สร้าง PBIR ร่าง 5 หน้า: Situation Room, Crop/Price, Water, Satellite, Forecast/Decision Audit
- [x] ตรวจ SHA-256 ครบ 32 project files และ Microsoft JSON schemas ผ่าน 19 metadata files
- [x] TOM SDK 19.114.12 deserialize และ TMDL round trip ผ่าน: 12 tables / 15 relationships / 26 measures
- [ ] เปิด PBIP และ Refresh ใน Power BI Desktop จริง
- [ ] Execute DAX ใน engine แล้วเทียบผลกับข้อมูลต้นทาง รวม filter context/blank/zero/เดือนก่อน
- [ ] ตรวจภาพ ภาษาไทย การเข้าถึงบนมือถือ และการใช้งานจริง
- [ ] เพิ่ม slicers, drill-through, charts, source tooltips, map และรายละเอียด UX ตามสเปก ขณะนี้ visuals เป็นตารางพื้นฐาน
- [ ] ทำ Satellite จากข้อมูลจริง ปัจจุบันหน้านี้แสดง unknown โดยตั้งใจ
- [ ] เชื่อม evidence น้ำ/ราคา/ผลผลิตครบและแสดง scorecard จริง ปัจจุบัน forecast suppressed
- [ ] ตรวจสิทธิ์ การแชร์ refresh และข้อมูลที่จะเผยแพร่ ก่อนนำขึ้น Online

`dim_commodity` ในร่างมี 581 identities: DOAE 537 + ราคา OAE 44 ไม่ใช่ taxonomy กลางที่รวมสินค้าเทียบกันแล้ว ผลผลิตยัง `rollup_eligible=false`; measure `Reviewed Production kg` ตั้งเป็น BLANK จนกว่าจะตรวจ grain/admin/time/completeness

`model.bim` และ `definition/` แบบ TMDL เป็นทางเลือกกัน อย่าใส่ทั้งสองใน semantic-model folder เดียวกัน โฟลเดอร์ `data/local/powerbi/offline-v4-tmdl-check/` เป็นผลตรวจแยก ไม่ใช่โมเดลอีกชุดที่ต้อง publish

บน Online เคยสร้าง prototype ชื่อ `TADIH Coverage 77 Provinces` จาก metadata สาธารณะไว้ก่อนเจ้าของงานเปลี่ยนวิธีทำ ยังไม่ใช่รายงานปลายทาง ไม่มีข้อมูลวัดสิทธิ์ pending ที่ส่งขึ้นจากชุด local นี้ อย่าเริ่มจัด visual บน browser ต่อหรือทับ prototype ระหว่างเตรียมข้อมูล

## 4. เช็กลิสต์งานรวมและลำดับทำต่อ

### A. สิ่งที่พิสูจน์แล้วในขอบเขตฐานระบบ

- [x] รหัส/ชื่อจังหวัด 77 แห่งพร้อม source registry และ coverage schema
- [x] รับ metadata DOAE/OAE ผ่าน catalog จริงแบบแบ่งหน้า
- [x] รับประวัติราคา 44 series ตาม inventory ปี 2569, อากาศจุดตัวอย่าง 10 ปี และผลผลิตไฟล์ DOAE เต็ม
- [x] ตรวจสิทธิ์ราย resource 6 ชุดและบันทึกหลักฐาน; ทุกชุดยัง pending ไม่มีการอนุมัติเผยแพร่
- [x] แยก duplicate/conflicting prices และทดสอบ revision/รีรันไม่เพิ่มแถวซ้ำ
- [x] เก็บ raw hashes/checkpoints, missing, source grain และ revisions
- [x] แยก public/internal exports และไม่ปล่อย pending data ใน public CI
- [x] มี decision/forecast prototype ที่คืน unknown หรือ suppress เมื่อหลักฐานไม่พอ
- [x] สร้าง Power BI source project ในเครื่องและตรวจโครงสร้างได้

### B. ทำต่อก่อนรับรองข้อมูล/โมเดล

- [ ] **B1 สิทธิ์และเวลาเผยแพร่:** ปิดเงื่อนไขที่ยังค้างในทะเบียน 6 resources และเพิ่มสิทธิ์รายสินค้า/endpoint ที่ยังไม่ได้ตรวจ พร้อม historical earliest/latest; อย่าแก้ `pending` เป็น `approved_public` โดยไม่มีหลักฐาน
- [ ] **B2 สินค้าและราคา:** monthly 44 histories normalize แล้ว; ยังต้องตรวจรายชื่อสินค้าในอดีตที่ไม่อยู่ใน inventory ปี 2569, daily/weekly/production, taxonomy ข้าม provider, release lineage และ conflict 1 เดือน; MOC เคย timeout ยังไม่ถือว่าเชื่อมสำเร็จ
- [ ] **B3 พื้นที่และผลผลิต:** ตรวจ 2 records บางบอนที่ยัง unmatched, รุ่นรหัสตามช่วงเวลา, ขอบเขตอำเภอ/ตำบล, duplicates/subtotals และความครบของค่าวัด ก่อนทำ provincial gold aggregates; ห้าม SUM ราคา/ผลผลิตเฉลี่ยข้าม grain
- [ ] **B4 Coverage จริง:** เปลี่ยนจาก provider readiness เป็น resource×geo×period×metric inventory พร้อมหลักฐาน expected/observed/missing reason; `UNVERIFIED` ไม่เท่ากับ `NOT_PUBLISHED`
- [ ] **B5 อากาศระดับประเทศ:** ขยายเก็บเฉพาะพื้นที่ไทยภายใต้สิทธิ์/โควตา ตรวจ polygon/version และ station-vs-grid แล้วคำนวณ zonal statistics; จุดเดียวที่มีอยู่ยังไม่ผ่านเป้าหมายทั่วประเทศ
- [ ] **B6 น้ำและดาวเทียม:** เชื่อม RID/สทนช. ที่รู้ station/datum/unit, NDVI/NDMI ที่มี crop/season baseline, cloud mask และ valid pixel fraction; ยังไม่มี ingestion จริงครบเส้นทาง
- [ ] **B7 หมวดอื่นตามสเปก:** พัฒนาข้อมูลดิน ภัยพิบัติ ปศุสัตว์ ประมง ต้นทุน/นโยบายตามลำดับ P1/P2 พร้อมนิยามพื้นที่และสิทธิ์ของแต่ละ source; registry อย่างเดียวไม่ใช่การเชื่อมสำเร็จ
- [ ] **B8 Decision workflows:** ทดสอบ D01 ตลาด/ผลผลิต และ D02 น้ำกับ evidence จริงที่เชื่อมเข้ากันได้ พร้อมบันทึกผลตรวจภาคสนาม/ย้อนหลัง
- [ ] **B9 Forecast:** จัดโมเดลให้ตรงความถี่ข้อมูลจริง สร้าง walk-forward backtest/seasonal naïve/scorecard/calibration; ห้ามเอาราคารายเดือนมาเติมเป็นรายวัน หรือใช้ retrieved_at แทน release_at/issue_at

### C. ตรวจ Power BI ในเครื่องแล้วจึงขึ้น Online

- [ ] **C1 Runtime:** เปิด PBIP, refresh ทุกตาราง, ตรวจชนิดข้อมูล/null และ relationships ใน Desktop รุ่นที่รองรับ project format
- [ ] **C2 DAX:** เทียบราคาต้นทาง/การเปลี่ยนเดือน/ฝน/จำนวนวัน และ context จังหวัด/สินค้า/source/เวลา; national/point series ต้องไม่กลายเป็นค่าเฉลี่ยจังหวัด; ทดสอบ wholesale/retail ต้องไม่เข้า farmgate และหน่วยต้องตรง context ของค่าราคา
- [ ] **C3 Report:** ทำรายงาน 5 หน้าให้ใช้ตัดสินใจได้ตามข้อ 49 ของสเปก พร้อม map/drill-down เท่าที่ข้อมูลมีจริงและแสดง quality/freshness/หน่วย/ที่มา
- [ ] **C4 Acceptance:** ตรวจผู้ใช้จริง mobile/accessibility/privacy/RLS ตามกลุ่มผู้ใช้ที่ตกลง และแยก Official/Observed/Estimated/Forecast/Scenario/Unknown
- [ ] **C5 Publish:** คัดชุดที่สิทธิ์ผ่านและ runtime ผ่านแล้วขึ้น Online ตั้ง refresh/credentials/gateway ตาม deployment จริง ทดสอบหลัง publish แล้วบันทึก workspace/model/report และวิธี rollback

### D. งานอัตโนมัติและการส่งมอบ

- [ ] **D1 Scheduled ingest:** ปัจจุบันมี weekly catalog probe เท่านั้น ต้องเพิ่ม refresh ข้อมูลจริงที่อนุญาต พร้อม request budget/retry/failure handling ที่ตรวจได้
- [ ] **D2 ต่อเนื่อง 14 วัน:** เก็บหลักฐานรันจริงและการจัดการ failure ครบ 14 วัน ผล CI สำเร็จครั้งเดียวไม่ใช่หลักฐานข้อนี้
- [ ] **D3 Backup/restore:** สำรอง DuckDB/raw/manifests/local PBIP ไปพื้นที่องค์กรที่อนุมัตินอก trial แล้วทดสอบ restore จริง; Git ไม่มีข้อมูล ignored เหล่านี้
- [ ] **D4 ส่งมอบ:** จัด data dictionary/source-license register/model scorecard/cost/quota/runbook ฉบับใช้งานจริง และทดสอบทำงานต่อโดยไม่พึ่ง Fabric trial
- [ ] **D5 Git:** review/diff/test แล้ว commit และ push งานล่าสุดที่อนุญาตเผยแพร่ ตอนเขียนเอกสารนี้ local project generator, crosswalk, DAX และเอกสารใหม่ยังไม่อยู่ใน remote commit `5dcf130`

ไม่กำหนดเปอร์เซ็นต์เสร็จทั้งโครงการจากจำนวนไฟล์หรือจำนวนแถว ให้ตรวจเกณฑ์ข้อ 46 และ 53 ของสเปกทีละข้อ

## 5. คำสั่งเริ่มต่อสำหรับ AI

ทำจาก workspace เดิมด้วย PowerShell อ่าน `git status` ก่อนแก้ อย่าทับงานค้างหรือดึงข้อมูลใหม่ซ้ำโดยไม่ตรวจ checkpoint

```powershell
Set-Location -LiteralPath 'T:\coding+\BI AGRI THAILAND'
git status --short
./.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -q
./.venv/Scripts/python.exe -m pip check
./.venv/Scripts/python.exe -m tadih status
./.venv/Scripts/python.exe -X utf8 scripts/validate_powerbi_project.py data/local/powerbi/offline-v4
```

Validator ใช้ schema cache ที่ `data/local/tools/schemas` หากย้ายเครื่องและไม่มี cache ให้ใช้ `--download-schemas` เพื่อรับ schemas จาก Microsoft ผ่าน HTTPS แล้วตรวจแบบ offline ซ้ำได้ SDK อยู่ `data/local/tools/tom/lib/net8.0` และไม่ได้อยู่ใน Git

ตรวจ model source ด้วย TOM โดยใช้ output directory ใหม่ที่ยังไม่มี:

```powershell
./scripts/validate_powerbi_model.ps1 `
  -Project data/local/powerbi/offline-v4 `
  -TomLibrary data/local/tools/tom/lib/net8.0 `
  -TmdlOutput data/local/powerbi/tmdl-check-next
```

วิธีสร้างร่างใหม่จาก snapshots เดิม ใช้ output directory ใหม่เสมอ ไม่ทับร่างที่แก้ใน Desktop แล้ว:

```powershell
$snapshotPath = (Get-Content data/local/private-build.json -Raw -Encoding utf8 | ConvertFrom-Json).snapshot
$productionHash = 'a505aa24d0706a162a1d56265cc61fb6ce33df8c9760dab414bf0ad01762e445'
./.venv/Scripts/python.exe -m tadih local-project $snapshotPath `
  "data/local/production/staged/$productionHash/inventory.json" `
  data/local/geography/dopa_ccaatt.xlsx `
  --output data/local/powerbi/offline-v5
```

`ExportFolder` ของ generated model เป็น absolute path ไป `Data/` ของร่างนั้น ย้ายโฟลเดอร์หรือเครื่องแล้วต้องแก้ parameter นี้ ผล build มี `build_manifest.json` เก็บ counts และ hashes; การแก้ไฟล์ใน Desktop ทำให้ hash เก่าต่างได้ ต้องเก็บต้นฉบับและสร้างหลักฐานตรวจใหม่ตามจริง

## 6. หลักฐานการตรวจและข้อจำกัดล่าสุด

- Python tests ล่าสุด: **101 ผ่าน**; `pip check` ผ่าน รวม regression สำหรับ schema cache, price identities, units, quarantine และ no-network resume
- Local PBIP: hashes 32 files และ Microsoft schemas 19 metadata files ผ่าน ขอบเขตนี้ไม่ execute M/DAX และไม่ render visual
- TOM SDK 19.114.12: model deserialize/TMDL round trip ผ่านซ้ำในรอบตรวจส่งต่องาน; ไม่มีการเปลี่ยน model source ระหว่างทำเอกสารนี้
- หลักฐานตรวจรอบนี้อยู่ใน `data/local/verification/handoff-2026-10-22.json` รวมผล tests, pip check, metadata validation, TOM และ snapshot verification ไฟล์นี้อยู่ในเครื่องและถูก gitignore
- Internal/public snapshot: ตรวจ hashes ครบ snapshot ละ 8 artifacts; 18,617 / 0 observation rows ตามลำดับ
- [CI ล่าสุดของ commit 5dcf130](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39746425920): success
- [Live catalog probe](https://github.com/dragonfly13110/thailand-agri-intelligence/actions/runs/39744139935): success ไม่ใช่การดึงข้อมูลครบทุก source
- Source `license_status` ของชุดจริงยัง pending, unknown timestamps คง null, forecast ยัง suppressed และไม่มีการตรวจ DAX runtime/Power BI rendering

ทุกครั้งที่ทำต่อ ให้แก้เช็กลิสต์นี้พร้อมหลักฐาน/พาธ/จำนวน tests และระบุขอบเขตที่ผ่าน อย่าติ๊กผ่านจากการมีโค้ดหรือไฟล์เพียงอย่างเดียว
