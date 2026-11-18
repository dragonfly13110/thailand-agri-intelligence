/**
 * Reviewed ERA5 annual extract (77 province centroids, 2016-2025).
 *
 * The bundled data file is produced by scripts/build_era5_annual_extract.py and
 * tested separately; every test here injects a hand-built envelope so the
 * reader's fail-closed rules and the overview's tier selection can be proven
 * without touching the network or the shared D1 database.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
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
const annual = await import('../lib/hub/climate-history-annual.ts');

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const SHA = 'a'.repeat(64);

function calendarDays(year: number): number {
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
}

function annualYear(year: number, overrides: Record<string, unknown> = {}) {
  const days = calendarDays(year);
  const offset = year - 2016;
  return {
    year,
    tmean_c: Number((27 + offset * 0.02).toFixed(2)),
    tmax_mean_c: Number((33 + offset * 0.03).toFixed(2)),
    tmin_mean_c: Number((22 + offset * 0.01).toFixed(2)),
    hot_days_38c: 10 + offset,
    rainfall_total_mm: 1200 + offset * 5,
    longest_dry_spell_days: 20 + (offset % 5),
    dry_spell_events_5d: 3,
    calendar_days: days,
    days_with_data: {
      temperature_mean: days,
      temperature_max: days,
      temperature_min: days,
      precipitation: days,
    },
    complete_year: true,
    ...overrides,
  };
}

function annualProvince(years: Array<Record<string, unknown>> = years2016to2025()) {
  return {
    requested_latitude: 13.8196,
    requested_longitude: 100.0443,
    provider_grid_latitude: 13.75,
    provider_grid_longitude: 100,
    provider_elevation_m: 5,
    request_url: ARCHIVE_URL
      + '?latitude=13.8196&longitude=100.0443&start_date=2016-01-01&end_date=2025-12-31'
      + '&daily=temperature_2m_mean%2Ctemperature_2m_max%2Ctemperature_2m_min%2Cprecipitation_sum'
      + '&timezone=Asia%2FBangkok&models=era5',
    retrieved_at: '2026-10-31T08:00:00+00:00',
    daily_sha256: SHA,
    daily_rows: 3653,
    first_day: '2016-01-01',
    last_day: '2025-12-31',
    years,
  };
}

function years2016to2025() {
  const rows: Array<Record<string, unknown>> = [];
  for (let year = 2016; year <= 2025; year += 1) rows.push(annualYear(year));
  return rows;
}

function annualEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'tadih-era5-annual-extract-v1',
    source_id: 'open_meteo',
    provider_model: 'era5',
    data_kind: 'estimated',
    spatial_support: 'grid_point',
    licence: 'CC-BY-4.0',
    attribution: 'Weather data by Open-Meteo.com',
    attribution_url: 'https://open-meteo.com/',
    timezone: 'Asia/Bangkok',
    first_year: 2016,
    last_year: 2025,
    generated_at: '2026-10-31T08:05:00+00:00',
    daily_sha256_basis: 'sha256 of canonical JSON (sorted keys, compact UTF-8) of latitude, longitude, timezone, daily_units and the four daily arrays',
    provinces: { '73': annualProvince() },
    ...overrides,
  };
}

const emptyReader = async () => ({ rows: [], total: 0 });

async function withEmptyCacheRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'annual-l5-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/* ---------------------------------------------------------------- */
/* Reader                                                             */
/* ---------------------------------------------------------------- */

test('annual extract serves a full 2016-2025 window from the reviewed envelope', () => {
  const read = annual.readReviewedAnnualExtract('73', 2016, 2025, { extract: annualEnvelope() });
  assert.equal(read.status, 'ok');
  if (read.status !== 'ok') return;
  assert.equal(read.province.provinceCode, '73');
  assert.equal(read.years.length, 10);
  assert.deepEqual(read.missingYears, []);
  assert.equal(read.years[0].year, 2016);
  assert.equal(read.years[0].calendarDays, 366);
  assert.equal(read.years[0].completeYear, true);
  assert.equal(read.years[0].tmeanC, 27);
  assert.equal(read.years[9].rainfallTotalMm, 1245);
  assert.equal(read.years[9].daysWithData.temperatureMax, 365);
});

test('annual extract filters the requested window and never invents years', () => {
  const middle = annual.readReviewedAnnualExtract('73', 2018, 2022, { extract: annualEnvelope() });
  assert.equal(middle.status, 'ok');
  if (middle.status === 'ok') {
    assert.deepEqual(middle.years.map((row: { year: number }) => row.year), [2018, 2019, 2020, 2021, 2022]);
    assert.deepEqual(middle.missingYears, []);
  }

  const straddle = annual.readReviewedAnnualExtract('73', 2014, 2018, { extract: annualEnvelope() });
  assert.equal(straddle.status, 'ok');
  if (straddle.status === 'ok') {
    assert.deepEqual(straddle.years.map((row: { year: number }) => row.year), [2016, 2017, 2018]);
    assert.deepEqual(straddle.missingYears, [2014, 2015]);
  }

  const outside = annual.readReviewedAnnualExtract('73', 2005, 2014, { extract: annualEnvelope() });
  assert.equal(outside.status, 'ok');
  if (outside.status === 'ok') {
    assert.deepEqual(outside.years, []);
    assert.deepEqual(outside.missingYears, []);
  }

  const unknown = annual.readReviewedAnnualExtract('10', 2016, 2025, { extract: annualEnvelope() });
  assert.equal(unknown.status, 'unknown_province');
});

