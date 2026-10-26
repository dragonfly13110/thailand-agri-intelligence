import React from 'react';
import type { WaterPayload, WaterReservoirRecord, WaterSourceMetadata } from '@/lib/hub/water-data';
import { WATER_FALLBACK_WARNINGS, WATER_WARNINGS } from '@/lib/hub/water-data';
import type { WaterRunProvenance } from '@/lib/hub/water-repository';
import { Icon } from './icon';
import styles from './water-dashboard.module.css';

/** Rows shown in the on-page table; the API paginates the same set. */
const TABLE_ROWS = 25;

interface WaterDashboardProps {
  metadata: WaterSourceMetadata;
  /** The published D1 batch, or null when nothing publishable could be read. */
  payload: WaterPayload | null;
  provenance: WaterRunProvenance | null;
}

/**
 * Formats a published value without inventing precision: the source carries
 * three decimals for small reservoirs, so trailing zeros are dropped rather
 * than forcing a fixed scale that would render 0.094 as 0.09.
 */
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

/**
 * RID medium-reservoir dashboard.
 *
 * Numbers come only from the active approved numeric batch in the central
 * warehouse. When that batch cannot be read the view says so and renders no
 * volume, percentage or count — an unavailable database is never "no water".
 * Grain is reservoir × report_date, so nothing is rolled up to a province.
 */
