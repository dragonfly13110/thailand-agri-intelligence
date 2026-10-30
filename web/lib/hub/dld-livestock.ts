import 'server-only';

import { D1_OBSERVATION_ROW_LIMIT, listD1Observations } from './d1-numeric-repository';
import type { D1ObservationRow } from './d1-numeric-repository';

/**
 * Read path for the five approved DLD province-count resources.
 *
 * Numbers only ever come from D1 observations of the active approved run —
 * never from the source API and never from demo values. Any row that breaks
 * the annual-province contract fails the whole species closed, because
 * silently dropping rows would hide a source or contract change.
 */

export type DldLivestockSpeciesId = 'cattle' | 'dairy' | 'swine' | 'poultry' | 'duck';

export type DldLivestockResource = {
  speciesId: DldLivestockSpeciesId;
  resourceId: string;
  datasetId: string;
  metricId: string;
  speciesLabel: string;
};

export const DLD_LIVESTOCK_PROVINCE_RESOURCES: Record<DldLivestockSpeciesId, DldLivestockResource> = {
  cattle: {
    speciesId: 'cattle',
    resourceId: 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',
    datasetId: '1bef9bc7-2f81-45c2-a21e-baba3743b456',
    metricId: 'beef_cattle_count',
    speciesLabel: 'จำนวนโคเนื้อ',
  },
  dairy: {
    speciesId: 'dairy',
    resourceId: '34dc17e6-7619-4194-89e7-99f4ece84b89',
    datasetId: 'eed9283e-51b2-4384-a9b6-245b0c8c7262',
    metricId: 'dairy_cattle_count',
    speciesLabel: 'จำนวนโคนม',
  },
  swine: {
    speciesId: 'swine',
    resourceId: '47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a',
    datasetId: '161c766e-3ab4-475f-9976-60cfa1b7ada4',
    metricId: 'swine_count',
    speciesLabel: 'จำนวนสุกร',
  },
  poultry: {
    speciesId: 'poultry',
    resourceId: '64366e81-13d2-485a-82a1-3ddc2d89869b',
    datasetId: 'ae4d2bdf-5cff-482f-86f4-aea93a51c018',
    metricId: 'poultry_count',
    speciesLabel: 'จำนวนไก่',
  },
  duck: {
    speciesId: 'duck',
    resourceId: 'c97081bc-e59d-47e1-aac9-0905b8983e08',
    datasetId: '58d2c7a6-14eb-4703-a113-403c0fc86f4b',
    metricId: 'duck_count',
    speciesLabel: 'จำนวนเป็ด',
  },
};

const MAX_DLD_LIVESTOCK_ROWS = 5_000;

export type DldLivestockRow = {
  rowKey: string;
  sourceYearBe: number;
  provinceCode: string | null;
  provinceName: string | null;
  regionLabel: string | null;
  value: number | null;
  unit: string | null;
  qualityStatus: string | null;
};

export type DldLivestockProvenance = {
  runId: string;
  runStatus: string | null;
  adapterVersion: string | null;
  payloadSha256: string | null;
  sourceRetrievedAt: string | null;
  revisionId: string | null;
  rowCount: number;
};

export type DldLivestockSpeciesState =
  | { state: 'real'; rows: DldLivestockRow[]; provenance: DldLivestockProvenance }
  | { state: 'empty'; rows: []; provenance: null; note: string }
  | { state: 'unavailable'; rows: []; provenance: null; note: string; errorCode: string };

function sourceYearBe(row: D1ObservationRow): number | null {
  const value = row.dimensions.sourceYearBe;
  return typeof value === 'number' && Number.isInteger(value) && value >= 2400 && value <= 9999 ? value : null;
}

function mapRow(row: D1ObservationRow): DldLivestockRow | null {
  const sourceYearBeValue = sourceYearBe(row);
  const region = row.dimensions.regionSource;
  if (sourceYearBeValue === null || row.periodStart !== null || row.periodEnd !== null || row.observedAt !== null) {
    return null;
  }
  return {
    rowKey: row.rowKey,
    sourceYearBe: sourceYearBeValue,
    provinceCode: row.provinceCode,
    provinceName: row.locationName,
    regionLabel: typeof region === 'string' && region.trim() ? region.trim() : null,
    value: row.value,
    unit: row.unit,
    qualityStatus: row.qualityStatus,
  };
}

