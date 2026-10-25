import 'server-only';
import { freshness, HubRequestError, jsonData, parsePage, parseText } from './http';
import type { ApiMeta, DatasetDetail, DatasetSummary, HubSource, SourceStatus } from './types';

type RegistrySource = {
  id: string;
  source_id: string;
  owner: string;
  name: string;
  base_url: string;
  type: string;
  freshness_days: number | null;
};

type CkanPackage = {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  notes?: unknown;
  metadata_modified?: unknown;
  state?: unknown;
  private?: unknown;
  organization?: unknown;
  resources?: unknown;
  tags?: unknown;
  groups?: unknown;
  license_title?: unknown;
  license_url?: unknown;
};

type SearchResult = { count: number; results: CkanPackage[] };
type SearchOutcome = { source: RegistrySource; result?: SearchResult; retrievedAt: string; error?: string; warnings?: string[] };

const allowedIds = new Set(['doae', 'oae', 'ldd', 'dld', 'dof', 'nabc', 'cad', 'alro', 'acfs', 'royalrain', 'hii', 'opsmoac']);
const pageSize = 100;
const maxRowsPerSource = 300;
const maxConcurrentPagesPerSource = 3;
const maxBodyBytes = 1_500_000;
// ponytail: keep the bootstrap metadata fallback to reviewed CKAN hosts; the sync job uses config/sources.json.
const allSources: RegistrySource[] = [
  { id: 'doae', source_id: 'doae', owner: 'กรมส่งเสริมการเกษตร', name: 'DOAE Open Data', base_url: 'https://ckan.doae.go.th', type: 'ckan', freshness_days: null },
  { id: 'oae', source_id: 'oae', owner: 'สำนักงานเศรษฐกิจการเกษตร', name: 'OAE Catalog', base_url: 'https://catalog.oae.go.th', type: 'ckan', freshness_days: null },
  { id: 'ldd', source_id: 'ldd', owner: 'กรมพัฒนาที่ดิน', name: 'LDD Catalog', base_url: 'https://lddcatalog.ldd.go.th', type: 'ckan', freshness_days: null },
  { id: 'dld', source_id: 'dld', owner: 'กรมปศุสัตว์', name: 'DLD Catalog', base_url: 'https://dld.gdcatalog.go.th', type: 'ckan', freshness_days: null },
  { id: 'dof', source_id: 'dof', owner: 'กรมประมง', name: 'DOF Catalog', base_url: 'https://catalog.fisheries.go.th', type: 'ckan', freshness_days: null },
  { id: 'nabc', source_id: 'nabc', owner: 'สำนักงานเศรษฐกิจการเกษตร', name: 'NABC Catalog', base_url: 'https://nabc-catalog1.oae.go.th', type: 'ckan', freshness_days: null },
  { id: 'cad', source_id: 'cad', owner: 'กรมตรวจบัญชีสหกรณ์', name: 'CAD Open Data', base_url: 'https://cadckan.cad.go.th', type: 'ckan', freshness_days: null },
  { id: 'alro', source_id: 'alro', owner: 'สำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม', name: 'ALRO Open Data', base_url: 'https://opendata.alro.go.th', type: 'ckan', freshness_days: null },
  { id: 'acfs', source_id: 'acfs', owner: 'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ', name: 'ACFS Catalog', base_url: 'https://catalog-acfs.data.go.th', type: 'ckan', freshness_days: null },
  { id: 'royalrain', source_id: 'royalrain', owner: 'กรมฝนหลวงและการบินเกษตร', name: 'Royal Rain Catalog', base_url: 'https://catalog.royalrain.go.th', type: 'ckan', freshness_days: null },
  { id: 'hii', source_id: 'hii', owner: 'สถาบันสารสนเทศทรัพยากรน้ำ (องค์การมหาชน)', name: 'HII Data Catalog', base_url: 'https://data.hii.or.th', type: 'ckan', freshness_days: null },
  { id: 'opsmoac', source_id: 'opsmoac', owner: 'สำนักงานปลัดกระทรวงเกษตรและสหกรณ์', name: 'MOAC Data Catalog', base_url: 'https://datacatalog.opsmoac.go.th', type: 'ckan', freshness_days: null },
].filter(source => allowedIds.has(source.id) && source.source_id === source.id && isHttpsUrl(source.base_url));

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function sourceById(id: string) {
  const source = allSources.find(item => item.id === id);
  if (!source) throw new HubRequestError(404, 'SOURCE_NOT_FOUND', 'ไม่พบแหล่งข้อมูลนี้');
  return source;
}

