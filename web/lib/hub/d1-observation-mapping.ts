import type { HubObservation } from './types';

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function mapD1Observation(row: Row): HubObservation {
  let rawDimensions = row.dimensions;
  if (typeof rawDimensions === 'string') {
    try { rawDimensions = JSON.parse(rawDimensions); } catch { rawDimensions = null; }
  }
  const dimensions = rawDimensions && typeof rawDimensions === 'object' && !Array.isArray(rawDimensions)
    ? rawDimensions as HubObservation['dimensions']
    : {};
  return {
    rowKey: String(row.rowKey),
    seriesId: String(row.seriesId),
    periodStart: text(row.periodStart),
    periodEnd: text(row.periodEnd),
    periodLabel: text(row.periodLabel),
    locationCode: text(row.locationCode),
    locationKind: text(row.locationKind),
    locationName: text(row.locationName),
    provinceCode: text(row.provinceCode),
    cropCode: text(row.cropCode),
    cropName: text(row.cropName),
    metricId: text(row.metricId),
    metricName: text(row.metricName),
    product: text(row.product),
    grade: text(row.grade),
    market: text(row.market),
    unit: text(row.unit),
    value: number(row.value),
    dimensions,
    qualityStatus: text(row.qualityStatus) ?? 'unknown',
    sourceRowRef: text(row.sourceRowRef),
  };
}
