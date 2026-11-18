/**
 * Integrity of the shipped ERA5 annual extract.
 *
 * This is the only test that reads the real bundle; the reader tests inject
 * fixtures so they stay independent of when the fetch ran. A failure here means
 * the shipped file drifted from the 77-centroid registry or lost calendar days,
 * not that the web code is wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import bundled from '../data/climate-history/era5-annual-2016-2025.json' with { type: 'json' };

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

const annual = await import('../lib/hub/climate-history-annual.ts');
const climateData = await import('../lib/hub/climate-history-data.ts');

function calendarDays(year: number): number {
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
}

test('shipped annual extract covers all 77 centroids with ten complete ERA5 years', () => {
  const validation = annual.validateAnnualExtract(bundled);
  assert.equal(validation.ok, true, validation.ok ? '' : validation.reason);
  if (!validation.ok) return;
  const { extract } = validation;

  const codes = Object.keys(extract.provinces).sort();
  assert.deepEqual(codes, Object.keys(climateData.PROVINCE_CENTROIDS).sort());
  assert.equal(codes.length, 77);

  for (const [code, record] of Object.entries(extract.provinces)) {
    const centroid = climateData.PROVINCE_CENTROIDS[code]!;
    assert.equal(record.requestedLatitude, Math.round(centroid.lat * 10_000) / 10_000, code);
    assert.equal(record.requestedLongitude, Math.round(centroid.lon * 10_000) / 10_000, code);
    assert.equal(record.dailyRows, 3653, code);
    assert.equal(record.firstDay, '2016-01-01', code);
    assert.equal(record.lastDay, '2025-12-31', code);
    assert.deepEqual(record.years.map((row) => row.year), [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025], code);

    for (const row of record.years) {
      const days = calendarDays(row.year);
      assert.equal(row.calendarDays, days, `${code}/${row.year}`);
      assert.equal(row.completeYear, true, `${code}/${row.year}`);
      assert.equal(row.daysWithData.temperatureMean, days, `${code}/${row.year}`);
      assert.equal(row.daysWithData.temperatureMax, days, `${code}/${row.year}`);
      assert.equal(row.daysWithData.temperatureMin, days, `${code}/${row.year}`);
      assert.equal(row.daysWithData.precipitation, days, `${code}/${row.year}`);
      assert.ok(row.tmeanC !== null && row.tmaxMeanC !== null && row.tminMeanC !== null, `${code}/${row.year}`);
      assert.ok(row.rainfallTotalMm !== null && row.rainfallTotalMm >= 0, `${code}/${row.year}`);
      assert.ok(row.hotDays38C !== null && row.longestDrySpellDays !== null, `${code}/${row.year}`);
    }
  }
});

test('a province outside the five local cache points reads from the shipped bundle', () => {
  const read = annual.readReviewedAnnualExtract('10', 2016, 2025);
  assert.equal(read.status, 'ok');
  if (read.status !== 'ok') return;
  assert.equal(read.years.length, 10);
  assert.deepEqual(read.missingYears, []);
  assert.equal(read.province.requestedLatitude, 13.7563);
});
