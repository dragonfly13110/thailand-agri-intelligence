/**
 * Lane L3 — DOAE subdistrict crop production block (`/crops` + `/soil`).
 *
 * The block turns published `observations` (source=doae, grain=subdistrict) into an
 * API/UI payload. The contract under test is honesty, exercised with in-memory rows
 * (no network, no D1): subdistrict grain is preserved, a province-level figure only
 * ever appears as an explicitly labelled count with its method, missing values stay
 * null (never 0), different crops / years / units are never merged, and an empty
 * store renders an honest empty/unavailable state — never a substitute number.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';

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
        source: ts.transpileModule(source, {
          fileName: new URL(url).pathname,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            isolatedModules: true,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const lib = await import('../lib/hub/doae-production-data.ts');
const catalog = await import('../lib/hub/crops-soil-data.ts');
const { buildDoaeProductionBlock, mapDoaeObservationRow } = lib;

const SHORT_KEY = 'doae_production_subdistrict_2023';
const SHORT_RESOURCE_ID = catalog.DOAE_CROP_RESOURCES[SHORT_KEY].resourceId;

type Dimensions = Record<string, unknown>;
type SourceRow = Record<string, unknown> & { dimensions: Dimensions };

/** A valid published subdistrict observation row as `listD1Observations` returns it. */
function row(overrides: Partial<SourceRow> & { rowKey: string }): SourceRow {
  return {
    resourceId: SHORT_RESOURCE_ID,
    runId: 'run-doae-1',
    runStatus: 'succeeded',
    seriesKey: 'doae:series',
    sourceId: 'doae',
    datasetId: '6cc09797-a60e-43ce-a646-65364a1333c3',
    adapterVersion: 'doae-production-subdistrict/1.0.0',
    payloadSha256: 'deadbeefsha',
    sourceRetrievedAt: '2026-10-29T00:00:00+00:00',
    runCompletedAt: '2026-10-29T00:05:00+00:00',
    // DOAE rows are annual source-year labels: no calendar period is attached.
    observedAt: null,
    periodStart: null,
    periodEnd: null,
    periodLabel: 'พ.ศ. 2566',
    locationId: 'doae:subdistrict:bangkokbangkholam',
    locationCode: 'doae-subdistrict:bangkokbangkholam',
    locationKind: 'subdistrict',
    locationName: 'บางคอแหลม',
    provinceCode: '10',
    cropCode: null,
    cropName: 'ข้าวนาปี',
    metricId: 'planted_area_rai',
    metricName: 'เนื้อที่ปลูก',
    product: 'ข้าวนาปี',
    grade: null,
    market: null,
    unit: 'ไร่',
    value: 10,
    dimensions: {
      measure: 'planted_area_rai',
      measureLabel: 'เนื้อที่ปลูก (ไร่)',
      sourceYearBe: 2566,
      provinceName: 'กรุงเทพมหานคร',
      districtName: 'บางคอแหลม',
      subdistrictName: 'บางคอแหลม',
      cropType: 'ข้าวนาปี',
      varietyName: 'ข้าวเหนียว',
      sourceMonthLabel: '5',
      plantingRoundLabel: '0',
      revisionId: 'rev-2566',
    },
    qualityStatus: 'good',
    quality: {},
    sourceRowRef: '1:abc123',
    ...overrides,
  } as unknown as SourceRow;
}

function buildBlock(rows: SourceRow[], options: Partial<Record<string, unknown>> = {}) {
  return buildDoaeProductionBlock({
    resourceKey: SHORT_KEY,
    rows: rows as never,
    totalCount: (options.totalCount as number) ?? rows.length,
    availability: (options.availability as never) ?? 'ready',
    filters: options.filters as never,
    maxRows: options.maxRows as number,
    extraWarnings: options.extraWarnings as never,
  });
}

/* ------------------------------------------------------------------ */

test('the DOAE production block is real-data-only: sample is always false', () => {
  const block = buildBlock([row({ rowKey: 'obs-1' })]);
  assert.equal(block.sample, false);
  assert.equal(block.resourceKey, SHORT_KEY);
  assert.equal(block.availability, 'ready');
  // nothing in this builder hard-codes a number — every row came from the input.
  assert.equal(block.rows.length, 1);
  assert.equal(block.loadedCount, 1);
});

