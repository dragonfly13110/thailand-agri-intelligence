import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try { return nextResolve(specifier + suffix, context); } catch { /* try the next suffix */ }
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

const oae = await import('../lib/hub/oae-trade-data.ts');
const route = await import('../app/api/v1/trade/oae/route.ts');
const origin = 'http://hub.local';
const payloadHash = 'a'.repeat(64);

function sourceRow(options: {
  rowKey?: string | null;
  value?: number | null;
  product?: string;
  locationKind?: string | null;
  runId?: string;
  payloadSha256?: string;
  yearLabel?: string;
  recordsWritten?: number;
} = {}) {
  const yearLabel = options.yearLabel ?? '2568';
  const product = options.product ?? 'สินค้า ก';
  const sourceRowRef = `${yearLabel}|การส่งออก|${product}`;
  return {
    resourceId: oae.OAE_TRADE_RESOURCE_ID,
    accessStatus: 'approved_public',
    projectPublicationApproved: 1,
    activeRunId: 'run-oae-1',
    sourceId: 'oae',
    sourceDatasetId: oae.OAE_TRADE_DATASET_ID,
    datasetAccessStatus: 'approved_public',
    sourceAccessStatus: 'approved_public',
    runId: options.runId ?? 'run-oae-1',
    runStatus: 'succeeded',
    runKind: 'numeric',
    sourceRetrievedAt: '2026-10-28T02:00:00.000Z',
    completedAt: '2026-10-28T02:01:00.000Z',
    payloadSha256: options.payloadSha256 ?? payloadHash,
    adapterVersion: 'oae-trade-exports/1.0.0',
    recordsWritten: options.recordsWritten ?? 2,
    rowKey: options.rowKey === undefined ? `oae:export:${product}` : options.rowKey,
    metricId: 'agricultural_export_value',
    metricName: 'มูลค่าการส่งออก',
    product,
    value: options.value === undefined ? 12 : options.value,
    unit: 'ล้านบาท',
    periodStart: null,
    periodEnd: null,
    periodLabel: yearLabel,
    locationId: null,
    locationCode: null,
    locationKind: options.locationKind ?? null,
    locationName: null,
    provinceCode: null,
    dimensions: JSON.stringify({
      spatialSupport: 'not_reported',
      dataKind: 'official',
      measure: 'agricultural_export_value',
      tradeType: 'การส่งออก',
      sourceYearLabel: yearLabel,
      sourceYearLabelOrigin: 'csv_year_column',
      sourceYearLabelConvention: 'unknown',
      sourceRowId: sourceRowRef,
    }),
    qualityStatus: options.value === null ? 'missing' : 'good',
    sourceRowRef,
  };
}

test('OAE values preserve opaque year labels, null and zero with snapshot metadata', () => {
  const rows = [
    sourceRow({ product: 'สินค้า ก', value: null }),
    sourceRow({ product: 'สินค้า ข', value: 0 }),
  ];
  const result = oae.buildOaeTradeEnvelope(rows, '2568');

  assert.deepEqual(result.data.availableYearLabels, ['2568']);
  assert.equal(result.data.selectedYearLabel, '2568');
  assert.deepEqual(result.data.rows.map((row: { value: number | null }) => row.value), [null, 0]);
  assert.equal(result.data.rows[0].sourceYearLabel, '2568');
  assert.equal(result.data.rows[0].unit, 'ล้านบาท');
  const snapshot = result.data.snapshot;
  assert.ok(snapshot);
  assert.equal(snapshot.runId, 'run-oae-1');
  assert.equal(result.data.sourceGrain, 'product × trade type × source-year label');
  assert.equal(result.meta.datasetVersion, payloadHash);
  assert.equal(result.meta.dataAsOf, null);
  assert.equal(result.data.spatialSupport, 'not_reported');
});

test('year selection compares labels exactly and an unmatched label is empty', () => {
  const rows = [sourceRow({ recordsWritten: 1 })];
  const matched = oae.buildOaeTradeEnvelope(rows, '2568');
  const unmatched = oae.buildOaeTradeEnvelope(rows, '2025');

  assert.equal(matched.data.rowCount, 1);
  assert.equal(unmatched.data.rowCount, 0);
  assert.equal(unmatched.meta.availability, 'empty');
  assert.equal(unmatched.data.selectedYearLabel, '2025');
  assert.equal(unmatched.meta.datasetVersion, payloadHash);
});

test('metadata-only, active empty, and read failure remain distinct', async () => {
  const metadataOnly = oae.buildOaeTradeEnvelope([]);
  const activeEmpty = sourceRow({ rowKey: null });
  activeEmpty.recordsWritten = 0;
  const empty = oae.buildOaeTradeEnvelope([activeEmpty]);

  assert.equal(metadataOnly.meta.availability, 'metadata_only');
  assert.equal(empty.meta.availability, 'empty');
  assert.equal(empty.meta.access, 'approved_public');

  const response = await route.GET(new Request(new URL('/api/v1/trade/oae?from=2026-01-01', origin)));
  assert.equal(response.status, 400);
});

test('mixed run identity fails closed instead of mixing a changed active snapshot', () => {
  const rows = [
    sourceRow({ product: 'สินค้า ก' }),
    sourceRow({ product: 'สินค้า ข', runId: 'run-oae-2', payloadSha256: 'b'.repeat(64) }),
  ];
  assert.throws(
    () => oae.buildOaeTradeEnvelope(rows),
    (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === 503,
  );
});

test('OAE rows fail closed when the stored source-year grain contains dates or geography', () => {
  const row = sourceRow({ locationKind: 'province' });
  assert.throws(
    () => oae.buildOaeTradeEnvelope([row]),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error
      && error.code === 'OAE_TRADE_SNAPSHOT_INVALID',
  );
});

test('OAE API filters by the exact yearLabel and returns no-store snapshot metadata', async () => {
  const state: { rows: ReturnType<typeof sourceRow>[]; error: Error | null; sql: string; params: unknown[] } = {
    rows: [sourceRow({ product: 'สินค้า ก', value: null }), sourceRow({ product: 'สินค้า ข', value: 0 })],
    error: null,
    sql: '',
    params: [],
  };
  const db = {
    prepare(sql: string) {
      state.sql = sql;
      return {
        bind(...params: unknown[]) {
          state.params = params;
          return this;
        },
        async all() {
          if (state.error) throw state.error;
          return { results: state.rows, success: true, meta: {} };
        },
      };
    },
  };
  (globalThis as typeof globalThis & { env?: { DB: typeof db } }).env = { DB: db };

  const response = await route.GET(new Request(new URL('/api/v1/trade/oae?yearLabel=2568', origin)));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(state.params, [oae.OAE_TRADE_RESOURCE_ID, 'oae', oae.OAE_TRADE_DATASET_ID]);
  assert.match(state.sql, /r\.active_run_id/);
  assert.match(state.sql, /o\.run_id=run\.run_id/);
  assert.equal(body.data.selectedYearLabel, '2568');
  assert.equal(body.data.rows.length, 2);
  assert.equal(body.meta.datasetVersion, payloadHash);

  state.error = new Error('D1 read failed');
  const failed = await route.GET(new Request(new URL('/api/v1/trade/oae', origin)));
  const failureBody = await failed.json();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assert.equal(failureBody.error.code, 'OAE_TRADE_UNAVAILABLE');
});

