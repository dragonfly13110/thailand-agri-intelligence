import 'server-only';

/**
 * อ่านจำนวนสหกรณ์การเกษตร "จริง" ของทรัพยากร CPD ที่อนุมัติไว้ จากคลัง D1
 *
 * ทำไมถึงอยู่ไฟล์นี้ (lane L2):
 * - `config/resource_licenses.json` อนุมัติ `cpd_agricultural_coop_counts` เป็น
 *   approved_public พร้อมคำสั่งเจ้าของโครงการ (AGENTS.md ข้อ 3) เฉพาะ resource id
 *   `44463650-5d2e-482b-9919-b1c5b8bc5c6b` ฝั่ง Python
 *   (`src/tadih/ingest_cpd_agricultural_coop_counts_d1.py`) เป็นผู้เขียนแถวลงตาราง
 *   `observations`/`locations` ที่มีอยู่แล้ว ไฟล์นี้จึงเป็นทางอ่านเท่านั้น ไม่ได้สร้าง schema ใหม่
 * - เกรนต้นทางคือ ป้ายจังหวัด × หน่วยงานสังกัด × คอลัมน์สถานะ × ป้ายปีต้นทาง
 *   ทุกมิติจึงถูกส่งขึ้นหน้าเว็บครบ และ "ไม่มีการบวกข้ามมิติ" ใด ๆ
 * - ป้ายปี (เช่น 2568) มาจากชื่อทรัพยากรต้นทาง ยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ
 *   จึงคงเป็นข้อความ ไม่แปลงเป็นวันที่ และ `meta.dataAsOf` เป็น null เสมอ
 * - ไฟล์ CSV ต้นทางไม่มีคอลัมน์หน่วยนับ คำที่พบในคอลัมน์ `unit` เป็น classifier ที่
 *   adapter เพิ่มเอง ยังไม่ยืนยัน สัญญาชั้นอ่านจึงปล่อย `unit = null` และเก็บค่าที่บันทึก
 *   ไว้จริงไว้ใน `storedUnitLabels` เพื่อการตรวจสอบเท่านั้น
 * - ถ้าคลังอ่านไม่ได้หรือไม่มีแถว ชั้นอ่านคืน unavailable / metadata_only / empty เท่านั้น
 *   ห้ามไหลกลับไปใช้ตัวเลข sample ของ `cooperatives-data.ts`
 * - การอ่านแถวเดิมซ้ำต้องได้ "byte เดียวกัน": ไม่มีนาฬิการะบบใน payload (meta.retrievedAt = null)
 *   และแถวถูกเรียงด้วย total order ที่ประกาศไว้ (compareCountRows) จึงไม่พึ่งลำดับที่คลังส่งมา
 */

import { queryD1 } from './d1';
import { HubRequestError } from './http';
import type { ApiMeta } from './types';

export const CPD_COOP_SOURCE_ID = 'cpd';
export const CPD_COOP_RESOURCE_KEY = 'cpd_agricultural_coop_counts';
export const CPD_COOP_DATASET_ID = '7e7e236d-790d-489d-a723-e0b1359530a4';
export const CPD_COOP_RESOURCE_ID = '44463650-5d2e-482b-9919-b1c5b8bc5c6b';
export const CPD_COOP_CATALOG_URL =
  'https://catalog-cpd.data.go.th/api/3/action/package_show?id=' + CPD_COOP_DATASET_ID;
export const CPD_COOP_RESOURCE_URL =
  'https://catalog-cpd.data.go.th/dataset/' + CPD_COOP_DATASET_ID + '/resource/'
  + CPD_COOP_RESOURCE_ID + '/download/st_001_01.csv';
export const CPD_COOP_SOURCE_GRAIN =
  'ป้ายจังหวัดต้นทาง × หน่วยงานสังกัด × คอลัมน์สถานะต้นทาง × ป้ายปีต้นทาง';
export const CPD_COOP_YEAR_LABEL_ORIGIN = 'resource_name';
export const CPD_COOP_YEAR_CONVENTION = 'unknown';
export const CPD_COOP_UNIT_STATUS = 'pending_official_confirmation';

/** เพดานอ่านหนึ่งรอบ (ต้นทางปัจจุบัน 78 แถว × 3 สถานะ = 234 แถว) เผื่อการเติบโตของแหล่ง */
export const CPD_COOP_MAX_ROWS = 1_000;

export type CpdCoopSourceStatusId = 'not_started' | 'operating' | 'dissolved';

export interface CpdCoopSourceStatusDefinition {
  id: CpdCoopSourceStatusId;
  /** ค่าใน `observations.metric_id` ที่ตัวเขียนฝั่ง Python บันทึกไว้ */
  metricId: string;
  /** หัวข้อคอลัมน์ในไฟล์ CSV ต้นทาง ใช้เป็นป้ายกำกับ ไม่ใช่ชื่อที่ตั้งเอง */
  sourceColumn: string;
  labelThai: string;
}

