'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  MachineryDashboardPayload,
  MachineryType,
  MachineryTypeDefinition,
  ProvinceMachineryProfile,
  ReadinessLevel,
  ServiceCenter,
  ServiceCenterKind,
  ServiceCenterStatus,
  TypeReadiness,
} from '@/lib/hub/machinery-data';
import styles from './machinery-dashboard.module.css';

type CssVars = CSSProperties & Record<string, string | number>;
type CenterSort = 'availability' | 'response' | 'load' | 'name';
type TableSort = 'index' | 'readiness' | 'area' | 'units' | 'name';

const CENTER_PAGE_SIZE = 6;
const TABLE_PAGE_SIZE = 20;

const LEVEL_LABELS: Record<ReadinessLevel, string> = {
  surplus: 'เพียงพอมาก',
  adequate: 'เพียงพอ',
  tight: 'ตึงตัว',
  deficit: 'ขาดแคลน',
};

const LEVEL_CLASS: Record<ReadinessLevel, string> = {
  surplus: styles.levelSurplus,
  adequate: styles.levelAdequate,
  tight: styles.levelTight,
  deficit: styles.levelDeficit,
};

const LEVEL_HEX: Record<ReadinessLevel, string> = {
  surplus: '#69c58d',
  adequate: '#b4d46a',
  tight: '#efb84b',
  deficit: '#e87061',
};

const STATUS_CLASS: Record<ServiceCenterStatus, string> = {
  open: styles.statusOpen,
  busy: styles.statusBusy,
  maintenance: styles.statusMaintenance,
};

const KIND_CLASS: Record<ServiceCenterKind, string> = {
  custom_hiring: styles.kindCustomHiring,
  mechanic: styles.kindMechanic,
  large_field_group: styles.kindLargeFieldGroup,
};

const numberFormat = new Intl.NumberFormat('th-TH');
const decimalFormat = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const thaiDateFormat = new Intl.DateTimeFormat('th-TH-u-ca-buddhist-nu-latn', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

function formatNumber(value: number) {
  return numberFormat.format(value);
}

function formatRai(value: number) {
  if (value >= 1_000_000) return `${decimalFormat.format(value / 1_000_000)} ล้านไร่`;
  if (value >= 1_000) return `${formatNumber(Math.round(value / 1_000))} พันไร่`;
  return `${formatNumber(Math.round(value))} ไร่`;
}

function formatDate(value: string) {
  return thaiDateFormat.format(new Date(`${value}T00:00:00+07:00`));
}

function levelFromPercent(percent: number): ReadinessLevel {
  if (percent >= 115) return 'surplus';
  if (percent >= 95) return 'adequate';
  if (percent >= 80) return 'tight';
  return 'deficit';
}

function profileReadiness(profile: ProvinceMachineryProfile, type: MachineryType | null): TypeReadiness {
  if (!type) return profile.harvest.readiness;
  return profile.types.find((entry) => entry.type === type)?.readiness ?? profile.harvest.readiness;
}

function TypeGlyph({ type, size = 24 }: { type: MachineryType; size?: number }) {
  const base = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (type === 'tractor') {
    return (
      <svg {...base}>
        <circle cx="10" cy="23" r="5" />
        <circle cx="24" cy="24" r="3.4" />
        <path d="M10 18v-6h5.5l3.4 5H25v7" />
        <path d="M15.5 12V8.5H20" />
        <path d="M17.2 8.5v-2.3" />
      </svg>
    );
  }

  if (type === 'combine_harvester') {
    return (
      <svg {...base}>
        <circle cx="9" cy="24" r="3.4" />
        <circle cx="24" cy="24" r="3.4" />
        <path d="M5 24V14h5l2.6-4h7l2.4 5h4v9" />
        <path d="M5 18h13" />
        <path d="M20 15h4" />
        <path d="M4 12h5M4 9h4" />
      </svg>
    );
  }

  if (type === 'transplanter') {
    return (
      <svg {...base}>
        <circle cx="9" cy="23" r="4" />
        <circle cx="24" cy="23" r="4" />
        <path d="M9 19v-8h10l4 6h2v6" />
        <path d="M13 12v5M17 12v5" />
        <path d="M3 28h26" />
        <path d="m14 19-2 4M22 19l2 4" />
      </svg>
    );
  }

  return (
    <svg {...base}>
      <rect x="12" y="13.5" width="8" height="5" rx="1.6" />
      <path d="M12 15.5H8l-2-3M20 15.5h4l2-3M12 17.5H8l-2 3M20 17.5h4l2 3" />
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="27" cy="12" r="2.2" />
      <circle cx="5" cy="22" r="2.2" />
      <circle cx="27" cy="22" r="2.2" />
      <path d="M14 18.5v2M18 18.5v2" />
    </svg>
  );
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 4.2 4.2" />
    </svg>
  );
}

function PinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function CenterIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h16v10H4z" />
      <path d="M3 10 6 4h12l3 6" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function WrenchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 6.4a4.3 4.3 0 0 0-5.6 5.6L4 16.9V20h3.1l4.9-4.9a4.3 4.3 0 0 0 5.6-5.6l-2.6 2.6-2.4-2.4 1.9-3.3Z" />
    </svg>
  );
}

function LayersIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

function GaugeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4.2 17a8.5 8.5 0 1 1 15.6 0" />
      <path d="m12 13 4-4" />
      <circle cx="12" cy="14" r="1.6" />
    </svg>
  );
}

function ShieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-3.5 7-9V5l-7-2-7 2v7c0 5.5 7 9 7 9Z" />
      <path d="m9 11.5 2 2 4-4" />
    </svg>
  );
}

function CodeIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />
    </svg>
  );
}

function ResetIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10a8 8 0 1 1 1.7 6.6" />
      <path d="M4 4v6h6" />
    </svg>
  );
}

function AlertIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17.4v.1" />
    </svg>
  );
}

function KindIcon({ kind, size = 18 }: { kind: ServiceCenterKind; size?: number }) {
  if (kind === 'mechanic') return <WrenchIcon size={size} />;
  if (kind === 'large_field_group') return <LayersIcon size={size} />;
  return <CenterIcon size={size} />;
}

function SectionHeading({
  id,
  kicker,
  title,
  lead,
  aside,
}: {
  id?: string;
  kicker: string;
  title: string;
  lead?: string;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div className={styles.sectionHeadingText}>
        <span className={styles.sectionKicker}>{kicker}</span>
        <h2 id={id} className={styles.sectionTitle}>{title}</h2>
        {lead ? <p className={styles.sectionLead}>{lead}</p> : null}
      </div>
      {aside ? <div className={styles.sectionAside}>{aside}</div> : null}
    </div>
  );
}

function LevelBadge({ level, children }: { level: ReadinessLevel; children: ReactNode }) {
  return <span className={`${styles.levelBadge} ${LEVEL_CLASS[level]}`}>{children}</span>;
}

type Props = {
  payload: MachineryDashboardPayload;
};

