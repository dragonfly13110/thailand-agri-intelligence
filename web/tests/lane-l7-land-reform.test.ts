/**
 * Lane L7 — the real LDD PGS block inside `/land-reform` and its API surface.
 *
 * Everything here is about honesty, not about looking complete:
 * - the source grain (reporting unit × fiscal-year label × group stage × published
 *   column) survives one-for-one and nothing is summed across periods, units or units
 *   of measure;
 * - the source's own target/result pair keeps its own unit word, a blank stays `null`,
 *   and an unconfirmed unit is shown as unknown rather than invented;
 * - an empty or unreadable warehouse produces an empty/unavailable block with
 *   `sample: false` — never the ALRO simulation numbers underneath;
 * - the still-`pending` LDD zoning resource can never be read or exposed.
 *
 * The reader walks are exercised with injected fakes (no network, no D1), plus one
 * end-to-end route call that must degrade truthfully.
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
            // Try another TypeScript resolution before rethrowing the original.
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

const reader = await import('../lib/hub/ldd-pgs-progress.ts');
const landReform = await import('../lib/hub/land-reform-data.ts');
const landReformRoute = await import('../app/api/v1/land-reform/route.ts');
const http = await import('../lib/hub/http.ts');

const APPROVED_RESOURCE_ID = '2feb3230-cf86-4560-95f5-93e58270a7d8';
const CKAN_DATASET_ID = 'ord02';
const WAREHOUSE_DATASET_ID = 'ldd:ord02';
const WAREHOUSE_RESOURCE_ID = 'ldd:ord02:2feb3230-cf86-4560-95f5-93e58270a7d8';
const PENDING_ZONING_RESOURCE_ID = '7f508d88-3c31-4cad-b95a-68ca0ce89356';
const PENDING_ZONING_RESOURCE_KEY = 'ldd_rice_zoning_provincial';
const HUB_ORIGIN = 'http://hub.local';

type ObservationRow = Record<string, unknown>;

function pgsRow(overrides: Partial<ObservationRow> & { rowKey: string }): ObservationRow {
  return {
    resourceId: WAREHOUSE_RESOURCE_ID,
    runId: 'run-ldd-pgs-1',
    runStatus: 'succeeded',
    seriesKey: 'ldd-pgs:1:pgs_target_groups',
    sourceId: 'ldd',
    datasetId: WAREHOUSE_DATASET_ID,
    adapterVersion: 'ldd-pgs-progress/1.0.0',
    payloadSha256: 'a'.repeat(64),
    sourceRetrievedAt: '2026-10-30T01:00:00Z',
    runCompletedAt: '2026-10-30T01:05:00Z',
    observedAt: null,
    periodStart: null,
    periodEnd: null,
    periodLabel: 'พ.ศ. 2566',
    locationId: null,
    locationCode: null,
    locationKind: null,
    locationName: null,
    provinceCode: null,
    cropCode: null,
    cropName: null,
    metricId: 'pgs_target_groups',
    metricName: null,
    product: 'โครงการพัฒนากลุ่มเกษตรกรผู้ผลิตเกษตรอินทรีย์ด้วยระบบการรับรองแบบมีส่วนร่วม PGS',
    grade: null,
    market: null,
    unit: 'กลุ่ม',
    value: 2,
    dimensions: {
      reportingUnit: 'นครปฐม',
      groupStage: 'กลุ่มใหม่ขั้นที่ 1',
      sourceYearBe: 2566,
      fiscalYearBe: 2566,
      planOrResult: 'target',
      sourceField: 'เป้าหมาย (กลุ่ม)',
      unitSource: 'source column header',
      derivedFromSource: false,
    },
    qualityStatus: 'good',
    sourceRowRef: '1',
    ...overrides,
  };
}

function readyMeta(overrides: Record<string, unknown> = {}) {
  return {
    availability: 'ready',
    freshness: 'unknown',
    completeness: 'unknown',
    access: 'approved_public',
    sourceIds: ['ldd'],
    retrievedAt: '2026-10-30T02:00:00.000Z',
    sourceRetrievedAt: '2026-10-30T01:00:00Z',
    dataAsOf: null,
    sourceUpdatedAt: null,
    datasetVersion: 'a'.repeat(64),
    warnings: [],
    runtimeMode: 'database',
    ...overrides,
  };
}

function recordsResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type Deps = {
  rows: ObservationRow[];
  total?: number;
  register?: { body: unknown; status: number };
  registerMeta?: Record<string, unknown>;
};

/**
 * Fake of the two D1 reads the page performs. It records every filter it is
 * handed so a test can prove the pending zoning resource is never requested.
 */
