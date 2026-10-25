'use client';

import React, { useMemo, useState } from 'react';
import type {
  BasinFloodStat,
  DroughtClass,
  NdviScaleBand,
  PixelReliability,
  ProvinceSatelliteRisk,
  RepeatFloodClass,
  SatelliteLayer,
  SatellitePlatform,
  SatelliteRiskLevel,
  SatelliteScene,
  SatelliteSourceCatalogItem,
  SatelliteSummary,
} from '@/lib/hub/satellite-data';
import styles from './satellite-dashboard.module.css';

/** รูปร่างของ SATELLITE_GOVERNANCE ตามสัญญาของ lane 2A (ส่งผ่าน props จาก server page เพื่อไม่ดึงโมดูลข้อมูลเข้า client bundle) */
interface SatelliteGovernanceInfo {
  sample: boolean;
  access: 'metadata_only';
  version: string;
  bannerText: string;
  disclaimer: string;
  updatedAt: string;
}

interface SatelliteDashboardProps {
  initialSummary: SatelliteSummary;
  initialSources: SatelliteSourceCatalogItem[];
  initialProvinces: ProvinceSatelliteRisk[];
  initialBasins: BasinFloodStat[];
  initialScenes: SatelliteScene[];
  initialGovernance: SatelliteGovernanceInfo;
  initialWarnings: string[];
  initialNdviScale: NdviScaleBand[];
}

const REGION_ORDER = [
  'ภาคเหนือ',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคกลาง',
  'ภาคตะวันออก',
  'ภาคตะวันตก',
  'ภาคใต้',
];

const LAYER_OPTIONS: Array<{ value: SatelliteLayer; label: string }> = [
  { value: 'flood', label: 'ชั้นน้ำท่วม (Flood)' },
  { value: 'drought', label: 'ชั้นภัยแล้ง (Drought)' },
  { value: 'ndvi', label: 'ชั้นความเขียวขจี (NDVI)' },
];

const RISK_LABEL: Record<SatelliteRiskLevel, string> = {
  critical: 'วิกฤติ',
  warning: 'เฝ้าระวัง',
  normal: 'ปกติ',
};

const DROUGHT_LABEL: Record<DroughtClass, string> = {
  extreme: 'แล้งจัด',
  severe: 'แล้งรุนแรง',
  moderate: 'แล้งปานกลาง',
  mild: 'แล้งเล็กน้อย',
  none: 'ไม่พบภาวะแล้ง',
};

const DROUGHT_CLASS_STYLE: Record<DroughtClass, string> = {
  extreme: styles.droughtExtreme,
  severe: styles.droughtSevere,
  moderate: styles.droughtModerate,
  mild: styles.droughtMild,
  none: styles.droughtNone,
};

const RECURRENCE_LABEL: Record<RepeatFloodClass, string> = {
  repeat_5plus: 'ท่วมซ้ำ 5 ครั้งขึ้นไป',
  repeat_3_4: 'ท่วมซ้ำ 3–4 ครั้ง',
  repeat_1_2: 'ท่วมซ้ำ 1–2 ครั้ง',
  none: 'ไม่พบประวัติท่วมซ้ำ',
};

const RELIABILITY_LABEL: Record<PixelReliability, string> = {
  good: 'พิกเซลเชื่อถือได้ดี',
  marginal: 'คุณภาพพอใช้ (ควรระวัง)',
  cloud: 'มีเมฆบดบัง — ไม่น่าเชื่อถือ',
  no_data: 'ไม่มีข้อมูลพิกเซล — ไม่น่าเชื่อถือ',
};

const PLATFORM_LABEL: Record<SatellitePlatform, string> = {
  gistda: 'GISTDA',
  sentinel: 'Sentinel',
  modis: 'MODIS',
};

const PLATFORM_KEYS: SatellitePlatform[] = ['gistda', 'sentinel', 'modis'];

const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dtf = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dtf.format(d);
}

const RISK_RANK: Record<SatelliteRiskLevel, number> = { critical: 0, warning: 1, normal: 2 };

