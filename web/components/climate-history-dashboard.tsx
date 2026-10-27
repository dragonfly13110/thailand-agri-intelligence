'use client';
import { useEffect, useState } from 'react';
import { Icon } from './icon';
import styles from './climate-history-dashboard.module.css';

/**
 * Climate-history dashboard for `/climate-history`. Types mirror the JSON
 * contract of `/api/v1/climate-history`; the client never imports the
 * server-only module (web/lib/hub/climate-history-data.ts). Sample payloads
 * are labelled in the UI so a pending source value can never be read as
 * published data. All charts are hand-drawn SVG (no external chart library).
 */

type ClimateRegion = 'north' | 'northeast' | 'central' | 'east' | 'south';

type ClimateYearStats = {
  year: number;
  tmeanC: number | null;
  tmaxMeanC: number | null;
  tminMeanC: number | null;
  hotDays38C: number;
  rainfallTotalMm: number | null;
  longestDrySpellDays: number;
  drySpellEvents5d: number;
};

type ClimateNotableYear = {
  year: number;
  reason: 'hottest' | 'driest' | 'wettest' | 'most_hot_days' | 'longest_dry_spell';
  labelTh: string;
  value: number;
  unit: '°C' | 'mm' | 'วัน';
  normalC: number | null;
  normalMm: number | null;
};

type ClimateHistoryOverviewBase = {
  location: {
    code: string;
    nameTh: string;
    nameEn: string;
    region: ClimateRegion;
    regionLabelTh: string;
    grid: { latitude: number; longitude: number; resolutionDeg: number; support: 'grid_point' };
  };
  startYear: number;
  endYear: number;
  yearsSpan: number;
  yearsWithData: number;
  source: {
    sourceId: string;
    providerModel: string;
    spatialSupport: string;
    gridResolutionDeg: number;
    gridNoteKm: number;
    attribution: string;
    attributionUrl: string;
    license: string;
    licenseStatus: string;
    archiveUrl: string;
  };
  units: Record<string, string>;
};

type ClimateHistoryOverview = ClimateHistoryOverviewBase & (
  | {
  dataKind: 'sample';
  sample: true;
  baseline: { tmeanNormalC: number; rainfallNormalMm: number; hotDaysNormal: number };
  years: ClimateYearStats[];
  trends: {
    tmeanPerDecadeC: number;
    tmaxPerDecadeC: number;
    hotDaysPerDecade: number;
    rainfallTrendMmPerDecade: number;
    firstFiveYearMeanC: number;
    lastFiveYearMeanC: number;
    warmingDeltaC: number;
  };
  notableYears: ClimateNotableYear[];
  }
  | {
  dataKind: 'empty';
  sample: false;
  baseline: { tmeanNormalC: null; rainfallNormalMm: null; hotDaysNormal: null };
  years: [];
  trends: {
    tmeanPerDecadeC: null;
    tmaxPerDecadeC: null;
    hotDaysPerDecade: null;
    rainfallTrendMmPerDecade: null;
    firstFiveYearMeanC: null;
    lastFiveYearMeanC: null;
    warmingDeltaC: null;
  };
  notableYears: [];
  }
);

type PopulatedClimateHistoryOverview = Extract<ClimateHistoryOverview, { dataKind: 'sample' }>;

type Envelope = {
  data: ClimateHistoryOverview;
  meta: { availability: string; access: string; warnings: string[] };
};

type YearRange = { id: string; label: string; startYear: number; endYear: number };

type State =
  | { kind: 'ready'; value: Envelope; key: string }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; key: string };

const YEAR_RANGES: YearRange[] = [
  { id: '2005-2024', label: '2005–2024 (20 ปี)', startYear: 2005, endYear: 2024 },
  { id: '2010-2024', label: '2010–2024 (15 ปี)', startYear: 2010, endYear: 2024 },
  { id: '2015-2024', label: '2015–2024 (10 ปี)', startYear: 2015, endYear: 2024 },
];

const DEFAULT_PROVINCE_CODE = '10';
const DEFAULT_RANGE_ID = '2005-2024';

function thaiYear(year: number) {
  return year + 543;
}

