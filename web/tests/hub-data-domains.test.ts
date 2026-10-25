/**
 * In-memory contract tests for the /weather, /crops and /soil data libraries.
 *
 * Nothing here performs a network request: the route handlers are called with
 * local `Request` objects, and every fixture is read from this checkout.
 *
 * The web test runner uses `node --experimental-strip-types`, which cannot load
 * `server-only` or TypeScript parameter properties (`lib/hub/http.ts`). The
 * hooks below only adjust module resolution/transpilation inside this test
 * process; no production file is modified.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { parseProvinces } from '../lib/provinces.ts';
import {
  CROP_STAGE_LABELS,
  CROP_TABS,
  CROPS_SOURCE_NOTE,
  MONTH_LABELS,
  SOIL_NOT_FOUND_NAMES,
  SOIL_SEARCH_HINT,
  SOIL_SERIES,
  findCropTab,
  findSoilSeries,
  searchSoilSeries,
} from '../lib/hub/crops-soil-data.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // The app uses bundler-style extensionless imports; Node needs the suffix.
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

const weather = await import('../lib/hub/weather-data.ts');
const http = await import('../lib/hub/http.ts');
const weatherRoute = await import('../app/api/v1/weather/route.ts');
const cropsRoute = await import('../app/api/v1/crops/route.ts');
const soilRoute = await import('../app/api/v1/soil/route.ts');
const livestockRoute = await import('../app/api/v1/livestock/route.ts');
const livestock = await import('../lib/hub/livestock-data.ts');

type WeatherOverview = Awaited<ReturnType<typeof weather.buildWeatherOverview>>;

type ApiMeta = {
  access: string;
  availability: string;
  completeness: string;
  freshness: string;
  sourceIds: string[];
  dataAsOf: string | null;
  datasetVersion: string | null;
  warnings: string[];
  runtimeMode: string;
  retrievedAt: string;
};

type WeatherApiPayload = { data: WeatherOverview; meta: ApiMeta };
type CropsApiPayload = { data: typeof CROP_TABS; meta: ApiMeta };
type SoilApiPayload = {
  data: {
    series: typeof SOIL_SERIES;
    guidance: unknown[];
    problems: unknown[];
    searchHint: string;
    unregisteredNames: string[];
    totalSeries: number;
  };
  meta: ApiMeta;
};
type ApiErrorPayload = { error: { code: string; message: string; requestId: string } };
type LivestockApiPayload = {
  data: ReturnType<typeof livestock.buildLivestockDashboard>;
  meta: ApiMeta;
};

const HUB_ORIGIN = 'http://hub.local';
const FIXED_NOW = new Date('2026-10-25T03:00:00Z');
const FIXED_ISSUED_AT = '2026-10-25';
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const provinces = parseProvinces(
  readFileSync(new URL('../data/provinces.csv', import.meta.url), 'utf8'),
);

const provinceForecasts = await Promise.all(
  provinces.map(async (province) => ({
    label: `province ${province.code} (${province.name})`,
    province,
    overview: await weather.buildWeatherOverview(
      new URL(`/api/v1/weather?provinceCode=${province.code}`, HUB_ORIGIN),
      FIXED_NOW,
    ),
  })),
);

const regionForecasts = await Promise.all(
  weather.REGIONS.map(async (region) => ({
    label: `region ${region.key}`,
    region,
    overview: await weather.buildWeatherOverview(
      new URL(`/api/v1/weather?region=${region.key}`, HUB_ORIGIN),
      FIXED_NOW,
    ),
  })),
);

const allForecasts = [...provinceForecasts, ...regionForecasts];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function addDays(iso: string, days: number) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
}

function assertReferenceUrl(url: string, label: string) {
  assert.equal(typeof url, 'string', `${label}: URL type`);
  assert.ok(url.trim().length > 0, `${label}: URL must not be empty`);
  assert.equal(url, url.trim(), `${label}: URL must not carry surrounding whitespace`);
  assert.ok(!/^(tbd|todo|n\/a|#)$/i.test(url), `${label}: placeholder URL ${url}`);
  const parsed = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  assert.ok(parsed !== null, `${label}: unparseable URL ${url}`);
  assert.ok(parsed.protocol === 'http:' || parsed.protocol === 'https:', `${label}: ${parsed.protocol}`);
  assert.ok(parsed.hostname.length > 0, `${label}: missing host`);
}

function assertForecastDays(overview: WeatherOverview, label: string) {
  const { days, cumulative } = overview;
  assert.equal(days.length, weather.THRESHOLDS.forecastDays, `${label}: forecastDays threshold`);
  assert.equal(days.length, 7, `${label}: exactly seven forecast days`);
  assert.equal(cumulative.byDay.length, 7, `${label}: byDay must mirror the seven days`);
  assert.equal(cumulative.windowDays, 7, `${label}: cumulative windowDays`);
  assert.equal(cumulative.daysWithData, 7, `${label}: every forecast day carries rainfall`);
  assert.equal(cumulative.missingDays, 0, `${label}: no missing forecast days`);
  assert.equal(cumulative.completeness, 'complete', `${label}: completeness`);

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    const row = cumulative.byDay[index];
    assert.equal(day.date, addDays(overview.issuedAt, index), `${label}: day ${index} date sequence`);
    assert.equal(row.date, day.date, `${label}: cumulative date ${index}`);
    assert.equal(day.sample, true, `${label}: day ${index} sample flag`);
    assert.ok(day.weekdayTh.trim().length > 0, `${label}: day ${index} weekday`);
    assert.ok(day.dateLabelTh.trim().length > 0, `${label}: day ${index} date label`);
    assert.equal(
      day.conditionLabelTh,
      weather.CONDITION_LABELS[day.conditionCode],
      `${label}: day ${index} condition label`,
    );

    const { tmaxC, tminC } = day;
    assert.ok(tmaxC !== null && tminC !== null, `${label}: day ${index} temperature missing`);
    assert.ok(tmaxC >= tminC, `${label}: day ${index} tmax ${tmaxC} < tmin ${tminC}`);

    const { humidityMinPercent, humidityMaxPercent } = day;
    assert.ok(
      humidityMinPercent !== null && humidityMaxPercent !== null,
      `${label}: day ${index} humidity missing`,
    );
    assert.ok(
      humidityMinPercent >= 0 && humidityMinPercent <= 100,
      `${label}: day ${index} humidityMin ${humidityMinPercent} outside 0-100`,
    );
    assert.ok(
      humidityMaxPercent >= 0 && humidityMaxPercent <= 100,
      `${label}: day ${index} humidityMax ${humidityMaxPercent} outside 0-100`,
    );
    assert.ok(
      humidityMinPercent <= humidityMaxPercent,
      `${label}: day ${index} humidityMin > humidityMax`,
    );

    const rainChance = day.rainChancePercent;
    assert.ok(
      rainChance !== null && rainChance >= 0 && rainChance <= 100,
      `${label}: day ${index} rain chance ${rainChance} outside 0-100`,
    );

    const rainfall = day.rainfallMm;
    assert.ok(rainfall !== null && rainfall >= 0, `${label}: day ${index} rainfall ${rainfall}`);

    const windSpeed = day.windSpeedMs;
    assert.ok(windSpeed !== null && windSpeed >= 0, `${label}: day ${index} wind speed ${windSpeed}`);

    const windDirection = day.windDirectionDeg;
    assert.ok(
      windDirection !== null &&
        Number.isInteger(windDirection) &&
        windDirection >= 0 &&
        windDirection <= 359,
      `${label}: day ${index} wind direction ${windDirection}`,
    );
    assert.equal(
      day.windDirectionLabelTh,
      weather.windDirectionLabel(windDirection),
      `${label}: day ${index} wind direction label`,
    );

    assert.equal(row.rainfallMm, rainfall, `${label}: day ${index} byDay rainfall`);
    assert.ok(row.normalMm > 0, `${label}: day ${index} normal rainfall must be positive`);
  }
}

function assertCumulativeRainfall(overview: WeatherOverview, label: string) {
  const { days, cumulative } = overview;
  let forecastRunning = 0;
  let normalRunning = 0;

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    const row = cumulative.byDay[index];
    const rainfall = day.rainfallMm;
    assert.ok(rainfall !== null, `${label}: day ${index} rainfall missing`);
    forecastRunning += rainfall;
    normalRunning += row.normalMm;
    assert.equal(
      row.forecastCumulativeMm,
      round1(forecastRunning),
      `${label}: day ${index} forecast cumulative`,
    );
    assert.equal(
      row.normalCumulativeMm,
      round1(normalRunning),
      `${label}: day ${index} normal cumulative`,
    );
  }

  assert.equal(cumulative.forecastTotalMm, round1(forecastRunning), `${label}: total rainfall`);
  assert.equal(cumulative.normalTotalMm, round1(normalRunning), `${label}: total normal rainfall`);

  const anomalyMm = cumulative.anomalyMm;
  const anomalyPercent = cumulative.anomalyPercent;
  assert.ok(anomalyMm !== null && anomalyPercent !== null, `${label}: anomaly missing`);
  assert.equal(anomalyMm, round1(forecastRunning - normalRunning), `${label}: anomaly mm`);
  assert.equal(
    anomalyPercent,
    round1(((forecastRunning - normalRunning) / normalRunning) * 100),
    `${label}: anomaly percent`,
  );

  const expectedStatus =
    anomalyPercent <= weather.THRESHOLDS.anomalyBelowPct
      ? 'below_normal'
      : anomalyPercent >= weather.THRESHOLDS.anomalyAbovePct
        ? 'above_normal'
        : 'normal';
  assert.equal(cumulative.status, expectedStatus, `${label}: status threshold`);
  assert.equal(
    cumulative.dryDays,
    days.filter((day) => day.rainfallMm !== null && day.rainfallMm < weather.THRESHOLDS.dryDayRainMm)
      .length,
    `${label}: dry day count`,
  );
  assert.equal(
    cumulative.heavyRainDays,
    days.filter(
      (day) => day.rainfallMm !== null && day.rainfallMm >= weather.THRESHOLDS.heavyRainMm,
    ).length,
    `${label}: heavy rain day count`,
  );
  assert.equal(cumulative.calculationVersion, 'cumulative-rainfall-index-v1');
}

async function getWeatherPayload(path: string) {
  const response = await weatherRoute.GET(new Request(new URL(path, HUB_ORIGIN)));
  assert.equal(response.status, 200, `${path}: status`);
  assert.equal(response.headers.get('cache-control'), 'no-store', `${path}: cache-control`);
  return (await response.json()) as WeatherApiPayload;
}

/* ------------------------------------------------------------------ */
/* Weather data contract                                               */
/* ------------------------------------------------------------------ */

