# QA & Verification — Real Data รอบ 1 (Lane H, 2026-10-26) — re-verification pass

ฉบับนี้เป็นการรัน新一轮 (fresh re-run) ของ Lane H ณ working tree ปัจจุบัน (ยัง **ไม่ commit / ไม่ push / ไม่ deploy**) — ทุกตัวเลขล่างนี้มาจากคำสั่งที่รันจริงใน session นี้ ไม่ใช่คัดลอกจากเอกสารเก่า เป็นเอกสาร verify-and-report เท่านั้น **ไม่แก้ product code**; ข้อบกพร่องบันทึกพร้อมหลักฐาน repro ให้ lane เจ้าของแก้รอบถัดไป

เวลาตรวจ: `python -m unittest discover` รัน 2 ครั้ง (648 tests) · web typecheck/test/build รันจริง · D1 read-only ผ่าน `tadih.env` → `connect_d1_client()` (ไม่พิมพ์ credential, sed redact `api_key=` ทุกบรรทัด) · governance sweep ด้วย grep · workflow validator ด้วย Python heuristic (ไม่มี PyYAML/js-yaml ในเครื่อง)

## สรุปผลราย-check (A–F)

| Check | ขอบเขต | คำสั่ง | ผล | verdict |
|---|---|---|---|---|
| A | Python unittest discover + จำแนก regression | `PYTHONPATH=src ./.venv/Scripts/python.exe -m unittest discover -s tests` | `Ran 648 tests … FAILED (failures=3, errors=11, skipped=1)` — 14 test id, ทั้งหมด pre-existing (0 regression ของรอบ 1) | **ผ่านมีเงื่อนไข** |
| B | Web typecheck / test / build | `npm --prefix web run typecheck` / `…test` / `…build:vinext` | typecheck exit 0 · test **118 pass / 0 fail** · build `Build complete.` exit 0 | **ผ่าน** |
| C | D1 read-only audit | Python `connect_d1_client()` SELECT-only | observations **6,131 แถวทุก run**; ใต้ `active_run_id` = **3,057**; orphan = **3,074** (10 runs); numeric runs **8 succeeded / 7 partial / 2 failed** (17); ไม่มี metric forecast/nwp/prediction; ตาราง live ไม่มีคอลัมน์ extension 0002 | **ผ่านมีข้อสังเกต** |
| D | Governance /satellite + routes | grep `web/lib/hub/*.ts`, find routes | ไม่มีเส้นทางใด `sample:false` แล้วป้อน generator; baseline รอบ 3 = **17 routes** PRNG `sample:true` เต็มใบ | **ผ่าน** |
| E | Secrets hygiene | `git status`/`git check-ignore`/`git ls-files` + grep literal | ไม่มี `.env`/`data/local`/`exports/private` ถูก track/stage; credential literal ในไฟล์รอบ 1 = **0** | **ผ่าน** |
| F | CI workflow | Python heuristic validator | tab=0 · top keys ครบ · 5 cron slots · dispatch input `syncs` · per-slot concurrency · 6 secrets อ้างโดยชื่อเท่านั้น ไม่มี echo ค่า · 5 scripts มีจริงใน disk (แต่ untracked) | **ผ่านโครงสร้าง — ยังไม่รันจริง (DoDข้อ 4 ไม่ผ่าน)** |

## A — Python test discovery + จำแนก regression

รัน 2 ครั้งให้ผลตรงกัน (`Ran 648 tests`, exit 1, failures=3, errors=11, skipped=1). 14 test id ที่ fail/error + การจำแนก (trace ชี้ `data/local/**` ที่ gitignore ทั้งสิ้น):