test('annual extract rejects inconsistent rows and provider drift with a reason', () => {
  const cases: Array<{ extract: Record<string, unknown>; includes: string }> = [
    {
      extract: annualEnvelope({ licence: 'CC-BY-NC-4.0' }),
      includes: 'licence',
    },
    {
      extract: annualEnvelope({ timezone: 'UTC' }),
      includes: 'timezone',
    },
    {
      extract: annualEnvelope({
        provinces: {
          '73': annualProvince([
            annualYear(2016, { complete_year: true, days_with_data: {
              temperature_mean: 366, temperature_max: 366, temperature_min: 366, precipitation: 365,
            } }),
          ]),
        },
      }),
      includes: 'complete_year',
    },
    {
      extract: annualEnvelope({
        provinces: {
          '73': annualProvince([annualYear(2016, { tmin_mean_c: 40 })]),
        },
      }),
      includes: 'ต่ำสุด',
    },
    {
      extract: annualEnvelope({
        provinces: {
          '73': annualProvince([annualYear(2016), annualYear(2016)]),
        },
      }),
      includes: 'ซ้ำ',
    },
    {
      extract: annualEnvelope({
        provinces: { '73': { ...annualProvince(), daily_sha256: 'abc' } },
      }),
      includes: 'sha256',
    },
    {
      extract: annualEnvelope({
        provinces: { '73': { ...annualProvince(), request_url: 'https://example.com/archive' } },
      }),
      includes: 'request_url',
    },
  ];
  for (const entry of cases) {
    const result = annual.validateAnnualExtract(entry.extract);
    assert.equal(result.ok, false, entry.includes);
    if (!result.ok) assert.ok(result.reason.includes(entry.includes), `${result.reason} misses ${entry.includes}`);
    const read = annual.readReviewedAnnualExtract('73', 2016, 2025, { extract: entry.extract });
    assert.equal(read.status, 'invalid', entry.includes);
  }
});

/* ---------------------------------------------------------------- */
/* Tier selection                                                     */
/* ---------------------------------------------------------------- */

test('tier selection prefers the most years and governed ties', () => {
  const select = climateData.selectClimateTier;
  assert.equal(select({ storeYears: 0, cacheYears: 0, annualYears: 0 }), null);
  assert.equal(select({ storeYears: 1, cacheYears: 0, annualYears: 10 }), 'reviewed_annual_extract');
  assert.equal(select({ storeYears: 0, cacheYears: 1, annualYears: 10 }), 'reviewed_annual_extract');
  assert.equal(select({ storeYears: 10, cacheYears: 0, annualYears: 10 }), 'd1_published_batch');
  assert.equal(select({ storeYears: 0, cacheYears: 10, annualYears: 10 }), 'reviewed_annual_extract');
  assert.equal(select({ storeYears: 8, cacheYears: 0, annualYears: 10 }), 'reviewed_annual_extract');
  assert.equal(select({ storeYears: 10, cacheYears: 10, annualYears: 10 }), 'd1_published_batch');
});

/* ---------------------------------------------------------------- */
/* Overview integration                                               */
/* ---------------------------------------------------------------- */