export function SatelliteDashboard({
  initialSummary,
  initialSources,
  initialProvinces,
  initialBasins,
  initialScenes,
  initialGovernance,
  initialWarnings,
  initialNdviScale,
}: SatelliteDashboardProps) {
  const [activeTab, setActiveTab] = useState<'schematic' | 'basins' | 'scenes'>('schematic');
  const [activeLayer, setActiveLayer] = useState<SatelliteLayer>('flood');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scenePlatform, setScenePlatform] = useState<SatellitePlatform | 'all'>('all');
  const [scenePage, setScenePage] = useState<number>(1);
  const scenePageSize = 10;

  const regionOptions = useMemo(() => {
    const present = Array.from(new Set(initialProvinces.map((p) => p.region)));
    const ordered = REGION_ORDER.filter((r) => present.includes(r));
    const extras = present.filter((r) => !REGION_ORDER.includes(r)).sort((a, b) => a.localeCompare(b, 'th'));
    return [{ value: 'all', label: 'ทุกภาค' }, ...[...ordered, ...extras].map((r) => ({ value: r, label: r }))];
  }, [initialProvinces]);

  const provinceOptions = useMemo(() => {
    return [...initialProvinces]
      .sort((a, b) => a.provinceName.localeCompare(b.provinceName, 'th'))
      .map((p) => ({ value: p.provinceCode, label: p.provinceName }));
  }, [initialProvinces]);

  const filteredProvinces = useMemo(() => {
    return initialProvinces.filter((p) => {
      if (selectedRegion !== 'all' && p.region !== selectedRegion) return false;
      if (selectedProvinceCode !== 'all' && p.provinceCode !== selectedProvinceCode) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = p.provinceName.toLowerCase().includes(q);
        const matchesBasin = p.basinName.toLowerCase().includes(q);
        const matchesRegion = p.region.toLowerCase().includes(q);
        const matchesCrop = p.flood.affectedCrops.some((c) => c.toLowerCase().includes(q));
        if (!matchesName && !matchesBasin && !matchesRegion && !matchesCrop) return false;
      }
      return true;
    });
  }, [initialProvinces, selectedRegion, selectedProvinceCode, searchQuery]);

  /** จังหวัดที่เลือกสำหรับแผงรายละเอียด (อาจอยู่นอกผลกรองปัจจุบัน) */
  const selectedProvince = useMemo(() => {
    if (selectedProvinceCode === 'all') return null;
    return initialProvinces.find((p) => p.provinceCode === selectedProvinceCode) ?? null;
  }, [initialProvinces, selectedProvinceCode]);

  /** แผนผังเชิงโครงสร้าง: จัดกลุ่มตามภาค แล้วเรียงตามระดับความเสี่ยงของชั้นที่เลือก (ไม่ใช่วางตามพิกัดจริง) */
  const regionGroups = useMemo(() => {
    const severity = (p: ProvinceSatelliteRisk): number => {
      if (activeLayer === 'flood') return -p.flood.inundatedAreaRai;
      if (activeLayer === 'drought') return p.drought.vci; // VCI ต่ำ = แล้งรุนแรง = ขึ้นก่อน
      return p.ndvi.ndvi; // NDVI ต่ำ = เครียด = ขึ้นก่อน
    };
    const riskOf = (p: ProvinceSatelliteRisk): SatelliteRiskLevel =>
      activeLayer === 'flood' ? p.flood.riskLevel : activeLayer === 'drought' ? p.drought.riskLevel : p.overallRisk;

    const byRegion = new Map<string, ProvinceSatelliteRisk[]>();
    for (const p of filteredProvinces) {
      const list = byRegion.get(p.region) ?? [];
      list.push(p);
      byRegion.set(p.region, list);
    }
    const regionNames = [...byRegion.keys()].sort((a, b) => {
      const ia = REGION_ORDER.indexOf(a);
      const ib = REGION_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b, 'th');
    });
    return regionNames.map((region) => ({
      region,
      provinces: byRegion
        .get(region)!
        .slice()
        .sort((a, b) => RISK_RANK[riskOf(a)] - RISK_RANK[riskOf(b)] || severity(a) - severity(b)),
    }));
  }, [filteredProvinces, activeLayer]);

  const filteredBasins = useMemo(() => {
    return initialBasins.filter((b) => selectedRegion === 'all' || b.region === selectedRegion);
  }, [initialBasins, selectedRegion]);

  const filteredScenes = useMemo(() => {
    return initialScenes.filter((s) => {
      if (scenePlatform !== 'all' && s.platform !== scenePlatform) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          s.sceneId.toLowerCase().includes(q) ||
          s.sensor.toLowerCase().includes(q) ||
          s.platform.toLowerCase().includes(q) ||
          (s.tileId ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialScenes, scenePlatform, searchQuery]);

  const totalScenePages = Math.max(1, Math.ceil(filteredScenes.length / scenePageSize));
  const currentScenePage = Math.min(scenePage, totalScenePages);
  const paginatedScenes = useMemo(() => {
    const start = (currentScenePage - 1) * scenePageSize;
    return filteredScenes.slice(start, start + scenePageSize);
  }, [filteredScenes, currentScenePage]);

  const handleResetFilters = () => {
    setSelectedRegion('all');
    setSelectedProvinceCode('all');
    setSearchQuery('');
    setScenePlatform('all');
    setScenePage(1);
  };

  const hasActiveFilters =
    selectedRegion !== 'all' || selectedProvinceCode !== 'all' || searchQuery.trim() !== '' || scenePlatform !== 'all';

  /** แบ่งช่วง NDVI ตามแถบจาก initialNdviScale (ห้าม hardcode แถบ/สี) */
  const ndviBandOf = (value: number): NdviScaleBand | null => {
    if (initialNdviScale.length === 0) return null;
    for (const band of initialNdviScale) {
      if (value >= band.min && value <= band.max) return band;
    }
    return value < initialNdviScale[0].min
      ? initialNdviScale[0]
      : initialNdviScale[initialNdviScale.length - 1];
  };

  const ndviMarkerPercent = useMemo(() => {
    if (!selectedProvince || initialNdviScale.length === 0) return null;
    const min = initialNdviScale[0].min;
    const max = initialNdviScale[initialNdviScale.length - 1].max;
    if (max <= min) return null;
    const pct = ((selectedProvince.ndvi.ndvi - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [selectedProvince, initialNdviScale]);

  const tileClassFor = (p: ProvinceSatelliteRisk): string => {
    if (activeLayer === 'ndvi' && (p.ndvi.pixelReliability === 'cloud' || p.ndvi.pixelReliability === 'no_data')) {
      return styles.tileUnreliable;
    }
    if (activeLayer === 'flood') {
      return p.flood.riskLevel === 'critical'
        ? styles.riskCritical
        : p.flood.riskLevel === 'warning'
          ? styles.riskWarning
          : styles.riskNormal;
    }
    if (activeLayer === 'drought') {
      return DROUGHT_CLASS_STYLE[p.drought.droughtClass];
    }
    const band = ndviBandOf(p.ndvi.ndvi);
    return band ? '' : styles.riskNormal;
  };

  const tileStyleFor = (p: ProvinceSatelliteRisk): React.CSSProperties | undefined => {
    if (activeLayer !== 'ndvi') return undefined;
    if (p.ndvi.pixelReliability === 'cloud' || p.ndvi.pixelReliability === 'no_data') return undefined;
    const band = ndviBandOf(p.ndvi.ndvi);
    return band ? { backgroundColor: band.color } : undefined;
  };

  const tileValueText = (p: ProvinceSatelliteRisk): string => {
    if (activeLayer === 'flood') {
      return `ท่วมขัง ${nf0.format(p.flood.inundatedAreaRai)} ไร่ · ${RISK_LABEL[p.flood.riskLevel]}`;
    }
    if (activeLayer === 'drought') {
      return `${DROUGHT_LABEL[p.drought.droughtClass]} · VCI ${nf.format(p.drought.vci)}`;
    }
    if (p.ndvi.pixelReliability === 'cloud' || p.ndvi.pixelReliability === 'no_data') {
      return `${RELIABILITY_LABEL[p.ndvi.pixelReliability]}`;
    }
    const band = ndviBandOf(p.ndvi.ndvi);
    return `NDVI ${nf2.format(p.ndvi.ndvi)}${band ? ` · ${band.label}` : ''}`;
  };

  const reliabilityTagClass = (r: PixelReliability): string => {
    if (r === 'good') return `${styles.reliabilityTag} ${styles.reliabilityGood}`;
    if (r === 'marginal') return `${styles.reliabilityTag} ${styles.reliabilityMarginal}`;
    return `${styles.reliabilityTag} ${styles.reliabilityBad}`;
  };

  const isUnreliable = (r: PixelReliability): boolean => r === 'cloud' || r === 'no_data';

  return (
    <div className={styles.container}>
      {/* 1. Governance & Licence Banner */}
      <aside className={styles.governanceBanner} role="status" aria-label="ประกาศสถานะข้อมูลดาวเทียม">
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
            <span className={styles.bannerTitle}>{initialGovernance.bannerText}</span>
          </div>
          <p className={styles.bannerDisclaimer}>{initialGovernance.disclaimer}</p>
          <div className={styles.bannerMeta}>
            สถานะข้อมูลตามมาตรฐาน Hub API: <code>meta.access: &quot;{initialGovernance.access}&quot;</code> |{' '}
            <code>sample: {String(initialGovernance.sample)}</code> | เวอร์ชันชุดข้อมูล{' '}
            <code>{initialGovernance.version}</code> | ปรับปรุงล่าสุด {formatDateTime(initialGovernance.updatedAt)}
          </div>
        </div>
      </aside>

      {/* ข้อจำกัดของชุดข้อมูล (SATELLITE_WARNINGS) */}
      {initialWarnings.length > 0 && (
        <section className={styles.limitationsPanel} aria-label="ข้อจำกัดของชุดข้อมูลดาวเทียม">
          <div className={styles.limitationsTitle}>ข้อจำกัดของชุดข้อมูลที่ต้องทราบก่อนใช้อ้างอิง</div>
          <ul className={styles.limitationsList}>
            {initialWarnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. Dashboard Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.titleGroup}>
            <h1>ศูนย์ข้อมูลดาวเทียมเกษตร: น้ำท่วม ภัยแล้ง และความเขียวขจีของพืชพรรณ</h1>
            <p className={styles.subtitle}>
              {initialSummary.headline} — {initialSummary.subheadline} (ข้อมูล ณ{' '}
              {formatDateTime(initialSummary.latestAcquiredAt)} · วันที่รายงาน {initialSummary.reportDate})
            </p>
          </div>
          <div className={styles.liveBadge}>
            <span>ชุดข้อมูลสาธิตจากดาวเทียม (EO Sample · metadata_only)</span>
          </div>
        </div>
      </header>

      {/* 3. KPI Summary Cards — ไร่และ ตร.กม. แสดงแยกหน่วยกัน ห้ามนำไปบวกรวม */}
      <section className={styles.kpiGrid} aria-label="สรุปสถานการณ์ภาพรวม">
        <article className={`${styles.kpiCard} ${styles.floodAlert}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>พื้นที่น้ำท่วมขัง (ชุดจังหวัดสาธิต)</span>
            <div className={`${styles.kpiIconWrap} ${styles.blue}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" />
                <path d="M12 18v-4" />
                <path d="m9 15 3-3 3 3" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiDualRow}>
            <div className={styles.kpiFigure}>
              <span className={styles.kpiFigureLabel}>หน่วยไร่</span>
              <span className={styles.kpiValue}>{nf0.format(initialSummary.totalInundatedAreaRai)}</span>
              <span className={styles.kpiUnit}>ไร่</span>
            </div>
            <div className={styles.kpiFigure}>
              <span className={styles.kpiFigureLabel}>หน่วยตารางกม.</span>
              <span className={styles.kpiValue}>{nf0.format(initialSummary.totalInundatedAreaSqKm)}</span>
              <span className={styles.kpiUnit}>ตร.กม.</span>
            </div>
          </div>
          <div className={styles.kpiFooter}>
            <span>
              จังหวัดน้ำท่วมซ้ำซาก <strong>{initialSummary.repeatFloodProvinceCount}</strong> แห่ง
            </span>
            <span className={`${styles.kpiSubtag} ${styles.tagInfo}`}>แสดงแยกสองหน่วย</span>
          </div>
        </article>

        <article className={`${styles.kpiCard} ${styles.droughtAlert}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>จังหวัดภาวะแล้งรุนแรง</span>
            <div className={`${styles.kpiIconWrap} ${styles.orange}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{initialSummary.severeDroughtProvinceCount}</span>
            <span className={styles.kpiUnit}>จังหวัด</span>
          </div>
          <div className={styles.kpiFooter}>
            <span>จากดัชนี VCI/TCI/SPI-3 ในชุดสาธิต</span>
            <span className={`${styles.kpiSubtag} ${styles.tagWarning}`}>เฝ้าระวัง</span>
          </div>
        </article>

        <article className={`${styles.kpiCard} ${styles.ndviAlert}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>ความเขียวขจีเฉลี่ย (NDVI)</span>
            <div className={`${styles.kpiIconWrap} ${styles.green}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{nf2.format(initialSummary.avgNdvi)}</span>
            <span className={styles.kpiUnit}>ค่าดัชนีเฉลี่ย</span>
          </div>
          <div className={styles.kpiFooter}>
            <span>
              ช่วงต่ำสุด–สูงสุด <strong>{nf2.format(initialSummary.minNdvi)}–{nf2.format(initialSummary.maxNdvi)}</strong>
            </span>
            <span className={`${styles.kpiSubtag} ${styles.tagOk}`}>พืชพรรณ</span>
          </div>
        </article>

        <article className={`${styles.kpiCard} ${styles.sceneAlert}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>ฉากดาวเทียมในชุดสาธิต</span>
            <div className={`${styles.kpiIconWrap} ${styles.purple}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                <path d="m2 17 10 5 10-5" />
                <path d="m2 12 10 5 10-5" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiValue}>{nf0.format(initialSummary.totalScenes)}</span>
            <span className={styles.kpiUnit}>ฉาก · {initialSummary.platformsCovered} ระบบ</span>
          </div>
          <div className={styles.kpiFooter}>
            <span>
              จังหวัดในชุดสาธิต <strong>{initialSummary.provincesCovered}</strong> จังหวัด (ไม่ใช่การครอบคลุมทั้งประเทศ)
            </span>
            <span className={`${styles.kpiSubtag} ${styles.tagInfo}`}>ตัวอย่าง</span>
          </div>
        </article>
      </section>

      <p className={styles.coverageNote}>
        หมายเหตุ: ตัวเลขทั้งหมดมาจาก<strong>ชุดข้อมูลสาธิต (demonstration subset)</strong> ครอบคลุม{' '}
        <strong>{initialSummary.provincesCovered}</strong> จังหวัดที่มีฉากดาวเทียมตัวอย่างเท่านั้น —{' '}
        รหัสจังหวัด 77 รหัสเป็นทะเบียนรายชื่อ ไม่ใช่ขอบเขตการครอบคลุมข้อมูล
        และห้ามตีความว่าเป็นสถิติระดับประเทศ พื้นที่ไร่และตารางกิโลเมตรเป็นตัวเลขคนละหน่วย แสดงแยกกัน ห้ามนำไปบวกรวม
      </p>

      {/* 4. Licence status panel — สถานะสิทธิ์รายแหล่งข้อมูล */}
      <section className={styles.licenceSection} aria-label="สถานะสิทธิ์การเผยแพร่ข้อมูลรายแหล่ง">
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>สถานะสิทธิ์และการตรวจทานแหล่งข้อมูลดาวเทียม</h2>
            <span className={styles.sectionNote}>
              ทุกแหล่งอยู่ระหว่างรอตรวจสิทธิ์ (licenseStatus: pending) และยังไม่ผ่านการยืนยันที่ runtime — ห้ามอ้างอิงเผยแพร่
            </span>
          </div>
        </div>
        <div className={styles.licenceGrid}>
          {initialSources.map((source) => (
            <article key={source.sourceId} className={styles.licenceCard}>
              <div className={styles.licenceCardHead}>
                <div>
                  <div className={styles.licenceOwner}>{source.owner}</div>
                  <div className={styles.licenceName}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.name}
                    </a>
                  </div>
                </div>
                <span className={`${styles.badgeStatus} ${styles.pending}`}>{source.licenseStatus}</span>
              </div>
              <dl className={styles.licenceMetaList}>
                <div>
                  <dt>สถานะแหล่ง</dt>
                  <dd>{source.status}</dd>
                </div>
                <div>
                  <dt>runtimeVerified</dt>
                  <dd>{String(source.runtimeVerified)} (ยังไม่ยืนยัน)</dd>
                </div>
                <div>
                  <dt>จำนวนแถวตรวจสิทธิ์ระดับ resource</dt>
                  <dd>{source.licenseReviewRows} รายการ</dd>
                </div>
                <div>
                  <dt>ผลลัพธ์การตรวจทาน</dt>
                  <dd>{source.reviewOutcome ?? 'ไม่ทราบค่า'}</dd>
                </div>
              </dl>
              {source.licenseReviewRows === 0 ? (
                <div className={`${styles.licenceReviewState} ${styles.licenceReviewNone}`}>
                  ยังไม่มีการตรวจสิทธิ์ระดับ resource (discovery_required) —
                  ไม่มีแถว license review สำหรับแหล่งนี้ จึงยังระบุชนิดสัญญาอนุญาตไม่ได้ (ไม่ใช่ &quot;ไม่ติดลิขสิทธิ์&quot;)
                </div>
              ) : (
                <div className={`${styles.licenceReviewState} ${styles.licenceReviewPending}`}>
                  ตรวจสิทธิ์ระดับ resource แล้ว {source.licenseReviewRows} รายการ แต่สถานะยัง <strong>pending</strong>{' '}
                  และ <strong>projectPublicationApproved: {String(source.projectPublicationApproved)}</strong>{' '}
                  (ยังไม่อนุมัติให้เผยแพร่) — {source.unresolved.length > 0
                    ? `ประเด็นค้าง: ${source.unresolved.join(', ')}`
                    : 'ไม่มีประเด็นค้างบันทึกไว้'}
                </div>
              )}
              {source.licenseReviewRows > 0 && (
                <>
                  <dl className={styles.licenceMetaList}>
                    <div>
                      <dt>สัญญาอนุญาตที่ประกาศ</dt>
                      <dd>
                        {source.declaredLicense ?? 'ไม่ทราบค่า'}
                        {source.licenseUrl ? (
                          <>
                            {' · '}
                            <a href={source.licenseUrl} target="_blank" rel="noopener noreferrer">
                              ดูเอกสารสิทธิ์
                            </a>
                          </>
                        ) : null}
                      </dd>
                    </div>
                  </dl>
                  {source.attributionText ? (
                    <div className={styles.attributionText}>
                      <strong>ข้อความอ้างอิงที่ต้องแสดง (attribution):</strong> {source.attributionText}
                    </div>
                  ) : (
                    <div className={styles.attributionText}>ไม่มีข้อความ attribution บันทึกไว้ — ไม่ทราบค่า</div>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* 5. Controls & Filters */}
      <section className={styles.controlCard} aria-label="ตัวกรองและคำค้นหา">
        <div className={styles.searchAndTypeRow}>
          <div className={styles.searchBox}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="ค้นหาชื่อจังหวัด ลุ่มน้ำ ภาค หรือพืชที่ได้รับผลกระทบ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="ค้นหาจังหวัด ลุ่มน้ำ หรือพืชผล"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.resetBtn}
                onClick={() => setSearchQuery('')}
                title="ล้างข้อความค้นหา"
                aria-label="ล้างข้อความค้นหา"
              >
                ✕
              </button>
            )}
          </div>

          <div className={styles.typeButtonGroup} role="radiogroup" aria-label="ชั้นข้อมูลที่แสดงบนแผนผัง">
            {LAYER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={activeLayer === opt.value}
                className={`${styles.typeBtn} ${activeLayer === opt.value ? styles.active : ''}`}
                onClick={() => setActiveLayer(opt.value)}
              >
                {opt.label}
              </button>
            ))}
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
                aria-label="กรองตามภูมิภาค"
              >
                {regionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.selectLabel}>
              <span>จังหวัด:</span>
              <select
                className={styles.selectInput}
                value={selectedProvinceCode}
                onChange={(e) => {
                  setSelectedProvinceCode(e.target.value);
                  setScenePage(1);
                }}
                aria-label="เลือกจังหวัด"
              >
                <option value="all">ทุกจังหวัดในชุดสาธิต</option>
                {provinceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {hasActiveFilters && (
              <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>

          <div className={styles.resultsMeta}>
            แสดงผล: <strong>{filteredProvinces.length}</strong> จังหวัดในเงื่อนไข (จากชุดสาธิต{' '}
            {initialProvinces.length} จังหวัด)
          </div>
        </div>
      </section>

      {/* 6. Navigation Tabs */}
      <nav className={styles.tabsContainer} aria-label="มุมมองการแสดงผล">
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'schematic' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('schematic')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
          <span>แผนผังกลุ่มจังหวัดและมาตร NDVI</span>
          <span className={styles.tabCounter}>{filteredProvinces.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'basins' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('basins')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" />
          </svg>
          <span>ตารางน้ำท่วมรายลุ่มน้ำ</span>
          <span className={styles.tabCounter}>{filteredBasins.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'scenes' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('scenes')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 2 2 7l10 5 10-5-10-5Z" />
            <path d="m2 17 10 5 10-5" />
            <path d="m2 12 10 5 10-5" />
          </svg>
          <span>ทะเบียนฉากดาวเทียม (Scene Catalog)</span>
          <span className={styles.tabCounter}>{filteredScenes.length}</span>
        </button>
      </nav>

      {/* TAB 1: NDVI ramp + non-geographic schematic + detail panel */}
      {activeTab === 'schematic' && (
        <section className={styles.section} aria-label="แผนผังเชิงโครงสร้างกลุ่มจังหวัดและมาตรความเขียวขจี">
          {/* NDVI vigour ramp */}
          <div className={styles.ndviRampCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>มาตรความเขียวขจีของพืชพรรณ (NDVI Vigour Scale)</h2>
                <span className={styles.sectionNote}>
                  แถบสีและช่วงค่ามาจากตาราง NDVI_SCALE ของชุดข้อมูล — เรียงจากแล้งจัด (ซ้าย) ไปเขียวสมบูรณ์ (ขวา)
                </span>
              </div>
            </div>
            {initialNdviScale.length === 0 ? (
              <div className={styles.detailPlaceholder}>ไม่มีข้อมูลมาตร NDVI ในชุดข้อมูลนี้</div>
            ) : (
              <>
                <div className={styles.rampTrackWrap}>
                  {selectedProvince && ndviMarkerPercent !== null && (
                    <div
                      className={styles.rampMarker}
                      style={{ left: `${ndviMarkerPercent}%` }}
                      aria-label={`ตำแหน่งค่า NDVI ของ${selectedProvince.provinceName}`}
                    >
                      <span className={styles.rampMarkerFlag}>
                        {selectedProvince.provinceName} · {nf2.format(selectedProvince.ndvi.ndvi)}
                      </span>
                      <span className={styles.rampMarkerNeedle} aria-hidden="true" />
                    </div>
                  )}
                  <div className={styles.rampTrack} role="img" aria-label="แถบมาตรความเขียวขจี NDVI จากแล้งจัดถึงเขียวสมบูรณ์">
                    {initialNdviScale.map((band) => (
                      <div key={band.id} className={styles.rampBand} style={{ backgroundColor: band.color }}>
                        <span className={styles.rampBandLabel}>{band.label}</span>
                        <span className={styles.rampBandRange}>
                          {nf2.format(band.min)} – {nf2.format(band.max)}
                        </span>
                        <span className={styles.rampBandDesc}>{band.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {selectedProvince ? (
                  <div className={styles.rampReadoutRow}>
                    <span>
                      <strong>{selectedProvince.provinceName}:</strong> NDVI {nf2.format(selectedProvince.ndvi.ndvi)} ·
                      EVI {nf2.format(selectedProvince.ndvi.evi)} · NDMI {nf2.format(selectedProvince.ndvi.ndmi)}
                    </span>
                    <span>
                      ความผิดปกติเทียบฐาน <strong>{nf.format(selectedProvince.ndvi.anomalyVsBaselinePercent)}%</strong>{' '}
                      (ช่วงฐาน {selectedProvince.ndvi.baselinePeriod})
                    </span>
                    <span>พิกเซลตัวอย่าง {nf0.format(selectedProvince.ndvi.samplePixelCount)} จุด</span>
                    <span className={reliabilityTagClass(selectedProvince.ndvi.pixelReliability)}>
                      {isUnreliable(selectedProvince.ndvi.pixelReliability) && '⚠ '}
                      {RELIABILITY_LABEL[selectedProvince.ndvi.pixelReliability]}
                    </span>
                    {isUnreliable(selectedProvince.ndvi.pixelReliability) && (
                      <span>
                        ค่าดัชนีที่แสดงอาจคลาดเคลื่อนสูงจากเมฆบดบัง/ไม่มีข้อมูล ไม่ควรใช้เป็นค่าพืชพรรณจริงของจังหวัด
                      </span>
                    )}
                  </div>
                ) : (
                  <div className={styles.rampReadoutRow}>
                    <span>เลือกจังหวัดจากแผนผังด้านล่างเพื่อดูตำแหน่งค่า NDVI บนมาตรนี้</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Non-geographic schematic */}
          <div className={styles.schematicCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>
                  แผนผังกลุ่มจังหวัดตามชั้นข้อมูล:{' '}
                  {LAYER_OPTIONS.find((o) => o.value === activeLayer)?.label ?? activeLayer}
                </h2>
                <span className={styles.sectionNote}>
                  แต่ละช่องคือหนึ่งจังหวัดในชุดสาธิต เรียงตามระดับความเสี่ยงภายในกลุ่มภาค — คลิกหรือกด Enter เพื่อเปิดรายละเอียด
                </span>
              </div>
            </div>

            <p className={styles.schematicDisclaimer}>
              แผนผังเชิงโครงสร้าง (schematic) จัดกลุ่มตามภูมิภาค — <strong>ไม่ใช่แผนที่จริง</strong>{' '}
              ตำแหน่งและขนาดของช่องไม่ได้สะท้อนที่ตั้งหรือพื้นที่จริงของจังหวัด
              เนื่องจากคลังข้อมูลนี้ยังไม่ได้รับข้อมูลขอบเขตจังหวัด (verification_status:{' '}
              <code>code_name_verified_geometry_not_supplied</code>) จึงไม่มีการวาดเส้นขอบจังหวัดหรือวางตำแหน่งตามพิกัดภูมิศาสตร์
            </p>

            {/* Legend for active layer */}
            <div className={styles.schematicLegend} aria-label="คำอธิบายสัญลักษณ์สีบนแผนผัง">
              {activeLayer === 'flood' && (
                <>
                  <span className={styles.legendChip}>
                    <span className={`${styles.legendSwatch} ${styles.riskCritical}`} aria-hidden="true" /> วิกฤติ
                  </span>
                  <span className={styles.legendChip}>
                    <span className={`${styles.legendSwatch} ${styles.riskWarning}`} aria-hidden="true" /> เฝ้าระวัง
                  </span>
                  <span className={styles.legendChip}>
                    <span className={`${styles.legendSwatch} ${styles.riskNormal}`} aria-hidden="true" /> ปกติ
                  </span>
                </>
              )}
              {activeLayer === 'drought' &&
                (Object.keys(DROUGHT_LABEL) as DroughtClass[]).map((cls) => (
                  <span key={cls} className={styles.legendChip}>
                    <span className={`${styles.legendSwatch} ${DROUGHT_CLASS_STYLE[cls]}`} aria-hidden="true" />
                    {DROUGHT_LABEL[cls]}
                  </span>
                ))}
              {activeLayer === 'ndvi' && (
                <>
                  {initialNdviScale.map((band) => (
                    <span key={band.id} className={styles.legendChip}>
                      <span
                        className={styles.legendSwatch}
                        style={{ backgroundColor: band.color }}
                        aria-hidden="true"
                      />
                      {band.label}
                    </span>
                  ))}
                  <span className={styles.legendChip}>
                    <span className={`${styles.legendSwatch} ${styles.unreliable}`} aria-hidden="true" />
                    พิกเซลไม่น่าเชื่อถือ (เมฆ/ไม่มีข้อมูล)
                  </span>
                </>
              )}
            </div>

            {regionGroups.length === 0 ? (
              <div className={styles.emptyState}>
                <p>
                  ไม่พบจังหวัดในชุดข้อมูลสาธิตที่ตรงกับเงื่อนไขที่เลือก
                  จังหวัดที่อยู่นอกชุดสาธิตจะไม่มีข้อมูลในหน้านี้ กรุณาปรับคำค้นหาหรือตัวกรอง
                </p>
                <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                  ล้างตัวกรองทั้งหมด
                </button>
              </div>
            ) : (
              regionGroups.map((group) => (
                <div key={group.region} className={styles.regionGroup}>
                  <div className={styles.regionHeader}>
                    <h3 className={styles.regionName}>{group.region}</h3>
                    <span className={styles.regionMeta}>
                      {group.provinces.length} จังหวัดในชุดสาธิต · เรียงตามระดับความเสี่ยงของชั้นที่เลือก
                    </span>
                  </div>
                  <div className={styles.provinceTileGrid}>
                    {group.provinces.map((prov) => {
                      const isSelected = selectedProvinceCode === prov.provinceCode;
                      return (
                        <button
                          key={prov.provinceCode}
                          type="button"
                          className={`${styles.provinceTile} ${tileClassFor(prov)} ${isSelected ? styles.selected : ''}`}
                          style={tileStyleFor(prov)}
                          onClick={() => setSelectedProvinceCode(isSelected ? 'all' : prov.provinceCode)}
                          aria-pressed={isSelected}
                          aria-label={`${prov.provinceName} (${prov.region}) — ${tileValueText(prov)}`}
                          title={`${prov.provinceName} · ${prov.basinName}`}
                        >
                          <span className={styles.tileName}>{prov.provinceName}</span>
                          <span className={styles.tileValue}>{tileValueText(prov)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Province detail panel */}
          <div className={styles.detailPanel} aria-label="รายละเอียดจังหวัดที่เลือก">
            {selectedProvince === null ? (
              <div className={styles.detailPlaceholder}>
                ยังไม่ได้เลือกจังหวัด — คลิกช่องจังหวัดบนแผนผัง หรือเลือกจากแถบ &quot;จังหวัด&quot; ด้านบน
                เพื่อดูรายละเอียดสามชั้นข้อมูล (น้ำท่วม / ภัยแล้ง / NDVI) และ metadata ของฉากดาวเทียมล่าสุด
              </div>
            ) : (
              <>
                <div className={styles.detailHead}>
                  <div>
                    <h2 className={styles.detailTitle}>{selectedProvince.provinceName}</h2>
                    <div className={styles.detailSub}>
                      รหัสจังหวัด {selectedProvince.provinceCode} · {selectedProvince.region} · ลุ่มน้ำ{' '}
                      {selectedProvince.basinName}
                    </div>
                  </div>
                  <span className={`${styles.badgeStatus} ${styles[selectedProvince.overallRisk]}`}>
                    สถานะรวม: {RISK_LABEL[selectedProvince.overallRisk]}
                  </span>
                </div>

                <div className={styles.detailColumns}>
                  <div className={styles.layerBlocks}>
                    {/* Flood block */}
                    <div className={`${styles.layerBlock} ${styles.floodBlock}`}>
                      <div className={styles.layerBlockHead}>
                        <span className={styles.layerBlockTitle}>ชั้นน้ำท่วม (Flood Inundation)</span>
                        <span className={`${styles.badgeStatus} ${styles[selectedProvince.flood.riskLevel]}`}>
                          {RISK_LABEL[selectedProvince.flood.riskLevel]}
                        </span>
                      </div>
                      <dl className={styles.metricGrid}>
                        <div>
                          <dt>พื้นที่น้ำท่วมขัง (ไร่)</dt>
                          <dd>{nf0.format(selectedProvince.flood.inundatedAreaRai)} ไร่</dd>
                        </div>
                        <div>
                          <dt>พื้นที่น้ำท่วมขัง (ตร.กม.)</dt>
                          <dd>{nf0.format(selectedProvince.flood.inundatedAreaSqKm)} ตร.กม.</dd>
                        </div>
                        <div>
                          <dt>ระดับท่วมซ้ำ</dt>
                          <dd>{RECURRENCE_LABEL[selectedProvince.flood.recurrenceClass]}</dd>
                        </div>
                        <div>
                          <dt>ดัชนีความถี่น้ำท่วม</dt>
                          <dd>{nf.format(selectedProvince.flood.floodFrequencyIndex)}</dd>
                        </div>
                        <div>
                          <dt>ความลึกน้ำท่วมสูงสุด</dt>
                          <dd>
                            {selectedProvince.flood.maxInundationDepthCm === null
                              ? 'ไม่ทราบค่า'
                              : `${nf.format(selectedProvince.flood.maxInundationDepthCm)} ซม.`}
                          </dd>
                        </div>
                      </dl>
                      {selectedProvince.flood.repeatFloodEventYears.length > 0 && (
                        <div className={styles.yearTagList} aria-label="ปีที่มีเหตุการณ์น้ำท่วมซ้ำ">
                          {selectedProvince.flood.repeatFloodEventYears.map((year) => (
                            <span key={year} className={styles.yearTag}>
                              {year}
                            </span>
                          ))}
                        </div>
                      )}
                      {selectedProvince.flood.affectedCrops.length > 0 && (
                        <div className={styles.cropBadgeList} aria-label="พืชที่ได้รับผลกระทบ">
                          {selectedProvince.flood.affectedCrops.map((crop, idx) => (
                            <span key={idx} className={styles.cropBadge}>
                              {crop}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className={styles.advisoryBox}>
                        <strong>คำแนะนำ:</strong> {selectedProvince.flood.advisory}
                      </div>
                    </div>

                    {/* Drought block */}
                    <div className={`${styles.layerBlock} ${styles.droughtBlock}`}>
                      <div className={styles.layerBlockHead}>
                        <span className={styles.layerBlockTitle}>ชั้นภัยแล้ง (Drought Indices)</span>
                        <span className={`${styles.badgeStatus} ${styles[selectedProvince.drought.riskLevel]}`}>
                          {RISK_LABEL[selectedProvince.drought.riskLevel]}
                        </span>
                      </div>
                      <dl className={styles.metricGrid}>
                        <div>
                          <dt>ระดับความแล้ง</dt>
                          <dd>{DROUGHT_LABEL[selectedProvince.drought.droughtClass]}</dd>
                        </div>
                        <div>
                          <dt>VCI</dt>
                          <dd>{nf.format(selectedProvince.drought.vci)}</dd>
                        </div>
                        <div>
                          <dt>TCI</dt>
                          <dd>{nf.format(selectedProvince.drought.tci)}</dd>
                        </div>
                        <div>
                          <dt>SPI-3 เดือน</dt>
                          <dd>{nf.format(selectedProvince.drought.spi3m)}</dd>
                        </div>
                      </dl>
                      <div className={styles.advisoryBox}>
                        <strong>คำแนะนำ:</strong> {selectedProvince.drought.advisory}
                      </div>
                    </div>

                    {/* NDVI block */}
                    <div className={`${styles.layerBlock} ${styles.ndviBlock}`}>
                      <div className={styles.layerBlockHead}>
                        <span className={styles.layerBlockTitle}>ชั้นความเขียวขจี (NDVI / EVI / NDMI)</span>
                        <span className={reliabilityTagClass(selectedProvince.ndvi.pixelReliability)}>
                          {isUnreliable(selectedProvince.ndvi.pixelReliability) && '⚠ '}
                          {RELIABILITY_LABEL[selectedProvince.ndvi.pixelReliability]}
                        </span>
                      </div>
                      <dl className={styles.metricGrid}>
                        <div>
                          <dt>NDVI</dt>
                          <dd>{nf2.format(selectedProvince.ndvi.ndvi)}</dd>
                        </div>
                        <div>
                          <dt>EVI</dt>
                          <dd>{nf2.format(selectedProvince.ndvi.evi)}</dd>
                        </div>
                        <div>
                          <dt>NDMI</dt>
                          <dd>{nf2.format(selectedProvince.ndvi.ndmi)}</dd>
                        </div>
                        <div>
                          <dt>ระดับพืชพรรณ</dt>
                          <dd>{ndviBandOf(selectedProvince.ndvi.ndvi)?.label ?? 'ไม่ทราบค่า'}</dd>
                        </div>
                        <div>
                          <dt>ความผิดปกติเทียบฐาน</dt>
                          <dd>{nf.format(selectedProvince.ndvi.anomalyVsBaselinePercent)}%</dd>
                        </div>
                        <div>
                          <dt>ช่วงข้อมูลฐาน</dt>
                          <dd>{selectedProvince.ndvi.baselinePeriod}</dd>
                        </div>
                        <div>
                          <dt>จำนวนพิกเซลตัวอย่าง</dt>
                          <dd>{nf0.format(selectedProvince.ndvi.samplePixelCount)}</dd>
                        </div>
                      </dl>
                      {isUnreliable(selectedProvince.ndvi.pixelReliability) && (
                        <div className={styles.advisoryBox}>
                          <strong>ข้อควรระวัง:</strong> ค่าดัชนีของจังหวัดนี้คำนวณจากพิกเซลที่ถูกเมฆบดบังหรือไม่มีข้อมูล
                          ไม่ควรตีความเป็นสุขภาพพืชพรรณจริง
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Latest scene acquisition metadata */}
                  <div className={styles.sceneMetaCard}>
                    <div className={styles.sceneMetaTitle}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                        <path d="m2 17 10 5 10-5" />
                      </svg>
                      ฉากดาวเทียมล่าสุด ({selectedProvince.latestScene.sceneId})
                    </div>
                    <dl className={styles.sceneMetaList}>
                      <div>
                        <dt>แพลตฟอร์ม</dt>
                        <dd>{PLATFORM_LABEL[selectedProvince.latestScene.platform]}</dd>
                      </div>
                      <div>
                        <dt>เซนเซอร์</dt>
                        <dd>{selectedProvince.latestScene.sensor}</dd>
                      </div>
                      <div>
                        <dt>เวลาบันทึกภาพ</dt>
                        <dd>{formatDateTime(selectedProvince.latestScene.acquiredAt)}</dd>
                      </div>
                      <div>
                        <dt>ทิศวงโคจร</dt>
                        <dd>
                          {selectedProvince.latestScene.orbitPass === 'ascending' ? 'ขาขึ้น (Ascending)' : 'ขาลง (Descending)'}
                        </dd>
                      </div>
                      <div>
                        <dt>เมฆปกคลุม</dt>
                        <dd>{nf.format(selectedProvince.latestScene.cloudCoverPercent)}%</dd>
                      </div>
                      <div>
                        <dt>ระบบพิกัด (CRS)</dt>
                        <dd>{selectedProvince.latestScene.crs}</dd>
                      </div>
                      <div>
                        <dt>ความละเอียดภาพ</dt>
                        <dd>{nf0.format(selectedProvince.latestScene.resolutionM)} เมตร</dd>
                      </div>
                      <div>
                        <dt>รหัสแผ่นภาพ (Tile)</dt>
                        <dd>{selectedProvince.latestScene.tileId ?? 'ไม่ทราบค่า'}</dd>
                      </div>
                      <div>
                        <dt>ธงคุณภาพ</dt>
                        <dd>{selectedProvince.latestScene.qualityFlag}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: Basin flood stats */}
      {activeTab === 'basins' && (
        <section className={styles.section} aria-label="ตารางสถิติน้ำท่วมรายลุ่มน้ำ">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>สถิติน้ำท่วมขังรายลุ่มน้ำ (ชุดข้อมูลสาธิต)</h2>
              <span className={styles.sectionNote}>
                พื้นที่น้ำท่วมแสดงแยกสองหน่วย (ไร่ และ ตร.กม.) ห้ามนำไปบวกรวมกัน ·
                จำนวนจังหวัดที่ครอบคลุมเป็นจำนวนในชุดสาธิต ไม่ใช่การครอบคลุมทั้งลุ่มน้ำจริง
              </span>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.responsiveTableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">ลุ่มน้ำ / ภาค</th>
                    <th scope="col">
                      พื้นที่น้ำท่วมขัง
                      <span className={styles.unitHint}>หน่วย: ไร่</span>
                    </th>
                    <th scope="col">
                      พื้นที่น้ำท่วมขัง
                      <span className={styles.unitHint}>หน่วย: ตร.กม.</span>
                    </th>
                    <th scope="col">จำนวนฉาก</th>
                    <th scope="col">แยกตามแพลตฟอร์ม</th>
                    <th scope="col">จังหวัดในชุดสาธิต</th>
                    <th scope="col">เวลาบันทึกภาพล่าสุด (peak)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBasins.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.emptyState}>
                          <p>ไม่พบข้อมูลลุ่มน้ำตามเงื่อนไขภูมิภาคที่เลือก กรุณาปรับตัวกรองหรือล้างตัวกรองทั้งหมด</p>
                          <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                            ล้างตัวกรอง
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredBasins.map((basin) => (
                      <tr key={basin.basinCode}>
                        <td>
                          <div>
                            <strong>{basin.basinName}</strong>
                          </div>
                          <span className={styles.unitHint}>
                            {basin.region} · รหัสลุ่มน้ำ {basin.basinCode}
                          </span>
                        </td>
                        <td className={styles.numericCell}>{nf0.format(basin.inundatedAreaRai)} ไร่</td>
                        <td className={styles.numericCell}>{nf0.format(basin.inundatedAreaSqKm)} ตร.กม.</td>
                        <td className={styles.numericCell}>{nf0.format(basin.sceneCount)} ฉาก</td>
                        <td>
                          <div className={styles.platformBreakdown}>
                            {PLATFORM_KEYS.map((platform) => (
                              <span key={platform} className={styles.platformChip}>
                                {PLATFORM_LABEL[platform]} {nf0.format(basin.platformBreakdown[platform] ?? 0)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className={styles.numericCell}>{nf0.format(basin.provincesCovered)} จังหวัด</td>
                        <td>{formatDateTime(basin.peakAcquiredAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Scene catalog */}
      {activeTab === 'scenes' && (
        <section className={styles.section} aria-label="ทะเบียนฉากดาวเทียม">
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>ทะเบียนฉากดาวเทียมในชุดสาธิต (Scene Catalog)</h2>
              <span className={styles.sectionNote}>
                metadata รายฉากเพื่อการตรวจสอบย้อนกลับ — ไม่ใช่ภาพดาวเทียมจริง และยังไม่ผ่านการยืนยัน runtime
              </span>
            </div>
            <div className={styles.typeButtonGroup} role="radiogroup" aria-label="กรองตามแพลตฟอร์มดาวเทียม">
              <button
                type="button"
                role="radio"
                aria-checked={scenePlatform === 'all'}
                className={`${styles.typeBtn} ${scenePlatform === 'all' ? styles.active : ''}`}
                onClick={() => {
                  setScenePlatform('all');
                  setScenePage(1);
                }}
              >
                ทั้งหมด ({initialScenes.length})
              </button>
              {PLATFORM_KEYS.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  role="radio"
                  aria-checked={scenePlatform === platform}
                  className={`${styles.typeBtn} ${scenePlatform === platform ? styles.active : ''}`}
                  onClick={() => {
                    setScenePlatform(platform);
                    setScenePage(1);
                  }}
                >
                  {PLATFORM_LABEL[platform]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.responsiveTableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">รหัสฉาก</th>
                    <th scope="col">แพลตฟอร์ม / เซนเซอร์</th>
                    <th scope="col">เวลาบันทึกภาพ</th>
                    <th scope="col">วงโคจร</th>
                    <th scope="col">เมฆปกคลุม</th>
                    <th scope="col">CRS</th>
                    <th scope="col">ความละเอียด (ม.)</th>
                    <th scope="col">Tile</th>
                    <th scope="col">ธงคุณภาพ</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedScenes.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <div className={styles.emptyState}>
                          <p>ไม่พบฉากดาวเทียมตามเงื่อนไขแพลตฟอร์มหรือคำค้นหาที่เลือก</p>
                          <button type="button" className={styles.resetBtn} onClick={handleResetFilters}>
                            ล้างตัวกรอง
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedScenes.map((scene) => (
                      <tr key={scene.sceneId}>
                        <td>
                          <code>{scene.sceneId}</code>
                        </td>
                        <td>
                          {PLATFORM_LABEL[scene.platform]}
                          <span className={styles.unitHint}>{scene.sensor}</span>
                        </td>
                        <td>{formatDateTime(scene.acquiredAt)}</td>
                        <td>{scene.orbitPass === 'ascending' ? 'ขาขึ้น' : 'ขาลง'}</td>
                        <td className={styles.numericCell}>{nf.format(scene.cloudCoverPercent)}%</td>
                        <td>{scene.crs}</td>
                        <td className={styles.numericCell}>{nf0.format(scene.resolutionM)}</td>
                        <td>{scene.tileId ?? 'ไม่ทราบค่า'}</td>
                        <td>{scene.qualityFlag}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalScenePages > 1 && (
            <div className={styles.paginationRow}>
              <button
                type="button"
                className={styles.resetBtn}
                disabled={currentScenePage === 1}
                onClick={() => setScenePage((p) => Math.max(1, p - 1))}
              >
                ◀ หน้าก่อนหน้า
              </button>
              <span className={styles.paginationMeta}>
                หน้า <strong>{currentScenePage}</strong> จาก <strong>{totalScenePages}</strong>
              </span>
              <button
                type="button"
                className={styles.resetBtn}
                disabled={currentScenePage === totalScenePages}
                onClick={() => setScenePage((p) => Math.min(totalScenePages, p + 1))}
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
