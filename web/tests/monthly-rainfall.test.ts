/**
 * Monthly rainfall read contract tests (lane 7).
 *
 * Everything runs against fake readers — no D1 request, no credential, no
 * network. What is pinned here is the part the page and the API depend on:
 * the bounded paging walk over the shared reader's 500-row cap, the ceiling that
 * must be reported as partial instead of complete, the four response states kept
 * apart (ready / filter-empty / no-batch / unreadable), and the rule that a value
 * is only ever what the published row said — null stays null, 0 stays 0, and the
 * unconfirmed unit is never asserted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try {
            return nextResolve(specifier + suffix, context);
          } catch {
            // try the next candidate before rethrowing the original error
          }
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
      const source = readFileSync(new URL(url), 'utf8');
      return {
        format: 'module',
        source: stripTypeScriptTypes(source, { mode: 'transform' }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const monthly = await import('../lib/hub/weather-monthly-data.ts');
const repository = await import('../lib/hub/monthly-rainfall-repository.ts');

type Row = import('../lib/hub/d1-numeric-repository.ts').D1ObservationRow;
type Filters = import('../lib/hub/weather-monthly-data.ts').MonthlyRainfallFilters;
type Reader = import('../lib/hub/monthly-rainfall-repository.ts').MonthlyRainfallReader;

const RESOURCE = monthly.MONTHLY_RAINFALL_RESOURCE_URL;
const PAGE_SIZE = 500;
const NO_CONTEXT = async () => ({ sourceUpdatedAt: null, freshnessDays: null });
const NO_FILTERS: Filters = { provinceCode: null, stationCode: null, year: null };

function stationRow(overrides: {
  stationCode: string;
  year: number;
  month: number;
  metricId: string;
  value: number | null;
  provinceCode?: string | null;
  provinceNameTh?: string | null;
  stationNameTh?: string | null;
  qualityStatus?: string;
  unit?: string | null;
  providerUnit?: string | null;
  unitStatus?: string | null;
  resourceId?: string;
  runId?: string;
  runStatus?: string | null;
  payloadSha256?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Row {
  const dimensions: Record<string, string | number | boolean | null> = {
    year: overrides.year,
    month: overrides.month,
    stationCode: overrides.stationCode,
    stationNameTh: overrides.stationNameTh ?? 'สถานี ' + overrides.stationCode,
    provinceCode: overrides.provinceCode === undefined ? '10' : overrides.provinceCode,
    provinceNameTh: overrides.provinceNameTh === undefined ? 'กรุงเทพมหานคร' : overrides.provinceNameTh,
    latitude: '97.97578',
    longitude: '19.29897',
    seriesGrain: 'monthly',
    network: 'monthly',
  };
  if (overrides.providerUnit) dimensions.providerUnit = overrides.providerUnit;
  if (overrides.unitStatus) dimensions.unitStatus = overrides.unitStatus;
  const lastDay = new Date(Date.UTC(overrides.year, overrides.month, 0)).toISOString().slice(0, 10);
  return {
    resourceId: overrides.resourceId ?? RESOURCE,
    runId: overrides.runId ?? 'run-1',
    runStatus: overrides.runStatus === undefined ? 'succeeded' : overrides.runStatus,
    rowKey: 'row-' + overrides.stationCode + '-' + overrides.year + '-' + overrides.month + '-' + overrides.metricId,
    seriesKey: 'series-' + overrides.stationCode + '-' + overrides.metricId,
    sourceId: 'tmd',
    datasetId: 'tmd:tmd_monthly_rainfall_monthly',
    adapterVersion: 'tmd-station-d1/1.0.0',
    payloadSha256: overrides.payloadSha256 === undefined ? 'a'.repeat(64) : overrides.payloadSha256,
    sourceRetrievedAt: '2026-10-26T13:28:35Z',
    runCompletedAt: '2026-10-26T13:55:33Z',
    observedAt: overrides.year + '-' + String(overrides.month).padStart(2, '0') + '-' + lastDay,
    periodStart: overrides.periodStart === undefined ? overrides.year + '-' + String(overrides.month).padStart(2, '0') + '-01' : overrides.periodStart,
    periodEnd: overrides.periodEnd === undefined ? lastDay : overrides.periodEnd,
    periodLabel: overrides.year + '-' + String(overrides.month).padStart(2, '0'),
    locationId: 'tmd:station:' + overrides.stationCode,
    locationCode: 'tmd:station:' + overrides.stationCode,
    locationKind: 'station',
    locationName: 'สถานี ' + overrides.stationCode,
    // The writer keeps area_code NULL: the province of a station lives in dimensions.
    provinceCode: null,
    cropCode: null,
    cropName: null,
    metricId: overrides.metricId,
    metricName: overrides.metricId,
    product: null,
    grade: null,
    market: null,
    unit: overrides.unit === undefined ? null : overrides.unit,
    value: overrides.value,
    dimensions,
    qualityStatus: overrides.qualityStatus ?? (overrides.value === null ? 'missing' : 'good'),
    quality: {},
    sourceRowRef: 'ref-' + overrides.stationCode + '-' + overrides.year + '-' + overrides.month,
  };
}

/** A deterministic batch of `count` rows: two metrics per station-month. */
function syntheticBatch(count: number, startStation = 1): Row[] {
  const rows: Row[] = [];
  for (let index = 0; index < count; index += 1) {
    const pair = Math.floor(index / 2);
    const metricId = index % 2 === 0 ? 'monthly_rainfall_mm' : 'monthly_rainy_days';
    const stationNumber = startStation + Math.floor(pair / 12);
    const month = (pair % 12) + 1;
    rows.push(stationRow({
      stationCode: String(40000 + stationNumber),
      year: 2026,
      month,
      metricId,
      value: metricId === 'monthly_rainfall_mm' ? 10 + month : 20 + month,
      providerUnit: metricId === 'monthly_rainfall_mm' ? 'mm' : 'day',
      unitStatus: 'pending_official_confirmation',
    }));
  }
  return rows;
}

