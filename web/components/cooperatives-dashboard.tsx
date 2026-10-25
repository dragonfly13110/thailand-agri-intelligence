'use client';

import { useMemo, useState } from 'react';
import type {
  CamelClass,
  CamelDimension,
  CoopCollectionLine,
  CoopProvinceRollup,
  CoopType,
  CooperativeRecord,
  CooperativesPayload,
} from '@/lib/hub/cooperatives-data';
import { Icon } from './icon';
import styles from './cooperatives-dashboard.module.css';

/**
 * แดชบอร์ด "สหกรณ์การเกษตร วิสาหกิจชุมชน และเครือข่ายแปลงใหญ่" สำหรับหน้า /cooperatives
 *
 * - รับ `payload` จาก server component ทางเดียว โมดูลข้อมูลอยู่ฝั่งเซิร์ฟเวอร์ จึง import
 *   เฉพาะชนิดข้อมูล (type-only) เข้ามาใน client — ไม่มีการ fetch และไม่ดึง runtime constant
 *   ขนาดใหญ่เข้า bundle ฝั่งเบราว์เซอร์
 * - แกนเรดาร์ CAMELS อ่านจาก `coop.camel.dimensions` (ตามสัญญา: ครบ 6 มิติ ลำดับคงที่)
 *   แทนการ import COOP_CAMELS_DIMENSIONS แบบ runtime เพื่อให้ client เป็น type-only จริง
 * - ทุกตัวกรอง/การจัดเรียง/เรดาร์ คำนวณด้วย useMemo บน payload.cooperatives ฝั่ง client
 * - KPI "ตามเงื่อนไขที่เลือก" รวมจากรายการที่กรองแล้วเสมอ ค่าระดับประเทศแสดงแยกเป็นบริบท
 * - ค่า null แปลว่า "ยังไม่มีข้อมูล" แสดงเป็น "ไม่มีข้อมูล" ห้ามแปลงเป็น 0
 * - เรดาร์ใช้เส้นทึบ/เส้นประ + ข้อความกำกับ และ badge ชั้นมีชื่อชั้นเขียนกำกับ สีไม่ใช่สัญญาณเดียว
 */

export interface CooperativesDashboardProps {
  payload: CooperativesPayload;
}

const NO_DATA = 'ไม่มีข้อมูล';
const COOP_TABLE_CAP_STEP = 25;
const PROVINCE_TABLE_CAP_STEP = 12;

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const decimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
/** ตัวเลข ล้านบาท: ทศนิยม 1-2 ตำแหน่งตามสัญญา lane */
const millionsFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

/** เรดาร์: เรขาคณิตคงที่ คำนวณเชิงตัวเลขกำหนดได้ (ไม่มี Date.now / Math.random) */
const RADAR_VIEW_W = 480;
const RADAR_VIEW_H = 400;
const RADAR_CX = 240;
const RADAR_CY = 205;
const RADAR_R = 128;
const RADAR_LABEL_R = RADAR_R + 26;
const RADAR_RING_LEVELS = [20, 40, 60, 80, 100];

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatIntOrNull(value: number | null | undefined): string {
  return isFiniteNumber(value) ? intFormatter.format(value) : NO_DATA;
}

/**เฉพาะตัวเลข ล้านบาท (คืน "ไม่มีข้อมูล" เมื่อค่าเป็น null/ไม่ finite) */
function formatMillions(valueTHB: number | null | undefined): string {
  return isFiniteNumber(valueTHB) ? millionsFormatter.format(valueTHB / 1_000_000) : NO_DATA;
}

function formatBahtMillions(valueTHB: number | null | undefined): string {
  return isFiniteNumber(valueTHB) ? `${millionsFormatter.format(valueTHB / 1_000_000)} ล้านบาท` : NO_DATA;
}

