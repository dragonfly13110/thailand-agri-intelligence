'use client';

import { useEffect, useState } from 'react';
import { summarizeReanalysisWeek, type WeatherReanalysisRecord } from '@/lib/hub/weather-observations-data';
import { Icon } from './icon';
import styles from './province-agri-overview.module.css';

/**
 * Province agricultural overview for `/areas/[provinceCode]`.
 *
 * Everything shown is read live from the hub API v1 in the browser:
 * - `GET /api/v1/weather?provinceCode=…` (forecast 7 days, cumulative rainfall, advisories)
 * - `GET /api/v1/water/reservoirs` (RID medium-reservoir region summary)
 * - `GET /api/v1/weather/observations?provinceCode=…` (published ERA5 reanalysis days)
 *
 * The client never imports the repository; the only module import is the pure
 * seven-day helper so the "no partial week totals" rule exists in one place.
 * Types below mirror the JSON contract of those routes like
 * `weather-dashboard.tsx` does. Water
 * numbers are RID-region grain: the province is matched to one region by the
 * exact `location.regionLabel` from the weather payload, and no national or
 * other-region value ever stands in for a missing match.
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

type WaterRegionSummary = {
  region: string;
  reservoirCount: number;
  volumeMcm: number | null;
  storageMcm: number | null;
  percent: number | null;
};

type WaterSummary = {
  reportDate: string | null;
  reservoirCount: number;
  totalVolumeMcm: number | null;
  totalCapacityMcm: number | null;
  regionSummaries: WaterRegionSummary[];
};

type WaterPayload = {
  source: WaterSourceMetadata;
  reservoirs: unknown[];
  summary: WaterSummary | null;
};

type WaterEnvelope = {
  data: WaterPayload;
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

type ObservationsEnvelope = {
  data: { reanalysis: WeatherReanalysisRecord[] };
  meta: { availability: string; warnings: string[] };
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
  const [era5State, setEra5State] = useState<SectionState>({ phase: 'loading' });
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [weatherWarnings, setWeatherWarnings] = useState<string[]>([]);
  const [water, setWater] = useState<WaterEnvelope | null>(null);
  const [era5, setEra5] = useState<WeatherReanalysisRecord | null>(null);

  const retry = () => {
    setWeatherState({ phase: 'loading' });
    setWaterState({ phase: 'loading' });
    setEra5State({ phase: 'loading' });
    setWeather(null);
    setWeatherWarnings([]);
    setWater(null);
    setEra5(null);
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
        // Two honest shapes: metadata-only (summary null, reservoirs []) or a
        // published batch whose summary always carries regionSummaries.
        if (!envelope?.data?.source?.sourceName || !Array.isArray(envelope.data.reservoirs) ||
          (envelope.data.summary !== null && !Array.isArray(envelope.data.summary?.regionSummaries)) ||
          !envelope.meta) {
          throw new Error('รูปแบบข้อมูลน้ำต้นทุนไม่ถูกต้อง');
        }
        return envelope;
      });

    const era5Promise = fetch('/api/v1/weather/observations?provinceCode=' + encodeURIComponent(provinceCode) + '&pageSize=1',
      { signal, headers })
      .then((response) => readJson<ObservationsEnvelope>(response))
      .then((envelope) => {
        // An empty reanalysis array is an honest "no published batch", not an error.
        if (!Array.isArray(envelope?.data?.reanalysis)) throw new Error('รูปแบบข้อมูล ERA5 ไม่ถูกต้อง');
        return envelope.data.reanalysis[0] ?? null;
      });

    void Promise.allSettled([weatherPromise, waterPromise, era5Promise]).then((settled) => {
      const [weatherResult, waterResult, era5Result] = settled as [
        PromiseSettledResult<WeatherEnvelope>,
        PromiseSettledResult<WaterEnvelope>,
        PromiseSettledResult<WeatherReanalysisRecord | null>,
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

      if (era5Result.status === 'fulfilled') {
        setEra5(era5Result.value);
        setEra5State({ phase: 'ready' });
      } else {
        setEra5State({ phase: 'error', message: messageOf(era5Result.reason, 'โหลดค่าประมาณ ERA5 จาก API ไม่สำเร็จ') });
      }
    });

    return () => controller.abort();
  }, [provinceCode, attempt]);

  const weatherReady = weatherState.phase === 'ready' && weather;
  const waterReady = waterState.phase === 'ready' && water;
  const era5Ready = era5State.phase === 'ready';
  const sampleMode = weatherReady && weather.sample === true;
  const allLoading = weatherState.phase === 'loading' && waterState.phase === 'loading'
    && era5State.phase === 'loading';

  return <section className={styles.section} aria-labelledby="province-agri-heading">
    <div className={styles.header}>
      <div>
        <h2 id="province-agri-heading">สถานการณ์การเกษตรในจังหวัด{provinceName}</h2>
        <p>สถานะข้อมูลพยากรณ์ ค่าประมาณสภาพอากาศย้อนหลัง และน้ำต้นทุน — อ่านจาก `/api/v1/weather`, `/api/v1/weather/observations` และ `/api/v1/water/reservoirs`</p>
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
            {era5State.phase === 'loading' && <LoadingSkeleton compact/>}
            {era5State.phase === 'error' &&
              <ErrorBox title="เปิดค่าประมาณสภาพอากาศย้อนหลังไม่ได้" message={era5State.message} onRetry={retry}/>}
            {era5Ready && <ReanalysisWeekCard record={era5} provinceName={provinceName}/>}
          </div>
          <div className={styles.column}>
            {waterState.phase === 'loading' && <LoadingSkeleton compact/>}
            {waterState.phase === 'error' &&
              <ErrorBox title="เปิดสรุปน้ำต้นทุนไม่ได้" message={waterState.message} onRetry={retry}/>}
            {waterReady && <WaterCards water={water} regionLabel={weather?.location.regionLabel ?? null}/>}
          </div>
        </div>}
  </section>;
}

/* ---------------------- weather view ---------------------- */

