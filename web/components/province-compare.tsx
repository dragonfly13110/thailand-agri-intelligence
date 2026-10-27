'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  COMPARE_MAX_PROVINCES,
  COMPARE_MIN_PROVINCES,
  findExactRidRegion,
  type CompareProvince,
  type CompareShared,
  type CropReference,
  type Loadable,
  type ProvinceOption,
  type RainStatus,
  type RidRegionRow,
  type SoilSnapshot,
  type WaterSnapshot,
  type WeatherSnapshot,
} from '@/lib/province-compare';
import { Icon } from './icon';
import { ProvinceCompareMatrix } from './province-compare-matrix';
import styles from './province-compare.module.css';

/**
 * Stateful container for `/areas/compare`.
 *
 * The user picks two or three provinces and the container fetches live data
 * from the real Hub API v1:
 * - weather is per province (`GET /api/v1/weather?provinceCode=…`);
 * - water, soil and crops are shared calls (`GET /api/v1/water/reservoirs`,
 *   `GET /api/v1/soil`, `GET /api/v1/crops`) and are matched locally with the
 *   exact region label carried by the province option.
 *
 * Truth rules enforced here:
 * - Weather stays empty until an approved forecast batch is available. The
 *   client preserves nulls and never ranks provinces from missing values.
 * - RID water is a region aggregate, matched by exact label only. There is no
 *   fallback to the national average or to ภาคกลาง, and a missing row stays
 *   `grain: 'none'` with null numbers.
 * - Soil and crops are reference documents. A soil series is an LDD survey
 *   unit, never a province boundary or coverage claim; crops are national
 *   reference data rendered once for every selected province.
 * - Missing source values stay null. The container never fills a number it did
 *   not receive from the API.
 */

const RID_SOURCE_LABEL = 'กรมชลประทาน (RID)';
const RID_SOURCE_URL = 'https://app.rid.go.th/reservoir/api/document/reservoir';
const WEATHER_SOURCE_URL = 'https://www.tmd.go.th/th';
const SOIL_SOURCE_URL = 'https://www.ldd.go.th/thaisoils_museum/';
const CROPS_SOURCE_URL = 'https://oae.go.th/uploads/files/2025/05/06/13e8089a3f69ea96.pdf';

const JSON_HEADERS = { accept: 'application/json' };

type WeatherLoadable = Loadable<WeatherSnapshot>;
type WaterLoadable = Loadable<WaterSnapshot>;
type SoilLoadable = Loadable<SoilSnapshot>;
type CropsLoadable = Loadable<CropReference[]>;

type WaterReference = {
  rows: RidRegionRow[];
  reportDate: string | null;
  sourceUrl: string;
};

type SoilSeriesReference = SoilSnapshot['items'][number] & { region: string };

type SoilReference = {
  series: SoilSeriesReference[];
};

type WaterReferenceLoadable = Loadable<WaterReference>;
type SoilReferenceLoadable = Loadable<SoilReference>;

/* ---------------------- loadable helpers ---------------------- */

function loadingState<T>(): Loadable<T> {
  return { phase: 'loading', data: null, message: null };
}

function readyState<T>(data: T): Loadable<T> {
  return { phase: 'ready', data, message: null };
}

