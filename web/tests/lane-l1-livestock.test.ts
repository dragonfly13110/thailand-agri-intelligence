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
        shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const livestock = await import('../lib/hub/livestock-data.ts');
const dldLivestock = await import('../lib/hub/dld-livestock.ts');
const route = await import('../app/api/v1/livestock/route.ts');
const origin = 'http://hub.local';

/* ------------------------------------------------------------------ */
/* Fake D1 store                                                       */
/* getD1() caches its handle process-wide, so scenarios must swap the   */
/* fixture contents, never the database object itself.                  */
/* ------------------------------------------------------------------ */

type FixtureRow = Record<string, unknown>;

const store: { rowsByResource: Record<string, FixtureRow[]>; throwResources: string[] } = {
  rowsByResource: {},
  throwResources: [],
};

const database = {
  prepare(sql: string) {
    let bound: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { bound = values; return statement; },
      async all() {
        const resourceId = String(bound[1]);
        if (sql.includes('SELECT o.resource_id AS resourceId')) {
          if (store.throwResources.includes(resourceId)) throw new Error('simulated D1 read error');
          const limit = Number(bound.at(-2));
          const offset = Number(bound.at(-1));
          const rows = store.rowsByResource[resourceId] ?? [];
          return { results: rows.slice(offset, offset + limit) };
        }
        if (sql.startsWith('SELECT count(*) AS total')) {
          if (store.throwResources.includes(resourceId)) throw new Error('simulated D1 read error');
          return { results: [{ total: (store.rowsByResource[resourceId] ?? []).length }] };
        }
        throw new Error('Unexpected D1 query: ' + sql);
      },
    };
    return statement;
  },
};
(globalThis as unknown as { env?: { DB: unknown } }).env = { DB: database };

type RowOptions = {
  year?: number;
  code?: string;
  name?: string;
  region?: string | null;
  value?: number | null;
  unit?: string | null;
  runId?: string;
  payloadSha256?: string;
  sourceRetrievedAt?: string;
  adapterVersion?: string;
  revisionId?: string | null;
};

function obs(speciesId: keyof typeof dldLivestock.DLD_LIVESTOCK_PROVINCE_RESOURCES, options: RowOptions = {}): FixtureRow {
  const resource = dldLivestock.DLD_LIVESTOCK_PROVINCE_RESOURCES[speciesId];
  const {
    year = 2568, code = '10', name = 'กรุงเทพมหานคร', region = 'ภาคกลาง', value = 100,
    unit = 'ตัว', runId = 'run-1', payloadSha256 = 'payload-sha-1',
    sourceRetrievedAt = '2026-10-30T02:00:00Z', adapterVersion = 'dld-livestock/1.0.0',
    revisionId = 'dld-rev-1',
  } = options;
  return {
    resourceId: resource.resourceId,
    runId,
    runStatus: 'succeeded',
    rowKey: `${speciesId}:${year}:${code}`,
    seriesKey: `${resource.metricId}:source_year_label:province:${unit ?? ''}`,
    sourceId: 'dld',
    datasetId: resource.datasetId,
    adapterVersion,
    payloadSha256,
    sourceRetrievedAt,
    runCompletedAt: '2026-10-30T02:05:00Z',
    observedAt: null,
    periodStart: null,
    periodEnd: null,
    periodLabel: `พ.ศ. ${year}`,
    locationId: `dld:province:${code}`,
    locationCode: code,
    locationKind: 'province',
    locationName: name,
    provinceCode: code,
    cropCode: null,
    cropName: null,
    metricId: resource.metricId,
    metricName: resource.speciesLabel,
    product: resource.speciesLabel + ' รายจังหวัด กรมปศุสัตว์',
    grade: null,
    market: null,
    unit,
    value,
    dimensions: { sourceYearBe: year, regionSource: region, referenceYearConvention: 'unverified' },
    qualityStatus: value === null ? 'missing' : 'good',
    quality: { revisionId },
    sourceRowRef: `native-${code}-${year}`,
  };
}

function setRows(speciesId: keyof typeof dldLivestock.DLD_LIVESTOCK_PROVINCE_RESOURCES, rows: FixtureRow[]) {
  store.rowsByResource[dldLivestock.DLD_LIVESTOCK_PROVINCE_RESOURCES[speciesId].resourceId] = rows;
}

function resetStore() {
  store.rowsByResource = {};
  store.throwResources = [];
}

