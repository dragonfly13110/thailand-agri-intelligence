/**
 * `/data-status` is the page that answers "when did the hub last read each
 * source?". TMD HPC NWP is published through `nwp_runs`, not `sync_runs`, so the
 * registry list can never show it. The page must surface the newest usable NWP
 * run (and say honestly that TMD has not confirmed the unit yet) instead of
 * implying that the only forecast pipeline does not exist.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
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

const status = await import('../lib/hub/data-status-nwp.ts');

function run(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'tmd_hpc_d02_2026103018',
    initAt: '2026-10-30T18:00:00Z',
    retrievedAt: '2026-10-31T01:30:00Z',
    domain: 'd02',
    domainLabel: 'Thailand 3 km',
    variables: ['p1h', 'p24h', 't2m', 'rhum'],
    leadHours: [6, 12, 30],
    status: 'ready',
    licenseStatus: 'approved_public',
    unitStatus: 'pending_official_confirmation',
    publicationMode: 'numeric_preview',
    ...overrides,
  };
}

test('the newest usable NWP run is surfaced with its real read time', () => {
  const view = status.buildNwpStatusView([
    run({ runId: 'old', initAt: '2026-10-29T18:00:00Z' }),
    run(),
    run({ runId: 'broken', initAt: 'not-a-date' }),
    run({ runId: 'failed', initAt: '2026-10-31T06:00:00Z', status: 'failed' }),
  ]);

  assert.ok(view);
  assert.equal(view.runId, 'tmd_hpc_d02_2026103018');
  assert.equal(view.initAt, '2026-10-30T18:00:00Z');
  assert.equal(view.retrievedAt, '2026-10-31T01:30:00Z');
  assert.equal(view.statusLabel, 'พร้อมใช้งาน');
  assert.equal(view.licenseLabel, 'อนุมัติให้เผยแพร่แล้ว');
  assert.match(view.leadHoursLabel, /6/);
  assert.match(view.leadHoursLabel, /30/);
  assert.match(view.variableLabels.join(' '), /ฝน/);
});

test('a contiguous lead-hour series is compressed into a readable range', () => {
  const hourly = Array.from({ length: 73 }, (_, index) => index);
  const view = status.buildNwpStatusView([run({ leadHours: hourly })]);
  assert.ok(view);
  assert.equal(view.leadHoursLabel, '0–72 ชั่วโมง (ทุก 1 ชม.)');

  const everySix = status.buildNwpStatusView([run({ leadHours: [0, 6, 12, 18] })]);
  assert.ok(everySix);
  assert.equal(everySix.leadHoursLabel, '0–18 ชั่วโมง (ทุก 6 ชม.)');

  const sparse = status.buildNwpStatusView([run({ leadHours: [6, 12, 30] })]);
  assert.ok(sparse);
  assert.equal(sparse.leadHoursLabel, '6, 12, 30 ชั่วโมง');
});

test('an unconfirmed unit is stated, never presented as confirmed', () => {
  const view = status.buildNwpStatusView([run()]);
  assert.ok(view);
  assert.match(view.unitLabel, /รอ TMD ยืนยันหน่วย/);
  assert.doesNotMatch(view.unitLabel, /ยืนยันแล้ว/);
});

test('no usable run yields null instead of an invented run', () => {
  assert.equal(status.buildNwpStatusView([]), null);
  assert.equal(status.buildNwpStatusView(null), null);
  assert.equal(status.buildNwpStatusView({ runs: [] }), null);
  assert.equal(status.buildNwpStatusView([run({ status: 'failed' })]), null);
});

test('the data-status dashboard fetches and links the NWP runs endpoint', () => {
  const dashboard = readFileSync(
    new URL('../components/data-status-dashboard.tsx', import.meta.url),
    'utf8',
  );

  assert.match(dashboard, /\/api\/v1\/nwp\/runs/, 'the page must read the real NWP runs endpoint');
  assert.match(dashboard, /href="\/nwp"/, 'the page must link the forecast page');
  assert.match(dashboard, /NWP/, 'the section must name NWP');
  assert.match(dashboard, /TMD/, 'the section must name the provider');
});
