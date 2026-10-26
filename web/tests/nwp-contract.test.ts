/**
 * Contract tests for the TMD HPC NWP web types and risk helpers (lane D).
 *
 * Pure, in-memory checks: no network, no D1, no `config/nwp_thresholds.json`
 * read (lane B owns that file). The threshold fixture below is copied verbatim
 * from the work order §3.7 so a drift between this contract and the canonical
 * file shows up as a failing boundary, not as a silent UI change.
 *
 * The runner uses `node --experimental-strip-types`, so the same
 * resolution/transpilation hooks as `hub-data-domains.test.ts` are installed
 * locally. No production file is modified.
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
      // The app uses bundler-style extensionless imports; Node needs the suffix.
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
const risk = await import('../lib/hub/nwp-risk.ts');

/** Work order §3.7 verbatim; internal TADIH thresholds, not official TMD warnings. */
const THRESHOLD_FIXTURE = {
  version: 1,
  source: 'TADIH internal thresholds; not official TMD warnings',
  variables: {
    p24h: { unit: 'mm', watch: 20, high: 50, severe: 90 },
    p1h: { unit: 'mm', watch: 10, high: 20, severe: 30 },
    t2m: { unit: 'degC', watch: 35, high: 38, severe: 40 },
    rhum: { unit: '%', watch: 85, high: 90, severe: 95 },
    ws10m: { unit: 'm/s', watch: 6, high: 10, severe: 15 },
  },
};

function cloneFixture() {
  return JSON.parse(JSON.stringify(THRESHOLD_FIXTURE)) as {
    version: number;
    source: string;
    variables: Record<string, { unit: string; watch: number; high: number; severe: number }>;
  };
}

/* ------------------------------------------------------------------ */
/* Variables                                                           */
/* ------------------------------------------------------------------ */

test('nwp contract: variable allowlist is exactly five variables in API order', () => {
  assert.equal(types.NWP_VARIABLES.length, 5);
  assert.deepEqual([...types.NWP_VARIABLES], ['p1h', 'p24h', 't2m', 'rhum', 'ws10m']);
  assert.equal(new Set(types.NWP_VARIABLES).size, 5);
  assert.deepEqual(
    Object.keys(types.NWP_VARIABLE_LABELS_TH),
    [...types.NWP_VARIABLES],
    'labels must cover the allowlist in the same order, with no extras',
  );
  assert.equal(new Set(Object.values(types.NWP_VARIABLE_LABELS_TH)).size, 5);
});

test('nwp contract: isNwpVariable accepts only the allowlist', () => {
  for (const variable of types.NWP_VARIABLES) {
    assert.equal(types.isNwpVariable(variable), true, variable);
  }
  for (const rejected of ['dws', 'P1H', ' p1h', 'p1h ', '', 'prec1hr', null, undefined, 1, {}, []]) {
    assert.equal(types.isNwpVariable(rejected), false, String(rejected));
  }
});

test('nwp contract: unit map stays null until TMD confirms official units', () => {
  assert.deepEqual(Object.keys(types.NWP_VARIABLE_UNITS_PENDING).sort(), [...types.NWP_VARIABLES].sort());
  for (const variable of types.NWP_VARIABLES) {
    assert.equal(types.NWP_VARIABLE_UNITS_PENDING[variable], null, variable);
  }
});

/* ------------------------------------------------------------------ */
/* Run id                                                              */
/* ------------------------------------------------------------------ */

test('nwp contract: run id pattern accepts tmd_hpc_d02_YYYYMMDDHH and rejects drift', () => {
  assert.equal(types.NWP_RUN_ID_PATTERN, '^[a-z0-9_]{8,80}$');
  const pattern = new RegExp(types.NWP_RUN_ID_PATTERN);

  for (const accepted of [
    'tmd_hpc_d02_2026102600',
    'abcdefgh',
    'a'.repeat(80),
    '2026102600',
  ]) {
    assert.equal(pattern.test(accepted), true, `must accept ${accepted}`);
  }

  for (const rejected of [
    '',
    'short',
    'a'.repeat(81),
    'TMD_HPC_D02_2026102600',
    'tmd-hpc-d02-2026102600',
    'tmd hpc d02 2026102600',
    'tmd_hpc_d02_2026102600;',
    '../tmd_hpc_d02_2026102600',
  ]) {
    assert.equal(pattern.test(rejected), false, `must reject ${JSON.stringify(rejected)}`);
  }
});

