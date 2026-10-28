import 'server-only';
import { countD1, queryD1 } from './d1';
import { mapD1Observation } from './d1-observation-mapping';
import { completeness, freshness, HubRequestError, jsonData, parseDate, parsePage, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import {
  decodeSeriesId,
  encodeSeriesId,
  assertExactJsonNumberLexeme,
  MAX_SERIES_ID_LENGTH,
  parseSeriesDimensions,
  SeriesIdError,
  type SeriesIdentity,
} from './series-id';
import { d1SeriesDimensionsMatchExpression, d1SeriesDimensionsSignatureExpression } from './series-sql';
import type { ApiMeta, HubObservation, HubSeries } from './types';

type Row = Record<string, unknown>;
type DatasetInfo = { sourceId: string; freshnessDays: number | null; hasNumeric: boolean; numericStatus: 'succeeded' | 'partial' | null };
const MAX_NUMERIC_TOKEN_PAYLOAD_BYTES = 512 * 1024;

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

function mapD1ObservationSafely(row: Row): HubObservation {
  try {
    return mapD1Observation(row);
  } catch (error) {
    if (error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION') {
      throw new HubRequestError(422, 'SERIES_NUMERIC_PRECISION', 'ข้อมูลมิติมีตัวเลขที่ JavaScript เก็บค่าเดิมไม่ได้');
    }
    throw error;
  }
}

function d1SeriesGroupBy() {
  return [
    'r.resource_id', 'o.series_key', 'r.grain', 'o.product', 'o.grade', 'o.market', 'o.unit',
    'o.location_id', 'o.location_code', 'o.location_kind', 'o.location_name', 'o.province_code',
    'o.crop_code', 'o.crop_name', 'o.metric_id', 'o.metric_name', d1SeriesDimensionsSignatureExpression(),
  ].join(',');
}

function d1SeriesGroupsCte(baseWhere: string) {
  const scope = 'WITH scoped_observations AS (SELECT r.resource_id AS resource_id,o.series_key AS series_key,' +
    'r.grain AS source_grain,o.product AS product,o.grade AS grade,o.market AS market,o.unit AS unit,' +
    'o.location_id AS location_id,o.location_code AS location_code,o.location_kind AS location_kind,' +
    'o.location_name AS location_name,o.province_code AS province_code,o.crop_code AS crop_code,o.crop_name AS crop_name,' +
    'o.metric_id AS metric_id,o.metric_name AS metric_name,o.dimensions AS dimensions,' +
    'o.period_start AS period_start,o.period_end AS period_end,' +
    d1SeriesDimensionsSignatureExpression() + ' AS dimension_signature' +
    observationFrom + 'WHERE ' + baseWhere + '), ';
  const identityColumns = [
    'resource_id', 'series_key', 'source_grain', 'product', 'grade', 'market', 'unit', 'location_id',
    'location_code', 'location_kind', 'location_name', 'province_code', 'crop_code', 'crop_name', 'metric_id',
    'metric_name', 'dimension_signature',
  ];
  const numericToken = 'scope.dimensions -> node.fullkey';
  const integerDigits = "ltrim(CAST(node.atom AS TEXT),'-')";
  const numericCandidates = 'numeric_candidates AS (SELECT DISTINCT token FROM (' +
    'SELECT ' + numericToken + ' AS token FROM scoped_observations scope ' +
    'JOIN json_tree(scope.dimensions) AS node ' +
    "WHERE (node.type='real' AND " + numericToken + '<>json_quote(node.atom)) OR ' +
    "(node.type='integer' AND (length(" + integerDigits + ")>16 OR (length(" + integerDigits + ")=16 AND " +
    integerDigits + ">'9007199254740991' COLLATE BINARY)))))";
  const maxPayload = MAX_NUMERIC_TOKEN_PAYLOAD_BYTES - 2;
  const numericSafety = 'numeric_safety AS (SELECT count(*) AS token_count,' +
    'COALESCE(sum(CASE WHEN cumulative_bytes>' + maxPayload + ' THEN 1 ELSE 0 END),0) AS overflow_count,' +
    "COALESCE(json_group_array(token) FILTER (WHERE cumulative_bytes<=" + maxPayload + "),'[]') AS tokens " +
    'FROM (SELECT token,sum(length(token)+3) OVER (ORDER BY token COLLATE BINARY ' +
    'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_bytes FROM numeric_candidates))';
  const grouped = 'grouped_series AS (SELECT resource_id,series_key,source_grain,product,grade,market,unit,' +
    'location_id,location_code,location_kind,location_name,province_code,crop_code,crop_name,metric_id,metric_name,' +
    'min(dimensions) AS dimensions,dimension_signature,count(*) AS observation_count,' +
    'min(period_start) AS from_date,max(period_end) AS to_date FROM scoped_observations GROUP BY ' +
    identityColumns.join(',') + '), identified_series AS (SELECT grouped_series.*,' +
    'count(*) OVER (PARTITION BY resource_id,series_key) AS identity_count FROM grouped_series) ';
  return scope + numericCandidates + ', ' + numericSafety + ', ' + grouped;
}

function validateD1NumericTokens(row: Row | undefined) {
  if (!row) return;
  if (Number(row.numericTokenOverflowCount ?? 0) > 0) {
    throw new HubRequestError(422, 'SERIES_NUMERIC_VALIDATION_LIMIT', 'มีตัวเลขมิติที่ต้องตรวจมากเกินขอบเขตคำขอ');
  }
  let tokens: unknown = row.numericTokens;
  if (typeof tokens === 'string') {
    try { tokens = JSON.parse(tokens); } catch {
      throw new HubRequestError(500, 'SERIES_NUMERIC_VALIDATION_FAILED', 'ตรวจรูปแบบตัวเลขมิติจากฐานข้อมูลไม่ได้');
    }
  }
  if (!Array.isArray(tokens)) {
    throw new HubRequestError(500, 'SERIES_NUMERIC_VALIDATION_FAILED', 'รายการตัวเลขมิติจากฐานข้อมูลไม่ถูกต้อง');
  }
  for (const token of tokens) {
    if (typeof token !== 'string') {
      throw new HubRequestError(500, 'SERIES_NUMERIC_VALIDATION_FAILED', 'รูปแบบตัวเลขมิติจากฐานข้อมูลไม่ถูกต้อง');
    }
    try { assertExactJsonNumberLexeme(token); } catch (error) {
      if (error instanceof SeriesIdError && error.code === 'SERIES_NUMERIC_PRECISION') {
        throw new HubRequestError(422, 'SERIES_NUMERIC_PRECISION', 'ข้อมูลมิติมีตัวเลขที่ JavaScript เก็บค่าเดิมไม่ได้');
      }
      throw error;
    }
  }
}

function d1ObservationIdentityCte(baseWhere: string) {
  return 'WITH scoped_rows AS (SELECT o.row_key AS row_key,r.resource_id AS resource_id,' +
    'o.series_key AS series_key,r.grain AS source_grain,o.period_start AS period_start,o.period_end AS period_end,' +
    'o.period_label AS period_label,o.location_id AS location_id,o.location_code AS location_code,' +
    'o.location_kind AS location_kind,o.location_name AS location_name,o.province_code AS province_code,' +
    'o.crop_code AS crop_code,o.crop_name AS crop_name,o.metric_id AS metric_id,o.metric_name AS metric_name,' +
    'o.product AS product,o.grade AS grade,o.market AS market,o.unit AS unit,o.value AS value,' +
    'o.dimensions AS dimensions,o.quality_status AS quality_status,o.source_row_ref AS source_row_ref,' +
    d1SeriesDimensionsSignatureExpression() + ' AS dimension_signature' + observationFrom +
    'WHERE ' + baseWhere +
    '), ranked_rows AS (SELECT scoped_rows.*,' +
    'DENSE_RANK() OVER (PARTITION BY resource_id,series_key ORDER BY source_grain,product,grade,market,unit,' +
    'location_id,location_code,location_kind,location_name,province_code,crop_code,crop_name,metric_id,metric_name,' +
    'dimension_signature) AS identity_rank FROM scoped_rows), identified_rows AS (' +
    'SELECT ranked_rows.*,MAX(identity_rank) OVER (PARTITION BY resource_id,series_key) AS identity_count FROM ranked_rows) ';
}

function addD1SeriesIdentity(conditions: string[], values: unknown[], identity: SeriesIdentity) {
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
    conditions.push(column + ' IS ?');
    values.push(value);
  }
  conditions.push(d1SeriesDimensionsMatchExpression());
  values.push(JSON.stringify(identity.dimensions));
  values.push(JSON.stringify(identity.dimensions));
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

  const baseValues: unknown[] = [id];
  const baseConditions = ['d.dataset_id=?', publicConditions];
  const resourceId = parseText(url, 'resourceId', 260);
  if (resourceId) {
    baseConditions.push('r.resource_id=?');
    baseValues.push(resourceId);
  }
  const values = [...baseValues];
  const filters = await parseFilters(url, values, false);
  const where = [...baseConditions, ...filters].join(' AND ');
  const filterWhere = filters.length ? ' WHERE ' + filters.map(condition => condition.replace(/\bo\./g, '')).join(' AND ') : '';
  const stats = await observationStats(where, values);
  const total = Number(stats.total ?? 0);
  const rows = await queryD1<Row>(
    d1ObservationIdentityCte(baseConditions.join(' AND ')) +
      'SELECT row_key AS rowKey,resource_id AS resourceId,series_key AS seriesKey,source_grain AS sourceGrain,' +
      'identity_count AS identityCount,period_start AS periodStart,period_end AS periodEnd,period_label AS periodLabel,' +
      'location_id AS locationId,location_code AS locationCode,location_kind AS locationKind,location_name AS locationName,' +
      'province_code AS provinceCode,crop_code AS cropCode,crop_name AS cropName,metric_id AS metricId,metric_name AS metricName,' +
      'product,grade,market,unit,value,dimensions,quality_status AS qualityStatus,source_row_ref AS sourceRowRef ' +
      'FROM identified_rows' + filterWhere +
      ' ORDER BY period_end DESC NULLS LAST,row_key,resource_id LIMIT ? OFFSET ?',
    [...values, page.pageSize, (page.page - 1) * page.pageSize]
  );
  const data = rows.map(row => {
    const seriesId = seriesIdForRow(row);
    return { ...mapD1ObservationSafely({ ...row, seriesId }), seriesId };
  });
  return jsonData(data, {
    meta: numericMeta(info, stats, total > 0),
    pagination: { ...page, total },
  });
}

