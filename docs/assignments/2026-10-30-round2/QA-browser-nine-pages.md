# QA browser — nine wired pages (round 2, 30 Oct 2026)

Status: COMPLETE — 6 PASS, 3 FAIL (see Verdicts). No page showed invented numbers.

- Tree: `7d1c547`, clean at start (`git status --short` empty at 21:09); a concurrent lane dirtied it mid-run at 21:14–21:17 — see Process notes.
- Dev server: `next dev --hostname 127.0.0.1 --port 3100`, logs outside repo at `C:\Users\drago\AppData\Local\Temp\tadih-qa-2026-10-30\dev.log` (instance 1) and `dev-2.log` (instance 2, after the restart)
- Browser: Playwright MCP
- Viewports: 1440x900 (desktop) and 390x844 (mobile)
- Build/vinext build: NOT run (by instruction)
- D1 writes: none. Only GET requests issued by the app itself.

## Results table

| # | Route | Viewport | HTTP | `<h1>` count | H-overflow (scrollWidth>clientWidth) | Console/page errors | New real-data block state | Sample label on remaining sample section | Screenshot | Verdict |
|---|-------|----------|------|--------------|--------------------------------------|---------------------|---------------------------|------------------------------------------|------------|---------|
| 1 | /livestock | 1440x900 | 200 | 1 | no (1425=1425) | none (1 CSS-preload warning) | Empty state: "ยังไม่มีตัวเลขในคลังข้อมูลกลางสำหรับชนิดนี้ / ยังไม่มีตัวเลขในคลัง", metadata 385 records shown; no invented numbers | yes — DOF aquatic section: "ยังเป็นค่าตัวอย่าง ... สิทธิ์กรมประมงอยู่ระหว่างตรวจ" | livestock-1440x900.png | PASS |
| 1 | /livestock | 390x844 | 200 | 1 | no (375=375) | none | same empty state | yes — 4 "ค่าตัวอย่าง" strings | livestock-390x844.png | PASS |
| 2 | /cooperatives | 1440x900 | 200 | 1 | no (1425=1425) | none | Unavailable/metadata-only: "เปิดเผยได้เฉพาะ metadata ของทรัพยากร / คลังกลางยังไม่พบทรัพยากรนี้ที่เผยแพร่ได้" — no numbers | yes — CAMELS dashboard: "กำหนดผลซ้ำได้ (data.sample = true)", "ชื่อและเลขทะเบียนเป็นค่าตัวอย่าง" | cooperatives-1440x900.png | PASS |
| 2 | /cooperatives | 390x844 | 200 | 1 | no (375=375) | none | same | yes — 2 "ค่าตัวอย่าง" strings | cooperatives-390x844.png | PASS |
| 3 | /crops | 1440x900 | 200 | 1 | no (1425=1425) | none | Catalog-missing: "ยังไม่พบทรัพยากรนี้ในแคตตาล็อกของคลังข้อมูลกลาง ... จึงไม่แสดงตัวเลขใด ๆ"; counter 0 rows; no invented numbers | n/a (page is real-only + crop calendar reference) | crops-1440x900.png | PASS-WITH-NOTE |
| 3 | /crops | 390x844 | 200 | 1 | **YES — scrollWidth 428 > clientWidth 375 (+53px)** | none | same catalog-missing | n/a | crops-390x844.png | FAIL (mobile overflow) |
| 4 | /soil | 1440x900 | 200 | 1 | no (1425=1425) | none | Catalog-missing, same wording as /crops; no invented numbers | yes — reference soil table: "ข้อมูลอ้างอิงเชิงตัวอย่าง เพื่อสาธิต" | soil-1440x900.png | PASS |
| 4 | /soil | 390x844 | 200 | 1 | no (375=375) | none | same | yes | soil-390x844.png | PASS |
| 5 | /trade | 1440x900 | 200 | 1 | no (1440=1440) | none | Empty: "ยังไม่มีระเบียนที่เผยแพร่ได้", badge metadata-only, Version/ดึงข้อมูลเมื่อ = ยังไม่มี; no numbers | n/a (no sample section left) | trade-1440x900.png | PASS |
| 5 | /trade | 390x844 | 200 | 1 | no (375=375) | none | same | n/a | trade-390x844.png | PASS |
| 6 | /price-trend | 1440x900 | **404** | 1 ("ไม่พบหน้าที่ต้องการ") | no | 1 console error: "Failed to load resource: the server responded with a status of 404 (Not Found)" | No route exists at this path — no real-data block at all | n/a | price-trend-1440x900.png | FAIL (route missing) |
| 6 | /price-trend | 390x844 | **404** | 1 | no | same 404 console error | same | n/a | price-trend-390x844.png | FAIL (route missing) |
| 6b | /explore?view=price_trend (actual price-trend page) | 1440x900 | 200 | 1 ("สำรวจข้อมูล") | no (1440=1440) | none | Empty: "ยังไม่พบชุดข้อมูลราคาใน API"; no numbers | n/a | explore-price-trend-1440x900.png | PASS |
| 6b | /explore?view=price_trend | 390x844 | 200 | 1 | no (375=375) | none | same | n/a | explore-price-trend-390x844.png | PASS |
| 7 | /climate-history | 1440x900 | **200 on first hit, then 500 on every reload** | 1 (first hit) / 0 on 500 | no (1440=1440) | 6 console errors — see below; includes 500 on `/api/v1/climate-history` | First hit: ERA5 selector block shows "เปิดข้อมูลประวัติภูมิอากาศไม่ได้ / Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" (raw parser text leaked); CHIRPS annex shows 3 real grid cells. After the first reload the whole page is a blank 500 | n/a (no sample section) | climate-history-1440x900.png | FAIL (page 500 + raw error text) |
| 7 | /climate-history | 390x844 | **500 (blank body, 0 `<h1>`)** | 0 | no (hairline; 390=390, blank page) | 9 console errors, same module-not-found + 500 | No content at all — page does not render | n/a | climate-history-390x844.png | FAIL (page 500) |
| 8 | /crop-evidence | 1440x900 | 200 | 1 | no (1425=1425) | none | Empty: "ยังไม่มีแถวที่เผยแพร่", "ยังไม่มีแถว NDVI ของ modis-13A1-061 ... ไม่แสดงค่าตัวอย่างแทนข้อมูลจริง"; no numbers | n/a (no sample numbers on page) | crop-evidence-1440x900.png | PASS |
| 8 | /crop-evidence | 390x844 | 200 | 1 | no (375=375) | none | same | n/a | crop-evidence-390x844.png | PASS |
| 9 | /land-reform | 1440x900 | 200 | 1 | no (1425=1425) | none | metadata_only: "ข้อมูลจริงส่วนนี้ยังไม่แสดงตัวเลข · metadata_only — ... ไม่ใช้ตัวเลขตัวอย่างแทน"; no numbers | yes — ALRO dashboard titled "(sample)" + "ข้อมูลตัวอย่างเชิงโครงสร้างเพื่อการสาธิต" | land-reform-1440x900.png | PASS |
| 9 | /land-reform | 390x844 | 200 | 1 | no (375=375) | none | same | yes | land-reform-390x844.png | PASS |

