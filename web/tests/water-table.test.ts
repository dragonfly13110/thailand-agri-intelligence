/**
 * Water reservoir table behaviour tests.
 *
 * The /water page holds every published reservoir (461 at the time of
 * writing) but used to render only the 25 with the lowest storage. These
 * tests pin the search/region/pagination rules that let all rows be reached
 * without inventing or reordering values.
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

const table = await import('../lib/hub/water-table.ts');

type Record = import('../lib/hub/water-data.ts').WaterReservoirRecord;

function record(overrides: Partial<Record> & { reservoirId: string }): Record {
  return {
    name: `อ่างเก็บน้ำ ${overrides.reservoirId}`,
    region: 'ภาคกลาง',
    reportDate: '2026-10-26',
    volumeMcm: 10,
    storagePercent: 50,
    capacityMcm: 20,
    volumeUnit: 'MCM',
    percentUnit: '%',
    qualityStatus: 'passed',
    method: null,
    reportedPercentStorage: null,
    sourceRowRef: null,
    ...overrides,
  };
}

function records(count: number): Record[] {
  return Array.from({ length: count }, (_, i) =>
    record({
      reservoirId: `RID-${String(i + 1).padStart(3, '0')}`,
      storagePercent: i,
    }),
  );
}

test('no filter keeps every row in the published order', () => {
  const rows = records(5);
  assert.deepEqual(
    table.filterWaterReservoirs(rows, {}).map((row: Record) => row.reservoirId),
    ['RID-001', 'RID-002', 'RID-003', 'RID-004', 'RID-005'],
  );
});

test('query matches a Thai name substring', () => {
  const rows = [
    record({ reservoirId: 'A', name: 'อ่างเก็บน้ำลำปาว' }),
    record({ reservoirId: 'B', name: 'อ่างเก็บน้ำห้วยหลวง' }),
    record({ reservoirId: 'C', name: null }),
  ];
  assert.deepEqual(
    table.filterWaterReservoirs(rows, { query: 'ลำปาว' }).map((row: Record) => row.reservoirId),
    ['A'],
  );
});

test('query matches the reservoir id case-insensitively', () => {
  const rows = records(3);
  assert.deepEqual(
    table.filterWaterReservoirs(rows, { query: 'rid-002' }).map((row: Record) => row.reservoirId),
    ['RID-002'],
  );
});

test('query is trimmed and a blank query keeps everything', () => {
  const rows = records(3);
  assert.equal(table.filterWaterReservoirs(rows, { query: '   ' }).length, 3);
  assert.deepEqual(
    table.filterWaterReservoirs(rows, { query: '  RID-003 ' }).map((row: Record) => row.reservoirId),
    ['RID-003'],
  );
});

test('region filter is an exact match and an unknown region yields nothing', () => {
  const rows = [
    record({ reservoirId: 'A', region: 'ภาคกลาง' }),
    record({ reservoirId: 'B', region: 'ภาคเหนือ' }),
    record({ reservoirId: 'C', region: null }),
  ];
  assert.deepEqual(
    table.filterWaterReservoirs(rows, { region: 'ภาคเหนือ' }).map((row: Record) => row.reservoirId),
    ['B'],
  );
  assert.deepEqual(table.filterWaterReservoirs(rows, { region: 'ภาคใต้' }), []);
});

test('query and region combine', () => {
  const rows = [
    record({ reservoirId: 'A', name: 'อ่างเก็บน้ำลำปาว', region: 'ภาคตะวันออกเฉียงเหนือ' }),
    record({ reservoirId: 'B', name: 'อ่างเก็บน้ำลำปาว', region: 'ภาคกลาง' }),
  ];
  assert.deepEqual(
    table.filterWaterReservoirs(rows, { query: 'ลำปาว', region: 'ภาคกลาง' }).map((row: Record) => row.reservoirId),
    ['B'],
  );
});

test('regions are unique, exclude null and sorted in Thai order', () => {
  const rows = [
    record({ reservoirId: 'A', region: 'ภาคเหนือ' }),
    record({ reservoirId: 'B', region: 'ภาคกลาง' }),
    record({ reservoirId: 'C', region: 'ภาคเหนือ' }),
    record({ reservoirId: 'D', region: null }),
  ];
  assert.deepEqual(table.waterRegions(rows), ['ภาคกลาง', 'ภาคเหนือ']);
});

test('pagination returns 25 rows per page and the last partial page', () => {
  const rows = records(61);
  const first = table.paginateWaterReservoirs(rows, 1, 25);
  assert.equal(first.rows.length, 25);
  assert.equal(first.pageCount, 3);
  assert.equal(first.total, 61);
  assert.equal(first.rows[0].reservoirId, 'RID-001');

  const last = table.paginateWaterReservoirs(rows, 3, 25);
  assert.equal(last.rows.length, 11);
  assert.equal(last.rows[0].reservoirId, 'RID-051');
});

test('a page past the end clamps to the last page, never an empty view', () => {
  const rows = records(61);
  const clamped = table.paginateWaterReservoirs(rows, 99, 25);
  assert.equal(clamped.page, 3);
  assert.equal(clamped.rows.length, 11);
});

test('page below 1 clamps to the first page', () => {
  const clamped = table.paginateWaterReservoirs(records(30), 0, 25);
  assert.equal(clamped.page, 1);
  assert.equal(clamped.rows[0].reservoirId, 'RID-001');
});

test('an empty set reports one page and no rows', () => {
  const empty = table.paginateWaterReservoirs([], 1, 25);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.page, 1);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.total, 0);
});
