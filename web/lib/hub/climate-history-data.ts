import 'server-only';
import { HubRequestError } from './http';
import { getProvinces } from '../provinces';
import {
  ERA5_ARCHIVE_RESOURCE_ID,
  ERA5_CLIMATE_METRICS,
  readEra5PublishedDays,
  type Era5PublishedRead,
  type PublishedObservationReader,
} from './climate-history-store';
import { readReviewedEra5Cache, type ReviewedEra5CacheRead } from './climate-history-cache';

/**
 * Climate history statistics (10-20 year windows, 77 provinces) for
 * `/climate-history` and `/api/v1/climate-history`.
 *
 * Governance rules kept from SYSTEM_DESIGN.md / agents.md:
 * - Every number emitted by `buildClimateHistoryOverview` is a REAL ERA5 value,
 *   read either from the active published D1 batch of
 *   `open_meteo_thailand_era5_archive` (approved_public, CC BY 4.0) or from the
 *   five reviewed full-calendar-year snapshots the existing ingest already
 *   fetched (2016-2025, daily rainfall / Tmax / ET0 at one grid point each).
 *   When neither holds rows for the requested province and window the response
 *   is the honest `dataKind:'empty'` branch — never a generated statistic.
 * - One response describes exactly ONE grid cell (0.25° ERA5, ~27 km). Values
 *   are never merged across cells and are never provincial averages; the 77
 *   province codes are a coordinate registry, not a coverage claim.
 * - Missing stays null: years with no rows are absent (listed in `scope`), and
 *   partial-coverage years never claim full-year totals or extremes.
 * - The deterministic sample generator below is retained only for offline
 *   visual development; the public API never returns it.
 */

export const CLIMATE_HISTORY_VERSION = 'climate-history-era5-real-v2';
export const CLIMATE_DEFAULT_START_YEAR = 2005;
export const CLIMATE_DEFAULT_END_YEAR = 2024;
export const CLIMATE_MIN_START_YEAR = 1980;
// 2026: the active published D1 ERA5 batch covers 2026-10-13..19 (province 73).
export const CLIMATE_MAX_END_YEAR = 2026;
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
  licenseStatus: 'approved_public',
  archiveUrl: 'https://archive-api.open-meteo.com/v1/archive',
} as const;

export const CLIMATE_HISTORY_WARNINGS: string[] = [
  'ยังไม่มีชุดข้อมูลที่ครอบคลุมช่วง 10–20 ปีที่หน้านี้ต้องใช้ จึงไม่ส่งค่าภูมิอากาศตัวอย่างออกจาก API',
  'ค่าระดับจังหวัดเป็นค่าที่จุดกริดขนาด 0.25° (ประมาณ 27 กิโลเมตร) ไม่ใช่ค่าจากสถานีวัดจริงและไม่คลุมทั้งจังหวัด',
  'รหัส 77 จังหวัดเป็นทะเบียนอ้างอิงพื้นที่ ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด',
  'CHIRPS ที่เผยแพร่มีเพียง 3 grid cells ของวันเดียว จึงใช้แทนประวัติภูมิอากาศหรือค่าเฉลี่ยจังหวัดไม่ได้',
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
  source: typeof CLIMATE_HISTORY_SOURCE;
  units: Record<string, string>;
};

type ClimateHistoryNumericSummary = {
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
};

type ClimateHistoryEmptySummary = {
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
};

/** Yearly statistics computed only from real daily rows; counts show the exact grain. */
export type ClimateRealYearStats = {
  year: number;
  tmeanC: number | null;
  tmaxMeanC: number | null;
  tminMeanC: number | null;
  /** Days with Tmax > 38 °C among the days that carry a Tmax value (null if none). */
  hotDays38C: number | null;
  /** Sum of published daily rainfall (mm); partial years sum only their own days. */
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
  /** True when Tmax and rainfall cover every calendar day without nulls. */
  completeYear: boolean;
};

