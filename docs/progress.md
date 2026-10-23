# สถานะโครงการ 23 ตุลาคม 2569

**เช็กลิสต์ปัจจุบันสำหรับ AI รับงานต่อ:** [HANDOFF.md](../HANDOFF.md) มีงานที่ตรวจแล้ว งานค้าง ลำดับถัดไป และคำสั่งเริ่ม ส่วนหัวข้อด้านล่างเป็นบันทึกผลแต่ละรอบตามเวลา อาจมี “งานต่อ” ที่ปิดไปแล้วในรอบใหม่

รอบเอกสารนี้ปรับ [README](../README.md), [AGENTS](../AGENTS.md), [runbook](runbook.md), [roadmap DOAE](doae-catalog-expansion.md) และ [คู่มือ Power BI](../powerbi/README.md) ให้ชี้เป้าหมายศูนย์ข้อมูลเกษตรทั้งประเทศและเช็กลิสต์เดียวกัน อ้างหลักฐาน acquisition/geography/cleanup ที่มีอยู่ ไม่ได้ดึงข้อมูลใหม่ นำเข้า warehouse เผยแพร่ หรือทดสอบ DAX เพิ่ม

## การชี้เป้าปัญหาเชิงพื้นที่ตามหลักฐานจริงและการจับคู่โครงการ (Spatial Evidence & Policy Intervention Matching) 23 ต.ค. 2569

- เพิ่มสัญญาข้อมูล `data_contracts/spatial_evidence.schema.json` รองรับมาตรฐาน JSON Schema draft-2020-12 สำหรับบัตรหลักฐานเชิงพื้นที่ (Spatial Evidence Cards)
- เพิ่มโมดูล `src/tadih/spatial_evidence.py`, สคริปต์ `scripts/audit_spatial_evidence.py` และ unit tests 5 รายการใน `tests/test_spatial_evidence.py` (ผ่านรวม 209 tests 100%)
- สกัดหลักฐานความเสียหายทางกายภาพจริงจากชุดข้อมูล DOAE P0:
  - **อุทกภัยจริง:** 1,832,840.42 ไร่ ครอบคลุม 60 จังหวัด (ในเขตชลประทาน 1.62 หมื่นไร่ 52 จังหวัด, นอกเขตชลประทาน 1.81 ล้านไร่ 59 จังหวัด เช่น ร้อยเอ็ด 1.67 แสนไร่, อุบลราชธานี 1.13 แสนไร่, ยโสธร 1.10 แสนไร่)
  - **ภัยแล้งจริง:** 16,696.79 ไร่ ใน 2 จังหวัด (สระบุรี 9,953.54 ไร่ และ บุรีรัมย์ 6,743.25 ไร่ นอกเขตชลประทาน)
  - **พื้นที่เสี่ยงขาดแคลนน้ำ:** ข้าวนาปีและพืชพื้นเมือง (บือวา) ใน จ.กระบี่ 867.00 ไร่
  - **การกักกันข้อมูล Mock:** ตรวจพบและคัดแยกข้อมูล mock Test (9,999,999,999 ไร่ ใน จ.ชลบุรี) ออกจากการวิเคราะห์โดยเด็ดขาด
- ผลการจำแนกสถานะมาตรการนโยบาย 77 จังหวัด:
  - **UNADDRESSED_GAP (46 จังหวัด):** พบความเสียหายจริงแต่ไม่มีโครงการเยียวยาภัยพิบัติเฉพาะพื้นที่รองรับ มีเพียงเงินอุดหนุนทั่วไปของรัฐ (เช่น บุรีรัมย์ สระบุรี ร้อยเอ็ด อุบลราชธานี ศรีสะเกษ นครราชสีมา)
  - **COVERED (12 จังหวัด):** อยู่ในเขตประกาศภัยพิบัติที่มีมาตรการเยียวยารองรับ (เช่น กทม. นนทบุรี ปทุมธานี อยุธยา ลพบุรี อ่างทอง)
  - **REDUNDANT (3 จังหวัด):** ความเสียหายรุนแรง (>50,000 ไร่) อยู่ในเขตคุ้มครองภัยพิบัติแต่มีเงินช่วยเหลือให้เปล่าหลายโครงการซ้ำซ้อนกัน (เชียงใหม่ เชียงราย ลำปาง) โดยยังขาดมาตรการเชิงโครงสร้าง
  - **NO_IDENTIFIED_PROBLEM (16 จังหวัด):** ไม่มีรายงานความเสียหายจากภัยพิบัติหรือพื้นที่เสี่ยงในรอบการตรวจ
