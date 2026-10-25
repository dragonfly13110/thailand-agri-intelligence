import 'server-only';
import { queryD1 } from './d1';
import { catalogSyncCompleteness } from './catalog-completeness';
import { freshness, HubRequestError, jsonData, parsePage, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import type {
  AccessStatus,
  ApiMeta,
  DatasetDetail,
  DatasetSummary,
  HubResource,
  HubSource,
  SourceRun,
  SourceStatus,
} from './types';

type Row = Record<string, unknown>;

function date(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : typeof value === 'string' && value.length ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

function num(value: unknown): number | null {
  const n = value === null || value === undefined ? null : Number(value);
  return n !== null && Number.isFinite(n) ? n : null;
}

function category(value: unknown): DatasetSummary['category'] {
  const raw = typeof value === 'string' ? value.trim().toLocaleLowerCase('en') : '';
  const map: Record<string, NonNullable<DatasetSummary['category']>> = {
    crop: 'crops',
    crops: 'crops',
    production: 'crops',
    agriculture: 'crops',
    price: 'prices',
    prices: 'prices',
    market: 'prices',
    water: 'water',
    weather: 'water',
    disaster: 'water',
    flood: 'water',
    land: 'land',
    soil: 'land',
    satellite: 'land',
    fishery: 'fisheries',
    fisheries: 'fisheries',
    livestock: 'livestock',
    animal: 'livestock',
  };
  return map[raw] ?? null;
}

function response<T>(data: T[], page: { page: number; pageSize: number }, total: number, meta: Partial<ApiMeta>) {
  return jsonData(data, { meta, pagination: { ...page, total } });
}

function makeMeta(
  rows: Row[],
  access: AccessStatus,
  availability: ApiMeta['availability'],
  metadataStatuses: Array<string | null | undefined> = rows.map((row) => text(row.metadataStatus))
): Partial<ApiMeta> {
  const sourceIds = [...new Set(rows.map((row) => String(row.sourceId ?? row.source_id ?? row.id ?? '')).filter(Boolean))];
  const updated =
    rows
      .map((row) => date(row.sourceUpdatedAt ?? row.completedAt ?? row.modifiedAt))
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1) ?? null;
  const days = rows.map((row) => num(row.freshnessDays)).filter((x): x is number => x !== null && x > 0);
  const dataAsOf =
    rows
      .map((row) => text(row.dataAsOf))
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1) ?? null;
  const version = rows.map((row) => text(row.datasetVersion)).find(Boolean) ?? null;

  return {
    availability,
    freshness: sourceIds.length === 1 ? freshness(updated, days[0] ?? null) : 'unknown',
    completeness: catalogSyncCompleteness(metadataStatuses),
    access,
    sourceIds,
    retrievedAt: new Date().toISOString(),
    sourceUpdatedAt: updated,
    dataAsOf,
    datasetVersion: sourceIds.length === 1 ? version : null,
    runtimeMode: 'database',
  };
}

async function latestMetadataStatuses() {
  const conditions = ["s.metadata_access_status IN ('approved_public', 'metadata_only')"];
  const rows = await queryD1<Row>(
    'SELECT (SELECT run.status FROM sync_runs run WHERE run.source_id = s.source_id AND run.kind = "metadata" ORDER BY run.started_at DESC LIMIT 1) AS metadataStatus ' +
      'FROM sources s WHERE ' + conditions.join(' AND '),
  );
  return rows.map((row) => text(row.metadataStatus));
}

export async function listD1Sources(url: URL) {
  const page = parsePage(url);
  const status = parseText(url, 'status', 30);
  if (status && !['enabled', 'deferred', 'needs_access', 'unavailable'].includes(status)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'สถานะแหล่งข้อมูลไม่ถูกต้อง');
  }

  const values: unknown[] = [];
  const conditions = ["s.metadata_access_status IN ('approved_public', 'metadata_only')"];
  if (status) {
    conditions.push('s.status = ?');
    values.push(status);
  }
  const where = ' WHERE ' + conditions.join(' AND ');

  const totals = await queryD1<{ total: number | string }>('SELECT count(*) AS total FROM sources s' + where, values);
  const total = Number(totals[0]?.total ?? 0);

  const rows = await queryD1<Row>(
    'SELECT s.source_id AS id, s.source_name AS name, s.base_url AS baseUrl, s.status AS status, ' +
      's.freshness_days AS freshnessDays, ' +
      '(SELECT max(r.completed_at) FROM sync_runs r WHERE r.source_id = s.source_id AND r.status = "succeeded") AS lastSuccessAt ' +
      'FROM sources s' +
      where +
      ' ORDER BY s.source_name, s.source_id LIMIT ? OFFSET ?',
    [...values, page.pageSize, (page.page - 1) * page.pageSize]
  );

  const data: HubSource[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    baseUrl: String(row.baseUrl),
    status: row.status as HubSource['status'],
    lastSuccessAt: date(row.lastSuccessAt),
  }));

  const metadataStatuses = await latestMetadataStatuses();
  return response(data, page, total, makeMeta(rows, 'metadata_only', data.length ? 'ready' : 'empty', metadataStatuses));
}

