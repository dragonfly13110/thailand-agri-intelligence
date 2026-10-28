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
