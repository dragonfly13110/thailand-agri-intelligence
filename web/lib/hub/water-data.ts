/**
 * RID medium-reservoir dataset — source contract plus the numeric payload
 * builders shared by `GET /api/v1/water/reservoirs` and the `/water` page.
 *
 * Source: กรมชลประทาน (RID) daily medium-reservoir report
 *   https://app.rid.go.th/reservoir/api/reservoir/public
 *
 * Governance:
 * - The register (`config/resource_licenses.json`) and the D1 `resources` row
 *   for this endpoint are `approved_public` with `project_publication_approved`
 *   set under AGENTS.md ข้อ 3 (owner-registered credentials), reviewed 2026-10-26.
 * - Numbers leave this module only through rows that were published to D1 as an
 *   active numeric run; the repository filter enforces
 *   `r.access_status='approved_public'`, `r.project_publication_approved=1` and
 *   `sync_runs.kind='numeric'` with status succeeded/partial. When D1 cannot be
 *   read the API and the page fall back to the metadata-only envelope, so an
 *   unavailable database can never be rendered as "no water".
 * - Grain is reservoir × report_date. There is no official province code on the
 *   source rows, so nothing here may be rolled up to a province average.
 */

export type WaterSourceMetadata = {
  sourceId: 'rid';
  sourceName: string;
  datasetName: string;
  description: string;
  sourceUrl: string;
  endpointUrl: string;
  grain: string;
  frequency: string;
  licenseStatus: 'approved_public' | 'pending' | 'restricted';
  access: 'approved_public' | 'metadata_only';
  publicationApproved: boolean;
  licenseReviewedAt: string;
  limitations: string[];
};

/** The D1 `resources.resource_id` of the RID public reservoir endpoint. */
export const RID_RESERVOIR_RESOURCE_URL = 'https://app.rid.go.th/reservoir/api/reservoir/public';

/** Metric ids written by `src/tadih/ingest_rid_d1.py` (adapter version 1.x). */
export const RID_METRIC_VOLUME = 'reservoir_volume';
export const RID_METRIC_PERCENT = 'reservoir_storage_pct';
export const RID_METRIC_CAPACITY = 'reservoir_capacity';

export const WATER_SOURCE_METADATA: WaterSourceMetadata = {
  sourceId: 'rid',
  sourceName: 'กรมชลประทาน (RID)',
  datasetName: 'รายงานสถานการณ์อ่างเก็บน้ำขนาดกลางรายวัน',
  description:
    'รายงานปริมาณน้ำ และสัดส่วนน้ำรายอ่างจากบริการสาธารณะของกรมชลประทาน ใช้เป็นแหล่งอ้างอิงระดับอ่างเก็บน้ำ ไม่ใช่ข้อมูลระดับจังหวัดหรือค่าเฉลี่ยจังหวัด',
  sourceUrl: 'https://app.rid.go.th/reservoir/api/document/reservoir',
  endpointUrl: 'https://app.rid.go.th/reservoir/api/reservoir/public',
  grain: 'reservoir × report_date',
  frequency: 'รายวัน',
  licenseStatus: 'approved_public',
  access: 'approved_public',
  publicationApproved: true,
  licenseReviewedAt: '2026-10-26',
  limitations: [
    'ต้นทางไม่ระบุหน่วยของ inflow/outflow จึงไม่นำสองค่านั้นขึ้นระบบ (unit = null ตามกฎห้ามเดาหน่วย)',
    'แถวต้นทางไม่มีรหัสจังหวัดทางการ จึงห้ามแปลงเป็นค่าเฉลี่ยหรือ coverage รายจังหวัด',
    'percent คำนวณจาก 100 × volume / storage และตรงกับ percent_storage ของต้นทางภายใน ±0.05 จุด อาจเกิน 100% เมื่ออ่างมีน้ำมากกว่าความจุออกแบบ',
    'ความจุเผยแพร่จากฟิลด์ storage ของต้นทางเป็น measure reservoir_capacity หน่วย MCM; อ่างที่ต้นทางไม่ให้ความจุคงเป็น null ห้ามเดาหรือแทนด้วย 0',
  ],
};

