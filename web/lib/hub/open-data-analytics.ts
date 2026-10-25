import 'server-only';
import { getD1 } from './d1';
import { catalogSyncCompleteness } from './catalog-completeness';
import { HubRequestError } from './http';
import type { Availability, Completeness } from './types';

export type OpenDataAnalyticsFilters = { sourceId?: string; format?: string };
export type OpenDataFormat = { format: string; datasetCount: number; resourceCount: number };
export type OpenDataStarCount = { stars: number | null; datasetCount: number };
export type OpenDataUpdates = {
  daily: number;
  monthly: number;
  annual: number;
  stale: number;
  other: number;
  unknown: number;
};
export type OpenDataAgency = {
  sourceId: string;
  name: string;
  datasetCount: number;
  resourceCount: number;
  machineReadableDatasets: number;
  machineReadableRatio: number | null;
  assessedDatasets: number;
  unknownDatasets: number;
  readinessScore: number | null;
  starCounts: OpenDataStarCount[];
  updates: OpenDataUpdates;
};
export type OpenDataAnalytics = {
  generatedAt: string;
  availability: Availability;
  access: 'metadata_only';
  completeness: Completeness;
  totalDatasets: number;
  totalResources: number;
  agencyCount: number;
  formats: OpenDataFormat[];
  machineReadability: {
    machineReadableDatasets: number;
    pdfOnlyDatasets: number;
    mixedDatasets: number;
    otherDatasets: number;
    assessedDatasets: number;
    unknownDatasets: number;
    machineReadableRatio: number | null;
    pdfOnlyRatio: number | null;
  };
  agencies: OpenDataAgency[];
  readScope: {
    maxDatasets: number;
    matchedDatasets: number | null;
    analyzedDatasets: number;
    truncated: boolean;
  };
  notes: string[];
};

const MAX_DATASETS = 10_000;
const STALE_DAYS = 365;
const MACHINE_FORMATS = new Set(['CSV', 'JSON', 'API']);
const STRUCTURED_FORMATS = new Set(['CSV', 'JSON', 'API', 'XLS', 'XLSX', 'ODS', 'XML', 'TSV', 'GEOJSON', 'RDF', 'TTL']);
const NON_PROPRIETARY_FORMATS = new Set(['CSV', 'JSON', 'API', 'ODS', 'XML', 'TSV', 'GEOJSON', 'RDF', 'TTL']);

// Only declared format labels are normalized; never infer format by fetching URLs.
const FORMAT_ALIASES: Record<string, string> = {
  'TEXT/CSV': 'CSV',
  'APPLICATION/CSV': 'CSV',
  'APPLICATION/JSON': 'JSON',
  'TEXT/JSON': 'JSON',
  'APPLICATION/PDF': 'PDF',
  'APPLICATION/ZIP': 'ZIP',
  'APPLICATION/X-ZIP-COMPRESSED': 'ZIP',
  'APPLICATION/VND.MS-EXCEL': 'XLS',
  'APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.SPREADSHEETML.SHEET': 'XLSX',
  'APPLICATION/VND.OASIS.OPENDOCUMENT.SPREADSHEET': 'ODS',
  'APPLICATION/XML': 'XML',
  'TEXT/XML': 'XML',
  'TEXT/TAB-SEPARATED-VALUES': 'TSV',
  'APPLICATION/GEO+JSON': 'GEOJSON',
  'APPLICATION/RDF+XML': 'RDF',
  'TEXT/TURTLE': 'TTL',
  'REST API': 'API',
  'RESTFUL API': 'API',
  'WEB API': 'API',
};

