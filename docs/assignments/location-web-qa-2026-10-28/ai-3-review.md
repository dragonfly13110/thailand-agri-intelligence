AI 3 — Independent review

# รายงานตรวจอิสระ 28 ต.ค. 2026 — final gate completed

- กิ่ง: `codex/checkpoint-2026-10-28`; ไม่สลับกิ่ง ไม่ commit/push/deploy
- เริ่มตรวจ HEAD `4d7df75`; ระหว่างงานพบผู้คุมงานเพิ่ม commit เอกสาร `b0135847a320e6e114cfc399c785a4267626e394` โดย AI 3 ไม่ได้ commit
- อ่าน AGENTS.md, HANDOFF.md หัวข้อจุดพักงาน 28 ต.ค. และใบสั่งงานส่วน AI 3 แล้ว
- ไม่มีเครื่องมือเปลี่ยนชื่อ session ที่ค้นพบ จึงระบุชื่อที่ต้องการไว้บรรทัดแรก
- เขียนเฉพาะรายงานนี้และ `.tmp_qa/ai3-review/`; ไม่แก้ application source

## 1. Diff เทียบ main — การตรวจเบื้องต้น

คำสั่งที่รัน: `git branch --show-current`, `git status --short`, `git log --oneline -5`, `git merge-base main HEAD`, `git log --oneline main..HEAD`, `git diff main...HEAD --stat`, `git diff main...HEAD --numstat` และ diff เฉพาะไฟล์

- merge-base: `6a54c2b125a9211bbde9d50dc795879d521a3058`
- application checkpoint `4d7df75`: 90 files, 14,756 insertions, 766 deletions; ไม่ใช่ diff ของงาน AI 1–2 ที่กำลังแก้
- อ่าน Python/web ด้วยผู้ช่วยตรวจ read-only แยกกัน แล้วตรวจข้อพบสำคัญจากไฟล์จริงเอง; ข้อเสนอจากผู้ช่วยยังไม่ใช่หลักฐานว่า test ผ่าน
- พบงาน AI 1–2 ใน working tree และ `web/next-env.d.ts` จาก dev runtime; ไม่ทับหรือคืนไฟล์ของผู้อื่น

### ความเสี่ยงที่ต้องตรวจ/ตัดสินใจก่อน merge

เลขบรรทัดในข้อพบแรกอ้าง snapshot ที่อ่านตอนเริ่ม ไม่ใช่ working tree ที่ lane กำลังแก้; ผลเฉพาะจุดล่าสุดอยู่ในข้อ 3

1. **P1 รอพิสูจน์ recovery หลังแก้:** annual run ค้าง `running` เมื่อ claim สำเร็จแล้ว client เสีย response — pinned `src/tadih/observations.py:483-499` claim อยู่นอก try ที่ :634, :449-450 ปฏิเสธ retry. AI 1 กำลังแก้; ต้อง inject failure บน SQLite แล้วตรวจ retry/owner safety หลัง freeze ไม่ทดสอบ failure injection บน D1
2. **P2 ยืนยันด้วย query stub แล้ว; รอ retest fix:** PostgreSQL metadata ไม่ตรง partial rows — pinned `web/lib/hub/numeric-repository.ts:202` รวม succeeded/partial, :222-224 hasNumeric ตรวจ succeeded เท่านั้น, :261 completeness hardcode succeeded, :345-350 early empty. หลักฐานข้อ 3.2 ไม่ใช่ live PostgreSQL
3. **P2 production ยังต้องพิสูจน์:** migration 0004–0006 เพิ่ม 5 nullable columns; หน้า DLD/writer ใหม่พึ่ง columns นี้. การอนุมัติ merge ไม่ใช่การอนุมัติ apply migration/ingest/deploy
4. **P2 ต้องวัด:** D1Client.execute เป็น 1 HTTP request ต่อ statement (`src/tadih/hub_catalog_sync.py:716-755`); annual มี `_row_matches`/INSERT ต่อ observation. ยังไม่มีหลักฐานโควต้าเกิน; ตรวจ location upsert count หลัง freeze
5. **P2 แยก suite scope:** tests ที่อาศัยข้อมูลส่วนตัวถูกย้ายไป `tests/integration/` ซึ่ง discover ปกติไม่เข้า. suite เขียวไม่ยืนยัน private-data baseline เดิมของ main; ห้าม opt-in integration ที่แตะ data/local
6. **P2 browser follow-up ยังรอ:** download/disk/PNG รอบแรกยืนยันแล้วในข้อ 3.3; suggest/date defaults ใหม่และ populated interaction ยังไม่ถือว่าผ่าน
7. **P3 ยังไม่ยืนยันเป็นบั๊ก:** series ID length/precision rejection, whole-dataset SQL cost, PostgreSQL JSON SQL parity, price-trend resource/page interaction ต้องวัดก่อนกล่าวหาว่าผิด