export type ClimateHistoryScope = {
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
  /** Years inside the requested window that hold no published/verified rows. */
  yearsMissing: number[];
  firstDayWithData: string | null;
  lastDayWithData: string | null;
  dailyRowsRead: number;
  /** True when the bounded walk stopped before reading everything the store reported. */
  rowsCapped: boolean;
  /** Measures this grid point actually publishes; absent ones are null, never 0. */
  variablesPublished: string[];
  variablesNotPublishedHere: string[];
  grainNoteTh: string;
  /** Cache partitions that failed structural verification, with the reason. */
  rejectedCacheYears: { year: number; reason: string }[];
};

export type ClimateHistoryProvenance = {
  sourceId: 'open_meteo';
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
  /** Snapshot checksums backing a reviewed-cache response. */
  cacheChecksums: string[];
  cacheRetrievedAtFirst: string | null;
  cacheRetrievedAtLast: string | null;
};

export type ClimateHistoryOverview = ClimateHistoryOverviewBase & (
  | ({ dataKind: 'sample'; sample: true } & ClimateHistoryNumericSummary)
  | ({ dataKind: 'empty'; sample: false } & ClimateHistoryEmptySummary)
  | ({
      dataKind: 'real';
      sample: false;
      years: ClimateRealYearStats[];
      baseline: { tmeanNormalC: number | null; tmaxNormalC: number | null; rainfallNormalMm: number | null; hotDaysNormal: number | null };
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
    })
);

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
/* Deterministic sample generation until D1 has enough historical coverage. */
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
/* Real ERA5 daily aggregation (null-preserving, single grid cell)      */
/* ------------------------------------------------------------------ */

/** One normalized day of the served grid cell; undefined = the tier never publishes it. */
type RealDayRecord = {
  date: string;
  tmean?: number | null;
  tmax?: number | null;
  tmin?: number | null;
  precip?: number | null;
};

function daysInYear(year: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

function knownNumbers(records: RealDayRecord[], pick: (day: RealDayRecord) => number | null | undefined): number[] {
  const values: number[] = [];
  for (const record of records) {
    const value = pick(record);
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }
  return values;
}

function meanKnown(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundOrNull(value: number | null, digits: number): number | null {
  return value === null ? null : round(value, digits);
}

/** Least-squares decade trend over the real yearly positions; null unless 2+ known years. */
function trendPerDecade(points: Array<{ year: number; value: number }>): number | null {
  if (points.length < 2) return null;
  const yearMean = points.reduce((sum, point) => sum + point.year, 0) / points.length;
  const valueMean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.year - yearMean) * (point.value - valueMean);
    denominator += (point.year - yearMean) ** 2;
  }
  if (denominator === 0) return null;
  return (numerator / denominator) * 10;
}

function trendFromRows(
  rows: ClimateRealYearStats[],
  pick: (row: ClimateRealYearStats) => number | null,
  digits: number,
): number | null {
  const points: { year: number; value: number }[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (value !== null) points.push({ year: row.year, value });
  }
  return roundOrNull(trendPerDecade(points), digits);
}

/** Mean of the first/last five known yearly values; null when the series is empty. */
function edgeFiveYearMean(values: Array<number | null>, fromStart: boolean): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (!known.length) return null;
  const slice = fromStart ? known.slice(0, 5) : known.slice(-5);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

/**
 * Dry-spell statistics over the days the cell actually publishes. A day without
 * a rainfall value (or with a null one) breaks any run: a dry streak is only
 * counted when every day in it was published with rainfall < 1 mm.
 */
function drySpellStats(records: RealDayRecord[]): { longest: number | null; events5d: number | null } {
  const published = records.filter((record) => record.precip !== undefined);
  if (!published.length) return { longest: null, events5d: null };
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  let longest = 0;
  let events = 0;
  let previousDry = false;
  let previousDate: string | null = null;
  for (const record of sorted) {
    const dry = typeof record.precip === 'number' && record.precip < 1;
    if (dry) {
      const consecutive = previousDry
        && previousDate !== null
        && Date.parse(record.date) - Date.parse(previousDate) === 86_400_000;
      run = consecutive ? run + 1 : 1;
      if (run > longest) longest = run;
    } else {
      if (run >= 5) events += 1;
      run = 0;
    }
    previousDry = dry;
    previousDate = record.date;
  }
  if (run >= 5) events += 1;
  return { longest, events5d: events };
}

