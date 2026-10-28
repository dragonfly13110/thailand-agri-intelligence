/**
 * Offline tests for the /explore CSV export (lane 6, AI-6).
 *
 * Everything runs against fake records/detail readers and stubbed hub
 * repository modules, so no database, credential or network request is used.
 * The route is imported directly with those stubs to prove the server-side
 * wiring (status codes, headers, query hand-off) rather than only the formatter.
 *
 * The runner uses `node --experimental-strip-types`, so the same
 * resolution/transpilation hooks as `governance-containment.test.ts` are
 * installed locally. No production file is modified.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

type HubObservation = import('../lib/hub/types.ts').HubObservation;
type ExportDatasetAccess = import('../lib/hub/dataset-csv-export.ts').ExportDatasetAccess;
type ExportRecordsMeta = import('../lib/hub/dataset-csv-export.ts').ExportRecordsMeta;
type ExportRecordsQuery = import('../lib/hub/dataset-csv-export.ts').ExportRecordsQuery;

const STUBS: Record<string, string> = {
  db: [
    'export async function getDatabaseKind() { return globalThis.__exportDatabaseKind; }',
    'export class HubDatabaseError extends Error { constructor(code) { super(code); this.code = code; } }',
  ].join('\n'),
  'd1-numeric-repository': 'export async function listD1Records(id, url) { return globalThis.__exportRecords(id, url); }',
  'numeric-repository': 'export async function listDbRecords(id, url) { return globalThis.__exportRecords(id, url); }',
  'd1-catalog-repository': 'export async function getD1Dataset(id) { return globalThis.__exportDataset(id); }',
  'catalog-repository': 'export async function getDbDataset(id) { return globalThis.__exportDataset(id); }',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    }
    // Stand in for the hub repositories the export route reads through, so the
    // route is exercised without a database, D1 token, or pg connection.
    const stub = STUBS[specifier.split('/').pop() ?? ''];
    if (stub) return { url: 'data:text/javascript,' + encodeURIComponent(stub), shortCircuit: true };
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

const exportLib = await import('../lib/hub/dataset-csv-export.ts');
const { encodeSeriesId } = await import('../lib/hub/series-id.ts');
const exportRoute = await import('../app/api/v1/datasets/[id]/export/route.ts');

const BOM = String.fromCharCode(0xfeff);
const DATASET_ID = 'nabc_market_prices';
const RESOURCE_ID = 'nabc-market-price-daily';
const EXPORTED_AT = '2026-10-27T02:30:00.000Z';
const QUERY = { datasetId: DATASET_ID, resourceId: RESOURCE_ID, from: null, to: null };

const globals = globalThis as unknown as {
  __exportDatabaseKind: string;
  __exportDataset: (id: string) => Promise<Response>;
  __exportRecords: (id: string, url: URL) => Promise<Response>;
};

function observation(overrides: Partial<HubObservation> = {}): HubObservation {
  return {
    rowKey: 'row-1',
    seriesId: RESOURCE_ID + '|series-1',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-01',
    periodLabel: '1 ต.ค. 2569',
    locationCode: '01',
    locationKind: 'province',
    locationName: 'กรุงเทพมหานคร',
    provinceCode: '01',
    cropCode: null,
    cropName: null,
    metricId: 'price_min',
    metricName: 'ราคาต่ำสุด',
    product: 'ข้าว',
    grade: 'A',
    market: 'บางบัวทอง',
    unit: 'บาท/กิโลกรัม',
    value: 12.5,
    dimensions: {},
    qualityStatus: 'measured',
    sourceRowRef: null,
    ...overrides,
  };
}

function recordsMeta(overrides: Partial<ExportRecordsMeta> = {}): ExportRecordsMeta {
  return {
    access: 'approved_public',
    completeness: 'complete',
    datasetVersion: 'payload-sha-run-1',
    sourceIds: ['nabc'],
    sourceRetrievedAt: '2026-10-26T04:00:00Z',
    sourceUpdatedAt: '2026-10-25T00:00:00Z',
    dataAsOf: '2026-10-25',
    warnings: [],
    ...overrides,
  };
}

function datasetAccess(overrides: Partial<ExportDatasetAccess> = {}): ExportDatasetAccess {
  return {
    id: DATASET_ID,
    access: 'approved_public',
    sourceUrl: 'https://www.nabc.go.th/price',
    resources: [{
      id: RESOURCE_ID,
      grain: 'ตลาด × สินค้า × เกรด',
      accessStatus: 'approved_public',
      projectPublicationApproved: true,
      activeRunId: 'run-1',
    }],
    ...overrides,
  };
}

type ScriptedPage = { rows?: HubObservation[]; total?: number; meta?: Partial<ExportRecordsMeta> };

function fakeReaders(input: { dataset?: Partial<ExportDatasetAccess>; pages: ScriptedPage[] }) {
  const queries: ExportRecordsQuery[] = [];
  const dataset = datasetAccess(input.dataset ?? {});
  const scriptedTotal = input.pages.reduce((sum, page) => sum + (page.rows?.length ?? 0), 0);
  const readers = {
    readDataset: async (datasetId: string) => {
      assert.equal(datasetId, DATASET_ID, 'the export asks the hub about the dataset in the URL');
      return dataset;
    },
    readRecords: async (query: ExportRecordsQuery) => {
      queries.push(query);
      const scripted = input.pages[query.page - 1];
      if (!scripted) throw new Error('fake reader ได้รับคำขอหน้า ' + query.page + ' ที่ไม่ได้เตรียมไว้');
      return {
        data: scripted.rows ?? [],
        meta: recordsMeta(scripted.meta ?? {}),
        pagination: { page: query.page, pageSize: query.pageSize, total: scripted.total ?? scriptedTotal },
      };
    },
  };
  return { queries, readers: readers as unknown as import('../lib/hub/dataset-csv-export.ts').ExportReaders };
}

function rows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const rowNumber = offset + index + 1;
    return observation({ rowKey: 'row-' + rowNumber, seriesId: RESOURCE_ID + '|series-' + rowNumber });
  });
}

/** Minimal RFC 4180 reader so the assertions test the file, not the writer. */
function parseCsv(text: string): string[][] {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') { field += '"'; index++; continue; }
      if (char === '"') { quoted = false; continue; }
      field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\r' && body[index + 1] === '\n') { index++; row.push(field); field = ''; records.push(row); row = []; continue; }
    field += char;
  }
  if (field.length || row.length) { row.push(field); records.push(row); }
  return records;
}

