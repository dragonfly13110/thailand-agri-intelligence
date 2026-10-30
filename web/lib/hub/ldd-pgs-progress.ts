import 'server-only';

import { HubRequestError } from './http';
import { D1_OBSERVATION_ROW_LIMIT, listD1Observations, listD1Records } from './d1-numeric-repository';
import type { ApiMeta } from './types';
import type { D1ObservationFilters, D1ObservationRow } from './d1-numeric-repository';

/**
 * Read path for the approved LDD resource ``ldd_pgs_program_progress``.
 *
 * The Land Development Department publishes a *plan* (เป้าหมาย) and a *reported
 * result* (ผลดำเนินงาน) for every reporting unit, fiscal-year label and PGS group
 * stage, each column carrying its own unit word (``กลุ่ม``, ``ราย``, ``ไร่``,
 * ``บาท``). The register records ``derivation_allowed: false`` (CC BY-NC-ND), so
 * this reader never turns that pair into a percentage, never averages it and
 * never adds rows together: the published columns are handed over one by one.
 *
 * Availability, provenance and ``dataAsOf`` are derived from what was actually
 * read. When the warehouse holds no published rows for this resource the reader
 * says so with a reason instead of falling back to the ALRO simulation.
 */

export const LDD_PGS_SOURCE_ID = 'ldd';

/**
 * Two id forms name one resource: the CKAN ids the register records, and the
 * stable keys the metadata crawler mints for D1 (`_stable_id(source_id, …)`).
 * The writer stores rows under the stable form, so this reader queries it; the
 * CKAN ids stay the provenance shown on the page and in the source URL.
 */
export const LDD_PGS_CKAN_DATASET_ID = 'ord02';
export const LDD_PGS_CKAN_RESOURCE_ID = '2feb3230-cf86-4560-95f5-93e58270a7d8';
export const LDD_PGS_DATASET_ID = 'ldd:ord02';
export const LDD_PGS_RESOURCE_ID = 'ldd:ord02:2feb3230-cf86-4560-95f5-93e58270a7d8';

export type LddPgsKeyKind = 'dataset' | 'resource';

export type LddPgsResolvedKey = {
  kind: LddPgsKeyKind;
  /** The key the warehouse stores and queries by. */
  canonical: string;
  /** The CKAN identifier this key came from. */
  ckanId: string;
};

/** Resolve either id form (CKAN or crawler-stable) to the one warehouse key. */
export function resolveLddPgsKey(value: string): LddPgsResolvedKey | null {
  if (value === LDD_PGS_CKAN_DATASET_ID || value === LDD_PGS_DATASET_ID) {
    return { kind: 'dataset', canonical: LDD_PGS_DATASET_ID, ckanId: LDD_PGS_CKAN_DATASET_ID };
  }
  if (value === LDD_PGS_CKAN_RESOURCE_ID || value === LDD_PGS_RESOURCE_ID) {
    return { kind: 'resource', canonical: LDD_PGS_RESOURCE_ID, ckanId: LDD_PGS_CKAN_RESOURCE_ID };
  }
  return null;
}

const MAX_LDD_PGS_ROWS = 5_000;
const SOURCE_YEAR_LABEL = /^พ\.ศ\. (\d{4})$/;

export type LddPgsMeasureId =
  | 'pgs_target_groups'
  | 'pgs_reported_groups'
  | 'pgs_target_people'
  | 'pgs_reported_people'
  | 'pgs_target_area_rai'
  | 'pgs_reported_area_rai'
  | 'pgs_target_budget_baht'
  | 'pgs_reported_budget_baht';

export type LddPgsMeasureDefinition = {
  id: LddPgsMeasureId;
  sourceField: string;
  unit: string;
  planOrResult: 'target' | 'reported';
};

/** The source's own columns; the unit word is the one printed in the header. */
export const LDD_PGS_MEASURES: readonly LddPgsMeasureDefinition[] = [
  { id: 'pgs_target_groups', sourceField: 'เป้าหมาย (กลุ่ม)', unit: 'กลุ่ม', planOrResult: 'target' },
  { id: 'pgs_reported_groups', sourceField: 'ผลดำเนินงาน (กลุ่ม)', unit: 'กลุ่ม', planOrResult: 'reported' },
  { id: 'pgs_target_people', sourceField: 'เป้าหมาย (ราย)', unit: 'ราย', planOrResult: 'target' },
  { id: 'pgs_reported_people', sourceField: 'ผลดำเนินงาน (ราย)', unit: 'ราย', planOrResult: 'reported' },
  { id: 'pgs_target_area_rai', sourceField: 'เป้าหมาย (ไร่)', unit: 'ไร่', planOrResult: 'target' },
  { id: 'pgs_reported_area_rai', sourceField: 'ผลดำเนินงาน (ไร่)', unit: 'ไร่', planOrResult: 'reported' },
  { id: 'pgs_target_budget_baht', sourceField: 'เป้าหมาย: งบ (บาท)', unit: 'บาท', planOrResult: 'target' },
  { id: 'pgs_reported_budget_baht', sourceField: 'ผลดำเนินงาน: งบ (บาท)', unit: 'บาท', planOrResult: 'reported' },
];

