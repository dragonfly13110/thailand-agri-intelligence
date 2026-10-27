'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icon';
import styles from './province-agri-overview.module.css';

/**
 * Province agricultural overview for `/areas/[provinceCode]`.
 *
 * Everything shown is read live from the hub API v1 in the browser:
 * - `GET /api/v1/weather?provinceCode=…` (forecast 7 days, cumulative rainfall, advisories)
 * - `GET /api/v1/water/reservoirs` (RID medium-reservoir summary + region/risk lists)
 *
 * The client never imports the server-only data modules; types below mirror the
 * JSON contract of those routes like `weather-dashboard.tsx` does. While the TMD
 * resource licence is pending the weather API returns deterministic sample
 * values flagged `sample: true` plus `meta.warnings`; those warnings are always
 * rendered so a pending value can never be mistaken for published data. Water
 * numbers are region-level (`medium_reservoirs_daily`): the province is mapped
 * onto an RID region through the weather payload's `location.regionLabel` and
 * the card repeats that a region row is never province-level coverage.
 */

/* ---------------------- client-side type mirrors ---------------------- */

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
};

type CumulativeRainfall = {
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
};

type Advisory = {
  code: string;
  severity: AdvisorySeverity;
  titleTh: string;
  messageTh: string;
  actions: string[];
};

type WeatherPayload = {
  location: { kind: string; code: string; name: string; region: string; regionLabel: string };
  issuedAt: string | null;
  sample: boolean;
  source: { agency: string; sourceUrl: string; licenseStatus: string };
  days: ForecastDay[];
  cumulative: CumulativeRainfall | null;
  advisories: Advisory[];
};

type WeatherEnvelope = { data: WeatherPayload; meta: { warnings: string[]; access: string; dataAsOf: string | null } };

type WaterSourceMetadata = {
  sourceId: string;
  sourceName: string;
  datasetName: string;
  description: string;
  sourceUrl: string;
  endpointUrl: string;
  grain: string;
  frequency: string;
  licenseStatus: string;
  access: string;
  publicationApproved: boolean;
  licenseReviewedAt: string;
  limitations: string[];
};

type WaterMetadataPayload = {
  source: WaterSourceMetadata;
  reservoirs: [];
  summary: null;
};

type WaterEnvelope = {
  data: WaterMetadataPayload;
  pagination: { page: number; pageSize: number; total: number };
  meta: {
    availability: string;
    freshness: string;
    completeness: string;
    access: string;
    dataAsOf: string | null;
    warnings: string[];
  };
};

/* ---------------------- label maps (presentation only) ---------------------- */

const STATUS_LABEL: Record<CumulativeRainfall['status'], string> = {
  below_normal: 'ฝนต่ำกว่าค่าเฉลี่ยปกติ',
  normal: 'ใกล้เคียงค่าเฉลี่ยปกติ',
  above_normal: 'ฝนสูงกว่าค่าเฉลี่ยปกติ',
  unknown: 'ยังประเมินไม่ได้',
};

const SEVERITY_LABEL: Record<AdvisorySeverity, string> = {
  high: 'เร่งด่วน',
  medium: 'ควรระวัง',
  low: 'ควรรู้',
};

/** Mirrors THRESHOLDS in web/lib/hub/weather-data.ts (server-only, so values repeated here). */
const TODAY_THRESHOLDS = {
  heavyRainMm: 60,
  wetDayMm: 20,
  heatTmaxC: 40,
  strongWindMs: 10,
  highHumidityPct: 85,
} as const;

/* ---------------------- small helpers ---------------------- */

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { message?: string } }).error
      : undefined;
    throw new Error(error?.message || 'เชื่อมกับ API กลางไม่ได้ในขณะนี้');
  }
  return body as T;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function fmtNumber(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return 'ไม่ทราบ';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: digits }).format(value);
}

function fmtPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'ไม่ทราบ';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value) + '%';
}

function thaiDateLabel(iso: string | null): string {
  if (!iso || Number.isNaN(Date.parse(iso + 'T00:00:00+07:00'))) return 'ยังไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })
    .format(new Date(iso + 'T00:00:00+07:00'));
}

/** Farming-relevant tone for today only (status labels, not new data). */
function todayTone(day: ForecastDay | undefined): { cls: string; label: string } {
  if (!day) return { cls: styles.todayNormal, label: 'ยังประเมินวันนี้ไม่ได้' };
  if ((day.rainfallMm !== null && day.rainfallMm >= TODAY_THRESHOLDS.heavyRainMm) ||
    (day.tmaxC !== null && day.tmaxC >= TODAY_THRESHOLDS.heatTmaxC)) {
    return { cls: styles.todayHigh, label: 'วันนี้มีเหตุการณ์ที่ต้องระวังเร่งด่วน' };
  }
  if ((day.rainfallMm !== null && day.rainfallMm >= TODAY_THRESHOLDS.wetDayMm) ||
    (day.windSpeedMs !== null && day.windSpeedMs >= TODAY_THRESHOLDS.strongWindMs) ||
    (day.humidityMaxPercent !== null && day.humidityMaxPercent >= TODAY_THRESHOLDS.highHumidityPct)) {
    return { cls: styles.todayMedium, label: 'วันนี้ควรเฝ้าระวังแปลงเกษตร' };
  }
  return { cls: styles.todayNormal, label: 'วันนี้สภาพอากาศโดยรวมรับได้' };
}

