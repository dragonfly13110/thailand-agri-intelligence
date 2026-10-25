import 'server-only';
import { query } from './db';
import { hasD1Catalog } from './d1';
import { getD1Dataset, getD1SourceStatus, listD1Datasets, listD1Sources } from './d1-catalog-repository';
import { completeness, freshness, HubRequestError, jsonData, parsePage, parseText } from './http';
import { isSupportedProvinceCode } from './province';
import type { AccessStatus, ApiMeta, DatasetDetail, DatasetSummary, HubResource, HubSource, SourceRun, SourceStatus } from './types';

type Row = Record<string, unknown>;
function date(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;
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
    crop:'crops', crops:'crops', production:'crops', agriculture:'crops',
    price:'prices', prices:'prices', market:'prices',
    water:'water', weather:'water', disaster:'water', flood:'water',
    land:'land', soil:'land', satellite:'land',
    fishery:'fisheries', fisheries:'fisheries', livestock:'livestock', animal:'livestock',
  };
  return map[raw] ?? null;
}
function add(values: unknown[], value: unknown) {
  values.push(value);
  return '$' + values.length;
}
function response<T>(data: T[], page: {page:number;pageSize:number}, total: number, meta: Partial<ApiMeta>) {
  return jsonData(data, {meta, pagination:{...page,total}});
}
function makeMeta(rows: Row[], access: AccessStatus, availability: ApiMeta['availability']): Partial<ApiMeta> {
  const sourceIds = [...new Set(rows.map(row => String(row.sourceId ?? row.source_id ?? row.id ?? '')).filter(Boolean))];
  const updated = rows.map(row => date(row.sourceUpdatedAt ?? row.source_updated_at ?? row.completedAt ?? row.completed_at ?? row.modifiedAt ?? row.modified_at)).filter((x):x is string => Boolean(x)).sort().at(-1) ?? null;
  const days = rows.map(row => num(row.freshnessDays ?? row.freshness_days)).filter((x):x is number => x !== null && x > 0);
  const runStatus = rows.map(row => String(row.runStatus ?? row.run_status ?? '')).find(Boolean) ?? null;
  const dataAsOf = rows.map(row => text(row.dataAsOf ?? row.data_as_of)).filter((x):x is string => Boolean(x)).sort().at(-1) ?? null;
  const version = rows.map(row => text(row.datasetVersion ?? row.dataset_version)).find(Boolean) ?? null;
  return {availability, freshness:sourceIds.length === 1 ? freshness(updated, days[0] ?? null) : 'unknown',
    completeness:completeness(runStatus), access, sourceIds, retrievedAt:new Date().toISOString(),
    sourceUpdatedAt:updated, dataAsOf, datasetVersion:sourceIds.length === 1 ? version : null};
}

export async function listDbSources(url: URL) {
  if (await hasD1Catalog()) {
    return listD1Sources(url);
  }
  const page = parsePage(url);
  const status = parseText(url, 'status', 30);
  if (status && !['enabled','deferred','needs_access','unavailable'].includes(status)) {
    throw new HubRequestError(400,'INVALID_QUERY','สถานะแหล่งข้อมูลไม่ถูกต้อง');
  }
  const values: unknown[] = [];
  const conditions = ["s.metadata_access_status IN ('approved_public','metadata_only')"];
  if (status) conditions.push('s.status = ' + add(values,status));
  const where = ' WHERE ' + conditions.join(' AND ');
  const totals = await query<{total:string}>('SELECT count(*)::text AS total FROM hub.sources s' + where,values);
  const limit = '$' + (values.length + 1);
  const offset = '$' + (values.length + 2);
  const rows = await query<Row>(
    'SELECT s.source_id AS id,s.source_name AS name,s.base_url AS "baseUrl",s.status,' +
    's.freshness_days AS "freshnessDays",' +
    "(SELECT max(r.completed_at) FROM hub.sync_runs r WHERE r.source_id=s.source_id AND r.status='succeeded') AS \"lastSuccessAt\" " +
    'FROM hub.sources s' + where + ' ORDER BY s.source_name,s.source_id LIMIT ' + limit + ' OFFSET ' + offset,
    [...values,page.pageSize,(page.page-1)*page.pageSize],
  );
  const data: HubSource[] = rows.map(row => ({
    id:String(row.id),name:String(row.name),baseUrl:String(row.baseUrl),
    status:row.status as HubSource['status'],lastSuccessAt:date(row.lastSuccessAt),
  }));
  return response(data,page,Number(totals[0]?.total ?? 0),makeMeta(rows,'metadata_only',data.length?'ready':'empty'));
}

