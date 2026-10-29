'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  CertStatus,
  CertificateRecord,
  CommodityCertBoard,
  FoodSafetyDashboardPayload,
  MandateType,
  ProvinceCertStat,
  RegionKey,
  ResidueLabStat,
  StandardDef,
  StandardId,
  TraceabilityLot,
} from '@/lib/hub/food-safety-data';
import { Icon, type IconName } from './icon';
import styles from './food-safety-dashboard.module.css';

/* ------------------------------------------------------------------ *
 * ประเภทเสริมจาก payload (ไม่ต้อง import เพิ่มจาก data lane)
 * ------------------------------------------------------------------ */
type SourceEntry = FoodSafetyDashboardPayload['sources'][number];
type ChainStage = TraceabilityLot['chain'][number];
type ProvinceSortKey =
  | 'provinceName'
  | 'totalCertifiedFarmCount'
  | 'gapFarmCount'
  | 'organicFarmCount'
  | 'passRate'
  | 'traceabilityRate';
type RateBand = 'good' | 'watch' | 'risk' | 'unknown';

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const rateFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const PAGE_SIZE = 12;
const TABLE_PAGE_SIZE = 20;

/* ------------------------------------------------------------------ *
 * ตัวช่วยคำนวณ/รูปแบบ (guard การหารศูนย์และค่าไม่ว่างเสมอ)
 * ------------------------------------------------------------------ */
function toFinite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** อัตราส่วนเป็นเปอร์เซ็นต์ ปลอดภัยเมื่อตัวส่วนเป็น 0 */
function percentOf(numerator: number, denominator: number): number {
  const n = toFinite(numerator);
  const d = toFinite(denominator);
  if (d <= 0) return 0;
  return clampPercent((n / d) * 100);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** ค่าตัวเลขของคอลัมน์ที่เรียงได้ — switch ครบทุกกรณี ไม่ต้องพึ่ง type narrowing */
function metricOf(row: ProvinceCertStat, key: ProvinceSortKey): number {
  switch (key) {
    case 'totalCertifiedFarmCount':
      return toFinite(row.totalCertifiedFarmCount);
    case 'gapFarmCount':
      return toFinite(row.gapFarmCount);
    case 'organicFarmCount':
      return toFinite(row.organicFarmCount);
    case 'passRate':
      return toFinite(row.passRate);
    case 'traceabilityRate':
      return toFinite(row.traceabilityRate);
    case 'provinceName':
      return 0;
  }
}

function rateBandOf(value: number | null | undefined): RateBand {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
  if (value >= 80) return 'good';
  if (value >= 60) return 'watch';
  return 'risk';
}

function bandClass(band: RateBand): string {
  if (band === 'good') return styles.bandGood;
  if (band === 'watch') return styles.bandWatch;
  if (band === 'risk') return styles.bandRisk;
  return styles.bandUnknown;
}

function rateLabel(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'ไม่มีข้อมูล';
  return `${rateFormatter.format(clampPercent(value))}%`;
}

/** แปลงวันที่ ISO (YYYY-MM-DD) เป็นไทยพุทธศักราชโดยไม่อาศัย timezone */
function formatDate(value: unknown): string {
  if (typeof value !== 'string') return 'ไม่ระบุวันที่';
  const matched = ISO_DATE.exec(value);
  if (!matched) return value.length > 0 ? value : 'ไม่ระบุวันที่';
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value;
  const monthName = THAI_MONTHS[month - 1] ?? String(month);
  return `${day} ${monthName} ${year + 543}`;
}

function formatDateTime(value: unknown): string {
  if (typeof value !== 'string') return 'ไม่ระบุช่วงเวลาสร้างข้อมูล';
  const datePart = formatDate(value);
  const time = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(value);
  if (!time) return datePart;
  return `${datePart} ${time[1] ?? ''}:${time[2] ?? ''} น.`;
}

/** ชื่อมาตรฐาน/ฉลากระเบียบจากข้อมูลจริงของ 5A เท่านั้น */
const STANDARD_ICONS = new Map<StandardId, IconName>([
  ['gap_crop', 'leaf'],
  ['gap_livestock', 'animal'],
  ['gap_fishery', 'fish'],
  ['organic_thailand', 'layers'],
  ['chemical_residue', 'chart'],
]);

const CHAIN_ORDER: ChainStage['stage'][] = ['farm', 'collection', 'packing', 'transport', 'retail'];

/** ฉลากภาษาไทยของกลุ่มสินค้า — ถ้า data lane ส่ง id แปลกมาจะแสดง id เดิม ไม่เดาชื่อใหม่ */
const GROUP_LABEL_TH = new Map<string, string>([
  ['fruit', 'ผลไม้'],
  ['fruits', 'ผลไม้'],
  ['fruit_crops', 'ผลไม้'],
  ['rice', 'ข้าว'],
  ['grain', 'ข้าวและธัญพืช'],
  ['grains', 'ข้าวและธัญพืช'],
  ['cereal', 'ข้าวและธัญพืช'],
  ['cereals', 'ข้าวและธัญพืช'],
  ['vegetable', 'ผัก'],
  ['vegetables', 'ผักและสมุนไพร'],
  ['herb', 'ผักและสมุนไพร'],
  ['field_crop', 'พืชไร่'],
  ['field_crops', 'พืชไร่'],
  ['crop', 'พืช'],
  ['crops', 'พืช'],
  ['livestock', 'ปศุสัตว์'],
  ['poultry', 'สัตว์ปีก'],
  ['fishery', 'ประมง'],
  ['aquaculture', 'สัตว์น้ำ'],
  ['processed', 'สินค้าแปรรูป'],
  ['other', 'สินค้าอื่น'],
]);

function groupLabelOf(groupId: string): string {
  const known = GROUP_LABEL_TH.get(groupId);
  if (known) return known;
  return groupId.replace(/[_-]+/g, ' ').trim() || 'กลุ่มอื่น ๆ';
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** สุ่มแบบ deterministic จาก lotCode — ไม่ต้องเรียกเซิร์ฟเวอร์ QR ภายนอก */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 2246822519;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967295;
  };
}

/* ------------------------------------------------------------------ *
 * ส่วนประกอบย่อย: badge มาตรฐานบังคับ / สมัครใจ
 * ------------------------------------------------------------------ */
function looksMandatory(typeValue: MandateType, label: string): boolean {
  const text = `${typeValue} ${label}`.toLowerCase();
  return text.includes('mandator') || text.includes('compulsor') || text.includes('บังคับ');
}

function MandateBadge({ typeValue, label }: { typeValue: MandateType; label: string }) {
  const mandatory = looksMandatory(typeValue, label);
  return (
    <span
      className={`${styles.mandateBadge} ${mandatory ? styles.mandateRequired : styles.mandateVoluntary}`}
    >
      <span className={styles.mandateGlyph} aria-hidden="true">
        {mandatory ? (
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 3l8 4v6c0 5-3.4 7.4-8 8-4.6-.6-8-3-8-8V7z" />
            <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="8.4" />
            <path d="M8.4 12.2l2.4 2.4 4.8-5" />
          </svg>
        )}
      </span>
      {label}
    </span>
  );
}

function StatusBadge({ status, label }: { status: CertStatus; label: string }) {
  const tone =
    status === 'active'
      ? styles.statusActive
      : status === 'suspended'
        ? styles.statusSuspended
        : status === 'expired'
          ? styles.statusExpired
          : styles.statusPending;
  return <span className={`${styles.statusBadge} ${tone}`}>{label}</span>;
}

/* ------------------------------------------------------------------ *
 * ส่วนประกอบย่อย: แถบและวงแหวน
 * ------------------------------------------------------------------ */
function Bar({
  value,
  tone = 'forest',
  caption,
}: {
  value: number;
  tone?: 'forest' | 'pass' | 'fail' | 'amber';
  caption?: string;
}) {
  const width = clampPercent(value);
  const toneClass =
    tone === 'pass'
      ? styles.barPass
      : tone === 'fail'
        ? styles.barFail
        : tone === 'amber'
          ? styles.barAmber
          : styles.barForest;
  return (
    <span className={styles.barTrack} role="presentation">
      <span className={`${styles.barFill} ${toneClass}`} style={{ width: `${width}%` }} />
      {caption ? <span className={styles.barCaption}>{caption}</span> : null}
    </span>
  );
}

