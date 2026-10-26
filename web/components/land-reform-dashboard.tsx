'use client';

import { useMemo, useState } from 'react';
import {
  LAND_REFORM_BANNER_TEXT,
  LAND_REFORM_DISCLAIMER,
  LAND_TYPES,
  LAND_TYPE_LABELS,
  REGIONS,
  buildLandReformData,
  type LandReformData,
  type LandType,
  type LandUseShare,
  type ProvinceLandReform,
  type Region,
} from '@/lib/hub/land-reform-data';
import styles from './land-reform-dashboard.module.css';

interface LandReformDashboardProps {
  initialData: LandReformData;
}

type RegionFilter = Region | 'all';
type LandTypeFilter = LandType | 'all';
type ProvinceStatusKey = 'no_area' | 'deed_issued' | 'verified' | 'applied' | 'not_applied';

const ALL = 'all' as const;

const numberFormatter = new Intl.NumberFormat('th-TH');
const decimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });

const LAND_USE_COLORS: Record<LandUseShare['id'], string> = {
  field_crops: '#4d7040',
  fruit_tree: '#7f9c4b',
  rice: '#c2a24a',
  livestock: '#a97a55',
  water: '#4f7f88',
};

const DONUT_RADIUS = 80;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function formatInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return numberFormatter.format(value);
}

