/**
 * Lane L2 regression tests — CPD agricultural-cooperative counts (real read path).
 *
 * Pins the contract added by lane L2:
 * - `lib/hub/cpd-coop-counts.ts` reads the approved CPD resource from D1 and keeps
 *   the source grain (province label x reporting office x source status column x
 *   opaque source-year label); missing stays null, zeros stay zero, nothing is summed.
 * - `lib/hub/cooperatives-data.ts` exposes the real read path (sample:false) plus an
 *   internal guard, while the deterministic sample engine keeps its own envelope.
 * - `app/api/v1/cooperatives/cpd-counts/route.ts` fails closed (503) on contract drift
 *   or an unreadable store, and never falls back to sample numbers.
 *
 * Rows are derived from tests/fixtures/cpd_agricultural_coop_counts.csv through the same
 * crosswalk/digest rules the Python writer uses, so the assertions read like stored rows.
 * A fake D1 is installed on globalThis.env.DB; no network and no real database is touched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const coop = await import('../lib/hub/cooperatives-data.ts');
const cpd = await import('../lib/hub/cpd-coop-counts.ts');
const realRoute = await import('../app/api/v1/cooperatives/cpd-counts/route.ts');
const sampleRoute = await import('../app/api/v1/cooperatives/route.ts');

const HUB_ORIGIN = 'http://hub.local';
const RUN_ID = 'run-cpd-coop-0001';
const PAYLOAD_SHA = 'c'.repeat(64);
const SOURCE_RETRIEVED_AT = '2026-10-28T02:00:00.000Z';
const COMPLETED_AT = '2026-10-28T02:01:00.000Z';
const SOURCE_YEAR_LABEL = '2568';
const MEASURE_NAME = 'จำนวนสหกรณ์การเกษตรตามสถานะต้นทาง';
const PRODUCT_LABEL = 'จำนวนสหกรณ์การเกษตร';

/* ---------------- fixture-driven row builder (mirrors the Python writer) ---------------- */

const CSV_TEXT = readFileSync(new URL('../../tests/fixtures/cpd_agricultural_coop_counts.csv', import.meta.url), 'utf8');
const PROVINCE_LINES = readFileSync(new URL('../../config/provinces.csv', import.meta.url), 'utf8').split(/\r?\n/);
const AREA_CODE_BY_NAME = new Map<string, string>();
for (const line of PROVINCE_LINES.slice(1)) {
  const columns = line.split(',');
  if (columns.length >= 3 && columns[2].length > 0) AREA_CODE_BY_NAME.set(columns[2], columns[0]);
}

const CSV_HEADER = CSV_TEXT.split(/\r?\n/)[0].replace(/^/, '').trim();
const SOURCE_COLUMNS = CSV_HEADER.split(',');
const STATUS_COLUMNS = SOURCE_COLUMNS.slice(2);

interface SourceCsvRow {
  provinceLabel: string;
  provinceName: string;
  areaCode: string;
  reportingUnitLabel: string;
  reportingUnit: string;
  rawCounts: string[];
  counts: Array<number | null>;
  sourceRowRef: string;
  officeDigest: string;
}

const SOURCE_ROWS: SourceCsvRow[] = CSV_TEXT.split(/\r?\n/).slice(1).filter((line) => line.trim().length > 0)
  .map((line) => {
    const cells = line.split(',');
    const provinceLabel = cells[0];
    const reportingUnitLabel = cells[1];
    const rawCounts = cells.slice(2, 5);
    const provinceName = provinceLabel.trim();
    const areaCode = AREA_CODE_BY_NAME.get(provinceName);
    if (areaCode === undefined) throw new Error(`fixture province label has no reference code: ${provinceName}`);
    return {
      provinceLabel,
      provinceName,
      areaCode,
      reportingUnitLabel,
      reportingUnit: reportingUnitLabel.trim(),
      rawCounts,
      counts: rawCounts.map((cell) => (cell.trim() === '' ? null : Number(cell.trim()))),
      sourceRowRef: 'sha256:' + createHash('sha256')
        .update(JSON.stringify([provinceLabel, reportingUnitLabel, ...rawCounts]), 'utf8')
        .digest('hex'),
      officeDigest: createHash('sha256').update(reportingUnitLabel.trim(), 'utf8').digest('hex'),
    };
  });

