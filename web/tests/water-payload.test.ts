/**
 * RID water payload contract tests (Real Data R1-C).
 *
 * `buildWaterPayload` is the only place that turns published D1 observation
 * rows into the public reservoir shape, so these tests pin the data-quality
 * rules that used to be enforced by hiding the numbers entirely:
 * one report date per payload, nulls that stay null (never 0), no capacity
 * invention, and no province rollup. Runs fully in-memory; no D1 request.
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

const water = await import('../lib/hub/water-data.ts');

type Row = import('../lib/hub/water-data.ts').WaterObservationInput;

function row(overrides: Partial<Row> & { locationId: string }): Row {
  return {
    metricId: water.RID_METRIC_VOLUME,
    locationName: 'อ่างเก็บน้ำ ' + overrides.locationId,
    value: 10,
    unit: 'MCM',
    periodEnd: '2026-10-25',
    qualityStatus: 'passed',
    sourceRowRef: null,
    ...overrides,
  };
}

function percentRow(locationId: string, value: number | null, extra: Record<string, unknown> = {}): Row {
  return row({
    locationId,
    metricId: water.RID_METRIC_PERCENT,
    value,
    unit: 'percent',
    dimensions: { region: 'ภาคเหนือ', method: '100*volume/storage', reportedPercentStorage: value, ...extra },
  });
}

test('the metadata payload carries no numeric keys and no summary', () => {
  const payload = water.buildWaterMetadataPayload();
  assert.deepEqual(payload.reservoirs, []);
  assert.equal(payload.summary, null);
  assert.equal(payload.source.licenseStatus, 'approved_public');
  assert.equal(payload.source.publicationApproved, true);
  const serialized = JSON.stringify(payload);
  for (const sentinel of ['461', 'rsv01', 'ห้วยแม่ออน', '100.18']) {
    assert.equal(serialized.includes(sentinel), false, `metadata payload leaked ${sentinel}`);
  }
});

test('rows from two metrics pivot into one record per reservoir on a single report date', () => {
  const payload = water.buildWaterPayload([
    row({ locationId: 'rsvA' }),
    percentRow('rsvA', 40),
    row({ locationId: 'rsvB', value: 25 }),
    percentRow('rsvB', 62.5),
  ]);
  assert.ok(payload);
  assert.equal(payload.summary?.reportDate, '2026-10-25');
  assert.equal(payload.reservoirs.length, 2);
  const b = payload.reservoirs.find((item) => item.reservoirId === 'rsvB');
  assert.equal(b?.volumeMcm, 25);
  assert.equal(b?.storagePercent, 62.5);
  assert.equal(b?.volumeUnit, 'MCM');
  assert.equal(b?.percentUnit, 'percent');
  assert.equal(b?.region, 'ภาคเหนือ');
  assert.equal(b?.method, '100*volume/storage');
  assert.equal(b?.capacityMcm, null, 'capacity is not in the numeric layer and must not be invented');
});

test('mixing report dates never produces a cross-period total', () => {
  const payload = water.buildWaterPayload([
    row({ locationId: 'rsvA', value: 10 }),
    percentRow('rsvA', 50),
    row({ locationId: 'rsvB', value: 90, periodEnd: '2026-10-24' }),
  ]);
  assert.ok(payload);
  assert.equal(payload.summary?.reportDate, '2026-10-25', 'the newest published date wins');
  assert.deepEqual(
    payload.reservoirs.map((item) => item.reservoirId),
    ['rsvA'],
    'older-date rows must not be folded into the current snapshot',
  );
  assert.equal(payload.summary?.totalVolumeMcm, 10);
});

test('missing values stay null and are counted, never summed as zero', () => {
  const payload = water.buildWaterPayload([
    row({ locationId: 'rsvA', value: 20 }),
    percentRow('rsvA', null),
    row({ locationId: 'rsvB', value: null }),
    percentRow('rsvB', 101.65),
  ]);
  assert.ok(payload);
  assert.equal(payload.summary?.reservoirCount, 2);
  assert.equal(payload.summary?.missingVolumeCount, 1);
  assert.equal(payload.summary?.missingPercentCount, 1);
  assert.equal(payload.summary?.totalVolumeMcm, 20, 'null volume must not contribute to the sum');
  assert.equal(payload.summary?.maxStoragePercent, 101.65);
  assert.equal(payload.summary?.aboveDesignCount, 1, 'above-design storage is a real state, not an error');
  assert.equal(payload.reservoirs.find((item) => item.reservoirId === 'rsvB')?.volumeMcm, null);
});

test('no publishable numeric row yields null instead of an empty zeroed summary', () => {
  assert.equal(water.buildWaterPayload([]), null);
  assert.equal(water.buildWaterPayload([row({ locationId: 'rsvA', periodEnd: null })]), null);
  assert.equal(water.buildWaterPayload([row({ locationId: 'rsvA', metricId: 'unknown_metric' })]), null);
});

test('unknown volume units are flagged instead of inherited from the sample', () => {
  const payload = water.buildWaterPayload([
    row({ locationId: 'rsvA', unit: null }),
    percentRow('rsvA', 30),
  ]);
  assert.ok(payload);
  assert.equal(payload.summary?.unitStatus, 'pending_official_confirmation');
  assert.equal(payload.reservoirs[0].volumeUnit, null);
});

test('the repository layer keeps the public filters that gate the numbers', () => {
  const source = readFileSync(new URL('../lib/hub/water-repository.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('server-only'), true, 'water repository must be server-only');
  assert.equal(
    source.includes('listD1Observations'),
    true,
    'water repository must read through the governed numeric repository',
  );
  assert.equal(source.includes('fetch('), false, 'water repository must not fetch upstream');
  const route = readFileSync(new URL('../app/api/v1/water/reservoirs/route.ts', import.meta.url), 'utf8');
  assert.equal(route.includes('readWaterSnapshot'), true, 'route must serve the D1 snapshot');
  assert.equal(
    route.includes("access: 'approved_public'"),
    true,
    'route must report approved_public once a batch is readable',
  );
});
