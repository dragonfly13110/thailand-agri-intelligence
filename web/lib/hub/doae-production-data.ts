import 'server-only';

import { queryD1 } from './d1';
import { HubRequestError } from './http';
import { D1_OBSERVATION_ROW_LIMIT, listD1Observations } from './d1-numeric-repository';
import type { D1ObservationRow } from './d1-numeric-repository';
import { DOAE_CROP_RESOURCES } from './crops-soil-data';
import type {
  DoaeCropResourceCatalog,
  DoaeCropResourceKey,
  DoaeProductionBlock,
  DoaeProductionBlockAvailability,
  DoaeProductionBlockRow,
} from './crops-soil-data';

export { DOAE_CROP_RESOURCES };
export type {
  DoaeCropResourceCatalog,
  DoaeCropResourceKey,
  DoaeProductionBlock,
  DoaeProductionBlockAvailability,
  DoaeProductionBlockRow,
} from './crops-soil-data';

/**
 * อ่านบล็อกข้อมูลการผลิตพืชจริงของ DOAE (เกรนระดับตำบล) จากคลังข้อมูลกลาง
 *
 * กฎที่ควบคุมการอ่าน:
 * - ไม่มีการ hard-code ตัวเลขในไฟล์นี้ ทุกแถวมาจาก `observations` ที่เผยแพร่แล้ว
 *   ผ่านดีลเลอร์กลางซึ่งบังคับ resource ที่ approved_public + project_publication_approved
 *   + numeric run สถานะ succeeded/partial เท่านั้น
 * - ค่าว่างคงเป็น null ไม่แปลงเป็น 0; หน่วยที่ไม่ยืนยันคงเป็น null
 * - ไม่มีการรวมค่า (ไม่มีผลรวมระดับจังหวัด) — การนับแถวไม่ใช่การรวมค่า
 * - อ่านแบบมีเพดาน (bounded window) แล้วรายงาน `truncated` ตามจริง ไม่อ้าง coverage
 */

export const DOAE_PRODUCTION_MAX_ROWS = 1_000;

const DOAE_SOURCE_ID = 'doae';
const DOAE_LOCATION_KIND = 'subdistrict';
const MAX_PAGE_ATTEMPTS = 8;

export type DoaeBlockFilters = {
  provinceCode: string | null;
  measure: string | null;
  sourceYearBe: number | null;
};

export type DoaeBlockBuildInput = {
  resourceKey: DoaeCropResourceKey;
  rows: readonly D1ObservationRow[];
  totalCount: number;
  availability: DoaeProductionBlockAvailability;
  filters?: Partial<DoaeBlockFilters> | null;
  maxRows?: number;
  extraWarnings?: readonly string[] | null;
};

export type DoaeBlockQuery = {
  resourceKey: DoaeCropResourceKey;
  provinceCode?: string | null;
  measure?: string | null;
  sourceYearBe?: number | null;
  maxRows?: number;
};

function textValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().length > 0 ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function yearValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 2400 && value <= 2700) return value;
  return null;
}

function yearFromPeriodLabel(label: string | null): number | null {
  if (!label) return null;
  const matched = /^(?:พ\.ศ\.|ก\.ศ\.|ค\.ศ\.)?\s*(\d{4})$/.exec(label.trim());
  return matched ? yearValue(Number(matched[1])) : null;
}

function revisionId(row: D1ObservationRow): string | null {
  const value = row.quality.revisionId ?? row.dimensions.revisionId;
  return textValue(value);
}

function assertGrain(row: D1ObservationRow, catalog: DoaeCropResourceCatalog): void {
  if (row.sourceId !== DOAE_SOURCE_ID || row.resourceId !== catalog.resourceId) {
    throw new HubRequestError(503, 'DOAE_PROVENANCE_MISMATCH', 'แถวที่อ่านได้ไม่ตรงกับทรัพยากร DOAE ที่ขอ');
  }
  if (row.locationKind !== DOAE_LOCATION_KIND) {
    throw new HubRequestError(503, 'DOAE_GRAIN_CONTRACT_INVALID', 'ข้อมูล DOAE ไม่อยู่ในเกรนระดับตำบลตามที่ประกาศ');
  }
  if (row.observedAt !== null || row.periodStart !== null || row.periodEnd !== null) {
    throw new HubRequestError(503, 'DOAE_PERIOD_CONTRACT_INVALID', 'ข้อมูล DOAE มีวันที่ช่วงเวลาที่ไม่ตรงสัญญาปี พ.ศ. ต้นทาง');
  }
}

