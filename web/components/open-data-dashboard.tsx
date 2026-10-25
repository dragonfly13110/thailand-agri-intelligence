'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { OpenDataAnalytics } from '@/lib/hub/open-data-analytics';
import styles from './open-data-dashboard.module.css';

type Agency = OpenDataAnalytics['agencies'][number];
type Format = OpenDataAnalytics['formats'][number];
type Filters = { sourceId: string; format: string };
type Result = { key: string; attempt: number; data: OpenDataAnalytics | null; error: string | null };
type Sort = 'readiness' | 'machine' | 'datasets' | 'name';
const EMPTY_FILTERS: Filters = { sourceId: '', format: '' };
const COLORS = ['#497b59', '#b58236', '#4f8196', '#8a6ba3', '#b26464', '#717c42'];
const UPDATE_LABELS = [
  ['daily', 'รายวัน'], ['monthly', 'รายเดือน'], ['annual', 'รายปี'],
  ['stale', 'metadata เก่า'], ['other', 'รอบอื่น'], ['unknown', 'ไม่ทราบ'],
] as const;
const num = (value: number) => value.toLocaleString('th-TH');
const percent = (value: number | null) => value === null ? 'ไม่ทราบ' : `${(value * 100).toLocaleString('th-TH', { maximumFractionDigits: 1 })}%`;
const score = (value: number | null) => value === null ? 'ประเมินไม่ได้' : value.toLocaleString('th-TH', { maximumFractionDigits: 1 });
const formatLabel = (value: string) => !value || ['unknown', 'unspecified'].includes(value.toLowerCase()) ? 'ไม่ระบุรูปแบบ' : value;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const ratio = (value: unknown, max = 1) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max);
class PublicAnalyticsError extends Error {}

function validAnalytics(value: unknown): value is OpenDataAnalytics {
  if (!record(value) || typeof value.generatedAt !== 'string' ||
    !['ready', 'empty', 'metadata_only', 'unavailable'].includes(String(value.availability)) ||
    !count(value.totalDatasets) || !count(value.totalResources) || !count(value.agencyCount) ||
    !Array.isArray(value.formats) || !Array.isArray(value.agencies) ||
    !Array.isArray(value.notes) || !value.notes.every(note => typeof note === 'string') ||
    value.access !== 'metadata_only' || !['complete', 'partial', 'unknown'].includes(String(value.completeness)) ||
    !record(value.readScope) || !count(value.readScope.maxDatasets) || !count(value.readScope.analyzedDatasets) ||
    !(value.readScope.matchedDatasets === null || count(value.readScope.matchedDatasets)) || typeof value.readScope.truncated !== 'boolean' ||
    !record(value.machineReadability)) return false;
  const m = value.machineReadability;
  return ['machineReadableDatasets', 'pdfOnlyDatasets', 'mixedDatasets', 'otherDatasets', 'assessedDatasets', 'unknownDatasets'].every(key => count(m[key])) &&
    ratio(m.machineReadableRatio) && ratio(m.pdfOnlyRatio) &&
    value.formats.every(f => record(f) && typeof f.format === 'string' && count(f.datasetCount) && count(f.resourceCount)) &&
    value.agencies.every(a => record(a) && typeof a.sourceId === 'string' && typeof a.name === 'string' &&
      count(a.datasetCount) && count(a.resourceCount) && count(a.machineReadableDatasets) && count(a.assessedDatasets) && count(a.unknownDatasets) &&
      ratio(a.machineReadableRatio) && ratio(a.readinessScore, 100) &&
      Array.isArray(a.starCounts) && a.starCounts.every(s => record(s) &&
        (s.stars === null || (typeof s.stars === 'number' && Number.isInteger(s.stars))) && count(s.datasetCount)) &&
      record(a.updates) && UPDATE_LABELS.every(([key]) => count((a.updates as Record<string, unknown>)[key])));
}

