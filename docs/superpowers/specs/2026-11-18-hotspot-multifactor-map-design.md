# Design Spec: Interactive Multi-Factor Thailand Hotspot Map (`hotspot-5y`)

**Date:** 2026-11-18  
**Size:** Medium standalone sub-project (`hotspot-5y/build_interactive_map.py` + single-file interactive HTML dashboard + offline unit/integration tests)  
**Scope:** Isolated completely from `web/` and Cloudflare D1; runs locally and opens directly in any desktop browser for self-exploration and classroom teaching.

---

## 1. Intent & Audience

- **Owner & Users:** Technical-beginner project owner using the dashboard for personal data exploration and live teaching/presentation to non-technical audiences.
- **Core Goal:** Combine GISTDA 5-year VIIRS hotspot & burn-scar/burn-frequency data (`hotspot-5y/data/hotspot_5y.duckdb`) with real local climate (`web/data/climate-history/era5-annual-2016-2025.json`) and flood-recurrence hazard (`data/local/tadih.duckdb`) into one **beautiful, full-function, single-file HTML interactive map** that opens via double-click with zero server setup and stays faithful to every data-quality caveat.

### Non-Goals & Anti-Goals

- **Non-Goals:**
  - Do NOT modify `web/`, Next.js routes, or Cloudflare D1.
  - Do NOT embed 1.27M raw hotspot point records into the HTML (use pre-aggregated 3-level polygons, 0.05° heatmap grid cells, and curated point overlays).
  - Do NOT blindly sum `DOAE` rows from `data/local/tadih.duckdb` (`latest_observations`) where `commodity_id` is opaque hashed (`doae:...`) and mixed planting rounds risk subtotal double-counting.
- **Anti-Goals:**
  - Never treat missing provinces in `gistda_burn_freq` (only 53/77 provinces) or `gistda_burn_scar` (only 57/77 provinces) as `0` — always render them as `null` ("ไม่มีข้อมูลต้นทาง GISTDA") in distinct neutral gray.
  - Never compare raw multi-satellite counts (`N + N20 + N21`) across 2022–2026 as an equal trend without defaulting to `Suomi NPP (N)` and visibly warning about the 2024–2026 3-satellite ~33% overlap and the `N` cutoff after `2026-11-01`.
  - Never make the UI unusable offline: basemap tiles load when internet is available, while **all map polygons, charts, filters, and data** are 100% self-contained (inline JS/CSS or embedded fallback) so the file works even with zero internet.

---

## 2. Verified Data Sources & Join Design

