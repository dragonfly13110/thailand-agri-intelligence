import 'server-only';
import { randomUUID } from 'node:crypto';
import { HubDatabaseError } from './db';
import type { AccessStatus, ApiMeta, Availability, Completeness, Freshness, Pagination } from './types';

export class HubRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function createMeta(input: Partial<Omit<ApiMeta, 'retrievedAt' | 'runtimeMode'>> & {
  runtimeMode?: ApiMeta['runtimeMode'];
} = {}): ApiMeta {
  return {
    availability: input.availability ?? 'empty',
    freshness: input.freshness ?? 'unknown',
    completeness: input.completeness ?? 'unknown',
    access: input.access ?? 'metadata_only',
    sourceIds: input.sourceIds ?? [],
    retrievedAt: new Date().toISOString(),
    sourceRetrievedAt: input.sourceRetrievedAt ?? null,
    dataAsOf: input.dataAsOf ?? null,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    datasetVersion: input.datasetVersion ?? null,
    warnings: input.warnings ?? [],
    runtimeMode: input.runtimeMode ?? 'database',
  };
}

export function jsonData<T>(data: T, options: {
  meta?: Partial<ApiMeta>;
  pagination?: Pagination;
  status?: number;
} = {}) {
  return Response.json({
    data,
    meta: createMeta(options.meta),
    ...(options.pagination ? { pagination: options.pagination } : {}),
  }, {
    status: options.status ?? 200,
    headers: { 'cache-control': 'no-store' },
  });
}

export function emptyPage<T>(options: {
  access?: AccessStatus;
  availability?: Availability;
  warnings?: string[];
  runtimeMode?: ApiMeta['runtimeMode'];
} = {}) {
  return jsonData<T[]>([], {
    meta: {
      availability: options.availability ?? 'empty',
      access: options.access ?? 'metadata_only',
      warnings: options.warnings ?? [],
      runtimeMode: options.runtimeMode ?? 'database',
    },
    pagination: { page: 1, pageSize: 25, total: 0 },
  });
}

export async function handleApi(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    const requestId = randomUUID();
    if (error instanceof HubRequestError) {
      return Response.json({
        error: { code: error.code, message: error.message, requestId },
      }, { status: error.status, headers: { 'cache-control': 'no-store' } });
    }
    if (error instanceof HubDatabaseError) {
      const messages = {
        HUB_DATABASE_NOT_CONFIGURED: 'คลังข้อมูลกลางยังไม่ได้ตั้งค่า',
        HUB_DATABASE_CONFIGURATION_INVALID: 'การตั้งค่าคลังข้อมูลไม่ถูกต้อง',
        HUB_DATABASE_UNAVAILABLE: 'ขณะนี้เชื่อมต่อคลังข้อมูลกลางไม่ได้',
      } as const;
      return Response.json({
        error: { code: error.code, message: messages[error.code], requestId },
      }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({
      error: { code: 'INTERNAL_ERROR', message: 'ระบบอ่านข้อมูลไม่สำเร็จ', requestId },
    }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}

export function parsePage(url: URL): Pagination {
  const page = parsePositiveInt(url.searchParams.get('page'), 1, 10_000, 'page');
  const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 25, 100, 'pageSize');
  return { page, pageSize, total: 0 };
}

export function parsePositiveInt(raw: string | null, fallback: number, max: number, name: string) {
  if (raw === null || raw === '') return fallback;
  if (!/^\d{1,6}$/.test(raw)) throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า ' + name + ' ไม่ถูกต้อง');
  const value = Number(raw);
  if (value < 1 || value > max) throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า ' + name + ' ต้องอยู่ระหว่าง 1 ถึง ' + max);
  return value;
}

export function parseText(url: URL, name: string, maxLength = 160) {
  const value = (url.searchParams.get(name) ?? '').normalize('NFC').trim();
  if (value.length > maxLength) throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า ' + name + ' ยาวเกินกำหนด');
  return value;
}

export function parseDate(url: URL, name: string) {
  const value = parseText(url, name, 10);
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00Z') : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'วันที่ ' + name + ' ไม่ถูกต้อง');
  }
  return value;
}

export function freshness(modifiedAt: string | null, freshnessDays: number | null): Freshness {
  if (!modifiedAt || !freshnessDays || freshnessDays < 1) return 'unknown';
  return Date.now() - Date.parse(modifiedAt) > freshnessDays * 86_400_000 ? 'stale' : 'fresh';
}

export function completeness(status: string | null | undefined): Completeness {
  if (status === 'succeeded') return 'complete';
  if (status === 'partial' || status === 'failed') return 'partial';
  return 'unknown';
}
