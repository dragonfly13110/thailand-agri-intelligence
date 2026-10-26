/**
 * Offline tests for the TMD HPC NWP read model (lane D).
 *
 * Nothing here touches the network or D1: the SQL runner is a fake that
 * serves in-memory rows, so every branch of the error matrix can be checked
 * deterministically.
 *
 * The runner uses `node --experimental-strip-types`, so the same
 * resolution/transpilation hooks as `nwp-contract.test.ts` are installed
 * locally. No production file is modified.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import type {
  NwpProvinceValueRow,
  NwpSnapshotRow,
  NwpSqlRunner,
} from '../lib/hub/nwp-data';

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

const nwpData = await import('../lib/hub/nwp-data.ts');
const nwpTypes = await import('../lib/hub/nwp-types.ts');
const nwpRisk = await import('../lib/hub/nwp-risk.ts');
const { HubDatabaseError } = await import('../lib/hub/db.ts');
const gridRoute = await import('../app/api/v1/nwp/grid/route.ts');
const provincesRoute = await import('../app/api/v1/nwp/provinces/route.ts');
const runsRoute = await import('../app/api/v1/nwp/runs/route.ts');

const HUB_ORIGIN = 'http://hub.local';
const RUN_ID = 'tmd_hpc_d02_2026102600';
const VALID_AT = '2026-10-27T00:00:00Z';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Work order §3.7 thresholds; internal TADIH aids, not official TMD warnings. */
const THRESHOLDS = nwpRisk.validateThresholds({
  version: 1,
  source: 'TADIH internal thresholds; not official TMD warnings',
  variables: {
    p24h: { unit: 'mm', watch: 20, high: 50, severe: 90 },
    p1h: { unit: 'mm', watch: 10, high: 20, severe: 30 },
    t2m: { unit: 'degC', watch: 35, high: 38, severe: 40 },
    rhum: { unit: '%', watch: 85, high: 90, severe: 95 },
    ws10m: { unit: 'm/s', watch: 6, high: 10, severe: 15 },
  },
});

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    sourceId: 'tmd_hpc_nwp',
    domain: 'd02',
    initAt: '2026-10-26T00:00:00Z',
    retrievedAt: '2026-10-26T08:30:00Z',
    licenseStatus: 'pending',
    unitStatus: 'pending_official_confirmation',
    publicationMode: 'numeric_preview',
    variablesJson: JSON.stringify(['p1h', 'p24h', 't2m', 'rhum', 'ws10m']),
    leadHoursJson: JSON.stringify([0, 6, 12, 24, 48, 72]),
    gridJson: JSON.stringify({ bbox: [96, 5, 106, 21], nx: 67, ny: 107, cell_deg: 0.15 }),
    status: 'ready',
    createdAt: '2026-10-26T08:31:00Z',
    ...overrides,
  };
}

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    variable: 'p24h',
    validAt: VALID_AT,
    unit: null,
    bboxJson: JSON.stringify([96, 5, 106, 21]),
    nx: 2,
    ny: 2,
    meanJson: JSON.stringify([1.5, null, 3, null]),
    maxJson: JSON.stringify([2.5, null, 6, null]),
    qualityJson: JSON.stringify({ provinceCellCounts: { '73': 18, '10': 4 } }),
    ...overrides,
  };
}

type FakeState = {
  runs?: Record<string, unknown>[];
  run?: Record<string, unknown> | null;
  snapshots?: Record<string, unknown>[];
  snapshot?: Record<string, unknown> | null;
  provinces?: Record<string, unknown>[];
  cellCountColumn?: boolean;
};