function isRainy(condition: WeatherCondition): boolean {
  return condition === 'shower' || condition === 'heavy_rain' || condition === 'thunderstorm';
}

type SectionState = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

/* ---------------------- component ---------------------- */

export function ProvinceAgriOverview({ provinceCode, provinceName }: {
  provinceCode: string;
  provinceName: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [weatherState, setWeatherState] = useState<SectionState>({ phase: 'loading' });
  const [waterState, setWaterState] = useState<SectionState>({ phase: 'loading' });
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [weatherWarnings, setWeatherWarnings] = useState<string[]>([]);
  const [water, setWater] = useState<WaterEnvelope | null>(null);

  const retry = () => {
    setWeatherState({ phase: 'loading' });
    setWaterState({ phase: 'loading' });
    setWeather(null);
    setWeatherWarnings([]);
    setWater(null);
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const headers = { accept: 'application/json' };

    const weatherPromise = fetch('/api/v1/weather?provinceCode=' + encodeURIComponent(provinceCode), { signal, headers })
      .then((response) => readJson<WeatherEnvelope>(response))
      .then((envelope) => {
        if (!envelope?.data || !Array.isArray(envelope.data.days) ||
          !Array.isArray(envelope.data.advisories) || !envelope.data.location?.regionLabel) {
          throw new Error('รูปแบบข้อมูลพยากรณ์ไม่ถูกต้อง');
        }
        return envelope;
      });

    const waterPromise = fetch('/api/v1/water/reservoirs?pageSize=1', { signal, headers })
      .then((response) => readJson<WaterEnvelope>(response))
      .then((envelope) => {
        // Frozen metadata-only contract: data.source + reservoirs: [] + summary: null.
        if (!envelope?.data?.source?.sourceName || !Array.isArray(envelope.data.reservoirs) ||
          envelope.data.summary !== null || !envelope.meta) {
          throw new Error('รูปแบบ metadata น้ำต้นทุนไม่ถูกต้อง');
        }
        return envelope;
      });

    void Promise.allSettled([weatherPromise, waterPromise]).then((settled) => {
      const [weatherResult, waterResult] = settled as [
        PromiseSettledResult<WeatherEnvelope>,
        PromiseSettledResult<WaterEnvelope>,
      ];
      if (signal.aborted) return;

      if (weatherResult.status === 'fulfilled') {
        setWeather(weatherResult.value.data);
        setWeatherWarnings(Array.isArray(weatherResult.value.meta?.warnings) ? weatherResult.value.meta.warnings : []);
        setWeatherState({ phase: 'ready' });
      } else {
        setWeatherState({ phase: 'error', message: messageOf(weatherResult.reason, 'โหลดข้อมูลพยากรณ์จาก API ไม่สำเร็จ') });
      }

      if (waterResult.status === 'fulfilled') {
        setWater(waterResult.value);
        setWaterState({ phase: 'ready' });
      } else {
        setWaterState({ phase: 'error', message: messageOf(waterResult.reason, 'โหลด metadata น้ำต้นทุนจาก API ไม่สำเร็จ') });
      }
    });

    return () => controller.abort();
  }, [provinceCode, attempt]);

  const weatherReady = weatherState.phase === 'ready' && weather;
  const waterReady = waterState.phase === 'ready' && water;
  const sampleMode = weatherReady && weather.sample === true;
  const allLoading = weatherState.phase === 'loading' && waterState.phase === 'loading';

  return <section className={styles.section} aria-labelledby="province-agri-heading">
    <div className={styles.header}>
      <div>
        <h2 id="province-agri-heading">สถานการณ์การเกษตรในจังหวัด{provinceName}</h2>
        <p>สถานะข้อมูลพยากรณ์และน้ำต้นทุน — อ่านจาก `/api/v1/weather` และ `/api/v1/water/reservoirs`</p>
      </div>
      {sampleMode && <span className="badge pending"><Icon name="lock" size={13}/>ข้อมูลตัวอย่าง (ยังรอตรวจสิทธิ์)</span>}
    </div>

    {weatherReady && weatherWarnings.length > 0 && (
      <div className={styles.notice} role="status">
        <span className={styles.noticeIcon}><Icon name="info" size={17}/></span>
        <div>
          <strong>สถานะข้อมูลพยากรณ์</strong>
          <ul>{weatherWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      </div>
    )}

    {allLoading
      ? <LoadingSkeleton/>
      : <div className={styles.blocks}>
          <div className={styles.column}>
            {weatherState.phase === 'loading' && <LoadingSkeleton compact/>}
            {weatherState.phase === 'error' &&
              <ErrorBox title="เปิดข้อมูลพยากรณ์ไม่ได้" message={weatherState.message} onRetry={retry}/>}
            {weatherReady && <WeatherCards weather={weather}/>}
          </div>
          <div className={styles.column}>
            {waterState.phase === 'loading' && <LoadingSkeleton compact/>}
            {waterState.phase === 'error' &&
              <ErrorBox title="เปิดสรุปน้ำต้นทุนไม่ได้" message={waterState.message} onRetry={retry}/>}
            {waterReady && <WaterCards water={water}/>}
          </div>
        </div>}
  </section>;
}

/* ---------------------- weather view ---------------------- */

function WeatherCards({ weather }: { weather: WeatherPayload }) {
  if (!weather.days.length || !weather.cumulative) {
    return <section className={styles.card} aria-label="สถานะข้อมูลพยากรณ์" role="status">
      <h3>ยังไม่มีพยากรณ์ที่เผยแพร่ได้</h3>
      <p>ข้อมูลพยากรณ์ TMD HPC แยกอยู่ที่ <a href="/nwp">หน้าพยากรณ์ TMD HPC</a></p>
    </section>;
  }

  const today = weather.days[0];
  const tone = todayTone(today);
  const rainy = today ? isRainy(today.conditionCode) : false;
  const cumulative = weather.cumulative;
  const statusTone = cumulative.status === 'below_normal' ? styles.statusBelow
    : cumulative.status === 'above_normal' ? styles.statusAbove
      : cumulative.status === 'normal' ? styles.statusOk : styles.statusUnknown;

  return <>
    <section className={styles.card} aria-label="สรุปสภาพอากาศวันนี้และคำเตือนเพื่อการเกษตร">
      <div className={styles.cardHead}>
        <div>
          <span className={styles.eyebrow}>สภาพอากาศ · {weather.location.regionLabel}</span>
          <h3>สภาพอากาศวันนี้และคำเตือนเพื่อการเกษตร</h3>
          <p>ออกพยากรณ์ {thaiDateLabel(weather.issuedAt)} · แหล่งข้อมูล {weather.source.agency}</p>
        </div>
        <a className="text-link" href="/weather">คำเตือน 7 วันเต็ม<Icon name="arrow" size={16}/></a>
      </div>

      <div className={`${styles.todayBox} ${tone.cls}`}>
        <div className={styles.todayMain}>
          <span className={styles.todayIcon}><Icon name={rainy ? 'water' : 'sun'} size={30}/></span>
          <div className={styles.todayLabel}>
            <p className={styles.todayDay}>วันนี้ · {today?.weekdayTh} {today?.dateLabelTh}</p>
            <p className={styles.todayCondition}>{today?.conditionLabelTh ?? 'ยังไม่มีข้อมูล'}</p>
            <p className={styles.todayTone}>{tone.label}</p>
          </div>
          <dl className={styles.todayTemps}>
            <div><dd>{fmtNumber(today?.tmaxC ?? null)}°C</dd><dt>สูงสุด</dt></div>
            <div><dd>{fmtNumber(today?.tminC ?? null)}°C</dd><dt>ต่ำสุด</dt></div>
          </dl>
        </div>
        <dl className={styles.todayMetrics}>
          <div><dt>โอกาสฝนตก</dt><dd>{fmtNumber(today?.rainChancePercent ?? null, 0)}</dd></div>
          <div><dt>ปริมาณฝน</dt><dd>{fmtNumber(today?.rainfallMm ?? null)} มม.</dd></div>
          <div><dt>ความชื้นสูงสุด</dt><dd>{fmtNumber(today?.humidityMaxPercent ?? null, 0)}%</dd></div>
          <div><dt>ลม</dt><dd>{today?.windDirectionLabelTh ?? 'ไม่ทราบ'} {fmtNumber(today?.windSpeedMs ?? null)} ม./วินาที</dd></div>
        </dl>
      </div>

      <p className={styles.cumulativeRow}>
        ฝนสะสม 7 วัน (ค่าพยากรณ์) <strong>{fmtNumber(cumulative.forecastTotalMm)}</strong> มม.
        เทียบค่าเฉลี่ยปกติ <strong>{fmtNumber(cumulative.normalTotalMm)}</strong> มม.
        <span className={`${styles.statusChip} ${statusTone}`}>{STATUS_LABEL[cumulative.status]}</span>
        {cumulative.completeness === 'partial' && <small>ขาด {cumulative.missingDays} วัน</small>}
      </p>

      {weather.advisories.length === 0
        ? <div className={styles.allClear} role="status">
            <Icon name="sun" size={19}/>
            <p>ไม่มีคำเตือนเพื่อการเกษตรสำหรับช่วงพยากรณ์ 7 วันนี้</p>
          </div>
        : <ul className={styles.advisoryList}>
            {weather.advisories.map((advisory) => <li
              className={`${styles.advisory} ${advisorySeverityClass(advisory.severity)}`} key={advisory.code}>
              <div className={styles.advisoryHead}>
                <span className={styles.advisoryBadge}>{SEVERITY_LABEL[advisory.severity]}</span>
                <h4>{advisory.titleTh}</h4>
              </div>
              <p>{advisory.messageTh}</p>
              <ul>{advisory.actions.map((action) => <li key={action}>{action}</li>)}</ul>
            </li>)}
          </ul>}
    </section>
  </>;
}

function advisorySeverityClass(severity: AdvisorySeverity): string {
  return severity === 'high' ? styles.advisoryHigh
    : severity === 'medium' ? styles.advisoryMedium : styles.advisoryLow;
}

/* ---------------------- water view (metadata only while pending) ---------------------- */

function WaterCards({ water }: {
  water: WaterEnvelope;
}) {
  const { data, meta } = water;
  const source = data?.source;

  return <section className={styles.card} aria-label="สถานะสิทธิ์ข้อมูลน้ำต้นทุน">
    <div className={styles.cardHead}>
      <div>
        <span className={styles.eyebrow}>น้ำต้นทุน · อ่างเก็บน้ำขนาดกลาง</span>
        <h3>{source?.datasetName ?? 'รายงานสถานการณ์อ่างเก็บน้ำขนาดกลาง'}</h3>
        <p>{source?.sourceName ?? 'กรมชลประทาน (RID)'} · ทะเบียนสิทธิ์: {source?.licenseStatus ?? 'pending'}</p>
      </div>
      <a className="text-link" href="/water">ดูรายละเอียด<Icon name="arrow" size={16}/></a>
    </div>

    <aside
      role="status"
      aria-label="สถานะสิทธิ์ข้อมูล"
      style={{
        background: '#fff8e1',
        border: '1px solid #ffe082',
        borderRadius: 8,
        padding: '12px 16px',
        color: '#6d4f00',
        fontSize: 13,
        lineHeight: 1.6,
        margin: '12px 0',
      }}
    >
      <strong>ยังไม่เปิดเผยตัวเลขจากรายงานอ่างเก็บน้ำ</strong>
      <div>
        ทะเบียนสิทธิ์ราย resource ระบุรายงานอ่างเก็บน้ำขนาดกลางของกรมชลประทานเป็น <code>pending</code>{' '}
        จึงไม่แสดงความจุ ปริมาตร หรือเปอร์เซ็นต์ในหน้านี้จนกว่าจะมีหลักฐานสิทธิ์และ active approved batch
      </div>
    </aside>

    {meta?.warnings && meta.warnings.length > 0 && (
      <ul style={{ fontSize: 12, color: 'var(--text-muted, #666)', paddingLeft: 18, margin: '8px 0' }}>
        {meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
      </ul>
    )}

    <p className={styles.grainNote}>
      ระดับข้อมูล: {source?.grain ?? 'reservoir × report_date'} · ตรวจสิทธิ์ล่าสุด: {source?.licenseReviewedAt ?? '2026-10-25'} ·{' '}
      {source?.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">ต้นทาง: กรมชลประทาน</a>}
    </p>
  </section>;
}

/* ---------------------- shared bits ---------------------- */

function ErrorBox({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return <div className={styles.errorBox} role="alert">
    <Icon name="info" size={28}/>
    <h3>{title}</h3>
    <p>{message}</p>
    <button type="button" className="button secondary" onClick={onRetry}>ลองอีกครั้ง</button>
  </div>;
}

function LoadingSkeleton({ compact = false }: { compact?: boolean }) {
  const lengths = compact ? [46, 82, 64, 78] : [55, 90, 75, 60, 88, 70];
  return <div className={compact ? styles.skeletonCard : styles.skeletonWrap} role="status" aria-busy="true"
    aria-label="กำลังโหลดสรุปสถานการณ์การเกษตร">
    {!compact && <div className={styles.skeletonHead}><span className={styles.skeletonLine} style={{ width: '38%' }}/></div>}
    <ul className={styles.skeletonList}>
      {lengths.map((width, index) => <li key={index}>
        <span className={styles.skeletonLine} style={{ width: width + '%' }}/>
        <span className={styles.skeletonLine} style={{ width: Math.min(100, width + 15) + '%' }}/>
      </li>)}
    </ul>
  </div>;
}
