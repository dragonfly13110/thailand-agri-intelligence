/**
 * GISTDA flood province-label contract.
 *
 * The 7-day feed can carry the same `dopa_province_code` with different
 * `province_name_en` values (and the same name under different codes). Grouping
 * the polygons by code is still correct, but publishing the first row's name
 * silently mislabels the province. These tests pin the no-guess rule: a name
 * is published only when it is unambiguous for its code in the payload.
 * Runs fully in-memory; no live GISTDA call.
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
    if (url.endsWith('.json') && !url.includes('/node_modules/')) {
      const source = readFileSync(new URL(url), 'utf8');
      return {
        format: 'module',
        source: `export default ${source};`,
        shortCircuit: true,
      };
    }
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

const satellite = await import('../lib/hub/satellite-data.ts');
const provinceRegistry = await import('../lib/provinces.ts');

type Polygon = import('../lib/hub/satellite-data.ts').GistdaFloodPolygonLite;

const OPTIONS = {
  sourceMode: 'snapshot' as const,
  retrievedAt: '2026-10-31T00:00:00+00:00',
  snapshotRetrievedAt: '2026-10-31T00:00:00+00:00',
};

function polygon(overrides: Partial<Polygon> & { provinceCode: string }): Polygon {
  return {
    provinceNameTh: '',
    provinceNameEn: '',
    tambonCode: '',
    floodAreaSqm: 1600,
    riceAreaSqm: null,
    sceneIds: ['S1D_20261021_0600'],
    ...overrides,
  };
}

test('same code with conflicting English names publishes no name but keeps the area', () => {
  const payload = satellite.buildFloodObservation(
    [
      polygon({ provinceCode: '41', provinceNameEn: 'Changwat Udon Thani', tambonCode: '4101' }),
      polygon({ provinceCode: '41', provinceNameEn: 'Changwat Sakon Nakhon', tambonCode: '4102' }),
    ],
    OPTIONS,
  );

  assert.equal(payload.provinces.length, 1);
  assert.equal(payload.provinces[0].provinceNameEn, null);
  assert.equal(payload.provinces[0].floodedAreaRai, 2);
  assert.equal(payload.provinces[0].polygonCount, 2);
});

test('same code with conflicting Thai names publishes no Thai name', () => {
  const payload = satellite.buildFloodObservation(
    [
      polygon({ provinceCode: '41', provinceNameTh: 'อุดรธานี', provinceNameEn: 'Changwat Udon Thani' }),
      polygon({ provinceCode: '41', provinceNameTh: 'สกลนคร', provinceNameEn: 'Changwat Udon Thani' }),
    ],
    OPTIONS,
  );

  assert.equal(payload.provinces[0].provinceNameTh, null);
  assert.equal(payload.provinces[0].provinceNameEn, 'Changwat Udon Thani');
});

test('one name mapped to two codes is ambiguous for both', () => {
  const payload = satellite.buildFloodObservation(
    [
      polygon({ provinceCode: '41', provinceNameEn: 'Changwat Udon Thani', tambonCode: '4101' }),
      polygon({ provinceCode: '47', provinceNameEn: 'Changwat Udon Thani', tambonCode: '4701' }),
    ],
    OPTIONS,
  );

  assert.equal(payload.provinces.length, 2);
  for (const province of payload.provinces) assert.equal(province.provinceNameEn, null);
  assert.deepEqual(
    payload.provinces.map((province) => [province.provinceCode, province.floodedAreaRai]),
    [['41', 1], ['47', 1]],
  );
});

test('a name agreed by every polygon of one code is published unchanged', () => {
  const payload = satellite.buildFloodObservation(
    [
      polygon({ provinceCode: '41', provinceNameTh: 'อุดรธานี', provinceNameEn: 'Changwat Udon Thani', tambonCode: '4101' }),
      polygon({ provinceCode: '41', provinceNameTh: 'อุดรธานี', provinceNameEn: 'Changwat Udon Thani', tambonCode: '4102' }),
    ],
    OPTIONS,
  );

  assert.equal(payload.provinces[0].provinceNameTh, 'อุดรธานี');
  assert.equal(payload.provinces[0].provinceNameEn, 'Changwat Udon Thani');
});

test('a verified registry name replaces a conflicting source name', () => {
  const payload = satellite.buildFloodObservation(
    [
      polygon({ provinceCode: '41', provinceNameEn: 'Changwat Udon Thani' }),
      polygon({ provinceCode: '41', provinceNameEn: 'Changwat Sakon Nakhon' }),
    ],
    { ...OPTIONS, provinceNames: new Map([['41', 'อุดรธานี']]) },
  );

  assert.equal(payload.provinces[0].provinceNameTh, 'อุดรธานี');
  assert.equal(payload.provinces[0].provinceNameEn, null);
});

test('a code absent from the registry keeps its Thai name unknown', () => {
  const payload = satellite.buildFloodObservation(
    [polygon({ provinceCode: '41', provinceNameTh: 'อุดรธานี' })],
    { ...OPTIONS, provinceNames: new Map([['47', 'สกลนคร']]) },
  );

  assert.equal(payload.provinces[0].provinceNameTh, null);
});

test('the embedded province registry covers all 77 codes with verified names', () => {
  const names = provinceRegistry.getEmbeddedProvinceNames();

  assert.equal(names.size, 77);
  assert.equal(names.get('41'), 'อุดรธานี');
  assert.equal(names.get('47'), 'สกลนคร');
});
