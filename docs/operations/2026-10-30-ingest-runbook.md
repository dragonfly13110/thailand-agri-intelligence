# Ingest runbook — รอบถัดไป (30 ต.ค. 2026)

เอกสารนี้ตอบคำถามเดียว: **ถ้าจะเขียนข้อมูลจริงลง Cloudflare D1 รอบหน้า ต้องพิมพ์คำสั่งอะไร กินโควตาเท่าไร ตรวจอย่างไร และถอยอย่างไร**

สถานะของเอกสาร: จัดทำโดย agent ในโหมดอ่าน/วัดผลเท่านั้น **ไม่มีการอ่าน D1 ไม่มีการเขียน D1 ไม่ได้ส่ง `--write` แม้แต่ครั้งเดียว ไม่ได้โหลด credential ของ D1** ทุกตัวเลขที่เขียนว่า "วัดได้" มาจาก dry-run ของ writer เอง หรือจากการรัน writer กับ SQLite ชั่วคราวใต้ `%TEMP%` ที่สร้างจาก `db/cloudflare/0001`–`0006` จริง ไม่ใช่การประมาณ

วันที่วัด: 2026-10-30 · เครื่อง: Windows + Git Bash · Python: `.venv/Scripts/python.exe` (3.12)

---

## 0. สรุปสั้น

| # | Writer | Dry-run วันนี้ | แถวที่จะเขียน (observations) | โควตาที่ใช้จริง (รวมแถว catalog) | เขียนได้เลยหรือไม่ |
|---|---|---|---:|---:|---|
| A | DLD โคเนื้อ รายจังหวัด (`ingest_dld_livestock_to_d1.py`) | ผ่าน exit 0 · 385 แถว · quarantine 0 | **385** | **468** (0.47%) | ได้ ถ้า migration 0004–0006 ครบ |
| B | DLD มูลค่าปศุสัตว์ระดับประเทศ | **ไม่ผ่าน** exit 1 `RESOURCE_NOT_APPROVED` | 35 (วัดได้ แต่เขียนไม่ได้) | — | **ไม่ได้** |
| C | DLD โคนม/สุกร/ไก่/เป็ด (4 ชนิด) | **ไม่ผ่าน** exit 1 ทุกรายการ | 385 × 4 = 1,540 | — | **ไม่ได้** |
| D | OAE ส่งออก (`tadih ingest --adapter oae_trade`) | ผ่าน exit 0 · 11 แถว | **11** | **17** (0.02%) | ได้ |
| E | OAE ราคาข้าวหอมมะลิรายเดือน (`--adapter oae_paddy_price`) | ผ่าน exit 0 · 100 แถว | **100** | **107** (0.11%) | ได้ |
| F | LDD PGS (`sync_ldd_pgs_progress_to_d1.py`) | **ไม่ผ่าน** exit 1 `RESOURCE_NOT_APPROVED` + **fetch พัง** | 1,616 (วัดได้ แต่เขียนไม่ได้) | — | **ไม่ได้** (ต้องแก้โค้ดก่อน) |
| G | DOAE รายตำบล พืชอายุสั้น (`sync_doae_production_to_d1.py`) | ผ่านประตู licence แต่ **เกิน cap ของ writer** | **178,987** | ~186,000 | **ไม่ได้** (fail-closed) |
| H | DOAE รายตำบล ไม้ผลยืนต้น | ประตู licence **ปิด** + เกิน cap | 153,148 | — | **ไม่ได้** |
| I | MODIS NDVI (`-m tadih.ingest_modis_d1`) | ประตู licence **ปิด** (รายการ validation) | 20 | — | **ไม่ได้** |

**ถ้ารันทุกตัวที่เขียนได้วันนี้: 496 observations / 592 แถวที่ถูกเขียนจริง = 0.59% ของโควตา 100,000 แถว/วัน**
**ถ้ารันทุกตัวในตาราง (รวมที่ติดบล็อก): 335,842 observations = 335.8% ของโควตา → ต้องใช้อย่างน้อย 4 วัน และมีตัวที่เกิน cap ต่อรอบเดียว**

---

## 1. กติการ่วมที่ทุก writer ใช้เหมือนกัน

### 1.1 คำสั่ง python ที่ถูกต้องบนเครื่องนี้

```
# CLI adapter (OAE ทั้งสองตัว)
PYTHONPATH=src .venv/Scripts/python.exe -m tadih ingest --adapter <ชื่อ> --dry-run

# script เดี่ยว (DLD, LDD, DOAE)
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 scripts/<ชื่อ>.py --dry-run
```

เหตุที่ DLD ต้องใช้ script ไม่ใช่ `tadih ingest`: repo ยังไม่มี `src/tadih/ingest_dld_livestock_d1.py` adapter module ที่ CLI จะ import คำสั่งนี้จึงตอบ `ADAPTER_NOT_FOUND` (วัดแล้ว exit 2) ใช้ script เท่านั้น

### 1.2 Environment variables (ชื่อเท่านั้น ไม่พิมพ์ค่า)