async function datasetFilters(url: URL, values: unknown[]) {
  const conditions = ["d.metadata_access_status IN ('approved_public','metadata_only')"];
  const q = parseText(url,'q');
  const sourceId = parseText(url,'sourceId',80);
  const categoryKey = parseText(url,'category',40);
  const provinceCode = parseText(url,'provinceCode',2);
  const aliases: Record<string,string[]> = {
    crops:['crop','crops','production','agriculture'], prices:['price','prices','market'],
    water:['water','weather','disaster','flood'], land:['land','soil','satellite'],
    fisheries:['fishery','fisheries'], livestock:['livestock','animal'],
  };
  if (categoryKey && !aliases[categoryKey]) throw new HubRequestError(400,'INVALID_QUERY','หมวดข้อมูลไม่ถูกต้อง');
  if (provinceCode && !await isSupportedProvinceCode(provinceCode)) throw new HubRequestError(400,'INVALID_QUERY','รหัสจังหวัดไม่ถูกต้อง');
  if (q) {
    const p = add(values,'%'+q.replaceAll('%','').replaceAll('_','')+'%');
    conditions.push("(d.title ILIKE "+p+" OR d.description ILIKE "+p+" OR coalesce(d.owner,'') ILIKE "+p+")");
  }
  if (sourceId) conditions.push('d.source_id='+add(values,sourceId));
  if (categoryKey) conditions.push("lower(coalesce(d.category,'')) = ANY("+add(values,aliases[categoryKey])+"::text[])");
  if (provinceCode) {
    const p = add(values,provinceCode);
    conditions.push('EXISTS (SELECT 1 FROM hub.resources rp JOIN hub.observations op '+
      'ON op.resource_id=rp.resource_id AND op.run_id=rp.active_run_id '+
      'JOIN hub.sync_runs rpr ON rpr.run_id=rp.active_run_id AND rpr.status=\'succeeded\' '+
      "WHERE rp.dataset_id=d.dataset_id AND rp.access_status='approved_public' AND rp.project_publication_approved AND op.province_code="+p+")");
  }
  return conditions.join(' AND ');
}