function compactText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function getCkanJson(source: RegistrySource, action: string, params: Record<string, string>) {
  const base = new URL(source.base_url);
  const url = new URL('/api/3/action/' + action, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: { accept: 'application/json' },
  });
  const length = Number(response.headers.get('content-length'));
  if (!response.ok) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    throw new Error('SOURCE_UNAVAILABLE');
  }
  if (Number.isFinite(length) && length > maxBodyBytes) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    throw new Error('SOURCE_RESPONSE_TOO_LARGE');
  }
  if (!response.body) throw new Error('SOURCE_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > maxBodyBytes) {
        await reader.cancel();
        throw new Error('SOURCE_RESPONSE_TOO_LARGE');
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'SOURCE_RESPONSE_TOO_LARGE') throw error;
    await reader.cancel().catch(() => undefined);
    throw new Error('SOURCE_UNAVAILABLE');
  }
  const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('SOURCE_RESPONSE_INVALID');
  }
  if (!payload || typeof payload !== 'object' || (payload as { success?: unknown }).success !== true) {
    throw new Error('SOURCE_RESPONSE_INVALID');
  }
  return (payload as { result?: unknown }).result;
}

async function searchSource(source: RegistrySource, query: string, rows: number, start = 0): Promise<SearchOutcome> {
  const retrievedAt = new Date().toISOString();
  try {
    const result = await getCkanJson(source, 'package_search', {
      q: query || '*:*',
      rows: String(rows),
      start: String(start),
      sort: 'title_string asc',
    });
    if (!result || typeof result !== 'object') throw new Error('SOURCE_RESPONSE_INVALID');
    const data = result as { count?: unknown; results?: unknown };
    if (!Number.isInteger(data.count) || Number(data.count) < 0 || !Array.isArray(data.results) ||
        data.results.length > rows || data.results.some(item => !item || typeof item !== 'object')) {
      throw new Error('SOURCE_RESPONSE_INVALID');
    }
    return { source, retrievedAt, result: { count: Number(data.count), results: data.results as CkanPackage[] } };
  } catch (error) {
    const code = error instanceof Error && ['SOURCE_RESPONSE_TOO_LARGE', 'SOURCE_RESPONSE_INVALID'].includes(error.message)
      ? error.message
      : 'SOURCE_UNAVAILABLE';
    return { source, retrievedAt, error: code };
  }
}

async function searchSourcePages(source: RegistrySource, query: string): Promise<SearchOutcome> {
  // These two catalogs have unusually large package metadata, so smaller pages
  // keep each response within the same per-response size bound.
  const rows = source.id === 'nabc' ? 20 : source.id === 'opsmoac' ? 10 : pageSize;
  const first = await searchSource(source, query, rows);
  if (!first.result || first.result.count <= first.result.results.length) return first;
  const pages = Math.min(Math.ceil(first.result.count / rows), maxRowsPerSource / rows);
  const starts = Array.from({ length: pages - 1 }, (_, index) => (index + 1) * rows);
  const concurrency = source.id === 'nabc' ? 1 : maxConcurrentPagesPerSource;
  const results = [...first.result.results];
  const warnings: string[] = [];
  for (let index = 0; index < starts.length; index += concurrency) {
    const batch = await Promise.all(starts.slice(index, index + concurrency).map(start =>
      searchSource(source, query, rows, start)));
    for (const outcome of batch) {
      if (!outcome.result || outcome.error) {
        if (!warnings.includes('อ่านบางหน้าของ catalog ' + source.name + ' ไม่สำเร็จ')) {
          warnings.push('อ่านบางหน้าของ catalog ' + source.name + ' ไม่สำเร็จ');
        }
        continue;
      }
      if (outcome.result.count !== first.result.count) {
        if (!warnings.includes('จำนวนรายการของ catalog ' + source.name + ' เปลี่ยนระหว่างการอ่าน')) {
        warnings.push('จำนวนรายการของ catalog ' + source.name + ' เปลี่ยนระหว่างการอ่าน');
        }
        continue;
      }
      results.push(...outcome.result.results);
    }
  }
  return { ...first, result: { count: first.result.count, results }, warnings: warnings.length ? warnings : undefined };
}