| ตัวแปร | ใช้เมื่อ | หมายเหตุ |
|---|---|---|
| `CF_D1_TOKEN` | ทุกคำสั่งที่มี `--write` | ถ้าไม่ตั้ง จะ fallback ไป token ของ `wrangler login` ซึ่งหมดอายุเร็ว |
| `CF_ACCOUNT_ID` | `--write` | มีค่า default ในโค้ดแล้ว |
| `CF_D1_DATABASE_ID` | `--write` | มีค่า default (`tadih-hub`) ในโค้ดแล้ว |

dry-run **ไม่ใช้** credential ทั้งสามตัว (ไม่ได้เรียก `connect_d1_client`)
แหล่งข้อมูลต้นทางของทั้ง 9 writer ไม่ต้องใช้ API key (CKAN datastore / CSV / NABC / Planetary Computer เปิดสาธารณะ)

### 1.3 Migrations

| ไฟล์ | จำเป็นกับใคร | ถ้ายังไม่ apply จะเกิดอะไร |
|---|---|---|
| `0001_hub.sql` | ทุกตัว | ตารางหลักไม่มี → เขียนไม่ได้เลย |
| `0002_observation_extensions.sql` | ทุกตัว (แนะนำ) | writer ตรวจแล้วถอยไปเก็บ provenance ใน `quality` JSON แทน (ไม่พัง แต่ query ตรวจยาก) |
| `0003_nwp.sql` | ไม่เกี่ยว | — |
| `0004_source_year_snapshot_revision.sql` | A, D (และทุกตัวที่ `period_grain` เป็น source-year) | abort ด้วย `SOURCE_YEAR_SNAPSHOT_SCHEMA_REQUIRED` **ก่อนเขียนแถวใด ๆ** |
| `0005_source_year_writer_token.sql` | A, D | abort ด้วย `SOURCE_YEAR_WRITER_TOKEN_SCHEMA_REQUIRED` ก่อนเขียน |
| `0006_source_year_token_snapshot.sql` | D (โหมด token) | abort ด้วย `SOURCE_YEAR_TOKEN_SCHEMA_REQUIRED` ก่อนเขียน |

หลักฐานว่า 0004–0006 **ยังไม่ยืนยันว่า apply แล้ว**: `HANDOFF.md:10` ระบุว่ายังค้าง "apply migrations `0004–0006`" และ `HANDOFF.md:43` ระบุว่า D1 probe รอบก่อน "ยังขาด schema effects ของ 0004–0006"
ผลคือ: ถ้ายังไม่ apply คำสั่ง `--write` ของ A และ D จะ **fail แบบไม่เสียโควตาเลย** (preflight อยู่ก่อน `register_resource` และก่อนสร้าง run) — ตรวจได้ด้วยการรัน `--write` หนึ่งครั้งแล้วอ่าน errorCode แต่จะเสียเวลา 1 รอบ; ทางที่สะอาดกว่าคือให้เจ้าของรันคำสั่งอ่าน metadata นี้ก่อน (อ่านอย่างเดียว ไม่กินโควตา):

```
cd web && npx wrangler d1 execute tadih-hub --remote --command "SELECT name FROM pragma_table_info('sync_runs')"
```

ต้องเห็น `source_revision_id`, `source_year_writer_token`, `source_year_label`, `source_version`, `source_hash` ครบทั้ง 5 คอลัมน์

### 1.4 ประตู licence (ทำงานก่อนแตะต้นทางทุกครั้ง)

`src/tadih/observations.py::assert_resource_approved` ผ่านได้เมื่อ **อย่างใดอย่างหนึ่ง**:

1. `unresolved == []`, หรือ
2. แถว registry มี `publication_authorization` ที่ `basis=project_owner_instruction`, `document=AGENTS.md`, `section=3`, `source_license_verified=false` และ `scope` ครบ 4 ตัว (`fetch`, `process`, `store_in_D1`, `public_numeric_display`)

`license_status=approved_public` อย่างเดียว **ไม่พอ** ถ้ายังมี `unresolved` และ authorization เป็น `open_license_policy` — นี่คือสาเหตุที่ B, C, F, H, I ติดบล็อกทั้งที่ป้าย licence เปิด

### 1.5 ประตูที่สองใน D1 (ตัวที่ทุกคนลืม)

หลัง `register_resource` writer จะเช็กว่าแถว `resources` ใน D1 มี `access_status='approved_public'` และ `project_publication_approved=1` มิฉะนั้นตอบ `RESOURCE_PUBLICATION_NOT_APPROVED`
`register_resource` ใช้ `ON CONFLICT(resource_id) DO NOTHING` คือ **ไม่แก้แถวเดิม** ถ้า metadata crawler เคยสร้างแถว resource_id เดียวกันไว้แบบ `pending` แล้ว การเขียนจะถูกปฏิเสธ
สำหรับ 3 writer ที่เขียนได้ resource_id ที่ writer ใช้เป็น UUID ดิบ (`d3667ca5…`, `05a5c2b7…`, `4570daca…`) ส่วน crawler ใช้กุญแจมี prefix (`<source>:<dataset>:<resource>`) จึงคาดว่าเป็นคนละแถวและไม่ชนกัน — แต่ **ยังไม่ได้ยืนยันกับ D1** ให้เจ้าของรัน preflight นี้ก่อน (อ่านอย่างเดียว ฟรี):