function fmtNum(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function fmtSigned(value: number, digits = 1) {
  const formatted = new Intl.NumberFormat('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(Math.abs(value));
  if (value > 0) return '+' + formatted;
  if (value < 0) return '-' + formatted;
  return formatted;
}

function fmtTick(value: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value);
}

function fmtGeo(value: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value);
}

/** Round a domain to friendly tick steps so gridlines never show raw floats. */
function niceTicks(rawMin: number, rawMax: number, targetCount = 4): number[] {
  let min = rawMin;
  let max = rawMax;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    min = Number.isFinite(min) ? min : 0;
    max = min + 1;
  }
  const rawStep = (max - min) / Math.max(2, targetCount);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10]
    .map((multiplier) => multiplier * magnitude)
    .find((candidate) => candidate >= rawStep) ?? 10 * magnitude;
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step / 2; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks.length >= 2 ? ticks : [first, first + step];
}

/** Fixed x labels so 10-20 bars never overlap, even scaled down on phones. */
function xTickYears(startYear: number, endYear: number): number[] {
  const count = endYear - startYear + 1;
  const step = count <= 8 ? 2 : count <= 12 ? 3 : 5;
  const ticks: number[] = [];
  for (let year = startYear; year <= endYear; year += step) ticks.push(year);
  const last = ticks[ticks.length - 1];
  if (last !== endYear && endYear - last >= 2) ticks.push(endYear);
  return ticks;
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { message?: string } }).error
      : undefined;
    throw new Error(error?.message || 'เชื่อมต่อข้อมูลประวัติภูมิอากาศไม่ได้ในขณะนี้');
  }
  return body as T;
}