| # | Test id (module.method) | ประเภท | สาเหตุที่ยืนยันจากรันจริง | จำแนก |
|---|---|---|---|---|
| 1 | `test_area_evidence.test_local_data_router_integration` | error | `_duckdb.CatalogException: Table fact_spatial_evidence does not exist` (DuckDB ใน `data/local`) | pre-existing |
| 2 | `test_area_evidence.test_read_area_evidence_for_buriram` | error | เหมือนข้อ 1 | pre-existing |
| 3 | `test_area_evidence.test_read_area_evidence_for_nakhon_pathom` | error | เหมือนข้อ 1 | pre-existing |
| 4 | `test_coverage_inventory.test_doae_manifest_counts_reconcile_exactly_with_audit_thresholds` | error | `FileNotFoundError: Missing one or more required DOAE manifests` | pre-existing |
| 5 | `test_coverage_inventory.test_license_status_is_pending_for_all_unapproved_sources` | error | traceback เดียวข้อ 4 (ตกก่อนถึง license assert) | pre-existing |
| 6 | `test_coverage_inventory.test_quarantined_resources_flagged_for_review` | error | เหมือนข้อ 4 | pre-existing |
| 7 | `test_coverage_inventory.test_spatial_grains_preserved_and_never_imputed` | error | เหมือนข้อ 4 | pre-existing |
| 8 | `test_data_sharing.test_feed_bundle_export_and_manifest` | error | chain ผ่าน `compile_doae_coverage` → manifests หาย | pre-existing |
| 9 | `test_data_sharing.test_live_audit_data_sharing_interface` | error | เหมือนข้อ 8 | pre-existing |
| 10 | `test_plan_reconciliation.test_current_audit_selects_2569_subdistrict_plan_not_summary` | error | `FileNotFoundError: data\local\doae-p0\p0-run.json` | pre-existing |
| 11 | `test_temporal_crosswalk.test_audit_crosswalk_resolves_all_known_anomalies` | error | `FileNotFoundError: data\local\doae-geography\subdistrict-crosswalk.csv` (`scripts/audit_temporal_crosswalk.py:23`) | pre-existing |
| 12 | `test_national_warehouse.test_sync_national_hub_data` | fail | `AssertionError: 0 >= 50` — coverage เป็น 0 เพราะ artifact DOAE local หาย | pre-existing |
| 13 | `test_spatial_evidence.test_evidence_does_not_prove_policy_gap` | fail | diagnostic note ต่างข้อความ เพราะ evidence set ว่าง (local หาย) | pre-existing |
| 14 | `test_spatial_evidence.test_extract_doae_disaster_evidence` | fail | `AssertionError: 0 > 30` — ไม่มี DOAE disaster local | pre-existing |

หลักฐานว่าไม่ใช่ regression: ทุก traceback ชี้ artifact ใน `data/local/**` (gitignored, ไม่มีในเครื่องนี้); โมดูลที่ทดสอบ (`coverage_inventory`, `data_sharing`, `plan_reconciliation`, `spatial_evidence`, `temporal_crosswalk`, `national_warehouse`) **ไม่อยู่ใน Round-1 diff เลย** (Round-1 แตะเฉพาะ `observations.py`, `cli.py`, `env.py`, `hub_numeric_sync.py`, `ingest_*_d1.py`, `sync_*_to_d1.py`, `config/resource_licenses.json`, `config/web_catalog_review.json`, web satellite/water/weather, workflows — ซึ่งชุดเทสต์ของสิ่งเหล่านี้ผ่านหมด)

```
$ PYTHONPATH=src ./.venv/Scripts/python.exe -m unittest tests.test_observations
Ran 27 tests in 0.188s   OK
```

**ตอบโจทย์ (f-1): "14 failures + 11-12 errors pre-existing" — ยืนยัน: ตัวเลขจริงคือ failures=3 + errors=11 = 14 test id (ไม่ใช่ 14 fail แยก 11 error) · ทั้งหมด pre-existing · 0 Round-1 regression**

## B — Web checks

```
$ npm --prefix web run typecheck     → next typegen ✓ · tsc --noEmit · exit 0 (0 error)
$ npm --prefix web run test          → tests 118 · pass 118 · fail 0 · duration ~1.4s
$ npm --prefix web run build:vinext  → "Build complete." exit 0
```