export function mapDoaeObservationRow(row: D1ObservationRow): DoaeProductionBlockRow {
  const dims = row.dimensions;
  const measure = textValue(dims.measure) ?? row.metricId ?? null;
  const sourceYearBe = yearValue(dims.sourceYearBe) ?? yearFromPeriodLabel(row.periodLabel);
  return {
    rowKey: row.rowKey,
    measure: measure ?? 'ไม่ระบุตัวชี้วัด',
    metricLabel: textValue(dims.measureLabel) ?? row.metricName,
    cropType: textValue(dims.cropType) ?? row.cropName ?? row.product,
    varietyName: textValue(dims.varietyName),
    provinceCode: row.provinceCode,
    provinceName: textValue(dims.provinceName),
    districtName: textValue(dims.districtName),
    subdistrictName: textValue(dims.subdistrictName) ?? row.locationName,
    sourceYearBe,
    monthLabel: textValue(dims.sourceMonthLabel),
    plantingRoundLabel: textValue(dims.plantingRoundLabel),
    periodLabel: row.periodLabel,
    value: row.value ?? null,
    unit: row.unit ?? null,
    qualityStatus: row.qualityStatus,
    revisionId: revisionId(row),
    sourceRowRef: row.sourceRowRef,
  };
}

function normalizeFilters(filters: Partial<DoaeBlockFilters> | null | undefined): DoaeBlockFilters {
  return {
    provinceCode: filters?.provinceCode ?? null,
    measure: filters?.measure ?? null,
    sourceYearBe: yearValue(filters?.sourceYearBe ?? null),
  };
}

function distinctCount(values: Array<string | null>): number {
  const seen = new Set<string>();
  for (const value of values) {
    if (value !== null && value !== '') seen.add(value);
  }
  return seen.size;
}

function availabilityWarning(availability: DoaeProductionBlockAvailability, filters: DoaeBlockFilters): string {
  switch (availability) {
    case 'catalog_missing':
      return 'ยังไม่พบทรัพยากรนี้ในแคตตาล็อกของคลังข้อมูลกลาง (ต้องซิงก์ metadata ก่อน) — จึงไม่แสดงตัวเลขใด ๆ';
    case 'catalog_pending':
      return 'ทรัพยากรในแคตตาล็อกยังไม่ได้สถานะ approved_public/ยังไม่อนุมัติเผยแพร่ใน D1 — จึงไม่แสดงตัวเลขใด ๆ';
    case 'no_numeric_run':
      return 'ยังไม่มี numeric run ที่เผยแพร่สำเร็จสำหรับทรัพยากรนี้ — จึงไม่แสดงตัวเลขใด ๆ';
    case 'empty':
      return filters.provinceCode || filters.measure || filters.sourceYearBe !== null
        ? 'อ่านจากคลังข้อมูลกลางแล้วไม่พบแถวจริงที่ตรงกับตัวกรอง — ไม่ใช้ค่าตัวอย่างแทน'
        : 'อ่านจากคลังข้อมูลกลางแล้วไม่มีแถวจริงของทรัพยากรนี้ในขณะนี้ — ไม่ใช้ค่าตัวอย่างแทน';
    case 'unavailable':
      return 'เชื่อมต่อคลังข้อมูลกลางไม่ได้ในขณะอ่าน — ไม่ใช้ค่าตัวอย่างแทน';
    case 'ready':
    default:
      return '';
  }
}

