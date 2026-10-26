import 'server-only';

import {
  PRICE_CATALOGUE_URL,
  PRICE_GRAIN,
  PRICE_ROW_ENDPOINT,
  PRICE_UPSTREAM_PRODUCTS,
  type PriceUpstreamProduct,
} from './price-data';

/**
 * Live reader for the OAE/NABC **daily market price** rows.
 *
 * Upstream (public, no credential):
 *   catalogue : https://agriapi.nabc.go.th/api/daily-prices/product-names
 *   rows      : https://agriapi.nabc.go.th/api/daily-prices/product?product_name=...&limit=100&page=1
 *
 * The upstream row shape (verified 2026-10-26) is:
 *   { data_date, day, month, year_th, product_category, product_name,
 *     market_name, province, day_price, unit }
 *
 * GRAIN: one row = product (commodity + grade as spelled by the source) ×
 * market × province × calendar day × unit. This module never averages,
 * sums or rolls up rows: it only validates, de-duplicates and sorts them.
 * A repeated (product, market, province, date, unit) identity is dropped as a
 * duplicate instead of being counted twice.
 *
 * BOUNDS: one request per product (limit=100, page=1) plus, for the optional
 * reachability probe, one catalogue request. Every request has a timeout and
 * no retry loop; failures degrade to an explicit failure code, never to a
 * fabricated number.
 *
 * GOVERNANCE: the numbers are only published when
 * `PRICE_PUBLICATION_APPROVED` (see `price-data.ts`) is enabled by the
 * Integrator after the exact upstream resource is registered as
 * `approved_public` in `config/resource_licenses.json`.
 */

/** Upstream rows are read one bounded page at a time. */
export const PRICE_UPSTREAM_PAGE_LIMIT = 100;
export const PRICE_UPSTREAM_PAGE = 1;

/** Wall-clock budget for a single upstream request. */
export const PRICE_UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * Some Thai government hosts reject unknown user agents, so the reader sends a
 * browser-like agent with the project identified in the product token.
 */
export const PRICE_UPSTREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/124.0.0.0 Safari/537.36 ThailandAgriculturalDataHub/1.0';

export type PriceUnitStatus = 'declared_by_source' | 'pending_official_confirmation';

export type PriceObservation = {
  /** Exact upstream `product_name` — the commodity and the grade in one string. */
  product: string;
  productCategory: string | null;
  /** The upstream publishes no separate grade column; never inferred. */
  grade: string | null;
  gradeStatus: 'not_published_by_source';
  /** The upstream publishes no price type (farmgate/wholesale); never inferred. */
  priceType: string | null;
  priceTypeStatus: 'not_published_by_source';
  /** Upstream `market_name` (a market, a mill, a trader — whatever the source names). */
  market: string;
  /** Upstream `province`; a name, not a numeric province code. */
  province: string | null;
  /** Upstream `data_date` (Gregorian ISO date the price belongs to). */
  periodStart: string;
  periodLabel: string | null;
  /** Upstream `day_price`; `null` when the source reports the row without a value. */
  value: number | null;
  /** Unit exactly as published by the source; `null` when the row has none. */
  unit: string | null;
  unitStatus: PriceUnitStatus;
  grain: string;
  dataKind: 'observed';
  sourceUrl: string;
  retrievedAt: string;
};

export type PriceProductProbe = {
  productName: string;
  url: string;
  status: number | null;
  ok: boolean;
  /** Rows the upstream returned on the page that was read. */
  upstreamRowCount: number;
  /** Rows that passed validation. */
  acceptedRowCount: number;
  rejectedRowCount: number;
  duplicateRowCount: number;
  /** `pagination.total` as advertised by the upstream. */
  advertisedTotalRows: number | null;
  oldestDate: string | null;
  latestDate: string | null;
  failureCode: string | null;
  retrievedAt: string;
};

export type PriceCatalogueProbe = {
  url: string;
  status: number | null;
  ok: boolean;
  productCount: number | null;
  failureCode: string | null;
  retrievedAt: string;
};

export type PriceSnapshot = {
  observations: PriceObservation[];
  probes: PriceProductProbe[];
  productsRequested: number;
  productsSucceeded: number;
  /** Latest calendar day present in the returned rows. */
  latestDate: string | null;
  /** True when every requested product answered successfully. */
  complete: boolean;
  retrievedAt: string;
};

export type PriceFetcher = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; cache: 'no-store' },
) => Promise<Response>;

function buildProductUrl(productName: string, page: number = PRICE_UPSTREAM_PAGE): string {
  const params = new URLSearchParams({
    product_name: productName,
    limit: String(PRICE_UPSTREAM_PAGE_LIMIT),
    page: String(page),
  });
  return `${PRICE_ROW_ENDPOINT}?${params.toString()}`;
}

