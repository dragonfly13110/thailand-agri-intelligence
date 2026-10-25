'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/icon';
import {
  DISASTER_CONFIG,
  FINANCE_REGIONS,
  buildDisasterSplit,
  buildRegionSummaries,
  filterFinanceRecords,
  getPayoutBand,
  summarizeFinanceRecords,
  type DisasterSplit,
  type FinanceDashboardPayload,
  type PayoutBand,
  type ProgramFilter,
  type RiskGrade,
} from '@/lib/hub/finance-data';
import styles from './finance-dashboard.module.css';

const numberFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function formatInteger(value: number): string {
  return numberFormat.format(Math.round(value));
}

function formatPct(value: number, digits = 1): string {
  return `${digits === 0 ? formatInteger(value) : decimalFormat.format(value)}%`;
}

function formatBahtCompact(value: number): string {
  if (value <= 0) return '0 บาท';
  if (value >= 1_000_000_000) return `${decimalFormat.format(value / 1_000_000_000)} พันล้านบาท`;
  if (value >= 1_000_000) return `${formatInteger(value / 1_000_000)} ล้านบาท`;
  if (value >= 1_000) return `${formatInteger(value / 1_000)} พันบาท`;
  return `${formatInteger(value)} บาท`;
}

function formatMillionBaht(value: number): string {
  return `${decimalFormat.format(value)} ล้านบาท`;
}

function formatRai(value: number): string {
  if (value <= 0) return '—';
  if (value >= 1_000_000) return `${decimalFormat.format(value / 1_000_000)} ล้านไร่`;
  return `${formatInteger(value)} ไร่`;
}

function formatThaiDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day || !months[month - 1]) return iso;
  return `${day} ${months[month - 1]} ${year + 543}`;
}

function gradeClass(grade: RiskGrade | null): string {
  if (grade === 'low') return styles.gradeLow;
  if (grade === 'moderate') return styles.gradeModerate;
  if (grade === 'elevated') return styles.gradeElevated;
  if (grade === 'high') return styles.gradeHigh;
  return styles.gradeNeutral;
}

function bandClass(band: PayoutBand): string {
  if (band === 'below_normal') return styles.bandBelow;
  if (band === 'normal') return styles.bandNormal;
  if (band === 'elevated') return styles.bandElevated;
  return styles.bandCritical;
}

function barClass(band: PayoutBand): string {
  if (band === 'below_normal') return styles.barBelow;
  if (band === 'normal') return styles.barNormal;
  if (band === 'elevated') return styles.barElevated;
  return styles.barCritical;
}

function GradeChip({ grade, label }: { grade: RiskGrade | null; label: string }) {
  return <span className={`${styles.gradeChip} ${gradeClass(grade)}`}>{label}</span>;
}

function TableScrollHint() {
  return <p className={styles.tableScrollHint}>ตารางกว้าง · เลื่อนแนวนอนเพื่อดูทุกคอลัมน์</p>;
}

function KpiCard({
  icon,
  label,
  value,
  unit,
  sub,
  hint,
  compact = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <article className={styles.kpiCard}>
      <div className={styles.kpiHead}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiIcon} aria-hidden="true"><Icon name={icon} size={17} /></span>
      </div>
      <div className={styles.kpiValueRow}>
        <strong className={`${styles.kpiValue} ${compact ? styles.kpiValueCompact : ''}`}>{value}</strong>
        {unit ? <span className={styles.kpiUnit}>{unit}</span> : null}
      </div>
      <p className={styles.kpiSub}>{sub}</p>
      {hint ? <p className={styles.kpiHint}>{hint}</p> : null}
    </article>
  );
}

