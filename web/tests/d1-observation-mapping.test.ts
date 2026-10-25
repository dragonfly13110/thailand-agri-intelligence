import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapD1Observation } from '../lib/hub/d1-observation-mapping.ts';

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
