/**
 * Contract tests for the OAE/NABC daily market-price reader.
 *
 * The tests are hermetic: the upstream is replaced by a local stub, so no
 * request leaves the process. They pin the rules that matter for this dataset:
 * one number per commodity/grade × market × province × day × unit, never an
 * aggregate, missing stays null, and the open publication switch publishes the
 * real upstream rows while an upstream failure stays empty.
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

const priceRepository = await import('../lib/hub/price-repository.ts');
const priceData = await import('../lib/hub/price-data.ts');
const pricesRoute = await import('../app/api/v1/prices/daily/route.ts');

const HUB_ORIGIN = 'http://hub.local';
const JASMINE = 'ข้าวเปลือกเจ้าหอมมะลิ 105';
const WHITE_RICE = 'ข้าวเปลือกเจ้าพันธุ์สุพรรณบุรี ความชื้น 15%';
const RUBBER = 'ยางพาราแผ่นดิบ ชั้น 3';

function upstreamRow(overrides: Record<string, unknown> = {}) {
  return {
    data_date: '2026-10-26',
    day: '26',
    month: '10',
    year_th: '2569',
    product_category: 'ข้าวหอมมะลิ',
    product_name: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
    market_name: 'โรงสีกิจทวียโสธร',
    province: 'ยโสธร',
    day_price: 14400,
    unit: 'บาท/ตัน',
    ...overrides,
  };
}

function upstreamResponse(rows: unknown[], pagination: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      success: true,
      data: rows,
      pagination: { limit: 100, offset: 0, page: 1, count: rows.length, total: rows.length, ...pagination },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

type PriceRouteBody = {
  data: {
    source: {
      sourceId: string;
      access: string;
      licenseStatus: string;
      publicationApproved: boolean;
    };
    commodities: Array<{
      id: string;
      name: string;
      category: string;
      unit: string;
      sourceProductName: string | null;
    }>;
    prices: Array<{
      product: string;
      market: string;
      province: string | null;
      periodStart: string;
      value: number | null;
      unit: string | null;
      grade: string | null;
      priceType: string | null;
      grain: string;
      dataKind: string;
    }>;
  };
  meta: {
    availability: string;
    access: string;
    freshness: string;
    completeness: string;
    dataAsOf: string | null;
    sourceUpdatedAt: string | null;
    sourceRetrievedAt: string | null;
    datasetVersion: string | null;
    warnings: string[];
  };
};

/**
 * Replaces `globalThis.fetch` with a page of NABC rows per tracked product.
 * Two commodities carry prices, one carries an explicit null price, and the
 * remaining products answer with an empty page.
 */
