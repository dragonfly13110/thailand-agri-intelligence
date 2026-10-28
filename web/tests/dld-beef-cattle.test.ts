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
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const dld = await import('../lib/hub/dld-beef-cattle.ts');
const route = await import('../app/api/v1/livestock/beef-cattle/route.ts');
const origin = 'http://hub.local';

const baseMeta: import('../lib/hub/types.ts').ApiMeta = {
  availability: 'ready',
  freshness: 'fresh',
  completeness: 'complete',
  access: 'approved_public',
  sourceIds: ['dld'],
  retrievedAt: '2026-10-28T03:05:00Z',
  sourceRetrievedAt: '2026-10-28T03:00:00Z',
  dataAsOf: null,
  sourceUpdatedAt: '2026-10-27T02:00:00Z',
  datasetVersion: 'payload-sha-1',
  warnings: [],
  runtimeMode: 'database',
};

type RowOptions = {
  year?: number;
  provinceCode?: string;
  value?: number | null;
  revisionId?: string | null;
  periodLabel?: string | null;
};

function row({ year = 2564, provinceCode = '10', value = 125, revisionId = 'dld-rev-1', periodLabel }: RowOptions = {}) {
  return {
    resourceId: dld.DLD_BEEF_CATTLE_RESOURCE_ID,
    runId: 'run-1',
    runStatus: 'succeeded',
    rowKey: `dld-beef-cattle:${year}:${provinceCode}`,
    seriesKey: 'beef_cattle_count:source_year_label:province:ตัว',
    sourceId: 'dld',
    datasetId: dld.DLD_BEEF_CATTLE_DATASET_ID,
    adapterVersion: 'dld-beef-cattle/1',
    payloadSha256: 'payload-sha-1',
    sourceRetrievedAt: '2026-10-28T03:00:00Z',
    runCompletedAt: '2026-10-28T03:01:00Z',
    observedAt: null,
    periodStart: null,
    periodEnd: null,
    periodLabel: periodLabel ?? `พ.ศ. ${year}`,
    locationId: `dld:province:${provinceCode}`,
    locationCode: provinceCode,
    locationKind: 'province',
    locationName: 'กรุงเทพมหานคร',
    provinceCode,
    cropCode: null,
    cropName: null,
    metricId: 'beef_cattle_count',
    metricName: 'จำนวนโคเนื้อ',
    product: 'จำนวนโคเนื้อ รายจังหวัด กรมปศุสัตว์',
    grade: null,
    market: null,
    unit: 'ตัว',
    value,
    dimensions: { sourceYearBe: year, referenceYearConvention: 'unverified' },
    qualityStatus: value === null ? 'missing' : 'good',
    quality: { revisionId },
    sourceRowRef: `native-${provinceCode}-${year}`,
  };
}

test('annual livestock mapping keeps source year, nulls, zero, and provenance', () => {
  const payload = dld.buildDldBeefCattleEnvelope([
    row({ year: 2564, value: null, revisionId: 'rev-1' }),
    row({ year: 2565, provinceCode: '11', value: 0, revisionId: 'rev-2' }),
  ], baseMeta);

  assert.deepEqual(payload.data.availableSourceYearsBe, [2565, 2564]);
  assert.equal(payload.data.rowCount, 2);
  assert.equal(payload.data.rows[0].value, null);
  assert.equal(payload.data.rows[1].value, 0);
  assert.deepEqual(payload.data.sourceRevisionIds, ['rev-1', 'rev-2']);
  assert.equal(payload.data.rows[0].sourceRowRef, 'native-10-2564');
  assert.equal(payload.data.referenceYearConvention, 'unverified');
  assert.equal(payload.data.sourceLicenseStatus, 'unverified');
  assert.equal(payload.data.publicationAuthorization, 'project_owner_instruction');
  assert.equal(payload.meta.dataAsOf, null);
});

test('year filtering uses sourceYearBe and a missing year is an empty result', () => {
  const rows = [row({ year: 2564 }), row({ year: 2565, provinceCode: '11' })];
  const selected = dld.buildDldBeefCattleEnvelope(rows, baseMeta, 2565);
  assert.deepEqual(selected.data.rows.map(item => item.sourceYearBe), [2565]);
  assert.equal(selected.data.selectedSourceYearBe, 2565);

  const missing = dld.buildDldBeefCattleEnvelope(rows, baseMeta, 2568);
  assert.equal(missing.meta.availability, 'empty');
  assert.equal(missing.data.rowCount, 0);
  assert.ok(missing.meta.warnings.some(item => item.includes('ไม่พบแถว')));
  assert.equal(missing.meta.dataAsOf, null);
});

test('metadata-only and empty states remain distinct', () => {
  const metadataOnly = dld.buildDldBeefCattleEnvelope([], {
    ...baseMeta, availability: 'metadata_only', access: 'metadata_only',
  });
  const empty = dld.buildDldBeefCattleEnvelope([], {
    ...baseMeta, availability: 'empty', access: 'approved_public',
  });
  assert.equal(metadataOnly.meta.availability, 'metadata_only');
  assert.equal(empty.meta.availability, 'empty');
  assert.notEqual(metadataOnly.meta.access, empty.meta.access);
});