export function buildDoaeProductionBlock(input: DoaeBlockBuildInput): DoaeProductionBlock {
  const catalog = DOAE_CROP_RESOURCES[input.resourceKey];
  if (!catalog) throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่รู้จักทรัพยากร DOAE ที่ขอ');
  const maxRows = Math.min(Math.max(Math.trunc(input.maxRows ?? DOAE_PRODUCTION_MAX_ROWS) || DOAE_PRODUCTION_MAX_ROWS, 1), 4_000);
  const filters = normalizeFilters(input.filters);

  const rows: DoaeProductionBlockRow[] = [];
  const missingYearRows: string[] = [];
  for (const source of input.rows) {
    assertGrain(source, catalog);
    const mapped = mapDoaeObservationRow(source);
    if (mapped.sourceYearBe === null) missingYearRows.push(mapped.rowKey);
    rows.push(mapped);
  }

  const loadedCount = rows.length;
  const totalCount = Number.isFinite(input.totalCount) ? Math.max(Math.trunc(input.totalCount), 0) : 0;
  const measuresFound: DoaeProductionBlock['measuresFound'] = [];
  for (const row of rows) {
    const found = measuresFound.find(entry => entry.measure === String(row.measure));
    if (found) {
      found.rows += 1;
      if (found.unit !== row.unit) found.unit = null;
    } else {
      measuresFound.push({ measure: String(row.measure), unit: row.unit, rows: 1 });
    }
  }
  measuresFound.sort((a, b) => a.measure.localeCompare(b.measure));

  const sourceYearsBe = [...new Set(rows.map(row => row.sourceYearBe).filter((y): y is number => y !== null))].sort((a, b) => b - a);
  const revisionIds = [...new Set(rows.map(row => row.revisionId).filter((v): v is string => v !== null))].sort();
  const nullValueRows = rows.filter(row => row.value === null).length;
  const unverifiedUnitRows = rows.filter(row => row.unit === null).length;

  const warnings: string[] = [];
  const availabilityNote = availabilityWarning(input.availability, filters);
  if (availabilityNote) warnings.push(availabilityNote);
  if (input.availability === 'ready' && loadedCount === 0) {
    warnings.push('คลังข้อมูลกลางรายงานว่ามีแถว แต่หน้าต่างอ่านนี้ไม่ได้แถว — ไม่สรุปว่าไม่มีข้อมูล');
  }
  if (totalCount > loadedCount) {
    warnings.push(
      'อ่านแถวจริงแบบมีเพดาน: แสดง ' + loadedCount + ' จาก ' + totalCount +
        ' แถวที่เผยแพร่ (เพดาน ' + maxRows + ' แถวต่อคำขอ) —สิ่งที่แสดงไม่ใช่ทั้งชุดข้อมูล',
    );
  }
  warnings.push('บล็อกนี้ไม่มีผลรวมระดับจังหวัด: ตัวเลขที่แสดงคือแถวรายตำบลตามเกรนต้นทางเท่านั้น');
  warnings.push(
    'จำนวนตำบล/จังหวัดที่นับได้คือเฉพาะในหน้าต่างที่อ่าน ไม่ใช่ข้อสรุป coverage ของแหล่งข้อมูล (จำนวนจังหวัดที่ปรากฏไม่ใช่หลักฐานว่าครบทั้งประเทศ)',
  );
  if (filters.sourceYearBe !== null) {
    warnings.push('กรองปี พ.ศ. หลังอ่านภายในหน้าต่างมีเพดาน — การไม่พบแถวในปีที่เลือกไม่ใช่หลักฐานว่าไม่มีข้อมูลปีนั้น');
  }
  if (missingYearRows.length > 0) {
    warnings.push('มี ' + missingYearRows.length + ' แถวที่อ่านปี พ.ศ. จากต้นทางไม่ได้ จึงแสดงว่าง (ไม่ใส่ค่า 0)');
  }
  if (nullValueRows > 0) {
    warnings.push('มี ' + nullValueRows + ' แถวที่ไม่มีค่าตัวเลขจากต้นทาง แสดงเป็น "ไม่ทราบ" ไม่ใช่ 0');
  }
  if (unverifiedUnitRows > 0) {
    warnings.push('มี ' + unverifiedUnitRows + ' แถวที่ไม่ยืนยันหน่วย แสดงเป็น "ไม่ยืนยันหน่วย"');
  }
  if (Array.isArray(input.extraWarnings)) {
    for (const note of input.extraWarnings) {
      if (typeof note === 'string' && note.trim().length > 0 && !warnings.includes(note)) warnings.push(note);
    }
  }
  for (const note of catalog.semanticsNotes) {
    if (!warnings.includes(note)) warnings.push(note);
  }

  const firstRow = input.rows[0];
  return {
    sample: false,
    resourceKey: input.resourceKey,
    catalog,
    availability: input.availability,
    rows,
    totalCount,
    loadedCount,
    truncated: totalCount > loadedCount,
    maxRows,
    distinctSubdistrictsLoaded: distinctCount(input.rows.map(row => row.locationId ?? row.locationCode)),
    distinctProvinceCodesLoaded: distinctCount(rows.map(row => row.provinceCode)),
    measuresFound,
    sourceYearsBe,
    filters,
    provenance: {
      runId: firstRow?.runId ?? null,
      runStatus: firstRow?.runStatus ?? null,
      adapterVersion: firstRow?.adapterVersion ?? null,
      payloadSha256: firstRow?.payloadSha256 ?? null,
      sourceRetrievedAt: firstRow?.sourceRetrievedAt ?? null,
      revisionIds,
    },
    warnings,
  };
}

