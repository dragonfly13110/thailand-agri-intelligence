import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { decodeSeriesId, encodeSeriesId } from '../lib/hub/series-id.ts';
import { postgresSemanticDimensionsExpression } from '../lib/hub/series-sql.ts';

type QueryCall = { sql: string; values: unknown[] };
type D1QueryCall = { sql: string; values: SQLInputValue[] };
type TimedQueryCall = D1QueryCall & { elapsedMs: number };
type Row = Record<string, unknown>;

const sqlite = new DatabaseSync(':memory:');
const d1Calls: D1QueryCall[] = [];
const d1Timings: TimedQueryCall[] = [];
const pgCalls: QueryCall[] = [];
(globalThis as Record<string, unknown>).__seriesSqlite = sqlite;
(globalThis as Record<string, unknown>).__seriesD1Calls = d1Calls;
(globalThis as Record<string, unknown>).__seriesD1Timings = d1Timings;
(globalThis as Record<string, unknown>).__seriesPgCalls = pgCalls;
(globalThis as Record<string, unknown>).__seriesPgRows = [];
(globalThis as Record<string, unknown>).__seriesPgRecordRows = [];
(globalThis as Record<string, unknown>).__seriesPgAudit = { overflowCount: 0, tokens: [] };
(globalThis as Record<string, unknown>).__seriesPgCountTotal = null;
(globalThis as Record<string, unknown>).__seriesPgStatsTotal = 7;
(globalThis as Record<string, unknown>).__seriesPgHandler = async (sql: string, values: unknown[] = []) => {
  pgCalls.push({ sql, values });
  if (sql.includes('FROM hub.datasets d JOIN hub.sources s')) {
    if ((globalThis as Record<string, unknown>).__seriesPgStatusFixture) {
      return sqlite.prepare(sql.replace(/hub\./g, '').replace(/\$(\d+)/g, '?$1')).all(...values as SQLInputValue[])
        .map(row => ({ ...row, hasNumeric: row.hasNumeric === 1, hasPartial: row.hasPartial === 1 }));
    }
    return [{ sourceId: 'source-1', freshnessDays: 30, hasNumeric: true, hasPartial: false }];
  }
  if (sql.includes('sourceIds') && (globalThis as Record<string, unknown>).__seriesPgStatusFixture) {
    const statusExpression = sql.match(/CASE WHEN max\(CASE WHEN run.status='partial'[\s\S]*?END AS "numericStatus"/);
    assert.ok(statusExpression, 'Postgres stats must aggregate the selected run statuses, including zero rows');
    const from = sql.slice(sql.indexOf(' FROM hub.observations o '))
      .replaceAll(postgresSemanticDimensionsExpression(), 'json(o.dimensions)')
      .replace(/hub\./g, '').replace(/\$(\d+)/g, '?$1').replace(/::(?:date|jsonb)/g, '')
      .replace(/IS NOT DISTINCT FROM/g, 'IS');
    const stats = sqlite.prepare('SELECT count(*) AS total,' + statusExpression[0] + from).get(...values as SQLInputValue[]);
    const rows = sqlite.prepare('SELECT o.row_key AS rowKey,r.resource_id AS resourceId,o.series_key AS seriesKey,' +
      'r.grain AS sourceGrain,o.period_start AS periodStart,o.period_end AS periodEnd,o.product,o.unit,' +
      'o.metric_id AS metricId,o.metric_name AS metricName,o.value,o.dimensions,1 AS identityCount,1 AS observationCount' + from)
      .all(...values as SQLInputValue[]);
    (globalThis as Record<string, unknown>).__seriesPgRecordRows = rows;
    (globalThis as Record<string, unknown>).__seriesPgRows = rows;
    return [{ ...stats, sourceIds: ['source-1'], freshnessDays: 30 }];
  }
  if ((globalThis as Record<string, unknown>).__seriesPgStatusFixture &&
    (sql.includes('SELECT s.source_id AS "sourceId"') || sql.includes('legacy_series') ||
      sql.startsWith('SELECT r.resource_id AS "resourceId"') || sql.startsWith('SELECT o.row_key AS "rowKey"') ||
      sql.startsWith('WITH scoped_rows AS'))) {
    if (sql.includes('SELECT s.source_id AS "sourceId"')) assert.ok(sql.includes('run.status AS "numericStatus"'));
    const translated = sql.replaceAll(postgresSemanticDimensionsExpression(), 'json(o.dimensions)')
      .replace(/hub\./g, '').replace(/\$(\d+)/g, '?$1').replace(/::(?:double precision|jsonb|text|date)/g, '')
      .replace(/IS NOT DISTINCT FROM/g, 'IS').replace(/COLLATE "C"/g, 'COLLATE BINARY');
    return sqlite.prepare(translated).all(...values as SQLInputValue[]);
  }
  if (sql.includes('numeric_safety') && sql.includes('numericTokenOverflowCount')) {
    const audit = (globalThis as Record<string, unknown>).__seriesPgAudit as { overflowCount: number; tokens: string[] };
    const override = (globalThis as Record<string, unknown>).__seriesPgCountTotal;
    const total = override === null ? sql.includes('WHERE product=') ? '1' : '6' : String(override);
    return [{ total, numericTokenOverflowCount: audit.overflowCount, numericTokens: audit.tokens }];
  }
  if (sql.includes('SELECT count(*)::text AS total FROM identified_series WHERE product=')) return [{ total: '1' }];
  if (sql.includes('SELECT count(*)::text AS total FROM identified_series')) return [{ total: '6' }];
  if (sql.includes('count(*) OVER')) {
    const rows = (globalThis as Record<string, unknown>).__seriesPgRows as Row[];
    if ((globalThis as Record<string, unknown>).__seriesPgStatusFixture) {
      const offset = Number(values.at(-1) ?? 0);
      return rows.slice(offset, offset + Number(values.at(-2) ?? rows.length));
    }
    return rows;
  }
  if (sql.startsWith('WITH scoped_rows AS')) {
    const rows = [...(globalThis as Record<string, unknown>).__seriesPgRecordRows as Row[]];
    rows.sort((left, right) => {
      const period = String(right.periodEnd ?? '').localeCompare(String(left.periodEnd ?? ''));
      return period || String(left.rowKey).localeCompare(String(right.rowKey))
        || String(left.resourceId).localeCompare(String(right.resourceId));
    });
    const limit = Number(values.at(-2) ?? rows.length);
    const offset = Number(values.at(-1) ?? 0);
    return rows.slice(offset, offset + limit);
  }
  if (sql.includes('grouped_series') || sql.includes('legacy_series')) return [{ total: '6' }];
  if (sql.includes('sourceIds')) return [{
    total: String((globalThis as Record<string, unknown>).__seriesPgStatsTotal), sourceIds: ['source-1'], dataAsOf: null, sourceUpdatedAt: null,
    retrievedAt: null, datasetVersion: 'version-1', freshnessDays: 30, runCount: 1,
  }];
  if (sql.includes('SELECT s.source_id AS "sourceId"')) return [{ sourceId: 'source-1', freshnessDays: 30 }];
  if (sql.startsWith('SELECT o.row_key AS "rowKey"')) return [{
    rowKey: 'rice-1', seriesId: 'resource-1|price:source_year_label:unspecified:THB/kg',
    periodStart: null, periodEnd: null, periodLabel: '2568', locationCode: '10', locationKind: 'province',
    locationName: 'Bangkok', provinceCode: '10', cropCode: 'rice', cropName: 'Rice',
    metricId: 'price', metricName: 'Price', product: 'Rice', grade: 'A', market: 'Bangkok market',
    unit: 'THB/kg', value: 12,
    dimensions: String((globalThis as Record<string, unknown>).__seriesPgObsDimensions ?? '{"season":"wet","sourceTimestamp":"retrieval-1","sourceYearLabel":"2568"}'),
    qualityStatus: 'good', sourceRowRef: 'row-1',
  }];
  return [];
};

const STUBS: Record<string, string> = {
  'server-only': 'export default undefined;',
  './d1': [
    'export async function queryD1(sql, params = []) { globalThis.__seriesD1Calls.push({ sql, values: params }); const started = performance.now(); const rows = globalThis.__seriesSqlite.prepare(sql).all(...params); globalThis.__seriesD1Timings.push({ sql, values: params, elapsedMs: performance.now() - started }); globalThis.__seriesD1LastRows = rows; return rows; }',
    'export async function countD1(sql, params = []) { globalThis.__seriesD1Calls.push({ sql, values: params }); const started = performance.now(); const total = Number(globalThis.__seriesSqlite.prepare(sql).get(...params)?.total ?? 0); globalThis.__seriesD1Timings.push({ sql, values: params, elapsedMs: performance.now() - started }); return total; }',
    'export async function getD1() { return null; }',
    'export async function hasD1Catalog() { return false; }',
  ].join('\n'),
  './db': 'export async function query(sql, values = []) { return globalThis.__seriesPgHandler(sql, values); } export class HubDatabaseError extends Error { constructor(code) { super(code); this.code = code; } }',
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

const { listD1Records, listD1Series, listD1SeriesObservations } = await import('../lib/hub/d1-numeric-repository.ts');
const { listDbRecords, listDbSeries, listDbSeriesObservations } = await import('../lib/hub/numeric-repository.ts');

function createD1Fixture() {
  sqlite.exec(`
    CREATE TABLE datasets (dataset_id TEXT,source_id TEXT,metadata_access_status TEXT);
    CREATE TABLE sources (source_id TEXT,source_name TEXT,metadata_access_status TEXT,freshness_days INTEGER);
    CREATE TABLE resources (resource_id TEXT,dataset_id TEXT,active_run_id TEXT,access_status TEXT,
      project_publication_approved INTEGER,grain TEXT,source_updated_at TEXT);
    CREATE TABLE sync_runs (run_id TEXT,resource_id TEXT,kind TEXT,status TEXT,
      source_retrieved_at TEXT,payload_sha256 TEXT);
    CREATE TABLE observations (
      resource_id TEXT,run_id TEXT,row_key TEXT,series_key TEXT,period_start TEXT,period_end TEXT,period_label TEXT,
      location_id TEXT,location_code TEXT,location_kind TEXT,location_name TEXT,province_code TEXT,
      crop_code TEXT,crop_name TEXT,metric_id TEXT,metric_name TEXT,product TEXT,grade TEXT,market TEXT,unit TEXT,
      value NUMERIC,dimensions TEXT NOT NULL,quality_status TEXT,source_row_ref TEXT
    );
    INSERT INTO datasets VALUES ('dataset-1','source-1','approved_public');
    INSERT INTO sources VALUES ('source-1','Source 1','approved_public',30);
    INSERT INTO resources VALUES ('resource-1','dataset-1','run-1','approved_public',1,'source-year-label',NULL);
    INSERT INTO resources VALUES ('private-resource','dataset-1','run-2','private',0,'source-year-label',NULL);
    INSERT INTO sync_runs VALUES ('run-1','resource-1','numeric','succeeded',NULL,'version-1');
    INSERT INTO sync_runs VALUES ('run-2','private-resource','numeric','succeeded',NULL,'version-private');
  `);
  const insert = sqlite.prepare(`INSERT INTO observations VALUES
    ('resource-1','run-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const key = 'price:source_year_label:unspecified:THB/kg';
  const base = [null, null, 'label-2568', 'province:10', '10', 'province', 'Bangkok', '10', 'rice', 'Rice',
    'price', 'Price', 'Rice', 'A', 'Bangkok market', 'THB/kg', 12];
  const addRow = (rowKey: string, fields: Array<string | number | null>, dimensions: string) =>
    insert.run(rowKey, key, ...fields, dimensions, 'good', rowKey);
  addRow('rice-1', base, '{"season":"wet","sourceYearLabel":"2568","sourceTimestamp":"retrieval-1","dataKind":"official"}');
  addRow('rice-2', base.map((value, index) => index === 2 ? 'label-2569' : value), '{"dataKind":"official","sourceTimestamp":"retrieval-2","sourceYearLabel":"2569","season":"wet"}');
  addRow('rubber-1', [null, null, 'province-11', 'province:11', '11', 'province', 'Chiang Mai', '11', 'rubber', 'Rubber',
    'price', 'Price', 'Rubber', 'B', 'Chiang Mai market', 'THB/kg', 30], '{"dataKind":"official","season":"wet"}');
  addRow('null-market', [null, null, 'province:10', 'province:10', '10', 'province', 'Bangkok', '10', 'rice', 'Rice',
    'price', 'Price', 'Rice', 'A', null, 'THB/kg', 11], '{"dataKind":"official","season":"wet"}');
  addRow('empty-market', [null, null, 'province:10', 'province:10', '10', 'province', 'Bangkok', '10', 'rice', 'Rice',
    'price', 'Price', 'Rice', 'A', '', 'THB/kg', 11], '{"dataKind":"official","season":"wet"}');
  addRow('other-location', [null, null, 'label-2568', 'province:10:alternate', '10', 'province', 'Bangkok', '10', 'rice', 'Rice',
    'price', 'Price', 'Rice', 'A', 'Bangkok market', 'THB/kg', 12], '{"dataKind":"official","season":"wet"}');
  addRow('dry-season', [null, null, 'province:10', 'province:10', '10', 'province', 'Bangkok', '10', 'rice', 'Rice',
    'price', 'Price', 'Rice', 'A', 'Bangkok market', 'THB/kg', 13], '{"dataKind":"official","season":"dry"}');
  insert.run('single-1', 'another:monthly:province:kg', '2025-01-01', '2025-01-31', '2025-01', 'province:10', '10',
    'province', 'Bangkok', '10', 'wheat', 'Wheat', 'quantity', 'Quantity', 'Wheat', 'A', 'Bangkok market', 'kg', 50,
    '{"dataKind":"official"}', 'good', 'single-1');
  sqlite.prepare(`INSERT INTO observations VALUES
    ('private-resource','run-2','private-1',?,'private-label','private-label','private-label','province:10','10',
      'province','Bangkok','10','rice','Rice','price','Price','Rice','A','Bangkok market','THB/kg',999,
      '{"dataKind":"official","season":"wet"}','good','private-1')`).run(key);
  sqlite.prepare("UPDATE observations SET location_name=? WHERE row_key='other-location'").run('กรุงเทพฯ 🌾');
}

function sampleStats(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((total, value) => total + value, 0) / samples.length;
  const sampleVariance = samples.length > 1
    ? samples.reduce((total, value) => total + (value - mean) ** 2, 0) / (samples.length - 1)
    : 0;
  return { samplesMs: samples.map(Math.round), medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
    sampleVarianceMs2: Math.round(sampleVariance) };
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test('D1 groups by complete identity, emits v2 only for ambiguous legacy keys, and reads one identity', async () => {
  createD1Fixture();
  const listed = await listD1Series('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/series'));
  const result = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(listed);
  assert.equal(result.pagination.total, 7);
  assert.equal(result.data.length, 7);

  const keyGroups = result.data.filter(row => row.resourceId === 'resource-1' && row.sourceGrain === 'source-year-label'
    && row.unit === 'THB/kg');
  assert.equal(keyGroups.length, 6, 'same stored series_key now has six independently-identified groups');
  assert.ok(keyGroups.every(row => String(row.id).startsWith('v2.')));
  assert.equal(new Set(keyGroups.map(row => row.id)).size, keyGroups.length);
  const rice = keyGroups.find(row => row.product === 'Rice' && row.market === 'Bangkok market'
    && row.locationId === 'province:10' && row.cropCode === 'rice'
    && row.metricId === 'price' && row.observationCount === 2);
  assert.ok(rice, 'reordered dimensions and source-year/retrieval labels do not split one series');

  const decoded = decodeSeriesId(String(rice.id));
  assert.equal(decoded.kind, 'v2');
  if (decoded.kind !== 'v2') assert.fail('expected v2 identity');
  assert.equal(decoded.identity.sourceGrain, 'source-year-label');
  assert.equal(decoded.identity.dimensions.season, 'wet');
  assert.equal('sourceYearLabel' in decoded.identity.dimensions, false);
  assert.equal('sourceTimestamp' in decoded.identity.dimensions, false);

  const filtered = await listD1Series('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/series?resourceId=resource-1&product=Rubber',
  ));
  const filteredResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(filtered);
  assert.equal(filteredResult.pagination.total, 1);
  assert.ok(String(filteredResult.data[0].id).startsWith('v2.'),
    'filtering to one product does not turn a globally ambiguous legacy key into a legacy ID');

  const nullMarket = keyGroups.find(row => row.product === 'Rice' && row.market === null && row.locationId === 'province:10');
  const emptyMarket = keyGroups.find(row => row.product === 'Rice' && row.market === '' && row.locationId === 'province:10');
  assert.ok(nullMarket && emptyMarket);
  assert.notEqual(nullMarket.id, emptyMarket.id);

  await assert.rejects(
    () => listD1SeriesObservations('resource-1|' + 'price:source_year_label:unspecified:THB/kg', new URL('https://hub.test/api/v1/series/x/observations')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 409
      && (error as { code?: string }).code === 'AMBIGUOUS_SERIES_ID',
  );
  const observations = await listD1SeriesObservations(String(rice.id), new URL('https://hub.test/api/v1/series/x/observations'));
  const observationResult = await readJson<{ data: Array<Record<string, unknown>> }>(observations);
  assert.equal(observationResult.data.length, 2);
  assert.ok(observationResult.data.every(row => row.seriesId === rice.id));
  assert.deepEqual(observationResult.data.map(row => row.rowKey).sort(), ['rice-1', 'rice-2']);

  const legacy = result.data.find(row => row.id === 'resource-1|another:monthly:province:kg');
  assert.ok(legacy, 'an unambiguous, bounded legacy ID remains stable');
  const legacyObservations = await listD1SeriesObservations(String(legacy.id), new URL('https://hub.test/api/v1/series/x/observations'));
  assert.equal((await readJson<{ data: unknown[] }>(legacyObservations)).data.length, 1);

  const beforeRecords = d1Calls.length;
  const recordsResponse = await listD1Records('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/records?resourceId=resource-1&provinceCode=10&cropCode=rice&pageSize=100',
  ));
  const records = await readJson<{ data: Array<Record<string, unknown>>; pagination: { page: number; pageSize: number; total: number } }>(recordsResponse);
  assert.equal(records.pagination.total, 6);
  const riceRecord = records.data.find(row => row.rowKey === 'rice-1');
  assert.ok(riceRecord);
  assert.equal(riceRecord.seriesId, rice.id, 'records and series list expose the same follow-through ID');
  const nullMarketRecord = records.data.find(row => row.rowKey === 'null-market');
  const emptyMarketRecord = records.data.find(row => row.rowKey === 'empty-market');
  assert.ok(nullMarketRecord && emptyMarketRecord);
  assert.ok(String(nullMarketRecord.seriesId).startsWith('v2.'));
  assert.ok(String(emptyMarketRecord.seriesId).startsWith('v2.'));
  assert.notEqual(nullMarketRecord.seriesId, emptyMarketRecord.seriesId, 'null and empty market remain distinct in record IDs');
  const unicodeRecord = records.data.find(row => row.rowKey === 'other-location');
  assert.ok(unicodeRecord);
  const unicodeIdentity = decodeSeriesId(String(unicodeRecord.seriesId));
  assert.equal(unicodeIdentity.kind, 'v2');
  if (unicodeIdentity.kind !== 'v2') assert.fail('expected a reversible v2 record ID');
  assert.equal(unicodeIdentity.identity.locationName, 'กรุงเทพฯ 🌾');
  const recordQueries = d1Calls.slice(beforeRecords).filter(call => call.sql.startsWith('WITH scoped_rows AS'));
  assert.equal(recordQueries.length, 1, 'the existing records page query carries identity counts without another D1 request');
  assert.equal(d1Calls.length - beforeRecords, 3, 'records keeps the same dataset, stats, and page query count');
  assert.ok(recordQueries[0].sql.includes("run.kind='numeric' AND run.status IN ('succeeded','partial')"));
  assert.ok(recordQueries[0].sql.includes('r.active_run_id=o.run_id'));
  assert.ok(recordQueries[0].sql.includes("r.access_status='approved_public'"));
  assert.ok(recordQueries[0].sql.includes('DENSE_RANK() OVER'));
  assert.ok(recordQueries[0].sql.indexOf('DENSE_RANK() OVER') < recordQueries[0].sql.lastIndexOf('WHERE province_code=?'));
  assert.deepEqual(recordQueries[0].values.slice(0, 4), ['dataset-1', 'resource-1', '10', 'rice']);
  const recordsFollowThrough = await listD1SeriesObservations(String(riceRecord.seriesId), new URL('https://hub.test/api/v1/series/x/observations'));
  assert.equal((await readJson<{ data: unknown[] }>(recordsFollowThrough)).data.length, 2);

  const privateGatedRecords = await listD1Records('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/records?pageSize=100'));
  const privateGatedResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(privateGatedRecords);
  assert.equal(privateGatedResult.pagination.total, 8);
  assert.ok(privateGatedResult.data.every(row => row.rowKey !== 'private-1'), 'the identity CTE applies the same publication gates as records');

  const pageOne = await listD1Records('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/records?resourceId=resource-1&cropCode=rice&page=1&pageSize=2',
  ));
  const pageTwo = await listD1Records('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/records?resourceId=resource-1&cropCode=rice&page=2&pageSize=2',
  ));
  const firstPage = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number; page: number } }>(pageOne);
  const secondPage = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number; page: number } }>(pageTwo);
  assert.equal(firstPage.pagination.total, 6);
  assert.equal(secondPage.pagination.total, 6);
  assert.equal(secondPage.pagination.page, 2);
  assert.equal(new Set([...firstPage.data, ...secondPage.data].map(row => row.rowKey)).size, 4,
    'record pagination remains row-based after adding identity counts');

  const bulkInsert = sqlite.prepare(`INSERT INTO observations VALUES
    ('resource-1','run-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let index = 0; index < 1_001; index++) {
    const rowKey = 'bulk-' + index;
    bulkInsert.run(rowKey, 'bulk:monthly:province:kg', null, null, 'source-label-' + index,
      'province:10', '10', 'province', 'Bangkok', '10', 'bulk', 'Bulk', 'quantity', 'Quantity', 'Bulk', null,
      'bulk-market', 'kg', index, '{"kind":"bulk-fixture"}', 'good', rowKey);
  }
  const exportPageRows: Array<Record<string, unknown>> = [];
  for (let pageNumber = 1; pageNumber <= 10; pageNumber++) {
    const pageResponse = await listD1Records('dataset-1', new URL(
      `https://hub.test/api/v1/datasets/dataset-1/records?resourceId=resource-1&cropCode=bulk&page=${pageNumber}&pageSize=100`,
    ));
    const pageResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number; pageSize: number } }>(pageResponse);
    assert.equal(pageResult.pagination.total, 1_001);
    assert.equal(pageResult.pagination.pageSize, 100);
    assert.equal(pageResult.data.length, 100);
    exportPageRows.push(...pageResult.data);
  }
  assert.equal(exportPageRows.length, 1_000, 'ten reader pages preserve exactly 1,000 rows for the CSV export boundary');
  assert.equal(new Set(exportPageRows.map(row => row.rowKey)).size, 1_000);
  assert.ok(exportPageRows.every(row => row.seriesId === 'resource-1|bulk:monthly:province:kg'));
  const overflowPage = await listD1Records('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/records?resourceId=resource-1&cropCode=bulk&page=11&pageSize=100',
  ));
  const overflowResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(overflowPage);
  assert.equal(overflowResult.pagination.total, 1_001);
  assert.equal(overflowResult.data.length, 1, 'a page after the export cap reports the final row without truncating total');

  const longDimensions = JSON.stringify({ semanticNote: 'x'.repeat(900) });
  const addLongRow = sqlite.prepare(`INSERT INTO observations VALUES
    ('resource-1','run-1',?,'long:monthly:province:kg',NULL,NULL,NULL,'province:10','10','province','Bangkok','10',
      'rice','Rice','count','Count',?,'A',NULL,'kg',1,?,'good',?)`);
  addLongRow.run('long-a', 'Long A', longDimensions, 'long-a');
  addLongRow.run('long-b', 'Long B', longDimensions, 'long-b');
  await assert.rejects(
    () => listD1Series('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/series?product=Long%20A')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_ID_TOO_LONG',
  );

  await assert.rejects(
    () => listD1SeriesObservations('x'.repeat(1_001), new URL('https://hub.test/api/v1/series/x/observations')),
    (error: unknown) => (error as { status?: number }).status === 400,
  );

  const tieInsert = sqlite.prepare(`INSERT INTO observations VALUES
    ('resource-1','run-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let index = 0; index < 30; index += 1) {
    const rowKey = 'tie-' + String(index).padStart(2, '0');
    const market = index % 3 === 0 ? null : index % 3 === 1 ? '' : 'market-' + Math.floor(index / 3);
    tieInsert.run(rowKey, 'tie:monthly:province:kg', null, null, null,
      'province:' + String(100 + index), String(100 + index), 'province', 'Location ' + index, null,
      'crop', 'Crop', 'metric', 'Metric', 'Tie Product', index % 2 === 0 ? 'A' : 'B',
      market, 'kg', index, '{"gridLatitude":13.75,"gridLongitude":100.25}', 'good', rowKey);
  }
  const tiePageUrl = (pageNumber: number) => new URL(
    `https://hub.test/api/v1/datasets/dataset-1/series?product=Tie%20Product&page=${pageNumber}&pageSize=10`,
  );
  const tiePageOne = await listD1Series('dataset-1', tiePageUrl(1));
  const tiePageTwo = await listD1Series('dataset-1', tiePageUrl(2));
  const tiePageOneAgain = await listD1Series('dataset-1', tiePageUrl(1));
  const tieFirst = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(tiePageOne);
  const tieSecond = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(tiePageTwo);
  const tieRepeat = await readJson<{ data: Array<Record<string, unknown>> }>(tiePageOneAgain);
  const firstIds = tieFirst.data.map(row => row.id);
  const secondIds = tieSecond.data.map(row => row.id);
  assert.equal(tieFirst.pagination.total, 30);
  assert.equal(firstIds.length, 10);
  assert.equal(secondIds.length, 10);
  assert.deepEqual(tieRepeat.data.map(row => row.id), firstIds, 'repeating page one returns the same stable identities');
  assert.equal(firstIds.some(id => secondIds.includes(id)), false, 'tied scalar sort keys do not skip or repeat page rows');
  const resultQuery = d1Calls.findLast(call => call.sql.includes('FROM series_total CROSS JOIN numeric_safety LEFT JOIN paged_series'));
  assert.ok(resultQuery);
  for (const column of ['grade COLLATE BINARY NULLS FIRST', 'market COLLATE BINARY NULLS FIRST',
    'location_id COLLATE BINARY NULLS FIRST', 'crop_code COLLATE BINARY NULLS FIRST',
    'metric_id COLLATE BINARY NULLS FIRST', 'dimension_signature COLLATE BINARY']) {
    assert.ok(resultQuery.sql.includes(column), `${column} participates in the D1 total order`);
  }
  const tieEmptyPage = await listD1Series('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/series?product=Tie%20Product&page=4&pageSize=10',
  ));
  const tieEmptyResult = await readJson<{ data: unknown[]; pagination: { total: number } }>(tieEmptyPage);
  assert.deepEqual(tieEmptyResult.data, []);
  assert.equal(tieEmptyResult.pagination.total, 30, 'empty pages preserve the filtered total');

  const precisionInsert = sqlite.prepare(`INSERT INTO observations VALUES
    ('resource-1','run-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const exactIntegerFields = ['exact-integer:monthly:province:kg', null, null, null, null, null, null, null, null,
    'crop', 'Crop', 'metric', 'Metric', 'Exact Integer Product', 'A', 'market', 'kg', 1];
  precisionInsert.run('exact-integer', ...exactIntegerFields, '{"exact":9007199254740992}', 'good', 'exact-integer');
  const exactInteger = await listD1Series('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/series?product=Exact%20Integer%20Product',
  ));
  const exactIntegerResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(exactInteger);
  assert.equal(exactIntegerResult.pagination.total, 1);
  assert.equal(exactIntegerResult.data.length, 1, 'an integer with an exact JavaScript decimal round-trip remains readable');
  const exactIntegerRead = await listD1SeriesObservations(String(exactIntegerResult.data[0].id),
    new URL('https://hub.test/api/v1/series/x/observations'));
  const exactIntegerRows = await readJson<{ data: Array<Record<string, unknown>> }>(exactIntegerRead);
  assert.equal(exactIntegerRows.data.length, 1);
  assert.equal((exactIntegerRows.data[0].dimensions as Record<string, unknown>).exact, 9007199254740992,
    'the observation endpoint round-trips an exact large integer without aliasing');

  const era5Insert = sqlite.prepare(`INSERT INTO observations VALUES
    ('resource-1','run-1',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const era5Metrics = [
    { id: 'temperature', name: 'Temperature', unit: 'degree_C' },
    { id: 'precipitation', name: 'Precipitation', unit: 'mm/day' },
    { id: 'wind_speed', name: 'Wind speed', unit: 'm/s' },
  ];
  for (let grid = 0; grid < 10; grid += 1) {
    const latitude = 13.75 + grid * 0.25;
    const longitude = 100.25 + grid * 0.25;
    for (let day = 1; day <= 30; day += 1) {
      const date = `2025-01-${String(day).padStart(2, '0')}`;
      for (const metric of era5Metrics) {
        const rowKey = `era5-grid-${grid}-day-${day}-${metric.id}`;
        era5Insert.run(rowKey, 'era5:daily:grid', date, date, date, null, null, null, null, null,
          null, null, metric.id, metric.name, 'ERA5 Grid', null, null, metric.unit, day,
          `{"gridLatitude":${latitude},"gridLongitude":${longitude}}`, 'good', rowKey);
      }
    }
  }
  const era5SamplesMs: number[] = [];
  let era5QueryTimings: Array<{ elapsedMs: number; sqlStart: string }> = [];
  for (let sample = 0; sample < 3; sample += 1) {
    const started = performance.now();
    const timingOffset = d1Timings.length;
    const era5Response = await listD1Series('dataset-1', new URL(
      'https://hub.test/api/v1/datasets/dataset-1/series?product=ERA5%20Grid&page=1&pageSize=50',
    ));
    era5SamplesMs.push(performance.now() - started);
    if (sample === 2) era5QueryTimings = d1Timings.slice(timingOffset).map(call => ({
      elapsedMs: Math.round(call.elapsedMs), sqlStart: call.sql.slice(0, 90),
    }));
    const era5Result = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(era5Response);
    assert.equal(era5Result.pagination.total, 30, '10 repeated grids × 3 metrics group to 30 series across 30 days');
    assert.equal(era5Result.data.length, 30);
    assert.ok(era5Result.data.every(row => row.observationCount === 30));
  }

  const safeCandidateFields = ['safe-candidate:monthly:province:kg', null, null, null, null, null, null, null, null,
    'crop', 'Crop', 'metric', 'Metric', 'Safe Candidate Product', 'A', 'market', 'kg', 1];
  const safeCandidateCount = 20_500;
  for (let index = 1; index <= safeCandidateCount; index += 1) {
    const rowKey = 'safe-candidate-' + index;
    const latitudeToken = '13.' + String(index).padStart(6, '0') + '0';
    precisionInsert.run(rowKey, ...safeCandidateFields,
      `{"gridLatitude":${latitudeToken},"gridLongitude":100.25}`, 'good', rowKey);
  }
  const safeCandidateSamplesMs: number[] = [];
  let stressQueryTimings: Array<{ elapsedMs: number; sqlStart: string }> = [];
  for (let sample = 0; sample < 3; sample += 1) {
    const safeStart = performance.now();
    const timingOffset = d1Timings.length;
    const safeCandidatePage = await listD1Series('dataset-1', new URL(
      'https://hub.test/api/v1/datasets/dataset-1/series?product=Safe%20Candidate%20Product&page=1&pageSize=10',
    ));
    safeCandidateSamplesMs.push(performance.now() - safeStart);
    if (sample === 2) stressQueryTimings = d1Timings.slice(timingOffset).map(call => ({
      elapsedMs: Math.round(call.elapsedMs), sqlStart: call.sql.slice(0, 90),
    }));
    const safeCandidateResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(safeCandidatePage);
    assert.equal(safeCandidateResult.pagination.total, safeCandidateCount);
    assert.equal(safeCandidateResult.data.length, 10, '20,500 exact decimal candidates are checked without fetching extra pages');
  }
  const safetyRows = (globalThis as Record<string, unknown>).__seriesD1LastRows as Array<Record<string, unknown>>;
  const numericTokenBytes = Buffer.byteLength(String(safetyRows[0]?.numericTokens ?? ''), 'utf8');
  assert.ok(numericTokenBytes <= 512 * 1024, 'the guard payload remains below its bounded byte budget');
  assert.equal(safetyRows.filter(row => row.numericTokens !== '[]').length, 1,
    'the bounded numeric-token payload is returned once per page instead of repeated for every series row');
  const dataQuery = d1Calls.findLast(call => call.sql.includes('FROM series_total CROSS JOIN numeric_safety LEFT JOIN paged_series'));
  assert.ok(dataQuery);
  const plan = sqlite.prepare('EXPLAIN QUERY PLAN ' + dataQuery.sql).all(...dataQuery.values)
    .map(row => String((row as Record<string, unknown>).detail));
  if (process.env.SERIES_READER_BENCHMARK === '1') console.log(JSON.stringify({
    sqliteBenchmark: {
      era5Observations: 900,
      era5Series: 30,
      era5: sampleStats(era5SamplesMs),
      era5QueryTimings,
      stressObservations: safeCandidateCount,
      stressSeries: safeCandidateCount,
      stress: sampleStats(safeCandidateSamplesMs),
      stressQueryTimings,
      numericTokenBytes,
      dataQueryPlan: plan,
    },
  }));

  const oversizedToken = '1.' + '0'.repeat(512 * 1024);
  const oversizedRowKey = 'numeric-payload-overflow';
  precisionInsert.run(oversizedRowKey,
    'oversized:monthly:province:kg', null, null, null, null, null, null, null, null,
    'crop', 'Crop', 'metric', 'Metric', 'Overflow Product', 'A', 'market', 'kg', 1,
    `{"number":${oversizedToken}}`, 'good', oversizedRowKey);
  await assert.rejects(
    () => listD1Series('dataset-1', new URL(
      'https://hub.test/api/v1/datasets/dataset-1/series?product=Overflow%20Product',
    )),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_VALIDATION_LIMIT',
    'a real byte-bound overflow fails closed instead of silently omitting later numeric tokens',
  );
  sqlite.prepare('DELETE FROM observations WHERE row_key=?').run(oversizedRowKey);
  const precisionFields = ['precision:monthly:province:kg', null, null, null, null, null, null, null, null,
    'crop', 'Crop', 'metric', 'Metric', 'Precision Product', 'A', 'market', 'kg', 1];
  precisionInsert.run('precision-safe', ...precisionFields, '{"gridLatitude":13.75,"value":0.1}', 'good', 'precision-safe');
  precisionInsert.run('precision-lossy', ...precisionFields, '{"gridLatitude":13.75,"value":0.10000000000000001}', 'good', 'precision-lossy');
  await assert.rejects(
    () => listD1Series('dataset-1', new URL(
      'https://hub.test/api/v1/datasets/dataset-1/series?product=Safe%20Candidate%20Product&page=1&pageSize=1',
    )),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_PRECISION',
    'an unsafe token in another product outside page one is still checked before rows are returned',
  );
  await assert.rejects(
    () => listD1Series('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/series?product=Precision%20Product')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_PRECISION',
  );
  const precisionId = encodeSeriesId({
    resourceId: 'resource-1', seriesKey: 'precision:monthly:province:kg', sourceGrain: 'source-year-label',
    product: 'Precision Product', grade: 'A', market: 'market', unit: 'kg',
    locationId: null, locationCode: null, locationKind: null, locationName: null, provinceCode: null,
    cropCode: 'crop', cropName: 'Crop', metricId: 'metric', metricName: 'Metric',
    dimensions: { gridLatitude: 13.75, value: 0.1 },
  });
  await assert.rejects(
    () => listD1SeriesObservations(precisionId, new URL('https://hub.test/api/v1/series/x/observations')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_PRECISION',
  );

  sqlite.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)')
    .run('resource-2', 'dataset-1', 'run-3', 'approved_public', 1, 'source-year-label', null);
  sqlite.prepare('INSERT INTO sync_runs VALUES (?,?,?,?,?,?)')
    .run('run-3', 'resource-2', 'numeric', 'succeeded', null, 'version-3');
  const insertSharedRow = sqlite.prepare('INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const [resourceId, runId, source] of [
    ['resource-1', 'run-1', 'first'], ['resource-2', 'run-3', 'second'],
  ]) {
    insertSharedRow.run(resourceId, runId, 'shared-row-key', 'record-tie:monthly:province:kg',
      '2025-05-01', '2025-05-31', '2025-05', 'province:10', '10', 'province', 'Bangkok', '10',
      'record-tie', 'Record tie', 'count', 'Count', 'Record tie product', 'A', 'Bangkok market', 'kg', 1,
      JSON.stringify({ source }), 'good', 'shared-row-key');
  }
  const recordTiePage = (pageNumber: number) => listD1Records('dataset-1', new URL(
    `https://hub.test/api/v1/datasets/dataset-1/records?cropCode=record-tie&page=${pageNumber}&pageSize=1`,
  ));
  const tieRecordFirstPage = await recordTiePage(1);
  const tieRecordSecondPage = await recordTiePage(2);
  const tieRecordFirst = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(tieRecordFirstPage);
  const tieRecordSecond = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(tieRecordSecondPage);
  assert.equal(tieRecordFirst.pagination.total, 2);
  assert.equal(tieRecordSecond.pagination.total, 2);
  assert.deepEqual([tieRecordFirst.data[0].seriesId, tieRecordSecond.data[0].seriesId], [
    'resource-1|record-tie:monthly:province:kg', 'resource-2|record-tie:monthly:province:kg',
  ], 'record pagination uses resource_id to order duplicate row keys across resources');
  const tieRecordQuery = d1Calls.findLast(call => call.sql.includes('ORDER BY period_end DESC NULLS LAST,row_key'));
  assert.ok(tieRecordQuery?.sql.includes('ORDER BY period_end DESC NULLS LAST,row_key,resource_id'),
    'D1 records include resource_id as a total-order tie-breaker');
});