| Dataset | Source File | Grain & Coverage | Key Metrics Extracted | Caveats / Provenance Label |
|---|---|---|---|---|
| **Hotspots (5y)** | `hotspot-5y/data/hotspot_5y.duckdb` (`hotspots`) | 1,278,326 pts (`2022-01-01..2026-11-17`), 100% matched to 77 provinces / 926 amphoes / 7,658 tambons | Counts by `satellite` (`N` vs `ALL`), `year_th` (2022–2026), `jan_oct` comparable window, `landuse_group` (`agri_alro`, `forest`, `other`), `crop_type` (`rice`, `sugarcane`, `corn`, `other_agri`), `is_suspected_static`, `day_count` / `night_count`, `avg_frp_mw` | `N` ends `2026-11-01`; `1` renamed `N20` on `2024-02-27`; `ALL` has 3 satellites in 2025–2026 |
| **Boundaries (3 levels)** | `hotspot_5y.duckdb` (`dim_province`, `dim_amphoe`, `dim_tambon`) | 77 provinces / 926 amphoes / 7,658 tambons | Simplified GeoJSON (`ST_SimplifyPreserveTopology`: `0.004°` prov/amphoe, `0.0025°` tambon), spherical `area_sqkm` (`ST_Area_Spheroid(ST_FlipCoordinates(geom))/1e6`), centroids | Used for choropleth density (`pts / 100 sq.km`) & 3-level drill-down |
| **Burn Scar & Burn Freq** | `hotspot_5y.duckdb` (`gistda_burn_scar`, `gistda_burn_freq`) | `burn_scar`: 79,435 polygons / 57 provs (`20260511-20260520` window); `burn_freq`: 79,088 polygons / 53 provs | Province/amphoe/tambon `scar_rai`, `scar_agri_rai`, `scar_polys`; `freq_rai`, `avg_freq`, `freq3plus_rai` | Uncovered provinces (20 for scar, 24 for freq) MUST remain `null` |
| **Climate (ERA5)** | `web/data/climate-history/era5-annual-2016-2025.json` | 77 provinces × 2022–2025 (`approved_public`) | `rainfall_total_mm`, `tmean_c`, `tmax_mean_c`, `hot_days_38c`, `longest_dry_spell_days`, `dry_spell_events_5d` (per year 2022–2025 + 4y mean) | Province-center ERA5 grid point (`2022–2025`; 2026 annual is `null`). Stays strictly at 77-province grain — never duplicated onto amphoe/tambon |
| **Flood Recurrence (HII)** | `data/local/tadih.duckdb` (`fact_flood_risk_forecast`) | 6,434 matched tambons across 75 provinces (`pending` license; min recurrence = 1) | Tambon `max_recurrence_17yr`, `flood_months_count`, `risk_level`; rolled up to amphoe/province (`pct_high_risk_tambons`, `max_recurrence_17yr`). Unrecorded tambons (1,224) & Phuket/Ranong kept as `null` | Labeled clearly as local HII (`pending`) for internal teaching only |
| **Overlays** | `hotspot_5y.duckdb` (`v_suspected_static_hotspots`, `v_village_5y_summary`, `hotspots` 0.05° grid) | 143 static spots; top 300 villages per view (with mean lat-lon); ~0.05° grid cells | Pre-aggregated sparse grid & cube encoded via gzip+base64 (`DecompressionStream`) for full cross-filtering across satellite, year, season, crop, and static-exclusion | Keeps single HTML file compact (~4–10 MB) while fully cross-filtering overlays |

### 2.1 Settled Design Decisions (From Builder Review + Owner Approval)

1. **Composite Hazard Metric #7 (`พื้นที่เสี่ยงซ้ำซ้อน: ท่วมซ้ำ HII + เผาซ้ำ`) — Owner Choice `A`:**
   - **Burn component:** Uses **multi-year VIIRS hotspot `N` recurrence across 2022–2026** (all 77 provinces / 7,658 tambons — responds to active satellite/crop/static filters!) rather than `gistda_burn_freq` (which omits 24 provinces). Specifically: distinct active years with hotspots (`0..5` years) combined with annual hotspot density (`pts / 100 sq.km`).
   - **Flood component (`fact_flood_risk_forecast`):** Unrecorded tambons (1,224) and absent provinces (`83` Phuket, `85` Ranong) stay `null` ("ไม่มีข้อมูล HII") rather than assumed `0`; denominator for province/amphoe flood coverage uses matched HII tambons or reports `null` when none match.
   - **Scoring formula:** 3×3 bivariate risk matrix + continuous dual-hazard index `0–100` (`50%` normalized Flood recurrence rank + `50%` normalized Multi-year Burn recurrence/density rank), displayed with clear tier labels (`เสี่ยงซ้ำซ้อนสูงมาก`, `เผาหนัก/ท่วมน้อย`, `ท่วมหนัก/เผาน้อย`, `เสี่ยงต่ำ`, or gray `ไม่มีข้อมูล HII`).
