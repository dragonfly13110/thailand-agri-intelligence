'use client';

import React, { useMemo, useState } from 'react';
import {
  buildCropEvidence,
  CONFIDENCE_LEVEL_LABELS,
  CROP_EVIDENCE_CROPS,
  RECONCILIATION_STATUS_LABELS,
  type ConfidenceComponents,
  type ConfidenceLevel,
  type CropEvidenceCrop,
  type CropEvidenceCropConfig,
  type CropEvidenceFilter,
  type CropEvidencePayload,
  type CropEvidenceRecommendation,
  type CropEvidenceSource,
  type DistrictCropEvidence,
  type ReconciliationStatus,
  type RecommendationPriority,
} from '@/lib/hub/crop-evidence-data';
import { Icon } from './icon';
import styles from './crop-evidence-dashboard.module.css';

const integerFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const signedIntegerFormatter = new Intl.NumberFormat('th-TH', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

const STATUS_ORDER: ReconciliationStatus[] = ['verified', 'pending_verification', 'discrepancy'];
const PRIORITY_ORDER: RecommendationPriority[] = ['high', 'medium', 'low'];

const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  high: 'เร่งด่วน',
  medium: 'ปานกลาง',
  low: 'ติดตามต่อเนื่อง',
};

const SOURCE_ROLE_LABELS: Record<CropEvidenceSource['role'], string> = {
  reported: 'พื้นที่รายงานจังหวัด',
  registered: 'ทะเบียนเกษตรกร ทบก.01',
  field_verified: 'ตรวจพิสูจน์ภาคสนาม',
  reference: 'ข้อมูลอ้างอิง',
};

const CONFIDENCE_COMPONENTS: Array<{ key: keyof ConfidenceComponents; label: string; max: number }> = [
  { key: 'sourceAgreement', label: 'ความสอดคล้องระหว่างแหล่ง', max: 40 },
  { key: 'fieldCoverage', label: 'ความครอบคลุมการตรวจพิสูจน์', max: 30 },
  { key: 'fieldConsistency', label: 'ความสอดคล้องผลตรวจกับทะเบียน', max: 20 },
  { key: 'completeness', label: 'ความครบถ้วนของข้อมูล', max: 10 },
];

const GATE_LABELS: Record<string, string> = {
  annual_production_rollup: 'รวมผลผลิตรายปี (annual rollup)',
  historical_boundaries_verified: 'ยืนยันขอบเขตปกครองย้อนหลัง',
  numerical_production_price_join: 'เชื่อมตัวเลขผลผลิตกับราคา',
  public_release: 'อนุมัติเผยแพร่สาธารณะ',
};

type SortKey = 'default' | 'discrepancy' | 'confidence';
type SortDirection = 'asc' | 'desc';
type StatusFilter = ReconciliationStatus | 'all';

const STATUS_CLASSES: Record<ReconciliationStatus, string> = {
  verified: styles.statusVerified,
  pending_verification: styles.statusPending,
  discrepancy: styles.statusDiscrepancy,
};

const STATUS_FILL_CLASSES: Record<ReconciliationStatus, string> = {
  verified: styles.fillVerified,
  pending_verification: styles.fillPending,
  discrepancy: styles.fillDiscrepancy,
};

const CONFIDENCE_CLASSES: Record<ConfidenceLevel, string> = {
  high: styles.confidenceHigh,
  medium: styles.confidenceMedium,
  low: styles.confidenceLow,
};

const PRIORITY_CLASSES: Record<RecommendationPriority, string> = {
  high: styles.priorityHigh,
  medium: styles.priorityMedium,
  low: styles.priorityLow,
};

