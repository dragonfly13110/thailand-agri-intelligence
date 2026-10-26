/**
 * TMD monthly rainfall dataset — the station × calendar-month series published
 * by `src/tadih/ingest_tmd_d1.py` (`tmd_monthly_rainfall_monthly`).
 *
 * Kept separate from `weather-observations-data.ts` on purpose: that module
 * answers one observation *day* and mixes in ERA5 grid days, while this one
 * answers whole finished calendar months. Different grains never share a body.
 *
 * Governance inherited from the daily weather lane and the water lane:
 * - numbers only leave D1 under an active numeric run of an
 *   `approved_public` + `project_publication_approved` resource;
 * - `observations.unit` is NULL and `unit_status` is
 *   `pending_official_confirmation`, so the provider's declared unit
 *   (`mm`, `day`) is surfaced as metadata and never asserted;
 * - a station is not a province: the province seen in `dimensions` is a label
 *   from the station register, and no value is averaged across stations;
 * - a `quality_status='missing'` row stays null, it is never turned into 0.
 *   The upstream document also spells not-yet-arrived months as `0`; those
 *   months are excluded when the batch is built, so nothing here invents a
 *   dry-season zero for a month the provider has not finished.
 */

export const MONTHLY_RAINFALL_RESOURCE_URL =
  'https://data.tmd.go.th/api/ThailandMonthlyRainfall/v1/index.php';

export const MONTHLY_RAINFALL_METRICS = ['monthly_rainfall_mm', 'monthly_rainy_days'] as const;

export type MonthlyRainfallMetricId = (typeof MONTHLY_RAINFALL_METRICS)[number];

export const MONTHLY_RAINFALL_METRIC_PRESENTATION: Record<
  MonthlyRainfallMetricId,
  { labelTh: string; field: string; publishedUnit: string }
> = {
  'monthly_rainfall_mm': { labelTh: 'ปริมาณน้ำฝนรายเดือน', field: 'rainfallMm', publishedUnit: 'มม.' },
  'monthly_rainy_days': { labelTh: 'จำนวนวันฝนตกสะสมรายเดือน', field: 'rainyDays', publishedUnit: 'วัน' },
};

export const THAI_MONTH_LABELS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

export type MonthlyRainfallSourceMetadata = {
  sourceId: 'tmd';
  sourceName: string;
  datasetName: string;
  description: string;
  sourceUrl: string;
  resourceUrl: string;
  grain: string;
  frequency: string;
  licenseStatus: 'approved_public';
  access: 'approved_public';
  publicationApproved: boolean;
  licenseReviewedAt: string;
  attributionText: string;
  limitations: string[];
};

export const MONTHLY_RAINFALL_SOURCE: MonthlyRainfallSourceMetadata = {
  sourceId: 'tmd',
  sourceName: 'กรมอุตุนิยมวิทยา (TMD)',
  datasetName: 'ปริมาณฝนและวันฝนตก รายสถานีรายเดือน (ThailandMonthlyRainfall V1)',
  description:
    'ยอดรวมรายเดือนที่สถานีตรวจอากาศของกรมอุตุนิยมวิทยารายงาน และเผยแพร่จากคลังข้อมูลกลางแล้ว เรียงตามสถานี × เดือน ปฏิทินเกรกอเรียน',
  sourceUrl: 'https://www.tmd.go.th/th',
  resourceUrl: MONTHLY_RAINFALL_RESOURCE_URL,
  grain: 'station × calendar_month',
  frequency: 'รายเดือน (เผยแพร่เฉพาะเดือนที่ปิดเดือนแล้ว)',
  licenseStatus: 'approved_public',
  access: 'approved_public',
  publicationApproved: true,
  licenseReviewedAt: '2026-10-26',
  attributionText: 'กรมอุตุนิยมวิทยา (TMD) — ข้อมูลฝนรายเดือนจากสถานีตรวจอากาศ',
  limitations: [
    'หน่วยที่ต้นทางประกาศ (mm, day) ยังไม่ถูกยืนยันอย่างเป็นทางการ จึงคง unit=null และ unit_status=pending_official_confirmation',
    'รหัสจังหวัดในแถวมาจากทะเบียนสถานีที่ adapter map ไว้ ใช้เป็นป้ายกำกับเท่านั้น ไม่ใช่ค่าเฉลี่ยของจังหวัด',
    'สถานีไม่ใช่จังหวัด: จังหวัดที่ไม่มีสถานีในชุดนี้ไม่ได้แปลว่าไม่มีฝน และรหัส 77 จังหวัดเป็นทะเบียนอ้างอิง ไม่ใช่ coverage',
    'เดือนปัจจุบันและเดือนที่ยังไม่ถึงไม่ถูกเผยแพร่เป็นยอดสมบูรณ์ ยอดที่แสดงคือเดือนที่ต้นทางปิดเดือนแล้วเท่านั้น',
  ],
};