function SplitBar({ pass, fail, pending }: { pass: number; fail: number; pending: number }) {
  const total = Math.max(pass + fail + pending, 1);
  return (
    <span className={styles.splitTrack} role="presentation">
      <span className={styles.splitPass} style={{ width: `${(pass / total) * 100}%` }} />
      <span className={styles.splitFail} style={{ width: `${(fail / total) * 100}%` }} />
      <span className={styles.splitPending} style={{ width: `${(pending / total) * 100}%` }} />
    </span>
  );
}

function Gauge({ value, caption }: { value: number; caption: string }) {
  const percent = clampPercent(value);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;
  const band = rateBandOf(percent);
  const gaugeClass =
    band === 'good' ? styles.gaugeGood : band === 'watch' ? styles.gaugeWatch : styles.gaugeRisk;
  return (
    <span className={styles.gaugeWrap}>
      <svg viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={`${caption} ${rateLabel(percent)}`}>
        <circle cx="32" cy="32" r={radius} className={styles.gaugeTrack} strokeWidth="8" fill="none" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          className={`${styles.gaugeValue} ${gaugeClass}`}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="36" textAnchor="middle" className={styles.gaugeText}>
          {rateFormatter.format(percent)}
        </text>
      </svg>
    </span>
  );
}

/** ภาพแทน QR ที่สร้างจาก lotCode อย่าง deterministic (ไม่มี network call) */
function QrPlaceholder({ value }: { value: string }) {
  const modules = 21;
  const random = makeRandom(hashText(value));
  const dark: string[] = [];
  for (let y = 0; y < modules; y += 1) {
    for (let x = 0; x < modules; x += 1) {
      const inFinder =
        (x < 7 && y < 7) || (x >= modules - 7 && y < 7) || (x < 7 && y >= modules - 7);
      if (inFinder) continue;
      if (random() > 0.53) dark.push(`${x},${y}`);
    }
  }
  const cell = 4;
  const quiet = 2;
  const size = (modules + quiet * 2) * cell;
  const finderAt = (fx: number, fy: number, key: string) => (
    <g key={key}>
      <rect x={(fx + quiet) * cell} y={(fy + quiet) * cell} width={7 * cell} height={7 * cell} className={styles.qrDark} />
      <rect
        x={(fx + quiet + 1) * cell}
        y={(fy + quiet + 1) * cell}
        width={5 * cell}
        height={5 * cell}
        className={styles.qrLight}
      />
      <rect
        x={(fx + quiet + 2) * cell}
        y={(fy + quiet + 2) * cell}
        width={3 * cell}
        height={3 * cell}
        className={styles.qrDark}
      />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={styles.qrSvg} role="img" aria-label={`ภาพแทน QR ของล็อต ${value}`}>
      <rect x="0" y="0" width={size} height={size} className={styles.qrLight} />
      {dark.map((pair) => {
        const [x, y] = pair.split(',');
        return (
          <rect
            key={pair}
            x={(Number(x) + quiet) * cell}
            y={(Number(y) + quiet) * cell}
            width={cell}
            height={cell}
            className={styles.qrDark}
          />
        );
      })}
      {finderAt(0, 0, 'finder-tl')}
      {finderAt(modules - 7, 0, 'finder-tr')}
      {finderAt(0, modules - 7, 'finder-bl')}
    </svg>
  );
}