const RESOURCE_METADATA = JSON.stringify({
  resourceKey: 'cpd_agricultural_coop_counts',
  attribution: 'ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ',
  attributionUrl: 'https://catalog-cpd.data.go.th/api/3/action/package_show?id=' + cpd.CPD_COOP_DATASET_ID,
  completeness: 'complete',
  publicationAuthorization: {
    basis: 'project_owner_instruction',
    document: 'AGENTS.md',
    section: 3,
    scope: ['fetch', 'process', 'store_in_D1', 'public_numeric_display'],
    source_license_verified: false,
  },
  sourceLicenseReview: {
    status: 'unverified',
    unresolved: ['source licence terms unverified', 'commercial use unconfirmed'],
    declaredLicense: {
      license_id: 'Creative Commons Attributions',
      license_url: null,
      version: null,
    },
  },
});

function gateFields(recordsWritten: number = SOURCE_ROWS.length * STATUS_COLUMNS.length) {
  return {
    resourceId: cpd.CPD_COOP_RESOURCE_ID,
    accessStatus: 'approved_public',
    projectPublicationApproved: 1,
    activeRunId: RUN_ID,
    resourceName: PRODUCT_LABEL,
    resourceGrain: 'province label × reporting-unit label × source status; opaque source-year token',
    resourceUrl: cpd.CPD_COOP_RESOURCE_URL,
    resourceSourceUpdatedAt: null,
    resourceMetadata: RESOURCE_METADATA,
    datasetId: 'cpd:cpd_agricultural_coop_counts',
    sourceDatasetId: cpd.CPD_COOP_DATASET_ID,
    datasetTitle: PRODUCT_LABEL,
    datasetAccessStatus: 'approved_public',
    sourceId: 'cpd',
    sourceName: 'ศูนย์เทคโนโลยีสารสนเทศและการสื่อสาร/กลุ่มฐานข้อมูลสารสนเทศ',
    sourceAccessStatus: 'approved_public',
    runId: RUN_ID,
    runKind: 'numeric',
    runStatus: 'succeeded',
    payloadSha256: PAYLOAD_SHA,
    adapterVersion: 'cpd-agricultural-coop-counts/1.0.0',
    sourceRetrievedAt: SOURCE_RETRIEVED_AT,
    completedAt: COMPLETED_AT,
    recordsWritten,
  };
}

/** หนึ่งระเบียน = หนึ่งแถวของ LEFT JOIN observations ตามคอลัมน์ที่ SELECT_SQL กำหนด */
function observationRow(sourceIndex: number, statusIndex: number, overrides: Record<string, unknown> = {}) {
  const source = SOURCE_ROWS[sourceIndex];
  const status = cpd.CPD_COOP_SOURCE_STATUSES[statusIndex];
  const value = source.counts[statusIndex];
  const dimensions: Record<string, unknown> = {
    spatialSupport: 'province',
    dataKind: 'official',
    measure: status.metricId,
    sourceYearLabel: SOURCE_YEAR_LABEL,
    sourceYearLabelOrigin: 'resource_name',
    sourceYearLabelConvention: 'unknown',
    sourceProvinceLabel: source.provinceLabel,
    provinceCrosswalkMethod: 'exact name_th match in config/provinces.csv',
    reportingUnit: source.reportingUnit,
    reportingUnitSourceLabel: source.reportingUnitLabel,
    sourceStatus: status.sourceColumn,
  };
  return {
    ...gateFields(),
    ...overrides,
    rowKey: `cpd:coop:${source.areaCode}:${source.officeDigest}:${status.metricId}`,
    metricId: status.metricId,
    metricName: MEASURE_NAME,
    product: PRODUCT_LABEL,
    value: overrides.value === undefined ? value : overrides.value,
    unit: 'แห่ง',
    periodStart: null,
    periodEnd: null,
    periodLabel: SOURCE_YEAR_LABEL,
    locationId: `cpd:province:${source.areaCode}`,
    locationCode: `cpd:province:${source.areaCode}`,
    locationKind: 'province',
    locationName: source.provinceName,
    provinceCode: source.areaCode,
    dimensions: overrides.dimensions === undefined ? JSON.stringify(dimensions) : overrides.dimensions,
    qualityStatus: (overrides.value === undefined ? value : overrides.value) === null ? 'missing' : 'good',
    sourceRowRef: source.sourceRowRef,
  };
}

function allObservationRows(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let sourceIndex = 0; sourceIndex < SOURCE_ROWS.length; sourceIndex += 1) {
    for (let statusIndex = 0; statusIndex < STATUS_COLUMNS.length; statusIndex += 1) {
      rows.push(observationRow(sourceIndex, statusIndex));
    }
  }
  return rows;
}

