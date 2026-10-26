# ใบสั่งงาน: โปรแกรม Real Data — ทำให้ข้อมูลเป็น "ข้อมูลที่ดึงได้จริง"

วันที่: 26 ตุลาคม 2569 (2026-10-26)
สถานะ: พร้อมแตก lane และสั่ง subagent
อ่านคู่กับ: [AGENTS.md](../../AGENTS.md), [HANDOFF.md](../../HANDOFF.md), [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md), [docs/progress.md](../progress.md), [work order TMD HPC NWP เดิม](2026-10-26-tmd-hpc-nwp-integration.md)
คำสั่ง copy-paste ของแต่ละรอบอยู่ที่ [2026-10-26-real-data-prompts.md](2026-10-26-real-data-prompts.md)

---

## 0. ผลตรวจสถานะจริง (26 ต.ค. 2569) — ใช้เป็น baseline

| จุดตรวจ | ผลที่วัดได้ |
|---|---|
| D1 (read-only) | 12 sources · 1,237 datasets · 3,777 resources · **0 observations** |
| `config/resource_licenses.json` | 82 รายการ → **81 `pending` / 1 `approved_public`** (CHIRPS) |
| Web API 33 routes | ~9 อ่าน D1/metadata จริง · **19 routes เป็น mock** (PRNG, `sample: true`) · 4 metadata-only · 1 ปิด 503 |
| `scripts/sync_hub_numeric.py` | ตัวเขียน `observations` เดียวในระบบ — **ยังไม่เคยรัน `--write`**; ทุก run ใน D1 เป็น `kind='metadata'` |
| CI | `ci.yml`, `sync-hub-catalog.yml` (cron), `discover-sources.yml` — **ไม่มี workflow ไหน sync ตัวเลข** |
| `/satellite` | ประกาศ `sample: false` + banner "ข้อมูลจริง GISTDA/Sentinel-1" แต่ค่าทั้งหมดมาจาก FNV-1a generator — ข้อมูลจริงอยู่ใน `web/data/gistda_flood_7days.json` แล้ว **แต่ไม่มี route ไหนอ่าน** |
| TMD HPC NWP | ทำไปแล้ว ~60%: `src/tadih/tmd_hpc_nwp.py` (1,032 บรรทัด) + `tests/test_tmd_hpc_nwp.py` (678) + `web/lib/hub/nwp-types.ts` + `nwp-risk.ts` + `nwp-heatmap.tsx` + `nwp-dashboard.module.css` — ขาด normalize, migration, publish, 3 API, page, dashboard component |
| Credentials | `CF_D1_TOKEN` มีใน `.env` และ `web/.env.local` (ยืนยันแล้ว) · `GISTDA_API_KEY`, `TMD_NWP_ACCESS_TOKEN`, `OPEND_API_KEY`, `METEOSTAT_API_KEY`, `DWR_API_KEY` มีครบ |

**ข้อสรุป:** metadata จริงและครบแล้ว แต่ **คลังข้อมูลกลางไม่มีตัวเลขจริงแม้แต่แถวเดียว** ผลิตภัณฑ์จึงยังดึง "ข้อมูลจริง" ไม่ได้แม้ connector จะยิง API สำเร็จ — เพราะไม่มี writer ที่ลง D1 และไม่มี license gate ที่เปิด

---

## 1. เป้าหมายของโปรแกรม

1. D1 มี `observations` จริง จากแหล่งที่เรามี credential + สิทธิ์แล้ว (RID, TMD, Open-Meteo, GISTDA, CHIRPS)
2. ไม่มีหน้า/ตัวเลขที่ "ประกาศว่าจริง" แต่ยังเป็นตัวอย่าง
3. มี CI ที่ sync ตัวเลขอัตโนมัติ → ข้อมูลไม่ค้าง
4. ปิดงาน TMD HPC NWP ให้ได้ผลิตภัณฑ์ข้อมูลจริง (ฝน/อุณหภูมิ/ชื้น/ลม 3 กม. นำหน้า 72 ชม.)
5. เปลี่ยนแดชบอร์ด mock → อ่านจาก D1/live API โดยคง response shape เดิม (UI ไม่ต้องรื้อ)

