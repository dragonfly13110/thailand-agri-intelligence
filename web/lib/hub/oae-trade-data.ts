import 'server-only';

import { queryD1 } from './d1';
import { HubRequestError } from './http';
import type { ApiMeta } from './types';

export const OAE_TRADE_SOURCE_ID = 'oae';
export const OAE_TRADE_DATASET_ID = '990f9c44-c484-42ed-aed8-b4369bef1b48';
export const OAE_TRADE_RESOURCE_ID = '05a5c2b7-f43b-4232-b7ae-04aca5c63329';
export const OAE_TRADE_RESOURCE_URL =
  'https://catalog.oae.go.th/dataset/990f9c44-c484-42ed-aed8-b4369bef1b48/' +
  'resource/05a5c2b7-f43b-4232-b7ae-04aca5c63329/download/sta_cai10_cai_exp1.csv';

const MAX_OAE_TRADE_ROWS = 500;
const MEASURE = 'agricultural_export_value';
const UNIT = 'ล้านบาท';
const TRADE_TYPE = 'การส่งออก';

export type OaeTradeRow = {
  rowKey: string;
  sourceYearLabel: string;
  tradeType: typeof TRADE_TYPE;
  product: string;
  value: number | null;
  unit: typeof UNIT;
  qualityStatus: 'good' | 'missing';
  sourceRowRef: string;
};

export type OaeTradeData = {
  sourceId: typeof OAE_TRADE_SOURCE_ID;
  sourceName: string;
  datasetId: typeof OAE_TRADE_DATASET_ID;
  resourceId: typeof OAE_TRADE_RESOURCE_ID;
  sourceUrl: string;
  attributionText: string;
  attributionUrl: string;
  sourceLicenseStatus: 'unverified';
  publicationAuthorization: 'project_owner_instruction';
  sourceGrain: 'product × trade type × source-year label';
  sourceYearConvention: 'unknown';
  spatialSupport: 'not_reported';
  measure: typeof MEASURE;
  unit: typeof UNIT;
  availableYearLabels: string[];
  selectedYearLabel: string | null;
  rowCount: number;
  rows: OaeTradeRow[];
  snapshot: {
    runId: string;
    status: 'succeeded' | 'partial';
    sourceRetrievedAt: string;
    completedAt: string;
    adapterVersion: string;
    payloadSha256: string;
    rowCount: number;
  } | null;
};

export type OaeTradeEnvelope = { data: OaeTradeData; meta: ApiMeta };

export type OaeTradeQueryRow = Record<string, unknown>;

const baseData: OaeTradeData = {
  sourceId: OAE_TRADE_SOURCE_ID,
  sourceName: 'สำนักงานเศรษฐกิจการเกษตร (OAE)',
  datasetId: OAE_TRADE_DATASET_ID,
  resourceId: OAE_TRADE_RESOURCE_ID,
  sourceUrl: OAE_TRADE_RESOURCE_URL,
  attributionText: 'ข้อมูลมูลค่าการส่งออกสินค้าเกษตร โดยสำนักงานเศรษฐกิจการเกษตร (OAE)',
  attributionUrl: 'https://catalog.oae.go.th',
  sourceLicenseStatus: 'unverified',
  publicationAuthorization: 'project_owner_instruction',
  sourceGrain: 'product × trade type × source-year label',
  sourceYearConvention: 'unknown',
  spatialSupport: 'not_reported',
  measure: MEASURE,
  unit: UNIT,
  availableYearLabels: [],
  selectedYearLabel: null,
  rowCount: 0,
  rows: [],
  snapshot: null,
};

function metaFor(
  availability: ApiMeta['availability'],
  access: ApiMeta['access'],
  warnings: string[],
  snapshot: OaeTradeData['snapshot'] = null,
): ApiMeta {
  return {
    availability,
    freshness: 'unknown',
    completeness: snapshot ? (snapshot.status === 'partial' ? 'partial' : 'complete') : 'unknown',
    access,
    sourceIds: [OAE_TRADE_SOURCE_ID],
    retrievedAt: new Date().toISOString(),
    sourceRetrievedAt: snapshot?.sourceRetrievedAt ?? null,
    dataAsOf: null,
    sourceUpdatedAt: null,
    datasetVersion: snapshot?.payloadSha256 ?? null,
    warnings,
    runtimeMode: 'database',
  };
}