ข้อที่ตรวจแล้วไม่ถือเป็นบั๊ก: workflow `queue: max` รองรับโดย GitHub Actions ปัจจุบัน (ประกาศ 7 พ.ค. 2026); migration เป็น additive nullable; wrappers DLD/CPD และ OAE default dry-run; governance tests เพิ่ม exact resource checks ไม่ใช่ปลด assertion ทั้งหมด; ยังไม่พบการเปลี่ยน missing เป็นศูนย์จาก diff ที่ตรวจ

## 2. ชุดทดสอบรวม — รอผู้คุมงานแจ้ง source freeze

ยังไม่รัน final 4 commands: Python full suite, web test, typecheck, build:vinext. รายงานรอบแรก AI 1 คือ 820 tests / failures 7 CPD; AI 2 คือ 298/298 + typecheck. ตัวเลขเหล่านี้ไม่ใช่ผล full gate ของ AI 3 และไม่ครอบคลุม source ที่กำลังแก้

หลัง follow-up เวลา 15:51 UTC ผู้คุมงานให้ AI 1 แก้ annual claim lost response, AI 2 แก้ suggest/date-prefill และผู้คุมงานแก้ CPD tests/PG metadata เอง. ตรวจ working tree พบ source เหล่านี้กำลังเปลี่ยน จึงยังไม่จับ validation snapshot. CPD/OAE เป็นงานใหม่ของ checkpoint ไม่ใช่ baseline เดิมบน main

`typecheck` เขียน generated files; prebuild:vinext เขียน `web/data/*` และ `web/lib/hub/nwp-resource-license.ts`. หลังผู้คุมงานแจ้ง freeze จะรันในสำเนา working tree `.tmp_qa/ai3-review/validation/` พร้อม manifest/checksum และ dependency copy แยก ไม่เขียน application source ใน checkout จริง

## 3. หลักฐานเฉพาะจุดก่อน freeze — ไม่ใช่ full gate

### 3.1 CPD failures 7: ยืนยันสาเหตุ CRLF ทำให้การแก้ bytes ใน test ไม่เกิดขึ้น

ใช้ snapshot ของ HEAD `b0135847a320e6e114cfc399c785a4267626e394`; fake HTTP และ SQLite ที่ใช้ migrations จริงเท่านั้น ไม่อ่าน/เขียน D1. ไม่เปลี่ยน parser/tests ใน application source

คำสั่ง: `./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai3-review/cpd_diagnostic.py`

| public fixture ในสำเนาทดสอบ | tests ที่เลือก | ผลจริง |
|---|---:|---|
| working-tree CRLF | 7 | failures 7; Ran 7 tests in 0.380s |
| ปรับ CRLF → LF เฉพาะสำเนา | 7 | OK; Ran 7 tests in 0.168s |

- fixture checkout = 779 bytes / CRLF 5; `git show <revision>:tests/fixtures/cpd_agricultural_coop_counts.csv` = 774 bytes / CRLF 0. ปรับเป็น LF แล้วตรง Git blob ทุก byte
- patterns `b",0,5,1\n"` และ `b",0,38,8\n"` พบ 0 ครั้งบน CRLF แต่ 1 ครั้งบน LF. ดังนั้น blank/tamper/invalid-number/revised-count tests เดิมไม่ได้เปลี่ยนเนื้อหาเลย
- กรณี equal-version ใน adapter ใช้ candidate bytes/hash เดิมเพราะ replace ไม่เกิด จึงเข้า identical replay ไม่ใช่หลักฐานว่า changed snapshot เก่ายึด active pointer ได้
- parser เดิมคืน blank เป็น None และตรวจ MD5 ของ bytes จริง; การทดลองนี้ **ไม่พบหลักฐาน parser ทำ null/hash เสีย**. ไม่ควรคลาย size/hash checks ของต้นทางเพื่อแก้ test
- ก่อนหน้านี้ field `normalizedEqualsGitBlob` เปรียบเทียบกับ Git archive ที่ผ่าน line-ending conversion ไม่ใช่ blob; แก้ script และรันใหม่แล้ว ผลเทียบ `git show` เป็น true. คืน fixture ของสำเนาเดิมหลังทดลองทุกครั้ง

หลักฐาน: `.tmp_qa/ai3-review/logs/cpd-diagnostic-summary.json`, `cpd-raw-working-tree-crlf.log`, `cpd-lf-normalized-public-fixture.log`. เป็น 7 targeted tests เท่านั้น; ยังไม่ยืนยัน full suite ของ source ใหม่

### 3.2 P2 PostgreSQL partial metadata: ยืนยันด้วย real repository + query stub

คำสั่ง: `node .tmp_qa/ai3-review/pg_partial_repro.mjs diagnostic-head` → exit 0 / query count 4

ใช้ numeric-repository ของ pinned HEAD จริง แต่แทน PostgreSQL query ด้วย stub; **ไม่ใช่ live PostgreSQL, SQLite หรือ D1**

| กรณี | ผลจริง |
|---|---|
| dataset มี active partial run อย่างเดียว | data 0 แถว, availability/access metadata_only, completeness unknown |
| dataset มี succeeded sibling แต่กรอง resource ที่ partial | data 1 แถวของ partial resource, availability ready, access approved_public, completeness complete, warnings [] |