function WeatherCards({ weather }: { weather: WeatherPayload }) {
  if (!weather.days.length || !weather.cumulative) {
    return <section className={styles.card} aria-label="สถานะข้อมูลพยากรณ์" role="status">
      <h3>ยังไม่มีพยากรณ์รายสถานีที่เผยแพร่ได้</h3>
      <p>พยากรณ์รายสถานียังไม่มี batch ที่อนุมัติ — พยากรณ์กริด TMD HPC NWP 72 ชั่วโมง (อนุมัติแล้ว) อยู่ที่ <a href="/nwp">หน้าพยากรณ์ TMD HPC</a></p>
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

/* ---------------------- reanalysis view (province grid point, estimated) ---------------------- */

function ReanalysisWeekCard({ record, provinceName }: {
  record: WeatherReanalysisRecord | null;
  provinceName: string;
}) {
  const week = record ? summarizeReanalysisWeek(record) : null;

  if (!record || !week) {
    return <section className={styles.card} aria-label="ค่าประมาณสภาพอากาศย้อนหลัง" role="status">
      <h3>ยังไม่มีค่าประมาณ ERA5 ของจังหวัด{provinceName}ที่เผยแพร่ได้</h3>
      <p>จุดกริดศูนย์กลางจังหวัดยังไม่อยู่ในรอบตัวเลขที่อนุมัติ จึงไม่แสดงฝนสะสมแทนค่าที่ขาด — ดูจังหวัดอื่นที่มีข้อมูลได้ที่ <a href="/weather">หน้าอากาศ</a></p>
    </section>;
  }

  return <section className={styles.card} aria-label="ค่าประมาณสภาพอากาศย้อนหลังเจ็ดวันจาก ERA5">
    <div className={styles.cardHead}>
      <div>
        <span className={styles.eyebrow}>ERA5 · ค่าประมาณจากแบบจำลอง</span>
        <h3>ฝนสะสม 7 วันย้อนหลังของจุดกริดจังหวัด{provinceName}</h3>
        <p>จุดกริด {fmtCoord(record.gridLatitude)} / {fmtCoord(record.gridLongitude)} · โมเดล {record.providerModel ?? 'ไม่ระบุ'}</p>
      </div>
      <a className="text-link" href="/weather">ตาราง ERA5 ทุกจังหวัด<Icon name="arrow" size={16}/></a>
    </div>

    <dl className={styles.todayMetrics}>
      <div>
        <dt>ฝนสะสม 7 วัน (ค่าประมาณ)</dt>
        <dd>{week.rainComplete ? fmtNumber(week.rainMm) + ' มม.' : 'ยังไม่ครบ 7 วัน'}</dd>
      </div>
      <div><dt>วันที่นับได้ในหน้าต่าง</dt><dd>{fmtNumber(week.dayCount, 0)} / 7 วัน</dd></div>
      <div><dt>ค่าที่ขาดในทั้งชุด</dt><dd>{fmtNumber(record.missingValueCount, 0)} ช่อง</dd></div>
      <div><dt>ช่วงวันที่</dt><dd>{thaiDateLabel(week.startDate)} – {thaiDateLabel(week.endDate)}</dd></div>
    </dl>

    <p className={styles.grainNote}>
      ค่าประมาณจากแบบจำลองรายจุดกริด ไม่ใช่ค่าตรวจวัดจากสถานี และไม่ใช่ค่าเฉลี่ยทั้งจังหวัด ·
      ERA5 archive ล่าช้าหลายวัน ช่วงวันที่ข้างบนจึงอาจไม่ใช่วันนี้ ·
      {week.rainComplete
        ? 'หน้าต่างนี้ครบ 7 วัน ตัวเลขจึงรวมได้ครบทุกรอบ'
        : 'หน้าต่างนี้ไม่ครบ 7 วัน หรือมีวันที่ยังไม่มีค่า ระบบไม่รวมบางส่วนแล้วเรียกว่ายอด 7 วัน'}
    </p>
  </section>;
}

function fmtCoord(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'ไม่ระบุ';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 }).format(value);
}

