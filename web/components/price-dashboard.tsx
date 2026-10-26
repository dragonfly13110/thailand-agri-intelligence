'use client';

import React, { useMemo, useState } from 'react';
import type { PriceCommodityMetadata } from '@/lib/hub/price-data';
import { PRICE_GRAIN_LABEL, PRICE_WARNINGS } from '@/lib/hub/price-data';
import type { PriceObservation, PriceSnapshot } from '@/lib/hub/price-repository';
import styles from './price-dashboard.module.css';

interface PriceDashboardProps {
  commodities: PriceCommodityMetadata[];
  snapshot: PriceSnapshot;
}

const UNKNOWN_PROVINCE = '__unknown__';

const dayFormatter = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

const timestampFormatter = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
});

const numberFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

function formatDay(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? value : dayFormatter.format(parsed);
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : timestampFormatter.format(parsed);
}

function provinceKey(province: string | null): string {
  return province ?? UNKNOWN_PROVINCE;
}

function provinceLabel(province: string | null): string {
  return province ?? 'ไม่ระบุจังหวัด';
}

function latestDateOf(rows: PriceObservation[]): string | null {
  return rows.reduce<string | null>(
    (latest, row) => (latest === null || row.periodStart > latest ? row.periodStart : latest),
    null,
  );
}