---

## 2. กฎเหล็กทั้งโปรแกรม (ทุก lane ต้องยึด)

1. **ห้าม commit / push / deploy** เว้นแต่เจ้าของงานสั่งเป็นลายลักษณ์อักษร
2. **ห้ามแตะ `.env`, `.env.local`, `data/local/**`, `exports/private/**`** และห้ามพิมพ์ค่า credential ใด ๆ (ห้าม `print(env[...]`) ใช้ `git check-ignore` ยืนยันว่าไฟล์ secret ถูก ignore
3. **กฎคุณภาพข้อมูล (AGENTS.md ข้อ 4):** missing คง `null` (ห้ามแทน 0) · เก็บ `source grain` และ `version` · ข้อมูลประเทศ/สถานี/กริด **ไม่เท่ากับจังหวัด** · ห้ามรวมราคาต่างสินค้า/เกรด/หน่วย/ตลาด · ห้ามบวก subtotal ซ้ำ · รหัส 77 จังหวัดคือทะเบียนรหัส **ไม่ใช่ coverage**
4. **Forecast ≠ Observation:** `src/tadih/quality.py` บังคับ `data_kind ∈ {observed, official, estimated, unknown}` และมีข้อความว่า "forecast/scenario must be stored separately from observations" — **ห้ามเขียนค่าพยากรณ์ (TMD NWP, ECMWF forecast) ลงตาราง `observations`** ให้ไปที่ตาราง forecast/NWP แทน
5. **ห้ามเดาหน่วย** ถ้าไม่มีเอกสารทางการยืนยัน → `unit = NULL` + `unit_status = pending_official_confirmation`
6. **License gate:** เขียนตัวเลขลง D1 ได้ก็ต่อเมื่อ resource ใน `config/resource_licenses.json` มี `license_status = approved_public` **และ** `project_publication_approved = true` และ `unresolved` ว่าง — writer ต้องเช็คเองแบบ fail-closed (ห้ามเชื่อ flag จาก CLI)
7. **Idempotency:** sync ซ้ำวันเดียวกันต้องไม่สร้างข้อมูลซ้ำ (ใช้ `run_id`/row_key เดิมหรือ `skipped_identical`)
8. **File ownership:** แต่ละ lane แก้เฉพาะไฟล์ที่ระบุ ถ้าจำเป็นต้องแตะไฟล์นอกขอบเขต → **หยุดและรายงาน** ห้ามแก้เอง
9. **ห้ามใช้ `Math.random()` / `Date.now()`** ในเส้นทางคำนวณค่า (คงกำหนดเดิมของโปรเจกต์)
10. **ห้ามเพิ่ม dependency** ใหม่ (ไม่มี leaflet/maplibre, ไม่มีแพ็กเกจ map)

---

## 3. Canonical Observation Contract (ทุก lane ใช้ร่วมกัน)

### 3.1 แถวข้อมูล (ต้องผ่าน `validate_observation` ใน `src/tadih/quality.py`)

อ้างอิง schema: `data_contracts/observation.schema.json`

| field | กฎ |
|---|---|
| `observation_id` | unique ต่อ (resource, run) |
| `source_id` | ต้องมีใน `config/sources.json` (`rid`, `tmd`, `open_meteo`, `gistda`, `chirps` มีแล้ว) |
| `spatial_support` | `province` \| `station` \| `grid_point` \| `grid_cell` \| `national` \| `reservoir` |
| `area_code` | รหัสจังหวัด 2 หลัก ถ้าเป็นระดับจังหวัด; ระดับอื่นเป็น `null` |
| `observed_at` | ISO 8601 มี timezone (UTC) |
| `retrieved_at` | ISO 8601 — ต้อง ≥ `observed_at` |
| `release_at` | ISO 8601 หรือ `null` |
| `value` | เลขจำกัด/ทศนิยม หรือ `null` (ห้าม NaN/Infinity) |
| `unit` | string หรือ `null` (ยังไม่ยืนยันหน่วย → `null`) |
| `data_kind` | `observed` \| `official` \| `estimated` \| `unknown` (**ห้ามใช้กับ forecast**) |
| `quality_flag` | `good` \| `missing` (ถ้า `value` เป็น null ต้องเป็น `missing` และกลับกัน) |
| `revision_id` | ETag/Last-Modified/เอกสารอ้างอิงของ resource |
| `license_status` | `approved_public` \| `restricted` \| `pending` |
| `source_url` | URL จริงที่ดึงมา |