- ยึดหลักธรรมาภิบาลเข้มงวด: ไม่มีคะแนนความเสี่ยงสังเคราะห์ (Zero Synthetic Risk Scores), คง missing เป็น null และรักษา grain ดั้งเดิม
- เอกสารและหลักฐาน: [docs/spatial-evidence-matching.md](spatial-evidence-matching.md), สัญญาข้อมูล [data_contracts/spatial_evidence.schema.json](../data_contracts/spatial_evidence.schema.json), หลักฐาน `data/local/probes/spatial-evidence-audit.json`

## ทะเบียนโครงการเกษตรข้ามหน่วยงาน (Cross-Agency Agricultural Project Register) และ Data Contract 23 ต.ค. 2569

- เพิ่มสัญญาข้อมูล `data_contracts/project.schema.json` รองรับมาตรฐาน JSON Schema draft-07 ระบุโครงสร้างโครงการเกษตรข้ามหน่วยงาน (รหัสโครงการ, หน่วยงานผู้รับผิดชอบ, งบประมาณ, ช่วงเวลา, ขอบเขตพื้นที่, วัตถุประสงค์, ตัวชี้วัด, และปัญหาเชิงพื้นที่ที่เชื่อมโยง)
- เพิ่มโมดูล `src/tadih/project_register.py`, สคริปต์ `scripts/audit_project_register.py` และ unit tests 5 รายการใน `tests/test_project_register.py` (ผ่านรวม 204 tests 100%)
- จัดทำทะเบียน 5 โครงการเกษตรสำคัญ:
  - DOAE โครงการสนับสนุนภาครัฐ 2566 (`doae_15_01_2566`): 6,211.2 ล้านบาท ครอบคลุม 77 จังหวัด
  - DOAE โครงการสนับสนุนภาครัฐ 2567 (`doae_15_01_2567`): 6,211.2 ล้านบาท ครอบคลุม 77 จังหวัด
  - MOAC-BAAC โครงการสนับสนุนค่าบริหารจัดการและพัฒนาคุณภาพผลผลิตเกษตรกรผู้ปลูกข้าว (ไร่ละ 1,000 บาท): 56,000 ล้านบาท ครอบคลุม 77 จังหวัด
  - DOAE โครงการช่วยเหลือผู้ประสบภัยพิบัติด้านการเกษตร: 1,500 ล้านบาท ครอบคลุม 17 จังหวัดภัยพิบัติ
  - LDD โครงการบริหารจัดการเขตเกษตรเศรษฐกิจสำหรับสินค้าเกษตรที่สำคัญ (Agri-Map Zoning): 350 ล้านบาท ครอบคลุม 77 จังหวัด
- พัฒนากลไกวิเคราะห์ความครอบคลุมเชิงพื้นที่ (`analyze_spatial_project_coverage`):
  - ตรวจพบพื้นที่เป้าหมายรวม 77 จังหวัด
  - ตรวจพบพื้นที่ทับซ้อน/หลายโครงการสนับสนุน (Redundancy): ข้าวนาปีและข้าวนาปรังในพื้นที่ 77 จังหวัดได้รับการอุดหนุนซ้ำซ้อนจาก 3 โครงการใหญ่
  - ตรวจพบช่องว่าง (Gaps): พืชเฉพาะถิ่น (เช่น ทุเรียนภูเขาไฟ, พืช GI) ในพื้นที่แล้งซ้ำซากนอกเขตชลประทานยังไม่มีโครงการเฉพาะรองรับ
