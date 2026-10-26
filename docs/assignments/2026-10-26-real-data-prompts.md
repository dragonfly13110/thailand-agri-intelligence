# คำสั่ง Orchestrator — โปรแกรม Real Data (4 รอบ)

ทุกคำสั่งในไฟล์นี้เป็น **copy-paste ไปวางที่ AI agent ตัวอื่น** ได้ทันที
อ่านคู่กับ [2026-10-26-real-data-initiative.md](2026-10-26-real-data-initiative.md) (เรียกต่อไปว่า "แผนหลัก")

**ลำดับ:** รอบ 1 → 2 → 3 → 4 ทำตามลำดับ รอบถัดไปต่อยอด (ห้าม revert งานรอบก่อน)
**กติกาตายตัว:** ทุก lane ในรอบเดียวกันทำขนานกันได้ แต่ห้ามแตะไฟล์นอกขอบเขตที่ระบุ · ห้าม commit/push/deploy · ห้ามแตะ `.env`/`data/local` · ห้ามพิมพ์ credential

---

## รอบ 1 — Real Data Core (D1 เริ่มมีตัวเลขจริง + แก้ /satellite + CI)

> ส่งข้อความนี้ทั้งก้อนให้ Orchestrator ตัวที่ 1

```
คุณคือ Orchestrator ของโปรแกรม Real Data รอบ 1 ใน repo T:\coding+\BI AGRI THAILAND
(เรียกสั้น ๆ ว่า "แผนหลัก" = docs/assignments/2026-10-26-real-data-initiative.md)

ขั้นตอนบังคับ:
1. อ่าน AGENTS.md, HANDOFF.md, docs/progress.md และ "แผนหลัก" ให้ครบก่อนลงมือ
2. รัน `git status` และ `git log --oneline -10` เพื่อดูสถานะจริง
   - working tree มีงานค้างจากงาน TMD HPC NWP (src/tadih/tmd_hpc_nwp.py, web/lib/hub/nwp-*.ts,
     web/components/nwp-heatmap.tsx, web/components/nwp-dashboard.module.css) — ห้ามลบ/ทับ แค่ระวัง
3. สร้าง TaskCreate ครบทุก lane แล้ว spawn subagent ด้วย Agent tool (subagent_type general-purpose)
   ให้ทำงานตาม wave — ห้ามปล่อย wave 2 ก่อน wave 1 เสร็จ
4. ทุก lane ต้องรายงานกลับ: ไฟล์ที่แก้, คำสั่งที่รัน + ผลจริง, จำนวนแถวที่เขียนลง D1, ข้อจำกัด, งานค้าง
5. ห้าม commit / push / deploy เด็ดขาด — เจ้าของงานจะสั่งเอง
6. ถ้าปุ่ม Agent tool ใช้ไม่ได้ ให้รัน lane ตามลำดับ wave และรายงานว่าไม่สามารถขนานได้

══════════════════════════════════════════════════════════
WAVE 1 (ขนานกัน 2 lane) — ปลดล็อกสิทธิ์ + สร้าง writer กลาง
══════════════════════════════════════════════════════════

─── LANE A: Governance & License Registry ───
อ่านแผนหลักข้อ 3.3 ก่อน
ไฟล์ที่แก้ได้ (เฉพาะ): config/resource_licenses.json, config/sources.json
งาน:
- ทบทวน 82 รายการใน config/resource_licenses.json (81 pending / 1 approved_public)
- เปิดเป็น approved_public เฉพาะ resource ที่มีหลักฐานสิทธิ์ชัดเจน ตาม AGENTS.md ข้อ 3 ที่แก้เมื่อ 26 ต.ค. 2569
  (เจ้าของระบบได้รับ credential อย่างถูกต้องแล้ว) โดยต้องมี evidence ที่ตรวจสอบย้อนได้ (URL + วันที่ + สิ่งที่พบ)
  และ attribution_text พร้อมแสดงบนหน้า/API
- กลุ่มเป้าหมายหลัก (เรียงตามความสำคัญ):
  a) RID reservoir daily (app.rid.go.th public API) — ใช้เป็นแหล่งหลักของ /water และ /early-warning
  b) TMD station observations (data.tmd.go.th TMD API: WeatherTodayByAgro / DailyWeather / Synoptic / ThailandMonthlyRainfall)
  c) Open-Meteo ERA5 archive (CC BY 4.0 — attribution ต้องเป็น "Weather data by Open-Meteo.com")
  d) GISTDA flood 7days (api-gateway.gistda.or.th) — ตอนนี้ banner ประกาศว่า approved_public แล้ว ต้องทำให้ registry สอดคล้อง
- เพิ่ม resource entries ใหม่ถ้าจำเป็น (resource_key ต้อง unique และตามรูปแบบเดิม)
- ห้ามเปิด approved_public ให้ทรัพยากรที่สิทธิ์ไม่ชัด (ข้อมูลบุคคล/สัญญาอนุญาตเฉพาะ) — คง pending และอธิบาย
- ตรวจด้วย: python -c "import json;d=json.load(open('config/resource_licenses.json',encoding='utf-8'));print(len(d['resources']))"
  และสรุปจำนวน approved/pending ที่เปลี่ยน
ส่งมอบ: ตาราง resource_key เดิม→ใหม่ พร้อมเหตุผลและ URL หลักฐาน

─── LANE B: Observation Writer Core (เจ้าของ writer กลาง) ───
อ่านแผนหลักข้อ 3.2 ก่อน
ไฟล์ที่แก้ได้ (เฉพาะ): src/tadih/observations.py (ใหม่), src/tadih/hub_numeric_sync.py,
  src/tadih/cli.py, web/lib/hub/d1-numeric-repository.ts, web/lib/hub/d1.ts, db/cloudflare/*.sql
งาน:
- สร้าง src/tadih/observations.py ตาม interface ในแผนหลักข้อ 3.2 ให้เป็นตัวเขียนตัวกลางที่ connector อื่นใช้ร่วมกัน
- fail-closed ตามแผนหลักข้อ 3.2 (license gate, run lifecycle, active_run_id switch, ไม่ลบข้อมูลเดิมเมื่อล้ม)
- refactor src/tadih/hub_numeric_sync.py ให้เรียกตัวเขียนกลาง โดย **พฤติกรรมของ CHIRPS เดิมต้องเหมือนเดิมทุกประการ**
  (approved_resource, validate_numeric_batch, sync_numeric_resource_d1, 3-cell sample, run status='partial')
- เพิ่มคำสั่ง CLI ใน src/tadih/cli.py แบบทั่วไป: `tadih ingest --adapter <name> [--dry-run] [--write] [--date YYYY-MM-DD]`
  ที่เรียกเข้า adapter module ตามชื่อ (R1-C/D/E/F จะส่งมา) — ถ้า adapter ยังไม่มีให้ตอบ error ชัดเจน ไม่ใช่ crash
  และคงคำสั่งเดิมทั้งหมดไว้ (ห้ามลบคำสั่งเดิม)
- web/lib/hub/d1-numeric-repository.ts: เพิ่มการอ่าน observations แบบ generic (filter: source_id, metric_id,
  province_code, period range) โดยใช้ prepared statement + parameter binding เท่านั้น
- ถ้าพบว่าตาราง observations ใน db/cloudflare/0001_hub.sql ไม่พอสำหรับ 4 แหล่ง → เขียน migration เป็น
  db/cloudflare/0002_observation_extensions.sql (เจ้าของไฟล์ db/ ของทั้งโปรแกรมคือ lane นี้) ถ้าไม่จำเป็นก็ไม่ต้องสร้าง
- ทดสอบ: python -m unittest tests.test_hub_numeric_sync (ต้องผ่านเท่าเดิม) + tests ใหม่ของ observations.py
  โดยใช้ SQLite/D1 mock แบบ offline เท่านั้น
ส่งมอบ: ไฟล์, interface ที่แน่นอน, ตัวอย่าง envelope ที่ lane อื่นต้องสร้าง, ผลเทสต์

══════════════════════════════════════════════════════════
WAVE 2 (ขนานกัน 5 lane) — ต่อ connector เข้า D1
══════════════════════════════════════════════════════════
ทุก lane ของ wave 2 ต้องเรียก publish_observations() จาก src/tadih/observations.py ที่ Lane B เขียน
ถ้า Lane B ยังไม่เสร็จ ให้เขียน adapter ตาม interface ในแผนหลักข้อ 3.2 และทดสอบกับ client ปลอม

─── LANE C: RID Reservoirs → D1 ───
ไฟล์ที่แก้ได้ (เฉพาะ): src/tadih/ingest_rid_d1.py, scripts/sync_rid_to_d1.py, tests/test_ingest_rid_d1.py
งาน:
- ใช้ของที่มีอยู่แล้ว: src/tadih/reservoirs.py (normalize + fail-closed) และ scripts/sync_rid_reservoirs.py
  (daily sync, snapshot ลง data/local/raw/rid/) — ห้ามแก้ไฟล์เหล่านี้ ให้ import ใช้
- ดึงรายงาน RID ล่าสุด (GET https://app.rid.go.th/reservoir/api/reservoir/public) แล้วเขียนลง observations
  - spatial_support = "reservoir", location_kind = "reservoir", location_code = reservoir id ของ RID
  - metric_id: "reservoir_storage_pct" (จาก 100×volume/storage) และ "reservoir_volume" (จำนวน ลบ.ม. ถ้าต้นทางให้)
  - unit = "percent" / "m3" — ถ้าไม่ยืนยันหน่วยจากต้นทางให้เป็น null ตามแผนหลักข้อ 3.1
  - missing คง null (ห้ามแทน 0)
- script ต้องรองรับ --dry-run (default) และ --write, มี --date สำหรับย้อนหลัง
- ห้ามเขียนถ้า resource ของ RID ยัง pending ใน registry → ให้รายงานให้ Lane A ปลด
- ทดสอบ offline ด้วย fixture ของรายงาน RID ที่มีอยู่ใน data/local/raw/rid/ (อ่านได้ แต่ห้าม commit)
- เมื่อ --write แล้ว รายงานจำนวน observations ที่เขียนจริง

─── LANE D: TMD Station Observations → D1 ───
ไฟล์ที่แก้ได้ (เฉพาะ): src/tadih/ingest_tmd_d1.py, scripts/sync_tmd_to_d1.py, tests/test_ingest_tmd_d1.py
งาน:
- ใช้ src/tadih/tmd_archive.py (WeatherTodayByAgro, DailyWeather, Synoptic, ThailandMonthlyRainfall) + src/tadih/tmd_nwp.py
  ห้ามแก้ไฟล์เหล่านี้
- **ข้อสำคัญ:** TMD NWP เป็น FORECAST → ห้ามเขียนลงตาราง observations (แผนหลักข้อ 2 ข้อ 4)
  ให้เขียนเฉพาะค่าที่วัดจริง (daily/synoptic ของสถานี) ลง observations
  ส่วน forecast ให้ส่งต่อเป็นรายการ "pending" ในรายงานเพื่อไปทำต่อในรอบ 2 (ตาราง NWP)
- spatial_support = "station" (ไม่ใช่ province — ข้อมูลสถานีไม่เท่ากับจังหวัด) และแปลง พ.ศ. → ค.ศ. ตามโมดูลเดิม
- TMD ต้องใช้ browser User-Agent (มีโอกาสโดน 403 ถ้าใช้ UA เริ่มต้น) — ใช้ helper ที่มีอยู่
- ทดสอบ offline + ทำ live probe แบบ bounded 1 สถานี 1 วัน แล้วรายงานผล

─── LANE E: Open-Meteo → D1 ───
ไฟล์ที่แก้ได้ (เฉพาะ): src/tadih/ingest_open_meteo_d1.py, scripts/sync_open_meteo_to_d1.py,
  tests/test_ingest_open_meteo_d1.py
งาน:
- ใช้ src/tadih/open_meteo.py (ERA5 archive + ECMWF forecast) + scripts/sync_open_meteo.py ห้ามแก้ไฟล์เหล่านี้
- เขียนเฉพาะ ERA5 reanalysis (data_kind = "estimated", spatial_support = "grid_point" ที่ centroid จังหวัด
  หรือ "province" ถ้าคำนวณจาก centroid) — ECMWF forecast เป็น forecast → ไม่ลง observations ให้รายงานไว้รอบ 2
- metric_id: "t2m_mean_c", "t2m_max_c", "t2m_min_c", "precip_mm", "wind_speed_ms", "rh2m_pct"
- attribution ต้องเป็น "Weather data by Open-Meteo.com" + CC BY 4.0 และต้องไปโผล่ใน payload
- คุม rate limit (<600 req/min) และใช้ backoff
- ทดสอบ offline + live probe จังหวัดเดียวช่วงสั้น แล้วรายงานผล

─── LANE F: GISTDA Flood → D1 + แก้ /satellite (P0) ───
ไฟล์ที่แก้ได้ (เฉพาะ): src/tadih/ingest_gistda_d1.py, scripts/sync_gistda_to_d1.py,
  tests/test_ingest_gistda_d1.py, web/lib/hub/satellite-data.ts, web/app/api/v1/satellite/route.ts,
  web/components/satellite-dashboard.tsx
งาน:
- P0 (สำคัญที่สุด): หน้า /satellite ปัจจุบันประกาศ sample:false + banner "ข้อมูลจริง GISTDA/Sentinel-1"
  แต่ค่าทั้งหมดมาจาก FNV-1a generator → ต้องแก้ให้ตรงกันจริง เลือกทางใดทางหนึ่ง:
    (ก) ดึง GISTDA จริงสดใน route (มี GISTDA_API_KEY ใน .env) แล้วแสดงค่าจริง พร้อมแสดงจำนวน polygon,
    พื้นที่น้ำท่วม (ไร่/ตร.กม.), พื้นที่นาข้าว, ชนิดดาวเทียม, เวลาดึงข้อมูล, และ fallback ไปที่ snapshot
    web/data/gistda_flood_7days.json เมื่อ live call ไม่สำเร็จ (แล้วระบุว่าเป็น snapshot ไม่ใช่ของสด)
    (ข) ถ้าทำ (ก) ไม่สำเร็จในเวลานี้ ให้คืน sample:true + metadata_only พร้อมคำเตือนที่ถูกต้อง
    ห้ามเลือกทางที่ทำให้ตัวเลขปลอมถูกประกาศว่าจริง — นี่คือข้อผิดพลาด governance
- ตรวจว่า banner/disclaimer ทุกจุดตรงกับแหล่งที่ใช้จริง (ถ้าใช้ snapshot ต้องเขียนว่า snapshot + วันที่)
- ตัวเลขน้ำท่วมต้องแยกหน่วย ไร่ กับ ตร.กม. (1 ตร.กม. = 625 ไร่) และห้ามนำมาบวกรวมกันซ้ำ
- เขียน polygon เป็น observations: รวมพื้นที่น้ำท่วมต่อรหัสจังหวัด DOPA (spatial_support="province", area_code=2 หลัก)
  พร้อม dimensions ที่ระบุ method="sum_polygon_area_by_dopa_province", tambon_count, satellite_sources,
  และ data_kind="estimated" + quality ที่ระบุว่าเป็นพื้นที่ประมาณจากการตรวจจับ SAR
  (ถ้าไม่มี polygon ของจังหวัดใด ให้เป็น null ไม่ใช่ 0 — ห้ามแทน missing ด้วย 0)
- ทดสอบ offline + live probe แล้วรายงานผลจริง

─── LANE G: CI & Scheduling ───
ไฟล์ที่แก้ได้ (เฉพาะ): .github/workflows/sync-hub-numeric.yml (ใหม่), .github/workflows/sync-hub-catalog.yml
งาน:
- ตอนนี้ CI มีแต่ cron sync catalog → observations เป็นไปไม่ได้เอง
  ให้สร้าง workflow ใหม่ที่รัน sync ตัวเลขตามตาราง (แนะนำทุกวัน แต่ละที offset เวลากัน) และมี manual dispatch
- workflow ต้อง: ตั้ง secret CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_TOKEN, ไม่ echo ค่า secret,
  มี timeout, มี step สรุปผลเป็น run summary, fail ถ้า exit code ไม่ใช่ 0
- ต้องเรียก script ที่ Lane C/D/E/F สร้าง (scripts/sync_*_to_d1.py) และเก็บ log ที่ไม่มี credential
- ถ้า script ของ lane อื่นยังไม่พร้อม ให้เขียน workflow ให้เรียกได้และมี "continue-on-error" ชั่วคราวพร้อมคอมเมนต์
- ตรวจด้วย actionlint ถ้ามี หรืออย่างน้อยตรวจ YAML ด้วย python yaml.safe_load
- ไม่แตะ .env และไม่ hardcode token

══════════════════════════════════════════════════════════
WAVE 3 — QA (1 lane)
══════════════════════════════════════════════════════════
─── LANE H: QA & Verification (ห้ามแก้ product code) ───
ไฟล์ที่แก้ได้ (เฉพาะ): docs/real-data-qa-round1.md (รายงาน)
ต้องรันและรายงานผลจริง:
- PYTHONPATH=src .venv/Scripts/python.exe -m unittest discover -s tests
- npm --prefix web run typecheck · npm --prefix web run test · npm --prefix web run build:vinext
- D1 read-only: นับ observations, sync_runs kind='numeric', resources ที่ access_status='approved_public'
  และ active_run_id ที่ชี้ไปหา run สำเร็จ, พร้อมตัวอย่างแถว 3 แถว (ห้ามพิมพ์ token)
- ตรวจว่า /api/v1/satellite ไม่ได้ประกาศข้อมูลจริงแต่ค่ามาจาก generator (เทียบ source กับ banner)
- ตรวจว่าไม่มี secret/raw data ถูก track: git status --short + git check-ignore -v .env web/.env.local data/local
- สรุปตาราง pass/fail + blocker
```

