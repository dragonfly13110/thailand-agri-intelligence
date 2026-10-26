# ใบสั่งงาน: นำ TMD HPC NWP Grid เข้าระบบ TADIH

วันที่: 26 ตุลาคม 2569  
สถานะ: พร้อมให้ Orchestrator แตก lane และสั่ง subagent  
อ่านคู่กับ: [AGENTS.md](../../AGENTS.md), [HANDOFF.md](../../HANDOFF.md), [SYSTEM_DESIGN.md](../../SYSTEM_DESIGN.md), [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md), [docs/progress.md](../progress.md)
> **อัปเดต 26 ต.ค. 2569 (รอบที่ 2 ของโปรแกรม Real Data):** โปรแกรมนี้ทำงานเป็น **รอบ 2** ของ [2026-10-26-real-data-initiative.md](2026-10-26-real-data-initiative.md) — ใช้แผนหลักนั้นเป็นกฎร่วม (license gate, observation contract, file ownership) และคำสั่ง Lane A–H ล่างนี้ถูกย่อยให้ทำงานต่อจากของที่เสร็จแล้ว
>
> **สถานะงานที่ทำเสร็จแล้ว (26 ต.ค. 2569):** `src/tadih/tmd_hpc_nwp.py` (1,032 บรรทัด) + `tests/test_tmd_hpc_nwp.py` (678) + `web/lib/hub/nwp-types.ts` + `web/lib/hub/nwp-risk.ts` + `web/components/nwp-heatmap.tsx` + `web/components/nwp-dashboard.module.css` — **ห้ามเขียนทับ**
> **งานที่เหลือ:** Lane B (normalize), C (D1 publish), D (web API), E (UI), F (integration), G (QA), H (units/license research)
>
> **ข้อตกลง ownership ข้อ 2:** `src/tadih/cli.py` เป็นของ **รอบ 1** (Lane B ของแผนหลัก) — Lane C ของรอบนี้ **ห้ามแตะ** ให้ใช้ `scripts/sync_tmd_hpc_nwp.py` เป็น entry point แทน
> **ข้อตกลง ownership ข้อ 3:** `db/cloudflare/*.sql` เป็นของ Lane B ของรอบ 1 — Lane C ของรอบนี้สร้าง migration ได้เฉพาะ `0002_nwp.sql`; ถ้า `db/cloudflare/0002_observation_extensions.sql` มีอยู่แล้วให้เปลี่ยนเป็น `0003_nwp.sql` (ตรวจด้วย `ls db/cloudflare/` ก่อนสร้าง)

---

## 0. เป้าหมาย

เพิ่มผลิตภัณฑ์พยากรณ์เชิงกริดจาก **TMD HPC NWP Data Download Center** เข้า TADIH แบบใช้งานจริง:

1. ดึงข้อมูลจริงจาก `https://hpc.tmd.go.th` (HTTPS เท่านั้น) เฉพาะ domain `d02` (Thailand 3km)
2. แปลง CSV กริดกว้าง (`lat,lon,time...`) เป็นข้อมูล long + snapshot ที่ลดขนาดแล้ว
3. เก็บ snapshot ลง D1 และให้ API อ่านได้
4. เพิ่มหน้า `/nwp` ที่ใช้งานได้จริง: แผนที่กริดความร้อน (SVG), ตารางจังหวัด, คำแนะนำเกษตร, สถานะข้อมูล
5. ผูกหน้าเข้าเมนู/ดัชนี/หน้าแรกอัตโนมัติผ่าน `page-registry.ts`
6. ทุกตัวเลขต้องบอกชัดว่าเป็น **ค่าพยากรณ์จากแบบจำลอง** ไม่ใช่ค่าตรวจวัด และหน่วย/นิยามตัวแปรยังรอ confirmation
7. ห้าม commit/deploy/แก้ `.env` ในงานนี้ เว้นแต่เจ้าของงานสั่งแยก

### ผลลัพธ์ที่ผู้ใช้จะได้รับ

- เห็นฝนล่วงหน้า 72 ชั่วโมงเป็นแผนที่กริด 3 กม. (แสดงผลที่ 0.15°)
- เห็นจังหวัดที่เสี่ยงฝนหนัก/ร้อนจัด/ชื้นสูง/ลมแรง พร้อมวิธีอ่านค่าที่ถูกต้อง
- ใช้ประกอบการวางแผนเพาะปลูก/เก็บเกี่ยว/พ่นยา/เลี้ยงสัตว์ ไม่ใช่ประกาศเตือนภัยราชการ
- ตัวเลขจริงจาก TMD ไหลเข้า D1 และแสดงบน API/หน้าเว็บ ไม่ใช่ mock

---

## 1. ข้อเท็จจริงที่ตรวจแล้ว (26 ต.ค. 2569)

