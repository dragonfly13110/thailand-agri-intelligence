import 'server-only';
import { listD1Observations, type D1ObservationRow } from './d1-numeric-repository';

/**
 * Bounded D1 reads for `/climate-history`.
 *
 * Both resources are `approved_public` in `config/resource_licenses.json`
 * (`open_meteo_thailand_era5_archive`, `chirps_v3_daily_rnl_2026_09_30`), and
 * `listD1Observations` already fail-closes on rows outside an active
 * `kind='numeric'` run with publication approved. This module adds no second
 * gate and fabricates nothing: what the store does not hold stays absent.
 */

/** D1 `resources.resource_id` written by `src/tadih/ingest_open_meteo_d1.py`. */
export const ERA5_ARCHIVE_RESOURCE_ID = 'https://archive-api.open-meteo.com/v1/archive';

/** D1 `resources.resource_id` written by `src/tadih/hub_numeric_sync.py`. */
export const CHIRPS_RNL_2026_09_30_RESOURCE_ID =
  'https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/2026/chirps-v3.0.rnl.2026.09.30.tif';

/** One read never walks more than this many rows; shortfall is reported as capped. */
export const CLIMATE_D1_ROW_CEILING = 10_000;

/** The ERA5 daily measures this page consumes; wind/RH rows stay unread here. */
export const ERA5_CLIMATE_METRICS = ['t2m_mean_c', 't2m_max_c', 't2m_min_c', 'precip_mm'] as const;
export type Era5ClimateMetric = (typeof ERA5_CLIMATE_METRICS)[number];

export type PublishedObservationReader = (
  filters: { resourceId: string },
  options: { limit: number; offset: number },
) => Promise<{ rows: D1ObservationRow[]; total: number }>;

/** One ERA5 grid-point day: metric id -> published value (null stays null). */
export type Era5PublishedDay = {
  /** Asia/Bangkok local calendar day (YYYY-MM-DD) the adapter labelled the row with. */
  day: string;
  values: Partial<Record<Era5ClimateMetric, number | null>>;
  units: Partial<Record<Era5ClimateMetric, string | null>>;
};

/** Grid-point identity as written by `build_observations` in the ingest adapter. */
export type Era5GridPoint = {
  requestedLatitude: number | null;
  requestedLongitude: number | null;
  gridLatitude: number | null;
  gridLongitude: number | null;
};

export type Era5PublishedRead = {
  /** Days keyed by local date; only days of the requested province's grid point. */
  days: Map<string, Era5PublishedDay>;
  /** Provider coordinates of the cell actually served; null when no row carried them. */
  point: Era5GridPoint;
  runId: string | null;
  runStatus: string | null;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  /** Distinct run ids seen; provenance is single-run only. */
  runCount: number;
  rowsRead: number;
  reportedTotal: number;
  capped: boolean;
};

function dayKey(row: D1ObservationRow): string {
  // The adapter writes the Asia/Bangkok day label into dimensions; the UTC
  // instant in period_start would shift late-evening rows into the wrong year.
  const ict = row.dimensions.observationDateIct;
  if (typeof ict === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ict)) return ict;
  const iso = row.periodStart ?? '';
  return iso.slice(0, 10);
}

async function walkPublishedRows(
  reader: PublishedObservationReader,
  resourceId: string,
): Promise<{ rows: D1ObservationRow[]; total: number; capped: boolean }> {
  const rows: D1ObservationRow[] = [];
  let total = 0;
  for (let page = 0; page * 500 < CLIMATE_D1_ROW_CEILING; page += 1) {
    const result = await reader({ resourceId }, { limit: 500, offset: rows.length });
    total = result.total;
    if (!result.rows.length) break;
    rows.push(...result.rows);
    if (rows.length >= total) break;
  }
  return { rows, total, capped: rows.length < total };
}

/**
 * Read every published ERA5 day for one province-centroid grid point inside
 * [startYear, endYear]. Province selection happens in JavaScript because the
 * writer keeps `observations.province_code` NULL on grid rows (grid point is
 * not a province) and stores the link only in `dimensions.provinceCode`.
 */
