'use client';
import { useEffect, useState } from 'react';
import { Icon } from './icon';
import styles from './climate-history-dashboard.module.css';

/**
 * Climate-history dashboard for `/climate-history`. Types mirror the JSON
 * contract of `/api/v1/climate-history`; the client never imports the
 * server-only module (web/lib/hub/climate-history-data.ts).
 *
 * Honesty rules mirrored from the API:
 * - `dataKind:'real'` numbers are ERA5 values read for exactly ONE 0.25° grid
 *   point; the UI always shows the point identity, the covered day range and
 *   the tier the values came from, so a single-cell series can never be read
 *   as provincial coverage.
 * - `dataKind:'sample'` (offline development only) keeps the sample banner.
 * - Missing values stay `—`/grey gaps; years without full-calendar coverage
 *   are never drawn as annual totals.
 * All charts are hand-drawn SVG (no external chart library).
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

type ClimateRealYearStats = {
  year: number;
  tmeanC: number | null;
  tmaxMeanC: number | null;
  tminMeanC: number | null;
  hotDays38C: number | null;
  rainfallTotalMm: number | null;
  longestDrySpellDays: number | null;
  drySpellEvents5d: number | null;
  calendarDays: number;
  daysWithData: {
    temperatureMean: number;
    temperatureMax: number;
    temperatureMin: number;
    precipitation: number;
  };
  completeYear: boolean;
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

type ClimateHistoryScope = {
  tier: 'd1_published_batch' | 'reviewed_cache_point';
  gridPoint: {
    areaLabelTh: string;
    requestedLatitude: number;
    requestedLongitude: number;
    providerGridLatitude: number | null;
    providerGridLongitude: number | null;
    resolutionDeg: number;
    support: 'grid_point';
  };
  yearsWithData: number;
  yearsMissing: number[];
  firstDayWithData: string | null;
  lastDayWithData: string | null;
  dailyRowsRead: number;
  rowsCapped: boolean;
  variablesPublished: string[];
  variablesNotPublishedHere: string[];
  grainNoteTh: string;
  rejectedCacheYears: { year: number; reason: string }[];
};

type ClimateHistoryProvenance = {
  sourceId: string;
  resourceId: string;
  license: string;
  attribution: string;
  attributionUrl: string;
  readThrough: 'd1_active_numeric_run' | 'reviewed_local_snapshot';
  runId: string | null;
  runStatus: string | null;
  runCount: number;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  cacheChecksums: string[];
  cacheRetrievedAtFirst: string | null;
  cacheRetrievedAtLast: string | null;
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
  | {
  dataKind: 'real';
  sample: false;
  baseline: { tmeanNormalC: number | null; tmaxNormalC: number | null; rainfallNormalMm: number | null; hotDaysNormal: number | null };
  years: ClimateRealYearStats[];
  trends: {
    tmeanPerDecadeC: number | null;
    tmaxPerDecadeC: number | null;
    hotDaysPerDecade: number | null;
    rainfallTrendMmPerDecade: number | null;
    firstFiveYearMeanC: number | null;
    lastFiveYearMeanC: number | null;
    warmingDeltaC: number | null;
  };
  notableYears: ClimateNotableYear[];
  dataAsOf: string | null;
  scope: ClimateHistoryScope;
  provenance: ClimateHistoryProvenance;
  }
);

/** Normalized chart input: sample and real rows both feed the same null-safe SVG code. */type ChartRow = {
  year: number;
  tmeanC: number | null;
  tmaxMeanC: number | null;
  hotDays38C: number | null;
  rainfallTotalMm: number | null;
  /** False for real years without full-calendar coverage: never drawn as annual values. */
  claimable: boolean;
};

