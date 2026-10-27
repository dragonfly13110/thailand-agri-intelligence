import type { ApiMeta, HubSource, Pagination, SourceRun, SourceStatus } from './types';

/** The run statuses the hub reports, plus the `unknown` the UI must fall back to. */
export type RunStatusTone = SourceRun['status'] | 'unknown';

type SourcePage = { data: HubSource[]; pagination?: Pagination };

export type LabeledTime = { text: string; unknown: boolean };

export type StatusPanel = {
  registry: { value: string | null; label: string; tone: 'normal' | 'attention' };
  latestRun: {
    tone: RunStatusTone;
    label: string;
    showAsSuccess: boolean;
  };
  latestVisibleRun: { statusLabel: string; errorCode: string | null; startedAt: LabeledTime; completedAt: LabeledTime };
  lastSuccessfulSync: { text: string; unknown: boolean };
  apiReadAt: { label: string; text: string };
  readIsNotFreshnessNote: string;
  fallback: { mode: boolean; note: string };
  runHistory: { available: boolean; note: string; rows: RunHistoryRow[] };
};

export type RunHistoryRow = {
  runId: string;
  kindLabel: string;
  statusLabel: string;
  tone: RunStatusTone;
  startedLabel: LabeledTime;
  completedLabel: LabeledTime;
  recordsText: string;
  errorCode: string | null;
};

const REGISTRY_LABELS: Record<HubSource['status'], string> = {
  enabled: 'พร้อมใช้งาน',
  deferred: 'รอเริ่มเชื่อมต่อ',
  needs_access: 'ต้องขอสิทธิ์ก่อนใช้',
  unavailable: 'เชื่อมต่อไม่ได้',
};

const RUN_LABELS: Record<SourceRun['status'], string> = {
  succeeded: 'สำเร็จ',
  partial: 'เสร็จบางส่วน',
  failed: 'ล้มเหลว',
  running: 'กำลังรัน',
};

const GENERIC_ERROR_MESSAGE = 'ระบบอ่านข้อมูลไม่สำเร็จ';

export function registryLabel(value?: string | null): string {
  return value && value in REGISTRY_LABELS ? REGISTRY_LABELS[value as HubSource['status']] : 'ยังไม่ทราบ';
}

export function runStatusTone(value?: string | null): RunStatusTone {
  return value && value in RUN_LABELS ? (value as SourceRun['status']) : 'unknown';
}

export function runStatusLabel(value?: string | null): string {
  const tone = runStatusTone(value);
  return tone === 'unknown' ? 'ยังไม่ทราบ' : RUN_LABELS[tone];
}

export function isLatestRunSuccess(value?: string | null): boolean {
  return runStatusTone(value) === 'succeeded';
}

export function kindLabel(value?: string | null): string {
  if (value === 'numeric') return 'ตัวเลข (numeric)';
  if (value === 'metadata') return 'คำอธิบาย (metadata)';
  return value ? String(value) : 'ยังไม่ทราบ';
}

function numberLabel(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('th-TH') : 'ยังไม่ทราบ';
}

export function formatTimeBangkok(value?: string | null): LabeledTime {
  if (!value || Number.isNaN(Date.parse(value))) return { text: 'ยังไม่ทราบ', unknown: true };
  const formatted = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
  return { text: formatted, unknown: false };
}

/** Read and written counts stay attached to their own run; kinds and units are never merged. */
export function runRecordsLines(runs: readonly SourceRun[]): string[] {
  return runs.map(run =>
    `${kindLabel(run.kind)} · อ่าน ${numberLabel(run.recordsRead)} · เขียน ${numberLabel(run.recordsWritten)}`,
  );
}

function runHistoryRow(run: SourceRun): RunHistoryRow {
  return {
    runId: run.runId,
    kindLabel: kindLabel(run.kind),
    statusLabel: runStatusLabel(run.status),
    tone: runStatusTone(run.status),
    startedLabel: formatTimeBangkok(run.startedAt),
    completedLabel: formatTimeBangkok(run.completedAt),
    recordsText: runRecordsLines([run])[0],
    errorCode: run.errorCode ?? null,
  };
}

