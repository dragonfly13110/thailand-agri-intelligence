import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_ENDPOINTS } from '../lib/hub/api-catalog.ts';
import {
  apiAcceptHeader,
  buildInitialQueryValues,
  csvDownloadFilename,
  describeSuggestOutcome,
  exportDatasetCandidates,
  exportResourceCandidates,
  parseApiResponseBody,
  readExportDatasets,
  readExportResources,
  readPaginationTotal,
  validateApiRequest,
} from '../lib/hub/api-playground-contract.ts';

test('playground requests CSV and leaves a CSV body as text even when it looks like JSON', () => {
  assert.equal(apiAcceptHeader('csv'), 'text/csv');
  assert.equal(apiAcceptHeader('hub-v1'), 'application/json');
  assert.deepEqual(parseApiResponseBody('{"a":1}', 'text/csv; charset=utf-8'), {
    kind: 'text',
    text: '{"a":1}',
  });
  assert.deepEqual(parseApiResponseBody('{"error":{"code":"INVALID_QUERY"}}', 'application/json'), {
    kind: 'json',
    text: '{"error":{"code":"INVALID_QUERY"}}',
    value: { error: { code: 'INVALID_QUERY' } },
  });
});

test('CSV download filename uses the route header only when it is a safe CSV filename', () => {
  assert.equal(csvDownloadFilename('attachment; filename="tadih-data-20261028.csv"'), 'tadih-data-20261028.csv');
  assert.equal(csvDownloadFilename('attachment; filename="../../secret.csv"'), 'export.csv');
  assert.equal(csvDownloadFilename('attachment'), 'export.csv');
});

test('playground validates route query constraints before sending', () => {
  const monthly = API_ENDPOINTS.find((endpoint) => endpoint.id === 'weather-monthly-rainfall');
  const exportCsv = API_ENDPOINTS.find((endpoint) => endpoint.id === 'datasets-export');
  const beefCattle = API_ENDPOINTS.find((endpoint) => endpoint.id === 'livestock-beef-cattle');
  const oaeTrade = API_ENDPOINTS.find((endpoint) => endpoint.id === 'trade-oae');
  assert.ok(monthly && exportCsv && beefCattle && oaeTrade);

  assert.deepEqual(validateApiRequest(monthly, {}, { year: '2026', provinceCode: '10', stationCode: '48300', page: '1', pageSize: '25' }), []);
  assert.ok(validateApiRequest(monthly, {}, { year: '26', provinceCode: '1', stationCode: '48', page: '0', pageSize: '101' }).length > 0);
  assert.ok(validateApiRequest(exportCsv, { id: 'doae:production_doae' }, {}).some((issue) => issue.startsWith('resourceId:')));
  assert.ok(validateApiRequest(exportCsv, { id: 'doae:production_doae' }, { resourceId: 'resource', from: '2026-10-25', to: '2026-10-24' }).some((issue) => issue.startsWith('from/to:')));
  assert.deepEqual(validateApiRequest(exportCsv, { id: 'doae:production_doae' }, { resourceId: 'resource', from: '2026-10-01', to: '2026-10-24' }), []);

  assert.deepEqual(validateApiRequest(beefCattle, {}, { sourceYearBe: '2565' }), []);
  assert.ok(validateApiRequest(beefCattle, {}, { sourceYearBe: '2399' }).length > 0);
  assert.ok(validateApiRequest(beefCattle, {}, { sourceYearBe: '256' }).length > 0);
  assert.deepEqual(beefCattle.query?.map((param) => param.name), ['sourceYearBe']);

  assert.deepEqual(validateApiRequest(oaeTrade, {}, { yearLabel: 'FY 2568/69' }), []);
  assert.ok(validateApiRequest(oaeTrade, {}, { yearLabel: 'x'.repeat(81) }).length > 0);
  assert.deepEqual(oaeTrade.query?.map((param) => param.name), ['yearLabel']);
});

test('CSV export starts with empty optional dates so real rows are not filtered out', () => {
  const exportCsv = API_ENDPOINTS.find((endpoint) => endpoint.id === 'datasets-export');
  const monthly = API_ENDPOINTS.find((endpoint) => endpoint.id === 'weather-monthly-rainfall');
  const reservoirs = API_ENDPOINTS.find((endpoint) => endpoint.id === 'water-reservoirs');
  assert.ok(exportCsv && monthly && reservoirs);

  const exportValues = buildInitialQueryValues(exportCsv);
  assert.equal(exportValues.from, '');
  assert.equal(exportValues.to, '');
  assert.equal(exportValues.resourceId, '');

  const monthlyValues = buildInitialQueryValues(monthly);
  assert.equal(monthlyValues.provinceCode, '10');
  assert.equal(monthlyValues.year, '2026');

  // hub-v1 endpoints keep their documented example so their initial snapshot view does not change.
  assert.equal(buildInitialQueryValues(reservoirs).date, '2026-10-26');
});

