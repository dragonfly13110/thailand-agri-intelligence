'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { NwpHeatmap } from './nwp-heatmap';
import styles from './nwp-dashboard.module.css';
import {
  NWP_METHOD_GRID,
  NWP_METHOD_PROVINCE,
  NWP_VARIABLE_LABELS_TH,
  NWP_WARNINGS,
  isNwpUnitConfirmed,
  isNwpVariable,
  type NwpThresholds,
  type NwpVariable,
  type RiskLevel,
} from '@/lib/hub/nwp-types';
import { advisoryFor, provinceRiskLabelTh, riskLabelTh, riskRank, unitFor } from '@/lib/hub/nwp-risk';

/**
 * `/nwp` dashboard (lane E).
 *
 * Data contract: `/api/v1/nwp/runs`, `/api/v1/nwp/grid`, `/api/v1/nwp/provinces`
 * (lane D). The server component (`app/nwp/page.tsx`) loads the first payload so
 * the page opens with real numbers; every later interaction (variable tab, lead
 * time) refetches the same public endpoints from the browser.
 *
 * Governance rules enforced here:
 * - Every value on screen is a **model forecast**, never an observation.
 * - The grid cell is never presented as a province value; the province column is
 *   explicitly labelled "ค่าสูงสุดในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด".
 * - Missing stays "ไม่มีข้อมูล" (never 0, never a placeholder number).
 * - The wind variable (ws10m) is withheld: the upstream file appears to carry
 *   wind direction instead of wind speed, so no wind speed is shown anywhere.
 */

export type NwpRunRow = {
  runId: string;
  initAt: string;
  retrievedAt: string;
  domain: string;
  domainLabel: string;
  variables: string[];
  leadHours: number[];
  leadHoursByVariable?: Record<string, number[]>;
  status: string;
  licenseStatus: string;
  unitStatus: string;
  publicationMode: string;
};

export type NwpGridPayload = {
  runId: string;
  variable: string;
  validAt: string;
  bbox: [number, number, number, number];
  nx: number;
  ny: number;
  mean: (number | null)[];
  max: (number | null)[];
  unit: string | null;
  method: string;
};

export type NwpProvinceRow = {
  provinceCode: string;
  provinceName: string;
  value: number | null;
  riskLevel: string | null;
  distanceKm: number | null;
  cellCount: number;
};

export type NwpProvincesPayload = {
  runId: string;
  variable: string;
  validAt: string;
  unit: string | null;
  method: string;
  radiusKm: number;
  provinces: NwpProvinceRow[];
};

export type NwpApiMeta = {
  access?: string;
  availability?: string;
  dataAsOf?: string | null;
  datasetVersion?: string | null;
  warnings?: string[];
};

export type NwpApiError = {
  code: string;
  message: string;
  requestId: string | null;
  status: number;
};

export type NwpDashboardProps = {
  runs: NwpRunRow[];
  regions: { key: string; label: string }[];
  provinceRegion: Record<string, string>;
  provinceReferenceCount: number;
  initialVariable: string | null;
  initialLead: number | null;
  initialGrid: NwpGridPayload | null;
  initialProvinces: NwpProvincesPayload | null;
  initialMeta: NwpApiMeta | null;
  initialError: NwpApiError | null;
  dataAgeText: string;
  thresholds: NwpThresholds | null;
};

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const API_ROOT = '/api/v1/nwp';

/** Wind is withheld on purpose — see the module comment. */
const WITHHELD_VARIABLE = 'ws10m';
const WITHHELD_REASON = 'ต้นทางสลับคอลัมน์ ws10m/wd10m — ระงับจนตรวจยืนยัน';

/** Tab order of the publishable variables (the run decides what really exists). */
const VARIABLE_ORDER: NwpVariable[] = ['p24h', 'p1h', 't2m', 'rhum'];

const NO_DATA = 'ไม่มีข้อมูล';

const ERROR_TITLES: Record<string, string> = {
  HUB_DATABASE_NOT_CONFIGURED: 'ฐานข้อมูลยังไม่ได้ตั้งค่า',
  HUB_DATABASE_CONFIGURATION_INVALID: 'การตั้งค่าฐานข้อมูลไม่ถูกต้อง',
  HUB_DATABASE_UNAVAILABLE: 'เชื่อมต่อฐานข้อมูลกลางไม่ได้',
  NWP_NOT_FOUND: 'ไม่พบรอบพยากรณ์หรือสแนปช็อตที่ระบุ',
  NWP_PUBLICATION_DISABLED: 'การเผยแพร่ตัวเลขถูกปิด',
  INVALID_QUERY: 'คำขอไม่ถูกต้อง',
  NWP_PAYLOAD_INVALID: 'ข้อมูลกริดที่ได้รับไม่ถูกต้อง',
  NWP_PAYLOAD_TOO_LARGE: 'ข้อมูลกริดใหญ่เกินกว่าจะแสดงผล',
  NWP_API_UNAVAILABLE: 'ยังไม่มี API พยากรณ์กริด NWP ให้เรียกใช้',
  NWP_NETWORK_ERROR: 'เชื่อมต่อ API พยากรณ์กริด NWP ไม่ได้',
};

const numberFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
const countFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function timeValue(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** UTC stamp, e.g. `2026-10-26 00:00`. */
function utcStamp(iso: string | null | undefined): string {
  const ms = timeValue(iso);
  if (!Number.isFinite(ms)) return NO_DATA;
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/** ICT (UTC+7) stamp for the same instant. */
function ictStamp(iso: string | null | undefined): string {
  const ms = timeValue(iso);
  if (!Number.isFinite(ms)) return NO_DATA;
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}

function utcAndIct(iso: string | null | undefined): string {
  const ms = timeValue(iso);
  if (!Number.isFinite(ms)) return NO_DATA;
  return `${utcStamp(iso)} UTC (${ictStamp(iso)} ICT)`;
}

/**
 * `validAt = initAt + lead hours` (UTC ISO, no milliseconds).
 * Never derived from a hardcoded lead list — the lead comes from the run.
 */
export function validAtFrom(initAt: string, leadHours: number): string {
  const base = timeValue(initAt);
  if (!Number.isFinite(base)) return '';
  return new Date(base + leadHours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function variableLabel(variable: string): string {
  return isNwpVariable(variable) ? NWP_VARIABLE_LABELS_TH[variable] : variable;
}

/** Leads available for one variable of one run. */
export function leadsForRun(run: NwpRunRow | null, variable: string): number[] {
  if (!run) return [];
  const perVariable = run.leadHoursByVariable?.[variable];
  const source = Array.isArray(perVariable) && perVariable.length > 0 ? perVariable : run.leadHours;
  if (!Array.isArray(source)) return [];
  return source
    .filter((lead): lead is number => typeof lead === 'number' && Number.isFinite(lead))
    .sort((a, b) => a - b);
}

export function defaultVariableFor(run: NwpRunRow | null): string | null {
  if (!run) return null;
  const available = run.variables.filter((variable) => variable !== WITHHELD_VARIABLE);
  for (const preferred of VARIABLE_ORDER) {
    if (available.includes(preferred)) return preferred;
  }
  return available[0] ?? null;
}

export function defaultLeadFor(run: NwpRunRow | null, variable: string | null): number | null {
  if (!run || !variable) return null;
  const leads = leadsForRun(run, variable);
  if (leads.length === 0) return null;
  return leads.includes(0) ? 0 : leads[0];
}

function riskToneClass(level: string | null | undefined): string {
  switch (level) {
    case 'normal':
      return styles.riskNormal;
    case 'watch':
      return styles.riskWatch;
    case 'high':
      return styles.riskHigh;
    case 'severe':
      return styles.riskSevere;
    default:
      return '';
  }
}

function measure(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA;
  return numberFmt.format(value);
}

function selectionKey(runId: string, variable: string, lead: number): string {
  return `${runId}|${variable}|${lead}`;
}

/* ------------------------------------------------------------------ */
/* API access (browser side)                                           */
/* ------------------------------------------------------------------ */

type ApiResult<T> = { ok: true; data: T; meta: NwpApiMeta } | { ok: false; error: NwpApiError };

async function readApi<T>(url: string): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
  } catch {
    return {
      ok: false,
      error: { code: 'NWP_NETWORK_ERROR', message: 'เชื่อมต่อ API พยากรณ์กริด NWP ไม่ได้', requestId: null, status: 0 },
    };
  }
  const body = (await response.json().catch(() => null)) as
    | { data?: unknown; meta?: unknown; error?: { code?: string; message?: string; requestId?: string } }
    | null;
  if (!response.ok || !body || body.data === undefined) {
    const error = body?.error;
    return {
      ok: false,
      error: {
        code: error?.code ?? 'NWP_UNKNOWN_ERROR',
        message: error?.message ?? 'อ่านข้อมูลพยากรณ์กริดไม่สำเร็จ',
        requestId: error?.requestId ?? null,
        status: response.status,
      },
    };
  }
  return { ok: true, data: body.data as T, meta: (body.meta ?? {}) as NwpApiMeta };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

type Selection = { runId: string; variable: string; lead: number };

type DataState = {
  key: string;
  grid: NwpGridPayload | null;
  provinces: NwpProvincesPayload | null;
  meta: NwpApiMeta | null;
  loading: boolean;
  error: NwpApiError | null;
};

export function NwpDashboard({
  runs,
  regions,
  provinceRegion,
  provinceReferenceCount,
  initialVariable,
  initialLead,
  initialGrid,
  initialProvinces,
  initialMeta,
  initialError,
  dataAgeText,
  thresholds,
}: NwpDashboardProps) {
  const firstRun = useMemo(() => {
    const sorted = [...runs].sort((a, b) => {
      const left = timeValue(b.initAt);
      const right = timeValue(a.initAt);
      if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
      return 0;
    });
    return sorted[0] ?? null;
  }, [runs]);

  const [selection, setSelection] = useState<Selection>(() => ({
    runId: firstRun?.runId ?? '',
    variable: initialVariable ?? '',
    lead: initialLead ?? 0,
  }));

  const [valuesAreMax, setValuesAreMax] = useState(false);
  const [query, setQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');

  const initialKey = selectionKey(
    firstRun?.runId ?? '',
    initialVariable ?? '',
    initialLead ?? 0,
  );

  const initialRef = useRef({
    key: initialKey,
    grid: initialGrid,
    provinces: initialProvinces,
    meta: initialMeta,
    error: initialError,
  });

  const [state, setState] = useState<DataState>(() => ({
    key: initialKey,
    grid: initialGrid,
    provinces: initialProvinces,
    meta: initialMeta,
    loading: false,
    error: initialError,
  }));

  const requestToken = useRef(0);

  const load = useCallback(async (target: Selection) => {
    if (!target.runId || !target.variable) return;
    const key = selectionKey(target.runId, target.variable, target.lead);
    const token = (requestToken.current += 1);
    setState((previous) => ({ ...previous, key, loading: true, error: null }));

    const validAt = validAtFrom(
      runs.find((run) => run.runId === target.runId)?.initAt ?? '',
      target.lead,
    );
    const query = `runId=${encodeURIComponent(target.runId)}&variable=${encodeURIComponent(
      target.variable,
    )}&validAt=${encodeURIComponent(validAt)}`;

    const [gridResult, provinceResult] = await Promise.all([
      readApi<NwpGridPayload>(`${API_ROOT}/grid?${query}`),
      readApi<NwpProvincesPayload>(`${API_ROOT}/provinces?${query}`),
    ]);
    if (token !== requestToken.current) return;

    if (!gridResult.ok) {
      setState({ key, grid: null, provinces: null, meta: null, loading: false, error: gridResult.error });
      return;
    }
    if (!provinceResult.ok) {
      setState({
        key,
        grid: gridResult.data,
        provinces: null,
        meta: gridResult.meta,
        loading: false,
        error: provinceResult.error,
      });
      return;
    }
    setState({
      key,
      grid: gridResult.data,
      provinces: provinceResult.data,
      meta: gridResult.meta,
      loading: false,
      error: null,
    });
  }, [runs]);

  useEffect(() => {
    if (!selection.runId || !selection.variable) return;
    const key = selectionKey(selection.runId, selection.variable, selection.lead);
    if (key === initialRef.current.key) {
      setState({
        key,
        grid: initialRef.current.grid,
        provinces: initialRef.current.provinces,
        meta: initialRef.current.meta,
        loading: false,
        error: initialRef.current.error,
      });
      return;
    }
    void load(selection);
  }, [selection, load]);

  const activeRun = useMemo(
    () => runs.find((run) => run.runId === selection.runId) ?? firstRun,
    [runs, selection.runId, firstRun],
  );

  const leads = useMemo(
    () => leadsForRun(activeRun, selection.variable),
    [activeRun, selection.variable],
  );

  const validAt = useMemo(
    () => validAtFrom(activeRun?.initAt ?? '', selection.lead),
    [activeRun, selection.lead],
  );

  const visibleVariables = useMemo(() => {
    if (!activeRun) return [] as string[];
    return activeRun.variables.filter((variable) => variable !== WITHHELD_VARIABLE);
  }, [activeRun]);

  const thresholdsForVariable = useMemo(() => {
    if (!thresholds || !isNwpUnitConfirmed(activeRun?.unitStatus) || !isNwpVariable(selection.variable)) return null;
    const definition = thresholds.variables?.[selection.variable];
    if (!definition) return null;
    if (
      !Number.isFinite(definition.watch) ||
      !Number.isFinite(definition.high) ||
      !Number.isFinite(definition.severe)
    ) {
      return null;
    }
    return { watch: definition.watch, high: definition.high, severe: definition.severe };
  }, [activeRun?.unitStatus, thresholds, selection.variable]);

  const grid = state.grid;
  const provincesPayload = state.provinces;

  const gridStats = useMemo(() => {
    if (!grid) return null;
    const values = (valuesAreMax ? grid.max : grid.mean) ?? [];
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      if (value === null || value === undefined || !Number.isFinite(value)) continue;
      count += 1;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const expected = grid.nx * grid.ny;
    return {
      count,
      expected,
      min: count > 0 ? min : null,
      max: count > 0 ? max : null,
    };
  }, [grid, valuesAreMax]);

  const provinceRows = useMemo(() => {
    const rows = provincesPayload?.provinces ?? [];
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (regionFilter !== 'all' && provinceRegion[row.provinceCode] !== regionFilter) return false;
      if (!needle) return true;
      return row.provinceName.toLowerCase().includes(needle);
    });
    return [...filtered].sort((a, b) => {
      const rank = riskRank(a.riskLevel as RiskLevel | null) - riskRank(b.riskLevel as RiskLevel | null);
      if (rank !== 0) return rank;
      const left = a.value ?? Number.NEGATIVE_INFINITY;
      const right = b.value ?? Number.NEGATIVE_INFINITY;
      if (left !== right) return right - left;
      return a.provinceName.localeCompare(b.provinceName, 'th');
    });
  }, [provincesPayload, query, regionFilter, provinceRegion]);

  const watchCount = useMemo(
    () =>
      (provincesPayload?.provinces ?? []).filter(
        (row) => row.riskLevel !== null && row.riskLevel !== 'normal',
      ).length,
    [provincesPayload],
  );

  const advisoryItems = useMemo(() => {
    if (!isNwpUnitConfirmed(activeRun?.unitStatus) || !isNwpVariable(selection.variable)) return [];
    const rows = provincesPayload?.provinces ?? [];
    return rows
      .filter((row) => row.riskLevel !== null && row.riskLevel !== 'normal')
      .map((row) => ({
        name: row.provinceName,
        level: row.riskLevel as RiskLevel,
        value: row.value,
        text: advisoryFor(selection.variable as NwpVariable, row.riskLevel as RiskLevel),
      }))
      .filter((item) => item.text !== null)
      .sort((a, b) => {
        const rank = riskRank(a.level) - riskRank(b.level);
        if (rank !== 0) return rank;
        return (b.value ?? Number.NEGATIVE_INFINITY) - (a.value ?? Number.NEGATIVE_INFINITY);
      })
      .slice(0, 6);
  }, [activeRun?.unitStatus, provincesPayload, selection.variable]);

  const unitHint = isNwpUnitConfirmed(activeRun?.unitStatus)
    ? unitFor(isNwpVariable(selection.variable) ? selection.variable : ('p24h' as NwpVariable), thresholds)
    : null;

  const handleRunChange = (runId: string) => {
    const nextRun = runs.find((run) => run.runId === runId) ?? null;
    const variable = defaultVariableFor(nextRun) ?? '';
    const lead = defaultLeadFor(nextRun, variable) ?? 0;
    setSelection({ runId, variable, lead });
  };

  const handleVariableChange = (variable: string) => {
    const nextLeads = leadsForRun(activeRun, variable);
    const keep = nextLeads.includes(selection.lead)
      ? selection.lead
      : nextLeads.includes(0)
        ? 0
        : (nextLeads[0] ?? 0);
    setSelection((previous) => ({ ...previous, variable, lead: keep }));
  };

  const hasRun = Boolean(activeRun);

  return (
    <div className={styles.dashboard}>
      <section className={styles.banner} aria-label="ข้อจำกัดของข้อมูลพยากรณ์กริด NWP">
        <span className={styles.bannerIcon} aria-hidden="true">!</span>
        <div className={styles.bannerBody}>
          <span className={styles.bannerBadge}>ค่าพยากรณ์จากแบบจำลอง</span>
          <h2 className={styles.bannerTitle}>ข้อจำกัดสำคัญของข้อมูลชุดนี้</h2>
          <ul className={styles.bannerList}>
            {NWP_WARNINGS.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <p className={styles.bannerText}>
            แหล่งข้อมูล: แบบจำลอง NWP ของกรมอุตุนิยมวิทยา (TMD HPC) โดเมน d02 ความละเอียด 3 กม.
            ลดขนาดเป็นช่องกริด 0.15° — หน่วยและนิยามตัวแปรยังรอการยืนยันจากต้นทาง
            ตัวเลขทุกจุดบนหน้านี้เป็นค่าพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด และไม่ใช่ประกาศเตือนภัยราชการ
          </p>
        </div>
      </section>

      {state.error ? <ErrorBlock error={state.error}/> : null}

      {hasRun && activeRun ? (
        <RunBar run={activeRun} ageText={dataAgeText} runsCount={runs.length}/>
      ) : null}

      {hasRun && activeRun && !state.error ? (
        <>
          <section className={styles.controls} aria-label="ตัวเลือกตัวแปรและระยะเวลานำหน้า">
            {runs.length > 1 ? (
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel} htmlFor="nwp-run">รอบพยากรณ์</label>
                <select
                  id="nwp-run"
                  className={styles.select}
                  value={selection.runId}
                  onChange={(event) => handleRunChange(event.target.value)}
                >
                  {runs.map((run) => (
                    <option key={run.runId} value={run.runId}>
                      {run.runId} · {utcStamp(run.initAt)} UTC
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>ตัวแปรที่รอบนี้มี</span>
              <div className={styles.tabs} role="tablist" aria-label="เลือกตัวแปรพยากรณ์">
                {visibleVariables.length === 0 ? (
                  <span className={styles.panelNote}>รอบนี้ไม่มีตัวแปรที่เผยแพร่ได้</span>
                ) : null}
                {visibleVariables.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    role="tab"
                    aria-selected={variable === selection.variable}
                    className={`${styles.tab} ${variable === selection.variable ? styles.tabActive : ''}`}
                    onClick={() => handleVariableChange(variable)}
                  >
                    {variableLabel(variable)}
                  </button>
                ))}
              </div>
              <p className={styles.panelNote}>
                ตัวแปร “ลม 10 ม.” (ws10m) ถูกระงับไว้: {WITHHELD_REASON} — จึงไม่แสดงค่าความเร็วลมที่ใดในหน้านี้
              </p>
            </div>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>ระยะเวลานำหน้า (นาทีหลังจากเวลาเริ่มต้น)</span>
              <div className={styles.leadButtons} role="group" aria-label="เลือกระยะเวลานำหน้า">
                {leads.map((lead) => (
                  <button
                    key={lead}
                    type="button"
                    aria-pressed={lead === selection.lead}
                    className={`${styles.leadButton} ${lead === selection.lead ? styles.leadActive : ''}`}
                    onClick={() => setSelection((previous) => ({ ...previous, lead }))}
                  >
                    +{countFmt.format(lead)} ชม.
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>ค่าที่แสดงต่อช่องกริด</span>
              <div className={styles.leadButtons} role="group" aria-label="เลือกค่าที่แสดงต่อช่องกริด">
                <button
                  type="button"
                  aria-pressed={!valuesAreMax}
                  className={`${styles.leadButton} ${!valuesAreMax ? styles.leadActive : ''}`}
                  onClick={() => setValuesAreMax(false)}
                >
                  ค่าเฉลี่ย
                </button>
                <button
                  type="button"
                  aria-pressed={valuesAreMax}
                  className={`${styles.leadButton} ${valuesAreMax ? styles.leadActive : ''}`}
                  onClick={() => setValuesAreMax(true)}
                >
                  ค่าสูงสุด
                </button>
              </div>
            </div>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>เวลาที่ใช้งาน (validAt)</span>
              <p className={styles.panelNote}>
                {validAt ? `${utcAndIct(validAt)} · คำนวณจากเวลาเริ่มต้นของรอบ +${countFmt.format(selection.lead)} ชั่วโมง` : NO_DATA}
              </p>
            </div>
          </section>

          <ul className={styles.kpiGrid} aria-label="สรุปค่าของรอบพยากรณ์">
            <li className={styles.kpi}>
              <span className={styles.kpiLabel}>ช่องกริดที่มีข้อมูล</span>
              <span className={styles.kpiValue}>
                {gridStats ? countFmt.format(gridStats.count) : NO_DATA}
                <span className={styles.kpiUnit}>
                  {gridStats ? `จาก ${countFmt.format(gridStats.expected)} ช่อง` : ''}
                </span>
              </span>
              <p className={styles.kpiNote}>ช่องกริด 0.15° · ค่าที่ว่างถูกทิ้งไว้ ไม่ถูกแทนด้วย 0</p>
            </li>
            <li className={styles.kpi}>
              <span className={styles.kpiLabel}>{valuesAreMax ? 'ค่าสูงสุดที่พบในกริด' : 'ค่าเฉลี่ยสูงสุดที่พบในกริด'}</span>
              <span className={styles.kpiValue}>
                {gridStats && gridStats.max !== null ? measure(gridStats.max) : NO_DATA}
                <span className={styles.kpiUnit}>หน่วยรอการยืนยัน</span>
              </span>
              <p className={styles.kpiNote}>ค่าพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด</p>
            </li>
            <li className={styles.kpi}>
              <span className={styles.kpiLabel}>จังหวัดที่มีค่าในรายการ</span>
              <span className={styles.kpiValue}>
                {provincesPayload ? countFmt.format(provincesPayload.provinces.length) : NO_DATA}
                <span className={styles.kpiUnit}>
                  จาก {countFmt.format(provinceReferenceCount)} รายการอ้างอิง
                </span>
              </span>
              <p className={styles.kpiNote}>รหัสจังหวัด 77 รายการเป็นทะเบียนอ้างอิง ไม่ใช่ความครอบคลุมข้อมูล</p>
            </li>
            <li className={styles.kpi}>
              <span className={styles.kpiLabel}>จังหวัดที่เข้าเกณฑ์เฝ้าระวัง</span>
              <span className={styles.kpiValue}>
                {provincesPayload
                  ? isNwpUnitConfirmed(activeRun?.unitStatus) ? countFmt.format(watchCount) : 'ยังไม่จัดระดับ'
                  : NO_DATA}
                <span className={styles.kpiUnit}>จังหวัด</span>
              </span>
              <p className={styles.kpiNote}>
                {isNwpUnitConfirmed(activeRun?.unitStatus)
                  ? 'เกณฑ์ภายในของระบบ (ยังไม่ใช่เกณฑ์ราชการ)'
                  : 'หน่วยและนิยามตัวแปรยังรอยืนยัน จึงยังไม่คำนวณจำนวนจังหวัดที่เข้าเกณฑ์'}
              </p>
            </li>
          </ul>

          <div className={styles.mapLayout}>
            <section className={styles.panel} aria-label="แผนที่กริดค่าพยากรณ์">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>
                  กริดค่าพยากรณ์ {variableLabel(selection.variable)}
                </h2>
                <p className={styles.panelNote}>
                  {utcAndIct(validAt)} · วิธีลดขนาด {grid?.method ?? NWP_METHOD_GRID} ·
                  ค่าที่แสดงคือ{valuesAreMax ? 'ค่าสูงสุด' : 'ค่าเฉลี่ย'}ของบล็อกในช่องกริด 0.15° —
                  ค่ากริดไม่ใช่ค่าของจังหวัด และไม่มีการวาดเส้นเขตการปกครอง
                </p>
              </div>
              <div className={styles.heatmapWrap}>
                {state.loading ? (
                  <div className={styles.skeleton} style={{ height: 420 }} aria-hidden="true" />
                ) : grid ? (
                  <NwpHeatmap
                    mean={grid.mean}
                    max={grid.max}
                    bbox={grid.bbox}
                    nx={grid.nx}
                    ny={grid.ny}
                    variableLabel={variableLabel(selection.variable)}
                    unitLabel={grid.unit}
                    valuesAreMax={valuesAreMax}
                    thresholds={thresholdsForVariable}
                    height={640}
                  />
                ) : (
                  <div className={styles.emptyState}>
                    <strong>ยังไม่มีข้อมูลกริดสำหรับตัวแปรนี้</strong>
                    <span>รอบนี้อาจยังไม่ได้เผยแพร่สแนปช็อตของตัวแปร/เวลาที่เลือก</span>
                  </div>
                )}
              </div>
            </section>

            <section className={styles.provincePanel} aria-label="รายชื่อจังหวัดที่ต้องเฝ้าระวัง">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>รายชื่อจังหวัดที่ต้องเฝ้าระวัง</h2>
                <p className={styles.panelNote}>
                  ค่าสูงสุดในรัศมี {countFmt.format(provincesPayload?.radiusKm ?? 25)} กม.
                  รอบจุดอ้างอิงจังหวัด ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด ·
                  วิธี {provincesPayload?.method ?? NWP_METHOD_PROVINCE} ·
                  เกณฑ์เป็นเกณฑ์ภายในของระบบ
                </p>
              </div>

              <div className={styles.controls}>
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel} htmlFor="nwp-province-search">
                    ค้นหาจังหวัด
                  </label>
                  <input
                    id="nwp-province-search"
                    className={styles.select}
                    type="search"
                    value={query}
                    placeholder="พิมพ์ชื่อจังหวัด เช่น เชียงใหม่"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel} htmlFor="nwp-region-filter">
                    กรองตามภาค
                  </label>
                  <select
                    id="nwp-region-filter"
                    className={styles.select}
                    value={regionFilter}
                    onChange={(event) => setRegionFilter(event.target.value)}
                  >
                    <option value="all">ทุกภาค</option>
                    {regions.map((region) => (
                      <option key={region.key} value={region.key}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <caption>
                    ค่าสูงสุดในรัศมี 25 กม. รอบจุดอ้างอิงจังหวัด ไม่ใช่ค่าเฉลี่ยทั้งจังหวัด —
                    หน่วยและนิยามตัวแปรยังรอการยืนยันจากต้นทาง TMD
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">จังหวัด</th>
                      <th scope="col">ค่าสูงสุดในรัศมี 25 กม.</th>
                      <th scope="col">ระยะถึงเซลล์ใกล้สุด (กม.)</th>
                      <th scope="col">จำนวนเซลล์</th>
                      <th scope="col">ระดับความเสี่ยง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provinceRows.length === 0 ? (
                      <tr>
                        <td colSpan={5}>{NO_DATA} — ไม่พบจังหวัดที่ตรงกับตัวกรอง</td>
                      </tr>
                    ) : null}
                    {provinceRows.map((row) => (
                      <tr key={row.provinceCode}>
                        <th scope="row">{row.provinceName}</th>
                        <td>{measure(row.value)}</td>
                        <td>
                          {row.distanceKm === null || row.distanceKm === undefined
                            ? NO_DATA
                            : numberFmt.format(row.distanceKm)}
                        </td>
                        <td>{countFmt.format(row.cellCount)}</td>
                        <td>
                          <span className={`${styles.riskBadge} ${riskToneClass(row.riskLevel)}`}>
                            {provinceRiskLabelTh(row.value, row.riskLevel as RiskLevel | null)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.panelNote}>
                แสดง {countFmt.format(provinceRows.length)} จังหวัด
                {provincesPayload
                  ? ` (ทั้งหมดในรอบนี้ ${countFmt.format(provincesPayload.provinces.length)} จังหวัด)`
                  : ''}{' '}
                · เรียงตามระดับความเสี่ยงและค่าสูงสุด · จังหวัดที่ไม่มีค่าจะแสดง “ไม่มีข้อมูล”
              </p>
            </section>
          </div>

          <div className={styles.infoGrid}>
            <section className={styles.panel} aria-label="คำแนะนำเพื่อการเกษตร">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>คำแนะนำเพื่อการเกษตร (คิดจากค่าพยากรณ์)</h2>
                <p className={styles.panelNote}>
                  เป็นคำแนะนำเพื่อการวางแผนจากค่าพยากรณ์ของแบบจำลอง ไม่ใช่ประกาศเตือนภัยราชการ —
                  ควรตรวจสอบประกาศเตือนภัยฉบับจริงจากหน่วยงานต้นทางก่อนตัดสินใจในแปลง
                </p>
              </div>
              {advisoryItems.length === 0 ? (
                <div className={styles.emptyState}>
                  <strong>{isNwpUnitConfirmed(activeRun?.unitStatus)
                    ? 'ไม่พบจังหวัดที่เข้าเกณฑ์เฝ้าระวัง'
                    : 'ยังไม่จัดระดับความเสี่ยงรายจังหวัด'}</strong>
                  <span>
                    {isNwpUnitConfirmed(activeRun?.unitStatus)
                      ? 'ค่าพยากรณ์ของตัวแปร/เวลาที่เลือกอยู่ต่ำกว่าเกณฑ์เฝ้าระวังทั้งหมด (หรือยังไม่มีข้อมูลในรายการจังหวัด)'
                      : 'หน่วยและนิยามตัวแปรยังรอยืนยัน จึงยังไม่ใช้เกณฑ์ภายในจัดระดับ'}
                  </span>
                </div>
              ) : (
                <ul className={styles.advisories}>
                  {advisoryItems.map((item) => (
                    <li className={styles.advisory} key={`${item.name}-${item.level}`}>
                      <strong>
                        {item.name} · {riskLabelTh(item.level)} · ค่าสูงสุด {measure(item.value)}
                      </strong>
                      <p>{item.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.panel} aria-label="คุณภาพและสถานะข้อมูล">
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>คุณภาพและสถานะข้อมูล</h2>
                <p className={styles.panelNote}>
                  ตัวเลขทั้งหมดเป็นค่าพยากรณ์จากแบบจำลอง ไม่ใช่ค่าตรวจวัด และหน่วย/นิยามตัวแปรยังรอการยืนยัน
                </p>
              </div>
              <dl className={styles.qualityGrid}>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>รอบพยากรณ์ (run id)</dt>
                  <dd className={styles.qualityValue}>{activeRun?.runId ?? NO_DATA}</dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>ตัวแปรในรอบ</dt>
                  <dd className={styles.qualityValue}>
                    {activeRun
                      ? `${countFmt.format(activeRun.variables.length)} ตัวแปร (เผยแพร่ ${countFmt.format(visibleVariables.length)} ตัวแปร, ระงับ ws10m)`
                      : NO_DATA}
                  </dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>ระยะเวลานำหน้าที่ใช้งานได้</dt>
                  <dd className={styles.qualityValue}>
                    {leads.length > 0 ? `${countFmt.format(leads.length)} ช่วง (${leads.join(', ')} ชม.)` : NO_DATA}
                  </dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>จำนวนไฟล์/สแนปช็อตต้นทาง</dt>
                  <dd className={styles.qualityValue}>ไม่เปิดเผยในสัญญา API รุ่นนี้ (ดู manifest ของรอบ)</dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>จำนวนช่องกริด</dt>
                  <dd className={styles.qualityValue}>
                    {gridStats && grid
                      ? `${countFmt.format(gridStats.expected)} ช่อง (${countFmt.format(grid.nx)} × ${countFmt.format(grid.ny)}) · มีข้อมูล ${countFmt.format(gridStats.count)}`
                      : NO_DATA}
                  </dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>วิธีลดขนาดกริด</dt>
                  <dd className={styles.qualityValue}>{grid?.method ?? NWP_METHOD_GRID}</dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>วิธีรวมค่ารายจังหวัด</dt>
                  <dd className={styles.qualityValue}>
                    {provincesPayload
                      ? `${provincesPayload.method} (รัศมี ${countFmt.format(provincesPayload.radiusKm)} กม.)`
                      : NWP_METHOD_PROVINCE}
                  </dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>สถานะหน่วย</dt>
                  <dd className={styles.qualityValue}>
                    {activeRun?.unitStatus ?? NO_DATA}
                    {unitHint ? ` (หน่วยตามเกณฑ์ภายใน: ${unitHint} — รอยืนยัน)` : ''}
                  </dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>สถานะสิทธิ์การใช้งาน</dt>
                  <dd className={styles.qualityValue}>{activeRun?.licenseStatus ?? NO_DATA}</dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>โหมดการเผยแพร่</dt>
                  <dd className={styles.qualityValue}>{activeRun?.publicationMode ?? NO_DATA}</dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>สถานะรอบ / โดเมน</dt>
                  <dd className={styles.qualityValue}>
                    {activeRun ? `${activeRun.status} · ${activeRun.domainLabel} (${activeRun.domain})` : NO_DATA}
                  </dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>เวอร์ชันชุดข้อมูล</dt>
                  <dd className={styles.qualityValue}>{state.meta?.datasetVersion ?? NO_DATA}</dd>
                </div>
                <div className={styles.qualityRow}>
                  <dt className={styles.qualityLabel}>ประเภทค่า</dt>
                  <dd className={styles.qualityValue}>ค่าพยากรณ์จากแบบจำลอง (ไม่ใช่ค่าตรวจวัด)</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      ) : null}

      {!hasRun && !state.error ? (
        <div className={styles.emptyState}>
          <strong>ยังไม่มีรอบพยากรณ์ที่พร้อมใช้งาน</strong>
          <span>
            ยังไม่มีรอบ NWP ที่เผยแพร่ในฐานข้อมูลกลาง (D1) — เชื่อมต่อแหล่งข้อมูลและเผยแพร่ด้วยคำสั่ง
          </span>
          <code>python scripts/sync_tmd_hpc_nwp.py publish --run-id &lt;run_id&gt; --dry-run</code>
          <span>
            ตรวจสอบผลก่อนด้วย <code>--dry-run</code> แล้วใช้ <code>--write</code> เพื่อเขียนเข้า D1
          </span>
        </div>
      ) : null}

      <nav aria-label="หน้าที่เกี่ยวข้อง">
        <ul className={styles.crossLinks}>
          <li><Link href="/weather">สภาพอากาศเพื่อการเกษตร</Link></li>
          <li><Link href="/early-warning">เตือนภัยน้ำท่วมและภัยแล้ง</Link></li>
          <li><Link href="/satellite">ข้อมูลดาวเทียม GISTDA</Link></li>
          <li><Link href="/about">ที่มาและสิทธิ์การใช้งาน</Link></li>
        </ul>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub views                                                           */
/* ------------------------------------------------------------------ */

function RunBar({ run, ageText, runsCount }: { run: NwpRunRow; ageText: string; runsCount: number }) {
  return (
    <section className={styles.runBar} aria-label="ข้อมูลรอบพยากรณ์">
      <ul className={styles.runMeta}>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>รอบพยากรณ์ (run id)</span>
          <span className={styles.runMetaValue}>{run.runId}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>เวลาเริ่มต้น (init)</span>
          <span className={styles.runMetaValue}>{utcAndIct(run.initAt)}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>ดึงข้อมูลเมื่อ (retrieved)</span>
          <span className={styles.runMetaValue}>{utcAndIct(run.retrievedAt)}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>อายุข้อมูล</span>
          <span className={styles.runMetaValue}>{ageText}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>สถานะรอบ</span>
          <span className={styles.runMetaValue}>{run.status}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>สถานะสิทธิ์</span>
          <span className={styles.runMetaValue}>{run.licenseStatus}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>สถานะหน่วย</span>
          <span className={styles.runMetaValue}>{run.unitStatus}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>โหมดการเผยแพร่</span>
          <span className={styles.runMetaValue}>{run.publicationMode}</span>
        </li>
        <li className={styles.runMetaItem}>
          <span className={styles.runMetaLabel}>รอบที่มีในระบบ</span>
          <span className={styles.runMetaValue}>{countFmt.format(runsCount)} รอบ</span>
        </li>
      </ul>
    </section>
  );
}

function ErrorBlock({ error }: { error: NwpApiError }) {
  const title = ERROR_TITLES[error.code] ?? 'เปิดข้อมูลพยากรณ์กริดไม่ได้';
  return (
    <div className={styles.errorState} role="alert">
      <strong>{title}</strong>
      <span>{error.message}</span>
      <span>
        code: {error.code}
        {error.status ? ` · http ${error.status}` : ''}
        {error.requestId ? ` · requestId: ${error.requestId}` : ''}
      </span>
      <span>
        ตรวจสอบว่าฐานข้อมูล D1 เชื่อมต่อได้ และโหมดการเผยแพร่ของรอบพยากรณ์ยังเปิดอยู่
        (python scripts/sync_tmd_hpc_nwp.py publish --run-id &lt;run_id&gt; --dry-run)
      </span>
    </div>
  );
}