export type LddPgsValueRow = {
  rowKey: string;
  sourceRowRef: string | null;
  reportingUnit: string;
  groupStage: string;
  fiscalYearBe: number | null;
  periodLabel: string | null;
  measure: LddPgsMeasureId;
  sourceField: string;
  planOrResult: 'target' | 'reported';
  /** Verbatim warehouse unit word; never substituted when it is missing. */
  unit: string | null;
  value: number | null;
  qualityStatus: string | null;
};

export type LddPgsNotAvailableReason = { code: string; message: string };

export type LddPgsData = {
  /** Warehouse key the rows were read by; `LDD_PGS_CKAN_RESOURCE_ID` is the source id. */
  resourceId: string;
  datasetId: string;
  sourceId: string;
  measures: LddPgsMeasureId[];
  rowCount: number;
  rows: LddPgsValueRow[];
  reportingUnits: string[];
  groupStages: string[];
  fiscalYearsBe: number[];
  missingValueCount: number;
  missingUnitCount: number;
  /** Null on purpose: the source publishes no reporting cutoff date. */
  dataAsOf: string | null;
  dataAsOfReason: string;
  unitPolicy: 'source column header unit words, unchanged';
  derivation: 'forbidden';
  notAvailableReason: LddPgsNotAvailableReason | null;
};

export type LddPgsEnvelope = { data: LddPgsData; meta: ApiMeta };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function fiscalYearBe(row: D1ObservationRow): number | null {
  const value = row.dimensions.sourceYearBe ?? row.dimensions.fiscalYearBe;
  return typeof value === 'number' && Number.isInteger(value) && value >= 2400 && value <= 2800 ? value : null;
}

function measureFor(metricId: string | null): LddPgsMeasureDefinition | null {
  return LDD_PGS_MEASURES.find(item => item.id === metricId) ?? null;
}

function truthfulWarnings(meta: ApiMeta, data: LddPgsData): string[] {
  const warnings: string[] = [
    'ต้นทางเผยแพร่ค่าเป้าหมายและผลที่รายงานแยกกันต่อคอลัมน์ หน้าจอนี้แสดงค่าตามที่เผยแพร่ '
      + 'ไม่คำนวณร้อยละ ความก้าวหน้า ค่าเฉลี่ย หรือยอดรวมข้ามแถว/ข้ามปี (สัญญาอนุญาต NoDerivs ห้ามดัดแปลง)',
    'หน่วยงานผู้รายงานเป็นข้อความตามต้นทาง ไม่ใช่รหัสจังหวัด จึงไม่เชื่อมกับทะเบียนพื้นที่หรือจังหวัด',
    'ต้นทางไม่เผยแพร่วันตัดยอดข้อมูล (reporting cutoff) จึงคง dataAsOf เป็น null และใช้อ้างอิงเฉพาะป้ายปีงบประมาณในแถวที่อ่านได้',
  ];
  if (data.missingValueCount > 0) {
    warnings.push(`พบคอลัมน์ที่ต้นทางไม่กรอก ${data.missingValueCount} ช่อง แสดงเป็น "ไม่ทราบ" ไม่แปลงเป็น 0`);
  }
  if (data.missingUnitCount > 0) {
    warnings.push(`พบแถวที่ไม่มีหน่วยคำจากต้นทาง ${data.missingUnitCount} แถว จึงแสดงหน่วยเป็น "ไม่ระบุ" แทนการเติมหน่วยเอง`);
  }
  if (meta.availability === 'metadata_only') {
    warnings.push('ทรัพยากรนี้ยังไม่มีตัวเลขที่เผยแพร่ในคลังข้อมูลกลาง (สถานะ metadata_only) จึงไม่แสดงตัวเลขใด ๆ');
  } else if (meta.availability === 'empty') {
    warnings.push('ยังไม่มีการเขียนแถวข้อมูลของทรัพยากรนี้เข้าคลังข้อมูลกลาง (0 แถวที่เผยแพร่)');
  } else if (meta.availability === 'unavailable') {
    warnings.push('อ่านคลังข้อมูลกลางไม่สำเร็จในขณะนี้ จึงไม่แสดงตัวเลขใด ๆ แทนข้อมูลจริง และไม่ใช่ค่าตัวอย่าง');
  }
  if (data.notAvailableReason !== null) {
    warnings.push(`เหตุผลที่ไม่แสดงตัวเลข: ${data.notAvailableReason.code} — ${data.notAvailableReason.message}`);
  }
  if (meta.completeness === 'partial') {
    warnings.push('run ปัจจุบันถูกระบุว่า partial จำนวนแถวที่อ่านได้จึงไม่ยืนยัน coverage ของหน่วยงานทั้งหมด');
  }
  if (meta.warnings.length > 0) warnings.push(...meta.warnings);
  return warnings;
}

