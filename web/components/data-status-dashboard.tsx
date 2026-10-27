'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiResponse, HubSource, SourceStatus } from '@/lib/hub/types';
import {
  buildStatusPanel,
  filterSources,
  formatTimeBangkok,
  mergeSourcePages,
  readApiError,
  registryLabel,
  safeHttpUrl,
  sanitizeErrorText,
  type ApiErrorView,
  type MergedSources,
  type RunStatusTone,
} from '@/lib/hub/data-status';
import { Icon } from './icon';

const PAGE_SIZE = 100;
const MAX_PAGES = 8;

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; error: ApiErrorView }
  | { kind: 'ready'; merged: MergedSources; meta: ApiResponse<HubSource[]>['meta'] };

type DetailState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; error: ApiErrorView }
  | { kind: 'ready'; source: SourceStatus; meta: ApiResponse<SourceStatus>['meta'] };

const TONE_STYLE: Record<RunStatusTone, { background: string; color: string }> = {
  succeeded: { background: 'var(--accent-soft)', color: 'var(--forest)' },
  partial: { background: '#fbf2dc', color: 'var(--warning)' },
  failed: { background: '#f8e7e3', color: 'var(--danger)' },
  running: { background: '#eaf0e2', color: '#4c623d' },
  unknown: { background: 'var(--surface-muted)', color: 'var(--muted)' },
};

const REGISTRY_TONE: Record<string, string> = {
  enabled: 'neutral',
  deferred: 'pending',
  needs_access: 'pending',
  unavailable: 'pending',
};

async function fetchEnvelope<T>(
  url: string,
  signal: AbortSignal,
): Promise<{ ok: true; payload: ApiResponse<T> } | { ok: false; error: ApiErrorView }> {
  try {
    const response = await fetch(url, { signal, cache: 'no-store', headers: { accept: 'application/json' } });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) return { ok: false, error: readApiError(body, response.status) };
    const payload = body as ApiResponse<T>;
    if (!payload || typeof payload !== 'object' || !('data' in payload) || !payload.meta) {
      return { ok: false, error: { code: 'BAD_RESPONSE', message: 'รูปแบบข้อมูลจากบัญชีกลางไม่ถูกต้อง', requestId: null } };
    }
    return { ok: true, payload };
  } catch (cause) {
    if (signal.aborted) return { ok: false, error: { code: 'ABORTED', message: 'ยกเลิกคำขอแล้ว', requestId: null } };
    return {
      ok: false,
      error: {
        code: 'REQUEST_FAILED',
        message: sanitizeErrorText(cause instanceof Error ? cause.message : null),
        requestId: null,
      },
    };
  }
}

async function loadSources(signal: AbortSignal): Promise<ListState> {
  const pages: { data: HubSource[]; pagination?: ApiResponse<HubSource[]>['pagination'] }[] = [];
  let lastPayload: ApiResponse<HubSource[]> | null = null;
  for (let index = 1; index <= MAX_PAGES; index += 1) {
    if (signal.aborted) return { kind: 'error', error: { code: 'ABORTED', message: 'ยกเลิกคำขอแล้ว', requestId: null } };
    const result = await fetchEnvelope<HubSource[]>('/api/v1/sources?page=' + index + '&pageSize=' + PAGE_SIZE, signal);
    if (!result.ok) return { kind: 'error', error: result.error };
    if (!Array.isArray(result.payload.data)) {
      return { kind: 'error', error: { code: 'BAD_RESPONSE', message: 'รูปแบบรายการแหล่งข้อมูลไม่ถูกต้อง', requestId: null } };
    }
    pages.push({ data: result.payload.data, pagination: result.payload.pagination });
    lastPayload = result.payload;
    const merged = mergeSourcePages(pages, MAX_PAGES);
    if (merged.complete || !result.payload.data.length) {
      return { kind: 'ready', merged, meta: result.payload.meta };
    }
  }
  if (!lastPayload) {
    return { kind: 'error', error: { code: 'EMPTY_RESPONSE', message: 'บัญชีกลางไม่ส่งรายการแหล่งข้อมูล', requestId: null } };
  }
  return { kind: 'ready', merged: mergeSourcePages(pages, MAX_PAGES), meta: lastPayload.meta };
}