(หมายเหตุ: จำนวน test เป็น 118 ใน tree นี้ — มากกว่า 117 ที่ interim doc บันทึก เพราะ suite ขยายต่อระหว่างรอบ; ผ่านหมด ไม่มี fail ค้าง)

## C — D1 read-only audit (SELECT เท่านั้น)

### C-0 schema (ยืนยัน leftover Lane D)

`SELECT name FROM pragma_table_info('observations')` → **25 คอลัมน์** `resource_id, run_id, row_key, series_key, period_start, period_end, period_label, location_id, location_code, location_kind, location_name, province_code, crop_code, crop_name, metric_id, metric_name, product, grade, market, unit, value, dimensions, source_row_ref, quality_status, quality` — **ไม่มี** คอลัมน์ extension ของ `0002` (`data_kind, quality_flag, license_status, source_url, release_at, revision_id`) → `db/cloudflare/0002_observation_extensions.sql` **ยังไม่ได้ apply บน D1 live** (provenance เก็บใน `quality`/`dimensions` JSON แทน) ✓ ตาม leftover ที่แจ้ง

### C-1 จำนวนแถว / breakdown / orphan

`observations` ทุก run รวม = **6,131**; ใต้ `resources.active_run_id` = **3,057**; orphan = **3,074** ใน 10 runs (`run_id NOT IN active_run_id`)

| resource | rows(all) | active-run rows | orphan rows (run: n) |
|---|---|---|---|
| RID `app.rid.go.th/…/public` | 3,498 | **922** (`76559980`) | 922 (`2456e9c7`) + 922 (`98187ef8`) + 732 (`2134aa4f`) = 2,576 |
| Open-Meteo ERA5 `archive-api/…` | 1,943 | **1,800** (`7f844881`) | 59 (`7fd6d68a`) + 42 (`30544ef7`) + 42 (`4cab6f82`) = 143 |
| TMD ByAgro | 624 | **272** (`b6ba99ea`) | 272 (`503940ad`) + 40 (`42b409f4`) + 40 (`a01fcc60`) = 352 |
| TMD WeatherToday V2 | 24 | 24 (`2ac6864d`) | 0 |
| TMD BySynop | 24 | 24 (`a3ca1f97`) | 0 |
| TMD MonthlyRainfall | 12 | 12 (`33aad167`) | 0 |
| GISTDA flood `features/flood/7days` | 6 | **3** (`0278dfa4`) | 3 (`50b4f887`) |

**TMD station รวม = 684** ✓ ตรง claim. RID จริง 3,498 (ทุก run) ไม่ใช่ 1,749 — claim เดิมต่ำไป, แก้ในเอกสาร

### C-2 8 approved resource_ids + active pointer

registry = **87 entries / 8 approved_public / 79 pending** ✓; ทั้ง 8 มี `resources` row ใน D1 `access_status='approved_public'` AND `project_publication_approved=1` ✓; active_run_id:

| approved resource_id | active_run_id | run status | rows |
|---|---|---|---|
| RID reservoirs | `76559980…` | succeeded | 922 (unit `percent`+`MCM`, 0 NULL) ✓ |
| TMD ByAgro | `b6ba99ea…` | succeeded | 272 (unit **NULL 272 โดยออกแบบ** G3) ✓ |
| TMD V2 / Synop / MonthlyRainfall | `2ac6864d…`/`a3ca1f97…`/`33aad167…` | partial | 24/24/12 ✓ |
| Open-Meteo ERA5 | `7f844881…` | succeeded | 1,800 ✓ |
| GISTDA flood | `0278dfa4…` | partial | 3 ✓ |
| CHIRPS daily rnl 2026-09-30 | **NULL** | — | ไม่มี numeric run/แถว → 7/8 เท่านั้นที่มี active succeeded/partial (defect D-3) |

### C-3 sync_runs kind='numeric' = 17 runs: succeeded 8 / partial 7 / failed 2