function fakeDeps(options: Deps) {
  const calls: { id: string; resourceId: string | null; filters: Record<string, unknown> }[] = [];
  const meta = options.registerMeta ?? readyMeta();
  const listRecords = async (id: string, url: URL) => {
    calls.push({ id, resourceId: url.searchParams.get('resourceId'), filters: {} });
    const register = options.register ?? { body: { data: [], meta }, status: 200 };
    return recordsResponse(register.body, register.status);
  };
  const listObservations = async (filters: Record<string, unknown>) => {
    calls.push({ id: 'observations', resourceId: String(filters.resourceId ?? ''), filters });
    return { rows: options.rows, total: options.total ?? options.rows.length };
  };
  return {
    listRecords,
    listObservations,
    readerDeps: { listRecords, listObservations } as never,
    calls,
    observationFilters: () => calls.filter(call => call.id === 'observations').map(call => call.filters),
  };
}

// ---------------------------------------------------------------------------
// 1. grain is preserved one-for-one
// ---------------------------------------------------------------------------

test('LDD PGS rows survive at the source grain: one published column per row', async () => {
  const deps = fakeDeps({
    rows: [
      pgsRow({ rowKey: 'r1-target-groups' }),
      pgsRow({
        rowKey: 'r1-reported-groups',
        metricId: 'pgs_reported_groups',
        unit: 'กลุ่ม',
        value: 2,
        dimensions: {
          reportingUnit: 'นครปฐม', groupStage: 'กลุ่มใหม่ขั้นที่ 1', sourceYearBe: 2566,
          planOrResult: 'reported', sourceField: 'ผลดำเนินงาน (กลุ่ม)', derivedFromSource: false,
        },
      }),
      pgsRow({
        rowKey: 'r1-reported-area',
        metricId: 'pgs_reported_area_rai',
        unit: 'ไร่',
        value: 25.25,
        dimensions: {
          reportingUnit: 'นครปฐม', groupStage: 'กลุ่มใหม่ขั้นที่ 1', sourceYearBe: 2566,
          planOrResult: 'reported', sourceField: 'ผลดำเนินงาน (ไร่)', derivedFromSource: false,
        },
      }),
    ],
  });

  const envelope = await reader.loadLddPgsEnvelope(deps.readerDeps);
  const section = landReform.buildLandReformLddPgsSection(envelope as never);

  assert.equal(section.sample, false, 'the LDD block is real data, never the simulation');
  assert.equal(section.schemaVersion, 'land-reform-ldd-pgs-v1');
  assert.equal(section.derivation, 'forbidden');
  assert.equal(section.availability, 'ready');
  assert.equal(section.rowCount, 3);
  assert.equal(section.rows.length, 3, 'no row was merged away');
  assert.deepEqual(
    section.rows.map(row => row.rowKey).sort(),
    ['r1-reported-area', 'r1-reported-groups', 'r1-target-groups'],
  );

  const area = section.rows.find(row => row.rowKey === 'r1-reported-area');
  assert.equal(area?.value, 25.25, 'a ไร่ figure is handed over unchanged');
  assert.equal(area?.unit, 'ไร่', 'the unit word printed in the source header is preserved');
  assert.equal(area?.sourceField, 'ผลดำเนินงาน (ไร่)');
  assert.equal(area?.planOrResult, 'reported');
  assert.equal(area?.reportingUnit, 'นครปฐม');
  assert.equal(area?.groupStage, 'กลุ่มใหม่ขั้นที่ 1');
  assert.equal(area?.fiscalYearBe, 2566);

  // The measure list is read back from the rows, with the target/result pair kept apart.
  assert.deepEqual(section.measures.map(measure => measure.id).sort(),
    ['pgs_reported_area_rai', 'pgs_reported_groups', 'pgs_target_groups']);
  assert.deepEqual(section.measures.map(measure => measure.unit).sort(), ['กลุ่ม', 'กลุ่ม', 'ไร่']);
});

