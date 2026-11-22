"""Self-contained, offline-capable HTML/Canvas interactive map template."""

from __future__ import annotations

import html
import json

from explorer_asset import EXPLORER_BUTTON_HTML, EXPLORER_CSS, EXPLORER_JS, EXPLORER_MODAL_HTML
from map_data import encode_payload_b64
from ui_pages import (
    BURNSCAR_PAGE_HTML,
    HAZE_PAGE_HTML,
    MULTI_PAGE_CSS,
    MULTI_PAGE_JS,
    OVERVIEW_PAGE_HTML,
    WEATHER_PAGE_HTML,
)

ATLAS_FONTS = """<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />"""

ATLAS_THEME_CSS = """:root {
  --atlas-font: "IBM Plex Sans Thai", system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", Tahoma, sans-serif;
  --bg: #0b0e14;
  --bg-mesh: radial-gradient(ellipse 75% 40% at 50% -10%, rgba(229, 107, 55, 0.07), transparent 60%), #0b0e14;
  --topbar-bg: #0f131b;
  --hero-bg: linear-gradient(180deg, #141923, #10141d);
  --panel: rgba(15, 19, 27, 0.96);
  --panel-solid: #0f131b;
  --card: #151a24;
  --card-elev: #121720;
  --border: rgba(255, 255, 255, 0.085);
  --border-strong: rgba(255, 255, 255, 0.16);
  --text: #eceff4;
  --muted: #8b95a7;
  --accent: #df6a37;
  --accent-soft: rgba(223, 106, 55, 0.13);
  --secondary: #689cb8;
  --agri: #d48942;
  --forest: #55947a;
  --flood: #689cb8;
  --danger: #cf5648;
  --null-fill: #273040;
  --map-land-stroke: rgba(148, 163, 184, 0.32);
  --shadow: 0 12px 30px rgba(0, 0, 0, 0.42);
  --shadow-sm: 0 4px 14px rgba(0, 0, 0, 0.24);
}
html[data-theme="light"] {
  --bg: #f5f5f2;
  --bg-mesh: #f5f5f2;
  --topbar-bg: #ffffff;
  --hero-bg: #ffffff;
  --panel: rgba(255, 255, 255, 0.97);
  --panel-solid: #ffffff;
  --card: #f8f8f6;
  --card-elev: #ffffff;
  --border: rgba(15, 23, 42, 0.09);
  --border-strong: rgba(15, 23, 42, 0.18);
  --text: #161b22;
  --muted: #5c6675;
  --accent: #c55325;
  --accent-soft: rgba(197, 83, 37, 0.09);
  --secondary: #3c748f;
  --agri: #b8732a;
  --forest: #3b7c62;
  --flood: #3c748f;
  --danger: #b83f35;
  --null-fill: #d6dbe3;
  --map-land-stroke: rgba(51, 65, 85, 0.34);
  --shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
  --shadow-sm: 0 2px 10px rgba(15, 23, 42, 0.05);
}"""

ATLAS_CHROME_CSS = """.topbar {
  display: flex; align-items: center; gap: 10px; padding: 0 16px;
  background: var(--topbar-bg); border-bottom: 1px solid var(--border);
  z-index: 30; overflow-x: auto; white-space: nowrap; scrollbar-width: thin;
  min-width: 0; max-width: 100%;
}
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; cursor: pointer; }
.brand-dot {
  width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent);
}"""

ATLAS_NAV_ITEMS = (
    ("overview", "ภาพรวม"),
    ("map", "แผนที่เจาะลึก"),
    ("weather", "อากาศ × ไฟ"),
    ("haze", "ฝุ่น PM2.5 & ข้ามแดน"),
    ("burnscar", "รอยเผา & เทียบจังหวัด"),
)

ATLAS_THEME_SCRIPT = r"""<script>
function setAtlasTheme(theme, remember = false) {
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.textContent = theme === "dark" ? "โหมดสว่าง" : "โหมดมืด";
  if (remember) {
    try { localStorage.setItem("atlas-theme", theme); } catch (_) {}
  }
}
try {
  const saved = localStorage.getItem("atlas-theme");
  if (saved === "light" || saved === "dark") setAtlasTheme(saved);
} catch (_) {}
</script>"""