สาเหตุ: `observationFrom` ยอม succeeded/partial แต่ `getDatasetInfo` ตรวจ succeeded เท่านั้น; `numericMeta` hardcode succeeded เมื่อ hasNumeric. ผู้คุมงานเป็นผู้แก้ source; AI 3 ไม่แตะไฟล์นี้ และต้องทดสอบซ้ำหลัง freeze

หลักฐาน: `.tmp_qa/ai3-review/logs/pg-partial-head.stdout.log`, `pg-partial-head.stderr.log`, `.tmp_qa/ai3-review/pg_partial_repro.mjs`

### 3.3 Browser artifacts AI 2 รอบแรก: download/disk/viewport ยืนยันแล้ว แต่ follow-up ยังไม่ครอบคลุม

คำสั่ง: `./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai3-review/audit_ai2_artifacts.py` → exit 0

- ตรวจ `.tmp_qa/ai2-web/results.json` รอบ 15:44:29–15:45:18 UTC: downloadWillBegin และ downloadProgress completed มี GUID เดียว `2d2d8a8b-fde8-448c-8881-2f94b2e103eb`; filename และ receivedBytes/totalBytes ตรงไฟล์จริง 5,209 bytes
- ไฟล์ต้นฉบับใน `%TEMP%/tadih-ai2-qa/downloads/` ยังมีอยู่ และ bytes ตรงสำเนาใน `.tmp_qa/ai2-web/downloads/` ทุก byte; SHA256 `70b3e3f3fa5b9137f3858aa1e11bdde3e75490c55069d54a2793505bf5c7dc1d`
- เปิด CSV ด้วย parser: UTF-8 BOM, 34 columns, 3 rows, provenance headers ครบ; วันที่ 2026-09-30, grid ไม่ใช่จังหวัด, completeness partial, resourceGrain ระบุ 3-cell sample, exportRowCount 3. ไม่ใช่ full national rainfall coverage
- ตรวจ PNG header ทั้ง 8 ภาพและเปิดภาพด้วยตา: desktop 1440×900 จำนวน 4; mobile 390×844 จำนวน 4. ตรง viewport ที่รายงาน
- ผล DOM ที่บันทึก: document scrollWidth ไม่เกิน clientWidth ทุกหน้า, console error 0. AI 3 **ไม่ได้วัด DOM/console สดซ้ำ**; mobile api-docs มี child elements 2 ตัวเกินขอบ viewport จึงไม่กล่าวว่าไม่มี element ล้นเลย และยังต้องตรวจการเลื่อนภายในกล่องบน runtime
- livestock ทั้งสองภาพเป็น error state; trade/price-trend เป็น empty state. หลักฐานนี้ไม่พิสูจน์การเลือกปี/สินค้า/อนุกรมบนหน้าที่มีข้อมูลจริง
- รอบแรกพิสูจน์ CSV หลังผู้ทดสอบล้าง from/to เอง ไม่พิสูจน์ UX suggest/date-prefill ที่ AI 2 กำลังแก้. ไม่ใช้ `results-phase2.partial.json` เป็น acceptance

หลักฐานตรวจอิสระ: `.tmp_qa/ai3-review/logs/ai2-artifact-audit.json`

### 3.4 SQLite location/race/annual

อ่าน repro AI 1 ครบส่วนที่เกี่ยวข้องแล้ว; ยังไม่รัน acceptance จนผู้คุมงานแจ้ง freeze. แยก persisted conflict (อาจมี failed run/attempted upsert แต่ไม่มี observation) จาก within-batch conflict ที่ต้องถูกปฏิเสธก่อน mutation. ต้องตรวจ daily/monthly boundaries, repeated-location upsert count, interleaving และ annual lost-response recovery ของ source ใหม่ด้วยตัวเอง

**ผลรับรายงาน follow-up AI 1:** session ready และประกาศหยุดแก้เฉพาะ lane; รายงานอ้าง 81 targeted tests / 825 full tests OK. AI 3 ตรวจ bytes ของ source/test ทั้ง 3 ไฟล์แล้ว SHA256 ตรงตาราง freeze ของ AI 1 ทุกไฟล์ แต่ยังไม่ใช่ผลทดสอบอิสระหรือ freeze ทั้ง repo. คำบอกของ AI 1 ว่าให้รัน gate ต่อ ไม่แทนการแจ้ง freeze จากผู้คุมงาน

อ่าน source ล่าสุดพบ `_execute_claim` ที่ `src/tadih/observations.py:2515-2521` เรียก cleanup แบบ token-guarded ที่ :2534-2537; `_mark_failed` กลืน cleanup exception ที่ :2539-2541. ดังนั้น recovery ของ patch ครอบคลุม lost response **เมื่อ cleanup ไปถึงฐานข้อมูลได้**. ถ้าฐานข้อมูลยังติดต่อไม่ได้หรือโปรเซสตายหลัง commit จะยังเหลือ running; :450-451 ปฏิเสธ retry. ข้อ 7.3 ของรายงาน AI 1 ที่บอกว่า "รอ D1 กลับมาแล้ว retry" จึงยังไม่ใช่ทางกู้ run ที่ cleanup ไม่สำเร็จตาม source ที่อ่าน. ต้องบันทึกเป็นข้อจำกัด/ทางจัดการโดยเจ้าของงาน ไม่กล่าวว่า outage recovery ครบแล้ว; ยังไม่ได้ inject เคสนี้เองก่อน freeze

