'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type {
  ApiAccess,
  ApiContract,
  ApiEndpoint,
  ApiGroup,
  ApiPathParam,
  ApiQueryParam,
} from '@/lib/hub/api-catalog-types';
import { ApiSnippets } from './api-snippets';
import styles from './api-playground.module.css';

type SuggestKind = NonNullable<ApiPathParam['suggest']>;

type ParsedBody =
  | { kind: 'empty'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'json'; text: string; value: unknown };

interface ApiResult {
  requestPath: string;
  status: number;
  statusText: string;
  ok: boolean;
  contentType: string;
  durationMs: number;
  byteLength: number;
  body: ParsedBody;
}

type ResultState =
  | { phase: 'idle' }
  | { phase: 'loading'; requestPath: string }
  | { phase: 'done'; result: ApiResult }
  | { phase: 'error'; kind: 'abort' | 'network'; message: string };

type SuggestStatus = 'idle' | 'loading' | 'success' | 'partial' | 'empty' | 'error';
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

function initialQueryValues(endpoint: ApiEndpoint): Record<string, string> {
  const values: Record<string, string> = {};
  for (const param of endpoint.query ?? []) {
    const example = param.example ?? '';
    const validEnum = param.type !== 'enum' || !example || (param.values ?? []).includes(example);
    values[param.name] = validEnum ? example : '';
  }
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

function parseResponseBody(text: string, contentType: string): ParsedBody {
  if (!text.trim()) return { kind: 'empty', text };
  try {
    const value: unknown = JSON.parse(text);
    return { kind: 'json', text, value };
  } catch {
    // Non-JSON responses are rendered verbatim.
  }
  return { kind: 'text', text };
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
    return endpoint ? initialQueryValues(endpoint) : {};
  });
  const [result, setResult] = useState<ResultState>({ phase: 'idle' });
  const [liveMessage, setLiveMessage] = useState('');
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [suggestStatus, setSuggestStatus] = useState<{ status: SuggestStatus; message: string }>({
    status: 'idle',
    message: '',
  });
  const [origin, setOrigin] = useState<string | undefined>(undefined);

  const activeRequest = useRef<AbortController | null>(null);
  const activeSuggest = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapped = useRef(false);

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
  const missingPathNames = useMemo(
    () => pathParams.filter((param) => !(pathValues[param.name] ?? '').trim()).map((param) => param.name),
    [pathParams, pathValues],
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
    setOrigin(window.location.origin);
  }, []);

  // The catalog is server-rendered and static. Read ?endpoint= once after mount so
  // hydration stays deterministic while deep links still select the right endpoint.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const endpointParam = new URLSearchParams(window.location.search).get('endpoint');
    const linked = endpointParam ? endpoints.find((endpoint) => endpoint.id === endpointParam) : undefined;
    if (!linked) return;
    setSelectedId(linked.id);
    setPathValues(initialPathValues(linked));
    setQueryValues(initialQueryValues(linked));
    setResult({ phase: 'idle' });
  }, [endpoints]);

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
    setQueryValues(initialQueryValues(endpoint));
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

  function handleReset() {
    if (!selectedEndpoint) return;
    abortActiveRequest();
    abortActiveSuggest();
    setPathValues(initialPathValues(selectedEndpoint));
    setQueryValues(initialQueryValues(selectedEndpoint));
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

    const needed = new Set<SuggestKind>();
    for (const param of suggestParams) {
      if (param.suggest) needed.add(param.suggest);
    }

    const resolved: Partial<Record<SuggestKind, string>> = {};
    const missing: SuggestKind[] = [];
    let hadError = false;
    let lastErrorStatus: number | null = null;

    const addMissing = (kind: SuggestKind) => {
      if (!missing.includes(kind)) missing.push(kind);
    };

    type LookupOutcome =
      | { kind: 'ok'; payload: unknown }
      | { kind: 'http'; status: number }
      | { kind: 'network' }
      | { kind: 'aborted' };

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

    const noteFailure = (outcome: LookupOutcome) => {
      if (outcome.kind === 'http' || outcome.kind === 'network') {
        hadError = true;
        if (outcome.kind === 'http') lastErrorStatus = outcome.status;
      }
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

    const datasetParam = (selectedEndpoint.pathParams ?? []).find(
      (param) => param.suggest === 'dataset' && (pathValues[param.name] ?? '').trim(),
    );
    let datasetId = datasetParam ? (pathValues[datasetParam.name] ?? '').trim() : null;
    if (datasetId) resolved.dataset = datasetId;
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

    if (controller.signal.aborted || activeSuggest.current !== controller) return;
    activeSuggest.current = null;

    const updates: Record<string, string> = {};
    for (const param of suggestParams) {
      const value = param.suggest ? resolved[param.suggest] : undefined;
      if (param.suggest && value) updates[param.name] = value;
    }
    const updateCount = Object.keys(updates).length;
    const missingText = missing.length ? ` ยังไม่พบ ${missing.map((kind) => SUGGEST_LABELS[kind]).join(' และ ')}` : '';
    const errorText = hadError
      ? ` · ค้นบางรายการไม่สำเร็จ${lastErrorStatus ? ` (HTTP ${lastErrorStatus})` : ''}`
      : '';

    if (updateCount > 0) {
      setPathValues((current) => ({ ...current, ...updates }));
      const allResolved = missing.length === 0 && !hadError;
      setSuggestStatus({
        status: allResolved ? 'success' : 'partial',
        message: `เติม id จาก API จริงแล้ว${missingText}${errorText}${allResolved ? ' · ตรวจ id ก่อนเรียก API' : ''}`,
      });
    } else if (hadError) {
      setSuggestStatus({
        status: 'error',
        message: `ค้นหา id จาก API จริงไม่สำเร็จ${errorText} กรอก id เองหรือลองอีกครั้ง`,
      });
    } else {
      setSuggestStatus({
        status: 'empty',
        message: 'API จริงยังไม่คืน id สำหรับ endpoint นี้ กรอก id เองได้',
      });
    }
  }

  async function handleSubmit() {
    if (!selectedEndpoint || missingPathNames.length > 0 || result.phase === 'loading') return;

    abortActiveRequest();
    const controller = new AbortController();
    activeRequest.current = controller;
    clearCopyFeedback();
    setResult({ phase: 'loading', requestPath: requestPathWithQuery });
    setLiveMessage(`กำลังเรียก ${requestPathWithQuery}`);

    const startedAt = performance.now();
    try {
      const response = await fetch(requestPathWithQuery, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const text = await response.text();
      const durationMs = performance.now() - startedAt;
      const contentType = response.headers.get('content-type') ?? '';
      const body = parseResponseBody(text, contentType);
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
          byteLength: new TextEncoder().encode(text).length,
          body,
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
    setLiveMessage(copied ? 'คัดลอก JSON แล้ว' : 'คัดลอกไม่สำเร็จ');
    copyTimer.current = setTimeout(() => {
      setCopyStatus('idle');
      copyTimer.current = null;
    }, 2000);
  }

  /* COMPONENT_JSX */
}