export const MONTHLY_RAINFALL_WARNINGS = [
  'ตัวเลขมาจากแถวที่มี active numeric run ของทรัพยากรฝนรายเดือนในคลังข้อมูลกลางเท่านั้น',
  'grain คือสถานี × เดือน ไม่ใช่จังหวัด และไม่ใช่ค่าที่เฉลี่ยจากหลายสถานี',
  'ค่าว่าง (—) หมายถึงต้นทางไม่ได้รายงานเดือนนั้น ไม่ใช่ 0',
  'หน่วยยังรอการยืนยันจากเอกสารทางการของ TMD (unit_status=pending_official_confirmation)',
];

export const MONTHLY_RAINFALL_FALLBACK_WARNINGS = [
  'ยังไม่เผยแพร่ตัวเลขฝนรายเดือน เพราะอ่านคลังข้อมูลกลางไม่พบ active numeric batch ของทรัพยากร ThailandMonthlyRainfall',
  'shown values: none — response นี้เป็น metadata-only ไม่มีตัวเลขจากต้นทาง',
  'ค่าว่างหมายถึง "ยังไม่มีข้อมูลที่เผยแพร่ได้" ไม่ใช่ 0 หรือ "ไม่มีฝน"',
];

/* ------------------------------------------------------------------ */
/* Input shape (a structural subset of D1ObservationRow)               */
/* ------------------------------------------------------------------ */

export type MonthlyRainfallInput = {
  resourceId: string;
  locationCode: string | null;
  locationName: string | null;
  metricId: string | null;
  value: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  qualityStatus: string | null;
  sourceRowRef: string | null;
  dimensions?: Record<string, string | number | boolean | null> | null;
};

export type MonthlyRainfallMonth = {
  year: number;
  month: number;
  periodStart: string | null;
  periodEnd: string | null;
  /** Null when the provider sent the row without a usable value. */
  values: Record<MonthlyRainfallMetricId, number | null>;
  observedAtIct: string | null;
};

export type MonthlyRainfallCoordinateStatus = 'provider_declared' | 'provider_field_order_suspect';

export type MonthlyRainfallStationRecord = {
  stationCode: string;
  stationNameTh: string | null;
  stationNameEn: string | null;
  provinceCode: string | null;
  provinceNameTh: string | null;
  /** Null together with `coordinateStatus='provider_field_order_suspect'` — see `readCoordinates`. */
  latitude: number | null;
  longitude: number | null;
  coordinateStatus: MonthlyRainfallCoordinateStatus;
  /** Column D1 left NULL until TMD confirms units in writing. */
  unit: null;
  unitStatus: string;
  declaredUnits: Partial<Record<MonthlyRainfallMetricId, string>>;
  months: MonthlyRainfallMonth[];
  valueCount: number;
  missingValueCount: number;
  sourceRowRefs: string[];
};

export type MonthlyRainfallSummary = {
  stationCount: number;
  provincesWithReportingStation: number;
  years: number[];
  /** Month numbers actually present in the published batch, sorted. */
  monthsAvailable: number[];
  valueCount: number;
  missingValueCount: number;
  wettest: { stationCode: string; stationNameTh: string | null; year: number; month: number; value: number } | null;
  rainiestDays: { stationCode: string; stationNameTh: string | null; year: number; month: number; value: number } | null;
};

export type MonthlyRainfallPayload = {
  source: MonthlyRainfallSourceMetadata;
  year: number | null;
  months: number[];
  summary: MonthlyRainfallSummary;
  stations: MonthlyRainfallStationRecord[];
  calculationVersion: string;
};

