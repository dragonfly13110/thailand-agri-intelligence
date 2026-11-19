"""Multi-page editorial UI (Overview, Fire-Weather Lab, Burn Scar & Comparator) for Hotspot-5Y Atlas."""

from __future__ import annotations

MULTI_PAGE_CSS = r"""
/* ===== Multi-Page Editorial Shell & Visual System ===== */
@keyframes pageFadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.28); border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: rgba(249,115,22,0.55); }

.topbar {
  height: 58px; padding: 0 16px; gap: 10px;
  background: var(--topbar-bg); border-bottom: 1px solid var(--border);
  box-shadow: 0 2px 16px rgba(0,0,0,0.24);
}
.brand-sub { font-size: 11px; color: var(--muted); font-weight: 500; margin-left: 2px; }
.nav-tabs {
  display: flex; align-items: center; gap: 4px;
  background: var(--card); border: 1px solid var(--border);
  padding: 3px; border-radius: 12px;
}
.nav-tab {
  padding: 6px 13px; border-radius: 9px; border: 1px solid transparent;
  background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 600;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 6px;
  transition: color .15s, background .15s, border-color .15s, transform .12s;
}
.nav-tab:hover { color: var(--text); background: rgba(148,163,184,0.12); }
.nav-tab.active {
  background: var(--accent);
  color: #ffffff; border-color: transparent;
}
.app-body {
  height: calc(100vh - 58px); overflow: hidden; position: relative;
  min-width: 0; max-width: 100%;
}
.page-view {
  display: none; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden;
  background: var(--bg-mesh); min-width: 0; max-width: 100%;
}
.page-view.active { display: block; animation: pageFadeIn .18s ease-out; }
#page-map.active { display: grid; overflow: hidden; animation: none; }

.page-wrap {
  max-width: 1440px; width: 100%; min-width: 0; margin: 0 auto; padding: 22px 24px 64px;
  display: flex; flex-direction: column; gap: 18px;
}
.hero-banner {
  background: var(--hero-bg); border: 1px solid var(--border-strong);
  border-radius: 16px; padding: 24px 26px; box-shadow: var(--shadow-sm);
  display: flex; flex-direction: column; gap: 16px; min-width: 0; max-width: 100%;
  position: relative;
}
.hero-row {
  display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap;
}
.hero-kicker {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--accent); margin-bottom: 6px;
}
.hero-title { margin: 0; font-size: 23px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.28; }
.hero-desc { margin: 7px 0 0; font-size: 13.5px; color: var(--muted); max-width: 760px; line-height: 1.6; }
.hero-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.story-strip {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px;
  padding-top: 14px; border-top: 1px solid var(--border);
}
.story-chip {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 11px 14px; border-radius: 11px; text-align: left; font-family: inherit;
  background: var(--card); border: 1px solid var(--border); color: var(--text);
  cursor: pointer; transition: border-color .16s, background .16s;
}
.story-chip:hover { border-color: var(--accent); background: var(--accent-soft); }
.story-chip-title { font-size: 12.5px; font-weight: 700; display: block; }
.story-chip-sub { font-size: 11.5px; color: var(--muted); display: block; margin-top: 2px; }
.story-chip-arrow { font-size: 14px; color: var(--muted); font-weight: 700; flex-shrink: 0; }
.story-chip:hover .story-chip-arrow { color: var(--accent); }

.kpi-hero-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px;
}
.kpi-hero {
  background: var(--card-elev); border: 1px solid var(--border); border-radius: 14px;
  padding: 17px 18px; box-shadow: var(--shadow-sm); position: relative;
  display: flex; flex-direction: column; gap: 7px;
  transition: border-color .16s;
}
.kpi-hero:hover { border-color: var(--border-strong); }
.kpi-hero-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.kpi-hero-label { font-size: 12px; font-weight: 600; color: var(--muted); }
.kpi-hero-val { font-size: 26px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.kpi-hero-sub { font-size: 12px; color: var(--muted); line-height: 1.45; }
.mini-spark {
  display: flex; align-items: flex-end; gap: 5px; height: 36px; margin-top: 2px;
}
.mini-spark-col {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.mini-spark-track {
  width: 100%; height: 22px; display: flex; align-items: flex-end;
  background: rgba(148,163,184,0.08); border-radius: 3px; overflow: hidden;
}
.mini-spark-bar {
  width: 100%; border-radius: 2px 2px 0 0;
  background: var(--accent); opacity: 0.86; min-height: 3px;
}
.mini-spark-yr { font-size: 9.5px; color: var(--muted); font-family: "JetBrains Mono", monospace; line-height: 1; }

.delta-pill {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap;
}
.delta-pill.up { background: rgba(207,86,72,0.14); color: #e28074; }
.delta-pill.down { background: rgba(85,148,122,0.15); color: #7db89f; }
.delta-pill.neutral { background: var(--card); color: var(--muted); border: 1px solid var(--border); }
html[data-theme="light"] .delta-pill.up { color: #a3372c; }
html[data-theme="light"] .delta-pill.down { color: #2d6b52; }

.panel-card {
  background: var(--card-elev); border: 1px solid var(--border); border-radius: 18px;
  padding: 20px 22px; box-shadow: var(--shadow-sm);
  display: flex; flex-direction: column; gap: 14px; min-width: 0; max-width: 100%;
}
.panel-head {
  display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0;
}
.panel-title { font-size: 15.5px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
.panel-sub { font-size: 12.5px; color: var(--muted); margin-top: 2px; line-height: 1.45; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; min-width: 0; max-width: 100%; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; min-width: 0; max-width: 100%; }

.big-chart-box { width: 100%; height: 305px; position: relative; }
.med-chart-box { width: 100%; height: 245px; position: relative; }
.scatter-lg-box { width: 100%; height: 330px; position: relative; }

.split-bar { height: 8px; border-radius: 999px; overflow: hidden; display: flex; background: rgba(148,163,184,0.16); }
.reg-row {
  display: flex; flex-direction: column; gap: 6px; padding: 10px 12px;
  border-radius: 12px; background: var(--card); border: 1px solid var(--border);
  cursor: pointer; transition: border-color .15s, transform .14s;
}
.reg-row:hover { border-color: var(--accent); transform: translateX(2px); }
.reg-top { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 700; }

.donut-legend-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; font-size: 11.5px;
}
.donut-leg-item {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 4px 8px; border-radius: 7px; background: var(--card); border: 1px solid var(--border);
}

.ctrl-strip {
  display: flex; align-items: end; gap: 12px; flex-wrap: wrap;
  background: var(--card-elev); border: 1px solid var(--border); border-radius: 16px;
  padding: 15px 18px; box-shadow: var(--shadow-sm);
}
.ctrl-item { min-width: 175px; flex: 1; max-width: 280px; }

/* Live 7-Day Weather Forecast Strip */
.fc-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(156px, 1fr)); gap: 11px;
}
.fc-card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 13px 14px; display: flex; flex-direction: column; gap: 6px;
  transition: border-color .15s;
}
.fc-card:hover { border-color: var(--border-strong); }
.fc-meter-bg { height: 4px; border-radius: 999px; background: rgba(148,163,184,0.16); overflow: hidden; margin-top: 2px; }
.fc-meter-fg { height: 100%; border-radius: 999px; background: var(--fc-bar, var(--accent)); }
.fc-risk {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 999px; align-self: flex-start;
}
.fc-risk.low { background: rgba(85,148,122,0.14); color: #7db89f; }
.fc-risk.med { background: rgba(212,168,79,0.14); color: #d9b66b; }
.fc-risk.high { background: rgba(223,106,55,0.16); color: #e88b61; }
.fc-risk.vhigh { background: rgba(207,86,72,0.18); color: #e28074; }
html[data-theme="light"] .fc-risk.low { color: #2d6b52; }
html[data-theme="light"] .fc-risk.med { color: #8c6619; }
html[data-theme="light"] .fc-risk.high { color: #b24b20; }
html[data-theme="light"] .fc-risk.vhigh { color: #9c3329; }

/* 5x12 Calendar Heatmap Matrix */
.matrix-wrap { overflow-x: auto; max-width: 100%; min-width: 0; }
.matrix-table { width: 100%; border-collapse: separate; border-spacing: 5px; font-size: 11.5px; }
.matrix-table th { color: var(--muted); font-weight: 700; text-align: center; padding: 4px; }
.matrix-table th.peak-mo { color: var(--accent); }
.matrix-cell {
  text-align: center; padding: 9px 4px; border-radius: 8px; font-weight: 700;
  font-variant-numeric: tabular-nums; transition: transform .1s; cursor: default;
}
.matrix-cell:hover { transform: scale(1.06); outline: 1.5px solid #fde047; }
.matrix-legend {
  display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); flex-wrap: wrap;
}
.matrix-legend-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -2px; margin-right: 3px; }

/* Regional Legend Pills */
.reg-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--muted); }
.reg-legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; }

/* Province Comparator & Sortable Table */
.cmp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 13px; min-width: 0; }
.cmp-card {
  background: var(--card); border: 1px solid var(--border); border-radius: 13px;
  padding: 15px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0;
}
.cmp-metric { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 4px 0; border-bottom: 1px dashed rgba(148,163,184,0.16); }
.cmp-metric span:last-child { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }

.data-table-wrap { max-height: 490px; overflow: auto; border: 1px solid var(--border); border-radius: 13px; max-width: 100%; min-width: 0; }
.data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.data-table th {
  position: sticky; top: 0; background: var(--panel-solid); color: var(--muted);
  padding: 11px 11px; text-align: right; border-bottom: 1px solid var(--border);
  cursor: pointer; user-select: none; white-space: nowrap; font-weight: 700; z-index: 2;
}
.data-table th:first-child, .data-table th:nth-child(2), .data-table th:nth-child(3) { text-align: left; }
.data-table th:hover, .data-table th.sort-active { color: var(--accent); }
.data-table td {
  padding: 9px 11px; text-align: right; border-bottom: 1px solid rgba(148,163,184,0.11);
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.data-table td:first-child { text-align: left; color: var(--muted); font-family: "JetBrains Mono", monospace; font-size: 11.5px; }
.data-table td:nth-child(2) { text-align: left; font-weight: 700; }
.data-table td:nth-child(3) { text-align: left; }
.data-table tbody tr:nth-child(even) td { background: rgba(148,163,184,0.03); }
.data-table tbody tr { cursor: pointer; }
.data-table tbody tr:hover td { background: var(--accent-soft); }

.reg-pill {
  display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
  background: rgba(148,163,184,0.14); color: var(--text);
}

.pill-toggle { display: inline-flex; gap: 4px; background: var(--card); border: 1px solid var(--border); padding: 3px; border-radius: 10px; }
.pill-toggle button {
  padding: 5px 11px; border: none; border-radius: 7px; background: transparent;
  color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: background .15s, color .15s;
}
.pill-toggle button.active { background: var(--accent); color: #fff; }

/* Quick-lens floating dock on Page 2 Map */
.map-dock {
  position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 16;
  display: flex; align-items: center; gap: 4px; padding: 4px;
  background: var(--panel-solid); border: 1px solid var(--border-strong);
  border-radius: 13px; box-shadow: var(--shadow); max-width: calc(100% - 28px); overflow-x: auto;
}
.dock-btn {
  padding: 6px 11px; border-radius: 9px; border: 1px solid transparent;
  background: transparent; color: var(--muted); font-size: 11.5px; font-weight: 700;
  cursor: pointer; font-family: inherit; white-space: nowrap; transition: background .15s, color .15s;
}
.dock-btn:hover { color: var(--text); background: var(--card); }
.dock-btn.active { background: var(--accent); color: #fff; }

/* Page 4: Dedicated 20m Burn Scar Map Studio */
.btn.active {
  background: var(--accent); color: #ffffff; border-color: transparent;
}
.bs-map-toolbar {
  display: flex; align-items: end; gap: 10px; flex-wrap: wrap;
  padding: 12px 14px; border-radius: 12px;
  background: var(--card); border: 1px solid var(--border); min-width: 0;
}
.bs-ctrl { flex: 1 1 190px; min-width: 0; }
.bs-ctrl.compact { flex: 0 1 180px; }
.bs-quick-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0;
}
.bs-quick-select { width: auto; min-width: 170px; max-width: 240px; }
.bs-chip-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.bs-chip {
  padding: 5px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
  border: 1px solid var(--border); background: var(--card); color: var(--muted);
  cursor: pointer; font-family: inherit; white-space: nowrap; transition: all .14s;
}
.bs-chip:hover { color: var(--text); border-color: var(--accent); }
.bs-chip.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }

.bs-map-stage {
  position: relative; width: 100%; height: 560px; border-radius: 13px;
  overflow: hidden; border: 1px solid var(--border); background: var(--bg); user-select: none;
}
#bsMapCanvas { width: 100%; height: 100%; display: block; cursor: grab; }
#bsMapCanvas:active { cursor: grabbing; }
.bs-swipe-line {
  position: absolute; top: 0; bottom: 0; width: 2px; background: #ffffff;
  box-shadow: 0 0 8px rgba(0,0,0,0.75); z-index: 12; pointer-events: none; display: none;
}
.bs-swipe-handle {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--panel-solid); border: 2px solid #ffffff; color: var(--text);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; cursor: ew-resize;
  pointer-events: auto; touch-action: none; box-shadow: 0 4px 14px rgba(0,0,0,0.55);
}
.bs-swipe-tag {
  position: absolute; top: 12px; z-index: 11; display: none; pointer-events: none;
  padding: 5px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 700;
  background: rgba(11, 14, 20, 0.86); color: #eceff4; border: 1px solid rgba(255,255,255,0.16);
  max-width: 44%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bs-swipe-tag.left { left: 12px; }
.bs-swipe-tag.right { right: 12px; }

.bs-map-hud-bottom {
  position: absolute; left: 12px; bottom: 12px; z-index: 11; pointer-events: none;
  max-width: calc(100% - 76px);
  background: rgba(11, 14, 20, 0.88); color: #eceff4;
  border: 1px solid rgba(255,255,255,0.16); border-radius: 10px;
  padding: 8px 11px; font-size: 11.5px; line-height: 1.45;
  box-shadow: 0 8px 22px rgba(0,0,0,0.45);
}
.bs-pixel-legend {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; font-size: 11px; color: #cbd5e1;
}
.bs-pixel-legend span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.bs-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.22); }
.bs-map-controls {
  position: absolute; right: 12px; bottom: 12px; z-index: 12;
  display: flex; flex-direction: column; gap: 5px;
}

@media (max-width: 1080px) {
  .grid-2, .grid-3 { grid-template-columns: 1fr; }
  .app-body { height: auto; min-height: calc(100vh - 58px); overflow-y: visible; overflow-x: hidden; }
  .page-view { height: auto; overflow-y: visible; overflow-x: hidden; }
  #page-map.active { overflow: visible; }
  .page-wrap { padding: 14px 12px 54px; }
  .hero-banner { padding: 16px 14px; }
  .panel-card { padding: 15px 14px; }
  .ctrl-strip { padding: 12px 14px; }
  .ctrl-item, .bs-ctrl, .bs-ctrl.compact { min-width: 0; max-width: none; flex: 1 1 100%; width: 100%; }
  .panel-head select, .bs-quick-select { max-width: 100%; width: 100% !important; min-width: 0 !important; }
  .story-strip { grid-template-columns: 1fr; }
  .kpi-hero-grid { grid-template-columns: 1fr; }
  .fc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bs-map-stage { height: 410px; }
  .bs-map-hud-bottom { max-width: calc(100% - 62px); font-size: 11px; padding: 7px 9px; }
  .hero-title { font-size: 18px; }
  .brand-sub { display: none; }
  .nav-tab { padding: 5px 9px; font-size: 12px; }
  .map-dock { display: none; }
}
"""