function formatInt(value: number): string {
  return integerFormatter.format(Math.round(value));
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

function Missing() {
  return (
    <span className={styles.missing} title="ไม่มีข้อมูล">
      <span aria-hidden="true">—</span>
      <span className="sr-only">ไม่มีข้อมูล</span>
    </span>
  );
}

function NumberValue({
  value,
  format = 'int',
  suffix,
}: {
  value: number | null;
  format?: 'int' | 'decimal' | 'signed';
  suffix?: string;
}) {
  if (value === null || !Number.isFinite(value)) return <Missing />;
  const text =
    format === 'decimal'
      ? formatDecimal(value)
      : format === 'signed'
        ? signedIntegerFormatter.format(Math.round(value))
        : formatInt(value);
  return (
    <>
      {text}
      {suffix ? <span className={styles.unit}>{suffix}</span> : null}
    </>
  );
}

function compareNullable(a: number | null, b: number | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

function ConfidenceBar({ components, score }: { components: ConfidenceComponents; score: number }) {
  const tooltip = [
    `คะแนนรวม ${formatInt(score)}/100`,
    ...CONFIDENCE_COMPONENTS.map(
      (item) => `${item.label}: ${formatDecimal(components[item.key])}/${item.max}`
    ),
  ].join('\n');

  return (
    <span className={styles.componentBar} title={tooltip} role="img" aria-label={tooltip.replace(/\n/g, ', ')}>
      {CONFIDENCE_COMPONENTS.map((item, index) => {
        const ratio = Math.max(0, Math.min(1, components[item.key] / item.max));
        return (
          <span key={item.key} className={styles.componentSegment} style={{ flexGrow: item.max }}>
            <span
              className={`${styles.componentFill} ${styles[`componentFill${index}`]}`}
              style={{ width: `${ratio * 100}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}

export interface CropEvidenceDashboardProps {
  payload: CropEvidencePayload;
}

export function CropEvidenceDashboard({ payload }: CropEvidenceDashboardProps) {
  const [provinceCode, setProvinceCode] = useState<string>(payload.filters.provinceCode);
  const [crop, setCrop] = useState<CropEvidenceFilter>(payload.filters.crop);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const provincePayload = useMemo(
    () =>
      provinceCode === payload.filters.provinceCode && payload.filters.crop === 'all'
        ? payload
        : buildCropEvidence({ provinceCode, crop: 'all' }),
    [payload, provinceCode]
  );

  const activePayload = useMemo(
    () => (crop === 'all' ? provincePayload : buildCropEvidence({ provinceCode, crop })),
    [crop, provinceCode, provincePayload]
  );

  const availableCrops = useMemo<CropEvidenceCropConfig[]>(() => {
    const present = new Set(provincePayload.districts.map((district) => district.crop));
    const ordered = provincePayload.crops.filter((config) => present.has(config.id));
    return ordered.length > 0 ? ordered : provincePayload.crops;
  }, [provincePayload]);

  const statusCounts = activePayload.statusCounts;
  const statusTotal = STATUS_ORDER.reduce((total, status) => total + (statusCounts[status] ?? 0), 0);

  const visibleDistricts = useMemo(() => {
    const filtered =
      statusFilter === 'all'
        ? activePayload.districts
        : activePayload.districts.filter((district) => district.status === statusFilter);
    if (sortKey === 'default') return filtered;
    return [...filtered].sort((a, b) =>
      sortKey === 'discrepancy'
        ? compareNullable(
            a.discrepancyRatePct === null ? null : Math.abs(a.discrepancyRatePct),
            b.discrepancyRatePct === null ? null : Math.abs(b.discrepancyRatePct),
            sortDirection
          )
        : compareNullable(a.confidenceScore, b.confidenceScore, sortDirection)
    );
  }, [activePayload.districts, sortDirection, sortKey, statusFilter]);

  const districtLookup = useMemo(() => {
    const lookup = new Map<string, DistrictCropEvidence>();
    for (const district of provincePayload.districts) lookup.set(district.id, district);
    for (const district of activePayload.districts) lookup.set(district.id, district);
    return lookup;
  }, [activePayload.districts, provincePayload.districts]);

  const groupedRecommendations = useMemo(
    () =>
      PRIORITY_ORDER.map((priority) => ({
        priority,
        items: activePayload.recommendations.filter((item) => item.priority === priority),
      })).filter((group) => group.items.length > 0),
    [activePayload.recommendations]
  );

  const thresholds = activePayload.thresholds;
  const hasActiveFilters =
    crop !== 'all' || statusFilter !== 'all' || sortKey !== 'default' || provinceCode !== payload.filters.provinceCode;

  const handleProvinceChange = (code: string) => {
    setProvinceCode(code);
    setExpanded({});
    if (crop !== 'all') {
      const next = buildCropEvidence({ provinceCode: code, crop: 'all' });
      if (!next.districts.some((district) => district.crop === crop)) setCrop('all');
    }
  };

  const handleCropChange = (value: CropEvidenceFilter) => {
    setCrop(value);
    setExpanded({});
  };

  const handleStatusToggle = (value: StatusFilter) => {
    setStatusFilter((current) => (current === value && value !== 'all' ? 'all' : value));
  };

  const handleSort = (key: Exclude<SortKey, 'default'>) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'discrepancy' ? 'desc' : 'asc');
  };

  const handleReset = () => {
    setProvinceCode(payload.filters.provinceCode);
    setCrop('all');
    setStatusFilter('all');
    setSortKey('default');
    setSortDirection('desc');
    setExpanded({});
  };

  const toggleRow = (id: string) => {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  };

  const ariaSortFor = (key: Exclude<SortKey, 'default'>): 'ascending' | 'descending' | 'none' =>
    sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

  const sortIndicator = (key: Exclude<SortKey, 'default'>) =>
    sortKey === key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕';

  const describeRecommendationDistricts = (recommendation: CropEvidenceRecommendation) =>
    recommendation.districtIds.map((id) => {
      const district = districtLookup.get(id);
      return district ? `${district.districtName} · ${district.cropLabel}` : id;
    });

  return (
    <div className={styles.container}>
      <section className={styles.sampleBanner} aria-label="ข้อความแจ้งเตือนข้อมูลตัวอย่างและสิทธิ์">
        <div className={styles.sampleBannerIcon} aria-hidden="true">
          <Icon name="lock" size={20} />
        </div>
        <div className={styles.sampleBannerBody}>
          <strong>
            ข้อมูลตัวอย่างเพื่อสาธิต ({activePayload.sample ? 'Sample' : 'Live'} · {activePayload.access})
          </strong>
          <p>
            ตัวเลขพื้นที่รายงาน ทะเบียน ทบก.01 และผลตรวจพิสูจน์ในหน้านี้สร้างจากแบบจำลองที่กำหนดผลซ้ำได้
            เพื่อทดสอบหน้าจอและสัญญาข้อมูลเท่านั้น ยังไม่ได้รับสิทธิ์เผยแพร่ตัวเลขจริงจากหน่วยงานต้นทาง
            และไม่ใช่สถิติทางการ · ข้อมูล ณ {activePayload.dataAsOf} · schema {activePayload.schemaVersion}
          </p>
          {activePayload.warnings.length > 0 ? (
            <ul className={styles.warningList}>
              {activePayload.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className={styles.filterCard} aria-label="ตัวกรองจังหวัด พืช และสถานะ">
        <div className={styles.filterControls}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="crop-evidence-province">
              จังหวัด
            </label>
            <select
              id="crop-evidence-province"
              className={styles.selectInput}
              value={provinceCode}
              onChange={(event) => handleProvinceChange(event.target.value)}
            >
              {payload.provinces.map((province) => (
                <option key={province.code} value={province.code}>
                  {province.code} - {province.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <span className={styles.formLabel} id="crop-evidence-crop-label">
              พืช
            </span>
            <div className={styles.segmented} role="group" aria-labelledby="crop-evidence-crop-label">
              <button
                type="button"
                className={`${styles.segment} ${crop === 'all' ? styles.segmentActive : ''}`}
                aria-pressed={crop === 'all'}
                onClick={() => handleCropChange('all')}
              >
                ทั้งหมด
              </button>
              {availableCrops.map((config) => (
                <button
                  key={config.id}
                  type="button"
                  className={`${styles.segment} ${crop === config.id ? styles.segmentActive : ''}`}
                  aria-pressed={crop === config.id}
                  onClick={() => handleCropChange(config.id)}
                >
                  <span className={styles.cropDot} style={{ background: config.color }} aria-hidden="true" />
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className={styles.resetButton} onClick={handleReset} disabled={!hasActiveFilters}>
            ล้างตัวกรอง
          </button>
        </div>

        <div className={styles.formGroup}>
          <span className={styles.formLabel} id="crop-evidence-status-label">
            สถานะการกระทบยอด
          </span>
          <div className={styles.chipRow} role="group" aria-labelledby="crop-evidence-status-label">
            <button
              type="button"
              className={`${styles.chip} ${statusFilter === 'all' ? styles.chipActive : ''}`}
              aria-pressed={statusFilter === 'all'}
              onClick={() => handleStatusToggle('all')}
            >
              ทุกสถานะ ({formatInt(statusTotal)})
            </button>
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                className={`${styles.chip} ${statusFilter === status ? styles.chipActive : ''}`}
                aria-pressed={statusFilter === status}
                onClick={() => handleStatusToggle(status)}
              >
                <span className={`${styles.statusDot} ${STATUS_FILL_CLASSES[status]}`} aria-hidden="true" />
                {RECONCILIATION_STATUS_LABELS[status]} ({formatInt(statusCounts[status] ?? 0)})
              </button>
            ))}
          </div>
        </div>

        <p className={styles.scopeLine} aria-live="polite">
          ขอบเขต: <strong>{activePayload.filters.provinceName}</strong> ·{' '}
          {crop === 'all' ? 'ทุกพืช' : CROP_EVIDENCE_CROPS[crop as CropEvidenceCrop]?.label ?? crop} · แสดง{' '}
          {formatInt(visibleDistricts.length)} จาก {formatInt(activePayload.districts.length)} รายการอำเภอ-พืช
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="crop-evidence-status-heading">
        <header className={styles.panelHead}>
          <div>
            <span className={styles.eyebrow}>RECONCILIATION STATUS</span>
            <h2 id="crop-evidence-status-heading">สถานะความถูกต้องของหลักฐาน</h2>
          </div>
          <span className={styles.sectionMeta}>{formatInt(statusTotal)} รายการอำเภอ-พืช</span>
        </header>

        {statusTotal > 0 ? (
          <div className={styles.stackTrack} role="img" aria-label={STATUS_ORDER.map((status) => `${RECONCILIATION_STATUS_LABELS[status]} ${statusCounts[status] ?? 0} รายการ`).join(', ')}>
            {STATUS_ORDER.map((status) => {
              const count = statusCounts[status] ?? 0;
              if (count === 0) return null;
              return (
                <span
                  key={status}
                  className={`${styles.stackSegment} ${STATUS_FILL_CLASSES[status]}`}
                  style={{ width: `${(count / statusTotal) * 100}%` }}
                  title={`${RECONCILIATION_STATUS_LABELS[status]} ${formatInt(count)} รายการ`}
                />
              );
            })}
          </div>
        ) : (
          <p className={styles.mutedText}>ยังไม่มีรายการในขอบเขตที่เลือก</p>
        )}

        <div className={styles.legendRow}>
          {STATUS_ORDER.map((status) => {
            const count = statusCounts[status] ?? 0;
            const pct = statusTotal > 0 ? (count / statusTotal) * 100 : 0;
            return (
              <button
                key={status}
                type="button"
                className={`${styles.legendChip} ${statusFilter === status ? styles.legendChipActive : ''}`}
                aria-pressed={statusFilter === status}
                onClick={() => handleStatusToggle(status)}
              >
                <span className={`${styles.legendSwatch} ${STATUS_FILL_CLASSES[status]}`} aria-hidden="true" />
                <span className={styles.legendLabel}>{RECONCILIATION_STATUS_LABELS[status]}</span>
                <strong>{formatInt(count)}</strong>
                <span className={styles.legendPct}>{formatDecimal(pct)}%</span>
              </button>
            );
          })}
        </div>
        <p className={styles.mutedText}>
          เกณฑ์: ผ่านการรับรองเมื่อคลาดเคลื่อนไม่เกิน {formatDecimal(thresholds.verifiedMaxPct)}% และตรวจพิสูจน์ครอบคลุมอย่างน้อย{' '}
          {formatDecimal(thresholds.minFieldCoveragePct)}% · พบความคลาดเคลื่อนเมื่อเกิน{' '}
          {formatDecimal(thresholds.discrepancyMinPct)}% · คลิกสถานะเพื่อกรองตาราง
        </p>
      </section>

      <section className={styles.section} aria-labelledby="crop-evidence-crops-heading">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>BY CROP</span>
            <h2 id="crop-evidence-crops-heading">สรุปหลักฐานรายพืช</h2>
            <p>
              เปรียบเทียบพื้นที่ 3 แหล่งแยกตามพืช ไม่รวมยอดข้ามพืช เพราะนิยามพื้นที่และรอบการเพาะปลูกต่างกัน
            </p>
          </div>
        </header>

        <div className={styles.cropGrid}>
          {activePayload.cropSummaries.map((summary) => {
            const values = [summary.reportedAreaRai, summary.registeredAreaRai, summary.verifiedAreaRai].filter(
              (value): value is number => value !== null && Number.isFinite(value)
            );
            const maxValue = values.length > 0 ? Math.max(...values, 1) : 1;
            const rows: Array<{ label: string; value: number | null; className: string }> = [
              { label: 'รายงานจังหวัด', value: summary.reportedAreaRai, className: styles.barReported },
              { label: 'ทะเบียน ทบก.01', value: summary.registeredAreaRai, className: styles.barRegistered },
              { label: 'ตรวจพิสูจน์', value: summary.verifiedAreaRai, className: styles.barVerified },
            ];
            return (
              <article key={summary.crop} className={styles.cropCard} style={{ borderTopColor: summary.color }}>
                <div className={styles.cropHead}>
                  <span className={styles.cropIcon} style={{ background: summary.color }} aria-hidden="true">
                    <Icon name="leaf" size={15} />
                  </span>
                  <div>
                    <h3>{summary.cropLabel}</h3>
                    <span>
                      เทียบได้ {formatInt(summary.comparableDistricts)} จาก {formatInt(summary.districtCount)} อำเภอ
                    </span>
                  </div>
                </div>

                <div className={styles.areaBars}>
                  {rows.map((row) => (
                    <div key={row.label} className={styles.areaRow}>
                      <span className={styles.areaLabel}>{row.label}</span>
                      <span className={styles.areaTrack} aria-hidden="true">
                        {row.value !== null ? (
                          <span
                            className={`${styles.areaFill} ${row.className}`}
                            style={{ width: `${(row.value / maxValue) * 100}%` }}
                          />
                        ) : null}
                      </span>
                      <span className={styles.areaValue}>
                        <NumberValue value={row.value} suffix="ไร่" />
                      </span>
                    </div>
                  ))}
                </div>

                <dl className={styles.cropStats}>
                  <div>
                    <dt>อัตราคลาดเคลื่อน</dt>
                    <dd>
                      <NumberValue value={summary.discrepancyRatePct} format="decimal" suffix="%" />
                    </dd>
                  </div>
                  <div>
                    <dt>ความเชื่อมั่นเฉลี่ย</dt>
                    <dd>
                      <NumberValue value={summary.averageConfidenceScore} format="decimal" suffix="/100" />
                      {summary.confidenceLevel ? (
                        <span className={`${styles.levelBadge} ${CONFIDENCE_CLASSES[summary.confidenceLevel]}`}>
                          {CONFIDENCE_LEVEL_LABELS[summary.confidenceLevel]}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>

                <ul className={styles.cropStatusList} aria-label={`สถานะของ${summary.cropLabel}`}>
                  {STATUS_ORDER.map((status) => (
                    <li key={status}>
                      <span className={`${styles.statusDot} ${STATUS_FILL_CLASSES[status]}`} aria-hidden="true" />
                      {RECONCILIATION_STATUS_LABELS[status]} {formatInt(summary.statusCounts[status] ?? 0)}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="crop-evidence-table-heading">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>DISTRICT COMPARISON</span>
            <h2 id="crop-evidence-table-heading">เปรียบเทียบหลักฐานรายอำเภอ</h2>
            <p>
              ส่วนต่างคำนวณจากพื้นที่ทะเบียนเทียบพื้นที่รายงานจังหวัด ค่าที่ไม่มีข้อมูลแสดงเป็น “—” ไม่ถูกแทนด้วยศูนย์
              กดปุ่มหน้าชื่ออำเภอเพื่อดูประเด็นและข้อเสนอแนะ
            </p>
          </div>
        </header>

        <p className={styles.tableScrollHint}>
          <Icon name="arrow" size={14} />
          เลื่อนตารางแนวนอนเพื่อดูคอลัมน์เพิ่มเติม
        </p>

        {visibleDistricts.length > 0 ? (
          <div
            className={styles.tableWrap}
            role="group"
            aria-label="ตารางเปรียบเทียบหลักฐานรายอำเภอ เลื่อนแนวนอนเพื่อดูทุกคอลัมน์"
            tabIndex={0}
          >
            <table className={styles.table}>
              <caption>
                ตารางเปรียบเทียบพื้นที่รายงานจังหวัด ทะเบียน ทบก.01 และผลตรวจพิสูจน์ รายอำเภอและรายพืช จังหวัด
                {activePayload.filters.provinceName} (ข้อมูลตัวอย่าง หน่วย: ไร่)
              </caption>
              <thead>
                <tr>
                  <th scope="col">อำเภอ</th>
                  <th scope="col">พืช</th>
                  <th scope="col" className={styles.numericCell}>
                    พื้นที่รายงานจังหวัด
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    ทะเบียน ทบก.01
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    ตรวจพิสูจน์
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    ส่วนต่าง (ไร่)
                  </th>
                  <th scope="col" className={styles.numericCell} aria-sort={ariaSortFor('discrepancy')}>
                    <button type="button" className={styles.sortButton} onClick={() => handleSort('discrepancy')}>
                      อัตราคลาดเคลื่อน
                      <span aria-hidden="true">{sortIndicator('discrepancy')}</span>
                    </button>
                  </th>
                  <th scope="col">สถานะ</th>
                  <th scope="col" aria-sort={ariaSortFor('confidence')}>
                    <button type="button" className={styles.sortButton} onClick={() => handleSort('confidence')}>
                      ความเชื่อมั่น
                      <span aria-hidden="true">{sortIndicator('confidence')}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleDistricts.map((district) => {
                  const isOpen = Boolean(expanded[district.id]);
                  const detailId = `crop-evidence-detail-${district.id}`;
                  const cropColor = CROP_EVIDENCE_CROPS[district.crop]?.color;
                  return (
                    <React.Fragment key={district.id}>
                      <tr className={isOpen ? styles.rowOpen : undefined}>
                        <th scope="row" className={styles.districtCell}>
                          <button
                            type="button"
                            className={styles.expandButton}
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            onClick={() => toggleRow(district.id)}
                          >
                            <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} aria-hidden="true">
                              <Icon name="chevronDown" size={14} />
                            </span>
                            {district.districtName}
                          </button>
                          <span className={styles.seasonText}>{district.season}</span>
                        </th>
                        <td>
                          <span className={styles.cropTag}>
                            <span className={styles.cropDot} style={{ background: cropColor }} aria-hidden="true" />
                            {district.cropLabel}
                          </span>
                        </td>
                        <td className={styles.numericCell}>
                          <NumberValue value={district.reportedAreaRai} />
                        </td>
                        <td className={styles.numericCell}>
                          <NumberValue value={district.registeredAreaRai} />
                          <span className={styles.subValue}>
                            <NumberValue value={district.registeredPlots} suffix="แปลง" />
                          </span>
                        </td>
                        <td className={styles.numericCell}>
                          <NumberValue value={district.verifiedAreaRai} />
                          <span className={styles.subValue}>
                            ครอบคลุม{' '}
                            <NumberValue value={district.fieldVerificationCoveragePct} format="decimal" suffix="%" />
                          </span>
                        </td>
                        <td className={styles.numericCell}>
                          <NumberValue value={district.differenceRai} format="signed" />
                        </td>
                        <td className={styles.numericCell}>
                          <NumberValue value={district.discrepancyRatePct} format="decimal" suffix="%" />
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${STATUS_CLASSES[district.status]}`}>
                            {RECONCILIATION_STATUS_LABELS[district.status]}
                          </span>
                        </td>
                        <td>
                          <div className={styles.confidenceCell}>
                            <span className={styles.confidenceScore}>{formatInt(district.confidenceScore)}</span>
                            <span className={`${styles.levelBadge} ${CONFIDENCE_CLASSES[district.confidenceLevel]}`}>
                              {CONFIDENCE_LEVEL_LABELS[district.confidenceLevel]}
                            </span>
                          </div>
                          <ConfidenceBar components={district.confidenceComponents} score={district.confidenceScore} />
                        </td>
                      </tr>
                      <tr id={detailId} className={styles.detailRow} hidden={!isOpen}>
                        <td colSpan={9}>
                          <div className={styles.detailGrid}>
                            <div>
                              <h3>ประเด็นที่พบ</h3>
                              {district.issues.length > 0 ? (
                                <ul>
                                  {district.issues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p>ไม่พบประเด็นตามเกณฑ์</p>
                              )}
                            </div>
                            <div>
                              <h3>ข้อเสนอแนะรายอำเภอ</h3>
                              {district.recommendations.length > 0 ? (
                                <ul>
                                  {district.recommendations.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p>ไม่มีข้อเสนอแนะเพิ่มเติม</p>
                              )}
                            </div>
                            <dl className={styles.detailFacts}>
                              <div>
                                <dt>ครัวเรือนในทะเบียน</dt>
                                <dd>
                                  <NumberValue value={district.registeredHouseholds} suffix="ครัวเรือน" />
                                </dd>
                              </div>
                              <div>
                                <dt>แปลงที่ตรวจพิสูจน์</dt>
                                <dd>
                                  <NumberValue value={district.fieldVerifiedPlots} suffix="แปลง" />
                                </dd>
                              </div>
                              <div>
                                <dt>ตรวจพิสูจน์เทียบทะเบียน</dt>
                                <dd>
                                  <NumberValue value={district.fieldVsRegisteredPct} format="decimal" suffix="%" />
                                </dd>
                              </div>
                              <div>
                                <dt>รหัสอำเภอ</dt>
                                <dd>{district.districtCode ?? <Missing />}</dd>
                              </div>
                            </dl>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Icon name="info" size={28} />
            <h3>ไม่พบรายการตามตัวกรองที่เลือก</h3>
            <p>ลองเปลี่ยนพืชหรือสถานะ หรือกดล้างตัวกรอง</p>
            <button type="button" className={styles.resetButton} onClick={handleReset}>
              ล้างตัวกรอง
            </button>
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="crop-evidence-reco-heading">
        <header className={styles.panelHead}>
          <div>
            <span className={styles.eyebrow}>RECOMMENDATIONS</span>
            <h2 id="crop-evidence-reco-heading">ข้อเสนอแนะการตรวจสอบ</h2>
          </div>
          <span className={styles.sectionMeta}>{formatInt(activePayload.recommendations.length)} ข้อ</span>
        </header>

        {groupedRecommendations.length > 0 ? (
          <div className={styles.recoGroups}>
            {groupedRecommendations.map((group) => (
              <div key={group.priority} className={styles.recoGroup}>
                <h3 className={styles.recoGroupTitle}>
                  <span className={`${styles.priorityBadge} ${PRIORITY_CLASSES[group.priority]}`}>
                    ลำดับ{PRIORITY_LABELS[group.priority]}
                  </span>
                  <span>{formatInt(group.items.length)} ข้อ</span>
                </h3>
                <ul className={styles.recoList}>
                  {group.items.map((item) => {
                    const names = describeRecommendationDistricts(item);
                    return (
                      <li key={item.id} className={styles.recoItem}>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        {names.length > 0 ? (
                          <div className={styles.recoDistricts}>
                            <Icon name="pin" size={13} />
                            <span>{names.join(', ')}</span>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.mutedText}>ไม่มีข้อเสนอแนะในขอบเขตที่เลือก</p>
        )}
      </section>

      <section className={styles.footnoteGrid} aria-label="วิธีการ แหล่งข้อมูล และสถานะสายข้อมูล">
        <div className={styles.footnoteCard}>
          <h2>วิธีคำนวณและเกณฑ์</h2>
          <ol className={styles.methodList}>
            {activePayload.methodNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ol>
          <dl className={styles.thresholdList}>
            <div>
              <dt>ผ่านการรับรอง: คลาดเคลื่อนไม่เกิน</dt>
              <dd>{formatDecimal(thresholds.verifiedMaxPct)}%</dd>
            </div>
            <div>
              <dt>พบความคลาดเคลื่อน: เกิน</dt>
              <dd>{formatDecimal(thresholds.discrepancyMinPct)}%</dd>
            </div>
            <div>
              <dt>ความครอบคลุมตรวจพิสูจน์ขั้นต่ำ</dt>
              <dd>{formatDecimal(thresholds.minFieldCoveragePct)}%</dd>
            </div>
            <div>
              <dt>ตรวจพิสูจน์ต่างจากทะเบียนได้ไม่เกิน</dt>
              <dd>{formatDecimal(thresholds.fieldVsRegisteredMaxPct)}%</dd>
            </div>
          </dl>
          {activePayload.warnings.length > 0 ? (
            <>
              <h3 className={styles.subHeading}>ข้อควรระวัง</h3>
              <ul className={styles.warningListPlain}>
                {activePayload.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className={styles.footnoteCard}>
          <h2>แหล่งข้อมูลและสายข้อมูล</h2>
          <ul className={styles.sourceList}>
            {activePayload.sources.map((source) => (
              <li key={source.id} className={styles.sourceItem}>
                <div className={styles.sourceHead}>
                  <strong>{source.name}</strong>
                  <span className={styles.roleBadge}>{SOURCE_ROLE_LABELS[source.role] ?? source.role}</span>
                </div>
                <span className={styles.sourceAgency}>{source.agency}</span>
                <p>{source.note}</p>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.url}
                    <Icon name="external" size={13} />
                  </a>
                ) : (
                  <span className={styles.mutedText}>ยังไม่มี URL สาธารณะที่ยืนยันแล้ว</span>
                )}
              </li>
            ))}
          </ul>

          <div className={styles.lineageBox}>
            <h3 className={styles.subHeading}>Python lineage</h3>
            <p className={styles.lineageMeta}>
              <code>{activePayload.pythonLineage.module}</code> · schema {activePayload.pythonLineage.schemaVersion} ·{' '}
              {activePayload.pythonLineage.scope}
            </p>
            <ul className={styles.gateList}>
              {Object.entries(activePayload.pythonLineage.gates).map(([gate, passed]) => (
                <li key={gate}>
                  <span>{GATE_LABELS[gate] ?? gate}</span>
                  <span className={passed ? styles.gatePassed : styles.gatePending}>
                    {passed ? 'ผ่าน' : 'ยังไม่ผ่าน'}
                  </span>
                </li>
              ))}
            </ul>
            {activePayload.pythonLineage.blockers.length > 0 ? (
              <>
                <h4 className={styles.blockerHeading}>สิ่งที่ยังติดขัด</h4>
                <ul className={styles.warningListPlain}>
                  {activePayload.pythonLineage.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