export async function listDbDatasets(url: URL) {
  if (await hasD1Catalog()) {
    return listD1Datasets(url);
  }
  const page = parsePage(url);
  const values: unknown[] = [];
  const where = await datasetFilters(url,values);
  const totals = await query<{total:string}>(
    'SELECT count(*)::text AS total FROM hub.datasets d JOIN hub.sources s ON s.source_id=d.source_id '+
    'WHERE '+where+" AND s.metadata_access_status IN ('approved_public','metadata_only')",values);
  const limit = '$'+(values.length+1);
  const offset = '$'+(values.length+2);
  const rows = await query<Row>(
    'SELECT d.dataset_id AS id,d.source_id AS "sourceId",d.title,d.description,d.category,d.owner,'+
    'd.source_url AS "sourceUrl",d.modified_at AS "modifiedAt",s.freshness_days AS "freshnessDays",'+
    'stats.resource_count AS "resourceCount",stats.last_run_status AS "runStatus",'+
    'stats.last_completed_at AS "completedAt",stats.source_updated_at AS "sourceUpdatedAt",'+
    "CASE WHEN stats.has_rows THEN 'ready' WHEN stats.has_active THEN 'empty' ELSE 'metadata_only' END AS availability,"+
    "CASE WHEN stats.has_active THEN 'approved_public' ELSE 'metadata_only' END AS access,"+
    'stats.data_as_of AS "dataAsOf",stats.dataset_version AS "datasetVersion" '+
    'FROM hub.datasets d JOIN hub.sources s ON s.source_id=d.source_id '+
    'LEFT JOIN LATERAL ('+
      'SELECT count(r.resource_id)::int AS resource_count,'+
      "bool_or(r.access_status='approved_public' AND r.project_publication_approved AND r.active_run_id IS NOT NULL AND run.status='succeeded') AS has_active,"+
      "bool_or(r.access_status='approved_public' AND r.project_publication_approved AND r.active_run_id IS NOT NULL AND run.status='succeeded' AND coalesce(run.records_written,0)>0) AS has_rows,"+
      "(array_agg(run.status ORDER BY run.completed_at DESC) FILTER (WHERE run.completed_at IS NOT NULL AND r.access_status='approved_public' AND r.project_publication_approved))[1] AS last_run_status,"+
      "max(run.completed_at) FILTER (WHERE run.status='succeeded' AND r.access_status='approved_public' AND r.project_publication_approved) AS last_completed_at,"+
      "max(r.source_updated_at) FILTER (WHERE run.status='succeeded' AND r.access_status='approved_public' AND r.project_publication_approved) AS source_updated_at,"+
      "max(obs.period_end) FILTER (WHERE run.status='succeeded' AND r.access_status='approved_public' AND r.project_publication_approved)::text AS data_as_of,"+
      "(array_agg(coalesce(run.payload_sha256,run.run_id::text) ORDER BY run.completed_at DESC) FILTER (WHERE run.run_id IS NOT NULL AND run.status='succeeded' AND r.access_status='approved_public' AND r.project_publication_approved))[1] AS dataset_version "+
      'FROM hub.resources r LEFT JOIN hub.sync_runs run ON run.run_id=r.active_run_id '+
      'LEFT JOIN LATERAL (SELECT max(o.period_end) AS period_end FROM hub.observations o '+
        'WHERE o.resource_id=r.resource_id AND o.run_id=r.active_run_id) obs ON true '+
      "WHERE r.dataset_id=d.dataset_id AND r.access_status IN ('approved_public','metadata_only')"+
    ') stats ON true WHERE '+where+" AND s.metadata_access_status IN ('approved_public','metadata_only')"+
    ' ORDER BY d.title,d.dataset_id LIMIT '+limit+' OFFSET '+offset,
    [...values,page.pageSize,(page.page-1)*page.pageSize],
  );
  const data: DatasetSummary[] = rows.map(row=>({
    id:String(row.id),sourceId:String(row.sourceId),title:String(row.title),description:String(row.description??''),
    category:category(row.category),owner:text(row.owner),sourceUrl:String(row.sourceUrl),modifiedAt:date(row.modifiedAt),
    resourceCount:num(row.resourceCount),availability:row.availability as DatasetSummary['availability'],
    freshness:freshness(date(row.sourceUpdatedAt??row.completedAt),num(row.freshnessDays)),
    access:row.access as DatasetSummary['access'],
  }));
  return response(data,page,Number(totals[0]?.total??0),makeMeta(rows,
    data.some(item=>item.access==='approved_public')?'approved_public':'metadata_only',data.length?'ready':'empty'));
}