- รายละเอียดและเอกสารสเปก: [docs/project-register.md](project-register.md), สัญญาข้อมูล [data_contracts/project.schema.json](../data_contracts/project.schema.json), หลักฐาน `data/local/probes/project-register-audit.json`

## กลไกกระทบยอดแผนและผลเพาะปลูก (Plan vs Actual Reconciliation Engine) 23 ต.ค. 2569

- เพิ่มโมดูล `src/tadih/plan_reconciliation.py`, สคริปต์ `scripts/reconcile_plan_actual.py` และ unit tests 5 รายการใน `tests/test_plan_reconciliation.py`
- วางรากฐาน Fail-Closed Guard Rails สำหรับการเปรียบเทียบแผนและผลการเพาะปลูก:
  - กำหนดเกณฑ์เข้มงวด: ต้องตรงกันทั้ง 5 แกน (ปีเพาะปลูก, ฤดูกาล, ระดับพื้นที่, ชนิดพืช, หน่วยวัด)
  - กำหนด threshold ความครอบคลุมขั้นต่ำ `min_overlap_ratio=0.5`
- ผลการพิสูจน์ทางคณิตศาสตร์จากข้อมูลจริง:
  - **แผนฤดูฝน 2569:** แผน 477 แถว (3 จังหวัด: 20 ชลบุรี, 40 ขอนแก่น, 94 ปัตตานี) เทียบกับผล 3 แถว (1 จังหวัด: 10 กรุงเทพฯ) มีความทับซ้อนเป็นเซตว่าง `{20, 40, 94} ∩ {10} = ∅` (overlap ratio = 0.0)
  - **แผนฤดูแล้ง 2569:** แผน 599 แถว (4 จังหวัด: 20, 40, 46, 81) เทียบกับผล (5 จังหวัด: 10, 11, 12, 13, 14) มีความทับซ้อนเป็นเซตว่าง (overlap ratio = 0.0)
  - ระบบคืนสถานะ `status = "INCOMPARABLE"` พร้อมแจกแจงสาเหตุเชิงลึก ป้องกันความผิดพลาดทางสถิติในการนำตัวเลขคนละจังหวัดมาคำนวณ % ความสำเร็จ
- รายละเอียดและผลการกระทบยอด: [docs/plan-actual-reconciliation.md](plan-actual-reconciliation.md), หลักฐาน `data/local/probes/plan-actual-reconciliation.json`

## การแก้ปัญหาข้อขัดแย้งเชิงพื้นที่และ Temporal Administrative Crosswalk 23 ต.ค. 2569

- เพิ่มโมดูล `src/tadih/temporal_crosswalk.py`, สคริปต์ `scripts/audit_temporal_crosswalk.py` และ unit tests 5 รายการใน `tests/test_temporal_crosswalk.py`
- แก้ไขปัญหาข้อขัดแย้งชื่อ-รหัสพื้นที่ 947 รายการ และชุดข้อมูลเอกภาพ 14,824 รายการ:
  - **การสลับรหัส-ชื่อ ต.แจ่มหลวง / ต.บ้านจันทร์ / ต.แม่แดด อ.กัลยาณิวัฒนา จ.เชียงใหม่ (1,015 แถว):** จับคู่ด้วยชื่อภาษาไทยมาตรฐานเพื่อแมปสู่รหัส DOPA 2566 ที่ถูกต้อง (แจ่มหลวง -> 502503, บ้านจันทร์ -> 502501, แม่แดด -> 502502) พร้อมบันทึกหมายเหตุการแก้ไข
  - **การแยกแขวงบางบอน (105001) เมื่อ 26 ก.ค. 2560 (349 แถว):** กำหนดเงื่อนไข `valid_to: 2017-07-26` ให้ fallback สู่ระดับเขต `1050` เนื่องจากข้อมูลก่อนปี 2560 ไม่สามารถระบุแยกเป็นบางบอนเหนือ (105002) หรือบางบอนใต้ (105003) ได้โดยไม่เกิดภาพลวงตา
  - **รหัสดัมมี่ จ.ตรัง `xxxxxxxx` (45 แถว):** กักกัน (quarantine) เป็น `INVALID_CODE` ไม่นำเข้าสู่ระบบพื้นที่
  - **ชุดข้อมูลเอกภาพ 10 รายการ (`province_unified_data_10` 14,824 แถว):** จำแนก Native Grain เป็นจังหวัด 1,320 แถว และอำเภอ 13,653 แถว โดยคงค่า `rollup_eligible=False`
