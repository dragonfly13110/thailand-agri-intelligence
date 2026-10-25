# สเปค Adapter อ่างเก็บน้ำขนาดกลาง (RID Water Reservoirs)

ปรับปรุงเมื่อ 24 ตุลาคม 2569 (2026-10-24) โดย lane External API Normalizer
ไฟล์ที่เกี่ยวข้อง: `src/tadih/reservoirs.py`, `tests/test_reservoirs.py`
หลักฐานการ probe ต้นทาง: [rid-probe-results.md](rid-probe-results.md)

**สถานะสิทธิ์: `license_status = pending` ทุกจุด** — ห้ามส่งชุดตัวเลขผ่าน public API,
หน้าเว็บ, props หรือ cache จนกว่าจะได้คำยืนยันสิทธิ์เผยแพร่ต่อจาก RID/SWOC เป็นลายลักษณ์อักษร
อนุญาตให้ใช้ภายในหรือ staging เท่านั้น และห้ามบันทึกค่าตัวเลขดิบลง repository

---

## 1. ปลายทางและพฤติกรรมต้นทางที่ยืนยันแล้ว

| รายการ | ค่า |
|---|---|
| Endpoint ปัจจุบัน | `GET https://app.rid.go.th/reservoir/api/reservoir/public` |
| Endpoint ย้อนหลัง | `GET .../public/YYYY-MM-DD` (path form เท่านั้น query parameter ถูกเมิน) |
| การยืนยันตัวตน | ไม่ต้องใช้ credential (anonymous) — แต่สิทธิ์เปิดใช้ ≠ สิทธิ์เผยแพร่ |
| Grain ต้นทาง | หนึ่งระเบียนต่อ (วันที่รายงาน, รหัสอ่างเก็บน้ำ) รวม 461 อ่าง |
| ประวัติ | ต่อเนื่องรายวัน 1998-01-01 ถึงปัจจุบัน (สุ่มตรวจ 351 วัน ทุก 30 วัน) |
| หน่วย | ดูหัวข้อ 5 |

**กับดักที่ต้องป้องกัน (หัวข้อ 6.3 ของผล probe):**

| เคส | พฤติกรรมจริง | การป้องกันใน adapter |
|---|---|---|
| วันที่ก่อน 1998-01-01 | HTTP 200 คืนรายงานเก่าสุด แต่เขียนป้าย `date` ทับตามวันที่ที่ขอ | ปฏิเสธ **ก่อน** ส่ง request (ช่วงวันที่) |
| วันที่ไม่มีจริงในปฏิทิน เช่น 2026-02-30 | HTTP 200 คืนรายงานวันอื่น | ปฏิเสธ **ก่อน** ส่ง request (parse ปฏิทิน) |
| วันที่อนาคต | HTTP 400 | ปฏิเสธ **ก่อน** ส่ง request (ช่วงวันที่) |
| วันในช่วงที่ endpoint คืนรายงานอื่นแบบเงียบ | คืน HTTP 200 พร้อมป้าย `date` ปลอม | ตรวจลายเซ็นเนื้อหา (หัวข้อ 3.3) |

## 2. การตรวจช่วงวันที่ (ก่อน request เสมอ)

- ฟังก์ชัน `_report_day()` รับเฉพาะ `1998-01-01 ≤ วันที่ ≤ วันนี้` โดย "วันนี้" คือวันปฏิทินไทย (UTC+7)
  เพราะผู้ให้บริการเผยแพร่รายงานตามวันไทย
- รูปแบบต้องเป็น `YYYY-MM-DD` และเป็นวันจริงในปฏิทิน (`2026-02-30`, `1999-02-29`, `2026-13-01`
  ถูกปฏิเสธทันที) — การตรวจทั้งหมดเกิดก่อนยิง request จึงไม่เปลืองโควตาต้นทาง
- ทุกจุดที่รับวันที่ (`fetch_reservoirs`, `capture_reservoirs`, `backfill_reservoirs`) ผ่าน `_report_day()` เหมือนกัน

