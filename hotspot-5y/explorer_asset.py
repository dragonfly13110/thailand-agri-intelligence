"""DuckDB-Wasm Daily Point Explorer & SQL Lab UI injected into the online web app."""

from __future__ import annotations

EXPLORER_CSS = r"""
  .explorer-backdrop {
    position: fixed; inset: 0; background: rgba(2,6,23,0.82); z-index: 65;
    display: none; align-items: center; justify-content: center; padding: 14px;
  }
  .explorer-card {
    background: var(--panel-solid); border: 1px solid var(--border); border-radius: 14px;
    width: min(1240px, 98vw); height: min(88vh, 860px);
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  }
  .explorer-head {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--card);
  }
  .explorer-head h3 { margin: 0; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .explorer-filters {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px;
    padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel-solid);
    align-items: end;
  }
  .explorer-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    padding: 8px 16px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--muted);
  }
  .explorer-sql-box {
    padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--card);
  }
  .explorer-sql-box textarea {
    width: 100%; min-height: 82px; font-family: ui-monospace, Consolas, monospace; font-size: 12px;
    background: var(--bg); color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px; resize: vertical;
  }
  .explorer-table-wrap {
    flex: 1; overflow: auto; padding: 0;
  }
  .explorer-table {
    width: 100%; border-collapse: collapse; font-size: 12px;
  }
  .explorer-table th {
    position: sticky; top: 0; background: var(--panel-solid); color: var(--muted);
    text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border);
    white-space: nowrap; font-weight: 700;
  }
  .explorer-table td {
    padding: 6px 10px; border-bottom: 1px solid rgba(148,163,184,0.12);
    white-space: nowrap;
  }
  .explorer-table tr:hover td { background: rgba(249,115,22,0.08); }
  .explorer-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    padding: 8px 16px; border-top: 1px solid var(--border); background: var(--card); font-size: 12px;
  }
"""

EXPLORER_BUTTON_HTML = (
    '<button id="openExplorerBtn" class="btn primary" '
    'title="ค้นหาจุดความร้อนรายวันทั้ง 1.28 ล้านจุดและรอยเผาไหม้ตรงจาก Hugging Face ด้วย DuckDB-Wasm">'
    '🔍 ค้นจุดไฟรายวัน (DuckDB)</button>'
)

EXPLORER_MODAL_HTML = r"""
<div id="explorerModal" class="explorer-backdrop" role="dialog" aria-modal="true" aria-label="ค้นหาข้อมูลจุดความร้อนรายวันด้วย DuckDB-Wasm">
  <div class="explorer-card">
    <div class="explorer-head">
      <h3>
        <span>🦆 ค้นหาข้อมูลละเอียดตรงจาก Hugging Face (DuckDB-Wasm)</span>
        <span id="expEngineBadge" class="badge">พร้อมโหลดเมื่อกดค้นหา</span>
      </h3>
      <div style="display:flex;gap:8px;align-items:center;">
        <a id="expHfLink" class="btn" href="https://huggingface.co/datasets/__HF_REPO__" target="_blank" rel="noopener" style="text-decoration:none;">📦 เปิดชุดข้อมูล HF</a>
        <button id="closeExplorerBtn" class="btn">ปิด</button>
      </div>
    </div>

    <div class="explorer-filters">
      <div>
        <label class="field-label" for="expTable">ชุดข้อมูล (Parquet)</label>
        <select id="expTable">
          <option value="hotspots" selected>จุดความร้อนรายวัน VIIRS (1.28 ล้านจุด)</option>
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
        <button id="expRunBtn" class="btn primary" style="flex:1;">🔎 ค้นหา</button>
        <button id="expCsvBtn" class="btn" title="ดาวน์โหลดผลที่กรองทั้งหมดเป็น CSV (สูงสุด 50,000 แถว)">⬇ CSV</button>
      </div>
    </div>

    <div class="explorer-bar">
      <div id="expStatus">เลือกเงื่อนไขแล้วกด <strong>ค้นหา</strong> — เบราว์เซอร์จะเจาะอ่านเฉพาะส่วนที่ต้องการจากไฟล์ Parquet บน Hugging Face (ไม่โหลดทั้งไฟล์)</div>
      <label class="check-row" style="font-size:11.5px;">
        <input id="expExcludeStatic" type="checkbox" checked />
        <span>ตัดจุดซ้ำถาวร ≥25 วัน</span>
      </label>
    </div>

    <details class="explorer-sql-box">
      <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--muted);">💻 โหมด SQL (ดูหรือแก้ไขคำสั่ง DuckDB เพื่อสอน/วิเคราะห์เอง)</summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
        <textarea id="expSqlInput" spellcheck="false"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="font-size:11px;color:var(--muted);">รองรับคำสั่ง SELECT ตรงบนไฟล์ Parquet ของ Hugging Face (Read-only ในเบราว์เซอร์)</span>
          <button id="expRunSqlBtn" class="btn primary">▶ รัน SQL นี้</button>
        </div>
      </div>
    </details>

    <div class="explorer-table-wrap" role="region" tabindex="0" aria-label="ตารางผลลัพธ์จาก DuckDB-Wasm">
      <table class="explorer-table">
        <thead id="expThead"></thead>
        <tbody id="expTbody">
          <tr><td style="padding:24px;text-align:center;color:var(--muted);">กดปุ่ม <strong>🔎 ค้นหา</strong> เพื่อเริ่มเจาะอ่านข้อมูลจาก Hugging Face</td></tr>
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
"""