2. **ERA5 Grain Integrity (Builder Call):**
   - **Spatial grain:** ERA5 stays strictly at the **77-province level**. When the user drills down into amphoes or tambons, the Scatter Plot remains locked at 77 provinces (highlighting the parent province) so Pearson `r` never collapses on duplicated child rows; if Choropleth #6 (ERA5) is active during drill-down, it shows an inline notice ("ข้อมูลอากาศ ERA5 มีเฉพาะระดับจังหวัด 77 จุดกริด") and keeps province colors visible or switches smoothly.
   - **Temporal grain:** Scatter Plot correlates `2022–2025` 4-year hotspots against `2022–2025` ERA5 when `ทั้งหมด 5 ปี` is chosen (exact 4-year alignment); when `2026` is chosen, ERA5 annual metrics show `null` ("ยังไม่มี ERA5 รายปี 2026 — ใช้ค่า 2022–2025 สำหรับเปรียบเทียบย้อนหลัง").
3. **Crop Filter Scope (`นาข้าว`, `อ้อย`, `ข้าวโพดและไร่หมุนเวียน`) — Owner Choice `A`:**
   - Filtering by crop matches `lu_hp_name` **across ALL land uses** (including the ~78% of corn hotspots inside forest zones), while KPI Card #2 and the side breakdown chart continue splitting by `lu_name` (`พื้นที่เกษตร+ส.ป.ก.` vs `ป่าไม้`) so users can teach forest encroachment vs farmland burning directly.
4. **Calendar Season Presets (Builder Call):**
   - Season slices operate strictly within the selected calendar `year_th` (`ทั้งปี / ม.ค.–ต.ค.`, `ช่วงพีค ม.ค.–เม.ย.`, `ต้นปีเกษตร ม.ค.–ก.พ.`, `ปลายปีเก็บเกี่ยว พ.ย.–ธ.ค.`) with no cross-year December wrapping; choosing `พ.ย.–ธ.ค.` auto-disables the `ม.ค.–ต.ค.` cutoff when years `2022–2025` are selected and warns cleanly if `2026` is selected with `N` (stopped `2026-11-01`).
5. **Compressed Payload & Full Cross-Filtering (Builder Call):**
   - Embed gzip+base64 compressed JSON (`zlib.compress` in Python, `DecompressionStream('gzip')` in browser) for the polygon boundaries, 7,658-tambon multi-dimensional sparse cube (`sat × year × season_bucket × crop_lu × static_flag`), 0.05° heatmap grid cells, 143 static spots, and top villages (per province + national top 300 with mean coordinates). All overlays and charts cross-filter dynamically while keeping total HTML file size compact (`~4–10 MB`).

---

## 3. Architecture & File Layout

### New & Updated Files

- `hotspot-5y/build_interactive_map.py` — Pure-Python CLI + library functions:
  - Reads `hotspot_5y.duckdb`, `era5-annual-2016-2025.json`, and `tadih.duckdb` (optional `--tadih-db` flag; if `tadih.duckdb` is absent, degrades gracefully with `flood = null`).
  - Builds compact JSON data payload (`DATA_PAYLOAD`) with strict `null` preservation, topology-simplified GeoJSON geometries separated per level (`provinces`, `amphoes`, `tambons`), pre-computed factor joins, and metadata/caveats.
  - Embeds `DATA_PAYLOAD` + self-contained HTML/CSS/JS template (rendered into `hotspot-5y/data/output/hotspot_5y_interactive_map.html` by default, overrideable via `--out`).
- `hotspot-5y/map_template.html` (or Python template module `hotspot-5y/map_assets.py` — left cleanly organized for maintainability; single output HTML remains 100% self-contained).
- `hotspot-5y/tests/test_interactive_map.py` — Offline `unittest` suite using synthetic temp DuckDB + ERA5 JSON fixtures verifying:
  - `N` vs `ALL` satellite separation and Jan–Oct comparable window calculation.
  - `null` preservation for provinces absent from `burn_freq`/`burn_scar`.
  - Spherical area normalization (`sqkm > 0`), ERA5 2022–2025 join, and HII flood join.
  - Output HTML size & validity (contains payload, handles `</script>` escaping safely, zero syntax errors when inspected).