async function buildD1DatasetFilters(url: URL, values: unknown[]) {
  const conditions = [
    "d.metadata_access_status IN ('approved_public', 'metadata_only')",
    "s.metadata_access_status IN ('approved_public', 'metadata_only')",
  ];
  const q = parseText(url, 'q');
  const sourceId = parseText(url, 'sourceId', 80);
  const categoryKey = parseText(url, 'category', 40);
  const provinceCode = parseText(url, 'provinceCode', 2);

  const aliases: Record<string, string[]> = {
    crops: ['crop', 'crops', 'production', 'agriculture'],
    prices: ['price', 'prices', 'market'],
    water: ['water', 'weather', 'disaster', 'flood'],
    land: ['land', 'soil', 'satellite'],
    fisheries: ['fishery', 'fisheries'],
    livestock: ['livestock', 'animal'],
  };

  if (categoryKey && !aliases[categoryKey]) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'หมวดข้อมูลไม่ถูกต้อง');
  }
  if (provinceCode && !(await isSupportedProvinceCode(provinceCode))) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
  }

  if (q) {
    const pattern = '%' + q.replaceAll('%', '').replaceAll('_', '') + '%';
    conditions.push('(d.title LIKE ? OR d.description LIKE ? OR coalesce(d.owner, "") LIKE ?)');
    values.push(pattern, pattern, pattern);
  }

  if (sourceId) {
    conditions.push('d.source_id = ?');
    values.push(sourceId);
  }

  if (categoryKey) {
    const list = aliases[categoryKey] ?? [];
    const placeholders = list.map(() => '?').join(', ');
    conditions.push(`lower(coalesce(d.category, "")) IN (${placeholders})`);
    values.push(...list);
  }

  if (provinceCode) {
    conditions.push(
      'EXISTS (SELECT 1 FROM resources rp ' +
        'JOIN observations op ON op.resource_id = rp.resource_id AND op.run_id = rp.active_run_id ' +
        'JOIN sync_runs rpr ON rpr.run_id = rp.active_run_id AND rpr.status IN ("succeeded", "partial") ' +
        'WHERE rp.dataset_id = d.dataset_id AND rp.access_status = "approved_public" ' +
        'AND rp.project_publication_approved = 1 AND op.province_code = ?)'
    );
    values.push(provinceCode);
  }

  return conditions.join(' AND ');
}

export async function listD1Datasets(url: URL) {
  const page = parsePage(url);
  const values: unknown[] = [];
  const where = await buildD1DatasetFilters(url, values);

  const totals = await queryD1<{ total: number | string }>(
    'SELECT count(*) AS total FROM datasets d JOIN sources s ON s.source_id = d.source_id WHERE ' + where,
    values
  );
  const total = Number(totals[0]?.total ?? 0);

  const rows = await queryD1<Row>(
    'SELECT ' +
      'd.dataset_id AS id, d.source_id AS sourceId, d.title AS title, d.description AS description, ' +
      'd.category AS category, d.owner AS owner, d.source_url AS sourceUrl, d.modified_at AS modifiedAt, ' +
      's.freshness_days AS freshnessDays, ' +
      '(SELECT count(r.resource_id) FROM resources r WHERE r.dataset_id = d.dataset_id AND r.access_status IN ("approved_public", "metadata_only")) AS resourceCount, ' +
      '(SELECT 1 FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial") LIMIT 1) AS hasActive, ' +
      '(SELECT 1 FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial") AND coalesce(run.records_written, 0) > 0 LIMIT 1) AS hasRows, ' +
      '(SELECT max(run.completed_at) FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial")) AS completedAt, ' +
      '(SELECT max(r.source_updated_at) FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial")) AS sourceUpdatedAt, ' +
      '(SELECT max(o.period_end) FROM resources r JOIN observations o ON o.resource_id = r.resource_id AND o.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1) AS dataAsOf, ' +
      '(SELECT coalesce(run.payload_sha256, run.run_id) FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial") ORDER BY run.completed_at DESC LIMIT 1) AS datasetVersion ' +
      'FROM datasets d JOIN sources s ON s.source_id = d.source_id ' +
      'WHERE ' +
      where +
      ' ORDER BY d.title, d.dataset_id LIMIT ? OFFSET ?',
    [...values, page.pageSize, (page.page - 1) * page.pageSize]
  );

  const data: DatasetSummary[] = rows.map((row) => {
    const hasActive = Boolean(row.hasActive);
    const hasRows = Boolean(row.hasRows);
    const availability: DatasetSummary['availability'] = hasRows ? 'ready' : hasActive ? 'empty' : 'metadata_only';
    const access: DatasetSummary['access'] = hasActive ? 'approved_public' : 'metadata_only';

    return {
      id: String(row.id),
      sourceId: String(row.sourceId),
      title: String(row.title),
      description: String(row.description ?? ''),
      category: category(row.category),
      owner: text(row.owner),
      sourceUrl: String(row.sourceUrl),
      modifiedAt: date(row.modifiedAt),
      resourceCount: num(row.resourceCount),
      availability,
      freshness: freshness(date(row.sourceUpdatedAt ?? row.completedAt), num(row.freshnessDays)),
      access,
    };
  });

  const metadataStatuses = await latestMetadataStatuses();
  return response(
    data,
    page,
    total,
    makeMeta(
      rows,
      data.some((item) => item.access === 'approved_public') ? 'approved_public' : 'metadata_only',
      data.length ? 'ready' : 'empty',
      metadataStatuses
    )
  );
}

