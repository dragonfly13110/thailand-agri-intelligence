# CI workflow repair (2026-10-30, round 2)

สถานะ: เสร็จในขอบเขตที่ได้รับมอบหมาย (ไม่มีการ commit/push/แตะ remote, ไม่แตะ D1)
ขอบเขตไฟล์ที่แก้: `.github/workflows/*` (3 ไฟล์), `tests/test_project_register.py` (เพิ่ม skip guard 1 จุด), เอกสารใหม่ 2 ไฟล์

## 1. ก่อนแก้: workflowแต่ละตัวทำอะไรจริง

ตรวจด้วย `gh run view/list` (อ่านเท่านั้น) เทียบกับ HEAD `7d1c547` (ยังไม่ push; remote main = `ffb6001`)

| workflow | ตั้งใจทำ | ทำจริงตอนนี้ |
| --- | --- | --- |
| `ci.yml` job `validate` | ติดตั้ง Python จาก `requirements.lock` + `pip install -e .`, รัน unittest ทั้งชุด, build+verify snapshot, อัปโหลด artifact | รันถึง unittest แล้ว **แดง 1 เทสต์** (run `40914595209`, commit `ffb6001`: `Ran 854 tests`, `errors=1`, `skipped=1`) ทำให้ build/verify ไม่เคยได้รัน |
| `ci.yml` job `web` | มีอยู่แล้ว (เพิ่มใน commit `4d7df75`) ติดตั้ง `npm ci` + `npm test` + `npm run typecheck` + `npm run build:vinext` | **ผ่าน** (run `40914595209`, 1m2s) — ข้อความใน audit ที่ว่า "ไม่มี web job เลย" ไม่จริงสำหรับ HEAD นี้ |
| `sync-hub-catalog.yml` | sync metadata แคตตาล็อกลง D1 (หรือ PostgreSQL) วันละครั้ง | แดงตั้งแต่สเต็ปแรกเพราะ repo ไม่มี secret เลย (run `40972072552`: `Neither CF_D1_TOKEN nor TADIH_SYNC_DATABASE_URL is configured`) — ข้อความบอกสาเหตุแล้ว แต่ไม่ได้บอกชื่อ secret ครบชุดและไม่มีเอกสารวิธีตั้ง |
| `sync-hub-numeric.yml` | sync ตัวเลข 5 แหล่ง (rid, tmd, open_meteo, gistda, chirps) วันละครั้ง มี preflight ตรวจ credential ต่อ job | แดงตั้งแต่ preflight เพราะไม่มี `CF_D1_TOKEN` (run `41039489056`) — ถูกต้องตามที่ออกแบบ |
| `discover-sources.yml` | probe แคตตาล็อก DOAE/OAE สัปดาห์ละครั้ง ไม่เขียน DB | ไม่มี secret ที่ต้องใช้; สั่ง `python -m tadih discover --source ... --limit --max-pages` ซึ่ง flag มีจริงใน `src/tadih/cli.py` |

หลักฐานเทสต์ที่เคยพัง (run เก่า `40482482461`, 27 ต.ค., 680 เทสต์): `errors=18, failures=2` กระจายใน 8 โมดูล
(area_evidence 3, coverage_inventory 4, data_sharing 6, national_warehouse 1, plan_reconciliation 1, project_register 1,
spatial_evidence 3, temporal_crosswalk 1) ตัวเลข "14 เทสต์" ใน audit จึงเป็นของเก่าและไม่ตรงกับ HEAD
ที่ HEAD (มี adapter/test ใหม่ของ DLD, OAE paddy, DOAE bridge, LDD PGS, MODIS NDVI รวมอยู่แล้ว) เหลือเทสต์ที่พังจริง **1 ตัว** คือ
`test_project_register.ProjectRegisterTests.test_national_project_register_live_audit` — ตรงกับ run ล่าสุด `40914595209`

## 2. แก้อะไร เพราะอะไร

