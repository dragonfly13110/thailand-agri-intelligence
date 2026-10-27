'use client';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './icon';
import styles from './weather-dashboard.module.css';

/**
 * Weather dashboard for `/weather`. Types mirror the JSON contract of
 * `/api/v1/weather` (see web/lib/hub/weather-data.ts); the client never
 * imports that server-only module. Sample payloads are labelled in the UI so a
 * pending source value can never be read as published data.
 */

type RegionKey = 'north' | 'northeast' | 'central' | 'east' | 'south';
type RegionOption = { key: RegionKey; label: string };
type ProvinceOption = { code: string; name: string; region: RegionKey; regionLabel: string };
type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'shower' | 'heavy_rain' | 'thunderstorm';
type AdvisorySeverity = 'high' | 'medium' | 'low';

type ForecastDay = {
  date: string;
  weekdayTh: string;
  dateLabelTh: string;
  conditionCode: WeatherCondition;
  conditionLabelTh: string;
  rainChancePercent: number | null;
  rainfallMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
  humidityMinPercent: number | null;
  humidityMaxPercent: number | null;
  windDirectionDeg: number | null;
  windDirectionLabelTh: string | null;
  windSpeedMs: number | null;
  sample: boolean;
};

type ChartPoint = {
  date: string;
  rainfallMm: number | null;
  normalMm: number;
  forecastCumulativeMm: number | null;
  normalCumulativeMm: number;
};

type Cumulative = {
  windowDays: number;
  daysWithData: number;
  missingDays: number;
  forecastTotalMm: number | null;
  normalTotalMm: number;
  anomalyMm: number | null;
  anomalyPercent: number | null;
  status: 'below_normal' | 'normal' | 'above_normal' | 'unknown';
  completeness: 'complete' | 'partial';
  dryDays: number;
  heavyRainDays: number;
  byDay: ChartPoint[];
  calculationVersion: string;
};

type Advisory = { code: string; severity: AdvisorySeverity; titleTh: string; messageTh: string; actions: string[] };

type Overview = {
  location: { kind: 'province' | 'region'; code: string; name: string; region: RegionKey; regionLabel: string };
  issuedAt: string | null;
  dataKind: string;
  sample: boolean;
  source: { agency: string; sourceUrl: string; licenseStatus: string };
  units: Record<string, string>;
  days: ForecastDay[];
  cumulative: Cumulative | null;
  advisories: Advisory[];
};

type Envelope = {
  data: Overview;
  meta: { warnings: string[]; access: string; freshness: string; dataAsOf: string | null; retrievedAt: string | null };
};

type State =
  | { kind: 'ready'; value: Envelope; key: string }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; key: string };

const STATUS_LABEL: Record<Cumulative['status'], string> = {
  below_normal: 'ต่ำกว่าค่าเฉลี่ยปกติ',
  normal: 'ใกล้เคียงค่าเฉลี่ยปกติ',
  above_normal: 'สูงกว่าค่าเฉลี่ยปกติ',
  unknown: 'ยังประเมินไม่ได้',
};

const STATUS_TONE: Record<Cumulative['status'], string> = {
  below_normal: 'bad',
  normal: 'ok',
  above_normal: 'high',
  unknown: 'muted',
};

function numberLabel(value: number | null, digits = 1) {
  if (value === null) return 'ไม่ทราบ';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: digits }).format(value);
}

function dateLabel(iso: string | null) {
  if (!iso) return 'ยังไม่ระบุ';
  if (!iso || Number.isNaN(Date.parse(iso + 'T00:00:00+07:00'))) return iso || 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })
    .format(new Date(iso + 'T00:00:00+07:00'));
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { message?: string } }).error
      : undefined;
    throw new Error(error?.message || 'เชื่อมต่อข้อมูลพยากรณ์ไม่ได้ในขณะนี้');
  }
  return body as T;
}

