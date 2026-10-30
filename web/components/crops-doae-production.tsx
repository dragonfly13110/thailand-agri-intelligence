'use client';

import { useMemo, useState } from 'react';
import type { DoaeProductionBlock, DoaeProductionBlockRow } from '@/lib/hub/crops-soil-data';
import styles from './crops-doae-production.module.css';

const numberFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 });
/** เพดานแถวที่วาดในตารางต่อครั้ง (หน้าต่างอ่านยังถูกจำกัดอีกชั้นหนึ่งที่ server) */
const RENDER_ROW_CAP = 200;

const AVAILABILITY_LABEL: Record<DoaeProductionBlock['availability'], string> = {
  ready: 'อ่านแถวจริงจากคลังข้อมูลกลางได้',
  empty: 'ไม่มีแถวจริงในคลังข้อมูลกลางสำหรับเงื่อนไขนี้',
  catalog_pending: 'รอแคตตาล็อกยืนยันสิทธิ์ทรัพยากรในคลังข้อมูลกลาง',
  catalog_missing: 'ยังไม่พบทรัพยากรนี้ในแคตตาล็อกของคลังข้อมูลกลาง',
  no_numeric_run: 'ยังไม่มีชุดตัวเลข (numeric run) ที่เผยแพร่สำหรับทรัพยากรนี้',
  unavailable: 'เชื่อมต่อคลังข้อมูลกลางไม่ได้ในขณะอ่าน',
};

function formatValue(value: number | null): string {
  return value === null ? 'ไม่ทราบ' : numberFormat.format(value);
}

function formatUnit(unit: string | null): string {
  return unit ?? 'ไม่ยืนยันหน่วย';
}