### `tests/test_project_register.py` (แก้เทสต์เท่านั้น ไม่แตะโค้ด production)
`test_national_project_register_live_audit` เรียก `audit_project_register(ROOT)` ซึ่งเขียนผลลง
`data/local/probes/project-register-audit.json` — โฟลเดอร์นี้อยู่ใน `.gitignore` (`data/local/`) จึงไม่มีใน checkout สด
ทำให้ `FileNotFoundError` (CI annotation: `Warehouse database not found` ในรอบเก่า / `FileNotFoundError` ที่ `project_register.py:138` ในรอบล่าสุด)
เพิ่ม guard: ถ้าไม่มีโฟลเดอร์ `data/local/probes/` → `skipTest` พร้อมบอกเส้นทางที่ขาดและวิธีสร้าง
(`python scripts/audit_project_register.py`) ไม่มีการกลบด้วย `try/except` และไม่แตะ logic ของ production
บนเครื่องที่มีข้อมูลจริง (repo นี้) เทสต์ยังรันเต็มและผ่าน

### `.github/workflows/ci.yml`
- job `validate`: เพิ่ม `timeout-minutes: 20` (กัน job ค้าง), คงลำดับเดิม, เพิ่ม comment อธิบายว่าทำไมเทสต์ที่ต้องใช้ `data/local/**` จึง skip ตัวเอง
- job `web`: เพิ่ม `timeout-minutes: 15`, `npm ci` → `npm ci --no-audit --no-fund` (เร็วขึ้น ไม่เปลี่ยนความหมาย),
  เรียงใหม่เป็น **typecheck → test → build:vinext** เพื่อให้ type error แดงก่อนสเต็ปที่ช้ากว่า, ใช้ cache npm จาก `web/package-lock.json` (มีอยู่แล้ว)
  Node ยังเป็น `'22'` ตรงกับ `web/package.json` `engines: node >=22` (และ lockfile ตรงกับ package.json แล้ว — ตรวจแล้ว)
- ตรวจแล้วว่า `package-lock.json` (lockfileVersion 3, 598 entries) ตรงกับ dependency ใน `package.json` → `npm ci` ไม่พังด้วยสาเหตุ lock ตกหล่น

### `.github/workflows/sync-hub-catalog.yml`
- preflight ที่เช็ก secret: ตอนนี้แยกเคส D1 / PostgreSQL ชัดเจน, ถ้าไม่มีอะไรเลยจะ `::error::` บอกชื่อ secret ที่ต้องตั้งและชี้ไปที่
  `docs/operations/ci-secrets-2026-10-30.md`; ถ้าเลือก D1 แต่ขาด `CF_ACCOUNT_ID`/`CF_D1_DATABASE_ID` จะขึ้น `::warning::` (เพราะโค้ดยัง fallback ไปค่า default ที่ hardcode ไว้)
- ติดตั้ง dependency จาก `requirements.lock` ก่อน `pip install -e .` (เดิมติดตั้งจาก PyPI แบบไม่ปักเวอร์ชัน) และ cache pip ชี้ `requirements.lock`
- เพิ่ม job `refuse-non-main`: กดรันมือจาก branch ที่ไม่ใช่ `main` เดิมจะ "เขียวแต่ไม่ได้ทำงาน" (job `sync` ถูก skip) ตอนนี้จะแดงพร้อมข้อความบอกให้ไปรันบน `main`

### `.github/workflows/sync-hub-numeric.yml`
- เพิ่ม job `refuse-non-main` แบบเดียวกัน (เดิม job writer ทั้ง 5 ถูก skip เงียบ ๆ เมื่อสั่งจาก branch)
- เพิ่มบรรทัดชี้ไปเอกสาร secrets ในหัวไฟล์ ไม่แตะ preflight/ตัว sync เดิม (มัน fail-closed ถูกอยู่แล้ว)

## 3. เทสต์ที่ skip และเงื่อนไขที่แน่นอน

เพิ่มใหม่ **1 ตัว** (ตัวเดียวที่พังเพราะ path ที่ gitignore):