test('invalid annual rows fail closed and do not acquire a fabricated date', () => {
  assert.throws(() => dld.buildDldBeefCattleEnvelope([
    row({ periodLabel: 'พ.ศ. 2564', year: 2564, value: 3 }),
  ].map(item => ({ ...item, periodStart: '2021-01-01', observedAt: '2021-01-01' })), baseMeta),
  error => typeof error === 'object' && error !== null && 'code' in error
    && error.code === 'DLD_SOURCE_YEAR_CONTRACT_INVALID');
  assert.throws(() => dld.buildDldBeefCattleEnvelope([row({ year: 10000 })], baseMeta),
    error => typeof error === 'object' && error !== null && 'code' in error
      && error.code === 'DLD_SOURCE_YEAR_CONTRACT_INVALID');
});

test('beef-cattle API accepts source-year labels and rejects date filters', async () => {
  const invalidYear = await route.GET(new Request(new URL('/api/v1/livestock/beef-cattle?sourceYearBe=24x4', origin)));
  assert.equal(invalidYear.status, 400);
  const dateFilter = await route.GET(new Request(new URL('/api/v1/livestock/beef-cattle?from=2021-01-01', origin)));
  assert.equal(dateFilter.status, 400);
});

test('beef-cattle API pins D1 metadata, page rows, revision, and run identity', async () => {
  const sourceRows = Array.from({ length: 501 }, (_, index) => ({
    ...row({
      year: index === 500 ? 2565 : 2564,
      provinceCode: index % 2 === 0 ? '10' : '11',
      value: index === 500 ? 0 : index,
      revisionId: 'dld-rev-1',
    }),
    rowKey: `dld-cattle-row-${index}`,
    sourceRowRef: `native-${index}`,
  }));
  const asGenericRow = (item: ReturnType<typeof row>) => ({
    resourceId: item.resourceId,
    runId: item.runId,
    runStatus: item.runStatus,
    rowKey: item.rowKey,
    seriesId: `${item.resourceId}|${item.seriesKey}`,
    sourceId: item.sourceId,
    datasetId: item.datasetId,
    adapterVersion: item.adapterVersion,
    payloadSha256: item.payloadSha256,
    sourceRetrievedAt: item.sourceRetrievedAt,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    observedAt: item.observedAt,
    periodLabel: item.periodLabel,
    locationId: item.locationId,
    locationCode: item.locationCode,
    locationKind: item.locationKind,
    locationName: item.locationName,
    provinceCode: item.provinceCode,
    cropCode: item.cropCode,
    cropName: item.cropName,
    metricId: item.metricId,
    metricName: item.metricName,
    product: item.product,
    grade: item.grade,
    market: item.market,
    unit: item.unit,
    value: item.value,
    dimensions: item.dimensions,
    qualityStatus: item.qualityStatus,
    quality: item.quality,
    sourceRowRef: item.sourceRowRef,
  });
  const snapshot = {
    runId: 'run-1',
    runStatus: 'succeeded',
    sourceRevisionId: 'dld-rev-1',
    sourceRetrievedAt: baseMeta.sourceRetrievedAt,
    payloadSha256: baseMeta.datasetVersion,
    adapterVersion: 'dld-beef-cattle/1',
    rowCount: sourceRows.length,
    revisionCount: 1,
    missingRevisionCount: 0,
    minimumRevisionId: 'dld-rev-1',
    maximumRevisionId: 'dld-rev-1',
  };
  let snapshotResult: Record<string, unknown> = { ...snapshot };
  let snapshotError = false;
  let pageCalls = 0;
  let changeAfterFirstPage: { rows: ReturnType<typeof row>[]; snapshot: Record<string, unknown> } | null = null;
  let activeRows: ReturnType<typeof row>[] = sourceRows;
  const database = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { bound = values; return statement; },
        async all() {
          if (snapshotError && sql.includes('run.source_revision_id AS sourceRevisionId')) {
            throw new Error('simulated D1 read error');
          }
          if (sql.includes('run.source_revision_id AS sourceRevisionId')) {
            assert.ok(sql.includes('run.run_id=r.active_run_id'));
            assert.ok(sql.includes("json_extract(o.quality,'$.revisionId')"));
            assert.ok(sql.includes('run.source_retrieved_at AS sourceRetrievedAt'));
            return { results: [snapshotResult] };
          }
          if (sql.includes('FROM datasets d JOIN sources s')) {
            return { results: [{ sourceId: 'dld', freshnessDays: 30, hasNumeric: 1, hasPartial: 0 }] };
          }
          if (sql.includes('max(o.period_end) AS dataAsOf')) {
            return { results: [{
              total: activeRows.length,
              dataAsOf: null,
              sourceUpdatedAt: baseMeta.sourceUpdatedAt,
              sourceRetrievedAt: baseMeta.sourceRetrievedAt,
              datasetVersion: baseMeta.datasetVersion,
            }] };
          }
          if (sql.startsWith('WITH scoped_rows AS')) {
            assert.ok(sql.includes('DENSE_RANK() OVER'));
            assert.ok(sql.includes('r.run_id=o.run_id') || sql.includes('r.active_run_id=o.run_id'));
            assert.ok(sql.includes("r.access_status='approved_public'"));
            const limit = Number(bound.at(-2));
            const offset = Number(bound.at(-1));
            return { results: activeRows.slice(offset, offset + limit).map(item => ({
              ...item,
              sourceGrain: 'source_year_label',
              identityCount: 2,
            })) };
          }
          if (sql.includes('SELECT o.resource_id AS resourceId')) {
            assert.ok(sql.includes('o.dimensions,o.quality_status AS qualityStatus,o.quality,o.source_row_ref'));
            const limit = Number(bound.at(-2));
            const offset = Number(bound.at(-1));
            const page = activeRows.slice(offset, offset + limit);
            pageCalls += 1;
            if (pageCalls === 1 && changeAfterFirstPage) {
              activeRows = changeAfterFirstPage.rows;
              snapshotResult = changeAfterFirstPage.snapshot;
            }
            return { results: page };
          }
          if (sql.startsWith('SELECT count(*) AS total')) {
            return { results: [{ total: activeRows.length }] };
          }
          throw new Error('Unexpected D1 query: ' + sql);
        },
      };
      return statement;
    },
  };
  (globalThis as unknown as { env?: { DB: unknown } }).env = { DB: database };

  const response = await route.GET(new Request(new URL('/api/v1/livestock/beef-cattle?sourceYearBe=2565', origin)));
  assert.equal(response.status, 200, await response.clone().text());
  const payload = await response.json() as {
    data: {
      availableSourceYearsBe: number[]; selectedSourceYearBe: number | null;
      rows: Array<{ value: number | null }>;
      sourceRevisionIds: Array<string | null>;
      snapshot: { runId: string; sourceRevisionId: string } | null;
    };
    meta: { dataAsOf: string | null; sourceIds: string[]; datasetVersion: string | null };
  };
  assert.deepEqual(payload.data.availableSourceYearsBe, [2565, 2564]);
  assert.equal(payload.data.selectedSourceYearBe, 2565);
  assert.deepEqual(payload.data.rows.map(item => item.value), [0]);
  assert.deepEqual(payload.data.sourceRevisionIds, ['dld-rev-1']);
  assert.deepEqual(payload.data.snapshot, {
    runId: 'run-1',
    runStatus: 'succeeded',
    sourceRevisionId: 'dld-rev-1',
    sourceRetrievedAt: '2026-10-28T03:00:00Z',
    payloadSha256: 'payload-sha-1',
    adapterVersion: 'dld-beef-cattle/1',
    rowCount: 501,
  });
  assert.equal(payload.meta.dataAsOf, null);
  assert.deepEqual(payload.meta.sourceIds, ['dld']);
  assert.equal(payload.meta.datasetVersion, 'payload-sha-1');

  // A matching payload hash does not make metadata from one run compatible
  // with rows from another revision or retrieval time.
  pageCalls = 0;
  snapshotResult = { ...snapshot, runId: 'run-2', sourceRevisionId: 'dld-rev-2',
    sourceRetrievedAt: '2026-10-28T04:00:00Z', minimumRevisionId: 'dld-rev-2', maximumRevisionId: 'dld-rev-2' };
  const metadataRace = await route.GET(new Request(new URL('/api/v1/livestock/beef-cattle', origin)));
  assert.equal(metadataRace.status, 503);
  assert.match(JSON.stringify(await metadataRace.json()), /DLD_SNAPSHOT_CHANGED/);

  // A run switch between page 1 and page 2 has the same hash but a different
  // run id, revision and retrievedAt; the reader must reject the mixed page set.
  snapshotResult = { ...snapshot };
  activeRows = sourceRows;
  pageCalls = 0;
  const secondRunRows = sourceRows.map(item => ({
    ...item,
    runId: 'run-2',
    sourceRetrievedAt: '2026-10-28T04:00:00Z',
    quality: { revisionId: 'dld-rev-2' },
  }));
  changeAfterFirstPage = {
    rows: secondRunRows,
    snapshot: { ...snapshot, runId: 'run-2', sourceRevisionId: 'dld-rev-2',
      sourceRetrievedAt: '2026-10-28T04:00:00Z', minimumRevisionId: 'dld-rev-2', maximumRevisionId: 'dld-rev-2' },
  };
  const pageRace = await route.GET(new Request(new URL('/api/v1/livestock/beef-cattle', origin)));
  assert.equal(pageRace.status, 503);
  assert.match(JSON.stringify(await pageRace.json()), /DLD_SNAPSHOT_CHANGED/);

  snapshotError = true;
  const d1Error = await route.GET(new Request(new URL('/api/v1/livestock/beef-cattle', origin)));
  assert.equal(d1Error.status, 503);
  assert.match(JSON.stringify(await d1Error.json()), /DLD_DATA_UNAVAILABLE/);
});
