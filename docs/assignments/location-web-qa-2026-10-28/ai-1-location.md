AI 1 — Location dedupe

# รายงาน AI 1 — Location dedupe (src/tadih/observations.py)

กิ่ง: `codex/checkpoint-2026-10-28` · การ commit/merge โดยผู้คุมให้ยึด HANDOFF ล่าสุด; lane ไม่ push/deploy/เขียน D1 และไม่แตะ `.env*`/`data/local/**`

## ผลสุดท้ายที่ผู้คุมตรวจและเก็บต่อ — 28 ต.ค. 2026 16:38 UTC

- AI 1 แก้ location dedupe และ claim exception recovery; เพิ่ม `own_committed_claim` ตรวจ run/resource ที่ query ระบุ, owner token, payload/revision และ source-year token fields เพื่อรับ claim ที่ commit แล้วตอบ HTTP500 ก่อน retry ได้ RETURNING ว่าง โดยไม่ยึดงานของ writer อื่น
- AI 1 เพิ่ม real `D1Client` + SQLite HTTP stub 6 tests: annual/token initial claim และ reclaim, same-run competitor, idempotency. เทสต์ 5 เคสล้มเมื่อไม่มี reconciliation และทั้ง 6 ผ่านหลังแก้; AI 1 รัน full Python **831 ผ่าน** ก่อน readback follow-up
- ผู้คุมหยุด AI 1/คิวแล้วรับช่วงจุดสุดท้าย: ครอบ post-claim readback SELECT ทั้งสองด้วย `_execute_claim` เพื่อ cleanup ด้วย token ตนเองถ้า readback ล้ม. เพิ่ม 5 regressions (initial/reclaim × annual/token และ same-run competitor); ก่อนแก้ 11 tests มี errors 5, หลังแก้ **11/11 ผ่าน**
- ผู้คุมรัน `./.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -q`: **836 tests ผ่าน 47.684s**. Log: `%TEMP%/tadih-supervisor-final-python.log`; baseline: `%TEMP%/tadih-readback-before.log`. ไม่รวม opt-in private integration tests
- ประกาศ global source freeze; การตรวจอิสระและ merge ให้ยึด AI 3/HANDOFF. หลักฐาน writer เป็น SQLite/schema จริงและ HTTP stub ไม่ใช่ D1 live. ไม่มีการลด guard หรือเพิ่ม takeover ตามเวลา
- ถ้าโปรเซสตายหรือ cleanup ติดต่อฐานไม่ได้ run ยังอาจค้าง; ต้องตรวจว่า owner หยุดจริงก่อนกู้เอง ไม่รับรองว่า retry จะกู้ได้ทุกกรณี

รหัส SHA256 ของ source สุดท้าย (รายงานไม่รวมใน freeze):

| ไฟล์ | sha256 |
|---|---|
| `src/tadih/observations.py` | `c13decc9ca4c32ef6d0fbbe341b425e69a4febd75fbaf45d3ab7bf2c6e44bb9c` |
| `tests/test_observations.py` | `764cab9b28781debf9c79d1661775d27e45d2abdc6aada3eecb655f260243c24` |
| `tests/test_location_identity.py` | `bed6485598689b4192164a14402d3a50b39e643a701ad153a27e5a23c7a21ba4` |

ส่วนถัดไปเป็นบันทึกรอบก่อน final follow-up; ผล 81/825 และการบอกว่า wrapper ครอบ 4 statements เป็นประวัติก่อนเพิ่ม reconciliation/readback. คำสั่ง stash ในบันทึกเป็นสิ่งที่ทำไปแล้ว ไม่ใช่วิธีแนะนำให้รันใน shared checkout.

---

## 1) สรุปสั้น: พบอะไรและแก้อะไร

การเขียนตัวเลขใช้ตาราง `locations` ร่วมกันทั้งระบบ ซึ่งมีกุญแจสองชุด:

- `location_id` = primary key (ตัวตนของสถานที่)
- `(source_id, kind, native_code)` = natural key (สิ่งที่ใช้ upsert)

ก่อนแก้ ผู้เขียนตัวเลขแบบรายวัน/รายเดือน (`daily`, `monthly`) เขียน location **หนึ่งครั้งต่อหนึ่งแถว observation** ไม่ใช่หนึ่งครั้งต่อหนึ่งสถานที่ และเขียนแถว observation ไปเรื่อย ๆ ทีละแถว ผลที่เห็น:

| # | บกพร่อง | ผลกระทบ | สถานะ |
|---|---|---|---|
| 1 | ภายใน batch เดียวกัน มี 2 `location_id` ที่ใช้ natural key เดียวกัน | ปฏิเสธกลางทางหลังเขียนแถวแรกไปแล้ว → เหลือแถว observation ค้างใน run ที่ `failed` | แก้แล้ว |
| 2 | เขียน location ซ้ำทุกแถว | กินโควต้า D1 write เปล่า ๆ (5 แถว → 5 ครั้ง, แทนที่จะเป็น 1) | แก้แล้ว |
| 3 | รายงาน `locations_written` ไม่ตรงกัน | รอบ "เล่นซ้ำของ run เดิม" รายงาน `0` ทั้งที่รอบแรกรายงานจำนวนสถานที่จริง | แก้แล้ว |