| รายการ | ผล |
|---|---|
| หน้าเว็บ | `https://hpc.tmd.go.th/download` → 200 (HTTP ธรรมดาถูก reset; ต้อง HTTPS) |
| รายการไฟล์ | `GET /api/download-files?init_time=2026102600` → 200, `count=32` |
| องค์ประกอบ | CSV 26 + NetCDF-4 6; d01 Indochina 9km / d02 Thailand 3km |
| รอบข้อมูล | init `2026-10-26T00:00:00Z`, พยากรณ์ถึง `2026-10-28T23:00:00Z` = 72 ชั่วโมง |
| CSV schema | `lat,lon,2026-10-26_00:00Z,...,2026-10-28_23:00Z` = 74 คอลัมน์ |
| ขนาดตัวอย่าง | `p1h.d02` 62,093,049 B; `t2m.d02` 100,245,492 B; `prec1hr.d02.nc` 58,333,668 B |
| ขนาดทั้งรอบ | ~1,330 MB (32 ไฟล์) |
| auth | ไม่พบ API key สำหรับไฟล์ static; ห้ามสรุปว่าได้รับสิทธิ์เผยแพร่ |
| ข้อจำกัด | หน่วย/นิยามตัวแปรและ license ยังไม่ยืนยันจากเอกสารทางการ |
| ระบบเรา | Cloudflare Worker + D1; `data/local/**` ไม่อยู่ใน build; ยังไม่มีไลบรารีแผนที่ |

### ตัวแปรที่ใช้ใน v1

| ตัวแปร | ความหมายตามชื่อไฟล์ | ประโยชน์ |
|---|---|---|
| `p1h` | ฝนราย 1 ชั่วโมง | เตือนฝนกระหน่ำ/น้ำท่วมฉับพลัน |
| `p24h` | ฝนสะสม 24 ชั่วโมง | วางแผนเพาะปลูก/เก็บเกี่ยว/ระบายน้ำ |
| `t2m` | อุณหภูมิ 2 เมตร | ความเครียดความร้อน พืช/ปศุสัตว์ |
| `rhum` | ความชื้นสัมพัทธ์ | ความเสี่ยงโรคเชื้อรา |
| `ws10m` | ความเร็วลม 10 เมตร | พ่นยา/ต้นข้าวล้ม/ไฟป่า |

> `dws` (รังสีดวงอาทิตย์) เป็น v2 เพราะต้องยืนยันหน่วยและเพิ่มภาระดาวน์โหลด

---

## 2. Product Decision

### 2.1 หน้าใหม่

- Route: `/nwp`
- Page id: `nwp`
- กลุ่มเมนู: `weather`
- ชื่อ: **พยากรณ์กริด NWP**
- คำอธิบาย: "พยากรณ์ฝน อุณหภูมิ ความชื้น และลมความละเอียด 3 กม. ล่วงหน้า 72 ชั่วโมง"

### 2.2 องค์ประกอบหน้า

1. **Governance banner** — ค่าพยากรณ์แบบจำลอง, หน่วย/นิยามรอ confirmation, กริด ≠ จังหวัด, ไม่ใช่ประกาศราชการ
2. **Run bar** — รอบพยากรณ์ (init time), เวลาดึงข้อมูล, อายุข้อมูล, สถานะ D1
3. **Variable tabs** — ฝน 24 ชม., ฝน 1 ชม., อุณหภูมิสูงสุด, ความชื้น, ลม
4. **Lead-time control** — +0, +6, +12, +24, +48, +72 ชม. (แสดงเวลา ICT และ UTC)
5. **Grid heatmap (SVG)** — ค่าเฉลี่ยต่อเซลล์ 0.15°, legend, tooltip lat/lon/value, ป้ายแกน lat/lon; ห้ามใส่ขอบเขตการปกครองปลอม
6. **Province watchlist** — 77 จังหวัด, ค่าสูงสุดในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด, ระยะถึงเซลล์ใกล้สุด, ระดับความเสี่ยง, ค้นหา/กรองภาค
7. **Agricultural advisories** — สรุปจังหวัดเสี่ยงและคำแนะนำจากเกณฑ์ระบบ
8. **Data quality panel** — จำนวนไฟล์, checksum, จำนวนเซลล์, วิธีลดขนาด, สถานะ license/units
9. **Cross-links** — `/weather`, `/early-warning`, `/satellite`, `/about`

### 2.3 หลักการออกแบบ UI

- ใช้ design tokens และ CSS Modules เดิม; ห้ามเพิ่ม dependency แผนที่
- Heatmap วาดด้วย SVG (หรือ canvas) จาก JSON ที่ API คืน
- Mobile 390px: controls เรียงแนวตั้ง, ตารางเลื่อนแนวนอน, heatmap รักษา aspect ratio
- Keyboard: tabs/select/slider ใช้งานได้, tooltip มีข้อความสำหรับ screen reader
- สี: ใช้ scale เดียวทั้งระบบ; อย่าใช้สีอย่างเดียวสื่อความหมาย (มีตัวเลข/ป้ายกำกับ)
- Empty state: "ยังไม่มีรอบพยากรณ์ที่พร้อมใช้งาน" + วิธีแก้
- Error state: แยก D1 ไม่พร้อม / ไม่พบ run / publication ปิด

### 2.4 Governance