- `hotspot-5y/README.md` — Add command to regenerate `hotspot_5y_interactive_map.html`.

### Offline-First Self-Contained Rendering Strategy

- **No network required to function:** The map polygon renderer uses a **custom high-performance HTML5 Canvas/SVG GeoJSON pan/zoom engine OR embedded Leaflet-compatible projection**, OR bundles **minified Leaflet JS/CSS** inside the HTML if cached locally / uses pure Canvas/SVG interactive map projection with optional background tile overlay when online!
- **Wait — explicit architectural decision for builder:** Rather than depending on CDN `<script>` tags (which break completely if opened offline in a training room without Wi-Fi!), build a **zero-dependency pure HTML5 Canvas + SVG interactive map & chart engine** (Mercator/equirectangular web-projection + smooth wheel/pinch zoom + drag pan + click hit-testing + crisp vector boundaries + optional live OSM/Satellite tile underlay fetched automatically only when online!).
  - Zero external CDN dependencies for JS/CSS = works 100% offline forever on any Windows/Mac browser!
  - Canvas rendering handles all **7,658 tambon polygons + heatmap + point overlays at 60 FPS** smoothly without sluggish SVG DOM nodes!

---

## 4. Full-Function Interactive UI Design

1. **Top Command Bar:**
   - Title + data freshness badge (`2022-01-01 – 2026-11-17`) + Breadcrumb drill-down (`ประเทศไทย > จังหวัด > อำเภอ`) + Global Search box (jump to any province, amphoe, or tambon) + Theme toggle (Dark Command / Light Classroom) + **Presentation Mode** button (hides sidebars for full-screen projection) + **Export CSV** button (downloads current filtered table).
2. **Left Control Drawer (Filters & Layers):**
   - **Satellite Mode:**
     - `Suomi NPP (N) — มาตรฐาน 5 ปี` *(default)* + toggle `เทียบเฉพาะ ม.ค.–ต.ค. ทุกปี (ตัดช่วง N ขาดหลัง 1 พ.ย. 2026)`
     - `รวมทุกดาวเทียม (N+N20+N21) — ความครอบคลุมสูงสุด` *(displays clear inline warning pill on 2022–2026 comparisons)*
   - **Time Filter:** Year (`ทั้งหมด 5 ปี`, `2022`, `2023`, `2024`, `2025`, `2026`) + Season/Month slice (Dry peak `ม.ค.–เม.ย.` / Pre-burn agri `ธ.ค.–ก.พ.` / All months).
   - **Land Use & Crop Filter:** `ทั้งหมด`, `เกษตร + ส.ป.ก.`, `ป่าไม้`, `นาข้าว`, `อ้อย`, `ข้าวโพดและไร่หมุนเวียน`, plus checkbox `ตัดจุดซ้ำถาวร (โรงงาน/เตาเผา ≥25 วัน)`.
   - **Map Color Metric (Choropleth):**
     1. จำนวนจุดความร้อน (`จุด`)
     2. ความหนาแน่น (`จุด / 100 ตร.กม.`)
     3. สัดส่วนเผาในเกษตร + ส.ป.ก. (`%`)
     4. รอยเผาไหม้ (`gistda_burn_scar` ไร่ · เทา = ไม่มีข้อมูล)
     5. พื้นที่เผาซ้ำซาก (`gistda_burn_freq` ไร่ · เทา = ไม่มีข้อมูล)
     6. ปัจจัยอากาศ ERA5 (`วันร้อนจัด ≥38°C`, `ช่วงแล้งติดต่อกันยาวสุด (วัน)`, `ฝนรวมทั้งปี (มม.)`)
     7. พื้นที่เสี่ยงซ้ำซ้อน (`ท่วมซ้ำ HII + เผาซ้ำ`)
   - **Map Overlays (Checkboxes):**
     - `ชั้น Heatmap ความหนาแน่น (0.05°)`
     - `จุดซ้ำถาวร (โรงงาน/เตาเผา 143 แห่ง)`
     - `หมู่บ้านใกล้จุดไฟสูงสุด (Top 300)`
     - `แผนที่พื้นหลัง (เมื่อต่อเน็ต): ไม่มี (Offline Vector) / ถนน (OSM) / ดาวเทียม (Esri) / โทนมืด (Carto)`