export async function getD1Dataset(id: string) {
  if (!id || id.length > 260) {
    throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  }

  const rows = await queryD1<Row>(
    'SELECT ' +
      'd.dataset_id AS id, d.source_id AS sourceId, d.source_dataset_id AS sourceDatasetId, ' +
      'd.title AS title, d.description AS description, d.category AS category, d.owner AS owner, ' +
      'd.source_url AS sourceUrl, d.modified_at AS modifiedAt, s.freshness_days AS freshnessDays, ' +
      '(SELECT sync.status FROM sync_runs sync WHERE sync.source_id = d.source_id AND sync.kind = "metadata" ORDER BY sync.started_at DESC LIMIT 1) AS metadataStatus, ' +
      '(SELECT count(r.resource_id) FROM resources r WHERE r.dataset_id = d.dataset_id AND r.access_status IN ("approved_public", "metadata_only")) AS resourceCount, ' +
      '(SELECT 1 FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial") LIMIT 1) AS hasActive, ' +
      '(SELECT 1 FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial") AND coalesce(run.records_written, 0) > 0 LIMIT 1) AS hasRows, ' +
      '(SELECT max(run.completed_at) FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial")) AS completedAt, ' +
      '(SELECT max(r.source_updated_at) FROM resources r JOIN sync_runs run ON run.run_id = r.active_run_id WHERE r.dataset_id = d.dataset_id AND r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial")) AS sourceUpdatedAt ' +
      'FROM datasets d JOIN sources s ON s.source_id = d.source_id ' +
      'WHERE d.dataset_id = ? AND d.metadata_access_status IN ("approved_public", "metadata_only") AND s.metadata_access_status IN ("approved_public", "metadata_only")',
    [id]
  );

  if (!rows.length) {
    throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  }

  const row = rows[0];
  const resources = await queryD1<Row>(
    'SELECT ' +
      'r.resource_id AS id, r.source_resource_id AS sourceResourceId, r.name AS name, r.format AS format, ' +
      'r.access_status AS accessStatus, r.declared_license AS declaredLicense, r.license_url AS licenseUrl, ' +
      'r.project_publication_approved AS projectPublicationApproved, r.grain AS grain, ' +
      'CASE WHEN r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial") THEN r.active_run_id ELSE NULL END AS activeRunId, ' +
      'CASE WHEN r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status = "succeeded" THEN run.completed_at ELSE NULL END AS lastSuccessAt, ' +
      'CASE WHEN r.access_status = "approved_public" AND r.project_publication_approved = 1 AND run.status IN ("succeeded", "partial") THEN (SELECT max(o.period_end) FROM observations o WHERE o.resource_id = r.resource_id AND o.run_id = r.active_run_id) ELSE NULL END AS dataAsOf ' +
      'FROM resources r ' +
      'LEFT JOIN sync_runs run ON run.run_id = r.active_run_id AND run.status IN ("succeeded", "partial") ' +
      'WHERE r.dataset_id = ? AND r.access_status IN ("approved_public", "metadata_only") ' +
      'ORDER BY r.name, r.resource_id LIMIT 500',
    [id]
  );

  const hasActive = Boolean(row.hasActive);
  const hasRows = Boolean(row.hasRows);
  const availability: DatasetSummary['availability'] = hasRows ? 'ready' : hasActive ? 'empty' : 'metadata_only';

  const data: DatasetDetail = {
    id: String(row.id),
    sourceId: String(row.sourceId),
    sourceDatasetId: String(row.sourceDatasetId),
    title: String(row.title),
    description: String(row.description ?? ''),
    category: category(row.category),
    owner: text(row.owner),
    sourceUrl: String(row.sourceUrl),
    modifiedAt: date(row.modifiedAt),
    resourceCount: Number(row.resourceCount ?? 0),
    availability,
    freshness: freshness(date(row.sourceUpdatedAt ?? row.completedAt), num(row.freshnessDays)),
    access: hasActive ? 'approved_public' : 'metadata_only',
    resources: resources.map((resource) => ({
      id: String(resource.id),
      sourceResourceId: String(resource.sourceResourceId),
      name: String(resource.name),
      format: text(resource.format),
      accessStatus: resource.accessStatus as HubResource['accessStatus'],
      declaredLicense: text(resource.declaredLicense),
      licenseUrl: text(resource.licenseUrl),
      projectPublicationApproved: Boolean(resource.projectPublicationApproved),
      grain: text(resource.grain),
      activeRunId: text(resource.activeRunId),
      lastSuccessAt: date(resource.lastSuccessAt),
      dataAsOf: text(resource.dataAsOf),
    })),
  };

  return jsonData(data, {
    meta: makeMeta(rows, hasActive ? 'approved_public' : 'metadata_only', availability),
  });
}