- `licenseStatus: pending` และ `unitStatus: pending_official_confirmation` ในทุก payload
- ห้ามเรียกค่าพยากรณ์ว่า "ค่าจริง", "ค่าตรวจวัด", หรือ "ประกาศเตือนภัย"
- `publicationMode`:
  - `numeric_preview` (ค่าเริ่มต้นตาม AGENTS.md ข้อ 3): แสดงตัวเลขจริงพร้อมคำเตือน
  - `metadata_only`: ปิดตัวเลขทุก endpoint (kill switch)
- ห้ามแก้ `config/resource_licenses.json` ในงานนี้; ถ้าต้องเปลี่ยนให้แยกงาน license review
- ห้าม commit `.env`, `.env.local`, token หรือไฟล์ raw จาก `data/local/`

---

## 3. Data Contract

### 3.1 Manifest

`data/local/tmd_nwp_hpc/manifests/<run_id>.json` (gitignored)

```json
{
  "source_id": "tmd_hpc_nwp",
  "source_agency": "กรมอุตุนิยมวิทยา (TMD)",
  "contract_version": 1,
  "run_id": "tmd_hpc_d02_2026102600",
  "domain": "d02",
  "domain_label": "Thailand 3km",
  "init_at": "2026-10-26T00:00:00Z",
  "retrieved_at": "2026-10-26T08:30:00Z",
  "base_url": "https://hpc.tmd.go.th",
  "license_status": "pending",
  "unit_status": "pending_official_confirmation",
  "publication_mode": "numeric_preview",
  "variables": ["p1h", "p24h", "t2m", "rhum", "ws10m"],
  "lead_hours": [0, 6, 12, 24, 48, 72],
  "grid": {
    "bbox": [96.0, 5.0, 106.0, 21.0],
    "source_cell_deg": 0.0277,
    "output_cell_deg": 0.15,
    "nx": 67,
    "ny": 107
  },
  "files": [
    {
      "variable": "p24h",
      "filename": "p24h.d02.2026102600.csv",
      "url": "/static/csv/2026102600/p24h.d02.2026102600.csv",
      "bytes": 62093049,
      "sha256": "...",
      "format": "CSV",
      "status": "ok"
    }
  ],
  "status": "ready"
}
```

### 3.2 Normalized long table (DuckDB staging)

`data/local/tmd_nwp_hpc/normalized/<run_id>.duckdb`

```sql
CREATE TABLE nwp_grid_long (
  run_id VARCHAR,
  domain VARCHAR,
  variable VARCHAR,
  valid_at VARCHAR,       -- ISO UTC
  lat DOUBLE,
  lon DOUBLE,
  value DOUBLE,           -- NULL = missing
  unit VARCHAR,           -- NULL until official confirmation
  source_file VARCHAR,
  retrieved_at VARCHAR,
  license_status VARCHAR,
  PRIMARY KEY (run_id, variable, valid_at, lat, lon)
);
```

- ห้ามแทน missing ด้วย 0
- ห้าม interpolate
- เก็บค่า 0 ตามต้นทาง (0 ฝน ≠ missing)
- grain: `run × variable × valid_at × grid cell`

### 3.3 Downsampled snapshot (D1-ready)

- bbox แสดงผล: `[96.0, 5.0, 106.0, 21.0]`
- cell: 0.15° (~16 กม.)
- แต่ละเซลล์เก็บ:
  - `mean` — ค่าเฉลี่ยของเซลล์ต้นทางในบล็อก
  - `max` — ค่าสูงสุดในบล็อก (ใช้จัดอันดับความเสี่ยง)
  - `count` — จำนวนเซลล์ต้นทาง (อย่างน้อย 1)
  - ถ้าไม่มีข้อมูล: `null`
- ห้ามอ้างว่าเป็นค่าจังหวัดหรือค่าเฉลี่ยทั้งจังหวัด

### 3.4 Province watchlist

- ใช้จุดอ้างอิงจังหวัดจาก `data/local/geography/ddpm_province.geojson` (มีอยู่ใน checkout นี้)
- วิธี: `max_within_25km` รอบจุดอ้างอิง; ถ้าไม่มีเซลล์ในรัศมี ใช้ `nearest_cell`
- เก็บ `method`, `radius_km`, `distance_km`, `cell_count`
- ห้ามสร้างพิกัดจังหวัดเอง; ถ้าไม่มี GeoJSON ให้ lane ล้มเหลวพร้อม error ชัดเจน
- แสดงป้าย: "ค่าสูงสุดในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด"

### 3.5 D1 migration

ไฟล์: `db/cloudflare/0002_nwp.sql`