/** แถว gates เพียงแถวเดียวเมื่อ LEFT JOIN ไม่มี observations (run ยังไม่มีระเบียนตัวเลข) */
function gateOnlyRow(recordsWritten: number) {
  return {
    ...gateFields(recordsWritten),
    rowKey: null, metricId: null, metricName: null, product: null, value: null, unit: null,
    periodStart: null, periodEnd: null, periodLabel: null, locationId: null, locationCode: null,
    locationKind: null, locationName: null, provinceCode: null, dimensions: null,
    qualityStatus: null, sourceRowRef: null,
  };
}

function is503(error: unknown, code?: string): boolean {
  const e = error as { status?: number; code?: string };
  return e.status === 503 && (code === undefined || e.code === code);
}

/* ---------------- tests ---------------- */

test('real CPD counts keep source grain, opaque year label and unconfirmed unit', () => {
  const envelope = coop.buildCpdCoopCountsEnvelope(allObservationRows());
  const data = envelope.data;

  assert.equal(data.sample, false);
  assert.equal(data.resourceKey, 'cpd_agricultural_coop_counts');
  assert.equal(data.unit, null, 'unit must stay null while the source does not state one');
  assert.equal(data.unitStatus, 'pending_official_confirmation');
  assert.deepEqual(data.storedUnitLabels, ['แห่ง'], 'the writer-stored label is exposed only for audit');
  assert.equal(data.sourceGrain, cpd.CPD_COOP_SOURCE_GRAIN);
  assert.deepEqual(data.availableSourceYearLabels, [SOURCE_YEAR_LABEL]);
  assert.equal(data.derivedTotalsProvided, false);
  assert.equal(data.coverageClaim, false);
  assert.equal(envelope.meta.availability, 'ready');
  assert.equal(envelope.meta.access, 'approved_public');
  assert.equal(envelope.meta.dataAsOf, null, 'an uninterpreted year token must never become a date');
  assert.equal(envelope.meta.datasetVersion, PAYLOAD_SHA);
  assert.equal(envelope.meta.sourceRetrievedAt, SOURCE_RETRIEVED_AT);
  assert.equal(envelope.meta.sourceUpdatedAt, null);
  assert.deepEqual(envelope.meta.sourceIds, ['cpd']);
  assert.equal(data.rows.length, SOURCE_ROWS.length * STATUS_COLUMNS.length);
  assert.ok(data.snapshot, 'a ready payload must name the run it actually read');
  assert.equal(data.snapshot.recordsWritten, data.rows.length);
  assert.equal(data.snapshot.runId, RUN_ID);

  const first = data.rows[0];
  assert.equal(first.sourceYearLabel, SOURCE_YEAR_LABEL);
  assert.equal(first.unit, null);
  assert.equal(first.sourceStatusColumn, STATUS_COLUMNS[0]);
  assert.equal('provenance' in first, false, 'provenance belongs to the payload, never duplicated onto a row');

  // ทุกมิติของเกรนต้นทางต้องส่งขึ้นหน้าเว็บครบ ไม่มีช่องที่ถูกยุบ
  for (const row of data.rows) {
    assert.match(row.rowKey, /^cpd:coop:\d{2}:[0-9a-f]{64}:/);
    assert.equal(row.sourceYearLabel, SOURCE_YEAR_LABEL);
    assert.equal(row.unit, null);
    assert.ok(row.reportingUnit.length > 0);
    assert.ok(row.sourceProvinceLabel.length > 0);
  }

  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes('(ข้อมูลตัวอย่าง)'), false, 'sample records must not leak into the real payload');
  assert.equal(serialized.includes('CAMELS'), false);

  // การจัดเรียงต้องคงที่ (จังหวัด → หน่วยงานสังกัด → ลำดับคอลัมน์ต้นทาง)
  const again = JSON.stringify(coop.buildCpdCoopCountsEnvelope(allObservationRows()));
  assert.equal(again, serialized, 'repeat reads of the same rows must be byte-identical');
});