OVERVIEW_PAGE_HTML = r"""
<section id="page-overview" class="page-view active">
  <div class="page-wrap">
    <div class="hero-banner">
      <div class="hero-row">
        <div>
          <div class="hero-kicker">THAILAND FIRE, BURN SCAR &amp; CLIMATE INTELLIGENCE ATLAS</div>
          <h1 class="hero-title">ศูนย์วิเคราะห์ไฟป่า การเผาเกษตร และสภาพอากาศประเทศไทย (2022–2026)</h1>
          <p class="hero-desc">
            รวมจุดความร้อน 5 ปี (GISTDA VIIRS 1.28 ล้านจุด) · รอยเผาไหม้แยกพืช 20 ม. 3 ฤดู (สสน. ตามรอยเผา) · สภาพอากาศเอื้อไฟรายเดือน 77 จังหวัด (Open-Meteo ERA5 2016–2026) · และพื้นที่น้ำท่วมซ้ำซาก 17 ปี (HII)
          </p>
        </div>
        <div class="hero-actions">
          <div class="pill-toggle" id="ovSatToggle" aria-label="เลือกมาตรฐานดาวเทียม">
            <button type="button" data-sat="N" class="active">Suomi NPP (N) มาตรฐาน 5 ปี</button>
            <button type="button" data-sat="ALL">ทุกดาวเทียม (N+N20+N21)</button>
          </div>
          <button type="button" class="btn primary" data-goto="map">เปิดแผนที่เจาะลึก</button>
          <button type="button" class="btn" data-goto="weather">วิเคราะห์อากาศ × ไฟ</button>
        </div>
      </div>
      <div class="story-strip">
        <button type="button" class="story-chip" data-goto="burnscar">
          <div>
            <span id="ovStory1Title" class="story-chip-title">รอยเผา 3 ฤดูแยกพืช (Sentinel-2 20 ม.)</span>
            <span id="ovStory1Sub" class="story-chip-sub">เทียบการเปลี่ยนแปลงไฟป่า vs นาข้าว อ้อย ข้าวโพด</span>
          </div>
          <span class="story-chip-arrow">→</span>
        </button>
        <button type="button" class="story-chip" data-goto="weather">
          <div>
            <span id="ovStory2Title" class="story-chip-title">อากาศแห้งแล้งดันไฟพุ่งแค่ไหน?</span>
            <span id="ovStory2Sub" class="story-chip-sub">ดูความสัมพันธ์ 59 เดือน + พยากรณ์สด 7 วัน</span>
          </div>
          <span class="story-chip-arrow">→</span>
        </button>
        <button type="button" class="story-chip" id="ovStoryTmsBtn">
          <div>
            <span class="story-chip-title">ส่องภาพแปลงเผาจริงความละเอียด 20 ม.</span>
            <span class="story-chip-sub">เปิดชั้นภาพ TMS สสน. ซ้อนแผนที่เจาะลึกเชียงใหม่ทันที</span>
          </div>
          <span class="story-chip-arrow">→</span>
        </button>
      </div>
    </div>

    <div class="kpi-hero-grid" id="ovKpiGrid">
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">จุดไฟ 5 ปี (ม.ค.–ต.ค.)</span><span id="ovKpi1Delta" class="delta-pill neutral">-</span></div>
        <div id="ovKpi1Val" class="kpi-hero-val">-</div>
        <div id="ovMiniSpark" class="mini-spark" aria-label="แนวโน้ม 5 ปี"></div>
        <div id="ovKpi1Sub" class="kpi-hero-sub">-</div>
      </div>
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">เกษตร+ส.ป.ก. vs ป่าไม้</span><span id="ovKpi2Delta" class="delta-pill neutral">5 ปี</span></div>
        <div id="ovKpi2Val" class="kpi-hero-val">-</div>
        <div class="split-bar"><div id="ovAgriBar" style="background:#d48942;width:50%"></div><div id="ovForBar" style="background:#55947a;width:50%"></div></div>
        <div id="ovKpi2Sub" class="kpi-hero-sub">-</div>
      </div>
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">รอยเผา สสน. (3 ฤดู · 62 จว.)</span><span id="ovKpi3Delta" class="delta-pill down">-</span></div>
        <div id="ovKpi3Val" class="kpi-hero-val">-</div>
        <div id="ovKpi3Sub" class="kpi-hero-sub">-</div>
      </div>
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">อากาศเอื้อไฟ 2026 (ERA5)</span><span id="ovKpi4Delta" class="delta-pill neutral">77 จว.</span></div>
        <div id="ovKpi4Val" class="kpi-hero-val">-</div>
        <div id="ovKpi4Sub" class="kpi-hero-sub">-</div>
      </div>
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">พื้นที่เสี่ยงซ้ำซ้อน (ท่วม+เผา)</span><span class="delta-pill neutral">HII 17 ปี</span></div>
        <div id="ovKpi5Val" class="kpi-hero-val">-</div>
        <div id="ovKpi5Sub" class="kpi-hero-sub">-</div>
      </div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">ไทม์ไลน์ 59 เดือน: จุดความร้อนทั้งประเทศ ซ้อนทับสภาพอากาศจริง (2022–2026)</h2>
          <div class="panel-sub" id="ovTimelineSub">แถบแรเงา = ฤดูเผา (ม.ค.–เม.ย.) · แท่งส้มอมน้ำตาล = เกษตร+ส.ป.ก. · แท่งเขียวหม่น = ป่าไม้ · เส้นฟ้าเทา = สภาพอากาศ ERA5 เฉลี่ย 77 จังหวัด</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span id="ovCorrPill" class="badge">r = -</span>
          <select id="ovWxMetric" style="width:auto;min-width:215px;">
            <option value="8" selected>เส้นอากาศ: ดัชนีอากาศเอื้อไฟ FWI (0–100)</option>
            <option value="0">เส้นอากาศ: อุณหภูมิสูงสุดเฉลี่ย (°C)</option>
            <option value="3">เส้นอากาศ: ความชื้นสัมพัทธ์ต่ำสุด (%)</option>
            <option value="2">เส้นอากาศ: ปริมาณฝนเฉลี่ย (มม.)</option>
            <option value="4">เส้นอากาศ: ความเร็วลมสูงสุดเฉลี่ย (กม./ชม.)</option>
          </select>
        </div>
      </div>
      <div class="big-chart-box">
        <canvas id="ovTimelineCanvas" class="panel-canvas"></canvas>
      </div>
    </div>

    <div class="grid-3">
      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">เปรียบเทียบรายภูมิภาค</h3>
            <div class="panel-sub">สัดส่วนจุดความร้อนและเกษตร vs ป่า (คลิกเพื่อดูบนแผนที่)</div>
          </div>
        </div>
        <div id="ovRegions" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>

      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">สัดส่วนชนิดพืช &amp; เวลาเกิดไฟ</h3>
            <div class="panel-sub">รอยเผา สสน. ฤดู 2569 แยกพืช + ช่วงเวลากลางวัน/กลางคืน</div>
          </div>
        </div>
        <div class="med-chart-box">
          <canvas id="ovDonutCanvas" class="panel-canvas"></canvas>
        </div>
        <div id="ovDonutLegend" class="donut-legend-grid"></div>
      </div>

      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">10 อันดับพื้นที่เฝ้าระวัง</h3>
            <div class="panel-sub">คลิกชื่อจังหวัดเพื่อเจาะดูรายอำเภอ/ตำบลทันที</div>
          </div>
          <div class="pill-toggle" id="ovTopMode">
            <button type="button" data-mode="prov" class="active">จังหวัด</button>
            <button type="button" data-mode="village">หมู่บ้าน</button>
          </div>
        </div>
        <div id="ovTopList" class="rank-list"></div>
      </div>
    </div>
  </div>
</section>
"""

WEATHER_PAGE_HTML = r"""
<section id="page-weather" class="page-view">
  <div class="page-wrap">
    <div class="hero-banner">
      <div class="hero-row">
        <div>
          <div class="hero-kicker">CLIMATE &amp; FIRE-WEATHER LAB · OPEN-METEO ERA5 (CC-BY-4.0)</div>
          <h1 class="hero-title">วิเคราะห์สภาพอากาศ × ไฟป่าและการเผาเกษตร (2016–2026 + พยากรณ์สด 7 วัน)</h1>
          <p class="hero-desc">
            วิเคราะห์ความสัมพันธ์ระหว่าง <strong>อุณหภูมิสูงสุด · ความชื้นสัมพัทธ์ต่ำสุด · ลมแรง · วันไม่ตกฝน · การระเหยน้ำ (ET0)</strong> กับจุดความร้อนรายเดือนตลอด 59 เดือน (2022–พ.ย. 2026) ครบ 77 จังหวัด พร้อมดึงพยากรณ์อากาศสด 7 วันล่วงหน้า
          </p>
        </div>
        <div class="hero-actions">
          <button type="button" class="btn primary" id="wxRefreshForecastBtn">อัปเดตพยากรณ์สด 7 วัน</button>
          <button type="button" class="btn" id="wxJumpMapBtn">ดูดัชนี FWI บนแผนที่</button>
        </div>
      </div>
    </div>

    <div class="ctrl-strip">
      <div class="ctrl-item">
        <label class="field-label" for="wxProvSelect">ขอบเขตพื้นที่วิเคราะห์</label>
        <select id="wxProvSelect">
          <option value="all" selected>ทั้งประเทศ (เฉลี่ย 77 จังหวัด)</option>
        </select>
      </div>
      <div class="ctrl-item">
        <label class="field-label" for="wxMetricSelect">ตัวแปรสภาพอากาศหลัก</label>
        <select id="wxMetricSelect">
          <option value="8" selected>ดัชนีอากาศเอื้อไฟ FWI (0–100)</option>
          <option value="0">อุณหภูมิสูงสุดเฉลี่ย (°C)</option>
          <option value="3">ความชื้นสัมพัทธ์ต่ำสุดเฉลี่ย (%)</option>
          <option value="2">ปริมาณฝนรวมรายเดือน (มม.)</option>
          <option value="4">ความเร็วลมสูงสุดเฉลี่ย (กม./ชม.)</option>
          <option value="5">การระเหยน้ำรวม ET0 (มม.)</option>
          <option value="6">จำนวนวันไม่ตกฝน (&lt;1 มม.)</option>
        </select>
      </div>
      <div class="ctrl-item">
        <label class="field-label" for="wxSatSelect">ชุดดาวเทียมจุดความร้อน</label>
        <select id="wxSatSelect">
          <option value="N" selected>Suomi NPP (N) — มาตรฐานเทียบ 5 ปี</option>
          <option value="ALL">ทุกดาวเทียม (N+N20+N21)</option>
        </select>
      </div>
      <div class="ctrl-item">
        <label class="field-label" for="wxMatrixMode">ตารางปฏิทิน 5 ปี × 12 เดือน</label>
        <select id="wxMatrixMode">
          <option value="fwi" selected>ดัชนีอากาศเอื้อไฟ FWI (0–100)</option>
          <option value="fire">จำนวนจุดความร้อน (จุด)</option>
          <option value="tmax">อุณหภูมิสูงสุดเฉลี่ย (°C)</option>
          <option value="rhmin">ความชื้นต่ำสุดเฉลี่ย (%)</option>
          <option value="rain">ปริมาณฝนรวม (มม.)</option>
        </select>
      </div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">พยากรณ์อากาศ 7 วันล่วงหน้า &amp; ความเสี่ยงไฟจากอากาศ (Live Open-Meteo)</h2>
          <div id="wxLiveSub" class="panel-sub">กำลังโหลดพยากรณ์อากาศ 7 วัน...</div>
        </div>
        <span id="wxLiveProvBadge" class="badge">จังหวัดเชียงใหม่</span>
      </div>
      <div id="wxLiveGrid" class="fc-grid"></div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">ความสัมพันธ์รายเดือน (59 เดือน · 2022–2026): จุดความร้อน vs สภาพอากาศ</h2>
          <div id="wxInsightText" class="panel-sub">-</div>
        </div>
        <span id="wxCorrBadge" class="badge">r = -</span>
      </div>
      <div class="big-chart-box">
        <canvas id="wxDualCanvas" class="panel-canvas"></canvas>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">ปฏิทินความร้อน × ไฟ (5 ปี × 12 เดือน)</h3>
            <div class="panel-sub">เห็นช่วงพีคฤดูเผา ม.ค.–เม.ย. เทียบข้ามปี 2022–2026 ในตารางเดียว</div>
          </div>
          <div class="matrix-legend">
            <span><i class="matrix-legend-swatch" style="background:rgba(148,163,184,0.28)"></i>ต่ำ</span>
            <span><i class="matrix-legend-swatch" style="background:rgba(196,148,76,0.52)"></i>ปานกลาง</span>
            <span><i class="matrix-legend-swatch" style="background:rgba(209,104,54,0.78)"></i>สูง</span>
            <span><i class="matrix-legend-swatch" style="background:rgba(168,58,48,0.90)"></i>วิกฤต</span>
          </div>
        </div>
        <div id="wxMatrixWrap" class="matrix-wrap"></div>
      </div>

      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">แนวโน้มภูมิอากาศ 10 ปี (2016–2025 + 2026)</h3>
            <div id="wxBaselineSub" class="panel-sub">เทียบอุณหภูมิสูงสุดเฉลี่ย (เส้นส้มอิฐ) และฝนรวม (แท่งฟ้าเทา) กับค่าปกติ 10 ปี</div>
          </div>
        </div>
        <div class="med-chart-box">
          <canvas id="wxBaselineCanvas" class="panel-canvas"></canvas>
        </div>
      </div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h3 class="panel-title">กราฟกระจาย 77 จังหวัด: ปัจจัยอากาศ × จุดความร้อน / รอยเผาไหม้</h3>
          <div id="wxScatNote" class="panel-sub">คลิกจุดจังหวัดใดก็ได้เพื่อสลับดูข้อมูลสภาพอากาศของจังหวัดนั้น</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span id="wxScatR" class="badge">r = -</span>
          <select id="wxScatX" style="width:auto;min-width:195px;">
            <option value="peak_fwi" selected>แกน X: ดัชนีเอื้อไฟหน้าแล้ง (FWI)</option>
            <option value="low_rh_35">แกน X: วันอากาศแห้งจัด RH&lt;35%</option>
            <option value="tmax">แกน X: อุณหภูมิสูงสุดเฉลี่ย (°C)</option>
            <option value="rain">แกน X: ปริมาณฝนรวม (มม.)</option>
            <option value="wind_max">แกน X: ความเร็วลมสูงสุด (กม./ชม.)</option>
            <option value="flood">แกน X: น้ำท่วมซ้ำ 17 ปี (ครั้ง · HII)</option>
          </select>
          <select id="wxScatY" style="width:auto;min-width:185px;">
            <option value="fire_2026" selected>แกน Y: จุดความร้อนปี 2026 (N)</option>
            <option value="fire_5y">แกน Y: จุดความร้อนรวม 5 ปี (N)</option>
            <option value="density">แกน Y: ความหนาแน่น (จุด/100 ตร.กม.)</option>
            <option value="trp_2026">แกน Y: รอยเผา สสน. ฤดู 2569 (ไร่)</option>
          </select>
        </div>
      </div>
      <div class="reg-legend">
        <span><i class="reg-legend-dot" style="background:#df6a37"></i>ภาคเหนือ</span>
        <span><i class="reg-legend-dot" style="background:#c99c4d"></i>ภาคอีสาน</span>
        <span><i class="reg-legend-dot" style="background:#689cb8"></i>ภาคกลาง</span>
        <span><i class="reg-legend-dot" style="background:#8e82a8"></i>ภาคตะวันออก</span>
        <span><i class="reg-legend-dot" style="background:#55947a"></i>ภาคใต้</span>
      </div>
      <div class="scatter-lg-box">
        <canvas id="wxScatterCanvas" class="panel-canvas"></canvas>
      </div>
    </div>
  </div>
</section>
"""