---

## รอบ 2 — ปิดงาน TMD HPC NWP ให้เป็นผลิตภัณฑ์ข้อมูลจริง

> ส่งข้อความนี้ทั้งก้อนให้ Orchestrator ตัวที่ 2 (หลังรอบ 1 เสร็จ)

```
คุณคือ Orchestrator ของโปรแกรม Real Data รอบ 2 (TMD HPC NWP) ใน repo T:\coding+\BI AGRI THAILAND
"แผนหลัก" = docs/assignments/2026-10-26-real-data-initiative.md
work order เดิม = docs/assignments/2026-10-26-tmd-hpc-nwp-integration.md

สถานะที่ทำไว้แล้ว (ห้ามเขียนทับ):
  src/tadih/tmd_hpc_nwp.py (1,032 บรรทัด) + tests/test_tmd_hpc_nwp.py (678)
  web/lib/hub/nwp-types.ts, web/lib/hub/nwp-risk.ts,
  web/components/nwp-heatmap.tsx, web/components/nwp-dashboard.module.css
ยังขาด: normalize, migration, publish script, 3 API routes, /nwp page, nwp-dashboard.tsx, integration

ขั้นตอนบังคับ:
1. อ่าน AGENTS.md, HANDOFF.md, work order เดิม, "แผนหลัก" แล้วรัน git status / git log
2. spawn subagent ตาม lane ด้านล่าง (general-purpose) — lane ทำขนานกันได้เมื่อพึ่ง contract กันแล้ว
3. ห้าม commit / push / deploy · ห้ามแตะ .env / data/local · ห้ามพิมพ์ credential
4. ห้าม lane ใดแตะ src/tadih/cli.py (เจ้าของของรอบ 1) และห้ามแตะ db/cloudflare/*.sql ยกเว้น Lane C
5. ทุก lane รายงาน: ไฟล์ที่แก้, คำสั่ง+ผลจริง, run_id/จำนวนไฟล์/จำนวนแถว/จำนวนเซลล์, ข้อจำกัดหน่วย/license, งานค้าง

══ WAVE 1 (ขนาน 3 lane) ══
── LANE B: Normalize + Aggregate ──
ไฟล์ที่แก้ได้ (เฉพาะ): src/tadih/tmd_hpc_normalize.py, config/nwp_thresholds.json, tests/test_tmd_hpc_normalize.py
งาน (ตาม work order เดิมข้อ 3.2–3.4 และ 3.7):
- parse CSV ของ TMD HPC เป็น long table (run × variable × valid_at × cell), missing คง null, 0 คง 0,
  ห้าม interpolate, valid_at เป็น UTC
- downsample เป็น 0.15° บน bbox [96,5,106,21] เก็บ mean/max/count, nx/ny ต้องตรง, เซลล์ไม่มีข้อมูล = null
- province values: ใช้ data/local/geography/ddpm_province.geojson, วิธี max_within_25km, fallback nearest_cell,
  เก็บ method/radius_km/distance_km/cell_count — ห้ามสร้างพิกัดจังหวัดเอง, ถ้าไม่มี GeoJSON ให้ error ชัดเจน
- thresholds จาก config/nwp_thresholds.json เท่านั้น (ห้าม hardcode ซ้ำ) พร้อมคำเตือนว่าเป็นเกณฑ์ภายใน ไม่ใช่ประกาศราชการ
- tests: header ผิด, lat/lon ซ้ำ, null, 0, ค่าเกินช่วง, bbox ว่าง, จังหวัดไม่มีเซลล์
ส่งมอบ: ฟังก์ชัน + tests + ตัวอย่าง snapshot JSON จาก fixture

── LANE C: D1 Publish + Migration ──
ไฟล์ที่แก้ได้ (เฉพาะ): db/cloudflare/0002_nwp.sql, scripts/sync_tmd_hpc_nwp.py
  (ถ้า db/cloudflare/0002_observation_extensions.sql มีอยู่แล้วจากรอบ 1 ให้ใช้เลขถัดไป 0003_nwp.sql)
งาน:
- schema ตาม work order เดิมข้อ 3.5 ครบทุกคอลัมน์/constraint
- publish จาก export JSON ของ Lane B ด้วย prepared statement + parameter binding
- รองรับ --dry-run (validate + นับแถว ไม่เขียน) และ --write (ต้องมี D1 client; ถ้าไม่มีให้ exit code 2
  พร้อม D1_NOT_CONFIGURED ห้าม fallback ไป mock)
- retention: เก็บ 3 รอบล่าสุดต่อ domain, ลบตาม ON DELETE CASCADE, ห้ามลบ raw ก่อน D1 write สำเร็จ
- tests: payload ผิด, snapshot length ไม่ตรง nx*ny, province อ้าง snapshot ที่ไม่มี, dry-run ไม่เขียน

── LANE H: Source/License/Units Research (read-only) ──
ไฟล์ที่แก้ได้ (เฉพาะ): docs/nwp-source-license-units.md
งาน: หาเอกสารทางการของตัวแปร p1h/p24h/t2m/rhum/ws10m, domain d01/d02, รอบ init, หน่วย, เวลา UTC/ICT
  ตรวจหน้า docs/about/terms ของ hpc.tmd.go.th และ data.tmd.go.th (ถ้า WAF 403 ให้บันทึกตามจริง)
  ห้ามเดาหน่วย — ถ้าไม่พบให้เขียน "unconfirmed" และสรุปว่าจะเปิด numeric_preview ได้หรือไม่

══ WAVE 2 (ขนาน 2 lane) ══
── LANE D: Web Data + 3 API Routes ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/nwp-data.ts, web/app/api/v1/nwp/runs/route.ts,
  web/app/api/v1/nwp/grid/route.ts, web/app/api/v1/nwp/provinces/route.ts, web/tests/nwp-data.test.ts
งาน:
- ใช้ handleApi/jsonData/HubRequestError/getD1 เดิม ห้ามเพิ่ม dependency
- query validation ตาม work order เดิมข้อ 4 (runId pattern, variable allowlist 5 ตัว, validAt ISO UTC)
- error codes ตามข้อ 4.4 (400 INVALID_QUERY / 404 NWP_NOT_FOUND / 403 NWP_PUBLICATION_DISABLED /
  503 HUB_DATABASE_NOT_CONFIGURED / 500 NWP_PAYLOAD_TOO_LARGE)
- grid payload ≤ 250KB, nx*ny = ความยาว array, null คง null, cache-control no-store, warnings ภาษาไทย
- tests เป็น pure mapping/validation ไม่ยิง network

── LANE E: UI /nwp ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/app/nwp/page.tsx, web/components/nwp-dashboard.tsx
  (มี nwp-heatmap.tsx และ nwp-dashboard.module.css อยู่แล้ว ให้ใช้ ไม่ต้องเขียนใหม่)
งาน:
- ประกอบ 9 ส่วนตาม work order เดิมข้อ 2.2 (governance banner, run bar, variable tabs, lead-time control,
  SVG heatmap, province watchlist 77 จังหวัด, advisories, data quality panel, cross-links)
- heatmap SVG จาก mean/max, tooltip lat/lon/value, legend, แกน lat/lon, ไม่มีขอบเขตการปกครองปลอม
- responsive 1440/390 ไม่มี horizontal overflow, keyboard accessible, empty/error/loading states
- ห้ามแก้ page-registry/shell/globals (Lane F ทำ)

══ WAVE 3 (ขนาน 2 lane) ══
── LANE F: Integration/Navigation/Docs ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/components/page-registry.ts, web/scripts/prepare-data.mjs,
  web/lib/hub/api-catalog.ts
งาน: เพิ่ม PageId 'nwp' (group 'weather'), copy config/nwp_thresholds.json → web/data/nwp-thresholds.json,
  เพิ่ม 3 endpoints ใน api-catalog, ตรวจว่า sidebar/home/directory/search เข้าถึง /nwp ได้

── LANE G: QA ──
ไฟล์ที่แก้ได้ (เฉพาะ): docs/nwp-qa-report.md
ต้องรัน: python -m unittest tests.test_tmd_hpc_nwp tests.test_tmd_hpc_normalize -v ·
  npm --prefix web run typecheck/test/build:vinext · crawl 34 routes · ตรวจ payload ≤250KB และ nx*ny ตรง ·
  ตรวจ governance ว่าไม่มี sample:true มี license/unit warnings · ตรวจ git status ว่าไม่มี secret/raw data
  · ตรวจ /nwp ที่ 1440 และ 390 ว่าไม่มี overflow และ console ไม่มี error
```