function DisasterDonut({ split }: { split: DisasterSplit }) {
  const radius = 62;
  const segments = split.items.map((item, index) => ({
    ...item,
    offset: split.items
      .slice(0, index)
      .reduce((total, previous) => total + previous.sharePct, 0),
  }));

  return (
    <div className={styles.donutLayout}>
      <div className={styles.donutWrap}>
        <svg
          viewBox="0 0 180 180"
          className={styles.donutSvg}
          role="img"
          aria-label={`สัดส่วนค่าสินไหมตามภัย: ${split.items.map((item) => `${item.label} ${formatPct(item.sharePct)}`).join(', ')}`}
        >
          <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--line)" strokeWidth="26" />
          {segments.map((segment) => (
            segment.sharePct > 0 ? (
              <circle
                key={segment.type}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="26"
                pathLength={100}
                strokeDasharray={`${segment.sharePct} ${100 - segment.sharePct}`}
                strokeDashoffset={-segment.offset}
                transform="rotate(-90 90 90)"
              />
            ) : null
          ))}
          <text x="90" y="84" textAnchor="middle" className={styles.donutValue}>
            {formatInteger(split.totalClaimsBaht / 1_000_000)}
          </text>
          <text x="90" y="104" textAnchor="middle" className={styles.donutLabel}>ล้านบาท</text>
          <text x="90" y="123" textAnchor="middle" className={styles.donutSubLabel}>ค่าสินไหมรวม</text>
        </svg>
      </div>
      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.type} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: segment.color }} aria-hidden="true" />
            <div className={styles.legendBody}>
              <div className={styles.legendTop}>
                <span className={styles.legendLabel}>{segment.label}</span>
                <strong className={styles.legendShare}>{formatPct(segment.sharePct)}</strong>
              </div>
              <div className={styles.legendMeta}>
                {formatBahtCompact(segment.claimsPaidBaht)} · ภัยหลัก {formatInteger(segment.dominantProvinceCount)} จังหวัด
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinanceDashboard({ payload }: { payload: FinanceDashboardPayload }) {
  const [provinceCode, setProvinceCode] = useState('');
  const [program, setProgram] = useState<ProgramFilter>('all');

  const provinceGroups = useMemo(
    () => FINANCE_REGIONS.map((region) => ({
      ...region,
      provinces: payload.provinces.filter((item) => item.regionId === region.id),
    })),
    [payload.provinces],
  );

  const filteredRecords = useMemo(
    () => filterFinanceRecords(payload.records, { provinceCode: provinceCode || null, program }),
    [payload.records, provinceCode, program],
  );
  const summary = useMemo(() => summarizeFinanceRecords(filteredRecords), [filteredRecords]);
  const disasterSplit = useMemo(() => buildDisasterSplit(filteredRecords), [filteredRecords]);
  const regionBreakdown = useMemo(() => buildRegionSummaries(filteredRecords), [filteredRecords]);
  const rankedRecords = useMemo(
    () => [...filteredRecords]
      .sort((left, right) => right.riskScore - left.riskScore || right.claimRatioPct - left.claimRatioPct)
      .slice(0, 12),
    [filteredRecords],
  );

  const selectedProvince = provinceCode
    ? payload.provinces.find((item) => item.code === provinceCode) ?? null
    : null;
  const selectedCredit = selectedProvince
    ? payload.creditRecords.find((item) => item.provinceCode === selectedProvince.code) ?? null
    : null;
  const creditView = selectedCredit ?? payload.creditSummary;
  const activeProgram = program === 'all' ? null : payload.programs.find((item) => item.id === program) ?? null;
  const hasInsurance = filteredRecords.length > 0;
  const payoutBand = hasInsurance ? getPayoutBand(summary.claimRatioPct) : null;
  const regionMax = Math.max(140, ...regionBreakdown.map((region) => region.claimRatioPct));
  const scopeLabel = `${selectedProvince ? selectedProvince.name : 'ทั้งประเทศ'} · ${activeProgram ? activeProgram.shortLabel : 'ทุกโครงการ'}`;
  const selectedRegionId = selectedProvince?.regionId ?? null;

  const programOptions: Array<{ value: ProgramFilter; label: string }> = [
    { value: 'all', label: 'ทุกโครงการ' },
    { value: 'rice_annual', label: 'ข้าวนาปี' },
    { value: 'feed_corn', label: 'ข้าวโพดเลี้ยงสัตว์' },
  ];

  function resetFilters() {
    setProvinceCode('');
    setProgram('all');
  }

  return (
    <div className={styles.container}>
      <div className={styles.sampleBanner} role="note">
        <div className={styles.bannerIcon}><Icon name="info" size={20} /></div>
        <div className={styles.bannerBody}>
          <div className={styles.bannerTop}>
            <strong>โหมดข้อมูลตัวอย่าง (Deterministic Sample)</strong>
            <span className={styles.sampleChip}>sample: true</span>
            <span className={styles.sampleChip}>access: metadata_only</span>
          </div>
          <p>
            ตัวเลขในหน้านี้ใช้สาธิตโครงสร้างข้อมูลการเงินและประกันภัยพืชผล
            ไม่ใช่สถิติราชการและไม่ควรนำไปใช้ยืนยันสิทธิ์หรืออนุมัติสินเชื่อ
            จังหวัดที่ไม่มีรายการหมายถึงไม่มีหลักฐานในแบบจำลอง ไม่ได้หมายความว่าพื้นที่เพาะปลูกเป็นศูนย์
          </p>
          <ul className={styles.warningList}>
            {payload.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <details className={styles.warningDetails}>
            <summary>ข้อควรระวัง {payload.warnings.length} ข้อ</summary>
            <ul>
              {payload.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
          <p className={styles.bannerMeta}>
            ชุดข้อมูล {payload.dataVersion} · ข้อมูล ณ {formatThaiDate(payload.asOfDate)} · {payload.period.label}
          </p>
        </div>
      </div>

      <div className={styles.filterCard}>
        <div className={styles.filterGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>จังหวัด</span>
            <select
              className={styles.select}
              value={provinceCode}
              onChange={(event) => setProvinceCode(event.target.value)}
            >
              <option value="">ทั้งประเทศ (ทะเบียน 77 รหัสจังหวัด)</option>
              {provinceGroups.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.provinces.map((item) => (
                    <option key={item.code} value={item.code}>{item.code} · {item.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>โครงการประกันภัย</span>
            <div className={styles.programPills} role="group" aria-label="เลือกโครงการประกันภัย">
              {programOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.programPill} ${program === option.value ? styles.programPillActive : ''}`}
                  aria-pressed={program === option.value}
                  onClick={() => setProgram(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.filterActions}>
          <p className={styles.filterContext}>
            กำลังแสดง <strong>{formatInteger(summary.recordCount)}</strong> รายการจังหวัด × โครงการ
            {hasInsurance
              ? ` · ${formatRai(summary.insuredAreaRai)} · ${formatInteger(summary.insuredHouseholds)} ครัวเรือน`
              : ' · ไม่พบหลักฐานในแบบจำลอง'}
            {selectedProvince ? ` · เทียบทั้งประเทศ ${formatRai(payload.nationalSummary.insuredAreaRai)}` : ''}
          </p>
          <button
            type="button"
            className={styles.resetButton}
            onClick={resetFilters}
            disabled={!provinceCode && program === 'all'}
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <KpiCard
          icon="layers"
          label="พื้นที่เข้าร่วมโครงการ"
          value={hasInsurance ? formatInteger(summary.insuredAreaRai) : '—'}
          unit={hasInsurance ? 'ไร่' : undefined}
          sub={hasInsurance
            ? `${formatInteger(summary.insuredHouseholds)} ครัวเรือน · ${formatInteger(summary.provinceCount)} จังหวัด`
            : 'ไม่มีหลักฐานโครงการในพื้นที่ที่เลือก'}
          hint={scopeLabel}
        />
        <KpiCard
          icon="chart"
          label="เบี้ยประกันรวม"
          value={hasInsurance ? formatInteger(summary.grossPremiumBaht / 1_000_000) : '—'}
          unit={hasInsurance ? 'ล้านบาท' : undefined}
          sub={hasInsurance
            ? `รัฐอุดหนุน ${formatPct(summary.subsidySharePct)} · เกษตรกรจ่าย ${formatPct(100 - summary.subsidySharePct)}`
            : 'ไม่แสดงค่าศูนย์เมื่อไม่มีหลักฐาน'}
          hint="Tier 1 + Tier 2 รวมกัน"
        />
        <KpiCard
          icon="info"
          label="Claim Ratio (แบบจำลอง)"
          value={hasInsurance ? formatPct(summary.claimRatioPct) : '—'}
          sub={hasInsurance
            ? `ค่าสินไหม ${formatBahtCompact(summary.claimsPaidBaht)} · ${payoutBand?.label ?? '—'}`
            : 'ไม่มีค่าสินไหมให้ประเมิน'}
          hint={hasInsurance ? `ภัยหลัก ${summary.dominantDisasterLabel}` : undefined}
        />
        <KpiCard
          icon="catalog"
          label="ดัชนีการเข้าถึงสินเชื่อ"
          value={decimalFormat.format(creditView.creditAccessIndex)}
          unit="/ 100"
          sub={`ภาระหนี้ ${decimalFormat.format(creditView.debtBurdenIndex)} (${creditView.debtBurdenGradeLabel}) · ${creditView.creditAccessGradeLabel}`}
          hint={selectedProvince ? `${selectedProvince.name} · ข้อมูลสินเชื่อรายจังหวัด` : 'ทั้งประเทศ · ข้อมูลสินเชื่อเชิงจำลอง'}
        />
      </div>

      {!hasInsurance ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Icon name="info" size={24} /></div>
          <div className={styles.emptyBody}>
            <h2>ไม่มีหลักฐานโครงการในพื้นที่และโครงการที่เลือก</h2>
            <p>
              จังหวัดนี้อาจอยู่นอกพื้นที่เข้าร่วมของแบบจำลอง หรือไม่มีการปลูกพืชชนิดนี้ในชุดข้อมูล
              การไม่มีรายการไม่เท่ากับพื้นที่เพาะปลูก ความเสียหาย หรือค่าสินไหมเป็นศูนย์
              ยังดูโครงสร้างเบี้ยประกันและข้อมูลสินเชื่อด้านล่างได้
            </p>
          </div>
          <button type="button" className={styles.resetButton} onClick={resetFilters}>ล้างตัวกรอง</button>
        </div>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>ความเสี่ยงและค่าสินไหม</span>
                <h2 className={styles.sectionTitle}>สัดส่วนการชดเชยตามประเภทภัย</h2>
                <p className={styles.sectionDescription}>
                  ค่าสินไหมในแบบจำลองถูกกระจายตามสัดส่วนน้ำท่วม ฝนแล้ง และศัตรูพืชของแต่ละภูมิภาค
                  โดยไม่ใช้เหตุการณ์รายครั้งหรือความเสียหายรายแปลง
                </p>
              </div>
              <span className={styles.inlineChip}>ค่าสินไหมรวม {formatBahtCompact(disasterSplit.totalClaimsBaht)}</span>
            </div>

            <div className={styles.analysisGrid}>
              <article className={styles.chartCard}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>สัดส่วนค่าสินไหมตามภัย</h3>
                  <span className={styles.cardSub}>{formatInteger(summary.provinceCount)} จังหวัดในขอบเขตที่เลือก</span>
                </div>
                <DisasterDonut split={disasterSplit} />
              </article>

              <article className={styles.riskCard}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>ภาพรวมความเสี่ยง</h3>
                  <GradeChip grade={summary.riskGrade} label={summary.riskGradeLabel} />
                </div>
                <div className={styles.scoreRow}>
                  <div>
                    <span className={styles.statLabel}>Risk Score (ถ่วงน้ำหนักพื้นที่)</span>
                    <strong className={styles.scoreValue}>{summary.riskScore}<small>/100</small></strong>
                  </div>
                </div>
                <div className={styles.meter}>
                  <div className={styles.meterTrack}>
                    <div className={`${styles.meterFill} ${styles.riskFill}`} style={{ width: `${summary.riskScore}%` }} />
                  </div>
                </div>
                <div className={styles.statList}>
                  <div className={styles.statRow}>
                    <span>ภัยหลัก</span>
                    <strong>{summary.dominantDisasterLabel}</strong>
                  </div>
                  <div className={styles.statRow}>
                    <span>Claim Ratio สูงสุด</span>
                    <strong>
                      {summary.highestClaimProvince
                        ? `${summary.highestClaimProvince.provinceName} ${formatPct(summary.highestClaimProvince.claimRatioPct)}`
                        : '—'}
                    </strong>
                  </div>
                  <div className={styles.statRow}>
                    <span>พื้นที่ Tier 2</span>
                    <strong>{formatPct(summary.tier2SharePct)} ของ Tier 1</strong>
                  </div>
                </div>
                <div className={styles.perilList}>
                  {disasterSplit.items.map((item) => (
                    <div className={styles.perilRow} key={item.type}>
                      <span className={styles.perilLabel}>
                        <span className={styles.perilDot} style={{ background: item.color }} aria-hidden="true" />
                        {item.label}
                      </span>
                      <div className={styles.perilTrack}>
                        <span
                          className={styles.perilFill}
                          style={{ width: `${item.sharePct}%`, background: item.color }}
                        />
                      </div>
                      <span className={styles.perilValue}>{formatPct(item.sharePct)}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.insightText}>
                  {summary.dominantDisaster
                    ? `${DISASTER_CONFIG[summary.dominantDisaster].description} ระดับความเสี่ยงโดยรวมอยู่ที่ “${summary.riskGradeLabel}” จากการถ่วงน้ำหนักพื้นที่และ Claim Ratio ของแบบจำลอง`
                    : 'ไม่เพียงพอต่อการประเมินความเสี่ยงในขอบเขตที่เลือก'}
                </p>
              </article>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>โครงสร้างความคุ้มครอง</span>
                <h2 className={styles.sectionTitle}>เปรียบเทียบเบี้ยประกันและความคุ้มครอง Tier 1 vs Tier 2</h2>
                <p className={styles.sectionDescription}>
                  Tier 1 คือความคุ้มครองพื้นฐานที่รัฐอุดหนุนเบี้ยเป็นหลัก ส่วน Tier 2 เป็นความคุ้มครองเพิ่มเติม
                  ที่เกษตรกรจ่ายเบี้ยเองทั้งหมด และซื้อบนพื้นที่ที่เข้าร่วม Tier 1 แล้ว
                </p>
              </div>
              <span className={styles.inlineChip}>Tier 2 = ความคุ้มครองเสริม</span>
            </div>

            <div className={styles.tierSummaryGrid}>
              {payload.programSummaries.map((item) => (
                <div key={item.programId} className={styles.tierSummaryCard}>
                  <span className={styles.tierSummaryLabel}>{item.shortLabel}</span>
                  <strong className={styles.tierSummaryValue}>
                    {formatInteger(item.summary.insuredAreaRai / 1_000_000)} ล้านไร่
                  </strong>
                  <p className={styles.tierSummaryMeta}>
                    เป้าหมาย {formatInteger(item.targetAreaRai / 1_000_000)} ล้านไร่ · Tier 2 {formatPct(item.summary.tier2SharePct)}
                    {' '}· Claim Ratio {formatPct(item.summary.claimRatioPct)}
                  </p>
                </div>
              ))}
            </div>

            <div className={styles.tableCard}>
              <div className={styles.tableHeader}>
                <h3 className={styles.cardTitle}>เบี้ยประกัน ความคุ้มครอง และสัดส่วนผู้จ่าย</h3>
                <span className={styles.cardSub}>บาท/ไร่ · ค่าจำลองจากกรอบโครงการ</span>
              </div>
              <TableScrollHint />
              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col">โครงการ / ชั้นความคุ้มครอง</th>
                      <th scope="col">เบี้ยรวม</th>
                      <th scope="col">รัฐอุดหนุน</th>
                      <th scope="col">เกษตรกรจ่าย</th>
                      <th scope="col">ความคุ้มครอง</th>
                      <th scope="col">สัดส่วนผู้จ่ายเบี้ย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.coveragePlans.map((plan) => {
                      const isActive = program === 'all' || program === plan.programId;
                      const governmentShare = plan.premiumPerRai > 0
                        ? (plan.governmentSubsidyPerRai / plan.premiumPerRai) * 100
                        : 0;
                      return (
                        <tr key={`${plan.programId}-${plan.tier}`} className={isActive ? styles.rowHighlight : undefined}>
                          <td>
                            <div className={styles.programName}>
                              {plan.programShortLabel}
                              <span className={`${styles.tierBadge} ${plan.tier === 'tier1' ? styles.tier1 : styles.tier2}`}>
                                {plan.tier === 'tier1' ? 'Tier 1' : 'Tier 2'}
                              </span>
                            </div>
                            <div className={styles.programMeta}>
                              {plan.coverageRole === 'base' ? 'ความคุ้มครองพื้นฐาน' : 'ความคุ้มครองเพิ่มเติม'} · {plan.note}
                            </div>
                          </td>
                          <td className={styles.numberCell}>{formatInteger(plan.premiumPerRai)}</td>
                          <td className={styles.numberCell}>{plan.governmentSubsidyPerRai > 0 ? formatInteger(plan.governmentSubsidyPerRai) : '—'}</td>
                          <td className={styles.numberCell}>{formatInteger(plan.farmerPremiumPerRai)}</td>
                          <td className={styles.numberCell}>{formatInteger(plan.coveragePerRai)}</td>
                          <td>
                            <div className={styles.miniBar} aria-hidden="true">
                              <span className={styles.miniBarGov} style={{ width: `${governmentShare}%` }} />
                              <span className={styles.miniBarFarmer} style={{ width: `${100 - governmentShare}%` }} />
                            </div>
                            <div className={styles.miniBarCaption}>
                              รัฐ {formatPct(governmentShare, 0)} · เกษตรกร {formatPct(100 - governmentShare, 0)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={styles.tableNote}>
                หมายเหตุ: เบี้ย Tier 2 ของข้าวนาปีเป็นอัตราตามระดับความเสี่ยง (27–110 บาท/ไร่) ตารางใช้ค่ากลาง 63 บาท/ไร่
                ส่วนข้าวโพดเลี้ยงสัตว์ใช้ค่ากลาง 92 บาท/ไร่ ตัวเลขทั้งหมดเป็นค่าจำลองเพื่อเปรียบเทียบโครงสร้าง
              </p>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>แบบจำลองรายภูมิภาค</span>
                <h2 className={styles.sectionTitle}>Claim Ratio และการจ่ายค่าสินไหม</h2>
                <p className={styles.sectionDescription}>
                  Claim Ratio = ค่าสินไหมที่จ่าย ÷ เบี้ยประกันรวม (รัฐอุดหนุน + เกษตรกร) × 100
                  ค่าที่เกิน 100% หมายถึงค่าสินไหมสูงกว่าเบี้ยรวมในแบบจำลอง ไม่ได้แปลว่าขาดทุนจริงทันที
                </p>
              </div>
              <span className={styles.inlineChip}>ฐานเบี้ยรวม (Gross Premium)</span>
            </div>

            <div className={styles.chartCard}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Claim Ratio รายภูมิภาค</h3>
                <span className={styles.cardSub}>เส้นอ้างอิงแนวตั้ง = 100% ของเบี้ยรวม</span>
              </div>
              <div className={styles.regionChart}>
                {regionBreakdown.map((region) => (
                  <div key={region.regionId} className={styles.regionRow}>
                    <div className={styles.regionName}>
                      {region.regionLabel}
                      <span>{formatInteger(region.provinceCount)} จังหวัด · {formatRai(region.insuredAreaRai)}</span>
                    </div>
                    <div className={styles.barTrack}>
                      <span
                        className={styles.barReference}
                        style={{ left: `${(100 / regionMax) * 100}%` }}
                        aria-hidden="true"
                      />
                      <span
                        className={`${styles.barFill} ${barClass(region.payoutBand)}`}
                        style={{ width: `${Math.min(100, (region.claimRatioPct / regionMax) * 100)}%` }}
                      />
                    </div>
                    <span className={styles.regionValue}>{formatPct(region.claimRatioPct)}</span>
                    <span className={`${styles.bandChip} ${bandClass(region.payoutBand)}`}>{region.payoutBandLabel}</span>
                  </div>
                ))}
              </div>
              <p className={styles.chartFootnote}>
                ภัยหลักของแต่ละภูมิภาค: {regionBreakdown.map((region) => `${region.regionLabel} ${region.dominantDisasterLabel}`).join(' · ')}
              </p>
            </div>

            <div className={styles.tableCard}>
              <TableScrollHint />
              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col">ภูมิภาค</th>
                      <th scope="col">พื้นที่</th>
                      <th scope="col">เบี้ยรวม</th>
                      <th scope="col">ค่าสินไหม</th>
                      <th scope="col">Claim Ratio</th>
                      <th scope="col">ภัยหลัก</th>
                      <th scope="col">ระดับการจ่าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionBreakdown.map((region) => (
                      <tr key={region.regionId} className={selectedRegionId === region.regionId ? styles.rowHighlight : undefined}>
                        <td>{region.regionLabel}</td>
                        <td className={styles.numberCell}>{formatRai(region.insuredAreaRai)}</td>
                        <td className={styles.numberCell}>{formatBahtCompact(region.grossPremiumBaht)}</td>
                        <td className={styles.numberCell}>{formatBahtCompact(region.claimsPaidBaht)}</td>
                        <td className={styles.numberCell}>{formatPct(region.claimRatioPct)}</td>
                        <td>{region.dominantDisasterLabel}</td>
                        <td><span className={`${styles.bandChip} ${bandClass(region.payoutBand)}`}>{region.payoutBandLabel}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <details className={styles.assumptionsBox}>
              <summary>สมมติฐานของแบบจำลอง Claim Ratio</summary>
              <ul className={styles.assumptionList}>
                {payload.payoutModel.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
              </ul>
            </details>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>อันดับความเสี่ยง</span>
                <h2 className={styles.sectionTitle}>จังหวัดที่ควรจับตา</h2>
                <p className={styles.sectionDescription}>
                  เรียงตาม Risk Score ที่ถ่วงน้ำหนัก Claim Ratio และสัดส่วนภัยหลักของจังหวัด
                  อันดับนี้เป็นของแบบจำลอง ไม่ใช่การจัดอันดับอย่างเป็นทางการ
                </p>
              </div>
              <span className={styles.inlineChip}>แสดง {formatInteger(rankedRecords.length)} จาก {formatInteger(filteredRecords.length)} รายการ</span>
            </div>

            <div className={styles.tableCard}>
              <TableScrollHint />
              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th scope="col">อันดับ</th>
                      <th scope="col">จังหวัด</th>
                      <th scope="col">โครงการ</th>
                      <th scope="col">พื้นที่</th>
                      <th scope="col">Claim Ratio</th>
                      <th scope="col">ภัยหลัก</th>
                      <th scope="col">ความเสี่ยง</th>
                      <th scope="col">ค่าสินไหม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedRecords.map((record, index) => (
                      <tr key={record.id} className={record.provinceCode === provinceCode ? styles.rowHighlight : undefined}>
                        <td className={styles.rankCell}>{index + 1}</td>
                        <td>
                          <div className={styles.programName}>{record.provinceName}</div>
                          <div className={styles.programMeta}>{record.region} · รหัส {record.provinceCode}</div>
                        </td>
                        <td>{record.programShortLabel}</td>
                        <td className={styles.numberCell}>{formatRai(record.insuredAreaRai)}</td>
                        <td className={styles.numberCell}>{formatPct(record.claimRatioPct)}</td>
                        <td>
                          <span className={styles.perilChip}>
                            <span
                              className={styles.perilDot}
                              style={{ background: DISASTER_CONFIG[record.dominantDisaster].color }}
                              aria-hidden="true"
                            />
                            {record.dominantDisasterLabel}
                          </span>
                        </td>
                        <td><GradeChip grade={record.riskGrade} label={record.riskGradeLabel} /></td>
                        <td className={styles.numberCell}>{formatBahtCompact(record.claimsPaidBaht)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>สินเชื่อและหนี้สิน</span>
            <h2 className={styles.sectionTitle}>ภาระหนี้และการเข้าถึงแหล่งทุน</h2>
            <p className={styles.sectionDescription}>
              ดัชนีภาระหนี้และดัชนีการเข้าถึงสินเชื่อคำนวณจากความครอบคลุมของ ธ.ก.ส.
              ความครอบคลุมของกองทุนหมุนเวียน อัตราหนี้ที่ไม่ก่อให้เกิดรายได้ (NPL)
              หนี้ต่อรายได้ และสัดส่วนหนี้นอกระบบในแบบจำลอง
            </p>
          </div>
          <span className={styles.inlineChip}>
            {selectedProvince ? `${selectedProvince.name} · ${formatInteger(creditView.farmingHouseholds)} ครัวเรือน` : `ทั้งประเทศ · ${formatInteger(creditView.farmingHouseholds)} ครัวเรือน`}
          </span>
        </div>

        <div className={styles.kpiGrid}>
          <KpiCard
            icon="leaf"
            label="ครัวเรือนเกษตรกร"
            value={formatInteger(creditView.farmingHouseholds)}
            unit="ครัวเรือน"
            sub={`ผู้กู้ ธ.ก.ส. ${formatInteger(creditView.baacBorrowerHouseholds)} · ครอบคลุม ${formatPct(creditView.baacCoveragePct)}`}
          />
          <KpiCard
            icon="catalog"
            label="ยอดคงค้าง ธ.ก.ส."
            value={formatInteger(creditView.baacOutstandingMillionThb)}
            unit="ล้านบาท"
            sub={`NPL ${formatPct(creditView.baacNplPct)} · เฉลี่ย ${formatBahtCompact(creditView.averageBaacLoanThb)}/ราย`}
          />
          <KpiCard
            icon="water"
            label="กองทุนหมุนเวียน"
            value={formatPct(creditView.revolvingFundCoveragePct)}
            unit="ของครัวเรือน"
            sub={`ผู้กู้ ${formatInteger(creditView.revolvingFundBorrowerHouseholds)} · คงค้าง ${formatMillionBaht(creditView.revolvingFundOutstandingMillionThb)}`}
          />
          <KpiCard
            icon="chart"
            label="ภาระหนี้ / การเข้าถึง"
            value={`${decimalFormat.format(creditView.debtBurdenIndex)} / ${decimalFormat.format(creditView.creditAccessIndex)}`}
            unit="/ 100"
            sub={`${creditView.debtBurdenGradeLabel} · ${creditView.creditAccessGradeLabel}`}
            hint={selectedProvince ? 'จังหวัดที่เลือก' : 'ค่าถ่วงน้ำหนักระดับประเทศ'}
            compact
          />
        </div>

        <div className={styles.institutionGrid}>
          <article className={styles.institutionCard}>
            <div className={styles.institutionHead}>
              <div className={styles.institutionIcon}><Icon name="catalog" size={20} /></div>
              <div className={styles.institutionTitleBlock}>
                <h3 className={styles.institutionTitle}>ธ.ก.ส.</h3>
                <p className={styles.institutionAgency}>ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร</p>
              </div>
              <span className={styles.institutionBadge}>สินเชื่อหลัก</span>
            </div>
            <div className={styles.meterBlock}>
              <div className={styles.meterLabelRow}>
                <span>ความครอบคลุมครัวเรือนเกษตรกร</span>
                <strong>{formatPct(creditView.baacCoveragePct)}</strong>
              </div>
              <div className={styles.meter}>
                <div className={styles.meterTrack}>
                  <div className={styles.meterFill} style={{ width: `${Math.min(100, creditView.baacCoveragePct)}%` }} />
                </div>
              </div>
            </div>
            <div className={styles.factGrid}>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>ผู้กู้คงค้าง</span>
                <strong className={styles.factValue}>{formatInteger(creditView.baacBorrowerHouseholds)}</strong>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>สินเชื่อเฉลี่ย/ราย</span>
                <strong className={styles.factValue}>{formatBahtCompact(creditView.averageBaacLoanThb)}</strong>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>NPL</span>
                <strong className={styles.factValue}>{formatPct(creditView.baacNplPct)}</strong>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>หนี้ต่อรายได้</span>
                <strong className={styles.factValue}>{formatPct(creditView.debtToIncomePct)}</strong>
              </div>
            </div>
            <p className={styles.institutionNote}>
              ยอดคงค้างและจำนวนผู้กู้เป็นค่าประมาณระดับจังหวัด ไม่ใช่ข้อมูลรายบัญชี
              และไม่ควรนำไปรวมกับกองทุนหมุนเวียนโดยไม่ตรวจสอบการซ้ำซ้อนของผู้กู้
            </p>
          </article>

          <article className={styles.institutionCard}>
            <div className={styles.institutionHead}>
              <div className={styles.institutionIcon}><Icon name="water" size={20} /></div>
              <div className={styles.institutionTitleBlock}>
                <h3 className={styles.institutionTitle}>กองทุนหมุนเวียน</h3>
                <p className={styles.institutionAgency}>กองทุนหมุนเวียนเพื่อการกู้ยืมแก่เกษตรกรและผู้ยากจน</p>
              </div>
              <span className={styles.institutionBadge}>สินเชื่อรายย่อย</span>
            </div>
            <div className={styles.meterBlock}>
              <div className={styles.meterLabelRow}>
                <span>ความครอบคลุมครัวเรือนเกษตรกร</span>
                <strong>{formatPct(creditView.revolvingFundCoveragePct)}</strong>
              </div>
              <div className={styles.meter}>
                <div className={styles.meterTrack}>
                  <div className={`${styles.meterFill} ${styles.fundFill}`} style={{ width: `${Math.min(100, creditView.revolvingFundCoveragePct * 15)}%` }} />
                </div>
              </div>
            </div>
            <div className={styles.factGrid}>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>ผู้กู้คงค้าง</span>
                <strong className={styles.factValue}>{formatInteger(creditView.revolvingFundBorrowerHouseholds)}</strong>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>สินเชื่อเฉลี่ย/ราย</span>
                <strong className={styles.factValue}>{formatBahtCompact(creditView.averageRevolvingFundLoanThb)}</strong>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>ยอดคงค้าง</span>
                <strong className={styles.factValue}>{formatMillionBaht(creditView.revolvingFundOutstandingMillionThb)}</strong>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factLabel}>หนี้นอกระบบ</span>
                <strong className={styles.factValue}>{formatPct(creditView.informalDebtSharePct)}</strong>
              </div>
            </div>
            <p className={styles.institutionNote}>
              กองทุนมีกลุ่มเป้าหมายเป็นเกษตรกรรายย่อยและผู้ยากจน วงเงินเฉลี่ยจึงเล็กกว่า ธ.ก.ส.
              ตัวเลขนี้เป็นค่าจำลองเพื่อสะท้อนสัดส่วนการเข้าถึง ไม่ใช่ยอดจัดสรรจริง
            </p>
          </article>
        </div>

        <div className={styles.watchList}>
          {selectedCredit && selectedProvince ? (
            <>
              <div className={styles.watchItem}>
                <span className={styles.watchLabel}>จังหวัดที่เลือก</span>
                <strong>{selectedProvince.name} · {selectedProvince.region}</strong>
              </div>
              <p className={styles.watchText}>{selectedCredit.note}</p>
            </>
          ) : (
            <>
              <div className={styles.watchItem}>
                <span className={styles.watchLabel}>ภาระหนี้สูงสุดในแบบจำลอง</span>
                <strong>
                  {payload.creditSummary.highestDebtBurden
                    ? `${payload.creditSummary.highestDebtBurden.provinceName} · ${decimalFormat.format(payload.creditSummary.highestDebtBurden.index)}/100`
                    : '—'}
                </strong>
              </div>
              <div className={styles.watchItem}>
                <span className={styles.watchLabel}>การเข้าถึงสินเชื่อต่ำสุด</span>
                <strong>
                  {payload.creditSummary.lowestCreditAccess
                    ? `${payload.creditSummary.lowestCreditAccess.provinceName} · ${decimalFormat.format(payload.creditSummary.lowestCreditAccess.index)}/100`
                    : '—'}
                </strong>
              </div>
              <p className={styles.watchText}>
                เลือกจังหวัดจากตัวกรองเพื่อดูสถานะสินเชื่อรายพื้นที่และคำแนะนำของแบบจำลอง
              </p>
            </>
          )}
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h3 className={styles.cardTitle}>ดัชนีสินเชื่อรายภูมิภาค</h3>
            <span className={styles.cardSub}>ค่าถ่วงน้ำหนักด้วยจำนวนครัวเรือนเกษตรกร</span>
          </div>
          <TableScrollHint />
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th scope="col">ภูมิภาค</th>
                  <th scope="col">ครัวเรือน</th>
                  <th scope="col">ครอบคลุม ธ.ก.ส.</th>
                  <th scope="col">NPL</th>
                  <th scope="col">ครอบคลุมกองทุน</th>
                  <th scope="col">หนี้/รายได้</th>
                  <th scope="col">ภาระหนี้</th>
                  <th scope="col">การเข้าถึง</th>
                </tr>
              </thead>
              <tbody>
                {payload.creditRegionBreakdown.map((region) => (
                  <tr key={region.regionId} className={selectedRegionId === region.regionId ? styles.rowHighlight : undefined}>
                    <td>{region.regionLabel}</td>
                    <td className={styles.numberCell}>{formatInteger(region.farmingHouseholds)}</td>
                    <td className={styles.numberCell}>{formatPct(region.baacCoveragePct)}</td>
                    <td className={styles.numberCell}>{formatPct(region.baacNplPct)}</td>
                    <td className={styles.numberCell}>{formatPct(region.revolvingFundCoveragePct)}</td>
                    <td className={styles.numberCell}>{formatPct(region.debtToIncomePct)}</td>
                    <td><GradeChip grade={region.debtBurdenGrade} label={`${decimalFormat.format(region.debtBurdenIndex)} · ${region.debtBurdenGradeLabel}`} /></td>
                    <td><GradeChip grade={region.creditAccessGrade === 'high' ? 'low' : region.creditAccessGrade === 'moderate' ? 'moderate' : 'high'} label={`${decimalFormat.format(region.creditAccessIndex)} · ${region.creditAccessGradeLabel}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.tableNote}>
            สเกล “การเข้าถึง” สูงกว่าคือดีกว่า จึงใช้สีตรงข้ามกับ “ภาระหนี้” เพื่อไม่ให้อ่านสลับทิศ
          </p>
        </div>

        <div className={styles.definitionBox}>
          <div className={styles.definitionRow}>
            <span>สูตรภาระหนี้</span>
            <p>{payload.creditDefinition.debtBurdenFormula}</p>
          </div>
          <div className={styles.definitionRow}>
            <span>สูตรการเข้าถึง</span>
            <p>{payload.creditDefinition.creditAccessFormula}</p>
          </div>
          <div className={styles.definitionRow}>
            <span>การอ่านค่า</span>
            <p>{payload.creditDefinition.scaleNote}</p>
          </div>
          <div className={styles.definitionRow}>
            <span>ข้อควรระวัง</span>
            <p>{payload.creditDefinition.overlapNote}</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.sectionEyebrow}>ที่มาและสิทธิ์</span>
            <h2 className={styles.sectionTitle}>แหล่งอ้างอิงกรอบข้อมูล</h2>
            <p className={styles.sectionDescription}>
              ใช้เพื่อ calibrate โครงสร้างเบี้ย ความคุ้มครอง และตัวชี้วัดสินเชื่อเท่านั้น
              ยังไม่มีการนำเข้าตัวเลขรายจังหวัดที่ยืนยันสิทธิ์เผยแพร่จากหน่วยงานต้นทาง
            </p>
          </div>
        </div>
        <div className={styles.sourceGrid}>
          {payload.sources.map((source) => (
            <article key={source.id} className={styles.sourceCard}>
              <div className={styles.sourceHead}>
                <span className={styles.sourceAgency}>{source.agency}</span>
                <span className={styles.sourceAccess}><Icon name="lock" size={12} /> metadata_only</span>
              </div>
              <h3 className={styles.sourceName}>{source.name}</h3>
              <p className={styles.sourceRole}>{source.role}</p>
              <a
                className={styles.sourceLink}
                href={source.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                เปิดแหล่งข้อมูล
                <Icon name="external" size={14} />
              </a>
            </article>
          ))}
        </div>
        <p className={styles.footnote}>
          หากต้องการอ้างอิงทางวิชาการหรือราชการ ต้องตรวจสอบประกาศ เงื่อนไข และสิทธิ์เผยแพร่จากหน่วยงานต้นทางอีกครั้ง
          ตัวเลขในหน้านี้ไม่สามารถใช้แทนข้อมูลรายบัญชีหรือผลการจ่ายค่าสินไหมจริงได้
        </p>
      </section>
    </div>
  );
}
