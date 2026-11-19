"""Self-contained, offline-capable HTML/Canvas interactive map template."""

from __future__ import annotations

import html
import json

from explorer_asset import EXPLORER_BUTTON_HTML, EXPLORER_CSS, EXPLORER_JS, EXPLORER_MODAL_HTML
from map_data import encode_payload_b64
from ui_pages import (
    BURNSCAR_PAGE_HTML,
    MULTI_PAGE_CSS,
    MULTI_PAGE_JS,
    OVERVIEW_PAGE_HTML,
    WEATHER_PAGE_HTML,
)

HTML_SHELL = r"""<!DOCTYPE html>
<html lang="th" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Thailand Fire, Burn Scar & Climate Intelligence Atlas (2022–2026)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
<style>
:root {
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
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; width: 100%; max-width: 100%; height: 100%;
  background: var(--bg); color: var(--text);
  font-family: "IBM Plex Sans Thai", system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", Tahoma, sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
#app {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 58px 1fr;
  height: 100vh; width: 100%; max-width: 100%; overflow-x: hidden;
}
.topbar {
  display: flex; align-items: center; gap: 10px; padding: 0 16px;
  background: var(--topbar-bg); border-bottom: 1px solid var(--border);
  z-index: 30; overflow-x: auto; white-space: nowrap; scrollbar-width: thin;
  min-width: 0; max-width: 100%;
}
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; cursor: pointer; }
.brand-dot {
  width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent);
}
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
  position: fixed; pointer-events: none; z-index: 90; display: none;
  background: var(--panel-solid); border: 1px solid var(--accent); border-radius: 10px;
  padding: 9px 11px; box-shadow: var(--shadow); font-size: 12px; min-width: 220px; max-width: 300px;
}
.tooltip h4 { margin: 0 0 5px; font-size: 13px; color: var(--accent); }
.tt-row { display: flex; justify-content: space-between; gap: 10px; margin: 2px 0; }
.tt-k { color: var(--muted); }
.tt-v { font-weight: 600; text-align: right; }

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
      <button type="button" class="nav-tab active" data-page="overview">ภาพรวม</button>
      <button type="button" class="nav-tab" data-page="map">แผนที่เจาะลึก</button>
      <button type="button" class="nav-tab" data-page="weather">อากาศ × ไฟ</button>
      <button type="button" class="nav-tab" data-page="burnscar">รอยเผา &amp; เทียบจังหวัด</button>
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
        <div class="section-title"><span>4. ชั้นข้อมูลซ้อนทับ</span></div>
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
        <button id="zoomOutBtn" class="zoom-btn" title="ซูมออก">−</button>
      </div>
      <div id="legendBox" class="hud-box legend-box">
        <div id="legendTitle" style="font-weight:700;font-size:12px;">จำนวนจุดความร้อน</div>
        <div id="legendBar" class="legend-bar"></div>
        <div class="legend-labels"><span id="legMin">0</span><span id="legMid">-</span><span id="legMax">-</span></div>
        <div id="legendNullChip" class="null-chip" style="display:none;"><span class="null-swatch"></span><span>ไม่มีข้อมูลต้นทาง (ไม่ใช่ 0)</span></div>
        <div id="tmsLegendChip" class="null-chip" style="display:none;flex-wrap:wrap;gap:6px;margin-top:4px;font-size:10.5px;"></div>
      </div>
      <div id="mapDock" class="map-dock" aria-label="สลับมุมมองแผนที่ด่วน">
        <button type="button" class="dock-btn active" data-dock-metric="count">จุดความร้อน</button>
        <button type="button" class="dock-btn" data-dock-metric="trp_rai">รอยเผา สสน.</button>
        <button type="button" class="dock-btn" data-dock-metric="wx_fwi">อากาศ FWI</button>
        <button type="button" class="dock-btn" data-dock-metric="hazard">ท่วม+เผา</button>
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
      <li><strong>จุดซ้ำถาวร (`143` พิกัด / `7,324` จุด):</strong> เกิดซ้ำจุดเดิม ≥25 วัน มักเป็นโรงงาน/เตาเผา/โรงไฟฟ้าชีวมวล (92% โผล่ตอนกลางคืน) ถูกตัดออกโดยค่าเริ่มต้น</li>
    </ul>
  </div>
</div>

<script id="payloadB64" type="text/plain">__PAYLOAD_B64__</script>
<script>
(function() {
  "use strict";

  const PALETTES = {
    fire: ["#1b2230", "#4b251f", "#843624", "#bc4f28", "#dd783e", "#edc078"],
    agri: ["#1b2230", "#2f574b", "#558c73", "#a89d60", "#d48440", "#c24e38"],
    rain: ["#7a3a26", "#b6733f", "#c9b382", "#7da9bd", "#4c84a3", "#2b5b80"],
    heat: ["#1e2636", "#455c78", "#a88f5a", "#d67a3e", "#c94d34", "#912a24"],
    hazard: ["#1c2331", "#31576b", "#598c96", "#c4944c", "#cf6339", "#a13b3b"],
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
    levelMode: "auto",
    selectedProv: null,
    selectedAmphoe: null,
    selectedTambon: null,
    showHeat: false,
    showStatic: false,
    showVillages: false,
    tmsOverlay: "none",
    basemap: "none",
    scatterX: "wx_peak_fwi",
    scatterY: "count",
    theme: "dark",
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
    "excludeStaticCheck","metricSelect","levelModeSelect","grainWarnPill",
    "showHeatCheck","showStaticCheck","showVillagesCheck","tmsOverlaySelect","basemapSelect",
    "mapCanvas","scopePill","resetZoomBtn","zoomInBtn","zoomOutBtn",
    "legendTitle","legendBar","legMin","legMid","legMax","legendNullChip","tmsLegendChip","tooltip",
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

    // Only aggregate 0.05-deg heatmap cells when Heatmap overlay is actually enabled
    let maxGridCnt = 1;
    const gridCells = [];
    if (state.showHeat && GRID_FLAT.length) {
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
        const latI = GRID_FLAT[o], lonI = GRID_FLAT[o + 1], cnt = GRID_FLAT[o + 3];
        const key = (latI << 16) ^ lonI;
        let prev = cellAgg.get(key);
        if (!prev) cellAgg.set(key, { mx: lonToMx(lonI / 20), my: latToMy(latI / 20), cnt });
        else prev.cnt += cnt;
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

  function getPaletteAndColor(val, minV, maxV, nullFill) {
    if (val === null || val === undefined || Number.isNaN(val)) return nullFill || "#334155";
    const m = state.metric;
    let pal = PALETTES.fire;
    if (m === "agri_pct") pal = PALETTES.agri;
    else if (m === "era5_rain" || m === "wx_rain" || m === "wx_rhmin") pal = PALETTES.rain;
    else if (m === "era5_hot" || m === "era5_dry" || m === "wx_fwi" || m === "wx_tmax" || m === "wx_low_rh" || m === "wx_wind") pal = PALETTES.heat;
    else if (m === "hazard") pal = PALETTES.hazard;

    const span = maxV - minV;
    if (span <= 0) return pal[val > 0 ? 3 : 0];
    let t = (val - minV) / span;
    if (m === "count" || m === "density" || m === "trp_rai" || m === "scar_rai" || m === "freq_rai") {
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

  function drawTiles(ctx, w, h) {
    if (state.basemap === "none") return;
    const z = Math.max(4, Math.min(13, Math.round(state.zoom)));
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

    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const key = `${state.basemap}:${z}:${tx}:${ty}`;
        let entry = TILE_CACHE.get(key);
        if (!entry) {
          const img = new Image();
          let url = "";
          if (state.basemap === "osm") url = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
          else if (state.basemap === "carto_dark") url = `https://a.basemaps.cartocdn.com/dark_all/${z}/${tx}/${ty}.png`;
          else if (state.basemap === "esri_sat") url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
          entry = { img, ok: false, err: false };
          img.onload = () => { entry.ok = true; requestDrawMap(); };
          img.onerror = () => { entry.err = true; };
          img.src = url;
          if (TILE_CACHE.size > 360) {
            const firstKey = TILE_CACHE.keys().next().value;
            TILE_CACHE.delete(firstKey);
          }
          TILE_CACHE.set(key, entry);
        }
        if (entry.ok) {
          const dx = (tx / nTiles - state.camX) * worldPx + w / 2;
          const dy = (ty / nTiles - state.camY) * worldPx + h / 2;
          ctx.drawImage(entry.img, dx, dy, tilePx + 0.6, tilePx + 0.6);
        }
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
    for (const layerPath of layers) {
      for (let tx = tx0; tx <= tx1; tx++) {
        for (let ty = ty0; ty <= ty1; ty++) {
          const tmsY = nTiles - 1 - ty;
          const key = `tms:${layerPath}:${z}:${tx}:${tmsY}`;
          let entry = TILE_CACHE.get(key);
          if (!entry) {
            const img = new Image();
            const url = `https://tamroypao.hii.or.th/tms/${layerPath}/${z}/${tx}/${tmsY}.png`;
            entry = { img, ok: false, err: false };
            img.onload = () => { entry.ok = true; requestDrawMap(); };
            img.onerror = () => { entry.err = true; };
            img.src = url;
            if (TILE_CACHE.size > 360) {
              const firstKey = TILE_CACHE.keys().next().value;
              TILE_CACHE.delete(firstKey);
            }
            TILE_CACHE.set(key, entry);
          }
          if (entry.ok) {
            const dx = (tx / nTiles - state.camX) * worldPx + w / 2;
            const dy = (ty / nTiles - state.camY) * worldPx + h / 2;
            ctx.drawImage(entry.img, dx, dy, tilePx + 0.6, tilePx + 0.6);
          }
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

    // Subtle cartographic lat/lon graticule grid when using pure vector canvas (drawn once on baseCanvas)
    if (state.basemap === "none") {
      const stepDeg = state.zoom >= 7.5 ? 1 : 2;
      ctx.save();
      ctx.strokeStyle = state.theme === "dark" ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.065)";
      ctx.fillStyle = state.theme === "dark" ? "rgba(148,163,184,0.36)" : "rgba(71,85,105,0.45)";
      ctx.lineWidth = 0.8;
      ctx.font = "500 9.5px 'JetBrains Mono', monospace";
      for (let lon = 96; lon <= 108; lon += stepDeg) {
        const sx = toSx(lonToMx(lon));
        if (sx < 0 || sx > w) continue;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
        ctx.fillText(lon + "°E", sx + 3, h - 6);
      }
      for (let lat = 6; lat <= 22; lat += stepDeg) {
        const sy = toSy(latToMy(lat));
        if (sy < 0 || sy > h) continue;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
        ctx.fillText(lat + "°N", 6, sy - 3);
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

    // Draw background Thailand silhouette if zoomed into amphoe/tambon
    if (level !== "province" && state.levelMode !== "amphoe_all") {
      ctx.save();
      ctx.fillStyle = state.theme === "dark" ? "rgba(30,41,59,0.35)" : "rgba(203,213,225,0.45)";
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.lineWidth = 0.8;
      for (const p of DATA.provinces) {
        if (p.code === state.selectedProv) continue;
        ctx.beginPath();
        for (const r of p._mRings) traceRingF32(ctx, r, toSx, toSy);
        ctx.fill("evenodd");
        ctx.stroke();
      }
      if (level === "tambon" && state.selectedProv) {
        for (const a of DATA.amphoes) {
          if (a.prov_code !== state.selectedProv || a.code === state.selectedAmphoe) continue;
          ctx.beginPath();
          for (const r of a._mRings) traceRingF32(ctx, r, toSx, toSy);
          ctx.fill("evenodd");
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Draw active polygons (with subtle glowing country silhouette once on baseCanvas)
    const hasTiles = state.basemap !== "none";
    const hasTms = state.tmsOverlay !== "none";
    if (level === "province" && !hasTiles && !hasTms) {
      ctx.save();
      ctx.shadowColor = state.theme === "dark" ? "rgba(249, 115, 22, 0.24)" : "rgba(15, 23, 42, 0.16)";
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
    ctx.globalAlpha = hasTms ? 0.30 : (hasTiles ? 0.78 : 0.95);
    ctx.lineWidth = level === "tambon" ? 0.55 : 0.9;
    ctx.strokeStyle = strokeCol;
    for (const rec of records) {
      ctx.beginPath();
      for (const ring of rec.item._mRings) traceRingF32(ctx, ring, toSx, toSy);
      ctx.fillStyle = getPaletteAndColor(rec.metricValue, minV, maxV, nullFill);
      ctx.fill("evenodd");
      ctx.stroke();
    }
    ctx.restore();

    if (hasTms) {
      drawTmsOverlay(ctx, w, h);
    }

    // Fast pre-baked sprite Heatmap overlay (no per-cell createRadialGradient or 45k-vertex clip)
    if (state.showHeat && records.length) {
      drawHeatmapOverlay(ctx, w, h, toSx, toSy, worldPx);
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
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#fde047";
      if (pinnedItem) {
        ctx.beginPath();
        for (const ring of pinnedItem._mRings) traceRingF32(ctx, ring, toSx, toSy);
        ctx.stroke();
      }
      if (hoverItem && hoverItem !== pinnedItem) {
        ctx.beginPath();
        for (const ring of hoverItem._mRings) traceRingF32(ctx, ring, toSx, toSy);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawHeatmapOverlay(ctx, w, h, toSx, toSy, worldPx) {
    const gridCells = state.computedStats?.gridCells || [];
    if (!gridCells.length) return;
    const maxC = state.computedStats.maxGridCnt || 1;
    const rBase = Math.max(4.5, Math.min(24, worldPx * 0.0003));
    const sprite = getHeatSprite(state.theme === "dark");
    ctx.save();
    ctx.globalCompositeOperation = state.theme === "dark" ? "screen" : "source-over";
    for (let i = 0; i < gridCells.length; i++) {
      const c = gridCells[i];
      const sx = toSx(c.mx);
      const sy = toSy(c.my);
      if (sx < -26 || sx > w + 26 || sy < -26 || sy > h + 26) continue;
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
      wx_rhmin: "ความชื้นสัมพัทธ์ต่ำสุดเฉลี่ย (% · ฟ้า=ชื้น ส้ม=แห้ง)",
      wx_low_rh: "วันอากาศแห้งจัด RH<35% (วัน/ปี)",
      wx_wind: "ความเร็วลมสูงสุดเฉลี่ย (กม./ชม.)",
      wx_rain: "ปริมาณฝนรวม (มม. · 2022–2026)",
      era5_hot: "อากาศ ERA5: วันร้อนจัด ≥38°C (วัน)",
      era5_dry: "อากาศ ERA5: ช่วงแล้งยาวสุด (วัน)",
      era5_rain: "อากาศ ERA5: ฝนรวมทั้งปี (มม.)",
      hazard: "ดัชนีเสี่ยงซ้ำซ้อน (ท่วมซ้ำ + เผาซ้ำ 0–100)",
    };
    els.legendTitle.textContent = titles[state.metric] || "";
    const pal = state.metric === "agri_pct" ? PALETTES.agri
      : (state.metric === "era5_rain" || state.metric === "wx_rain" || state.metric === "wx_rhmin") ? PALETTES.rain
      : (state.metric === "era5_hot" || state.metric === "era5_dry" || state.metric === "wx_fwi" || state.metric === "wx_tmax" || state.metric === "wx_low_rh" || state.metric === "wx_wind") ? PALETTES.heat
      : state.metric === "hazard" ? PALETTES.hazard : PALETTES.fire;
    els.legendBar.style.background = `linear-gradient(90deg, ${pal.join(",")})`;
    if (!hasValid) {
      els.legMin.textContent = "-"; els.legMid.textContent = "-"; els.legMax.textContent = "-";
    } else {
      const dec = (state.metric === "density" || state.metric === "agri_pct" || state.metric === "wx_fwi" || state.metric === "wx_tmax" || state.metric === "wx_rhmin" || state.metric === "wx_wind") ? 1 : 0;
      els.legMin.textContent = formatNum(minV, dec);
      els.legMid.textContent = formatNum((minV + maxV) / 2, dec);
      els.legMax.textContent = formatNum(maxV, dec);
    }
    els.legendNullChip.style.display = hasNull ? "inline-flex" : "none";
    if (els.tmsLegendChip) {
      if (state.tmsOverlay === "none") {
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
    state.zoom = Math.max(3.6, Math.min(12.5, Math.min(zx, zy)));
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

    // Strict grain rule: ERA5 & Fire-Weather are ONLY 77-province level; never duplicate onto amphoes/tambons!
    const useProvGrain = isEraX || isWxX || getActiveScopeLevel() === "province";
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
      ctx.fillStyle = isSel ? "#df6a37" : "rgba(104, 156, 184, 0.85)";
      ctx.strokeStyle = isSel ? "#f1f5f9" : "rgba(15, 23, 42, 0.7)";
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, isSel ? 5.2 : 3.5, 0, Math.PI * 2);
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
    const bw = Math.min(34, (pw / rows.length) * 0.56);

    rows.forEach((r, idx) => {
      const cx = pad.l + (idx + 0.5) * (pw / rows.length);
      const x = cx - bw / 2;
      const hAgri = (r.agri / maxY) * ph;
      const hFor = (r.forest / maxY) * ph;
      const hOth = (r.other / maxY) * ph;
      let y = pad.t + ph;
      if (hAgri > 0) { ctx.fillStyle = "#d48942"; ctx.fillRect(x, y - hAgri, bw, hAgri); y -= hAgri; }
      if (hFor > 0) { ctx.fillStyle = "#55947a"; ctx.fillRect(x, y - hFor, bw, hFor); y -= hFor; }
      if (hOth > 0) { ctx.fillStyle = "#64748b"; ctx.fillRect(x, y - hOth, bw, hOth); }
      ctx.fillStyle = "#8b95a7";
      ctx.font = "11px system-ui";
      ctx.fillText(String(r.year), cx - 14, pad.t + ph + 12);
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
    syncControl(els.levelModeSelect, "levelMode");
    syncControl(els.showHeatCheck, "showHeat", el => el.checked);
    syncControl(els.showStaticCheck, "showStatic", el => el.checked);
    syncControl(els.showVillagesCheck, "showVillages", el => el.checked);
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
    const dockHeat = document.getElementById("dockHeatBtn");
    if (dockHeat) {
      dockHeat.onclick = () => {
        state.showHeat = !state.showHeat;
        els.showHeatCheck.checked = state.showHeat;
        refreshAll();
      };
    }
    els.zoomInBtn.onclick = () => { state.zoom = Math.min(13, state.zoom + 0.7); requestDrawMap(); };
    els.zoomOutBtn.onclick = () => { state.zoom = Math.max(3.6, state.zoom - 0.7); requestDrawMap(); };
    els.exportCsvBtn.onclick = exportCurrentCsv;
    els.provenanceBtn.onclick = () => { els.provenanceModal.style.display = "flex"; };
    els.closeModalBtn.onclick = () => { els.provenanceModal.style.display = "none"; };
    els.provenanceModal.onclick = (e) => { if (e.target === els.provenanceModal) els.provenanceModal.style.display = "none"; };

    els.themeToggle.onclick = () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", state.theme);
      els.themeToggle.textContent = state.theme === "dark" ? "โหมดสว่าง" : "โหมดมืด";
      if (activePage === "map") refreshAll();
      else if (activePage === "overview") renderOverviewPage();
      else if (activePage === "weather") renderWeatherPage();
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
            : `vil:${ptHit.data.tambon_code}:${ptHit.data.name}:${state.sat}`;
          if (tKey !== lastTooltipKey) {
            lastTooltipKey = tKey;
            if (ptHit.kind === "static") {
              const sp = ptHit.data;
              els.tooltip.innerHTML = `
                <h4 style="color:#38bdf8">จุดซ้ำถาวร (สงสัยโรงงาน/เตาเผา)</h4>
                <div class="tt-row"><span class="tt-k">พิกัดพื้นที่</span><span class="tt-v">ต.${escHtml(sp.tambon)} อ.${escHtml(sp.amphoe)} จ.${escHtml(sp.prov)}</span></div>
                <div class="tt-row"><span class="tt-k">ประเภทพื้นที่</span><span class="tt-v">${escHtml(sp.lu)}</span></div>
                <div class="tt-row"><span class="tt-k">ซ้ำทั้งหมด</span><span class="tt-v">${formatNum(sp.points)} จุด (${sp.days} วัน)</span></div>
                <div class="tt-row"><span class="tt-k">ความแรงเฉลี่ย</span><span class="tt-v">${sp.avg_frp.toFixed(2)} MW</span></div>
              `;
            } else {
              const v = ptHit.data;
              const cnt = state.sat === "N" ? v.n : v.all;
              const ag = state.sat === "N" ? v.agri_n : v.agri_all;
              els.tooltip.innerHTML = `
                <h4 style="color:#facc15">${escHtml(v.name)}${v.moo ? " หมู่ " + escHtml(v.moo) : ""}</h4>
                <div class="tt-row"><span class="tt-k">พื้นที่</span><span class="tt-v">ต.${escHtml(v.tambon)} อ.${escHtml(v.amphoe)} จ.${escHtml(v.prov)}</span></div>
                <div class="tt-row"><span class="tt-k">จุดความร้อน (${escHtml(state.sat)})</span><span class="tt-v">${formatNum(cnt)} จุด (เกษตร ${formatNum(ag)})</span></div>
                <div class="tt-row"><span class="tt-k">ระยะห่างเฉลี่ย</span><span class="tt-v">${v.dist_km !== null ? v.dist_km.toFixed(2) + " กม." : "-"}</span></div>
              `;
            }
          }
          els.tooltip.style.left = Math.min(window.innerWidth - 290, e.clientX + 14) + "px";
          els.tooltip.style.top = Math.min(window.innerHeight - 170, e.clientY + 14) + "px";
          els.tooltip.style.display = "block";
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
            const trpB = getTrpBreakdown(it);
            const trpVal = getTrpMetric(it);
            const dTxt = hit.density !== null ? `${hit.density.toFixed(1)}/100 ตร.กม.` : "ไม่มีพื้นที่";
            els.tooltip.innerHTML = `
              <h4>${escHtml(it.name_th)}</h4>
              <div class="tt-row"><span class="tt-k">จุดความร้อน</span><span class="tt-v">${formatNum(hit.total)} จุด (${dTxt})</span></div>
              <div class="tt-row"><span class="tt-k">เกษตร+ส.ป.ก.</span><span class="tt-v">${hit.agriPct !== null ? hit.agriPct.toFixed(1) + "%" : "-"}</span></div>
              <div class="tt-row"><span class="tt-k">รอยเผา สสน.</span><span class="tt-v">${trpVal !== null ? formatNum(trpVal, 0) + " ไร่" + (trpB ? " (เกษตร " + formatNum(trpB.agri, 0) + " · ป่า " + formatNum(trpB.forest, 0) + ")" : "") : "ไม่มีข้อมูล"}</span></div>
              <div class="tt-row"><span class="tt-k">รอยเผา GISTDA</span><span class="tt-v">${it.scar_rai !== null ? formatNum(it.scar_rai, 0) + " ไร่" : "ไม่มีข้อมูล"}</span></div>
              <div class="tt-row"><span class="tt-k">เผาซ้ำซาก GISTDA</span><span class="tt-v">${it.freq_rai !== null ? formatNum(it.freq_rai, 0) + " ไร่" : "ไม่มีข้อมูล"}</span></div>
              <div class="tt-row"><span class="tt-k">ท่วมซ้ำ 17 ปี</span><span class="tt-v">${it.flood_max_17yr !== null ? it.flood_max_17yr + " ครั้ง (" + escHtml(hit.hazardLabel || "") + ")" : "ไม่มีข้อมูล HII"}</span></div>
              ${level === "province" ? `<div class="tt-row"><span class="tt-k">อากาศเอื้อไฟ (FWI)</span><span class="tt-v">${wxFwi !== null ? wxFwi.toFixed(1) + "/100 (" + (wxTmax !== null ? wxTmax.toFixed(1) + "°C · RH " + (wxRh !== null ? wxRh.toFixed(0) + "%" : "-") : "") + ")" : "ไม่มีข้อมูล"}</span></div>` : ""}
            `;
          }
          els.tooltip.style.left = Math.min(window.innerWidth - 290, e.clientX + 14) + "px";
          els.tooltip.style.top = Math.min(window.innerHeight - 170, e.clientY + 14) + "px";
          els.tooltip.style.display = "block";
        } else {
          lastTooltipKey = null;
          els.tooltip.style.display = "none";
        }
      } else if (e.target !== els.scatterCanvas) {
        lastTooltipKey = null;
        els.tooltip.style.display = "none";
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
      state.zoom = Math.max(3.6, Math.min(13.5, state.zoom + (e.deltaY < 0 ? 0.35 : -0.35)));
      const wpAfter = 256 * Math.pow(2, state.zoom);
      state.camX = mx - (sx - rect.width / 2) / wpAfter;
      state.camY = my - (sy - rect.height / 2) / wpAfter;
      requestDrawMap();
    }, { passive: false });

    // Scatter plot hover/click
    els.scatterCanvas.addEventListener("mousemove", (e) => {
      const rect = els.scatterCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let best = null, bestD = 11;
      for (const d of state.scatterDots) {
        const dist = Math.hypot(d.cx - x, d.cy - y);
        if (dist < bestD) { bestD = dist; best = d; }
      }
      if (best) {
        els.tooltip.innerHTML = `
          <h4>${escHtml(best.rec.item.name_th)}</h4>
          <div class="tt-row"><span class="tt-k">แกน X</span><span class="tt-v">${formatNum(best.x, 1)}</span></div>
          <div class="tt-row"><span class="tt-k">แกน Y</span><span class="tt-v">${formatNum(best.y, 1)}</span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">คลิกจุดเพื่อซูมบนแผนที่</div>
        `;
        els.tooltip.style.left = Math.min(window.innerWidth - 260, e.clientX + 12) + "px";
        els.tooltip.style.top = Math.max(10, e.clientY - 75) + "px";
        els.tooltip.style.display = "block";
      } else if (e.target !== els.scatterCanvas) {
        els.tooltip.style.display = "none";
      }
    });
    els.scatterCanvas.addEventListener("mouseleave", () => { els.tooltip.style.display = "none"; });
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
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (activePage === "map") {
          if (!state.selectedProv && !state.selectedAmphoe) fitBbox(THAI_BBOX);
          requestDrawMap(true); drawScatterPlot(); drawTrendChart();
        } else if (activePage === "overview") renderOverviewPage();
        else if (activePage === "weather") renderWeatherPage();
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
      const startPage = ["overview", "map", "weather", "burnscar", "explorer"].includes(rawHash)
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
    return (
        shell
        .replace("/*__MULTI_PAGE_CSS__*/", MULTI_PAGE_CSS)
        .replace("<!--__OVERVIEW_PAGE__-->", OVERVIEW_PAGE_HTML)
        .replace("<!--__WEATHER_PAGE__-->", WEATHER_PAGE_HTML)
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