/* ------------------------------------------------------------------ */
/* Risk boundaries                                                     */
/* ------------------------------------------------------------------ */

test('nwp contract: every variable classifies exactly on the threshold boundaries', () => {
  const thresholds = risk.validateThresholds(cloneFixture());

  for (const variable of types.NWP_VARIABLES) {
    const { watch, high, severe } = thresholds.variables[variable];
    const label = variable;

    assert.equal(risk.evaluateRisk(watch - 0.01, variable, thresholds), 'normal', `${label}: watch-0.01`);
    assert.equal(risk.evaluateRisk(watch, variable, thresholds), 'watch', `${label}: watch`);
    assert.equal(risk.evaluateRisk(high - 0.01, variable, thresholds), 'watch', `${label}: high-0.01`);
    assert.equal(risk.evaluateRisk(high, variable, thresholds), 'high', `${label}: high`);
    assert.equal(risk.evaluateRisk(severe - 0.01, variable, thresholds), 'high', `${label}: severe-0.01`);
    assert.equal(risk.evaluateRisk(severe, variable, thresholds), 'severe', `${label}: severe`);
    assert.equal(risk.evaluateRisk(severe + 100, variable, thresholds), 'severe', `${label}: above severe`);

    // A real 0 (e.g. no rain) is a value, not missing: it must classify, not null.
    assert.equal(risk.evaluateRisk(0, variable, thresholds), 'normal', `${label}: zero`);
    assert.equal(risk.evaluateRisk(-1, variable, thresholds), 'normal', `${label}: negative`);
  }
});

test('nwp contract: missing or non-finite values stay unknown, never normal', () => {
  const thresholds = risk.validateThresholds(cloneFixture());

  for (const variable of types.NWP_VARIABLES) {
    for (const unknown of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(
        risk.evaluateRisk(unknown, variable, thresholds),
        null,
        `${variable}: ${String(unknown)} must be null, not normal`,
      );
    }
    // Defensive against untyped JSON leaking a string through mapping code.
    assert.equal(risk.evaluateRisk('20' as unknown as number, variable, thresholds), null);
  }
});

test('nwp contract: validateThresholds accepts the §3.7 fixture and normalizes five variables', () => {
  const thresholds = risk.validateThresholds(cloneFixture());
  assert.equal(thresholds.version, 1);
  assert.equal(thresholds.source, THRESHOLD_FIXTURE.source);
  assert.deepEqual(Object.keys(thresholds.variables), [...types.NWP_VARIABLES]);
  assert.deepEqual(thresholds.variables.p24h, { unit: 'mm', watch: 20, high: 50, severe: 90 });
  assert.deepEqual(thresholds.variables.p1h, { unit: 'mm', watch: 10, high: 20, severe: 30 });
  assert.deepEqual(thresholds.variables.t2m, { unit: 'degC', watch: 35, high: 38, severe: 40 });
  assert.deepEqual(thresholds.variables.rhum, { unit: '%', watch: 85, high: 90, severe: 95 });
  assert.deepEqual(thresholds.variables.ws10m, { unit: 'm/s', watch: 6, high: 10, severe: 15 });

  // A future variable in the file must not leak into v1 level math.
  const extended = cloneFixture();
  extended.variables.dws = { unit: 'W/m2', watch: 1, high: 2, severe: 3 };
  const normalized = risk.validateThresholds(extended);
  assert.deepEqual(Object.keys(normalized.variables), [...types.NWP_VARIABLES]);
});