function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/**
 * Reads the upstream calendar day of a row and checks it against the source's
 * own `day` / `month` / `year_th` (Buddhist year) fields. A row whose parts
 * disagree is rejected instead of being published.
 */
function readPeriodStart(row: Record<string, unknown>): string | null {
  const date = trimmed(row.data_date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = Number(row.day);
  const month = Number(row.month);
  const yearTh = Number(row.year_th);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(yearTh)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getUTCDate() !== day) return null;
  if (parsed.getUTCMonth() + 1 !== month) return null;
  if (parsed.getUTCFullYear() + 543 !== yearTh) return null;
  return date;
}

/**
 * Reads the upstream price. `null` means "the source reported the row without
 * a value" (missing stays null, never 0); `undefined` means "the value is not
 * a usable number" and rejects the row.
 */
function readPrice(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return undefined;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text.length === 0) return null;
    if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?$/.test(text)) return undefined;
    const parsed = Number(text.replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  if (typeof raw !== 'number') return undefined;
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  return raw;
}

export type NormalisedDailyRows = {
  observations: PriceObservation[];
  rejected: number;
  duplicates: number;
};

/**
 * Validates and normalises one upstream page into publishable observations.
 *
 * Rules (mirroring `src/tadih/daily_prices.py::stage_daily_prices`):
 * - a row must belong to the requested product;
 * - the calendar day must agree with the source's own date parts;
 * - the market name must be present and non-empty;
 * - the unit is taken verbatim, or `null` with
 *   `unitStatus: 'pending_official_confirmation'` when the row has none;
 * - the grade and the price type are never inferred.
 */
export function normalizeDailyPriceRows(
  rawRows: unknown,
  context: { productName: string; sourceUrl: string; retrievedAt: string },
): NormalisedDailyRows {
  if (!Array.isArray(rawRows)) return { observations: [], rejected: 0, duplicates: 0 };
  const observations: PriceObservation[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  let duplicates = 0;

  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') {
      rejected += 1;
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (row.product_name !== context.productName) {
      rejected += 1;
      continue;
    }
    const periodStart = readPeriodStart(row);
    if (!periodStart) {
      rejected += 1;
      continue;
    }
    const market = trimmed(row.market_name);
    if (!market) {
      rejected += 1;
      continue;
    }
    const province = trimmed(row.province);
    const unit = trimmed(row.unit);
    const value = readPrice(row.day_price);
    if (value === undefined) {
      rejected += 1;
      continue;
    }
    const identity = [context.productName, market, province ?? '', periodStart, unit ?? ''].join(' ');
    if (seen.has(identity)) {
      duplicates += 1;
      continue;
    }
    seen.add(identity);
    observations.push({
      product: context.productName,
      productCategory: trimmed(row.product_category),
      grade: null,
      gradeStatus: 'not_published_by_source',
      priceType: null,
      priceTypeStatus: 'not_published_by_source',
      market,
      province,
      periodStart,
      periodLabel: periodStart,
      value,
      unit,
      unitStatus: unit ? 'declared_by_source' : 'pending_official_confirmation',
      grain: PRICE_GRAIN,
      dataKind: 'observed',
      sourceUrl: context.sourceUrl,
      retrievedAt: context.retrievedAt,
    });
  }

  return { observations, rejected, duplicates };
}

function readAdvertisedTotal(payload: Record<string, unknown>): number | null {
  const pagination = payload.pagination;
  if (!pagination || typeof pagination !== 'object') return null;
  const total = (pagination as Record<string, unknown>).total;
  return typeof total === 'number' && Number.isInteger(total) ? total : null;
}

function failedProbe(
  productName: string,
  url: string,
  retrievedAt: string,
  status: number | null,
  failureCode: string,
  upstreamRowCount = 0,
): PriceProductProbe {
  return {
    productName,
    url,
    status,
    ok: false,
    upstreamRowCount,
    acceptedRowCount: 0,
    rejectedRowCount: 0,
    duplicateRowCount: 0,
    advertisedTotalRows: null,
    oldestDate: null,
    latestDate: null,
    failureCode,
    retrievedAt,
  };
}

/**
 * Reads one bounded upstream page for one exact product name.
 *
 * The returned probe always states what happened (HTTP status, advertised
 * total, date range, failure code) so the caller can report the truth without
 * inventing a value.
 */