type ChartSeries = {
  location: ClimateHistoryOverviewBase['location'];
  startYear: number;
  endYear: number;
  years: ChartRow[];
  baseline: { tmeanNormalC: number | null; rainfallNormalMm: number | null; hotDaysNormal: number | null };
  trends: { tmeanPerDecadeC: number | null; rainfallTrendMmPerDecade: number | null };
};

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
  { id: '2016-2025', label: '2016–2025 (10 ปี · จุด ERA5 ที่ตรวจสอบแล้ว)', startYear: 2016, endYear: 2025 },
  { id: '2017-2026', label: '2017–2026 (10 ปี)', startYear: 2017, endYear: 2026 },
  { id: '2005-2024', label: '2005–2024 (20 ปี)', startYear: 2005, endYear: 2024 },
  { id: '2010-2024', label: '2010–2024 (15 ปี)', startYear: 2010, endYear: 2024 },
  { id: '2015-2024', label: '2015–2024 (10 ปี)', startYear: 2015, endYear: 2024 },
];

const DEFAULT_PROVINCE_CODE = '73';
const DEFAULT_RANGE_ID = '2016-2025';

function thaiYear(year: number) {
  return year + 543;
}

function fmtNum(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function fmtSigned(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(Math.abs(value));
  if (value > 0) return '+' + formatted;
  if (value < 0) return '-' + formatted;
  return formatted;
}

function fmtTick(value: number) {
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value);
}

