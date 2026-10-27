# Lane 1 — Shared observation writer (audit ข้อ 1 และ 4)

## ฐานตั้งต้น

- ทำงานบน working tree ปัจจุบันของ `T:\coding+\BI AGRI THAILAND` (branch `main`, `git log -3`: `14026f0`, `23b28ee`, `55e9036`) ไม่ checkout/reset/stash/commit/push/deploy
- ไฟล์ที่แก้ได้มี 3 ไฟล์ตาม prompt; diff ตั้งต้นของสองไฟล์ production/test ถูกเก็บที่ `.tmp_qa/audit-repair-lane-1/baseline.diff`
- งาน uncommitted เดิมของเจ้าของโปรเจคใน `observations.py`/`test_observations.py` (daily period ใช้ calendar day ตาม timezone offset) ถูกเก็บไว้ทั้งหมด ไม่ย้อนหรือเขียนทับ
- ไม่มีการแก้ schema, adapter, config, shared types หรือเอกสารกลาง; ไม่เขียน D1 จริง

## สิ่งที่แก้

### 1. [P1] Backfill/retry ไม่ทำให้ `resources.active_run_id` ถอยไปวันเก่า

- `_switch_active_run` เดิมสั่ง `UPDATE resources SET active_run_id=?` ตรง ๆ จึงย้อนวันได้ทั้งเส้นทาง publish ปกติและ `_finish_existing_run`
- ใหม่: การตรวจและสลับ pointer อยู่ใน **UPDATE เดียว** ด้วย `CASE` ที่เทียบ `MAX(period_start)` ของ run ผู้สมัครกับของ run ที่ `resources.active_run_id` ชี้อยู่ **ณ จังหวะที่ statement รัน** จึงไม่มีช่อง check-then-write ให้สองงานซ้อนกันสลับ pointer ย้อนวัน
  - `active_run_id IS NULL` หรือ active run ไม่มี observation → สลับได้
  - period ของผู้สมัครใหม่กว่าหรือเท่ากับ active → สลับ (รองรับ revision วันเดียวกัน)
  - period เก่ากว่า → คง pointer เดิม, คืน `(False, "ACTIVE_RUN_OLDER_THAN_ACTIVE")`
  - resource ถูก revoke หรือ run ผู้สมัครไม่ final → `RETURNING` ไม่มีแถว → `ACTIVE_RUN_SWITCH_FAILED` เหมือนเดิม
- ใช้ `period_start` (วัน/ช่วงข้อมูล) เป็นตัวตัดสิน ไม่ใช้ `retrieved_at`; แถวของ run เก่ายังถูกเขียนครบและไม่ถูกลบ
- `publish_observations` และ `_finish_existing_run` รับค่าเป็น tuple และเพิ่ม key ใหม่ใน envelope: `active_run_blocked_reason` (`null` หรือ `"ACTIVE_RUN_OLDER_THAN_ACTIVE"`)
- อัปเดต module docstring เป็นกฎข้อ 9 (monotonic activation)

### 2. [P2] Semantic revision ของวันเดียวกันไม่ถูก skip เงียบอีกต่อไป

- `_logical_payload_sha256` เดิม hash เฉพาะ `(resource_id, observation_id, period_start, unit, value)`
- ใหม่: `_logical_row` ครอบ durable identity/semantics ต่อแถว — `observation_id`, period start/end, unit, value, measure, spatial_support, data_kind, area_code (จังหวัด/พื้นที่), commodity_id, market_id, grade, price_type, season, location id/kind/native_code/province_code/name, product, metric_name และ published `dimensions`
- `dimensions` ถูก canonicalize (`sort_keys`) และตัด volatile keys ผ่าน `VOLATILE_DIMENSION_KEYS`: `sourceTimeStamp`, `releaseAt`, `retrievedAt`, `revisionId`, `etag`, `lastModified`, `lastBuildDate`, `generatedAt`, `fetchedAt` (normalize case/ตัวคั่น) เพื่อรักษา D-2: ETag/LastBuildDate/`releaseAt`/timestamp ที่ upstream echo ต่อ request ยัง idempotent
- ผล: `provinceCode` 73 → 10 (หรือ area/commodity/market/grade เปลี่ยน) ได้ run ใหม่, active สลับไป run ใหม่เมื่อ period เท่าเดิม, แถวเก่ายังเก็บใต้ run เดิมเป็นประวัติ
- Rollout note (บันทึกใน docstring แล้ว): derived run id เปลี่ยนหนึ่งครั้งต่อ resource; republish ครั้งแรกหลัง deploy จะสร้าง run ใหม่ 1 run ต่อ resource แล้วกลับมาอิดемpotent ตามปกติ ข้อมูลเดิมไม่หาย

