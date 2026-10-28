'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ApiAccess,
  ApiContract,
  ApiEndpoint,
  ApiGroup,
  ApiPathParam,
} from '@/lib/hub/api-catalog-types';
import {
  apiAcceptHeader,
  buildInitialQueryValues,
  csvDownloadFilename,
  describeSuggestOutcome,
  exportDatasetCandidates,
  exportResourceCandidates,
  parseApiResponseBody,
  readExportDatasets,
  readExportResources,
  readPaginationTotal,
  validateApiRequest,
  type ParsedApiBody,
  type SuggestOutcomeStatus,
} from '@/lib/hub/api-playground-contract';
import { ApiSnippets } from './api-snippets';
import styles from './api-playground.module.css';

type SuggestKind = NonNullable<ApiPathParam['suggest']>;

interface ApiResult {
  requestPath: string;
  status: number;
  statusText: string;
  ok: boolean;
  contentType: string;
  durationMs: number;
  byteLength: number;
  body: ParsedApiBody;
  downloadBlob?: Blob;
  downloadFilename?: string;
}

type ResultState =
  | { phase: 'idle' }
  | { phase: 'loading'; requestPath: string }
  | { phase: 'done'; result: ApiResult }
  | { phase: 'error'; kind: 'abort' | 'network'; message: string };

type SuggestStatus = 'idle' | 'loading' | SuggestOutcomeStatus;
type CopyStatus = 'idle' | 'copied' | 'failed';

interface EnvelopeSummary {
  availability?: string;
  freshness?: string;
  completeness?: string;
  access?: string;
  runtimeMode?: string;
  datasetVersion?: string;
  total?: number;
  warnings: string[];
  error?: { code?: string; message?: string; requestId?: string };
}

const ACCESS_LABELS: Record<ApiAccess, string> = {
  approved_public: 'มีสิทธิ์เผยแพร่',
  metadata_only: 'แสดงเฉพาะ metadata',
  pending: 'รอตรวจสิทธิ์',
};

const ACCESS_CLASSES: Record<ApiAccess, string> = {
  approved_public: styles.accessApproved,
  metadata_only: styles.accessMetadata,
  pending: styles.accessPending,
};

const CONTRACT_LABELS: Record<ApiContract, string> = {
  'hub-v1': 'สัญญา Hub v1',
  domain: 'domain shape เฉพาะแดชบอร์ด',
  csv: 'ไฟล์ CSV',
};