test('Postgres uses the same identity dimensions and null-safe, bound v2 lookup (query parity only)', async () => {
  const groupRows: Row[] = [
    {
      resourceId: 'resource-1', seriesKey: 'price:source_year_label:unspecified:THB/kg', sourceGrain: 'source-year-label',
      product: 'Rice', grade: 'A', market: 'Bangkok market', unit: 'THB/kg', locationId: 'province:10', locationCode: '10',
      locationKind: 'province', locationName: 'Bangkok', provinceCode: '10', cropCode: 'rice', cropName: 'Rice',
      metricId: 'price', metricName: 'Price', dimensions: { dataKind: 'official', season: 'wet' },
      observationCount: 2, identityCount: 6, from: null, to: null,
    },
  ];
  (globalThis as Record<string, unknown>).__seriesPgRows = groupRows;
  pgCalls.length = 0;
  const listed = await listDbSeries('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/series'));
  const result = await readJson<{ data: Array<Record<string, unknown>> }>(listed);
  const id = String(result.data[0].id);
  assert.ok(id.startsWith('v2.'));

  (globalThis as Record<string, unknown>).__seriesPgRows = [];
  (globalThis as Record<string, unknown>).__seriesPgCountTotal = 1;
  (globalThis as Record<string, unknown>).__seriesPgAudit = { overflowCount: 0, tokens: ['0.10000000000000001'] };
  pgCalls.length = 0;
  await assert.rejects(
    () => listDbSeries('dataset-1', new URL(
      'https://hub.test/api/v1/datasets/dataset-1/series?product=Safe&page=3&pageSize=1',
    )),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_PRECISION',
    'Postgres must audit unsafe dimensions outside the product filter even when the requested page is empty',
  );
  const pgEmptyAuditQuery = pgCalls.find(call => call.sql.includes('numeric_safety') && call.sql.includes('numericTokenOverflowCount'));
  assert.ok(pgEmptyAuditQuery);
  assert.ok(pgEmptyAuditQuery.sql.includes('jsonb_path_query'));
  assert.ok(pgEmptyAuditQuery.sql.includes('sum(octet_length(token)+3) OVER'));
  assert.ok(pgEmptyAuditQuery.sql.includes('array_agg(token'));
  assert.ok(pgEmptyAuditQuery.sql.includes('sum(octet_length(token)+3) OVER'));
  assert.ok(pgEmptyAuditQuery.sql.includes('array_agg(token'));
  assert.ok(pgEmptyAuditQuery.sql.includes('FROM identified_series WHERE product=$2'),
    'product/page selection is applied only after the global dimension audit');
  assert.ok(pgEmptyAuditQuery.sql.includes('scoped_dimensions AS MATERIALIZED'));
  (globalThis as Record<string, unknown>).__seriesPgRows = groupRows;
  (globalThis as Record<string, unknown>).__seriesPgCountTotal = null;
  (globalThis as Record<string, unknown>).__seriesPgAudit = { overflowCount: 0, tokens: [] };
  await listDbSeries('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/series'));

  const seriesQuery = pgCalls.find(call => call.sql.includes('SELECT resource_id AS "resourceId"'));
  assert.ok(seriesQuery);
  for (const column of ['o.product', 'o.grade', 'o.market', 'o.unit', 'o.location_id', 'o.location_code', 'o.location_kind',
    'o.location_name', 'o.province_code', 'o.crop_code', 'o.crop_name', 'o.metric_id', 'o.metric_name', 'r.grain']) {
    assert.ok(seriesQuery.sql.includes(column), `${column} participates in Postgres grouping`);
  }
  assert.ok(seriesQuery.sql.includes('jsonb_object_agg'));
  assert.ok(seriesQuery.sql.includes('grouped_series AS (SELECT'));
  assert.ok(seriesQuery.sql.includes("run.kind='numeric' AND run.status IN ('succeeded','partial')"),
    'Postgres uses the same numeric active-run gate as D1, including partial runs');
  assert.ok(seriesQuery.sql.includes(')::text AS dimensions'),
    'Postgres returns raw JSON text before the JavaScript number scanner runs');
  for (const column of ['grade COLLATE "C" NULLS FIRST', 'market COLLATE "C" NULLS FIRST',
    'location_id COLLATE "C" NULLS FIRST', 'dimension_signature::text COLLATE "C"']) {
    assert.ok(seriesQuery.sql.includes(column), `${column} completes the Postgres page order`);
  }
  assert.equal(seriesQuery.sql.includes('sourceTimestamp'), false, 'volatile key names are generated from the exclusion set, not interpolated data');
  assert.ok(seriesQuery.values.every(value => typeof value !== 'string' || !seriesQuery.sql.includes(value)));

  pgCalls.length = 0;
  const read = await listDbSeriesObservations(id, new URL('https://hub.test/api/v1/series/x/observations'));
  const observations = await readJson<{ data: Array<Record<string, unknown>> }>(read);
  assert.equal(observations.data.length, 1);
  assert.equal(observations.data[0].seriesId, id);
  const exactQuery = pgCalls.find(call => call.sql.includes('SELECT s.source_id AS "sourceId"'));
  assert.ok(exactQuery);
  assert.ok(exactQuery.sql.includes('IS NOT DISTINCT FROM'));
  assert.ok(exactQuery.sql.includes('::jsonb'));
  assert.equal(exactQuery.values[0], 'resource-1');
  assert.equal(exactQuery.values[1], 'price:source_year_label:unspecified:THB/kg');
  assert.equal(exactQuery.values[2], 'source-year-label');
  assert.equal(exactQuery.values.at(-1), '{"season":"wet"}');
  assert.equal(exactQuery.sql.includes('Bangkok market'), false);
  assert.equal(exactQuery.sql.includes('{"season":"wet"}'), false);
  const observationQuery = pgCalls.find(call => call.sql.startsWith('SELECT o.row_key AS "rowKey"'));
  assert.ok(observationQuery?.sql.includes('o.dimensions::text AS dimensions'),
    'Postgres observation pages preserve raw JSON number lexemes until validation');

  const pgBaseRecord = {
    ...groupRows[0], periodStart: null, periodEnd: null, periodLabel: '2568', value: 12,
    qualityStatus: 'good', sourceRowRef: 'row-1', identityCount: 6,
  };
  (globalThis as Record<string, unknown>).__seriesPgRecordRows = [
    { ...pgBaseRecord, rowKey: 'rice-1' },
    { ...pgBaseRecord, rowKey: 'null-market', market: null },
    { ...pgBaseRecord, rowKey: 'empty-market', market: '' },
    { ...pgBaseRecord, rowKey: 'unicode-location', locationId: 'province:10:alternate', locationName: 'กรุงเทพฯ 🌾' },
  ];
  pgCalls.length = 0;
  const recordResponse = await listDbRecords('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/records?resourceId=resource-1&provinceCode=10&cropCode=rice&pageSize=100',
  ));
  const recordResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(recordResponse);
  assert.equal(recordResult.data.find(row => row.rowKey === 'rice-1')?.seriesId, id,
    'Postgres records and series list expose the same follow-through ID');
  const pgNullMarket = recordResult.data.find(row => row.rowKey === 'null-market');
  const pgEmptyMarket = recordResult.data.find(row => row.rowKey === 'empty-market');
  assert.ok(pgNullMarket && pgEmptyMarket);
  assert.notEqual(pgNullMarket.seriesId, pgEmptyMarket.seriesId);
  const pgUnicode = decodeSeriesId(String(recordResult.data.find(row => row.rowKey === 'unicode-location')?.seriesId));
  assert.equal(pgUnicode.kind, 'v2');
  if (pgUnicode.kind !== 'v2') assert.fail('expected a reversible Postgres v2 record ID');
  assert.equal(pgUnicode.identity.locationName, 'กรุงเทพฯ 🌾');
  const pgRecordsQuery = pgCalls.find(call => call.sql.startsWith('WITH scoped_rows AS'));
  assert.ok(pgRecordsQuery);
  assert.equal(pgCalls.length, 3, 'Postgres adds no separate identity-count request for the records page');
  assert.ok(pgRecordsQuery.sql.includes('r.active_run_id=o.run_id'));
  assert.ok(pgRecordsQuery.sql.includes("r.access_status='approved_public'"));
  assert.ok(pgRecordsQuery.sql.includes('DENSE_RANK() OVER'));
  assert.ok(pgRecordsQuery.sql.includes('FROM identified_rows WHERE province_code=$3 AND crop_code=$4'));
  assert.deepEqual(pgRecordsQuery.values.slice(0, 4), ['dataset-1', 'resource-1', '10', 'rice']);

  (globalThis as Record<string, unknown>).__seriesPgRecordRows = [
    { ...pgBaseRecord, rowKey: 'shared-row-key', seriesKey: 'record-tie:monthly:province:kg', sourceGrain: 'monthly',
      product: 'Record tie product', cropCode: 'record-tie', periodEnd: '2025-05-31', resourceId: 'resource-1', identityCount: 1 },
    { ...pgBaseRecord, rowKey: 'shared-row-key', seriesKey: 'record-tie:monthly:province:kg', sourceGrain: 'monthly',
      product: 'Record tie product', cropCode: 'record-tie', periodEnd: '2025-05-31', resourceId: 'resource-2', identityCount: 1 },
  ];
  (globalThis as Record<string, unknown>).__seriesPgStatsTotal = 2;
  const pgRecordPage = (pageNumber: number) => listDbRecords('dataset-1', new URL(
    `https://hub.test/api/v1/datasets/dataset-1/records?cropCode=record-tie&page=${pageNumber}&pageSize=1`,
  ));
  const pgRecordFirstPage = await pgRecordPage(1);
  const pgRecordSecondPage = await pgRecordPage(2);
  const pgRecordFirst = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(pgRecordFirstPage);
  const pgRecordSecond = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(pgRecordSecondPage);
  assert.equal(pgRecordFirst.pagination.total, 2);
  assert.equal(pgRecordSecond.pagination.total, 2);
  assert.deepEqual([pgRecordFirst.data[0].seriesId, pgRecordSecond.data[0].seriesId], [
    'resource-1|record-tie:monthly:province:kg', 'resource-2|record-tie:monthly:province:kg',
  ], 'Postgres record pagination keeps same-key rows from separate resources on distinct pages');
  const pgTieRecordQuery = pgCalls.findLast(call => call.sql.startsWith('WITH scoped_rows AS'));
  assert.ok(pgTieRecordQuery?.sql.includes('ORDER BY period_end DESC NULLS LAST,row_key,resource_id'),
    'Postgres records include resource_id as a total-order tie-breaker');
  (globalThis as Record<string, unknown>).__seriesPgStatsTotal = 7;

  (globalThis as Record<string, unknown>).__seriesPgRows = [{
    ...groupRows[0], product: 'Rubber', grade: 'B', market: null, cropCode: 'rubber', cropName: 'Rubber',
    locationId: 'province:11', locationCode: '11', locationName: 'Chiang Mai', provinceCode: '11', identityCount: 6,
  }];
  pgCalls.length = 0;
  const filtered = await listDbSeries('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/series?resourceId=resource-1&product=Rubber',
  ));
  const filteredResult = await readJson<{ data: Array<Record<string, unknown>>; pagination: { total: number } }>(filtered);
  assert.equal(filteredResult.pagination.total, 1);
  assert.ok(String(filteredResult.data[0].id).startsWith('v2.'));
  const filteredSeriesQuery = pgCalls.find(call => call.sql.includes('SELECT resource_id AS "resourceId"'));
  assert.ok(filteredSeriesQuery);
  assert.ok(filteredSeriesQuery.sql.includes('FROM identified_series WHERE product=$3'),
    'product filtering happens after global ambiguity counting');
  assert.deepEqual(filteredSeriesQuery.values, ['dataset-1', 'resource-1', 'Rubber', 25, 0]);

  pgCalls.length = 0;
  await assert.rejects(
    () => listDbSeriesObservations('resource-1|price:source_year_label:unspecified:THB/kg', new URL('https://hub.test/api/v1/series/x/observations')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 409
      && (error as { code?: string }).code === 'AMBIGUOUS_SERIES_ID',
  );

  (globalThis as Record<string, unknown>).__seriesPgRows = [{
    ...groupRows[0], dimensions: '{"gridLatitude":0.10000000000000001}',
  }];
  await assert.rejects(
    () => listDbSeries('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/series')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_PRECISION',
  );
  (globalThis as Record<string, unknown>).__seriesPgObsDimensions = '{"gridLatitude":0.10000000000000001}';
  await assert.rejects(
    () => listDbSeriesObservations(id, new URL('https://hub.test/api/v1/series/x/observations')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_PRECISION',
  );

  (globalThis as Record<string, unknown>).__seriesPgRows = groupRows;
  (globalThis as Record<string, unknown>).__seriesPgAudit = { overflowCount: 1, tokens: [] };
  pgCalls.length = 0;
  await assert.rejects(
    () => listDbSeries('dataset-1', new URL('https://hub.test/api/v1/datasets/dataset-1/series?product=Safe')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 422
      && (error as { code?: string }).code === 'SERIES_NUMERIC_VALIDATION_LIMIT',
    'Postgres fails closed when the globally audited token payload exceeds its byte cap',
  );
  (globalThis as Record<string, unknown>).__seriesPgRows = groupRows;
  (globalThis as Record<string, unknown>).__seriesPgAudit = { overflowCount: 0, tokens: ['13.75', '100.25', '0.1'] };
  (globalThis as Record<string, unknown>).__seriesPgCountTotal = null;
  const safeDecimalPgResponse = await listDbSeries('dataset-1', new URL(
    'https://hub.test/api/v1/datasets/dataset-1/series?product=Safe',
  ));
  assert.equal(safeDecimalPgResponse.status, 200, 'safe coordinate decimals remain valid in the Postgres audit');
});

for (const [backend, records, series, observations] of [
  ['D1', listD1Records, listD1Series, listD1SeriesObservations],
  ['Postgres stub', listDbRecords, listDbSeries, listDbSeriesObservations],
] as const) {
  test(`${backend} reports completeness from selected public numeric runs`, async t => {
    const prefix = backend === 'D1' ? 'd1-status' : 'pg-status';
    const partialDataset = prefix + '-partial';
    const mixedDataset = prefix + '-mixed';
    const gatedDataset = prefix + '-gated';
    const partialResource = prefix + '-partial-resource';
    const succeededResource = prefix + '-succeeded-resource';
    const mixedPartialResource = prefix + '-mixed-partial-resource';
    const insertDataset = sqlite.prepare('INSERT INTO datasets VALUES (?,\'source-1\',\'approved_public\')');
    for (const id of [partialDataset, mixedDataset, gatedDataset]) insertDataset.run(id);
    const resourceFixtures: Array<[string, string, string, number, string, string]> = [
      [partialResource, partialDataset, 'approved_public', 1, 'numeric', 'partial'],
      [succeededResource, mixedDataset, 'approved_public', 1, 'numeric', 'succeeded'],
      [mixedPartialResource, mixedDataset, 'approved_public', 1, 'numeric', 'partial'],
    ];
    for (const id of [partialDataset, mixedDataset, gatedDataset]) {
      for (const [label, access, approved, kind, status] of [
        ['private', 'private', 1, 'numeric', 'partial'],
        ['unapproved', 'approved_public', 0, 'numeric', 'partial'],
        ['catalog-succeeded', 'approved_public', 1, 'catalog', 'succeeded'],
        ['catalog-partial', 'approved_public', 1, 'catalog', 'partial'],
        ['failed', 'approved_public', 1, 'numeric', 'failed'],
      ] as const) resourceFixtures.push([id + '-' + label, id, access, approved, kind, status]);
    }
    for (const [resourceId, id, access, approved, kind, status] of resourceFixtures) {
      sqlite.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?)')
        .run(resourceId, id, resourceId + '-run', access, approved, 'daily', null);
      sqlite.prepare('INSERT INTO sync_runs VALUES (?,?,?,?,?,?)')
        .run(resourceId + '-run', resourceId, kind, status, null, resourceId + '-version');
      sqlite.prepare('INSERT INTO observations (resource_id,run_id,row_key,series_key,period_start,period_end,' +
        'product,metric_id,metric_name,unit,value,dimensions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(resourceId, resourceId + '-run', resourceId + '-row', 'status-series', '2026-01-01', '2026-01-01',
          status === 'partial' ? 'Partial' : 'Succeeded', 'count', 'Count', 'kg', 1, '{}');
    }
    const globals = globalThis as Record<string, unknown>;
    globals.__seriesPgStatusFixture = backend === 'Postgres stub';
    globals.__seriesPgAudit = { overflowCount: 0, tokens: [] };
    type Result = { data: Row[]; meta: { availability: string; completeness: string; access: string; warnings: string[] };
      pagination: { total: number } };
    const read = async (reader: typeof records, id: string, query: string, total: number) => {
      globals.__seriesPgCountTotal = total;
      return readJson<Result>(await reader(id, new URL('https://hub.test/read' + query)));
    };
    const check = (result: Result, availability: string, complete: string, access: string, total: number) => {
      assert.equal(result.meta.availability, availability);
      assert.equal(result.meta.completeness, complete);
      assert.equal(result.meta.access, access);
      assert.equal(result.pagination.total, total);
      if (complete === 'partial') {
        assert.deepEqual(result.meta.warnings, ['ชุดนี้มีข้อมูลตัวอย่างบางส่วน ยังไม่ครอบคลุมข้อมูลทั้งหมดของทรัพยากร']);
      } else if (access === 'approved_public') assert.deepEqual(result.meta.warnings, []);
      else assert.ok(result.meta.warnings.length > 0);
    };
    try {
      await t.test('partial-only dataset is ready, partial, approved public, with a warning', async () => {
        for (const reader of [records, series]) {
          const result = await read(reader, partialDataset, '', 1);
          check(result, 'ready', 'partial', 'approved_public', 1);
          assert.equal(result.data.length, 1);
        }
        const result = await read(observations, partialResource + '|status-series', '', 1);
        check(result, 'ready', 'partial', 'approved_public', 1);
        assert.equal(result.data.length, 1);
      });
      await t.test('mixed runs retain partial status only when partial rows are selected', async () => {
        for (const reader of [records, series]) {
          check(await read(reader, mixedDataset, '', 2), 'ready', 'partial', 'approved_public', 2);
          check(await read(reader, mixedDataset, '?resourceId=' + mixedPartialResource, 1),
            'ready', 'partial', 'approved_public', 1);
          check(await read(reader, mixedDataset, '?resourceId=' + succeededResource, 1),
            'ready', 'complete', 'approved_public', 1);
        }
        check(await read(series, mixedDataset, '?product=Partial&metric=count', 1), 'ready', 'partial', 'approved_public', 1);
        check(await read(series, mixedDataset, '?product=Succeeded&metric=Count', 1), 'ready', 'complete', 'approved_public', 1);
        for (const [resourceId, complete] of [[mixedPartialResource, 'partial'], [succeededResource, 'complete']]) {
          check(await read(observations, resourceId + '|status-series', '', 1), 'ready', complete, 'approved_public', 1);
        }
      });
      await t.test('private, unapproved, catalog and failed runs contribute no rows or numeric status', async () => {
        for (const reader of [records, series]) {
          const result = await read(reader, gatedDataset, '', 0);
          check(result, 'metadata_only', 'unknown', 'metadata_only', 0);
          assert.deepEqual(result.data, []);
        }
        for (const [resourceId, id] of resourceFixtures.filter(([, id]) => id === mixedDataset).slice(2)) {
          for (const reader of [records, series]) {
            const result = await read(reader, id, '?resourceId=' + resourceId, 0);
            check(result, 'empty', 'partial', 'approved_public', 0);
            assert.deepEqual(result.data, []);
          }
          await assert.rejects(() => observations(resourceId + '|status-series', new URL('https://hub.test/read')),
            (error: unknown) => (error as { code?: string }).code === 'SERIES_NOT_FOUND');
        }
        sqlite.prepare('UPDATE sync_runs SET status=\'succeeded\' WHERE resource_id=?').run(mixedPartialResource);
        for (const reader of [records, series]) {
          check(await read(reader, mixedDataset, '', 2), 'ready', 'complete', 'approved_public', 2);
          const result = await read(reader, mixedDataset, '?resourceId=missing', 0);
          check(result, 'empty', 'complete', 'approved_public', 0);
          assert.deepEqual(result.data, []);
        }
        sqlite.prepare('UPDATE sync_runs SET status=\'partial\' WHERE resource_id=?').run(mixedPartialResource);
      });
      await t.test('empty matches fall back to dataset status; empty series dates retain the resource status', async () => {
        for (const reader of [records, series]) {
          const query = reader === records ? '?from=2030-01-01' : '?product=Missing';
          for (const id of [partialDataset, mixedDataset]) {
            const result = await read(reader, id, query, 0);
            check(result, 'empty', 'partial', 'approved_public', 0);
            assert.deepEqual(result.data, []);
          }
          check(await read(reader, mixedDataset, '?resourceId=missing', 0), 'empty', 'partial', 'approved_public', 0);
        }
        for (const [resourceId, complete] of [[partialResource, 'partial'], [succeededResource, 'complete']]) {
          const result = await read(observations, resourceId + '|status-series', '?from=2030-01-01', 0);
          check(result, 'empty', complete, 'approved_public', 0);
          assert.deepEqual(result.data, []);
        }
      });
      await t.test('blank filters are unset and empty pages preserve the selected status', async () => {
        check(await read(records, partialDataset, '?resourceId=&from=&to=&cropCode=&provinceCode=', 1),
          'ready', 'partial', 'approved_public', 1);
        check(await read(series, partialDataset, '?resourceId=&product=&metric=', 1),
          'ready', 'partial', 'approved_public', 1);
        for (const reader of [records, series]) {
          const result = await read(reader, partialDataset, '?page=2&pageSize=1', 1);
          check(result, 'ready', 'partial', 'approved_public', 1);
          assert.deepEqual(result.data, []);
        }
      });
    } finally {
      globals.__seriesPgStatusFixture = false;
      globals.__seriesPgCountTotal = null;
    }
  });
}