### สิ่งที่คงไว้ตามเดิม

License gate, null/unit guards (unit NULL + `pending_official_confirmation`), D-9 mixed-unit activation block, failed-run preservation, D1-side approval/revocation guard, `_row_matches`/`_row_count`, schema และ adapter ทุกตัวไม่ถูกแก้

## API/behavior ที่เปลี่ยนและผลต่อ callers

| สัญญา | เดิม | ใหม่ |
|---|---|---|
| `active_run_switched` | `False` = ไม่ได้สลับเพราะ guard/approval ปิด | ยังเป็น bool; `False` เพิ่มความหมาย "มี run ที่ใหม่กว่าอยู่แล้ว จึงไม่สลับ" |
| `activation_blocked_reason` | reason ของ D-9 (`UNIT_MIXED_NULL_BATCH`) เท่านั้น | คงเดิม ไม่เปลี่ยนความหมาย |
| `active_run_blocked_reason` | ไม่มี | ใหม่: `null` หรือ `"ACTIVE_RUN_OLDER_THAN_ACTIVE"` |
| `_switch_active_run` (private) | คืน `bool` | คืน `(switched, blocked_reason)`; ใช้ภายในโมดูลเท่านั้น (grep แล้วไม่มี caller อื่น) |
| run id | hash 5 ฟิลด์ | hash semantic rows; เปลี่ยนหนึ่งครั้งตอน deploy (ดู rollout note) |

Callers ที่ตรวจแล้ว: `ingest_tmd_d1.py` คัดเฉพาะ key เข้า summary (ไม่พัง), `ingest_gistda_d1.py` spread envelope (key ใหม่จะโผล่ใน JSON เพิ่มเติม), `sync_rid_to_d1.py`/`ingest_rid_d1.py`/`ingest_open_meteo_d1.py`/`hub_numeric_sync.py` อ่าน key เฉพาะ — ไม่มี caller ใดต้องแก้ และการถูก block ไม่ทำให้ publish ล้มเหลว (run ยัง succeeded/partial และแถวถูกเขียนครบ)

## Tests ที่เพิ่ม (regression ตามพฤติกรรมที่ถูกต้อง)

ใน `tests/test_observations.py` (ใช้ `SqliteD1Mock`/helpers เดิม):

1. `test_backfill_and_retry_never_move_the_active_run_backwards` — 24 → 25 → retry 24 (skipped_identical=1, ไม่สลับ) → backfill 23 (run สำเร็จ แต่ไม่สลับ); active ยัง 25 และแถววันเก่าครบ
2. `test_interleaved_newer_publish_blocks_an_older_activation` — `ActivationHookClient` จำลองงานอื่นสลับ active เป็นวันที่ 26 ก่อนจังหวะ UPDATE ของงาน backfill วันที่ 23; active ต้องอยู่ที่ 26 และแถว 23 ยังถูกเขียน
3. `test_corrected_dimensions_mint_a_new_run_and_replace_the_active_rows` — `provinceCode` 73 → 10 ได้ run ใหม่, active อ่านค่า 10, run เดิมยังเก็บ 73
4. `test_semantic_field_changes_are_never_silently_skipped` — subTest แยก area_code / commodity_id / market_id / grade ต้องได้ run ใหม่และ active เห็นค่าใหม่
5. `test_volatile_dimension_timestamps_stay_idempotent` — เปลี่ยน `sourceTimeStamp` (แบบ GISTDA) และ `releaseAt` (default dimensions) ยังได้ run เดิม + `skipped_identical`

## คำสั่งและผลที่รันจริง (repo root, PowerShell semantics ผ่าน Git Bash)

```text
$env:PYTHONPATH='src;.'
& .venv/Scripts/python.exe -m unittest tests.test_observations -v
```

