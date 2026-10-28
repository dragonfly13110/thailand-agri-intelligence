import 'server-only';
import { query } from './db';
import { completeness, freshness, HubRequestError, jsonData, parseDate, parsePage, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import {
  assertExactJsonNumberLexeme,
  decodeSeriesId,
  encodeSeriesId,
  MAX_SERIES_ID_LENGTH,
  parseJsonDimensions,
  parseSeriesDimensions,
  SeriesIdError,
  type SeriesIdentity,
} from './series-id';
import { postgresSemanticDimensionsExpression } from './series-sql';
import type { ApiMeta, AreaEvidence, DatasetSummary, HubObservation, HubSeries } from './types';

type Row = Record<string, unknown>;
type DatasetInfo = { sourceId: string; freshnessDays: number | null; hasNumeric: boolean; numericStatus: 'succeeded' | 'partial' | null };
const MAX_NUMERIC_TOKEN_PAYLOAD_BYTES = 512 * 1024;

function add(values: unknown[], value: unknown) {
  values.push(value);
  return '$' + values.length;
}

function text(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value.length ? value : null;
}

function identityText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : String(value);
}

function seriesIdentity(row: Row): SeriesIdentity {
  const resourceId = identityText(row.resourceId);
  const seriesKey = identityText(row.seriesKey);
  if (resourceId === null || seriesKey === null) {
    throw new HubRequestError(500, 'SERIES_IDENTITY_INVALID', 'ข้อมูลอนุกรมไม่มีรหัสอ้างอิงที่จำเป็น');
  }
  try {
    return {
      resourceId,
      seriesKey,
      sourceGrain: identityText(row.sourceGrain),
      product: identityText(row.product),
      grade: identityText(row.grade),
      market: identityText(row.market),
      unit: identityText(row.unit),
      locationId: identityText(row.locationId),
      locationCode: identityText(row.locationCode),
      locationKind: identityText(row.locationKind),
      locationName: identityText(row.locationName),
      provinceCode: identityText(row.provinceCode),
      cropCode: identityText(row.cropCode),
      cropName: identityText(row.cropName),
      metricId: identityText(row.metricId),
      metricName: identityText(row.metricName),
      dimensions: parseSeriesDimensions(row.dimensions),
    };
  } catch (error) {
    if (error instanceof SeriesIdError && error.code === 'SERIES_ID_TOO_LONG') {
      throw new HubRequestError(422, 'SERIES_ID_TOO_LONG', 'มิติของอนุกรมยาวเกินขอบเขตรหัส 600 ตัวอักษร');
    }
    if (error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION') {
      throw new HubRequestError(422, 'SERIES_NUMERIC_PRECISION', 'ข้อมูลมิติมีตัวเลขที่ JavaScript เก็บค่าเดิมไม่ได้');
    }
    throw new HubRequestError(500, 'SERIES_IDENTITY_INVALID', 'มิติของอนุกรมอ่านไม่ได้');
  }
}

function seriesIdForRow(row: Row): string {
  const identity = seriesIdentity(row);
  const legacyId = identity.resourceId + '|' + identity.seriesKey;
  if (Number(row.identityCount) === 1 && !identity.resourceId.includes('|') && legacyId.length <= MAX_SERIES_ID_LENGTH) {
    return legacyId;
  }
  try {
    return encodeSeriesId(identity);
  } catch (error) {
    if (error instanceof SeriesIdError && error.code === 'SERIES_ID_TOO_LONG') {
      throw new HubRequestError(422, 'SERIES_ID_TOO_LONG', 'มิติของอนุกรมยาวเกินขอบเขตรหัส 600 ตัวอักษร');
    }
    throw new HubRequestError(500, 'SERIES_IDENTITY_INVALID', 'มิติของอนุกรมสร้างรหัสไม่ได้');
  }
}