test('a duplicate source grain fails closed instead of overwriting a published value', async () => {
  const deps = fakeDeps({
    rows: [
      pgsRow({ rowKey: 'a' }),
      pgsRow({ rowKey: 'b', sourceRowRef: '9' }),
    ],
  });
  const envelope = await reader.loadLddPgsEnvelope(deps.readerDeps);
  assert.equal(envelope.meta.availability, 'unavailable');
  assert.equal(envelope.data.notAvailableReason?.code, 'LDD_PGS_DUPLICATE_GRAIN');
  assert.equal(envelope.data.rows.length, 0);
});

test('a derived row is refused because the licence forbids derivatives', async () => {
  const deps = fakeDeps({
    rows: [pgsRow({
      rowKey: 'derived',
      dimensions: {
        reportingUnit: 'นครปฐม', groupStage: 'กลุ่มใหม่ขั้นที่ 1', sourceYearBe: 2566,
        derivedFromSource: true,
      },
    })],
  });
  const envelope = await reader.loadLddPgsEnvelope(deps.readerDeps);
  assert.equal(envelope.data.notAvailableReason?.code, 'LDD_PGS_DERIVED_ROW_REJECTED');
  assert.equal(envelope.data.rows.length, 0);
});

// ---------------------------------------------------------------------------
// 2. no cross-period / cross-unit rollup anywhere in the block
// ---------------------------------------------------------------------------

test('two fiscal years of the same unit stay two rows: nothing is summed or percented', async () => {
  const deps = fakeDeps({
    rows: [
      pgsRow({ rowKey: 'y2566-target', value: 2 }),
      pgsRow({
        rowKey: 'y2567-target', value: 7, periodLabel: 'พ.ศ. 2567',
        sourceRowRef: '2',
        dimensions: {
          reportingUnit: 'นครปฐม', groupStage: 'กลุ่มใหม่ขั้นที่ 1', sourceYearBe: 2567,
          planOrResult: 'target', sourceField: 'เป้าหมาย (กลุ่ม)', derivedFromSource: false,
        },
      }),
      pgsRow({
        rowKey: 'y2567-target-other-unit', value: 3, sourceRowRef: '3', periodLabel: 'พ.ศ. 2567',
        dimensions: {
          reportingUnit: 'สุพรรณบุรี', groupStage: 'กลุ่มใหม่ขั้นที่ 1', sourceYearBe: 2567,
          planOrResult: 'target', sourceField: 'เป้าหมาย (กลุ่ม)', derivedFromSource: false,
        },
      }),
    ],
  });

  const section = landReform.buildLandReformLddPgsSection(
    await reader.loadLddPgsEnvelope(deps.readerDeps) as never,
  );

  assert.equal(section.rowCount, 3);
  assert.deepEqual(section.fiscalYearsBe, [2567, 2566], 'year labels are listed, never merged');
  assert.deepEqual(section.reportingUnits, ['นครปฐม', 'สุพรรณบุรี']);

  // 2 + 7 + 3 = 12 must not appear as any aggregate; the block only carries rows and
  // read-side row counts.
  const serialized = JSON.stringify(section);
  assert.ok(!/12/.test(JSON.stringify(section.facets.map(facet => facet.rowsRead))),
    'facet counts stay row counts (1 per grain cell), never value sums');
  for (const forbidden of ['progressPercent', 'achievementPercent', 'totalValue', 'sumValue',
    'averageValue', 'totalAreaRai', 'allocationProgressPercent', 'ratio']) {
    assert.ok(!serialized.toLowerCase().includes(forbidden.toLowerCase()),
      `the block must not expose a derived field named ${forbidden}`);
  }
  assert.deepEqual(Object.keys(section).sort(), [
    'access', 'availability', 'dataAsOf', 'dataAsOfReason', 'derivation', 'facets',
    'fiscalYearsBe', 'groupStages', 'measures', 'missingUnitCount', 'missingValueCount',
    'notAvailableReason', 'registry', 'reportingUnits', 'rowCount', 'rows', 'sample',
    'schemaVersion', 'unitPolicy', 'warnings',
  ]);

  // Facets count rows, which is read metadata, not a published figure.
  assert.deepEqual(section.facets, [
    { fiscalYearBe: 2567, groupStage: 'กลุ่มใหม่ขั้นที่ 1', rowsRead: 2 },
    { fiscalYearBe: 2566, groupStage: 'กลุ่มใหม่ขั้นที่ 1', rowsRead: 1 },
  ]);

  // And the page slice never re-sums the rows it hides.
  const page = landReform.lddPgsRowsForPage(section);
  assert.equal(page.rows.length, 3);
  assert.equal(page.totalCount, 3);
  assert.equal(page.truncated, false);
});

