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
  'crops',
  'soil',
  'areas',
  'prices',
] as const;

const EXPECTED_ENDPOINT_IDS = [
  'sources-list',
  'sources-status',
  'datasets-list',
  'datasets-detail',
  'datasets-records',
  'datasets-series',
  'series-observations',
  'weather-overview',
  'water-reservoirs',
  'crops-reference',
  'soil-reference',
  'areas-evidence',
  'prices-daily',
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

test('api catalog: exactly 8 groups and 13 endpoints in the documented order', () => {
  assert.equal(API_GROUPS.length, 8);
  assert.deepEqual(
    API_GROUPS.map((group) => group.id),
    [...EXPECTED_GROUP_IDS],
  );

  assert.equal(API_ENDPOINTS.length, 13);
  assert.deepEqual(
    API_ENDPOINTS.map((endpoint) => endpoint.id),
    [...EXPECTED_ENDPOINT_IDS],
  );
  assert.equal(new Set(API_ENDPOINTS.map((endpoint) => endpoint.id)).size, 13);
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
      ['hub-v1', 'domain'].includes(endpoint.contract),
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