```sql
CREATE TABLE nwp_runs (
  run_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  init_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  license_status TEXT NOT NULL,
  unit_status TEXT NOT NULL,
  publication_mode TEXT NOT NULL
    CHECK (publication_mode IN ('numeric_preview', 'metadata_only')),
  variables_json TEXT NOT NULL CHECK (json_valid(variables_json)),
  lead_hours_json TEXT NOT NULL CHECK (json_valid(lead_hours_json)),
  grid_json TEXT NOT NULL CHECK (json_valid(grid_json)),
  manifest_sha256 TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'partial', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nwp_snapshots (
  run_id TEXT NOT NULL REFERENCES nwp_runs(run_id) ON DELETE CASCADE,
  variable TEXT NOT NULL,
  valid_at TEXT NOT NULL,
  unit TEXT,
  bbox_json TEXT NOT NULL CHECK (json_valid(bbox_json)),
  nx INTEGER NOT NULL,
  ny INTEGER NOT NULL,
  mean_json TEXT NOT NULL CHECK (json_valid(mean_json)),
  max_json TEXT NOT NULL CHECK (json_valid(max_json)),
  quality_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(quality_json)),
  PRIMARY KEY (run_id, variable, valid_at)
);

CREATE TABLE nwp_province_values (
  run_id TEXT NOT NULL,
  variable TEXT NOT NULL,
  valid_at TEXT NOT NULL,
  province_code TEXT NOT NULL,
  province_name TEXT NOT NULL,
  value REAL,
  method TEXT NOT NULL,
  radius_km REAL,
  distance_km REAL,
  risk_level TEXT,
  PRIMARY KEY (run_id, variable, valid_at, province_code),
  FOREIGN KEY (run_id, variable, valid_at)
    REFERENCES nwp_snapshots(run_id, variable, valid_at) ON DELETE CASCADE
);

CREATE INDEX nwp_runs_init_idx ON nwp_runs(init_at DESC);
CREATE INDEX nwp_province_lookup_idx
  ON nwp_province_values(run_id, variable, valid_at, province_code);
```

### 3.6 Retention

- เก็บ 3 รอบล่าสุดต่อ domain; ลบ run เก่ากว่า 7 วัน
- ลบ snapshot/province values ตาม `ON DELETE CASCADE`
- ห้ามลบ raw ก่อนยืนยันว่า D1 write สำเร็จ

### 3.7 Thresholds

ไฟล์ canonical: `config/nwp_thresholds.json`

```json
{
  "version": 1,
  "source": "TADIH internal thresholds; not official TMD warnings",
  "variables": {
    "p24h": { "unit": "mm", "watch": 20, "high": 50, "severe": 90 },
    "p1h":  { "unit": "mm", "watch": 10, "high": 20, "severe": 30 },
    "t2m":  { "unit": "degC", "watch": 35, "high": 38, "severe": 40 },
    "rhum": { "unit": "%", "watch": 85, "high": 90, "severe": 95 },
    "ws10m":{ "unit": "m/s", "watch": 6, "high": 10, "severe": 15 }
  }
}
```

- Web ใช้สำเนา `web/data/nwp-thresholds.json` ที่ copy ใน `prepare-data.mjs`
- Python อ่าน `config/nwp_thresholds.json`
- เพิ่ม test ว่าไฟล์สองที่ตรงกัน
- ห้าม cite ว่าเป็นเกณฑ์ราชการ

---

## 4. API Contract

ทุก route ใช้ `handleApi`/`jsonData` เดิม, `dynamic='force-dynamic'`, `cache-control: no-store`

### 4.1 `GET /api/v1/nwp/runs`

คืนรายการ run ที่ `status='ready'` เรียง `init_at DESC` ไม่เกิน 5 รายการ

```json
{
  "data": {
    "runs": [
      {
        "runId": "tmd_hpc_d02_2026102600",
        "initAt": "2026-10-26T00:00:00Z",
        "retrievedAt": "2026-10-26T08:30:00Z",
        "domain": "d02",
        "domainLabel": "Thailand 3km",
        "variables": ["p1h", "p24h", "t2m", "rhum", "ws10m"],
        "leadHours": [0, 6, 12, 24, 48, 72],
        "status": "ready",
        "licenseStatus": "pending",
        "unitStatus": "pending_official_confirmation"
      }
    ]
  },
  "meta": { "availability": "ready", "runtimeMode": "database" }
}
```

### 4.2 `GET /api/v1/nwp/grid`

Query:
- `runId` required, `^[a-z0-9_]{8,80}$`
- `variable` required, allowlist 5 ตัว
- `validAt` required, ISO 8601 UTC

คืน `mean`/`max` แบบ row-major, `null` สำหรับช่องว่าง, `nx*ny` ต้องตรงกับ array length

```json
{
  "data": {
    "runId": "tmd_hpc_d02_2026102600",
    "variable": "p24h",
    "validAt": "2026-10-27T00:00:00Z",
    "bbox": [96.0, 5.0, 106.0, 21.0],
    "nx": 67,
    "ny": 107,
    "mean": [0.0, 1.2, null],
    "max": [0.0, 4.5, null],
    "unit": null,
    "method": "block_mean_0.15deg"
  },
  "meta": {
    "access": "approved_public",
    "availability": "ready",
    "dataAsOf": "2026-10-26T00:00:00Z",
    "datasetVersion": "tmd-hpc-d02-v1",
    "warnings": ["ค่าพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด", "หน่วย/นิยามรอการยืนยันจากต้นทาง"]
  }
}
```

### 4.3 `GET /api/v1/nwp/provinces`

Query เหมือน grid; คืน 77 แถว (หรือเฉพาะที่มีค่า) พร้อม `riskLevel` จาก thresholds