### 3.2 Interface ของ writer (R1-B เป็นเจ้าของ `src/tadih/observations.py`)

```python
def publish_observations(
    client,                      # D1Client (src/tadih/hub_catalog_sync.py)
    *,
    resource: dict,              # แถวจาก config/resource_licenses.json
    rows: list[dict],            # canonical observation dicts
    adapter_version: str,
    coverage: dict,              # เช่น {"mode":"daily_full","count":461}
    completeness: str,           # "partial" | "complete"
    unit: str | None,
    retrieved_at: str,           # ISO 8601 UTC
    run_id: str | None = None,   # เว้นว่าง = สร้างใหม่
) -> dict:
    """คืน {"run_id","status","records_read","records_written","coverage",...}"""
```

พฤติกรรมที่ต้องมี (fail-closed):
- ตรวจ `resource.license_status == "approved_public"` และ `project_publication_approved is True` และ `unresolved` ว่าง → ไม่ผ่านให้ raise error code `RESOURCE_NOT_APPROVED` **ก่อน** เขียนอะไรลง D1
- เขียน `sync_runs` (kind=`numeric`), `locations` (ถ้ามี), `observations` ด้วย prepared statement + parameter binding
- ปิด run ด้วย `status='partial'|'succeeded'`, `records_read/written`, `payload_sha256`
- สลับ `resources.active_run_id` **เฉพาะเมื่อ** run สำเร็จ และ resource ยัง approved (คงสถานะเดิมถ้าเคย revoke)
- ถ้าล้มเหลว → ทำเครื่องหมาย run เป็น `failed` และ **ไม่ลบข้อมูลเดิม**

### 3.3 License registry contract (R1-A เป็นเจ้าของ `config/resource_licenses.json`)

แต่ละ resource ที่จะเปิดเผยตัวเลขต้องมี:
```json
{
  "resource_key": "<source>_<dataset>_<grain>",
  "source_id": "rid",
  "resource_id": "<id หรือ URL ที่ใช้อ้างอิง>",
  "dataset_id": "<id>",
  "name": "...",
  "resource_url": "...",
  "reviewed_at": "2026-10-26",
  "license_status": "approved_public",
  "review_outcome": "<ข้อความสรุปหลักฐาน>",
  "declared_license": {"license_id": "...", "license_url": "...", "version": "...", "scope": "..."},
  "access_evidence": {"url": "...", "checked_at": "2026-10-26", "etag": "...", "note": "..."},
  "rights_facts": ["..."],
  "project_publication_approved": true,
  "commercial_use_confirmed": null,
  "attribution_text": "...",
  "unresolved": [],
  "next_action": null,
  "evidence": [{"url": "...", "checked_at": "2026-10-26", "finding": "..."}]
}
```

**เกณฑ์การอนุมัติ (ตาม AGENTS.md ข้อ 3 ที่แก้เมื่อ 26 ต.ค. 2569):** เจ้าของระบบได้ลงทะเบียนและได้รับสิทธิ์ API Key/Credentials อย่างถูกต้องแล้ว (GISTDA, TMD NWP, DWR, RID, DGA OpenD, Open-Meteo, Meteostat, CDSE Sentinel, DOAE, CPD ฯลฯ) จึงอนุญาตให้ดึง ประมวลผล บันทึกลง D1 และเผยแพร่ตัวเลขจริงได้
**แต่:** ทุกรายการที่เปิดต้องมี `evidence` ที่ตรวจสอบย้อนได้ (URL + วันที่ + สิ่งที่พบ) และ `attribution_text` พร้อมแสดงบนหน้า/API
**ห้าม** เปิด `approved_public` ให้ทรัพยากรที่ยังไม่มีสิทธิ์ชัดเจน (เช่น ข้อมูลบุคคล/สัญญาอนุญาตเฉพาะ) — ให้คง `pending` และรายงานเหตุผล

