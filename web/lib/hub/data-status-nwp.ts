/**
 * `/data-status` view of the TMD HPC NWP pipeline.
 *
 * NWP runs live in `nwp_runs`, not `sync_runs`, so the registry list of
 * `/api/v1/sources` can never show them. This module turns the real
 * `/api/v1/nwp/runs` payload into the one row the status page may display.
 * It never invents a run: a malformed, failed or unreadable run is skipped,
 * and no usable run means `null`.
 */

export type NwpStatusView = {
  runId: string;
  initAt: string;
  retrievedAt: string;
  statusLabel: string;
  licenseLabel: string;
  unitLabel: string;
  leadHoursLabel: string;
  variableLabels: string[];
  publicationMode: string;
};

const STATUS_LABELS: Record<string, string> = {
  ready: 'พร้อมใช้งาน',
  partial: 'พร้อมใช้งานบางส่วน',
};

const LICENSE_LABELS: Record<string, string> = {
  approved_public: 'อนุมัติให้เผยแพร่แล้ว',
};

const VARIABLE_LABELS: Record<string, string> = {
  p1h: 'ฝน 1 ชม.',
  p24h: 'ฝน 24 ชม.',
  t2m: 'อุณหภูมิ 2 ม.',
  rhum: 'ความชื้นสัมพัทธ์',
  ws10m: 'ลม 10 ม.',
};

const PENDING_UNIT_LABEL = 'หน่วย มม. ตามหน้าเผยแพร่ TMD · รอ TMD ยืนยันหน่วยอย่างเป็นทางการ';

type RunLike = Record<string, unknown>;

function runsFrom(payload: unknown): RunLike[] {
  if (Array.isArray(payload)) return payload.filter((row): row is RunLike => Boolean(row) && typeof row === 'object');
  if (payload && typeof payload === 'object' && Array.isArray((payload as { runs?: unknown }).runs)) {
    return ((payload as { runs: unknown[] }).runs).filter(
      (row): row is RunLike => Boolean(row) && typeof row === 'object',
    );
  }
  return [];
}

function readableTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function readableRun(row: RunLike): {
  runId: string;
  initAt: string;
  retrievedAt: string;
  status: string;
  licenseStatus: string;
  unitStatus: string;
  leadHours: number[];
  variables: string[];
  publicationMode: string;
} | null {
  const runId = typeof row.runId === 'string' ? row.runId.trim() : '';
  const initAt = readableTime(row.initAt);
  const retrievedAt = readableTime(row.retrievedAt);
  const status = typeof row.status === 'string' && row.status in STATUS_LABELS ? row.status : null;
  const licenseStatus = typeof row.licenseStatus === 'string' ? row.licenseStatus : null;
  const unitStatus = typeof row.unitStatus === 'string' ? row.unitStatus : null;
  if (!runId || !initAt || !retrievedAt || !status || !licenseStatus || !unitStatus) return null;

  const leadHours = Array.isArray(row.leadHours)
    ? row.leadHours.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    : [];
  const variables = Array.isArray(row.variables)
    ? row.variables.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  const publicationMode = typeof row.publicationMode === 'string' ? row.publicationMode : '';

  return {
    runId,
    initAt,
    retrievedAt,
    status,
    licenseStatus,
    unitStatus,
    leadHours: [...new Set(leadHours)].sort((a, b) => a - b),
    variables,
    publicationMode,
  };
}

function leadHoursLabel(leadHours: number[]): string {
  if (leadHours.length === 0) return 'ยังไม่มีก้าวเวลาที่เผยแพร่';
  const step = leadHours.length > 1 ? leadHours[1] - leadHours[0] : 0;
  const evenlySpaced =
    leadHours.length >= 3 &&
    step > 0 &&
    leadHours.every((value, index) => value === leadHours[0] + step * index);
  if (evenlySpaced) {
    return `${leadHours[0]}–${leadHours[leadHours.length - 1]} ชั่วโมง (ทุก ${step} ชม.)`;
  }
  return leadHours.map((value) => `${value}`).join(', ') + ' ชั่วโมง';
}

export function buildNwpStatusView(payload: unknown): NwpStatusView | null {
  const runs = runsFrom(payload).map(readableRun).filter((row): row is NonNullable<typeof row> => row !== null);
  if (runs.length === 0) return null;

  runs.sort((a, b) => {
    const byInit = Date.parse(b.initAt) - Date.parse(a.initAt);
    return byInit !== 0 ? byInit : b.runId.localeCompare(a.runId);
  });
  const run = runs[0];

  return {
    runId: run.runId,
    initAt: run.initAt,
    retrievedAt: run.retrievedAt,
    statusLabel: STATUS_LABELS[run.status],
    licenseLabel: LICENSE_LABELS[run.licenseStatus] ?? run.licenseStatus,
    unitLabel:
      run.unitStatus === 'pending_official_confirmation' ? PENDING_UNIT_LABEL : run.unitStatus,
    leadHoursLabel: leadHoursLabel(run.leadHours),
    variableLabels: run.variables.map((value) => VARIABLE_LABELS[value] ?? value),
    publicationMode: run.publicationMode,
  };
}