function distinct(values: Array<string | null>): number {
  return new Set(values.map((value) => value ?? '')).size;
}

function rowFailure(errorCode: string): DldLivestockSpeciesState {
  return {
    state: 'unavailable',
    rows: [],
    provenance: null,
    errorCode,
    note: 'แถวในคลังข้อมูลไม่ตรงสัญญาปี×จังหวัดของกรมปศุสัตว์ จึงไม่แสดงตัวเลขชุดนี้',
  };
}

async function readObservations(resource: DldLivestockResource): Promise<{ rows: D1ObservationRow[]; total: number }> {
  const filters = {
    sourceId: 'dld',
    resourceId: resource.resourceId,
    metricId: resource.metricId,
    locationKind: 'province',
  } as const;
  const firstPage = await listD1Observations(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset: 0 });
  const rows = [...firstPage.rows];
  for (let offset = D1_OBSERVATION_ROW_LIMIT; offset < firstPage.total; offset += D1_OBSERVATION_ROW_LIMIT) {
    const page = await listD1Observations(filters, { limit: D1_OBSERVATION_ROW_LIMIT, offset });
    if (page.total !== firstPage.total) {
      throw new Error('DLD_TOTAL_CHANGED_DURING_READ');
    }
    rows.push(...page.rows);
  }
  if (rows.length !== firstPage.total) {
    throw new Error('DLD_ROWS_INCOMPLETE');
  }
  return { rows, total: firstPage.total };
}

export async function loadDldLivestockSpecies(speciesId: DldLivestockSpeciesId): Promise<DldLivestockSpeciesState> {
  const resource = DLD_LIVESTOCK_PROVINCE_RESOURCES[speciesId];
  let observed: { rows: D1ObservationRow[]; total: number };
  try {
    observed = await readObservations(resource);
  } catch {
    return {
      state: 'unavailable',
      rows: [],
      provenance: null,
      errorCode: 'DLD_DATA_UNAVAILABLE',
      note: 'ขณะนี้อ่านคลังข้อมูลกลางไม่ได้ หน้าเว็บจึงไม่แสดงตัวเลขสำหรับชนิดนี้',
    };
  }
  const { rows: sourceRows, total } = observed;
  if (total === 0) {
    return {
      state: 'empty',
      rows: [],
      provenance: null,
      note: 'ทรัพยากรนี้ได้รับสิทธิ์แล้ว แต่ยังไม่มีแถวตัวเลขที่เผยแพร่ในคลังข้อมูลกลาง (ยังไม่ได้ ingest หรือยังไม่มี run ที่อนุมัติ)',
    };
  }
  if (total > MAX_DLD_LIVESTOCK_ROWS || sourceRows.length !== total) {
    return rowFailure('DLD_DATASET_TOO_LARGE');
  }
  // One species snapshot must come from one run, one revision, one retrieval.
  if (distinct(sourceRows.map((row) => row.runId)) !== 1
      || distinct(sourceRows.map((row) => row.payloadSha256)) !== 1
      || distinct(sourceRows.map((row) => row.sourceRetrievedAt)) !== 1
      || distinct(sourceRows.map((row) => row.adapterVersion)) !== 1
      || distinct(sourceRows.map((row) => {
        const value = row.quality.revisionId;
        return typeof value === 'string' && value.length > 0 ? value : null;
      })) !== 1) {
    return rowFailure('DLD_SNAPSHOT_CHANGED');
  }
  const mapped = sourceRows.map(mapRow);
  if (mapped.some((row) => row === null)) {
    return rowFailure('DLD_SOURCE_YEAR_CONTRACT_INVALID');
  }
  const rows = mapped as DldLivestockRow[];
  const rowKeys = new Set(rows.map((row) => row.rowKey));
  if (rowKeys.size !== rows.length) {
    return rowFailure('DLD_DUPLICATE_ROW');
  }
  const first = sourceRows[0];
  const revision = first.quality.revisionId;
  return {
    state: 'real',
    rows,
    provenance: {
      runId: first.runId,
      runStatus: first.runStatus,
      adapterVersion: first.adapterVersion,
      payloadSha256: first.payloadSha256,
      sourceRetrievedAt: first.sourceRetrievedAt,
      revisionId: typeof revision === 'string' && revision.length > 0 ? revision : null,
      rowCount: total,
    },
  };
}