function errorState<T>(message: string): Loadable<T> {
  return { phase: 'error', data: null, message };
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/* ---------------------- JSON shape validation ---------------------- */

type JsonRecord = { [key: string]: unknown };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error('รูปแบบ' + label + 'ไม่ถูกต้อง');
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error('รูปแบบ' + label + 'ไม่ถูกต้อง');
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('รูปแบบ' + label + 'ไม่ถูกต้อง');
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return requiredNumber(value, label);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseRainStatus(value: unknown): RainStatus {
  if (value === 'below_normal' || value === 'normal' || value === 'above_normal' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function parseCompleteness(value: unknown): 'complete' | 'partial' {
  if (value === 'complete' || value === 'partial') return value;
  throw new Error('รูปแบบความครบถ้วนของข้อมูลฝนไม่ถูกต้อง');
}

function parseSeverity(value: unknown): 'high' | 'medium' | 'low' | null {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return null;
}

function parseCumulative(value: unknown): NonNullable<WeatherSnapshot['cumulative']> {
  const cumulative = record(value, 'ข้อมูลฝนสะสม');
  return {
    windowDays: requiredNumber(cumulative.windowDays, 'จำนวนวันของหน้าต่างฝน'),
    daysWithData: requiredNumber(cumulative.daysWithData, 'จำนวนวันที่มีข้อมูลฝน'),
    missingDays: requiredNumber(cumulative.missingDays, 'จำนวนวันฝนที่ขาด'),
    forecastTotalMm: nullableNumber(cumulative.forecastTotalMm, 'ฝนรวมพยากรณ์'),
    normalTotalMm: requiredNumber(cumulative.normalTotalMm, 'ฝนปกติ'),
    anomalyPercent: nullableNumber(cumulative.anomalyPercent, 'ความผิดปกติของฝน'),
    status: parseRainStatus(cumulative.status),
    completeness: parseCompleteness(cumulative.completeness),
    dryDays: requiredNumber(cumulative.dryDays, 'จำนวนวันแห้ง'),
    heavyRainDays: requiredNumber(cumulative.heavyRainDays, 'จำนวนวันฝนหนัก'),
  };
}

function parseWeatherSnapshot(body: unknown): WeatherSnapshot {
  const envelope = record(body, 'ข้อมูลพยากรณ์');
  const data = record(envelope.data, 'ข้อมูลพยากรณ์');
  const location = record(data.location, 'ตำแหน่งพยากรณ์');
  const meta = record(envelope.meta, 'metadata พยากรณ์');

  if (typeof data.sample !== 'boolean') throw new Error('รูปแบบธงข้อมูลตัวอย่างไม่ถูกต้อง');
  if (!Array.isArray(data.advisories)) throw new Error('รูปแบบคำเตือนเพื่อการเกษตรไม่ถูกต้อง');

  const cumulative = data.cumulative === null || data.cumulative === undefined
    ? null
    : parseCumulative(data.cumulative);

  const advisories: WeatherSnapshot['advisories'] = [];
  for (const raw of data.advisories) {
    if (!isRecord(raw)) continue;
    const code = optionalText(raw.code);
    const titleTh = optionalText(raw.titleTh);
    const severity = parseSeverity(raw.severity);
    if (code && titleTh && severity) advisories.push({ code, severity, titleTh });
  }

  return {
    issuedAt: data.issuedAt === null ? null : text(data.issuedAt, 'วันออกพยากรณ์'),
    regionLabel: text(location.regionLabel, 'ภาคของพยากรณ์'),
    sample: data.sample,
    warnings: stringList(meta.warnings),
    cumulative,
    advisories,
  };
}

function parseWaterReference(body: unknown): WaterReference {
  const envelope = record(body, 'ข้อมูลน้ำต้นทุน');
  const summary = record(envelope.summary, 'สรุปน้ำต้นทุน');
  if (!Array.isArray(summary.regionSummaries)) {
    throw new Error('รูปแบบสรุปน้ำรายภาคไม่ถูกต้อง');
  }

  const rows: RidRegionRow[] = summary.regionSummaries.map((raw) => {
    const row = record(raw, 'แถวสรุปน้ำรายภาค');
    return {
      region: text(row.region, 'ชื่อกลุ่มภาคของน้ำ'),
      count: requiredNumber(row.count, 'จำนวนอ่างเก็บน้ำ'),
      storageMcm: requiredNumber(row.storageMcm, 'ความจุเก็บกัก'),
      volumeMcm: requiredNumber(row.volumeMcm, 'ปริมาณน้ำ'),
      percent: requiredNumber(row.percent, 'สัดส่วนน้ำ'),
    };
  });

  const meta = isRecord(envelope.meta) ? envelope.meta : {};
  return {
    rows,
    reportDate: optionalText(summary.reportDate),
    sourceUrl: optionalText(meta.sourceUrl) ?? RID_SOURCE_URL,
  };
}

function parseSoilReference(body: unknown): SoilReference {
  const envelope = record(body, 'ข้อมูลดิน');
  const data = record(envelope.data, 'ข้อมูลดิน');
  if (!Array.isArray(data.series)) throw new Error('รูปแบบชุดดินอ้างอิงไม่ถูกต้อง');

  const series: SoilSeriesReference[] = data.series.map((raw) => {
    const item = record(raw, 'ชุดดิน');
    return {
      id: text(item.id, 'รหัสชุดดิน'),
      code: text(item.code, 'สัญลักษณ์ชุดดิน'),
      name: text(item.name, 'ชื่อชุดดิน'),
      groupNumber: requiredNumber(item.groupNumber, 'กลุ่มชุดดิน'),
      region: text(item.region, 'ภาคของชุดดิน'),
      phNote: text(item.phNote, 'ค่า pH ของชุดดิน'),
      textureTop: text(item.textureTop, 'เนื้อดินชั้นบน'),
    };
  });

  return { series };
}

function parseCropReferences(body: unknown): CropReference[] {
  const envelope = record(body, 'ข้อมูลพืชอ้างอิง');
  if (!Array.isArray(envelope.data)) throw new Error('รูปแบบแท็บพืชอ้างอิงไม่ถูกต้อง');

  return envelope.data.map((raw) => {
    const tab = record(raw, 'แท็บพืช');
    if (!Array.isArray(tab.profiles)) throw new Error('รูปแบบโปรไฟล์พืชไม่ถูกต้อง');
    return {
      id: text(tab.id, 'รหัสพืช'),
      label: text(tab.label, 'ชื่อพืช'),
      profileNames: tab.profiles.flatMap((profile) => {
        if (!isRecord(profile)) return [];
        const name = optionalText(profile.name);
        return name ? [name] : [];
      }),
    };
  });
}

/* ---------------------- API requests ---------------------- */

async function requestJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: JSON_HEADERS });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('อ่านข้อมูลจาก API ไม่สำเร็จ (ไม่ใช่ JSON)');
  }

  if (!response.ok) {
    const apiMessage = isRecord(body) && isRecord(body.error) ? optionalText(body.error.message) : null;
    throw new Error(apiMessage ?? 'เชื่อมต่อ API กลางไม่ได้ในขณะนี้');
  }
  return body;
}