test('two independent reads of the same fixture are byte-identical and arrival-order free', () => {
  const canonicalText = JSON.stringify(coop.buildCpdCoopCountsEnvelope(allObservationRows()));

  // read #2 rebuilds every row object from the fixture again — same content, independent objects
  assert.equal(
    JSON.stringify(coop.buildCpdCoopCountsEnvelope(allObservationRows())),
    canonicalText,
    'a second independent read of the same fixture must produce the same bytes',
  );

  // arrival orders a real store may legitimately hand back; none of them may move a byte
  const block = STATUS_COLUMNS.length;
  const sourceRows = allObservationRows();
  const reversedBlocks: Record<string, unknown>[] = [];
  for (let start = sourceRows.length - block; start >= 0; start -= block) {
    reversedBlocks.push(...sourceRows.slice(start, start + block).reverse());
  }
  const statusMajor: Record<string, unknown>[] = [];
  for (let statusIndex = 0; statusIndex < block; statusIndex += 1) {
    statusMajor.push(...sourceRows.filter((_, index) => index % block === statusIndex));
  }
  const fullyReversed = [...sourceRows].reverse();

  assert.equal(reversedBlocks.length, sourceRows.length, 'the permutations keep every row');
  assert.equal(statusMajor.length, sourceRows.length, 'the permutations keep every row');
  for (const [label, permuted] of [
    ['blocked reverse', reversedBlocks],
    ['status-major grouping', statusMajor],
    ['fully reversed arrival', fullyReversed],
  ] as const) {
    assert.equal(JSON.stringify(coop.buildCpdCoopCountsEnvelope(permuted)), canonicalText,
      `${label}: row order must come from the declared total order, not from store arrival order`);
  }

  // no wall clock may sit inside the byte-stable payload
  const canonical = coop.buildCpdCoopCountsEnvelope(allObservationRows());
  assert.equal(canonical.meta.retrievedAt, null, 'the payload must be clock-free to stay byte-stable');
  assert.equal(canonicalText.includes('"retrievedAt":"'), false, 'no ISO serve-time stamp in the payload');
  assert.equal(canonical.meta.sourceRetrievedAt, SOURCE_RETRIEVED_AT, 'run time still comes from the stored run');
  assert.ok(canonical.data.snapshot, 'a ready payload names the run it read');
  assert.equal(canonical.data.snapshot.completedAt, COMPLETED_AT);

  // the declared order itself: province codes ascending, and inside one province+office block the
  // source status columns appear left-to-right exactly once (never mixed between offices)
  const codes = canonical.data.rows.map((row: { provinceCode: string }) => row.provinceCode);
  assert.deepEqual(codes, [...codes].sort(), 'province codes must be emitted in ascending code order');
  for (const row of canonical.data.rows) {
    assert.equal(row.sourceYearLabel, SOURCE_YEAR_LABEL);
  }
  const ordinal = (column: string) => STATUS_COLUMNS.indexOf(column);
  let previousRun = '';
  let expectedOrdinal = 0;
  for (const row of canonical.data.rows) {
    const run = `${row.provinceCode}|${row.reportingUnit}`;
    if (run !== previousRun) {
      previousRun = run;
      expectedOrdinal = 0;
    }
    assert.equal(ordinal(row.sourceStatusColumn), expectedOrdinal,
      `${run}: status columns must follow the source CSV order, office by office`);
    expectedOrdinal += 1;
  }
});

test('missing source cells stay null while reported zeros stay zero', () => {
  const envelope = coop.buildCpdCoopCountsEnvelope(allObservationRows());
  const values = envelope.data.rows.map((row: { value: number | null }) => row.value);

  assert.ok(values.includes(0), 'the fixture records real zeros; they must survive');
  assert.equal(values.includes(null), false, 'the shipped fixture has no empty cell, so no null appears');
  for (const row of envelope.data.rows) {
    assert.equal(row.qualityStatus, row.value === null ? 'missing' : 'good');
  }

  const withGap = allObservationRows();
  const gapIndex = withGap.findIndex((row) => row.metricId === 'agricultural_cooperative_count_dissolved');
  withGap[gapIndex] = {
    ...withGap[gapIndex],
    value: null,
    qualityStatus: 'missing',
  };
  const gapped = coop.buildCpdCoopCountsEnvelope(withGap);
  const gapRow = gapped.data.rows.find((row: { rowKey: string }) => row.rowKey === withGap[gapIndex].rowKey);
  assert.ok(gapRow, 'the gapped record must still be present in the payload');
  assert.equal(gapRow.value, null, 'a blank source cell must stay null, never 0');
  assert.equal(gapRow.qualityStatus, 'missing');
  assert.equal(gapped.data.counts.rowsMissing, 1);
  assert.equal(gapped.data.counts.rowsWithValue, gapped.data.rows.length - 1);
  assert.ok(gapped.data.warnings.join(' ').includes('null'));
});