---

## รอบ 3 — เปลี่ยน mock → ข้อมูลจริง (19 API routes ที่ยังเป็นตัวอย่าง)

> ส่งข้อความนี้ทั้งก้อนให้ Orchestrator ตัวที่ 3

```
คุณคือ Orchestrator ของโปรแกรม Real Data รอบ 3 ใน repo T:\coding+\BI AGRI THAILAND
"แผนหลัก" = docs/assignments/2026-10-26-real-data-initiative.md

เป้าหมาย: API ที่ยังตอบตัวเลขจำลอง (deterministic PRNG, sample:true, metadata_only)
  ให้เปลี่ยนเป็นอ่านจาก D1 (observations ที่รอบ 1 เขียนไว้) หรือเรียกต้นทางจริงโดยตรง
  โดย "คงรูป response เดิม" ไว้ — หน้า UI ต้องไม่ต้องแก้ ถ้าแก้จำเป็นให้รายงาน

ขั้นตอนบังคับ:
1. อ่าน AGENTS.md, HANDOFF.md, "แผนหลัก", git status / git log
2. spawn subagent 9 ตัวตาม lane ด้านล่าง (ขนานกันได้)
3. ห้าม commit / push / deploy · ห้ามแตะ .env / data/local · ห้ามพิมพ์ credential
4. กฎสำคัญ: เปลี่ยน "แหล่งข้อมูล" เท่านั้น — คงชื่อฟิลด์, envelope (data/meta), โครงสร้าง meta
   (availability/runtimeMode/access/completeness/warnings/requestId), และ status code เดิมไว้
5. ถ้าแหล่งจริงยังไม่มีสิทธิ์/ไม่มีใน D1 → ห้ามแต่งตัวเลขใหม่ ให้เปลี่ยนเป็น empty state
   ที่บอกตรง ๆ ว่ายังไม่มีข้อมูล พร้อม meta.access ที่ถูกต้อง และรายงานว่าต้องเปิดอะไรเพิ่ม
6. ทุก lane รายงาน: ไฟล์ที่แก้, คำสั่ง+ผลจริง, ตัวอย่าง response ก่อน/หลัง, ข้อจำกัด, งานค้าง

── LANE A: ราคาสินค้า (OAE / NABC) ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/price-data.ts, web/app/api/v1/prices/daily/route.ts
อ่าน src/tadih/prices.py, src/tadih/daily_prices.py, src/tadih/price_pipeline.py, src/tadih/price_trend.py
  (ห้ามแก้ไฟล์เหล่านี้) — ดึงราคาจริงรายสินค้า/เกรด/ตลาด/หน่วย
  ห้ามรวมราคาต่างสินค้า/เกรด/หน่วย/ตลาดเข้าด้วยกัน และห้ามบวก subtotal ซ้ำ
  ถ้าข้อมูลยัง pending → empty state + รายงาน

── LANE B: น้ำและอ่างเก็บน้ำ (RID) ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/water-data.ts, web/app/api/v1/water/reservoirs/route.ts
อ่าน observations ที่ Lane C ของรอบ 1 เขียน (source_id='rid', spatial_support='reservoir')
  ต้องเห็น 461 อ่าง, ค่าความจุ %, เวลาดึงข้อมูลจริง, และระบุชัดว่าเป็นค่าประมาณจาก volume/storage
  ถ้ายังไม่มี observations ให้ empty state พร้อมระบุว่ารอบ 1 ยังไม่ได้เขียน

── LANE C: สภาพอากาศ (TMD / Open-Meteo) ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/weather-data.ts, web/app/api/v1/weather/route.ts
ปิด SAMPLE_MODE (weather-data.ts:20) แล้วอ่าน batch ที่อนุมัติแล้วจาก D1
  ต้องรักษา invariant เดิม: tmax≥tmin, byDay=7, ช่วงค่า, deterministic, 400 INVALID_QUERY
  ถ้าไม่มี batch ที่พร้อมจริง → ปิด sample และตอบ empty พร้อมคำเตือน ไม่ใช่ตัวเลขจำลอง

── LANE D: เตือนภัยน้ำท่วม-ภัยแล้ง ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/early-warning-data.ts, web/app/api/v1/early-warning/route.ts
ใช้ RID reservoirs (จริง) + ผล NWP จากรอบ 2 (ถ้ามี run) แทนค่าจำลอง 461 อ่าง/28 จังหวัด/14 วัน
  ต้องแสดงว่าเกณฑ์เป็นเกณฑ์ภายในของระบบ ไม่ใช่ประกาศเตือนภัยราชการ

── LANE E: การค้าส่งออก-นำเข้า ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/trade-data.ts, web/app/api/v1/trade/route.ts
แหล่งจริงที่มี credential: data.go.th (มี DATA_GO_TH_API_KEY แล้ว), OAE, nabc, DOAE
  ถ้าไม่มีแหล่งที่พร้อมจริง → empty state + รายงานว่าต้องเปิดสิทธิ์/เชื่อม API อะไร

── LANE F: พืช/ดิน (DOAE) ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/crops-soil-data.ts, web/app/api/v1/crops/route.ts, web/app/api/v1/soil/route.ts
ใช้ข้อมูลจริงที่มีอยู่แล้ว: DOAE/OpenD datastore (OPEND_API_KEY), ตารางคำแนะนำปุ๋ย DOAE/PPSF,
  ชุดดิน LDD — ค่าที่ยังไม่มีแหล่งจริงคงเป็น reference ที่มี URL อ้างอิงชัดเจน ห้ามแต่งตัวเลข

── LANE G1: แดชบอร์ดเศรษฐกิจ/สังคม ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/{agri-tourism,carbon,finance,labor,machinery}-data.ts
  + web/app/api/v1/{agri-tourism,carbon,finance,labor,machinery}/route.ts
สำหรับแต่ละตัว: หาแหล่งจริงที่มี credential (DOAE, OAE, NSO, MOL, RID, DWR) ถ้ามี → ใช้จริง
  ถ้าไม่มี → ลดความเท็จจริงของตัวเลขให้เหลือระดับที่แหล่งจริงเผยแพร่จริง (เช่น เต็มจำนวน/ทศนิยม 1 ตำแหน่ง
  ตามที่ต้นทางประกาศ) + ป้ายกำกับชัดว่าเป็นค่าอ้างอิง ไม่ใช่ค่าสถิติจริง และเก็บ attribution

── LANE G2: แดชบอร์ดอาหาร/การตลาด/สัตว์ ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/{food-safety,gi-products,cooperatives,logistics,land-reform}-data.ts
  + route ของแต่ละตัว
แนวทางเดียวกับ G1 และเพิ่ม: ห้ามใช้เลขทะเบียน/เลขใบรับรองปลอม (เช่น GI-xxx ต้องระบุชัดว่าเป็น placeholder)

── LANE G3: แดชบอร์ดความเสี่ยง/ภูมิอากาศ/IoT ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/lib/hub/{climate-history,crop-evidence,livestock,smart-farming}-data.ts
  + route ของแต่ละตัว
แนวทางเดียวกับ G1 (CHIRPS observations จากรอบ 1 ใช้ได้กับ climate-history และ crop-evidence)

── LANE H: QA ──
ไฟล์ที่แก้ได้ (เฉพาะ): docs/real-data-qa-round3.md
ต้องรัน: npm --prefix web run typecheck · npm --prefix web run test · npm --prefix web run build:vinext ·
  ยิงทุก route ที่เปลี่ยนแล้วเทียบก่อน/หลัง (shape เดิม) · ยืนยันว่าไม่มี route ที่ตอบตัวเลขจำลอง
  พร้อม sample:true โดยไม่มีคำเตือน · ตรวจ crawl ทุกหน้า 200
```

