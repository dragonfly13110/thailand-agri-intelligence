/**
 * Weather observation dataset — source contract plus the numeric payload
 * builders shared by `GET /api/v1/weather/observations` and the `/weather` page.
 *
 * Sources (all `approved_public` in `config/resource_licenses.json`, reviewed
 * 2026-10-26 under AGENTS.md ข้อ 3 with owner-registered API credentials):
 * - กรมอุตุนิยมวิทยา (TMD) WeatherTodayByAgro V1 — 34 agro-met stations, daily 07:00 ICT
 * - TMD WeatherTodayBySynop V1 — synoptic stations, daily 07:00 ICT
 * - TMD WeatherToday V2 — stations reported at 07:00 ICT
 * - Open-Meteo Thailand ERA5 reanalysis — daily reanalysis per province grid point
 *
 * Governance kept identical to the water lane:
 * - Numbers only leave D1 through an active numeric run; the reader enforces
 *   `r.access_status='approved_public'`, `r.project_publication_approved=1` and
 *   `sync_runs.kind='numeric'` with status succeeded/partial.
 * - TMD station rows carry no official `observations.province_code`; the province
 *   appears only inside `dimensions.provinceCode`, so province selection happens
 *   here in JavaScript and never through a province rollup.
 * - `observations.unit` is NULL for the TMD measures and `unit_status` is
 *   `pending_official_confirmation`, so this module publishes the provider's
 *   declared unit string as metadata and never asserts a unit of measurement.
 * - A station is not a province: no average across stations is exposed, and the
 *   province count in `summary` is a count of stations reporting, never coverage.
 * - ERA5 is reanalysis (`dataKind: "estimated"`), not an observation, and is kept
 *   in a separate block with its own label.
 * - Forecast values are never read here; `/api/v1/weather` returns an empty
 *   contract until an approved forecast resource and batch exist. TMD HPC is
 *   published separately under `/api/v1/nwp`.
 */

export type WeatherObservationsSourceMetadata = {
  sourceId: 'tmd';
  sourceName: string;
  datasetName: string;
  description: string;
  sourceUrl: string;
  endpoints: { network: string; resourceUrl: string }[];
  grain: string;
  frequency: string;
  licenseStatus: 'approved_public';
  access: 'approved_public';
  publicationApproved: boolean;
  licenseReviewedAt: string;
  attributionText: string;
  limitations: string[];
};

/** D1 `resources.resource_id` values written by `src/tadih/ingest_tmd_d1.py`. */
export const TMD_STATION_RESOURCES = [
  { network: 'agro', label: 'สถานีอากาศเกษตร (WeatherTodayByAgro)', resourceUrl: 'https://data.tmd.go.th/api/WeatherTodayByAgro/V1/' },
  { network: 'synop', label: 'สถานี synoptic (WeatherTodayBySynop)', resourceUrl: 'https://data.tmd.go.th/api/weathertodayBySynop/V1/' },
  { network: 'station', label: 'สถานีรายงานรายวัน (WeatherToday V2)', resourceUrl: 'https://data.tmd.go.th/api/WeatherToday/V2/' },
] as const;

/** D1 `resources.resource_id` of the Open-Meteo ERA5 archive resource. */
export const ERA5_RESOURCE_URL = 'https://archive-api.open-meteo.com/v1/archive';

export const TMD_STATION_RESOURCE_URLS: string[] = TMD_STATION_RESOURCES.map((row) => row.resourceUrl);

/** Metric ids written by the TMD adapter; each row carries exactly one metric. */
export const WEATHER_METRICS = [
  'tmax_c',
  'tmin_c',
  'tavg_c',
  'rainfall_mm',
  'humidity_pct',
  'wind_speed_ms',
  'wind_direction_deg',
  'air_pressure_msl_hpa',
] as const;

export type WeatherMetricId = (typeof WEATHER_METRICS)[number];

