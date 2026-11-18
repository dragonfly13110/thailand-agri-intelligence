# Interactive Multi-Factor Thailand Hotspot Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, offline-capable single-file HTML interactive map & multi-factor analytical dashboard (`hotspot_5y_interactive_map.html`) combining GISTDA 5-year hotspots (`Suomi NPP N` default vs `ALL`), burn scars/freq, ERA5 climate factors, and HII flood recurrence across all 77 provinces, 926 amphoes, and 7,658 tambons.

**Architecture:** `hotspot-5y/map_data.py` extracts pre-aggregated bit-packed sparse cubes, 0.05° heatmap cells, curated overlays (143 static spots, top villages), simplified 3-level GeoJSON boundaries with spherical `sqkm`, ERA5 2022–2025 annual climate, and HII flood recurrence, encoding them via `zlib` + base64. `hotspot-5y/map_template.py` renders a zero-external-JS-dependency HTML5 Canvas + SVG UI (`DecompressionStream('gzip')`, pure JS spatial projection, optional online tile underlay, live Pearson `r` scatter plot, 3-level drill-down, CSV export). `hotspot-5y/build_interactive_map.py` provides the CLI entrypoint.

**Tech Stack:** Python 3.12 (`.venv`), DuckDB (`spatial` extension), `zlib`/base64, pure HTML5/CSS/ES2022 Canvas/SVG (browser `DecompressionStream('gzip')`), Python `unittest`, Playwright/Chromium for headless smoke verification.

