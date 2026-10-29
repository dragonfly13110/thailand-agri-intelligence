'use client';

import React, { useEffect, useMemo, useState } from 'react';
/*
 * สัญญาข้อมูลของ /agri-tourism อ่านจาก @/lib/hub/agri-tourism-data เฉพาะ “type”
 * เหตุผล: ไฟล์ data lane มี `import 'server-only'` ซึ่ง Next ห้ามดึงเข้า client bundle
 * ถ้า import ค่า (const/function) จาก lane นั้นลง components นี้จะ build ไม่ผ่าน
 * ฉลากที่จำเป็น (ชื่อเดือน/ชื่อฤดู/ชื่อภาค/ชื่อกิจกรรม) จึง derive จาก payload เอง
 * — payload ส่ง labels มาให้ครบอยู่แล้ว (activityLabels, amenityLabels, seasonLabels,
 * monthLabel, regionLabel, kindLabel, typeLabel, peakSeasonLabel, topActivityLabel)
 */
import type {
  ActivityId,
  AgriTourismDashboardPayload,
  AgriTourismDestination,
  AgriTourismEnterprise,
  AgriTourismFruitMonth,
  AgriTourismProvinceStat,
  AgriTourismRegionCard,
  AgriTourismSource,
  AgriTourismSummary,
  AgriTourismTravelTip,
  AgriTourismWorkshop,
  AmenityId,
  RegionKey,
  SeasonKey,
} from '@/lib/hub/agri-tourism-data';
import { Icon, type IconName } from './icon';
import styles from './agri-tourism-dashboard.module.css';

/* ------------------------------------------------------------------ *
 * ประเภทเสริมที่ derive จาก payload (ไม่ตั้งชื่อ field เอง)
 * ------------------------------------------------------------------ */
type FruitEntry = AgriTourismFruitMonth['fruits'][number];
type DestinationKind = AgriTourismDestination['kind'];
type StayFilter = 'all' | 'stay' | 'dayTrip';
type SeasonTone = 'cool' | 'rainy' | 'hot' | 'unknown';
type ProvinceSortKey = keyof Pick<
  AgriTourismProvinceStat,
  | 'provinceName'
  | 'destinationCount'
  | 'farmstayCount'
  | 'learningCenterCount'
  | 'communityEnterpriseCount'
  | 'largeScaleGroupCount'
  | 'visitorTrips'
  | 'incomeBaht'
>;
type EnterpriseSortKey = keyof Pick<
  AgriTourismEnterprise,
  'name' | 'typeLabel' | 'memberCount' | 'areaRai'
>;
interface SeasonGroup {
  season: SeasonKey;
  label: string;
  tone: SeasonTone;
  months: number[];
}
interface KpiModel {
  key: string;
  title: string;
  value: string;
  unit: string;
  note: string;
  iconName: IconName;
  wide: boolean;
  ratio: number | null;
  ratioLabel: string;
}

/* ------------------------------------------------------------------ *
 * ตัวคงที่ของโมดูล
 * ------------------------------------------------------------------ */
const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('th-TH', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
/** ฉลากสำรองเฉพาะกรณีที่ payload ไม่ส่งเดือนนั้นมา (ไม่ dependency กับ lane) */
const MONTH_FALLBACK_LABELS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const PROVINCE_LIST_START = 12;
const PROVINCE_LIST_STEP = 12;
/** เพดานรายการต่อหน้า — ตรงกับข้อกำหนด Group C (การ์ด ≤ 12 ต่อรายการ, ตาราง ≤ 20 แถว) */
const LIST_PAGE_SIZE = 12;
const SEASON_PICK_LIMIT = 3;
const MONTH_PICK_LIMIT = 4;
const REGION_PANEL_ID = 'agri-tourism-region-panel';

/** amenity สองกลุ่มนี้ต้องแสดงให้ต่างจาก badge ทั่วไปชัดเจน */
const ACCESS_AMENITIES: ReadonlySet<string> = new Set(['wheelchair_access', 'wheelchair', 'accessible']);
const LODGING_AMENITIES: ReadonlySet<string> = new Set(['lodging', 'accommodation', 'farmstay_stay']);

const SEASON_ICONS: Record<SeasonTone, IconName> = {
  cool: 'leaf',
  rainy: 'water',
  hot: 'sun',
  unknown: 'info',
};

/* ------------------------------------------------------------------ *
 * ตัวช่วยรูปแบบ/คำนวณ (guard ค่าว่างและการหารศูนย์เสมอ)
 * ------------------------------------------------------------------ */
function toFinite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** ป้องกัน field ที่เป็น array จาก JSON ส่ง null มาจริง (ใช้เฉพาะจุดที่จำเป็น) */
function list<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function percentOf(numerator: number, denominator: number): number {
  const denominatorValue = toFinite(denominator);
  if (denominatorValue <= 0) return 0;
  return clampPercent((toFinite(numerator) / denominatorValue) * 100);
}

function formatInt(value: number | null | undefined): string {
  return intFormatter.format(toFinite(value));
}

function formatPercent(value: number | null | undefined): string {
  return `${decimalFormatter.format(clampPercent(toFinite(value)))}%`;
}

/**
 * มูลค่าบาทแบบอ่านง่าย ไม่แสดงเลขยาวเป็นสิบสองหลัก
 * ใช้ทศนิยม 1 ตำแหน่งสำหรับระดับ ล้าน/พันล้าน
 */
function formatBaht(value: number | null | undefined): string {
  const amount = toFinite(value);
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (absolute === 0) return '0 บาท';
  if (absolute >= 1_000_000_000) return `${sign}${decimalFormatter.format(absolute / 1_000_000_000)} พันล้านบาท`;
  if (absolute >= 1_000_000) return `${sign}${decimalFormatter.format(absolute / 1_000_000)} ล้านบาท`;
  if (absolute >= 1_000) return `${sign}${decimalFormatter.format(absolute / 1_000)} พันบาท`;
  return `${sign}${intFormatter.format(absolute)} บาท`;
}

function formatDistance(value: number | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return `${intFormatter.format(Math.round(value))} กิโลเมตรจากกรุงเทพมหานคร`;
}

/** เรียงลำดับระยะทาง: ค่า null/ลบ จัดไว้ท้ายสุดเสมอ */
function distanceSortValue(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return Number.POSITIVE_INFINITY;
  }
  return value;
}

function labelAt(labels: string[], index: number, fallback: string): string {
  const value = labels[index];
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : fallback;
}

/** แปลง ISO date จาก payload.dataAsOf เป็น พ.ศ. โดยไม่แตะ timezone/เวลาจริง */
function formatThaiDate(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'ไม่ระบุวันอ้างอิง';
  const matched = ISO_DATE.exec(value);
  if (!matched) return value;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;
  const monthName = MONTH_FALLBACK_LABELS[month - 1] ?? String(month);
  return `${day} ${monthName} ${year + 543}`;
}

function seasonToneOf(season: SeasonKey, label: string): SeasonTone {
  const text = `${String(season)} ${label}`.toLowerCase();
  if (text.includes('rain') || text.includes('ฝน')) return 'rainy';
  if (text.includes('hot') || text.includes('ร้อน')) return 'hot';
  if (text.includes('cool') || text.includes('หนาว')) return 'cool';
  return 'unknown';
}

function seasonClass(tone: SeasonTone): string {
  if (tone === 'cool') return styles.toneCool;
  if (tone === 'rainy') return styles.toneRainy;
  if (tone === 'hot') return styles.toneHot;
  return styles.toneUnknown;
}

function seasonIconOf(tone: SeasonTone): IconName {
  return SEASON_ICONS[tone];
}

/** icon ของชนิดแหล่งท่องเที่ยวอ่านจากฉลากไทย/id ที่ payload ส่งมา ไม่ hardcode union */
function kindIconOf(kind: DestinationKind, kindLabel: string): IconName {
  const text = `${String(kind)} ${kindLabel}`.toLowerCase();
  if (text.includes('farmstay') || text.includes('ที่พัก') || text.includes('โฮมสเตย์')) return 'home';
  if (text.includes('learn') || text.includes('ศูนย์เรียนรู้') || text.includes('เรียนรู้')) return 'book';
  if (text.includes('royal') || text.includes('ศาสตร์พระราชา') || text.includes('พระราชทาน')) return 'leaf';
  if (text.includes('market') || text.includes('ตลาด')) return 'catalog';
  if (text.includes('fruit') || text.includes('ผลไม้') || text.includes('สวน')) return 'sun';
  if (text.includes('water') || text.includes('ประมง') || text.includes('น้ำ')) return 'water';
  return 'pin';
}

function licenseLabel(status: AgriTourismSource['licenseStatus']): string {
  const text = String(status).toLowerCase();
  if (text.includes('approved') || text.includes('public')) return 'เผยแพร่ได้';
  if (text.includes('restricted')) return 'จำกัดสิทธิ์';
  if (text.includes('pending')) return 'รอตรวจสอบสิทธิ์';
  return String(status);
}

function licenseClass(status: AgriTourismSource['licenseStatus']): string {
  const text = String(status).toLowerCase();
  if (text.includes('approved') || text.includes('public')) return styles.licenseOk;
  if (text.includes('restricted')) return styles.licenseRestricted;
  return styles.licensePending;
}

function destinationHaystack(item: AgriTourismDestination): string {
  return [
    item.name,
    item.kindLabel,
    String(item.kind),
    item.provinceName,
    item.provinceCode,
    item.regionLabel,
    item.district,
    item.highlight,
    item.travelNote,
    ...list(item.activityLabels),
    ...list(item.amenityLabels),
    ...list(item.signatureCrops),
    ...list(item.seasonLabels),
  ]
    .join(' ')
    .toLowerCase();
}

function pickDiverseProvince(
  candidates: AgriTourismDestination[],
  limit: number,
): AgriTourismDestination[] {
  if (limit <= 0) return [];
  const usedProvinces = new Set<string>();
  const picks: AgriTourismDestination[] = [];
  for (const item of candidates) {
    if (usedProvinces.has(item.provinceCode)) continue;
    usedProvinces.add(item.provinceCode);
    picks.push(item);
    if (picks.length >= limit) return picks;
  }
  // ถ้าจังหวัดไม่พอ ให้เติมด้วยแหล่งที่เหลือจนครบ limit (ไม่แสดงซ้ำ)
  for (const item of candidates) {
    if (picks.length >= limit) break;
    if (picks.indexOf(item) >= 0) continue;
    picks.push(item);
  }
  return picks;
}

function recommendationScore(item: AgriTourismDestination, months: number[]): number {
  const overlap = list(item.bestMonths).filter((month) => months.includes(month)).length;
  return (
    overlap * 3 + (item.stayAvailable ? 2 : 0) + (item.dayTripOnly ? 1 : 0) + Math.min(toFinite(item.workshopCount), 4)
  );
}

function provinceMetricOf(row: AgriTourismProvinceStat, key: ProvinceSortKey): number {
  switch (key) {
    case 'destinationCount':
      return toFinite(row.destinationCount);
    case 'farmstayCount':
      return toFinite(row.farmstayCount);
    case 'learningCenterCount':
      return toFinite(row.learningCenterCount);
    case 'communityEnterpriseCount':
      return toFinite(row.communityEnterpriseCount);
    case 'largeScaleGroupCount':
      return toFinite(row.largeScaleGroupCount);
    case 'visitorTrips':
      return toFinite(row.visitorTrips);
    case 'incomeBaht':
      return toFinite(row.incomeBaht);
    case 'provinceName':
      return 0;
  }
}

function enterpriseMetricOf(row: AgriTourismEnterprise, key: EnterpriseSortKey): number {
  switch (key) {
    case 'memberCount':
      return toFinite(row.memberCount);
    case 'areaRai':
      return toFinite(row.areaRai);
    case 'name':
    case 'typeLabel':
      return 0;
  }
}