function fmtGeo(value: number | null) {
  if (value === null) return '—';
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
        <Icon name="pin" size={16}/>จังหวัดที่มีข้อมูลจริง ณ จุดกริดที่ตรวจสอบแล้ว: นครปฐม เชียงใหม่ ขอนแก่น อุบลราชธานี สุราษฎร์ธานี · จังหวัดอื่นแสดงสถานะตามข้อมูลที่เผยแพร่จริง
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

  const chartYears: ChartRow[] = data.dataKind === 'real'
    ? data.years.map((row) => ({
        year: row.year,
        tmeanC: row.tmeanC,
        tmaxMeanC: row.tmaxMeanC,
        hotDays38C: row.hotDays38C,
        rainfallTotalMm: row.rainfallTotalMm,
        // A real year may only be drawn as an annual value when its calendar
        // coverage is complete; partial batches become grey gap markers.
        claimable: row.completeYear,
      }))
    : data.years.map((row) => ({
        year: row.year,
        tmeanC: row.tmeanC,
        tmaxMeanC: row.tmaxMeanC,
        hotDays38C: row.hotDays38C,
        rainfallTotalMm: row.rainfallTotalMm,
        claimable: true,
      }));

  const series: ChartSeries = {
    location,
    startYear: data.startYear,
    endYear: data.endYear,
    years: chartYears,
    baseline: {
      tmeanNormalC: baseline.tmeanNormalC,
      rainfallNormalMm: baseline.rainfallNormalMm,
      hotDaysNormal: baseline.hotDaysNormal,
    },
    trends: {
      tmeanPerDecadeC: trends.tmeanPerDecadeC,
      rainfallTrendMmPerDecade: trends.rainfallTrendMmPerDecade,
    },
  };

  return <>
    {data.dataKind === 'sample' && meta.warnings.length > 0 && (
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

    {data.dataKind === 'real' && <RealDataNotice data={data} meta={meta}/>}

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
      {data.dataKind === 'real'
        ? <span className="badge neutral"><Icon name="info" size={13}/>ข้อมูลจริงอ่านแล้ว · {data.scope.tier === 'reviewed_cache_point' ? 'snapshot จุดที่ตรวจสอบแล้ว' : 'numeric run ที่เผยแพร่ใน D1'}</span>
        : <span className="badge pending"><Icon name="lock" size={13}/>รอตรวจสิทธิ์เผยแพร่</span>}
    </section>

    <ul className={styles.statGrid} aria-label="ตัวเลขสรุปสภาพภูมิอากาศ">
      <li className={styles.statChip}>
        <span>อุ่นขึ้นแค่ไหน (เฉลี่ย 5 ปีท้าย vs 5 ปีแรก · เฉพาะปีที่ครบปฏิทิน)</span>
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
        <WarmingChart series={series}/>
      </section>

      <section className={styles.panel} aria-label="กราฟวันคลื่นความร้อนรายปี">
        <div className={styles.panelHeading}>
          <h3>วันคลื่นความร้อนรายปี (Tmax สูงกว่า 38 °C)</h3>
          <p>จำนวนวันที่อุณหภูมิสูงสุดรายวันเกิน 38 °C ในแต่ละปี</p>
        </div>
        <HotDaysChart series={series}/>
      </section>

      <section className={styles.panel} aria-label="กราฟฝนสะสมรายปี">
        <div className={styles.panelHeading}>
          <h3>ฝนสะสมรายปีเทียบค่าเฉลี่ยปกติ</h3>
          <p>แท่งสีต่างกันระหว่างปีที่ฝนต่ำกว่าและสูงกว่าค่าเฉลี่ยปกติ {fmtNum(baseline.rainfallNormalMm, 0)} มม.</p>
        </div>
        <RainfallChart series={series}/>
      </section>
    </div>

    <section className={styles.panel} aria-label="ตารางปีที่สภาพอากาศผิดปกติเด่น">
      <div className={styles.panelHeading}>
        <h3>ปีที่สภาพอากาศผิดปกติเด่นในช่วงนี้</h3>
        <p>สรุปปีที่ร้อนที่สุด แล้งที่สุด ฝนมากที่สุด และตัวชี้วัดสุดขั้วอื่น เทียบกับค่าเฉลี่ยปกติของพื้นที่ (คำนวณจากปีที่ข้อมูลครบปฏิทินเท่านั้น)</p>
      </div>
      <NotableTable rows={data.notableYears}/>
    </section>

    {data.dataKind === 'real' && <ScopePanel data={data}/>}

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

function shortHash(value: string | null) {
  return value === null ? '—' : value.slice(0, 12) + '…';
}

function RealDataNotice({ data, meta }: { data: Extract<ClimateHistoryOverview, { dataKind: 'real' }>; meta: Envelope['meta'] }) {
  const { scope } = data;
  return <section className={styles.notice} aria-label="ที่มาและข้อจำกัดของข้อมูลจริงชุดนี้">
    <span className={styles.noticeIcon}><Icon name="info" size={18}/></span>
    <div>
      <strong>ข้อมูลจริงจาก ERA5 · จุดกริดเดียว ({scope.gridPoint.areaLabelTh})
        <span className={styles.sampleBadge}>ข้อมูลจริง (real · sample:false)</span>
      </strong>
      <ul>{meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      <p className={styles.noticeSource}>
        <Icon name="external" size={14}/>
        อ่านผ่าน: {scope.tier === 'reviewed_cache_point' ? 'snapshot รายจุดที่ตรวจสอบแล้วในเครื่อง (ingest Open-Meteo)' : 'numeric run ที่เผยแพร่ใน D1'}
        {' · '}ช่วงวันที่มีข้อมูลจริง: {data.scope.firstDayWithData ?? '—'} ถึง {data.scope.lastDayWithData ?? '—'}
        {' · '}{data.source.attribution} (<a href={data.source.attributionUrl} target="_blank" rel="noreferrer">open-meteo.com</a>)
        {' · '}สัญญาอนุญาต {data.source.license}
      </p>
    </div>
  </section>;
}

function ScopePanel({ data }: { data: Extract<ClimateHistoryOverview, { dataKind: 'real' }> }) {
  const { scope, provenance } = data;
  return <section className={styles.panel} aria-label="ขอบเขตจริงของข้อมูลที่อ่านมา">
    <div className={styles.panelHeading}>
      <h3>ขอบเขตข้อมูลที่อ่านมาจริง (scope)</h3>
      <p>{scope.grainNoteTh}</p>
    </div>
    <ul className={styles.statGrid} aria-label="รายละเอียดจุดกริดและช่วงเวลา">
      <li className={styles.statChip}>
        <span>จุดกริดที่ให้บริการ (ค่าจริงจาก provider)</span>
        <strong>{fmtGeo(scope.gridPoint.providerGridLatitude)}°N, {fmtGeo(scope.gridPoint.providerGridLongitude)}°E</strong>
      </li>
      <li className={styles.statChip}>
        <span>พิกัดที่ขอ (centroid จังหวัด)</span>
        <strong>{fmtGeo(scope.gridPoint.requestedLatitude)}°N, {fmtGeo(scope.gridPoint.requestedLongitude)}°E</strong>
      </li>
      <li className={styles.statChip}>
        <span>จำนวนวันอ่านจริง / ปีที่มีข้อมูล</span>
        <strong>{new Intl.NumberFormat('th-TH').format(scope.dailyRowsRead)} วัน · {scope.yearsWithData}/{data.yearsSpan} ปี{scope.rowsCapped ? ' (อ่านชนเพดาน)' : ''}</strong>
      </li>
      <li className={styles.statChip}>
        <span>ปีที่ไม่มีแถวข้อมูล (ไม่ถูกแทนด้วยค่าประมาณ)</span>
        <strong>{scope.yearsMissing.length ? scope.yearsMissing.join(', ') : 'ครบทุกปีที่เลือก'}</strong>
      </li>
      <li className={styles.statChip}>
        <span>ตัวแปรที่จุดนี้เผยแพร่จริง</span>
        <strong>{scope.variablesPublished.join(' · ') || '—'}</strong>
      </li>
      <li className={styles.statChip}>
        <span>ตัวแปรที่ไม่มีในจุดนี้ (เป็น null ถาวร)</span>
        <strong>{scope.variablesNotPublishedHere.join(' · ') || '—'}</strong>
      </li>
    </ul>
    <p className={styles.chartNote}>
      readThrough: {provenance.readThrough}
      {provenance.runId !== null && <> · run: {provenance.runId} ({provenance.runStatus ?? 'ไม่ทราบสถานะ'})</>}
      {provenance.payloadSha256 !== null && <> · payload sha256: {shortHash(provenance.payloadSha256)}</>}
      {provenance.cacheChecksums.length > 0 && <> · snapshot checksums {provenance.cacheChecksums.length} ปี เช่น {shortHash(provenance.cacheChecksums[0] ?? null)}</>}
      {' · '}source retrieved: {data.dataAsOf ?? '—'}
      {scope.rejectedCacheYears.length > 0 && <> · พาทิชันไม่ผ่านการตรวจสอบ: {scope.rejectedCacheYears.map((row) => row.year + ' (' + row.reason + ')').join('; ')}</>}
    </p>
    <p className={styles.chartNote}>
      ตารางปีรายค่า (daysWithData ต่อปี):{' '}
      {data.years.map((row) => row.year + ': ' + row.daysWithData.precipitation + '/' + row.daysWithData.temperatureMax + (row.completeYear ? ' ครบปี' : ' ไม่ครบปฏิทิน')).join(' · ')}
    </p>
  </section>;
}

function WarmingChart({ series }: { series: ChartSeries }) {
  const width = 960;
  const height = 320;
  const pad = { left: 56, right: 20, top: 22, bottom: 46 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const years = series.years;
  const baseline = series.baseline.tmeanNormalC;
  const slopePerYear = series.trends.tmeanPerDecadeC === null ? null : series.trends.tmeanPerDecadeC / 10;
  const known = years.filter((row) => row.tmeanC !== null && row.claimable) as Array<ChartRow & { tmeanC: number }>;

  if (!known.length) {
    return <p className={styles.chartNote}>ปีในช่วงนี้ยังไม่มีค่าอุณหภูมิเฉลี่ยจากปีที่ข้อมูลครบ จึงวาดกราฟไม่ได้ ค่าที่ขาดจะไม่ถูกนับเป็นศูนย์</p>;
  }

  const firstYear = years[0].year;
  const lastYear = years[years.length - 1].year;
  // Trend line anchored at the centroid of observed values (OLS through the mean point).
  const meanYear = known.reduce((sum, row) => sum + row.year, 0) / known.length;
  const meanTmean = known.reduce((sum, row) => sum + row.tmeanC, 0) / known.length;
  const trendAt = (year: number) => meanTmean + (slopePerYear ?? 0) * (year - meanYear);

  const domainValues = [baseline, ...(slopePerYear === null ? [] : [trendAt(firstYear), trendAt(lastYear)]), ...known.map((row) => row.tmeanC)]
    .filter((value): value is number => value !== null);
  const ticks = niceTicks(Math.min(...domainValues) - 0.4, Math.max(...domainValues) + 0.4, 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const x = (year: number) => pad.left + (lastYear === firstYear ? innerWidth / 2 : ((year - firstYear) / (lastYear - firstYear)) * innerWidth);
  const y = (value: number) => pad.top + innerHeight * (1 - (value - lo) / (hi - lo));
  const xTicks = xTickYears(firstYear, lastYear);

  // Split the yearly line at missing or non-claimable years so gaps are never drawn as zero.
  const runs: string[][] = [];
  years.forEach((row) => {
    if (row.tmeanC === null || !row.claimable) {
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
      aria-label={'กราฟเส้นอุณหภูมิเฉลี่ยรายปีของจังหวัด' + series.location.nameTh + ' ปี ' + series.startYear + ' ถึง ' + series.endYear + ' หน่วยองศาเซลเซียส'}
    >
      <title>อุณหภูมิเฉลี่ยรายปี {series.location.nameTh} ปี {series.startYear}–{series.endYear}</title>
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
      {baseline !== null && <line x1={pad.left} x2={width - pad.right} y1={y(baseline)} y2={y(baseline)} className={styles.normalLine}/>}
      {slopePerYear !== null && <line
        x1={x(firstYear)}
        x2={x(lastYear)}
        y1={y(trendAt(firstYear))}
        y2={y(trendAt(lastYear))}
        className={styles.trendLine}
      />}
      {lineRuns.map((run, index) => <polyline key={index} points={run} className={styles.tempLine}/>)}
      {known.map((row) => <circle key={row.year} cx={x(row.year)} cy={y(row.tmeanC)} r="3.4" className={styles.point}>
        <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): ' + fmtNum(row.tmeanC) + ' °C'}</title>
      </circle>)}
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchTemp}/>อุณหภูมิเฉลี่ยรายปี</span>
      <span><i className={styles.swatchTrend}/>แนวโน้มเชิงเส้น</span>
      <span><i className={styles.swatchNormal}/>ค่าเฉลี่ยปกติ</span>
      <span>แกนนอนคือปี ค.ศ. · ปีที่ไม่มีค่าหรือข้อมูลไม่ครบปฏิทินจะถูกเว้น ไม่นับเป็นศูนย์</span>
    </figcaption>
  </figure>;
}

function HotDaysChart({ series }: { series: ChartSeries }) {
  const width = 460;
  const height = 270;
  const pad = { left: 46, right: 14, top: 18, bottom: 42 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const years = series.years;
  const count = Math.max(1, years.length);
  const baseline = series.baseline.hotDaysNormal;
  const claimableValues = years.filter((row) => row.hotDays38C !== null && row.claimable).map((row) => row.hotDays38C as number);
  const peak = Math.max(1, baseline ?? 0, ...claimableValues);
  const ticks = niceTicks(0, peak * 1.15, 3);
  const hi = Math.max(ticks[ticks.length - 1], peak);
  const band = innerWidth / count;
  const barWidth = Math.min(30, band * 0.62);
  const x = (index: number) => pad.left + band * (index + 0.5);
  const y = (value: number) => pad.top + innerHeight * (1 - value / hi);
  const firstYear = years.length ? years[0].year : series.startYear;
  const lastYear = years.length ? years[years.length - 1].year : series.endYear;
  const xTicks = xTickYears(firstYear, lastYear);
  const xByYear = (year: number) => x(Math.max(0, years.findIndex((row) => row.year === year)));

  return <figure className={styles.chart}>
    <svg
      viewBox={'0 0 ' + width + ' ' + height}
      className={styles.chartSvg}
      role="img"
      aria-label={'กราฟแท่งวันคลื่นความร้อนรายปี Tmax สูงกว่า 38 องศาเซลเซียส ของจังหวัด' + series.location.nameTh + ' ปี ' + series.startYear + ' ถึง ' + series.endYear + ' หน่วยวัน'}
    >
      <title>วันคลื่นความร้อนรายปี {series.location.nameTh}</title>
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
      {baseline !== null && baseline > 0 && <line x1={pad.left} x2={width - pad.right} y1={y(baseline)} y2={y(baseline)} className={styles.normalLine}/>}
      {years.map((row, index) => {
        if (row.hotDays38C === null || !row.claimable) {
          return <rect
            key={row.year}
            x={x(index) - barWidth / 2}
            y={y(0) - 3}
            width={barWidth}
            height={3}
            className={styles.missingBar}
          >
            <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): '
              + (row.hotDays38C === null ? 'ไม่มีค่า Tmax ที่บันทึก' : 'ข้อมูลไม่ครบปฏิทินปี (นับได้ ' + row.hotDays38C + ' วันจากวันที่มีค่า) — ไม่วาดเป็นแท่งรายปี')}</title>
          </rect>;
        }
        return <rect
          key={row.year}
          x={x(index) - barWidth / 2}
          y={y(row.hotDays38C)}
          width={barWidth}
          height={Math.max(1, y(0) - y(row.hotDays38C))}
          rx="2"
          className={styles.hotBar}
        >
          <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): ' + row.hotDays38C + ' วัน'}</title>
        </rect>;
      })}
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.swatchHot}/>วัน Tmax สูงกว่า 38 °C</span>
      <span><i className={styles.swatchNormal}/>ค่าเฉลี่ยปกติ {fmtNum(baseline, 0)} วัน</span>
    </figcaption>
  </figure>;
}

function RainfallChart({ series }: { series: ChartSeries }) {
  const width = 460;
  const height = 290;
  const pad = { left: 56, right: 14, top: 18, bottom: 42 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const years = series.years;
  const count = Math.max(1, years.length);
  const baseline = series.baseline.rainfallNormalMm;
  const knownYears = years.filter((row) => row.rainfallTotalMm !== null && row.claimable) as Array<ChartRow & { rainfallTotalMm: number }>;
  const peak = Math.max(1, baseline ?? 0, ...knownYears.map((row) => row.rainfallTotalMm));
  const ticks = niceTicks(0, peak * 1.15, 3);
  const hi = Math.max(ticks[ticks.length - 1], peak);
  const band = innerWidth / count;
  const barWidth = Math.min(28, band * 0.6);
  const x = (index: number) => pad.left + band * (index + 0.5);
  const y = (value: number) => pad.top + innerHeight * (1 - value / hi);
  const firstYear = years.length ? years[0].year : series.startYear;
  const lastYear = years.length ? years[years.length - 1].year : series.endYear;
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
      aria-label={'กราฟแท่งฝนสะสมรายปีของจังหวัด' + series.location.nameTh + ' ปี ' + series.startYear + ' ถึง ' + series.endYear + ' หน่วยมิลลิเมตร เทียบค่าเฉลี่ยปกติ'}
    >
      <title>ฝนสะสมรายปี {series.location.nameTh}</title>
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
      {baseline !== null && <line x1={pad.left} x2={width - pad.right} y1={y(baseline)} y2={y(baseline)} className={styles.normalLine}/>}
      {years.map((row, index) => {
        if (row.rainfallTotalMm === null || !row.claimable) {
          return <rect
            key={row.year}
            x={x(index) - barWidth / 2}
            y={y(0) - 3}
            width={barWidth}
            height={3}
            className={styles.missingBar}
          >
            <title>{'ปี ' + thaiYear(row.year) + ' (ค.ศ. ' + row.year + '): '
              + (row.rainfallTotalMm === null ? 'ไม่มีข้อมูลฝนที่บันทึก' : 'รวมฝน ' + row.rainfallTotalMm + ' มม. จากเฉพาะวันที่มีข้อมูล (ไม่ครบปฏิทินปี) — ไม่วาดเป็นแท่งรายปี')}</title>
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
          className={((baseline === null || row.rainfallTotalMm >= baseline) ? styles.rainBarAbove : styles.rainBarBelow)
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
    return <p className={styles.chartNote}>ยังไม่มีข้อมูลปีผิดปกติสำหรับช่วงปีนี้ (ต้องมีปีที่ข้อมูลครบปฏิทินอย่างน้อยหนึ่งปี)</p>;
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