export async function getD1SourceStatus(id: string) {
  if (!id || id.length > 80) {
    throw new HubRequestError(400, 'INVALID_ID', 'รหัสแหล่งข้อมูลไม่ถูกต้อง');
  }

  const rows = await queryD1<Row>(
    'SELECT s.source_id AS id, s.source_name AS name, s.base_url AS baseUrl, s.status AS status, ' +
      's.freshness_days AS freshnessDays, ' +
      '(SELECT run.status FROM sync_runs run WHERE run.source_id = s.source_id AND run.kind = "metadata" ORDER BY run.started_at DESC LIMIT 1) AS metadataStatus, ' +
      '(SELECT max(run.completed_at) FROM sync_runs run WHERE run.source_id = s.source_id AND run.status = "succeeded") AS lastSuccessAt, ' +
      '(SELECT run.status FROM sync_runs run WHERE run.source_id = s.source_id ORDER BY run.started_at DESC LIMIT 1) AS latestStatus ' +
      'FROM sources s ' +
      'WHERE s.source_id = ? AND s.metadata_access_status IN ("approved_public", "metadata_only")',
    [id]
  );

  if (!rows.length) {
    throw new HubRequestError(404, 'SOURCE_NOT_FOUND', 'ไม่พบแหล่งข้อมูลนี้');
  }

  const runs = await queryD1<Row>(
    'SELECT run_id AS runId, kind, status, started_at AS startedAt, completed_at AS completedAt, ' +
      'records_read AS recordsRead, records_written AS recordsWritten, error_code AS errorCode ' +
      'FROM sync_runs run ' +
      'WHERE source_id = ? AND (resource_id IS NULL OR EXISTS (' +
      'SELECT 1 FROM resources visible_resource WHERE visible_resource.resource_id = run.resource_id ' +
      'AND visible_resource.access_status = "approved_public" AND visible_resource.project_publication_approved = 1)) ' +
      'ORDER BY started_at DESC LIMIT 10',
    [id]
  );

  const row = rows[0];
  const data: SourceStatus = {
    id: String(row.id),
    name: String(row.name),
    baseUrl: String(row.baseUrl),
    status: row.status as HubSource['status'],
    lastSuccessAt: date(row.lastSuccessAt),
    latestStatus: text(row.latestStatus) as SourceRun['status'] | null,
    recentRuns: runs.map((run) => ({
      runId: String(run.runId),
      kind: run.kind as SourceRun['kind'],
      status: run.status as SourceRun['status'],
      startedAt: date(run.startedAt) ?? '',
      completedAt: date(run.completedAt),
      recordsRead: Number(run.recordsRead ?? 0),
      recordsWritten: Number(run.recordsWritten ?? 0),
      errorCode: text(run.errorCode),
    })),
  };

  return jsonData(data, {
    meta: {
      ...makeMeta(rows, 'metadata_only', 'ready'),
      availability: 'ready',
      freshness: freshness(data.lastSuccessAt, num(row.freshnessDays)),
    },
  });
}