test('subdistrict grain is preserved verbatim (province/district/subdistrict stay distinct)', () => {
  const block = buildBlock([row({ rowKey: 'obs-1' })]);
  const mapped = block.rows[0];
  assert.equal(mapped.provinceCode, '10');
  assert.equal(mapped.provinceName, 'กรุงเทพมหานคร');
  assert.equal(mapped.districtName, 'บางคอแหลม');
  assert.equal(mapped.subdistrictName, 'บางคอแหลม');
  assert.equal(mapped.cropType, 'ข้าวนาปี');
  assert.equal(mapped.varietyName, 'ข้าวเหนียว');
  assert.equal(mapped.sourceYearBe, 2566);
  // month / planting-round are kept as raw source labels, never turned into a season
  assert.equal(mapped.monthLabel, '5');
  assert.equal(mapped.plantingRoundLabel, '0');

  // distinct subdistricts are counted, never collapsed to one admin code per row
  const twoSub = buildBlock([
    row({ rowKey: 'obs-1' }),
    row({
      rowKey: 'obs-2',
      locationId: 'doae:subdistrict:chiangmai',
      locationCode: 'doae-subdistrict:chiangmai',
      provinceCode: '50',
      dimensions: { ...row({ rowKey: 'x' }).dimensions, provinceName: 'เชียงใหม่', districtName: 'เมืองเชียงใหม่', subdistrictName: 'ช้างคลาน' },
    }),
  ]);
  assert.equal(twoSub.distinctSubdistrictsLoaded, 2);
});

test('a wrong-grain row (province/station, other source, or dated period) is refused, never silently aggregated', () => {
  const codeOf = (code: string) => (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { code?: string }).code === code;

  assert.throws(
    () => buildBlock([row({ rowKey: 'bad-kind', locationKind: 'province' })]),
    codeOf('DOAE_GRAIN_CONTRACT_INVALID'),
    'a province-kind row must not enter a subdistrict block',
  );
  assert.throws(
    () => buildBlock([row({ rowKey: 'bad-source', sourceId: 'oae' })]),
    codeOf('DOAE_PROVENANCE_MISMATCH'),
    'a row from another source must not enter the DOAE block',
  );
  assert.throws(
    () => buildBlock([row({ rowKey: 'bad-date', periodStart: '2023-01-01' })]),
    codeOf('DOAE_PERIOD_CONTRACT_INVALID'),
    'a dated row contradicts the Buddhist-year source-label contract',
  );
});

test('a province-level figure only ever appears as an explicitly labelled COUNT with its method, never a summed value', () => {
  const block = buildBlock([
    row({ rowKey: 'obs-a', value: 10 }),
    row({
      rowKey: 'obs-b',
      value: 40,
      locationId: 'doae:subdistrict:bangkhophung',
      locationCode: 'doae-subdistrict:bangkhophung',
      dimensions: { ...row({ rowKey: 'x' }).dimensions, subdistrictName: 'บางโพงพาง' },
    }),
  ]);

  // The ONLY province-level number is a labelled count of provinces seen in the window.
  assert.equal(block.distinctProvinceCodesLoaded, 1);
  assert.equal(typeof block.distinctProvinceCodesLoaded, 'number');

  // There is NO field that sums crop values across provinces (this builder never rolls up).
  assert.ok(!('provinceTotals' in block));
  assert.ok(!('provinceSums' in block));
  assert.ok(!('totalProduction' in block));

  // And the warnings disclose both the absence of a roll-up and the count's method/limit.
  assert.ok(block.warnings.some((w: string) => w.includes('ไม่มีผลรวมระดับจังหวัด')));
  assert.ok(block.warnings.some((w: string) => w.includes('การนับแถวไม่ใช่การรวมค่า')));
  assert.ok(
    block.warnings.some((w: string) => w.includes('หน้าต่างที่อ่าน') && w.includes('ไม่ใช่ข้อสรุป coverage')),
    'province/subdistrict counts are labelled as window counts with a stated method',
  );

  // The individual province rows keep their own values — no value was merged.
  const values = block.rows.map((r: { value: number | null }) => r.value).sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(values, [10, 40]);
});