async function readAnalytics(response: Response): Promise<OpenDataAnalytics> {
  const body: unknown = await response.json();
  if (!response.ok) {
    // Show only known public error categories, never arbitrary upstream error text.
    const code = record(body) && record(body.error) ? body.error.code : null;
    if (code === 'INVALID_QUERY') throw new PublicAnalyticsError('ตัวกรองไม่ถูกต้อง ลองล้างตัวกรองแล้วเลือกใหม่');
    throw new PublicAnalyticsError('ยังอ่านบัญชีข้อมูลกลางไม่ได้ กรุณาลองอีกครั้ง');
  }
  if (!record(body) || !record(body.meta) || body.meta.access !== 'metadata_only') {
    throw new PublicAnalyticsError('ผลลัพธ์นี้ยังไม่พร้อมเผยแพร่');
  }
  if (!validAnalytics(body.data)) throw new PublicAnalyticsError('รูปแบบผลวิเคราะห์ไม่พร้อมใช้งาน กรุณาลองอีกครั้ง');
  return body.data;
}

function timestamp(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return 'ยังไม่ทราบเวลาประมวลผล';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

function Meter({ value, label }: { value: number | null; label: string }) {
  return <div className={styles.meter} role="img" aria-label={`${label}: ${percent(value)}`}>
    {value !== null && <span style={{ width: `${value * 100}%` }} />}
  </div>;
}

function ResourceChart({ formats, total }: { formats: Format[]; total: number }) {
  const circumference = 2 * Math.PI * 70;
  const parts = [...formats].sort((a, b) => b.resourceCount - a.resourceCount || a.format.localeCompare(b.format));
  const listed = parts.reduce((sum, f) => sum + f.resourceCount, 0);
  const remainder = Math.max(0, total - listed);
  const slices = [...parts.map((f, index) => ({ label: formatLabel(f.format), value: f.resourceCount, color: COLORS[index % COLORS.length] })),
    ...(remainder ? [{ label: 'ไม่ได้จัดกลุ่มรูปแบบ', value: remainder, color: '#81898a' }] : [])];
  let offset = 0;
  return <>
    <div className={styles.formatVisual}>
      <svg viewBox="0 0 200 200" className={styles.donut} role="img" aria-labelledby="od-format-chart-title od-format-chart-desc">
        <title id="od-format-chart-title">สัดส่วนรูปแบบไฟล์ตามจำนวนทรัพยากร</title>
        <desc id="od-format-chart-desc">รวม {num(total)} ทรัพยากร รายละเอียดจำนวนและสัดส่วนทุกประเภทอยู่ในตารางถัดไป</desc>
        <circle cx="100" cy="100" r="70" fill="none" className={styles.donutTrack} strokeWidth="23" />
        {total > 0 && slices.map((slice, index) => {
          const length = slice.value / total * circumference;
          const start = offset;
          offset += length;
          return <circle key={index} cx="100" cy="100" r="70" fill="none" stroke={slice.color} strokeWidth="23"
            strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-start} transform="rotate(-90 100 100)" />;
        })}
        <text x="100" y="99" textAnchor="middle" className={styles.donutNumber}>{num(total)}</text>
        <text x="100" y="121" textAnchor="middle" className={styles.donutLabel}>ทรัพยากร</text>
      </svg>
      <div className={styles.legend}>
        {slices.map((slice, index) => <div key={index}><span className={styles.swatch} style={{ background: slice.color }} aria-hidden="true" />
          <span>{slice.label}</span><strong>{percent(total ? slice.value / total : null)}</strong></div>)}
        {!slices.length && <p>ยังไม่มีทรัพยากรสำหรับคำนวณสัดส่วน</p>}
      </div>
    </div>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="ตารางรูปแบบไฟล์ เลื่อนแนวนอนได้">
      <table className={styles.table}>
        <caption>จำนวนตามรูปแบบ — ชุดข้อมูลเดียวอาจมีหลายรูปแบบ จึงห้ามบวกคอลัมน์ชุดข้อมูลเป็นยอดรวม</caption>
        <thead><tr><th scope="col">รูปแบบ</th><th scope="col">ชุดข้อมูล</th><th scope="col">ทรัพยากร</th><th scope="col">% ทรัพยากร</th></tr></thead>
        <tbody>{parts.map(f => <tr key={f.format}><th scope="row">{formatLabel(f.format)}</th><td>{num(f.datasetCount)}</td>
          <td>{num(f.resourceCount)}</td><td>{percent(total ? f.resourceCount / total : null)}</td></tr>)}
          {remainder > 0 && <tr><th scope="row">ไม่ได้จัดกลุ่มรูปแบบ</th><td>ไม่ทราบ</td><td>{num(remainder)}</td><td>{percent(remainder / total)}</td></tr>}
          {!parts.length && !remainder && <tr><td colSpan={4}>ไม่มีทรัพยากรตามเงื่อนไขนี้</td></tr>}</tbody>
      </table>
    </div>
  </>;
}

