/**
 * Contract tests for the OAE/NABC daily market-price reader.
 *
 * The tests are hermetic: the upstream is replaced by a local stub, so no
 * request leaves the process. They pin the rules that matter for this dataset:
 * one number per commodity/grade × market × province × day × unit, never an
 * aggregate, missing stays null, and nothing is published while the licence
 * register withholds the resource.
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

test('the route withholds every number while the licence gate is closed', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('upstream call is forbidden while the register withholds the resource');
  }) as typeof fetch;

  try {
    const response = await pricesRoute.GET(new Request(HUB_ORIGIN + '/api/v1/prices/daily'));
    const body = (await response.json()) as {
      data: { source: { sourceId: string; access: string }; commodities: unknown[]; prices: unknown[] };
      meta: { availability: string; access: string; completeness: string; warnings: string[] };
    };

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.data.source.sourceId, 'oae-nabc-prices');
    assert.equal(body.data.source.access, 'metadata_only');
    assert.ok(body.data.commodities.length > 0);
    assert.deepEqual(body.data.prices, []);
    assert.equal(body.meta.availability, 'metadata_only');
    assert.equal(body.meta.access, 'metadata_only');
    assert.equal(body.meta.completeness, 'unknown');
    assert.ok(body.meta.warnings.length > 0);
    assert.equal(fetchCalls, 0, 'no upstream call while the register withholds the resource');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a malformed date is rejected with 400 INVALID_QUERY', async () => {
  const response = await pricesRoute.GET(new Request(HUB_ORIGIN + '/api/v1/prices/daily?date=2026-13-40'));
  const body = (await response.json()) as { error: { code: string; message: string; requestId: string } };
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_QUERY');
  assert.equal(typeof body.error.requestId, 'string');
});

test('the publication switch is closed and the upstream names are the official ones', () => {
  assert.equal(priceData.PRICE_PUBLICATION_APPROVED, false);
  assert.equal(priceData.PRICE_SOURCE_METADATA.access, 'metadata_only');
  assert.equal(priceData.PRICE_SOURCE_METADATA.licenseStatus, 'pending');
  assert.equal(priceData.PRICE_SOURCE_METADATA.publicationApproved, false);
  assert.equal(priceData.PRICE_UPSTREAM_PRODUCTS.length, 6);
  for (const product of priceData.PRICE_UPSTREAM_PRODUCTS) {
    assert.ok(product.productName.trim().length > 0);
    const metadata = priceData.getCommodityById(product.commodityId);
    assert.ok(metadata, 'every upstream product maps to a tracked commodity');
    assert.equal(metadata.sourceProductName, product.productName);
    assert.equal(metadata.licenseStatus, 'pending');
    assert.equal(metadata.access, 'metadata_only');
  }
});