function pagingReader(rows: Row[], total = rows.length) {
  const calls: { limit: number; offset: number }[] = [];
  const reader: Reader = async (_filters, options) => {
    calls.push({ ...options });
    return { rows: rows.slice(options.offset, options.offset + options.limit), total };
  };
  return { reader, calls };
}

/* ------------------------------------------------------------------ */
/* Paging walk                                                         */
/* ------------------------------------------------------------------ */

test('the shared reader caps one call at 500 rows and the walk is bounded at 20,000', () => {
  assert.equal(repository.MONTHLY_RAINFALL_ROW_CEILING, 20_000);
  assert.equal(repository.MONTHLY_RAINFALL_MAX_PAGES, 40);
  assert.equal(repository.MONTHLY_RAINFALL_MAX_PAGES * PAGE_SIZE, repository.MONTHLY_RAINFALL_ROW_CEILING);
});

test('a batch larger than one page is followed to the reported total, not truncated at 500', async () => {
  const rows = syntheticBatch(2358);
  const { reader, calls } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });

  assert.ok(rows.length > PAGE_SIZE, 'the fixture must exceed one reader page');
  assert.equal(calls.length, 5, '2358 rows need five 500-row pages plus the empty stop');
  assert.deepEqual(calls.map((call) => call.offset), [0, 500, 1000, 1500, 2000]);
  assert.ok(calls.every((call) => call.limit === PAGE_SIZE));
  assert.equal(snapshot.batch?.collectedRows, 2358);
  assert.equal(snapshot.batch?.reportedTotal, 2358);
  assert.equal(snapshot.batch?.capped, false);
  assert.equal(snapshot.payload?.stations.length, Math.ceil(2358 / 24));
});

test('hitting the row ceiling is reported as capped and never as a complete batch', async () => {
  const total = 30_000;
  const { reader, calls } = pagingReader([], total);
  // The fake answers every page with the same ceiling-sized window so the walk
  // can only stop by reaching the bound.
  const big = syntheticBatch(repository.MONTHLY_RAINFALL_ROW_CEILING);
  const cappedReader: Reader = async (_filters, options) => ({
    rows: big.slice(options.offset, options.offset + options.limit),
    total,
  });
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader: cappedReader, context: NO_CONTEXT });

  assert.equal(calls.length, 0, 'the unused fake must not have been called');
  assert.equal(snapshot.batch?.collectedRows, 20_000);
  assert.equal(snapshot.batch?.reportedTotal, total);
  assert.equal(snapshot.batch?.capped, true);
  assert.equal(snapshot.batch?.pages, 40);

  const response = monthly.monthlyRainfallResponse(
    { databaseRead: true, batch: snapshot.batch, directory: snapshot.directory, payload: snapshot.payload, filters: NO_FILTERS },
    { page: 1, pageSize: 25 },
  );
  assert.equal(response.meta.completeness, 'partial');
  assert.match(response.meta.warnings.join(' '), /เพดาน 20000 แถวจากที่คลังรายงาน 30000 แถว/);
});