### 3.5 ตรวจอิสระ test diff CPD/OAE ของผู้คุมงาน — ไม่รัน tests หรือ final gate

ตรวจ `git diff` ของ 3 tests, อ่าน normalizer และ adapter/fetch ที่เกี่ยวข้อง; ใช้ผู้ช่วย read-only ตรวจ adapter tests ครบไฟล์แล้วทวนข้อพบเอง. ไม่มีการแก้ source/tests และไม่แตะไฟล์ numeric readers ที่มีเจ้าของแล้ว

**ผล: ไม่พบ defect ที่ยืนยันได้จาก patch นี้; ไม่มีเหตุให้คลาย production guards**

- `tests/test_cpd_agricultural_coop_counts.py:27` ปรับเฉพาะ public fixture ใน test เป็น LF; ไม่แปลง bytes ของต้นทางจริง. `git ls-files --eol` ยืนยัน fixture i/lf และ w/crlf
- :115-128 สร้าง input ทั้ง LF/CRLF; :121 เทียบ SHA256 กับ exact bytes ของแต่ละ input, :123 ยืนยัน blank mutation เกิดจริง, :125 blank เป็น None, :126-128 same-size tamper ต้องถูกปฏิเสธด้วย resource hash mismatch. `_metadata_for` ใช้ MD5/size ของ bytes เดียวกัน ไม่ปลอม provenance หรือทำ parser canonicalize ก่อน hash
- production normalizer ยังตรวจ size/hash ก่อน decode (`src/tadih/cpd_agricultural_coop_counts.py:234-236`), คำนวณ content SHA256 จาก raw bytes (:315). diff ของ CPD/OAE normalizers และ adapters ที่เกี่ยวข้องว่าง; observations มี patch ของ AI 1 แยก แต่ guard version/retrieval ที่ :1194-1197 ยังอยู่
- `tests/test_ingest_cpd_agricultural_coop_d1.py:158-169` และ `tests/test_ingest_oae_trade_d1.py:118-128` patch เฉพาะ fetch symbol ใน adapter. closure เรียกฟังก์ชันต้นฉบับที่ import ใน test จึงไม่วนเรียกตัวเอง; fake HTTP/parser/hash/version ยังทำงาน. ขยับ retrieved_at 1ms ต่อ fetch และ addCleanup คืน patch; ไม่ mock publisher/activation guards
- OAE test ที่ต้องการเวลาดึงระบุเองยังมี nested fetch patch ของตัวเอง (:524-556); CPD/OAE tests ที่ source version เท่าเดิม/เก่ากว่ายังยืนยัน SOURCE_VERSION_NOT_NEWER และ active pointer เดิม. การขยับเวลาไม่ได้ทำให้ source version เก่าผ่าน

**P3 ช่องว่าง coverage ไม่ใช่ production bug:** `tests/test_ingest_oae_trade_d1.py:408-448` ชื่อ same-clock owner test ตรึง `_now`/started_at แต่ inherits fetch patch ที่ทำ source_retrieved_at ของผู้เขียนสองคนต่างกัน. จึงยังใช้ผลนี้อ้างกรณี started_at **และ** retrieved_at เท่ากันไม่ได้ และไม่แยกผลของ token guard ออกจาก retrieval/status guards. หากต้องการครอบคลุมกรณีนั้น ควร override retrieved_at เฉพาะ test นี้เป็นค่าเดียวกัน และตรวจ owner ขณะยัง running; ไม่แก้ production ให้ยอมเวลาที่ไม่ใหม่กว่า

shared-writer DLD tests ที่ `tests/test_observations.py:1476-1568` ยังระบุ retrieved_at เดียวกันสำหรับ concurrent/reclaim อยู่ จึงไม่กล่าวว่า suite ทั้งระบบสูญเสีย same-time coverage. ส่วน adapter patch ที่เวลาเพิ่มเสมอไม่ได้พิสูจน์ newer source version + equal/older retrieval ใน token path; เป็นข้อควรเพิ่ม coverage แยก ไม่ใช่บั๊กที่ยืนยันจาก diff นี้

คำสั่ง `git diff --check -- <3 tests>` ผ่าน. ผล targeted 61 และ repeat 20 เป็นผลที่ผู้คุมงานรายงาน ไม่ใช่ AI 3 รันเอง; ยังรอ global freeze ก่อน final acceptance

### 3.6 ตรวจ diff numeric helper ที่ freeze แล้ว (read-only)

ตรวจ `git diff` ของ 3 ไฟล์ที่ผู้คุมงาน freeze: `web/lib/hub/numeric-repository.ts`, `web/lib/hub/d1-numeric-repository.ts`, `web/tests/series-readers.test.ts` เทียบ main. ไม่ได้แก้ไฟล์เหล่านี้และยังไม่รัน web gate

