/**
 * Lane L5 (2026-10-30 multi-lane round): real climate-history read path.
 *
 * Deterministic by construction: the D1 store is always an injected fake
 * reader and the reviewed ERA5 cache is rebuilt in a temp directory, so no
 * test touches the network or the shared Cloudflare database. Route-level
 * assertions only exercise the provable-empty province (10) which has no
 * reviewed cache point on any machine.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import ts from 'typescript';

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
            // Try another TypeScript resolution before rethrowing the original.
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
        source: ts.transpileModule(source, {
          fileName: new URL(url).pathname,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            isolatedModules: true,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const climateData = await import('../lib/hub/climate-history-data.ts');
const climateStore = await import('../lib/hub/climate-history-store.ts');
const climateCache = await import('../lib/hub/climate-history-cache.ts');
const climateRoute = await import('../app/api/v1/climate-history/route.ts');

const HUB_ORIGIN = 'http://hub.local';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

/* ---------------------------------------------------------------- */
/* Reviewed-cache fixtures (province 73 point 13.8 / 100.25)          */
/* ---------------------------------------------------------------- */

function calendarDates(year: number): string[] {
  const count = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
  const dates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(new Date(Date.UTC(year, 0, 1 + index)).toISOString().slice(0, 10));
  }
  return dates;
}

/** Deterministic daily rainfall; one deliberate null in 2020 to prove null != 0. */
function fixturePrecip(year: number, date: string, dayIndex: number): number | null {
  if (year === 2020 && date === '2020-06-05') return null;
  return (dayIndex % 15) < 10 ? 0 : 12;
}

function fixtureTmax(dayIndex: number): number {
  return 35 + (dayIndex % 6);
}

async function writeCachePartition(
  root: string,
  year: number,
  options: { corruptDailyArrays?: boolean } = {},
): Promise<void> {
  const partition = `era5-13.8-100.25-${year}`;
  const dir = join(root, partition);
  await mkdir(dir, { recursive: true });
  const dates = calendarDates(year);
  const artifact = `fakesha-${year}.json`;
  const envelope = {
    source_id: 'open_meteo',
    provider_model: 'era5',
    data_kind: 'estimated',
    spatial_support: 'grid_point',
    licence: 'CC-BY-4.0',
    attribution: 'Weather data by Open-Meteo (https://open-meteo.com/)',
    requested_location: { latitude: 13.8, longitude: 100.25 },
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    request_url: ARCHIVE_URL + `?latitude=13.8&longitude=100.25&start_date=${year}-01-01&end_date=${year}-12-31&daily=precipitation_sum`,
    retrieved_at: `${year + 1}-01-05T06:00:00Z`,
    payload: {
      latitude: 13.75,
      longitude: 100.25,
      timezone: 'Asia/Bangkok',
      daily_units: {
        precipitation_sum: 'mm',
        temperature_2m_max: '°C',
        et0_fao_evapotranspiration: 'mm',
      },
      daily: {
        time: dates,
        precipitation_sum: options.corruptDailyArrays
          ? dates.slice(0, dates.length - 1).map((date, index) => fixturePrecip(year, date, index))
          : dates.map((date, index) => fixturePrecip(year, date, index)),
        temperature_2m_max: dates.map((_, index) => fixtureTmax(index)),
        et0_fao_evapotranspiration: dates.map(() => 2.5),
      },
    },
  };
  await writeFile(join(dir, artifact), JSON.stringify(envelope));
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({
    status: 'success',
    source_id: 'open_meteo',
    partition_key: partition,
    artifact,
    checksum: `fakesha-${year}`,
  }));
}

async function withTempRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'lane-l5-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ---------------------------------------------------------------- */
/* Fake published-D1 observation readers                              */
/* ---------------------------------------------------------------- */