```sql
SELECT resource_id, access_status, project_publication_approved, active_run_id
FROM resources
WHERE resource_id IN (
  'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',  -- DLD โคเนื้อ
  '05a5c2b7-f43b-4232-b7ae-04aca5c63329',  -- OAE ส่งออก
  '4570daca-e727-4036-bde9-35fd84d0ffd4'   -- OAE ราคาข้าวหอมมะลิ
);
```

- ถ้าไม่เห็นแถวเลย → ดี, writer จะสร้างแถวใหม่ที่ approved เอง
- ถ้าเห็นแถวและค่าไม่ใช่ `approved_public` / `1` → **หยุด** แล้วให้เจ้าของตัดสินใจว่าจะแก้ 2 คอลัมน์นั้น (เขียน 1 แถว) หรือไม่

### 1.6 วิธีที่ writer กันการเขียนซ้ำ

`run_id = uuid5(namespace, "<resource_id>|<adapter_version>|<sha256 ของ payload>" [+ revision/token])`
 payload hash ตัดฟิลด์ที่เปลี่ยนทุกครั้ง (`retrieved_at`, provider revision, release_at) ออก ดังนั้น **ต้นทางไม่เปลี่ยน = run_id เดิม = รอบสองไม่ insert แถวใหม่** และรายงาน `skipped_identical`
วัดจริงแล้ว (SQLite harness, 3 writer): รอบสอง `records_inserted=0`, `skipped_identical` = จำนวนแถวทั้งหมด, แถวที่ถูกเขียนจริงเหลือ 1 แถว (UPDATE `sync_runs`)
**ข้อยกเว้น:** ถ้าต้นทางออก revision ใหม่ (เช่น DLD อัปเดตไฟล์) run_id จะใหม่ทั้งหมด แล้ว writer จะ insert **ครบทุกแถวอีกครั้ง** การรันซ้ำ "เผื่อไว้" จึงไม่ฟรี

---

## 2. Writer A — DLD ปศุสัตว์ โคเนื้อรายจังหวัด

- registry: `dld_livestock_cattle_province` → `license_status=approved_public`, `project_publication_approved=true`, `unresolved` 3 ข้อ **แต่มี** `publication_authorization` แบบ `project_owner_instruction` ครบ scope → ผ่านประตู
- resource_id ที่จะเขียน: `d3667ca5-5982-4c9e-9b0d-04e729dbe31b`
- grain: จังหวัด × ปี พ.ศ. (2564–2568) · หน่วย `ตัว` · `period_grain=source_year_label`

**dry-run ที่รันจริง**
```
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 scripts/ingest_dld_livestock_to_d1.py --resource-key dld_livestock_cattle_province --dry-run
```
ผล: `exit 0`, `status=prepared`, `sourceReportedRows=385`, `rowsFetched=385`, `writerRowsQuarantined=0`, `completeness=complete`, `wouldPassSourceBatchGate=true`, `payloadSha256=476dd3e4…014f`, 1 request

**คำสั่งที่จะเขียนจริง (ยังไม่รัน)**
```
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 scripts/ingest_dld_livestock_to_d1.py --resource-key dld_livestock_cattle_province --write
```

**แถวที่คาด:** 385 observations (77 จังหวัด × 5 ปี) + 77 `locations` + 6 แถว catalog/run = **468 แถวที่ถูกเขียน** (วัดจาก SQLite harness ที่ payload hash ตรงกับ dry-run เป๊ะ)
**รันซ้ำ:** `skipped_identical=385`, insert 0, เขียนจริง 1 แถว
**run_id ที่คาด (ถ้าต้นทางไม่เปลี่ยน):** `93ecfef7-3a37-5b0f-9e21-2b04401cd8ca`

**ข้อควรระวังเฉพาะตัวนี้**
- มี writer เก่าชื่อ `scripts/sync_dld_beef_cattle_to_d1.py` เขียน **resource เดียวกัน** ด้วย `adapter_version` คนละตัว → run_id คนละตัว → ถ้ารันทั้งสอง จะได้ run ที่สองเพิ่ม 385 แถวซ้ำ (วัด dry-run แล้วได้ 385 แถวและ payload hash เดียวกัน) **ให้ใช้ script ใหม่ตัวเดียว**
- ถ้ารอบหลังจำนวนแถวลดลงเทียบ snapshot ที่ active อยู่ writer จะ **ไม่สลับ active** และคืน `SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW` + exit 1 ต้องมีไฟล์ `--rowset-review-file` ที่ผ่านการรีวิว

**ตรวจหลังเขียน (อ่านอย่างเดียว)**
```sql
SELECT r.resource_id, r.active_run_id AS run_id, run.status, run.records_written,
       (SELECT count(*) FROM observations o
        WHERE o.resource_id=r.resource_id AND o.run_id=r.active_run_id) AS published_rows,
       CASE WHEN r.access_status='approved_public' AND r.project_publication_approved=1
                 AND run.kind='numeric' AND run.status IN ('succeeded','partial')
            THEN 'served' ELSE 'not served' END AS served
FROM resources r
LEFT JOIN sync_runs run ON run.run_id=r.active_run_id AND run.resource_id=r.resource_id
WHERE r.resource_id='d3667ca5-5982-4c9e-9b0d-04e729dbe31b';
```
คาด: `published_rows=385`, `status=succeeded`, `served`