function formatDecimal(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return decimalFormatter.format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${decimalFormatter.format(value)}%`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function getProvinceStatus(province: ProvinceLandReform): { key: ProvinceStatusKey; label: string } {
  if (!province.hasAlroArea || province.totalReformAreaRai <= 0) {
    return { key: 'no_area', label: 'ไม่มีเขตปฏิรูป' };
  }
  if (province.titleDeed.issued > 0) {
    return { key: 'deed_issued', label: 'ออกโฉนดแล้ว' };
  }
  if (province.titleDeed.verified > 0) {
    return { key: 'verified', label: 'ผ่านการตรวจสอบ' };
  }
  if (province.titleDeed.applications > 0) {
    return { key: 'applied', label: 'ยื่นคำขอแล้ว' };
  }
  return { key: 'not_applied', label: 'ยังไม่ยื่นคำขอ' };
}

function getStatusClassName(key: ProvinceStatusKey): string {
  switch (key) {
    case 'no_area':
      return styles.statusNoArea;
    case 'deed_issued':
      return styles.statusIssued;
    case 'verified':
      return styles.statusVerified;
    case 'applied':
      return styles.statusApplied;
    case 'not_applied':
    default:
      return styles.statusNotApplied;
  }
}

export function LandReformDashboard({ initialData }: LandReformDashboardProps) {
  const [region, setRegion] = useState<RegionFilter>(ALL);
  const [provinceCode, setProvinceCode] = useState<string>(ALL);
  const [landType, setLandType] = useState<LandTypeFilter>(ALL);

  const provinceOptions = useMemo(() => {
    return initialData.provinces
      .filter((province) => region === ALL || province.region === region)
      .slice()
      .sort((a, b) =>
        a.provinceCode < b.provinceCode ? -1 : a.provinceCode > b.provinceCode ? 1 : 0,
      );
  }, [initialData.provinces, region]);

  const view = useMemo(() => {
    const filters: { provinceCode?: string; landType?: LandType; region?: Region } = {};
    if (region !== ALL) filters.region = region;
    if (provinceCode !== ALL) filters.provinceCode = provinceCode;
    if (landType !== ALL) filters.landType = landType;
    return buildLandReformData(filters);
  }, [region, provinceCode, landType]);

  const hasProvinces = view.provinces.length > 0;

  const sortedProvinces = useMemo(() => {
    return [...view.provinces].sort((a, b) => {
      if (b.totalReformAreaRai !== a.totalReformAreaRai) {
        return b.totalReformAreaRai - a.totalReformAreaRai;
      }
      return a.provinceCode < b.provinceCode ? -1 : a.provinceCode > b.provinceCode ? 1 : 0;
    });
  }, [view.provinces]);

  const landUseTotalRai = useMemo(() => {
    return view.landUse.reduce((sum, item) => (Number.isFinite(item.areaRai) ? sum + item.areaRai : sum), 0);
  }, [view.landUse]);

  const donutSegments = useMemo(() => {
    if (landUseTotalRai <= 0) return [];
    const visibleShares = view.landUse.filter((item) => item.sharePercent > 0);
    return visibleShares.map((item, index) => {
      const share = clampPercent(item.sharePercent);
      const length = (share / 100) * DONUT_CIRCUMFERENCE;
      const precedingLength = visibleShares
        .slice(0, index)
        .reduce((sum, previous) => sum + (clampPercent(previous.sharePercent) / 100) * DONUT_CIRCUMFERENCE, 0);
      return {
        id: item.id,
        color: LAND_USE_COLORS[item.id] ?? '#7b8f6b',
        dashArray: `${length} ${DONUT_CIRCUMFERENCE - length}`,
        dashOffset: -precedingLength,
      };
    });
  }, [view.landUse, landUseTotalRai]);

  const tenureOwnedShare = clampPercent(view.summary.tenure.ownedSharePercent);
  const tenureRentedShare = clampPercent(view.summary.tenure.rentedSharePercent);
  const hasTenureData =
    view.summary.allocatedAreaRai > 0 &&
    view.summary.tenure.ownedRai + view.summary.tenure.rentedRai > 0;

  const isFiltered = region !== ALL || provinceCode !== ALL || landType !== ALL;

  const handleRegionChange = (value: string) => {
    setRegion(value as RegionFilter);
    setProvinceCode(ALL);
  };

  const handleReset = () => {
    setRegion(ALL);
    setProvinceCode(ALL);
    setLandType(ALL);
  };

  return (
    <div className={styles.container}>
      {/* 1. Header */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>เขตปฏิรูปที่ดิน ส.ป.ก. และกรรมสิทธิ์ที่ดินเกษตรกรรม</h1>
          <p className={styles.subtitle}>
            ภาพรวมเนื้อที่เขตปฏิรูปที่ดิน เอกสารสิทธิ์ และความมั่นคงในการถือครองที่ดินรายจังหวัด
            จากแบบจำลองเชิงโครงสร้างเพื่อการสาธิต — ไม่ใช่สถิติหรือประกาศทางการของ ส.ป.ก.
          </p>
        </div>
        <span className={styles.headerBadge}>
          <span className={styles.headerDot} aria-hidden="true" />
          แบบจำลองเชิงโครงสร้าง · ยังไม่เปิดเผยตัวเลขต้นทาง
        </span>
      </header>

      {/* 2. Data governance banner */}
      <aside
        className={styles.governanceBanner}
        role="note"
        aria-label="คำชี้แจงข้อมูลตัวอย่างและการตรวจสอบสิทธิ์ของข้อมูล"
      >
        <span className={styles.bannerIconWrap} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 2.7 20a1.4 1.4 0 0 0 1.2 2h16.2a1.4 1.4 0 0 0 1.2-2Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <div className={styles.bannerContent}>
          <div className={styles.bannerChips}>
            <span className={styles.chip}>
              <code className={styles.chipCode}>sample: true</code>
            </span>
            <span className={styles.chip}>
              <code className={styles.chipCode}>meta.access: &quot;metadata_only&quot;</code>
            </span>
            <span className={styles.chip}>สิทธิ์ ALRO อยู่ระหว่างตรวจสอบ</span>
          </div>
          <p className={styles.bannerTitle}>{LAND_REFORM_BANNER_TEXT}</p>
          <p className={styles.bannerText}>
            ตัวเลขทุกค่าในหน้านี้เป็นผลของแบบจำลองเชิงโครงสร้างแบบกำหนดตายตัว (deterministic structural
            simulation) เพื่อสาธิตหน้าจอเท่านั้น ไม่ใช่สถิติทางการของสำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม
            (ส.ป.ก.) และสิทธิ์การเผยแพร่ข้อมูลต้นทางยังอยู่ระหว่างตรวจสอบ
          </p>
        </div>
      </aside>

      {/* 3. Filters */}
      <section className={styles.filtersPanel} aria-labelledby="land-reform-filters-title">
        <div className={styles.filtersHeader}>
          <h2 id="land-reform-filters-title" className={styles.filtersTitle}>
            ตัวกรองข้อมูล
          </h2>
          <span className={styles.resultsMeta} aria-live="polite">
            แสดง {view.provinces.length} จาก {initialData.provinces.length} จังหวัด
          </span>
        </div>

        <div className={styles.filterGrid}>
          <div className={styles.filterField}>
            <label htmlFor="land-reform-region">ภาค</label>
            <select
              id="land-reform-region"
              className={styles.select}
              value={region}
              onChange={(event) => handleRegionChange(event.target.value)}
            >
              <option value={ALL}>ทุกภาค</option>
              {REGIONS.map((regionOption) => (
                <option key={regionOption} value={regionOption}>
                  {regionOption}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterField}>
            <label htmlFor="land-reform-province">จังหวัด</label>
            <select
              id="land-reform-province"
              className={styles.select}
              value={provinceCode}
              onChange={(event) => setProvinceCode(event.target.value)}
            >
              <option value={ALL}>ทุกจังหวัด</option>
              {provinceOptions.map((province) => (
                <option key={province.provinceCode} value={province.provinceCode}>
                  {province.provinceCode} — {province.provinceName}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterField}>
            <label htmlFor="land-reform-land-type">ประเภทเอกสารสิทธิ์</label>
            <select
              id="land-reform-land-type"
              className={styles.select}
              value={landType}
              onChange={(event) => setLandType(event.target.value as LandTypeFilter)}
            >
              <option value={ALL}>ทุกประเภทเอกสารสิทธิ์</option>
              {LAND_TYPES.map((landTypeOption) => (
                <option key={landTypeOption} value={landTypeOption}>
                  {LAND_TYPE_LABELS[landTypeOption]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className={styles.helperText}>
          ตัวกรองประเภทเอกสารสิทธิ์จะแสดงเฉพาะจังหวัดที่มีตัวชี้วัดของประเภทนั้นมากกว่า 0
          ตามแบบจำลองในชุดข้อมูลนี้
        </p>

        <div className={styles.filterActions}>
          <button type="button" className={styles.resetButton} onClick={handleReset} disabled={!isFiltered}>
            ล้างตัวกรองทั้งหมด
          </button>
        </div>
      </section>

      {!hasProvinces && (
        <div className={styles.noResults} role="status">
          <p>ไม่พบจังหวัดที่ตรงกับตัวกรองที่เลือก ลองเปลี่ยนภาค จังหวัด หรือประเภทเอกสารสิทธิ์</p>
          <button type="button" className={styles.resetButton} onClick={handleReset}>
            ล้างตัวกรองทั้งหมด
          </button>
        </div>
      )}

      {/* 4. KPI cards */}
      <section className={styles.kpiGrid} aria-label="ตัวชี้วัดหลักเขตปฏิรูปที่ดิน">
        <article className={`${styles.kpiCard} ${styles.kpiArea}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>เนื้อที่ปฏิรูปที่ดิน (ไร่)</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3Z" />
                <path d="M9 3v15M15 6v15" />
              </svg>
            </span>
          </div>
          <p className={styles.kpiValue}>{hasProvinces ? formatInteger(view.summary.totalReformAreaRai) : '—'}</p>
          <p className={styles.kpiHint}>
            จัดสรรแล้ว {hasProvinces ? formatInteger(view.summary.allocatedAreaRai) : '—'} ไร่ ·{' '}
            {hasProvinces ? formatPercent(view.summary.allocationProgressPercent) : '—'} ของเนื้อที่เขตปฏิรูป
          </p>
        </article>

        <article className={`${styles.kpiCard} ${styles.kpiFarmers}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>เกษตรกรผู้ได้รับจัดสรร (ราย)</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
          </div>
          <p className={styles.kpiValue}>{hasProvinces ? formatInteger(view.summary.farmersWithPermit) : '—'}</p>
          <p className={styles.kpiHint}>
            {hasProvinces ? formatInteger(view.summary.plotCount) : '—'} แปลง ·
            เฉลี่ย {hasProvinces ? formatDecimal(view.summary.averagePlotSizeRai) : '—'} ไร่ต่อแปลง
          </p>
        </article>

        <article className={`${styles.kpiCard} ${styles.kpiDeed}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>แปลงโฉนดเพื่อเกษตรกรรม (แปลง)</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6M9 15l2 2 4-4" />
              </svg>
            </span>
          </div>
          <p className={styles.kpiValue}>{hasProvinces ? formatInteger(view.summary.titleDeed.issued) : '—'}</p>
          <p className={styles.kpiHint}>
            ยื่นคำขอ {hasProvinces ? formatInteger(view.summary.titleDeed.applications) : '—'} ·
            ผ่านการตรวจสอบ {hasProvinces ? formatInteger(view.summary.titleDeed.verified) : '—'}
          </p>
        </article>

        <article className={`${styles.kpiCard} ${styles.kpiTenure}`}>
          <div className={styles.kpiTop}>
            <span className={styles.kpiLabel}>ดัชนีความมั่นคงถือครองที่ดิน (%)</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
          </div>
          <p className={styles.kpiValue}>{hasProvinces ? formatDecimal(view.summary.tenureSecurityIndex) : '—'}</p>
          <p className={styles.kpiHint}>
            ที่ดินของตนเอง {hasProvinces ? formatPercent(view.summary.tenure.ownedSharePercent) : '—'} ·
            เช่าทำกิน {hasProvinces ? formatPercent(view.summary.tenure.rentedSharePercent) : '—'}
          </p>
        </article>
      </section>

      {/* 5. Charts */}
      <section className={styles.chartGrid} aria-label="กราฟสรุปสัดส่วนที่ดิน">
        <article className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>สัดส่วนการใช้ประโยชน์ที่ดิน</h2>
            <span className={styles.cardNote}>
              5 หมวด · รวม {formatInteger(landUseTotalRai)} ไร่
            </span>
          </div>

          {landUseTotalRai > 0 ? (
            <div className={styles.donutLayout}>
              <svg
                className={styles.donut}
                viewBox="0 0 200 200"
                role="img"
                aria-labelledby="land-use-donut-title"
                aria-describedby="land-use-donut-desc"
              >
                <title id="land-use-donut-title">
                  {`สัดส่วนการใช้ประโยชน์ที่ดินในเขตปฏิรูปที่ดิน 5 หมวด รวม ${formatInteger(landUseTotalRai)} ไร่`}
                </title>
                <desc id="land-use-donut-desc">
                  วงกลมแสดงสัดส่วนพื้นที่พืชไร่ ไม้ผล ข้าว ปศุสัตว์ และแหล่งน้ำ จากแบบจำลองเชิงโครงสร้าง
                  รายละเอียดร้อยละและเนื้อที่แต่ละหมวดอยู่ในรายการถัดจากกราฟ
                </desc>
                <circle cx="100" cy="100" r={DONUT_RADIUS} fill="none" stroke="var(--line, #dce3d9)" strokeWidth="26" />
                <g transform="rotate(-90 100 100)">
                  {donutSegments.map((segment) => (
                    <circle
                      key={segment.id}
                      cx="100"
                      cy="100"
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke={segment.color}
                      strokeWidth="26"
                      strokeDasharray={segment.dashArray}
                      strokeDashoffset={segment.dashOffset}
                    />
                  ))}
                </g>
                <text x="100" y="95" textAnchor="middle" className={styles.donutValue}>
                  {formatInteger(landUseTotalRai)}
                </text>
                <text x="100" y="116" textAnchor="middle" className={styles.donutUnit}>
                  ไร่ (รวม)
                </text>
              </svg>

              <ul className={styles.legend}>
                {view.landUse.map((item) => (
                  <li key={item.id} className={styles.legendItem}>
                    <span
                      className={styles.legendSwatch}
                      style={{ backgroundColor: LAND_USE_COLORS[item.id] ?? '#7b8f6b' }}
                      aria-hidden="true"
                    />
                    <span className={styles.legendLabel}>{item.label}</span>
                    <span className={styles.legendValue}>{formatPercent(item.sharePercent)}</span>
                    <span className={styles.legendArea}>{formatInteger(item.areaRai)} ไร่</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.chartEmpty}>
              ไม่มีข้อมูลสัดส่วนการใช้ประโยชน์ที่ดินในเงื่อนไขที่เลือก จึงไม่แสดงกราฟวงกลม
            </p>
          )}
        </article>

        <article className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>ที่ดินของตนเอง vs เช่าทำกิน</h2>
            <span className={styles.cardNote}>จากเนื้อที่จัดสรรแล้ว</span>
          </div>

          {hasTenureData ? (
            <div className={styles.tenure}>
              <div
                className={styles.tenureBar}
                role="img"
                aria-label={`สัดส่วนที่ดินถือครองเอง ${formatPercent(tenureOwnedShare)} และเช่าทำกิน ${formatPercent(tenureRentedShare)}`}
              >
                <span className={styles.tenureOwned} style={{ width: `${tenureOwnedShare}%` }} />
                <span className={styles.tenureRented} style={{ width: `${tenureRentedShare}%` }} />
              </div>

              <div className={styles.tenureLegend}>
                <div className={styles.tenureLegendItem}>
                  <span className={`${styles.tenureDot} ${styles.tenureDotOwned}`} aria-hidden="true" />
                  <div className={styles.tenureLegendBody}>
                    <span className={styles.tenureLegendLabel}>ที่ดินของตนเอง</span>
                    <span className={styles.tenureLegendValue}>{formatPercent(tenureOwnedShare)}</span>
                    <span className={styles.tenureRai}>{formatInteger(view.summary.tenure.ownedRai)} ไร่</span>
                  </div>
                </div>
                <div className={styles.tenureLegendItem}>
                  <span className={`${styles.tenureDot} ${styles.tenureDotRented}`} aria-hidden="true" />
                  <div className={styles.tenureLegendBody}>
                    <span className={styles.tenureLegendLabel}>เช่าทำกิน</span>
                    <span className={styles.tenureLegendValue}>{formatPercent(tenureRentedShare)}</span>
                    <span className={styles.tenureRai}>{formatInteger(view.summary.tenure.rentedRai)} ไร่</span>
                  </div>
                </div>
              </div>

              <p className={styles.cardFootnote}>
                เนื้อที่จัดสรรแล้วรวม {formatInteger(view.summary.allocatedAreaRai)} ไร่
                · สัดส่วนคำนวณจากแบบจำลอง ไม่ใช่ทะเบียนที่ดินจริง
              </p>
            </div>
          ) : (
            <p className={styles.chartEmpty}>
              ยังไม่มีเนื้อที่จัดสรรในเงื่อนไขที่เลือก จึงไม่แสดงสัดส่วนการถือครองที่ดิน
            </p>
          )}
        </article>
      </section>

      {/* 6. Province table */}
      {hasProvinces && (
        <section className={styles.tableSection} aria-labelledby="land-reform-table-title">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="land-reform-table-title" className={styles.sectionTitle}>
                เปรียบเทียบข้อมูลเขตปฏิรูปที่ดินรายจังหวัด
              </h2>
              <p className={styles.sectionNote}>
                เรียงตามเนื้อที่เขตปฏิรูปจากมากไปน้อย · แสดง {sortedProvinces.length} จังหวัด
                ตามตัวกรองปัจจุบัน
              </p>
            </div>
          </div>

          <p className={styles.scrollHint}>เลื่อนตารางแนวนอน</p>

          <div className={styles.tableCard}>
            <div
              className={styles.tableWrap}
              role="region"
              aria-label="ตารางข้อมูลเขตปฏิรูปที่ดินรายจังหวัด เลื่อนแนวนอนได้"
              tabIndex={0}
            >
              <table className={styles.table}>
                <caption className="sr-only">
                  เนื้อที่เขตปฏิรูปที่ดิน จัดสรรแล้ว เกษตรกรผู้ได้รับจัดสรร แปลงโฉนดเพื่อการเกษตร
                  ความมั่นคงถือครอง และสถานะรายจังหวัด จากแบบจำลองเชิงโครงสร้าง
                </caption>
                <thead>
                  <tr>
                    <th scope="col">จังหวัด</th>
                    <th scope="col">ภาค</th>
                    <th scope="col">เนื้อที่เขตปฏิรูป (ไร่)</th>
                    <th scope="col">จัดสรรแล้ว 4-01 (ไร่)</th>
                    <th scope="col">เกษตรกร (ราย)</th>
                    <th scope="col">โฉนดเพื่อการเกษตร (แปลง)</th>
                    <th scope="col">ความมั่นคงถือครอง (%)</th>
                    <th scope="col">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProvinces.map((province) => {
                    const status = getProvinceStatus(province);
                    return (
                      <tr key={province.provinceCode}>
                        <th scope="row" className={styles.provinceCell}>
                          <span className={styles.provinceName}>{province.provinceName}</span>
                          <span className={styles.provinceCode}>{province.provinceCode}</span>
                        </th>
                        <td>{province.region}</td>
                        <td className={styles.numeric}>{formatInteger(province.totalReformAreaRai)}</td>
                        <td className={styles.numeric}>{formatInteger(province.allocatedAreaRai)}</td>
                        <td className={styles.numeric}>{formatInteger(province.farmersWithPermit)}</td>
                        <td className={styles.numeric}>{formatInteger(province.titleDeed.issued)}</td>
                        <td className={styles.numeric}>{formatDecimal(province.tenureSecurityIndex)}</td>
                        <td>
                          <span className={`${styles.statusPill} ${getStatusClassName(status.key)}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 7. Zero-area provinces */}
      {view.zeroAreaProvinces.length > 0 && (
        <section className={styles.zeroAreaSection} aria-labelledby="land-reform-zero-area-title">
          <h2 id="land-reform-zero-area-title" className={styles.sectionTitle}>
            จังหวัดที่ไม่มีเขตปฏิรูปในแบบจำลอง
          </h2>
          <p className={styles.sectionNote}>
            เหตุผลเชิงโครงสร้างจากชุดข้อมูลตัวอย่าง ไม่ได้หมายความว่าจังหวัดนั้นไม่มีเขตปฏิรูปที่ดินจริง
          </p>
          <ul className={styles.zeroAreaList}>
            {view.zeroAreaProvinces.map((item) => (
              <li key={item.provinceCode}>
                <span className={styles.zeroAreaName}>
                  {item.provinceCode} — {item.provinceName}
                </span>
                <span className={styles.zeroAreaReason}>{item.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 8. Footer / disclaimer */}
      <footer className={styles.footerNote}>
        <p>{LAND_REFORM_DISCLAIMER}</p>
        <p className={styles.footerMeta}>
          ข้อมูล ณ วันที่ {view.asOfDate} · datasetVersion: {view.datasetVersion} ·
          หน้านี้ไม่มีตัวเลขทางการของ ส.ป.ก. (ALRO)
        </p>
        {view.warnings.length > 0 && (
          <ul className={styles.warningList}>
            {view.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}