function era5Row(options: {
  provinceCode: string;
  day: string;
  metricId: string;
  unit: string;
  value: number | null;
}): Record<string, unknown> {
  return {
    resourceId: ARCHIVE_URL,
    runId: 'run-2026-10-26',
    runStatus: 'succeeded',
    rowKey: options.metricId + '|' + options.provinceCode + '|' + options.day,
    seriesKey: 'era5|' + options.metricId,
    sourceId: 'open_meteo',
    payloadSha256: '18754aec2cacbbdc3049cd5166c18570d77f06754b56314ddc5d644cedf24808',
    sourceRetrievedAt: '2026-10-26T15:58:50.934521Z',
    periodStart: options.day + 'T00:00:00Z',
    periodEnd: null,
    locationId: 'open-meteo:era5:' + options.provinceCode,
    provinceCode: null, // grid rows keep the province column NULL by design
    metricId: options.metricId,
    unit: options.unit,
    value: options.value,
    dimensions: {
      provinceCode: options.provinceCode,
      observationDateIct: options.day,
      requestedLatitude: 13.8196,
      requestedLongitude: 100.0443,
      gridLatitude: 13.75,
      gridLongitude: 100.0,
    },
    qualityStatus: options.value === null ? 'missing' : 'good',
  };
}

function fakeReader(rows: Array<Record<string, unknown>>, total = rows.length) {
  return async (filters: { resourceId: string }, options: { limit: number; offset: number }) => ({
    rows: rows.slice(options.offset, options.offset + options.limit) as never[],
    total,
  });
}

const emptyReader = fakeReader([]);
const throwingReader = async () => {
  throw new Error('D1 database is not available');
};

/** Three published days for province 73 in October 2026 (mirrors the live batch shape). */
function buildBatch2026Rows() {
  const days = [
    { day: '2026-10-13', rain: 0.0, tmax: 35.0 },
    { day: '2026-10-14', rain: null, tmax: 39.0 },
    { day: '2026-10-15', rain: 5.5, tmax: 41.0 },
  ];
  const rows = [];
  for (const entry of days) {
    rows.push(era5Row({ provinceCode: '73', day: entry.day, metricId: 't2m_mean_c', unit: '°C', value: 30.0 }));
    rows.push(era5Row({ provinceCode: '73', day: entry.day, metricId: 't2m_max_c', unit: '°C', value: entry.tmax }));
    rows.push(era5Row({ provinceCode: '73', day: entry.day, metricId: 't2m_min_c', unit: '°C', value: 25.0 }));
    rows.push(era5Row({ provinceCode: '73', day: entry.day, metricId: 'precip_mm', unit: 'mm', value: entry.rain }));
  }
  // Decoy: another province must never leak into this grid point's response.
  rows.push(era5Row({ provinceCode: '10', day: '2026-10-13', metricId: 'precip_mm', unit: 'mm', value: 99.9 }));
  return rows;
}

const batch2026Rows = buildBatch2026Rows();

function roundFixture(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function expectedYear(year: number) {
  const dates = calendarDates(year);
  let rain = 0;
  let rainDays = 0;
  let tmaxSum = 0;
  let hot = 0;
  let longest = 0;
  let run = 0;
  let events = 0;
  dates.forEach((date, index) => {
    const precip = fixturePrecip(year, date, index);
    const tmax = fixtureTmax(index);
    tmaxSum += tmax;
    if (tmax > 38) hot += 1;
    if (precip !== null) {
      rainDays += 1;
      rain += precip;
    }
    const dry = precip !== null && precip < 1;
    if (dry) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      if (run >= 5) events += 1;
      run = 0;
    }
  });
  if (run >= 5) events += 1;
  return {
    calendarDays: dates.length,
    rainfallTotalMm: roundFixture(rain, 1),
    rainDays,
    tmaxMeanC: roundFixture(tmaxSum / dates.length, 2),
    hotDays38C: hot,
    longestDrySpellDays: longest,
    drySpellEvents5d: events,
  };
}

/* ---------------------------------------------------------------- */
/* Tests                                                              */
/* ---------------------------------------------------------------- */

