import 'server-only';
import { HubRequestError } from './http';
import { getProvinces } from '../provinces';

/**
 * Climate history statistics (10-20 year windows, 77 provinces) for
 * `/climate-history` and `/api/v1/climate-history`.
 *
 * Governance rules kept from SYSTEM_DESIGN.md / agents.md:
 * - The Open-Meteo ERA5 archive resource still has `license_status: 'pending'`, so no
 *   upstream numeric value is fetched and no pending figure leaves this module. While
 *   the license review is open, every number produced here is a deterministic sample
 *   statistic seeded by (province code, year) and calibrated against ERA5-style
 *   climatology (regional temperature/rainfall normals, +0.32 °C/decade warming since
 *   1980, ENSO-like interannual cycles). Values are flagged `dataKind: 'sample'` and
 *   `sample: true`; the API layer labels access as `metadata_only`.
 * - "Province" values are grid-point statistics on the 0.25° ERA5 grid (~27 km), not
 *   station observations and not provincial coverage.
 * - The 77-province code list is a spatial reference registry, never a coverage claim.
 * - When the resource clears license review, replace the sample generator below with
 *   real archive aggregation; the exported response shape must not change.
 */

export const CLIMATE_HISTORY_VERSION = 'climate-history-era5-sample-v1';
export const CLIMATE_DEFAULT_START_YEAR = 2005;
export const CLIMATE_DEFAULT_END_YEAR = 2024;
export const CLIMATE_MIN_START_YEAR = 1980;
export const CLIMATE_MAX_END_YEAR = 2025;
export const CLIMATE_MIN_YEARS = 10;
export const CLIMATE_MAX_YEARS = 20;

export const CLIMATE_HISTORY_SOURCE = {
  sourceId: 'open_meteo',
  providerModel: 'era5',
  spatialSupport: 'grid_point',
  gridResolutionDeg: 0.25,
  gridNoteKm: 27,
  attribution: 'Weather data by Open-Meteo.com',
  attributionUrl: 'https://open-meteo.com/',
  license: 'CC-BY-4.0',
  licenseStatus: 'pending',
  archiveUrl: 'https://archive-api.open-meteo.com/v1/archive',
} as const;

export const CLIMATE_HISTORY_WARNINGS: string[] = [
  'ตัวเลขทั้งหมดในชุดนี้เป็นข้อมูลตัวอย่างจำลองจาก climatology ของ ERA5 ยังไม่ใช่ค่า reanalysis จริง เพราะทรัพยากรยังอยู่ระหว่างตรวจสิทธิ์การใช้งาน',
  'ค่าระดับจังหวัดเป็นค่าที่จุดกริดขนาด 0.25° (ประมาณ 27 กิโลเมตร) ไม่ใช่ค่าจากสถานีวัดจริงและไม่คลุมทั้งจังหวัด',
  'รหัส 77 จังหวัดเป็นทะเบียนอ้างอิงพื้นที่ ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด',
  'ขณะที่สิทธิ์การใช้งานยังเป็น pending ตัวเลขเหล่านี้ไม่ถือเป็นข้อมูลสาธารณะ ใช้เพื่อสาธิตโครงสร้างหน้าจอและ API เท่านั้น',
];

export type ClimateRegion = 'north' | 'northeast' | 'central' | 'east' | 'south';

export type ClimateYearStats = {
  year: number;
  tmeanC: number | null;
  tmaxMeanC: number | null;
  tminMeanC: number | null;
  /** Days with Tmax > 38 °C in that year. */
  hotDays38C: number;
  /** Accumulated rainfall for the whole year (mm). */
  rainfallTotalMm: number | null;
  /** Longest run of consecutive days with rainfall < 1 mm/day. */
  longestDrySpellDays: number;
  /** Number of dry-spell events lasting >= 5 days. */
  drySpellEvents5d: number;
};

export type ClimateNotableYear = {
  year: number;
  reason: 'hottest' | 'driest' | 'wettest' | 'most_hot_days' | 'longest_dry_spell';
  labelTh: string;
  value: number;
  unit: '°C' | 'mm' | 'วัน';
  /** Baseline mean temperature of the selected window (for °C entries) or null. */
  normalC: number | null;
  /** Baseline mean rainfall of the selected window (for mm entries) or null. */
  normalMm: number | null;
};

