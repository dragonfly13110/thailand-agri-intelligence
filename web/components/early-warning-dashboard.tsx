'use client';

import React, { useMemo, useState } from 'react';
import type {
  EarlyWarningSummary,
  ProvinceRiskItem,
  SimulationForecastDay,
  CriticalReservoir,
  RiskType,
  DisasterAlertLevel,
} from '@/lib/hub/early-warning-data';
import styles from './early-warning-dashboard.module.css';

interface EarlyWarningDashboardProps {
  initialSummary: EarlyWarningSummary;
  initialProvinces: ProvinceRiskItem[];
  initialForecast: SimulationForecastDay[];
  initialCriticalReservoirs: CriticalReservoir[];
}

const REGION_OPTIONS = [
  { value: 'all', label: 'ทุกภาค' },
  { value: 'ภาคเหนือ', label: 'ภาคเหนือ' },
  { value: 'ภาคกลาง', label: 'ภาคกลาง' },
  { value: 'ภาคตะวันออกเฉียงเหนือ', label: 'ภาคตะวันออกเฉียงเหนือ' },
  { value: 'ภาคตะวันออก', label: 'ภาคตะวันออก' },
  { value: 'ภาคตะวันตก', label: 'ภาคตะวันตก' },
  { value: 'ภาคใต้', label: 'ภาคใต้' },
];

const RISK_OPTIONS = [
  { value: 'all', label: 'ทุกระดับความเสี่ยง' },
  { value: 'critical', label: 'วิกฤติสูง (Critical)' },
  { value: 'warning', label: 'เฝ้าระวัง (Warning)' },
  { value: 'normal', label: 'ปกติ (Normal)' },
];