**สิ่งที่ตรวจแล้วว่าตรงกับเจตนา**

- ทั้งสอง backend สรุปสถานะจาก run ที่ถูกเลือกจริงในแถวผลลัพธ์: Postgres `numeric-repository.ts:252-253`, D1 `d1-numeric-repository.ts:282-283`; ถ้ามี run `partial` ปนในผลที่เลือก → `partial`, ถ้ามีแถวแต่ไม่มี partial → `succeeded`, ถ้าไม่มีแถว → NULL
- Postgres ยอมรับ active run ที่ `partial` ทั้งการมีอยู่ของตัวเลข (`numeric-repository.ts:222`) และ join ของแถว (`:202`); D1 ทำเดียวกัน (`d1-numeric-repository.ts:233`, `:25`)
- fallback เมื่อ filter ไม่มีแถว: stats เป็น NULL แล้วใช้ `info.numericStatus` จากระดับ dataset (`numeric-repository.ts:265`, `d1-numeric-repository.ts:291`); `hasPartial` ตรวจด้วย EXISTS จาก active run (`numeric-repository.ts:225-228`, D1 `:234-236`)
- series observations สร้าง `info` จาก status ของ run ที่มองเห็นจึงรักษา status เดิมแม้ filter วันที่ว่าง (`numeric-repository.ts:499-506`, D1 `:450-458`)
- เติม filter `run.kind='numeric'` ใน `getDatasetInfo` ทำให้ availability สอดคล้องกับ `observationFrom` ที่บังคับ kind อยู่แล้ว; schema ทั้ง Postgres และ D1 มี `sync_runs.kind` NOT NULL check `('metadata','numeric')` (`db/hub-schema.sql:75`, `db/cloudflare/0001_hub.sql:71`) และไม่มี migration ที่ลบ/เปลี่ยนคอลัมน์นี้ (`db/cloudflare/0004`–`0006` เพิ่มเฉพาะคอลัมน์ snapshot/token)

**ข้อสังเกตที่ไม่บล็อก merge แต่ควรรู้**

- เมื่อ filter เลือก resource ที่ succeeded แต่ไม่เหลือแถว ผลจะ fallback เป็นสถานะระดับ dataset (อาจเป็น `partial` ถ้า dataset มี resource partial อีกตัว). test ใหม่กำหนดพฤติกรรมนี้ไว้ชัดในหัวข้อ "empty matches fall back to dataset status" จึงเป็นการเลือกโดยเจตนา ไม่ใช่ bug — แต่ผู้ใช้ API ต้องอ่าน `completeness` คู่กับ `pagination.total=0` ไม่ใช่ตีความว่าแถวที่เห็นเป็น partial
- test ใหม่พิสูจน์ผ่าน SQLite stub ที่แปลง SQL ของ production ไม่ใช่ PostgreSQL/D1 จริง; ตอนตรวจ helper นี้ AI 3 ยังไม่รัน web gate เอง แต่ final gate ใน §3.10 รันแล้ว 315/315
- ไม่พบ defect ที่ยืนยันได้จาก diff นี้ และไม่พบการลด guard ความปลอดภัยของ publication/status

### 3.7 Failure injection: ผู้แข่งใช้ run_id เดียวกันแต่ token ต่าง (read-only)

script: `.tmp_qa/ai3-review/same_run_token_guard_repro.py`; ผล: `.tmp_qa/ai3-review/logs/same-run-token-guard.json`; รันด้วย `.venv/Scripts/python.exe`, SQLite harness เดิมของ repo, ไม่แตะ D1/ไม่แก้ source

คำสั่ง: `PYTHONPATH=src PYTHONDONTWRITEBYTECODE=1 .venv/Scripts/python.exe .tmp_qa/ai3-review/same_run_token_guard_repro.py`

- Scenario A (initial claim): ขณะ `INSERT ... RETURNING run_id` ถูกเรียก ผู้แข่ง insert แถว run_id เดียวกันด้วย token `competitor-token` แล้วโยน error จำลอง response หาย. ผล: `RUN_CLAIM_FAILED`; มีคำสั่ง `UPDATE ... status='failed' ... token IS ?` ถูกยิงจริง; แถวยังเป็น `running` / token `competitor-token` / `error_code` NULL เหมือนก่อนและหลัง; `active_run_id` ยัง NULL; observations 0 แถว; token ของเราต่างจากผู้แข่ง
- Scenario B (reclaim): run เดิม failed, ผู้แข่ง reclaim run_id เดียวกันด้วย token ต่าง (ตั้ง status running, error_code NULL) ก่อน response ของเรา หาย. ผลเหมือนกัน: `RUN_CLAIM_FAILED`, แถวที่ผู้แข่ง reclaim ไม่ถูกแตะ, token/status คงเดิม
- ทั้งสอง scenario ผ่าน (`allPassed=true`). ต่างจาก test ของ AI 1 ที่ `tests/test_observations.py:1613-1631` ใช้ `competitor-run` คนละ run_id จึงไม่ได้พิสูจน์ guard ฝั่ง run_id เดียวกัน; repro นี้ยืนยันว่า `_mark_failed` (`src/tadih/observations.py:2534-2537`) กันด้วย `source_year_writer_token` ได้จริง