failed 2 = `2134aa4f` (RID, `RUN_INTERRUPTED_BEFORE_COMPLETION`) + `7fd6d68a` (OM, code เดียวกัน) — records_written=0 ✓ ไม่ลบข้อมูลเดิม

### C-4 distinct metric_id (20) — scan forecast/nwp/prediction

`reservoir_storage_pct, reservoir_volume, tavg_c, tmax_c, tmin_c, precip_mm, rainfall_mm, humidity_pct, rh2m_pct, air_pressure_msl_hpa, wind_speed_ms, wind_direction_deg, t2m_mean_c/t2m_max_c/t2m_min_c, monthly_rainfall_mm, monthly_rainy_days, flood_area_rai, flood_area_km2, rice_area_rai` → **%forecast%/%nwp%/%prediction% = [] (0 รายการ)** → ไม่ละเมิด rule 4 ✓

### C-5 Spot-check rows (value+quality_flag / observed_at / retrieved≥observed / unit state)

- **RID** `rsv435 storage_pct=41.83 unit=percent quality=good`; `rsv291 volume=2.445 unit=MCM good` — pairing ✓; NULL rows 8 (4×pct + 4×volume) ทั้งหมด `quality_status='missing'` (คง null ไม่แทน 0) ✓; `retrieved_at=2026-10-26T11:33:39Z` ≥ `period_start=2026-10-26` ✓ — **พบ 86 แถว `storage_pct>100` (สูงสุด 133.3) flag='good'** (P2 D-5)
- **TMD** `tmd:station:48304 air_pressure_msl_hpa=1013.47 unit=NULL quality=good` — unit NULL โดยออกแบบ, dimensions มี `observedAtSourceIct="2026-10-26T07:00:00+07:00"` (tz-suffixed ✓) + `unitStatus=pending_official_confirmation`; `retrieved_at=11:29:50Z` ≥ observed ✓
- **Open-Meteo** `open-meteo:era5:90 t2m_max_c=34 unit=degC good`; window จริง `2026-08-31..2026-09-29` = 1,800 แถว (claim "2026-09" ตัด 8-31 ออก — minor mismatch); 10 provinces (`COUNT(DISTINCT location_id)=10`, `provinceCode` ใน dimensions) — **แต่คอลัมน์ `province_code` NULL ทั้ง 1,800 แถว และ `location_kind='grid'` ≠ `grid_point`** (P2 D-4)
- **GISTDA** province 64: `flood_area_rai=78.46 rai`, `flood_area_km2=0.125541 km2`, `rice_area_rai=12.31 rai` — rai/km2 แยกหน่วยไม่บวกซ้ำ ✓; `sourceTimeStamp=…11:53:06.676Z` (UTC), `retrieved_at=…11:53:06.767Z` ≥ observed ✓

## D — Governance

**/satellite (P0 เดิม)** `route.ts` live-first: `fetchLiveFlood()` ใช้ `process.env.GISTDA_API_KEY` (server-side) + `AbortSignal.timeout(8000)` + `cache:no-store`; fail → fallback snapshot bundled (`snapshotFloodPolygons()`) ประกาศ `sourceMode:"snapshot"` + `liveFailureCode`; ไม่มี polygon ทั้งสองทาง → **503 `SATELLITE_FEED_UNAVAILABLE`** (fail-closed ไม่แต่งค่า) — ✓ ตรง claim

`SATELLITE_GOVERNANCE.sample=false` + `sampleScope:'flood_layer_only'`; `layerTruth.drought/ndvi` = `sample:true` + `dataKind:'modelled'` + `layerBanners` รายชั้น; comments ย้ำ "ห้ามอ่านว่าทั้ง payload จริง" → **ไม่พบเส้นทาง `sample:false` ข้างหลัง generator** ✓