export function ClimateHistoryDashboard({ provinces }: { provinces: Array<{ code: string; name: string }> }) {
  const [provinceCode, setProvinceCode] = useState(DEFAULT_PROVINCE_CODE);
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE_ID);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const range = YEAR_RANGES.find((row) => row.id === rangeId) ?? YEAR_RANGES[0];
  const query =
    'provinceCode=' + encodeURIComponent(provinceCode) +
    '&startYear=' + range.startYear +
    '&endYear=' + range.endYear;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/climate-history?' + query, { signal: controller.signal, headers: { accept: 'application/json' } })
      .then((response) => readJson<Envelope>(response))
      .then((value) => {
        if (
          !value?.data || !Array.isArray(value.data.years) || !value.data.baseline ||
          !value.data.trends || !value.data.location || !Array.isArray(value.meta?.warnings)
        ) {
          throw new Error('รูปแบบข้อมูลประวัติภูมิอากาศไม่ถูกต้อง');
        }
        setState({ kind: 'ready', value, key: query });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'เชื่อมต่อข้อมูลประวัติภูมิอากาศไม่ได้ในขณะนี้',
          key: query,
        });
      });
    return () => controller.abort();
  }, [query, attempt]);

  const visibleState: State = state.kind === 'loading' || state.key === query ? state : { kind: 'loading' };
  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((value) => value + 1);
  };

  return <div className={styles.dashboard}>
    <div className="data-filters" role="group" aria-label="เลือกจังหวัดและช่วงปีของประวัติภูมิอากาศ">
      <div>
        <label htmlFor="climate-province">เลือกจังหวัด</label>
        <select id="climate-province" value={provinceCode} onChange={(event) => setProvinceCode(event.target.value)}>
          {provinces.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="climate-range">เลือกช่วงปี (ค.ศ.)</label>
        <select id="climate-range" value={rangeId} onChange={(event) => setRangeId(event.target.value)}>
          {YEAR_RANGES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
      </div>
      <p className={styles.filterNote}>
        <Icon name="pin" size={16}/>แสดงได้ทั้ง {provinces.length} จังหวัดในทะเบียนอ้างอิง · ช่วงปีคงที่ตามที่กำหนด
      </p>
    </div>

    {visibleState.kind === 'loading' && <LoadingState/>}
    {visibleState.kind === 'error' && (
      <div className={styles.stateBlock} role="alert">
        <Icon name="info" size={30}/>
        <h2>เปิดข้อมูลประวัติภูมิอากาศไม่ได้</h2>
        <p>{visibleState.message}</p>
        <button type="button" className="button secondary" onClick={retry}>ลองอีกครั้ง</button>
      </div>
    )}
    {visibleState.kind === 'ready' && <OverviewView value={visibleState.value}/>}
  </div>;
}

function OverviewView({ value }: { value: Envelope }) {
  const { data, meta } = value;

  if (data.dataKind === 'empty') {
    return <div className={styles.stateBlock} role="status">
      <Icon name="info" size={30}/>
      <h2>ยังไม่มีข้อมูลภูมิอากาศย้อนหลังที่เพียงพอ</h2>
      <p>{meta.warnings.join(' ')}</p>
    </div>;
  }

  const { location, baseline, trends, years } = data;

  if (!years.length) {
    return <div className={styles.stateBlock} role="status">
      <Icon name="search" size={30}/>
      <h2>ยังไม่มีข้อมูลสำหรับพื้นที่หรือช่วงปีนี้</h2>
      <p>ไม่มีค่าจากแหล่งข้อมูลที่ใช้ได้ในช่วงปีที่เลือก</p>
    </div>;
  }

  return <>
    {meta.warnings.length > 0 && (
      <section className={styles.notice} aria-label="ข้อจำกัดของข้อมูลชุดนี้">
        <span className={styles.noticeIcon}><Icon name="info" size={18}/></span>
        <div>
          <strong>ข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ
            <span className={styles.sampleBadge}>ข้อมูลตัวอย่าง (sample)</span>
          </strong>
          <ul>{meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          <p className={styles.noticeSource}>
            <Icon name="external" size={14}/>
            {data.source.attribution} (<a href={data.source.attributionUrl} target="_blank" rel="noreferrer">open-meteo.com</a>)
            {' · '}สัญญาอนุญาต {data.source.license}
          </p>
        </div>
      </section>
    )}

    <section className={styles.headline} aria-label="ภาพรวมประวัติภูมิอากาศของจังหวัดที่เลือก">
      <div>
        <span className={styles.eyebrow}>{location.regionLabelTh} · รหัส {location.code}</span>
        <h2>ประวัติภูมิอากาศ {location.nameTh} ({location.nameEn}) ปี {data.startYear}–{data.endYear}</h2>
        <p>
          ค่าจุดกริด (grid_point) {fmtGeo(location.grid.latitude)}°N, {fmtGeo(location.grid.longitude)}°E
          {' · '}ความละเอียด {fmtGeo(location.grid.resolutionDeg)}° ≈ {data.source.gridNoteKm} กม.
          {' · '}มีข้อมูล {data.yearsWithData} จาก {data.yearsSpan} ปี
        </p>
      </div>
      <span className="badge pending"><Icon name="lock" size={13}/>รอตรวจสิทธิ์เผยแพร่</span>
    </section>

    <ul className={styles.statGrid} aria-label="ตัวเลขสรุปสภาพภูมิอากาศ">
      <li className={styles.statChip}>
        <span>อุ่นขึ้นแค่ไหน (เฉลี่ย 5 ปีท้าย vs 5 ปีแรก)</span>
        <strong>{fmtSigned(trends.warmingDeltaC)} °C</strong>
      </li>
      <li className={styles.statChip}>
        <span>แนวโน้มอุณหภูมิเฉลี่ยรายทศวรรษ</span>
        <strong>{fmtSigned(trends.tmeanPerDecadeC)} °C/ทศวรรษ</strong>
      </li>
      <li className={styles.statChip}>
        <span>วันร้อนจัด (Tmax สูงกว่า 38 °C) เฉลี่ยต่อปี</span>
        <strong>{fmtNum(baseline.hotDaysNormal, 0)} วัน</strong>
      </li>
      <li className={styles.statChip}>
        <span>ฝนสะสมเฉลี่ยต่อปี</span>
        <strong>{fmtNum(baseline.rainfallNormalMm, 0)} มม.</strong>
      </li>
    </ul>

    <div className={styles.panelGrid}>
      <section className={`${styles.panel} ${styles.panelWide}`} aria-label="กราฟแนวโน้มอุณหภูมิรายปี">
        <div className={styles.panelHeading}>
          <h3>อุณหภูมิเฉลี่ยรายปีและแนวโน้มความร้อน</h3>
          <p>
            เส้นประคือค่าเฉลี่ยปกติ {fmtNum(baseline.tmeanNormalC)} °C
            {' · '}แนวโน้มเชิงเส้น {fmtSigned(trends.tmeanPerDecadeC)} °C/ทศวรรษ
          </p>
        </div>
        <WarmingChart data={data}/>
      </section>

      <section className={styles.panel} aria-label="กราฟวันคลื่นความร้อนรายปี">
        <div className={styles.panelHeading}>
          <h3>วันคลื่นความร้อนรายปี (Tmax สูงกว่า 38 °C)</h3>
          <p>จำนวนวันที่อุณหภูมิสูงสุดรายวันเกิน 38 °C ในแต่ละปี</p>
        </div>
        <HotDaysChart data={data}/>
      </section>

      <section className={styles.panel} aria-label="กราฟฝนสะสมรายปี">
        <div className={styles.panelHeading}>
          <h3>ฝนสะสมรายปีเทียบค่าเฉลี่ยปกติ</h3>
          <p>แท่งสีต่างกันระหว่างปีที่ฝนต่ำกว่าและสูงกว่าค่าเฉลี่ยปกติ {fmtNum(baseline.rainfallNormalMm, 0)} มม.</p>
        </div>
        <RainfallChart data={data}/>
      </section>
    </div>

    <section className={styles.panel} aria-label="ตารางปีที่สภาพอากาศผิดปกติเด่น">
      <div className={styles.panelHeading}>
        <h3>ปีที่สภาพอากาศผิดปกติเด่นในช่วงนี้</h3>
        <p>สรุปปีที่ร้อนที่สุด แล้งที่สุด ฝนมากที่สุด และตัวชี้วัดสุดขั้วอื่น เทียบกับค่าเฉลี่ยปกติของพื้นที่</p>
      </div>
      <NotableTable rows={data.notableYears}/>
    </section>

    <p className={styles.sourceLine}>
      <Icon name="external" size={16}/>
      <span>
        ต้นทาง: {data.source.providerModel} · {data.source.spatialSupport}
        {' · '}{data.source.attribution} (<a href={data.source.attributionUrl} target="_blank" rel="noreferrer">open-meteo.com</a>)
        {' · '}สัญญาอนุญาต {data.source.license}
        {' · '}สถานะสิทธิ์: {data.source.licenseStatus === 'approved_public' ? 'อนุมัติเผยแพร่' : 'รอตรวจสิทธิ์'}
        {' · '}<a href={data.source.archiveUrl} target="_blank" rel="noreferrer">ชุดข้อมูลต้นทาง (archive)</a>
      </span>
    </p>
  </>;
}

function WarmingChart({ data }: { data: PopulatedClimateHistoryOverview }) {
  const width = 960;
  const height = 320;
  const pad = { left: 56, right: 20, top: 22, bottom: 46 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const years = data.years;
  const baseline = data.baseline.tmeanNormalC;
  const slopePerYear = data.trends.tmeanPerDecadeC / 10;
  const known = years.filter((row) => row.tmeanC !== null) as Array<ClimateYearStats & { tmeanC: number }>;

  if (!known.length) {
    return <p className={styles.chartNote}>ปีในช่วงนี้ยังไม่มีค่าอุณหภูมิเฉลี่ย จึงวาดกราฟไม่ได้ ค่าที่ขาดจะไม่ถูกนับเป็นศูนย์</p>;
  }

  const firstYear = years[0].year;
  const lastYear = years[years.length - 1].year;
  // Trend line anchored at the centroid of observed values (OLS through the mean point).
  const meanYear = known.reduce((sum, row) => sum + row.year, 0) / known.length;
  const meanTmean = known.reduce((sum, row) => sum + row.tmeanC, 0) / known.length;
  const trendAt = (year: number) => meanTmean + slopePerYear * (year - meanYear);

  const domainValues = [baseline, trendAt(firstYear), trendAt(lastYear), ...known.map((row) => row.tmeanC)];
  const ticks = niceTicks(Math.min(...domainValues) - 0.4, Math.max(...domainValues) + 0.4, 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const x = (year: number) => pad.left + (lastYear === firstYear ? innerWidth / 2 : ((year - firstYear) / (lastYear - firstYear)) * innerWidth);
  const y = (value: number) => pad.top + innerHeight * (1 - (value - lo) / (hi - lo));
  const xTicks = xTickYears(firstYear, lastYear);

  // Split the yearly line at missing years so gaps are never drawn as zero.
  const runs: string[][] = [];
  years.forEach((row) => {
    if (row.tmeanC === null) {
      if (runs.length && runs[runs.length - 1].length) runs.push([]);
      return;
    }
    if (!runs.length) runs.push([]);
    runs[runs.length - 1].push(x(row.year).toFixed(1) + ',' + y(row.tmeanC).toFixed(1));
  });
  const lineRuns = runs.filter((run) => run.length > 1).map((run) => run.join(' '));

  return <figure className={styles.chart}>
    <svg
      viewBox={'0 0 ' + width + ' ' + height}
      className={styles.chartSvg}
      role="img"
      aria-label={'กราฟเส้นอุณหภูมิเฉลี่ยรายปีของจังหวัด' + data.location.nameTh + ' ปี ' + data.startYear + ' ถึง ' + data.endYear + ' หน่วยองศาเซลเซียส'}
    >
      <title>อุณหภูมิเฉลี่ยรายปี {data.location.nameTh} ปี {data.startYear}–{data.endYear}</title>
      {ticks.map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className={styles.gridLine}/>
        <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" className={styles.axisLabel}>{fmtTick(tick)}</text>
      </g>)}
      <text x={pad.left - 10} y={pad.top - 8} textAnchor="end" className={styles.axisLabel}>°C</text>
      {xTicks.map((year) => <text
        key={year}
        x={x(year)}
        y={height - 12}
        textAnchor="middle"
        className={styles.axisLabel}
      >{year}</text>)}
      <line x1={pad.left} x2={width - pad.right} y1={y(lo)} y2={y(lo)} className={styles.axisLine}/>
      <line x1={pad.left} x2={width - pad.right} y1={y(baseline)} y2={y(baseline)} className={styles.normalLine}/>
      <line
        x1={x(firstYear)}
        x2={x(lastYear)}
        y1={y(trendAt(firstYear))}
        y2={y(trendAt(lastYear))}
        className={styles.trendLine}
      />
      {lineRuns.map((run, index) => <polyline key={index} points={run} className={styles.tempLine}/>)}
      {known.map((row) => <circle key={row.year} cx={x(row.year)} cy={y(row.tmeanC)} r="3.4" className={styles.point}>
        <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): ' + fmtNum(row.tmeanC) + ' °C'}</title>
      </circle>)}
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchTemp}/>อุณหภูมิเฉลี่ยรายปี</span>
      <span><i className={styles.swatchTrend}/>แนวโน้มเชิงเส้น</span>
      <span><i className={styles.swatchNormal}/>ค่าเฉลี่ยปกติ</span>
      <span>แกนนอนคือปี ค.ศ. · ปีที่ไม่มีค่าจะถูกเว้น ไม่นับเป็นศูนย์</span>
    </figcaption>
  </figure>;
}

function HotDaysChart({ data }: { data: PopulatedClimateHistoryOverview }) {
  const width = 460;
  const height = 270;
  const pad = { left: 46, right: 14, top: 18, bottom: 42 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const years = data.years;
  const count = Math.max(1, years.length);
  const baseline = data.baseline.hotDaysNormal;
  const peak = Math.max(1, baseline, ...years.map((row) => row.hotDays38C));
  const ticks = niceTicks(0, peak * 1.15, 3);
  const hi = Math.max(ticks[ticks.length - 1], peak);
  const band = innerWidth / count;
  const barWidth = Math.min(30, band * 0.62);
  const x = (index: number) => pad.left + band * (index + 0.5);
  const y = (value: number) => pad.top + innerHeight * (1 - value / hi);
  const firstYear = years.length ? years[0].year : data.startYear;
  const lastYear = years.length ? years[years.length - 1].year : data.endYear;
  const xTicks = xTickYears(firstYear, lastYear);
  const xByYear = (year: number) => x(Math.max(0, years.findIndex((row) => row.year === year)));

  return <figure className={styles.chart}>
    <svg
      viewBox={'0 0 ' + width + ' ' + height}
      className={styles.chartSvg}
      role="img"
      aria-label={'กราฟแท่งวันคลื่นความร้อนรายปี Tmax สูงกว่า 38 องศาเซลเซียส ของจังหวัด' + data.location.nameTh + ' ปี ' + data.startYear + ' ถึง ' + data.endYear + ' หน่วยวัน'}
    >
      <title>วันคลื่นความร้อนรายปี {data.location.nameTh}</title>
      {ticks.map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className={styles.gridLine}/>
        <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className={styles.axisLabel}>{fmtTick(tick)}</text>
      </g>)}
      <text x={pad.left - 8} y={pad.top - 6} textAnchor="end" className={styles.axisLabel}>วัน</text>
      {xTicks.map((year) => <text
        key={year}
        x={xByYear(year)}
        y={height - 10}
        textAnchor="middle"
        className={styles.axisLabel}
      >{year}</text>)}
      <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className={styles.axisLine}/>
      {baseline > 0 && <line x1={pad.left} x2={width - pad.right} y1={y(baseline)} y2={y(baseline)} className={styles.normalLine}/>}
      {years.map((row, index) => <rect
        key={row.year}
        x={x(index) - barWidth / 2}
        y={y(row.hotDays38C)}
        width={barWidth}
        height={Math.max(1, y(0) - y(row.hotDays38C))}
        rx="2"
        className={styles.hotBar}
      >
        <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): ' + row.hotDays38C + ' วัน'}</title>
      </rect>)}
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchHot}/>วัน Tmax สูงกว่า 38 °C</span>
      <span><i className={styles.swatchNormal}/>ค่าเฉลี่ยปกติ {fmtNum(baseline, 0)} วัน</span>
    </figcaption>
  </figure>;
}