/** ลำดับคงตามคอลัมน์ซ้าย→ขวาของไฟล์ต้นทาง ทำให้อันดับแถวและตัวเลือกคงที่ */
export const CPD_COOP_SOURCE_STATUSES: readonly CpdCoopSourceStatusDefinition[] = [
  {
    id: 'not_started',
    metricId: 'agricultural_cooperative_count_not_started',
    sourceColumn: 'ยังไม่เริ่มดำเนินการ',
    labelThai: 'ยังไม่เริ่มดำเนินการ',
  },
  {
    id: 'operating',
    metricId: 'agricultural_cooperative_count_operating',
    sourceColumn: 'ดำเนินการ',
    labelThai: 'ดำเนินการ',
  },
  {
    id: 'dissolved',
    metricId: 'agricultural_cooperative_count_dissolved',
    sourceColumn: 'เลิกสหกรณ์',
    labelThai: 'เลิกสหกรณ์',
  },
];

const STATUS_BY_METRIC = new Map<string, CpdCoopSourceStatusDefinition>();
const STATUS_BY_ID = new Map<string, CpdCoopSourceStatusDefinition>();
/** ลำดับคอลัมน์ซ้าย→ขวาของไฟล์ต้นทาง ใช้แทน findIndex เพื่อให้การเทียบแถวคงที่และอ่านง่าย */
const STATUS_ORDINAL = new Map<CpdCoopSourceStatusId, number>();
CPD_COOP_SOURCE_STATUSES.forEach((definition, index) => {
  STATUS_BY_METRIC.set(definition.metricId, definition);
  STATUS_BY_ID.set(definition.id, definition);
  STATUS_ORDINAL.set(definition.id, index);
});

export interface CpdCoopCountsFilters {
  /** รหัสจังหวัด 2 หลักจากการ crosswalk ของตัวเขียน (ไม่ใช่ป้ายจังหวัดจากต้นทาง) */
  provinceCode?: string | null;
  sourceStatus?: CpdCoopSourceStatusId | null;
  /** ป้ายปีต้นทางแบบข้อความ ไม่ตีความเป็นปีปฏิทินหรือปีงบประมาณ */
  sourceYearLabel?: string | null;
}

export interface CpdCoopCountRow {
  rowKey: string;
  provinceCode: string;
  provinceName: string;
  /** ป้ายจังหวัดตามที่ต้นทางเขียนมา คงช่องว่างเดิมไว้ ไม่ได้ normalize */
  sourceProvinceLabel: string;
  reportingUnit: string;
  sourceStatus: CpdCoopSourceStatusId;
  sourceStatusLabel: string;
  sourceStatusColumn: string;
  metricId: string;
  metricName: string | null;
  product: string | null;
  /** ค่าจริงจากต้นทาง ไม่มีข้อมูลเป็น null เสมอ (0 คนละความหมายกับไม่มีข้อมูล) */
  value: number | null;
  /** หน่วยที่ต้นทางยืนยัน — ทรัพยากรนี้ยังไม่มี จึงเป็น null ตามสัญญา */
  unit: null;
  unitStatus: typeof CPD_COOP_UNIT_STATUS;
  /** ค่าที่ตัวเขียนบันทึกในคอลัมน์ unit เพื่อตรวจสอบ ไม่ใช่การยืนยันหน่วยนับ */
  storedUnit: string | null;
  qualityStatus: 'good' | 'missing';
  sourceYearLabel: string;
  sourceRowRef: string;
  sourceUrl: string | null;
  licenseStatus: string | null;
  revisionId: string | null;
  locationId: string | null;
}

export interface CpdCoopProvenance {
  sourceName: string | null;
  sourceId: string;
  datasetId: string;
  datasetTitle: string | null;
  resourceId: string;
  resourceName: string | null;
  resourceUrl: string | null;
  catalogUrl: string;
  attributionText: string | null;
  attributionUrl: string | null;
  declaredLicenseId: string | null;
  declaredLicenseUrl: string | null;
  declaredLicenseVersion: string | null;
  sourceLicenseReviewStatus: string | null;
  publicationAuthorizationBasis: string | null;
  publicationAuthorizationScope: string[];
  sourceLicenseVerified: boolean | null;
  unresolvedSourceTerms: string[];
  resourceGrain: string | null;
  resourceSourceUpdatedAt: string | null;
  accessStatus: string | null;
  projectPublicationApproved: boolean | null;
}

export interface CpdCoopRunSnapshot {
  runId: string;
  status: 'succeeded' | 'partial';
  adapterVersion: string;
  payloadSha256: string;
  sourceRetrievedAt: string;
  completedAt: string;
  recordsWritten: number;
  rowCount: number;
}

export interface CpdCoopCountsData {
  /** ชุดนี้คือข้อมูลจริงที่อ่านจากคลัง ไม่ใช่ค่าจำลอง และไม่มีเส้นทางสลับกลับเป็น sample */
  sample: false;
  resourceKey: typeof CPD_COOP_RESOURCE_KEY;
  sourceGrain: typeof CPD_COOP_SOURCE_GRAIN;
  yearLabelOrigin: typeof CPD_COOP_YEAR_LABEL_ORIGIN;
  yearConvention: typeof CPD_COOP_YEAR_CONVENTION;
  unit: null;
  unitStatus: typeof CPD_COOP_UNIT_STATUS;
  storedUnitLabels: string[];
  rows: CpdCoopCountRow[];
  /** ป้ายปีที่พบจริงในแถวของรอบข้อมูล เรียงตามข้อความ ไม่ได้แปลว่าเป็นลำดับเวลา */
  availableSourceYearLabels: string[];
  availableReportingUnits: string[];
  availableProvinces: Array<{ provinceCode: string; provinceName: string }>;
  filters: Required<CpdCoopCountsFilters>;
  counts: {
    /** จำนวนแถวที่เกรนต้นทางหลังกรอง ไม่ใช่จำนวนสหกรณ์ */
    rowCount: number;
    rowsWithValue: number;
    rowsMissing: number;
    provinceCodeCount: number;
    reportingUnitCount: number;
    sourceStatusCount: number;
    sourceProvinceLabelCount: number;
  };
  /** ไม่มีการรวมค่าข้ามหน่วยงาน/สถานะ/ปี จึงไม่มียอดรวมทุกรูปแบบใน payload */
  derivedTotalsProvided: false;
  coverageClaim: false;
  coverageNote: string;
  provenance: CpdCoopProvenance;
  snapshot: CpdCoopRunSnapshot | null;
  warnings: string[];
}