export async function readEra5PublishedDays(
  provinceCode: string,
  startYear: number,
  endYear: number,
  options: { reader?: PublishedObservationReader } = {},
): Promise<Era5PublishedRead> {
  const reader: PublishedObservationReader = options.reader ??
    ((filters, pageOptions) => listD1Observations(filters, pageOptions));
  const walk = await walkPublishedRows(reader, ERA5_ARCHIVE_RESOURCE_ID);
  const days = new Map<string, Era5PublishedDay>();
  const runIds = new Set<string>();
  const point: Era5GridPoint = {
    requestedLatitude: null,
    requestedLongitude: null,
    gridLatitude: null,
    gridLongitude: null,
  };
  let runStatus: string | null = null;
  let payloadSha256: string | null = null;
  let sourceRetrievedAt: string | null = null;
  let rowsRead = 0;

  const coord = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  for (const row of walk.rows) {
    // Grid rows keep province_code NULL; the writer's only province link is this dimension.
    if (row.dimensions.provinceCode !== provinceCode) continue;
    const metric = row.metricId;
    if (!metric || !ERA5_CLIMATE_METRICS.includes(metric as Era5ClimateMetric)) continue;
    const day = dayKey(row);
    const year = Number(day.slice(0, 4));
    if (!Number.isInteger(year) || year < startYear || year > endYear) continue;
    rowsRead += 1;
    runIds.add(row.runId);
    runStatus = row.runStatus ?? runStatus;
    payloadSha256 = row.payloadSha256 ?? payloadSha256;
    sourceRetrievedAt = row.sourceRetrievedAt ?? sourceRetrievedAt;
    if (point.gridLatitude === null) {
      point.requestedLatitude = coord(row.dimensions.requestedLatitude);
      point.requestedLongitude = coord(row.dimensions.requestedLongitude);
      point.gridLatitude = coord(row.dimensions.gridLatitude);
      point.gridLongitude = coord(row.dimensions.gridLongitude);
    }
    let entry = days.get(day);
    if (!entry) {
      entry = { day, values: {}, units: {} };
      days.set(day, entry);
    }
    // A missing upstream value is published as null; keep it null, never 0.
    entry.values[metric as Era5ClimateMetric] = row.value;
    entry.units[metric as Era5ClimateMetric] = row.unit;
  }

  return {
    days,
    point,
    runId: runIds.size === 1 ? [...runIds][0] ?? null : null,
    runStatus,
    payloadSha256,
    sourceRetrievedAt,
    runCount: runIds.size,
    rowsRead,
    reportedTotal: walk.total,
    capped: walk.capped,
  };
}

/** One published CHIRPS grid cell (grain: 0.05° cell × one UTC day). */
export type ChirpsCellRow = {
  locationId: string;
  gridRow: number | null;
  gridCol: number | null;
  latitude: number | null;
  longitude: number | null;
  observedDay: string | null;
  rainfallMm: number | null;
  unit: string | null;
  qualityStatus: string | null;
};

export type ChirpsGridSampleRead = {
  cells: ChirpsCellRow[];
  total: number;
  runId: string | null;
  runStatus: string | null;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  capped: boolean;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Read the published CHIRPS verification sample. Today D1 holds exactly three
 * grid cells of one day; the caller must present them as cells, never as
 * raster or provincial coverage.
 */
export async function readChirpsGridSample(
  options: { reader?: PublishedObservationReader } = {},
): Promise<ChirpsGridSampleRead> {
  const reader: PublishedObservationReader = options.reader ??
    ((filters, pageOptions) => listD1Observations(filters, pageOptions));
  const walk = await walkPublishedRows(reader, CHIRPS_RNL_2026_09_30_RESOURCE_ID);
  const cells: ChirpsCellRow[] = [];
  const runIds = new Set<string>();
  let runStatus: string | null = null;
  let payloadSha256: string | null = null;
  let sourceRetrievedAt: string | null = null;

  for (const row of walk.rows) {
    runIds.add(row.runId);
    runStatus = row.runStatus ?? runStatus;
    payloadSha256 = row.payloadSha256 ?? payloadSha256;
    sourceRetrievedAt = row.sourceRetrievedAt ?? sourceRetrievedAt;
    cells.push({
      locationId: row.locationId ?? row.rowKey,
      gridRow: numberOrNull(row.dimensions.gridRow),
      gridCol: numberOrNull(row.dimensions.gridCol),
      latitude: numberOrNull(row.dimensions.latitude),
      longitude: numberOrNull(row.dimensions.longitude),
      observedDay: (row.periodStart ?? '').slice(0, 10) || null,
      rainfallMm: row.value,
      unit: row.unit,
      qualityStatus: row.qualityStatus,
    });
  }
  cells.sort((a, b) => String(a.locationId).localeCompare(String(b.locationId)));

  return {
    cells,
    total: walk.total,
    runId: runIds.size === 1 ? [...runIds][0] ?? null : null,
    runStatus,
    payloadSha256,
    sourceRetrievedAt,
    capped: walk.capped,
  };
}