function fakeRunner(state: FakeState) {
  return async (sql: string, params: unknown[]): Promise<Record<string, unknown>[]> => {
    if (sql.includes('PRAGMA')) {
      return state.cellCountColumn ? [{ name: 'cell_count' }] : [{ name: 'province_code' }];
    }
    if (sql.includes('FROM nwp_runs')) {
      if (sql.includes('ORDER BY init_at')) return state.runs ?? [];
      const run = state.run;
      if (!run || run.runId !== params[0]) return [];
      return [run];
    }
    if (sql.includes('FROM nwp_snapshots')) {
      if (sql.includes('mean_json') || sql.includes('quality_json')) {
        const snapshot = state.snapshot;
        if (!snapshot) return [];
        if (snapshot.runId !== params[0] || snapshot.variable !== params[1]) return [];
        return [snapshot];
      }
      // Lead-time derivation: one row per stored snapshot.
      return state.snapshots ?? [];
    }
    if (sql.includes('FROM nwp_province_values')) {
      const rows = state.provinces ?? [];
      return rows.filter((row) => row.runId === params[0] && row.variable === params[1]);
    }
    return [];
  };
}

async function call(
  handler: (request: Request) => Response | Promise<Response>,
  path: string,
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const response = await handler(new Request(HUB_ORIGIN + path));
  const body = (await response.json()) as Record<string, unknown>;
  return { response, body };
}

function errorCode(body: Record<string, unknown>): string {
  return String((body.error as { code?: string } | undefined)?.code ?? '');
}

function withRunner<T>(runner: NwpSqlRunner | null, body: () => Promise<T> | T): Promise<T> {
  nwpData.setNwpRunnerForTests(runner);
  return Promise.resolve().then(body).finally(() => {
    nwpData.setNwpRunnerForTests(null);
  });
}

/* ------------------------------------------------------------------ */
/* Query validation                                                    */
/* ------------------------------------------------------------------ */

test('nwp data: a missing or malformed query parameter is a 400 INVALID_QUERY', () => {
  const invalid: Array<{ runId: string | null; variable: string | null; validAt: string | null }> = [
    { runId: null, variable: 'p24h', validAt: VALID_AT },
    { runId: '   ', variable: 'p24h', validAt: VALID_AT },
    { runId: 'short', variable: 'p24h', validAt: VALID_AT },
    { runId: 'TMD_HPC_D02_2026102600', variable: 'p24h', validAt: VALID_AT },
    { runId: 'tmd-hpc-d02-2026102600', variable: 'p24h', validAt: VALID_AT },
    { runId: 'a'.repeat(81), variable: 'p24h', validAt: VALID_AT },
    { runId: RUN_ID, variable: null, validAt: VALID_AT },
    { runId: RUN_ID, variable: 'dws', validAt: VALID_AT },
    { runId: RUN_ID, variable: 'P24H', validAt: VALID_AT },
    { runId: RUN_ID, variable: 'p24h', validAt: null },
    { runId: RUN_ID, variable: 'p24h', validAt: '2026-10-27' },
    { runId: RUN_ID, variable: 'p24h', validAt: 'not-a-date' },
    { runId: RUN_ID, variable: 'p24h', validAt: '2026-02-30T00:00:00Z' },
    { runId: RUN_ID, variable: 'p24h', validAt: '2026-10-27T00:00:00+07:00' },
  ];

  for (const params of invalid) {
    assert.throws(
      () => nwpData.validateGridQuery(params),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { status?: number }).status, 400, JSON.stringify(params));
        assert.equal((error as { code?: string }).code, 'INVALID_QUERY', JSON.stringify(params));
        return true;
      },
      JSON.stringify(params),
    );
  }
});

test('nwp data: the allowlist accepts exactly the five published variables', () => {
  for (const variable of nwpTypes.NWP_VARIABLES) {
    const query = nwpData.validateGridQuery({ runId: RUN_ID, variable, validAt: VALID_AT });
    assert.equal(query.variable, variable);
  }
  assert.deepEqual([...nwpTypes.NWP_VARIABLES], ['p1h', 'p24h', 't2m', 'rhum', 'ws10m']);
});