export interface CpdCoopCountsEnvelope {
  data: CpdCoopCountsData;
  meta: ApiMeta;
}

export type CpdCoopQueryRow = Record<string, unknown>;

const EMPTY_PROVENANCE: CpdCoopProvenance = {
  sourceName: null,
  sourceId: CPD_COOP_SOURCE_ID,
  datasetId: CPD_COOP_DATASET_ID,
  datasetTitle: null,
  resourceId: CPD_COOP_RESOURCE_ID,
  resourceName: null,
  resourceUrl: null,
  catalogUrl: CPD_COOP_CATALOG_URL,
  attributionText: null,
  attributionUrl: null,
  declaredLicenseId: null,
  declaredLicenseUrl: null,
  declaredLicenseVersion: null,
  sourceLicenseReviewStatus: null,
  publicationAuthorizationBasis: null,
  publicationAuthorizationScope: [],
  sourceLicenseVerified: null,
  unresolvedSourceTerms: [],
  resourceGrain: null,
  resourceSourceUpdatedAt: null,
  accessStatus: null,
  projectPublicationApproved: null,
};

const COVERAGE_NOTE =
  'จำนวนจังหวัดและหน่วยงานสังกัดที่อ่านได้ในหน้านี้ คือสิ่งที่อ่านได้จากแถวในคลังข้อมูลกลางขณะนี้ '
  + 'ไม่ใช่ข้อสรุปว่าต้นทางมีข้อมูลครบทุกจังหวัด หรือครอบคลุมทั้งประเทศ '
  + 'และทะเบียนรหัสจังหวัด 77 รายการของหน้านี้ก็ไม่ใช่ขอบเขตข้อมูลของทรัพยากรนี้';

const UNVERIFIED_TERMS_WARNING =
  'สิทธิ์เผยแพร่ใน Hub มาจากคำสั่งเจ้าของโครงการสำหรับ resource id นี้เท่านั้น '
  + 'เงื่อนไขสัญญาอนุญาตและการนำไปใช้ซ้ำของต้นทางยังไม่ยืนยัน รวมถึงสิทธิ์เชิงพาณิชย์';

const NO_DATE_AS_OF_WARNING =
  'ป้ายปีจากชื่อทรัพยากรต้นทางยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ จึงไม่ตั้ง dataAsOf';

/** การอ่านซ้ำของแถวเดิมต้องได้ byte เดียวกัน → ไม่มีนาฬิการะบบใน payload นี้ */
const NO_WALL_CLOCK_WARNING =
  'payload นี้ไม่มีเวลาอ่านจากนาฬิการะบบ (meta.retrievedAt = null) เพื่อให้การอ่านแถวเดิมซ้ำได้ byte เดียวกัน '
    + 'เวลาของชุดข้อมูลจริงใช้ sourceRetrievedAt และ completedAt ของรอบข้อมูลที่อ่านมาจากคลัง';

