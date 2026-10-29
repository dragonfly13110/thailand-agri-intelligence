'use client';

import React, { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  buildCarbonDashboard,
  CARBON_CREDIT_PRICE_THB_PER_TCO2E,
  CARBON_PROJECT_TYPE_LABELS,
  type CarbonDashboardPayload,
  type CarbonProjectFilter,
  type VerProjectStatus,
} from '@/lib/hub/carbon-data';
import { Icon, type IconName } from './icon';
import styles from './carbon-dashboard.module.css';

const integerFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });

function formatInt(value: number): string {
  return integerFormatter.format(Math.round(value));
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

function formatMillion(value: number): string {
  return decimalFormatter.format(value / 1_000_000);
}

const CATEGORY_ICONS: Record<string, IconName> = {
  perennial_tree: 'leaf',
  rubber: 'leaf',
  oil_palm: 'sun',
  soil: 'layers',
};

const STATUS_CLASSES: Record<VerProjectStatus, string> = {
  registered: styles.statusRegistered,
  verified: styles.statusVerified,
  certified: styles.statusCertified,
};

const PROJECT_TYPE_OPTIONS: Array<{ value: CarbonProjectFilter; label: string }> = [
  { value: 'all', label: 'ทุกประเภทโครงการ' },
  { value: 'awd', label: CARBON_PROJECT_TYPE_LABELS.awd },
  { value: 'perennial_tree', label: CARBON_PROJECT_TYPE_LABELS.perennial_tree },
  { value: 'rubber', label: CARBON_PROJECT_TYPE_LABELS.rubber },
  { value: 'oil_palm', label: CARBON_PROJECT_TYPE_LABELS.oil_palm },
  { value: 'soil', label: CARBON_PROJECT_TYPE_LABELS.soil },
];

const PROJECT_PAGE_SIZE = 9;
const PROVINCE_PAGE_SIZE = 20;

function Pager({
  page,
  pageCount,
  total,
  from,
  to,
  noun,
  onPrevious,
  onNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  noun: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (pageCount <= 1 || total === 0) return null;
  return (
    <div className={styles.pager}>
      <p className={styles.pagerStatus} role="status" aria-live="polite">
        แสดง <strong>{formatInt(from)}–{formatInt(to)}</strong> จาก {formatInt(total)} {noun}
        {' · '}หน้า <strong>{formatInt(page)}</strong> จาก {formatInt(pageCount)}
      </p>
      <div className={styles.pagerButtons}>
        <button type="button" className={styles.pagerButton} onClick={onPrevious} disabled={page <= 1}>
          ก่อนหน้า
        </button>
        <button type="button" className={styles.pagerButton} onClick={onNext} disabled={page >= pageCount}>
          ถัดไป
        </button>
      </div>
    </div>
  );
}

export interface CarbonDashboardProps {
  payload: CarbonDashboardPayload;
}

export function CarbonDashboard({ payload }: CarbonDashboardProps) {
  const [provinceCode, setProvinceCode] = useState<string>(payload.filters.provinceCode ?? 'all');
  const [projectType, setProjectType] = useState<CarbonProjectFilter>(payload.filters.projectType);
  const [projectPage, setProjectPage] = useState<number>(1);
  const [provincePage, setProvincePage] = useState<number>(1);

  const activePayload = useMemo(
    () =>
      buildCarbonDashboard({
        provinceCode: provinceCode === 'all' ? null : provinceCode,
        projectType,
      }),
    [provinceCode, projectType]
  );

  const { scopedSummary, categories, provinces, selectedProvince, verSummary } = activePayload;
  const nationalSummary = payload.nationalSummary;
  const hasActiveFilters = provinceCode !== 'all' || projectType !== 'all';

  const totalCategoryArea = categories.reduce((total, category) => total + category.areaRai, 0);
  const totalCategorySequestration = categories.reduce(
    (total, category) => total + category.sequestrationTCO2ePerYear,
    0
  );

  const maxAwdReduction = activePayload.awdTopProvinces[0]?.awdMethaneReductionTCO2e || 1;

  const projectPageCount = Math.max(1, Math.ceil(activePayload.projects.length / PROJECT_PAGE_SIZE));
  const currentProjectPage = Math.min(projectPage, projectPageCount);
  const visibleProjects = activePayload.projects.slice(
    (currentProjectPage - 1) * PROJECT_PAGE_SIZE,
    currentProjectPage * PROJECT_PAGE_SIZE,
  );

  const provincePageCount = Math.max(1, Math.ceil(provinces.length / PROVINCE_PAGE_SIZE));
  const currentProvincePage = Math.min(provincePage, provincePageCount);
  const pagedProvinces = provinces.slice(
    (currentProvincePage - 1) * PROVINCE_PAGE_SIZE,
    currentProvincePage * PROVINCE_PAGE_SIZE,
  );

  const awdAdoption = scopedSummary.awdAdoptionRate;
  const gaugeRadius = 54;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeDash = (Math.min(awdAdoption, 100) / 100) * gaugeCircumference;

  const handleReset = () => {
    setProvinceCode('all');
    setProjectType('all');
    setProjectPage(1);
    setProvincePage(1);
  };

  const handleProvinceSelect = (code: string) => {
    setProvinceCode(code);
    setProjectPage(1);
    setProvincePage(1);
  };

  const handleProjectTypeSelect = (value: CarbonProjectFilter) => {
    setProjectType(value);
    setProjectPage(1);
    setProvincePage(1);
  };

  return (
    <div className={styles.container}>
      <section className={styles.sampleBanner} aria-label="ข้อความแจ้งเตือนข้อมูลตัวอย่าง">
        <div className={styles.sampleBannerIcon} aria-hidden="true">
          <Icon name="info" size={20} />
        </div>
        <div className={styles.sampleBannerBody}>
          <strong>ข้อมูลตัวอย่างเพื่อสาธิต (Deterministic Sample · Metadata Only)</strong>
          <p>
            ตัวเลขคาร์บอนเครดิต โครงการ T-VER และผลวิเคราะห์ AWD ผลิตจากแบบจำลองรายจังหวัดแบบกำหนดผลซ้ำได้
            เพื่อทดสอบหน้าจอและสัญญา API เท่านั้น ยังไม่ผ่านการทวนสอบหรือได้รับสิทธิ์เผยแพร่ตัวเลขจริงจากหน่วยงานต้นทาง
            ข้อมูล ณ {activePayload.dataAsOf}
          </p>
          <ul className={styles.warningList}>
            {activePayload.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label="ตัวชี้วัดคาร์บอนภาพรวมประเทศ">
        <div className={styles.kpiCard}>
          <div className={styles.kpiHead}>
            <span>ศักยภาพกักเก็บคาร์บอนรวม</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <Icon name="leaf" size={16} />
            </span>
          </div>
          <div className={styles.kpiValue}>
            {formatInt(nationalSummary.sequestrationTCO2ePerYear)} <span className={styles.kpiUnit}>tCO2e/ปี</span>
          </div>
          <div className={styles.kpiSub}>
            <span>พื้นที่เกษตร {formatMillion(nationalSummary.cultivatedRai)} ล้านไร่</span>
            <span className={styles.kpiDivider} aria-hidden="true">·</span>
            <span>สต็อกคาร์บอน {formatMillion(nationalSummary.carbonStockTCO2e)} ล้าน tCO2e</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHead}>
            <span>เครดิตคาร์บอนที่คาดหวัง</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <Icon name="chart" size={16} />
            </span>
          </div>
          <div className={styles.kpiValue}>
            {formatInt(nationalSummary.creditPotentialTCO2ePerYear)} <span className={styles.kpiUnit}>tCO2e/ปี</span>
          </div>
          <div className={styles.kpiSub}>
            <span className={styles.kpiHighlight}>
              ≈ {formatMillion(nationalSummary.creditValueThb)} ล้านบาท/ปี
            </span>
            <span className={styles.kpiDivider} aria-hidden="true">·</span>
            <span>อ้างอิง {CARBON_CREDIT_PRICE_THB_PER_TCO2E} บาท/tCO2e</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHead}>
            <span>โครงการ T-VER ภาคเกษตรและป่าไม้</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <Icon name="catalog" size={16} />
            </span>
          </div>
          <div className={styles.kpiValue}>
            {formatInt(nationalSummary.projectCount)} <span className={styles.kpiUnit}>โครงการ</span>
          </div>
          <div className={styles.kpiSub}>
            <span>ออกเครดิตแล้ว {formatInt(nationalSummary.certifiedCount)} โครงการ</span>
            <span className={styles.kpiDivider} aria-hidden="true">·</span>
            <span>เครดิตสะสม {formatInt(nationalSummary.issuedCreditsTCO2e)} tCO2e</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHead}>
            <span>ลดก๊าซมีเทนจาก AWD</span>
            <span className={styles.kpiIcon} aria-hidden="true">
              <Icon name="water" size={16} />
            </span>
          </div>
          <div className={styles.kpiValue}>
            {formatInt(nationalSummary.awdMethaneReductionTCO2e)} <span className={styles.kpiUnit}>tCO2e/ปี</span>
          </div>
          <div className={styles.kpiSub}>
            <span>ประหยัดน้ำ {formatMillion(nationalSummary.awdWaterSavingM3)} ล้าน ลบ.ม./ปี</span>
            <span className={styles.kpiDivider} aria-hidden="true">·</span>
            <span>อัตรานำร่อง {formatDecimal(nationalSummary.awdAdoptionRate)}%</span>
          </div>
        </div>
      </section>

      <section className={styles.filterCard} aria-label="ตัวกรองจังหวัดและประเภทโครงการ">
        <div className={styles.filterControls}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="carbon-province">
              จังหวัด (77 จังหวัด)
            </label>
            <select
              id="carbon-province"
              className={styles.selectInput}
              value={provinceCode}
              onChange={(event) => handleProvinceSelect(event.target.value)}
            >
              <option value="all">ทุกจังหวัด (77 จังหวัด)</option>
              {activePayload.allProvinces.map((province) => (
                <option key={province.code} value={province.code}>
                  {province.code} - {province.name} ({province.regionLabel})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="carbon-project-type">
              ประเภทโครงการ / วิธีปฏิบัติ
            </label>
            <select
              id="carbon-project-type"
              className={styles.selectInput}
              value={projectType}
              onChange={(event) => handleProjectTypeSelect(event.target.value as CarbonProjectFilter)}
            >
              {PROJECT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className={styles.resetButton}
            onClick={handleReset}
            disabled={!hasActiveFilters}
          >
            ล้างตัวกรอง
          </button>
        </div>

        <div className={styles.scopeStrip} aria-live="polite">
          <div className={styles.scopeItem}>
            <span>ขอบเขตที่เลือก</span>
            <strong>{activePayload.scopeLabel}</strong>
          </div>
          <div className={styles.scopeItem}>
            <span>พื้นที่เกษตรในขอบเขต</span>
            <strong>{formatInt(scopedSummary.cultivatedRai)} ไร่</strong>
          </div>
          <div className={styles.scopeItem}>
            <span>เครดิตคาดหวังในขอบเขต</span>
            <strong>{formatInt(scopedSummary.creditPotentialTCO2ePerYear)} tCO2e/ปี</strong>
          </div>
          <div className={styles.scopeItem}>
            <span>โครงการที่ตรงตัวกรอง</span>
            <strong>{formatInt(verSummary.projectCount)} โครงการ</strong>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="carbon-potential-heading">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>CARBON SEQUESTRATION</span>
            <h2 id="carbon-potential-heading">ศักยภาพกักเก็บคาร์บอนตามประเภทพืช</h2>
            <p>
              ประเมินพื้นที่เพาะปลูก สต็อกคาร์บอน และเครดิตที่คาดหวังจากไม้ยืนต้น ยางพารา ปาล์มน้ำมัน และดินเกษตร
              โดยคำนวณจากพื้นที่ในขอบเขตที่เลือก
            </p>
          </div>
          <span className={styles.sectionMeta}>{activePayload.scopeLabel}</span>
        </header>

        <div className={styles.categoryGrid}>
          {categories.map((category) => {
            const areaShare = totalCategoryArea > 0 ? (category.areaRai / totalCategoryArea) * 100 : 0;
            const isFocused = projectType === category.id;
            return (
              <article
                key={category.id}
                className={`${styles.categoryCard} ${isFocused ? styles.categoryCardFocused : ''}`}
                style={{ borderTopColor: category.color } as CSSProperties}
              >
                <div className={styles.categoryHead}>
                  <span className={styles.categoryIcon} style={{ background: category.color }}>
                    <Icon name={CATEGORY_ICONS[category.id] ?? 'leaf'} size={16} />
                  </span>
                  <div>
                    <h3>{category.label}</h3>
                    <span>{category.labelEn}</span>
                  </div>
                  <span className={styles.shareBadge}>{formatDecimal(category.shareOfSequestration)}%</span>
                </div>

                <p className={styles.categoryDescription}>{category.description}</p>

                <div className={styles.categoryValue}>
                  {formatInt(category.sequestrationTCO2ePerYear)}
                  <span>tCO2e/ปี</span>
                </div>

                <dl className={styles.categoryStats}>
                  <div>
                    <dt>พื้นที่</dt>
                    <dd>{formatMillion(category.areaRai)} ล้านไร่ ({formatDecimal(areaShare)}%)</dd>
                  </div>
                  <div>
                    <dt>สต็อกคาร์บอน</dt>
                    <dd>{formatMillion(category.carbonStockTCO2e)} ล้าน tCO2e</dd>
                  </div>
                  <div>
                    <dt>เครดิตคาดหวัง</dt>
                    <dd>{formatInt(category.creditPotentialTCO2ePerYear)} tCO2e/ปี</dd>
                  </div>
                  <div>
                    <dt>มูลค่าเครดิต</dt>
                    <dd>{formatMillion(category.creditValueThb)} ล้านบาท/ปี</dd>
                  </div>
                </dl>

                <div className={styles.adoptionRow}>
                  <div className={styles.adoptionLabel}>
                    <span>พื้นที่ปรับวิธีปฏิบัติแล้ว</span>
                    <strong>{formatDecimal(category.adoptionRate)}%</strong>
                  </div>
                  <div className={styles.adoptionTrack} aria-hidden="true">
                    <span
                      className={styles.adoptionFill}
                      style={{ width: `${category.adoptionRate}%`, background: category.color }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.mixCard}>
          <div className={styles.mixHead}>
            <h3>องค์ประกอบคาร์บอนในขอบเขตที่เลือก</h3>
            <span>พื้นที่ 4 ประเภทหลัก {formatInt(totalCategoryArea)} ไร่ (ไม่รวมนาที่วิเคราะห์ AWD)</span>
          </div>
          <div className={styles.mixRow}>
            <span className={styles.mixLabel}>สัดส่วนพื้นที่</span>
            <div className={styles.mixTrack} aria-hidden="true">
              {categories.map((category) => (
                <span
                  key={category.id}
                  style={{
                    width: `${totalCategoryArea > 0 ? (category.areaRai / totalCategoryArea) * 100 : 0}%`,
                    background: category.color,
                  }}
                />
              ))}
            </div>
          </div>
          <div className={styles.mixRow}>
            <span className={styles.mixLabel}>สัดส่วนศักยภาพ</span>
            <div className={styles.mixTrack} aria-hidden="true">
              {categories.map((category) => (
                <span
                  key={category.id}
                  style={{
                    width: `${
                      totalCategorySequestration > 0
                        ? (category.sequestrationTCO2ePerYear / totalCategorySequestration) * 100
                        : 0
                    }%`,
                    background: category.color,
                  }}
                />
              ))}
            </div>
          </div>
          <div className={styles.mixLegend}>
            {categories.map((category) => (
              <span key={category.id} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: category.color }} aria-hidden="true" />
                {category.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.awdSection} aria-labelledby="carbon-awd-heading">
        <div className={`${styles.awdPanel} ${projectType === 'awd' ? styles.awdPanelFocused : ''}`}>
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>GREEN FARMING · AWD</span>
              <h2 id="carbon-awd-heading">นาเปียกสลับแห้ง ลดมีเทน ประหยัดน้ำ</h2>
              <p>
                ประเมินผลจากการเปลี่ยนจากนาขังน้ำต่อเนื่องเป็นนาเปียกสลับแห้ง (Alternate Wetting and Drying)
                ในพื้นที่นาของขอบเขตที่เลือก
              </p>
            </div>
            <span className={styles.sectionMeta}>
              {selectedProvince ? selectedProvince.provinceName : 'ภาพรวมประเทศ'}
            </span>
          </header>

          <div className={styles.gaugeRow}>
            <div className={styles.gaugeWrap}>
              <svg
                className={styles.gauge}
                viewBox="0 0 144 144"
                role="img"
                aria-label={`อัตราการนำ AWD ไปใช้ ${formatDecimal(awdAdoption)} เปอร์เซ็นต์`}
              >
                <circle className={styles.gaugeTrack} cx="72" cy="72" r={gaugeRadius} />
                <circle
                  className={styles.gaugeValue}
                  cx="72"
                  cy="72"
                  r={gaugeRadius}
                  strokeDasharray={`${gaugeDash} ${gaugeCircumference - gaugeDash}`}
                />
                <text x="72" y="69" textAnchor="middle" className={styles.gaugeNumber}>
                  {formatDecimal(awdAdoption)}%
                </text>
                <text x="72" y="88" textAnchor="middle" className={styles.gaugeLabel}>
                  AWD adoption
                </text>
              </svg>
            </div>

            <div className={styles.awdStats}>
              <div className={styles.awdStat}>
                <span>พื้นที่นาทั้งหมด</span>
                <strong>{formatInt(scopedSummary.riceAreaRai)}</strong>
                <small>ไร่</small>
              </div>
              <div className={styles.awdStat}>
                <span>มีเทนที่ลดได้</span>
                <strong>{formatInt(scopedSummary.awdMethaneReductionTCO2e)}</strong>
                <small>tCO2e/ปี</small>
              </div>
              <div className={styles.awdStat}>
                <span>น้ำที่ประหยัด</span>
                <strong>{formatMillion(scopedSummary.awdWaterSavingM3)}</strong>
                <small>ล้าน ลบ.ม./ปี</small>
              </div>
            </div>
          </div>

          <p className={styles.methodChip}>
            สมมติฐาน: ค่าฐานมีเทน 0.36 tCO2e/ไร่/ฤดู · ลด 45% · GWP100 CH4 = 28 · น้ำประหยัด 320 ลบ.ม./ไร่/ฤดู
          </p>
        </div>

        <div className={styles.rankingPanel}>
          <header className={styles.rankingHead}>
            <h3>จังหวัดที่มีศักยภาพลดมีเทนสูงสุด</h3>
            <span>8 อันดับแรก · คลิกเพื่อกรอง</span>
          </header>
          <ul className={styles.rankingList}>
            {activePayload.awdTopProvinces.map((province, index) => {
              const isSelected = province.provinceCode === provinceCode;
              return (
                <li key={province.provinceCode}>
                  <button
                    type="button"
                    className={`${styles.rankingRow} ${isSelected ? styles.rankingRowActive : ''}`}
                    onClick={() => handleProvinceSelect(isSelected ? 'all' : province.provinceCode)}
                    aria-pressed={isSelected}
                    aria-label={`กรองเฉพาะจังหวัด${province.provinceName}`}
                  >
                    <span className={styles.rankIndex}>{index + 1}</span>
                    <span className={styles.rankName}>{province.provinceName}</span>
                    <span className={styles.rankTrack} aria-hidden="true">
                      <span
                        className={styles.rankFill}
                        style={{ width: `${(province.awdMethaneReductionTCO2e / maxAwdReduction) * 100}%` }}
                      />
                    </span>
                    <span className={styles.rankValue}>{formatInt(province.awdMethaneReductionTCO2e)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={styles.rankingNote}>หน่วย: tCO2e/ปี · เรียงตามปริมาณมีเทนที่ลดได้ในแบบจำลอง</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="carbon-ver-heading">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>T-VER REGISTRY</span>
            <h2 id="carbon-ver-heading">โครงการลดก๊าซเรือนกระจกภาคสมัครใจ (T-VER)</h2>
            <p>
              สถิติโครงการภาคเกษตรและป่าไม้ จำแนกตามสถานะ ขึ้นทะเบียน ทวนสอบ และออกเครดิตแล้ว
              พร้อมปริมาณการลดก๊าซเรือนกระจกที่คาดหวังและเครดิตสะสม
            </p>
          </div>
          <span className={styles.sectionMeta}>{formatInt(verSummary.projectCount)} โครงการในขอบเขต</span>
        </header>

        <div className={styles.verStats} aria-label="สรุปสถานะโครงการ T-VER">
          <div className={styles.verStat}>
            <span className={styles.verStatLabel}>ขึ้นทะเบียน</span>
            <strong>{formatInt(verSummary.registeredCount)}</strong>
          </div>
          <div className={styles.verStat}>
            <span className={styles.verStatLabel}>ทวนสอบแล้ว</span>
            <strong>{formatInt(verSummary.verifiedCount)}</strong>
          </div>
          <div className={styles.verStat}>
            <span className={styles.verStatLabel}>ออกเครดิตแล้ว</span>
            <strong>{formatInt(verSummary.certifiedCount)}</strong>
          </div>
          <div className={styles.verStat}>
            <span className={styles.verStatLabel}>ลดก๊าซเรือนกระจก/ปี</span>
            <strong>{formatInt(verSummary.annualReductionTCO2e)}</strong>
            <small>tCO2e</small>
          </div>
          <div className={styles.verStat}>
            <span className={styles.verStatLabel}>เครดิตสะสมที่ออกแล้ว</span>
            <strong>{formatInt(verSummary.issuedCreditsTCO2e)}</strong>
            <small>tCO2e</small>
          </div>
        </div>

        {visibleProjects.length > 0 ? (
          <>
            <div className={styles.projectGrid}>
              {visibleProjects.map((project) => (
                <article key={project.id} className={styles.projectCard}>
                  <div className={styles.projectTop}>
                    <span className={styles.projectType}>{project.projectTypeLabel}</span>
                    <span className={`${styles.statusBadge} ${STATUS_CLASSES[project.status]}`}>
                      {project.statusLabel}
                    </span>
                  </div>
                  <h3>{project.name}</h3>
                  <div className={styles.projectMeta}>
                    <span>
                      <Icon name="pin" size={14} />
                      {project.provinceName} · {project.regionLabel}
                    </span>
                    <span>{project.sectorLabel} · {project.developerTypeLabel}</span>
                  </div>
                  <dl className={styles.projectMetrics}>
                    <div>
                      <dt>ลดก๊าซเรือนกระจก</dt>
                      <dd>
                        {formatInt(project.annualReductionTCO2e)} <small>tCO2e/ปี</small>
                      </dd>
                    </div>
                    <div>
                      <dt>เครดิตที่ออกแล้ว</dt>
                      <dd>
                        {project.issuedCreditsTCO2e > 0 ? formatInt(project.issuedCreditsTCO2e) : '—'}{' '}
                        <small>tCO2e</small>
                      </dd>
                    </div>
                  </dl>
                  <div className={styles.projectFoot}>
                    <span>ขึ้นทะเบียนปี {project.registeredYear}</span>
                    <span>{project.id}</span>
                  </div>
                </article>
              ))}
            </div>
            {activePayload.projects.length > 0 ? (
              <Pager
                page={currentProjectPage}
                pageCount={projectPageCount}
                total={activePayload.projects.length}
                from={(currentProjectPage - 1) * PROJECT_PAGE_SIZE + 1}
                to={Math.min(activePayload.projects.length, currentProjectPage * PROJECT_PAGE_SIZE)}
                noun="โครงการ"
                onPrevious={() => setProjectPage((page) => Math.max(1, page - 1))}
                onNext={() => setProjectPage((page) => Math.min(projectPageCount, page + 1))}
              />
            ) : null}
          </>
        ) : (
          <div className={styles.emptyState}>
            <Icon name="info" size={28} />
            <h3>ไม่พบโครงการตามตัวกรองที่เลือก</h3>
            <p>ลองเปลี่ยนประเภทโครงการหรือจังหวัด หรือกดล้างตัวกรองเพื่อดูภาพรวมทั้งประเทศ</p>
            <button type="button" className={styles.resetButton} onClick={handleReset}>
              ล้างตัวกรอง
            </button>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="carbon-province-heading">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>PROVINCIAL BREAKDOWN</span>
            <h2 id="carbon-province-heading">ศักยภาพคาร์บอนรายจังหวัด</h2>
            <p>
              เปรียบเทียบพื้นที่เกษตร สต็อกคาร์บอน ศักยภาพกักเก็บรายปี เครดิตที่คาดหวัง
              และอัตราการนำ AWD ไปใช้ในแต่ละจังหวัด เรียงจากศักยภาพสูงสุด
            </p>
          </div>
          <span className={styles.sectionMeta}>{formatInt(provinces.length)} จังหวัด</span>
        </header>

        <p className={styles.tableScrollHint}>
          <Icon name="arrow" size={14} />
          เลื่อนตารางแนวนอนเพื่อดูคอลัมน์เพิ่มเติม
        </p>

        <div
          className={styles.tableWrap}
          role="region"
          aria-label="ตารางศักยภาพคาร์บอนรายจังหวัด เลื่อนแนวนอนเพื่อดูทุกคอลัมน์"
          tabIndex={0}
        >
          <table className={styles.provinceTable}>
            <caption>
              ตารางศักยภาพคาร์บอนรายจังหวัด (ข้อมูลตัวอย่าง) — เลือกจังหวัดจากตัวกรองด้านบนเพื่อเจาะรายพื้นที่
            </caption>
            <thead>
              <tr>
                <th scope="col">อันดับ</th>
                <th scope="col">จังหวัด</th>
                <th scope="col">ภาค</th>
                <th scope="col" className={styles.numericCell}>พื้นที่เกษตร (ไร่)</th>
                <th scope="col" className={styles.numericCell}>สต็อกคาร์บอน (tCO2e)</th>
                <th scope="col" className={styles.numericCell}>ศักยภาพ/ปี (tCO2e)</th>
                <th scope="col" className={styles.numericCell}>เครดิตคาดหวัง/ปี (tCO2e)</th>
                <th scope="col" className={styles.numericCell}>AWD adoption</th>
              </tr>
            </thead>
            <tbody>
              {pagedProvinces.map((province, index) => {
                const isSelected = province.provinceCode === provinceCode;
                return (
                  <tr key={province.provinceCode} className={isSelected ? styles.rowSelected : undefined}>
                    <td className={styles.rankCell}>{(currentProvincePage - 1) * PROVINCE_PAGE_SIZE + index + 1}</td>
                    <th scope="row" className={styles.provinceNameCell}>
                      <button
                        type="button"
                        className={styles.provinceLink}
                        onClick={() => handleProvinceSelect(isSelected ? 'all' : province.provinceCode)}
                        aria-pressed={isSelected}
                      >
                        {province.provinceName}
                      </button>
                      <span className={`${styles.gradeChip} ${styles[`grade_${province.potentialGrade}`]}`}>
                        {province.potentialGradeLabel}
                      </span>
                    </th>
                    <td>{province.regionLabel}</td>
                    <td className={styles.numericCell}>{formatInt(province.cultivatedRai)}</td>
                    <td className={styles.numericCell}>{formatInt(province.carbonStockTCO2e)}</td>
                    <td className={styles.numericCell}>{formatInt(province.sequestrationTCO2ePerYear)}</td>
                    <td className={styles.numericCell}>{formatInt(province.creditPotentialTCO2ePerYear)}</td>
                    <td className={styles.numericCell}>{formatDecimal(province.awdAdoptionRate)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager
          page={currentProvincePage}
          pageCount={provincePageCount}
          total={provinces.length}
          from={(currentProvincePage - 1) * PROVINCE_PAGE_SIZE + 1}
          to={Math.min(provinces.length, currentProvincePage * PROVINCE_PAGE_SIZE)}
          noun="จังหวัด"
          onPrevious={() => setProvincePage((page) => Math.max(1, page - 1))}
          onNext={() => setProvincePage((page) => Math.min(provincePageCount, page + 1))}
        />
      </section>

      <section className={styles.footnoteGrid} aria-labelledby="carbon-sources-heading">
        <div className={styles.footnoteCard}>
          <h2 id="carbon-sources-heading">แหล่งอ้างอิงและสถานะสิทธิ์</h2>
          <p className={styles.footnoteIntro}>
            รายชื่อหน่วยงานต้นทางสำหรับการเชื่อมข้อมูลจริงในอนาคต สถานะสิทธิ์ตัวเลขยังเป็น pending ทั้งหมด
          </p>
          <ul className={styles.sourceList}>
            {activePayload.sources.map((source) => (
              <li key={source.id} className={styles.sourceItem}>
                <div className={styles.sourceHead}>
                  <strong>{source.name}</strong>
                  <span className={styles.licenseBadge}>{source.licenseStatus}</span>
                </div>
                <span className={styles.sourceAgency}>{source.agencyLabel}</span>
                <p>{source.role}</p>
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  {source.sourceUrl}
                  <Icon name="external" size={13} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footnoteCard}>
          <h2>วิธีคำนวณและข้อจำกัด</h2>
          <ol className={styles.methodList}>
            {activePayload.methodNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ol>
          <div className={styles.apiHint}>
            <span>API สำหรับนักพัฒนา</span>
            <code>GET /api/v1/carbon?provinceCode=73&amp;projectType=awd</code>
          </div>
          <p className={styles.sampleFootnote}>
            หน้าเพจนี้ไม่เขียนข้อมูล numeric ลงฐานข้อมูลกลาง และไม่ถือเป็นหลักฐานสิทธิ์เผยแพร่
            ดูนโยบายได้ที่คู่มือระบบและทะเบียนสิทธิ์ของโครงการ
          </p>
        </div>
      </section>
    </div>
  );
}