test('nwp data: a valid query is normalised to a UTC instant', () => {
  const query = nwpData.validateGridQuery({
    runId: RUN_ID,
    variable: 'p24h',
    validAt: '2026-10-27T00:00:00.000Z',
  });
  assert.deepEqual(query, { runId: RUN_ID, variable: 'p24h', validAt: VALID_AT });
  assert.equal(nwpData.validAtKey(query.validAt), '2026-10-27 00:00:00');
});

test('nwp data: an unknown query parameter is rejected', () => {
  assert.throws(
    () => nwpData.assertKnownParams(new URL('http://hub.local/x?runId=a&bogus=1'), ['runId']),
    (error: unknown) => (error as { code?: string }).code === 'INVALID_QUERY',
  );
  nwpData.assertKnownParams(new URL('http://hub.local/x?runId=a&variable=p24h&validAt=' + VALID_AT), [
    'runId',
    'variable',
    'validAt',
  ]);
});

/* ------------------------------------------------------------------ */
/* Grid mapping                                                        */
/* ------------------------------------------------------------------ */

test('nwp data: a stored snapshot maps to a grid response and keeps null cells', () => {
  const query = nwpData.validateGridQuery({ runId: RUN_ID, variable: 'p24h', validAt: VALID_AT });
  const grid = nwpData.mapSnapshotRow(snapshotRow() as NwpSnapshotRow, query);

  assert.equal(grid.runId, RUN_ID);
  assert.equal(grid.variable, 'p24h');
  assert.equal(grid.validAt, VALID_AT);
  assert.deepEqual(grid.bbox, [96, 5, 106, 21]);
  assert.equal(grid.nx, 2);
  assert.equal(grid.ny, 2);
  assert.equal(grid.mean.length, grid.nx * grid.ny);
  assert.equal(grid.max.length, grid.nx * grid.ny);
  assert.deepEqual(grid.mean, [1.5, null, 3, null]);
  assert.deepEqual(grid.max, [2.5, null, 6, null]);
  assert.equal(grid.mean[1], null, 'a missing block stays null');
  assert.notEqual(grid.mean[1], 0, 'a missing block is never a zero');
  assert.equal(grid.unit, null, 'units stay null until TMD confirms them');
  assert.equal(grid.method, 'block_mean_0.15deg');
});

test('nwp data: grid arrays that are not nx*ny long are an invalid payload', () => {
  const query = nwpData.validateGridQuery({ runId: RUN_ID, variable: 'p24h', validAt: VALID_AT });
  assert.throws(
    () => nwpData.mapSnapshotRow(snapshotRow({ meanJson: JSON.stringify([1, 2]) }) as NwpSnapshotRow, query),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 500);
      assert.equal((error as { code?: string }).code, 'NWP_PAYLOAD_INVALID');
      return true;
    },
  );
  assert.throws(
    () => nwpData.mapSnapshotRow(snapshotRow({ maxJson: JSON.stringify([1, 2]) }) as NwpSnapshotRow, query),
    (error: unknown) => (error as { code?: string }).code === 'NWP_PAYLOAD_INVALID',
  );
});

test('nwp data: a grid above 250 KB is rejected', () => {
  const cells = nwpTypes.NWP_GRID_CELLS;
  const values = Array.from({ length: cells }, (_, index) => 100.123456789012345 + index);
  const grid = {
    runId: RUN_ID,
    variable: 'p24h',
    validAt: VALID_AT,
    bbox: [96, 5, 106, 21],
    nx: nwpTypes.NWP_GRID.nx,
    ny: nwpTypes.NWP_GRID.ny,
    mean: values,
    max: values,
    unit: null,
    method: 'block_mean_0.15deg',
  };
  nwpData.assertGridPayloadSize({
    runId: RUN_ID,
    variable: 'p24h',
    validAt: VALID_AT,
    bbox: [96, 5, 106, 21],
    nx: 2,
    ny: 2,
    mean: [1, null, 2, null],
    max: [1, null, 2, null],
    unit: null,
    method: 'block_mean_0.15deg',
  });
  assert.throws(
    () => nwpData.assertGridPayloadSize(grid),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 500);
      assert.equal((error as { code?: string }).code, 'NWP_PAYLOAD_TOO_LARGE');
      return true;
    },
  );
});

