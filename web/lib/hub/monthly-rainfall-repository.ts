import 'server-only';
import { queryD1 } from './d1';
import { D1_OBSERVATION_ROW_LIMIT, listD1Observations, type D1ObservationRow } from './d1-numeric-repository';
import { HubRequestError, parseText } from './http';
import {
  MONTHLY_RAINFALL_RESOURCE_URL,
  buildMonthlyRainfall,
  buildMonthlyRainfallDirectory,
  type MonthlyRainfallBatch,
  type MonthlyRainfallDirectory,
  type MonthlyRainfallFilters,
  type MonthlyRainfallPayload,
  type MonthlyRainfallRead,
} from './weather-monthly-data';

/**
 * Read side of the TMD monthly rainfall resource.
 *
 * Nothing is published here that the warehouse did not say: the shared reader
 * (`listD1Observations`) already gates every row on `approved_public` +
 * `project_publication_approved` and on the resource's active `kind='numeric'`
 * run, and this module adds no second gate, no daily weather row, no ERA5 day and
 * no NWP grid value. A month that was never published stays absent — it is never
 * rendered as a dry zero.
 */

/** One read never walks more than this many rows; the caller reports the shortfall. */
export const MONTHLY_RAINFALL_ROW_CEILING = 20_000;

/** A page is `D1_OBSERVATION_ROW_LIMIT` rows, so the ceiling is this many calls. */
export const MONTHLY_RAINFALL_MAX_PAGES = Math.ceil(MONTHLY_RAINFALL_ROW_CEILING / D1_OBSERVATION_ROW_LIMIT);

export type MonthlyRainfallPage = { rows: D1ObservationRow[]; total: number };

/** `resources.source_updated_at` / `sources.freshness_days` of the monthly resource. */
export type MonthlyRainfallContext = { sourceUpdatedAt: string | null; freshnessDays: number | null };

/** The shared reader, kept injectable so the paging contract is testable offline. */
export type MonthlyRainfallReader = (
  filters: { resourceId: string },
  options: { limit: number; offset: number },
) => Promise<MonthlyRainfallPage>;

export type MonthlyRainfallSnapshot = {
  /** Null when there is no publishable batch, or the filters matched no station × month. */
  payload: MonthlyRainfallPayload | null;
  /** Null when the published batch holds no monthly rainfall row at all. */
  batch: MonthlyRainfallBatch | null;
  directory: MonthlyRainfallDirectory | null;
};

/**
 * Station codes of this resource follow the TMD/WMO register the writer validates
 * (`[A-Za-z0-9_-]{3,20}`, `src/tadih/tmd_archive.py:normalize_station_id`), so a
 * filter that cannot be such a code is refused instead of silently returning an
 * empty table that a reader would misread as "no rain".
 */
const STATION_CODE = /^[A-Za-z0-9_-]{3,20}$/;

/** `year` is a four-digit Gregorian year, matching what the writer publishes. */
const CE_YEAR = /^[1-9]\d{3}$/;

/**
 * Parse the optional filters of the monthly rainfall contract with the shared
 * `parseText` validator. Province codes are format-checked here and matched
 * against the 77-code register by the caller, as every other weather lane does.
 */
export function parseMonthlyRainfallFilters(url: URL): MonthlyRainfallFilters {
  const provinceCode = parseText(url, 'provinceCode', 2);
  const stationCode = parseText(url, 'stationCode', 20);
  const yearRaw = parseText(url, 'year', 4);
  if (provinceCode && !/^\d{2}$/.test(provinceCode)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
  }
  if (stationCode && !STATION_CODE.test(stationCode)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสสถานีไม่ถูกต้อง');
  }
  if (yearRaw && !CE_YEAR.test(yearRaw)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ปีต้องเป็นปี ค.ศ. 4 หลัก');
  }
  return {
    provinceCode: provinceCode || null,
    stationCode: stationCode || null,
    year: yearRaw ? Number(yearRaw) : null,
  };
}

/**
 * Follow the published batch page by page up to `MONTHLY_RAINFALL_ROW_CEILING`.
 *
 * The ceiling is a hard bound, not a hint: when the warehouse reports more rows
 * than the walk collected, `capped` is true and the caller must call the result
 * partial. An empty page stops the walk even if the reported total disagrees, so
 * a shrinking batch cannot loop forever.
 */
async function collectPublishedRows(
  reader: MonthlyRainfallReader,
): Promise<{ rows: D1ObservationRow[]; total: number; pages: number; capped: boolean }> {
  const rows: D1ObservationRow[] = [];
  let total = 0;
  let pages = 0;
  for (let page = 0; page < MONTHLY_RAINFALL_MAX_PAGES; page += 1) {
    const result = await reader({ resourceId: MONTHLY_RAINFALL_RESOURCE_URL }, { limit: D1_OBSERVATION_ROW_LIMIT, offset: rows.length });
    pages += 1;
    total = result.total;
    if (!result.rows.length) break;
    rows.push(...result.rows);
    if (rows.length >= total) break;
  }
  return { rows, total, pages, capped: rows.length < total };
}