EXPLORER_JS = r"""
  // =========================================================================
  // DuckDB-Wasm Remote Parquet Explorer (loads on demand when modal opens)
  // =========================================================================
  const HF_REPO = "__HF_REPO__";
  const HF_BASE = `https://huggingface.co/datasets/${HF_REPO}/resolve/main`;
  const PAGE_SIZE = 50;
  let DUCK_DB = null;
  let DUCK_CONN = null;
  let DUCK_INIT_PROMISE = null;
  const expState = { page: 0, totalRows: 0, lastBaseSql: "", lastCols: [], customSql: null };

  const expEls = {
    openBtn: document.getElementById("openExplorerBtn"),
    modal: document.getElementById("explorerModal"),
    closeBtn: document.getElementById("closeExplorerBtn"),
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
    exclStatic: document.getElementById("expExcludeStatic"),
    runBtn: document.getElementById("expRunBtn"),
    csvBtn: document.getElementById("expCsvBtn"),
    status: document.getElementById("expStatus"),
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
    const t = expEls.table.value;
    const isHot = t === "hotspots";
    const isTrp = t === "tamroypao";
    expEls.yearWrap.style.display = (isHot || isTrp) ? "block" : "none";
    expEls.satWrap.style.display = isHot ? "block" : "none";
    expEls.dateFromWrap.style.display = isHot ? "block" : "none";
    expEls.dateToWrap.style.display = isHot ? "block" : "none";
    expEls.exclStatic.parentElement.style.display = isHot ? "flex" : "none";
  }

  function buildExplorerSql() {
    const t = expEls.table.value;
    const prov = expEls.prov.value;
    const kw = expEls.keyword.value.trim();
    const yr = expEls.year.value;
    const where = [];

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
      expEls.tbody.innerHTML = `<tr><td colspan="${Math.max(1, cols.length)}" style="padding:20px;text-align:center;color:var(--muted);">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td></tr>`;
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

  function bindExplorerEvents() {
    if (!expEls.openBtn) return;
    expEls.openBtn.onclick = () => {
      populateExplorerProvinces();
      if (state.selectedProv) expEls.prov.value = state.selectedProv;
      if (state.year && state.year !== "all") expEls.year.value = state.year;
      syncExplorerFilterVisibility();
      expEls.modal.style.display = "flex";
      if (!expState.lastBaseSql) runExplorerQuery({ page: 0, useCustomSql: false });
    };
    expEls.closeBtn.onclick = () => { expEls.modal.style.display = "none"; };
    expEls.modal.onclick = (e) => { if (e.target === expEls.modal) expEls.modal.style.display = "none"; };
    expEls.table.onchange = () => { syncExplorerFilterVisibility(); runExplorerQuery({ page: 0, useCustomSql: false }); };
    expEls.runBtn.onclick = () => runExplorerQuery({ page: 0, useCustomSql: false });
    expEls.runSqlBtn.onclick = () => runExplorerQuery({ page: 0, useCustomSql: true });
    expEls.csvBtn.onclick = exportExplorerCsv;
    expEls.prevBtn.onclick = () => { if (expState.page > 0) runExplorerQuery({ page: expState.page - 1, useCustomSql: !!expState.customSql }); };
    expEls.nextBtn.onclick = () => runExplorerQuery({ page: expState.page + 1, useCustomSql: !!expState.customSql });
    expEls.keyword.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runExplorerQuery({ page: 0, useCustomSql: false });
    });
  }
"""