function buildKpiModels(summary: AgriTourismSummary): KpiModel[] {
  const destinations = toFinite(summary.destinationCount);
  const learningCenters = toFinite(summary.learningCenterCount);
  return [
    {
      key: 'destination',
      title: 'แหล่งท่องเที่ยวเชิงเกษตรในทะเบียน',
      value: formatInt(destinations),
      unit: 'แห่ง',
      note: `ครอบคลุม ${formatInt(summary.provinceCount)} จังหวัดจากทะเบียนอ้างอิง 77 จังหวัด (รหัสจังหวัดไม่ใช่ค่าความครอบคลุมจากการสำรวจ)`,
      iconName: 'pin',
      wide: false,
      ratio: null,
      ratioLabel: '',
    },
    {
      key: 'farmstay',
      title: 'ฟาร์มสเตย์และที่พักในสวน',
      value: formatInt(summary.farmstayCount),
      unit: 'แห่ง',
      note: 'นับจากแหล่งที่ระบุว่าพักรับรองได้จริงในทะเบียน เป็นคนละหน่วยนับกับจำนวนวันเข้าพัก',
      iconName: 'home',
      wide: false,
      ratio: percentOf(summary.farmstayCount, destinations),
      ratioLabel: 'สัดส่วนเทียบแหล่งท่องเที่ยวทั้งทะเบียน',
    },
    {
      key: 'learning',
      title: 'ศูนย์เรียนรู้ทางการเกษตร',
      value: formatInt(learningCenters),
      unit: 'แห่ง',
      note: 'ศูนย์เรียนรู้และแปลงสาธิตที่รับคณะศึกษาดูงาน',
      iconName: 'book',
      wide: false,
      ratio: percentOf(learningCenters, destinations),
      ratioLabel: 'สัดส่วนเทียบแหล่งท่องเที่ยวทั้งทะเบียน',
    },
    {
      key: 'royal',
      title: 'ศูนย์เรียนรู้ตามรอยศาสตร์พระราชา',
      value: formatInt(summary.royalInitiativeCount),
      unit: 'แห่ง',
      note: 'แหล่งที่ถ่ายทอดเกษตรทฤษฎีใหม่และเศรษฐกิจพอเพียง',
      iconName: 'leaf',
      wide: false,
      ratio: percentOf(summary.royalInitiativeCount, learningCenters),
      ratioLabel: 'สัดส่วนเทียบศูนย์เรียนรู้ทั้งหมด',
    },
    {
      key: 'enterprise',
      title: 'วิสาหกิจชุมชน',
      value: formatInt(summary.communityEnterpriseCount),
      unit: 'แห่ง',
      note: 'ทะเบียนกลุ่มผู้ผลิตที่จำหน่ายสินค้าและบริการท่องเที่ยว',
      iconName: 'layers',
      wide: false,
      ratio: null,
      ratioLabel: '',
    },
    {
      key: 'group',
      title: 'กลุ่มแปลงใหญ่',
      value: formatInt(summary.largeScaleGroupCount),
      unit: 'กลุ่ม',
      note: 'คนละทะเบียนกับวิสาหกิจชุมชน ห้ามบวกเป็นจำนวนเดียวกัน',
      iconName: 'catalog',
      wide: false,
      ratio: null,
      ratioLabel: '',
    },
    {
      key: 'workshop',
      title: 'เวิร์กช็อปและหลักสูตรชุมชน',
      value: formatInt(summary.workshopCount),
      unit: 'หลักสูตร',
      note: 'กิจกรรมฝึกอบรมระยะสั้นที่จัดโดยแหล่งท่องเที่ยวหรือวิสาหกิจชุมชน',
      iconName: 'search',
      wide: false,
      ratio: null,
      ratioLabel: '',
    },
    {
      key: 'festival',
      title: 'เดือนที่มีเทศกาลเก็บเกี่ยว',
      value: formatInt(summary.fruitFestivalMonthCount),
      unit: 'จาก 12 เดือน',
      note: 'นับจากปฏิทินผลไม้รายเดือนที่มีกิจกรรมส่งเสริมการท่องเที่ยว',
      iconName: 'sun',
      wide: false,
      ratio: percentOf(summary.fruitFestivalMonthCount, 12),
      ratioLabel: 'สัดส่วนเดือนที่มีกิจกรรม',
    },
    {
      key: 'visitor',
      title: 'เที่ยวชมประเมินทั้งปี',
      value: formatInt(summary.estimatedVisitorTrips),
      unit: 'ครั้ง',
      note: 'ค่าประเมินเชิงโครงสร้างของชุดข้อมูลตัวอย่าง ไม่ใช่จำนวนนักท่องเที่ยวจริง',
      iconName: 'chart',
      wide: true,
      ratio: null,
      ratioLabel: '',
    },
    {
      key: 'income',
      title: 'รายได้ชุมชนประเมิน',
      value: formatBaht(summary.estimatedIncomeBaht),
      unit: '',
      note: 'รวมมูลค่าที่คำนวณจากแบบจำลองเดียวกันกับจำนวนเที่ยวชม ห้ามใช้อ้างอิงทางกฎหมาย',
      iconName: 'chart',
      wide: true,
      ratio: null,
      ratioLabel: '',
    },
  ];
}

/* ------------------------------------------------------------------ *
 * ส่วนประกอบย่อย
 * ------------------------------------------------------------------ */
function Bar({ value, tone }: { value: number; tone: 'forest' | 'teal' | 'indigo' | 'amber' }) {
  const width = clampPercent(value);
  const toneClass =
    tone === 'teal' ? styles.barTeal : tone === 'indigo' ? styles.barIndigo : tone === 'amber' ? styles.barAmber : styles.barForest;
  return (
    <span className={styles.barTrack} role="presentation">
      <span className={`${styles.barFill} ${toneClass}`} style={{ width: `${width}%` }} />
    </span>
  );
}

function KpiCard({ model }: { model: KpiModel }) {
  return (
    <article className={`${styles.kpiCard} ${model.wide ? styles.kpiCardWide : ''}`}>
      <div className={styles.kpiHead}>
        <span className={styles.kpiIcon} aria-hidden="true">
          <Icon name={model.iconName} size={16} />
        </span>
        <h3 className={styles.kpiTitle}>{model.title}</h3>
      </div>
      <p className={styles.kpiValue}>
        {model.value}
        {model.unit ? <span className={styles.kpiUnit}> {model.unit}</span> : null}
      </p>
      {typeof model.ratio === 'number' ? (
        <div className={styles.kpiRatio}>
          <span className={styles.kpiRatioLabel}>
            {model.ratioLabel} <strong>{formatPercent(model.ratio)}</strong>
          </span>
          <Bar value={model.ratio} tone="forest" />
        </div>
      ) : null}
      <p className={styles.kpiNote}>{model.note}</p>
    </article>
  );
}

function MonthChipStrip({
  months,
  monthLabelOf,
  limit = 6,
}: {
  months: number[];
  monthLabelOf: (month: number) => string;
  limit?: number;
}) {
  const valid = months.filter((month) => month >= 1 && month <= 12).sort((a, b) => a - b);
  if (valid.length === 0) return <span className={styles.noneValue}>ไม่ระบุเดือน</span>;
  const shown = valid.slice(0, limit);
  const rest = valid.length - shown.length;
  return (
    <span className={styles.monthTagRow}>
      {shown.map((month) => (
        <span key={`month-tag-${month}`} className={styles.monthTag}>
          {monthLabelOf(month)}
        </span>
      ))}
      {rest > 0 ? <span className={styles.monthTagRest}>+{intFormatter.format(rest)}</span> : null}
    </span>
  );
}

function DestinationCard({
  destination,
  monthLabelOf,
  activeMonth,
  onMonthToggle,
}: {
  destination: AgriTourismDestination;
  monthLabelOf: (month: number) => string;
  activeMonth: number | null;
  onMonthToggle: (month: number) => void;
}) {
  const amenityIds = list(destination.amenities);
  const activityIds = list(destination.activities);
  const bestMonths = list(destination.bestMonths);
  const distanceText = formatDistance(destination.distanceFromBangkokKm);
  const stayText = destination.stayAvailable
    ? 'มีที่พักรับรองในฟาร์ม'
    : destination.dayTripOnly
      ? 'ไป-กลับวันเดียว'
      : 'ไม่มีที่พักรับรอง';

  return (
    <article className={styles.destCard}>
      <header className={styles.destHeader}>
        <span className={`${styles.kindPill} ${styles.kindPillAccent}`}>
          <Icon name={kindIconOf(destination.kind, destination.kindLabel)} size={13} />
          {destination.kindLabel}
        </span>
        {destination.sample ? <span className={styles.samplePill}>ข้อมูลตัวอย่าง</span> : null}
      </header>

      <h3 className={styles.destName}>{destination.name}</h3>
      <p className={styles.destPlace}>
        <Icon name="pin" size={13} /> {destination.district} · {destination.provinceName}
        <span className={styles.destCode}> ({destination.provinceCode}) · {destination.regionLabel}</span>
      </p>

      <p className={styles.destHighlight}>{destination.highlight}</p>

      <div className={styles.destMonthRow}>
        <span className={styles.destMetaLabel}>เดือนที่เหมาะไป</span>
        {bestMonths.length > 0 ? (
          <span className={styles.monthPickRow}>
            {bestMonths
              .filter((month) => month >= 1 && month <= 12)
              .sort((a, b) => a - b)
              .map((month) => (
                <button
                  key={`${destination.id}-best-${month}`}
                  type="button"
                  className={`${styles.monthMiniChip} ${activeMonth === month ? styles.monthMiniChipActive : ''}`}
                  aria-pressed={activeMonth === month}
                  onClick={() => onMonthToggle(month)}
                  title={`กรองทั้งหน้าเฉพาะเดือน${monthLabelOf(month)}`}
                >
                  {monthLabelOf(month)}
                </button>
              ))}
          </span>
        ) : (
          <span className={styles.noneValue}>ไม่ระบุเดือน</span>
        )}
      </div>

      <p className={styles.destQuickMeta}>
        <span>{formatInt(destination.workshopCount)} หลักสูตร</span>
        <span>{stayText}</span>
        <span>{distanceText ?? 'ไม่ระบุระยะทางจากกรุงเทพฯ'}</span>
      </p>

      <details className={styles.cardDetails}>
        <summary>
          กิจกรรม สิ่งอำนวยความสะดวก และคำแนะนำการเดินทาง
          {amenityIds.length + activityIds.length > 0
            ? ` (${intFormatter.format(amenityIds.length + activityIds.length)})`
            : ''}
        </summary>
        <div className={styles.cardDetailsBody}>
          {amenityIds.length > 0 ? (
            <div className={styles.badgeRow} aria-label="สิ่งอำนวยความสะดวก">
              {amenityIds.map((amenity: AmenityId, index) => {
                const text = labelAt(list(destination.amenityLabels), index, String(amenity));
                const key = String(amenity);
                const tone = ACCESS_AMENITIES.has(key)
                  ? styles.amenityAccess
                  : LODGING_AMENITIES.has(key)
                    ? styles.amenityLodging
                    : styles.amenityPlain;
                return (
                  <span key={`${destination.id}-amenity-${key}`} className={`${styles.amenityBadge} ${tone}`}>
                    {text}
                  </span>
                );
              })}
            </div>
          ) : null}

          {activityIds.length > 0 ? (
            <ul className={styles.tagRow}>
              {activityIds.map((activity: ActivityId, index) => (
                <li key={`${destination.id}-activity-${String(activity)}`} className={styles.activityTag}>
                  {labelAt(list(destination.activityLabels), index, String(activity))}
                </li>
              ))}
            </ul>
          ) : null}

          {list(destination.signatureCrops).length > 0 ? (
            <p className={styles.destCrops}>
              <span className={styles.destMetaLabel}>ผลิตภัณฑ์/ผลผลิตเด่น</span> {destination.signatureCrops.join(' · ')}
            </p>
          ) : null}

          <dl className={styles.destStats}>
            <div>
              <dt>เวิร์กช็อปที่เปิดสอนที่นี่</dt>
              <dd>{formatInt(destination.workshopCount)} หลักสูตร</dd>
            </div>
            <div>
              <dt>ลักษณะการเที่ยว</dt>
              <dd>
                {destination.stayAvailable ? (
                  <span className={styles.stayYes}>มีที่พักรับรองในฟาร์ม</span>
                ) : (
                  <span className={styles.stayNo}>ไม่มีที่พักรับรอง</span>
                )}
                {destination.dayTripOnly ? <span className={styles.dayTripTag}> · ไป-กลับวันเดียว</span> : null}
              </dd>
            </div>
            <div>
              <dt>ระยะทาง</dt>
              <dd>{distanceText ?? <span className={styles.noneValue}>ไม่ระบุระยะทางจากกรุงเทพฯ</span>}</dd>
            </div>
          </dl>

          <p className={styles.travelNote}>
            <Icon name="arrow" size={14} />
            <span>
              <strong>คำแนะนำการเดินทาง:</strong> {destination.travelNote}
            </span>
          </p>
        </div>
      </details>
    </article>
  );
}

