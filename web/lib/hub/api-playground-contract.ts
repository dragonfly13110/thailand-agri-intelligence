import type { ApiContract, ApiEndpoint, ApiQueryParam } from './api-catalog-types';

export type ParsedApiBody =
  | { kind: 'empty'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'json'; text: string; value: unknown };

export function apiAcceptHeader(contract: ApiContract): string {
  return contract === 'csv' ? 'text/csv' : 'application/json';
}

export function parseApiResponseBody(text: string, contentType: string): ParsedApiBody {
  if (!text.trim()) return { kind: 'empty', text };
  if (/^(text|application)\/csv(?:\s*;|$)/i.test(contentType.trim())) return { kind: 'text', text };
  try {
    return { kind: 'json', text, value: JSON.parse(text) as unknown };
  } catch {
    return { kind: 'text', text };
  }
}

export function csvDownloadFilename(contentDisposition: string): string {
  const filename = /(?:^|;)\s*filename="?([^";]+)"?/i.exec(contentDisposition)?.[1];
  return filename && /^[A-Za-z0-9._-]+\.csv$/i.test(filename) ? filename : 'export.csv';
}

function validateValue(param: ApiQueryParam, value: string): string | null {
  if (!value) return param.required ? `${param.name}: ต้องระบุค่า` : null;
  if (param.maxLength !== undefined && value.length > param.maxLength) return `${param.name}: ยาวได้ไม่เกิน ${param.maxLength} ตัวอักษร`;
  if (param.pattern && !new RegExp(param.pattern).test(value)) return `${param.name}: รูปแบบไม่ถูกต้อง`;
  if (param.type === 'enum' && !(param.values ?? []).includes(value)) return `${param.name}: ค่าไม่อยู่ในรายการที่รองรับ`;
  if (param.type === 'integer') {
    if (!/^-?\d+$/.test(value)) return `${param.name}: ต้องเป็นจำนวนเต็ม`;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) return `${param.name}: จำนวนเต็มไม่ถูกต้อง`;
    if (param.minimum !== undefined && number < param.minimum) return `${param.name}: ต้องไม่น้อยกว่า ${param.minimum}`;
    if (param.maximum !== undefined && number > param.maximum) return `${param.name}: ต้องไม่เกิน ${param.maximum}`;
  }
  if (param.type === 'date') {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return `${param.name}: ใช้รูปแบบวันที่ YYYY-MM-DD`;
    }
  }
  return null;
}

export function validateApiRequest(
  endpoint: ApiEndpoint,
  pathValues: Record<string, string>,
  queryValues: Record<string, string>,
): string[] {
  const issues: string[] = [];
  for (const param of endpoint.pathParams ?? []) {
    const value = (pathValues[param.name] ?? '').trim();
    if (!value) issues.push(`${param.name}: ต้องระบุค่า`);
    else if (param.maxLength !== undefined && value.length > param.maxLength) issues.push(`${param.name}: ยาวได้ไม่เกิน ${param.maxLength} ตัวอักษร`);
    else if (param.pattern && !new RegExp(param.pattern).test(value)) issues.push(`${param.name}: รูปแบบไม่ถูกต้อง`);
  }
  for (const param of endpoint.query ?? []) {
    const issue = validateValue(param, (queryValues[param.name] ?? '').trim());
    if (issue) issues.push(issue);
  }
  const from = (queryValues.from ?? '').trim();
  const to = (queryValues.to ?? '').trim();
  if (from && to && from > to) issues.push('from/to: ช่วงวันที่ไม่ถูกต้อง');
  return issues;
}

// CSV export ต้องไม่เติม from/to: ช่วงวันที่ค้างจะตัดแถวจริงจนได้ EXPORT_NO_ROWS
export function buildInitialQueryValues(endpoint: ApiEndpoint): Record<string, string> {
  const values: Record<string, string> = {};
  for (const param of endpoint.query ?? []) {
    const example = param.example ?? '';
    if (endpoint.contract === 'csv' && param.type === 'date' && !param.required) {
      values[param.name] = '';
      continue;
    }
    const validEnum = param.type !== 'enum' || !example || (param.values ?? []).includes(example);
    values[param.name] = validEnum ? example : '';
  }
  return values;
}

export type SuggestOutcomeStatus = 'success' | 'partial' | 'kept' | 'empty' | 'error';

export interface SuggestOutcome {
  status: SuggestOutcomeStatus;
  message: string;
}