### 3.8 ช่องว่าง claim retry 500→200 บน working tree ปัจจุบัน (ยังไม่ถูกแก้ใน snapshot นี้)

อ่าน source เท่านั้น ไม่ได้ยิง D1 เพิ่ม. `D1Client.execute` retry 429/5xx ภายในตัวมันเอง (`src/tadih/hub_catalog_sync.py:730-739`) ดังนั้นกรณีคำสั่งแรก commit สำเร็จแต่ response แรกเป็น 500 แล้ว retry ได้ 200 พร้อม RETURNING ว่าง จะไม่มี exception ไปถึง `_execute_claim` (`src/tadih/observations.py:2515-2521`)

- initial claim: `_returned` เป็น false (`:505`) → อ่านแถวซ้ำ (`:509-515`) → `reuse_completed_source_year` ปฏิเสธแถว `running` ของ token ตัวเอง (`:433-451`) → `SOURCE_YEAR_RUN_IN_PROGRESS`
- reclaim: `UPDATE ... WHERE status='failed'` (`:540-549`) match ไม่ได้ในรอบ retry → `_returned` false → อ่านแถวซ้ำแล้วเจอ `running` token ตัวเอง (`:550-563`) → `SOURCE_YEAR_RUN_IN_PROGRESS`
- ผลคือ run ค้าง `running` ภายใต้ token ของเราเหมือนเดิม; การรอแล้ว retry ไม่ช่วยจนกว่าจะมี reconciliation หรือ cleanup. ณ snapshot ที่ตรวจนี้ยังไม่พบโค้ด reconcile ใน working tree (diff observations.py มีเพียง `_execute_claim` wrapper) จึงยังไม่ควร freeze; AI 1 เป็นเจ้าของ patch. เมื่อ patch มา จะตรวจแบบ read-only ว่า initial/reclaim, annual/token modes และ same-run competitor guard ครบ ก่อนเริ่ม final gate

### 3.9 ตรวจ final web + claim diff ก่อน freeze (read-only) — blocker ค้าง 1 จุด

ตรวจ working tree ปัจจุบันหลัง AI 1 ใส่ `own_committed_claim` และ AI 2 ปิด typed-resource/CSV suggest. ไม่รัน four gates และไม่แก้ source

- **Claim diff:** `own_committed_claim` (`src/tadih/observations.py:473-485`) ตรวจ status running + token เดียวกัน + payload/revision (และ label/version/hash ใน token mode) แล้วใช้ reconcile ทั้ง initial claim (:533) และ reclaim (:576). ตรรกะนี้ปิด committed+500/retry200 สำหรับ annual/token, ไม่รับ run ของผู้แข่ง token อื่น, และ replay ยัง idempotent. test ใหม่ `LostClaimResponseTests` ใช้ `D1Client` จริงกับ SQLite 6 migrations ครอบ initial/reclaim, annual/token, same-run competitor และ idempotency
- **Blocker เดิม — แก้แล้วใน final tree (ดู §3.10):** SELECT อ่านแถวซ้ำหลัง RETURNING ว่างเคยเป็น `client.execute` เปล่า 2 จุด — initial `:526-531` และ reclaim `:570-575`. ตอนนี้ทั้งสองจุดห่อด้วย `_execute_claim` และมี token-guarded `_mark_failed`; regression readback 5 ตัวผ่านบน copy
- **Web final diff:** ไม่พบ blocker ใน `api-playground.tsx`, `api-playground-contract.ts`, `api-catalog.ts` และ tests ที่เพิ่ม. CSV suggest ตรวจ dataset detail + records `pageSize=1` เฉพาะ resource ที่ export ได้, เคลียร์ from/to ตัวอย่างของ CSV, จัดการ abort/404/error และไม่เติมค่าที่ทำให้ export ว่าง; water endpoint ใน catalog ตรงกับ route จริง (hub-v1, date/page/pageSize, metadata_only + reservoirs:[] + summary:null). `git diff --check` สะอาด
- หมายเหตุไม่บล็อก D1 merge: Postgres catalog reader (`web/lib/hub/catalog-repository.ts:172-190`) ยังนับเฉพาะ run `succeeded` ขณะที่ numeric reader รับ `partial`; production D1 (`d1-catalog-repository.ts:284-310`) นับ succeeded+partial แล้ว จึงกระทบเฉพาะการรันบน Postgres ทางเลือก ไม่ใช่เส้นทาง deploy D1
- checksum/four gates อัปเดตใน §3.10 แล้ว

### 3.10 Final gate บน tree ที่ stage อยู่ — หลักฐานรันจริง (28 ต.ค. 2026)