function categoryOf(item: CkanPackage): DatasetSummary['category'] {
  const tags = Array.isArray(item.tags) ? item.tags.map(tag =>
    tag && typeof tag === 'object' ? compactText((tag as { name?: unknown }).name, 100) : '') : [];
  const groups = Array.isArray(item.groups) ? item.groups.map(group =>
    group && typeof group === 'object' ? compactText((group as { title?: unknown }).title, 100) : '') : [];
  const text = [...tags, ...groups, compactText(item.title, 300), compactText(item.notes, 600)]
    .join(' ').normalize('NFC').toLocaleLowerCase('th');
  const has = (...values: string[]) => values.some(value => text.includes(value));
  if (has('ประมง', 'fisheries', 'fishery')) return 'fisheries';
  if (has('ปศุสัตว์', 'livestock', 'ปศุสัตว')) return 'livestock';
  if (has('ราคา', 'price', 'ตลาด', 'market')) return 'prices';
  if (has('น้ำ', 'water', 'อากาศ', 'weather', 'ภัย', 'drought', 'flood')) return 'water';
  if (has('ดิน', 'land', 'soil', 'ดาวเทียม', 'satellite')) return 'land';
  if (has('พืช', 'crop', 'ข้าว', 'ผลผลิต', 'production')) return 'crops';
  return null;
}

function packageName(item: CkanPackage) {
  const name = compactText(item.name, 200);
  return name && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? name : '';
}

function mapSummary(source: RegistrySource, item: CkanPackage): DatasetSummary | null {
  const name = packageName(item);
  const title = compactText(item.title, 300);
  if (!name || !title || item.private === true || item.state === 'deleted' || item.state === 'draft') return null;
  // The DOAE acquisition audit identified these 162 package names as test/empty placeholders.
  if (source.id === 'doae' && (name.startsWith('uitest-') || ['testdataset', 'emptydataset'].includes(name.toLowerCase()))) return null;
  const sourceUrl = new URL('/dataset/' + encodeURIComponent(name), source.base_url).toString();
  const modifiedAt = compactText(item.metadata_modified, 40) || null;
  return {
    id: source.id + ':' + name,
    sourceId: source.id,
    title,
    description: compactText(item.notes, 800),
    category: categoryOf(item),
    owner: source.owner,
    sourceUrl,
    modifiedAt,
    resourceCount: null,
    availability: 'metadata_only',
    freshness: freshness(modifiedAt, source.freshness_days),
    access: 'metadata_only',
  };
}

function meta(outcomes: SearchOutcome[], warnings: string[] = []): Partial<ApiMeta> {
  const failed = outcomes.filter(item => item.error);
  const succeeded = outcomes.filter(item => !item.error);
  return {
    availability: succeeded.length ? 'ready' : 'unavailable',
    freshness: 'unknown',
    completeness: failed.length || outcomes.some(item => item.warnings?.length || (item.result && item.result.count > item.result.results.length))
      ? 'partial'
      : 'complete',
    access: 'metadata_only',
    sourceIds: succeeded.map(item => item.source.id),
    dataAsOf: null,
    sourceUpdatedAt: null,
    datasetVersion: null,
    warnings: [
      'แสดงเฉพาะ metadata จาก API ต้นทาง ยังไม่มีข้อมูลตัวเลขจากคลังกลาง',
      ...warnings,
      ...failed.map(item => 'อ่าน catalog ' + item.source.name + ' ไม่สำเร็จ (' + item.error + ')'),
      ...outcomes.flatMap(item => item.warnings ?? []),
      ...outcomes.filter(item => item.result && item.result.count > item.result.results.length)
        .map(item => 'แสดงไม่เกิน ' + maxRowsPerSource + ' รายการแรกจาก ' + item.source.name + ' ในโหมดนี้'),
      ...(outcomes.some(item => item.result && item.result.count > item.result.results.length)
        ? ['pagination.total นับเฉพาะรายการที่อ่านได้ในโหมด fallback ไม่ใช่ยอดทั้งหมดจากต้นทาง']
        : []),
    ],
    runtimeMode: 'source_api_fallback',
  };
}

function healthMeta(outcomes: SearchOutcome[]): Partial<ApiMeta> {
  const succeeded = outcomes.filter(item => !item.error);
  const failed = outcomes.filter(item => item.error);
  return {
    availability: succeeded.length ? 'ready' : 'unavailable',
    freshness: 'unknown',
    completeness: failed.length ? 'partial' : 'unknown',
    access: 'metadata_only',
    sourceIds: succeeded.map(item => item.source.id),
    dataAsOf: null,
    sourceUpdatedAt: null,
    datasetVersion: null,
    warnings: [
      'สถานะนี้ตรวจจากการตอบกลับของ API catalog ไม่ใช่ผลการ sync ข้อมูลตัวเลข',
      ...failed.map(item => 'อ่าน catalog ' + item.source.name + ' ไม่สำเร็จ (' + item.error + ')'),
    ],
    runtimeMode: 'source_api_fallback',
  };
}

