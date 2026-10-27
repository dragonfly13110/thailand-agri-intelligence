/**
 * Early-warning correctness regression tests (audit 2026-10-27 items 3, 5, 6).
 *
 * Pins the public builders (`buildRiskAlerts`, `buildEvidenceProvinces`,
 * `buildEvidenceSummary`) to three rules:
 * - a station whose unit is not confirmed never raises a mm/°C threshold alert
 *   and never contributes a mm average/max;
 * - a critical heat signal drives the province `overallRisk`/`urgency` instead
 *   of leaving the province `normal`;
 * - absent rainfall is `null` and absent drought input is `null`/unknown — never
 *   0/normal — while a measured 0 mm stays 0.
 *
 * Offline only: the module hooks below mirror `governance-containment.test.ts`.
 * No `.env`, network or D1 call is made; only pure builders are exercised.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import type {
  EarlyWarningEvidenceBundle,
  FloodEvidenceRow,
  StationEvidenceRow,
} from '../lib/hub/early-warning-data.ts';

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

const earlyWarning = await import('../lib/hub/early-warning-data.ts');

const PROVINCE_NAMES = new Map([
  ['10', 'กรุงเทพมหานคร'],
  ['50', 'เชียงใหม่'],
  ['64', 'สุโขทัย'],
]);

const PENDING = 'pending_official_confirmation';
const CONFIRMED = 'confirmed_by_tmd';

function station(overrides: Partial<StationEvidenceRow> = {}): StationEvidenceRow {
  return {
    stationCode: '48455',
    stationNameTh: 'สถานีทดสอบ',
    network: 'agro',
    provinceCode: '64',
    provinceNameTh: 'สุโขทัย',
    rainfallMm: null,
    maxTemperatureC: null,
    observedAtIct: '2026-10-26T07:00:00+07:00',
    observationDate: '2026-10-26',
    sourceResourceUrl: 'https://data.tmd.go.th/api/WeatherToday/V2/',
    unitStatus: PENDING,
    ...overrides,
  };
}

function floodRow(overrides: Partial<FloodEvidenceRow> = {}): FloodEvidenceRow {
  return {
    provinceCode: '64',
    provinceNameTh: 'สุโขทัย',
    provinceNameEn: 'Sukhothai',
    polygonCount: 1,
    floodedAreaRai: 10,
    floodedAreaSqKm: 0.016,
    riceAreaRai: null,
    satelliteSources: ['Sentinel-1 C-SAR'],
    ...overrides,
  };
}

function bundle(options: {
  stations?: StationEvidenceRow[];
  floods?: FloodEvidenceRow[];
  reservoirs?: EarlyWarningEvidenceBundle['reservoirs'];
} = {}): EarlyWarningEvidenceBundle {
  const stations = options.stations;
  const floods = options.floods;
  return {
    reservoirs: options.reservoirs ?? null,
    weather: stations
      ? {
          rows: stations,
          observationDate: '2026-10-26',
          runId: 'run-weather-1',
          sourceUpdatedAt: '2026-10-26T08:00:00+07:00',
          freshnessDays: 1,
          runStatus: 'succeeded',
          networks: ['agro'],
        }
      : null,
    flood: floods
      ? {
          rows: floods,
          sourceMode: 'snapshot',
          retrievedAt: '2026-10-26T08:00:00+07:00',
          snapshotRetrievedAt: '2026-10-26T07:30:00+07:00',
          polygonCount: floods.reduce((sum, row) => sum + row.polygonCount, 0),
          totalsFloodedAreaRai: floods.reduce((sum, row) => sum + row.floodedAreaRai, 0),
          totalsRiceAreaRai: null,
        }
      : null,
  };
}

function build(stations: StationEvidenceRow[], floods: FloodEvidenceRow[] = []) {
  const evidence = bundle({ stations, floods });
  const alerts = earlyWarning.buildRiskAlerts(evidence, PROVINCE_NAMES);
  const provinces = earlyWarning.buildEvidenceProvinces(alerts, evidence, PROVINCE_NAMES);
  const summary = earlyWarning.buildEvidenceSummary(evidence, alerts, provinces);
  return { evidence, alerts, provinces, summary };
}

test('pending-unit station never raises mm/°C alerts nor rainfall summary', () => {
  const { alerts, provinces, summary } = build([
    station({ rainfallMm: 120, maxTemperatureC: 45, unitStatus: PENDING }),
  ]);

  assert.deepEqual(
    alerts.filter((alert) => alert.sourceId === 'tmd'),
    [],
    'pending unit: no TMD threshold alert may cite mm/°C',
  );
  assert.equal(alerts.length, 0, 'pending unit: no signal at all');
  assert.deepEqual(provinces, [], 'pending unit: no province row may be invented');
  assert.equal(summary.avgRainfall7dMm, null, 'pending unit: average rainfall must be null, not 0');
  assert.equal(summary.maxRainfall7dMm, null, 'pending unit: maximum rainfall must be null, not 0');
  assert.match(summary.rainfallBasis, /ยืนยัน/, 'pending unit: basis must explain the unit hold');
});

test('summary averages only confirmed stations, excluding larger pending raw values', () => {
  const { summary } = build([
    station({ stationCode: 'A', rainfallMm: 10, unitStatus: CONFIRMED }),
    station({ stationCode: 'B', rainfallMm: 120, unitStatus: PENDING }),
  ]);

  assert.equal(summary.avgRainfall7dMm, 10, 'confirmed-only average');
  assert.equal(summary.maxRainfall7dMm, 10, 'confirmed-only maximum');
});

test('pending rainfall next to a measured flood polygon stays null with a unit note', () => {
  const { alerts, provinces } = build(
    [station({ rainfallMm: 120, unitStatus: PENDING })],
    [floodRow({ floodedAreaRai: 10 })],
  );

  assert.equal(alerts.filter((alert) => alert.sourceId === 'tmd').length, 0);
  assert.equal(provinces.length, 1, 'the GISTDA polygon still produces the province row');
  assert.equal(provinces[0].rainfall7dMm, null, 'pending station rainfall must not appear as mm');
  assert.match(provinces[0].rainfallBasis ?? '', /ยืนยัน/, 'row basis must name the pending unit');
  assert.equal(provinces[0].droughtRiskScore, null, 'no drought input stays unknown');
  assert.equal(provinces[0].droughtRiskLevel, null, 'no drought input is not normal');
});

test('confirmed units matching thresholds still alert and summarise', () => {
  const { alerts, summary } = build([
    station({ rainfallMm: 120, maxTemperatureC: 45, unitStatus: CONFIRMED }),
  ]);

  const rain = alerts.find((alert) => alert.hazard === 'flood' && alert.sourceId === 'tmd');
  const heat = alerts.find((alert) => alert.hazard === 'heat');
  assert.equal(rain?.level, 'critical', 'confirmed rain 120 mm is critical');
  assert.equal(heat?.level, 'critical', 'confirmed heat 45 °C is critical');
  assert.equal(summary.avgRainfall7dMm, 120, 'confirmed rainfall is summarised');
  assert.equal(summary.maxRainfall7dMm, 120, 'confirmed rainfall max');
});

test('critical heat makes the province critical and urgent, not normal', () => {
  const { alerts, provinces } = build([
    station({ maxTemperatureC: 45, unitStatus: CONFIRMED }),
  ]);

  const heat = alerts.find((alert) => alert.hazard === 'heat');
  assert.equal(heat?.level, 'critical', 'heat alert is critical');
  assert.equal(provinces.length, 1, 'only the province with evidence appears');
  assert.equal(provinces[0].provinceCode, '64');
  assert.equal(provinces[0].overallRisk, 'critical', 'critical heat must lift overallRisk');
  assert.equal(provinces[0].urgency, 'urgent', 'critical heat must lift urgency');
  assert.equal(provinces[0].heatRiskLevel, 'critical', 'heat level is exposed per province');
  assert.equal(provinces[0].floodRiskScore, null, 'heat alone cannot prove flood risk is zero');
  assert.equal(provinces[0].floodRiskLevel, null, 'heat alone cannot prove flood risk is normal');
  assert.equal(provinces[0].heatRiskScore, heat?.score, 'heat score is the signal score');
  assert.equal(provinces[0].droughtRiskScore, null, 'absent drought input stays unknown');
  assert.equal(provinces[0].droughtRiskLevel, null, 'absent drought input is not normal');
  assert.equal(provinces[0].rainfall7dMm, null, 'absent rainfall stays null');
});

test('a province with no drought input is unknown, not normal or zero', () => {
  const { alerts, provinces, summary } = build([], [floodRow({ floodedAreaRai: 10 })]);

  assert.equal(alerts.length, 1);
  assert.equal(provinces.length, 1);
  assert.equal(provinces[0].overallRisk, 'normal', 'measured normal flood evidence only');
  assert.equal(provinces[0].droughtRiskScore, null, 'drought score must be null');
  assert.equal(provinces[0].droughtRiskLevel, null, 'drought level must be null');
  assert.equal(provinces[0].heatRiskLevel, null, 'heat level must be null without a heat signal');
  assert.equal(provinces[0].rainfall7dMm, null, 'rainfall must be null without weather rows');
  assert.equal(summary.avgRainfall7dMm, null, 'no weather input: average is null');
  assert.equal(summary.maxRainfall7dMm, null, 'no weather input: max is null');
  assert.equal(summary.rainfallBasis.includes('absent ไม่ใช่ 0'), true, 'basis explains absent ≠ 0');
});

test('a measured zero rainfall with a confirmed unit stays 0', () => {
  const { provinces, summary } = build(
    [station({ rainfallMm: 0, maxTemperatureC: 35, unitStatus: CONFIRMED })],
    [floodRow({ floodedAreaRai: 10 })],
  );

  assert.equal(provinces.length, 1);
  assert.equal(provinces[0].rainfall7dMm, 0, 'measured zero stays 0, not null');
  assert.equal(summary.avgRainfall7dMm, 0, 'summary zero is a measured zero');
  assert.equal(summary.maxRainfall7dMm, 0, 'summary max zero is a measured zero');
});

test('drought-type filter does not treat unknown drought rows as normal', () => {
  const { provinces } = build([], [floodRow({ floodedAreaRai: 10 })]);

  assert.equal(provinces[0].droughtRiskLevel, null);
  assert.deepEqual(
    earlyWarning.filterProvinceRisks(provinces, { type: 'drought' }),
    [],
    'unknown drought must not pass a drought filter',
  );
});