test('nwp contract: validateThresholds fails closed on malformed input', () => {
  assert.throws(() => risk.validateThresholds(null), /must be a JSON object/);
  assert.throws(() => risk.validateThresholds([]), /must be a JSON object/);
  assert.throws(
    () => risk.validateThresholds({ ...cloneFixture(), version: 2 }),
    /version must be 1/,
  );
  assert.throws(
    () => risk.validateThresholds({ ...cloneFixture(), source: '' }),
    /source must be a non-empty string/,
  );
  assert.throws(
    () => risk.validateThresholds({ ...cloneFixture(), variables: null }),
    /variables must be an object/,
  );

  const missing = cloneFixture();
  delete missing.variables.p1h;
  assert.throws(() => risk.validateThresholds(missing), /missing thresholds for p1h/);

  const descending = cloneFixture();
  descending.variables.p24h.high = 15;
  assert.throws(() => risk.validateThresholds(descending), /watch < high < severe for p24h/);

  const equal = cloneFixture();
  equal.variables.rhum.severe = 90;
  assert.throws(() => risk.validateThresholds(equal), /watch < high < severe for rhum/);

  const nonNumeric = cloneFixture();
  nonNumeric.variables.t2m.watch = Number.NaN;
  assert.throws(() => risk.validateThresholds(nonNumeric), /finite numbers for t2m/);

  const stringNumber = cloneFixture();
  stringNumber.variables.ws10m.severe = '15' as unknown as number;
  assert.throws(() => risk.validateThresholds(stringNumber), /finite numbers for ws10m/);

  const missingUnit = cloneFixture();
  missingUnit.variables.p1h.unit = '  ';
  assert.throws(() => risk.validateThresholds(missingUnit), /unit must be a non-empty string for p1h/);
});

/* ------------------------------------------------------------------ */
/* Labels, ranks, advisories                                           */
/* ------------------------------------------------------------------ */

test('nwp contract: risk labels and ranks order normal < watch < high < severe', () => {
  const ranks = types.RISK_LEVELS.map((level) => risk.riskRank(level));
  assert.deepEqual(ranks, [0, 1, 2, 3]);
  assert.deepEqual([...new Set(ranks)].length, ranks.length);

  for (const level of types.RISK_LEVELS) {
    const label = risk.riskLabelTh(level);
    assert.ok(label.trim().length > 0, `${level}: label`);
    assert.equal(label, types.RISK_LABELS_TH[level], `${level}: shared label`);
    assert.ok(!label.includes('ประกาศ'), `${level}: label must not read as a warning bulletin`);
  }

  assert.equal(risk.riskRank(null), -1);
  assert.equal(risk.riskRank(undefined), -1);
  assert.equal(risk.riskLabelTh(null), 'ไม่มีข้อมูล');
  assert.equal(risk.riskLabelTh(undefined), 'ไม่มีข้อมูล');
});

test('nwp contract: advisories exist for elevated levels and never read as official warnings', () => {
  for (const variable of types.NWP_VARIABLES) {
    assert.equal(risk.advisoryFor(variable, 'normal'), null, `${variable}: normal`);
    assert.equal(risk.advisoryFor(variable, null), null, `${variable}: null`);
    assert.equal(risk.advisoryFor(variable, undefined), null, `${variable}: undefined`);

    for (const level of ['watch', 'high', 'severe'] as const) {
      const advisory = risk.advisoryFor(variable, level);
      assert.ok(advisory !== null, `${variable}/${level}: advisory must exist`);
      assert.ok(advisory.trim().length > 0, `${variable}/${level}: advisory text`);
      assert.ok(!advisory.includes('ประกาศ'), `${variable}/${level}: must not claim an announcement`);
      assert.ok(!advisory.includes('เตือนภัย'), `${variable}/${level}: must not claim a warning`);
    }
  }
});

test('nwp contract: unitFor exposes a display-only unit and never the source unit', () => {
  const thresholds = risk.validateThresholds(cloneFixture());
  assert.equal(risk.unitFor('p24h', thresholds), 'mm');
  assert.equal(risk.unitFor('t2m', thresholds), 'degC');
  assert.equal(risk.unitFor('rhum', thresholds), '%');
  assert.equal(risk.unitFor('ws10m', thresholds), 'm/s');
  assert.equal(risk.unitFor('p24h', null), null);
  assert.equal(risk.unitFor('p24h', undefined), null);
});

