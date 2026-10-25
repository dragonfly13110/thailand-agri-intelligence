import React from 'react';
import type { WaterSourceMetadata } from '@/lib/hub/water-data';
import { WATER_WARNINGS } from '@/lib/hub/water-data';
import { Icon } from './icon';
import styles from './water-dashboard.module.css';

interface WaterDashboardProps {
  metadata: WaterSourceMetadata;
}

/**
 * Metadata-only water dashboard.
 *
 * While the RID reservoir report is `pending`, this view deliberately renders
 * no capacity, volume, percentage or reservoir count. It explains the source,
 * the grain, the licence status and the limitations, and points to the
 * upstream document so the page stays useful without publishing pending data.
 */
export function WaterDashboard({ metadata }: WaterDashboardProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1>สถานการณ์น้ำอ่างเก็บน้ำขนาดกลาง</h1>
            <p className={styles.subtitle}>
              ตรวจสอบที่มา ความละเอียด และสถานะสิทธิ์ของรายงานอ่างเก็บน้ำ ก่อนเปิดเผยตัวเลขจากต้นทาง
            </p>
          </div>
          <span className={styles.liveBadge} style={{ background: '#fff8e1', color: '#8d6e00', borderColor: '#ffe082' }}>
            <Icon name="lock" size={14} /> รอตรวจสิทธิ์ · metadata only
          </span>
        </div>
      </div>

      <aside
        role="status"
        aria-label="สถานะสิทธิ์ข้อมูล"
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
        <strong>ยังไม่เปิดเผยตัวเลขจากรายงานอ่างเก็บน้ำ</strong>
        <div style={{ marginTop: 4 }}>
          ทะเบียนสิทธิ์ราย resource ระบุรายงานอ่างเก็บน้ำขนาดกลางของกรมชลประทานเป็น{' '}
          <code>pending</code> จึงไม่แสดงความจุ ปริมาตร เปอร์เซ็นต์ หรือจำนวนอ่างใน HTML, props,
          API หรือ cache จนกว่าจะมีหลักฐานสิทธิ์และ active approved batch
        </div>
      </aside>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>สถานะสิทธิ์ (ทะเบียนโครงการ)</span>
          <div className={styles.kpiValue}>{metadata.licenseStatus}</div>
          <span className={styles.kpiFoot}>ตรวจล่าสุด {metadata.licenseReviewedAt}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>การเผยแพร่ตัวเลข</span>
          <div className={styles.kpiValue}>ปิดอยู่</div>
          <span className={styles.kpiFoot}>public API / HTML / cache ไม่มีค่าตัวเลข</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>ความครบถ้วนของข้อมูล</span>
          <div className={styles.kpiValue}>unknown</div>
          <span className={styles.kpiFoot}>ยังไม่มี active approved batch ให้ตรวจ</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>ความละเอียด (grain)</span>
          <div className={styles.kpiValue} style={{ fontSize: 18 }}>{metadata.grain}</div>
          <span className={styles.kpiFoot}>ระดับอ่างเก็บน้ำ ไม่ใช่ระดับจังหวัด</span>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeadRow}>
          <span className={styles.tableCount}>ข้อมูลกำกับแหล่ง (metadata)</span>
          <span style={{ fontSize: 12, color: '#687d5c' }}>ไม่มีค่าตัวเลขในส่วนนี้</span>
        </div>
        <div className={styles.tableResponsive}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <th scope="row">ชุดข้อมูล</th>
                <td className={styles.reservoirName}>{metadata.datasetName}</td>
              </tr>
              <tr>
                <th scope="row">เจ้าของข้อมูล</th>
                <td>{metadata.sourceName}</td>
              </tr>
              <tr>
                <th scope="row">คำอธิบาย</th>
                <td>{metadata.description}</td>
              </tr>
              <tr>
                <th scope="row">ความถี่</th>
                <td>{metadata.frequency}</td>
              </tr>
              <tr>
                <th scope="row">สถานะในทะเบียน</th>
                <td>
                  <code>{metadata.licenseStatus}</code> · access <code>{metadata.access}</code> · publication approved{' '}
                  <code>{String(metadata.publicationApproved)}</code>
                </td>
              </tr>
              <tr>
                <th scope="row">เอกสารต้นทาง</th>
                <td>
                  <a href={metadata.sourceUrl} target="_blank" rel="noreferrer">
                    {metadata.sourceUrl}
                  </a>
                </td>
              </tr>
              <tr>
                <th scope="row">endpoint ต้นทาง</th>
                <td>
                  <a href={metadata.endpointUrl} target="_blank" rel="noreferrer">
                    {metadata.endpointUrl}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeadRow}>
          <span className={styles.tableCount}>ข้อจำกัดที่ต้องแก้ก่อนเปิดตัวเลข</span>
        </div>
        <ul style={{ margin: 0, padding: '18px 28px 18px 44px', color: '#385043', lineHeight: 1.8, fontSize: 14 }}>
          {metadata.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

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
          ยังไม่มีตัวเลขที่เผยแพร่ได้ในหน้านี้
        </div>
        <p style={{ margin: '0 auto', maxWidth: 720, fontSize: 14, lineHeight: 1.7 }}>
          ระบบจะแสดงปริมาณน้ำและความจุเมื่อ resource ผ่านการตรวจสิทธิ์และมี active approved batch
          ที่ตรวจเทียบกับต้นทางแล้วเท่านั้น ระหว่างนี้สามารถเปิดรายงานทางการได้จากเอกสารต้นทางด้านบน
          หรือค้นชุดข้อมูลที่เกี่ยวข้องในบัญชีข้อมูลกลาง
        </p>
        <div style={{ marginTop: 14, fontSize: 13, color: '#556b60' }}>
          API: <code>GET /api/v1/water/reservoirs</code> · <code>availability: metadata_only</code> ·{' '}
          <code>cache-control: no-store</code>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#556b60', lineHeight: 1.8 }}>
        <strong>warnings จาก API</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 22 }}>
          {WATER_WARNINGS.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