- รายละเอียดการตรวจสอบ: [docs/geography-crosswalk-resolution.md](geography-crosswalk-resolution.md), หลักฐาน `data/local/probes/temporal-crosswalk-audit.json`

## ตรวจและจัดทำบัญชีความครอบคลุมข้อมูลระดับประเทศ (Coverage Inventory) 23 ต.ค. 2569

- เพิ่มโมดูล `src/tadih/coverage_inventory.py`, สคริปต์ `scripts/audit_coverage_inventory.py` และ unit tests 5 รายการใน `tests/test_coverage_inventory.py` (ผ่านรวม 189 tests 100%)
- กระทบยอดข้อมูล DOAE ทุก Phase กับ manifest ในเครื่องตรงกัน 100%:
  - P0: 1,943,298 แถว
  - P1: 202,747 แถว
  - P2: 1,534 แถว
  - Archives (RAR): 1,289,200 แถว
  - รวมต้นทาง 3,436,779 แถว (Staged 3,436,080 + Quarantined 699 แถว)
- บันทึกบัญชีความครอบคลุมระดับ `source × area × period × metric` รวม 59 ทรัพยากรข้าม 8 ผู้ให้บริการ (DOAE 52, OAE 1, RID 1, Open-Meteo 1, Planetary Computer 1, LDD 1, DOF 1, DLD 1)
- รักษาระดับพื้นที่ดั้งเดิม (Native Grain) อย่างเข้มงวด: country 7, subdistrict 15, province 21, enterprise_group 7, disaster_area 3, grid_point 2, reservoir 1, office_point 1, province_gis_polygon 1, province+district_mixed 1 ไม่กระจายตัวเลขระดับประเทศหรือจุดกริดลงสู่จังหวัดโดยไม่มีหลักฐาน
- บันทึก missing reasons ชัดเจน: ข้อมูล mock รต.01-02 (กักกัน 1 แถว), ค่าพื้นที่ติดลบนาเกลือ (กักกัน 1 แถว), คอลัมน์เลื่อนออนไลน์ 2568 (กักกัน 524 แถว), ตัวเลขวงเล็บพืชอายุสั้น 2567 (กักกัน 173 แถว) สถานะสิทธิ์ทุกทรัพยากรคง `pending` และไม่นำเข้า public
- รายละเอียดและตารางสรุป: [docs/coverage-inventory.md](coverage-inventory.md), หลักฐาน `data/local/probes/coverage-inventory.json`

## ปรับลำดับงานตามเป้าหมายศูนย์ข้อมูลเกษตรระดับประเทศ

บันทึก [data contract และลำดับงาน](national-agriculture-data-center.md): ให้หลายหน่วยงานใช้หลักฐานพื้นที่/พืช/ช่วงเวลา/สิทธิ์ร่วมกันเพื่อวางและติดตามโครงการ เริ่มจาก coverage 77 จังหวัดตามจริง แล้วตรวจตรรกะเชื่อมและสำรวจทะเบียนโครงการ งานนี้เป็นการกำหนดทิศทาง ยังไม่ได้สร้างข้อมูลโครงการข้ามหน่วยงานหรือเปิดข้อมูล pending ให้สาธารณะ

## ตรวจภูมิศาสตร์ DOAE วันที่ 23 ตุลาคม 2569