function fetchWeatherSnapshot(code: string, signal: AbortSignal): Promise<WeatherSnapshot> {
  const url = '/api/v1/weather?provinceCode=' + encodeURIComponent(code);
  return requestJson(url, signal).then(parseWeatherSnapshot);
}

function fetchWaterReference(signal: AbortSignal): Promise<WaterReference> {
  return requestJson('/api/v1/water/reservoirs?pageSize=1', signal).then(parseWaterReference);
}

function fetchSoilReference(signal: AbortSignal): Promise<SoilReference> {
  return requestJson('/api/v1/soil', signal).then(parseSoilReference);
}

function fetchCropReferences(signal: AbortSignal): Promise<CropReference[]> {
  return requestJson('/api/v1/crops', signal).then(parseCropReferences);
}

/* ---------------------- selection → snapshots ---------------------- */

function initialSlots(codes: string[], provinces: ProvinceOption[]): string[] {
  const known = new Set(provinces.map((province) => province.code));
  const slots: string[] = [];

  for (const rawCode of codes) {
    if (slots.length >= COMPARE_MAX_PROVINCES) break;
    const code = rawCode.trim();
    if (!known.has(code) || slots.includes(code)) continue;
    slots.push(code);
  }

  while (slots.length < COMPARE_MIN_PROVINCES) slots.push('');
  return slots;
}

function groupedProvinces(provinces: ProvinceOption[]): Array<{ label: string; options: ProvinceOption[] }> {
  const groups = new Map<string, ProvinceOption[]>();
  for (const province of provinces) {
    const label = province.regionLabel || 'ไม่ระบุภาค';
    const group = groups.get(label);
    if (group) group.push(province);
    else groups.set(label, [province]);
  }
  return [...groups.entries()].map(([label, options]) => ({ label, options }));
}