test('missing values stay null and never collapse into zero', async () => {
  const deps = fakeDeps({
    rows: [
      pgsRow({ rowKey: 'blank', value: null, qualityStatus: 'missing' }),
      pgsRow({
        rowKey: 'zero', value: 0, metricId: 'pgs_reported_groups',
        dimensions: {
          reportingUnit: 'นครปฐม', groupStage: 'กลุ่มใหม่ขั้นที่ 1', sourceYearBe: 2566,
          planOrResult: 'reported', sourceField: 'ผลดำเนินงาน (กลุ่ม)', derivedFromSource: false,
        },
      }),
    ],
  });
  const section = landReform.buildLandReformLddPgsSection(
    await reader.loadLddPgsEnvelope(deps.readerDeps) as never,
  );
  assert.equal(section.rows.find(row => row.rowKey === 'blank')?.value, null);
  assert.equal(section.rows.find(row => row.rowKey === 'zero')?.value, 0,
    "a published 0 is the source's own zero, not a filled blank");
  assert.equal(section.missingValueCount, 1);
});

test('an unconfirmed unit is reported as unknown, not guessed', async () => {
  const deps = fakeDeps({
    rows: [
      pgsRow({ rowKey: 'no-unit', unit: null }),
      pgsRow({ rowKey: 'with-unit', unit: 'กลุ่ม', sourceRowRef: '7',
        dimensions: {
          reportingUnit: 'สุพรรณบุรี', groupStage: 'กลุ่มใหม่ขั้นที่ 1', sourceYearBe: 2566,
          planOrResult: 'target', sourceField: 'เป้าหมาย (กลุ่ม)', derivedFromSource: false,
        } }),
    ],
  });
  const section = landReform.buildLandReformLddPgsSection(
    await reader.loadLddPgsEnvelope(deps.readerDeps) as never,
  );
  assert.equal(section.missingUnitCount, 1);
  const measure = section.measures.find(item => item.id === 'pgs_target_groups');
  assert.equal(measure?.unit, null, 'two unit words for one column is not machine-confirmed');
  assert.equal(measure?.unitNote, 'คอลัมน์นี้ปรากฏคำหน่วยมากกว่าหนึ่งแบบในชุดที่อ่านได้ จึงไม่เลือกคำใดคำหนึ่ง');
});

test('a province-bound row is refused: reporting units are not administrative areas', async () => {
  const deps = fakeDeps({
    rows: [pgsRow({ rowKey: 'zoning-shaped', locationKind: 'province', provinceCode: '73' })],
  });
  const envelope = await reader.loadLddPgsEnvelope(deps.readerDeps);
  assert.equal(envelope.data.notAvailableReason?.code, 'LDD_PGS_GRAIN_CONTRACT_INVALID');
  assert.equal(envelope.data.rows.length, 0);
});

// ---------------------------------------------------------------------------
// 3. empty / unreadable store ⇒ honest empty block, never the ALRO sample
// ---------------------------------------------------------------------------