สร้าง audit offline สำหรับ raw 21 resources รวม 2,757,305 แถว โดยเก็บตารางพื้นที่ไม่ซ้ำ 92,226 signatures ใน `data/local/doae-geography/` และตรวจ SHA/ยอดแถวของไฟล์ผลลัพธ์ผ่าน รหัสและชื่อครบตรง DOPA snapshot ปี 2566 จำนวน 2,579,775 แถว แต่ temporal validity ยังไม่ยืนยัน จึงยังใช้รวมยอดหรือ join เป็นข้อมูลที่รับรองไม่ได้ ชุดเอกภาพมีแถวจังหวัด 1,320 และอำเภอ 13,504 แยก grain ดู [รายละเอียด](doae-geography-audit.md) และงานค้าง crosswalk

## ลดพื้นที่ข้อมูลในเครื่อง 23 ต.ค. 2569

- หยุดโหลดเพิ่มตามคำสั่งเจ้าของงาน ตรวจ repository รวมประมาณ 6.38 GB; ก้อนหลักคือ DOAE raw/staging และ private exports ไม่แตะข้อมูลของโครงการอื่น
- บีบอัดแบบ NTFS ด้วย `compact.exe /C` เฉพาะ `data/local/doae-p0`, `doae-p1`, `doae-p2`, `doae-archives` และ `exports/private` รวม 347 files; พาธ/เนื้อหา/manifest เดิมยังอ่านได้ โปรแกรมไม่ต้องคลาย ZIP เอง โฟลเดอร์เหล่านี้ตั้งให้ไฟล์ใหม่สืบทอด compression
- ผลรวมพื้นที่ไฟล์จาก `GetCompressedFileSizeW` ลดจาก **5,939,104,827 เป็น 2,221,917,141 bytes** (ลด 3,717,187,686 bytes); พื้นที่ว่างไดรฟ์ D ที่วัดทั้ง volume เพิ่มสุทธิ **1,167,630,336 bytes** จาก 95,586,549,760 เป็น 96,754,180,096 bytes จึงไม่อ้างว่าคืนพื้นที่ว่างสุทธิทั้งไดรฟ์ 3.72 GB
- ตรวจข้อมูล export เก่า 6 ชุด: CSV และ Parquet เทียบ `EXCEPT ALL` ทั้งสองทิศทางกับ `20261022T155531Z-ef13f544` แล้วแถวตรงกันทั้งหมด แม้ file SHA ต่างจากลำดับแถว/serialization; พบ staging schema เก่าอีก 3 ชุดมีรุ่นปัจจุบันทดแทน รวมไฟล์ที่เสนอให้ลบ 21 files / 517,762,353 bytes ระบบ automatic approval บล็อกคำสั่งลบด้วย `blocked by policy` จึง **ยังไม่ได้ลบไฟล์ใด** ทั้งรายการยังเก็บอยู่และบีบอัดแล้ว
- เก็บต้นฉบับที่มีประโยชน์และหลักฐานทั้งหมด, staging ปัจจุบัน, warehouse/backup และ PBIP ล่าสุดไว้; แยกใช้ไม่ได้ตอนนี้เป็น quarantine: ออนไลน์ 2568 คอลัมน์ผิด 524 แถว, RAR ค่าตัวเลขวงเล็บรอยืนยัน 173 แถว, พื้นที่ติดลบ 1 แถว และข้อมูล mock 1 แถว ห้ามนำไปวิเคราะห์เป็นข้อมูลจริง ไม่ลบ raw เพียงเพราะยังตีความไม่ได้หรือสิทธิ์ pending
- หลังบีบอัด `scripts/audit_doae_acquisition.py` exit 0: raw SHA ผ่าน 60 resources, CSV 58/58 และ staging hashes ตรงหลักฐานเทียบทุกแถวเดิม; latest private export ตรวจ SHA ผ่านครบ 8 files ไม่อ้างว่าได้รัน DAX/visual หรือเทียบทุกแถวใหม่ในรอบนี้ ไม่มี network acquisition ใหม่
- หลักฐาน local: `data/local/probes/storage-before-cleanup.json`, `storage-cleanup-plan.json`, `storage-cleanup-result.json`, `storage-post-cleanup-audit.log`; งานลบสำเนาซ้ำยังค้างเพราะ policy ไม่เปลี่ยนสิทธิ์เผยแพร่และไม่ลดเกณฑ์ roadmap