function noRidRegionNote(regionLabel: string): string {
  return 'ไม่พบกลุ่มภาคของ RID ที่ตรงกับป้าย “' + regionLabel + '” ในทะเบียนอ่างเก็บน้ำขนาดกลาง ' +
    'RID แบ่ง 6 ภาค (รวมภาคตะวันตก) ขณะที่พยากรณ์ใช้ 5 ภาค ระบบจึงไม่เติมค่าจากค่าเฉลี่ยประเทศหรือภาคกลาง ' +
    'และไม่มีตัวเลขระดับจังหวัดให้ใช้ — ดูภาพรวมที่หน้า /water';
}

function ridRegionNote(provinceName: string, ridRegion: string): string {
  return 'ค่านี้เป็นยอดรวมของกลุ่ม' + ridRegion + ' จากอ่างเก็บน้ำขนาดกลางที่กรมชลประทานรายงาน ' +
    'ใช้ร่วมกับทุกจังหวัดในกลุ่มภาค ไม่ใช่ค่าของจังหวัด' + provinceName + ' และไม่ใช่ coverage รายจังหวัด';
}

function waterForProvince(state: WaterReferenceLoadable, option: ProvinceOption): WaterLoadable {
  if (state.phase === 'loading') return loadingState<WaterSnapshot>();
  if (state.phase === 'error') return errorState<WaterSnapshot>(state.message);

  const row = findExactRidRegion(state.data.rows, option.regionLabel);
  if (!row) {
    return readyState<WaterSnapshot>({
      grain: 'none',
      ridRegion: null,
      percent: null,
      volumeMcm: null,
      storageMcm: null,
      reservoirCount: null,
      reportDate: state.data.reportDate,
      sourceLabel: RID_SOURCE_LABEL,
      sourceUrl: state.data.sourceUrl,
      note: noRidRegionNote(option.regionLabel),
    });
  }

  return readyState<WaterSnapshot>({
    grain: 'region',
    ridRegion: row.region,
    percent: row.percent,
    volumeMcm: row.volumeMcm,
    storageMcm: row.storageMcm,
    reservoirCount: row.count,
    reportDate: state.data.reportDate,
    sourceLabel: RID_SOURCE_LABEL,
    sourceUrl: state.data.sourceUrl,
    note: ridRegionNote(option.name, row.region),
  });
}

function soilForProvince(state: SoilReferenceLoadable, option: ProvinceOption): SoilLoadable {
  if (state.phase === 'loading') return loadingState<SoilSnapshot>();
  if (state.phase === 'error') return errorState<SoilSnapshot>(state.message);

  const items = state.data.series
    .filter((series) => series.region === option.regionLabel)
    .map((series) => ({
      id: series.id,
      code: series.code,
      name: series.name,
      groupNumber: series.groupNumber,
      phNote: series.phNote,
      textureTop: series.textureTop,
    }));

  if (items.length === 0) {
    return readyState<SoilSnapshot>({
      scope: 'none',
      regionLabel: option.regionLabel,
      items: [],
      note: 'คอลเลกชันชุดดินอ้างอิงนี้มี ' + state.data.series.length + ' ชุดดิน และไม่มีชุดดินที่ลงทะเบียนใน' +
        option.regionLabel + ' — ไม่ได้หมายความว่าพื้นที่นี้ไม่มีดินหรือไม่มีข้อมูลดิน ' +
        'ชุดดินเป็นหน่วยสำรวจของ LDD ไม่ใช่ขอบเขตจังหวัดหรือ coverage รายจังหวัด',
    });
  }

  return readyState<SoilSnapshot>({
    scope: 'region',
    regionLabel: option.regionLabel,
    items,
    note: 'ชุดดินเป็นหน่วยสำรวจของกรมพัฒนาที่ดิน (LDD) หนึ่งจังหวัดมีได้หลายชุดดิน ' +
      'รายการนี้กรองด้วยป้ายภาคของทะเบียนอ้างอิง จึงไม่ใช่ขอบเขตจังหวัดหรือ coverage รายจังหวัด',
  });
}