/* ------------------------------------------------------------------ */
/* Province mapping                                                    */
/* ------------------------------------------------------------------ */

test('nwp data: province rows map to risk levels and keep a missing value unknown', () => {
  const rows = [
    { provinceCode: '10', provinceName: 'กรุงเทพมหานคร', value: 5, distanceKm: 1.2, cellCount: 4 },
    { provinceCode: '20', provinceName: 'ชลบุรี', value: 25, distanceKm: 2.5, cellCount: 6 },
    { provinceCode: '30', provinceName: 'นครราชสีมา', value: 60, distanceKm: 3.1, cellCount: 7 },
    { provinceCode: '40', provinceName: 'เชียงใหม่', value: 95, distanceKm: 4.4, cellCount: 9 },
    { provinceCode: '50', provinceName: 'นครปฐม', value: null, distanceKm: 25.8, cellCount: 0 },
  ].map((row) => ({
    runId: RUN_ID,
    variable: 'p24h',
    validAt: VALID_AT,
    method: 'max_within_25km',
    radiusKm: 25,
    riskLevel: null,
    ...row,
  })) as NwpProvinceValueRow[];

  const provinces = nwpData.mapProvinceRows(rows, { variable: 'p24h', thresholds: THRESHOLDS });

  assert.deepEqual(
    provinces.map((province) => province.riskLevel),
    ['normal', 'watch', 'high', 'severe', null],
  );
  assert.equal(provinces[4].value, null, 'a missing province value stays null');
  assert.equal(provinces[0].cellCount, 4);
  assert.equal(provinces[0].distanceKm, 1.2);
  assert.equal(provinces[4].cellCount, 0);
});

test('nwp data: without thresholds the risk level stays unknown instead of normal', () => {
  const rows = [
    {
      runId: RUN_ID,
      variable: 'p24h',
      validAt: VALID_AT,
      provinceCode: '73',
      provinceName: 'นครปฐม',
      value: 62.4,
      method: 'max_within_25km',
      radiusKm: 25,
      distanceKm: 3.2,
      riskLevel: null,
    },
  ] as NwpProvinceValueRow[];

  const provinces = nwpData.mapProvinceRows(rows, { variable: 'p24h', thresholds: null });
  assert.equal(provinces[0].riskLevel, null);
  assert.equal(provinces[0].value, 62.4);
});

/* ------------------------------------------------------------------ */
/* Runs mapping                                                        */
/* ------------------------------------------------------------------ */

test('nwp data: lead hours per variable come from the stored snapshot times', () => {
  const leads = nwpData.deriveLeadHoursByVariable('2026-10-26T00:00:00Z', [
    { variable: 'p1h', validAt: '2026-10-26T00:00:00Z' },
    { variable: 'p1h', validAt: '2026-10-26T06:00:00Z' },
    { variable: 'p1h', validAt: '2026-10-26T12:00:00Z' },
    { variable: 'p24h', validAt: '2026-10-26T00:00:00Z' },
    { variable: 'p24h', validAt: '2026-10-27T00:00:00Z' },
    { variable: 'p24h', validAt: '2026-10-28T00:00:00Z' },
  ]);
  assert.deepEqual(leads.p1h, [0, 6, 12]);
  assert.deepEqual(leads.p24h, [0, 24, 48]);
});

test('nwp data: a stored run maps to the published run shape', () => {
  const leads = { p1h: [0, 6, 12], p24h: [0, 24, 48] };
  const run = nwpData.mapRunRow(nwpData.toRunRow(runRow()), leads);
  assert.equal(run.runId, RUN_ID);
  assert.equal(run.domain, 'd02');
  assert.equal(run.domainLabel, 'Thailand 3km');
  assert.equal(run.status, 'ready');
  assert.equal(run.licenseStatus, 'pending');
  assert.equal(run.unitStatus, 'pending_official_confirmation');
  assert.equal(run.publicationMode, 'numeric_preview');
  assert.deepEqual(run.variables, ['p1h', 'p24h', 't2m', 'rhum', 'ws10m']);
  assert.deepEqual(run.leadHours, [0, 6, 12, 24, 48]);
  assert.deepEqual(run.leadHoursByVariable, leads);
});