## 3. การตรวจลายเซ็นเนื้อหา (Content Signature)

ป้าย `date` ใน payload **เชื่อไม่ได้** เพราะ endpoint เขียนทับตามวันที่ที่ขอในกรณีที่คืนรายงานอื่น
จึงต้องตรวจเนื้อหาจริงด้วย

### 3.1 หลักการและคุณสมบัติ

- `report_signature(payload)` คำนวณ SHA-256 ของค่าทุกฟิลด์วัด (`region`, `id`, `storage`,
  `dead_storage`, `volume`, `percent_storage`, `inflow`, `outflow`) เรียงตาม (region, id)
  แล้ว serialize เป็น canonical JSON — **ไม่รวมป้าย `date`** เพื่อให้ป้ายปลอมเปลี่ยนลายเซ็นไม่ได้
- รูปแบบแถวและการเรียงตรงกับ `scripts/probe_rid_api.py` — อักขระ 16 ตัวแรกของลายเซ็นนี้
  คือ fingerprint ที่ probe รายงาน จึงเทียบผล probe เดิมได้โดยตรง
- คุณสมบัติ: ป้าย `date` เปลี่ยนลายเซ็นไม่เปลี่ยน, ลำดับกลุ่มภาคสลับได้,
  แก้ค่าแม้แต่ตัวเดียวลายเซ็นเปลี่ยนทันที (มี test ยืนยันทั้งสามข้อ)

### 3.2 ลายเซ็นถูกบันทึกไว้ที่ไหน

- ทุก envelope ที่ `fetch_reservoirs` คืนมี `content_signature` (full 64-hex) และ
  `normalize_reservoirs` จะตรวจว่าลายเซ็นตรงกับ payload ก่อน normalize เสมอ
  (จับ checkpoint ที่ถูกแก้หลังบันทึก)

### 3.3 การตรวจจับรายงานที่ถูกแทนที่แบบเงียบ

1. **เทียบกับรายงานปัจจุบัน** — `fetch_reservoirs(..., reference_signature=<ลายเซ็นรายงานปัจจุบัน>)`:
   วันในอดีตที่ได้เนื้อหา identical กับรายงานปัจจุบันถูกปฏิเสธ (ผล probe ยืนยันว่า 351 วันที่สุ่ม
   มีเนื้อหาไม่ซ้ำกันแม้แต่วันเดียว ดังนั้นเนื้อหาซ้ำข้ามวัน = endpoint แทนที่รายงาน)
2. **ตรวจซ้ำภายในรอบเดียว** — `known_signatures` (fingerprint → วันที่ยอมรับไปแล้ว):
   วันที่สองที่ได้ลายเซ็นซ้ำกับวันก่อนหน้าถูกปฏิเสธ **ก่อน** เขียน checkpoint
3. `backfill_reservoirs` ดึงรายงานปัจจุบัน **หนึ่งครั้งต่อรอบ** (เมื่อมีวันอดีตในช่วง) มา seed ทั้งสองกลไกข้างต้น
4. ข้อยกเว้น: วันที่เท่ากับวันนี้ได้รับอนุญาตให้เนื้อหาตรงกับรายงานปัจจุบัน (เป็นรายงานเดียวกัน)

ข้อจำกัด: การตรวจซ้ำข้ามรอบ (separate runs) ทำได้เฉพาะผ่าน `reference_signature` ที่ส่งเข้ามา
 adapter ไม่เก็บ registry ถาวร — sync job ที่รัน backfill ต่อเนื่องหลายรอบควรส่งลายเซ็นรายงานปัจจุบันของรอบนั้นด้วย

## 4. Grain และตัวระบุ