test('missing values stay null (never 0) and unconfirmed units stay null', () => {
  const block = buildBlock([
    row({ rowKey: 'obs-missing-value', value: null, qualityStatus: 'missing' }),
    row({ rowKey: 'obs-no-unit', unit: null }),
    row({ rowKey: 'obs-no-year', dimensions: { ...row({ rowKey: 'x' }).dimensions, sourceYearBe: undefined }, periodLabel: null }),
  ]);

  const missingValue = block.rows.find((r: { rowKey: string }) => r.rowKey === 'obs-missing-value');
  assert.ok(missingValue);
  assert.equal(missingValue.value, null, 'a null source value must never become 0');
  assert.equal(missingValue.qualityStatus, 'missing');

  const noUnit = block.rows.find((r: { rowKey: string }) => r.rowKey === 'obs-no-unit');
  assert.ok(noUnit);
  assert.equal(noUnit.unit, null);

  // year cannot be read from any dimension/label → null, warned, never defaulted
  const noYear = block.rows.find((r: { rowKey: string }) => r.rowKey === 'obs-no-year');
  assert.ok(noYear);
  assert.equal(noYear.sourceYearBe, null);
  assert.ok(block.warnings.some((w: string) => w.includes('แสดงว่าง (ไม่ใส่ค่า 0)')));
  assert.ok(block.warnings.some((w: string) => w.includes('ไม่ทราบ') || w.includes('ไม่ใช่ 0')));
});

test('different units / crops / years are never merged into one figure', () => {
  // same measure but two units → the unit becomes null, and rows count is NOT a summed value
  const mixedUnits = buildBlock([
    row({ rowKey: 'obs-1', unit: 'ไร่' }),
    row({ rowKey: 'obs-2', unit: 'งาน', locationId: 'doae:subdistrict:sub2', dimensions: { ...row({ rowKey: 'x' }).dimensions, subdistrictName: 'บางโพงพาง' } }),
  ]);
  const planted = mixedUnits.measuresFound.find((m: { measure: string }) => m.measure === 'planted_area_rai');
  assert.ok(planted);
  assert.equal(planted.unit, null, 'mixed units must collapse to null, not a merged unit');
  assert.equal(planted.rows, 2, 'measuresFound counts rows, it never sums their values');

  // different crop types / years stay separate rows and separate year buckets
  const multiYear = buildBlock([
    row({ rowKey: 'obs-y2566', value: 10 }),
    row({ rowKey: 'obs-y2567', value: 22, periodLabel: 'พ.ศ. 2567', dimensions: { ...row({ rowKey: 'x' }).dimensions, sourceYearBe: 2567, cropType: 'มันสำปะหลัง' } }),
  ]);
  assert.deepEqual(multiYear.sourceYearsBe, [2567, 2566], 'years are kept as distinct buckets, never combined');
  assert.equal(multiYear.rows.length, 2, 'a different crop/year row is not merged away');
  assert.notEqual(
    multiYear.rows[0].cropType,
    multiYear.rows[1].cropType,
    'crop type identity survives side by side',
  );
});

test('bounded reads surface as truncation warnings, never a claim of full coverage', () => {
  const truncated = buildBlock([row({ rowKey: 'obs-1' })], { totalCount: 50000 });
  assert.equal(truncated.totalCount, 50000);
  assert.equal(truncated.loadedCount, 1);
  assert.equal(truncated.truncated, true);
  assert.ok(truncated.warnings.some((w: string) => w.includes('จาก 50,000') || (w.includes('50000') || w.includes('50,000'))));

  // 'ready' but zero rows in the window is honest, not silently 'empty'
  const readyNoRows = buildBlock([], { availability: 'ready', totalCount: 0 });
  assert.ok(readyNoRows.warnings.some((w: string) => w.includes('ไม่สรุปว่าไม่มีข้อมูล')));
});