async function tableOf(build: Promise<{ csv: string }>) {
  const records = parseCsv((await build).csv);
  const header = records[0];
  return {
    header,
    rows: records.slice(1).map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? '']))),
  };
}

async function captureError(action: Promise<unknown>) {
  try {
    await action;
  } catch (error) {
    return error as { status: number; code: string; message: string };
  }
  throw new Error('คาดว่าต้องล้มเหลว แต่ส่งข้อมูลกลับมา');
}

/** `Response.text()` silently drops a BOM, so the byte check happens here. */
async function csvBytes(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bom: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    text: new TextDecoder().decode(bytes),
  };
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

test('export query requires a resource and rejects bad dates with 400', () => {
  const url = (search: string) => new URL('https://hub.internal/api/v1/datasets/' + DATASET_ID + '/export' + search);
  assert.throws(() => exportLib.parseExportQuery(url('?from=2026-10-01'), DATASET_ID), (error: Error) => {
    assert.equal((error as unknown as { status: number }).status, 400);
    assert.equal((error as unknown as { code: string }).code, 'INVALID_QUERY');
    return true;
  }, 'missing resourceId must be rejected');
  assert.throws(() => exportLib.parseExportQuery(url('?resourceId=x&from=2026-02-30'), DATASET_ID), (error: Error) => {
    assert.equal((error as unknown as { code: string }).code, 'INVALID_QUERY');
    return true;
  }, 'impossible calendar date must be rejected');
  assert.throws(() => exportLib.parseExportQuery(url('?resourceId=x&from=2026-10-05&to=2026-10-01'), DATASET_ID), (error: Error) => {
    assert.equal((error as unknown as { message: string }).message, 'ช่วงวันที่ไม่ถูกต้อง');
    return true;
  }, 'from after to must be rejected');
  assert.throws(() => exportLib.parseExportQuery(url(''), ''), (error: Error) => {
    assert.equal((error as unknown as { code: string }).code, 'INVALID_ID');
    return true;
  }, 'empty dataset id must be rejected');
  assert.deepEqual(
    exportLib.parseExportQuery(url('?resourceId=' + RESOURCE_ID + '&from=2026-10-01&to=2026-10-07'), DATASET_ID),
    { datasetId: DATASET_ID, resourceId: RESOURCE_ID, from: '2026-10-01', to: '2026-10-07' }
  );
});

/* ------------------------------------------------------------------ */
/* Values, nulls and escaping                                          */
/* ------------------------------------------------------------------ */