function validatePostgresNumericTokens(row: Row | undefined) {
  if (!row) {
    throw new HubRequestError(500, 'SERIES_NUMERIC_VALIDATION_FAILED', 'ตรวจตัวเลขมิติจากฐานข้อมูลไม่ได้');
  }
  if (Number(row.numericTokenOverflowCount ?? 0) > 0) {
    throw new HubRequestError(422, 'SERIES_NUMERIC_VALIDATION_LIMIT', 'มีตัวเลขมิติที่ต้องตรวจมากเกินขอบเขตคำขอ');
  }
  const tokens = row.numericTokens;
  if (!Array.isArray(tokens)) {
    throw new HubRequestError(500, 'SERIES_NUMERIC_VALIDATION_FAILED', 'รายการตัวเลขมิติจากฐานข้อมูลไม่ถูกต้อง');
  }
  for (const token of tokens) {
    if (typeof token !== 'string') {
      throw new HubRequestError(500, 'SERIES_NUMERIC_VALIDATION_FAILED', 'รูปแบบตัวเลขมิติจากฐานข้อมูลไม่ถูกต้อง');
    }
    try {
      assertExactJsonNumberLexeme(token);
    } catch (error) {
      if (error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION') {
        throw new HubRequestError(422, 'SERIES_NUMERIC_PRECISION', 'ข้อมูลมิติมีตัวเลขที่ JavaScript เก็บค่าเดิมไม่ได้');
      }
      throw error;
    }
  }
}

function postgresSeriesGroupBy() {
  return [
    'r.resource_id', 'o.series_key', 'r.grain', 'o.product', 'o.grade', 'o.market', 'o.unit',
    'o.location_id', 'o.location_code', 'o.location_kind', 'o.location_name', 'o.province_code',
    'o.crop_code', 'o.crop_name', 'o.metric_id', 'o.metric_name', postgresSemanticDimensionsExpression(),
  ].join(',');
}

function postgresSeriesGroupsCte(baseWhere: string) {
  const maxPayload = MAX_NUMERIC_TOKEN_PAYLOAD_BYTES - 2;
  const numericAudit = 'scoped_dimensions AS MATERIALIZED (SELECT o.dimensions AS dimensions' + observationFrom +
    'WHERE ' + baseWhere + '), numeric_candidates AS (' +
    "SELECT DISTINCT numeric_node.value::text AS token FROM scoped_dimensions " +
    "CROSS JOIN LATERAL jsonb_path_query(COALESCE(scoped_dimensions.dimensions,'{}'::jsonb),'$.**') AS numeric_node(value) " +
    "WHERE jsonb_typeof(numeric_node.value)='number'), numeric_safety AS (SELECT " +
    'count(*) FILTER (WHERE cumulative_bytes>' + maxPayload + ') AS overflow_count,' +
    "COALESCE(array_agg(token ORDER BY token COLLATE \"C\") FILTER (WHERE cumulative_bytes<=" + maxPayload + "),ARRAY[]::text[]) AS tokens " +
    'FROM (SELECT token,sum(octet_length(token)+3) OVER (ORDER BY token COLLATE "C" ' +
    'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_bytes FROM numeric_candidates) bounded_tokens), ';
  return 'WITH ' + numericAudit + 'grouped_series AS (SELECT r.resource_id AS resource_id,o.series_key AS series_key,' +
    'r.grain AS source_grain,o.product AS product,o.grade AS grade,o.market AS market,o.unit AS unit,' +
    'o.location_id AS location_id,o.location_code AS location_code,o.location_kind AS location_kind,' +
    'o.location_name AS location_name,o.province_code AS province_code,o.crop_code AS crop_code,o.crop_name AS crop_name,' +
    'o.metric_id AS metric_id,o.metric_name AS metric_name,(' + postgresSemanticDimensionsExpression() + ')::text AS dimensions,' +
    postgresSemanticDimensionsExpression() + ' AS dimension_signature,' +
    'count(*)::int AS observation_count,min(o.period_start)::text AS from_date,max(o.period_end)::text AS to_date' +
    observationFrom + 'WHERE ' + baseWhere + ' GROUP BY ' + postgresSeriesGroupBy() +
    '), identified_series AS (SELECT grouped_series.*,' +
    'count(*) OVER (PARTITION BY resource_id,series_key)::int AS identity_count FROM grouped_series) ';
}