test('an empty page stops the walk even when the reported total is larger', async () => {
  const rows = syntheticBatch(10);
  const shortReader: Reader = async (_filters, options) => ({
    rows: options.offset === 0 ? rows : [],
    total: 5000,
  });
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader: shortReader, context: NO_CONTEXT });
  assert.equal(snapshot.batch?.collectedRows, 10);
  assert.equal(snapshot.batch?.pages, 2);
  assert.equal(snapshot.batch?.capped, true);
});

/* ------------------------------------------------------------------ */
/* Values stay exactly as published                                    */
/* ------------------------------------------------------------------ */

test('one station keeps its own months and a missing value is null, never zero', async () => {
  const rows = [
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainfall_mm', value: 377, providerUnit: 'mm', unitStatus: 'pending_official_confirmation' }),
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainy_days', value: 25, providerUnit: 'day', unitStatus: 'pending_official_confirmation' }),
    stationRow({ stationCode: '48300', year: 2026, month: 1, metricId: 'monthly_rainfall_mm', value: 0, providerUnit: 'mm', unitStatus: 'pending_official_confirmation' }),
    stationRow({ stationCode: '48300', year: 2026, month: 1, metricId: 'monthly_rainy_days', value: 0, providerUnit: 'day', unitStatus: 'pending_official_confirmation' }),
    // The provider sent the row but no usable value: an explicit gap.
    stationRow({ stationCode: '48300', year: 2026, month: 9, metricId: 'monthly_rainfall_mm', value: null, qualityStatus: 'missing' }),
    stationRow({ stationCode: '48300', year: 2026, month: 9, metricId: 'monthly_rainy_days', value: null, qualityStatus: 'missing' }),
  ];
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });

  assert.equal(snapshot.payload?.stations.length, 1);
  const station = snapshot.payload!.stations[0];
  assert.equal(station.stationCode, '48300');
  assert.deepEqual(station.months.map((month) => month.month), [1, 8, 9]);
  assert.equal(station.months[0].values.monthly_rainfall_mm, 0, 'a measured zero stays zero');
  assert.equal(station.months[1].values.monthly_rainfall_mm, 377);
  assert.equal(station.months[2].values.monthly_rainfall_mm, null, 'a gap is not turned into 0');
  assert.equal(station.valueCount, 4);
  assert.equal(station.missingValueCount, 2);
  assert.equal(station.unit, null, 'observations.unit is NULL for this resource');
  assert.equal(station.unitStatus, 'pending_official_confirmation');
  assert.deepEqual(station.declaredUnits, { monthly_rainfall_mm: 'mm', monthly_rainy_days: 'day' });
});

test('the provider field order of coordinates is refused instead of guessing a position', async () => {
  // The real batch always carries several rows per station (two metrics × months),
  // so the refusal has to survive merging a second and third row of one station.
  const { reader } = pagingReader([
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainfall_mm', value: 377 }),
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainy_days', value: 25 }),
    stationRow({ stationCode: '48300', year: 2026, month: 9, metricId: 'monthly_rainfall_mm', value: 139.1 }),
  ]);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });
  const station = snapshot.payload!.stations[0];
  // The fixture copies the real payload, where <Latitude> carries the east–west value.
  assert.equal(station.latitude, null, 'a suspect row may not be refilled by a later row of the same station');
  assert.equal(station.longitude, null);
  assert.equal(station.coordinateStatus, 'provider_field_order_suspect');
  assert.equal(station.months.length, 2, 'refusing the position does not drop the values');
});