test('overview serves the annual tier with real yearly aggregates and honest scope', async () => {
  await withEmptyCacheRoot(async (cacheRoot) => {
    const overview = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2016, endYear: 2025 },
      { storeReader: emptyReader, cacheRoot, annualExtract: annualEnvelope() },
    );
    assert.equal(overview.dataKind, 'real');
    assert.equal(overview.sample, false);
    assert.equal(overview.years.length, 10);
    assert.equal(overview.yearsWithData, 10);
    assert.equal(overview.scope.tier, 'reviewed_annual_extract');
    assert.deepEqual(overview.scope.yearsMissing, []);
    assert.equal(overview.scope.dailyRowsRead, 3653);
    assert.equal(overview.scope.firstDayWithData, '2016-01-01');
    assert.equal(overview.scope.lastDayWithData, '2025-12-31');
    assert.deepEqual(overview.scope.variablesPublished, ['t2m_mean_c', 't2m_max_c', 't2m_min_c', 'precip_mm']);
    assert.deepEqual(overview.scope.variablesNotPublishedHere, []);
    assert.equal(overview.scope.gridPoint.providerGridLatitude, 13.75);
    assert.equal(overview.scope.gridPoint.requestedLatitude, 13.8196);
    assert.ok(overview.scope.grainNoteTh.includes('รายปี'));

    const first = overview.years[0];
    assert.equal(first.tmeanC, 27);
    assert.equal(first.tmaxMeanC, 33);
    assert.equal(first.tminMeanC, 22);
    assert.equal(first.hotDays38C, 10);
    assert.equal(first.rainfallTotalMm, 1200);
    assert.equal(first.completeYear, true);
    assert.equal(first.daysWithData.temperatureMean, 366);

    assert.equal(overview.baseline.tmeanNormalC, 27.09);
    assert.equal(overview.baseline.tminNormalC, 22.05);
    assert.equal(overview.baseline.rainfallNormalMm, 1222.5);
    assert.equal(overview.trends.tmeanPerDecadeC, 0.2);
    assert.equal(overview.trends.rainfallTrendMmPerDecade, 50);
    assert.equal(overview.trends.firstFiveYearMeanC, 27.04);
    assert.equal(overview.trends.lastFiveYearMeanC, 27.14);
    assert.equal(overview.trends.warmingDeltaC, 0.1);
    const hottest = overview.notableYears.find((row: { reason: string }) => row.reason === 'hottest');
    assert.equal(hottest?.year, 2025);
    const coldest = overview.notableYears.find((row: { reason: string }) => row.reason === 'coldest');
    assert.equal(coldest?.year, 2016);
    assert.equal(coldest?.value, 22);
    assert.equal(coldest?.unit, '°C');
    assert.equal(coldest?.normalC, 22.05);
    const driest = overview.notableYears.find((row: { reason: string }) => row.reason === 'driest');
    assert.equal(driest?.year, 2016);
    const longestSpell = overview.notableYears.find((row: { reason: string }) => row.reason === 'longest_dry_spell');
    assert.equal(longestSpell?.year, 2020);

    assert.equal(overview.provenance.readThrough, 'reviewed_annual_extract');
    assert.equal(overview.provenance.resourceId, ARCHIVE_URL);
    assert.equal(overview.provenance.license, 'CC-BY-4.0');
    assert.equal(overview.provenance.sourceRetrievedAt, '2026-10-31T08:00:00+00:00');
    assert.deepEqual(overview.provenance.cacheChecksums, [SHA]);
    assert.equal(overview.dataAsOf, '2026-10-31T08:00:00+00:00');

    const warnings = climateData.climateHistoryMetaWarnings(overview);
    assert.ok(warnings.some((warning: string) => warning.includes('รายปี')));
    assert.ok(warnings.some((warning: string) => warning.includes('ครบทั้ง 77')));
    assert.ok(!warnings.some((warning: string) => warning.includes('ไม่ได้หมายความว่ามีข้อมูลครอบคลุมทุกจังหวัด')));
    assert.ok(!warnings.some((warning: string) => warning.includes('tmean และ tmin')), 'annual tier publishes tmean/tmin');
  });
});

test('a governed D1 batch still wins an equal-year tie, and an invalid extract stays empty', async () => {
  await withEmptyCacheRoot(async (cacheRoot) => {
    const storeRows: Array<Record<string, unknown>> = [];
    for (let year = 2016; year <= 2025; year += 1) {
      storeRows.push({
        resourceId: ARCHIVE_URL,
        runId: 'run-tie',
        runStatus: 'succeeded',
        rowKey: `precip_mm|73|${year}-01-01`,
        seriesKey: 'era5|precip_mm',
        sourceId: 'open_meteo',
        payloadSha256: null,
        sourceRetrievedAt: '2026-10-26T15:58:50.934521Z',
        periodStart: `${year}-01-01T00:00:00Z`,
        periodEnd: null,
        locationId: 'open-meteo:era5:73',
        provinceCode: null,
        metricId: 'precip_mm',
        unit: 'mm',
        value: 1,
        dimensions: { provinceCode: '73', observationDateIct: `${year}-01-01`, gridLatitude: 13.75, gridLongitude: 100 },
        qualityStatus: 'good',
      });
    }
    const tie = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2016, endYear: 2025 },
      {
        storeReader: async () => ({ rows: storeRows as never[], total: storeRows.length }),
        cacheRoot,
        annualExtract: annualEnvelope(),
      },
    );
    assert.equal(tie.dataKind, 'real');
    if (tie.dataKind !== 'real') return;
    assert.equal(tie.scope.tier, 'd1_published_batch');

    const invalid = await climateData.buildClimateHistoryOverview(
      { provinceCode: '73', startYear: 2016, endYear: 2025 },
      { storeReader: emptyReader, cacheRoot, annualExtract: annualEnvelope({ licence: 'unknown' }) },
    );
    assert.equal(invalid.dataKind, 'empty');
    assert.deepEqual(invalid.years, []);
  });
});