function metadataOnly(yearLabel: string | null): OaeTradeEnvelope {
  return {
    data: { ...baseData, selectedYearLabel: yearLabel },
    meta: metaFor('metadata_only', 'metadata_only', [
      'ยังไม่มีระเบียนตัวเลขของทรัพยากรนี้ที่ผ่านเงื่อนไขเผยแพร่ใน D1 Hub',
      'ป้ายปีจากต้นทางยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ',
      'เงื่อนไขสัญญาอนุญาตและการนำข้อมูลต้นทางไปใช้ซ้ำยังไม่ได้รับการยืนยัน',
    ]),
  };
}

function invalidSnapshot(message: string): never {
  throw new HubRequestError(503, 'OAE_TRADE_SNAPSHOT_INVALID', message);
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function safeCount(value: unknown): number | null {
  const count = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value)
      : NaN;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function safeValue(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function dimensions(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      invalidSnapshot('มิติข้อมูลการส่งออกจาก D1 มีรูปแบบไม่ถูกต้อง');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    invalidSnapshot('มิติข้อมูลการส่งออกจาก D1 มีรูปแบบไม่ถูกต้อง');
  }
  return parsed as Record<string, unknown>;
}

function validateAndMapRow(row: OaeTradeQueryRow): OaeTradeRow {
  const dimension = dimensions(row.dimensions);
  const yearLabel = requiredText(row.periodLabel);
  const product = requiredText(row.product);
  const sourceRowRef = requiredText(row.sourceRowRef);
  const rowKey = requiredText(row.rowKey);
  const value = safeValue(row.value);
  const expectedQuality = value === null ? 'missing' : 'good';
  if (!rowKey || !yearLabel || !product || !sourceRowRef || value === undefined
      || row.metricId !== MEASURE || row.metricName !== 'มูลค่าการส่งออก'
      || row.unit !== UNIT || row.periodStart !== null || row.periodEnd !== null
      || row.locationId !== null || row.locationCode !== null || row.locationKind !== null
      || row.locationName !== null || row.provinceCode !== null
      || dimension.measure !== MEASURE || dimension.spatialSupport !== 'not_reported'
      || dimension.tradeType !== TRADE_TYPE || dimension.sourceYearLabel !== yearLabel
      || dimension.sourceYearLabelOrigin !== 'csv_year_column'
      || dimension.sourceYearLabelConvention !== 'unknown'
      || dimension.sourceRowId !== sourceRowRef
      || row.qualityStatus !== expectedQuality) {
    invalidSnapshot('ระเบียน OAE ไม่ตรงกับเกรนหรือสัญญาข้อมูลที่อนุมัติไว้');
  }
  return {
    rowKey,
    sourceYearLabel: yearLabel,
    tradeType: TRADE_TYPE,
    product,
    value,
    unit: UNIT,
    qualityStatus: expectedQuality,
    sourceRowRef,
  };
}

export function buildOaeTradeEnvelope(
  queryRows: OaeTradeQueryRow[],
  selectedYearLabel: string | null = null,
): OaeTradeEnvelope {
  const resource = queryRows[0];
  if (!resource || resource.accessStatus !== 'approved_public'
      || resource.projectPublicationApproved !== 1 && resource.projectPublicationApproved !== true
      || !['approved_public', 'metadata_only'].includes(String(resource.datasetAccessStatus))
      || !['approved_public', 'metadata_only'].includes(String(resource.sourceAccessStatus))) {
    return metadataOnly(selectedYearLabel);
  }

  const activeRunId = requiredText(resource.activeRunId);
  if (!activeRunId) return metadataOnly(selectedYearLabel);
  if (resource.runId !== activeRunId || !['succeeded', 'partial'].includes(String(resource.runStatus))
      || resource.runKind !== 'numeric') {
    invalidSnapshot('สถานะรอบข้อมูล OAE ใน D1 ไม่ตรงกับรอบที่เผยแพร่');
  }

  const runId = requiredText(resource.runId);
  const sourceRetrievedAt = requiredText(resource.sourceRetrievedAt);
  const completedAt = requiredText(resource.completedAt);
  const payloadSha256 = requiredText(resource.payloadSha256);
  const adapterVersion = requiredText(resource.adapterVersion);
  const recordsWritten = safeCount(resource.recordsWritten);
  if (!runId || !sourceRetrievedAt || !Number.isFinite(Date.parse(sourceRetrievedAt))
      || !completedAt || !Number.isFinite(Date.parse(completedAt))
      || !payloadSha256 || !/^[a-f0-9]{64}$/i.test(payloadSha256)
      || !adapterVersion?.startsWith('oae-trade-exports/') || recordsWritten === null) {
    invalidSnapshot('metadata รุ่นข้อมูล OAE ใน D1 ไม่ครบถ้วน');
  }

  const rowSet = queryRows.filter(row => row.rowKey !== null && row.rowKey !== undefined);
  const identity = (row: OaeTradeQueryRow) => [
    row.resourceId, row.activeRunId, row.runId, row.runStatus, row.runKind,
    row.sourceRetrievedAt, row.completedAt, row.payloadSha256, row.adapterVersion, row.recordsWritten,
  ];
  const version = JSON.stringify(identity(resource));
  if (queryRows.some(row => JSON.stringify(identity(row)) !== version)) {
    invalidSnapshot('รอบหรือ version เปลี่ยนระหว่างการอ่านข้อมูล OAE');
  }
  if (rowSet.length > MAX_OAE_TRADE_ROWS || recordsWritten !== rowSet.length) {
    invalidSnapshot('จำนวนระเบียน OAE ใน D1 ไม่ตรงกับ metadata ของรอบข้อมูล');
  }

  const rows = rowSet.map(validateAndMapRow);
  const rowKeys = new Set<string>();
  const sourceRows = new Set<string>();
  for (const row of rows) {
    if (rowKeys.has(row.rowKey) || sourceRows.has(row.sourceRowRef)) {
      invalidSnapshot('พบระเบียน OAE ซ้ำในรอบข้อมูลที่เผยแพร่');
    }
    rowKeys.add(row.rowKey);
    sourceRows.add(row.sourceRowRef);
  }
  const labels = [...new Set(rows.map(row => row.sourceYearLabel))];
  if (labels.length > 1) invalidSnapshot('รอบข้อมูล OAE มีป้ายปีต้นทางมากกว่าหนึ่งค่า');
  rows.sort((left, right) => left.product.localeCompare(right.product, 'th'));
  const selectedRows = selectedYearLabel === null
    ? rows
    : rows.filter(row => row.sourceYearLabel === selectedYearLabel);
  const runStatus = resource.runStatus as 'succeeded' | 'partial';
  const snapshot: NonNullable<OaeTradeData['snapshot']> = {
    runId,
    status: runStatus,
    sourceRetrievedAt,
    completedAt,
    adapterVersion,
    payloadSha256,
    rowCount: rows.length,
  };
  const warnings = [
    'ป้ายปีคงตามคอลัมน์ต้นทาง และยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ',
    'ต้นทางไม่ได้รายงานขอบเขตพื้นที่ จึงไม่ระบุจังหวัดหรือพื้นที่ครอบคลุม',
    'แสดงค่ารายสินค้า โดยไม่มีการคำนวณยอดรวม สัดส่วน หรือ coverage',
    'สิทธิ์เผยแพร่ใน Hub อิงคำสั่งเจ้าของโครงการ; เงื่อนไขสัญญาอนุญาตต้นทางยังไม่ยืนยัน',
  ];
  if (runStatus === 'partial') warnings.push('รอบข้อมูลปัจจุบันมีสถานะ partial');
  if (rows.length === 0) warnings.push('รอบข้อมูลที่อนุมัติแล้วไม่มีระเบียนตัวเลข');
  else if (selectedRows.length === 0) warnings.push('ไม่พบระเบียนที่ตรงกับป้ายปีต้นทางที่เลือก');

  return {
    data: {
      ...baseData,
      availableYearLabels: labels,
      selectedYearLabel,
      rowCount: selectedRows.length,
      rows: selectedRows,
      snapshot,
    },
    meta: metaFor(selectedRows.length > 0 ? 'ready' : 'empty', 'approved_public', warnings, snapshot),
  };
}

export async function loadOaeTradeEnvelope(selectedYearLabel: string | null = null): Promise<OaeTradeEnvelope> {
  let rows: OaeTradeQueryRow[];
  try {
    rows = await queryD1<OaeTradeQueryRow>(
      'SELECT r.resource_id AS resourceId,r.access_status AS accessStatus,' +
        'r.project_publication_approved AS projectPublicationApproved,r.active_run_id AS activeRunId,' +
        'd.source_id AS sourceId,d.source_dataset_id AS sourceDatasetId,' +
        'd.metadata_access_status AS datasetAccessStatus,s.metadata_access_status AS sourceAccessStatus,' +
        'run.run_id AS runId,run.status AS runStatus,run.kind AS runKind,' +
        'run.source_retrieved_at AS sourceRetrievedAt,run.completed_at AS completedAt,' +
        'run.payload_sha256 AS payloadSha256,run.adapter_version AS adapterVersion,' +
        'run.records_written AS recordsWritten,' +
        'o.row_key AS rowKey,o.metric_id AS metricId,o.metric_name AS metricName,o.product,' +
        'o.value,o.unit,o.period_start AS periodStart,o.period_end AS periodEnd,o.period_label AS periodLabel,' +
        'o.location_id AS locationId,o.location_code AS locationCode,o.location_kind AS locationKind,' +
        'o.location_name AS locationName,o.province_code AS provinceCode,o.dimensions,' +
        'o.quality_status AS qualityStatus,o.source_row_ref AS sourceRowRef ' +
        'FROM resources r JOIN datasets d ON d.dataset_id=r.dataset_id ' +
        'JOIN sources s ON s.source_id=d.source_id ' +
        'LEFT JOIN sync_runs run ON run.resource_id=r.resource_id AND run.run_id=r.active_run_id ' +
        'LEFT JOIN observations o ON o.resource_id=r.resource_id AND o.run_id=run.run_id ' +
        "AND d.metadata_access_status IN ('approved_public','metadata_only') " +
        "AND s.metadata_access_status IN ('approved_public','metadata_only') " +
        "AND r.access_status='approved_public' AND r.project_publication_approved=1 " +
        "AND run.kind='numeric' AND run.status IN ('succeeded','partial') " +
        'WHERE r.resource_id=? AND d.source_id=? AND d.source_dataset_id=? ' +
        'ORDER BY o.row_key LIMIT 501',
      [OAE_TRADE_RESOURCE_ID, OAE_TRADE_SOURCE_ID, OAE_TRADE_DATASET_ID],
    );
  } catch {
    throw new HubRequestError(503, 'OAE_TRADE_UNAVAILABLE', 'ขณะนี้อ่านข้อมูล OAE จากคลังข้อมูลกลางไม่ได้');
  }
  return buildOaeTradeEnvelope(rows, selectedYearLabel);
}

export function unavailableOaeTradeEnvelope(): OaeTradeEnvelope {
  return {
    data: { ...baseData },
    meta: metaFor('unavailable', 'metadata_only', [
      'ขณะนี้อ่านข้อมูล OAE จากคลังข้อมูลกลางไม่ได้ กรุณาลองใหม่ภายหลัง',
    ]),
  };
}
