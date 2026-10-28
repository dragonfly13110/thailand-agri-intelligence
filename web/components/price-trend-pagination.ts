export const SERIES_PAGE_SIZE = 50;
export const MAX_SERIES_PAGE = 10_000;

export type SeriesPagination = {
  page: number;
  pageSize: number;
  total: number;
};

export type PriceSeriesPage<T> = {
  data: T[];
  pagination: SeriesPagination;
};

export function parsePriceSeriesPage(raw: string | null): { page: number; valid: boolean } {
  if (raw === null) return { page: 1, valid: true };
  if (!/^\d{1,5}$/.test(raw)) return { page: 1, valid: false };
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_SERIES_PAGE
    ? { page, valid: true }
    : { page: 1, valid: false };
}

export function priceSeriesPager(pagination: SeriesPagination) {
  const pageCount = pagination.pageSize > 0 ? Math.ceil(pagination.total / pagination.pageSize) : 0;
  const outOfRange = pageCount > 0 ? pagination.page > pageCount : pagination.page > 1;
  return {
    pageCount,
    recoveryPage: pageCount > 0 ? pageCount : 1,
    rangeStart: pagination.total === 0 || outOfRange ? 0 : (pagination.page - 1) * pagination.pageSize + 1,
    rangeEnd: pagination.total === 0 || outOfRange ? 0 : Math.min(pagination.page * pagination.pageSize, pagination.total),
    outOfRange,
  };
}

export function resolvePriceSeriesSelection<T extends { id: string }>(
  series: T[], requestedId: string, total: number,
): { kind: 'selected'; series: T } | { kind: 'not_on_page' } | { kind: 'choose' } {
  if (requestedId) {
    const selected = series.find((item) => item.id === requestedId);
    return selected ? { kind: 'selected', series: selected } : { kind: 'not_on_page' };
  }
  if (total === 1 && series.length === 1) return { kind: 'selected', series: series[0] };
  return { kind: 'choose' };
}

export function buildPriceTrendPageHref(input: {
  dataset: string;
  resourceId: string;
  series: string;
  from: string;
  to: string;
}, page: number): string {
  const params = new URLSearchParams({ view: 'price_trend' });
  if (input.dataset) params.set('dataset', input.dataset);
  if (input.resourceId) params.set('resourceId', input.resourceId);
  if (input.series) params.set('series', input.series);
  if (input.from) params.set('from', input.from);
  if (input.to) params.set('to', input.to);
  params.set('seriesPage', String(page));
  return '/explore?' + params.toString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPagination(value: unknown): value is SeriesPagination {
  if (!isObject(value)) return false;
  return ['page', 'pageSize', 'total'].every((key) =>
    Number.isSafeInteger(value[key]) && Number(value[key]) >= (key === 'total' ? 0 : 1),
  );
}

export async function fetchPriceSeriesPage<T>(input: {
  dataset: string;
  resourceId: string;
  page: number;
  signal: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<PriceSeriesPage<T>> {
  if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > MAX_SERIES_PAGE) {
    throw new Error('หน้ารายการอนุกรมไม่ถูกต้อง');
  }
  const params = new URLSearchParams({
    resourceId: input.resourceId,
    page: String(input.page),
    pageSize: String(SERIES_PAGE_SIZE),
  });
  const response = await (input.fetcher ?? fetch)(
    '/api/v1/datasets/' + encodeURIComponent(input.dataset) + '/series?' + params.toString(),
    { signal: input.signal, headers: { accept: 'application/json' } },
  );
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = isObject(body) && 'error' in body ? body.error : null;
    const message = isObject(error) && typeof error.message === 'string'
      ? error.message
      : 'อ่านข้อมูลราคาจาก API ไม่สำเร็จ';
    throw new Error(message);
  }
  if (!isObject(body) || !Array.isArray(body.data) || !isPagination(body.pagination)) {
    throw new Error('รูปแบบรายการอนุกรมไม่ถูกต้อง');
  }
  if (body.pagination.page !== input.page || body.pagination.pageSize !== SERIES_PAGE_SIZE) {
    throw new Error('หน้ารายการอนุกรมที่ API ส่งกลับไม่ตรงกับที่ขอ');
  }
  return { data: body.data as T[], pagination: body.pagination };
}