type DoaeCatalogRow = {
  resourceId: unknown;
  accessStatus: unknown;
  publicationApproved: unknown;
  activeRunId: unknown;
  runStatus: unknown;
  rowTotal: unknown;
};

/** สถานะการเผยแพร่ของ resource (จำนวนเท่านั้น — ไม่อ่านค่าตัวเลขใน SQL นี้) */
async function readCatalogState(resourceId: string): Promise<DoaeCatalogRow | null> {
  const rows = await queryD1<DoaeCatalogRow>(
    'SELECT r.resource_id AS resourceId,r.access_status AS accessStatus,' +
      'r.project_publication_approved AS publicationApproved,r.active_run_id AS activeRunId,' +
      'run.status AS runStatus,(SELECT COUNT(*) FROM observations o WHERE o.resource_id=r.resource_id) AS rowTotal ' +
      'FROM resources r ' +
      "LEFT JOIN sync_runs run ON run.resource_id=r.resource_id AND run.run_id=r.active_run_id AND run.kind='numeric' " +
      'WHERE r.resource_id=? LIMIT 1',
    [resourceId],
  );
  return rows[0] ?? null;
}

function catalogAvailability(state: DoaeCatalogRow | null): DoaeProductionBlockAvailability {
  if (!state) return 'catalog_missing';
  if (typeof state.activeRunId === 'string' && state.activeRunId.length > 0) {
    if (state.runStatus !== 'succeeded' && state.runStatus !== 'partial') return 'no_numeric_run';
    return 'ready';
  }
  if (state.accessStatus !== 'approved_public') return 'catalog_pending';
  if (Number(state.publicationApproved) !== 1) return 'catalog_pending';
  return 'no_numeric_run';
}

function validateQuery(query: DoaeBlockQuery, catalog: DoaeCropResourceCatalog): DoaeBlockFilters {
  const provinceCode = query.provinceCode ?? null;
  if (provinceCode !== null && !/^\d{2}$/.test(provinceCode)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'รหัสจังหวัดต้องเป็นเลข 2 หลัก');
  }
  const measure = query.measure ?? null;
  if (measure !== null && !(catalog.measures as readonly string[]).includes(measure)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ตัวชี้วัดไม่อยู่ในแคตตาล็อกของทรัพยากรนี้');
  }
  const sourceYearBe = query.sourceYearBe ?? null;
  if (sourceYearBe !== null && yearValue(sourceYearBe) === null) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ปี พ.ศ. ต้นทางต้องอยู่ในช่วงที่ตรวจสอบได้');
  }
  return { provinceCode, measure, sourceYearBe };
}

/**
 * อ่านบล็อกจริงจาก D1
 * ทุกเส้นทางที่ไม่ได้แถวจริงต้องจบด้วยสถานะที่ซื่อตรง (empty / catalog_* / no_numeric_run / unavailable)
 * ห้ามแทนที่ด้วยค่าตัวอย่าง
 */