export function WaterDashboard({ metadata, payload, provenance }: WaterDashboardProps) {
  const summary = payload?.summary ?? null;
  const records = payload?.reservoirs ?? [];
  const hasNumbers = summary !== null && records.length > 0;
  const warnings = hasNumbers ? WATER_WARNINGS : WATER_FALLBACK_WARNINGS;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h1>สถานการณ์น้ำอ่างเก็บน้ำขนาดกลาง</h1>
            <p className={styles.subtitle}>
              ปริมาตรน้ำและสัดส่วนน้ำรายอ่างจากคลังข้อมูลกลาง พร้อมที่มา ความละเอียด {metadata.grain}{' '}
              และข้อจำกัดของแหล่งข้อมูล
            </p>
          </div>
          {hasNumbers ? (
            <span className={styles.liveBadge}>
              <Icon name="water" size={14} /> ข้อมูลจริง · {summary?.reportDate ?? 'ไม่ระบุวัน'}
            </span>
          ) : (
            <span
              className={styles.liveBadge}
              style={{ background: '#fff8e1', color: '#8d6e00', borderColor: '#ffe082' }}
            >
              <Icon name="lock" size={14} /> metadata only · ยังไม่มี batch ที่เผยแพร่ได้
            </span>
          )}
        </div>
      </div>

      {hasNumbers ? (
        <aside
          role="status"
          aria-label="ที่มาของตัวเลข"
          style={{
            background: '#e8f5e9',
            border: '1px solid #c8e6c9',
            borderRadius: 12,
            padding: '16px 20px',
            color: '#1b4d21',
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <strong>ตัวเลขจากชุดข้อมูลที่เผยแพร่แล้วของกรมชลประทาน</strong>
          <div style={{ marginTop: 4 }}>
            อ่านจากคลังข้อมูลกลางใต้ <code>active_run_id</code> สถานะ <code>{provenance?.runStatus ?? 'unknown'}</code>{' '}
            · {provenance?.observationRows ?? 0} observation rows · adapter{' '}
            <code>{provenance?.adapterVersion ?? 'unknown'}</code> · เวอร์ชันชุดข้อมูล{' '}
            <code>{provenance?.payloadSha256?.slice(0, 12) ?? '—'}</code>
            {provenance?.sourceUpdatedAt ? ` · ต้นทางปรับปรุง ${provenance.sourceUpdatedAt}` : ''}
          </div>
        </aside>
      ) : (
        <aside
          role="status"
          aria-label="สถานะการเผยแพร่ตัวเลข"
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
          <strong>ยังไม่แสดงตัวเลขจากรายงานอ่างเก็บน้ำในหน้านี้</strong>
          <div style={{ marginTop: 4 }}>
            ทะเบียนสิทธิ์เปิดให้เผยแพร่แล้ว (<code>{metadata.licenseStatus}</code>) แต่หน้านี้ยังอ่านไม่พบ active
            numeric batch ของทรัพยากรนี้ในคลังข้อมูลกลาง จึงไม่แสดงความจุ ปริมาตร เปอร์เซ็นต์ หรือจำนวนอ่าง
            ค่าว่างหมายถึง &quot;ยังไม่มีข้อมูลที่เผยแพร่ได้&quot; ไม่ใช่ 0 หรือ &quot;ไม่มีน้ำ&quot;
          </div>
        </aside>
      )}

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>จำนวนอ่างที่มีข้อมูล</span>
          <div className={styles.kpiValue}>
            {hasNumbers ? formatNumber(summary?.reservoirCount, 0) : '—'}
            {hasNumbers ? <span className={styles.kpiUnit}>อ่าง</span> : null}
          </div>
          <span className={styles.kpiFoot}>
            {hasNumbers ? `รายงานวันที่ ${summary?.reportDate ?? '—'}` : 'ยังไม่มี batch ที่อ่านได้'}
          </span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>ปริมาตรน้ำรวม</span>
          <div className={styles.kpiValue}>
            {hasNumbers ? formatNumber(summary?.totalVolumeMcm) : '—'}
            {hasNumbers ? <span className={styles.kpiUnit}>MCM</span> : null}
          </div>
          <span className={styles.kpiFoot}>รวมเฉพาะอ่างที่มีค่า ไม่ใช่ความจุติดตั้ง</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>สัดส่วนน้ำต่ำสุด</span>
          <div className={styles.kpiValue}>
            {hasNumbers ? formatNumber(summary?.minStoragePercent) : '—'}
            {hasNumbers ? <span className={styles.kpiUnit}>%</span> : null}
          </div>
          <span className={styles.kpiFoot}>สูงสุด {hasNumbers ? formatNumber(summary?.maxStoragePercent) : '—'} %</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>เกินระดับออกแบบ / ขาดข้อมูล</span>
          <div className={styles.kpiValue} style={{ fontSize: 22 }}>
            {hasNumbers ? `${formatNumber(summary?.aboveDesignCount, 0)} / ${formatNumber(summary?.missingVolumeCount, 0)}` : '—'}
          </div>
          <span className={styles.kpiFoot}>
            {hasNumbers
              ? `สัดส่วนน้ำขาดหาย ${formatNumber(summary?.missingPercentCount, 0)} อ่าง · ${summary?.unitStatus}`
              : 'ไม่มีตัวเลขจนกว่าจะอ่าน batch สำเร็จ'}
          </span>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeadRow}>
          <span className={styles.tableCount}>
            {hasNumbers
              ? `อ่างที่สัดส่วนน้ำต่ำสุด ${Math.min(TABLE_ROWS, records.length)} จาก ${formatNumber(records.length, 0)} อ่าง`
              : 'รายการอ่างเก็บน้ำ'}
          </span>
          <span style={{ fontSize: 12, color: '#687d5c' }}>หน่วยปริมาตร MCM · เรียงจากสัดส่วนน้ำน้อยไปมาก</span>
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
              {hasNumbers ? (
                records.slice(0, TABLE_ROWS).map((record) => <ReservoirRow key={record.reservoirId} record={record} />)
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#687d5c', padding: '22px 12px' }}>
                    ยังไม่มีแถวตัวเลขที่เผยแพร่ได้ในคลังข้อมูลกลาง — รายการจะเพิ่มขึ้นเองเมื่อรอบ sync เขียนสำเร็จใต้{' '}
                    <code>active_run_id</code>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeadRow}>
          <span className={styles.tableCount}>ข้อมูลกำกับแหล่ง (metadata)</span>
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
                <th scope="row">ความถี่ / ความละเอียด</th>
                <td>
                  {metadata.frequency} · {metadata.grain}
                </td>
              </tr>
              <tr>
                <th scope="row">สถานะในทะเบียน</th>
                <td>
                  <code>{metadata.licenseStatus}</code> · access <code>{metadata.access}</code> · publication approved{' '}
                  <code>{String(metadata.publicationApproved)}</code> · ตรวจ {metadata.licenseReviewedAt}
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
          <span className={styles.tableCount}>ข้อจำกัดของแหล่งข้อมูล</span>
        </div>
        <ul style={{ margin: 0, padding: '18px 28px 18px 44px', color: '#385043', lineHeight: 1.8, fontSize: 14 }}>
          {metadata.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div style={{ fontSize: 13, color: '#556b60', lineHeight: 1.8 }}>
        <strong>warnings จาก API</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 22 }}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <div style={{ marginTop: 10 }}>
          API: <code>GET /api/v1/water/reservoirs</code> · <code>?date=YYYY-MM-DD</code> ·{' '}
          <code>cache-control: no-store</code>
        </div>
      </div>
    </div>
  );
}