function availabilityFor(meta: ApiMeta, rowCount: number): ApiMeta['availability'] {
  if (rowCount > 0) return 'ready';
  return meta.availability === 'ready' ? 'empty' : meta.availability;
}

export function buildLddPgsEnvelope(sourceRows: D1ObservationRow[], sourceMeta: ApiMeta): LddPgsEnvelope {
  const rows: LddPgsValueRow[] = [];
  for (const row of sourceRows) {
    if (resolveLddPgsKey(row.resourceId)?.kind !== 'resource') {
      throw new HubRequestError(503, 'LDD_PGS_RESOURCE_MISMATCH',
        'พบแถวที่ไม่ได้อยู่ใต้รหัสทรัพยากร PGS ที่หน้านี้อ่าน');
    }
    const measure = measureFor(row.metricId);
    if (!measure) {
      // A metric this page does not know must never be rendered as a known one.
      continue;
    }
    const reportingUnit = text(row.dimensions.reportingUnit);
    const groupStage = text(row.dimensions.groupStage);
    if (reportingUnit === null || groupStage === null) {
      throw new HubRequestError(503, 'LDD_PGS_GRAIN_CONTRACT_INVALID',
        'ข้อมูล PGS จากกรมพัฒนาที่ดินขาดเกรนหน่วยงานผู้รายงาน/ประเภทกลุ่ม');
    }
    if (row.locationKind !== null || row.locationId !== null || row.provinceCode !== null) {
      throw new HubRequestError(503, 'LDD_PGS_GRAIN_CONTRACT_INVALID',
        'ข้อมูล PGS ต้องไม่ถูกผูกเป็นตำแหน่งทางการปกครอง เพราะต้นทางเผยแพร่ตามหน่วยงานผู้รายงาน');
    }
    if (row.periodStart !== null || row.periodEnd !== null || row.observedAt !== null) {
      throw new HubRequestError(503, 'LDD_PGS_SOURCE_YEAR_CONTRACT_INVALID',
        'ข้อมูล PGS จากกรมพัฒนาที่ดินมีช่วงเวลาไม่ตรงสัญญา (ต้องเป็นป้ายปี พ.ศ. เท่านั้น)');
    }
    const year = fiscalYearBe(row);
    if (row.periodLabel !== null) {
      const matched = SOURCE_YEAR_LABEL.exec(row.periodLabel);
      if (!matched) {
        throw new HubRequestError(503, 'LDD_PGS_SOURCE_YEAR_CONTRACT_INVALID',
          'ป้ายปีงบประมาณของข้อมูล PGS ไม่อยู่ในรูปแบบ "พ.ศ. N" ตามต้นทาง');
      }
      if (year !== null && Number(matched[1]) !== year) {
        throw new HubRequestError(503, 'LDD_PGS_SOURCE_YEAR_CONTRACT_INVALID',
          'ป้ายปีงบประมาณกับปี พ.ศ. ในมิติข้อมูล PGS ไม่ตรงกัน');
      }
    }
    if (row.dimensions.derivedFromSource === true) {
      throw new HubRequestError(503, 'LDD_PGS_DERIVED_ROW_REJECTED',
        'พบแถวที่ถูก_derivedFromSource_ทั้งที่สัญญาอนุญาตห้ามดัดแปลง จึงไม่แสดงแถวนั้น');
    }
    rows.push({
      rowKey: row.rowKey,
      sourceRowRef: row.sourceRowRef,
      reportingUnit,
      groupStage,
      fiscalYearBe: year,
      periodLabel: row.periodLabel,
      measure: measure.id,
      sourceField: measure.sourceField,
      planOrResult: measure.planOrResult,
      unit: row.unit,
      value: row.value,
      qualityStatus: row.qualityStatus,
    });
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const identity = `${row.reportingUnit}|${row.fiscalYearBe ?? ''}|${row.groupStage}|${row.measure}`;
    if (seen.has(identity)) {
      throw new HubRequestError(503, 'LDD_PGS_DUPLICATE_GRAIN', 'พบแถวซ้ำในเกรนเดียวกับที่ต้นทางเผยแพร่');
    }
    seen.add(identity);
  }

  const availability = availabilityFor(sourceMeta, rows.length);
  const data: LddPgsData = {
    resourceId: LDD_PGS_RESOURCE_ID,
    datasetId: LDD_PGS_DATASET_ID,
    sourceId: LDD_PGS_SOURCE_ID,
    measures: LDD_PGS_MEASURES.map(item => item.id),
    rowCount: rows.length,
    rows,
    reportingUnits: [...new Set(rows.map(row => row.reportingUnit))].sort((a, b) => a.localeCompare(b, 'th')),
    groupStages: [...new Set(rows.map(row => row.groupStage))].sort((a, b) => a.localeCompare(b, 'th')),
    fiscalYearsBe: [...new Set(rows.map(row => row.fiscalYearBe)
      .filter((year): year is number => year !== null))].sort((a, b) => b - a),
    missingValueCount: rows.filter(row => row.value === null).length,
    missingUnitCount: rows.filter(row => row.unit === null).length,
    dataAsOf: null,
    dataAsOfReason: 'ต้นทางไม่มีวันตัดยอดที่เผยแพร่ จึงคง dataAsOf เป็น null และอ้างอิงเฉพาะป้ายปีงบประมาณในแถว',
    unitPolicy: 'source column header unit words, unchanged',
    derivation: 'forbidden',
    notAvailableReason: null,
  };
  const meta: ApiMeta = {
    ...sourceMeta,
    availability,
    sourceIds: [LDD_PGS_SOURCE_ID],
    dataAsOf: null,
    warnings: truthfulWarnings({ ...sourceMeta, availability }, data),
    runtimeMode: 'database',
  };
  return { data, meta };
}

