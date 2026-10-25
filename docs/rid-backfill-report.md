# รายงาน Backfill อ่างเก็บน้ำขนาดกลาง (RID) ย้อนหลัง 15 วัน

รันเมื่อ 25 ตุลาคม 2569 (2026-10-25 ICT) โดย lane 3: Backfill & Verification
ขอบเขต: `2026-10-10` ถึง `2026-10-24` (15 วันปฏิทินเต็ม)
เอกสารนี้เก็บเฉพาะสถิติรวม — **ไม่มีค่าตัวเลขดิบของอ่างเก็บน้ำใด ๆ ถูกบันทึกลง repository**
ชุดข้อมูลดิบทั้งหมดอยู่ใน `data/local/raw/rid/` (อยู่ใน `.gitignore` แล้ว ห้ามคัดลอกเข้า git หรือ `web/`)

## 1. คำสั่งที่รันจริง

```powershell
# Backfill จริง (ดึงจาก app.rid.go.th) — ใช้ --refresh เพราะพบ checkpoint รูปแบบเก่าบนดิสก์ (ดูหัวข้อ 2)
$env:PYTHONPATH="src"
.\.venv\Scripts\python.exe scripts\backfill_rid_reservoirs.py --start-date 2026-10-10 --end-date 2026-10-24 --refresh --json

# ตรวจสอบความเที่ยงตรงและ checksum (สคริปต์ใหม่: scripts/check_rid_calibration.py)
.\.venv\Scripts\python.exe scripts\check_rid_calibration.py --start-date 2026-10-10 --end-date 2026-10-24

# Unit tests
.\.venv\Scripts\python.exe -m unittest tests.test_reservoirs
```

## 2. หมายเหตุการตัดสินใจ: รันซ้ำด้วย `--refresh`

ก่อนรัน พบ snapshot เดิมบนดิสก์ของวัน `2026-10-09` ถึง `2026-10-22` ซึ่งถูก capture ไว้เมื่อ 22 ต.ค.
โดย adapter รุ่นก่อนที่ **ยังไม่มี field `content_signature`** — adapter ปัจจุบัน fail-closed ตอน resume
(ปฏิเสธ checkpoint ที่ตรวจสอบลายเซ็นไม่ได้ ซึ่งเป็นพฤติกรรมที่ถูกต้อง) จึงรันซ้ำแบบ `--refresh`
เพื่อให้ทุกวันในช่วงเป้าหมายได้ชุดข้อมูลใหม่พร้อมลายเซ็นและ provenance ที่ตรวจสอบได้ครบ
snapshot รูปแบบเก่าถูกเก็บเป็น immutable version ข้าง artifact ใหม่ (`save_snapshot` ไม่ลบของเดิม)
และ partition `medium-reservoirs-2026-10-09` (นอกช่วงเป้าหมาย) ถูกปล่อยไว้โดยไม่แตะต้อง

## 3. ผล Backfill: สำเร็จ 15/15 วัน

| รายการ | ผล |
|---|---|
| วันที่สำเร็จ | **15 จาก 15** (`2026-10-10` ถึง `2026-10-24`) ไม่มีวันล้มเหลว |
| จำนวนอ่างเก็บน้ำ/วัน | **461 ทุกวัน** (เท่ากันทุกวัน ตรงกับทะเบียนผู้ให้บริการ) |
| Observations ต่อวัน | **1,844** (= 461 อ่าง × 4 measures ที่มีหน่วย) |
| Observations รวม | **27,660** แถว (ทุกแถว `license_status = pending`) |
| Pending-unit rows รวม | **13,830** แถว (`inflow`/`outflow` หน่วย null — ถูกกัก ห้าม ingest) |
| เวลาที่ดึง (UTC) | `2026-10-24T17:06:46` ถึง `2026-10-24T17:07:00` |
| โครงสร้างไฟล์ต่อวัน | `data/local/raw/rid/medium-reservoirs-YYYY-MM-DD/` ประกอบด้วย `manifest.json` + artifact JSON ชื่อตาม checksum SHA-256 (ตรวจซ้ำผ่าน `snapshot_complete` แล้วทุกวัน) |

## 4. หลักฐานความเที่ยงตรงและกับดักข้อมูลปลอมวัน

