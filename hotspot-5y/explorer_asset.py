"""Full-page DuckDB-Wasm Data Studio & SQL Lab injected into the online web app (Page 5)."""

from __future__ import annotations

EXPLORER_CSS = r"""
  .explorer-page {
    max-width: 1880px; width: 100%; min-width: 0; margin: 0 auto;
    padding: 18px clamp(12px, 1.35vw, 22px) 56px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .explorer-card {
    background: var(--card-elev); border: 1px solid var(--border); border-radius: 18px;
    display: flex; flex-direction: column; overflow: hidden; min-width: 0; max-width: 100%;
    box-shadow: var(--shadow-sm);
  }
  .preset-strip {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--card);
  }
  .preset-btn {
    padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
    border: 1px solid var(--border); background: var(--panel-solid); color: var(--text);
    cursor: pointer; font-family: inherit; transition: border-color .15s, background .15s, transform .12s;
  }
  .preset-btn:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); transform: translateY(-1px); }
  .explorer-filters {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: 10px;
    padding: 15px 20px; border-bottom: 1px solid var(--border); background: var(--panel-solid);
    align-items: end;
  }
  .explorer-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    padding: 10px 20px; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--muted);
  }
  .explorer-sql-box {
    padding: 11px 20px; border-bottom: 1px solid var(--border); background: var(--card);
  }
  .explorer-sql-box textarea {
    width: 100%; min-height: 96px; font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; font-size: 12.5px;
    background: var(--bg); color: var(--text); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 12px; resize: vertical; line-height: 1.55;
  }
  .explorer-table-wrap {
    max-height: 540px; overflow: auto; max-width: 100%; min-width: 0;
  }
  .explorer-table {
    width: 100%; border-collapse: collapse; font-size: 12.5px;
  }
  .explorer-table th {
    position: sticky; top: 0; background: var(--panel-solid); color: var(--muted);
    text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border);
    white-space: nowrap; font-weight: 700; z-index: 2;
  }
  .explorer-table td {
    padding: 8.5px 12px; border-bottom: 1px solid rgba(148,163,184,0.11);
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .explorer-table tbody tr:nth-child(even) td { background: rgba(148,163,184,0.03); }
  .explorer-table tr:hover td { background: var(--accent-soft); }
  .explorer-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    padding: 11px 20px; border-top: 1px solid var(--border); background: var(--card); font-size: 12.5px;
  }
  @media (max-width: 1080px) {
    .explorer-page { padding: 14px 12px 34px; }
    .preset-strip, .explorer-filters, .explorer-bar, .explorer-sql-box, .explorer-foot { padding-left: 14px; padding-right: 14px; }
  }
"""

EXPLORER_BUTTON_HTML = (
    '<button id="openExplorerBtn" class="nav-tab" data-page="explorer" '
    'title="ค้นหาข้อมูลดิบ 1.28 ล้านจุด สภาพอากาศ และรอยเผาไหม้ตรงจาก Hugging Face ด้วย DuckDB-Wasm">'
    'ค้นและดาวน์โหลดข้อมูล</button>'
)