export async function getDbDataset(id: string) {
  if (!id || id.length>260) throw new HubRequestError(400,'INVALID_ID','รหัสชุดข้อมูลไม่ถูกต้อง');
  if (await hasD1Catalog()) {
    return getD1Dataset(id);
  }
  const rows = await query<Row>(
    'SELECT d.dataset_id AS id,d.source_id AS "sourceId",d.source_dataset_id AS "sourceDatasetId",'+
    'd.title,d.description,d.category,d.owner,d.source_url AS "sourceUrl",d.modified_at AS "modifiedAt",'+
    's.freshness_days AS "freshnessDays",stats.resource_count AS "resourceCount",'+
    'stats.has_active AS "hasActive",stats.has_rows AS "hasRows",'+
    'stats.last_completed_at AS "completedAt",stats.source_updated_at AS "sourceUpdatedAt" '+
    'FROM hub.datasets d JOIN hub.sources s ON s.source_id=d.source_id '+
    'LEFT JOIN LATERAL ('+
      'SELECT count(r.resource_id)::int AS resource_count,'+
      "bool_or(r.access_status='approved_public' AND r.project_publication_approved AND r.active_run_id IS NOT NULL AND run.status='succeeded') AS has_active,"+
      "bool_or(r.access_status='approved_public' AND r.project_publication_approved AND r.active_run_id IS NOT NULL AND coalesce(run.records_written,0)>0) AS has_rows,"+
      "max(run.completed_at) FILTER (WHERE r.access_status='approved_public' AND r.project_publication_approved AND run.status='succeeded') AS last_completed_at,"+
      "max(r.source_updated_at) FILTER (WHERE r.access_status='approved_public' AND r.project_publication_approved AND run.status='succeeded') AS source_updated_at "+
      'FROM hub.resources r LEFT JOIN hub.sync_runs run ON run.run_id=r.active_run_id '+
      "WHERE r.dataset_id=d.dataset_id AND r.access_status IN ('approved_public','metadata_only')"+
    ") stats ON true WHERE d.dataset_id=$1 AND d.metadata_access_status IN ('approved_public','metadata_only') AND s.metadata_access_status IN ('approved_public','metadata_only')",
    [id],
  );
  if (!rows.length) throw new HubRequestError(404,'DATASET_NOT_FOUND','ไม่พบชุดข้อมูลนี้');
  const row=rows[0];
  const resources=await query<Row>(
    'SELECT r.resource_id AS id,r.source_resource_id AS "sourceResourceId",r.name,r.format,'+
    'r.access_status AS "accessStatus",r.declared_license AS "declaredLicense",r.license_url AS "licenseUrl",'+
    'r.project_publication_approved AS "projectPublicationApproved",r.grain,'+
    "CASE WHEN r.access_status='approved_public' AND r.project_publication_approved AND run.status='succeeded' THEN r.active_run_id::text ELSE NULL END AS \"activeRunId\", "+
    "CASE WHEN r.access_status='approved_public' AND r.project_publication_approved THEN run.completed_at ELSE NULL END AS \"lastSuccessAt\", "+
    "CASE WHEN r.access_status='approved_public' AND r.project_publication_approved THEN max(o.period_end)::text ELSE NULL END AS \"dataAsOf\" "+
    "FROM hub.resources r LEFT JOIN hub.sync_runs run ON run.run_id=r.active_run_id AND run.status='succeeded' "+
    'LEFT JOIN hub.observations o ON o.resource_id=r.resource_id AND o.run_id=r.active_run_id '+
    "WHERE r.dataset_id=$1 AND r.access_status IN ('approved_public','metadata_only') "+
    'GROUP BY r.resource_id,run.completed_at,run.status ORDER BY r.name,r.resource_id LIMIT 500',
    [id],
  );
  const availability: DatasetSummary['availability']=row.hasRows?'ready':row.hasActive?'empty':'metadata_only';
  const data: DatasetDetail={
    id:String(row.id),sourceId:String(row.sourceId),sourceDatasetId:String(row.sourceDatasetId),
    title:String(row.title),description:String(row.description??''),category:category(row.category),
    owner:text(row.owner),sourceUrl:String(row.sourceUrl),modifiedAt:date(row.modifiedAt),
    resourceCount:Number(row.resourceCount??0),availability,
    freshness:freshness(date(row.sourceUpdatedAt??row.completedAt),num(row.freshnessDays)),
    access:row.hasActive?'approved_public':'metadata_only',
    resources:resources.map(resource=>({
      id:String(resource.id),sourceResourceId:String(resource.sourceResourceId),name:String(resource.name),
      format:text(resource.format),accessStatus:resource.accessStatus as HubResource['accessStatus'],
      declaredLicense:text(resource.declaredLicense),licenseUrl:text(resource.licenseUrl),
      projectPublicationApproved:Boolean(resource.projectPublicationApproved),grain:text(resource.grain),
      activeRunId:text(resource.activeRunId),lastSuccessAt:date(resource.lastSuccessAt),dataAsOf:text(resource.dataAsOf),
    })),
  };
  return jsonData(data,{meta:makeMeta(rows,row.hasActive?'approved_public':'metadata_only',availability)});
}