function baseMeta(overrides: Partial<ApiMeta> = {}): ApiMeta {
  return {
    availability: 'unavailable',
    freshness: 'unknown',
    completeness: 'unknown',
    access: 'metadata_only',
    sourceIds: [LDD_PGS_SOURCE_ID],
    retrievedAt: new Date().toISOString(),
    sourceRetrievedAt: null,
    dataAsOf: null,
    sourceUpdatedAt: null,
    datasetVersion: null,
    warnings: [],
    runtimeMode: 'database',
    ...overrides,
  };
}

type LddPgsDependencies = {
  listRecords: (id: string, url: URL) => Promise<Response>;
  listObservations: (filters: D1ObservationFilters, options: { limit: number; offset: number })
    => Promise<{ rows: D1ObservationRow[]; total: number }>;
};

const realDependencies: LddPgsDependencies = {
  listRecords: listD1Records,
  listObservations: listD1Observations,
};

async function readRegisterMeta(deps: LddPgsDependencies): Promise<ApiMeta> {
  const metaUrl = new URL('https://hub.local/api/v1/datasets/' + LDD_PGS_DATASET_ID + '/records');
  metaUrl.searchParams.set('resourceId', LDD_PGS_RESOURCE_ID);
  metaUrl.searchParams.set('pageSize', '1');
  const response = await deps.listRecords(LDD_PGS_DATASET_ID, metaUrl);
  if (!response.ok) {
    const envelope = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new HubRequestError(503, envelope?.error?.code || 'LDD_PGS_DATA_UNAVAILABLE',
      'ขณะนี้อ่านทะเบียนข้อมูลกรมพัฒนาที่ดินไม่ได้');
  }
  return (await response.json() as { meta: ApiMeta }).meta;
}

/**
 * Read every published PGS row through the shared approved-resource join.
 *
 * `listD1Observations` already refuses anything that is not `approved_public`,
 * `project_publication_approved = 1` and part of the resource's active numeric
 * run, so this query is rights-gated on its own and does not depend on which
 * `datasets.dataset_id` the metadata crawler happened to mint for the package.
 */
async function readPublishedRows(deps: LddPgsDependencies): Promise<D1ObservationRow[]> {
  const filters: D1ObservationFilters = { sourceId: LDD_PGS_SOURCE_ID, resourceId: LDD_PGS_RESOURCE_ID };
  const first = await deps.listObservations(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0 });
  if (first.total > MAX_LDD_PGS_ROWS) {
    throw new HubRequestError(503, 'LDD_PGS_DATASET_TOO_LARGE', 'ข้อมูลชุดนี้มีขนาดเกินขอบเขตการอ่านของหน้าเว็บ');
  }
  const rows = [...first.rows];
  for (let offset = D1_OBSERVATION_ROW_LIMIT; offset < first.total; offset += D1_OBSERVATION_ROW_LIMIT) {
    const page = await deps.listObservations(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset });
    if (page.total !== first.total) {
      throw new HubRequestError(503, 'LDD_PGS_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
    }
    rows.push(...page.rows);
  }
  if (rows.length !== first.total) {
    throw new HubRequestError(503, 'LDD_PGS_SNAPSHOT_INCOMPLETE', 'อ่านแถวข้อมูลกรมพัฒนาที่ดินได้ไม่ครบ กรุณาลองใหม่');
  }
  return rows;
}