- ก่อนแก้ (baseline): `Ran 33 tests ... OK`
- หลังเพิ่ม test ก่อนแก้ production: `Ran 38 tests ... FAILED (failures=7)` — ล้มด้วยเหตุที่คาด: `active_run_switched` เป็น True, run id เท่ากันทั้งที่ dimension เปลี่ยน, semantic fields ทุก subTest run id เท่ากัน
- หลังแก้: `Ran 38 tests in 0.288s ... OK` (log: `.tmp_qa/audit-repair-lane-1/test-observations.log`)

```text
& .venv/Scripts/python.exe -m unittest tests.test_hub_numeric_sync tests.test_ingest_rid_d1 tests.test_ingest_tmd_d1 tests.test_ingest_open_meteo_d1 tests.test_ingest_gistda_d1
```

- `Ran 130 tests in 1.219s ... OK` (log: `.tmp_qa/audit-repair-lane-1/adapter-suites.log`) — writer ใหม่ยังรองรับ CHIRPS/RID/TMD/Open-Meteo/GISTDA adapters

```text
& .venv/Scripts/python.exe .tmp_qa/audit-repair-lane-1/verify.py
```

- รูปแบบเดียวกับ repro ของ audit แต่ assert พฤติกรรมที่ถูกต้อง:
  - `backfill_keeps_newest_active`: active `2026-10-25`, retry `skipped=1/switched=false/blocked=ACTIVE_RUN_OLDER_THAN_ACTIVE`, แถววันเก่ายังอยู่ 1 แถว
  - `corrected_dimensions_republished`: `sameRun=false`, active province `10`
  - `volatile_source_timestamp_idempotent`: `sameRun=true`, `skipped=1`
- `py_compile` ผ่าน, `git diff --check` ผ่าน (ไม่แตะไฟล์นอก allowlist), ไม่มีบรรทัดเกิน 120 ตัวอักษรในสองไฟล์ที่แก้

## ข้อค้าง / ข้อที่ยังไม่ตรวจ

- ไม่รัน full suite, web tests/typecheck/build, lint หรือ `next typegen` ตามกติกากลาง (ผู้รวมงานรันหลังทั้ง 4 lane หยุดแก้)
- ไม่เขียน D1 จริง; concurrency ของ guard พิสูจน์ด้วย hook บน SQLite mock เท่านั้น ยังไม่ทดสอบ concurrent writer บน D1 จริง
- ยังไม่ benchmark ต้นทุน statement ใหม่บน D1 จริง: `MAX(period_start)` ใช้ index `observations_resource_run_idx(resource_id, run_id, period_start, row_key)` ที่มีอยู่แล้ว แต่ตัว UPDATE มี correlated subqueries 2 ตัวต่อ pointer switch ครั้งเดียวต่อ run
- Rollout: หลัง deploy sync แรกของแต่ละ resource จะสร้าง run ใหม่ 1 run (hash เปลี่ยนตามข้อ 2) โดยไม่ลบ run/แถวเดิม — ควรแจ้งเจ้าของ dashboard/ผู้ตรวจ D1 ก่อนตีความจำนวน run ที่เพิ่มขึ้น
- `active_run_blocked_reason` ยังไม่ถูกส่งออกใน summary ของ `ingest_tmd_d1.py` (ไฟล์นอก allowlist ของ lane นี้) — ถ้าต้องการให้ CLI summary แสดง reason นี้ integrator ต้องแก้ adapter
- ไม่ได้ทดสอบ backfill ขนาดใหญ่/หลายวันในชุดเดียว หรือ resource ที่ผสม grain (daily + monthly) ซึ่ง guard จะยึด period ล่าสุดของ run เป็นเกณฑ์

## สิ่งที่ต้องให้ผู้รวมงานทำต่อ

1. รัน full Python suite + web tests/typecheck/build ตามขั้นตอนรวมงาน และเทียบ regression กับ baseline เดิม
2. อัปเดต `HANDOFF.md`/`docs/progress.md` และเอกสาร API (ถ้าจะประกาศ envelope key `active_run_blocked_reason` และพฤติกรรม `active_run_switched=false` กับ run วันเก่า)
3. พิจารณาให้ adapter ที่เป็นเจ้าของ summary (โดยเฉพาะ TMD) ส่ง `active_run_blocked_reason` ออกไปด้วย หากต้องการให้ operator เห็นเหตุที่ไม่สลับ active
4. ตรวจการซิงก์จริงรอบแรกหลัง deploy ว่ามี run ใหม่ 1 run ต่อ resource ตาม rollout note และ active ยังชี้ข้อมูลวันล่าสุด
