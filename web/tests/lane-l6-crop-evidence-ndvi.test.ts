/**
 * Lane L6 — MODIS NDVI point evidence for /crop-evidence.
 *
 * The reader walks are exercised with injected fake pages (no network, no D1):
 * the contract under test is honesty — sample:false, null stays null, NDVI stays
 * a unitless index, scope counts points/tiles/composites, and empty vs
 * unavailable never degrade into sample values.
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

const data = await import('../lib/hub/crop-evidence-data.ts');
const ndviReader = await import('../lib/hub/crop-evidence-ndvi.ts');

type SourceRow = Record<string, unknown>;

function row(overrides: Partial<SourceRow> & { rowKey: string }): SourceRow {
  return {
    resourceId: 'modis-13A1-061',
    runId: 'run-modis-1',
    runStatus: 'succeeded',
    seriesKey: 'ndvi:16d:grid_point:index',
    sourceId: 'modis',
    datasetId: 'MOD13A1.061',
    adapterVersion: 'modis-ndvi-v1',
    payloadSha256: 'abc123sha',
    sourceRetrievedAt: '2026-10-01T02:00:00Z',
    runCompletedAt: '2026-10-01T02:05:00Z',
    observedAt: '2026-09-30T00:00:00Z',
    periodStart: '2026-09-30',
    periodEnd: '2026-10-15T23:59:59Z',
    periodLabel: 'A2026273',
    locationId: 'modis-point-13.800-100.250',
    locationCode: '13.8,100.25',
    locationKind: 'grid',
    locationName: 'นครปฐม (จุดกริด 13.80, 100.25)',
    provinceCode: null,
    cropCode: null,
    cropName: null,
    metricId: 'ndvi',
    metricName: 'NDVI',
    product: null,
    grade: null,
    market: null,
    unit: 'index',
    value: 0.6737,
    dimensions: { tile_id: 'h27v07', modis_item_id: 'MOD13A1.A2026273.h27v07.061.2026295123456' },
    qualityStatus: 'good',
    quality: {},
    sourceRowRef: 'MOD13A1.A2026273.h27v07.061',
    ...overrides,
  };
}

const FIXTURE_ROWS: SourceRow[] = [
  row({ rowKey: 'obs-1' }),
  row({
    rowKey: 'obs-2',
    value: null,
    qualityStatus: 'missing',
    periodStart: '2026-09-14',
    periodEnd: '2026-09-29T23:59:59Z',
    periodLabel: 'A2026257',
  }),
  row({
    rowKey: 'obs-3',
    locationId: 'modis-point-18.750-99.000',
    locationCode: '18.75,99.0',
    locationName: 'เชียงใหม่ (จุดกริด 18.75, 99.00)',
    dimensions: { tile_id: 'h27v08', modis_item_id: 'MOD13A1.A2026273.h27v08.061.2026295123456' },
    value: 0.5312,
  }),
];

function fakeReader(pages: { rows: SourceRow[]; total: number }[]) {
  let calls = 0;
  return async () => {
    const page = pages[Math.min(calls, pages.length - 1)];
    calls += 1;
    return { rows: page.rows, total: page.total };
  };
}

test('NDVI evidence keeps sample:false, null values and the unitless index verbatim', () => {
  const evidence = data.buildCropEvidenceNdvi(FIXTURE_ROWS as never);
  assert.equal(evidence.sample, false);
  assert.equal(evidence.dataKind, 'observed');
  assert.equal(evidence.availability, 'ready');
  assert.equal(evidence.access, 'approved_public');
  assert.equal(evidence.schemaVersion, 'crop-evidence-ndvi-v1');
  assert.equal(evidence.observations.length, 3);

  const missing = evidence.observations.find((o: { rowKey: string }) => o.rowKey === 'obs-2');
  assert.ok(missing, 'fixture row obs-2 must exist');
  assert.equal(missing.value, null, 'a missing composite must stay null, never 0');
  assert.equal(missing.qualityStatus, 'missing');

  const present = evidence.observations.find((o: { rowKey: string }) => o.rowKey === 'obs-1');
  assert.ok(present, 'fixture row obs-1 must exist');
  assert.equal(present.value, 0.6737);
  assert.equal(present.unit, 'index', 'NDVI stays the published unitless index');
});

test('NDVI scope states points, tiles and composites so coverage cannot be inferred', () => {
  const evidence = data.buildCropEvidenceNdvi(FIXTURE_ROWS as never);
  assert.equal(evidence.scope.spatialSupport, 'grid_point');
  assert.equal(evidence.scope.pointCount, 2);
  assert.equal(evidence.scope.tileCount, 2);
  assert.deepEqual([...evidence.scope.tileIds].sort(), ['h27v07', 'h27v08']);
  assert.equal(evidence.scope.compositeCount, 2);
  assert.ok(evidence.scope.statement.includes('ไม่ใช่ข้อมูลครอบคลุม'));
  assert.ok(evidence.warnings.some((w: string) => w.includes('จุดกริด')));
  assert.equal(evidence.dataAsOf, '2026-10-15T23:59:59Z');
  assert.deepEqual(evidence.provenance.runIds, ['run-modis-1']);
  assert.equal(evidence.provenance.payloadSha256, 'abc123sha');
  assert.equal(evidence.provenance.rowCount, 3);

  const points = evidence.points as { locationId: string; latestNdvi: number | null; missingValueCount: number }[];
  const chiangMai = points.find((p) => p.locationId === 'modis-point-18.750-99.000');
  assert.equal(chiangMai?.latestNdvi, 0.5312);
  const nakhon = points.find((p) => p.locationId === 'modis-point-13.800-100.250');
  assert.equal(nakhon?.missingValueCount, 1);
});

test('capped walks and out-of-range values surface as warnings, never silent edits', () => {
  const capped = data.buildCropEvidenceNdvi(FIXTURE_ROWS as never, { capped: true });
  assert.equal(capped.capped, true);
  assert.ok(capped.warnings.some((w: string) => w.includes('เพดาน')));

  const weird = data.buildCropEvidenceNdvi([row({ rowKey: 'obs-bad', value: 30000.5 })] as never);
  assert.equal(weird.observations[0].value, 30000.5, 'the raw warehouse value is preserved');
  assert.ok(weird.warnings.some((w: string) => w.includes('obs-bad') && w.includes('นอกช่วง')));
});

test('empty and unavailable states never degrade into sample values', () => {
  const empty = data.emptyCropEvidenceNdvi();
  assert.equal(empty.availability, 'empty');
  assert.equal(empty.sample, false);
  assert.deepEqual(empty.observations, []);
  assert.deepEqual(empty.points, []);
  assert.equal(empty.access, 'metadata_only');
  assert.ok(empty.warnings.some((w: string) => w.includes('ไม่ใช่หลักฐานว่าพื้นที่ไม่มีพืช')));

  const unavailable = data.unavailableCropEvidenceNdvi();
  assert.equal(unavailable.availability, 'unavailable');
  assert.equal(unavailable.sample, false);
  assert.equal(unavailable.notAvailableReason, 'D1_READ_FAILED');
  assert.ok(unavailable.warnings.some((w: string) => w.includes('ไม่แสดงค่าตัวอย่าง')));
});

test('readCropEvidenceNdvi pages, caps and fails closed through the injected reader', async () => {
  const first = FIXTURE_ROWS.slice(0, 2);
  const second = FIXTURE_ROWS.slice(2);
  const paged = await ndviReader.readCropEvidenceNdvi({
    reader: fakeReader([
      { rows: first, total: 3 },
      { rows: second, total: 3 },
    ]) as never,
  });
  assert.equal(paged.availability, 'ready');
  assert.equal(paged.observations.length, 3);
  assert.equal(paged.capped, false);

  const short = await ndviReader.readCropEvidenceNdvi({
    reader: fakeReader([{ rows: first, total: 9 }]) as never,
  });
  assert.equal(short.availability, 'ready');
  assert.equal(short.capped, true);

  const none = await ndviReader.readCropEvidenceNdvi({
    reader: fakeReader([{ rows: [], total: 0 }]) as never,
  });
  assert.equal(none.availability, 'empty');

  const broken = await ndviReader.readCropEvidenceNdvi({
    reader: (async () => {
      throw new Error('D1 database is not available');
    }) as never,
  });
  assert.equal(broken.availability, 'unavailable');
  assert.equal(broken.sample, false);
});

test('main crop-evidence payload contract is untouched by the NDVI addition', () => {
  const payload = data.buildCropEvidence();
  // keys fixed by climate-crop-empty-state.test.ts, minus the two that only
  // the route handler adds (appliedFilters, confidence)
  assert.deepEqual(Object.keys(payload).sort(), [
    'access', 'cropSummaries', 'crops', 'dataAsOf', 'districts',
    'filters', 'methodNotes', 'provinces', 'pythonLineage', 'recommendations', 'sample',
    'schemaVersion', 'sources', 'statusCounts', 'thresholds', 'warnings',
  ].sort());
  assert.equal(payload.sample, false);
  assert.deepEqual(payload.districts, []);
});