EXPLORER_MODAL_HTML = r"""
<section id="page-explorer" class="page-view">
  <div id="explorerModal" class="explorer-page">
    <div class="hero-banner">
      <div class="hero-row">
        <div>
          <h1 class="hero-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span>ค้นและดาวน์โหลดข้อมูล</span>
            <span id="expEngineBadge" class="badge">พร้อมโหลดเมื่อกดค้นหา</span>
          </h1>
          <p class="hero-desc">
            เลือกชุดข้อมูล พื้นที่ และช่วงเวลา แล้วกดค้นหา หรือใช้ปุ่มค้นหาด่วนเพื่อเริ่มจากตัวอย่าง
          </p>
        </div>
        <div class="hero-actions">
          <a id="expHfLink" class="btn" href="https://huggingface.co/datasets/__HF_REPO__" target="_blank" rel="noopener" style="text-decoration:none;">เปิดชุดข้อมูลบน Hugging Face</a>
          <button id="expCsvBtn" class="btn primary" title="ดาวน์โหลดผลที่กรองทั้งหมดเป็น CSV (สูงสุด 50,000 แถว)">ดาวน์โหลด CSV</button>
        </div>
      </div>
    </div>

    <div class="explorer-card">

      <div class="preset-strip">
        <span style="font-size:11.5px;font-weight:700;color:var(--muted);">ค้นหาด่วน</span>
        <button class="preset-btn" data-preset="top_villages">หมู่บ้านใกล้จุดความร้อนมากในปี 2569</button>
        <button class="preset-btn" data-preset="top_pm25_days">วันที่ฝุ่น PM2.5 พุ่งสูงสุด</button>
        <button class="preset-btn" data-preset="gms_compare">เทียบจุดความร้อนใน 6 ประเทศ (2565–2568)</button>
        <button class="preset-btn" data-preset="burn_vs_planted">พื้นที่รอยเผาเทียบพื้นที่ปลูก</button>
        <button class="preset-btn" data-preset="dry_soil_fire">จังหวัดที่ดินแห้งและฝุ่นสูง</button>
        <button class="preset-btn" data-preset="top_rice">ตำบลเผานาข้าวสูงสุด (ฤดู 2569)</button>
        <button class="preset-btn" data-preset="top_corn">ตำบลเผาข้าวโพดสูงสุด (ฤดู 2569)</button>
        <button class="preset-btn" data-preset="hot_months">เดือนที่อากาศเอื้อไฟแรงสุด (FWI)</button>
        <button class="preset-btn" data-preset="static_spots">แหล่งความร้อนที่พบซ้ำตั้งแต่ 25 วัน</button>
      </div>

      <div class="explorer-filters">
        <div>
          <label class="field-label" for="expTable">ชุดข้อมูล</label>
          <select id="expTable">
            <option value="hotspots" selected>จุดความร้อนรายวัน VIIRS (1.28 ล้านจุด)</option>
            <option value="live_hotspots_7d">จุดความร้อนจากชุดบันทึก GISTDA 7 วัน</option>
            <option value="tmd_wrf">พยากรณ์อากาศ 3 กม. กรมอุตุฯ TMD WRF (77 จว.)</option>
            <option value="air_quality_daily">ฝุ่น PM2.5 &amp; อากาศรายวัน 77 จว. (CAMS 120,813 แถว)</option>
            <option value="lghap_pm25">ค่าประมาณ PM2.5 รายตำบล (LGHAP v2)</option>
            <option value="geos_cf_pm25">PM2.5 จากกริดอ้างตำแหน่งตำบล (NASA GEOS-CF)</option>
            <option value="air_quality_monthly">ฝุ่น PM2.5 &amp; วันเกินเกณฑ์รายเดือน 77 จว.</option>
            <option value="transboundary">จุดความร้อนในไทยและประเทศเพื่อนบ้าน (NASA FIRMS)</option>
            <option value="nasa_soil">ความชื้นดิน &amp; แสงอาทิตย์รายวัน (NASA POWER 137,060 แถว)</option>
            <option value="doae_crops">พื้นที่เพาะปลูกพืชรายตำบล (DOAE 235,082 แถว)</option>
            <option value="rid_reservoirs">ปริมาณน้ำ 461 อ่างเก็บน้ำรายเดือน (RID)</option>
            <option value="oae_prices">ราคาสินค้าเกษตรรายเดือน (สศก./NABC)</option>
            <option value="weather">สภาพอากาศเอื้อไฟ ERA5 รายเดือน (77 จว.)</option>
            <option value="tamroypao">รอยเผา สสน. รายตำบล (19,023 แถว)</option>
            <option value="burn_scar">รอยเผาไหม้ GISTDA (79,435 แปลง)</option>
            <option value="burn_freq">พื้นที่เผาซ้ำซาก GISTDA (79,088 แปลง)</option>
          </select>
        </div>
        <div id="expYearWrap">
          <label class="field-label" for="expYear">ปี (ค.ศ.)</label>
          <select id="expYear">
            <option value="2026" selected>2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="expProv">จังหวัด</label>
          <select id="expProv">
            <option value="all" selected>ทุกจังหวัด</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="expKeyword">ค้นหา อำเภอ / ตำบล / หมู่บ้าน</label>
          <input id="expKeyword" class="search-input" style="width:100%" type="search" placeholder="เช่น แม่แจ่ม, ศรีภูมิ, บ้าน..." />
        </div>
        <div id="expSatWrap">
          <label class="field-label" for="expSat">ดาวเทียม</label>
          <select id="expSat">
            <option value="ALL" selected>ทุกดาวเทียม</option>
            <option value="N">เฉพาะ Suomi NPP (N)</option>
          </select>
        </div>
        <div id="expDateFromWrap">
          <label class="field-label" for="expDateFrom">ตั้งแต่วันที่</label>
          <input id="expDateFrom" class="search-input" style="width:100%" type="date" />
        </div>
        <div id="expDateToWrap">
          <label class="field-label" for="expDateTo">ถึงวันที่</label>
          <input id="expDateTo" class="search-input" style="width:100%" type="date" />
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="expRunBtn" class="btn primary" style="width:100%;justify-content:center;">ค้นหา</button>
        </div>
      </div>

      <p id="expPm25Coverage" style="padding:0 20px;font-size:13px;color:var(--muted)" hidden>
        <span id="expPm25Dates"></span> · <a id="expPm25Credit"></a>
      </p>
      <div class="explorer-bar">
        <div id="expStatus">เลือกข้อมูลด้านบนแล้วกดค้นหา</div>
        <label class="check-row" style="font-size:12px;">
          <input id="expExcludeStatic" type="checkbox" checked />
          <span>ซ่อนแหล่งความร้อนที่พบซ้ำตั้งแต่ 25 วัน</span>
        </label>
      </div>

      <details id="expSqlDetails" class="explorer-sql-box">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--muted);">คำสั่งค้นหาขั้นสูง (SQL)</summary>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
          <textarea id="expSqlInput" spellcheck="false"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11.5px;color:var(--muted);">ใช้คำสั่ง SELECT เพื่ออ่านข้อมูลได้</span>
            <button id="expRunSqlBtn" class="btn primary">ค้นด้วยคำสั่งนี้</button>
          </div>
        </div>
      </details>

      <div class="explorer-table-wrap" role="region" tabindex="0" aria-label="ตารางผลการค้นหา">
        <table class="explorer-table">
          <thead id="expThead"></thead>
          <tbody id="expTbody">
            <tr><td style="padding:36px;text-align:center;color:var(--muted);">กด <strong>ค้นหา</strong> หรือเลือกหัวข้อค้นหาด่วน</td></tr>
          </tbody>
        </table>
      </div>

      <div class="explorer-foot">
        <div id="expPageInfo">หน้า 0 / 0</div>
        <div style="display:flex;gap:8px;">
          <button id="expPrevBtn" class="btn" disabled>◀ ก่อนหน้า</button>
          <button id="expNextBtn" class="btn" disabled>ถัดไป ▶</button>
        </div>
      </div>
    </div>
  </div>
</section>
"""

