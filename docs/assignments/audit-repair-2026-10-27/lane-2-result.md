# Lane 2 result — NWP publish/retry/read (audit ข้อ 2)

วันที่: 2026-10-27
เจ้าของ: lane 2
ฐานงาน: working tree ปัจจุบันของ `T:\coding+\BI AGRI THAILAND` (branch `main`, HEAD `14026f0`) ไม่ checkout/reset/stash/commit/push/deploy, ไม่เขียน D1 จริง, ไม่แก้ schema/migration

## ขอบเขตและฐานตั้งต้น

- แก้เฉพาะไฟล์ใน allowlist: [sync_tmd_hpc_nwp.py](../../../scripts/sync_tmd_hpc_nwp.py), [test_sync_tmd_hpc_cli.py](../../../tests/test_sync_tmd_hpc_cli.py), [nwp-data.ts](../../../web/lib/hub/nwp-data.ts), [nwp-data.test.ts](../../../web/tests/nwp-data.test.ts) และเอกสารนี้
- สำเนาก่อนแก้เก็บที่ `.tmp_qa/audit-repair-lane-2/*.baseline` (gitignore) ใช้เทียบว่า diff ของ lane นี้มีอะไรบ้าง
- `nwp-data.ts` มีงาน uncommitted ของเจ้าของเดิมอยู่ก่อนแล้ว (registry licence/`NWP_RESOURCE_LICENSE`, การซ่อน unit จนยืนยัน, `resolveAccessStatus`) — diff ของ lane นี้ในไฟล์นั้นมีเพียง guard ใน `assertPublishable` เท่านั้น
- ไม่แตะ `nwp-resource-license.ts`, config, shared http/types, API catalog, `.next`/`dist`, workflow, package/lock

## สิ่งที่แก้

### 1) Publisher: run อ่านไม่ได้ระหว่างเขียน และปิด run เมื่อ child ครบตาม export