**Round-3 baseline** — routes ใต้ `web/app/api/v1` = **37** route.ts; lib ที่ประกาศ `sample: true` = 19 ไฟล์ (dashboard generators 17 ใบ + `api-catalog` + `satellite` เฉพาะ drought/ndvi). Routes ที่อ่านจริงจาก D1/live แล้ว: `water/reservoirs`, `weather/observations`, `series/[id]/observations` (grep พบ import `water-repository`/`weather-repository`), `satellite` (GISTDA), `nwp/*` (dry-run). prices/daily = `metadata_only` withhold, weather-engine = 503 by design. → **17 routes ยังเป็น PRNG `sample:true` เต็มใบ = baseline รอบ 3**

## E — Secrets hygiene

```
$ git status --short              → 118 บรรทัด (M + ??) ไม่มี .env/data/local/exports/private
$ git check-ignore -v .env web/.env.local data/local exports/private
  .gitignore:5:.env  ·  :6:.env.*  ·  :8:data/local/  ·  :10:exports/private/
$ git diff --cached --name-only   → ว่าง (ไม่มีอะไร stage)
$ git ls-files | grep env/local/private → เฉพาะ .env.example
```

- grep credential literal (`Bearer <≥15>`, `api_key=[A-Za-z0-9_-]{20,}`, `ukey/token/secret="<≥20>"`) ในไฟล์ Round-1 ทั้งหมด (observations.py, hub_numeric_sync, cli, ingest_*, sync_*_to_d1, config, web satellite/water/weather, workflow) = **0 matches** ✓
- `.env.example` (tracked) มี `CF_ACCOUNT_ID=e00f22…` + `CF_D1_DATABASE_ID=c95fd8…` เป็น identifier ไม่ใช่ secret, `CF_D1_TOKEN` ว่าง — token มาจาก env/wrangler เท่านั้น (P2 D-7 hygiene: fallback hardcode ใน 4 จุด)
- **ไม่พบ secret leak ใหม่; tree สะอาด** ✓

## F — Workflow (`sync-hub-numeric.yml`, 995 บรรทัด) — heuristic validator (ไม่มี PyYAML)

```
tab/indent issues: none
top keys: name, on, permissions, concurrency, jobs
cron slots (UTC): 03:03 rid · 03:09 tmd · 03:15 open_meteo · 03:21 gistda · 03:27 chirps
secrets refs (by name only): CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_D1_TOKEN, GISTDA_API_KEY, TMD_API_UID, TMD_API_UKEY
secret interpolated into echo/print/run lines: none
concurrency group: hub-numeric-${ github.event.schedule || 'manual' }  (per-slot)
dispatch inputs: syncs (rid,tmd,open_meteo,gistda,chirps|all) + date (validate ^\d{4}-\d{2}-\d{2}$)
PYTHONPATH set: 5 occurrences
scripts referenced & present on disk: sync_gistda_to_d1.py ✓ sync_hub_numeric.py ✓ sync_open_meteo_to_d1.py ✓ sync_rid_to_d1.py ✓ sync_tmd_to_d1.py ✓
guards: if github.ref=='refs/heads/main' + continue-on-error + pending_script_missing + "Enforce the <lane> sync exit status" สำหรับ rid/tmd/open_meteo/chirps (enforce fail job เมื่อ script มีจริง)
```

**แต่ 5 lane scripts เป็น untracked** (`git status` → `?? scripts/sync_*_to_d1.py`) + `gh run list --workflow sync-hub-numeric.yml` → **HTTP 404 workflow not found on default branch** (เพราะยังไม่ commit) → **DoDข้อ 4 "รันจริง ≥1 ครั้ง" ไม่ผ่าน**; secrets ทั้ง 6 ยังต้อง owner ติดตั้ง (ใน `.github/workflows` มี `gh secret set` guidance, ห้ามส่ง token ในแชต)

## DoD cross-check (assignment §7, ขอบเขตรอบ 1) — met/partial/unmet

