import type { WaterReservoirRecord } from './water-data';

/** Rows per page in the reservoir table; the API paginates the same set. */
export const WATER_TABLE_PAGE_SIZE = 25;

export function waterRegions(records: readonly WaterReservoirRecord[]): string[] {
  const regions = new Set<string>();
  for (const record of records) {
    if (record.region) regions.add(record.region);
  }
  return [...regions].sort((a, b) => a.localeCompare(b, 'th'));
}

export function filterWaterReservoirs(
  records: readonly WaterReservoirRecord[],
  options: { query?: string | null; region?: string | null } = {},
): WaterReservoirRecord[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const region = options.region ?? null;
  return records.filter((record) => {
    if (region && record.region !== region) return false;
    if (!query) return true;
    const haystack = `${record.name ?? ''} ${record.reservoirId}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function paginateWaterReservoirs(
  records: readonly WaterReservoirRecord[],
  page: number,
  pageSize: number = WATER_TABLE_PAGE_SIZE,
): { rows: WaterReservoirRecord[]; page: number; pageCount: number; total: number } {
  const total = records.length;
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (current - 1) * size;
  return { rows: records.slice(start, start + size), page: current, pageCount, total };
}