/**
 * `resources.source_updated_at` and `sources.freshness_days` of this resource,
 * read from the register the same way the water lane reads its own context. Both
 * are NULL today, so freshness stays unknown rather than being invented here.
 */
async function readResourceContext(): Promise<MonthlyRainfallContext> {
  const rows = await queryD1<{ sourceUpdatedAt: unknown; freshnessDays: unknown }>(
    'SELECT r.source_updated_at AS sourceUpdatedAt,s.freshness_days AS freshnessDays ' +
      'FROM resources r JOIN datasets d ON d.dataset_id=r.dataset_id ' +
      'JOIN sources s ON s.source_id=d.source_id WHERE r.resource_id=? LIMIT 1',
    [MONTHLY_RAINFALL_RESOURCE_URL]
  );
  const row = rows[0];
  // A NULL column must stay NULL: `Number(null)` is 0, which would read as
  // "declared never-fresh" instead of the truth — the register says nothing.
  const rawFreshness = row?.freshnessDays === null || row?.freshnessDays === undefined
    ? Number.NaN
    : Number(row.freshnessDays);
  return {
    sourceUpdatedAt: typeof row?.sourceUpdatedAt === 'string' && row.sourceUpdatedAt ? row.sourceUpdatedAt : null,
    freshnessDays: Number.isFinite(rawFreshness) ? rawFreshness : null,
  };
}

function text(values: (string | null | undefined)[]): string | null {
  const present = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  return present.length ? present.sort().at(-1) ?? null : null;
}

function earliest(values: (string | null | undefined)[]): string | null {
  const present = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  return present.length ? present.sort()[0] : null;
}

function toBatch(rows: D1ObservationRow[], read: { total: number; pages: number; capped: boolean }, context: MonthlyRainfallContext): MonthlyRainfallBatch {
  const runIds = new Set(rows.map((row) => row.runId));
  const runStatuses = new Set(rows.map((row) => row.runStatus));
  const versions = new Set(rows.map((row) => row.payloadSha256));
  return {
    runId: runIds.size === 1 ? [...runIds][0] ?? null : null,
    runStatus: runStatuses.size === 1 ? [...runStatuses][0] ?? null : null,
    runCount: runIds.size,
    adapterVersion: text(rows.map((row) => row.adapterVersion)),
    payloadSha256: versions.size === 1 ? [...versions][0] ?? null : null,
    sourceRetrievedAt: text(rows.map((row) => row.sourceRetrievedAt)),
    runCompletedAt: text(rows.map((row) => row.runCompletedAt)),
    sourceUpdatedAt: context.sourceUpdatedAt,
    freshnessDays: context.freshnessDays,
    collectedRows: rows.length,
    reportedTotal: read.total,
    capped: read.capped,
    pages: read.pages,
    periodStart: earliest(rows.map((row) => row.periodStart)),
    periodEnd: text(rows.map((row) => row.periodEnd)),
  };
}

/**
 * Load the published monthly rainfall batch once and build both views of it:
 * an unfiltered directory (the years/provinces/stations a reader may pick) and
 * the filtered payload the table and chart render.
 *
 * The whole batch is read before filtering because the year of a row lives in
 * `dimensions`, not in a SQL column the shared reader can bind — filtering in SQL
 * would hide which years exist. Values stay exactly as published: `unit` remains
 * NULL, the provider's declared unit travels as metadata, and no province
 * average, yearly total, anomaly or threshold is computed from it.
 */
export async function readMonthlyRainfallSnapshot(
  filters: MonthlyRainfallFilters = { provinceCode: null, stationCode: null, year: null },
  options: { reader?: MonthlyRainfallReader; context?: () => Promise<MonthlyRainfallContext> } = {},
): Promise<MonthlyRainfallSnapshot> {
  const reader = options.reader ?? listD1Observations;
  const readContext = options.context ?? readResourceContext;
  const [read, context] = await Promise.all([collectPublishedRows(reader), readContext()]);
  if (!read.rows.length) return { payload: null, batch: null, directory: null };

  const unfiltered = buildMonthlyRainfall(read.rows);
  if (!unfiltered) return { payload: null, batch: null, directory: null };

  const batch = toBatch(read.rows, read, context);
  const directory = buildMonthlyRainfallDirectory(unfiltered);
  const payload = buildMonthlyRainfall(read.rows, filters);
  return { payload, batch, directory };
}

/** Assemble the route-facing read result, keeping "unreadable" out of the data layer. */
export function toMonthlyRainfallRead(
  snapshot: MonthlyRainfallSnapshot,
  filters: MonthlyRainfallFilters,
  databaseRead: boolean,
): MonthlyRainfallRead {
  return { databaseRead, batch: snapshot.batch, directory: snapshot.directory, payload: snapshot.payload, filters };
}