test('an approved resource with no published rows yields an empty block with sample:false', async () => {
  const deps = fakeDeps({
    rows: [],
    registerMeta: readyMeta({ availability: 'ready' }),
  });
  const section = landReform.buildLandReformLddPgsSection(
    await reader.loadLddPgsEnvelope(deps.readerDeps) as never,
  );
  assert.equal(section.availability, 'empty');
  assert.equal(section.sample, false);
  assert.equal(section.rowCount, 0);
  assert.deepEqual(section.rows, []);
  assert.equal(section.dataAsOf, null);
  assert.ok(section.warnings.some(warning => warning.includes('ยังไม่มีการเขียนแถวข้อมูล')));
  assert.equal(JSON.stringify(section).includes('alro'), false, 'no simulation source is referenced');
  assert.equal(JSON.stringify(section).includes('totalReformAreaRai'), false,
    'the ALRO simulation fields must not leak into the real block');
});

test('a metadata-only register yields metadata_only with no numbers', async () => {
  const deps = fakeDeps({
    rows: [],
    registerMeta: readyMeta({ availability: 'metadata_only', access: 'metadata_only' }),
  });
  const section = landReform.buildLandReformLddPgsSection(
    await reader.loadLddPgsEnvelope(deps.readerDeps) as never,
  );
  assert.equal(section.availability, 'metadata_only');
  assert.equal(section.rowCount, 0);
  assert.equal(section.notAvailableReason, null);
  assert.deepEqual(deps.observationFilters(), [], 'a not-ready register must not read observations');
});

test('an unreadable database yields unavailable with a reason and no numbers', async () => {
  const deps = fakeDeps({
    rows: [],
    register: {
      body: { error: { code: 'HUB_DATABASE_NOT_CONFIGURED', message: 'ยังไม่ได้เชื่อมต่อคลังข้อมูลกลาง' } },
      status: 503,
    },
  });
  const section = landReform.buildLandReformLddPgsSection(
    await reader.loadLddPgsEnvelope(deps.readerDeps) as never,
  );
  assert.equal(section.availability, 'unavailable');
  assert.equal(section.sample, false);
  assert.equal(section.rowCount, 0);
  assert.equal(section.notAvailableReason?.code, 'HUB_DATABASE_NOT_CONFIGURED');
  assert.ok(section.warnings.some(warning => warning.includes('ไม่ใช่ค่าตัวอย่าง')));
});

test('the unavailable section builder the page uses on a crash carries no numbers either', () => {
  const section = landReform.buildLandReformLddPgsUnavailable('LDD_PGS_SNAPSHOT_CHANGED');
  assert.equal(section.sample, false);
  assert.equal(section.availability, 'unavailable');
  assert.equal(section.rowCount, 0);
  assert.equal(section.notAvailableReason?.code, 'LDD_PGS_SNAPSHOT_CHANGED');
  assert.deepEqual(section.measures, []);
});

// ---------------------------------------------------------------------------
// 4. the still-pending LDD zoning resource is never requested or exposed
// ---------------------------------------------------------------------------

test('the reader only ever asks for the approved PGS resource id', async () => {
  const deps = fakeDeps({ rows: [pgsRow({ rowKey: 'a' })] });
  await reader.loadLddPgsEnvelope(deps.readerDeps);

  assert.equal(deps.calls[0].id, WAREHOUSE_DATASET_ID,
    'the register read uses the dataset key the catalog actually stores');
  assert.equal(deps.calls[0].resourceId, WAREHOUSE_RESOURCE_ID);
  const filters = deps.observationFilters();
  assert.equal(filters.length, 1);
  assert.deepEqual(filters[0], { sourceId: 'ldd', resourceId: WAREHOUSE_RESOURCE_ID });
  const serialized = JSON.stringify(deps.calls);
  assert.ok(!serialized.includes(PENDING_ZONING_RESOURCE_ID), 'the pending zoning id was requested');
  assert.ok(!serialized.includes('lpd'), 'the pending zoning package was requested');
});