export function PriceDashboard({ commodities, snapshot }: PriceDashboardProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(commodities[0]?.id ?? '');
  const [selectedProvince, setSelectedProvince] = useState<string>('all');
  const [marketQuery, setMarketQuery] = useState<string>('');

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(commodities.map((item) => item.category)))],
    [commodities],
  );

  const rowsByProduct = useMemo(() => {
    const map = new Map<string, PriceObservation[]>();
    for (const row of snapshot.observations) {
      const existing = map.get(row.product);
      if (existing) existing.push(row);
      else map.set(row.product, [row]);
    }
    return map;
  }, [snapshot.observations]);

  const filteredCommodities = useMemo(() => {
    if (selectedCategory === 'all') return commodities;
    return commodities.filter((item) => item.category === selectedCategory);
  }, [commodities, selectedCategory]);

  const active = useMemo(
    () => commodities.find((item) => item.id === selectedId) ?? commodities[0] ?? null,
    [commodities, selectedId],
  );

  const activeRows = useMemo(() => {
    if (!active?.sourceProductName) return [];
    return rowsByProduct.get(active.sourceProductName) ?? [];
  }, [active, rowsByProduct]);

  const activeProbe = useMemo(() => {
    if (!active?.sourceProductName) return null;
    return snapshot.probes.find((probe) => probe.productName === active.sourceProductName) ?? null;
  }, [active, snapshot.probes]);

  const provinceOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of activeRows) {
      const key = provinceKey(row.province);
      if (!options.has(key)) options.set(key, provinceLabel(row.province));
    }
    return Array.from(options, ([key, label]) => ({ key, label })).sort((left, right) =>
      left.label.localeCompare(right.label, 'th'),
    );
  }, [activeRows]);

  const visibleRows = useMemo(() => {
    const query = marketQuery.trim().toLocaleLowerCase('th');
    return activeRows.filter((row) => {
      if (selectedProvince !== 'all' && provinceKey(row.province) !== selectedProvince) return false;
      if (!query) return true;
      const haystack = `${row.market} ${row.province ?? ''} ${row.product}`.toLocaleLowerCase('th');
      return haystack.includes(query);
    });
  }, [activeRows, marketQuery, selectedProvince]);

  const hasPublishedRows = snapshot.observations.length > 0;
  const failedProbes = snapshot.probes.filter((probe) => !probe.ok);
  const activeLatestDate = latestDateOf(activeRows);
  const filtersActive = selectedProvince !== 'all' || marketQuery.trim().length > 0;

  const selectCategory = (category: string) => {
    setSelectedCategory(category);
    setSelectedProvince('all');
    setMarketQuery('');
    const next = category === 'all'
      ? commodities
      : commodities.filter((item) => item.category === category);
    if (next.length > 0 && !next.some((item) => item.id === selectedId)) {
      setSelectedId(next[0].id);
    }
  };

  const selectCommodity = (id: string) => {
    setSelectedId(id);
    setSelectedProvince('all');
    setMarketQuery('');
  };

  const resetFilters = () => {
    setSelectedProvince('all');
    setMarketQuery('');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1>ราคาสินค้าเกษตรรายวัน</h1>
            <p className={styles.subtitle}>
              ราคาตามประกาศต้นทาง OAE/NABC · {PRICE_GRAIN_LABEL}
            </p>
          </div>
          <span className={`${styles.liveBadge} ${hasPublishedRows ? '' : styles.liveBadgeEmpty}`}>
            <span className={`${styles.pulseDot} ${hasPublishedRows ? '' : styles.pulseDotIdle}`} aria-hidden="true" />
            {hasPublishedRows ? 'ข้อมูลจริง · approved_public' : 'ยังไม่มีแถวราคาในรอบนี้'}
          </span>
        </div>
      </div>

      <aside
        className={`${styles.statusBanner} ${hasPublishedRows ? styles.statusReady : styles.statusEmpty}`}
        role="status"
        aria-label="สถานะข้อมูลราคา"
      >
        <div className={styles.statusHeadline}>
          <span className={styles.statusCode}>approved_public</span>
          <strong>
            {hasPublishedRows
              ? 'เผยแพร่ข้อมูลราคาจริงจากต้นทาง OAE/NABC'
              : 'ยังไม่มีรายการราคาที่เผยแพร่ได้ในรอบนี้'}
          </strong>
        </div>
        <p className={styles.statusText}>
          {hasPublishedRows
            ? 'ทุกแถวมาจาก API ต้นทางโดยตรง ไม่มีการเฉลี่ย รวมข้ามตลาด/หน่วย หรือเติมค่าแทนที่ขาดหาย'
            : 'ต้นทางอาจตอบกลับแต่ไม่มีแถวของวันที่ต้องการ หรืออ่านข้อมูลไม่สำเร็จ — ระบบจะไม่แสดงเลข 0 แทนค่าที่ไม่มี'}
        </p>
        <div className={styles.statusMeta}>
          <span>วันที่ข้อมูลล่าสุด: <strong>{formatDay(snapshot.latestDate)}</strong></span>
          <span>รายการราคาที่ตรวจพบ: <strong>{numberFormatter.format(snapshot.observations.length)}</strong></span>
          <span>สินค้าที่อ่านสำเร็จ: <strong>{snapshot.productsSucceeded}/{snapshot.productsRequested}</strong></span>
          <span>ดึงข้อมูลเมื่อ: <strong>{formatTimestamp(snapshot.retrievedAt)}</strong></span>
        </div>
        {failedProbes.length > 0 && (
          <p className={styles.probeIssue}>
            อ่านไม่สำเร็จ: {failedProbes.map((probe) => `${probe.productName} (${probe.failureCode ?? 'UNKNOWN'})`).join(' · ')}
          </p>
        )}
      </aside>

      <div className={styles.categoryTabs} aria-label="หมวดสินค้า">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`${styles.tabBtn} ${selectedCategory === category ? styles.tabBtnActive : ''}`}
            onClick={() => selectCategory(category)}
            aria-pressed={selectedCategory === category}
          >
            {category === 'all' ? 'พืชเศรษฐกิจทั้งหมด' : category}
          </button>
        ))}
      </div>

      <div className={styles.tickerGrid}>
        {filteredCommodities.map((item) => {
          const isSelected = item.id === active?.id;
          const productRows = item.sourceProductName ? rowsByProduct.get(item.sourceProductName) ?? [] : [];
          const latest = latestDateOf(productRows);
          return (
            <div
              key={item.id}
              className={`${styles.tickerCard} ${isSelected ? styles.tickerCardActive : ''}`}
              onClick={() => selectCommodity(item.id)}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectCommodity(item.id);
                }
              }}
            >
              <div className={styles.tickerTop}>
                <span className={styles.commodityName}>{item.name}</span>
                <span className={styles.categoryTag}>{item.category}</span>
              </div>
              <div className={styles.tickerMeta} style={{ marginTop: 10 }}>
                <span>{item.marketType}</span>
                <span>{item.unit}</span>
              </div>
              <div className={styles.tickerMeta}>
                <span>
                  {productRows.length > 0
                    ? `${numberFormatter.format(productRows.length)} รายการราคา`
                    : 'ยังไม่มีรายการในรอบนี้'}
                </span>
                <span>{latest ? `ล่าสุด ${formatDay(latest)}` : 'ไม่มีวันที่ข้อมูล'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <div className={styles.detailCard}>
          <div className={styles.detailHead}>
            <div>
              <span className={styles.detailTitle}>รายการราคา: {active.name}</span>
              <div className={styles.detailSubtitle}>
                {active.unit} · ความถี่ {active.frequency} ·{' '}
                {activeRows.length > 0 ? `ข้อมูลล่าสุด ${formatDay(activeLatestDate)}` : 'ยังไม่มีข้อมูลที่เผยแพร่ได้'}
              </div>
            </div>
            <div className={styles.detailActions}>
              <span className={styles.marketTag}>{active.marketType}</span>
              <a className={styles.sourceLink} href={active.sourceUrl} target="_blank" rel="noreferrer">
                เปิดข้อมูลต้นทาง
              </a>
            </div>
          </div>

          {activeRows.length > 0 ? (
            <>
              <div className={styles.filtersRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>จังหวัด</span>
                  <select
                    className={styles.select}
                    value={selectedProvince}
                    onChange={(event) => setSelectedProvince(event.target.value)}
                  >
                    <option value="all">ทุกจังหวัด</option>
                    {provinceOptions.map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>ค้นหาตลาด/จังหวัด</span>
                  <input
                    className={styles.searchInput}
                    type="search"
                    value={marketQuery}
                    onChange={(event) => setMarketQuery(event.target.value)}
                    placeholder="เช่น โรงสี, ตลาดกลาง, ยโสธร"
                  />
                </label>
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={resetFilters}
                  disabled={!filtersActive}
                >
                  ล้างตัวกรอง
                </button>
                <span className={styles.recordCount} role="status">
                  แสดง {numberFormatter.format(visibleRows.length)} / {numberFormatter.format(activeRows.length)} รายการ
                </span>
              </div>

              {visibleRows.length > 0 ? (
                <div
                  className={styles.tableWrap}
                  role="region"
                  aria-label={`ตารางราคา ${active.name}`}
                  tabIndex={0}
                >
                  <table className={styles.priceTable}>
                    <thead>
                      <tr>
                        <th scope="col">สินค้าตามต้นทาง (มีเกรดในชื่อ)</th>
                        <th scope="col">ตลาด/ผู้ประกาศราคา</th>
                        <th scope="col">จังหวัด</th>
                        <th scope="col">วันที่ข้อมูล</th>
                        <th scope="col" className={styles.numericCell}>ราคา</th>
                        <th scope="col">หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const rowKey = [
                          row.product,
                          row.market,
                          provinceKey(row.province),
                          row.periodStart,
                          row.unit ?? '',
                        ].join('|');
                        return (
                          <tr key={rowKey}>
                            <td>{row.product}</td>
                            <td>{row.market}</td>
                            <td>{provinceLabel(row.province)}</td>
                            <td>
                              <time dateTime={row.periodStart}>{formatDay(row.periodStart)}</time>
                            </td>
                            <td className={styles.numericCell}>
                              {row.value === null
                                ? <span className={styles.missingValue} title="ต้นทางไม่มีค่าราคาในแถวนี้">—</span>
                                : numberFormatter.format(row.value)}
                            </td>
                            <td>
                              {row.unit === null
                                ? <span className={styles.missingValue} title="ต้นทางไม่ระบุหน่วยในแถวนี้">—</span>
                                : row.unit}
                              {row.unitStatus === 'pending_official_confirmation' && (
                                <span className={styles.unitNote}>รอยืนยันหน่วย</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState} role="status">
                  <div className={styles.emptyTitle}>ไม่พบรายการตามตัวกรอง</div>
                  <p className={styles.emptyText}>
                    ลองเลือกจังหวัดอื่นหรือล้างคำค้นหา — ระบบไม่เติมค่าหรือซ่อนแถวที่ไม่มีข้อมูล
                  </p>
                  <button type="button" className={styles.resetButton} onClick={resetFilters}>
                    ล้างตัวกรอง
                  </button>
                </div>
              )}

              <p className={styles.dataNote}>
                เกรดและประเภทราคาไม่ใช่คอลัมน์แยกของต้นทาง: เกรดอยู่ในชื่อสินค้าตามที่ต้นทางประกาศ
                และฟิลด์ <code>grade</code> / <code>priceType</code> เป็น <code>null</code> โดยเจตนา
                — ห้ามนำแถวต่างตลาด ต่างหน่วย หรือต่างเกรดมาเฉลี่ยรวมกัน
              </p>
            </>
          ) : (
            <div className={styles.emptyState} role="status">
              <div className={styles.emptyTitle}>
                {activeProbe && !activeProbe.ok
                  ? 'อ่านข้อมูลสินค้านี้จากต้นทางไม่สำเร็จ'
                  : 'ยังไม่มีรายการราคาที่เผยแพร่ได้สำหรับสินค้านี้'}
              </div>
              <p className={styles.emptyText}>
                {activeProbe && !activeProbe.ok
                  ? `ต้นทางตอบกลับไม่สำเร็จ (${activeProbe.failureCode ?? 'UNKNOWN'}) เมื่อ ${formatTimestamp(activeProbe.retrievedAt)} — ระบบไม่สร้างตัวเลขทดแทน`
                  : activeProbe
                    ? `ต้นทางตอบกลับ HTTP ${activeProbe.status ?? '—'} แต่ไม่มีแถวราคาที่ผ่านการตรวจสอบในรอบนี้ (อ่าน ${numberFormatter.format(activeProbe.upstreamRowCount)} แถว, ผ่าน ${numberFormatter.format(activeProbe.acceptedRowCount)}) — ค่าว่างคือไม่ทราบ ไม่ใช่ 0`
                    : 'ยังไม่มีชื่อผลิตภัณฑ์ต้นทางที่ตรงกับสินค้านี้ จึงยังดึงข้อมูลไม่ได้'}
              </p>
            </div>
          )}
        </div>
      )}

      <div className={styles.warnings}>
        <strong>ข้อควรระวังในการใช้ข้อมูล</strong>
        <ul>
          {PRICE_WARNINGS.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>

      <div className={styles.apiNote}>
        API: <code>GET /api/v1/prices/daily</code> · <code>access: approved_public</code> ·{' '}
        <code>cache-control: no-store</code>
      </div>
    </div>
  );
}