test('weather: five regions map all 77 provinces exactly once', () => {
  assert.equal(weather.REGIONS.length, 5);
  assert.deepEqual(
    weather.REGIONS.map((region) => region.key),
    ['north', 'northeast', 'central', 'east', 'south'],
  );
  assert.equal(new Set(weather.REGIONS.map((region) => region.label)).size, 5);
  assert.ok(weather.REGIONS.every((region) => region.label.trim().length > 0));

  const regionKeys = new Set(weather.REGIONS.map((region) => region.key));
  assert.deepEqual(
    Object.keys(weather.REGION_BY_PROVINCE).sort(),
    provinces.map((province) => province.code).sort(),
    'region map must cover the reviewed 77 province codes',
  );

  const counts = new Map(weather.REGIONS.map((region) => [region.key, 0]));
  for (const province of provinces) {
    assert.match(province.code, /^\d{2}$/);
    const region = weather.REGION_BY_PROVINCE[province.code];
    assert.ok(regionKeys.has(region), `${province.code}: unknown region ${region}`);
    counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  assert.equal([...counts.values()].reduce((sum, count) => sum + count, 0), 77);
  for (const [region, count] of counts) {
    assert.ok(count > 0, `${region}: must contain at least one province`);
  }
});

test('weather: every province and region keeps the 7-day temperature, humidity and rainfall invariants', () => {
  assert.equal(provinceForecasts.length, 77);
  assert.equal(regionForecasts.length, 5);

  for (const { label, province, overview } of provinceForecasts) {
    assert.equal(overview.issuedAt, FIXED_ISSUED_AT, `${label}: issuedAt`);
    assert.equal(overview.location.kind, 'province', `${label}: location kind`);
    assert.equal(overview.location.code, province.code, `${label}: location code`);
    assert.equal(overview.location.name, province.name, `${label}: location name`);
    assert.equal(
      overview.location.region,
      weather.REGION_BY_PROVINCE[province.code],
      `${label}: location region`,
    );
    assert.equal(
      overview.location.regionLabel,
      weather.REGIONS.find((region) => region.key === overview.location.region)?.label,
      `${label}: region label`,
    );
    assertForecastDays(overview, label);
  }

  for (const { label, region, overview } of regionForecasts) {
    assert.equal(overview.issuedAt, FIXED_ISSUED_AT, `${label}: issuedAt`);
    assert.equal(overview.location.kind, 'region', `${label}: location kind`);
    assert.equal(overview.location.code, region.key, `${label}: location code`);
    assert.equal(overview.location.name, region.label, `${label}: location name`);
    assert.equal(overview.location.region, region.key, `${label}: location region`);
    assert.equal(overview.location.regionLabel, region.label, `${label}: region label`);
    assertForecastDays(overview, label);
  }
});

test('weather: cumulative rainfall index reconciles with the daily forecast rows', () => {
  for (const { label, overview } of allForecasts) {
    assertCumulativeRainfall(overview, label);
  }
});

test('weather: every payload is explicitly sample data under a pending licence', () => {
  assert.equal(weather.SAMPLE_MODE, true);
  assert.equal(weather.WEATHER_WARNINGS.length, 3);
  assert.ok(weather.WEATHER_WARNINGS.every((warning) => warning.trim().length > 0));
  assert.ok(weather.WEATHER_WARNINGS[0].includes('ตัวอย่าง'));
  assert.ok(weather.WEATHER_WARNINGS[1].includes('สิทธิ์'));

  for (const { label, overview } of allForecasts) {
    assert.equal(overview.sample, true, `${label}: sample flag`);
    assert.equal(overview.dataKind, 'sample', `${label}: dataKind`);
    assert.ok(
      overview.days.every((day) => day.sample === true),
      `${label}: every forecast day must be flagged sample`,
    );
    assert.equal(overview.source.licenseStatus, 'pending', `${label}: licence status`);
    assert.match(overview.source.sourceUrl, /^https:\/\//, `${label}: source URL`);
    assert.ok(overview.source.agency.trim().length > 0, `${label}: source agency`);
    assert.deepEqual(overview.units, weather.FORECAST_UNITS, `${label}: units`);
    for (const key of ['temperature', 'rainfall', 'relative_humidity']) {
      assert.ok(overview.units[key], `${label}: missing unit ${key}`);
    }
  }
});

test('weather: advisories keep severity order, unique codes and actionable text', () => {
  for (const { label, overview } of allForecasts) {
    const seen = new Set<string>();
    let previousRank = -1;
    for (const advisory of overview.advisories) {
      assert.match(advisory.code, /^[A-Z][A-Z_]*$/, `${label}: advisory code ${advisory.code}`);
      assert.ok(!seen.has(advisory.code), `${label}: duplicate advisory ${advisory.code}`);
      seen.add(advisory.code);

      const rank = SEVERITY_RANK[advisory.severity];
      assert.notEqual(rank, undefined, `${label}: unknown severity ${advisory.severity}`);
      assert.ok(rank >= previousRank, `${label}: advisories must be sorted high -> low`);
      previousRank = rank;

      assert.ok(advisory.titleTh.trim().length > 0, `${label}: advisory title`);
      assert.ok(advisory.messageTh.trim().length > 0, `${label}: advisory message`);
      assert.ok(advisory.actions.length > 0, `${label}: advisory actions`);
      assert.ok(
        advisory.actions.every((action) => action.trim().length > 0),
        `${label}: empty advisory action`,
      );
    }
  }
});

test('weather: selectors fail closed and a province wins over a region', async () => {
  const invalidQueries = [
    '',
    '?provinceCode=99',
    '?provinceCode=7',
    '?region=west',
    '?region=' + 'n'.repeat(21),
  ];
  for (const query of invalidQueries) {
    await assert.rejects(
      weather.buildWeatherOverview(
        new URL('/api/v1/weather' + query, HUB_ORIGIN),
        FIXED_NOW,
      ),
      (error: unknown) => {
        assert.ok(error instanceof http.HubRequestError, `${query}: expected HubRequestError`);
        assert.equal(error.status, 400, `${query}: status`);
        assert.equal(error.code, 'INVALID_QUERY', `${query}: code`);
        return true;
      },
    );
  }

  const trimmed = await weather.buildWeatherOverview(
    new URL('/api/v1/weather?provinceCode=%2073%20', HUB_ORIGIN),
    FIXED_NOW,
  );
  assert.equal(trimmed.location.code, '73');

  const provinceWins = await weather.buildWeatherOverview(
    new URL('/api/v1/weather?provinceCode=73&region=west', HUB_ORIGIN),
    FIXED_NOW,
  );
  assert.equal(provinceWins.location.kind, 'province');
  assert.equal(provinceWins.location.code, '73');
  assert.equal(provinceWins.location.name, 'นครปฐม');
});

test('weather API: meta.access stays metadata_only for all 77 provinces and 5 regions', async () => {
  for (const province of provinces) {
    const body = await getWeatherPayload(`/api/v1/weather?provinceCode=${province.code}`);
    assert.equal(body.meta.access, 'metadata_only', `${province.code}: access`);
    assert.equal(body.meta.availability, 'ready', `${province.code}: availability`);
    assert.equal(body.meta.freshness, 'fresh', `${province.code}: freshness`);
    assert.equal(body.meta.completeness, 'complete', `${province.code}: completeness`);
    assert.deepEqual(body.meta.sourceIds, ['tmd'], `${province.code}: sourceIds`);
    assert.equal(body.meta.datasetVersion, 'weather-forecast-sample-v1');
    assert.equal(body.meta.runtimeMode, 'source_api_fallback');
    assert.deepEqual(body.meta.warnings, weather.WEATHER_WARNINGS, `${province.code}: warnings`);
    assert.equal(body.meta.dataAsOf, body.data.issuedAt, `${province.code}: dataAsOf`);
    assert.match(body.meta.retrievedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(body.data.location.code, province.code);
    assert.equal(body.data.sample, true);
    assert.equal(body.data.days.length, 7);
    assert.equal(body.data.cumulative.completeness, 'complete');
  }

  for (const region of weather.REGIONS) {
    const body = await getWeatherPayload(`/api/v1/weather?region=${region.key}`);
    assert.equal(body.meta.access, 'metadata_only', `${region.key}: access`);
    assert.equal(body.meta.completeness, 'complete', `${region.key}: completeness`);
    assert.equal(body.data.location.kind, 'region');
    assert.equal(body.data.location.code, region.key);
    assert.equal(body.data.days.length, 7);
  }
});

test('weather API: invalid selectors return the 400 INVALID_QUERY envelope', async () => {
  for (const path of [
    '/api/v1/weather',
    '/api/v1/weather?region=west',
    '/api/v1/weather?provinceCode=99',
  ]) {
    const response = await weatherRoute.GET(new Request(new URL(path, HUB_ORIGIN)));
    assert.equal(response.status, 400, `${path}: status`);
    const body = (await response.json()) as ApiErrorPayload;
    assert.equal(body.error.code, 'INVALID_QUERY', `${path}: code`);
    assert.equal(typeof body.error.requestId, 'string', `${path}: requestId`);
    assert.ok(body.error.requestId.length >= 8, `${path}: requestId must be traceable`);
    assert.ok(!('data' in body), `${path}: an error must not expose sample numbers`);
  }
});

/* ------------------------------------------------------------------ */
/* Crops data contract                                                 */
/* ------------------------------------------------------------------ */

test('crops: six economic crops keep wet and dry rice as separate seasons', () => {
  assert.equal(CROP_TABS.length, 6);
  assert.deepEqual(
    CROP_TABS.map((tab) => tab.id),
    ['rice', 'corn', 'cassava', 'sugarcane', 'oil-palm', 'rubber'],
  );

  for (const tab of CROP_TABS) {
    assert.ok(tab.label.trim().length > 0, `${tab.id}: tab label`);
    assert.ok(tab.profiles.length >= 1, `${tab.id}: must own at least one profile`);
    assert.equal(
      new Set(tab.profiles.map((profile) => profile.id)).size,
      tab.profiles.length,
      `${tab.id}: duplicate profile id`,
    );
  }

  const profiles = CROP_TABS.flatMap((tab) => tab.profiles);
  assert.equal(profiles.length, 7);
  assert.equal(new Set(profiles.map((profile) => profile.id)).size, 7);
  assert.equal(new Set(profiles.map((profile) => profile.cropId)).size, 6);

  const occurrences = new Map<string, number>();
  for (const profile of profiles) {
    occurrences.set(profile.cropId, (occurrences.get(profile.cropId) ?? 0) + 1);
  }
  assert.equal(occurrences.get('rice'), 2, 'rice wet and dry must stay two profiles');
  for (const cropId of ['corn', 'cassava', 'sugarcane', 'oil-palm', 'rubber']) {
    assert.equal(occurrences.get(cropId), 1, `${cropId}: one profile`);
  }

  const rice = findCropTab('rice');
  assert.ok(rice !== null);
  assert.deepEqual(rice.profiles.map((profile) => profile.season), ['นาปี', 'นาปรัง']);
  assert.deepEqual(rice.profiles.map((profile) => profile.name), ['ข้าวนาปี', 'ข้าวนาปรัง']);

  const [riceWet, riceDry] = rice.profiles;
  assert.notEqual(riceWet.id, riceDry.id);
  assert.ok(riceWet.name.includes('นาปี'));
  assert.ok(riceDry.name.includes('นาปรัง'));
});

test('crops: every profile has the four production stages in order with valid months', () => {
  assert.deepEqual(Object.keys(CROP_STAGE_LABELS).sort(), ['care', 'harvest', 'plant', 'prep']);
  assert.ok(Object.values(CROP_STAGE_LABELS).every((label) => label.trim().length > 0));
  assert.equal(MONTH_LABELS.length, 12);
  assert.equal(new Set(MONTH_LABELS).size, 12);

  const profiles = CROP_TABS.flatMap((tab) => tab.profiles);
  for (const profile of profiles) {
    assert.ok(profile.name.trim().length > 0, `${profile.id}: name`);
    assert.ok(profile.description.trim().length > 0, `${profile.id}: description`);
    assert.ok((profile.calendarNote ?? '').trim().length > 0, `${profile.id}: calendar note`);
    assert.equal(profile.calendar.length, 4, `${profile.id}: four production stages`);
    assert.deepEqual(
      profile.calendar.map((stage) => stage.stage),
      ['prep', 'plant', 'care', 'harvest'],
      `${profile.id}: prep -> plant -> care -> harvest`,
    );

    for (const stage of profile.calendar) {
      assert.ok(stage.ranges.length >= 1, `${profile.id}/${stage.stage}: at least one range`);
      for (const range of stage.ranges) {
        assert.ok(range.label.trim().length > 0, `${profile.id}/${stage.stage}: range label`);
        assert.ok(range.months.length >= 1, `${profile.id}/${stage.stage}: months`);
        assert.equal(
          new Set(range.months).size,
          range.months.length,
          `${profile.id}/${stage.stage}: duplicate month`,
        );
        for (const month of range.months) {
          assert.ok(
            Number.isInteger(month) && month >= 1 && month <= 12,
            `${profile.id}/${stage.stage}: month ${month} outside 1-12`,
          );
        }
        if (range.season !== undefined) {
          assert.ok(range.season.trim().length > 0, `${profile.id}/${stage.stage}: season label`);
        }
      }
    }
  }
});

test('crops: every variety reference is a non-empty absolute URL', () => {
  const profiles = CROP_TABS.flatMap((tab) => tab.profiles);
  for (const profile of profiles) {
    assert.ok(profile.varieties.length >= 1, `${profile.id}: varieties`);

    for (const variety of profile.varieties) {
      assertReferenceUrl(variety.sourceUrl, `${profile.id} variety "${variety.name}"`);
      assert.ok(variety.name.trim().length > 0, `${profile.id}: variety name`);
      assert.ok(variety.sourceName.trim().length > 0, `${profile.id}: variety source`);
      assert.ok(variety.traits.length >= 1, `${profile.id}: variety traits`);
      assert.ok(
        variety.traits.every((trait) => trait.trim().length > 0),
        `${profile.id}: empty variety trait`,
      );
    }
  }

  assert.match(CROPS_SOURCE_NOTE, /https:\/\/oae\.go\.th\/\S+/);
  assert.ok(CROPS_SOURCE_NOTE.includes('สศก.'));
});

test('crops: economic crops profiles are complete', () => {
  const profiles = CROP_TABS.flatMap((tab) => tab.profiles);
  assert.ok(profiles.length >= 6);
  const ids = profiles.map((p) => p.id);
  assert.ok(ids.includes('rice-wet'));
  assert.ok(ids.includes('rice-dry'));
  assert.ok(ids.includes('feed-corn'));
  assert.ok(ids.includes('cassava'));
  assert.ok(ids.includes('sugarcane'));
  assert.ok(ids.includes('oil-palm'));
  assert.ok(ids.includes('rubber'));
});

test('crops: lookup helpers fail closed and month/stage labels are complete', () => {
  assert.equal(findCropTab('rice')?.id, 'rice');
  assert.equal(findCropTab('corn')?.profiles.length, 1);
  assert.equal(findCropTab('unknown'), null);
  assert.equal(findCropTab(''), null);
  assert.equal(findCropTab(null), null);
  assert.equal(findCropTab(undefined), null);

  assert.equal(MONTH_LABELS.length, 12);
  assert.ok(MONTH_LABELS.every((label) => label.trim().length > 0));
  assert.deepEqual(Object.keys(CROP_STAGE_LABELS).sort(), ['care', 'harvest', 'plant', 'prep']);
  assert.ok(Object.values(CROP_STAGE_LABELS).every((label) => label.trim().length > 0));
});

test('crops API: six tabs are served as published references with metadata_only meta', async () => {
  const response = await cropsRoute.GET(new Request(new URL('/api/v1/crops', HUB_ORIGIN)));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = (await response.json()) as CropsApiPayload;
  assert.equal(body.meta.access, 'metadata_only');
  assert.equal(body.meta.availability, 'metadata_only');
  assert.equal(body.meta.completeness, 'unknown');
  assert.deepEqual(body.meta.sourceIds, ['oae', 'doae']);
  assert.equal(body.meta.datasetVersion, 'crops-reference-v2');
  assert.equal(body.data.length, 6);
  assert.deepEqual(
    body.data.map((tab) => tab.id),
    CROP_TABS.map((tab) => tab.id),
  );
  assert.ok(body.meta.warnings.some((warning) => warning.includes('ตรวจสอบสิทธิ์') || warning.includes('สังเคราะห์')));

  const riceResponse = await cropsRoute.GET(
    new Request(new URL('/api/v1/crops?crop=rice', HUB_ORIGIN)),
  );
  assert.equal(riceResponse.status, 200);
  const riceBody = (await riceResponse.json()) as CropsApiPayload;
  assert.equal(riceBody.data.length, 1);
  assert.equal(riceBody.data[0].profiles.length, 2);

  const invalid = await cropsRoute.GET(
    new Request(new URL('/api/v1/crops?crop=unknown', HUB_ORIGIN)),
  );
  assert.equal(invalid.status, 400);
  const invalidBody = (await invalid.json()) as ApiErrorPayload;
  assert.equal(invalidBody.error.code, 'INVALID_QUERY');
});

/* ------------------------------------------------------------------ */
/* Soil data contract                                                  */
/* ------------------------------------------------------------------ */

const SOIL_REQUIRED_FIELDS = [
  'id',
  'name',
  'code',
  'region',
  'textureTop',
  'textureBottom',
  'phTop',
  'phBottom',
  'phNote',
  'fertilityTop',
  'fertilityDeeper',
  'fertilityNote',
  'distribution',
  'sourceName',
  'sourceUrl',
] as const;

test('soil: the seven LDD-verified series carry complete official fields', () => {
  assert.equal(SOIL_SERIES.length, 7);
  assert.deepEqual(
    SOIL_SERIES.map((series) => series.code),
    ['Ks', 'Lb', 'Si', 'Kt', 'Re', 'Nn', 'Skt'],
  );
  assert.deepEqual(SOIL_SERIES.map((series) => series.name), [
    'ชุดดินกำแพงแสน',
    'ชุดดินลพบุรี',
    'ชุดดินสีคิ้ว',
    'ชุดดินโคราช',
    'ชุดดินร้อยเอ็ด',
    'ชุดดินนครพนม',
    'ชุดดินสุโขทัย',
  ]);
  assert.equal(new Set(SOIL_SERIES.map((series) => series.id)).size, 7);
  assert.equal(new Set(SOIL_SERIES.map((series) => series.name)).size, 7);
  assert.equal(new Set(SOIL_SERIES.map((series) => series.code)).size, 7);

  for (const series of SOIL_SERIES) {
    for (const field of SOIL_REQUIRED_FIELDS) {
      assert.ok(
        series[field].trim().length > 0,
        `${series.code}: field ${field} must not be empty`,
      );
    }
    assert.match(series.name, /^ชุดดิน/, `${series.code}: official series naming`);
    assert.ok(
      Number.isInteger(series.groupNumber) && series.groupNumber >= 1 && series.groupNumber <= 62,
      `${series.code}: group number must be an LDD group 1-62`,
    );
    assert.ok(
      ['clay', 'loam', 'sandy'].includes(series.textureClass),
      `${series.code}: texture class ${series.textureClass}`,
    );
    assert.ok(series.problems.length >= 1, `${series.code}: problems`);
    assert.ok(
      series.problems.every((problem) => problem.trim().length > 0),
      `${series.code}: empty problem`,
    );
    assert.ok(series.searchTerms.length >= 1, `${series.code}: search terms`);
    assert.ok(series.searchTerms.includes(series.code), `${series.code}: search term for its code`);
    assert.match(series.phTop, /\d/, `${series.code}: phTop must contain a value`);
    assert.match(series.phBottom, /\d/, `${series.code}: phBottom must contain a value`);
    assert.match(
      series.sourceUrl,
      /^https:\/\/www\.ldd\.go\.th\/thaisoils_museum\/pf_desc\//,
      `${series.code}: LDD museum source`,
    );
    assertReferenceUrl(series.sourceUrl, `${series.code} source`);
  }
});

test('soil: the five unverified names never become soil series or numeric rows', () => {
  assert.deepEqual(SOIL_NOT_FOUND_NAMES, ['ท่าพระ', 'ขอนแก่น', 'ป่าโมก', 'ทราย', 'ตาก']);
  assert.equal(new Set(SOIL_NOT_FOUND_NAMES).size, SOIL_NOT_FOUND_NAMES.length);
  assert.ok(SOIL_NOT_FOUND_NAMES.every((name) => name.trim().length > 0));

  const identities = SOIL_SERIES.map((series) =>
    [series.id, series.name, series.code, ...series.searchTerms].join(' '),
  );

  for (const name of SOIL_NOT_FOUND_NAMES) {
    assert.ok(
      identities.every((identity) => !identity.includes(name)),
      `${name}: must not be registered as a verified series`,
    );
    assert.deepEqual(
      searchSoilSeries(name),
      [],
      `${name}: search must not fabricate a numeric series row`,
    );
    assert.equal(findSoilSeries(name), null, `${name}: lookup must fail closed`);
  }

  // LDD code "Tp" is ชุดดินธาตุพนม, never ท่าพระ — guard the known mislabel.
  for (const series of SOIL_SERIES) {
    if (series.code === 'Tp') {
      assert.equal(series.name, 'ชุดดินธาตุพนม', 'Tp must never be labelled ท่าพระ');
    }
  }

  assert.ok(
    SOIL_SEARCH_HINT.includes('ไม่ใช่การยืนยัน'),
    'the search hint must warn that a name match is not a coverage claim',
  );
});

test('soil: search and lookup return only verified registry rows', () => {
  assert.deepEqual(searchSoilSeries(''), SOIL_SERIES);
  assert.equal(searchSoilSeries('   ').length, 7);
  assert.deepEqual(searchSoilSeries('Ks').map((series) => series.code), ['Ks']);
  assert.deepEqual(searchSoilSeries('ks').map((series) => series.code), ['Ks']);
  assert.deepEqual(searchSoilSeries('โคราช').map((series) => series.code), ['Kt']);
  assert.deepEqual(searchSoilSeries('ภาคเหนือ').map((series) => series.code), ['Skt']);
  assert.deepEqual(searchSoilSeries('ไม่มีชุดดินนี้'), []);

  assert.equal(findSoilSeries('kamphaeng-saen')?.code, 'Ks');
  assert.equal(findSoilSeries('nope'), null);
  assert.equal(findSoilSeries(''), null);
  assert.equal(findSoilSeries(null), null);
  assert.equal(findSoilSeries(undefined), null);
});

test('soil API: seven verified series and five warning names stay metadata_only', async () => {
  const response = await soilRoute.GET(new Request(new URL('/api/v1/soil', HUB_ORIGIN)));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = (await response.json()) as SoilApiPayload;

  assert.equal(body.meta.access, 'metadata_only');
  assert.equal(body.meta.availability, 'ready');
  assert.equal(body.meta.completeness, 'complete');
  assert.deepEqual(body.meta.sourceIds, ['ldd', 'doae']);
  assert.equal(body.meta.datasetVersion, 'soil-fertilizer-reference-v1');
  assert.equal(body.data.totalSeries, 7);
  assert.deepEqual(
    body.data.series.map((series) => series.code),
    SOIL_SERIES.map((series) => series.code),
  );
  assert.deepEqual(body.data.unregisteredNames, SOIL_NOT_FOUND_NAMES);
  assert.equal(body.data.guidance.length, 6);
  assert.equal(body.data.problems.length, 4);
  assert.ok(body.data.searchHint.includes('ไม่ใช่การยืนยัน'));
  assert.ok(
    body.meta.warnings.some((warning) => warning.includes('ไม่ใช่ขอบเขตทั้งจังหวัด')),
  );
});

test('soil API: unverified names stay empty results but keep the warning status', async () => {
  for (const name of ['ท่าพระ', 'ขอนแก่น']) {
    const response = await soilRoute.GET(
      new Request(new URL('/api/v1/soil?q=' + encodeURIComponent(name), HUB_ORIGIN)),
    );
    assert.equal(response.status, 200, `${name}: status`);
    const body = (await response.json()) as SoilApiPayload;
    assert.deepEqual(body.data.series, [], `${name}: must not be returned as a numeric series`);
    assert.ok(body.data.unregisteredNames.includes(name), `${name}: warning list must keep the name`);
  }

  const known = await soilRoute.GET(
    new Request(new URL('/api/v1/soil?series=kamphaeng-saen', HUB_ORIGIN)),
  );
  assert.equal(known.status, 200);
  const knownBody = (await known.json()) as SoilApiPayload;
  assert.equal(knownBody.data.series.length, 1);
  assert.equal(knownBody.data.series[0].code, 'Ks');

  const unknown = await soilRoute.GET(
    new Request(new URL('/api/v1/soil?series=tha-phra', HUB_ORIGIN)),
  );
  assert.equal(unknown.status, 400);
  const unknownBody = (await unknown.json()) as ApiErrorPayload;
  assert.equal(unknownBody.error.code, 'INVALID_QUERY');
  assert.ok(unknownBody.error.requestId.length > 0);
});

/* ------------------------------------------------------------------ */
/* Livestock & Fisheries data contract                                 */
/* ------------------------------------------------------------------ */

test('livestock: sectors and species definitions match DLD and DOF registries', () => {
  const payload = livestock.buildLivestockDashboard();
  assert.equal(payload.sectors.length, 2);
  const [dldSector, dofSector] = payload.sectors;

  assert.equal(dldSector.id, 'livestock');
  assert.equal(dldSector.agencyLabel, 'กรมปศุสัตว์ (DLD)');
  assert.equal(dldSector.species.length, 5);
  assert.deepEqual(
    dldSector.species.map((s: { def: { id: string } }) => s.def.id),
    ['cattle', 'dairy', 'swine', 'poultry', 'duck'],
  );

  assert.equal(dofSector.id, 'aquaculture');
  assert.equal(dofSector.agencyLabel, 'กรมประมง (DOF)');
  assert.equal(dofSector.species.length, 3);
  assert.deepEqual(
    dofSector.species.map((s: { def: { id: string } }) => s.def.id),
    ['whiteleg-shrimp', 'tilapia', 'catfish'],
  );

  for (const sector of payload.sectors) {
    for (const item of sector.species) {
      assert.ok(item.def.label.length > 0);
      assert.ok(item.def.unit.length > 0);
      assert.ok(item.def.sourceUrl.startsWith('http'));
      assert.ok(item.def.resourceId.length > 0);
      assert.ok(item.summary.total !== null && item.summary.total > 0);
      assert.equal(item.summary.sample, true);
    }
  }
});

test('livestock: DLD and DOF region bases are kept distinct and never merged', () => {
  const payload = livestock.buildLivestockDashboard();
  const [dldSector, dofSector] = payload.sectors;

  // DLD uses 4 regions (no eastern region)
  const dldRegions = dldSector.regions;
  assert.equal(dldRegions.length, 4);
  assert.deepEqual(
    dldRegions.map((r: { label: string }) => r.label),
    ['ภาคเหนือ', 'ภาคกลาง', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคใต้'],
  );
  assert.ok(dldRegions.every((r: { basis: string }) => r.basis === 'source'));

  // DOF aquaculture has distinct coastal vs crosswalk bases
  const shrimp = dofSector.species.find((s: { def: { id: string } }) => s.def.id === 'whiteleg-shrimp')!;
  assert.equal(shrimp.summary.regions.length, 6);
  assert.ok(shrimp.def.regionSourceLabel.includes('กรมประมง'));

  const tilapia = dofSector.species.find((s: { def: { id: string } }) => s.def.id === 'tilapia')!;
  assert.equal(tilapia.summary.regions.length, 5);
  assert.ok(tilapia.def.regionSourceLabel.includes('crosswalk'));

  // Warnings must alert about DLD vs DOF region discrepancy
  assert.ok(
    payload.warnings.some((w: string) => w.includes('กรมปศุสัตว์ใช้ภาค 4 ภาค') && w.includes('กรมประมงใช้ภาค 6 ภาค')),
  );
});

test('livestock API: returns metadata_only with sample: true and warnings', async () => {
  const response = await livestockRoute.GET(new Request(new URL('/api/v1/livestock', HUB_ORIGIN)));
  assert.equal(response.status, 200);
  const body = (await response.json()) as LivestockApiPayload;

  assert.equal(body.meta.access, 'metadata_only');
  assert.equal(body.meta.availability, 'ready');
  assert.equal(body.data.sample, true);
  assert.equal(body.data.sectors.length, 2);
  assert.ok(body.meta.warnings.length >= 5);
});

test('livestock API: filters by sector and species correctly', async () => {
  // Filter by sector
  const dldRes = await livestockRoute.GET(new Request(new URL('/api/v1/livestock?sector=livestock', HUB_ORIGIN)));
  assert.equal(dldRes.status, 200);
  const dldBody = (await dldRes.json()) as LivestockApiPayload;
  assert.equal(dldBody.data.sectors.length, 1);
  assert.equal(dldBody.data.sectors[0].id, 'livestock');

  // Filter by species
  const shrimpRes = await livestockRoute.GET(new Request(new URL('/api/v1/livestock?species=whiteleg-shrimp', HUB_ORIGIN)));
  assert.equal(shrimpRes.status, 200);
  const shrimpBody = (await shrimpRes.json()) as LivestockApiPayload;
  assert.equal(shrimpBody.data.sectors.length, 1);
  assert.equal(shrimpBody.data.sectors[0].species.length, 1);
  assert.equal(shrimpBody.data.sectors[0].species[0].def.id, 'whiteleg-shrimp');

  // Invalid species
  const invalidRes = await livestockRoute.GET(new Request(new URL('/api/v1/livestock?species=dragon', HUB_ORIGIN)));
  assert.equal(invalidRes.status, 400);
  const errBody = (await invalidRes.json()) as ApiErrorPayload;
  assert.equal(errBody.error.code, 'INVALID_QUERY');
  assert.ok(errBody.error.requestId.length > 0);

  // Mismatched sector and species
  const mismatchRes = await livestockRoute.GET(new Request(new URL('/api/v1/livestock?sector=aquaculture&species=cattle', HUB_ORIGIN)));
  assert.equal(mismatchRes.status, 400);
});