สิ่งที่ **ยังทำงานถูกต้องอยู่แล้ว** (ได้พิสูจน์ด้วย repro และไม่ได้แก้): กรณี location เดิมในฐานข้อมูลที่มี natural key เดียวกันแต่ `location_id` ต่าง ถูกปฏิเสธด้วย `LOCATION_IDENTITY_CONFLICT` อยู่แล้ว, และกรณี owner race สองตัวเขียนพร้อมกันก็ converge เป็น run เดียวโดยไม่มี location ซ้ำ

**รอบที่ 2 (ตามที่ AI 3 พบ):** claim ของ annual/source-year writer ถ้าบันทึกลงฐานข้อมูลสำเร็จแต่ response หาย จะทำให้ run ค้างสถานะ `running` ถาวร และรอบถัดไปถูกปฏิเสธด้วย `SOURCE_YEAR_RUN_IN_PROGRESS` (บรรทัด 449–450 ของโค้ดเดิม) — ยืนยันด้วย failure injection แล้วแก้ที่ claim lifecycle โดยปิด run ของตัวเองเป็น `failed` (ผ่าน owner token) เพื่อให้รอบถัดไป reclaim ได้ตามทางเดิม โดยไม่ไปแตะ run ของ owner อื่นและไม่เปลี่ยน guard ใด ๆ — ดูหลักฐานในข้อ 5

---

## 2) Repro บน SQLite — หลักฐานก่อน/หลังแก้