**ถอย (rollback) — แถวไม่ถูกลบ**
```sql
-- 1) ดู run ที่มี
SELECT run_id,status,started_at,completed_at,records_written
FROM sync_runs WHERE resource_id='d3667ca5-5982-4c9e-9b0d-04e729dbe31b'
ORDER BY started_at DESC;
-- 2) ปิดการมองเห็น (ครั้งแรกที่ยังไม่มี run ก่อนหน้า)
UPDATE resources SET active_run_id=NULL
WHERE resource_id='d3667ca5-5982-4c9e-9b0d-04e729dbe31b' AND active_run_id='93ecfef7-3a37-5b0f-9e21-2b04401cd8ca';
-- หรือชี้กลับ run ก่อนหน้า
UPDATE resources SET active_run_id='<run_id_ก่อนหน้า>'
WHERE resource_id='d3667ca5-5982-4c9e-9b0d-04e729dbe31b';
```
สอดคล้องกับวิธีเดิมของโปรเจกต์: ทุกหน้าอ่านเฉพาะ `resources.active_run_id` (และ `sync_runs.kind='numeric'`, `status IN ('succeeded','partial')`) จึงเก็บ run เก่า + แถวเดิมไว้เป็นประวัติได้ ไม่ต้องลบ และไม่เสียโควตาก้อนใหญ่

---

## 3. Writer B — DLD มูลค่าปศุสัตว์ระดับประเทศ (ติดบล็อก)

- registry: `dld_national_livestock_value` · `unresolved` = ["Calendar vs fiscal year convention", "Historical release timestamps"] · `publication_authorization.basis = open_license_policy` → **ไม่เข้าเงื่อนไข owner authorization**

**dry-run ที่รันจริง**
```
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 scripts/ingest_dld_livestock_to_d1.py --resource-key dld_national_livestock_value --dry-run
```
ผล: **exit 1**
```json
{"status": "failed", "errorCode": "RESOURCE_NOT_APPROVED", "message": "resource review still has unresolved items"}
```
ประตูทำงานก่อนต่อต้นทาง จึงไม่มี request ออกไปและไม่มีตัวเลขใน dry-run
ตัวเลขที่วัดแยก (เรียก fetcher/normalizer ตรง ๆ แบบอ่านอย่างเดียว): 35 แถวต้นทาง (5 หมวด × 7 ปี 2562–2568) → **35 observations**, quarantine 0, หน่วย `ล้านบาท`
ถ้าเจ้าของเปิดสิทธิ์ให้ทรัพยากรนี้ ต้องแก้ที่แถว registry (เพิ่ม `publication_authorization` แบบ `project_owner_instruction`) — **ไม่ใช่แก้โค้ด** และต้องเป็นการตัดสินใจของเจ้าของ ไม่ใช่ของ agent
คำสั่ง `--write` (ใช้ได้หลังปลดบล็อกเท่านั้น): `… --resource-key dld_national_livestock_value --write` · โควตาราว 35 + catalog

---

## 4. Writer C — DLD โคนม / สุกร / ไก่ / เป็ด (ติดบล็อกทั้ง 4)

dry-run ทั้ง 4 คำสั่ง (เหมือน B ต่างแค่ `--resource-key`):

| resource key | dry-run exit | errorCode |
|---|---:|---|
| `dld_livestock_dairy_province` | 1 | `RESOURCE_NOT_APPROVED` |
| `dld_livestock_swine_province` | 1 | `RESOURCE_NOT_APPROVED` |
| `dld_livestock_poultry_province` | 1 | `RESOURCE_NOT_APPROVED` |
| `dld_livestock_duck_province` | 1 | `RESOURCE_NOT_APPROVED` |

**สรุปให้แม่น:** ข้อความที่ task ว่า "fail-closed on unresolved licence items" นั้นถูกในผลลัพธ์ แต่เหตุผลไม่ใช่เฉพาะ licence — `unresolved` ของ 4 ตัวนี้เป็น **เรื่องปีอ้างอิง/ความหมายคอลัมน์ `year`** (และไก่มีข้อ "ห้ามแยกไก่เนื้อ/ไก่ไข่") ส่วนป้าย licence เป็น Open Data Common ที่ระบบ auto-approve ไปแล้ว สิ่งที่บล็อกคือ **ยังไม่มี owner authorization สำหรับ unresolved ที่เหลือ** ตัวโค้ดไม่ได้อ่านป้าย licence มาตัดสิน
วัดจำนวนแถวแยก (อ่านอย่างเดียว): ทั้ง 4 ตัวมี 385 แถวต้นทางเท่ากัน (77 จังหวัด × 5 ปี) → **385 observations ต่อตัว, รวม 1,540** ถ้าปลดบล็อก

---

## 5. Writer D — OAE ส่งออกสินค้าเกษตร (`oae_trade`)

- registry: `oae_agricultural_exports` · มี `publication_authorization` แบบ `project_owner_instruction` ครบ scope → ผ่านประตู (แม้ `unresolved` ยังมี 1 ข้อ)
- โหมด `period_grain=source_year_token` → **ต้องมี migration 0004, 0005, 0006**
- resource_id: `05a5c2b7-f43b-4232-b7ae-04aca5c63329`