| เทสต์ | เงื่อนไข skip | ข้อความที่รายงาน |
| --- | --- | --- |
| `test_project_register.ProjectRegisterTests.test_national_project_register_live_audit` | `not (ROOT / "data/local/probes").is_dir()` (คือ `data/local/` ไม่มีใน checkout สด) | "gitignored local workspace data/local/probes/ is absent on this checkout ...; run `python scripts/audit_project_register.py` ..." |

skip เดิมที่มีอยู่แล้วและไม่แตะ (3 ตัว ใน `test_doae_production_bridge.py` สำหรับ `data/local/production/staged` และ `perennial-staged`)
รวมทั้งหมดใน checkout สด = **4 skips, 0 failures** (บน Windows; บน CI จะเป็น 3 skips เพราะ 1 ในนั้นเป็นเทสต์ Windows-only ที่ CI skip อยู่แล้ว)

เทสต์ที่ไม่เพิ่ม guard และ **รายงานแทน** (ไม่ใช่เพราะ path gitignore):
`test_refresh_script.test_command_preview_and_invalid_year` เป็นเทสต์ Windows-only (`@unittest.skipUnless(os.name == "nt")`) — บน CI (Linux) ถูก skip
แต่ถ้ารันใน checkout สดบน Windows จะ error เพราะ `scripts/refresh_prices.ps1` ต้องมี `.venv/` ของ repo (`Install the repository virtual environment first.`)
ซึ่งเป็นเรื่องสภาพเครื่อง ไม่ใช่ input ของ pipeline — การใส่ skip จะกลบปัญหาการตั้งเครื่องจริง จึงไม่แตะ (ยืนยันว่าใน repo ปัจจุบันเทสต์นี้ผ่าน)

## 4. หลักฐานที่รันจริง (30 ต.ค. 2026, Windows + Git Bash, ใช้ `.venv` ของ repo)

- YAML parse ทั้ง 4 ไฟล์ด้วย parser ของ npm (`yaml`) แบบ 1.2: ผ่านทั้งหมด ไม่มี error
  `ci.yml OK jobs=validate,web` / `discover-sources.yml OK jobs=discover` / `sync-hub-catalog.yml OK jobs=refuse-non-main,sync` /
  `sync-hub-numeric.yml OK jobs=refuse-non-main,resolve-slot,rid,tmd,open-meteo,chirps,gistda` และทุก job มี `steps`
- path ที่ workflow อ้างถึงมีจริงทั้งหมด: `requirements.lock`, `pyproject.toml`, `web/package.json`, `web/package-lock.json`,
  `scripts/sync_hub_catalog.py`, `scripts/sync_rid_to_d1.py`, `scripts/sync_tmd_to_d1.py`, `scripts/sync_open_meteo_to_d1.py`,
  `scripts/sync_gistda_to_d1.py`, `scripts/sync_hub_numeric.py`, `src/tadih/hub_catalog_sync.py`; subcommand `discover/build/verify` มีใน `src/tadih/cli.py`
- จำลอง checkout สดด้วย `git archive HEAD | tar -x` ไปโฟลเดอร์ชั่วคราว (ไม่มี `data/`, ไม่มี `probes/`, ไม่มี `.duckdb`):
  - ก่อนแก้: `Ran 931 tests`, `FAILED (errors=2, skipped=3)` → project_register (พังเพราะ path) + refresh_script (Windows-only; CI skip)
  - หลังแก้: `Ran 931 tests`, `FAILED (errors=1, skipped=4)` → เหลือแต่ refresh_script ที่ CI skip อยู่แล้ว; project_register รายงาน `skipped 'gitignored local workspace data/local/probes/ is absent ...'`
  - เทสต์ที่แตะ รันเดี่ยวใน checkout สด: `Ran 8 tests`, `OK (skipped=1)`
  - เทสต์ที่แตะ รันใน repo จริง (มี `data/local/probes`): `Ran 8 tests`, `OK` (ไม่ skip — guard ไม่กลบงานจริง)
