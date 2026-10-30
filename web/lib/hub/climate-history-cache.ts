import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reader for the five reviewed ERA5 archive points already fetched by the
 * existing ingest path (`src/tadih/ingestion.py`, source `open_meteo`,
 * resource `open_meteo_thailand_era5_archive`, `approved_public` CC BY 4.0).
 * Each partition is one full calendar year of daily ERA5 values at one grid
 * point, stored with a manifest whose artifact file is named by its SHA-256
 * (canonical-JSON basis — the JS side binds the checksum by name and re-checks
 * the full structure instead of trusting the file loosely).
 *
 * These are grid-point samples, not province statistics: the point identity,
 * provider grid coordinates and retrieved-at travel with every year, and a
 * partition failing any structural check is dropped with an explicit reason.
 */

export type ReviewedEra5Point = {
  provinceCode: string;
  /** Thai label of the reviewed agricultural area the point sits in (not a coverage claim). */
  areaLabelTh: string;
  region: 'north' | 'northeast' | 'central' | 'east' | 'south';
  requestedLatitude: number;
  requestedLongitude: number;
  /** Directory prefix written by `src/tadih/ingestion.py` (Python float formatting). */
  partitionPrefix: string;
};

/** 2016-2025 complete calendar years, one point per major agricultural region. */
export const REVIEWED_ERA5_POINTS: readonly ReviewedEra5Point[] = [
  { provinceCode: '73', areaLabelTh: 'ที่ราบเกษตรนครปฐม', region: 'central', requestedLatitude: 13.8, requestedLongitude: 100.25, partitionPrefix: 'era5-13.8-100.25' },
  { provinceCode: '50', areaLabelTh: 'ที่ราบลุ่มเชียงใหม่', region: 'north', requestedLatitude: 18.75, requestedLongitude: 99.0, partitionPrefix: 'era5-18.75-99.0' },
  { provinceCode: '40', areaLabelTh: 'ขอนแก่น', region: 'northeast', requestedLatitude: 16.44, requestedLongitude: 102.83, partitionPrefix: 'era5-16.44-102.83' },
  { provinceCode: '34', areaLabelTh: 'อุบลราชธานี (ทุ่งข้าวหอมมะลิ)', region: 'northeast', requestedLatitude: 15.24, requestedLongitude: 104.85, partitionPrefix: 'era5-15.24-104.85' },
  { provinceCode: '84', areaLabelTh: 'สุราษฎร์ธานี (ปาล์ม/ยางพารา)', region: 'south', requestedLatitude: 9.14, requestedLongitude: 99.33, partitionPrefix: 'era5-9.14-99.33' },
];

export const REVIEWED_CACHE_FIRST_YEAR = 2016;
export const REVIEWED_CACHE_LAST_YEAR = 2025;

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
// Resolved at runtime: `new URL(..., import.meta.url)` makes the bundler try to
// resolve the gitignored data/local directory and breaks the whole route.
const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/local/raw/open_meteo',
);

export type CacheDay = {
  date: string;
  precipitationMm: number | null;
  temperatureMaxC: number | null;
  et0Mm: number | null;
};

export type CacheYearSeries = {
  year: number;
  days: CacheDay[];
  retrievedAt: string;
  requestUrl: string;
  manifestChecksum: string;
  /** Grid cell the provider actually served for this point. */
  providerGridLatitude: number;
  providerGridLongitude: number;
};

export type ReviewedEra5CacheRead = {
  point: ReviewedEra5Point;
  years: CacheYearSeries[];
  /** Years inside the window that were expected but failed or absent, with reasons. */
  rejected: { year: number; reason: string }[];
  rootExists: boolean;
};

export function reviewedPointFor(provinceCode: string): ReviewedEra5Point | null {
  return REVIEWED_ERA5_POINTS.find((point) => point.provinceCode === provinceCode) ?? null;
}

function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function calendarDates(year: number): string[] {
  const count = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
  const dates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(new Date(Date.UTC(year, 0, 1 + index)).toISOString().slice(0, 10));
  }
  return dates;
}