HTML_SHELL = r"""<!DOCTYPE html>
<html lang="th" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Thailand Fire, Burn Scar & Climate Intelligence Atlas (2022–2026)</title>
<!--__ATLAS_FONTS__-->
<!--__ATLAS_THEME_SCRIPT__-->
<style>
/*__ATLAS_THEME_CSS__*/
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; width: 100%; max-width: 100%; height: 100%;
  background: var(--bg); color: var(--text);
  font-family: var(--atlas-font);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
#app {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 58px 1fr;
  height: 100vh; width: 100%; max-width: 100%; overflow-x: hidden;
}
/*__ATLAS_CHROME_CSS__*/
.badge {
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  background: var(--card); color: var(--muted); border: 1px solid var(--border);
  font-weight: 600;
}
.breadcrumbs {
  display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: var(--muted);
}
.crumb-btn {
  background: transparent; border: 1px solid transparent; color: var(--text);
  padding: 2px 7px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit;
}
.crumb-btn:hover { background: var(--accent-soft); color: var(--accent); }
.spacer { flex: 1; }
.search-wrap { position: relative; min-width: 180px; max-width: 230px; }
.search-input {
  width: 100%; padding: 6px 10px; border-radius: 8px; font-size: 12px;
  background: var(--card); color: var(--text); border: 1px solid var(--border);
  outline: none; font-family: inherit;
}
.search-input:focus { border-color: var(--accent); }
.search-results {
  position: fixed; z-index: 120; max-height: 280px; overflow-y: auto;
  background: var(--panel-solid); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: var(--shadow); display: none; min-width: 250px;
}
.search-item {
  padding: 7px 10px; font-size: 12px; cursor: pointer;
  display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--border);
}
.search-item:hover { background: var(--accent-soft); }
.search-tag { font-size: 10px; color: var(--muted); }
.btn {
  padding: 6px 11px; border-radius: 9px; font-size: 12px; font-weight: 600;
  border: 1px solid var(--border); background: var(--card); color: var(--text);
  cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 5px;
  transition: border-color .15s, color .15s, background .15s;
}
.btn:hover { border-color: var(--accent); color: var(--accent); }
.btn.primary {
  background: var(--accent);
  color: #fff; border-color: transparent;
}
.btn.primary:hover { filter: brightness(1.07); color: #fff; }

.workspace {
  grid-template-columns: 296px 1fr 378px;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.workspace.presentation { grid-template-columns: 0px 1fr 0px; }
.sidebar {
  background: var(--panel-solid);
  border-right: 1px solid var(--border); padding: 12px 12px 58px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 11px;
  z-index: 20;
}
.sidebar.right { border-right: none; border-left: 1px solid var(--border); }
.workspace.presentation .sidebar { padding: 0; overflow: hidden; border: none; }

.section {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 11px; display: flex; flex-direction: column; gap: 7px;
}
.section-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.03em; color: var(--muted);
  display: flex; align-items: center; justify-content: space-between;
}
label.field-label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 3px; }
select, input[type="range"] { width: 100%; font-family: inherit; }
select {
  padding: 6px 8px; border-radius: 7px; font-size: 12px;
  background: var(--panel-solid); color: var(--text); border: 1px solid var(--border);
}
.check-row {
  display: flex; align-items: center; gap: 7px; font-size: 12px; cursor: pointer; user-select: none;
}
.check-row input { accent-color: var(--accent); cursor: pointer; }
.pt-layer-panel {
  display: none; flex-direction: column; gap: 7px; padding: 9px 10px;
  border-radius: 9px; background: rgba(15, 23, 42, 0.45); border: 1px solid var(--border);
  margin: 2px 0 4px;
}
html[data-theme="light"] .pt-layer-panel { background: rgba(241, 245, 249, 0.85); }
.pt-layer-panel.open { display: flex; }
.pt-sub-title {
  font-size: 10.5px; font-weight: 700; color: var(--muted);
  display: flex; justify-content: space-between; align-items: center; gap: 4px 6px; flex-wrap: wrap;
}
.pt-mini-btns { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.pt-mini-btn {
  border: 1px solid var(--border); background: var(--card); color: var(--text);
  font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 5px; cursor: pointer;
  white-space: nowrap; font-family: inherit;
}
.pt-mini-btn:hover { border-color: var(--accent); color: var(--accent); }
.pt-chip-grid {
  display: flex; flex-wrap: wrap; gap: 5px;
}
.pt-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3.5px 7.5px; border-radius: 6px; font-size: 11px; font-weight: 600;
  background: var(--card); border: 1px solid var(--border); color: var(--text);
  cursor: pointer; user-select: none; transition: opacity .14s, border-color .14s;
}
.pt-chip:hover { border-color: var(--accent); }
.pt-chip input { margin: 0; width: 12px; height: 12px; accent-color: var(--accent); cursor: pointer; }
.pt-chip:has(input:not(:checked)) { opacity: 0.42; }
.pt-swatch { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.warn-pill {
  font-size: 11px; line-height: 1.4; padding: 7px 9px; border-radius: 8px;
  background: rgba(245, 158, 11, 0.14); border: 1px solid rgba(245, 158, 11, 0.45);
  color: #fbbf24; display: none;
}
html[data-theme="light"] .warn-pill { color: #92400e; background: rgba(245, 158, 11, 0.16); }

.map-stage { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg-mesh); }
#mapCanvas { width: 100%; height: 100%; display: block; cursor: grab; }
#mapCanvas:active { cursor: grabbing; }

.map-hud-top {
  position: absolute; top: 12px; left: 12px; right: 12px;
  display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; gap: 8px;
}
.hud-box {
  pointer-events: auto; background: var(--panel-solid);
  border: 1px solid var(--border); border-radius: 10px; padding: 8px 11px; box-shadow: var(--shadow);
  font-size: 12px;
}
.map-controls {
  position: absolute; right: 14px; bottom: 66px; display: flex; flex-direction: column; gap: 6px; z-index: 15;
}
.zoom-btn {
  width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--border);
  background: var(--panel-solid); color: var(--text); font-size: 16px; font-weight: 700; cursor: pointer;
  box-shadow: var(--shadow);
}
.zoom-btn:hover { border-color: var(--accent); color: var(--accent); }
.legend-box {
  position: absolute; left: 14px; bottom: 66px; z-index: 15; min-width: 225px; max-width: 310px;
}
.legend-bar { height: 10px; border-radius: 999px; margin: 6px 0 4px; border: 1px solid var(--border); }
.legend-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
.null-chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); margin-top: 5px;
}
.null-swatch { width: 11px; height: 11px; border-radius: 3px; background: var(--null-fill); border: 1px solid var(--border); }

.tooltip {
  position: fixed; pointer-events: none; z-index: 160; display: none;
  background: var(--panel); border: 1px solid var(--border-strong);
  border-top: 3px solid var(--tt-accent, var(--accent));
  border-radius: 12px; padding: 11px 13px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.48), 0 4px 12px rgba(0, 0, 0, 0.25);
  font-size: 12px; min-width: 248px; max-width: 340px; line-height: 1.45;
  color: var(--text);
}
html[data-theme="light"] .tooltip {
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.16), 0 3px 10px rgba(15, 23, 42, 0.08);
}
.tooltip h4 { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--tt-accent, var(--accent)); line-height: 1.25; }
.tt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
.tt-sub { font-size: 11px; color: var(--muted); font-weight: 500; margin-top: 1px; }
.tt-badge {
  font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
  background: var(--accent-soft); color: var(--tt-accent, var(--accent));
  border: 1px solid rgba(223, 106, 55, 0.28); white-space: nowrap; flex-shrink: 0;
}
.tt-divider { height: 1px; background: var(--border); margin: 6px 0; }
.tt-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 3.5px 0; font-size: 12px; }
.tt-k { color: var(--muted); display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.tt-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.tt-v { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
.tt-bar {
  height: 6px; border-radius: 999px; background: rgba(148, 163, 184, 0.16);
  overflow: hidden; display: flex; margin: 5px 0 4px;
}
.tt-bar > div { height: 100%; }
.tt-foot {
  font-size: 10.5px; color: var(--muted); margin-top: 7px; padding-top: 5px;
  border-top: 1px dashed var(--border); display: flex; align-items: center; gap: 5px;
}

.kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kpi-card {
  background: var(--card); border: 1px solid var(--border); border-radius: 11px; padding: 10px 11px;
}
.kpi-label { font-size: 11px; color: var(--muted); font-weight: 600; }
.kpi-val { font-size: 18px; font-weight: 800; margin-top: 3px; line-height: 1.15; font-variant-numeric: tabular-nums; }
.kpi-sub { font-size: 11px; color: var(--muted); margin-top: 3px; }

.chart-box { width: 100%; height: 186px; position: relative; }
.chart-box.short { height: 142px; }
canvas.panel-canvas { width: 100%; height: 100%; display: block; }
.axis-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.rank-list { display: flex; flex-direction: column; gap: 5px; }
.rank-item {
  display: grid; grid-template-columns: 22px 1fr auto; gap: 6px; align-items: center;
  padding: 5px 7px; border-radius: 7px; background: rgba(148,163,184,0.06); cursor: pointer;
  font-size: 12px;
}
.rank-item:hover { background: var(--accent-soft); }
.rank-bar-bg { height: 4px; border-radius: 99px; background: rgba(148,163,184,0.16); margin-top: 3px; overflow: hidden; }
.rank-bar-fg { height: 100%; background: var(--accent); border-radius: 99px; }

.insight-box {
  font-size: 12px; line-height: 1.5; padding: 10px 11px; border-radius: 10px;
  background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--accent);
}
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 150;
  display: none; align-items: center; justify-content: center; padding: 16px;
}
.modal-card {
  background: var(--panel-solid); border: 1px solid var(--border); border-radius: 14px;
  max-width: 680px; width: 100%; max-height: 85vh; overflow-y: auto; padding: 18px 20px; box-shadow: var(--shadow);
  font-size: 13px; line-height: 1.6;
}
.loading-mask {
  position: fixed; inset: 0; z-index: 200; background: var(--bg);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  font-size: 14px; color: var(--text);
}
.pres-exit {
  position: fixed; top: 64px; right: 14px; z-index: 40; display: none;
}
.workspace.presentation ~ .pres-exit, .pres-exit.visible { display: inline-flex; }

@media (max-width: 1080px) {
  .workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: 52vh auto auto; overflow-y: auto; height: auto; }
  html, body { overflow-y: auto; overflow-x: hidden; }
  #app { height: auto; min-height: 100vh; }
  .sidebar { border: none; border-top: 1px solid var(--border); max-height: none; overflow: visible; }
  .map-stage { grid-row: 1; height: 52vh; }
  .legend-box { min-width: 160px; max-width: 210px; padding: 6px 8px; left: 8px; bottom: 8px; }
  .map-controls { right: 8px; bottom: 16px; }
  .hud-box { padding: 5px 8px; font-size: 11px; }
}
/*__MULTI_PAGE_CSS__*/
/*__EXPLORER_CSS__*/
</style>
</head>
<body>
<div id="loadingMask" class="loading-mask">
  <div class="brand-dot" style="width:18px;height:18px;"></div>
  <div>กำลังถอดรหัสแผนที่ สภาพอากาศ และข้อมูล 1.28 ล้านจุด...</div>
</div>

<div id="app">
  <header class="topbar">
    <div class="brand" data-goto="overview" title="กลับหน้าภาพรวมประเทศ">
      <span class="brand-dot"></span>
      <span>Thailand Fire Atlas</span>
      <span id="dateBadge" class="badge">2022–2026</span>
    </div>
    <nav class="nav-tabs" aria-label="เมนูหลัก">
      <!--__ATLAS_NAV_ITEMS__-->
      <!--__AREA_INSIGHTS_LINK__-->
      <!--__FIRE_PM_MAP_LINK__-->
      <!--__FARM_FIRE_PM25_LINK__-->
      <!--__EXPLORER_BTN__-->
    </nav>
    <div class="spacer"></div>
    <div class="search-wrap" style="display:none;">
      <input id="searchInput" class="search-input" type="search" placeholder="ค้นหาจังหวัด / อำเภอ / ตำบล..." autocomplete="off" />
    </div>
    <button id="exportCsvBtn" class="btn" style="display:none;" title="ส่งออกตารางเป็น CSV สำหรับ Excel">ส่งออก CSV</button>
    <button id="provenanceBtn" class="btn" title="ที่มาข้อมูลและข้อควรระวัง">ข้อควรรู้</button>
    <button id="themeToggle" class="btn" title="สลับโหมดสีมืด/สว่าง">โหมดสว่าง</button>
    <button id="presentationBtn" class="btn primary" style="display:none;" title="ขยายแผนที่เต็มจอสำหรับสอน/นำเสนอ">เต็มจอ</button>
  </header>

  <div class="app-body">
  <!--__OVERVIEW_PAGE__-->

  <main id="page-map" class="page-view workspace">
    <aside class="sidebar left">
      <div class="section">
        <div class="section-title"><span>1. มาตรฐานดาวเทียม & เวลา</span></div>
        <div>
          <label class="field-label" for="satSelect">ชุดดาวเทียม</label>
          <select id="satSelect">
            <option value="N" selected>Suomi NPP (N) — มาตรฐาน 5 ปี</option>
            <option value="ALL">ทุกดาวเทียม (N+N20+N21+1)</option>
          </select>
        </div>
        <label class="check-row">
          <input id="janOctCheck" type="checkbox" checked />
          <span>เทียบช่วง ม.ค.–ต.ค. ทุกปี (กัน N ขาด พ.ย. 2026)</span>
        </label>
        <div id="satWarnPill" class="warn-pill"></div>
        <div class="axis-row">
          <div>
            <label class="field-label" for="yearSelect">ปี (ค.ศ.)</label>
            <select id="yearSelect">
              <option value="all" selected>รวม 5 ปี (2022–2026)</option>
              <option value="2022">2022</option>
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="seasonSelect">ช่วงฤดูกาล</label>
            <select id="seasonSelect">
              <option value="all" selected>ทุกเดือนที่เลือก</option>
              <option value="peak">ช่วงพีค (ม.ค.–เม.ย.)</option>
              <option value="early">ต้นปีเกษตร (ม.ค.–ก.พ.)</option>
              <option value="off">นอกฤดูเผา (พ.ค.–ต.ค.)</option>
              <option value="late">ปลายปีเก็บเกี่ยว (พ.ย.–ธ.ค.)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title"><span>2. พื้นที่ & ชนิดพืช</span></div>
        <div>
          <label class="field-label" for="cropSelect">กลุ่มพื้นที่ / พืช (รวมรุกป่าเมื่อเลือกพืช)</label>
          <select id="cropSelect">
            <option value="all" selected>ทุกพื้นที่และทุกพืช</option>
            <option value="agri">เฉพาะเกษตร + ส.ป.ก.</option>
            <option value="forest">เฉพาะป่าไม้ (อนุรักษ์ + สงวนฯ)</option>
            <option value="rice">นาข้าว (ทุกเขตพื้นที่)</option>
            <option value="sugarcane">อ้อย (ทุกเขตพื้นที่)</option>
            <option value="corn">ข้าวโพดและไร่หมุนเวียน (ทุกเขต)</option>
          </select>
        </div>
        <label class="check-row">
          <input id="excludeStaticCheck" type="checkbox" checked />
          <span>ตัดจุดซ้ำถาวร ≥25 วัน (โรงงาน/เตาเผา)</span>
        </label>
      </div>

      <div class="section">
        <div class="section-title"><span>3. สีแผนที่ & การแสดงผล</span></div>
        <div>
          <label class="field-label" for="metricSelect">ระบายสีพื้นที่ตามตัวชี้วัด</label>
          <select id="metricSelect">
            <optgroup label="จุดความร้อน &amp; รอยเผาไหม้">
              <option value="count" selected>จำนวนจุดความร้อน (จุด)</option>
              <option value="density">ความหนาแน่น (จุด / 100 ตร.กม.)</option>
              <option value="agri_pct">สัดส่วนเผาในเกษตร+ส.ป.ก. (%)</option>
              <option value="trp_rai">รอยเผา สสน. ตามรอยเผา (ไร่ · แยกพืช/ฤดู 24–26)</option>
              <option value="scar_rai">รอยเผาไหม้ GISTDA (ไร่ · พ.ค. 2026)</option>
              <option value="freq_rai">พื้นที่เผาซ้ำซาก GISTDA (ไร่)</option>
            </optgroup>
            <optgroup label="ฝุ่น PM2.5 · ความชื้นดิน · อัตราเผาเกษตร">
              <option value="aq_pm25">PM2.5 เฉลี่ยหน้าแล้ง (µg/m³ · CAMS)</option>
              <option value="aq_exceed">วันฝุ่น PM2.5 เกิน 37.5 µg/m³ (วัน/ปี)</option>
              <option value="aq_co">ก๊าซ CO จากการเผา (µg/m³ · หน้าแล้ง)</option>
              <option value="soil_wet">ความชื้นผิวดิน NASA GWETTOP (0–1)</option>
              <option value="soil_dry_streak">เตือนภัยดินแห้งต่อเนื่องสูงสุด (วัน · NASA POWER)</option>
              <option value="doae_plant_rai">พื้นที่ปลูกข้าว+อ้อย+ข้าวโพด DOAE (ไร่ · จว./อำเภอ/ตำบล)</option>
              <option value="burn_rate_agri">อัตราเผาเกษตรเทียบปลูก DOAE (% · จว./อำเภอ/ตำบล)</option>
            </optgroup>
            <optgroup label="สภาพอากาศเอื้อไฟ 2022–2026 (ครบ 77 จว.)">
              <option value="wx_fwi">ดัชนีอากาศเอื้อไฟหน้าแล้ง FWI (0–100)</option>
              <option value="wx_tmax">อุณหภูมิสูงสุดเฉลี่ย (°C · 2022–2026)</option>
              <option value="wx_rhmin">ความชื้นสัมพัทธ์ต่ำสุดเฉลี่ย (%)</option>
              <option value="wx_low_rh">วันอากาศแห้งจัด RH&lt;35% (วัน/ปี)</option>
              <option value="wx_wind">ความเร็วลมสูงสุดเฉลี่ย (กม./ชม.)</option>
              <option value="wx_rain">ปริมาณฝนรวม (มม. · 2022–2026)</option>
            </optgroup>
            <optgroup label="ภูมิอากาศ 10 ปี (2022–2025) &amp; ภัยซ้ำซ้อน">
              <option value="era5_hot">อากาศ ERA5: วันร้อนจัด ≥38°C</option>
              <option value="era5_dry">อากาศ ERA5: ช่วงแล้งยาวสุด (วัน)</option>
              <option value="era5_rain">อากาศ ERA5: ฝนรวมทั้งปี (มม.)</option>
              <option value="hazard">พื้นที่เสี่ยงซ้ำซ้อน (ท่วมซ้ำ HII + เผาซ้ำ N)</option>
            </optgroup>
          </select>
        </div>
        <label class="check-row">
          <input id="showAreaFillCheck" type="checkbox" checked />
          <span>แสดงสีระบายพื้นที่</span>
        </label>
        <div>
          <label class="field-label" for="levelModeSelect">ระดับขอบเขตแผนที่</label>
          <select id="levelModeSelect">
            <option value="auto" selected>อัตโนมัติ (คลิกเจาะ จังหวัด → อำเภอ → ตำบล)</option>
            <option value="province">77 จังหวัดทั้งประเทศ</option>
            <option value="amphoe_all">928 อำเภอทั้งประเทศ</option>
          </select>
        </div>
        <div id="grainWarnPill" class="warn-pill"></div>
      </div>

      <div class="section">
        <div class="section-title"><span>4. ชั้นข้อมูลซ้อนทับ (เปิด/ปิดจุดไฟ · แยกประเภท &amp; รายปี)</span></div>
        <label class="check-row" title="วาดจุดความร้อนพิกัดดาวเทียมจริง 1,278,326 จุด พร้อมเลือกเปิด/ปิดแยกรายปีและรายประเภทพืช/ป่าไม้">
          <input id="showPointsCheck" type="checkbox" />
          <span>จุด Hotspot รายพิกัด (ไทย · 1.28 ล้านจุดจริง)</span>
        </label>
        <div id="thPointsFilterPanel" class="pt-layer-panel">
          <div class="pt-sub-title">
            <span>สีของจุดความร้อน</span>
            <select id="ptColorModeSelect" style="width:auto;padding:2px 6px;font-size:11px;height:24px;">
              <option value="type" selected>แยกสีตามประเภทพืช / ป่าไม้</option>
              <option value="year">แยกสีตามปี (2022–2026)</option>
            </select>
          </div>
          <div class="pt-sub-title">
            <span>เปิด/ปิดรายปี (ค.ศ.)</span>
            <span class="pt-mini-btns">
              <button type="button" class="pt-mini-btn" data-pt-act="yr_all">ครบทุกปี</button>
              <button type="button" class="pt-mini-btn" data-pt-act="yr_2026">เฉพาะ 2026</button>
            </span>
          </div>
          <div class="pt-chip-grid" id="ptYearChips">
            <label class="pt-chip"><input type="checkbox" data-pt-yr="0" checked /><i class="pt-swatch" style="background:#38bdf8"></i>2022</label>
            <label class="pt-chip"><input type="checkbox" data-pt-yr="1" checked /><i class="pt-swatch" style="background:#22c55e"></i>2023</label>
            <label class="pt-chip"><input type="checkbox" data-pt-yr="2" checked /><i class="pt-swatch" style="background:#eab308"></i>2024</label>
            <label class="pt-chip"><input type="checkbox" data-pt-yr="3" checked /><i class="pt-swatch" style="background:#f97316"></i>2025</label>
            <label class="pt-chip"><input type="checkbox" data-pt-yr="4" checked /><i class="pt-swatch" style="background:#ef4444"></i>2026</label>
          </div>
          <div class="pt-sub-title">
            <span>เปิด/ปิดรายประเภทพื้นที่ / พืช</span>
            <span class="pt-mini-btns">
              <button type="button" class="pt-mini-btn" data-pt-act="type_all">ทุกประเภท</button>
              <button type="button" class="pt-mini-btn" data-pt-act="type_agri">เฉพาะเกษตร</button>
              <button type="button" class="pt-mini-btn" data-pt-act="type_forest">เฉพาะป่าไม้</button>
            </span>
          </div>
          <div class="pt-chip-grid" id="ptTypeChips">
            <label class="pt-chip"><input type="checkbox" data-pt-type="forest" checked /><i class="pt-swatch" style="background:#dc2626"></i>ป่าไม้</label>
            <label class="pt-chip"><input type="checkbox" data-pt-type="rice" checked /><i class="pt-swatch" style="background:#facc15"></i>นาข้าว</label>
            <label class="pt-chip"><input type="checkbox" data-pt-type="sugarcane" checked /><i class="pt-swatch" style="background:#ec4899"></i>อ้อย</label>
            <label class="pt-chip"><input type="checkbox" data-pt-type="corn" checked /><i class="pt-swatch" style="background:#f97316"></i>ข้าวโพด/ไร่หมุนเวียน</label>
            <label class="pt-chip"><input type="checkbox" data-pt-type="agri_other" checked /><i class="pt-swatch" style="background:#a855f7"></i>เกษตร/ส.ป.ก. อื่น</label>
            <label class="pt-chip"><input type="checkbox" data-pt-type="other" checked /><i class="pt-swatch" style="background:#38bdf8"></i>ชุมชน/อื่น ๆ</label>
          </div>
          <div id="ptThViewCount" style="font-size:10.5px;color:var(--muted);padding-top:2px;border-top:1px dashed var(--border);">กำลังแสดงจุดในหน้าจอ: -</div>
        </div>
        <label class="check-row" title="แสดงจุดไฟข้ามแดน 6 ประเทศ (เมียนมา ลาว กัมพูชา เวียดนาม มาเลเซีย 3.17 ล้านจุด)">
          <input id="showTransPointsCheck" type="checkbox" />
          <span>จุดไฟข้ามแดน 6 ประเทศ (3.17 ล้านจุด · GMS)</span>
        </label>
        <div id="gmsPointsFilterPanel" class="pt-layer-panel">
          <div class="pt-sub-title">
            <span>เปิด/ปิดรายประเทศเพื่อนบ้าน</span>
            <span class="pt-mini-btns">
              <button type="button" class="pt-mini-btn" data-pt-act="gms_c_all">ทุกประเทศ</button>
              <button type="button" class="pt-mini-btn" data-pt-act="gms_c_north">เมียนมา+ลาว</button>
            </span>
          </div>
          <div class="pt-chip-grid" id="ptGmsCountryChips">
            <label class="pt-chip"><input type="checkbox" data-pt-gms-c="1" checked /><i class="pt-swatch" style="background:#ef4444"></i>เมียนมา</label>
            <label class="pt-chip"><input type="checkbox" data-pt-gms-c="2" checked /><i class="pt-swatch" style="background:#f59e0b"></i>สปป.ลาว</label>
            <label class="pt-chip"><input type="checkbox" data-pt-gms-c="3" checked /><i class="pt-swatch" style="background:#a855f7"></i>กัมพูชา</label>
            <label class="pt-chip"><input type="checkbox" data-pt-gms-c="4" checked /><i class="pt-swatch" style="background:#06b6d4"></i>เวียดนาม</label>
            <label class="pt-chip"><input type="checkbox" data-pt-gms-c="5" checked /><i class="pt-swatch" style="background:#10b981"></i>มาเลเซีย</label>
          </div>
          <div class="pt-sub-title">
            <span>เปิด/ปิดรายปี (2022–2025)</span>
            <span class="pt-mini-btns">
              <button type="button" class="pt-mini-btn" data-pt-act="gms_y_all">ครบ 4 ปี</button>
              <button type="button" class="pt-mini-btn" data-pt-act="gms_y_2025">เฉพาะ 2025</button>
            </span>
          </div>
          <div class="pt-chip-grid" id="ptGmsYearChips">
            <label class="pt-chip"><input type="checkbox" data-pt-gms-yr="0" checked />2022</label>
            <label class="pt-chip"><input type="checkbox" data-pt-gms-yr="1" checked />2023</label>
            <label class="pt-chip"><input type="checkbox" data-pt-gms-yr="2" checked />2024</label>
            <label class="pt-chip"><input type="checkbox" data-pt-gms-yr="3" checked />2025</label>
          </div>
          <div id="ptGmsViewCount" style="font-size:10.5px;color:var(--muted);padding-top:2px;border-top:1px dashed var(--border);">กำลังแสดงจุดในหน้าจอ: -</div>
        </div>
        <label class="check-row" title="แสดงจุดความร้อนล่าสุด 1–7 วันจาก GISTDA API Gateway (ดาวเทียม VIIRS)">
          <input id="showLive7dCheck" type="checkbox" />
          <span>จุดไฟล่าสุด 1–7 วัน (GISTDA Near-Real-Time)</span>
        </label>
        <label class="check-row">
          <input id="showHeatCheck" type="checkbox" />
          <span>Heatmap ความหนาแน่น (กริด ~5.5 กม.)</span>
        </label>
        <label class="check-row">
          <input id="showStaticCheck" type="checkbox" />
          <span>จุดซ้ำถาวร / สงสัยโรงงาน (143 จุด)</span>
        </label>
        <label class="check-row">
          <input id="showVillagesCheck" type="checkbox" />
          <span>หมู่บ้านใกล้จุดไฟสูงสุด</span>
        </label>
        <div>
          <label class="field-label" for="gistdaWmsSelect">ชั้นภาพภัยแล้ง/ความชื้น/น้ำท่วมซ้ำซาก (WMS)</label>
          <select id="gistdaWmsSelect">
            <option value="none" selected>ปิดชั้นภาพภัยแล้ง/ความชื้น/น้ำท่วม</option>
            <option value="dri">ดัชนีเสี่ยงภัยแล้ง GISTDA (DRI · 7 วันล่าสุด)</option>
            <option value="ndwi">ดัชนีความชื้นพืชและน้ำ GISTDA (NDWI · 7 วันล่าสุด)</option>
            <option value="smap">ความชื้นผิวดินดาวเทียม GISTDA (SMAP · 7 วันล่าสุด)</option>
            <option value="ldd_flood">พื้นที่น้ำท่วมซ้ำซาก พด. (WMS ต้นฉบับ · ไม่เชิงพาณิชย์/ไม่ดัดแปลง)</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="tmsOverlaySelect">ชั้นภาพรอยเผา 20 ม. สสน. (TMS เมื่อมีเน็ต)</label>
          <select id="tmsOverlaySelect">
            <option value="none" selected>ปิดชั้นภาพ TMS สสน. (Offline 100%)</option>
            <option value="2025/BOTH_202512_202604">ฤดู 2569 (ธ.ค.68–เม.ย.69) · เกษตร + ป่าไม้</option>
            <option value="2025/BURNSCAR_NORTH_20M_202512_202604_B3A_COLOR">ฤดู 2569 (ธ.ค.68–เม.ย.69) · เกษตร 4 พืช</option>
            <option value="2025/BURNSCAR_NORTH_20M_202512_202604_B3F_COLOR">ฤดู 2569 (ธ.ค.68–เม.ย.69) · เขตป่าไม้</option>
            <option value="2024/BOTH_202412_202504">ฤดู 2568 (ธ.ค.67–เม.ย.68) · เกษตร + ป่าไม้</option>
            <option value="2024/BURNSCAR_NORTH_20M_202412_202504_B3A_COLOR">ฤดู 2568 (ธ.ค.67–เม.ย.68) · เกษตร 4 พืช</option>
            <option value="2024/BURNSCAR_NORTH_20M_202412_202504_B3F_COLOR">ฤดู 2568 (ธ.ค.67–เม.ย.68) · เขตป่าไม้</option>
            <option value="2023/BOTH_202312_202404">ฤดู 2567 (ธ.ค.66–เม.ย.67) · เกษตร + ป่าไม้</option>
            <option value="2023/BURNSCAR_NORTH_20M_202312_202404_B3A_COLOR">ฤดู 2567 (ธ.ค.66–เม.ย.67) · เกษตร 4 พืช</option>
            <option value="2023/BURNSCAR_NORTH_20M_202312_202404_B3F_COLOR">ฤดู 2567 (ธ.ค.66–เม.ย.67) · เขตป่าไม้</option>
            <option value="2026/BURNSCAR_NORTH_20M_202604_B2A_COLOR">รายเดือน เม.ย. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202603_B2A_COLOR">รายเดือน มี.ค. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202602_B2A_COLOR">รายเดือน ก.พ. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202601_B2A_COLOR">รายเดือน ม.ค. 2026 · เกษตร 4 พืช</option>
            <option value="2026/SAVI_NORTH_20M_202601_COLOR">ดัชนีแหล่งเชื้อเพลิง SAVI (ม.ค. 2026)</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="basemapSelect">แผนที่พื้นหลัง (เมื่อมีเน็ต)</label>
          <select id="basemapSelect">
            <option value="none" selected>แผนที่เวกเตอร์ล้วน (Offline 100%)</option>
            <option value="carto_dark">Carto Dark (โทนมืด)</option>
            <option value="osm">OpenStreetMap (ถนน/ชุมชน)</option>
            <option value="esri_sat">Esri World Imagery (ภาพถ่ายดาวเทียม)</option>
          </select>
        </div>
      </div>
    </aside>

    <section class="map-stage">
      <canvas id="mapCanvas"></canvas>
      <div class="map-hud-top">
        <div class="hud-box" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <nav id="breadcrumbs" class="breadcrumbs"></nav>
          <span style="color:var(--border);">|</span>
          <span id="scopePill" style="font-size:11.5px;color:var(--muted);">ประเทศไทย (77 จังหวัด)</span>
        </div>
        <button id="resetZoomBtn" class="hud-box btn" style="cursor:pointer">↺ กลับภาพรวมทั้งประเทศ</button>
      </div>
      <div class="map-controls">
        <button id="zoomInBtn" class="zoom-btn" title="ซูมเข้า">+</button>
        <div id="zoomReadout" style="width:34px;text-align:center;font-size:10px;font-weight:700;padding:2px 0;border-radius:6px;background:var(--panel-solid);border:1px solid var(--border);color:var(--muted);font-family:'JetBrains Mono',monospace;box-shadow:var(--shadow);">z5.6</div>
        <button id="zoomOutBtn" class="zoom-btn" title="ซูมออก">−</button>
      </div>
      <div id="legendBox" class="hud-box legend-box">
        <div id="areaFillLegend">
          <div id="legendTitle" style="font-weight:700;font-size:12px;">จำนวนจุดความร้อน</div>
          <div id="legendBar" class="legend-bar"></div>
          <div class="legend-labels"><span id="legMin">0</span><span id="legMid">-</span><span id="legMax">-</span></div>
          <div id="legendNullChip" class="null-chip" style="display:none;"><span class="null-swatch"></span><span>ไม่มีข้อมูลต้นทาง (ไม่ใช่ 0)</span></div>
        </div>
        <div id="tmsLegendChip" class="null-chip" style="display:none;flex-wrap:wrap;gap:6px;margin-top:4px;font-size:10.5px;"></div>
      </div>
      <div id="mapDock" class="map-dock" aria-label="สลับมุมมองแผนที่ด่วน">
        <button type="button" class="dock-btn active" data-dock-metric="count">จุดความร้อน</button>
        <button type="button" class="dock-btn" data-dock-metric="trp_rai">รอยเผา สสน.</button>
        <button type="button" class="dock-btn" data-dock-metric="burn_rate_agri">% เผา/ปลูก DOAE</button>
        <button type="button" class="dock-btn" data-dock-metric="aq_pm25">ฝุ่น PM2.5</button>
        <button type="button" class="dock-btn" data-dock-metric="soil_dry_streak">ดินแห้งติดกัน</button>
        <button type="button" class="dock-btn" id="dockPointsBtn" title="เปิด/ปิดจุด Hotspot รายพิกัดบนแผนที่ (ประหยัด RAM)">จุดไฟ</button>
        <button type="button" class="dock-btn" id="dockTransBtn" title="เปิด/ปิดจุดไฟข้ามแดน 6 ประเทศอาเซียน (3.17 ล้านจุด)">ไฟ 6 ประเทศ</button>
        <button type="button" class="dock-btn" id="dockHeatBtn">Heatmap</button>
      </div>
    </section>

    <aside class="sidebar right">
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">จุดความร้อนในมุมมอง</div>
          <div id="kpiTotal" class="kpi-val">-</div>
          <div id="kpiTotalSub" class="kpi-sub">-</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">เกษตร+ส.ป.ก. vs ป่าไม้</div>
          <div id="kpiAgri" class="kpi-val">-</div>
          <div id="kpiAgriSub" class="kpi-sub">-</div>
        </div>
        <div class="kpi-card">
          <div id="kpiScarLabel" class="kpi-label">รอยเผาไหม้จริง (พ.ค. 2026)</div>
          <div id="kpiScar" class="kpi-val">-</div>
          <div id="kpiScarSub" class="kpi-sub">-</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">อากาศ ERA5 & ท่วมซ้ำ HII</div>
          <div id="kpiFactor" class="kpi-val">-</div>
          <div id="kpiFactorSub" class="kpi-sub">-</div>
        </div>
      </div>

      <div id="insightBox" class="insight-box">กำลังโหลดอินไซต์...</div>

      <div class="section">
        <div class="section-title">
          <span>ความสัมพันธ์ปัจจัยร่วม (คลิกจุดเพื่อซูม)</span>
          <span id="corrBadge" class="badge">r = -</span>
        </div>
        <div class="axis-row">
          <div>
            <label class="field-label" for="scatterX">แกน X (ปัจจัย)</label>
            <select id="scatterX">
              <option value="wx_peak_fwi" selected>ดัชนีอากาศเอื้อไฟ FWI (2022–2026)</option>
              <option value="aq_pm25">PM2.5 เฉลี่ยหน้าแล้ง (µg/m³ · CAMS)</option>
              <option value="aq_exceed">วันฝุ่นเกิน 37.5 µg/m³ (วัน/ปี)</option>
              <option value="soil_wet">ความชื้นผิวดิน NASA GWETTOP (0–1)</option>
              <option value="wx_low_rh_35">วันอากาศแห้งจัด RH&lt;35% (2022–2026)</option>
              <option value="hot_days_38c">วันร้อนจัด ≥38°C (ERA5 22–25)</option>
              <option value="longest_dry_spell_days">ช่วงแล้งยาวสุด (วัน · ERA5)</option>
              <option value="rainfall_total_mm">ฝนรวมทั้งปี (มม. · ERA5)</option>
              <option value="flood_max_17yr">น้ำท่วมซ้ำ 17 ปี (ครั้ง · HII)</option>
              <option value="trp_rai">รอยเผาไหม้ (ไร่ · สสน. ตามรอยเผา)</option>
              <option value="scar_rai">รอยเผาไหม้ (ไร่ · GISTDA)</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="scatterY">แกน Y (ไฟ)</label>
            <select id="scatterY">
              <option value="count" selected>จุดความร้อน</option>
              <option value="density">ความหนาแน่น (จุด/100 ตร.กม.)</option>
              <option value="agri_pct">สัดส่วนเกษตร+ส.ป.ก. (%)</option>
            </select>
          </div>
        </div>
        <div class="chart-box">
          <canvas id="scatterCanvas" class="panel-canvas"></canvas>
        </div>
        <div id="scatterNote" style="font-size:11px;color:var(--muted);"></div>
      </div>

      <div class="section">
        <div class="section-title"><span>แนวโน้มรายปี (เกษตร vs ป่า) & กลางวัน/กลางคืน</span></div>
        <div class="chart-box short">
          <canvas id="trendCanvas" class="panel-canvas"></canvas>
        </div>
      </div>

      <div class="section">
        <div class="section-title"><span id="rankTitle">10 อันดับพื้นที่สูงสุด</span></div>
        <div id="rankList" class="rank-list"></div>
      </div>
    </aside>
  </main>

  <!--__WEATHER_PAGE__-->
  <!--__HAZE_PAGE__-->
  <!--__BURNSCAR_PAGE__-->
  <!--__EXPLORER_MODAL__-->
  </div>

  <button id="exitPresBtn" class="btn primary pres-exit">✕ ออกจากโหมดเต็มจอ</button>
</div>

<div id="searchResults" class="search-results"></div>
<div id="tooltip" class="tooltip"></div>

<div id="provenanceModal" class="modal-backdrop">
  <div class="modal-card">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0">ที่มาของข้อมูลและข้อควรระวังเวลานำไปสอนต่อ</h3>
      <button id="closeModalBtn" class="btn">ปิด</button>
    </div>
    <hr style="border-color:var(--border);margin:10px 0;" />
    <ul style="padding-left:18px;margin:8px 0;">
      <li><strong>จุดความร้อน 5 ปี (`1,278,326` จุด, `2022-01-01` ถึง `2026-11-17`):</strong> จาก GISTDA STAC VIIRS ทุกรายการจับคู่กับขอบเขต ปภ. (77 จังหวัด / 926 อำเภอ / 7,658 ตำบล) และหมู่บ้านใกล้เคียง</li>
      <li><strong>ทำไมค่าเริ่มต้นใช้ Suomi NPP (`N`) + ม.ค.–ต.ค.:</strong> ปี 2022–2023 มีดาวเทียมดวงเดียว (`N`) แต่ปี 2024–2026 มี 3 ดวง (`N`, `N20`, `N21`) ทำให้เกิดจุดซ้ำวันเดียวกันถึง ~33% นอกจากนี้ `N` หยุดส่งข้อมูลหลังวันที่ `1 พ.ย. 2026` จึงตัดเทียบ `ม.ค.–ต.ค.` เพื่อให้ 5 ปีเทียบเท่ากันจริง</li>
      <li><strong>สภาพอากาศเอื้อไฟรายเดือน 5 ปี (`2022-01` ถึง `2026-11`) + พยากรณ์สด 7 วัน (Open-Meteo ERA5 · `CC-BY-4.0`):</strong> ครบทั้ง 77 จังหวัด เก็บอุณหภูมิสูงสุด ความชื้นสัมพัทธ์ต่ำสุด ลมแรง การระเหยน้ำ (ET0) และจำนวนวันไม่ตกฝน โดยคำนวณดัชนีอากาศเอื้อไฟ (FWI 0–100) จาก 30% ความร้อน + 30% ความแห้งอากาศ (RH ต่ำสุด) + 20% สัดส่วนวันไม่ตกฝน + 10% ET0 + 10% ความเร็วลม (เป็นระดับจุดกริดจังหวัด ไม่แบ่งอำเภอ/ตำบล)</li>
      <li><strong>ร่องรอยเผาไหม้ (`gistda_burn_scar` 57 จังหวัด) &amp; เผาซ้ำซาก (`gistda_burn_freq` 53 จังหวัด):</strong> ไม่ครบทั้ง 77 จังหวัด (อีสานหาย 15 จังหวัด ใต้หาย 9 จังหวัดใน `burn_freq`) พื้นที่ที่ไม่มีข้อมูลจึงแสดงเป็น <strong>สีเทา ("ไม่มีข้อมูลต้นทาง")</strong> ห้ามแปลเป็น 0</li>
      <li><strong>รอยเผาไหม้ สสน. "ตามรอยเผา" (`tamroypao.hii.or.th`, Sentinel-2 20 ม.):</strong> ครอบคลุม 62 จังหวัด (`TH10`–`TH76`, ขาดประจวบคีรีขันธ์และภาคใต้ 14 จังหวัดซึ่งแสดงเป็นสีเทา "ไม่มีข้อมูล") ทั้งแบบตัวเลขออฟไลน์ระดับจังหวัด/อำเภอ/ตำบล 3 ฤดูฝุ่น (`2567–2569` = `2024–2026`) แยกข้าว/อ้อย/ข้าวโพด/พืชผสม/ป่า (1 พิกเซล 20×20 ม. = 0.25 ไร่) และชั้นภาพ TMS ออนไลน์ความละเอียด 20 ม.</li>
      <li><strong>ภูมิอากาศฐาน 10 ปี ERA5 (`approved_public`, 2016–2025):</strong> ค่าเฉลี่ยอุณหภูมิ/ฝน/วันร้อนจัดระดับ 77 จังหวัด ใช้เป็นเส้นฐาน (Baseline) เพื่อดูว่าปี 2022–2026 ร้อนและแล้งกว่าค่าปกติแค่ไหน</li>
      <li><strong>ความเสี่ยงน้ำท่วมซ้ำซาก HII (`pending` ใช้ภายในเครื่อง):</strong> ครอบคลุม 6,434 ตำบลที่เคยท่วมในรอบ 17 ปี (ขาดภูเก็ต/ระนอง และ 1,224 ตำบลที่ไม่อยู่ในบัญชี) พื้นที่ขาดข้อมูลแสดงเป็นสีเทา</li>
      <li><strong>ฝุ่น PM2.5, CO &amp; AOD (Open-Meteo CAMS `CC-BY-4.0` 2022-08..2026-11 + GISTDA เช็คฝุ่นสด):</strong> ข้อมูลรายวัน/รายเดือน 77 จังหวัดระดับกริด (และค่ารายจังหวัด/อำเภอสดจาก `pm25.gistda.or.th`)</li>
      <li><strong>หมอกควันข้ามแดน 6 ประเทศอาเซียน (NASA FIRMS VIIRS-SNPP `Public Domain` 2022–2025):</strong> เทียบมาตรฐานดาวเทียม N เดียวกันระหว่าง ไทย, เมียนมา, ลาว, กัมพูชา, เวียดนาม, มาเลเซีย</li>
      <li><strong>ความชื้นดิน NASA POWER (`Public Domain`), พื้นที่ปลูก DOAE (`Open Data Common` 2566–2567), อ่างเก็บน้ำ 461 แห่ง (RID `2022–2026`), ราคาสินค้าเกษตร (สศก./NABC):</strong> แปลงค่าขาดเป็น `null` ทั้งหมด; % เผาเทียบพื้นที่ปลูกใช้ DOAE ปี 2566 เพื่อไม่ให้นับซ้ำข้ามงวด</li>
      <li><strong>จุดซ้ำถาวร (`143` พิกัด / `7,324` จุด):</strong> เกิดซ้ำจุดเดิม ≥25 วัน มักเป็นโรงงาน/เตาเผา/โรงไฟฟ้าชีวมวล (92% โผล่ตอนกลางคืน) ถูกตัดออกโดยค่าเริ่มต้น</li>
    </ul>
  </div>
</div>

<script id="payloadB64" type="text/plain">__PAYLOAD_B64__</script>
<script>
(function() {
  "use strict";

  const PALETTES = {
    fire: ["#fef3c7", "#fde047", "#f59e0b", "#ea580c", "#dc2626", "#7f1d1d"],
    agri: ["#fef9c3", "#fde047", "#f59e0b", "#ea580c", "#c2410c", "#7c2d12"],
    heat: ["#dcfce7", "#fef08a", "#fdba74", "#f97316", "#dc2626", "#6b1126"],
    hazard: ["#fef3c7", "#fcd34d", "#f59e0b", "#ea580c", "#dc2626", "#6b1126"],
    moisture: ["#7f1d1d", "#dc2626", "#f97316", "#fde047", "#7dd3fc", "#0284c7"],
    rain: ["#fef3c7", "#bae6fd", "#38bdf8", "#0284c7", "#1d4ed8", "#1e3a8a"],
  };
  const CROPS = { all: null, agri: null, forest: null, rice: 1, sugarcane: 2, corn: 3 };
  const SEASON_MASKS = {
    all: [true, true, true, true],
    peak: [true, true, false, false],
    early: [true, false, false, false],
    off: [false, false, true, false],
    late: [false, false, false, true],
  };

  let DATA = null;
  let CUBE_FLAT = new Int32Array(0);
  let GRID_FLAT = new Int32Array(0);
  let TRANS_GRID_FLAT = new Int32Array(0);
  let EXACT_TH_PTS = null;
  let EXACT_TH_LOADING = false;
  let EXACT_GMS_PTS = null;
  let EXACT_GMS_LOADING = false;
  let WMS_IMAGE_CACHE = new Map();
  let PROV_MAP = new Map();
  let AMP_MAP = new Map();
  let TB_MAP = new Map();
  let SEARCH_INDEX = [];
  let TILE_CACHE = new Map();

  const state = {
    sat: "N",
    janOct: true,
    year: "all",
    season: "all",
    crop: "all",
    excludeStatic: true,
    metric: "count",
    showAreaFill: true,
    levelMode: "auto",
    selectedProv: null,
    selectedAmphoe: null,
    selectedTambon: null,
    showPoints: false,
    showTransPoints: false,
    showLive7d: false,
    ptColorMode: "type",
    ptYearMask: [true, true, true, true, true],
    ptTypes: { forest: true, rice: true, sugarcane: true, corn: true, agri_other: true, other: true },
    ptGmsCountryMask: [false, true, true, true, true, true],
    ptGmsYearMask: [true, true, true, true],
    showHeat: false,
    showStatic: false,
    showVillages: false,
    gistdaWms: "none",
    tmsOverlay: "none",
    basemap: "none",
    scatterX: "wx_peak_fwi",
    scatterY: "count",
    theme: document.documentElement.dataset.theme,
    presentation: false,
    // Camera in Web-Mercator [0..1]
    camX: 0.781,
    camY: 0.462,
    zoom: 5.55,
    hoverItem: null,
    computedStats: null,
    scatterDots: [],
  };

  const els = {};
  const ids = [
    "loadingMask","dateBadge","breadcrumbs","searchInput","searchResults","exportCsvBtn",
    "provenanceBtn","themeToggle","presentationBtn","exitPresBtn",
    "satSelect","janOctCheck","satWarnPill","yearSelect","seasonSelect","cropSelect",
    "excludeStaticCheck","metricSelect","showAreaFillCheck","levelModeSelect","grainWarnPill",
    "showPointsCheck","showTransPointsCheck","showLive7dCheck","showHeatCheck","showStaticCheck","showVillagesCheck","gistdaWmsSelect","tmsOverlaySelect","basemapSelect",
    "mapCanvas","scopePill","resetZoomBtn","zoomInBtn","zoomOutBtn","zoomReadout",
    "legendBox","areaFillLegend","legendTitle","legendBar","legMin","legMid","legMax","legendNullChip","tmsLegendChip","tooltip",
    "kpiTotal","kpiTotalSub","kpiAgri","kpiAgriSub","kpiScarLabel","kpiScar","kpiScarSub","kpiFactor","kpiFactorSub",
    "insightBox","corrBadge","scatterX","scatterY","scatterCanvas","scatterNote",
    "trendCanvas","rankTitle","rankList","provenanceModal","closeModalBtn"
  ];
  for (const id of ids) els[id] = document.getElementById(id);
  els.workspace = document.getElementById("page-map");

  function lonToMx(lon) { return (lon + 180) / 360; }
  function latToMy(lat) {
    const rad = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  }
  function mxToLon(mx) { return mx * 360 - 180; }
  function myToLat(my) {
    const n = Math.PI - 2 * Math.PI * my;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  const PAYLOAD_URL = "__PAYLOAD_URL__";

  async function decodePayload() {
    let bytes;
    const b64 = (document.getElementById("payloadB64")?.textContent || "").trim();
    if (b64) {
      const binStr = atob(b64);
      bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    } else if (PAYLOAD_URL) {
      els.loadingMask.querySelector("div:last-child").textContent = "กำลังโหลดชุดข้อมูลสรุปจาก Hugging Face (~4.2 MB)...";
      const resp = await fetch(PAYLOAD_URL);
      if (!resp.ok) throw new Error(`โหลดข้อมูลจาก Hugging Face ไม่สำเร็จ (HTTP ${resp.status})`);
      bytes = new Uint8Array(await resp.arrayBuffer());
    } else {
      throw new Error("ไม่พบชุดข้อมูลแผนที่ในหน้าเว็บนี้");
    }
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    if (!isGzip) {
      return JSON.parse(new TextDecoder("utf-8").decode(bytes));
    }
    if (typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      const text = await new Response(stream).text();
      return JSON.parse(text);
    }
    throw new Error("เบราว์เซอร์ไม่รองรับ DecompressionStream('gzip') กรุณาเปิดด้วย Chrome/Edge รุ่นใหม่");
  }

  function prepareData(raw) {
    DATA = raw;
    const precomputeRings = (arr, mapObj, kind) => {
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        it._idx = i;
        const srcRings = it.rings || [];
        const fRings = new Array(srcRings.length);
        for (let r = 0; r < srcRings.length; r++) {
          const ring = srcRings[r];
          const fa = new Float32Array(ring.length * 2);
          for (let k = 0; k < ring.length; k++) {
            fa[k * 2] = lonToMx(ring[k][0]);
            fa[k * 2 + 1] = latToMy(ring[k][1]);
          }
          fRings[r] = fa;
        }
        it._mRings = fRings;
        delete it.rings; // Free raw JSON vertex arrays immediately (~45 MB RAM saved)
        mapObj.set(it.code, it);
        const provSub = it.prov_code ? (PROV_MAP.get(it.prov_code)?.name_th || "") : "";
        const ampSub = kind === "tambon" && it.amphoe_code ? ("อ." + (AMP_MAP.get(it.amphoe_code)?.name_th || "") + " · จ.") : "";
        SEARCH_INDEX.push({
          kind, code: it.code, name: it.name_th, nameLower: (it.name_th || "").toLowerCase(),
          sub: ampSub + provSub,
          prov_code: it.prov_code || it.code, amphoe_code: it.amphoe_code || (kind === "amphoe" ? it.code : null),
          bbox: it.bbox,
        });
      }
    };
    precomputeRings(DATA.provinces, PROV_MAP, "province");
    precomputeRings(DATA.amphoes, AMP_MAP, "amphoe");
    precomputeRings(DATA.tambons, TB_MAP, "tambon");

    // Pack cube (N x 5) and grid (M x 4) into flat Int32Arrays (~60 MB JS Array RAM -> ~8.5 MB)
    const rawCube = raw.cube || [];
    CUBE_FLAT = new Int32Array(rawCube.length * 5);
    for (let i = 0, o = 0; i < rawCube.length; i++, o += 5) {
      const row = rawCube[i];
      CUBE_FLAT[o] = row[0]; CUBE_FLAT[o + 1] = row[1]; CUBE_FLAT[o + 2] = row[2];
      CUBE_FLAT[o + 3] = row[3]; CUBE_FLAT[o + 4] = row[4];
    }
    raw.cube = null;

    const rawGrid = raw.grid || [];
    GRID_FLAT = new Int32Array(rawGrid.length * 4);
    for (let i = 0, o = 0; i < rawGrid.length; i++, o += 4) {
      const g = rawGrid[i];
      GRID_FLAT[o] = g[0]; GRID_FLAT[o + 1] = g[1]; GRID_FLAT[o + 2] = g[2]; GRID_FLAT[o + 3] = g[3];
    }
    raw.grid = null;

    // Pack 6-country GMS transboundary point grid (20,000 cells x 6 ints = 480 KB flat Int32Array, 0 GC pressure)
    const rawTrans = raw.trans_grid || [];
    TRANS_GRID_FLAT = new Int32Array(rawTrans.length * 6);
    for (let i = 0, o = 0; i < rawTrans.length; i++, o += 6) {
      const t = rawTrans[i];
      TRANS_GRID_FLAT[o] = t[0]; TRANS_GRID_FLAT[o + 1] = t[1]; TRANS_GRID_FLAT[o + 2] = t[2];
      TRANS_GRID_FLAT[o + 3] = t[3]; TRANS_GRID_FLAT[o + 4] = t[4]; TRANS_GRID_FLAT[o + 5] = t[5];
    }
    raw.trans_grid = null;

    els.dateBadge.textContent = (DATA.meta.min_date || "2022") + " – " + (DATA.meta.max_date || "2026");
  }

  function getActiveSeasonMask() {
    const m = SEASON_MASKS[state.season].slice();
    if (state.janOct) m[3] = false; // exclude Nov-Dec
    return m;
  }

  function escHtml(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function csvCell(v) {
    if (v === null || v === undefined) return '""';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function formatNum(n, dec = 0) {
    if (n === null || n === undefined || Number.isNaN(n)) return "ไม่มีข้อมูล";
    return Number(n).toLocaleString("th-TH", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function positionTooltip(clientX, clientY) {
    const tt = els.tooltip;
    if (!tt) return;
    const tw = tt.offsetWidth || 270;
    const th = tt.offsetHeight || 140;
    const pad = 12;
    let left = clientX + 16;
    if (left + tw + pad > window.innerWidth) {
      left = Math.max(pad, clientX - tw - 16);
    }
    let top = clientY - Math.round(th * 0.35);
    if (top + th + pad > window.innerHeight) {
      top = window.innerHeight - th - pad;
    }
    if (top < pad) top = pad;
    tt.style.left = left + "px";
    tt.style.top = top + "px";
  }

  function showTooltip(clientX, clientY, htmlContent, accentColor = "") {
    const tt = els.tooltip;
    if (!tt) return;
    if (accentColor) tt.style.setProperty("--tt-accent", accentColor);
    else tt.style.removeProperty("--tt-accent");
    if (tt._lastHtml !== htmlContent) {
      tt.innerHTML = htmlContent;
      tt._lastHtml = htmlContent;
    }
    tt.style.display = "block";
    positionTooltip(clientX, clientY);
  }

  function hideTooltip() {
    const tt = els.tooltip;
    if (!tt) return;
    tt.style.display = "none";
  }

  function getEra5Metric(provObj, key) {
    const e = provObj.era5 || {};
    if (state.year === "2026") return null;
    if (state.year !== "all") {
      return e[state.year]?.[key] ?? null;
    }
    const vals = ["2022", "2023", "2024", "2025"].map(y => e[y]?.[key]).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function getWxAnnualMetric(provObj, key) {
    const w = provObj.wx_y || {};
    if (state.year !== "all") {
      return w[state.year]?.[key] ?? null;
    }
    const vals = ["2022", "2023", "2024", "2025", "2026"].map(y => w[y]?.[key]).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function getAqAnnualMetric(provObj, key) {
    const a = provObj.aq_y || {};
    if (state.year !== "all") {
      return a[state.year]?.[key] ?? null;
    }
    const vals = ["2023", "2024", "2025", "2026"].map(y => a[y]?.[key]).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((x, y) => x + y, 0) / vals.length;
  }

  function getSoilAnnualMetric(provObj, key) {
    const s = provObj.soil_y || {};
    if (state.year !== "all") {
      return s[state.year]?.[key] ?? null;
    }
    const vals = ["2022", "2023", "2024", "2025", "2026"].map(y => s[y]?.[key]).filter(v => v !== null && v !== undefined);
    if (!vals.length) return null;
    return vals.reduce((x, y) => x + y, 0) / vals.length;
  }

  function getDoaePlantedMetric(item, cropOverride) {
    if (!item) return null;
    const c = cropOverride || state.crop;
    if (item.doae_2566) {
      const d = item.doae_2566;
      if (c === "rice") return d.paddy_rai || null;
      if (c === "sugarcane") return d.sugarcane_rai || null;
      if (c === "corn") return d.corn_rai || null;
      const tot = (d.paddy_rai || 0) + (d.sugarcane_rai || 0) + (d.corn_rai || 0);
      return tot > 0 ? tot : null;
    }
    if (item.doae && Array.isArray(item.doae)) {
      const d = item.doae;
      if (c === "rice") return d[0] > 0 ? d[0] : null;
      if (c === "sugarcane") return d[1] > 0 ? d[1] : null;
      if (c === "corn") return d[2] > 0 ? d[2] : null;
      return d[4] > 0 ? d[4] : null;
    }
    return null;
  }

  function getBurnRateMetric(item) {
    if (!item || item.trp === null || item.trp === undefined) return null;
    const yr = (state.year === "all" || state.year === "2022" || state.year === "2023") ? "2026" : state.year;
    const a = item.trp[yr];
    if (!a) return null;
    const plant = getDoaePlantedMetric(item, state.crop);
    if (!plant || plant <= 0) return null;
    let burn = 0;
    if (state.crop === "rice") burn = a[0] || 0;
    else if (state.crop === "sugarcane") burn = a[1] || 0;
    else if (state.crop === "corn") burn = a[2] || 0;
    else burn = (a[0] || 0) + (a[1] || 0) + (a[2] || 0);
    return Math.min(100, +(burn * 100 / plant).toFixed(2));
  }

  function getTrpBreakdown(item) {
    if (!item || item.trp === null || item.trp === undefined) return null;
    if (state.year === "2022" || state.year === "2023") return null;
    const trpYears = (DATA.meta && DATA.meta.trp_years && DATA.meta.trp_years.length)
      ? DATA.meta.trp_years.map(String)
      : ["2024", "2025", "2026"];
    const yrs = state.year === "all" ? trpYears : (trpYears.includes(state.year) ? [state.year] : []);
    if (!yrs.length) return null;
    let paddy = 0, sugar = 0, corn = 0, mixed = 0, forest = 0;
    for (const y of yrs) {
      const a = item.trp[y];
      if (a) {
        paddy += a[0] || 0;
        sugar += a[1] || 0;
        corn += a[2] || 0;
        mixed += a[3] || 0;
        forest += a[4] || 0;
      }
    }
    const agri = paddy + sugar + corn + mixed;
    const total = agri + forest;
    return { paddy, sugar, corn, mixed, agri, forest, total };
  }

  function getTrpMetric(item, cropOverride) {
    const b = getTrpBreakdown(item);
    if (!b) return null;
    const c = cropOverride || state.crop;
    if (c === "rice") return b.paddy;
    if (c === "sugarcane") return b.sugar;
    if (c === "corn") return b.corn;
    if (c === "agri") return b.agri;
    if (c === "forest") return b.forest;
    return b.total;
  }

  function computeFilteredStats() {
    const yrIdx = state.year === "all" ? -1 : (Number(state.year) - 2022);
    const seaMask = getActiveSeasonMask();
    const cropFilter = state.crop;
    const satOnlyN = state.sat === "N";
    const exclSt = state.excludeStatic;

    const tbStats = new Array(DATA.tambons.length);
    for (let i = 0; i < DATA.tambons.length; i++) {
      tbStats[i] = { total: 0, agri: 0, forest: 0, other: 0, day: 0, frp10: 0, yrMask: 0 };
    }

    const yearlyTotals = [
      { year: 2022, agri: 0, forest: 0, other: 0, total: 0 },
      { year: 2023, agri: 0, forest: 0, other: 0, total: 0 },
      { year: 2024, agri: 0, forest: 0, other: 0, total: 0 },
      { year: 2025, agri: 0, forest: 0, other: 0, total: 0 },
      { year: 2026, agri: 0, forest: 0, other: 0, total: 0 },
    ];

    const scopeLevel = getActiveScopeLevel();
    const matchScope = (tb) => {
      if (state.selectedTambon) return tb.code === state.selectedTambon;
      if (state.selectedAmphoe) return tb.amphoe_code === state.selectedAmphoe;
      if (state.selectedProv) return tb.prov_code === state.selectedProv;
      return true;
    };

    for (let o = 0; o < CUBE_FLAT.length; o += 5) {
      const f = CUBE_FLAT[o + 1];
      const isOtherSat = f & 1;
      if (satOnlyN && isOtherSat) continue;
      const st = (f >> 10) & 1;
      if (exclSt && st) continue;
      const sea = (f >> 4) & 3;
      if (!seaMask[sea]) continue;
      const lu = (f >> 6) & 3;
      const crop = (f >> 8) & 3;
      if (cropFilter === "agri" && lu !== 0) continue;
      if (cropFilter === "forest" && lu !== 1) continue;
      if (cropFilter === "rice" && crop !== 1) continue;
      if (cropFilter === "sugarcane" && crop !== 2) continue;
      if (cropFilter === "corn" && crop !== 3) continue;

      const yr = (f >> 1) & 7;
      const cnt = CUBE_FLAT[o + 2];
      const tbIdx = CUBE_FLAT[o];
      const tb = DATA.tambons[tbIdx];
      if (matchScope(tb)) {
        const yt = yearlyTotals[yr];
        if (yt) {
          yt.total += cnt;
          if (lu === 0) yt.agri += cnt;
          else if (lu === 1) yt.forest += cnt;
          else yt.other += cnt;
        }
      }

      if (yrIdx !== -1 && yr !== yrIdx) continue;
      const s = tbStats[tbIdx];
      s.total += cnt;
      if (lu === 0) s.agri += cnt;
      else if (lu === 1) s.forest += cnt;
      else s.other += cnt;
      s.day += CUBE_FLAT[o + 3];
      s.frp10 += CUBE_FLAT[o + 4];
      s.yrMask |= (1 << yr);
    }

    // Aggregate to Amphoe & Province
    const ampMap = new Map();
    const provMap = new Map();
    for (const a of DATA.amphoes) {
      ampMap.set(a.code, { total: 0, agri: 0, forest: 0, other: 0, day: 0, frp10: 0, activeYears: new Set() });
    }
    for (const p of DATA.provinces) {
      provMap.set(p.code, { total: 0, agri: 0, forest: 0, other: 0, day: 0, frp10: 0, activeYears: new Set() });
    }

    for (let i = 0; i < DATA.tambons.length; i++) {
      const tb = DATA.tambons[i];
      const s = tbStats[i];
      let yrCnt = 0;
      for (let b = 0; b < 5; b++) if (s.yrMask & (1 << b)) yrCnt++;
      s.activeYears = yrCnt;
      if (s.total > 0) {
        const am = ampMap.get(tb.amphoe_code);
        if (am) {
          am.total += s.total; am.agri += s.agri; am.forest += s.forest; am.other += s.other;
          am.day += s.day; am.frp10 += s.frp10;
          for (let b = 0; b < 5; b++) if (s.yrMask & (1 << b)) am.activeYears.add(b);
        }
        const pm = provMap.get(tb.prov_code);
        if (pm) {
          pm.total += s.total; pm.agri += s.agri; pm.forest += s.forest; pm.other += s.other;
          pm.day += s.day; pm.frp10 += s.frp10;
          for (let b = 0; b < 5; b++) if (s.yrMask & (1 << b)) pm.activeYears.add(b);
        }
      }
    }

    // Helper to enrich items with density + hazard index (0..100)
    const enrich = (items, statsGetter, level) => {
      const records = items.map((it) => {
        const st = statsGetter(it);
        const total = st.total;
        const density = it.area_sqkm > 0 ? (total * 100 / it.area_sqkm) : null;
        const agriPct = total > 0 ? (st.agri * 100 / total) : null;
        const activeYears = st.activeYears instanceof Set ? st.activeYears.size : st.activeYears;
        return { item: it, st, total, density, agriPct, activeYears };
      });
      // Compute rank percentiles for Dual Hazard (Flood HII + Burn N/density)
      const withFlood = records.filter(r => r.item.flood_max_17yr !== null && r.item.flood_max_17yr !== undefined);
      const floodSorted = withFlood.map(r => r.item.flood_max_17yr).sort((a, b) => a - b);
      const densSorted = records.filter(r => r.density !== null).map(r => r.density).sort((a, b) => a - b);
      const rankOf = (sorted, val) => {
        if (val === null || val === undefined) return 0;
        if (sorted.length <= 1) return val > 0 ? 1 : 0;
        let lo = 0, hi = sorted.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (sorted[mid] < val) lo = mid + 1; else hi = mid;
        }
        return lo / (sorted.length - 1);
      };
      const maxYrs = yrIdx === -1 ? 5 : 1;
      for (const r of records) {
        if (r.item.flood_max_17yr === null || r.item.flood_max_17yr === undefined) {
          r.hazard = null;
          r.hazardLabel = "ไม่มีข้อมูล HII";
        } else {
          const fRank = rankOf(floodSorted, r.item.flood_max_17yr);
          const dRank = (r.total === 0 || r.density === null) ? 0 : rankOf(densSorted, r.density);
          const yRank = r.activeYears / maxYrs;
          const bScore = 0.5 * yRank + 0.5 * dRank;
          r.hazard = Math.round((0.5 * fRank + 0.5 * bScore) * 100);
          const fHi = r.item.flood_max_17yr >= 4;
          const bHi = bScore >= 0.6;
          r.hazardLabel = fHi && bHi ? "เสี่ยงซ้ำซ้อนสูงมาก" : fHi ? "ท่วมหนัก/เผาน้อย" : bHi ? "เผาหนัก/ท่วมน้อย" : "เสี่ยงต่ำ";
        }
        r.metricValue = pickMetricValue(r, level);
      }
      return records;
    };

    const provRecords = enrich(DATA.provinces, p => provMap.get(p.code), "province");
    const ampRecords = enrich(DATA.amphoes, a => ampMap.get(a.code), "amphoe");
    const tbRecords = enrich(DATA.tambons, t => tbStats[t._idx], "tambon");

    // Aggregate cells when Heatmap OR Thailand Hotspot Point layer is enabled
    // GRID_FLAT stores true mean coordinates (lat4 = deg*10000, lon4 = deg*10000) so points never form a grid lattice
    let maxGridCnt = 1;
    const gridCells = [];
    if ((state.showHeat || (state.showPoints && !EXACT_TH_PTS)) && GRID_FLAT.length) {
      const cellAgg = new Map();
      for (let o = 0; o < GRID_FLAT.length; o += 4) {
        const f = GRID_FLAT[o + 2];
        if (satOnlyN && (f & 1)) continue;
        if (exclSt && ((f >> 10) & 1)) continue;
        if (yrIdx !== -1 && (((f >> 1) & 7) !== yrIdx)) continue;
        if (!seaMask[(f >> 4) & 3]) continue;
        const lu = (f >> 6) & 3;
        const crop = (f >> 8) & 3;
        if (cropFilter === "agri" && lu !== 0) continue;
        if (cropFilter === "forest" && lu !== 1) continue;
        if (cropFilter === "rice" && crop !== 1) continue;
        if (cropFilter === "sugarcane" && crop !== 2) continue;
        if (cropFilter === "corn" && crop !== 3) continue;
        const rawLat = GRID_FLAT[o], rawLon = GRID_FLAT[o + 1], cnt = GRID_FLAT[o + 3];
        const lat = rawLat > 5000 ? rawLat / 10000 : rawLat / 20;
        const lon = rawLon > 5000 ? rawLon / 10000 : rawLon / 20;
        const latCell = Math.round(lat * 20), lonCell = Math.round(lon * 20);
        const key = (latCell << 16) ^ lonCell;
        let prev = cellAgg.get(key);
        if (!prev) {
          cellAgg.set(key, {
            latSum: lat * cnt, lonSum: lon * cnt,
            lat, lon,
            mx: lonToMx(lon), my: latToMy(lat),
            cnt, agriCnt: lu === 0 ? cnt : 0, forCnt: lu === 1 ? cnt : 0,
          });
        } else {
          prev.latSum += lat * cnt;
          prev.lonSum += lon * cnt;
          prev.cnt += cnt;
          prev.lat = prev.latSum / prev.cnt;
          prev.lon = prev.lonSum / prev.cnt;
          prev.mx = lonToMx(prev.lat ? prev.lon : lon);
          prev.my = latToMy(prev.lat);
          if (lu === 0) prev.agriCnt += cnt;
          else if (lu === 1) prev.forCnt += cnt;
        }
      }
      for (const c of cellAgg.values()) {
        if (c.cnt > maxGridCnt) maxGridCnt = c.cnt;
        gridCells.push(c);
      }
    }

    state.computedStats = {
      provRecords, ampRecords, tbRecords,
      provByCode: new Map(provRecords.map(r => [r.item.code, r])),
      ampByCode: new Map(ampRecords.map(r => [r.item.code, r])),
      tbByCode: new Map(tbRecords.map(r => [r.item.code, r])),
      yearlyTotals,
      gridCells,
      maxGridCnt,
    };
  }

  function pickMetricValue(rec, level) {
    const m = state.metric;
    const it = rec.item;
    if (m === "count") return rec.total;
    if (m === "density") return rec.density;
    if (m === "agri_pct") return rec.agriPct;
    if (m === "trp_rai") return getTrpMetric(it);
    if (m === "scar_rai") return it.scar_rai;
    if (m === "freq_rai") return it.freq_rai;
    if (m === "hazard") return rec.hazard;
    if (m.startsWith("era5_")) {
      if (level !== "province") return null;
      const keyMap = { era5_hot: "hot_days_38c", era5_dry: "longest_dry_spell_days", era5_rain: "rainfall_total_mm" };
      return getEra5Metric(it, keyMap[m]);
    }
    if (m.startsWith("wx_")) {
      if (level !== "province") return null;
      const wxMap = {
        wx_fwi: "peak_fwi",
        wx_tmax: "tmax",
        wx_rhmin: "rh_min",
        wx_low_rh: "low_rh_35",
        wx_wind: "wind_max",
        wx_rain: "rain",
      };
      return getWxAnnualMetric(it, wxMap[m]);
    }
    if (m === "aq_pm25") return level === "province" ? getAqAnnualMetric(it, "pm25_peak") : null;
    if (m === "aq_exceed") return level === "province" ? getAqAnnualMetric(it, "days_37_5") : null;
    if (m === "aq_co") return level === "province" ? getAqAnnualMetric(it, "co_peak") : null;
    if (m === "soil_wet") return level === "province" ? getSoilAnnualMetric(it, "gwettop_peak") : null;
    if (m === "soil_dry_streak") {
      if (level !== "province") return null;
      const s = it.soil_y || {};
      if (state.year !== "all") return s[state.year]?.max_dry_streak ?? null;
      const vals = ["2022", "2023", "2024", "2025", "2026"].map(y => s[y]?.max_dry_streak).filter(v => v !== null && v !== undefined);
      return vals.length ? Math.max(...vals) : null;
    }
    if (m === "doae_plant_rai") return getDoaePlantedMetric(it);
    if (m === "burn_rate_agri") return getBurnRateMetric(it);
    return rec.total;
  }

  function getActiveScopeLevel() {
    if (state.levelMode === "province") return "province";
    if (state.levelMode === "amphoe_all") return "amphoe_all";
    if (state.selectedAmphoe) return "tambon";
    if (state.selectedProv) return "amphoe";
    return "province";
  }

  function getVisibleRecords() {
    const cs = state.computedStats;
    const lvl = getActiveScopeLevel();
    if (lvl === "province") return { level: "province", records: cs.provRecords };
    if (lvl === "amphoe_all") return { level: "amphoe", records: cs.ampRecords };
    if (lvl === "amphoe") {
      return { level: "amphoe", records: cs.ampRecords.filter(r => r.item.prov_code === state.selectedProv) };
    }
    return { level: "tambon", records: cs.tbRecords.filter(r => r.item.amphoe_code === state.selectedAmphoe) };
  }

  function getPaletteForMetric(m) {
    if (m === "agri_pct" || m === "burn_rate_agri" || m === "doae_plant_rai") return PALETTES.agri;
    if (m === "wx_rhmin" || m === "soil_wet") return PALETTES.moisture;
    if (m === "era5_rain" || m === "wx_rain") return PALETTES.rain;
    if (m === "era5_hot" || m === "era5_dry" || m === "wx_fwi" || m === "wx_tmax" || m === "wx_low_rh" || m === "wx_wind" || m === "aq_pm25" || m === "aq_exceed" || m === "aq_co" || m === "soil_dry_streak") return PALETTES.heat;
    if (m === "hazard") return PALETTES.hazard;
    return PALETTES.fire;
  }

  function getPaletteAndColor(val, minV, maxV, nullFill) {
    if (val === null || val === undefined || Number.isNaN(val)) return nullFill || "#334155";
    const m = state.metric;
    const pal = getPaletteForMetric(m);

    const span = maxV - minV;
    if (span <= 0) return pal[val > 0 ? 3 : 0];
    let t = (val - minV) / span;
    if (m === "count" || m === "density" || m === "trp_rai" || m === "scar_rai" || m === "freq_rai" || m === "doae_plant_rai") {
      // Perceptual sqrt scaling so mid-tier agricultural hotspots stand out cleanly
      t = Math.sqrt(Math.max(0, t));
    }
    t = Math.max(0, Math.min(1, t));
    const idx = t * (pal.length - 1);
    const i0 = Math.floor(idx), i1 = Math.min(pal.length - 1, i0 + 1);
    const f = idx - i0;
    return lerpHex(pal[i0], pal[i1], f);
  }

  function lerpHex(c1, c2, t) {
    const p = (s, o) => parseInt(s.slice(o, o + 2), 16);
    const r = Math.round(p(c1,1) + (p(c2,1) - p(c1,1)) * t);
    const g = Math.round(p(c1,3) + (p(c2,3) - p(c1,3)) * t);
    const b = Math.round(p(c1,5) + (p(c2,5) - p(c1,5)) * t);
    return `rgb(${r},${g},${b})`;
  }

  function drawTileWithFallback(ctx, keyBuilder, z, tx, ty, dx, dy, tilePx, minZ) {
    const entry = TILE_CACHE.get(keyBuilder(z, tx, ty));
    if (entry && entry.ok && entry.img.width) {
      ctx.drawImage(entry.img, dx, dy, tilePx + 0.6, tilePx + 0.6);
      return;
    }
    for (let dz = 1; dz <= 2; dz++) {
      const pz = z - dz;
      if (pz < minZ) break;
      const px = tx >> dz, py = ty >> dz;
      const parent = TILE_CACHE.get(keyBuilder(pz, px, py));
      if (parent && parent.ok && parent.img.width) {
        const div = 1 << dz;
        const sw = parent.img.width / div;
        const sh = parent.img.height / div;
        const sx = (tx - (px << dz)) * sw;
        const sy = (ty - (py << dz)) * sh;
        ctx.drawImage(parent.img, sx, sy, sw, sh, dx, dy, tilePx + 0.6, tilePx + 0.6);
        return;
      }
    }
  }

  function notifyTileLoaded() {
    if (activePage === "burnscar" && typeof requestDrawBsMap === "function") requestDrawBsMap();
    if (activePage === "map") requestDrawMap();
  }

  function drawTiles(ctx, w, h) {
    if (state.basemap === "none") return;
    const maxTileZ = state.basemap === "carto_dark" ? 17 : 18;
    const z = Math.max(4, Math.min(maxTileZ, Math.round(state.zoom)));
    const nTiles = 1 << z;
    const worldPx = 256 * Math.pow(2, state.zoom);
    const leftMx = state.camX - (w / 2) / worldPx;
    const rightMx = state.camX + (w / 2) / worldPx;
    const topMy = state.camY - (h / 2) / worldPx;
    const botMy = state.camY + (h / 2) / worldPx;

    const tx0 = Math.max(0, Math.floor(leftMx * nTiles));
    const tx1 = Math.min(nTiles - 1, Math.floor(rightMx * nTiles));
    const ty0 = Math.max(0, Math.floor(topMy * nTiles));
    const ty1 = Math.min(nTiles - 1, Math.floor(botMy * nTiles));
    const tilePx = worldPx / nTiles;
    const keyFor = (lz, lx, ly) => `${state.basemap}:${lz}:${lx}:${ly}`;

    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const key = keyFor(z, tx, ty);
        let entry = TILE_CACHE.get(key);
        if (!entry) {
          const img = new Image();
          let url = "";
          if (state.basemap === "osm") url = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
          else if (state.basemap === "carto_dark") url = `https://a.basemaps.cartocdn.com/dark_all/${z}/${tx}/${ty}.png`;
          else if (state.basemap === "esri_sat") url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
          entry = { img, ok: false, err: false };
          img.onload = () => { entry.ok = true; notifyTileLoaded(); };
          img.onerror = () => { entry.err = true; };
          img.src = url;
          if (TILE_CACHE.size > 640) {
            const firstKey = TILE_CACHE.keys().next().value;
            TILE_CACHE.delete(firstKey);
          }
          TILE_CACHE.set(key, entry);
        }
        const dx = (tx / nTiles - state.camX) * worldPx + w / 2;
        const dy = (ty / nTiles - state.camY) * worldPx + h / 2;
        drawTileWithFallback(ctx, keyFor, z, tx, ty, dx, dy, tilePx, 4);
      }
    }
  }

  function resolveTmsLayers(val) {
    if (!val || val === "none") return [];
    const m = val.match(/^(\d{4})\/BOTH_(\d{6}_\d{6})$/);
    if (m) {
      return [
        `${m[1]}/BURNSCAR_NORTH_20M_${m[2]}_B3A_COLOR`,
        `${m[1]}/BURNSCAR_NORTH_20M_${m[2]}_B3F_COLOR`,
      ];
    }
    return [val];
  }

  function drawTmsOverlay(ctx, w, h) {
    const layers = resolveTmsLayers(state.tmsOverlay);
    if (!layers.length) return;
    const z = Math.max(6, Math.min(15, Math.round(state.zoom)));
    const nTiles = 1 << z;
    const worldPx = 256 * Math.pow(2, state.zoom);
    const leftMx = state.camX - (w / 2) / worldPx;
    const rightMx = state.camX + (w / 2) / worldPx;
    const topMy = state.camY - (h / 2) / worldPx;
    const botMy = state.camY + (h / 2) / worldPx;

    const tx0 = Math.max(0, Math.floor(leftMx * nTiles));
    const tx1 = Math.min(nTiles - 1, Math.floor(rightMx * nTiles));
    const ty0 = Math.max(0, Math.floor(topMy * nTiles));
    const ty1 = Math.min(nTiles - 1, Math.floor(botMy * nTiles));
    const tilePx = worldPx / nTiles;

    ctx.save();
    ctx.globalAlpha = 0.92;
    if (state.zoom > 15) ctx.imageSmoothingEnabled = false;
    for (const layerPath of layers) {
      const keyFor = (lz, lx, ly) => `tms:${layerPath}:${lz}:${lx}:${(1 << lz) - 1 - ly}`;
      for (let tx = tx0; tx <= tx1; tx++) {
        for (let ty = ty0; ty <= ty1; ty++) {
          const tmsY = nTiles - 1 - ty;
          const key = keyFor(z, tx, ty);
          let entry = TILE_CACHE.get(key);
          if (!entry) {
            const img = new Image();
            const url = `https://tamroypao.hii.or.th/tms/${layerPath}/${z}/${tx}/${tmsY}.png`;
            entry = { img, ok: false, err: false };
            img.onload = () => { entry.ok = true; notifyTileLoaded(); };
            img.onerror = () => { entry.err = true; };
            img.src = url;
            if (TILE_CACHE.size > 640) {
              const firstKey = TILE_CACHE.keys().next().value;
              TILE_CACHE.delete(firstKey);
            }
            TILE_CACHE.set(key, entry);
          }
          const dx = (tx / nTiles - state.camX) * worldPx + w / 2;
          const dy = (ty / nTiles - state.camY) * worldPx + h / 2;
          drawTileWithFallback(ctx, keyFor, z, tx, ty, dx, dy, tilePx, 6);
        }
      }
    }
    ctx.restore();
  }

  function traceRingF32(ctx, r, toSx, toSy) {
    for (let i = 0; i < r.length; i += 2) {
      const x = toSx(r[i]), y = toSy(r[i + 1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  let heatSpriteDark = null, heatSpriteLight = null;
  function getHeatSprite(isDark) {
    if (isDark && heatSpriteDark) return heatSpriteDark;
    if (!isDark && heatSpriteLight) return heatSpriteLight;
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    const gctx = c.getContext("2d");
    const grad = gctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, isDark ? "rgba(255, 224, 96, 0.72)" : "rgba(255, 200, 60, 0.58)");
    grad.addColorStop(0.5, isDark ? "rgba(249, 115, 22, 0.42)" : "rgba(234, 88, 12, 0.34)");
    grad.addColorStop(1, "rgba(239, 68, 68, 0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 32, 32);
    if (isDark) heatSpriteDark = c; else heatSpriteLight = c;
    return c;
  }

  const baseCanvas = document.createElement("canvas");
  let baseDirty = true;
  let mapDrawPending = false;
  function requestDrawMap(dirtyBase = true) {
    if (dirtyBase) baseDirty = true;
    if (mapDrawPending) return;
    mapDrawPending = true;
    requestAnimationFrame(() => { mapDrawPending = false; drawMap(); });
  }

  function renderBaseMap(w, h, dpr) {
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (baseCanvas.width !== bw || baseCanvas.height !== bh) {
      baseCanvas.width = bw;
      baseCanvas.height = bh;
    }
    const ctx = baseCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawTiles(ctx, w, h);

    const worldPx = 256 * Math.pow(2, state.zoom);
    const toSx = (mx) => (mx - state.camX) * worldPx + w / 2;
    const toSy = (my) => (my - state.camY) * worldPx + h / 2;

    // Adaptive, viewport-bounded cartographic graticule when using pure vector canvas (drawn once on baseCanvas)
    if (state.basemap === "none") {
      const stepDeg = state.zoom >= 14 ? 0.05 : state.zoom >= 11.5 ? 0.2 : state.zoom >= 9.5 ? 0.5 : state.zoom >= 7.5 ? 1 : 2;
      const dec = stepDeg < 1 ? (stepDeg < 0.1 ? 2 : 1) : 0;
      const vLon0 = Math.max(96, Math.floor(mxToLon(state.camX - (w / 2) / worldPx) / stepDeg) * stepDeg);
      const vLon1 = Math.min(108, mxToLon(state.camX + (w / 2) / worldPx) + stepDeg);
      const vLat0 = Math.max(6, Math.floor(myToLat(state.camY + (h / 2) / worldPx) / stepDeg) * stepDeg);
      const vLat1 = Math.min(22, myToLat(state.camY - (h / 2) / worldPx) + stepDeg);
      ctx.save();
      ctx.strokeStyle = state.theme === "dark" ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.065)";
      ctx.fillStyle = state.theme === "dark" ? "rgba(148,163,184,0.36)" : "rgba(71,85,105,0.45)";
      ctx.lineWidth = 0.8;
      ctx.font = "500 9.5px 'JetBrains Mono', monospace";
      for (let lon = vLon0; lon <= vLon1; lon = +(lon + stepDeg).toFixed(3)) {
        const sx = toSx(lonToMx(lon));
        if (sx < 0 || sx > w) continue;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
        ctx.fillText(lon.toFixed(dec) + "°E", sx + 3, h - 6);
      }
      for (let lat = vLat0; lat <= vLat1; lat = +(lat + stepDeg).toFixed(3)) {
        const sy = toSy(latToMy(lat));
        if (sy < 0 || sy > h) continue;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
        ctx.fillText(lat.toFixed(dec) + "°N", 6, sy - 3);
      }
      ctx.restore();
    }

    const { level, records } = getVisibleRecords();
    const validVals = records.map(r => r.metricValue).filter(v => v !== null && v !== undefined && !Number.isNaN(v));
    const minV = validVals.length ? Math.min(...validVals) : 0;
    const maxV = validVals.length ? Math.max(...validVals) : 1;
    const hasNull = records.some(r => r.metricValue === null || r.metricValue === undefined);

    const rootStyle = getComputedStyle(document.documentElement);
    const nullFill = rootStyle.getPropertyValue("--null-fill").trim() || "#334155";
    const strokeCol = rootStyle.getPropertyValue("--map-land-stroke").trim();
    const hasTiles = state.basemap !== "none";
    const hasTms = state.tmsOverlay !== "none";
    const hasWms = state.gistdaWms !== "none";

    // Draw background Thailand silhouette if zoomed into amphoe/tambon
    if (level !== "province" && state.levelMode !== "amphoe_all") {
      ctx.save();
      ctx.fillStyle = hasTiles
        ? (state.theme === "dark" ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.18)")
        : (state.theme === "dark" ? "rgba(30,41,59,0.35)" : "rgba(203,213,225,0.45)");
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.lineWidth = 0.8;
      for (const p of DATA.provinces) {
        if (p.code === state.selectedProv) continue;
        ctx.beginPath();
        for (const r of p._mRings) traceRingF32(ctx, r, toSx, toSy);
        if (state.showAreaFill) ctx.fill("evenodd");
        ctx.stroke();
      }
      if (level === "tambon" && state.selectedProv) {
        for (const a of DATA.amphoes) {
          if (a.prov_code !== state.selectedProv || a.code === state.selectedAmphoe) continue;
          ctx.beginPath();
          for (const r of a._mRings) traceRingF32(ctx, r, toSx, toSy);
          if (state.showAreaFill) ctx.fill("evenodd");
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Draw active polygons (with subtle neutral country drop shadow once on baseCanvas)
    if (state.showAreaFill && level === "province" && !hasTiles && !hasTms && !hasWms) {
      ctx.save();
      ctx.shadowColor = state.theme === "dark" ? "rgba(0, 0, 0, 0.45)" : "rgba(15, 23, 42, 0.16)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = state.theme === "dark" ? "#0f172a" : "#e2e8f0";
      ctx.beginPath();
      for (const rec of records) {
        for (const ring of rec.item._mRings) traceRingF32(ctx, ring, toSx, toSy);
      }
      ctx.fill("evenodd");
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = (hasTms || hasWms)
      ? (state.zoom >= 13.5 ? 0.12 : 0.25)
      : (hasTiles ? (state.zoom >= 14 ? 0.32 : 0.78) : 0.96);
    ctx.lineWidth = level === "tambon" ? 0.6 : 0.95;
    ctx.strokeStyle = hasTiles ? "rgba(15, 23, 42, 0.55)" : (state.theme === "dark" ? "rgba(15, 23, 42, 0.62)" : "rgba(30, 41, 59, 0.42)");
    for (const rec of records) {
      ctx.beginPath();
      for (const ring of rec.item._mRings) traceRingF32(ctx, ring, toSx, toSy);
      if (state.showAreaFill) {
        ctx.fillStyle = getPaletteAndColor(rec.metricValue, minV, maxV, nullFill);
        ctx.fill("evenodd");
      }
      ctx.stroke();
    }
    ctx.restore();

    if (hasWms) {
      drawGistdaWmsOverlay(ctx, w, h, toSx, toSy);
    }
    if (hasTms) {
      drawTmsOverlay(ctx, w, h);
    }

    // Fast pre-baked sprite Heatmap overlay (no per-cell createRadialGradient or 45k-vertex clip)
    if (state.showHeat && records.length) {
      drawHeatmapOverlay(ctx, w, h, toSx, toSy, worldPx);
    }

    // Toggleable Hotspot Point Overlays (Thailand Int32Array + 6-Country GMS Int32Array + GISTDA Live 1-7d)
    if (state.showTransPoints && TRANS_GRID_FLAT.length) {
      drawTransboundaryPointsOverlay(ctx, w, h, toSx, toSy);
    }
    if (state.showPoints && records.length) {
      drawThaiHotspotPointsOverlay(ctx, w, h, toSx, toSy);
    }
    if (state.showLive7d && DATA.live_hotspots_7d && DATA.live_hotspots_7d.length) {
      drawLive7dPointsOverlay(ctx, w, h, toSx, toSy);
    }

    // Map labels when drilled into province/amphoe
    if (level !== "province" && state.levelMode !== "amphoe_all") {
      ctx.save();
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labelSubset = records.slice().sort((a, b) => b.item.area_sqkm - a.item.area_sqkm).slice(0, 22);
      for (const rec of labelSubset) {
        const c = rec.item.centroid;
        if (!c) continue;
        const lx = toSx(lonToMx(c[0])), ly = toSy(latToMy(c[1]));
        if (lx < 20 || lx > w - 20 || ly < 20 || ly > h - 20) continue;
        ctx.lineWidth = 3;
        ctx.strokeStyle = state.theme === "dark" ? "rgba(7,11,20,0.85)" : "rgba(255,255,255,0.9)";
        ctx.strokeText(rec.item.name_th, lx, ly);
        ctx.fillStyle = state.theme === "dark" ? "#f8fafc" : "#0f172a";
        ctx.fillText(rec.item.name_th, lx, ly);
      }
      ctx.restore();
    }

    // Static suspected spots overlay
    if (state.showStatic) {
      ctx.save();
      for (const sp of DATA.static_spots) {
        const sx = toSx(lonToMx(sp.lon)), sy = toSy(latToMy(sp.lat));
        if (sx < -15 || sx > w + 15 || sy < -15 || sy > h + 15) continue;
        ctx.fillStyle = "#38bdf8";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 5, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 5, sy);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    // Villages overlay
    if (state.showVillages) {
      ctx.save();
      const vList = getVisibleVillages().slice(0, 120);
      for (const v of vList) {
        const sx = toSx(lonToMx(v.lon)), sy = toSy(latToMy(v.lat));
        if (sx < -15 || sx > w + 15 || sy < -15 || sy > h + 15) continue;
        ctx.fillStyle = "#facc15";
        ctx.strokeStyle = "#7c2d12";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.8, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    updateLegend(minV, maxV, hasNull, validVals.length > 0);
    baseDirty = false;
  }

  function drawMap() {
    const canvas = els.mapCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cw = Math.round(rect.width * dpr), ch = Math.round(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      baseDirty = true;
    }
    const w = rect.width, h = rect.height;
    if (els.zoomReadout) els.zoomReadout.textContent = "z" + state.zoom.toFixed(1);
    if (baseDirty) renderBaseMap(w, h, dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(baseCanvas, 0, 0);

    // Draw lightweight hover & pinned tambon highlight on top (<0.3 ms)
    const { level } = getVisibleRecords();
    const pinnedItem = (level === "tambon" && state.selectedTambon) ? TB_MAP.get(state.selectedTambon) : null;
    const hoverItem = state.hoverItem ? state.hoverItem.item : null;
    if (hoverItem || pinnedItem) {
      const worldPx = 256 * Math.pow(2, state.zoom);
      const toSx = (mx) => (mx - state.camX) * worldPx + w / 2;
      const toSy = (my) => (my - state.camY) * worldPx + h / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      const drawHighlightRing = (item, innerCol) => {
        ctx.beginPath();
        for (const ring of item._mRings) traceRingF32(ctx, ring, toSx, toSy);
        ctx.lineWidth = 3.8;
        ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
        ctx.stroke();
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = innerCol;
        ctx.stroke();
      };
      if (pinnedItem) drawHighlightRing(pinnedItem, "#38bdf8");
      if (hoverItem && hoverItem !== pinnedItem) drawHighlightRing(hoverItem, "#ffffff");
      ctx.restore();
    }
  }

  const GMS_COUNTRY_META = {
    1: { code: "Myanmar", th: "เมียนมา", col: "#ef4444" },
    2: { code: "Lao_PDR", th: "สปป.ลาว", col: "#f59e0b" },
    3: { code: "Cambodia", th: "กัมพูชา", col: "#a855f7" },
    4: { code: "Vietnam", th: "เวียดนาม", col: "#06b6d4" },
    5: { code: "Malaysia", th: "มาเลเซีย", col: "#10b981" },
  };

  function drawGistdaWmsOverlay(ctx, w, h, toSx, toSy) {
    const key = state.gistdaWms;
    if (!key || key === "none") return;
    const info = (DATA.gistda_wms_layers || {})[key];
    const bbox = info?.bbox_4326 || [97.343968, 5.617402, 105.6429129, 20.470097];
    const path = info?.path || (key === "ldd_flood" ? "gistda_layers/ldd_flood_recurrent.png" : `gistda_layers/${key}_7d.png`);
    let entry = WMS_IMAGE_CACHE.get(key);
    if (!entry) {
      const img = new Image();
      entry = { img, ok: false, err: false };
      img.onload = () => { entry.ok = true; requestDrawMap(true); };
      img.onerror = () => { entry.err = true; };
      img.src = path;
      WMS_IMAGE_CACHE.set(key, entry);
    }
    if (!entry.ok || !entry.img.width) return;
    const x0 = toSx(lonToMx(bbox[0]));
    const x1 = toSx(lonToMx(bbox[2]));
    const y0 = toSy(latToMy(bbox[3])); // north
    const y1 = toSy(latToMy(bbox[1])); // south
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.drawImage(entry.img, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

    const ptsCanvas = document.createElement("canvas");
  let lastFilteredExactTh = [];
  let lastFilteredExactGms = [];

  async function ensureExactPointsLoaded(kind) {
    if (!PAYLOAD_URL) return;
    const baseDir = PAYLOAD_URL.replace(/\/map_payload\.json\.gz.*$/, "");
    if (kind === "th" && !EXACT_TH_PTS && !EXACT_TH_LOADING) {
      EXACT_TH_LOADING = true;
      try {
        const resp = await fetch(`${baseDir}/th_points_exact.bin.gz`);
        if (resp.ok && typeof DecompressionStream !== "undefined") {
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const ds = new DecompressionStream("gzip");
          const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
          EXACT_TH_PTS = new Int32Array(buf);
          requestDrawMap(true);
        }
      } catch (_) {} finally {
        EXACT_TH_LOADING = false;
      }
    } else if (kind === "gms" && !EXACT_GMS_PTS && !EXACT_GMS_LOADING) {
      EXACT_GMS_LOADING = true;
      try {
        const resp = await fetch(`${baseDir}/gms_points_exact.bin.gz`);
        if (resp.ok && typeof DecompressionStream !== "undefined") {
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const ds = new DecompressionStream("gzip");
          const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
          EXACT_GMS_PTS = new Int32Array(buf);
          requestDrawMap(true);
        }
      } catch (_) {} finally {
        EXACT_GMS_LOADING = false;
      }
    }
  }

  function stampPixelCircle(u32, pw, ph, cx, cy, rad, abgr) {
    const r = Math.max(1, Math.round(rad));
    const r2 = r * r;
    const x0 = Math.max(0, cx - r), x1 = Math.min(pw - 1, cx + r);
    const y0 = Math.max(0, cy - r), y1 = Math.min(ph - 1, cy + r);
    for (let y = y0; y <= y1; y++) {
      const dy2 = (y - cy) * (y - cy);
      const rowOff = y * pw;
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) * (x - cx) + dy2 <= r2) {
          u32[rowOff + x] = abgr;
        }
      }
    }
  }

  function classifyThPointType(lu, crop) {
    if (crop === 1) return "rice";
    if (crop === 2) return "sugarcane";
    if (crop === 3) return "corn";
    if (lu === 1) return "forest";
    if (lu === 0) return "agri_other";
    return "other";
  }

  // ABGR little-endian colors for Point Types & Years
  const PT_TYPE_ABGR = {
    forest:     0xeb2626dc, // #dc2626 red
    rice:       0xeb15ccfa, // #facc15 yellow
    sugarcane:  0xeb9948ec, // #ec4899 pink
    corn:       0xeb1673f9, // #f97316 orange
    agri_other: 0xebf755a8, // #a855f7 purple
    other:      0xebf8bd38, // #38bdf8 sky
  };
  const PT_TYPE_META = {
    forest:     { label: "ป่าไม้", col: "#dc2626" },
    rice:       { label: "นาข้าว", col: "#facc15" },
    sugarcane:  { label: "อ้อย", col: "#ec4899" },
    corn:       { label: "ข้าวโพด/ไร่หมุนเวียน", col: "#f97316" },
    agri_other: { label: "เกษตร/ส.ป.ก. อื่น", col: "#a855f7" },
    other:      { label: "ชุมชน/พื้นที่อื่น", col: "#38bdf8" },
  };
  const PT_YEAR_ABGR = [
    0xebf8bd38, // 2022: #38bdf8 sky
    0xeb5ec522, // 2023: #22c55e green
    0xeb08b3ea, // 2024: #eab308 yellow
    0xeb1673f9, // 2025: #f97316 orange
    0xeb4444ef, // 2026: #ef4444 red
  ];

  function drawThaiHotspotPointsOverlay(ctx, w, h, toSx, toSy) {
    ensureExactPointsLoaded("th");
    const pw = Math.max(1, Math.round(w));
    const ph = Math.max(1, Math.round(h));
    if (ptsCanvas.width !== pw || ptsCanvas.height !== ph) {
      ptsCanvas.width = pw;
      ptsCanvas.height = ph;
    }
    const pctx = ptsCanvas.getContext("2d");
    const imgData = pctx.createImageData(pw, ph);
    const u32 = new Uint32Array(imgData.data.buffer);
    const rad = state.zoom >= 11 ? 3 : state.zoom >= 8.2 ? 2 : 1;
    const byYear = state.ptColorMode === "year";
    const yrMask = state.ptYearMask;
    const typeMask = state.ptTypes;

    lastFilteredExactTh = [];
    let thDrawnCount = 0;
    const vcEl = document.getElementById("ptThViewCount");
    if (EXACT_TH_PTS && EXACT_TH_PTS.length) {
      const seaMask = getActiveSeasonMask();
      const satOnlyN = state.sat === "N";
      const exclSt = state.excludeStatic;
      const worldPx = 256 * Math.pow(2, state.zoom);
      const lon0 = mxToLon(state.camX - (w / 2 + 12) / worldPx);
      const lon1 = mxToLon(state.camX + (w / 2 + 12) / worldPx);
      const lat0 = myToLat(state.camY + (h / 2 + 12) / worldPx);
      const lat1 = myToLat(state.camY - (h / 2 + 12) / worldPx);
      const lat4Min = Math.floor(lat0 * 10000), lat4Max = Math.ceil(lat1 * 10000);
      const lon4Min = Math.floor(lon0 * 10000), lon4Max = Math.ceil(lon1 * 10000);

      for (let o = 0; o < EXACT_TH_PTS.length; o += 2) {
        const w0 = EXACT_TH_PTS[o];
        const lon4 = EXACT_TH_PTS[o + 1];
        if (lon4 < lon4Min || lon4 > lon4Max) continue;
        const lat4 = w0 >> 11;
        if (lat4 < lat4Min || lat4 > lat4Max) continue;
        const f = w0 & 2047;
        if (satOnlyN && (f & 1)) continue;
        if (exclSt && ((f >> 10) & 1)) continue;
        const yr = (f >> 1) & 7;
        if (!yrMask[yr]) continue;
        if (!seaMask[(f >> 4) & 3]) continue;
        const lu = (f >> 6) & 3;
        const crop = (f >> 8) & 3;
        const pType = classifyThPointType(lu, crop);
        if (!typeMask[pType]) continue;

        const lat = lat4 / 10000, lon = lon4 / 10000;
        const sx = Math.round(toSx(lonToMx(lon)));
        const sy = Math.round(toSy(latToMy(lat)));
        if (sx < 0 || sx >= pw || sy < 0 || sy >= ph) continue;
        const col = byYear ? (PT_YEAR_ABGR[yr] || PT_YEAR_ABGR[4]) : (PT_TYPE_ABGR[pType] || PT_TYPE_ABGR.other);
        if (rad <= 1) {
          u32[sy * pw + sx] = col;
          if (sx + 1 < pw) u32[sy * pw + sx + 1] = col;
          if (sy + 1 < ph) u32[(sy + 1) * pw + sx] = col;
        } else {
          stampPixelCircle(u32, pw, ph, sx, sy, rad, col);
        }
        thDrawnCount++;
        if (lastFilteredExactTh.length < 3500) {
          lastFilteredExactTh.push({ sx, sy, lat, lon, lu, crop, pType, yr: 2022 + yr });
        }
      }
      if (vcEl) vcEl.textContent = `กำลังแสดงจุดพิกัดจริงในหน้าจอ: ${formatNum(thDrawnCount)} จุด`;
      pctx.putImageData(imgData, 0, 0);
      ctx.drawImage(ptsCanvas, 0, 0, w, h);
      return;
    }

    // Fallback while exact 1.28M point binary is streaming or in offline mode:
    const seaMask = getActiveSeasonMask();
    const satOnlyN = state.sat === "N";
    const exclSt = state.excludeStatic;
    for (let o = 0, i = 0; o < GRID_FLAT.length; o += 4, i++) {
      const f = GRID_FLAT[o + 2];
      if (satOnlyN && (f & 1)) continue;
      if (exclSt && ((f >> 10) & 1)) continue;
      const yr = (f >> 1) & 7;
      if (!yrMask[yr]) continue;
      if (!seaMask[(f >> 4) & 3]) continue;
      const lu = (f >> 6) & 3;
      const crop = (f >> 8) & 3;
      const pType = classifyThPointType(lu, crop);
      if (!typeMask[pType]) continue;
      const rawLat = GRID_FLAT[o], rawLon = GRID_FLAT[o + 1], cnt = GRID_FLAT[o + 3];
      const baseLat = rawLat > 5000 ? rawLat / 10000 : rawLat / 20;
      const baseLon = rawLon > 5000 ? rawLon / 10000 : rawLon / 20;
      const col = byYear ? (PT_YEAR_ABGR[yr] || PT_YEAR_ABGR[4]) : (PT_TYPE_ABGR[pType] || PT_TYPE_ABGR.other);
      const subPts = Math.min(18, Math.max(1, Math.round(Math.sqrt(cnt))));
      for (let k = 0; k < subPts; k++) {
        const h1 = ((i * 73856093) ^ (k * 19349663)) & 0xffff;
        const h2 = ((i * 83492791) ^ (k * 53471161)) & 0xffff;
        const dLon = k === 0 ? 0 : ((h1 / 65535 - 0.5) * 0.042);
        const dLat = k === 0 ? 0 : ((h2 / 65535 - 0.5) * 0.042);
        const sx = Math.round(toSx(lonToMx(baseLon + dLon)));
        const sy = Math.round(toSy(latToMy(baseLat + dLat)));
        if (sx < 0 || sx >= pw || sy < 0 || sy >= ph) continue;
        stampPixelCircle(u32, pw, ph, sx, sy, rad, col);
      }
      thDrawnCount += cnt;
    }
    if (vcEl) vcEl.textContent = PAYLOAD_URL
      ? `กำลังโหลดพิกัดจริง 1.28 ล้านจุด... (แสดงตัวอย่างในหน้าจอ ${formatNum(thDrawnCount)} จุด)`
      : `กำลังแสดงในหน้าจอ: ${formatNum(thDrawnCount)} จุด (กลุ่มพิกัด)`;
    pctx.putImageData(imgData, 0, 0);
    ctx.drawImage(ptsCanvas, 0, 0, w, h);
  }

  function drawTransboundaryPointsOverlay(ctx, w, h, toSx, toSy) {
    ensureExactPointsLoaded("gms");
    const pw = Math.max(1, Math.round(w));
    const ph = Math.max(1, Math.round(h));
    if (ptsCanvas.width !== pw || ptsCanvas.height !== ph) {
      ptsCanvas.width = pw;
      ptsCanvas.height = ph;
    }
    const pctx = ptsCanvas.getContext("2d");
    const imgData = pctx.createImageData(pw, ph);
    const u32 = new Uint32Array(imgData.data.buffer);
    const rad = state.zoom >= 10.5 ? 3 : state.zoom >= 7.8 ? 2 : 1;
    // ABGR colors per GMS country: 1=Myanmar (#ef4444), 2=Lao_PDR (#f59e0b), 3=Cambodia (#a855f7), 4=Vietnam (#06b6d4), 5=Malaysia (#10b981)
    const GMS_ABGR = [0, 0xe84444ef, 0xe80b9ef5, 0xe8f755a8, 0xe8d4b606, 0xe881b910];
    const cMask = state.ptGmsCountryMask;
    const yMask = state.ptGmsYearMask;

    lastFilteredExactGms = [];
    let gmsDrawnCount = 0;
    const vcGmsEl = document.getElementById("ptGmsViewCount");
    if (EXACT_GMS_PTS && EXACT_GMS_PTS.length) {
      const worldPx = 256 * Math.pow(2, state.zoom);
      const lon0 = mxToLon(state.camX - (w / 2 + 12) / worldPx);
      const lon1 = mxToLon(state.camX + (w / 2 + 12) / worldPx);
      const lat0 = myToLat(state.camY + (h / 2 + 12) / worldPx);
      const lat1 = myToLat(state.camY - (h / 2 + 12) / worldPx);
      const lat3Min = Math.floor(lat0 * 1000), lat3Max = Math.ceil(lat1 * 1000);
      const lon3Min = Math.floor(lon0 * 1000), lon3Max = Math.ceil(lon1 * 1000);

      for (let o = 0; o < EXACT_GMS_PTS.length; o += 2) {
        const w0 = EXACT_GMS_PTS[o];
        const lon3 = EXACT_GMS_PTS[o + 1];
        if (lon3 < lon3Min || lon3 > lon3Max) continue;
        const lat3 = w0 >> 11;
        if (lat3 < lat3Min || lat3 > lat3Max) continue;
        const cid = (w0 >> 8) & 7;
        if (!cMask[cid]) continue;
        const yr = (w0 >> 6) & 3;
        if (!yMask[yr]) continue;
        const cnt = w0 & 63;
        const lat = lat3 / 1000, lon = lon3 / 1000;
        const sx = Math.round(toSx(lonToMx(lon)));
        const sy = Math.round(toSy(latToMy(lat)));
        if (sx < 0 || sx >= pw || sy < 0 || sy >= ph) continue;
        const col = GMS_ABGR[cid] || GMS_ABGR[1];
        if (rad <= 1) {
          u32[sy * pw + sx] = col;
          if (sx + 1 < pw) u32[sy * pw + sx + 1] = col;
          if (sy + 1 < ph) u32[(sy + 1) * pw + sx] = col;
        } else {
          stampPixelCircle(u32, pw, ph, sx, sy, rad, col);
        }
        gmsDrawnCount += cnt;
        if (lastFilteredExactGms.length < 3500) {
          lastFilteredExactGms.push({ sx, sy, lat, lon, cid, tot4y: cnt, y2025: yr === 3 ? cnt : 0, maxFrp: null, yr: 2022 + yr });
        }
      }
      if (vcGmsEl) vcGmsEl.textContent = `กำลังแสดงจุดไฟข้ามแดนในหน้าจอ: ${formatNum(gmsDrawnCount)} จุด`;
      pctx.putImageData(imgData, 0, 0);
      ctx.drawImage(ptsCanvas, 0, 0, w, h);
      return;
    }

    if (!TRANS_GRID_FLAT.length) return;
    for (let o = 0, i = 0; o < TRANS_GRID_FLAT.length; o += 6, i++) {
      const cid = TRANS_GRID_FLAT[o + 2];
      if (!cMask[cid]) continue;
      const rawLat = TRANS_GRID_FLAT[o], rawLon = TRANS_GRID_FLAT[o + 1];
      const baseLat = rawLat > 5000 ? rawLat / 10000 : rawLat / 20;
      const baseLon = rawLon > 5000 ? rawLon / 10000 : rawLon / 20;
      const cnt = state.year === "2025" ? TRANS_GRID_FLAT[o + 4] : TRANS_GRID_FLAT[o + 3];
      if (cnt <= 0) continue;
      const col = GMS_ABGR[cid] || GMS_ABGR[1];
      const subPts = Math.min(20, Math.max(1, Math.round(Math.sqrt(cnt))));
      for (let k = 0; k < subPts; k++) {
        const h1 = ((i * 73856093) ^ (k * 19349663)) & 0xffff;
        const h2 = ((i * 83492791) ^ (k * 53471161)) & 0xffff;
        const dLon = k === 0 ? 0 : ((h1 / 65535 - 0.5) * 0.038);
        const dLat = k === 0 ? 0 : ((h2 / 65535 - 0.5) * 0.038);
        const sx = Math.round(toSx(lonToMx(baseLon + dLon)));
        const sy = Math.round(toSy(latToMy(baseLat + dLat)));
        if (sx < 0 || sx >= pw || sy < 0 || sy >= ph) continue;
        stampPixelCircle(u32, pw, ph, sx, sy, rad, col);
      }
      gmsDrawnCount += cnt;
    }
    if (vcGmsEl) vcGmsEl.textContent = PAYLOAD_URL
      ? `กำลังโหลดพิกัดจริง 2.63 ล้านจุด... (แสดงตัวอย่างในหน้าจอ ${formatNum(gmsDrawnCount)} จุด)`
      : `กำลังแสดงในหน้าจอ: ${formatNum(gmsDrawnCount)} จุด`;
    pctx.putImageData(imgData, 0, 0);
    ctx.drawImage(ptsCanvas, 0, 0, w, h);
  }

  function drawLive7dPointsOverlay(ctx, w, h, toSx, toSy) {
    const pts = DATA.live_hotspots_7d || [];
    if (!pts.length) return;
    ctx.save();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const sx = toSx(lonToMx(p.lon)), sy = toSy(latToMy(p.lat));
      if (sx < -12 || sx > w + 12 || sy < -12 || sy > h + 12) continue;
      const is1d = p.w === "1d";
      ctx.fillStyle = is1d ? "#ff1e56" : "#fb923c";
      ctx.strokeStyle = is1d ? "#fef08a" : "#0f172a";
      ctx.lineWidth = is1d ? 1.4 : 0.9;
      ctx.globalAlpha = is1d ? 0.96 : 0.78;
      ctx.beginPath();
      ctx.arc(sx, sy, is1d ? 4.2 : 2.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeatmapOverlay(ctx, w, h, toSx, toSy, worldPx) {
    const gridCells = state.computedStats?.gridCells || [];
    if (!gridCells.length) return;
    const maxC = state.computedStats.maxGridCnt || 1;
    const rBase = Math.max(4.5, Math.min(42, worldPx * 0.0003));
    const sprite = getHeatSprite(state.theme === "dark");
    ctx.save();
    ctx.globalCompositeOperation = state.theme === "dark" ? "screen" : "source-over";
    for (let i = 0; i < gridCells.length; i++) {
      const c = gridCells[i];
      const sx = toSx(c.mx);
      const sy = toSy(c.my);
      if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) continue;
      const t = Math.sqrt(c.cnt / maxC);
      const rad = rBase * (0.6 + 0.8 * t);
      ctx.globalAlpha = 0.25 + 0.7 * t;
      ctx.drawImage(sprite, sx - rad, sy - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }

  function updateLegend(minV, maxV, hasNull, hasValid) {
    const titles = {
      count: "จำนวนจุดความร้อน (จุด)",
      density: "ความหนาแน่น (จุด / 100 ตร.กม.)",
      agri_pct: "สัดส่วนเผาในเกษตร+ส.ป.ก. (%)",
      trp_rai: "รอยเผาไหม้ สสน. ตามรอยเผา (ไร่)",
      scar_rai: "รอยเผาไหม้ GISTDA (ไร่ · พ.ค. 2026)",
      freq_rai: "พื้นที่เผาซ้ำซาก GISTDA (ไร่)",
      wx_fwi: "ดัชนีอากาศเอื้อไฟหน้าแล้ง FWI (0–100)",
      wx_tmax: "อุณหภูมิสูงสุดเฉลี่ย (°C · 2022–2026)",
      wx_rhmin: "ความชื้นสัมพัทธ์ต่ำสุดเฉลี่ย (% · แดงเข้ม=แห้งเสี่ยงไฟ ฟ้า=ชื้น)",
      wx_low_rh: "วันอากาศแห้งจัด RH<35% (วัน/ปี)",
      wx_wind: "ความเร็วลมสูงสุดเฉลี่ย (กม./ชม.)",
      wx_rain: "ปริมาณฝนรวม (มม. · 2022–2026)",
      aq_pm25: "ฝุ่น PM2.5 เฉลี่ยหน้าแล้ง (µg/m³ · CAMS)",
      aq_exceed: "วันฝุ่น PM2.5 เกิน 37.5 µg/m³ (วัน/ปี)",
      aq_co: "ก๊าซ CO จากการเผา (µg/m³ · หน้าแล้ง)",
      soil_wet: "ความชื้นผิวดิน NASA GWETTOP (0–1 · แดงเข้ม=แห้ง ฟ้า=ชื้น)",
      soil_dry_streak: "สัญญาณเตือนดินแห้งต่อเนื่องสูงสุด (วัน · GWETTOP < 0.38)",
      doae_plant_rai: "พื้นที่เพาะปลูกข้าว+อ้อย+ข้าวโพด DOAE ปี 2566 (ไร่)",
      burn_rate_agri: "อัตราเผาเกษตรเทียบพื้นที่ปลูก DOAE (% · จว./อำเภอ/ตำบล)",
      era5_hot: "อากาศ ERA5: วันร้อนจัด ≥38°C (วัน)",
      era5_dry: "อากาศ ERA5: ช่วงแล้งยาวสุด (วัน)",
      era5_rain: "อากาศ ERA5: ฝนรวมทั้งปี (มม.)",
      hazard: "ดัชนีเสี่ยงซ้ำซ้อน (ท่วมซ้ำ + เผาซ้ำ 0–100)",
    };
    els.legendTitle.textContent = titles[state.metric] || "";
    const pal = getPaletteForMetric(state.metric);
    els.legendBar.style.background = `linear-gradient(90deg, ${pal.join(",")})`;
    if (!hasValid) {
      els.legMin.textContent = "-"; els.legMid.textContent = "-"; els.legMax.textContent = "-";
    } else {
      const dec = state.metric === "soil_wet" ? 2 : (state.metric === "density" || state.metric === "agri_pct" || state.metric === "burn_rate_agri" || state.metric === "wx_fwi" || state.metric === "wx_tmax" || state.metric === "wx_rhmin" || state.metric === "wx_wind" || state.metric === "aq_pm25") ? 1 : 0;
      const isMoist = state.metric === "wx_rhmin" || state.metric === "soil_wet";
      const isRain = state.metric === "wx_rain" || state.metric === "era5_rain";
      const minTag = isMoist ? " (แห้ง)" : isRain ? " (ฝนน้อย)" : " (น้อย)";
      const maxTag = isMoist ? " (ชื้น)" : isRain ? " (ฝนมาก)" : " (มาก/วิกฤต)";
      els.legMin.textContent = formatNum(minV, dec) + minTag;
      els.legMid.textContent = formatNum((minV + maxV) / 2, dec);
      els.legMax.textContent = formatNum(maxV, dec) + maxTag;
    }
    els.legendNullChip.style.display = hasNull ? "inline-flex" : "none";
    if (els.tmsLegendChip) {
      if (state.gistdaWms !== "none") {
        const wmsNames = {
          dri: "ดัชนีเสี่ยงภัยแล้ง DRI (7 วัน)",
          ndwi: "ดัชนีความชื้นพืช NDWI (7 วัน)",
          smap: "ความชื้นผิวดิน SMAP (7 วัน)",
          ldd_flood: "พื้นที่น้ำท่วมซ้ำซาก กรมพัฒนาที่ดิน (พด. · CC BY-NC-ND ภาพต้นฉบับ)",
        };
        const wmsPrefix = state.gistdaWms === "ldd_flood" ? "ชั้นภาพ พด. ผ่าน DOAE GeoServer:" : "ชั้นภาพ GISTDA WMS:";
        els.tmsLegendChip.style.display = "inline-flex";
        els.tmsLegendChip.innerHTML = `<strong>${wmsPrefix}</strong> <span>${escHtml(wmsNames[state.gistdaWms] || state.gistdaWms)}</span>`;
      } else if (state.showTransPoints || state.showLive7d || state.showPoints) {
        const chips = [];
        if (state.showPoints) {
          if (state.ptColorMode === "year") {
            const yrCols = ["#38bdf8", "#22c55e", "#eab308", "#f97316", "#ef4444"];
            for (let y = 0; y < 5; y++) {
              if (state.ptYearMask[y]) chips.push(`<span><i style="display:inline-block;width:8px;height:8px;background:${yrCols[y]};border-radius:50%"></i> ${2022 + y}</span>`);
            }
          } else {
            for (const [k, meta] of Object.entries(PT_TYPE_META)) {
              if (state.ptTypes[k]) chips.push(`<span><i style="display:inline-block;width:8px;height:8px;background:${meta.col};border-radius:50%"></i> ${escHtml(meta.label)}</span>`);
            }
          }
        }
        if (state.showTransPoints) {
          for (let cid = 1; cid <= 5; cid++) {
            if (!state.ptGmsCountryMask[cid]) continue;
            const gm = GMS_COUNTRY_META[cid];
            if (gm) chips.push(`<span><i style="display:inline-block;width:8px;height:8px;background:${gm.col};border-radius:50%"></i> ${escHtml(gm.th)}</span>`);
          }
        }
        if (state.showLive7d) chips.push(`<span><i style="display:inline-block;width:8px;height:8px;background:#ff1e56;border:1px solid #fef08a;border-radius:50%"></i> ล่าสุด 24 ชม. / 7 วัน GISTDA</span>`);
        els.tmsLegendChip.style.display = "inline-flex";
        els.tmsLegendChip.innerHTML = chips.join(" ");
      } else if (state.tmsOverlay === "none") {
        els.tmsLegendChip.style.display = "none";
      } else if (state.tmsOverlay.includes("SAVI_")) {
        els.tmsLegendChip.style.display = "inline-flex";
        els.tmsLegendChip.innerHTML = `<strong>สีภาพ SAVI 20 ม.:</strong>
          <span><i style="display:inline-block;width:9px;height:9px;background:#005000;border-radius:2px"></i> ต่ำมาก</span>
          <span><i style="display:inline-block;width:9px;height:9px;background:#ffe100;border-radius:2px"></i> ปานกลาง</span>
          <span><i style="display:inline-block;width:9px;height:9px;background:#e10000;border-radius:2px"></i> เชื้อเพลิงสูงมาก</span>`;
      } else {
        els.tmsLegendChip.style.display = "inline-flex";
        els.tmsLegendChip.innerHTML = `<strong>สีภาพ 20 ม. สสน.:</strong>
          <span><i style="display:inline-block;width:9px;height:9px;background:#ffff00;border-radius:2px"></i> ข้าว</span>
          <span><i style="display:inline-block;width:9px;height:9px;background:#ff72df;border-radius:2px"></i> อ้อย</span>
          <span><i style="display:inline-block;width:9px;height:9px;background:#d1ff72;border-radius:2px"></i> ข้าวโพด</span>
          <span><i style="display:inline-block;width:9px;height:9px;background:#ffaa01;border-radius:2px"></i> พืชผสม</span>
          <span><i style="display:inline-block;width:9px;height:9px;background:#ef0707;border-radius:2px"></i> ป่าไม้</span>`;
      }
    }
    els.areaFillLegend.hidden = !state.showAreaFill;
    els.legendBox.hidden = !state.showAreaFill && els.tmsLegendChip.style.display === "none";
  }

  function pointInRings(mx, my, rings) {
    let inside = false;
    for (const r of rings) {
      const len = r.length;
      for (let i = 0, j = len - 2; i < len; j = i, i += 2) {
        const xi = r[i], yi = r[i + 1];
        const xj = r[j], yj = r[j + 1];
        const intersect = ((yi > my) !== (yj > my)) && (mx < (xj - xi) * (my - yi) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
      }
    }
    return inside;
  }

  function hitTestPointOverlay(clientX, clientY) {
    const rect = els.mapCanvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const worldPx = 256 * Math.pow(2, state.zoom);
    const toSx = (mx) => (mx - state.camX) * worldPx + rect.width / 2;
    const toSy = (my) => (my - state.camY) * worldPx + rect.height / 2;
    if (state.showLive7d && DATA.live_hotspots_7d) {
      for (const p of DATA.live_hotspots_7d) {
        const px = toSx(lonToMx(p.lon)), py = toSy(latToMy(p.lat));
        if (Math.hypot(px - sx, py - sy) <= 7.5) return { kind: "live7d", data: p };
      }
    }
    if (state.showStatic) {
      for (const sp of DATA.static_spots) {
        const px = toSx(lonToMx(sp.lon)), py = toSy(latToMy(sp.lat));
        if (Math.hypot(px - sx, py - sy) <= 8) return { kind: "static", data: sp };
      }
    }
    if (state.showVillages) {
      for (const v of getVisibleVillages().slice(0, 120)) {
        const px = toSx(lonToMx(v.lon)), py = toSy(latToMy(v.lat));
        if (Math.hypot(px - sx, py - sy) <= 7) return { kind: "village", data: v };
      }
    }
    if (state.showPoints) {
      for (const p of lastFilteredExactTh) {
        if (Math.hypot(p.sx - sx, p.sy - sy) <= 6.5) {
          return {
            kind: "th_pt",
            data: {
              lat: p.lat, lon: p.lon,
              cnt: 1,
              agriCnt: p.lu === 0 ? 1 : 0,
              forCnt: p.lu === 1 ? 1 : 0,
              pType: p.pType,
              yr: p.yr,
            },
          };
        }
      }
      if (state.computedStats?.gridCells) {
        for (const c of state.computedStats.gridCells) {
          const px = toSx(c.mx), py = toSy(c.my);
          if (Math.hypot(px - sx, py - sy) <= 6.5) return { kind: "th_pt", data: c };
        }
      }
    }
    if (state.showTransPoints) {
      for (const p of lastFilteredExactGms) {
        if (Math.hypot(p.sx - sx, p.sy - sy) <= 6.5) {
          return { kind: "gms_pt", data: p };
        }
      }
      if (TRANS_GRID_FLAT.length) {
        for (let o = 0; o < TRANS_GRID_FLAT.length; o += 6) {
          const rawLat = TRANS_GRID_FLAT[o], rawLon = TRANS_GRID_FLAT[o + 1];
          const lat = rawLat > 5000 ? rawLat / 10000 : rawLat / 20;
          const lon = rawLon > 5000 ? rawLon / 10000 : rawLon / 20;
          const px = toSx(lonToMx(lon)), py = toSy(latToMy(lat));
          if (Math.hypot(px - sx, py - sy) <= 6.5) {
            return {
              kind: "gms_pt",
              data: {
                lat, lon,
                cid: TRANS_GRID_FLAT[o + 2],
                tot4y: TRANS_GRID_FLAT[o + 3],
                y2025: TRANS_GRID_FLAT[o + 4],
                maxFrp: TRANS_GRID_FLAT[o + 5],
              },
            };
          }
        }
      }
    }
    return null;
  }

  function hitTestMap(clientX, clientY) {
    const rect = els.mapCanvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const worldPx = 256 * Math.pow(2, state.zoom);
    const mx = state.camX + (sx - rect.width / 2) / worldPx;
    const my = state.camY + (sy - rect.height / 2) / worldPx;
    const lon = mxToLon(mx), lat = myToLat(my);
    const { records } = getVisibleRecords();
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      const b = r.item.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (pointInRings(mx, my, r.item._mRings)) return r;
    }
    return null;
  }

  const THAI_BBOX = [97.3, 5.6, 105.7, 20.5];

  function fitBbox(bbox) {
    if (!bbox) return;
    const rect = els.mapCanvas.getBoundingClientRect();
    const w = Math.max(280, rect.width || 800), h = Math.max(220, rect.height || 600);
    const mx0 = lonToMx(bbox[0]), mx1 = lonToMx(bbox[2]);
    const my0 = latToMy(bbox[3]), my1 = latToMy(bbox[1]);
    state.camX = (mx0 + mx1) / 2;
    state.camY = (my0 + my1) / 2;
    const spanX = Math.max(0.0004, mx1 - mx0);
    const spanY = Math.max(0.0004, my1 - my0);
    const zx = Math.log2((w * 0.84) / (256 * spanX));
    const zy = Math.log2((h * 0.84) / (256 * spanY));
    state.zoom = Math.max(3.6, Math.min(15.5, Math.min(zx, zy)));
  }

  function resetToThailand() {
    state.selectedProv = null;
    state.selectedAmphoe = null;
    state.selectedTambon = null;
    fitBbox(THAI_BBOX);
    refreshAll();
  }

  function getVisibleVillages() {
    return DATA.villages.filter(v => {
      if (state.selectedAmphoe) return v.amphoe_code === state.selectedAmphoe;
      if (state.selectedProv) return v.prov_code === state.selectedProv;
      return true;
    });
  }

  function updateWarnings() {
    const warns = [];
    if (state.sat === "ALL") {
      warns.push("โหมดทุกดาวเทียม: ปี 2022–2023 มีดาวเทียมดวงเดียว แต่ปี 2024–2026 มี 3 ดวง (จุดซ้ำ ~33%) ควรใช้ Suomi NPP (N) เมื่อเทียบแนวโน้มข้ามปี");
    }
    if (state.sat === "N" && !state.janOct && (state.year === "all" || state.year === "2026")) {
      warns.push("ดาวเทียม N หยุดส่งข้อมูลหลัง 1 พ.ย. 2026 (ช่วง 2–17 พ.ย. 2026 มีเฉพาะ N20/N21)");
    }
    if (state.sat === "N" && state.year === "2026" && state.season === "late") {
      warns.push("พ.ย.–ธ.ค. 2026 ของดาวเทียม N มีข้อมูลแค่วันที่ 1 พ.ย. (28 จุด) หากต้องการดูช่วง พ.ย. 2026 ให้สลับเป็นทุกดาวเทียม");
    }
    els.satWarnPill.style.display = warns.length ? "block" : "none";
    els.satWarnPill.textContent = warns.join(" · ");

    const gWarns = [];
    if (state.metric.startsWith("wx_")) {
      if (getActiveScopeLevel() !== "province") gWarns.push("ข้อมูลสภาพอากาศเอื้อไฟ 2022–2026 มีเฉพาะระดับ 77 จังหวัด (ไม่แบ่งรายอำเภอ/ตำบล)");
    } else if (state.metric.startsWith("aq_") || state.metric === "soil_wet" || state.metric === "soil_dry_streak") {
      if (getActiveScopeLevel() !== "province") gWarns.push("ข้อมูล PM2.5 (CAMS) และความชื้นดิน (NASA POWER) มีเฉพาะระดับ 77 จังหวัด");
      if (state.metric.startsWith("aq_") && state.year === "2022") gWarns.push("CAMS PM2.5 เริ่ม ส.ค. 2022 (ไม่มี ม.ค.–เม.ย. 2022)");
    } else if (state.metric === "burn_rate_agri" || state.metric === "doae_plant_rai") {
      gWarns.push("เชื่อมพื้นที่ปลูก DOAE ปี 2566 ครบทั้งระดับจังหวัด (77), อำเภอ (814) และตำบล (6,308); รอยเผา สสน. ครอบคลุม 62 จังหวัด");
    } else if (state.metric.startsWith("era5_")) {
      if (state.year === "2026") gWarns.push("ERA5 รายปียังไม่มีปี 2026 (ใช้หมวด 'สภาพอากาศเอื้อไฟ 2022–2026' ด้านบนแทนได้)");
      if (getActiveScopeLevel() !== "province") gWarns.push("ข้อมูลอากาศ ERA5 มีเฉพาะ 77 จังหวัด (ไม่แบ่งรายอำเภอ/ตำบล)");
    } else if (state.metric === "trp_rai") {
      if (state.year === "2022" || state.year === "2023") {
        gWarns.push("รอยเผา สสน. (ตามรอยเผา) มีเฉพาะ 3 ฤดูฝุ่น 2024–2026 (พ.ศ. 2567–2569)");
      }
      gWarns.push("รอยเผา สสน. ครอบคลุม 62 จังหวัด (ประจวบคีรีขันธ์และภาคใต้ 14 จังหวัดแสดงเป็นไม่มีข้อมูล)");
    } else if (state.metric === "freq_rai") {
      gWarns.push("burn_freq มีข้อมูลแค่ 53 จังหวัด (อีสานหาย 15 จังหวัด, ใต้หาย 9 จังหวัด)");
    } else if (state.metric === "scar_rai") {
      gWarns.push("burn_scar เป็นรอยสะสม 2026 ถึงกลาง พ.ค. ครอบคลุม 57 จังหวัด");
    } else if (state.metric === "hazard") {
      gWarns.push("HII น้ำท่วมซ้ำ 17 ปี (pending ใช้ในเครื่อง) ครอบคลุม 6,434 ตำบล (ขาดภูเก็ต/ระนอง)");
    }
    if (state.tmsOverlay !== "none") {
      gWarns.push("เปิดชั้นภาพ TMS 20 ม. สสน. (ปรับความทึบขอบเขตอัตโนมัติเพื่อให้เห็นแปลงเผา 20 ม. ชัดเจน)");
    }
    els.grainWarnPill.style.display = gWarns.length ? "block" : "none";
    els.grainWarnPill.textContent = gWarns.join(" · ");
  }

  function updateBreadcrumbsAndScope() {
    const parts = [{ label: "ประเทศไทย", action: resetToThailand }];
    if (state.selectedProv) {
      const p = PROV_MAP.get(state.selectedProv);
      parts.push({
        label: p ? p.name_th : state.selectedProv,
        action: () => { state.selectedAmphoe = null; state.selectedTambon = null; fitBbox(p?.bbox); refreshAll(); }
      });
    }
    if (state.selectedAmphoe) {
      const a = AMP_MAP.get(state.selectedAmphoe);
      parts.push({
        label: a ? ("อ." + a.name_th) : state.selectedAmphoe,
        action: () => { state.selectedTambon = null; fitBbox(a?.bbox); refreshAll(); }
      });
    }
    if (state.selectedTambon) {
      const t = TB_MAP.get(state.selectedTambon);
      parts.push({ label: t ? ("ต." + t.name_th) : state.selectedTambon, action: null });
    }
    els.breadcrumbs.innerHTML = "";
    parts.forEach((pt, idx) => {
      if (idx > 0) {
        const sep = document.createElement("span");
        sep.textContent = "›";
        els.breadcrumbs.appendChild(sep);
      }
      const btn = document.createElement("button");
      btn.className = "crumb-btn";
      btn.textContent = pt.label;
      if (pt.action) btn.onclick = pt.action;
      els.breadcrumbs.appendChild(btn);
    });
    const { level, records } = getVisibleRecords();
    const lvlThai = level === "province" ? "จังหวัด" : level === "amphoe" ? "อำเภอ" : "ตำบล";
    if (state.selectedTambon) {
      els.scopePill.textContent = `${parts[parts.length - 1].label} (ปักหมุดรายตำบล · ใน ${records.length.toLocaleString()} ตำบล)`;
    } else {
      els.scopePill.textContent = `${parts[parts.length - 1].label} (${records.length.toLocaleString()} ${lvlThai})`;
    }
  }

  function getKpiScopeRecords(records) {
    if (state.selectedTambon) {
      const tbRec = state.computedStats.tbByCode.get(state.selectedTambon);
      if (tbRec) return [tbRec];
    }
    return records;
  }

  function updateSidebarMetrics() {
    const { level, records } = getVisibleRecords();
    const kpiRecords = getKpiScopeRecords(records);
    let total = 0, agri = 0, forest = 0, day = 0;
    for (const r of kpiRecords) {
      total += r.total; agri += r.st.agri; forest += r.st.forest; day += r.st.day;
    }
    const agriPct = total > 0 ? (agri * 100 / total) : null;
    const forestPct = total > 0 ? (forest * 100 / total) : null;
    const dayPct = total > 0 ? (day * 100 / total) : null;

    els.kpiTotal.textContent = formatNum(total);
    els.kpiTotalSub.textContent = `${state.sat === "N" ? "Suomi NPP (N)" : "ทุกดาวเทียม"} · ${state.janOct ? "ม.ค.–ต.ค." : "ทุกเดือน"}`;

    els.kpiAgri.textContent = agriPct !== null ? `${agriPct.toFixed(1)}%` : "ไม่มีจุดไฟ";
    els.kpiAgriSub.textContent = forestPct !== null ? `เกษตร ${formatNum(agri)} · ป่า ${formatNum(forest)} (${forestPct.toFixed(1)}%)` : "-";

    // Scar area in current scope (shows TamRoyPao when trp_rai or TMS is active, else GISTDA + TamRoyPao subnote)
    const trpKnown = kpiRecords.map(r => getTrpBreakdown(r.item)).filter(b => b !== null);
    const scarKnown = kpiRecords.filter(r => r.item.scar_rai !== null && r.item.scar_rai !== undefined);
    if (state.metric === "trp_rai" || state.tmsOverlay !== "none") {
      const yrLabel = state.year === "all" ? "รวม 3 ฤดู (67–69)" : `ปี ${state.year}`;
      if (els.kpiScarLabel) els.kpiScarLabel.textContent = `รอยเผา สสน. (${yrLabel})`;
      if (!trpKnown.length) {
        els.kpiScar.textContent = "ไม่มีข้อมูล";
        els.kpiScarSub.textContent = (state.year === "2022" || state.year === "2023")
          ? "สสน. มีเฉพาะฤดู 2024–2026"
          : "สสน. ไม่ครอบคลุมพื้นที่นี้";
      } else {
        const trpValSum = kpiRecords.reduce((a, r) => a + (getTrpMetric(r.item) || 0), 0);
        const trpAgriSum = trpKnown.reduce((a, b) => a + b.agri, 0);
        const trpForSum = trpKnown.reduce((a, b) => a + b.forest, 0);
        els.kpiScar.textContent = `${formatNum(trpValSum, 0)} ไร่`;
        els.kpiScarSub.textContent = `เกษตร ${formatNum(trpAgriSum, 0)} · ป่า ${formatNum(trpForSum, 0)} ไร่`;
      }
    } else {
      if (els.kpiScarLabel) els.kpiScarLabel.textContent = "รอยเผาไหม้จริง (พ.ค. 2026)";
      if (!scarKnown.length) {
        els.kpiScar.textContent = "ไม่มีข้อมูล";
        els.kpiScarSub.textContent = "GISTDA ไม่ครอบคลุมพื้นที่นี้";
      } else {
        const scarSum = scarKnown.reduce((a, r) => a + r.item.scar_rai, 0);
        const agriScarSum = scarKnown.reduce((a, r) => a + (r.item.scar_agri_rai || 0), 0);
        els.kpiScar.textContent = `${formatNum(scarSum, 0)} ไร่`;
        const covNote = level === "province" && !state.selectedProv ? ` (${DATA.meta.scar_covered_provinces}/77 จว.)` : "";
        const trpNote = trpKnown.length
          ? ` · สสน. ${formatNum(kpiRecords.reduce((a, r) => a + (getTrpMetric(r.item) || 0), 0), 0)} ไร่`
          : "";
        els.kpiScarSub.textContent = `เกษตร ${scarSum > 0 ? (agriScarSum * 100 / scarSum).toFixed(1) : "0.0"}%${covNote}${trpNote}`;
      }
    }

    // Factor snapshot (uses 2022-2026 fire-weather FWI + HII flood risk)
    const activeProv = state.selectedProv ? PROV_MAP.get(state.selectedProv) : null;
    if (activeProv) {
      const fwiV = getWxAnnualMetric(activeProv, "peak_fwi");
      const tmaxV = getWxAnnualMetric(activeProv, "tmax");
      const rhV = getWxAnnualMetric(activeProv, "rh_min");
      const fl = state.selectedTambon ? TB_MAP.get(state.selectedTambon)?.flood_max_17yr : activeProv.flood_max_17yr;
      els.kpiFactor.textContent = fwiV !== null
        ? `FWI ${fwiV.toFixed(1)}/100`
        : (fl !== null && fl !== undefined ? `ท่วม ${fl} ครั้ง` : "ไม่มีข้อมูล");
      const wxPart = tmaxV !== null ? `Tmax ${tmaxV.toFixed(1)}°C · RH ${rhV !== null ? rhV.toFixed(0) + "%" : "-"}` : "ไม่มีอากาศ";
      els.kpiFactorSub.textContent = `${wxPart} · ท่วม 17 ปี ${fl !== null && fl !== undefined ? fl + " ครั้ง" : "ไม่มีข้อมูล HII"}`;
    } else {
      const fwiAll = DATA.provinces.map(p => getWxAnnualMetric(p, "peak_fwi")).filter(v => v !== null);
      const tmaxAll = DATA.provinces.map(p => getWxAnnualMetric(p, "tmax")).filter(v => v !== null);
      const avgFwi = fwiAll.length ? fwiAll.reduce((a, b) => a + b, 0) / fwiAll.length : null;
      const avgTmax = tmaxAll.length ? tmaxAll.reduce((a, b) => a + b, 0) / tmaxAll.length : null;
      els.kpiFactor.textContent = avgFwi !== null ? `FWI ${avgFwi.toFixed(1)}/100` : "ไม่มีข้อมูล";
      els.kpiFactorSub.textContent = avgTmax !== null ? `เฉลี่ย 77 จว. · Tmax ${avgTmax.toFixed(1)}°C (หน้าแล้ง)` : "รอดึงข้อมูลสภาพอากาศ";
    }

    // Insight Card
    const topRec = kpiRecords.slice().sort((a, b) => b.total - a.total)[0];
    let ins = "";
    if (state.crop === "corn" && forestPct !== null) {
      ins = `🌾 <strong>อินไซต์ข้าวโพด:</strong> ในมุมมองนี้จุดความร้อนของข้าวโพดและไร่หมุนเวียน <strong>${forestPct.toFixed(1)}%</strong> อยู่ในเขตป่า (เทียบเกษตร ${agriPct.toFixed(1)}%)`;
    } else if (dayPct !== null) {
      ins = `🕒 <strong>เวลาเผาในพื้นที่:</strong> กลางวัน (12–14 น.) <strong>${dayPct.toFixed(1)}%</strong> · กลางคืน (00–03 น.) <strong>${(100 - dayPct).toFixed(1)}%</strong>`;
    } else {
      ins = "ไม่มีจุดความร้อนในตัวกรองที่เลือก";
    }
    if (topRec && topRec.total > 0) {
      const dTxt = topRec.density !== null ? `${topRec.density.toFixed(1)} จุด/100 ตร.กม.` : "ไม่มีพื้นที่ขอบเขต ปภ.";
      ins += `<br/>🔥 สูงสุด: <strong>${escHtml(topRec.item.name_th)}</strong> (${formatNum(topRec.total)} จุด · ${dTxt})`;
    }
    els.insightBox.innerHTML = ins;

    // Top 10 Rank List
    els.rankTitle.textContent = `10 อันดับสูงสุด (${level === "province" ? "จังหวัด" : level === "amphoe" ? "อำเภอ" : "ตำบล"})`;
    const sorted = records.slice().sort((a, b) => {
      const av = a.metricValue ?? -Infinity, bv = b.metricValue ?? -Infinity;
      return bv - av || b.total - a.total;
    }).slice(0, 10);
    const maxRankV = sorted[0]?.metricValue ?? 1;
    els.rankList.innerHTML = "";
    sorted.forEach((r, idx) => {
      const row = document.createElement("div");
      row.className = "rank-item";
      const valStr = r.metricValue === null || r.metricValue === undefined
        ? "ไม่มีข้อมูล"
        : formatNum(r.metricValue, (state.metric === "density" || state.metric === "agri_pct") ? 1 : 0);
      const pctW = r.metricValue && maxRankV > 0 ? Math.max(4, Math.min(100, (r.metricValue / maxRankV) * 100)) : 0;
      row.innerHTML = `
        <span style="color:var(--muted);font-weight:700">${idx + 1}</span>
        <div>
          <div style="font-weight:600">${escHtml(r.item.name_th)}</div>
          <div class="rank-bar-bg"><div class="rank-bar-fg" style="width:${pctW}%"></div></div>
        </div>
        <span style="font-weight:700">${escHtml(valStr)}</span>
      `;
      row.onclick = () => selectFeature(r.item, level);
      row.addEventListener("mousemove", (e) => {
        const it = r.item;
        const mLabel = els.metricSelect?.selectedOptions?.[0]?.textContent || "ตัวชี้วัด";
        const agPct = r.agriPct !== null ? r.agriPct.toFixed(1) : "0.0";
        const foPct = r.total > 0 ? (r.st.forest * 100 / r.total).toFixed(1) : "0.0";
        const trpV = getTrpMetric(it);
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>#${idx + 1} ${escHtml(it.name_th)}</h4>
              <div class="tt-sub">${level === "province" ? "ระดับจังหวัด" : level === "amphoe" ? "ระดับอำเภอ" : "ระดับตำบล"}</div>
            </div>
            <span class="tt-badge">${escHtml(valStr)}</span>
          </div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:var(--accent)"></i>${escHtml(mLabel)}</span><span class="tt-v">${escHtml(valStr)}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#f97316"></i>จุดความร้อนในมุมมอง</span><span class="tt-v">${formatNum(r.total)} จุด</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>ความหนาแน่น</span><span class="tt-v">${r.density !== null ? r.density.toFixed(1) + " /100 ตร.กม." : "-"}</span></div>
          <div class="tt-bar"><div style="background:#d48942;width:${agPct}%"></div><div style="background:#55947a;width:${foPct}%"></div></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร+ส.ป.ก. / ป่าไม้</span><span class="tt-v">${agPct}% / ${foPct}%</span></div>
          ${trpV !== null ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#c96f53"></i>รอยเผา สสน.</span><span class="tt-v">${formatNum(trpV, 0)} ไร่</span></div>` : ""}
          <div class="tt-foot">คลิกเพื่อซูมแผนที่ไปที่พื้นที่นี้</div>
        `);
      });
      row.addEventListener("mouseleave", hideTooltip);
      els.rankList.appendChild(row);
    });

    drawScatterPlot();
    drawTrendChart();
  }

  function selectFeature(item, level) {
    if (level === "province") {
      state.selectedProv = item.code;
      state.selectedAmphoe = null;
      state.selectedTambon = null;
      if (state.levelMode === "province" || state.levelMode === "amphoe_all") state.levelMode = "auto";
      els.levelModeSelect.value = state.levelMode;
      fitBbox(item.bbox);
    } else if (level === "amphoe") {
      state.selectedProv = item.prov_code;
      state.selectedAmphoe = item.code;
      state.selectedTambon = null;
      if (state.levelMode === "amphoe_all") state.levelMode = "auto";
      els.levelModeSelect.value = state.levelMode;
      fitBbox(item.bbox);
    } else {
      if (state.selectedTambon === item.code) {
        state.selectedTambon = null;
        const amp = AMP_MAP.get(state.selectedAmphoe);
        if (amp) fitBbox(amp.bbox);
      } else {
        state.selectedTambon = item.code;
        fitBbox(item.bbox);
      }
    }
    refreshAll();
  }

  function drawScatterPlot() {
    const canvas = els.scatterCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;

    const xKey = state.scatterX, yKey = state.scatterY;
    const isEraX = xKey === "hot_days_38c" || xKey === "longest_dry_spell_days" || xKey === "rainfall_total_mm";
    const isWxX = xKey === "wx_peak_fwi" || xKey === "wx_low_rh_35";
    const isAqSoilX = xKey === "aq_pm25" || xKey === "aq_exceed" || xKey === "soil_wet";

    // Strict grain rule: ERA5, Fire-Weather, CAMS AQ & NASA Soil are ONLY 77-province level; never duplicate onto amphoes/tambons!
    const useProvGrain = isEraX || isWxX || isAqSoilX || getActiveScopeLevel() === "province";
    const sourceRecords = useProvGrain ? state.computedStats.provRecords : getVisibleRecords().records;

    // For ERA5 + "all 5y", align hotspots cleanly to 2022-2025 4y total if needed, else use current record
    let hs22_25 = null;
    if (isEraX && state.year === "all") {
      hs22_25 = new Map();
      const satOnlyN = state.sat === "N", exclSt = state.excludeStatic, seaMask = getActiveSeasonMask();
      for (const p of DATA.provinces) hs22_25.set(p.code, { total: 0, agri: 0 });
      for (let o = 0; o < CUBE_FLAT.length; o += 5) {
        const f = CUBE_FLAT[o + 1];
        if (satOnlyN && (f & 1)) continue;
        const yr = (f >> 1) & 7;
        if (yr > 3) continue; // 2022..2025 only!
        if (exclSt && ((f >> 10) & 1)) continue;
        if (!seaMask[(f >> 4) & 3]) continue;
        const lu = (f >> 6) & 3, crop = (f >> 8) & 3;
        if (state.crop === "agri" && lu !== 0) continue;
        if (state.crop === "forest" && lu !== 1) continue;
        if (state.crop === "rice" && crop !== 1) continue;
        if (state.crop === "sugarcane" && crop !== 2) continue;
        if (state.crop === "corn" && crop !== 3) continue;
        const pm = hs22_25.get(DATA.tambons[CUBE_FLAT[o]].prov_code);
        if (pm) { pm.total += CUBE_FLAT[o + 2]; if (lu === 0) pm.agri += CUBE_FLAT[o + 2]; }
      }
    }

    const pts = [];
    for (const r of sourceRecords) {
      let xv = null;
      if (isWxX) xv = getWxAnnualMetric(r.item, xKey === "wx_peak_fwi" ? "peak_fwi" : "low_rh_35");
      else if (xKey === "aq_pm25") xv = getAqAnnualMetric(r.item, "pm25_peak");
      else if (xKey === "aq_exceed") xv = getAqAnnualMetric(r.item, "days_37_5");
      else if (xKey === "soil_wet") xv = getSoilAnnualMetric(r.item, "gwettop_peak");
      else if (isEraX) xv = getEra5Metric(r.item, xKey);
      else if (xKey === "flood_max_17yr") xv = r.item.flood_max_17yr;
      else if (xKey === "trp_rai") xv = getTrpMetric(r.item);
      else if (xKey === "scar_rai") xv = r.item.scar_rai;

      let yv = null;
      if (hs22_25) {
        const a4 = hs22_25.get(r.item.code);
        if (yKey === "count") yv = a4.total;
        else if (yKey === "density") yv = r.item.area_sqkm > 0 ? (a4.total * 100 / r.item.area_sqkm) : null;
        else yv = a4.total > 0 ? (a4.agri * 100 / a4.total) : null;
      } else {
        if (yKey === "count") yv = r.total;
        else if (yKey === "density") yv = r.density;
        else yv = r.agriPct;
      }
      if (xv !== null && xv !== undefined && yv !== null && yv !== undefined && !Number.isNaN(xv) && !Number.isNaN(yv)) {
        pts.push({ x: xv, y: yv, rec: r, isProv: useProvGrain });
      }
    }

    ctx.clearRect(0, 0, w, h);
    state.scatterDots = [];
    if (pts.length < 3) {
      els.corrBadge.textContent = "r = n/a";
      els.scatterNote.textContent = isEraX && state.year === "2026"
        ? "ยังไม่มี ERA5 รายปี 2026 (เลือกปี 2022–2025 หรือ 5 ปีเพื่อเทียบ)"
        : "ข้อมูลคู่ที่มีครบทั้งสองแกนน้อยกว่า 3 จุด";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px system-ui";
      ctx.fillText("ไม่มีข้อมูลเพียงพอสำหรับกราฟ", 18, h / 2);
      return;
    }

    // Pearson r
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.x, 0) / n;
    const my = pts.reduce((a, p) => a + p.y, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) {
      const dx = p.x - mx, dy = p.y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const den = Math.sqrt(sxx * syy);
    const rVal = den > 1e-12 ? (sxy / den) : null;
    els.corrBadge.textContent = rVal !== null ? `r = ${rVal.toFixed(2)}` : "r = n/a";
    els.scatterNote.textContent = isWxX
      ? `ระดับ 77 จังหวัด (สภาพอากาศเอื้อไฟ ${state.year === "all" ? "เฉลี่ย 2022–2026" : "ปี " + state.year})${state.selectedProv ? " · สีเหลือง = จังหวัดที่เลือก" : ""}`
      : isEraX
        ? `ระดับ 77 จังหวัด${state.year === "all" ? " (เทียบช่วง 2022–2025 ให้ตรง ERA5)" : ""}${state.selectedProv ? " · สีเหลือง = จังหวัดที่เลือก" : ""}`
        : `จำนวน ${n} พื้นที่ในมุมมองปัจจุบัน`;

    const pad = { l: 42, r: 12, t: 10, b: 22 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
    const sx = (v) => pad.l + (maxX > minX ? (v - minX) / (maxX - minX) : 0.5) * pw;
    const sy = (v) => pad.t + ph - (maxY > minY ? (v - minY) / (maxY - minY) : 0.5) * ph;

    // Grid & axes
    ctx.strokeStyle = "rgba(148,163,184,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();

    // OLS trendline
    if (sxx > 1e-12 && rVal !== null) {
      const slope = sxy / sxx;
      const intercept = my - slope * mx;
      const y0 = slope * minX + intercept;
      const y1 = slope * maxX + intercept;
      ctx.strokeStyle = "rgba(249,115,22,0.55)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx(minX), Math.max(pad.t, Math.min(pad.t + ph, sy(y0))));
      ctx.lineTo(sx(maxX), Math.max(pad.t, Math.min(pad.t + ph, sy(y1))));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Points
    for (const p of pts) {
      const cx = sx(p.x), cy = sy(p.y);
      const isSel = state.selectedProv === p.rec.item.code || state.selectedAmphoe === p.rec.item.code;
      const isHov = state.scatterHoverCode === p.rec.item.code;
      if (isHov) {
        ctx.save();
        ctx.fillStyle = "rgba(223, 106, 55, 0.25)";
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = isHov ? "#fde047" : (isSel ? "#df6a37" : "rgba(104, 156, 184, 0.85)");
      ctx.strokeStyle = isHov ? "#df6a37" : (isSel ? "#f1f5f9" : "rgba(15, 23, 42, 0.7)");
      ctx.lineWidth = isHov || isSel ? 2.2 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, isHov ? 6.2 : (isSel ? 5.2 : 3.5), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      state.scatterDots.push({ cx, cy, ...p });
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px system-ui";
    ctx.fillText(formatNum(maxY, 0), 4, pad.t + 9);
    ctx.fillText(formatNum(minY, 0), 4, pad.t + ph);
    if (maxX === minX) {
      ctx.fillText(formatNum(minX, 0) + " (ค่า X เท่ากันทุกพื้นที่)", pad.l + 4, h - 5);
    } else {
      ctx.fillText(formatNum(minX, 0), pad.l, h - 5);
      ctx.fillText(formatNum(maxX, 0), w - 34, h - 5);
    }
  }

  function drawTrendChart() {
    const canvas = els.trendCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const rows = state.computedStats.yearlyTotals;
    const maxY = Math.max(1, ...rows.map(r => r.total));
    const pad = { l: 38, r: 10, t: 10, b: 48 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const step = pw / rows.length;
    const bw = Math.min(34, step * 0.56);
    state.trendHitBars = [];

    rows.forEach((r, idx) => {
      const cx = pad.l + (idx + 0.5) * step;
      const x = cx - bw / 2;
      const isHov = state.trendHoverIdx === idx;
      if (isHov) {
        ctx.fillStyle = state.theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
        ctx.fillRect(pad.l + idx * step, pad.t, step, ph + 16);
      }
      const hAgri = (r.agri / maxY) * ph;
      const hFor = (r.forest / maxY) * ph;
      const hOth = (r.other / maxY) * ph;
      let y = pad.t + ph;
      if (hAgri > 0) { ctx.fillStyle = "#d48942"; ctx.fillRect(x, y - hAgri, bw, hAgri); y -= hAgri; }
      if (hFor > 0) { ctx.fillStyle = "#55947a"; ctx.fillRect(x, y - hFor, bw, hFor); y -= hFor; }
      if (hOth > 0) { ctx.fillStyle = "#64748b"; ctx.fillRect(x, y - hOth, bw, hOth); }
      if (isHov) {
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 0.5, pad.t + ph - (hAgri + hFor + hOth), bw + 1, hAgri + hFor + hOth);
      }
      ctx.fillStyle = isHov ? (state.theme === "dark" ? "#f8fafc" : "#0f172a") : "#8b95a7";
      ctx.font = isHov ? "700 11px system-ui" : "11px system-ui";
      ctx.fillText(String(r.year), cx - 14, pad.t + ph + 12);
      state.trendHitBars.push({ idx, x0: pad.l + idx * step, x1: pad.l + (idx + 1) * step, y0: pad.t, y1: pad.t + ph + 16, row: r, prev: idx > 0 ? rows[idx - 1] : null });
    });
    ctx.fillStyle = "#8b95a7";
    ctx.font = "10px system-ui";
    ctx.fillText(formatNum(maxY, 0), 2, pad.t + 9);
    // Tiny inline legend
    ctx.fillStyle = "#d48942"; ctx.fillRect(w - 110, 4, 8, 8);
    ctx.fillStyle = "#8b95a7"; ctx.fillText("เกษตร", w - 99, 12);
    ctx.fillStyle = "#55947a"; ctx.fillRect(w - 60, 4, 8, 8);
    ctx.fillStyle = "#8b95a7"; ctx.fillText("ป่าไม้", w - 49, 12);

    // Day vs Night horizontal split bar
    const kpiRecords = getKpiScopeRecords(getVisibleRecords().records);
    let tot = 0, day = 0;
    for (const r of kpiRecords) { tot += r.total; day += r.st.day; }
    const barY = h - 9, barW = w - pad.l - pad.r;
    state.trendDayNightInfo = { y0: barY - 14, y1: h, tot, day, night: Math.max(0, tot - day) };
    if (tot > 0) {
      const dayFrac = day / tot;
      ctx.fillStyle = "#d4a85a";
      ctx.fillRect(pad.l, barY, barW * dayFrac, 6);
      ctx.fillStyle = "#5c8ba8";
      ctx.fillRect(pad.l + barW * dayFrac, barY, barW * (1 - dayFrac), 6);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px system-ui";
      ctx.fillText(`กลางวัน ${(dayFrac * 100).toFixed(0)}% / กลางคืน ${((1 - dayFrac) * 100).toFixed(0)}%`, pad.l, barY - 4);
    }
  }

  function exportCurrentCsv() {
    const { level, records } = getVisibleRecords();
    const headers = ["code", "name_th", "area_sqkm", "hotspots", "density_per_100sqkm", "agri_pct", "tamroypao_burn_rai", "burn_scar_rai", "burn_freq_rai", "flood_max_17yr", "hazard_score"];
    const lines = [headers.join(",")];
    for (const r of records) {
      const trpV = getTrpMetric(r.item);
      const vals = [
        csvCell(r.item.code),
        csvCell(r.item.name_th || ""),
        csvCell(r.item.area_sqkm),
        csvCell(r.total),
        csvCell(r.density !== null ? r.density.toFixed(2) : ""),
        csvCell(r.agriPct !== null ? r.agriPct.toFixed(2) : ""),
        csvCell(trpV !== null && trpV !== undefined ? trpV.toFixed(1) : ""),
        csvCell(r.item.scar_rai !== null && r.item.scar_rai !== undefined ? r.item.scar_rai : ""),
        csvCell(r.item.freq_rai !== null && r.item.freq_rai !== undefined ? r.item.freq_rai : ""),
        csvCell(r.item.flood_max_17yr !== null && r.item.flood_max_17yr !== undefined ? r.item.flood_max_17yr : ""),
        csvCell(r.hazard !== null && r.hazard !== undefined ? r.hazard : ""),
      ];
      lines.push(vals.join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hotspot_5y_${level}_${state.sat}_${state.year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function syncMapDock() {
    document.querySelectorAll("#mapDock .dock-btn[data-dock-metric]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.dockMetric === state.metric);
    });
    const hb = document.getElementById("dockHeatBtn");
    if (hb) hb.classList.toggle("active", !!state.showHeat);
    const pb = document.getElementById("dockPointsBtn");
    if (pb) pb.classList.toggle("active", !!state.showPoints);
    const tb = document.getElementById("dockTransBtn");
    if (tb) tb.classList.toggle("active", !!state.showTransPoints);
    const thPanel = document.getElementById("thPointsFilterPanel");
    if (thPanel) thPanel.classList.toggle("open", !!state.showPoints);
    const gmsPanel = document.getElementById("gmsPointsFilterPanel");
    if (gmsPanel) gmsPanel.classList.toggle("open", !!state.showTransPoints);
  }

  function refreshAll() {
    syncMapDock();
    updateWarnings();
    computeFilteredStats();
    updateBreadcrumbsAndScope();
    updateSidebarMetrics();
    requestDrawMap();
  }

  function bindEvents() {
    const syncControl = (el, key, parseFn) => {
      el.addEventListener("change", () => {
        state[key] = parseFn ? parseFn(el) : el.value;
        if (key === "season" && state.season === "late") {
          state.janOct = false;
          els.janOctCheck.checked = false;
        }
        if (key === "janOct" && state.janOct && state.season === "late") {
          state.season = "all";
          els.seasonSelect.value = "all";
        }
        if (key === "levelMode" && (state.levelMode === "province" || state.levelMode === "amphoe_all")) {
          state.selectedProv = null;
          state.selectedAmphoe = null;
          state.selectedTambon = null;
          fitBbox(THAI_BBOX);
        }
        refreshAll();
      });
    };
    syncControl(els.satSelect, "sat");
    syncControl(els.janOctCheck, "janOct", el => el.checked);
    syncControl(els.yearSelect, "year");
    syncControl(els.seasonSelect, "season");
    syncControl(els.cropSelect, "crop");
    syncControl(els.excludeStaticCheck, "excludeStatic", el => el.checked);
    syncControl(els.metricSelect, "metric");
    els.showAreaFillCheck.addEventListener("change", () => {
      state.showAreaFill = els.showAreaFillCheck.checked;
      requestDrawMap();
    });
    syncControl(els.levelModeSelect, "levelMode");
    if (els.showPointsCheck) syncControl(els.showPointsCheck, "showPoints", el => el.checked);
    const ptColorSel = document.getElementById("ptColorModeSelect");
    if (ptColorSel) {
      ptColorSel.addEventListener("change", () => {
        state.ptColorMode = ptColorSel.value || "type";
        requestDrawMap(true);
      });
    }
    document.querySelectorAll("#ptYearChips input[data-pt-yr]").forEach(cb => {
      cb.addEventListener("change", () => {
        const yIdx = Number(cb.dataset.ptYr);
        if (yIdx >= 0 && yIdx < 5) state.ptYearMask[yIdx] = cb.checked;
        requestDrawMap(true);
      });
    });
    document.querySelectorAll("#ptTypeChips input[data-pt-type]").forEach(cb => {
      cb.addEventListener("change", () => {
        const tKey = cb.dataset.ptType;
        if (tKey in state.ptTypes) state.ptTypes[tKey] = cb.checked;
        requestDrawMap(true);
      });
    });
    document.querySelectorAll("[data-pt-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.ptAct;
        if (act === "yr_all" || act === "yr_2026") {
          for (let i = 0; i < 5; i++) state.ptYearMask[i] = (act === "yr_all" || i === 4);
          document.querySelectorAll("#ptYearChips input[data-pt-yr]").forEach(cb => {
            cb.checked = !!state.ptYearMask[Number(cb.dataset.ptYr)];
          });
        } else if (act === "type_all" || act === "type_agri" || act === "type_forest") {
          for (const k of Object.keys(state.ptTypes)) {
            if (act === "type_all") state.ptTypes[k] = true;
            else if (act === "type_forest") state.ptTypes[k] = (k === "forest");
            else state.ptTypes[k] = (k !== "forest" && k !== "other");
          }
          document.querySelectorAll("#ptTypeChips input[data-pt-type]").forEach(cb => {
            cb.checked = !!state.ptTypes[cb.dataset.ptType];
          });
        } else if (act === "gms_c_all" || act === "gms_c_north") {
          for (let cid = 1; cid <= 5; cid++) {
            state.ptGmsCountryMask[cid] = (act === "gms_c_all" || cid === 1 || cid === 2);
          }
          document.querySelectorAll("#ptGmsCountryChips input[data-pt-gms-c]").forEach(cb => {
            cb.checked = !!state.ptGmsCountryMask[Number(cb.dataset.ptGmsC)];
          });
        } else if (act === "gms_y_all" || act === "gms_y_2025") {
          for (let y = 0; y < 4; y++) {
            state.ptGmsYearMask[y] = (act === "gms_y_all" || y === 3);
          }
          document.querySelectorAll("#ptGmsYearChips input[data-pt-gms-yr]").forEach(cb => {
            cb.checked = !!state.ptGmsYearMask[Number(cb.dataset.ptGmsYr)];
          });
        }
        requestDrawMap(true);
      });
    });
    document.querySelectorAll("#ptGmsCountryChips input[data-pt-gms-c]").forEach(cb => {
      cb.addEventListener("change", () => {
        const cid = Number(cb.dataset.ptGmsC);
        if (cid >= 1 && cid <= 5) state.ptGmsCountryMask[cid] = cb.checked;
        requestDrawMap(true);
      });
    });
    document.querySelectorAll("#ptGmsYearChips input[data-pt-gms-yr]").forEach(cb => {
      cb.addEventListener("change", () => {
        const yIdx = Number(cb.dataset.ptGmsYr);
        if (yIdx >= 0 && yIdx < 4) state.ptGmsYearMask[yIdx] = cb.checked;
        requestDrawMap(true);
      });
    });
    if (els.showTransPointsCheck) {
      els.showTransPointsCheck.addEventListener("change", () => {
        state.showTransPoints = els.showTransPointsCheck.checked;
        if (state.showTransPoints && state.zoom > 5.8 && !state.selectedProv) {
          fitBbox([92.5, 5.2, 108.5, 22.8]);
        }
        refreshAll();
      });
    }
    if (els.showLive7dCheck) syncControl(els.showLive7dCheck, "showLive7d", el => el.checked);
    syncControl(els.showHeatCheck, "showHeat", el => el.checked);
    syncControl(els.showStaticCheck, "showStatic", el => el.checked);
    syncControl(els.showVillagesCheck, "showVillages", el => el.checked);
    if (els.gistdaWmsSelect) syncControl(els.gistdaWmsSelect, "gistdaWms");
    syncControl(els.tmsOverlaySelect, "tmsOverlay");
    syncControl(els.basemapSelect, "basemap");
    syncControl(els.scatterX, "scatterX");
    syncControl(els.scatterY, "scatterY");

    els.resetZoomBtn.onclick = resetToThailand;
    document.querySelectorAll("#mapDock .dock-btn[data-dock-metric]").forEach(btn => {
      btn.onclick = () => {
        state.metric = btn.dataset.dockMetric;
        els.metricSelect.value = state.metric;
        refreshAll();
      };
    });
    const dockPoints = document.getElementById("dockPointsBtn");
    if (dockPoints) {
      dockPoints.onclick = () => {
        state.showPoints = !state.showPoints;
        if (els.showPointsCheck) els.showPointsCheck.checked = state.showPoints;
        refreshAll();
      };
    }
    const dockTrans = document.getElementById("dockTransBtn");
    if (dockTrans) {
      dockTrans.onclick = () => {
        state.showTransPoints = !state.showTransPoints;
        if (els.showTransPointsCheck) els.showTransPointsCheck.checked = state.showTransPoints;
        if (state.showTransPoints && state.zoom > 5.8 && !state.selectedProv) {
          fitBbox([92.5, 5.2, 108.5, 22.8]);
        }
        refreshAll();
      };
    }
    const dockHeat = document.getElementById("dockHeatBtn");
    if (dockHeat) {
      dockHeat.onclick = () => {
        state.showHeat = !state.showHeat;
        els.showHeatCheck.checked = state.showHeat;
        refreshAll();
      };
    }
    els.zoomInBtn.onclick = () => { state.zoom = Math.min(18, state.zoom + 0.8); requestDrawMap(); };
    els.zoomOutBtn.onclick = () => { state.zoom = Math.max(3.6, state.zoom - 0.8); requestDrawMap(); };
    els.exportCsvBtn.onclick = exportCurrentCsv;
    els.provenanceBtn.onclick = () => { els.provenanceModal.style.display = "flex"; };
    els.closeModalBtn.onclick = () => { els.provenanceModal.style.display = "none"; };
    els.provenanceModal.onclick = (e) => { if (e.target === els.provenanceModal) els.provenanceModal.style.display = "none"; };

    setAtlasTheme(state.theme);
    els.themeToggle.onclick = () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      setAtlasTheme(state.theme, true);
      if (activePage === "map") refreshAll();
      else if (activePage === "overview") renderOverviewPage();
      else if (activePage === "weather") renderWeatherPage();
      else if (activePage === "haze") renderHazePage();
      else if (activePage === "burnscar") renderBurnScarPage();
    };
    const togglePres = (on) => {
      state.presentation = on;
      els.workspace.classList.toggle("presentation", on);
      els.exitPresBtn.classList.toggle("visible", on);
      setTimeout(() => { requestDrawMap(); drawScatterPlot(); drawTrendChart(); }, 60);
    };
    els.presentationBtn.onclick = () => togglePres(!state.presentation);
    els.exitPresBtn.onclick = () => togglePres(false);

    // Search
    els.searchInput.addEventListener("input", () => {
      const q = els.searchInput.value.trim().toLowerCase();
      if (!q) { els.searchResults.style.display = "none"; return; }
      const matches = SEARCH_INDEX.filter(it => it.nameLower.includes(q)).slice(0, 20);
      if (!matches.length) { els.searchResults.style.display = "none"; return; }
      const r = els.searchInput.getBoundingClientRect();
      els.searchResults.style.left = r.left + "px";
      els.searchResults.style.top = (r.bottom + 4) + "px";
      els.searchResults.innerHTML = "";
      for (const m of matches) {
        const div = document.createElement("div");
        div.className = "search-item";
        const tag = m.kind === "province" ? "จังหวัด" : m.kind === "amphoe" ? "อำเภอ" : "ตำบล";
        div.innerHTML = `<span>${escHtml(m.name)}</span><span class="search-tag">${escHtml(tag)}${m.sub ? " · " + escHtml(m.sub) : ""}</span>`;
        div.onclick = () => {
          els.searchResults.style.display = "none";
          els.searchInput.value = m.name;
          if (m.kind === "province") selectFeature(PROV_MAP.get(m.code), "province");
          else if (m.kind === "amphoe") selectFeature(AMP_MAP.get(m.code), "amphoe");
          else {
            state.selectedProv = m.prov_code;
            state.selectedAmphoe = m.amphoe_code;
            selectFeature(TB_MAP.get(m.code), "tambon");
          }
        };
        els.searchResults.appendChild(div);
      }
      els.searchResults.style.display = "block";
    });
    document.addEventListener("click", (e) => {
      if (!els.searchInput.contains(e.target) && !els.searchResults.contains(e.target)) {
        els.searchResults.style.display = "none";
      }
    });

    // Map mouse interactions (rAF-throttled hover + cached baseCanvas = <0.5 ms hover)
    let dragging = false, moved = false, lastX = 0, lastY = 0;
    let hoverPending = false, hoverEvt = null, lastTooltipKey = null;
    els.mapCanvas.addEventListener("mousedown", (e) => {
      dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mouseup", (e) => {
      if (dragging && !moved) {
        const hit = hitTestMap(e.clientX, e.clientY);
        if (hit) {
          const { level } = getVisibleRecords();
          selectFeature(hit.item, level);
        }
      }
      dragging = false;
    });
    function processHover() {
      hoverPending = false;
      if (activePage !== "map") return;
      const e = hoverEvt;
      if (!e || dragging) return;
      if (e.target === els.mapCanvas) {
        const ptHit = hitTestPointOverlay(e.clientX, e.clientY);
        if (ptHit) {
          const tKey = ptHit.kind === "static"
            ? `st:${ptHit.data.lat}:${ptHit.data.lon}`
            : ptHit.kind === "village"
              ? `vil:${ptHit.data.tambon_code}:${ptHit.data.name}:${state.sat}`
              : ptHit.kind === "live7d"
                ? `l7d:${ptHit.data.lat}:${ptHit.data.lon}:${ptHit.data.d}`
                : ptHit.kind === "th_pt"
                  ? `thpt:${ptHit.data.lat}:${ptHit.data.lon}:${ptHit.data.cnt}`
                  : `gmspt:${ptHit.data.lat}:${ptHit.data.lon}:${ptHit.data.cid}`;
          if (tKey !== lastTooltipKey) {
            lastTooltipKey = tKey;
            if (ptHit.kind === "static") {
              const sp = ptHit.data;
              showTooltip(e.clientX, e.clientY, `
                <div class="tt-head">
                  <div>
                    <h4 style="color:#38bdf8">จุดความร้อนซ้ำถาวร</h4>
                    <div class="tt-sub">ต.${escHtml(sp.tambon)} · อ.${escHtml(sp.amphoe)} · จ.${escHtml(sp.prov)}</div>
                  </div>
                  <span class="tt-badge" style="color:#38bdf8;border-color:rgba(56,189,248,0.35);background:rgba(56,189,248,0.12);">${sp.days} วัน</span>
                </div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#38bdf8"></i>ประเภทพื้นที่</span><span class="tt-v">${escHtml(sp.lu)}</span></div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#f97316"></i>จำนวนครั้งที่ตรวจพบ</span><span class="tt-v">${formatNum(sp.points)} จุด</span></div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#eab308"></i>พลังงานความร้อน FRP</span><span class="tt-v">${sp.avg_frp.toFixed(2)} MW</span></div>
                <div class="tt-foot">มักเป็นโรงงาน/เตาเผา/โรงไฟฟ้าชีวมวล (เกิดซ้ำ ≥25 วัน)</div>
              `, "#38bdf8");
            } else if (ptHit.kind === "village") {
              const v = ptHit.data;
              const cnt = state.sat === "N" ? v.n : v.all;
              const ag = state.sat === "N" ? v.agri_n : v.agri_all;
              const agPct = cnt > 0 ? (ag * 100 / cnt).toFixed(0) : "0";
              showTooltip(e.clientX, e.clientY, `
                <div class="tt-head">
                  <div>
                    <h4 style="color:#facc15">${escHtml(v.name)}${v.moo ? " หมู่ " + escHtml(v.moo) : ""}</h4>
                    <div class="tt-sub">ต.${escHtml(v.tambon)} · อ.${escHtml(v.amphoe)} · จ.${escHtml(v.prov)}</div>
                  </div>
                  <span class="tt-badge" style="color:#facc15;border-color:rgba(250,204,21,0.35);background:rgba(250,204,21,0.12);">${formatNum(cnt)} จุด</span>
                </div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>ในพื้นที่เกษตร+ส.ป.ก.</span><span class="tt-v">${formatNum(ag)} จุด (${agPct}%)</span></div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#55947a"></i>ในเขตป่า/อื่น ๆ</span><span class="tt-v">${formatNum(Math.max(0, cnt - ag))} จุด</span></div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>ระยะห่างจุดไฟเฉลี่ย</span><span class="tt-v">${v.dist_km !== null ? v.dist_km.toFixed(2) + " กม." : "-"}</span></div>
              `, "#facc15");
            } else if (ptHit.kind === "live7d") {
              const p = ptHit.data;
              const is1d = p.w === "1d";
              const col = is1d ? "#ff1e56" : "#fb923c";
              const loc = p.pv ? `${p.tb ? "ต." + p.tb + " · " : ""}${p.ap ? "อ." + p.ap + " · " : ""}จ.${p.pv}` : (p.ct || "ภูมิภาคอาเซียน");
              showTooltip(e.clientX, e.clientY, `
                <div class="tt-head">
                  <div>
                    <h4 style="color:${col}">จุดไฟล่าสุด GISTDA (${is1d ? "24 ชม. ล่าสุด" : "7 วันย้อนหลัง"})</h4>
                    <div class="tt-sub">${escHtml(loc)}</div>
                  </div>
                  <span class="tt-badge" style="color:${col};border-color:${col};">${escHtml(p.d)} ${escHtml(p.t || "")}</span>
                </div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${col}"></i>ดาวเทียม / ความเชื่อมั่น</span><span class="tt-v">${escHtml(p.sat || "VIIRS")} (${escHtml(p.conf || "-")})</span></div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#eab308"></i>พลังงานความร้อน FRP</span><span class="tt-v">${p.frp !== null ? p.frp.toFixed(1) + " MW" : "-"}</span></div>
                ${p.lu ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#55947a"></i>การใช้ที่ดิน</span><span class="tt-v">${escHtml(p.lu)}</span></div>` : ""}
                <div class="tt-foot">พิกัด ${p.lat.toFixed(4)}°N, ${p.lon.toFixed(4)}°E (GISTDA API Gateway)</div>
              `, col);
            } else if (ptHit.kind === "th_pt") {
              const c = ptHit.data;
              const tMeta = PT_TYPE_META[c.pType] || { label: c.agriCnt >= c.forCnt ? "เกษตร+ส.ป.ก." : "ป่าไม้", col: "#f59e0b" };
              showTooltip(e.clientX, e.clientY, `
                <div class="tt-head">
                  <div>
                    <h4 style="color:${tMeta.col}">จุดความร้อน: ${escHtml(tMeta.label)}</h4>
                    <div class="tt-sub">พิกัด ${c.lat.toFixed(4)}°N, ${c.lon.toFixed(4)}°E${c.yr ? ` · ปี ${c.yr} (พ.ศ. ${c.yr + 543})` : ""}</div>
                  </div>
                  <span class="tt-badge" style="color:${tMeta.col};border-color:${tMeta.col};">${c.yr ? `ปี ${c.yr}` : `${formatNum(c.cnt)} จุด`}</span>
                </div>
                <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${tMeta.col}"></i>ประเภทพื้นที่ / พืช</span><span class="tt-v">${escHtml(tMeta.label)}</span></div>
                ${c.yr ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#38bdf8"></i>ปีที่ตรวจพบ</span><span class="tt-v">${c.yr} (พ.ศ. ${c.yr + 543})</span></div>` : ""}
                <div class="tt-foot">พิกัดจริงจากดาวเทียม VIIRS (1,278,326 จุด · เปิด/ปิดรายปีและรายประเภทได้)</div>
              `, tMeta.col);
            } else if (ptHit.kind === "gms_pt") {
              const g = ptHit.data;
              const meta = GMS_COUNTRY_META[g.cid] || GMS_COUNTRY_META[1];
              const isExact = !!g.yr;
              showTooltip(e.clientX, e.clientY, `
                <div class="tt-head">
                  <div>
                    <h4 style="color:${meta.col}">จุดไฟข้ามแดน: ${escHtml(meta.th)}</h4>
                    <div class="tt-sub">พิกัด ${g.lat.toFixed(isExact ? 3 : 2)}°N, ${g.lon.toFixed(isExact ? 3 : 2)}°E${isExact ? ` · ปี ${g.yr} (พ.ศ. ${g.yr + 543})` : ""} (NASA FIRMS)</div>
                  </div>
                  <span class="tt-badge" style="color:${meta.col};border-color:${meta.col};">${isExact ? `ปี ${g.yr}` : `${formatNum(g.tot4y)} จุด`}</span>
                </div>
                ${isExact
                  ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${meta.col}"></i>จำนวนจุดไฟ ณ พิกัดนี้ (${g.yr})</span><span class="tt-v">${formatNum(g.tot4y)} จุด</span></div>`
                  : `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${meta.col}"></i>สะสม 4 ปี (2022–2025)</span><span class="tt-v">${formatNum(g.tot4y)} จุด</span></div>
                     <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#f97316"></i>เฉพาะปี 2025</span><span class="tt-v">${formatNum(g.y2025)} จุด</span></div>`
                }
                ${g.maxFrp != null ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#eab308"></i>พลังงาน FRP สูงสุด</span><span class="tt-v">${formatNum(g.maxFrp)} MW</span></div>` : ""}
                <div class="tt-foot">จากชุดข้อมูลหมอกควันข้ามแดน 6 ประเทศอาเซียน 2.63 ล้านจุดจริง</div>
              `, meta.col);
            }
          } else {
            positionTooltip(e.clientX, e.clientY);
          }
          return;
        }
        const hit = hitTestMap(e.clientX, e.clientY);
        if (hit !== state.hoverItem) {
          state.hoverItem = hit;
          requestDrawMap(false);
        }
        if (hit) {
          const it = hit.item;
          const { level } = getVisibleRecords();
          const tKey = `poly:${level}:${it.code}:${state.sat}:${state.year}:${state.crop}:${state.metric}`;
          if (tKey !== lastTooltipKey) {
            lastTooltipKey = tKey;
            const wxFwi = level === "province" ? getWxAnnualMetric(it, "peak_fwi") : null;
            const wxTmax = level === "province" ? getWxAnnualMetric(it, "tmax") : null;
            const wxRh = level === "province" ? getWxAnnualMetric(it, "rh_min") : null;
            const aqPm = level === "province" ? getAqAnnualMetric(it, "pm25_peak") : null;
            const soilG = level === "province" ? getSoilAnnualMetric(it, "gwettop_peak") : null;
            const doaeRai = getDoaePlantedMetric(it);
            const burnRatePct = getBurnRateMetric(it);
            const trpB = getTrpBreakdown(it);
            const trpVal = getTrpMetric(it);
            const dTxt = hit.density !== null ? `${hit.density.toFixed(1)} /100 ตร.กม.` : "ไม่มีพื้นที่";
            const agPct = hit.agriPct !== null ? hit.agriPct : 0;
            const foPct = hit.total > 0 ? (hit.st.forest * 100 / hit.total) : 0;
            const lvlLabel = level === "province" ? "จังหวัด" : level === "amphoe" ? "อำเภอ" : "ตำบล";
            showTooltip(e.clientX, e.clientY, `
              <div class="tt-head">
                <div>
                  <h4>${escHtml(it.name_th)}</h4>
                  <div class="tt-sub">${lvlLabel} · ความหนาแน่น ${dTxt}</div>
                </div>
                <span class="tt-badge">${formatNum(hit.total)} จุด</span>
              </div>
              <div class="tt-bar">
                <div style="background:#d48942;width:${agPct.toFixed(1)}%"></div>
                <div style="background:#55947a;width:${foPct.toFixed(1)}%"></div>
              </div>
              <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร+ส.ป.ก. / ป่าไม้</span><span class="tt-v">${hit.agriPct !== null ? `${agPct.toFixed(1)}% / ${foPct.toFixed(1)}%` : "-"}</span></div>
              <div class="tt-divider"></div>
              <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#c96f53"></i>รอยเผา สสน. (20 ม.)</span><span class="tt-v">${trpVal !== null ? formatNum(trpVal, 0) + " ไร่" + (trpB ? ` (เกษตร ${formatNum(trpB.agri, 0)})` : "") : "ไม่มีข้อมูล"}</span></div>
              ${doaeRai !== null ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#eab308"></i>พื้นที่ปลูก DOAE · %เผา</span><span class="tt-v">${formatNum(doaeRai, 0)} ไร่${burnRatePct !== null ? ` (${burnRatePct.toFixed(1)}%)` : ""}</span></div>` : ""}
              <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#df6a37"></i>รอยเผา / เผาซ้ำ GISTDA</span><span class="tt-v">${it.scar_rai !== null ? formatNum(it.scar_rai, 0) : "ไม่มีข้อมูล"} / ${it.freq_rai !== null ? formatNum(it.freq_rai, 0) + " ไร่" : "-"}</span></div>
              <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>น้ำท่วมซ้ำ 17 ปี (HII)</span><span class="tt-v">${it.flood_max_17yr !== null ? it.flood_max_17yr + " ครั้ง" : "ไม่มีข้อมูล"}</span></div>
              ${level === "province" ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#eab308"></i>อากาศเอื้อไฟ FWI</span><span class="tt-v">${wxFwi !== null ? `${wxFwi.toFixed(1)}/100 (${wxTmax !== null ? wxTmax.toFixed(1) + "°C" : "-"} · RH ${wxRh !== null ? wxRh.toFixed(0) + "%" : "-"})` : "ไม่มีข้อมูล"}</span></div>` : ""}
              ${level === "province" && (aqPm !== null || soilG !== null) ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#a855f7"></i>PM2.5 แล้ง · ความชื้นดิน</span><span class="tt-v">${aqPm !== null ? aqPm.toFixed(1) + " µg/m³" : "-"} · ${soilG !== null ? soilG.toFixed(2) : "-"}</span></div>` : ""}
              <div class="tt-foot">คลิกพื้นที่เพื่อเจาะลึกบนแผนที่</div>
            `);
          } else {
            positionTooltip(e.clientX, e.clientY);
          }
        } else {
          lastTooltipKey = null;
          hideTooltip();
        }
      } else if (e.target !== els.scatterCanvas && e.target !== els.trendCanvas && !e.target.closest?.("#rankList")) {
        lastTooltipKey = null;
        hideTooltip();
      }
    }
    window.addEventListener("mousemove", (e) => {
      if (activePage !== "map") return;
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        const worldPx = 256 * Math.pow(2, state.zoom);
        state.camX -= dx / worldPx;
        state.camY -= dy / worldPx;
        lastX = e.clientX; lastY = e.clientY;
        requestDrawMap(true);
        return;
      }
      hoverEvt = e;
      if (!hoverPending) {
        hoverPending = true;
        requestAnimationFrame(processHover);
      }
    });
    els.mapCanvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = els.mapCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const wpBefore = 256 * Math.pow(2, state.zoom);
      const mx = state.camX + (sx - rect.width / 2) / wpBefore;
      const my = state.camY + (sy - rect.height / 2) / wpBefore;
      state.zoom = Math.max(3.6, Math.min(18, state.zoom + (e.deltaY < 0 ? 0.45 : -0.45)));
      const wpAfter = 256 * Math.pow(2, state.zoom);
      state.camX = mx - (sx - rect.width / 2) / wpAfter;
      state.camY = my - (sy - rect.height / 2) / wpAfter;
      requestDrawMap();
    }, { passive: false });

    // Scatter plot hover/click
    els.scatterCanvas.addEventListener("mousemove", (e) => {
      const rect = els.scatterCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let best = null, bestD = 12;
      for (const d of state.scatterDots) {
        const dist = Math.hypot(d.cx - x, d.cy - y);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      const nextCode = best ? best.rec.item.code : null;
      if (nextCode !== state.scatterHoverCode) {
        state.scatterHoverCode = nextCode;
        drawScatterPlot();
      }
      if (best) {
        const it = best.rec.item;
        const xLabel = els.scatterX?.selectedOptions?.[0]?.textContent || "แกน X";
        const yLabel = els.scatterY?.selectedOptions?.[0]?.textContent || "แกน Y";
        const xDec = state.scatterX === "soil_wet" ? 2 : (state.scatterX.includes("rai") || state.scatterX.includes("flood") || state.scatterX.includes("days") || state.scatterX === "aq_exceed" ? 0 : 1);
        const yDec = state.scatterY === "count" ? 0 : 1;
        const agPct = best.rec.agriPct !== null ? best.rec.agriPct.toFixed(1) : "0.0";
        const foPct = best.rec.total > 0 ? (best.rec.st.forest * 100 / best.rec.total).toFixed(1) : "0.0";
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>${escHtml(it.name_th)}</h4>
              <div class="tt-sub">${best.isProv ? "ระดับจังหวัด" : "พื้นที่ในมุมมอง"}</div>
            </div>
            <span class="tt-badge">${formatNum(best.rec.total)} จุด</span>
          </div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>${escHtml(xLabel)}</span><span class="tt-v">${formatNum(best.x, xDec)}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:var(--accent)"></i>${escHtml(yLabel)}</span><span class="tt-v">${formatNum(best.y, yDec)}</span></div>
          <div class="tt-bar"><div style="background:#d48942;width:${agPct}%"></div><div style="background:#55947a;width:${foPct}%"></div></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร+ส.ป.ก. / ป่าไม้</span><span class="tt-v">${agPct}% / ${foPct}%</span></div>
          <div class="tt-foot">คลิกจุดเพื่อซูมบนแผนที่</div>
        `);
      } else {
        hideTooltip();
      }
    });
    els.scatterCanvas.addEventListener("mouseleave", () => {
      if (state.scatterHoverCode) {
        state.scatterHoverCode = null;
        drawScatterPlot();
      }
      hideTooltip();
    });
    els.scatterCanvas.addEventListener("click", (e) => {
      const rect = els.scatterCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let best = null, bestD = 12;
      for (const d of state.scatterDots) {
        const dist = Math.hypot(d.cx - x, d.cy - y);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      if (best) selectFeature(best.rec.item, best.isProv ? "province" : getVisibleRecords().level);
    });

    // Yearly trend & Day/Night bar hover
    els.trendCanvas.addEventListener("mousemove", (e) => {
      const rect = els.trendCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const dn = state.trendDayNightInfo;
      if (dn && dn.tot > 0 && y >= dn.y0) {
        if (state.trendHoverIdx !== null) { state.trendHoverIdx = null; drawTrendChart(); }
        const dPct = (dn.day * 100 / dn.tot).toFixed(1);
        const nPct = (dn.night * 100 / dn.tot).toFixed(1);
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>สัดส่วนเวลาที่ตรวจพบจุดความร้อน</h4>
              <div class="tt-sub">เปรียบเทียบรอบดาวเทียมกลางวัน vs กลางคืน</div>
            </div>
            <span class="tt-badge">${formatNum(dn.tot)} จุด</span>
          </div>
          <div class="tt-bar"><div style="background:#d4a85a;width:${dPct}%"></div><div style="background:#5c8ba8;width:${nPct}%"></div></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d4a85a"></i>กลางวัน (~13:30 น.)</span><span class="tt-v">${formatNum(dn.day)} จุด (${dPct}%)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#5c8ba8"></i>กลางคืน (~01:30 น.)</span><span class="tt-v">${formatNum(dn.night)} จุด (${nPct}%)</span></div>
        `, "#d4a85a");
        return;
      }
      const hit = (state.trendHitBars || []).find(b => x >= b.x0 && x <= b.x1 && y <= b.y1);
      const nextIdx = hit ? hit.idx : null;
      if (nextIdx !== state.trendHoverIdx) {
        state.trendHoverIdx = nextIdx;
        drawTrendChart();
      }
      if (hit) {
        const r = hit.row;
        const agPct = r.total > 0 ? (r.agri * 100 / r.total).toFixed(1) : "0.0";
        const foPct = r.total > 0 ? (r.forest * 100 / r.total).toFixed(1) : "0.0";
        const otPct = r.total > 0 ? (r.other * 100 / r.total).toFixed(1) : "0.0";
        const yoy = hit.prev && hit.prev.total > 0 ? ((r.total - hit.prev.total) * 100 / hit.prev.total) : null;
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>ปี ${r.year} (พ.ศ. ${r.year + 543})</h4>
              <div class="tt-sub">${state.janOct ? "ช่วงเทียบมาตรฐาน ม.ค.–ต.ค." : "รวมทุกเดือนในตัวกรอง"}</div>
            </div>
            <span class="tt-badge">${yoy !== null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}% YoY` : formatNum(r.total) + " จุด"}</span>
          </div>
          <div class="tt-row"><span class="tt-k">จุดความร้อนรวม</span><span class="tt-v">${formatNum(r.total)} จุด</span></div>
          <div class="tt-bar"><div style="background:#d48942;width:${agPct}%"></div><div style="background:#55947a;width:${foPct}%"></div><div style="background:#64748b;width:${otPct}%"></div></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร + ส.ป.ก.</span><span class="tt-v">${formatNum(r.agri)} (${agPct}%)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#55947a"></i>ป่าไม้</span><span class="tt-v">${formatNum(r.forest)} (${foPct}%)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#64748b"></i>พื้นที่อื่น ๆ</span><span class="tt-v">${formatNum(r.other)} (${otPct}%)</span></div>
        `);
      } else {
        hideTooltip();
      }
    });
    els.trendCanvas.addEventListener("mouseleave", () => {
      if (state.trendHoverIdx !== null) {
        state.trendHoverIdx = null;
        drawTrendChart();
      }
      hideTooltip();
    });
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (activePage === "map") {
          if (!state.selectedProv && !state.selectedAmphoe) fitBbox(THAI_BBOX);
          requestDrawMap(true); drawScatterPlot(); drawTrendChart();
        } else if (activePage === "overview") renderOverviewPage();
        else if (activePage === "weather") renderWeatherPage();
        else if (activePage === "haze") renderHazePage();
        else if (activePage === "burnscar") renderBurnScarPage();
      }, 90);
    });
  }

/*__MULTI_PAGE_JS__*/
/*__EXPLORER_JS__*/

  async function init() {
    try {
      const decoded = await decodePayload();
      prepareData(decoded);
      bindEvents();
      bindMultiPageEvents();
      if (typeof bindExplorerEvents === "function") bindExplorerEvents();
      els.loadingMask.style.display = "none";
      updateWarnings();
      computeFilteredStats();
      updateBreadcrumbsAndScope();
      updateSidebarMetrics();
      const rawHash = (window.location.hash || "").replace(/^#/, "");
      const startPage = ["overview", "map", "weather", "haze", "burnscar", "explorer"].includes(rawHash)
        && document.getElementById("page-" + rawHash)
        ? rawHash : "overview";
      switchPage(startPage, { updateHash: false });
    } catch (err) {
      els.loadingMask.textContent = "เกิดข้อผิดพลาดในการโหลดข้อมูล: " + (err?.message || err);
    }
  }
  init();
})();
</script>
</body>
</html>
"""