test('suggest messages describe whether ids were fetched or the typed value was reused', () => {
  assert.deepEqual(
    describeSuggestOutcome({ filledParams: ['id'], keptParams: [], missingLabels: [], error: null }),
    { status: 'success', message: 'เติม id จาก API จริงแล้ว (id) · ตรวจ id ก่อนเรียก API' },
  );
  assert.deepEqual(
    describeSuggestOutcome({ filledParams: [], keptParams: ['id'], missingLabels: [], error: null }),
    { status: 'kept', message: 'ใช้ค่าที่กรอกไว้ (id) โดยไม่ได้ค้นหาใหม่' },
  );

  const mixed = describeSuggestOutcome({ filledParams: ['seriesId'], keptParams: ['id'], missingLabels: [], error: null });
  assert.equal(mixed.status, 'success');
  assert.match(mixed.message, /เติม id จาก API จริงแล้ว \(seriesId\)/);
  assert.match(mixed.message, /ใช้ค่าที่กรอกไว้ \(id\)/);

  const keptPartial = describeSuggestOutcome({ filledParams: [], keptParams: ['id'], missingLabels: ['series'], error: null });
  assert.equal(keptPartial.status, 'partial');
  assert.match(keptPartial.message, /ใช้ค่าที่กรอกไว้ \(id\) · ยังไม่พบ series/);

  assert.equal(describeSuggestOutcome({ filledParams: [], keptParams: [], missingLabels: [], error: { status: 503 } }).status, 'error');
  assert.equal(describeSuggestOutcome({ filledParams: [], keptParams: [], missingLabels: [], error: null }).status, 'empty');
});

test('export resource candidates only keep approved active resources and put the typed one first', () => {
  const exportable = { accessStatus: 'approved_public', projectPublicationApproved: true, activeRunId: 'run-1' };
  const resources = [
    { id: 'meta', ...exportable, accessStatus: 'metadata_only' },
    { id: 'unapproved', ...exportable, projectPublicationApproved: false },
    { id: 'no-run', ...exportable, activeRunId: null },
    { id: 'blank-run', ...exportable, activeRunId: '  ' },
    { id: 'first', ...exportable },
    { id: 'typed', ...exportable, activeRunId: 'run-2' },
  ];
  assert.deepEqual(exportResourceCandidates(resources, ''), ['first', 'typed']);
  assert.deepEqual(exportResourceCandidates(resources, 'typed'), ['typed', 'first']);
  assert.deepEqual(exportResourceCandidates(resources, 'meta'), ['first', 'typed']);
  assert.deepEqual(exportResourceCandidates(resources, 'missing'), ['first', 'typed']);
});

test('export dataset candidates prefer ready datasets and never offer metadata-only ones', () => {
  const datasets = [
    { id: 'meta', availability: 'metadata_only' },
    { id: 'empty', availability: 'empty' },
    { id: 'ready-1', availability: 'ready' },
    { id: 'ready-2', availability: 'ready' },
  ];
  assert.deepEqual(exportDatasetCandidates(datasets), ['ready-1', 'ready-2', 'empty']);

  const many = Array.from({ length: 15 }, (_, index) => ({ id: `ready-${index}`, availability: 'ready' }));
  assert.equal(exportDatasetCandidates(many).length, 10);
});

test('export suggest parses the real list, detail and records payloads', () => {
  assert.deepEqual(
    readExportDatasets({ data: [{ id: 'a:1', availability: 'ready' }, { id: '' }, {}] }),
    [{ id: 'a:1', availability: 'ready' }],
  );
  assert.deepEqual(
    readExportResources({
      data: {
        resources: [
          { id: 'r1', accessStatus: 'approved_public', projectPublicationApproved: true, activeRunId: 'run' },
          { id: 'r2' },
        ],
      },
    }),
    [
      { id: 'r1', accessStatus: 'approved_public', projectPublicationApproved: true, activeRunId: 'run' },
      { id: 'r2', accessStatus: null, projectPublicationApproved: false, activeRunId: null },
    ],
  );
  assert.equal(readPaginationTotal({ pagination: { total: 42 } }), 42);
  assert.equal(readPaginationTotal({ pagination: { total: '42' } }), null);
  assert.equal(readPaginationTotal({ data: [] }), null);
});