function postgresObservationIdentityCte(baseWhere: string) {
  const identityOrder = [
    'source_grain', 'product', 'grade', 'market', 'unit', 'location_id', 'location_code', 'location_kind',
    'location_name', 'province_code', 'crop_code', 'crop_name', 'metric_id', 'metric_name',
  ].map(column => column + ' COLLATE "C" NULLS FIRST').join(',');
  return 'WITH scoped_rows AS (SELECT o.row_key AS row_key,r.resource_id AS resource_id,' +
    'o.series_key AS series_key,r.grain AS source_grain,o.period_start AS period_start,o.period_end AS period_end,' +
    'o.period_label AS period_label,o.location_id AS location_id,o.location_code AS location_code,' +
    'o.location_kind AS location_kind,o.location_name AS location_name,o.province_code AS province_code,' +
    'o.crop_code AS crop_code,o.crop_name AS crop_name,o.metric_id AS metric_id,o.metric_name AS metric_name,' +
    'o.product AS product,o.grade AS grade,o.market AS market,o.unit AS unit,o.value AS value,' +
    'o.dimensions::text AS dimensions,' + postgresSemanticDimensionsExpression() + ' AS dimension_signature,' +
    'o.quality_status AS quality_status,o.source_row_ref AS source_row_ref' + observationFrom + 'WHERE ' + baseWhere +
    '), ranked_rows AS (SELECT scoped_rows.*,DENSE_RANK() OVER (PARTITION BY resource_id,series_key ORDER BY ' +
    identityOrder + ',dimension_signature) AS identity_rank FROM scoped_rows), identified_rows AS (' +
    'SELECT ranked_rows.*,MAX(identity_rank) OVER (PARTITION BY resource_id,series_key) AS identity_count FROM ranked_rows) ';
}