test('cache tier serves a real 2016-2025 overview with exact per-year aggregates', async () => {
  await withTempRoot(async (root) => {
    for (let year = 2016; year <= 2025; year += 1) await writeCachePartition(root, year);
    const overview = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2016, endYear: 2025 },
      { storeReader: emptyReader, cacheRoot: root },
    );
    assert.equal(overview.dataKind, 'real');
    assert.equal(overview.sample, false);
    assert.equal(overview.years.length, 10);
    assert.equal(overview.yearsWithData, 10);
    assert.equal(overview.scope.tier, 'reviewed_cache_point');
    assert.deepEqual(overview.scope.yearsMissing, []);
    assert.equal(overview.scope.rejectedCacheYears.length, 0);
    assert.equal(overview.scope.dailyRowsRead, 3653);
    assert.equal(overview.scope.gridPoint.providerGridLatitude, 13.75);
    assert.deepEqual(overview.scope.variablesNotPublishedHere, ['t2m_mean_c', 't2m_min_c']);
    assert.equal(overview.scope.firstDayWithData, '2016-01-01');
    assert.equal(overview.scope.lastDayWithData, '2025-12-31');

    for (const row of overview.years) {
      const expected = expectedYear(row.year);
      assert.equal(row.calendarDays, expected.calendarDays);
      assert.equal(row.tmeanC, null, 'tmean stays null when the tier does not publish it');
      assert.equal(row.tminMeanC, null);
      assert.equal(row.daysWithData.temperatureMean, 0);
      assert.equal(row.tmaxMeanC, expected.tmaxMeanC);
      assert.equal(row.hotDays38C, expected.hotDays38C);
      assert.equal(row.rainfallTotalMm, expected.rainfallTotalMm);
      assert.equal(row.longestDrySpellDays, expected.longestDrySpellDays);
      assert.equal(row.drySpellEvents5d, expected.drySpellEvents5d);
      if (row.year === 2020) {
        // The single null day must reduce coverage, not be counted as 0 mm.
        assert.equal(row.completeYear, false);
        assert.equal(row.daysWithData.precipitation, expected.calendarDays - 1);
        assert.equal(row.rainfallTotalMm, expected.rainfallTotalMm); // null skipped, not zeroed
      } else {
        assert.equal(row.completeYear, true);
        assert.equal(row.daysWithData.precipitation, expected.calendarDays);
      }
    }

    // Baseline/trends/notables come only from the nine complete years.
    assert.equal(overview.baseline.tmeanNormalC, null);
    assert.ok(overview.baseline.tmaxNormalC !== null);
    assert.ok(Number.isFinite(overview.baseline.rainfallNormalMm as number));
    assert.equal(overview.trends.tmeanPerDecadeC, null);
    for (const notable of overview.notableYears) {
      assert.notEqual(notable.year, 2020, 'incomplete years never appear as notable extremes');
    }
    assert.ok(overview.notableYears.length >= 4);

    assert.equal(overview.provenance.readThrough, 'reviewed_local_snapshot');
    assert.equal(overview.provenance.resourceId, ARCHIVE_URL);
    assert.equal(overview.provenance.license, 'CC-BY-4.0');
    assert.equal(overview.provenance.cacheChecksums.length, 10);
    assert.equal(overview.provenance.cacheRetrievedAtFirst, '2017-01-05T06:00:00Z');
    assert.equal(overview.dataAsOf, '2026-01-05T06:00:00Z');

    const warnings = climateData.climateHistoryMetaWarnings(overview);
    assert.ok(warnings.some((w: string) => w.includes('จุดกริดเดียว')));
    assert.ok(warnings.some((w: string) => w.includes('tmean')));
    assert.ok(!warnings.some((w: string) => w.includes('CHIRPS')), 'CHIRPS note only for the empty branch');
  });
});