export function MachineryDashboard({ payload }: Props) {
  const [provinceCode, setProvinceCode] = useState('all');
  const [typeFilter, setTypeFilter] = useState<MachineryType | 'all'>('all');
  const [centerKind, setCenterKind] = useState<ServiceCenterKind | 'all'>('all');
  const [centerQuery, setCenterQuery] = useState('');
  const [centerSort, setCenterSort] = useState<CenterSort>('availability');
  const [centerPage, setCenterPage] = useState(1);
  const [tableSort, setTableSort] = useState<TableSort>('index');
  const [tablePage, setTablePage] = useState(1);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const typeMap = useMemo(
    () =>
      Object.fromEntries(
        payload.machineryTypeCatalog.map((definition) => [definition.id, definition]),
      ) as Record<MachineryType, MachineryTypeDefinition>,
    [payload.machineryTypeCatalog],
  );

  const provinceMap = useMemo(
    () => new Map(payload.provinces.map((profile) => [profile.provinceCode, profile])),
    [payload.provinces],
  );

  const selectedProvince = provinceCode === 'all' ? null : provinceMap.get(provinceCode) ?? null;
  const scope = selectedProvince ?? payload.national;
  const focusType = typeFilter === 'all' ? null : typeFilter;
  const selectedType = focusType
    ? scope.types.find((stat) => stat.type === focusType) ?? null
    : null;
  const selectedDefinition = focusType ? typeMap[focusType] : null;
  const focusReadiness = selectedType?.readiness ?? scope.harvest.readiness;
  const focusLevel = focusReadiness.level;

  const gaugeStyle: CssVars = {
    '--gauge-progress': `${Math.min(100, Math.max(0, focusReadiness.adequacyPercent)) * 3.6}deg`,
    '--gauge-color': LEVEL_HEX[focusLevel],
  };

  const apiParams = new URLSearchParams();
  if (provinceCode !== 'all') apiParams.set('provinceCode', provinceCode);
  if (typeFilter !== 'all') apiParams.set('machineryType', typeFilter);
  if (centerKind !== 'all') apiParams.set('centerKind', centerKind);
  if (centerQuery.trim()) apiParams.set('search', centerQuery.trim());
  const apiHref = `/api/v1/machinery${apiParams.toString() ? `?${apiParams.toString()}` : ''}`;

  const selectProvince = (code: string) => {
    setProvinceCode(code);
    setCenterPage(1);
  };

  const selectType = (type: MachineryType | 'all') => {
    setTypeFilter(type);
    setCenterPage(1);
  };

  const resetFilters = () => {
    setProvinceCode('all');
    setTypeFilter('all');
    setCenterKind('all');
    setCenterQuery('');
    setCenterSort('availability');
    setCenterPage(1);
    setTableSort('index');
    setTablePage(1);
  };

  const centersInScope = useMemo(
    () =>
      payload.serviceCenters.filter((center) => {
        if (provinceCode !== 'all' && center.provinceCode !== provinceCode) return false;
        if (focusType && !center.supportedTypes.includes(focusType)) return false;
        return true;
      }),
    [payload.serviceCenters, provinceCode, focusType],
  );

  const kindCounts = useMemo(() => {
    const counts: Record<ServiceCenterKind, number> = {
      custom_hiring: 0,
      mechanic: 0,
      large_field_group: 0,
    };
    centersInScope.forEach((center) => {
      counts[center.kind] += 1;
    });
    return counts;
  }, [centersInScope]);

  const filteredCenters = useMemo(() => {
    const query = centerQuery.normalize('NFC').trim().toLocaleLowerCase('th');
    const matches = centersInScope.filter((center) => {
      if (centerKind !== 'all' && center.kind !== centerKind) return false;
      if (!query) return true;
      const typeNames = center.supportedTypes.flatMap((type) => {
        const definition = typeMap[type];
        return [definition.name, definition.shortName, definition.englishName];
      });
      const haystack = [
        center.name,
        center.provinceName,
        center.region,
        center.district,
        center.operator,
        center.operatorTypeLabel,
        center.kindLabel,
        center.contactChannel,
        ...center.services,
        ...center.supportedTypes,
        ...typeNames,
      ]
        .join(' ')
        .toLocaleLowerCase('th');
      return haystack.includes(query);
    });

    return matches.sort((left, right) => {
      if (centerSort === 'name') return left.name.localeCompare(right.name, 'th');
      if (centerSort === 'response') {
        return left.responseHours - right.responseHours || right.availableUnits - left.availableUnits;
      }
      if (centerSort === 'load') {
        return left.bookingLoadPercent - right.bookingLoadPercent || right.availableUnits - left.availableUnits;
      }
      return right.availableUnits - left.availableUnits || left.responseHours - right.responseHours;
    });
  }, [centersInScope, centerKind, centerQuery, centerSort, typeMap]);

  const centerPageCount = Math.max(1, Math.ceil(filteredCenters.length / CENTER_PAGE_SIZE));
  const safeCenterPage = Math.min(centerPage, centerPageCount);
  const visibleCenters = useMemo(
    () =>
      filteredCenters.slice(
        (safeCenterPage - 1) * CENTER_PAGE_SIZE,
        safeCenterPage * CENTER_PAGE_SIZE,
      ),
    [filteredCenters, safeCenterPage],
  );

  const watchlist = useMemo(
    () =>
      [...payload.provinces]
        .map((profile) => ({ profile, readiness: profileReadiness(profile, focusType) }))
        .sort((left, right) => left.readiness.adequacyPercent - right.readiness.adequacyPercent)
        .slice(0, 5),
    [payload.provinces, focusType],
  );

  const tableRows = useMemo(() => {
    const rows = payload.provinces.map((profile) => {
      const stat = focusType ? profile.types.find((entry) => entry.type === focusType) ?? null : null;
      return {
        profile,
        readiness: stat?.readiness ?? profile.harvest.readiness,
        units: stat?.units ?? profile.totalUnits,
      };
    });

    return rows.sort((left, right) => {
      if (tableSort === 'readiness') {
        return left.readiness.adequacyPercent - right.readiness.adequacyPercent;
      }
      if (tableSort === 'area') return right.profile.areaRai - left.profile.areaRai;
      if (tableSort === 'units') return right.units - left.units;
      if (tableSort === 'name') return left.profile.provinceName.localeCompare(right.profile.provinceName, 'th');
      return right.profile.mechanizationIndex - left.profile.mechanizationIndex;
    });
  }, [payload.provinces, focusType, tableSort]);

  const tablePageCount = Math.max(1, Math.ceil(tableRows.length / TABLE_PAGE_SIZE));
  const safeTablePage = Math.min(tablePage, tablePageCount);
  const visibleTableRows = useMemo(
    () => tableRows.slice((safeTablePage - 1) * TABLE_PAGE_SIZE, safeTablePage * TABLE_PAGE_SIZE),
    [tableRows, safeTablePage],
  );

  const groundTypes = scope.types.filter((stat) => stat.totalHorsepower !== null);
  const groundHp = groundTypes.reduce((sum, stat) => sum + (stat.totalHorsepower ?? 0), 0);
  const hpShares = groundTypes.map((stat) => ({
    stat,
    definition: typeMap[stat.type],
    share: groundHp > 0 ? ((stat.totalHorsepower ?? 0) / groundHp) * 100 : 0,
  }));

  const maxBalance = Math.max(focusReadiness.demandRai, focusReadiness.capacityRai, 1);
  const maxRegionIndex = Math.max(...payload.regions.map((region) => region.mechanizationIndex), 0.01);
  const sortedRegions = [...payload.regions].sort(
    (left, right) => right.mechanizationIndex - left.mechanizationIndex,
  );

  const regionGroups = payload.filterOptions.regions.map((group) => {
    const profiles = group.provinces
      .map((province) => provinceMap.get(province.code))
      .filter((profile): profile is ProvinceMachineryProfile => Boolean(profile));
    const average = profiles.length
      ? Math.round(
          profiles.reduce(
            (sum, profile) => sum + profileReadiness(profile, focusType).adequacyPercent,
            0,
          ) / profiles.length,
        )
      : 0;
    const summary = payload.regions.find((region) => region.region === group.region);
    return { ...group, profiles, average, summary };
  });

  const readinessTitle = selectedDefinition
    ? `ความพร้อม${selectedDefinition.shortName}`
    : 'ความพร้อมเครื่องจักรรวม';
  const balanceGap = focusReadiness.gapRai;
  const shortfallLabel = selectedDefinition
    ? `${formatNumber(focusReadiness.shortfallMachines)} ${selectedDefinition.unitLabel}`
    : `${formatNumber(focusReadiness.shortfallMachines)} หน่วย`;

  return (
    <div className={styles.container}>
      <header className={styles.hero}>
        <span className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>FARM MECHANIZATION &amp; CUSTOM HIRING</span>
            <h1 className={styles.heroTitle}>
              ศูนย์บริหารเครื่องจักรกลเกษตร
              <span>และบริการจ้างเหมา</span>
            </h1>
            <p className={styles.heroLead}>
              ติดตามจำนวนเครื่องจักร ค่าเช่าเฉลี่ย และความพร้อมใช้ในช่วงเก็บเกี่ยว ตั้งแต่รถแทรกเตอร์
              รถเกี่ยวนวดข้าว รถดำนา ไปจนถึงโดรนการเกษตร พร้อมค้นหาศูนย์จ้างเหมา ศูนย์บริการช่าง
              และกลุ่มแปลงใหญ่รายจังหวัด
            </p>
            <div className={styles.heroChips}>
              <span className={styles.heroChip}>77 จังหวัด</span>
              <span className={styles.heroChip}>4 ประเภทเครื่องจักร</span>
              <span className={styles.heroChip}>{formatNumber(scope.centerCount)} ศูนย์บริการ</span>
              <span className={styles.heroChipMuted}>ข้อมูล ณ {payload.dataAsOfLabel}</span>
            </div>
          </div>

          <aside className={styles.seasonCard} aria-label="ความพร้อมเครื่องจักรฤดูเก็บเกี่ยว">
            <span className={styles.seasonKicker}>HARVEST WINDOW</span>
            <strong className={styles.seasonTitle}>{payload.season.label}</strong>
            <span className={styles.seasonWindow}>{payload.season.windowLabel}</span>
            <div className={styles.seasonRingRow}>
              <div className={styles.seasonRing} style={gaugeStyle}>
                <div className={styles.seasonRingInner}>
                  <strong>{formatNumber(focusReadiness.adequacyPercent)}%</strong>
                  <span>{LEVEL_LABELS[focusLevel]}</span>
                </div>
              </div>
              <div className={styles.seasonMeta}>
                <span className={styles.seasonMetaLabel}>{readinessTitle}</span>
                <strong>{selectedProvince ? selectedProvince.provinceName : 'ทั่วประเทศ'}</strong>
                <span>
                  {formatNumber(scope.provinceCount)} จังหวัด • {formatNumber(scope.centerCount)} ศูนย์
                </span>
              </div>
            </div>
            <span className={styles.seasonFootnote}>
              จำลองจากพื้นที่เพาะปลูกและกำลังเครื่องจักร ไม่ใช่สถานะเรียลไทม์
            </span>
          </aside>
        </div>
      </header>

      <nav className={styles.quickNav} aria-label="เมนูภายในหน้า">
        <a href="#rental">ค่าเช่าเฉลี่ย</a>
        <a href="#harvest">ความพร้อมเก็บเกี่ยว</a>
        <a href="#coverage">พื้นที่ให้บริการ</a>
        <a href="#centers">ค้นหาศูนย์บริการ</a>
        <a href="#analytics">ดัชนีเชิงลึก</a>
      </nav>

      <aside className={styles.governanceBanner} aria-label="ข้อกำหนดการใช้ข้อมูล">
        <span className={styles.governanceIcon}>
          <AlertIcon />
        </span>
        <div className={styles.governanceBody}>
          <div className={styles.governanceTop}>
            <span className={styles.governanceBadge}>Sample / Metadata-only</span>
            <strong>ชุดข้อมูลตัวอย่างสำหรับสาธิตสัญญา API</strong>
          </div>
          <p>
            ตัวเลขเครื่องจักร ค่าเช่า และความพร้อมเป็น deterministic sample ที่อ้างอิงกรอบประเภทเครื่องจักรของ
            กรมส่งเสริมการเกษตรและโครงสร้างตลาดบริการ ไม่ใช่ทะเบียนรายคันหรือราคาประกาศจริง
            โดยตอบกลับด้วย <code>sample: true</code> และ <code>meta.access: &quot;metadata_only&quot;</code>
          </p>
          <div className={styles.governanceTags}>
            <span>DOAE</span>
            <span>OAE</span>
            <span>ยังไม่เชื่อมทะเบียนรายหน่วย</span>
            <a
              href="#sources"
              aria-expanded={sourcesOpen}
              aria-controls="sources-details"
              onClick={() => setSourcesOpen(true)}
            >
              ดูแหล่งอ้างอิงและข้อจำกัด
            </a>
          </div>
        </div>
      </aside>

      <section className={styles.kpiGrid} aria-label="ตัวชี้วัดหลัก">
        <article className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>ดัชนีเครื่องจักรกล</span>
            <span className={`${styles.kpiIcon} ${styles.kpiIconGreen}`}>
              <GaugeIcon />
            </span>
          </div>
          <div className={styles.kpiValueRow}>
            <strong className={styles.kpiValue}>{decimalFormat.format(scope.mechanizationIndex)}</strong>
            <span className={styles.kpiUnit}>HP/ไร่</span>
          </div>
          <p className={styles.kpiFoot}>
            จากพื้นที่ {formatRai(scope.areaRai)} • {formatNumber(scope.totalHorsepower)} HP
          </p>
          <span className={styles.kpiNote}>ไม่นับโดรนในดัชนีแรงม้า</span>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>เครื่องจักรในขอบเขต</span>
            <span className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}>
              <TypeGlyph type="tractor" size={22} />
            </span>
          </div>
          <div className={styles.kpiValueRow}>
            <strong className={styles.kpiValue}>{formatNumber(scope.totalUnits)}</strong>
            <span className={styles.kpiUnit}>คัน/ลำ</span>
          </div>
          <p className={styles.kpiFoot}>
            ภาคพื้นดิน {formatNumber(scope.groundUnits)} คัน • โดรน {formatNumber(scope.droneUnits)} ลำ
          </p>
          <div className={styles.kpiMiniTypes}>
            {scope.types.map((stat) => (
              <span key={stat.type}>
                <i style={{ background: typeMap[stat.type].accent }} aria-hidden="true" />
                {typeMap[stat.type].shortName} {formatNumber(stat.units)}
              </span>
            ))}
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>ศูนย์บริการในระบบ</span>
            <span className={`${styles.kpiIcon} ${styles.kpiIconTeal}`}>
              <CenterIcon />
            </span>
          </div>
          <div className={styles.kpiValueRow}>
            <strong className={styles.kpiValue}>{formatNumber(scope.centerCount)}</strong>
            <span className={styles.kpiUnit}>แห่ง</span>
          </div>
          <p className={styles.kpiFoot}>
            {formatNumber(scope.provinceCount)} จังหวัด • ครอบคลุมทุกพื้นที่ในขอบเขต
          </p>
          <div className={styles.kpiBreakdown}>
            <span>จ้างเหมา {formatNumber(scope.centersByKind.custom_hiring)}</span>
            <span>ช่าง {formatNumber(scope.centersByKind.mechanic)}</span>
            <span>แปลงใหญ่ {formatNumber(scope.centersByKind.large_field_group)}</span>
          </div>
        </article>

        <article className={`${styles.kpiCard} ${styles.kpiReadinessCard}`} style={{ '--kpi-accent': LEVEL_HEX[focusLevel] } as CssVars}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>{readinessTitle}</span>
            <span className={styles.kpiIcon} style={{ background: `${LEVEL_HEX[focusLevel]}22`, color: LEVEL_HEX[focusLevel] }}>
              <ShieldIcon />
            </span>
          </div>
          <div className={styles.kpiValueRow}>
            <strong className={styles.kpiValue}>{formatNumber(focusReadiness.adequacyPercent)}</strong>
            <span className={styles.kpiUnit}>%</span>
            <LevelBadge level={focusLevel}>{LEVEL_LABELS[focusLevel]}</LevelBadge>
          </div>
          <p className={styles.kpiFoot}>
            {balanceGap >= 0
              ? `กำลังรับงานเหลือ ${formatRai(balanceGap)}`
              : `ขาดกำลัง ${formatRai(Math.abs(balanceGap))} • ต้องเพิ่ม ${shortfallLabel}`}
          </p>
          <span className={styles.kpiNote}>
            {selectedDefinition
              ? `${selectedDefinition.phaseLabel} • ${selectedDefinition.windowDays} วัน`
              : 'รวมรถแทรกเตอร์ รถเกี่ยวนวด และโดรน'}
          </span>
        </article>
      </section>

      <section className={styles.filterCard} aria-label="ตัวกรองข้อมูล">
        <div className={styles.filterTop}>
          <div>
            <span className={styles.sectionKicker}>FILTER SCOPE</span>
            <h2 className={styles.filterTitle}>เลือกพื้นที่และประเภทเครื่องจักร</h2>
          </div>
          <span className={styles.scopeBadge}>
            {selectedProvince ? `${selectedProvince.provinceName} • ${selectedProvince.region}` : 'ทั่วประเทศ'}
          </span>
        </div>

        <div className={styles.filterGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>จังหวัด</span>
            <select
              className={styles.select}
              value={provinceCode}
              onChange={(event) => selectProvince(event.target.value)}
            >
              <option value="all">ทั่วประเทศ (77 จังหวัด)</option>
              {payload.filterOptions.regions.map((group) => (
                <optgroup key={group.region} label={group.region}>
                  {group.provinces.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>ประเภทเครื่องจักร</span>
            <div className={styles.typePills} role="group" aria-label="กรองตามประเภทเครื่องจักร">
              <button
                type="button"
                className={`${styles.typePill} ${typeFilter === 'all' ? styles.typePillActive : ''}`}
                aria-pressed={typeFilter === 'all'}
                onClick={() => selectType('all')}
              >
                ทุกประเภท
              </button>
              {scope.types.map((stat) => {
                const definition = typeMap[stat.type];
                const active = typeFilter === stat.type;
                return (
                  <button
                    key={stat.type}
                    type="button"
                    className={`${styles.typePill} ${active ? styles.typePillActive : ''}`}
                    aria-pressed={active}
                    onClick={() => selectType(active ? 'all' : stat.type)}
                  >
                    <span style={{ color: definition.accent }}>
                      <TypeGlyph type={stat.type} size={17} />
                    </span>
                    {definition.shortName}
                    <small>{formatNumber(stat.units)}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.filterFoot}>
          <span className={styles.filterHint}>
            ตัวกรองมีผลกับค่าเช่า ความพร้อม แผนผัง และรายชื่อศูนย์บริการทั้งหน้า
          </span>
          <div className={styles.filterActions}>
            <a className={styles.apiLink} href={apiHref} target="_blank" rel="noreferrer">
              <CodeIcon />
              เปิด JSON API
            </a>
            <button type="button" className={styles.resetButton} onClick={resetFilters}>
              <ResetIcon />
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      </section>

      <section id="rental" className={styles.section} aria-labelledby="rental-title">
        <SectionHeading
          id="rental-title"
          kicker="RENTAL MARKET"
          title="อัตราค่าเช่าเฉลี่ยต่อไร่"
          lead="ค่ากลางจำลองสำหรับบริการจ้างเหมาพร้อมพนักงานขับ ปรับตามภูมิภาคและสภาพพื้นที่ ช่วงราคาไม่ใช่ราคาประกาศของผู้ประกอบการ"
          aside={<span className={styles.sectionPill}>{selectedProvince ? selectedProvince.provinceName : 'ค่าเฉลี่ยถ่วงน้ำหนักทั่วประเทศ'}</span>}
        />
        <div className={styles.rentalGrid}>
          {scope.types.map((stat) => {
            const definition = typeMap[stat.type];
            const active = typeFilter === stat.type;
            const spread = Math.max(1, stat.rental.maxBahtPerRai - stat.rental.minBahtPerRai);
            const averagePosition = Math.min(
              100,
              Math.max(0, ((stat.rental.averageBahtPerRai - stat.rental.minBahtPerRai) / spread) * 100),
            );
            return (
              <button
                key={stat.type}
                type="button"
                className={`${styles.rentalCard} ${active ? styles.rentalCardActive : ''}`}
                style={{ '--rental-accent': definition.accent, '--rental-soft': definition.softAccent } as CssVars}
                aria-pressed={active}
                onClick={() => selectType(active ? 'all' : stat.type)}
              >
                <span className={styles.rentalTop}>
                  <span className={styles.rentalIcon}>
                    <TypeGlyph type={stat.type} size={25} />
                  </span>
                  <span className={styles.rentalName}>
                    <strong>{definition.name}</strong>
                    <small>{definition.englishName}</small>
                  </span>
                  <span className={styles.rentalCenters}>{formatNumber(stat.rental.centersServing)} ศูนย์</span>
                </span>
                <span className={styles.rentalPriceRow}>
                  <strong>{formatNumber(stat.rental.averageBahtPerRai)}</strong>
                  <span>บาท/ไร่</span>
                </span>
                <span className={styles.rentalRange} aria-hidden="true">
                  <span className={styles.rentalRangeBase} />
                  <span className={styles.rentalRangeAverage} style={{ left: `${averagePosition}%` }} />
                </span>
                <span className={styles.rentalRangeLabels}>
                  <span>ต่ำสุด {formatNumber(stat.rental.minBahtPerRai)}</span>
                  <span>สูงสุด {formatNumber(stat.rental.maxBahtPerRai)}</span>
                </span>
                <span className={styles.rentalFoot}>
                  <span>ศูนย์จ้างเหมาที่รองรับ {formatNumber(stat.rental.centersServing)} แห่ง</span>
                  <span>{formatNumber(stat.units)} {definition.unitLabel}</span>
                </span>
                <span className={styles.rentalNote}>{definition.rentalNote}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section id="harvest" className={styles.section} aria-labelledby="harvest-title">
        <SectionHeading
          id="harvest-title"
          kicker="HARVEST ADEQUACY"
          title="ความพร้อมเครื่องจักรในฤดูเก็บเกี่ยว"
          lead="ประเมินกำลังรับงานจากเครื่องจักรที่เปิดให้จ้าง เทียบกับพื้นที่ที่ต้องดำเนินการในช่วงเก็บเกี่ยว พร้อมช่องว่างและจำนวนเครื่องที่ต้องเพิ่ม"
          aside={<LevelBadge level={focusLevel}>{LEVEL_LABELS[focusLevel]} • {formatNumber(focusReadiness.adequacyPercent)}%</LevelBadge>}
        />
        <div className={styles.harvestGrid}>
          <div className={styles.gaugeCard}>
            <span className={styles.cardKicker}>CAPACITY VS DEMAND</span>
            <h3 className={styles.cardTitle}>{readinessTitle}</h3>
            <div className={styles.gauge} style={gaugeStyle} role="img" aria-label={`ความพร้อม ${focusReadiness.adequacyPercent}% ระดับ${LEVEL_LABELS[focusLevel]}`}>
              <div className={styles.gaugeInner}>
                <strong>{formatNumber(focusReadiness.adequacyPercent)}%</strong>
                <span>{LEVEL_LABELS[focusLevel]}</span>
              </div>
            </div>
            <div className={styles.gaugeBadgeRow}>
              <LevelBadge level={focusLevel}>{LEVEL_LABELS[focusLevel]}</LevelBadge>
              <span>{payload.season.windowLabel}</span>
            </div>
            <div className={styles.gaugeStats}>
              <div>
                <span>ความต้องการในช่วง</span>
                <strong>{formatRai(focusReadiness.demandRai)}</strong>
              </div>
              <div>
                <span>กำลังรับงานในช่วง</span>
                <strong>{formatRai(focusReadiness.capacityRai)}</strong>
              </div>
            </div>
            <p className={styles.gaugeNote}>
              {selectedDefinition
                ? `${selectedDefinition.phaseLabel} • หน้าต่าง ${selectedDefinition.windowDays} วัน • ${selectedDefinition.inHarvestIndex ? 'อยู่ในดัชนีเก็บเกี่ยว' : 'นอกช่วงเก็บเกี่ยวหลัก'}`
                : 'รวมรถแทรกเตอร์ รถเกี่ยวนวด และโดรน • หน้าต่างสูงสุด 16 วัน'}
            </p>
          </div>

          <div className={styles.balanceCard}>
            <div className={styles.balanceTop}>
              <span className={styles.cardKicker}>SEASON BALANCE</span>
              <span className={styles.balanceWindow}>{payload.season.label}</span>
            </div>
            <h3 className={styles.cardTitle}>สมดุลกำลังรับงานกับความต้องการ</h3>
            <div className={styles.balanceRows}>
              <div className={styles.balanceRow}>
                <div className={styles.balanceLabel}>
                  <span>ความต้องการงาน</span>
                  <strong>{formatRai(focusReadiness.demandRai)}</strong>
                </div>
                <div className={styles.balanceTrack}>
                  <span
                    className={styles.balanceDemand}
                    style={{ width: `${(focusReadiness.demandRai / maxBalance) * 100}%` }}
                  />
                </div>
              </div>
              <div className={styles.balanceRow}>
                <div className={styles.balanceLabel}>
                  <span>กำลังรับงานที่เปิดให้จ้าง</span>
                  <strong>{formatRai(focusReadiness.capacityRai)}</strong>
                </div>
                <div className={styles.balanceTrack}>
                  <span
                    className={styles.balanceCapacity}
                    style={{ width: `${(focusReadiness.capacityRai / maxBalance) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className={`${styles.gapCallout} ${balanceGap >= 0 ? styles.gapPositive : styles.gapNegative}`}>
              <div>
                <span>{balanceGap >= 0 ? 'กำลังรับงานเหลือ' : 'กำลังรับงานขาด'}</span>
                <strong>{formatRai(Math.abs(balanceGap))}</strong>
              </div>
              <p>
                {balanceGap >= 0
                  ? 'เพียงพอต่อพื้นที่เป้าหมายในหน้าต่างนี้ภายใต้สมมติฐานการให้บริการ'
                  : `ต้องเพิ่มอย่างน้อย ${shortfallLabel} หรือขยายช่วงเวลา/เครือข่ายศูนย์บริการ`}
              </p>
            </div>

            <div className={styles.typeMiniGrid} role="group" aria-label="ความพร้อมรายประเภทเครื่องจักร">
              {scope.types.map((stat) => {
                const definition = typeMap[stat.type];
                const active = typeFilter === stat.type;
                return (
                  <button
                    key={stat.type}
                    type="button"
                    className={`${styles.typeMiniCard} ${active ? styles.typeMiniCardActive : ''}`}
                    style={{ '--mini-accent': definition.accent } as CssVars}
                    aria-pressed={active}
                    onClick={() => selectType(active ? 'all' : stat.type)}
                  >
                    <span className={styles.typeMiniTop}>
                      <span>{definition.shortName}</span>
                      <strong>{formatNumber(stat.readiness.adequacyPercent)}%</strong>
                    </span>
                    <span className={styles.typeMiniTrack}>
                      <span
                        className={styles.typeMiniFill}
                        style={{ width: `${Math.min(100, stat.readiness.adequacyPercent)}%` }}
                      />
                    </span>
                    <span className={styles.typeMiniMeta}>
                      <span>{LEVEL_LABELS[stat.readiness.level]}</span>
                      <span>{definition.phaseLabel}{definition.inHarvestIndex ? '' : ' • นอกช่วง'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.watchStrip}>
          <div className={styles.watchTitle}>
            <span className={styles.sectionKicker}>WATCHLIST</span>
            <strong>จังหวัดที่ต้องจับตา</strong>
            <span>{selectedDefinition ? `ความพร้อม${selectedDefinition.shortName}ต่ำสุด` : 'ความพร้อมเก็บเกี่ยวรวมต่ำสุด'}</span>
          </div>
          <div className={styles.watchGrid}>
            {watchlist.map((entry) => (
              <button
                key={entry.profile.provinceCode}
                type="button"
                className={`${styles.watchCard} ${provinceCode === entry.profile.provinceCode ? styles.watchCardActive : ''}`}
                aria-pressed={provinceCode === entry.profile.provinceCode}
                onClick={() => selectProvince(entry.profile.provinceCode)}
              >
                <span className={styles.watchLocation}>
                  <strong>{entry.profile.provinceName}</strong>
                  <small>{entry.profile.region} • {formatNumber(entry.profile.centerCount)} ศูนย์</small>
                </span>
                <span className={styles.watchScore}>
                  <LevelBadge level={entry.readiness.level}>{LEVEL_LABELS[entry.readiness.level]}</LevelBadge>
                  <strong>{formatNumber(entry.readiness.adequacyPercent)}%</strong>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="coverage" className={styles.section} aria-labelledby="coverage-title">
        <SectionHeading
          id="coverage-title"
          kicker="SERVICE COVERAGE"
          title="แผนผังศูนย์บริการรายภาค"
          lead="แผนผังเชิงสัญลักษณ์ ไม่ใช่แผนที่ภูมิศาสตร์ สีของจังหวัดสะท้อนความพร้อมของประเภทเครื่องจักรที่เลือก และตัวเลขแสดงจำนวนศูนย์บริการที่ขึ้นทะเบียน"
          aside={
            selectedProvince ? (
              <button type="button" className={styles.outlineButton} onClick={() => selectProvince('all')}>
                แสดงทั้งประเทศ
              </button>
            ) : (
              <span className={styles.sectionPill}>กดจังหวัดเพื่อกรองทั้งหน้า</span>
            )
          }
        />
        <div className={styles.legendRow}>
          {(Object.keys(LEVEL_LABELS) as ReadinessLevel[]).map((level) => (
            <span key={level} className={styles.legendItem}>
              <i style={{ background: LEVEL_HEX[level] }} aria-hidden="true" />
              {LEVEL_LABELS[level]}
            </span>
          ))}
          <span className={styles.legendNote}>ความพร้อมที่เลือก: {selectedDefinition ? selectedDefinition.name : 'รวมช่วงเก็บเกี่ยว'}</span>
        </div>

        <div className={styles.regionGrid}>
          {regionGroups.map((group) => (
            <article key={group.region} className={styles.regionCard}>
              <div className={styles.regionHead}>
                <div>
                  <h3>{group.region}</h3>
                  <span>
                    {formatNumber(group.profiles.length)} จังหวัด • {formatNumber(group.summary?.centerCount ?? 0)} ศูนย์
                  </span>
                </div>
                <span className={styles.regionScore} title={`เฉลี่ยความพร้อมรายจังหวัด ${formatNumber(group.average)}%`}>
                  <i style={{ background: LEVEL_HEX[levelFromPercent(group.average)] }} aria-hidden="true" />
                  เฉลี่ย {formatNumber(group.average)}%
                </span>
              </div>
              <div className={styles.tileGrid} role="group" aria-label={`จังหวัดใน${group.region}`}>
                {group.profiles.map((profile) => {
                  const readiness = profileReadiness(profile, focusType);
                  const selected = provinceCode === profile.provinceCode;
                  return (
                    <button
                      key={profile.provinceCode}
                      type="button"
                      className={`${styles.tile} ${LEVEL_CLASS[readiness.level]} ${selected ? styles.tileSelected : ''}`}
                      aria-pressed={selected}
                      aria-label={`${profile.provinceName} ความพร้อม ${readiness.adequacyPercent}% ระดับ${LEVEL_LABELS[readiness.level]} ${profile.centerCount} ศูนย์บริการ`}
                      title={`${profile.provinceName} • ${readiness.adequacyPercent}% • ${profile.centerCount} ศูนย์`}
                      onClick={() => selectProvince(selected ? 'all' : profile.provinceCode)}
                    >
                      <span>{profile.provinceName}</span>
                      <small>{formatNumber(profile.centerCount)} ศูนย์</small>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="centers" className={styles.section} aria-labelledby="centers-title">
        <SectionHeading
          id="centers-title"
          kicker="SERVICE DIRECTORY"
          title="ค้นหาศูนย์บริการและกลุ่มแปลงใหญ่"
          lead="ค้นหาศูนย์จ้างเหมาเครื่องจักรกล ศูนย์บริการช่าง และกลุ่มแปลงใหญ่ พร้อมประเภทเครื่องจักรที่รองรับ ภาระคิว และช่องทางประสานงาน"
          aside={<span className={styles.sectionPill}>{formatNumber(centersInScope.length)} ศูนย์ในขอบเขต</span>}
        />
        <div className={styles.centerPanel}>
          <div className={styles.centerToolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <SearchIcon />
              </span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="ค้นหาชื่อศูนย์ จังหวัด อำเภอ หรือประเภทเครื่องจักร"
                value={centerQuery}
                onChange={(event) => {
                  setCenterQuery(event.target.value);
                  setCenterPage(1);
                }}
                aria-label="ค้นหาศูนย์บริการ"
              />
              {centerQuery ? (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => {
                    setCenterQuery('');
                    setCenterPage(1);
                  }}
                  aria-label="ล้างคำค้นหา"
                >
                  ×
                </button>
              ) : null}
            </div>
            <label className={styles.sortField}>
              <span>เรียงตาม</span>
              <select
                className={styles.sortSelect}
                value={centerSort}
                onChange={(event) => {
                  setCenterSort(event.target.value as CenterSort);
                  setCenterPage(1);
                }}
              >
                <option value="availability">เครื่องจักรว่างมากก่อน</option>
                <option value="response">ตอบกลับเร็วที่สุด</option>
                <option value="load">คิวว่างที่สุด</option>
                <option value="name">ชื่อศูนย์ ก–ฮ</option>
              </select>
            </label>
          </div>

          <div className={styles.kindPills} role="group" aria-label="กรองตามประเภทศูนย์บริการ">
            <button
              type="button"
              className={`${styles.kindPill} ${centerKind === 'all' ? styles.kindPillActive : ''}`}
              aria-pressed={centerKind === 'all'}
              onClick={() => {
                setCenterKind('all');
                setCenterPage(1);
              }}
            >
              ทั้งหมด <span>{formatNumber(centersInScope.length)}</span>
            </button>
            {payload.filterOptions.serviceCenterKinds.map((kind) => (
              <button
                key={kind.id}
                type="button"
                className={`${styles.kindPill} ${centerKind === kind.id ? styles.kindPillActive : ''}`}
                aria-pressed={centerKind === kind.id}
                onClick={() => {
                  setCenterKind(centerKind === kind.id ? 'all' : kind.id);
                  setCenterPage(1);
                }}
              >
                {kind.label} <span>{formatNumber(kindCounts[kind.id])}</span>
              </button>
            ))}
          </div>

          <div className={styles.resultLine} aria-live="polite">
            <span>
              พบ <strong>{formatNumber(filteredCenters.length)}</strong> ศูนย์
              {selectedProvince ? ` ใน${selectedProvince.provinceName}` : ' ทั่วประเทศ'}
              {selectedDefinition ? ` ที่รองรับ${selectedDefinition.name}` : ''}
            </span>
            <a href={apiHref} target="_blank" rel="noreferrer">
              <CodeIcon size={15} /> ดู JSON ตามตัวกรอง
            </a>
          </div>

          {filteredCenters.length === 0 ? (
            <div className={styles.emptyState} role="status">
              <span className={styles.emptyIcon}>
                <SearchIcon size={28} />
              </span>
              <h3>ไม่พบศูนย์บริการตามตัวกรอง</h3>
              <p>ลองเปลี่ยนจังหวัด ประเภทเครื่องจักร หรือล้างคำค้นหาเพื่อดูศูนย์อื่น</p>
              <button type="button" className={styles.primaryButton} onClick={resetFilters}>
                ล้างตัวกรองทั้งหมด
              </button>
            </div>
          ) : (
            <>
              <div className={styles.centerGrid}>
                {visibleCenters.map((center) => (
                  <ServiceCenterCard key={center.id} center={center} typeMap={typeMap} />
                ))}
              </div>
              {filteredCenters.length > CENTER_PAGE_SIZE ? (
                <nav className={styles.pager} aria-label="การแบ่งหน้าศูนย์บริการ">
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setCenterPage(safeCenterPage - 1)}
                    disabled={safeCenterPage <= 1}
                  >
                    ก่อนหน้า
                  </button>
                  <span className={styles.pageStatus}>
                    หน้า <strong>{formatNumber(safeCenterPage)}</strong> จาก {formatNumber(centerPageCount)}
                  </span>
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setCenterPage(safeCenterPage + 1)}
                    disabled={safeCenterPage >= centerPageCount}
                  >
                    ถัดไป
                  </button>
                  <span className={styles.pagerRange}>
                    แสดง {formatNumber((safeCenterPage - 1) * CENTER_PAGE_SIZE + 1)}–
                    {formatNumber(Math.min(safeCenterPage * CENTER_PAGE_SIZE, filteredCenters.length))} จาก{' '}
                    {formatNumber(filteredCenters.length)}
                  </span>
                </nav>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section id="analytics" className={styles.section} aria-labelledby="analytics-title">
        <SectionHeading
          id="analytics-title"
          kicker="MECHANIZATION DEEP DIVE"
          title="ดัชนีและองค์ประกอบกำลังเครื่องกล"
          lead="เปรียบเทียบสัดส่วนแรงม้าตามประเภทเครื่องจักร ภาพรวมรายภาค และอันดับจังหวัดจากดัชนี HP/ไร่ โดยไม่นับโดรนในดัชนีหลัก"
          aside={<span className={styles.sectionPill}>{selectedProvince ? selectedProvince.provinceName : 'ทั่วประเทศ'}</span>}
        />

        <div className={styles.analyticsGrid}>
          <article className={styles.analyticsCard}>
            <div className={styles.analyticsHead}>
              <div>
                <span className={styles.cardKicker}>HORSEPOWER MIX</span>
                <h3>องค์ประกอบแรงม้าภาคพื้นดิน</h3>
              </div>
              <strong className={styles.analyticsValue}>{formatNumber(scope.totalHorsepower)} HP</strong>
            </div>
            <div className={styles.hpStack} aria-hidden="true">
              {hpShares.map((entry) => (
                <span
                  key={entry.stat.type}
                  style={{ width: `${entry.share}%`, background: entry.definition.accent }}
                />
              ))}
            </div>
            <div className={styles.hpLegend}>
              {hpShares.map((entry) => (
                <div key={entry.stat.type}>
                  <span className={styles.hpLegendName}>
                    <i style={{ background: entry.definition.accent }} aria-hidden="true" />
                    {entry.definition.shortName}
                  </span>
                  <span>{formatNumber(entry.stat.totalHorsepower ?? 0)} HP</span>
                  <strong>{decimalFormat.format(entry.share)}%</strong>
                </div>
              ))}
            </div>
            <p className={styles.analyticsNote}>
              โดรน {formatNumber(scope.droneUnits)} ลำ ถูกติดตามแยกและไม่ถูกนับในดัชนีแรงม้า
              เนื่องจากกำลังขับเคลื่อนไม่เทียบเท่าเครื่องจักรภาคพื้นดิน
            </p>
          </article>

          <article className={styles.analyticsCard}>
            <div className={styles.analyticsHead}>
              <div>
                <span className={styles.cardKicker}>REGIONAL VIEW</span>
                <h3>ดัชนีแรงม้าต่อพื้นที่รายภาค</h3>
              </div>
              <span className={styles.analyticsHint}>{payload.dataAsOfLabel}</span>
            </div>
            <div className={styles.regionList}>
              {sortedRegions.map((region) => (
                <div key={region.region} className={styles.regionRow}>
                  <div className={styles.regionRowHead}>
                    <span>{region.region}</span>
                    <strong>{decimalFormat.format(region.mechanizationIndex)} HP/ไร่</strong>
                  </div>
                  <div className={styles.regionTrack}>
                    <span style={{ width: `${(region.mechanizationIndex / maxRegionIndex) * 100}%` }} />
                  </div>
                  <div className={styles.regionRowMeta}>
                    <span>ความพร้อม {formatNumber(region.harvestAdequacyPercent)}%</span>
                    <span>{formatNumber(region.centerCount)} ศูนย์</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableTop}>
            <div>
              <span className={styles.cardKicker}>PROVINCE RANKING</span>
              <h3>อันดับเครื่องจักรและความพร้อมรายจังหวัด</h3>
              <p>กดชื่อจังหวัดเพื่อกรองค่าเช่า ความพร้อม และศูนย์บริการทั้งหน้า</p>
            </div>
            <label className={styles.sortField}>
              <span>เรียงอันดับ</span>
              <select
                className={styles.sortSelect}
                value={tableSort}
                onChange={(event) => {
                  setTableSort(event.target.value as TableSort);
                  setTablePage(1);
                }}
              >
                <option value="index">ดัชนี HP/ไร่ มากไปน้อย</option>
                <option value="readiness">ความพร้อม ต่ำไปสูง</option>
                <option value="area">พื้นที่ มากไปน้อย</option>
                <option value="units">จำนวนเครื่อง มากไปน้อย</option>
                <option value="name">ชื่อจังหวัด ก–ฮ</option>
              </select>
            </label>
          </div>
          <div
            className={styles.tableScroll}
            role="region"
            tabIndex={0}
            aria-label="ตารางอันดับจังหวัด"
          >
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                ดัชนีแรงม้าต่อไร่ จำนวนเครื่องจักร และความพร้อมรายจังหวัด
              </caption>
              <thead>
                <tr>
                  <th scope="col">อันดับ</th>
                  <th scope="col">จังหวัด</th>
                  <th scope="col">ภาค</th>
                  <th scope="col">พื้นที่เพาะปลูก</th>
                  <th scope="col">{selectedDefinition ? `จำนวน${selectedDefinition.shortName}` : 'เครื่องจักรทั้งหมด'}</th>
                  <th scope="col">HP/ไร่</th>
                  <th scope="col">ความพร้อม</th>
                  <th scope="col">ศูนย์</th>
                </tr>
              </thead>
              <tbody>
                {visibleTableRows.map((row, index) => {
                  const selected = provinceCode === row.profile.provinceCode;
                  return (
                    <tr key={row.profile.provinceCode} className={selected ? styles.rowSelected : undefined}>
                      <td className={styles.rankCell}>
                        {formatNumber((safeTablePage - 1) * TABLE_PAGE_SIZE + index + 1)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`${styles.provinceButton} ${selected ? styles.provinceButtonActive : ''}`}
                          onClick={() => selectProvince(selected ? 'all' : row.profile.provinceCode)}
                          aria-pressed={selected}
                        >
                          {row.profile.provinceName}
                        </button>
                      </td>
                      <td className={styles.regionCell}>{row.profile.region}</td>
                      <td>{formatRai(row.profile.areaRai)}</td>
                      <td>{formatNumber(row.units)} {selectedDefinition ? selectedDefinition.unitLabel : 'คัน/ลำ'}</td>
                      <td className={styles.indexCell}>{decimalFormat.format(row.profile.mechanizationIndex)}</td>
                      <td>
                        <LevelBadge level={row.readiness.level}>
                          {formatNumber(row.readiness.adequacyPercent)}%
                        </LevelBadge>
                      </td>
                      <td>{formatNumber(row.profile.centerCount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {tableRows.length > TABLE_PAGE_SIZE ? (
            <nav className={styles.pager} aria-label="การแบ่งหน้าตารางอันดับจังหวัด">
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setTablePage(safeTablePage - 1)}
                disabled={safeTablePage <= 1}
              >
                ก่อนหน้า
              </button>
              <span className={styles.pageStatus}>
                หน้า <strong>{formatNumber(safeTablePage)}</strong> จาก {formatNumber(tablePageCount)}
              </span>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => setTablePage(safeTablePage + 1)}
                disabled={safeTablePage >= tablePageCount}
              >
                ถัดไป
              </button>
              <span className={styles.pagerRange} aria-live="polite">
                แสดง {formatNumber((safeTablePage - 1) * TABLE_PAGE_SIZE + 1)}–
                {formatNumber(Math.min(safeTablePage * TABLE_PAGE_SIZE, tableRows.length))} จาก{' '}
                {formatNumber(tableRows.length)} จังหวัด
              </span>
            </nav>
          ) : null}
        </div>
      </section>

      <section id="sources" className={styles.section} aria-labelledby="sources-title">
        <SectionHeading
          id="sources-title"
          kicker="GOVERNANCE &amp; METHOD"
          title="วิธีการ แหล่งอ้างอิง และข้อจำกัด"
          aside={<span className={styles.sectionPill}>ต้องอ่านก่อนใช้ข้อมูล</span>}
        />
        <details id="sources-details" className={styles.detailsPanel} open={sourcesOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setSourcesOpen((open) => !open);
            }}
          >
            อ่านรายละเอียด ข้อจำกัด และแหล่งข้อมูล
          </summary>
          <div className={styles.detailsBody}>
            <p className={styles.detailsLead}>
              ตัวเลขทั้งหมดเป็นชุดตัวอย่างที่คำนวณซ้ำได้จากสมมติฐานเดียวกัน
              ต้องตรวจทานกับทะเบียนจริงก่อนใช้ตัดสินใจลงทุนหรือจัดสรรเครื่องจักร
            </p>
            <div className={styles.governanceGrid}>
              <div className={styles.methodCard}>
                <span className={styles.cardKicker}>METHODOLOGY</span>
                <h3>สูตรและสมมติฐานหลัก</h3>
                <div className={styles.methodList}>
                  {payload.methodology.map((method) => (
                    <div key={method.title} className={styles.methodItem}>
                      <strong>{method.title}</strong>
                      <p>{method.detail}</p>
                    </div>
                  ))}
                </div>
                <div className={styles.endpointBox}>
                  <span>PUBLIC API</span>
                  <code>GET /api/v1/machinery?provinceCode=14&amp;machineryType=combine_harvester</code>
                  <a href={apiHref} target="_blank" rel="noreferrer">
                    <CodeIcon size={15} /> เปิดผลลัพธ์ตามตัวกรองปัจจุบัน
                  </a>
                </div>
              </div>

              <div className={styles.sourceCard}>
                <div className={styles.sourceHead}>
                  <div>
                    <span className={styles.cardKicker}>REFERENCES</span>
                    <h3>แหล่งอ้างอิงและสถานะ</h3>
                  </div>
                  <span className={styles.sectionPill}>{formatNumber(payload.sources.length)} แหล่ง</span>
                </div>
                <div className={styles.sourceList}>
                  {payload.sources.map((source) => (
                    <div key={source.id} className={styles.sourceItem}>
                      <div className={styles.sourceTitleRow}>
                        <strong>{source.name}</strong>
                        <span className={source.status === 'verified_reference' ? styles.sourceVerified : styles.sourcePending}>
                          {source.status === 'verified_reference' ? 'อ้างอิงราชการ' : 'รอยืนยัน'}
                        </span>
                      </div>
                      <span className={styles.sourceRole}>{source.role}</span>
                      <p>{source.note}</p>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.url}
                        </a>
                      ) : (
                        <span className={styles.sourceNoLink}>ไม่แสดงลิงก์จนกว่าจะยืนยันแหล่งทางการ</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.warningsCard}>
              <div className={styles.warningsHead}>
                <span className={styles.warningsIcon}>
                  <AlertIcon size={18} />
                </span>
                <div>
                  <strong>ข้อจำกัดที่ต้องอ่านก่อนใช้ข้อมูล</strong>
                  <span>อ่านควบคู่กับ methodology และแหล่งอ้างอิงทุกครั้ง</span>
                </div>
              </div>
              <ul>
                {payload.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>

            <p className={styles.footerNote}>
              Thailand Agricultural Data Hub • Machinery sample dataset • ข้อมูล ณ {payload.dataAsOfLabel} •
              ค่าเช่าและความพร้อมเป็นค่าจำลอง ไม่ใช่ราคาหรือสถานะบริการจริง
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}

function ServiceCenterCard({
  center,
  typeMap,
}: {
  center: ServiceCenter;
  typeMap: Record<MachineryType, MachineryTypeDefinition>;
}) {
  const unitStatLabel =
    center.status === 'maintenance'
      ? center.kind === 'mechanic'
        ? 'ช่องบริการในความดูแล'
        : 'เครื่องจักรในความดูแล'
      : center.kind === 'mechanic'
        ? 'ช่องบริการพร้อมรับ'
        : 'เครื่องจักรพร้อมให้บริการ';
  const loadClass =
    center.bookingLoadPercent >= 80
      ? styles.bookingHigh
      : center.bookingLoadPercent >= 60
        ? styles.bookingMedium
        : styles.bookingLow;

  return (
    <article className={styles.centerCard}>
      <div className={styles.centerTop}>
        <span className={`${styles.kindBadge} ${KIND_CLASS[center.kind]}`}>
          <KindIcon kind={center.kind} size={15} />
          {center.kindLabel}
        </span>
        <span className={`${styles.statusBadge} ${STATUS_CLASS[center.status]}`}>
          <i aria-hidden="true" />
          {center.statusLabel}
        </span>
      </div>

      <h3 className={styles.centerName}>{center.name}</h3>
      <p className={styles.centerLocation}>
        <PinIcon />
        {center.district} • {center.provinceName} • {center.region}
      </p>

      <div className={styles.centerTypes}>
        {center.supportedTypes.map((type) => {
          const definition = typeMap[type];
          return (
            <span
              key={type}
              className={styles.centerTypeChip}
              style={{ '--chip-color': definition.accent, '--chip-soft': definition.softAccent } as CssVars}
            >
              <TypeGlyph type={type} size={13} />
              {definition.shortName}
            </span>
          );
        })}
      </div>

      <div className={styles.centerStats}>
        <div>
          <strong>{formatNumber(center.availableUnits)}</strong>
          <span>{unitStatLabel}</span>
        </div>
        <div>
          <strong>{formatNumber(center.certifiedMechanics)}</strong>
          <span>ช่างที่ขึ้นทะเบียน</span>
        </div>
        <div>
          <strong>{formatNumber(center.responseHours)}</strong>
          <span>ชั่วโมงตอบกลับ</span>
        </div>
      </div>

      <div className={styles.bookingRow}>
        <div className={styles.bookingLabel}>
          <span>ภาระคิวจอง</span>
          <strong>{formatNumber(center.bookingLoadPercent)}%</strong>
        </div>
        <div className={styles.bookingTrack}>
          <span className={loadClass} style={{ width: `${Math.min(100, center.bookingLoadPercent)}%` }} />
        </div>
      </div>

      <div className={styles.centerContact}>
        <span>{center.operator} • {center.operatorTypeLabel}</span>
        <span>{center.contactChannel}</span>
      </div>

      <div className={styles.centerServices}>
        {center.services.map((service) => (
          <span key={service}>{service}</span>
        ))}
      </div>

      <div className={styles.centerFoot}>
        <span>ตรวจสอบล่าสุด {formatDate(center.verifiedAt)}</span>
        <span>รัศมี {formatNumber(center.serviceRadiusKm)} กม.</span>
      </div>
    </article>
  );
}
