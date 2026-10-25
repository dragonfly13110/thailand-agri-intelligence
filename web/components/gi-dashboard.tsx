'use client';

import { useMemo, useState } from 'react';
import type {
  GiCategory,
  GiControlStandard,
  GiDashboardPayload,
  GiProductCard,
  GiProvince,
} from '@/lib/hub/gi-data';
import { Icon } from './icon';
import styles from './gi-dashboard.module.css';

/**
 * แดชบอร์ด "สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์ (GI)" สำหรับหน้า /gi-products
 *
 * - รับ `payload` จาก server component เพียงทางเดียว โมดูลข้อมูลเป็นฝั่งเซิร์ฟเวอร์
 *   จึง import เฉพาะชนิดข้อมูล (type-only) เข้ามาใน client ไม่มีการ fetch ใน client
 * - ทุกตัวกรอง/การจัดเรียง/การเจาะลึก ทำด้วย useMemo บน payload.products
 * - แถบ KPI "ตามเงื่อนไขที่เลือก" คำนวณซ้ำจากรายการที่กรองแล้วเสมอ ไม่แสดงค่ารวม
 *   ระดับประเทศใต้มุมมองที่ถูกกรอง
 * - ค่า null หมายถึง "ยังไม่มีข้อมูล" แสดงเป็น "ไม่มีข้อมูล" ห้ามแปลงเป็น 0 หรือเว้นว่าง
 * - สี badge มาตรฐานมาจาก payload (badgeColor) และมีข้อความกำกับเสมอ สีไม่ใช่สัญญาณเดียว
 */

export interface GiDashboardProps {
  payload: GiDashboardPayload;
}

const NO_DATA = 'ไม่มีข้อมูล';
const PROVINCE_TABLE_CAP_STEP = 12;

const MONTH_LABELS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const NAME_ORIGIN_LABEL: Record<GiProductCard['nameOrigin'], string> = {
  known_gi_name: 'ชื่อ GI ที่รู้จัก',
  synthetic_sample: 'ชื่อสังเคราะห์สำหรับสาธิต',
};

const intFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const shortDecimalFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const compactFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatIntOrNull(value: number | null): string {
  return isFiniteNumber(value) ? intFormatter.format(value) : NO_DATA;
}

function formatDecimalOrNull(value: number | null, unit: string): string {
  if (!isFiniteNumber(value)) return NO_DATA;
  return `${shortDecimalFormatter.format(value)} ${unit}`.trim();
}

/** จัดรูปแบบ THB สั้น ๆ แบบ ล้าน / พันล้าน บาท สำหรับ KPI และตาราง */
function formatTHBCompact(value: number | null): string {
  if (!isFiniteNumber(value)) return NO_DATA;
  if (value >= 1_000_000_000) return `${compactFormatter.format(value / 1_000_000_000)} พันล้าน บาท`;
  if (value >= 1_000_000) return `${compactFormatter.format(value / 1_000_000)} ล้าน บาท`;
  if (value >= 1_000) return `${intFormatter.format(Math.round(value))} บาท`;
  return `${compactFormatter.format(value)} บาท`;
}