function aggregateRealYear(year: number, records: RealDayRecord[]): ClimateRealYearStats {
  const calendarDays = daysInYear(year);
  const tmeanVals = knownNumbers(records, (day) => day.tmean);
  const tmaxVals = knownNumbers(records, (day) => day.tmax);
  const tminVals = knownNumbers(records, (day) => day.tmin);
  const precipVals = knownNumbers(records, (day) => day.precip);
  const dry = drySpellStats(records);
  return {
    year,
    tmeanC: roundOrNull(meanKnown(tmeanVals), 2),
    tmaxMeanC: roundOrNull(meanKnown(tmaxVals), 2),
    tminMeanC: roundOrNull(meanKnown(tminVals), 2),
    hotDays38C: tmaxVals.length ? tmaxVals.filter((value) => value > 38).length : null,
    rainfallTotalMm: precipVals.length ? round(precipVals.reduce((sum, value) => sum + value, 0), 1) : null,
    longestDrySpellDays: dry.longest,
    drySpellEvents5d: dry.events5d,
    calendarDays,
    daysWithData: {
      temperatureMean: tmeanVals.length,
      temperatureMax: tmaxVals.length,
      temperatureMin: tminVals.length,
      precipitation: precipVals.length,
    },
    // A year may claim full-calendar coverage only when Tmax and rainfall exist
    // for every single calendar day; partial batches stay honestly false.
    completeYear: records.length === calendarDays
      && tmaxVals.length === calendarDays
      && precipVals.length === calendarDays,
  };
}

function normalizeStoreRead(read: Era5PublishedRead): {
  byYear: Map<number, RealDayRecord[]>;
  metricSeen: Set<string>;
} {
  const byYear = new Map<number, RealDayRecord[]>();
  const metricSeen = new Set<string>();
  for (const [day, entry] of read.days) {
    const year = Number(day.slice(0, 4));
    const record: RealDayRecord = { date: day };
    if ('t2m_mean_c' in entry.values) {
      record.tmean = entry.values.t2m_mean_c ?? null;
      metricSeen.add('t2m_mean_c');
    }
    if ('t2m_max_c' in entry.values) {
      record.tmax = entry.values.t2m_max_c ?? null;
      metricSeen.add('t2m_max_c');
    }
    if ('t2m_min_c' in entry.values) {
      record.tmin = entry.values.t2m_min_c ?? null;
      metricSeen.add('t2m_min_c');
    }
    if ('precip_mm' in entry.values) {
      record.precip = entry.values.precip_mm ?? null;
      metricSeen.add('precip_mm');
    }
    const bucket = byYear.get(year);
    if (bucket) bucket.push(record);
    else byYear.set(year, [record]);
  }
  return { byYear, metricSeen };
}

function normalizeCacheRead(cache: ReviewedEra5CacheRead): Map<number, RealDayRecord[]> {
  const byYear = new Map<number, RealDayRecord[]>();
  for (const series of cache.years) {
    // The cache tier publishes daily rainfall / Tmax / ET0 only; Tmean and Tmin
    // stay undefined (absent) rather than being approximated from Tmax.
    byYear.set(series.year, series.days.map((day) => ({
      date: day.date,
      tmax: day.temperatureMaxC,
      precip: day.precipitationMm,
    })));
  }
  return byYear;
}

function extremeRealRow(
  rows: ClimateRealYearStats[],
  pick: (row: ClimateRealYearStats) => number | null,
  mode: 'max' | 'min',
): { row: ClimateRealYearStats; value: number } | null {
  let best: { row: ClimateRealYearStats; value: number } | null = null;
  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    if (best === null || (mode === 'max' ? value > best.value : value < best.value)) {
      best = { row, value };
    }
  }
  return best;
}

/**
 * Baseline, trends and notable years use only complete calendar years, so a
 * seven-day published batch can never masquerade as an annual total. That rule
 * is applied inline in `buildClimateHistoryOverview` below.
 */