## API routes

Both probed with `curl -s -o file -w '%{http_code}'`, GET only, against the app's own read path (no direct D1 access by QA).

| Route | HTTP | meta.availability | meta.access | meta.completeness | data.sample | Row count | Empty-store behaviour | Verdict |
|-------|------|-------------------|-------------|-------------------|-------------|-----------|-----------------------|---------|
| GET /api/v1/cooperatives/cpd-counts | 200 | `metadata_only` | `metadata_only` | `unknown` | `false` | 0 (`data.rows` empty, `data.counts.rowCount=0`, `snapshot=null`, `coverageClaim=false`, `derivedTotalsProvided=false`) | Returns an explicit metadata-only envelope with warnings "ไม่พบทรัพยากรนี้ในคลังข้อมูลกลาง" / "หน้านี้จึงแสดงสถานะว่างเท่านั้น ไม่ดึงตัวเลขตัวอย่างมาใช้แทน" — no sample rows. `meta.retrievedAt` null by design for byte-stable reads; `meta.sourceIds=["cpd"]` | PASS |
| GET /api/v1/crop-evidence/ndvi | 200 | `empty` | `metadata_only` | `unknown` | `false` | 0 (`data.points=[]`, `data.observations=[]`, `scope.pointCount=0`) | Empty envelope with `notAvailableReason="NO_PUBLISHED_MODIS_ROWS"` and warning "ยังไม่มีแถว NDVI ... ค่าว่างนี้ไม่ใช่หลักฐานว่าพื้นที่ไม่มีพืช"; `meta.sourceIds=[]`; no sample rows | PASS |

## Console / page errors (exact text)