function RainfallChart({ data }: { data: PopulatedClimateHistoryOverview }) {
  const width = 460;
  const height = 290;
  const pad = { left: 56, right: 14, top: 18, bottom: 42 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const years = data.years;
  const count = Math.max(1, years.length);
  const baseline = data.baseline.rainfallNormalMm;
  const knownYears = years.filter((row) => row.rainfallTotalMm !== null) as Array<ClimateYearStats & { rainfallTotalMm: number }>;
  const peak = Math.max(1, baseline, ...knownYears.map((row) => row.rainfallTotalMm));
  const ticks = niceTicks(0, peak * 1.15, 3);
  const hi = Math.max(ticks[ticks.length - 1], peak);
  const band = innerWidth / count;
  const barWidth = Math.min(28, band * 0.6);
  const x = (index: number) => pad.left + band * (index + 0.5);
  const y = (value: number) => pad.top + innerHeight * (1 - value / hi);
  const firstYear = years.length ? years[0].year : data.startYear;
  const lastYear = years.length ? years[years.length - 1].year : data.endYear;
  const xTicks = xTickYears(firstYear, lastYear);
  const xByYear = (year: number) => x(Math.max(0, years.findIndex((row) => row.year === year)));
  const driest = knownYears.reduce<(typeof knownYears)[number] | null>(
    (best, row) => (best === null || row.rainfallTotalMm < best.rainfallTotalMm ? row : best), null);
  const wettest = knownYears.reduce<(typeof knownYears)[number] | null>(
    (best, row) => (best === null || row.rainfallTotalMm > best.rainfallTotalMm ? row : best), null);

  return <figure className={styles.chart}>
    <svg
      viewBox={'0 0 ' + width + ' ' + height}
      className={styles.chartSvg}
      role="img"
      aria-label={'กราฟแท่งฝนสะสมรายปีของจังหวัด' + data.location.nameTh + ' ปี ' + data.startYear + ' ถึง ' + data.endYear + ' หน่วยมิลลิเมตร เทียบค่าเฉลี่ยปกติ'}
    >
      <title>ฝนสะสมรายปี {data.location.nameTh}</title>
      {ticks.map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className={styles.gridLine}/>
        <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className={styles.axisLabel}>{fmtTick(tick)}</text>
      </g>)}
      <text x={pad.left - 8} y={pad.top - 6} textAnchor="end" className={styles.axisLabel}>มม.</text>
      {xTicks.map((year) => <text
        key={year}
        x={xByYear(year)}
        y={height - 10}
        textAnchor="middle"
        className={styles.axisLabel}
      >{year}</text>)}
      <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className={styles.axisLine}/>
      <line x1={pad.left} x2={width - pad.right} y1={y(baseline)} y2={y(baseline)} className={styles.normalLine}/>
      {years.map((row, index) => {
        if (row.rainfallTotalMm === null) {
          return <rect
            key={row.year}
            x={x(index) - barWidth / 2}
            y={y(0) - 3}
            width={barWidth}
            height={3}
            className={styles.missingBar}
          >
            <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): ไม่มีข้อมูล'}</title>
          </rect>;
        }
        const extreme =
          driest !== null && driest.year === row.year ? ' · ฝนน้อยที่สุดในช่วงนี้'
            : wettest !== null && wettest.year === row.year ? ' · ฝนมากที่สุดในช่วงนี้' : '';
        return <rect
          key={row.year}
          x={x(index) - barWidth / 2}
          y={y(row.rainfallTotalMm)}
          width={barWidth}
          height={Math.max(1, y(0) - y(row.rainfallTotalMm))}
          rx="2"
          className={(row.rainfallTotalMm < baseline ? styles.rainBarBelow : styles.rainBarAbove)
            + (extreme ? ' ' + styles.extremeBar : '')}
        >
          <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): ' + fmtNum(row.rainfallTotalMm, 0) + ' มม.' + extreme}</title>
        </rect>;
      })}
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchRainAbove}/>ฝนสูงกว่าปกติ</span>
      <span><i className={styles.swatchRainBelow}/>ฝนต่ำกว่าปกติ</span>
      <span><i className={styles.swatchExtreme}/>ปีฝนสุด/แล้งสุดของช่วง</span>
      <span><i className={styles.swatchNormal}/>ค่าเฉลี่ยปกติ</span>
    </figcaption>
  </figure>;
}

