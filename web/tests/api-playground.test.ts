import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_ENDPOINTS } from '../lib/hub/api-catalog.ts';
import {
  apiAcceptHeader,
  csvDownloadFilename,
  parseApiResponseBody,
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