---

## 4. แผนที่ File Ownership (ทั้ง 4 รอบ) — ห้ามแก้ข้าม lane

| ไฟล์ | เจ้าของ |
|---|---|
| `config/resource_licenses.json`, `config/sources.json` | **R1-A** |
| `src/tadih/observations.py` (ใหม่), `src/tadih/hub_numeric_sync.py`, `src/tadih/cli.py` | **R1-B** |
| `web/lib/hub/d1-numeric-repository.ts`, `web/lib/hub/d1.ts` | **R1-B** |
| `db/cloudflare/*.sql` | **R1-B** (lane อื่นส่ง DDL ที่ต้องการมาในรายงาน) |
| `src/tadih/ingest_rid_d1.py`, `scripts/sync_rid_to_d1.py`, `tests/test_ingest_rid_d1.py` | **R1-C** |
| `src/tadih/ingest_tmd_d1.py`, `scripts/sync_tmd_to_d1.py`, `tests/test_ingest_tmd_d1.py` | **R1-D** |
| `src/tadih/ingest_open_meteo_d1.py`, `scripts/sync_open_meteo_to_d1.py`, `tests/test_ingest_open_meteo_d1.py` | **R1-E** |
| `src/tadih/ingest_gistda_d1.py`, `scripts/sync_gistda_to_d1.py`, `tests/test_ingest_gistda_d1.py` | **R1-F** |
| `web/lib/hub/satellite-data.ts`, `web/app/api/v1/satellite/route.ts`, `web/components/satellite-dashboard.tsx` | **R1-F** |
| `.github/workflows/sync-hub-numeric.yml` (ใหม่), `.github/workflows/sync-hub-catalog.yml` | **R1-G** |
| `src/tadih/tmd_hpc_normalize.py`, `config/nwp_thresholds.json`, `tests/test_tmd_hpc_normalize.py` | **R2-B** |
| `db/cloudflare/0002_nwp.sql` → ถ้า `db/cloudflare/0002_*` ถูกสร้างในรอบ 1 ให้ใช้เลขถัดไป, `scripts/sync_tmd_hpc_nwp.py` | **R2-C** |
| `web/lib/hub/nwp-data.ts`, `web/app/api/v1/nwp/**`, `web/tests/nwp-data.test.ts` | **R2-D** |
| `web/app/nwp/page.tsx`, `web/components/nwp-dashboard.tsx` | **R2-E** |
| `web/components/page-registry.ts`, `web/scripts/prepare-data.mjs`, `web/lib/hub/api-catalog.ts` | **R2-F** |
| `web/lib/hub/price-data.ts`, `web/app/api/v1/prices/daily/route.ts` | **R3-A** |
| `web/lib/hub/water-data.ts`, `web/app/api/v1/water/reservoirs/route.ts` | **R3-B** |
| `web/lib/hub/weather-data.ts`, `web/app/api/v1/weather/route.ts` | **R3-C** |
| `web/lib/hub/early-warning-data.ts`, `web/app/api/v1/early-warning/route.ts` | **R3-D** |
| `web/lib/hub/trade-data.ts`, `web/app/api/v1/trade/route.ts` | **R3-E** |
| `web/lib/hub/crops-soil-data.ts`, `web/app/api/v1/crops/route.ts`, `web/app/api/v1/soil/route.ts` | **R3-F** |
| `web/lib/hub/{agri-tourism,carbon,cooperatives,crop-evidence,finance,food-safety,gi,labor,land-reform,livestock,logistics,machinery,climate-history,smart-farming}-data.ts` + route ของแต่ละตัว | **R3-G1..G3** (แบ่งตามรายชื่อในคำสั่งรอบ 3) |
| `web/components/shell.tsx`, `web/components/page-registry.ts`, `web/scripts/deploy_preview.mjs` | **R4-A** |
| `web/wrangler.toml` / `web/wrangler.jsonc` (secrets + D1 binding) | **R4-B** |
| `HANDOFF.md`, `docs/progress.md` | **R4-C** |