function addPostgresSeriesIdentity(conditions: string[], values: unknown[], identity: SeriesIdentity) {
  const columns: Array<[string, string | null]> = [
    ['r.resource_id', identity.resourceId], ['o.series_key', identity.seriesKey],
    ['r.grain', identity.sourceGrain], ['o.product', identity.product], ['o.grade', identity.grade],
    ['o.market', identity.market], ['o.unit', identity.unit], ['o.location_id', identity.locationId],
    ['o.location_code', identity.locationCode], ['o.location_kind', identity.locationKind],
    ['o.location_name', identity.locationName], ['o.province_code', identity.provinceCode],
    ['o.crop_code', identity.cropCode], ['o.crop_name', identity.cropName],
    ['o.metric_id', identity.metricId], ['o.metric_name', identity.metricName],
  ];
  for (const [column, value] of columns) {
    conditions.push(column + ' IS NOT DISTINCT FROM ' + add(values, value));
  }
  conditions.push(postgresSemanticDimensionsExpression() + ' IS NOT DISTINCT FROM ' + add(values, JSON.stringify(identity.dimensions)) + '::jsonb');
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
    "JOIN hub.sync_runs run ON run.run_id=o.run_id AND run.resource_id=o.resource_id AND run.kind='numeric' AND run.status IN ('succeeded','partial') " +
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
      "AND run.resource_id=r.resource_id AND run.kind='numeric' AND run.status IN ('succeeded','partial') " +
      "WHERE r.dataset_id=d.dataset_id AND r.access_status='approved_public' " +
      'AND r.project_publication_approved AND r.active_run_id IS NOT NULL) AS "hasNumeric",' +
    'EXISTS (SELECT 1 FROM hub.resources r JOIN hub.sync_runs run ON run.run_id=r.active_run_id ' +
      "AND run.resource_id=r.resource_id AND run.kind='numeric' AND run.status='partial' " +
      "WHERE r.dataset_id=d.dataset_id AND r.access_status='approved_public' " +
      'AND r.project_publication_approved AND r.active_run_id IS NOT NULL) AS "hasPartial" ' +
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
    numericStatus: rows[0].hasPartial === true ? 'partial' : rows[0].hasNumeric === true ? 'succeeded' : null,
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
    'count(DISTINCT run.run_id)::int AS "runCount",' +
    "CASE WHEN max(CASE WHEN run.status='partial' THEN 1 ELSE 0 END)=1 THEN 'partial' " +
    "WHEN count(*)>0 THEN 'succeeded' ELSE NULL END AS \"numericStatus\"" + observationFrom + 'WHERE ' + where,
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
  const numericStatus = text(stats.numericStatus) ?? info.numericStatus;
  return {
    availability: hasRows ? 'ready' : info.hasNumeric ? 'empty' : 'metadata_only',
    freshness: freshness(sourceUpdatedAt, freshnessDays),
    completeness: numericStatus ? completeness(numericStatus) : 'unknown',
    access: info.hasNumeric ? 'approved_public' : 'metadata_only',
    sourceIds: sourceIds.length ? sourceIds : [info.sourceId],
    dataAsOf: text(stats.dataAsOf),
    sourceUpdatedAt,
    sourceRetrievedAt: text(stats.retrievedAt),
    datasetVersion: text(stats.datasetVersion),
    warnings: numericStatus === 'partial'
      ? ['ชุดนี้มีข้อมูลตัวอย่างบางส่วน ยังไม่ครอบคลุมข้อมูลทั้งหมดของทรัพยากร']
      : info.hasNumeric ? [] : [warning ?? 'ชุดข้อมูลนี้มีเฉพาะ metadata ที่ค้นพบ ยังไม่มีตัวเลขที่อนุมัติให้เผยแพร่'],
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
  let dimensions: Record<string, string | number | boolean | null> = {};
  try {
    dimensions = parseJsonDimensions(row.dimensions) as Record<string, string | number | boolean | null>;
  } catch (error) {
    if (error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION') {
      throw new HubRequestError(422, 'SERIES_NUMERIC_PRECISION', 'ข้อมูลมิติมีตัวเลขที่ JavaScript เก็บค่าเดิมไม่ได้');
    }
  }
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
    'o.value::double precision AS value,o.dimensions::text AS dimensions,o.quality_status AS "qualityStatus",' +
    'o.source_row_ref AS "sourceRowRef"' + observationFrom;
}

export async function listDbRecords(id: string, url: URL) {
  id = datasetId(id);
  const page = parsePage(url);
  const info = await getDatasetInfo(id);
  const values: unknown[] = [id];
  const baseConditions = ['d.dataset_id=$1', publicObservationConditions];
  const resourceId = parseText(url, 'resourceId', 260);
  if (resourceId) baseConditions.push('r.resource_id=' + add(values, resourceId));
  const filters = await parseNumericFilters(url, values, false);
  const where = [...baseConditions, ...filters].join(' AND ');
  const filterWhere = filters.length ? ' WHERE ' + filters.map(condition => condition.replace(/\bo\./g, '')).join(' AND ') : '';
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
    postgresObservationIdentityCte(baseConditions.join(' AND ')) +
    'SELECT row_key AS "rowKey",resource_id AS "resourceId",series_key AS "seriesKey",source_grain AS "sourceGrain",' +
    'identity_count AS "identityCount",period_start AS "periodStart",period_end AS "periodEnd",period_label AS "periodLabel",' +
    'location_id AS "locationId",location_code AS "locationCode",location_kind AS "locationKind",location_name AS "locationName",' +
    'province_code AS "provinceCode",crop_code AS "cropCode",crop_name AS "cropName",metric_id AS "metricId",metric_name AS "metricName",' +
    'product,grade,market,unit,value,dimensions,quality_status AS "qualityStatus",source_row_ref AS "sourceRowRef" ' +
    'FROM identified_rows' + filterWhere +
    ' ORDER BY period_end DESC NULLS LAST,row_key,resource_id LIMIT ' + limit + ' OFFSET ' + offset,
    [...values, page.pageSize, (page.page - 1) * page.pageSize],
  );
  const data = rows.map(row => {
    const seriesId = seriesIdForRow(row);
    return { ...mapObservation({ ...row, seriesId }), seriesId };
  });
  return jsonData(data, {
    meta: numericMeta(info, stats, total > 0),
    pagination: { ...page, total },
  });
}

