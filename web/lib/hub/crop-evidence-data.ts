/**
 * Crop Evidence Reconciliation data layer
 * สำหรับหน้า /crop-evidence และ /api/v1/crop-evidence
 *
 * เทียบเนื้อที่เพาะปลูกรายอำเภอ × พืช (ข้าว / มันสำปะหลัง / ข้าวโพดเลี้ยงสัตว์) จาก 3 แหล่ง:
 * 1. ตัวเลขรายงานทางการระดับจังหวัด (reported)
 * 2. ทะเบียนเกษตรกร กรมส่งเสริมการเกษตร ทบก.01 (registered)
 * 3. ผลตรวจพิสูจน์ภาคสนาม (field verified)
 *
 * ข้อกำหนด:
 * - ข้อมูลทั้งหมดเป็น sample แบบ deterministic (ไม่มีการสุ่ม ไม่มีเวลาปัจจุบันในข้อมูล) และ access = metadata_only
 * - ค่าที่ไม่มีเก็บเป็น null ไม่แทนด้วย 0; อำเภอที่ไม่ปลูกพืชนั้นจะไม่มีแถว
 * - ไม่รวมเนื้อที่ข้ามพืช — สรุปรายจังหวัดแยกต่อพืชเท่านั้น
 * - districtCode เป็น null ทุกแถว เพราะ crosswalk รหัสอำเภอยังไม่ยืนยัน
 * - ไฟล์นี้ต้อง pure (ไม่มี server-only / node import) เพราะ client dashboard import ด้วย
 * - สายข้อมูลอ้างอิง src/tadih/crop_evidence.py (crop-evidence-v1, private_local_only) — ไม่อ่าน data/local หรือ exports/private
 */

export const CROP_EVIDENCE_SAMPLE_MODE = true;
export const CROP_EVIDENCE_DATA_AS_OF = '2026-10-25';
export const CROP_EVIDENCE_SCHEMA_VERSION = 'crop-evidence-reconciliation-v1';
export const CROP_EVIDENCE_DEFAULT_PROVINCE = '73';

export type CropEvidenceCrop = 'rice' | 'cassava' | 'corn';
export type CropEvidenceFilter = CropEvidenceCrop | 'all';
export type ReconciliationStatus = 'verified' | 'pending_verification' | 'discrepancy';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type RecommendationPriority = 'high' | 'medium' | 'low';

export interface CropEvidenceCropConfig {
  id: CropEvidenceCrop;
  label: string;
  labelEn: string;
  color: string;
}

export const CROP_EVIDENCE_CROPS: Record<CropEvidenceCrop, CropEvidenceCropConfig> = {
  rice: { id: 'rice', label: 'ข้าว', labelEn: 'Rice', color: '#15803d' },
  cassava: { id: 'cassava', label: 'มันสำปะหลัง', labelEn: 'Cassava', color: '#a16207' },
  corn: { id: 'corn', label: 'ข้าวโพดเลี้ยงสัตว์', labelEn: 'Maize (feed corn)', color: '#ca8a04' },
};

const CROP_ORDER: CropEvidenceCrop[] = ['rice', 'cassava', 'corn'];

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  verified: 'ผ่านการรับรอง',
  pending_verification: 'รอตรวจพิสูจน์',
  discrepancy: 'พบความคลาดเคลื่อน',
};

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  high: 'สูง',
  medium: 'ปานกลาง',
  low: 'ต่ำ',
};

export const RECOMMENDATION_PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  high: 'เร่งด่วน',
  medium: 'ควรดำเนินการ',
  low: 'ติดตาม',
};

export const DISCREPANCY_THRESHOLDS: {
  verifiedMaxPct: number;
  discrepancyMinPct: number;
  minFieldCoveragePct: number;
  fieldVsRegisteredMaxPct: number;
} = {
  /** ส่วนต่างทะเบียนเทียบรายงานไม่เกินค่านี้จึงรับรองได้ (%) */
  verifiedMaxPct: 5,
  /** ส่วนต่างทะเบียนเทียบรายงานเกินค่านี้ถือว่าคลาดเคลื่อน (%) */
  discrepancyMinPct: 15,
  /** สัดส่วนแปลงที่ตรวจพิสูจน์ต่อแปลงที่ขึ้นทะเบียนขั้นต่ำ (%) */
  minFieldCoveragePct: 30,
  /** ผลตรวจพิสูจน์ต่างจากทะเบียนได้ไม่เกินค่านี้ (%) */
  fieldVsRegisteredMaxPct: 10,
};

/** คะแนนความเชื่อมั่นสูงสุดของแต่ละองค์ประกอบ (รวม 100) */
export const CONFIDENCE_WEIGHTS = {
  sourceAgreement: 40,
  fieldCoverage: 30,
  fieldConsistency: 20,
  completeness: 10,
} as const;

/** ส่วนต่างรายงาน-ทะเบียนที่ทำให้คะแนน sourceAgreement เป็น 0 (%) */
const SOURCE_AGREEMENT_ZERO_AT_PCT = 25;
/** coverage ที่ได้คะแนน fieldCoverage เต็ม (%) */
const FIELD_COVERAGE_FULL_AT_PCT = 60;
/** ผลต่างภาคสนาม-ทะเบียนที่ทำให้คะแนน fieldConsistency เป็น 0 (%) */
const FIELD_CONSISTENCY_ZERO_AT_PCT = 20;

// ---------------------------------------------------------------------------
// Provinces (ชื่อ/รหัสตรวจกับ config/provinces.csv — มาตรฐาน DOPA/MOC)
// ---------------------------------------------------------------------------

export interface CropEvidenceProvinceOption {
  code: string;
  name: string;
}

export const CROP_EVIDENCE_PROVINCES: CropEvidenceProvinceOption[] = [
  { code: '73', name: 'นครปฐม' },
  { code: '14', name: 'พระนครศรีอยุธยา' },
  { code: '16', name: 'ลพบุรี' },
  { code: '60', name: 'นครสวรรค์' },
  { code: '65', name: 'พิษณุโลก' },
  { code: '30', name: 'นครราชสีมา' },
  { code: '34', name: 'อุบลราชธานี' },
  { code: '27', name: 'สระแก้ว' },
];

const PROVINCE_NAME_BY_CODE = new Map(CROP_EVIDENCE_PROVINCES.map((province) => [province.code, province.name]));

export function isCropEvidenceProvinceCode(code: string): boolean {
  return typeof code === 'string' && PROVINCE_NAME_BY_CODE.has(code.trim());
}