export type ClimateHistoryOverview = {
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
  dataKind: 'sample';
  sample: true;
  source: typeof CLIMATE_HISTORY_SOURCE;
  units: Record<string, string>;
  baseline: { tmeanNormalC: number; rainfallNormalMm: number; hotDaysNormal: number };
  /** Yearly stats ordered oldest -> newest. */
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
};

/* ------------------------------------------------------------------ */
/* Regional climatology used to calibrate the sample series            */
/* ------------------------------------------------------------------ */

const REGION_LABEL_TH: Record<ClimateRegion, string> = {
  north: 'ภาคเหนือ',
  northeast: 'ภาคตะวันออกเฉียงเหนือ',
  central: 'ภาคกลาง',
  east: 'ภาคตะวันออก',
  south: 'ภาคใต้',
};

const CLIMATE_UNITS: Record<string, string> = {
  temperature: '°C',
  rainfall: 'mm',
  hot_days: 'days',
  dry_spell: 'days',
};

/** Warming signal built into the sample series (°C per decade since 1980). */
const WARMING_C_PER_DECADE = 0.32;
const WARMING_REFERENCE_YEAR = 1980;
const TMAX_TMIN_SPLIT_C = 6.5;
const ENSO_AMPLITUDE_C = 0.25;
const RAIN_CYCLE_AMPLITUDE = 0.15;
const RAIN_NOISE_MM = 60;
/** tmean anomaly (vs window baseline) clamped before the exponential hot-day response. */
const HOT_DAYS_ANOMALY_CLAMP = 0.5;

const REGION_TMEAN_BASE_C: Record<ClimateRegion, number> = {
  north: 26.5,
  northeast: 27.9,
  central: 28.4,
  east: 28.6,
  south: 27.7,
};

const REGION_HOT_DAYS38_BASE: Record<ClimateRegion, number> = {
  north: 18,
  northeast: 22,
  central: 25,
  east: 20,
  south: 2,
};

const REGION_RAINFALL_BASE_MM: Record<ClimateRegion, number> = {
  north: 1200,
  northeast: 1450,
  central: 1200,
  east: 1600,
  south: 1900,
};

/* ------------------------------------------------------------------ */
/* Province centroid registry (copied from src/tadih/open_meteo.py)     */
/* ------------------------------------------------------------------ */

type ProvinceCentroid = { nameEn: string; lat: number; lon: number; region: ClimateRegion };

