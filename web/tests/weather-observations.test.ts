/**
 * Weather observation payload contract tests (Real Data R3-C).
 *
 * `buildWeatherObservations` is the only place that turns published D1
 * observation rows into the public station shape, so these tests pin the
 * data-quality rules that the water lane proved out: one observation date per
 * payload, missing rows that stay null (never 0), units that are never asserted,
 * province matching through `dimensions`, and a reanalysis block that cannot be
 * mistaken for an observation. Runs fully in-memory; no D1 request.
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

const weather = await import('../lib/hub/weather-observations-data.ts');

type Row = import('../lib/hub/weather-observations-data.ts').WeatherObservationInput;

const AGRO = 'https://data.tmd.go.th/api/WeatherTodayByAgro/V1/';
const SYNOP = 'https://data.tmd.go.th/api/WeatherTodayBySynop/V1/';

function stationRow(overrides: Partial<Row> & { locationCode: string; metricId: string }): Row {
  return {
    resourceId: AGRO,
    locationId: 'loc-' + overrides.locationCode,
    locationName: 'สถานี ' + overrides.locationCode,
    value: 30,
    unit: null,
    periodStart: '2026-10-26',
    periodEnd: '2026-10-26',
    qualityStatus: 'good',
    sourceRowRef: overrides.locationCode + ':' + overrides.metricId,
    dimensions: { stationCode: overrides.locationCode, network: 'agro', unitStatus: 'pending_official_confirmation' },
    ...overrides,
  };
}

function withProvince(row: Row, code: string, name: string): Row {
  return { ...row, dimensions: { ...row.dimensions, provinceCode: code, provinceNameTh: name } };
}

test('station rows for one day pivot into one record with both metrics', () => {
  const payload = weather.buildWeatherObservations([
    stationRow({ locationCode: '48304', metricId: 'tmax_c', value: 34.5, dimensions: { stationCode: '48304', network: 'agro', stationNameTh: 'เชียงใหม่', latitude: '19.87', providerUnit: 'celcius' } }),
    stationRow({ locationCode: '48304', metricId: 'rainfall_mm', value: 23, dimensions: { stationCode: '48304', network: 'agro', stationNameTh: 'เชียงใหม่', providerUnit: 'mm' } }),
  ]);
  assert.ok(payload, 'payload must exist when a batch is published');
  assert.equal(payload.stations.length, 1, 'one station, not one row per metric');
  const [station] = payload.stations;
  assert.equal(station.values.tmax_c, 34.5);
  assert.equal(station.values.rainfall_mm, 23);
  assert.equal(station.reportedMetricCount, 2);
  assert.equal(station.observedAtIct, null, 'missing source timestamp stays null');
  assert.deepEqual(station.sourceRowRefs, ['48304:rainfall_mm', '48304:tmax_c']);
});

test('units are never asserted: value published, unit null, provider unit kept as metadata', () => {
  const payload = weather.buildWeatherObservations([
    stationRow({ locationCode: '48333', metricId: 'tmax_c', value: 35.3, dimensions: { stationCode: '48333', providerUnit: 'celcius', unitStatus: 'pending_official_confirmation' } }),
  ]);
  const [station] = payload!.stations;
  assert.equal(station.unit, null, 'TMD unit is not confirmed, so it must stay null');
  assert.equal(station.unitStatus, 'pending_official_confirmation');
  assert.equal(station.declaredUnits.tmax_c, 'celcius', 'provider-declared unit is surfaced as metadata only');
  assert.equal(JSON.stringify(payload).includes('"unit":"celcius"'), false, 'the payload must not publish a confirmed unit');
});

test('a missing row stays null and is counted, never turned into zero', () => {
  const payload = weather.buildWeatherObservations([
    stationRow({ locationCode: '48334', metricId: 'rainfall_mm', value: null, qualityStatus: 'missing' }),
    stationRow({ locationCode: '48334', metricId: 'tmax_c', value: 35.6 }),
    stationRow({ locationCode: '48335', metricId: 'rainfall_mm', value: 0 }),
  ]);
  const missing = payload!.stations.find((row) => row.stationCode === '48334')!;
  const zero = payload!.stations.find((row) => row.stationCode === '48335')!;
  assert.equal(missing.values.rainfall_mm, null, 'quality_status=missing must not become 0');
  assert.equal(zero.values.rainfall_mm, 0, 'a real zero stays a zero');
  assert.equal(payload!.summary.stationsWithMissingRainfall, 1);
  assert.equal(payload!.summary.stationsReportingRainfall, 1);
  assert.equal(missing.missingMetricCount, 1, 'the gap is one metric, not one row per resource');
  assert.equal(missing.reportedMetricCount, 1);
});

test('a station published by two resources reports each metric once and duplicate rows are not misses', () => {
  // Live D1 truth: three synoptic stations are published by both
  // WeatherTodayBySynop and WeatherToday V2, so 16 rows arrive per station.
  const rows: Row[] = [];
  for (const resourceId of [AGRO, SYNOP]) {
    for (const metricId of weather.WEATHER_METRICS as readonly string[]) {
      rows.push(withProvince(stationRow({ resourceId, locationCode: '48303', metricId, value: 30 }), '57', 'เชียงราย'));
    }
  }
  const payload = weather.buildWeatherObservations(rows)!;
  assert.equal(payload.stations.length, 1);
  const [station] = payload.stations;
  assert.equal(station.reportedMetricCount, weather.WEATHER_METRICS.length);
  assert.equal(station.missingMetricCount, 0, 'a second copy of a reported metric is a duplicate, never a missing value');
});

test('one resource reporting a gap while another reports the value leaves no miss', () => {
  const rows = (['good', 'missing'] as const).map((kind, index) => withProvince(stationRow({
    resourceId: index ? SYNOP : AGRO,
    locationCode: '48303',
    metricId: 'wind_speed_ms',
    value: index ? null : 4.2,
    qualityStatus: kind,
  }), '57', 'เชียงราย'));
  const payload = weather.buildWeatherObservations(rows)!;
  const [station] = payload.stations;
  assert.equal(station.values.wind_speed_ms, 4.2, 'the value from either resource is published');
  assert.equal(station.missingMetricCount, 0);
  assert.equal(station.reportedMetricCount, 1);
});

test('only one observation date is published; older rows are listed, not merged', () => {
  const payload = weather.buildWeatherObservations([
    stationRow({ locationCode: '48304', metricId: 'rainfall_mm', value: 40, periodStart: '2026-10-25', periodEnd: '2026-10-25' }),
    stationRow({ locationCode: '48304', metricId: 'rainfall_mm', value: 2, periodStart: '2026-10-26', periodEnd: '2026-10-26' }),
  ]);
  assert.equal(payload!.observationDate, '2026-10-26');
  assert.deepEqual(payload!.otherObservationDates, ['2026-10-25']);
  assert.equal(payload!.stations[0].values.rainfall_mm, 2, 'the older day must not be added to the newer one');
});

test('province matching reads dimensions, because station rows have no province_code column', () => {
  const rows = [
    withProvince(stationRow({ locationCode: '48304', metricId: 'tmax_c', value: 34.5 }), '57', 'เชียงราย'),
    withProvince(stationRow({ locationCode: '48350', metricId: 'tmax_c', value: 34.0 }), '42', 'เลย'),
  ];
  assert.equal(weather.buildWeatherObservations(rows)!.summary.provincesWithReportingStation, 2);
  const filtered = weather.buildWeatherObservations(rows, { provinceCode: '57' });
  assert.equal(filtered!.stations.length, 1, 'only the matched province is returned');
  assert.equal(filtered!.stations[0].stationCode, '48304');
  assert.equal(filtered!.stations[0].provinceCode, '57');
  assert.equal(filtered!.summary.provincesWithReportingStation, 1);
  assert.equal(weather.buildWeatherObservations(rows, { provinceCode: '10' }), null, 'a province without a reporting station must not fake a body');
});

test('no province-rollup or coverage claim is exposed', () => {
  const payload = weather.buildWeatherObservations([
    withProvince(stationRow({ locationCode: '48304', metricId: 'rainfall_mm', value: 12 }), '57', 'เชียงราย'),
    withProvince(stationRow({ locationCode: '48350', metricId: 'rainfall_mm', value: 3 }), '42', 'เลย'),
  ])!;
  const serialized = JSON.stringify(payload);
  for (const forbidden of ['provinceAverage', 'averageRainfallMm', 'totalRainfallMm', 'coverageProvinces', 'provinceCount:77']) {
    assert.equal(serialized.includes(forbidden), false, `payload must not expose ${forbidden}`);
  }
  assert.equal(payload.summary.provincesWithReportingStation, 2, 'the count is a station count, not a coverage claim');
  assert.equal(payload.summary.wettest?.stationCode, '48304');
  assert.equal(payload.summary.wettest?.value, 12);
});

test('summary extremes name the station that actually holds them', () => {
  const rows: Row[] = [];
  const push = (code: string, metricId: string, value: number) =>
    rows.push(withProvince(stationRow({ locationCode: code, metricId, value }), '42', 'เลย'));
  push('48350', 'tmax_c', 36.8);
  push('48351', 'tmax_c', 31.2);
  push('48350', 'tmin_c', 28.4);
  push('48351', 'tmin_c', 20.3);
  push('48350', 'rainfall_mm', 0);
  push('48351', 'rainfall_mm', 25.6);
  const payload = weather.buildWeatherObservations(rows)!;
  assert.equal(payload.summary.hottest?.stationCode, '48350');
  assert.equal(payload.summary.hottest?.value, 36.8);
  assert.equal(payload.summary.coolest?.stationCode, '48351', 'coolest is the lowest minimum temperature, not the highest');
  assert.equal(payload.summary.coolest?.value, 20.3);
  assert.equal(payload.summary.wettest?.stationCode, '48351');
  assert.equal(payload.summary.wettest?.value, 25.6);
});

test('ERA5 reanalysis stays a separate labelled block and never enters stations', () => {
  const era5 = (date: string, metricId: string, value: number | null): Row => ({
    resourceId: weather.ERA5_RESOURCE_URL,
    locationId: 'loc-era5-73',
    locationCode: 'open-meteo:era5:73',
    metricId,
    locationName: 'ERA5 grid point (นครปฐม 73)',
    value,
    unit: 'mm',
    periodStart: date,
    periodEnd: date,
    qualityStatus: value === null ? 'missing' : 'good',
    sourceRowRef: `era5:${date}:${metricId}`,
    dimensions: { provinceCode: '73', provinceNameTh: 'นครปฐม', gridLatitude: 13.75, gridLongitude: 100, providerModel: 'era5' },
  });
  const payload = weather.buildWeatherObservations([
    stationRow({ locationCode: '48304', metricId: 'tmax_c', value: 34.5 }),
    era5('2026-10-13', 'precip_mm', 22.6),
    era5('2026-10-14', 'precip_mm', 9.9),
    era5('2026-10-14', 't2m_max_c', null),
  ])!;
  assert.equal(payload.stations.length, 1, 'reanalysis rows must not create stations');
  assert.equal(payload.reanalysis.length, 1);
  const [record] = payload.reanalysis;
  assert.equal(record.dataKind, 'estimated', 'reanalysis must be labelled estimated, not observed');
  assert.equal(record.provinceCode, '73');
  assert.deepEqual(record.days.map((day) => day.date), ['2026-10-13', '2026-10-14']);
  assert.equal(record.days[0].precipMm, 22.6);
  assert.equal(record.days[1].precipMm, 9.9);
  assert.equal(record.days[1].t2mMaxC, null, 'a missing reanalysis value stays null');
  assert.equal(record.missingValueCount, 1);
  assert.equal(weather.buildWeatherObservations([era5('2026-10-13', 'precip_mm', 22.6)], { provinceCode: '57' }), null,
    'a province without a grid point in the warehouse must not answer with another province');
});

test('unknown metrics are dropped so a forecast value can never ride along', () => {
  const payload = weather.buildWeatherObservations([
    stationRow({ locationCode: '48304', metricId: 'tmax_c', value: 34.5 }),
    stationRow({ locationCode: '48304', metricId: 'forecast_rain_mm', value: 80 }),
    stationRow({ locationCode: '48304', metricId: 'rainfall_mm', value: 5 }),
  ])!;
  assert.deepEqual(Object.keys(payload.stations[0].values).sort(), [...weather.WEATHER_METRICS].sort());
  assert.equal(JSON.stringify(payload).includes('80'), false, 'the forecast value must not appear anywhere');
  assert.equal(payload.stations[0].values.rainfall_mm, 5);
});

test('empty batch yields the metadata-only body without numeric sentinels', () => {
  const body = weather.buildWeatherObservationsMetadataPayload();
  assert.deepEqual(body.stations, []);
  assert.deepEqual(body.reanalysis, []);
  assert.equal(body.summary, null, 'no zeroed summary');
  const serialized = JSON.stringify(body);
  for (const sentinel of ['tmax_c', 'rainfall_mm', '"value"', '"summary":0']) {
    assert.equal(serialized.includes(sentinel), false, `metadata body must not contain ${sentinel}`);
  }
  assert.equal(body.source.licenseStatus, 'approved_public', 'the register is approved; only the batch is missing');
});

test('repository and route stay server-only and read the warehouse, not the upstream', () => {
  const repository = readFileSync(new URL('../lib/hub/weather-repository.ts', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/v1/weather/observations/route.ts', import.meta.url), 'utf8');
  assert.equal(repository.includes("'server-only'"), true, 'repository must be server-only');
  assert.equal(repository.includes('fetch('), false, 'repository must not call the upstream API');
  assert.equal(route.includes('fetch('), false, 'route must not call the upstream API');
  assert.equal(route.includes('readWeatherSnapshot'), true, 'route must serve the warehouse read');
  assert.equal(route.includes("access: 'approved_public'"), true, 'numeric branch must declare the approved access level');
  assert.equal(route.includes("access: 'metadata_only'"), true, 'fallback branch must stay metadata-only');
  const dataModule = readFileSync(new URL('../lib/hub/weather-observations-data.ts', import.meta.url), 'utf8');
  for (const forbidden of ['Math.random(', 'Date.now()']) {
    assert.equal(dataModule.includes(forbidden), false, `builder must stay deterministic (no ${forbidden})`);
  }
});