export interface SuggestOutcomeInput {
  filledParams: string[];
  keptParams: string[];
  missingLabels: string[];
  error: { status: number | null } | null;
}

function listParams(names: string[]): string {
  return names.length > 0 ? ` (${names.join(', ')})` : '';
}

export function describeSuggestOutcome(input: SuggestOutcomeInput): SuggestOutcome {
  const missingText = input.missingLabels.length > 0 ? ` · ยังไม่พบ ${input.missingLabels.join(' และ ')}` : '';
  const errorText = input.error !== null
    ? ` · ค้นบางรายการไม่สำเร็จ${input.error.status !== null ? ` (HTTP ${input.error.status})` : ''}`
    : '';
  const hasGap = input.missingLabels.length > 0 || input.error !== null;

  if (input.filledParams.length > 0) {
    const keptText = input.keptParams.length > 0 ? ` · ใช้ค่าที่กรอกไว้${listParams(input.keptParams)}` : '';
    return {
      status: hasGap ? 'partial' : 'success',
      message: `เติม id จาก API จริงแล้ว${listParams(input.filledParams)}${keptText}${missingText}${errorText}${hasGap ? '' : ' · ตรวจ id ก่อนเรียก API'}`,
    };
  }
  if (input.keptParams.length > 0) {
    const base = `ใช้ค่าที่กรอกไว้${listParams(input.keptParams)}`;
    return hasGap
      ? { status: 'partial', message: `${base}${missingText}${errorText}` }
      : { status: 'kept', message: `${base} โดยไม่ได้ค้นหาใหม่` };
  }
  if (input.error !== null) {
    return {
      status: 'error',
      message: `ค้นหา id จาก API จริงไม่สำเร็จ${errorText} กรอก id เองหรือลองอีกครั้ง`,
    };
  }
  return { status: 'empty', message: 'API จริงยังไม่คืน id สำหรับ endpoint นี้ กรอก id เองได้' };
}

export interface ExportDatasetSummaryLike {
  id: string;
  availability: string;
}

export interface ExportResourceLike {
  id: string;
  accessStatus: string | null;
  projectPublicationApproved: boolean;
  activeRunId: string | null;
}

/** Enough candidates to find a working pair without scanning the whole catalog. */
export const EXPORT_CANDIDATE_LIMIT = 10;

export function isExportableResource(resource: ExportResourceLike): boolean {
  return resource.accessStatus === 'approved_public'
    && resource.projectPublicationApproved
    && typeof resource.activeRunId === 'string'
    && resource.activeRunId.trim().length > 0;
}

export function exportResourceCandidates(resources: ExportResourceLike[], currentResource: string): string[] {
  const exportable = resources.filter(isExportableResource).map((resource) => resource.id);
  if (!currentResource || !exportable.includes(currentResource)) return exportable;
  return [currentResource, ...exportable.filter((id) => id !== currentResource)];
}

export function exportDatasetCandidates(datasets: ExportDatasetSummaryLike[]): string[] {
  return [
    ...datasets.filter((dataset) => dataset.availability === 'ready'),
    ...datasets.filter((dataset) => dataset.availability === 'empty'),
  ].map((dataset) => dataset.id).slice(0, EXPORT_CANDIDATE_LIMIT);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readExportDatasets(payload: unknown): ExportDatasetSummaryLike[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  const datasets: ExportDatasetSummaryLike[] = [];
  for (const item of payload.data) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) continue;
    datasets.push({
      id: item.id.trim(),
      availability: typeof item.availability === 'string' ? item.availability : '',
    });
  }
  return datasets;
}

export function readExportResources(payload: unknown): ExportResourceLike[] {
  const data = isRecord(payload) ? payload.data : null;
  if (!isRecord(data) || !Array.isArray(data.resources)) return [];
  const resources: ExportResourceLike[] = [];
  for (const item of data.resources) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()) continue;
    resources.push({
      id: item.id.trim(),
      accessStatus: typeof item.accessStatus === 'string' ? item.accessStatus : null,
      projectPublicationApproved: item.projectPublicationApproved === true,
      activeRunId: typeof item.activeRunId === 'string' ? item.activeRunId : null,
    });
  }
  return resources;
}

export function readPaginationTotal(payload: unknown): number | null {
  if (!isRecord(payload) || !isRecord(payload.pagination)) return null;
  const total = payload.pagination.total;
  return typeof total === 'number' && Number.isFinite(total) ? total : null;
}
