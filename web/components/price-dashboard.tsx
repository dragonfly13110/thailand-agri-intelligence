'use client';

import React, { useMemo, useState } from 'react';
import type { PriceCommodityMetadata } from '@/lib/hub/price-data';
import { PRICE_WARNINGS } from '@/lib/hub/price-data';
import styles from './price-dashboard.module.css';

interface PriceDashboardProps {
  commodities: PriceCommodityMetadata[];
}

/**
 * Metadata-only price dashboard.
 *
 * While the OAE/NABC price resources are `pending`, this component lists the
 * commodity metadata only. It never renders a price, change, percentage or
 * history chart — a zero placeholder would be indistinguishable from an
 * observed price.
 */
export function PriceDashboard({ commodities }: PriceDashboardProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(commodities[0]?.id || '');

  const categories = ['all', 'ข้าว', 'ยางพาราและปาล์ม', 'พืชไร่'];

  const filtered = useMemo(() => {
    if (selectedCategory === 'all') return commodities;
    return commodities.filter((p) => p.category === selectedCategory);
  }, [commodities, selectedCategory]);

  const active = useMemo(() => {
    return commodities.find((p) => p.id === selectedId) || commodities[0];
  }, [commodities, selectedId]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1>ราคาสินค้าเกษตรสำคัญ</h1>
            <p className={styles.subtitle}>
              รายการสินค้า หน่วย และตลาดเป้าหมายจาก OAE/NABC — ยังไม่เปิดเผยราคาจนกว่าทะเบียนสิทธิ์จะผ่าน
            </p>
          </div>
          <span className={styles.liveBadge} style={{ background: '#fff8e1', color: '#8d6e00', borderColor: '#ffe082' }}>
            รอตรวจสิทธิ์ · metadata only
          </span>
        </div>
      </div>

      <aside
        role="status"
        aria-label="สถานะสิทธิ์ข้อมูลราคา"
        style={{
          background: '#fff8e1',
          border: '1px solid #ffe082',
          borderRadius: 12,
          padding: '16px 20px',
          color: '#6d4f00',
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        <strong>ยังไม่เปิดเผยราคาจาก OAE/NABC</strong>
        <div style={{ marginTop: 4 }}>
          ราคา เปลี่ยนแปลง และประวัติราคาไม่ถูกแสดงใน HTML, props, API หรือ cache เพราะทะเบียน
          ระบุ resource ราคาเป็น <code>pending</code> และยังไม่ยืนยันรุ่น/URL ของสัญญาอนุญาต
          หน้านี้จึงแสดงเฉพาะรายการสินค้าและข้อมูลกำกับแหล่ง
        </div>
      </aside>

      <div className={styles.categoryTabs}>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`${styles.tabBtn} ${selectedCategory === cat ? styles.tabBtnActive : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === 'all' ? 'พืชเศรษฐกิจทั้งหมด' : cat}
          </button>
        ))}
      </div>

      <div className={styles.tickerGrid}>
        {filtered.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <div
              key={item.id}
              className={`${styles.tickerCard} ${isSelected ? styles.tickerCardActive : ''}`}
              onClick={() => setSelectedId(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(item.id);
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
                <span>ยังไม่มีราคาที่เผยแพร่ได้</span>
                <span>คลิกเพื่อดู metadata</span>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <div className={styles.detailCard}>
          <div className={styles.detailHead}>
            <div>
              <span className={styles.detailTitle}>ข้อมูลกำกับสินค้า: {active.name}</span>
              <div style={{ fontSize: 13, color: '#556b60', marginTop: 4 }}>
                ไม่มีตัวเลขราคาในส่วนนี้ — หน่วย {active.unit} · ความถี่ {active.frequency}
              </div>
            </div>
            <span className={styles.marketTag}>{active.marketType}</span>
          </div>

          <div className={styles.compareTableWrap}>
            <table className={styles.compareTable}>
              <tbody>
                <tr>
                  <th scope="row">สินค้า/เกรด</th>
                  <td>{active.name}</td>
                </tr>
                <tr>
                  <th scope="row">หน่วย</th>
                  <td>{active.unit}</td>
                </tr>
                <tr>
                  <th scope="row">ประเภทตลาด</th>
                  <td>{active.marketType}</td>
                </tr>
                <tr>
                  <th scope="row">แหล่งสำรวจ/ตลาด</th>
                  <td>{active.marketName}</td>
                </tr>
                <tr>
                  <th scope="row">ความถี่</th>
                  <td>{active.frequency}</td>
                </tr>
                <tr>
                  <th scope="row">แหล่งข้อมูล</th>
                  <td>
                    {active.sourceName} ·{' '}
                    <a href={active.sourceUrl} target="_blank" rel="noreferrer">
                      เอกสารต้นทาง
                    </a>
                  </td>
                </tr>
                <tr>
                  <th scope="row">สถานะสิทธิ์</th>
                  <td>
                    <code>{active.licenseStatus}</code> · access <code>{active.access}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div
        role="status"
        style={{
          background: '#f4f8f3',
          border: '1px dashed #b9cbb4',
          borderRadius: 12,
          padding: '28px 24px',
          textAlign: 'center',
          color: '#385043',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          ยังไม่มีกราฟหรือตารางราคาที่เผยแพร่ได้
        </div>
        <p style={{ margin: '0 auto', maxWidth: 720, fontSize: 14, lineHeight: 1.7 }}>
          ระบบจะแสดงราคาและกราฟย้อนหลังเมื่อ resource ผ่านการตรวจสิทธิ์และมี active approved batch
          ที่ตรวจเทียบกับต้นทางแล้วเท่านั้น ระหว่างนี้ใช้รายการสินค้าและลิงก์ต้นทางเพื่อเตรียมคำขอข้อมูลได้
        </p>
        <div style={{ marginTop: 14, fontSize: 13, color: '#556b60' }}>
          API: <code>GET /api/v1/prices/daily</code> · <code>availability: metadata_only</code> ·{' '}
          <code>cache-control: no-store</code>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#556b60', lineHeight: 1.8 }}>
        <strong>warnings จาก API</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 22 }}>
          {PRICE_WARNINGS.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