test('null stays a blank cell while a measured zero is written as 0', async () => {
  const fake = fakeReaders({
    pages: [{ rows: [
      observation({ rowKey: 'row-zero', seriesId: RESOURCE_ID + '|zero', value: 0 }),
      observation({ rowKey: 'row-null', seriesId: RESOURCE_ID + '|null', value: null, unit: null }),
    ], total: 2 }],
  });
  const table = await tableOf(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(table.rows[0].value, '0', 'a measured zero keeps its number');
  assert.equal(table.rows[1].value, '', 'a missing value is not turned into zero');
  assert.equal(table.rows[1].unit, '', 'an unknown unit is left blank instead of a guess');
  assert.equal(table.rows.length, 2);
});

test('Thai text, commas, quotes and newlines survive the round trip', async () => {
  const awkward = 'ข้าว 5%, " Grade A"\r\nแถวสอง';
  const fake = fakeReaders({
    pages: [{ rows: [observation({ product: awkward, locationName: 'ตลาดกลาง บางบัวทอง, ปทุมธานี' })], total: 1 }],
  });
  const table = await tableOf(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(table.rows[0].product, awkward);
  assert.equal(table.rows[0].locationName, 'ตลาดกลาง บางบัวทอง, ปทุมธานี');
  assert.ok(table.header.join(',').includes('sourceRowRef'), 'header lists every observation column');
});

test('formula-looking source text is neutralised but negative numbers keep their meaning', async () => {
  const fake = fakeReaders({
    pages: [{ rows: [
      observation({ rowKey: 'row-1', product: '=1+1', grade: '+8', market: '@cmd', locationCode: ' -4', cropName: '\t=HYPERLINK("x")', value: -12.5 }),
    ], total: 1 }],
  });
  const table = await tableOf(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  const row = table.rows[0];
  assert.equal(row.product, "'=1+1");
  assert.equal(row.grade, "'+8");
  assert.equal(row.market, "'@cmd");
  assert.equal(row.locationCode, "' -4");
  assert.ok(row.cropName.startsWith("'"), 'tab-leading text is neutralised too');
  assert.equal(row.value, '-12.5', 'a numeric negative value must not be rewritten as text');
});

test('dimensions are kept as the source JSON object of each row', async () => {
  const fake = fakeReaders({
    pages: [{ rows: [observation({ locationKind: 'grid', dimensions: { longitude: 13.7, latitude: 100.5, 'uut.' : 1 } })], total: 1 }],
  });
  const table = await tableOf(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.deepEqual(JSON.parse(table.rows[0].dimensions), { longitude: 13.7, latitude: 100.5, 'uut.': 1 });
});

/* ------------------------------------------------------------------ */
/* Provenance columns                                                  */
/* ------------------------------------------------------------------ */

test('every row carries dataset, resource, source and version provenance', async () => {
  const fake = fakeReaders({ pages: [{ rows: [observation()], total: 1 }] });
  const table = await tableOf(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  const row = table.rows[0];
  assert.equal(row.datasetId, DATASET_ID);
  assert.equal(row.resourceId, RESOURCE_ID);
  assert.equal(row.resourceGrain, 'ตลาด × สินค้า × เกรด');
  assert.equal(row.sourceIds, 'nabc');
  assert.equal(row.sourceUrl, 'https://www.nabc.go.th/price');
  assert.equal(row.datasetVersion, 'payload-sha-run-1');
  assert.equal(row.sourceRetrievedAt, '2026-10-26T04:00:00Z');
  assert.equal(row.publicationCompleteness, 'complete');
  assert.equal(row.exportGeneratedAt, EXPORTED_AT);
  assert.equal(row.exportRowCount, '1');
});

test('partial samples are marked inside the file instead of claiming coverage', async () => {
  const warning = 'ชุดนี้มีข้อมูลตัวอย่างบางส่วน ยังไม่ครอบคลุมข้อมูลทั้งหมดของทรัพยากร';
  const fake = fakeReaders({
    pages: [{ rows: [observation()], total: 1, meta: { completeness: 'partial', warnings: [warning] } }],
  });
  const result = await exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers });
  const table = await tableOf(Promise.resolve(result));
  assert.equal(table.rows[0].publicationCompleteness, 'partial');
  assert.equal(table.rows[0].publicationWarnings, warning);
  assert.equal(result.completeness, 'partial');
});

test('multiple sources are listed in one column without merging their values', async () => {
  const fake = fakeReaders({ pages: [{ rows: [observation()], total: 1, meta: { sourceIds: ['nabc', 'doae'] } }] });
  const table = await tableOf(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(table.rows[0].sourceIds, 'nabc; doae');
});

test('CSV export accepts a reversible series ID for the selected resource', async () => {
  const seriesId = encodeSeriesId({
    resourceId: RESOURCE_ID,
    seriesKey: 'price_min:annual:province:บาท/กิโลกรัม',
    sourceGrain: 'annual',
    product: 'ข้าว',
    grade: 'A',
    market: 'บางบัวทอง',
    unit: 'บาท/กิโลกรัม',
    locationId: 'province:01',
    locationCode: '01',
    locationKind: 'province',
    locationName: 'กรุงเทพมหานคร',
    provinceCode: '01',
    cropCode: null,
    cropName: null,
    metricId: 'price_min',
    metricName: 'ราคาต่ำสุด',
    dimensions: {},
  });
  const fake = fakeReaders({ pages: [{ rows: [observation({ seriesId })], total: 1 }] });
  const table = await tableOf(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].seriesId, seriesId);
});

test('CSV export rejects a reversible series ID for another resource', async () => {
  const seriesId = encodeSeriesId({
    resourceId: 'another-resource',
    seriesKey: 'price_min:annual:province:บาท/กิโลกรัม',
    sourceGrain: 'annual',
    product: 'ข้าว',
    grade: 'A',
    market: 'บางบัวทอง',
    unit: 'บาท/กิโลกรัม',
    locationId: 'province:01',
    locationCode: '01',
    locationKind: 'province',
    locationName: 'กรุงเทพมหานคร',
    provinceCode: '01',
    cropCode: null,
    cropName: null,
    metricId: 'price_min',
    metricName: 'ราคาต่ำสุด',
    dimensions: {},
  });
  const fake = fakeReaders({ pages: [{ rows: [observation({ seriesId })], total: 1 }] });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 409);
  assert.equal(error.code, 'EXPORT_CHANGED');
});

/* ------------------------------------------------------------------ */
/* Pagination and snapshot consistency                                 */
/* ------------------------------------------------------------------ */

test('reads 100 rows per page, up to ten pages, and asserts one version', async () => {
  const pages = Array.from({ length: 10 }, (_, index) => ({ rows: rows(100, index * 100) }));
  const fake = fakeReaders({ pages });
  const query = { ...QUERY, from: '2026-09-01', to: '2026-09-30' };
  const result = await exportLib.buildDatasetCsvExport({ query, exportedAt: EXPORTED_AT, readers: fake.readers });
  assert.equal(result.rowCount, 1000);
  assert.equal(fake.queries.length, 10);
  assert.deepEqual(fake.queries.map((item) => item.page), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const request of fake.queries) {
    assert.equal(request.pageSize, 100);
    assert.equal(request.resourceId, RESOURCE_ID);
    assert.equal(request.datasetId, DATASET_ID);
    assert.equal(request.from, '2026-09-01');
    assert.equal(request.to, '2026-09-30');
  }
  const records = parseCsv(result.csv);
  assert.equal(records.length, 1001, 'header plus exactly 1,000 data rows');
  assert.equal(records[1000][exportLib.CSV_COLUMNS.indexOf('exportRowCount')], '1000');
});

test('refuses more than 1,000 rows before assembling a partial file', async () => {
  const fake = fakeReaders({ pages: [{ rows: rows(100), total: 1001 }] });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 413);
  assert.equal(error.code, 'EXPORT_TOO_LARGE');
  assert.match(error.message, /1,000/, 'the message states the limit');
  assert.equal(fake.queries.length, 1, 'only the counting page is read; no truncated file is produced');
});

test('stops when the active published version changes between pages', async () => {
  const fake = fakeReaders({
    pages: [
      { rows: rows(100), total: 150 },
      { rows: rows(50, 100), total: 150, meta: { datasetVersion: 'payload-sha-run-2' } },
    ],
  });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 409);
  assert.equal(error.code, 'EXPORT_CHANGED');
});