function AgencyCard({ agency }: { agency: Agency }) {
  const unassessed = agency.starCounts.filter(s => s.stars === null || ![1, 2, 3].includes(s.stars)).reduce((sum, s) => sum + s.datasetCount, 0);
  return <article className={styles.agencyCard}>
    <div className={styles.agencyHeading}><div><span className={styles.eyebrow}>{agency.sourceId.toUpperCase()}</span><h3>{agency.name || agency.sourceId}</h3></div>
      <div className={styles.score}><strong>{score(agency.readinessScore)}</strong>{agency.readinessScore !== null && <small>/ 100</small>}</div></div>
    <p className={styles.small}>ความพร้อมเชิง metadata · {num(agency.datasetCount)} ชุดข้อมูล · {num(agency.resourceCount)} ทรัพยากรที่เผย metadata ได้</p>
    <div className={styles.cardMetric}><span>เครื่องอ่านได้</span><strong>{percent(agency.machineReadableRatio)}</strong></div>
    <Meter value={agency.machineReadableRatio} label={`สัดส่วนเครื่องอ่านได้ของ ${agency.name}`} />
    <p className={styles.small}>{num(agency.machineReadableDatasets)} จาก {num(agency.assessedDatasets)} ชุดที่ประเมินรูปแบบได้ · อีก {num(agency.unknownDatasets)} ชุดไม่ทราบรูปแบบ</p>
    <div className={styles.cardSection}><h4>ระดับรูปแบบที่อนุมานได้</h4><dl className={styles.starList}>
      {[1, 2, 3].map(stars => <div key={stars}><dt>{stars} ดาว <span className={styles.small}>(proxy)</span></dt>
        <dd>{num(agency.starCounts.filter(s => s.stars === stars).reduce((sum, s) => sum + s.datasetCount, 0))} ชุด</dd></div>)}
      <div><dt>ไม่ทราบ / ไม่ประเมิน</dt><dd>{num(unassessed)} ชุด</dd></div>
    </dl><p className={styles.small}>ไม่ใช่การรับรอง 5-star Open Data และไม่ได้ยืนยันสิทธิ์ใช้ซ้ำ</p></div>
    <div className={styles.cardSection}><h4>รอบอัปเดต / ความสด metadata</h4><dl className={styles.updateList}>
      {UPDATE_LABELS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{num(agency.updates[key])} ชุด</dd></div>)}
    </dl></div>
    <Link className={styles.textLink} href={`/catalog?sourceId=${encodeURIComponent(agency.sourceId)}`}>ดูบัญชีข้อมูลของหน่วยงาน<span aria-hidden="true"> →</span></Link>
  </article>;
}

