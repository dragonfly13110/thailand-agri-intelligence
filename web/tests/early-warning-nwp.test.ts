/**
 * The `/early-warning` forecast tab may only show the real TMD HPC NWP 72 h
 * forecast when the published values can be summarised without inventing a
 * number: a missing province value is skipped (never 0), the maximum is the
 * maximum of the published province values, and no lead is shown without a
 * readable `validAt`.
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

const forecast = await import('../lib/hub/early-warning-nwp.ts');

const RUN = {
  runId: 'tmd_hpc_d02_2026103018',
  initAt: '2026-10-30T18:00:00Z',
  retrievedAt: '2026-10-31T01:30:00Z',
  licenseStatus: 'approved_public',
  unitStatus: 'pending_official_confirmation',
};

function payload(validAt: string, rows: Array<[string, string, number | null, string | null]>) {
  return {
    runId: RUN.runId,
    variable: 'p24h',
    validAt,
    unit: 'mm',
    provinces: rows.map(([provinceCode, provinceName, value, riskLevel]) => ({
      provinceCode,
      provinceName,
      value,
      riskLevel,
    })),
  };
}

test('summarises each lead with the published maximum and ranked provinces', () => {
  const result = forecast.buildEarlyWarningNwpForecast(RUN, [
    payload('2026-10-31T18:00:00Z', [
      ['50', 'เชียงใหม่', 12.5, 'high'],
      ['90', 'สงขลา', 108.77, 'severe'],
    ]),
    payload('2026-10-31T00:00:00Z', [
      ['50', 'เชียงใหม่', 40, 'watch'],
      ['90', 'สงขลา', 22.1, 'normal'],
    ]),
  ]);

  assert.ok(result);
  assert.equal(result.variable, 'p24h');
  assert.equal(result.unit, 'mm');
  assert.equal(result.runId, RUN.runId);
  assert.deepEqual(
    result.leads.map((lead) => lead.leadHours),
    [6, 24],
    'leads are ordered by hours after init',
  );
  assert.equal(result.leads[0].maxMm, 40, 'first lead maximum');
  assert.equal(result.leads[1].maxMm, 108.77, 'second lead maximum');
  assert.deepEqual(
    result.leads[1].top.map((row) => row.provinceCode),
    ['90', '50'],
    'provinces are ranked by value, largest first',
  );
  assert.equal(result.leads[1].top[0].riskLevel, 'severe', 'risk level is passed through');
  assert.equal(result.leads[1].provincesWithValue, 2);
});

test('a missing province value is skipped, never treated as 0', () => {
  const result = forecast.buildEarlyWarningNwpForecast(RUN, [
    payload('2026-10-31T18:00:00Z', [
      ['10', 'กรุงเทพมหานคร', null, null],
      ['50', 'เชียงใหม่', 0, 'normal'],
    ]),
  ]);

  assert.ok(result);
  assert.equal(result.leads[0].maxMm, 0, 'a measured 0 stays 0');
  assert.equal(result.leads[0].provincesWithValue, 1, 'the null row is not counted');
  assert.deepEqual(result.leads[0].top.map((row) => row.provinceCode), ['50']);
});

test('a lead with only missing values reports null maximum and an empty ranking', () => {
  const result = forecast.buildEarlyWarningNwpForecast(RUN, [
    payload('2026-10-31T18:00:00Z', [
      ['10', 'กรุงเทพมหานคร', null, null],
      ['50', 'เชียงใหม่', null, null],
    ]),
  ]);

  assert.ok(result);
  assert.equal(result.leads[0].maxMm, null, 'no published value is null, not 0');
  assert.equal(result.leads[0].provincesWithValue, 0);
  assert.deepEqual(result.leads[0].top, []);
});

test('no readable payload means no forecast block at all', () => {
  assert.equal(forecast.buildEarlyWarningNwpForecast(RUN, []), null);
  assert.equal(
    forecast.buildEarlyWarningNwpForecast(RUN, [payload('not-a-date', [['50', 'เชียงใหม่', 10, 'high']])]),
    null,
    'a payload without a readable validAt is not shown',
  );
});

test('the weather page no longer denies the approved NWP forecast', () => {
  const page = readFileSync(new URL('../app/weather/page.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(
    new URL('../components/weather-dashboard.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(
    page.includes('ขณะนี้ยังไม่มีตัวเลข'),
    false,
    'the page must not imply that no approved forecast numbers exist',
  );
  assert.equal(
    page.includes('พร้อมพยากรณ์ 7 วันล่วงหน้า'),
    false,
    'the metadata must not promise a 7-day forecast that is not published',
  );
  assert.equal(
    dashboard.includes('ยังไม่มีข้อมูลจากแหล่งพยากรณ์ที่อนุมัติให้เผยแพร่'),
    false,
    'the empty state must name the missing station batch, not deny every approved source',
  );
  assert.match(page, /72 ชั่วโมง/, 'the page must name the approved NWP horizon');
  assert.match(dashboard, /72 ชั่วโมง/, 'the empty state must name the approved NWP horizon');

  const weatherData = readFileSync(new URL('../lib/hub/weather-data.ts', import.meta.url), 'utf8');
  assert.match(weatherData, /พยากรณ์รายสถานี 7 วัน/, 'the warning must scope the gap to the station forecast');
  assert.match(weatherData, /72 ชั่วโมง/, 'the warning must name the approved NWP horizon');
});

test('the early-warning copy stops claiming that no approved forecast exists', () => {
  const dashboard = readFileSync(
    new URL('../components/early-warning-dashboard.tsx', import.meta.url),
    'utf8',
  );
  const route = readFileSync(
    new URL('../app/api/v1/early-warning/route.ts', import.meta.url),
    'utf8',
  );

  assert.equal(
    dashboard.includes('ยังไม่มีแหล่ง forecast ที่ได้สิทธิ์เผยแพร่'),
    false,
    'the stale claim must go: TMD HPC NWP is approved_public',
  );
  assert.match(dashboard, /72 ชั่วโมง/, 'the copy must state the real forecast horizon');
  assert.match(dashboard, /\/nwp/, 'the copy must point to the real forecast page');
  assert.equal(
    /no approved forecast resource exists yet/i.test(route),
    false,
    'the route doc comment must not deny the approved NWP resource',
  );
});