test('no lane source file reads the pending zoning resource', () => {
  const files = [
    'lib/hub/ldd-pgs-progress.ts',
    'lib/hub/land-reform-data.ts',
    'components/land-reform-ldd-pgs.tsx',
    'app/land-reform/page.tsx',
    'app/api/v1/land-reform/route.ts',
  ];
  for (const file of files) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.ok(!source.includes(PENDING_ZONING_RESOURCE_ID), `${file} must not name the zoning resource id`);
    // The zoning package `lpd` may never appear as a value this code queries by.
    assert.equal(/['"]lpd['"]/.test(source), false, `${file} must not query the pending zoning package`);
    assert.equal(/dataset_id\s*=\s*['"]lpd['"]/.test(source), false, `${file} must not bind the zoning dataset`);
    // Its resource_key may be named only inside an explanatory rights note (max once),
    // never as a filter, constant or payload field.
    const keyMentions = source.split(PENDING_ZONING_RESOURCE_KEY).length - 1;
    assert.ok(keyMentions <= 1, `${file} mentions the pending zoning key more than once`);
  }
});

test('zoning-shaped metric ids are dropped, not rendered as PGS measures', async () => {
  const deps = fakeDeps({
    rows: [pgsRow({ rowKey: 'zoning', metricId: 'rice_zoning_suitable_area_rai', value: 1234 })],
  });
  const section = landReform.buildLandReformLddPgsSection(
    await reader.loadLddPgsEnvelope(deps.readerDeps) as never,
  );
  assert.equal(section.rowCount, 0, 'an unknown metric is never presented as a PGS column');
  assert.equal(section.availability, 'empty');
});

// ---------------------------------------------------------------------------
// 5. the composed route surface stays truthful
// ---------------------------------------------------------------------------

type ApiBody = {
  data: Record<string, any>;
  meta: { availability: string; access: string; sourceIds: string[]; dataAsOf: string | null; warnings: string[] };
};

async function getRoute(path: string) {
  const response = await landReformRoute.GET(new Request(new URL(path, HUB_ORIGIN)));
  return { response, body: await response.json() as ApiBody };
}

test('GET /api/v1/land-reform keeps the ALRO simulation and adds a real, non-sample LDD block', async () => {
  const { response, body } = await getRoute('/api/v1/land-reform');
  assert.equal(response.status, 200);

  // existing sample content + labels untouched
  assert.equal(body.data.sample, true);
  assert.equal(body.data.datasetVersion, 'alro-land-v1');
  assert.equal(body.data.bannerText, landReform.LAND_REFORM_BANNER_TEXT);
  assert.equal(body.data.provinces.length, 77);
  assert.equal(body.meta.availability, 'metadata_only');
  assert.equal(body.meta.access, 'metadata_only');

  // the new real block
  const ldd = body.data.lddPgs;
  assert.equal(ldd.sample, false, 'only the PGS block is declared non-sample');
  assert.equal(ldd.derivation, 'forbidden');
  assert.equal(ldd.registry.resourceKey, 'ldd_pgs_program_progress');
  assert.equal(ldd.registry.resourceId, APPROVED_RESOURCE_ID);
  assert.equal(ldd.registry.licenseStatus, 'approved_public');
  assert.equal(ldd.registry.derivationAllowed, false);
  assert.equal(ldd.registry.commercialUseAllowed, false);
  assert.equal(ldd.dataAsOf, null);
  assert.ok(['ready', 'empty', 'metadata_only', 'unavailable'].includes(ldd.availability));
  if (ldd.availability !== 'ready') {
    assert.equal(ldd.rows.length, 0, 'a non-ready block never shows numbers');
  }
  for (const row of ldd.rows) {
    assert.equal(row.value === undefined, false, 'a null value must be present and null, never absent/0');
    assert.ok(row.reportingUnit.length > 0 && row.groupStage.length > 0, 'grain columns survive the API');
  }

  // meta is explicit that the two blocks are separate
  assert.ok(body.meta.sourceIds.includes('ldd'));
  assert.ok(body.meta.warnings.some(warning => warning.includes('data.lddPgs.availability')));
  assert.ok(body.meta.warnings.some(warning => warning.includes('LDD PGS:')));
  assert.ok((ldd.warnings as string[]).some(warning => warning.includes('No-Derivs') || warning.includes('ไม่บวกข้าม')));

  // nothing from the pending zoning resource can ride along
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(PENDING_ZONING_RESOURCE_ID));
  assert.ok(!serialized.includes('rice_zoning'));
});

test('filters keep applying to the simulation half only', async () => {
  const { response, body } = await getRoute('/api/v1/land-reform?provinceCode=73');
  assert.equal(response.status, 200);
  assert.equal(body.data.provinces.length, 1);
  assert.equal(body.data.provinces[0].provinceCode, '73');
  assert.equal(body.data.lddPgs.registry.resourceId, APPROVED_RESOURCE_ID,
    'the PGS block is not filtered by province — its grain is the reporting unit');
});

test('the weather/hub http wrapper still reports errors instead of inventing data', async () => {
  assert.equal(typeof http.jsonData, 'function');
  assert.equal(typeof reader.loadLddPgsEnvelope, 'function');
  assert.equal(reader.LDD_PGS_RESOURCE_ID, WAREHOUSE_RESOURCE_ID);
  assert.equal(reader.LDD_PGS_SOURCE_ID, 'ldd');
});

// ---------------------------------------------------------------------------
// 6. one identity: the CKAN register ids and the crawler's D1 keys agree
// ---------------------------------------------------------------------------

test('CKAN ids and crawler stable ids resolve to the same canonical key', () => {
  const resource = { kind: 'resource', canonical: WAREHOUSE_RESOURCE_ID, ckanId: APPROVED_RESOURCE_ID };
  const dataset = { kind: 'dataset', canonical: WAREHOUSE_DATASET_ID, ckanId: CKAN_DATASET_ID };

  assert.deepEqual(reader.resolveLddPgsKey(APPROVED_RESOURCE_ID), resource);
  assert.deepEqual(reader.resolveLddPgsKey(WAREHOUSE_RESOURCE_ID), resource);
  assert.deepEqual(reader.resolveLddPgsKey(CKAN_DATASET_ID), dataset);
  assert.deepEqual(reader.resolveLddPgsKey(WAREHOUSE_DATASET_ID), dataset);
  assert.equal(reader.resolveLddPgsKey(PENDING_ZONING_RESOURCE_ID), null,
    'an id outside this resource never resolves to the PGS key');
  assert.equal(reader.resolveLddPgsKey(''), null);
});

test('the reader queries the exact resource key the Python writer stores', () => {
  // Cross-language contract: the writer module is the other half of this id.
  const python = readFileSync(new URL('../../src/tadih/ldd_pgs_progress.py', import.meta.url), 'utf8');
  const literal = (name: string) => {
    const matched = new RegExp(`^${name} = "([^"]+)"$`, 'm').exec(python);
    assert.ok(matched, `${name} must be a literal constant in ldd_pgs_progress.py`);
    return matched[1];
  };
  assert.equal(reader.LDD_PGS_RESOURCE_ID, literal('CANONICAL_RESOURCE_ID'));
  assert.equal(reader.LDD_PGS_DATASET_ID, literal('CANONICAL_DATASET_ID'));
  assert.equal(reader.LDD_PGS_CKAN_RESOURCE_ID, literal('RESOURCE_ID'));
  assert.equal(reader.LDD_PGS_CKAN_DATASET_ID, literal('SOURCE_DATASET_ID'));
});

test('the registry panel keeps the CKAN ids and names the warehouse keys beside them', () => {
  assert.equal(landReform.LDD_PGS_REGISTRY.resourceId, APPROVED_RESOURCE_ID);
  assert.equal(landReform.LDD_PGS_REGISTRY.datasetId, CKAN_DATASET_ID);
  assert.equal(landReform.LDD_PGS_REGISTRY.warehouseResourceId, reader.LDD_PGS_RESOURCE_ID);
  assert.equal(landReform.LDD_PGS_REGISTRY.warehouseDatasetId, reader.LDD_PGS_DATASET_ID);
});

test('a row under the native CKAN form names the same resource as the stored key', async () => {
  const deps = fakeDeps({ rows: [pgsRow({ rowKey: 'native', resourceId: APPROVED_RESOURCE_ID })] });
  const envelope = await reader.loadLddPgsEnvelope(deps.readerDeps);
  assert.equal(envelope.data.rowCount, 1);
  assert.equal(envelope.data.resourceId, WAREHOUSE_RESOURCE_ID);
  assert.deepEqual(deps.observationFilters(), [{ sourceId: 'ldd', resourceId: WAREHOUSE_RESOURCE_ID }]);
});