export async function loadDoaeProductionBlock(query: DoaeBlockQuery): Promise<DoaeProductionBlock> {
  const catalog = DOAE_CROP_RESOURCES[query.resourceKey];
  if (!catalog) throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่รู้จักทรัพยากร DOAE ที่ขอ');
  const filters = validateQuery(query, catalog);
  const maxRows = Math.min(Math.max(Math.trunc(query.maxRows ?? DOAE_PRODUCTION_MAX_ROWS) || DOAE_PRODUCTION_MAX_ROWS, 1), 4_000);

  let state: DoaeCatalogRow | null;
  try {
    state = await readCatalogState(catalog.resourceId);
  } catch {
    return blockWithoutRows(query.resourceKey, filters, 'unavailable', ['อ่านสถานะแคตตาล็อกของทรัพยากรไม่ได้ในขณะเชื่อมต่อคลังข้อมูลกลาง']);
  }
  const availability = catalogAvailability(state);
  if (availability !== 'ready') {
    return blockWithoutRows(query.resourceKey, filters, availability, [
      'จำนวนแถวที่ระบบตรวจเห็นในคลัง: ' + (Number(state?.rowTotal ?? 0) || 0) + ' แถว (นับทั้งหมด ไม่รวมการกรอง)',
    ]);
  }

  const collected: D1ObservationRow[] = [];
  let totalCount = 0;
  const pageCapWarnings: string[] = [];
  try {
    for (let pageCount = 0; ; pageCount += 1) {
      const offset = collected.length;
      if (offset >= maxRows) break;
      const page = await listD1Observations(
        {
          sourceId: DOAE_SOURCE_ID,
          resourceId: catalog.resourceId,
          locationKind: DOAE_LOCATION_KIND,
          ...(filters.provinceCode ? { provinceCode: filters.provinceCode } : {}),
          ...(filters.measure ? { metricId: filters.measure } : {}),
        },
        { limit: Math.min(D1_OBSERVATION_ROW_LIMIT, maxRows - offset), offset },
      );
      totalCount = page.total;
      if (page.rows.length === 0) break;
      collected.push(...page.rows.slice(0, maxRows - collected.length));
      if (collected.length >= maxRows || collected.length >= totalCount) break;
      if (pageCount >= MAX_PAGE_ATTEMPTS) {
        pageCapWarnings.push(
          'ถึงเพดานจำนวนหน้าต่อการอ่านหนึ่งครั้ง (' + (MAX_PAGE_ATTEMPTS + 1) + ' หน้า) — ไม่ได้อ่านทั้งชุด',
        );
        break;
      }
    }
  } catch {
    return blockWithoutRows(query.resourceKey, filters, 'unavailable', ['อ่านแถว observation จากคลังข้อมูลกลางไม่สำเร็จในขณะนั้น']);
  }

  const yearFiltered = filters.sourceYearBe === null
    ? collected
    : collected.filter(row => mapDoaeObservationRow(row).sourceYearBe === filters.sourceYearBe);

  try {
    return buildDoaeProductionBlock({
      resourceKey: query.resourceKey,
      rows: yearFiltered,
      totalCount,
      availability: yearFiltered.length > 0 ? 'ready' : 'empty',
      filters,
      maxRows,
      extraWarnings: [
        ...pageCapWarnings,
        ...(yearFiltered.length === 0 && collected.length > 0
          ? ['มีแถวจริงในหน้าต่างที่อ่าน แต่ไม่มีแถวที่ตรงกับตัวกรองปี พ.ศ. ที่เลือก']
          : []),
      ],
    });
  } catch (error) {
    if (error instanceof HubRequestError && error.status === 503) {
      return blockWithoutRows(query.resourceKey, filters, 'unavailable', [error.message]);
    }
    throw error;
  }
}

function blockWithoutRows(
  resourceKey: DoaeCropResourceKey,
  filters: DoaeBlockFilters,
  availability: DoaeProductionBlockAvailability,
  extraWarnings: readonly string[],
): DoaeProductionBlock {
  return buildDoaeProductionBlock({
    resourceKey,
    rows: [],
    totalCount: 0,
    availability,
    filters,
    extraWarnings,
  });
}