**dry-run ที่รันจริง**
```
PYTHONPATH=src .venv/Scripts/python.exe -m tadih ingest --adapter oae_trade --dry-run
```
ผล: `exit 0`, `status=prepared`, `sourceRowsReceived=11`, `sourceYearLabels=["2568"]`, `writerValidationStatus=valid`, 3 requests, `payloadSha256=2a1c0247…b851`

**คำสั่งที่จะเขียนจริง (ยังไม่รัน)**
```
PYTHONPATH=src .venv/Scripts/python.exe -m tadih ingest --adapter oae_trade --write
```

**แถวที่คาด:** 11 observations (1 แถวต่อสินค้า) + 6 แถว catalog/run = **17 แถวที่ถูกเขียน**
**รันซ้ำ:** `skipped_identical=11`, insert 0, เขียนจริง 1 แถว
**run_id ที่คาด:** `fdfd5991-e578-5177-9673-afd75920db43`

**ตรวจหลังเขียน**
```sql
SELECT r.resource_id, r.active_run_id AS run_id, run.status, run.records_written,
       (SELECT count(*) FROM observations o
        WHERE o.resource_id=r.resource_id AND o.run_id=r.active_run_id) AS published_rows
FROM resources r
LEFT JOIN sync_runs run ON run.run_id=r.active_run_id AND run.resource_id=r.resource_id
WHERE r.resource_id='05a5c2b7-f43b-4232-b7ae-04aca5c63329';
```
คาด `published_rows=11`

**ถอย**
```sql
UPDATE resources SET active_run_id=NULL
WHERE resource_id='05a5c2b7-f43b-4232-b7ae-04aca5c63329'
  AND active_run_id='fdfd5991-e578-5177-9673-afd75920db43';
```

---

## 6. Writer E — OAE ราคาข้าวเปลือกหอมมะลิรายเดือน (`oae_paddy_price`)

- registry: `oae_nabc_monthly_jasmine_paddy_price` · licence = CC BY-NC (non-commercial) · `unresolved=[]` → ผ่านประตูด้วย `open_license_policy`
- โหมด `period_grain=monthly` → ใช้ `0001` (+`0002` เพื่อเก็บ provenance) ไม่ต้องพึ่ง 0004–0006
- resource_id: `4570daca-e727-4036-bde9-35fd84d0ffd4`

**dry-run ที่รันจริง**
```
PYTHONPATH=src .venv/Scripts/python.exe -m tadih ingest --adapter oae_paddy_price --dry-run
```
ผล: `exit 0`, `status=prepared`, `sourceRowsReceived=100`, `upstreamTotalRows=189`, `missingValues=0`, `observedMonthRange=["2018-06","2026-09"]`, `writerValidationStatus=valid`, 1 request, `payloadSha256=2fd73bf9…3a6c`

**คำสั่งที่จะเขียนจริง (ยังไม่รัน)**
```
PYTHONPATH=src .venv/Scripts/python.exe -m tadih ingest --adapter oae_paddy_price --write
```

**แถวที่คาด:** 100 observations (1 แถวต่อเดือน) + 7 แถว catalog/run = **107 แถวที่ถูกเขียน**
**รันซ้ำ:** `skipped_identical=100`, insert 0, เขียนจริง 1 แถว
**run_id ที่คาด:** `a673b5b3-cad6-59bb-a95e-5fe0971f3fb5`

**ข้อจำกัดข้อมูลที่ต้องรู้ก่อนอนุมัติ (สำคัญ):** adapter อ่าน **หน้าเดียว** (`pageFollowed=false`) ต้นทางบอกว่ามี 189 แถว แต่หยิบมา 100 → หน้าเว็บจะเห็นประวัติ 2018-06 ถึง 2026-09 เท่านั้น และ writer ยังรายงาน `completeness=complete` ของ "หน้านี้" ไม่ใช่ของทั้งชุด ตัวเลขบนจอจะถูกต้องแต่ **ย้อนหลังไม่ครบ** ถ้าต้องการครบต้องแก้ adapter ให้ตามหน้าถัดไป (งานโค้ด ไม่ใช่งาน ingest)

**ตรวจหลังเขียน**
```sql
SELECT r.resource_id, r.active_run_id AS run_id, run.status, run.records_written,
       (SELECT count(*) FROM observations o
        WHERE o.resource_id=r.resource_id AND o.run_id=r.active_run_id) AS published_rows,
       (SELECT min(period_start) FROM observations o
        WHERE o.resource_id=r.resource_id AND o.run_id=r.active_run_id) AS first_month
FROM resources r
LEFT JOIN sync_runs run ON run.run_id=r.active_run_id AND run.resource_id=r.resource_id
WHERE r.resource_id='4570daca-e727-4036-bde9-35fd84d0ffd4';
```
คาด `published_rows=100`, `first_month` ขึ้นต้น `2018-06`

**ถอย**
```sql
UPDATE resources SET active_run_id=NULL
WHERE resource_id='4570daca-e727-4036-bde9-35fd84d0ffd4'
  AND active_run_id='a673b5b3-cad6-59bb-a95e-5fe0971f3fb5';
```

---

## 7. Writer F — LDD PGS (ติดบล็อก 2 ชั้น)

- registry: `ldd_pgs_program_progress` · CC BY-NC-ND · `unresolved` 2 ข้อ · authorization = `open_license_policy` → ไม่ผ่านประตู