test('stops when the reported total changes between pages', async () => {
  const fake = fakeReaders({
    pages: [{ rows: rows(100), total: 150 }, { rows: rows(50, 100), total: 160 }],
  });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 409);
  assert.equal(error.code, 'EXPORT_CHANGED');
});

test('stops when the published batch version cannot be confirmed', async () => {
  const fake = fakeReaders({ pages: [{ rows: rows(10), total: 10, meta: { datasetVersion: null } }] });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 409);
  assert.equal(error.code, 'EXPORT_CHANGED');
  assert.equal(fake.queries.length, 1, 'an unconfirmed snapshot stops the export on the first page');
});

test('stops when page drift repeats a row', async () => {
  const overlapping = rows(50, 50).map((row, index) => index === 0 ? rows(1)[0] : row);
  const fake = fakeReaders({ pages: [{ rows: rows(100), total: 150 }, { rows: overlapping, total: 150 }] });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 409);
  assert.equal(error.code, 'EXPORT_CHANGED');
});

test('stops when a returned row belongs to another resource', async () => {
  const fake = fakeReaders({
    pages: [{ rows: [observation({ seriesId: 'other-resource|series-1' })], total: 1 }],
  });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 409);
  assert.equal(error.code, 'EXPORT_CHANGED');
  assert.match(error.message, /ทรัพยากรที่เลือก/);
});