/** 77-province reference grid points; a registry, never a coverage claim. */
const PROVINCE_CENTROIDS: Record<string, ProvinceCentroid> = {
  '10': { nameEn: 'Bangkok', lat: 13.7563, lon: 100.5018, region: 'central' },
  '11': { nameEn: 'Samut Prakan', lat: 13.5991, lon: 100.5998, region: 'central' },
  '12': { nameEn: 'Nonthaburi', lat: 13.8621, lon: 100.5144, region: 'central' },
  '13': { nameEn: 'Pathum Thani', lat: 14.0208, lon: 100.5250, region: 'central' },
  '14': { nameEn: 'Phra Nakhon Si Ayutthaya', lat: 14.3532, lon: 100.5684, region: 'central' },
  '15': { nameEn: 'Ang Thong', lat: 14.5896, lon: 100.4550, region: 'central' },
  '16': { nameEn: 'Lop Buri', lat: 14.7995, lon: 100.6534, region: 'central' },
  '17': { nameEn: 'Sing Buri', lat: 14.8936, lon: 100.4015, region: 'central' },
  '18': { nameEn: 'Chai Nat', lat: 15.1852, lon: 100.1251, region: 'central' },
  '19': { nameEn: 'Saraburi', lat: 14.5289, lon: 100.9101, region: 'central' },
  '20': { nameEn: 'Chon Buri', lat: 13.3611, lon: 100.9847, region: 'east' },
  '21': { nameEn: 'Rayong', lat: 12.6814, lon: 101.2816, region: 'east' },
  '22': { nameEn: 'Chanthaburi', lat: 12.6114, lon: 102.1039, region: 'east' },
  '23': { nameEn: 'Trat', lat: 12.2428, lon: 102.5175, region: 'east' },
  '24': { nameEn: 'Chachoengsao', lat: 13.6904, lon: 101.0780, region: 'east' },
  '25': { nameEn: 'Prachin Buri', lat: 14.0509, lon: 101.3734, region: 'east' },
  '26': { nameEn: 'Nakhon Nayok', lat: 14.2069, lon: 101.2131, region: 'east' },
  '27': { nameEn: 'Sa Kaeo', lat: 13.8240, lon: 102.0646, region: 'east' },
  '30': { nameEn: 'Nakhon Ratchasima', lat: 14.9799, lon: 102.0978, region: 'northeast' },
  '31': { nameEn: 'Buri Ram', lat: 14.9930, lon: 103.1029, region: 'northeast' },
  '32': { nameEn: 'Surin', lat: 14.8818, lon: 103.4936, region: 'northeast' },
  '33': { nameEn: 'Si Sa Ket', lat: 15.1186, lon: 104.3220, region: 'northeast' },
  '34': { nameEn: 'Ubon Ratchathani', lat: 15.2449, lon: 104.8473, region: 'northeast' },
  '35': { nameEn: 'Yasothon', lat: 15.7926, lon: 104.1453, region: 'northeast' },
  '36': { nameEn: 'Chaiyaphum', lat: 15.8105, lon: 102.0315, region: 'northeast' },
  '37': { nameEn: 'Amnat Charoen', lat: 15.8584, lon: 104.6258, region: 'northeast' },
  '38': { nameEn: 'Bueng Kan', lat: 18.3609, lon: 103.6465, region: 'northeast' },
  '39': { nameEn: 'Nong Bua Lam Phu', lat: 17.2043, lon: 102.4410, region: 'northeast' },
  '40': { nameEn: 'Khon Kaen', lat: 16.4322, lon: 102.8236, region: 'northeast' },
  '41': { nameEn: 'Udon Thani', lat: 17.4138, lon: 102.7872, region: 'northeast' },
  '42': { nameEn: 'Loei', lat: 17.4860, lon: 101.7223, region: 'northeast' },
  '43': { nameEn: 'Nong Khai', lat: 17.8783, lon: 102.7420, region: 'northeast' },
  '44': { nameEn: 'Maha Sarakham', lat: 16.1851, lon: 103.3007, region: 'northeast' },
  '45': { nameEn: 'Roi Et', lat: 16.0538, lon: 103.6520, region: 'northeast' },
  '46': { nameEn: 'Kalasin', lat: 16.4328, lon: 103.5065, region: 'northeast' },
  '47': { nameEn: 'Sakon Nakhon', lat: 17.1546, lon: 104.1486, region: 'northeast' },
  '48': { nameEn: 'Nakhon Phanom', lat: 17.4077, lon: 104.7801, region: 'northeast' },
  '49': { nameEn: 'Mukdahan', lat: 16.5434, lon: 104.7235, region: 'northeast' },
  '50': { nameEn: 'Chiang Mai', lat: 18.7953, lon: 98.9620, region: 'north' },
  '51': { nameEn: 'Lamphun', lat: 18.5745, lon: 99.0087, region: 'north' },
  '52': { nameEn: 'Lampang', lat: 18.2888, lon: 99.4928, region: 'north' },
  '53': { nameEn: 'Uttaradit', lat: 17.6201, lon: 100.0993, region: 'north' },
  '54': { nameEn: 'Phrae', lat: 18.1446, lon: 100.1403, region: 'north' },
  '55': { nameEn: 'Nan', lat: 18.7756, lon: 100.7730, region: 'north' },
  '56': { nameEn: 'Phayao', lat: 19.1664, lon: 99.9022, region: 'north' },
  '57': { nameEn: 'Chiang Rai', lat: 19.9072, lon: 99.8325, region: 'north' },
  '58': { nameEn: 'Mae Hong Son', lat: 19.3020, lon: 97.9654, region: 'north' },
  '60': { nameEn: 'Nakhon Sawan', lat: 15.7047, lon: 100.1371, region: 'north' },
  '61': { nameEn: 'Uthai Thani', lat: 15.3835, lon: 100.0245, region: 'north' },
  '62': { nameEn: 'Kamphaeng Phet', lat: 16.4828, lon: 99.5227, region: 'north' },
  '63': { nameEn: 'Tak', lat: 16.8839, lon: 99.1259, region: 'north' },
  '64': { nameEn: 'Sukhothai', lat: 17.0078, lon: 99.8235, region: 'north' },
  '65': { nameEn: 'Phitsanulok', lat: 16.8211, lon: 100.2659, region: 'north' },
  '66': { nameEn: 'Phichit', lat: 16.4429, lon: 100.3488, region: 'north' },
  '67': { nameEn: 'Phetchabun', lat: 16.4190, lon: 101.1566, region: 'north' },
  '70': { nameEn: 'Ratchaburi', lat: 13.5283, lon: 99.8134, region: 'central' },
  '71': { nameEn: 'Kanchanaburi', lat: 13.9984, lon: 99.5328, region: 'central' },
  '72': { nameEn: 'Suphan Buri', lat: 14.4745, lon: 100.1177, region: 'central' },
  '73': { nameEn: 'Nakhon Pathom', lat: 13.8196, lon: 100.0443, region: 'central' },
  '74': { nameEn: 'Samut Sakhon', lat: 13.5475, lon: 100.2744, region: 'central' },
  '75': { nameEn: 'Samut Songkhram', lat: 13.4098, lon: 99.9997, region: 'central' },
  '76': { nameEn: 'Phetchaburi', lat: 13.1114, lon: 99.9391, region: 'central' },
  '77': { nameEn: 'Prachuap Khiri Khan', lat: 11.8124, lon: 99.7972, region: 'central' },
  '80': { nameEn: 'Nakhon Si Thammarat', lat: 8.4304, lon: 99.9631, region: 'south' },
  '81': { nameEn: 'Krabi', lat: 8.0863, lon: 98.9063, region: 'south' },
  '82': { nameEn: 'Phangnga', lat: 8.4501, lon: 98.5255, region: 'south' },
  '83': { nameEn: 'Phuket', lat: 7.8804, lon: 98.3923, region: 'south' },
  '84': { nameEn: 'Surat Thani', lat: 9.1382, lon: 99.3217, region: 'south' },
  '85': { nameEn: 'Ranong', lat: 9.9658, lon: 98.6348, region: 'south' },
  '86': { nameEn: 'Chumphon', lat: 10.4930, lon: 99.1800, region: 'south' },
  '90': { nameEn: 'Songkhla', lat: 7.1756, lon: 100.6143, region: 'south' },
  '91': { nameEn: 'Satun', lat: 6.6238, lon: 100.0674, region: 'south' },
  '92': { nameEn: 'Trang', lat: 7.5563, lon: 99.6114, region: 'south' },
  '93': { nameEn: 'Phatthalung', lat: 7.6166, lon: 100.0740, region: 'south' },
  '94': { nameEn: 'Pattani', lat: 6.8696, lon: 101.2539, region: 'south' },
  '95': { nameEn: 'Yala', lat: 6.5411, lon: 101.2813, region: 'south' },
  '96': { nameEn: 'Narathiwat', lat: 6.4255, lon: 101.8253, region: 'south' },
};