const CROP_ALIASES: Record<string, CropEvidenceCrop> = {
  rice: 'rice',
  paddy: 'rice',
  ข้าว: 'rice',
  cassava: 'cassava',
  มันสำปะหลัง: 'cassava',
  มัน: 'cassava',
  corn: 'corn',
  maize: 'corn',
  ข้าวโพด: 'corn',
  ข้าวโพดเลี้ยงสัตว์: 'corn',
};

export function normalizeCropEvidenceCrop(raw: string | null | undefined): CropEvidenceFilter | null {
  if (raw === null || raw === undefined) return 'all';
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return 'all';
  const lower = value.toLowerCase();
  if (lower === 'all' || value === 'ทั้งหมด') return 'all';
  return CROP_ALIASES[lower] ?? CROP_ALIASES[value] ?? null;
}

// ---------------------------------------------------------------------------
// Row contract
// ---------------------------------------------------------------------------

export interface ConfidenceComponents {
  /** 0-40 จาก discrepancyRatePct (0 ถ้า null) */
  sourceAgreement: number;
  /** 0-30 จาก fieldVerificationCoveragePct (0 ถ้า null) */
  fieldCoverage: number;
  /** 0-20 จาก |verified-registered|/registered (0 ถ้า verified null) */
  fieldConsistency: number;
  /** 0-10 สัดส่วนช่องเนื้อที่ 3 แหล่งที่มีค่า */
  completeness: number;
}

export interface DistrictCropEvidence {
  id: string;
  provinceCode: string;
  provinceName: string;
  districtCode: null;
  districtName: string;
  crop: CropEvidenceCrop;
  cropLabel: string;
  season: string;
  reportedAreaRai: number | null;
  registeredAreaRai: number | null;
  registeredPlots: number | null;
  registeredHouseholds: number | null;
  verifiedAreaRai: number | null;
  fieldVerifiedPlots: number | null;
  fieldVerificationCoveragePct: number | null;
  differenceRai: number | null;
  discrepancyRatePct: number | null;
  fieldVsRegisteredPct: number | null;
  status: ReconciliationStatus;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  confidenceComponents: ConfidenceComponents;
  issues: string[];
  recommendations: string[];
  sample: true;
}

export interface CropEvidenceCropSummary {
  crop: CropEvidenceCrop;
  cropLabel: string;
  color: string;
  districtCount: number;
  comparableDistricts: number;
  reportedAreaRai: number | null;
  registeredAreaRai: number | null;
  verifiedAreaRai: number | null;
  discrepancyRatePct: number | null;
  statusCounts: Record<ReconciliationStatus, number>;
  averageConfidenceScore: number | null;
  confidenceLevel: ConfidenceLevel | null;
}

export interface CropEvidenceRecommendation {
  id: string;
  priority: RecommendationPriority;
  title: string;
  detail: string;
  districtIds: string[];
}

export interface CropEvidenceSource {
  id: string;
  name: string;
  agency: string;
  url: string | null;
  role: 'reported' | 'registered' | 'field_verified' | 'reference';
  note: string;
}

export interface CropEvidencePayload {
  schemaVersion: typeof CROP_EVIDENCE_SCHEMA_VERSION;
  sample: true;
  access: 'metadata_only';
  dataAsOf: string;
  filters: { provinceCode: string; provinceName: string; crop: CropEvidenceFilter };
  provinces: CropEvidenceProvinceOption[];
  crops: CropEvidenceCropConfig[];
  districts: DistrictCropEvidence[];
  cropSummaries: CropEvidenceCropSummary[];
  statusCounts: Record<ReconciliationStatus, number>;
  recommendations: CropEvidenceRecommendation[];
  thresholds: typeof DISCREPANCY_THRESHOLDS;
  methodNotes: string[];
  warnings: string[];
  sources: CropEvidenceSource[];
  pythonLineage: {
    module: 'src/tadih/crop_evidence.py';
    schemaVersion: 'crop-evidence-v1';
    scope: 'private_local_only';
    gates: {
      annual_production_rollup: false;
      historical_boundaries_verified: false;
      numerical_production_price_join: false;
      public_release: false;
    };
    blockers: string[];
  };
}

// ---------------------------------------------------------------------------
// Raw deterministic sample inputs (เฉพาะค่าดิบ — ค่าที่คำนวณได้ทั้งหมดสร้างจากฟังก์ชันด้านล่าง)
// ---------------------------------------------------------------------------

/**
 * [ชื่ออำเภอ, slug, พืช, รายงานจังหวัด(ไร่), ทะเบียน ทบก.01(ไร่), แปลงทะเบียน, ครัวเรือนทะเบียน,
 *  ตรวจพิสูจน์(ไร่), แปลงที่ตรวจพิสูจน์]
 */
type RawRow = [
  districtName: string,
  slug: string,
  crop: CropEvidenceCrop,
  reportedAreaRai: number | null,
  registeredAreaRai: number | null,
  registeredPlots: number | null,
  registeredHouseholds: number | null,
  verifiedAreaRai: number | null,
  fieldVerifiedPlots: number | null,
];