/**
 * Metric label plus the unit the published value is expressed in.
 * The unit the provider itself declared is per row in `declaredUnits`, never
 * asserted here: only `wind_speed_ms` travels a documented conversion
 * (km/h -> m/s) in the adapter, so its header has to say so.
 */
export const WEATHER_METRIC_PRESENTATION: Record<WeatherMetricId, { labelTh: string; field: string; publishedUnit: string }> = {
  'tmax_c': { labelTh: 'อุณหภูมิสูงสุด', field: 'tmaxC', publishedUnit: '°C' },
  'tmin_c': { labelTh: 'อุณหภูมิต่ำสุด', field: 'tminC', publishedUnit: '°C' },
  'tavg_c': { labelTh: 'อุณหภูมิเฉลี่ย', field: 'tavgC', publishedUnit: '°C' },
  'rainfall_mm': { labelTh: 'ปริมาณน้ำฝน', field: 'rainfallMm', publishedUnit: 'มม.' },
  'humidity_pct': { labelTh: 'ความชื้นสัมพัทธ์', field: 'humidityPercent', publishedUnit: '%' },
  'wind_speed_ms': { labelTh: 'ความเร็วลม', field: 'windSpeedMs', publishedUnit: 'ม./วิ (แปลงจาก km/h ตามที่ต้นทางระบุ)' },
  'wind_direction_deg': { labelTh: 'ทิศทางลม', field: 'windDirectionDeg', publishedUnit: 'องศา' },
  'air_pressure_msl_hpa': { labelTh: 'ความกดอากาศที่ระดับน้ำทะเลปานกลาง', field: 'airPressureMslHpa', publishedUnit: 'hPa' },
};

export const WEATHER_OBSERVATIONS_SOURCE: WeatherObservationsSourceMetadata = {
  sourceId: 'tmd',
  sourceName: 'กรมอุตุนิยมวิทยา (TMD)',
  datasetName: 'ข้อมูลอากาศรายวันจากสถานีตรวจอากาศ TMD และชุด reanalysis ERA5',
  description:
    'ค่าตรวจวัดรายสถานีที่เผยแพร่จากคลังข้อมูลกลาง (active numeric run) พร้อมชุดข้อมูลย้อนหลัง ERA5 ระดับกริดของจังหวัดที่มีข้อมูลเท่านั้น',
  sourceUrl: 'https://www.tmd.go.th/th',
  endpoints: TMD_STATION_RESOURCES.map((row) => ({ network: row.network, resourceUrl: row.resourceUrl })),
  grain: 'station × observation_date (ERA5: grid_point × day)',
  frequency: 'รายวัน (TMD รายงานเวลา 07:00 น. ICT)',
  licenseStatus: 'approved_public',
  access: 'approved_public',
  publicationApproved: true,
  licenseReviewedAt: '2026-10-26',
  attributionText: 'กรมอุตุนิยมวิทยา (TMD) · Weather data by Open-Meteo.com (CC BY 4.0)',
  limitations: [
    'ต้นทางระบุหน่วยใน payload แต่ยังไม่มีการยืนยันหน่วยอย่างเป็นทางการ จึงแสดง unit_status=pending_official_confirmation และ unit=null ตามกฎห้ามเดาหน่วย',
    'แถวสถานีไม่มี province_code ทางการในชั้น numeric (รหัสจังหวัดอยู่ใน dimensions ที่ adapter map จากทะเบียนสถานี) จึงใช้เป็นป้ายกำกับเท่านั้น ไม่ใช่ค่าเฉลี่ยจังหวัด',
    'สถานีไม่ใช่จังหวัด: ค่าสถิติใน summary คำนวณข้ามสถานีที่รายงานในวันนั้น ไม่ได้ครอบคลุม 77 จังหวัด และห้ามตีความว่าจังหวัดที่ไม่มีสถานีคือไม่มีฝน',
    'ERA5 เป็นข้อมูล reanalysis (dataKind=estimated) ไม่ใช่ค่าตรวจวัด มีเฉพาะจังหวัดที่ถูกดึงเข้าคลังแล้ว (ปัจจุบันจุดกริดเดียว) จึงแสดงเป็นบล็อกแยก',
  ],
};