## P2 และ catalog acquisition audit วันที่ 23 ตุลาคม 2569

ตรวจ catalog 3 หน้าครบ 201 datasets: uitest 160, demo/empty 2, Database 6, public datasets 33 เทียบ raw กับ metadata และตรวจ hashes/schema/output/ผลเทียบทุกแถวแล้ว CSV ที่ catalog ระบุมี capture ครบ 58/58 resources, 33/33 public datasets และ raw hash ผ่าน 60 resources ยังไม่เลือก non-CSV 24 resources ไม่อ้างว่าเป็นสำเนาเทียบเท่าหรืออ่าน PDF ที่ reference CSV ลิงก์ไว้ ดู [acquisition audit และงานค้าง](doae-acquisition-audit.md)

P2 เพิ่มคำขอสินค้า 1,534 แถว และ RAR รายชื่อ/ที่ตั้งวิสาหกิจ 4 resources รวม 304,480 แถว เก็บ private พร้อม privacy flags; archives ทั้ง 8 รวม source 1,289,200 / staged 1,289,027 / quarantine 173 ผ่านการคลายซ้ำและเทียบทุกแถว Reference CSV 7 ชุดเก็บ positional raw index ไม่ใช่ metric observations

ทดสอบ 182 tests ผ่าน (22.500s), pip check ผ่าน และตรวจทะเบียนเพิ่ม 6 tests ผ่าน ทะเบียน exact resources 70 รายการคง pending ไม่มีข้อมูลจริงเข้า Git/public/warehouse/Power Query/Online งานต่อยังเป็นหน่วย/เวลา/พื้นที่/revisions/coverage และเชื่อม workflow/Dimension ตาม roadmap ไม่ปิดเกณฑ์เหล่านี้จากการดึง CSV ครบ

## DOAE P1 และ RAR เพิ่มเติม 23 ตุลาคม 2569

ดึงและ staging P1 21 resources / 12 datasets: 202,747 source = 202,223 staged + 524 quarantined (ออนไลน์ปี 2568 คอลัมน์คลาดเคลื่อน) พร้อมสำนักงาน JSON-LD 955 รายการ (พิกัด missing 1) และ GeoJSON จังหวัด 77 features คง geometry 3 ค่า; source fields/code/null/หน่วย/ช่วงเวลาคงต้นทาง ไม่เข้า warehouse/BI

ดาวน์โหลดและคลาย RAR 4 resources (วิสาหกิจ 2566/2567, พืชอายุสั้น/ยาว 2567) แบบจำกัดขนาด/เวลา ผ่าน stdout ไม่ใช้ path ใน archive เป็นปลายทาง: source 984,720 / staged 984,547 / quarantine 173 รูปแบบตัวเลขวงเล็บรอยืนยัน CSV วิสาหกิจ 2566 ใน RAR bytes ตรงกับ CSV P1 จึงไม่รวมจำนวนซ้ำ

ตรวจ hash และเทียบทุกแถวผ่านครบ P1 21 + archives 4 พร้อมคลายซ้ำเป็น digest และ verified resume; `data/local/probes/doae-p1-verification.json`, `doae-archives-verification.json` ทดสอบรวม 178 tests ผ่าน (22.815s), pip check ผ่าน และตรวจ license registry 6 tests ผ่าน ทะเบียน exact resources รวม 58 คง pending ดู [รายละเอียด](doae-p1-archives.md)

ทำ [ร่าง Data Contract](doae-aggregate-data-contract-draft.md) สำหรับสถิติรวมแล้ว ยังไม่ส่งหรือรับข้อมูลรายบุคคล งานต่อเป็น source semantics/temporal geography/coverage/revisions/สิทธิ์และการเชื่อม workflow ตาม roadmap ยังไม่รับรองความถูกต้องเชิงความหมายหรือ DAX/BI runtime จากการผ่าน staging

