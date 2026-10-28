import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPriceTrendPageHref,
  fetchPriceSeriesPage,
  parsePriceSeriesPage,
  priceSeriesPager,
  resolvePriceSeriesSelection,
  SERIES_PAGE_SIZE,
} from '../components/price-trend-pagination.ts';

test('series page query accepts bounded positive pages and reports invalid input', () => {
  assert.deepEqual(parsePriceSeriesPage(null), { page: 1, valid: true });
  assert.deepEqual(parsePriceSeriesPage('12'), { page: 12, valid: true });
  assert.deepEqual(parsePriceSeriesPage('0'), { page: 1, valid: false });
  assert.deepEqual(parsePriceSeriesPage('10001'), { page: 1, valid: false });
  assert.deepEqual(parsePriceSeriesPage('1e2'), { page: 1, valid: false });
});

test('series pager reports the selected range and offers a recovery target for an out-of-range deep link', () => {
  assert.deepEqual(priceSeriesPager({ page: 2, pageSize: 50, total: 123 }), {
    pageCount: 3, recoveryPage: 3, rangeStart: 51, rangeEnd: 100, outOfRange: false,
  });
  assert.deepEqual(priceSeriesPager({ page: 9, pageSize: 50, total: 123 }), {
    pageCount: 3, recoveryPage: 3, rangeStart: 0, rangeEnd: 0, outOfRange: true,
  });
  assert.deepEqual(priceSeriesPager({ page: 1, pageSize: 50, total: 0 }), {
    pageCount: 0, recoveryPage: 1, rangeStart: 0, rangeEnd: 0, outOfRange: false,
  });
  assert.deepEqual(priceSeriesPager({ page: 2, pageSize: 50, total: 0 }), {
    pageCount: 0, recoveryPage: 1, rangeStart: 0, rangeEnd: 0, outOfRange: true,
  });
});

test('an explicit series deep link never falls back to a different series on the current page', () => {
  const page = [{ id: 'visible-series' }];
  assert.deepEqual(resolvePriceSeriesSelection(page, 'deep-linked-series', 75), {
    kind: 'not_on_page',
  });
  assert.deepEqual(resolvePriceSeriesSelection(page, 'visible-series', 75), {
    kind: 'selected', series: page[0],
  });
  assert.deepEqual(resolvePriceSeriesSelection(page, '', 1), {
    kind: 'selected', series: page[0],
  });
  assert.deepEqual(resolvePriceSeriesSelection(page, '', 75), { kind: 'choose' });
});

test('page links preserve dataset, resource, deep-linked series and date filters', () => {
  const href = buildPriceTrendPageHref({
    dataset: 'dataset/one', resourceId: 'resource-1', series: 'v2.abc', from: '2025-01', to: '2025-12',
  }, 3);
  const url = new URL(href, 'https://hub.test');
  assert.equal(url.pathname, '/explore');
  assert.equal(url.searchParams.get('view'), 'price_trend');
  assert.equal(url.searchParams.get('dataset'), 'dataset/one');
  assert.equal(url.searchParams.get('resourceId'), 'resource-1');
  assert.equal(url.searchParams.get('series'), 'v2.abc');
  assert.equal(url.searchParams.get('seriesPage'), '3');
  assert.equal(url.searchParams.get('from'), '2025-01');
  assert.equal(url.searchParams.get('to'), '2025-12');
});

test('series-page fetch reads one requested page with the fixed 50-row page size', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const result = await fetchPriceSeriesPage<{ id: string }>({
    dataset: 'dataset-1', resourceId: 'resource-1', page: 4, signal: new AbortController().signal,
    fetcher: async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({
        data: [{ id: 'series-4' }],
        pagination: { page: 4, pageSize: SERIES_PAGE_SIZE, total: 201 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(calls.length, 1, 'changing one page does not scan or prefetch other pages');
  const request = new URL(calls[0].input, 'https://hub.test');
  assert.equal(request.searchParams.get('page'), '4');
  assert.equal(request.searchParams.get('pageSize'), '50');
  assert.equal(result.data[0].id, 'series-4');
  assert.deepEqual(result.pagination, { page: 4, pageSize: 50, total: 201 });
});