// Fail closed if the registry drifts: the module must always describe exactly 77 provinces.
const REGISTERED_PROVINCE_COUNT = Object.keys(PROVINCE_CENTROIDS).length;
if (REGISTERED_PROVINCE_COUNT !== 77) {
  throw new Error(`Climate history province registry must hold exactly 77 provinces, found ${REGISTERED_PROVINCE_COUNT}`);
}

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

/** FNV-1a so the same province code and year always reproduce the same values. */
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

function meanOf(values: Array<number | null>): number {
  const known = values.filter((value): value is number => value !== null);
  if (!known.length) return 0;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

/** Least-squares slope over yearly index positions, scaled to a per-decade rate. */
function slopePerDecade(values: Array<number | null>): number {
  const known: { index: number; value: number }[] = [];
  values.forEach((value, index) => {
    if (value !== null) known.push({ index, value });
  });
  const count = known.length;
  if (count < 2) return 0;
  const indexMean = known.reduce((sum, pair) => sum + pair.index, 0) / count;
  const valueMean = known.reduce((sum, pair) => sum + pair.value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (const pair of known) {
    numerator += (pair.index - indexMean) * (pair.value - valueMean);
    denominator += (pair.index - indexMean) ** 2;
  }
  if (denominator === 0) return 0;
  return (numerator / denominator) * 10;
}

function fiveYearMean(values: Array<number | null>, fromStart: boolean): number {
  return meanOf(fromStart ? values.slice(0, 5) : values.slice(-5));
}

/** First extreme row in ascending-year order (deterministic tie-break). */
function extremeRow(
  rows: ClimateYearStats[],
  pick: (row: ClimateYearStats) => number | null,
  mode: 'max' | 'min',
): ClimateYearStats | null {
  let best: ClimateYearStats | null = null;
  let bestValue = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    if (best === null || (mode === 'max' ? value > bestValue : value < bestValue)) {
      best = row;
      bestValue = value;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Sample generation (license_status: 'pending' -> deterministic demo)  */
/* ------------------------------------------------------------------ */

type ClimateProfile = {
  tempOffsetC: number;
  ensoPhaseRad: number;
  ensoPeriodYears: number;
  rainOffsetFraction: number;
  rainPhaseRad: number;
  rainPeriodYears: number;
  drySpellBaseDays: number;
};

/** Per-province constants derived once from the province code (never from wall-clock time). */
function climateProfile(code: string): ClimateProfile {
  const random = mulberry32(seedFrom('climate-history|' + code + '|profile'));
  return {
    tempOffsetC: (random() * 2 - 1) * 0.4,
    ensoPhaseRad: random() * Math.PI * 2,
    ensoPeriodYears: 3.5 + random() * 3,
    rainOffsetFraction: (random() * 2 - 1) * 0.1,
    rainPhaseRad: random() * Math.PI * 2,
    rainPeriodYears: 4 + random() * 4,
    drySpellBaseDays: 12 + random() * 4,
  };
}

type SampleYearCore = {
  tmeanC: number;
  tmaxMeanC: number;
  tminMeanC: number;
  rainfallTotalMm: number;
  hotDaysNoise: number;
  drySpellNoise: number;
  drySpellEventNoise: number;
};

/**
 * One PRNG per (province, year) with a fixed draw order: the same (code, year) always
 * yields the same numbers regardless of the requested window.
 */
function sampleYearCore(code: string, profile: ClimateProfile, region: ClimateRegion, year: number): SampleYearCore {
  const random = mulberry32(seedFrom('climate-history|' + code + '|' + String(year)));
  const warmingC = WARMING_C_PER_DECADE * ((year - WARMING_REFERENCE_YEAR) / 10);
  const ensoC = ENSO_AMPLITUDE_C
    * Math.sin((2 * Math.PI * (year - WARMING_REFERENCE_YEAR)) / profile.ensoPeriodYears + profile.ensoPhaseRad);
  const tmeanC = round(
    REGION_TMEAN_BASE_C[region] + profile.tempOffsetC + warmingC + ensoC + (random() * 2 - 1) * 0.3,
    1,
  );
  const tmaxNoise = (random() * 2 - 1) * 0.6;
  const tminNoise = (random() * 2 - 1) * 0.6;
  const tmaxMeanC = round(tmeanC + TMAX_TMIN_SPLIT_C + tmaxNoise, 1);
  const tminMeanC = round(tmeanC - TMAX_TMIN_SPLIT_C + tminNoise, 1);
  const wetDryCycle = RAIN_CYCLE_AMPLITUDE
    * Math.sin((2 * Math.PI * (year - WARMING_REFERENCE_YEAR)) / profile.rainPeriodYears + profile.rainPhaseRad);
  const rainfallTotalMm = Math.max(400, Math.round(
    REGION_RAINFALL_BASE_MM[region] * (1 + profile.rainOffsetFraction) * (1 + wetDryCycle)
    + (random() * 2 - 1) * RAIN_NOISE_MM,
  ));
  const hotDaysNoise = (random() * 2 - 1) * 2;
  const drySpellNoise = (random() * 2 - 1) * 1.5;
  const drySpellEventNoise = (random() * 2 - 1) * 0.8;
  return { tmeanC, tmaxMeanC, tminMeanC, rainfallTotalMm, hotDaysNoise, drySpellNoise, drySpellEventNoise };
}

/* ------------------------------------------------------------------ */
/* Query validation                                                     */
/* ------------------------------------------------------------------ */

function parseYearParam(raw: string | null, fallback: number, labelTh: string): number {
  if (raw === null || raw.trim() === '') return fallback;
  const value = raw.trim();
  if (!/^\d{4}$/.test(value)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ปี' + labelTh + 'ไม่ถูกต้อง ต้องเป็น ค.ศ. 4 หลัก');
  }
  return Number(value);
}

export function validateClimateHistoryQuery(params: {
  provinceCode: string;
  startYear: string | null;
  endYear: string | null;
}): { provinceCode: string; startYear: number; endYear: number } {
  const provinceCode = params.provinceCode.trim();
  if (!/^\d{2}$/.test(provinceCode) || !PROVINCE_CENTROIDS[provinceCode]) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง ต้องเป็นรหัส 2 หลักตามทะเบียน 77 จังหวัด');
  }
  const startYear = parseYearParam(params.startYear, CLIMATE_DEFAULT_START_YEAR, 'เริ่มต้น');
  const endYear = parseYearParam(params.endYear, CLIMATE_DEFAULT_END_YEAR, 'สิ้นสุด');
  if (startYear < CLIMATE_MIN_START_YEAR) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ปีเริ่มต้นต้องไม่น้อยกว่า ' + CLIMATE_MIN_START_YEAR);
  }
  if (endYear > CLIMATE_MAX_END_YEAR) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ปีสิ้นสุดต้องไม่มากกว่า ' + CLIMATE_MAX_END_YEAR);
  }
  if (endYear < startYear) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ปีสิ้นสุดต้องไม่น้อยกว่าปีเริ่มต้น');
  }
  const span = endYear - startYear + 1;
  if (span < CLIMATE_MIN_YEARS) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ต้องเลือกช่วงข้อมูลอย่างน้อย ' + CLIMATE_MIN_YEARS + ' ปี');
  }
  if (span > CLIMATE_MAX_YEARS) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'เลือกช่วงข้อมูลได้ไม่เกิน ' + CLIMATE_MAX_YEARS + ' ปี');
  }
  return { provinceCode, startYear, endYear };
}