## DOAE P0 capture/staging ครบ 23 ตุลาคม 2569

ดึง 21 CSV จาก 10 datasets รวม 585,506,130 bytes และ 1,943,298 source rows; staged 1,943,296 / quarantine 2 แถว ครอบคลุมแผนฤดูแล้งย้อนหลัง 2561–2569 (รวมไฟล์สรุปแยก), รต.01-04, เฝ้าระวังขาดแคลนน้ำ, ภัยใน/นอกเขตชลประทาน และแผน/ผล/report snapshot ฤดูฝนและแล้ง รายละเอียด [doae-p0-ingestion.md](doae-p0-ingestion.md)

ตรวจ hash และเทียบ source fields/ตัวเลข/ลำดับทุกแถวกับ raw CSV ผ่านครบทั้ง 21 resources ผล `all_p0_resources_verified=true` ใน `data/local/probes/doae-p0-verification.json` รันซ้ำทุก resource เป็น skipped_verified; ทดสอบรวม 172 tests ผ่าน (19.820s), pip check ผ่าน และทะเบียน exact resources เพิ่มเป็น 33 รายการ คง pending ทุกชุด

ข้อค้นพบ: resource รต.01-02 มีเพียงแถว mock ซึ่งกักไว้ จึงยังไม่มีข้อมูลพืชจริงจาก endpoint นี้; นาเกลือมีค่าพื้นที่ติดลบ 1 แถวกักไว้ แมลง/เกลือมี repeated identities 48/96 เก็บทั้งหมด; report snapshot คง reported_at ใน grain ไม่มีการรวม subtotal, หน่วย หรือช่วงเวลา และยังไม่เข้า warehouse/Power BI

งานต่อคือ P1 และ P2 ตาม roadmap พร้อม semantic/temporal/geographic/license review ก่อนเชื่อมโมเดล การดึง P0 ครบยังไม่ใช่การจบแผน DOAE หรือเกณฑ์รับรองโครงการทั้งหมด

## เพิ่มเติม 23 ต.ค. 2569 เวลา 07:29 Asia/Bangkok

ทำ P0 DOAE แผนเพาะปลูกฤดูแล้งปี 2569 ต่อจาก roadmap: CLI `doae-dryplant` capture/staging จริง 599 แถว, 4 จังหวัด / 69 รหัสตำบลต้นทาง, quarantine และ repeated identity เป็น 0; พื้นที่ศูนย์จริง 317 แถว ครัวเรือน null 599 แถว คงแผนแยกผลปลูกจริง ไม่ aggregate และไม่เข้า warehouse/Online เนื่องจากปีเพาะปลูก/พื้นที่ยังไม่รับรองและสิทธิ์ `อื่นๆ` คง pending

ตรวจ raw/staging SHA-256, เทียบพื้นที่/รหัส/updated_at ครบ 599 แถว และ rerun จาก checkpoint ผ่าน ทะเบียน exact resources เพิ่มเป็น 13 รายการ Unit/regression รวม 166 tests ผ่าน (15.774s) และ pip check ผ่าน หลักฐาน `data/local/probes/dryplant-verification.json` และ `dryplant-cycle-tests.log` ดู [วิธีรันและขอบเขต](plan-dryplant.md)

งานต่อ: ทบทวน schema รายปี/ไฟล์สรุปก่อน backfill (ปี 2568 มี subtotal ประเทศ/ภาค/จังหวัด), ยืนยัน temporal mapping/ปีเพาะปลูก/สิทธิ์ก่อนเข้าโมเดล ปรับ C2 ใน HANDOFF กลับเป็นงานค้างให้ตรงหลักฐาน เพราะ Python simulation ยังไม่ใช่ DAX engine runtime

## ความคืบหน้าล่าสุด (22 ต.ค. 2569 เวลา 23:28 Asia/Bangkok)