const RAW_SAMPLE: Record<string, RawRow[]> = {
  '73': [
    ['กำแพงแสน', 'kamphaeng-saen', 'rice', 168400, 171250, 15820, 9640, 169880, 6120],
    ['ดอนตูม', 'don-tum', 'rice', 72300, 86940, 8050, 5210, 74100, 2880],
    ['บางเลน', 'bang-len', 'rice', 215600, 224180, 19760, 11930, null, null],
    ['นครชัยศรี', 'nakhon-chai-si', 'rice', 61250, 58420, 5630, 3870, 57900, 2140],
    ['เมืองนครปฐม', 'mueang-nakhon-pathom', 'rice', 48900, 53760, 5210, 3640, 52940, 1180],
    ['สามพราน', 'sam-phran', 'rice', 22400, null, null, null, null, null],
  ],
  '14': [
    ['บางบาล', 'bang-ban', 'rice', 98700, 101400, 8960, 4870, 100900, 3210],
    ['ผักไห่', 'phak-hai', 'rice', 168200, 172600, 14730, 7960, 171800, 5320],
    ['เสนา', 'sena', 'rice', 142600, 168900, 14210, 8140, 146300, 4860],
    ['บางปะหัน', 'bang-pahan', 'rice', 112400, 116800, 9870, 5640, null, null],
    ['ลาดบัวหลวง', 'lat-bua-luang', 'rice', 121300, 126900, 10940, 6110, 126100, 1840],
    ['บางซ้าย', 'bang-sai', 'rice', 87400, 84600, 7320, 4180, 84100, 2610],
  ],
  '16': [
    ['ท่าวุ้ง', 'tha-wung', 'rice', 186300, 191200, 16840, 9120, 190400, 6050],
    ['บ้านหมี่', 'ban-mi', 'rice', 312600, 324900, 29140, 16380, null, null],
    ['โคกสำโรง', 'khok-samrong', 'rice', 148700, 176200, 15860, 9240, 153400, 5130],
    ['ชัยบาดาล', 'chai-badan', 'corn', 268900, 276400, 18920, 11470, 274800, 6680],
    ['ชัยบาดาล', 'chai-badan', 'cassava', 96800, 99400, 7130, 4620, 98900, 1470],
    ['ลำสนธิ', 'lam-sonthi', 'corn', 112300, 134900, 9310, 5980, 132600, 3170],
    ['ท่าหลวง', 'tha-luang', 'corn', 92400, 95700, 6580, 4310, 95100, 2260],
    ['โคกเจริญ', 'khok-charoen', 'corn', 71800, 74100, 5140, 3380, null, null],
    ['พัฒนานิคม', 'phatthana-nikhom', 'cassava', 128500, 133200, 9640, 6080, 132400, 3380],
    ['พัฒนานิคม', 'phatthana-nikhom', 'corn', 64300, 67900, 4820, 3140, 66800, 1690],
  ],
  '60': [
    ['ชุมแสง', 'chum-saeng', 'rice', 286500, 291300, 25840, 13920, 290100, 9420],
    ['บรรพตพิสัย', 'banphot-phisai', 'rice', 342100, 356800, 31760, 17240, 354200, 10880],
    ['เมืองนครสวรรค์', 'mueang-nakhon-sawan', 'rice', 198700, 236400, 21330, 12450, 205600, 6980],
    ['ท่าตะโก', 'tha-tako', 'rice', 214900, 223600, 19880, 11760, null, null],
    ['ท่าตะโก', 'tha-tako', 'corn', 41800, 44100, 3010, 2240, 43700, 1020],
    ['ตาคลี', 'takhli', 'corn', 156200, 161400, 10870, 6920, 159800, 3740],
    ['ตาคลี', 'takhli', 'cassava', 92600, null, null, null, null, null],
    ['ไพศาลี', 'phaisali', 'corn', 132700, 158900, 10240, 6880, 136400, 3450],
    ['ไพศาลี', 'phaisali', 'cassava', 74300, 76800, 5620, 3890, 76100, 1980],
    ['ลาดยาว', 'lat-yao', 'cassava', 118900, 124300, 8960, 5710, 123500, 2140],
    ['ลาดยาว', 'lat-yao', 'corn', 61400, 63200, 4530, 3180, null, null],
    ['พยุหะคีรี', 'phayuha-khiri', 'rice', 176300, 179800, 16140, 9560, 178900, 5870],
  ],
  '65': [
    ['บางระกำ', 'bang-rakam', 'rice', 412300, 428600, 37840, 19960, 426100, 12680],
    ['พรหมพิราม', 'phrom-phiram', 'rice', 318500, 381200, 33620, 18470, 327400, 10940],
    ['บางกระทุ่ม', 'bang-krathum', 'rice', 196800, 203400, 17830, 9920, null, null],
    ['เมืองพิษณุโลก', 'mueang-phitsanulok', 'rice', 154200, 163900, 14560, 8630, 162700, 4780],
    ['วังทอง', 'wang-thong', 'corn', 128600, 132400, 9180, 6140, 131700, 3190],
    ['เนินมะปราง', 'noen-maprang', 'corn', 87300, 104900, 7260, 4830, 101800, 2470],
    ['เนินมะปราง', 'noen-maprang', 'cassava', 34600, 35900, 2610, 1870, 35400, 640],
    ['นครไทย', 'nakhon-thai', 'corn', 96400, 99800, 7040, 4960, null, null],
    ['วัดโบสถ์', 'wat-bot', 'corn', null, 77300, 5420, 3760, null, null],
  ],
  '30': [
    ['พิมาย', 'phimai', 'rice', 389500, 401200, 36480, 21950, 398700, 12760],
    ['โนนสูง', 'non-sung', 'rice', 352800, 366900, 34120, 20860, null, null],
    ['บัวใหญ่', 'bua-yai', 'rice', 198300, 212700, 19450, 11830, 210300, 4260],
    ['บัวใหญ่', 'bua-yai', 'cassava', 64200, 66100, 4980, 3410, 65300, 1720],
    ['ด่านขุนทด', 'dan-khun-thot', 'cassava', 412600, 498300, 34870, 20140, 431900, 11850],
    ['ด่านขุนทด', 'dan-khun-thot', 'corn', 58900, 61200, 4320, 2980, 60100, 1450],
    ['สีคิ้ว', 'sikhio', 'cassava', 186400, 191800, 13560, 8420, 189900, 4520],
    ['สีคิ้ว', 'sikhio', 'corn', 72500, 69300, 5140, 3560, 61800, 1820],
    ['ครบุรี', 'khon-buri', 'cassava', 241700, 252900, 18230, 11060, null, null],
    ['ครบุรี', 'khon-buri', 'rice', 96400, 99100, 9870, 6240, 98300, 3310],
    ['ปักธงชัย', 'pak-thong-chai', 'cassava', 128300, 151600, 11040, 7350, 149200, 3960],
    ['สูงเนิน', 'sung-noen', 'cassava', 83700, 85900, 6410, 4280, 85100, 1350],
    ['ปากช่อง', 'pak-chong', 'corn', 268400, 289500, 18960, 10870, 284600, 6240],
  ],
  '34': [
    ['ตระการพืชผล', 'trakan-phuet-phon', 'rice', 512800, 524600, 48960, 27430, 522900, 16840],
    ['เขื่องใน', 'khueang-nai', 'rice', 386400, 398900, 37120, 21060, null, null],
    ['ม่วงสามสิบ', 'muang-sam-sip', 'rice', 341200, 404700, 36980, 20940, 352600, 11870],
    ['วารินชำราบ', 'warin-chamrap', 'rice', 214300, 220100, 20460, 12380, 219400, 6980],
    ['เดชอุดม', 'det-udom', 'rice', 398700, 421600, 38940, 22310, 418300, 9860],
    ['เดชอุดม', 'det-udom', 'cassava', 46200, 47600, 3480, 2460, 47100, 1210],
    ['น้ำยืน', 'nam-yuen', 'cassava', 78900, 93400, 6820, 4590, 91800, 2360],
    ['บุณฑริก', 'buntharik', 'cassava', 69300, 71800, 5240, 3620, null, null],
    ['น้ำขุ่น', 'nam-khun', 'cassava', 38600, 39700, 2890, 2040, 39300, 1020],
  ],
  '27': [
    ['วังน้ำเย็น', 'wang-nam-yen', 'cassava', 156800, 161900, 11260, 6940, 160700, 3920],
    ['คลองหาด', 'khlong-hat', 'cassava', 132400, 158600, 10870, 6720, 138200, 3640],
    ['คลองหาด', 'khlong-hat', 'corn', 48200, 49600, 3520, 2410, null, null],
    ['วังสมบูรณ์', 'wang-sombun', 'cassava', 118600, 122700, 8540, 5320, 121900, 2980],
    ['วังสมบูรณ์', 'wang-sombun', 'corn', 39400, 37100, 2760, 1930, 32900, 970],
    ['เขาฉกรรจ์', 'khao-chakan', 'cassava', 104300, 109600, 7840, 4960, 108800, 1630],
    ['วัฒนานคร', 'watthana-nakhon', 'cassava', 142900, 147300, 10560, 6580, 146200, 3710],
    ['วัฒนานคร', 'watthana-nakhon', 'rice', 268400, 276900, 25140, 14760, null, null],
    ['อรัญประเทศ', 'aranyaprathet', 'rice', 236700, 244300, 22380, 13140, 243100, 7630],
    ['ตาพระยา', 'ta-phraya', 'rice', 112500, 133800, 12240, 7280, 118900, 4010],
  ],
};