test('payload exposes only row counts, never a value total', () => {
  const data = coop.buildCpdCoopCountsEnvelope(allObservationRows()).data;
  assert.deepEqual(Object.keys(data.counts).sort(), [
    'provinceCodeCount', 'reportingUnitCount', 'rowCount', 'rowsMissing',
    'rowsWithValue', 'sourceProvinceLabelCount', 'sourceStatusCount',
  ]);
  for (const value of Object.values(data.counts)) assert.equal(typeof value, 'number');
  assert.equal(data.counts.rowCount, data.rows.length);
  assert.equal(data.counts.sourceStatusCount, STATUS_COLUMNS.length);
  assert.equal(data.counts.provinceCodeCount, new Set(SOURCE_ROWS.map((row) => row.areaCode)).size);
});

test('filters narrow rows without inventing dates and unmatched filter is empty', () => {
  const rows = allObservationRows();
  const singleProvinceCode = SOURCE_ROWS[2].areaCode;
  const filtered = coop.buildCpdCoopCountsEnvelope(rows, { provinceCode: singleProvinceCode });
  assert.ok(filtered.data.rows.length > 0);
  for (const row of filtered.data.rows) assert.equal(row.provinceCode, singleProvinceCode);
  assert.equal(filtered.meta.availability, 'ready');
  assert.equal(filtered.data.counts.provinceCodeCount, 1);

  const oneStatus = coop.buildCpdCoopCountsEnvelope(rows, { sourceStatus: 'operating' });
  assert.equal(oneStatus.data.rows.length, SOURCE_ROWS.length);
  for (const row of oneStatus.data.rows) assert.equal(row.sourceStatus, 'operating');

  const unmatchedYear = coop.buildCpdCoopCountsEnvelope(rows, { sourceYearLabel: '2567' });
  assert.equal(unmatchedYear.meta.availability, 'empty');
  assert.deepEqual(unmatchedYear.data.rows, []);
  assert.equal(unmatchedYear.data.sample, false, 'an empty filter result must not turn into sample data');
  assert.equal(unmatchedYear.meta.datasetVersion, PAYLOAD_SHA, 'the run identity is still known');
  assert.equal(unmatchedYear.meta.dataAsOf, null);

  const unknownProvince = coop.buildCpdCoopCountsEnvelope(rows, { provinceCode: '99' });
  assert.equal(unknownProvince.meta.availability, 'empty');
  assert.deepEqual(unknownProvince.data.rows, []);
});

test('store without rows or without approval degrades to metadata_only, never sample', () => {
  const missing = coop.buildCpdCoopCountsEnvelope([]);
  assert.equal(missing.meta.availability, 'metadata_only');
  assert.equal(missing.meta.access, 'metadata_only');
  assert.deepEqual(missing.data.rows, []);
  assert.equal(missing.data.sample, false);
  assert.equal(missing.data.snapshot, null);
  assert.equal(missing.data.provenance.resourceId, cpd.CPD_COOP_RESOURCE_ID);
  assert.ok(missing.data.warnings.join(' ').includes('ไม่พบทรัพยากร'));
  assert.equal(JSON.stringify(missing.data).includes('(ข้อมูลตัวอย่าง)'), false);

  const notApproved = coop.buildCpdCoopCountsEnvelope(
    allObservationRows().map((row) => ({ ...row, accessStatus: 'pending' })),
  );
  assert.equal(notApproved.meta.availability, 'metadata_only');
  assert.deepEqual(notApproved.data.rows, []);
  assert.equal(notApproved.data.provenance.accessStatus, 'pending');

  const noRun = coop.buildCpdCoopCountsEnvelope([{ ...gateOnlyRow(0), activeRunId: null }]);
  assert.equal(noRun.meta.availability, 'metadata_only');
  assert.deepEqual(noRun.data.rows, []);
  assert.ok(noRun.data.warnings.join(' ').includes('ยังไม่มีรอบข้อมูล'));
});

test('approved run with zero records is empty and states that no rows exist', () => {
  const empty = coop.buildCpdCoopCountsEnvelope([gateOnlyRow(0)]);
  assert.equal(empty.meta.availability, 'empty');
  assert.equal(empty.meta.access, 'approved_public');
  assert.deepEqual(empty.data.rows, []);
  assert.equal(empty.data.snapshot, null, 'a zero-record run must not claim a numeric snapshot');
  assert.ok(empty.data.warnings.join(' ').includes('ไม่มีระเบียนตัวเลข'));
  assert.ok(empty.data.warnings.join(' ').includes('ตัวอย่าง'));
});