```json
{
  "data": {
    "runId": "tmd_hpc_d02_2026102600",
    "variable": "p24h",
    "validAt": "2026-10-27T00:00:00Z",
    "method": "max_within_25km",
    "radiusKm": 25,
    "provinces": [
      {
        "provinceCode": "73",
        "provinceName": "นครปฐม",
        "value": 62.4,
        "riskLevel": "high",
        "distanceKm": 3.2,
        "cellCount": 18
      }
    ]
  }
}
```

### 4.4 Errors

| กรณี | status | code |
|---|---|---|
| parameter ผิด/ไม่รู้จัก | 400 | `INVALID_QUERY` |
| ไม่พบ run/snapshot | 404 | `NWP_NOT_FOUND` |
| publication mode = metadata_only | 403 | `NWP_PUBLICATION_DISABLED` |
| D1 ไม่พร้อม | 503 | `HUB_DATABASE_NOT_CONFIGURED` |
| payload ใหญ่เกิน | 500 | `NWP_PAYLOAD_TOO_LARGE` |

### 4.5 ขนาดและ performance

- grid payload ≤ 250 KB ต่อ request
- `nx*ny ≤ 12,000`
- ห้าม query ทั้งตารางโดยไม่มี `run_id/variable/valid_at`
- D1 read ต้องใช้ prepared statement และ parameter binding

---

## 5. โครงสร้างไฟล์

### Python

- `src/tadih/tmd_hpc_nwp.py` — source listing/download/manifest (Lane A)
- `src/tadih/tmd_hpc_normalize.py` — CSV parse/downsample/province aggregation (Lane B)
- `src/tadih/env.py` — getters `TMD_HPC_BASE_URL`, `TMD_HPC_PUBLICATION_MODE` (Lane A)
- `src/tadih/cli.py` — คำสั่ง `tmd-hpc` (Lane C)
- `scripts/sync_tmd_hpc_nwp.py` — publish D1 (dry-run/write) (Lane C)
- `tests/test_tmd_hpc_nwp.py` — offline fixtures + validation (Lane A)
- `tests/test_tmd_hpc_normalize.py` — parser/downsample/province tests (Lane B)

### Web

- `web/lib/hub/nwp-types.ts` — shared types (no server-only)
- `web/lib/hub/nwp-data.ts` — D1 reads, validation, mapping (server-only)
- `web/lib/hub/nwp-risk.ts` — thresholds/risk levels
- `web/app/api/v1/nwp/runs/route.ts`
- `web/app/api/v1/nwp/grid/route.ts`
- `web/app/api/v1/nwp/provinces/route.ts`
- `web/app/nwp/page.tsx`
- `web/components/nwp-dashboard.tsx`
- `web/components/nwp-dashboard.module.css`
- `web/components/nwp-heatmap.tsx` (SVG, client)
- `web/tests/nwp-data.test.ts`
- `web/tests/nwp-contract.test.ts`
- `web/data/nwp-thresholds.json` (generated)

### Shared/integration

- `db/cloudflare/0002_nwp.sql`
- `config/nwp_thresholds.json`
- `web/components/page-registry.ts` — เพิ่ม `nwp`
- `web/scripts/prepare-data.mjs` — copy thresholds
- `web/lib/hub/api-catalog.ts` — เพิ่ม 3 endpoints
- `HANDOFF.md`, `docs/progress.md`

---

## 6. Lane และคำสั่ง Subagent

> Orchestrator ต้อง spawn subagent ตาม lane ด้านล่าง โดยใช้ Agent tool (`general-purpose` สำหรับงานโค้ด, `Explore` สำหรับงานอ่านอย่างเดียว)  
> ห้ามให้ subagent แก้ไฟล์ร่วมกัน; ไฟล์ shared ownership อยู่ที่ Lane F เท่านั้น

### ตาราง lane

| Lane | บทบาท | ไฟล์ที่owns | dependency |
|---|---|---|---|
| 0 | Orchestrator / integrator | ไม่แก้โค้ดเอง кроме integration decisions | — |
| A | Source + ingest | `src/tadih/tmd_hpc_nwp.py`, `src/tadih/env.py`, `tests/test_tmd_hpc_nwp.py` | 0 |
| B | Normalize + aggregate | `src/tadih/tmd_hpc_normalize.py`, `config/nwp_thresholds.json`, `tests/test_tmd_hpc_normalize.py` | A contract |
| C | D1 publish + CLI | `db/cloudflare/0002_nwp.sql`, `scripts/sync_tmd_hpc_nwp.py`, `src/tadih/cli.py` | A/B |
| D | Web data + API | `web/lib/hub/nwp-*.ts`, `web/app/api/v1/nwp/**`, `web/tests/nwp-*.test.ts` | C schema |
| E | UI | `web/app/nwp/**`, `web/components/nwp-*` | D types |
| F | Integration/navigation/docs | `page-registry.ts`, `prepare-data.mjs`, `api-catalog.ts`, `HANDOFF.md`, `docs/progress.md` | A–E |
| G | QA/verification | ไม่แก้ product code; เขียน report/evidence | A–F |
| H | Source/license/units research | read-only; รายงาน findings | 0 |