export const WEATHER_OBSERVATION_WARNINGS = [
  'ตัวเลขมาจากแถวที่มี active numeric run ในคลังข้อมูลกลางเท่านั้น; วันที่แสดงคือวันตรวจวัดเดียวต่อหนึ่งคำตอบ',
  'หน่วยยังรอการยืนยันจากเอกสารทางการของ TMD ค่าที่แสดงจึงคง unit_status=pending_official_confirmation',
  'ค่าว่าง (—) หมายถึงต้นทางไม่ได้รายงานค่านั้น ไม่ใช่ 0',
  'ข้อมูลสถานีรายสถานี ไม่ใช่ค่าระดับจังหวัดหรือระดับภาค และไม่ใช่การพยากรณ์',
];

export const WEATHER_OBSERVATION_FALLBACK_WARNINGS = [
  'ยังไม่เผยแพร่ตัวเลขอากาศ เพราะอ่านคลังข้อมูลกลางไม่พบ active numeric batch ของทรัพยากรสถานี TMD',
  'shown values: none — response นี้เป็น metadata-only ไม่มีตัวเลขจากต้นทาง',
  'ค่าว่างหมายถึง "ยังไม่มีข้อมูลที่เผยแพร่ได้" ไม่ใช่ 0 หรือ "ไม่มีฝน"',
];

/* ------------------------------------------------------------------ */
/* Input shape (a subset of D1ObservationRow, kept structural)          */
/* ------------------------------------------------------------------ */

export type WeatherObservationInput = {
  resourceId: string | null;
  metricId: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  value: number | null;
  unit: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  qualityStatus: string | null;
  sourceRowRef: string | null;
  dimensions?: Record<string, unknown>;
};

export type WeatherStationRecord = {
  stationCode: string;
  stationNameTh: string | null;
  stationNameEn: string | null;
  network: string;
  provinceCode: string | null;
  provinceNameTh: string | null;
  latitude: number | null;
  longitude: number | null;
  observedAtIct: string | null;
  sourceResourceUrl: string | null;
  /** One key per metric id; missing when the source did not report it. */
  values: Record<WeatherMetricId, number | null>;
  /** Column D1 left NULL until TMD confirms units in writing. */
  unit: string | null;
  unitStatus: string;
  declaredUnits: Partial<Record<WeatherMetricId, string>>;
  reportedMetricCount: number;
  missingMetricCount: number;
  sourceRowRefs: string[];
};

export type WeatherReanalysisDay = {
  date: string;
  precipMm: number | null;
  t2mMeanC: number | null;
  t2mMaxC: number | null;
  t2mMinC: number | null;
  rh2mPct: number | null;
  windSpeedMs: number | null;
};

export type WeatherReanalysisRecord = {
  provinceCode: string | null;
  provinceNameTh: string | null;
  locationCode: string | null;
  gridLatitude: number | null;
  gridLongitude: number | null;
  providerModel: string | null;
  dataKind: 'estimated';
  unitStatus: string | null;
  days: WeatherReanalysisDay[];
  missingValueCount: number;
};

export type WeatherObservationSummary = {
  stationCount: number;
  provincesWithReportingStation: number;
  networks: string[];
  hottest: { stationCode: string; stationNameTh: string | null; value: number } | null;
  coolest: { stationCode: string; stationNameTh: string | null; value: number } | null;
  wettest: { stationCode: string; stationNameTh: string | null; value: number } | null;
  mostHumid: { stationCode: string; stationNameTh: string | null; value: number } | null;
  windiest: { stationCode: string; stationNameTh: string | null; value: number } | null;
  stationsReportingRainfall: number;
  /** Stations whose rainfall row is explicitly missing, not assumed dry. */
  stationsWithMissingRainfall: number;
};