export const WATER_WARNINGS = [
  'ตัวเลขแสดงเฉพาะอ่างที่มี active numeric run ในคลังข้อมูลกลางเท่านั้น ถ้าอ่านคลังไม่พบจะกลับสู่สถานะ metadata-only',
  'หน่วยปริมาตรและความจุคือ MCM (ล้าน ลบ.ม.) ตามที่ต้นทางรายงาน; percent คำนวณจากปริมาตรหารด้วยความจุออกแบบ',
  'ข้อมูลระดับอ่างเก็บน้ำ ไม่ใช่ระดับจังหวัด ห้ามใช้แทนรายงานทางการของกรมชลประทาน',
  'inflow/outflow ยังไม่เผยแพร่ เพราะต้นทางไม่ระบุหน่วย',
];

export const WATER_FALLBACK_WARNINGS = [
  'ยังไม่เปิดเผยปริมาณน้ำ ความจุ เปอร์เซ็นต์ หรือจำนวนอ่างเก็บน้ำ เพราะอ่านคลังข้อมูลกลางไม่พบ active numeric batch ของทรัพยากรนี้',
  'shown values: none — response นี้เป็น metadata-only ไม่มีตัวเลขจากต้นทาง',
  'ค่าว่างหมายถึง "ยังไม่มีข้อมูลที่เผยแพร่ได้" ไม่ใช่ 0 หรือ "ไม่มีน้ำ"',
  'จะเปิดตัวเลขได้เมื่อ resource มี approved_public + project_publication_approved และมี run สถานะ succeeded/partial ใน D1',
];

export type WaterReservoirRecord = {
  reservoirId: string;
  name: string | null;
  region: string | null;
  reportDate: string | null;
  volumeMcm: number | null;
  storagePercent: number | null;
  /** Design capacity from the source `storage` field; null when the source omits it. */
  capacityMcm: number | null;
  volumeUnit: string | null;
  percentUnit: string | null;
  qualityStatus: string | null;
  method: string | null;
  reportedPercentStorage: number | null;
  sourceRowRef: string | null;
};

export type WaterSummary = {
  reportDate: string | null;
  reservoirCount: number;
  /** Sum of published volumes for one report date — not installed capacity. */
  totalVolumeMcm: number | null;
  /** Sum of the capacities the source actually reported for that date. */
  totalCapacityMcm: number | null;
  minStoragePercent: number | null;
  maxStoragePercent: number | null;
  aboveDesignCount: number;
  missingVolumeCount: number;
  missingPercentCount: number;
  missingCapacityCount: number;
  unitStatus: string;
};

export type WaterPayload = {
  source: WaterSourceMetadata;
  reservoirs: WaterReservoirRecord[];
  summary: WaterSummary | null;
};

export type WaterMetadataPayload = {
  source: WaterSourceMetadata;
  /** Always empty until an approved numeric batch is readable. */
  reservoirs: [];
  /** Always null: a zero/empty summary would be mistaken for observed data. */
  summary: null;
};

export function buildWaterMetadataPayload(): WaterMetadataPayload {
  return {
    source: WATER_SOURCE_METADATA,
    reservoirs: [],
    summary: null,
  };
}

/** The subset of a published observation row the water view needs. */
export type WaterObservationInput = {
  metricId: string | null;
  locationId: string | null;
  locationName: string | null;
  value: number | null;
  unit: string | null;
  periodEnd: string | null;
  qualityStatus: string | null;
  sourceRowRef: string | null;
  dimensions?: Record<string, unknown>;
};

function dimensionText(row: WaterObservationInput, key: string): string | null {
  const value = row.dimensions?.[key];
  return typeof value === 'string' && value.length ? value : null;
}

