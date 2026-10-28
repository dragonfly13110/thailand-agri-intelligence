import 'server-only';
import { HubRequestError, parseDate, parseText } from './http';
import { decodeSeriesId } from './series-id';
import type { AccessStatus, Completeness, HubObservation, Pagination } from './types';

/** A CSV export is one snapshot of one resource; anything larger must be narrowed by the caller. */
export const EXPORT_MAX_ROWS = 1_000;
export const EXPORT_PAGE_SIZE = 100;
export const EXPORT_MAX_PAGES = 10;

/** Excel only reads Thai text as UTF-8 when the file starts with a BOM. */
const UTF8_BOM = String.fromCharCode(0xfeff);

const OBSERVATION_COLUMNS = [
  'rowKey', 'seriesId', 'periodStart', 'periodEnd', 'periodLabel',
  'locationCode', 'locationKind', 'locationName', 'provinceCode',
  'cropCode', 'cropName', 'metricId', 'metricName', 'product', 'grade', 'market', 'unit',
  'value', 'dimensions', 'qualityStatus', 'sourceRowRef',
] as const;

const PROVENANCE_COLUMNS = [
  'datasetId', 'resourceId', 'resourceGrain', 'sourceIds', 'sourceUrl',
  'datasetVersion', 'sourceRetrievedAt', 'sourceUpdatedAt', 'dataAsOf',
  'publicationCompleteness', 'publicationWarnings', 'exportGeneratedAt', 'exportRowCount',
] as const;

export const CSV_COLUMNS = [...OBSERVATION_COLUMNS, ...PROVENANCE_COLUMNS] as const;

export type ExportResourceAccess = {
  id: string;
  grain: string | null;
  accessStatus: AccessStatus;
  projectPublicationApproved: boolean;
  activeRunId: string | null;
};

export type ExportDatasetAccess = {
  id: string;
  access: AccessStatus;
  sourceUrl: string | null;
  resources: ExportResourceAccess[];
};

/** Only the meta fields the export actually trusts; every other field stays out of the file. */
export type ExportRecordsMeta = {
  access: AccessStatus;
  completeness: Completeness;
  datasetVersion: string | null;
  sourceIds: string[];
  sourceRetrievedAt: string | null;
  sourceUpdatedAt: string | null;
  dataAsOf: string | null;
  warnings: string[];
};

export type ExportRecordsPage = { data: HubObservation[]; meta: ExportRecordsMeta; pagination: Pagination };

export type ExportRecordsQuery = {
  datasetId: string;
  resourceId: string;
  page: number;
  pageSize: number;
  from: string | null;
  to: string | null;
};

export type ExportReaders = {
  readDataset(datasetId: string): Promise<ExportDatasetAccess>;
  readRecords(query: ExportRecordsQuery): Promise<ExportRecordsPage>;
};

export type ExportQuery = { datasetId: string; resourceId: string; from: string | null; to: string | null };

export type DatasetCsvExport = {
  csv: string;
  filename: string;
  rowCount: number;
  datasetVersion: string;
  completeness: Completeness;
  warnings: string[];
};

export function parseExportQuery(url: URL, datasetId: string): ExportQuery {
  if (!datasetId || datasetId.length > 260) throw new HubRequestError(400, 'INVALID_ID', 'รหัสชุดข้อมูลไม่ถูกต้อง');
  const resourceId = parseText(url, 'resourceId', 260);
  if (!resourceId) throw new HubRequestError(400, 'INVALID_QUERY', 'ต้องระบุ resourceId ของทรัพยากรที่ต้องการส่งออก');
  const from = parseDate(url, 'from');
  const to = parseDate(url, 'to');
  if (from && to && from > to) throw new HubRequestError(400, 'INVALID_QUERY', 'ช่วงวันที่ไม่ถูกต้อง');
  return { datasetId, resourceId, from, to };
}

const DANGEROUS_HEAD = /^[=+\-@]/;
const LEADING_BLANK = /^[\t\n\r ]+/;
const CONTROL_BYTES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Neutralises spreadsheet formulas without touching numeric cells: a leading
 * apostrophe makes Excel treat the cell as text, so a source string such as
 * `=HYPERLINK(...)` never executes. Tab/newline-leading values are covered too
 * because Excel trims them before deciding a cell is a formula.
 */