BURNSCAR_PAGE_HTML = r"""
<section id="page-burnscar" class="page-view">
  <div class="page-wrap">
    <div class="hero-banner">
      <div class="hero-row">
        <div>
          <div class="hero-kicker">SENTINEL-2 20M BURN SCAR ANALYTICS · สสน. ตามรอยเผา (ฤดู 2567–2569)</div>
          <h1 class="hero-title">แผนที่รอยเผา 20 ม. · วิเคราะห์ 3 ฤดูแยกพืช &amp; เทียบจังหวัดชนจังหวัด</h1>
          <p class="hero-desc">
            ดูแปลงเผาไหม้จริงความละเอียด 20 เมตร (1 พิกเซล = 0.25 ไร่) ซ้อนบนภาพถ่ายดาวเทียม ครบ 3 ฤดูฝุ่น <strong>2567 · 2568 · 2569</strong> ครอบคลุม 62 จังหวัด พร้อมลากเส้นเทียบก่อน–หลัง 2 ปีและตารางจัดอันดับ 77 จังหวัด
          </p>
        </div>
        <div class="hero-actions">
          <button type="button" class="btn primary" id="bsOpenTmsBtn">เปิดในแผนที่เจาะลึก (Hotspot + อากาศ)</button>
          <button type="button" class="btn" id="bsExportTableBtn">ส่งออกตาราง 77 จังหวัด (CSV)</button>
        </div>
      </div>
    </div>

    <div id="bsMapCard" class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">แผนที่รอยเผาไหม้ความละเอียด 20 เมตร (Sentinel-2 สสน. ตามรอยเผา)</h2>
          <div class="panel-sub">ภาพถ่ายดาวเทียมซ้อนแปลงเผาจริง 1 พิกเซล = 20×20 ม. (0.25 ไร่) · ซูมได้ถึง z18.0 · คลิกจังหวัดในตารางด้านล่างเพื่อบินไปซูมทันที</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span id="bsMapScopeBadge" class="badge">จ.ลพบุรี</span>
          <button type="button" class="btn" id="bsSwipeToggle">เทียบก่อน-หลัง (Swipe)</button>
        </div>
      </div>

      <div class="bs-map-toolbar">
        <div class="bs-ctrl">
          <label class="field-label" for="bsLayerLeft" id="bsLayerLeftLabel">ชั้นภาพรอยเผา 20 ม.</label>
          <select id="bsLayerLeft">
            <option value="2025/BOTH_202512_202604" selected>ฤดู 2569 (ธ.ค.68–เม.ย.69) · เกษตร + ป่าไม้</option>
            <option value="2025/BURNSCAR_NORTH_20M_202512_202604_B3A_COLOR">ฤดู 2569 · เกษตร 4 พืช</option>
            <option value="2025/BURNSCAR_NORTH_20M_202512_202604_B3F_COLOR">ฤดู 2569 · เขตป่าไม้</option>
            <option value="2024/BOTH_202412_202504">ฤดู 2568 (ธ.ค.67–เม.ย.68) · เกษตร + ป่าไม้</option>
            <option value="2024/BURNSCAR_NORTH_20M_202412_202504_B3A_COLOR">ฤดู 2568 · เกษตร 4 พืช</option>
            <option value="2024/BURNSCAR_NORTH_20M_202412_202504_B3F_COLOR">ฤดู 2568 · เขตป่าไม้</option>
            <option value="2023/BOTH_202312_202404">ฤดู 2567 (ธ.ค.66–เม.ย.67) · เกษตร + ป่าไม้</option>
            <option value="2023/BURNSCAR_NORTH_20M_202312_202404_B3A_COLOR">ฤดู 2567 · เกษตร 4 พืช</option>
            <option value="2023/BURNSCAR_NORTH_20M_202312_202404_B3F_COLOR">ฤดู 2567 · เขตป่าไม้</option>
            <option value="2026/BURNSCAR_NORTH_20M_202604_B2A_COLOR">รายเดือน เม.ย. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202603_B2A_COLOR">รายเดือน มี.ค. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202602_B2A_COLOR">รายเดือน ก.พ. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202601_B2A_COLOR">รายเดือน ม.ค. 2026 · เกษตร 4 พืช</option>
            <option value="2026/SAVI_NORTH_20M_202601_COLOR">ดัชนีแหล่งเชื้อเพลิง SAVI (ม.ค. 2026)</option>
          </select>
        </div>
        <div class="bs-ctrl" id="bsLayerRightWrap" style="display:none;">
          <label class="field-label" for="bsLayerRight">ฝั่งขวา (หลัง · เทียบกับซ้าย)</label>
          <select id="bsLayerRight">
            <option value="2025/BOTH_202512_202604" selected>ฤดู 2569 (ธ.ค.68–เม.ย.69) · เกษตร + ป่าไม้</option>
            <option value="2025/BURNSCAR_NORTH_20M_202512_202604_B3A_COLOR">ฤดู 2569 · เกษตร 4 พืช</option>
            <option value="2025/BURNSCAR_NORTH_20M_202512_202604_B3F_COLOR">ฤดู 2569 · เขตป่าไม้</option>
            <option value="2024/BOTH_202412_202504">ฤดู 2568 (ธ.ค.67–เม.ย.68) · เกษตร + ป่าไม้</option>
            <option value="2024/BURNSCAR_NORTH_20M_202412_202504_B3A_COLOR">ฤดู 2568 · เกษตร 4 พืช</option>
            <option value="2024/BURNSCAR_NORTH_20M_202412_202504_B3F_COLOR">ฤดู 2568 · เขตป่าไม้</option>
            <option value="2023/BOTH_202312_202404">ฤดู 2567 (ธ.ค.66–เม.ย.67) · เกษตร + ป่าไม้</option>
            <option value="2023/BURNSCAR_NORTH_20M_202312_202404_B3A_COLOR">ฤดู 2567 · เกษตร 4 พืช</option>
            <option value="2023/BURNSCAR_NORTH_20M_202312_202404_B3F_COLOR">ฤดู 2567 · เขตป่าไม้</option>
            <option value="2026/BURNSCAR_NORTH_20M_202604_B2A_COLOR">รายเดือน เม.ย. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202603_B2A_COLOR">รายเดือน มี.ค. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202602_B2A_COLOR">รายเดือน ก.พ. 2026 · เกษตร 4 พืช</option>
            <option value="2026/BURNSCAR_NORTH_20M_202601_B2A_COLOR">รายเดือน ม.ค. 2026 · เกษตร 4 พืช</option>
            <option value="2026/SAVI_NORTH_20M_202601_COLOR">ดัชนีแหล่งเชื้อเพลิง SAVI (ม.ค. 2026)</option>
          </select>
        </div>
        <div class="bs-ctrl compact">
          <label class="field-label" for="bsBasemapSel">แผนที่พื้นหลัง</label>
          <select id="bsBasemapSel">
            <option value="esri_sat" selected>Esri ภาพถ่ายดาวเทียม</option>
            <option value="osm">OpenStreetMap (ถนน/หมู่บ้าน)</option>
            <option value="carto_dark">Carto Dark (โทนมืด)</option>
            <option value="none">เวกเตอร์ล้วน (Offline 100%)</option>
          </select>
        </div>
        <div class="bs-ctrl compact">
          <label class="field-label" for="bsOpacityRange">ความชัดรอยเผา: <span id="bsOpacityVal">90%</span></label>
          <input id="bsOpacityRange" type="range" min="20" max="100" value="90" />
        </div>
        <label class="check-row" style="padding-bottom:6px;white-space:nowrap;">
          <input id="bsShowBoundsCheck" type="checkbox" checked />
          <span>ขอบเขตอำเภอ/ตำบล</span>
        </label>
      </div>

      <div class="bs-quick-bar">
        <select id="bsMapProvSel" class="bs-quick-select" aria-label="เลือกจังหวัดบนแผนที่รอยเผา"></select>
        <select id="bsMapAmpSel" class="bs-quick-select" aria-label="เลือกอำเภอบนแผนที่รอยเผา">
          <option value="">ทุกอำเภอในจังหวัด</option>
        </select>
        <div class="bs-chip-row">
          <button type="button" class="bs-chip active" data-bs-preset="lopburi">ลพบุรี (นาข้าว/อ้อย)</button>
          <button type="button" class="bs-chip" data-bs-preset="maechaem">อ.แม่แจ่ม เชียงใหม่</button>
          <button type="button" class="bs-chip" data-bs-preset="nakhonsawan">นครสวรรค์</button>
          <button type="button" class="bs-chip" data-bs-preset="chaiyaphum">ชัยภูมิ</button>
          <button type="button" class="bs-chip" data-bs-preset="tak">ตาก</button>
          <button type="button" class="bs-chip" data-bs-preset="all62">ภาพรวม 62 จังหวัด</button>
        </div>
      </div>

      <div class="bs-map-stage">
        <canvas id="bsMapCanvas"></canvas>
        <div id="bsSwipeLine" class="bs-swipe-line">
          <div id="bsSwipeHandle" class="bs-swipe-handle" title="ลากซ้าย-ขวาเพื่อเทียบ 2 ปี">◂▸</div>
        </div>
        <div id="bsSwipeTagLeft" class="bs-swipe-tag left"></div>
        <div id="bsSwipeTagRight" class="bs-swipe-tag right"></div>
        <div class="bs-map-hud-bottom">
          <div id="bsHoverInfo">เลื่อนเมาส์บนแผนที่เพื่อดูยอดรอยเผา 3 ฤดูรายอำเภอ/ตำบล</div>
          <div id="bsPixelLegend" class="bs-pixel-legend"></div>
        </div>
        <div class="bs-map-controls">
          <button id="bsZoomInBtn" type="button" class="zoom-btn" title="ซูมเข้า">+</button>
          <div id="bsZoomReadout" style="width:34px;text-align:center;font-size:10px;font-weight:700;padding:2px 0;border-radius:6px;background:var(--panel-solid);border:1px solid var(--border);color:var(--muted);font-family:'JetBrains Mono',monospace;box-shadow:var(--shadow);">z10.8</div>
          <button id="bsZoomOutBtn" type="button" class="zoom-btn" title="ซูมออก">−</button>
          <button id="bsResetBtn" type="button" class="zoom-btn" title="กลับภาพรวม 62 จังหวัด" style="font-size:14px;">↺</button>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">เปรียบเทียบ 3 ฤดูฝุ่น (2567 → 2568 → 2569) แยกพืชและป่า</h2>
            <div class="panel-sub">หน่วย: ไร่ (รวม 62 จังหวัดในขอบเขต สสน. · ประจวบคีรีขันธ์และภาคใต้ 14 จังหวัดคงค่าว่าง)</div>
          </div>
        </div>
        <div class="med-chart-box">
          <canvas id="bsSeasonCanvas" class="panel-canvas"></canvas>
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">การเปลี่ยนแปลงรายกลุ่มพืช (ฤดู 2569 เทียบ 2567)</h2>
            <div class="panel-sub">เห็นชัดว่าไฟป่าลดลงต่อเนื่อง แต่การเผาเศษวัสดุในนาข้าวและอ้อยยังเป็นโจทย์ใหญ่</div>
          </div>
        </div>
        <div id="bsCropCards" class="kpi-hero-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;"></div>
      </div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">เปรียบเทียบจังหวัดชนจังหวัด (Side-by-Side Comparator)</h2>
          <div class="panel-sub">เลือกจังหวัดที่สนใจได้สูงสุด 4 จังหวัดเพื่อเทียบไฟป่า รอยเผาแยกพืช สภาพอากาศ และน้ำท่วมซ้ำในมุมมองเดียว</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
        <select id="cmpSel0"></select>
        <select id="cmpSel1"></select>
        <select id="cmpSel2"></select>
        <select id="cmpSel3"></select>
      </div>
      <div id="bsCompareGrid" class="cmp-grid"></div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">ตารางจัดอันดับครบ 77 จังหวัด (คลิกหัวคอลัมน์เพื่อเรียง · คลิกแถวเพื่อบินไปซูมแผนที่ด้านบน)</h2>
          <div class="panel-sub">คลิกชื่อจังหวัดใดก็ได้เพื่อเลื่อนขึ้นไปซูมดูแปลงรอยเผา 20 ม. ของจังหวัดนั้นทันที</div>
        </div>
        <input id="bsTableSearch" class="search-input" style="max-width:260px;" type="search" placeholder="ค้นหาชื่อจังหวัดหรือภาค..." />
      </div>
      <div class="data-table-wrap" role="region" tabindex="0" aria-label="ตารางเปรียบเทียบ 77 จังหวัด">
        <table class="data-table" id="bsMasterTable">
          <thead>
            <tr>
              <th>#</th>
              <th data-sort="name_th">จังหวัด</th>
              <th data-sort="region">ภาค</th>
              <th data-sort="hs_5y">จุดไฟ 5 ปี (N)</th>
              <th data-sort="density">หนาแน่น/100ตร.กม.</th>
              <th data-sort="trp_26" class="sort-active">รอยเผา สสน. 69 (ไร่) ▼</th>
              <th data-sort="trp_rice">ข้าว 69 (ไร่)</th>
              <th data-sort="trp_sugar">อ้อย 69 (ไร่)</th>
              <th data-sort="trp_corn">ข้าวโพด 69 (ไร่)</th>
              <th data-sort="trp_for">ป่า 69 (ไร่)</th>
              <th data-sort="fwi_26">ดัชนีอากาศเอื้อไฟ</th>
              <th data-sort="flood">ท่วมซ้ำ 17 ปี</th>
            </tr>
          </thead>
          <tbody id="bsMasterTbody"></tbody>
        </table>
      </div>
    </div>
  </div>
</section>
"""

