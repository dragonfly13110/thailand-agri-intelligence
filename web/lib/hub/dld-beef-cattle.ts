import 'server-only';

import { queryD1 } from './d1';
import { HubRequestError } from './http';
import { D1_OBSERVATION_ROW_LIMIT, listD1Observations, listD1Records } from './d1-numeric-repository';
import type { ApiMeta } from './types';
import type { D1ObservationRow } from './d1-numeric-repository';

export const DLD_BEEF_CATTLE_DATASET_ID = '1bef9bc7-2f81-45c2-a21e-baba3743b456';
export const DLD_BEEF_CATTLE_RESOURCE_ID = 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b';
export const DLD_BEEF_CATTLE_SOURCE_URL =
  'https://dld.gdcatalog.go.th/api/3/action/datastore_search?resource_id=' +
  DLD_BEEF_CATTLE_RESOURCE_ID + '&limit=500';

const MAX_DLD_BEEF_CATTLE_ROWS = 5_000;

export type DldBeefCattleRow = {
  rowKey: string;
  provinceCode: string | null;
  provinceName: string | null;
  sourceYearBe: number;
  periodLabel: string | null;
  value: number | null;
  unit: string | null;
  sourceRowRef: string | null;
  revisionId: string | null;
  qualityStatus: string | null;
};

export type DldBeefCattleSnapshot = {
  runId: string;
  runStatus: 'succeeded' | 'partial';
  sourceRevisionId: string;
  sourceRetrievedAt: string;
  payloadSha256: string;
  adapterVersion: string;
  rowCount: number;
};

export type DldBeefCattleData = {
  datasetId: string;
  resourceId: string;
  sourceName: string;
  sourceUrl: string;
  measure: 'beef_cattle_count';
  sourceLicenseStatus: 'unverified';
  publicationAuthorization: 'project_owner_instruction';
  sourceGrain: 'province × Buddhist source-year label';
  referenceYearConvention: 'unverified';
  unit: string | null;
  availableSourceYearsBe: number[];
  selectedSourceYearBe: number | null;
  rowCount: number;
  rows: DldBeefCattleRow[];
  adapterVersion: string | null;
  sourceRevisionIds: Array<string | null>;
  snapshot: DldBeefCattleSnapshot | null;
};

export type DldBeefCattleEnvelope = { data: DldBeefCattleData; meta: ApiMeta };

type RecordEnvelope = {
  meta: ApiMeta;
  pagination?: { total: number };
};

function yearLabel(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2400 && value <= 9999 ? value : null;
}