export function WeatherDashboard({ regions, provinces }: { regions: RegionOption[]; provinces: ProvinceOption[] }) {
  const defaultRegion = regions.find((row) => row.key === 'central')?.key ?? regions[0]?.key ?? 'central';
  const [region, setRegion] = useState<RegionKey>(defaultRegion);
  const [provinceCode, setProvinceCode] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const provincesInRegion = useMemo(
    () => provinces.filter((row) => row.region === region),
    [provinces, region],
  );
  const query = provinceCode ? 'provinceCode=' + encodeURIComponent(provinceCode) : 'region=' + region;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/weather?' + query, { signal: controller.signal, headers: { accept: 'application/json' } })
      .then((response) => readJson<Envelope>(response))
      .then((value) => {
        if (!value.data || !Array.isArray(value.data.days) || !Array.isArray(value.meta?.warnings)) {
          throw new Error('รูปแบบข้อมูลพยากรณ์ไม่ถูกต้อง');
        }
        setState({ kind: 'ready', value, key: query });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'เชื่อมต่อข้อมูลพยากรณ์ไม่ได้ในขณะนี้',
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
    <div className="data-filters" role="group" aria-label="เลือกพื้นที่แสดงพยากรณ์">
      <div>
        <label htmlFor="weather-region">เลือกภาค</label>
        <select
          id="weather-region"
          value={region}
          onChange={(event) => {
            setRegion(event.target.value as RegionKey);
            setProvinceCode('');
          }}
        >
          {regions.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="weather-province">เลือกจังหวัด</label>
        <select id="weather-province" value={provinceCode} onChange={(event) => setProvinceCode(event.target.value)}>
          <option value="">ภาพรวมทั้งภาค</option>
          {provincesInRegion.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
        </select>
      </div>
      <p className={styles.filterNote}>
        <Icon name="pin" size={16}/>ในภาคนี้มี {provincesInRegion.length} จังหวัดในทะเบียนอ้างอิง
      </p>
    </div>

    {visibleState.kind === 'loading' && <LoadingState/>}
    {visibleState.kind === 'error' && (
      <div className={styles.stateBlock} role="alert">
        <Icon name="info" size={30}/>
        <h2>เปิดข้อมูลพยากรณ์ไม่ได้</h2>
        <p>{visibleState.message}</p>
        <button type="button" className="button secondary" onClick={retry}>ลองอีกครั้ง</button>
      </div>
    )}
    {visibleState.kind === 'ready' && <ForecastView value={visibleState.value}/>}
  </div>;
}

function ForecastView({ value }: { value: Envelope }) {
  const { data, meta } = value;
  const { days, cumulative, advisories, location } = data;

  if (!days.length || !cumulative) {
    return <div className={styles.stateBlock} role="status">
      <Icon name="search" size={30}/>
      <h2>ยังไม่มีพยากรณ์ที่เผยแพร่ได้สำหรับพื้นที่นี้</h2>
      <p>ยังไม่มีข้อมูลจากแหล่งพยากรณ์ที่อนุมัติให้เผยแพร่ ลองดูข้อมูล TMD HPC แยกที่ <a href="/nwp">หน้าพยากรณ์ TMD HPC</a></p>
      {meta.warnings.length > 0 && <ul>{meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    </div>;
  }

  return <>
    {meta.warnings.length > 0 && (
      <section className={styles.notice} aria-label="ข้อจำกัดของข้อมูลชุดนี้">
        <span className={styles.noticeIcon}><Icon name="info" size={18}/></span>
        <div>
          <strong>ข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ</strong>
          <ul>{meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      </section>
    )}

    <section className={styles.headline} aria-label="สรุปพยากรณ์">
      <div>
        <span className={styles.eyebrow}>{location.regionLabel}</span>
        <h2>พยากรณ์อากาศ {location.name} ล่วงหน้า {days.length} วัน</h2>
        <p>ออกพยากรณ์วันที่ {dateLabel(data.issuedAt)} · คำนวณโดย {data.source.agency}</p>
      </div>
      <span className="badge pending"><Icon name="lock" size={13}/>รอตรวจสิทธิ์เผยแพร่</span>
    </section>

    <AlertList advisories={advisories}/>

    <ul className={styles.dayGrid} aria-label="การ์ดพยากรณ์รายวัน">
      {days.map((day) => <li className={styles.dayCard} key={day.date}>
        <div className={styles.dayName}>{day.weekdayTh}<span>{day.dateLabelTh}</span></div>
        <span className={styles.dayIcon}><ConditionGlyph condition={day.conditionCode}/></span>
        <p className={styles.condition}>{day.conditionLabelTh}</p>
        <p className={styles.temp}>
          <strong>{numberLabel(day.tmaxC, 0)}°</strong><span>/ {numberLabel(day.tminC, 0)}°</span>
        </p>
        <dl className={styles.dayFacts}>
          <div><dt><DropletGlyph/>โอกาสฝนตก</dt><dd>{numberLabel(day.rainChancePercent, 0)}%</dd></div>
          <div><dt>ฝนที่คาด</dt><dd>{numberLabel(day.rainfallMm)} มม.</dd></div>
          <div><dt>ความชื้น</dt><dd>{numberLabel(day.humidityMinPercent, 0)}–{numberLabel(day.humidityMaxPercent, 0)}%</dd></div>
          <div><dt>ลม</dt><dd>{day.windDirectionLabelTh ?? 'ไม่ทราบ'} {numberLabel(day.windSpeedMs)} ม./วิ.</dd></div>
        </dl>
      </li>)}
    </ul>

    <section className={styles.indexPanel} aria-label="ดัชนีฝนสะสม">
      <div className={styles.indexHeading}>
        <div>
          <h3>แนวโน้มปริมาณน้ำฝนสะสมเทียบค่าเฉลี่ยปกติ</h3>
          <p>คำนวณจากฝนสะสม {cumulative.windowDays} วันของพยากรณ์เทียบค่าเฉลี่ยปกติในช่วงเวลาเดียวกัน</p>
        </div>
        <span className={`${styles.statusChip} ${styles[STATUS_TONE[cumulative.status]]}`}>
          {STATUS_LABEL[cumulative.status]}
        </span>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}><span>ฝนสะสมพยากรณ์</span><strong>{numberLabel(cumulative.forecastTotalMm)} มม.</strong></div>
        <div className={styles.stat}><span>ค่าเฉลี่ยปกติ</span><strong>{numberLabel(cumulative.normalTotalMm)} มม.</strong></div>
        <div className={styles.stat}><span>ส่วนต่างจากปกติ</span>
          <strong>{cumulative.anomalyPercent === null ? 'ไม่ทราบ' : (cumulative.anomalyPercent > 0 ? '+' : '') + numberLabel(cumulative.anomalyPercent) + '%'}</strong>
        </div>
        <div className={styles.stat}><span>วันฝนตกหนัก / วันแห้ง</span><strong>{cumulative.heavyRainDays} / {cumulative.dryDays} วัน</strong></div>
      </div>

      <RainfallChart points={cumulative.byDay} locationName={location.name}/>

      <p className={styles.chartNote}>
        เส้นทึบคือฝนสะสมตามพยากรณ์ เส้นประคือค่าเฉลี่ยปกติ · วันที่ไม่มีค่าจะถูกเว้นเป็นจุดขาด ไม่นับเป็นศูนย์
        {cumulative.completeness === 'partial' && ' · ชุดนี้มีค่าไม่ครบ จึงยังเป็นข้อมูลบางส่วน'}
      </p>
    </section>

    <p className={styles.sourceLine}>
      <Icon name="external" size={16}/>
      แหล่งข้อมูลต้นทาง: <a href={data.source.sourceUrl} target="_blank" rel="noreferrer">{data.source.agency}</a>
      {' · '}สถานะสิทธิ์: {data.source.licenseStatus === 'approved_public' ? 'อนุมัติแล้ว' : 'รอตรวจสิทธิ์'}
      {' · '}วันข้อมูล {dateLabel(meta.dataAsOf ?? data.issuedAt)}
      {meta.retrievedAt && <> · ดึงข้อมูลเมื่อ {dateLabel(meta.retrievedAt.slice(0, 10))}</>}
    </p>
  </>;
}

function AlertList({ advisories }: { advisories: Advisory[] }) {
  if (!advisories.length) {
    return <p className={styles.allClear} role="status">
      <Icon name="leaf" size={17}/>สัปดาห์นี้ไม่มีคำเตือนเฉพาะสำหรับพื้นที่ที่เลือก ยังคงควรตรวจสอบประกาศเตือนภัยฉบับจริงก่อนทำงานในแปลง
    </p>;
  }
  return <section className={styles.alerts} aria-label="แถบเตือนภัยสภาพอากาศเพื่อการเกษตร">
    {advisories.map((advisory) => (
      <article
        className={`${styles.alert} ${styles['alert-' + advisory.severity]}`}
        key={advisory.code}
        role={advisory.severity === 'high' ? 'alert' : 'status'}
      >
        <span className={styles.alertBadge}>{advisory.severity === 'high' ? 'เตือนภัย' : advisory.severity === 'medium' ? 'ระวัง' : 'ทราบไว้'}</span>
        <div>
          <h3>{advisory.titleTh}</h3>
          <p>{advisory.messageTh}</p>
          <ul>{advisory.actions.map((action) => <li key={action}>{action}</li>)}</ul>
        </div>
      </article>
    ))}
  </section>;
}

function RainfallChart({ points, locationName }: { points: ChartPoint[]; locationName: string }) {
  const width = 680;
  const height = 300;
  const pad = { left: 58, right: 18, top: 22, bottom: 54 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const peak = Math.max(10, ...points.map((point) => Math.max(point.forecastCumulativeMm ?? 0, point.normalCumulativeMm)));
  const axisMax = Math.max(10, Math.ceil(peak * 1.1 / 10) * 10);
  const count = points.length;
  const x = (index: number) => pad.left + (count === 1 ? innerWidth / 2 : index * innerWidth / (count - 1));
  const y = (value: number) => pad.top + innerHeight * (1 - value / axisMax);
  const ticks = [0, axisMax / 2, axisMax];

  const segments = (pick: (point: ChartPoint) => number | null) => {
    const runs: string[][] = [];
    points.forEach((point, index) => {
      const value = pick(point);
      if (value === null) {
        if (runs.length && runs[runs.length - 1].length) runs.push([]);
        return;
      }
      if (!runs.length) runs.push([]);
      runs[runs.length - 1].push(x(index).toFixed(1) + ',' + y(value).toFixed(1));
    });
    return runs.filter((run) => run.length > 1).map((run) => run.join(' '));
  };
  const forecastRuns = segments((point) => point.forecastCumulativeMm);
  const normalRun = segments((point) => point.normalCumulativeMm)[0] ?? '';

  return <figure className={styles.chart}>
    <svg
      viewBox={'0 0 ' + width + ' ' + height}
      className={styles.chartSvg}
      role="img"
      aria-label={'กราฟฝนสะสม 7 วันของ ' + locationName + ' เทียบค่าเฉลี่ยปกติ หน่วยมิลลิเมตร'}
    >
      {ticks.map((tick) => <g key={tick}>
        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className={styles.gridLine}/>
        <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" className={styles.axisLabel}>{numberLabel(tick, 0)}</text>
      </g>)}
      <text x={pad.left - 10} y={pad.top - 8} textAnchor="end" className={styles.axisLabel}>มม.</text>

      {normalRun && <polyline points={normalRun} className={styles.normalLine}/>}
      {forecastRuns.map((run, index) => <polyline key={index} points={run} className={styles.forecastLine}/>)}
      {points.map((point, index) => point.forecastCumulativeMm === null ? null : (
        <circle key={point.date} cx={x(index)} cy={y(point.forecastCumulativeMm)} r="3.5" className={styles.point}/>
      ))}

      {points.map((point, index) => <text
        key={point.date}
        x={x(index)}
        y={height - 26}
        textAnchor="middle"
        className={styles.axisLabel}
      >{new Date(point.date + 'T00:00:00+07:00').toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' })}</text>)}
      {points.map((point, index) => <text key={point.date + '-v'} x={x(index)} y={height - 8} textAnchor="middle" className={styles.axisSub}>
        {point.rainfallMm === null ? 'ไม่ทราบ' : numberLabel(point.rainfallMm, 0) + ' มม.'}
      </text>)}
      <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className={styles.axisLine}/>
    </svg>
    <figcaption className={styles.legend}>
      <span><i className={styles.legendForecast}/>ฝนสะสมตามพยากรณ์</span>
      <span><i className={styles.legendNormal}/>ค่าเฉลี่ยปกติ</span>
      <span>แถวล่างใต้กราฟคือฝนรายวันที่คาดไว้</span>
    </figcaption>
  </figure>;
}

function LoadingState() {
  return <div className={styles.stateBlock} aria-busy="true" role="status" aria-label="กำลังโหลดพยากรณ์อากาศ">
    <div className={styles.dayGrid}>
      {Array.from({ length: 7 }, (_, index) => <div className={`${styles.dayCard} ${styles.skeleton}`} key={index}/>)}
    </div>
    <p>กำลังโหลดพยากรณ์อากาศ…</p>
  </div>;
}

function ConditionGlyph({ condition }: { condition: WeatherCondition }) {
  const shared = {
    width: 34, height: 34, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
  };
  const cloud = <path d="M6.5 18h9a3.4 3.4 0 0 0 .3-6.8 4.9 4.9 0 0 0-9.4-1.1A3.6 3.6 0 0 0 6.5 18Z"/>;
  switch (condition) {
    case 'sunny':
      return <svg {...shared}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>;
    case 'partly_cloudy':
      return <svg {...shared}><circle cx="8.5" cy="7.5" r="3"/><path d="M8.5 2v1.4M3 7.5h1.4M4.6 3.6l1 1M12.4 3.6l-1 1"/>{cloud}</svg>;
    case 'cloudy':
      return <svg {...shared}>{cloud}<path d="M8 7.2A4 4 0 0 1 14 5.5"/></svg>;
    case 'shower':
      return <svg {...shared}>{cloud}<path d="M9 19.5l-.7 1.8M13.5 19.5l-.7 1.8"/></svg>;
    case 'heavy_rain':
      return <svg {...shared}>{cloud}<path d="M8.4 19.5l-.8 2M11.6 19.5l-.8 2M14.8 19.5l-.8 2"/></svg>;
    case 'thunderstorm':
      return <svg {...shared}>{cloud}<path d="M12.8 18.4l-2.4 3h3l-1.8 2.6"/></svg>;
  }
}

function DropletGlyph() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 3C9 7.5 6 10.8 6 14a6 6 0 0 0 12 0c0-3.2-3-6.5-6-11Z"/>
  </svg>;
}