function baseData(provenance: CpdCoopProvenance, warnings: string[]): CpdCoopCountsData {
  return {
    sample: false,
    resourceKey: CPD_COOP_RESOURCE_KEY,
    sourceGrain: CPD_COOP_SOURCE_GRAIN,
    yearLabelOrigin: CPD_COOP_YEAR_LABEL_ORIGIN,
    yearConvention: CPD_COOP_YEAR_CONVENTION,
    unit: null,
    unitStatus: CPD_COOP_UNIT_STATUS,
    storedUnitLabels: [],
    rows: [],
    availableSourceYearLabels: [],
    availableReportingUnits: [],
    availableProvinces: [],
    filters: { provinceCode: null, sourceStatus: null, sourceYearLabel: null },
    counts: {
      rowCount: 0,
      rowsWithValue: 0,
      rowsMissing: 0,
      provinceCodeCount: 0,
      reportingUnitCount: 0,
      sourceStatusCount: 0,
      sourceProvinceLabelCount: 0,
    },
    derivedTotalsProvided: false,
    coverageClaim: false,
    coverageNote: COVERAGE_NOTE,
    provenance,
    snapshot: null,
    warnings,
  };
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** ค่าที่ต้องส่งต่อตามรูปเดิมของต้นทาง (คงช่องว่างหัว-ท้าย) จึงไม่ trim ที่นี่ */
function rawText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function safeCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

/** ค่าจำนวนนับของต้นทาง: null คือไม่มีข้อมูล, ตัวเลขต้องเป็นจำนวนเต็มไม่ติดลบ */
function countValue(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function jsonObject(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function booleanValue(value: unknown): boolean | null {
  if (value === 1 || value === true) return true;
  if (value === 0 || value === false) return false;
  return null;
}

/** ที่มา/attribution ของทรัพยากรนี้ถูกบันทึกใน `resources.metadata` โดยตัวเขียนฝั่ง Python */
function provenanceFrom(row: CpdCoopQueryRow): CpdCoopProvenance {
  const resourceMetadata = jsonObject(row.resourceMetadata);
  const review = jsonObject(resourceMetadata.sourceLicenseReview);
  const authorization = jsonObject(resourceMetadata.publicationAuthorization);
  const declaredLicense = jsonObject(review.declaredLicense);
  return {
    sourceName: textValue(row.sourceName),
    sourceId: CPD_COOP_SOURCE_ID,
    datasetId: textValue(row.datasetId) ?? CPD_COOP_DATASET_ID,
    datasetTitle: textValue(row.datasetTitle),
    resourceId: CPD_COOP_RESOURCE_ID,
    resourceName: textValue(row.resourceName),
    resourceUrl: textValue(row.resourceUrl),
    catalogUrl: CPD_COOP_CATALOG_URL,
    attributionText: textValue(resourceMetadata.attribution),
    attributionUrl: textValue(resourceMetadata.attributionUrl),
    declaredLicenseId: textValue(declaredLicense.license_id) ?? textValue(declaredLicense.licenseId),
    declaredLicenseUrl: textValue(declaredLicense.license_url) ?? textValue(declaredLicense.licenseUrl),
    declaredLicenseVersion: textValue(declaredLicense.version),
    sourceLicenseReviewStatus: textValue(review.status),
    publicationAuthorizationBasis: textValue(authorization.basis),
    publicationAuthorizationScope: stringArray(authorization.scope),
    sourceLicenseVerified: booleanValue(authorization.source_license_verified ?? authorization.sourceLicenseVerified),
    unresolvedSourceTerms: stringArray(review.unresolved),
    resourceGrain: textValue(row.resourceGrain),
    resourceSourceUpdatedAt: textValue(row.resourceSourceUpdatedAt),
    accessStatus: textValue(row.accessStatus),
    projectPublicationApproved: booleanValue(row.projectPublicationApproved),
  };
}

function rejectContract(message: string): never {
  throw new HubRequestError(503, 'CPD_COOP_SNAPSHOT_INVALID', message);
}

function validateRow(row: CpdCoopQueryRow): CpdCoopCountRow {
  const rowKey = textValue(row.rowKey);
  const status = STATUS_BY_METRIC.get(typeof row.metricId === 'string' ? row.metricId : '');
  const dimensions = jsonObject(row.dimensions);
  const quality = jsonObject(row.quality);
  const periodLabel = rawText(row.periodLabel);
  const provinceCode = rawText(row.provinceCode);
  const provinceName = textValue(row.locationName);
  const reportingUnit = textValue(dimensions.reportingUnit);
  const sourceProvinceLabel = rawText(dimensions.sourceProvinceLabel);
  const value = countValue(row.value);
  const expectedQuality = value === null ? 'missing' : 'good';

  if (!rowKey || !status || !periodLabel || !provinceCode || !provinceName || !reportingUnit
      || !sourceProvinceLabel || value === undefined
      || !/^\d{2}$/.test(provinceCode)
      || row.periodStart !== null || row.periodEnd !== null
      || row.locationKind !== 'province'
      || dimensions.measure !== status.metricId
      || dimensions.sourceStatus !== status.sourceColumn
      || dimensions.spatialSupport !== 'province'
      || dimensions.sourceYearLabel !== periodLabel
      || dimensions.sourceYearLabelOrigin !== CPD_COOP_YEAR_LABEL_ORIGIN
      || dimensions.sourceYearLabelConvention !== CPD_COOP_YEAR_CONVENTION
      || row.qualityStatus !== expectedQuality) {
    rejectContract('แถวจำนวนสหกรณ์จาก CPD ไม่ตรงเกรนหรือสัญญาข้อมูลที่อนุมัติไว้');
  }

  return {
    rowKey,
    provinceCode,
    provinceName,
    sourceProvinceLabel,
    reportingUnit,
    sourceStatus: status.id,
    sourceStatusLabel: status.labelThai,
    sourceStatusColumn: status.sourceColumn,
    metricId: status.metricId,
    metricName: textValue(row.metricName),
    product: textValue(row.product),
    value,
    unit: null,
    unitStatus: CPD_COOP_UNIT_STATUS,
    storedUnit: rawText(row.unit),
    qualityStatus: expectedQuality,
    sourceYearLabel: periodLabel,
    sourceRowRef: textValue(row.sourceRowRef) ?? '',
    sourceUrl: textValue(quality.sourceUrl),
    licenseStatus: textValue(quality.licenseStatus),
    revisionId: textValue(quality.revisionId),
    locationId: textValue(row.locationId),
  };
}

function metaFor(
  availability: ApiMeta['availability'],
  access: ApiMeta['access'],
  warnings: string[],
  snapshot: CpdCoopRunSnapshot | null,
  provenance: CpdCoopProvenance,
): ApiMeta {
  return {
    availability,
    // ป้ายปีไม่ยืนยันประเภทปี และเกรนนี้ไม่มี observed_at จึงไม่คำนวณ freshness
    freshness: 'unknown',
    completeness: snapshot === null ? 'unknown' : snapshot.status === 'partial' ? 'partial' : 'complete',
    access,
    sourceIds: [CPD_COOP_SOURCE_ID],
    // ไม่มีนาฬิการะบบใน payload นี้เลย (ApiMeta.retrievedAt ยอมรับ null)
    // เพราะ "การอ่านแถวเดิมซ้ำต้องได้ byte เดียวกัน" — เวลาจริงของชุดข้อมูลมีอยู่แล้วใน
    // sourceRetrievedAt / snapshot.completedAt / payloadSha256 ที่อ่านมาจากแถวและรอบข้อมูล
    // (หมายเหตุให้ orchestrator: createMeta ของ shared http.ts ยังเติม retrievedAt ตอนออก HTTP อยู่)
    retrievedAt: null,
    sourceRetrievedAt: snapshot?.sourceRetrievedAt ?? null,
    // เกรนนี้ไม่มีคอลัมน์วันที่ และไม่แต่งวันที่จากป้ายปี → null เสมอ
    dataAsOf: null,
    sourceUpdatedAt: provenance.resourceSourceUpdatedAt,
    datasetVersion: snapshot?.payloadSha256 ?? null,
    warnings,
    runtimeMode: 'database',
  };
}

function sortedDisplay(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort(compareText);
}

/**
 * ลำดับแสดงที่ "เป็น total order จริง": เทียบแบบไทยเพื่อให้ลำดับอ่านง่ายสำหรับผู้ใช้
 * แล้วตัดสินด้วย code-point เสมอ เมื่อ collation ให้ค่าเท่ากัน
 * ( localeCompare('th') คืน 0 กับข้อความที่ต่างกันได้ในบางกรณี )
 * ถ้าไม่ทำแบบนี้ ลำดับของรายการที่เทียบเท่ากันจะตกไปเท่ากับความลำดับแถวที่หลุดเข้ามาจาก SQL
 */
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  const byLocale = left.localeCompare(right, 'th');
  if (byLocale !== 0) return byLocale;
  return left < right ? -1 : 1;
}

/**
 * เรียงแถวแบบ total order ที่ประกาศไว้ในสัญญา:
 * รหัสจังหวัด → หน่วยงานสังกัด → ลำดับคอลัมน์สถานะต้นทาง → ป้ายปี → อ้างอิงแถวต้นทาง → rowKey
 * rowKey ไม่ซ้ำเด็ดขาด (มีตัวตรวจซ้ำด้านบน fail closed) จึงเป็นตัวตัดเสมอที่ต้องมีค่าเดียว
 * ทำให้ลำดับผลลัพธ์ไม่ขึ้นกับลำดับแถวที่ D1 ส่งมาและไม่ต้องพึ่งความเสถียรของ sort
 */
function compareCountRows(left: CpdCoopCountRow, right: CpdCoopCountRow): number {
  const byProvince = compareText(left.provinceCode, right.provinceCode);
  if (byProvince !== 0) return byProvince;
  const byUnit = compareText(left.reportingUnit, right.reportingUnit);
  if (byUnit !== 0) return byUnit;
  const byStatus = (STATUS_ORDINAL.get(left.sourceStatus) ?? 0) - (STATUS_ORDINAL.get(right.sourceStatus) ?? 0);
  if (byStatus !== 0) return byStatus;
  const byYearLabel = compareText(left.sourceYearLabel, right.sourceYearLabel);
  if (byYearLabel !== 0) return byYearLabel;
  const bySourceRow = compareText(left.sourceRowRef, right.sourceRowRef);
  if (bySourceRow !== 0) return bySourceRow;
  return compareText(left.rowKey, right.rowKey);
}

function noRowsEnvelope(
  provenance: CpdCoopProvenance,
  state: 'metadata_only' | 'empty',
  reason: string,
): CpdCoopCountsEnvelope {
  const warnings = [
    ...(reason.length > 0 ? [reason] : []),
    'หน้านี้จึงแสดงสถานะว่างเท่านั้น ไม่ดึงตัวเลขตัวอย่างมาใช้แทน',
    NO_DATE_AS_OF_WARNING,
    'จำนวนจังหวัดที่อ่านได้ไม่ใช่ข้อสรุปว่าครอบคลุมทั้ง 77 จังหวัดหรือทั้งประเทศ',
    NO_WALL_CLOCK_WARNING,
    UNVERIFIED_TERMS_WARNING,
  ];
  return {
    data: baseData(provenance, warnings),
    meta: metaFor(state, state === 'empty' ? 'approved_public' : 'metadata_only', warnings, null, provenance),
  };
}

/**
 * แปลงแถวที่อ่านจาก D1 เป็น payload ของหน้า /cooperatives
 * pure ต่อการทดสอบ: ไม่เรียกเครือข่าย ไม่อ่าน env และไม่ตีความป้ายปีเป็นวันที่
 */
export function buildCpdCoopCountsEnvelope(
  queryRows: readonly CpdCoopQueryRow[],
  filters: CpdCoopCountsFilters = {},
): CpdCoopCountsEnvelope {
  const activeFilters: Required<CpdCoopCountsFilters> = {
    provinceCode: filters.provinceCode ?? null,
    sourceStatus: filters.sourceStatus ?? null,
    sourceYearLabel: filters.sourceYearLabel ?? null,
  };
  const gateRow = queryRows[0];
  if (!gateRow) return noRowsEnvelope(EMPTY_PROVENANCE, 'metadata_only', 'ไม่พบทรัพยากรนี้ในคลังข้อมูลกลาง');

  const provenance = provenanceFrom(gateRow);
  const accessOk = gateRow.accessStatus === 'approved_public'
    && booleanValue(gateRow.projectPublicationApproved) === true
    && ['approved_public', 'metadata_only'].includes(String(gateRow.datasetAccessStatus))
    && ['approved_public', 'metadata_only'].includes(String(gateRow.sourceAccessStatus));
  if (!accessOk) {
    return noRowsEnvelope(provenance, 'metadata_only', 'สิทธิ์เผยแพร่ของทรัพยากรในคลังข้อมูลยังไม่อยู่ในสถานะอนุมัติ');
  }

  const activeRunId = textValue(gateRow.activeRunId);
  if (!activeRunId) {
    return noRowsEnvelope(provenance, 'metadata_only', 'คลังกลางยังไม่มีรอบข้อมูลที่ผูกกับทรัพยากรนี้ จึงยังไม่เคยตีพิมพ์ระเบียนตัวเลข');
  }

  const runStatus = gateRow.runStatus;
  if (runStatus !== 'succeeded' && runStatus !== 'partial') {
    rejectContract('สถานะรอบข้อมูล CPD ในคลังข้อมูลไม่ตรงกับรอบที่เผยแพร่');
  }
  if (gateRow.runKind !== 'numeric') {
    rejectContract('รอบข้อมูลที่เชื่อมกับทรัพยากรนี้ไม่ใช่รอบตัวเลข');
  }

  const dataRows = queryRows.filter((row) => row.rowKey !== null && row.rowKey !== undefined);
  if (dataRows.length > CPD_COOP_MAX_ROWS) {
    rejectContract('จำนวนแถว CPD ที่อ่านได้เกินขอบเขตการอ่านของหน้านี้');
  }

  const runId = textValue(gateRow.runId);
  const payloadSha256 = textValue(gateRow.payloadSha256);
  const adapterVersion = textValue(gateRow.adapterVersion);
  const sourceRetrievedAt = textValue(gateRow.sourceRetrievedAt);
  const completedAt = textValue(gateRow.completedAt);
  const recordsWritten = safeCount(gateRow.recordsWritten);
  if (!runId || runId !== activeRunId || !payloadSha256 || !adapterVersion
      || !sourceRetrievedAt || !completedAt || recordsWritten === null) {
    rejectContract('metadata ของรอบข้อมูล CPD ในคลังข้อมูลไม่ครบถ้วน');
  }

  const runIdentity = (row: CpdCoopQueryRow) => JSON.stringify([
    row.resourceId, row.activeRunId, row.runId, row.runStatus, row.runKind,
    row.payloadSha256, row.adapterVersion, row.sourceRetrievedAt, row.completedAt, row.recordsWritten,
  ]);
  const identityVersion = runIdentity(gateRow);
  if (queryRows.some((row) => runIdentity(row) !== identityVersion)) {
    rejectContract('รอบข้อมูลหรือเวอร์ชัน CPD เปลี่ยนระหว่างการอ่าน');
  }

  if (dataRows.length === 0) {
    if (recordsWritten !== 0) {
      rejectContract('รอบข้อมูลที่เผยแพร่ไม่มีแถวในตารางตัวเลข ซึ่งไม่ตรงกับการบันทึกของรอบนั้น');
    }
    return noRowsEnvelope(provenance, 'empty', 'รอบข้อมูลที่อนุมัติแล้วไม่มีระเบียนตัวเลขที่อ่านได้ในขณะนี้');
  }
  // records_written นับแถวทั้งหมดของรอบ ถ้าอ่านได้น้อยกว่าแปลว่ามี metric ที่สัญญายังไม่ครอบคลุม
  if (recordsWritten !== dataRows.length) {
    rejectContract('จำนวนระเบียนที่บันทึกไว้ในรอบข้อมูลไม่ตรงกับแถวที่อ่านได้');
  }

  const mapped = dataRows.map(validateRow);
  const seenRowKeys = new Set<string>();
  const seenSourceSlots = new Set<string>();
  for (const row of mapped) {
    // หนึ่งแถว CSV ของต้นทางถูกเขียนเป็น 3 ระเบียนสถานะ (คอลัมน์ซ้าย→ขวา) จึงซ้ำกันได้เฉพาะข้ามสถานะ
    const sourceSlot = row.sourceRowRef + '\u0000' + row.metricId;
    if (seenRowKeys.has(row.rowKey) || (row.sourceRowRef !== '' && seenSourceSlots.has(sourceSlot))) {
      rejectContract('พบระเบียน CPD ซ้ำในรอบข้อมูลที่เผยแพร่');
    }
    seenRowKeys.add(row.rowKey);
    if (row.sourceRowRef !== '') seenSourceSlots.add(sourceSlot);
  }

  const yearLabels = sortedDisplay(mapped.map((row) => row.sourceYearLabel));
  const storedUnitLabels = sortedDisplay(mapped.map((row) => row.storedUnit ?? ''));
  const rows = mapped
    .filter((row) => activeFilters.provinceCode === null || row.provinceCode === activeFilters.provinceCode)
    .filter((row) => activeFilters.sourceStatus === null || row.sourceStatus === activeFilters.sourceStatus)
    .filter((row) => activeFilters.sourceYearLabel === null
      || row.sourceYearLabel === activeFilters.sourceYearLabel)
    .sort(compareCountRows);

  const snapshot: CpdCoopRunSnapshot = {
    runId,
    status: runStatus === 'partial' ? 'partial' : 'succeeded',
    adapterVersion,
    payloadSha256,
    sourceRetrievedAt,
    completedAt,
    recordsWritten,
    rowCount: rows.length,
  };

  const provinceNamesByCode = new Map<string, Set<string>>();
  const sourceProvinceLabels = new Set<string>();
  const reportingUnits = new Set<string>();
  const sourceStatuses = new Set<string>();
  let rowsWithValue = 0;
  let rowsMissing = 0;
  for (const row of rows) {
    // ไม่ใช้วิธี "เก็บชื่อแรกที่พบ" ต่อรหัสจังหวัด เพราะชื่อที่ได้จะเปลี่ยนตามลำดับแถวที่ D1 ส่งมา
    // เก็บทุกชื่อที่ต่างกันไว้ แล้วเลือกด้วยลำดับคงที่ในท่อนถัดไป
    const names = provinceNamesByCode.get(row.provinceCode) ?? new Set<string>();
    names.add(row.provinceName);
    provinceNamesByCode.set(row.provinceCode, names);
    sourceProvinceLabels.add(row.sourceProvinceLabel);
    reportingUnits.add(row.reportingUnit);
    sourceStatuses.add(row.sourceStatus);
    if (row.value === null) rowsMissing += 1;
    else rowsWithValue += 1;
  }

  const provinceCodes = [...provinceNamesByCode.keys()].sort(compareText);
  const displayNameByCode = new Map<string, string>();
  const nameConflictCodes: string[] = [];
  for (const code of provinceCodes) {
    const names = [...(provinceNamesByCode.get(code) ?? new Set<string>())].sort(compareText);
    displayNameByCode.set(code, names[0]);
    if (names.length > 1) nameConflictCodes.push(code);
  }

  const warnings = [
    'ตัวเลขเป็นจำนวนตามเกรนต้นทาง (จังหวัด × หน่วยงานสังกัด × สถานะ) ไม่มีการบวกข้ามสถานะ '
      + 'ข้ามหน่วยงานสังกัด หรือข้ามป้ายปี จึงไม่มียอดรวมระดับจังหวัดหรือระดับประเทศในชุดนี้',
    'ค่าที่ต้นทางไม่กรอกเป็น null และแสดงว่า "ไม่มีข้อมูล" เสมอ ระบบไม่แปลงเป็น 0 '
      + 'และค่า 0 ที่ต้นทางกรอกยังคงเป็น 0',
    'ไฟล์ CSV ต้นทางไม่มีคอลัมน์หน่วยนับ หน่วยจึงรายงานเป็น "ไม่ทราบ"'
      + (storedUnitLabels.length > 0
        ? ' ส่วนค่าที่ตัวเขียนบันทึกไว้ในคลังคือ "' + storedUnitLabels.join(', ') + '" (ยังไม่ยืนยัน)'
        : ''),
    'ป้ายปี ' + yearLabels.join(', ') + ' เป็นข้อความจากชื่อทรัพยากรต้นทาง '
      + 'ยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ จึงไม่ตั้ง dataAsOf',
    'จำนวนจังหวัดที่อ่านได้ไม่ใช่ข้อสรุปว่าครอบคลุมทั้ง 77 จังหวัดหรือทั้งประเทศ',
    NO_WALL_CLOCK_WARNING,
    UNVERIFIED_TERMS_WARNING,
  ];
  if (snapshot.status === 'partial') warnings.push('รอบข้อมูลปัจจุบันมีสถานะ partial');
  if (rows.length === 0) warnings.push('ไม่พบแถวที่ตรงกับตัวกรองที่กำหนดในรอบข้อมูลที่เผยแพร่');
  if (nameConflictCodes.length > 0) {
    warnings.push(
      'รหัสจังหวัด ' + nameConflictCodes.join(', ') + ' มีป้ายชื่อจังหวัดในคลังมากกว่าหนึ่งแบบ '
        + 'หน้าจอนี้จึงแสดงชื่อตามลำดับคงที่แบบหนึ่งเท่านั้น และคงค่าตามเกรนของแถวต้นทาง ไม่ได้ยุบแถวเข้าหากัน',
    );
  }

  const hasRows = rows.length > 0;
  const data: CpdCoopCountsData = {
    ...baseData(provenance, warnings),
    storedUnitLabels,
    rows,
    availableSourceYearLabels: yearLabels,
    availableReportingUnits: sortedDisplay(mapped.map((row) => row.reportingUnit)),
    availableProvinces: provinceCodes.map((provinceCode) => ({
      provinceCode,
      provinceName: displayNameByCode.get(provinceCode) ?? provinceCode,
    })),
    filters: activeFilters,
    counts: {
      rowCount: rows.length,
      rowsWithValue,
      rowsMissing,
      provinceCodeCount: provinceCodes.length,
      reportingUnitCount: reportingUnits.size,
      sourceStatusCount: sourceStatuses.size,
      sourceProvinceLabelCount: sourceProvinceLabels.size,
    },
    snapshot,
  };

  return {
    data,
    meta: metaFor(hasRows ? 'ready' : 'empty', 'approved_public', warnings, snapshot, provenance),
  };
}

/** สถานะเมื่อคลังอ่านไม่ได้/เชื่อมต่อไม่ได้ — ห้ามผู้เรียกใช้ตีกลับไปใช้ค่า sample */
export function unavailableCpdCoopCountsEnvelope(
  reason = 'ขณะนี้อ่านข้อมูล CPD จากคลังข้อมูลกลางไม่ได้ กรุณาลองใหม่ภายหลัง',
): CpdCoopCountsEnvelope {
  const warnings = [
    reason,
    'หน้านี้จึงไม่แสดงตัวเลขตัวอย่างแทนข้อมูลจริง',
    NO_DATE_AS_OF_WARNING,
    UNVERIFIED_TERMS_WARNING,
  ];
  return {
    data: baseData(EMPTY_PROVENANCE, warnings),
    meta: metaFor('unavailable', 'metadata_only', warnings, null, EMPTY_PROVENANCE),
  };
}

/**
 * SQL อ่านอย่างเดียว ไม่มี INSERT/UPDATE ทุกค่าผูกเป็นพารามิเตอร์ และไม่ใช้คอลัมน์ของ migration ใหม่
 * ORDER BY o.row_key มีไว้เพื่อคุมขอบเขต LIMIT ให้ deterministic; ตัวเรียงลำดับจริงของชั้นอ่านคือ
 * compareCountRows (total order) จึงไม่พึ่งว่า engine ของคลังจะส่งแถวมาลำดับเดิมทุกครั้ง
 */
const SELECT_SQL =
  'SELECT r.resource_id AS resourceId,r.access_status AS accessStatus,'
  + 'r.project_publication_approved AS projectPublicationApproved,r.active_run_id AS activeRunId,'
  + 'r.name AS resourceName,r.grain AS resourceGrain,r.resource_url AS resourceUrl,'
  + 'r.source_updated_at AS resourceSourceUpdatedAt,r.metadata AS resourceMetadata,'
  + 'd.dataset_id AS datasetId,d.source_dataset_id AS sourceDatasetId,d.title AS datasetTitle,'
  + 'd.metadata_access_status AS datasetAccessStatus,'
  + 's.source_id AS sourceId,s.source_name AS sourceName,s.metadata_access_status AS sourceAccessStatus,'
  + 'run.run_id AS runId,run.kind AS runKind,run.status AS runStatus,'
  + 'run.payload_sha256 AS payloadSha256,run.adapter_version AS adapterVersion,'
  + 'run.source_retrieved_at AS sourceRetrievedAt,run.completed_at AS completedAt,'
  + 'run.records_written AS recordsWritten,'
  + 'o.row_key AS rowKey,o.metric_id AS metricId,o.metric_name AS metricName,o.product AS product,'
  + 'o.value AS value,o.unit AS unit,o.period_start AS periodStart,o.period_end AS periodEnd,'
  + 'o.period_label AS periodLabel,o.location_id AS locationId,o.location_code AS locationCode,'
  + 'o.location_kind AS locationKind,o.location_name AS locationName,o.province_code AS provinceCode,'
  + 'o.dimensions AS dimensions,o.quality AS quality,o.quality_status AS qualityStatus,'
  + 'o.source_row_ref AS sourceRowRef '
  + 'FROM resources r '
  + 'JOIN datasets d ON d.dataset_id=r.dataset_id '
  + 'JOIN sources s ON s.source_id=d.source_id '
  + 'LEFT JOIN sync_runs run ON run.resource_id=r.resource_id AND run.run_id=r.active_run_id '
  + 'LEFT JOIN observations o ON o.resource_id=r.resource_id AND o.run_id=run.run_id '
  + 'WHERE r.resource_id=? AND d.source_id=? AND d.source_dataset_id=? '
  + 'ORDER BY o.row_key '
  + 'LIMIT '
  + (CPD_COOP_MAX_ROWS + 1);

export async function loadCpdCoopCountsEnvelope(
  filters: CpdCoopCountsFilters = {},
): Promise<CpdCoopCountsEnvelope> {
  let rows: CpdCoopQueryRow[];
  try {
    rows = await queryD1<CpdCoopQueryRow>(SELECT_SQL, [CPD_COOP_RESOURCE_ID, CPD_COOP_SOURCE_ID, CPD_COOP_DATASET_ID]);
  } catch {
    throw new HubRequestError(503, 'CPD_COOP_UNAVAILABLE', 'ขณะนี้อ่านข้อมูล CPD จากคลังข้อมูลกลางไม่ได้');
  }
  return buildCpdCoopCountsEnvelope(rows, filters);
}

/** ตัวกรองสถานะรับได้ทั้ง id (operating) และข้อความคอลัมน์ต้นทาง */
export function cpdCoopStatusFromQuery(raw: string | null | undefined): CpdCoopSourceStatusId | null {
  const value = (raw ?? '').normalize('NFC').trim().toLowerCase();
  if (value.length === 0 || value === 'all') return null;
  const direct = STATUS_BY_ID.get(value);
  if (direct) return direct.id;
  const byColumn = CPD_COOP_SOURCE_STATUSES.find(
    (item) => item.sourceColumn.normalize('NFC') === (raw ?? '').normalize('NFC').trim(),
  );
  return byColumn ? byColumn.id : null;
}