test('nwp data: access status follows the stored licence and unit state', () => {
  assert.equal(nwpData.resolveAccessStatus('pending', 'pending_official_confirmation'), 'metadata_only');
  assert.equal(nwpData.resolveAccessStatus('approved_public', 'pending_official_confirmation'), 'metadata_only');
  assert.equal(nwpData.resolveAccessStatus('approved_public', 'confirmed'), 'approved_public');
  assert.equal(nwpData.resolveAccessStatus(null, null), 'metadata_only');
});

/* ------------------------------------------------------------------ */
/* Route behaviour                                                     */
/* ------------------------------------------------------------------ */

test('nwp routes: the grid route returns the stored grid with a truthful access status', async () => {
  const state: FakeState = { run: runRow(), snapshot: snapshotRow() };
  const { response, body } = await withRunner(fakeRunner(state), () =>
    call(gridRoute.GET, '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = body.data as Record<string, unknown>;
  assert.equal(data.runId, RUN_ID);
  assert.equal(data.variable, 'p24h');
  assert.equal(data.unit, null);
  assert.equal(data.method, 'block_mean_0.15deg');
  assert.equal((data.mean as unknown[]).length, 4);
  assert.equal((data.mean as unknown[])[1], null);
  const meta = body.meta as Record<string, unknown>;
  assert.equal(meta.access, 'metadata_only', 'a pending licence is never approved_public');
  assert.equal(meta.availability, 'ready');
  assert.equal(meta.datasetVersion, 'tmd-hpc-d02-v1');
  assert.ok((meta.warnings as string[]).length >= 4);
  assert.ok((meta.warnings as string[]).some((warning) => warning.includes('ไม่ใช่ค่าของจังหวัด')));
});

test('nwp routes: the grid route rejects a bad query with 400 INVALID_QUERY', async () => {
  const state: FakeState = { run: runRow(), snapshot: snapshotRow() };
  const cases = [
    '/api/v1/nwp/grid?variable=p24h&validAt=' + VALID_AT,
    '/api/v1/nwp/grid?runId=' + RUN_ID + '&validAt=' + VALID_AT,
    '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h',
    '/api/v1/nwp/grid?runId=bad-id&variable=p24h&validAt=' + VALID_AT,
    '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=dws&validAt=' + VALID_AT,
    '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=nope',
  ];
  for (const path of cases) {
    const { response, body } = await withRunner(fakeRunner(state), () => call(gridRoute.GET, path));
    assert.equal(response.status, 400, path);
    assert.equal(errorCode(body), 'INVALID_QUERY', path);
    assert.ok(String((body.error as { requestId?: string }).requestId).length > 0, 'requestId');
  }
});

test('nwp routes: a missing run is a 404 NWP_NOT_FOUND', async () => {
  const { response, body } = await withRunner(fakeRunner({ run: null, snapshot: null }), () =>
    call(gridRoute.GET, '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
  );
  assert.equal(response.status, 404);
  assert.equal(errorCode(body), 'NWP_NOT_FOUND');
});

test('nwp routes: a missing snapshot is a 404 NWP_NOT_FOUND', async () => {
  const { response, body } = await withRunner(fakeRunner({ run: runRow(), snapshot: null }), () =>
    call(gridRoute.GET, '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
  );
  assert.equal(response.status, 404);
  assert.equal(errorCode(body), 'NWP_NOT_FOUND');
});

test('nwp routes: the metadata_only kill switch is a 403 NWP_PUBLICATION_DISABLED', async () => {
  const state: FakeState = { run: runRow({ publicationMode: 'metadata_only' }), snapshot: snapshotRow() };
  const grid = await withRunner(fakeRunner(state), () =>
    call(gridRoute.GET, '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
  );
  assert.equal(grid.response.status, 403);
  assert.equal(errorCode(grid.body), 'NWP_PUBLICATION_DISABLED');

  const provinces = await withRunner(fakeRunner(state), () =>
    call(provincesRoute.GET, '/api/v1/nwp/provinces?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
  );
  assert.equal(provinces.response.status, 403);
  assert.equal(errorCode(provinces.body), 'NWP_PUBLICATION_DISABLED');
});

test('nwp routes: an unreachable database is a 503 HUB_DATABASE_NOT_CONFIGURED', async () => {
  const failing = async () => {
    throw new HubDatabaseError('HUB_DATABASE_NOT_CONFIGURED');
  };
  const paths: Array<[(request: Request) => Response | Promise<Response>, string]> = [
    [gridRoute.GET, '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT],
    [provincesRoute.GET, '/api/v1/nwp/provinces?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT],
    [runsRoute.GET, '/api/v1/nwp/runs'],
  ];
  for (const [route, path] of paths) {
    const { response, body } = await withRunner(failing as NwpSqlRunner, () => call(route, path));
    assert.equal(response.status, 503, path);
    assert.equal(errorCode(body), 'HUB_DATABASE_NOT_CONFIGURED', path);
  }
});

test('nwp routes: a broken grid payload is a 500 NWP_PAYLOAD_INVALID', async () => {
  const state: FakeState = {
    run: runRow(),
    snapshot: snapshotRow({ meanJson: JSON.stringify([1, 2, 3]) }),
  };
  const { response, body } = await withRunner(fakeRunner(state), () =>
    call(gridRoute.GET, '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
  );
  assert.equal(response.status, 500);
  assert.equal(errorCode(body), 'NWP_PAYLOAD_INVALID');
  assert.equal(JSON.stringify(body).includes('meanJson'), false, 'raw payloads never leak');
});

test('nwp routes: an oversized grid payload is a 500 NWP_PAYLOAD_TOO_LARGE', async () => {
  const cells = nwpTypes.NWP_GRID_CELLS;
  const values = Array.from({ length: cells }, (_, index) => 100.123456789012345 + index);
  const state: FakeState = {
    run: runRow(),
    snapshot: snapshotRow({
      nx: nwpTypes.NWP_GRID.nx,
      ny: nwpTypes.NWP_GRID.ny,
      meanJson: JSON.stringify(values),
      maxJson: JSON.stringify(values),
    }),
  };
  const { response, body } = await withRunner(fakeRunner(state), () =>
    call(gridRoute.GET, '/api/v1/nwp/grid?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
  );
  assert.equal(response.status, 500);
  assert.equal(errorCode(body), 'NWP_PAYLOAD_TOO_LARGE');
});

test('nwp routes: the provinces route returns the watchlist with a computed risk level', async () => {
  const state: FakeState = {
    run: runRow(),
    snapshot: snapshotRow(),
    provinces: [
      {
        runId: RUN_ID,
        variable: 'p24h',
        validAt: VALID_AT,
        provinceCode: '73',
        provinceName: 'นครปฐม',
        value: 62.4,
        method: 'max_within_25km',
        radiusKm: 25,
        distanceKm: 3.2,
        riskLevel: null,
      },
      {
        runId: RUN_ID,
        variable: 'p24h',
        validAt: VALID_AT,
        provinceCode: '10',
        provinceName: 'กรุงเทพมหานคร',
        value: null,
        method: 'nearest_cell',
        radiusKm: 25,
        distanceKm: 31.5,
        riskLevel: null,
      },
    ],
  };

  nwpData.setNwpThresholdsForTests(THRESHOLDS);
  try {
    const { response, body } = await withRunner(fakeRunner(state), () =>
      call(provincesRoute.GET, '/api/v1/nwp/provinces?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
    );
    assert.equal(response.status, 200);
    const data = body.data as Record<string, unknown>;
    assert.equal(data.method, 'max_within_25km');
    assert.equal(data.radiusKm, 25);
    const provinces = data.provinces as Array<Record<string, unknown>>;
    assert.equal(provinces.length, 2);
    assert.equal(provinces[0].provinceCode, '73');
    assert.equal(provinces[0].riskLevel, 'high');
    assert.equal(provinces[0].cellCount, 18, 'the cell count comes from the snapshot quality document');
    assert.equal(provinces[0].distanceKm, 3.2);
    assert.equal(provinces[1].value, null);
    assert.equal(provinces[1].riskLevel, null, 'a missing value is never a normal level');
    const meta = body.meta as Record<string, unknown>;
    assert.ok((meta.warnings as string[]).some((warning) => warning.includes('ไม่ใช่ค่าของจังหวัด')));
  } finally {
    nwpData.setNwpThresholdsForTests(undefined);
  }
});

test('nwp routes: without thresholds the province risk level stays unknown', async () => {
  const state: FakeState = {
    run: runRow(),
    snapshot: snapshotRow(),
    provinces: [
      {
        runId: RUN_ID,
        variable: 'p24h',
        validAt: VALID_AT,
        provinceCode: '73',
        provinceName: 'นครปฐม',
        value: 62.4,
        method: 'max_within_25km',
        radiusKm: 25,
        distanceKm: 3.2,
        riskLevel: null,
      },
    ],
  };

  nwpData.setNwpThresholdsForTests(null);
  try {
    const { response, body } = await withRunner(fakeRunner(state), () =>
      call(provincesRoute.GET, '/api/v1/nwp/provinces?runId=' + RUN_ID + '&variable=p24h&validAt=' + VALID_AT),
    );
    assert.equal(response.status, 200);
    const provinces = (body.data as { provinces: Array<Record<string, unknown>> }).provinces;
    assert.equal(provinces[0].riskLevel, null);
    assert.equal(provinces[0].value, 62.4);
  } finally {
    nwpData.setNwpThresholdsForTests(undefined);
  }
});

test('nwp routes: the runs route lists the usable runs with their lead times', async () => {
  const state: FakeState = {
    runs: [runRow()],
    snapshots: [
      { runId: RUN_ID, variable: 'p1h', validAt: '2026-10-26T00:00:00Z' },
      { runId: RUN_ID, variable: 'p1h', validAt: '2026-10-26T06:00:00Z' },
      { runId: RUN_ID, variable: 'p24h', validAt: '2026-10-26T00:00:00Z' },
      { runId: RUN_ID, variable: 'p24h', validAt: '2026-10-27T00:00:00Z' },
    ],
  };
  const { response, body } = await withRunner(fakeRunner(state), () => call(runsRoute.GET, '/api/v1/nwp/runs'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const runs = (body.data as { runs: Array<Record<string, unknown>> }).runs;
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, RUN_ID);
  assert.deepEqual(runs[0].leadHoursByVariable, { p1h: [0, 6], p24h: [0, 24] });
  assert.deepEqual(runs[0].leadHours, [0, 6, 24]);
  assert.equal((body.meta as Record<string, unknown>).availability, 'ready');
});

test('nwp routes: without any usable run the runs route answers an empty list', async () => {
  const { response, body } = await withRunner(fakeRunner({ runs: [] }), () => call(runsRoute.GET, '/api/v1/nwp/runs'));
  assert.equal(response.status, 200);
  assert.deepEqual((body.data as { runs: unknown[] }).runs, []);
  assert.equal((body.meta as Record<string, unknown>).availability, 'empty');
});

test('nwp routes: every route opts out of caching and keeps the request id', async () => {
  for (const path of [
    '../app/api/v1/nwp/grid/route.ts',
    '../app/api/v1/nwp/provinces/route.ts',
    '../app/api/v1/nwp/runs/route.ts',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /export const dynamic = 'force-dynamic'/, path);
    assert.match(source, /handleApi/, path);
    assert.match(source, /jsonData/, path);
  }
});