export async function listDbSeries(id: string, url: URL) {
  id = datasetId(id);
  const page = parsePage(url);
  const info = await getDatasetInfo(id);
  const baseValues: unknown[] = [id];
  const baseConditions = ['d.dataset_id=$1', publicObservationConditions];
  const filterValues: unknown[] = [];
  const filterConditions: string[] = [];
  const statsValues: unknown[] = [id];
  const statsConditions = ['d.dataset_id=$1', publicObservationConditions];
  const resourceId = parseText(url, 'resourceId', 260);
  const product = parseText(url, 'product', 120);
  const metric = parseText(url, 'metric', 120);
  if (resourceId) {
    baseConditions.push('r.resource_id=' + add(baseValues, resourceId));
    statsConditions.push('r.resource_id=' + add(statsValues, resourceId));
  }
  if (product) {
    filterConditions.push('product=$' + (baseValues.length + filterValues.length + 1));
    filterValues.push(product);
    statsConditions.push('o.product=' + add(statsValues, product));
  }
  if (metric) {
    const firstMetric = '$' + (baseValues.length + filterValues.length + 1);
    filterValues.push(metric);
    const secondMetric = '$' + (baseValues.length + filterValues.length + 1);
    filterValues.push(metric);
    filterConditions.push('(metric_id=' + firstMetric + ' OR metric_name=' + secondMetric + ')');
    const metricId = add(statsValues, metric);
    const metricName = add(statsValues, metric);
    statsConditions.push('(o.metric_id=' + metricId + ' OR o.metric_name=' + metricName + ')');
  }
  const baseWhere = baseConditions.join(' AND ');
  const statsWhere = statsConditions.join(' AND ');
  const pageFilter = filterConditions.length ? ' WHERE ' + filterConditions.join(' AND ') : '';
  if (!info.hasNumeric) {
    return jsonData<HubSeries[]>([], { meta: numericMeta(info, {}, false), pagination: { ...page, total: 0 } });
  }
  const seriesValues = [...baseValues, ...filterValues];
  const counts = await query<{ total: string; numericTokenOverflowCount: number | string; numericTokens: unknown }>(
    postgresSeriesGroupsCte(baseWhere) +
    'SELECT (SELECT count(*)::text FROM identified_series' + pageFilter + ') AS total,' +
    'numeric_safety.overflow_count AS "numericTokenOverflowCount",numeric_safety.tokens AS "numericTokens" FROM numeric_safety',
    seriesValues,
  );
  validatePostgresNumericTokens(counts[0]);
  const stats = await observationStats(statsWhere, statsValues);
  const total = Number(counts[0]?.total ?? 0);
  const rows = await query<Row>(
    postgresSeriesGroupsCte(baseWhere) +
    'SELECT resource_id AS "resourceId",series_key AS "seriesKey",source_grain AS "sourceGrain",product,grade,market,unit,' +
    'location_id AS "locationId",location_code AS "locationCode",location_kind AS "locationKind",location_name AS "locationName",' +
    'province_code AS "provinceCode",crop_code AS "cropCode",crop_name AS "cropName",metric_id AS "metricId",metric_name AS "metricName",' +
    'dimensions,observation_count AS "observationCount",identity_count AS "identityCount",from_date AS "from",to_date AS "to" ' +
    'FROM identified_series' + pageFilter + ' ORDER BY ' +
    'product COLLATE "C" NULLS FIRST,metric_name COLLATE "C" NULLS FIRST,resource_id COLLATE "C",series_key COLLATE "C",' +
    'source_grain COLLATE "C" NULLS FIRST,grade COLLATE "C" NULLS FIRST,market COLLATE "C" NULLS FIRST,unit COLLATE "C" NULLS FIRST,' +
    'location_id COLLATE "C" NULLS FIRST,location_code COLLATE "C" NULLS FIRST,location_kind COLLATE "C" NULLS FIRST,' +
    'location_name COLLATE "C" NULLS FIRST,province_code COLLATE "C" NULLS FIRST,crop_code COLLATE "C" NULLS FIRST,' +
    'crop_name COLLATE "C" NULLS FIRST,metric_id COLLATE "C" NULLS FIRST,dimension_signature::text COLLATE "C" LIMIT $' +
    (seriesValues.length + 1) + ' OFFSET $' + (seriesValues.length + 2),
    [...seriesValues, page.pageSize, (page.page - 1) * page.pageSize],
  );
  const data: HubSeries[] = rows.map(row => ({
    id: seriesIdForRow(row), resourceId: String(row.resourceId), sourceGrain: identityText(row.sourceGrain),
    locationId: identityText(row.locationId), locationCode: identityText(row.locationCode),
    locationKind: identityText(row.locationKind), locationName: identityText(row.locationName),
    provinceCode: identityText(row.provinceCode), cropCode: identityText(row.cropCode),
    product: identityText(row.product), grade: identityText(row.grade), market: identityText(row.market), unit: identityText(row.unit),
    metricId: identityText(row.metricId), metricName: identityText(row.metricName), cropName: identityText(row.cropName),
    observationCount: Number(row.observationCount), from: text(row.from), to: text(row.to),
  }));
  return jsonData(data, { meta: numericMeta(info, stats, total > 0), pagination: { ...page, total } });
}

