/**
 * Governance containment regression tests (AI-1).
 *
 * These tests pin the public contract for resources whose licence is still
 * `pending`: metadata-only envelopes, explicit sample flags, no-store caching,
 * deterministic simulated rows, and no real RID/OAE values or counts in the
 * public payloads. They run fully in-memory; no upstream request is made.
 *
 * The runner uses `node --experimental-strip-types`, so the same
 * module-resolution/transpilation hooks as `hub-data-domains.test.ts` are
 * installed locally. No production file is modified.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    }
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

const waterRoute = await import('../app/api/v1/water/reservoirs/route.ts');
const pricesRoute = await import('../app/api/v1/prices/daily/route.ts');
const earlyWarningRoute = await import('../app/api/v1/early-warning/route.ts');
const weatherEngineRoute = await import('../app/api/v1/weather-engine/route.ts');
const earlyWarning = await import('../lib/hub/early-warning-data.ts');

const HUB_ORIGIN = 'http://hub.local';

type ApiMeta = {
  availability: string;
  freshness: string;
  completeness: string;
  access: string;
  sourceIds: string[];
  dataAsOf: string | null;
  datasetVersion: string | null;
  warnings: string[];
  runtimeMode: string;
  retrievedAt: string;
};

type WaterBody = {
  data: {
    source: {
      sourceId: string;
      licenseStatus: string;
      access: string;
      publicationApproved: boolean;
    };
    reservoirs: unknown[];
    summary: unknown;
  };
  meta: ApiMeta;
  pagination: { page: number; pageSize: number; total: number };
};

type PricesBody = {
  data: {
    source: {
      sourceId: string;
      licenseStatus: string;
      access: string;
      publicationApproved: boolean;
    };
    commodities: Array<Record<string, unknown>>;
    prices: unknown[];
  };
  meta: ApiMeta;
};

type EarlyWarningBody = {
  data: {
    sample: boolean;
    bannerText: string;
    disclaimer: string;
    summary: {
      totalReservoirs: number;
      sample: boolean;
      headline: string;
    };
    provinces: Array<{ keyReservoirs: string[] }>;
    criticalReservoirsSummary: {
      totalCritical: number;
      sampleList: Array<{ id: string; name: string; type: string }>;
    };
  };
  meta: ApiMeta;
};

type ErrorBody = {
  error: { code: string; message: string; requestId: string };
};

function readText(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

async function call(
  handler: (request: Request) => Response | Promise<Response>,
  path: string,
) {
  const response = await handler(new Request(HUB_ORIGIN + path));
  return { response, body: await response.json() };
}

function assertMetadataOnly(meta: ApiMeta, label: string) {
  assert.equal(meta.access, 'metadata_only', `${label}: access`);
  assert.equal(meta.availability, 'metadata_only', `${label}: availability`);
  assert.equal(meta.completeness, 'unknown', `${label}: completeness`);
  assert.equal(meta.freshness, 'unknown', `${label}: freshness`);
  assert.ok(meta.warnings.length > 0, `${label}: warnings must explain the hold`);
  assert.equal(meta.dataAsOf, null, `${label}: dataAsOf must not imply observed data`);
}

function assertNoStore(response: Response, label: string) {
  assert.equal(response.headers.get('cache-control'), 'no-store', `${label}: cache-control`);
}

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
  return out;
}

function assertNoKeys(value: unknown, banned: string[], label: string) {
  const present = collectKeys(value);
  const found = banned.filter((key) => present.has(key));
  assert.deepEqual(found, [], `${label}: forbidden numeric keys present: ${found.join(', ')}`);
}

function assertAbsent(haystack: string, sentinels: string[], label: string) {
  for (const sentinel of sentinels) {
    assert.equal(
      haystack.includes(sentinel),
      false,
      `${label}: leaked forbidden value "${sentinel}"`,
    );
  }
}

/**
 * RID is `approved_public` in the register, so the source flags must tell the
 * truth. Numbers still may not appear unless the repository read an active
 * approved numeric batch; with D1 unreachable this route must degrade to the
 * metadata-only envelope rather than a 5xx or an empty-but-"ready" answer.
 */