const NOTES = [
  'นับเฉพาะ metadata ของแหล่ง/ชุดข้อมูลและ resources ที่ public catalog อนุญาต (approved_public หรือ metadata_only); ไม่อ่าน observations หรือส่งค่าตัวเลขต้นทาง และไม่ใช้ resourceCount ที่ฝังใน metadata เพื่อข้ามสิทธิ์ pending/restricted/internal',
  'จำนวน resources และรูปแบบเป็นเฉพาะส่วนที่เห็นได้ใน public catalog ไม่ใช่ resources ทั้งหมดใน D1; ไม่เห็น resource ไม่ได้แปลว่าต้นทางไม่มีข้อมูล',
  'ตัวชี้วัด machine-readable แบบจำกัดนับเฉพาะ CSV/JSON/API ตามป้าย metadata ไม่ตรวจ payload หรือ endpoint; XLS/XLSX/ODS/XML และรูปแบบอื่นอยู่ใน other ไม่ได้หมายความว่าเครื่องอ่านไม่ได้',
  'machineReadableDatasets รวม mixed (PDF ร่วมกับ CSV/JSON/API) อยู่แล้ว; PDF-only ต้องมีแต่ PDF เท่านั้น; machineReadableDatasets + pdfOnlyDatasets + otherDatasets เท่ากับ totalDatasets โดยห้ามบวก mixed ซ้ำ',
  'unknownDatasets เป็นส่วนหนึ่งของ other: ไม่เห็น resources หรือมีรูปแบบ UNKNOWN โดยยังไม่พบ CSV/JSON/API; ratios ใช้ assessedDatasets = totalDatasets - unknownDatasets และคืน null เมื่อไม่มีชุดที่ประเมินได้',
  'ดาว 1–5 เป็น heuristic metadata assessment เท่านั้น ไม่ใช่การรับรอง open license, linked data หรือสิทธิ์เผยแพร่: ต้องมี isOpen=true ตาม CKAN และชื่อ/id license ที่ระบุ พร้อมรูปแบบ resources ที่เห็นได้ครบ; ขาดหลักฐานหรือ isOpen=false คืน stars=null ไม่ให้ดาวศูนย์',
  'เมื่อเข้าเกณฑ์ heuristic: 1=รูปแบบอื่น/เอกสาร, 2=มีรูปแบบ structured เช่น XLSX, 3=มีรูปแบบ structured non-proprietary เช่น CSV; ไม่ให้ 4/5 จาก URL, API หรือ RDF เพียงอย่างเดียว เพราะไม่มีหลักฐาน URI/link semantics ที่ตรวจแล้ว',
  'readinessScore = ค่าเฉลี่ยดาวของชุดที่ประเมินได้ / 5 × 100 (0–100); ไม่รวม stars=null และคืน null เมื่อทั้งหมดไม่ทราบ ไม่ใช่คะแนนความพร้อมข้อมูลตัวเลขหรืออันดับหน่วยงานที่ยืนยันแล้ว',
  'updates เป็น buckets แบบไม่ซ้ำ: stale หมายถึง dataset.modified_at (CKAN metadata_modified) เก่ากว่า 365 วัน ณ generatedAt เท่านั้น ไม่ใช่ content freshness; timestamp ที่หาย/ผิด/อยู่อนาคตเป็น unknown',
  'sync ปัจจุบันไม่เก็บประวัติ content refresh หรือความถี่ที่ยืนยันแล้ว จึงไม่อนุมาน daily/monthly/annual/other จาก modified_at, harvested_at, resource.created หรือ freshness_days; ชุดที่ metadata ไม่ stale อยู่ใน unknown',
  'generatedAt คือเวลาสร้างผลวิเคราะห์ ไม่ใช่เวลาปรับปรุงข้อมูล; completeness อิง latest metadata sync status ของแหล่งที่กรอง ไม่รับรองว่าต้นทางทั้งหมดถูกค้นพบหรือมีตัวเลขพร้อมใช้',
  'อ่าน D1 แบบ prepared statement เดียวใน snapshot ของ query (ไม่มี N+1 requests); จำกัดผลวิเคราะห์ 10,000 ชุดตาม dataset_id และรวม resources ที่เผยได้ของชุดเหล่านั้นโดยไม่มี resource LIMIT; matchedDatasets นับทั้ง scope ใน query เดียว จึงไม่ได้จำกัดจำนวนแถวที่ D1 สแกน; ถ้า truncated ยอดวิเคราะห์เป็น subset และ completeness=partial; upstream sync เองมี pagination/resource limits',
  'format filter เลือกชุดที่มี resource รูปแบบนั้นซึ่งเผย metadata ได้ แล้ววิเคราะห์ resources ที่เผยได้ทั้งหมดของชุดที่เลือก เพื่อไม่ซ่อน mixed; datasetCount ในแต่ละรูปแบบซ้ำข้ามรูปแบบได้ แต่ resourceCount นับแต่ละ resource ครั้งเดียว',
];

