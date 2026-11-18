import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

/**
 * One province page asks the hub for its weather numbers and the reservoir table,
 * and both reads walk a D1 batch page by page. Two costs made those walks far more
 * expensive than the data they return: the weather walk loaded every grid and
 * station row of every weather resource before filtering the province in
 * JavaScript, even though the published province travels in `dimensions.provinceCode`
 * for both row kinds, and both walks asked the shared reader for a batch total on
 * every page, which re-scans the whole resource. The statements run against a real
 * SQLite stand-in for D1 here, so the pushed-down scope is proven to select exactly
 * the rows the JavaScript filter used to keep, with no network and no D1 token.
 */
const ERA5 = 'https://archive-api.open-meteo.com/v1/archive';
const STATION = 'https://data.tmd.go.th/api/WeatherToday/V2/';

const sqlite = new DatabaseSync(':memory:');
type QueryCall = { sql: string; values: unknown[] };
const calls: QueryCall[] = [];
(globalThis as Record<string, unknown>).__weatherSqlite = sqlite;
(globalThis as Record<string, unknown>).__weatherCalls = calls;

const STUBS: Record<string, string> = {
  'server-only': 'export default undefined;',
  './d1': [
    'export async function queryD1(sql, params = []) { globalThis.__weatherCalls.push({ sql, values: params }); return globalThis.__weatherSqlite.prepare(sql).all(...params); }',
    'export async function countD1(sql, params = []) { globalThis.__weatherCalls.push({ sql, values: params }); return Number(globalThis.__weatherSqlite.prepare(sql).get(...params)?.total ?? 0); }',
    'export async function getD1() { return null; }',
    'export async function hasD1Catalog() { return false; }',
  ].join('\n'),
  './db': 'export class HubDatabaseError extends Error { constructor(code) { super(code); this.code = code; } }',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: 'data:text/javascript,' + encodeURIComponent(stub), shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try {
            return nextResolve(specifier + suffix, context);
          } catch {
            // try the next TypeScript source before rethrowing
          }
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

const { readWeatherSnapshot } = await import('../lib/hub/weather-repository.ts');

const OBSERVATION_COLUMNS = [
  'resource_id', 'run_id', 'row_key', 'series_key', 'period_start', 'period_end', 'period_label',
  'location_id', 'location_code', 'location_kind', 'location_name', 'province_code', 'crop_code',
  'crop_name', 'metric_id', 'metric_name', 'product', 'grade', 'market', 'unit', 'value',
  'dimensions', 'quality_status', 'quality', 'source_row_ref',
];

type SeedRow = Partial<Record<(typeof OBSERVATION_COLUMNS)[number], string | number | null>> & {
  resourceId: string;
  runId: string;
  rowKey: string;
  locationCode: string;
  metricId: string;
  periodStart: string;
  value: number | null;
  dimensions: string;
};

function observationValues(row: SeedRow): (string | number | null)[] {
  return OBSERVATION_COLUMNS.map((column) => {
    if (column === 'resource_id') return row.resourceId;
    if (column === 'run_id') return row.runId;
    if (column === 'row_key') return row.rowKey;
    if (column === 'metric_id') return row.metricId;
    if (column === 'period_start') return row.periodStart;
    if (column === 'period_end') return row.periodStart;
    if (column === 'value') return row.value;
    if (column === 'dimensions') return row.dimensions;
    if (column === 'quality_status') return 'good';
    if (column === 'series_key') return row.resourceId + ':' + row.rowKey;
    if (column === 'location_code') return row.locationCode;
    if (column === 'location_id') return 'loc-' + row.locationCode;
    if (column === 'location_kind') return row.resourceId === ERA5 ? 'grid' : 'station';
    return null;
  });
}

function createFixture() {
  sqlite.exec(
    'DROP TABLE IF EXISTS observations; DROP TABLE IF EXISTS resources; DROP TABLE IF EXISTS sync_runs;' +
      'DROP TABLE IF EXISTS datasets; DROP TABLE IF EXISTS sources;',
  );
  sqlite.exec(`
    CREATE TABLE sources (source_id TEXT,source_name TEXT,metadata_access_status TEXT,freshness_days INTEGER);
    CREATE TABLE datasets (dataset_id TEXT,title TEXT,source_id TEXT,metadata_access_status TEXT,category TEXT);
    CREATE TABLE resources (resource_id TEXT,dataset_id TEXT,active_run_id TEXT,access_status TEXT,
      project_publication_approved INTEGER,grain TEXT,source_updated_at TEXT);
    CREATE TABLE sync_runs (run_id TEXT,resource_id TEXT,kind TEXT,status TEXT,completed_at TEXT,
      adapter_version TEXT,payload_sha256 TEXT,source_retrieved_at TEXT);
    CREATE TABLE observations (
      resource_id TEXT,run_id TEXT,row_key TEXT,series_key TEXT,period_start TEXT,period_end TEXT,
      period_label TEXT,location_id TEXT,location_code TEXT,location_kind TEXT,location_name TEXT,
      province_code TEXT,crop_code TEXT,crop_name TEXT,metric_id TEXT,metric_name TEXT,product TEXT,
      grade TEXT,market TEXT,unit TEXT,value NUMERIC,dimensions TEXT,quality_status TEXT,quality TEXT,
      source_row_ref TEXT);
    INSERT INTO sources VALUES ('source-open-meteo','Open-Meteo','approved_public',7);
    INSERT INTO sources VALUES ('source-tmd','TMD','approved_public',7);
    INSERT INTO datasets VALUES ('dataset-era5','ERA5 archive','source-open-meteo','approved_public','weather');
    INSERT INTO datasets VALUES ('dataset-tmd','WeatherToday','source-tmd','approved_public','weather');
    INSERT INTO resources VALUES ('${ERA5}','dataset-era5','run-era5','approved_public',1,'grid_point','2026-10-25T00:00:00Z');
    INSERT INTO resources VALUES ('${STATION}','dataset-tmd','run-tmd','approved_public',1,'station','2026-10-30T00:00:00Z');
    INSERT INTO resources VALUES ('https://data.tmd.go.th/api/WeatherTodayByAgro/V1/','dataset-tmd',NULL,'approved_public',1,'station',NULL);
    INSERT INTO resources VALUES ('https://data.tmd.go.th/api/weathertodayBySynop/V1/','dataset-tmd',NULL,'approved_public',1,'station',NULL);
    INSERT INTO sync_runs VALUES ('run-era5','${ERA5}','numeric','succeeded','2026-10-25T06:00:00Z','era5-v1','sha-era5','2026-10-25T05:00:00Z');
    INSERT INTO sync_runs VALUES ('run-tmd','${STATION}','numeric','succeeded','2026-10-30T01:00:00Z','tmd-v1','sha-tmd','2026-10-30T00:30:00Z');
  `);

  const rows: SeedRow[] = [
    // Nakh Pathom grid point: three days x two measures, plus one row whose province
    // code is stored as a JSON number — the JavaScript filter accepted it, SQL must too.
    ...(['2026-10-18', '2026-10-19'] as const).flatMap((day, index) => [
      { resourceId: ERA5, runId: 'run-era5', rowKey: `era5-73-${day}-precip`, locationCode: '73', metricId: 'precip_mm', periodStart: day, value: index + 1, dimensions: '{"provinceCode":"73","provinceNameTh":"นครปฐม"}' },
      { resourceId: ERA5, runId: 'run-era5', rowKey: `era5-73-${day}-tmax`, locationCode: '73', metricId: 't2m_max_c', periodStart: day, value: 30 + index, dimensions: '{"provinceCode":"73","provinceNameTh":"นครปฐม"}' },
    ]),
    { resourceId: ERA5, runId: 'run-era5', rowKey: 'era5-73-2026-10-20-tmin', locationCode: '73', metricId: 't2m_min_c', periodStart: '2026-10-20', value: 24, dimensions: '{"provinceCode":73,"provinceNameTh":"นครปฐม"}' },
    // Neighbour provinces must not travel to a Nakh Pathom page.
    { resourceId: ERA5, runId: 'run-era5', rowKey: 'era5-10-2026-10-18-precip', locationCode: '10', metricId: 'precip_mm', periodStart: '2026-10-18', value: 5, dimensions: '{"provinceCode":"10","provinceNameTh":"กรุงเทพมหานคร"}' },
    { resourceId: ERA5, runId: 'run-era5', rowKey: 'era5-11-2026-10-18-precip', locationCode: '11', metricId: 'precip_mm', periodStart: '2026-10-18', value: 6, dimensions: '{"provinceCode":"11","provinceNameTh":"สมุทรปราการ"}' },
    // Station rows carry no numeric province_code column; the province is a dimension.
    { resourceId: STATION, runId: 'run-tmd', rowKey: 'tmd-73', locationCode: 'st-73', metricId: 'rainfall_mm', periodStart: '2026-10-30', value: 12, dimensions: '{"provinceCode":"73","stationNetwork":"synop"}' },
    { resourceId: STATION, runId: 'run-tmd', rowKey: 'tmd-10', locationCode: 'st-10', metricId: 'rainfall_mm', periodStart: '2026-10-30', value: 3, dimensions: '{"provinceCode":"10","stationNetwork":"synop"}' },
  ];

  const insert = sqlite.prepare(
    'INSERT INTO observations (' + OBSERVATION_COLUMNS.join(',') + ') VALUES (' + OBSERVATION_COLUMNS.map(() => '?').join(',') + ')',
  );
  for (const row of rows) insert.run(...observationValues(row));
}

function observationSelects() {
  return calls.filter((call) => call.sql.includes('FROM observations'));
}

test('province weather read scopes the batch in SQL and stops re-counting every page', async () => {
  createFixture();
  calls.length = 0;

  const snapshot = await readWeatherSnapshot({ provinceCode: '73' });

  const selects = observationSelects();
  assert.ok(selects.length, 'the read must still query the published weather batch');
  assert.equal(
    selects.filter((call) => /count\(\*\)/.test(call.sql)).length,
    0,
    'a province page must not re-count the whole batch once per page',
  );
  assert.ok(
    selects.every((call) => call.values.includes('73')),
    'every observation read has to bind the requested province code',
  );
  assert.ok(
    selects.every((call) => call.sql.includes("json_extract(o.dimensions,'$.provinceCode')")),
    'the province scope must reach SQL through the dimensions column the writers actually fill',
  );

  const payload = snapshot.payload;
  assert.ok(payload, 'a scoped batch must still produce a numeric payload');
  assert.deepEqual(payload.reanalysis.map((record) => record.provinceCode), ['73']);
  assert.deepEqual(payload.stations.map((station) => station.provinceCode), ['73']);
  const day = payload.reanalysis[0].days.find((entry) => entry.date === '2026-10-20');
  assert.equal(day?.t2mMinC, 24, 'a dimensions province code stored as a number must survive the SQL scope');
  assert.equal(snapshot.observationRows, 6, 'only the six published rows of province 73 are loaded');
});

test('unscoped weather read still returns every province grid point', async () => {
  createFixture();
  calls.length = 0;

  const snapshot = await readWeatherSnapshot();

  const selects = observationSelects();
  assert.equal(
    selects.filter((call) => /count\(\*\)/.test(call.sql)).length,
    0,
    'the dashboard walk also stops when a page comes back short',
  );
  assert.deepEqual(
    snapshot.payload?.reanalysis.map((record) => record.provinceCode),
    ['10', '11', '73'],
    'no province filter must mean every published grid point',
  );
  assert.equal(snapshot.observationRows, 9);
});

/**
 * The province page also reads the RID reservoir batch, which is backfilled daily
 * and therefore larger than one page. Counting the batch on every page made the
 * reservoir walk re-scan the whole resource per page as well.
 */
const RID = 'https://app.rid.go.th/reservoir/api/reservoir/public';

function createReservoirFixture(reservoirCount: number) {
  sqlite.exec(
    'DROP TABLE IF EXISTS observations; DROP TABLE IF EXISTS resources; DROP TABLE IF EXISTS sync_runs;' +
      'DROP TABLE IF EXISTS datasets; DROP TABLE IF EXISTS sources;',
  );
  sqlite.exec(`
    CREATE TABLE sources (source_id TEXT,source_name TEXT,metadata_access_status TEXT,freshness_days INTEGER);
    CREATE TABLE datasets (dataset_id TEXT,title TEXT,source_id TEXT,metadata_access_status TEXT,category TEXT);
    CREATE TABLE resources (resource_id TEXT,dataset_id TEXT,active_run_id TEXT,access_status TEXT,
      project_publication_approved INTEGER,grain TEXT,source_updated_at TEXT);
    CREATE TABLE sync_runs (run_id TEXT,resource_id TEXT,kind TEXT,status TEXT,completed_at TEXT,
      adapter_version TEXT,payload_sha256 TEXT,source_retrieved_at TEXT);
    CREATE TABLE observations (
      resource_id TEXT,run_id TEXT,row_key TEXT,series_key TEXT,period_start TEXT,period_end TEXT,
      period_label TEXT,location_id TEXT,location_code TEXT,location_kind TEXT,location_name TEXT,
      province_code TEXT,crop_code TEXT,crop_name TEXT,metric_id TEXT,metric_name TEXT,product TEXT,
      grade TEXT,market TEXT,unit TEXT,value NUMERIC,dimensions TEXT,quality_status TEXT,quality TEXT,
      source_row_ref TEXT);
    INSERT INTO sources VALUES ('source-rid','RID','approved_public',1);
    INSERT INTO datasets VALUES ('dataset-rid','Reservoirs','source-rid','approved_public','water');
    INSERT INTO resources VALUES ('${RID}','dataset-rid','run-rid','approved_public',1,'reservoir','2026-10-31T00:00:00Z');
    INSERT INTO sync_runs VALUES ('run-rid','${RID}','numeric','succeeded','2026-10-31T01:00:00Z','rid-v1','sha-rid','2026-10-31T00:30:00Z');
  `);
  const insert = sqlite.prepare(
    'INSERT INTO observations (' + OBSERVATION_COLUMNS.join(',') + ') VALUES (' + OBSERVATION_COLUMNS.map(() => '?').join(',') + ')',
  );
  for (let index = 1; index <= reservoirCount; index += 1) {
    const id = 'rsv-' + String(index).padStart(3, '0');
    const metrics: Array<[string, number | null, string | null]> = [
      ['reservoir_volume', index, ' ล้าน ลบ.ม.'],
      ['reservoir_storage_pct', index % 100, '%'],
      ['reservoir_capacity', index * 2, ' ล้าน ลบ.ม.'],
    ];
    for (const [metricId, value, unit] of metrics) {
      insert.run(
        ...OBSERVATION_COLUMNS.map((column) => {
          if (column === 'resource_id') return RID;
          if (column === 'run_id') return 'run-rid';
          if (column === 'row_key') return id + '-' + metricId;
          if (column === 'series_key') return RID + ':' + id + '-' + metricId;
          if (column === 'metric_id') return metricId;
          if (column === 'period_start') return '2026-10-31';
          if (column === 'period_end') return '2026-10-31';
          if (column === 'location_id') return id;
          if (column === 'location_code') return id;
          if (column === 'location_kind') return 'reservoir';
          if (column === 'location_name') return 'อ่างเก็บน้ำ ' + id;
          if (column === 'unit') return unit;
          if (column === 'value') return value;
          if (column === 'dimensions') return '{"region":"north"}';
          if (column === 'quality_status') return 'good';
          return null;
        }),
      );
    }
  }
}

test('reservoir walk stops on a short page instead of counting the batch per page', async () => {
  createReservoirFixture(200);
  calls.length = 0;

  const { readWaterSnapshot } = await import('../lib/hub/water-repository.ts');
  const snapshot = await readWaterSnapshot();

  const selects = observationSelects();
  assert.equal(
    selects.filter((call) => /count\(\*\)/.test(call.sql)).length,
    0,
    '600 published rows must not be re-counted on each of the two pages',
  );
  assert.equal(selects.length, 2, 'two pages of 500 and 100 rows, then stop');
  assert.equal(snapshot.payload?.reservoirs.length, 200, 'every reservoir of the batch is still pivoted');
  assert.equal(snapshot.provenance.observationRows, 600);
});