/** แบ่งหน้าลิสต์การ์ด/ตาราง: ยุบหน้าให้อยู่ในช่วงเสมอแม้ผลลัพธ์จะเปลี่ยนหลังค้นหา */
function Pager({
  page,
  pageCount,
  onChange,
  label,
  status,
}: {
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
  label: string;
  status: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.pager} aria-label={label}>
      <button
        type="button"
        className={styles.pagerButton}
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        ← ก่อนหน้า
      </button>
      <span className={styles.pagerStatus} aria-live="polite">
        หน้า {intFormatter.format(page)} จาก {intFormatter.format(pageCount)} · {status}
      </span>
      <button
        type="button"
        className={styles.pagerButton}
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
      >
        ถัดไป →
      </button>
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * ส่วนประกอบย่อย: การ์ด
 * ------------------------------------------------------------------ */
function KpiCard({
  title,
  iconName,
  value,
  unit,
  children,
  wide = false,
}: {
  title: string;
  iconName: IconName;
  value: string;
  unit?: string;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <article className={`${styles.kpiCard} ${wide ? styles.kpiCardWide : ''}`}>
      <div className={styles.kpiHead}>
        <span className={styles.kpiIcon} aria-hidden="true">
          <Icon name={iconName} size={16} />
        </span>
        <h3 className={styles.kpiTitle}>{title}</h3>
      </div>
      <p className={styles.kpiValue}>
        {value}
        {unit ? <span className={styles.kpiUnit}> {unit}</span> : null}
      </p>
      <div className={styles.kpiBody}>{children}</div>
    </article>
  );
}

function StandardCard({
  standard,
  active,
  mandateLabel,
  onToggle,
}: {
  standard: StandardDef;
  active: boolean;
  mandateLabel: string;
  onToggle: () => void;
}) {
  const iconName = STANDARD_ICONS.get(standard.id) ?? 'layers';
  return (
    <article className={`${styles.standardCard} ${active ? styles.standardCardActive : ''}`}>
      <button
        type="button"
        className={styles.standardToggle}
        aria-pressed={active}
        onClick={onToggle}
      >
        <span className={styles.standardIcon} aria-hidden="true">
          <Icon name={iconName} size={18} />
        </span>
        <span className={styles.standardHead}>
          <strong>{standard.label}</strong>
          <small>{standard.nameEn}</small>
        </span>
        <MandateBadge typeValue={standard.mandateType} label={mandateLabel} />
        <span className={styles.standardCount}>
          {intFormatter.format(toFinite(standard.certifiedCount))} รายการที่อ้างอิง
        </span>
        <span className={styles.standardDesc}>{standard.description}</span>
      </button>
      <span className={styles.standardMeta}>
        <span>{standard.agency}</span>
        {standard.sourceUrl ? (
          <a
            className={styles.inlineLink}
            href={standard.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Icon name="external" size={13} /> เปิดที่มา
          </a>
        ) : (
          <span className={styles.noLink}>ไม่เปิด URL สาธารณะ</span>
        )}
      </span>
    </article>
  );
}

function CertificateCard({
  record,
  mandateLabel,
}: {
  record: CertificateRecord;
  mandateLabel: string;
}) {
  return (
    <article className={styles.recordCard}>
      <header className={styles.recordHeader}>
        <span className={styles.recordNo}>{record.certificateNo}</span>
        <MandateBadge typeValue={record.mandateType} label={mandateLabel} />
      </header>
      <h4 className={styles.recordTitle}>{record.holderName}</h4>
      <dl className={styles.recordMeta}>
        <div>
          <dt>มาตรฐาน</dt>
          <dd>{record.standardLabel}</dd>
        </div>
        <div>
          <dt>ฟาร์ม / จังหวัด</dt>
          <dd>
            {record.farmCode} · {record.provinceName} ({record.provinceCode})
          </dd>
        </div>
        <div>
          <dt>สินค้า</dt>
          <dd>{record.commodityNames.length > 0 ? record.commodityNames.join(', ') : 'ไม่ระบุ'}</dd>
        </div>
        <div>
          <dt>ออกเมื่อ</dt>
          <dd>{formatDate(record.issueDate)}</dd>
        </div>
        <div>
          <dt>สิ้นอายุ</dt>
          <dd>{formatDate(record.expiryDate)}</dd>
        </div>
      </dl>
      <footer className={styles.recordFooter}>
        <StatusBadge status={record.status} label={record.statusLabel} />
      </footer>
    </article>
  );
}

function LotCard({
  lot,
  mandateLabel,
  selected,
  onSelect,
}: {
  lot: TraceabilityLot;
  mandateLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const residueClass =
    lot.residueResult === 'pass'
      ? styles.residuePass
      : lot.residueResult === 'fail'
        ? styles.residueFail
        : styles.residuePending;
  return (
    <button
      type="button"
      className={`${styles.lotCard} ${selected ? styles.lotCardActive : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.lotHeader}>
        <strong className={styles.lotCode}>{lot.lotCode}</strong>
        <MandateBadge typeValue={lot.mandateType} label={mandateLabel} />
      </span>
      <span className={styles.lotLine}>{lot.farmName}</span>
      <span className={styles.lotLineMuted}>
        {lot.commodityName} · {lot.provinceName} · {lot.standardLabel}
      </span>
      <span className={styles.lotFooter}>
        <span className={`${styles.residueChip} ${residueClass}`}>
          {lot.residueResult === 'pass'
            ? 'สารตกค้าง ผ่าน'
            : lot.residueResult === 'fail'
              ? 'สารตกค้าง ไม่ผ่าน'
              : 'สารตกค้าง รอยตรวจ'}
        </span>
        <StatusBadge status={lot.status} label={lot.statusLabel} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * แดชบอร์ดหลัก
 * ------------------------------------------------------------------ */
export interface FoodSafetyDashboardProps {
  payload: FoodSafetyDashboardPayload;
}

export function FoodSafetyDashboard({ payload }: FoodSafetyDashboardProps) {
  const [query, setQuery] = useState('');
  const [standardFilter, setStandardFilter] = useState<StandardId | 'all'>('all');
  const [mandateFilter, setMandateFilter] = useState<MandateType | 'all'>('all');
  const [regionFilter, setRegionFilter] = useState<RegionKey | 'all'>('all');
  const [provinceFilter, setProvinceFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<ProvinceSortKey>('totalCertifiedFarmCount');
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [selectedLotCode, setSelectedLotCode] = useState<string | null>(null);
  const [certPage, setCertPage] = useState(1);
  const [lotPage, setLotPage] = useState(1);
  const [tablePage, setTablePage] = useState(1);

  const summary = payload.summary;
  const normalizedQuery = query.trim().toLowerCase();

  /* ฉลากของ mandateType อ่านจากตารางมาตรฐานของ 5A ไม่ hardcode ค่า literal เอง */
  const mandateLabels = useMemo(() => {
    const map = new Map<MandateType, string>();
    for (const standard of payload.standards) {
      if (!map.has(standard.mandateType)) map.set(standard.mandateType, standard.mandateLabel);
    }
    return map;
  }, [payload.standards]);

  const mandateLabelOf = (value: MandateType): string => mandateLabels.get(value) ?? String(value);

  const mandateOptions = useMemo(() => Array.from(mandateLabels.entries()), [mandateLabels]);

  /* ภูมิภาคที่ปรากฏจริงในข้อมูล (รหัส 77 จังหวัด/รหัสภาคไม่ใช่ coverage) */
  const regionOptions = useMemo(() => {
    const map = new Map<RegionKey, string>();
    for (const row of payload.provinceStats) {
      if (!map.has(row.region)) map.set(row.region, row.regionLabel);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'th'));
  }, [payload.provinceStats]);

  const provinceOptions = useMemo(
    () =>
      [...payload.provinceStats].sort((a, b) => a.provinceName.localeCompare(b.provinceName, 'th')),
    [payload.provinceStats],
  );

  /* กลุ่มสินค้าสำหรับแท็บ */
  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of payload.commodityBoard) {
      counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      groupLabelOf(a[0]).localeCompare(groupLabelOf(b[0]), 'th'),
    );
  }, [payload.commodityBoard]);

  const commodityRows = useMemo(() => {
    const rows = payload.commodityBoard.filter(
      (row) => groupFilter === 'all' || row.groupId === groupFilter,
    );
    return [...rows].sort(
      (a, b) =>
        toFinite(b.gapCertifiedFarmCount) - toFinite(a.gapCertifiedFarmCount) ||
        a.commodityName.localeCompare(b.commodityName, 'th'),
    );
  }, [payload.commodityBoard, groupFilter]);

  /* ---------- ตัวกรองหลักที่ shared กับค้นหาระเบียน ---------- */
  const scoped = useMemo(() => {
    const inScope = (value: {
      standardId: StandardId;
      mandateType: MandateType;
      region: RegionKey;
      provinceCode: string;
    }): boolean => {
      if (standardFilter !== 'all' && value.standardId !== standardFilter) return false;
      if (mandateFilter !== 'all' && value.mandateType !== mandateFilter) return false;
      if (regionFilter !== 'all' && value.region !== regionFilter) return false;
      if (provinceFilter !== 'all' && value.provinceCode !== provinceFilter) return false;
      return true;
    };
    return {
      certificates: payload.certificates.filter(inScope),
      lots: payload.traceabilityLots.filter(inScope),
    };
  }, [
    payload.certificates,
    payload.traceabilityLots,
    standardFilter,
    mandateFilter,
    regionFilter,
    provinceFilter,
  ]);

  /* ---------- ค้นหา: เลขใบรับรอง / จังหวัด / lot / ฟาร์ม / ผู้ถือครอง ---------- */
  const matchedCertificates = useMemo(() => {
    if (!normalizedQuery) return scoped.certificates;
    return scoped.certificates.filter((record) => {
      const haystack = [
        record.certificateNo,
        record.holderName,
        record.farmCode,
        record.standardLabel,
        record.provinceName,
        record.provinceCode,
        ...record.commodityNames,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [scoped.certificates, normalizedQuery]);

  const matchedLots = useMemo(() => {
    if (!normalizedQuery) return scoped.lots;
    return scoped.lots.filter((lot) => {
      const haystack = [
        lot.lotCode,
        lot.qrPayload,
        lot.farmCode,
        lot.farmName,
        lot.standardLabel,
        lot.commodityName,
        lot.provinceName,
        lot.provinceCode,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [scoped.lots, normalizedQuery]);

  const matchedProvinces = useMemo(() => {
    if (!normalizedQuery) return [] as ProvinceCertStat[];
    return payload.provinceStats.filter((row) =>
      `${row.provinceName} ${row.provinceCode} ${row.regionLabel} ${row.dominantCommodity}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [payload.provinceStats, normalizedQuery]);

  const searchTotal =
    matchedCertificates.length + matchedLots.length + matchedProvinces.length;
  const isSearching = normalizedQuery.length > 0;

  /* ค้นหาหรือเปลี่ยนตัวกรอง = กลับไปหน้าแรกของทุกリスト */
  useEffect(() => {
    setCertPage(1);
    setLotPage(1);
    setTablePage(1);
  }, [normalizedQuery, standardFilter, mandateFilter, regionFilter, provinceFilter]);

  const certPageCount = Math.max(1, Math.ceil(matchedCertificates.length / PAGE_SIZE));
  const safeCertPage = Math.min(certPage, certPageCount);
  const visibleCertificates = matchedCertificates.slice(
    (safeCertPage - 1) * PAGE_SIZE,
    safeCertPage * PAGE_SIZE,
  );
  const certRangeStart = matchedCertificates.length === 0 ? 0 : (safeCertPage - 1) * PAGE_SIZE + 1;
  const certRangeEnd = Math.min(safeCertPage * PAGE_SIZE, matchedCertificates.length);

  const lotPageCount = Math.max(1, Math.ceil(matchedLots.length / PAGE_SIZE));
  const safeLotPage = Math.min(lotPage, lotPageCount);
  const visibleLots = matchedLots.slice((safeLotPage - 1) * PAGE_SIZE, safeLotPage * PAGE_SIZE);
  const lotRangeStart = matchedLots.length === 0 ? 0 : (safeLotPage - 1) * PAGE_SIZE + 1;
  const lotRangeEnd = Math.min(safeLotPage * PAGE_SIZE, matchedLots.length);

  /* ---------- ตารางจังหวัด (เรียงคอลัมน์ได้) ---------- */
  const provinceRows = useMemo(() => {
    const rows = payload.provinceStats.filter((row) => {
      if (regionFilter !== 'all' && row.region !== regionFilter) return false;
      if (provinceFilter !== 'all' && row.provinceCode !== provinceFilter) return false;
      return true;
    });
    const direction = sortDesc ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'provinceName') return a.provinceName.localeCompare(b.provinceName, 'th') * direction;
      const left = metricOf(a, sortKey);
      const right = metricOf(b, sortKey);
      if (left === right) return a.provinceName.localeCompare(b.provinceName, 'th');
      return (left - right) * direction;
    });
  }, [payload.provinceStats, regionFilter, provinceFilter, sortKey, sortDesc]);

  const tablePageCount = Math.max(1, Math.ceil(provinceRows.length / TABLE_PAGE_SIZE));
  const safeTablePage = Math.min(tablePage, tablePageCount);
  const visibleProvinceRows = provinceRows.slice(
    (safeTablePage - 1) * TABLE_PAGE_SIZE,
    safeTablePage * TABLE_PAGE_SIZE,
  );
  const tableRangeStart = provinceRows.length === 0 ? 0 : (safeTablePage - 1) * TABLE_PAGE_SIZE + 1;
  const tableRangeEnd = Math.min(safeTablePage * TABLE_PAGE_SIZE, provinceRows.length);

  const provinceTotals = useMemo(() => {
    let farms = 0;
    let inspected = 0;
    let passed = 0;
    let failed = 0;
    let traceable = 0;
    for (const row of provinceRows) {
      farms += toFinite(row.totalCertifiedFarmCount);
      inspected += toFinite(row.inspectedLotCount);
      passed += toFinite(row.passedLotCount);
      failed += toFinite(row.failedLotCount);
      traceable += toFinite(row.traceableLotCount);
    }
    return {
      farms,
      inspected,
      passed,
      failed,
      traceable,
      passRate: percentOf(passed, inspected),
      traceRate: percentOf(traceable, inspected),
    };
  }, [provinceRows]);

  /* ---------- ล็อตที่เลือกแสดง traceability ---------- */
  const activeLot = useMemo(() => {
    // ระหว่างค้นหา (เช่น พิมพ์ QR payload) ให้ผลค้นหาเป็นตัวกำหนดเส้นทางเสมอ
    if (isSearching) return matchedLots[0] ?? null;
    if (selectedLotCode) {
      const found = payload.traceabilityLots.find((lot) => lot.lotCode === selectedLotCode);
      if (found) return found;
    }
    if (matchedLots.length === 1) return matchedLots[0] ?? null;
    return matchedLots[0] ?? payload.traceabilityLots[0] ?? null;
  }, [isSearching, selectedLotCode, matchedLots, payload.traceabilityLots]);

  const activeLotChain = useMemo(() => {
    if (!activeLot) return [] as ChainStage[];
    return [...activeLot.chain].sort(
      (a, b) => CHAIN_ORDER.indexOf(a.stage) - CHAIN_ORDER.indexOf(b.stage),
    );
  }, [activeLot]);

  const residueRows = useMemo(
    () =>
      [...payload.residueLabs]
        .filter((lab) => regionFilter === 'all' || lab.region === regionFilter)
        .sort((a, b) => toFinite(b.passRate) - toFinite(a.passRate)),
    [payload.residueLabs, regionFilter],
  );

  const hasActiveFilters =
    standardFilter !== 'all' ||
    mandateFilter !== 'all' ||
    regionFilter !== 'all' ||
    provinceFilter !== 'all' ||
    groupFilter !== 'all' ||
    isSearching;

  const resetFilters = () => {
    setStandardFilter('all');
    setMandateFilter('all');
    setRegionFilter('all');
    setProvinceFilter('all');
    setGroupFilter('all');
    setQuery('');
  };

  const toggleSort = (key: ProvinceSortKey) => {
    if (sortKey === key) {
      setSortDesc((current) => !current);
      return;
    }
    setSortKey(key);
    setSortDesc(key !== 'provinceName');
  };

  return (
    <div className={styles.container}>
      {/* 1) แบนเนอร์สถานะข้อมูลตัวอย่าง + warnings */}
      <section
        className={`${styles.banner} ${payload.sample ? styles.bannerSample : styles.bannerLive}`}
        aria-label="สถานะความพร้อมของข้อมูล"
      >
        <span className={styles.bannerIcon} aria-hidden="true">
          <Icon name={payload.sample ? 'info' : 'lock'} size={20} />
        </span>
        <div className={styles.bannerBody}>
          <div className={styles.bannerTopline}>
            <strong>
              {payload.sample
                ? 'หน้านี้กำลังแสดงข้อมูลตัวอย่างเชิงโครงสร้าง (Deterministic Sample)'
                : 'ข้อมูลจากทะเบียนต้นทางที่ผ่านการตรวจสอบแล้ว'}
            </strong>
            <span className={styles.bannerTag}>{payload.sample ? 'SAMPLE DATA' : 'PUBLISHED'}</span>
          </div>
          <p>
            ตัวเลขใบรับรอง GAP เกษตรอินทรีย์ ผลตรวจสารตกค้าง และเส้นทางสืบย้อนในหน้านี้ถูกสร้างจาก
            ชุดข้อมูลตัวอย่างที่แน่นอนเพื่อสาธิตโครงสร้างระบบ ยังไม่ใช่สถิติทางการ และสิทธิ์เผยแพร่จาก
            ทะเบียนหน่วยงานต้นทางยังอยู่ระหว่างขั้นตอน Metadata Only
          </p>
          <p className={styles.bannerMeta}>
            <span>อ้างอิงข้อมูลถึง: {formatDate(payload.dataAsOf)}</span>
            <span>สร้างชุดข้อมูล: {formatDateTime(payload.generatedAt)}</span>
            <span>
              จำนวน lot ที่แสดง: {intFormatter.format(payload.traceabilityLots.length)} · ใบรับรอง:{' '}
              {intFormatter.format(payload.certificates.length)}
            </span>
          </p>
          {payload.warnings.length > 0 ? (
            <details className={styles.bannerDetails}>
              <summary>
                อ่านข้อจำกัดและคำเตือนการกำกับดูแล ({intFormatter.format(payload.warnings.length)} ข้อ)
              </summary>
              <ul className={styles.warningList}>
                {payload.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      {/* 2) แถบ KPI */}
      <section className={styles.kpiGrid} aria-label="สรุปตัวชี้วัดมาตรฐานความปลอดภัยอาหาร">
        <KpiCard
          title="สวน/ฟาร์มที่ได้รับการรับรองทั้งหมด"
          iconName="catalog"
          value={intFormatter.format(toFinite(summary.totalCertifiedFarms))}
          unit="แห่ง"
          wide
        >
          <p className={styles.kpiNote}>
            จำแนกเป็น GAP {intFormatter.format(toFinite(summary.gapCertifiedFarms))} แห่ง และ
            เกษตรอินทรีย์ {intFormatter.format(toFinite(summary.organicCertifiedFarms))} แห่ง
            (คนละทะเบียน ไม่นำมาบวกกัน) · ครอบคลุม {intFormatter.format(toFinite(summary.provinceCount))} จังหวัด
          </p>
          <div className={styles.splitRow}>
            <span className={styles.splitLabel}>GAP {rateLabel(percentOf(summary.gapCertifiedFarms, summary.totalCertifiedFarms))}</span>
            <Bar value={percentOf(summary.gapCertifiedFarms, summary.totalCertifiedFarms)} tone="forest" />
            <span className={styles.splitLabel}>
              อินทรีย์ {rateLabel(percentOf(summary.organicCertifiedFarms, summary.totalCertifiedFarms))}
            </span>
            <Bar value={percentOf(summary.organicCertifiedFarms, summary.totalCertifiedFarms)} tone="amber" />
          </div>
        </KpiCard>

        <KpiCard
          title="พื้นที่การผลิตได้รับการรับรอง"
          iconName="pin"
          value={intFormatter.format(toFinite(summary.certifiedAreaRai))}
          unit="ไร่"
        >
          <p className={styles.kpiNote}>รวมพื้นที่ GAP พืช ปศุสัตว์ ประมง และเกษตรอินทรีย์</p>
        </KpiCard>

        <KpiCard
          title="โครงสร้างมาตรฐานที่ใช้งาน"
          iconName="book"
          value={`${intFormatter.format(toFinite(summary.mandatoryStandardCount))} / ${intFormatter.format(
            toFinite(summary.mandatoryStandardCount) + toFinite(summary.voluntaryStandardCount),
          )}`}
          unit="มาตรฐานบังคับ / รวมทั้งหมด"
        >
          <ul className={styles.mandateLegend}>
            {mandateOptions.map(([value, label]) => (
              <li key={value} className={styles.legendRow}>
                <MandateBadge typeValue={value} label={label} />
                <span className={styles.legendCount}>
                  {intFormatter.format(
                    payload.standards.filter((standard) => standard.mandateType === value).length,
                  )}{' '}
                  มาตรฐาน
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.kpiNote}>
            มาตรฐานบังคับต้องปฏิบัติตามกฎหมาย ขณะที่มาตรฐานสมัครใจใช้เพื่อยกระดับมูลค่าการผลิต
          </p>
        </KpiCard>

        <KpiCard
          title="อัตราผ่านจุดตรวจสารตกค้าง (MRL)"
          iconName="chart"
          value={rateLabel(summary.overallPassRate)}
          wide
        >
          <div className={styles.gaugeRow}>
            <Gauge value={toFinite(summary.overallPassRate)} caption="อัตราผ่านจุดตรวจสารตกค้าง" />
            <p className={styles.kpiNote}>
              ผ่าน {intFormatter.format(toFinite(summary.totalPassedLots))} lot จากที่สุ่มตรวจ{' '}
              {intFormatter.format(toFinite(summary.totalInspectedLots))} lot ทั่วประเทศ
            </p>
          </div>
        </KpiCard>

        <KpiCard
          title="ความครอบคลุมการสืบย้อนถึงฟาร์ม"
          iconName="layers"
          value={rateLabel(summary.overallTraceabilityRate)}
          wide
        >
          <div className={styles.gaugeRow}>
            <Gauge value={toFinite(summary.overallTraceabilityRate)} caption="ความครอบคลุมการสืบย้อน" />
            <p className={styles.kpiNote}>
              lot ที่สืบย้อนถึงรหัสฟาร์มได้ {intFormatter.format(toFinite(summary.totalTraceableLots))} รายการ
              จากล็อตที่แสดงในระบบ
            </p>
          </div>
        </KpiCard>
      </section>

      {/* 3) ภาพรวมมาตรฐาน + badge บังคับ/สมัครใจ */}
      <section className={styles.section} aria-label="มาตรฐานความปลอดภัยสินค้าเกษตร">
        <header className={styles.sectionHeader}>
          <div>
            <h2>มาตรฐานที่ระบบติดตาม</h2>
            <p>
              GAP พืช/ปศุสัตว์/ประมง, เกษตรอินทรีย์ Organic Thailand และจุดตรวจสารตกค้าง
              เลือกการ์ดมาตรฐานเพื่อใช้เป็นตัวกรองทั้งหน้า
            </p>
          </div>
          <span className={styles.sectionCount}>{payload.standards.length} มาตรฐาน</span>
        </header>
        <div className={styles.standardGrid}>
          {payload.standards.map((standard) => (
            <StandardCard
              key={standard.id}
              standard={standard}
              active={standardFilter === standard.id}
              mandateLabel={mandateLabelOf(standard.mandateType)}
              onToggle={() =>
                setStandardFilter((current) => (current === standard.id ? 'all' : standard.id))
              }
            />
          ))}
        </div>
      </section>

      {/* 4) แถบตัวกรอง + กล่องค้นหาเลขใบรับรอง/จังหวัด */}
      <section className={styles.filterPanel} aria-label="ตัวกรองและค้นหาทะเบียน">
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>มาตรฐาน</span>
            <div className={styles.chipRow}>
              <button
                type="button"
                className={`${styles.chip} ${standardFilter === 'all' ? styles.chipActive : ''}`}
                aria-pressed={standardFilter === 'all'}
                onClick={() => setStandardFilter('all')}
              >
                ทั้งหมด
              </button>
              {payload.standards.map((standard) => (
                <button
                  key={standard.id}
                  type="button"
                  className={`${styles.chip} ${standardFilter === standard.id ? styles.chipActive : ''}`}
                  aria-pressed={standardFilter === standard.id}
                  onClick={() => setStandardFilter(standard.id)}
                >
                  {standard.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>ลักษณะการบังคับใช้</span>
            <div className={styles.chipRow}>
              <button
                type="button"
                className={`${styles.chip} ${mandateFilter === 'all' ? styles.chipActive : ''}`}
                aria-pressed={mandateFilter === 'all'}
                onClick={() => setMandateFilter('all')}
              >
                ทั้งหมด
              </button>
              {mandateOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.chip} ${mandateFilter === value ? styles.chipActive : ''}`}
                  aria-pressed={mandateFilter === value}
                  onClick={() => setMandateFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.searchRow}>
          <label className={styles.searchField}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาเลขที่ใบรับรอง ชื่อจังหวัด รหัสฟาร์ม รหัสล็อต หรือ QR payload"
              aria-label="ค้นหาเลขที่ใบรับรอง จังหวัด รหัสฟาร์ม หรือรหัสล็อต"
            />
          </label>
          <button type="button" className={styles.resetButton} onClick={resetFilters} disabled={!hasActiveFilters}>
            ล้างตัวกรอง
          </button>
        </div>

        <p className={styles.resultLine} aria-live="polite">
          <strong>
            {isSearching
              ? `ผลการค้นหา “${query.trim()}”`
              : 'ทะเบียนใบรับรองและล็อตการผลิตที่ตรงกับตัวกรอง'}
          </strong>
          <span>
            ใบรับรอง {intFormatter.format(matchedCertificates.length)} ฉบับ · ล็อตสืบย้อน{' '}
            {intFormatter.format(matchedLots.length)} รายการ · จังหวัดที่ชื่อตรงกัน{' '}
            {intFormatter.format(matchedProvinces.length)} แห่ง
          </span>
          {hasActiveFilters ? (
            <span className={styles.filterEcho}>
              {standardFilter === 'all'
                ? 'ทุกมาตรฐาน'
                : payload.standards.find((standard) => standard.id === standardFilter)?.label ?? 'ทุกมาตรฐาน'}
              {' · '}
              {mandateFilter === 'all' ? 'ทุกลักษณะบังคับใช้' : mandateLabelOf(mandateFilter)}
              {' · '}
              {regionFilter === 'all'
                ? 'ทุกภูมิภาค'
                : (regionOptions.find((option) => option[0] === regionFilter)?.[1] ?? 'ทุกภูมิภาค')}
              {' · '}
              {provinceFilter === 'all'
                ? 'ทุกจังหวัด'
                : (payload.provinceStats.find((row) => row.provinceCode === provinceFilter)?.provinceName ??
                  'ทุกจังหวัด')}
            </span>
          ) : null}
        </p>

        {isSearching && searchTotal === 0 ? (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบผลการค้นหา</h3>
            <p>
              ลองใช้เลขใบรับรองบางส่วน รหัสฟาร์ม หรือชื่อจังหวัดที่มีในระบบ
              รายการที่สิทธิ์เผยแพร่ยังอยู่ในสถานะ pending จะไม่ถูกนำมาแสดงในทะเบียนนี้
            </p>
          </div>
        ) : null}

        {matchedProvinces.length > 0 ? (
          <div className={styles.provinceHitRow}>
            <span className={styles.provinceHitLabel}>จังหวัดที่ตรงกับการค้นหา</span>
            <div className={styles.chipRow}>
              {matchedProvinces.slice(0, 12).map((row) => (
                <button
                  key={row.provinceCode}
                  type="button"
                  className={`${styles.chip} ${provinceFilter === row.provinceCode ? styles.chipActive : ''}`}
                  aria-pressed={provinceFilter === row.provinceCode}
                  onClick={() => setProvinceFilter(row.provinceCode)}
                >
                  {row.provinceName} · {intFormatter.format(toFinite(row.totalCertifiedFarmCount))} แห่ง
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.registryGrid}>
          <div className={styles.registryColumn}>
            <h3 className={styles.columnTitle}>
              <Icon name="book" size={16} /> ใบรับรอง ({intFormatter.format(matchedCertificates.length)})
            </h3>
            {matchedCertificates.length > 0 ? (
              <div className={styles.cardStack}>
                {visibleCertificates.map((record) => (
                  <CertificateCard
                    key={record.certificateNo}
                    record={record}
                    mandateLabel={mandateLabelOf(record.mandateType)}
                  />
                ))}
                <Pager
                  page={safeCertPage}
                  pageCount={certPageCount}
                  onChange={setCertPage}
                  label="แบ่งหน้ารายการใบรับรอง"
                  status={`แสดง ${intFormatter.format(certRangeStart)}–${intFormatter.format(certRangeEnd)} จาก ${intFormatter.format(matchedCertificates.length)} ฉบับ`}
                />
              </div>
            ) : (
              <p className={styles.columnEmpty}>ไม่มีใบรับรองที่ตรงกับเงื่อนไขนี้</p>
            )}
          </div>

          <div className={styles.registryColumn}>
            <h3 className={styles.columnTitle}>
              <Icon name="layers" size={16} /> ล็อตการผลิต ({intFormatter.format(matchedLots.length)})
            </h3>
            {matchedLots.length > 0 ? (
              <div className={styles.cardStack}>
                {visibleLots.map((lot) => (
                  <LotCard
                    key={lot.lotCode}
                    lot={lot}
                    mandateLabel={mandateLabelOf(lot.mandateType)}
                    selected={activeLot?.lotCode === lot.lotCode}
                    onSelect={() => setSelectedLotCode(lot.lotCode)}
                  />
                ))}
                <Pager
                  page={safeLotPage}
                  pageCount={lotPageCount}
                  onChange={setLotPage}
                  label="แบ่งหน้ารายการล็อตการผลิต"
                  status={`แสดง ${intFormatter.format(lotRangeStart)}–${intFormatter.format(lotRangeEnd)} จาก ${intFormatter.format(matchedLots.length)} ล็อต`}
                />
              </div>
            ) : (
              <p className={styles.columnEmpty}>ไม่มีล็อตการผลิตที่ตรงกับเงื่อนไขนี้</p>
            )}
          </div>
        </div>
      </section>

      {/* 5) กระดานการรับรอง GAP รายพืช/สินค้า */}
      <section className={styles.section} aria-label="การรับรองมาตรฐานแยกตามชนิดสินค้า">
        <header className={styles.sectionHeader}>
          <div>
            <h2>กระดานการรับรองรายสินค้า (ทุเรียน ข้าว ผักผลไม้ และอื่น ๆ)</h2>
            <p>
              จำนวนฟาร์มที่ได้รับการรับรอง พื้นที่ไร่ สัดส่วนการรับรอง และผลตรวจสารตกค้าง
              เรียงตามจำนวนฟาร์ม GAP ภายในกลุ่มสินค้าที่เลือก
            </p>
          </div>
        </header>

        <div className={styles.tabBar} role="tablist" aria-label="เลือกกลุ่มสินค้า">
          <button
            type="button"
            role="tab"
            aria-selected={groupFilter === 'all'}
            className={`${styles.tab} ${groupFilter === 'all' ? styles.tabActive : ''}`}
            onClick={() => setGroupFilter('all')}
          >
            ทุกกลุ่มสินค้า
          </button>
          {groupOptions.map(([id, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={groupFilter === id}
              className={`${styles.tab} ${groupFilter === id ? styles.tabActive : ''}`}
              onClick={() => setGroupFilter(id)}
            >
              {groupLabelOf(id)}
              <span className={styles.tabCount}>{intFormatter.format(count)}</span>
            </button>
          ))}
        </div>

        {commodityRows.length > 0 ? (
          <div className={styles.commodityGrid}>
            {commodityRows.map((row: CommodityCertBoard) => {
              const ratio = toFinite(row.certifiedRatio);
              const topThree = row.topProvinces.slice(0, 3);
              return (
                <details key={row.commodityId} className={styles.commodityCard}>
                  <summary className={styles.commoditySummary}>
                    <span className={styles.commodityTitleWrap}>
                      <h3>{row.commodityName}</h3>
                      <span className={styles.commodityGroup}>{groupLabelOf(row.groupId)}</span>
                    </span>
                    <span className={styles.commodityMini}>
                      <span className={styles.commodityMiniItem}>
                        <strong>{intFormatter.format(toFinite(row.gapCertifiedFarmCount))}</strong> ฟาร์ม GAP
                      </span>
                      <span className={styles.commodityMiniItem}>
                        <strong className={bandClass(rateBandOf(ratio))}>{rateLabel(ratio)}</strong> สัดส่วนรับรอง
                      </span>
                    </span>
                    <MandateBadge
                      typeValue={row.mandateType}
                      label={mandateLabelOf(row.mandateType)}
                    />
                    <span className={styles.summaryHint} aria-hidden="true">
                      รายละเอียด ▾
                    </span>
                  </summary>

                  <div className={styles.commodityBody}>
                    <dl className={styles.commodityStats}>
                      <div>
                        <dt>ฟาร์ม GAP รับรอง</dt>
                        <dd>{intFormatter.format(toFinite(row.gapCertifiedFarmCount))} แห่ง</dd>
                      </div>
                      <div>
                        <dt>พื้นที่รับรอง</dt>
                        <dd>{intFormatter.format(toFinite(row.gapCertifiedAreaRai))} ไร่</dd>
                      </div>
                      <div>
                        <dt>อินทรีย์</dt>
                        <dd>{intFormatter.format(toFinite(row.organicCertifiedFarmCount))} แห่ง</dd>
                      </div>
                      <div>
                        <dt>lot ที่สุ่มตรวจ</dt>
                        <dd>{intFormatter.format(toFinite(row.residueSampledLots))} lot</dd>
                      </div>
                    </dl>

                    <div className={styles.metricBlock}>
                      <span className={styles.metricLabel}>
                        สัดส่วนได้รับการรับรอง <strong className={bandClass(rateBandOf(ratio))}>{rateLabel(ratio)}</strong>
                      </span>
                      <Bar value={ratio} tone="forest" />
                    </div>

                    <div className={styles.metricBlock}>
                      <span className={styles.metricLabel}>
                        ผลตรวจสารตกค้าง
                        <strong className={bandClass(rateBandOf(row.residuePassRate))}>
                          ผ่าน {rateLabel(row.residuePassRate)}
                        </strong>
                      </span>
                      <SplitBar
                        pass={toFinite(row.residuePassRate)}
                        fail={toFinite(row.residueFailRate)}
                        pending={Math.max(
                          0,
                          100 - toFinite(row.residuePassRate) - toFinite(row.residueFailRate),
                        )}
                      />
                      <span className={styles.splitLegend}>
                        <span className={styles.legendPass}>ผ่าน {rateLabel(row.residuePassRate)}</span>
                        <span className={styles.legendFail}>ไม่ผ่าน {rateLabel(row.residueFailRate)}</span>
                      </span>
                    </div>

                    <div className={styles.topProvinceBlock}>
                      <span className={styles.metricLabel}>จังหวัดนำด้านการรับรอง</span>
                      {topThree.length > 0 ? (
                        <ol className={styles.topProvinceList}>
                          {topThree.map((province, index) => (
                            <li key={`${row.commodityId}-${province.provinceCode}`}>
                              <span className={styles.rankMark} aria-hidden="true">
                                {index + 1}
                              </span>
                              <button
                                type="button"
                                className={styles.provinceLink}
                                onClick={() => setProvinceFilter(province.provinceCode)}
                              >
                                {province.provinceName}
                              </button>
                              <span className={styles.rankValue}>
                                {intFormatter.format(toFinite(province.certifiedFarmCount))} แห่ง
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className={styles.columnEmpty}>ยังไม่ระบุจังหวัดนำ</p>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบสินค้าในกลุ่มนี้</h3>
            <p>เลือกกลุ่มสินค้าอื่น หรือล้างตัวกรองเพื่อดูกระดานทั้งหมด</p>
          </div>
        )}
      </section>

      {/* 6) ตารางจังหวัด */}
      <section className={styles.section} aria-label="การรับรองและการตรวจแยกตามจังหวัด">
        <header className={styles.sectionHeader}>
          <div>
            <h2>ตารางรายจังหวัด</h2>
            <p>
              คลิกหัวคอลัมน์เพื่อเรียงลำดับ (ฟาร์มรับรอง / อัตราผ่าน / การสืบย้อน)
              แสดงเฉพาะจังหวัดที่มีข้อมูลในชุดนี้เท่านั้น
            </p>
          </div>
          <span className={styles.sectionCount}>{intFormatter.format(provinceRows.length)} จังหวัดที่แสดง</span>
        </header>

        <div className={styles.regionBar}>
          <div className={styles.chipRow}>
            <button
              type="button"
              className={`${styles.chip} ${regionFilter === 'all' ? styles.chipActive : ''}`}
              aria-pressed={regionFilter === 'all'}
              onClick={() => setRegionFilter('all')}
            >
              ทุกภาค
            </button>
            {regionOptions.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`${styles.chip} ${regionFilter === key ? styles.chipActive : ''}`}
                aria-pressed={regionFilter === key}
                onClick={() => setRegionFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={styles.selectField}>
            <span>จังหวัด</span>
            <select value={provinceFilter} onChange={(event) => setProvinceFilter(event.target.value)}>
              <option value="all">ทุกจังหวัด ({intFormatter.format(provinceOptions.length)})</option>
              {provinceOptions.map((row) => (
                <option key={row.provinceCode} value={row.provinceCode}>
                  {row.provinceName} · {row.regionLabel}
                </option>
              ))}
            </select>
          </label>
        </div>

        {provinceRows.length > 0 ? (
          <>
            <div className={styles.tableScroll} role="region" aria-label="ตารางรายจังหวัด" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.thName} aria-sort={sortKey === 'provinceName' ? (sortDesc ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" className={styles.sortButton} onClick={() => toggleSort('provinceName')}>
                      จังหวัด
                      <SortGlyph active={sortKey === 'provinceName'} desc={sortDesc} />
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className={styles.sortButton} onClick={() => toggleSort('gapFarmCount')}>
                      GAP (แห่ง)
                      <SortGlyph active={sortKey === 'gapFarmCount'} desc={sortDesc} />
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className={styles.sortButton} onClick={() => toggleSort('organicFarmCount')}>
                      อินทรีย์
                      <SortGlyph active={sortKey === 'organicFarmCount'} desc={sortDesc} />
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className={styles.sortButton} onClick={() => toggleSort('totalCertifiedFarmCount')}>
                      รวมรับรอง
                      <SortGlyph active={sortKey === 'totalCertifiedFarmCount'} desc={sortDesc} />
                    </button>
                  </th>
                  <th scope="col" className={styles.thNumeric}>
                    ตรวจ / ผ่าน / ไม่ผ่าน
                  </th>
                  <th scope="col">
                    <button type="button" className={styles.sortButton} onClick={() => toggleSort('passRate')}>
                      อัตราผ่าน
                      <SortGlyph active={sortKey === 'passRate'} desc={sortDesc} />
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className={styles.sortButton} onClick={() => toggleSort('traceabilityRate')}>
                      สืบย้อนได้
                      <SortGlyph active={sortKey === 'traceabilityRate'} desc={sortDesc} />
                    </button>
                  </th>
                  <th scope="col">สินค้าเด่น</th>
                </tr>
              </thead>
              <tbody>
                {visibleProvinceRows.map((row) => {
                  const band = rateBandOf(row.passRate);
                  const traceBand = rateBandOf(row.traceabilityRate);
                  return (
                    <tr
                      key={row.provinceCode}
                      className={provinceFilter === row.provinceCode ? styles.rowSelected : undefined}
                    >
                      <th scope="row" className={styles.provinceCell}>
                        <span className={styles.provinceName}>{row.provinceName}</span>
                        <span className={styles.provinceSub}>
                          {row.provinceCode} · {row.regionLabel}
                        </span>
                      </th>
                      <td className={styles.numeric}>{intFormatter.format(toFinite(row.gapFarmCount))}</td>
                      <td className={styles.numeric}>{intFormatter.format(toFinite(row.organicFarmCount))}</td>
                      <td className={`${styles.numeric} ${styles.numericStrong}`}>
                        {intFormatter.format(toFinite(row.totalCertifiedFarmCount))}
                        <Bar value={percentOf(row.totalCertifiedFarmCount, provinceTotals.farms)} tone="forest" />
                      </td>
                      <td className={styles.countCell}>
                        {intFormatter.format(toFinite(row.inspectedLotCount))} /{' '}
                        <span className={styles.passText}>{intFormatter.format(toFinite(row.passedLotCount))}</span>{' '}
                        / <span className={styles.failText}>{intFormatter.format(toFinite(row.failedLotCount))}</span>
                        {toFinite(row.pendingLotCount) > 0 ? (
                          <span className={styles.pendingText}> (+{intFormatter.format(toFinite(row.pendingLotCount))} รอผล)</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={`${styles.rateCell} ${bandClass(band)}`}>{rateLabel(row.passRate)}</span>
                      </td>
                      <td>
                        <span className={`${styles.rateCell} ${bandClass(traceBand)}`}>
                          {rateLabel(row.traceabilityRate)}
                        </span>
                      </td>
                      <td className={styles.commodityCell}>{row.dominantCommodity}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">รวมทั้งที่กรอง</th>
                  <td className={styles.numeric}>—</td>
                  <td className={styles.numeric}>—</td>
                  <td className={`${styles.numeric} ${styles.numericStrong}`}>
                    {intFormatter.format(provinceTotals.farms)}
                  </td>
                  <td className={styles.countCell}>
                    {intFormatter.format(provinceTotals.inspected)} /{' '}
                    <span className={styles.passText}>{intFormatter.format(provinceTotals.passed)}</span> /{' '}
                    <span className={styles.failText}>
                      {intFormatter.format(provinceTotals.failed)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.rateCell} ${bandClass(rateBandOf(provinceTotals.passRate))}`}>
                      {rateLabel(provinceTotals.passRate)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.rateCell} ${bandClass(rateBandOf(provinceTotals.traceRate))}`}>
                      {rateLabel(provinceTotals.traceRate)}
                    </span>
                  </td>
                  <td className={styles.commodityCell}>—</td>
                </tr>
              </tfoot>
            </table>
            </div>
            <Pager
              page={safeTablePage}
              pageCount={tablePageCount}
              onChange={setTablePage}
              label="แบ่งหน้าตารางรายจังหวัด"
              status={`แสดง ${intFormatter.format(tableRangeStart)}–${intFormatter.format(tableRangeEnd)} จาก ${intFormatter.format(provinceRows.length)} จังหวัด`}
            />
          </>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบผลการค้นหา</h3>
            <p>ไม่มีจังหวัดที่ตรงกับภาค/จังหวัดที่เลือกในชุดข้อมูลนี้ ลองล้างตัวกรอง</p>
          </div>
        )}
      </section>

      {/* 7) แผงสืบย้อนแหล่งกำเนิด */}
      <section className={styles.section} aria-label="การสืบย้อนแหล่งกำเนิดถึงฟาร์ม">
        <header className={styles.sectionHeader}>
          <div>
            <h2>การสืบย้อนแหล่งกำเนิด (Traceability to Farm)</h2>
            <p>เลือกการ์ดล็อตด้านบน หรือพิมพ์รหัสล็อต/QR payload ในช่องค้นหาเพื่อดูเส้นทางทั้งห่วงโซ่</p>
          </div>
        </header>

        {activeLot ? (
          <div className={styles.traceGrid}>
            <article className={styles.traceSummary}>
              <h3 className={styles.traceTitle}>
                <Icon name="layers" size={18} /> {activeLot.lotCode}
              </h3>
              <dl className={styles.traceMeta}>
                <div>
                  <dt>ฟาร์ม</dt>
                  <dd>
                    {activeLot.farmName} <span className={styles.codeInline}>({activeLot.farmCode})</span>
                  </dd>
                </div>
                <div>
                  <dt>มาตรฐาน</dt>
                  <dd>
                    {activeLot.standardLabel}{' '}
                    <MandateBadge
                      typeValue={activeLot.mandateType}
                      label={mandateLabelOf(activeLot.mandateType)}
                    />
                  </dd>
                </div>
                <div>
                  <dt>สินค้า / จังหวัด</dt>
                  <dd>
                    {activeLot.commodityName} · {activeLot.provinceName}
                  </dd>
                </div>
                <div>
                  <dt>เก็บเกี่ยว</dt>
                  <dd>{formatDate(activeLot.harvestDate)}</dd>
                </div>
                <div>
                  <dt>รับรองเมื่อ</dt>
                  <dd>{formatDate(activeLot.certifiedDate)}</dd>
                </div>
                <div>
                  <dt>สิ้นอายุ</dt>
                  <dd>{formatDate(activeLot.expiryDate)}</dd>
                </div>
                <div>
                  <dt>สถานะใบรับรอง</dt>
                  <dd>
                    <StatusBadge status={activeLot.status} label={activeLot.statusLabel} />
                  </dd>
                </div>
                <div>
                  <dt>ผลตรวจสารตกค้าง</dt>
                  <dd>
                    <span
                      className={`${styles.residueChip} ${
                        activeLot.residueResult === 'pass'
                          ? styles.residuePass
                          : activeLot.residueResult === 'fail'
                            ? styles.residueFail
                            : styles.residuePending
                      }`}
                    >
                      {activeLot.residueResult === 'pass'
                        ? 'ผ่านเกณฑ์ MRL'
                        : activeLot.residueResult === 'fail'
                          ? 'ไม่ผ่านเกณฑ์ MRL'
                          : 'รอผลตรวจ'}
                    </span>{' '}
                    <span className={styles.codeInline}>กลุ่ม MRL: {activeLot.residueMrlGroup}</span>
                  </dd>
                </div>
              </dl>

              <div className={styles.qrBlock}>
                <QrPlaceholder value={activeLot.lotCode} />
                <div className={styles.qrSide}>
                  <span className={styles.demoTag}>DEMO · ภาพจำลอง ไม่ใช่การรับรองจริง</span>
                  <span className={styles.qrCaption}>ภาพแทน QR สร้างในเว็บจาก lotCode</span>
                  <p className={styles.qrPayload}>{activeLot.qrPayload}</p>
                  <p className={styles.qrNote}>
                    ระบบสร้างภาพแทน QR ภายในเว็บเท่านั้น ไม่เรียกบริการ QR ภายนอก
                    และภาพนี้ไม่ใช่หลักฐานการรับรองหรือเอกสารราชการ
                    เพื่อไม่แสดงข้อมูลที่ยังไม่ได้รับสิทธิ์เผยแพร่
                  </p>
                  <button
                    type="button"
                    className={styles.qrSearchButton}
                    onClick={() => setQuery(activeLot.qrPayload)}
                  >
                    ค้นหาด้วย QR payload นี้
                  </button>
                </div>
              </div>
            </article>

            <article className={styles.stepperCard}>
              <h3 className={styles.stepperTitle}>เส้นทางห่วงโซ่ {activeLotChain.length} ช่วง</h3>
              {activeLotChain.length > 0 ? (
                <ol className={styles.stepper}>
                  {activeLotChain.map((stage, index) => (
                    <li key={`${activeLot.lotCode}-${stage.stage}-${index}`} className={styles.stepperItem}>
                      <span className={styles.stepperDot} aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className={styles.stepperBody}>
                        <strong>{stage.stageLabel}</strong>
                        <span className={styles.stepperPlace}>
                          <Icon name="pin" size={13} /> {stage.location}
                        </span>
                        <span className={styles.stepperDate}>{formatDate(stage.date)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.columnEmpty}>ล็อตนี้ยังไม่มีข้อมูลเส้นทางในชุดตัวอย่าง</p>
              )}
            </article>
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบผลการค้นหา</h3>
            <p>ยังไม่มีล็อตที่ตรงกับตัวกรองปัจจุบัน จึงไม่สามารถแสดงเส้นทางสืบย้อนได้</p>
          </div>
        )}
      </section>

      {/* 8) ห้องปฏิบัติการตรวจสารตกค้าง */}
      <section className={styles.section} aria-label="ผลการตรวจสารตกค้างตามห้องปฏิบัติการ">
        <header className={styles.sectionHeader}>
          <div>
            <h2>จุดตรวจ/ห้องปฏิบัติการสารตกค้าง</h2>
            <p>เรียงตามอัตราผ่าน ลดหลั่น แสดงจำนวน lot ที่ไม่ผ่านเพื่อเฝ้าระวังความเสี่ยง</p>
          </div>
          <span className={styles.sectionCount}>{intFormatter.format(residueRows.length)} หน่วยตรวจ</span>
        </header>

        {residueRows.length > 0 ? (
          <div className={styles.labGrid}>
            {residueRows.map((lab: ResidueLabStat) => (
              <article key={lab.labId} className={styles.labCard}>
                <header className={styles.labHeader}>
                  <h3>{lab.labName}</h3>
                  <span className={styles.labRegion}>{lab.regionLabel}</span>
                </header>
                <div className={styles.labGauge}>
                  <Gauge value={toFinite(lab.passRate)} caption={`อัตราผ่านของ ${lab.labName}`} />
                  <dl className={styles.labStats}>
                    <div>
                      <dt>lot ที่ตรวจ</dt>
                      <dd>{intFormatter.format(toFinite(lab.testedLots))}</dd>
                    </div>
                    <div>
                      <dt>ผ่าน</dt>
                      <dd className={styles.passText}>{intFormatter.format(toFinite(lab.passedLots))}</dd>
                    </div>
                    <div>
                      <dt>ไม่ผ่าน</dt>
                      <dd className={styles.failText}>{intFormatter.format(toFinite(lab.failedLots))}</dd>
                    </div>
                    <div>
                      <dt>กลุ่ม MRL หลัก</dt>
                      <dd>{lab.primaryMrlGroup}</dd>
                    </div>
                  </dl>
                </div>
                <SplitBar
                  pass={percentOf(lab.passedLots, lab.testedLots)}
                  fail={percentOf(lab.failedLots, lab.testedLots)}
                  pending={Math.max(
                    0,
                    100 - percentOf(lab.passedLots, lab.testedLots) - percentOf(lab.failedLots, lab.testedLots),
                  )}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState} role="status">
            <h3>ไม่พบผลการค้นหา</h3>
            <p>ไม่มีหน่วยตรวจสารตกค้างในภูมิภาคที่เลือก</p>
          </div>
        )}
      </section>

      {/* 9) แหล่งข้อมูล / สิทธิ์การเผยแพร่ */}
      <section className={styles.section} aria-label="แหล่งข้อมูลและสิทธิ์การเผยแพร่">
        <header className={styles.sectionHeader}>
          <div>
            <h2>แหล่งข้อมูลต้นทางและสถานะสิทธิ์</h2>
            <p>แสดงเฉพาะ URL ที่เผยแพร่เป็นสาธารณะ ถ้ายังไม่มี URL ระบบจะไม่สร้างลิงก์เปล่า</p>
          </div>
        </header>
        <p className={styles.sourcesNote}>
          ทุกแหล่งข้อมูลมีสถานะสิทธิ์เป็น pending (Metadata Only) — ระบบจึงเผยแพร่ได้เฉพาะ metadata
          และค่าตัวอย่าง มิใช่ตัวเลขทางการจากทะเบียนต้นทาง
        </p>
        <details className={styles.sourcesDetails}>
          <summary>
            อ่านรายละเอียดแหล่งข้อมูลและสถานะสิทธิ์ ({intFormatter.format(payload.sources.length)} แหล่ง)
          </summary>
          <ul className={styles.sourceList}>
            {payload.sources.map((source: SourceEntry) => (
              <li key={source.id} className={styles.sourceItem}>
                <div className={styles.sourceHead}>
                  <strong>{source.name}</strong>
                  <span className={styles.licenseBadge}>{licenseLabel(source.licenseStatus)}</span>
                </div>
                <p className={styles.sourceAgency}>{source.agencyLabel}</p>
                <p className={styles.sourceRole}>{source.role}</p>
                {source.sourceUrl ? (
                  <a
                    className={styles.sourceLink}
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="external" size={14} /> {source.sourceUrl}
                  </a>
                ) : (
                  <span className={styles.noLink}>อยู่ระหว่างตรวจสอบสิทธิ์การเผยแพร่ (Metadata Only)</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
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

function licenseLabel(status: string): string {
  const text = status.toLowerCase();
  if (text.includes('approved') || text.includes('public')) return 'เผยแพร่ได้';
  if (text.includes('restricted')) return 'จำกัดสิทธิ์';
  if (text.includes('pending')) return 'รอตรวจสอบสิทธิ์';
  return status;
}