> หมายเหตุ: A กับ B แก้ไฟล์ Python เดียวกันไม่ได้พร้อมกัน ให้ A ทำ contract/parser ก่อน แล้ว B ต่อ; หรือแยกเป็น `tmd_hpc_parse.py` และ `tmd_hpc_normalize.py` เพื่อขนานได้ ถ้าแยก ต้องแจ้ง integrator.

### Lane 0 — Orchestrator

**คำสั่ง:**

```
คุณคือ Orchestrator ของงาน TMD HPC NWP Integration ใน repo T:\coding+\BI AGRI THAILAND
อ่าน AGENTS.md, HANDOFF.md, docs/assignments/2026-10-26-tmd-hpc-nwp-integration.md และ git status/log ก่อน
ห้าม commit/deploy/แก้ .env หรือพิมพ์ token
ให้ spawn subagent 8 ตัว (A–H) ตาม lane ใน work order โดยใช้ Agent tool
ถ้าเครื่องมือ Agent ไม่มี ให้รัน lane ตามลำดับ dependency และรายงานว่าไม่สามารถขนานได้
บังคับ file ownership ตามตาราง ห้ามให้ lane แก้ไฟล์ของกันและกัน
ตั้ง contract-first: A/B/C/D ต้องตกลง schema ในข้อ 3–4 ก่อน E เริ่ม UI
หลังรวมงาน ให้รัน verification ตามข้อ 8 และรายงาน evidence จริง
ถ้า gate ใดล้ม (D1 token, license, payload) ให้หยุด lane นั้นและรายงาน ห้ามใช้ mock แทนเงียบ ๆ
```

### Lane A — Source + ingest

**คำสั่ง:**

```
งาน: เพิ่มตัวดึง TMD HPC NWP ใน src/tadih/tmd_hpc_nwp.py (ส่วน download/manifest) และ tests/test_tmd_hpc_nwp.py
บริบท: หน้า https://hpc.tmd.go.th/download ใช้ HTTPS; รายการไฟล์จาก /api/download-files?init_time=YYYYMMDDHH; 32 ไฟล์; CSV มี lat,lon + 72 คอลัมน์เวลา
ข้อกำหนด:
- ใช้ stdlib (urllib/csv/json/hashlib) ไม่เพิ่ม dependency
- รองรับ list_download_files(init_time), probe_files(...), download_run(init_time, variables, domain='d02', output_dir, max_bytes)
- ตรวจ content-type/size/checksum; เขียน manifest ตามข้อ 3.1
- timeout ≤ 60s ต่อไฟล์; retry ไม่เกิน 2 ครั้ง; ห้ามโหลดทั้ง 32 ไฟล์ถ้าไม่ได้ระบุ
- ห้าม log token/secret; ไม่มี token สำหรับ source นี้
- offline tests ใช้ fixture CSV เล็ก; live probe ทำได้เฉพาะ HEAD/range ≤ 2KB
- ถ้าไฟล์ใหญ่เกิน max_bytes ให้ fail closed พร้อม error code
ส่งมอบ: โมดูล + tests + ตัวอย่าง manifest + ผลรัน offline
ห้ามแก้ไฟล์ของ lane อื่น
```

### Lane B — Normalize + aggregate

**คำสั่ง:**

```
งาน: สร้าง src/tadih/tmd_hpc_normalize.py (parse/downsample/province), config/nwp_thresholds.json และ tests/test_tmd_hpc_normalize.py
ข้อกำหนด:
- parse CSV เป็น long table ตามข้อ 3.2; missing คง null; 0 คง 0; valid_at เป็น UTC
- downsample เป็น 0.15° ตาม bbox ข้อ 3.3; เก็บ mean/max/count; nx/ny ต้องตรง
- province values: ใช้ GeoJSON ที่ data/local/geography/ddpm_province.geojson; วิธี max_within_25km; fallback nearest_cell; ถ้าไม่มี GeoJSON ให้ error
- ห้าม interpolate/extrapolate; ห้ามสร้างพิกัดจังหวัดเอง
- thresholds จาก config/nwp_thresholds.json เท่านั้น; ห้าม hardcode ซ้ำ
- เขียน DuckDB staging ได้ แต่ห้าม commit data/local
- tests: header ผิด, lat/lon ซ้ำ, null, 0, ค่าเกินช่วง, bbox ว่าง, province ไม่มีเซลล์
ส่งมอบ: ฟังก์ชัน + tests + ตัวอย่าง snapshot JSON (fixture)
```

### Lane C — D1 publish

**คำสั่ง:**