**Spec:** [docs/superpowers/specs/2026-11-18-hotspot-multifactor-map-design.md](file:///d:/code/thailand-agri-intelligence/docs/superpowers/specs/2026-11-18-hotspot-multifactor-map-design.md)

## Global Constraints

- Completely isolated from `web/` and Cloudflare D1 (zero edits to `web/`, zero D1 writes).
- Default satellite mode is `Suomi NPP (N)` with `Jan–Oct` comparable window toggle; `ALL` mode warns on 2022–2026 multi-satellite overlap (`~33%` same-day/cell in 2025–2026) and `N` cutoff after `2026-11-01`.
- Uncovered provinces/tambons in `gistda_burn_scar` (20 provs), `gistda_burn_freq` (24 provs), and `fact_flood_risk_forecast` (1,224 unrecorded tambons + Phuket/Ranong) MUST remain `null` ("ไม่มีข้อมูลต้นทาง"), never coerced to `0`.
- ERA5 climate stays locked at 77-province grain (2022–2025; `2026` is `null`) — never duplicated onto amphoe/tambon rows or plotted on sub-province scatter points.
- Crop filters (`นาข้าว`, `อ้อย`, `ข้าวโพดและไร่หมุนเวียน`) match `lu_hp_name` across ALL land uses (including forest encroachment), while KPI #2 and breakdown bars preserve `พื้นที่เกษตร+ส.ป.ก.` vs `ป่าไม้`.
- Season slices (`ม.ค.–ก.พ.`, `มี.ค.–เม.ย.`, `พ.ค.–ต.ค.`, `พ.ย.–ธ.ค.`) operate strictly within calendar `year_th`.
- Works 100% offline via `file://` without CDN JS/CSS; output HTML size `< 25 MB` (target `~4–10 MB`); JSON embedded inside `<script>` safely escapes `</script>` (`<` -> `\u003c`).

## Review Focus

1. **`</script>` / HTML injection inside embedded payload:** Any Thai label or base64/JSON string containing `</` or invalid UTF-8 breaking `<script>` parsing must be escaped (`json.dumps(...).replace("<", "\\u003c")`).
2. **Missing HII / missing `tadih.duckdb` / missing `burn_scar`/`burn_freq` rows:** `build_payload()` when `tadih_db=None` or partial provinces must produce clean `null` fields and render gray "ไม่มีข้อมูลต้นทาง" without `NaN` or `0` coercion in JS.
3. **Division by zero & empty filter states:** Selecting `2026` + `N` + `พ.ย.–ธ.ค.` (only Nov 1 has 28 points) or `ข้าวโพด` in Bangkok (`0` points) or empty Pearson `r` denominator (`variance == 0` or `< 3` points) must display `ไม่มีข้อมูล` / `r = n/a` cleanly with zero `NaN` / `Infinity` / runtime errors.
4. **Canvas hit-testing & MultiPolygon winding/holes after `ST_SimplifyPreserveTopology`:** Islands (e.g. Phuket/Surat Thani) and multi-part amphoes/tambons (`Polygon` and `MultiPolygon`) must project, zoom, and hit-test accurately at all 3 levels.
5. **Browser `file://` decompression & CSV UTF-8 BOM:** `DecompressionStream('gzip')` from inline base64 must initialize cleanly under `file:///` without CORS errors, and CSV export must include `\uFEFF` UTF-8 BOM so Thai opens properly in Excel.

---

### Task 1: Multi-Factor Data Extractor & Compressed Payload Builder (`hotspot-5y/map_data.py`)

**Files:**
- Create: `hotspot-5y/map_data.py`
- Test: `hotspot-5y/tests/test_interactive_map.py`

**Interfaces:**
- Produces:
  - `pack_flags(is_other_sat: int, yr_idx: int, sea_idx: int, lu_idx: int, crop_idx: int, st_idx: int) -> int`
  - `encode_payload_b64(payload: dict) -> str`
  - `build_map_payload(db_path: Path, era5_path: Path, tadih_db_path: Path | None = None, *, simplify_prov: float = 0.004, simplify_amphoe: float = 0.004, simplify_tambon: float = 0.0025) -> dict`

- [ ] **Step 1: Write the failing unit tests for `map_data.py` in `hotspot-5y/tests/test_interactive_map.py`**
  - Create synthetic temp DuckDB (`hotspot_5y`), synthetic `era5-annual-2016-2025.json` (77 or 2 provinces across 2022–2025), and synthetic `tadih.duckdb` (`fact_flood_risk_forecast` covering 1 of 2 provinces so the other stays `null`).
  - Test `test_pack_flags_roundtrip`: verify bit packing/unpacking of `(sat, yr, sea, lu, crop, st)` across boundary values.
  - Test `test_build_map_payload_preserves_nulls_and_separates_satellites`:
    - Assert province missing from `gistda_burn_scar` / `gistda_burn_freq` / `fact_flood_risk_forecast` has `None` (`null`), NOT `0`.
    - Assert `N` vs `non-N` cube counts match exact fixture rows, `corn` inside `ป่าสงวนแห่งชาติ` preserves both `lu_idx=1` (`forest`) and `crop_idx=3` (`corn`), and `era5` has `2022..2025` keys with `2026` absent/`None`.
    - Assert `area_sqkm > 0` for all boundary rows and `top_villages` includes coordinates.
    - Assert `build_map_payload(..., tadih_db_path=None)` succeeds with `flood: None` on all provinces/amphoes/tambons.
  - Test `test_encode_payload_b64_roundtrip_and_safe_json`: decompresses cleanly with `zlib.decompress(base64.b64decode(...))` to exact JSON matching input dict.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `.venv\Scripts\python.exe -X utf8 -m unittest hotspot-5y/tests/test_interactive_map.py -v`
  - Expected: FAIL with `ModuleNotFoundError: No module named 'map_data'`.

- [ ] **Step 3: Implement `hotspot-5y/map_data.py`**
  - Implement `pack_flags(...)`, `encode_payload_b64(...)`, simplified geometry extraction (`_extract_geometries(...)` converting DuckDB `ST_AsGeoJSON(ST_SimplifyPreserveTopology(...))` to compact quantized coordinate arrays `round(coord, 4)` to cut geometry size cleanly while preserving `Polygon`/`MultiPolygon` topology), spherical area calculation (`ST_Area_Spheroid(ST_FlipCoordinates(geom)) / 1e6`), sparse cube extraction, `0.05°` grid (`lat_i = round(lat * 20)`, `lon_i = round(lon * 20)`), `burn_scar`/`burn_freq` aggregation preserving `None` for uncovered areas, `era5` 2022–2025 loader (`None` for 2026), optional `tadih.duckdb` HII flood recurrence join (only matching `tambon_code` / `amphoe_code` / `prov_code`, keeping unrecorded areas `None`), `static_spots` (from `v_suspected_static_hotspots` + lat/lon), and `top_villages` (top 300 national + top 10 per province with `avg(latitude)`, `avg(longitude)`).

- [ ] **Step 4: Run test to verify it passes**
  - Run: `.venv\Scripts\python.exe -X utf8 -m unittest hotspot-5y/tests/test_interactive_map.py -v`
  - Expected: PASS (all `map_data` tests OK).

---

### Task 2: Self-Contained Interactive Map Template & CLI (`hotspot-5y/map_template.py`, `hotspot-5y/build_interactive_map.py`)

**Files:**
- Create: `hotspot-5y/map_template.py`
- Create: `hotspot-5y/build_interactive_map.py`
- Modify: `hotspot-5y/README.md`
- Modify: `hotspot-5y/tests/test_interactive_map.py`

**Interfaces:**
- Consumes: `build_map_payload`, `encode_payload_b64` from `map_data.py`.
- Produces:
  - `render_interactive_html(payload: dict) -> str` in `map_template.py`
  - `build_interactive_map(db_path: Path, era5_path: Path, tadih_db_path: Path | None, out_path: Path) -> dict` in `build_interactive_map.py`

- [ ] **Step 1: Add failing HTML rendering & CLI integration tests to `hotspot-5y/tests/test_interactive_map.py`**
  - `test_render_interactive_html_escapes_script_and_embeds_b64`: inject a fake province name containing `</script><script>alert(1)</script>` and verify `</script>` appears ONLY at the real script boundary, payload decompresses, and HTML has all required UI control IDs (`satSelect`, `yearSelect`, `seasonSelect`, `cropSelect`, `metricSelect`, `scatterX`, `scatterY`, `searchInput`, `exportCsvBtn`, `presentationBtn`, `themeToggle`, `mapCanvas`).
  - `test_build_interactive_map_cli_writes_html_and_metadata`: run `build_interactive_map(...)` on synthetic fixtures and verify output HTML file exists, is non-empty, and returns summary metadata (`html_bytes`, `provinces`, `amphoes`, `tambons`).

- [ ] **Step 2: Run tests to verify failure**
  - Run: `.venv\Scripts\python.exe -X utf8 -m unittest hotspot-5y/tests/test_interactive_map.py -v`
  - Expected: FAIL with `ModuleNotFoundError: No module named 'map_template'`.

- [ ] **Step 3: Implement `hotspot-5y/map_template.py`**
  - Zero-external-JS-dependency, full-function offline-first HTML/CSS/JS dashboard:
    - Smooth Canvas Web-Mercator vector renderer with zoom/pan/fitBounds, optional online tile underlay (`none` / `carto_dark` / `osm` / `esri_sat`), 3-level click drill-down (`province` → `amphoe` → `tambon`) + breadcrumb + instant search autocomplete across all 77 provinces, 926 amphoes, and 7,658 tambons.
    - All 7 choropleth metrics (Hotspot count, Density per 100 sq.km, Agri+ALRO share %, Burn Scar rai, Burn Freq rai, ERA5 weather metrics locked at province grain, Dual-Hazard Flood+Burn recurrence Index 0–100 + 3×3 bivariate label).
    - Dynamic Heatmap 0.05° overlay, 143 static spots overlay, top villages overlay, hover tooltip, dynamic legend with explicit gray "ไม่มีข้อมูลต้นทาง" swatch whenever `null` exists.
    - Right analytics panel: 4 KPI cards, live Canvas Scatter Plot (selectable X/Y factors, Pearson `r`, OLS trendline, clickable dots flying to province, explicit `n/a` guard on `<3` pts or zero variance), 5-year Agri vs Forest stacked chart + Day/Night split bars, Top-10 ranked bars, dynamic Thai "อินไซต์สำคัญของพื้นที่นี้" card, CSV export with UTF-8 BOM (`\uFEFF`), Dark/Light theme toggle, Presentation Mode toggle, and Data Provenance & Caveats modal.

- [ ] **Step 4: Implement `hotspot-5y/build_interactive_map.py` and update `hotspot-5y/README.md`**
  - CLI flags: `--db`, `--era5`, `--tadih-db`, `--out` (default `hotspot-5y/data/output/hotspot_5y_interactive_map.html`), `--no-tadih`.
  - Add usage line to `hotspot-5y/README.md`.

- [ ] **Step 5: Run offline tests to verify pass**
  - Run: `.venv\Scripts\python.exe -X utf8 -m unittest hotspot-5y/tests/test_interactive_map.py -v`
  - Expected: PASS (all unit + HTML integration tests OK).

---

### Task 3: Real Production Build, Headless Browser QA, and Handoff Update

**Files:**
- Generate: `hotspot-5y/data/output/hotspot_5y_interactive_map.html` (gitignored)
- Modify: `HANDOFF.md`
- Modify: `docs/progress.md`

- [ ] **Step 1: Build real `hotspot_5y_interactive_map.html`**
  - Run: `.venv\Scripts\python.exe -X utf8 hotspot-5y/build_interactive_map.py`
  - Verify exit 0, build time `< 30s`, and output HTML size `< 25 MB` (target `~4–10 MB`).

- [ ] **Step 2: Run automated Playwright headless Chromium verification against `file:///`**
  - Test at `1440×900`, `1280×800`, and `390×844` mobile viewport:
    - Confirm `0` `console.error` and `0` `pageerror` exceptions.
    - Confirm `#mapCanvas` has non-zero bounding box and non-blank rendered pixels.
    - Test filter interactions: switch `N` ↔ `ALL` (assert warning banner appears on `ALL` and KPI total increases), switch crop to `ข้าวโพดและไร่หมุนเวียน` (assert agri/forest split reflects forest majority), switch metric to `พื้นที่เสี่ยงซ้ำซ้อน` (assert Phuket/Ranong show `ไม่มีข้อมูล` instead of `0`), switch scatter X-axis (`hot_days_38c`, `longest_dry_spell_days`, `rainfall_total_mm`, `flood_recurrence`) and verify Pearson `r` updates cleanly without `NaN`.
    - Test drill-down via search or click (`เชียงใหม่` → amphoes → amphoe `เชียงดาว` → tambons → back to Thailand), Presentation Mode toggle, Theme toggle, and CSV Export trigger.

- [ ] **Step 3: Audit code & update `HANDOFF.md` and `docs/progress.md`**
  - Review `git status` and `git diff` to ensure zero unintended edits outside `hotspot-5y/` and `docs/` / `HANDOFF.md`, no changes to `web/`, and `data/output/*.html` stays gitignored.
  - Update `HANDOFF.md` and `docs/progress.md` with exact evidence, file size, test counts, and browser QA results.