test('only rows of the monthly rainfall resource are read into the payload', async () => {
  const rows = [
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainfall_mm', value: 377 }),
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'rainfall_mm', value: 999, resourceId: 'https://data.tmd.go.th/api/WeatherTodayBySynop/V1/' }),
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 't2m_max_c', value: 41 }),
  ];
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });
  assert.equal(snapshot.payload?.stations.length, 1);
  assert.equal(snapshot.payload?.stations[0].months[0].values.monthly_rainfall_mm, 377);
  assert.equal(snapshot.batch?.collectedRows, 3, 'the walk counts what the warehouse returned, filters happen after');
});

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

test('a province without a reporting station yields no payload but keeps the readable directory', async () => {
  const rows = [
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainfall_mm', value: 377, provinceCode: '58', provinceNameTh: 'แม่ฮ่องสอน' }),
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainy_days', value: 18, provinceCode: '58', provinceNameTh: 'แม่ฮ่องสอน' }),
  ];
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot({ ...NO_FILTERS, provinceCode: '10' }, { reader, context: NO_CONTEXT });

  assert.equal(snapshot.payload, null);
  assert.notEqual(snapshot.batch, null);
  assert.equal(snapshot.directory?.stations.length, 1);
  assert.deepEqual(snapshot.directory?.provinces, [{ code: '58', name: 'แม่ฮ่องสอน', stationCount: 1 }]);

  const response = monthly.monthlyRainfallResponse(
    { databaseRead: true, batch: snapshot.batch, directory: snapshot.directory, payload: null, filters: { ...NO_FILTERS, provinceCode: '10' } },
    { page: 1, pageSize: 25 },
  );
  assert.equal(response.meta.availability, 'empty');
  assert.deepEqual(response.data.stations, []);
  assert.equal(response.data.summary, null);
  assert.equal(response.data.directory?.stations.length, 1, 'the body still says what can be picked');
  assert.match(response.meta.warnings.join(' '), /ไม่ใช่ "ไม่มีฝน"/);
});

test('a year that is not in the batch returns no rows rather than a neighbouring year', async () => {
  const rows = syntheticBatch(48).map((row) => ({ ...row, dimensions: { ...row.dimensions, year: 2026 } }));
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot({ ...NO_FILTERS, year: 2019 }, { reader, context: NO_CONTEXT });
  assert.equal(snapshot.payload, null);
  assert.deepEqual(snapshot.directory?.years, [2026], 'the directory reports the year that is actually stored');
});

test('a station filter reads that station only', async () => {
  const rows = [
    stationRow({ stationCode: '48300', year: 2026, month: 8, metricId: 'monthly_rainfall_mm', value: 377, provinceCode: '58' }),
    stationRow({ stationCode: '43000', year: 2026, month: 8, metricId: 'monthly_rainfall_mm', value: 210, provinceCode: '51' }),
  ];
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot({ ...NO_FILTERS, stationCode: '43000' }, { reader, context: NO_CONTEXT });
  assert.deepEqual(snapshot.payload?.stations.map((station) => station.stationCode), ['43000']);
  assert.equal(snapshot.payload?.stations[0].months[0].values.monthly_rainfall_mm, 210);
});

/* ------------------------------------------------------------------ */
/* Query validation                                                    */
/* ------------------------------------------------------------------ */

function queryUrl(search: string) {
  return new URL('http://hub.local/api/v1/weather/monthly-rainfall' + search);
}

test('filters accept the documented shapes and drop absent ones', () => {
  assert.deepEqual(repository.parseMonthlyRainfallFilters(queryUrl('')), NO_FILTERS);
  assert.deepEqual(
    repository.parseMonthlyRainfallFilters(queryUrl('?provinceCode=73&stationCode=48300&year=2026')),
    { provinceCode: '73', stationCode: '48300', year: 2026 },
  );
  assert.deepEqual(repository.parseMonthlyRainfallFilters(queryUrl('?stationCode=ST-101')), {
    provinceCode: null, stationCode: 'ST-101', year: null,
  });
});