function SeasonRecommendationCard({
  group,
  picks,
  monthLabelOf,
}: {
  group: SeasonGroup;
  picks: AgriTourismDestination[];
  monthLabelOf: (month: number) => string;
}) {
  return (
    <article className={`${styles.seasonCard} ${seasonClass(group.tone)}`}>
      <header className={styles.seasonCardHeader}>
        <span className={styles.seasonIcon} aria-hidden="true">
          <Icon name={seasonIconOf(group.tone)} size={16} />
        </span>
        <h3 className={styles.seasonCardTitle}>{group.label}</h3>
        <span className={styles.seasonMonths}>
          {group.months.map((month) => monthLabelOf(month)).join(' / ')}
        </span>
      </header>
      {picks.length > 0 ? (
        <ol className={styles.seasonPickList}>
          {picks.map((item, index) => (
            <li key={`${String(group.season)}-pick-${item.id}`} className={styles.seasonPickItem}>
              <span className={styles.seasonPickRank} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.seasonPickBody}>
                <strong className={styles.seasonPickName}>{item.name}</strong>
                <span className={styles.seasonPickMeta}>
                  {item.kindLabel} · {item.provinceName}
                </span>
                <span className={styles.seasonPickMonths}>
                  <MonthChipStrip months={list(item.bestMonths)} monthLabelOf={monthLabelOf} limit={4} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.columnEmpty}>ฤดูนี้ยังไม่มีการแนะนำแหล่งท่องเที่ยวในชุดข้อมูลตัวอย่าง</p>
      )}
    </article>
  );
}

function RegionFeatureCard({
  card,
  monthLabelOf,
  onMonthToggle,
  activeMonth,
}: {
  card: AgriTourismRegionCard;
  monthLabelOf: (month: number) => string;
  activeMonth: number | null;
  onMonthToggle: (month: number) => void;
}) {
  const peakMonths = list(card.peakMonths);
  return (
    <article className={styles.regionFeature}>
      <header className={styles.regionFeatureHeader}>
        <h3>{card.regionLabel}</h3>
        <p className={styles.regionFeatureSub}>
          {formatInt(card.provinceCount)} จังหวัดที่มีข้อมูล · {formatInt(card.destinationCount)} แหล่งท่องเที่ยว
        </p>
      </header>

      <div className={styles.regionFeatureGrid}>
        <div className={styles.regionFeatureBlock}>
          <span className={styles.regionFeatureLabel}>เดือนท่องเที่ยวหลักของภาค</span>
          {peakMonths.length > 0 ? (
            <span className={styles.monthPickRow}>
              {peakMonths
                .filter((month) => month >= 1 && month <= 12)
                .sort((a, b) => a - b)
                .map((month) => (
                  <button
                    key={`${String(card.region)}-peak-${month}`}
                    type="button"
                    className={`${styles.monthMiniChip} ${activeMonth === month ? styles.monthMiniChipActive : ''}`}
                    aria-pressed={activeMonth === month}
                    onClick={() => onMonthToggle(month)}
                  >
                    {monthLabelOf(month)}
                  </button>
                ))}
            </span>
          ) : (
            <span className={styles.noneValue}>ไม่ระบุเดือนท่องเที่ยวหลัก</span>
          )}
        </div>

        <div className={styles.regionFeatureBlock}>
          <span className={styles.regionFeatureLabel}>กิจกรรมหลักของภาค</span>
          <span className={styles.activityTag}>{card.topActivityLabel}</span>
        </div>

        <div className={styles.regionFeatureBlock}>
          <span className={styles.regionFeatureLabel}>ผลิตภัณฑ์เด่น</span>
          {list(card.signatureProducts).length > 0 ? (
            <span className={styles.productRow}>
              {card.signatureProducts.map((product) => (
                <span key={`${String(card.region)}-product-${product}`} className={styles.productTag}>
                  {product}
                </span>
              ))}
            </span>
          ) : (
            <span className={styles.noneValue}>ไม่ระบุผลิตภัณฑ์เด่น</span>
          )}
        </div>

        <div className={styles.regionFeatureBlock}>
          <span className={styles.regionFeatureLabel}>แหล่งท่องเที่ยวแนะนำ</span>
          <strong className={styles.highlightName}>
            <Icon name="pin" size={13} /> {card.highlightDestinationName}
          </strong>
        </div>
      </div>
    </article>
  );
}

function WorkshopCard({
  workshop,
  monthLabelOf,
}: {
  workshop: AgriTourismWorkshop;
  monthLabelOf: (month: number) => string;
}) {
  const months = list(workshop.months);
  const price = toFinite(workshop.priceBaht);
  return (
    <article className={styles.workshopCard}>
      <header className={styles.workshopHeader}>
        <h3 className={styles.workshopTitle}>{workshop.title}</h3>
        <span className={styles.activityTag}>{workshop.activityLabel}</span>
      </header>
      <p className={styles.workshopQuickMeta}>
        <span className={styles.workshopQuickPlace}>
          <Icon name="pin" size={12} /> {workshop.destinationName} · {workshop.provinceName} ({workshop.provinceCode})
        </span>
        <span>{decimalFormatter.format(toFinite(workshop.durationHours))} ชั่วโมง</span>
        <span>รับ {formatInt(workshop.capacity)} คน</span>
        <span>{price <= 0 ? 'ไม่มีค่าใช้จ่าย (ตัวอย่าง)' : formatBaht(price)}</span>
        <span>
          <MonthChipStrip months={months} monthLabelOf={monthLabelOf} limit={4} />
        </span>
      </p>
      <details className={styles.cardDetails}>
        <summary>สถานที่จัด หลักสูตร และกลุ่มเป้าหมาย</summary>
        <div className={styles.cardDetailsBody}>
          <p className={styles.workshopPlace}>
            <Icon name="pin" size={13} /> {workshop.destinationName} · {workshop.provinceName} (
            {workshop.provinceCode}) · {workshop.region}
          </p>
          <dl className={styles.workshopStats}>
            <div>
              <dt>ระยะเวลา</dt>
              <dd>{decimalFormatter.format(toFinite(workshop.durationHours))} ชั่วโมง</dd>
            </div>
            <div>
              <dt>รับได้</dt>
              <dd>{formatInt(workshop.capacity)} คน</dd>
            </div>
            <div>
              <dt>ค่าใช้จ่าย*</dt>
              <dd className={styles.priceValue}>{price <= 0 ? 'ไม่มีค่าใช้จ่าย (ตัวอย่าง)' : formatBaht(price)}</dd>
            </div>
            <div>
              <dt>ช่วงเดือน</dt>
              <dd>
                <MonthChipStrip months={months} monthLabelOf={monthLabelOf} limit={5} />
              </dd>
            </div>
          </dl>
          <p className={styles.workshopAudience}>
            <strong>กลุ่มเป้าหมาย:</strong> {workshop.targetAudience}
          </p>
          {workshop.sample ? <p className={styles.workshopSample}>รายละเอียดหลักสูตรเป็นข้อมูลตัวอย่าง</p> : null}
        </div>
      </details>
    </article>
  );
}

function TipCard({
  tip,
  monthLabelOf,
  regionLabelOf,
}: {
  tip: AgriTourismTravelTip;
  monthLabelOf: (month: number) => string;
  regionLabelOf: (key: RegionKey | 'all') => string;
}) {
  const tone = seasonToneOf(tip.season, tip.seasonLabel);
  const from = toFinite(tip.monthFrom);
  const to = toFinite(tip.monthTo);
  const rangeText =
    from >= 1 && to >= 1 ? `${monthLabelOf(from)} – ${monthLabelOf(to)}` : 'ทั้งปี (ตามเงื่อนไขแต่ละพื้นที่)';
  return (
    <article className={`${styles.tipCard} ${seasonClass(tone)}`}>
      <header className={styles.tipHeader}>
        <span className={styles.seasonIcon} aria-hidden="true">
          <Icon name={seasonIconOf(tone)} size={15} />
        </span>
        <h3 className={styles.tipTitle}>{tip.title}</h3>
      </header>
      <p className={styles.tipMeta}>
        <span className={styles.tipSeasonPill}>{tip.seasonLabel}</span>
        <span className={styles.tipRange}>{rangeText}</span>
        <span className={styles.tipScope}>
          {regionLabelOf(tip.regionScope === 'all' ? 'all' : tip.regionScope)}
        </span>
      </p>
      <p className={styles.tipGuidance}>{tip.guidance}</p>
      {list(tip.relatedActivities).length > 0 ? (
        <ul className={styles.tagRow}>
          {tip.relatedActivities.map((activity: ActivityId) => (
            <li key={`${tip.id}-activity-${String(activity)}`} className={styles.activityTag}>
              {String(activity).replace(/[_-]+/g, ' ')}
            </li>
          ))}
        </ul>
      ) : null}
      {tip.sample ? <p className={styles.tipSample}>คำแนะนำเชิงโครงสร้างสำหรับสาธิตการนำทาง</p> : null}
    </article>
  );
}

function SortGlyph({ active, desc }: { active: boolean; desc: boolean }) {
  return (
    <span className={`${styles.sortGlyph} ${active ? styles.sortGlyphActive : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4">
        {active && desc ? <path d="M6 10l6 6 6-6" /> : <path d="M6 14l6-6 6 6" />}
      </svg>
    </span>
  );
}

/** ตัวแบ่งหน้าร่วม: ก่อนหน้า/ถัดไป + "หน้า X จาก Y" + จำนวนผลลัพธ์แบบ aria-live */
function Pagination({
  page,
  pageCount,
  total,
  startIndex,
  shownCount,
  unit,
  label,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  startIndex: number;
  shownCount: number;
  unit: string;
  label: string;
  onChange: (nextPage: number) => void;
}) {
  if (pageCount <= 1 || total <= 0) return null;
  const first = startIndex + 1;
  const last = startIndex + shownCount;
  return (
    <nav className={styles.pager} aria-label={label}>
      <button
        type="button"
        className={styles.pagerButton}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        <Icon name="arrow" size={14} className={styles.pagerPrevIcon} /> ก่อนหน้า
      </button>
      <p className={styles.pagerInfo} aria-live="polite">
        หน้า {intFormatter.format(page)} จาก {intFormatter.format(pageCount)} · แสดง{' '}
        {intFormatter.format(first)}–{intFormatter.format(last)} จาก {intFormatter.format(total)} {unit}
      </p>
      <button
        type="button"
        className={styles.pagerButton}
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
      >
        ถัดไป <Icon name="arrow" size={14} />
      </button>
    </nav>
  );
}

/** เลื่อน focus ใน tablist ด้วยลูกศร (keyboard) แล้วเลือกแท็บตาม – ไม่มี state นอก React */
function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, onSelect: () => void): void {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') {
    return;
  }
  const tablist = event.currentTarget.closest('[role="tablist"]');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) return;
  const currentIndex = Math.max(0, tabs.indexOf(event.currentTarget));
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else nextIndex = tabs.length - 1;
  const target = tabs[nextIndex];
  if (target) {
    target.focus();
    onSelect();
    event.preventDefault();
  }
}

/* ------------------------------------------------------------------ *
 * แดชบอร์ดหลัก
 * ------------------------------------------------------------------ */
export interface AgriTourismDashboardProps {
  payload: AgriTourismDashboardPayload;
}

export function AgriTourismDashboard({ payload }: AgriTourismDashboardProps) {
  const [regionFilter, setRegionFilter] = useState<RegionKey | 'all'>('all');
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [provinceFilter, setProvinceFilter] = useState<string>('all');
  const [activityFilter, setActivityFilter] = useState<ActivityId | 'all'>('all');
  const [stayFilter, setStayFilter] = useState<StayFilter>('all');
  const [query, setQuery] = useState('');
  const [provinceSortKey, setProvinceSortKey] = useState<ProvinceSortKey>('destinationCount');
  const [provinceSortDesc, setProvinceSortDesc] = useState<boolean>(true);
  const [provinceLimit, setProvinceLimit] = useState<number>(PROVINCE_LIST_START);
  const [enterpriseSortKey, setEnterpriseSortKey] = useState<EnterpriseSortKey>('memberCount');
  const [enterpriseSortDesc, setEnterpriseSortDesc] = useState<boolean>(true);
  const [destinationPage, setDestinationPage] = useState<number>(1);
  const [workshopPage, setWorkshopPage] = useState<number>(1);
  const [enterprisePage, setEnterprisePage] = useState<number>(1);
  const [tipPage, setTipPage] = useState<number>(1);

  const summary = payload.summary;
  const normalizedQuery = query.trim().toLowerCase();
  const isSample = Boolean(payload.sample);

  /* ---------- maps ที่ derive จาก payload (labels ทั้งหมดมาจากข้อมูลจริงของ payload) ---------- */
  const calendarByMonth = useMemo(() => {
    const map = new Map<number, AgriTourismFruitMonth>();
    for (const row of list(payload.fruitCalendar)) {
      const month = toFinite(row.month);
      if (month >= 1 && month <= 12 && !map.has(month)) map.set(month, row);
    }
    return map;
  }, [payload.fruitCalendar]);

  const monthLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    calendarByMonth.forEach((row, month) => map.set(month, row.monthLabel));
    return map;
  }, [calendarByMonth]);

  const monthLabelOf = (month: number): string =>
    monthLabelMap.get(month) ?? MONTH_FALLBACK_LABELS[month - 1] ?? `เดือนที่ ${month}`;

  const regionLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of list(payload.regionCards)) map.set(String(card.region), card.regionLabel);
    for (const row of list(payload.provinceStats)) map.set(String(row.region), row.regionLabel);
    for (const item of list(payload.enterprises)) map.set(String(item.region), item.regionLabel);
    return map;
  }, [payload.regionCards, payload.provinceStats, payload.enterprises]);

  const regionLabelOf = (key: RegionKey | 'all'): string =>
    key === 'all' ? 'ทุกภูมิภาค' : (regionLabelMap.get(String(key)) ?? String(key));

  /** เดือน → activity labels (จากคู่ activities/activityLabels ของแหล่งท่องเที่ยว) */
  const activityOptions = useMemo(() => {
    const counts = new Map<ActivityId, { label: string; count: number }>();
    for (const item of list(payload.destinations)) {
      list(item.activities).forEach((activity, index) => {
        const label = labelAt(list(item.activityLabels), index, String(activity));
        const entry = counts.get(activity);
        if (entry) entry.count += 1;
        else counts.set(activity, { label, count: 1 });
      });
    }
    return [...counts.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label, 'th'),
    );
  }, [payload.destinations]);

  const seasonGroups = useMemo(() => {
    const groups = new Map<SeasonKey, { label: string; months: number[] }>();
    for (const row of list(payload.fruitCalendar)) {
      const month = toFinite(row.month);
      if (month < 1 || month > 12) continue;
      const existing = groups.get(row.season);
      if (existing) existing.months.push(month);
      else groups.set(row.season, { label: row.seasonLabel, months: [month] });
    }
    return [...groups.entries()]
      .map(([season, value]) => ({
        season,
        label: value.label || String(season),
        tone: seasonToneOf(season, value.label),
        months: value.months.sort((a, b) => a - b),
      }))
      .sort((a, b) => (a.months[0] ?? 13) - (b.months[0] ?? 13));
  }, [payload.fruitCalendar]);

  const uncoveredMonths = useMemo(() => {
    const covered = new Set<number>();
    for (const group of seasonGroups) {
      for (const month of group.months) covered.add(month);
    }
    return MONTH_NUMBERS.filter((month) => !covered.has(month));
  }, [seasonGroups]);

  /** รหัส/ชื่อจังหวัดต่อภาค — ใช้กรองผลไม้ในปฏิทินตามภาคที่เลือก */
  const regionProvinceIndex = useMemo(() => {
    const codes = new Map<string, Set<string>>();
    const names = new Map<string, Set<string>>();
    for (const row of list(payload.provinceStats)) {
      const key = String(row.region);
      const codeSet = codes.get(key);
      if (codeSet) codeSet.add(row.provinceCode);
      else codes.set(key, new Set([row.provinceCode]));
      const nameSet = names.get(key);
      if (nameSet) nameSet.add(row.provinceName);
      else names.set(key, new Set([row.provinceName]));
    }
    return { codes, names };
  }, [payload.provinceStats]);

  /* ---------- แท็บภาค ---------- */
  const regionTabs = useMemo(() => {
    const tabs: Array<{ key: RegionKey | 'all'; label: string; count: number }> = [
      { key: 'all', label: 'ทั้งหมด', count: list(payload.destinations).length },
    ];
    for (const card of list(payload.regionCards)) {
      tabs.push({ key: card.region, label: card.regionLabel, count: toFinite(card.destinationCount) });
    }
    return tabs;
  }, [payload.regionCards, payload.destinations]);

  const activeRegionCard = useMemo(() => {
    if (regionFilter === 'all') return null;
    return list(payload.regionCards).find((card) => card.region === regionFilter) ?? null;
  }, [payload.regionCards, regionFilter]);

  /* ---------- ขอบเขตจังหวัด/ภาคที่ใช้อยู่จริง ---------- */
  const regionProvinces = useMemo(
    () => list(payload.provinceStats).filter((row) => regionFilter === 'all' || row.region === regionFilter),
    [payload.provinceStats, regionFilter],
  );

  /** ถ้าเปลี่ยนภาคแล้วจังหวัดที่เลือกไว้ไม่อยู่ในภาคนั้น ให้ละการเลือกจังหวัดเดิม เพื่อให้ผลที่แสดงไม่ว่างเปล่า */
  const activeProvinceCode = useMemo(() => {
    if (provinceFilter === 'all') return 'all';
    return regionProvinces.some((row) => row.provinceCode === provinceFilter) ? provinceFilter : 'all';
  }, [provinceFilter, regionProvinces]);

  const activeActivity = useMemo(() => {
    if (activityFilter === 'all') return 'all';
    return activityOptions.some(([id]) => id === activityFilter) ? activityFilter : 'all';
  }, [activityFilter, activityOptions]);

  const provinceOptions = useMemo(
    () => [...regionProvinces].sort((a, b) => a.provinceName.localeCompare(b.provinceName, 'th')),
    [regionProvinces],
  );

  /* ---------- แหล่งท่องเที่ยว ---------- */
  const filteredDestinations = useMemo(() => {
    const rows = list(payload.destinations).filter((item) => {
      if (regionFilter !== 'all' && item.region !== regionFilter) return false;
      if (activeProvinceCode !== 'all' && item.provinceCode !== activeProvinceCode) return false;
      if (monthFilter !== null && !list(item.bestMonths).includes(monthFilter)) return false;
      if (activeActivity !== 'all' && !list(item.activities).includes(activeActivity)) return false;
      if (stayFilter === 'stay' && item.stayAvailable !== true) return false;
      if (stayFilter === 'dayTrip' && item.dayTripOnly !== true) return false;
      if (normalizedQuery.length > 0 && !destinationHaystack(item).includes(normalizedQuery)) return false;
      return true;
    });
    return [...rows].sort(
      (a, b) =>
        distanceSortValue(a.distanceFromBangkokKm) - distanceSortValue(b.distanceFromBangkokKm) ||
        a.name.localeCompare(b.name, 'th'),
    );
  }, [
    payload.destinations,
    regionFilter,
    activeProvinceCode,
    monthFilter,
    activeActivity,
    stayFilter,
    normalizedQuery,
  ]);

  /* ---------- การ์ดแนะนำรายฤดู / รายเดือน ---------- */
  const seasonRecommendations = useMemo(
    () =>
      seasonGroups.map((group) => {
        const candidates = list(payload.destinations)
          .filter((item) => list(item.bestMonths).some((month) => group.months.includes(month)))
          .sort(
            (a, b) =>
              recommendationScore(b, group.months) - recommendationScore(a, group.months) ||
              a.name.localeCompare(b.name, 'th'),
          );
        return { group, picks: pickDiverseProvince(candidates, SEASON_PICK_LIMIT) };
      }),
    [seasonGroups, payload.destinations],
  );

  const monthPicks = useMemo(() => {
    if (monthFilter === null) return [];
    const months = [monthFilter];
    const candidates = list(payload.destinations)
      .filter((item) => list(item.bestMonths).includes(monthFilter))
      .sort(
        (a, b) =>
          recommendationScore(b, months) - recommendationScore(a, months) || a.name.localeCompare(b.name, 'th'),
      );
    return pickDiverseProvince(candidates, MONTH_PICK_LIMIT);
  }, [monthFilter, payload.destinations]);

  /* ---------- ปฏิทินผลไม้ ---------- */
  const calendarRows = useMemo(() => {
    const rows = [...list(payload.fruitCalendar)].sort((a, b) => toFinite(a.month) - toFinite(b.month));
    return rows.map((row) => {
      const month = toFinite(row.month);
      const allowedCodes = regionFilter === 'all' ? null : regionProvinceIndex.codes.get(String(regionFilter));
      const allowedNames = regionFilter === 'all' ? null : regionProvinceIndex.names.get(String(regionFilter));
      const fruits = list(row.fruits).filter((fruit: FruitEntry) => {
        if (!allowedCodes && !allowedNames) return true;
        const codes = list(fruit.provinceCodes);
        if (codes.length > 0 && allowedCodes) return codes.some((code) => allowedCodes.has(code));
        const names = list(fruit.provinceNames);
        if (names.length > 0 && allowedNames) return names.some((name) => allowedNames.has(name));
        return true;
      });
      const peakCount = fruits.filter((fruit) => fruit.peak === true).length;
      const festivalCount = fruits.filter((fruit) => fruit.festival === true).length;
      return { row, month, fruits, peakCount, festivalCount };
    });
  }, [payload.fruitCalendar, regionFilter, regionProvinceIndex]);

  const calendarFestivalTotal = useMemo(
    () => calendarRows.reduce((total, entry) => total + (toFinite(entry.row.eventCount) > 0 ? 1 : 0), 0),
    [calendarRows],
  );

  /* ---------- เวิร์กช็อป ---------- */
  const filteredWorkshops = useMemo(
    () =>
      list(payload.workshops)
        .filter((item) => {
          if (regionFilter !== 'all' && item.region !== regionFilter) return false;
          if (activeProvinceCode !== 'all' && item.provinceCode !== activeProvinceCode) return false;
          if (monthFilter !== null && !list(item.months).includes(monthFilter)) return false;
          if (activeActivity !== 'all' && item.activity !== activeActivity) return false;
          return true;
        })
        .sort(
          (a, b) =>
            toFinite(b.capacity) - toFinite(a.capacity) || a.title.localeCompare(b.title, 'th'),
        ),
    [payload.workshops, regionFilter, activeProvinceCode, monthFilter, activeActivity],
  );

  /* ---------- วิสาหกิจชุมชน / กลุ่มแปลงใหญ่ ---------- */
  const filteredEnterprises = useMemo(() => {
    const rows = list(payload.enterprises).filter((item) => {
      if (regionFilter !== 'all' && item.region !== regionFilter) return false;
      if (activeProvinceCode !== 'all' && item.provinceCode !== activeProvinceCode) return false;
      if (activeActivity !== 'all' && !list(item.tourActivities).includes(activeActivity)) return false;
      return true;
    });
    const direction = enterpriseSortDesc ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (enterpriseSortKey === 'name') return a.name.localeCompare(b.name, 'th') * direction;
      if (enterpriseSortKey === 'typeLabel')
        return (
          (a.typeLabel.localeCompare(b.typeLabel, 'th') || a.name.localeCompare(b.name, 'th')) * direction
        );
      const delta = enterpriseMetricOf(a, enterpriseSortKey) - enterpriseMetricOf(b, enterpriseSortKey);
      if (delta !== 0) return delta * direction;
      return a.name.localeCompare(b.name, 'th');
    });
  }, [payload.enterprises, regionFilter, activeProvinceCode, activeActivity, enterpriseSortKey, enterpriseSortDesc]);

  /* ---------- ตารางจังหวัด ---------- */
  const sortedProvinces = useMemo(() => {
    const direction = provinceSortDesc ? -1 : 1;
    return [...regionProvinces].sort((a, b) => {
      if (provinceSortKey === 'provinceName') return a.provinceName.localeCompare(b.provinceName, 'th') * direction;
      const delta = provinceMetricOf(a, provinceSortKey) - provinceMetricOf(b, provinceSortKey);
      if (delta !== 0) return delta * direction;
      return a.provinceName.localeCompare(b.provinceName, 'th');
    });
  }, [regionProvinces, provinceSortKey, provinceSortDesc]);

  const provinceTotals = useMemo(() => {
    const totals = {
      destinationCount: 0,
      farmstayCount: 0,
      learningCenterCount: 0,
      communityEnterpriseCount: 0,
      largeScaleGroupCount: 0,
      visitorTrips: 0,
      incomeBaht: 0,
    };
    for (const row of sortedProvinces) {
      totals.destinationCount += toFinite(row.destinationCount);
      totals.farmstayCount += toFinite(row.farmstayCount);
      totals.learningCenterCount += toFinite(row.learningCenterCount);
      totals.communityEnterpriseCount += toFinite(row.communityEnterpriseCount);
      totals.largeScaleGroupCount += toFinite(row.largeScaleGroupCount);
      totals.visitorTrips += toFinite(row.visitorTrips);
      totals.incomeBaht += toFinite(row.incomeBaht);
    }
    return totals;
  }, [sortedProvinces]);

  const visibleProvinces = useMemo(() => sortedProvinces.slice(0, Math.max(0, provinceLimit)), [
    sortedProvinces,
    provinceLimit,
  ]);

  /* ---------- คำแนะนำการเดินทาง ---------- */
  const filteredTips = useMemo(
    () =>
      list(payload.travelTips).filter(
        (tip) => regionFilter === 'all' || tip.regionScope === 'all' || tip.regionScope === regionFilter,
      ),
    [payload.travelTips, regionFilter],
  );

  /** แถวปฏิทินของเดือนที่เลือก — ใช้ fruits ที่กรองตามภาคแล้ว เพื่อไม่ให้ panel ขัดกับตาราง */
  const activeMonthEntry = useMemo(
    () => (monthFilter === null ? null : (calendarRows.find((entry) => entry.month === monthFilter) ?? null)),
    [calendarRows, monthFilter],
  );
  const activeMonthRow = activeMonthEntry ? activeMonthEntry.row : null;
  const activeMonthFruits = activeMonthEntry ? activeMonthEntry.fruits : [];

  const hasActiveFilters =
    regionFilter !== 'all' ||
    monthFilter !== null ||
    provinceFilter !== 'all' ||
    activityFilter !== 'all' ||
    stayFilter !== 'all' ||
    normalizedQuery.length > 0;

  /** เปลี่ยนแท็บ/ตัวกรอง/คำค้นเมื่อไร ให้ทุก list กลับไปหน้า 1 และตารางจังหวัดย่อกลับชุดแรก */
  useEffect(() => {
    setDestinationPage(1);
    setWorkshopPage(1);
    setEnterprisePage(1);
    setTipPage(1);
    setProvinceLimit(PROVINCE_LIST_START);
  }, [
    regionFilter,
    monthFilter,
    activeProvinceCode,
    activeActivity,
    stayFilter,
    normalizedQuery,
    enterpriseSortKey,
    enterpriseSortDesc,
  ]);

  const destinationPageCount = Math.max(1, Math.ceil(filteredDestinations.length / LIST_PAGE_SIZE));
  const activeDestinationPage = Math.min(destinationPage, destinationPageCount);
  const destinationStartIndex = (activeDestinationPage - 1) * LIST_PAGE_SIZE;
  const visibleDestinations = filteredDestinations.slice(
    destinationStartIndex,
    destinationStartIndex + LIST_PAGE_SIZE,
  );

  const workshopPageCount = Math.max(1, Math.ceil(filteredWorkshops.length / LIST_PAGE_SIZE));
  const activeWorkshopPage = Math.min(workshopPage, workshopPageCount);
  const workshopStartIndex = (activeWorkshopPage - 1) * LIST_PAGE_SIZE;
  const visibleWorkshops = filteredWorkshops.slice(workshopStartIndex, workshopStartIndex + LIST_PAGE_SIZE);

  const enterprisePageCount = Math.max(1, Math.ceil(filteredEnterprises.length / LIST_PAGE_SIZE));
  const activeEnterprisePage = Math.min(enterprisePage, enterprisePageCount);
  const enterpriseStartIndex = (activeEnterprisePage - 1) * LIST_PAGE_SIZE;
  const visibleEnterprises = filteredEnterprises.slice(
    enterpriseStartIndex,
    enterpriseStartIndex + LIST_PAGE_SIZE,
  );

  const tipPageCount = Math.max(1, Math.ceil(filteredTips.length / LIST_PAGE_SIZE));
  const activeTipPage = Math.min(tipPage, tipPageCount);
  const tipStartIndex = (activeTipPage - 1) * LIST_PAGE_SIZE;
  const visibleTips = filteredTips.slice(tipStartIndex, tipStartIndex + LIST_PAGE_SIZE);

  const resetFilters = () => {
    setRegionFilter('all');
    setMonthFilter(null);
    setProvinceFilter('all');
    setActivityFilter('all');
    setStayFilter('all');
    setQuery('');
    setProvinceLimit(PROVINCE_LIST_START);
    setDestinationPage(1);
    setWorkshopPage(1);
    setEnterprisePage(1);
    setTipPage(1);
  };

  const toggleMonth = (month: number) => {
    setMonthFilter((current) => (current === month ? null : month));
  };

  const toggleProvinceSort = (key: ProvinceSortKey) => {
    if (provinceSortKey === key) {
      setProvinceSortDesc((current) => !current);
      return;
    }
    setProvinceSortKey(key);
    setProvinceSortDesc(key !== 'provinceName');
  };

  const toggleEnterpriseSort = (key: EnterpriseSortKey) => {
    if (enterpriseSortKey === key) {
      setEnterpriseSortDesc((current) => !current);
      return;
    }
    setEnterpriseSortKey(key);
    setEnterpriseSortDesc(key !== 'name' && key !== 'typeLabel');
  };

  const provinceColumns: Array<{ key: ProvinceSortKey; label: string; numeric: boolean }> = [
    { key: 'provinceName', label: 'จังหวัด', numeric: false },
    { key: 'destinationCount', label: 'แหล่งท่องเที่ยว', numeric: true },
    { key: 'farmstayCount', label: 'ฟาร์มสเตย์', numeric: true },
    { key: 'learningCenterCount', label: 'ศูนย์เรียนรู้', numeric: true },
    { key: 'communityEnterpriseCount', label: 'วิสาหกิจชุมชน', numeric: true },
    { key: 'largeScaleGroupCount', label: 'กลุ่มแปลงใหญ่', numeric: true },
    { key: 'visitorTrips', label: 'เที่ยวชม (ตัวอย่าง)', numeric: true },
    { key: 'incomeBaht', label: 'รายได้ (ตัวอย่าง)', numeric: true },
  ];

  const enterpriseColumns: Array<{ key: EnterpriseSortKey; label: string; numeric: boolean }> = [
    { key: 'name', label: 'ชื่อวิสาหกิจ/กลุ่ม', numeric: false },
    { key: 'typeLabel', label: 'ประเภท', numeric: false },
    { key: 'memberCount', label: 'สมาชิก (คน)', numeric: true },
    { key: 'areaRai', label: 'พื้นที่ (ไร่)', numeric: true },
  ];

  return (
    <div className={styles.container}>
      {/* 1) แบนเนอร์สถานะข้อมูล + แหล่งอ้างอิง */}
      <section
        className={`${styles.banner} ${isSample ? styles.bannerSample : styles.bannerLive}`}
        aria-label="สถานะความพร้อมของข้อมูลการท่องเที่ยวเชิงเกษตร"
      >
        <span className={styles.bannerIcon} aria-hidden="true">
          <Icon name={isSample ? 'info' : 'lock'} size={20} />
        </span>
        <div className={styles.bannerBody}>
          <h2 className={styles.srOnly}>สถานะความพร้อมของข้อมูลและแหล่งอ้างอิง</h2>
          <div className={styles.bannerTopline}>
            <strong>
              {isSample
                ? 'หน้านี้แสดงข้อมูลตัวอย่างเชิงโครงสร้างของการท่องเที่ยวเชิงเกษตร (Deterministic Sample)'
                : 'ข้อมูลจากทะเบียนแหล่งท่องเที่ยวที่ผ่านการตรวจสอบสิทธิ์แล้ว'}
            </strong>
            <span className={styles.bannerTag}>{isSample ? 'SAMPLE DATA' : 'PUBLISHED'}</span>
            <span className={styles.bannerAccess}>{payload.access === 'metadata_only' ? 'metadata_only' : String(payload.access)}</span>
          </div>
          <p>
            จำนวนแหล่งท่องเที่ยวเชิงเกษตร ฟาร์มสเตย์ ศูนย์เรียนรู้ วิสาหกิจชุมชน กลุ่มแปลงใหญ่ เวิร์กช็อป
            ปฏิทินผลไม้ และคำแนะนำการเดินทางในหน้านี้ สร้างจากชุดข้อมูลตัวอย่างที่กำหนดค่าได้แน่นอนเพื่อสาธิตโครงสร้าง
            ยังไม่ใช่สถิติทางการและยังไม่ได้รับสิทธิ์เผยแพร่จากทะเบียนต้นทาง ค่าที่ขาดหายแสดงเป็น “ไม่ระบุ”
            ไม่ถูกแทนด้วยค่าประมาณ
          </p>
          <p className={styles.bannerMeta}>
            <span>อ้างอิงข้อมูลถึง: {formatThaiDate(payload.dataAsOf)}</span>
            <span>สถานะสิทธิ์: {payload.access === 'metadata_only' ? 'รอตรวจสอบสิทธิ์การเผยแพร่' : String(payload.access)}</span>
            <span>
              แหล่งท่องเที่ยว {formatInt(summary.destinationCount)} แห่ง · จังหวัดที่มีข้อมูล{' '}
              {formatInt(summary.provinceCount)} จากทะเบียน 77 จังหวัด
            </span>
          </p>
          <details className={styles.bannerDetails}>
            <summary>
              แหล่งข้อมูล ข้อจำกัดสิทธิ์ และคำเตือน ({intFormatter.format(list(payload.sources).length)} แหล่ง)
            </summary>
            <div className={styles.bannerDetailsBody}>
              {list(payload.warnings).length > 0 ? (
                <ul className={styles.warningList}>
                  {payload.warnings.map((warning, index) => (
                    <li key={`warning-${index}-${warning.slice(0, 24)}`}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <div className={styles.sourceStrip} aria-label="แหล่งข้อมูลอ้างอิง">
                <p className={styles.sourceStripTitle}>
                  <Icon name="book" size={15} /> แหล่งข้อมูลอ้างอิง
                </p>
                <ul className={styles.sourceList}>
                  {list(payload.sources).map((source: AgriTourismSource) => (
                    <li key={source.id} className={styles.sourceItem}>
                      <div className={styles.sourceHead}>
                        <strong className={styles.sourceName}>{source.name}</strong>
                        <span className={`${styles.licenseBadge} ${licenseClass(source.licenseStatus)}`}>
                          <Icon name="lock" size={12} /> {licenseLabel(source.licenseStatus)}
                        </span>
                      </div>
                      <p className={styles.sourceAgency}>{source.agency}</p>
                      <p className={styles.sourceFlags}>
                        <span>
                          {source.publicationApproved === false
                            ? 'ยังไม่อนุมัติให้เผยแพร่ตัวเลข'
                            : 'อนุมัติเผยแพร่แล้ว'}
                        </span>
                        <span>{source.access === 'metadata_only' ? 'เปิดเผยเฉพาะ metadata' : String(source.access)}</span>
                      </p>
                      {list(source.limitations).length > 0 ? (
                        <ul className={styles.sourceLimitList}>
                          {source.limitations.map((limitation, index) => (
                            <li key={`${source.id}-limit-${index}`}>{limitation}</li>
                          ))}
                        </ul>
                      ) : null}
                      {typeof source.sourceUrl === 'string' && source.sourceUrl.length > 0 ? (
                        <a
                          className={styles.sourceLink}
                          href={source.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon name="external" size={13} /> เปิดต้นทาง
                        </a>
                      ) : (
                        <span className={styles.noLink}>ยังไม่เปิด URL สาธารณะ (กันรายการที่สิทธิ์ pending ออกจากเว็บ)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>
      </section>

      {/* 2) KPI จาก summary */}
      <section className={styles.kpiGrid} aria-label="สรุปตัวชี้วัดการท่องเที่ยวเชิงเกษตร (ข้อมูลตัวอย่าง)">
        <h2 className={styles.srOnly}>สรุปตัวชี้วัดการท่องเที่ยวเชิงเกษตร (ข้อมูลตัวอย่าง)</h2>
        {buildKpiModels(summary).map((model) => (
          <KpiCard key={model.key} model={model} />
        ))}
      </section>

      {/* 3) แท็บภูมิภาค */}
      <section className={styles.section} aria-label="ภาพรวมรายภูมิภาค">
        <header className={styles.sectionHeader}>
          <div>
            <h2>เลือกภูมิภาคเพื่อกรองทั้งหน้า</h2>
            <p>
              แท็บภาคกรองแหล่งท่องเที่ยว จังหวัด เวิร์กช็อป วิสาหกิจ และปฏิทินผลไม้พร้อมกัน ใช้ปุ่มลูกศรซ้าย–ขวาเลื่อนแท็บ
            </p>
          </div>
          <span className={styles.sectionCount}>{intFormatter.format(regionTabs.length - 1)} ภาค</span>
        </header>

        <div className={styles.tabBar} role="tablist" aria-label="เลือกภูมิภาค">
          {regionTabs.map((tab) => (
            <button
              key={`region-tab-${String(tab.key)}`}
              type="button"
              role="tab"
              id={`agri-tourism-tab-${String(tab.key)}`}
              aria-selected={regionFilter === tab.key}
              aria-controls={REGION_PANEL_ID}
              className={`${styles.tab} ${regionFilter === tab.key ? styles.tabActive : ''}`}
              onClick={() => setRegionFilter(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, () => setRegionFilter(tab.key))}
            >
              {tab.label}
              <span className={styles.tabCount}>{intFormatter.format(tab.count)}</span>
            </button>
          ))}
        </div>

        <div
          id={REGION_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`agri-tourism-tab-${String(regionFilter)}`}
          tabIndex={0}
          className={styles.regionPanel}
        >
          {activeRegionCard ? (
            <RegionFeatureCard
              card={activeRegionCard}
              monthLabelOf={monthLabelOf}
              activeMonth={monthFilter}
              onMonthToggle={toggleMonth}
            />
          ) : (
            <div className={styles.regionOverviewRow}>
              {list(payload.regionCards).map((card) => (
                <button
                  key={`region-mini-${String(card.region)}`}
                  type="button"
                  className={styles.regionMini}
                  onClick={() => setRegionFilter(card.region)}
                >
                  <strong>{card.regionLabel}</strong>
                  <span>
                    {formatInt(card.destinationCount)} แหล่ง · {formatInt(card.provinceCount)} จังหวัด
                  </span>
                  <span className={styles.regionMiniActivity}>{card.topActivityLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4) ตัวเลือกเดือน/ฤดู */}
      <section className={styles.section} aria-label="ปฏิทินฤดูและการเลือกเดือน">
        <header className={styles.sectionHeader}>
          <div>
            <h2>ฤดูและเดือนที่จะเดินทาง</h2>
            <p>
              เลือกเดือนเพื่อกรองแหล่งท่องเที่ยวและดูผลไม้/เทศกาลของเดือนนั้น คลิกซ้ำเพื่อล้างการเลือก
            </p>
          </div>
          <span className={styles.sectionCount}>
            {monthFilter === null ? 'ยังไม่เลือกเดือน' : `เลือก ${monthLabelOf(monthFilter)}`}
          </span>
        </header>

        <div className={styles.seasonFilterWrap}>
          {seasonGroups.map((group) => (
            <div key={`season-group-${String(group.season)}`} className={styles.seasonGroup}>
              <h3 className={`${styles.seasonGroupTitle} ${seasonClass(group.tone)}`}>
                <Icon name={seasonIconOf(group.tone)} size={14} /> {group.label}
              </h3>
              <div className={styles.chipRow} role="group" aria-label={`เดือนใน${group.label}`}>
                {group.months.map((month) => (
                  <button
                    key={`month-chip-${month}`}
                    type="button"
                    className={`${styles.monthChip} ${monthFilter === month ? styles.monthChipActive : ''}`}
                    aria-pressed={monthFilter === month}
                    onClick={() => toggleMonth(month)}
                  >
                    {monthLabelOf(month)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {uncoveredMonths.length > 0 ? (
            <div className={styles.seasonGroup}>
              <h3 className={`${styles.seasonGroupTitle} ${styles.toneUnknown}`}>เดือนที่ไม่ระบุฤดูในชุดข้อมูล</h3>
              <div className={styles.chipRow} role="group" aria-label="เดือนที่ไม่ระบุฤดู">
                {uncoveredMonths.map((month) => (
                  <button
                    key={`month-chip-extra-${month}`}
                    type="button"
                    className={`${styles.monthChip} ${monthFilter === month ? styles.monthChipActive : ''}`}
                    aria-pressed={monthFilter === month}
                    onClick={() => toggleMonth(month)}
                  >
                    {monthLabelOf(month)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {monthFilter === null ? (
          <div className={styles.seasonCardGrid}>
            {seasonRecommendations.map(({ group, picks }) => (
              <SeasonRecommendationCard
                key={`season-rec-${String(group.season)}`}
                group={group}
                picks={picks}
                monthLabelOf={monthLabelOf}
              />
            ))}
            {seasonRecommendations.length === 0 ? (
              <p className={styles.columnEmpty}>ชุดข้อมูลนี้ยังไม่จัดกลุ่มเดือนตามฤดู</p>
            ) : null}
          </div>
        ) : (
          <div className={styles.monthPanel}>
            <h3 className={styles.monthPanelTitle}>
              <Icon name={seasonIconOf(activeMonthRow ? seasonToneOf(activeMonthRow.season, activeMonthRow.seasonLabel) : 'unknown')} size={15} />{' '}
              {monthLabelOf(monthFilter)}
              {activeMonthRow ? <span className={styles.monthPanelSeason}>{activeMonthRow.seasonLabel}</span> : null}
            </h3>
            {activeMonthRow ? (
              <p className={styles.monthPanelText}>
                {activeMonthRow.highlightText}
                <span className={styles.monthPanelCount}>
                  จำนวนกิจกรรม/เทศกาลในเดือนนี้ {formatInt(activeMonthRow.eventCount)} งาน
                </span>
              </p>
            ) : (
              <p className={styles.monthPanelText}>เดือนนี้ยังไม่มีรายการในปฏิทินผลไม้ของชุดข้อมูลตัวอย่าง</p>
            )}
            {activeMonthFruits.length > 0 ? (
              <ul className={styles.fruitInlineList}>
                {activeMonthFruits.slice(0, 8).map((fruit, index) => (
                  <li
                    key={`month-fruit-${index}-${fruit.name}`}
                    className={`${styles.fruitPill} ${fruit.peak ? styles.fruitPillPeak : ''} ${
                      fruit.festival ? styles.fruitPillFestival : ''
                    }`}
                  >
                    <strong>{fruit.name}</strong>
                    <span>{list(fruit.provinceNames).slice(0, 3).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.columnEmpty}>
                {regionFilter === 'all'
                  ? 'เดือนนี้ไม่ระบุรายการผลไม้ในชุดข้อมูลตัวอย่าง'
                  : 'ไม่มีรายการผลไม้ของภาคที่เลือกในเดือนนี้'}
              </p>
            )}
            {monthPicks.length > 0 ? (
              <ol className={styles.monthPickList}>
                {monthPicks.map((item, index) => (
                  <li key={`month-pick-${item.id}`}>
                    <span className={styles.seasonPickRank} aria-hidden="true">
                      {index + 1}
                    </span>
                    <strong>{item.name}</strong>
                    <span className={styles.monthPickMeta}>
                      {item.kindLabel} · {item.provinceName}
                      {typeof item.distanceFromBangkokKm === 'number'
                        ? ` · ${formatDistance(item.distanceFromBangkokKm)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.columnEmpty}>ไม่พบแหล่งท่องเที่ยวที่ระบุว่าเหมาะกับการเข้าชมเดือนนี้</p>
            )}
          </div>
        )}
      </section>

      {/* 5) การ์ดแหล่งท่องเที่ยว (หัวใจของหน้า) + ตัวกรอง */}
      <section className={styles.section} aria-label="แหล่งท่องเที่ยวเชิงเกษตร">
        <header className={styles.sectionHeader}>
          <div>
            <h2>ทะเบียนแหล่งท่องเที่ยวเชิงเกษตร</h2>
            <p>
              ตัวกรองทำงานบนเครื่องผู้ใช้เท่านั้น ไม่เรียก API เพิ่ม · เปิด “กิจกรรม สิ่งอำนวยความสะดวก”
              ในการ์ดเพื่อดูรายละเอียดการเดินทาง
            </p>
          </div>
          <span className={styles.sectionCount}>
            {intFormatter.format(filteredDestinations.length)} จาก {formatInt(list(payload.destinations).length)} แห่ง
          </span>
        </header>

        <div className={styles.filterGrid}>
          <label className={styles.searchField}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อแหล่งท่องเที่ยว อำเภอ จังหวัด ผลผลิตเด่น หรือกิจกรรม"
              aria-label="ค้นหาแหล่งท่องเที่ยวเชิงเกษตร (ใช้กับการ์ดแหล่งท่องเที่ยวเท่านั้น)"
            />
          </label>

          <label className={styles.selectField}>
            <span>จังหวัด{regionFilter === 'all' ? '' : ` (เฉพาะ${regionLabelOf(regionFilter)})`}</span>
            <select value={activeProvinceCode} onChange={(event) => setProvinceFilter(event.target.value)}>
              <option value="all">ทุกจังหวัด ({intFormatter.format(provinceOptions.length)})</option>
              {provinceOptions.map((row) => (
                <option key={row.provinceCode} value={row.provinceCode}>
                  {row.provinceName} · {row.destinationCount > 0 ? `${formatInt(row.destinationCount)} แห่ง` : 'ไม่มีแหล่ง'}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>ลักษณะการเดินทาง</span>
            <div className={styles.chipRow}>
              <button
                type="button"
                className={`${styles.chip} ${stayFilter === 'all' ? styles.chipActive : ''}`}
                aria-pressed={stayFilter === 'all'}
                onClick={() => setStayFilter('all')}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                className={`${styles.chip} ${stayFilter === 'stay' ? styles.chipActive : ''}`}
                aria-pressed={stayFilter === 'stay'}
                onClick={() => setStayFilter('stay')}
              >
                มีที่พักรับรอง
              </button>
              <button
                type="button"
                className={`${styles.chip} ${stayFilter === 'dayTrip' ? styles.chipActive : ''}`}
                aria-pressed={stayFilter === 'dayTrip'}
                onClick={() => setStayFilter('dayTrip')}
              >
                ไป-กลับวันเดียว
              </button>
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>กิจกรรมที่จัดในแหล่ง</span>
            <div className={styles.chipRow}>
              <button
                type="button"
                className={`${styles.chip} ${activeActivity === 'all' ? styles.chipActive : ''}`}
                aria-pressed={activeActivity === 'all'}
                onClick={() => setActivityFilter('all')}
              >
                ทุกกิจกรรม
              </button>
              {activityOptions.slice(0, 10).map(([id, entry]) => (
                <button
                  key={`activity-chip-${String(id)}`}
                  type="button"
                  className={`${styles.chip} ${activeActivity === id ? styles.chipActive : ''}`}
                  aria-pressed={activeActivity === id}
                  onClick={() => setActivityFilter(id)}
                >
                  {entry.label}
                  <span className={styles.chipCount}>{intFormatter.format(entry.count)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className={styles.resultLine} aria-live="polite">
          <strong>
            {normalizedQuery.length > 0
              ? `ผลการค้นหา “${query.trim()}” ในทะเบียนแหล่งท่องเที่ยว`
              : 'แหล่งท่องเที่ยวที่ตรงกับตัวกรองปัจจุบัน'}
          </strong>
          <span>
            แสดง {intFormatter.format(visibleDestinations.length)} การ์ด
            {filteredDestinations.length > 0
              ? ` (รายการที่ ${intFormatter.format(destinationStartIndex + 1)}–${intFormatter.format(
                  destinationStartIndex + visibleDestinations.length,
                )})`
              : ''}{' '}
            จาก {intFormatter.format(filteredDestinations.length)} แห่งที่ผ่านตัวกรอง
          </span>
          {hasActiveFilters ? (
            <span className={styles.filterEcho}>
              {regionLabelOf(regionFilter)}
              {' · '}
              {monthFilter === null ? 'ทุกเดือน' : monthLabelOf(monthFilter)}
              {' · '}
              {activeProvinceCode === 'all'
                ? 'ทุกจังหวัด'
                : (regionProvinces.find((row) => row.provinceCode === activeProvinceCode)?.provinceName ?? 'ทุกจังหวัด')}
              {' · '}
              {activeActivity === 'all'
                ? 'ทุกกิจกรรม'
                : (activityOptions.find(([id]) => id === activeActivity)?.[1].label ?? 'ทุกกิจกรรม')}
              {' · '}
              {stayFilter === 'all' ? 'ทุกลักษณะเดินทาง' : stayFilter === 'stay' ? 'มีที่พักรับรอง' : 'ไป-กลับวันเดียว'}
            </span>
          ) : null}
          {hasActiveFilters ? (
            <button type="button" className={styles.resetButton} onClick={resetFilters}>
              <Icon name="close" size={14} /> ล้างตัวกรองทั้งหมด
            </button>
          ) : null}
        </p>

        {filteredDestinations.length > 0 ? (
          <>
            <div className={styles.destGrid}>
              {visibleDestinations.map((destination) => (
                <DestinationCard
                  key={destination.id}
                  destination={destination}
                  monthLabelOf={monthLabelOf}
                  activeMonth={monthFilter}
                  onMonthToggle={toggleMonth}
                />
              ))}
            </div>
            <Pagination
              page={activeDestinationPage}
              pageCount={destinationPageCount}
              total={filteredDestinations.length}
              startIndex={destinationStartIndex}
              shownCount={visibleDestinations.length}
              unit="แห่ง"
              label="แบ่งหน้าทะเบียนแหล่งท่องเที่ยว"
              onChange={setDestinationPage}
            />
          </>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบแหล่งท่องเที่ยวที่ตรงกับเงื่อนไข</h3>
            <p>
              ลองล้างคำว่า “{query.trim() || 'คำค้น'}” ออก เปลี่ยนเดือนเป็นช่วงอื่นของฤดูเดียวกัน
              หรือเลือกภาคเป็น “ทั้งหมด” เพราะบางกิจกรรมมีเฉพาะบางจังหวัดในฤดูกาลของมัน
              และรายการที่ยังไม่ยืนยันสิทธิ์เผยแพร่จะไม่ถูกนำมาแสดงในทะเบียนนี้
            </p>
            {hasActiveFilters ? (
              <button type="button" className={styles.resetButton} onClick={resetFilters}>
                <Icon name="close" size={14} /> ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* 6) ปฏิทินฤดูผลไม้/เทศกาลเก็บเกี่ยว */}
      <section className={styles.section} aria-label="ปฏิทินฤดูผลไม้และเทศกาลเก็บเกี่ยว">
        <header className={styles.sectionHeader}>
          <div>
            <h2>ปฏิทินผลไม้และเทศกาลเก็บเกี่ยว 12 เดือน</h2>
            <p>
              กรอบทึบ = ช่วงให้ผลมากสุด · กรอบเส้นประ = เดือนที่มีเทศกาลเก็บเกี่ยว · จังหวัดคือแหล่งผลิตตามทะเบียน
            </p>
          </div>
          <span className={styles.sectionCount}>
            เดือนที่มีเทศกาล {intFormatter.format(calendarFestivalTotal)} จาก {intFormatter.format(calendarRows.length)} เดือน
          </span>
        </header>

        {calendarRows.length > 0 ? (
          <div className={styles.tableScroll} role="region" aria-label="ตารางปฏิทินผลไม้รายเดือน" tabIndex={0}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                ปฏิทินผลไม้รายเดือน ระบุฤดู ผลไม้ที่ใหผลัดช่วง เทศกาลเก็บเกี่ยว จำนวนงานส่งเสริมและข้อสังเกตของเดือน
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.thMonth}>เดือน / ฤดู</th>
                  <th scope="col" className={styles.thFruits}>ผลไม้และผลผลิตตามฤดู</th>
                  <th scope="col" className={styles.thNumeric}>งานส่งเสริม</th>
                  <th scope="col">ข้อสังเกตของเดือน</th>
                </tr>
              </thead>
              <tbody>
                {calendarRows.map(({ row, month, fruits, peakCount, festivalCount }) => {
                  const tone = seasonToneOf(row.season, row.seasonLabel);
                  const active = monthFilter !== null && monthFilter === month;
                  return (
                    <tr key={`calendar-${month}`} className={active ? styles.rowActive : undefined}>
                      <th scope="row" className={styles.monthCell}>
                        <button
                          type="button"
                          className={`${styles.monthRowButton} ${active ? styles.monthRowButtonActive : ''}`}
                          aria-pressed={active}
                          onClick={() => toggleMonth(month)}
                        >
                          <span className={styles.monthRowName}>{row.monthLabel}</span>
                          <span className={`${styles.seasonTag} ${seasonClass(tone)}`}>
                            <Icon name={seasonIconOf(tone)} size={12} /> {row.seasonLabel}
                          </span>
                        </button>
                      </th>
                      <td>
                        {fruits.length > 0 ? (
                          <ul className={styles.fruitList}>
                            {fruits.slice(0, 6).map((fruit, index) => (
                              <li
                                key={`fruit-${month}-${index}-${fruit.name}`}
                                className={`${styles.fruitPill} ${fruit.peak ? styles.fruitPillPeak : ''} ${
                                  fruit.festival ? styles.fruitPillFestival : ''
                                }`}
                              >
                                <strong>{fruit.name}</strong>
                                {fruit.peak ? <em className={styles.fruitMark}>ให้ผลมากสุด</em> : null}
                                {fruit.festival ? <em className={styles.fruitMark}>เทศกาล</em> : null}
                                <span className={styles.fruitProvinces}>
                                  {list(fruit.provinceNames).slice(0, 3).join(', ')}
                                  {list(fruit.provinceNames).length > 3
                                    ? ` +${intFormatter.format(list(fruit.provinceNames).length - 3)}`
                                    : ''}
                                </span>
                              </li>
                            ))}
                            {fruits.length > 6 ? (
                              <li className={styles.fruitMore}>
                                อีก {intFormatter.format(fruits.length - 6)} รายการ
                              </li>
                            ) : null}
                          </ul>
                        ) : (
                          <span className={styles.noneValue}>
                            {regionFilter === 'all' ? 'ไม่ระบุผลไม้ของเดือนนี้' : 'ไม่มีผลไม้ในภาคที่เลือกเดือนนี้'}
                          </span>
                        )}
                        {fruits.length > 0 ? (
                          <p className={styles.fruitSummary}>
                            ให้ผลมากสุด {intFormatter.format(peakCount)} ชนิด · เทศกาล{' '}
                            {intFormatter.format(festivalCount)} ชนิด
                          </p>
                        ) : null}
                      </td>
                      <td className={styles.numeric}>{formatInt(row.eventCount)} งาน</td>
                      <td className={styles.textCell}>{row.highlightText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ยังไม่มีปฏิทินผลไม้</h3>
            <p>ชุดข้อมูลนี้ยังไม่ส่งรายการรายเดือนมา จึงแสดงเฉพาะทะเบียนแหล่งท่องเที่ยวและเวิร์กช็อป</p>
          </div>
        )}
      </section>

      {/* 7) เวิร์กช็อปชุมชน */}
      <section className={styles.section} aria-label="เวิร์กช็อปและหลักสูตรฝึกอบรมชุมชน">
        <header className={styles.sectionHeader}>
          <div>
            <h2>เวิร์กช็อปและหลักสูตรระยะสั้นในชุมชน</h2>
            <p>ค่าใช้จ่ายและความจุเป็นค่าตัวอย่าง ต้องยืนยันกับผู้จัดจริงก่อนลงทะเบียน</p>
          </div>
          <span className={styles.sectionCount}>
            {intFormatter.format(filteredWorkshops.length)} หลักสูตร
          </span>
        </header>

        {filteredWorkshops.length > 0 ? (
          <>
            <div className={styles.workshopGrid}>
              {visibleWorkshops.map((workshop) => (
                <WorkshopCard key={workshop.id} workshop={workshop} monthLabelOf={monthLabelOf} />
              ))}
            </div>
            <Pagination
              page={activeWorkshopPage}
              pageCount={workshopPageCount}
              total={filteredWorkshops.length}
              startIndex={workshopStartIndex}
              shownCount={visibleWorkshops.length}
              unit="หลักสูตร"
              label="แบ่งหน้าเวิร์กช็อปและหลักสูตรชุมชน"
              onChange={setWorkshopPage}
            />
          </>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบเวิร์กช็อปในเดือนหรือกิจกรรมที่เลือก</h3>
            <p>
              ชุมชนมักเปิดอบรมตามฤดูกาลผลิตของผลผลิตหลัก ลองล้างการเลือกเดือน หรือเปลี่ยนภาคเพื่อดูหลักสูตรของพื้นที่อื่น
            </p>
            {hasActiveFilters ? (
              <button type="button" className={styles.resetButton} onClick={resetFilters}>
                <Icon name="close" size={14} /> ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* 8) ทะเบียนวิสาหกิจชุมชน / กลุ่มแปลงใหญ่ */}
      <section className={styles.section} aria-label="ทะเบียนวิสาหกิจชุมชนและกลุ่มแปลงใหญ่">
        <header className={styles.sectionHeader}>
          <div>
            <h2>ทะเบียนวิสาหกิจชุมชนและกลุ่มแปลงใหญ่</h2>
            <p>
              คลิกหัวคอลัมน์เพื่อเรียงลำดับ · จำนวนสมาชิก (คน) และพื้นที่ (ไร่) เป็นคนละหน่วยนับกับจำนวนแหล่งท่องเที่ยว
            </p>
          </div>
          <span className={styles.sectionCount}>
            {intFormatter.format(visibleEnterprises.length)} จาก{' '}
            {intFormatter.format(filteredEnterprises.length)} รายการ
          </span>
        </header>

        {filteredEnterprises.length > 0 ? (
          <>
            <div className={styles.tableScroll} role="region" aria-label="ตารางทะเบียนวิสาหกิจชุมชน" tabIndex={0}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                ทะเบียนวิสาหกิจชุมชนและกลุ่มแปลงใหญ่ ระบุประเภท จังหวัด สินค้า สมาชิก พื้นที่ มาตรฐานรับรอง
                และกิจกรรมท่องเที่ยวที่เปิดให้เข้าชม
              </caption>
              <thead>
                <tr>
                  {enterpriseColumns.map((column) => (
                    <th
                      key={`enterprise-col-${column.key}`}
                      scope="col"
                      aria-sort={
                        enterpriseSortKey === column.key
                          ? enterpriseSortDesc
                            ? 'descending'
                            : 'ascending'
                          : 'none'
                      }
                      className={column.numeric ? styles.thNumeric : undefined}
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleEnterpriseSort(column.key)}
                      >
                        {column.label}
                        <SortGlyph active={enterpriseSortKey === column.key} desc={enterpriseSortDesc} />
                      </button>
                    </th>
                  ))}
                  <th scope="col">จังหวัด</th>
                  <th scope="col">สินค้า/ผลิตภัณฑ์</th>
                  <th scope="col">มาตรฐานรับรอง</th>
                  <th scope="col">กิจกรรมท่องเที่ยว</th>
                </tr>
              </thead>
              <tbody>
                {visibleEnterprises.map((item: AgriTourismEnterprise) => (
                  <tr key={item.id}>
                    <th scope="row" className={styles.nameCell}>
                      <span className={styles.rowName}>{item.name}</span>
                      <span className={styles.rowSub}>{item.id}</span>
                    </th>
                    <td>
                      <span className={`${styles.kindPill} ${styles.kindPillSoft}`}>{item.typeLabel}</span>
                    </td>
                    <td className={styles.numeric}>{formatInt(item.memberCount)}</td>
                    <td className={styles.numeric}>{formatInt(item.areaRai)}</td>
                    <td className={styles.textCell}>
                      {item.provinceName}
                      <span className={styles.rowSub}> ({item.provinceCode})</span>
                    </td>
                    <td className={styles.textCell}>
                      {list(item.products).length > 0 ? item.products.join(', ') : <span className={styles.noneValue}>ไม่ระบุสินค้า</span>}
                    </td>
                    <td className={styles.textCell}>
                      {list(item.certifiedStandards).length > 0 ? (
                        <span className={styles.badgeRow}>
                          {item.certifiedStandards.map((standard) => (
                            <span key={`${item.id}-std-${standard}`} className={styles.amenityBadge}>
                              {standard}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={styles.noneValue}>รอตรวจสอบมาตรฐาน</span>
                      )}
                    </td>
                    <td className={styles.textCell}>
                      {list(item.tourActivities).length > 0 ? (
                        <span className={styles.tagRow}>
                          {item.tourActivities.map((activity: ActivityId) => (
                            <span key={`${item.id}-act-${String(activity)}`} className={styles.activityTag}>
                              {String(activity).replace(/[_-]+/g, ' ')}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={styles.noneValue}>ยังไม่เปิดให้เข้าชมเป็นกิจกรรม</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <Pagination
              page={activeEnterprisePage}
              pageCount={enterprisePageCount}
              total={filteredEnterprises.length}
              startIndex={enterpriseStartIndex}
              shownCount={visibleEnterprises.length}
              unit="รายการ"
              label="แบ่งหน้าทะเบียนวิสาหกิจชุมชนและกลุ่มแปลงใหญ่"
              onChange={setEnterprisePage}
            />
          </>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบวิสาหกิจชุมชนที่ตรงกับเงื่อนไข</h3>
            <p>ภาคหรือจังหวัดที่เลือกยังไม่มีรายการในทะเบียนตัวอย่าง ลองเลือก “ทั้งหมด” หรือล้างตัวกรองกิจกรรม</p>
            {hasActiveFilters ? (
              <button type="button" className={styles.resetButton} onClick={resetFilters}>
                <Icon name="close" size={14} /> ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* 9) ตารางรายจังหวัด */}
      <section className={styles.section} aria-label="สถิติรายจังหวัด">
        <header className={styles.sectionHeader}>
          <div>
            <h2>รายชื่อจังหวัดและศักยภาพการท่องเที่ยวเชิงเกษตร</h2>
            <p>
              นับเฉพาะจังหวัดที่มีข้อมูลในชุดนี้ · 77 จังหวัดเป็นทะเบียนอ้างอิง ไม่ใช่ coverage · เที่ยวชมและรายได้เป็นค่าประเมินตัวอย่าง
            </p>
          </div>
          <span className={styles.sectionCount}>
            {intFormatter.format(sortedProvinces.length)} จังหวัดที่ผ่านตัวกรองภาค
          </span>
        </header>

        {sortedProvinces.length > 0 ? (
          <>
            <div className={styles.tableScroll} role="region" aria-label="ตารางรายจังหวัด" tabIndex={0}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  สถิติรายจังหวัด จำนวนแหล่งท่องเที่ยว ฟาร์มสเตย์ ศูนย์เรียนรู้ วิสาหกิจชุมชน กลุ่มแปลงใหญ่
                  ฤดูท่องเที่ยวหลัก เดือนที่มีเทศกาลผลไม้ และค่าประเมินเที่ยวชมกับรายได้
                </caption>
                <thead>
                  <tr>
                    {provinceColumns.map((column) => (
                      <th
                        key={`province-col-${column.key}`}
                        scope="col"
                        aria-sort={
                          provinceSortKey === column.key
                            ? provinceSortDesc
                              ? 'descending'
                              : 'ascending'
                            : 'none'
                        }
                        className={column.numeric ? styles.thNumeric : styles.thName}
                      >
                        <button
                          type="button"
                          className={styles.sortButton}
                          onClick={() => toggleProvinceSort(column.key)}
                        >
                          {column.label}
                          <SortGlyph active={provinceSortKey === column.key} desc={provinceSortDesc} />
                        </button>
                      </th>
                    ))}
                    <th scope="col">ฤดูท่องเที่ยวหลัก</th>
                    <th scope="col">เดือนที่มีเทศกาลผลไม้</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProvinces.map((row: AgriTourismProvinceStat) => (
                    <tr
                      key={row.provinceCode}
                      className={activeProvinceCode === row.provinceCode ? styles.rowActive : undefined}
                    >
                      <th scope="row" className={styles.nameCell}>
                        <button
                          type="button"
                          className={styles.provinceButton}
                          aria-pressed={activeProvinceCode === row.provinceCode}
                          onClick={() => setProvinceFilter(row.provinceCode)}
                        >
                          {row.provinceName}
                        </button>
                        <span className={styles.rowSub}>
                          {row.provinceCode} · {row.regionLabel}
                        </span>
                      </th>
                      <td className={`${styles.numeric} ${styles.numericStrong}`}>
                        {formatInt(row.destinationCount)}
                        <Bar
                          value={percentOf(row.destinationCount, provinceTotals.destinationCount)}
                          tone="forest"
                        />
                      </td>
                      <td className={styles.numeric}>{formatInt(row.farmstayCount)}</td>
                      <td className={styles.numeric}>{formatInt(row.learningCenterCount)}</td>
                      <td className={styles.numeric}>{formatInt(row.communityEnterpriseCount)}</td>
                      <td className={styles.numeric}>{formatInt(row.largeScaleGroupCount)}</td>
                      <td className={styles.numeric}>{formatInt(row.visitorTrips)}</td>
                      <td className={styles.numeric}>{formatBaht(row.incomeBaht)}</td>
                      <td className={styles.textCell}>
                        <span className={`${styles.seasonTag} ${seasonClass(seasonToneOf(row.peakSeason, row.peakSeasonLabel))}`}>
                          <Icon
                            name={seasonIconOf(seasonToneOf(row.peakSeason, row.peakSeasonLabel))}
                            size={12}
                          />{' '}
                          {row.peakSeasonLabel}
                        </span>
                      </td>
                      <td className={styles.textCell}>
                        <MonthChipStrip months={list(row.fruitFestivalMonths)} monthLabelOf={monthLabelOf} limit={4} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">รวมทั้งที่กรอง</th>
                    <td className={`${styles.numeric} ${styles.numericStrong}`}>
                      {formatInt(provinceTotals.destinationCount)}
                    </td>
                    <td className={styles.numeric}>{formatInt(provinceTotals.farmstayCount)}</td>
                    <td className={styles.numeric}>{formatInt(provinceTotals.learningCenterCount)}</td>
                    <td className={styles.numeric}>{formatInt(provinceTotals.communityEnterpriseCount)}</td>
                    <td className={styles.numeric}>{formatInt(provinceTotals.largeScaleGroupCount)}</td>
                    <td className={styles.numeric}>{formatInt(provinceTotals.visitorTrips)}</td>
                    <td className={styles.numeric}>{formatBaht(provinceTotals.incomeBaht)}</td>
                    <td className={styles.textCell}>—</td>
                    <td className={styles.textCell}>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className={styles.limitRow}>
              <p className={styles.moreNote} aria-live="polite">
                แสดง {intFormatter.format(visibleProvinces.length)} จาก {intFormatter.format(sortedProvinces.length)}{' '}
                จังหวัด (เรียงตาม{provinceColumns.find((column) => column.key === provinceSortKey)?.label ?? 'จังหวัด'})
              </p>
              {visibleProvinces.length < sortedProvinces.length ? (
                <button
                  type="button"
                  className={styles.moreButton}
                  onClick={() => setProvinceLimit((current) => current + PROVINCE_LIST_STEP)}
                >
                  <Icon name="chevronDown" size={15} /> แสดงเพิ่มเติม
                  {intFormatter.format(
                    Math.min(PROVINCE_LIST_STEP, sortedProvinces.length - visibleProvinces.length),
                  )}{' '}
                  จังหวัด
                </button>
              ) : (
                <button type="button" className={styles.moreButton} onClick={() => setProvinceLimit(PROVINCE_LIST_START)}>
                  ย่อเหลือ {intFormatter.format(PROVINCE_LIST_START)} จังหวัด
                </button>
              )}
            </div>
          </>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบจังหวัดในเงื่อนไขนี้</h3>
            <p>ภาคที่เลือกยังไม่มีสถิติจังหวัดในชุดข้อมูลตัวอย่าง ลองเลือก “ทั้งหมด” เพื่อดูตารางทั้งประเทศ</p>
            {hasActiveFilters ? (
              <button type="button" className={styles.resetButton} onClick={resetFilters}>
                <Icon name="close" size={14} /> ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* 10) คำแนะนำการเดินทางรายฤดู */}
      <section className={styles.section} aria-label="คำแนะนำการเดินทาง">
        <header className={styles.sectionHeader}>
          <div>
            <h2>คำแนะนำการเดินทางตามฤดูและภูมิภาค</h2>
            <p>
              ใช้ประกอบวางแผนเท่านั้น ไม่ใช่ประกาศจากหน่วยงาน · ขอบเขตเป็นรายภาคตามที่ข้อมูลต้นทางระบุ
            </p>
          </div>
          <span className={styles.sectionCount}>{intFormatter.format(filteredTips.length)} ข้อแนะนำ</span>
        </header>

        {filteredTips.length > 0 ? (
          <>
            <div className={styles.tipGrid}>
              {visibleTips.map((tip) => (
                <TipCard key={tip.id} tip={tip} monthLabelOf={monthLabelOf} regionLabelOf={regionLabelOf} />
              ))}
            </div>
            <Pagination
              page={activeTipPage}
              pageCount={tipPageCount}
              total={filteredTips.length}
              startIndex={tipStartIndex}
              shownCount={visibleTips.length}
              unit="ข้อแนะนำ"
              label="แบ่งหน้าคำแนะนำการเดินทาง"
              onChange={setTipPage}
            />
          </>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่มีคำแนะนำสำหรับภาคที่เลือก</h3>
            <p>เลือกภูมิภาคเป็น “ทั้งหมด” เพื่อดูคำแนะนำรายฤดูที่ครอบคลุมทั้งประเทศ</p>
            {hasActiveFilters ? (
              <button type="button" className={styles.resetButton} onClick={resetFilters}>
                <Icon name="close" size={14} /> ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        )}
      </section>

      {/* 11) ข้อความกำกับท้ายแดชบอร์ด */}
      <section className={styles.disclosure} aria-label="ข้อกำกับการใช้ข้อมูล">
        <h2 className={styles.disclosureTitle}>
          <Icon name="lock" size={16} /> ข้อกำกับท้ายแดชบอร์ด
        </h2>
        <p>
          {isSample
            ? `ทุกตัวเลขในหน้านี้เป็นข้อมูลตัวอย่างเชิงโครงสร้าง (สถานะ sample) เปิดเผยเฉพาะระดับ ${payload.access === 'metadata_only' ? 'metadata' : String(payload.access)} อ้างอิงข้อมูลถึง ${formatThaiDate(payload.dataAsOf)}`
            : `ข้อมูลนี้ผ่านการตรวจสอบสิทธิ์แล้ว อ้างอิงถึง ${formatThaiDate(payload.dataAsOf)}`}
        </p>
        <p>
          ห้ามอ้างอิงจำนวนแหล่งท่องเที่ยว ฟาร์มสเตย์ ศูนย์เรียนรู้ วิสาหกิจชุมชน กลุ่มแปลงใหญ่ ผู้เที่ยวชม และรายได้
          ในเอกสารทางกฎหมาย หนังสือราชการ หรือการของบประมาณ · หน่วยนับของแต่ละทะเบียนแยกกัน ไม่บวกข้ามทะเบียน
          และค่าที่ไม่ยืนยันแสดงเป็น “ไม่ระบุ” เท่านั้น
        </p>
        <p className={styles.disclosureStamp}>
          รายการที่แสดง: แหล่งท่องเที่ยว {formatInt(list(payload.destinations).length)} · จังหวัด{' '}
          {formatInt(list(payload.provinceStats).length)} · วิสาหกิจ/กลุ่ม {formatInt(list(payload.enterprises).length)} ·
          เวิร์กช็อป {formatInt(list(payload.workshops).length)} · ปฏิทิน {intFormatter.format(calendarRows.length)} เดือน ·
          คำแนะนำ {formatInt(list(payload.travelTips).length)} ข้อ · แหล่งอ้างอิง {formatInt(list(payload.sources).length)} แห่ง
        </p>
      </section>
    </div>
  );
}