3. **Interactive Map Canvas (Center):**
   - Smooth zoom/pan, hover floating glass tooltip (shows area name, hotspot count, density/100 sq.km, agri vs forest %, burn scar/freq or `ไม่มีข้อมูลต้นทาง`, ERA5 climate, HII flood risk).
   - Click province → smooth zoom-to-bounds & show its amphoes; click amphoe → smooth zoom-to-bounds & show its tambons; click tambon → pin details in right panel.
   - Dynamic color legend + scale bar + clickable "กลับภาพรวมทั้งประเทศ" button.
4. **Right Multi-Factor Analytics Panel:**
   - **KPI Cards (4 cards):** Total Hotspots (with `N` vs `ALL` badge), Agri+ALRO Share %, Burn Scar Area (`ไร่` or `ไม่มีข้อมูล`), Weather/Flood Snapshot for selected area.
   - **Multi-Factor Scatter Plot (`ความสัมพันธ์ปัจจัยร่วม`):**
     - Interactive X-axis selector (`วันร้อนจัด ≥38°C`, `ช่วงแล้งยาวสุด (วัน)`, `ฝนรวมทั้งปี (มม.)`, `ระดับน้ำท่วมซ้ำ HII`, `พื้นที่รอยเผา`) vs Y-axis (`จุดความร้อน`, `ความหนาแน่นจุด/100 ตร.กม.`, `สัดส่วนเกษตร %`).
     - Computes and displays live Pearson correlation `r` and regression trendline; hovering shows province tooltip; clicking a dot flies the map directly to that province!
   - **5-Year Trend + Day/Night Split Charts:** Shows yearly Agri+ALRO vs Forest bars and Daytime (`12–14 น.`) vs Nighttime (`00–03 น.`) breakdown for current selection.
   - **Top 10 Ranked List & Teaching Insight Card:** Ranked bars of sub-areas (provinces → amphoes → tambons → villages) + dynamic plain-Thai "อินไซต์สำคัญของพื้นที่นี้" + transparent Data Provenance & Caveats modal (`ℹ ที่มาและข้อจำกัดข้อมูล`).

---

## 5. Verification Plan

1. **Automated Offline Unit Tests (`hotspot-5y/tests/test_interactive_map.py`):**
   - Synthetic DuckDB + ERA5 JSON + HII flood fixture verifying aggregation, `null` handling, density math, `</script>` safety, and HTML output generation.
   - Run full existing `hotspot-5y` suite (note known local `PROV_NAM_E` issue in pre-existing `build_db.py` test fixture; new `test_interactive_map.py` must pass 100%).
2. **Real Build & Size Check:**
   - Run `.venv\Scripts\python.exe -X utf8 hotspot-5y/build_interactive_map.py` against real `hotspot_5y.duckdb` + `era5-annual-2016-2025.json` + `tadih.duckdb`.
   - Verify generated file size is manageable (< 25 MB; target ~8–15 MB) and builds in < 30 seconds.
3. **Headless Browser Smoke Test (Playwright / Chrome headless via `file://`):**
   - Open generated `hotspot_5y_interactive_map.html` via `file:///` at desktop `1440×900` and `1280×800`: confirm `0` console errors, `0` uncaught JS exceptions, map canvas renders non-blank polygons, clicking a province drills down to amphoes, switching satellite/factor filters updates KPIs and scatter `r`, and Export CSV triggers download cleanly.