function uniqueWarnings(values: readonly string[] | undefined) {
  return [...new Set(Array.isArray(values) ? values : [])];
}

function ErrorPanel({ error, onRetry, subject }: { error: ApiErrorView; onRetry: () => void; subject: string }) {
  return (
    <div className="empty-state" role="alert">
      <Icon name="info" size={30} />
      <h2>อ่าน{subject}ไม่สำเร็จ</h2>
      <p>{error.message}</p>
      <p className="null-value">รหัสสถานะ {error.code}</p>
      <button type="button" className="button secondary" onClick={onRetry}>
        ลองอ่านใหม่<Icon name="arrow" size={17} />
      </button>
    </div>
  );
}

function ToneBadge({ tone, label }: { tone: RunStatusTone; label: string }) {
  const style = TONE_STYLE[tone];
  return (
    <span className="badge" style={{ background: style.background, color: style.color }}>
      {label}
    </span>
  );
}

function SourceDetail({ state, sourceName, onRetry }: { state: DetailState; sourceName: string; onRetry: () => void }) {
  if (state.kind === 'idle') {
    return <p className="data-empty" role="status">เลือกแหล่งข้อมูลจากรายชื่อเพื่อดูสถานะรอบงานล่าสุด</p>;
  }
  if (state.kind === 'loading') {
    return <p className="area-note" role="status" aria-busy="true">กำลังอ่านสถานะรอบงานของ {sourceName}…</p>;
  }
  if (state.kind === 'error') {
    return <ErrorPanel error={state.error} onRetry={onRetry} subject="สถานะแหล่งข้อมูล" />;
  }
  const panel = buildStatusPanel(state.source, state.meta);
  const detailWarnings = uniqueWarnings(state.meta.warnings);
  const sourceLink = safeHttpUrl(state.source.baseUrl);
  return (
    <div className="local-data">
      <div className="real-data-heading">
        <div>
          <h2>{state.source.name}</h2>
          <p>รหัส {state.source.id} · สถานะตามทะเบียนเป็นคนละเรื่องกับสถานะรอบงานล่าสุด</p>
        </div>
        {sourceLink && (
          <a className="button secondary" href={sourceLink} target="_blank" rel="noreferrer">
            เปิดเว็บไซต์ต้นทาง<Icon name="external" size={17} />
          </a>
        )}
      </div>

      <div className="data-count">
        <span>
          สถานะตามทะเบียน:{' '}
          <span className={'badge ' + (REGISTRY_TONE[panel.registry.value ?? ''] ?? 'neutral')}>{panel.registry.label}</span>
        </span>
        <span>
          สถานะรอบงานล่าสุด: <ToneBadge tone={panel.latestRun.tone} label={panel.latestRun.label} />
        </span>
      </div>

      <p className="area-note">สถานะรอบงานล่าสุดอาจเป็นคนละรอบกับประวัติที่เปิดเผยได้ สถานะของรอบล่าสุดที่เปิดเผยได้: {panel.latestVisibleRun.statusLabel}</p>

      <dl className="metadata-table">
        <div>
          <dt>รอบล่าสุดที่เปิดเผยได้เริ่มเมื่อ</dt>
          <dd>{panel.latestVisibleRun.startedAt.text}</dd>
        </div>
        <div>
          <dt>รอบล่าสุดที่เปิดเผยได้สิ้นสุดเมื่อ</dt>
          <dd>{panel.latestVisibleRun.completedAt.text}</dd>
        </div>
        <div>
          <dt>ดึงข้อมูลสำเร็จล่าสุด</dt>
          <dd>
            {panel.lastSuccessfulSync.text}
            {panel.lastSuccessfulSync.unknown && <span className="null-value"> · ยังไม่ทราบ (ไม่มีบันทึกครั้งที่สำเร็จในทะเบียน)</span>}
          </dd>
        </div>
        <div>
          <dt>{panel.apiReadAt.label}</dt>
          <dd>{panel.apiReadAt.text}</dd>
        </div>
        <div>
          <dt>โหมดการอ่านของ API</dt>
          <dd>{state.meta.runtimeMode === 'source_api_fallback' ? 'source_api_fallback (อ่านต้นทางโดยตรง)' : 'database (อ่านจากคลังกลาง)'}</dd>
        </div>
        {panel.latestVisibleRun.errorCode && (
          <div>
            <dt>รหัสความผิดพลาดของรอบล่าสุดที่เปิดเผยได้</dt>
            <dd>{sanitizeErrorText(panel.latestVisibleRun.errorCode)}</dd>
          </div>
        )}
      </dl>

      <p className="area-note">{panel.readIsNotFreshnessNote}</p>
      {panel.fallback.mode && (
        <p className="area-note" role="status">
          <Icon name="info" size={17} /> {panel.fallback.note}
        </p>
      )}

      <h3>ประวัติรอบการทำงาน</h3>
      {panel.runHistory.available ? (
        <div className="data-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">รอบ</th>
                <th scope="col">ชนิดงาน</th>
                <th scope="col">สถานะ</th>
                <th scope="col">เริ่ม</th>
                <th scope="col">สิ้นสุด</th>
                <th scope="col">จำนวนแถวต่อรอบ</th>
                <th scope="col">รหัสความผิดพลาด</th>
              </tr>
            </thead>
            <tbody>
              {panel.runHistory.rows.map(row => (
                <tr key={row.runId}>
                  <td>{row.runId.slice(0, 18)}</td>
                  <td>{row.kindLabel}</td>
                  <td>
                    <ToneBadge tone={row.tone} label={row.statusLabel} />
                  </td>
                  <td>{row.startedLabel.text}</td>
                  <td>{row.completedLabel.text}</td>
                  <td>{row.recordsText}</td>
                  <td>{row.errorCode ? sanitizeErrorText(row.errorCode) : <span className="null-value">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="data-empty" role="status">{panel.runHistory.note}</p>
      )}

      {detailWarnings.length > 0 && (
        <details className="data-notes">
          <summary>ข้อควรทราบจากบัญชีกลาง ({detailWarnings.length} รายการ)</summary>
          <ul>
            {detailWarnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="page-note">
        <Icon name="info" size={15} />
        หน้านี้เป็นสถานะของ connector ยังไม่แสดงมูลค่าหรือจำนวนข้อมูลที่ใช้ได้จริง และสรุปไม่ได้ว่าครบทุกจังหวัด
      </p>
    </div>
  );
}

export function DataStatusDashboard() {
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [listAttempt, setListAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ kind: 'idle' });
  const [detailAttempt, setDetailAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setList({ kind: 'loading' });
    void loadSources(controller.signal).then(result => {
      if (active && !controller.signal.aborted) setList(result);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [listAttempt]);

  useEffect(() => {
    if (!selectedId) {
      setDetail({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setDetail({ kind: 'loading' });
    void fetchEnvelope<SourceStatus>('/api/v1/sources/' + encodeURIComponent(selectedId) + '/status', controller.signal).then(
      result => {
        if (!active || controller.signal.aborted) return;
        setDetail(result.ok ? { kind: 'ready', source: result.payload.data, meta: result.payload.meta } : { kind: 'error', error: result.error });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId, detailAttempt]);

  const rows = list.kind === 'ready' ? list.merged.rows : [];
  const listWarnings = list.kind === 'ready' ? uniqueWarnings(list.meta.warnings) : [];
  const search = filterSources(rows, query);
  const selected = rows.find(row => row.id === selectedId);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>สถานะแหล่งข้อมูล</h1>
          <p>ดูว่าบัญชีกลางอ่าน catalog ของแต่ละหน่วยงานได้เมื่อใด และรอบงานล่าสุดสำเร็จ บางส่วน ล้มเหลว หรือยังไม่ได้แจ้งสถานะ</p>
        </div>
        <Link href="/open-data" className="text-link">
          <Icon name="book" size={17} /> ความพร้อมข้อมูลเปิด
        </Link>
      </div>

      <p className="area-note">
        <Icon name="info" size={16} /> เวลาที่แสดงทั้งหมดเป็นเวลาไทย (Asia/Bangkok) และหมายถึงเวลาที่ Hub ทำงานหรืออ่าน API
        ไม่ใช่เวลาที่ต้นทางปรับปรุงข้อมูลต้นทาง
      </p>

      <section className="local-data" aria-labelledby="data-status-list">
        <div className="real-data-heading">
          <div>
            <h2 id="data-status-list">รายชื่อแหล่งข้อมูลตามทะเบียน</h2>
            <p>สถานะของแหล่งในทะเบียนคนละเรื่องกับสถานะรอบงานล่าสุด เลือกแหล่งเพื่อดูประวัติรอบการทำงาน</p>
          </div>
          <button type="button" className="button secondary" onClick={() => setListAttempt(value => value + 1)}>
            ลองอ่านใหม่<Icon name="arrow" size={17} />
          </button>
        </div>

        {list.kind === 'loading' && (
          <p className="loading-state" role="status" aria-busy="true">
            กำลังอ่านทะเบียนแหล่งข้อมูลจากบัญชีกลาง…
          </p>
        )}
        {list.kind === 'error' && <ErrorPanel error={list.error} onRetry={() => setListAttempt(value => value + 1)} subject="ทะเบียนแหล่งข้อมูล" />}
        {list.kind === 'ready' && (
          <>
            <div className="data-filters">
              <div>
                <label htmlFor="data-status-query">ค้นหาชื่อหรือรหัสแหล่ง</label>
                <input
                  id="data-status-query"
                  type="search"
                  value={query}
                  maxLength={160}
                  placeholder="เช่น DOAE ราคา หรือ catalog"
                  onChange={event => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="data-count">
              <span>
                โหลดมา <strong>{rows.length.toLocaleString('th-TH')}</strong> จาก{' '}
                {list.merged.total.toLocaleString('th-TH')} แหล่งที่ pagination ของ API แจ้ง
              </span>
              <span>{search.active ? search.note : list.merged.note || 'แสดงทุกรายการที่โหลดมาตามจำนวนหน้าที่ API ตอบ'}</span>
            </div>
            {list.meta.runtimeMode === 'source_api_fallback' && (
              <p className="area-note" role="status">
                <Icon name="info" size={16} /> ทะเบียนนี้อ่านจาก API ต้นทางโดยตรง (source_api_fallback) ซึ่งเป็นข้อมูลการเชื่อมต่อ
                ยังไม่ใช่หลักฐานว่างาน sync เข้าคลังกลางสำเร็จ
              </p>
            )}
            {search.matched.length === 0 ? (
              <p className="data-empty" role="status">
                {rows.length === 0
                  ? 'บัญชีกลางยังไม่แจ้งรายการแหล่งข้อมูล (pagination.total = ' + list.merged.total.toLocaleString('th-TH') + ')'
                  : 'ไม่พบแหล่งที่ตรงกับคำค้นในรายการที่โหลดมา'}
              </p>
            ) : (
              <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">แหล่งข้อมูล</th>
                      <th scope="col">รหัส</th>
                      <th scope="col">สถานะตามทะเบียน</th>
                      <th scope="col">ดึงสำเร็จล่าสุด</th>
                      <th scope="col">เลือก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {search.matched.map(row => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.id}</td>
                        <td>
                          <span className={'badge ' + (REGISTRY_TONE[row.status] ?? 'neutral')}>
                            {registryLabel(row.status)}
                          </span>
                        </td>
                        <td>{formatTimeBangkok(row.lastSuccessAt).text}</td>
                        <td>
                          <button
                            type="button"
                            className="button secondary"
                            aria-pressed={row.id === selectedId}
                            onClick={() => setSelectedId(row.id)}
                          >
                            ดูสถานะงาน
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {listWarnings.length > 0 && (
              <details className="data-notes">
                <summary>ข้อควรทราบจากรายการแหล่งข้อมูล ({listWarnings.length} รายการ)</summary>
                <ul>
                  {listWarnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section className="local-data" aria-labelledby="data-status-detail">
        <div className="real-data-heading">
          <div>
            <h2 id="data-status-detail">สถานะรอบงานของแหล่งที่เลือก</h2>
            <p>{selected ? selected.name : 'ยังไม่ได้เลือกแหล่งข้อมูล'}</p>
          </div>
          {selectedId && (
            <button type="button" className="button secondary" onClick={() => setDetailAttempt(value => value + 1)}>
              ลองอ่านใหม่<Icon name="arrow" size={17} />
            </button>
          )}
        </div>
        <SourceDetail state={detail} sourceName={selected?.name ?? 'แหล่งข้อมูล'} onRetry={() => setDetailAttempt(value => value + 1)} />
      </section>
    </>
  );
}