export function buildStatusPanel(detail: SourceStatus, responseMeta?: Partial<ApiMeta> | null): StatusPanel {
  const tone = runStatusTone(detail.latestStatus);
  const latest = detail.recentRuns.length ? detail.recentRuns[0] : undefined;
  const fallback = responseMeta?.runtimeMode === 'source_api_fallback';
  const lastSuccess = formatTimeBangkok(detail.lastSuccessAt);
  return {
    registry: {
      value: detail.status,
      label: registryLabel(detail.status),
      tone: detail.status === 'enabled' ? 'normal' : 'attention',
    },
    latestRun: {
      tone,
      label: runStatusLabel(detail.latestStatus),
      showAsSuccess: tone === 'succeeded',
    },
    latestVisibleRun: {
      statusLabel: runStatusLabel(latest?.status),
      errorCode: latest?.errorCode ?? null,
      startedAt: formatTimeBangkok(latest?.startedAt ?? null),
      completedAt: formatTimeBangkok(latest?.completedAt ?? null),
    },
    lastSuccessfulSync: lastSuccess,
    apiReadAt: {
      label: 'เวลาที่ Hub API อ่านข้อมูล',
      text: formatTimeBangkok(responseMeta?.retrievedAt ?? null).text,
    },
    readIsNotFreshnessNote:
      'เวลาที่อ่านสำเร็จเป็นเพียงเวลาของคำขอนี้ ไม่ใช่เวลาที่ต้นทางปรับปรุงข้อมูล และไม่ใช่ข้อมูลถึงวัน (dataAsOf)',
    fallback: {
      mode: fallback,
      note: fallback
        ? 'โหมด source_api_fallback: สถานะนี้ตรวจจากการตอบกลับของ API ต้นทางโดยตรง ไม่ใช่หลักฐานว่างาน sync เข้าคลังกลางสำเร็จ'
        : '',
    },
    runHistory: {
      available: detail.recentRuns.length > 0,
      note: detail.recentRuns.length
        ? ''
        : 'รอบล่าสุดอ่านจากทะเบียนรอบงาน ไม่พบรายการรอบที่เปิดเผยได้',
      rows: detail.recentRuns.map(runHistoryRow),
    },
  };
}

export function pageCountFrom(pagination?: Pagination | null): number | null {
  if (!pagination) return null;
  const { page, pageSize, total } = pagination;
  if (!Number.isFinite(pageSize) || pageSize <= 0 || !Number.isFinite(total) || total < 0) return null;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Walks the pages the API actually returned; never assumes how many sources exist. */
export function mergeSourcePages(pages: readonly SourcePage[], maxPages = 8) {
  const byId = new Map<string, HubSource>();
  let duplicateRows = 0;
  let total = 0;
  let requestedPages = 0;
  let sawPagination = false;
  for (const page of pages) {
    requestedPages += 1;
    if (page.pagination) {
      sawPagination = true;
      total = page.pagination.total;
    }
    for (const row of page.data ?? []) {
      if (byId.has(row.id)) duplicateRows += 1;
      else byId.set(row.id, row);
    }
    if (sawPagination && byId.size >= total) break;
    if (requestedPages >= maxPages) break;
  }
  const rows = [...byId.values()];
  const complete = !sawPagination ? true : rows.length >= total;
  return {
    rows,
    total,
    complete,
    requestedPages,
    duplicateRows,
    note: !complete
      ? 'โหลดรายการได้ ' + rows.length.toLocaleString('th-TH') + ' จาก ' + total.toLocaleString('th-TH') + ' แหล่งที่ API แจ้ง (จำกัดจำนวนหน้าต่อรอบ)'
      : duplicateRows
        ? 'พบรายการ id ซ้ำระหว่าง ' + duplicateRows.toLocaleString('th-TH') + ' แถวที่ข้ามไป'
        : '',
  };
}

export type MergedSources = ReturnType<typeof mergeSourcePages>;

export function filterSources(rows: readonly HubSource[], query: string) {
  const needle = query.normalize('NFC').trim().toLocaleLowerCase('th');
  if (!needle) return { matched: [...rows], active: false, note: '' };
  const matched = rows.filter(row =>
    (row.name ?? '').normalize('NFC').toLocaleLowerCase('th').includes(needle) ||
    (row.id ?? '').normalize('NFC').toLocaleLowerCase('th').includes(needle),
  );
  return {
    matched,
    active: true,
    note: 'พบ ' + matched.length.toLocaleString('th-TH') + ' จาก ' + rows.length.toLocaleString('th-TH') + ' แหล่งที่โหลดมา',
  };
}

/** Only credentialed-free http(s) links may be rendered as anchors. */
export function safeHttpUrl(value?: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Strips URLs, query strings and credential-shaped fragments before any message reaches the DOM. */
export function sanitizeErrorText(value?: string | null): string {
  if (!value) return GENERIC_ERROR_MESSAGE;
  const cleaned = value
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ')
    .replace(/\b(?:token|secret|password|authorization|bearer|api[_-]?key|key|uid|ukey)\b\s*[=:]\s*\S+/gi, ' ')
    .replace(/\?\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    .trim();
  return cleaned || GENERIC_ERROR_MESSAGE;
}

export type ApiErrorView = { code: string; message: string; requestId: string | null };

export function readApiError(body: unknown, httpStatus: number): ApiErrorView {
  const error = body && typeof body === 'object' && 'error' in body ? (body as { error?: unknown }).error : undefined;
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown; requestId?: unknown };
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return {
        code: record.code.slice(0, 40),
        message: sanitizeErrorText(record.message),
        requestId: typeof record.requestId === 'string' ? record.requestId.slice(0, 60) : null,
      };
    }
  }
  return { code: 'HTTP_' + httpStatus, message: GENERIC_ERROR_MESSAGE, requestId: null };
}