test('D1 published-batch tier serves the 2026 days honestly (partial year, null kept)', async () => {
  await withTempRoot(async (root) => {
    // Empty cache root: every year is rejected as missing, store tier must win.
    const overview = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2017, endYear: 2026 },
      { storeReader: fakeReader(batch2026Rows), cacheRoot: root },
    );
    assert.equal(overview.dataKind, 'real');
    assert.equal(overview.scope.tier, 'd1_published_batch');
    assert.equal(overview.years.length, 1);
    const [year2026] = overview.years;
    assert.equal(year2026.year, 2026);
    assert.equal(year2026.completeYear, false);
    assert.equal(year2026.calendarDays, 365);
    assert.equal(year2026.daysWithData.precipitation, 2, 'the null rain day is not counted as data');
    assert.equal(year2026.rainfallTotalMm, 5.5, 'null stays out of the sum instead of becoming 0');
    assert.equal(year2026.tmeanC, 30);
    assert.equal(year2026.hotDays38C, 2);
    assert.equal(year2026.longestDrySpellDays, 1, 'the null day breaks the dry run');
    assert.equal(year2026.drySpellEvents5d, 0);
    assert.equal(overview.scope.dailyRowsRead, 12, 'the province-10 decoy row must not be read');
    assert.deepEqual(
      overview.scope.yearsMissing,
      [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
    );
    assert.equal(overview.scope.rejectedCacheYears.length, 9);
    assert.equal(overview.scope.rowsCapped, false);
    assert.equal(overview.scope.gridPoint.providerGridLatitude, 13.75);
    assert.equal(overview.scope.firstDayWithData, '2026-10-13');
    assert.equal(overview.scope.lastDayWithData, '2026-10-15');

    // No complete year exists, so every annual-summary field stays null.
    assert.deepEqual(overview.baseline, {
      tmeanNormalC: null, tmaxNormalC: null, rainfallNormalMm: null, hotDaysNormal: null,
    });
    assert.deepEqual(overview.notableYears, []);
    for (const value of Object.values(overview.trends)) assert.equal(value, null);

    assert.equal(overview.provenance.readThrough, 'd1_active_numeric_run');
    assert.equal(overview.provenance.runId, 'run-2026-10-26');
    assert.equal(overview.provenance.runStatus, 'succeeded');
    assert.equal(overview.provenance.payloadSha256, '18754aec2cacbbdc3049cd5166c18570d77f06754b56314ddc5d644cedf24808');
    assert.equal(overview.dataAsOf, '2026-10-26T15:58:50.934521Z');

    const warnings = climateData.climateHistoryMetaWarnings(overview);
    assert.ok(warnings.some((w: string) => w.includes('2017, 2018')));
    assert.ok(warnings.some((w: string) => w.includes('d1') || w.includes('D1')));
  });
});

test('tier selection: equal year counts prefer the governed D1 batch; store outage falls back to cache', async () => {
  await withTempRoot(async (root) => {
    await writeCachePartition(root, 2024);
    const storeRows = batch2026Rows
      .filter((row) => row.periodStart !== undefined)
      .map((row) => ({
        ...row,
        periodStart: String(row.periodStart).replace('2026-10', '2024-10'),
        dimensions: {
          ...(row.dimensions as Record<string, unknown>),
          observationDateIct: String((row.dimensions as Record<string, unknown>).observationDateIct).replace('2026-10', '2024-10'),
        },
      }));
    const tie = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2015, endYear: 2024 },
      { storeReader: fakeReader(storeRows), cacheRoot: root },
    );
    assert.equal(tie.dataKind, 'real');
    assert.equal(tie.scope.tier, 'd1_published_batch', '1 store year vs 1 cache year -> governed store wins');

    const outage = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2015, endYear: 2024 },
      { storeReader: throwingReader as never, cacheRoot: root },
    );
    assert.equal(outage.dataKind, 'real');
    assert.equal(outage.scope.tier, 'reviewed_cache_point', 'D1 errors must degrade to cache, never to fabricated numbers');
  });
});

test('a corrupt cache partition is rejected with a reason and never served', async () => {
  await withTempRoot(async (root) => {
    await writeCachePartition(root, 2024, { corruptDailyArrays: true });
    const read = await climateCache.readReviewedEra5Cache('73', 2024, 2024, { root });
    assert.ok(read);
    assert.equal(read.years.length, 0);
    assert.equal(read.rejected.length, 1);
    assert.ok(String(read.rejected[0].reason).includes('ความยาวอาร์เรย์'));

    const overview = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2015, endYear: 2024 },
      { storeReader: emptyReader, cacheRoot: root },
    );
    assert.equal(overview.dataKind, 'empty', 'nothing verifiable -> honest empty branch');
    assert.equal(overview.sample, false);
    assert.deepEqual(overview.years, []);
  });
});

test('route keeps the pinned empty contract for a province with no reviewed point', async () => {
  const response = await climateRoute.GET(
    new Request(new URL('/api/v1/climate-history?provinceCode=10&startYear=2005&endYear=2024', HUB_ORIGIN)),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body.data).sort(), [
    'baseline', 'dataKind', 'endYear', 'location', 'notableYears', 'sample', 'source',
    'startYear', 'trends', 'units', 'years', 'yearsSpan', 'yearsWithData',
  ]);
  assert.equal(body.data.dataKind, 'empty');
  assert.equal(body.meta.availability, 'empty');
  assert.equal(body.meta.access, 'metadata_only');
  assert.deepEqual(body.meta.sourceIds, []);
  assert.ok(body.meta.warnings.some((warning: string) => warning.includes('CHIRPS')));
});