---

## รอบ 4 — Integrate, Deploy, Document

> ส่งข้อความนี้ทั้งก้อนให้ Orchestrator ตัวที่ 4

```
คุณคือ Orchestrator ของโปรแกรม Real Data รอบ 4 (integrate + deploy + docs) ใน repo T:\coding+\BI AGRI THAILAND
"แผนหลัก" = docs/assignments/2026-10-26-real-data-initiative.md

ขั้นตอนบังคับ:
1. อ่าน AGENTS.md, HANDOFF.md, "แผนหลัก", git status / git log
2. spawn subagent 4 ตัวตาม lane ด้านล่าง
3. **ห้าม deploy จนกว่าจะได้รับคำสั่งจากเจ้าของงาน** — Lane B เตรียมคำสั่งและรายงานรออนุมัติ
4. ห้าม commit / push จนกว่าจะได้รับคำสั่ง
5. ห้ามพิมพ์ credential — ใช้ `wrangler secret put` แบบ interactive/stdin เท่านั้น

── LANE A: Web Integration ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/components/shell.tsx, web/components/page-registry.ts,
  web/scripts/prepare-data.mjs, web/lib/hub/api-catalog.ts
งาน: ผูก /nwp และหน้าที่เพิ่มในรอบ 2–3 เข้า sidebar/directory/home/search/bottom nav,
  อัปเดต api-catalog ให้ครบ, ตรวจว่า prepare-data.mjs copy ไฟล์ threshold ถูกต้อง
  ตรวจ crawl ทุก route ว่า 200 และมี H1 และมีลิงก์ใน nav

── LANE B: Deploy Preparation (ห้าม deploy เอง) ──
ไฟล์ที่แก้ได้ (เฉพาะ): web/wrangler.toml (หรือ .jsonc), docs/deploy-checklist.md
งาน:
- ตรวจว่า Worker มี D1 binding (database_id ของ TADIH D1) และ env ที่จำเป็น
- เตรียมรายการ secret ที่ต้องตั้งบน Workers (เช่น CF_D1_TOKEN ถ้าจำเป็น) พร้อมคำสั่ง
  `npx wrangler secret put <NAME>` และคำอธิบายว่าเป็นแบบ stdin ไม่ต้องวางค่าในไฟล์
- เขียน checklist ก่อน/หลัง deploy: build, deploy, curl ตรวจ 6 endpoint หลัก, ตรวจว่า page ที่เพิ่งเปลี่ยน
  แสดงตัวเลขจริง (ไม่ใช่ sample), ตรวจ payload size, ตรวจ console error
- รายงานคำสั่งที่เสนอ รอเจ้าของงานสั่ง deploy

── LANE C: Documentation ──
ไฟล์ที่แก้ได้ (เฉพาะ): HANDOFF.md, docs/progress.md
งาน: สรุปสิ่งที่ทำในรอบ 1–4 พร้อมหลักฐานจริง (คำสั่ง + ผลลัพธ์ + จำนวนแถวใน D1),
  ระบุสิ่งที่ยังเป็น mock และเหตุผล, ข้อจำกัดด้านสิทธิ์/หน่วย, งานค้าง, คำสั่งรับต่อ
  ห้ามเขียนว่า "เสร็จสมบูรณ์" ถ้าไม่มีหลักฐานรันจริง

── LANE D: Final QA ──
ไฟล์ที่แก้ได้ (เฉพาะ): docs/real-data-final-qa.md
ต้องรัน: python -m unittest discover -s tests · npm --prefix web run typecheck/test/build:vinext ·
  D1 read-only นับ observations + sync_runs · ตรวจว่าไม่มี route ไหนประกาศข้อมูลจริงแต่เป็น generator ·
  ตรวจ 34+ routes ผ่าน · ตรวจ 390/1440 ไม่มี overflow · ตรวจ git status ไม่มี secret/raw data
  สรุปตาราง pass/fail และ Definition of Done ข้อ 7 จาก "แผนหลัก" ทีละข้อ
```