function NotableTable({ rows }: { rows: ClimateNotableYear[] }) {
  if (!rows.length) {
    return <p className={styles.chartNote}>ยังไม่มีข้อมูลปีผิดปกติสำหรับช่วงปีนี้</p>;
  }
  return <div className={styles.tableScroll}>
    <table className={styles.notableTable}>
      <thead>
        <tr>
          <th scope="col">ปี</th>
          <th scope="col">ลักษณะที่เด่น</th>
          <th scope="col">ค่าที่วัดได้</th>
          <th scope="col">เทียบค่าเฉลี่ยปกติ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => <tr key={row.reason + '-' + row.year}>
          <th scope="row">{thaiYear(row.year)}<small>ค.ศ. {row.year}</small></th>
          <td>{row.labelTh}</td>
          <td className={styles.numeric}>{fmtNum(row.value, row.unit === '°C' ? 1 : 0)} {row.unit}</td>
          <td className={styles.numeric}>{normalLabel(row)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function normalLabel(row: ClimateNotableYear) {
  if (row.unit === '°C' && row.normalC !== null) {
    return 'ค่าปกติ ' + fmtNum(row.normalC) + ' °C · ต่าง ' + fmtSigned(row.value - row.normalC) + ' °C';
  }
  if (row.unit === 'mm' && row.normalMm !== null) {
    return 'ค่าปกติ ' + fmtNum(row.normalMm, 0) + ' มม. · ต่าง ' + fmtSigned(row.value - row.normalMm, 0) + ' มม.';
  }
  return '—';
}

function LoadingState() {
  return <div className={styles.stateBlock} aria-busy="true" role="status" aria-label="กำลังโหลดประวัติภูมิอากาศ">
    <div className={styles.skeletonRow}>
      {Array.from({ length: 4 }, (_, index) => <div className={`${styles.skeleton} ${styles.skeletonChip}`} key={index}/>)}
    </div>
    <div className={`${styles.skeleton} ${styles.skeletonChart}`}/>
    <p>กำลังโหลดประวัติภูมิอากาศย้อนหลัง…</p>
  </div>;
}