สคริปต์ repro: [.tmp_qa/ai1-location/repro_location_identity.py](file:///D:/code/thailand-agri-intelligence/.tmp_qa/ai1-location/repro_location_identity.py) (ไฟล์ชั่วคราว ไม่ได้ `git add`)

คำสั่ง:

```bash
./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai1-location/repro_location_identity.py
```

บน Windows cmd/PowerShell ใช้ `.\.venv\Scripts\python.exe -X utf8 .tmp_qa/ai1-location/repro_location_identity.py`

สคริปต์สร้างฐานข้อมูล SQLite ชั่วคราวจาก migration จริงทั้ง 6 ไฟล์ แล้วรัน 6 กรณี โดยนับ (1) จำนวนคำสั่ง `INSERT INTO locations` ที่ writer ส่ง (2) จำนวนแถวจริงในตาราง `locations` / `observations` / `sync_runs` (3) รหัส error ที่ปฏิเสธ

ผลวัด "ก่อนแก้" ได้โดย stash เฉพาะไฟล์ที่แก้ แล้วรันสคริปต์เดิม:

```bash
git stash push -- src/tadih/observations.py
./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai1-location/repro_location_identity.py > .tmp_qa/ai1-location/before.json
git stash pop
```

ผลลัพธ์ทั้งสองรอบอยู่ที่ `.tmp_qa/ai1-location/before.json` และ `.tmp_qa/ai1-location/after.json`

### ตารางเปรียบเทียบ (ตัวเลขจริง)

| กรณี | ผลก่อนแก้ | ผลหลังแก้ |
|---|---|---|
| **(ก-1)** location เดิมในฐานข้อมูล มี natural key เดียวกัน แต่ `location_id` ต่าง (`legacy:rid:reservoir:R1` ↔ `rid:reservoir:R1`) | ปฏิเสธ `LOCATION_IDENTITY_CONFLICT` · location upsert **1** ครั้ง · location 1 แถว · observation **0** แถว | เหมือนเดิมทุกอย่าง (พฤติกรรมนี้ถูกต้องอยู่แล้ว) |
| **(ก-2)** ภายใน batch เดียวกัน `rid:reservoir:R1` กับ `rid:reservoir:alias-R1` ชี้ natural key เดียวกัน | ปฏิเสธ `LOCATION_IDENTITY_CONFLICT` แต่ **เขียน location 1 แถว + observation 1 แถวทิ้งไว้** ใน run สถานะ `failed` (`error_code=RUN_COMPLETION_FAILED`) · location upsert 2 ครั้ง | ปฏิเสธ **ก่อนเขียนอะไรลงฐานข้อมูล**: location upsert **0** ครั้ง · location **0** แถว · observation **0** แถว · sync_runs **0** แถว |
| **(ข-1)** owner race: writer A เขียนค้างกลางบท ขณะ writer B เขียน payload เดียวกันจนเสร็จ | 1 run · observation 4 แถว · location 1 แถว · แต่ **location upsert 4 ครั้ง** (A) | 1 run · observation 4 แถว · location 1 แถว · **location upsert 1 ครั้ง** (A) |
| **(ข-2)** owner race: writer B ใช้ `location_id` อีกตัวกับ natural key เดียวกัน | writer ที่ชนถูกปฏิเสธ แต่เขียน location ไปแล้วรวม **6 ครั้ง** (A) · observation ของ A ยังอยู่ 3 แถว | writer ที่ชนถูกปฏิเสธ **ก่อนเขียน observation** (0 แถว) · location upsert ลดเหลือ **2 ครั้ง** · observation ของ A ยังอยู่ 3 แถว · location 1 แถว (ไม่มี location ซ้ำ) |
| **(ค)** daily 3 แถว + monthly 3 แถว ที่สถานที่เดียวกัน | location upsert **6 ครั้ง** (3 + 3) · observation 6 แถว · location 1 แถว · daily เปิดใช้งาน, monthly ไม่เปิด (กฎ D-1: เดือนเก่ากว่าวัน) | location upsert **2 ครั้ง** (1 + 1) · observation 6 แถว · location 1 แถว · daily เปิดใช้งาน, monthly ไม่เปิด (เหมือนเดิม) |
| **(ค-เสริม)** 1 สถานที่ 5 แถว observation | location upsert **5 ครั้ง** | location upsert **1 ครั้ง** |

**สรุปตัวเลข: location upsert ลดจาก "จำนวนแถว" เหลือ "จำนวนสถานที่จริง" และ batch ที่ขัดแย้งถูกปฏิเสธก่อนเขียนแถวใด ๆ**

หมายเหตุเรื่อง quota: ตัวเลขข้างบนคือจำนวน **คำสั่ง SQL ที่ writer ส่ง** ไม่ใช่จำนวนแถวในตาราง — ตาราง `locations` ไม่เคยมีแถวซ้ำทั้งก่อนและหลังแก้ เพราะ `UNIQUE (source_id, kind, native_code)` กันอยู่แล้ว ปัญหาจริงคือ **คำสั่งเขียนซ้ำ** ซึ่งกินโควต้า D1 write

---

## 3) การแก้ไขใน `src/tadih/observations.py` (สัญญาเดิมไม่เปลี่ยน)

1. **ตรวจ identity ของทั้ง batch ก่อนเขียนอะไร** — เพิ่ม `_validate_batch_location_identity(plan)` เรียกก่อน `register_resource` (จึงก่อนแตะ catalog/run/observation) เฉพาะกรณีที่ไม่ใช่ source-year
   - `location_id` 1 ตัว ต้องชี้ natural key ได้แค่ค่าเดียว และ natural key 1 ตัว ต้องมี `location_id` ได้แค่ตัวเดียว
   - ผิดเงื่อนไข → `LOCATION_IDENTITY_CONFLICT` แบบ fail closed (ไม่เขียนอะไรลงฐานข้อมูลเลย)
   - กรณี source-year ใช้กฎเดิม `_validate_source_year_location_mappings` คงไว้ ไม่แตะ
2. **เขียน location ทีละสถานที่ ไม่ใช่ทีละแถว** — path รายวัน/รายเดือนเปลี่ยนเป็น 2 จังหวะ: upsert ทุกสถานที่ที่ไม่ซ้ำกัน **ก่อน** แล้วจึงเขียนแถว observation
   - ผลข้อ 1: ลดจำนวนคำสั่งเขียน location
   - ผลข้อ 2: ถ้าสถานที่ขัดแย้ง จะหยุดก่อนเขียนแถว observation → ไม่มีแถวค้างใน run ที่ `failed`
   - path ของ source-year (annual snapshot) **คงพฤติกรรมเดิมทุกอย่าง** เพราะต้องผูกกับ owner token ของ run — เทสต์ owner guard เดิม (รวมเคสที่แย่งสิทธิ์ระหว่าง location ที่ 1 กับ location ที่ 2) ผ่านครบ
3. **`province_code` ของสถานที่ยังเหมือนเดิม** — เดิม upsert ทีละแถวทำให้ค่าจังหวัดที่ไม่ว่างของแถวสุดท้ายคงอยู่ ตอนนี้ `_distinct_locations()` เก็บค่าจังหวัดที่ไม่ว่างของแถวสุดท้ายเหมือนกัน (เทสต์ `test_location_name_and_province_survive_one_upsert_per_batch` ยืนยัน)
4. **รายงาน `locations_written` ให้ตรงกัน** — `_finish_existing_run` (รอบเล่นซ้ำของ run เดิม) เคยรายงาน `0` ตอนนี้รายงานจำนวนสถานที่จริงของ batch เหมือนรอบปกติ (ผ่าน `_plan_location_count`)

สิ่งที่ **ไม่** เปลี่ยน: รหัส error เดิมทั้งหมด (`LOCATION_IDENTITY_CONFLICT`, `LOCATION_UPSERT_FAILED`, `SOURCE_YEAR_LOCATION_IDENTITY_CONFLICT`, `SOURCE_YEAR_RUN_OWNERSHIP_LOST`), กฎ D-1 (ห้าม run เก่าทับ run ใหม่), กฎ D-9 (ห้ามรวมหน่วย null/ไม่ null), กลไก owner token ของ source-year, การคำนวณ `payload_sha256`/`run_id`, และโครงสร้างตาราง

หมายเหตุ: ข้อนี้ครอบคลุมเฉพาะการแก้เรื่อง location — รอบที่ 2 (ข้อ 5) มีการเพิ่มรหัส error ใหม่ `RUN_CLAIM_FAILED` สำหรับ claim ที่ผลลัพธ์ไม่ชัด โดยรหัส error เดิมทุกตัวยังทำงานเหมือนเดิม

---

## 4) Regression test (รอบแรก — location dedupe)

ไฟล์ใหม่: [tests/test_location_identity.py](file:///D:/code/thailand-agri-intelligence/tests/test_location_identity.py) (10 เทสต์) — ใช้ schema จริง `db/cloudflare/0001`–`0006` ในไฟล์ SQLite ชั่วคราว เพื่อให้สอง writer สลับกันเขียนฐานข้อมูลเดียวกันได้

| เทสต์ | ครอบคลุม |
|---|---|
| `test_persisted_location_with_same_natural_key_is_refused_without_rows` | (ก-1) |
| `test_within_batch_location_ids_sharing_one_natural_key_write_nothing` | (ก-2) พร้อมยืนยันว่า location/observation/run = 0 แถว |
| `test_one_location_id_with_two_natural_keys_is_refused` | (ก) อีกด้าน: 1 `location_id` แต่ 2 natural key |
| `test_two_writers_of_the_same_payload_converge_on_one_run_and_one_location` | (ข-1) |
| `test_writer_with_a_conflicting_location_id_is_refused_and_writes_no_rows` | (ข-2) |
| `test_daily_and_monthly_batches_write_one_location_each` | (ค) รวมกฎ D-1 ว่า monthly ไม่ทับ daily |
| `test_repeated_location_is_written_once_per_batch` | dedupe |
| `test_replay_reports_the_same_location_count_and_writes_nothing_new` | รายงาน `locations_written` ต้องตรงกัน |
| `test_location_name_and_province_survive_one_upsert_per_batch` | metadata ของ location ไม่หาย |
| `test_location_dimensions_stay_on_the_observation_rows` | location_id/kind/name/province บนแถว observation |

พิสูจน์ว่าเทสต์ใหม่ "จับบั๊ก" ได้จริง — รันกับโค้ดก่อนแก้ (stash เฉพาะ `src/tadih/observations.py`):

```bash
git stash push -- src/tadih/observations.py
./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_location_identity -q
git stash pop
```

ผล: **6 จาก 10 เทสต์แดง** ตอนไม่มีการแก้ (`test_daily_and_monthly_batches_write_one_location_each`, `test_one_location_id_with_two_natural_keys_is_refused`, `test_repeated_location_is_written_once_per_batch`, `test_replay_reports_the_same_location_count_and_writes_nothing_new`, `test_two_writers_of_the_same_payload_converge_on_one_run_and_one_location`, `test_within_batch_location_ids_sharing_one_natural_key_write_nothing`) และผ่านทั้ง 10 หลังแก้ อีก 4 เทสต์ผ่านทั้งสองฝั่ง (เป็นการล็อกพฤติกรรมที่ถูกต้องอยู่แล้วไม่ให้ถอยหลัง)

เทสต์เดิมใน `tests/test_observations.py` ที่แก้: `test_daily_writer_keeps_one_location_upsert_per_observation` → เปลี่ยนเป็น `test_daily_writer_upserts_each_location_once_per_batch` และเปลี่ยนค่าที่คาดหวังจาก 2 upsert เป็น 1 (พร้อมยืนยันว่ามี location 1 แถว และ observation 2 แถว) — เดิมเทสต์นี้ยืนยันพฤติกรรม "เขียนซ้ำทุกแถว" ซึ่งคือตัวที่ต้องแก้

---

## 5) รอบที่ 2 — claim lifecycle ค้างที่ `running` (AI 3 พบ แล้วแก้แล้ว)

AI 3 ชี้ว่า claim ของ annual/source-year writer (โค้ดเดิมบรรทัด 483–499) อยู่ **นอก** `try` ที่คุมการเขียนแถว และรอบ retry ถูกปฏิเสธที่บรรทัด 449–450 (`SOURCE_YEAR_RUN_IN_PROGRESS`) — พิสูจน์ด้วย failure injection ก่อนแก้

### 5.1 หลักฐาน: SQLite failure injection (commit แล้ว response หาย)

สคริปต์: [.tmp_qa/ai1-location/repro_claim_lifecycle.py](file:///D:/code/thailand-agri-intelligence/.tmp_qa/ai1-location/repro_claim_lifecycle.py) — จำลอง client ที่ "เขียนได้ แต่ไม่ได้ response" (commit แล้วโยน error) เหมือน HTTP response หายกลางคัน

| เคส | ก่อนแก้ | หลังแก้ |
|---|---|---|
| **c1** claim `INSERT INTO sync_runs` commit แล้ว response หาย | error ดิบโยนออกมา · run ค้าง `status='running'` · retry ได้ `SOURCE_YEAR_RUN_IN_PROGRESS` · observation 0 แถว | error `RUN_CLAIM_FAILED` · run เป็น `failed` (`RUN_CLAIM_FAILED`) · retry สำเร็จ · run `succeeded` · observation 1 แถว |
| **c2** reclaim `UPDATE sync_runs` (`failed`→`running`) commit แล้ว response หาย | error ดิบโยนออกมา · run ค้าง `running` พร้อม token ของผู้ retry · รอบถัดไปได้ `SOURCE_YEAR_RUN_IN_PROGRESS` | error `RUN_CLAIM_FAILED` · run กลับเป็น `failed` · รอบถัดไป reclaim สำเร็จ · run `succeeded` · observation 2 แถว |
| **c3** writer คนที่สองเจอ owner ที่ยังทำงานอยู่ | ได้ `SOURCE_YEAR_RUN_IN_PROGRESS` · run ของ owner ไม่ถูกแตะ (สถานะ `running`, token เดิม) · owner เสร็จ `succeeded` | เหมือนเดิมทุกอย่าง (พฤติกรรมนี้ต้องไม่เปลี่ยน) |

หลักฐานก่อน/หลัง: `.tmp_qa/ai1-location/claim-before.json` / `claim-after.json` (ไฟล์ชั่วคราว ไม่ได้ `git add`)

**สรุป:** ยืนยันว่า claim ที่ commit แล้ว response หาย ทำให้ run ค้าง `running` ถาวร เพราะโค้ดเดิมไม่มีทางปิด run ที่ตัวเองเป็นเจ้าของ ส่วนทางกู้ที่มีอยู่แล้ว (reclaim) มีเงื่อนไขเดียวคือ `status='failed'` → รอบถัดไปจึงเจอ `SOURCE_YEAR_RUN_IN_PROGRESS` (บรรทัด 449–450) ไปตลอด

### 5.2 การแก้ไข (แตะเฉพาะ claim lifecycle ไม่แตะ guard)

เพิ่ม helper เดียวใน [src/tadih/observations.py](file:///D:/code/thailand-agri-intelligence/src/tadih/observations.py):

```python
def _execute_claim(client, sql, params, *, run_id, writer_token):
    """A claim whose response is lost must not strand the run as ``running``: close it under our own token."""
    try:
        return client.execute(sql, params)
    except Exception as exc:
        _mark_failed(client, run_id, "RUN_CLAIM_FAILED", source_year_writer_token=writer_token)
        raise ObservationWriteError("RUN_CLAIM_FAILED") from exc
```

แล้วให้ helper นี้ครอบเฉพาะ 4 คำสั่งที่เปลี่ยนสถานะ run: claim `INSERT INTO sync_runs` (annual + source-year token) และ reclaim `UPDATE sync_runs ... WHERE status='failed'` (annual + source-year token)

เหตุผลที่ปลอดภัย:

- `_mark_failed` ป้องด้วย `source_year_writer_token IS ?` → **แตะได้เฉพาะ run ที่ writer คนนี้เป็นเจ้าของ** run ของ owner อื่นที่ยังทำงานอยู่จะไม่ถูกเปลี่ยนสถานะ (พิสูจน์ด้วยเคส c3 และเทสต์ `test_a_failing_claim_never_fails_another_writer_run`)
- ปิด run เป็น `failed` คือทางกู้ที่มีอยู่แล้วของโค้ด (รอบถัดไป reclaim ด้วย atomic `UPDATE ... WHERE status='failed'`) ไม่ต้องเพิ่มกลไกใหม่
- **guard fail-closed ไม่ถูกแตะ**: owner-token CAS ตอนเขียนแถว observation, ตอนปิด run, กฎ D-1 (ห้าม run เก่าทับ run ใหม่), กฎ D-9 (ห้ามรวมหน่วย null/ไม่ null) และรหัส error เดิมของการปฏิเสธ (`SOURCE_YEAR_RUN_IN_PROGRESS`, `SOURCE_YEAR_RUN_IDENTITY_CONFLICT`, `SOURCE_YEAR_RUN_CLAIM_LOST`, `SOURCE_YEAR_RUN_STATE_INVALID`, …) ยังเหมือนเดิมทุกตัว
- path รายวัน/รายเดือนไม่ถูกแตะ เพราะไม่มี owner token — ถ้าไปแตะจะกลายเป็นการไปปิด run ของ writer คนอื่นซึ่งอันตรายกว่า (แถวนั้นตอน retry เขียนทับ run เดิมของตัวเองได้)

### 5.3 Regression tests (เพิ่ม 4 เคสใน `tests/test_observations.py`)

| เทสต์ | ครอบคลุม |
|---|---|
| `test_claim_with_lost_response_leaves_the_run_reclaimable` | c1 — claim หาย response → run `failed` → retry reclaim สำเร็จ |
| `test_reclaim_with_lost_response_leaves_the_run_reclaimable` | c2 — reclaim หาย response → run `failed` อีกครั้ง → รอบถัดไปสำเร็จ |
| `test_a_failing_claim_never_fails_another_writer_run` | run ของ owner คนอื่นไม่ถูกปิดเป็น failed แม้ claim ของเราจะล้ม |
| `test_a_second_writer_does_not_touch_the_live_owner_run` | writer คนที่สองได้ IN_PROGRESS แล้วไม่แตะแถว run ของ owner (ล็อกพฤติกรรมเดิมที่ต้องไม่ถอยหลัง) |

พิสูจน์ว่าเทสต์ใหม่จับบั๊กได้จริง โดยไม่ใช้ `git stash` (ตามคำสั่ง) — เขียนโค้ดเดิมกลับชั่วคราวในไฟล์ (มีสำรองในหน่วยความจำและคืนไฟล์ทันทีหลังรันเสร็จ) แล้วรันเทสต์ 4 เคสใหม่

> ผล: **3 จาก 4 เคสแดง** เมื่อยังไม่มีการแก้ (เคสที่ 4 ผ่านทั้งสองฝั่ง เพราะเป็นการล็อกพฤติกรรมเดิมที่ถูกต้องอยู่แล้วไม่ให้ถอยหลัง) และผ่านทั้ง 4 หลังแก้

### 5.4 การย่อ comment/docstring ของ patch location รอบนี้

ตามที่ผู้คุมงานสั่ง: comment/docstring ที่เพิ่มใน patch location ถูกย่อเหลือ 1 บรรทัด WHY เท่านั้น (`_validate_batch_location_identity`, `_distinct_locations` และ comment 2 จุดใน `publish_observations`) — ตัวโค้ดไม่เปลี่ยนพฤติกรรม ตัวเลข location upsert รันซ้ำแล้วเท่าเดิมทุกเคส

### 5.5 รอบที่ 3 — เก็บความสะอาดของไฟล์เทสต์ใหม่ (ไม่เปลี่ยนพฤติกรรม)

ตามที่ผู้คุมงานสั่งรอบสุดท้ายก่อน freeze:

- `tests/test_location_identity.py`: docstring ของโมดูลที่ยาว 15 บรรทัด ย่อเหลือ 1 บรรทัดที่ยังบอกข้อจำกัดสำคัญ (รันบน SQLite ชั่วคราวด้วย schema จริง **ไม่ใช่ Cloudflare D1**) · ตัด comment หัวข้อหมวดที่เป็นของตกแต่ง (`# -- (ก) ...`, `# -- (ข) ...`, `# -- (ค) ...`, `# -- dedupe ...`) ออก · ตัด comment ที่บอกสิ่งที่ assertion บอกอยู่แล้วออก 3 จุด · เหลือเฉพาะ docstring ที่มีความหมาย WHY 2 จุด (`SharedSqliteD1` = ทำให้สอง writer เขียนไฟล์เดียวกันพร้อมกันได้, `seed_location` = เขียน location ตรง ๆ เพื่อไม่ให้ถูกนับเป็น upsert ของ writer)
- `tests/test_observations.py`: ตัด comment ที่บอกซ้ำกับ assertion 1 จุด (ในเทสต์ `test_daily_writer_upserts_each_location_once_per_batch`)

ผล: **ไม่มีการเปลี่ยนพฤติกรรม** — เทสต์ 81 เคส (test_observations + test_location_identity) ผ่านเท่าเดิม และ full suite ผ่านเท่าเดิม

---

## 6) คำสั่งที่รันจริงและผล

ทุกคำสั่งรันจากราก repo `D:\code\thailand-agri-intelligence` ด้วย `.\.venv\Scripts\python.exe` (ใน Git Bash ใช้ `./.venv/Scripts/python.exe`)

| คำสั่ง | ผล |
|---|---|
| `./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_observations -v` | รอบแรก **Ran 67 tests — OK** · รอบสอง **Ran 71 tests — OK** (เพิ่ม 4 เคสใหม่ข้อ 5.3) |
| `./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_location_identity -v` | **Ran 10 tests — OK** |
| `./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_ingest_oae_trade_d1 tests.test_ingest_dld_beef_cattle_d1 tests.test_ingest_cpd_agricultural_coop_d1 tests.test_ingest_rid_d1 tests.test_ingest_tmd_d1 tests.test_ingest_gistda_d1 tests.test_ingest_open_meteo_d1 -q` | รอบแรก Ran 174 tests — **FAILED (failures=2)** (CPD ของเดิม) · รอบสอง **Ran 174 tests — OK** |
| `./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_cpd_agricultural_coop_counts tests.test_ingest_cpd_agricultural_coop_d1 -q` | รอบสอง **Ran 37 tests — OK** |
| `./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_observations tests.test_location_identity -q` | รอบเก็บความสะอาดไฟล์เทสต์ **Ran 81 tests — OK** (ไม่เปลี่ยนพฤติกรรม ข้อ 5.5) |
| `./.venv/Scripts/python.exe -X utf8 -m unittest tests.test_ingest_oae_trade_d1 tests.test_ingest_cpd_agricultural_coop_d1 tests.test_cpd_agricultural_coop_counts -q` | **Ran 61 tests — OK** · วนซ้ำ 20 รอบ **ผ่าน 20/20** (ยืนยันว่าเคสเทสต์ที่เคยผันผวนจากนาฬิกา Windows ไม่กลับมาแดงแล้ว หลังผู้คุมงานแก้แบบ test-only) |
| `./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai1-location/repro_location_identity.py` | ผลตามตารางข้อ 2 (`.tmp_qa/ai1-location/before.json` / `after.json` / `after-round2.json` — รอบสองได้ตัวเลขเท่ารอบแรกทุกเคส) |
| `./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai1-location/repro_claim_lifecycle.py` | ตารางข้อ 5.1 (`.tmp_qa/ai1-location/claim-before.json` / `claim-after.json`) |
| `git stash push -- src/tadih/observations.py` + รันซ้ำ + `git stash pop` | ใช้วัดตัวเลข "ก่อนแก้" ของรอบแรก และยืนยัน baseline ของเทสต์ CPD |
| (รอบสอง) เขียนโค้ดเดิมกลับชั่วคราวในไฟล์แล้วรันเทสต์ 4 เคสใหม่ | 3/4 แดง (ไม่ใช้ `git stash` ตามคำสั่ง) |
| `./.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -q` | รอบแรก **Ran 820 tests — FAILED (failures=7)** · รอบสอง **Ran 825 tests — OK** (log: `.tmp_qa/ai1-location/full-suite-round2.txt`) · รอบเก็บความสะอาด **Ran 825 tests — OK** อีกครั้ง |

หมายเหตุ: เทสต์ CPD ที่แดง 7 เคสในรอบแรก **ไม่กลับมาอีก** ในรอบสอง (โมดูล CPD รันเดี่ยว 37 เทสต์ OK และ full suite เขียวทั้งชุด) — รอบแรกพิสูจน์ไว้แล้วว่าเป็นของเดิมและไม่เกี่ยวกับโค้ดที่แก้ (แดงเหมือนกันทุกชื่อทั้งตอน stash และตอนไม่ stash) ผู้รวมงานควรรัน `unittest discover` ซ้ำอีกครั้งก่อนเสนอ merge

รายละเอียดสาเหตุที่แดง 7 เคส (แก้ทั้งหมดแบบ test-only โดยผู้คุมงาน ไม่ใช่ของ lane นี้): 5 เคสแรกเป็นเรื่อง line ending ของไฟล์ fixture CPD (CRLF บน Windows ทำให้ hash/schema ไม่ตรงกับที่เทสต์คาด) และ 2 เคสหลังเป็นเรื่องนาฬิกา Windows ที่ให้ `datetime.now()` ซ้ำค่า ทำให้กฎเรียงลำดับ snapshot ปฏิเสธ — ดูรายละเอียดที่ข้อ 7 ข้อ 4

---

## 7) สิ่งที่ยังค้าง / ข้อจำกัด (ต้องรู้ก่อน merge)

1. **ยังไม่มีการเขียน Cloudflare D1** และไม่ได้ deploy — ตัวเลขทั้งหมดเป็น SQLite/mock ปริมาณโควต้า D1 ที่จริงยังไม่ยืนยัน
2. **run ที่ค้าง `running` จากการตายของโปรเซสยังกู้เองไม่ได้** — การแก้ข้อ 5 ครอบคลุมเคส "ล้มแล้วตอบไม่ทัน" ที่โปรเซสยังตอบได้ แต่ถ้าโปรเซสถูก kill หรือเครื่องดับหลัง commit แล้ว จะไม่มี mark-failed ทำงาน → run ค้าง `running` และรอบถัดไปได้ `SOURCE_YEAR_RUN_IN_PROGRESS` เหมือนเดิม ไม่แก้อัตโนมัติเพราะ (ก) ไม่มีสัญญาณที่พิสูจน์ได้ว่า owner ตายจริง และ (ข) การ reclaim ตามเวลา (lease/timeout) คือการไป takeover run ของ owner อื่น ซึ่งเป็นสิ่งที่สั่งห้าม — ผู้ดูแลระบบต้องตรวจสอบว่า owner ตายจริงแล้วแก้สถานะ run เป็น `failed` ด้วยมือ (นอกขอบเขต lane นี้ และ lane นี้ห้ามเขียน D1)
3. **ถ้า D1 ยังติดต่อไม่ได้ตอนเกิดข้อผิดพลาด mark-failed จะล้มเหลือด้วย** (โค้ดกลืน error เพื่อไม่กลบ error เดิม) → run ค้าง `running` จริง และ **การ retry หลัง D1 กลับมาไม่กู้ให้เอง** เพราะรอบถัดไปเจอ `SOURCE_YEAR_RUN_IN_PROGRESS` (reclaim ต้องการ `status='failed'`) — การกู้ต้องให้ผู้ดูแลระบบ **ตรวจสอบเองว่า owner ตายจริงแล้ว** (เช่นดูว่าไม่มีโปรเซสไหนกำลังเขียน run นั้น) แล้วค่อยแก้สถานะ run เป็น `failed` ด้วยมือ เพื่อให้รอบถัดไป reclaim ได้ การแก้อัตโนมัติตามเวลา (lease/timeout) เป็นการไป takeover run ของ owner อื่น ซึ่งเป็นสิ่งที่สั่งห้าม — งานนี้อยู่นอกขอบเขต lane นี้ และ lane นี้ห้ามเขียน D1
4. **เคสเทสต์ OAE/CPD ที่เคยผันผวน แก้แล้วโดยผู้คุมงาน (ไม่ใช่ของ lane นี้)** — สาเหตุเดิม: นาฬิกา Windows ติ๊ตทุก ~15.6 ms ทำให้ `datetime.now()` สองครั้งติดกันได้ค่าเดียวกัน (วัดได้ 20/20 ครั้ง) ทำให้ `source_retrieved_at` ของสองการเขียนเท่ากัน และกฎ "snapshot ใหม่ต้องใหม่กว่า" ปฏิเสธด้วย `SOURCE_YEAR_SNAPSHOT_NOT_NEWER` แทน `SOURCE_YEAR_ROWSET_REMOVALS_REQUIRE_REVIEW` (ผลวัดรอบแรก: แดง 3/20 รอบ) — **ผู้คุมงานแก้แบบ test-only** โดยให้ fetch ในเทสต์คืน `retrieved_at` ที่เรียงเวลาเพิ่มขึ้นทุกครั้ง (แก้ใน `tests/test_ingest_oae_trade_d1.py` และ `tests/test_ingest_cpd_agricultural_coop_d1.py` ซึ่งผมไม่ได้แตะ และโค้ด production ไม่ถูกแก้) ผล: **61 เทสต์ (OAE + 2 โมดูล CPD) ผ่าน 20/20 รอบ** — ข้อจำกัดนี้จึงไม่ค้างแล้ว
5. **ไม่ได้ทดสอบกับ D1 จริง** — พฤติกรรม `INSERT ... ON CONFLICT` และ `RETURNING` บน D1 (SQLite เวอร์ชันบน Cloudflare) ยังไม่ได้ยืนยันด้วยข้อมูลจริง
6. **ไม่ได้ตรวจ performance ของ batch ใหญ่** — ตอนนี้เขียน location เป็น 2 จังหวะ (สถานที่ทั้งหมดก่อน แล้วค่อยแถว observation) ถ้า batch มีสถานที่หลายพันจุด จะถือ statement สะสมไว้ก่อนเขียน — ควรวัดกับ batch ขนาดจริงของ TMD/CHIRPS ก่อนเปิดใช้งานเต็ม
7. **ไม่ได้แตะ `data/local/**`, `.env*`, migration, API, UI** และไม่ได้ commit/push/deploy — กิ่งยังมีงานของ lane อื่นค้างอยู่ ให้ผู้รวมงานตรวจ diff รวมก่อน
8. **ไฟล์ชั่วคราว** อยู่ที่ `.tmp_qa/ai1-location/` เท่านั้น (repro ทั้งสองชุด + before/after json + full-suite log) ยังไม่ได้ `git add`

---

## 8) คำสั่งรับต่อ (สำหรับผู้รวมงาน)

```bash
# 1) เทสต์เฉพาะส่วนของ lane นี้
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_observations -v
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_location_identity -v
.\.venv\Scripts\python.exe -X utf8 -m unittest tests.test_ingest_oae_trade_d1 tests.test_ingest_dld_beef_cattle_d1 tests.test_ingest_cpd_agricultural_coop_d1 tests.test_ingest_rid_d1 tests.test_ingest_tmd_d1 tests.test_ingest_gistda_d1 tests.test_ingest_open_meteo_d1 -q

# 2) ชุดใหญ่ (รอบสองรันแล้ว: 825 เทสต์ — OK · ผู้รวมงานควรรันซ้ำ)
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests -q

# 3) ดูหลักฐาน repro ทั้งสองชุด
./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai1-location/repro_location_identity.py
./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai1-location/repro_claim_lifecycle.py
git diff -- src/tadih/observations.py tests/test_observations.py tests/test_location_identity.py
```

เงื่อนไขที่ผู้รวมงานควรตรวจก่อนเสนอ merge:

- ตรวจว่าจำนวน `location upsert` ที่ลดลงตรงกับที่รายงาน และไม่มีที่ไหนพึ่งพา "เขียน location ซ้ำทุกแถว"
- ตรวจว่า `RUN_CLAIM_FAILED` ใหม่ถูกจัดการถูกที่ฝั่งผู้เรียก (ตอนนี้ปล่อยเป็น error ปกติของ writer; ยังไม่ได้แปลงเป็นข้อความไทยสำหรับผู้ใช้งาน)
- ถ้าจะเปิดใช้งานจริง: วัดผลกับ D1 read-only ก่อน (ยังไม่มีการเขียน D1 ในทั้งสองรอบ)
- รอบนี้ไม่ได้แก้ parser ของ CPD/OAE และไม่ได้แตะเทสต์ของสองโมดูลนั้น (ผู้คุมงานดูแลแยก)