**/livestock, /cooperatives, /crops, /soil, /trade, /explore?view=price_trend, /crop-evidence, /land-reform** — 0 console errors and 0 page errors at both widths. Only a non-blocking CSS preload warning appeared: `The resource http://127.0.0.1:3100/_next/static/chunks/components_shell_module_1aqt5_ufs7zbp.css was preloaded using link preload but not used within a few seconds from the window's load event...`

**/price-trend (404)** — 1 console error: `Failed to load resource: the server responded with a status of 404 (Not Found)`

**/climate-history** — 5–6 console errors on the first (200) load, reproduced on a freshly restarted server:

```
./lib/hub/climate-history-cache.ts:43:36
Error: Module not found: Can't resolve '../../../data/local/raw/open_meteo/'
  41 | ...
  42 | ...tps://archive-api.open-meteo.com/v1/archive';
> 43 | ...leURLToPath(new URL('../../../data/local/raw/open_meteo/', import.meta.url));
     |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  44 | ...
  45 | ...{
  46 | ...
Import trace:
  App Route:
    ./lib/hub/climate-history-cache.ts
    ./lib/hub/climate-history-data.ts
    ./app/api/v1/climate-history/route.ts
```

plus `Failed to load resource: the server responded with a status of 500 (Internal Server Error)` and the same module error re-thrown as a `pageerror`. The page surfaces raw parser text to the user: `เปิดข้อมูลประวัติภูมิอากาศไม่ได้` / `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.

Second and later loads of /climate-history return a blank **500** (`<h1>` count 0, body text length 0). Verified twice on the restarted server: first hit 200, second hit 500.

**Blast radius (dev only):** after /climate-history is opened once, every other route on that dev server also returns 500 (`/livestock /cooperatives /crops /soil /trade /crop-evidence /land-reform /explore?view=price_trend /`). This was reproduced on both server instances. All other pages were therefore measured before /climate-history was opened, and /crop-evidence + /land-reform were re-measured on a freshly restarted server.

## Cause notes

1. `/climate-history` + `/api/v1/climate-history` — `web/lib/hub/climate-history-cache.ts:43` (new in `7d1c547`) resolves a **directory** through `new URL(...)`, which Turbopack treats as a module specifier. `data/local/` is gitignored (`.gitignore:8`), so the 50 ERA5 partition folders exist only on this machine; a clean checkout has none. The first page load survives (CHIRPS annex renders 3 real grid cells), then the dev graph is poisoned.
2. `/crops` mobile overflow — caused by the pre-existing crop-calendar month grid (`.crops-dashboard-module__9nuo0a__monthCell` inside `.monthBars`), 640px-wide table clipped by its wrapper but the month-cell row escapes: 12 cells × ~19–35px, right edge 428px at 375px. `web/components/crops-dashboard.*` was **not** touched by `7d1c547`; the new DOAE block is not the cause.
3. `/price-trend` — no such route in the App Router (`web/app/` has no `price-trend` directory). The price-trend view lives at `/explore?view=price_trend` (per L4 report and `web/app/explore/page.tsx`). Both that page and its API respond honestly.

## Screenshot paths

All under `C:\Users\drago\AppData\Local\Temp\tadih-qa-2026-10-30\` (outside the repo):

- livestock-1440x900.png, livestock-390x844.png
- cooperatives-1440x900.png, cooperatives-390x844.png
- crops-1440x900.png, crops-390x844.png
- soil-1440x900.png, soil-390x844.png
- trade-1440x900.png, trade-390x844.png
- price-trend-1440x900.png, price-trend-390x844.png (404 state)
- explore-price-trend-1440x900.png, explore-price-trend-390x844.png (real price-trend view)
- climate-history-1440x900.png (first hit, 200 + error text), climate-history-1440x900-restart-firsthit.png (same on restarted server), climate-history-390x844.png (500 blank)
- crop-evidence-1440x900.png, crop-evidence-390x844.png
- land-reform-1440x900.png, land-reform-390x844.png

## Dev-server log tail

`C:\Users\drago\AppData\Local\Temp\tadih-qa-2026-10-30\dev.log` (instance 1, 945 lines) and `dev-2.log` (instance 2, 304 lines). Both end with:

```
⨯ ./lib/hub/climate-history-cache.ts:43:36
Error: Module not found: Can't resolve '../../../data/local/raw/open_meteo/'
Import trace:
  App Route:
    ./lib/hub/climate-history-cache.ts
    ./lib/hub/climate-history-data.ts
    ./app/api/v1/climate-history/route.ts
