import 'server-only';
import { HubRequestError, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import { getProvinces } from '../provinces';

/**
 * Weather & rainfall intelligence for `/weather` and `/api/v1/weather`.
 *
 * Lineage rules kept from SYSTEM_DESIGN.md:
 * - The TMD resource is still `pending` in `config/resource_licenses.json`, so no
 *   upstream numeric value is served. While `SAMPLE_MODE` is on, every number in
 *   the payload is a deterministic demo value (seeded by location + issue date),
 *   flagged `sample: true`, `access: 'metadata_only'` and repeated in `warnings`.
 * - When the resource clears M4/M5, flip `SAMPLE_MODE` off and read the active
 *   approved batch here instead; the response shape below must not change.
 * - Thresholds and advisory texts mirror `src/tadih/weather.py` so the offline
 *   processor and the dashboard classify an identical forecast identically.
 */

export const SAMPLE_MODE = true;

export type RegionKey = 'north' | 'northeast' | 'central' | 'east' | 'south';
export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'shower' | 'heavy_rain' | 'thunderstorm';
export type AdvisorySeverity = 'high' | 'medium' | 'low';

export const REGIONS: { key: RegionKey; label: string }[] = [
  { key: 'north', label: 'ภาคเหนือ' },
  { key: 'northeast', label: 'ภาคตะวันออกเฉียงเหนือ' },
  { key: 'central', label: 'ภาคกลาง' },
  { key: 'east', label: 'ภาคตะวันออก' },
  { key: 'south', label: 'ภาคใต้' },
];

const REGION_LABEL: Record<RegionKey, string> = {
  north: 'ภาคเหนือ', northeast: 'ภาคตะวันออกเฉียงเหนือ', central: 'ภาคกลาง',
  east: 'ภาคตะวันออก', south: 'ภาคใต้',
};

/** Reference grouping of the 77 registered provinces; a code list, never a coverage claim. */
export const REGION_BY_PROVINCE: Record<string, RegionKey> = {
  '10': 'central', '11': 'central', '12': 'central', '13': 'central', '14': 'central',
  '15': 'central', '16': 'central', '17': 'central', '18': 'central', '19': 'central',
  '70': 'central', '71': 'central', '72': 'central', '73': 'central', '74': 'central',
  '75': 'central', '76': 'central', '77': 'central',
  '20': 'east', '21': 'east', '22': 'east', '23': 'east',
  '24': 'east', '25': 'east', '26': 'east', '27': 'east',
  '30': 'northeast', '31': 'northeast', '32': 'northeast', '33': 'northeast',
  '34': 'northeast', '35': 'northeast', '36': 'northeast', '37': 'northeast',
  '38': 'northeast', '39': 'northeast', '40': 'northeast', '41': 'northeast',
  '42': 'northeast', '43': 'northeast', '44': 'northeast', '45': 'northeast',
  '46': 'northeast', '47': 'northeast', '48': 'northeast', '49': 'northeast',
  '50': 'north', '51': 'north', '52': 'north', '53': 'north', '54': 'north',
  '55': 'north', '56': 'north', '57': 'north', '58': 'north',
  '60': 'north', '61': 'north', '62': 'north', '63': 'north', '64': 'north',
  '65': 'north', '66': 'north', '67': 'north',
  '80': 'south', '81': 'south', '82': 'south', '83': 'south', '84': 'south',
  '85': 'south', '86': 'south',
  '90': 'south', '91': 'south', '92': 'south', '93': 'south', '94': 'south',
  '95': 'south', '96': 'south',
};

export const CONDITION_LABELS: Record<WeatherCondition, string> = {
  sunny: 'แดดจัด',
  partly_cloudy: 'มีแดดปานกลาง',
  cloudy: 'มีเมฆมาก',
  shower: 'ฝนตกเป็นแห่ง',
  heavy_rain: 'ฝนตกหนัก',
  thunderstorm: 'ฝนฟ้าคะนอง',
};

/** Advisory thresholds; identical values live in src/tadih/weather.py. */
export const THRESHOLDS = {
  forecastDays: 7,
  heavyRainMm: 60,
  heavyRainStreakDays: 3,
  heavyRainStreakMm: 30,
  dryDayRainMm: 1,
  dryDayRainChancePct: 40,
  drySpellDays: 5,
  anomalyBelowPct: -25,
  anomalyAbovePct: 25,
  heatTmaxC: 40,
  strongWindMs: 10,
  highHumidityPct: 85,
  highHumidityDays: 3,
  prolongedRainDays: 3,
  prolongedRainChancePct: 60,
} as const;

export const FORECAST_UNITS: Record<string, string> = {
  temperature: 'celsius',
  rain_chance: 'percent',
  rainfall: 'mm',
  relative_humidity: 'percent',
  wind_speed: 'm/s',
  wind_direction: 'degrees_compass',
};

export const SOURCE = {
  agency: 'กรมอุตุนิยมวิทยา (TMD)',
  sourceUrl: 'https://www.tmd.go.th/th',
  licenseStatus: 'pending',
} as const;

export const WEATHER_WARNINGS = [
  'ตัวเลขในชุดนี้เป็นข้อมูลตัวอย่างเพื่อสาธิตหน้าจอ ยังไม่ใช่พยากรณ์จริงจากกรมอุตุนิยมวิทยา',
  'ทรัพยากรพยากรณ์อากาศยังอยู่ระหว่างตรวจสิทธิ์ จึงยังไม่เปิดเป็นข้อมูลตัวเลขสาธารณะ',
  'ค่าระดับจังหวัด/ภาคเป็นค่าประมาณเพื่อการวางแผน ไม่ใช่ค่าจากสถานีใดสถานีหนึ่ง',
];

export type ForecastDay = {
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

export type CumulativeRainfall = {
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
  byDay: { date: string; rainfallMm: number | null; normalMm: number; forecastCumulativeMm: number | null; normalCumulativeMm: number }[];
  calculationVersion: string;
};

export type Advisory = {
  code: string;
  severity: AdvisorySeverity;
  titleTh: string;
  messageTh: string;
  actions: string[];
};

export type WeatherOverview = {
  location: { kind: 'province' | 'region'; code: string; name: string; region: RegionKey; regionLabel: string };
  issuedAt: string;
  dataKind: 'sample';
  sample: boolean;
  source: typeof SOURCE;
  units: Record<string, string>;
  days: ForecastDay[];
  cumulative: CumulativeRainfall;
  advisories: Advisory[];
};

/* ------------------------------------------------------------------ */
/* Climatology used for normals and demo values (all labelled sample) */
/* ------------------------------------------------------------------ */

/** Daily normal rainfall (mm) per month index 0-11, used as the chart baseline. */
const NORMAL_DAILY_RAINFALL_MM: Record<RegionKey, number[]> = {
  north: [3, 3, 7, 18, 45, 58, 55, 58, 48, 28, 9, 4],
  northeast: [2, 2, 6, 17, 42, 55, 52, 55, 42, 22, 6, 2],
  central: [2, 3, 7, 20, 45, 52, 50, 52, 48, 30, 9, 3],
  east: [3, 3, 8, 24, 50, 58, 55, 58, 52, 38, 12, 4],
  south: [25, 16, 18, 22, 40, 26, 22, 25, 30, 55, 62, 42],
};
const TMAX_BASE_C = [32, 34, 36, 37, 35, 33, 33, 33, 33, 33, 32, 31];
const TMIN_BASE_C = [22, 24, 26, 27, 27, 27, 27, 27, 27, 26, 24, 22];
const REGION_TEMP_OFFSET: Record<RegionKey, { tmax: number; tmin: number }> = {
  north: { tmax: -1, tmin: -2 },
  northeast: { tmax: 0, tmin: -1 },
  central: { tmax: 1, tmin: 0 },
  east: { tmax: 1, tmin: 0 },
  south: { tmax: 0, tmin: 3 },
};

const WIND_DIRECTIONS_TH = [
  'เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้',
  'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ',
];

/* ------------------------------------------------------------------ */
/* Small deterministic helpers                                          */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a so the same location and issue date always produce the same demo week. */
function seedFrom(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function todayIssuedAt(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
}

function addDays(iso: string, days: number) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
}

function monthIndex(iso: string) {
  return Number(iso.slice(5, 7)) - 1;
}

function thaiDateParts(iso: string) {
  const instant = new Date(iso + 'T00:00:00+07:00');
  const weekday = new Intl.DateTimeFormat('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' }).format(instant);
  const date = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(instant);
  return { weekday, date };
}

export function windDirectionLabel(degrees: number | null) {
  if (degrees === null) return null;
  return WIND_DIRECTIONS_TH[Math.round((degrees % 360) / 45) % 8];
}

/* ------------------------------------------------------------------ */
/* Demo forecast generation (SAMPLE_MODE)                              */
/* ------------------------------------------------------------------ */

function sampleCondition(rainfallMm: number, rainChancePercent: number, roll: number): WeatherCondition {
  if (rainfallMm >= 40) return roll < 0.4 ? 'thunderstorm' : 'heavy_rain';
  if (rainfallMm >= 20) return 'heavy_rain';
  if (rainfallMm >= 1) return 'shower';
  if (rainChancePercent >= 45) return 'cloudy';
  if (rainChancePercent >= 25) return 'partly_cloudy';
  return roll < 0.7 ? 'sunny' : 'partly_cloudy';
}

function sampleDays(region: RegionKey, locationKey: string, issuedAt: string): ForecastDay[] {
  const random = mulberry32(seedFrom(locationKey + '|' + issuedAt));
  const offset = REGION_TEMP_OFFSET[region];
  const days: ForecastDay[] = [];
  for (let index = 0; index < THRESHOLDS.forecastDays; index += 1) {
    const date = addDays(issuedAt, index);
    const month = monthIndex(date);
    const normalMm = NORMAL_DAILY_RAINFALL_MM[region][month];
    const roll = random();
    // ~25% of days are forecast breaks (dry, low rain chance) so demo weeks show
    // clear spells between rainy days instead of rain every single day.
    const breakDay = random() < 0.25;
    const rainChancePercent = breakDay
      ? clamp(Math.round(random() * 25), 0, 25)
      : clamp(Math.round(20 + normalMm * 1.3 + (random() * 30 - 15)), 5, 95);
    // Scaled by the regional normal so demo weeks run wetter and drier than the
    // baseline instead of always sitting far below it.
    const rainfallMm = breakDay
      ? 0
      : round(random() * (rainChancePercent >= 50 ? 3.3 : 1.0) * normalMm, 1);
    const tmaxC = round(TMAX_BASE_C[month] + offset.tmax + (random() * 4 - 1.6), 1);
    const tminC = round(Math.min(TMIN_BASE_C[month] + offset.tmin + (random() * 3 - 1.2), tmaxC - 4), 1);
    const humidityMinPercent = clamp(Math.round(45 + rainChancePercent * 0.35 + (random() * 10 - 5)), 30, 98);
    const humidityMaxPercent = clamp(humidityMinPercent + Math.round(8 + random() * 18), humidityMinPercent, 100);
    const windSpeedMs = round(1 + random() * 7, 1);
    const windDirectionDeg = Math.round(random() * 359);
    const conditionCode = sampleCondition(rainfallMm, rainChancePercent, roll);
    const parts = thaiDateParts(date);
    days.push({
      date,
      weekdayTh: parts.weekday,
      dateLabelTh: parts.date,
      conditionCode,
      conditionLabelTh: CONDITION_LABELS[conditionCode],
      rainChancePercent,
      rainfallMm,
      tmaxC,
      tminC,
      humidityMinPercent,
      humidityMaxPercent,
      windDirectionDeg,
      windDirectionLabelTh: windDirectionLabel(windDirectionDeg),
      windSpeedMs,
      sample: true,
    });
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* Cumulative rainfall index and advisories (mirrors weather.py)        */
/* ------------------------------------------------------------------ */

function longestStreak(flags: boolean[]) {
  let longest = 0;
  let current = 0;
  for (const flag of flags) {
    current = flag ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function cumulativeRainfall(days: ForecastDay[], region: RegionKey): CumulativeRainfall {
  const known = days.filter((day) => day.rainfallMm !== null);
  const total = known.length ? known.reduce((sum, day) => sum + (day.rainfallMm as number), 0) : null;
  const byDay: CumulativeRainfall['byDay'] = [];
  let forecastRunning = 0;
  let knownSoFar = 0;
  let normalRunning = 0;
  let normalTotal = 0;
  for (const day of days) {
    const value = day.rainfallMm;
    const normalMm = NORMAL_DAILY_RAINFALL_MM[region][monthIndex(day.date)];
    normalTotal += normalMm;
    normalRunning += normalMm;
    if (value !== null) {
      forecastRunning += value;
      knownSoFar += 1;
    }
    byDay.push({
      date: day.date,
      rainfallMm: value,
      normalMm,
      forecastCumulativeMm: knownSoFar ? round(forecastRunning, 1) : null,
      normalCumulativeMm: round(normalRunning, 1),
    });
  }
  const anomalyMm = total === null ? null : round(total - normalTotal, 1);
  const anomalyPercent = total === null ? null : round((total - normalTotal) / normalTotal * 100, 1);
  const status = anomalyPercent === null
    ? 'unknown'
    : anomalyPercent <= THRESHOLDS.anomalyBelowPct ? 'below_normal'
      : anomalyPercent >= THRESHOLDS.anomalyAbovePct ? 'above_normal' : 'normal';
  const missingDays = days.length - known.length;
  return {
    windowDays: days.length,
    daysWithData: known.length,
    missingDays,
    forecastTotalMm: total === null ? null : round(total, 1),
    normalTotalMm: round(normalTotal, 1),
    anomalyMm,
    anomalyPercent,
    status,
    completeness: missingDays === 0 ? 'complete' : 'partial',
    dryDays: days.filter((day) => day.rainfallMm !== null && day.rainfallMm < THRESHOLDS.dryDayRainMm).length,
    heavyRainDays: days.filter((day) => day.rainfallMm !== null && day.rainfallMm >= THRESHOLDS.heavyRainMm).length,
    byDay,
    calculationVersion: 'cumulative-rainfall-index-v1',
  };
}

const SEVERITY_ORDER: Record<AdvisorySeverity, number> = { high: 0, medium: 1, low: 2 };

function buildAdvisories(days: ForecastDay[], cumulative: CumulativeRainfall): Advisory[] {
  const isDry = (day: ForecastDay) =>
    (day.rainfallMm === null || day.rainfallMm < THRESHOLDS.dryDayRainMm) &&
    (day.rainChancePercent === null || day.rainChancePercent < THRESHOLDS.dryDayRainChancePct);
  const dryStreak = longestStreak(days.map(isDry));
  const heavyStreak = longestStreak(days.map((day) => day.rainfallMm !== null && day.rainfallMm >= THRESHOLDS.heavyRainStreakMm));
  const wetStreak = longestStreak(days.map((day) => day.rainChancePercent !== null && day.rainChancePercent >= THRESHOLDS.prolongedRainChancePct));
  const humidStreak = longestStreak(days.map((day) => day.humidityMaxPercent !== null && day.humidityMaxPercent >= THRESHOLDS.highHumidityPct));
  const belowNormal = cumulative.status === 'below_normal' && cumulative.dryDays >= 3;
  const found = new Map<string, Advisory>();
  const add = (code: string, severity: AdvisorySeverity, titleTh: string, messageTh: string, actions: string[]) =>
    found.set(code, { code, severity, titleTh, messageTh, actions });

  if (days.some((day) => day.rainfallMm !== null && day.rainfallMm >= THRESHOLDS.heavyRainMm) || heavyStreak >= THRESHOLDS.heavyRainStreakDays) {
    add('HEAVY_RAIN', 'high', 'ฝนตกหนัก',
      'ช่วงนี้มีฝนตกหนัก งดใส่ปุ๋ยเคมีและสารเคมีก่อนฝนอย่างน้อย 48 ชั่วโมง เพื่อไม่ให้ปุ๋ยและสารถูกชะล้างลงดินและแหล่งน้ำ',
      ['งดใส่ปุ๋ยเคมีและสารเคมีก่อนฝน 48 ชั่วโมง', 'ระบายน้ำในแปลงและยกแปลงให้สูงขึ้นป้องกันน้ำขัง', 'เลื่อนการใช้เครื่องจักรหนักในแปลงที่ดินอุ้มน้ำ']);
  }
  if (days.some((day) => day.tmaxC !== null && day.tmaxC >= THRESHOLDS.heatTmaxC)) {
    add('HEAT', 'high', 'อากาศร้อนจัด',
      'อุณหภูมิสูงจัด อากาศแห้งและร้อนเพิ่มความเครียดให้พืชและสัตว์ ควรให้น้ำและดูแลช่วงเช้าหรือเย็น',
      ['ให้น้ำแปลงผักและแปลงเพาะปลูกช่วงเช้าตรู่', 'คลุมดินหรือรองพื้นฟางเพื่อลดการระเหย', 'เพิ่มน้ำและพื้นที่หลบแดดสำหรับสัตว์']);
  }
  if (dryStreak >= THRESHOLDS.drySpellDays || belowNormal) {
    add('DRY_SPELL', 'medium', 'ฝนทิ้งช่วง / ฝนต่ำกว่าปกติ',
      'ปริมาณฝนต่ำกว่าค่าเฉลี่ยปกติหรือฝนทิ้งช่วงยาว ระวังเพลี้ยไฟและแมลงระบาด จัดการให้น้ำตามรอบไม่ให้พืชชะงัก',
      ['ให้น้ำช่วงเช้าหรือเย็นตามรอบการให้น้ำของพืช', 'ตรวจแปลงรายสัปดาห์เพื่อพบเพลี้ยและแมลงระยะแรก', 'ชะล้างใบพืชเบา ๆ และหลีกเลี่ยงการให้น้ำตอนแดดจัด']);
  }
  if (humidStreak >= THRESHOLDS.highHumidityDays) {
    add('HIGH_HUMIDITY', 'medium', 'ความชื้นสูงต่อเนื่อง',
      'ความชื้นสัมพัทธ์สูงต่อเนื่องหลายวัน เสี่ยงโรคเชื้อราและใบไหม้ในพืช ควรระบายอากาศและตรวจแปลงสม่ำเสมอ',
      ['ตรวจอาการเชื้อราบนใบและผลทุก 2-3 วัน', 'ระบายอากาศในโรงเรือนและไม่รดน้ำช่วงเย็นค่ำ', 'ตัดแต่งส่วนที่เป็นโรคและนำไปทิ้งนอกแปลง']);
  }
  if (days.some((day) => day.windSpeedMs !== null && day.windSpeedMs >= THRESHOLDS.strongWindMs)) {
    add('STRONG_WIND', 'medium', 'ลมแรง',
      'ลมแรงในช่วงพยากรณ์ งดพ่นสารเคมีเพื่อไม่ให้ละอองปลิวไปแปลงข้างเคียง และงดเผาในที่โล่ง',
      ['งดพ่นสารเคมีและปุ๋ยผงช่วงลมแรง', 'ตรวจสอบหลังคาโรงเรือน คอกสัตว์ และตาข่ายกันลมให้แข็งแรง', 'งดเผาแปลงเกษตรเพื่อป้องกันไฟลุกลาม']);
  }
  if (wetStreak >= THRESHOLDS.prolongedRainDays) {
    add('PROLONGED_RAIN', 'low', 'มีฝนต่อเนื่องหลายวัน',
      'มีโอกาสฝนตกต่อเนื่องหลายวัน งดใส่ปุ๋ยเคมีล่วงหน้าและดูแลความชื้นในแปลงไม่ให้มากเกินไป',
      ['งดใส่ปุ๋ยเคมีก่อนฝนอย่างน้อย 48 ชั่วโมง', 'สังเกตน้ำขังตามร่องแปลงและระบายน้ำออก', 'ชะล้างโคลนและตะกอนออกจากใบหลังฝนหยุด']);
  }
  return [...found.values()].sort((left, right) =>
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || left.code.localeCompare(right.code));
}

/* ------------------------------------------------------------------ */
/* Request handling                                                     */
/* ------------------------------------------------------------------ */

function isRegionKey(value: string): value is RegionKey {
  return REGIONS.some((region) => region.key === value);
}

/**
 * Resolve `?provinceCode=` or `?region=` into one forecast view.
 * A province code wins when both arrive; exactly one selector is required.
 */
export async function buildWeatherOverview(url: URL, now = new Date()): Promise<WeatherOverview> {
  const provinceCode = parseText(url, 'provinceCode', 2);
  const regionParam = parseText(url, 'region', 20);
  let kind: 'province' | 'region';
  let code: string;
  let name: string;
  let region: RegionKey;

  if (provinceCode) {
    if (!/^\d{2}$/.test(provinceCode)) throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
    if (!await isSupportedProvinceCode(provinceCode)) throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
    kind = 'province';
    code = provinceCode;
    region = REGION_BY_PROVINCE[provinceCode];
    const provinces = await getProvinces();
    name = provinces.find((row) => row.code === provinceCode)?.name ?? provinceCode;
  } else if (regionParam) {
    if (!isRegionKey(regionParam)) throw new HubRequestError(400, 'INVALID_QUERY', 'ภาคที่ระบุไม่ถูกต้อง');
    kind = 'region';
    code = regionParam;
    region = regionParam;
    name = REGION_LABEL[regionParam];
  } else {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ต้องระบุ provinceCode หรือ region');
  }

  const issuedAt = todayIssuedAt(now);
  const days = sampleDays(region, kind === 'province' ? 'province:' + code : 'region:' + code, issuedAt);
  const cumulative = cumulativeRainfall(days, region);
  return {
    location: { kind, code, name, region, regionLabel: REGION_LABEL[region] },
    issuedAt,
    dataKind: 'sample',
    sample: true,
    source: SOURCE,
    units: FORECAST_UNITS,
    days,
    cumulative,
    advisories: buildAdvisories(days, cumulative),
  };
}