test('contract drift fails closed instead of mixing an unverified snapshot', () => {
  const rows = allObservationRows();

  assert.throws(() => coop.buildCpdCoopCountsEnvelope([
    rows[0],
    { ...rows[1], payloadSha256: 'd'.repeat(64) },
    ...rows.slice(2),
  ]), (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'));

  assert.throws(() => coop.buildCpdCoopCountsEnvelope(rows.map((row) => ({ ...row, recordsWritten: 7 }))),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'));

  assert.throws(() => coop.buildCpdCoopCountsEnvelope([{ ...rows[0], periodStart: '2025-01-01' }, ...rows.slice(1)]),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'));

  assert.throws(() => coop.buildCpdCoopCountsEnvelope([{ ...rows[0], locationKind: 'market' }, ...rows.slice(1)]),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'));

  assert.throws(
    () => coop.buildCpdCoopCountsEnvelope([{ ...rows[0], metricId: 'unknown_measure' }, ...rows.slice(1)]),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'),
  );

  const tamperedDimensions = JSON.parse(String(rows[0].dimensions));
  tamperedDimensions.sourceStatus = 'สถานะที่ไม่มีในต้นทาง';
  assert.throws(
    () => coop.buildCpdCoopCountsEnvelope([{ ...rows[0], dimensions: JSON.stringify(tamperedDimensions) }, ...rows.slice(1)]),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'),
  );

  assert.throws(
    () => coop.buildCpdCoopCountsEnvelope([{ ...rows[0], value: -3 }, ...rows.slice(1)]),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'),
  );

  // แถวซ้ำแต่จำนวนรวมยังเท่า recordsWritten → ต้องติดที่การตรวจซ้ำ ไม่ใช่การนับแถว
  assert.throws(() => coop.buildCpdCoopCountsEnvelope([rows[0], rows[0], ...rows.slice(2)]),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'));

  assert.throws(
    () => coop.buildCpdCoopCountsEnvelope([{ ...rows[0], runKind: 'metadata' }, ...rows.slice(1)]),
    (error: unknown) => is503(error, 'CPD_COOP_SNAPSHOT_INVALID'),
  );
});

test('the real-read guard rejects any sample leakage or fabricated date', () => {
  const envelope = coop.buildCpdCoopCountsEnvelope(allObservationRows());

  assert.throws(
    () => coop.assertCooperativesRealCounts({ ...envelope, data: { ...envelope.data, sample: true as false } }),
    /sample = false/,
  );
  assert.throws(
    () => coop.assertCooperativesRealCounts({
      ...envelope,
      meta: { ...envelope.meta, dataAsOf: '2025-12-31' },
    }),
    /dataAsOf/,
  );
  assert.throws(
    () => coop.assertCooperativesRealCounts({
      ...envelope,
      data: { ...envelope.data, unit: 'แห่ง' as unknown as null },
    }),
    /หน่วยนับ/,
  );
  assert.throws(
    () => coop.assertCooperativesRealCounts({
      ...envelope,
      data: { ...envelope.data, coverageClaim: true as false },
    }),
    /ครอบคลุม/,
  );
  coop.assertCooperativesRealCounts(envelope);
});

test('honest empty state: no rows means no numbers anywhere and the UI gates every count', () => {
  const quietStates = [
    ['metadata_only (resource absent)', coop.buildCpdCoopCountsEnvelope([])],
    ['metadata_only (no published run)', coop.buildCpdCoopCountsEnvelope([{ ...gateOnlyRow(0), activeRunId: null }])],
    ['empty (approved run, zero records)', coop.buildCpdCoopCountsEnvelope([gateOnlyRow(0)])],
    ['unavailable (store unreadable)', coop.cooperativesRealCountsUnavailable()],
  ] as const;

  for (const [label, envelope] of quietStates) {
    const text = JSON.stringify(envelope);
    assert.deepEqual(envelope.data.rows, [], `${label}: no rows may be served`);
    assert.equal(envelope.data.snapshot, null, `${label}: a state without rows must not claim a run snapshot`);
    assert.equal(envelope.data.sample, false, `${label}: the real section never degrades to sample data`);
    for (const [key, value] of Object.entries(envelope.data.counts)) {
      assert.equal(value, 0, `${label}: counts.${key} must be 0 when nothing was read`);
    }
    assert.equal(text.includes('"value":'), false, `${label}: no numeric value field may appear`);
    assert.equal(text.includes('(ข้อมูลตัวอย่าง)'), false, `${label}: sample names must not leak`);
    assert.equal(text.includes('CAMELS'), false, `${label}: the sample dashboard is a separate surface`);
    assert.equal(text.includes('แห่ง"'), false, `${label}: an unconfirmed unit label must not appear as data`);
    assert.ok(envelope.data.warnings.join(' ').includes('ตัวอย่า'), `${label}: states that no sample fills the gap`);
  }

  // the component renders numbers only from ReadyView; every quiet state uses QuietView
  const componentSource = readFileSync(
    new URL('../components/cooperatives-cpd-counts.tsx', import.meta.url), 'utf8',
  );
  const quietStart = componentSource.indexOf('function QuietView');
  const quietBlock = componentSource.slice(quietStart, componentSource.indexOf('export function CooperativesCpdCounts'));
  assert.ok(quietStart > 0 && quietBlock.length > 0, 'QuietView must exist in the lane component');
  for (const numericRenderer of ['CountCards', 'PivotTable', 'RowTable', 'ValueCell', 'intFormatter.format']) {
    assert.equal(quietBlock.includes(numericRenderer), false,
      `QuietView must not call ${numericRenderer} — it would print numbers without rows`);
  }
  assert.match(
    componentSource.slice(componentSource.indexOf('export function CooperativesCpdCounts')),
    /meta\.availability === 'ready' \? <ReadyView data=\{data\} \/> : <QuietView data=\{data\} availability=\{meta\.availability\} \/>/,
    'the numeric view must stay gated on availability === ready',
  );

  // the page feeds the real section only from the real read path, never from the sample payload
  const pageSource = readFileSync(new URL('../app/cooperatives/page.tsx', import.meta.url), 'utf8');
  assert.match(pageSource, /<CooperativesCpdCounts envelope=\{realCounts\} \/>/);
  assert.equal(pageSource.includes('CooperativesCpdCounts envelope={payload'), false);
  assert.match(pageSource, /realCounts = await loadCooperativesRealCounts\(\);/);
  assert.match(pageSource, /realCounts = cooperativesRealCountsUnavailable\(/);
});

test('unavailable envelope states the failure and carries no rows', () => {
  const envelope = coop.cooperativesRealCountsUnavailable();
  assert.equal(envelope.meta.availability, 'unavailable');
  assert.equal(envelope.meta.access, 'metadata_only');
  assert.deepEqual(envelope.data.rows, []);
  assert.equal(envelope.data.sample, false);
  assert.equal(envelope.meta.dataAsOf, null);
  assert.ok(envelope.data.warnings.some((warning: string) => warning.includes('ไม่แสดงตัวเลขตัวอย่าง')));
  assert.equal(JSON.stringify(envelope.data).includes('(ข้อมูลตัวอย่าง)'), false);
});

/* ---------------- route surface ---------------- */

interface FakeState {
  rows: Record<string, unknown>[];
  error: Error | null;
  sql: string;
  params: unknown[];
}

/**
 * D1 ปลอมที่ interface เดียวกับที่ lib/hub/d1.ts.queryD1() ใช้ (prepare → bind → all)
 * ไม่มีเครือข่ายและไม่มีคลังจริง: every read returns `state.rows`, every failure throws `state.error`,
 * และ exec/dump ถูกปิดไว้เพราะทางอ่านของ lane นี้ต้องไม่เขียนอะไรเลย
 */
function installFakeD1(state: FakeState): void {
  const database = {
    prepare(query: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async all() {
          state.sql = query;
          state.params = bound;
          if (state.error !== null) throw state.error;
          return { results: state.rows, success: true, meta: {} };
        },
        async first() {
          if (state.error !== null) throw state.error;
          return state.rows[0] ?? null;
        },
        async raw() {
          if (state.error !== null) throw state.error;
          return state.rows;
        },
      };
      return statement;
    },
    async dump() {
      throw new Error('the fake D1 has no dump');
    },
    async batch(statements: { all: () => Promise<unknown> }[]) {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
    async exec() {
      throw new Error('the fake D1 refuses exec — this lane is read-only');
    },
  };

  // getD1() memoise client ต่อ process จึงต้องติดตั้งก่อนการใช้ queryD1 ครั้งแรก แล้ว mutate state ต่อไป
  const globalScope = globalThis as unknown as { env?: Record<string, unknown> };
  globalScope.env = { ...(globalScope.env ?? {}), DB: database };
}

/** getD1() memoise client ต่อ process จึงติดตั้ง fake DB ครั้งเดียวแล้ว mutate state ต่อข้อทดสอบ */
const d1State: FakeState = { rows: [], error: null, sql: '', params: [] };
installFakeD1(d1State);

test('GET /api/v1/cooperatives/cpd-counts serves real rows with bound reads and no-store', async () => {
  d1State.error = null;
  d1State.rows = allObservationRows();

  const response = await realRoute.GET(new Request(`${HUB_ORIGIN}/api/v1/cooperatives/cpd-counts`));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(d1State.params, [cpd.CPD_COOP_RESOURCE_ID, cpd.CPD_COOP_SOURCE_ID, cpd.CPD_COOP_DATASET_ID]);
  assert.match(d1State.sql, /r\.active_run_id/);
  assert.match(d1State.sql, /o\.run_id=run\.run_id/);
  assert.match(d1State.sql, /LIMIT 1001/);
  assert.equal(d1State.sql.includes('INSERT'), false, 'the reader must never write');
  assert.equal(d1State.sql.includes('UPDATE'), false);
  assert.equal(body.data.sample, false);
  assert.equal(body.meta.availability, 'ready');
  assert.equal(body.meta.dataAsOf, null);
  assert.equal(body.data.unit, null);
  assert.equal(body.data.rows.length, SOURCE_ROWS.length * STATUS_COLUMNS.length);

  const filtered = await realRoute.GET(
    new Request(`${HUB_ORIGIN}/api/v1/cooperatives/cpd-counts?sourceStatus=${encodeURIComponent('ดำเนินการ')}&provinceCode=${SOURCE_ROWS[1].areaCode}`),
  );
  const filteredBody = await filtered.json();
  assert.equal(filtered.status, 200);
  assert.equal(filteredBody.data.rows.length, 2, 'both Bangkok offices report the operating column');
  for (const row of filteredBody.data.rows) {
    assert.equal(row.sourceStatus, 'operating');
    assert.equal(row.provinceCode, SOURCE_ROWS[1].areaCode);
  }
});

test('route rejects malformed parameters with 400 INVALID_QUERY', async () => {
  d1State.error = null;
  d1State.rows = allObservationRows();

  const cases = [
    '?provinceCode=1',
    '?provinceCode=abc',
    '?sourceStatus=bogus',
    '?sourceYearLabel=' + encodeURIComponent('x'.repeat(90)),
    '?unknown=1',
    '?yearLabel=2568',
  ];
  for (const query of cases) {
    const response = await realRoute.GET(new Request(`${HUB_ORIGIN}/api/v1/cooperatives/cpd-counts${query}`));
    const body = await response.json();
    assert.equal(response.status, 400, `${query} must be rejected`);
    assert.equal(body.error.code, 'INVALID_QUERY', query);
    assert.match(body.error.message, /[ก-๙]/, `${query}: Thai message`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('route fails closed with 503 when the store cannot be read or the contract drifts', async () => {
  d1State.error = new Error('D1 database is not available');
  const failed = await realRoute.GET(new Request(`${HUB_ORIGIN}/api/v1/cooperatives/cpd-counts`));
  const failedBody = await failed.json();
  assert.equal(failed.status, 503);
  assert.equal(failedBody.error.code, 'CPD_COOP_UNAVAILABLE');
  assert.equal(JSON.stringify(failedBody).includes('(ข้อมูลตัวอย่าง)'), false);

  d1State.error = null;
  d1State.rows = [{ ...allObservationRows()[0], recordsWritten: 11 }];
  const drifted = await realRoute.GET(new Request(`${HUB_ORIGIN}/api/v1/cooperatives/cpd-counts`));
  const driftedBody = await drifted.json();
  assert.equal(drifted.status, 503);
  assert.equal(driftedBody.error.code, 'CPD_COOP_SNAPSHOT_INVALID');

  d1State.rows = [];
  const absent = await realRoute.GET(new Request(`${HUB_ORIGIN}/api/v1/cooperatives/cpd-counts`));
  const absentBody = await absent.json();
  assert.equal(absent.status, 200, 'an absent resource is a readable honest state, not a failure');
  assert.equal(absentBody.meta.availability, 'metadata_only');
  assert.deepEqual(absentBody.data.rows, []);
});

test('the sample cooperatives surface keeps its own metadata-only contract', async () => {
  const response = await sampleRoute.GET(new Request(`${HUB_ORIGIN}/api/v1/cooperatives`));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.sample, true, 'the sample endpoint must still declare sample = true');
  assert.equal(body.meta.access, 'metadata_only');
  assert.equal(body.meta.datasetVersion, 'coop-cad-v1');
  assert.equal(body.data.summary.coverageClaim, false);
});
