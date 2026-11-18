import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

/**
 * A province page now asks D1 for only its own province, but the published province
 * of an ERA5 grid row lives inside the `dimensions` JSON, so the seek stops at
 * `(resource_id, run_id)` and the engine still examines every row of that batch —
 * 3,234 rows for one ERA5 week — before the province filter applies. This test
 * applies the real D1 migration files to a throwaway SQLite database, captures the
 * statement the governed reader actually issues, and reads its query plan: the new
 * index has to make the province expression part of the seek, and the rows returned
 * must not change. No D1 token and no network.
 */
const ERA5 = 'https://archive-api.open-meteo.com/v1/archive';
const PROVINCE_COUNT = 77;
const DAY_COUNT = 7;
const METRICS = ['precip_mm', 't2m_mean_c', 't2m_max_c', 't2m_min_c', 'rh2m_pct', 'wind_speed_ms'];

const db = new DatabaseSync(':memory:');
const calls: { sql: string; values: unknown[] }[] = [];
(globalThis as Record<string, unknown>).__indexProbeSqlite = db;
(globalThis as Record<string, unknown>).__indexProbeCalls = calls;

const STUBS: Record<string, string> = {
  'server-only': 'export default undefined;',
  './d1': [
    'export async function queryD1(sql, params = []) { globalThis.__indexProbeCalls.push({ sql, values: params }); return globalThis.__indexProbeSqlite.prepare(sql).all(...params); }',
    'export async function countD1(sql, params = []) { globalThis.__indexProbeCalls.push({ sql, values: params }); return Number(globalThis.__indexProbeSqlite.prepare(sql).get(...params)?.total ?? 0); }',
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

function migration(name: string): string {
  return readFileSync(new URL('../../db/cloudflare/' + name, import.meta.url), 'utf8');
}

/** The published batch: every province's grid point for a full seven-day window. */
function seedBatch() {
  db.exec(migration('0001_hub.sql'));
  db.exec(migration('0002_observation_extensions.sql'));
  db.exec(
    "INSERT INTO sources (source_id,source_name,base_url,connector_kind,metadata_access_status,freshness_days) " +
      "VALUES ('open-meteo','Open-Meteo','https://open-meteo.com/','http','approved_public',7)",
  );
  db.exec(
    "INSERT INTO datasets (dataset_id,source_id,source_dataset_id,title,source_url,metadata_access_status,category) " +
      "VALUES ('era5-archive','open-meteo','era5-archive','ERA5 daily archive','https://open-meteo.com/','approved_public','weather')",
  );
  db.exec(
    "INSERT INTO resources (resource_id,dataset_id,source_resource_id,name,resource_url,grain,access_status," +
      "project_publication_approved,source_updated_at) " +
      `VALUES ('${ERA5}','era5-archive','era5','ERA5 daily archive','${ERA5}','grid_point','approved_public',1,'2026-10-26T00:00:00Z')`,
  );
  db.exec(
    "INSERT INTO sync_runs (run_id,source_id,resource_id,kind,status,adapter_version,records_read,records_written," +
      "source_retrieved_at,completed_at,payload_sha256) " +
      `VALUES ('run-era5','open-meteo','${ERA5}','numeric','succeeded','open-meteo/1.0',` +
      `${PROVINCE_COUNT * DAY_COUNT * METRICS.length},${PROVINCE_COUNT * DAY_COUNT * METRICS.length},` +
      "'2026-10-26T00:00:00Z','2026-10-26T00:30:00Z','sha-era5')",
  );
  // The writer publishes first and only then flips the pointer, same order as D1.
  db.exec("UPDATE resources SET active_run_id='run-era5' WHERE resource_id='" + ERA5 + "'");

  const location = db.prepare(
    'INSERT INTO locations (location_id,source_id,kind,native_code,name,province_code) VALUES (?,?,?,?,?,?)',
  );
  const insert = db.prepare(
    'INSERT INTO observations (resource_id,run_id,row_key,series_key,period_start,period_end,location_id,location_code,' +
      "location_kind,metric_id,value,dimensions,quality_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  for (let index = 0; index < PROVINCE_COUNT; index += 1) {
    const code = String(10 + index).padStart(2, '0');
    location.run(`open-meteo:era5:${code}`, 'open-meteo', 'grid', code, 'จุดกริด ' + code, null);
    for (let day = 0; day < DAY_COUNT; day += 1) {
      const date = '2026-10-' + String(18 + day).padStart(2, '0');
      for (const metric of METRICS) {
        insert.run(
          ERA5,
          'run-era5',
          `${code}-${date}-${metric}`,
          `${ERA5}|${code}-${date}-${metric}`,
          date,
          date,
          `open-meteo:era5:${code}`,
          code,
          'grid',
          metric,
          day + index,
          JSON.stringify({ provinceCode: code, provinceNameTh: 'จังหวัด ' + code }),
          'good',
        );
      }
    }
  }
}

/** The scoped statement the governed reader issues for one province page. */
function scopedProvinceSelect(): { sql: string; values: unknown[] } {
  const select = calls
    .filter((call) => call.sql.includes('FROM observations') && /json_extract\(o\.dimensions/.test(call.sql))
    .at(-1);
  assert.ok(select, 'the province read must push the province scope into SQL');
  return select;
}

function planFor(select: { sql: string; values: unknown[] }): string {
  const rows = db
    .prepare('EXPLAIN QUERY PLAN ' + select.sql)
    .all(...(select.values as (string | number | null)[])) as Record<string, unknown>[];
  return rows.map((row) => String(row.detail ?? '')).join('\n');
}

test('the province scope index turns the batch scan into a seek without changing the rows', async () => {
  seedBatch();
  calls.length = 0;

  const before = await readWeatherSnapshot({ provinceCode: '73' });
  const select = scopedProvinceSelect();
  const beforePlan = planFor(select);
  assert.equal(before.observationRows, DAY_COUNT * METRICS.length, 'one province page loads its own 42 rows, not the 3,234-row batch');

  assert.match(
    beforePlan,
    /SEARCH o USING INDEX sqlite_autoindex_observations_1 \(resource_id=\? AND run_id=\?\)/,
    'the batch seek stops at one resource and run',
  );
  assert.doesNotMatch(
    beforePlan,
    /observations_province_scope_idx/,
    'without the migration every row of the resource is examined and the province JSON is only filtered afterwards',
  );

  db.exec(migration('0007_observations_province_scope_idx.sql'));
  db.exec(migration('0007_observations_province_scope_idx.sql')); // re-applying a migration must stay safe

  const afterPlan = planFor(select);
  assert.match(
    afterPlan,
    /SEARCH o USING INDEX observations_province_scope_idx \(resource_id=\? AND run_id=\? AND <expr>=\?\)/,
    'the province expression has to become part of the seek, not a filter over the whole resource',
  );

  // The identical statement, run again now that the index exists. The page read itself would
  // be answered from the publish-window memo, so the walk is executed directly here.
  const afterRows = db.prepare(select.sql).all(...(select.values as (string | number | null)[]));
  assert.equal(afterRows.length, before.observationRows, 'an index must not change the published rows');
  assert.deepEqual(
    [...new Set(afterRows.map((row) => String(row.locationCode)))],
    ['73'],
    'the scope still returns exactly the requested province',
  );
});