export async function listD1Series(id: string, url: URL) {
  id = datasetId(id);
  const page = parsePage(url);
  const info = await getDatasetInfo(id);
  if (!info.hasNumeric) return empty<HubSeries>(info, page);

  const baseValues: unknown[] = [id];
  const baseConditions = ['d.dataset_id=?', publicConditions];
  const filterValues: unknown[] = [];
  const filterConditions: string[] = [];
  const resourceId = parseText(url, 'resourceId', 260);
  const product = parseText(url, 'product', 120);
  const metric = parseText(url, 'metric', 120);
  if (resourceId) { baseConditions.push('r.resource_id=?'); baseValues.push(resourceId); }
  if (product) { filterConditions.push('product=?'); filterValues.push(product); }
  if (metric) { filterConditions.push('(metric_id=? OR metric_name=?)'); filterValues.push(metric, metric); }
  const baseWhere = baseConditions.join(' AND ');
  const where = [...baseConditions, ...(product ? ['o.product=?'] : []),
    ...(metric ? ['(o.metric_id=? OR o.metric_name=?)'] : [])].join(' AND ');
  const statsValues = [...baseValues, ...(product ? [product] : []), ...(metric ? [metric, metric] : [])];
  const pageFilter = filterConditions.length ? ' WHERE ' + filterConditions.join(' AND ') : '';
  const stats = await observationStats(where, statsValues);
  const seriesOrder = 'product COLLATE BINARY NULLS FIRST,metric_name COLLATE BINARY NULLS FIRST,resource_id COLLATE BINARY,' +
    'series_key COLLATE BINARY,source_grain COLLATE BINARY NULLS FIRST,grade COLLATE BINARY NULLS FIRST,' +
    'market COLLATE BINARY NULLS FIRST,unit COLLATE BINARY NULLS FIRST,location_id COLLATE BINARY NULLS FIRST,' +
    'location_code COLLATE BINARY NULLS FIRST,location_kind COLLATE BINARY NULLS FIRST,location_name COLLATE BINARY NULLS FIRST,' +
    'province_code COLLATE BINARY NULLS FIRST,crop_code COLLATE BINARY NULLS FIRST,crop_name COLLATE BINARY NULLS FIRST,' +
    'metric_id COLLATE BINARY NULLS FIRST,dimension_signature COLLATE BINARY';
  const pagedCte = d1SeriesGroupsCte(baseWhere) + ', filtered_series AS MATERIALIZED (' +
    'SELECT * FROM identified_series' + pageFilter + '), series_total AS (SELECT count(*) AS total FROM filtered_series), ' +
    'paged_series AS MATERIALIZED (SELECT * FROM filtered_series ORDER BY ' + seriesOrder + ' LIMIT ? OFFSET ?) ';
  const rows = await queryD1<Row>(
      pagedCte +
      'SELECT resource_id AS resourceId,series_key AS seriesKey,source_grain AS sourceGrain,product,grade,market,unit,' +
      'location_id AS locationId,location_code AS locationCode,location_kind AS locationKind,location_name AS locationName,' +
      'province_code AS provinceCode,crop_code AS cropCode,crop_name AS cropName,metric_id AS metricId,metric_name AS metricName,' +
      'dimensions,observation_count AS observationCount,identity_count AS identityCount,from_date AS fromDate,to_date AS toDate,' +
      'series_total.total AS total,' +
      'numeric_safety.token_count AS numericTokenCount,numeric_safety.overflow_count AS numericTokenOverflowCount,' +
      'CASE WHEN row_number() OVER (ORDER BY ' + seriesOrder + ')=1 ' +
      "THEN numeric_safety.tokens ELSE '[]' END AS numericTokens " +
      'FROM series_total CROSS JOIN numeric_safety LEFT JOIN paged_series ON 1=1 ORDER BY ' + seriesOrder,
    [...baseValues, ...filterValues, page.pageSize, (page.page - 1) * page.pageSize]
  );
  validateD1NumericTokens(rows[0]);
  const total = Number(rows[0]?.total ?? 0);
  const data: HubSeries[] = rows.filter(row => row.resourceId !== null && row.resourceId !== undefined).map(row => ({
    id: seriesIdForRow(row), resourceId: String(row.resourceId), sourceGrain: identityText(row.sourceGrain),
    locationId: identityText(row.locationId), locationCode: identityText(row.locationCode),
    locationKind: identityText(row.locationKind), locationName: identityText(row.locationName),
    provinceCode: identityText(row.provinceCode), cropCode: identityText(row.cropCode),
    product: identityText(row.product), grade: identityText(row.grade), market: identityText(row.market), unit: identityText(row.unit),
    metricId: identityText(row.metricId), metricName: identityText(row.metricName), cropName: identityText(row.cropName),
    observationCount: Number(row.observationCount), from: text(row.fromDate), to: text(row.toDate),
  }));
  return jsonData(data, { meta: numericMeta(info, stats, total > 0), pagination: { ...page, total } });
}