function neutralizeText(value: string): string {
  const text = value.replace(CONTROL_BYTES, '');
  if (/^[\t\n\r]/.test(text)) return "'" + text;
  return DANGEROUS_HEAD.test(text.replace(LEADING_BLANK, '')) ? "'" + text : text;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatNumber(value);
  const text = typeof value === 'boolean' ? String(value) : value;
  const safe = neutralizeText(text);
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function dimensionsCell(dimensions: HubObservation['dimensions']): string {
  if (!dimensions || typeof dimensions !== 'object') return '';
  // Raw text here: `cell` is the only place that quotes and escapes a field.
  return Object.keys(dimensions).length ? JSON.stringify(dimensions) : '';
}

function observationRow(row: HubObservation): (string | number | boolean | null)[] {
  return [
    row.rowKey, row.seriesId, row.periodStart, row.periodEnd, row.periodLabel,
    row.locationCode, row.locationKind, row.locationName, row.provinceCode,
    row.cropCode, row.cropName, row.metricId, row.metricName, row.product, row.grade, row.market, row.unit,
    row.value,
    dimensionsCell(row.dimensions),
    row.qualityStatus, row.sourceRowRef,
  ];
}

function provenanceRow(context: ExportContext): (string | number | null)[] {
  return [
    context.datasetId, context.resourceId, context.resourceGrain, context.sourceIds, context.sourceUrl,
    context.datasetVersion, context.sourceRetrievedAt, context.sourceUpdatedAt, context.dataAsOf,
    context.completeness, context.warnings.join('; '), context.exportedAt, context.rowCount,
  ];
}

type ExportContext = {
  datasetId: string;
  resourceId: string;
  resourceGrain: string | null;
  sourceIds: string;
  sourceUrl: string | null;
  datasetVersion: string;
  sourceRetrievedAt: string | null;
  sourceUpdatedAt: string | null;
  dataAsOf: string | null;
  completeness: Completeness;
  warnings: string[];
  exportedAt: string;
  rowCount: number;
};

function buildCsv(rows: HubObservation[], context: ExportContext): string {
  const lines = [CSV_COLUMNS.map((name) => cell(name)).join(',')];
  for (const row of rows) {
    lines.push([...observationRow(row), ...provenanceRow(context)].map((value) => cell(value)).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

const FILENAME_SLUG = /[^A-Za-z0-9._-]+/g;

/**
 * Resource ids are upstream URLs, so the query and userinfo parts are dropped
 * before slugging: a `?token=...` must never end up in a download filename.
 */
function slug(value: string, fallback: string) {
  const core = (value.split(/[?#]/)[0] ?? '').split('@').pop() ?? '';
  const cleaned = core.replace(FILENAME_SLUG, '-').replace(/^[-.]+/, '').replace(/[-.]+$/, '').slice(0, 60);
  return cleaned.length ? cleaned : fallback;
}

export function exportFilename(query: ExportQuery, exportedAt: string): string {
  const stamp = exportedAt.replace(/[^0-9]/g, '').slice(0, 14) || 'unknown';
  const range = [query.from ?? 'all', query.to ?? 'all'].map((value) => slug(value, 'all')).join('_');
  const name = [
    'tadih',
    slug(query.datasetId, 'dataset'),
    slug(query.resourceId, 'resource'),
    range,
    stamp,
  ].join('-').slice(0, 150);
  return name.replace(/-+$/, '') + '.csv';
}

function assertPublishable(dataset: ExportDatasetAccess, resourceId: string) {
  if (dataset.access !== 'approved_public') {
    throw new HubRequestError(403, 'EXPORT_NOT_PUBLISHED', 'ชุดข้อมูลนี้ยังไม่ได้รับอนุญาตให้เผยแพร่ตัวเลข จึงส่งออกไม่ได้');
  }
  const resource = dataset.resources.find((item) => item.id === resourceId);
  if (!resource) {
    throw new HubRequestError(404, 'EXPORT_RESOURCE_NOT_FOUND', 'resourceId ที่ขอไม่อยู่ในชุดข้อมูลนี้');
  }
  if (resource.accessStatus !== 'approved_public' || !resource.projectPublicationApproved || !resource.activeRunId) {
    throw new HubRequestError(403, 'EXPORT_NOT_PUBLISHED', 'ทรัพยากรนี้ยังไม่อนุมัติให้เผยแพร่หรือยังไม่มีรอบข้อมูลที่เปิดใช้ จึงส่งออกไม่ได้');
  }
  return resource;
}

function assertStableSnapshot(first: ExportRecordsPage, next: ExportRecordsPage, page: number) {
  if (next.meta.datasetVersion !== first.meta.datasetVersion || next.pagination.total !== first.pagination.total) {
    throw new HubRequestError(409, 'EXPORT_CHANGED', 'รอบข้อมูลที่เผยแพร่เปลี่ยนระหว่างอ่าน จึงหยุดส่งออกเพื่อไม่ให้ไฟล์ปนคนละรอบ กรุณาลองใหม่');
  }
  if (next.pagination.page !== page) {
    throw new HubRequestError(409, 'EXPORT_CHANGED', 'หน้าของข้อมูลที่ได้กลับมากับที่ขอไม่ตรงกัน จึงหยุดส่งออก');
  }
}

function seriesIdBelongsToResource(seriesId: unknown, resourceId: string): boolean {
  if (typeof seriesId !== 'string') return false;
  try {
    const decoded = decodeSeriesId(seriesId);
    return decoded.kind === 'v2'
      ? decoded.identity.resourceId === resourceId
      : decoded.resourceId === resourceId;
  } catch {
    return false;
  }
}

export async function buildDatasetCsvExport(request: {
  query: ExportQuery;
  exportedAt: string;
  readers: ExportReaders;
}): Promise<DatasetCsvExport> {
  const { datasetId, resourceId, from, to } = request.query;
  const dataset = await request.readers.readDataset(datasetId);
  const resource = assertPublishable(dataset, resourceId);

  const base = { resourceId, page: 1, pageSize: EXPORT_PAGE_SIZE, from, to };
  const first = await request.readers.readRecords({ datasetId, ...base });
  const total = first.pagination.total;
  if (total > EXPORT_MAX_ROWS) {
    throw new HubRequestError(413, 'EXPORT_TOO_LARGE',
      'ทรัพยากรที่กรองแล้วมี ' + total.toLocaleString('th-TH') + ' แถว เกิน limit ' + EXPORT_MAX_ROWS.toLocaleString('th-TH') +
        ' แถวต่อคำขอ กรุณากำหนดช่วง from/to ให้แคบลงแล้วส่งออกใหม่');
  }
  if (total === 0) {
    throw new HubRequestError(404, 'EXPORT_NO_ROWS', 'ไม่มีแถวข้อมูลที่เผยแพร่ในรอบที่ใช้งานอยู่สำหรับทรัพยากรและช่วงวันที่นี้ จึงไม่มีไฟล์ให้ดาวน์โหลด');
  }
  if (first.meta.access !== 'approved_public') {
    throw new HubRequestError(403, 'EXPORT_NOT_PUBLISHED', 'ข้อมูลกลางปฏิเสธสิทธิ์เผยแพร่ของชุดข้อมูลนี้ จึงส่งออกไม่ได้');
  }
  const datasetVersion = first.meta.datasetVersion;
  if (!datasetVersion) {
    throw new HubRequestError(409, 'EXPORT_CHANGED', 'ยืนยันเวอร์ชันรอบข้อมูลที่เผยแพร่ไม่ได้ จึงไม่สามารถออกไฟล์ที่อ้างว่ามาจากชุดข้อมูลเดียว');
  }

  const pages = Math.ceil(total / EXPORT_PAGE_SIZE);
  if (pages > EXPORT_MAX_PAGES) {
    throw new HubRequestError(413, 'EXPORT_TOO_LARGE',
      'ต้องอ่านมากกว่า ' + EXPORT_MAX_PAGES + ' หน้าต่อคำขอ กรุณากำหนดช่วง from/to ให้แคบลงแล้วส่งออกใหม่');
  }
  const rows = [...first.data];
  for (let page = 2; page <= pages; page++) {
    const next = await request.readers.readRecords({ datasetId, ...base, page });
    assertStableSnapshot(first, next, page);
    rows.push(...next.data);
  }

  if (rows.length !== total || rows.length > EXPORT_MAX_ROWS) {
    throw new HubRequestError(409, 'EXPORT_CHANGED', 'จำนวนแถวที่ได้รวมไม่ตรงกับที่ข้อมูลกลางรายงาน จึงหยุดส่งออกเพื่อไม่ให้ไฟล์ขาดหรือเกิน');
  }
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.rowKey)) {
      throw new HubRequestError(409, 'EXPORT_CHANGED', 'พบแถวซ้ำระหว่างอ่านหลายหน้า ซึ่งเป็นสัญญาณว่ารอบข้อมูลเปลี่ยนระหว่างทาง จึงหยุดส่งออก');
    }
    seen.add(row.rowKey);
    if (!seriesIdBelongsToResource(row.seriesId, resourceId)) {
      throw new HubRequestError(409, 'EXPORT_CHANGED', 'พบแถวที่ไม่ได้เป็นของทรัพยากรที่เลือก จึงหยุดส่งออก');
    }
  }

  const context: ExportContext = {
    datasetId,
    resourceId,
    resourceGrain: resource.grain,
    sourceIds: first.meta.sourceIds.join('; '),
    sourceUrl: dataset.sourceUrl,
    datasetVersion,
    sourceRetrievedAt: first.meta.sourceRetrievedAt ?? null,
    sourceUpdatedAt: first.meta.sourceUpdatedAt,
    dataAsOf: first.meta.dataAsOf,
    completeness: first.meta.completeness,
    warnings: first.meta.warnings,
    exportedAt: request.exportedAt,
    rowCount: rows.length,
  };

  return {
    csv: buildCsv(rows, context),
    filename: exportFilename(request.query, request.exportedAt),
    rowCount: rows.length,
    datasetVersion,
    completeness: first.meta.completeness,
    warnings: first.meta.warnings,
  };
}

export async function exportDatasetCsv(request: {
  query: ExportQuery;
  exportedAt: string;
  readers: ExportReaders;
}) {
  const result = await buildDatasetCsvExport(request);
  return datasetCsvResponse(result);
}

export function datasetCsvResponse(result: DatasetCsvExport) {
  return new Response(UTF8_BOM + result.csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="' + result.filename + '"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
