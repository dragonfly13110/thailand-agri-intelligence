import 'server-only';
import { countD1, queryD1 } from './d1';
import { mapD1Observation } from './d1-observation-mapping';
import { completeness, freshness, HubRequestError, jsonData, parseDate, parsePage, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import type { ApiMeta, HubObservation, HubSeries } from './types';

type Row = Record<string, unknown>;
type DatasetInfo = { sourceId: string; freshnessDays: number | null; hasNumeric: boolean; numericStatus: 'succeeded' | 'partial' | null };

const observationFrom =
  ' FROM observations o ' +
  'JOIN resources r ON r.resource_id=o.resource_id AND r.active_run_id=o.run_id ' +
  "JOIN sync_runs run ON run.run_id=o.run_id AND run.resource_id=o.resource_id AND run.kind='numeric' AND run.status IN ('succeeded','partial') " +
  'JOIN datasets d ON d.dataset_id=r.dataset_id ' +
  'JOIN sources s ON s.source_id=d.source_id ';

const publicConditions = [
  "d.metadata_access_status IN ('approved_public','metadata_only')",
  "s.metadata_access_status IN ('approved_public','metadata_only')",
  "r.access_status='approved_public'",
  'r.project_publication_approved=1',
].join(' AND ');

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function datasetId(value: string) {
  if (!value || value.length > 260) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  return value;
}

async function getDatasetInfo(id: string): Promise<DatasetInfo> {
  const rows = await queryD1<Row>(
    'SELECT d.source_id AS sourceId,s.freshness_days AS freshnessDays,' +
      'EXISTS (SELECT 1 FROM resources r JOIN sync_runs run ON run.resource_id=r.resource_id AND run.run_id=r.active_run_id ' +
      "WHERE r.dataset_id=d.dataset_id AND r.access_status='approved_public' AND r.project_publication_approved=1 " +
      "AND run.kind='numeric' AND run.status IN ('succeeded','partial')) AS hasNumeric," +
      'EXISTS (SELECT 1 FROM resources r JOIN sync_runs run ON run.resource_id=r.resource_id AND run.run_id=r.active_run_id ' +
      "WHERE r.dataset_id=d.dataset_id AND r.access_status='approved_public' AND r.project_publication_approved=1 " +
      "AND run.kind='numeric' AND run.status='partial') AS hasPartial " +
      'FROM datasets d JOIN sources s ON s.source_id=d.source_id ' +
      "WHERE d.dataset_id=? AND d.metadata_access_status IN ('approved_public','metadata_only') " +
      "AND s.metadata_access_status IN ('approved_public','metadata_only')",
    [id]
  );
  if (!rows.length) throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  return {
    sourceId: String(rows[0].sourceId),
    freshnessDays: number(rows[0].freshnessDays),
    hasNumeric: Number(rows[0].hasNumeric) === 1,
    numericStatus: Number(rows[0].hasPartial) === 1 ? 'partial' : Number(rows[0].hasNumeric) === 1 ? 'succeeded' : null,
  };
}

async function parseFilters(url: URL, values: unknown[], includeResource: boolean) {
  const conditions: string[] = [];
  const resourceId = includeResource ? parseText(url, 'resourceId', 260) : '';
  const provinceCode = parseText(url, 'provinceCode', 2);
  const cropCode = parseText(url, 'cropCode', 80);
  const from = parseDate(url, 'from');
  const to = parseDate(url, 'to');
  if (provinceCode && !await isSupportedProvinceCode(provinceCode)) throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
  if (from && to && from > to) throw new HubRequestError(400, 'INVALID_QUERY', 'ช่วงวันที่ไม่ถูกต้อง');
  if (resourceId) { conditions.push('r.resource_id=?'); values.push(resourceId); }
  if (provinceCode) { conditions.push('o.province_code=?'); values.push(provinceCode); }
  if (cropCode) { conditions.push('o.crop_code=?'); values.push(cropCode); }
  if (from) { conditions.push('o.period_end>=?'); values.push(from); }
  if (to) { conditions.push('o.period_start<=?'); values.push(to); }
  return conditions;
}

function observationSelect() {
  return "SELECT o.row_key AS rowKey,r.resource_id || '|' || o.series_key AS seriesId," +
    'o.period_start AS periodStart,o.period_end AS periodEnd,o.period_label AS periodLabel,' +
    'o.location_code AS locationCode,o.location_kind AS locationKind,o.location_name AS locationName,' +
    'o.province_code AS provinceCode,o.crop_code AS cropCode,o.crop_name AS cropName,' +
    'o.metric_id AS metricId,o.metric_name AS metricName,o.product,o.grade,o.market,o.unit,o.value,' +
    'o.dimensions,o.quality_status AS qualityStatus,o.source_row_ref AS sourceRowRef' + observationFrom;
}

async function observationStats(where: string, values: unknown[]) {
  const rows = await queryD1<Row>(
    'SELECT count(*) AS total,max(o.period_end) AS dataAsOf,max(r.source_updated_at) AS sourceUpdatedAt,' +
      'max(run.source_retrieved_at) AS sourceRetrievedAt,' +
      'CASE WHEN count(DISTINCT run.run_id)=1 THEN max(coalesce(run.payload_sha256,run.run_id)) ELSE NULL END AS datasetVersion ' +
      observationFrom + 'WHERE ' + where,
    values
  );
  return rows[0] ?? {};
}

function numericMeta(info: DatasetInfo, stats: Row, hasRows: boolean): Partial<ApiMeta> {
  return {
    availability: hasRows ? 'ready' : info.hasNumeric ? 'empty' : 'metadata_only',
    freshness: freshness(text(stats.sourceUpdatedAt), info.freshnessDays),
    completeness: info.numericStatus ? completeness(info.numericStatus) : 'unknown',
    access: info.hasNumeric ? 'approved_public' : 'metadata_only',
    sourceIds: [info.sourceId],
    dataAsOf: text(stats.dataAsOf),
    sourceUpdatedAt: text(stats.sourceUpdatedAt),
    sourceRetrievedAt: text(stats.sourceRetrievedAt),
    datasetVersion: text(stats.datasetVersion),
    warnings: info.numericStatus === 'partial'
      ? ['ชุดนี้มีข้อมูลตัวอย่างบางส่วน ยังไม่ครอบคลุมข้อมูลทั้งหมดของทรัพยากร']
      : info.hasNumeric ? [] : ['ชุดข้อมูลนี้มีเฉพาะ metadata ที่ค้นพบ ยังไม่มีตัวเลขที่อนุมัติให้เผยแพร่'],
    runtimeMode: 'database',
  };
}

function empty<T>(info: DatasetInfo, page: { page: number; pageSize: number; total: number }) {
  return jsonData<T[]>([], {
    meta: numericMeta(info, {}, false),
    pagination: page,
  });
}

export async function listD1Records(id: string, url: URL) {
  id = datasetId(id);
  const page = parsePage(url);
  const info = await getDatasetInfo(id);
  if (!info.hasNumeric) return empty<HubObservation>(info, page);

  const values: unknown[] = [id];
  const conditions = ['d.dataset_id=?', publicConditions, ...await parseFilters(url, values, true)];
  const where = conditions.join(' AND ');
  const stats = await observationStats(where, values);
  const total = Number(stats.total ?? 0);
  const rows = await queryD1<Row>(
    observationSelect() + 'WHERE ' + where + ' ORDER BY o.period_end DESC NULLS LAST,o.row_key LIMIT ? OFFSET ?',
    [...values, page.pageSize, (page.page - 1) * page.pageSize]
  );
  return jsonData(rows.map(mapD1Observation), {
    meta: numericMeta(info, stats, total > 0),
    pagination: { ...page, total },
  });
}

export async function listD1Series(id: string, url: URL) {
  id = datasetId(id);
  const page = parsePage(url);
  const info = await getDatasetInfo(id);
  if (!info.hasNumeric) return empty<HubSeries>(info, page);

  const values: unknown[] = [id];
  const conditions = ['d.dataset_id=?', publicConditions];
  const resourceId = parseText(url, 'resourceId', 260);
  const product = parseText(url, 'product', 120);
  const metric = parseText(url, 'metric', 120);
  if (resourceId) { conditions.push('r.resource_id=?'); values.push(resourceId); }
  if (product) { conditions.push('o.product=?'); values.push(product); }
  if (metric) { conditions.push('(o.metric_id=? OR o.metric_name=?)'); values.push(metric, metric); }
  const where = conditions.join(' AND ');
  const countRows = await queryD1<{ total: number | string }>(
    'SELECT count(*) AS total FROM (SELECT r.resource_id,o.series_key' + observationFrom +
      'WHERE ' + where + ' GROUP BY r.resource_id,o.series_key)',
    values
  );
  const stats = await observationStats(where, values);
  const total = Number(countRows[0]?.total ?? 0);
  const rows = await queryD1<Row>(
    "SELECT r.resource_id || '|' || o.series_key AS id,r.resource_id AS resourceId," +
      'max(o.product) AS product,max(o.grade) AS grade,max(o.market) AS market,max(o.unit) AS unit,' +
      'max(o.metric_id) AS metricId,max(o.metric_name) AS metricName,max(o.crop_name) AS cropName,' +
      'count(*) AS observationCount,min(o.period_start) AS fromDate,max(o.period_end) AS toDate' + observationFrom +
      'WHERE ' + where + ' GROUP BY r.resource_id,o.series_key ' +
      'ORDER BY max(o.product),max(o.metric_name),r.resource_id,o.series_key LIMIT ? OFFSET ?',
    [...values, page.pageSize, (page.page - 1) * page.pageSize]
  );
  const data: HubSeries[] = rows.map(row => ({
    id: String(row.id), resourceId: String(row.resourceId), product: text(row.product), grade: text(row.grade),
    market: text(row.market), unit: text(row.unit), metricId: text(row.metricId), metricName: text(row.metricName),
    cropName: text(row.cropName), observationCount: Number(row.observationCount), from: text(row.fromDate), to: text(row.toDate),
  }));
  return jsonData(data, { meta: numericMeta(info, stats, total > 0), pagination: { ...page, total } });
}

export async function listD1SeriesObservations(id: string, url: URL) {
  if (!id || id.length > 600) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  const separator = id.indexOf('|');
  if (separator < 1 || separator === id.length - 1) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  const resourceId = id.slice(0, separator);
  const seriesKey = id.slice(separator + 1);
  const page = parsePage(url);
  const visibleWhere = publicConditions + ' AND r.resource_id=? AND o.series_key=?';
  const visible = await queryD1<Row>(
    'SELECT s.source_id AS sourceId,s.freshness_days AS freshnessDays,run.status AS numericStatus' + observationFrom +
      'WHERE ' + visibleWhere + ' LIMIT 1',
    [resourceId, seriesKey]
  );
  if (!visible.length) throw new HubRequestError(404, 'SERIES_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const numericStatus = text(visible[0].numericStatus) === 'partial' ? 'partial' : 'succeeded';
  const info: DatasetInfo = {
    sourceId: String(visible[0].sourceId), freshnessDays: number(visible[0].freshnessDays), hasNumeric: true, numericStatus,
  };

  const values: unknown[] = [resourceId, seriesKey];
  const conditions = [publicConditions, 'r.resource_id=?', 'o.series_key=?'];
  const from = parseDate(url, 'from');
  const to = parseDate(url, 'to');
  if (from && to && from > to) throw new HubRequestError(400, 'INVALID_QUERY', 'ช่วงวันที่ไม่ถูกต้อง');
  if (from) { conditions.push('o.period_end>=?'); values.push(from); }
  if (to) { conditions.push('o.period_start<=?'); values.push(to); }
  const where = conditions.join(' AND ');
  const stats = await observationStats(where, values);
  const total = Number(stats.total ?? 0);
  const rows = await queryD1<Row>(
    observationSelect() + 'WHERE ' + where + ' ORDER BY o.period_end DESC NULLS LAST,o.row_key LIMIT ? OFFSET ?',
    [...values, page.pageSize, (page.page - 1) * page.pageSize]
  );
  return jsonData(rows.map(mapD1Observation), { meta: numericMeta(info, stats, total > 0), pagination: { ...page, total } });
}

/**
 * Generic observations read shared by every numeric connector lane.
 *
 * Only published rows are visible: the resource must be approved for
 * publication and the row must belong to the resource's active numeric run
 * (`sync_runs.kind='numeric'` with status succeeded/partial). Every filter
 * value is bound as a parameter; nothing is interpolated into the SQL string.
 * `period_start`/`period_end` carry the observation instant, so the returned
 * `observedAt` mirrors the canonical contract's `observed_at` field.
 */
export const D1_OBSERVATION_ROW_LIMIT = 500;

export interface D1ObservationFilters {
  sourceId?: string;
  resourceId?: string;
  seriesKey?: string;
  metricId?: string;
  provinceCode?: string;
  areaCode?: string;
  locationKind?: string;
  cropCode?: string;
  /** Inclusive lower bound on the observation period (YYYY-MM-DD). */
  from?: string;
  /** Inclusive upper bound on the observation period (YYYY-MM-DD). */
  to?: string;
}

export interface D1ObservationRow {
  resourceId: string;
  runId: string;
  runStatus: string | null;
  rowKey: string;
  seriesKey: string;
  sourceId: string;
  datasetId: string | null;
  adapterVersion: string | null;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  runCompletedAt: string | null;
  observedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationKind: string | null;
  locationName: string | null;
  provinceCode: string | null;
  cropCode: string | null;
  cropName: string | null;
  metricId: string | null;
  metricName: string | null;
  product: string | null;
  grade: string | null;
  market: string | null;
  unit: string | null;
  value: number | null;
  dimensions: Record<string, string | number | boolean | null>;
  qualityStatus: string | null;
  quality: Record<string, unknown>;
  sourceRowRef: string | null;
}

const LOCATION_KINDS = ['country', 'province', 'district', 'subdistrict', 'station', 'reservoir', 'grid'];

function filterId(value: string | undefined, name: string, maxLength: number): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > maxLength || value.includes('%')) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า ' + name + ' ไม่ถูกต้อง');
  }
  return value;
}