export type WeatherObservationsPayload = {
  source: WeatherObservationsSourceMetadata;
  observationDate: string;
  /** Other observation dates seen in the batch but not shown (never merged). */
  otherObservationDates: string[];
  summary: WeatherObservationSummary;
  stations: WeatherStationRecord[];
  reanalysis: WeatherReanalysisRecord[];
  calculationVersion: string;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function dimensionText(row: WeatherObservationInput, key: string): string | null {
  const value = row.dimensions?.[key];
  if (typeof value === 'string' && value.length) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function dimensionNumber(row: WeatherObservationInput, key: string): number | null {
  const value = row.dimensions?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isMetricId(value: string | null): value is WeatherMetricId {
  return value !== null && (WEATHER_METRICS as readonly string[]).includes(value);
}

function stationKey(row: WeatherObservationInput): string | null {
  const code = dimensionText(row, 'stationCode') ?? row.locationCode;
  return code && code.length ? code : null;
}

function pickExtreme(
  stations: WeatherStationRecord[],
  metric: WeatherMetricId,
  compare: (left: number, right: number) => number,
): WeatherObservationSummary['hottest'] {
  let best: WeatherObservationSummary['hottest'] = null;
  for (const station of stations) {
    const value = station.values[metric];
    if (value === null) continue;
    if (!best || compare(value, best.value) > 0) best = { stationCode: station.stationCode, stationNameTh: station.stationNameTh, value };
  }
  return best;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function emptyMetricValues(): Record<WeatherMetricId, number | null> {
  const values = {} as Record<WeatherMetricId, number | null>;
  for (const metric of WEATHER_METRICS) values[metric] = null;
  return values;
}

function buildStations(rows: WeatherObservationInput[]): WeatherStationRecord[] {
  const byStation = new Map<string, WeatherStationRecord>();
  // Metric ids whose only rows were explicit gaps. A station can be published
  // by two resources (the synoptic list also appears in WeatherToday V2), so
  // counting rows would report duplicates as missing values.
  const gapMetrics = new Map<string, Set<WeatherMetricId>>();

  for (const row of rows) {
    if (!isMetricId(row.metricId)) continue;
    const code = stationKey(row);
    if (!code) continue;
    const metric = row.metricId;

    let station = byStation.get(code);
    if (!station) {
      station = {
        stationCode: code,
        stationNameTh: dimensionText(row, 'stationNameTh') ?? row.locationName,
        stationNameEn: dimensionText(row, 'stationNameEn'),
        network: dimensionText(row, 'network') ?? 'station',
        provinceCode: dimensionText(row, 'provinceCode'),
        provinceNameTh: dimensionText(row, 'provinceNameTh'),
        latitude: dimensionNumber(row, 'latitude'),
        longitude: dimensionNumber(row, 'longitude'),
        observedAtIct: dimensionText(row, 'observedAtSourceIct'),
        sourceResourceUrl: row.resourceId,
        values: emptyMetricValues(),
        // Left null on purpose: TMD has not confirmed the units in writing.
        unit: null,
        unitStatus: dimensionText(row, 'unitStatus') ?? 'pending_official_confirmation',
        declaredUnits: {},
        reportedMetricCount: 0,
        missingMetricCount: 0,
        sourceRowRefs: [],
      };
      byStation.set(code, station);
      gapMetrics.set(code, new Set());
    } else {
      // Rows for one station arrive in any order; a row that carries a
      // descriptive field must not be overwritten by one that does not.
      station.stationNameTh = station.stationNameTh ?? (dimensionText(row, 'stationNameTh') ?? row.locationName);
      station.stationNameEn = station.stationNameEn ?? dimensionText(row, 'stationNameEn');
      station.provinceCode = station.provinceCode ?? dimensionText(row, 'provinceCode');
      station.provinceNameTh = station.provinceNameTh ?? dimensionText(row, 'provinceNameTh');
      station.latitude = station.latitude ?? dimensionNumber(row, 'latitude');
      station.longitude = station.longitude ?? dimensionNumber(row, 'longitude');
      station.observedAtIct = station.observedAtIct ?? dimensionText(row, 'observedAtSourceIct');
    }

    const declaredUnit = dimensionText(row, 'providerUnit');
    if (declaredUnit) station.declaredUnits[metric] = declaredUnit;
    if (row.sourceRowRef) station.sourceRowRefs.push(row.sourceRowRef);

    // `quality_status='missing'` is an explicit gap, never a zero.
    const usable = row.qualityStatus === 'good' && row.value !== null && Number.isFinite(row.value);
    if (usable) {
      if (station.values[metric] === null) station.values[metric] = round1(row.value as number);
    } else {
      gapMetrics.get(code)!.add(metric);
    }
  }

  return [...byStation.values()].map((station) => {
    const gaps = gapMetrics.get(station.stationCode) ?? new Set<WeatherMetricId>();
    let reported = 0;
    let missing = 0;
    for (const metric of WEATHER_METRICS) {
      if (station.values[metric] !== null) reported += 1;
      else if (gaps.has(metric)) missing += 1;
    }
    return {
      ...station,
      reportedMetricCount: reported,
      missingMetricCount: missing,
      sourceRowRefs: [...new Set(station.sourceRowRefs)].sort(),
    };
  }).sort((left, right) =>
    (left.provinceCode ?? 'zz') === (right.provinceCode ?? 'zz')
      ? left.stationCode.localeCompare(right.stationCode)
      : (left.provinceCode ?? 'zz').localeCompare(right.provinceCode ?? 'zz'));
}

function buildReanalysis(rows: WeatherObservationInput[]): WeatherReanalysisRecord[] {
  const metricField: Record<string, Exclude<keyof WeatherReanalysisDay, 'date'>> = {
    precip_mm: 'precipMm',
    t2m_mean_c: 't2mMeanC',
    t2m_max_c: 't2mMaxC',
    t2m_min_c: 't2mMinC',
    rh2m_pct: 'rh2mPct',
    wind_speed_ms: 'windSpeedMs',
  };
  const byKey = new Map<string, WeatherReanalysisRecord>();
  const dayIndex = new Map<string, WeatherReanalysisDay>();

  for (const row of rows) {
    const field = row.metricId ? metricField[row.metricId] : undefined;
    if (!field) continue;
    const locationCode = row.locationCode ?? stationKey(row);
    if (!locationCode) continue;
    const date = row.periodStart ?? row.periodEnd;
    if (!date) continue;
    const recordKey = `${locationCode}|${dimensionText(row, 'provinceCode') ?? ''}`;
    const dayKey = `${recordKey}|${date}`;

    let record = byKey.get(recordKey);
    if (!record) {
      record = {
        provinceCode: dimensionText(row, 'provinceCode'),
        provinceNameTh: dimensionText(row, 'provinceNameTh'),
        locationCode,
        gridLatitude: dimensionNumber(row, 'gridLatitude'),
        gridLongitude: dimensionNumber(row, 'gridLongitude'),
        providerModel: dimensionText(row, 'providerModel'),
        dataKind: 'estimated',
        unitStatus: dimensionText(row, 'unitStatus'),
        days: [],
        missingValueCount: 0,
      };
      byKey.set(recordKey, record);
    }

    let day = dayIndex.get(dayKey);
    if (!day) {
      day = { date, precipMm: null, t2mMeanC: null, t2mMaxC: null, t2mMinC: null, rh2mPct: null, windSpeedMs: null };
      dayIndex.set(dayKey, day);
      record.days.push(day);
    }

    if (row.qualityStatus === 'good' && row.value !== null && Number.isFinite(row.value)) {
      day[field] = round1(row.value);
    } else {
      day[field] = null;
      record.missingValueCount += 1;
    }
  }

  for (const record of byKey.values()) record.days.sort((left, right) => left.date.localeCompare(right.date));
  return [...byKey.values()].sort((left, right) =>
    (left.provinceCode ?? 'zz').localeCompare(right.provinceCode ?? 'zz'));
}

function summarise(stations: WeatherStationRecord[]): WeatherObservationSummary {
  const provinces = new Set<string>();
  const networks = new Set<string>();
  let reportingRainfall = 0;
  let missingRainfall = 0;
  for (const station of stations) {
    if (station.provinceCode) provinces.add(station.provinceCode);
    networks.add(station.network);
    if (station.values.rainfall_mm !== null) reportingRainfall += 1;
    else missingRainfall += 1;
  }
  return {
    stationCount: stations.length,
    provincesWithReportingStation: provinces.size,
    networks: [...networks].sort(),
    hottest: pickExtreme(stations, 'tmax_c', (left, right) => left - right),
    // The coolest station is the one with the LOWEST daily minimum, so the
    // comparison is reversed relative to the other extremes.
    coolest: pickExtreme(stations, 'tmin_c', (left, right) => right - left),
    wettest: pickExtreme(stations, 'rainfall_mm', (left, right) => left - right),
    mostHumid: pickExtreme(stations, 'humidity_pct', (left, right) => left - right),
    windiest: pickExtreme(stations, 'wind_speed_ms', (left, right) => left - right),
    stationsReportingRainfall: reportingRainfall,
    stationsWithMissingRainfall: missingRainfall,
  };
}

/**
 * Pivot metric-per-row observations into one record per station for a single
 * observation date.
 *
 * Returns `null` when nothing publishable is present so the caller can answer
 * the metadata-only contract instead of an empty numeric body. Rows of other
 * observation dates are reported in `otherObservationDates` rather than merged,
 * because a station week must not be presented as one day.
 */
export function buildWeatherObservations(
  rows: WeatherObservationInput[],
  options: { provinceCode?: string | null } = {},
): WeatherObservationsPayload | null {
  const provinceFilter = options.provinceCode ?? null;
  const stationRowsAll = rows.filter((row) => row.resourceId !== ERA5_RESOURCE_URL && isMetricId(row.metricId));
  const era5Rows = rows.filter((row) => row.resourceId === ERA5_RESOURCE_URL);

  const dated = stationRowsAll.filter((row) => (row.periodStart ?? row.periodEnd) !== null);
  if (!dated.length && !era5Rows.length) return null;

  const observationDate = dated.length
    ? dated.reduce((latest, row) => {
        const value = (row.periodStart ?? row.periodEnd) as string;
        return value > latest ? value : latest;
      }, '')
    : '';
  const otherDates = new Set(dated
    .map((row) => (row.periodStart ?? row.periodEnd) as string)
    .filter((value) => value !== observationDate));

  const scoped = dated.filter((row) => {
    if ((row.periodStart ?? row.periodEnd) !== observationDate) return false;
    if (!provinceFilter) return true;
    return dimensionText(row, 'provinceCode') === provinceFilter;
  });

  const stations = buildStations(scoped);
  const reanalysisAll = buildReanalysis(era5Rows);
  const reanalysis = provinceFilter
    ? reanalysisAll.filter((record) => record.provinceCode === provinceFilter)
    : reanalysisAll;

  if (!stations.length && !reanalysis.length) return null;

  return {
    source: WEATHER_OBSERVATIONS_SOURCE,
    observationDate: observationDate || (reanalysis[0]?.days.at(-1)?.date ?? ''),
    otherObservationDates: [...otherDates].sort(),
    summary: summarise(stations),
    stations,
    reanalysis,
    calculationVersion: 'weather-observations-v1',
  };
}

/** Metadata-only body used when D1 has no published weather batch. */
export function buildWeatherObservationsMetadataPayload(): { source: WeatherObservationsSourceMetadata; stations: []; reanalysis: []; summary: null } {
  return { source: WEATHER_OBSERVATIONS_SOURCE, stations: [], reanalysis: [], summary: null };
}