**dry-run ที่รันจริง**
```
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 scripts/sync_ldd_pgs_progress_to_d1.py --dry-run
```
ผล: **exit 1** `{"status":"failed","errorCode":"RESOURCE_NOT_APPROVED","message":"resource review still has unresolved items"}` (ประตูอยู่ก่อน fetch จึงยังไม่เห็นตัวเลข)

**ชั้นที่สองที่ยังไม่มีใครบันทึกไว้:** ตัวสร้าง URL ของ adapter ใส่ชื่อคอลัมน์ภาษาไทยและ **เว้นวรรคดิบ** ลงใน query string (`…&fields=เป้าหมาย (กลุ่ม),…`) ทำให้ `http.client` ปฏิเสธก่อนถึงเซิร์ฟเวอร์
หลักฐาน: เรียก `fetch_ldd_pgs_progress()` ตรง ๆ → `http.client.InvalidURL: URL can't contain control characters … (found at least ' ')`
ทดสอบด้วย URL เดียวกันที่ percent-encode ถูกต้อง (อ่านอย่างเดียว 1 request) → สำเร็จ `total=202`, คืน 202 แถว
ดังนั้น **ถึงเจ้าของจะปลดบล็อก licence แล้ว `--write` ก็ยังพัง** ต้องแก้ `src/tadih/ldd_pgs_progress.py` (`RESOURCE_URL`) ให้ quote ค่าก่อน — อย่าเพิ่งอนุมัติ ingest ตัวนี้

ตัวเลขที่วัดได้ผ่าน request แบบ quote เอง (202 แถว × 8 คอลัมน์): **1,616 observations**, quarantine 0, 84 หน่วยรายงาน, ปีงบ 2566
run_id ในเงื่อนไขนี้จะขึ้นกับ payload; ยังไม่คำนวณเป็นตัวเลขจริงเพราะโค้ดยัง fetch ไม่ได้

---

## 8. Writer G — DOAE รายตำบล พืชอายุสั้น (ตัวที่เสี่ยงที่สุด)

- registry: `doae_production_subdistrict_2023` · `unresolved=[]` → **ประตู licence ผ่าน**
- ข้อมูลมาจาก staging ในเครื่อง (`data/local/production/staged/a505aa24…`) ไม่ต่อเน็ต

**dry-run ที่รันจริง**
```
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 scripts/sync_doae_production_to_d1.py --resource doae_production_subdistrict_2023 --dry-run
```
ผล: `exit 0`, `registryGate=passed`, `recordsRetained=50,103`, `nullMeasuresSkipped=121,631`, `rowsBridged=178,987`, `overWriterCap=true`, `rowsPrepared=100,000` (ตรวจได้แค่ prefix แรก), `writerRowsQuarantined=0`, `distinctSubdistrictLocations=7,124`, 77 จังหวัด

**ทำไม `--write` ทำไม่ได้วันนี้:** writer มี cap 100,000 แถวต่อ batch และเช็ก `overWriterCap` **ก่อน** สร้าง D1 client (บรรทัด 363 vs 437 ของ `doae_production_bridge.py`) จึง abort ด้วย `BATCH_OVER_WRITER_CAP` โดยไม่แตะ D1 เลย — fail-closed ฟรี ไม่เสียโควตา
โควตาจริงถ้าเขียนได้: **178,987 observations = 179% ของโควตารายวัน** (ยังไม่นับ 7,124 locations)

**ทำไม "แบ่งรัน" ไม่ใช่ทางแก้:** ทุกหน้าอ่านเฉพาะ `resources.active_run_id` run เดียว การรันด้วย `--source-year` / `--crop-group` จะได้ run สถานะ `partial` คนละ run และ **เห็นแค่ชิ้นสุดท้าย** ข้อมูลชิ้นก่อนหน้าจะกลายเป็นแถวที่ไม่มีใครอ่าน
ตัวเลขแบ่งตามปีที่วัดได้: 2566 = 177,676 แถว (ยังเกิน cap), 2567 = 1,311 แถว
แบ่งตามกลุ่มพืชของปี 2566: พืชผัก 90,970 · พืชไร่ 38,129 · ข้าว 32,432 · สมุนไพร (รต.01) 10,601 · ไม้ดอก 3,859 · ไม้ประดับ 1,684 · สมุนไพร (รต.02) 1
ทางเลือกที่ถูกต้องมีสองทางเท่านั้น: (ก) ยก cap แล้วยอมกินโควตา ~1.8 วันในรอบเดียว หรือ (ข) เปลี่ยนโมเดลการอ่านให้ประกอบหลาย run — ทั้งสองเป็นการตัดสินใจของเจ้าของ ไม่ใช่สิ่งที่ agent ควรทำเงียบ ๆ

**ห้ามรัน `--write` ตัวนี้จนกว่าจะมีคำตอบ**

---

## 9. Writer H — DOAE ไม้ผลยืนต้น (ติดบล็อก)

```
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 scripts/sync_doae_production_to_d1.py --resource doae_perennial_subdistrict_2023 --dry-run
```
ผล: `exit 0` แต่ `registryGate={"status":"blocked_for_write","reason":"resource review still has unresolved items"}` → dry-run เดินต่อได้ แต่ `--write` จะถูกปฏิเสธด้วย `RESOURCE_NOT_APPROVED`
ตัวเลข: `recordsRetained=54,192`, `rowsBridged=153,148`, `overWriterCap=true`
**ติด 2 ชั้น** (licence + cap) — ไม่ต้องอนุมัติในรอบนี้