```
งาน: สร้าง db/cloudflare/0002_nwp.sql, scripts/sync_tmd_hpc_nwp.py และ CLI `tmd-hpc` ใน src/tadih/cli.py
ข้อกำหนด:
- schema ตามข้อ 3.5 ทุกคอลัมน์/constraint
- publish จาก export JSON; ใช้ prepared statements/parameter binding
- รองรับ --dry-run (validate + นับแถว ไม่เขียน) และ --write (ต้องมี D1 client)
- ถ้าไม่มี CF_D1_TOKEN/CF_API_TOKEN หรือ D1 client ให้ exit code 2 พร้อม D1_NOT_CONFIGURED; ห้าม fallback ไป mock
- ใช้ transaction/batch; ลบ run เก่าตาม retention หลัง write สำเร็จ
- เพิ่ม CLI `tmd-hpc` ใน `src/tadih/cli.py` โดยเรียกฟังก์ชันจาก Lane A/B: `list`, `fetch`, `normalize`, `export`, `publish --dry-run|--write`; Lane C เป็นผู้แก้ `cli.py` เท่านั้น
- ห้ามพิมพ์ token; ห้าม commit .env
- tests: validate payload ผิด, snapshot length ไม่ตรง nx*ny, province อ้าง snapshot ที่ไม่มี, dry-run ไม่เขียน
ส่งมอบ: migration + script + CLI + หลักฐาน dry-run (และ write ถ้ามี token)
```

### Lane D — Web data + API

**คำสั่ง:**

```
งาน: สร้าง web/lib/hub/nwp-types.ts, nwp-data.ts, nwp-risk.ts, 3 routes ใต้ web/app/api/v1/nwp/ และ tests
ข้อกำหนด:
- ใช้ handleApi/jsonData/HubRequestError และ getD1 เดิม; ห้ามเพิ่ม dependency
- query validation ตามข้อ 4; allowlist 5 ตัวแปร; validAt ISO UTC
- อ่าน D1 ด้วย prepared statement; ถ้า D1 ไม่พร้อม → 503 HUB_DATABASE_NOT_CONFIGURED
- publication mode metadata_only → 403 NWP_PUBLICATION_DISABLED
- payload grid ≤ 250KB; ตรวจ nx*ny = array length; null ต้องคง null
- meta ตามข้อ 4; warnings ภาษาไทย; cache-control no-store
- tests ใช้ pure mapping/validation ไม่ยิง network; contract test ตรวจ status/code
ส่งมอบ: โค้ด + tests + ตัวอย่าง response จริง/ fixture
ห้ามแก้ page-registry/shell/globals
```

### Lane E — UI

**คำสั่ง:**

```
งาน: สร้าง web/app/nwp/page.tsx, web/components/nwp-dashboard.tsx, nwp-heatmap.tsx, nwp-dashboard.module.css
ข้อกำหนด:
- ใช้ Shell active="nwp", design tokens, CSS Modules; ห้ามเพิ่ม dependency แผนที่
- heatmap SVG จาก mean/max; tooltip lat/lon/value; legend; แกน lat/lon; ไม่มีขอบเขตการปกครองปลอม
- controls: variable tabs, lead-time, run selector; keyboard accessible; aria labels
- province table: ค้นหา/กรองภาค/เรียงตามค่า; แสดง method/radius ชัดเจน
- governance banner ตามข้อ 2.4; advisories จาก thresholds
- responsive 1440/390; ไม่มี horizontal overflow; empty/error/loading states
- ใช้ข้อมูลจาก nwp-data โดยตรงใน server component สำหรับ initial run; client fetch สำหรับเปลี่ยนค่า
- ห้ามแก้ page-registry/shell/globals (Lane F ทำ)
ส่งมอบ: หน้า + components + screenshots 1440/390 + ผลคลิกจริง
```

### Lane F — Integration/navigation/docs

**คำสั่ง:**

```
งาน: ผูกหน้าเข้าระบบและอัปเดตเอกสาร (ไฟล์ shared ownership)
ข้อกำหนด:
- page-registry.ts: เพิ่ม PageId 'nwp', PAGES entry href '/nwp', group 'weather', icon 'sun', keywords
- prepare-data.mjs: copy config/nwp_thresholds.json → web/data/nwp-thresholds.json
- api-catalog.ts: เพิ่ม 3 endpoints (runs/grid/provinces)
- ตรวจว่า home/directory/sidebar/bottom nav/search เห็นหน้า /nwp อัตโนมัติ
- เพิ่ม cross-link จาก /weather, /early-warning, /satellite ตามความเหมาะสม
- อัปเดต HANDOFF.md และ docs/progress.md ด้วยคำสั่ง/หลักฐานจริง
- ห้ามแก้ไฟล์ของ Lane A–E ยกเว้น necessary integration; ถ้าจำเป็นให้แจ้ง integrator
ส่งมอบ: diff + หลักฐานว่าเมนู/ดันเจียน/หน้าแรกเข้าถึง /nwp ได้
```

### Lane G — QA/verification

**คำสั่ง:**