function speciesEntry(payload: Awaited<ReturnType<typeof livestock.buildLivestockDashboard>>, speciesId: string) {
  for (const sector of payload.sectors) {
    const found = sector.species.find((entry) => entry.def.id === speciesId);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Tests                                                                */
/* ------------------------------------------------------------------ */

test('empty store yields honest empty states, never sample numbers for DLD', async () => {
  resetStore();
  const payload = await livestock.buildLivestockDashboard();

  for (const speciesId of ['cattle', 'dairy', 'swine', 'poultry', 'duck']) {
    const entry = speciesEntry(payload, speciesId);
    assert.ok(entry, 'species entry exists');
    assert.equal(entry.summary.readState, 'empty');
    assert.equal(entry.summary.sample, false);
    assert.equal(entry.summary.total, null);
    assert.equal(entry.summary.unit, null);
    assert.equal(entry.summary.yearBe, null);
    assert.equal(entry.summary.regions.length, 0);
    assert.equal(entry.summary.topProvinces.length, 0);
    const note = entry.summary.note;
    assert.ok(note !== null && note.includes('ยังไม่มีแถวตัวเลข'));
  }

  const tilapia = speciesEntry(payload, 'tilapia');
  assert.ok(tilapia);
  assert.equal(tilapia.summary.readState, 'sample');
  assert.equal(tilapia.summary.sample, true);
  assert.ok((tilapia.summary.total ?? 0) > 0);

  // payload-level sample stays true while the aquaculture side is demo data
  assert.equal(payload.sample, true);
  assert.ok(payload.warnings.some((w: string) => w.includes('ยังไม่มีตัวเลขในคลัง')));
});

test('unreachable store yields unavailable states for DLD species', async () => {
  resetStore();
  store.throwResources = Object.values(dldLivestock.DLD_LIVESTOCK_PROVINCE_RESOURCES).map((r) => r.resourceId);
  const payload = await livestock.buildLivestockDashboard();

  for (const speciesId of ['cattle', 'dairy', 'swine', 'poultry', 'duck']) {
    const entry = speciesEntry(payload, speciesId);
    assert.ok(entry);
    assert.equal(entry.summary.readState, 'unavailable');
    assert.equal(entry.summary.sample, false);
    assert.equal(entry.summary.total, null);
    assert.equal(entry.summary.provenance, null);
  }
});

test('real observations aggregate by source year and region with null preservation', async () => {
  resetStore();
  setRows('cattle', [
    obs('cattle', { year: 2567, code: '50', region: 'ภาคเหนือ', value: 1 }),
    obs('cattle', { year: 2568, code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ', value: 100 }),
    obs('cattle', { year: 2568, code: '51', name: 'ลำพูน', region: 'ภาคเหนือ', value: 50 }),
    obs('cattle', { year: 2568, code: '10', region: 'ภาคกลาง', value: 10 }),
    obs('cattle', { year: 2568, code: '14', name: 'พระนครศรีอยุธยา', region: 'ภาคกลาง', value: null }),
    obs('cattle', { year: 2568, code: '40', name: 'ขอนแก่น', region: 'ภาคตะวันออกเฉียงเหนือ', value: 7 }),
    obs('cattle', { year: 2568, code: '90', name: 'สงขลา', region: 'ภาคใต้', value: 3 }),
  ]);
  const payload = await livestock.buildLivestockDashboard();
  const cattle = speciesEntry(payload, 'cattle');
  assert.ok(cattle);
  const summary = cattle.summary;

  assert.equal(summary.readState, 'real');
  assert.equal(summary.sample, false);
  assert.equal(summary.yearBe, 2568);
  assert.deepEqual(summary.availableYearsBe, [2567, 2568]);
  assert.equal(summary.unit, 'ตัว');
  assert.equal(summary.provinceCount, 6);

  const byRegion = Object.fromEntries(
    summary.regions.map((r: { regionId: string; value: number | null }) => [r.regionId, r]),
  );
  assert.equal(byRegion['dld-north'].value, 150);
  assert.equal(byRegion['dld-central'].value, null); // a null province row blocks the region total
  assert.equal(summary.total, null); // and therefore the national total
  assert.ok(summary.note !== null && summary.note.includes('ไม่ระบุจำนวน'));

  assert.deepEqual(summary.topProvinces.map((p: { province: string }) => p.province), ['เชียงใหม่', 'ลำพูน', 'กรุงเทพมหานคร', 'ขอนแก่น', 'สงขลา']);
  assert.deepEqual(
    summary.topProvinces.map((p: { value: number | null }) => p.value),
    [100, 50, 10, 7, 3],
  );

  assert.ok(summary.provenance);
  assert.equal(summary.provenance.runId, 'run-1');
  assert.equal(summary.provenance.rowCount, 7);
  assert.equal(summary.provenance.revisionId, 'dld-rev-1');
  assert.equal(summary.provenance.payloadSha256, 'payload-sha-1');
});

test('complete year aggregates totals and shares without inventing values', async () => {
  resetStore();
  setRows('cattle', [
    obs('cattle', { year: 2568, code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ', value: 100 }),
    obs('cattle', { year: 2568, code: '10', region: 'ภาคกลาง', value: 40 }),
    obs('cattle', { year: 2568, code: '40', name: 'ขอนแก่น', region: 'ภาคตะวันออกเฉียงเหนือ', value: 20 }),
    obs('cattle', { year: 2568, code: '90', name: 'สงขลา', region: 'ภาคใต้', value: 40 }),
  ]);
  const payload = await livestock.buildLivestockDashboard();
  const summary = speciesEntry(payload, 'cattle')!.summary;
  assert.equal(summary.readState, 'real');
  assert.equal(summary.total, 200);
  assert.equal(summary.note, null);
  const shares = Object.fromEntries(summary.regions.map((r: { regionId: string; sharePct: number | null }) => [r.regionId, r.sharePct]));
  assert.equal(shares['dld-north'], 50);
  assert.equal(shares['dld-central'], 20);
  assert.equal(shares['dld-south'], 20);
});

test('mixed units make the unit unknown while values stay separate', async () => {
  resetStore();
  setRows('cattle', [
    obs('cattle', { code: '10', region: 'ภาคกลาง', value: 10, unit: 'ตัว' }),
    obs('cattle', { code: '11', name: 'สมุทรปราการ', region: 'ภาคกลาง', value: 5, unit: 'ตัว/ตัว' }),
  ]);
  const payload = await livestock.buildLivestockDashboard();
  const summary = speciesEntry(payload, 'cattle')!.summary;
  assert.equal(summary.readState, 'real');
  assert.equal(summary.unit, null);
  assert.ok(summary.note !== null && summary.note.includes('หน่วย'));
});

test('mixed revisions within one species fail closed as unavailable', async () => {
  resetStore();
  setRows('dairy', [
    obs('dairy', { code: '10', revisionId: 'rev-a' }),
    obs('dairy', { code: '11', name: 'สมุทรปราการ', revisionId: 'rev-b' }),
  ]);
  const payload = await livestock.buildLivestockDashboard();
  const summary = speciesEntry(payload, 'dairy')!.summary;
  assert.equal(summary.readState, 'unavailable');
  assert.equal(summary.total, null);
  assert.equal(summary.sample, false);
});

test('rows violating the source-year contract fail closed as unavailable', async () => {
  resetStore();
  setRows('poultry', [obs('poultry', { year: 2568, code: '10' }), obs('poultry', { year: 100, code: '11' })]);
  const payload = await livestock.buildLivestockDashboard();
  const summary = speciesEntry(payload, 'poultry')!.summary;
  assert.equal(summary.readState, 'unavailable');
  assert.equal(summary.total, null);
});

test('legacy livestock API serves real DLD states with database runtime mode', async () => {
  resetStore();
  setRows('cattle', [
    obs('cattle', { code: '10', value: 100 }),
    obs('cattle', { code: '11', name: 'สมุทรปราการ', value: 50 }),
    obs('cattle', { code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ', value: 20 }),
    obs('cattle', { code: '40', name: 'ขอนแก่น', region: 'ภาคตะวันออกเฉียงเหนือ', value: 10 }),
    obs('cattle', { code: '90', name: 'สงขลา', region: 'ภาคใต้', value: 20 }),
  ]);

  const response = await route.GET(new Request(new URL('/api/v1/livestock', origin)));
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json() as {
    data: { sectors: Array<{ species: Array<{ def: { id: string }; summary: { readState: string; sample: boolean; total: number | null } }> }>; warnings: string[] };
    meta: { access: string; availability: string; runtimeMode: string; datasetVersion: string };
  };
  assert.equal(body.meta.access, 'metadata_only');
  assert.equal(body.meta.availability, 'ready');
  assert.equal(body.meta.runtimeMode, 'database');

  const cattle = body.data.sectors[0].species.find((s) => s.def.id === 'cattle')!;
  assert.equal(cattle.summary.readState, 'real');
  assert.equal(cattle.summary.sample, false);
  assert.equal(cattle.summary.total, 200);

  const duck = body.data.sectors[0].species.find((s) => s.def.id === 'duck')!;
  assert.equal(duck.summary.readState, 'empty');
  assert.equal(duck.summary.total, null);

  // empty store must surface as availability empty, not fabricated numbers
  resetStore();
  const emptyResponse = await route.GET(new Request(new URL('/api/v1/livestock', origin)));
  const emptyBody = await emptyResponse.json() as { meta: { availability: string } };
  assert.equal(emptyBody.meta.availability, 'empty');

  const invalid = await route.GET(new Request(new URL('/api/v1/livestock?species=unicorns', origin)));
  assert.equal(invalid.status, 400);
});

test('species filter keeps sector/species mismatch an explicit error', async () => {
  resetStore();
  const mismatch = await route.GET(new Request(new URL('/api/v1/livestock?sector=aquaculture&species=cattle', origin)));
  assert.equal(mismatch.status, 400);
  const ok = await route.GET(new Request(new URL('/api/v1/livestock?sector=livestock&species=cattle', origin)));
  assert.equal(ok.status, 200);
  const body = await ok.json() as { data: { sectors: Array<{ species: unknown[] }> } };
  assert.equal(body.data.sectors.length, 1);
  assert.equal(body.data.sectors[0].species.length, 1);
});