/** Fail-closed structural validation of one partition; returns the reason it was rejected. */
async function readCacheYear(
  root: string,
  point: ReviewedEra5Point,
  year: number,
): Promise<CacheYearSeries | { reason: string }> {
  const partition = `${point.partitionPrefix}-${year}`;
  let manifestRaw: string;
  try {
    manifestRaw = await readFile(`${root}/${partition}/manifest.json`, 'utf8');
  } catch {
    return { reason: 'ไม่มีพาทิชันของจุด/ปีนี้ในคลังข้อมูลที่ตรวจสอบแล้ว' };
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  } catch {
    return { reason: 'manifest.json อ่านไม่ได้' };
  }
  const artifact = typeof manifest.artifact === 'string' ? manifest.artifact : '';
  const checksum = typeof manifest.checksum === 'string' ? manifest.checksum : '';
  if (manifest.status !== 'success' || manifest.source_id !== 'open_meteo') {
    return { reason: 'manifest ไม่ได้ระบุ snapshot สำเร็จของ open_meteo' };
  }
  // The ingest writes the canonical-JSON SHA-256 into both the name and the field.
  if (!artifact.endsWith('.json') || checksum !== artifact.slice(0, -'.json'.length)) {
    return { reason: 'checksum ไม่ตรงกับชื่อไฟล์ artifact' };
  }
  if (manifest.partition_key !== partition) {
    return { reason: 'partition_key ไม่ตรงกับโฟลเดอร์' };
  }
  let envelope: Record<string, any>;
  try {
    envelope = JSON.parse(await readFile(`${root}/${partition}/${artifact}`, 'utf8')) as Record<string, any>;
  } catch {
    return { reason: 'ไฟล์ artifact อ่านไม่ได้' };
  }
  const requested = envelope.requested_location ?? {};
  const payload = envelope.payload ?? {};
  const daily = payload.daily ?? {};
  const units = payload.daily_units ?? {};
  const expectedDates = calendarDates(year);
  const failure = (reason: string) => ({ reason });
  if (
    envelope.source_id !== 'open_meteo'
    || envelope.provider_model !== 'era5'
    || envelope.data_kind !== 'estimated'
    || envelope.spatial_support !== 'grid_point'
    || envelope.licence !== 'CC-BY-4.0'
    || typeof envelope.attribution !== 'string' || !envelope.attribution
    || requested.latitude !== point.requestedLatitude
    || requested.longitude !== point.requestedLongitude
    || envelope.start_date !== `${year}-01-01`
    || envelope.end_date !== `${year}-12-31`
    || payload.timezone !== 'Asia/Bangkok'
    || units.precipitation_sum !== 'mm'
    || units.temperature_2m_max !== '°C'
    || units.et0_fao_evapotranspiration !== 'mm'
    || !Array.isArray(daily.time)
    || daily.time.length !== expectedDates.length
    || !daily.time.every((value: unknown, index: number) => value === expectedDates[index])
  ) {
    return failure('จุดกริด ปี โมเดล เวลา หน่วย หรือปฏิทินไม่ตรงกับสัญญา ERA5');
  }
  const size = expectedDates.length;
  if (
    !Array.isArray(daily.precipitation_sum) || daily.precipitation_sum.length !== size
    || !Array.isArray(daily.temperature_2m_max) || daily.temperature_2m_max.length !== size
    || !Array.isArray(daily.et0_fao_evapotranspiration) || daily.et0_fao_evapotranspiration.length !== size
  ) {
    return failure('ความยาวอาร์เรย์ตัวแปรไม่ตรงกับจำนวนวัน');
  }
  const days: CacheDay[] = [];
  for (let index = 0; index < size; index += 1) {
    const rain = daily.precipitation_sum[index];
    const tmax = daily.temperature_2m_max[index];
    const et0 = daily.et0_fao_evapotranspiration[index];
    if (!isFiniteOrNull(rain) || !isFiniteOrNull(tmax) || !isFiniteOrNull(et0)) {
      return failure('พบค่าที่ไม่ใช่ตัวเลขหรือ null');
    }
    if (rain !== null && rain < 0) return failure('ค่าฝนติดลบ');
    days.push({ date: expectedDates[index], precipitationMm: rain, temperatureMaxC: tmax, et0Mm: et0 });
  }
  const requestUrl = typeof envelope.request_url === 'string' ? envelope.request_url : '';
  if (!requestUrl.startsWith(ARCHIVE_URL) || !requestUrl.includes(`${year}-01-01`)) {
    return failure('request_url ไม่ตรงกับ endpoint ERA5 archive');
  }
  if (typeof envelope.retrieved_at !== 'string' || !envelope.retrieved_at) {
    return failure('ไม่มีเวลาที่ดึงข้อมูล (retrieved_at)');
  }
  return {
    year,
    days,
    retrievedAt: envelope.retrieved_at,
    requestUrl,
    manifestChecksum: checksum,
    providerGridLatitude: Number(payload.latitude),
    providerGridLongitude: Number(payload.longitude),
  };
}

/**
 * Read every reviewed cache year inside [startYear, endYear] for one province.
 * Returns null when the province has no reviewed point; an unreadable or
 * missing root yields an empty (not fabricated) result with rootExists false.
 */
export async function readReviewedEra5Cache(
  provinceCode: string,
  startYear: number,
  endYear: number,
  options: { root?: string } = {},
): Promise<ReviewedEra5CacheRead | null> {
  const point = reviewedPointFor(provinceCode);
  if (!point) return null;
  const root = options.root ?? DEFAULT_ROOT;
  const years: CacheYearSeries[] = [];
  const rejected: { year: number; reason: string }[] = [];
  let rootExists = true;
  for (let year = Math.max(startYear, REVIEWED_CACHE_FIRST_YEAR); year <= Math.min(endYear, REVIEWED_CACHE_LAST_YEAR); year += 1) {
    try {
      const result = await readCacheYear(root, point, year);
      if ('reason' in result) rejected.push({ year, reason: result.reason });
      else years.push(result);
    } catch {
      rootExists = false;
      break;
    }
  }
  return { point, years, rejected, rootExists };
}
