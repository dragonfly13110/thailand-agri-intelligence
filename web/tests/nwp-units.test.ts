/**
 * TMD HPC NWP unit-confirmation tests.
 *
 * The units below were checked against TMD's own public product pages on
 * 2026-10-31; this test pins that evidence per variable so a future edit
 * cannot silently turn a pending unit into a guessed one (or the reverse).
 * Fully in-memory; no network or D1 access.
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

const types = await import('../lib/hub/nwp-types.ts');

test('only the variables with TMD-published units get a display unit', () => {
  assert.deepEqual(types.NWP_VARIABLE_UNITS, {
    p1h: 'mm',
    p24h: 'mm',
    t2m: '°C',
    rhum: '%',
    ws10m: null,
  });
});

test('each confirmed unit carries the TMD page it was checked against', () => {
  for (const variable of types.NWP_VARIABLES) {
    const evidence = types.NWP_UNIT_EVIDENCE[variable];
    assert.ok(evidence, variable);
    assert.equal(evidence.checkedAt, '2026-10-31', variable);
    assert.ok(evidence.noteTh.trim().length > 0, variable);
    if (evidence.status === 'confirmed') {
      assert.ok(evidence.unit, variable);
      assert.match(evidence.evidenceUrl, /^https:\/\/hpc\.tmd\.go\.th\//, variable);
    } else {
      assert.equal(evidence.unit, null, variable);
      assert.ok(evidence.evidenceUrl, variable);
    }
  }
});

test('the wind column stays unconfirmed because the source files are swapped', () => {
  assert.equal(types.NWP_UNIT_EVIDENCE.ws10m.status, 'pending');
  assert.equal(types.NWP_VARIABLE_UNITS.ws10m, null);
  assert.match(types.NWP_UNIT_EVIDENCE.ws10m.noteTh, /สลับ/);
});

test('confirmation is per variable, never assumed from a bare status', () => {
  assert.equal(types.isNwpUnitConfirmed('pending_official_confirmation'), false);
  assert.equal(types.isNwpUnitConfirmed('pending_official_confirmation', 't2m'), true);
  assert.equal(types.isNwpUnitConfirmed('pending_official_confirmation', 'rhum'), true);
  assert.equal(types.isNwpUnitConfirmed('pending_official_confirmation', 'ws10m'), false);
  assert.equal(types.isNwpUnitConfirmed('confirmed_by_tmd'), true);
  assert.equal(types.isNwpUnitConfirmed('confirmed_by_tmd', 'ws10m'), true);
});

test('publishedUnitFor never invents a unit for an unconfirmed variable', () => {
  assert.equal(types.publishedUnitFor('p24h'), 'mm');
  assert.equal(types.publishedUnitFor('t2m'), '°C');
  assert.equal(types.publishedUnitFor('rhum'), '%');
  assert.equal(types.publishedUnitFor('ws10m'), null);
});