test('malformed filters are rejected instead of silently reading an empty table', () => {
  for (const search of ['?year=26', '?year=026', '?year=20260', '?year=abcd', '?year=2026-01']) {
    assert.throws(
      () => repository.parseMonthlyRainfallFilters(queryUrl(search)),
      (error: unknown) => (error as { status: number; code: string }).status === 400 &&
        (error as { code: string }).code === 'INVALID_QUERY',
      search + ' must not be read as a year',
    );
  }
  for (const search of ['?provinceCode=7', '?provinceCode=777', '?provinceCode=ab']) {
    assert.throws(() => repository.parseMonthlyRainfallFilters(queryUrl(search)), 'a province code must be 2 digits');
  }
  for (const search of ['?stationCode=48', '?stationCode=' + 'x'.repeat(21), '?stationCode=48%20300']) {
    assert.throws(() => repository.parseMonthlyRainfallFilters(queryUrl(search)), 'a station code must follow the station register format');
  }
  // a percent-encoded zero decodes to a legal code before validation, so it must pass
  assert.equal(repository.parseMonthlyRainfallFilters(queryUrl('?stationCode=48%300')).stationCode, '4800');
});

/* ------------------------------------------------------------------ */
/* The four response states                                            */
/* ------------------------------------------------------------------ */

test('an unreadable warehouse is metadata-only and is not reported as empty data', async () => {
  const failing: Reader = async () => {
    throw new Error('D1 database is not available');
  };
  await assert.rejects(() => repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader: failing, context: NO_CONTEXT }));

  const response = monthly.monthlyRainfallResponse(
    { databaseRead: false, batch: null, directory: null, payload: null, filters: NO_FILTERS },
    { page: 1, pageSize: 25 },
  );
  assert.equal(response.meta.availability, 'metadata_only');
  assert.equal(response.meta.access, 'metadata_only');
  assert.equal(response.meta.runtimeMode, 'source_api_fallback');
  assert.equal(response.meta.datasetVersion, null);
  assert.equal(response.meta.dataAsOf, null);
  assert.deepEqual(response.data.stations, []);
  assert.equal(response.data.summary, null);
  assert.match(response.meta.warnings.join(' '), /อ่านคลังข้อมูลกลางไม่สำเร็จ/);
  assert.match(response.meta.warnings.join(' '), /shown values: none/);
});

test('a successful read with no published batch says so instead of showing zeros', async () => {
  const { reader } = pagingReader([]);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });
  assert.deepEqual(snapshot, { payload: null, batch: null, directory: null });

  const response = monthly.monthlyRainfallResponse(
    { databaseRead: true, batch: null, directory: null, payload: null, filters: NO_FILTERS },
    { page: 1, pageSize: 25 },
  );
  assert.equal(response.meta.availability, 'metadata_only');
  assert.equal(response.meta.runtimeMode, 'database');
  assert.match(response.meta.warnings.join(' '), /ไม่พบ active numeric batch/);
  assert.deepEqual(response.data.stations, []);
  assert.equal(response.data.calculationVersion, monthly.MONTHLY_RAINFALL_CALCULATION_VERSION);
});

