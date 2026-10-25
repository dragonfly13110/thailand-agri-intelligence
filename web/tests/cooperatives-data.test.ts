/**
 * Cooperatives module contract tests (lane 1D QA).
 *
 * Pins the shared contract of the deterministic sample engine
 * (lib/hub/cooperatives-data.ts) and its API surface
 * (app/api/v1/cooperatives/route.ts): byte-level determinism under filters,
 * rollup/summary additivity invariants, CAMELS composite/class recomputation,
 * metadata-only governance flags, valid-filter-empty = 200 'empty' vs invalid
 * = 400 INVALID_QUERY, and the absence of clock/entropy in the value path.
 *
 * The runner uses `node --experimental-strip-types`, so the same
 * module-resolution/transpilation hooks as `governance-containment.test.ts`
 * are installed locally. No production file is modified and no request
 * leaves the process.
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
      // The app uses bundler-style extensionless imports; Node needs the suffix.
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

const coop = await import('../lib/hub/cooperatives-data.ts');
const coopRoute = await import('../app/api/v1/cooperatives/route.ts');

type CoopRow = ReturnType<typeof coop.buildCooperativesData>['cooperatives'][number];
type CoopSummary = ReturnType<typeof coop.buildCooperativesData>['summary'];
type CoopPayload = ReturnType<typeof coop.buildCooperativesData>;
type ApiMeta = {
  availability: string;
  completeness: string;
  access: string;
  datasetVersion: string | null;
  warnings: string[];
};
type SuccessBody = { data: CoopPayload; meta: ApiMeta };
type ErrorBody = { error: { code: string; message: string; requestId: string } };

const HUB_ORIGIN = 'http://hub.local';

async function call(path: string) {
  const response = await coopRoute.GET(new Request(HUB_ORIGIN + path));
  return { response, body: (await response.json()) as SuccessBody | ErrorBody };
}

function sum(rows: unknown[], key: string): number {
  let total = 0;
  for (const row of rows) total += (row as Record<string, number>)[key];
  return total;
}

test('buildCooperativesData is deterministic (byte-identical) per filter set', () => {
  const filters = [
    {},
    { provinceCode: '19' },
    { coopType: 'dairy' },
    { camelClass: 'tier1' },
    { region: 'ภาคใต้' },
    { q: 'สหกรณ์' },
  ];
  for (const f of filters) {
    const a = JSON.stringify(coop.buildCooperativesData(f as never));
    const b = JSON.stringify(coop.buildCooperativesData(f as never));
    assert.equal(a, b, `repeat build must be byte-identical for ${JSON.stringify(f)}`);
  }
});

test('summary field is totalCooperatives with no totalCoops compat alias', () => {
  const payload = coop.buildCooperativesData();
  assert.equal(payload.summary.totalCooperatives, payload.cooperatives.length);
  assert.equal('totalCoops' in payload.summary, false, 'totalCoops alias must not exist');
  assert.equal('totalCoops' in payload.filteredSummary, false, 'totalCoops alias must not exist');
});

test('rollup member sums equal filteredSummary.totalMembers for every view', () => {
  for (const f of [{}, { provinceCode: '19' }, { coopType: 'dairy' }, { camelClass: 'tier2' }]) {
    const p = coop.buildCooperativesData(f as never);
    const expected = p.filteredSummary.totalMembers;
    assert.equal(sum(p.byType, 'memberCount'), expected, `byType members for ${JSON.stringify(f)}`);
    assert.equal(sum(p.byClass, 'memberCount'), expected, `byClass members for ${JSON.stringify(f)}`);
    assert.equal(sum(p.byProvince, 'memberCount'), expected, `byProvince members for ${JSON.stringify(f)}`);
  }
});

test('business value is additive: national = sum of records = coll + credit + working', () => {
  const p = coop.buildCooperativesData({});
  const s: CoopSummary = p.filteredSummary;
  assert.equal(s.totalBusinessValueTHB, s.totalCollectionValueTHB + s.totalSupplyCreditValueTHB + s.totalWorkingCapitalTHB);
  assert.equal(s.totalBusinessValueTHB, sum(p.cooperatives, 'businessValueTHB'));
  for (const row of p.cooperatives as CoopRow[]) {
    assert.equal(
      row.businessValueTHB,
      row.collectionTotalValueTHB + row.supplyCreditValueTHB + row.workingCapitalTHB,
      `${row.id}: businessValueTHB must be the sum of its three components only`,
    );
    for (const line of row.collection) {
      if (line.volumeTons === null) {
        assert.equal(line.avgPricePerTonTHB, null, `${row.id}/${line.commodity}: missing must stay null as a set`);
        assert.equal(line.valueTHB, null, `${row.id}/${line.commodity}: missing must stay null as a set`);
        continue;
      }
      assert.equal(
        line.valueTHB,
        Math.round((line.volumeTons as number) * (line.avgPricePerTonTHB as number)),
        `${row.id}/${line.commodity}: valueTHB = round(volumeTons x avgPricePerTonTHB)`,
      );
    }
  }
});

test('tier counts sum to totalCooperatives and composite/class recompute from dimensions', () => {
  const p = coop.buildCooperativesData({});
  const s = p.filteredSummary;
  assert.equal(s.tier1Count + s.tier2Count + s.tier3Count, s.totalCooperatives);
  for (const row of p.cooperatives as CoopRow[]) {
    const scores = row.camel.dimensions.map((d) => d.score);
    assert.equal(scores.length, 6, `${row.id}: CAMELS must carry all six dimensions`);
    const composite = Math.round((scores.reduce((t, v) => t + v, 0) / 6) * 10) / 10;
    assert.equal(row.camel.composite, composite, `${row.id}: composite = mean of dimensions`);
    const expectedClass = composite >= 80 ? 'tier1' : composite >= 65 ? 'tier2' : 'tier3';
    assert.equal(row.camel.camelClass, expectedClass, `${row.id}: class derives from composite only`);
  }
});

test('province filter returns only that province and leaves national summary untouched', () => {
  const full = coop.buildCooperativesData({});
  const p19 = coop.buildCooperativesData({ provinceCode: '19' });
  assert.ok(p19.cooperatives.length > 0, 'province 19 must have sample rows');
  for (const row of p19.cooperatives as CoopRow[]) {
    assert.equal(row.provinceCode, '19', `${row.id}: filtered on wrong province`);
  }
  assert.equal(JSON.stringify(p19.summary), JSON.stringify(full.summary), 'summary is national, never filter-scoped');
});

test('GET /api/v1/cooperatives serves the governance envelope with no-store', async () => {
  const { response, body } = await call('/api/v1/cooperatives');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = (body as SuccessBody).data;
  const meta = (body as SuccessBody).meta;
  assert.equal(payload.sample, true);
  assert.equal(meta.access, 'metadata_only');
  assert.equal(meta.datasetVersion, 'coop-cad-v1');
  assert.equal(meta.completeness, 'partial');
  assert.equal(meta.availability, 'ready');
  assert.ok(meta.warnings.length > 0, 'warnings must explain the sample/licence hold');
  assert.equal(payload.summary.coverageClaim, false);
});

test('query aliases resolve: Thai coopType/camelClass and region with or without ภาค', async () => {
  const pairs = [
    ['coopType=dairy', 'coopType=' + encodeURIComponent('สหกรณ์ผู้เลี้ยงโคนม')],
    ['camelClass=tier1', 'camelClass=' + encodeURIComponent('ชั้น 1')],
    ['region=' + encodeURIComponent('ใต้'), 'region=' + encodeURIComponent('ภาคใต้')],
  ] as const;
  for (const [left, right] of pairs) {
    const a = await call('/api/v1/cooperatives?' + left);
    const b = await call('/api/v1/cooperatives?' + right);
    assert.equal(a.response.status, 200, left);
    assert.equal(b.response.status, 200, right);
    assert.equal(
      (a.body as SuccessBody).data.cooperatives.length,
      (b.body as SuccessBody).data.cooperatives.length,
      `${left} vs ${right}: row counts must match`,
    );
  }
});

test('valid-but-empty filter is 200 with availability empty, not 404', async () => {
  const { response, body } = await call('/api/v1/cooperatives?provinceCode=19&q=zzz-not-a-thing');
  assert.equal(response.status, 200);
  const payload = body as SuccessBody;
  assert.equal(payload.meta.availability, 'empty');
  assert.deepEqual(payload.data.cooperatives, []);
});

test('invalid parameters are 400 INVALID_QUERY with Thai message and requestId', async () => {
  const cases = [
    'provinceCode=99',
    'coopType=bogus',
    'camelClass=9',
    'region=' + encodeURIComponent(' bogus-region'),
    'q=' + 'x'.repeat(200),
  ];
  for (const qs of cases) {
    const { response, body } = await call('/api/v1/cooperatives?' + qs);
    assert.equal(response.status, 400, `expected 400 for ${qs}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const error = (body as ErrorBody).error;
    assert.equal(error.code, 'INVALID_QUERY', qs);
    assert.ok(typeof error.message === 'string' && error.message.length > 0, qs);
    assert.ok(/[ก-๙]/.test(error.message), `${qs}: message must be Thai`);
    assert.equal(error.requestId.length, 36, `${qs}: requestId must be a UUID`);
  }
});

test('value path contains no clock, entropy, network or env access', () => {
  const source = readFileSync(new URL('../lib/hub/cooperatives-data.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  for (const banned of ['Math.random', 'Date.now', 'new Date', 'fetch(', 'process.env']) {
    assert.equal(source.includes(banned), false, `forbidden token in value path: ${banned}`);
  }
});