export const MONTHLY_RAINFALL_CALCULATION_VERSION = 'weather-monthly-rainfall-v1';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function dimensionText(row: MonthlyRainfallInput, key: string): string | null {
  const value = row.dimensions?.[key];
  if (typeof value === 'string' && value.length) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function dimensionNumber(row: MonthlyRainfallInput, key: string): number | null {
  const value = row.dimensions?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isMonthlyMetric(value: string | null): value is MonthlyRainfallMetricId {
  return value !== null && (MONTHLY_RAINFALL_METRICS as readonly string[]).includes(value);
}

/** `observations.location_code` is `tmd:station:48300`; the public id is the code. */
function stationKey(row: MonthlyRainfallInput): string | null {
  const coded = dimensionText(row, 'stationCode');
  if (coded) return coded;
  const location = row.locationCode ?? '';
  const parts = location.split(':');
  const tail = parts[parts.length - 1] ?? '';
  return tail.length ? tail : null;
}

function emptyMonthValues(): Record<MonthlyRainfallMetricId, number | null> {
  const values = {} as Record<MonthlyRainfallMetricId, number | null>;
  for (const metric of MONTHLY_RAINFALL_METRICS) values[metric] = null;
  return values;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Thailand lies within 5–21°N and 97–106°E, so a pair can always be told apart
 * by range. The ThailandMonthlyRainfall document puts the east–west value in
 * `<Latitude>` for every station (proved on all 1,738 published rows), while the
 * daily TMD documents are correct. The reader therefore refuses to publish a
 * coordinate it cannot vouch for instead of re-ordering provider fields by
 * inference; the writer lane owns the mapping fix.
 */
function readCoordinates(row: MonthlyRainfallInput): {
  latitude: number | null;
  longitude: number | null;
  coordinateStatus: MonthlyRainfallCoordinateStatus;
} {
  const latitude = dimensionNumber(row, 'latitude');
  const longitude = dimensionNumber(row, 'longitude');
  const plausible =
    latitude !== null && longitude !== null &&
    latitude >= 5 && latitude <= 21 && longitude >= 97 && longitude <= 106;
  if (latitude === null || longitude === null) {
    return { latitude: null, longitude: null, coordinateStatus: 'provider_declared' };
  }
  return plausible
    ? { latitude, longitude, coordinateStatus: 'provider_declared' }
    : { latitude: null, longitude: null, coordinateStatus: 'provider_field_order_suspect' };
}

function extremeOf(
  stations: MonthlyRainfallStationRecord[],
  metric: MonthlyRainfallMetricId,
): MonthlyRainfallSummary['wettest'] {
  let best: MonthlyRainfallSummary['wettest'] = null;
  for (const station of stations) {
    for (const month of station.months) {
      const value = month.values[metric];
      if (value === null) continue;
      if (!best || value > best.value || (value === best.value && month.year * 100 + month.month > best.year * 100 + best.month)) {
        best = { stationCode: station.stationCode, stationNameTh: station.stationNameTh, year: month.year, month: month.month, value };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

/**
 * Pivot published monthly rows into one record per station with its months.
 *
 * Returns `null` when the batch holds nothing publishable so callers answer the
 * metadata-only contract instead of an empty numeric body. Rows of an
 * unrecognised metric (for instance a forecast measure) are dropped rather than
 * coerced, and a year/month is only listed when the provider actually sent it.
 */
export function buildMonthlyRainfall(
  rows: MonthlyRainfallInput[],
  options: { provinceCode?: string | null; stationCode?: string | null; year?: number | null } = {},
): MonthlyRainfallPayload | null {
  const provinceFilter = options.provinceCode ?? null;
  const stationFilter = options.stationCode ?? null;
  const yearFilter = options.year ?? null;

  const relevant = rows.filter((row) => row.resourceId === MONTHLY_RAINFALL_RESOURCE_URL && isMonthlyMetric(row.metricId));
  if (!relevant.length) return null;

  const byStation = new Map<string, MonthlyRainfallStationRecord>();
  const byMonthKey = new Map<string, MonthlyRainfallMonth>();
  // A metric seen without a usable value in any copy is an explicit gap.
  const gapKeys = new Set<string>();

  for (const row of relevant) {
    const code = stationKey(row);
    if (!code) continue;
    const year = dimensionNumber(row, 'year');
    const month = dimensionNumber(row, 'month');
    if (year === null || month === null || month < 1 || month > 12) continue;
    const provinceCode = dimensionText(row, 'provinceCode');
    if (provinceFilter && provinceCode !== provinceFilter) continue;
    if (stationFilter && code !== stationFilter) continue;
    if (yearFilter !== null && year !== yearFilter) continue;

    const coordinates = readCoordinates(row);
    let station = byStation.get(code);
    if (!station) {
      station = {
        stationCode: code,
        stationNameTh: dimensionText(row, 'stationNameTh') ?? row.locationName,
        stationNameEn: dimensionText(row, 'stationNameEn'),
        provinceCode,
        provinceNameTh: dimensionText(row, 'provinceNameTh'),
        ...coordinates,
        // Left null on purpose: TMD has not confirmed the units in writing.
        unit: null,
        unitStatus: dimensionText(row, 'unitStatus') ?? 'pending_official_confirmation',
        declaredUnits: {},
        months: [],
        valueCount: 0,
        missingValueCount: 0,
        sourceRowRefs: [],
      };
      byStation.set(code, station);
    } else {
      station.stationNameTh = station.stationNameTh ?? (dimensionText(row, 'stationNameTh') ?? row.locationName);
      station.stationNameEn = station.stationNameEn ?? dimensionText(row, 'stationNameEn');
      station.provinceCode = station.provinceCode ?? provinceCode;
      station.provinceNameTh = station.provinceNameTh ?? dimensionText(row, 'provinceNameTh');
      station.latitude = station.latitude ?? dimensionNumber(row, 'latitude');
      station.longitude = station.longitude ?? dimensionNumber(row, 'longitude');
    }

    const metric = row.metricId as MonthlyRainfallMetricId;
    const declaredUnit = dimensionText(row, 'providerUnit');
    if (declaredUnit) station.declaredUnits[metric] = declaredUnit;
    if (row.sourceRowRef) station.sourceRowRefs.push(row.sourceRowRef);

    const key = `${code}|${year}|${month}`;
    let monthRecord = byMonthKey.get(key);
    if (!monthRecord) {
      monthRecord = {
        year,
        month,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        values: emptyMonthValues(),
        observedAtIct: dimensionText(row, 'observedAtSourceIct'),
      };
      byMonthKey.set(key, monthRecord);
      station.months.push(monthRecord);
    }

    const usable = row.qualityStatus === 'good' && row.value !== null && Number.isFinite(row.value);
    if (usable) {
      if (monthRecord.values[metric] === null) monthRecord.values[metric] = round1(row.value as number);
    } else {
      gapKeys.add(`${key}|${metric}`);
    }
  }

  const stations = [...byStation.values()]
    .map((station) => {
      const months = station.months.sort((left, right) => left.year - right.year || left.month - right.month);
      let values = 0;
      let gaps = 0;
      for (const month of months) {
        for (const metric of MONTHLY_RAINFALL_METRICS) {
          if (month.values[metric] !== null) values += 1;
          else if (gapKeys.has(`${station.stationCode}|${month.year}|${month.month}|${metric}`)) gaps += 1;
        }
      }
      return {
        ...station,
        months,
        valueCount: values,
        missingValueCount: gaps,
        sourceRowRefs: [...new Set(station.sourceRowRefs)].sort(),
      };
    })
    .sort((left, right) =>
      (left.provinceCode ?? 'zz') === (right.provinceCode ?? 'zz')
        ? left.stationCode.localeCompare(right.stationCode)
        : (left.provinceCode ?? 'zz').localeCompare(right.provinceCode ?? 'zz'));

  if (!stations.length) return null;

  const provinces = new Set<string>();
  const years = new Set<number>();
  const months = new Set<number>();
  let valueCount = 0;
  let missingValueCount = 0;
  for (const station of stations) {
    if (station.provinceCode) provinces.add(station.provinceCode);
    for (const month of station.months) {
      years.add(month.year);
      months.add(month.month);
    }
    valueCount += station.valueCount;
    missingValueCount += station.missingValueCount;
  }

  return {
    source: MONTHLY_RAINFALL_SOURCE,
    year: years.size === 1 ? [...years][0] : null,
    months: [...months].sort((left, right) => left - right),
    summary: {
      stationCount: stations.length,
      provincesWithReportingStation: provinces.size,
      years: [...years].sort((left, right) => left - right),
      monthsAvailable: [...months].sort((left, right) => left - right),
      valueCount,
      missingValueCount,
      wettest: extremeOf(stations, 'monthly_rainfall_mm'),
      rainiestDays: extremeOf(stations, 'monthly_rainy_days'),
    },
    stations,
    calculationVersion: MONTHLY_RAINFALL_CALCULATION_VERSION,
  };
}

/** Metadata-only body for the route, mirroring the daily observations contract. */
export function buildMonthlyRainfallMetadataPayload(): {
  source: MonthlyRainfallSourceMetadata;
  year: null;
  months: [];
  summary: null;
  stations: [];
  calculationVersion: string;
} {
  return {
    source: MONTHLY_RAINFALL_SOURCE,
    year: null,
    months: [],
    summary: null,
    stations: [],
    calculationVersion: MONTHLY_RAINFALL_CALCULATION_VERSION,
  };
}