test('a ready read takes its dates and version from the rows, and pages by station', async () => {
  const rows = [
    stationRow({ stationCode: '48300', year: 2026, month: 9, metricId: 'monthly_rainfall_mm', value: 139.1, periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
    stationRow({ stationCode: '48300', year: 2026, month: 9, metricId: 'monthly_rainy_days', value: 18, periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
    stationRow({ stationCode: '48300', year: 2026, month: 1, metricId: 'monthly_rainfall_mm', value: 0, periodStart: '2026-01-01', periodEnd: '2026-01-31' }),
    stationRow({ stationCode: '48300', year: 2026, month: 1, metricId: 'monthly_rainy_days', value: 0, periodStart: '2026-01-01', periodEnd: '2026-01-31' }),
    stationRow({ stationCode: '43000', year: 2026, month: 9, metricId: 'monthly_rainfall_mm', value: 210, periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
    stationRow({ stationCode: '43000', year: 2026, month: 9, metricId: 'monthly_rainy_days', value: 21, periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
  ];
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });
  const response = monthly.monthlyRainfallResponse(
    { databaseRead: true, batch: snapshot.batch, directory: snapshot.directory, payload: snapshot.payload, filters: NO_FILTERS },
    { page: 2, pageSize: 1 },
  );
  const firstPage = monthly.monthlyRainfallResponse(
    { databaseRead: true, batch: snapshot.batch, directory: snapshot.directory, payload: snapshot.payload, filters: NO_FILTERS },
    { page: 1, pageSize: 1 },
  );

  assert.equal(response.meta.availability, 'ready');
  assert.equal(response.meta.access, 'approved_public');
  assert.equal(response.meta.completeness, 'complete');
  assert.equal(response.meta.runtimeMode, 'database');
  assert.equal(response.meta.dataAsOf, '2026-09-30', 'the newest period of the rows, not a hard-coded date');
  assert.equal(response.meta.datasetVersion, 'a'.repeat(64), 'the run payload hash');
  assert.equal(response.meta.sourceRetrievedAt, '2026-10-26T13:28:35Z');
  assert.deepEqual(response.meta.sourceIds, ['tmd']);
  assert.equal(response.pagination.total, 2, 'total is the station count of the readable batch');
  assert.deepEqual(firstPage.data.stations.map((station) => station.stationCode), ['43000']);
  assert.deepEqual(response.data.stations.map((station) => station.stationCode), ['48300'],
    'page 2 continues the station order of the readable batch');

  const unitWarning = response.meta.warnings.join(' ');
  assert.match(unitWarning, /pending_official_confirmation/);
  assert.equal(JSON.stringify(response.data).includes('"unit":"mm"'), false, 'the declared unit is metadata, never an asserted field');
});

test('a partial run and a mixed run set are reported without a single version claim', async () => {
  const rows = [
    stationRow({ stationCode: '48300', year: 2026, month: 9, metricId: 'monthly_rainfall_mm', value: 139.1, runStatus: 'partial', runId: 'run-a' }),
    stationRow({ stationCode: '43000', year: 2026, month: 9, metricId: 'monthly_rainfall_mm', value: 210, runId: 'run-b', payloadSha256: 'b'.repeat(64) }),
  ];
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });
  const response = monthly.monthlyRainfallResponse(
    { databaseRead: true, batch: snapshot.batch, directory: snapshot.directory, payload: snapshot.payload, filters: NO_FILTERS },
    { page: 1, pageSize: 25 },
  );
  assert.equal(snapshot.batch?.runCount, 2);
  assert.equal(snapshot.batch?.runId, null);
  assert.equal(snapshot.batch?.runStatus, null);
  assert.equal(response.meta.datasetVersion, null, 'two runs cannot be presented as one snapshot version');
  assert.equal(response.meta.completeness, 'partial');
});

test('the source register is carried in every body so the page cannot claim its own licence', async () => {
  const { reader } = pagingReader(syntheticBatch(2));
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });
  const response = monthly.monthlyRainfallResponse(
    { databaseRead: true, batch: snapshot.batch, directory: snapshot.directory, payload: snapshot.payload, filters: NO_FILTERS },
    { page: 1, pageSize: 25 },
  );
  assert.equal(response.data.source.resourceUrl, RESOURCE);
  assert.equal(response.data.source.grain, 'station × calendar_month');
  assert.equal(response.data.source.licenseStatus, 'approved_public');
  assert.ok(response.data.source.limitations.length >= 3);
});

test('the directory is built from the builder records, so station mapping is never computed twice', async () => {
  const rows = [
    stationRow({ stationCode: '48300', year: 2026, month: 1, metricId: 'monthly_rainfall_mm', value: 0, provinceCode: null, provinceNameTh: null }),
    stationRow({ stationCode: '43000', year: 2026, month: 1, metricId: 'monthly_rainfall_mm', value: 12, provinceCode: '51', provinceNameTh: 'เชียงใหม่' }),
    stationRow({ stationCode: '43001', year: 2025, month: 7, metricId: 'monthly_rainfall_mm', value: 300, provinceCode: '51', provinceNameTh: 'เชียงใหม่' }),
  ];
  const { reader } = pagingReader(rows);
  const snapshot = await repository.readMonthlyRainfallSnapshot(NO_FILTERS, { reader, context: NO_CONTEXT });
  assert.deepEqual(snapshot.directory?.years, [2025, 2026]);
  assert.deepEqual(snapshot.directory?.provinces, [
    { code: '51', name: 'เชียงใหม่', stationCount: 2 },
    { code: null, name: null, stationCount: 1 },
  ]);
  assert.deepEqual(snapshot.directory?.stations.map((station) => station.monthCount), [1, 1, 1]);
});