function formatPct(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${compactFormatter.format(value)}%` : NO_DATA;
}

function formatScore(value: number | null | undefined): string {
  return isFiniteNumber(value) ? decimalFormatter.format(value) : NO_DATA;
}

/** จัดรูปแบบ THB สั้น ๆ แบบ ล้าน / พันล้าน บาท สำหรับส่วนสรุป */
function formatTHBCompact(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return NO_DATA;
  if (value >= 1_000_000_000) return `${compactFormatter.format(value / 1_000_000_000)} พันล้าน บาท`;
  if (value >= 1_000_000) return `${compactFormatter.format(value / 1_000_000)} ล้าน บาท`;
  if (value >= 1_000) return `${intFormatter.format(Math.round(value))} บาท`;
  return `${decimalFormatter.format(value)} บาท`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFC').toLowerCase().trim();
}

function matchesText(coop: CooperativeRecord, rawQuery: string): boolean {
  const needle = normalizeText(rawQuery);
  if (needle === '') return true;
  return [coop.name, coop.provinceName, coop.typeLabel, coop.region].some((field) =>
    normalizeText(field).includes(needle),
  );
}

const TIER_BADGE_CLASS: Record<CamelClass, string> = {
  tier1: styles.badgeTier1,
  tier2: styles.badgeTier2,
  tier3: styles.badgeTier3,
};

type CoopSortKey = 'name' | 'memberCount' | 'businessValueTHB' | 'composite';
type SortDir = 'asc' | 'desc';

function sortValueOf(coop: CooperativeRecord, key: CoopSortKey): number | string {
  switch (key) {
    case 'name':
      return coop.name.normalize('NFC');
    case 'memberCount':
      return coop.memberCount;
    case 'businessValueTHB':
      return coop.businessValueTHB;
    case 'composite':
      return coop.camel.composite;
    default:
      return 0;
  }
}

function compareCoops(a: CooperativeRecord, b: CooperativeRecord, key: CoopSortKey, dir: SortDir): number {
  const va = sortValueOf(a, key);
  const vb = sortValueOf(b, key);
  let result: number;
  if (typeof va === 'string' || typeof vb === 'string') {
    result = String(va).localeCompare(String(vb), 'th');
  } else {
    result = va - vb;
  }
  return dir === 'asc' ? result : -result;
}

type FilteredStats = {
  coopCount: number;
  memberCount: number;
  businessValueTHB: number;
  collectionTons: number;
  supplyCreditValueTHB: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  tier1SharePct: number | null;
  avgComposite: number | null;
  provinceCount: number;
  regionCount: number;
};

/** คำนวณ KPI จากรายการที่ผ่านตัวกรองปัจจุบันเท่านั้น (ค่า null ถูกข้าม ไม่กลายเป็น 0) */
function deriveStats(rows: CooperativeRecord[]): FilteredStats {
  let memberCount = 0;
  let businessValueTHB = 0;
  let collectionTons = 0;
  let supplyCreditValueTHB = 0;
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  let compositeSum = 0;

  rows.forEach((coop) => {
    if (isFiniteNumber(coop.memberCount)) memberCount += coop.memberCount;
    if (isFiniteNumber(coop.businessValueTHB)) businessValueTHB += coop.businessValueTHB;
    if (isFiniteNumber(coop.collectionTotalTons)) collectionTons += coop.collectionTotalTons;
    if (isFiniteNumber(coop.supplyCreditValueTHB)) supplyCreditValueTHB += coop.supplyCreditValueTHB;
    if (isFiniteNumber(coop.camel.composite)) compositeSum += coop.camel.composite;
    if (coop.camel.camelClass === 'tier1') tier1Count += 1;
    else if (coop.camel.camelClass === 'tier2') tier2Count += 1;
    else tier3Count += 1;
  });

  return {
    coopCount: rows.length,
    memberCount,
    businessValueTHB,
    collectionTons,
    supplyCreditValueTHB,
    tier1Count,
    tier2Count,
    tier3Count,
    tier1SharePct: rows.length > 0 ? (tier1Count / rows.length) * 100 : null,
    avgComposite: rows.length > 0 ? compositeSum / rows.length : null,
    provinceCount: new Set(rows.map((coop) => coop.provinceCode)).size,
    regionCount: new Set(rows.map((coop) => coop.region)).size,
  };
}

type DimensionAverage = {
  id: CamelDimension;
  label: string;
  labelEn: string;
  mean: number | null;
};

function deriveDimensionAverages(rows: CooperativeRecord[]): DimensionAverage[] {
  const template = rows[0]?.camel.dimensions;
  if (!template || template.length === 0) return [];
  const sums = template.map(() => 0);
  const counts = template.map(() => 0);
  rows.forEach((coop) => {
    coop.camel.dimensions.forEach((dimension, index) => {
      if (index < sums.length && isFiniteNumber(dimension.score)) {
        sums[index] += dimension.score;
        counts[index] += 1;
      }
    });
  });
  return template.map((dimension, index) => ({
    id: dimension.id,
    label: dimension.label,
    labelEn: dimension.labelEn,
    mean: counts[index] > 0 ? sums[index] / counts[index] : null,
  }));
}

function radarAngle(index: number): number {
  return ((-90 + index * 60) * Math.PI) / 180;
}

function radarPoint(index: number, distance: number): { x: number; y: number } {
  const angle = radarAngle(index);
  return { x: RADAR_CX + Math.cos(angle) * distance, y: RADAR_CY + Math.sin(angle) * distance };
}

function radarRingPoints(level: number, axisCount: number): string {
  return Array.from({ length: axisCount }, (_, index) => {
    const point = radarPoint(index, (RADAR_R * level) / 100);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(' ');
}

function scorePolygon(scores: Array<number | null>, axisCount: number): string | null {
  if (axisCount === 0) return null;
  if (scores.some((score) => !isFiniteNumber(score))) return null;
  return scores
    .map((score, index) => {
      const point = radarPoint(index, (RADAR_R * clampPercent(score as number)) / 100);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(' ');
}

export function CooperativesDashboard({ payload }: CooperativesDashboardProps) {
  const [region, setRegion] = useState<string>('all');
  const [provinceCode, setProvinceCode] = useState<string>('all');
  const [coopType, setCoopType] = useState<CoopType | 'all'>('all');
  const [camelClass, setCamelClass] = useState<CamelClass | 'all'>('all');
  const [query, setQuery] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>(() => payload.cooperatives[0]?.id ?? '');
  const [sortKey, setSortKey] = useState<CoopSortKey>('businessValueTHB');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [coopVisible, setCoopVisible] = useState<number>(COOP_TABLE_CAP_STEP);
  const [provinceVisible, setProvinceVisible] = useState<number>(PROVINCE_TABLE_CAP_STEP);

  const filteredCoops = useMemo(
    () =>
      payload.cooperatives.filter(
        (coop) =>
          (region === 'all' || coop.region === region) &&
          (provinceCode === 'all' || coop.provinceCode === provinceCode) &&
          (coopType === 'all' || coop.type === coopType) &&
          (camelClass === 'all' || coop.camel.camelClass === camelClass) &&
          matchesText(coop, query),
      ),
    [payload.cooperatives, region, provinceCode, coopType, camelClass, query],
  );

  const sortedCoops = useMemo(() => {
    const rows = [...filteredCoops];
    rows.sort((a, b) => compareCoops(a, b, sortKey, sortDir));
    return rows;
  }, [filteredCoops, sortKey, sortDir]);

  const filteredStats = useMemo(() => deriveStats(filteredCoops), [filteredCoops]);
  const dimensionAverages = useMemo(() => deriveDimensionAverages(filteredCoops), [filteredCoops]);

  const selectedCoop = useMemo(
    () => sortedCoops.find((coop) => coop.id === selectedId) ?? sortedCoops[0] ?? null,
    [sortedCoops, selectedId],
  );

  const provinceGroups = useMemo(
    () => groupProvinces(payload.filterOptions.provinces, payload.filterOptions.regions),
    [payload.filterOptions.provinces, payload.filterOptions.regions],
  );

  const sortedProvinces = useMemo(() => {
    // เรียงถาวรตามมูลค่าธุรกิจมากสุดก่อน — ไม่ผูกกับปุ่มเรียงของตารางสหกรณ์
    const rows = [...payload.byProvince];
    rows.sort((a, b) => b.businessValueTHB - a.businessValueTHB);
    return rows;
  }, [payload.byProvince]);

  const hasActiveFilter =
    region !== 'all' ||
    provinceCode !== 'all' ||
    coopType !== 'all' ||
    camelClass !== 'all' ||
    normalizeText(query) !== '';

  const isSelectionFallback = selectedCoop !== null && selectedCoop.id !== selectedId;

  function resetFilters() {
    setRegion('all');
    setProvinceCode('all');
    setCoopType('all');
    setCamelClass('all');
    setQuery('');
    setCoopVisible(COOP_TABLE_CAP_STEP);
  }

  function toggleSort(key: CoopSortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'name' ? 'asc' : 'desc');
  }

  function ariaSortOf(key: CoopSortKey): 'ascending' | 'descending' | 'none' {
    if (key !== sortKey) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  return (
    <div className={styles.container}>
      <KpiSection stats={filteredStats} summary={payload.summary} filtered={hasActiveFilter} />

      <section className={styles.filterCard} aria-label="ตัวกรองสหกรณ์และกลุ่มเกษตรกร">
        <div className={styles.filterGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="coop-region">
              ภาค
            </label>
            <select
              id="coop-region"
              className={styles.control}
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            >
              <option value="all">ทุกภาค ({payload.filterOptions.regions.length})</option>
              {payload.filterOptions.regions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="coop-province">
              จังหวัด (จัดกลุ่มตามภาค)
            </label>
            <select
              id="coop-province"
              className={styles.control}
              value={provinceCode}
              onChange={(event) => setProvinceCode(event.target.value)}
            >
              <option value="all">ทุกจังหวัด ({payload.filterOptions.provinces.length})</option>
              {provinceGroups.map((group) => (
                <optgroup key={group.region} label={group.region}>
                  {group.provinces.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="coop-type">
              ประเภทสหกรณ์/กลุ่ม
            </label>
            <select
              id="coop-type"
              className={styles.control}
              value={coopType}
              onChange={(event) => setCoopType(event.target.value as CoopType | 'all')}
            >
              <option value="all">ทุกประเภท ({payload.filterOptions.types.length})</option>
              {payload.filterOptions.types.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="coop-class">
              ชั้น CAMELS
            </label>
            <select
              id="coop-class"
              className={styles.control}
              value={camelClass}
              onChange={(event) => setCamelClass(event.target.value as CamelClass | 'all')}
            >
              <option value="all">ทุกชั้น ({payload.filterOptions.classes.length})</option>
              {payload.filterOptions.classes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`${styles.field} ${styles.fieldSearch}`}>
            <label className={styles.fieldLabel} htmlFor="coop-query">
              ค้นชื่อสหกรณ์ / จังหวัด / ประเภท / ภาค
            </label>
            <span className={styles.searchField}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                id="coop-query"
                type="search"
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-describedby="coop-query-hint"
                placeholder="เช่น สหกรณ์ / ชลบุรี / ข้าว"
              />
            </span>
            <span id="coop-query-hint" className={styles.fieldHint}>
              ข้อความที่พิมพ์จะเทียบกับชื่อสหกรณ์ จังหวัด ประเภท และภาค โดยไม่แยกตัวพิมพ์ใหญ่-เล็ก
            </span>
          </div>
        </div>

        <div className={styles.chipRow}>
          <span className={styles.chipLabel}>สถานะข้อมูล:</span>
          <span className={styles.chip}>ชุดตัวอย่าง (sample)</span>
          <span className={styles.chip}>สิทธิ์: รอตรวจสอบ (metadata-only)</span>
          <span className={styles.chip}>หลักฐาน: ยังไม่ตรวจสอบ</span>
        </div>

        <div className={styles.filterFooter}>
          <span className={styles.filterSummary} role="status" aria-live="polite">
            ตรงกับตัวกรอง <strong>{intFormatter.format(filteredCoops.length)}</strong> จาก{' '}
            {intFormatter.format(payload.cooperatives.length)} รายการที่หน้าเว็บได้รับ
          </span>
          <button
            type="button"
            className={styles.resetButton}
            onClick={resetFilters}
            disabled={!hasActiveFilter}
          >
            ล้างตัวกรอง
          </button>
        </div>
      </section>

      <CamelSection
        coop={selectedCoop}
        averages={dimensionAverages}
        rowCount={filteredCoops.length}
        isFallback={isSelectionFallback}
      />

      <section className={styles.section} aria-label="รายการสหกรณ์ตามเงื่อนไขที่เลือก">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>ทะเบียนสหกรณ์และกลุ่ม (ข้อมูลตัวอย่าง)</span>
            <h2 className={styles.sectionTitle}>ตารางสหกรณ์/กลุ่ม</h2>
          </div>
          <span className={styles.sectionMeta}>
            คลิกชื่อสหกรณ์ในช่องแรก (หรือที่แถว) เพื่อเลือกให้เรดาร์ CAMELS แสดงรายนั้น
          </span>
        </header>

        {sortedCoops.length === 0 ? (
          <div className={styles.emptyState} role="status">
            <Icon name="search" size={26} />
            <p className={styles.emptyTitle}>ไม่พบสหกรณ์/กลุ่มที่ตรงกับตัวกรอง</p>
            <p className={styles.emptyText}>
              ชุดข้อมูลตัวอย่างมีเฉพาะโครงสร้างที่จำลองไว้ ลองเลือกภาค/จังหวัด/ประเภท/ชั้นใหม่ หรือล้างตัวกรอง
              เพื่อกลับไปแสดงทุกรายการที่หน้าเว็บได้รับ
            </p>
            <button type="button" className={styles.resetButton} onClick={resetFilters}>
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th scope="col" className={styles.nameCell} aria-sort={ariaSortOf('name')}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleSort('name')}
                      >
                        ชื่อสหกรณ์/กลุ่ม
                        <span className={styles.sortGlyph}>
                          {sortKey === 'name' ? sortGlyph(sortDir) : ''}
                        </span>
                      </button>
                      <span className={styles.cellNote}>(นามสมมติ)</span>
                    </th>
                    <th scope="col">ประเภท</th>
                    <th scope="col">จังหวัด / ภาค</th>
                    <th scope="col" aria-sort={ariaSortOf('memberCount')} className={styles.numericCell}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleSort('memberCount')}
                      >
                        สมาชิก
                        <span className={styles.sortGlyph}>
                          {sortKey === 'memberCount' ? sortGlyph(sortDir) : ''}
                        </span>
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSortOf('businessValueTHB')} className={styles.numericCell}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleSort('businessValueTHB')}
                      >
                        มูลค่าธุรกิจ (ล้านบาท)
                        <span className={styles.sortGlyph}>
                          {sortKey === 'businessValueTHB' ? sortGlyph(sortDir) : ''}
                        </span>
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSortOf('composite')} className={styles.numericCell}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => toggleSort('composite')}
                      >
                        แต้ม CAMELS
                        <span className={styles.sortGlyph}>
                          {sortKey === 'composite' ? sortGlyph(sortDir) : ''}
                        </span>
                      </button>
                    </th>
                    <th scope="col">ชั้น</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCoops.slice(0, coopVisible).map((coop) => (
                    <CoopRow
                      key={coop.id}
                      coop={coop}
                      isSelected={selectedCoop?.id === coop.id}
                      onSelect={() => setSelectedId(coop.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {coopVisible < sortedCoops.length ? (
              <div className={styles.moreRow}>
                <button
                  type="button"
                  className={styles.moreButton}
                  onClick={() => setCoopVisible((prev) => prev + COOP_TABLE_CAP_STEP)}
                >
                  แสดงเพิ่ม (เหลืออีก {intFormatter.format(sortedCoops.length - coopVisible)} รายการ)
                </button>
              </div>
            ) : (
              <p className={styles.moreNote}>แสดงครบทุกรายการที่ผ่านตัวกรองแล้ว</p>
            )}
          </>
        )}
      </section>

      <CollectionSection coop={selectedCoop} />

      <div className={styles.panelGrid}>
        <TypeBars rows={payload.byType} />
        <ClassDistribution rows={payload.byClass} national={payload.summary} />
      </div>

      <ProvinceTable
        rows={sortedProvinces}
        visible={provinceVisible}
        onShowMore={() => setProvinceVisible((prev) => prev + PROVINCE_TABLE_CAP_STEP)}
      />

      <section className={styles.section} aria-label="ข้อจำกัดของชุดข้อมูล">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Provenance</span>
            <h2 className={styles.sectionTitle}>ข้อจำกัดที่ต้องอ่านร่วมกัน</h2>
          </div>
        </header>
        <p className={styles.coverageNote}>{payload.coverageNote}</p>
        {payload.warnings.length > 0 ? (
          <div className={styles.warningBlock}>
            <span className={styles.expandLabel}>
              ข้อควรระวังของชุดข้อมูล ({intFormatter.format(payload.warnings.length)} รายการ)
            </span>
            <ul className={styles.warningList}>
              {payload.warnings.map((warning) => (
                <li key={warning} className={styles.warningItem}>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className={styles.datasetMeta}>
          เวอร์ชันชุดข้อมูล <code>{payload.datasetVersion}</code> · อ้างอิง ณ วันที่{' '}
          <code>{payload.dataAsOf}</code> · สถานะการเข้าถึง <code>{payload.access}</code> · แหล่งอ้างอิง{' '}
          {intFormatter.format(payload.sources.length)} รายการ
        </p>
      </section>
    </div>
  );
}

function sortGlyph(dir: SortDir): string {
  return dir === 'asc' ? '↑ น้อยสุดก่อน' : '↓ มากสุดก่อน';
}

function groupProvinces(
  provinces: CooperativesPayload['filterOptions']['provinces'],
  regionOrder: string[],
) {
  const map = new Map<string, CooperativesPayload['filterOptions']['provinces']>();
  provinces.forEach((province) => {
    const arr = map.get(province.region);
    if (arr) arr.push(province);
    else map.set(province.region, [province]);
  });
  const groups: Array<{ region: string; provinces: CooperativesPayload['filterOptions']['provinces'] }> = [];
  regionOrder.forEach((region) => {
    const arr = map.get(region);
    if (arr && arr.length > 0) {
      groups.push({ region, provinces: [...arr].sort((a, b) => a.name.localeCompare(b.name, 'th')) });
      map.delete(region);
    }
  });
  map.forEach((arr, region) =>
    groups.push({ region, provinces: [...arr].sort((a, b) => a.name.localeCompare(b.name, 'th')) }),
  );
  return groups;
}

function KpiSection({
  stats,
  summary,
  filtered,
}: {
  stats: FilteredStats;
  summary: CooperativesPayload['summary'];
  filtered: boolean;
}) {
  return (
    <section className={styles.section} aria-label="ตัวชี้วัดภาพรวมตามเงื่อนไขที่เลือก">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ตามเงื่อนไขที่เลือก</span>
          <h2 className={styles.sectionTitle}>ตัวชี้วัดสหกรณ์/กลุ่ม</h2>
        </div>
        <span className={styles.sectionMeta}>
          {filtered
            ? 'ตัวเลขคำนวณจากรายการที่ผ่านตัวกรองปัจจุบันเท่านั้น · เป็นข้อมูลตัวอย่าง'
            : `ตัวเลขคำนวณทุกรายการที่หน้าเว็บได้รับ (${intFormatter.format(stats.coopCount)} รายการ) · เป็นข้อมูลตัวอย่าง`}
        </span>
      </header>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="catalog" size={14} /> สหกรณ์/กลุ่มทั้งหมด
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(stats.coopCount)} <span className={styles.kpiUnit}>แห่ง</span>
          </span>
          <span className={styles.kpiNote}>
            ทั้งชุดทะเบียน {formatIntOrNull(summary.totalCooperatives)} แห่ง · กระจายใน {formatIntOrNull(stats.provinceCount)}{' '}
            จังหวัด / {formatIntOrNull(stats.regionCount)} ภาค
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="layers" size={14} /> สมาชิก
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(stats.memberCount)} <span className={styles.kpiUnit}>ราย</span>
          </span>
          <span className={styles.kpiNote}>
            ทั้งชุดทะเบียนมี {formatIntOrNull(summary.totalMembers)} ราย (ข้อมูลตัวอย่าง)
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="chart" size={14} /> มูลค่าธุรกิจรวม
          </span>
          <span className={styles.kpiValue}>{formatBahtMillions(stats.businessValueTHB)}</span>
          <span className={styles.kpiNote}>
            หน่วย ล้านบาท (ทศนิยม 1-2 ตำแหน่ง) · ทั้งชุดทะเบียน{' '}
            {formatMillions(summary.totalBusinessValueTHB)} ล้านบาท
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="leaf" size={14} /> สหกรณ์ชั้น 1
          </span>
          <span className={styles.kpiValue}>
            {formatPct(stats.tier1SharePct)} <span className={styles.kpiUnit}>ของรายการที่แสดง</span>
          </span>
          <span className={styles.kpiNote}>
            ชั้น 1 {formatIntOrNull(stats.tier1Count)} · ชั้น 2 {formatIntOrNull(stats.tier2Count)} · ชั้น 3{' '}
            {formatIntOrNull(stats.tier3Count)} แห่ง · ทั้งชุดทะเบียน {formatPct(summary.tier1SharePct)}
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="info" size={14} /> แต้ม CAMELS เฉลี่ย
          </span>
          <span className={styles.kpiValue}>
            {formatScore(stats.avgComposite)} <span className={styles.kpiUnit}>/ 100</span>
          </span>
          <span className={styles.kpiNote}>
            ค่าเฉลี่ย composite จากรายการที่กรอง · ทั้งชุดทะเบียน{' '}
            {formatScore(summary.avgCamelComposite)} (โมเดลสาธิต ไม่ใช่การจัดชั้นของกรม)
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="water" size={14} /> ปริมาณรวบรวมรวม
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(stats.collectionTons)} <span className={styles.kpiUnit}>ตัน</span>
          </span>
          <span className={styles.kpiNote}>
            ทั้งชุดทะเบียน {formatIntOrNull(summary.totalCollectionTons)} ตัน · สินเชื่อที่จ่ายให้สมาชิก{' '}
            {formatTHBCompact(stats.supplyCreditValueTHB)}
          </span>
        </div>
      </div>

      <p className={styles.kpiFootnote}>
        <Icon name="info" size={15} />
        <span>
          ตัวเลขทุกช่องในแถบนี้คำนวณจากรายการที่ผ่านตัวกรองปัจจุบันบนหน้าเดียวกัน ห้ามใช้ค่ารวมระดับประเทศ
          ใต้มุมมองที่ถูกกรอง และทั้งหมดเป็นข้อมูลตัวอย่างเชิงโครงสร้างที่ยังไม่ตรวจสอบสิทธิ์เผยแพร่
        </span>
      </p>
    </section>
  );
}

function CamelSection({
  coop,
  averages,
  rowCount,
  isFallback,
}: {
  coop: CooperativeRecord | null;
  averages: DimensionAverage[];
  rowCount: number;
  isFallback: boolean;
}) {
  return (
    <section className={styles.section} aria-label="เรดาร์คะแนน CAMELS หกมิติ">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>CAMELS · มาตราส่วนความแข็งแรง 0-100 (ยิ่งสูงยิ่งดี)</span>
          <h2 className={styles.sectionTitle}>เรดาร์ความแข็งแรงรายสหกรณ์</h2>
        </div>
        <span className={styles.sectionMeta}>
          เส้นทึบ = รายการที่เลือก · เส้นประ = ค่าเฉลี่ย 6 มิติของ {intFormatter.format(rowCount)} รายการที่กรอง
        </span>
      </header>

      {coop === null ? (
        <div className={styles.emptyState} role="status">
          <Icon name="chart" size={26} />
          <p className={styles.emptyTitle}>ไม่มีรายการที่เลือกเพื่อแสดงเรดาร์</p>
          <p className={styles.emptyText}>
            เมื่อไม่มีรายการผ่านตัวกรอง จะไม่วาดรูปหลายเหลี่ยมและจะไม่แทนค่าที่ขาดหายด้วย 0 กรุณาล้างตัวกรอง
            หรือเลือกเงื่อนไขที่มีข้อมูลในชุดตัวอย่าง
          </p>
        </div>
      ) : (
        <div className={styles.radarGrid}>
          <div className={styles.radarPanel}>
            <CamelRadar coop={coop} averages={averages} />
            {isFallback ? (
              <p className={styles.radarNote}>
                บัญชีที่เลือกไว้ไม่ผ่านตัวกรองปัจจุบัน จึงแสดง “
                {coop.name}
                ” ซึ่งเป็นลำดับแรกของการเรียงในชุดที่กรองแทน
              </p>
            ) : null}
          </div>
          <DimensionDetail coop={coop} averages={averages} />
        </div>
      )}
    </section>
  );
}

function CamelRadar({ coop, averages }: { coop: CooperativeRecord; averages: DimensionAverage[] }) {
  const dims = coop.camel.dimensions;
  const axisCount = dims.length;
  const coopPoints = scorePolygon(
    dims.map((dimension) => dimension.score),
    axisCount,
  );
  const avgPoints = scorePolygon(
    averages.map((item) => item.mean),
    axisCount,
  );

  const scoresForAria = dims.map((dimension) => `${dimension.label} ${intFormatter.format(dimension.score)}`).join(', ');
  const ariaLabel =
    `เรดาร์ CAMELS ของ ${coop.name}: คะแนนความแข็งแรง 0-100 แต่ละมิติ — ${scoresForAria}; ` +
    `composite ${formatScore(coop.camel.composite)} จัดชั้น ${coop.camel.classLabel}` +
    (avgPoints ? '; เส้นประคือค่าเฉลี่ยของรายการที่กรอง' : '');

  return (
    <div className={styles.radarSvgWrap}>
      <svg
        className={styles.radarSvg}
        viewBox={`0 0 ${RADAR_VIEW_W} ${RADAR_VIEW_H}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{`เรดาร์ CAMELS หกมิติ — ${coop.name}`}</title>

        {RADAR_RING_LEVELS.map((level) => (
          <polygon
            key={`ring-${level}`}
            className={styles.ringPoly}
            points={radarRingPoints(level, axisCount)}
          />
        ))}

        {Array.from({ length: axisCount }, (_, index) => {
          const outer = radarPoint(index, RADAR_R);
          return (
            <line
              key={`axis-${index}`}
              className={styles.axisLine}
              x1={RADAR_CX}
              y1={RADAR_CY}
              x2={outer.x.toFixed(1)}
              y2={outer.y.toFixed(1)}
            />
          );
        })}

        {RADAR_RING_LEVELS.map((level) => (
          <text
            key={`ring-label-${level}`}
            className={styles.ringLabel}
            x={RADAR_CX + 6}
            y={RADAR_CY - (RADAR_R * level) / 100 + 4}
            textAnchor="start"
          >
            {level}
          </text>
        ))}

        {avgPoints ? (
          <polygon className={styles.polyAverage} points={avgPoints}>
            <title>{`ค่าเฉลี่ย CAMELS รายมิติของรายการที่กรอง · เฉลี่ย composite ${formatScore(averageOfMeans(averages))}`}</title>
          </polygon>
        ) : null}

        {coopPoints ? <polygon className={styles.polySelected} points={coopPoints} /> : null}

        {coopPoints
          ? dims.map((dimension, index) => {
              const vertex = radarPoint(index, (RADAR_R * clampPercent(dimension.score)) / 100);
              return (
                <circle
                  key={`vertex-${dimension.id}`}
                  className={styles.vertexDot}
                  cx={vertex.x.toFixed(1)}
                  cy={vertex.y.toFixed(1)}
                  r={3.4}
                />
              );
            })
          : null}

        {dims.map((dimension, index) => {
          const angle = radarAngle(index);
          const cos = Math.cos(angle);
          const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
          const point = radarPoint(index, RADAR_LABEL_R);
          return (
            <g key={`label-${dimension.id}`} className={styles.vertexGroup}>
              <text className={styles.vertexLabel} x={point.x.toFixed(1)} y={(point.y - 6).toFixed(1)} textAnchor={anchor}>
                {dimension.label}
              </text>
              <text className={styles.vertexScore} x={point.x.toFixed(1)} y={(point.y + 9).toFixed(1)} textAnchor={anchor}>
                {intFormatter.format(dimension.score)}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchSelected}`} aria-hidden="true" />
          <span className={styles.legendText}>
            เส้นทึบ (มีพื้นโปร่ง) — {coop.name} · แต้มรวม {formatScore(coop.camel.composite)} ·{' '}
            {coop.camel.classLabel}
          </span>
        </li>
        <li className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchAverage}`} aria-hidden="true" />
          <span className={styles.legendText}>
            เส้นประ — ค่าเฉลี่ยรายมิติของสหกรณ์/กลุ่มที่กรองอยู่ตอนนี้ (เฉลี่ย composite{' '}
            {formatScore(averages.length > 0 ? averageOfMeans(averages) : null)})
          </span>
        </li>
      </ul>
      <p className={styles.radarFootnote}>
        ทุกแกนใช้มาตราส่วนเดียวกัน 0-100 โดย 100 คือแข็งแรงที่สุด รวมทั้งแกน Sensitivity ซึ่งวัด
        “ความสามารถในการรับมือความเสี่ยง” ไม่ใช่ระดับความเสี่ยง
      </p>
    </div>
  );
}

function averageOfMeans(averages: DimensionAverage[]): number | null {
  const known = averages.filter((item) => isFiniteNumber(item.mean)).map((item) => item.mean as number);
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

function DimensionDetail({ coop, averages }: { coop: CooperativeRecord; averages: DimensionAverage[] }) {
  return (
    <div className={styles.radarSide}>
      <div className={styles.sideHead}>
        <h3 className={styles.sideTitle}>{coop.name}</h3>
        <span className={styles.sideSub}>
          {coop.typeLabel} · {coop.provinceName} ({coop.provinceCode}) · {coop.region}
        </span>
        <span className={styles.sideSub}>
          ประเมินปี <code>{coop.camel.assessedYear}</code> · เลขทะเบียน {coop.registrationNo}{' '}
          <em>(ตัวอย่าง)</em>
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.tableCaption}>
            คะแนน CAMELS รายมิติของ {coop.name} พร้อมคำอธิบาย (ข้อมูลตัวอย่าง)
          </caption>
          <thead className={styles.tableHead}>
            <tr>
              <th scope="col">มิติ</th>
              <th scope="col" className={styles.numericCell}>
                คะแนน
              </th>
              <th scope="col" className={styles.numericCell}>
                เฉลี่ยที่กรอง
              </th>
              <th scope="col">ข้อสังเกต</th>
            </tr>
          </thead>
          <tbody>
            {coop.camel.dimensions.map((dimension, index) => (
              <tr key={dimension.id}>
                <th scope="row" className={styles.rowHead}>
                  {dimension.label}
                  <span className={styles.rowSub}>{dimension.labelEn}</span>
                </th>
                <td className={styles.numericCell}>{intFormatter.format(dimension.score)}</td>
                <td className={styles.numericCell}>{formatScore(averages[index]?.mean)}</td>
                <td className={styles.textCell}>{dimension.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className={styles.factList}>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>สมาชิก</dt>
          <dd className={styles.factValue}>{formatIntOrNull(coop.memberCount)} ราย</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>มูลค่าธุรกิจ</dt>
          <dd className={styles.factValue}>{formatBahtMillions(coop.businessValueTHB)}</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>เงินทุนหมุนเวียน</dt>
          <dd className={styles.factValue}>{formatBahtMillions(coop.workingCapitalTHB)}</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>สินเชื่อที่จ่ายให้สมาชิก</dt>
          <dd className={styles.factValue}>{formatBahtMillions(coop.supplyCreditValueTHB)}</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>ปริมาณรวบรวมรวม</dt>
          <dd className={styles.factValue}>{formatIntOrNull(coop.collectionTotalTons)} ตัน</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>มูลค่ารวบรวมรวม</dt>
          <dd className={styles.factValue}>{formatBahtMillions(coop.collectionTotalValueTHB)}</dd>
        </div>
      </dl>

      <p className={styles.evidenceNote}>
        สถานะหลักฐาน: ยังไม่ตรวจสอบ (<code>not_verified</code>) · อ้างอิงแหล่ง {intFormatter.format(coop.sourceIds.length)}{' '}
        รายการ · คะแนนนี้เป็นผลลัพธ์จากโมเดลสาธิต ไม่ใช่การจัดชั้นที่หน่วยงานประกาศ
      </p>
    </div>
  );
}

function CoopRow({
  coop,
  isSelected,
  onSelect,
}: {
  coop: CooperativeRecord;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr className={isSelected ? `${styles.row} ${styles.rowSelected}` : styles.row} onClick={onSelect}>
      <th scope="row" className={styles.rowHead}>
        <button type="button" className={styles.selectButton} onClick={onSelect}>
          {coop.name}
        </button>
        <span className={styles.rowSub}>
          {coop.registrationNo} · เลขทะเบียนตัวอย่าง · คลิกเลือกเพื่อแสดงเรดาร์
        </span>
      </th>
      <td className={styles.textCell}>{coop.typeLabel}</td>
      <td className={styles.textCell}>
        {coop.provinceName}
        <span className={styles.rowSub}>
          รหัส {coop.provinceCode} · {coop.region}
        </span>
      </td>
      <td className={styles.numericCell}>{formatIntOrNull(coop.memberCount)}</td>
      <td className={styles.numericCell}>{formatMillions(coop.businessValueTHB)}</td>
      <td className={styles.numericCell}>{formatScore(coop.camel.composite)}</td>
      <td className={styles.textCell}>
        <span className={`${styles.classBadge} ${TIER_BADGE_CLASS[coop.camel.camelClass]}`}>
          {coop.camel.classLabel}
        </span>
      </td>
    </tr>
  );
}

function CollectionSection({ coop }: { coop: CooperativeRecord | null }) {
  return (
    <section className={styles.section} aria-label="เส้นทางการรวบรวมผลผลิต 4 ชนิดของสหกรณ์ที่เลือก">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>การรวบรวมผลผลิต (รายสินค้า)</span>
          <h2 className={styles.sectionTitle}>ปริมาณ ราคา และมูลค่ารายสินค้า</h2>
        </div>
        <span className={styles.sectionMeta}>
          {coop ? coop.name : NO_DATA} · หน่วยตัน · ราคาเฉลี่ยต่อตันเป็นข้อมูลตัวอย่าง
        </span>
      </header>

      {coop === null ? (
        <p className={styles.nullValue}>{NO_DATA} — ยังไม่มีสหกรณ์ที่เลือกเพราะไม่มีรายการผ่านตัวกรอง</p>
      ) : coop.collection.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA} — รายการนี้ไม่มีเส้นการรวบรวมผลผลิตในชุดตัวอย่าง</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.tableCaption}>
              เส้นการรวบรวมผลผลิตของ {coop.name} (ข้าวเปลือก ยางพารา ปาล์มน้ำมัน ข้าวโพดเลี้ยงสัตว์)
            </caption>
            <thead className={styles.tableHead}>
              <tr>
                <th scope="col">สินค้า</th>
                <th scope="col" className={styles.numericCell}>
                  ปริมาณ (ตัน)
                </th>
                <th scope="col" className={styles.numericCell}>
                  ราคาเฉลี่ย (บาท/ตัน)
                </th>
                <th scope="col" className={styles.numericCell}>
                  มูลค่า (ล้านบาท)
                </th>
              </tr>
            </thead>
            <tbody>
              {coop.collection.map((line: CoopCollectionLine) => (
                <tr key={line.commodity} className={styles.row}>
                  <th scope="row" className={styles.rowHead}>{line.label}</th>
                  <td className={styles.numericCell}>{formatIntOrNull(line.volumeTons)}</td>
                  <td className={styles.numericCell}>{formatIntOrNull(line.avgPricePerTonTHB)}</td>
                  <td className={styles.numericCell}>{formatMillions(line.valueTHB)}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <th scope="row" className={styles.rowHead}>
                  รวม {intFormatter.format(coop.collection.length)} เส้นสินค้า
                </th>
                <td className={styles.numericCell}>{formatIntOrNull(coop.collectionTotalTons)}</td>
                <td className={styles.numericCell}>{NO_DATA}</td>
                <td className={styles.numericCell}>{formatMillions(coop.collectionTotalValueTHB)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.tableFootNote}>
        ค่าว่างแสดงเป็น “ไม่มีข้อมูล” ไม่แปลงเป็น 0 และไม่บวก subtotal ซ้ำกับรายการรายสายสินค้า
      </p>
    </section>
  );
}

function TypeBars({ rows }: { rows: CooperativesPayload['byType'] }) {
  const maxCount = rows.reduce((max, item) => Math.max(max, item.coopCount), 0);
  return (
    <section className={styles.section} aria-label="สรุปตามประเภทสหกรณ์ (ภาพรวมทั้งชุดตัวอย่าง)">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ภาพรวมทั้งชุด (ไม่ตามตัวกรอง)</span>
          <h2 className={styles.sectionTitle}>สรุปตามประเภท</h2>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA}</p>
      ) : (
        <ul className={styles.barList}>
          {rows.map((item) => {
            const width = maxCount > 0 ? clampPercent((item.coopCount / maxCount) * 100) : 0;
            return (
              <li key={item.type} className={styles.barRow}>
                <div className={styles.barHead}>
                  <span className={styles.barLabel}>{item.label}</span>
                  <span className={styles.barMeta}>
                    {intFormatter.format(item.coopCount)} แห่ง · {intFormatter.format(item.memberCount)} ราย ·{' '}
                    เฉลี่ย {formatScore(item.avgCamelComposite)} แต้ม · {formatBahtMillions(item.businessValueTHB)}
                  </span>
                </div>
                <span
                  className={styles.barTrack}
                  role="img"
                  aria-label={`${item.label}: ${intFormatter.format(item.coopCount)} แห่ง จากสูงสุด ${intFormatter.format(maxCount)} แห่ง`}
                >
                  <span className={styles.barFill} style={{ width: `${width}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ClassDistribution({
  rows,
  national,
}: {
  rows: CooperativesPayload['byClass'];
  national: CooperativesPayload['summary'];
}) {
  const total = rows.reduce((sum, item) => sum + item.coopCount, 0);
  return (
    <section className={styles.section} aria-label="การกระจายชั้น CAMELS (ภาพรวมทั้งชุดตัวอย่าง)">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ภาพรวมทั้งชุด (ไม่ตามตัวกรอง)</span>
          <h2 className={styles.sectionTitle}>การกระจายชั้น CAMELS</h2>
        </div>
        <span className={styles.sectionMeta}>
          ชั้น 1 {formatIntOrNull(national.tier1Count)} · ชั้น 2 {formatIntOrNull(national.tier2Count)} · ชั้น 3{' '}
          {formatIntOrNull(national.tier3Count)} แห่ง
        </span>
      </header>
      {rows.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA}</p>
      ) : (
        <ul className={styles.barList}>
          {rows.map((item) => {
            const share = total > 0 ? (item.coopCount / total) * 100 : 0;
            return (
              <li key={item.camelClass} className={styles.barRow}>
                <div className={styles.barHead}>
                  <span className={styles.barLabel}>{item.label}</span>
                  <span className={styles.barMeta}>
                    {intFormatter.format(item.coopCount)} แห่ง ({formatPct(share)}) · {intFormatter.format(item.memberCount)}{' '}
                    ราย · เฉลี่ย {formatScore(item.avgCamelComposite)} แต้ม
                  </span>
                </div>
                <span
                  className={styles.barTrack}
                  role="img"
                  aria-label={`${item.label}: ${intFormatter.format(item.coopCount)} แห่ง คิดเป็น ${formatPct(share)} ของทั้งชุด`}
                >
                  <span
                    className={`${styles.barFill} ${TIER_FILL_CLASS[item.camelClass]}`}
                    style={{ width: `${clampPercent(share)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.tableFootNote}>
        สัดส่วนคำนวณจากจำนวนสหกรณ์ในแต่ละชั้นของชุดตัวอย่าง การจัดชั้นเป็นผลลัพธ์จากโมเดลสาธิต
        ไม่ใช่ประกาศทางการของกรมส่งเสริมสหกรณ์
      </p>
    </section>
  );
}

const TIER_FILL_CLASS: Record<CamelClass, string> = {
  tier1: styles.barFillTier1,
  tier2: styles.barFillTier2,
  tier3: styles.barFillTier3,
};

function ProvinceTable({
  rows,
  visible,
  onShowMore,
}: {
  rows: CoopProvinceRollup[];
  visible: number;
  onShowMore: () => void;
}) {
  return (
    <section className={styles.section} aria-label="สรุปภาพรวมรายจังหวัด (ภาพรวมทั้งชุดตัวอย่าง)">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>
            ภาพรวมทั้งชุด · {intFormatter.format(rows.length)} จังหวัดที่มีรายการตัวอย่าง
          </span>
          <h2 className={styles.sectionTitle}>ตารางรายจังหวัด</h2>
        </div>
        <span className={styles.sectionMeta}>จังหวัดเป็นหมุดอ้างอิง ไม่ใช่ขอบเขตครอบคลุมข้อมูล</span>
      </header>

      {rows.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA}</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th scope="col" className={styles.nameCell}>
                    จังหวัด
                  </th>
                  <th scope="col">ภาค</th>
                  <th scope="col" className={styles.numericCell}>
                    สหกรณ์/กลุ่ม
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    สมาชิก (ราย)
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    รวบรวม (ตัน)
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    มูลค่าธุรกิจ (ล้านบาท)
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    ชั้น 1
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, visible).map((row) => (
                  <tr key={row.provinceCode} className={styles.row}>
                    <th scope="row" className={styles.rowHead}>
                      {row.provinceName}
                      <span className={styles.rowSub}>รหัส {row.provinceCode}</span>
                    </th>
                    <td className={styles.textCell}>{row.region}</td>
                    <td className={styles.numericCell}>{formatIntOrNull(row.coopCount)}</td>
                    <td className={styles.numericCell}>{formatIntOrNull(row.memberCount)}</td>
                    <td className={styles.numericCell}>{formatIntOrNull(row.collectionTons)}</td>
                    <td className={styles.numericCell}>{formatMillions(row.businessValueTHB)}</td>
                    <td className={styles.numericCell}>{formatIntOrNull(row.tier1Count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible < rows.length ? (
            <div className={styles.moreRow}>
              <button type="button" className={styles.moreButton} onClick={onShowMore}>
                แสดงเพิ่ม (เหลืออีก {intFormatter.format(rows.length - visible)} จังหวัด)
              </button>
            </div>
          ) : (
            <p className={styles.moreNote}>แสดงครบทุกจังหวัดที่มีรายการตัวอย่างแล้ว</p>
          )}
        </>
      )}
    </section>
  );
}