/* ---------------------- water view (region grain, never province) ---------------------- */

function WaterCards({ water, regionLabel }: {
  water: WaterEnvelope;
  regionLabel: string | null;
}) {
  const { data, meta } = water;
  const source = data?.source;
  const summary = data.summary;
  const region = summary && regionLabel
    ? summary.regionSummaries.find((row) => row.region === regionLabel) ?? null
    : null;

  return <section className={styles.card} aria-label="สรุปน้ำต้นทุนระดับกลุ่มภาค">
    <div className={styles.cardHead}>
      <div>
        <span className={styles.eyebrow}>น้ำต้นทุน · อ่างเก็บน้ำขนาดกลาง</span>
        <h3>{source?.datasetName ?? 'รายงานสถานการณ์อ่างเก็บน้ำขนาดกลาง'}</h3>
        <p>
          {source?.sourceName ?? 'กรมชลประทาน (RID)'} ·{' '}
          {summary ? `ข้อมูลจริง · รายงานวันที่ ${thaiDateLabel(summary.reportDate)}` : 'ยังไม่มีชุดข้อมูลที่เผยแพร่ได้'}
        </p>
      </div>
      <a className="text-link" href="/water">ดูรายละเอียด<Icon name="arrow" size={16}/></a>
    </div>

    {!summary && <p className={styles.grainNote}>
      ยังไม่มีรอบข้อมูลอ่างเก็บน้ำที่เผยแพร่ได้ในคลังกลาง ขณะนี้จึงไม่แสดงความจุ ปริมาตร หรือเปอร์เซ็นต์
    </p>}

    {summary && !region && <p className={styles.grainNote}>
      ไม่พบกลุ่มภาคของกรมชลประทานที่ตรงกับป้าย “{regionLabel ?? 'ไม่ทราบภาค'}” ในรายงานรอบนี้
      ระบบจึงไม่เติมค่าจากยอดรวมประเทศหรือภาคอื่นแทน — ดูภาพรวมได้ที่หน้า /water
    </p>}

    {summary && region && <>
      <dl className={styles.todayMetrics}>
        <div><dt>อ่างที่รายงาน · {region.region}</dt><dd>{fmtNumber(region.reservoirCount, 0)}</dd></div>
        <div><dt>ปริมาณน้ำ (ล้าน ลบ.ม.)</dt><dd>{fmtNumber(region.volumeMcm)}</dd></div>
        <div><dt>ความจุที่รายงาน (ล้าน ลบ.ม.)</dt><dd>{fmtNumber(region.storageMcm)}</dd></div>
        <div><dt>สัดส่วนน้ำ</dt><dd>{fmtPercent(region.percent)}</dd></div>
      </dl>
    </>}

    {meta?.warnings && meta.warnings.length > 0 && (
      <ul style={{ fontSize: 12, color: 'var(--text-muted, #666)', paddingLeft: 18, margin: '8px 0' }}>
        {meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
      </ul>
    )}

    <p className={styles.grainNote}>
      ระดับข้อมูล: {source?.grain ?? 'reservoir × report_date'} · ยอดนี้เป็นของกลุ่มภาค ไม่ใช่ค่าของจังหวัด และไม่ใช่ coverage รายจังหวัด ·{' '}
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