def _apply_multi_page(shell: str) -> str:
    nav_items = "\n".join(
        f'<button type="button" class="nav-tab{" active" if page == "overview" else ""}" '
        f'data-page="{page}">{html.escape(label)}</button>'
        for page, label in ATLAS_NAV_ITEMS
    )
    return (
        shell
        .replace("<!--__ATLAS_FONTS__-->", ATLAS_FONTS)
        .replace("<!--__ATLAS_THEME_SCRIPT__-->", ATLAS_THEME_SCRIPT)
        .replace("<!--__ATLAS_NAV_ITEMS__-->", nav_items)
        .replace("/*__ATLAS_THEME_CSS__*/", ATLAS_THEME_CSS)
        .replace("/*__ATLAS_CHROME_CSS__*/", ATLAS_CHROME_CSS)
        .replace("/*__MULTI_PAGE_CSS__*/", MULTI_PAGE_CSS)
        .replace("<!--__OVERVIEW_PAGE__-->", OVERVIEW_PAGE_HTML)
        .replace("<!--__WEATHER_PAGE__-->", WEATHER_PAGE_HTML)
        .replace("<!--__HAZE_PAGE__-->", HAZE_PAGE_HTML)
        .replace("<!--__BURNSCAR_PAGE__-->", BURNSCAR_PAGE_HTML)
        .replace("/*__MULTI_PAGE_JS__*/", MULTI_PAGE_JS)
    )