---

## 10. Writer I — MODIS NDVI (ติดบล็อก)

```
PYTHONPATH='src;.' .venv/Scripts/python.exe -X utf8 -m tadih.ingest_modis_d1 --dry-run --snapshots data/local/satellite
```
ผล: `exit 0`, `records_read=20`, `records_written=0`,
```json
"publication_gate": {"passed": false, "errorCode": "RESOURCE_NOT_APPROVED",
  "unresolved": ["Validation of cloud masking vs field survey references across Thai agricultural regions"]}
```
**สรุปให้แม่น:** licence ของ NASA/MOD13A1 ถูกบันทึกว่า verified เปิดจริง ข้อที่บล็อกคือ **รายการ validation คุณภาพข้อมูล** (cloud mask เทียบภาคสนาม) ไม่ใช่เรื่อง licence — โค้ดเดียวกันกันทั้งสองกรณีด้วยข้อความเดียว
แถวที่จะเขียนถ้าปลดบล็อก: **20 observations** (5 จุด × 4 ตัวชี้วัด) ต่อรอบ; ถ้าใช้ `--snapshots` ค่า `retrieved_at` จะเป็น 2026-10-22 (เก่า) ควรใช้ live ตอนเขียนจริง
**ห้ามรัน `--write` ในรอบนี้**

---

## 11. ลำดับที่แนะนำ + เหตุผล

| ลำดับ | คำสั่ง | แถวที่เขียน | ทำไมอยู่ลำดับนี้ |
|---|---|---:|---|
| 0 | preflight อ่าน 2 คำสั่ง (§1.3 คอลัมน์ schema, §1.5 แถว resources) | 0 | ตรวจของถูกก่อนจ่ายเงิน |
| 1 | **OAE ราคาข้าวหอมมะลิ** (§6) | 107 | เส้นทางสั้นสุด: 1 request, ใช้ schema แค่ 0001/0002, มีแถว 100 พอจะเห็นกราฟบนหน้าเว็บจริง และถ้าพังก็เสียของน้อย |
| 2 | **OAE ส่งออก** (§5) | 17 | น้อยสุดในแง่แถว และเป็นตัวเดียวที่พิสูจน์โหมด source-year token (0004–0006 + CAS) ถ้า migration ขาดจะรู้ทันทีโดยไม่เสียแถวข้อมูล |
| 3 | **DLD โคเนื้อ** (§2) | 468 | พิสูจน์โหมด snapshot เต็มรูปแบบ (77 locations + active pointer + rowset guard) เป็นตัวที่กลไกซับซ้อนสุดในกลุ่มที่ทำได้ |

เหตุผลที่ไม่ได้เรียงตามตัวอักษรหรือตามขนาด: ตัวถูกสุด (ส่งออก 17 แถว) ต้องใช้ schema ใหม่กว่าตัวกลาง (ราคา 100 แถว) การเริ่มที่ราคาข้าวจึงแยกปัญหา "D1 เขียนได้ไหม" ออกจากปัญหา "migration 0004–0006 ครบไหม" ได้ชัดกว่า

**หลังจบ 3 ตัว:** หยุด รอ 24 ชม. ดูยอดโควตาและหน้าเว็บก่อนตัดสินใจเรื่อง DOAE/LDD/MODIS
ถ้าอยากพิสูจน์ว่า "รันซ้ำไม่เปลือง" ให้รันคำสั่งเดิมซ้ำ **1 ตัวเท่านั้น** (แนะนำตัวราคาข้าว) แล้วคาดหวัง `records_inserted=0`, `skipped_identical=100`, แถวเขียนจริง 1

## 12. หยุดทันทีเมื่อเข้าเงื่อนไขต่อไปนี้ (stop rules)

1. dry-run ใหม่ให้ตัวเลขไม่ตรงกับตาราง §0 เกิน ±5% → ต้นทางเปลี่ยน หยุด คำนวณใหม่ก่อน
2. หลัง `--write` ค่า `records_written` มากกว่าที่คาดเกิน 10% → หยุด อย่ารันตัวถัดไป แล้ว rollback ตัวที่เพิ่งรัน
3. writer ตัวไหนรายงาน `status=partial` หรือ `active_run_switched=false` หรือ exit 1 → หยุดทั้งรอบ
4. เห็น `RESOURCE_NOT_APPROVED` หรือ `RESOURCE_PUBLICATION_NOT_APPROVED` → หยุด (แปลว่า precondition ข้อ 1.4/1.5 ไม่จริง) อย่าแก้ registry ตามเอง
5. ยอด rows written ของวันใน Cloudflare dashboard เกิน 50,000 → หยุด (เหลือ buffer ครึ่งวัน)
6. มีคนสั่งให้รัน DOAE, LDD, MODIS, DLD ระดับประเทศ หรือ DLD 4 ชนิด → หยุด เพราะยังติดบล็อกหรือเกิน cap
7. จะรัน writer ตัวเดิมซ้ำเป็นครั้งที่ 2 ภายในวันเดียวโดยไม่อยากได้ run ใหม่ → หยุดก่อน ตรวจว่าต้นทางออก revision ใหม่หรือไม่
8. เห็นคำสั่งที่อ้าง `scripts/sync_dld_beef_cattle_to_d1.py` → หยุด ใช้ `ingest_dld_livestock_to_d1.py` เท่านั้น