MULTI_PAGE_JS = r"""
  // =========================================================================
  // Multi-Page Navigation, Overview, Fire-Weather Lab & Burn Scar Comparator
  // =========================================================================
  const REGION_TH = {
    north: "ภาคเหนือ",
    northeast: "ภาคอีสาน",
    central: "ภาคกลาง",
    east: "ภาคตะวันออก",
    south: "ภาคใต้",
  };
  const MONTH_TH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const WX_LABELS = {
    "8": { name: "ดัชนีอากาศเอื้อไฟ FWI", unit: "คะแนน", color: "#689cb8" },
    "0": { name: "อุณหภูมิสูงสุดเฉลี่ย", unit: "°C", color: "#689cb8" },
    "3": { name: "ความชื้นสัมพัทธ์ต่ำสุด", unit: "%", color: "#689cb8" },
    "2": { name: "ปริมาณฝนรวม", unit: "มม.", color: "#689cb8" },
    "4": { name: "ความเร็วลมสูงสุดเฉลี่ย", unit: "กม./ชม.", color: "#689cb8" },
    "5": { name: "การระเหยน้ำ ET0", unit: "มม.", color: "#689cb8" },
    "6": { name: "จำนวนวันไม่ตกฝน", unit: "วัน", color: "#689cb8" },
  };

  let activePage = "overview";
  const liveForecastCache = new Map();
  let bsSortKey = "trp_26";
  let bsSortDir = -1;
  let ovTopMode = "prov";

  function switchPage(pageId, { updateHash = true, skipFit = false } = {}) {
    const target = document.getElementById("page-" + pageId);
    if (!target) pageId = "overview";
    activePage = pageId;
    if (els.tooltip) els.tooltip.style.display = "none";
    document.querySelectorAll(".page-view").forEach(el => {
      el.classList.toggle("active", el.id === "page-" + pageId);
    });
    document.querySelectorAll(".nav-tab[data-page]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.page === pageId);
    });
    const isMap = pageId === "map";
    if (els.searchInput && els.searchInput.parentElement) els.searchInput.parentElement.style.display = isMap ? "block" : "none";
    if (els.exportCsvBtn) els.exportCsvBtn.style.display = isMap ? "inline-flex" : "none";
    if (els.presentationBtn) els.presentationBtn.style.display = isMap ? "inline-flex" : "none";
    if (!isMap && state.presentation) {
      state.presentation = false;
      els.workspace?.classList.remove("presentation");
      els.exitPresBtn?.classList.remove("visible");
    }
    if (updateHash && window.location.hash !== "#" + pageId) {
      try { history.replaceState(null, "", "#" + pageId); } catch (_) {}
    }
    if (pageId === "overview") renderOverviewPage();
    else if (pageId === "map") {
      requestAnimationFrame(() => {
        if (!skipFit && !state.selectedProv && !state.selectedAmphoe) fitBbox(THAI_BBOX);
        requestDrawMap(true);
        drawScatterPlot();
        drawTrendChart();
      });
    } else if (pageId === "weather") renderWeatherPage();
    else if (pageId === "burnscar") renderBurnScarPage();
    else if (pageId === "explorer" && typeof onExplorerPageActivated === "function") onExplorerPageActivated();
  }

  function jumpToProvinceOnMap(provCode, { openTms = false } = {}) {
    const p = PROV_MAP.get(provCode);
    if (openTms && els.tmsOverlaySelect) {
      state.tmsOverlay = "2025/BOTH_202512_202604";
      els.tmsOverlaySelect.value = state.tmsOverlay;
      state.metric = "trp_rai";
      els.metricSelect.value = "trp_rai";
    }
    switchPage("map", { skipFit: !!p });
    if (p) {
      requestAnimationFrame(() => selectFeature(p, "province"));
    } else {
      requestAnimationFrame(() => refreshAll());
    }
  }

  function pearsonR(xs, ys) {
    const pairs = [];
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] !== null && xs[i] !== undefined && ys[i] !== null && ys[i] !== undefined && !Number.isNaN(xs[i]) && !Number.isNaN(ys[i])) {
        pairs.push([xs[i], ys[i]]);
      }
    }
    if (pairs.length < 4) return null;
    const n = pairs.length;
    let mx = 0, my = 0;
    for (const [x, y] of pairs) { mx += x; my += y; }
    mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pairs) {
      const dx = x - mx, dy = y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const den = Math.sqrt(sxx * syy);
    return den > 1e-12 ? sxy / den : null;
  }

  function getMonthlySeries(provCode, satMode, wxIdx) {
    const months = DATA.weather_months || [];
    const n = months.length;
    const fireAgri = new Array(n).fill(0);
    const fireFor = new Array(n).fill(0);
    const fireTot = new Array(n).fill(0);
    const wxSum = new Array(n).fill(0);
    const wxCnt = new Array(n).fill(0);

    const provs = provCode === "all" ? DATA.provinces : [PROV_MAP.get(provCode)].filter(Boolean);
    const off = satMode === "N" ? 0 : 3;
    for (const p of provs) {
      if (p.hs_m) {
        for (let i = 0; i < n && i < p.hs_m.length; i++) {
          const h = p.hs_m[i];
          if (h) {
            fireTot[i] += h[off] || 0;
            fireAgri[i] += h[off + 1] || 0;
            fireFor[i] += h[off + 2] || 0;
          }
        }
      }
      if (p.wx_m) {
        for (let i = 0; i < n && i < p.wx_m.length; i++) {
          const w = p.wx_m[i];
          if (w && w[wxIdx] !== null && w[wxIdx] !== undefined) {
            wxSum[i] += w[wxIdx];
            wxCnt[i] += 1;
          }
        }
      }
    }
    const wxVals = wxSum.map((s, i) => wxCnt[i] > 0 ? +(s / wxCnt[i]).toFixed(1) : null);
    return { months, fireTot, fireAgri, fireFor, wxVals };
  }

  function drawDualFireWeatherChart(canvas, series, wxKey, hoverStore) {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const { months, fireTot, fireAgri, fireFor, wxVals } = series;
    const n = months.length;
    if (!n) return;
    const pad = { l: 52, r: 48, t: 18, b: 32 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const maxF = Math.max(10, ...fireTot);
    const validW = wxVals.filter(v => v !== null);
    const minW = validW.length ? Math.min(...validW) : 0;
    const maxW = validW.length ? Math.max(...validW) : 100;
    const spanW = Math.max(1e-6, maxW - minW);

    const isDark = state.theme === "dark";
    const gridCol = isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.1)";
    const textCol = isDark ? "#94a3b8" : "#475569";

    // Peak-season shaded vertical bands (Jan-Apr each year)
    const step = pw / n;
    ctx.save();
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.032)" : "rgba(15,23,42,0.035)";
    for (let i = 0; i < n; i++) {
      const mo = Number(months[i].slice(5, 7));
      if (mo >= 1 && mo <= 4) ctx.fillRect(pad.l + i * step, pad.t, step, ph);
    }
    ctx.restore();

    // Horizontal gridlines
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    ctx.font = "10.5px system-ui, sans-serif";
    ctx.fillStyle = textCol;
    for (let g = 0; g <= 4; g++) {
      const y = pad.t + ph - (g / 4) * ph;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(formatNum(Math.round((maxF * g) / 4)), pad.l - 6, y + 3);
      if (validW.length) {
        ctx.textAlign = "left";
        ctx.fillText((minW + (spanW * g) / 4).toFixed(wxKey === "2" ? 0 : 1), pad.l + pw + 6, y + 3);
      }
    }

    // Stacked monthly bars (restrained amber + muted sage)
    const bw = Math.max(2.5, step * 0.68);
    for (let i = 0; i < n; i++) {
      const x = pad.l + i * step + (step - bw) / 2;
      const totH = (fireTot[i] / maxF) * ph;
      const agH = (fireAgri[i] / maxF) * ph;
      const forH = (fireFor[i] / maxF) * ph;
      const othH = Math.max(0, totH - agH - forH);
      let y = pad.t + ph;
      if (agH > 0) { ctx.fillStyle = "rgba(212, 137, 66, 0.90)"; ctx.fillRect(x, y - agH, bw, agH); y -= agH; }
      if (forH > 0) { ctx.fillStyle = "rgba(85, 148, 122, 0.88)"; ctx.fillRect(x, y - forH, bw, forH); y -= forH; }
      if (othH > 0) { ctx.fillStyle = "rgba(139, 149, 167, 0.45)"; ctx.fillRect(x, y - othH, bw, othH); }

      if (months[i].endsWith("-01")) {
        ctx.fillStyle = textCol;
        ctx.font = "700 10.5px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(months[i].slice(0, 4), pad.l + i * step + step * 2, pad.t + ph + 17);
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
        ctx.beginPath(); ctx.moveTo(pad.l + i * step, pad.t); ctx.lineTo(pad.l + i * step, pad.t + ph); ctx.stroke();
      }
    }

    // Weather smooth overlay line + subtle translucent area fill
    const wxMeta = WX_LABELS[String(wxKey)] || { name: "อากาศ", unit: "", color: "#689cb8" };
    if (validW.length) {
      ctx.save();
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
      grad.addColorStop(0, isDark ? "rgba(104,156,184,0.13)" : "rgba(60,116,143,0.11)");
      grad.addColorStop(1, "rgba(104,156,184,0.0)");
      ctx.beginPath();
      let firstX = null, lastX = null;
      for (let i = 0; i < n; i++) {
        if (wxVals[i] === null) continue;
        const cx = pad.l + (i + 0.5) * step;
        const cy = pad.t + ph - ((wxVals[i] - minW) / spanW) * ph;
        if (firstX === null) { firstX = cx; ctx.moveTo(cx, cy); } else ctx.lineTo(cx, cy);
        lastX = cx;
      }
      if (firstX !== null && lastX !== null) {
        ctx.lineTo(lastX, pad.t + ph);
        ctx.lineTo(firstX, pad.t + ph);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.strokeStyle = isDark ? "#7cb0cc" : "#3c748f";
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        if (wxVals[i] === null) { started = false; continue; }
        const cx = pad.l + (i + 0.5) * step;
        const cy = pad.t + ph - ((wxVals[i] - minW) / spanW) * ph;
        if (!started) { ctx.moveTo(cx, cy); started = true; } else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Inline top legend
    ctx.textAlign = "left";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#d48942"; ctx.fillRect(pad.l + 4, 4, 9, 9);
    ctx.fillStyle = textCol; ctx.fillText("เกษตร+ส.ป.ก.", pad.l + 17, 12);
    ctx.fillStyle = "#55947a"; ctx.fillRect(pad.l + 96, 4, 9, 9);
    ctx.fillStyle = textCol; ctx.fillText("ป่าไม้", pad.l + 109, 12);
    ctx.fillStyle = isDark ? "#7cb0cc" : "#3c748f"; ctx.fillRect(pad.l + 156, 7, 16, 2.5);
    ctx.fillStyle = textCol; ctx.fillText(`${wxMeta.name} (${wxMeta.unit})`, pad.l + 176, 12);

    if (hoverStore) {
      hoverStore.pad = pad; hoverStore.step = step; hoverStore.series = series; hoverStore.wxMeta = wxMeta;
    }
  }

  function bindTimelineHover(canvas, hoverStore) {
    if (!canvas || canvas._hoverBound) return;
    canvas._hoverBound = true;
    canvas.addEventListener("mousemove", (e) => {
      if (!hoverStore.series) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.floor((x - hoverStore.pad.l) / hoverStore.step);
      const s = hoverStore.series;
      if (idx < 0 || idx >= s.months.length) { els.tooltip.style.display = "none"; return; }
      const ym = s.months[idx];
      const moName = MONTH_TH_SHORT[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4);
      els.tooltip.innerHTML = `
        <h4>${escHtml(moName)}</h4>
        <div class="tt-row"><span class="tt-k">จุดความร้อนรวม</span><span class="tt-v">${formatNum(s.fireTot[idx])} จุด</span></div>
        <div class="tt-row"><span class="tt-k">เกษตร+ส.ป.ก. / ป่า</span><span class="tt-v">${formatNum(s.fireAgri[idx])} / ${formatNum(s.fireFor[idx])}</span></div>
        <div class="tt-row"><span class="tt-k">${escHtml(hoverStore.wxMeta.name)}</span><span class="tt-v">${s.wxVals[idx] !== null ? s.wxVals[idx] + " " + escHtml(hoverStore.wxMeta.unit) : "ไม่มีข้อมูล"}</span></div>
      `;
      els.tooltip.style.left = Math.min(window.innerWidth - 280, e.clientX + 14) + "px";
      els.tooltip.style.top = Math.max(12, e.clientY - 95) + "px";
      els.tooltip.style.display = "block";
    });
    canvas.addEventListener("mouseleave", () => { els.tooltip.style.display = "none"; });
  }

  const ovHoverStore = {};
  const wxHoverStore = {};

  function renderOverviewPage() {
    if (!DATA || !state.computedStats) return;
    const ovSat = document.querySelector("#ovSatToggle button.active")?.dataset.sat || "N";
    const satOnlyN = ovSat === "N";

    // Compute 5Y Jan-Oct totals from CUBE_FLAT (excluding suspected static)
    const yrTot = [0, 0, 0, 0, 0];
    let tot5y = 0, agri5y = 0, for5y = 0, day5y = 0;
    const provTot = new Map(), provAgri = new Map(), provFor = new Map();
    for (let o = 0; o < CUBE_FLAT.length; o += 5) {
      const f = CUBE_FLAT[o + 1];
      if (satOnlyN && (f & 1)) continue;
      if ((f >> 10) & 1) continue; // exclude static
      const sea = (f >> 4) & 3;
      if (sea === 3) continue; // Jan-Oct comparable window
      const yr = (f >> 1) & 7;
      const lu = (f >> 6) & 3;
      const cnt = CUBE_FLAT[o + 2];
      const pcode = DATA.tambons[CUBE_FLAT[o]].prov_code;
      yrTot[yr] += cnt;
      tot5y += cnt;
      if (lu === 0) agri5y += cnt;
      else if (lu === 1) for5y += cnt;
      day5y += CUBE_FLAT[o + 3];
      provTot.set(pcode, (provTot.get(pcode) || 0) + cnt);
      if (lu === 0) provAgri.set(pcode, (provAgri.get(pcode) || 0) + cnt);
      if (lu === 1) provFor.set(pcode, (provFor.get(pcode) || 0) + cnt);
    }

    // KPI 1: Hotspots + 2026 vs 2025 YoY + 5-year mini sparkline
    const yoy = yrTot[3] > 0 ? ((yrTot[4] - yrTot[3]) * 100 / yrTot[3]) : 0;
    document.getElementById("ovKpi1Val").textContent = formatNum(tot5y) + " จุด";
    const d1 = document.getElementById("ovKpi1Delta");
    d1.textContent = `ปี 26 vs 25: ${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`;
    d1.className = "delta-pill " + (yoy > 0 ? "up" : "down");
    document.getElementById("ovKpi1Sub").textContent = `ปี 2026: ${formatNum(yrTot[4])} จุด · ปี 2025: ${formatNum(yrTot[3])} จุด (${satOnlyN ? "Suomi NPP" : "ทุกดาวเทียม"})`;
    const sparkEl = document.getElementById("ovMiniSpark");
    if (sparkEl) {
      const mxY = Math.max(1, ...yrTot);
      sparkEl.innerHTML = yrTot.map((v, i) => {
        const pct = Math.max(12, Math.round(v * 100 / mxY));
        return `<div class="mini-spark-col" title="${2022 + i}: ${formatNum(v)} จุด"><div class="mini-spark-track"><div class="mini-spark-bar" style="height:${pct}%"></div></div><span class="mini-spark-yr">${String(2022 + i).slice(2)}</span></div>`;
      }).join("");
    }

    // KPI 2: Agri vs Forest
    const agPct = tot5y > 0 ? (agri5y * 100 / tot5y) : 0;
    const foPct = tot5y > 0 ? (for5y * 100 / tot5y) : 0;
    document.getElementById("ovKpi2Val").textContent = `${agPct.toFixed(1)}% เกษตร`;
    document.getElementById("ovAgriBar").style.width = `${agPct.toFixed(1)}%`;
    document.getElementById("ovForBar").style.width = `${foPct.toFixed(1)}%`;
    document.getElementById("ovKpi2Sub").textContent = `เกษตร ${formatNum(agri5y)} · ป่าไม้ ${formatNum(for5y)} (${foPct.toFixed(1)}%)`;

    // KPI 3: TamRoyPao 3 seasons
    let trpAll = 0, trpFor67 = 0, trpFor69 = 0, trp26Tot = 0;
    let trp26Crops = [0, 0, 0, 0, 0];
    for (const p of DATA.provinces) {
      if (!p.trp) continue;
      for (const y of ["2024", "2025", "2026"]) {
        const a = p.trp[y];
        if (!a) continue;
        trpAll += a[0] + a[1] + a[2] + a[3] + a[4];
        if (y === "2024") trpFor67 += a[4];
        if (y === "2026") {
          trpFor69 += a[4];
          trp26Tot += a[0] + a[1] + a[2] + a[3] + a[4];
          for (let k = 0; k < 5; k++) trp26Crops[k] += a[k];
        }
      }
    }
    const forChg = trpFor67 > 0 ? ((trpFor69 - trpFor67) * 100 / trpFor67) : 0;
    document.getElementById("ovKpi3Val").textContent = `${(trpAll / 1e6).toFixed(2)} ล้านไร่`;
    const d3 = document.getElementById("ovKpi3Delta");
    d3.textContent = `ไฟป่า 69 vs 67: ${forChg.toFixed(0)}%`;
    d3.className = "delta-pill " + (forChg <= 0 ? "down" : "up");
    document.getElementById("ovKpi3Sub").textContent = `ฤดู 2569 รวม ${(trp26Tot / 1e6).toFixed(2)} ล้านไร่ (62 จว. · Sentinel-2 20 ม.)`;
    const s1t = document.getElementById("ovStory1Title");
    if (s1t && trpFor67 > 0) s1t.textContent = `รอยเผาป่าลด ${Math.abs(forChg).toFixed(0)}% แต่ฤดู 2569 ยังเผารวม ${(trp26Tot / 1e6).toFixed(2)} ล้านไร่`;

    // KPI 4: 2026 Peak-season Fire-Weather
    const wx26 = DATA.provinces.map(p => p.wx_y?.["2026"]).filter(Boolean);
    if (wx26.length) {
      const avgPeakFwi = wx26.reduce((a, x) => a + (x.peak_fwi || 0), 0) / wx26.length;
      const avgTmax = wx26.reduce((a, x) => a + (x.tmax || 0), 0) / wx26.length;
      const avgRh = wx26.reduce((a, x) => a + (x.rh_min || 0), 0) / wx26.length;
      document.getElementById("ovKpi4Val").textContent = `${avgPeakFwi.toFixed(1)} / 100`;
      document.getElementById("ovKpi4Sub").textContent = `เฉลี่ย ม.ค.–เม.ย. 26 · Tmax ${avgTmax.toFixed(1)}°C · RHต่ำสุด ${avgRh.toFixed(0)}%`;
    } else {
      document.getElementById("ovKpi4Val").textContent = "ไม่มีข้อมูล";
      document.getElementById("ovKpi4Sub").textContent = "รอดึงข้อมูล ERA5 รายเดือน";
    }

    // KPI 5: Dual hazard HII
    const hiFlood = DATA.provinces.filter(p => (p.flood_max_17yr || 0) >= 8).length;
    document.getElementById("ovKpi5Val").textContent = `${formatNum(DATA.meta.flood_covered_tambons || 0)} ตำบล`;
    document.getElementById("ovKpi5Sub").textContent = `ครอบคลุม ${DATA.meta.flood_covered_provinces || 0}/77 จว. · ท่วม ≥8 ครั้ง ${hiFlood} จว.`;

    // Dual-axis 59-month timeline
    const wxIdx = Number(document.getElementById("ovWxMetric")?.value || 8);
    const series = getMonthlySeries("all", ovSat, wxIdx);
    const rVal = pearsonR(series.wxVals, series.fireTot);
    document.getElementById("ovCorrPill").textContent = rVal !== null ? `Pearson r = ${rVal.toFixed(2)}` : "r = n/a";
    const s2t = document.getElementById("ovStory2Title");
    if (s2t && rVal !== null) s2t.textContent = `อากาศเอื้อไฟสัมพันธ์กับจุดความร้อน (r = ${rVal.toFixed(2)})`;
    const ovCanvas = document.getElementById("ovTimelineCanvas");
    drawDualFireWeatherChart(ovCanvas, series, wxIdx, ovHoverStore);
    bindTimelineHover(ovCanvas, ovHoverStore);

    // Regional breakdown
    const regAcc = new Map();
    for (const p of DATA.provinces) {
      const rk = p.region || "central";
      const cur = regAcc.get(rk) || { key: rk, name: REGION_TH[rk] || rk, tot: 0, agri: 0, forest: 0, provs: 0, topProv: null, topCnt: -1 };
      const c = provTot.get(p.code) || 0;
      cur.tot += c; cur.agri += (provAgri.get(p.code) || 0); cur.forest += (provFor.get(p.code) || 0); cur.provs += 1;
      if (c > cur.topCnt) { cur.topCnt = c; cur.topProv = p; }
      regAcc.set(rk, cur);
    }
    const regList = Array.from(regAcc.values()).sort((a, b) => b.tot - a.tot);
    const regEl = document.getElementById("ovRegions");
    regEl.innerHTML = "";
    for (const rg of regList) {
      const ap = rg.tot > 0 ? (rg.agri * 100 / rg.tot) : 0;
      const fp = rg.tot > 0 ? (rg.forest * 100 / rg.tot) : 0;
      const div = document.createElement("div");
      div.className = "reg-row";
      div.innerHTML = `
        <div class="reg-top"><span>${escHtml(rg.name)} (${rg.provs} จว.)</span><span>${formatNum(rg.tot)} จุด</span></div>
        <div class="split-bar"><div style="background:#d48942;width:${ap.toFixed(1)}%"></div><div style="background:#55947a;width:${fp.toFixed(1)}%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
          <span>เกษตร ${ap.toFixed(0)}% · ป่า ${fp.toFixed(0)}%</span>
          <span>สูงสุด: ${escHtml(rg.topProv?.name_th || "-")}</span>
        </div>
      `;
      if (rg.topProv) div.onclick = () => jumpToProvinceOnMap(rg.topProv.code);
      regEl.appendChild(div);
    }

    // Donut chart (TamRoyPao Season 2569 crop breakdown — cohesive earthy editorial palette)
    const donutCanvas = document.getElementById("ovDonutCanvas");
    const segs = [
      { label: "นาข้าว", val: trp26Crops[0], color: "#d4a84f" },
      { label: "อ้อย", val: trp26Crops[1], color: "#c96f53" },
      { label: "ข้าวโพด", val: trp26Crops[2], color: "#7d9b65" },
      { label: "พืชผสม", val: trp26Crops[3], color: "#8b8579" },
      { label: "ป่าไม้", val: trp26Crops[4], color: "#a84438" },
    ];
    drawDonutChart(donutCanvas, segs, `${(trp26Tot / 1e6).toFixed(2)} ล.ไร่`, "ฤดู 2569");
    const dayPct = tot5y > 0 ? (day5y * 100 / tot5y) : 0;
    document.getElementById("ovDonutLegend").innerHTML = segs.map(s => {
      const pct = trp26Tot > 0 ? (s.val * 100 / trp26Tot).toFixed(1) : "0.0";
      return `<div class="donut-leg-item"><span><i style="display:inline-block;width:9px;height:9px;background:${s.color};border-radius:3px;margin-right:5px;"></i>${escHtml(s.label)}</span><strong>${pct}% <span style="color:var(--muted);font-weight:500;">(${(s.val / 1e6).toFixed(2)}M)</span></strong></div>`;
    }).join("") + `<div class="donut-leg-item" style="grid-column:1/-1;justify-content:center;"><span>กลางวัน <strong>${dayPct.toFixed(1)}%</strong> · กลางคืน <strong>${(100 - dayPct).toFixed(1)}%</strong></span></div>`;

    // Top 10 List
    const topEl = document.getElementById("ovTopList");
    topEl.innerHTML = "";
    if (ovTopMode === "prov") {
      const topProvs = DATA.provinces.map(p => ({ p, cnt: provTot.get(p.code) || 0 })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
      const mx = topProvs[0]?.cnt || 1;
      topProvs.forEach((it, idx) => {
        const row = document.createElement("div");
        row.className = "rank-item";
        row.innerHTML = `
          <span style="color:var(--muted);font-weight:700">${idx + 1}</span>
          <div>
            <div style="font-weight:600">${escHtml(it.p.name_th)}</div>
            <div class="rank-bar-bg"><div class="rank-bar-fg" style="width:${Math.max(4, it.cnt * 100 / mx).toFixed(1)}%"></div></div>
          </div>
          <span style="font-weight:700">${formatNum(it.cnt)}</span>
        `;
        row.onclick = () => jumpToProvinceOnMap(it.p.code);
        topEl.appendChild(row);
      });
    } else {
      const topVils = DATA.villages.slice().sort((a, b) => (satOnlyN ? b.n - a.n : b.all - a.all)).slice(0, 10);
      const mx = (satOnlyN ? topVils[0]?.n : topVils[0]?.all) || 1;
      topVils.forEach((v, idx) => {
        const cnt = satOnlyN ? v.n : v.all;
        const row = document.createElement("div");
        row.className = "rank-item";
        row.innerHTML = `
          <span style="color:var(--muted);font-weight:700">${idx + 1}</span>
          <div>
            <div style="font-weight:600">${escHtml(v.name)} <span style="color:var(--muted);font-weight:400;font-size:11px;">(${escHtml(v.prov)})</span></div>
            <div class="rank-bar-bg"><div class="rank-bar-fg" style="width:${Math.max(4, cnt * 100 / mx).toFixed(1)}%"></div></div>
          </div>
          <span style="font-weight:700">${formatNum(cnt)}</span>
        `;
        row.onclick = () => jumpToProvinceOnMap(v.prov_code);
        topEl.appendChild(row);
      });
    }
  }

  function drawDonutChart(canvas, segs, centerTop, centerSub) {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const rOut = Math.min(w, h) * 0.42;
    const rIn = rOut * 0.62;
    const sum = segs.reduce((a, s) => a + s.val, 0) || 1;
    let ang = -Math.PI / 2;
    const sepCol = state.theme === "dark" ? "#121b2e" : "#ffffff";
    for (const s of segs) {
      const da = (s.val / sum) * Math.PI * 2;
      if (da <= 0) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, rOut, ang, ang + da);
      ctx.arc(cx, cy, rIn, ang + da, ang, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = sepCol;
      ctx.stroke();
      ang += da;
    }
    ctx.textAlign = "center";
    ctx.fillStyle = state.theme === "dark" ? "#f8fafc" : "#0f172a";
    ctx.font = "800 17px system-ui, sans-serif";
    ctx.fillText(centerTop, cx, cy - 2);
    ctx.fillStyle = state.theme === "dark" ? "#94a3b8" : "#475569";
    ctx.font = "600 11.5px system-ui, sans-serif";
    ctx.fillText(centerSub, cx, cy + 16);
  }

  // ===== Page 3: Fire-Weather Intelligence Lab =====
  function populateWeatherProvinces() {
    const sel = document.getElementById("wxProvSelect");
    if (!sel || sel.options.length > 1 || !DATA) return;
    const sorted = DATA.provinces.slice().sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));
    for (const p of sorted) {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.textContent = `${p.name_th} (${REGION_TH[p.region] || p.region || ""})`;
      sel.appendChild(opt);
    }
  }

  async function loadLiveForecast(provObj, force = false) {
    const grid = document.getElementById("wxLiveGrid");
    const sub = document.getElementById("wxLiveSub");
    const badge = document.getElementById("wxLiveProvBadge");
    if (!grid || !provObj) return;
    badge.textContent = `จ.${provObj.name_th} (${provObj.lat?.toFixed(2)}, ${provObj.lon?.toFixed(2)})`;
    const cacheKey = provObj.code;
    if (!force && liveForecastCache.has(cacheKey)) {
      renderForecastCards(liveForecastCache.get(cacheKey), provObj);
      return;
    }
    sub.textContent = `กำลังดึงพยากรณ์อากาศ 7 วันล่วงหน้าของ จ.${provObj.name_th} จาก Open-Meteo...`;
    grid.innerHTML = `<div style="color:var(--muted);font-size:12.5px;padding:8px;">กำลังเชื่อมต่อ Open-Meteo Forecast API...</div>`;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${provObj.lat}&longitude=${provObj.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_min,et0_fao_evapotranspiration&timezone=Asia%2FBangkok&forecast_days=7`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      liveForecastCache.set(cacheKey, json);
      renderForecastCards(json, provObj);
    } catch (err) {
      sub.textContent = "ไม่สามารถเชื่อมต่อพยากรณ์สด 7 วันได้ (โหมดออฟไลน์หรือไม่มีอินเทอร์เน็ต — ข้อมูลย้อนหลัง 2016–2026 ด้านล่างยังใช้งานได้ครบ)";
      grid.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:6px;">ออฟไลน์: กดปุ่มอัปเดตอีกครั้งเมื่อต่ออินเทอร์เน็ต</div>`;
    }
  }

  function renderForecastCards(data, provObj) {
    const grid = document.getElementById("wxLiveGrid");
    const sub = document.getElementById("wxLiveSub");
    const d = data?.daily;
    if (!d || !d.time) return;
    sub.textContent = `พยากรณ์สด 7 วันของ จ.${provObj.name_th} (Open-Meteo CC-BY-4.0) · ประเมินความเสี่ยงไฟจากอากาศ (อุณหภูมิสูงสุด + ความชื้นต่ำสุด + ลม + ฝน)`;
    grid.innerHTML = "";
    const wk = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];
    for (let i = 0; i < d.time.length; i++) {
      const dt = new Date(d.time[i] + "T12:00:00");
      const label = `${wk[dt.getDay()]} ${dt.getDate()} ${MONTH_TH_SHORT[dt.getMonth()]}`;
      const tmax = d.temperature_2m_max?.[i];
      const tmin = d.temperature_2m_min?.[i];
      const rain = d.precipitation_sum?.[i] ?? 0;
      const wind = d.wind_speed_10m_max?.[i] ?? 10;
      const rh = d.relative_humidity_2m_min?.[i] ?? 55;
      const et0 = d.et0_fao_evapotranspiration?.[i] ?? 3.5;

      const tS = Math.max(0, Math.min(1, ((tmax ?? 30) - 26) / 14));
      const rhS = Math.max(0, Math.min(1, (70 - rh) / 50));
      const dryS = rain < 1 ? 1 : rain < 5 ? 0.4 : 0;
      const wS = Math.max(0, Math.min(1, (wind - 6) / 18));
      const eS = Math.max(0, Math.min(1, (et0 - 2.5) / 4));
      const score = Math.round(100 * (0.3 * tS + 0.3 * rhS + 0.2 * dryS + 0.1 * eS + 0.1 * wS));

      const [tier, cls, barCol] = score >= 70
        ? ["เสี่ยงสูงมาก", "vhigh", "#cf5648"]
        : score >= 52
          ? ["เสี่ยงสูง", "high", "#df6a37"]
          : score >= 34
            ? ["ปานกลาง", "med", "#c79a4b"]
            : ["เสี่ยงต่ำ", "low", "#55947a"];
      const rainTag = rain >= 10 ? "ฝนหนัก" : rain >= 2 ? "มีฝน" : rh < 40 ? "อากาศแห้ง" : "อากาศปกติ";

      const card = document.createElement("div");
      card.className = "fc-card";
      card.style.setProperty("--fc-bar", barCol);
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:12.5px;">${escHtml(label)}</strong>
          <span style="font-size:11px;color:var(--muted);">${rainTag}</span>
        </div>
        <div style="font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;">${tmax !== null ? tmax.toFixed(0) : "-"}° <span style="font-size:12px;color:var(--muted);font-weight:500;">/ ${tmin !== null ? tmin.toFixed(0) : "-"}°C</span></div>
        <div style="font-size:11px;color:var(--muted);white-space:nowrap;">ความชื้น ${rh.toFixed(0)}% · ลม ${wind.toFixed(0)} กม./ชม.</div>
        <div style="font-size:11px;color:var(--muted);white-space:nowrap;">ฝน ${rain.toFixed(1)} มม. · FWI <strong>${score}</strong>/100</div>
        <div class="fc-meter-bg"><div class="fc-meter-fg" style="width:${Math.max(6, Math.min(100, score))}%"></div></div>
        <span class="fc-risk ${cls}">${tier}</span>
      `;
      grid.appendChild(card);
    }
  }

  function renderWeatherPage() {
    if (!DATA) return;
    populateWeatherProvinces();
    const pCode = document.getElementById("wxProvSelect")?.value || "all";
    const wxIdx = Number(document.getElementById("wxMetricSelect")?.value || 8);
    const satMode = document.getElementById("wxSatSelect")?.value || "N";
    const matMode = document.getElementById("wxMatrixMode")?.value || "fwi";

    // Live forecast (use selected province or Chiang Mai '50' when viewing national avg)
    const fcProv = pCode === "all" ? (PROV_MAP.get("50") || DATA.provinces[0]) : PROV_MAP.get(pCode);
    loadLiveForecast(fcProv, false);

    // 59-month dual-axis chart + Pearson r explanation
    const series = getMonthlySeries(pCode, satMode, wxIdx);
    const rVal = pearsonR(series.wxVals, series.fireTot);
    document.getElementById("wxCorrBadge").textContent = rVal !== null ? `Pearson r = ${rVal.toFixed(2)}` : "r = n/a";
    const wxMeta = WX_LABELS[String(wxIdx)] || { name: "สภาพอากาศ", unit: "" };
    let interp = "กำลังเปรียบเทียบข้อมูลรายเดือน 2022–2026";
    if (rVal !== null) {
      const absR = Math.abs(rVal);
      const strength = absR >= 0.7 ? "ความสัมพันธ์สูงมาก" : absR >= 0.45 ? "ความสัมพันธ์ระดับปานกลาง–สูง" : absR >= 0.25 ? "ความสัมพันธ์ระดับอ่อน" : "ความสัมพันธ์น้อยมาก";
      const dir = rVal >= 0 ? `ยิ่ง ${wxMeta.name} สูงขึ้น จุดความร้อนยิ่งเพิ่มสูงขึ้นตาม` : `ยิ่ง ${wxMeta.name} ลดต่ำลง จุดความร้อนยิ่งพุ่งสูงขึ้นชัดเจน`;
      interp = `${strength} (r = ${rVal.toFixed(2)}): ${dir}`;
    }
    document.getElementById("wxInsightText").textContent = interp;
    const dualCanvas = document.getElementById("wxDualCanvas");
    drawDualFireWeatherChart(dualCanvas, series, wxIdx, wxHoverStore);
    bindTimelineHover(dualCanvas, wxHoverStore);

    // 5x12 Calendar Heatmap Matrix
    renderWeatherMatrix(pCode, satMode, matMode);

    // 10-year climate baseline chart (2016-2025 + 2026)
    drawTenYearBaseline(pCode);

    // 77-Province Fire x Weather Scatter Lab
    drawWxProvinceScatter();
  }

  function renderWeatherMatrix(pCode, satMode, matMode) {
    const wrap = document.getElementById("wxMatrixWrap");
    if (!wrap) return;
    const idxMap = { fwi: 8, tmax: 0, rhmin: 3, rain: 2 };
    const series = getMonthlySeries(pCode, satMode, idxMap[matMode] ?? 8);
    const grid = {};
    const vals = [];
    for (let i = 0; i < series.months.length; i++) {
      const ym = series.months[i];
      const v = matMode === "fire" ? series.fireTot[i] : series.wxVals[i];
      grid[ym] = v;
      if (v !== null && v !== undefined) vals.push(v);
    }
    const minV = vals.length ? Math.min(...vals) : 0;
    const maxV = vals.length ? Math.max(...vals) : 1;
    const span = Math.max(1e-6, maxV - minV);

    let html = `<table class="matrix-table"><thead><tr><th>ปี</th>${MONTH_TH_SHORT.map((m, idx) => `<th class="${idx < 4 ? "peak-mo" : ""}">${m}</th>`).join("")}</tr></thead><tbody>`;
    for (const yr of [2022, 2023, 2024, 2025, 2026]) {
      html += `<tr><th style="text-align:left;padding-right:6px;">${yr}</th>`;
      for (let mo = 1; mo <= 12; mo++) {
        const ym = `${yr}-${String(mo).padStart(2, "0")}`;
        const v = grid[ym];
        if (v === undefined || v === null) {
          html += `<td class="matrix-cell" style="background:rgba(148,163,184,0.08);color:var(--muted);">-</td>`;
          continue;
        }
        let t = (v - minV) / span;
        if (matMode === "rhmin" || matMode === "rain") t = 1 - t; // drier/less rain = hotter red
        if (matMode === "fire") t = Math.sqrt(Math.max(0, t));
        const isDark = state.theme === "dark";
        const bg = t > 0.78
          ? "rgba(168,58,48,0.88)"
          : t > 0.56
            ? "rgba(209,104,54,0.78)"
            : t > 0.34
              ? (isDark ? "rgba(196,148,76,0.44)" : "rgba(196,148,76,0.28)")
              : (isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.06)");
        const fg = t > 0.56
          ? "#ffffff"
          : t > 0.34
            ? (isDark ? "#f1e3c4" : "#6b4c14")
            : (isDark ? "#8b95a7" : "#5c6675");
        const txt = matMode === "fire" ? (v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v)) : (matMode === "rain" ? Math.round(v) : v.toFixed(0));
        html += `<td class="matrix-cell" style="background:${bg};color:${fg};" title="${ym}: ${v}">${txt}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    wrap.innerHTML = html;
  }

  function drawTenYearBaseline(pCode) {
    const canvas = document.getElementById("wxBaselineCanvas");
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const provs = pCode === "all" ? DATA.provinces : [PROV_MAP.get(pCode)].filter(Boolean);
    const years = [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
    const rows = years.map(y => {
      const ys = String(y);
      const tVals = [], rVals = [];
      for (const p of provs) {
        if (y <= 2025 && p.era5?.[ys]) {
          if (p.era5[ys].tmax_mean_c != null) tVals.push(p.era5[ys].tmax_mean_c);
          if (p.era5[ys].rainfall_total_mm != null) rVals.push(p.era5[ys].rainfall_total_mm);
        } else if (y === 2026 && p.wx_y?.["2026"]) {
          if (p.wx_y["2026"].tmax != null) tVals.push(p.wx_y["2026"].tmax);
          if (p.wx_y["2026"].rain != null) rVals.push(p.wx_y["2026"].rain);
        }
      }
      return {
        year: y,
        tmax: tVals.length ? tVals.reduce((a, b) => a + b, 0) / tVals.length : null,
        rain: rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null,
      };
    });

    const base10 = rows.filter(r => r.year <= 2025 && r.tmax !== null);
    const avgT10 = base10.length ? base10.reduce((a, r) => a + r.tmax, 0) / base10.length : 33;
    const sub = document.getElementById("wxBaselineSub");
    if (sub) sub.textContent = `ค่าปกติ Tmax 10 ปี (2016–2025): ${avgT10.toFixed(2)}°C (เส้นประสีเหลือง) · แท่งสีฟ้า = ฝนรวม (มม.) · ปี 2026 นับถึง 15 พ.ย.`;

    const pad = { l: 44, r: 44, t: 16, b: 28 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const maxR = Math.max(500, ...rows.map(r => r.rain || 0));
    const validT = rows.map(r => r.tmax).filter(v => v !== null);
    const minT = Math.floor((validT.length ? Math.min(...validT) : 30) - 0.8);
    const maxT = Math.ceil((validT.length ? Math.max(...validT) : 36) + 0.8);
    const spanT = Math.max(1, maxT - minT);

    const textCol = state.theme === "dark" ? "#94a3b8" : "#475569";
    const step = pw / rows.length;
    const bw = step * 0.52;

    // Rain bars (muted slate-blue)
    rows.forEach((r, i) => {
      const cx = pad.l + (i + 0.5) * step;
      if (r.rain !== null) {
        const bh = (r.rain / maxR) * ph;
        ctx.fillStyle = r.year === 2026 ? "rgba(104,156,184,0.32)" : "rgba(104,156,184,0.52)";
        ctx.fillRect(cx - bw / 2, pad.t + ph - bh, bw, bh);
      }
      ctx.fillStyle = textCol;
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(String(r.year).slice(2), cx, pad.t + ph + 14);
    });

    // 10Y baseline dashed line
    const yBase = pad.t + ph - ((avgT10 - minT) / spanT) * ph;
    ctx.save();
    ctx.strokeStyle = "rgba(196,156,77,0.68)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.l, yBase); ctx.lineTo(pad.l + pw, yBase); ctx.stroke();
    ctx.restore();

    // Tmax line & points
    ctx.strokeStyle = "#df6a37";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    rows.forEach((r, i) => {
      if (r.tmax === null) return;
      const cx = pad.l + (i + 0.5) * step;
      const cy = pad.t + ph - ((r.tmax - minT) / spanT) * ph;
      if (!started) { ctx.moveTo(cx, cy); started = true; } else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    rows.forEach((r, i) => {
      if (r.tmax === null) return;
      const cx = pad.l + (i + 0.5) * step;
      const cy = pad.t + ph - ((r.tmax - minT) / spanT) * ph;
      ctx.fillStyle = r.tmax > avgT10 ? "#df6a37" : "#689cb8";
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    });

    ctx.fillStyle = textCol; ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(maxT + "°C", pad.l - 5, pad.t + 8);
    ctx.fillText(minT + "°C", pad.l - 5, pad.t + ph);
    ctx.textAlign = "left";
    ctx.fillText(Math.round(maxR) + "มม.", pad.l + pw + 4, pad.t + 8);
    // Inline legend
    ctx.fillStyle = "rgba(104,156,184,0.65)"; ctx.fillRect(pad.l + 2, 3, 9, 8);
    ctx.fillStyle = textCol; ctx.fillText("ฝนรวม(มม.)", pad.l + 14, 11);
    ctx.fillStyle = "#df6a37"; ctx.fillRect(pad.l + 78, 6, 12, 2.2);
    ctx.fillStyle = textCol; ctx.fillText("Tmax(°C)", pad.l + 94, 11);
    ctx.fillStyle = "#c49c4d"; ctx.fillRect(pad.l + 148, 6, 12, 2);
    ctx.fillStyle = textCol; ctx.fillText(`ปกติ10ปี ${avgT10.toFixed(1)}°`, pad.l + 164, 11);

    canvas._baseHover = { pad, step, rows, avgT10 };
    if (!canvas._baseBound) {
      canvas._baseBound = true;
      canvas.addEventListener("mousemove", (e) => {
        const bh = canvas._baseHover;
        if (!bh) return;
        const r = canvas.getBoundingClientRect();
        const idx = Math.floor((e.clientX - r.left - bh.pad.l) / bh.step);
        if (idx < 0 || idx >= bh.rows.length) { els.tooltip.style.display = "none"; return; }
        const row = bh.rows[idx];
        const diff = row.tmax !== null ? (row.tmax - bh.avgT10) : null;
        els.tooltip.innerHTML = `<h4>ปี ${row.year}${row.year === 2026 ? " (ถึง 15 พ.ย.)" : ""}</h4>
          <div class="tt-row"><span class="tt-k">Tmax เฉลี่ย</span><span class="tt-v">${row.tmax !== null ? row.tmax.toFixed(2) + " °C" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k">เทียบค่าปกติ 10 ปี</span><span class="tt-v" style="color:${diff > 0 ? "#f87171" : "#38bdf8"}">${diff !== null ? (diff >= 0 ? "+" : "") + diff.toFixed(2) + " °C" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k">ปริมาณฝนรวม</span><span class="tt-v">${row.rain !== null ? formatNum(Math.round(row.rain)) + " มม." : "-"}</span></div>`;
        els.tooltip.style.left = Math.min(window.innerWidth - 260, e.clientX + 12) + "px";
        els.tooltip.style.top = Math.max(12, e.clientY - 90) + "px";
        els.tooltip.style.display = "block";
      });
      canvas.addEventListener("mouseleave", () => { els.tooltip.style.display = "none"; });
    }
  }

  let wxScatDots = [];
  function drawWxProvinceScatter() {
    const canvas = document.getElementById("wxScatterCanvas");
    if (!canvas || !DATA || !state.computedStats) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const xKey = document.getElementById("wxScatX")?.value || "peak_fwi";
    const yKey = document.getElementById("wxScatY")?.value || "fire_2026";
    const selProv = document.getElementById("wxProvSelect")?.value || "all";

    // Precompute 2026 N hotspots per province
    const hs26 = new Map();
    for (const p of DATA.provinces) {
      let s = 0;
      if (p.hs_m && DATA.weather_months) {
        for (let i = 0; i < DATA.weather_months.length; i++) {
          if (DATA.weather_months[i].startsWith("2026-")) s += p.hs_m[i]?.[0] || 0;
        }
      }
      hs26.set(p.code, s);
    }

    const pts = [];
    for (const rec of state.computedStats.provRecords) {
      const p = rec.item;
      const w26 = p.wx_y?.["2026"];
      let xv = null;
      if (xKey === "flood") xv = p.flood_max_17yr;
      else if (w26) xv = w26[xKey] ?? null;

      let yv = null;
      if (yKey === "fire_2026") yv = hs26.get(p.code);
      else if (yKey === "fire_5y") yv = rec.total;
      else if (yKey === "density") yv = rec.density;
      else if (yKey === "trp_2026") {
        const a = p.trp?.["2026"];
        yv = a ? (a[0] + a[1] + a[2] + a[3] + a[4]) : null;
      }
      if (xv !== null && xv !== undefined && yv !== null && yv !== undefined) {
        pts.push({ x: xv, y: yv, p });
      }
    }

    const rVal = pearsonR(pts.map(d => d.x), pts.map(d => d.y));
    document.getElementById("wxScatR").textContent = rVal !== null ? `r = ${rVal.toFixed(2)} (${pts.length} จว.)` : "r = n/a";
    wxScatDots = [];
    if (pts.length < 3) return;

    const pad = { l: 58, r: 24, t: 18, b: 30 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const minX = Math.min(...pts.map(d => d.x)), maxX = Math.max(...pts.map(d => d.x));
    const minY = Math.min(...pts.map(d => d.y)), maxY = Math.max(...pts.map(d => d.y));
    const sx = v => pad.l + (maxX > minX ? (v - minX) / (maxX - minX) : 0.5) * pw;
    const sy = v => pad.t + ph - (maxY > minY ? (v - minY) / (maxY - minY) : 0.5) * ph;

    const isDark = state.theme === "dark";
    const textCol = isDark ? "#94a3b8" : "#475569";
    ctx.strokeStyle = isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.12)";
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph); ctx.stroke();

    // OLS trendline
    const n = pts.length;
    const mx = pts.reduce((a, d) => a + d.x, 0) / n;
    const my = pts.reduce((a, d) => a + d.y, 0) / n;
    let sxx = 0, sxy = 0;
    for (const d of pts) { sxx += (d.x - mx) ** 2; sxy += (d.x - mx) * (d.y - my); }
    if (sxx > 1e-12) {
      const m = sxy / sxx, b = my - m * mx;
      ctx.save();
      ctx.strokeStyle = "rgba(249,115,22,0.65)";
      ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(sx(minX), Math.max(pad.t, Math.min(pad.t + ph, sy(m * minX + b))));
      ctx.lineTo(sx(maxX), Math.max(pad.t, Math.min(pad.t + ph, sy(m * maxX + b))));
      ctx.stroke();
      ctx.restore();
    }

    const topLabelSet = new Set(pts.slice().sort((a, b) => b.y - a.y).slice(0, 8).map(d => d.p.code));
    const regColors = { north: "#df6a37", northeast: "#c99c4d", central: "#689cb8", east: "#8e82a8", south: "#55947a" };

    for (const d of pts) {
      const cx = sx(d.x), cy = sy(d.y);
      const isSel = selProv === d.p.code;
      ctx.fillStyle = isSel ? "#eceff4" : (regColors[d.p.region] || "#689cb8");
      ctx.strokeStyle = isSel ? "#df6a37" : "rgba(15,23,42,0.6)";
      ctx.lineWidth = isSel ? 2.4 : 1;
      ctx.beginPath(); ctx.arc(cx, cy, isSel ? 6.5 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (isSel || topLabelSet.has(d.p.code)) {
        ctx.fillStyle = isDark ? "#f1f5f9" : "#0f172a";
        ctx.font = "600 10.5px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(d.p.name_th, cx + 7, cy + 3);
      }
      wxScatDots.push({ cx, cy, ...d });
    }

    ctx.fillStyle = textCol; ctx.font = "10.5px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(formatNum(maxY, 0), pad.l - 6, pad.t + 8);
    ctx.fillText(formatNum(minY, 0), pad.l - 6, pad.t + ph);
    ctx.textAlign = "left";
    ctx.fillText(formatNum(minX, 1), pad.l, pad.t + ph + 16);
    ctx.textAlign = "right";
    ctx.fillText(formatNum(maxX, 1), pad.l + pw, pad.t + ph + 16);

    if (!canvas._scatBound) {
      canvas._scatBound = true;
      canvas.addEventListener("mousemove", (e) => {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        let best = null, bd = 12;
        for (const d of wxScatDots) {
          const dist = Math.hypot(d.cx - x, d.cy - y);
          if (dist < bd) { bd = dist; best = d; }
        }
        if (best) {
          els.tooltip.innerHTML = `<h4>${escHtml(best.p.name_th)}</h4>
            <div class="tt-row"><span class="tt-k">แกน X</span><span class="tt-v">${formatNum(best.x, 1)}</span></div>
            <div class="tt-row"><span class="tt-k">แกน Y</span><span class="tt-v">${formatNum(best.y, 1)}</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:3px;">คลิกจุดเพื่อดูสภาพอากาศจังหวัดนี้</div>`;
          els.tooltip.style.left = Math.min(window.innerWidth - 260, e.clientX + 12) + "px";
          els.tooltip.style.top = Math.max(12, e.clientY - 80) + "px";
          els.tooltip.style.display = "block";
        } else {
          els.tooltip.style.display = "none";
        }
      });
      canvas.addEventListener("mouseleave", () => { els.tooltip.style.display = "none"; });
      canvas.addEventListener("click", (e) => {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        let best = null, bd = 13;
        for (const d of wxScatDots) {
          const dist = Math.hypot(d.cx - x, d.cy - y);
          if (dist < bd) { bd = dist; best = d; }
        }
        if (best) {
          document.getElementById("wxProvSelect").value = best.p.code;
          renderWeatherPage();
        }
      });
    }
  }

  // ===== Page 4: 20m Burn Scar Map Studio, Analytics & Province Comparator =====
  const bsMap = {
    initialized: false,
    camX: 0.7802,
    camY: 0.4578,
    zoom: 10.2,
    basemap: "esri_sat",
    layerLeft: "2025/BOTH_202512_202604",
    layerRight: "2023/BOTH_202312_202404",
    swipe: false,
    swipeRatio: 0.5,
    opacity: 0.9,
    showBounds: true,
    focusProv: "16",
    focusAmp: "",
    hoverItem: null,
    lastHoverCode: null,
  };
  let bsDrawPending = false;
  function requestDrawBsMap() {
    if (activePage !== "burnscar") return;
    if (bsDrawPending) return;
    bsDrawPending = true;
    requestAnimationFrame(() => { bsDrawPending = false; drawBsMap(); });
  }

  function bsLayerYear(layerVal) {
    if (!layerVal) return "2026";
    if (layerVal.startsWith("2023/")) return "2024";
    if (layerVal.startsWith("2024/")) return "2025";
    return "2026";
  }

  function updateBsPixelLegend() {
    const legEl = document.getElementById("bsPixelLegend");
    if (!legEl) return;
    const isSavi = (bsMap.layerLeft || "").includes("SAVI_") || (bsMap.swipe && (bsMap.layerRight || "").includes("SAVI_"));
    if (isSavi) {
      legEl.innerHTML = `<strong>สีภาพ SAVI 20 ม.:</strong>
        <span><i class="bs-swatch" style="background:#005000"></i> เชื้อเพลิงต่ำมาก</span>
        <span><i class="bs-swatch" style="background:#ffe100"></i> ปานกลาง</span>
        <span><i class="bs-swatch" style="background:#e10000"></i> เชื้อเพลิงสูงมาก</span>`;
    } else {
      legEl.innerHTML = `<strong>สีแปลง 20 ม. (1 จุด=0.25 ไร่):</strong>
        <span><i class="bs-swatch" style="background:#ffff00"></i> ข้าว</span>
        <span><i class="bs-swatch" style="background:#ff72df"></i> อ้อย</span>
        <span><i class="bs-swatch" style="background:#d1ff72"></i> ข้าวโพด</span>
        <span><i class="bs-swatch" style="background:#ffaa01"></i> พืชผสม</span>
        <span><i class="bs-swatch" style="background:#ef0707"></i> ป่าไม้</span>`;
    }
  }

  function updateBsAreaReadout(item, prefixLabel = "") {
    const box = document.getElementById("bsHoverInfo");
    if (!box) return;
    if (!item) {
      box.innerHTML = "พื้นที่ <strong>62 จังหวัดในขอบเขต สสน.</strong> · เลื่อนเมาส์บนแผนที่หรือเลือกจังหวัด/อำเภอเพื่อดูยอด 3 ฤดู";
      return;
    }
    const title = (prefixLabel ? prefixLabel : "") + item.name_th;
    if (item.trp === null || item.trp === undefined) {
      box.innerHTML = `<strong>${escHtml(title)}</strong> · <span style="color:#d4a84f;">อยู่นอกขอบเขต สสน. ตามรอยเผา (62 จังหวัด)</span>`;
      return;
    }
    const sumArr = (a) => a ? (a[0] + a[1] + a[2] + a[3] + a[4]) : 0;
    const t67 = sumArr(item.trp["2024"]);
    const t68 = sumArr(item.trp["2025"]);
    const t69 = item.trp["2026"] || [0,0,0,0,0];
    const t69Tot = sumArr(t69);
    box.innerHTML = `<strong>${escHtml(title)}</strong> · ฤดู 69: <strong style="color:#df6a37;">${formatNum(t69Tot, 0)} ไร่</strong> (ข้าว ${formatNum(t69[0], 0)} · อ้อย ${formatNum(t69[1], 0)} · ข้าวโพด ${formatNum(t69[2], 0)} · ป่า ${formatNum(t69[4], 0)})<br/><span style="color:#94a3b8;">ย้อนหลัง: ฤดู 68 = ${formatNum(t68, 0)} ไร่ · ฤดู 67 = ${formatNum(t67, 0)} ไร่</span>`;
  }

  function fitBsBbox(bbox, { maxZ = 14.5 } = {}) {
    const canvas = document.getElementById("bsMapCanvas");
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    const w = Math.max(300, rect?.width || 900);
    const h = Math.max(260, rect?.height || 520);
    if (!bbox) return;
    const mx0 = lonToMx(bbox[0]), mx1 = lonToMx(bbox[2]);
    const my0 = latToMy(bbox[3]), my1 = latToMy(bbox[1]);
    bsMap.camX = (mx0 + mx1) / 2;
    bsMap.camY = (my0 + my1) / 2;
    const spanX = Math.max(0.0004, mx1 - mx0);
    const spanY = Math.max(0.0004, my1 - my0);
    const zx = Math.log2((w * 0.82) / (256 * spanX));
    const zy = Math.log2((h * 0.82) / (256 * spanY));
    bsMap.zoom = Math.max(5.2, Math.min(maxZ, Math.min(zx, zy)));
  }

  function drawBsBasemap(ctx, w, h) {
    const worldPx = 256 * Math.pow(2, bsMap.zoom);
    const toSx = (mx) => (mx - bsMap.camX) * worldPx + w / 2;
    const toSy = (my) => (my - bsMap.camY) * worldPx + h / 2;

    if (bsMap.basemap === "none") {
      // Offline choropleth fallback colored by Season TRP rai
      const yrKey = bsLayerYear(bsMap.layerLeft);
      const lvl = bsMap.zoom >= 8.8 ? "amphoe" : "province";
      const items = lvl === "amphoe" ? DATA.amphoes : DATA.provinces;
      const getVal = (it) => {
        if (it.trp === null || it.trp === undefined) return null;
        const a = it.trp[yrKey];
        return a ? (a[0] + a[1] + a[2] + a[3] + a[4]) : 0;
      };
      const vals = items.map(getVal).filter(v => v !== null);
      const maxV = Math.max(100, ...vals);
      const isDark = state.theme === "dark";
      const nullCol = isDark ? "#273040" : "#d6dbe3";
      const strokeC = isDark ? "rgba(148,163,184,0.34)" : "rgba(51,65,85,0.34)";
      ctx.save();
      ctx.lineWidth = lvl === "amphoe" ? 0.65 : 0.9;
      ctx.strokeStyle = strokeC;
      for (const it of items) {
        const v = getVal(it);
        if (v === null) ctx.fillStyle = nullCol;
        else {
          const t = Math.sqrt(Math.max(0, Math.min(1, v / maxV)));
          ctx.fillStyle = lerpHex("#1b2230", "#df6a37", t);
        }
        ctx.beginPath();
        for (const r of it._mRings) traceRingF32(ctx, r, toSx, toSy);
        ctx.fill("evenodd");
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const maxTileZ = bsMap.basemap === "carto_dark" ? 17 : 18;
    const z = Math.max(5, Math.min(maxTileZ, Math.round(bsMap.zoom)));
    const nTiles = 1 << z;
    const leftMx = bsMap.camX - (w / 2) / worldPx;
    const rightMx = bsMap.camX + (w / 2) / worldPx;
    const topMy = bsMap.camY - (h / 2) / worldPx;
    const botMy = bsMap.camY + (h / 2) / worldPx;

    const tx0 = Math.max(0, Math.floor(leftMx * nTiles));
    const tx1 = Math.min(nTiles - 1, Math.floor(rightMx * nTiles));
    const ty0 = Math.max(0, Math.floor(topMy * nTiles));
    const ty1 = Math.min(nTiles - 1, Math.floor(botMy * nTiles));
    const tilePx = worldPx / nTiles;
    const keyFor = (lz, lx, ly) => `${bsMap.basemap}:${lz}:${lx}:${ly}`;

    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const key = keyFor(z, tx, ty);
        let entry = TILE_CACHE.get(key);
        if (!entry) {
          const img = new Image();
          let url = "";
          if (bsMap.basemap === "osm") url = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
          else if (bsMap.basemap === "carto_dark") url = `https://a.basemaps.cartocdn.com/dark_all/${z}/${tx}/${ty}.png`;
          else if (bsMap.basemap === "esri_sat") url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
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
        const dx = (tx / nTiles - bsMap.camX) * worldPx + w / 2;
        const dy = (ty / nTiles - bsMap.camY) * worldPx + h / 2;
        drawTileWithFallback(ctx, keyFor, z, tx, ty, dx, dy, tilePx, 5);
      }
    }
  }

  function drawBsLayerTms(ctx, w, h, layerVal) {
    const layers = resolveTmsLayers(layerVal);
    if (!layers.length) return;
    const z = Math.max(6, Math.min(15, Math.round(bsMap.zoom)));
    const nTiles = 1 << z;
    const worldPx = 256 * Math.pow(2, bsMap.zoom);
    const leftMx = bsMap.camX - (w / 2) / worldPx;
    const rightMx = bsMap.camX + (w / 2) / worldPx;
    const topMy = bsMap.camY - (h / 2) / worldPx;
    const botMy = bsMap.camY + (h / 2) / worldPx;

    const tx0 = Math.max(0, Math.floor(leftMx * nTiles));
    const tx1 = Math.min(nTiles - 1, Math.floor(rightMx * nTiles));
    const ty0 = Math.max(0, Math.floor(topMy * nTiles));
    const ty1 = Math.min(nTiles - 1, Math.floor(botMy * nTiles));
    const tilePx = worldPx / nTiles;

    ctx.save();
    ctx.globalAlpha = bsMap.opacity;
    if (bsMap.zoom > 15) ctx.imageSmoothingEnabled = false;
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
          const dx = (tx / nTiles - bsMap.camX) * worldPx + w / 2;
          const dy = (ty / nTiles - bsMap.camY) * worldPx + h / 2;
          drawTileWithFallback(ctx, keyFor, z, tx, ty, dx, dy, tilePx, 6);
        }
      }
    }
    ctx.restore();
  }

  function getBsActiveLayerItems() {
    if (bsMap.zoom >= 11.2) return { lvl: "tambon", prefix: "ต.", arr: DATA.tambons };
    if (bsMap.zoom >= 8.5) return { lvl: "amphoe", prefix: "อ.", arr: DATA.amphoes };
    return { lvl: "province", prefix: "จ.", arr: DATA.provinces };
  }

  function drawBsMap() {
    const canvas = document.getElementById("bsMapCanvas");
    if (!canvas || !DATA) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cw = Math.round(rect.width * dpr), ch = Math.round(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const w = rect.width, h = rect.height;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const zr = document.getElementById("bsZoomReadout");
    if (zr) zr.textContent = "z" + bsMap.zoom.toFixed(1);

    drawBsBasemap(ctx, w, h);

    const swipeLine = document.getElementById("bsSwipeLine");
    const tagL = document.getElementById("bsSwipeTagLeft");
    const tagR = document.getElementById("bsSwipeTagRight");
    if (bsMap.swipe) {
      const splitX = Math.round(w * bsMap.swipeRatio);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, h);
      ctx.clip();
      drawBsLayerTms(ctx, w, h, bsMap.layerLeft);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, w - splitX, h);
      ctx.clip();
      drawBsLayerTms(ctx, w, h, bsMap.layerRight);
      ctx.restore();

      if (swipeLine) { swipeLine.style.display = "block"; swipeLine.style.left = splitX + "px"; }
      const selL = document.getElementById("bsLayerLeft");
      const selR = document.getElementById("bsLayerRight");
      if (tagL && selL) { tagL.style.display = "block"; tagL.textContent = "ซ้าย: " + (selL.selectedOptions[0]?.textContent || ""); }
      if (tagR && selR) { tagR.style.display = "block"; tagR.textContent = "ขวา: " + (selR.selectedOptions[0]?.textContent || ""); }
    } else {
      drawBsLayerTms(ctx, w, h, bsMap.layerLeft);
      if (swipeLine) swipeLine.style.display = "none";
      if (tagL) tagL.style.display = "none";
      if (tagR) tagR.style.display = "none";
    }

    // Crisp viewport-culled admin boundaries + hover ring
    if (bsMap.showBounds) {
      const worldPx = 256 * Math.pow(2, bsMap.zoom);
      const toSx = (mx) => (mx - bsMap.camX) * worldPx + w / 2;
      const toSy = (my) => (my - bsMap.camY) * worldPx + h / 2;
      const vLon0 = mxToLon(bsMap.camX - (w / 2) / worldPx);
      const vLon1 = mxToLon(bsMap.camX + (w / 2) / worldPx);
      const vLat0 = myToLat(bsMap.camY + (h / 2) / worldPx);
      const vLat1 = myToLat(bsMap.camY - (h / 2) / worldPx);
      const { arr } = getBsActiveLayerItems();

      ctx.save();
      ctx.strokeStyle = bsMap.basemap === "esri_sat" ? "rgba(255,255,255,0.42)" : "rgba(148,163,184,0.42)";
      ctx.lineWidth = bsMap.zoom >= 11.2 ? 0.8 : 1.05;
      for (const it of arr) {
        const b = it.bbox;
        if (b && (b[2] < vLon0 || b[0] > vLon1 || b[3] < vLat0 || b[1] > vLat1)) continue;
        ctx.beginPath();
        for (const ring of it._mRings) traceRingF32(ctx, ring, toSx, toSy);
        ctx.stroke();
      }
      if (bsMap.hoverItem) {
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (const ring of bsMap.hoverItem._mRings) traceRingF32(ctx, ring, toSx, toSy);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function populateBsMapSelects() {
    const pSel = document.getElementById("bsMapProvSel");
    if (!pSel || !DATA) return;
    if (pSel.options.length === 0) {
      const sorted = DATA.provinces.slice().sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));
      for (const p of sorted) {
        const opt = document.createElement("option");
        opt.value = p.code;
        opt.textContent = p.trp === null || p.trp === undefined ? `${p.name_th} (นอกเขต สสน.)` : p.name_th;
        pSel.appendChild(opt);
      }
    }
    populateBsAmphoeSelect(bsMap.focusProv);
  }

  function populateBsAmphoeSelect(provCode) {
    const aSel = document.getElementById("bsMapAmpSel");
    if (!aSel || !DATA) return;
    aSel.innerHTML = '<option value="">ทุกอำเภอในจังหวัด</option>';
    if (!provCode) return;
    const amps = DATA.amphoes
      .filter(a => a.prov_code === provCode)
      .sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));
    for (const a of amps) {
      const opt = document.createElement("option");
      opt.value = a.code;
      opt.textContent = "อ." + a.name_th;
      aSel.appendChild(opt);
    }
    aSel.value = bsMap.focusAmp || "";
  }

  function applyBsPreset(preset) {
    document.querySelectorAll(".bs-chip[data-bs-preset]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.bsPreset === preset);
    });
    if (preset === "all62") {
      bsMap.focusProv = "";
      bsMap.focusAmp = "";
      const aSel = document.getElementById("bsMapAmpSel");
      if (aSel) aSel.innerHTML = '<option value="">ทุกอำเภอในจังหวัด</option>';
      fitBsBbox([97.3, 12.0, 105.7, 20.5], { maxZ: 6.4 });
      const badge = document.getElementById("bsMapScopeBadge");
      if (badge) badge.textContent = "ภาพรวม 62 จังหวัดในเขต สสน.";
      updateBsAreaReadout(null);
      updateBsPixelLegend();
      requestDrawBsMap();
      return;
    }
    if (preset === "maechaem") {
      const mc = DATA.amphoes.find(a => a.prov_code === "50" && (a.name_th || "").includes("แม่แจ่ม"));
      if (mc) {
        flyBsMapToProvince("50", { amphoeCode: mc.code, scrollToMap: false });
        return;
      }
      flyBsMapToProvince("50", { scrollToMap: false });
      return;
    }
    const pMap = { lopburi: "16", nakhonsawan: "60", chaiyaphum: "36", tak: "63" };
    const code = pMap[preset] || "16";
    if (PROV_MAP.has(code)) flyBsMapToProvince(code, { scrollToMap: false });
    else if (DATA.provinces[0]) flyBsMapToProvince(DATA.provinces[0].code, { scrollToMap: false });
  }

  function flyBsMapToProvince(provCode, { amphoeCode = "", scrollToMap = true } = {}) {
    const prov = PROV_MAP.get(provCode);
    if (!prov) return;
    bsMap.focusProv = provCode;
    bsMap.focusAmp = amphoeCode || "";
    const pSel = document.getElementById("bsMapProvSel");
    if (pSel) pSel.value = provCode;
    populateBsAmphoeSelect(provCode);
    const amp = amphoeCode ? AMP_MAP.get(amphoeCode) : null;
    if (amp) {
      fitBsBbox(amp.bbox, { maxZ: 12.2 });
      const badge = document.getElementById("bsMapScopeBadge");
      if (badge) badge.textContent = `จ.${prov.name_th} · อ.${amp.name_th}`;
      updateBsAreaReadout(amp, "อ.");
    } else {
      fitBsBbox(prov.bbox, { maxZ: 10.6 });
      const badge = document.getElementById("bsMapScopeBadge");
      if (badge) badge.textContent = `จ.${prov.name_th}`;
      updateBsAreaReadout(prov, "จ.");
    }
    updateBsPixelLegend();
    requestDrawBsMap();
    if (scrollToMap) {
      document.getElementById("bsMapCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function hitTestBsArea(clientX, clientY) {
    const canvas = document.getElementById("bsMapCanvas");
    if (!canvas || !DATA) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const worldPx = 256 * Math.pow(2, bsMap.zoom);
    const mx = bsMap.camX + (sx - rect.width / 2) / worldPx;
    const my = bsMap.camY + (sy - rect.height / 2) / worldPx;
    const lon = mxToLon(mx), lat = myToLat(my);
    const { prefix, arr } = getBsActiveLayerItems();
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      const b = it.bbox;
      if (!b || lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (pointInRings(mx, my, it._mRings)) return { item: it, prefix };
    }
    return null;
  }

  function bindBsMapEvents() {
    const canvas = document.getElementById("bsMapCanvas");
    if (!canvas || canvas._bsBound) return;
    canvas._bsBound = true;

    const layerL = document.getElementById("bsLayerLeft");
    const layerR = document.getElementById("bsLayerRight");
    const baseSel = document.getElementById("bsBasemapSel");
    const opRange = document.getElementById("bsOpacityRange");
    const opVal = document.getElementById("bsOpacityVal");
    const boundsChk = document.getElementById("bsShowBoundsCheck");
    const swipeBtn = document.getElementById("bsSwipeToggle");

    layerL?.addEventListener("change", () => { bsMap.layerLeft = layerL.value; updateBsPixelLegend(); requestDrawBsMap(); });
    layerR?.addEventListener("change", () => { bsMap.layerRight = layerR.value; updateBsPixelLegend(); requestDrawBsMap(); });
    baseSel?.addEventListener("change", () => { bsMap.basemap = baseSel.value; requestDrawBsMap(); });
    opRange?.addEventListener("input", () => {
      bsMap.opacity = Number(opRange.value) / 100;
      if (opVal) opVal.textContent = opRange.value + "%";
      requestDrawBsMap();
    });
    boundsChk?.addEventListener("change", () => { bsMap.showBounds = boundsChk.checked; requestDrawBsMap(); });

    swipeBtn?.addEventListener("click", () => {
      bsMap.swipe = !bsMap.swipe;
      swipeBtn.classList.toggle("active", bsMap.swipe);
      const wrapR = document.getElementById("bsLayerRightWrap");
      const lblL = document.getElementById("bsLayerLeftLabel");
      if (wrapR) wrapR.style.display = bsMap.swipe ? "block" : "none";
      if (lblL) lblL.textContent = bsMap.swipe ? "ฝั่งซ้าย (ก่อน)" : "ชั้นภาพรอยเผา 20 ม.";
      if (bsMap.swipe && layerL && layerR && layerL.value === layerR.value) {
        layerL.value = "2023/BOTH_202312_202404";
        layerR.value = "2025/BOTH_202512_202604";
        bsMap.layerLeft = layerL.value;
        bsMap.layerRight = layerR.value;
      }
      updateBsPixelLegend();
      requestDrawBsMap();
    });

    document.getElementById("bsMapProvSel")?.addEventListener("change", (e) => {
      document.querySelectorAll(".bs-chip").forEach(b => b.classList.remove("active"));
      flyBsMapToProvince(e.target.value, { scrollToMap: false });
    });
    document.getElementById("bsMapAmpSel")?.addEventListener("change", (e) => {
      document.querySelectorAll(".bs-chip").forEach(b => b.classList.remove("active"));
      flyBsMapToProvince(bsMap.focusProv, { amphoeCode: e.target.value, scrollToMap: false });
    });
    document.querySelectorAll(".bs-chip[data-bs-preset]").forEach(btn => {
      btn.addEventListener("click", () => applyBsPreset(btn.dataset.bsPreset));
    });

    document.getElementById("bsZoomInBtn")?.addEventListener("click", () => { bsMap.zoom = Math.min(18, bsMap.zoom + 0.8); requestDrawBsMap(); });
    document.getElementById("bsZoomOutBtn")?.addEventListener("click", () => { bsMap.zoom = Math.max(5.0, bsMap.zoom - 0.8); requestDrawBsMap(); });
    document.getElementById("bsResetBtn")?.addEventListener("click", () => applyBsPreset("all62"));

    // Swipe divider drag
    const handle = document.getElementById("bsSwipeHandle");
    let swiping = false;
    handle?.addEventListener("pointerdown", (e) => {
      swiping = true;
      handle.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    handle?.addEventListener("pointermove", (e) => {
      if (!swiping) return;
      const rect = canvas.getBoundingClientRect();
      bsMap.swipeRatio = Math.max(0.06, Math.min(0.94, (e.clientX - rect.left) / Math.max(1, rect.width)));
      requestDrawBsMap();
    });
    handle?.addEventListener("pointerup", () => { swiping = false; });
    handle?.addEventListener("pointercancel", () => { swiping = false; });

    // Pan + rAF Hover on #bsMapCanvas
    let dragging = false, lastX = 0, lastY = 0, hoverPending = false, lastEvt = null;
    canvas.addEventListener("mousedown", (e) => {
      if (swiping) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { dragging = false; });
    function processBsHover() {
      hoverPending = false;
      if (!lastEvt || dragging || swiping || activePage !== "burnscar") return;
      const hit = hitTestBsArea(lastEvt.clientX, lastEvt.clientY);
      const nextCode = hit ? (hit.prefix + hit.item.code) : null;
      if (nextCode !== bsMap.lastHoverCode) {
        bsMap.lastHoverCode = nextCode;
        bsMap.hoverItem = hit ? hit.item : null;
        if (hit) updateBsAreaReadout(hit.item, hit.prefix);
        else {
          const cur = bsMap.focusAmp ? AMP_MAP.get(bsMap.focusAmp) : (bsMap.focusProv ? PROV_MAP.get(bsMap.focusProv) : null);
          updateBsAreaReadout(cur, bsMap.focusAmp ? "อ." : "จ.");
        }
        requestDrawBsMap();
      }
    }
    canvas.addEventListener("mousemove", (e) => {
      if (swiping) return;
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        const worldPx = 256 * Math.pow(2, bsMap.zoom);
        bsMap.camX -= dx / worldPx;
        bsMap.camY -= dy / worldPx;
        lastX = e.clientX; lastY = e.clientY;
        requestDrawBsMap();
        return;
      }
      lastEvt = e;
      if (!hoverPending) { hoverPending = true; requestAnimationFrame(processBsHover); }
    });
    canvas.addEventListener("mouseleave", () => {
      bsMap.lastHoverCode = null;
      bsMap.hoverItem = null;
      const cur = bsMap.focusAmp ? AMP_MAP.get(bsMap.focusAmp) : (bsMap.focusProv ? PROV_MAP.get(bsMap.focusProv) : null);
      updateBsAreaReadout(cur, bsMap.focusAmp ? "อ." : "จ.");
      requestDrawBsMap();
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const wp0 = 256 * Math.pow(2, bsMap.zoom);
      const mx = bsMap.camX + (sx - rect.width / 2) / wp0;
      const my = bsMap.camY + (sy - rect.height / 2) / wp0;
      bsMap.zoom = Math.max(5.0, Math.min(18.0, bsMap.zoom + (e.deltaY < 0 ? 0.45 : -0.45)));
      const wp1 = 256 * Math.pow(2, bsMap.zoom);
      bsMap.camX = mx - (sx - rect.width / 2) / wp1;
      bsMap.camY = my - (sy - rect.height / 2) / wp1;
      requestDrawBsMap();
    }, { passive: false });
  }

  function populateComparatorSelects() {
    const defaults = ["50", "16", "30", "60"];
    const sorted = DATA.provinces.slice().sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));
    for (let i = 0; i < 4; i++) {
      const sel = document.getElementById("cmpSel" + i);
      if (!sel || sel.options.length > 0) continue;
      for (const p of sorted) {
        const opt = document.createElement("option");
        opt.value = p.code;
        opt.textContent = p.name_th;
        sel.appendChild(opt);
      }
      if (PROV_MAP.has(defaults[i])) sel.value = defaults[i];
      else if (sorted[i]) sel.value = sorted[i].code;
      sel.onchange = renderComparatorCards;
    }
  }

  function renderBurnScarPage() {
    if (!DATA || !state.computedStats) return;
    populateComparatorSelects();
    populateBsMapSelects();
    if (!bsMap.initialized) {
      bsMap.initialized = true;
      requestAnimationFrame(() => applyBsPreset("lopburi"));
    } else {
      updateBsPixelLegend();
      requestAnimationFrame(() => requestDrawBsMap());
    }

    // 3-season stacked chart
    const seasons = [
      { key: "2024", label: "ฤดู 2567 (66–67)", sums: [0,0,0,0,0] },
      { key: "2025", label: "ฤดู 2568 (67–68)", sums: [0,0,0,0,0] },
      { key: "2026", label: "ฤดู 2569 (68–69)", sums: [0,0,0,0,0] },
    ];
    for (const p of DATA.provinces) {
      if (!p.trp) continue;
      for (const s of seasons) {
        const a = p.trp[s.key];
        if (!a) continue;
        for (let k = 0; k < 5; k++) s.sums[k] += a[k];
      }
    }
    drawSeasonBurnChart(document.getElementById("bsSeasonCanvas"), seasons);

    // 4 crop delta cards
    const s67 = seasons[0].sums, s69 = seasons[2].sums;
    const cropDefs = [
      { name: "นาข้าว", idx: 0 },
      { name: "อ้อย", idx: 1 },
      { name: "ข้าวโพด", idx: 2 },
      { name: "ป่าไม้", idx: 4 },
    ];
    const cardsEl = document.getElementById("bsCropCards");
    cardsEl.innerHTML = cropDefs.map(c => {
      const v67 = s67[c.idx], v69 = s69[c.idx];
      const chg = v67 > 0 ? ((v69 - v67) * 100 / v67) : 0;
      return `
        <div class="kpi-hero" style="padding:13px 14px;">
          <div class="kpi-hero-top">
            <span class="kpi-hero-label">${escHtml(c.name)} (ฤดู 2569)</span>
            <span class="delta-pill ${chg <= 0 ? "down" : "up"}">${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</span>
          </div>
          <div style="font-size:21px;font-weight:700;">${(v69 / 1e6).toFixed(2)} ล้านไร่</div>
          <div class="kpi-hero-sub">ฤดู 2567: ${(v67 / 1e6).toFixed(2)} ล้านไร่</div>
        </div>
      `;
    }).join("");

    renderComparatorCards();
    renderMasterProvinceTable();
  }

  function drawSeasonBurnChart(canvas, seasons) {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const pad = { l: 58, r: 16, t: 38, b: 36 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const maxV = Math.max(1e6, ...seasons.map(s => s.sums.reduce((a, b) => a + b, 0)));
    const colors = ["#d4a84f", "#c96f53", "#7d9b65", "#8b8579", "#a84438"];
    const names = ["ข้าว", "อ้อย", "ข้าวโพด", "ผสม", "ป่าไม้"];
    const textCol = state.theme === "dark" ? "#94a3b8" : "#475569";

    const bw = Math.min(82, (pw / seasons.length) * 0.46);
    seasons.forEach((s, idx) => {
      const cx = pad.l + (idx + 0.5) * (pw / seasons.length);
      let y = pad.t + ph;
      let tot = 0;
      for (let k = 0; k < 5; k++) {
        const bh = (s.sums[k] / maxV) * ph;
        tot += s.sums[k];
        if (bh > 0) {
          ctx.fillStyle = colors[k];
          ctx.fillRect(cx - bw / 2, y - bh, bw, bh);
          y -= bh;
        }
      }
      ctx.fillStyle = state.theme === "dark" ? "#f8fafc" : "#0f172a";
      ctx.font = "700 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${(tot / 1e6).toFixed(2)} ล.ไร่`, cx, y - 6);
      ctx.fillStyle = textCol;
      ctx.font = "600 11px system-ui";
      ctx.fillText(w < 420 ? s.label.slice(0, 8) : s.label, cx, pad.t + ph + 18);
    });

    ctx.textAlign = "right"; ctx.font = "10.5px system-ui"; ctx.fillStyle = textCol;
    ctx.fillText(`${(maxV / 1e6).toFixed(1)}M`, pad.l - 8, pad.t + 10);
    ctx.fillText("0", pad.l - 8, pad.t + ph);

    let lx = pad.l;
    const lStep = Math.min(66, Math.max(48, pw / 5));
    ctx.textAlign = "left";
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = colors[k]; ctx.fillRect(lx, 5, 9, 9);
      ctx.fillStyle = textCol; ctx.fillText(names[k], lx + 12, 13);
      lx += lStep;
    }
  }

  function renderComparatorCards() {
    const grid = document.getElementById("bsCompareGrid");
    if (!grid || !DATA || !state.computedStats) return;
    const codes = [0, 1, 2, 3].map(i => document.getElementById("cmpSel" + i)?.value).filter(Boolean);
    grid.innerHTML = "";
    for (const code of codes) {
      const rec = state.computedStats.provByCode.get(code);
      if (!rec) continue;
      const p = rec.item;
      const t26 = p.trp?.["2026"];
      const t26Tot = t26 ? (t26[0] + t26[1] + t26[2] + t26[3] + t26[4]) : null;
      const w26 = p.wx_y?.["2026"];
      const cropBarColors = ["#d4a84f", "#c96f53", "#7d9b65", "#8b8579", "#a84438"];
      const cropBarHtml = (t26 && t26Tot > 0)
        ? `<div class="split-bar" title="สัดส่วนรอยเผา 69: ข้าว / อ้อย / ข้าวโพด / ผสม / ป่า">${t26.map((v, k) => v > 0 ? `<div style="background:${cropBarColors[k]};width:${(v * 100 / t26Tot).toFixed(1)}%"></div>` : "").join("")}</div>`
        : `<div class="split-bar"></div>`;
      const card = document.createElement("div");
      card.className = "cmp-card";
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong style="font-size:15.5px;color:var(--text);">${escHtml(p.name_th)}</strong>
            <span class="reg-pill" style="margin-left:5px;">${escHtml(REGION_TH[p.region] || p.region || "-")}</span>
          </div>
          <button type="button" class="btn" style="padding:3px 9px;font-size:11px;">ดูแปลง 20 ม.</button>
        </div>
        ${cropBarHtml}
        <div class="cmp-metric"><span>จุดไฟในมุมมอง</span><span>${formatNum(rec.total)} จุด</span></div>
        <div class="cmp-metric"><span>ความหนาแน่น</span><span>${rec.density !== null ? rec.density.toFixed(1) + " /100ตร.กม." : "-"}</span></div>
        <div class="cmp-metric"><span>เกษตร+ส.ป.ก.</span><span>${rec.agriPct !== null ? rec.agriPct.toFixed(1) + "%" : "-"}</span></div>
        <div class="cmp-metric"><span>รอยเผา สสน. 69 รวม</span><span>${t26Tot !== null ? formatNum(t26Tot, 0) + " ไร่" : (p.trp ? "0 ไร่" : "ไม่มีข้อมูล")}</span></div>
        <div class="cmp-metric"><span>ข้าว / อ้อย / ข้าวโพด 69</span><span>${t26 ? `${formatNum(t26[0],0)} / ${formatNum(t26[1],0)} / ${formatNum(t26[2],0)}` : (p.trp ? "0" : "ไม่มีข้อมูล")}</span></div>
        <div class="cmp-metric"><span>ป่าไม้ สสน. 69</span><span>${t26 ? formatNum(t26[4], 0) + " ไร่" : (p.trp ? "0 ไร่" : "ไม่มีข้อมูล")}</span></div>
        <div class="cmp-metric"><span>ดัชนีอากาศเอื้อไฟ 26</span><span>${w26?.peak_fwi != null ? w26.peak_fwi + "/100 (Tmax " + w26.tmax + "°C)" : "-"}</span></div>
        <div class="cmp-metric"><span>วันอากาศแห้ง RH&lt;35%</span><span>${w26?.low_rh_35 != null ? formatNum(w26.low_rh_35) + " วัน" : "-"}</span></div>
        <div class="cmp-metric"><span>น้ำท่วมซ้ำ 17 ปี HII</span><span>${p.flood_max_17yr != null ? p.flood_max_17yr + " ครั้ง" : "ไม่มีข้อมูล"}</span></div>
      `;
      card.querySelector("button").onclick = () => flyBsMapToProvince(p.code, { scrollToMap: true });
      grid.appendChild(card);
    }
  }

  function buildMasterProvinceRows() {
    return state.computedStats.provRecords.map(rec => {
      const p = rec.item;
      const t26 = p.trp?.["2026"];
      const covered = p.trp !== null && p.trp !== undefined;
      return {
        code: p.code,
        name_th: p.name_th,
        region: REGION_TH[p.region] || p.region || "-",
        hs_5y: rec.total,
        density: rec.density,
        trp_26: covered ? (t26 ? t26[0] + t26[1] + t26[2] + t26[3] + t26[4] : 0) : null,
        trp_rice: covered ? (t26 ? t26[0] : 0) : null,
        trp_sugar: covered ? (t26 ? t26[1] : 0) : null,
        trp_corn: covered ? (t26 ? t26[2] : 0) : null,
        trp_for: covered ? (t26 ? t26[4] : 0) : null,
        fwi_26: p.wx_y?.["2026"]?.peak_fwi ?? null,
        flood: p.flood_max_17yr ?? null,
      };
    });
  }

  function renderMasterProvinceTable() {
    const tbody = document.getElementById("bsMasterTbody");
    if (!tbody || !state.computedStats) return;
    const q = (document.getElementById("bsTableSearch")?.value || "").trim().toLowerCase();
    let rows = buildMasterProvinceRows();
    if (q) rows = rows.filter(r => r.name_th.toLowerCase().includes(q) || r.region.toLowerCase().includes(q));
    rows.sort((a, b) => {
      const av = a[bsSortKey], bv = b[bsSortKey];
      if (typeof av === "string") return av.localeCompare(bv || "", "th") * bsSortDir;
      const na = av === null || av === undefined ? -Infinity : av;
      const nb = bv === null || bv === undefined ? -Infinity : bv;
      return (na - nb) * bsSortDir;
    });
    const fmt = (v, d = 0) => (v === null || v === undefined ? '<span style="color:var(--muted)">ไม่มีข้อมูล</span>' : formatNum(v, d));
    document.querySelectorAll("#bsMasterTable th[data-sort]").forEach(th => {
      const base = th.dataset.baseLabel || th.textContent.replace(/\s*[▲▼]$/, "");
      th.dataset.baseLabel = base;
      const isAct = th.dataset.sort === bsSortKey;
      th.classList.toggle("sort-active", isAct);
      th.textContent = isAct ? `${base} ${bsSortDir > 0 ? "▲" : "▼"}` : base;
    });
    tbody.innerHTML = rows.map((r, idx) => `
      <tr data-pcode="${escHtml(r.code)}">
        <td>${idx + 1}</td>
        <td>${escHtml(r.name_th)}</td>
        <td><span class="reg-pill">${escHtml(r.region)}</span></td>
        <td>${fmt(r.hs_5y)}</td>
        <td>${fmt(r.density, 1)}</td>
        <td style="font-weight:700;color:var(--accent);">${fmt(r.trp_26)}</td>
        <td>${fmt(r.trp_rice)}</td>
        <td>${fmt(r.trp_sugar)}</td>
        <td>${fmt(r.trp_corn)}</td>
        <td>${fmt(r.trp_for)}</td>
        <td>${fmt(r.fwi_26, 1)}</td>
        <td>${r.flood !== null ? r.flood + " ครั้ง" : '<span style="color:var(--muted)">ไม่มีข้อมูล</span>'}</td>
      </tr>
    `).join("");
    tbody.querySelectorAll("tr[data-pcode]").forEach(tr => {
      tr.onclick = () => flyBsMapToProvince(tr.dataset.pcode, { scrollToMap: true });
    });
  }

  function exportMasterProvinceCsv() {
    const rows = buildMasterProvinceRows();
    const headers = ["code","province_th","region","hotspots","density_per_100sqkm","trp_2569_total_rai","trp_2569_rice_rai","trp_2569_sugarcane_rai","trp_2569_corn_rai","trp_2569_forest_rai","peak_fwi_2026","flood_max_17yr"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([r.code, r.name_th, r.region, r.hs_5y, r.density?.toFixed(2) ?? "", r.trp_26 ?? "", r.trp_rice ?? "", r.trp_sugar ?? "", r.trp_corn ?? "", r.trp_for ?? "", r.fwi_26 ?? "", r.flood ?? ""].map(csvCell).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "thailand_77_provinces_fire_weather_burnscar.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function bindMultiPageEvents() {
    document.querySelectorAll(".nav-tab[data-page]").forEach(btn => {
      btn.addEventListener("click", () => switchPage(btn.dataset.page));
    });
    document.querySelectorAll("[data-goto]").forEach(btn => {
      btn.addEventListener("click", () => switchPage(btn.dataset.goto));
    });
    document.querySelectorAll("#ovSatToggle button").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll("#ovSatToggle button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderOverviewPage();
      };
    });
    document.getElementById("ovWxMetric")?.addEventListener("change", renderOverviewPage);
    document.querySelectorAll("#ovTopMode button").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll("#ovTopMode button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        ovTopMode = btn.dataset.mode;
        renderOverviewPage();
      };
    });

    ["wxProvSelect","wxMetricSelect","wxSatSelect","wxMatrixMode"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", renderWeatherPage);
    });
    ["wxScatX","wxScatY"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", drawWxProvinceScatter);
    });
    document.getElementById("wxRefreshForecastBtn")?.addEventListener("click", () => {
      const pCode = document.getElementById("wxProvSelect")?.value || "all";
      const fcProv = pCode === "all" ? (PROV_MAP.get("50") || DATA.provinces[0]) : PROV_MAP.get(pCode);
      loadLiveForecast(fcProv, true);
    });

    document.getElementById("ovStoryTmsBtn")?.addEventListener("click", () => switchPage("burnscar"));
    document.getElementById("wxJumpMapBtn")?.addEventListener("click", () => {
      state.metric = "wx_fwi";
      if (els.metricSelect) els.metricSelect.value = "wx_fwi";
      const selP = document.getElementById("wxProvSelect")?.value;
      if (selP && selP !== "all") jumpToProvinceOnMap(selP);
      else { switchPage("map"); requestAnimationFrame(() => refreshAll()); }
    });
    bindBsMapEvents();
    document.getElementById("bsOpenTmsBtn")?.addEventListener("click", () => jumpToProvinceOnMap(bsMap.focusProv || "16", { openTms: true }));
    document.getElementById("bsExportTableBtn")?.addEventListener("click", exportMasterProvinceCsv);
    document.getElementById("bsTableSearch")?.addEventListener("input", renderMasterProvinceTable);
    document.querySelectorAll("#bsMasterTable th[data-sort]").forEach(th => {
      th.onclick = () => {
        const k = th.dataset.sort;
        if (bsSortKey === k) bsSortDir *= -1;
        else { bsSortKey = k; bsSortDir = k === "name_th" || k === "region" ? 1 : -1; }
        renderMasterProvinceTable();
      };
    });

    window.addEventListener("hashchange", () => {
      const h = (window.location.hash || "").replace(/^#/, "");
      if (["overview","map","weather","burnscar","explorer"].includes(h) && h !== activePage) {
        switchPage(h, { updateHash: false });
      }
    });
  }
"""
