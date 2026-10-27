/**
 * Public API contracts for climate history and crop evidence while no approved
 * numeric batch is available. Route handlers run in memory against local data.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const climateRoute = await import('../app/api/v1/climate-history/route.ts');
const cropRoute = await import('../app/api/v1/crop-evidence/route.ts');
const HUB_ORIGIN = 'http://hub.local';

type ApiBody = {
  data: Record<string, any>;
  meta: {
    availability: string;
    freshness: string;
    completeness: string;
    access: string;
    sourceIds: string[];
    dataAsOf: string | null;
    sourceUpdatedAt?: string | null;
    datasetVersion: string | null;
    warnings: string[];
  };
};

type ErrorBody = { error: { code: string; message: string; requestId: string } };

async function get(route: { GET: (request: Request) => Promise<Response> }, path: string) {
  return route.GET(new Request(new URL(path, HUB_ORIGIN)));
}

test('climate history API returns a truthful empty overview without generated numbers', async () => {
  const response = await get(climateRoute, '/api/v1/climate-history?provinceCode=10&startYear=2005&endYear=2024');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const body = await response.json() as ApiBody;
  assert.deepEqual(Object.keys(body).sort(), ['data', 'meta']);
  assert.deepEqual(Object.keys(body.data).sort(), [
    'baseline', 'dataKind', 'endYear', 'location', 'notableYears', 'sample', 'source',
    'startYear', 'trends', 'units', 'years', 'yearsSpan', 'yearsWithData',
  ]);
  assert.equal(body.meta.availability, 'empty');
  assert.equal(body.meta.freshness, 'unknown');
  assert.equal(body.meta.completeness, 'unknown');
  assert.equal(body.meta.access, 'metadata_only');
  assert.deepEqual(body.meta.sourceIds, []);
  assert.equal(body.meta.dataAsOf, null);
  assert.equal(body.meta.sourceUpdatedAt, null);

  assert.equal(body.data.dataKind, 'empty');
  assert.equal(body.data.sample, false);
  assert.equal(body.data.yearsWithData, 0);
  assert.deepEqual(body.data.years, []);
  assert.deepEqual(body.data.notableYears, []);
  assert.deepEqual(body.data.baseline, {
    tmeanNormalC: null,
    rainfallNormalMm: null,
    hotDaysNormal: null,
  });
  assert.deepEqual(body.data.trends, {
    tmeanPerDecadeC: null,
    tmaxPerDecadeC: null,
    hotDaysPerDecade: null,
    rainfallTrendMmPerDecade: null,
    firstFiveYearMeanC: null,
    lastFiveYearMeanC: null,
    warmingDeltaC: null,
  });
  assert.ok(body.meta.warnings.some((warning) => warning.includes('CHIRPS')));
});

test('climate history API preserves query validation', async () => {
  for (const path of [
    '/api/v1/climate-history?provinceCode=99&startYear=2005&endYear=2024',
    '/api/v1/climate-history?provinceCode=10&startYear=2020&endYear=2024',
  ]) {
    const response = await get(climateRoute, path);
    assert.equal(response.status, 400, path);
    const body = await response.json() as ErrorBody;
    assert.equal(body.error.code, 'INVALID_QUERY', path);
    assert.ok(body.error.requestId.length > 0, path);
  }
});

test('crop evidence API returns no district or crop numeric evidence', async () => {
  const response = await get(cropRoute, '/api/v1/crop-evidence?provinceCode=73&crop=rice');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const body = await response.json() as ApiBody;
  assert.deepEqual(Object.keys(body).sort(), ['data', 'meta']);
  assert.deepEqual(Object.keys(body.data).sort(), [
    'access', 'appliedFilters', 'confidence', 'cropSummaries', 'crops', 'dataAsOf', 'districts',
    'filters', 'methodNotes', 'provinces', 'pythonLineage', 'recommendations', 'sample',
    'schemaVersion', 'sources', 'statusCounts', 'thresholds', 'warnings',
  ]);
  assert.equal(body.meta.availability, 'empty');
  assert.equal(body.meta.freshness, 'unknown');
  assert.equal(body.meta.completeness, 'unknown');
  assert.equal(body.meta.access, 'metadata_only');
  assert.deepEqual(body.meta.sourceIds, []);
  assert.equal(body.meta.dataAsOf, null);
  assert.equal(body.meta.datasetVersion, null);

  assert.equal(body.data.sample, false);
  assert.equal(body.data.dataAsOf, null);
  assert.deepEqual(body.data.districts, []);
  assert.deepEqual(body.data.cropSummaries, []);
  assert.deepEqual(body.data.recommendations, []);
  assert.deepEqual(body.data.statusCounts, {
    verified: 0,
    pending_verification: 0,
    discrepancy: 0,
  });
  assert.ok(body.meta.warnings.some((warning) => warning.includes('ยังไม่มีข้อมูลตัวเลข')));
});

test('crop evidence API preserves query validation', async () => {
  for (const path of [
    '/api/v1/crop-evidence?provinceCode=99',
    '/api/v1/crop-evidence?provinceCode=73&crop=durian',
  ]) {
    const response = await get(cropRoute, path);
    assert.equal(response.status, 400, path);
    const body = await response.json() as ErrorBody;
    assert.equal(body.error.code, 'INVALID_QUERY', path);
    assert.ok(body.error.requestId.length > 0, path);
  }
});
