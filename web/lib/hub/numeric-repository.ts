import 'server-only';
import { query } from './db';
import { completeness, freshness, HubRequestError, jsonData, parseDate, parsePage, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import type { ApiMeta, AreaEvidence, DatasetSummary, HubObservation, HubSeries } from './types';

type Row = Record<string, unknown>;
type DatasetInfo = { sourceId: string; freshnessDays: number | null; hasNumeric: boolean };

function add(values: unknown[], value: unknown) {
  values.push(value);
  return '$' + values.length;
}

function text(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value.length ? value : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function category(value: unknown): DatasetSummary['category'] {
  const raw = typeof value === 'string' ? value.trim().toLocaleLowerCase('en') : '';
  const aliases: Record<string, NonNullable<DatasetSummary['category']>> = {
    crop: 'crops', crops: 'crops', production: 'crops', agriculture: 'crops',
    price: 'prices', prices: 'prices', market: 'prices',
    water: 'water', weather: 'water', disaster: 'water', flood: 'water',
    land: 'land', soil: 'land', satellite: 'land',
    fishery: 'fisheries', fisheries: 'fisheries', livestock: 'livestock', animal: 'livestock',
  };
  return aliases[raw] ?? null;
}

const observationFrom =
  ' FROM hub.observations o ' +
  'JOIN hub.resources r ON r.resource_id=o.resource_id AND r.active_run_id=o.run_id ' +
  'JOIN hub.sync_runs run ON run.run_id=o.run_id AND run.resource_id=o.resource_id AND run.status=\'succeeded\' ' +
  'JOIN hub.datasets d ON d.dataset_id=r.dataset_id ' +
  'JOIN hub.sources s ON s.source_id=d.source_id ';

const publicObservationConditions = [
  "d.metadata_access_status IN ('approved_public','metadata_only')",
  "s.metadata_access_status IN ('approved_public','metadata_only')",
  "r.access_status='approved_public'",
  'r.project_publication_approved',
].join(' AND ');

function datasetId(value: string) {
  if (!value || value.length > 260) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  return value;
}

async function getDatasetInfo(id: string): Promise<DatasetInfo> {
  const rows = await query<Row>(
    'SELECT d.source_id AS "sourceId",s.freshness_days AS "freshnessDays",' +
    'EXISTS (SELECT 1 FROM hub.resources r JOIN hub.sync_runs run ON run.run_id=r.active_run_id ' +
      "AND run.resource_id=r.resource_id AND run.status='succeeded' " +
      "WHERE r.dataset_id=d.dataset_id AND r.access_status='approved_public' " +
      'AND r.project_publication_approved AND r.active_run_id IS NOT NULL) AS "hasNumeric" ' +
    'FROM hub.datasets d JOIN hub.sources s ON s.source_id=d.source_id ' +
    "WHERE d.dataset_id=$1 AND d.metadata_access_status IN ('approved_public','metadata_only') " +
    "AND s.metadata_access_status IN ('approved_public','metadata_only')",
    [id],
  );
  if (!rows.length) throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  return {
    sourceId: String(rows[0].sourceId),
    freshnessDays: number(rows[0].freshnessDays),
    hasNumeric: rows[0].hasNumeric === true,
  };
}

async function observationStats(where: string, values: unknown[]) {
  const rows = await query<Row>(
    'SELECT count(*)::text AS total,' +
    "coalesce(array_agg(DISTINCT s.source_id) FILTER (WHERE s.source_id IS NOT NULL),'{}'::text[]) AS \"sourceIds\", " +
    'max(o.period_end)::text AS "dataAsOf",max(r.source_updated_at) AS "sourceUpdatedAt",' +
    'max(run.source_retrieved_at) AS "retrievedAt",' +
    'CASE WHEN count(DISTINCT run.run_id)=1 THEN max(coalesce(run.payload_sha256,run.run_id::text)) ELSE NULL END AS "datasetVersion",' +
    'CASE WHEN count(DISTINCT s.source_id)=1 THEN max(s.freshness_days) ELSE NULL END AS "freshnessDays",' +
    'count(DISTINCT run.run_id)::int AS "runCount"' + observationFrom + 'WHERE ' + where,
    values,
  );
  return rows[0] ?? {};
}

function numericMeta(info: DatasetInfo, stats: Row, hasRows: boolean, warning?: string): Partial<ApiMeta> {
  const sourceIds = Array.isArray(stats.sourceIds)
    ? stats.sourceIds.filter((value): value is string => typeof value === 'string')
    : [];
  const sourceUpdatedAt = text(stats.sourceUpdatedAt);
  const freshnessDays = number(stats.freshnessDays) ?? info.freshnessDays;
  return {
    availability: hasRows ? 'ready' : info.hasNumeric ? 'empty' : 'metadata_only',
    freshness: freshness(sourceUpdatedAt, freshnessDays),
    completeness: info.hasNumeric ? completeness('succeeded') : 'unknown',
    access: info.hasNumeric ? 'approved_public' : 'metadata_only',
    sourceIds: sourceIds.length ? sourceIds : [info.sourceId],
    dataAsOf: text(stats.dataAsOf),
    sourceUpdatedAt,
    sourceRetrievedAt: text(stats.retrievedAt),
    datasetVersion: text(stats.datasetVersion),
    warnings: info.hasNumeric ? [] : [warning ?? 'ชุดข้อมูลนี้มีเฉพาะ metadata ที่ค้นพบ ยังไม่มีตัวเลขที่อนุมัติให้เผยแพร่'],
    runtimeMode: 'database',
  };
}

async function parseNumericFilters(url: URL, values: unknown[], includeResource: boolean) {
  const conditions: string[] = [];
  const resourceId = includeResource ? parseText(url, 'resourceId', 260) : '';
  const provinceCode = parseText(url, 'provinceCode', 2);
  const cropCode = parseText(url, 'cropCode', 80);
  const from = parseDate(url, 'from');
  const to = parseDate(url, 'to');
  if (provinceCode && !await isSupportedProvinceCode(provinceCode)) throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
  if (from && to && from > to) throw new HubRequestError(400, 'INVALID_QUERY', 'ช่วงวันที่ไม่ถูกต้อง');
  if (resourceId) conditions.push('r.resource_id=' + add(values, resourceId));
  if (provinceCode) conditions.push('o.province_code=' + add(values, provinceCode));
  if (cropCode) conditions.push('o.crop_code=' + add(values, cropCode));
  if (from) conditions.push('o.period_end >= ' + add(values, from) + '::date');
  if (to) conditions.push('o.period_start <= ' + add(values, to) + '::date');
  return conditions;
}

function mapObservation(row: Row): HubObservation {
  const dimensions = row.dimensions && typeof row.dimensions === 'object' && !Array.isArray(row.dimensions)
    ? row.dimensions as Record<string, string | number | boolean | null>
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

function observationSelect() {
  return 'SELECT o.row_key AS "rowKey",r.resource_id || \'|\' || o.series_key AS "seriesId",' +
    'o.period_start::text AS "periodStart",o.period_end::text AS "periodEnd",o.period_label AS "periodLabel",' +
    'o.location_code AS "locationCode",o.location_kind AS "locationKind",o.location_name AS "locationName",' +
    'o.province_code AS "provinceCode",o.crop_code AS "cropCode",o.crop_name AS "cropName",' +
    'o.metric_id AS "metricId",o.metric_name AS "metricName",o.product,o.grade,o.market,o.unit,' +
    'o.value::double precision AS value,o.dimensions,o.quality_status AS "qualityStatus",' +
    'o.source_row_ref AS "sourceRowRef"' + observationFrom;
}

export async function listDbRecords(id: string, url: URL) {
  id = datasetId(id);
  const page = parsePage(url);
  const info = await getDatasetInfo(id);
  const values: unknown[] = [id];
  const conditions = ['d.dataset_id=$1', publicObservationConditions, ...await parseNumericFilters(url, values, true)];
  const where = conditions.join(' AND ');
  if (!info.hasNumeric) {
    return jsonData<HubObservation[]>([], {
      meta: numericMeta(info, {}, false),
      pagination: { ...page, total: 0 },
    });
  }
  const stats = await observationStats(where, values);
  const total = Number(stats.total ?? 0);
  const limit = '$' + (values.length + 1);
  const offset = '$' + (values.length + 2);
  const rows = await query<Row>(
    observationSelect() + 'WHERE ' + where +
    ' ORDER BY o.period_end DESC NULLS LAST,o.row_key LIMIT ' + limit + ' OFFSET ' + offset,
    [...values, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return jsonData(rows.map(mapObservation), {
    meta: numericMeta(info, stats, total > 0),
    pagination: { ...page, total },
  });
}

export async function listDbSeries(id: string, url: URL) {
  id = datasetId(id);
  const page = parsePage(url);
  const info = await getDatasetInfo(id);
  const values: unknown[] = [id];
  const conditions = ['d.dataset_id=$1', publicObservationConditions];
  const resourceId = parseText(url, 'resourceId', 260);
  const product = parseText(url, 'product', 120);
  const metric = parseText(url, 'metric', 120);
  if (resourceId) conditions.push('r.resource_id=' + add(values, resourceId));
  if (product) conditions.push('o.product=' + add(values, product));
  if (metric) {
    const placeholder = add(values, metric);
    conditions.push('(o.metric_id=' + placeholder + ' OR o.metric_name=' + placeholder + ')');
  }
  const where = conditions.join(' AND ');
  if (!info.hasNumeric) {
    return jsonData<HubSeries[]>([], { meta: numericMeta(info, {}, false), pagination: { ...page, total: 0 } });
  }
  const counts = await query<{ total: string }>(
    'SELECT count(*)::text AS total FROM (SELECT r.resource_id,o.series_key' + observationFrom +
    'WHERE ' + where + ' GROUP BY r.resource_id,o.series_key) grouped_series', values,
  );
  const stats = await observationStats(where, values);
  const total = Number(counts[0]?.total ?? 0);
  const rows = await query<Row>(
    'SELECT r.resource_id || \'|\' || o.series_key AS id,r.resource_id AS "resourceId",' +
    'max(o.product) AS product,max(o.grade) AS grade,max(o.market) AS market,max(o.unit) AS unit,' +
    'max(o.metric_id) AS "metricId",max(o.metric_name) AS "metricName",max(o.crop_name) AS "cropName",' +
    'count(*)::int AS "observationCount",min(o.period_start)::text AS "from",max(o.period_end)::text AS "to"' +
    observationFrom + 'WHERE ' + where + ' GROUP BY r.resource_id,o.series_key ' +
    'ORDER BY max(o.product) NULLS LAST,max(o.metric_name) NULLS LAST,r.resource_id,o.series_key LIMIT $' +
    (values.length + 1) + ' OFFSET $' + (values.length + 2),
    [...values, page.pageSize, (page.page - 1) * page.pageSize],
  );
  const data: HubSeries[] = rows.map(row => ({
    id: String(row.id), resourceId: String(row.resourceId), product: text(row.product), grade: text(row.grade),
    market: text(row.market), unit: text(row.unit), metricId: text(row.metricId), metricName: text(row.metricName),
    cropName: text(row.cropName), observationCount: Number(row.observationCount), from: text(row.from), to: text(row.to),
  }));
  return jsonData(data, { meta: numericMeta(info, stats, total > 0), pagination: { ...page, total } });
}

export async function listDbSeriesObservations(id: string, url: URL) {
  if (!id || id.length > 600) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  const separator = id.indexOf('|');
  if (separator < 1 || separator === id.length - 1) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  const resourceId = id.slice(0, separator);
  const seriesKey = id.slice(separator + 1);
  const page = parsePage(url);
  const visible = await query<Row>(
    'SELECT s.source_id AS "sourceId",s.freshness_days AS "freshnessDays" ' + observationFrom +
    'WHERE ' + publicObservationConditions + ' AND r.resource_id=$1 AND o.series_key=$2 LIMIT 1',
    [resourceId, seriesKey],
  );
  if (!visible.length) throw new HubRequestError(404, 'SERIES_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const info: DatasetInfo = {
    sourceId: String(visible[0].sourceId), freshnessDays: number(visible[0].freshnessDays), hasNumeric: true,
  };
  const values: unknown[] = [resourceId, seriesKey];
  const conditions = [publicObservationConditions, 'r.resource_id=$1', 'o.series_key=$2'];
  const from = parseDate(url, 'from');
  const to = parseDate(url, 'to');
  if (from && to && from > to) throw new HubRequestError(400, 'INVALID_QUERY', 'ช่วงวันที่ไม่ถูกต้อง');
  if (from) conditions.push('o.period_end >= ' + add(values, from) + '::date');
  if (to) conditions.push('o.period_start <= ' + add(values, to) + '::date');
  const where = conditions.join(' AND ');
  const stats = await observationStats(where, values);
  const total = Number(stats.total ?? 0);
  const rows = await query<Row>(
    observationSelect() + 'WHERE ' + where +
    ' ORDER BY o.period_end DESC NULLS LAST,o.row_key LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2),
    [...values, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return jsonData(rows.map(mapObservation), {
    meta: numericMeta(info, stats, total > 0), pagination: { ...page, total },
  });
}

const categoryAliases: Record<string, string[]> = {
  crops: ['crop', 'crops', 'production', 'agriculture'], prices: ['price', 'prices', 'market'],
  water: ['water', 'weather', 'disaster', 'flood'], land: ['land', 'soil', 'satellite'],
  fisheries: ['fishery', 'fisheries'], livestock: ['livestock', 'animal'],
};

export async function listDbAreaEvidence(provinceCode: string, url: URL) {
  if (!await isSupportedProvinceCode(provinceCode)) throw new HubRequestError(400, 'INVALID_ID', 'รหัสจังหวัดไม่ถูกต้อง');
  const page = parsePage(url);
  const categoryFilter = parseText(url, 'category', 40);
  if (categoryFilter && !categoryAliases[categoryFilter]) throw new HubRequestError(400, 'INVALID_QUERY', 'หมวดข้อมูลไม่ถูกต้อง');
  const values: unknown[] = [provinceCode];
  const conditions = [publicObservationConditions, 'o.province_code=$1'];
  if (categoryFilter) conditions.push('lower(coalesce(d.category,\'\'))=ANY(' + add(values, categoryAliases[categoryFilter]) + '::text[])');
  const where = conditions.join(' AND ');
  const grouped = 'SELECT d.dataset_id' + observationFrom + 'WHERE ' + where + ' GROUP BY d.dataset_id';
  const counts = await query<{ total: string }>('SELECT count(*)::text AS total FROM (' + grouped + ') evidence', values);
  const total = Number(counts[0]?.total ?? 0);
  const rows = await query<Row>(
    'SELECT d.dataset_id AS "datasetId",d.title,s.source_id AS "sourceId",s.source_name AS "sourceName",' +
    'd.category, count(*)::int AS "evidenceCount",' +
    'CASE WHEN count(DISTINCT r.grain)=1 THEN max(r.grain) ELSE NULL END AS grain,' +
    'max(o.period_end)::text AS "dataAsOf",max(run.completed_at) AS "lastSuccessAt"' +
    observationFrom + 'WHERE ' + where + ' GROUP BY d.dataset_id,s.source_id,s.source_name ' +
    'ORDER BY d.title,d.dataset_id LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2),
    [...values, page.pageSize, (page.page - 1) * page.pageSize],
  );
  const data: AreaEvidence[] = rows.map(row => ({
    datasetId: String(row.datasetId), title: String(row.title), sourceId: String(row.sourceId),
    sourceName: String(row.sourceName), category: category(row.category), evidenceCount: Number(row.evidenceCount),
    grain: text(row.grain), dataAsOf: text(row.dataAsOf), lastSuccessAt: text(row.lastSuccessAt),
  }));
  const sourceIds = [...new Set(data.map(item => item.sourceId))];
  return jsonData(data, {
    meta: {
      availability: data.length ? 'ready' : 'empty', freshness: 'unknown', completeness: data.length ? 'complete' : 'unknown',
      access: data.length ? 'approved_public' : 'metadata_only', sourceIds, dataAsOf: null, sourceUpdatedAt: null,
      datasetVersion: null, warnings: [], runtimeMode: 'database',
    },
    pagination: { ...page, total },
  });
}

export function emptyFallbackPage(url: URL, warning = 'ยังไม่มีข้อมูลตัวเลขที่เชื่อมและอนุมัติให้เผยแพร่') {
  const page = parsePage(url);
  return jsonData<HubObservation[] | HubSeries[] | AreaEvidence[]>([], {
    meta: { availability: 'metadata_only', access: 'metadata_only', warnings: [warning], runtimeMode: 'source_api_fallback' },
    pagination: { ...page, total: 0 },
  });
}
