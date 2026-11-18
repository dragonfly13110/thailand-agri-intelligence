import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

/**
 * The province pages answer their weather and reservoir tables from published D1 rows,
 * and those rows only change when a sync run flips `resources.active_run_id` - at most a
 * few times a day. Before the memo, every page view (and every reload while a page was
 * being checked) walked D1 again for a statement it had already run, which is how a
 * couple of hundred views spent the whole free-tier daily row-read budget. Only the
 * published-row walk is memoised: catalog and licence reads stay live so a reviewer sees
 * an approval immediately. A recording stand-in for the D1 client counts the statements,
 * so no network and no D1 token is involved.
 */
type StubRow = Record<string, unknown>;
type QueryCall = { sql: string; values: unknown[] };

const state = { calls: [] as QueryCall[], rows: [] as StubRow[][], failure: null as Error | null };

const STUBS: Record<string, string> = {
  'server-only': 'export default undefined;',
  './d1': [
    'async function run(sql, params) {',
    '  const state = globalThis.__memoState;',
    '  state.calls.push({ sql, values: params });',
    '  if (state.failure) throw state.failure;',
    '  return state.rows[0] ?? [];',
    '}',
    'export async function queryD1(sql, params = []) { return run(sql, params); }',
    'export async function countD1(sql, params = []) { run(sql, params); return 0; }',
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
            // try the next TypeScript source before rethrowing
          }
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
      return {
        format: 'module',
        source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

(globalThis as Record<string, unknown>).__memoState = state;

const { listD1ObservationRows, D1_OBSERVATION_ROW_LIMIT } = await import('../lib/hub/d1-numeric-repository.ts');

let resourceSequence = 0;

/** The memo is module state, so each test walks a resource of its own. */
function uniqueFilters(provinceCode = '73') {
  resourceSequence += 1;
  return { resourceId: `https://resource.test/${resourceSequence}`, dimensionProvinceCode: provinceCode };
}

function stubRows(rowKeys: string[]): StubRow[] {
  return rowKeys.map((rowKey) => ({
    resourceId: 'https://resource.test/any',
    runId: 'run-1',
    rowKey,
    seriesKey: `${rowKey}:t2mMaxC`,
    sourceId: 'open-meteo',
    metricId: 't2mMaxC',
    dimensions: JSON.stringify({ provinceCode: '73' }),
  }));
}

test.beforeEach(() => {
  state.calls = [];
  state.rows = [stubRows(['day-1', 'day-2'])];
  state.failure = null;
});

test('the same published walk is answered from the memo inside its window', async () => {
  const filters = uniqueFilters();

  const first = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });
  const second = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });

  assert.deepEqual(first.map((row) => row.rowKey), ['day-1', 'day-2']);
  assert.deepEqual(second.map((row) => row.rowKey), ['day-1', 'day-2']);
  assert.equal(state.calls.length, 1, 'one statement for two identical walks');
});

test('another province, resource or page is not served from a different walk', async () => {
  const filters = uniqueFilters();
  const otherProvince = { ...filters, dimensionProvinceCode: '10' };
  const nextPage = { ...filters, resourceId: uniqueFilters().resourceId };

  await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });
  await listD1ObservationRows(otherProvince, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });
  await listD1ObservationRows(nextPage, { limit: D1_OBSERVATION_ROW_LIMIT, offset: D1_OBSERVATION_ROW_LIMIT, cache: true });

  assert.equal(state.calls.length, 3, 'each distinct walk still reaches D1');
});

test('a caller cannot rewrite the memoised walk through the rows it was given', async () => {
  const filters = uniqueFilters();

  const first = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });
  first.push({ ...first[0], rowKey: 'injected' });
  first[0].rowKey = 'mutated';

  const second = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });

  assert.deepEqual(second.map((row) => row.rowKey), ['day-1', 'day-2']);
  assert.equal(state.calls.length, 1, 'the mutated read is still the memoised one');
});

test('a walk that does not ask for the cache always reaches D1', async () => {
  const filters = uniqueFilters('10');

  await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0 });
  await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0 });
  await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });

  assert.equal(state.calls.length, 3, 'the livestock and trade readers keep reading live');
});

test('the memo expires so a freshly published batch becomes visible', async () => {
  const filters = uniqueFilters();
  mock.timers.enable({ apis: ['Date'] });
  try {
    const before = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });
    assert.equal(state.calls.length, 1, 'a new walk pays D1 once');

    mock.timers.setTime(Date.now() + 61_000);
    state.rows = [stubRows(['day-after-republish'])];

    const refreshed = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });

    assert.deepEqual(before.map((row) => row.rowKey), ['day-1', 'day-2']);
    assert.deepEqual(refreshed.map((row) => row.rowKey), ['day-after-republish']);
    assert.equal(state.calls.length, 2, 'an expired memo re-reads D1');
  } finally {
    mock.timers.reset();
  }
});

test('concurrent identical walks share one statement', async () => {
  const filters = uniqueFilters();

  const [left, right] = await Promise.all([
    listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true }),
    listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true }),
  ]);

  assert.deepEqual(left.map((row) => row.rowKey), right.map((row) => row.rowKey));
  assert.equal(state.calls.length, 1, 'the page fires the same walk twice at once');
});

test('a walk that fails is not kept, so the next read tries D1 again', async () => {
  const filters = uniqueFilters();
  state.failure = new Error('D1 row-read budget exhausted');

  await assert.rejects(() => listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true }));
  state.failure = null;
  state.rows = [stubRows(['day-1', 'day-2'])];

  const recovered = await listD1ObservationRows(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0, cache: true });

  assert.deepEqual(recovered.map((row) => row.rowKey), ['day-1', 'day-2']);
  assert.equal(state.calls.length, 2, 'the failed walk is retried');
});