- `python -m tadih build` + `python -m tadih verify <snapshot>` ใน checkout สด: exit 0 (สเต็ปหลัง unittest ของ CI จะผ่านเมื่อเทสต์เขียว)
- ทดสอบ logic shell ของ preflight catalog จริง (ดึง `run:` ออกมารัน 5 เคส):
  ไม่มี secret → `exit=1` + error บอกชื่อครบ / token เดียว → `sink=d1` + warning / token+account+db → `sink=d1` ไม่มี warning /
  DSN เดียว → `sink=postgresql` / กลับเป็นไม่มีอะไร → `exit=1`
- ทดสอบ preflight ของ numeric job `rid`: ไม่มี `CF_D1_TOKEN` → `exit=1` + `::error::Repository secret CF_D1_TOKEN is not configured...`
- `gh secret list --repo dragonfly13110/thailand-agri-intelligence` → ว่างเปล่า (0 secret) ณ 30 ต.ค. 2026

## 5. Secret checklist (เจ้าของต้องตั้งเอง)

เอกสารเต็ม + คำสั่ง `gh secret set` ทุกบรรทัด: [`docs/operations/ci-secrets-2026-10-30.md`](../../operations/ci-secrets-2026-10-30.md)

สรุปสั้น:
- `CF_D1_TOKEN` — จำเป็น (`sync-hub-catalog.yml`, `sync-hub-numeric.yml` ทุก job)
- `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID` — แนะนำ (ถ้าไม่ตั้ง โค้ด fallback ไปค่า default ที่ hardcode ใน `src/tadih/hub_catalog_sync.py` + warning)
- `TADIH_SYNC_DATABASE_URL` — ทางเลือกแทน D1 (เฉพาะ catalog)
- `TMD_API_UID`, `TMD_API_UKEY` — จำเป็นเฉพาะ job `tmd`; **ยังไม่มีค่าใน `.env` ของเครื่องนี้** (มีแต่ `TMD_NWP_ACCESS_TOKEN` ซึ่งคนละ API) ต้องขอจาก TMD ก่อน ห้ามเดา
- `GISTDA_API_KEY` — จำเป็นเฉพาะ job `gistda`
- `ci.yml` ไม่ใช้ secret ใด ๆ

## 6. สิ่งที่จงใจไม่แก้ / ต้องส่งต่อ

- ไม่แตะ `web/**`, `src/**`, `config/**`, `db/**`, `package.json`, `HANDOFF.md`, `docs/progress.md` ตามกติกา; ไม่มี dependency ใหม่
- ไม่ได้รัน `npm run typecheck`, `npm run build:vinext` หรือเปิด dev server (มี QA agent คุม browser อยู่) — web job ที่มีอยู่ผ่านใน CI อยู่แล้ว และผมยืนยันแบบ static (script มีจริง, lock ตรง, Node ตรง engines)
- ไม่ได้ยก `CF_ACCOUNT_ID`/`CF_D1_DATABASE_ID` จาก `::warning::` เป็น error ใน numeric workflow: โค้ดยัง fallback ได้จริง จึงไม่มี ingestion ที่ถูกข้ามเงียบ ๆ และการบังคับเป็น error จะทำให้ sync แดงทั้งที่ข้อมูลจะเขียนถูก — บันทึกเป็นข้อควรปรับแทน
- ยังค้าง (ไม่ใช่ไฟล์ของผม): `src/tadih/hub_catalog_sync.py` บรรทัด 552-553 hardcode `DEFAULT_CF_ACCOUNT_ID` / `DEFAULT_CF_DATABASE_ID` — ควรย้ายไปใช้ secret อย่างเดียวในรอบถัดไป
- งาน lane อื่นที่ยังไม่ commit (LDD: `src/tadih/ldd_pgs_progress*.py`, `tests/test_ldd_pgs_progress*.py`, `web/lib/hub/...`) อยู่นอกการตรวจนี้; การ validation ข้างบนคือ HEAD `7d1c547` + patch ของผม (เทสต์ LDD ที่ HEAD ใช้ tmp dir ไม่พึ่ง `data/local` จึงไม่ต้องมี guard เพิ่ม)
- ไม่มีการ `git add/commit/push`, ไม่มี `gh` ที่เปลี่ยน remote state, ไม่แตะ D1/wrangler