type CatalogRow = {
  sourceId: string;
  sourceName: string;
  metadataStatus: string | null;
  datasetId: string | null;
  modifiedAt: string | null;
  isOpen: number | null;
  licenseDeclared: number;
  formatCounts: string;
  matchedDatasets: number;
};
type FormatCount = { format: string; resourceCount: number };

function normalizeFormat(value: string): string {
  const label = value.trim().toUpperCase();
  return FORMAT_ALIASES[label] ?? (label || 'UNKNOWN');
}

function filterText(value: unknown, name: string): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 80 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า ' + name + ' ไม่ถูกต้องหรือยาวเกินกำหนด');
  }
  return value.trim();
}

function ratio(count: number, denominator: number): number | null {
  return denominator ? Math.min(1, Math.max(0, count / denominator)) : null;
}

function blank(generatedAt: string): OpenDataAnalytics {
  return {
    generatedAt,
    availability: 'unavailable',
    access: 'metadata_only',
    completeness: 'unknown',
    totalDatasets: 0,
    totalResources: 0,
    agencyCount: 0,
    formats: [],
    machineReadability: {
      machineReadableDatasets: 0, pdfOnlyDatasets: 0, mixedDatasets: 0, otherDatasets: 0,
      assessedDatasets: 0, unknownDatasets: 0, machineReadableRatio: null, pdfOnlyRatio: null,
    },
    agencies: [],
    readScope: { maxDatasets: MAX_DATASETS, matchedDatasets: null, analyzedDatasets: 0, truncated: false },
    notes: [...NOTES],
  };
}

function agency(sourceId: string, name: string): OpenDataAgency {
  return {
    sourceId, name, datasetCount: 0, resourceCount: 0, machineReadableDatasets: 0,
    machineReadableRatio: null, assessedDatasets: 0, unknownDatasets: 0, readinessScore: null,
    starCounts: [1, 2, 3, 4, 5, null].map((stars) => ({ stars, datasetCount: 0 })),
    updates: { daily: 0, monthly: 0, annual: 0, stale: 0, other: 0, unknown: 0 },
  };
}

function heuristicStars(row: CatalogRow, formats: Set<string>): number | null {
  if (row.isOpen !== 1 || row.licenseDeclared !== 1 || !formats.size || formats.has('UNKNOWN')) return null;
  if ([...formats].some((format) => NON_PROPRIETARY_FORMATS.has(format))) return 3;
  if ([...formats].some((format) => STRUCTURED_FORMATS.has(format))) return 2;
  return 1;
}

function metadataIsStale(value: string | null, now: number): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/u.test(value)) return false;
  const datePart = value.slice(0, 10);
  const midnight = Date.parse(datePart + 'T00:00:00Z');
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== datePart) return false;
  // CKAN timestamps without a timezone follow the existing sync's UTC convention.
  const iso = value.length === 10 ? value + 'T00:00:00Z' : value.replace(' ', 'T');
  const parsed = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/u.test(iso) ? iso : iso + 'Z');
  return Number.isFinite(parsed) && parsed <= now && now - parsed > STALE_DAYS * 86_400_000;
}

function readFormatCounts(raw: string): FormatCount[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Invalid catalog aggregates');
  return parsed.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid catalog aggregate');
    const { format, resourceCount } = entry as Record<string, unknown>;
    if (typeof format !== 'string' || !Number.isSafeInteger(resourceCount) || Number(resourceCount) < 1) {
      throw new Error('Invalid catalog format aggregate');
    }
    return { format, resourceCount: Number(resourceCount) };
  });
}