const SEASON_LABEL = '2568/69';

function seasonFor(crop: CropEvidenceCrop): string {
  return crop === 'rice' ? `นาปี ${SEASON_LABEL}` : `ปีเพาะปลูก ${SEASON_LABEL}`;
}

// ---------------------------------------------------------------------------
// Derivation functions
// ---------------------------------------------------------------------------

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPct(value: number): string {
  return value.toFixed(1);
}

function formatRai(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** |registered-reported|/reported*100 (1 ตำแหน่ง); null ถ้าค่าใดเป็น null หรือ reported = 0 */
export function computeDiscrepancyRatePct(reported: number | null, registered: number | null): number | null {
  if (reported === null || registered === null || reported === 0) return null;
  return round1((Math.abs(registered - reported) / reported) * 100);
}

/** |verified-registered|/registered*100 (1 ตำแหน่ง) */
export function computeFieldVsRegisteredPct(verified: number | null, registered: number | null): number | null {
  if (verified === null || registered === null || registered === 0) return null;
  return round1((Math.abs(verified - registered) / registered) * 100);
}

/** fieldVerifiedPlots/registeredPlots*100 (1 ตำแหน่ง) */
export function computeFieldCoveragePct(fieldPlots: number | null, registeredPlots: number | null): number | null {
  if (fieldPlots === null || registeredPlots === null || registeredPlots === 0) return null;
  return round1((fieldPlots / registeredPlots) * 100);
}

export interface ReconciliationInput {
  reportedAreaRai: number | null;
  registeredAreaRai: number | null;
  verifiedAreaRai: number | null;
  discrepancyRatePct: number | null;
  fieldVerificationCoveragePct: number | null;
  fieldVsRegisteredPct: number | null;
}

export function classifyReconciliation(input: ReconciliationInput): ReconciliationStatus {
  const t = DISCREPANCY_THRESHOLDS;
  if (input.reportedAreaRai === null || input.registeredAreaRai === null) return 'pending_verification';
  const rate = input.discrepancyRatePct;
  if (
    (rate !== null && rate > t.discrepancyMinPct) ||
    (input.fieldVsRegisteredPct !== null && input.fieldVsRegisteredPct > t.fieldVsRegisteredMaxPct)
  ) {
    return 'discrepancy';
  }
  if (
    rate !== null &&
    rate <= t.verifiedMaxPct &&
    input.fieldVerificationCoveragePct !== null &&
    input.fieldVerificationCoveragePct >= t.minFieldCoveragePct &&
    input.verifiedAreaRai !== null
  ) {
    return 'verified';
  }
  return 'pending_verification';
}

export function computeConfidenceComponents(input: ReconciliationInput): ConfidenceComponents {
  const w = CONFIDENCE_WEIGHTS;
  const sourceAgreement =
    input.discrepancyRatePct === null
      ? 0
      : Math.round(w.sourceAgreement * clamp(1 - input.discrepancyRatePct / SOURCE_AGREEMENT_ZERO_AT_PCT, 0, 1));
  const fieldCoverage =
    input.fieldVerificationCoveragePct === null
      ? 0
      : Math.round(w.fieldCoverage * clamp(input.fieldVerificationCoveragePct / FIELD_COVERAGE_FULL_AT_PCT, 0, 1));
  const fieldConsistency =
    input.verifiedAreaRai === null || input.fieldVsRegisteredPct === null
      ? 0
      : Math.round(w.fieldConsistency * clamp(1 - input.fieldVsRegisteredPct / FIELD_CONSISTENCY_ZERO_AT_PCT, 0, 1));
  const present = [input.reportedAreaRai, input.registeredAreaRai, input.verifiedAreaRai].filter(
    (value) => value !== null
  ).length;
  const completeness = Math.round((w.completeness * present) / 3);
  return { sourceAgreement, fieldCoverage, fieldConsistency, completeness };
}

export function confidenceLevelFor(score: number): ConfidenceLevel {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

type IssueCode =
  | 'missing_reported'
  | 'missing_registered'
  | 'high_discrepancy'
  | 'field_mismatch'
  | 'moderate_discrepancy'
  | 'no_field_verification'
  | 'low_field_coverage';

interface RowFinding {
  code: IssueCode;
  issue: string;
  recommendation: string;
}

function evaluateFindings(row: Omit<DistrictCropEvidence, 'issues' | 'recommendations'>): RowFinding[] {
  const t = DISCREPANCY_THRESHOLDS;
  const findings: RowFinding[] = [];

  if (row.reportedAreaRai === null) {
    findings.push({
      code: 'missing_reported',
      issue: 'ยังไม่มีตัวเลขเนื้อที่เพาะปลูกที่จังหวัดรายงานสำหรับอำเภอและพืชนี้ จึงเทียบกับทะเบียนไม่ได้',
      recommendation:
        'ประสานสำนักงานเกษตรจังหวัด/สศก. ขอตัวเลขรายงานระดับอำเภอ พร้อมนิยามฤดูกาลและวันตัดข้อมูล',
    });
  }
  if (row.registeredAreaRai === null) {
    findings.push({
      code: 'missing_registered',
      issue: 'ยังไม่ได้รับข้อมูลทะเบียนเกษตรกร ทบก.01 ของพืชนี้ในอำเภอ (ไม่ถือว่าเนื้อที่เป็น 0)',
      recommendation:
        'ขอชุดข้อมูล ทบก.01 ระดับแปลงจากสำนักงานเกษตรอำเภอ และยืนยันสิทธิ์การใช้ข้อมูลก่อนนำเข้า',
    });
  }

  const rate = row.discrepancyRatePct;
  if (rate !== null && row.differenceRai !== null) {
    const direction = row.differenceRai >= 0 ? 'สูงกว่า' : 'ต่ำกว่า';
    if (rate > t.discrepancyMinPct) {
      const fieldSupportsRegistry =
        row.fieldVsRegisteredPct !== null && row.fieldVsRegisteredPct <= t.fieldVsRegisteredMaxPct;
      findings.push({
        code: 'high_discrepancy',
        issue: `เนื้อที่ตามทะเบียน${direction}ตัวเลขรายงานจังหวัด ${formatPct(rate)}% (${formatRai(Math.abs(row.differenceRai))} ไร่) เกินเกณฑ์ ${t.discrepancyMinPct}%`,
        recommendation: fieldSupportsRegistry
          ? 'ผลตรวจพิสูจน์ใกล้เคียงทะเบียน ควรทบทวนตัวเลขรายงานจังหวัดและวิธีประมาณการเนื้อที่ของอำเภอนี้'
          : 'ตรวจหาแปลงขึ้นทะเบียนซ้ำซ้อนหรือแจ้งเนื้อที่เกินจริงใน ทบก.01 แล้วเทียบกับผลตรวจพิสูจน์ภาคสนาม',
      });
    } else if (rate > t.verifiedMaxPct) {
      findings.push({
        code: 'moderate_discrepancy',
        issue: `เนื้อที่ตามทะเบียน${direction}ตัวเลขรายงานจังหวัด ${formatPct(rate)}% อยู่ในช่วงต้องติดตาม (${t.verifiedMaxPct}–${t.discrepancyMinPct}%)`,
        recommendation:
          'ตรวจความต่างของรอบการปลูกและวันตัดข้อมูลระหว่างรายงานจังหวัดกับ ทบก.01 ก่อนสรุปผล',
      });
    }
  }

  if (row.fieldVsRegisteredPct !== null && row.fieldVsRegisteredPct > t.fieldVsRegisteredMaxPct) {
    findings.push({
      code: 'field_mismatch',
      issue: `ผลตรวจพิสูจน์ภาคสนามต่างจากทะเบียน ${formatPct(row.fieldVsRegisteredPct)}% เกินเกณฑ์ ${t.fieldVsRegisteredMaxPct}%`,
      recommendation: 'สุ่มตรวจซ้ำแปลงที่ผลต่างสูง และปรับปรุงเนื้อที่ในทะเบียนตามผลตรวจพิสูจน์ที่ยืนยันแล้ว',
    });
  }

  if (row.registeredAreaRai !== null && row.verifiedAreaRai === null) {
    findings.push({
      code: 'no_field_verification',
      issue: 'ยังไม่มีผลตรวจพิสูจน์ภาคสนาม จึงยืนยันเนื้อที่ตามทะเบียนไม่ได้',
      recommendation: `จัดแผนสุ่มตรวจพิสูจน์อย่างน้อย ${t.minFieldCoveragePct}% ของแปลงที่ขึ้นทะเบียน`,
    });
  } else if (
    row.fieldVerificationCoveragePct !== null &&
    row.fieldVerificationCoveragePct < t.minFieldCoveragePct
  ) {
    findings.push({
      code: 'low_field_coverage',
      issue: `ตรวจพิสูจน์แล้ว ${formatPct(row.fieldVerificationCoveragePct)}% ของแปลงที่ขึ้นทะเบียน ต่ำกว่าเกณฑ์ ${t.minFieldCoveragePct}%`,
      recommendation: `เพิ่มจำนวนแปลงตรวจพิสูจน์ให้ถึง ${t.minFieldCoveragePct}% โดยเน้นตำบลที่ยังไม่ได้สุ่มตรวจ`,
    });
  }

  return findings;
}

const ROW_FINDINGS = new Map<string, IssueCode[]>();

function buildRow(provinceCode: string, raw: RawRow): DistrictCropEvidence {
  const [districtName, slug, crop, reported, registered, plots, households, verified, fieldPlots] = raw;
  const provinceName = PROVINCE_NAME_BY_CODE.get(provinceCode) ?? provinceCode;
  const discrepancyRatePct = computeDiscrepancyRatePct(reported, registered);
  const fieldVsRegisteredPct = computeFieldVsRegisteredPct(verified, registered);
  const fieldVerificationCoveragePct = computeFieldCoveragePct(fieldPlots, plots);
  const reconciliationInput: ReconciliationInput = {
    reportedAreaRai: reported,
    registeredAreaRai: registered,
    verifiedAreaRai: verified,
    discrepancyRatePct,
    fieldVerificationCoveragePct,
    fieldVsRegisteredPct,
  };
  const status = classifyReconciliation(reconciliationInput);
  const confidenceComponents = computeConfidenceComponents(reconciliationInput);
  const confidenceScore =
    confidenceComponents.sourceAgreement +
    confidenceComponents.fieldCoverage +
    confidenceComponents.fieldConsistency +
    confidenceComponents.completeness;

  const base: Omit<DistrictCropEvidence, 'issues' | 'recommendations'> = {
    id: `${provinceCode}-${slug}-${crop}`,
    provinceCode,
    provinceName,
    districtCode: null,
    districtName,
    crop,
    cropLabel: CROP_EVIDENCE_CROPS[crop].label,
    season: seasonFor(crop),
    reportedAreaRai: reported,
    registeredAreaRai: registered,
    registeredPlots: plots,
    registeredHouseholds: households,
    verifiedAreaRai: verified,
    fieldVerifiedPlots: fieldPlots,
    fieldVerificationCoveragePct,
    differenceRai: reported !== null && registered !== null ? registered - reported : null,
    discrepancyRatePct,
    fieldVsRegisteredPct,
    status,
    confidenceScore,
    confidenceLevel: confidenceLevelFor(confidenceScore),
    confidenceComponents,
    sample: true,
  };

  const findings = evaluateFindings(base);
  ROW_FINDINGS.set(base.id, findings.map((finding) => finding.code));
  const issues = findings.map((finding) => finding.issue);
  const recommendations = findings.map((finding) => finding.recommendation);
  if (status === 'verified') {
    issues.push('เนื้อที่จากรายงานจังหวัด ทะเบียน ทบก.01 และผลตรวจพิสูจน์สอดคล้องกันตามเกณฑ์');
    recommendations.push('คงรอบตรวจพิสูจน์ตามปกติ และบันทึกเวอร์ชันข้อมูลทุกแหล่งเพื่อเทียบรอบถัดไป');
  }

  return { ...base, issues, recommendations };
}

/** ทุกแถวตัวอย่าง (อำเภอ × พืช) ของทุกจังหวัดในขอบเขต */
export const CROP_EVIDENCE_ROWS: DistrictCropEvidence[] = CROP_EVIDENCE_PROVINCES.flatMap((province) =>
  (RAW_SAMPLE[province.code] ?? []).map((raw) => buildRow(province.code, raw))
);

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const STATUS_SEVERITY: Record<ReconciliationStatus, number> = {
  discrepancy: 0,
  pending_verification: 1,
  verified: 2,
};

function emptyStatusCounts(): Record<ReconciliationStatus, number> {
  return { verified: 0, pending_verification: 0, discrepancy: 0 };
}

function countStatuses(rows: DistrictCropEvidence[]): Record<ReconciliationStatus, number> {
  const counts = emptyStatusCounts();
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

function compareRows(a: DistrictCropEvidence, b: DistrictCropEvidence): number {
  const severity = STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status];
  if (severity !== 0) return severity;
  const rateA = a.discrepancyRatePct;
  const rateB = b.discrepancyRatePct;
  if (rateA !== rateB) {
    if (rateA === null) return 1;
    if (rateB === null) return -1;
    return rateB - rateA;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function summarizeCropEvidence(rows: DistrictCropEvidence[], crop: CropEvidenceCrop): CropEvidenceCropSummary {
  const config = CROP_EVIDENCE_CROPS[crop];
  const cropRows = rows.filter((row) => row.crop === crop);
  const comparable = cropRows.filter((row) => row.reportedAreaRai !== null && row.registeredAreaRai !== null);
  const reportedSum = comparable.reduce((sum, row) => sum + (row.reportedAreaRai ?? 0), 0);
  const registeredSum = comparable.reduce((sum, row) => sum + (row.registeredAreaRai ?? 0), 0);
  const verifiedRows = cropRows.filter((row) => row.verifiedAreaRai !== null);
  const verifiedSum = verifiedRows.reduce((sum, row) => sum + (row.verifiedAreaRai ?? 0), 0);
  const averageConfidenceScore =
    cropRows.length > 0
      ? Math.round(cropRows.reduce((sum, row) => sum + row.confidenceScore, 0) / cropRows.length)
      : null;

  return {
    crop,
    cropLabel: config.label,
    color: config.color,
    districtCount: cropRows.length,
    comparableDistricts: comparable.length,
    reportedAreaRai: comparable.length > 0 ? reportedSum : null,
    registeredAreaRai: comparable.length > 0 ? registeredSum : null,
    verifiedAreaRai: verifiedRows.length > 0 ? verifiedSum : null,
    discrepancyRatePct: comparable.length > 0 ? computeDiscrepancyRatePct(reportedSum, registeredSum) : null,
    statusCounts: countStatuses(cropRows),
    averageConfidenceScore,
    confidenceLevel: averageConfidenceScore === null ? null : confidenceLevelFor(averageConfidenceScore),
  };
}

interface RecommendationTemplate {
  priority: RecommendationPriority;
  title: string;
  detail: string;
}

const RECOMMENDATION_TEMPLATES: Record<IssueCode, RecommendationTemplate> = {
  missing_reported: {
    priority: 'high',
    title: 'ขอตัวเลขรายงานเนื้อที่ระดับอำเภอที่ยังขาด',
    detail: 'ประสานสำนักงานเกษตรจังหวัด/สศก. เพื่อให้ได้ตัวเลขรายงานพร้อมนิยามฤดูกาลและวันตัดข้อมูล',
  },
  missing_registered: {
    priority: 'high',
    title: 'นำเข้าข้อมูลทะเบียน ทบก.01 ที่ยังขาด',
    detail: 'ขอชุดข้อมูลทะเบียนระดับแปลงจากสำนักงานเกษตรอำเภอ และยืนยันสิทธิ์การใช้ข้อมูลก่อนนำเข้า',
  },
  high_discrepancy: {
    priority: 'high',
    title: `ตรวจทานส่วนต่างทะเบียนกับรายงานจังหวัดที่เกิน ${DISCREPANCY_THRESHOLDS.discrepancyMinPct}%`,
    detail:
      'ตรวจแปลงซ้ำซ้อน/แจ้งเนื้อที่เกินจริงในทะเบียน และทบทวนวิธีประมาณการของรายงานจังหวัด โดยใช้ผลตรวจพิสูจน์เป็นตัวตัดสิน',
  },
  field_mismatch: {
    priority: 'high',
    title: `สุ่มตรวจซ้ำพื้นที่ที่ผลภาคสนามต่างจากทะเบียนเกิน ${DISCREPANCY_THRESHOLDS.fieldVsRegisteredMaxPct}%`,
    detail: 'ตรวจซ้ำแปลงที่ผลต่างสูง แล้วปรับปรุงเนื้อที่ในทะเบียนตามผลตรวจพิสูจน์ที่ยืนยันแล้ว',
  },
  moderate_discrepancy: {
    priority: 'medium',
    title: `ติดตามส่วนต่าง ${DISCREPANCY_THRESHOLDS.verifiedMaxPct}–${DISCREPANCY_THRESHOLDS.discrepancyMinPct}% ระหว่างทะเบียนกับรายงาน`,
    detail: 'ตรวจความต่างของรอบการปลูกและวันตัดข้อมูลระหว่างรายงานจังหวัดกับ ทบก.01 ก่อนสรุปผล',
  },
  no_field_verification: {
    priority: 'medium',
    title: 'จัดแผนตรวจพิสูจน์ภาคสนามในพื้นที่ที่ยังไม่มีผล',
    detail: `สุ่มตรวจพิสูจน์อย่างน้อย ${DISCREPANCY_THRESHOLDS.minFieldCoveragePct}% ของแปลงที่ขึ้นทะเบียน เพื่อให้รับรองเนื้อที่ได้`,
  },
  low_field_coverage: {
    priority: 'medium',
    title: `เพิ่มสัดส่วนแปลงตรวจพิสูจน์ให้ถึง ${DISCREPANCY_THRESHOLDS.minFieldCoveragePct}%`,
    detail: 'เพิ่มแปลงตัวอย่างโดยเน้นตำบลที่ยังไม่ได้สุ่มตรวจ เพื่อให้ผลภาคสนามเป็นตัวแทนของทั้งอำเภอ',
  },
};

const ISSUE_CODE_ORDER: IssueCode[] = [
  'missing_registered',
  'missing_reported',
  'high_discrepancy',
  'field_mismatch',
  'moderate_discrepancy',
  'no_field_verification',
  'low_field_coverage',
];

const PRIORITY_RANK: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

function rowLabel(row: DistrictCropEvidence): string {
  return `${row.districtName} (${row.cropLabel})`;
}

function buildRecommendations(rows: DistrictCropEvidence[], provinceCode: string): CropEvidenceRecommendation[] {
  const recommendations: CropEvidenceRecommendation[] = [];

  ISSUE_CODE_ORDER.forEach((code) => {
    const matched = rows.filter((row) => (ROW_FINDINGS.get(row.id) ?? []).includes(code));
    if (matched.length === 0) return;
    const template = RECOMMENDATION_TEMPLATES[code];
    recommendations.push({
      id: `${provinceCode}-${code}`,
      priority: template.priority,
      title: template.title,
      detail: `${template.detail} — ${matched.length} รายการ: ${matched.map(rowLabel).join(', ')}`,
      districtIds: matched.map((row) => row.id),
    });
  });

  if (rows.length > 0) {
    recommendations.push({
      id: `${provinceCode}-district_code_crosswalk`,
      priority: 'low',
      title: 'จัดทำ crosswalk รหัสอำเภอที่ตรวจสอบได้',
      detail:
        'จับคู่ชื่ออำเภอกับรหัสมาตรฐาน DOPA พร้อมเวอร์ชันและวันที่มีผล ก่อนเชื่อมกับข้อมูลชุดอื่น (ปัจจุบัน districtCode เป็น null ทุกแถว)',
      districtIds: rows.map((row) => row.id),
    });
  }

  return recommendations.sort((a, b) => {
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return b.districtIds.length - a.districtIds.length;
  });
}

// ---------------------------------------------------------------------------
// Static notes, warnings, sources, lineage
// ---------------------------------------------------------------------------

export const CROP_EVIDENCE_METHOD_NOTES: string[] = [
  'อัตราความคลาดเคลื่อน (%) = |เนื้อที่ทะเบียน ทบก.01 − เนื้อที่รายงานจังหวัด| ÷ เนื้อที่รายงานจังหวัด × 100 ปัด 1 ตำแหน่ง; เป็น null เมื่อค่าใดค่าหนึ่งไม่มีหรือรายงาน = 0',
  'ผลต่างภาคสนาม (%) = |เนื้อที่ตรวจพิสูจน์ − เนื้อที่ทะเบียน| ÷ เนื้อที่ทะเบียน × 100; ความครอบคลุมการตรวจพิสูจน์ (%) = แปลงที่ตรวจพิสูจน์ ÷ แปลงที่ขึ้นทะเบียน × 100',
  `สถานะ: ขาดรายงานหรือทะเบียน → รอตรวจพิสูจน์; ความคลาดเคลื่อน > ${DISCREPANCY_THRESHOLDS.discrepancyMinPct}% หรือผลต่างภาคสนาม > ${DISCREPANCY_THRESHOLDS.fieldVsRegisteredMaxPct}% → พบความคลาดเคลื่อน; ความคลาดเคลื่อน ≤ ${DISCREPANCY_THRESHOLDS.verifiedMaxPct}% และตรวจพิสูจน์ ≥ ${DISCREPANCY_THRESHOLDS.minFieldCoveragePct}% ของแปลงพร้อมมีผลตรวจพิสูจน์ → ผ่านการรับรอง; นอกนั้น → รอตรวจพิสูจน์`,
  `คะแนนความเชื่อมั่น 0–100 = ความสอดคล้องของแหล่ง (0–${CONFIDENCE_WEIGHTS.sourceAgreement}, ลดลงเชิงเส้นจนเป็น 0 ที่ความคลาดเคลื่อน ${SOURCE_AGREEMENT_ZERO_AT_PCT}%) + ความครอบคลุมภาคสนาม (0–${CONFIDENCE_WEIGHTS.fieldCoverage}, เต็มที่ ${FIELD_COVERAGE_FULL_AT_PCT}%) + ความสอดคล้องภาคสนาม (0–${CONFIDENCE_WEIGHTS.fieldConsistency}, เป็น 0 ที่ผลต่าง ${FIELD_CONSISTENCY_ZERO_AT_PCT}%) + ความครบถ้วนของข้อมูล 3 แหล่ง (0–${CONFIDENCE_WEIGHTS.completeness}); องค์ประกอบที่ไม่มีข้อมูลได้ 0`,
  'ระดับความเชื่อมั่น: ≥ 75 สูง, ≥ 50 ปานกลาง, ต่ำกว่านั้น ต่ำ',
  'สรุปรายพืชรวมเนื้อที่รายงานและทะเบียนเฉพาะอำเภอที่มีทั้งสองค่า (comparable) และไม่รวมเนื้อที่ข้ามพืช',
];

export const CROP_EVIDENCE_WARNINGS: string[] = [
  'ข้อมูลทั้งหมดเป็นตัวอย่างสาธิต (sample) แบบกำหนดค่าตายตัว ไม่ใช่สถิติทางการและห้ามใช้อ้างอิงเชิงนโยบาย',
  'สิทธิ์การเผยแพร่ข้อมูลทะเบียน ทบก.01 และผลตรวจพิสูจน์ยังรอการยืนยัน จึงเปิดเฉพาะระดับ metadata_only',
  'ยังไม่ยืนยัน crosswalk รหัสอำเภอ — districtCode เป็น null ทุกแถว ใช้ชื่ออำเภอเป็นตัวระบุชั่วคราว',
  'การจับคู่ชื่อพื้นที่กับ snapshot ของ DOPA ไม่ใช่การยืนยันขอบเขตการปกครองย้อนหลัง',
  'ไม่รวมเนื้อที่ข้ามพืช (ข้าว มันสำปะหลัง ข้าวโพดเลี้ยงสัตว์) และไม่มียอดรวมทุกพืชของจังหวัด',
  'ค่าที่ไม่มีข้อมูลแสดงเป็น null ไม่ใช่ 0; อำเภอที่ไม่มีแถวของพืชใดไม่ได้หมายความว่าไม่มีการปลูกพืชนั้น',
  'ขอบเขตครอบคลุมเพียง 8 จังหวัดตัวอย่างและบางอำเภอ ไม่ใช่ความครอบคลุมทั้ง 77 จังหวัด',
];

export const CROP_EVIDENCE_SOURCES: CropEvidenceSource[] = [
  {
    id: 'oae_provincial_planted_area',
    name: 'รายงานเนื้อที่เพาะปลูกพืชเศรษฐกิจระดับจังหวัด/อำเภอ',
    agency: 'สำนักงานเศรษฐกิจการเกษตร (สศก.) และสำนักงานเกษตรจังหวัด',
    url: 'https://www.oae.go.th',
    role: 'reported',
    note: 'ตัวเลขทางการที่จังหวัดรายงาน ยังต้องตรวจนิยามฤดูกาล รอบการปลูก และ revision ราย resource',
  },
  {
    id: 'doae_tbk01_registry',
    name: 'ทะเบียนเกษตรกร ทบก.01',
    agency: 'กรมส่งเสริมการเกษตร (กสก.)',
    url: null,
    role: 'registered',
    note: 'ข้อมูลระดับแปลงเป็นข้อมูลส่วนบุคคล ยังไม่ได้รับสิทธิ์เผยแพร่ — ยังไม่ระบุ URL จนกว่าจะยืนยันช่องทางทางการ',
  },
  {
    id: 'doae_field_verification',
    name: 'ผลการตรวจพิสูจน์พื้นที่เพาะปลูกภาคสนาม',
    agency: 'กรมส่งเสริมการเกษตร (สำนักงานเกษตรอำเภอ)',
    url: null,
    role: 'field_verified',
    note: 'ผลสุ่มตรวจแปลงภาคสนาม ยังไม่มีชุดข้อมูลเปิดที่ยืนยันได้',
  },
  {
    id: 'doae_ckan_catalog',
    name: 'แคตตาล็อกข้อมูลเปิด กรมส่งเสริมการเกษตร',
    agency: 'กรมส่งเสริมการเกษตร (กสก.)',
    url: 'https://ckan.doae.go.th',
    role: 'reference',
    note: 'ใช้ค้นหา metadata ของชุดข้อมูลการผลิตรายพื้นที่ ไม่ใช่แหล่งของตัวเลขตัวอย่างในหน้านี้',
  },
  {
    id: 'moc_province_code_standard',
    name: 'มาตรฐานรหัสจังหวัด (DOPA/MOC)',
    agency: 'กระทรวงพาณิชย์ / กรมการปกครอง',
    url: 'https://std.moc.go.th/std/group/28',
    role: 'reference',
    note: 'ยืนยันเฉพาะรหัส/ชื่อจังหวัดตาม config/provinces.csv ไม่รวมรหัสอำเภอหรือขอบเขตย้อนหลัง',
  },
];

const PYTHON_LINEAGE: CropEvidencePayload['pythonLineage'] = {
  module: 'src/tadih/crop_evidence.py',
  schemaVersion: 'crop-evidence-v1',
  scope: 'private_local_only',
  gates: {
    annual_production_rollup: false,
    historical_boundaries_verified: false,
    numerical_production_price_join: false,
    public_release: false,
  },
  blockers: [
    'นิยามเดือนที่ส่งออกข้อมูลและรอบการปลูก (month/planting_round) ยังไม่ชัดเจน',
    'การจับคู่ชื่อตาม snapshot ของ DOPA ไม่ใช่การยืนยันขอบเขตการปกครองย้อนหลัง',
    'ป้ายชื่อพืชยังไม่ระบุเกรด ตลาด และช่วงเวลาขายของราคาระดับประเทศ จึงเชื่อมกับราคาไม่ได้',
    'สิทธิ์การใช้ข้อมูลต้นทางยังรอการยืนยัน',
  ],
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildCropEvidence(
  filters: { provinceCode?: string; crop?: CropEvidenceFilter } = {}
): CropEvidencePayload {
  const requested = typeof filters.provinceCode === 'string' ? filters.provinceCode.trim() : '';
  const provinceCode = isCropEvidenceProvinceCode(requested) ? requested : CROP_EVIDENCE_DEFAULT_PROVINCE;
  const provinceName = PROVINCE_NAME_BY_CODE.get(provinceCode) ?? provinceCode;
  const crop: CropEvidenceFilter =
    filters.crop === 'rice' || filters.crop === 'cassava' || filters.crop === 'corn' ? filters.crop : 'all';

  const provinceRows = CROP_EVIDENCE_ROWS.filter((row) => row.provinceCode === provinceCode);
  const presentCrops = CROP_ORDER.filter((id) => provinceRows.some((row) => row.crop === id));
  const scopedRows = crop === 'all' ? provinceRows : provinceRows.filter((row) => row.crop === crop);
  const cropsInScope = crop === 'all' ? presentCrops : presentCrops.filter((id) => id === crop);

  return {
    schemaVersion: CROP_EVIDENCE_SCHEMA_VERSION,
    sample: CROP_EVIDENCE_SAMPLE_MODE,
    access: 'metadata_only',
    dataAsOf: CROP_EVIDENCE_DATA_AS_OF,
    filters: { provinceCode, provinceName, crop },
    provinces: CROP_EVIDENCE_PROVINCES.map((province) => ({ ...province })),
    crops: presentCrops.map((id) => ({ ...CROP_EVIDENCE_CROPS[id] })),
    districts: [...scopedRows].sort(compareRows),
    cropSummaries: cropsInScope.map((id) => summarizeCropEvidence(scopedRows, id)),
    statusCounts: countStatuses(scopedRows),
    recommendations: buildRecommendations(scopedRows, provinceCode),
    thresholds: { ...DISCREPANCY_THRESHOLDS },
    methodNotes: [...CROP_EVIDENCE_METHOD_NOTES],
    warnings: [...CROP_EVIDENCE_WARNINGS],
    sources: CROP_EVIDENCE_SOURCES.map((source) => ({ ...source })),
    pythonLineage: {
      ...PYTHON_LINEAGE,
      gates: { ...PYTHON_LINEAGE.gates },
      blockers: [...PYTHON_LINEAGE.blockers],
    },
  };
}