test('empty store renders an honest empty/unavailable state, never a substitute number', () => {
  for (const availability of ['empty', 'catalog_missing', 'catalog_pending', 'no_numeric_run', 'unavailable']) {
    const block = buildBlock([], { availability, totalCount: 0 });
    assert.equal(block.sample, false, `${availability}: still real-data-only, no sample`);
    assert.deepEqual(block.rows, [], `${availability}: no rows are invented`);
    assert.equal(block.loadedCount, 0);
    assert.equal(block.availability, availability);
    assert.ok(
      block.warnings.some((w: string) => w.includes('ไม่ใช้ค่าตัวอย่างแทน') || w.includes('ไม่แสดงตัวเลข') || w.includes('ไม่แสดงค่าตัวอย่าง')),
      `${availability}: warns that no sample value is substituted`,
    );
    assert.ok(!block.warnings.some((w: string) => /\b0\b/.test(w) && w.includes('ผล')), `${availability}: never shows a zero as a result`);
  }

  // year filter with no match keeps rows empty and explains it honestly (not a data-absence claim)
  const yearFiltered = buildBlock([], { availability: 'empty', filters: { sourceYearBe: 2566 } });
  assert.deepEqual(yearFiltered.rows, []);
  assert.ok(yearFiltered.warnings.some((w: string) => w.includes('ไม่พบแถวจริงที่ตรงกับตัวกรอง')));
});

test('mapDoaeObservationRow keeps provenance fields and revision identity', () => {
  const mapped = mapDoaeObservationRow(row({ rowKey: 'obs-1' }) as never);
  assert.equal(mapped.rowKey, 'obs-1');
  assert.equal(mapped.measure, 'planted_area_rai');
  assert.equal(mapped.metricLabel, 'เนื้อที่ปลูก (ไร่)');
  assert.equal(mapped.value, 10);
  assert.equal(mapped.unit, 'ไร่');
  assert.equal(mapped.revisionId, 'rev-2566');
  assert.equal(mapped.sourceRowRef, '1:abc123');

  const block = buildBlock([row({ rowKey: 'obs-1' })]);
  assert.equal(block.provenance.runId, 'run-doae-1');
  assert.equal(block.provenance.runStatus, 'succeeded');
  assert.equal(block.provenance.adapterVersion, 'doae-production-subdistrict/1.0.0');
  assert.equal(block.provenance.payloadSha256, 'deadbeefsha');
  assert.deepEqual(block.provenance.revisionIds, ['rev-2566']);
});

test('the reference tabs/meta envelope stays metadata_only (DOAE block is a sibling only)', async () => {
  const cropsRoute = await import('../app/api/v1/crops/route.ts');
  const soilRoute = await import('../app/api/v1/soil/route.ts');

  const cropsRes = await cropsRoute.GET(new Request(new URL('/api/v1/crops', 'http://hub.local')));
  assert.equal(cropsRes.status, 200);
  assert.equal(cropsRes.headers.get('cache-control'), 'no-store');
  const cropsBody = await cropsRes.json();
  // existing reference contract is untouched
  assert.equal(cropsBody.meta.access, 'metadata_only');
  assert.equal(cropsBody.meta.availability, 'metadata_only');
  assert.deepEqual(cropsBody.meta.sourceIds, ['oae', 'doae']);
  assert.equal(cropsBody.meta.datasetVersion, 'crops-reference-v2');
  assert.equal(cropsBody.data.length, 6, 'reference tabs stay a 6-entry array');
  // the DOAE block rides alongside it
  assert.equal(cropsBody.doaeProduction.sample, false);
  assert.equal(cropsBody.doaeProduction.resourceKey, SHORT_KEY);

  const soilRes = await soilRoute.GET(new Request(new URL('/api/v1/soil', 'http://hub.local')));
  assert.equal(soilRes.status, 200);
  const soilBody = await soilRes.json();
  assert.equal(soilBody.meta.access, 'metadata_only');
  assert.deepEqual(soilBody.meta.sourceIds, ['ldd', 'doae']);
  assert.equal(soilBody.data.totalSeries, 7, 'reference soil rows untouched');
  assert.equal(soilBody.doaeProduction.sample, false);
});