function collectSample(rows: CompareProvince[]): { hasSample: boolean; warnings: string[] } {
  const warnings = new Set<string>();
  let hasSample = false;

  for (const row of rows) {
    const weather = row.weather;
    if (weather.phase !== 'ready' || !weather.data.sample) continue;
    hasSample = true;
    for (const warning of weather.data.warnings) warnings.add(warning);
  }

  return { hasSample, warnings: [...warnings] };
}

function phaseLabel(state: Loadable<unknown>): string {
  if (state.phase === 'loading') return 'กำลังโหลด';
  if (state.phase === 'error') return 'โหลดไม่สำเร็จ';
  return 'พร้อมใช้';
}

/* ---------------------- component ---------------------- */

export function ProvinceCompare({ provinces, initialCodes }: {
  provinces: ProvinceOption[];
  initialCodes: string[];
}) {
  const [slots, setSlots] = useState<string[]>(() => initialSlots(initialCodes, provinces));
  const [attempt, setAttempt] = useState(0);
  const [weatherByCode, setWeatherByCode] = useState<Record<string, WeatherLoadable>>({});
  const [waterState, setWaterState] = useState<WaterReferenceLoadable>(() => loadingState<WaterReference>());
  const [soilState, setSoilState] = useState<SoilReferenceLoadable>(() => loadingState<SoilReference>());
  const [cropsState, setCropsState] = useState<CropsLoadable>(() => loadingState<CropReference[]>());

  const selectedCodes = useMemo(() => slots.filter((code) => code !== ''), [slots]);
  const activeKey = selectedCodes.join(',');
  const thirdSlot = slots.length >= COMPARE_MAX_PROVINCES;

  const regionGroups = useMemo(() => groupedProvinces(provinces), [provinces]);
  const selectedOptions = useMemo(() => {
    const byCode = new Map(provinces.map((province) => [province.code, province]));
    return selectedCodes.flatMap((code) => {
      const option = byCode.get(code);
      return option ? [option] : [];
    });
  }, [provinces, selectedCodes]);

  /* Shared references load once. Each service may fail independently. */
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    setWaterState(loadingState<WaterReference>());
    setSoilState(loadingState<SoilReference>());
    setCropsState(loadingState<CropReference[]>());

    const requests = [
      fetchWaterReference(signal),
      fetchSoilReference(signal),
      fetchCropReferences(signal),
    ] as const;

    void Promise.allSettled(requests).then(([waterResult, soilResult, cropsResult]) => {
      if (signal.aborted) return;

      if (waterResult.status === 'fulfilled') {
        setWaterState(readyState(waterResult.value));
      } else {
        setWaterState(errorState(messageOf(waterResult.reason, 'โหลดสรุปน้ำต้นทุนจาก API ไม่สำเร็จ')));
      }

      if (soilResult.status === 'fulfilled') {
        setSoilState(readyState(soilResult.value));
      } else {
        setSoilState(errorState(messageOf(soilResult.reason, 'โหลดชุดดินอ้างอิงจาก API ไม่สำเร็จ')));
      }

      if (cropsResult.status === 'fulfilled') {
        setCropsState(readyState(cropsResult.value));
      } else {
        setCropsState(errorState(messageOf(cropsResult.reason, 'โหลดข้อมูลพืชอ้างอิงจาก API ไม่สำเร็จ')));
      }
    });

    return () => controller.abort();
  }, [attempt]);

  /* Weather loads per selected province; one failure must not hide the others. */
  useEffect(() => {
    const codes = activeKey ? activeKey.split(',') : [];
    if (codes.length < COMPARE_MIN_PROVINCES) return;

    const controller = new AbortController();
    const { signal } = controller;
    const initial: Record<string, WeatherLoadable> = {};
    for (const code of codes) initial[code] = loadingState<WeatherSnapshot>();
    setWeatherByCode(initial);

    for (const code of codes) {
      fetchWeatherSnapshot(code, signal)
        .then((snapshot) => {
          if (signal.aborted) return;
          setWeatherByCode((current) => ({ ...current, [code]: readyState(snapshot) }));
        })
        .catch((reason: unknown) => {
          if (signal.aborted) return;
          setWeatherByCode((current) => ({
            ...current,
            [code]: errorState(messageOf(reason, 'โหลดพยากรณ์ของจังหวัดนี้ไม่สำเร็จ')),
          }));
        });
    }

    return () => controller.abort();
  }, [activeKey, attempt]);

  /* Keep the shareable selection in the URL without a router/Suspense boundary. */
  useEffect(() => {
    const query = activeKey ? 'provinces=' + activeKey : '';
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }, [activeKey]);

  const rows = useMemo<CompareProvince[]>(() => selectedOptions.map((option) => ({
    code: option.code,
    name: option.name,
    regionLabel: option.regionLabel,
    weather: weatherByCode[option.code] ?? loadingState<WeatherSnapshot>(),
    water: waterForProvince(waterState, option),
    soil: soilForProvince(soilState, option),
  })), [selectedOptions, weatherByCode, waterState, soilState]);

  const shared = useMemo<CompareShared>(() => ({ crops: cropsState }), [cropsState]);
  const sample = useMemo(() => collectSample(rows), [rows]);

  const retry = () => setAttempt((value) => value + 1);

  const updateSlot = (index: number, code: string) => {
    if (code && slots.some((selected, position) => position !== index && selected === code)) return;
    const next = slots.map((selected, position) => (position === index ? code : selected));
    setSlots(next);
    setWeatherByCode({});
  };

  const addThirdSlot = () => {
    setSlots((current) => (current.length >= COMPARE_MAX_PROVINCES ? current : [...current, '']));
  };

  const removeThirdSlot = () => {
    if (slots.length <= COMPARE_MIN_PROVINCES) return;
    const hadSelection = Boolean(slots[COMPARE_MIN_PROVINCES]);
    setSlots(slots.slice(0, COMPARE_MIN_PROVINCES));
    if (hadSelection) setWeatherByCode({});
  };

  const clearSelection = () => {
    setSlots(['', '']);
    setWeatherByCode({});
  };

  const selectedCount = selectedOptions.length;
  const missingCount = Math.max(0, COMPARE_MIN_PROVINCES - selectedCount);
  const sharedHasError = waterState.phase === 'error' || soilState.phase === 'error' || cropsState.phase === 'error';
  const waterSourceUrl = waterState.phase === 'ready' ? waterState.data.sourceUrl : RID_SOURCE_URL;

  return <section className={styles.section} aria-labelledby="province-compare-heading">
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <span className={styles.eyebrow}>เปรียบเทียบจังหวัด</span>
        <h2 id="province-compare-heading">วางข้อมูลฝน น้ำ ดิน และพืชของ 2–3 จังหวัดไว้ข้างกัน</h2>
        <p>
          เลือกจังหวัด 2 ถึง 3 จังหวัดเพื่อดูข้อมูลชุดเดียวกันพร้อมกัน ฝนเป็นค่าพยากรณ์รายจังหวัด
          น้ำเป็นยอดรวมระดับกลุ่มภาค ชุดดินเป็นหน่วยสำรวจของ LDD และพืชเป็นเอกสารอ้างอิงระดับประเทศ
          — หน้านี้ไม่จัดอันดับหรือเลือกจังหวัดที่ดีกว่า เพราะแต่ละชุดมีระดับข้อมูลและเวลาไม่เท่ากัน
        </p>
      </div>
      {sample.hasSample && (
        <span className="badge pending"><Icon name="lock" size={13}/>ข้อมูลตัวอย่าง (รอตรวจสิทธิ์)</span>
      )}
    </header>

    {sample.hasSample && (
      <div className={styles.sampleBanner} role="status">
        <span className={styles.sampleIcon}><Icon name="lock" size={17}/></span>
        <div>
          <strong>พยากรณ์ฝนเป็นข้อมูลตัวอย่าง ยังใช้ตัดสินใจจริงไม่ได้</strong>
          <p>
            ทรัพยากรพยากรณ์อากาศของกรมอุตุนิยมวิทยายังอยู่ระหว่างตรวจสิทธิ์ ตัวเลขฝนทั้งหมดในหน้านี้
            จึงเป็นข้อมูลสาธิต ห้ามใช้จัดอันดับจังหวัด เปรียบเทียบผลผลิต หรือตัดสินใจทางการเกษตร
          </p>
          {sample.warnings.length > 0 && (
            <ul>{sample.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          )}
        </div>
      </div>
    )}

    <div className={styles.selectorPanel} role="group" aria-labelledby="province-compare-selector-heading">
      <div className={styles.selectorHead}>
        <h3 id="province-compare-selector-heading">เลือกจังหวัด</h3>
        <p>
          ต้องมีอย่างน้อย {COMPARE_MIN_PROVINCES} จังหวัดและไม่เกิน {COMPARE_MAX_PROVINCES} จังหวัด
          ระบบจะไม่เลือกจังหวัดแทนและจะไม่เติมค่าน้ำหรือดินจากจังหวัดที่ไม่ได้เลือก
        </p>
      </div>

      <div className={styles.selectGrid + (thirdSlot ? ' ' + styles.selectGridThree : '')}>
        {slots.map((code, index) => (
          <div className={styles.field} key={index}>
            <label htmlFor={'compare-province-' + (index + 1)}>
              จังหวัดที่ {index + 1}{index === COMPARE_MAX_PROVINCES - 1 ? ' (ไม่บังคับ)' : ''}
            </label>
            <select
              id={'compare-province-' + (index + 1)}
              value={code}
              onChange={(event) => updateSlot(index, event.target.value)}
            >
              <option value="">เลือกจังหวัด</option>
              {regionGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option
                      key={option.code}
                      value={option.code}
                      disabled={slots.some((selected, position) => position !== index && selected === option.code)}
                    >
                      {option.name} ({option.code})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {index === COMPARE_MAX_PROVINCES - 1 && (
              <span className={styles.fieldHelp}>ช่องนี้ไม่บังคับ — ใช้เมื่อต้องการเทียบ 3 จังหวัด</span>
            )}
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        {thirdSlot
          ? <button type="button" className="button secondary" onClick={removeThirdSlot}>เอาจังหวัดที่ 3 ออก</button>
          : <button type="button" className="button secondary" onClick={addThirdSlot}>เพิ่มจังหวัดที่ 3</button>}
        {slots.some((code) => code !== '') && (
          <button type="button" className="button secondary" onClick={clearSelection}>ล้างการเลือก</button>
        )}
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        {selectedCount >= COMPARE_MIN_PROVINCES
          ? <>เลือกแล้ว <strong>{selectedCount}</strong> จาก {COMPARE_MAX_PROVINCES} จังหวัด
              {selectedCount < COMPARE_MAX_PROVINCES ? ' — เปรียบเทียบชุดนี้ หรือเพิ่มจังหวัดที่ 3' : ' — ครบจำนวนสูงสุดแล้ว'}</>
          : <>เลือกแล้ว <strong>{selectedCount}</strong> จาก {COMPARE_MAX_PROVINCES} จังหวัด
              {' — ต้องมีอย่างน้อย '}{COMPARE_MIN_PROVINCES} จังหวัด</>}
      </p>
    </div>

    {selectedCount < COMPARE_MIN_PROVINCES && (
      <div className={styles.prompt}>
        <span className={styles.promptIcon}><Icon name="pin" size={18}/></span>
        <div className={styles.promptBody}>
          <strong>เลือกอีก {missingCount} จังหวัด…</strong>
          <p>
            ระบบจะเริ่มดึงพยากรณ์รายจังหวัดเมื่อเลือกครบ {COMPARE_MIN_PROVINCES} จังหวัด
            ระหว่างนี้ยังไม่มีการดึงข้อมูลฝน และจะไม่เติมค่าน้ำหรือดินจากจังหวัดอื่นแทน
          </p>
          <p className={styles.sharedLine}>
            ข้อมูลร่วมที่โหลดล่วงหน้า: น้ำ {phaseLabel(waterState)} · ดิน {phaseLabel(soilState)} · พืช {phaseLabel(cropsState)}
          </p>
        </div>
        {sharedHasError && (
          <button type="button" className={'button secondary ' + styles.promptAction} onClick={retry}>ลองอีกครั้ง</button>
        )}
      </div>
    )}

    {selectedCount >= COMPARE_MIN_PROVINCES && (
      <ProvinceCompareMatrix rows={rows} shared={shared} onRetry={retry}/>
    )}

    <footer className={styles.footnotes}>
      <h3>ที่มาและขอบเขตข้อมูล</h3>
      <ul>
        <li>
          <strong>ฝน:</strong> พยากรณ์เพื่อการเกษตรของกรมอุตุนิยมวิทยา (TMD) ผ่าน <a href="/api/v1/weather">/api/v1/weather</a>
          {' '}· ยังไม่มี forecast batch ที่อนุมัติให้เผยแพร่; พยากรณ์ TMD HPC อยู่ที่ <a href="/nwp">หน้า /nwp</a>
          {' '}· อ่านนิยามและสถานะข้อมูลที่ <a href="/weather">หน้า /weather</a>
          {' '}· <a href={WEATHER_SOURCE_URL} target="_blank" rel="noreferrer">ต้นทาง TMD</a>
        </li>
        <li>
          <strong>น้ำ:</strong> อ่างเก็บน้ำขนาดกลางของ{RID_SOURCE_LABEL} ผ่าน <a href="/api/v1/water/reservoirs">/api/v1/water/reservoirs</a>
          {' '}· เป็นยอดรวมระดับกลุ่มภาค ใช้ร่วมกับทุกจังหวัดในภาค ไม่ใช่ค่าหรือ coverage ของจังหวัด
          {' '}· RID แบ่ง 6 ภาค (รวมภาคตะวันตก) ขณะที่พยากรณ์ใช้ 5 ภาค ระบบจับคู่ด้วยชื่อภาคตรงตัวเท่านั้น
          ไม่ถอยไปใช้ค่าเฉลี่ยประเทศหรือภาคกลาง · <a href="/water">หน้า /water</a>
          {' '}· <a href={waterSourceUrl} target="_blank" rel="noreferrer">ต้นทาง RID</a>
        </li>
        <li>
          <strong>ดิน:</strong> ชุดดินอ้างอิงของกรมพัฒนาที่ดิน (LDD) ผ่าน <a href="/api/v1/soil">/api/v1/soil</a>
          {' '}· ชุดดินเป็นหน่วยสำรวจ ไม่ใช่ขอบเขตจังหวัดหรือ coverage รายจังหวัด
          คอลเลกชันอ้างอิง 7 ชุดดินอาจไม่มีรายการในบางภาค ซึ่งไม่ได้แปลว่าภาคนั้นไม่มีดิน
          {' '}· <a href="/soil">หน้า /soil</a>
          {' '}· <a href={SOIL_SOURCE_URL} target="_blank" rel="noreferrer">พิพิธภัณฑ์ดิน LDD</a>
        </li>
        <li>
          <strong>พืช:</strong> เอกสารอ้างอิงระดับประเทศของ สศก./กรมการข้าว/กรมวิชาการเกษตร ผ่าน <a href="/api/v1/crops">/api/v1/crops</a>
          {' '}· แสดงครั้งเดียวสำหรับทุกจังหวัด ไม่ได้ผูกเป็นค่าของจังหวัดใด · <a href="/crops">หน้า /crops</a>
          {' '}· <a href={CROPS_SOURCE_URL} target="_blank" rel="noreferrer">ต้นทาง สศก.</a>
        </li>
        <li>
          <strong>ทะเบียนจังหวัด:</strong> รหัส 77 จังหวัดใช้เพื่อนำทางและส่งคำขอไปยัง API เท่านั้น
          ไม่ได้แปลว่าทุกจังหวัดมีตัวเลขฝน น้ำ ดิน หรือพืชครบ และจำนวนรหัสไม่ใช่ coverage
          {' '}· ดูภาพรวมพื้นที่ที่ <a href="/areas">หน้า /areas</a>
        </li>
      </ul>
    </footer>
  </section>;
}