| # | DoD | ผล | หลักฐาน |
|---|---|---|---|
| 1 | D1 มี observations จริง + numeric runs succeeded/partial | **met** | 6,131 แถว; reader เห็น 3,057 ใต้ active; runs 8 succeeded/7 partial/2 failed; baseline 0 → จริง |
| 2 | ไม่มีหน้า/API ประกาศ `sample:false` จาก generator | **met** | `sample:false` ใบเดียว = `satellite-data.ts` flood layer อ่าน GISTDA live/snapshot จริง; 17 generators ติด `sample:true` |
| 3 | ทุกตัวเลข publish มี resource approved_public + publication + evidence | **met** | 8 registry entries ผ่าน gate; writer `assert_resource_approved` fail-closed; D1 resources ตรง registry (7/8 มี active; CHIRPS ยังไม่มีแถว) |
| 4 | CI sync ตัวเลข + รันจริง ≥1 ครั้ง | **unmet (โครงสร้างผ่าน)** | workflow ครบแต่ 4 lane scripts untracked, secrets 6 ยังไม่ตั้ง, `gh run list` → 404, run จริง 0 ครั้ง |
| 5 | `/nwp` มี H1 ค่าจาก D1 จริง | **unmet (นอกขอบเขตรอบ 1)** | route/page/lib ครบแต่ dry-run; `nwp_runs` 0 แถว; 0003_nwp ยังไม่ populated (รอบ 2) |
| 6 | mock routes เหลือ <5 | **unmet (นอกขอบเขตรอบ 1)** | ยังเหลือ PRNG routes 17 = baseline รอบ 3 |
| 7 | typecheck 0 · test ผ่าน · build ผ่าน | **met** | typecheck exit 0 · test 118/118 · build complete |
| 8 | git ไม่มี .env/token/data/local ถูก track | **met** | ดูข้อ E |
| 9 | HANDOFF + progress มีหลักฐาน + งานค้าง | **met** | อัปเดตแล้วทั้ง 2 ไฟล์ |

## Defect list (ยังไม่แก้ — ของ lane ที่ระบุ)

| ID | ระดับ | Lane เจ้าของ | สรุป + repro |
|---|---|---|---|
| D-1 | **P1** | Lane G + owner | CI รันจริงยังไม่บรรลุ: 4 sync scripts เป็น untracked + secrets 6 ยังไม่ตั้ง + workflow ยัง 404 บน default branch. Repro: `gh run list --repo dragonfly13110/thailand-agri-intelligence --workflow sync-hub-numeric.yml` → HTTP 404; `git status --short \| grep scripts/sync` → `??` |
| D-2 | **P1** | Lane B | Storage churn ทุก rerun: `run_id=uuid5(resource_id\|adapter_version\|payload_sha256)` ที่ `payload_sha256` ฝัง per-row `retrieved_at` (`observations.py:225`) → rerun วันเดิม mint run ใหม่, orphan สะสม 3,074 แถว/10 runs. Repro D1: ByAgro 4 runs เดียวกัน sha ต่าง (a01fcc/42b409/503940/b6ba99); RID 3 active+2 orphan runs วันเดียวกัน |
| D-3 | **P2** | Integrator | CHIRPS `approved_public`+`publication=1` แต่ `active_run_id=NULL` และไม่มี observation → "อนุมัติแล้วแต่ไม่ publish"; ควรระบุสถานะ deferred รอบ 2 ใน registry/HANDOFF. Repro: SELECT resources WHERE resource_id='…chirps-v3.0.rnl.2026.09.30.tif' → active_run_id NULL |
| D-4 | **P2** | Lane E | OM grid: `province_code` NULL ทั้ง 1,800 แถว, `location_kind='grid'` ≠ `grid_point` (claim); province อ่านได้แค่ `dimensions.provinceCode` → filter โดยคอลัมน์ไม่ได้. Repro: C-5 OM_WINDOW/OM_PROVCOL |
| D-5 | **P2** | Lane C | RID active run มี `reservoir_storage_pct>100` 86 แถว (max 133.3) flag='good' — ค่าจริงจาก source แต่ dashboard อาจตีความเป็นค่าเสีย; แนะนำ writer เพิ่ม `range_warning`. Repro: SELECT COUNT/MAX … WHERE value>100 |
| D-6 | **P2** | Lane A/Integrator | `config/web_catalog_review.json` = 17 records ครอบคลุม approved แค่ 2/8 (`open_meteo_thailand_era5_archive`, `rid_medium_reservoirs`); ที่เหลือ (TMD×4, GISTDA, CHIRPS) ไม่มี approved review record; `web/tests/catalog.test.ts:9` hardcode `records.length === 17` → ทุก regeneration ต้องแก้ test. Repro: Python นับ review records + grep test |
| D-7 | **P2 hygiene** | Repo owner | `CF_ACCOUNT_ID`/`CF_D1_DATABASE_ID` hardcode fallback (hub_catalog_sync.py:552, d1.ts, workflow เดิม, .env.example) — ไม่ใช่ secret แต่ควร env-only + fail-closed ระยะยาว |
| D-8 | **P2 doc** | Lane H/เจ้าของ claim | ตัวเลขในเอกสาร claim ไม่ตรง D1: RID 3,498 (ไม่ใช่ 1,749), OM window `2026-08-31..09-29` (ไม่ใช่ "2026-09" ล้วน), GISTDA values เป็น rolling 7-day ที่ refresh — ต้องอ่านจาก D1 ณ runtime ไม่ใช่ copy จากเอกสาร |
| D-9 | **P1 stranded runs** | Lane B + C | `2456e9c7` (922, **succeeded, unit NULL ทั้ง 922**) และ `2134aa4f` (732, failed, unit NULL) เป็น orphan — reader ปลอดภัย (filter `o.run_id=r.active_run_id`) แต่ถ้าย้าย pointer ไป `2456e9c7` จะ expose 922 แถว unit-NULL ทันที |