export async function listDbSeriesObservations(id: string, url: URL) {
  if (!id || id.length > MAX_SERIES_ID_LENGTH) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  let decoded: ReturnType<typeof decodeSeriesId>;
  try {
    decoded = decodeSeriesId(id);
  } catch {
    throw new HubRequestError(400, 'INVALID_ID', 'รหัสอนุกรมไม่ถูกต้อง');
  }
  const page = parsePage(url);
  let identity: SeriesIdentity;
  if (decoded.kind === 'v2') {
    identity = decoded.identity;
  } else {
    const legacyGroups = await query<{ total: string }>(
      'SELECT count(*)::text AS total FROM (SELECT 1' + observationFrom +
      'WHERE ' + publicObservationConditions + ' AND r.resource_id=$1 AND o.series_key=$2 ' +
      'GROUP BY ' + postgresSeriesGroupBy() + ') legacy_series',
      [decoded.resourceId, decoded.seriesKey],
    );
    const groupCount = Number(legacyGroups[0]?.total ?? 0);
    if (groupCount > 1) throw new HubRequestError(409, 'AMBIGUOUS_SERIES_ID', 'รหัสอนุกรมเดิมชี้ไปได้หลายชุดมิติ');
    if (groupCount === 0) throw new HubRequestError(404, 'SERIES_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
    const rows = await query<Row>(
      'SELECT r.resource_id AS "resourceId",o.series_key AS "seriesKey",r.grain AS "sourceGrain",' +
      'o.product,o.grade,o.market,o.unit,o.location_id AS "locationId",o.location_code AS "locationCode",' +
      'o.location_kind AS "locationKind",o.location_name AS "locationName",o.province_code AS "provinceCode",' +
      'o.crop_code AS "cropCode",o.crop_name AS "cropName",o.metric_id AS "metricId",o.metric_name AS "metricName",' +
      '(' + postgresSemanticDimensionsExpression() + ')::text AS dimensions' + observationFrom +
      'WHERE ' + publicObservationConditions + ' AND r.resource_id=$1 AND o.series_key=$2 ' +
      'GROUP BY ' + postgresSeriesGroupBy() + ' LIMIT 1',
      [decoded.resourceId, decoded.seriesKey],
    );
    identity = seriesIdentity(rows[0] ?? {});
  }
  const visibleConditions = [publicObservationConditions];
  const visibleValues: unknown[] = [];
  addPostgresSeriesIdentity(visibleConditions, visibleValues, identity);
  const visible = await query<Row>(
    'SELECT s.source_id AS "sourceId",s.freshness_days AS "freshnessDays",run.status AS "numericStatus" ' + observationFrom +
    'WHERE ' + visibleConditions.join(' AND ') + ' LIMIT 1',
    visibleValues,
  );
  if (!visible.length) throw new HubRequestError(404, 'SERIES_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const info: DatasetInfo = {
    sourceId: String(visible[0].sourceId), freshnessDays: number(visible[0].freshnessDays), hasNumeric: true,
    numericStatus: text(visible[0].numericStatus) === 'partial' ? 'partial' : 'succeeded',
  };
  const values: unknown[] = [];
  const conditions = [publicObservationConditions];
  addPostgresSeriesIdentity(conditions, values, identity);
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
    ' ORDER BY o.period_end DESC NULLS LAST,o.row_key,o.resource_id LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2),
    [...values, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return jsonData(rows.map(row => ({ ...mapObservation(row), seriesId: id })), {
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