export async function listFallbackSources(url: URL) {
  const page = parsePage(url);
  const status = parseText(url, 'status', 30);
  if (status && !['enabled', 'deferred', 'needs_access', 'unavailable'].includes(status)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'สถานะแหล่งข้อมูลไม่ถูกต้อง');
  }
  const outcomes = await Promise.all(allSources.map(source => searchSource(source, '', 0)));
  const allData: HubSource[] = outcomes.map(item => ({
    id: item.source.id,
    name: item.source.name,
    baseUrl: item.source.base_url,
    status: item.error ? 'unavailable' : 'enabled',
    lastSuccessAt: null,
  }));
  const data = status ? allData.filter(source => source.status === status) : allData;
  const visibleOutcomes = status
    ? outcomes.filter(item => (item.error ? 'unavailable' : 'enabled') === status)
    : outcomes;
  const total = data.length;
  return jsonData(data.slice((page.page - 1) * page.pageSize, page.page * page.pageSize), {
    meta: healthMeta(visibleOutcomes),
    pagination: { ...page, total },
  });
}

export async function listFallbackDatasets(url: URL) {
  const page = parsePage(url);
  const query = parseText(url, 'q').replace(/[^\p{L}\p{N}\s._-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const sourceId = parseText(url, 'sourceId', 80);
  const category = parseText(url, 'category', 40);
  const provinceCode = parseText(url, 'provinceCode', 2);
  if (provinceCode && !/^\d{2}$/.test(provinceCode)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดไม่ถูกต้อง');
  }
  if (category && !['crops', 'prices', 'water', 'land', 'fisheries', 'livestock'].includes(category)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'หมวดข้อมูลไม่ถูกต้อง');
  }
  const selectedSources = sourceId ? [sourceById(sourceId)] : allSources;
  if (provinceCode) {
    return jsonData([], {
      meta: {
        availability: 'metadata_only', freshness: 'unknown', completeness: 'unknown', access: 'metadata_only',
        sourceIds: selectedSources.map(source => source.id), retrievedAt: new Date().toISOString(), dataAsOf: null,
        sourceUpdatedAt: null, datasetVersion: null,
        warnings: ['โหมด catalog fallback ไม่มีหลักฐานตัวเลขระดับจังหวัด จึงไม่แสดงผลกรองจังหวัด'],
        runtimeMode: 'source_api_fallback',
      },
      pagination: { ...page, total: 0 },
    });
  }
  const outcomes = await Promise.all(selectedSources.map(source => searchSourcePages(source, query)));
  const records = outcomes.flatMap(outcome => outcome.result
    ? outcome.result.results.map(item => mapSummary(outcome.source, item)).filter((item): item is DatasetSummary => Boolean(item))
    : []).filter(item => !category || item.category === category)
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.title.localeCompare(b.title, 'th'));
  const offset = (page.page - 1) * page.pageSize;
  return jsonData(records.slice(offset, offset + page.pageSize), {
    meta: meta(outcomes),
    pagination: { ...page, total: records.length },
  });
}

export async function getFallbackDataset(id: string) {
  if (id.length > 260) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  const splitAt = id.indexOf(':');
  if (splitAt < 1) throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const source = sourceById(id.slice(0, splitAt));
  const sourceDatasetId = id.slice(splitAt + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(sourceDatasetId)) {
    throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  }
  let result: unknown;
  try {
    result = await getCkanJson(source, 'package_show', { id: sourceDatasetId });
  } catch {
    throw new HubRequestError(503, 'SOURCE_UNAVAILABLE', 'ขณะนี้อ่าน catalog ต้นทางไม่ได้');
  }
  if (!result || typeof result !== 'object') throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const item = result as CkanPackage;
  if (packageName(item) !== sourceDatasetId) throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const summary = mapSummary(source, item);
  if (!summary) throw new HubRequestError(404, 'DATASET_NOT_FOUND', 'ไม่พบชุดข้อมูลนี้');
  const data: DatasetDetail = { ...summary, sourceDatasetId, resources: [] };
  return jsonData(data, {
    meta: {
      ...meta([{ source, retrievedAt: new Date().toISOString(), result: { count: 1, results: [item] } }]),
      sourceIds: [source.id],
    },
  });
}

export async function getFallbackSourceStatus(id: string) {
  const source = sourceById(id);
  const outcome = await searchSource(source, '', 0);
  const data: SourceStatus = {
    id: source.id,
    name: source.name,
    baseUrl: source.base_url,
    status: outcome.error ? 'unavailable' : 'enabled',
    lastSuccessAt: null,
    latestStatus: null,
    recentRuns: [],
  };
  return jsonData(data, { meta: healthMeta([outcome]) });
}

export function metadataOnlyFallback(warning = 'ยังไม่มีข้อมูลตัวเลขในคลังกลาง') {
  return {
    availability: 'metadata_only' as const,
    access: 'metadata_only' as const,
    warnings: [warning],
    runtimeMode: 'source_api_fallback' as const,
  };
}
