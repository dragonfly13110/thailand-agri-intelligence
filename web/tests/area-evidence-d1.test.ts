import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

type QueryCall = { sql: string; values: SQLInputValue[] };

const sqlite = new DatabaseSync(':memory:');
const calls: QueryCall[] = [];
(globalThis as Record<string, unknown>).__areaSqlite = sqlite;
(globalThis as Record<string, unknown>).__areaCalls = calls;

const STUBS: Record<string, string> = {
  'server-only': 'export default undefined;',
  './d1': [
    'export async function queryD1(sql, params = []) { globalThis.__areaCalls.push({ sql, values: params }); return globalThis.__areaSqlite.prepare(sql).all(...params); }',
    'export async function countD1(sql, params = []) { globalThis.__areaCalls.push({ sql, values: params }); return Number(globalThis.__areaSqlite.prepare(sql).get(...params)?.total ?? 0); }',
    'export async function getD1() { return null; }',
    'export async function hasD1Catalog() { return false; }',
  ].join('\n'),
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

const { listD1AreaEvidence } = await import('../lib/hub/d1-numeric-repository.ts');

type AreaResponse = {
  data: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  pagination: { page: number; pageSize: number; total: number };
};

function createFixture() {
  sqlite.exec(`
    CREATE TABLE datasets (dataset_id TEXT,title TEXT,source_id TEXT,metadata_access_status TEXT,category TEXT);
    CREATE TABLE sources (source_id TEXT,source_name TEXT,metadata_access_status TEXT,freshness_days INTEGER);
    CREATE TABLE resources (resource_id TEXT,dataset_id TEXT,active_run_id TEXT,access_status TEXT,
      project_publication_approved INTEGER,grain TEXT);
    CREATE TABLE sync_runs (run_id TEXT,resource_id TEXT,kind TEXT,status TEXT,completed_at TEXT);
    CREATE TABLE observations (resource_id TEXT,run_id TEXT,row_key TEXT,province_code TEXT,period_end TEXT);
    CREATE TABLE locations (location_id TEXT);
    INSERT INTO datasets VALUES ('dataset-crop','Crop evidence','source-1','approved_public','crop');
    INSERT INTO datasets VALUES ('dataset-water','Water evidence','source-2','approved_public','water');
    INSERT INTO datasets VALUES ('dataset-private','Private evidence','source-1','approved_public','crop');
    INSERT INTO sources VALUES ('source-1','Source One','approved_public',30);
    INSERT INTO sources VALUES ('source-2','Source Two','approved_public',30);
    INSERT INTO resources VALUES ('resource-1','dataset-crop','run-1','approved_public',1,'province');
    INSERT INTO resources VALUES ('resource-2','dataset-water','run-2','approved_public',1,'station');
    INSERT INTO resources VALUES ('resource-private','dataset-private','run-3','private',0,'province');
    INSERT INTO sync_runs VALUES ('run-1','resource-1','numeric','succeeded','2026-10-30T00:00:00Z');
    INSERT INTO sync_runs VALUES ('run-2','resource-2','numeric','partial','2026-10-29T12:00:00Z');
    INSERT INTO sync_runs VALUES ('run-3','resource-private','numeric','succeeded','2026-10-30T00:00:00Z');
    INSERT INTO observations VALUES ('resource-1','run-1','crop-1','10','2568-01-31');
    INSERT INTO observations VALUES ('resource-1','run-1','crop-2','10','2568-12-31');
    INSERT INTO observations VALUES ('resource-1','run-1','other-province','73','2568-02-28');
    INSERT INTO observations VALUES ('resource-2','run-2','water-1','73','2568-03-31');
    INSERT INTO observations VALUES ('resource-private','run-3','private-1','10','2569-12-31');
  `);
}

test('D1 area evidence groups published datasets per province and honours the category filter', async () => {
  createFixture();
  const response = await listD1AreaEvidence('10', new URL('https://hub.test/api/v1/areas/10'));
  const result = await response.json() as AreaResponse;
  assert.equal(result.pagination.total, 1);
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0], {
    datasetId: 'dataset-crop', title: 'Crop evidence', sourceId: 'source-1', sourceName: 'Source One',
    category: 'crops', evidenceCount: 2, grain: 'province', dataAsOf: '2568-12-31',
    lastSuccessAt: '2026-10-30T00:00:00Z',
  });
  assert.equal(result.meta.availability, 'ready');
  assert.equal(result.meta.access, 'approved_public');
  assert.deepEqual(result.meta.sourceIds, ['source-1']);
  assert.equal(result.meta.runtimeMode, 'database');

  const water = await listD1AreaEvidence('73', new URL('https://hub.test/api/v1/areas/73?category=water'));
  const waterResult = await water.json() as AreaResponse;
  assert.equal(waterResult.pagination.total, 1);
  assert.equal(waterResult.data[0].datasetId, 'dataset-water');
  assert.equal(waterResult.data[0].category, 'water');
  assert.equal(waterResult.data[0].evidenceCount, 1);

  const cropOnly = await listD1AreaEvidence('73', new URL('https://hub.test/api/v1/areas/73?category=crops'));
  const cropOnlyResult = await cropOnly.json() as AreaResponse;
  assert.equal(cropOnlyResult.pagination.total, 1);
  assert.equal(cropOnlyResult.data[0].datasetId, 'dataset-crop');
  assert.equal(cropOnlyResult.data[0].evidenceCount, 1, 'evidence counts only rows for the requested province');

  await assert.rejects(
    () => listD1AreaEvidence('73', new URL('https://hub.test/api/v1/areas/73?category=unknown')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 400
      && (error as { code?: string }).code === 'INVALID_QUERY',
  );
  await assert.rejects(
    () => listD1AreaEvidence('99', new URL('https://hub.test/api/v1/areas/99')),
    (error: unknown) => (error as { status?: number; code?: string }).status === 400
      && (error as { code?: string }).code === 'INVALID_ID',
  );
  assert.ok(calls.every(call => call.sql.includes("r.access_status='approved_public'") || call.sql.includes('pragma')),
    'every evidence query keeps the publication gate');
});