def render_interactive_html(payload: dict) -> str:
    """Render the self-contained offline interactive atlas HTML (4 pages) with gzip-compressed payload."""
    encoded = encode_payload_b64(payload)
    # Guard any potential HTML tag sequence safely (base64 never has '<', escape defensively anyway).
    safe_b64 = html.escape(encoded, quote=False)
    return (
        _apply_multi_page(HTML_SHELL)
        .replace("/*__EXPLORER_CSS__*/", "")
        .replace("<!--__EXPLORER_BTN__-->", "")
        .replace("<!--__EXPLORER_MODAL__-->", "")
        .replace("/*__EXPLORER_JS__*/", "")
        .replace("__PAYLOAD_URL__", "")
        .replace("__PAYLOAD_B64__", safe_b64)
    )


def render_online_web_html(hf_repo: str = "dragonfly13110/thailand-hotspot-5y") -> str:
    """Render the lightweight 5-page online web atlas backed by Hugging Face Datasets + DuckDB-Wasm."""
    safe_repo = html.escape(hf_repo.strip(), quote=True)
    payload_url = f"https://huggingface.co/datasets/{safe_repo}/resolve/main/summary/map_payload.json.gz"
    return (
        _apply_multi_page(HTML_SHELL)
        .replace("/*__EXPLORER_CSS__*/", EXPLORER_CSS)
        .replace("<!--__EXPLORER_BTN__-->", EXPLORER_BUTTON_HTML)
        .replace("<!--__EXPLORER_MODAL__-->", EXPLORER_MODAL_HTML.replace("__HF_REPO__", safe_repo))
        .replace("/*__EXPLORER_JS__*/", EXPLORER_JS.replace("__HF_REPO__", safe_repo))
        .replace("__PAYLOAD_URL__", payload_url)
        .replace("__PAYLOAD_B64__", "")
    )