- **grain ต้นทาง:** `(วันที่รายงาน, รหัสอ่างเก็บน้ำ)` — 461 ระเบียน/วัน รหัส `rsv` + ตัวเลข ห้ามมีซ้ำในรายงานเดียว (ตรวจแล้ว)
- **grain ของ observation row:** `(วันที่, รหัสอ่าง, measure)` — หนึ่งอ่างมี 6 measures ต่อวัน
- `observation_id = "rid-" + sha256([reservoir_id, report_date, measure])` — คงที่ทุกครั้งที่ normalize ซ้ำ
- `revision_id = sha256({report_date, region, reservoir})` — เปลี่ยนเมื่อค่าต้นทางเปลี่ยน (นับเป็น revision ใหม่ ไม่ทับของเดิม)
- `location_id = "rid:reservoir:<id>"`, `spatial_support = "reservoir"` เสมอ

## 5. หน่วย (สำคัญต่อการใช้ข้อมูล)

| ฟิลด์ต้นทาง | measure | หน่วยในแถว observation | ที่มา |
|---|---|---|---|
| `storage` | `reservoir_storage_capacity` | `MCM` | เอกสารทางการ: ล้าน ลบ.ม. (million cubic metres) |
| `dead_storage` | `reservoir_dead_storage` | `MCM` | เช่นเดียวกัน |
| `volume` | `reservoir_volume` | `MCM` | เช่นเดียวกัน |
| `percent_storage` | `reservoir_percent_storage` | `%` | เอกสารทางการ: เปอร์เซนต์ |
| `inflow` | `reservoir_inflow` | **`null`** | **ไม่มีหน่วยระบุในเอกสาร — ห้ามเดา** |
| `outflow` | `reservoir_outflow` | **`null`** | **ไม่มีหน่วยระบุในเอกสาร — ห้ามเดา** |

- token `MCM` ในระบบนี้หมายถึง ล้าน ลบ.ม. = million cubic-metres เท่านั้น (คงตามโค้ด/เอกสารเดิมทั้ง repo)
- **inflow/outflow ถูกกักไว้ใน `pending_unit_observations` แยกจาก `observations`** เนื่องจาก
  observation contract เดิม (`data_contracts/observation.schema.json`) กำหนดให้ `unit` เป็น string
  ที่ไม่ว่าง — แถวที่ `unit=null` จะ fail `validate_observation`/`ingest_rows` ทันที
  เมื่อ RID/SWOC ยืนยันหน่วยเป็นลายลักษณ์อักษรแล้ว ให้ integrator ตัดสินใจปรับ contract หรือ map หน่วย
  แล้วค่อยย้ายสอง measure นี้เข้า stream หลัก (test ใน lane นี้ตรวจให้แถว pending มีโครงสร้างครบเท่ากับ FIELDS)
- ห้ามใช้ inflow/outflow คำนวณ balance น้ำหรือเปรียบเทียบข้ามอ่างจนกว่าจะยืนยันหน่วยได้
  (ค่าสองฟิลด์นี้ถูกแก้ย้อนหลังได้ตามที่ผล probe พบ — ไม่ใช่ค่าที่ตรวจสอบย้อนหลังได้)

## 6. พื้นที่ (macroregion)

- `region` 6 ภาค (เหนือ / ตะวันออกเฉียงเหนือ / ตะวันออก / กลาง / ตะวันตก / ใต้) **คงไว้ตามต้นทาง**
  ทั้งในแถว inventory และใน revision hash — ไม่แปลง ไม่จับคู่ข้ามภาค
- `area_code = null` ทุกแถว เพราะยังไม่มีตารางเชื่อมอ่าง→จังหวัด/พิกัด/ลุ่มน้ำ
- **ห้ามใช้ภาคแทนจังหวัด และห้ามตีความว่าครอบคลุม 77 จังหวัด** — นี่คืออ่างขนาดกลางที่ RID แจ้งไว้ 461 แห่ง ไม่ใช่อ่างทั้งประเทศ
- เมื่อมี crosswalk จากผู้ให้บริการ ค่อยเติม `area_code`/`location_id` ระดับพื้นที่จริง (งานของ integrator)