function filterDate(value: string | undefined, name: string): string {
  if (value === undefined || value === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HubRequestError(400, 'INVALID_QUERY', 'วันที่ ' + name + ' ไม่ถูกต้อง');
  return value;
}

function observationConditions(filters: D1ObservationFilters): { where: string; values: unknown[] } {
  const values: unknown[] = [];
  const conditions: string[] = [publicConditions];
  const sourceId = filterId(filters.sourceId, 'sourceId', 80);
  const resourceId = filterId(filters.resourceId, 'resourceId', 260);
  const seriesKey = filterId(filters.seriesKey, 'seriesKey', 260);
  const metricId = filterId(filters.metricId, 'metricId', 120);
  const cropCode = filterId(filters.cropCode, 'cropCode', 80);
  const locationKind = filterId(filters.locationKind, 'locationKind', 20);
  const provinceCode = filterId(filters.provinceCode || filters.areaCode, 'provinceCode', 2);
  const from = filterDate(filters.from, 'from');
  const to = filterDate(filters.to, 'to');
  if (from && to && from > to) throw new HubRequestError(400, 'INVALID_QUERY', 'ช่วงวันที่ไม่ถูกต้อง');
  if (locationKind && !LOCATION_KINDS.includes(locationKind)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ระดับตำแหน่งที่ไม่รองรับ');
  }
  if (provinceCode && !/^\d{2}$/.test(provinceCode)) throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
  if (sourceId) { conditions.push('d.source_id=?'); values.push(sourceId); }
  if (resourceId) { conditions.push('r.resource_id=?'); values.push(resourceId); }
  if (seriesKey) { conditions.push('o.series_key=?'); values.push(seriesKey); }
  if (metricId) { conditions.push('o.metric_id=?'); values.push(metricId); }
  if (provinceCode) { conditions.push('o.province_code=?'); values.push(provinceCode); }
  if (locationKind) { conditions.push('o.location_kind=?'); values.push(locationKind); }
  if (cropCode) { conditions.push('o.crop_code=?'); values.push(cropCode); }
  if (from) { conditions.push('o.period_end>=?'); values.push(from); }
  if (to) { conditions.push('o.period_start<=?'); values.push(to); }
  return { where: conditions.join(' AND '), values };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapGenericObservation(row: Row): D1ObservationRow {
  const dimensions = jsonRecord(row.dimensions) as Record<string, string | number | boolean | null>;
  return {
    resourceId: String(row.resourceId),
    runId: String(row.runId),
    runStatus: text(row.runStatus),
    rowKey: String(row.rowKey),
    seriesKey: String(row.seriesKey),
    sourceId: String(row.sourceId),
    datasetId: text(row.datasetId),
    adapterVersion: text(row.adapterVersion),
    payloadSha256: text(row.payloadSha256),
    sourceRetrievedAt: text(row.sourceRetrievedAt),
    runCompletedAt: text(row.runCompletedAt),
    observedAt: text(row.periodStart),
    periodStart: text(row.periodStart),
    periodEnd: text(row.periodEnd),
    periodLabel: text(row.periodLabel),
    locationId: text(row.locationId),
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
    qualityStatus: text(row.qualityStatus),
    quality: jsonRecord(row.quality),
    sourceRowRef: text(row.sourceRowRef),
  };
}

/**
 * Read published observations for any approved source/metric/province grain.
 * The result is capped at `D1_OBSERVATION_ROW_LIMIT` rows per call.
 */
export async function listD1Observations(
  filters: D1ObservationFilters = {},
  options: { limit?: number; offset?: number } = {}
): Promise<{ rows: D1ObservationRow[]; total: number }> {
  const { where, values } = observationConditions(filters);
  const requested = Math.trunc(Number(options.limit ?? 100));
  const limit = Math.min(Math.max(Number.isFinite(requested) && requested > 0 ? requested : 100, 1), D1_OBSERVATION_ROW_LIMIT);
  const offset = Math.max(Math.trunc(Number(options.offset ?? 0)) || 0, 0);
  const rows = await queryD1<Row>(
    'SELECT o.resource_id AS resourceId,o.run_id AS runId,run.status AS runStatus,' +
      'o.row_key AS rowKey,o.series_key AS seriesKey,d.source_id AS sourceId,d.dataset_id AS datasetId,' +
      'run.adapter_version AS adapterVersion,run.payload_sha256 AS payloadSha256,' +
      'run.source_retrieved_at AS sourceRetrievedAt,run.completed_at AS runCompletedAt,' +
      'o.period_start AS periodStart,o.period_end AS periodEnd,o.period_label AS periodLabel,' +
      'o.location_id AS locationId,o.location_code AS locationCode,o.location_kind AS locationKind,' +
      'o.location_name AS locationName,o.province_code AS provinceCode,o.crop_code AS cropCode,o.crop_name AS cropName,' +
      'o.metric_id AS metricId,o.metric_name AS metricName,o.product,o.grade,o.market,o.unit,o.value,' +
      'o.dimensions,o.quality_status AS qualityStatus,o.quality,o.source_row_ref AS sourceRowRef' + observationFrom +
      'WHERE ' + where + ' ORDER BY o.period_end DESC NULLS LAST,o.row_key LIMIT ? OFFSET ?',
    [...values, limit, offset]
  );
  const total = await countD1('SELECT count(*) AS total' + observationFrom + 'WHERE ' + where, values);
  return { rows: rows.map(mapGenericObservation), total };
}


