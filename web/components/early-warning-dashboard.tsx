'use client';

import React, { useMemo, useState } from 'react';
import type {
  EarlyWarningDataset,
  EarlyWarningSummary,
  ProvinceRiskItem,
  SimulationForecastDay,
  CriticalReservoir,
  RiskAlertItem,
  RiskSignalSourceId,
  RiskType,
  DisasterAlertLevel,
} from '@/lib/hub/early-warning-data';
import styles from './early-warning-dashboard.module.css';

interface EarlyWarningDashboardProps {
  initialSummary: EarlyWarningSummary;
  initialProvinces: ProvinceRiskItem[];
  initialForecast: SimulationForecastDay[];
  initialCriticalReservoirs: CriticalReservoir[];
  /** สัญญาณตั้งต้นทีละรายการ พร้อมที่มา (RID / GISTDA / TMD) ของแต่ละตัว */
  initialSignals: RiskAlertItem[];
  /** สถานะของชั้นข้อมูลตรวจวัดที่ hub อ่านได้จริงในรอบนี้ */
  initialSources: EarlyWarningDataset['sources'];
  mode: EarlyWarningDataset['mode'];
  bannerText: string;
  disclaimer: string;
  warnings: string[];
  layerGovernance: EarlyWarningDataset['layerGovernance'];
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

/** สีสันของ badge บอกที่มา — แยกชั้นข้อมูลตรวจวัดออกจากกันบนหน้าจอ */
const SOURCE_BADGE_STYLE: Record<RiskSignalSourceId, { label: string; background: string; color: string; border: string }> = {
  rid: { label: 'RID Reservoir', background: '#e0f2fe', color: '#0c4a6e', border: '#bae6fd' },
  gistda: { label: 'GISTDA SAR', background: '#dcfce7', color: '#14532d', border: '#bbf7d0' },
  tmd: { label: 'TMD Station', background: '#fef3c7', color: '#92400e', border: '#fde68a' },
};

const SOURCE_LONG_NAME: Record<RiskSignalSourceId, string> = {
  rid: 'กรมชลประทาน (RID) — ระดับน้ำอ่างเก็บน้ำ',
  gistda: 'GISTDA — polygon น้ำท่วมจาก Sentinel-1 C-SAR',
  tmd: 'กรมอุตุนิยมวิทยา (TMD) — ฝน/อุณหภูมิจากสถานี',
};

const SOURCE_ORDER: RiskSignalSourceId[] = ['rid', 'gistda', 'tmd'];

const HAZARD_LABEL: Record<RiskAlertItem['hazard'], string> = {
  flood: 'น้ำท่วม/น้ำหลาก',
  drought: 'ภัยแล้ง/น้ำน้อย',
  heat: 'ร้อนจัด',
};

function SourceBadge({ sourceId }: { sourceId: RiskSignalSourceId }) {
  const tone = SOURCE_BADGE_STYLE[sourceId];
  return (
    <span
      className={styles.bannerBadge}
      style={{ background: tone.background, color: tone.color, borderColor: tone.border }}
    >
      {tone.label}
    </span>
  );
}

/** ค่าที่หายไปต้องแสดงเป็น "—" เสมอ ห้ามแปลงเป็น 0 */
function formatMeasure(value: number | null, digits = 1, unit = ''): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}${unit}`;
}

/** ค่าตรวจวัดที่ module ปัดหลักสิบมาแล้ว — แสดงทศนิยมเท่าที่มี ไม่เติมศูนย์ปลอม */
function formatMetric(value: number | null, unit: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const amount = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value);
  return unit ? `${amount} ${unit}` : amount;
}

function formatShare(part: number, total: number): string {
  if (!Number.isFinite(total) || total <= 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'ไม่ระบุวัน';
  const stamp = Date.parse(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(stamp)) return value;
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(stamp));
}

export function EarlyWarningDashboard({
  initialSummary,
  initialProvinces,
  initialForecast,
  initialCriticalReservoirs,
  initialSignals,
  initialSources,
  mode,
  bannerText,
  disclaimer,
  warnings,
  layerGovernance,
}: EarlyWarningDashboardProps) {
  const isRealEvidence = mode === 'real_evidence';
  const [activeTab, setActiveTab] = useState<'signals' | 'matrix' | 'forecast' | 'reservoirs'>('matrix');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<RiskType>('all');
  const [selectedSource, setSelectedSource] = useState<RiskSignalSourceId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedProvinceCode, setExpandedProvinceCode] = useState<string | null>(null);

  // Reservoirs sub-view filters
  const [rsvType, setRsvType] = useState<'all' | 'overflow' | 'drought'>('all');
  const [rsvPage, setRsvPage] = useState<number>(1);
  const rsvPageSize = 12;

  // Signals table pagination (one measured row can be one signal)
  const [signalPage, setSignalPage] = useState<number>(1);
  const signalPageSize = 25;

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

  // Filtered risk signals — every row carries the measured layer that raised it
  const filteredSignals = useMemo(() => {
    return initialSignals.filter((signal) => {
      if (selectedSource !== 'all' && signal.sourceId !== selectedSource) return false;
      if (selectedRegion !== 'all' && signal.region !== selectedRegion) return false;
      if (selectedRisk !== 'all' && signal.level !== selectedRisk) return false;
      if (selectedType !== 'all' && signal.hazard !== selectedType) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const haystack = [
          signal.provinceName,
          signal.locationName,
          signal.sourceName,
          signal.badge,
          signal.metricLabel,
          signal.evidenceText,
          signal.region,
        ]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(q));
        if (!haystack) return false;
      }

      return true;
    });
  }, [initialSignals, selectedSource, selectedRegion, selectedRisk, selectedType, searchQuery]);

  const signalsByProvince = useMemo(() => {
    const grouped = new Map<string, RiskAlertItem[]>();
    for (const signal of initialSignals) {
      if (!signal.provinceCode) continue;
      const bucket = grouped.get(signal.provinceCode);
      if (bucket) bucket.push(signal);
      else grouped.set(signal.provinceCode, [signal]);
    }
    return grouped;
  }, [initialSignals]);

  const totalSignalPages = Math.max(1, Math.ceil(filteredSignals.length / signalPageSize));
  const currentSignalPage = Math.min(signalPage, totalSignalPages);
  const paginatedSignals = useMemo(() => {
    const start = (currentSignalPage - 1) * signalPageSize;
    return filteredSignals.slice(start, start + signalPageSize);
  }, [filteredSignals, currentSignalPage, signalPageSize]);

  // Filtered Reservoirs
  const filteredReservoirs = useMemo(() => {
    return initialCriticalReservoirs.filter((r) => {
      if (selectedRegion !== 'all' && r.region !== selectedRegion) return false;
      if (rsvType !== 'all' && r.type !== rsvType) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          r.name.toLowerCase().includes(q)
          || r.id.toLowerCase().includes(q)
          || (r.region ?? '').toLowerCase().includes(q)
        );
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
    setSelectedSource('all');
    setSearchQuery('');
    setRsvType('all');
    setRsvPage(1);
    setSignalPage(1);
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
              {isRealEvidence ? (
                <>
                  สัญญาณตั้งต้นแต่ละตัวอ่านจากข้อมูลตรวจวัดที่เผยแพร่ในคลังข้อมูลกลาง: ระดับน้ำอ่างเก็บน้ำ RID, polygon
                  น้ำท่วม GISTDA และค่ารายสถานี TMD ส่วนดัชนีความเสี่ยงรายจังหวัด คำแนะนำเกษตร และไทม์ไลน์ 14 วัน
                  เป็นผลการวิเคราะห์ภายในของ TADIH เพื่อประกอบการวางแผน — ไม่ใช่ประกาศเขตพื้นที่ประสบสาธารณภัยของทางราชการ
                </>
              ) : (
                <>
                  แบบจำลองระดับความเสี่ยงรายลุ่มน้ำและจังหวัด พร้อมคำแนะนำเชิงเกษตรล่วงหน้า 14 วัน
                  เพื่อทดสอบหน้าจอเท่านั้น — ไม่ใช่ประกาศเตือนภัยจากหน่วยงานต้นทาง
                </>
              )}
            </p>
          </div>
          <div className={styles.liveBadge}>
            <span className={styles.pulseRed} aria-hidden="true" />
            <span>
              {isRealEvidence
                ? 'สัญญาณตั้งต้น: ข้อมูลตรวจวัดจริง (RID · GISTDA · TMD)'
                : 'ระดับแบบจำลอง: เฝ้าระวัง (Simulation)'}
            </span>
          </div>
        </div>
      </header>

      {/* 2. Governance & Data-Mode Notice Banner */}
      <aside className={styles.governanceBanner} role="status" aria-label="Governance notice">
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
            <span className={styles.bannerBadge}>
              {isRealEvidence ? 'Observed inputs · TADIH internal index' : 'Simulation / Sample Dataset'}
            </span>
            <span className={styles.bannerTitle}>{bannerText}</span>
          </div>
          <p className={styles.bannerText}>
            {isRealEvidence ? (
              <>
                {disclaimer}{' '}
                <strong>ที่มาของข้อมูลแต่ละแถวแสดงด้วย badge</strong> RID Reservoir / GISTDA SAR / TMD Station
                พร้อมวันที่ตรวจวัดของตนเอง และค่าที่ต้นทางไม่เผยแพร่แสดงเป็น &quot;—&quot; เสมอ (ไม่แปลงเป็น 0){' '}
                สถานะตามมาตรฐาน Hub API: <code>meta.access: &quot;approved_public&quot;</code> |{' '}
                <code>sample: false</code> | <code>cache-control: no-store</code>
              </>
            ) : (
              <>
                หน้านี้ใช้ชุดข้อมูลสังเคราะห์เชิงโครงสร้าง (Deterministic Simulation) และอ่างเก็บน้ำจำลอง{' '}
                (<code>sim-rsv-*</code>) โดย<strong>ไม่ใช้ค่าจริงจากรายงานอ่างเก็บน้ำที่ยังรอตรวจสิทธิ์</strong>{' '}
                สถานะข้อมูลตามมาตรฐาน Hub API: <code>meta.access: &quot;metadata_only&quot;</code> |{' '}
                <code>sample: true</code> | <code>cache-control: no-store</code>
              </>
            )}
          </p>
        </div>
      </aside>

      {/* 2b. Measured layers actually read for this page */}
      <section className={styles.controlCard} aria-label="Data sources behind the signals">
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              {isRealEvidence ? 'ชั้นข้อมูลตรวจวัดที่นำมาใช้ในรอบนี้' : 'สถานะการเชื่อมต่อชั้นข้อมูลตรวจวัด'}
            </h2>
            <span className={styles.sectionNote}>
              ทุกชั้นอ่านจากคลังข้อมูลกลางของ hub เท่านั้น — ชั้นที่ยังไม่พร้อมจะแสดงว่า &quot;ไม่ใช้ในหน้านี้&quot;
              แทนที่จะถูกแทนที่ด้วยตัวเลขสมมติ
            </span>
          </div>
        </div>

        <div className={styles.rsvSummaryGrid}>
          {initialSources.map((source) => (
            <article key={source.id} className={styles.rsvCard}>
              <div className={styles.rsvTop}>
                <div>
                  <div className={styles.rsvName}>{SOURCE_LONG_NAME[source.id]}</div>
                  <div className={styles.rsvRegion}>{source.grain}</div>
                </div>
                <SourceBadge sourceId={source.id} />
              </div>
              <div className={styles.rsvStatsRow}>
                <div className={styles.rsvStatBox}>
                  <div>สถานะในหน้านี้</div>
                  <strong>{source.applied ? 'ใช้ค่าตรวจวัดจริง' : 'ไม่ใช้ในหน้านี้'}</strong>
                </div>
                <div className={styles.rsvStatBox}>
                  <div>บันทึก / สัญญาณ</div>
                  <strong>{source.recordCount} แถว → {source.signalCount} สัญญาณ</strong>
                </div>
              </div>
              <div className={styles.rsvStatsRow}>
                <div className={styles.rsvStatBox}>
                  <div>ข้อมูลถึงวัน</div>
                  <strong>{formatDate(source.dataAsOf)}</strong>
                </div>
                <div className={styles.rsvStatBox}>
                  <div>แหล่งอ้างอิง</div>
                  <strong>{source.attribution}</strong>
                </div>
              </div>
              <div className={styles.rsvAdvisory}>
                <strong>หมายเหตุ:</strong> {source.note}
              </div>
            </article>
          ))}
        </div>
      </section>

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
              คิดเป็น <strong>{formatShare(initialSummary.criticalFloodCount, initialSummary.totalReservoirs)}</strong> ของ
              {isRealEvidence
                ? `อ่างที่ RID รายงานระดับน้ำ ${initialSummary.totalReservoirs} แห่ง`
                : `อ่างจำลอง ${initialSummary.totalReservoirs} แห่ง`}
            </span>
            <span className={`${styles.kpiSubtag} ${isRealEvidence ? styles.tagInfo : styles.tagCritical}`}>
              {isRealEvidence ? 'RID ตรวจวัดจริง' : 'แบบจำลอง'}
            </span>
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
              คิดเป็น <strong>{formatShare(initialSummary.criticalDroughtCount, initialSummary.totalReservoirs)}</strong> ของ
              {isRealEvidence
                ? `อ่างที่ RID รายงานระดับน้ำ ${initialSummary.totalReservoirs} แห่ง`
                : `อ่างจำลอง ${initialSummary.totalReservoirs} แห่ง`}
            </span>
            <span className={`${styles.kpiSubtag} ${isRealEvidence ? styles.tagInfo : styles.tagWarning}`}>
              {isRealEvidence ? 'RID ตรวจวัดจริง' : 'แบบจำลอง'}
            </span>
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
            <span className={`${styles.kpiSubtag} ${isRealEvidence ? styles.tagInfo : styles.tagCritical}`}>
              {isRealEvidence
                ? `จังหวัดที่มีหลักฐาน ${initialProvinces.length} จว.`
                : 'พื้นที่สีแดง'}
            </span>
          </div>
        </article>

        {/* KPI 4: ดัชนีฝน */}
        <article className={`${styles.kpiCard} ${styles.rainIndex}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>
              {isRealEvidence ? 'ฝนรายวันที่สถานีรายงาน (เฉลี่ย)' : 'ดัชนีฝนสะสม 7 วัน (เฉลี่ย)'}
            </span>
            <div className={`${styles.kpiIconWrap} ${styles.blue}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />
                <path d="M16 14v6M8 14v6M12 16v6" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>
              {initialSummary.avgRainfall7dMm === null ? 'ไม่ทราบ' : initialSummary.avgRainfall7dMm}
            </span>
            {initialSummary.avgRainfall7dMm !== null && <span className={styles.kpiUnit}>มม.</span>}
          </div>
          <div className={styles.kpiFooter}>
            <span>
              {initialSummary.maxRainfall7dMm === null ? (
                'ยังไม่มีค่าสูงสุดที่หน่วยได้รับการยืนยัน — '
              ) : (
                <>สูงสุด <strong>{initialSummary.maxRainfall7dMm} มม.</strong> — </>
              )}
              {initialSummary.rainfallBasis}
            </span>
            <span className={`${styles.kpiSubtag} ${isRealEvidence ? styles.tagInfo : styles.tagWarning}`}>
              {isRealEvidence ? 'TMD สถานี' : 'แบบจำลอง'}
            </span>
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

            <label className={styles.selectLabel}>
              <span>ที่มาของสัญญาณ:</span>
              <select
                className={styles.selectInput}
                value={selectedSource}
                onChange={(e) => {
                  setSelectedSource(e.target.value as RiskSignalSourceId | 'all');
                  setSignalPage(1);
                }}
              >
                <option value="all">ทุกแหล่งตรวจวัด</option>
                {SOURCE_ORDER.map((sourceId) => (
                  <option key={sourceId} value={sourceId}>
                    {SOURCE_BADGE_STYLE[sourceId].label}
                  </option>
                ))}
              </select>
            </label>

            {(selectedRegion !== 'all' ||
              selectedRisk !== 'all' ||
              selectedType !== 'all' ||
              selectedSource !== 'all' ||
              searchQuery) && (
              <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className={styles.resultsMeta}>
            แสดงผล: <strong>{filteredProvinces.length}</strong> จังหวัด ·{' '}
            <strong>{filteredSignals.length}</strong> สัญญาณตั้งต้นจากทั้งหมด {initialSignals.length} รายการ
          </div>
        </div>
      </section>

      {/* 5. Navigation Tabs */}
      <nav className={styles.tabsContainer} aria-label="Views Navigation">
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'signals' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('signals')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          <span>สัญญาณตั้งต้นและที่มาของข้อมูล (RID / GISTDA / TMD)</span>
          <span className={styles.tabCounter}>{filteredSignals.length}</span>
        </button>

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
          <span>{isRealEvidence ? 'อ่างเก็บน้ำวิกฤติจากรายงาน RID' : 'อ่างเก็บน้ำจำลองวิกฤติ'}</span>
          <span className={styles.tabCounter}>{filteredReservoirs.length}</span>
        </button>
      </nav>

      {/* TAB CONTENT 0: Measured risk signals with their source */}
      {activeTab === 'signals' && (
        <section className={styles.matrixSection} aria-label="Measured risk signals and their sources">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>สัญญาณเตือนภัยรายตัว พร้อมแหล่งที่มาและวันที่ตรวจวัด</h2>
              <span className={styles.sectionNote}>
                แต่ละแถวคือค่าตรวจวัด 1 ค่าที่ผ่านเกณฑ์ภายในของ TADIH: ระดับน้ำอ่าง (reservoir × report_date),
                พื้นที่น้ำท่วมจาก polygon (จังหวัด DOPA, แยกหน่วยไร่/ตร.กม.) และฝน/อุณหภูมิ (station × day)
                — ระดับและคะแนน 0-100 เป็นดัชนีภายใน ไม่ใช่ประกาศของหน่วยงานต้นทาง
              </span>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.responsiveTableWrap}>
              <table className={styles.riskTable}>
                <thead>
                  <tr>
                    <th>ที่มาของสัญญาณ</th>
                    <th>พื้นที่ / ตำแหน่ง</th>
                    <th>ประเภทภัย</th>
                    <th>ค่าตรวจวัด</th>
                    <th>ระดับ (ดัชนีภายใน)</th>
                    <th>ตรวจวัดเมื่อ</th>
                    <th>หลักฐานและคำแนะนำเกษตร</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSignals.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>
                          <p>
                            {isRealEvidence
                              ? 'ไม่พบสัญญาณที่ผ่านเกณฑ์ภายในตามตัวกรองนี้ (absent ไม่ใช่ "ไม่มีภัย") — ลองล้างตัวกรอง หรือเปลี่ยนที่มาของสัญญาณ'
                              : 'หน้านี้กำลังแสดง envelope แบบจำลอง (meta.access = metadata_only) จึงยังไม่มีสัญญาณจากข้อมูลตรวจวัดจริง ระบบจะแสดงรายการก็ต่อเมื่ออ่าน active numeric batch ของ RID หรือ TMD จากคลังข้อมูลกลางได้'}
                          </p>
                          <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                            ล้างตัวกรอง
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedSignals.map((signal) => (
                      <tr key={signal.id}>
                        <td className={styles.provinceCell}>
                          <SourceBadge sourceId={signal.sourceId} />
                          <span className={styles.basinTag}>{signal.sourceName}</span>
                          <span className={styles.basinTag}>grain: {signal.provenance.grain}</span>
                        </td>
                        <td>
                          <div className={styles.provName}>
                            {signal.provinceName ?? signal.locationName ?? 'ไม่ระบุจังหวัดในต้นทาง'}
                          </div>
                          <span className={styles.basinTag}>{signal.region ?? 'ไม่ระบุภูมิภาคในทะเบียนอ้างอิง'}</span>
                          <span className={styles.basinTag}>{signal.locationName}</span>
                        </td>
                        <td>
                          <span className={styles.basinTag}>{HAZARD_LABEL[signal.hazard]}</span>
                        </td>
                        <td className={styles.waterIndexCell}>
                          <div className={styles.waterIndexLine}>
                            <span>{signal.metricLabel}:</span>
                            <strong>{formatMetric(signal.metricValue, signal.metricUnit)}</strong>
                          </div>
                          <div className={styles.waterIndexLine}>
                            <span>เกณฑ์:</span>
                            <strong>{signal.thresholdLabel}</strong>
                          </div>
                        </td>
                        <td className={styles.riskMeterCell}>
                          <div className={styles.meterHeader}>
                            <span className={styles.meterLabel}>{getRiskBadgeText(signal.level)}</span>
                            <span className={styles.meterScore}>{signal.score}/100</span>
                          </div>
                          <div className={styles.meterBarBg}>
                            <div
                              className={`${styles.meterBarFill} ${getRiskScoreClass(signal.score)}`}
                              style={{ width: `${signal.score}%` }}
                            />
                          </div>
                        </td>
                        <td className={styles.waterIndexCell}>
                          <div className={styles.waterIndexLine}>
                            <strong>{formatDate(signal.observedAt)}</strong>
                          </div>
                          <div className={styles.waterIndexLine}>
                            <span>run:</span>
                            <strong>{signal.provenance.runId ?? 'snapshot'}</strong>
                          </div>
                        </td>
                        <td className={styles.advisoryCell}>
                          <div className={styles.advisoryText}>{signal.evidenceText}</div>
                          <div className={styles.advisoryText}>{signal.advisoryText}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalSignalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <button
                type="button"
                className={styles.resetBtn}
                disabled={currentSignalPage === 1}
                onClick={() => setSignalPage((p) => Math.max(1, p - 1))}
              >
                ◀ ก่อนหน้า
              </button>
              <span style={{ fontSize: '13px', color: 'var(--muted, #4b6354)' }}>
                หน้า <strong>{currentSignalPage}</strong> จาก <strong>{totalSignalPages}</strong> ·{' '}
                แสดง {paginatedSignals.length} จาก {filteredSignals.length} สัญญาณ
              </span>
              <button
                type="button"
                className={styles.resetBtn}
                disabled={currentSignalPage === totalSignalPages}
                onClick={() => setSignalPage((p) => Math.min(totalSignalPages, p + 1))}
              >
                ถัดไป ▶
              </button>
            </div>
          )}

          <div className={styles.tableCard}>
            <div className={styles.expandedContainer}>
              <div className={styles.actionHeading}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>สถานะแต่ละชั้นข้อมูลและข้อจำกัดที่ต้องรู้ก่อนใช้</span>
              </div>
              <ul className={styles.actionList}>
                <li>
                  ชั้นอ่างเก็บน้ำ (RID): {layerGovernance.reservoirs === 'observed' ? 'ใช้ค่าตรวจวัดจริง' : 'ยังไม่มี batch จริง — รายการอ่างว่าง'}
                </li>
                <li>
                  ชั้นน้ำท่วม (GISTDA SAR): {layerGovernance.floodSignals === 'observed' ? 'ใช้ polygon ตรวจวัดจริง' : 'ไม่มีใน payload รอบนี้'}
                </li>
                <li>
                  ชั้นสถานีอากาศ (TMD): {layerGovernance.weatherSignals === 'observed' ? 'ใช้ค่าตรวจวัดจริง' : 'ไม่มีใน payload รอบนี้'}
                </li>
                <li>
                  ดัชนีความเสี่ยงรายจังหวัด:{' '}
                  {layerGovernance.provincialRiskIndex === 'observed_derived'
                    ? 'คำนวณจากหลักฐานที่เผยแพร่ (observed_derived)'
                    : 'แบบจำลองสาธิต (simulated)'}
                </li>
                <li>ไทม์ไลน์ 14 วัน: แบบจำลองเสมอ (dataKind=modelled) เพราะยังไม่มีแหล่ง forecast ที่ได้สิทธิ์เผยแพร่</li>
                <li>ค่าความชื้นดิน: แบบจำลองสาธิต — ค่าที่ต้นทางไม่เผยแพร่แสดงเป็น &quot;—&quot;</li>
              </ul>
              <div className={styles.reservoirLinks}>
                <span>บันทึก governance ของรอบข้อมูลนี้:</span>
                {warnings.map((warning, idx) => (
                  <span key={idx} className={styles.rsvTag}>
                    {warning}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB CONTENT 1: Provincial Risk Matrix & Table */}
      {activeTab === 'matrix' && (
        <section className={styles.matrixSection} aria-label="Provincial Risk Matrix">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>ดัชนีความเสี่ยงรายลุ่มน้ำและมาตรการเชิงเกษตร</h2>
              <span className={styles.sectionNote}>
                {isRealEvidence
                  ? 'แถว จังหวัดปรากฏเฉพาะเมื่อมีหลักฐานที่เผยแพร่รองรับ (polygon น้ำท่วมของ GISTDA, ฝน/อุณหภูมิจากสถานี TMD หรือบริหาน้ำน้อยของ RID ตามภูมิภาค) ดัชนี 0-100 และคำแนะนำเป็นผลการวิเคราะห์ภายในของ TADIH'
                  : 'ประเมินแยกหมวดน้ำหลากฉับพลัน (Flood) และภัยแล้ง (Drought) พร้อมพืชเศรษฐกิจที่ได้รับผลกระทบ'}
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
                    <th>ที่มาของหลักฐาน</th>
                    <th>ดัชนีน้ำท่วม (Flood Risk)</th>
                    <th>ดัชนีภัยแล้ง (Drought Risk)</th>
                    <th>ปริมาณฝน / ความชื้นดิน</th>
                    <th>พืชที่ได้รับผลกระทบ</th>
                    <th>คำแนะนำเชิงเกษตร (Agronomic Advisory)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProvinces.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className={styles.emptyState}>
                          <p>
                            {isRealEvidence
                              ? 'ไม่พบจังหวัดที่มีหลักฐานตรวจวัดตามเงื่อนไขนี้ — รายการที่หายไปหมายความว่า "ไม่ถูกตรวจพบ" ไม่ใช่ "ยืนยันว่าไม่เกิดภัย" กรุณาปรับเปลี่ยนตัวกรองหรือล้างคำค้นหา'
                              : 'ไม่พบข้อมูลจังหวัดตามเงื่อนไขที่เลือก กรุณาปรับเปลี่ยนตัวกรองหรือคำค้นหา'}
                          </p>
                          <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                            ล้างตัวกรอง
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProvinces.map((prov) => {
                      const isExpanded = expandedProvinceCode === prov.provinceCode;
                      const provinceSignals = signalsByProvince.get(prov.provinceCode) ?? [];
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
                            <td>
                              {(prov.evidenceSources ?? []).length === 0 ? (
                                <span className={styles.basinTag}>แบบจำลองสาธิต</span>
                              ) : (
                                <div className={styles.cropBadgeList}>
                                  {(prov.evidenceSources ?? []).map((sourceId) => (
                                    <SourceBadge key={sourceId} sourceId={sourceId} />
                                  ))}
                                </div>
                              )}
                              {prov.heatRiskLevel && (
                                <span
                                  className={styles.basinTag}
                                  title="ระดับความรุนแรงของสัญญาณร้อนจัดจากสถานี TMD (ดัชนีภายในของ TADIH)"
                                >
                                  ร้อนจัด: {getRiskBadgeText(prov.heatRiskLevel)} ({prov.heatRiskScore ?? 0}/100)
                                </span>
                              )}
                              <span className={styles.basinTag}>
                                {provinceSignals.length > 0
                                  ? `${provinceSignals.length} สัญญาณตั้งต้น`
                                  : 'ไม่มีแถวสัญญาณในชั้นนี้'}
                              </span>
                            </td>
                            <td className={styles.riskMeterCell}>
                              {prov.floodRiskScore === null ? (
                                <div className={styles.meterHeader}>
                                  <span className={styles.meterLabel}>ยังไม่มีข้อมูลน้ำท่วม</span>
                                  <span className={styles.meterScore}>ไม่ทราบ</span>
                                </div>
                              ) : (
                                <>
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
                                </>
                              )}
                            </td>
                            <td
                              className={styles.riskMeterCell}
                              title={prov.droughtRiskScore === null ? (prov.droughtBasis ?? undefined) : undefined}
                            >
                              {prov.droughtRiskScore === null ? (
                                <div className={styles.meterHeader}>
                                  <span className={styles.meterLabel}>ยังไม่มีข้อมูลภัยแล้ง</span>
                                  <span className={styles.meterScore}>ไม่ทราบ</span>
                                </div>
                              ) : (
                                <>
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
                                </>
                              )}
                            </td>
                            <td className={styles.waterIndexCell} title={prov.rainfallBasis ?? undefined}>
                              <div className={styles.waterIndexLine}>
                                <span>{isRealEvidence ? 'ฝนจากสถานี:' : 'ฝนสะสม:'}</span>
                                <strong>
                                  {prov.rainfall7dMm === null
                                    ? 'ยังไม่มีข้อมูล'
                                    : formatMeasure(prov.rainfall7dMm, 1, ' มม.')}
                                </strong>
                              </div>
                              <div className={styles.waterIndexLine}>
                                <span>ความชื้นดิน:</span>
                                <strong>{formatMeasure(prov.soilMoisturePercent, 1, '%')}</strong>
                              </div>
                              <span className={styles.basinTag}>
                                {prov.soilMoisturePercent === null && isRealEvidence
                                  ? 'ความชื้นดิน = ชั้นแบบจำลอง ไม่มีค่าตรวจวัด'
                                  : 'ตามเกณฑ์ของชุดข้อมูลนี้'}
                              </span>
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
                              <td colSpan={8}>
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

                                  {(prov.rainfallBasis || prov.droughtBasis || prov.observedAt) && (
                                    <div className={styles.reservoirLinks}>
                                      <span>ฐานของค่าที่แสดงในแถวนี้:</span>
                                      {prov.rainfallBasis && <span className={styles.rsvTag}>{prov.rainfallBasis}</span>}
                                      {prov.droughtBasis && <span className={styles.rsvTag}>{prov.droughtBasis}</span>}
                                      {prov.observedAt && (
                                        <span className={styles.rsvTag}>ตรวจวัดเมื่อ {formatDate(prov.observedAt)}</span>
                                      )}
                                    </div>
                                  )}

                                  {provinceSignals.length > 0 && (
                                    <div className={styles.actionList}>
                                      {provinceSignals.map((signal) => (
                                        <div key={signal.id} className={styles.waterIndexLine}>
                                          <SourceBadge sourceId={signal.sourceId} />
                                          <span>
                                            {signal.metricLabel} ={' '}
                                            {formatMetric(signal.metricValue, signal.metricUnit)} ·{' '}
                                            {getRiskBadgeText(signal.level)} ({signal.score}/100) ·{' '}
                                            {formatDate(signal.observedAt)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

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
              <br />
              <span className={styles.sectionNote}>
                ชั้นนี้เป็น dataKind = modelled ทั้งหมด (ยังไม่ใช้ค่าพยากรณ์ของหน่วยงานใด)
                {isRealEvidence
                  ? ' ใช้ประกอบภาพแนวโน้มเท่านั้น — ค่าตรวจวัดจริงอยู่คนละชั้นกับตารางนี้ ดูที่มาของแต่ละแถวได้ในแท็บ "สัญญาณตั้งต้นและที่มาของข้อมูล"'
                  : ' และไม่ใช่ประกาศเตือนภัยหรือพยากรณ์อย่างเป็นทางการ'}
              </span>
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
                {isRealEvidence
                  ? 'วิเคราะห์สถานการณ์อ่างเก็บน้ำวิกฤติจากรายงาน RID'
                  : 'วิเคราะห์สถานการณ์อ่างเก็บน้ำจำลองวิกฤติ (Simulation)'}
              </h2>
              <span className={styles.sectionNote}>
                {isRealEvidence
                  ? 'เกณฑ์ภายใน: อ่างที่ระดับน้ำเกิน 80% ของความจุเก็บกักจัดเป็นกลุ่มน้ำมาก ต่ำกว่า 30% จัดเป็นกลุ่มน้ำน้อย '
                    + 'ค่าที่แสดงคือระดับของ "ตัวอ่าง" ตามที่ RID เผยแพร่ (reservoir × report_date) ต้นทางไม่เผยแพร่ความจุออกแบบ '
                    + 'และไม่มีรหัสจังหวัดทางการ จึงห้ามอ่านเป็นค่าของทั้งจังหวัด'
                  : 'แบ่งกลุ่มอ่างจำลองที่มีปริมาณเกิน 80% (เสี่ยงล้น) และต่ำกว่า 30% (เสี่ยงแล้ง) จากแบบจำลองสาธิต — ไม่ใช่ข้อมูลจากรายงานต้นทาง'}
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
                <p>
                  {isRealEvidence
                    ? 'ไม่พบอ่างเก็บน้ำในกลุ่มที่เลือกจากรอบข้อมูลนี้ — หมายความว่าไม่มีอ่างที่ผ่านเกณฑ์ภายใน หรือชั้นข้อมูลของ RID ไม่พร้อมอ่าน ไม่ใช่ "ไม่มีน้ำมาก/น้ำน้อย"'
                    : 'ไม่พบอ่างเก็บน้ำในกลุ่มที่เลือก'}
                </p>
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
                      <div className={styles.rsvRegion}>{rsv.region ?? 'ต้นทางไม่ระบุภูมิภาคในชั้นข้อมูลนี้'}</div>
                    </div>
                    <span
                      className={`${styles.rsvPercentTag} ${
                        rsv.type === 'overflow' ? styles.overflow : styles.drought
                      }`}
                    >
                      {formatMeasure(rsv.percent, 1, '%')}
                    </span>
                  </div>

                  {(rsv.sourceId || rsv.sourceBadge) && (
                    <div className={styles.rsvStatsRow}>
                      <div className={styles.rsvStatBox}>
                        <div>ที่มาของค่า</div>
                        <strong>
                          <SourceBadge sourceId={rsv.sourceId ?? 'rid'} />
                        </strong>
                      </div>
                      <div className={styles.rsvStatBox}>
                        <div>ตรวจวัดเมื่อ</div>
                        <strong>{formatDate(rsv.observedAt)}</strong>
                      </div>
                    </div>
                  )}

                  <div className={styles.rsvStatsRow}>
                    <div className={styles.rsvStatBox}>
                      <div>ความจุเก็บกัก</div>
                      <strong>
                        {rsv.storage === null
                          ? '— (ต้นทางไม่เผยแพร่ในรอบนี้)'
                          : `${rsv.storage.toLocaleString()} ${rsv.volumeUnit ?? 'ล้าน ลบ.ม.'}`}
                      </strong>
                    </div>
                    <div className={styles.rsvStatBox}>
                      <div>น้ำปัจจุบัน</div>
                      <strong>
                        {rsv.volume === null
                          ? '—'
                          : `${rsv.volume.toLocaleString()} ${rsv.volumeUnit ?? 'ล้าน ลบ.ม.'}`}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.rsvAdvisory}>
                    <strong>การบริหารจัดการน้ำ:</strong> {rsv.advisoryNote}
                  </div>
                  <div className={styles.rsvAdvisory}>
                    <strong>สถานะที่ต้นทางรายงาน:</strong> {rsv.riskLabel}
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
