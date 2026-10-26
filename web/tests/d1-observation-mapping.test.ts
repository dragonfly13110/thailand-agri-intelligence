import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { mapD1Observation } from '../lib/hub/d1-observation-mapping.ts';

/**
 * The generic D1 reader is `server-only` and speaks to a live database, so its
 * filter contract is exercised against a recording stand-in for `./d1`: the
 * tests assert the SQL text and the bound values the reader produces, and no
 * network or D1 token is involved.
 */
const STUBS: Record<string, string> = {
  'server-only': 'export default undefined;',
  './d1': [
    'export async function queryD1(sql, params = []) { globalThis.__d1Queries.push({ sql, params }); return []; }',
    'export async function countD1(sql, params = []) { globalThis.__d1Queries.push({ sql, params }); return 0; }',
    'export async function getD1() { return null; }',
    'export async function hasD1Catalog() { return false; }',
  ].join('\n'),
  './db': 'export class HubDatabaseError extends Error { constructor(code) { super(code); this.code = code; } }',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: 'data:text/javascript,' + encodeURIComponent(stub), shortCircuit: true };
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

const queries: { sql: string; params: unknown[] }[] = [];
(globalThis as Record<string, unknown>).__d1Queries = queries;

const { listD1Observations } = await import('../lib/hub/d1-numeric-repository.ts');

type Filters = import('../lib/hub/d1-numeric-repository.ts').D1ObservationFilters;

/** Run one read against the recording stand-in and return the SELECT it issued. */
async function captureSelect(filters: Filters) {
  queries.length = 0;
  const result = await listD1Observations(filters, { limit: 10 });
  assert.deepEqual(result.rows, [], 'the stand-in answers with no rows');
  assert.equal(queries.length, 2, 'one SELECT plus its count');
  return queries[0];
}

test('D1 mapping parses dimensions and preserves grid grain and nulls', () => {
  const observation = mapD1Observation({
    rowKey: 'chirps|2026-09-30|cell-1',
    seriesId: 'resource-1|rainfall',
    periodStart: null,
    periodEnd: '2026-09-30',
    periodLabel: '2026-09-30 UTC',
    locationCode: 'cell-1',
    locationKind: 'grid',
    provinceCode: null,
    value: null,
    unit: 'mm',
    dimensions: '{"cell_size_degrees":0.05}',
  });

  assert.equal(observation.locationKind, 'grid');
  assert.equal(observation.provinceCode, null);
  assert.equal(observation.value, null);
  assert.equal(observation.periodStart, null);
  assert.deepEqual(observation.dimensions, { cell_size_degrees: 0.05 });
  assert.equal(observation.qualityStatus, 'unknown');
});

test('malformed dimension text does not break a D1 observation read', () => {
  assert.deepEqual(mapD1Observation({ dimensions: '{' }).dimensions, {});
});

test('snake_case metric ids are accepted filters, not rejected as wildcards', async () => {
  for (const metricId of ['reservoir_volume', 'reservoir_capacity', 'reservoir_storage_pct', 't2m_mean_c', 'flood_area_rai']) {
    const select = await captureSelect({ metricId });
    assert.equal(select.sql.includes('o.metric_id=?'), true, `${metricId} must bind an equality predicate`);
    assert.equal(select.params.includes(metricId), true, `${metricId} must reach D1 as a bound value`);
    assert.equal(select.sql.includes(metricId), false, `${metricId} must never be interpolated into the SQL`);
  }
});

test('series keys and resource ids keep their underscores and punctuation', async () => {
  const select = await captureSelect({
    resourceId: 'https://app.rid.go.th/reservoir/api/reservoir/public',
    seriesKey: 'reservoir_volume:daily:reservoir:MCM',
  });
  assert.equal(select.params.includes('reservoir_volume:daily:reservoir:MCM'), true);
  assert.equal(select.params.includes('https://app.rid.go.th/reservoir/api/reservoir/public'), true);
});

test('a percent-encoded or control-byte filter value is still refused', async () => {
  const before = queries.length;
  for (const metricId of ['%reservoir_volume', 'reservoir_volume%27', 'reservoir_volume\n', 'reservoir\0volume']) {
    await assert.rejects(
      () => listD1Observations({ metricId }),
      (error: unknown) => {
        const thrown = error as { status?: number; code?: string };
        return thrown.status === 400 && thrown.code === 'INVALID_QUERY';
      },
      `${JSON.stringify(metricId)} must not be accepted as a metric id`,
    );
  }
  assert.equal(queries.length, before, 'a refused filter never reaches D1');
});

test('an overlong filter value is refused before the query is built', async () => {
  await assert.rejects(
    () => listD1Observations({ metricId: 'r'.repeat(121) }),
    (error: unknown) => (error as { status?: number }).status === 400,
  );
  await assert.rejects(
    () => listD1Observations({ provinceCode: '2121' }),
    (error: unknown) => (error as { status?: number }).status === 400,
  );
});