export function OpenDataDashboard({ initialData }: { initialData: OpenDataAnalytics | null }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<Sort>('readiness');
  const [result, setResult] = useState<Result>({ key: '', attempt: 0, data: initialData, error: initialData ? null : 'ยังอ่านบัญชีข้อมูลกลางไม่ได้' });
  const [options, setOptions] = useState({ agencies: initialData?.agencies ?? [], formats: initialData?.formats ?? [] });
  const params = new URLSearchParams();
  if (filters.sourceId) params.set('sourceId', filters.sourceId);
  if (filters.format) params.set('format', filters.format);
  const query = params.toString();
  const requestKey = `${query}|${attempt}`;

  useEffect(() => {
    // The initial unfiltered snapshot already came from the server repository.
    if (!query && attempt === 0) return;
    const controller = new AbortController();
    let active = true;
    fetch(`/api/v1/open-data${query ? `?${query}` : ''}`, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } })
      .then(readAnalytics)
      .then(data => {
        if (!active) return;
        setResult({ key: query, attempt, data, error: null });
        setOptions(previous => ({
          agencies: [...new Map([...previous.agencies, ...data.agencies].map(a => [a.sourceId, a])).values()],
          formats: [...new Map([...previous.formats, ...data.formats].map(f => [f.format, f])).values()],
        }));
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setResult({ key: query, attempt, data: null, error: error instanceof PublicAnalyticsError ? error.message : 'ยังอ่านผลตามตัวกรองไม่ได้ ลองอีกครั้งหรือล้างตัวกรอง' });
      });
    return () => { active = false; controller.abort(); };
  }, [query, attempt]);

  const isInitial = !query && attempt === 0;
  const loading = !isInitial && `${result.key}|${result.attempt}` !== requestKey;
  const data = loading ? null : isInitial ? initialData : result.data;
  const error = loading ? null : isInitial ? initialData ? null : 'ยังอ่านบัญชีข้อมูลกลางไม่ได้' : result.error;
  const state = data?.availability ?? 'unavailable';
  const ready = !!data && ['ready', 'metadata_only', 'empty'].includes(state);
  const agencies = useMemo(() => {
    if (!ready || !data) return [];
    return [...data.agencies].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'th');
      const av = sort === 'machine' ? a.machineReadableRatio : sort === 'datasets' ? a.datasetCount : a.readinessScore;
      const bv = sort === 'machine' ? b.machineReadableRatio : sort === 'datasets' ? b.datasetCount : b.readinessScore;
      return (av === null ? bv === null ? 0 : 1 : bv === null ? -1 : bv - av) || a.name.localeCompare(b.name, 'th');
    });
  }, [data, ready, sort]);
  const ranking = useMemo(() => !ready || !data ? [] : [...data.agencies].sort((a, b) =>
    (a.readinessScore === null ? b.readinessScore === null ? 0 : 1 : b.readinessScore === null ? -1 : b.readinessScore - a.readinessScore) || a.name.localeCompare(b.name, 'th')),
  [data, ready]);
  const reset = () => { setFilters(EMPTY_FILTERS); setAttempt(value => value + 1); };
  const filtered = !!filters.sourceId || !!filters.format;

  return <div className={styles.dashboard}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>OPEN DATA · CATALOG INTELLIGENCE</span><h1>ความพร้อมข้อมูลเปิดภาครัฐ</h1>
        <p>มองภาพรวมรูปแบบไฟล์ ความพร้อมรายหน่วยงาน และช่องว่างของบัญชีข้อมูลเกษตร จาก metadata ในคลัง D1</p></div>
      <Link className={styles.secondaryButton} href="/catalog">ค้นบัญชีข้อมูล</Link>
    </header>
    <aside className={styles.governance} aria-label="ขอบเขตการประเมิน">
      <strong>ประเมินความพร้อมจาก metadata ไม่ใช่คะแนนความโปร่งใสที่ผ่านการตรวจรับรอง</strong>
      <p>รูปแบบไฟล์ไม่ได้ยืนยันว่าไฟล์เปิดได้ ถูกต้อง มีสิทธิ์ใช้ซ้ำ หรือเป็นข้อมูลตัวเลขที่ Hub เผยแพร่ได้
        หน้านี้ไม่อ่านค่าภายในหรือข้อมูลที่รอตรวจสิทธิ์ และไม่รับรองระดับ 4–5 ดาว</p>
      <a href="#od-method">อ่านนิยามและข้อจำกัด</a>
    </aside>
    <section className={styles.filterPanel} aria-labelledby="od-filter-title">
      <h2 id="od-filter-title">ขอบเขตที่ต้องการดู</h2>
      <div className={styles.filters}>
        <div><label htmlFor="od-source">หน่วยงาน</label><select id="od-source" value={filters.sourceId} onChange={event => setFilters(value => ({ ...value, sourceId: event.target.value }))}>
          <option value="">ทุกหน่วยงานใน catalog</option>{[...options.agencies].sort((a, b) => a.name.localeCompare(b.name, 'th')).map(a => <option key={a.sourceId} value={a.sourceId}>{a.name || a.sourceId}</option>)}
        </select></div>
        <div><label htmlFor="od-format">รูปแบบทรัพยากร</label><select id="od-format" value={filters.format} onChange={event => setFilters(value => ({ ...value, format: event.target.value }))}>
          <option value="">ทุกรูปแบบ</option>{[...options.formats].sort((a, b) => a.format.localeCompare(b.format)).map(f => <option key={f.format} value={f.format}>{formatLabel(f.format)}</option>)}
        </select></div>
        <button type="button" className={styles.secondaryButton} onClick={reset}>ล้างตัวกรอง</button>
      </div>
      <p className={styles.small}>ตัวเลือกมาจาก catalog จริง · เลือกรูปแบบเพื่อดูชุดข้อมูลที่มีทรัพยากรรูปแบบนั้น</p>
    </section>
    <p className={styles.resultStatus} role="status" aria-live="polite">
      {loading ? 'กำลังอ่านผลตามเงื่อนไข…' : ready && data ? `${filtered ? 'ตามเงื่อนไขที่เลือก' : 'ภาพรวม catalog ที่เผยแพร่ metadata ได้'} · ${num(data.totalDatasets)} ชุดข้อมูล · ${num(data.agencyCount)} หน่วยงาน` : 'ผลวิเคราะห์ยังไม่พร้อมใช้งาน'}
    </p>
    {loading ? <div className={styles.empty} aria-busy="true"><h2>กำลังประมวลผลบัญชีข้อมูล</h2><p>ไม่แสดงยอดจากเงื่อนไขก่อนหน้าระหว่างโหลด</p></div>
      : !ready || !data ? <div className={styles.empty} role="alert"><h2>บัญชีข้อมูลกลางยังไม่พร้อม</h2>
        <p>{error || 'ยังไม่มีผลวิเคราะห์ที่ยืนยันสถานะได้ จึงไม่แสดงยอดเป็นศูนย์หรือจัดอันดับ'}</p>
        <button type="button" className={styles.primaryButton} onClick={() => setAttempt(value => value + 1)}>ลองอีกครั้ง</button></div>
        : data.totalDatasets === 0 ? <div className={styles.empty}><h2>ไม่พบชุดข้อมูลตามเงื่อนไข</h2><p>ไม่มีรายการที่ตรงกับตัวกรอง ไม่ได้หมายความว่าหน่วยงานไม่มีข้อมูล</p><button type="button" className={styles.secondaryButton} onClick={reset}>ดูทุกหน่วยงานและทุกรูปแบบ</button></div>
          : <>
            <div className={styles.snapshot}><span className={styles.badge}>วิเคราะห์ metadata เท่านั้น</span><span>ประมวลผลเมื่อ {timestamp(data.generatedAt)} (ICT) ไม่ใช่วันข้อมูลจริง</span></div>
            {data.completeness !== 'complete' && <aside className={styles.governance}><strong>{data.completeness === 'partial' ? 'ผลวิเคราะห์อาจไม่ครบทั้ง catalog' : 'ยังไม่ยืนยันความครบถ้วนของ catalog'}</strong>
              <p>สถานะความครบถ้วนจากรอบ sync: {data.completeness === 'partial' ? 'บางส่วน' : 'ไม่ทราบ'} ไม่รับรองว่าค้นพบข้อมูลต้นทางทั้งหมด</p></aside>}
            {data.readScope.truncated && <p className={styles.governance}>อ่านเพื่อวิเคราะห์ {num(data.readScope.analyzedDatasets)} จาก {data.readScope.matchedDatasets === null ? 'จำนวนที่ยังไม่ทราบ' : num(data.readScope.matchedDatasets)} ชุดที่ตรงเงื่อนไข ยอดและอันดับด้านล่างเป็นเพียงส่วนที่อ่านได้ ไม่ใช่ทั้งหมด</p>}
            <dl className={styles.kpis}>
              <div><dt>ชุดข้อมูลในขอบเขตนี้</dt><dd>{num(data.totalDatasets)}</dd><small>รายการ catalog ไม่ใช่ชุดตัวเลขที่พร้อมใช้</small></div>
              <div><dt>ทรัพยากรที่เผย metadata ได้</dt><dd>{num(data.totalResources)}</dd><small>ไม่ใช่จำนวนทรัพยากรทั้งหมดใน D1</small></div>
              <div><dt>หน่วยงานในขอบเขตนี้</dt><dd>{num(data.agencyCount)}</dd><small>ไม่ใช่จำนวนหน่วยงานทั้งหมดของประเทศ</small></div>
              <div><dt>สัดส่วนเครื่องอ่านได้</dt><dd>{percent(data.machineReadability.machineReadableRatio)}</dd><small>{num(data.machineReadability.machineReadableDatasets)} จาก {num(data.machineReadability.assessedDatasets)} ชุดที่ประเมินได้</small></div>
            </dl>
            <div className={styles.analysisGrid}>
              <section className={styles.panel} aria-labelledby="od-formats-title"><h2 id="od-formats-title">สัดส่วนรูปแบบไฟล์</h2>
                <p className={styles.sectionIntro}>คิดสัดส่วนจากทรัพยากร ไม่ใช่จากจำนวนชุดข้อมูล</p><ResourceChart formats={data.formats} total={data.totalResources} /></section>
              <section className={styles.panel} aria-labelledby="od-machine-title"><h2 id="od-machine-title">ข้อมูลพร้อมให้เครื่องอ่านแค่ไหน</h2>
                <p className={styles.sectionIntro}>นับเฉพาะ CSV / JSON / API จากป้าย metadata ไม่ได้ทดสอบไฟล์จริง คิดสัดส่วนจาก {num(data.machineReadability.assessedDatasets)} ชุดที่ประเมินได้ แยกอีก {num(data.machineReadability.unknownDatasets)} ชุดที่ไม่ทราบรูปแบบ</p>
                <div className={styles.ratioRow}><div><h3>เครื่องอ่านได้</h3><strong>{percent(data.machineReadability.machineReadableRatio)}</strong></div>
                  <Meter value={data.machineReadability.machineReadableRatio} label="สัดส่วนชุดข้อมูลเครื่องอ่านได้" /><p>{num(data.machineReadability.machineReadableDatasets)} ชุด</p></div>
                <div className={`${styles.ratioRow} ${styles.pdfRow}`}><div><h3>มีเฉพาะ PDF</h3><strong>{percent(data.machineReadability.pdfOnlyRatio)}</strong></div>
                  <Meter value={data.machineReadability.pdfOnlyRatio} label="สัดส่วนชุดข้อมูลที่มีเฉพาะ PDF" /><p>{num(data.machineReadability.pdfOnlyDatasets)} ชุด</p></div>
                <dl className={styles.extraCounts}><div><dt>รูปแบบผสม</dt><dd>{num(data.machineReadability.mixedDatasets)} ชุด</dd></div>
                  <div><dt>กลุ่มอื่น / ไม่ทราบรูปแบบ</dt><dd>{num(data.machineReadability.otherDatasets)} ชุด</dd></div></dl>
                <p className={styles.small}>รูปแบบผสม (PDF ร่วมกับ CSV / JSON / API) รวมอยู่ในกลุ่มเครื่องอ่านได้แล้ว ห้ามบวกซ้ำ กลุ่มอื่นรวม XLSX และรูปแบบอื่นที่ไม่ได้อยู่ในนิยามแบบจำกัด ไม่ได้แปลว่าเครื่องอ่านไม่ได้</p>
                <div className={styles.callout}><strong>มีไฟล์เปิด ≠ มีข้อมูลเปิดที่นำไปใช้ได้ทันที</strong><p>ต้องตรวจสิทธิ์ นิยาม หน่วย grain และเวอร์ชันของแต่ละทรัพยากรก่อนใช้</p></div>
              </section>
            </div>
            <section className={styles.section} aria-labelledby="od-scorecards-title">
              <div className={styles.sectionHeading}><div><h2 id="od-scorecards-title">Open Data Readiness Scorecard</h2><p>ความพร้อมรายหน่วยงานตามขอบเขตที่เลือก ไม่ใช่การตัดสินคุณภาพองค์กร</p></div>
                <div className={styles.sortControl}><label htmlFor="od-sort">เรียงการ์ดตาม</label><select id="od-sort" value={sort} onChange={event => setSort(event.target.value as Sort)}>
                  <option value="readiness">คะแนนความพร้อม</option><option value="machine">สัดส่วนเครื่องอ่านได้</option><option value="datasets">จำนวนชุดข้อมูล</option><option value="name">ชื่อหน่วยงาน</option></select></div></div>
              <div className={styles.agencyGrid}>{agencies.map(a => <AgencyCard key={a.sourceId} agency={a} />)}</div>
              {!agencies.length && <p>ยังไม่มี metadata รายหน่วยงานสำหรับแสดง scorecard</p>}
            </section>
            <section className={styles.panel} aria-labelledby="od-ranking-title"><h2 id="od-ranking-title">อันดับความพร้อมเพื่อสนับสนุนความโปร่งใสภาครัฐ</h2>
              <p className={styles.sectionIntro}>เรียงตาม readinessScore ของ metadata ที่เลือกเท่านั้น ไม่ใช่อันดับความโปร่งใสที่ตรวจสอบจริง คะแนนเท่ากันได้อันดับเดียวกัน</p>
              <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="ตารางอันดับความพร้อม เลื่อนแนวนอนได้">
                <table className={`${styles.table} ${styles.rankingTable}`}><caption>คะแนน 0–100 เป็น heuristic · ไม่ทราบไม่ถูกแทนด้วยศูนย์ · ตารางเลื่อนแนวนอนได้</caption>
                  <thead><tr><th scope="col">อันดับ</th><th scope="col">หน่วยงาน</th><th scope="col">ความพร้อม / 100</th><th scope="col">เครื่องอ่านได้</th><th scope="col">ชุดข้อมูล</th><th scope="col">metadata เก่า</th><th scope="col">รอบไม่ทราบ</th></tr></thead>
                  <tbody>{ranking.map(a => <tr key={a.sourceId}><td>{a.readinessScore === null ? 'ไม่จัดอันดับ' : num(ranking.findIndex(row => row.readinessScore === a.readinessScore) + 1)}</td>
                    <th scope="row"><Link href={`/catalog?sourceId=${encodeURIComponent(a.sourceId)}`}>{a.name || a.sourceId}</Link><small>{a.sourceId.toUpperCase()}</small></th>
                    <td>{score(a.readinessScore)}</td><td>{percent(a.machineReadableRatio)}</td><td>{num(a.datasetCount)}</td><td>{num(a.updates.stale)}</td><td>{num(a.updates.unknown)}</td></tr>)}
                    {!ranking.length && <tr><td colSpan={7}>ยังไม่มีหน่วยงานที่ประเมินได้</td></tr>}</tbody>
                </table>
              </div>
              <p className={styles.small}>metadata เก่า คืออายุคำอธิบายตามเกณฑ์ที่ระบบใช้ ไม่ใช่หลักฐานว่าค่าภายในไฟล์เก่าหรือไม่ถูกต้อง</p>
            </section>
          </>}
    <section className={styles.method} id="od-method" aria-labelledby="od-method-title"><h2 id="od-method-title">นิยาม วิธีอ่านคะแนน และข้อจำกัด</h2>
      <ul><li>คะแนนความพร้อม = ค่าเฉลี่ยดาวเฉพาะชุดที่ประเมินได้ ÷ 5 × 100 ไม่รวมดาวที่ไม่ทราบ ถ้าทั้งหมดไม่ทราบจะไม่ให้คะแนนหรือจัดอันดับ ไม่ใช่การตรวจความโปร่งใสหรือการรับรอง 5-star Open Data</li>
        <li>ระดับ 1–3 ดาวเป็น proxy จากรูปแบบ ต้องมี isOpen และชื่อหรือรหัส license ใน metadata แต่ยังไม่ตรวจเงื่อนไขใช้ซ้ำจริง ไม่อนุมาน 4–5 ดาวจากชื่อไฟล์หรือ URL คะแนนจึงไม่จำเป็นต้องเต็ม 100</li>
        <li>เครื่องอ่านได้ไม่ได้หมายความว่าไฟล์เข้าถึงได้จริง ไม่มีข้อมูลส่วนบุคคล หรือ Hub มีสิทธิ์เผยแพร่ค่าภายใน</li>
        <li>metadata เก่า คือวันที่แก้คำอธิบายชุดข้อมูลเกิน 365 วัน ไม่ใช่วันที่ของค่าจริง ระบบซิงก์ยังไม่เก็บหลักฐานความถี่รายวัน/เดือน/ปี จึงแยกรอบที่ยืนยันไม่ได้เป็นไม่ทราบ เวลาประมวลผลไม่ใช่เวลาที่ต้นทางแก้ข้อมูล</li>
        <li>จำนวนและอันดับเปลี่ยนตามตัวกรอง หน่วยงานใน catalog ไม่ได้แทนหน่วยงานทั้งประเทศ ค่าไม่ทราบคงแยกจากศูนย์</li></ul>
      {ready && data && data.notes.length > 0 && <div className={styles.dataNotes}><h3>นิยามและหมายเหตุจากผลวิเคราะห์นี้</h3><ul>{data.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      <Link className={styles.textLink} href="/catalog">ตรวจที่มาและสิทธิ์รายชุดในบัญชีข้อมูล →</Link>
    </section>
  </div>;
}
