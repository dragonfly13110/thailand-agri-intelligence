/**
 * Data status page logic (new-feature lane 5).
 *
 * The page reads the existing hub endpoints /api/v1/sources and
 * /api/v1/sources/{id}/status, so everything that decides what the UI may
 * claim lives here: a null latest run status is "unknown" and never success,
 * a fetch timestamp is not source freshness, records of different run kinds
 * are never merged into one usable total, and upstream error text is stripped
 * of URLs and credentials before it can reach the screen. Runs fully offline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default undefined;', shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try {
            return nextResolve(specifier + suffix, context);
          } catch {
            // try the next candidate before rethrowing the original error
          }
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
      const source = readFileSync(new URL(url), 'utf8');
      return {
        format: 'module',
        source: stripTypeScriptTypes(source, { mode: 'transform' }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const status = await import('../lib/hub/data-status.ts');

type SourceRun = import('../lib/hub/types.ts').SourceRun;
type HubSource = import('../lib/hub/types.ts').HubSource;
type ApiMeta = import('../lib/hub/types.ts').ApiMeta;
type Pagination = import('../lib/hub/types.ts').Pagination;

function run(overrides: Partial<SourceRun> = {}): SourceRun {
  return {
    runId: 'run-1',
    kind: 'metadata',
    status: 'succeeded',
    startedAt: '2026-10-27T02:00:00Z',
    completedAt: '2026-10-27T02:05:00Z',
    recordsRead: 100,
    recordsWritten: 100,
    errorCode: null,
    ...overrides,
  };
}

function meta(overrides: Partial<ApiMeta> = {}): ApiMeta {
  return {
    availability: 'ready',
    freshness: 'unknown',
    completeness: 'unknown',
    access: 'metadata_only',
    sourceIds: ['doae'],
    retrievedAt: '2026-10-27T09:30:00Z',
    dataAsOf: null,
    sourceUpdatedAt: null,
    datasetVersion: null,
    warnings: [],
    runtimeMode: 'database',
    ...overrides,
  };
}

function source(overrides: Partial<HubSource> = {}): HubSource {
  return {
    id: 'doae',
    name: 'DOAE Open Data',
    baseUrl: 'https://ckan.doae.go.th',
    status: 'enabled',
    lastSuccessAt: null,
    ...overrides,
  };
}

// ── latest job status keeps its own meaning ────────────────────────────────

test('a missing latest status reads as unknown, never as a succeeded job', () => {
  assert.equal(status.runStatusTone(null), 'unknown');
  assert.equal(status.runStatusTone(undefined), 'unknown');
  assert.equal(status.runStatusTone(''), 'unknown');
  assert.equal(status.runStatusTone('succeededy'), 'unknown');
  assert.equal(status.runStatusTone('unknown'), 'unknown');
  assert.equal(status.isLatestRunSuccess(null), false);
  assert.equal(status.isLatestRunSuccess('succeeded'), true);
});

test('each real run status gets its own label and tone', () => {
  assert.equal(status.runStatusTone('failed'), 'failed');
  assert.equal(status.runStatusTone('partial'), 'partial');
  assert.equal(status.runStatusTone('running'), 'running');
  assert.equal(status.runStatusTone('succeeded'), 'succeeded');
  assert.equal(status.runStatusLabel('failed'), 'ล้มเหลว');
  assert.equal(status.runStatusLabel('partial'), 'เสร็จบางส่วน');
  assert.equal(status.runStatusLabel('running'), 'กำลังรัน');
  assert.equal(status.runStatusLabel('succeeded'), 'สำเร็จ');
  assert.equal(status.runStatusLabel(null), 'ยังไม่ทราบ');
});

test('a failed latest round with an older success still shows that success but not as a green latest round', () => {
  const detail = {
    ...source({ lastSuccessAt: '2026-10-26T01:00:00Z' }),
    latestStatus: 'failed' as const,
    recentRuns: [run({ status: 'failed', errorCode: 'HTTP_503' })],
  };
  const panel = status.buildStatusPanel(detail, meta());
  assert.equal(panel.latestRun.tone, 'failed');
  assert.equal(panel.latestRun.showAsSuccess, false);
  assert.equal(panel.lastSuccessfulSync.unknown, false);
  assert.ok(panel.lastSuccessfulSync.text.includes('26 ต.ค.'), panel.lastSuccessfulSync.text);
  assert.equal(panel.latestVisibleRun.errorCode, 'HTTP_503');
});

// ── times ──────────────────────────────────────────────────────────────────

test('timestamps render in Asia/Bangkok', () => {
  const label = status.formatTimeBangkok('2026-10-27T01:00:00Z').text;
  assert.ok(label.includes('08:00'), label);
  assert.ok(/27 ต\.ค\./.test(label), label);
});

test('a null or unreadable timestamp says unknown instead of a made-up date', () => {
  assert.equal(status.formatTimeBangkok(null).text, 'ยังไม่ทราบ');
  assert.equal(status.formatTimeBangkok(undefined).text, 'ยังไม่ทราบ');
  assert.equal(status.formatTimeBangkok('not-a-date').text, 'ยังไม่ทราบ');
  assert.equal(status.formatTimeBangkok('').text, 'ยังไม่ทราบ');
});

test('an empty lastSuccessAt is unknown, not a claim that the source never had data', () => {
  const panel = status.buildStatusPanel(
    { ...source(), latestStatus: 'running', recentRuns: [] },
    meta({ runtimeMode: 'source_api_fallback' }),
  );
  assert.equal(panel.lastSuccessfulSync.unknown, true);
  assert.equal(panel.lastSuccessfulSync.text, 'ยังไม่ทราบ');
  assert.doesNotMatch(panel.lastSuccessfulSync.text, /ไม่เคย/);
});

// ── the api read time is not source freshness ──────────────────────────────

test('the api read time is labelled as a read, never as data freshness', () => {
  const panel = status.buildStatusPanel(
    { ...source(), latestStatus: null, recentRuns: [] },
    meta({ retrievedAt: '2026-10-27T09:30:00Z' }),
  );
  assert.equal(panel.apiReadAt.text.includes('09:30') || panel.apiReadAt.text.includes('16:30'), true);
  assert.ok(panel.apiReadAt.label.includes('อ่าน'), panel.apiReadAt.label);
  assert.ok(!/dataAsOf|ข้อมูลถึง|ข้อมูลล่าสุด/.test(panel.apiReadAt.label), panel.apiReadAt.label);
  assert.ok(panel.readIsNotFreshnessNote.length > 20);
});

// ── registry status is a different fact from job status ────────────────────

test('registry status labels are separate from run status labels', () => {
  const panel = status.buildStatusPanel(
    { ...source({ status: 'needs_access', lastSuccessAt: '2026-10-20T01:00:00Z' }), latestStatus: 'succeeded', recentRuns: [] },
    meta(),
  );
  assert.equal(panel.registry.label, 'ต้องขอสิทธิ์ก่อนใช้');
  assert.equal(panel.registry.tone, 'attention');
  assert.equal(panel.latestRun.tone, 'succeeded');
  assert.equal(status.registryLabel('enabled'), 'พร้อมใช้งาน');
  assert.equal(status.registryLabel('deferred'), 'รอเริ่มเชื่อมต่อ');
  assert.equal(status.registryLabel('unavailable'), 'เชื่อมต่อไม่ได้');
  assert.equal(status.registryLabel(null), 'ยังไม่ทราบ');
});

// ── run history ────────────────────────────────────────────────────────────

test('records read and written stay per run and per kind, never a combined usable total', () => {
  const runs: SourceRun[] = [
    run({ runId: 'a', kind: 'metadata', recordsRead: 1234, recordsWritten: 12 }),
    run({ runId: 'b', kind: 'numeric', recordsRead: 300, recordsWritten: 3 }),
  ];
  const lines = status.runRecordsLines(runs);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('metadata'), lines[0]);
  assert.ok(lines[0].includes('1,234') && lines[0].includes('12'), lines[0]);
  assert.ok(lines[1].includes('numeric'), lines[1]);
  const combined = lines.join(' ');
  assert.ok(!combined.includes('1,534'), 'must not sum rows across run kinds');
  assert.ok(!combined.includes('1,537'), 'must not sum rows across run kinds');
});

test('an empty recentRuns list says no readable round, not that no round ever ran', () => {
  const panel = status.buildStatusPanel(
    { ...source(), latestStatus: 'failed', recentRuns: [] },
    meta(),
  );
  assert.equal(panel.runHistory.available, false);
  assert.equal(panel.runHistory.note, 'รอบล่าสุดอ่านจากทะเบียนรอบงาน ไม่พบรายการรอบที่เปิดเผยได้');
  assert.equal(panel.latestRun.tone, 'failed');
});

test('an upstream run kind this lane has not seen is shown raw, not relabelled', () => {
  assert.equal(status.kindLabel('numeric'), 'ตัวเลข (numeric)');
  assert.equal(status.kindLabel('metadata'), 'คำอธิบาย (metadata)');
  assert.equal(status.kindLabel('forecast'), 'forecast');
  assert.equal(status.kindLabel(null), 'ยังไม่ทราบ');
});

test('recent runs are labelled by kind and time with unknown completion kept unknown', () => {
  const panel = status.buildStatusPanel(
    {
      ...source(),
      latestStatus: 'running',
      recentRuns: [run({ status: 'running', completedAt: null, kind: 'numeric' })],
    },
    meta(),
  );
  assert.equal(panel.runHistory.available, true);
  assert.equal(panel.runHistory.rows.length, 1);
  const row = panel.runHistory.rows[0];
  assert.equal(row.kindLabel, 'ตัวเลข (numeric)');
  assert.equal(row.statusLabel, 'กำลังรัน');
  assert.equal(row.completedLabel.text, 'ยังไม่ทราบ');
  assert.equal(row.errorCode, null);
});

// ── fallback mode has no sync evidence ─────────────────────────────────────

test('source_api_fallback states that the response is not evidence of a successful sync', () => {
  const panel = status.buildStatusPanel(
    { ...source(), latestStatus: null, recentRuns: [] },
    meta({ runtimeMode: 'source_api_fallback', availability: 'ready' }),
  );
  assert.equal(panel.fallback.mode, true);
  assert.ok(panel.fallback.note.includes('ไม่ใช่หลักฐาน'), panel.fallback.note);
  assert.equal(panel.latestRun.tone, 'unknown');
  assert.equal(panel.lastSuccessfulSync.unknown, true);
});

test('a database response is not marked as fallback', () => {
  const panel = status.buildStatusPanel({ ...source(), latestStatus: 'partial', recentRuns: [] }, meta());
  assert.equal(panel.fallback.mode, false);
  assert.equal(panel.latestRun.tone, 'partial');
});

// ── source link safety ─────────────────────────────────────────────────────

test('only plain http(s) source links are opened', () => {
  assert.equal(status.safeHttpUrl('https://ckan.doae.go.th'), 'https://ckan.doae.go.th/');
  assert.equal(status.safeHttpUrl('http://catalog.example.test/path'), 'http://catalog.example.test/path');
  assert.equal(status.safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(status.safeHttpUrl('ftp://files.example.test'), null);
  assert.equal(status.safeHttpUrl('https://user:secretpass@example.test'), null);
  assert.equal(status.safeHttpUrl('https://example.test' + 'a'.repeat(2100)), null);
  assert.equal(status.safeHttpUrl(null), null);
});

// ── error text never leaks credentials ─────────────────────────────────────

test('error text drops URLs query strings and token values', () => {
  const dirty = 'GET https://api.example.com/v1/key?token=abc123def456&u=secret failed';
  const clean = status.sanitizeErrorText(dirty);
  assert.ok(!clean.includes('abc123def456'), clean);
  assert.ok(!clean.includes('api.example.com'), clean);
  assert.ok(!clean.includes('token='), clean);
  assert.ok(clean.length <= 200);
});

test('a short plain reason survives sanitising', () => {
  assert.equal(status.sanitizeErrorText('ขณะนี้อ่าน catalog ต้นทางไม่ได้'), 'ขณะนี้อ่าน catalog ต้นทางไม่ได้');
  assert.equal(status.sanitizeErrorText(null), 'ระบบอ่านข้อมูลไม่สำเร็จ');
  assert.equal(status.sanitizeErrorText(''), 'ระบบอ่านข้อมูลไม่สำเร็จ');
});

test('an api error body yields a code plus a safe message', () => {
  const parsed = status.readApiError(
    { error: { code: 'SOURCE_NOT_FOUND', message: 'ไม่พบแหล่งข้อมูลนี้', requestId: 'r-1' } },
    404,
  );
  assert.equal(parsed.code, 'SOURCE_NOT_FOUND');
  assert.equal(parsed.message, 'ไม่พบแหล่งข้อมูลนี้');
  assert.equal(parsed.requestId, 'r-1');
  const broken = status.readApiError({ data: 'unexpected' }, 500);
  assert.equal(broken.code, 'HTTP_500');
  assert.equal(broken.message, 'ระบบอ่านข้อมูลไม่สำเร็จ');
});

// ── pagination of /sources follows the response ────────────────────────────

function page(page: number, pageSize: number, total: number, rows: HubSource[]) {
  return { data: rows, meta: meta(), pagination: { page, pageSize, total } as Pagination };
}

test('source pages merge until the reported total is covered', () => {
  const first = page(1, 2, 5, [source({ id: 'a' }), source({ id: 'b' })]);
  const second = page(2, 2, 5, [source({ id: 'c' }), source({ id: 'd' })]);
  const third = page(3, 2, 5, [source({ id: 'e' })]);
  const merged = status.mergeSourcePages([first, second, third]);
  assert.equal(merged.rows.length, 5);
  assert.equal(merged.complete, true);
  assert.equal(merged.total, 5);
  assert.equal(merged.requestedPages, 3);
});

test('merging stops at the cap and reports the gap instead of pretending completion', () => {
  const pages = Array.from({ length: 6 }, (_, index) =>
    page(index + 1, 25, 200, Array.from({ length: 25 }, (unused, row) => source({ id: 's' + index + '-' + row }))));
  const merged = status.mergeSourcePages(pages, 3);
  assert.equal(merged.rows.length, 75);
  assert.equal(merged.complete, false);
  assert.equal(merged.total, 200);
  assert.ok(merged.note.includes('75') && merged.note.includes('200'), merged.note);
});

test('duplicate ids across pages are counted once', () => {
  const merged = status.mergeSourcePages([
    page(1, 25, 3, [source({ id: 'a' }), source({ id: 'b' })]),
    page(2, 25, 3, [source({ id: 'b' }), source({ id: 'c' })]),
  ]);
  assert.equal(merged.rows.length, 3);
  assert.equal(merged.duplicateRows, 1);
  assert.ok(merged.note.includes('ซ้ำ'), merged.note);
});

test('a list without pagination is not guessed into a page count', () => {
  assert.equal(status.pageCountFrom({ page: 1, pageSize: 25, total: 60 }), 3);
  assert.equal(status.pageCountFrom({ page: 1, pageSize: 25, total: 25 }), 1);
  assert.equal(status.pageCountFrom({ page: 1, pageSize: 0, total: 25 }), null);
  assert.equal(status.pageCountFrom(null), null);
});

// ── search stays honest about what it filtered ─────────────────────────────

test('search matches the loaded names and ids and reports how many remain', () => {
  const rows = [source({ id: 'doae' }), source({ id: 'nabc', name: 'NABC Catalog' }), source({ id: 'ldd', name: 'LDD Catalog' })];
  const result = status.filterSources(rows, 'catalog');
  assert.equal(result.matched.length, 2);
  assert.equal(result.active, true);
  assert.equal(result.note, 'พบ 2 จาก 3 แหล่งที่โหลดมา');
  assert.equal(status.filterSources(rows, '').matched.length, 3);
  assert.equal(status.filterSources(rows, '').active, false);
});

test('search text is trimmed and case folded before matching', () => {
  const rows = [source({ id: 'ROYALRAIN', name: 'Royal Rain Catalog' })];
  assert.equal(status.filterSources(rows, '  royal rain  ').matched.length, 1);
});

test('latest status and latest visible run remain separate when a newer run is hidden', () => {
  const panel = status.buildStatusPanel({ ...source(), latestStatus: 'failed', recentRuns: [run({ status: 'succeeded' })] });
  assert.equal(panel.latestRun.label, 'ล้มเหลว');
  assert.equal(panel.latestVisibleRun.startedAt.text, status.formatTimeBangkok('2026-10-27T02:00:00Z').text);
  assert.equal(panel.latestVisibleRun.statusLabel, 'สำเร็จ');
});