/* ------------------------------------------------------------------ */
/* Publication rights and empty batches                                */
/* ------------------------------------------------------------------ */

test('a resource outside the dataset is refused with 404', async () => {
  const fake = fakeReaders({ pages: [{ rows: [observation()], total: 1 }] });
  const error = await captureError(exportLib.buildDatasetCsvExport({
    query: { ...QUERY, resourceId: 'resource-in-another-dataset' },
    exportedAt: EXPORTED_AT,
    readers: fake.readers,
  }));
  assert.equal(error.status, 404);
  assert.equal(error.code, 'EXPORT_RESOURCE_NOT_FOUND');
  assert.equal(fake.queries.length, 0, 'no rows are read for a resource this dataset does not own');
});

test('metadata-only and revoked resources return an error instead of a fake CSV', async () => {
  const metadataOnly = await captureError(exportLib.buildDatasetCsvExport({
    query: QUERY,
    exportedAt: EXPORTED_AT,
    readers: fakeReaders({ dataset: { access: 'metadata_only' }, pages: [{ rows: [observation()], total: 1 }] }).readers,
  }));
  assert.equal(metadataOnly.status, 403);
  assert.equal(metadataOnly.code, 'EXPORT_NOT_PUBLISHED');

  const revoked = await captureError(exportLib.buildDatasetCsvExport({
    query: QUERY,
    exportedAt: EXPORTED_AT,
    readers: fakeReaders({
      dataset: {
        resources: [{
          id: RESOURCE_ID, grain: null, accessStatus: 'metadata_only', projectPublicationApproved: false, activeRunId: null,
        }],
      },
      pages: [{ rows: [observation()], total: 1 }],
    }).readers,
  }));
  assert.equal(revoked.status, 403);
  assert.equal(revoked.code, 'EXPORT_NOT_PUBLISHED');
});

test('records read without publication access are refused', async () => {
  const fake = fakeReaders({ pages: [{ rows: [observation()], total: 1, meta: { access: 'metadata_only' } }] });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 403);
  assert.equal(error.code, 'EXPORT_NOT_PUBLISHED');
});

test('an active batch without numeric rows has no file to download', async () => {
  const fake = fakeReaders({ pages: [{ rows: [], total: 0 }] });
  const error = await captureError(exportLib.buildDatasetCsvExport({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers }));
  assert.equal(error.status, 404);
  assert.equal(error.code, 'EXPORT_NO_ROWS');
});

/* ------------------------------------------------------------------ */
/* Response and filename                                               */
/* ------------------------------------------------------------------ */

test('the response is a UTF-8 CSV download that is never cached', async () => {
  const fake = fakeReaders({ pages: [{ rows: [observation()], total: 1 }] });
  const response = await exportLib.exportDatasetCsv({ query: QUERY, exportedAt: EXPORTED_AT, readers: fake.readers });
  const body = await csvBytes(response);
  assert.equal(response.status, 200);
  assert.ok(body.bom, 'Excel needs the UTF-8 BOM for Thai text');
  assert.ok(body.text.includes(',' + DATASET_ID + ',' + RESOURCE_ID + ','));
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-disposition') ?? '', /^attachment; filename="tadih-[^"]+\.csv"$/);
});