- **Freeze และการเปลี่ยนระหว่าง gate:** ผู้คุมงานประกาศ global freeze 16:38Z พร้อม manifest 510 ไฟล์ (source/test/config, ไม่รวม docs). ระหว่าง gate มี test-only fix `tests/test_ingest_dld_beef_cattle_d1.py` เมื่อ 16:47Z (23:47 น.) และ manifest hash update 16:48Z (23:48 น.); ข้อความแจ้ง 16:46/16:48 ถูก queue ระหว่าง turn ที่ active จึงยังไม่ถูกส่งเข้า turn นั้น (ไม่ใช่ไม่มีข้อความ). ผมรับทราบ fix 16:47/hash 16:48 และ re-gate tree ใหม่; tree ปัจจุบันตรง manifest ใหม่ **510/510**
- **วิธีแยก copy:** คัดลอก repo ไป temp นอก repo โดยตัด `.env*`, `data/local`, `.tmp_qa`, node_modules/build cache; junction เฉพาะ `web/node_modules` และ `.venv`; copy ตรง manifest 510/510 ก่อนเริ่ม. ไม่มี private data ถูกคัดลอก
- **Four gates บน copy (tree ปัจจุบัน):**
  - Python full: `Ran 836 tests in 25.398s` → `OK` — `.tmp_qa/ai3-review/logs/python-full-current-rerun.log`
  - Web tests: `315 pass / 0 fail` (19.143s) — `.../web-tests-frozen.log`
  - Typecheck: `next typegen && tsc --noEmit` exit 0 — `.../web-typecheck-frozen.log`
  - Build:vinext: exit 0, `Build complete.` — `.../web-build-frozen.log`
  - Web gates รันบน copy ก่อน test-only change; ตรวจ hash แล้ว web bytes ตรงกับ tree ปัจจุบันทุกไฟล์ (ต่างเฉพาะ `web/next-env.d.ts` ที่ typegen สร้างใน copy) จึงใช้ผลนี้กับ tree ปัจจุบันได้
- **Flake ที่พบระหว่าง gate (ไม่ใช่ regression):** snapshot เดิมล้ม `test_cli_returns_nonzero_when_rowset_removal_needs_review` 1 ครั้งใน full suite 2 รอบ และ class เดิมล้ม 2/10 รอบ; HEAD baseline (`git archive HEAD`) ล้ม 4/20 รอบ. probe ตรงยืนยันว่า run ทั้งสองมี `source_retrieved_at` เท่ากันถึงไมโครวินาที (`2026-10-28T16:48:18.491323Z`) เพราะ `datetime.now()` บน Windows หยาบ จึงจัดเป็น `SOURCE_YEAR_SNAPSHOT_NOT_NEWER` ถูกต้อง. test-only fix ที่ inject retrieved_at แบบเรียงเวลาแก้ flake นี้: targeted 20/20 ผ่าน และ full suite 836 OK
- **Claim/readback:** ทั้งสอง readback ห่อ `_execute_claim` ที่ `src/tadih/observations.py:526` และ `:572`; helper `:2540`; `_mark_failed` ตรวจ token ที่ `:2553-2554`. `LostClaimResponseTests` 11/11 OK (รวม readback failure initial/reclaim annual+token และ same-run competitor); independent same-run repro ผ่าน 2/2 — competitor token คงสถานะ `running` และ `error_code=NULL`; scenario initial มี `observationRows=0` ส่วน scenario reclaim มี `observationRows=1` จาก seeded row เดิม ไม่มีแถวใหม่ของผู้แข่ง (`activeRunId=null` ทั้งคู่) (`.tmp_qa/ai3-review/logs/same-run-token-guard.json`)
- **Manifest after:** ตรวจซ้ำหลัง gate แล้ว tree ตรง manifest ใหม่ 510/510 ไม่มี source drift; source/test ถูก commit ใน `2dc527c` และ working tree เหลือเฉพาะรายงานนี้ (untracked). เก็บหลักฐาน `frozen-manifest-before.json`, `frozen-manifest-current.json`, `supervisor-gate-manifest-2348.json`
- **Browser artifacts:** `audit_ai2_artifacts.py` exit 0; ไฟล์ดาวน์โหลด 5,209 bytes ตรงกับต้นฉบับ, 34 คอลัมน์, 3 แถว, UTF-8 BOM และ provenance ครบ. phase2: typedEmptyPair `claimsReady=false` intercept 5 hits/0 errors; exportSuggest CHIRPS เติม resourceId แล้ว from/to ว่าง issues=[]; golden HTTP 200 5.1KB; emptyRange 404 `EXPORT_NO_ROWS`; invalidResource 404 `EXPORT_RESOURCE_NOT_FOUND`; monthly total 131; desktop/mobile ไม่มี overflow/console error. เป็นหลักฐาน offline artifact ไม่ใช่ live browser/D1 รอบใหม่ (`.tmp_qa/ai3-review/logs/browser-audit-frozen.log`)

## 4. D1 — ผลอ่านเบื้องต้นเท่านั้น; ไม่อ่านซ้ำตามคำสั่งล่าสุด