test('route preserves query validation boundaries (including the 2026 ceiling)', async () => {
  for (const path of [
    '/api/v1/climate-history?provinceCode=99&startYear=2005&endYear=2024',
    '/api/v1/climate-history?provinceCode=10&startYear=2020&endYear=2024',
    '/api/v1/climate-history?provinceCode=73&startYear=2005&endYear=2026',
    '/api/v1/climate-history?provinceCode=73&startYear=2007&endYear=2027',
    '/api/v1/climate-history?provinceCode=73&startYear=1979&endYear=1999',
  ]) {
    const response = await climateRoute.GET(new Request(new URL(path, HUB_ORIGIN)));
    assert.equal(response.status, 400, path);
    const body = await response.json();
    assert.equal(body.error.code, 'INVALID_QUERY', path);
  }
  const ok = await climateRoute.GET(
    new Request(new URL('/api/v1/climate-history?provinceCode=10&startYear=2007&endYear=2026', HUB_ORIGIN)),
  );
  assert.equal(ok.status, 200);
});

test('CHIRPS sample reader maps the three published cells with null preserved', async () => {
  const cells = [
    {
      resourceId: 'chirps', runId: 'run-chirps', runStatus: 'partial', rowKey: 'c1', seriesKey: 's',
      sourceId: 'chirps', periodStart: '2026-09-30T00:00:00Z', locationId: 'chirps:924:5605',
      metricId: 'rainfall', unit: 'mm', value: 12.4, qualityStatus: 'good',
      dimensions: { gridRow: 924, gridCol: 5605, latitude: 14.38, longitude: 99.03 },
      payloadSha256: '50f2fc44849cfde3b119cedbd63306da19ecf57c3bc2d438c1e027a6f383de53',
      sourceRetrievedAt: '2026-10-25T00:00:00Z',
    },
    {
      resourceId: 'chirps', runId: 'run-chirps', runStatus: 'partial', rowKey: 'c2', seriesKey: 's',
      sourceId: 'chirps', periodStart: '2026-09-30T00:00:00Z', locationId: 'chirps:825:5580',
      metricId: 'rainfall', unit: 'mm', value: null, qualityStatus: 'missing',
      dimensions: { gridRow: 825, gridCol: 5580, latitude: 15.88, longitude: 99.0 },
      payloadSha256: '50f2fc44849cfde3b119cedbd63306da19ecf57c3bc2d438c1e027a6f383de53',
      sourceRetrievedAt: '2026-10-25T00:00:00Z',
    },
    {
      resourceId: 'chirps', runId: 'run-chirps', runStatus: 'partial', rowKey: 'c3', seriesKey: 's',
      sourceId: 'chirps', periodStart: '2026-09-30T00:00:00Z', locationId: 'chirps:871:5656',
      metricId: 'rainfall', unit: 'mm', value: 0.0, qualityStatus: 'good',
      dimensions: { gridRow: 871, gridCol: 5656, latitude: 15.15, longitude: 99.38 },
      payloadSha256: '50f2fc44849cfde3b119cedbd63306da19ecf57c3bc2d438c1e027a6f383de53',
      sourceRetrievedAt: '2026-10-25T00:00:00Z',
    },
  ];
  const read = await climateStore.readChirpsGridSample({ reader: fakeReader(cells) as never });
  assert.equal(read.cells.length, 3);
  assert.equal(read.runStatus, 'partial');
  assert.equal(read.capped, false);
  assert.equal(read.payloadSha256, '50f2fc44849cfde3b119cedbd63306da19ecf57c3bc2d438c1e027a6f383de53');
  const [first, second, third] = read.cells;
  assert.equal(first.locationId, 'chirps:825:5580', 'cells are served in deterministic order');
  assert.equal(first.rainfallMm, null, 'a null CHIRPS cell stays null, never 0');
  assert.equal(first.qualityStatus, 'missing');
  assert.equal(second.gridRow, 871);
  assert.equal(second.rainfallMm, 0, 'a genuine 0.0 mm reading remains distinguishable from null');
  assert.equal(third.gridRow, 924);
  assert.equal(third.observedDay, '2026-09-30');

  const capped = await climateStore.readChirpsGridSample({ reader: fakeReader(cells, 9) as never });
  assert.equal(capped.capped, true);
  assert.equal(capped.total, 9);
});
