'use client';

import React, { useState } from 'react';
import type { WaterReservoirRecord } from '@/lib/hub/water-data';
import {
  filterWaterReservoirs,
  paginateWaterReservoirs,
  waterRegions,
} from '@/lib/hub/water-table';
import { Icon } from './icon';
import styles from './water-dashboard.module.css';

const ALL_REGIONS = 'all';

function formatNumber(value: number | null | undefined, maxDigits = 2): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: maxDigits });
}

function gaugeColor(percent: number | null): string {
  if (percent === null) return '#c3d0c0';
  if (percent < 30) return '#c62828';
  if (percent < 60) return '#ef6c00';
  if (percent > 100) return '#1565c0';
  return '#2e7d32';
}

function ReservoirRow({ record }: { record: WaterReservoirRecord }) {
  const percent = record.storagePercent;
  return (
    <tr>
      <td className={styles.reservoirName}>
        {record.name ?? record.reservoirId}
        <div style={{ fontSize: 12, color: '#687d5c', fontWeight: 400 }}>
          {record.reservoirId}
          {record.region ? ` · ${record.region}` : ''}
        </div>
      </td>
      <td className={styles.numRight}>{formatNumber(record.volumeMcm, 3)}</td>
      <td className={styles.numRight}>{record.volumeUnit ?? '—'}</td>
      <td className={styles.numRight}>{record.capacityMcm === null ? '—' : formatNumber(record.capacityMcm, 3)}</td>
      <td>
        <div className={styles.gaugeWrap}>
          <div className={styles.gaugeTrack}>
            <div
              className={styles.gaugeFill}
              style={{
                width: `${percent === null ? 0 : Math.min(100, Math.max(0, percent))}%`,
                background: gaugeColor(percent),
              }}
            />
          </div>
          <span className={styles.numRight} style={{ minWidth: 66 }}>
            {percent === null ? '—' : `${formatNumber(percent)}%`}
          </span>
        </div>
      </td>
      <td className={styles.numRight}>
        {record.reportedPercentStorage === null ? '—' : formatNumber(record.reportedPercentStorage)}
      </td>
      <td className={styles.numRight}>{record.qualityStatus ?? '—'}</td>
    </tr>
  );
}

export function WaterReservoirTable({ records }: { records: WaterReservoirRecord[] }) {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState(ALL_REGIONS);
  const [page, setPage] = useState(1);

  const regions = waterRegions(records);
  const filtered = filterWaterReservoirs(records, {
    query,
    region: region === ALL_REGIONS ? null : region,
  });
  const view = paginateWaterReservoirs(filtered, page);
  const narrowed = filtered.length !== records.length;

  return (
    <div className={styles.tableCard}>
      <div className={styles.tableHeadRow}>
        <span className={styles.tableCount}>
          {narrowed
            ? `พบ ${formatNumber(filtered.length, 0)} จาก ${formatNumber(records.length, 0)} อ่าง`
            : `อ่างทั้งหมด ${formatNumber(records.length, 0)} อ่าง`}
        </span>
        <span style={{ fontSize: 12, color: '#687d5c' }}>หน่วยปริมาตร MCM · เริ่มจากสัดส่วนน้ำน้อยไปมาก</span>
      </div>

      <div className={styles.filterBar} role="search">
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon name="search" size={16} />
          </span>
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาชื่ออ่างหรือรหัสอ่าง"
            aria-label="ค้นหาอ่างเก็บน้ำจากชื่อหรือรหัส"
          />
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="water-region-filter">ภาค</label>
          <select
            id="water-region-filter"
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setPage(1);
            }}
          >
            <option value={ALL_REGIONS}>ทุกภาค</option>
            {regions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <button
            type="button"
            aria-label="ล้างคำค้นหาและตัวกรองภาค"
            onClick={() => {
              setQuery('');
              setRegion(ALL_REGIONS);
              setPage(1);
            }}
            disabled={!narrowed}
            style={{ height: 42, marginTop: 18, borderRadius: 6, border: '1px solid #c5d3c2', background: '#fff', cursor: narrowed ? 'pointer' : 'default', color: '#385043', fontSize: 13 }}
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      <div className={styles.tableResponsive}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">อ่างเก็บน้ำ</th>
              <th scope="col">ปริมาตร (MCM)</th>
              <th scope="col">หน่วย</th>
              <th scope="col">ความจุ</th>
              <th scope="col">สัดส่วนน้ำ</th>
              <th scope="col">% จากต้นทาง</th>
              <th scope="col">คุณภาพ</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.length > 0 ? (
              view.rows.map((record) => <ReservoirRow key={record.reservoirId} record={record} />)
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: '#687d5c', padding: '22px 12px' }}>
                  ไม่พบอ่างที่ตรงกับคำค้นหา — ล้างคำค้นหาหรือเลือก &quot;ทุกภาค&quot; เพื่อดูทั้งหมด
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="แบ่งหน้าตารางอ่างเก็บน้ำ"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' }}
      >
        <span aria-live="polite" style={{ fontSize: 13, color: '#556b60' }}>
          แสดง {formatNumber(view.rows.length, 0)} อ่าง · หน้า {view.page} จาก {view.pageCount}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setPage(view.page - 1)}
            disabled={view.page <= 1}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #c5d3c2', background: '#fff', cursor: view.page <= 1 ? 'default' : 'pointer' }}
          >
            ก่อนหน้า
          </button>
          <button
            type="button"
            onClick={() => setPage(view.page + 1)}
            disabled={view.page >= view.pageCount}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #c5d3c2', background: '#fff', cursor: view.page >= view.pageCount ? 'default' : 'pointer' }}
          >
            ถัดไป
          </button>
        </span>
      </nav>
    </div>
  );
}