/** Provenance for the register-less path: only fields the read rows actually carry. */
function metaFromRows(rows: D1ObservationRow[]): ApiMeta {
  return baseMeta({
    availability: 'ready',
    access: 'approved_public',
    // A single run's payload hash is a revision pin; mixed runs report null.
    datasetVersion: rows.every(row => row.payloadSha256 === rows[0].payloadSha256)
      ? rows[0].payloadSha256
      : null,
    sourceRetrievedAt: rows[0].sourceRetrievedAt,
    // The run status is 'succeeded' or 'partial' by join contract, and this
    // path cannot see which, so freshness/completeness stay unknown rather
    // than being asserted.
    freshness: 'unknown',
    completeness: 'unknown',
  });
}

/**
 * Read the published PGS rows from the central store. Contract failures and
 * unreachable storage come back as an `unavailable` envelope with a reason:
 * nothing in this module substitutes sample numbers for missing real data.
 */
export async function loadLddPgsEnvelope(
  dependencies: Partial<LddPgsDependencies> = {},
): Promise<LddPgsEnvelope> {
  const deps: LddPgsDependencies = { ...realDependencies, ...dependencies };
  let register: { meta: ApiMeta } | { failure: LddPgsNotAvailableReason };
  try {
    register = { meta: await readRegisterMeta(deps) };
  } catch (error) {
    const code = error instanceof HubRequestError ? error.code : 'LDD_PGS_DATA_UNAVAILABLE';
    const message = error instanceof HubRequestError ? error.message : 'ขณะนี้อ่านข้อมูลกรมพัฒนาที่ดินไม่ได้';
    register = { failure: { code, message } };
  }

  if ('failure' in register) {
    // The dataset register row is unreadable (for example the package is
    // registered under a different dataset id). Still try the resource-level
    // published join: it is rights-gated, so a real approved batch is found
    // and an absent one simply yields no rows — never sample numbers.
    const registerFailure = register.failure;
    let rows: D1ObservationRow[];
    try {
      rows = await readPublishedRows(deps);
    } catch {
      rows = [];
    }
    if (rows.length === 0) {
      const known = registerFailure.code === 'DATASET_NOT_FOUND' || registerFailure.code === 'RESOURCE_NOT_FOUND';
      return unavailableFromReason(registerFailure, { availability: known ? 'metadata_only' : 'unavailable' });
    }
    const envelope = buildLddPgsEnvelope(rows, metaFromRows(rows));
    envelope.meta.warnings.push(
      `อ่านทะเบียนชุดข้อมูลไม่พบ (${registerFailure.code}) จึงอ้างอิงสิทธิ์ระดับทรัพยากรจาก join ที่อนุมัติเท่านั้น `
        + '(approved_public + project_publication_approved + run ตัวเลขที่ใช้งานอยู่)',
    );
    return envelope;
  }

  const registerMeta = register.meta;
  if (registerMeta.availability !== 'ready') {
    return buildLddPgsEnvelope([], registerMeta);
  }

  try {
    return buildLddPgsEnvelope(await readPublishedRows(deps), registerMeta);
  } catch (error) {
    const code = error instanceof HubRequestError ? error.code : 'LDD_PGS_DATA_UNAVAILABLE';
    const message = error instanceof HubRequestError ? error.message : 'ขณะนี้อ่านข้อมูลกรมพัฒนาที่ดินไม่ได้';
    return unavailableFromReason({ code, message }, registerMeta);
  }
}

function unavailableFromReason(reason: LddPgsNotAvailableReason, meta: Partial<ApiMeta> = {}): LddPgsEnvelope {
  const envelope = buildLddPgsEnvelope([], baseMeta(meta));
  envelope.data.notAvailableReason = reason;
  envelope.meta.availability = meta.availability === 'metadata_only' ? 'metadata_only' : 'unavailable';
  envelope.meta.warnings = truthfulWarnings(envelope.meta, {
    ...envelope.data,
  });
  envelope.meta.warnings.push(`${reason.code}: ${reason.message}`);
  return envelope;
}