EXPLORER_JS = r"""
  // =========================================================================
  // Page 5: DuckDB-Wasm Remote Parquet Data Studio (loads lazily on demand)
  // =========================================================================
  const HF_REPO = "__HF_REPO__";
  const HF_BASE = `https://huggingface.co/datasets/${HF_REPO}/resolve/main`;
  const PM25_ARCHIVES = {
    lghap_pm25: {folder: "lghap", day: "source_date", grid: "0.01°", credit: "LGHAP v2 โดย Bai และคณะ (CC BY 4.0)", url: "https://doi.org/10.5194/essd-16-2425-2024"},
    geos_cf_pm25: {folder: "geos_cf", day: "local_date", grid: "0.25° (หลายตำบลอาจใช้ช่องเดียวกัน)", credit: "NASA/GSFC GEOS-CF", url: "https://data.nasa.gov/dataset/geos-cf-composition-forecast"},
  };
  const PAGE_SIZE = 50;
  let DUCK_DB = null;
  let DUCK_CONN = null;
  let DUCK_INIT_PROMISE = null;
  const expState = { page: 0, totalRows: 0, lastBaseSql: "", lastCols: [], customSql: null };

  const expEls = {
    openBtn: document.getElementById("openExplorerBtn"),
    badge: document.getElementById("expEngineBadge"),
    table: document.getElementById("expTable"),
    yearWrap: document.getElementById("expYearWrap"),
    year: document.getElementById("expYear"),
    prov: document.getElementById("expProv"),
    keyword: document.getElementById("expKeyword"),
    satWrap: document.getElementById("expSatWrap"),
    sat: document.getElementById("expSat"),
    dateFromWrap: document.getElementById("expDateFromWrap"),
    dateToWrap: document.getElementById("expDateToWrap"),
    dateFrom: document.getElementById("expDateFrom"),
    dateTo: document.getElementById("expDateTo"),
    pm25Coverage: document.getElementById("expPm25Coverage"),
    pm25Dates: document.getElementById("expPm25Dates"),
    pm25Credit: document.getElementById("expPm25Credit"),
    exclStatic: document.getElementById("expExcludeStatic"),
    runBtn: document.getElementById("expRunBtn"),
    csvBtn: document.getElementById("expCsvBtn"),
    status: document.getElementById("expStatus"),
    sqlDetails: document.getElementById("expSqlDetails"),
    sqlInput: document.getElementById("expSqlInput"),
    runSqlBtn: document.getElementById("expRunSqlBtn"),
    thead: document.getElementById("expThead"),
    tbody: document.getElementById("expTbody"),
    pageInfo: document.getElementById("expPageInfo"),
    prevBtn: document.getElementById("expPrevBtn"),
    nextBtn: document.getElementById("expNextBtn"),
  };

  function sqlStr(v) {
    return "'" + String(v ?? "").replace(/'/g, "''") + "'";
  }

  async function ensureDuckDb() {
    if (DUCK_CONN) return DUCK_CONN;
    if (DUCK_INIT_PROMISE) return DUCK_INIT_PROMISE;
    DUCK_INIT_PROMISE = (async () => {
      expEls.badge.textContent = "กำลังโหลด DuckDB-Wasm (~3 MB)...";
      const duckdb = await import("https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm");
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      const workerBlob = new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" });
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);
      const conn = await db.connect();
      DUCK_DB = db;
      DUCK_CONN = conn;
      expEls.badge.textContent = "DuckDB-Wasm พร้อมใช้งาน";
      return conn;
    })().catch((err) => {
      DUCK_INIT_PROMISE = null;
      expEls.badge.textContent = "โหลด DuckDB ไม่สำเร็จ";
      throw err;
    });
    return DUCK_INIT_PROMISE;
  }

  function populateExplorerProvinces() {
    if (!expEls.prov || expEls.prov.options.length > 1 || !DATA) return;
    const sorted = DATA.provinces.slice().sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));
    for (const p of sorted) {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.textContent = `${p.name_th} (${p.code})`;
      expEls.prov.appendChild(opt);
    }
  }

  function syncExplorerFilterVisibility() {
    if (!expEls.table) return;
    const t = expEls.table.value;
    const isHot = t === "hotspots";
    const isLghap = t === "lghap_pm25";
    const isPm25Archive = Object.hasOwn(PM25_ARCHIVES,t);
    const hasYear = isPm25Archive || ["hotspots", "tamroypao", "weather", "air_quality_daily", "air_quality_monthly", "transboundary", "nasa_soil", "rid_reservoirs"].includes(t);
    const hasDates = isPm25Archive || ["hotspots", "air_quality_daily", "nasa_soil"].includes(t);
    const hasProv = !["transboundary", "rid_reservoirs", "oae_prices", "live_hotspots_7d"].includes(t);
    expEls.yearWrap.style.display = hasYear ? "block" : "none";
    expEls.satWrap.style.display = isHot ? "block" : "none";
    expEls.dateFromWrap.style.display = hasDates ? "block" : "none";
    expEls.dateToWrap.style.display = hasDates ? "block" : "none";
    if (expEls.prov && expEls.prov.parentElement) expEls.prov.parentElement.style.display = hasProv ? "block" : "none";
    expEls.exclStatic.parentElement.style.display = isHot ? "flex" : "none";
    for (const option of expEls.year.options) {
      option.hidden = (isLghap && Number(option.value) > 2024) || (t === "geos_cf_pm25" && Number(option.value) < 2025);
    }
    if (isLghap && Number(expEls.year.value) > 2024) expEls.year.value = "2022";
    if (t === "geos_cf_pm25" && Number(expEls.year.value) < 2025) expEls.year.value = "2026";
    expEls.pm25Coverage.hidden = true;
  }

  function buildExplorerSql() {
    const t = expEls.table.value;
    const prov = expEls.prov.value;
    const kw = expEls.keyword.value.trim();
    const yr = expEls.year.value;
    const where = [];

    if (t === "live_hotspots_7d") {
      const url = `${HF_BASE}/parquet/gistda_live_hotspots_7d.parquet`;
      if (kw) {
        const pat = sqlStr("%" + kw + "%");
        where.push(`(coalesce(country, '') ILIKE ${pat} OR coalesce(pv_tn, '') ILIKE ${pat} OR coalesce(ap_tn, '') ILIKE ${pat} OR coalesce(tb_tn, '') ILIKE ${pat})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT window_tag AS "ช่วง", acq_date AS "วันที่", acq_time AS "เวลา", country AS "ประเทศ", pv_tn AS "จังหวัด", ap_tn AS "อำเภอ", tb_tn AS "ตำบล", lu_name AS "การใช้ที่ดิน", satellite AS "ดาวเทียม", frp_mw AS "FRP(MW)", lat AS "Lat", lon AS "Lon"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY window_tag ASC, acq_date DESC, frp_mw DESC NULLS LAST`;
    }

    if (t === "tmd_wrf") {
      const url = `${HF_BASE}/parquet/tmd_wrf_forecast_77prov.parquet`;
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (kw) where.push(`coalesce(prov_name_th, '') ILIKE ${sqlStr("%" + kw + "%")}`);
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT forecast_date AS "วันที่พยากรณ์", prov_name_th AS "จังหวัด", tc_max AS "สูงสุด(°C)", tc_min AS "ต่ำสุด(°C)", rh_pct AS "ความชื้น(%)", rain_mm AS "ฝน(มม.)", fwi_tmd AS "ดัชนีเอื้อไฟ(FWI)", cond_label_th AS "สภาพอากาศ(WRF 3กม.)"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY forecast_date ASC, fwi_tmd DESC NULLS LAST`;
    }

    if (t === "hotspots") {
      const url = `${HF_BASE}/parquet/hotspots_${yr}.parquet`;
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (expEls.sat.value === "N") where.push(`satellite = 'N'`);
      if (expEls.exclStatic.checked) where.push(`NOT is_suspected_static`);
      if (expEls.dateFrom.value) where.push(`acq_date_th >= ${sqlStr(expEls.dateFrom.value)}`);
      if (expEls.dateTo.value) where.push(`acq_date_th <= ${sqlStr(expEls.dateTo.value)}`);
      if (kw) {
        const pat = sqlStr("%" + kw + "%");
        where.push(`(amphoe_name_th ILIKE ${pat} OR tambon_name_th ILIKE ${pat} OR coalesce(village_name, '') ILIKE ${pat})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT acq_date_th AS "วันที่", th_time AS "เวลา", prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", village_name AS "หมู่บ้านใกล้สุด", lu_name AS "การใช้ที่ดิน", lu_hp_name AS "พืช", satellite AS "ดาวเทียม", frp_mw AS "FRP(MW)", latitude AS "Lat", longitude AS "Lon"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY acq_date_th DESC, th_time DESC`;
    }

    if (t === "lghap_pm25") {
      const url = `${HF_BASE}/parquet/lghap/pm25_tambon_lghap_${yr}.parquet`;
      const areas = `${HF_BASE}/parquet/dim_areas.parquet`;
      if (prov !== "all") where.push(`p.prov_code = ${sqlStr(prov)}`);
      if (expEls.dateFrom.value) where.push(`p.source_date >= ${sqlStr(expEls.dateFrom.value)}`);
      if (expEls.dateTo.value) where.push(`p.source_date <= ${sqlStr(expEls.dateTo.value)}`);
      if (kw) {
        const pattern = sqlStr("%" + kw + "%");
        where.push(`(a.amphoe_name_th ILIKE ${pattern} OR a.tambon_name_th ILIKE ${pattern} OR p.tambon_code = ${sqlStr(kw)})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT CAST(p.source_date AS VARCHAR) AS "วันที่ต้นทาง", a.prov_name_th AS "จังหวัด", a.amphoe_name_th AS "อำเภอ", a.tambon_name_th AS "ตำบล", p.tambon_code AS "รหัสตำบล", round(p.pm25_ug_m3::DOUBLE,2) AS "ค่าประมาณ PM2.5 (µg/m³)", p.valid_cells AS "ช่องกริดที่มีค่า", p.polygon_cells AS "ช่องกริดในตำบล"\nFROM read_parquet(${sqlStr(url)}) AS p\nLEFT JOIN read_parquet(${sqlStr(areas)}) AS a USING (tambon_code)\n${wSql}\nORDER BY p.source_date DESC, p.tambon_code`;
    }

    if (t === "geos_cf_pm25") {
      const dir = `${HF_BASE}/parquet/geos_cf`;
      if (prov !== "all") where.push(`g.prov_code = ${sqlStr(prov)}`);
      if (expEls.dateFrom.value) where.push(`p.local_date >= ${sqlStr(expEls.dateFrom.value)}`);
      if (expEls.dateTo.value) where.push(`p.local_date <= ${sqlStr(expEls.dateTo.value)}`);
      if (kw) {
        const pattern = sqlStr("%" + kw + "%");
        where.push(`(a.amphoe_name_th ILIKE ${pattern} OR a.tambon_name_th ILIKE ${pattern} OR g.tambon_code = ${sqlStr(kw)})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT CAST(p.local_date AS VARCHAR) AS "วันที่ไทย", a.prov_name_th AS "จังหวัด", a.amphoe_name_th AS "อำเภอ", a.tambon_name_th AS "ตำบล", g.tambon_code AS "รหัสตำบล", round(p.pm25_ug_m3::DOUBLE,2) AS "ค่าประมาณ PM2.5 จากกริด (µg/m³)", p.valid_hours AS "ชั่วโมงที่มีค่า", p.model_version AS "รุ่นแบบจำลอง", p.grid_y/4.0-90 AS "ละติจูดกริด", p.grid_x/4.0-180 AS "ลองจิจูดกริด"\nFROM read_parquet(${sqlStr(`${dir}/pm25_geos_cf_grid_${yr}.parquet`)}) AS p\nJOIN read_parquet(${sqlStr(`${dir}/tambon_grid_lookup.parquet`)}) AS g USING (grid_y,grid_x)\nLEFT JOIN read_parquet(${sqlStr(`${HF_BASE}/parquet/dim_areas.parquet`)}) AS a USING (tambon_code)\n${wSql}\nORDER BY p.local_date DESC, g.tambon_code`;
    }

    if (t === "air_quality_daily") {
      const url = `${HF_BASE}/parquet/air_quality_daily_77prov.parquet`;
      if (yr) where.push(`year_th = ${Number(yr)}`);
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (expEls.dateFrom.value) where.push(`date >= ${sqlStr(expEls.dateFrom.value)}`);
      if (expEls.dateTo.value) where.push(`date <= ${sqlStr(expEls.dateTo.value)}`);
      if (kw) where.push(`coalesce(prov_name_th, '') ILIKE ${sqlStr("%" + kw + "%")}`);
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT date AS "วันที่", prov_name_th AS "จังหวัด", pm25_mean AS "PM2.5เฉลี่ย", pm25_max AS "PM2.5สูงสุด", pm10_mean AS "PM10", co_mean AS "CO", aod_mean AS "AOD", us_aqi_max AS "US_AQI", hours_gt_37_5 AS "ชม.>37.5"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY date DESC, pm25_mean DESC NULLS LAST`;
    }

    if (t === "air_quality_monthly") {
      const url = `${HF_BASE}/parquet/air_quality_monthly_77prov.parquet`;
      if (yr) where.push(`year_th = ${Number(yr)}`);
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (kw) where.push(`coalesce(prov_name_th, '') ILIKE ${sqlStr("%" + kw + "%")}`);
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT ym AS "เดือน", prov_name_th AS "จังหวัด", pm25_mean AS "PM2.5เฉลี่ย", pm25_p90 AS "PM2.5_P90", pm25_max AS "PM2.5สูงสุด", co_mean AS "COเฉลี่ย", aod_mean AS "AOD", days_exceed_37_5 AS "วันเกิน37.5(ไทย)", days_exceed_15_who AS "วันเกิน15(WHO)"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY pm25_mean DESC NULLS LAST, ym DESC`;
    }

    if (t === "transboundary") {
      const fYr = Number(yr) >= 2022 && Number(yr) <= 2025 ? Number(yr) : 2025;
      const url = `${HF_BASE}/parquet/transboundary_firms_${fYr}.parquet`;
      if (kw) where.push(`country ILIKE ${sqlStr("%" + kw + "%")}`);
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT country AS "ประเทศ", acq_date AS "วันที่", acq_time AS "เวลาUTC", latitude AS "Lat", longitude AS "Lon", frp_mw AS "FRP(MW)", confidence AS "ความเชื่อมั่น", daynight AS "กลางวัน/คืน"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY acq_date DESC, frp_mw DESC`;
    }

    if (t === "nasa_soil") {
      const url = `${HF_BASE}/parquet/nasa_power_soil_daily_77prov.parquet`;
      if (yr) where.push(`year_th = ${Number(yr)}`);
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (expEls.dateFrom.value) where.push(`date >= ${sqlStr(expEls.dateFrom.value)}`);
      if (expEls.dateTo.value) where.push(`date <= ${sqlStr(expEls.dateTo.value)}`);
      if (kw) where.push(`coalesce(prov_name_th, '') ILIKE ${sqlStr("%" + kw + "%")}`);
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT date AS "วันที่", prov_name_th AS "จังหวัด", gwettop AS "ความชื้นผิวดิน(0-1)", gwetroot AS "ความชื้นรากพืช(0-1)", solar_mj AS "แสงอาทิตย์(MJ/m2)", dewpoint_c AS "จุดน้ำค้าง(°C)", ws10m_ms AS "ลม(m/s)"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY date DESC, gwettop ASC NULLS LAST`;
    }

    if (t === "doae_crops") {
      const url = `${HF_BASE}/parquet/doae_crop_tambon.parquet`;
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (kw) {
        const pat = sqlStr("%" + kw + "%");
        where.push(`(coalesce(crop_name, '') ILIKE ${pat} OR coalesce(amphoe_name_th, '') ILIKE ${pat} OR coalesce(tambon_name_th, '') ILIKE ${pat})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT source_year_be AS "ปีข้อมูล(พ.ศ.)", prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", crop_name AS "ชนิดพืช", variety_name AS "พันธุ์", crop_group AS "กลุ่มพืช", planted_rai AS "เนื้อที่ปลูก(ไร่)", harvested_rai AS "เก็บเกี่ยว(ไร่)", production_kg AS "ผลผลิต(กก.)"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY planted_rai DESC NULLS LAST`;
    }

    if (t === "rid_reservoirs") {
      const url = `${HF_BASE}/parquet/rid_reservoirs_monthly_2022_2026.parquet`;
      if (yr) where.push(`year_th = ${Number(yr)}`);
      if (kw) {
        const pat = sqlStr("%" + kw + "%");
        where.push(`(coalesce(reservoir_name, '') ILIKE ${pat} OR coalesce(region, '') ILIKE ${pat})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT snapshot_date AS "วันที่", region AS "ภาค", reservoir_name AS "อ่างเก็บน้ำ", storage_mcm AS "ความจุ(ล้านลบ.ม.)", volume_mcm AS "น้ำปัจจุบัน(ล้านลบ.ม.)", percent_storage AS "%ความจุ", inflow AS "น้ำไหลเข้า", outflow AS "ระบายออก"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY snapshot_date DESC, storage_mcm DESC NULLS LAST`;
    }

    if (t === "oae_prices") {
      const url = `${HF_BASE}/parquet/oae_monthly_crop_prices.parquet`;
      if (kw) where.push(`coalesce(commodity_name, '') ILIKE ${sqlStr("%" + kw + "%")}`);
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT observed_date AS "วันที่", commodity_name AS "สินค้าเกษตร", unit AS "หน่วย", price_value AS "ราคาเฉลี่ยประเทศ"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY observed_date DESC, commodity_name ASC`;
    }

    if (t === "weather") {
      const url = `${HF_BASE}/parquet/era5_monthly_fire_weather.parquet`;
      if (yr) where.push(`year_th = ${Number(yr)}`);
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (kw) where.push(`coalesce(prov_name_th, '') ILIKE ${sqlStr("%" + kw + "%")}`);
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT ym AS "เดือน", prov_name_th AS "จังหวัด", fire_weather_index AS "ดัชนีเอื้อไฟ(FWI)", tmax_mean_c AS "สูงสุดเฉลี่ย(°C)", tmax_peak_c AS "สูงสุดพีค(°C)", rh_min_mean_pct AS "ความชื้นต่ำสุด(%)", low_rh_days_35pct AS "วันแห้งจัด(<35%)", rain_mm AS "ฝนรวม(มม.)", dry_days AS "วันไม่ตกฝน", wind_max_mean_kmh AS "ลมเฉลี่ย(กม./ชม.)", et0_sum_mm AS "การระเหยET0(มม.)"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY fire_weather_index DESC, ym DESC`;
    }

    if (t === "tamroypao") {
      const url = `${HF_BASE}/parquet/tamroypao_burn_tambon.parquet`;
      if (["2024", "2025", "2026"].includes(yr)) where.push(`year_th = ${Number(yr)}`);
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (kw) {
        const pat = sqlStr("%" + kw + "%");
        where.push(`(coalesce(amphoe_name_th, '') ILIKE ${pat} OR coalesce(tambon_name_th, '') ILIKE ${pat})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT season_be AS "ฤดู(พ.ศ.)", year_th AS "ปี", prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", paddy_rai AS "ข้าว(ไร่)", sugarcane_rai AS "อ้อย(ไร่)", corn_rai AS "ข้าวโพด(ไร่)", mixed_rai AS "ผสม(ไร่)", forest_rai AS "ป่า(ไร่)", total_rai AS "รวม(ไร่)"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY total_rai DESC`;
    }

    if (t === "burn_scar") {
      const url = `${HF_BASE}/parquet/gistda_burn_scar.parquet`;
      if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
      if (kw) {
        const pat = sqlStr("%" + kw + "%");
        where.push(`(coalesce(amphoe_name_th, '') ILIKE ${pat} OR coalesce(tambon_name_th, '') ILIKE ${pat})`);
      }
      const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return `SELECT prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", rp_name AS "ประเภทพื้นที่", lu_name AS "การใช้ที่ดิน", area_rai AS "พื้นที่(ไร่)", date_range AS "ช่วงวันที่", centroid_lat AS "Lat", centroid_lon AS "Lon"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY area_rai DESC`;
    }

    const url = `${HF_BASE}/parquet/gistda_burn_freq.parquet`;
    if (prov !== "all") where.push(`prov_code = ${sqlStr(prov)}`);
    if (kw) {
      const pat = sqlStr("%" + kw + "%");
      where.push(`(coalesce(amphoe_name_th, '') ILIKE ${pat} OR coalesce(tambon_name_th, '') ILIKE ${pat})`);
    }
    const wSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return `SELECT prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", freq AS "ความถี่(ปี)", area_rai AS "พื้นที่(ไร่)", y2017, y2023, y2024, y2025, centroid_lat AS "Lat", centroid_lon AS "Lon"\nFROM read_parquet(${sqlStr(url)})\n${wSql}\nORDER BY freq DESC, area_rai DESC`;
  }

  const PRESET_SQLS = {
    top_villages: () => `SELECT prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", village_name AS "หมู่บ้านใกล้สุด", count(*) AS "จุดไฟ(2026)", round(avg(frp_mw), 1) AS "FRPเฉลี่ย(MW)"\nFROM read_parquet('${HF_BASE}/parquet/hotspots_2026.parquet')\nWHERE NOT is_suspected_static AND village_name IS NOT NULL\nGROUP BY 1,2,3,4\nORDER BY 5 DESC\nLIMIT 20`,
    top_pm25_days: () => `SELECT date AS "วันที่", prov_name_th AS "จังหวัด", pm25_mean AS "PM2.5เฉลี่ย", pm25_max AS "PM2.5สูงสุด", co_mean AS "CO", aod_mean AS "AOD", us_aqi_max AS "US_AQI"\nFROM read_parquet('${HF_BASE}/parquet/air_quality_daily_77prov.parquet')\nORDER BY pm25_mean DESC NULLS LAST\nLIMIT 30`,
    gms_compare: () => `SELECT country AS "ประเทศ", year_th AS "ปี", sum(hotspot_count) AS "จุดไฟ(VIIRS-N)", sum(high_conf_count) AS "ความเชื่อมั่นสูง", round(sum(frp_sum_mw), 0) AS "FRPรวม(MW)"\nFROM read_parquet('${HF_BASE}/parquet/transboundary_monthly.parquet')\nGROUP BY 1,2\nORDER BY 2 DESC, 3 DESC`,
    burn_vs_planted: () => `WITH trp AS (SELECT prov_code, sum(paddy_rai) AS burn_paddy, sum(sugarcane_rai) AS burn_sugar, sum(corn_rai) AS burn_corn FROM read_parquet('${HF_BASE}/parquet/tamroypao_burn_tambon.parquet') WHERE year_th = 2026 GROUP BY 1)\nSELECT d.prov_name_th AS "จังหวัด", round(t.burn_paddy,0) AS "เผาข้าว(ไร่)", round(d.paddy_rai,0) AS "ปลูกข้าว2566(ไร่)", round(t.burn_paddy*100.0/nullif(d.paddy_rai,0),1) AS "%เผาข้าว", round(t.burn_sugar,0) AS "เผาอ้อย(ไร่)", round(d.sugarcane_rai,0) AS "ปลูกอ้อย(ไร่)", round(t.burn_sugar*100.0/nullif(d.sugarcane_rai,0),1) AS "%เผาอ้อย"\nFROM read_parquet('${HF_BASE}/parquet/doae_fire_crops_province.parquet') d\nJOIN trp t ON t.prov_code = d.prov_code\nORDER BY 2 DESC NULLS LAST\nLIMIT 30`,
    dry_soil_fire: () => `SELECT s.ym AS "เดือน", s.prov_name_th AS "จังหวัด", s.gwettop_mean AS "ความชื้นผิวดิน", s.dry_soil_days_lt_035 AS "วันดินแห้งจัด", a.pm25_mean AS "PM2.5เฉลี่ย", a.days_exceed_37_5 AS "วันฝุ่นเกิน37.5"\nFROM read_parquet('${HF_BASE}/parquet/nasa_power_soil_monthly_77prov.parquet') s\nJOIN read_parquet('${HF_BASE}/parquet/air_quality_monthly_77prov.parquet') a ON a.prov_code = s.prov_code AND a.ym = s.ym\nWHERE s.month_th BETWEEN 1 AND 4 AND s.gwettop_mean IS NOT NULL\nORDER BY s.gwettop_mean ASC, a.pm25_mean DESC NULLS LAST\nLIMIT 30`,
    top_rice: () => `SELECT prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", paddy_rai AS "นาข้าว(ไร่)", total_rai AS "รวมทั้งหมด(ไร่)"\nFROM read_parquet('${HF_BASE}/parquet/tamroypao_burn_tambon.parquet')\nWHERE year_th = 2026\nORDER BY paddy_rai DESC\nLIMIT 30`,
    top_corn: () => `SELECT prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", corn_rai AS "ข้าวโพด(ไร่)", forest_rai AS "ป่าไม้(ไร่)", total_rai AS "รวม(ไร่)"\nFROM read_parquet('${HF_BASE}/parquet/tamroypao_burn_tambon.parquet')\nWHERE year_th = 2026\nORDER BY corn_rai DESC\nLIMIT 30`,
    hot_months: () => `SELECT ym AS "เดือน", prov_name_th AS "จังหวัด", fire_weather_index AS "ดัชนีเอื้อไฟ(FWI)", tmax_mean_c AS "สูงสุดเฉลี่ย(°C)", rh_min_mean_pct AS "ความชื้นต่ำสุด(%)", low_rh_days_35pct AS "วันแห้งจัด(<35%)", rain_mm AS "ฝนรวม(มม.)"\nFROM read_parquet('${HF_BASE}/parquet/era5_monthly_fire_weather.parquet')\nORDER BY fire_weather_index DESC\nLIMIT 30`,
    static_spots: () => `SELECT prov_name_th AS "จังหวัด", amphoe_name_th AS "อำเภอ", tambon_name_th AS "ตำบล", lu_name AS "การใช้ที่ดิน", count(*) AS "จำนวนจุดซ้ำ", round(avg(latitude),4) AS "Lat", round(avg(longitude),4) AS "Lon"\nFROM read_parquet('${HF_BASE}/parquet/hotspots_2026.parquet')\nWHERE is_suspected_static\nGROUP BY 1,2,3,4\nORDER BY 5 DESC\nLIMIT 30`,
  };

  function arrowTableToRows(arrowTbl) {
    const cols = arrowTbl.schema.fields.map(f => f.name);
    const rows = [];
    for (let i = 0; i < arrowTbl.numRows; i++) {
      const obj = arrowTbl.get(i);
      const row = [];
      for (const c of cols) {
        let v = obj[c];
        if (typeof v === "bigint") v = Number(v);
        row.push(v);
      }
      rows.push(row);
    }
    return { cols, rows };
  }

  function renderExplorerTable(cols, rows) {
    expEls.thead.innerHTML = `<tr>${cols.map(c => `<th>${escHtml(c)}</th>`).join("")}</tr>`;
    if (!rows.length) {
      expEls.tbody.innerHTML = `<tr><td colspan="${Math.max(1, cols.length)}" style="padding:24px;text-align:center;color:var(--muted);">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td></tr>`;
      return;
    }
    expEls.tbody.innerHTML = rows.map(r =>
      `<tr>${r.map(v => `<td>${v === null || v === undefined ? '<span style="color:var(--muted)">-</span>' : escHtml(v)}</td>`).join("")}</tr>`
    ).join("");
  }

  async function runExplorerQuery({ page = 0, useCustomSql = false } = {}) {
    const baseSql = (useCustomSql ? expEls.sqlInput.value : buildExplorerSql()).trim().replace(/;+\s*$/, "");
    if (!useCustomSql) expEls.sqlInput.value = baseSql;
    expState.customSql = useCustomSql ? baseSql : null;
    expState.lastBaseSql = baseSql;
    expState.page = page;

    expEls.status.textContent = "กำลังเจาะอ่านไฟล์ Parquet จาก Hugging Face...";
    expEls.runBtn.disabled = true;
    expEls.runSqlBtn.disabled = true;
    const t0 = performance.now();
    try {
      const archive = PM25_ARCHIVES[expEls.table.value];
      if (!useCustomSql && archive && page === 0) {
        const year = expEls.year.value;
        expEls.pm25Coverage.hidden = true;
        const response = await fetch(`${HF_BASE}/parquet/${archive.folder}/coverage_${year}.json`, {cache: "no-cache"});
        if (response.status === 404) {
          renderExplorerTable([], []);
          expState.lastBaseSql = "";
          expEls.nextBtn.disabled = expEls.prevBtn.disabled = expEls.csvBtn.disabled = true;
          expEls.pageInfo.textContent = "";
          expEls.status.textContent = `ปี ${year} ยังไม่มีไฟล์ของชุดนี้ในคลัง ลองเลือกปีอื่น`;
          return;
        }
        if (!response.ok) throw new Error(`โหลดช่วงข้อมูลไม่สำเร็จ (${response.status})`);
        const {days} = await response.json();
        if (!Array.isArray(days) || !days.length) throw new Error("ไม่พบวันที่ในรายการข้อมูล");
        const firstDate = days[0][archive.day];
        const lastDate = days.at(-1)[archive.day];
        const missingDays = (Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000 + 1 - days.length;
        const gap = missingDays > 0 ? ` · ขาดข้อมูล ${missingDays.toLocaleString("th-TH")} วันในช่วงนี้` : "";
        expEls.pm25Dates.textContent = `มีไฟล์ ${days.length.toLocaleString("th-TH")} วัน ระหว่าง ${firstDate} ถึง ${lastDate}${gap} · ค่าประมาณจากกริด ${archive.grid} · ช่องว่างแสดงเป็นไม่มีข้อมูล`;
        expEls.pm25Credit.textContent = archive.credit;
        expEls.pm25Credit.href = archive.url;
        expEls.pm25Coverage.hidden = false;
      }
      const conn = await ensureDuckDb();
      const countRes = await conn.query(`SELECT count(*) AS cnt FROM (${baseSql}) AS _q`);
      const total = Number(countRes.get(0).cnt);
      expState.totalRows = total;

      const offset = page * PAGE_SIZE;
      const pageRes = await conn.query(`SELECT * FROM (${baseSql}) AS _q LIMIT ${PAGE_SIZE} OFFSET ${offset}`);
      const { cols, rows } = arrowTableToRows(pageRes);
      expState.lastCols = cols;
      renderExplorerTable(cols, rows);

      const ms = Math.round(performance.now() - t0);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      expEls.status.innerHTML = `พบทั้งหมด <strong>${total.toLocaleString("th-TH")}</strong> แถว · แสดงหน้า ${page + 1}/${totalPages} (${ms.toLocaleString("th-TH")} ms จาก Hugging Face Parquet)`;
      expEls.pageInfo.textContent = `หน้า ${page + 1} / ${totalPages} (แถว ${total ? offset + 1 : 0}–${Math.min(total, offset + rows.length)} จาก ${total.toLocaleString("th-TH")})`;
      expEls.prevBtn.disabled = page <= 0;
      expEls.nextBtn.disabled = offset + PAGE_SIZE >= total;
      expEls.csvBtn.disabled = total === 0;
    } catch (err) {
      expEls.status.textContent = "เกิดข้อผิดพลาดในการค้นหา: " + (err?.message || err);
      expEls.tbody.innerHTML = `<tr><td style="padding:18px;color:#fca5a5;">${escHtml(err?.message || err)}</td></tr>`;
    } finally {
      expEls.runBtn.disabled = false;
      expEls.runSqlBtn.disabled = false;
    }
  }

  async function exportExplorerCsv() {
    const baseSql = expState.lastBaseSql || buildExplorerSql();
    expEls.csvBtn.disabled = true;
    expEls.status.textContent = "กำลังดึงข้อมูลส่งออก CSV (สูงสุด 50,000 แถว)...";
    try {
      const conn = await ensureDuckDb();
      const res = await conn.query(`SELECT * FROM (${baseSql}) AS _q LIMIT 50000`);
      const { cols, rows } = arrowTableToRows(res);
      const lines = [cols.map(csvCell).join(",")];
      for (const r of rows) lines.push(r.map(csvCell).join(","));
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thailand_${expEls.table.value}_${expEls.year.value}_${expEls.prov.value}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      expEls.status.textContent = `ดาวน์โหลด CSV สำเร็จ (${rows.length.toLocaleString("th-TH")} แถว)`;
    } catch (err) {
      expEls.status.textContent = "ส่งออก CSV ไม่สำเร็จ: " + (err?.message || err);
    } finally {
      expEls.csvBtn.disabled = false;
    }
  }

  function onExplorerPageActivated() {
    populateExplorerProvinces();
    if (state.selectedProv && expEls.prov) expEls.prov.value = state.selectedProv;
    if (state.year && state.year !== "all" && expEls.year) expEls.year.value = state.year;
    syncExplorerFilterVisibility();
    if (!expState.lastBaseSql) {
      expEls.sqlInput.value = buildExplorerSql();
    }
  }

  function bindExplorerEvents() {
    if (!expEls.table) return;
    expEls.table.onchange = () => { syncExplorerFilterVisibility(); runExplorerQuery({ page: 0, useCustomSql: false }); };
    expEls.runBtn.onclick = () => runExplorerQuery({ page: 0, useCustomSql: false });
    expEls.runSqlBtn.onclick = () => runExplorerQuery({ page: 0, useCustomSql: true });
    expEls.csvBtn.onclick = exportExplorerCsv;
    expEls.prevBtn.onclick = () => { if (expState.page > 0) runExplorerQuery({ page: expState.page - 1, useCustomSql: !!expState.customSql }); };
    expEls.nextBtn.onclick = () => { runExplorerQuery({ page: expState.page + 1, useCustomSql: !!expState.customSql }); };
    expEls.keyword.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runExplorerQuery({ page: 0, useCustomSql: false });
    });
    document.querySelectorAll(".preset-btn[data-preset]").forEach(btn => {
      btn.onclick = () => {
        const fn = PRESET_SQLS[btn.dataset.preset];
        if (!fn) return;
        expEls.sqlInput.value = fn();
        if (expEls.sqlDetails) expEls.sqlDetails.open = true;
        runExplorerQuery({ page: 0, useCustomSql: true });
      };
    });
  }
"""