> **ข้อตกลงรอบ:** รอบ 1 → 2 → 3 → 4 **ทำตามลำดับ** รอบถัดไปต่อยอดจากของรอบก่อน (ไม่ revert สิ่งที่ทำไว้) ภายในรอบเดียวกัน lane ทำขนานกันได้แต่ห้ามแตะไฟล์ของกัน
> **`src/tadih/cli.py`:** รอบ 1 เป็นเจ้าของเดียว — รอบ 2 ห้ามแตะ ให้ใช้ `scripts/sync_tmd_hpc_nwp.py` เป็น entry point แทน

---

## 5. Gates และการหยุด

| Gate | เงื่อนไข | ต้องทำ |
|---|---|---|
| G1 D1 token | ไม่มี `CF_D1_TOKEN`/`CF_API_TOKEN` | dry-run เท่านั้น, รายงาน `D1_NOT_CONFIGURED`, **ห้าม mock** |
| G2 license | resource ยัง `pending` | หยุด write, รายงาน, ให้ R1-A ปลดล็อก |
| G3 หน่วย | ไม่มีเอกสารยืนยัน | `unit = null` + `unit_status = pending_official_confirmation` |
| G4 schema | ต้องเพิ่มคอลัมน์/ตาราง | ส่ง DDL ในรายงาน ให้ R1-B เป็นคนใส่ migration |
| G5 ไฟล์ร่วม | ต้องแก้ไฟล์นอกขอบเขต | หยุด + รายงาน ห้ามแก้เอง |
| G6 secrets | `.env`/token/raw | `git check-ignore` + `git status` ก่อนจบทุก lane |
| G7 production FS | `data/local` ไม่อยู่ใน build | production อ่าน D1 เท่านั้น |

---

## 6. คำสั่งตรวจมาตรฐาน (ทุก lane ต้องรันและแนบผลจริง)

```bash
# Python (Windows)
PYTHONPATH=src .venv/Scripts/python.exe -m unittest discover -s tests
PYTHONPATH=src .venv/Scripts/python.exe -m unittest tests.test_<lane> -v

# Web
npm --prefix web run typecheck
npm --prefix web run test
npm --prefix web run build:vinext

# D1 read-only ตรวจจำนวนแถว (ห้ามพิมพ์ token)
PYTHONPATH=src .venv/Scripts/python.exe -c "from tadih.hub_catalog_sync import connect_d1_client; c=connect_d1_client(); \
print(c.execute('SELECT (SELECT COUNT(*) FROM observations) o,(SELECT COUNT(*) FROM sync_runs WHERE kind=\'numeric\') n')[0] if False else c.execute('SELECT COUNT(*) FROM observations')[0])"
```

---

## 7. Definition of Done ของทั้งโปรแกรม

- [ ] D1 มี `observations` จริง ≥ 1 แถว พร้อม `sync_runs.kind='numeric'` ที่ `status='partial'|'succeeded'`
- [ ] ไม่มีหน้า/API ไหนประกาศ `sample:false` แต่ค่ามาจาก generator
- [ ] ทุกตัวเลขที่เผยแพร่มี resource ใน registry ที่ `approved_public` + `project_publication_approved=true` + `evidence`
- [ ] CI มี workflow ที่ sync ตัวเลข (cron) และรันจริงแล้วอย่างน้อย 1 ครั้ง
- [ ] `/nwp` เปิดได้ มี H1 และแสดงค่าจาก D1 จริง
- [ ] 19 mock routes เหลือ < 5 ที่ยังเป็น mock และที่เหลือมีเหตุผล + ป้ายกำกับชัด
- [ ] `npm --prefix web run typecheck` = 0 error · `npm --prefix web run test` ผ่าน · `build:vinext` ผ่าน
- [ ] `git status` ไม่มี `.env`/token/`data/local` ถูก track
- [ ] HANDOFF.md + docs/progress.md มีหลักฐานจริงและงานค้าง