function installUpstreamStub() {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const productName = new URL(raw).searchParams.get('product_name') ?? '';
    calls.push(productName);
    if (productName === JASMINE) {
      return upstreamResponse(
        [
          upstreamRow(),
          upstreamRow({ data_date: '2026-10-25', day: '25', market_name: 'โรงสีเก่า', day_price: 14300 }),
        ],
        { total: 2 },
      );
    }
    if (productName === RUBBER) {
      return upstreamResponse(
        [
          upstreamRow({
            product_name: RUBBER,
            product_category: 'ยางพารา',
            market_name: 'ตลาดกลางยางพารา นครศรีธรรมราช',
            province: 'นครศรีธรรมราช',
            day_price: 85.3,
            unit: 'บาท/กก.',
          }),
        ],
        { total: 1 },
      );
    }
    if (productName === WHITE_RICE) {
      return upstreamResponse(
        [
          upstreamRow({
            product_name: WHITE_RICE,
            product_category: 'ข้าว',
            market_name: 'โรงสีสุพรรณบุรี',
            province: 'สุพรรณบุรี',
            day_price: null,
            unit: 'บาท/ตัน',
          }),
        ],
        { total: 1 },
      );
    }
    return upstreamResponse([], { total: 0 });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

/**
 * Records every upstream `product_name` the code asks for and answers each
 * product with its own bounded page. A product with no entry answers empty.
 */
function installRowsStub(rowsByProduct: Record<string, unknown[]> = {}) {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const productName = new URL(raw).searchParams.get('product_name') ?? '';
    calls.push(productName);
    const rows = rowsByProduct[productName] ?? [];
    return upstreamResponse(rows, { total: rows.length });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function forceProbeOff(): () => void {
  const original = process.env.PRICE_UPSTREAM_PROBE;
  process.env.PRICE_UPSTREAM_PROBE = '0';
  return () => {
    if (original === undefined) delete process.env.PRICE_UPSTREAM_PROBE;
    else process.env.PRICE_UPSTREAM_PROBE = original;
  };
}

test('a row keeps its own commodity, market, unit and grade status', () => {
  const { observations, rejected, duplicates } = priceRepository.normalizeDailyPriceRows(
    [upstreamRow()],
    {
      productName: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
      sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product',
      retrievedAt: '2026-10-26T00:00:00.000Z',
    },
  );

  assert.equal(rejected, 0);
  assert.equal(duplicates, 0);
  assert.equal(observations.length, 1);
  const row = observations[0];
  assert.equal(row.product, 'ข้าวเปลือกเจ้าหอมมะลิ 105');
  assert.equal(row.market, 'โรงสีกิจทวียโสธร');
  assert.equal(row.province, 'ยโสธร');
  assert.equal(row.unit, 'บาท/ตัน');
  assert.equal(row.unitStatus, 'declared_by_source');
  assert.equal(row.value, 14400);
  assert.equal(row.periodStart, '2026-10-26');
  // The source publishes neither a grade column nor a price type: they stay null.
  assert.equal(row.grade, null);
  assert.equal(row.gradeStatus, 'not_published_by_source');
  assert.equal(row.priceType, null);
  assert.equal(row.priceTypeStatus, 'not_published_by_source');
});

test('a row without a price keeps null and a row without a unit asks for confirmation', () => {
  const { observations } = priceRepository.normalizeDailyPriceRows(
    [upstreamRow({ day_price: null }), upstreamRow({ market_name: 'ตลาดกลาง', unit: '' })],
    {
      productName: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
      sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product',
      retrievedAt: '2026-10-26T00:00:00.000Z',
    },
  );
  assert.equal(observations.length, 2);
  assert.equal(observations[0].value, null, 'missing price must stay null, never 0');
  assert.equal(observations[1].unit, null);
  assert.equal(observations[1].unitStatus, 'pending_official_confirmation');
});

test('a repeated market identity is dropped instead of being counted twice', () => {
  const { observations, duplicates } = priceRepository.normalizeDailyPriceRows(
    [upstreamRow(), upstreamRow()],
    {
      productName: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
      sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product',
      retrievedAt: '2026-10-26T00:00:00.000Z',
    },
  );
  assert.equal(observations.length, 1);
  assert.equal(duplicates, 1);
});

test('a row whose date parts disagree with the source is rejected', () => {
  const { observations, rejected } = priceRepository.normalizeDailyPriceRows(
    [upstreamRow({ day: '25' }), upstreamRow({ year_th: '2568' }), upstreamRow()],
    {
      productName: 'ข้าวเปลือกเจ้าหอมมะลิ 105',
      sourceUrl: 'https://agriapi.nabc.go.th/api/daily-prices/product',
      retrievedAt: '2026-10-26T00:00:00.000Z',
    },
  );
  assert.equal(rejected, 2);
  assert.equal(observations.length, 1);
});

test('the snapshot publishes one day per product and never mixes products', async () => {
  const jasmine = 'ข้าวเปลือกเจ้าหอมมะลิ 105';
  const rubber = 'ยางพาราแผ่นดิบ ชั้น 3';
  const calls: string[] = [];
  const fetcher = (url: string) => {
    calls.push(url);
    if (new URL(url).searchParams.get('product_name') === jasmine) {
      return Promise.resolve(
        upstreamResponse(
          [
            upstreamRow(),
            upstreamRow({ data_date: '2026-10-25', day: '25', market_name: 'โรงสีเก่า', day_price: 14300 }),
          ],
          { total: 2 },
        ),
      );
    }
    return Promise.resolve(
      upstreamResponse(
        [
          upstreamRow({
            product_name: rubber,
            product_category: 'ยางพารา',
            market_name: 'ตลาดกลางยางพารา นครศรีธรรมราช',
            province: 'นครศรีธรรมราช',
            day_price: 85.3,
            unit: 'บาท/กก.',
          }),
        ],
        { total: 1 },
      ),
    );
  };

  const snapshot = await priceRepository.readPriceSnapshot({
    products: [
      { commodityId: 'jasmine-rice', productName: jasmine },
      { commodityId: 'rubber-sheet', productName: rubber },
    ],
    fetcher,
  });

  assert.equal(calls.length, 2, 'one bounded upstream request per product');
  assert.equal(snapshot.observations.length, 2);
  assert.equal(snapshot.latestDate, '2026-10-26');
  assert.equal(snapshot.complete, true);
  // The older jasmine row of the same page is not published next to the latest day.
  assert.deepEqual(
    snapshot.observations.map((row) => row.periodStart),
    ['2026-10-26', '2026-10-26'],
  );
  const rubberRow = snapshot.observations.find((row) => row.product === rubber);
  assert.ok(rubberRow, 'the rubber row is published with its own product name');
  assert.equal(rubberRow.unit, 'บาท/กก.', 'units are never converted or merged');
  assert.equal(rubberRow.value, 85.3);
  const jasmineRow = snapshot.observations.find((row) => row.product === jasmine);
  assert.ok(jasmineRow);
  assert.equal(jasmineRow.unit, 'บาท/ตัน');
  assert.equal(jasmineRow.value, 14400);
});

test('a pinned date returns only that day', async () => {
  const jasmine = 'ข้าวเปลือกเจ้าหอมมะลิ 105';
  const fetcher = () =>
    Promise.resolve(
      upstreamResponse(
        [
          upstreamRow(),
          upstreamRow({ data_date: '2026-10-25', day: '25', market_name: 'โรงสีเก่า', day_price: 14300 }),
        ],
        { total: 2 },
      ),
    );

  const snapshot = await priceRepository.readPriceSnapshot({
    date: '2026-10-25',
    products: [{ commodityId: 'jasmine-rice', productName: jasmine }],
    fetcher,
  });
  assert.equal(snapshot.observations.length, 1);
  assert.equal(snapshot.observations[0].periodStart, '2026-10-25');
  assert.equal(snapshot.observations[0].value, 14300);
});

test('an unreachable upstream is reported, never replaced by a number', async () => {
  const fetcher = () => Promise.reject(new Error('network down'));
  const snapshot = await priceRepository.readPriceSnapshot({
    products: [{ commodityId: 'jasmine-rice', productName: 'ข้าวเปลือกเจ้าหอมมะลิ 105' }],
    fetcher,
  });
  assert.equal(snapshot.observations.length, 0);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.probes[0].failureCode, 'UPSTREAM_UNAVAILABLE');
});

test('the open publication switch publishes the real NABC rows per grain', async () => {
  const stub = installUpstreamStub();
  const restoreProbe = forceProbeOff();

  try {
    const response = await pricesRoute.GET(new Request(HUB_ORIGIN + '/api/v1/prices/daily'));
    const body = (await response.json()) as PriceRouteBody;

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.data.source.sourceId, 'oae-nabc-prices');
    assert.equal(body.data.source.licenseStatus, 'approved_public');
    assert.equal(body.data.source.access, 'approved_public');
    assert.equal(body.data.source.publicationApproved, true);
    assert.ok(body.data.commodities.length > 0);
    assert.equal(body.meta.access, 'approved_public');
    assert.equal(body.meta.availability, 'ready');
    assert.equal(body.meta.freshness, 'unknown');
    assert.equal(body.meta.completeness, 'complete');
    assert.equal(body.meta.dataAsOf, '2026-10-26');
    assert.equal(body.meta.sourceUpdatedAt, null);
    assert.match(body.meta.sourceRetrievedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(body.meta.datasetVersion, null);
    assert.ok(body.meta.warnings.some((warning) => warning.includes('เกณฑ์ความสด')));
    assert.equal(stub.calls.length, priceData.PRICE_UPSTREAM_PRODUCTS.length, 'one bounded request per tracked product');
    assert.deepEqual(
      [...stub.calls].sort(),
      priceData.PRICE_UPSTREAM_PRODUCTS.map((product) => product.productName).sort(),
    );

    assert.equal(body.data.prices.length, 3, 'only rows with an accepted grain are published');
    const jasmine = body.data.prices.filter((row) => row.product === JASMINE);
    assert.equal(jasmine.length, 1, 'the older jasmine day on the same page is not published');
    assert.equal(jasmine[0].market, 'โรงสีกิจทวียโสธร');
    assert.equal(jasmine[0].province, 'ยโสธร');
    assert.equal(jasmine[0].periodStart, '2026-10-26');
    assert.equal(jasmine[0].value, 14400);
    assert.equal(jasmine[0].unit, 'บาท/ตัน');
    assert.equal(jasmine[0].grade, null, 'the grade stays inside the source product name');
    assert.equal(jasmine[0].priceType, null, 'the source publishes no price type');
    assert.equal(jasmine[0].grain, priceData.PRICE_GRAIN);
    assert.equal(jasmine[0].dataKind, 'observed');

    const rubber = body.data.prices.find((row) => row.product === RUBBER);
    assert.ok(rubber, 'rubber stays its own product with its own unit');
    assert.equal(rubber.market, 'ตลาดกลางยางพารา นครศรีธรรมราช');
    assert.equal(rubber.value, 85.3);
    assert.equal(rubber.unit, 'บาท/กก.');

    const missing = body.data.prices.find((row) => row.product === WHITE_RICE);
    assert.ok(missing, 'a row without a price is still reported as an observed row');
    assert.equal(missing.value, null, 'missing stays null, never 0');
    assert.equal(missing.unit, 'บาท/ตัน');
    assert.equal(missing.market, 'โรงสีสุพรรณบุรี');
  } finally {
    stub.restore();
    restoreProbe();
  }
});

test('an unreachable upstream makes the open route answer empty without inventing values', async () => {
  const originalFetch = globalThis.fetch;
  const restoreProbe = forceProbeOff();
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  try {
    const response = await pricesRoute.GET(new Request(HUB_ORIGIN + '/api/v1/prices/daily'));
    const body = (await response.json()) as PriceRouteBody;

    assert.equal(response.status, 200);
    assert.equal(body.meta.access, 'approved_public');
    assert.equal(body.meta.availability, 'empty');
    assert.equal(body.meta.completeness, 'unknown');
    assert.equal(body.meta.dataAsOf, null);
    assert.deepEqual(body.data.prices, [], 'no row and no zero placeholder is published');
    assert.ok(body.meta.warnings.some((warning) => warning.includes('UPSTREAM_UNAVAILABLE')));
  } finally {
    globalThis.fetch = originalFetch;
    restoreProbe();
  }
});

test('a malformed date is rejected with 400 INVALID_QUERY', async () => {
  const response = await pricesRoute.GET(new Request(HUB_ORIGIN + '/api/v1/prices/daily?date=2026-13-40'));
  const body = (await response.json()) as { error: { code: string; message: string; requestId: string } };
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_QUERY');
  assert.equal(typeof body.error.requestId, 'string');
});

test('the publication switch is open and the upstream names are the official ones', () => {
  assert.equal(priceData.PRICE_PUBLICATION_APPROVED, true);
  assert.equal(priceData.PRICE_SOURCE_METADATA.access, 'approved_public');
  assert.equal(priceData.PRICE_SOURCE_METADATA.licenseStatus, 'approved_public');
  assert.equal(priceData.PRICE_SOURCE_METADATA.publicationApproved, true);
  assert.ok(priceData.PRICE_WARNINGS.some((warning) => warning.includes('เกรด')));
  assert.ok(priceData.PRICE_WARNINGS.some((warning) => warning.includes('ประเภทราคา')));
  assert.ok(priceData.PRICE_WARNINGS.some((warning) => warning.includes('เฉลี่ย')));
  assert.equal(priceData.PRICE_UPSTREAM_PRODUCTS.length, 6);
  for (const product of priceData.PRICE_UPSTREAM_PRODUCTS) {
    assert.ok(product.productName.trim().length > 0);
    const metadata = priceData.getCommodityById(product.commodityId);
    assert.ok(metadata, 'every upstream product maps to a tracked commodity');
    assert.equal(metadata.sourceProductName, product.productName);
    assert.equal(metadata.licenseStatus, 'approved_public');
    assert.equal(metadata.access, 'approved_public');
  }
});

test('a category resolves to the mapped upstream products of that category only', () => {
  const names = (products: { productName: string }[]) => products.map((product) => product.productName).sort();
  const all = priceData.PRICE_UPSTREAM_PRODUCTS;

  assert.deepEqual(names(priceRepository.findUpstreamProducts()), names(all), 'no category keeps every product');
  assert.deepEqual(names(priceRepository.findUpstreamProducts('all')), names(all), 'all keeps every product');
  assert.deepEqual(names(priceRepository.findUpstreamProducts('')), names(all), 'a blank category is not a filter');

  const rice = priceRepository.findUpstreamProducts('ข้าว');
  assert.deepEqual(
    rice.map((product) => product.commodityId).sort(),
    ['jasmine-rice', 'white-rice'],
  );
  assert.deepEqual(names(rice), [JASMINE, WHITE_RICE].sort());
  for (const product of rice) {
    const metadata = priceData.getCommodityById(product.commodityId);
    assert.ok(metadata, 'the mapped commodity exists');
    assert.equal(metadata.category, 'ข้าว', 'the filter uses the existing commodityId mapping');
  }

  assert.deepEqual(priceRepository.findUpstreamProducts('unknown'), [], 'an unknown category maps to nothing');
  assert.deepEqual(
    priceRepository.findUpstreamProducts('ปศุสัตว์'),
    [],
    'a category without a tracked upstream product maps to nothing instead of falling back to all products',
  );
});

test('a snapshot with no product to read makes no request and is not complete', async () => {
  const calls: string[] = [];
  const fetcher = (url: string) => {
    calls.push(url);
    return Promise.resolve(upstreamResponse([], { total: 0 }));
  };

  const snapshot = await priceRepository.readPriceSnapshot({
    products: priceRepository.findUpstreamProducts('unknown'),
    fetcher,
  });

  assert.deepEqual(calls, [], 'nothing is requested for an empty selection');
  assert.deepEqual(snapshot.observations, []);
  assert.deepEqual(snapshot.probes, []);
  assert.equal(snapshot.productsRequested, 0);
  assert.equal(snapshot.productsSucceeded, 0);
  assert.equal(snapshot.latestDate, null);
  assert.equal(snapshot.complete, false, 'zero requests is never evidence of a complete read');
});

test('category=ข้าว filters the rows and only requests the rice products', async () => {
  const stub = installRowsStub({
    [JASMINE]: [upstreamRow()],
    [WHITE_RICE]: [
      upstreamRow({
        product_name: WHITE_RICE,
        product_category: 'ข้าว',
        market_name: 'โรงสีสุพรรณบุรี',
        province: 'สุพรรณบุรี',
        day_price: null,
      }),
    ],
    [RUBBER]: [
      upstreamRow({
        product_name: RUBBER,
        product_category: 'ยางพารา',
        market_name: 'ตลาดกลางยางพารา นครศรีธรรมราช',
        province: 'นครศรีธรรมราช',
        day_price: 85.3,
        unit: 'บาท/กก.',
      }),
    ],
  });
  const restoreProbe = forceProbeOff();

  try {
    const response = await pricesRoute.GET(
      new Request(HUB_ORIGIN + '/api/v1/prices/daily?category=' + encodeURIComponent('ข้าว')),
    );
    const body = (await response.json()) as PriceRouteBody;

    assert.equal(response.status, 200);
    assert.deepEqual(
      [...stub.calls].sort(),
      [JASMINE, WHITE_RICE].sort(),
      'only the products of the selected category are requested',
    );
    assert.deepEqual(
      body.data.commodities.map((commodity) => commodity.id).sort(),
      ['jasmine-rice', 'white-rice'],
    );
    assert.equal(body.data.prices.length, 2, 'one row per product, market and day');
    assert.deepEqual(body.data.prices.map((row) => row.product).sort(), [JASMINE, WHITE_RICE].sort());
    assert.equal(
      body.data.prices.some((row) => row.product === RUBBER),
      false,
      'no row outside the selected category is published',
    );

    const missing = body.data.prices.find((row) => row.product === WHITE_RICE);
    assert.ok(missing, 'the rice row without a price is still published');
    assert.equal(missing.value, null, 'a missing price stays null inside a filtered category');
    assert.equal(missing.unit, 'บาท/ตัน');
    assert.equal(missing.grade, null);
    assert.equal(missing.priceType, null);

    assert.equal(body.meta.availability, 'ready');
    assert.equal(body.meta.completeness, 'complete', 'both selected products answered');
    assert.equal(body.meta.dataAsOf, '2026-10-26');
  } finally {
    stub.restore();
    restoreProbe();
  }
});

test('an unknown category answers empty without touching any upstream product', async () => {
  const stub = installRowsStub({
    [JASMINE]: [upstreamRow()],
    [RUBBER]: [
      upstreamRow({
        product_name: RUBBER,
        product_category: 'ยางพารา',
        market_name: 'ตลาดกลางยางพารา นครศรีธรรมราช',
        province: 'นครศรีธรรมราช',
        day_price: 85.3,
        unit: 'บาท/กก.',
      }),
    ],
  });
  const restoreProbe = forceProbeOff();

  try {
    const response = await pricesRoute.GET(new Request(HUB_ORIGIN + '/api/v1/prices/daily?category=unknown'));
    const body = (await response.json()) as PriceRouteBody;

    assert.equal(response.status, 200, 'an unknown category is not an error');
    assert.deepEqual(body.data.commodities, []);
    assert.deepEqual(body.data.prices, [], 'no row of another category leaks through the filter');
    assert.deepEqual(stub.calls, [], 'the upstream of every tracked product is not requested');
    assert.equal(body.meta.availability, 'empty');
    assert.equal(body.meta.completeness, 'unknown');
    assert.equal(body.meta.dataAsOf, null);
    assert.ok(
      body.meta.warnings.some((warning) => warning.includes('ไม่มีการเรียกต้นทาง')),
      'the empty response explains that nothing was requested',
    );
    assert.equal(
      body.meta.warnings.some((warning) => warning.includes('ไม่มีแถวของวันที่ต้องการในหน้าที่อ่าน')),
      false,
      'a response that made no request must not claim an upstream page was read',
    );
    assert.equal(JSON.stringify(body).includes('"complete"'), false, 'the snapshot is not reported as complete');
  } finally {
    stub.restore();
    restoreProbe();
  }
});

test('unknown category does not probe upstream even when diagnostics are enabled', async () => {
  const previous = process.env.PRICE_UPSTREAM_PROBE;
  const stub = installRowsStub({});
  process.env.PRICE_UPSTREAM_PROBE = '1';
  try {
    const response = await pricesRoute.GET(new Request(HUB_ORIGIN + '/api/v1/prices/daily?category=unknown'));
    assert.equal(response.status, 200);
    assert.deepEqual(stub.calls, []);
  } finally {
    stub.restore();
    if (previous === undefined) delete process.env.PRICE_UPSTREAM_PROBE;
    else process.env.PRICE_UPSTREAM_PROBE = previous;
  }
});

test('category and date are applied together', async () => {
  const stub = installRowsStub({
    [JASMINE]: [
      upstreamRow(),
      upstreamRow({ data_date: '2026-10-25', day: '25', market_name: 'โรงสีเก่า', day_price: 14300 }),
    ],
    [RUBBER]: [
      upstreamRow({
        product_name: RUBBER,
        product_category: 'ยางพารา',
        data_date: '2026-10-25',
        day: '25',
        market_name: 'ตลาดกลางยางพารา',
        province: 'นครศรีธรรมราช',
        day_price: 85.3,
        unit: 'บาท/กก.',
      }),
    ],
  });
  const restoreProbe = forceProbeOff();

  try {
    const response = await pricesRoute.GET(
      new Request(
        HUB_ORIGIN
        + '/api/v1/prices/daily?category=' + encodeURIComponent('ข้าว') + '&date=2026-10-25',
      ),
    );
    const body = (await response.json()) as PriceRouteBody;

    assert.equal(response.status, 200);
    assert.deepEqual([...stub.calls].sort(), [JASMINE, WHITE_RICE].sort());
    assert.equal(body.data.prices.length, 1, 'only the pinned day of the selected category is published');
    assert.equal(body.data.prices[0].product, JASMINE);
    assert.equal(body.data.prices[0].periodStart, '2026-10-25');
    assert.equal(body.data.prices[0].value, 14300);
    assert.equal(body.data.prices[0].market, 'โรงสีเก่า');
    assert.equal(body.meta.dataAsOf, '2026-10-25');
    assert.deepEqual(
      body.data.commodities.map((commodity) => commodity.id).sort(),
      ['jasmine-rice', 'white-rice'],
    );
  } finally {
    stub.restore();
    restoreProbe();
  }
});

test('a filtered category with an unreachable upstream stays empty, never a zero price', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const restoreProbe = forceProbeOff();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(new URL(raw).searchParams.get('product_name') ?? '');
    throw new Error('offline unit test: upstream unreachable');
  }) as typeof fetch;

  try {
    const response = await pricesRoute.GET(
      new Request(
        HUB_ORIGIN + '/api/v1/prices/daily?category=' + encodeURIComponent('ยางพาราและปาล์ม'),
      ),
    );
    const body = (await response.json()) as PriceRouteBody;

    assert.equal(response.status, 200);
    assert.deepEqual(
      calls.sort(),
      [RUBBER, 'ผลปาล์มน้ำมันทั้งทะลาย คละ'].sort(),
      'the request stays inside the selected category even when it fails',
    );
    assert.deepEqual(body.data.prices, [], 'a failure is not published as a price of zero');
    assert.equal(body.meta.availability, 'empty');
    assert.equal(body.meta.completeness, 'unknown');
    assert.equal(body.meta.dataAsOf, null);
    assert.ok(
      body.meta.warnings.some((warning) => warning.includes('UPSTREAM_UNAVAILABLE')),
      'the failed products are named with their failure code',
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreProbe();
  }
});

test('a malformed date is rejected with 400 even when a category is present', async () => {
  const response = await pricesRoute.GET(
    new Request(HUB_ORIGIN + '/api/v1/prices/daily?category=unknown&date=2026-02-30'),
  );
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_QUERY');
});