function revisionId(row: D1ObservationRow): string | null {
  const value = row.quality.revisionId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapDldRow(row: D1ObservationRow): DldBeefCattleRow {
  const sourceYearBe = yearLabel(row.dimensions.sourceYearBe);
  if (sourceYearBe === null || row.periodStart !== null || row.periodEnd !== null || row.observedAt !== null) {
    throw new HubRequestError(503, 'DLD_SOURCE_YEAR_CONTRACT_INVALID', 'ข้อมูลรายปีจากกรมปศุสัตว์มีรูปแบบปีหรือวันที่ไม่ตรงสัญญา');
  }
  if (row.locationKind !== 'province') {
    throw new HubRequestError(503, 'DLD_GRAIN_CONTRACT_INVALID', 'ข้อมูลกรมปศุสัตว์ไม่อยู่ในเกรนระดับจังหวัด');
  }
  return {
    rowKey: row.rowKey,
    provinceCode: row.provinceCode,
    provinceName: row.locationName,
    sourceYearBe,
    periodLabel: row.periodLabel,
    value: row.value,
    unit: row.unit,
    sourceRowRef: row.sourceRowRef,
    revisionId: revisionId(row),
    qualityStatus: row.qualityStatus,
  };
}

function truthfulWarnings(meta: ApiMeta, hasSelectedYear: boolean, hasRows: boolean, revisionIds: Array<string | null>) {
  const warnings: string[] = [
    'ยังไม่ยืนยันว่าปี พ.ศ. จากต้นทางเป็นปีปฏิทินหรือปีงบประมาณ',
    'สิทธิ์เผยแพร่ใน Hub อิงคำสั่งเจ้าของโครงการ; เงื่อนไขสัญญาอนุญาตต้นทางยังไม่ยืนยัน',
  ];
  if (meta.access === 'metadata_only') {
    warnings.push('ยังไม่มีตัวเลขที่เผยแพร่จากทรัพยากรนี้');
  } else if (!hasRows && meta.availability === 'empty') {
    warnings.push('ทรัพยากรที่อนุมัติแล้วไม่มีแถวตัวเลขที่อ่านได้ในขณะนี้');
  } else if (hasSelectedYear && !hasRows) {
    warnings.push('ไม่พบแถวสำหรับปี พ.ศ. ที่เลือก');
  } else if (!hasRows && meta.availability === 'ready') {
    warnings.push('ไม่พบแถวที่ตรงกับตัวชี้วัดและเกรนที่หน้าเว็บรองรับ');
  }
  if (meta.completeness === 'partial') {
    warnings.push('run ปัจจุบันถูกระบุว่า partial; จำนวนแถวไม่ใช้ยืนยัน coverage จังหวัด');
  }
  if (revisionIds.length > 1) {
    warnings.push('พบ revision หลายค่าในแถวที่อ่านได้; แสดง revision แยกตามแถว');
  }
  return warnings;
}

export function buildDldBeefCattleEnvelope(
  sourceRows: D1ObservationRow[],
  sourceMeta: ApiMeta,
  selectedSourceYearBe: number | null = null,
  snapshot: DldBeefCattleSnapshot | null = null,
): DldBeefCattleEnvelope {
  const rows = sourceRows.map(mapDldRow);
  const availableSourceYearsBe = [...new Set(rows.map(row => row.sourceYearBe))].sort((a, b) => b - a);
  const selectedRows = selectedSourceYearBe === null
    ? rows
    : rows.filter(row => row.sourceYearBe === selectedSourceYearBe);
  const unitValues = new Set(selectedRows.map(row => row.unit));
  const revisionIds = [...new Set(selectedRows.map(row => row.revisionId))];
  const unit = unitValues.size === 1 ? selectedRows[0]?.unit ?? null : null;
  const availability = selectedRows.length > 0
    ? 'ready'
    : sourceMeta.availability === 'ready' ? 'empty' : sourceMeta.availability;
  const meta: ApiMeta = {
    ...sourceMeta,
    availability,
    sourceIds: ['dld'],
    dataAsOf: null,
    warnings: truthfulWarnings(sourceMeta, selectedSourceYearBe !== null, selectedRows.length > 0, revisionIds),
    runtimeMode: 'database',
  };
  return {
    data: {
      datasetId: DLD_BEEF_CATTLE_DATASET_ID,
      resourceId: DLD_BEEF_CATTLE_RESOURCE_ID,
      sourceName: 'กรมปศุสัตว์',
      sourceUrl: DLD_BEEF_CATTLE_SOURCE_URL,
      measure: 'beef_cattle_count',
      sourceLicenseStatus: 'unverified',
      publicationAuthorization: 'project_owner_instruction',
      sourceGrain: 'province × Buddhist source-year label',
      referenceYearConvention: 'unverified',
      unit,
      availableSourceYearsBe,
      selectedSourceYearBe,
      rowCount: selectedRows.length,
      rows: selectedRows,
      adapterVersion: sourceRows[0]?.adapterVersion ?? null,
      sourceRevisionIds: revisionIds,
      snapshot,
    },
    meta,
  };
}

type SnapshotQueryRow = {
  runId: unknown;
  runStatus: unknown;
  sourceRevisionId: unknown;
  sourceRetrievedAt: unknown;
  payloadSha256: unknown;
  adapterVersion: unknown;
  rowCount: unknown;
  revisionCount: unknown;
  missingRevisionCount: unknown;
  minimumRevisionId: unknown;
  maximumRevisionId: unknown;
};

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function readActiveSnapshot(): Promise<DldBeefCattleSnapshot & { rowCount: number } | null> {
  const rows = await queryD1<SnapshotQueryRow>(
    'SELECT run.run_id AS runId,run.status AS runStatus,run.source_revision_id AS sourceRevisionId,' +
      'run.source_retrieved_at AS sourceRetrievedAt,run.payload_sha256 AS payloadSha256,' +
      'run.adapter_version AS adapterVersion,COUNT(o.row_key) AS rowCount,' +
      "COUNT(DISTINCT json_extract(o.quality,'$.revisionId')) AS revisionCount," +
      "SUM(CASE WHEN json_extract(o.quality,'$.revisionId') IS NULL THEN 1 ELSE 0 END) AS missingRevisionCount," +
      "MIN(json_extract(o.quality,'$.revisionId')) AS minimumRevisionId," +
      "MAX(json_extract(o.quality,'$.revisionId')) AS maximumRevisionId " +
      'FROM resources r JOIN sync_runs run ON run.resource_id=r.resource_id AND run.run_id=r.active_run_id ' +
      "LEFT JOIN observations o ON o.resource_id=r.resource_id AND o.run_id=run.run_id " +
      "AND o.metric_id='beef_cattle_count' AND o.location_kind='province' " +
      "WHERE r.resource_id=? AND r.access_status='approved_public' AND r.project_publication_approved=1 " +
      "AND run.kind='numeric' AND run.status IN ('succeeded','partial') " +
      'GROUP BY run.run_id,run.status,run.source_revision_id,run.source_retrieved_at,' +
      'run.payload_sha256,run.adapter_version LIMIT 1',
    [DLD_BEEF_CATTLE_RESOURCE_ID],
  );
  const row = rows[0];
  if (!row) return null;
  const runId = requiredText(row.runId);
  const runStatus = row.runStatus === 'succeeded' || row.runStatus === 'partial' ? row.runStatus : null;
  const sourceRevisionId = requiredText(row.sourceRevisionId);
  const sourceRetrievedAt = requiredText(row.sourceRetrievedAt);
  const payloadSha256 = requiredText(row.payloadSha256);
  const adapterVersion = requiredText(row.adapterVersion);
  const rowCount = Number(row.rowCount);
  const revisionCount = Number(row.revisionCount);
  const missingRevisionCount = Number(row.missingRevisionCount);
  if (!runId || !runStatus || !sourceRevisionId || !sourceRetrievedAt || !payloadSha256 || !adapterVersion
      || !Number.isInteger(rowCount) || rowCount <= 0 || revisionCount !== 1 || missingRevisionCount !== 0
      || row.minimumRevisionId !== sourceRevisionId || row.maximumRevisionId !== sourceRevisionId) {
    throw new HubRequestError(503, 'DLD_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
  }
  return { runId, runStatus, sourceRevisionId, sourceRetrievedAt, payloadSha256, adapterVersion, rowCount };
}

function sameSnapshot(
  a: DldBeefCattleSnapshot & { rowCount: number },
  b: DldBeefCattleSnapshot & { rowCount: number },
): boolean {
  return a.runId === b.runId
    && a.runStatus === b.runStatus
    && a.sourceRevisionId === b.sourceRevisionId
    && a.sourceRetrievedAt === b.sourceRetrievedAt
    && a.payloadSha256 === b.payloadSha256
    && a.adapterVersion === b.adapterVersion
    && a.rowCount === b.rowCount;
}

function assertMetaMatchesSnapshot(meta: ApiMeta, snapshot: DldBeefCattleSnapshot & { rowCount: number }): void {
  const completeness = snapshot.runStatus === 'partial' ? 'partial' : 'complete';
  if (meta.datasetVersion !== snapshot.payloadSha256
      || meta.sourceRetrievedAt !== snapshot.sourceRetrievedAt
      || meta.completeness !== completeness
      || meta.access !== 'approved_public'
      || meta.availability !== 'ready') {
    throw new HubRequestError(503, 'DLD_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
  }
}

function assertRowsMatchSnapshot(
  rows: D1ObservationRow[],
  snapshot: DldBeefCattleSnapshot & { rowCount: number },
): void {
  if (rows.some(row => row.resourceId !== DLD_BEEF_CATTLE_RESOURCE_ID
      || row.runId !== snapshot.runId
      || row.runStatus !== snapshot.runStatus
      || row.payloadSha256 !== snapshot.payloadSha256
      || row.sourceRetrievedAt !== snapshot.sourceRetrievedAt
      || row.adapterVersion !== snapshot.adapterVersion
      || revisionId(row) !== snapshot.sourceRevisionId)) {
    throw new HubRequestError(503, 'DLD_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
  }
}

export async function loadDldBeefCattleEnvelope(
  selectedSourceYearBe: number | null = null,
): Promise<DldBeefCattleEnvelope> {
  const metaUrl = new URL('https://hub.local/api/v1/datasets/' + DLD_BEEF_CATTLE_DATASET_ID + '/records');
  metaUrl.searchParams.set('resourceId', DLD_BEEF_CATTLE_RESOURCE_ID);
  metaUrl.searchParams.set('pageSize', '1');
  const metaResponse = await listD1Records(DLD_BEEF_CATTLE_DATASET_ID, metaUrl);
  if (!metaResponse.ok) {
    throw new HubRequestError(503, 'DLD_DATA_UNAVAILABLE', 'ขณะนี้อ่านข้อมูลกรมปศุสัตว์ไม่ได้');
  }
  const recordEnvelope = await metaResponse.json() as RecordEnvelope;
  const sourceMeta = recordEnvelope.meta;
  if (sourceMeta.availability !== 'ready') {
    return buildDldBeefCattleEnvelope([], sourceMeta, selectedSourceYearBe);
  }

  const snapshotBefore = await readActiveSnapshot();
  if (!snapshotBefore) {
    throw new HubRequestError(503, 'DLD_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
  }
  assertMetaMatchesSnapshot(sourceMeta, snapshotBefore);

  const filters = {
    sourceId: 'dld',
    resourceId: DLD_BEEF_CATTLE_RESOURCE_ID,
    metricId: 'beef_cattle_count',
    locationKind: 'province',
  } as const;
  const firstPage = await listD1Observations(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0 });
  const total = firstPage.total;
  if (total !== snapshotBefore.rowCount) {
    throw new HubRequestError(503, 'DLD_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
  }
  if (total > MAX_DLD_BEEF_CATTLE_ROWS) {
    throw new HubRequestError(503, 'DLD_DATASET_TOO_LARGE', 'ข้อมูลชุดนี้มีขนาดเกินขอบเขตการอ่านของหน้าเว็บ');
  }

  const sourceRows = [...firstPage.rows];
  assertRowsMatchSnapshot(firstPage.rows, snapshotBefore);
  for (let offset = D1_OBSERVATION_ROW_LIMIT; offset < total; offset += D1_OBSERVATION_ROW_LIMIT) {
    const page = await listD1Observations(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset });
    if (page.total !== total) {
      throw new HubRequestError(503, 'DLD_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
    }
    assertRowsMatchSnapshot(page.rows, snapshotBefore);
    sourceRows.push(...page.rows);
  }
  if (sourceRows.length !== total) {
    throw new HubRequestError(503, 'DLD_SNAPSHOT_INCOMPLETE', 'อ่านแถวข้อมูลได้ไม่ครบ กรุณาลองใหม่');
  }
  const rowKeys = new Set<string>();
  for (const row of sourceRows) {
    if (rowKeys.has(row.rowKey)) {
      throw new HubRequestError(503, 'DLD_SNAPSHOT_INCOMPLETE', 'พบแถวซ้ำระหว่างการอ่าน กรุณาลองใหม่');
    }
    rowKeys.add(row.rowKey);
  }
  const snapshotAfter = await readActiveSnapshot();
  if (!snapshotAfter || !sameSnapshot(snapshotBefore, snapshotAfter)) {
    throw new HubRequestError(503, 'DLD_SNAPSHOT_CHANGED', 'ข้อมูลเปลี่ยนระหว่างการอ่าน กรุณาลองใหม่');
  }
  assertMetaMatchesSnapshot(sourceMeta, snapshotAfter);
  return buildDldBeefCattleEnvelope(sourceRows, sourceMeta, selectedSourceYearBe, snapshotBefore);
}