test('water reservoirs route reports the approved register but hides numbers without a readable batch', async () => {
  const { response, body } = await call(
    waterRoute.GET,
    '/api/v1/water/reservoirs?page=1&pageSize=25',
  );
  const payload = body as WaterBody;

  assert.equal(response.status, 200);
  assertNoStore(response, 'water');

  assert.equal(payload.data.source.sourceId, 'rid');
  assert.equal(payload.data.source.licenseStatus, 'approved_public');
  assert.equal(payload.data.source.access, 'approved_public');
  assert.equal(payload.data.source.publicationApproved, true);
  assert.deepEqual(payload.data.reservoirs, [], 'water: no reservoir rows without an approved batch');
  assert.equal(payload.data.summary, null, 'water: summary must be null, never zero');
  assert.equal(payload.pagination.total, 0, 'water: pagination total must be zero rows');
  assertMetadataOnly(payload.meta, 'water');
  assert.equal(payload.meta.runtimeMode, 'source_api_fallback', 'water: fallback must not claim database mode');

  assertNoKeys(
    payload.data,
    ['capacity', 'capacityMcm', 'volume', 'volumeMcm', 'percent', 'storage', 'storagePercent', 'inflow', 'outflow', 'reservoirCount', 'totalReservoirs'],
    'water',
  );
  assertAbsent(
    JSON.stringify(payload.data),
    ['461', 'rsv01', 'ห้วยแม่ออน', '100.18', '73.51'],
    'water',
  );
});

test('daily prices route is metadata-only and carries no OAE prices', async () => {
  const { response, body } = await call(pricesRoute.GET, '/api/v1/prices/daily');
  const payload = body as PricesBody;

  assert.equal(response.status, 200);
  assertNoStore(response, 'prices');

  assert.equal(payload.data.source.sourceId, 'oae-nabc-prices');
  assert.equal(payload.data.source.licenseStatus, 'pending');
  assert.equal(payload.data.source.access, 'metadata_only');
  assert.equal(payload.data.source.publicationApproved, false);
  assert.ok(payload.data.commodities.length > 0, 'prices: commodity metadata should remain');
  for (const commodity of payload.data.commodities) {
    assert.equal(commodity.licenseStatus, 'pending', 'prices: commodity licence');
    assert.equal(commodity.access, 'metadata_only', 'prices: commodity access');
  }
  assert.deepEqual(payload.data.prices, [], 'prices: numeric series must be empty');
  assertMetadataOnly(payload.meta, 'prices');

  assertNoKeys(
    payload.data,
    ['price', 'priceDate', 'pricePerUnit', 'change', 'percentChange', 'history', 'series', 'trend'],
    'prices',
  );
  assertAbsent(JSON.stringify(payload.data), ['15200', '9100', '65.5', '9.45'], 'prices');
});

test('early-warning route is deterministic simulation only', async () => {
  const first = await call(earlyWarningRoute.GET, '/api/v1/early-warning');
  const second = await call(earlyWarningRoute.GET, '/api/v1/early-warning');
  const payload = first.body as EarlyWarningBody;
  const replay = second.body as EarlyWarningBody;

  assert.equal(first.response.status, 200);
  assertNoStore(first.response, 'early-warning');
  assert.equal(payload.data.sample, true, 'early-warning: sample flag');
  assert.equal(payload.data.summary.sample, true, 'early-warning: summary sample flag');
  assert.match(payload.data.bannerText, /Simulation/i, 'early-warning: simulation banner');
  assert.match(payload.data.disclaimer, /ไม่ได้ใช้ค่าจริง/, 'early-warning: disclaimer');
  assertMetadataOnly(payload.meta, 'early-warning');
  assert.deepEqual(payload.meta.sourceIds, ['early-warning-simulation']);

  assert.equal(
    payload.data.summary.totalReservoirs,
    earlyWarning.SIMULATED_RESERVOIRS.length,
    'early-warning: total must equal the simulated universe',
  );
  assert.notEqual(payload.data.summary.totalReservoirs, 461, 'early-warning: must not reuse RID count');
  assert.equal(payload.data.summary.headline.includes('461'), false, 'early-warning: headline count');

  for (const province of payload.data.provinces) {
    for (const name of province.keyReservoirs) {
      assert.ok(name.startsWith('อ่างเก็บน้ำจำลอง'), `early-warning: non-simulated name ${name}`);
    }
  }
  for (const reservoir of payload.data.criticalReservoirsSummary.sampleList) {
    assert.match(reservoir.id, /^sim-rsv-\d+-\d+$/, 'early-warning: synthetic id');
    assert.ok(
      reservoir.name.startsWith('อ่างเก็บน้ำจำลอง'),
      `early-warning: synthetic name ${reservoir.name}`,
    );
  }
  assertAbsent(JSON.stringify(payload.data), ['ห้วยแม่ออน'], 'early-warning');

  assert.deepEqual(
    JSON.stringify(payload.data),
    JSON.stringify(replay.data),
    'early-warning: payload must be deterministic between calls',
  );
});

