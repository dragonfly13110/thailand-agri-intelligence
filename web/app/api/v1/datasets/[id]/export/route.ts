import { getDatabaseKind } from '../../../../../../lib/hub/db';
import { HubRequestError, handleApi } from '../../../../../../lib/hub/http';
import { getDbDataset } from '../../../../../../lib/hub/catalog-repository';
import { getD1Dataset } from '../../../../../../lib/hub/d1-catalog-repository';
import {
  buildDatasetCsvExport,
  datasetCsvResponse,
  parseExportQuery,
  type ExportDatasetAccess,
  type ExportRecordsMeta,
  type ExportRecordsPage,
  type ExportRecordsQuery,
  type ExportResourceAccess,
} from '../../../../../../lib/hub/dataset-csv-export';
import { listD1Records } from '../../../../../../lib/hub/d1-numeric-repository';
import { listDbRecords } from '../../../../../../lib/hub/numeric-repository';
import type { Completeness, HubObservation } from '../../../../../../lib/hub/types';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function completeness(value: unknown): Completeness {
  return value === 'complete' || value === 'partial' ? value : 'unknown';
}

/** A failed records/detail read keeps the status and message the existing API already returns. */
async function readEnvelope(response: Response, fallbackMessage: string) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = asRecord(asRecord(body)?.error);
    throw new HubRequestError(response.status, text(error?.code) ?? 'EXPORT_READ_FAILED', text(error?.message) ?? fallbackMessage);
  }
  const envelope = asRecord(body);
  if (!envelope) throw new HubRequestError(500, 'EXPORT_READ_FAILED', fallbackMessage);
  return envelope;
}

function normalizeMeta(raw: Record<string, unknown> | null): ExportRecordsMeta {
  return {
    access: raw?.access === 'approved_public' ? 'approved_public' : 'metadata_only',
    completeness: completeness(raw?.completeness),
    datasetVersion: text(raw?.datasetVersion),
    sourceIds: strings(raw?.sourceIds),
    sourceRetrievedAt: text(raw?.sourceRetrievedAt),
    sourceUpdatedAt: text(raw?.sourceUpdatedAt),
    dataAsOf: text(raw?.dataAsOf),
    warnings: strings(raw?.warnings),
  };
}

/**
 * The records readers only inspect `url.searchParams`, so the page request is
 * described here instead of being fetched back over HTTP from this same server.
 */
function recordsUrl(query: ExportRecordsQuery) {
  const params = new URLSearchParams({ resourceId: query.resourceId, page: String(query.page), pageSize: String(query.pageSize) });
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return new URL('/api/v1/datasets/' + encodeURIComponent(query.datasetId) + '/records?' + params.toString(), 'https://hub.internal');
}

async function readRecords(query: ExportRecordsQuery): Promise<ExportRecordsPage> {
  const databaseKind = await getDatabaseKind();
  if (databaseKind === 'none') {
    throw new HubRequestError(503, 'EXPORT_DATABASE_UNAVAILABLE', 'คลังข้อมูลกลางยังไม่พร้อมใช้งาน จึงส่งออกแถวที่เผยแพร่ไม่ได้');
  }
  const url = recordsUrl(query);
  const response = databaseKind === 'd1' ? await listD1Records(query.datasetId, url) : await listDbRecords(query.datasetId, url);
  const envelope = await readEnvelope(response, 'อ่านแถวข้อมูลกลางเพื่อส่งออกไม่สำเร็จ');
  if (!Array.isArray(envelope.data) || !envelope.pagination) {
    throw new HubRequestError(500, 'EXPORT_READ_FAILED', 'รูปแบบแถวข้อมูลจากคลังข้อมูลกลางไม่ถูกต้อง');
  }
  const pagination = asRecord(envelope.pagination);
  return {
    data: envelope.data as HubObservation[],
    meta: normalizeMeta(asRecord(envelope.meta)),
    pagination: {
      page: Number(pagination?.page ?? query.page),
      pageSize: Number(pagination?.pageSize ?? query.pageSize),
      total: Number(pagination?.total ?? 0),
    },
  };
}

async function readDataset(datasetId: string): Promise<ExportDatasetAccess> {
  const databaseKind = await getDatabaseKind();
  if (databaseKind === 'none') {
    throw new HubRequestError(503, 'EXPORT_DATABASE_UNAVAILABLE', 'คลังข้อมูลกลางยังไม่พร้อมใช้งาน จึงตรวจสอบสิทธิ์ส่งออกไม่ได้');
  }
  const response = databaseKind === 'd1' ? await getD1Dataset(datasetId) : await getDbDataset(datasetId);
  const envelope = await readEnvelope(response, 'เปิดชุดข้อมูลเพื่อตรวจสิทธิ์ส่งออกไม่สำเร็จ');
  const data = asRecord(envelope.data);
  if (!data) throw new HubRequestError(500, 'EXPORT_READ_FAILED', 'รูปแบบรายละเอียดชุดข้อมูลไม่ถูกต้อง');
  const resources = Array.isArray(data.resources) ? data.resources : [];
  return {
    id: text(data.id) ?? datasetId,
    access: data.access === 'approved_public' ? 'approved_public' : 'metadata_only',
    sourceUrl: text(data.sourceUrl),
    resources: resources.map((item): ExportResourceAccess => {
      const resource = asRecord(item);
      return {
        id: text(resource?.id) ?? '',
        grain: text(resource?.grain),
        accessStatus: resource?.accessStatus === 'approved_public' ? 'approved_public' : 'metadata_only',
        projectPublicationApproved: resource?.projectPublicationApproved === true,
        activeRunId: text(resource?.activeRunId),
      };
    }).filter((resource) => resource.id),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  return handleApi(async () => {
    const { id } = await context.params;
    const query = parseExportQuery(url, id);
    const result = await buildDatasetCsvExport({
      query,
      exportedAt: new Date().toISOString(),
      readers: { readDataset, readRecords },
    });
    return datasetCsvResponse(result);
  });
}