| การตรวจ | ผล |
|---|---|
| SHA-256 checksum ของ artifact (canonical JSON) | ตรงทุกวัน 15/15 |
| ตรวจลายเซ็นเนื้อหาซ้ำใน `normalize_reservoirs` (`content_signature`) | ตรง payload ทุกวัน 15/15 |
| ป้าย `date` ใน payload == วันที่ขอ | ตรงทุกวัน |
| ลายเซ็นเนื้อหาไม่ซ้ำกันข้ามวัน | **15 ลายเซ็นต่างกันทั้งหมด** → ไม่มีวันใดได้รับรายงานวันอื่นแบบเงียบ (กับดัก IIS) |
| จำนวน `total` ใน payload == จำนวนระเบียนจริง | ตรงทุกวัน (ตรวจใน `_records`) |

## 5. Calibration: % ความจุจริงเทียบกับรายงาน (tolerance ≤ 0.05 จุด)

เทียบ `percent_storage` ที่ผู้ให้บริการรายงานกับ `100 × volume ÷ storage` ทุกรายการ (6,915 ระเบียน-วัน = 461 × 15):

| สถานะ | จำนวน | สัดส่วน |
|---|---:|---:|
| Consistent (คลาด ≤ 0.05 จุด) | **6,848** | **99.03%** |
| Mismatch (คลาด > 0.05 จุด) | **0** | **0.00%** |
| Uncheckable (`volume` เป็น null จึงคำนวณเทียบไม่ได้) | 67 | 0.97% |

- ไม่มีรายการ mismatch เลย — ค่าเปอร์เซนต์ที่ผู้ให้บริการรายงานเทียบกับสูตร volume/capacity ได้ทุกรายการที่คำนวณได้
- รายการ `uncheckable` 67 รายการ (เฉลี่ย ~4.5 ต่อวัน) ตรงกับอ่างที่ `volume = null` ตามที่ผล probe บันทึกไว้
  — **คงเป็น null ไม่คำนวณทดแทน** ไม่ตัดทิ้ง และไม่เติมค่าเปอร์เซนต์แทน
- ค่า `percent_storage` เหนือ 100 และ `volume < dead_storage` ถูกคงไว้ตามเดิม ไม่มีการตัด/กรอง (ตามสเปค)

## 6. สถานะลิขสิทธิ์: ยังคง pending ทุกจุด — ไม่มีอะไรเป็น approved_public

- envelope ทุกวัน: `license_status = "pending"` (ตรวจใน check script ทุก partition)
- แถว observation ทุกแถว (27,660 + 13,830): `license_status = "pending"` — **0 แถวเป็น `approved_public`**
- ชุดข้อมูลนี้จึง **ยังห้ามส่งออกสู่ public API, หน้าเว็บ, props หรือ cache** จนกว่าจะได้หนังสือยืนยันสิทธิ์เผยแพร่จาก RID/SWOC

## 7. Unit Tests

`.venv\Scripts\python.exe -m unittest tests.test_reservoirs` → **14/14 ผ่าน (exit=0)**
ครอบคลุมการตรวจช่วงวันที่, ลายเซ็นเนื้อหา, การกันรายงานถูกแทนที่, หน่วย/missing, quality contract และ DuckDB ingestion

## 8. ข้อจำกัดและงานต่อ

- ยืนยันได้เฉพาะ **อ่างขนาดกลาง 461 แห่ง** ตามที่ RID แจ้ง ไม่ใช่อ่างทั้งประเทศ และ **ไม่มีรหัสจังหวัด/พิกัด** (ห้ามตีความเป็นตัวชี้วัดระดับจังหวัด ไม่มีการกุ crosswalk ขึ้นมา)
- `inflow`/`outflow` ยังไม่มีหน่วยยืนยัน → ยังค้างใน `pending_unit_observations` ห้ามใช้คำนวณ balance
- backfill ชุดนี้พิสูจน์ความต่อเนื่องรายวันเฉพาะ 15 วัน — ประวัติย้อนหลังถึง 1998-01-01 ต้อง backfill แบบ bounded หลายรอบตามที่สเปคระบุ
- วิธีตรวจซ้ำ: `python scripts/check_rid_calibration.py --start-date <A> --end-date <B>` (คืน exit code 1 หากวันใดขาด/เสีย checksum/ลายเซ็นไม่ตรง หรือมีวันที่ได้รายงานซ้ำกัน)
