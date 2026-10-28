'use client';

import { useMemo, useState } from 'react';
import type { DldBeefCattleEnvelope } from '@/lib/hub/dld-beef-cattle';
import styles from './dld-beef-cattle-dashboard.module.css';

const numberFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });

export function DldBeefCattleDashboard({ payload }: { payload: DldBeefCattleEnvelope | null }) {
  const years = payload?.data.availableSourceYearsBe ?? [];
  const [selectedYear, setSelectedYear] = useState<number | null>(years[0] ?? null);
  const rows = useMemo(() => {
    if (!payload) return [];
    return selectedYear === null
      ? payload.data.rows
      : payload.data.rows.filter(row => row.sourceYearBe === selectedYear);
  }, [payload, selectedYear]);

  if (!payload) {
    return (
      <section className={styles.container} aria-live="polite">
        <div className={styles.error} role="status">
          ขณะนี้อ่านข้อมูลจริงจากคลังข้อมูลกลางไม่ได้ กรุณาลองใหม่ภายหลัง
        </div>
      </section>
    );
  }

  const { data, meta } = payload;
  const formatNumber = (value: number | null) => value === null
    ? 'ไม่ทราบ'
    : numberFormat.format(value);
  const formatDateTime = (value: string | null) => {
    if (!value || Number.isNaN(Date.parse(value))) return 'ไม่ระบุ';
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
    }).format(new Date(value));
  };
  const statusText = meta.availability === 'metadata_only'
    ? 'ทรัพยากรนี้ยังไม่มีตัวเลขที่เผยแพร่ในคลังข้อมูลกลาง'
    : meta.availability === 'empty'
      ? 'ขณะนี้ยังไม่มีแถวข้อมูลรายปีให้อ่าน'
      : `แสดงข้อมูล ${rows.length.toLocaleString('th-TH')} แถวตามปีที่เลือก`;

  return (
    <div className={styles.container}>
      <section className={styles.card} aria-label="สถานะข้อมูล">
        <p className={styles.status} role="status">{statusText}</p>
        {meta.warnings.length > 0 && (
          <ul className={styles.warning}>
            {meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </section>

      <section className={styles.summary} aria-label="ข้อมูลชุดนี้">
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>ปี พ.ศ. ที่พบในข้อมูล</span>
          <span className={styles.summaryValue}>{years.length ? years.join(', ') : 'ยังไม่มี'}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>แถวที่แสดง</span>
          <span className={styles.summaryValue}>{rows.length.toLocaleString('th-TH')}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>หน่วยตามแถวข้อมูล</span>
          <span className={styles.summaryValue}>{data.unit ?? 'ไม่ระบุหรือมีหลายหน่วย'}</span>
        </div>
      </section>

      {meta.availability === 'ready' && (
        <section className={styles.card} aria-label="ข้อมูลโคเนื้อรายจังหวัด">
          <div className={styles.toolbar}>
            <div>
              <h2>จำนวนโคเนื้อรายจังหวัด</h2>
              <p className={styles.note}>ปีที่เลือกเป็นป้ายปี พ.ศ. จากต้นทาง</p>
            </div>
            <label className={styles.yearControl} htmlFor="dld-source-year">
              เลือกปีต้นทาง
              <select
                id="dld-source-year"
                value={selectedYear ?? ''}
                onChange={(event) => setSelectedYear(event.target.value ? Number(event.target.value) : null)}
              >
                {years.map(year => <option key={year} value={year}>พ.ศ. {year}</option>)}
                <option value="">ทุกปีที่มีข้อมูล</option>
              </select>
            </label>
          </div>
          {rows.length === 0 ? (
            <p className={styles.note}>ไม่มีแถวข้อมูลสำหรับปีที่เลือก</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">จังหวัด</th>
                    <th scope="col">ปีต้นทาง</th>
                    <th scope="col">จำนวนโคเนื้อ</th>
                    <th scope="col">หน่วย</th>
                    <th scope="col">สถานะค่า</th>
                    <th scope="col">รหัสแถวต้นทาง</th>
                    <th scope="col">Revision</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.rowKey}>
                      <td>{row.provinceName ?? 'ไม่ระบุชื่อจังหวัด'}{row.provinceCode ? ` (${row.provinceCode})` : ''}</td>
                      <td>{row.periodLabel ?? `พ.ศ. ${row.sourceYearBe}`}</td>
                      <td className={styles.numeric}>{formatNumber(row.value)}</td>
                      <td>{row.unit ?? 'ไม่ระบุ'}</td>
                      <td>{row.qualityStatus === 'missing' ? 'ขาดหาย' : row.qualityStatus === 'good' ? 'มีค่า' : row.qualityStatus ?? 'ไม่ระบุ'}</td>
                      <td>{row.sourceRowRef ?? 'ไม่ระบุ'}</td>
                      <td>{row.revisionId ?? 'ไม่ระบุ'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className={styles.card} aria-label="ที่มาและข้อจำกัด">
        <h2>ที่มาและช่วงเวลา</h2>
        <p>
          แหล่งข้อมูล: <a className={styles.sourceLink} href={data.sourceUrl} target="_blank" rel="noreferrer">{data.sourceName}</a>
        </p>
        <p className={styles.note}>
          เกรนข้อมูล: จังหวัด × ป้ายปี พ.ศ. ต้นทาง · ประเภทของปียังไม่ยืนยัน · วันอ้างอิงข้อมูล: ไม่มี (dataAsOf = null)
        </p>
        <dl className={styles.provenance}>
          <div><dt>Resource ID</dt><dd>{data.resourceId}</dd></div>
          <div><dt>สัญญาอนุญาตต้นทาง</dt><dd>{data.sourceLicenseStatus}</dd></div>
          <div><dt>ฐานสิทธิ์เผยแพร่ใน Hub</dt><dd>{data.publicationAuthorization}</dd></div>
          <div><dt>Dataset version</dt><dd>{meta.datasetVersion ?? 'ไม่ระบุ'}</dd></div>
          <div><dt>Adapter version</dt><dd>{data.adapterVersion ?? 'ไม่ระบุ'}</dd></div>
          <div><dt>Source revision</dt><dd>{data.sourceRevisionIds.length
            ? data.sourceRevisionIds.map(value => value ?? 'ไม่ระบุ').join(', ')
            : 'ไม่ระบุ'}</dd></div>
          <div><dt>อ่านจากต้นทางเมื่อ</dt><dd>{formatDateTime(meta.sourceRetrievedAt ?? null)}</dd></div>
          <div><dt>ความครบถ้วนของ run</dt><dd>{meta.completeness}</dd></div>
        </dl>
        <p className={styles.note}>
          จำนวนแถวที่แสดงเป็นผลจากข้อมูลที่อ่านได้ ไม่ใช้ยืนยัน coverage จังหวัด และไม่มีการเติมค่าที่หายให้เป็นศูนย์
        </p>
      </section>
    </div>
  );
}