export type ClimateHistoryReadOptions = {
  /** Injected for tests; production defaults to the published D1 reader. */
  storeReader?: PublishedObservationReader;
  /** Overrides the reviewed-snapshot root; production uses data/local/raw/open_meteo. */
  cacheRoot?: string;
};

export async function buildClimateHistoryOverview(params: {
  provinceCode: string;
  startYear: number;
  endYear: number;
}, options: ClimateHistoryReadOptions = {}): Promise<ClimateHistoryOverview> {
  const { provinceCode, startYear, endYear } = validateClimateHistoryQuery({
    provinceCode: params.provinceCode,
    startYear: String(params.startYear),
    endYear: String(params.endYear),
  });
  const centroid = PROVINCE_CENTROIDS[provinceCode];
  const provinces = await getProvinces();
  const nameTh = provinces.find((row) => row.code === provinceCode)?.name ?? centroid.nameEn;
  const location = {
    code: provinceCode,
    nameTh,
    nameEn: centroid.nameEn,
    region: centroid.region,
    regionLabelTh: REGION_LABEL_TH[centroid.region],
    grid: {
      latitude: centroid.lat,
      longitude: centroid.lon,
      resolutionDeg: CLIMATE_HISTORY_SOURCE.gridResolutionDeg,
      support: 'grid_point' as const,
    },
  };
  const base = {
    location,
    startYear,
    endYear,
    yearsSpan: endYear - startYear + 1,
    source: CLIMATE_HISTORY_SOURCE,
    units: CLIMATE_UNITS,
  };

  let storeRead: Era5PublishedRead | null = null;
  try {
    storeRead = await readEra5PublishedDays(
      provinceCode,
      startYear,
      endYear,
      options.storeReader ? { reader: options.storeReader } : {},
    );
  } catch {
    // D1 unreachable (no token locally, network failure): stay honest, never fabricate.
    storeRead = null;
  }
  let cacheRead: ReviewedEra5CacheRead | null = null;
  try {
    cacheRead = await readReviewedEra5Cache(
      provinceCode,
      startYear,
      endYear,
      options.cacheRoot ? { root: options.cacheRoot } : {},
    );
  } catch {
    cacheRead = null;
  }

  const store = storeRead ? normalizeStoreRead(storeRead) : null;
  const storeYears = store ? store.byYear.size : 0;
  const cacheYears = cacheRead ? cacheRead.years.length : 0;

  if (storeYears === 0 && cacheYears === 0) {
    return {
      ...base,
      yearsWithData: 0,
      dataKind: 'empty',
      sample: false,
      baseline: { tmeanNormalC: null, rainfallNormalMm: null, hotDaysNormal: null },
      years: [],
      trends: {
        tmeanPerDecadeC: null,
        tmaxPerDecadeC: null,
        hotDaysPerDecade: null,
        rainfallTrendMmPerDecade: null,
        firstFiveYearMeanC: null,
        lastFiveYearMeanC: null,
        warmingDeltaC: null,
      },
      notableYears: [],
    };
  }

  // Never merge tiers: serve the tier that actually holds more years in the
  // window (D1 published batch wins ties because it is the governed store).
  const useStore = storeYears > 0 && storeYears >= cacheYears;
  const byYear = useStore ? store!.byYear : normalizeCacheRead(cacheRead!);
  const years = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, records]) => aggregateRealYear(year, records));

  const windowYears: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) windowYears.push(year);
  const yearsMissing = windowYears.filter((year) => !byYear.has(year));

  const allDates: string[] = [];
  for (const records of byYear.values()) {
    for (const record of records) allDates.push(record.date);
  }
  allDates.sort((a, b) => a.localeCompare(b));
  const dailyRowsRead = allDates.length;

  let scope: ClimateHistoryScope;
  let provenance: ClimateHistoryProvenance;
  let dataAsOf: string | null;

  if (useStore && storeRead) {
    const published = ERA5_CLIMATE_METRICS.filter((metric) => store!.metricSeen.has(metric));
    scope = {
      tier: 'd1_published_batch',
      gridPoint: {
        areaLabelTh: `จุดศูนย์กลางจังหวัด${nameTh}`,
        requestedLatitude: storeRead.point.requestedLatitude ?? centroid.lat,
        requestedLongitude: storeRead.point.requestedLongitude ?? centroid.lon,
        providerGridLatitude: storeRead.point.gridLatitude ?? null,
        providerGridLongitude: storeRead.point.gridLongitude ?? null,
        resolutionDeg: CLIMATE_HISTORY_SOURCE.gridResolutionDeg,
        support: 'grid_point',
      },
      yearsWithData: years.length,
      yearsMissing,
      firstDayWithData: allDates[0] ?? null,
      lastDayWithData: allDates[allDates.length - 1] ?? null,
      dailyRowsRead: storeRead.rowsRead,
      rowsCapped: storeRead.capped,
      variablesPublished: [...published],
      variablesNotPublishedHere: ERA5_CLIMATE_METRICS.filter((metric) => !store!.metricSeen.has(metric)),
      grainNoteTh: 'อ่านจาก run ตัวเลขที่เผยแพร่ใน D1 (สถานะ run ที่เก็บตามบรรทัดจริง) — ครอบคลุมเฉพาะวันที่ run นั้นมี ไม่ใช่ทั้งช่วงปีที่เลือก',
      // Cache partitions that exist but failed verification still deserve to be visible.
      rejectedCacheYears: cacheRead ? cacheRead.rejected : [],
    };
    provenance = {
      sourceId: 'open_meteo',
      resourceId: ERA5_ARCHIVE_RESOURCE_ID,
      license: CLIMATE_HISTORY_SOURCE.license,
      attribution: CLIMATE_HISTORY_SOURCE.attribution,
      attributionUrl: CLIMATE_HISTORY_SOURCE.attributionUrl,
      readThrough: 'd1_active_numeric_run',
      runId: storeRead.runId,
      runStatus: storeRead.runStatus,
      runCount: storeRead.runCount,
      payloadSha256: storeRead.payloadSha256,
      sourceRetrievedAt: storeRead.sourceRetrievedAt,
      cacheChecksums: [],
      cacheRetrievedAtFirst: null,
      cacheRetrievedAtLast: null,
    };
    dataAsOf = storeRead.sourceRetrievedAt;
  } else {
    const cache = cacheRead!;
    const checksums = [...new Set(cache.years.map((series) => series.manifestChecksum))].sort();
    const retrieved = cache.years.map((series) => series.retrievedAt).sort();
    scope = {
      tier: 'reviewed_cache_point',
      gridPoint: {
        areaLabelTh: cache.point.areaLabelTh,
        requestedLatitude: cache.point.requestedLatitude,
        requestedLongitude: cache.point.requestedLongitude,
        providerGridLatitude: cache.years[0]?.providerGridLatitude ?? null,
        providerGridLongitude: cache.years[0]?.providerGridLongitude ?? null,
        resolutionDeg: CLIMATE_HISTORY_SOURCE.gridResolutionDeg,
        support: 'grid_point',
      },
      yearsWithData: years.length,
      yearsMissing,
      firstDayWithData: allDates[0] ?? null,
      lastDayWithData: allDates[allDates.length - 1] ?? null,
      dailyRowsRead,
      rowsCapped: false,
      variablesPublished: ['precipitation_sum_mm', 'temperature_2m_max_c', 'et0_fao_evapotranspiration_mm'],
      variablesNotPublishedHere: ['t2m_mean_c', 't2m_min_c'],
      grainNoteTh: 'ค่าจาก snapshot ERA5 รายจุดที่ผ่านการตรวจสอบแล้วในเครื่อง (ดึงจริงจาก Open-Meteo archive) — หนึ่งจุดกริดต่อจังหวัด ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด',
      rejectedCacheYears: cache.rejected,
    };
    provenance = {
      sourceId: 'open_meteo',
      resourceId: ERA5_ARCHIVE_RESOURCE_ID,
      license: CLIMATE_HISTORY_SOURCE.license,
      attribution: CLIMATE_HISTORY_SOURCE.attribution,
      attributionUrl: CLIMATE_HISTORY_SOURCE.attributionUrl,
      readThrough: 'reviewed_local_snapshot',
      runId: null,
      runStatus: null,
      runCount: 0,
      payloadSha256: null,
      sourceRetrievedAt: retrieved[retrieved.length - 1] ?? null,
      cacheChecksums: checksums,
      cacheRetrievedAtFirst: retrieved[0] ?? null,
      cacheRetrievedAtLast: retrieved[retrieved.length - 1] ?? null,
    };
    dataAsOf = retrieved[retrieved.length - 1] ?? null;
  }

  const complete = years.filter((row) => row.completeYear);
  const hasTmean = complete.some((row) => row.tmeanC !== null);
  const tempNormalBase = hasTmean
    ? complete.map((row) => row.tmeanC)
    : complete.map((row) => row.tmaxMeanC);
  const firstFiveYearMeanC = roundOrNull(edgeFiveYearMean(tempNormalBase, true), 2);
  const lastFiveYearMeanC = roundOrNull(edgeFiveYearMean(tempNormalBase, false), 2);

  const baseline = {
    tmeanNormalC: roundOrNull(meanKnown(complete.map((row) => row.tmeanC).filter((v): v is number => v !== null)), 2),
    tmaxNormalC: roundOrNull(meanKnown(complete.map((row) => row.tmaxMeanC).filter((v): v is number => v !== null)), 2),
    rainfallNormalMm: roundOrNull(meanKnown(complete.map((row) => row.rainfallTotalMm).filter((v): v is number => v !== null)), 1),
    hotDaysNormal: roundOrNull(meanKnown(complete.map((row) => row.hotDays38C).filter((v): v is number => v !== null)), 1),
  };

  const trends = {
    tmeanPerDecadeC: trendFromRows(complete, (row) => row.tmeanC, 2),
    tmaxPerDecadeC: trendFromRows(complete, (row) => row.tmaxMeanC, 2),
    hotDaysPerDecade: trendFromRows(complete, (row) => row.hotDays38C, 2),
    rainfallTrendMmPerDecade: trendFromRows(complete, (row) => row.rainfallTotalMm, 1),
    firstFiveYearMeanC,
    lastFiveYearMeanC,
    warmingDeltaC: firstFiveYearMeanC !== null && lastFiveYearMeanC !== null
      ? round(lastFiveYearMeanC - firstFiveYearMeanC, 2)
      : null,
  };

  const notableYears: ClimateNotableYear[] = [];
  const hottest = hasTmean
    ? extremeRealRow(complete, (row) => row.tmeanC, 'max')
    : extremeRealRow(complete, (row) => row.tmaxMeanC, 'max');
  if (hottest) {
    notableYears.push({
      year: hottest.row.year,
      reason: 'hottest',
      labelTh: 'ร้อนที่สุด',
      value: hottest.value,
      unit: '°C',
      normalC: hasTmean ? baseline.tmeanNormalC : baseline.tmaxNormalC,
      normalMm: null,
    });
  }
  const mostHotDays = extremeRealRow(complete, (row) => row.hotDays38C, 'max');
  if (mostHotDays) {
    notableYears.push({
      year: mostHotDays.row.year,
      reason: 'most_hot_days',
      labelTh: 'วันร้อนจัดมากที่สุด',
      value: mostHotDays.value,
      unit: 'วัน',
      normalC: null,
      normalMm: null,
    });
  }
  const driest = extremeRealRow(complete, (row) => row.rainfallTotalMm, 'min');
  if (driest) {
    notableYears.push({
      year: driest.row.year,
      reason: 'driest',
      labelTh: 'ฝนน้อยที่สุด (แล้ง)',
      value: driest.value,
      unit: 'mm',
      normalC: null,
      normalMm: baseline.rainfallNormalMm,
    });
  }
  const wettest = extremeRealRow(complete, (row) => row.rainfallTotalMm, 'max');
  if (wettest) {
    notableYears.push({
      year: wettest.row.year,
      reason: 'wettest',
      labelTh: 'ฝนมากที่สุด',
      value: wettest.value,
      unit: 'mm',
      normalC: null,
      normalMm: baseline.rainfallNormalMm,
    });
  }
  const longestSpell = extremeRealRow(complete, (row) => row.longestDrySpellDays, 'max');
  if (longestSpell) {
    notableYears.push({
      year: longestSpell.row.year,
      reason: 'longest_dry_spell',
      labelTh: 'ฝนทิ้งช่วงยาวที่สุด',
      value: longestSpell.value,
      unit: 'วัน',
      normalC: null,
      normalMm: null,
    });
  }

  return {
    ...base,
    yearsWithData: years.length,
    dataKind: 'real',
    sample: false,
    years,
    baseline,
    trends,
    notableYears,
    dataAsOf,
    scope,
    provenance,
  };
}