/* ------------------------------------------------------------------ */
/* Constants and grid geometry                                         */
/* ------------------------------------------------------------------ */

test('nwp contract: dataset constants and Thai governance warnings are pinned', () => {
  assert.equal(types.NWP_DATASET_VERSION, 'tmd-hpc-d02-v1');
  assert.equal(types.NWP_SOURCE_ID, 'tmd_hpc_nwp');
  assert.equal(types.NWP_DOMAIN, 'd02');
  assert.equal(types.NWP_DOMAIN_LABEL, 'Thailand 3km');
  assert.equal(types.NWP_METHOD_GRID, 'block_mean_0.15deg');
  assert.equal(types.NWP_METHOD_PROVINCE, 'max_within_25km');
  assert.equal(types.NWP_METHOD_PROVINCE_FALLBACK, 'nearest_cell');
  assert.equal(types.NWP_PROVINCE_RADIUS_KM, 25);
  assert.deepEqual(types.NWP_LEAD_HOURS, [0, 6, 12, 24, 48, 72]);

  assert.deepEqual(types.NWP_VARIABLE_LABELS_TH, {
    p1h: 'ฝน 1 ชม.',
    p24h: 'ฝน 24 ชม.',
    t2m: 'อุณหภูมิ 2 ม.',
    rhum: 'ความชื้นสัมพัทธ์',
    ws10m: 'ลม 10 ม.',
  });

  assert.equal(types.NWP_WARNINGS.length, 4);
  const warnings = types.NWP_WARNINGS.join('\n');
  assert.ok(warnings.includes('ค่าพยากรณ์'), 'forecast-not-observation warning');
  assert.ok(warnings.includes('ไม่ใช่ค่าตรวจวัด'), 'forecast-not-observation warning');
  assert.ok(warnings.includes('หน่วย'), 'pending-units warning');
  assert.ok(warnings.includes('ไม่ใช่ค่าของจังหวัด'), 'grid-is-not-province warning');
  assert.ok(warnings.includes('ไม่ใช่ประกาศเตือนภัย'), 'not-an-official-warning warning');
  assert.ok(
    types.NWP_WARNINGS.every((warning) => warning.trim().length > 0),
    'no empty warning',
  );
});

test('nwp contract: grid is 67 x 107 over the fixed bbox with a north-west origin', () => {
  assert.deepEqual(types.NWP_GRID.bbox, [96.0, 5.0, 106.0, 21.0]);
  assert.equal(types.NWP_GRID.nx, 67);
  assert.equal(types.NWP_GRID.ny, 107);
  assert.equal(types.NWP_GRID.cellDeg, 0.15);
  assert.equal(types.NWP_GRID.nx * types.NWP_GRID.ny, 7169);
  assert.equal(types.NWP_GRID_CELLS, 7169);

  const [lonMin, latMin, lonMax, latMax] = types.NWP_GRID.bbox;
  assert.equal(Math.ceil((lonMax - lonMin) / types.NWP_GRID.cellDeg), types.NWP_GRID.nx);
  assert.equal(Math.ceil((latMax - latMin) / types.NWP_GRID.cellDeg), types.NWP_GRID.ny);

  assert.equal(
    types.NWP_GRID_ORIENTATION,
    'row-major; row 0 = north (lat_max), col 0 = west (lon_min)',
  );
  assert.ok(types.NWP_GRID_ORIENTATION.includes('row-major'));
  assert.ok(types.NWP_GRID_ORIENTATION.includes('row 0 = north'));
  assert.ok(types.NWP_GRID_ORIENTATION.includes('col 0 = west'));
  assert.equal(types.NWP_GRID_INDEX_RULE, 'index = row * nx + col');

  // Corner check: index 0 is the north-west corner, last index the south-east corner.
  const lastIndex = types.NWP_GRID.nx * types.NWP_GRID.ny - 1;
  assert.equal(lastIndex % types.NWP_GRID.nx, types.NWP_GRID.nx - 1);
  assert.equal(Math.floor(lastIndex / types.NWP_GRID.nx), types.NWP_GRID.ny - 1);
});