## Disposition recommendation — stranded unit-NULL RID runs (โจทย์ขอ)

1. **`2456e9c7` (succeeded, 922 unit-NULL): ปิดเป็น `status='failed'` + `error_code='SUPERSEDED_UNIT_NULL_BATCH'` โดยไม่ลบแถว** — มาตรฐานเดียวกับ `7fd6d68a`/`2134aa4f` ที่ปิด RUN_INTERRUPTED แล้วกันการ activate พลาด · เจ้าของ Lane B (writer) + C (RID)
2. **`2134aa4f` (failed, 732 unit-NULL): คงเป็นประวัติรัน (failed อยู่แล้ว, records_written=0)** — ไม่ต้องลบ เพราะ reader ไม่เห็น;列为 quarantine evidence
3. **`98187ef8` (succeeded, 922 unit ครบ, ถูก supersede โดย 76559980):** คงไว้เป็นประวัติ (duplicate วันเดียวกัน) — จะลบทีหลังได้เมื่อเปิด idempotency ระดับ storage (D-2)
4. **เพิ่ม guard ใน writer:** refuse activation เมื่อ unit-NULL ratio ของ run เกิน threshold (กัน P1 D-9 ซ้ำ) แล้วค่อย backfill unit ทางการ — road map "units stay NULL until official confirmation"
5. Owner ทุกเคสควร apply `0002_observation_extensions.sql` ก่อน เพื่อ promote provenance/`data_kind` เป็นคอลัมน์จริง (D-1 ของ leftover Lane D)

## คำสั่งรับต่อ (rerun หลักฐาน)

```
PYTHONPATH=src ./.venv/Scripts/python.exe -m unittest discover -s tests
PYTHONPATH=src ./.venv/Scripts/python.exe -m unittest tests.test_observations
npm --prefix web run typecheck && npm --prefix web run test && npm --prefix web run build:vinext
PYTHONPATH=src ./.venv/Scripts/python.exe -c "import tadih.env; from tadih.hub_catalog_sync import connect_d1_client; ..."  # D1 SELECT-only, redact api_key=
./.venv/Scripts/python.exe  .github/workflows/sync-hub-numeric.yml heuristic-validator
```