function formatDateTime(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'ไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

function qualityLabel(status: string | null): string {
  if (status === 'good') return 'มีค่าจากต้นทาง';
  if (status === 'missing') return 'ขาดหาย (ไม่เติมเป็น 0)';
  return status ?? 'ไม่ระบุ';
}

export type CropsDoaeProductionProps = {
  block: DoaeProductionBlock | null;
  /** 'soil' จะเพิ่มข้อความชี้ชัดว่านี่คือข้อมูลการผลิตพืช ไม่ใช่ข้อมูลดิน */
  variant?: 'crops' | 'soil';
  /** ระบุทรัพยากรที่จะแสดง (ค่าเริ่มต้นคือทรัพยากรที่ส่งมาในบล็อกรายตัว) */
  title?: string;
};

export function CropsDoaeProduction({ block, variant = 'crops', title }: CropsDoaeProductionProps) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);

  const years = block?.sourceYearsBe ?? [];
  const measures = block?.measuresFound ?? [];
  const provinces = useMemo(() => {
    if (!block) return [] as Array<{ code: string; name: string | null }>;
    const byCode = new Map<string, string | null>();
    for (const row of block.rows) {
      if (row.provinceCode && !byCode.has(row.provinceCode)) byCode.set(row.provinceCode, row.provinceName);
    }
    return [...byCode.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [block]);

  const visibleRows = useMemo(() => {
    if (!block) return [] as DoaeProductionBlockRow[];
    return block.rows.filter(row =>
      (selectedYear === null || row.sourceYearBe === selectedYear)
      && (selectedMeasure === null || String(row.measure) === selectedMeasure)
      && (selectedProvince === null || row.provinceCode === selectedProvince),
    );
  }, [block, selectedMeasure, selectedProvince, selectedYear]);

  if (!block) {
    return (
      <section className={styles.container} aria-label="ข้อมูลการผลิตพืชระดับตำบล (DOAE)">
        <div className={styles.error} role="status">
          ขณะนี้อ่านข้อมูลจริงจากคลังข้อมูลกลางไม่ได้ จึงไม่แสดงตัวเลขตัวอย่างใด ๆ ในบล็อกนี้
          กรุณาลองใหม่ภายหลังหรือตรวจสอบว่าการเผยแพร่ข้อมูล DOAE ดำเนินการแล้ว
        </div>
      </section>
    );
  }

  const isReady = block.availability === 'ready' && block.rows.length > 0;
  const cappedRows = visibleRows.slice(0, RENDER_ROW_CAP);
  const heading = title ?? block.catalog.label;

  return (
    <div className={styles.container}>
      {variant === 'soil' && (
        <div className={styles.pending} role="note">
          บล็อกนี้คือ <strong>ข้อมูลภาวะการผลิตพืชระดับตำบล</strong> ของกรมส่งเสริมการเกษตร
          ไม่ใช่ข้อมูลดินหรือคำแนะนำปุ๋ยของกรมพัฒนาที่ดิน — ใช้ดูเทียบเคียงเฉพาะกิจกรรมการผลิตของพืช
        </div>
      )}

      <section className={styles.card} aria-label="สถานะข้อมูลการผลิตจริง">
        <p className={isReady ? styles.status : block.availability === 'unavailable' ? styles.error : styles.pending} role="status">
          {AVAILABILITY_LABEL[block.availability]}
          {isReady && ` · แสดง ${block.loadedCount.toLocaleString('th-TH')} แถวจาก ${block.totalCount.toLocaleString('th-TH')} แถวที่เผยแพร่`}
          <span className={styles.sampleBadge}>ข้อมูลจริง (sample: false)</span>
        </p>
        {block.warnings.length > 0 && (
          <div className={styles.warning} style={{ marginTop: 12 }}>
            ข้อจำกัดที่ต้องอ่านพร้อมตัวเลข
            <ul>
              {block.warnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className={styles.summary} aria-label="สรุปบล็อกนี้">
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>ทรัพยากร</span>
          <span className={styles.summaryValue} style={{ fontSize: 14 }}>{heading}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>ปี พ.ศ. ต้นทางที่พบ</span>
          <span className={styles.summaryValue}>{years.length ? years.join(', ') : 'ยังไม่มี'}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>ตำบลที่อ่านได้ในหน้าต่างนี้</span>
          <span className={styles.summaryValue}>{block.distinctSubdistrictsLoaded.toLocaleString('th-TH')}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>ตัวชี้วัดที่พบ (นับแถว ไม่รวมค่า)</span>
          <span className={styles.summaryValue} style={{ fontSize: 14 }}>
            {measures.length
              ? measures.map(entry => `${entry.measure}: ${entry.rows.toLocaleString('th-TH')}`).join(' · ')
              : 'ยังไม่มี'}
          </span>
        </div>
      </section>

      {isReady && (
        <section className={styles.card} aria-label="ตารางข้อมูลการผลิตระดับตำบล">
          <div className={styles.toolbar}>
            <div>
              <h2>ภาวะการผลิตพืช เกรนระดับตำบล (ตามป้ายชื่อต้นทาง)</h2>
              <p className={styles.note}>
                เกรน: {block.catalog.grain}
              </p>
            </div>
            <div className={styles.filters}>
              <label className={styles.filterControl} htmlFor="doae-source-year">
                ปี พ.ศ. ต้นทาง
                <select
                  id="doae-source-year"
                  value={selectedYear ?? ''}
                  onChange={event => setSelectedYear(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">ทุกปีที่อ่านได้</option>
                  {years.map(year => <option key={year} value={year}>พ.ศ. {year}</option>)}
                </select>
              </label>
              <label className={styles.filterControl} htmlFor="doae-measure">
                ตัวชี้วัด
                <select
                  id="doae-measure"
                  value={selectedMeasure ?? ''}
                  onChange={event => setSelectedMeasure(event.target.value || null)}
                >
                  <option value="">ทุกตัวชี้วัดที่พบ</option>
                  {measures.map(entry => (
                    <option key={entry.measure} value={entry.measure}>
                      {entry.measure}{entry.unit ? ` (${entry.unit})` : ' (ไม่ยืนยันหน่วย)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterControl} htmlFor="doae-province">
                จังหวัด (ตามหน้าต่างที่อ่าน)
                <select
                  id="doae-province"
                  value={selectedProvince ?? ''}
                  onChange={event => setSelectedProvince(event.target.value || null)}
                >
                  <option value="">ทุกจังหวัดที่อ่านได้</option>
                  {provinces.map(province => (
                    <option key={province.code} value={province.code}>
                      {province.code} · {province.name ?? 'ไม่ระบุชื่อในแถวนี้'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <p className={styles.note}>ไม่มีแถวที่ตรงกับตัวกรองในหน้าต่างที่อ่านได้ (ไม่สรุปว่าทั้งชุดไม่มีข้อมูล)</p>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">จังหวัด</th>
                      <th scope="col">อำเภอ</th>
                      <th scope="col">ตำบล</th>
                      <th scope="col">ชนิดพืช</th>
                      <th scope="col">พันธุ์</th>
                      <th scope="col">ตัวชี้วัด</th>
                      <th scope="col">ค่า</th>
                      <th scope="col">หน่วย</th>
                      <th scope="col">ปี พ.ศ.</th>
                      <th scope="col">ฉลากเดือน</th>
                      <th scope="col">ฉลาก รอบปลูก</th>
                      <th scope="col">สถานะค่า</th>
                      <th scope="col">แถวต้นทาง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cappedRows.map(row => (
                      <tr key={row.rowKey}>
                        <td>{row.provinceName ?? 'ไม่ระบุชื่อ'}{row.provinceCode ? ` (${row.provinceCode})` : ''}</td>
                        <td>{row.districtName ?? 'ไม่ระบุ'}</td>
                        <td>{row.subdistrictName ?? 'ไม่ระบุ'}</td>
                        <td>{row.cropType ?? 'ไม่ระบุ'}</td>
                        <td>{row.varietyName && row.varietyName !== '-' ? row.varietyName : <span className={styles.tag}>-</span>}</td>
                        <td>{row.metricLabel ?? String(row.measure)}</td>
                        <td className={row.value === null ? styles.unknown : styles.numeric}>{formatValue(row.value)}</td>
                        <td className={row.unit === null ? styles.unknown : undefined}>{formatUnit(row.unit)}</td>
                        <td>{row.sourceYearBe !== null ? `พ.ศ. ${row.sourceYearBe}` : row.periodLabel ?? 'ไม่ระบุ'}</td>
                        <td>{row.monthLabel ?? '—'}</td>
                        <td>{row.plantingRoundLabel ?? '—'}</td>
                        <td>{qualityLabel(row.qualityStatus)}</td>
                        <td>{row.sourceRowRef ?? 'ไม่ระบุ'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visibleRows.length > cappedRows.length && (
                <p className={styles.note}>
                  ตารางวาดเฉพาะ {cappedRows.length.toLocaleString('th-TH')} แถวแรก จาก {visibleRows.length.toLocaleString('th-TH')} แถวที่กรองได้
                  (เพื่อจำกัดขนาดหน้า ไม่ใช่จำนวนแถวทั้งหมด)
                </p>
              )}
              <p className={styles.note}>
                ฉลากเดือนและรอบการปลูกเป็นข้อความต้นทางที่ยังไม่ยืนยันความหมาย จึงแสดงตามฉลากโดยไม่แปลเป็นช่วงเวลาหรือฤดูกาล
              </p>
            </>
          )}
        </section>
      )}

      <section className={styles.card} aria-label="ที่มาและสิทธิ์ของบล็อกนี้">
        <h2>ที่มาและสิทธิ์</h2>
        <p>
          แหล่งข้อมูล:{' '}
          <a className={styles.sourceLink} href={block.catalog.datasetUrl} target="_blank" rel="noreferrer">
            {block.catalog.sourceName} — {block.catalog.label}
          </a>{' '}
          · <a className={styles.sourceLink} href={block.catalog.downloadUrl} target="_blank" rel="noreferrer">ไฟล์ต้นทาง</a>
        </p>
        <p className={styles.note}>สัญญาสิทธิ์: {block.catalog.attribution}</p>
        <dl className={styles.provenance}>
          <div><dt>Resource ID (CKAN)</dt><dd>{block.catalog.resourceId}</dd></div>
          <div><dt>Dataset ID</dt><dd>{block.catalog.datasetId}</dd></div>
          <div><dt>สถานะสัญญาอนุญาตต้นทาง</dt><dd>
            {block.catalog.licenseStatus} · ป้าย {block.catalog.declaredLicense} (ยังไม่ยืนยันรูปแบบเฉพาะของสัญญาอนุญาต)
          </dd></div>
          <div><dt>ฐานสิทธิ์เผยแพร่ใน Hub</dt><dd>
            {block.catalog.publicationBasis} · นโยบาย {block.catalog.publicationPolicyId} · ตรวจสิทธิ์เมื่อ {block.catalog.reviewedAt}
          </dd></div>
          <div><dt>Run ID / สถานะ</dt><dd>
            {block.provenance.runId ?? 'ยังไม่มีการเผยแพร่ตัวเลขจริง'} · {block.provenance.runStatus ?? 'ไม่ระบุ'}
          </dd></div>
          <div><dt>Payload SHA-256</dt><dd>{block.provenance.payloadSha256 ?? 'ไม่ระบุ'}</dd></div>
          <div><dt>Adapter version</dt><dd>{block.provenance.adapterVersion ?? 'ไม่ระบุ'}</dd></div>
          <div><dt>Source revision</dt><dd>{block.provenance.revisionIds.length ? block.provenance.revisionIds.join(', ') : 'ไม่ระบุ'}</dd></div>
          <div><dt>อ่านจากต้นทางเมื่อ</dt><dd>{formatDateTime(block.provenance.sourceRetrievedAt)}</dd></div>
          <div><dt>ตัวกรองที่ฝั่งเซิร์ฟเวอร์ใช้</dt><dd>
            จังหวัด {block.filters.provinceCode ?? 'ทั้งหมดที่อ่านได้'} · ตัวชี้วัด {block.filters.measure ?? 'ทั้งหมด'} ·
            ปี พ.ศ. {block.filters.sourceYearBe ?? 'ทั้งหมด'}
          </dd></div>
        </dl>
        <p className={styles.note}>
          บล็อกนี้ไม่มีการบวกเลขข้ามแถว ไม่มีการรวมค่าเป็นระดับจังหวัด และไม่มีค่าที่ถูกแทนที่ด้วย 0
          เมื่อต้นทางไม่ส่งค่ามา
        </p>
      </section>
    </div>
  );
}
