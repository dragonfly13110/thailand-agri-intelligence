import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

// Same loader the existing hub tests use: resolve extensionless .ts imports and stub 'server-only'.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try { return nextResolve(specifier + suffix, context); } catch { /* try next */ }
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
      return { format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const oae = await import('../lib/hub/oae-trade-data.ts');
const route = await import('../app/api/v1/trade/oae/route.ts');
const origin = 'http://hub.local';
const payloadHash = 'c'.repeat(64);

function sourceRow(options: { product?: string; value?: number | null; yearLabel?: string; recordsWritten?: number } = {}) {
  const yearLabel = options.yearLabel ?? '2568';
  const product = options.product ?? 'ข้าวเเละผลิตภัณฑ์';
  const value = options.value === undefined ? 182444 : options.value;
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
    runId: 'run-oae-1',
    runStatus: 'succeeded',
    runKind: 'numeric',
    sourceRetrievedAt: '2026-10-28T02:00:00.000Z',
    completedAt: '2026-10-28T02:01:00.000Z',
    payloadSha256: payloadHash,
    adapterVersion: 'oae-trade-exports/1.0.0',
    recordsWritten: options.recordsWritten ?? 2,
    rowKey: `oae:export:${product}`,
    metricId: 'agricultural_export_value',
    metricName: 'มูลค่าการส่งออก',
    product,
    value,
    unit: 'ล้านบาท',
    periodStart: null,
    periodEnd: null,
    periodLabel: yearLabel,
    locationId: null,
    locationCode: null,
    locationKind: null,
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
    qualityStatus: value === null ? 'missing' : 'good',
    sourceRowRef,
  };
}

test('/trade read envelope carries real rows with sample:false and opaque year label', () => {
  const envelope = oae.buildOaeTradeEnvelope([
    sourceRow({ product: 'ข้าวเเละผลิตภัณฑ์', value: 182444 }),
    sourceRow({ product: 'ยางธรรมชาติ', value: null }),
  ], '2568');

  assert.equal(envelope.data.sample, false);
  assert.equal(envelope.meta.availability, 'ready');
  assert.equal(envelope.meta.access, 'approved_public');
  assert.deepEqual(envelope.meta.sourceIds, ['oae']);
  assert.equal(envelope.meta.datasetVersion, payloadHash);
  // The OAE year label is kept verbatim; no date/month is fabricated and dataAsOf stays null.
  assert.equal(envelope.data.rows[0].sourceYearLabel, '2568');
  assert.equal(envelope.data.sourceYearConvention, 'unknown');
  assert.equal(envelope.meta.dataAsOf, null);
  // missing stays null, never coerced to zero.
  assert.deepEqual(envelope.data.rows.map((row) => row.value), [182444, null]);
  // provenance snapshot is surfaced for the reader
  assert.equal(envelope.data.snapshot?.runId, 'run-oae-1');
  assert.ok(envelope.meta.warnings.some((w) => /ป้ายปี/.test(w)));
});

test('/trade read envelope fails to metadata-only and empty states honestly', () => {
  const metadataOnly = oae.buildOaeTradeEnvelope([]);
  assert.equal(metadataOnly.data.sample, false);
  assert.equal(metadataOnly.meta.availability, 'metadata_only');
  assert.equal(metadataOnly.meta.access, 'metadata_only');
  assert.equal(metadataOnly.data.rows.length, 0);

  const emptyYear = oae.buildOaeTradeEnvelope([sourceRow({ recordsWritten: 1 })], '2099');
  assert.equal(emptyYear.meta.availability, 'empty');
  assert.equal(emptyYear.meta.access, 'approved_public');
  assert.equal(emptyYear.data.rowCount, 0);
});

test('/api/v1/trade/oae returns real numbers with sample:false and no-store', async () => {
  const db = {
    prepare() {
      return { bind() { return this; }, async all() { return { results: [
        sourceRow({ product: 'ข้าวเเละผลิตภัณฑ์', value: 182444 }),
        sourceRow({ product: 'ผลไม้และผลิตภัณฑ์', value: 296645 }),
      ], success: true, meta: {} }; } };
    },
  };
  (globalThis as typeof globalThis & { env?: { DB: typeof db } }).env = { DB: db };

  const response = await route.GET(new Request(new URL('/api/v1/trade/oae?yearLabel=2568', origin)));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.data.sample, false);
  assert.equal(body.meta.availability, 'ready');
  assert.equal(body.data.selectedYearLabel, '2568');
  assert.deepEqual(body.data.rows.map((row: { value: number | null }) => row.value).sort((a: number, b: number) => a - b), [182444, 296645]);
  assert.equal(body.data.rows.every((row: { sourceYearLabel: string }) => row.sourceYearLabel === '2568'), true);

  delete (globalThis as typeof globalThis & { env?: unknown }).env;
});