export function EarlyWarningDashboard({
  initialSummary,
  initialProvinces,
  initialForecast,
  initialCriticalReservoirs,
}: EarlyWarningDashboardProps) {
  const [activeTab, setActiveTab] = useState<'matrix' | 'forecast' | 'reservoirs'>('matrix');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<RiskType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedProvinceCode, setExpandedProvinceCode] = useState<string | null>(null);

  // Reservoirs sub-view filters
  const [rsvType, setRsvType] = useState<'all' | 'overflow' | 'drought'>('all');
  const [rsvPage, setRsvPage] = useState<number>(1);
  const rsvPageSize = 12;

  // Filtered Provinces for Matrix
  const filteredProvinces = useMemo(() => {
    return initialProvinces.filter((p) => {
      if (selectedRegion !== 'all' && p.region !== selectedRegion) return false;
      if (selectedRisk !== 'all' && p.overallRisk !== selectedRisk) return false;

      if (selectedType === 'flood') {
        if (p.floodRiskLevel !== 'critical' && p.floodRiskLevel !== 'warning') return false;
      } else if (selectedType === 'drought') {
        if (p.droughtRiskLevel !== 'critical' && p.droughtRiskLevel !== 'warning') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = p.provinceName.toLowerCase().includes(q);
        const matchesBasin = p.basinName.toLowerCase().includes(q);
        const matchesCrop = p.affectedCrops.some((c) => c.toLowerCase().includes(q));
        const matchesRegion = p.region.toLowerCase().includes(q);
        if (!matchesName && !matchesBasin && !matchesCrop && !matchesRegion) return false;
      }

      return true;
    });
  }, [initialProvinces, selectedRegion, selectedRisk, selectedType, searchQuery]);

  // Filtered Reservoirs
  const filteredReservoirs = useMemo(() => {
    return initialCriticalReservoirs.filter((r) => {
      if (selectedRegion !== 'all' && r.region !== selectedRegion) return false;
      if (rsvType !== 'all' && r.type !== rsvType) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.region.toLowerCase().includes(q);
      }

      return true;
    });
  }, [initialCriticalReservoirs, selectedRegion, rsvType, searchQuery]);

  const totalRsvPages = Math.max(1, Math.ceil(filteredReservoirs.length / rsvPageSize));
  const currentRsvPage = Math.min(rsvPage, totalRsvPages);
  const paginatedReservoirs = useMemo(() => {
    const start = (currentRsvPage - 1) * rsvPageSize;
    return filteredReservoirs.slice(start, start + rsvPageSize);
  }, [filteredReservoirs, currentRsvPage, rsvPageSize]);

  const handleResetFilters = () => {
    setSelectedRegion('all');
    setSelectedRisk('all');
    setSelectedType('all');
    setSearchQuery('');
    setRsvType('all');
    setRsvPage(1);
  };

  const getRiskBadgeText = (risk: DisasterAlertLevel) => {
    switch (risk) {
      case 'critical':
        return 'วิกฤติสูง';
      case 'warning':
        return 'เฝ้าระวัง';
      case 'normal':
        return 'สภาวะปกติ';
      default:
        return risk;
    }
  };

  const getRiskScoreClass = (score: number) => {
    if (score >= 80) return styles.critical;
    if (score >= 60) return styles.warning;
    return styles.normal;
  };

  return (
    <div className={styles.container}>
      {/* 1. Dashboard Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.titleGroup}>
            <h1>
              ศูนย์เตือนภัยน้ำท่วมและภัยแล้งฉับพลันเพื่อการเกษตร
            </h1>
            <p className={styles.subtitle}>
              แบบจำลองระดับความเสี่ยงรายลุ่มน้ำและจังหวัด พร้อมคำแนะนำเชิงเกษตรล่วงหน้า 14 วัน
              เพื่อทดสอบหน้าจอเท่านั้น — ไม่ใช่ประกาศเตือนภัยจากหน่วยงานต้นทาง
            </p>
          </div>
          <div className={styles.liveBadge}>
            <span className={styles.pulseRed} aria-hidden="true" />
            <span>ระดับแบบจำลอง: เฝ้าระวัง (Simulation)</span>
          </div>
        </div>
      </header>

      {/* 2. Governance & Demo Notice Banner */}
      <aside className={styles.governanceBanner} role="status" aria-label="Demo notice">
        <svg
          className={styles.bannerIcon}
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className={styles.bannerContent}>
          <div className={styles.bannerHeader}>
            <span className={styles.bannerBadge}>Simulation / Sample Dataset</span>
            <span className={styles.bannerTitle}>
              ข้อมูลจำลองเพื่อการสาธิตระบบเตือนภัยล่วงหน้า (Early Warning Simulation)
            </span>
          </div>
          <p className={styles.bannerText}>
            หน้านี้ใช้ชุดข้อมูลสังเคราะห์เชิงโครงสร้าง (Deterministic Simulation) และอ่างเก็บน้ำจำลอง{' '}
            (<code>sim-rsv-*</code>) โดย<strong>ไม่ใช้ค่าจริงจากรายงานอ่างเก็บน้ำที่ยังรอตรวจสิทธิ์</strong>{' '}
            สถานะข้อมูลตามมาตรฐาน Hub API: <code>meta.access: &quot;metadata_only&quot;</code> |{' '}
            <code>sample: true</code> | <code>cache-control: no-store</code>
          </p>
        </div>
      </aside>

      {/* 3. KPI Summary Cards Grid */}
      <section className={styles.kpiGrid} aria-label="Key Performance Indicators">
        {/* KPI 1: เขื่อน/อ่างวิกฤติน้ำมาก (>80%) */}
        <article className={`${styles.kpiCard} ${styles.floodAlert}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>อ่างวิกฤติน้ำมาก (&gt;80%)</span>
            <div className={`${styles.kpiIconWrap} ${styles.red}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" />
                <path d="M12 18v-4" />
                <path d="m9 15 3-3 3 3" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{initialSummary.criticalFloodCount}</span>
            <span className={styles.kpiUnit}>แห่ง</span>
          </div>
          <div className={styles.kpiFooter}>
            <span>
              คิดเป็น <strong>{Math.round((initialSummary.criticalFloodCount / initialSummary.totalReservoirs) * 100)}%</strong> ของอ่างจำลอง {initialSummary.totalReservoirs} แห่ง
            </span>
            <span className={`${styles.kpiSubtag} ${styles.tagCritical}`}>แบบจำลอง</span>
          </div>
        </article>

        {/* KPI 2: เขื่อนวิกฤติน้ำแล้ง (<30%) */}
        <article className={`${styles.kpiCard} ${styles.droughtAlert}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>อ่างวิกฤติน้ำแล้ง (&lt;30%)</span>
            <div className={`${styles.kpiIconWrap} ${styles.orange}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{initialSummary.criticalDroughtCount}</span>
            <span className={styles.kpiUnit}>แห่ง</span>
          </div>
          <div className={styles.kpiFooter}>
            <span>
              คิดเป็น <strong>{Math.round((initialSummary.criticalDroughtCount / initialSummary.totalReservoirs) * 100)}%</strong> ของอ่างจำลอง {initialSummary.totalReservoirs} แห่ง
            </span>
            <span className={`${styles.kpiSubtag} ${styles.tagWarning}`}>แบบจำลอง</span>
          </div>
        </article>

        {/* KPI 3: จังหวัดเสี่ยงภัยพิบัติสูง */}
        <article className={`${styles.kpiCard} ${styles.provinceAlert}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>จังหวัดเสี่ยงภัยพิบัติสูง</span>
            <div className={`${styles.kpiIconWrap} ${styles.purple}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{initialSummary.highRiskProvincesCount}</span>
            <span className={styles.kpiUnit}>จังหวัด</span>
          </div>
          <div className={styles.kpiFooter}>
            <span>
              เฝ้าระวังเพิ่มเติม <strong>{initialSummary.warningProvincesCount}</strong> จว.
            </span>
            <span className={`${styles.kpiSubtag} ${styles.tagCritical}`}>พื้นที่สีแดง</span>
          </div>
        </article>

        {/* KPI 4: ดัชนีฝนสะสม 7 วัน */}
        <article className={`${styles.kpiCard} ${styles.rainIndex}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>ดัชนีฝนสะสม 7 วัน (เฉลี่ย)</span>
            <div className={`${styles.kpiIconWrap} ${styles.blue}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />
                <path d="M16 14v6M8 14v6M12 16v6" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{initialSummary.avgRainfall7dMm}</span>
            <span className={styles.kpiUnit}>มม.</span>
          </div>
          <div className={styles.kpiFooter}>
            <span>
              สูงสุด <strong>{initialSummary.maxRainfall7dMm} มม.</strong> (นครศรีธรรมราช)
            </span>
            <span className={`${styles.kpiSubtag} ${styles.tagInfo}`}>ฝนชุกสะสม</span>
          </div>
        </article>
      </section>

      {/* 4. Controls & Filters */}
      <section className={styles.controlCard} aria-label="Filters and Search Controls">
        <div className={styles.searchAndTypeRow}>
          <div className={styles.searchBox}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="ค้นหาชื่อจังหวัด, ลุ่มน้ำ, อ่างเก็บน้ำ หรือพืชผล (เช่น ทุเรียน, อยุธยา)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="ค้นหา"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.resetBtn}
                onClick={() => setSearchQuery('')}
                title="ล้างข้อความค้นหา"
              >
                ✕
              </button>
            )}
          </div>

          <div className={styles.typeButtonGroup} role="radiogroup" aria-label="ประเภทภัยพิบัติ">
            <button
              type="button"
              className={`${styles.typeBtn} ${selectedType === 'all' ? styles.active : ''}`}
              onClick={() => setSelectedType('all')}
            >
              ภัยทุกประเภท
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${selectedType === 'flood' ? styles.active : ''}`}
              onClick={() => setSelectedType('flood')}
            >
              น้ำท่วม/น้ำหลาก
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${selectedType === 'drought' ? styles.active : ''}`}
              onClick={() => setSelectedType('drought')}
            >
              ภัยแล้ง/ฝนทิ้งช่วง
            </button>
          </div>
        </div>

        <div className={styles.dropdownFiltersRow}>
          <div className={styles.filterGroup}>
            <label className={styles.selectLabel}>
              <span>ภูมิภาค:</span>
              <select
                className={styles.selectInput}
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
              >
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.selectLabel}>
              <span>ระดับความเสี่ยง:</span>
              <select
                className={styles.selectInput}
                value={selectedRisk}
                onChange={(e) => setSelectedRisk(e.target.value)}
              >
                {RISK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {(selectedRegion !== 'all' || selectedRisk !== 'all' || selectedType !== 'all' || searchQuery) && (
              <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className={styles.resultsMeta}>
            แสดงผล: <strong>{filteredProvinces.length}</strong> จังหวัดในเงื่อนไข
          </div>
        </div>
      </section>

      {/* 5. Navigation Tabs */}
      <nav className={styles.tabsContainer} aria-label="Views Navigation">
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'matrix' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
          <span>เมทริกซ์ความเสี่ยงรายจังหวัดและคำแนะนำเกษตร</span>
          <span className={styles.tabCounter}>{filteredProvinces.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'forecast' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('forecast')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" />
            <path d="m7 15 5-6 4 3 5-8" />
          </svg>
          <span>ไทม์ไลน์พยากรณ์ล่วงหน้า 14 วัน (Simulation)</span>
          <span className={styles.tabCounter}>14 วัน</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'reservoirs' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('reservoirs')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" />
          </svg>
          <span>อ่างเก็บน้ำจำลองวิกฤติ</span>
          <span className={styles.tabCounter}>{filteredReservoirs.length}</span>
        </button>
      </nav>

      {/* TAB CONTENT 1: Provincial Risk Matrix & Table */}
      {activeTab === 'matrix' && (
        <section className={styles.matrixSection} aria-label="Provincial Risk Matrix">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>ดัชนีความเสี่ยงรายลุ่มน้ำและมาตรการเชิงเกษตร</h2>
              <span className={styles.sectionNote}>
                ประเมินแยกหมวดน้ำหลากฉับพลัน (Flood) และภัยแล้ง (Drought) พร้อมพืชเศรษฐกิจที่ได้รับผลกระทบ
              </span>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.responsiveTableWrap}>
              <table className={styles.riskTable}>
                <thead>
                  <tr>
                    <th>จังหวัด / ลุ่มน้ำ</th>
                    <th>สถานะรวม</th>
                    <th>ดัชนีน้ำท่วม (Flood Risk)</th>
                    <th>ดัชนีภัยแล้ง (Drought Risk)</th>
                    <th>ปริมาณฝน 7 วัน / ความชื้นดิน</th>
                    <th>พืชที่ได้รับผลกระทบ</th>
                    <th>คำแนะนำเชิงเกษตร (Agronomic Advisory)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProvinces.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>
                          <p>ไม่พบข้อมูลจังหวัดตามเงื่อนไขที่เลือก กรุณาปรับเปลี่ยนตัวกรองหรือคำค้นหา</p>
                          <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                            ล้างตัวกรอง
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProvinces.map((prov) => {
                      const isExpanded = expandedProvinceCode === prov.provinceCode;
                      return (
                        <React.Fragment key={prov.provinceCode}>
                          <tr>
                            <td className={styles.provinceCell}>
                              <div className={styles.provName}>{prov.provinceName}</div>
                              <span className={styles.basinTag}>{prov.basinName}</span>
                            </td>
                            <td>
                              <span className={`${styles.badgeStatus} ${styles[prov.overallRisk]}`}>
                                {getRiskBadgeText(prov.overallRisk)}
                              </span>
                            </td>
                            <td className={styles.riskMeterCell}>
                              <div className={styles.meterHeader}>
                                <span className={styles.meterLabel}>ความเสี่ยง</span>
                                <span className={styles.meterScore}>{prov.floodRiskScore}/100</span>
                              </div>
                              <div className={styles.meterBarBg}>
                                <div
                                  className={`${styles.meterBarFill} ${getRiskScoreClass(prov.floodRiskScore)}`}
                                  style={{ width: `${prov.floodRiskScore}%` }}
                                />
                              </div>
                            </td>
                            <td className={styles.riskMeterCell}>
                              <div className={styles.meterHeader}>
                                <span className={styles.meterLabel}>ความเสี่ยง</span>
                                <span className={styles.meterScore}>{prov.droughtRiskScore}/100</span>
                              </div>
                              <div className={styles.meterBarBg}>
                                <div
                                  className={`${styles.meterBarFill} ${getRiskScoreClass(prov.droughtRiskScore)}`}
                                  style={{ width: `${prov.droughtRiskScore}%` }}
                                />
                              </div>
                            </td>
                            <td className={styles.waterIndexCell}>
                              <div className={styles.waterIndexLine}>
                                <span>ฝนสะสม:</span>
                                <strong>{prov.rainfall7dMm} มม.</strong>
                              </div>
                              <div className={styles.waterIndexLine}>
                                <span>ความชื้นดิน:</span>
                                <strong>{prov.soilMoisturePercent}%</strong>
                              </div>
                            </td>
                            <td className={styles.cropsCell}>
                              <div className={styles.cropBadgeList}>
                                {prov.affectedCrops.map((crop, idx) => (
                                  <span key={idx} className={styles.cropBadge}>
                                    {crop}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className={styles.advisoryCell}>
                              <div className={styles.advisoryText}>{prov.agriculturalAdvisory}</div>
                              <button
                                type="button"
                                className={styles.detailsToggleBtn}
                                onClick={() =>
                                  setExpandedProvinceCode(isExpanded ? null : prov.provinceCode)
                                }
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? '▲ ซ่อนข้อปฏิบัติเร่งด่วน' : '▼ ดูข้อปฏิบัติเร่งด่วน & อ่างเชื่อมโยง'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded detail row with actionable checklist */}
                          {isExpanded && (
                            <tr className={styles.expandedActionsRow}>
                              <td colSpan={7}>
                                <div className={styles.expandedContainer}>
                                  <div className={styles.actionHeading}>
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <polyline points="9 11 12 14 22 4" />
                                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                    </svg>
                                    <span>ข้อปฏิบัติเร่งด่วนสำหรับเกษตรกรในพื้นที่ {prov.provinceName}:</span>
                                  </div>
                                  <ul className={styles.actionList}>
                                    {prov.recommendedActions.map((action, aIdx) => (
                                      <li key={aIdx}>{action}</li>
                                    ))}
                                  </ul>
                                  {prov.keyReservoirs.length > 0 && (
                                    <div className={styles.reservoirLinks}>
                                      <span>อ่างเก็บน้ำหรือระบบชลประทานหลักที่เชื่อมโยง:</span>
                                      {prov.keyReservoirs.map((rsv, rIdx) => (
                                        <span key={rIdx} className={styles.rsvTag}>
                                          {rsv}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB CONTENT 2: 14-Day Simulation Forecast Timeline */}
      {activeTab === 'forecast' && (
        <section className={styles.timelineSection} aria-label="14-Day Simulation Forecast Timeline">
          <div className={styles.timelineBanner}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className={styles.timelineBannerText}>
              <strong>แบบจำลองแนวโน้มสภาวะอากาศและอุทกภัยเกษตรล่วงหน้า 14 วัน (Simulation Forecast):</strong>{' '}
              วิเคราะห์ความน่าจะเป็นของการเกิดน้ำหลากฉับพลัน ปริมาณน้ำฝนเฉลี่ย และน้ำท่าไหลเข้าอ่างเก็บน้ำ
              โดยคาดการณ์จุดสูงสุดของมรสุมอยู่ในช่วง <strong>D+1 ถึง D+3 (26-28 ต.ค.)</strong> ก่อนจะคลี่คลายในสัปดาห์ถัดไป
            </div>
          </div>

          <div className={styles.forecastGrid}>
            {initialForecast.map((day) => {
              const isPeak = day.floodProbability >= 80;
              return (
                <article
                  key={day.day}
                  className={`${styles.dayCard} ${isPeak ? styles.peakDay : ''}`}
                >
                  <div className={styles.dayCardTop}>
                    <div className={styles.dayNumber}>{day.dayLabel}</div>
                    <span
                      className={`${styles.trendBadge} ${
                        day.riskTrend === 'increasing'
                          ? styles.up
                          : day.riskTrend === 'decreasing'
                          ? styles.down
                          : styles.stable
                      }`}
                    >
                      {day.riskTrend === 'increasing' && '▲ แนวโน้มเพิ่มขึ้น'}
                      {day.riskTrend === 'decreasing' && '▼ แนวโน้มลดลง'}
                      {day.riskTrend === 'stable' && '— ทรงตัว'}
                    </span>
                  </div>

                  <div className={styles.dayMetricsRow}>
                    <div className={styles.dayMetricItem}>
                      <span className={styles.metricKey}>ฝนเฉลี่ยรายวัน</span>
                      <span className={styles.metricVal}>{day.rainfallAvgMm} มม.</span>
                    </div>
                    <div className={styles.dayMetricItem}>
                      <span className={styles.metricKey}>น้ำไหลเข้าอ่าง</span>
                      <span className={styles.metricVal}>{day.inflowForecastMcm} ล้าน ลบ.ม.</span>
                    </div>
                  </div>

                  <div className={styles.probabilityBlock}>
                    <div className={styles.probHeader}>
                      <span>โอกาสน้ำหลากฉับพลัน</span>
                      <span className={styles.probScore}>{day.floodProbability}%</span>
                    </div>
                    <div className={styles.meterBarBg}>
                      <div
                        className={`${styles.meterBarFill} ${
                          day.floodProbability >= 70 ? styles.critical : styles.warning
                        }`}
                        style={{ width: `${day.floodProbability}%` }}
                      />
                    </div>
                  </div>

                  <div className={styles.dayFrontText}>
                    <strong>แนวปะทะอากาศ:</strong> {day.activeFront}
                  </div>

                  <div className={styles.dayAdvisoryText}>
                    <strong>คำแนะนำ:</strong> {day.advisoryHeadline}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB CONTENT 3: Critical Reservoirs Breakdown */}
      {activeTab === 'reservoirs' && (
        <section className={styles.reservoirsSection} aria-label="Critical Reservoirs Breakdown">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                วิเคราะห์สถานการณ์อ่างเก็บน้ำจำลองวิกฤติ (Simulation)
              </h2>
              <span className={styles.sectionNote}>
                แบ่งกลุ่มอ่างจำลองที่มีปริมาณเกิน 80% (เสี่ยงล้น) และต่ำกว่า 30% (เสี่ยงแล้ง) จากแบบจำลองสาธิต — ไม่ใช่ข้อมูลจากรายงานต้นทาง
              </span>
            </div>

            <div className={styles.typeButtonGroup} role="radiogroup">
              <button
                type="button"
                className={`${styles.typeBtn} ${rsvType === 'all' ? styles.active : ''}`}
                onClick={() => {
                  setRsvType('all');
                  setRsvPage(1);
                }}
              >
                ทั้งหมด ({initialCriticalReservoirs.length})
              </button>
              <button
                type="button"
                className={`${styles.typeBtn} ${rsvType === 'overflow' ? styles.active : ''}`}
                onClick={() => {
                  setRsvType('overflow');
                  setRsvPage(1);
                }}
              >
                น้ำมากเกิน 80% ({initialSummary.criticalFloodCount})
              </button>
              <button
                type="button"
                className={`${styles.typeBtn} ${rsvType === 'drought' ? styles.active : ''}`}
                onClick={() => {
                  setRsvType('drought');
                  setRsvPage(1);
                }}
              >
                น้ำน้อยกว่า 30% ({initialSummary.criticalDroughtCount})
              </button>
            </div>
          </div>

          <div className={styles.rsvSummaryGrid}>
            {paginatedReservoirs.length === 0 ? (
              <div className={styles.emptyState}>
                <p>ไม่พบอ่างเก็บน้ำในกลุ่มที่เลือก</p>
              </div>
            ) : (
              paginatedReservoirs.map((rsv) => (
                <article
                  key={rsv.id}
                  className={`${styles.rsvCard} ${rsv.type === 'overflow' ? styles.overflow : styles.drought}`}
                >
                  <div className={styles.rsvTop}>
                    <div>
                      <div className={styles.rsvName}>{rsv.name}</div>
                      <div className={styles.rsvRegion}>{rsv.region}</div>
                    </div>
                    <span
                      className={`${styles.rsvPercentTag} ${
                        rsv.type === 'overflow' ? styles.overflow : styles.drought
                      }`}
                    >
                      {rsv.percent.toFixed(1)}%
                    </span>
                  </div>

                  <div className={styles.rsvStatsRow}>
                    <div className={styles.rsvStatBox}>
                      <div>ความจุเก็บกัก</div>
                      <strong>{rsv.storage.toLocaleString()} ล้าน ลบ.ม.</strong>
                    </div>
                    <div className={styles.rsvStatBox}>
                      <div>น้ำปัจจุบัน</div>
                      <strong>{rsv.volume.toLocaleString()} ล้าน ลบ.ม.</strong>
                    </div>
                  </div>

                  <div className={styles.rsvAdvisory}>
                    <strong>การบริหารจัดการน้ำ:</strong> {rsv.advisoryNote}
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Pagination for Reservoirs */}
          {totalRsvPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                marginTop: '16px',
              }}
            >
              <button
                type="button"
                className={styles.resetBtn}
                disabled={currentRsvPage === 1}
                onClick={() => setRsvPage((p) => Math.max(1, p - 1))}
              >
                ◀ หน้าก่อนหน้า
              </button>
              <span style={{ fontSize: '13px', color: 'var(--muted, #4b6354)' }}>
                หน้า <strong>{currentRsvPage}</strong> จาก <strong>{totalRsvPages}</strong>
              </span>
              <button
                type="button"
                className={styles.resetBtn}
                disabled={currentRsvPage === totalRsvPages}
                onClick={() => setRsvPage((p) => Math.min(totalRsvPages, p + 1))}
              >
                หน้าถัดไป ▶
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