/** เลือกสีข้อความที่อ่านได้บนพื้น badgeColor (contrast ไม่ใช่สีเดียว) */
function readableTextColor(hex: string): string {
  const raw = (hex || '').replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  if (full.length !== 6) return '#21352b';
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#21352b';
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? '#21352b' : '#ffffff';
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function matchesText(product: GiProductCard, rawQuery: string): boolean {
  const needle = rawQuery.trim().toLowerCase();
  if (needle === '') return true;
  const haystack = [product.nameTh, product.commodity, product.provinceName, ...product.districts];
  if (product.nameEn) haystack.push(product.nameEn);
  return haystack.some((field) => (field ?? '').toLowerCase().includes(needle));
}

type DerivedSummary = {
  totalProducts: number;
  provinceCountWithData: number;
  regionCount: number;
  totalAreaRai: number;
  totalFarmCount: number;
  totalMarketValueTHB: number;
  internalControlProducts: number;
  externalControlProducts: number;
  avgPricePerKgTHB: number | null;
};

/**
 * คำนวณ KPI จากรายการที่ผ่านตัวกรองปัจจุบันเท่านั้น
 * - ค่า null ไม่ถูกบวกเป็น 0 (ข้ามไป) แต่ผลรวมสะท้อนเฉพาะค่าที่ทราบ
 * - ราคากิโลกรัมถ่วงน้ำหนัก = weighted ด้วยมูลค่าตลาด (null เมื่อไม่มีรายการที่ทั้งมีราคาและมีมูลค่า)
 */
function deriveSummary(products: GiProductCard[]): DerivedSummary {
  let totalAreaRai = 0;
  let totalFarmCount = 0;
  let totalMarketValueTHB = 0;
  let internalControlProducts = 0;
  let externalControlProducts = 0;
  let priceWeight = 0;
  let priceNumerator = 0;

  products.forEach((product) => {
    if (isFiniteNumber(product.areaRai)) totalAreaRai += product.areaRai;
    if (isFiniteNumber(product.farmCount)) totalFarmCount += product.farmCount;
    if (isFiniteNumber(product.marketValueTHB)) totalMarketValueTHB += product.marketValueTHB;
    if (product.controlStandard === 'internal_control') internalControlProducts += 1;
    if (product.controlStandard === 'external_control') externalControlProducts += 1;
    if (isFiniteNumber(product.pricePerKgTHB) && isFiniteNumber(product.marketValueTHB) && product.marketValueTHB > 0) {
      priceWeight += product.marketValueTHB;
      priceNumerator += product.pricePerKgTHB * product.marketValueTHB;
    }
  });

  return {
    totalProducts: products.length,
    provinceCountWithData: new Set(products.map((product) => product.provinceCode)).size,
    regionCount: new Set(products.map((product) => product.region)).size,
    totalAreaRai,
    totalFarmCount,
    totalMarketValueTHB,
    internalControlProducts,
    externalControlProducts,
    avgPricePerKgTHB: priceWeight > 0 ? priceNumerator / priceWeight : null,
  };
}

export function GiDashboard({ payload }: GiDashboardProps) {
  const [region, setRegion] = useState<string>('all');
  const [provinceCode, setProvinceCode] = useState<string>('all');
  const [category, setCategory] = useState<GiCategory | 'all'>('all');
  const [standard, setStandard] = useState<GiControlStandard | 'all'>('all');
  const [query, setQuery] = useState<string>('');
  const [provinceSortDesc, setProvinceSortDesc] = useState<boolean>(true);
  const [provinceVisible, setProvinceVisible] = useState<number>(PROVINCE_TABLE_CAP_STEP);

  const filteredProducts = useMemo(
    () =>
      payload.products.filter(
        (product) =>
          (region === 'all' || product.region === region) &&
          (provinceCode === 'all' || product.provinceCode === provinceCode) &&
          (category === 'all' || product.category === category) &&
          (standard === 'all' || product.controlStandard === standard) &&
          matchesText(product, query),
      ),
    [payload.products, region, provinceCode, category, standard, query],
  );

  const filteredSummary = useMemo(() => deriveSummary(filteredProducts), [filteredProducts]);

  const provinceGroups = useMemo(() => groupProvinces(payload.filterOptions.provinces, payload.filterOptions.regions), [
    payload.filterOptions.provinces,
    payload.filterOptions.regions,
  ]);

  const sortedProvinces = useMemo(() => {
    const rows = [...payload.byProvince];
    rows.sort((a, b) =>
      provinceSortDesc ? b.productCount - a.productCount : a.productCount - b.productCount,
    );
    return rows;
  }, [payload.byProvince, provinceSortDesc]);

  const hasActiveFilter =
    region !== 'all' || provinceCode !== 'all' || category !== 'all' || standard !== 'all' || query.trim() !== '';

  function resetFilters() {
    setRegion('all');
    setProvinceCode('all');
    setCategory('all');
    setStandard('all');
    setQuery('');
  }

  return (
    <div className={styles.container}>
      <KpiSection summary={filteredSummary} filtered={hasActiveFilter} totalProducts={payload.products.length} />

      <section className={styles.filterCard} aria-label="ตัวกรองสินค้า GI">
        <div className={styles.filterGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="gi-region">
              ภาค
            </label>
            <select
              id="gi-region"
              className={styles.control}
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            >
              <option value="all">ทุกภาค ({payload.filterOptions.regions.length})</option>
              {payload.filterOptions.regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="gi-province">
              จังหวัด (จัดกลุ่มตามภาค)
            </label>
            <select
              id="gi-province"
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
            <label className={styles.fieldLabel} htmlFor="gi-category">
              หมวดหมู่สินค้า
            </label>
            <select
              id="gi-category"
              className={styles.control}
              value={category}
              onChange={(event) => setCategory(event.target.value as GiCategory | 'all')}
            >
              <option value="all">ทุกหมวดหมู่ ({payload.filterOptions.categories.length})</option>
              {payload.filterOptions.categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="gi-standard">
              ระบบควบคุมตรวจสอบ
            </label>
            <select
              id="gi-standard"
              className={styles.control}
              value={standard}
              onChange={(event) => setStandard(event.target.value as GiControlStandard | 'all')}
            >
              <option value="all">ทุกระบบควบคุม</option>
              {payload.filterOptions.standards.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`${styles.field} ${styles.fieldSearch}`}>
            <label className={styles.fieldLabel} htmlFor="gi-query">
              ค้นชื่อสินค้า / ชนิด / จังหวัด / อำเภอ
            </label>
            <span className={styles.searchField}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                id="gi-query"
                type="search"
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="เช่น ข้าวสังข์หยด / มังคุด / พริกไทย"
              />
            </span>
          </div>
        </div>

        <div className={styles.filterFooter}>
          <span className={styles.filterSummary} role="status" aria-live="polite">
            ตรงกับตัวกรอง <strong>{intFormatter.format(filteredProducts.length)}</strong> จาก{' '}
            {intFormatter.format(payload.products.length)} รายการ
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

      <section className={styles.section} aria-label="รายการสินค้า GI ตามเงื่อนไขที่เลือก">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>รายการสินค้าสิ่งบ่งชี้ทางภูมิศาสตร์</span>
            <h2 className={styles.sectionTitle}>บัตรสินค้า GI</h2>
          </div>
          <span className={styles.sectionMeta}>ข้อมูลชุดตัวอย่าง · ยังไม่ผ่านการตรวจสอบแหล่งอ้างอิง</span>
        </header>

        {filteredProducts.length === 0 ? (
          <div className={styles.emptyState} role="status">
            <Icon name="search" size={26} />
            <p className={styles.emptyTitle}>ไม่พบสินค้า GI ที่ตรงกับตัวกรอง</p>
            <p className={styles.emptyText}>
              ลองเลือกภาค/จังหวัด/หมวดหมู่ใหม่ หรือล้างตัวกรองเพื่อกลับไปแสดงทุกรายการในชุดข้อมูลตัวอย่าง
            </p>
            <button type="button" className={styles.resetButton} onClick={resetFilters}>
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <CategoryBars byCategory={payload.byCategory} />
      <RegionTable byRegion={payload.byRegion} />
      <ProvinceTable
        rows={sortedProvinces}
        labelOf={useCategoryLabel(payload)}
        sortDesc={provinceSortDesc}
        visible={provinceVisible}
        onToggleSort={() => setProvinceSortDesc((prev) => !prev)}
        onShowMore={() => setProvinceVisible((prev) => prev + PROVINCE_TABLE_CAP_STEP)}
      />
      <StandardComparison byStandard={payload.byStandard} />
      <SourceSection payload={payload} />
    </div>
  );
}

function groupProvinces(provinces: GiProvince[], regionOrder: string[]) {
  const map = new Map<string, GiProvince[]>();
  provinces.forEach((province) => {
    const arr = map.get(province.region);
    if (arr) arr.push(province);
    else map.set(province.region, [province]);
  });
  const groups: { region: string; provinces: GiProvince[] }[] = [];
  regionOrder.forEach((r) => {
    const arr = map.get(r);
    if (arr && arr.length > 0) {
      groups.push({ region: r, provinces: [...arr].sort((a, b) => a.name.localeCompare(b.name, 'th')) });
      map.delete(r);
    }
  });
  map.forEach((arr, r) => groups.push({ region: r, provinces: [...arr].sort((a, b) => a.name.localeCompare(b.name, 'th')) }));
  return groups;
}

function useCategoryLabel(payload: GiDashboardPayload) {
  return useMemo(() => {
    const map = new Map<string, string>();
    payload.filterOptions.categories.forEach((c) => map.set(c.id, c.label));
    return (id: GiCategory) => map.get(id) ?? id;
  }, [payload.filterOptions.categories]);
}

function KpiSection({
  summary,
  filtered,
  totalProducts,
}: {
  summary: DerivedSummary;
  filtered: boolean;
  totalProducts: number;
}) {
  return (
    <section className={styles.section} aria-label="ตัวชี้วัดภาพรวมตามเงื่อนไขที่เลือก">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ตามเงื่อนไขที่เลือก</span>
          <h2 className={styles.sectionTitle}>ตัวชี้วัดสินค้า GI</h2>
        </div>
        <span className={styles.sectionMeta}>
          {filtered
            ? 'ตัวเลขคำนวณจากรายการที่ผ่านตัวกรองปัจจุบันเท่านั้น'
            : `ตัวเลขคำนวณจากรายการทั้งหมดในชุดตัวอย่าง ${intFormatter.format(totalProducts)} รายการ`}
        </span>
      </header>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="catalog" size={14} /> จำนวนสินค้า GI ทั้งหมด
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(summary.totalProducts)} <span className={styles.kpiUnit}>รายการ</span>
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="pin" size={14} /> จังหวัดที่มีรายการ
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(summary.provinceCountWithData)} <span className={styles.kpiUnit}>จังหวัด</span>
          </span>
          <span className={styles.kpiSub}>กระจายใน {formatIntOrNull(summary.regionCount)} ภาค</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="chart" size={14} /> มูลค่าตลาดรวม
          </span>
          <span className={styles.kpiValue}>{formatTHBCompact(summary.totalMarketValueTHB)}</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="layers" size={14} /> พื้นที่รวม
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(summary.totalAreaRai)} <span className={styles.kpiUnit}>ไร่</span>
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="leaf" size={14} /> จำนวนสวน/ฟาร์ม
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(summary.totalFarmCount)} <span className={styles.kpiUnit}>แห่ง</span>
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="water" size={14} /> ราคากิโลกรัมถ่วงน้ำหนัก
          </span>
          <span className={styles.kpiValue}>
            {isFiniteNumber(summary.avgPricePerKgTHB)
              ? `${shortDecimalFormatter.format(summary.avgPricePerKgTHB)} บาท/กก.`
              : NO_DATA}
          </span>
          <span className={styles.kpiSub}>ถ่วงน้ำหนักด้วยมูลค่าตลาดของรายการที่มีข้อมูลทั้งสองค่า</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>
            <Icon name="lock" size={14} /> ควบคุมภายใน vs ภายนอก
          </span>
          <span className={styles.kpiValue}>
            {formatIntOrNull(summary.internalControlProducts)} <span className={styles.kpiUnit}>ภายใน</span>
          </span>
          <span className={styles.kpiSub}>ควบคุมภายนอก {formatIntOrNull(summary.externalControlProducts)} รายการ</span>
        </div>
      </div>

      <p className={styles.kpiFootnote}>
        <Icon name="info" size={15} />
        <span>
          ตัวเลขทั้งหมดเป็นค่าจากชุดข้อมูลตัวอย่างและเปลี่ยนตามตัวกรอง ปัจจุบันห้ามใช้ค่ารวมระดับประเทศ
          มาแสดงใต้มุมมองที่ถูกกรอง
        </span>
      </p>
    </section>
  );
}

function ProductCard({ product }: { product: GiProductCard }) {
  const badgeStyle = {
    backgroundColor: product.badgeColor,
    color: readableTextColor(product.badgeColor),
    borderColor: product.badgeColor,
  } as const;

  const months = MONTH_LABELS.map((label, index) => ({
    label,
    active: product.seasonMonths.includes(index + 1),
  }));

  return (
    <article className={styles.productCard}>
      <div className={styles.cardTop}>
        <div className={styles.cardTitleBlock}>
          <h3 className={styles.productName}>{product.nameTh}</h3>
          {product.nameEn ? <span className={styles.productNameEn}>{product.nameEn}</span> : null}
        </div>
        <span className={styles.commodityChip}>{product.commodity}</span>
      </div>

      <p className={styles.provinceLine}>
        <Icon name="pin" size={13} />
        <span>
          {product.provinceName} · {product.region} · {product.categoryLabel}
        </span>
      </p>

      <div className={styles.badgeRow}>
        <span className={styles.standardBadge} style={badgeStyle}>
          {product.controlStandardLabel}
        </span>
        <span className={product.nameOrigin === 'known_gi_name' ? styles.originKnown : styles.originSynthetic}>
          {NAME_ORIGIN_LABEL[product.nameOrigin]}
        </span>
      </div>

      <p className={styles.registrationLine}>
        <span className={styles.registrationNo}>{product.registrationNo}</span>
        <span className={styles.registrationNote}>(เลขทะเบียนตัวอย่าง)</span>
      </p>

      <dl className={styles.metricList}>
        <div className={styles.metricRow}>
          <dt className={styles.metricLabel}>พื้นที่</dt>
          <dd className={styles.metricValue}>{formatDecimalOrNull(product.areaRai, 'ไร่')}</dd>
        </div>
        <div className={styles.metricRow}>
          <dt className={styles.metricLabel}>จำนวนสวน/ฟาร์ม</dt>
          <dd className={styles.metricValue}>{formatIntOrNull(product.farmCount)}</dd>
        </div>
        <div className={styles.metricRow}>
          <dt className={styles.metricLabel}>ผลผลิตรายปี</dt>
          <dd className={styles.metricValue}>{formatDecimalOrNull(product.annualYieldTons, 'ตัน')}</dd>
        </div>
        <div className={styles.metricRow}>
          <dt className={styles.metricLabel}>มูลค่าตลาด</dt>
          <dd className={styles.metricValue}>{formatTHBCompact(product.marketValueTHB)}</dd>
        </div>
        <div className={styles.metricRow}>
          <dt className={styles.metricLabel}>ราคา/กก.</dt>
          <dd className={styles.metricValue}>{formatDecimalOrNull(product.pricePerKgTHB, 'บาท/กก.')}</dd>
        </div>
      </dl>

      <div className={styles.seasonBlock}>
        <span className={styles.seasonHeading}>เดือนในฤดูกาลผลิต</span>
        <div className={styles.seasonStrip} role="img" aria-label={`เดือนในฤดูกาลผลิตของ ${product.nameTh}`}>
          {months.map((month) => (
            <span
              key={month.label}
              className={month.active ? `${styles.seasonCell} ${styles.seasonCellActive}` : styles.seasonCell}
            >
              {month.label}
            </span>
          ))}
        </div>
      </div>

      <details className={styles.expandDetails}>
        <summary className={styles.expandSummary}>รายละเอียดเพิ่ม (อำเภอ/พิกัด/คำอธิบาย)</summary>
        <div className={styles.expandBody}>
          <div className={styles.expandGroup}>
            <span className={styles.expandLabel}>อำเภอ/พื้นที่ในเขต GI</span>
            {product.districts.length > 0 ? (
              <ul className={styles.districtList}>
                {product.districts.map((district) => (
                  <li key={`${product.id}:${district}`} className={styles.districtItem}>
                    {district}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.nullValue}>{NO_DATA}</p>
            )}
          </div>

          <div className={styles.expandGroup}>
            <span className={styles.expandLabel}>
              พิกัดเชิงโครงสร้าง ไม่ใช่แปลงจริง ({intFormatter.format(product.plotPoints.length)} จุด)
            </span>
            {product.plotPoints.length > 0 ? (
              <div className={styles.tableScroll}>
                <table className={styles.plotTable}>
                  <thead>
                    <tr>
                      <th scope="col">อำเภอ</th>
                      <th scope="col">ละติจูด</th>
                      <th scope="col">ลองจิจูด</th>
                      <th scope="col">พื้นที่ (ไร่)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.plotPoints.map((point) => (
                      <tr key={`${product.id}:${point.id}`}>
                        <td>{point.district}</td>
                        <td className={styles.numericCell}>{shortDecimalFormatter.format(point.lat)}</td>
                        <td className={styles.numericCell}>{shortDecimalFormatter.format(point.lon)}</td>
                        <td className={styles.numericCell}>{intFormatter.format(point.areaRai)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.nullValue}>{NO_DATA}</p>
            )}
          </div>

          <div className={styles.expandGroup}>
            <span className={styles.expandLabel}>คำอธิบาย</span>
            <p className={styles.descriptionText}>{product.description}</p>
          </div>

          <p className={styles.expandNote}>
            {NAME_ORIGIN_LABEL[product.nameOrigin]} · สถานะหลักฐาน:{' '}
            {product.evidenceStatus === 'not_verified' ? 'ยังไม่ตรวจสอบ' : product.evidenceStatus}
          </p>
        </div>
      </details>
    </article>
  );
}

function CategoryBars({
  byCategory,
}: {
  byCategory: GiDashboardPayload['byCategory'];
}) {
  const maxCount = byCategory.reduce((max, item) => Math.max(max, item.productCount), 0);
  return (
    <section className={styles.section} aria-label="สรุปตามหมวดหมู่สินค้า (ภาพรวมทั้งประเทศ)">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ภาพรวมทั้งประเทศ (ไม่ตามตัวกรอง)</span>
          <h2 className={styles.sectionTitle}>สรุปตามหมวดหมู่สินค้า</h2>
        </div>
      </header>
      {byCategory.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA}</p>
      ) : (
        <ul className={styles.categoryBars}>
          {byCategory.map((item) => {
            const width = maxCount > 0 ? clampPercent((item.productCount / maxCount) * 100) : 0;
            return (
              <li key={item.category} className={styles.categoryBar}>
                <div className={styles.categoryBarHead}>
                  <span className={styles.categoryBarLabel}>{item.label}</span>
                  <span className={styles.categoryBarMeta}>
                    {intFormatter.format(item.productCount)} รายการ · {formatIntOrNull(item.totalAreaRai)} ไร่ ·{' '}
                    {formatTHBCompact(item.totalMarketValueTHB)}
                  </span>
                </div>
                <span
                  className={styles.barTrack}
                  role="img"
                  aria-label={`${item.label}: ${intFormatter.format(item.productCount)} รายการ จากสูงสุด ${intFormatter.format(maxCount)} รายการ`}
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

function RegionTable({ byRegion }: { byRegion: GiDashboardPayload['byRegion'] }) {
  return (
    <section className={styles.section} aria-label="สรุปตามภาค (ภาพรวมทั้งประเทศ)">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ภาพรวมทั้งประเทศ (ไม่ตามตัวกรอง)</span>
          <h2 className={styles.sectionTitle}>สรุปตามภาค</h2>
        </div>
      </header>
      {byRegion.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                <th scope="col">ภาค</th>
                <th scope="col" className={styles.numericCell}>
                  จำนวนสินค้า
                </th>
                <th scope="col" className={styles.numericCell}>
                  จังหวัดที่มีรายการ
                </th>
                <th scope="col" className={styles.numericCell}>
                  พื้นที่รวม (ไร่)
                </th>
                <th scope="col" className={styles.numericCell}>
                  มูลค่าตลาดรวม
                </th>
              </tr>
            </thead>
            <tbody>
              {byRegion.map((row) => (
                <tr key={row.region}>
                  <th scope="row" className={styles.rowHead}>
                    {row.region}
                  </th>
                  <td className={styles.numericCell}>{intFormatter.format(row.productCount)}</td>
                  <td className={styles.numericCell}>{intFormatter.format(row.provinceCount)}</td>
                  <td className={styles.numericCell}>{intFormatter.format(row.totalAreaRai)}</td>
                  <td className={styles.numericCell}>{formatTHBCompact(row.totalMarketValueTHB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProvinceTable({
  rows,
  labelOf,
  sortDesc,
  visible,
  onToggleSort,
  onShowMore,
}: {
  rows: GiDashboardPayload['byProvince'];
  labelOf: (id: GiCategory) => string;
  sortDesc: boolean;
  visible: number;
  onToggleSort: () => void;
  onShowMore: () => void;
}) {
  const shown = rows.slice(0, visible);
  return (
    <section className={styles.section} aria-label="ตารางรายจังหวัด (ภาพรวมทั้งประเทศ)">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ภาพรวมทั้งประเทศ · {intFormatter.format(rows.length)} จังหวัดที่มีรายการ</span>
          <h2 className={styles.sectionTitle}>ตารางรายจังหวัด</h2>
        </div>
        <span className={styles.sectionMeta}>จังหวัดเป็นหมุดอ้างอิง ไม่ใช่ขอบเขตครอบคลุมข้อมูล</span>
      </header>

      {rows.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA}</p>
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th scope="col" className={styles.rowHeadCell}>
                    จังหวัด
                  </th>
                  <th scope="col">ภาค</th>
                  <th scope="col">
                    <button type="button" className={styles.sortButton} onClick={onToggleSort} aria-pressed={sortDesc}>
                      จำนวนสินค้า
                      <span className={styles.sortGlyph}>{sortDesc ? '↓ มากสุด' : '↑ น้อยสุด'}</span>
                    </button>
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    พื้นที่ (ไร่)
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    จำนวนสวน/ฟาร์ม
                  </th>
                  <th scope="col" className={styles.numericCell}>
                    มูลค่าตลาด
                  </th>
                  <th scope="col">หมวดหมู่</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.provinceCode}>
                    <th scope="row" className={styles.rowHead}>
                      {row.provinceName}
                      <span className={styles.rowSub}>รหัส {row.provinceCode}</span>
                    </th>
                    <td>{row.region}</td>
                    <td className={styles.numericCell}>{intFormatter.format(row.productCount)}</td>
                    <td className={styles.numericCell}>{intFormatter.format(row.totalAreaRai)}</td>
                    <td className={styles.numericCell}>{intFormatter.format(row.totalFarmCount)}</td>
                    <td className={styles.numericCell}>{formatTHBCompact(row.totalMarketValueTHB)}</td>
                    <td className={styles.categoryCell}>
                      {row.categories.length > 0
                        ? row.categories.map((id) => labelOf(id)).join(' · ')
                        : NO_DATA}
                    </td>
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
            <p className={styles.moreNote}>แสดงครบทุกจังหวัดที่มีรายการแล้ว</p>
          )}
        </>
      )}
    </section>
  );
}

function StandardComparison({ byStandard }: { byStandard: GiDashboardPayload['byStandard'] }) {
  const totalValue = byStandard.reduce((sum, item) => sum + (isFiniteNumber(item.totalMarketValueTHB) ? item.totalMarketValueTHB : 0), 0);
  const totalCount = byStandard.reduce((sum, item) => sum + item.productCount, 0);

  return (
    <section className={styles.section} aria-label="เปรียบเทียบระบบควบคุมตรวจสอบ">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>ภาพรวมทั้งประเทศ (ไม่ตามตัวกรอง)</span>
          <h2 className={styles.sectionTitle}>ควบคุมภายใน vs ควบคุมภายนอก</h2>
        </div>
        <span className={styles.sectionMeta}>รวม {intFormatter.format(totalCount)} รายการ</span>
      </header>

      {byStandard.length === 0 ? (
        <p className={styles.nullValue}>{NO_DATA}</p>
      ) : (
        <>
          <div className={styles.splitBar} aria-hidden="true">
            {byStandard.map((item) => {
              const share = totalValue > 0 ? (item.totalMarketValueTHB / totalValue) * 100 : 0;
              return (
                <span
                  key={item.standard}
                  className={item.standard === 'internal_control' ? styles.splitInternal : styles.splitExternal}
                  style={{ width: `${clampPercent(share)}%` }}
                />
              );
            })}
          </div>
          <ul className={styles.standardList}>
            {byStandard.map((item) => {
              const valueShare = totalValue > 0 ? (item.totalMarketValueTHB / totalValue) * 100 : 0;
              const countShare = totalCount > 0 ? (item.productCount / totalCount) * 100 : 0;
              return (
                <li key={item.standard} className={styles.standardItem}>
                  <span className={styles.standardItemName}>{item.label}</span>
                  <span className={styles.standardItemValue}>
                    {intFormatter.format(item.productCount)} รายการ ({compactFormatter.format(countShare)}% ของรายการ) ·{' '}
                    {formatTHBCompact(item.totalMarketValueTHB)} ({compactFormatter.format(valueShare)}% ของมูลค่าตลาด)
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function SourceSection({ payload }: { payload: GiDashboardPayload }) {
  return (
    <section className={styles.section} aria-label="แหล่งข้อมูลและข้อจำกัด">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Provenance</span>
          <h2 className={styles.sectionTitle}>แหล่งข้อมูลและข้อจำกัด</h2>
        </div>
      </header>

      <ul className={styles.sourceList}>
        {payload.sources.map((source) => (
          <li key={source.id} className={styles.sourceCard}>
            <div className={styles.sourceHead}>
              <span className={styles.sourceName}>{source.name}</span>
              <span className={styles.licenseBadge}>รอตรวจสอบสิทธิ์</span>
            </div>
            <span className={styles.sourceAgency}>{source.agencyLabel}</span>
            <span className={styles.sourceRole}>{source.role}</span>
            <span className={styles.licenseStatus}>สถานะสิทธิ์ (ต้นทาง): {source.licenseStatus}</span>
            <a className={styles.sourceLink} href={source.sourceUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={13} /> เปิดแหล่งต้นทาง
            </a>
          </li>
        ))}
      </ul>

      {payload.warnings.length > 0 ? (
        <div className={styles.warningBlock}>
          <span className={styles.expandLabel}>ข้อควรระวังของชุดข้อมูล ({intFormatter.format(payload.warnings.length)} รายการ)</span>
          <ul className={styles.warningList}>
            {payload.warnings.map((warning) => (
              <li key={warning} className={styles.warningItem}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={styles.coverageNote}>{payload.coverageNote}</p>
    </section>
  );
}