export async function fetchDailyPricePage(
  productName: string,
  options: { fetcher?: PriceFetcher; timeoutMs?: number } = {},
): Promise<{ probe: PriceProductProbe; observations: PriceObservation[] }> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? PRICE_UPSTREAM_TIMEOUT_MS;
  const url = buildProductUrl(productName);
  const retrievedAt = new Date().toISOString();

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': PRICE_UPSTREAM_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch {
    return {
      probe: failedProbe(productName, url, retrievedAt, null, 'UPSTREAM_UNAVAILABLE'),
      observations: [],
    };
  }

  if (!response.ok) {
    return {
      probe: failedProbe(productName, url, retrievedAt, response.status, `UPSTREAM_HTTP_${response.status}`),
      observations: [],
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      probe: failedProbe(productName, url, retrievedAt, response.status, 'UPSTREAM_INVALID_JSON'),
      observations: [],
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      probe: failedProbe(productName, url, retrievedAt, response.status, 'UPSTREAM_INVALID_PAYLOAD'),
      observations: [],
    };
  }

  const body = payload as Record<string, unknown>;
  if (body.success !== true || !Array.isArray(body.data)) {
    return {
      probe: failedProbe(productName, url, retrievedAt, response.status, 'UPSTREAM_INVALID_PAYLOAD'),
      observations: [],
    };
  }

  const normalised = normalizeDailyPriceRows(body.data, {
    productName,
    sourceUrl: url,
    retrievedAt,
  });
  const dates = normalised.observations.map((row) => row.periodStart).sort();

  return {
    probe: {
      productName,
      url,
      status: response.status,
      ok: true,
      upstreamRowCount: body.data.length,
      acceptedRowCount: normalised.observations.length,
      rejectedRowCount: normalised.rejected,
      duplicateRowCount: normalised.duplicates,
      advertisedTotalRows: readAdvertisedTotal(body),
      oldestDate: dates[0] ?? null,
      latestDate: dates[dates.length - 1] ?? null,
      failureCode: null,
      retrievedAt,
    },
    observations: normalised.observations,
  };
}

/**
 * Reachability probe for the upstream catalogue. It never returns a price; it
 * only proves that the endpoint answers and how many products it offers.
 */
export async function probeDailyPriceCatalogue(
  options: { fetcher?: PriceFetcher; timeoutMs?: number } = {},
): Promise<PriceCatalogueProbe> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? PRICE_UPSTREAM_TIMEOUT_MS;
  const url = PRICE_CATALOGUE_URL;
  const retrievedAt = new Date().toISOString();

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': PRICE_UPSTREAM_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch {
    return { url, status: null, ok: false, productCount: null, failureCode: 'UPSTREAM_UNAVAILABLE', retrievedAt };
  }
  if (!response.ok) {
    return {
      url,
      status: response.status,
      ok: false,
      productCount: null,
      failureCode: `UPSTREAM_HTTP_${response.status}`,
      retrievedAt,
    };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { url, status: response.status, ok: false, productCount: null, failureCode: 'UPSTREAM_INVALID_JSON', retrievedAt };
  }
  const body = payload as Record<string, unknown> | null;
  if (!body || body.success !== true || !Array.isArray(body.data)) {
    return {
      url,
      status: response.status,
      ok: false,
      productCount: null,
      failureCode: 'UPSTREAM_INVALID_PAYLOAD',
      retrievedAt,
    };
  }
  return {
    url,
    status: response.status,
    ok: true,
    productCount: body.data.length,
    failureCode: null,
    retrievedAt,
  };
}

/**
 * Reads the daily market prices of the tracked products.
 *
 * `date` pins one calendar day; without it each product contributes only the
 * latest day it published on its own page (products are never mixed into one
 * day, and no product is ever averaged with another).
 */
export async function readPriceSnapshot(options: {
  date?: string | null;
  products?: PriceUpstreamProduct[];
  fetcher?: PriceFetcher;
  timeoutMs?: number;
} = {}): Promise<PriceSnapshot> {
  const products = options.products ?? PRICE_UPSTREAM_PRODUCTS;
  const fetcher = options.fetcher;
  const timeoutMs = options.timeoutMs;

  const pages = await Promise.all(
    products.map((product) => fetchDailyPricePage(product.productName, { fetcher, timeoutMs })),
  );

  const probes = pages.map((page) => page.probe);
  const observations: PriceObservation[] = [];

  pages.forEach((page, index) => {
    const product = products[index];
    const rows = page.observations;
    if (!rows.length) return;
    let wanted: string | null;
    if (options.date) {
      wanted = options.date;
    } else {
      const dates = rows.map((row) => row.periodStart).sort();
      wanted = dates[dates.length - 1];
    }
    for (const row of rows) {
      if (row.periodStart === wanted) observations.push(row);
    }
  });

  observations.sort((left, right) => {
    if (left.product !== right.product) return left.product.localeCompare(right.product, 'th');
    if (left.market !== right.market) return left.market.localeCompare(right.market, 'th');
    return (left.province ?? '').localeCompare(right.province ?? '', 'th');
  });

  const dates = observations.map((row) => row.periodStart).sort();
  const productsSucceeded = probes.filter((probe) => probe.ok).length;

  return {
    observations,
    probes,
    productsRequested: products.length,
    productsSucceeded,
    latestDate: dates[dates.length - 1] ?? null,
    complete: productsSucceeded === products.length,
    retrievedAt: new Date().toISOString(),
  };
}