function dimensionNumber(row: WaterObservationInput, key: string): number | null {
  const value = row.dimensions?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pivot the three published RID metrics into one record per reservoir.
 *
 * Only rows of a single report date are combined: mixing dates inside one
 * "total volume" number would be a cross-period rollup the source never
 * publishes. Nulls stay null and are excluded from the sums, never treated
 * as zero.
 */
export function buildWaterPayload(rows: WaterObservationInput[]): WaterPayload | null {
  const dated = rows.filter((row) => row.periodEnd);
  if (!dated.length) return null;
  const reportDate = dated.reduce((max, row) => (String(row.periodEnd) > max ? String(row.periodEnd) : max), String(dated[0].periodEnd));
  const batch = dated.filter((row) => row.periodEnd === reportDate);
  if (!batch.length) return null;

  const byReservoir = new Map<string, WaterReservoirRecord>();
  for (const row of batch) {
    const reservoirId = row.locationId ?? dimensionText(row, 'providerReservoirId');
    if (!reservoirId) continue;
    const record = byReservoir.get(reservoirId) ?? {
      reservoirId,
      name: row.locationName,
      region: dimensionText(row, 'region'),
      reportDate,
      volumeMcm: null,
      storagePercent: null,
      capacityMcm: null,
      volumeUnit: null,
      percentUnit: null,
      qualityStatus: null,
      method: null,
      reportedPercentStorage: null,
      sourceRowRef: null,
    };
    if (row.metricId === RID_METRIC_VOLUME) {
      record.volumeMcm = row.value;
      record.volumeUnit = row.unit;
    } else if (row.metricId === RID_METRIC_PERCENT) {
      record.storagePercent = row.value;
      record.percentUnit = row.unit;
      record.method = dimensionText(row, 'method');
      record.reportedPercentStorage = dimensionNumber(row, 'reportedPercentStorage');
    } else if (row.metricId === RID_METRIC_CAPACITY) {
      record.capacityMcm = row.value;
    } else {
      continue;
    }
    // The metrics arrive as separate rows; descriptive fields are taken from
    // whichever row carries them first so a later row cannot blank them out.
    record.name = record.name ?? row.locationName;
    record.region = record.region ?? dimensionText(row, 'region');
    record.qualityStatus = record.qualityStatus ?? row.qualityStatus;
    record.sourceRowRef = record.sourceRowRef ?? row.sourceRowRef;
    byReservoir.set(reservoirId, record);
  }

  const reservoirs = [...byReservoir.values()].sort(
    (a, b) =>
      (a.storagePercent ?? Number.MAX_SAFE_INTEGER) - (b.storagePercent ?? Number.MAX_SAFE_INTEGER) ||
      a.reservoirId.localeCompare(b.reservoirId)
  );
  if (!reservoirs.length) return null;

  const volumes = reservoirs.map((row) => row.volumeMcm).filter((value): value is number => value !== null);
  const percents = reservoirs.map((row) => row.storagePercent).filter((value): value is number => value !== null);
  const capacities = reservoirs.map((row) => row.capacityMcm).filter((value): value is number => value !== null);

  const summary: WaterSummary = {
    reportDate,
    reservoirCount: reservoirs.length,
    totalVolumeMcm: volumes.length ? round2(volumes.reduce((sum, value) => sum + value, 0)) : null,
    // Only the reservoirs whose capacity the source actually reported are in
    // this total, so it is never presented as the installed capacity of the set.
    totalCapacityMcm: capacities.length ? round2(capacities.reduce((sum, value) => sum + value, 0)) : null,
    minStoragePercent: percents.length ? round2(Math.min(...percents)) : null,
    maxStoragePercent: percents.length ? round2(Math.max(...percents)) : null,
    aboveDesignCount: percents.filter((value) => value > 100).length,
    missingVolumeCount: reservoirs.length - volumes.length,
    missingPercentCount: reservoirs.length - percents.length,
    missingCapacityCount: reservoirs.length - capacities.length,
    unitStatus: volumes.length && reservoirs.every((row) => row.volumeMcm === null || row.volumeUnit === 'MCM')
      ? 'volume=MCM (ตามที่ต้นทางรายงาน)'
      : 'pending_official_confirmation',
  };

  return { source: WATER_SOURCE_METADATA, reservoirs, summary };
}