**หมายเหตุลำดับงาน:** AI 3 รัน probe ก่อน AI 1–2 ส่งงาน ซึ่งเร็วกว่าลำดับใบสั่งงาน. มี SELECT 12 คำสั่ง ไม่มี writes. ผลนี้ไม่ใช่ final gate และไม่ยืนยันสถานะสดหลัง freeze; ผู้คุมงานสั่งงดอ่านซ้ำเพื่อประหยัด quota จึงยังไม่รันซ้ำ

คำสั่งเดิม: `./.venv/Scripts/python.exe -X utf8 .tmp_qa/ai3-review/d1_readonly_probe.py`; script ปฏิเสธ non-SELECT/mutation keyword/semicolon; max_attempts=1

หลักฐานเดิม: `.tmp_qa/ai3-review/d1-probe.log`

- ตอน probe `sync_runs` ไม่มี `source_revision_id`, `source_year_writer_token`, `source_year_label`, `source_version`, `source_hash`: ไม่พบ schema effects ของ 0004–0006
- ไม่มี migration ledger table; รายงานจาก schema ไม่ใช่ migration history
- observation rows ของ resource DLD `d3667ca5-5982-4c9e-9b0d-04e729dbe31b`, OAE `05a5c2b7-f43b-4232-b7ae-04aca5c63329`, CPD `44463650-5d2e-482b-9919-b1c5b8bc5c6b` = 0 ทั้งหมด; location prefixes dld/cpd/oae = 0
- observations 9,926; locations 607; duplicate non-null natural keys 0
- DLD/OAE catalog runs เก่าวันที่ 24 ต.ค. มี resource_id=null ไม่ใช่ numeric rows ใหม่; CPD ไม่พบ run; latest numeric CHIRPS วันที่ 27 ต.ค.

## ข้อสรุป final — local merge / remote / production แยกกัน

### Merge main ในเครื่อง: GO (tree ที่ stage อยู่)

- Four gates ผ่านบน tree ปัจจุบัน: Python 836 OK, web 315/315, typecheck exit 0, build:vinext exit 0; manifest 510/510 ตรงกับ manifest ผู้คุมงานฉบับ 23:48 น. และไม่พบ source drift หลัง gate
- ไม่มี blocker เชิง source. หมายเหตุกระบวนการ: test-only DLD fix 16:47Z + manifest hash update 16:48Z; ข้อความแจ้ง 16:46/16:48 ถูก queue ระหว่าง turn ที่ active จึงยังไม่ถึง turn นั้น (ไม่ใช่ไม่มีข้อความ) — รับทราบและ re-gate tree ใหม่แล้วผ่าน; flake เดิมเป็นปัญหา timing ของ test ไม่ใช่ regression (HEAD baseline ล้ม 4/20 รอบ)
- **ขอบเขต full discovery/CI:** ไม่รวม opt-in `tests/integration/` ที่ต้องใช้ private fixtures โดยเจตนา; ผล offline suite นี้ไม่ใช่ remote CI และไม่ควรเทียบจำนวนกับ main โดยไม่อธิบาย scope
- DLD dataset ยังไม่ลง D1 และหน้า livestock เป็น error UI → **production rollout blocker ไม่ใช่ local merge blocker**. รอบ merge ไม่เขียน D1 เพื่อทำให้หน้า populated; GO นี้ไม่ได้อ้างว่า DLD/OAE/CPD production พร้อม
- AI 3 เป็นผู้ตรวจ ไม่ commit/merge/สลับกิ่งเอง; ผู้คุมงาน/เจ้าของเป็นผู้ทำ local merge ตามสิทธิ์

### Push / CI remote: ยังไม่ดำเนินการและไม่ได้รับอนุญาต push

ไม่มีการ push หรือผล remote CI ใหม่ในงานนี้. ผล `npm`/Python ที่รันในเครื่องไม่ใช่ remote CI และไม่รับประกัน runner/config/secrets บน remote. การอนุญาต local merge ไม่อนุญาต push โดยอัตโนมัติ; ไม่รายงาน remote CI GO โดยไม่มี workflow result จริง

### Deploy / production: NO-GO แยกต่างหาก

หลักฐาน D1 เดิมยังขาด migrations/ข้อมูลใหม่; DLD missing dataset → error UI ยังเป็น rollout blocker. ต้องได้รับอนุญาต migrations/ingest/deploy แยกโดยผู้รับผิดชอบ แล้วตรวจ endpoint/UI ที่มีข้อมูลจริง. งานนี้ไม่อนุญาต AI 3 ทำสิ่งเหล่านั้น; local merge ผ่านไม่เท่ากับอนุมัติ deploy หรือพร้อม production

รับต่อ: ผู้คุมงาน/เจ้าของ commit และ merge local ได้ตามสิทธิ์; AI 3 ไม่ commit/push/deploy, ไม่แก้ application source, ไม่สลับกิ่ง, ไม่แตะ `.env*`/`data/local/**` และไม่เขียน D1. การ push/CI remote และ deploy ต้องขออนุญาตและตรวจแยกตามหัวข้อด้านบน

## Sources

- GitHub Actions queue support: https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/
