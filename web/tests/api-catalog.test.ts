/**
 * Structural tests for the Hub API v1 developer catalog.
 *
 * These assertions only inspect documentation data. They never call a route,
 * open a database or read private files, so they can run with
 * `node --experimental-strip-types --test tests/api-catalog.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_BASE_PATH,
  API_CONTRACT_ID,
  API_ENDPOINTS,
  API_GROUPS,
  API_VERSION,
} from '../lib/hub/api-catalog.ts';

const EXPECTED_GROUP_IDS = [
  'sources',
  'datasets',
  'weather',
  'water',
  'nwp',
  'crops',
  'livestock',
  'soil',
  'areas',
  'prices',
  'trade',
] as const;

const EXPECTED_ENDPOINT_IDS = [
  'sources-list',
  'sources-status',
  'datasets-list',
  'datasets-detail',
  'datasets-export',
  'datasets-records',
  'datasets-series',
  'series-observations',
  'weather-overview',
  'weather-monthly-rainfall',
  'weather-observations',
  'water-reservoirs',
  'nwp-grid',
  'nwp-provinces',
  'nwp-runs',
  'crops-reference',
  'livestock-beef-cattle',
  'soil-reference',
  'areas-evidence',
  'prices-daily',
  'trade-oae',
] as const;

function placeholders(path: string): string[] {
  return [...path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
}

test('api catalog: version and contract constants match the v1 schema', () => {
  assert.equal(API_VERSION, 'v1');
  assert.equal(API_BASE_PATH, '/api/v1');
  assert.equal(
    API_CONTRACT_ID,
    'https://thailand-agricultural-data-hub.example/api/v1.schema.json',
  );
});

test('api catalog: exactly 11 groups and 21 endpoints in the documented order', () => {
  assert.equal(API_GROUPS.length, 11);
  assert.deepEqual(
    API_GROUPS.map((group) => group.id),
    [...EXPECTED_GROUP_IDS],
  );

  assert.equal(API_ENDPOINTS.length, 21);
  assert.deepEqual(
    API_ENDPOINTS.map((endpoint) => endpoint.id),
    [...EXPECTED_ENDPOINT_IDS],
  );
  assert.equal(new Set(API_ENDPOINTS.map((endpoint) => endpoint.id)).size, 21);
});

test('api catalog: every endpoint is a unique GET under /api/v1', () => {
  for (const endpoint of API_ENDPOINTS) {
    assert.equal(endpoint.method, 'GET', `${endpoint.id}: method`);
    assert.ok(
      endpoint.path.startsWith(API_BASE_PATH + '/'),
      `${endpoint.id}: path ${endpoint.path} must start with ${API_BASE_PATH}/`,
    );
    assert.ok(endpoint.title.trim().length > 0, `${endpoint.id}: title`);
    assert.ok(endpoint.description.trim().length > 0, `${endpoint.id}: description`);
    assert.ok(endpoint.responseType.trim().length > 0, `${endpoint.id}: responseType`);
    assert.ok(
      ['approved_public', 'metadata_only', 'pending'].includes(endpoint.access),
      `${endpoint.id}: unknown access ${endpoint.access}`,
    );
    assert.ok(
      ['hub-v1', 'domain', 'csv'].includes(endpoint.contract),
      `${endpoint.id}: unknown contract ${endpoint.contract}`,
    );
  }
});

test('api catalog: path placeholders and pathParams agree in both directions', () => {
  for (const endpoint of API_ENDPOINTS) {
    const tokens = placeholders(endpoint.path);
    const declared = (endpoint.pathParams ?? []).map((param) => param.name);

    assert.equal(
      new Set(declared).size,
      declared.length,
      `${endpoint.id}: duplicate pathParams`,
    );
    assert.deepEqual(
      [...tokens].sort(),
      [...declared].sort(),
      `${endpoint.id}: placeholders ${tokens.join(', ')} != pathParams ${declared.join(', ')}`,
    );

    for (const param of endpoint.pathParams ?? []) {
      assert.ok(param.description.trim().length > 0, `${endpoint.id}/${param.name}: description`);
      assert.ok(param.example.trim().length > 0, `${endpoint.id}/${param.name}: example`);
      if (param.suggest !== undefined) {
        assert.ok(
          ['dataset', 'series', 'source'].includes(param.suggest),
          `${endpoint.id}/${param.name}: unknown suggest ${param.suggest}`,
        );
      }
    }
  }
});

test('api catalog: every declared group exists and owns at least one endpoint', () => {
  const groupIds = new Set(API_GROUPS.map((group) => group.id));
  assert.equal(groupIds.size, API_GROUPS.length, 'duplicate group id');

  for (const group of API_GROUPS) {
    assert.ok(group.label.trim().length > 0, `${group.id}: label`);
    assert.ok(group.description.trim().length > 0, `${group.id}: description`);
    assert.ok(
      API_ENDPOINTS.some((endpoint) => endpoint.group === group.id),
      `${group.id}: no endpoint`,
    );
  }

  for (const endpoint of API_ENDPOINTS) {
    assert.ok(groupIds.has(endpoint.group), `${endpoint.id}: unknown group ${endpoint.group}`);
  }
});

test('api catalog: endpoints are ordered by group, then by path', () => {
  const groupRank = new Map(EXPECTED_GROUP_IDS.map((id, index) => [id, index]));
  let previousRank = -1;
  let previousPath: string | null = null;

  for (const endpoint of API_ENDPOINTS) {
    const rank = groupRank.get(endpoint.group);
    assert.notEqual(rank, undefined, `${endpoint.id}: unknown group`);

    if (rank !== previousRank) {
      assert.ok((rank as number) > previousRank, `${endpoint.id}: group order must follow API_GROUPS`);
      previousRank = rank as number;
      previousPath = null;
    }

    if (previousPath !== null) {
      assert.ok(
        previousPath < endpoint.path,
        `${endpoint.id}: ${previousPath} must sort before ${endpoint.path}`,
      );
    }
    previousPath = endpoint.path;
  }
});

test('api catalog: query names are unique and enum values are usable in the playground', () => {
  for (const endpoint of API_ENDPOINTS) {
    const query = endpoint.query ?? [];
    const names = query.map((param) => param.name);
    assert.equal(new Set(names).size, names.length, `${endpoint.id}: duplicate query param`);

    for (const param of query) {
      assert.ok(param.description.trim().length > 0, `${endpoint.id}/${param.name}: description`);
      if (param.type !== 'enum') continue;

      assert.ok(Array.isArray(param.values), `${endpoint.id}/${param.name}: enum needs values`);
      assert.ok(param.values.length > 0, `${endpoint.id}/${param.name}: empty enum`);
      assert.equal(
        new Set(param.values).size,
        param.values.length,
        `${endpoint.id}/${param.name}: duplicate enum value`,
      );
      for (const value of param.values) {
        assert.ok(value.trim().length > 0, `${endpoint.id}/${param.name}: blank enum value`);
      }
      if (param.example !== undefined) {
        assert.ok(
          param.values.includes(param.example),
          `${endpoint.id}/${param.name}: example ${param.example} is not an allowed value`,
        );
      }
    }
  }
});

test('api catalog: pagination bounds follow the shared parsePage contract', () => {
  for (const endpoint of API_ENDPOINTS) {
    const query = endpoint.query ?? [];
    const page = query.find((param) => param.name === 'page');
    const pageSize = query.find((param) => param.name === 'pageSize');

    if (page) {
      assert.equal(page.type, 'integer', `${endpoint.id}/page: type`);
      assert.equal(page.minimum, 1, `${endpoint.id}/page: minimum`);
    }
    if (pageSize) {
      assert.equal(pageSize.type, 'integer', `${endpoint.id}/pageSize: type`);
      assert.equal(pageSize.maximum, 100, `${endpoint.id}/pageSize: maximum`);
      assert.equal(pageSize.minimum, 1, `${endpoint.id}/pageSize: minimum`);
    }
  }
});

test('api catalog: monthly rainfall documents the route filters and station grain', () => {
  const endpoint = API_ENDPOINTS.find((item) => item.id === 'weather-monthly-rainfall');
  assert.ok(endpoint);
  assert.equal(endpoint.path, '/api/v1/weather/monthly-rainfall');
  assert.equal(endpoint.contract, 'hub-v1');
  assert.deepEqual(endpoint.query?.map((param) => param.name), ['provinceCode', 'stationCode', 'year', 'page', 'pageSize']);
  assert.equal(endpoint.query?.find((param) => param.name === 'provinceCode')?.pattern, '^\\d{2}$');
  assert.equal(endpoint.query?.find((param) => param.name === 'stationCode')?.pattern, '^[A-Za-z0-9_-]{3,20}$');
  assert.ok(endpoint.notes?.some((note) => note.includes('สถานี × เดือน')));
  assert.ok(endpoint.notes?.some((note) => note.includes('unit=null')));
});

test('api catalog: CSV export documents its required resource, row limit, and provenance', () => {
  const endpoint = API_ENDPOINTS.find((item) => item.id === 'datasets-export');
  assert.ok(endpoint);
  assert.equal(endpoint.path, '/api/v1/datasets/{id}/export');
  assert.equal(endpoint.contract, 'csv');
  assert.equal(endpoint.responseType, 'text/csv; charset=utf-8');
  assert.equal(endpoint.pathParams?.[0].maxLength, 260);
  assert.equal(endpoint.query?.find((param) => param.name === 'resourceId')?.required, true);
  assert.ok(endpoint.notes?.some((note) => note.includes('1,000 แถว')));
  assert.ok(endpoint.notes?.some((note) => note.includes('datasetVersion')));
});

test('api catalog: beef cattle documents source-year grain and unverified dates and license', () => {
  const endpoint = API_ENDPOINTS.find((item) => item.id === 'livestock-beef-cattle');
  assert.ok(endpoint);
  assert.equal(endpoint.group, 'livestock');
  assert.equal(endpoint.path, '/api/v1/livestock/beef-cattle');
  assert.equal(endpoint.contract, 'hub-v1');
  assert.equal(endpoint.responseType, 'ApiResponse<DldBeefCattleData>');
  assert.deepEqual(endpoint.query?.map((param) => param.name), ['sourceYearBe']);
  assert.equal(endpoint.query?.[0].type, 'integer');
  assert.equal(endpoint.query?.[0].minimum, 2400);
  assert.equal(endpoint.query?.[0].maximum, 9999);
  assert.equal(endpoint.query?.[0].maxLength, 4);
  assert.equal(endpoint.query?.[0].pattern, '^\\d{4}$');
  assert.ok(endpoint.notes?.some((note) => note.includes('จังหวัด × ป้ายปี พ.ศ.')));
  assert.ok(endpoint.notes?.some((note) => note.includes('ปีปฏิทินหรือปีงบประมาณ')));
  assert.ok(endpoint.notes?.some((note) => note.includes('sourceLicenseStatus=unverified')));
  assert.ok(endpoint.notes?.some((note) => note.includes('dataAsOf=null')));
  assert.ok(endpoint.notes?.some((note) => note.includes('null ไม่ใช่ 0')));
  const availabilityNote = endpoint.notes?.find((note) => note.includes('meta.availability=ready'));
  assert.ok(availabilityNote);
  assert.ok(['empty', 'metadata_only'].every((state) => availabilityNote.includes(state)));
  assert.ok(!availabilityNote.includes('unavailable'));
  assert.ok(endpoint.notes?.some((note) => note.includes('HTTP 503 เป็น JSON error DLD_DATA_UNAVAILABLE โดยไม่มี meta')));
  assert.ok(endpoint.notes?.some((note) => note.includes('from/to ไม่รองรับ')));
});

test('api catalog: OAE trade documents opaque year labels, source grain, and availability errors', () => {
  const endpoint = API_ENDPOINTS.find((item) => item.id === 'trade-oae');
  assert.ok(endpoint);
  assert.equal(endpoint.group, 'trade');
  assert.equal(endpoint.path, '/api/v1/trade/oae');
  assert.equal(endpoint.contract, 'hub-v1');
  assert.equal(endpoint.responseType, 'ApiResponse<OaeTradeData>');
  assert.deepEqual(endpoint.query?.map((param) => param.name), ['yearLabel']);
  assert.equal(endpoint.query?.[0].type, 'string');
  assert.equal(endpoint.query?.[0].example, '2568');
  assert.equal(endpoint.query?.[0].maxLength, 80);
  assert.equal(endpoint.query?.[0].pattern, undefined);
  assert.ok(endpoint.notes?.some((note) => note.includes('product × trade type × source-year label')));
  assert.ok(endpoint.notes?.some((note) => note.includes('sourceYearConvention=unknown')));
  assert.ok(endpoint.notes?.some((note) => note.includes('spatialSupport=not_reported') && note.includes('ไม่คำนวณยอดรวม')));
  assert.ok(endpoint.notes?.some((note) => note.includes('unit=ล้านบาท') && note.includes('ไม่แทนด้วย 0')));
  assert.ok(endpoint.notes?.some((note) => note.includes('dataAsOf=null')));
  assert.ok(endpoint.notes?.some((note) => note.includes('attributionText') && note.includes('sourceLicenseStatus=unverified')));
  assert.ok(endpoint.notes?.some((note) => note.includes('ready') && note.includes('empty') && note.includes('metadata_only')));
  assert.ok(endpoint.notes?.some((note) => note.includes('400 INVALID_QUERY')));
  assert.ok(endpoint.notes?.some((note) => note.includes('503 OAE_TRADE_UNAVAILABLE') && note.includes('503 OAE_TRADE_SNAPSHOT_INVALID')));
});