- [`publish_export`](../../../scripts/sync_tmd_hpc_nwp.py#L877) upsert run ด้วยสถานะชั่วคราว `failed` ([`TRANSIENT_RUN_STATUS`](../../../scripts/sync_tmd_hpc_nwp.py#L106)) แทนสถานะจริง แล้วเขียน snapshots/province values ตามด้วยการอ่านกลับเพื่อตรวจความครบ
- ใช้เฉพาะสถานะที่มีใน schema เดิม: `failed` = อ่านไม่ได้, `ready`/`partial` = เผยแพร่ได้ ([`FINAL_RUN_STATUSES`](../../../scripts/sync_tmd_hpc_nwp.py#L105)) ไม่เพิ่มสถานะ/คอลัมน์/migration
- ตรวจความครบด้วย [`_child_completeness`](../../../scripts/sync_tmd_hpc_nwp.py#L768) เทียบกับ export ของ run นั้นเอง:
  - snapshot keys `(variable, valid_at)` ต้องครบเป็นชุด
  - province rows ต่อ snapshot group ต้องมีจำนวนไม่น้อยกว่าที่ export กำหนด (ไม่ใช้เลข 77 จังหวัดตายตัว)
  - ใช้ `json_group_array(json_object(...))` อ่านกลับเป็นแถวเดียว ([`_stored_children`](../../../scripts/sync_tmd_hpc_nwp.py#L745)) เพราะ `D1Client.execute` คืนเฉพาะ result row แรก
- หลังเขียนครบจึง [`UPDATE nwp_runs SET status = ? WHERE run_id = ? AND payload_sha256 = ?`](../../../scripts/sync_tmd_hpc_nwp.py#L992) เป็นสถานะที่ export ประกาศ (`ready`/`partial`) — ระหว่างเขียนและหลังล้มเหลว readers จึงไม่เห็น run นี้เป็น published
- ถ้าอ่านกลับแล้วยังไม่ครบ (row หาย/เขียนไม่ติด) → mark `failed` แล้วโยน `NWP_WRITE_FAILED` แทนการประกาศ ready

### 2) Publisher: skip เฉพาะ run ที่จบสำเร็จและ child ครบจริง

- [`publish_export`](../../../scripts/sync_tmd_hpc_nwp.py#L905) อ่านทั้ง `payload_sha256` และ `status`; `skipped_identical` เกิดได้เฉพาะเมื่อ **status เป็น `ready`/`partial` + hash ตรง + children ครบตาม export**
- run ที่ `failed`, hash ตรงแต่ child ขาด, หรือ run ที่ `ready` แต่ child ไม่ครบ → เขียนซ้ำแบบ upsert ทั้งชุดเพื่อซ่อม (ไม่ลบ run อื่น ไม่สร้างแถวซ้ำ)
- ทางลัด `metadata_updated` (registry อนุมัติ licence โดย payload เดิม) ถูก gate ด้วยเงื่อนไขเดียวกัน; ถ้า child ไม่ครบจะซ่อมเต็มชุดแทน
- retention/`prune_runs` ยังทำงานเหมือนเดิมหลัง publish สำเร็จ; retry ไม่ลบ run ที่สำเร็จอื่น

### 3) Readers: ปฏิเสธ run ที่ยังไม่จบ

- [`assertPublishable`](../../../web/lib/hub/nwp-data.ts#L749) ตรวจ status ก่อน `publication_mode`: สถานะที่ไม่ใช่ `ready`/`partial` (รวม `failed`, `null`, ค่าที่ไม่รู้จัก) → `404 NWP_NOT_FOUND` ทั้ง grid และ provinces ([grid](../../../web/lib/hub/nwp-data.ts#L829), [provinces](../../../web/lib/hub/nwp-data.ts#L858))
- ตรวจ status ก่อนอ่าน snapshot/province row จึงไม่มีการหลุดตัวเลขค้างจากรอบที่ล้มเหลว
- `403 NWP_PUBLICATION_DISABLED` ยังสงวนให้ kill switch `publication_mode = metadata_only` ของ run ที่ published แล้วเท่านั้น
- `partial` ยังอ่านได้ (200) พร้อม `meta.completeness = 'partial'`; `/api/v1/nwp/runs` กรอง `status IN ('ready','partial')` อยู่แล้ว (ไม่ได้แก้)
- ไม่แตะ unit/null semantics, parameter binding, retention หรือ response shape

## Error code / status ที่ callers ได้รับ

| กรณี | ผลลัพธ์ |
|---|---|
| `GET /api/v1/nwp/grid` หรือ `/provinces` ของ run `ready`/`partial` | 200, `meta.completeness` = `complete`/`partial` (เหมือนเดิม) |
| run `failed` / status `null` / status ไม่รู้จัก (แม้ยังมี snapshot หรือ province row ค้าง) | **404 `NWP_NOT_FOUND`** ทั้งสอง route |
| run `ready`/`partial` แต่ `publication_mode = metadata_only` | 403 `NWP_PUBLICATION_DISABLED` (เหมือนเดิม) |
| runId ไม่มีในฐานข้อมูล | 404 `NWP_NOT_FOUND` (เหมือนเดิม) |
| publish สำเร็จ | exit 0, `outcome` = `written` / `metadata_updated` / `skipped_identical` |
| เขียน D1 ล้มเหลว หรืออ่านกลับแล้ว child ไม่ครบ | exit 1, `errorCode = NWP_WRITE_FAILED`; run ถูก mark `failed`; แถวที่เขียนไปแล้วไม่ถูกลบ |
| ไม่มี credentials | exit 2, `D1_NOT_CONFIGURED` (เหมือนเดิม) |

ไม่มี error code หรือ status ใหม่; API catalog ไม่จำเป็นต้องแก้ เว้นแต่ผู้รวมงานต้องการบันทึกพฤติกรรม failed → 404 เพิ่มเติม

## Tests ที่เพิ่ม

Python — [`tests/test_sync_tmd_hpc_cli.py`](../../../tests/test_sync_tmd_hpc_cli.py)

- [`PublishRepairTests`](../../../tests/test_sync_tmd_hpc_cli.py#L550) 4 tests: failed run ถูกซ่อมไม่ใช่ skip; run อ่านไม่ได้ระหว่างเขียน child; run `ready` ที่ child ขาดถูกซ่อม; retry ไม่ลบ run อื่นและไม่สร้างแถวซ้ำ
- [`test_failed_write_is_retried_against_the_real_schema`](../../../tests/test_sync_tmd_hpc_cli.py#L995) บน SQLite schema จริง (`db/cloudflare/0003_nwp.sql`) ด้วย `_FailingSqliteD1` ฉีด failure ครั้งแรกที่ `insert into nwp_province_values`
- `FakeD1Client` รองรับ `SELECT payload_sha256, status`, aggregate ของ snapshots/province counts, conditional finalize และบันทึกสถานะ run ขณะเขียน child (`child_write_statuses`)
- ระหว่างทำ TDD test ใหม่ล้มด้วยพฤติกรรมเดิมตามคาด: failed run ได้ `skipped_identical`, child ถูกเขียนขณะ run เป็น `ready`, และ run `ready` ที่ child ขาดถูก skip

Web — [`web/tests/nwp-data.test.ts`](../../../web/tests/nwp-data.test.ts)

- [failed run ถูกปฏิเสธทั้ง grid/provinces แม้มีแถวค้าง](../../../web/tests/nwp-data.test.ts#L515) และไม่มี `62.4` หลุดออกมา
- [status `null`/ไม่รู้จักไม่อ่าน](../../../web/tests/nwp-data.test.ts#L549)
- [run `partial` ยังอ่านได้และรายงาน `completeness: partial`](../../../web/tests/nwp-data.test.ts#L560)

## คำสั่งและผลที่รันจริง

```text
cd "T:/coding+/BI AGRI THAILAND"
PYTHONPATH='src;.' ./.venv/Scripts/python.exe -m unittest tests.test_sync_tmd_hpc_cli -v
```

- ผล: `Ran 44 tests in 0.217s` — `OK` (exit 0), log `.tmp_qa/audit-repair-lane-2/py-tests.log`

```text
cd "T:/coding+/BI AGRI THAILAND/web"
node --experimental-strip-types --test tests/nwp-data.test.ts tests/nwp-contract.test.ts
```

- ผล: `tests 44`, `pass 44`, `fail 0`, `cancelled 0`, `skipped 0` (exit 0), log `.tmp_qa/audit-repair-lane-2/web-tests.log`

```text
cd "T:/coding+/BI AGRI THAILAND/web"
node_modules/.bin/tsc.cmd --noEmit --incremental false
```

- ผล: exit 2 ด้วย error ของไฟล์ generated (ไม่ได้แก้โดย lane นี้):

```text
.next/types/validator.ts(5,15): error TS2305: Module '"./routes.js"' has no exported member 'AppRoutes'.
.next/types/validator.ts(5,26): error TS2305: Module '"./routes.js"' has no exported member 'LayoutRoutes'.
.next/types/validator.ts(5,40): error TS2305: Module '"./routes.js"' has no exported member 'ParamMap'.
.next/types/validator.ts(5,50): error TS2305: Module '"./routes.js"' has no exported member 'AppRouteHandlerRoutes'.
```

- สาเหตุ: `.next/types/routes.js` ไม่มีอยู่จริง และ `.next/types/routes.d.ts` มีเพียง `export {};` ขณะที่ `validator.ts` (generated) import 4 type จาก `./routes.js` — เป็น artifact ของ vinext ที่ค้างอยู่ และล้มแบบเดียวกันก่อน lane นี้แก้ (กติกากลางห้ามแก้ `.next`/`dist` และห้ามรัน `next typegen` ระหว่าง lane)
- ตรวจเพิ่มแบบ source-only: `tsconfig` ชั่วคราวใน `.tmp_qa/audit-repair-lane-2/tsconfig.source-only.json` (extends `web/tsconfig.json`, ตัด `.next`/`dist`/`node_modules` ออก) → `tsc --noEmit -p ...` ได้ **exit 0** ยืนยันว่า source ทั้งหมด รวมไฟล์ที่ lane นี้แก้ typecheck ผ่าน — เป็นหลักฐานประกอบ ไม่ใช่ผลของคำสั่ง repo ตามกติกา

```text
git diff --check -- scripts/sync_tmd_hpc_nwp.py tests/test_sync_tmd_hpc_cli.py web/lib/hub/nwp-data.ts web/tests/nwp-data.test.ts
```

- ผล: exit 0 (มีเฉพาะ warning LF → CRLF ของ Git)

## สิ่งที่ยังไม่ตรวจ / ความเสี่ยงคงเหลือ

- ไม่รัน full suite, build, dev server, browser, `next typegen` หรือ publish `--write` จริง; ไม่เขียน/ลบ D1 จริง
- ยังไม่ทดสอบ concurrency กรณีมี publisher สองตัวเขียน run_id เดียวกันพร้อมกัน: finalize เป็น `UPDATE ... AND payload_sha256 = ?` เพื่อไม่ทับ hash ของ payload อื่น แต่ publisher ไม่ได้ assert ว่าแถวถูก update จริง (ถ้าอีกงานเขียนทับด้วย payload ต่างกัน run จะคงสถานะของงานนั้น ซึ่ง readers จะปฏิเสธถ้ายัง `failed`)
- completeness ตรวจ "ของหาย" ตาม export เท่านั้น: แถว child เก่าที่ไม่อยู่ใน export ใหม่ของ run_id เดิมจะไม่ถูกลบ (พฤติกรรม upsert เดิม ไม่ได้อยู่ในขอบเขตข้อ 2)
- การซ่อมเกิดเมื่อ publish run/payload นั้นซ้ำอีกครั้ง ไม่มี automatic sweep ของ failed run อื่นทั้งฐาน
- ชุดทดสอบ SQLite ยืนยันว่า D1 mock/สคีมาจริงทำงานถูก; ยังไม่ได้ยิง aggregate query ใหม่กับ D1 จริง (รูปแบบ `json_group_array` มีใช้อยู่แล้วในไฟล์เดียวกัน)

## สิ่งที่ต้องให้ผู้รวมงานทำต่อ

1. หลังทุก lane หยุดแก้ ให้ regenerate `.next` types (build/`next typegen`) แล้วรัน `tsc --noEmit --incremental false` ซ้ำ — error TS2305 ทั้ง 4 รายการมาจาก artifact ที่ค้าง ไม่ใช่ source ของ lane นี้ และคาดว่าจะหายหลัง generate ใหม่
2. รัน full Python suite + web tests/build ตามขั้นตอนรวมงาน และเทียบ baseline
3. อัปเดต `HANDOFF.md`/`docs/progress.md` ตามกติกากลาง (lane นี้ไม่แก้ไฟล์เหล่านั้น) — สรุปสั้น ๆ: NWP retry ซ่อม run ที่ล้มเหลวได้, grid/provinces ตอบ 404 `NWP_NOT_FOUND` สำหรับ run ที่ยังไม่ published
4. API catalog: ไม่ต้องเพิ่ม error code ใหม่; ถ้าต้องการเอกสาร public ให้ระบุว่า run `failed`/status ไม่รู้จักตอบ 404 `NWP_NOT_FOUND` จากทั้งสอง route
5. การใช้งานจริง: run ที่เคย `failed` ใน D1 (ถ้ามี) จะถูกซ่อมเมื่อ publish run นั้นซ้ำ; ไม่ต้อง migration และไม่ต้องลบข้อมูลเดิม — run `tmd_hpc_d02_2026102606` ใน D1 ณ เวลาตรวจยังครบดีตาม audit