```
งาน: ตรวจรับทั้งระบบโดยไม่แก้ product code
ต้องรันและรายงานผลจริง:
- Python: .venv/Scripts/python.exe -m unittest tests.test_tmd_hpc_nwp -v
- Web: npm --prefix web run typecheck; npm --prefix web test; npm --prefix web run build:vinext
- CLI: tmd-hpc list --init-time 2026102600; tmd-hpc fetch --probe --variables p24h --domain d02; tmd-hpc export --dry-run
- API: valid 200, invalid 400, unknown 404, metadata_only 403, no D1 503
- UI: /nwp 200; H1; nav link; 1440/390 no overflow; console errors 0; controls ใช้งานได้
- Crawl 34 routes (33 + /nwp) ไม่มี failure
- ตรวจ payload ≤ 250KB และ nx*ny ตรง
- ตรวจ governance: ไม่มี sample:true, มี license/unit warnings, ไม่มี secret ใน git
- ตรวจ git status ว่าไม่มี .env/data/local ถูก track
ส่งมอบ: ตาราง pass/fail + evidence (คำสั่ง/ผล/ภาพ) + รายการ blocker
```

### Lane H — Source/license/units research

**คำสั่ง:**

```
งาน: วิจัยแหล่ง TMD HPC (read-only) เพื่อยืนยันนิยาม/หน่วย/license
- หาเอกสารทางการของตัวแปร p1h/p24h/t2m/rhum/ws10m, domain d01/d02, รอบ init, หน่วย, เวลา UTC/ICT
- ตรวจหน้า docs/about/terms ของ hpc.tmd.go.th และ data.tmd.go.th; ถ้า WAF 403 ให้บันทึก
- ห้ามเดาหน่วย; ถ้าไม่พบให้ระบุ "unconfirmed"
- ห้ามแก้โค้ด/registry
ส่งมอบ: สรุป findings + URL/วันที่ + ข้อเสนอว่าจะเปิด numeric_preview ได้หรือไม่
```

---

## 7. Gates และความเสี่ยง

| Gate | เงื่อนไข | การจัดการ |
|---|---|---|
| G1 D1 token | ไม่มี `CF_D1_TOKEN`/`CF_API_TOKEN` | Lane C ทำ dry-run; หยุด write; รายงาน; ห้าม mock |
| G2 หน่วย/license | ยัง pending | แสดง warnings; ห้ามเรียกราชการ; Lane H หาเอกสาร |
| G3 ขนาดไฟล์ | 1 รอบ ~1.33 GB | ดึงเฉพาะ 5 ตัวแปร, 1 run; จำกัดเวลา/ขนาด; ใช้ CSV |
| G4 production FS | `data/local` ไม่อยู่ใน build | production อ่าน D1 เท่านั้น; local dev ใช้ staging |
| G5 shared files | หลาย lane แก้ไฟล์เดียวกัน | ownership ตามตาราง; Lane F เท่านั้น |
| G6 secrets | `.env`/token | ห้าม commit/พิมพ์; `git check-ignore` |
| G7 map lib | ไม่มี dependency | SVG/canvas เท่านั้น; ห้ามเพิ่ม leaflet |
| G8 payload | grid ใหญ่ | 0.15°, bbox 96–106/5–21, ≤12,000 cells |

---

## 8. Verification (ต้องรันจริง)

```bash
# Python
PYTHONPATH=src .venv/Scripts/python.exe -m unittest tests.test_tmd_hpc_nwp -v

# CLI (bounded)
PYTHONPATH=src .venv/Scripts/python.exe -c "from tadih.cli import main; raise SystemExit(main())" \
  tmd-hpc list --init-time 2026102600
PYTHONPATH=src .venv/Scripts/python.exe -c "from tadih.cli import main; raise SystemExit(main())" \
  tmd-hpc fetch --init-time 2026102600 --domain d02 --variables p24h --probe

# Web
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build:vinext

# Routes/UI (dev server)
npm --prefix web run dev
# ตรวจ /nwp, /directory, /weather, /early-warning, /satellite
# 1440×1000 และ 390×844: scrollWidth, H1, nav link, console errors
```

### Acceptance

- [ ] `/nwp` เปิดได้ 200 และมี H1
- [ ] เมนู sidebar/home/directory/search เข้าถึง `/nwp`
- [ ] API 3 routes ทำงานตาม contract; error codes ถูก
- [ ] grid payload ≤ 250KB; `nx*ny` ตรง; null คง null
- [ ] province values มี method/radius/distance; ไม่เรียกค่าเฉลี่ยจังหวัด
- [ ] governance warnings แสดงทุกจุด; ไม่มี `sample:true`
- [ ] typecheck 0 error; tests ผ่าน; build ผ่าน
- [ ] 34 routes crawl ไม่มี failure; 390/1440 ไม่ overflow; console 0 error
- [ ] ไม่มี `.env`/token/raw data ใน git
- [ ] HANDOFF/progress มีหลักฐานจริงและงานค้าง

---

## 9. Handoff

เมื่อเสร็จ ให้รายงาน:

1. ไฟล์ที่สร้าง/แก้
2. คำสั่งที่รันและผลจริง
3. ค่า `run_id`, init time, จำนวนไฟล์/แถว/เซลล์
4. สถานะ D1 (write/dry-run) และ token ที่ขาด
5. ข้อจำกัด units/license และสิ่งที่ยังไม่ยืนยัน
6. งานค้าง/คำสั่งรับต่อ
7. `git status` ว่าไม่มี secret/raw data

ห้าม commit/deploy จนเจ้าของงานสั่ง