## 13. Owner approval checklist (หนึ่งหน้า)

อนุญาตเฉพาะรายการที่ติ๊กแล้วเท่านั้น ทุกรายการระบุโควตาที่จะใช้

- [ ] **0.1** รันคำสั่งอ่าน schema (`pragma_table_info('sync_runs')`) — 0 แถว
- [ ] **0.2** รันคำสั่งอ่าน `resources` 3 แถว (§1.5) — 0 แถว
- [ ] **0.3** ถ้าจำเป็นต้อง apply migration 0004–0006 — เขียนแค่ตาราง `d1_migrations` (~3 แถว)
- [ ] **0.4** ถ้า preflight 0.2 พบแถวเดิมที่ยัง `pending` และเจ้าของเลือกจะอนุมัติ — UPDATE 1 แถวต่อ resource
- [ ] **1** เขียน OAE ราคาข้าวหอมมะลิ — **107 แถว**
- [ ] **2** เขียน OAE ส่งออก — **17 แถว**
- [ ] **3** เขียน DLD โคเนื้อ — **468 แถว**
- [ ] **4** (ไม่บังคับ) รันซ้ำ 1 ตัวเพื่อยืนยัน `skipped_identical` — **1 แถว**
- [ ] **5** (ถ้าต้องถอย) UPDATE `resources.active_run_id` — **1 แถวต่อครั้ง**

**รวมที่ขออนุมัติในรอบนี้: 592 แถว (0.59% ของโควตารายวัน)**

ไม่อนุมัติในรอบนี้ (ยังติดบล็อก/เกิน cap): DLD ระดับประเทศ · DLD โคนม/สุกร/ไก่/เป็ด · LDD PGS · DOAE พืชอายุสั้น · DOAE ไม้ผลยืนต้น · MODIS NDVI

## 14. สิ่งที่พบระหว่างจัดทำ (ต้องตัดสินใจ ไม่ใช่แค่ข้อมูลประกอบ)

1. **DLD ระดับประเทศไม่ผ่านประตู** ทั้งที่ task ถือว่าอนุมัติแล้ว — registry ใช้ `open_license_policy` ไม่ใช่ `project_owner_instruction` และยังมี `unresolved` 2 ข้อ ถ้าต้องการตัวเลขนี้จริงต้องอนุมัติที่ registry
2. **LDD PGS fetch ไม่ได้เลย** เพราะ URL มีเว้นวรรคดิบ (`InvalidURL`) — ต้องแก้โค้ดก่อน แม้อนุมัติ licence แล้วก็ตาม
3. **DOAE พืชอายุสั้น 179% ของโควตารายวัน** และ "แบ่งรัน" ให้ผลผิดเชิงความหมาย เพราะหน้าอ่าน run เดียว
4. **OAE ราคาข้าวอ่านแค่หน้าแรก 100 จาก 189 แถว** แต่รายงาน `completeness=complete` ของหน้านั้น — ควรแก้ adapter ให้ตามหน้า หรือแก้ข้อความความครบถ้วน
5. **มี writer ซ้ำสำหรับ DLD โคเนื้อ** (legacy + ใหม่) เขียน resource เดียวกัน คนละ adapter_version
6. **0004–0006 ยังไม่ยืนยันว่า apply** — ถ้ายังไม่ apply ตัว A และ D จะ abort แบบไม่เสียโควตา แต่จะเสียเวลารอบหนึ่ง

## 15. วิธีทำซ้ำผลในเอกสารนี้ (ไม่แตะ D1)

- dry-run ทุกตัวตามคำสั่งใน §2–§10 (ผลที่อ้างอิงอยู่ในไฟล์ JSON ใต้ `%TEMP%`: `oae_trade_dry.json`, `oae_paddy_dry.json`, `dld_cattle_dry.json`, `dld_national_dry.json`, `ldd_pgs_dry.json`, `doae_short_dry.json`, `doae_per_dry.json`, `modis_dry.json`)
- ตัวเลข "แถวที่ถูกเขียนจริง" วัดโดยรัน `publish_observations` สองรอบกับ SQLite ชั่วคราวที่สร้างจาก `0001`–`0006` โดย client จำลอง (`%TEMP%/tadih_runbook_harness.py` + `%TEMP%/drive_*.py`) และยืนยันว่า `payloadSha256` ของ harness ตรงกับ dry-run ของ writer จริงทุกตัว (paddy `2fd73bf9…`, trade `2a1c0247…`, DLD `476dd3e4…`)
- harness นับแถวที่ถูกแก้ด้วย `sqlite3.total_changes` ซึ่งเป็นตัวแทนของ "rows written" ของ D1 ไม่ใช่ค่าที่อ่านจาก D1

**สิ่งที่เอกสารนี้ไม่ได้ทำและห้ามถือว่าทำแล้ว:** ไม่ได้อ่านหรือเขียน D1, ไม่ได้ส่ง `--write`, ไม่ได้ apply migration, ไม่ได้แก้โค้ด/registry, ไม่ได้ deploy, ไม่ได้ commit