test('filenames are ASCII slugs that cannot break the header', () => {
  const filename = exportLib.exportFilename({
    datasetId: 'ชุดข้อมูล "\r\nX-Injected: yes"',
    resourceId: 'https://data.example.go.th/api/v1/?token=secret',
    from: '2026-10-01',
    to: null,
  }, EXPORTED_AT);
  assert.match(filename, /^[A-Za-z0-9._-]+\.csv$/, 'only safe characters reach the filename');
  assert.doesNotMatch(filename, /[\r\n"]/, 'no CRLF or quote injection into content-disposition');
  assert.doesNotMatch(filename.toLowerCase(), /token|secret/, 'query credentials are not echoed into the filename');
  assert.equal(exportLib.exportFilename(QUERY, EXPORTED_AT).endsWith('.csv'), true);
});

/* ------------------------------------------------------------------ */
/* Route wiring (server side)                                          */
/* ------------------------------------------------------------------ */

function jsonPage(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function datasetEnvelope(overrides: Partial<ExportDatasetAccess> = {}) {
  const dataset = datasetAccess(overrides);
  return jsonPage({ data: dataset, meta: { access: dataset.access } });
}

async function callRoute(search: string) {
  const response = await exportRoute.GET(
    new Request('https://hub.internal/api/v1/datasets/' + DATASET_ID + '/export' + search),
    { params: Promise.resolve({ id: DATASET_ID }) }
  );
  return response;
}

test('route reads only the selected resource through the existing records reader', async () => {
  globals.__exportDatabaseKind = 'd1';
  const urls: URL[] = [];
  globals.__exportDataset = async () => datasetEnvelope();
  globals.__exportRecords = async (id, url) => {
    urls.push(url);
    return jsonPage({
      data: [observation(), observation({ rowKey: 'row-2', seriesId: RESOURCE_ID + '|series-2', value: null })],
      meta: recordsMeta(),
      pagination: { page: 1, pageSize: 100, total: 2 },
    });
  };

  const response = await callRoute('?resourceId=' + encodeURIComponent(RESOURCE_ID) + '&from=2026-10-01&to=2026-10-07');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get('resourceId'), RESOURCE_ID, 'the resource filter is carried to the records reader');
  assert.equal(urls[0].searchParams.get('page'), '1');
  assert.equal(urls[0].searchParams.get('pageSize'), '100');
  assert.equal(urls[0].searchParams.get('from'), '2026-10-01');
  assert.equal(urls[0].searchParams.get('to'), '2026-10-07');
  const body = await csvBytes(response);
  assert.ok(body.bom);
  const records = parseCsv(body.text);
  assert.equal(records[0].length, exportLib.CSV_COLUMNS.length);
  assert.equal(records.length, 3);
  assert.equal(records[2][exportLib.CSV_COLUMNS.indexOf('value')], '', 'null still reads as blank through the route');
});

test('route returns JSON errors with the documented status codes', async () => {
  globals.__exportDatabaseKind = 'd1';
  globals.__exportDataset = async () => datasetEnvelope();
  globals.__exportRecords = async () => jsonPage({ data: [observation()], meta: recordsMeta(), pagination: { page: 1, pageSize: 100, total: 1 } });

  const missingResource = await callRoute('');
  assert.equal(missingResource.status, 400);
  assert.equal((await missingResource.json() as { error: { code: string } }).error.code, 'INVALID_QUERY');

  const badRange = await callRoute('?resourceId=' + RESOURCE_ID + '&from=2026-10-08&to=2026-10-01');
  assert.equal(badRange.status, 400);

  globals.__exportDataset = async () => jsonPage({ error: { code: 'DATASET_NOT_FOUND', message: 'ไม่พบชุดข้อมูลนี้', requestId: 'r-1' } }, 404);
  const unknownDataset = await callRoute('?resourceId=' + RESOURCE_ID);
  assert.equal(unknownDataset.status, 404);
  assert.equal((await unknownDataset.json() as { error: { code: string } }).error.code, 'DATASET_NOT_FOUND');

  globals.__exportDataset = async () => datasetEnvelope();
  globals.__exportRecords = async () => jsonPage({ data: rows(100), meta: recordsMeta(), pagination: { page: 1, pageSize: 100, total: 1001 } });
  const tooLarge = await callRoute('?resourceId=' + RESOURCE_ID);
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json() as { error: { code: string } }).error.code, 'EXPORT_TOO_LARGE');
});

test('route reports an unavailable middle database instead of an empty CSV', async () => {
  globals.__exportDatabaseKind = 'none';
  globals.__exportDataset = async () => datasetEnvelope();
  globals.__exportRecords = async () => jsonPage({ data: [], meta: recordsMeta(), pagination: { page: 1, pageSize: 100, total: 0 } });
  const response = await callRoute('?resourceId=' + RESOURCE_ID);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: { code: string } }).error.code, 'EXPORT_DATABASE_UNAVAILABLE');
});