// Static SQL literals come only from the normalization table, never from filters.
function catalogSql(): string {
  const label = "upper(trim(coalesce(r.format, '')))";
  const normalized = `CASE ${label} ${Object.entries(FORMAT_ALIASES)
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`).join(' ')} ELSE coalesce(nullif(${label}, ''), 'UNKNOWN') END`;
  return `
    WITH visible_sources AS (
      SELECT s.source_id, s.source_name,
        (SELECT run.status FROM sync_runs run
         WHERE run.source_id = s.source_id AND run.kind = 'metadata'
         ORDER BY run.started_at DESC, run.run_id DESC LIMIT 1) AS metadataStatus
      FROM sources s
      WHERE s.metadata_access_status IN ('approved_public', 'metadata_only')
        AND (? = '' OR s.source_id = ?)
    ), visible_datasets AS (
      SELECT d.dataset_id, d.source_id, d.modified_at,
        CASE WHEN json_type(d.metadata, '$.isOpen') = 'true' THEN 1
             WHEN json_type(d.metadata, '$.isOpen') = 'false' THEN 0 ELSE NULL END AS isOpen,
        CASE WHEN (json_type(d.metadata, '$.licenseId') = 'text'
               AND lower(trim(json_extract(d.metadata, '$.licenseId'))) NOT IN
                 ('', 'other', 'none', 'unknown', 'notspecified', 'not-specified', 'n/a', 'na', 'license not specified'))
               OR (json_type(d.metadata, '$.licenseTitle') = 'text'
               AND lower(trim(json_extract(d.metadata, '$.licenseTitle'))) NOT IN
                 ('', 'other', 'none', 'unknown', 'notspecified', 'not-specified', 'n/a', 'na', 'license not specified'))
             THEN 1 ELSE 0 END AS licenseDeclared
      FROM datasets d JOIN visible_sources s ON s.source_id = d.source_id
      WHERE d.metadata_access_status IN ('approved_public', 'metadata_only')
    ), candidates AS (
      SELECT d.* FROM visible_datasets d
      WHERE ? = '' OR EXISTS (
        SELECT 1 FROM resources r WHERE r.dataset_id = d.dataset_id
          AND r.access_status IN ('approved_public', 'metadata_only') AND ${normalized} = ?
      )
    ), bounded_datasets AS (
      SELECT * FROM candidates ORDER BY dataset_id LIMIT ?
    ), resource_formats AS (
      SELECT r.dataset_id, ${normalized} AS format, count(*) AS resourceCount
      FROM resources r JOIN bounded_datasets d ON d.dataset_id = r.dataset_id
      WHERE r.access_status IN ('approved_public', 'metadata_only')
      GROUP BY r.dataset_id, ${normalized}
    )
    SELECT s.source_id AS sourceId, s.source_name AS sourceName, s.metadataStatus,
      d.dataset_id AS datasetId, d.modified_at AS modifiedAt, d.isOpen,
      coalesce(d.licenseDeclared, 0) AS licenseDeclared,
      json_group_array(json_object('format', rf.format, 'resourceCount', rf.resourceCount))
        FILTER (WHERE rf.dataset_id IS NOT NULL) AS formatCounts,
      (SELECT count(*) FROM candidates) AS matchedDatasets
    FROM visible_sources s LEFT JOIN bounded_datasets d ON d.source_id = s.source_id
    LEFT JOIN resource_formats rf ON rf.dataset_id = d.dataset_id
    WHERE ? = '' OR EXISTS (SELECT 1 FROM candidates c WHERE c.source_id = s.source_id)
    GROUP BY s.source_id, d.dataset_id
    ORDER BY s.source_id, d.dataset_id
  `;
}

export async function getOpenDataAnalytics(filters: OpenDataAnalyticsFilters = {}): Promise<OpenDataAnalytics> {
  const sourceId = filterText(filters.sourceId, 'sourceId');
  const formatInput = filterText(filters.format, 'format');
  const format = formatInput ? normalizeFormat(formatInput) : '';
  const generatedAt = new Date().toISOString();
  const output = blank(generatedAt);

  try {
    const db = await getD1();
    if (!db) throw new Error('Catalog unavailable');
    const result = await db.prepare(catalogSql())
      .bind(sourceId, sourceId, format, format, MAX_DATASETS, format).all<CatalogRow>();
    if (!result.success) throw new Error('Catalog query failed');
    const rows = result.results;
    const matchedDatasets = Number(rows[0]?.matchedDatasets ?? 0);
    if (!Number.isSafeInteger(matchedDatasets) || matchedDatasets < 0) throw new Error('Invalid catalog total');

    const agencies = new Map<string, OpenDataAgency>();
    const formats = new Map<string, OpenDataFormat>();
    const statuses = new Map<string, string | null>();
    const now = Date.parse(generatedAt);

    for (const row of rows) {
      if (!agencies.has(row.sourceId)) agencies.set(row.sourceId, agency(row.sourceId, row.sourceName));
      statuses.set(row.sourceId, row.metadataStatus);
      if (row.datasetId === null) continue;
      const owner = agencies.get(row.sourceId)!;
      const resourceFormats = readFormatCounts(row.formatCounts);
      const labels = new Set(resourceFormats.map((item) => item.format));
      const machine = [...labels].some((label) => MACHINE_FORMATS.has(label));
      const pdf = labels.has('PDF');
      const pdfOnly = labels.size === 1 && pdf;
      const unknown = !labels.size || (labels.has('UNKNOWN') && !machine);
      owner.datasetCount++;
      output.totalDatasets++;
      if (machine) {
        owner.machineReadableDatasets++;
        output.machineReadability.machineReadableDatasets++;
        if (pdf) output.machineReadability.mixedDatasets++;
      } else if (pdfOnly) {
        output.machineReadability.pdfOnlyDatasets++;
      } else {
        output.machineReadability.otherDatasets++;
      }
      if (unknown) {
        owner.unknownDatasets++;
        output.machineReadability.unknownDatasets++;
      } else {
        owner.assessedDatasets++;
        output.machineReadability.assessedDatasets++;
      }
      for (const resource of resourceFormats) {
        const item = formats.get(resource.format) ?? { format: resource.format, datasetCount: 0, resourceCount: 0 };
        item.datasetCount++;
        item.resourceCount += resource.resourceCount;
        formats.set(resource.format, item);
        owner.resourceCount += resource.resourceCount;
        output.totalResources += resource.resourceCount;
      }
      const stars = heuristicStars(row, labels);
      owner.starCounts.find((item) => item.stars === stars)!.datasetCount++;
      owner.updates[metadataIsStale(row.modifiedAt, now) ? 'stale' : 'unknown']++;
    }

    for (const owner of agencies.values()) {
      owner.machineReadableRatio = ratio(owner.machineReadableDatasets, owner.assessedDatasets);
      const rated = owner.starCounts.filter((item) => item.stars !== null);
      const ratedCount = rated.reduce((sum, item) => sum + item.datasetCount, 0);
      owner.readinessScore = ratedCount
        ? Math.min(100, Math.max(0, rated.reduce((sum, item) => sum + item.stars! * item.datasetCount, 0) / ratedCount / 5 * 100))
        : null;
    }
    output.agencies = [...agencies.values()].sort((a, b) => b.datasetCount - a.datasetCount || a.sourceId.localeCompare(b.sourceId));
    output.agencyCount = output.agencies.length;
    output.formats = [...formats.values()].sort((a, b) => b.resourceCount - a.resourceCount || a.format.localeCompare(b.format));
    output.machineReadability.machineReadableRatio = ratio(output.machineReadability.machineReadableDatasets, output.machineReadability.assessedDatasets);
    output.machineReadability.pdfOnlyRatio = ratio(output.machineReadability.pdfOnlyDatasets, output.machineReadability.assessedDatasets);
    output.readScope = { maxDatasets: MAX_DATASETS, matchedDatasets, analyzedDatasets: output.totalDatasets, truncated: matchedDatasets > output.totalDatasets };
    output.completeness = output.readScope.truncated ? 'partial' : catalogSyncCompleteness([...statuses.values()]);
    output.availability = output.totalDatasets ? 'ready' : 'empty';
    if (output.readScope.truncated) output.notes.push('ผลถูกจำกัด: ยอด/สัดส่วน/ดาว/updates เป็น subset ของ matchedDatasets ไม่ใช่ทั้ง catalog');
    if (sourceId || format) output.notes.push('ผลทุกยอดคำนวณใหม่ตามตัวกรอง; agencyCount นับแหล่งที่เผย metadata ได้ (format filter จำกัดแหล่งที่มีชุดตรงเงื่อนไข) ไม่ใช่ coverage ของข้อมูลตัวเลข');
    return output;
  } catch {
    // Never expose D1 errors, SQL, credentials, or partially accumulated results.
    const unavailable = blank(generatedAt);
    unavailable.notes.push('ขณะนี้อ่าน D1 catalog ไม่ได้; availability=unavailable และยอดศูนย์เป็น placeholder ไม่ใช่ผลสำรวจ ไม่มี fallback เป็นข้อมูลจำลองหรือไฟล์ภายใน');
    return unavailable;
  }
}
