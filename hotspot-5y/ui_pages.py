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
  max-width: 1880px; width: 100%; min-width: 0; margin: 0 auto;
  padding: 18px clamp(12px, 1.35vw, 22px) 56px;
  display: flex; flex-direction: column; gap: 16px;
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
.hero-desc { margin: 7px 0 0; font-size: 13.5px; color: var(--muted); max-width: 1060px; line-height: 1.6; }
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
.fc-risk.low { background: rgba(34,197,94,0.16); color: #4ade80; }
.fc-risk.med { background: rgba(234,179,8,0.18); color: #facc15; }
.fc-risk.high { background: rgba(234,88,12,0.24); color: #fb923c; }
.fc-risk.vhigh { background: #991b1b; color: #ffffff; }
html[data-theme="light"] .fc-risk.low { background: #dcfce7; color: #166534; }
html[data-theme="light"] .fc-risk.med { background: #fef08a; color: #854d0e; }
html[data-theme="light"] .fc-risk.high { background: #fed7aa; color: #9a3412; }
html[data-theme="light"] .fc-risk.vhigh { background: #991b1b; color: #ffffff; }

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

/* Page 6: Live Haze, Transboundary & Agri Burn Rate */
.hz-live-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 10px;
}
.hz-prov-card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 11px 13px; display: flex; flex-direction: column; gap: 5px;
  cursor: pointer; transition: border-color .15s, transform .12s; text-align: left; font-family: inherit; color: var(--text);
}
.hz-prov-card:hover, .hz-prov-card.active { border-color: var(--accent); background: var(--accent-soft); transform: translateY(-1px); }
.hz-detail-box {
  background: var(--card); border: 1px solid var(--border); border-radius: 13px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0;
}
.hz-amp-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px;
}
.hz-amp-chip {
  background: var(--panel-solid); border: 1px solid var(--border); border-radius: 9px;
  padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px;
}
.hz-pm-badge {
  display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
}
.hz-pm-good { background: rgba(34,197,94,0.16); color: #4ade80; }
.hz-pm-mod { background: rgba(234,179,8,0.18); color: #facc15; }
.hz-pm-high { background: rgba(234,88,12,0.24); color: #fb923c; }
.hz-pm-crit { background: #991b1b; color: #ffffff; }
html[data-theme="light"] .hz-pm-good { background: #dcfce7; color: #166534; }
html[data-theme="light"] .hz-pm-mod { background: #fef08a; color: #854d0e; }
html[data-theme="light"] .hz-pm-high { background: #fed7aa; color: #9a3412; }
html[data-theme="light"] .hz-pm-crit { background: #991b1b; color: #ffffff; }

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
  .hz-live-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hz-amp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
            รวมจุดความร้อน 5 ปี (GISTDA VIIRS 1.28 ล้านจุด) · ฝุ่น PM2.5 &amp; หมอกควัน 6 ประเทศอาเซียน · รอยเผา 20 ม. 3 ฤดูเทียบพื้นที่ปลูก DOAE · อากาศ ERA5 · ความชื้นดิน NASA · อ่างเก็บน้ำ RID 461 แห่ง และพื้นที่น้ำท่วมซ้ำ 17 ปี
          </p>
        </div>
        <div class="hero-actions">
          <div class="pill-toggle" id="ovSatToggle" aria-label="เลือกมาตรฐานดาวเทียม">
            <button type="button" data-sat="N" class="active">Suomi NPP (N) มาตรฐาน 5 ปี</button>
            <button type="button" data-sat="ALL">ทุกดาวเทียม (N+N20+N21)</button>
          </div>
          <button type="button" class="btn primary" data-goto="map">เปิดแผนที่เจาะลึก</button>
          <button type="button" class="btn" data-goto="haze">ฝุ่น PM2.5 &amp; ข้ามแดน</button>
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
        <button type="button" class="story-chip" data-goto="haze">
          <div>
            <span id="ovStory3Title" class="story-chip-title">ฝุ่น PM2.5 สด &amp; หมอกควันข้ามแดน 6 ประเทศ</span>
            <span id="ovStory3Sub" class="story-chip-sub">เช็คฝุ่นรายจังหวัด/อำเภอ + เทียบไทย-เมียนมา-ลาว-กัมพูชา</span>
          </div>
          <span class="story-chip-arrow">→</span>
        </button>
        <button type="button" class="story-chip" id="ovStoryTmsBtn">
          <div>
            <span class="story-chip-title">ส่องภาพแปลงเผาจริงความละเอียด 20 ม.</span>
            <span class="story-chip-sub">เปิดแผนที่รอยเผา + ลากเส้นเทียบก่อน-หลัง 2 ปี</span>
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
            <span><i class="matrix-legend-swatch" style="background:#fef3c7;border:1px solid rgba(148,163,184,0.35)"></i>ต่ำ (อ่อน)</span>
            <span><i class="matrix-legend-swatch" style="background:#fcd34d"></i>ปานกลาง</span>
            <span><i class="matrix-legend-swatch" style="background:#ea580c"></i>สูง</span>
            <span><i class="matrix-legend-swatch" style="background:#991b1b"></i>วิกฤต (เข้มสุด)</span>
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

HAZE_PAGE_HTML = r"""
<section id="page-haze" class="page-view">
  <div class="page-wrap">
    <div class="hero-banner">
      <div class="hero-row">
        <div>
          <div class="hero-kicker">PM2.5 HAZE · TRANSBOUNDARY ASEAN · DOAE BURN INTENSITY · RID WATER</div>
          <h1 class="hero-title">ศูนย์ติดตามฝุ่น PM2.5 สด หมอกควันข้ามแดน 6 ประเทศ &amp; อัตราเผาเกษตร</h1>
          <p class="hero-desc">
            เชื่อมข้อมูลดาวเทียมเช็คฝุ่น <strong>GISTDA รายชั่วโมง (จังหวัด/อำเภอ)</strong> · <strong>Open-Meteo CAMS PM2.5/CO/AOD 52 เดือน</strong> · <strong>NASA FIRMS 6 ประเทศอาเซียน (2022–2025)</strong> · <strong>พื้นที่ปลูก DOAE เทียบรอยเผา 20 ม.</strong> · <strong>ความชื้นดิน NASA POWER</strong> และ <strong>น้ำ 461 อ่างเก็บน้ำ RID</strong>
          </p>
        </div>
        <div class="hero-actions">
          <button type="button" class="btn primary" id="hzRefreshBtn">อัปเดตฝุ่น PM2.5 สด</button>
          <button type="button" class="btn" id="hzJumpMapBtn">ดูแผนที่ฝุ่น PM2.5</button>
          <button type="button" class="btn" data-goto="explorer">SQL ค้นข้อมูลดิบ</button>
        </div>
      </div>
    </div>

    <div class="kpi-hero-grid" id="hzLiveKpis">
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">จังหวัดฝุ่นเกินเกณฑ์ไทย (&gt;37.5)</span><span class="delta-pill neutral" id="hzLiveTimeBadge">กำลังโหลด</span></div>
        <div id="hzKpiExceed" class="kpi-hero-val">-</div>
        <div id="hzKpiExceedSub" class="kpi-hero-sub">GISTDA เช็คฝุ่น 77 จังหวัด</div>
      </div>
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">จังหวัด PM2.5 สูงสุดขณะนี้</span><span class="delta-pill neutral">µg/m³</span></div>
        <div id="hzKpiTop" class="kpi-hero-val">-</div>
        <div id="hzKpiTopSub" class="kpi-hero-sub">-</div>
      </div>
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">ไทย vs เพื่อนบ้าน 6 ประเทศ (2022–25)</span><span class="delta-pill neutral">VIIRS-N</span></div>
        <div id="hzKpiTrans" class="kpi-hero-val">-</div>
        <div id="hzKpiTransSub" class="kpi-hero-sub">-</div>
      </div>
      <div class="kpi-hero">
        <div class="kpi-hero-top"><span class="kpi-hero-label">ประมาณการฝุ่น PM2.5 จากการเผา (ฤดู 69)</span><span class="delta-pill neutral">62 จว.</span></div>
        <div id="hzKpiEmit" class="kpi-hero-val">-</div>
        <div id="hzKpiEmitSub" class="kpi-hero-sub">-</div>
      </div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">1. สถานการณ์ฝุ่น PM2.5 รายชั่วโมง (GISTDA เช็คฝุ่น 77 จังหวัด · คลิกเพื่อดูรายอำเภอ)</h2>
          <div id="hzLiveSub" class="panel-sub">กำลังดึงค่า PM2.5 ล่าสุดจาก pm25.gistda.or.th...</div>
        </div>
        <select id="hzLiveProvSel" style="width:auto;min-width:205px;" aria-label="เลือกจังหวัดตรวจฝุ่นสด"></select>
      </div>
      <div id="hzLiveGrid" class="hz-live-grid"></div>
      <div id="hzLiveDetail" class="hz-detail-box" style="display:none;"></div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">2. ห้องแล็บความสัมพันธ์ 52 เดือน: จุดความร้อน vs ฝุ่น PM2.5 · ก๊าซ CO · AOD · ความชื้นดิน</h2>
          <div id="hzInsightText" class="panel-sub">เลือกจังหวัดและตัวแปรเพื่อตรวจความสัมพันธ์รายเดือน (2022–2026)</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span id="hzCorrBadge" class="badge">r = -</span>
          <select id="hzProvSelect" style="width:auto;min-width:170px;">
            <option value="all" selected>ทั้งประเทศ (77 จังหวัด)</option>
          </select>
          <select id="hzMetricSelect" style="width:auto;min-width:210px;">
            <option value="aq_pm25" selected>PM2.5 เฉลี่ยรายเดือน (µg/m³)</option>
            <option value="aq_pm25_max">PM2.5 สูงสุดในเดือน (µg/m³)</option>
            <option value="aq_exceed">วันฝุ่นเกินเกณฑ์ไทย &gt;37.5 (วัน)</option>
            <option value="aq_co">ก๊าซคาร์บอนมอนอกไซด์ CO (µg/m³)</option>
            <option value="aq_aod">ความหนาแน่นควัน AOD (550nm)</option>
            <option value="soil_wet">ความชื้นผิวดิน NASA GWETTOP (0–1)</option>
          </select>
          <select id="hzSatSelect" style="width:auto;min-width:130px;">
            <option value="N" selected>Suomi NPP (N)</option>
            <option value="ALL">ทุกดาวเทียม</option>
          </select>
        </div>
      </div>
      <div class="big-chart-box">
        <canvas id="hzDualCanvas" class="panel-canvas"></canvas>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">3. หมอกควันข้ามแดน: จุดความร้อน 6 ประเทศอาเซียน (2022–2025)</h2>
            <div class="panel-sub">เทียบมาตรฐานเดียวกันด้วย NASA FIRMS VIIRS Suomi-NPP (ไม่นับซ้ำดาวเทียม)</div>
          </div>
          <select id="hzTransYearSel" style="width:auto;min-width:125px;">
            <option value="all" selected>รวม 4 ปี (22–25)</option>
            <option value="2025">ปี 2025</option>
            <option value="2024">ปี 2024</option>
            <option value="2023">ปี 2023</option>
            <option value="2022">ปี 2022</option>
          </select>
        </div>
        <div class="big-chart-box">
          <canvas id="hzTransCanvas" class="panel-canvas"></canvas>
        </div>
        <div class="data-table-wrap" style="max-height:245px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ประเทศ</th>
                <th>กลุ่ม</th>
                <th>จุดไฟ VIIRS-N</th>
                <th>สัดส่วน</th>
                <th>ความเชื่อมั่นสูง</th>
                <th>พลังงานไฟ FRP (MW)</th>
              </tr>
            </thead>
            <tbody id="hzTransTbody"></tbody>
          </table>
        </div>
      </div>

      <div class="panel-card">
        <div class="panel-head">
          <div>
            <h2 class="panel-title">4. น้ำอ่างเก็บน้ำ 461 แห่ง (RID) &amp; ความชื้นผิวดิน 5 ปี (2022–2026)</h2>
            <div class="panel-sub">ปริมาณน้ำกักเก็บรายภาค (% ความจุ) เทียบช่วงฤดูแล้ง ม.ค.–เม.ย.</div>
          </div>
        </div>
        <div class="big-chart-box">
          <canvas id="hzWaterCanvas" class="panel-canvas"></canvas>
        </div>
        <div id="hzEmissionCards" class="kpi-hero-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;"></div>
        <div style="font-size:11.5px;color:var(--muted);line-height:1.5;">
          <strong>หมายเหตุวิธีคำนวณการปล่อยมลพิษ (Screening Estimate):</strong> ใช้พื้นที่เผาไหม้ Sentinel-2 สสน. คูณปริมาณเชื้อเพลิงแห้งมาตรฐาน (ข้าว 0.58, อ้อย 1.12, ข้าวโพด 0.88, พืชผสม 0.70, ป่า 2.40 ตัน/ไร่) และค่าการปล่อยมลพิษเฉลี่ย (PM2.5 ≈ 8.5 กก./ตันเชื้อเพลิง, CO₂e ≈ 1.58 ตัน/ตันเชื้อเพลิง ตามกรอบ Andreae / IPCC)
        </div>
      </div>
    </div>

    <div class="panel-card">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">5. อัตราการเผาเทียบพื้นที่เพาะปลูกจริง (% Burn Rate · DOAE 2566 × รอยเผา สสน. 20 ม.)</h2>
          <div class="panel-sub">เห็นชัดว่าจังหวัดใดปลูกเยอะและเผาจริงกี่เปอร์เซ็นต์ (15 จังหวัดภาคใต้คงค่า "ไม่มีข้อมูล" ตามขอบเขต สสน.)</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <select id="hzBurnSeasonSel" style="width:auto;min-width:140px;">
            <option value="2026" selected>ฤดู 2569 (2026)</option>
            <option value="2025">ฤดู 2568 (2025)</option>
            <option value="2024">ฤดู 2567 (2024)</option>
          </select>
          <select id="hzBurnCropSel" style="width:auto;min-width:145px;">
            <option value="all" selected>รวม ข้าว+อ้อย+ข้าวโพด</option>
            <option value="paddy">เฉพาะ นาข้าว</option>
            <option value="sugarcane">เฉพาะ อ้อยโรงงาน</option>
            <option value="corn">เฉพาะ ข้าวโพด</option>
          </select>
          <input id="hzBurnSearch" class="search-input" style="max-width:200px;" type="search" placeholder="กรองชื่อจังหวัด..." />
        </div>
      </div>
      <div class="data-table-wrap" role="region" tabindex="0" aria-label="ตารางอัตราเผาเทียบพื้นที่ปลูก 77 จังหวัด">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>จังหวัด</th>
              <th>ภาค</th>
              <th>พื้นที่เผา (ไร่)</th>
              <th>พื้นที่ปลูก DOAE 66 (ไร่)</th>
              <th>% เผาเทียบปลูก</th>
              <th>PM2.5 เฉลี่ยฤดู</th>
              <th>ประมาณการปล่อย PM2.5 (ตัน)</th>
            </tr>
          </thead>
          <tbody id="hzBurnRateTbody"></tbody>
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
    else if (pageId === "haze") renderHazePage();
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

    // Stacked monthly bars (restrained amber + muted sage) + hover column highlight
    const hovIdx = (hoverStore && typeof hoverStore.hoverIdx === "number") ? hoverStore.hoverIdx : -1;
    if (hovIdx >= 0 && hovIdx < n) {
      ctx.save();
      ctx.fillStyle = isDark ? "rgba(223, 106, 55, 0.12)" : "rgba(197, 83, 37, 0.10)";
      ctx.fillRect(pad.l + hovIdx * step, pad.t, step, ph);
      ctx.strokeStyle = isDark ? "rgba(253, 224, 71, 0.55)" : "rgba(197, 83, 37, 0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      const hcx = pad.l + (hovIdx + 0.5) * step;
      ctx.beginPath(); ctx.moveTo(hcx, pad.t); ctx.lineTo(hcx, pad.t + ph); ctx.stroke();
      ctx.restore();
    }
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
      if (i === hovIdx && totH > 0) {
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x - 0.5, pad.t + ph - totH, bw + 1, totH);
      }

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
    const wxMeta = (hoverStore && hoverStore.customMeta) || WX_LABELS[String(wxKey)] || { name: "อากาศ", unit: "", color: "#689cb8" };
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
      if (hovIdx >= 0 && hovIdx < n && wxVals[hovIdx] !== null) {
        const hcx = pad.l + (hovIdx + 0.5) * step;
        const hcy = pad.t + ph - ((wxVals[hovIdx] - minW) / spanW) * ph;
        ctx.fillStyle = "rgba(124, 176, 204, 0.28)";
        ctx.beginPath(); ctx.arc(hcx, hcy, 8.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fde047";
        ctx.strokeStyle = isDark ? "#0f131b" : "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hcx, hcy, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
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
      hoverStore.canvas = canvas; hoverStore.wxKey = wxKey;
      hoverStore.pad = pad; hoverStore.step = step; hoverStore.series = series; hoverStore.wxMeta = wxMeta;
      hoverStore.avgWx = validW.length ? (validW.reduce((a, b) => a + b, 0) / validW.length) : null;
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
      if (idx < 0 || idx >= s.months.length) {
        if (hoverStore.hoverIdx !== -1) {
          hoverStore.hoverIdx = -1;
          drawDualFireWeatherChart(canvas, hoverStore.series, hoverStore.wxKey, hoverStore);
        }
        hideTooltip();
        return;
      }
      if (hoverStore.hoverIdx !== idx) {
        hoverStore.hoverIdx = idx;
        drawDualFireWeatherChart(canvas, hoverStore.series, hoverStore.wxKey, hoverStore);
      }
      const ym = s.months[idx];
      const moNum = Number(ym.slice(5, 7));
      const yrNum = Number(ym.slice(0, 4));
      const moName = `${MONTH_TH_SHORT[moNum - 1]} ${yrNum} (พ.ศ. ${yrNum + 543})`;
      const isPeak = moNum >= 1 && moNum <= 4;
      const tot = s.fireTot[idx] || 0;
      const ag = s.fireAgri[idx] || 0;
      const fo = s.fireFor[idx] || 0;
      const ot = Math.max(0, tot - ag - fo);
      const agPct = tot > 0 ? (ag * 100 / tot).toFixed(1) : "0.0";
      const foPct = tot > 0 ? (fo * 100 / tot).toFixed(1) : "0.0";
      const otPct = tot > 0 ? (ot * 100 / tot).toFixed(1) : "0.0";
      const wVal = s.wxVals[idx];
      const avgW = hoverStore.avgWx;
      let wDiffTxt = "";
      if (wVal !== null && avgW !== null && Math.abs(avgW) > 1e-6) {
        const diffPct = ((wVal - avgW) * 100 / avgW);
        wDiffTxt = ` <span style="font-weight:500;color:var(--muted);">(${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(0)}% vs เฉลี่ย)</span>`;
      }
      showTooltip(e.clientX, e.clientY, `
        <div class="tt-head">
          <div>
            <h4>${escHtml(moName)}</h4>
            <div class="tt-sub">${isPeak ? "ฤดูเผาพีค (ม.ค.–เม.ย.)" : "นอกฤดูเผาหลัก"}</div>
          </div>
          <span class="tt-badge">${formatNum(tot)} จุด</span>
        </div>
        <div class="tt-bar">
          <div style="background:#d48942;width:${agPct}%"></div>
          <div style="background:#55947a;width:${foPct}%"></div>
          <div style="background:#8b95a7;width:${otPct}%"></div>
        </div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร + ส.ป.ก.</span><span class="tt-v">${formatNum(ag)} จุด (${agPct}%)</span></div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#55947a"></i>ป่าไม้</span><span class="tt-v">${formatNum(fo)} จุด (${foPct}%)</span></div>
        ${ot > 0 ? `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#8b95a7"></i>พื้นที่อื่น ๆ</span><span class="tt-v">${formatNum(ot)} จุด (${otPct}%)</span></div>` : ""}
        <div class="tt-divider"></div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#7cb0cc"></i>${escHtml(hoverStore.wxMeta.name)}</span><span class="tt-v">${wVal !== null ? wVal + " " + escHtml(hoverStore.wxMeta.unit) + wDiffTxt : "ไม่มีข้อมูล"}</span></div>
      `);
    });
    canvas.addEventListener("mouseleave", () => {
      if (hoverStore.hoverIdx !== -1) {
        hoverStore.hoverIdx = -1;
        drawDualFireWeatherChart(canvas, hoverStore.series, hoverStore.wxKey, hoverStore);
      }
      hideTooltip();
    });
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
        return `<div class="mini-spark-col" data-sp-idx="${i}"><div class="mini-spark-track"><div class="mini-spark-bar" style="height:${pct}%"></div></div><span class="mini-spark-yr">${String(2022 + i).slice(2)}</span></div>`;
      }).join("");
      sparkEl.querySelectorAll(".mini-spark-col[data-sp-idx]").forEach(col => {
        const i = Number(col.dataset.spIdx);
        const yr = 2022 + i;
        const v = yrTot[i] || 0;
        const prev = i > 0 ? yrTot[i - 1] : null;
        const yoyP = prev && prev > 0 ? ((v - prev) * 100 / prev) : null;
        const shPct = tot5y > 0 ? (v * 100 / tot5y).toFixed(1) : "0.0";
        col.addEventListener("mousemove", (e) => {
          showTooltip(e.clientX, e.clientY, `
            <div class="tt-head">
              <div>
                <h4>ปี ${yr} (พ.ศ. ${yr + 543})</h4>
                <div class="tt-sub">ช่วงเทียบมาตรฐาน ม.ค.–ต.ค. (${satOnlyN ? "Suomi NPP" : "ทุกดาวเทียม"})</div>
              </div>
              <span class="tt-badge">${yoyP !== null ? `${yoyP >= 0 ? "+" : ""}${yoyP.toFixed(1)}% YoY` : shPct + "% ของ 5 ปี"}</span>
            </div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:var(--accent)"></i>จุดความร้อนทั้งปี</span><span class="tt-v">${formatNum(v)} จุด</span></div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>สัดส่วนต่อยอด 5 ปี</span><span class="tt-v">${shPct}%</span></div>
          `);
        });
        col.addEventListener("mouseleave", hideTooltip);
      });
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
      div.addEventListener("mousemove", (e) => {
        const shNat = tot5y > 0 ? (rg.tot * 100 / tot5y).toFixed(1) : "0.0";
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>${escHtml(rg.name)} (${rg.provs} จังหวัด)</h4>
              <div class="tt-sub">คิดเป็น ${shNat}% ของจุดความร้อนทั้งประเทศ</div>
            </div>
            <span class="tt-badge">${formatNum(rg.tot)} จุด</span>
          </div>
          <div class="tt-bar">
            <div style="background:#d48942;width:${ap.toFixed(1)}%"></div>
            <div style="background:#55947a;width:${fp.toFixed(1)}%"></div>
          </div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร + ส.ป.ก.</span><span class="tt-v">${formatNum(rg.agri)} จุด (${ap.toFixed(1)}%)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#55947a"></i>เขตป่าไม้</span><span class="tt-v">${formatNum(rg.forest)} จุด (${fp.toFixed(1)}%)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:var(--accent)"></i>จังหวัดสูงสุดในภาค</span><span class="tt-v">${escHtml(rg.topProv?.name_th || "-")} (${formatNum(rg.topCnt)} จุด)</span></div>
          <div class="tt-foot">คลิกเพื่อซูมแผนที่ไปที่ จ.${escHtml(rg.topProv?.name_th || "")}</div>
        `);
      });
      div.addEventListener("mouseleave", hideTooltip);
      regEl.appendChild(div);
    }

    // Donut chart (TamRoyPao Season 2569 crop breakdown — cohesive earthy editorial palette)
    const trp24Crops = [0, 0, 0, 0, 0];
    const trp25Crops = [0, 0, 0, 0, 0];
    for (const p of DATA.provinces) {
      if (!p.trp) continue;
      if (p.trp["2024"]) for (let k = 0; k < 5; k++) trp24Crops[k] += p.trp["2024"][k] || 0;
      if (p.trp["2025"]) for (let k = 0; k < 5; k++) trp25Crops[k] += p.trp["2025"][k] || 0;
    }
    const fuelFactors = [0.58, 1.12, 0.88, 0.70, 2.40];
    const donutCanvas = document.getElementById("ovDonutCanvas");
    const segs = [
      { label: "นาข้าว", val: trp26Crops[0], v24: trp24Crops[0], v25: trp25Crops[0], fuel: fuelFactors[0], color: "#d4a84f" },
      { label: "อ้อย", val: trp26Crops[1], v24: trp24Crops[1], v25: trp25Crops[1], fuel: fuelFactors[1], color: "#c96f53" },
      { label: "ข้าวโพด", val: trp26Crops[2], v24: trp24Crops[2], v25: trp25Crops[2], fuel: fuelFactors[2], color: "#7d9b65" },
      { label: "พืชผสม", val: trp26Crops[3], v24: trp24Crops[3], v25: trp25Crops[3], fuel: fuelFactors[3], color: "#8b8579" },
      { label: "ป่าไม้", val: trp26Crops[4], v24: trp24Crops[4], v25: trp25Crops[4], fuel: fuelFactors[4], color: "#a84438" },
    ];
    drawDonutChart(donutCanvas, segs, `${(trp26Tot / 1e6).toFixed(2)} ล.ไร่`, "ฤดู 2569");
    const dayPct = tot5y > 0 ? (day5y * 100 / tot5y) : 0;
    const legContainer = document.getElementById("ovDonutLegend");
    legContainer.innerHTML = segs.map((s, idx) => {
      const pct = trp26Tot > 0 ? (s.val * 100 / trp26Tot).toFixed(1) : "0.0";
      return `<div class="donut-leg-item" data-seg-idx="${idx}" style="cursor:pointer;"><span><i style="display:inline-block;width:9px;height:9px;background:${s.color};border-radius:3px;margin-right:5px;"></i>${escHtml(s.label)}</span><strong>${pct}% <span style="color:var(--muted);font-weight:500;">(${(s.val / 1e6).toFixed(2)}M)</span></strong></div>`;
    }).join("") + `<div class="donut-leg-item" data-daynight="1" style="grid-column:1/-1;justify-content:center;cursor:pointer;"><span>กลางวัน <strong>${dayPct.toFixed(1)}%</strong> · กลางคืน <strong>${(100 - dayPct).toFixed(1)}%</strong></span></div>`;
    const showDonutSegTooltip = (e, idx) => {
      const s = segs[idx];
      if (!s) return;
      const pct = trp26Tot > 0 ? (s.val * 100 / trp26Tot).toFixed(1) : "0.0";
      const chg24 = s.v24 > 0 ? ((s.val - s.v24) * 100 / s.v24) : null;
      const pm25Est = Math.round(s.val * s.fuel * 0.0085);
      showTooltip(e.clientX, e.clientY, `
        <div class="tt-head">
          <div>
            <h4 style="color:${s.color}">${escHtml(s.label)} · ฤดูฝุ่น 2569</h4>
            <div class="tt-sub">รอยเผา Sentinel-2 20 ม. (สสน. 62 จังหวัด)</div>
          </div>
          <span class="tt-badge" style="color:${s.color};border-color:${s.color}55;background:${s.color}1f;">${pct}%</span>
        </div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${s.color}"></i>พื้นที่เผาฤดู 2569</span><span class="tt-v">${formatNum(s.val, 0)} ไร่ (${(s.val / 1e6).toFixed(2)} ล.ไร่)</span></div>
        <div class="tt-row"><span class="tt-k">ฤดู 2568 / ฤดู 2567</span><span class="tt-v">${(s.v25 / 1e6).toFixed(2)} / ${(s.v24 / 1e6).toFixed(2)} ล.ไร่</span></div>
        ${chg24 !== null ? `<div class="tt-row"><span class="tt-k">เปลี่ยนแปลงเทียบฤดู 2567</span><span class="tt-v" style="color:${chg24 <= 0 ? "#55947a" : "#df6a37"}">${chg24 >= 0 ? "+" : ""}${chg24.toFixed(1)}%</span></div>` : ""}
        <div class="tt-row"><span class="tt-k">ประมาณการปล่อย PM2.5</span><span class="tt-v">~${formatNum(pm25Est)} ตัน</span></div>
      `, s.color);
    };
    legContainer.querySelectorAll(".donut-leg-item[data-seg-idx]").forEach(el => {
      const idx = Number(el.dataset.segIdx);
      el.addEventListener("mousemove", (e) => {
        if (donutCanvas._hovIdx !== idx) {
          donutCanvas._hovIdx = idx;
          drawDonutChart(donutCanvas, segs, `${(trp26Tot / 1e6).toFixed(2)} ล.ไร่`, "ฤดู 2569");
        }
        showDonutSegTooltip(e, idx);
      });
      el.addEventListener("mouseleave", () => {
        donutCanvas._hovIdx = -1;
        drawDonutChart(donutCanvas, segs, `${(trp26Tot / 1e6).toFixed(2)} ล.ไร่`, "ฤดู 2569");
        hideTooltip();
      });
    });
    const dnEl = legContainer.querySelector(".donut-leg-item[data-daynight]");
    if (dnEl) {
      dnEl.addEventListener("mousemove", (e) => {
        const night5y = Math.max(0, tot5y - day5y);
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>เวลาที่ตรวจพบจุดความร้อน (5 ปี)</h4>
              <div class="tt-sub">เปรียบเทียบรอบโคจรดาวเทียมกลางวัน vs กลางคืน</div>
            </div>
            <span class="tt-badge">${formatNum(tot5y)} จุด</span>
          </div>
          <div class="tt-bar"><div style="background:#d4a84f;width:${dayPct.toFixed(1)}%"></div><div style="background:#689cb8;width:${(100 - dayPct).toFixed(1)}%"></div></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d4a84f"></i>รอบกลางวัน (~13:30 น.)</span><span class="tt-v">${formatNum(day5y)} จุด (${dayPct.toFixed(1)}%)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>รอบกลางคืน (~01:30 น.)</span><span class="tt-v">${formatNum(night5y)} จุด (${(100 - dayPct).toFixed(1)}%)</span></div>
        `);
      });
      dnEl.addEventListener("mouseleave", hideTooltip);
    }
    donutCanvas._showSegTooltip = showDonutSegTooltip;

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
        row.addEventListener("mousemove", (e) => {
          const p = it.p;
          const ag = provAgri.get(p.code) || 0;
          const fo = provFor.get(p.code) || 0;
          const ap = it.cnt > 0 ? (ag * 100 / it.cnt).toFixed(1) : "0.0";
          const fp = it.cnt > 0 ? (fo * 100 / it.cnt).toFixed(1) : "0.0";
          const t26 = p.trp?.["2026"];
          const trp26V = t26 ? (t26[0] + t26[1] + t26[2] + t26[3] + t26[4]) : null;
          const fwi26 = p.wx_y?.["2026"]?.peak_fwi ?? null;
          const pm26 = p.aq_y?.["2026"]?.pm25_peak ?? null;
          showTooltip(e.clientX, e.clientY, `
            <div class="tt-head">
              <div>
                <h4>อันดับ #${idx + 1} จ.${escHtml(p.name_th)}</h4>
                <div class="tt-sub">${escHtml(REGION_TH[p.region] || p.region || "-")} · คิดเป็น ${tot5y > 0 ? (it.cnt * 100 / tot5y).toFixed(1) : "0"}% ของประเทศ</div>
              </div>
              <span class="tt-badge">${formatNum(it.cnt)} จุด</span>
            </div>
            <div class="tt-bar"><div style="background:#d48942;width:${ap}%"></div><div style="background:#55947a;width:${fp}%"></div></div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร+ส.ป.ก. / ป่าไม้</span><span class="tt-v">${ap}% / ${fp}%</span></div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#c96f53"></i>รอยเผา สสน. ฤดู 2569</span><span class="tt-v">${trp26V !== null ? formatNum(trp26V, 0) + " ไร่" : "ไม่มีข้อมูล"}</span></div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>FWI หน้าแล้ง · PM2.5</span><span class="tt-v">${fwi26 !== null ? fwi26.toFixed(1) + "/100" : "-"} · ${pm26 !== null ? pm26.toFixed(1) + " µg/m³" : "-"}</span></div>
            <div class="tt-foot">คลิกเพื่อเปิดดู จ.${escHtml(p.name_th)} บนแผนที่เจาะลึก</div>
          `);
        });
        row.addEventListener("mouseleave", hideTooltip);
        topEl.appendChild(row);
      });
    } else {
      const topVils = DATA.villages.slice().sort((a, b) => (satOnlyN ? b.n - a.n : b.all - a.all)).slice(0, 10);
      const mx = (satOnlyN ? topVils[0]?.n : topVils[0]?.all) || 1;
      topVils.forEach((v, idx) => {
        const cnt = satOnlyN ? v.n : v.all;
        const ag = satOnlyN ? v.agri_n : v.agri_all;
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
        row.addEventListener("mousemove", (e) => {
          const ap = cnt > 0 ? (ag * 100 / cnt).toFixed(0) : "0";
          showTooltip(e.clientX, e.clientY, `
            <div class="tt-head">
              <div>
                <h4>#${idx + 1} ${escHtml(v.name)}${v.moo ? " หมู่ " + escHtml(v.moo) : ""}</h4>
                <div class="tt-sub">ต.${escHtml(v.tambon)} · อ.${escHtml(v.amphoe)} · จ.${escHtml(v.prov)}</div>
              </div>
              <span class="tt-badge">${formatNum(cnt)} จุด</span>
            </div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>ในเขตเกษตร + ส.ป.ก.</span><span class="tt-v">${formatNum(ag)} จุด (${ap}%)</span></div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#55947a"></i>ในเขตป่าไม้/อื่น ๆ</span><span class="tt-v">${formatNum(Math.max(0, cnt - ag))} จุด</span></div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>ระยะห่างจุดไฟเฉลี่ย</span><span class="tt-v">${v.dist_km !== null ? v.dist_km.toFixed(2) + " กม." : "-"}</span></div>
            <div class="tt-foot">คลิกเพื่อซูมแผนที่ไปที่ จ.${escHtml(v.prov)}</div>
          `);
        });
        row.addEventListener("mouseleave", hideTooltip);
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
    const hovIdx = typeof canvas._hovIdx === "number" ? canvas._hovIdx : -1;
    const arcRanges = [];
    segs.forEach((s, idx) => {
      const da = (s.val / sum) * Math.PI * 2;
      if (da <= 0) return;
      const isHov = idx === hovIdx;
      const ro = isHov ? rOut + 4 : rOut;
      const ri = isHov ? rIn - 2 : rIn;
      ctx.beginPath();
      ctx.arc(cx, cy, ro, ang, ang + da);
      ctx.arc(cx, cy, ri, ang + da, ang, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = isHov ? 2.5 : 2;
      ctx.strokeStyle = isHov ? "#fde047" : sepCol;
      ctx.stroke();
      arcRanges.push({ idx, a0: ang, a1: ang + da });
      ang += da;
    });
    const hovSeg = hovIdx >= 0 && segs[hovIdx] ? segs[hovIdx] : null;
    ctx.textAlign = "center";
    ctx.fillStyle = hovSeg ? hovSeg.color : (state.theme === "dark" ? "#f8fafc" : "#0f172a");
    ctx.font = "800 16.5px system-ui, sans-serif";
    ctx.fillText(hovSeg ? `${(hovSeg.val / 1e6).toFixed(2)} ล.ไร่` : centerTop, cx, cy - 2);
    ctx.fillStyle = state.theme === "dark" ? "#94a3b8" : "#475569";
    ctx.font = "600 11.5px system-ui, sans-serif";
    ctx.fillText(hovSeg ? `${hovSeg.label} (${(hovSeg.val * 100 / sum).toFixed(1)}%)` : centerSub, cx, cy + 16);

    canvas._donutMeta = { cx, cy, rIn: rIn - 6, rOut: rOut + 8, arcRanges, segs, centerTop, centerSub };
    if (!canvas._donutBound) {
      canvas._donutBound = true;
      canvas.addEventListener("mousemove", (e) => {
        const dm = canvas._donutMeta;
        if (!dm) return;
        const r = canvas.getBoundingClientRect();
        const dx = e.clientX - r.left - dm.cx;
        const dy = e.clientY - r.top - dm.cy;
        const dist = Math.hypot(dx, dy);
        let found = -1;
        if (dist >= dm.rIn && dist <= dm.rOut) {
          let a = Math.atan2(dy, dx);
          if (a < -Math.PI / 2) a += Math.PI * 2;
          for (const ar of dm.arcRanges) {
            if (a >= ar.a0 && a <= ar.a1) { found = ar.idx; break; }
          }
        }
        if (found !== canvas._hovIdx) {
          canvas._hovIdx = found;
          drawDonutChart(canvas, dm.segs, dm.centerTop, dm.centerSub);
        }
        if (found >= 0 && canvas._showSegTooltip) {
          canvas._showSegTooltip(e, found);
        } else {
          hideTooltip();
        }
      });
      canvas.addEventListener("mouseleave", () => {
        const dm = canvas._donutMeta;
        if (canvas._hovIdx !== -1 && dm) {
          canvas._hovIdx = -1;
          drawDonutChart(canvas, dm.segs, dm.centerTop, dm.centerSub);
        }
        hideTooltip();
      });
    }
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
      card.addEventListener("mousemove", (e) => {
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>${escHtml(label)} (${escHtml(d.time[i])})</h4>
              <div class="tt-sub">พยากรณ์อากาศเอื้อไฟ · จ.${escHtml(provObj.name_th)}</div>
            </div>
            <span class="tt-badge" style="color:${barCol};border-color:${barCol}55;background:${barCol}1f;">FWI ${score}/100 · ${tier}</span>
          </div>
          <div class="tt-bar"><div style="background:${barCol};width:${Math.max(6, Math.min(100, score))}%"></div></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#df6a37"></i>ความร้อนสูงสุด / ต่ำสุด (30%)</span><span class="tt-v">${tmax !== null ? tmax.toFixed(1) : "-"}° / ${tmin !== null ? tmin.toFixed(1) : "-"}°C (${Math.round(tS * 30)}/30)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d4a84f"></i>ความชื้นสัมพัทธ์ต่ำสุด (30%)</span><span class="tt-v">${rh.toFixed(0)}% (${Math.round(rhS * 30)}/30)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>ปริมาณฝนพยากรณ์ (20%)</span><span class="tt-v">${rain.toFixed(1)} มม. (${Math.round(dryS * 20)}/20)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#a855f7"></i>การระเหยน้ำ ET0 (10%)</span><span class="tt-v">${et0.toFixed(1)} มม./วัน (${Math.round(eS * 10)}/10)</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#55947a"></i>ลมกระโชกสูงสุด 10 ม. (10%)</span><span class="tt-v">${wind.toFixed(1)} กม./ชม. (${Math.round(wS * 10)}/10)</span></div>
        `, barCol);
      });
      card.addEventListener("mouseleave", hideTooltip);
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
    const sFwi = matMode === "fwi" ? series : getMonthlySeries(pCode, satMode, 8);
    const sTmax = matMode === "tmax" ? series : getMonthlySeries(pCode, satMode, 0);
    const sRh = matMode === "rhmin" ? series : getMonthlySeries(pCode, satMode, 3);
    const sRain = matMode === "rain" ? series : getMonthlySeries(pCode, satMode, 2);

    const grid = {};
    const detailByYm = {};
    const vals = [];
    for (let i = 0; i < series.months.length; i++) {
      const ym = series.months[i];
      const v = matMode === "fire" ? series.fireTot[i] : series.wxVals[i];
      grid[ym] = v;
      detailByYm[ym] = {
        fireTot: series.fireTot[i],
        fireAgri: series.fireAgri[i],
        fireFor: series.fireFor[i],
        fwi: sFwi.wxVals[i],
        tmax: sTmax.wxVals[i],
        rhmin: sRh.wxVals[i],
        rain: sRain.wxVals[i],
      };
      if (v !== null && v !== undefined) vals.push(v);
    }
    const minV = vals.length ? Math.min(...vals) : 0;
    const maxV = vals.length ? Math.max(...vals) : 1;
    const span = Math.max(1e-6, maxV - minV);
    const modeNames = {
      fwi: { label: "ดัชนีอากาศเอื้อไฟ FWI", unit: "/ 100" },
      fire: { label: "จุดความร้อนรายเดือน", unit: "จุด" },
      tmax: { label: "อุณหภูมิสูงสุดเฉลี่ย", unit: "°C" },
      rhmin: { label: "ความชื้นสัมพัทธ์ต่ำสุด", unit: "%" },
      rain: { label: "ปริมาณฝนรวมรายเดือน", unit: "มม." },
    };
    const scopeName = pCode === "all" ? "ค่าเฉลี่ยทั้งประเทศ (77 จังหวัด)" : `จ.${PROV_MAP.get(pCode)?.name_th || pCode}`;

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
          ? "#991b1b"
          : t > 0.56
            ? "#ea580c"
            : t > 0.32
              ? (isDark ? "rgba(250, 204, 21, 0.34)" : "#fde047")
              : (isDark ? "rgba(254, 243, 199, 0.11)" : "#fef3c7");
        const fg = t > 0.56
          ? "#ffffff"
          : t > 0.32
            ? (isDark ? "#fef08a" : "#713f12")
            : (isDark ? "#cbd5e1" : "#78350f");
        const txt = matMode === "fire" ? (v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v)) : (matMode === "rain" ? Math.round(v) : v.toFixed(0));
        html += `<td class="matrix-cell" data-ym="${ym}" data-t="${t.toFixed(3)}" style="background:${bg};color:${fg};cursor:pointer;">${txt}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    wrap.innerHTML = html;

    const mMeta = modeNames[matMode] || modeNames.fwi;
    wrap.querySelectorAll(".matrix-cell[data-ym]").forEach(td => {
      td.addEventListener("mousemove", (e) => {
        const ym = td.dataset.ym;
        const t = Number(td.dataset.t || 0);
        const info = detailByYm[ym];
        if (!info) return;
        const moNum = Number(ym.slice(5, 7));
        const yrNum = Number(ym.slice(0, 4));
        const moLabel = `${MONTH_TH_SHORT[moNum - 1]} ${yrNum} (พ.ศ. ${yrNum + 543})`;
        const [riskTxt, riskCol] = t > 0.78
          ? ["ระดับวิกฤต", "#cf5648"]
          : t > 0.56
            ? ["ระดับสูง", "#df6a37"]
            : t > 0.34
              ? ["ปานกลาง", "#d4a84f"]
              : ["ระดับต่ำ", "#55947a"];
        const agPct = info.fireTot > 0 ? (info.fireAgri * 100 / info.fireTot).toFixed(0) : "0";
        const foPct = info.fireTot > 0 ? (info.fireFor * 100 / info.fireTot).toFixed(0) : "0";
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>${escHtml(moLabel)}</h4>
              <div class="tt-sub">${escHtml(scopeName)} · ${escHtml(mMeta.label)}</div>
            </div>
            <span class="tt-badge" style="color:${riskCol};border-color:${riskCol}55;background:${riskCol}1f;">${riskTxt}</span>
          </div>
          <div class="tt-bar"><div style="background:${riskCol};width:${Math.max(6, Math.round(t * 100))}%"></div></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#df6a37"></i>จุดความร้อนรวม</span><span class="tt-v">${formatNum(info.fireTot)} จุด</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d48942"></i>เกษตร+ส.ป.ก. / ป่าไม้</span><span class="tt-v">${formatNum(info.fireAgri)} (${agPct}%) / ${formatNum(info.fireFor)} (${foPct}%)</span></div>
          <div class="tt-divider"></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#eab308"></i>ดัชนีอากาศเอื้อไฟ FWI</span><span class="tt-v">${info.fwi !== null ? info.fwi.toFixed(1) + " / 100" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#f97316"></i>อุณหภูมิสูงสุดเฉลี่ย (Tmax)</span><span class="tt-v">${info.tmax !== null ? info.tmax.toFixed(1) + " °C" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#38bdf8"></i>ความชื้นสัมพัทธ์ต่ำสุด (RH)</span><span class="tt-v">${info.rhmin !== null ? info.rhmin.toFixed(1) + " %" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>ปริมาณฝนรวมทั้งเดือน</span><span class="tt-v">${info.rain !== null ? formatNum(Math.round(info.rain)) + " มม." : "-"}</span></div>
        `, riskCol);
      });
      td.addEventListener("mouseleave", hideTooltip);
    });
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
    const baseRain10 = rows.filter(r => r.year <= 2025 && r.rain !== null);
    const avgRain10 = baseRain10.length ? baseRain10.reduce((a, r) => a + r.rain, 0) / baseRain10.length : 1200;
    const sub = document.getElementById("wxBaselineSub");
    if (sub) sub.textContent = `ค่าปกติ Tmax 10 ปี (2016–2025): ${avgT10.toFixed(2)}°C (เส้นประสีเหลือง) · แท่งสีฟ้า = ฝนรวม (มม.) · ปี 2026 นับถึง 15 พ.ย.`;

    const pad = { l: 44, r: 44, t: 16, b: 28 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const maxR = Math.max(500, ...rows.map(r => r.rain || 0));
    const validT = rows.map(r => r.tmax).filter(v => v !== null);
    const minT = Math.floor((validT.length ? Math.min(...validT) : 30) - 0.8);
    const maxT = Math.ceil((validT.length ? Math.max(...validT) : 36) + 0.8);
    const spanT = Math.max(1, maxT - minT);

    const isDark = state.theme === "dark";
    const textCol = isDark ? "#94a3b8" : "#475569";
    const step = pw / rows.length;
    const bw = step * 0.52;
    const hovIdx = typeof canvas._hovIdx === "number" ? canvas._hovIdx : -1;

    // Rain bars (muted slate-blue) + hover highlight
    rows.forEach((r, i) => {
      const cx = pad.l + (i + 0.5) * step;
      const isHov = i === hovIdx;
      if (isHov) {
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
        ctx.fillRect(pad.l + i * step, pad.t, step, ph);
      }
      if (r.rain !== null) {
        const bh = (r.rain / maxR) * ph;
        ctx.fillStyle = isHov ? "rgba(104,156,184,0.82)" : (r.year === 2026 ? "rgba(104,156,184,0.32)" : "rgba(104,156,184,0.52)");
        ctx.fillRect(cx - bw / 2, pad.t + ph - bh, bw, bh);
      }
      ctx.fillStyle = isHov ? (isDark ? "#f8fafc" : "#0f172a") : textCol;
      ctx.font = isHov ? "700 10.5px system-ui" : "10px system-ui";
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
      const isHov = i === hovIdx;
      if (isHov) {
        ctx.fillStyle = "rgba(223,106,55,0.28)";
        ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = isHov ? "#fde047" : (r.tmax > avgT10 ? "#df6a37" : "#689cb8");
      ctx.beginPath(); ctx.arc(cx, cy, isHov ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
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

    canvas._baseHover = { pad, step, rows, avgT10, avgRain10, pCode };
    if (!canvas._baseBound) {
      canvas._baseBound = true;
      canvas.addEventListener("mousemove", (e) => {
        const bh = canvas._baseHover;
        if (!bh) return;
        const r = canvas.getBoundingClientRect();
        const idx = Math.floor((e.clientX - r.left - bh.pad.l) / bh.step);
        if (idx < 0 || idx >= bh.rows.length) {
          if (canvas._hovIdx !== -1) { canvas._hovIdx = -1; drawTenYearBaseline(bh.pCode); }
          hideTooltip();
          return;
        }
        if (canvas._hovIdx !== idx) {
          canvas._hovIdx = idx;
          drawTenYearBaseline(bh.pCode);
        }
        const row = bh.rows[idx];
        const diff = row.tmax !== null ? (row.tmax - bh.avgT10) : null;
        const rDiffPct = (row.rain !== null && bh.avgRain10 > 0) ? ((row.rain - bh.avgRain10) * 100 / bh.avgRain10) : null;
        const badgeCol = diff !== null && diff > 0 ? "#df6a37" : "#38bdf8";
        const scopeTxt = bh.pCode === "all" ? "ค่าเฉลี่ย 77 จังหวัด" : `จ.${PROV_MAP.get(bh.pCode)?.name_th || bh.pCode}`;
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>ปี ${row.year} (พ.ศ. ${row.year + 543})${row.year === 2026 ? " · ถึง 15 พ.ย." : ""}</h4>
              <div class="tt-sub">${escHtml(scopeTxt)} · แนวโน้มภูมิอากาศ 10 ปี</div>
            </div>
            <span class="tt-badge" style="color:${badgeCol};border-color:${badgeCol}55;background:${badgeCol}1f;">${diff !== null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} °C` : "-"}</span>
          </div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#df6a37"></i>อุณหภูมิสูงสุดเฉลี่ย (Tmax)</span><span class="tt-v">${row.tmax !== null ? row.tmax.toFixed(2) + " °C" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#c49c4d"></i>ค่าปกติ 10 ปี (2016–2025)</span><span class="tt-v">${bh.avgT10.toFixed(2)} °C</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${badgeCol}"></i>ส่วนต่างอุณหภูมิ</span><span class="tt-v" style="color:${badgeCol}">${diff !== null ? (diff >= 0 ? "ร้อนกว่าปกติ +" : "เย็นกว่าปกติ ") + diff.toFixed(2) + " °C" : "-"}</span></div>
          <div class="tt-divider"></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>ปริมาณฝนรวมทั้งปี</span><span class="tt-v">${row.rain !== null ? formatNum(Math.round(row.rain)) + " มม." : "-"}</span></div>
          ${rDiffPct !== null ? `<div class="tt-row"><span class="tt-k">เทียบฝนเฉลี่ย 10 ปี (${formatNum(Math.round(bh.avgRain10))} มม.)</span><span class="tt-v">${rDiffPct >= 0 ? "+" : ""}${rDiffPct.toFixed(0)}%</span></div>` : ""}
        `, badgeCol);
      });
      canvas.addEventListener("mouseleave", () => {
        const bh = canvas._baseHover;
        if (canvas._hovIdx !== -1 && bh) {
          canvas._hovIdx = -1;
          drawTenYearBaseline(bh.pCode);
        }
        hideTooltip();
      });
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
      const isHov = canvas._hovProv === d.p.code;
      const dotCol = regColors[d.p.region] || "#689cb8";
      if (isHov) {
        ctx.save();
        ctx.fillStyle = "rgba(253, 224, 71, 0.25)";
        ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = isHov ? "#fde047" : (isSel ? "#eceff4" : dotCol);
      ctx.strokeStyle = isHov || isSel ? "#df6a37" : "rgba(15,23,42,0.6)";
      ctx.lineWidth = isHov || isSel ? 2.4 : 1;
      ctx.beginPath(); ctx.arc(cx, cy, isHov ? 7 : (isSel ? 6.5 : 4.5), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (isHov || isSel || topLabelSet.has(d.p.code)) {
        ctx.fillStyle = isDark ? "#f1f5f9" : "#0f172a";
        ctx.font = (isHov ? "700 " : "600 ") + "10.5px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(d.p.name_th, cx + 7, cy + 3);
      }
      wxScatDots.push({ cx, cy, col: dotCol, ...d });
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
        let best = null, bd = 13;
        for (const d of wxScatDots) {
          const dist = Math.hypot(d.cx - x, d.cy - y);
          if (dist < bd) { bd = dist; best = d; }
        }
        const nextCode = best ? best.p.code : null;
        if (nextCode !== canvas._hovProv) {
          canvas._hovProv = nextCode;
          drawWxProvinceScatter();
        }
        if (best) {
          const p = best.p;
          const xSel = document.getElementById("wxScatX");
          const ySel = document.getElementById("wxScatY");
          const xLabel = (xSel?.selectedOptions?.[0]?.textContent || "แกน X").replace(/^แกน X:\s*/, "");
          const yLabel = (ySel?.selectedOptions?.[0]?.textContent || "แกน Y").replace(/^แกน Y:\s*/, "");
          const yKeyCur = ySel?.value || "fire_2026";
          const xKeyCur = xSel?.value || "peak_fwi";
          const xDec = (xKeyCur === "flood" || xKeyCur === "low_rh_35" || xKeyCur === "dry_days") ? 0 : 1;
          const yDec = yKeyCur === "density" ? 1 : 0;
          const w26 = p.wx_y?.["2026"] || {};
          const t26 = p.trp?.["2026"];
          const trp26V = t26 ? (t26[0] + t26[1] + t26[2] + t26[3] + t26[4]) : null;
          const pm26 = p.aq_y?.["2026"]?.pm25_peak ?? null;
          const regName = REGION_TH[p.region] || p.region || "-";
          showTooltip(e.clientX, e.clientY, `
            <div class="tt-head">
              <div>
                <h4 style="color:${best.col}">จ.${escHtml(p.name_th)}</h4>
                <div class="tt-sub">${escHtml(regName)} · เปรียบเทียบความเสี่ยงรายจังหวัด</div>
              </div>
              <span class="tt-badge" style="color:${best.col};border-color:${best.col}55;background:${best.col}1f;">${escHtml(regName)}</span>
            </div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>${escHtml(xLabel)}</span><span class="tt-v">${formatNum(best.x, xDec)}</span></div>
            <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:var(--accent)"></i>${escHtml(yLabel)}</span><span class="tt-v">${formatNum(best.y, yDec)}</span></div>
            <div class="tt-divider"></div>
            <div class="tt-row"><span class="tt-k">Tmax · ความชื้นต่ำสุด (2026)</span><span class="tt-v">${w26.tmax != null ? w26.tmax + "°C" : "-"} · RH ${w26.rh_min != null ? w26.rh_min + "%" : "-"}</span></div>
            <div class="tt-row"><span class="tt-k">รอยเผา สสน. ฤดู 2569</span><span class="tt-v">${trp26V !== null ? formatNum(trp26V, 0) + " ไร่" : "ไม่มีข้อมูล"}</span></div>
            <div class="tt-row"><span class="tt-k">ฝุ่น PM2.5 หน้าแล้ง (CAMS)</span><span class="tt-v">${pm26 !== null ? pm26.toFixed(1) + " µg/m³" : "-"}</span></div>
            <div class="tt-foot">คลิกจุดเพื่อสลับดูข้อมูลสภาพอากาศจังหวัดนี้</div>
          `, best.col);
        } else {
          hideTooltip();
        }
      });
      canvas.addEventListener("mouseleave", () => {
        if (canvas._hovProv) {
          canvas._hovProv = null;
          drawWxProvinceScatter();
        }
        hideTooltip();
      });
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
          const pal = PALETTES.fire;
          const idx = t * (pal.length - 1);
          const i0 = Math.floor(idx), i1 = Math.min(pal.length - 1, i0 + 1);
          ctx.fillStyle = lerpHex(pal[i0], pal[i1], idx - i0);
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
        ctx.beginPath();
        for (const ring of bsMap.hoverItem._mRings) traceRingF32(ctx, ring, toSx, toSy);
        ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
        ctx.lineWidth = 3.8;
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.0;
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
    function buildBsItemTooltip(item, prefix) {
      const title = (prefix || "") + item.name_th;
      if (item.trp === null || item.trp === undefined) {
        return `
          <div class="tt-head">
            <div>
              <h4>${escHtml(title)}</h4>
              <div class="tt-sub">อยู่นอกขอบเขตข้อมูล สสน. ตามรอยเผา (62 จังหวัด)</div>
            </div>
            <span class="tt-badge">ไม่มีข้อมูล</span>
          </div>
          <div class="tt-row"><span class="tt-k">หมายเหตุ</span><span class="tt-v">คงค่าว่าง (ไม่ตีความเป็น 0)</span></div>
        `;
      }
      const sumArr = (a) => a ? (a[0] + a[1] + a[2] + a[3] + a[4]) : 0;
      const t67 = sumArr(item.trp["2024"]);
      const t68 = sumArr(item.trp["2025"]);
      const a69 = item.trp["2026"] || [0, 0, 0, 0, 0];
      const t69 = sumArr(a69);
      const chg = t67 > 0 ? ((t69 - t67) * 100 / t67) : null;
      const cols = ["#d4a84f", "#c96f53", "#7d9b65", "#8b8579", "#a84438"];
      const barSegs = t69 > 0 ? a69.map((v, k) => `<div style="background:${cols[k]};width:${(v * 100 / t69).toFixed(1)}%"></div>`).join("") : "";
      return `
        <div class="tt-head">
          <div>
            <h4>${escHtml(title)}</h4>
            <div class="tt-sub">รอยเผาไหม้ Sentinel-2 20 ม. (สสน.)</div>
          </div>
          <span class="tt-badge">${formatNum(t69, 0)} ไร่</span>
        </div>
        <div class="tt-bar">${barSegs}</div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d4a84f"></i>นาข้าว (ฤดู 2569)</span><span class="tt-v">${formatNum(a69[0], 0)} ไร่</span></div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#c96f53"></i>อ้อย</span><span class="tt-v">${formatNum(a69[1], 0)} ไร่</span></div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#7d9b65"></i>ข้าวโพด</span><span class="tt-v">${formatNum(a69[2], 0)} ไร่</span></div>
        <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#a84438"></i>ป่าไม้</span><span class="tt-v">${formatNum(a69[4], 0)} ไร่</span></div>
        <div class="tt-divider"></div>
        <div class="tt-row"><span class="tt-k">ย้อนหลัง ฤดู 67 → 68 → 69</span><span class="tt-v">${formatNum(t67, 0)} → ${formatNum(t68, 0)} → ${formatNum(t69, 0)}</span></div>
        ${chg !== null ? `<div class="tt-row"><span class="tt-k">เปลี่ยนแปลง 69 เทียบ 67</span><span class="tt-v" style="color:${chg <= 0 ? "#55947a" : "#df6a37"}">${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</span></div>` : ""}
      `;
    }
    function processBsHover() {
      hoverPending = false;
      if (!lastEvt || dragging || swiping || activePage !== "burnscar") return;
      const hit = hitTestBsArea(lastEvt.clientX, lastEvt.clientY);
      const nextCode = hit ? (hit.prefix + hit.item.code) : null;
      if (nextCode !== bsMap.lastHoverCode) {
        bsMap.lastHoverCode = nextCode;
        bsMap.hoverItem = hit ? hit.item : null;
        if (hit) {
          updateBsAreaReadout(hit.item, hit.prefix);
          showTooltip(lastEvt.clientX, lastEvt.clientY, buildBsItemTooltip(hit.item, hit.prefix));
        } else {
          const cur = bsMap.focusAmp ? AMP_MAP.get(bsMap.focusAmp) : (bsMap.focusProv ? PROV_MAP.get(bsMap.focusProv) : null);
          updateBsAreaReadout(cur, bsMap.focusAmp ? "อ." : "จ.");
          hideTooltip();
        }
        requestDrawBsMap();
      } else if (hit) {
        positionTooltip(lastEvt.clientX, lastEvt.clientY);
      }
    }
    canvas.addEventListener("mousemove", (e) => {
      if (swiping) return;
      if (dragging) {
        hideTooltip();
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
      hideTooltip();
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
    const names = ["นาข้าว", "อ้อย", "ข้าวโพด", "พืชผสม", "ป่าไม้"];
    const shortNames = ["ข้าว", "อ้อย", "ข้าวโพด", "ผสม", "ป่าไม้"];
    const isDark = state.theme === "dark";
    const textCol = isDark ? "#94a3b8" : "#475569";

    const step = pw / seasons.length;
    const bw = Math.min(82, step * 0.46);
    const hovIdx = typeof canvas._hovIdx === "number" ? canvas._hovIdx : -1;
    seasons.forEach((s, idx) => {
      const cx = pad.l + (idx + 0.5) * step;
      const isHov = idx === hovIdx;
      if (isHov) {
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.05)";
        ctx.fillRect(pad.l + idx * step, pad.t - 10, step, ph + 14);
      }
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
      if (isHov && tot > 0) {
        const totH = (tot / maxV) * ph;
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.8;
        ctx.strokeRect(cx - bw / 2 - 0.5, pad.t + ph - totH, bw + 1, totH);
      }
      ctx.fillStyle = isDark ? "#f8fafc" : "#0f172a";
      ctx.font = "700 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${(tot / 1e6).toFixed(2)} ล.ไร่`, cx, y - 6);
      ctx.fillStyle = isHov ? (isDark ? "#f8fafc" : "#0f172a") : textCol;
      ctx.font = (isHov ? "700 " : "600 ") + "11px system-ui";
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
      ctx.fillStyle = textCol; ctx.fillText(shortNames[k], lx + 12, 13);
      lx += lStep;
    }

    canvas._bsSeasonMeta = { pad, step, seasons, colors, names };
    if (!canvas._bsSeasonBound) {
      canvas._bsSeasonBound = true;
      canvas.addEventListener("mousemove", (e) => {
        const m = canvas._bsSeasonMeta;
        if (!m) return;
        const r = canvas.getBoundingClientRect();
        const idx = Math.floor((e.clientX - r.left - m.pad.l) / m.step);
        if (idx < 0 || idx >= m.seasons.length) {
          if (canvas._hovIdx !== -1) { canvas._hovIdx = -1; drawSeasonBurnChart(canvas, m.seasons); }
          hideTooltip();
          return;
        }
        if (canvas._hovIdx !== idx) {
          canvas._hovIdx = idx;
          drawSeasonBurnChart(canvas, m.seasons);
        }
        const s = m.seasons[idx];
        const s0 = m.seasons[0];
        const tot = s.sums.reduce((a, b) => a + b, 0) || 1;
        const tot0 = s0.sums.reduce((a, b) => a + b, 0) || 1;
        const chg = idx > 0 ? ((tot - tot0) * 100 / tot0) : null;
        const barHtml = s.sums.map((v, k) => `<div style="background:${m.colors[k]};width:${(v * 100 / tot).toFixed(1)}%"></div>`).join("");
        const rowsHtml = s.sums.map((v, k) => {
          const pct = (v * 100 / tot).toFixed(1);
          return `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${m.colors[k]}"></i>${escHtml(m.names[k])}</span><span class="tt-v">${formatNum(v, 0)} ไร่ (${pct}%)</span></div>`;
        }).join("");
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>${escHtml(s.label)}</h4>
              <div class="tt-sub">รอยเผา Sentinel-2 20 ม. (62 จังหวัด)</div>
            </div>
            <span class="tt-badge">${(tot / 1e6).toFixed(2)} ล.ไร่</span>
          </div>
          <div class="tt-bar">${barHtml}</div>
          ${rowsHtml}
          ${chg !== null ? `<div class="tt-divider"></div><div class="tt-row"><span class="tt-k">เทียบฤดู 2567</span><span class="tt-v" style="color:${chg <= 0 ? "#55947a" : "#df6a37"}">${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</span></div>` : ""}
        `);
      });
      canvas.addEventListener("mouseleave", () => {
        const m = canvas._bsSeasonMeta;
        if (canvas._hovIdx !== -1 && m) {
          canvas._hovIdx = -1;
          drawSeasonBurnChart(canvas, m.seasons);
        }
        hideTooltip();
      });
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
      tr.addEventListener("mousemove", (e) => {
        const p = PROV_MAP.get(tr.dataset.pcode);
        if (!p) return;
        const sumA = (a) => a ? (a[0] + a[1] + a[2] + a[3] + a[4]) : null;
        const t67 = p.trp ? sumA(p.trp["2024"]) : null;
        const t68 = p.trp ? sumA(p.trp["2025"]) : null;
        const a69 = p.trp?.["2026"];
        const t69 = p.trp ? sumA(a69) : null;
        const cols = ["#d4a84f", "#c96f53", "#7d9b65", "#8b8579", "#a84438"];
        const barHtml = (a69 && t69 > 0) ? `<div class="tt-bar">${a69.map((v, k) => `<div style="background:${cols[k]};width:${(v * 100 / t69).toFixed(1)}%"></div>`).join("")}</div>` : "";
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>จ.${escHtml(p.name_th)}</h4>
              <div class="tt-sub">${escHtml(REGION_TH[p.region] || p.region || "-")}</div>
            </div>
            <span class="tt-badge">${t69 !== null ? formatNum(t69, 0) + " ไร่" : "นอกเขต สสน."}</span>
          </div>
          ${barHtml}
          <div class="tt-row"><span class="tt-k">รอยเผา 3 ฤดู (67 → 68 → 69)</span><span class="tt-v">${t69 !== null ? `${formatNum(t67, 0)} → ${formatNum(t68, 0)} → ${formatNum(t69, 0)}` : "ไม่มีข้อมูล"}</span></div>
          ${a69 ? `<div class="tt-row"><span class="tt-k">ข้าว · อ้อย · ข้าวโพด (69)</span><span class="tt-v">${formatNum(a69[0], 0)} · ${formatNum(a69[1], 0)} · ${formatNum(a69[2], 0)} ไร่</span></div>
          <div class="tt-row"><span class="tt-k">ป่าไม้ (69)</span><span class="tt-v">${formatNum(a69[4], 0)} ไร่</span></div>` : ""}
          <div class="tt-foot">คลิกแถวเพื่อบินไปซูมดูแปลงเผา 20 ม. บนแผนที่ด้านบน</div>
        `);
      });
      tr.addEventListener("mouseleave", hideTooltip);
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

    ["hzProvSelect","hzMetricSelect","hzSatSelect"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", renderHazeDualLab);
    });
    document.getElementById("hzTransYearSel")?.addEventListener("change", renderTransboundarySection);
    ["hzBurnSeasonSel","hzBurnCropSel"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", renderBurnIntensityAndEmissions);
    });
    document.getElementById("hzBurnSearch")?.addEventListener("input", renderBurnIntensityAndEmissions);
    document.getElementById("hzRefreshBtn")?.addEventListener("click", () => loadLiveHazeData(true));
    document.getElementById("hzLiveProvSel")?.addEventListener("change", (e) => {
      if (e.target.value) inspectLiveHazeProv(e.target.value);
    });
    document.getElementById("hzJumpMapBtn")?.addEventListener("click", () => {
      state.metric = "aq_pm25";
      if (els.metricSelect) els.metricSelect.value = "aq_pm25";
      switchPage("map");
      requestAnimationFrame(() => refreshAll());
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
      if (["overview","map","weather","haze","burnscar","explorer"].includes(h) && h !== activePage) {
        switchPage(h, { updateHash: false });
      }
    });
  }

  // ===== Page 6: Live Haze, Transboundary 6 ASEAN, Burn Rate & RID Water =====
  const HAZE_METRICS_META = {
    aq_pm25: { name: "PM2.5 เฉลี่ย (CAMS)", unit: "µg/m³", src: "aq", idx: 0 },
    aq_pm25_max: { name: "PM2.5 สูงสุดในเดือน", unit: "µg/m³", src: "aq", idx: 1 },
    aq_exceed: { name: "วันฝุ่นเกิน 37.5 µg/m³", unit: "วัน", src: "aq", idx: 4 },
    aq_co: { name: "ก๊าซ CO จากการเผา", unit: "µg/m³", src: "aq", idx: 2 },
    aq_aod: { name: "ความหนาควัน AOD", unit: "AOD", src: "aq", idx: 3 },
    soil_wet: { name: "ความชื้นผิวดิน NASA", unit: "(0–1)", src: "soil", idx: 0 },
  };
  const COUNTRY_TH = {
    Myanmar: { label: "เมียนมา", color: "#cf5648", note: "เพื่อนบ้าน" },
    Lao_PDR: { label: "สปป.ลาว", color: "#d48942", note: "เพื่อนบ้าน" },
    Thailand: { label: "ไทย", color: "#689cb8", note: "ประเทศไทย" },
    Cambodia: { label: "กัมพูชา", color: "#c49c4d", note: "เพื่อนบ้าน" },
    Vietnam: { label: "เวียดนาม", color: "#55947a", note: "เพื่อนบ้าน" },
    Malaysia: { label: "มาเลเซีย", color: "#8e82a8", note: "เพื่อนบ้าน" },
  };
  const hzHoverStore = {};
  let liveHazeProvRows = null;
  let selectedLiveHazeProv = null;

  function populateHazeSelects() {
    if (!DATA) return;
    const sorted = DATA.provinces.slice().sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));
    const pSel = document.getElementById("hzProvSelect");
    if (pSel && pSel.options.length <= 1) {
      for (const p of sorted) {
        const opt = document.createElement("option");
        opt.value = p.code;
        opt.textContent = p.name_th;
        pSel.appendChild(opt);
      }
    }
    const lSel = document.getElementById("hzLiveProvSel");
    if (lSel && lSel.options.length === 0) {
      for (const p of sorted) {
        const opt = document.createElement("option");
        opt.value = p.code;
        opt.textContent = "ตรวจรายอำเภอ: " + p.name_th;
        lSel.appendChild(opt);
      }
      if (PROV_MAP.has("50")) lSel.value = "50";
    }
  }

  function pm25Tier(v) {
    if (v === null || v === undefined) return ["ไม่มีข้อมูล", "hz-pm-mod"];
    if (v <= 15) return ["ดีมาก (≤15)", "hz-pm-good"];
    if (v <= 25) return ["ดี (≤25)", "hz-pm-good"];
    if (v <= 37.5) return ["ปานกลาง", "hz-pm-mod"];
    if (v <= 75) return ["เริ่มกระทบสุขภาพ", "hz-pm-high"];
    return ["วิกฤต (>75)", "hz-pm-crit"];
  }

  async function loadLiveHazeData(force = false) {
    const grid = document.getElementById("hzLiveGrid");
    const sub = document.getElementById("hzLiveSub");
    const tBadge = document.getElementById("hzLiveTimeBadge");
    if (!grid || !DATA) return;
    if (!force && liveHazeProvRows) {
      renderLiveHazeGrid(liveHazeProvRows, false);
      return;
    }
    sub.textContent = "กำลังดึงค่า PM2.5 สด 77 จังหวัดจาก GISTDA เช็คฝุ่น...";
    try {
      const resp = await fetch("https://pm25.gistda.or.th/rest/getPm25byProvince");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const j = await resp.json();
      const rows = (j.data || []).map(d => ({
        code: String(d.pv_idn).padStart(2, "0"),
        name_th: d.pv_tn || PROV_MAP.get(String(d.pv_idn).padStart(2, "0"))?.name_th || "",
        pm25: d.pm25 != null ? Number(d.pm25) : null,
        pm25_24h: d.pm25Avg24hr != null ? Number(d.pm25Avg24hr) : null,
        dt: d.dt || "",
      })).filter(r => r.pm25 !== null);
      if (!rows.length) throw new Error("empty");
      liveHazeProvRows = rows;
      renderLiveHazeGrid(rows, false);
    } catch (_) {
      const fallback = DATA.provinces
        .filter(p => p.pm25_snap && p.pm25_snap.pm25 !== null)
        .map(p => ({
          code: p.code,
          name_th: p.name_th,
          pm25: p.pm25_snap.pm25,
          pm25_24h: p.pm25_snap.pm25_24h,
          dt: p.pm25_snap.dt || "",
        }));
      liveHazeProvRows = fallback;
      renderLiveHazeGrid(fallback, true);
      if (tBadge) tBadge.textContent = "แคชล่าสุด";
    }
  }

  function renderLiveHazeGrid(rows, isFallback) {
    const grid = document.getElementById("hzLiveGrid");
    const sub = document.getElementById("hzLiveSub");
    const tBadge = document.getElementById("hzLiveTimeBadge");
    if (!grid) return;
    const sorted = rows.slice().sort((a, b) => (b.pm25 || 0) - (a.pm25 || 0));
    const exceedCnt = sorted.filter(r => r.pm25 > 37.5).length;
    const avgPm = sorted.length ? (sorted.reduce((a, r) => a + r.pm25, 0) / sorted.length) : null;
    const top = sorted[0];

    document.getElementById("hzKpiExceed").textContent = `${exceedCnt} / ${sorted.length} จว.`;
    document.getElementById("hzKpiExceedSub").textContent = avgPm !== null ? `ค่าเฉลี่ยทั้งประเทศ ${avgPm.toFixed(1)} µg/m³` : "-";
    document.getElementById("hzKpiTop").textContent = top ? `${top.pm25.toFixed(1)} µg/m³` : "-";
    document.getElementById("hzKpiTopSub").textContent = top ? `จ.${top.name_th} (เฉลี่ย 24 ชม. ${top.pm25_24h != null ? top.pm25_24h.toFixed(1) : "-"})` : "-";
    const dtTxt = top?.dt ? top.dt.slice(0, 16).replace("T", " ") + " UTC" : "";
    if (tBadge) tBadge.textContent = isFallback ? "Snapshot ล่าสุด" : (dtTxt || "อัปเดตสด");
    sub.textContent = isFallback
      ? `แสดงผลจากข้อมูลบันทึก GISTDA เช็คฝุ่นล่าสุด (${dtTxt}) · คลิกจังหวัดเพื่อดูแนวโน้มรายอำเภอ`
      : `ข้อมูลสด 77 จังหวัดจาก GISTDA เช็คฝุ่น (${dtTxt}) · คลิกการ์ดจังหวัดเพื่อดูค่ารายอำเภอ + พยากรณ์ฝุ่น 5 วัน`;

    grid.innerHTML = sorted.slice(0, 15).map((r, i) => {
      const [tierTxt, tierCls] = pm25Tier(r.pm25);
      const act = selectedLiveHazeProv === r.code ? "active" : "";
      return `
        <button type="button" class="hz-prov-card ${act}" data-hz-prov="${escHtml(r.code)}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <strong style="font-size:13px;">#${i + 1} ${escHtml(r.name_th)}</strong>
            <span class="hz-pm-badge ${tierCls}">${tierTxt}</span>
          </div>
          <div style="font-size:21px;font-weight:700;font-variant-numeric:tabular-nums;">${r.pm25.toFixed(1)} <span style="font-size:11px;font-weight:500;color:var(--muted);">µg/m³</span></div>
          <div style="font-size:11px;color:var(--muted);">เฉลี่ย 24 ชม.: ${r.pm25_24h != null ? r.pm25_24h.toFixed(1) : "-"} µg/m³</div>
        </button>
      `;
    }).join("");

    grid.querySelectorAll(".hz-prov-card[data-hz-prov]").forEach(btn => {
      btn.onclick = () => inspectLiveHazeProv(btn.dataset.hzProv);
      btn.addEventListener("mousemove", (e) => {
        const code = btn.dataset.hzProv;
        const r = sorted.find(x => x.code === code);
        const p = PROV_MAP.get(code);
        if (!r) return;
        const [tierTxt] = pm25Tier(r.pm25);
        const pmCol = r.pm25 > 75 ? "#cf5648" : r.pm25 > 37.5 ? "#df6a37" : r.pm25 > 25 ? "#d4a84f" : "#55947a";
        const camsPeak = p?.aq_y?.["2026"]?.pm25_peak ?? null;
        const t26 = p?.trp?.["2026"];
        const trp26 = t26 ? (t26[0] + t26[1] + t26[2] + t26[3] + t26[4]) : null;
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>จ.${escHtml(r.name_th)}</h4>
              <div class="tt-sub">GISTDA เช็คฝุ่นสด · ${escHtml(REGION_TH[p?.region] || "")}</div>
            </div>
            <span class="tt-badge" style="color:${pmCol};border-color:${pmCol}55;background:${pmCol}1f;">${tierTxt}</span>
          </div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${pmCol}"></i>ค่าฝุ่น PM2.5 ชั่วโมงนี้</span><span class="tt-v">${r.pm25.toFixed(1)} µg/m³</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#689cb8"></i>ค่าเฉลี่ย 24 ชั่วโมง</span><span class="tt-v">${r.pm25_24h != null ? r.pm25_24h.toFixed(1) + " µg/m³" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#a855f7"></i>เฉลี่ยหน้าแล้ง 2026 (CAMS)</span><span class="tt-v">${camsPeak !== null ? camsPeak.toFixed(1) + " µg/m³" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#c96f53"></i>รอยเผา สสน. ฤดู 2569</span><span class="tt-v">${trp26 !== null ? formatNum(trp26, 0) + " ไร่" : "ไม่มีข้อมูล"}</span></div>
          <div class="tt-foot">คลิกการ์ดเพื่อดูฝุ่นรายอำเภอและพยากรณ์ล่วงหน้า 5 วัน</div>
        `, pmCol);
      });
      btn.addEventListener("mouseleave", hideTooltip);
    });
  }

  async function inspectLiveHazeProv(provCode) {
    const prov = PROV_MAP.get(provCode);
    const box = document.getElementById("hzLiveDetail");
    const lSel = document.getElementById("hzLiveProvSel");
    if (!prov || !box) return;
    selectedLiveHazeProv = provCode;
    if (lSel) lSel.value = provCode;
    document.querySelectorAll(".hz-prov-card").forEach(el => {
      el.classList.toggle("active", el.dataset.hzProv === provCode);
    });
    box.style.display = "flex";
    box.innerHTML = `<div style="font-size:12.5px;color:var(--muted);">กำลังดึงฝุ่น PM2.5 รายอำเภอของ จ.${escHtml(prov.name_th)} และพยากรณ์ 5 วันล่วงหน้า...</div>`;

    let ampHtml = "";
    try {
      const rAmp = await fetch(`https://pm25.gistda.or.th/rest/getPm25byAmphoe?pv_idn=${Number(provCode)}`);
      if (rAmp.ok) {
        const jAmp = await rAmp.json();
        const amps = (jAmp.data || []).filter(a => a.pm25 != null).sort((a, b) => b.pm25 - a.pm25).slice(0, 12);
        if (amps.length) {
          ampHtml = `<div style="font-size:12px;font-weight:700;">รายอำเภอสูงสุด จ.${escHtml(prov.name_th)} (GISTDA สด):</div>
            <div class="hz-amp-grid">${amps.map(a => {
              const [, cls] = pm25Tier(a.pm25);
              return `<div class="hz-amp-chip"><span>อ.${escHtml(a.ap_tn || "")}</span><span class="hz-pm-badge ${cls}">${Number(a.pm25).toFixed(1)}</span></div>`;
            }).join("")}</div>`;
        }
      }
    } catch (_) {}

    let fcHtml = "";
    try {
      const rFc = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${prov.lat}&longitude=${prov.lon}&hourly=pm2_5,us_aqi&forecast_days=5&timezone=Asia%2FBangkok`);
      if (rFc.ok) {
        const jFc = await rFc.json();
        const times = jFc.hourly?.time || [];
        const pms = jFc.hourly?.pm2_5 || [];
        const byDay = new Map();
        for (let i = 0; i < times.length; i++) {
          if (pms[i] == null) continue;
          const d = times[i].slice(0, 10);
          const cur = byDay.get(d) || [];
          cur.push(Number(pms[i]));
          byDay.set(d, cur);
        }
        const days = Array.from(byDay.entries()).slice(0, 5);
        if (days.length) {
          fcHtml = `<div style="font-size:12px;font-weight:700;">พยากรณ์ฝุ่น PM2.5 ล่วงหน้า 5 วัน (Open-Meteo CAMS):</div>
            <div class="hz-amp-grid">${days.map(([d, vals]) => {
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              const mx = Math.max(...vals);
              const [, cls] = pm25Tier(avg);
              return `<div class="hz-amp-chip"><span>${escHtml(d.slice(5))}</span><span class="hz-pm-badge ${cls}">เฉลี่ย ${avg.toFixed(1)} · พีค ${mx.toFixed(0)}</span></div>`;
            }).join("")}</div>`;
        }
      }
    } catch (_) {}

    if (!ampHtml && !fcHtml) {
      box.innerHTML = `<div style="font-size:12px;color:var(--muted);">ไม่สามารถเชื่อมต่อ API รายอำเภอ/พยากรณ์ฝุ่นได้ขณะนี้</div>`;
    } else {
      box.innerHTML = ampHtml + fcHtml;
    }
  }

  function getHazeMonthlySeries(provCode, satMode, metricKey) {
    const months = DATA.weather_months || [];
    const n = months.length;
    const meta = HAZE_METRICS_META[metricKey] || HAZE_METRICS_META.aq_pm25;
    const fireAgri = new Array(n).fill(0);
    const fireFor = new Array(n).fill(0);
    const fireTot = new Array(n).fill(0);
    const mSum = new Array(n).fill(0);
    const mCnt = new Array(n).fill(0);

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
      const arr = meta.src === "aq" ? p.aq_m : p.soil_m;
      if (arr) {
        for (let i = 0; i < n && i < arr.length; i++) {
          const row = arr[i];
          if (row && row[meta.idx] !== null && row[meta.idx] !== undefined) {
            mSum[i] += row[meta.idx];
            mCnt[i] += 1;
          }
        }
      }
    }
    const dec = meta.src === "soil" || metricKey === "aq_aod" ? 2 : 1;
    const wxVals = mSum.map((s, i) => mCnt[i] > 0 ? +(s / mCnt[i]).toFixed(dec) : null);
    return { months, fireTot, fireAgri, fireFor, wxVals, meta };
  }

  function renderHazeDualLab() {
    const canvas = document.getElementById("hzDualCanvas");
    if (!canvas || !DATA) return;
    const pCode = document.getElementById("hzProvSelect")?.value || "all";
    const mKey = document.getElementById("hzMetricSelect")?.value || "aq_pm25";
    const satMode = document.getElementById("hzSatSelect")?.value || "N";
    const series = getHazeMonthlySeries(pCode, satMode, mKey);

    // Pair only months where metric is non-null for Pearson r
    const xs = [], ys = [];
    for (let i = 0; i < series.months.length; i++) {
      if (series.wxVals[i] !== null) {
        xs.push(series.wxVals[i]);
        ys.push(series.fireTot[i]);
      }
    }
    const rVal = pearsonR(xs, ys);
    document.getElementById("hzCorrBadge").textContent = rVal !== null ? `Pearson r = ${rVal.toFixed(2)}` : "r = n/a";
    const ins = document.getElementById("hzInsightText");
    if (ins) {
      if (rVal !== null) {
        const dir = rVal >= 0 ? `ยิ่งจุดไฟพุ่ง ${series.meta.name} ยิ่งสูงตาม` : `ยิ่ง ${series.meta.name} ต่ำ (แห้งแล้ง) จุดความร้อนยิ่งสูงขึ้น`;
        ins.textContent = `ความสัมพันธ์รายเดือน (${xs.length} เดือนที่มีข้อมูลคู่ · r = ${rVal.toFixed(2)}): ${dir}`;
      } else {
        ins.textContent = "ไม่มีข้อมูลรายเดือนเพียงพอสำหรับคำนวณความสัมพันธ์";
      }
    }

    // Reuse drawDualFireWeatherChart with custom meta
    hzHoverStore.customMeta = { name: series.meta.name, unit: series.meta.unit, color: "#689cb8" };
    drawDualFireWeatherChart(canvas, series, "8", hzHoverStore);
    bindTimelineHover(canvas, hzHoverStore);
  }

  function renderTransboundarySection() {
    const tb = DATA?.transboundary;
    const canvas = document.getElementById("hzTransCanvas");
    const tbody = document.getElementById("hzTransTbody");
    if (!tb || !canvas || !tbody) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:18px;">ยังไม่มีข้อมูลหมอกควันข้ามแดนใน payload</td></tr>`;
      return;
    }
    const yrSel = document.getElementById("hzTransYearSel")?.value || "all";
    const order = ["Myanmar", "Lao_PDR", "Thailand", "Cambodia", "Vietnam", "Malaysia"];
    const activeCountries = order.filter(c => tb.countries[c]);
    const rows = activeCountries.map(c => {
      const yMap = tb.countries[c].yearly || {};
      const yrs = yrSel === "all" ? Object.keys(yMap) : (yMap[yrSel] ? [yrSel] : []);
      let hs = 0, high = 0, frp = 0;
      for (const y of yrs) {
        hs += yMap[y].hs || 0;
        high += yMap[y].high || 0;
        frp += yMap[y].frp || 0;
      }
      return { country: c, hs, high, frp };
    }).sort((a, b) => b.hs - a.hs);

    const grandTot = rows.reduce((a, r) => a + r.hs, 0) || 1;
    const thRow = rows.find(r => r.country === "Thailand");
    const mmRow = rows.find(r => r.country === "Myanmar");
    if (thRow) {
      document.getElementById("hzKpiTrans").textContent = `${(thRow.hs * 100 / grandTot).toFixed(1)}% ไทย`;
      document.getElementById("hzKpiTransSub").textContent = `ไทย ${formatNum(thRow.hs)} จาก ${formatNum(grandTot)} จุด (เมียนมา ${mmRow ? (mmRow.hs * 100 / grandTot).toFixed(1) + "%" : "-"})`;
    }

    tbody.innerHTML = rows.map((r, i) => {
      const meta = COUNTRY_TH[r.country] || { label: r.country, color: "#689cb8", note: "-" };
      const pct = (r.hs * 100 / grandTot).toFixed(1);
      return `
        <tr>
          <td>${i + 1}</td>
          <td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${meta.color};margin-right:6px;"></span>${escHtml(meta.label)}</td>
          <td><span class="reg-pill">${escHtml(meta.note)}</span></td>
          <td style="font-weight:700;">${formatNum(r.hs)}</td>
          <td>${pct}%</td>
          <td>${formatNum(r.high)}</td>
          <td>${formatNum(r.frp, 0)}</td>
        </tr>
      `;
    }).join("");

    // Draw stacked monthly bar chart across selected year or all 48 months (2022-2025)
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const idxs = [];
    for (let i = 0; i < tb.months.length; i++) {
      if (yrSel === "all" || tb.months[i].startsWith(yrSel + "-")) idxs.push(i);
    }
    const n = idxs.length;
    if (!n) return;
    const pad = { l: 52, r: 14, t: 28, b: 28 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const step = pw / n;
    const bw = Math.max(3, step * 0.72);
    const maxStack = Math.max(100, ...idxs.map(i => activeCountries.reduce((a, c) => a + (tb.countries[c].monthly[i] || 0), 0)));
    const isDark = state.theme === "dark";
    const textCol = isDark ? "#94a3b8" : "#475569";
    const hovJ = typeof canvas._hovJ === "number" ? canvas._hovJ : -1;

    for (let j = 0; j < n; j++) {
      const mi = idxs[j];
      const isHov = j === hovJ;
      if (isHov) {
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
        ctx.fillRect(pad.l + j * step, pad.t, step, ph);
      }
      const x = pad.l + j * step + (step - bw) / 2;
      let y = pad.t + ph;
      let colSum = 0;
      for (const c of activeCountries) {
        const val = tb.countries[c].monthly[mi] || 0;
        colSum += val;
        const bh = (val / maxStack) * ph;
        if (bh > 0) {
          ctx.fillStyle = (COUNTRY_TH[c] || { color: "#689cb8" }).color;
          ctx.fillRect(x, y - bh, bw, bh);
          y -= bh;
        }
      }
      if (isHov && colSum > 0) {
        const totH = (colSum / maxStack) * ph;
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x - 0.5, pad.t + ph - totH, bw + 1, totH);
      }
      const ym = tb.months[mi];
      if (yrSel !== "all" || ym.endsWith("-01")) {
        ctx.fillStyle = textCol;
        ctx.font = "600 10px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(yrSel === "all" ? ym.slice(0, 4) : MONTH_TH_SHORT[Number(ym.slice(5, 7)) - 1], pad.l + (j + 0.5) * step, pad.t + ph + 15);
      }
    }
    ctx.fillStyle = textCol; ctx.font = "10px system-ui"; ctx.textAlign = "right";
    ctx.fillText(formatNum(maxStack), pad.l - 6, pad.t + 8);
    ctx.fillText("0", pad.l - 6, pad.t + ph);

    let lx = pad.l;
    ctx.textAlign = "left";
    for (const c of activeCountries) {
      const m = COUNTRY_TH[c];
      ctx.fillStyle = m.color; ctx.fillRect(lx, 4, 9, 9);
      ctx.fillStyle = textCol; ctx.fillText(m.label, lx + 12, 12);
      lx += Math.max(54, Math.min(78, pw / activeCountries.length));
    }

    canvas._transMeta = { pad, step, idxs, activeCountries, tb };
    if (!canvas._transBound) {
      canvas._transBound = true;
      canvas.addEventListener("mousemove", (e) => {
        const m = canvas._transMeta;
        if (!m) return;
        const r = canvas.getBoundingClientRect();
        const j = Math.floor((e.clientX - r.left - m.pad.l) / m.step);
        if (j < 0 || j >= m.idxs.length) {
          if (canvas._hovJ !== -1) { canvas._hovJ = -1; renderTransboundarySection(); }
          hideTooltip();
          return;
        }
        if (canvas._hovJ !== j) {
          canvas._hovJ = j;
          renderTransboundarySection();
        }
        const mi = m.idxs[j];
        const ym = m.tb.months[mi];
        const moNum = Number(ym.slice(5, 7));
        const yrNum = Number(ym.slice(0, 4));
        const moTitle = `${MONTH_TH_SHORT[moNum - 1]} ${yrNum} (พ.ศ. ${yrNum + 543})`;
        const cItems = m.activeCountries.map(c => ({
          c,
          meta: COUNTRY_TH[c] || { label: c, color: "#689cb8" },
          v: m.tb.countries[c].monthly[mi] || 0,
        })).sort((a, b) => b.v - a.v);
        const mTot = cItems.reduce((a, x) => a + x.v, 0) || 1;
        const barHtml = cItems.map(x => `<div style="background:${x.meta.color};width:${(x.v * 100 / mTot).toFixed(1)}%"></div>`).join("");
        const rowsHtml = cItems.map(x => {
          const pct = (x.v * 100 / mTot).toFixed(1);
          return `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${x.meta.color}"></i>${escHtml(x.meta.label)}</span><span class="tt-v">${formatNum(x.v)} จุด (${pct}%)</span></div>`;
        }).join("");
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>${escHtml(moTitle)}</h4>
              <div class="tt-sub">จุดความร้อน VIIRS-SNPP 6 ประเทศ GMS</div>
            </div>
            <span class="tt-badge">${formatNum(mTot)} จุด</span>
          </div>
          <div class="tt-bar">${barHtml}</div>
          ${rowsHtml}
        `);
      });
      canvas.addEventListener("mouseleave", () => {
        if (canvas._hovJ !== -1) {
          canvas._hovJ = -1;
          renderTransboundarySection();
        }
        hideTooltip();
      });
    }
  }

  function renderRidWaterChart() {
    const canvas = document.getElementById("hzWaterCanvas");
    const rid = DATA?.rid_monthly;
    if (!canvas || !rid || !rid.months?.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const months = rid.months;
    const n = months.length;
    const pad = { l: 42, r: 16, t: 28, b: 28 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const step = pw / n;
    const isDark = state.theme === "dark";
    const textCol = isDark ? "#94a3b8" : "#475569";
    const hovIdx = typeof canvas._hovIdx === "number" ? canvas._hovIdx : -1;

    ctx.fillStyle = isDark ? "rgba(255,255,255,0.032)" : "rgba(15,23,42,0.035)";
    for (let i = 0; i < n; i++) {
      const mo = Number(months[i].slice(5, 7));
      if (mo >= 1 && mo <= 4) ctx.fillRect(pad.l + i * step, pad.t, step, ph);
    }

    if (hovIdx >= 0 && hovIdx < n) {
      ctx.save();
      ctx.fillStyle = isDark ? "rgba(104,156,184,0.12)" : "rgba(60,116,143,0.10)";
      ctx.fillRect(pad.l + hovIdx * step, pad.t, step, ph);
      ctx.strokeStyle = isDark ? "rgba(253,224,71,0.55)" : "rgba(60,116,143,0.55)";
      ctx.setLineDash([3, 3]);
      const hcx = pad.l + (hovIdx + 0.5) * step;
      ctx.beginPath(); ctx.moveTo(hcx, pad.t); ctx.lineTo(hcx, pad.t + ph); ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.1)";
    ctx.lineWidth = 1;
    ctx.font = "10px system-ui";
    ctx.fillStyle = textCol;
    for (const g of [25, 50, 75, 100]) {
      const y = pad.t + ph - (g / 100) * ph;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(g + "%", pad.l - 5, y + 3);
    }

    const regPalette = {
      "ภาคเหนือ": "#df6a37",
      "ภาคตะวันออกเฉียงเหนือ": "#c49c4d",
      "ภาคกลาง": "#689cb8",
      "ภาคตะวันออก": "#8e82a8",
      "ภาคใต้": "#55947a",
    };
    let lx = pad.l;
    for (const [reg, col] of Object.entries(regPalette)) {
      const arr = rid.regions?.[reg];
      if (!arr) continue;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        if (arr[i] === null || arr[i] === undefined) { started = false; continue; }
        const cx = pad.l + (i + 0.5) * step;
        const cy = pad.t + ph - (Math.max(0, Math.min(115, arr[i])) / 115) * ph;
        if (!started) { ctx.moveTo(cx, cy); started = true; } else ctx.lineTo(cx, cy);
      }
      ctx.stroke();

      if (hovIdx >= 0 && hovIdx < n && arr[hovIdx] !== null && arr[hovIdx] !== undefined) {
        const hcx = pad.l + (hovIdx + 0.5) * step;
        const hcy = pad.t + ph - (Math.max(0, Math.min(115, arr[hovIdx])) / 115) * ph;
        ctx.fillStyle = col;
        ctx.strokeStyle = isDark ? "#0f131b" : "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(hcx, hcy, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      ctx.fillStyle = col; ctx.fillRect(lx, 5, 11, 3);
      ctx.fillStyle = textCol; ctx.textAlign = "left";
      const shortNm = reg.replace("ภาคตะวันออกเฉียงเหนือ", "อีสาน").replace("ภาค", "");
      ctx.fillText(shortNm, lx + 14, 11);
      lx += Math.min(82, Math.max(54, pw / 5));
    }

    for (let i = 0; i < n; i++) {
      if (months[i].endsWith("-01")) {
        ctx.fillStyle = textCol; ctx.textAlign = "center";
        ctx.fillText(months[i].slice(0, 4), pad.l + (i + 0.5) * step, pad.t + ph + 15);
      }
    }

    canvas._ridMeta = { pad, step, months, rid, regPalette };
    if (!canvas._ridBound) {
      canvas._ridBound = true;
      canvas.addEventListener("mousemove", (e) => {
        const m = canvas._ridMeta;
        if (!m) return;
        const r = canvas.getBoundingClientRect();
        const idx = Math.floor((e.clientX - r.left - m.pad.l) / m.step);
        if (idx < 0 || idx >= m.months.length) {
          if (canvas._hovIdx !== -1) { canvas._hovIdx = -1; renderRidWaterChart(); }
          hideTooltip();
          return;
        }
        if (canvas._hovIdx !== idx) {
          canvas._hovIdx = idx;
          renderRidWaterChart();
        }
        const ym = m.months[idx];
        const moNum = Number(ym.slice(5, 7));
        const yrNum = Number(ym.slice(0, 4));
        const moLabel = `${MONTH_TH_SHORT[moNum - 1]} ${yrNum} (พ.ศ. ${yrNum + 543})`;
        const isDry = moNum >= 1 && moNum <= 4;
        const rowsHtml = Object.entries(m.regPalette).map(([reg, col]) => {
          const v = m.rid.regions?.[reg]?.[idx];
          const disp = reg.replace("ภาคตะวันออกเฉียงเหนือ", "ภาคอีสาน");
          return `<div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:${col}"></i>${escHtml(disp)}</span><span class="tt-v">${v !== null && v !== undefined ? v.toFixed(1) + "% ความจุ" : "-"}</span></div>`;
        }).join("");
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>${escHtml(moLabel)}</h4>
              <div class="tt-sub">น้ำกักเก็บอ่างขนาดกลาง 461 แห่ง (RID)</div>
            </div>
            <span class="tt-badge" style="color:#689cb8;border-color:rgba(104,156,184,0.35);background:rgba(104,156,184,0.14);">${isDry ? "ช่วงหน้าแล้ง" : "ช่วงฤดูฝน/ปลายปี"}</span>
          </div>
          ${rowsHtml}
        `, "#689cb8");
      });
      canvas.addEventListener("mouseleave", () => {
        if (canvas._hovIdx !== -1) {
          canvas._hovIdx = -1;
          renderRidWaterChart();
        }
        hideTooltip();
      });
    }
  }

  function renderBurnIntensityAndEmissions() {
    if (!DATA || !state.computedStats) return;
    const yrKey = document.getElementById("hzBurnSeasonSel")?.value || "2026";
    const cropMode = document.getElementById("hzBurnCropSel")?.value || "all";
    const q = (document.getElementById("hzBurnSearch")?.value || "").trim().toLowerCase();

    // Standard biomass dry fuel (t/rai) & emission factors (Andreae/IPCC screening)
    const FUEL_T_PER_RAI = [0.58, 1.12, 0.88, 0.70, 2.40]; // paddy, sugarcane, corn, mixed, forest
    const EF_PM25_T_PER_T = 0.0085;
    const EF_CO2E_T_PER_T = 1.58;

    let burnAgriRai = 0, burnTotalRai = 0, biomassTons = 0, pm25Tons = 0, co2eTons = 0;
    const tableRows = [];

    for (const p of DATA.provinces) {
      const covered = p.trp !== null && p.trp !== undefined;
      const a = covered ? (p.trp[yrKey] || [0, 0, 0, 0, 0]) : null;
      let provBm = null, provPm = null;
      if (a) {
        burnTotalRai += a[0] + a[1] + a[2] + a[3] + a[4];
        burnAgriRai += a[0] + a[1] + a[2] + a[3];
        provBm = 0;
        for (let k = 0; k < 5; k++) provBm += a[k] * FUEL_T_PER_RAI[k];
        biomassTons += provBm;
        provPm = provBm * EF_PM25_T_PER_T;
        pm25Tons += provPm;
        co2eTons += provBm * EF_CO2E_T_PER_T;
      }

      const d = p.doae_2566 || {};
      let burnVal = null, plantVal = null, pmCrop = null;
      if (a) {
        if (cropMode === "paddy") { burnVal = a[0]; plantVal = d.paddy_rai ?? null; pmCrop = a[0] * FUEL_T_PER_RAI[0] * EF_PM25_T_PER_T; }
        else if (cropMode === "sugarcane") { burnVal = a[1]; plantVal = d.sugarcane_rai ?? null; pmCrop = a[1] * FUEL_T_PER_RAI[1] * EF_PM25_T_PER_T; }
        else if (cropMode === "corn") { burnVal = a[2]; plantVal = d.corn_rai ?? null; pmCrop = a[2] * FUEL_T_PER_RAI[2] * EF_PM25_T_PER_T; }
        else {
          burnVal = a[0] + a[1] + a[2];
          const sumPl = (d.paddy_rai || 0) + (d.sugarcane_rai || 0) + (d.corn_rai || 0);
          plantVal = sumPl > 0 ? sumPl : null;
          pmCrop = (a[0] * FUEL_T_PER_RAI[0] + a[1] * FUEL_T_PER_RAI[1] + a[2] * FUEL_T_PER_RAI[2]) * EF_PM25_T_PER_T;
        }
      } else {
        if (cropMode === "paddy") plantVal = d.paddy_rai ?? null;
        else if (cropMode === "sugarcane") plantVal = d.sugarcane_rai ?? null;
        else if (cropMode === "corn") plantVal = d.corn_rai ?? null;
        else {
          const sumPl = (d.paddy_rai || 0) + (d.sugarcane_rai || 0) + (d.corn_rai || 0);
          plantVal = sumPl > 0 ? sumPl : null;
        }
      }
      const ratePct = (burnVal !== null && plantVal !== null && plantVal > 0) ? (burnVal * 100 / plantVal) : null;
      const pmPeak = p.aq_y?.[yrKey]?.pm25_peak ?? p.aq_y?.[yrKey]?.pm25_mean ?? null;
      tableRows.push({
        code: p.code,
        name_th: p.name_th,
        region: REGION_TH[p.region] || p.region || "-",
        burnVal,
        plantVal,
        ratePct,
        pmPeak,
        pmCrop,
      });
    }

    document.getElementById("hzKpiEmit").textContent = `${formatNum(pm25Tons, 0)} ตัน`;
    document.getElementById("hzKpiEmitSub").textContent = `ชีวมวล ${(biomassTons / 1e6).toFixed(2)} ล้านตัน · CO₂e ${(co2eTons / 1e6).toFixed(2)} ล้านตัน`;

    const emCards = document.getElementById("hzEmissionCards");
    if (emCards) {
      emCards.innerHTML = `
        <div class="kpi-hero" style="padding:12px 13px;">
          <div class="kpi-hero-label">รอยเผาเกษตรรวม (ฤดู ${Number(yrKey) + 543})</div>
          <div style="font-size:20px;font-weight:700;">${(burnAgriRai / 1e6).toFixed(2)} ล้านไร่</div>
          <div class="kpi-hero-sub">รวมป่าไม้ ${(burnTotalRai / 1e6).toFixed(2)} ล้านไร่</div>
        </div>
        <div class="kpi-hero" style="padding:12px 13px;">
          <div class="kpi-hero-label">มวลชีวภาพถูกเผาไหม้</div>
          <div style="font-size:20px;font-weight:700;">${(biomassTons / 1e6).toFixed(2)} ล้านตัน</div>
          <div class="kpi-hero-sub">ปล่อย PM2.5 ~${formatNum(pm25Tons, 0)} ตัน</div>
        </div>
      `;
    }

    const tbody = document.getElementById("hzBurnRateTbody");
    if (!tbody) return;
    let filtered = tableRows;
    if (q) filtered = filtered.filter(r => r.name_th.toLowerCase().includes(q) || r.region.toLowerCase().includes(q));
    filtered.sort((a, b) => (b.burnVal ?? -1) - (a.burnVal ?? -1));
    const fmt = (v, d = 0) => (v === null || v === undefined ? '<span style="color:var(--muted)">ไม่มีข้อมูล</span>' : formatNum(v, d));
    tbody.innerHTML = filtered.map((r, i) => `
      <tr data-hz-pcode="${escHtml(r.code)}">
        <td>${i + 1}</td>
        <td>${escHtml(r.name_th)}</td>
        <td><span class="reg-pill">${escHtml(r.region)}</span></td>
        <td style="font-weight:700;color:var(--accent);">${fmt(r.burnVal)}</td>
        <td>${fmt(r.plantVal)}</td>
        <td style="font-weight:700;">${r.ratePct !== null ? r.ratePct.toFixed(1) + "%" : '<span style="color:var(--muted)">ไม่มีข้อมูล</span>'}</td>
        <td>${r.pmPeak !== null ? r.pmPeak.toFixed(1) + " µg/m³" : "-"}</td>
        <td>${fmt(r.pmCrop)}</td>
      </tr>
    `).join("");
    tbody.querySelectorAll("tr[data-hz-pcode]").forEach(tr => {
      tr.onclick = () => {
        const pSel = document.getElementById("hzProvSelect");
        if (pSel) { pSel.value = tr.dataset.hzPcode; renderHazeDualLab(); }
        inspectLiveHazeProv(tr.dataset.hzPcode);
      };
      tr.addEventListener("mousemove", (e) => {
        const p = PROV_MAP.get(tr.dataset.hzPcode);
        const r = filtered.find(x => x.code === tr.dataset.hzPcode);
        if (!p || !r) return;
        const a = p.trp?.[yrKey];
        const d = p.doae_2566 || {};
        showTooltip(e.clientX, e.clientY, `
          <div class="tt-head">
            <div>
              <h4>จ.${escHtml(p.name_th)} · ฤดู ${Number(yrKey) + 543}</h4>
              <div class="tt-sub">${escHtml(r.region)} · เทียบรอยเผา สสน. 20 ม. กับพื้นที่ปลูก DOAE 2566</div>
            </div>
            <span class="tt-badge">${r.ratePct !== null ? r.ratePct.toFixed(1) + "% เผา/ปลูก" : "นอกเขต สสน."}</span>
          </div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#d4a84f"></i>นาข้าว (เผา / ปลูก)</span><span class="tt-v">${a ? formatNum(a[0], 0) : "ไม่มีข้อมูล"} / ${d.paddy_rai != null ? formatNum(d.paddy_rai, 0) + " ไร่" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#c96f53"></i>อ้อยโรงงาน (เผา / ปลูก)</span><span class="tt-v">${a ? formatNum(a[1], 0) : "ไม่มีข้อมูล"} / ${d.sugarcane_rai != null ? formatNum(d.sugarcane_rai, 0) + " ไร่" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#7d9b65"></i>ข้าวโพด (เผา / ปลูก)</span><span class="tt-v">${a ? formatNum(a[2], 0) : "ไม่มีข้อมูล"} / ${d.corn_rai != null ? formatNum(d.corn_rai, 0) + " ไร่" : "-"}</span></div>
          <div class="tt-row"><span class="tt-k"><i class="tt-dot" style="background:#a84438"></i>เขตป่าไม้ (รอยเผา สสน.)</span><span class="tt-v">${a ? formatNum(a[4], 0) + " ไร่" : "ไม่มีข้อมูล"}</span></div>
          <div class="tt-divider"></div>
          <div class="tt-row"><span class="tt-k">PM2.5 เฉลี่ยฤดู · ปล่อย PM2.5</span><span class="tt-v">${r.pmPeak !== null ? r.pmPeak.toFixed(1) + " µg/m³" : "-"} · ${r.pmCrop !== null ? "~" + formatNum(r.pmCrop, 0) + " ตัน" : "ไม่มีข้อมูล"}</span></div>
          <div class="tt-foot">คลิกแถวเพื่อดูกราฟแนวโน้มฝุ่นและตรวจรายอำเภอของจังหวัดนี้</div>
        `);
      });
      tr.addEventListener("mouseleave", hideTooltip);
    });
  }

  function renderHazePage() {
    if (!DATA) return;
    populateHazeSelects();
    loadLiveHazeData(false);
    renderHazeDualLab();
    renderTransboundarySection();
    renderRidWaterChart();
    renderBurnIntensityAndEmissions();
  }
"""