const SUGGEST_LABELS: Record<SuggestKind, string> = {
  source: 'source',
  dataset: 'dataset',
  series: 'series',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function resolveInitialEndpoint(
  endpoints: ApiEndpoint[],
  defaultEndpointId?: string,
): ApiEndpoint | undefined {
  return endpoints.find((endpoint) => endpoint.id === defaultEndpointId) ?? endpoints[0];
}

function initialPathValues(endpoint: ApiEndpoint): Record<string, string> {
  const values: Record<string, string> = {};
  for (const param of endpoint.pathParams ?? []) values[param.name] = param.example;
  return values;
}

function buildRequestUrl(
  endpoint: ApiEndpoint,
  pathValues: Record<string, string>,
  queryValues: Record<string, string>,
): string {
  let path = endpoint.path;
  for (const param of endpoint.pathParams ?? []) {
    const value = (pathValues[param.name] ?? '').trim();
    path = path.split(`{${param.name}}`).join(value ? encodeURIComponent(value) : `{${param.name}}`);
  }
  const query = new URLSearchParams();
  for (const param of endpoint.query ?? []) {
    const value = (queryValues[param.name] ?? '').trim();
    if (value) query.set(param.name, value);
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function prettyJson(value: unknown): string {
  try {
    const rendered = JSON.stringify(value, null, 2);
    return typeof rendered === 'string' ? rendered : String(value);
  } catch {
    return String(value);
  }
}

function bodyTextForCopy(result: ApiResult): string {
  if (result.body.kind === 'json') return prettyJson(result.body.value);
  return result.body.text;
}

function readFirstId(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length === 0) return null;
  const first: unknown = payload.data[0];
  if (!isRecord(first) || typeof first.id !== 'string' || !first.id.trim()) return null;
  return first.id.trim();
}

function formatDuration(milliseconds: number): string {
  return `${milliseconds.toFixed(1)} ms`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function subscribeToOrigin() {
  return () => {};
}

function getOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return undefined;
}

function statusToneClass(status: number): string {
  if (status >= 200 && status < 300) return styles.statusSuccess;
  if (status >= 400 && status < 500) return styles.statusWarn;
  if (status >= 500) return styles.statusError;
  return styles.statusNeutral;
}

function summarizeEnvelope(value: unknown): EnvelopeSummary {
  const summary: EnvelopeSummary = { warnings: [] };
  if (!isRecord(value)) return summary;

  const meta: unknown = value.meta;
  if (isRecord(meta)) {
    summary.availability = readString(meta, 'availability');
    summary.freshness = readString(meta, 'freshness');
    summary.completeness = readString(meta, 'completeness');
    summary.access = readString(meta, 'access');
    summary.runtimeMode = readString(meta, 'runtimeMode');
    summary.datasetVersion = readString(meta, 'datasetVersion');
    const rawWarnings: unknown = meta.warnings;
    if (Array.isArray(rawWarnings) && rawWarnings.every((item: unknown) => typeof item === 'string')) {
      summary.warnings = rawWarnings as string[];
    }
  }

  const pagination: unknown = value.pagination;
  if (isRecord(pagination) && typeof pagination.total === 'number' && Number.isFinite(pagination.total)) {
    summary.total = pagination.total;
  }

  const error: unknown = value.error;
  if (isRecord(error)) {
    const details = {
      code: readString(error, 'code'),
      message: readString(error, 'message'),
      requestId: readString(error, 'requestId'),
    };
    if (details.code || details.message || details.requestId) summary.error = details;
  }

  return summary;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback on insecure contexts or denied permission.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      return document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  } catch {
    return false;
  }
}

function EndpointSummary({ endpoint }: { endpoint: ApiEndpoint }) {
  return (
    <article className={styles.summaryCard} aria-label={`สรุป ${endpoint.path}`}>
      <div className={styles.summaryTop}>
        <span className={styles.methodBadge}>{endpoint.method}</span>
        <code className={styles.summaryPath}>{endpoint.path}</code>
      </div>
      <h3 className={styles.summaryTitle}>{endpoint.title}</h3>
      <p className={styles.summaryDescription}>{endpoint.description}</p>
      <div className={styles.badgeRow}>
        <span className={`${styles.accessBadge} ${ACCESS_CLASSES[endpoint.access]}`}>
          {ACCESS_LABELS[endpoint.access]}
        </span>
        <span className={styles.contractBadge}>{CONTRACT_LABELS[endpoint.contract]}</span>
      </div>
      <div className={styles.responseType}>
        <span className={styles.responseTypeLabel}>responseType</span>
        <code>{endpoint.responseType}</code>
      </div>
      {endpoint.notes && endpoint.notes.length > 0 && (
        <div className={styles.notes}>
          <p className={styles.notesTitle}>ข้อควรระวัง</p>
          <ul className={styles.notesList}>
            {endpoint.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function ApiPlayground({
  endpoints,
  groups,
  defaultEndpointId,
}: {
  endpoints: ApiEndpoint[];
  groups: ApiGroup[];
  defaultEndpointId?: string;
}) {
  const idPrefix = useId();
  const [selectedId, setSelectedId] = useState(
    () => resolveInitialEndpoint(endpoints, defaultEndpointId)?.id ?? '',
  );
  const [pathValues, setPathValues] = useState<Record<string, string>>(() => {
    const endpoint = resolveInitialEndpoint(endpoints, defaultEndpointId);
    return endpoint ? initialPathValues(endpoint) : {};
  });
  const [queryValues, setQueryValues] = useState<Record<string, string>>(() => {
    const endpoint = resolveInitialEndpoint(endpoints, defaultEndpointId);
    return endpoint ? buildInitialQueryValues(endpoint) : {};
  });
  const [result, setResult] = useState<ResultState>({ phase: 'idle' });
  const [liveMessage, setLiveMessage] = useState('');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [suggestStatus, setSuggestStatus] = useState<{ status: SuggestStatus; message: string }>({
    status: 'idle',
    message: '',
  });
  const origin = useSyncExternalStore(subscribeToOrigin, getOrigin, getServerOrigin);

  const activeRequest = useRef<AbortController | null>(null);
  const activeSuggest = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.id === selectedId) ?? endpoints[0],
    [endpoints, selectedId],
  );
  const pathParams = useMemo(() => selectedEndpoint?.pathParams ?? [], [selectedEndpoint]);
  const queryParams = useMemo(() => selectedEndpoint?.query ?? [], [selectedEndpoint]);
  const requestPathWithQuery = useMemo(
    () => (selectedEndpoint ? buildRequestUrl(selectedEndpoint, pathValues, queryValues) : ''),
    [selectedEndpoint, pathValues, queryValues],
  );
  const requestIssues = useMemo(
    () => selectedEndpoint ? validateApiRequest(selectedEndpoint, pathValues, queryValues) : [],
    [selectedEndpoint, pathValues, queryValues],
  );
  const groupedOptions = useMemo(() => {
    const listed = new Set<string>();
    const entries = groups
      .map((group) => {
        const items = endpoints.filter((endpoint) => endpoint.group === group.id);
        for (const endpoint of items) listed.add(endpoint.id);
        return { group, items };
      })
      .filter((entry) => entry.items.length > 0);
    const leftover = endpoints.filter((endpoint) => !listed.has(endpoint.id));
    return { entries, leftover };
  }, [endpoints, groups]);

  useEffect(() => {
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      activeSuggest.current?.abort();
      activeSuggest.current = null;
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, []);

  function clearCopyFeedback() {
    if (copyTimer.current !== null) {
      clearTimeout(copyTimer.current);
      copyTimer.current = null;
    }
    setCopyStatus('idle');
  }

  function abortActiveRequest() {
    if (activeRequest.current) {
      activeRequest.current.abort();
      activeRequest.current = null;
    }
  }

  function abortActiveSuggest() {
    if (activeSuggest.current) {
      activeSuggest.current.abort();
      activeSuggest.current = null;
    }
  }

  function applyEndpoint(endpoint: ApiEndpoint, message: string) {
    abortActiveRequest();
    abortActiveSuggest();
    setSelectedId(endpoint.id);
    setPathValues(initialPathValues(endpoint));
    setQueryValues(buildInitialQueryValues(endpoint));
    setResult({ phase: 'idle' });
    setSuggestStatus({ status: 'idle', message: '' });
    clearCopyFeedback();
    setLiveMessage(message);
  }

  function handleEndpointChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const endpoint = endpoints.find((item) => item.id === event.target.value);
    if (!endpoint) return;
    applyEndpoint(endpoint, `เลือก ${endpoint.path} แล้ว`);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('endpoint', endpoint.id);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // A blocked replaceState must not break the playground.
    }
  }

  function handlePathChange(name: string, value: string) {
    setPathValues((current) => ({ ...current, [name]: value }));
    if (suggestStatus.status !== 'idle' && suggestStatus.status !== 'loading') {
      setSuggestStatus({ status: 'idle', message: '' });
    }
  }

  function handleQueryChange(name: string, value: string) {
    setQueryValues((current) => ({ ...current, [name]: value }));
  }

  function handleReset() {
    if (!selectedEndpoint) return;
    abortActiveRequest();
    abortActiveSuggest();
    setPathValues(initialPathValues(selectedEndpoint));
    setQueryValues(buildInitialQueryValues(selectedEndpoint));
    setResult({ phase: 'idle' });
    setSuggestStatus({ status: 'idle', message: '' });
    clearCopyFeedback();
    setLiveMessage('ล้างค่าและคำตอบแล้ว');
  }

  async function handleSuggest() {
    if (!selectedEndpoint || suggestStatus.status === 'loading') return;
    const suggestParams = (selectedEndpoint.pathParams ?? []).filter((param) => param.suggest);
    if (suggestParams.length === 0) return;

    abortActiveSuggest();
    const controller = new AbortController();
    activeSuggest.current = controller;
    setSuggestStatus({ status: 'loading', message: 'กำลังค้นหา id จาก API จริง…' });

    type LookupOutcome =
      | { kind: 'ok'; payload: unknown }
      | { kind: 'http'; status: number }
      | { kind: 'network' }
      | { kind: 'aborted' };

    let suggestError: { status: number | null } | null = null;

    const lookup = async (url: string): Promise<LookupOutcome> => {
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) return { kind: 'http', status: response.status };
        const payload: unknown = await response.json();
        return { kind: 'ok', payload };
      } catch {
        return controller.signal.aborted ? { kind: 'aborted' } : { kind: 'network' };
      }
    };

    const stale = () => controller.signal.aborted || activeSuggest.current !== controller;

    // 404 during a lookup means "no such id", which the message reports as missing, not as a failed search.
    const noteFailure = (outcome: LookupOutcome) => {
      if (suggestError !== null) return;
      if (outcome.kind === 'http' && outcome.status !== 404) suggestError = { status: outcome.status };
      else if (outcome.kind === 'network') suggestError = { status: null };
    };

    const fetchPayload = async (url: string): Promise<unknown | null> => {
      const outcome = await lookup(url);
      if (outcome.kind === 'ok') return outcome.payload;
      noteFailure(outcome);
      return null;
    };

    const finish = (
      filledParams: string[],
      keptParams: string[],
      missingLabels: string[],
      updates: { path?: Record<string, string>; query?: Record<string, string> },
    ) => {
      if (stale()) return;
      activeSuggest.current = null;
      if (updates.path) setPathValues((current) => ({ ...current, ...updates.path }));
      if (updates.query) setQueryValues((current) => ({ ...current, ...updates.query }));
      setSuggestStatus(describeSuggestOutcome({ filledParams, keptParams, missingLabels, error: suggestError }));
    };

    const resourceParam = (selectedEndpoint.query ?? []).find((param) => param.name === 'resourceId');
    const datasetParam = (selectedEndpoint.pathParams ?? []).find((param) => param.suggest === 'dataset');
    if (selectedEndpoint.contract === 'csv' && resourceParam && datasetParam) {
      const currentDataset = (pathValues[datasetParam.name] ?? '').trim();
      const currentResource = (queryValues[resourceParam.name] ?? '').trim();

      const resourceCandidates = async (datasetId: string, preferred: string): Promise<string[]> => {
        const payload = await fetchPayload(`/api/v1/datasets/${encodeURIComponent(datasetId)}`);
        if (payload === null) return [];
        return exportResourceCandidates(readExportResources(payload), preferred);
      };
      const hasRows = async (datasetId: string, resourceId: string): Promise<boolean> => {
        const payload = await fetchPayload(
          `/api/v1/datasets/${encodeURIComponent(datasetId)}/records?resourceId=${encodeURIComponent(resourceId)}&pageSize=1`,
        );
        return payload !== null && (readPaginationTotal(payload) ?? 0) > 0;
      };
      const firstResourceWithRows = async (datasetId: string, preferred: string): Promise<string | null> => {
        for (const resourceId of await resourceCandidates(datasetId, preferred)) {
          if (stale()) return null;
          if (await hasRows(datasetId, resourceId)) return resourceId;
        }
        return null;
      };

      if (currentDataset) {
        const resourceId = await firstResourceWithRows(currentDataset, currentResource);
        if (stale()) return;
        if (resourceId !== null) {
          if (resourceId === currentResource) {
            activeSuggest.current = null;
            setSuggestStatus({
              status: 'kept',
              message: 'ใช้ id และ resourceId ที่กรอกไว้ โดยตรวจกับ API แล้วว่า resource นี้มีแถวให้ส่งออก',
            });
            return;
          }
          finish([resourceParam.name], [datasetParam.name], [], {
            query: { [resourceParam.name]: resourceId },
          });
          return;
        }
      }

      const listPayload = await fetchPayload('/api/v1/datasets?pageSize=100');
      if (stale()) return;
      const candidates = listPayload === null
        ? []
        : exportDatasetCandidates(readExportDatasets(listPayload)).filter((id) => id !== currentDataset);
      for (const datasetId of candidates) {
        const resourceId = await firstResourceWithRows(datasetId, '');
        if (stale()) return;
        if (resourceId === null) continue;
        finish([datasetParam.name, resourceParam.name], [], [], {
          path: { [datasetParam.name]: datasetId },
          query: { [resourceParam.name]: resourceId },
        });
        return;
      }

      if (suggestError !== null) {
        finish([], [], [], {});
      } else if (!stale()) {
        activeSuggest.current = null;
        setSuggestStatus({
          status: 'empty',
          message: 'API จริงยังไม่พบชุดข้อมูลที่มี resource อนุมัติและมีแถวให้ส่งออก; กรอก id และ resourceId เองได้',
        });
      }
      return;
    }

    const needed = new Set<SuggestKind>();
    for (const param of suggestParams) {
      if (param.suggest) needed.add(param.suggest);
    }

    const resolved: Partial<Record<SuggestKind, string>> = {};
    const missing: SuggestKind[] = [];
    const keptKinds = new Set<SuggestKind>();

    const addMissing = (kind: SuggestKind) => {
      if (!missing.includes(kind)) missing.push(kind);
    };

    const firstId = async (url: string): Promise<{ id: string | null; aborted: boolean }> => {
      const outcome = await lookup(url);
      if (outcome.kind === 'aborted') return { id: null, aborted: true };
      if (outcome.kind !== 'ok') {
        noteFailure(outcome);
        return { id: null, aborted: false };
      }
      return { id: readFirstId(outcome.payload), aborted: false };
    };

    const typedDataset = (selectedEndpoint.pathParams ?? []).find(
      (param) => param.suggest === 'dataset' && (pathValues[param.name] ?? '').trim(),
    );
    let datasetId = typedDataset ? (pathValues[typedDataset.name] ?? '').trim() : null;
    if (datasetId) {
      resolved.dataset = datasetId;
      keptKinds.add('dataset');
    }
    let triedDatasetLookup = false;

    const ensureDataset = async (): Promise<{ id: string | null; aborted: boolean }> => {
      if (datasetId) return { id: datasetId, aborted: false };
      if (triedDatasetLookup) return { id: null, aborted: false };
      triedDatasetLookup = true;
      const found = await firstId('/api/v1/datasets?pageSize=1');
      if (found.aborted) return { id: null, aborted: true };
      if (found.id) {
        datasetId = found.id;
        resolved.dataset = found.id;
        return { id: found.id, aborted: false };
      }
      addMissing('dataset');
      return { id: null, aborted: false };
    };

    if (needed.has('source')) {
      const found = await firstId('/api/v1/sources?pageSize=1');
      if (found.aborted) return;
      if (found.id) resolved.source = found.id;
      else addMissing('source');
    }

    if (needed.has('dataset')) {
      const found = await ensureDataset();
      if (found.aborted) return;
    }

    if (needed.has('series')) {
      const dataset = await ensureDataset();
      if (dataset.aborted) return;
      if (!dataset.id) {
        addMissing('series');
      } else {
        const found = await firstId(
          `/api/v1/datasets/${encodeURIComponent(dataset.id)}/series?pageSize=1`,
        );
        if (found.aborted) return;
        if (found.id) resolved.series = found.id;
        else addMissing('series');
      }
    }

    if (stale()) return;
    activeSuggest.current = null;

    const updates: Record<string, string> = {};
    const filledParams: string[] = [];
    const keptParams: string[] = [];
    for (const param of suggestParams) {
      if (!param.suggest) continue;
      const value = resolved[param.suggest];
      if (!value) continue;
      updates[param.name] = value;
      if (keptKinds.has(param.suggest)) keptParams.push(param.name);
      else filledParams.push(param.name);
    }

    if (Object.keys(updates).length > 0) {
      setPathValues((current) => ({ ...current, ...updates }));
    }
    setSuggestStatus(describeSuggestOutcome({
      filledParams,
      keptParams,
      missingLabels: missing.map((kind) => SUGGEST_LABELS[kind]),
      error: suggestError,
    }));
  }

  async function handleSubmit() {
    if (!selectedEndpoint || requestIssues.length > 0 || result.phase === 'loading') return;

    abortActiveRequest();
    const controller = new AbortController();
    activeRequest.current = controller;
    clearCopyFeedback();
    setResult({ phase: 'loading', requestPath: requestPathWithQuery });
    setLiveMessage(`กำลังเรียก ${requestPathWithQuery}`);

    const startedAt = performance.now();
    try {
      const response = await fetch(requestPathWithQuery, {
        headers: { Accept: apiAcceptHeader(selectedEndpoint.contract) },
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') ?? '';
      const csvResponse = response.ok && /^text\/csv(?:\s*;|$)/i.test(contentType.trim());
      const downloadBlob = csvResponse ? await response.blob() : undefined;
      const text = downloadBlob ? await downloadBlob.text() : await response.text();
      const durationMs = performance.now() - startedAt;
      const body = parseApiResponseBody(text, contentType);
      if (controller.signal.aborted || activeRequest.current !== controller) return;
      activeRequest.current = null;

      setResult({
        phase: 'done',
        result: {
          requestPath: requestPathWithQuery,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          contentType,
          durationMs,
          byteLength: downloadBlob?.size ?? new TextEncoder().encode(text).length,
          body,
          downloadBlob,
          downloadFilename: downloadBlob
            ? csvDownloadFilename(response.headers.get('content-disposition') ?? '')
            : undefined,
        },
      });
      setLiveMessage(
        response.ok
          ? `ได้คำตอบ HTTP ${response.status} ภายใน ${formatDuration(durationMs)}`
          : `API ตอบ HTTP ${response.status}`,
      );
    } catch (error: unknown) {
      if (activeRequest.current !== controller) return;
      activeRequest.current = null;
      const aborted =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError');
      const message = aborted ? 'ยกเลิกคำขอ' : 'เรียก API ไม่สำเร็จ';
      setResult({ phase: 'error', kind: aborted ? 'abort' : 'network', message });
      setLiveMessage(message);
    }
  }

  async function handleCopy() {
    if (result.phase !== 'done') return;
    const text = bodyTextForCopy(result.result);
    if (!text) return;
    const copied = await copyToClipboard(text);
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    setCopyStatus(copied ? 'copied' : 'failed');
    setLiveMessage(copied ? 'คัดลอกคำตอบแล้ว' : 'คัดลอกไม่สำเร็จ');
    copyTimer.current = setTimeout(() => {
      setCopyStatus('idle');
      copyTimer.current = null;
    }, 2000);
  }

  function handleDownloadCsv() {
    if (result.phase !== 'done' || !result.result.downloadBlob) return;
    const url = URL.createObjectURL(result.result.downloadBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.result.downloadFilename ?? 'export.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!selectedEndpoint) return null;
  const hasSuggestions = pathParams.some((param) => param.suggest);

  return (
    <section className={styles.root} id="playground" aria-labelledby={`${idPrefix}-title`}>
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>ทดลองเรียก API</p>
        <h2 id={`${idPrefix}-title`}>API Playground</h2>
        <p>ส่งคำขอ GET แบบอ่านอย่างเดียว แล้วดู response จริงจาก runtime ที่กำลังเปิดอยู่</p>
      </div>

      <div className={styles.playgroundGrid}>
        <div className={styles.requestPanel}>
          <label className={styles.field} htmlFor={`${idPrefix}-endpoint`}>
            <span className={styles.label}>เลือก endpoint</span>
            <select
              id={`${idPrefix}-endpoint`}
              className={styles.control}
              value={selectedEndpoint.id}
              onChange={handleEndpointChange}
            >
              {groupedOptions.entries.map(({ group, items }) => (
                <optgroup key={group.id} label={group.label}>
                  {items.map((endpoint) => (
                    <option key={endpoint.id} value={endpoint.id}>{endpoint.method} {endpoint.path}</option>
                  ))}
                </optgroup>
              ))}
              {groupedOptions.leftover.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>{endpoint.method} {endpoint.path}</option>
              ))}
            </select>
          </label>

          <EndpointSummary endpoint={selectedEndpoint} />

          {pathParams.length > 0 && (
            <fieldset className={styles.fieldset}>
              <legend>Path parameters</legend>
              {pathParams.map((param) => {
                const value = pathValues[param.name] ?? '';
                const invalid = requestIssues.some((issue) => issue.startsWith(`${param.name}:`));
                const descriptionId = `${idPrefix}-path-${param.name}-description`;
                return (
                  <label className={styles.field} key={param.name} htmlFor={`${idPrefix}-path-${param.name}`}>
                    <span className={styles.label}>{param.name} <span className={styles.optional}>{param.description}</span></span>
                    <input
                      id={`${idPrefix}-path-${param.name}`}
                      className={styles.control}
                      type="text"
                      value={value}
                      required
                      maxLength={param.maxLength}
                      pattern={param.pattern}
                      aria-invalid={invalid}
                      aria-describedby={descriptionId}
                      onChange={(event) => handlePathChange(param.name, event.target.value)}
                    />
                    <span className={styles.help} id={descriptionId}>ตัวอย่าง: {param.example}</span>
                  </label>
                );
              })}
              {hasSuggestions && (
                <div className={styles.suggestRow}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => void handleSuggest()}
                    disabled={suggestStatus.status === 'loading'}
                  >
                    {suggestStatus.status === 'loading' ? 'กำลังค้นหา…' : 'เติม id จาก API จริง'}
                  </button>
                  <p className={styles.statusMessage} role="status" aria-live="polite">{suggestStatus.message}</p>
                </div>
              )}
            </fieldset>
          )}

          {queryParams.length > 0 && (
            <fieldset className={styles.fieldset}>
              <legend>Query parameters</legend>
              <div className={styles.queryGrid}>
                {queryParams.map((param) => {
                  const value = queryValues[param.name] ?? '';
                  const invalid = requestIssues.some((issue) => issue.startsWith(`${param.name}:`));
                  const descriptionId = `${idPrefix}-query-${param.name}-description`;
                  const controlId = `${idPrefix}-query-${param.name}`;
                  return (
                    <label className={styles.field} key={param.name} htmlFor={controlId}>
                      <span className={styles.label}>
                        {param.name} {param.required && <span className={styles.required}>ต้องระบุ</span>}
                      </span>
                      {param.type === 'enum' ? (
                        <select
                          id={controlId}
                          className={styles.control}
                          value={value}
                          required={param.required}
                          aria-invalid={invalid}
                          aria-describedby={descriptionId}
                          onChange={(event) => handleQueryChange(param.name, event.target.value)}
                        >
                          <option value="">ไม่ระบุ</option>
                          {(param.values ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          id={controlId}
                          className={styles.control}
                          type={param.type === 'integer' ? 'number' : param.type === 'date' ? 'date' : 'text'}
                          inputMode={param.type === 'integer' ? 'numeric' : undefined}
                          step={param.type === 'integer' ? 1 : undefined}
                          min={param.minimum}
                          max={param.maximum}
                          maxLength={param.maxLength}
                          pattern={param.pattern}
                          required={param.required}
                          value={value}
                          aria-invalid={invalid}
                          aria-describedby={descriptionId}
                          onChange={(event) => handleQueryChange(param.name, event.target.value)}
                        />
                      )}
                      <span className={styles.help} id={descriptionId}>
                        {param.description}{param.example ? ` ตัวอย่าง: ${param.example}` : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {requestIssues.length > 0 && (
            <ul className={styles.validation} role="status" aria-live="polite">
              {requestIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}

          <div className={styles.requestPreview}>
            <span className={styles.label}>Request URL</span>
            <code>{requestPathWithQuery}</code>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={handleReset}>ล้างค่า</button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void handleSubmit()}
              disabled={requestIssues.length > 0 || result.phase === 'loading'}
            >
              {result.phase === 'loading' ? 'กำลังเรียก API…' : selectedEndpoint.contract === 'csv' ? 'เรียกและเตรียม CSV' : 'เรียก API'}
            </button>
          </div>
          <p className={styles.statusMessage} role="status" aria-live="polite">{liveMessage}</p>
        </div>

        <div className={styles.responsePanel} aria-busy={result.phase === 'loading'}>
          <h3>Response</h3>
          {result.phase === 'idle' && <p className={styles.emptyResponse}>เลือก endpoint แล้วกด “เรียก API” เพื่อดูคำตอบ</p>}
          {result.phase === 'loading' && <p className={styles.emptyResponse}>กำลังรอคำตอบจาก API…</p>}
          {result.phase === 'error' && <p className={styles.errorMessage} role="alert">{result.message}</p>}
          {result.phase === 'done' && (() => {
            const response = result.result;
            const summary = response.body.kind === 'json' ? summarizeEnvelope(response.body.value) : null;
            return (
              <>
                <div className={styles.responseMeta}>
                  <span className={`${styles.statusBadge} ${statusToneClass(response.status)}`}>HTTP {response.status} {response.statusText}</span>
                  <span>{formatDuration(response.durationMs)}</span>
                  <span>{formatBytes(response.byteLength)}</span>
                  <span>{response.contentType || 'ไม่ระบุ content type'}</span>
                </div>
                {summary && (summary.availability || summary.datasetVersion || summary.total !== undefined || summary.warnings.length > 0 || summary.error) && (
                  <dl className={styles.envelopeSummary}>
                    {summary.availability && <><dt>availability</dt><dd>{summary.availability}</dd></>}
                    {summary.completeness && <><dt>completeness</dt><dd>{summary.completeness}</dd></>}
                    {summary.access && <><dt>access</dt><dd>{summary.access}</dd></>}
                    {summary.runtimeMode && <><dt>runtimeMode</dt><dd>{summary.runtimeMode}</dd></>}
                    {summary.total !== undefined && <><dt>pagination.total</dt><dd>{summary.total}</dd></>}
                    {summary.datasetVersion && <><dt>datasetVersion</dt><dd>{summary.datasetVersion}</dd></>}
                    {summary.error?.code && <><dt>error.code</dt><dd>{summary.error.code}</dd></>}
                    {summary.error?.message && <><dt>error.message</dt><dd>{summary.error.message}</dd></>}
                    {summary.warnings.length > 0 && <><dt>warnings</dt><dd><ul>{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></dd></>}
                  </dl>
                )}
                <pre className={styles.responseBody}><code>{response.body.kind === 'json' ? prettyJson(response.body.value) : response.body.text}</code></pre>
                <div className={styles.responseActions}>
                  {response.downloadBlob && (
                    <button className={styles.primaryButton} type="button" onClick={handleDownloadCsv}>
                      ดาวน์โหลด CSV {response.downloadFilename ? `(${response.downloadFilename})` : ''}
                    </button>
                  )}
                  {response.body.kind !== 'empty' && (
                    <button className={styles.secondaryButton} type="button" onClick={() => void handleCopy()}>
                      {copyStatus === 'copied' ? 'คัดลอกแล้ว' : copyStatus === 'failed' ? 'คัดลอกไม่สำเร็จ' : 'คัดลอกคำตอบ'}
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      <ApiSnippets url={requestPathWithQuery} origin={origin} contract={selectedEndpoint.contract} />
    </section>
  );
}