/** Honest, response-specific warnings for the API meta (never claims coverage). */
export function climateHistoryMetaWarnings(overview: ClimateHistoryOverview): string[] {
  if (overview.dataKind !== 'real') return [...CLIMATE_HISTORY_WARNINGS];
  const warnings: string[] = [
    `ทุกค่ามาจากข้อมูล ERA5 จริงของจุดกริดเดียว (0.25° ≈ 27 กม.) ไม่ใช่อุณหภูมิหรือฝนเฉลี่ยทั้งจังหวัด และไม่ใช่ค่าจากสถานีวัด`,
    'รหัส 77 จังหวัดเป็นทะเบียนพิกัดอ้างอิง ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด',
  ];
  if (overview.scope.tier === 'reviewed_cache_point') {
    warnings.push('ชุดนี้อ่านจาก snapshot รายจุดที่ตรวจสอบแล้วซึ่ง ingest ดึงมาเก็บไว้จริง (CC BY 4.0) ไม่ใช่ numeric run ที่เผยแพร่ใน D1');
    warnings.push('จุด snapshot นี้เผยแพร่ฝนรายวัน/Tmax/ET0 เท่านั้น ค่า tmean และ tmin จึงเป็น null ถาวร ไม่ประมาณค่าแทน');
  }
  if (overview.scope.tier === 'd1_published_batch') {
    warnings.push(`ค่าอ่านจาก numeric run ที่เผยแพร่ใน D1 (สถานะ run: ${overview.provenance.runStatus ?? 'ไม่ทราบ'}) — ครอบคลุมเฉพาะวันที่ runนั้นมีจริง ไม่ใช่ทั้งช่วงปีที่เลือก`);
  }
  if (overview.scope.yearsMissing.length) {
    warnings.push(`ช่วงปีที่ไม่มีแถวข้อมูลเผยแพร่จริง: ${overview.scope.yearsMissing.join(', ')} — ปีที่ขาดไม่ถูกแทนด้วยค่าประมาณใด ๆ`);
  }
  if (overview.scope.rowsCapped) {
    warnings.push('การอ่าน D1 ครั้งนี้ชนเพดานจำนวนบรรทัดที่กำหนดไว้ จึงอาจยังเหลือวันที่ store มีแต่ยังไม่ถูกนำมาคำนวณ');
  }
  if (overview.scope.rejectedCacheYears.length) {
    warnings.push(`พาทิชัน snapshot ${overview.scope.rejectedCacheYears.length} ปีผ่านโครงสร้างไม่ผ่านการตรวจสอบ จึงถูกตัดออกพร้อมเหตุผลใน scope`);
  }
  const completeCount = overview.years.filter((row) => row.completeYear).length;
  if (completeCount < overview.years.length) {
    warnings.push(`มี ${overview.years.length - completeCount} ปีที่ข้อมูลไม่ครบปฏิทินปี ค่ารวมปี/ค่าสุดขั้ว/แนวโน้มจึงคำนวณจากปีที่ครบเท่านั้น`);
  }
  return warnings;
}

/** Retained for offline visual development only; the public API never returns sample data. */
export async function buildClimateHistorySampleOverview(params: {
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