export async function listD1SeriesObservations(id: string, url: URL) {
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
    const legacyGroups = await queryD1<{ total: number | string }>(
      'SELECT count(*) AS total FROM (SELECT 1' + observationFrom +
        'WHERE ' + publicConditions + ' AND r.resource_id=? AND o.series_key=? ' +
        'GROUP BY ' + d1SeriesGroupBy() + ') legacy_series',
      [decoded.resourceId, decoded.seriesKey],
    );
    const groupCount = Number(legacyGroups[0]?.total ?? 0);
    if (groupCount > 1) throw new HubRequestError(409, 'AMBIGUOUS_SERIES_ID', 'รหัสอนุกรมเดิมชี้ไปได้หลายชุดมิติ');
    if (groupCount === 0) throw new HubRequestError(404, 'SERIES_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
    const rows = await queryD1<Row>(
      'SELECT r.resource_id AS resourceId,o.series_key AS seriesKey,r.grain AS sourceGrain,' +
        'o.product,o.grade,o.market,o.unit,o.location_id AS locationId,o.location_code AS locationCode,' +
        'o.location_kind AS locationKind,o.location_name AS locationName,o.province_code AS provinceCode,' +
        'o.crop_code AS cropCode,o.crop_name AS cropName,o.metric_id AS metricId,o.metric_name AS metricName,' +
        'min(o.dimensions) AS dimensions' + observationFrom +
        'WHERE ' + publicConditions + ' AND r.resource_id=? AND o.series_key=? GROUP BY ' + d1SeriesGroupBy() + ' LIMIT 1',
      [decoded.resourceId, decoded.seriesKey],
    );
    identity = seriesIdentity(rows[0] ?? {});
  }
  const visibleConditions = [publicConditions];
  const visibleValues: unknown[] = [];
  addD1SeriesIdentity(visibleConditions, visibleValues, identity);
  const visible = await queryD1<Row>(
    'SELECT s.source_id AS sourceId,s.freshness_days AS freshnessDays,run.status AS numericStatus' + observationFrom +
      'WHERE ' + visibleConditions.join(' AND ') + ' LIMIT 1',
    visibleValues,
  );
  if (!visible.length) throw new HubRequestError(404, 'SERIES_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const numericStatus = text(visible[0].numericStatus) === 'partial' ? 'partial' : 'succeeded';
  const info: DatasetInfo = {
    sourceId: String(visible[0].sourceId), freshnessDays: number(visible[0].freshnessDays), hasNumeric: true, numericStatus,
  };

  const values: unknown[] = [];
  const conditions = [publicConditions];
  addD1SeriesIdentity(conditions, values, identity);
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
  return jsonData(rows.map(row => ({ ...mapD1ObservationSafely(row), seriesId: id })), {
    meta: numericMeta(info, stats, total > 0), pagination: { ...page, total },
  });
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

/**
 * Filter values are bound as D1 parameters and compared with `=`, never
 * interpolated and never used inside a LIKE pattern, so the only things worth
 * refusing are an overlong value, a NUL/control byte smuggled through a
 * percent-encoded query, and `%` itself (an id that contains it is a probe,
 * not a resource key).
 *
 * `_` is a normal character here: every metric id in the warehouse is
 * snake_case (`reservoir_volume`, `reservoir_capacity`, `t2m_mean_c`) and it
 * is a wildcard only to LIKE, which this reader does not build. Refusing it —
 * the reported defect #7 — would make those metrics unreadable for no gain.
 */
const UNSAFE_FILTER_VALUE = /[%\u0000-\u001f\u007f]/;

function filterId(value: string | undefined, name: string, maxLength: number): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > maxLength || UNSAFE_FILTER_VALUE.test(value)) {
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