ตรวจรวม 162 tests ผ่าน 100%; pip check ผ่าน. DuckDB warehouse 141,699 latest observations จาก 5 แหล่งข้อมูล (DOAE, ERA5, RID, OAE, MODIS).

- **DOAE CKAN Catalog Ingestion Roadmap:** สแกนโครงสร้างและสำรวจชุดข้อมูลจริงบน `https://ckan.doae.go.th/` ผ่าน CKAN API v3 พบบัญชีข้อมูล 41 ชุดข้อมูลจริง (คัดแยกชุดทดสอบ uitest 59 รายการออก); จัดหมวดหมู่ 5 กลุ่มหลัก (การผลิตพืช/รต.01-04/แผนเพาะปลูก, ภัยพิบัติและน้ำ, ทะเบียนเกษตรกร, วิสาหกิจชุมชน, ที่ตั้ง GIS); จัดทำแผนงานและเกณฑ์ธรรมาภิบาลข้อมูล P0/P1/P2 ใน `docs/doae-catalog-expansion.md`
- **Monthly Forecasting & Seasonal Naïve Baseline (B9):** ขยายสถาปัตยกรรมโมเดลพยากรณ์ใน `src/tadih/forecast.py` ให้รองรับความถี่รายเดือนโดยตรง (ไม่ downsample ราคารายเดือนเป็นรายวัน); รองรับโมเดลฐาน `seasonal_naive` (lag 12 เดือน), `last_value` (naïve), และ `moving_average` (3 เดือน); สร้าง walk-forward backtest รายเดือนพร้อม split calibration/verification และ embargo ป้องกัน leakage; ประเมิน scorecard (MAE, RMSE, Bias, WAPE, skill score) และช่วงความเชื่อมั่นเชิงประจักษ์ (P10/P90); บังคับ gate ห้ามใช้ `retrieved_at` แทน `release_at` (หากไม่มีวันเผยแพร่จริงจะระงับและคืน Unknown ทันที); จัดทำ `docs/forecast-methodology.md` และ unit tests 20 รายการใน `tests/test_forecast.py` ผ่าน 100%
- **DAX Measures Simulation Audit (C2):** จัดทำ `docs/dax-simulation-audit.md` และ unit tests จำลองคำนวณ 13 รายการใน `tests/test_dax_simulation.py` ผ่าน 100% ครอบคลุม 35 DAX measures ใน `powerbi/measures.dax` กับข้อมูลจริง 141,699 แถวใน `data/local/powerbi/offline-v11/Data/`; พิสูจน์ guard rails สำเร็จ: ราคาระดับประเทศคืนค่าว่างทันทีเมื่อ filter จังหวัด/อำเภอ (ป้องกัน leak ลงจังหวัด), สภาพอากาศรายจุดคืนค่าว่างเมื่อเลือกหลายจุดพร้อมกัน, ราคาขายส่ง/ขายปลีกไม่ปนเข้า farmgate, แยกหน่วย บาท/กก. ออกจากหน่วยนับเฉพาะ (บาท/ร้อยผล, บาท/ฟอง, บาท/ตัว), อ่างเก็บน้ำ RID 461 แห่ง (457 แห่งที่มีปริมาตรน้ำ) คำนวณความจุ/ปริมาตร/%น้ำ ถูกต้อง, และ `Reviewed Production kg` ถูกบล็อกเป็นค่าว่างตามสเปก
- **Power BI Offline Project Build (offline-v11):** สร้าง build โปรเจกต์ล่าสุด `data/local/powerbi/offline-v11/` มี 141,699 fact_observation rows จาก 5 แหล่งข้อมูล, 12 ตาราง, 15 relationships, 35 measures, 5 หน้า PBIR; ตรวจ integrity hash 34 ไฟล์ และตรวจสอบความถูกต้องของ Microsoft Fabric JSON schemas ผ่าน 21 metadata files 100% ด้วย `scripts/validate_powerbi_project.py`
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