export async function getDbSourceStatus(id: string) {
  if (!id || id.length > 80) throw new HubRequestError(400, 'INVALID_ID', 'รหัสแหล่งข้อมูลไม่ถูกต้อง');
  if (await hasD1Catalog()) {
    return getD1SourceStatus(id);
  }
  const rows=await query<Row>(
    'SELECT s.source_id AS id,s.source_name AS name,s.base_url AS "baseUrl",s.status,'+
    's.freshness_days AS "freshnessDays",'+
    "max(run.completed_at) FILTER (WHERE run.status='succeeded') AS \"lastSuccessAt\","+
    '(array_agg(run.status ORDER BY run.started_at DESC) FILTER (WHERE run.run_id IS NOT NULL))[1] AS "latestStatus" '+
    'FROM hub.sources s LEFT JOIN hub.sync_runs run ON run.source_id=s.source_id AND '+
    '(run.resource_id IS NULL OR EXISTS (SELECT 1 FROM hub.resources visible_resource '+
    "WHERE visible_resource.resource_id=run.resource_id AND visible_resource.access_status='approved_public' AND visible_resource.project_publication_approved)) "+
    "WHERE s.source_id=$1 AND s.metadata_access_status IN ('approved_public','metadata_only') GROUP BY s.source_id",
    [id],
  );
  if (!rows.length) throw new HubRequestError(404,'SOURCE_NOT_FOUND','ไม่พบแหล่งข้อมูลนี้');
  const runs=await query<Row>(
    'SELECT run_id AS "runId",kind,status,started_at AS "startedAt",completed_at AS "completedAt",'+
    'records_read AS "recordsRead",records_written AS "recordsWritten",error_code AS "errorCode" '+
    'FROM hub.sync_runs run WHERE source_id=$1 AND (resource_id IS NULL OR EXISTS ('+
    'SELECT 1 FROM hub.resources visible_resource WHERE visible_resource.resource_id=run.resource_id '+
    "AND visible_resource.access_status='approved_public' AND visible_resource.project_publication_approved)) ORDER BY started_at DESC LIMIT 10",
    [id],
  );
  const row=rows[0];
  const data: SourceStatus={
    id:String(row.id),name:String(row.name),baseUrl:String(row.baseUrl),
    status:row.status as HubSource['status'],lastSuccessAt:date(row.lastSuccessAt),
    latestStatus:text(row.latestStatus) as SourceRun['status']|null,
    recentRuns:runs.map(run=>({
      runId:String(run.runId),kind:run.kind as SourceRun['kind'],status:run.status as SourceRun['status'],
      startedAt:date(run.startedAt)??'',completedAt:date(run.completedAt),
      recordsRead:Number(run.recordsRead),recordsWritten:Number(run.recordsWritten),errorCode:text(run.errorCode),
    })),
  };
  return jsonData(data,{meta:{...makeMeta(rows,'metadata_only','ready'),availability:'ready',
    freshness:freshness(data.lastSuccessAt,num(row.freshnessDays))}});
}