## 7. missing และค่าผิดปกติ

- ค่าไม่พบทุกกรณีคงเป็น `null` พร้อม `quality_flag = "missing"` — ไม่เติม 0, ไม่คำนวณทดแทน
- `percent_storage` ใช้ค่าที่ผู้ให้บริการให้มา **ห้ามตัดที่ 100** (มีค่า >100 จริง 90 รายการ) และ
  **ห้ามคำนวณทดแทนจาก `volume` เมื่อ `volume` เป็น null**
- `volume < dead_storage` เป็นสัญญาณภัยแล้งที่ถูกต้อง ไม่ใช่ค่าผิด — ห้ามกรองออก
- cross-check `percent ≈ 100 × volume ÷ storage` (±0.05 จุด) ทำแยกเป็น `percent_calibration`
  พร้อม `consistent/mismatch/uncheckable` — mismatch ให้แค่ quality flag ไม่เขียนทับค่าต้นทาง
- ค่าที่เป็น 0 จริงต้องคงเป็น 0 (ศูนย์ ≠ ไม่มีข้อมูล)

## 8. โครงสร้างผลลัพธ์ของ `normalize_reservoirs(envelope)`

| key | เนื้อหา |
|---|---|
| `observations` | แถว observation ที่ผ่าน contract (4 measures มีหน่วย) พร้อม ingest ได้เมื่อสิทธิ์อนุญาต |
| `pending_unit_observations` | แถว inflow/outflow โครงสร้างเดียวกัน `unit=null` — **ห้าม ingest** จนยืนยันหน่วย |
| `reservoirs` | inventory: `reservoir_id, name, region, area_code(null), location_id, geography_status` |
| `percent_calibration` | ผล cross-check เปอร์เซนต์รายอ่าง |
| `units` | แผนที่หน่วยทั้ง 6 ฟิลด์ รวม `inflow: null, outflow: null` ให้เห็นชัดว่าไม่ได้เดา |
| `content_signature` | ลายเซ็นของรายงานชุดนี้ |
| `observation_count` / `pending_unit_observation_count` / `reservoir_count` | ตัวนับ |
| `license_status` | เสมอ `"pending"` |
| `inflow_outflow_status` | `"raw_only_units_unverified"` |

## 9. ฟังก์ชันของโมดูลและวิธีใช้จาก sync job

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `report_signature(payload)` | ลายเซ็นเนื้อหา (ดูหัวข้อ 3.1) |
| `fetch_reservoirs(date, *, fetcher, reference_signature, known_signatures)` | ดึงรายงานเดียว พร้อมการตรวจทั้งสามชั้น |
| `normalize_reservoirs(envelope, *, percent_tolerance)` | normalize + ตรวจลายเซ็น envelope |
| `capture_reservoirs(output_dir, date, *, refresh, fetcher, reference_signature, known_signatures)` | checkpoint รายวัน (resume ข้ามรอบได้) |
| `backfill_reservoirs(start, end, output_dir, *, max_days, ...)` | backfill จำกัดช่วง (≤366 วัน) ต่ออายุ checkpoint เดิมเมื่อวันถัดไปล้มเหลว |

ข้อแนะนำสำหรับรอบจริง: เรียก path form เท่านั้น, backfill ทีละช่วงสั้นพร้อม sleep,
บันทึก `sync_runs` จากผลของแต่ละวัน, ห้าม ingest เข้าฐานสาธารณะใด ๆ จนกว่าสิทธิ์จะไม่เป็น `pending`

## 10. การทดสอบ (`tests/test_reservoirs.py`)

รันด้วย: `$env:PYTHONPATH="src"; .\.venv\Scripts\python.exe -m unittest tests.test_reservoirs`
(fakes ผ่าน parameter `fetcher` 100% — **ไม่มี test ไหนยิง network จริง**) ครอบคลุม:

1. หน่วย MCM/% ถูกต้อง, inflow/outflow null ในรายการกัก, missing เป็น null, >100 และ 0 คงเดิม, region/area_code
2. วันที่ก่อน 1998 / อนาคต / ผิดปฏิทิน / รูปแบบผิด — ถูกปฏิเสธ **ก่อน** เรียก fetcher
3. คุณสมบัติลายเซ็น: ป้าย date ปลอมและลำดับกลุ่มไม่เปลี่ยนลายเซ็น; แก้ค่าหนึ่งตัวเปลี่ยนลายเซ็น
4. วันในอดีตที่คืนเนื้อหา = รายงานปัจจุบัน ถูกปฏิเสธเมื่อมี `reference_signature`
5. ป้ายวันผิด / total ผิด / id ซ้ำ / ค่า non-finite ถูกปฏิเสธ
6. envelope ที่ถูกแก้หลังดึง ถูก normalize ปฏิเสธ (ลายเซ็นไม่ตรง)
7. capture resume/refresh: observation_id คงที่ revision เปลี่ยนเมื่อค่าเปลี่ยน
8. backfill: ใช้รายงานปัจจุบันอ้างอิง 1 ครั้ง, resume ไม่ยิงซ้ำ, เนื้อหาซ้ำข้ามวันถูกปฏิเสธ
   **ก่อน** เขียน checkpoint, วันที่ผิดไม่ทำลาย checkpoint วันก่อนหน้า, ตรวจช่วง/เพดานก่อน network
9. แถว `observations` ทั้งหมดผ่าน `validate_observation` และ ingest ลง DuckDB แบบ idempotent ได้

## 11. สิ่งที่เปลี่ยนจากพฤติกรรมเดิม และงานที่ต้องส่งต่อ

สิ่งที่เปลี่ยนใน adapter (ผู้บริโภคภายนอกต้องทราบ):

1. เพิ่มการตรวจช่วงวันที่และลายเซ็นเนื้อหา — วันก่อน 1998/อนาคต/ผิดปฏิทินถูกปฏิเสธก่อน request,
   และ envelope ใหม่มี field `content_signature` (envelope เก่าที่ไม่มี field นี้จะไม่ผ่าน `normalize_reservoirs`)
2. `normalize_reservoirs` คืน `pending_unit_observations` (inflow/outflow, `unit=null`) เพิ่มจากเดิมที่ทิ้งสองฟิลด์นี้ไว้ใน payload
   แต่เพียงอย่างเดียว — `docs/ingestion.md` หัวข้อ normalize_reservoirs ยังอธิบายพฤติกรรมเดิม ต้องให้ integrator อัปเดต
3. `backfill_reservoirs` เพิ่ม request รายงานปัจจุบัน 1 ครั้งต่อรอบเพื่ออ้างอิงลายเซ็น
4. ชื่อ measure ใหม่ `reservoir_inflow`/`reservoir_outflow` ยังไม่อยู่ใน allowlist ของ
   `src/tadih/temporal_crosswalk.py` — ไม่กระทบเพราะยังไม่ ingest แต่ต้องเพิ่มพร้อมกับการเปิดใช้สอง measure นี้

งานที่ยังค้างอยู่นอกขอบเขตลane นี้ (ไม่ได้แก้ในรอบนี้):

- ยังไม่มี crosswalk อ่าง→จังหวัด/พิกัด → ยังไม่มีตัวชี้วัดระดับจังหวัดจากแหล่งนี้
- ยังไม่ยืนยันหน่วย/ช่วงเวลาสะสมของ inflow/outflow → ห้ามคำนวณจากสองฟิลด์นี้
- สถานะสิทธิ์ยัง `pending` → ห้ามเปิด public API/เว็บ จนได้หนังสือยืนยันจาก RID/SWOC
- ไม่ทราบทะเบียน revision ย้อนหลังของผู้ให้บริการ → ข้อมูลย้อนหลังไม่อ้าง as-of ได้