test('weather-engine is withheld with 503 and never calls upstream', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('upstream fetch is forbidden in governance tests');
  }) as typeof fetch;

  try {
    const { response, body } = await call(weatherEngineRoute.GET, '/api/v1/weather-engine');
    const payload = body as ErrorBody;

    assert.equal(response.status, 503, 'weather-engine: withheld status');
    assertNoStore(response, 'weather-engine');
    assert.equal(payload.error.code, 'SOURCE_UNAVAILABLE');
    assert.equal(typeof payload.error.requestId, 'string');
    assert.ok(payload.error.requestId.length > 0, 'weather-engine: requestId');
    assert.match(payload.error.message, /pending/, 'weather-engine: rights message');

    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes('approved_public'), false, 'weather-engine: approved_public');
    assert.equal(serialized.includes('"complete"'), false, 'weather-engine: completeness complete');
    assert.equal(serialized.includes('"availability":"ready"'), false, 'weather-engine: ready');
    assert.equal(fetchCalls, 0, 'weather-engine: must not fetch upstream');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('owned sources contain no public cache directive or removed real-data imports', () => {
  const routes = {
    water: readText('../app/api/v1/water/reservoirs/route.ts'),
    prices: readText('../app/api/v1/prices/daily/route.ts'),
    earlyWarning: readText('../app/api/v1/early-warning/route.ts'),
    weatherEngine: readText('../app/api/v1/weather-engine/route.ts'),
  };

  for (const [name, source] of Object.entries(routes)) {
    assert.equal(
      /cache-control[^\n]*(public|max-age|s-maxage)/i.test(source),
      false,
      `${name}: public cache directive`,
    );
  }

  for (const name of ['water', 'prices'] as const) {
    assert.equal(routes[name].includes('fetch('), false, `${name}: route must not fetch upstream`);
  }
  assert.equal(
    routes.weatherEngine.includes('open-meteo-client'),
    false,
    'weather-engine: must not import the Open-Meteo client',
  );
  assert.equal(routes.weatherEngine.includes('fetch('), false, 'weather-engine: no fetch');

  const earlyWarningSource = readText('../lib/hub/early-warning-data.ts');
  assert.equal(
    /from\s+['"]\.\/water-data['"]/.test(earlyWarningSource),
    false,
    'early-warning: must not import water-data',
  );
  assert.equal(earlyWarningSource.includes('Math.random'), false, 'early-warning: randomness');

  const homeSource = readText('../app/page.tsx');
  for (const removed of ['getWaterSummary', 'COMMODITY_PRICES', '461', '15200', 'ห้วยแม่ออน', '1,237', 'สถิติรายอำเภอ']) {
    assert.equal(homeSource.includes(removed), false, `home: leaked removed value ${removed}`);
  }

  const earlyWarningPage = readText('../app/early-warning/page.tsx');
  assert.match(
    earlyWarningPage,
    /export const dynamic = 'force-dynamic'/,
    'early-warning page: must opt out of the shared HTML cache',
  );
});

test('licence register counts match the checked registry', () => {
  const registry = JSON.parse(
    readText('../../config/resource_licenses.json'),
  ) as { reviewed_at: string; resources: Array<{ license_status: string }> };

  const counts: Record<string, number> = {};
  for (const resource of registry.resources) {
    counts[resource.license_status] = (counts[resource.license_status] ?? 0) + 1;
  }

  assert.equal(registry.resources.length, 87, 'registry: total');
  assert.equal(counts.pending, 79, 'registry: pending');
  assert.equal(counts.approved_public, 8, 'registry: approved_public');
  assert.equal(registry.reviewed_at, '2026-10-26', 'registry: reviewed_at');

  // The register doc must restate the registry counts, so the pins are derived
  // from the registry itself: a new round that flips a resource to
  // approved_public fails here until the doc is refreshed in the same change.
  const doc = readText('../../docs/source-license-register.md');
  for (const expected of [
    `**${registry.resources.length} รายการ**`,
    `\`approved_public\` **${counts.approved_public ?? 0} รายการ**`,
    `\`pending\` **${counts.pending ?? 0} รายการ**`,
  ]) {
    assert.ok(doc.includes(expected), `register doc must state "${expected}"`);
  }
  assert.match(
    doc,
    /RID\/TMD เปิดตามหนังสืออนุมัติของเจ้าของระบบ/,
    'register doc: owner authorisation basis must be stated',
  );
});