```

Request lines from `dev.log` (instance 1):

```
GET /climate-history 200 in 723ms (next.js: 37ms, application-code: 687ms)
GET /api/v1/climate-history?provinceCode=73&startYear=2016&endYear=2025 500 in 3.4s
GET /climate-history 500 in 98ms
GET /crop-evidence 500 in 165ms
GET /livestock 500 in 60ms
GET / 500 in 251ms
```

Request lines from `dev-2.log` (instance 2, after restart):

```
GET /crop-evidence 200 in 662ms
GET /land-reform 200 in 673ms
GET /api/v1/cooperatives/cpd-counts 200 in 388ms
GET /api/v1/crop-evidence/ndvi 200 in 405ms
GET /climate-history 200 in 658ms
GET /api/v1/climate-history?provinceCode=73&startYear=2016&endYear=2025 500 in 839ms
GET /climate-history 500 in 57ms
GET /livestock 500 in 45ms
```

## Process notes

- Dev server started once at 21:09 (`dev.log`), then **restarted once** (`dev-2.log`) after the compile error poisoned every route; both logs are outside the repo, nothing was written into the tree. Server was killed at the end and confirmed gone (port 3100 closed, 0 matching `next dev` processes).
- `web/next-env.d.ts` was rewritten by `next dev` and restored with `git checkout -- web/next-env.d.ts` (authorised). `web/agents.md` is not git-tracked here, so nothing to restore for it.
- **The tree went dirty during the run through no action of this lane.** At 21:09 `git status` was clean; by 21:15–21:17 these tracked files were modified by another concurrent lane (L7 id-divergence fix + CI repair), and `docs/operations/` appeared untracked: `.github/workflows/{ci,sync-hub-catalog,sync-hub-numeric}.yml`, `src/tadih/ldd_pgs_progress.py`, `src/tadih/ldd_pgs_progress_d1.py`, `tests/test_ldd_pgs_progress.py`, `tests/test_ldd_pgs_progress_d1.py`, `tests/test_project_register.py`, `web/lib/hub/land-reform-data.ts`, `web/lib/hub/ldd-pgs-progress.ts`, `web/tests/lane-l7-land-reform.test.ts`. Reported, not reverted. `/land-reform` was measured at 21:16, i.e. against the working tree including the L7 id change (the change only alters D1 resource keys, and the store is empty, so the rendered state is unchanged).
- No D1 write and no direct D1 query by QA; only the app's own reads. No `npm run build` / `build:vinext`.

## Verdicts

| Page | Verdict | Reason |
|------|---------|--------|
| /livestock | **PASS** | 200, 1 `<h1>`, no overflow either width, 0 errors, honest "ยังไม่มีตัวเลขในคลัง" + labelled DOF sample |
| /cooperatives | **PASS** | 200, 1 `<h1>`, no overflow either width, 0 errors, metadata-only message + labelled CAMELS sample |
| /crops | **FAIL** | 200 and honest catalog-missing block, but **horizontal overflow at 390×844** (scrollWidth 428 vs clientWidth 375, +53px) from the pre-existing crop-calendar month grid, not from the new DOAE block |
| /soil | **PASS** | 200, 1 `<h1>`, no overflow, 0 errors, catalog-missing message, reference table labelled as sample |
| /trade | **PASS** | 200, 1 `<h1>`, no overflow, 0 errors, "ยังไม่มีระเบียนที่เผยแพร่ได้", metadata-only |
| /price-trend | **FAIL** | **404** — route does not exist; the real price-trend view is `/explore?view=price_trend` and that page passes (200, honest "ยังไม่พบชุดข้อมูลราคาใน API") |
| /climate-history | **FAIL** | Compile error from `climate-history-cache.ts:43`, `/api/v1/climate-history` 500, raw "Unexpected token '<'" text shown to users, and every reload after the first is a blank 500; then every other route on that dev server 500s |
| /crop-evidence | **PASS** | 200, 1 `<h1>`, no overflow either width, 0 errors, "ยังไม่มีแถวที่เผยแพร่" + `NO_PUBLISHED_MODIS_ROWS` |
| /land-reform | **PASS** | 200, 1 `<h1>`, no overflow either width, 0 errors, metadata_only message + labelled ALRO sample |

Summary: 6 PASS, 3 FAIL (crops, price-trend, climate-history). No page displayed invented numbers. Blocks that were empty said so explicitly. Nothing is safe to deploy until the /climate-history module error is fixed, because it takes the whole dev server down and its ERA5 data directory is gitignored.

Two API routes: both PASS (200, honest `meta.availability`/`access`/`completeness`, `data.sample=false`, zero rows, no sample fallback).