/* ------------------------------------------------------------------ */
/* Overview assembly                                                    */
/* ------------------------------------------------------------------ */

export async function buildClimateHistoryOverview(params: {
  provinceCode: string;
  startYear: number;
  endYear: number;
}): Promise<ClimateHistoryOverview> {
  const { provinceCode, startYear, endYear } = params;
  const centroid = PROVINCE_CENTROIDS[provinceCode];
  if (!centroid) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง ต้องเป็นรหัส 2 หลักตามทะเบียน 77 จังหวัด');
  }
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ช่วงปีไม่ถูกต้อง');
  }

  const provinces = await getProvinces();
  const nameTh = provinces.find((row) => row.code === provinceCode)?.name ?? centroid.nameEn;
  const region = centroid.region;
  const profile = climateProfile(provinceCode);

  // Pass 1: seeded per-year temperature and rainfall series.
  const cores: SampleYearCore[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    cores.push(sampleYearCore(provinceCode, profile, region, year));
  }
  const tmeanNormal = meanOf(cores.map((core) => core.tmeanC));
  const rainfallNormal = meanOf(cores.map((core) => core.rainfallTotalMm));

  // Pass 2: window-relative anomalies drive hot days and dry spells so the selected
  // period is always summarised against its own baseline (climate-normal practice).
  const years: ClimateYearStats[] = cores.map((core, index) => {
    const tmeanAnomaly = clamp(core.tmeanC - tmeanNormal, -HOT_DAYS_ANOMALY_CLAMP, HOT_DAYS_ANOMALY_CLAMP);
    const hotDays38C = Math.max(0, Math.round(
      REGION_HOT_DAYS38_BASE[region] * Math.exp(tmeanAnomaly * 3) + core.hotDaysNoise,
    ));
    const rainfallAnomaly = rainfallNormal > 0 ? (core.rainfallTotalMm - rainfallNormal) / rainfallNormal : 0;
    const longestDrySpellDays = clamp(
      Math.round(profile.drySpellBaseDays * (1 - rainfallAnomaly * 1.6) + core.drySpellNoise),
      4,
      45,
    );
    const drySpellEvents5d = Math.max(0, Math.round(longestDrySpellDays / 4 + core.drySpellEventNoise));
    return {
      year: startYear + index,
      tmeanC: core.tmeanC,
      tmaxMeanC: core.tmaxMeanC,
      tminMeanC: core.tminMeanC,
      hotDays38C,
      rainfallTotalMm: core.rainfallTotalMm,
      longestDrySpellDays,
      drySpellEvents5d,
    };
  });

  const tmeanSeries = years.map((row) => row.tmeanC);
  const rainfallSeries = years.map((row) => row.rainfallTotalMm);
  const hotDaysSeries = years.map((row) => row.hotDays38C);

  const baseline = {
    tmeanNormalC: round(tmeanNormal, 1),
    rainfallNormalMm: round(rainfallNormal, 0),
    hotDaysNormal: round(meanOf(hotDaysSeries), 1),
  };

  const firstFiveYearMeanC = round(fiveYearMean(tmeanSeries, true), 2);
  const lastFiveYearMeanC = round(fiveYearMean(tmeanSeries, false), 2);
  const trends = {
    tmeanPerDecadeC: round(slopePerDecade(tmeanSeries), 2),
    tmaxPerDecadeC: round(slopePerDecade(years.map((row) => row.tmaxMeanC)), 2),
    hotDaysPerDecade: round(slopePerDecade(hotDaysSeries), 2),
    rainfallTrendMmPerDecade: round(slopePerDecade(rainfallSeries), 1),
    firstFiveYearMeanC,
    lastFiveYearMeanC,
    warmingDeltaC: round(lastFiveYearMeanC - firstFiveYearMeanC, 2),
  };

  const hottest = extremeRow(years, (row) => row.tmeanC, 'max');
  const mostHotDays = extremeRow(years, (row) => row.hotDays38C, 'max');
  const driest = extremeRow(years, (row) => row.rainfallTotalMm, 'min');
  const wettest = extremeRow(years, (row) => row.rainfallTotalMm, 'max');
  const longestSpell = extremeRow(years, (row) => row.longestDrySpellDays, 'max');

  const notableYears: ClimateNotableYear[] = [];
  if (hottest && hottest.tmeanC !== null) {
    notableYears.push({
      year: hottest.year,
      reason: 'hottest',
      labelTh: 'ร้อนที่สุด',
      value: hottest.tmeanC,
      unit: '°C',
      normalC: baseline.tmeanNormalC,
      normalMm: null,
    });
  }
  if (mostHotDays) {
    notableYears.push({
      year: mostHotDays.year,
      reason: 'most_hot_days',
      labelTh: 'วันร้อนจัดมากที่สุด',
      value: mostHotDays.hotDays38C,
      unit: 'วัน',
      normalC: null,
      normalMm: null,
    });
  }
  if (driest && driest.rainfallTotalMm !== null) {
    notableYears.push({
      year: driest.year,
      reason: 'driest',
      labelTh: 'ฝนน้อยที่สุด (แล้ง)',
      value: driest.rainfallTotalMm,
      unit: 'mm',
      normalC: null,
      normalMm: baseline.rainfallNormalMm,
    });
  }
  if (wettest && wettest.rainfallTotalMm !== null) {
    notableYears.push({
      year: wettest.year,
      reason: 'wettest',
      labelTh: 'ฝนมากที่สุด',
      value: wettest.rainfallTotalMm,
      unit: 'mm',
      normalC: null,
      normalMm: baseline.rainfallNormalMm,
    });
  }
  if (longestSpell) {
    notableYears.push({
      year: longestSpell.year,
      reason: 'longest_dry_spell',
      labelTh: 'ฝนทิ้งช่วงยาวที่สุด',
      value: longestSpell.longestDrySpellDays,
      unit: 'วัน',
      normalC: null,
      normalMm: null,
    });
  }

  return {
    location: {
      code: provinceCode,
      nameTh,
      nameEn: centroid.nameEn,
      region,
      regionLabelTh: REGION_LABEL_TH[region],
      grid: {
        latitude: centroid.lat,
        longitude: centroid.lon,
        resolutionDeg: CLIMATE_HISTORY_SOURCE.gridResolutionDeg,
        support: 'grid_point',
      },
    },
    startYear,
    endYear,
    yearsSpan: endYear - startYear + 1,
    yearsWithData: years.length,
    dataKind: 'sample',
    sample: true,
    source: CLIMATE_HISTORY_SOURCE,
    units: CLIMATE_UNITS,
    baseline,
    years,
    trends,
    notableYears,
  };
}
