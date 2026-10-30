import 'server-only';

// ทางอ่านข้อมูลจริง (lane L2) เท่านั้นที่ใช้โมดูลนี้ ตัวสร้าง sample ด้านล่างยัง pure เหมือนเดิม
// ชื่อที่ผู้เรียกใช้ import ต่อ (buildCpdCoopCountsEnvelope, cpdCoopStatusFromQuery, ค่าคงที่ CPD_*)
// ถูกส่งต่อผ่าน `export { ... } from './cpd-coop-counts'` ท้ายไฟล์ จึงไม่ import มาใช้ซ้ำในไฟล์นี้
import {
  loadCpdCoopCountsEnvelope,
  unavailableCpdCoopCountsEnvelope,
  type CpdCoopCountsEnvelope,
  type CpdCoopCountsFilters,
} from './cpd-coop-counts';

/**
 * สหกรณ์การเกษตร สหกรณ์นิคม สหกรณ์ประมง สหกรณ์ผู้เลี้ยงโคนม และวิสาหกิจชุมชน/เครือข่ายแปลงใหญ่
 * สำหรับหน้า /cooperatives และ /api/v1/cooperatives
 *
 * บทบาทของไฟล์นี้ (lane 1A Data Engine):
 * - เป็นแคตตาล็อกตัวอย่างแบบ deterministic ชุดเดียวที่ page, dashboard และ API route ใช้ร่วมกัน
 *   buildCooperativesData() เป็น synchronous และ pure: เรียกซ้ำด้วยตัวกรองเดิมได้ byte เดียวกัน
 *   (ไม่ใช้ clock, ไม่ใช้ entropy, ไม่อ่าน filesystem, ไม่เรียก network, ไม่แคชค่าที่ขึ้นกับ request)
 * - ตัวสร้าง sample ในไฟล์นี้ self-contained: import เพียง 'server-only' แล้วมีทะเบียนจังหวัด 77 รายการเป็น own copy
 *   (รหัส/ชื่อ/ภาค ลอกจาก lib/hub/logistics-data.ts ซึ่งล้อกับ EMBEDDED_PROVINCES_CSV ของ
 *   lib/provinces.ts อีกทอด) เพราะ builder ต้อง sync จึงเรียก getProvinces() (async) ไม่ได้
 * - import ที่สอง (./cpd-coop-counts) ใช้เฉพาะ "ทางอ่านข้อมูลจริง" ท้ายไฟล์ (lane L2)
 *   ตัวสร้าง sample ยัง synchronous และ pure เหมือนเดิม ไม่เรียกคลังผ่านเส้นทางนั้น
 *
 * กติกาความซื่อสัตย์ของข้อมูล (AGENTS.md ข้อ 3-4):
 * 1) สิทธิ์เผยแพร่ตัวเลขดิบของ CPD (กรมส่งเสริมสหกรณ์) และ CAD (กรมตรวจบัญชีสหกรณ์) ยัง pending
 *    ทุกตัวเลขจึงเป็นค่าจำลองที่ seed ด้วย FNV-1a + mulberry32 จาก id ของรายการ ห้าม Math.random()
 *    และ Date.now() ในเส้นทางที่สร้างตัวเลขรวมทั้ง generatedAt/dataAsOf ที่เป็นค่าคงที่
 * 2) ไม่แต่งเลขทะเบียนของจริง: registrationNo ขึ้นต้น "(ตัวอย่าง)" ทุกบรรทัด และ
 *    registrationNoStatus = 'sample_placeholder' ชื่อสหกรณ์ทุกชื่อเป็นนามสมมติต่อท้าย
 *    "(ข้อมูลตัวอย่าง)" ไม่มีสหกรณ์/กลุ่มชนที่มีนิติบุคคลจริงถูกเอ่ยอ้าง
 * 3) คะแนน CAMELS เป็น "ผลลัพธ์จากโมเดลสาธิตของแพลตฟอร์ม" ไม่ใช่การจัดชั้นที่กรมส่งเสริมสหกรณ์ประกาศ
 *    และไม่ใช่ผลตรวจสอบบัญชีของกรมตรวจบัญชีสหกรณ์ จึงบังคับ evidenceStatus = 'not_verified' ทุกบรรทัด
 * 4) missing = null เสมอ ห้ามใส่ 0 แทนค่าที่ไม่รายงาน เส้นสินค้าที่ไม่สอดคล้องกับจังหวัด/ประเภทนั้น
 *    เป็น null ทั้งชุด (volume/price/value) เพราะไม่มีนิยามกับสหกรณ์ประมงและสหกรณ์โคนม
 * 5) ไม่บวก subtotal ซ้ำ: มูลค่าธุรกิจรายรายการ = มูลค่ารวบรวม + จัดหาปัจจัย + เงินทุนหมุนเวียน
 *    และตัวเลขระดับประเทศทุกตัวเป็นผลบวกของรายการเท่านั้น (ไม่มี national total แบบ hard-code)
 * 6) รหัสจังหวัด 77 รายการเป็น "ทะเบียนรหัสจังหวัด" ไม่ใช่ข้อสรุปว่ามีสหกรณ์ครบทุกจังหวัด
 *    payload จึงบังคับ coverageClaim: false พร้อม coverageNote และ warnings ภาษาไทย
 *
 * มาตราส่วนคะแนน CAMELS (สำคัญต่อการอ่านเรดาร์):
 * - ทั้ง 6 มิติใช้ "มาตราส่วนความแข็งแรง 0-100 ยิ่งสูงยิ่งดี" เหมือนกันหมด รวมทั้ง Sensitivity
 *   ซึ่งคำนวณจาก "ความสามารถในการรับมือความเสี่ยงจากรายได้/ราคา" (ไม่ใช่ระดับความเสี่ยงดิบ)
 *   ถ้าสลับแกนนี้ให้เป็นระดับความเสี่ยง เรดาร์จะแปลผิดทั้งหน้า
 * - composite = ค่าเฉลี่ย 6 มิติปัดเศษทศนิยม 1 ตำแหน่ง และชั้น CAMELS กำหนดจาก composite เท่านั้น
 *   (>= 80 ชั้น 1, >= 65 ชั้น 2, ที่เหลือชั้น 3) ไม่มีการ override รายรายการ
 *
 * เหตุผลที่ใช้ profile แยกตามประเภทสหกรณ์:
 * สหกรณ์แต่ละแบบมีโครงสร้างเงินทุนและฐานรายได้ต่างกัน (โคนมมีรายได้รายวันค่อนข้างเสถียร, ประมง
 * ขึ้นกับฤดูกาลและราคาน้ำมัน, นิคมผูกกับที่ดินและพืชเชิงเดี่ยว) จึงตั้ง center/spread ของคะแนน
 * ต่อประเภท เพื่อให้สัดส่วนชั้นทั้งแคตตาล็อกอยู่ในช่วง 15-35% / 35-55% / ที่เหลือ ไม่ใช่ noise
 * ที่กระจายเท่ากันทุกชั้น ซึ่งจะทำให้/dashboard แสดงชั้นแบบ uniform ที่ไม่สมจริง
 *
 * รายการ "โซน" ในไฟล์นี้ (นิคม / ชายฝั่ง / โคนม) เป็นแบบจำลองของชุดตัวอย่าง:
 * - ชุดจังหวัดชายฝั่ง reuse จาก COASTAL_PROVINCE_CODES ของ lib/hub/food-safety-data.ts (บรรทัด ~249)
 *   เพื่อให้ module กลุ่มประมง/สัตว์น้ำใน hub ใช้ขอบเขตชายฝั่งชุดเดียวกัน
 * - ชุดนิคมและชุดโคนมประกาศไว้ที่ไฟล์นี้เอง เพราะ repository นี้ยังไม่มีตารางเขตนิคมสหกรณ์/เขต
 *   เลี้ยงโคนมที่ตรวจสิทธิ์แล้ว มันคือ "สมมติฐานการวางโมเดลของชุดตัวอย่างนี้" ไม่ใช่การ zoning ทางการ
 */

/* ------------------------------------------------------------------ */
/* สัญญาข้อมูล (shared contract ของ lane 1A)                             */
/* ------------------------------------------------------------------ */

export const COOP_SAMPLE_MODE: boolean = true;
export const COOP_DATASET_VERSION = 'coop-cad-v1';
export const COOP_GENERATED_AT = '2026-10-25T00:00:00Z';
export const COOP_DATA_AS_OF = '2026-10-25';

/** ปีพุทธศักราชที่โมเดลใช้ประเมิน (ค่าคงที่ ห้ามอ่านจาก clock) */
const COOP_ASSESSED_YEAR_BE = 2568;

export type CoopType = 'general_agri' | 'settlement' | 'fishery' | 'dairy' | 'community_enterprise';
export type CoopCommodity = 'paddy' | 'rubber' | 'oil_palm' | 'feed_corn';
export type CamelClass = 'tier1' | 'tier2' | 'tier3';
export type CamelDimension = 'capital' | 'asset_quality' | 'management' | 'earnings' | 'liquidity' | 'sensitivity';

export interface CoopProvince {
  code: string;
  name: string;
  region: string;
}

export interface CamelDimensionScore {
  id: CamelDimension;
  label: string;
  labelEn: string;
  /** คะแนนความแข็งแรง 0-100 ทศนิยม 1 ตำแหน่ง ยิ่งสูงยิ่งดีทุกมิติ รวมทั้ง sensitivity */
  score: number;
  note: string;
}

export interface CamelAssessment {
  dimensions: CamelDimensionScore[];
  composite: number;
  camelClass: CamelClass;
  classLabel: string;
  assessedYear: number;
}

export interface CoopCollectionLine {
  commodity: CoopCommodity;
  label: string;
  unit: 'ตัน';
  volumeTons: number | null;
  avgPricePerTonTHB: number | null;
  valueTHB: number | null;
}

export interface CooperativeRecord {
  id: string;
  name: string;
  registrationNo: string;
  registrationNoStatus: 'sample_placeholder';
  type: CoopType;
  typeLabel: string;
  provinceCode: string;
  provinceName: string;
  region: string;
  memberCount: number;
  camel: CamelAssessment;
  collection: CoopCollectionLine[];
  collectionTotalTons: number;
  collectionTotalValueTHB: number;
  supplyCreditValueTHB: number;
  workingCapitalTHB: number;
  businessValueTHB: number;
  evidenceStatus: 'not_verified';
  sourceIds: string[];
}

export interface CoopNationalSummary {
  totalCooperatives: number;
  provinceCountWithData: number;
  regionCount: number;
  totalMembers: number;
  totalCollectionTons: number;
  totalCollectionValueTHB: number;
  totalSupplyCreditValueTHB: number;
  totalWorkingCapitalTHB: number;
  totalBusinessValueTHB: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  tier1SharePct: number;
  avgCamelComposite: number;
  coverageClaim: false;
}

export interface CoopProvinceRollup {
  provinceCode: string;
  provinceName: string;
  region: string;
  coopCount: number;
  memberCount: number;
  collectionTons: number;
  collectionValueTHB: number;
  supplyCreditValueTHB: number;
  workingCapitalValueTHB: number;
  businessValueTHB: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

export interface CoopRegionRollup {
  region: string;
  coopCount: number;
  provinceCount: number;
  memberCount: number;
  businessValueTHB: number;
  tier1Count: number;
}

export interface CoopTypeRollup {
  type: CoopType;
  label: string;
  coopCount: number;
  memberCount: number;
  businessValueTHB: number;
  avgCamelComposite: number;
}

export interface CoopClassRollup {
  camelClass: CamelClass;
  label: string;
  coopCount: number;
  memberCount: number;
  avgCamelComposite: number;
}

export interface CoopFilterOptions {
  provinces: CoopProvince[];
  regions: string[];
  types: Array<{ id: CoopType; label: string }>;
  classes: Array<{ id: CamelClass; label: string }>;
  commodities: Array<{ id: CoopCommodity; label: string }>;
}

export interface CoopSourceReference {
  id: string;
  name: string;
  agencyLabel: string;
  role: string;
  sourceUrl: string;
  licenseStatus: string;
}

export interface CooperativesPayload {
  sample: true;
  datasetVersion: string;
  generatedAt: string;
  dataAsOf: string;
  access: 'metadata_only';
  summary: CoopNationalSummary;
  filteredSummary: CoopNationalSummary;
  cooperatives: CooperativeRecord[];
  byProvince: CoopProvinceRollup[];
  byRegion: CoopRegionRollup[];
  byType: CoopTypeRollup[];
  byClass: CoopClassRollup[];
  filterOptions: CoopFilterOptions;
  sources: CoopSourceReference[];
  warnings: string[];
  coverageNote: string;
}

export interface CooperativesFilters {
  provinceCode?: string;
  coopType?: CoopType;
  camelClass?: CamelClass;
  region?: string;
  q?: string;
}

/* ------------------------------------------------------------------ */
/* ป้ายกำกับ ลำดับแสดงคงที่ และข้อความเป็นหลักกำกับดูแล                   */
/* ------------------------------------------------------------------ */

export const COOP_TYPE_LABELS: Record<CoopType, string> = {
  general_agri: 'สหกรณ์การเกษตรทั่วไป',
  settlement: 'สหกรณ์นิคม',
  fishery: 'สหกรณ์ประมง',
  dairy: 'สหกรณ์ผู้เลี้ยงโคนม',
  community_enterprise: 'วิสาหกิจชุมชน/แปลงใหญ่',
};

export const COOP_CLASS_LABELS: Record<CamelClass, string> = {
  tier1: 'ชั้น 1 (ดีเด่น)',
  tier2: 'ชั้น 2 (ปานกลาง)',
  tier3: 'ชั้น 3 (ต้องปรับปรุง)',
};

export const COOP_COMMODITY_LABELS: Record<CoopCommodity, string> = {
  paddy: 'ข้าวเปลือก',
  rubber: 'ยางพารา',
  oil_palm: 'ปาล์มน้ำมัน',
  feed_corn: 'ข้าวโพดเลี้ยงสัตว์',
};

export const COOP_CAMELS_DIMENSIONS: ReadonlyArray<{
  id: CamelDimension;
  label: string;
  labelEn: string;
  note: string;
}> = [
  {
    id: 'capital',
    label: 'ความมั่นคงของเงินกองทุน',
    labelEn: 'Capital',
    note: 'สัดส่วนเงินกองทุนต่อสินทรัพย์เสี่ยง ยิ่งสูงยิ่งมีเกราะรองรับหนี้เสีย',
  },
  {
    id: 'asset_quality',
    label: 'คุณภาพสินทรัพย์และหนี้ด้อยคุณภาพ',
    labelEn: 'Asset Quality',
    note: 'คะแนนกลับด้านจาก NPL: หนี้ด้อยคุณภาพน้อยได้คะแนนสูง',
  },
  {
    id: 'management',
    label: 'คุณภาพการบริหารจัดการ',
    labelEn: 'Management',
    note: 'ธรรมาภิบาล การประชุมสามัญ และความสามารถของคณะกรรมการตามแบบจำลอง',
  },
  {
    id: 'earnings',
    label: 'ความสามารถส่งคืนประโยชน์ให้สมาชิก',
    labelEn: 'Earnings',
    note: 'กำไรสุทธิและเงินปันผลต่อสมาชิกในเกณฑ์ความแข็งแรง ยิ่งสูงยิ่งดี',
  },
  {
    id: 'liquidity',
    label: 'สภาพคล่อง',
    labelEn: 'Liquidity',
    note: 'สินทรัพย์สภาพคล่องเทียบภาระจ่ายรายเดือนของสหกรณ์',
  },
  {
    id: 'sensitivity',
    label: 'ความสามารถรับมือความเสี่ยงราคา/รายได้',
    labelEn: 'Sensitivity to Market Risk',
    note: 'วัด "ความสามารถรับมือ" ไม่ใช่ระดับความเสี่ยง จึงอ่านร่วมกับแกนอื่นในทิศทางเดียวกับทุกมิติ',
  },
];

/** ลำดับคงที่ที่ UI และ invariant อ้างอิง (ห้ามพึ่ง key order ของ object runtime) */
const COOP_TYPE_ORDER: CoopType[] = ['general_agri', 'settlement', 'fishery', 'dairy', 'community_enterprise'];
const COOP_CLASS_ORDER: CamelClass[] = ['tier1', 'tier2', 'tier3'];
const COOP_COMMODITY_ORDER: CoopCommodity[] = ['paddy', 'rubber', 'oil_palm', 'feed_corn'];
const CAMEL_DIMENSION_ORDER: CamelDimension[] = [
  'capital',
  'asset_quality',
  'management',
  'earnings',
  'liquidity',
  'sensitivity',
];

const COOP_REGION_ORDER: string[] = [
  'ภาคเหนือ',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคกลาง',
  'ภาคตะวันออก',
  'ภาคตะวันตก',
  'ภาคใต้',
];

/**
 * ทะเบียนจังหวัดอ้างอิง 77 รายการ (รหัส + ชื่อ + ภาค 6 กลุ่ม) ชุดเดียวกับ lib/hub/logistics-data.ts
 * และ lib/hub/gi-data.ts การมีชื่อในตารางนี้ "ไม่ใช่" หลักฐานว่าจังหวัดนั้นมีสหกรณ์ที่เข้าถึงข้อมูล
 */
export const COOP_PROVINCES: readonly CoopProvince[] = [
  { code: '10', name: 'กรุงเทพมหานคร', region: 'ภาคกลาง' },
  { code: '11', name: 'สมุทรปราการ', region: 'ภาคกลาง' },
  { code: '12', name: 'นนทบุรี', region: 'ภาคกลาง' },
  { code: '13', name: 'ปทุมธานี', region: 'ภาคกลาง' },
  { code: '14', name: 'พระนครศรีอยุธยา', region: 'ภาคกลาง' },
  { code: '15', name: 'อ่างทอง', region: 'ภาคกลาง' },
  { code: '16', name: 'ลพบุรี', region: 'ภาคกลาง' },
  { code: '17', name: 'สิงห์บุรี', region: 'ภาคกลาง' },
  { code: '18', name: 'ชัยนาท', region: 'ภาคกลาง' },
  { code: '19', name: 'สระบุรี', region: 'ภาคกลาง' },
  { code: '20', name: 'ชลบุรี', region: 'ภาคตะวันออก' },
  { code: '21', name: 'ระยอง', region: 'ภาคตะวันออก' },
  { code: '22', name: 'จันทบุรี', region: 'ภาคตะวันออก' },
  { code: '23', name: 'ตราด', region: 'ภาคตะวันออก' },
  { code: '24', name: 'ฉะเชิงเทรา', region: 'ภาคตะวันออก' },
  { code: '25', name: 'ปราจีนบุรี', region: 'ภาคตะวันออก' },
  { code: '26', name: 'นครนายก', region: 'ภาคตะวันออก' },
  { code: '27', name: 'สระแก้ว', region: 'ภาคตะวันออก' },
  { code: '30', name: 'นครราชสีมา', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '31', name: 'บุรีรัมย์', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '32', name: 'สุรินทร์', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '33', name: 'ศรีสะเกษ', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '34', name: 'อุบลราชธานี', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '35', name: 'ยโสธร', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '36', name: 'ชัยภูมิ', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '37', name: 'อำนาจเจริญ', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '38', name: 'บึงกาฬ', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '39', name: 'หนองบัวลำภู', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '40', name: 'ขอนแก่น', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '41', name: 'อุดรธานี', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '42', name: 'เลย', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '43', name: 'หนองคาย', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '44', name: 'มหาสารคาม', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '45', name: 'ร้อยเอ็ด', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '46', name: 'กาฬสินธุ์', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '47', name: 'สกลนคร', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '48', name: 'นครพนม', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '49', name: 'มุกดาหาร', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ' },
  { code: '51', name: 'ลำพูน', region: 'ภาคเหนือ' },
  { code: '52', name: 'ลำปาง', region: 'ภาคเหนือ' },
  { code: '53', name: 'อุตรดิตถ์', region: 'ภาคเหนือ' },
  { code: '54', name: 'แพร่', region: 'ภาคเหนือ' },
  { code: '55', name: 'น่าน', region: 'ภาคเหนือ' },
  { code: '56', name: 'พะเยา', region: 'ภาคเหนือ' },
  { code: '57', name: 'เชียงราย', region: 'ภาคเหนือ' },
  { code: 58 + '', name: 'แม่ฮ่องสอน', region: 'ภาคเหนือ' },
  { code: '60', name: 'นครสวรรค์', region: 'ภาคเหนือ' },
  { code: '61', name: 'อุทัยธานี', region: 'ภาคเหนือ' },
  { code: '62', name: 'กำแพงเพชร', region: 'ภาคเหนือ' },
  { code: '63', name: 'ตาก', region: 'ภาคเหนือ' },
  { code: '64', name: 'สุโขทัย', region: 'ภาคเหนือ' },
  { code: '65', name: 'พิษณุโลก', region: 'ภาคเหนือ' },
  { code: '66', name: 'พิจิตร', region: 'ภาคเหนือ' },
  { code: '67', name: 'เพชรบูรณ์', region: 'ภาคเหนือ' },
  { code: '70', name: 'ราชบุรี', region: 'ภาคตะวันตก' },
  { code: '71', name: 'กาญจนบุรี', region: 'ภาคตะวันตก' },
  { code: '72', name: 'สุพรรณบุรี', region: 'ภาคตะวันตก' },
  { code: '73', name: 'นครปฐม', region: 'ภาคตะวันตก' },
  { code: '74', name: 'สมุทรสาคร', region: 'ภาคตะวันตก' },
  { code: '75', name: 'สมุทรสงคราม', region: 'ภาคตะวันตก' },
  { code: '76', name: 'เพชรบุรี', region: 'ภาคตะวันตก' },
  { code: '77', name: 'ประจวบคีรีขันธ์', region: 'ภาคตะวันตก' },
  { code: '80', name: 'นครศรีธรรมราช', region: 'ภาคใต้' },
  { code: '81', name: 'กระบี่', region: 'ภาคใต้' },
  { code: '82', name: 'พังงา', region: 'ภาคใต้' },
  { code: '83', name: 'ภูเก็ต', region: 'ภาคใต้' },
  { code: '84', name: 'สุราษฎร์ธานี', region: 'ภาคใต้' },
  { code: '85', name: 'ระนอง', region: 'ภาคใต้' },
  { code: '86', name: 'ชุมพร', region: 'ภาคใต้' },
  { code: '90', name: 'สงขลา', region: 'ภาคใต้' },
  { code: '91', name: 'สตูล', region: 'ภาคใต้' },
  { code: '92', name: 'ตรัง', region: 'ภาคใต้' },
  { code: '93', name: 'พัทลุง', region: 'ภาคใต้' },
  { code: '94', name: 'ปัตตานี', region: 'ภาคใต้' },
  { code: '95', name: 'ยะลา', region: 'ภาคใต้' },
  { code: '96', name: 'นราธิวาส', region: 'ภาคใต้' },
];

const PROVINCE_BY_CODE: Record<string, CoopProvince> = {};
for (let index = 0; index < COOP_PROVINCES.length; index += 1) {
  const province = COOP_PROVINCES[index];
  PROVINCE_BY_CODE[province.code] = province;
}

/* ------------------------------------------------------------------ */
/* ขอบเขต "โซน" ของชุดตัวอย่าง (แบบจำลอง ไม่ใช่ zoning ทางการ)            */
/* ------------------------------------------------------------------ */

/** จังหวัดชายฝั่ง: reuse ขอบเขตเดียวกับ lib/hub/food-safety-data.ts (COASTAL_PROVINCE_CODES) */
const COASTAL_PROVINCE_CODES: ReadonlySet<string> = new Set<string>([
  '11', '20', '21', '22', '23', '24', '74', '75', '76', '77',
  '80', '81', '82', '83', '84', '85', '86', '90', '91', '92', '93', '94', '96',
]);

/** เขตนิคม/สหกรณ์นิคมที่โมเดลสมมติขึ้นสำหรับชุดตัวอย่างนี้เท่านั้น ไม่ใช่บัญชีนิคมของหน่วยงาน */
const SETTLEMENT_PROVINCE_CODES: ReadonlySet<string> = new Set<string>([
  '12', '16', '19', '25', '30', '36', '39', '40', '41', '44', '50', '52',
  '53', '57', '61', '64', '67', '70', '71', '76', '84', '86', '90', '93',
]);

/** เขตเลี้ยงโคนมที่โมเดลสมมติขึ้น (รวมพื้นที่ส่งน้ำนมดิบที่ปรากฏใน logistics-data.ts เช่น วังน้ำเย็น/ปากช่อง) */
const DAIRY_PROVINCE_CODES: ReadonlySet<string> = new Set<string>([
  '16', '19', '21', '25', '26', '30', '36', '40', '44', '50',
  '51', '55', '56', '60', '61', '70', '71', '72', '76', '77',
]);

/** เพดานรายการต่อจังหวัด Keeps payload ที่ 77 จังหวัด × 2-4 รายการ */
const MAX_TYPES_PER_PROVINCE = 4;

/* ------------------------------------------------------------------ */
/* ตัวช่วย deterministic (FNV-1a + mulberry32 แบบเดียวกับ gi-data.ts)     */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: คีย์เดิมต้องได้ค่าเดิมทุกครั้ง (ห้ามใช้ clock หรือ entropy ในเส้นทางของค่า) */
function seedFrom(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function draw(key: string): number {
  return mulberry32(seedFrom(key))();
}

function between(key: string, min: number, max: number): number {
  return min + draw(key) * (max - min);
}

function intBetween(key: string, min: number, max: number): number {
  return min + Math.floor(draw(key) * (max - min + 1));
}

function pickIndex(key: string, length: number): number {
  return Math.min(length - 1, Math.floor(draw(key) * length));
}

function pick<T>(key: string, items: readonly T[]): T {
  return items[pickIndex(key, items.length)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * ปัจจัยคุณภาพร่วมของทั้งรายการ (approximately normal, ช่วง [-1, 1])
 * ทุกรายการอ่านจาก seed ของ id ตัวเองเท่านั้น และมิติทั้ง 6 ใช้ค่านี้ร่วมกัน เพราะสหกรณ์ที่
 * บริหารดีมักดีพร้อมกันหลายมิติ — ถ้าให้แต่ละมิติอิสระ entirely composite จะแกว่งน้อยเกินจริง
 */
function qualityFactor(key: string): number {
  return (draw(`${key}:q1`) + draw(`${key}:q2`) + draw(`${key}:q3`)) / 3 * 2 - 1;
}

/* ------------------------------------------------------------------ */
/* โปรไฟล์ CAMELS รายประเภทสหกรณ์ (center/spread คือการตั้งต้นของโมเดล)    */
/* ------------------------------------------------------------------ */

interface CamelProfile {
  /** คะแนนกลางของ composite */
  center: number;
  /** ครึ่งความกว้างของช่วงเบี่ยงเบนที่ qualityFactor ควบคุม (composite std ≈ spread/3) */
  spread: number;
  /** ค่าเบี่ยงเบนรายมิติภายในประเภท (บวก = มิตินั้นแข็งแรงกว่าค่ากลางของประเภท) */
  dimensionBias: Record<CamelDimension, number>;
  /** ตัวคูณขนาดปริมาณรวบรวม/สินเชื่อต่อจำนวนสมาชิก */
  scaleFactor: number;
  /** ขอบล่าง-บนของจำนวนสมาชิก (contract: สหกรณ์ ~80-4,000, วิสาหกิจชุมชน ~10-250) */
  memberRange: [number, number];
  registrationPrefix: string;
}

const CAMEL_PROFILES: Record<CoopType, CamelProfile> = {
  general_agri: {
    center: 72.5,
    spread: 36,
    dimensionBias: { capital: 1, asset_quality: -2, management: 2, earnings: 0, liquidity: 1, sensitivity: -1 },
    scaleFactor: 1,
    memberRange: [220, 4000],
    registrationPrefix: 'ก',
  },
  settlement: {
    center: 69.5,
    spread: 36,
    dimensionBias: { capital: 2, asset_quality: -4, management: -1, earnings: 1, liquidity: -2, sensitivity: -3 },
    scaleFactor: 0.85,
    memberRange: [150, 2500],
    registrationPrefix: 'น',
  },
  fishery: {
    center: 66.5,
    spread: 38,
    dimensionBias: { capital: -4, asset_quality: -3, management: 0, earnings: -2, liquidity: 2, sensitivity: -5 },
    scaleFactor: 0.55,
    memberRange: [80, 1200],
    registrationPrefix: 'ป',
  },
  dairy: {
    center: 75,
    spread: 33,
    dimensionBias: { capital: 3, asset_quality: 2, management: 3, earnings: 4, liquidity: 2, sensitivity: 1 },
    scaleFactor: 0.7,
    memberRange: [100, 1500],
    registrationPrefix: 'ค',
  },
  community_enterprise: {
    center: 71,
    spread: 36,
    dimensionBias: { capital: -6, asset_quality: 3, management: 1, earnings: -1, liquidity: -4, sensitivity: 2 },
    scaleFactor: 0.12,
    memberRange: [10, 250],
    registrationPrefix: 'ว',
  },
};

/** ข้อความคำอธิบายรายมิติตามช่วงคะแนน (3 = ต้องปรับปรุง, 2 = ปานกลาง, 1 = ดีเด่น) */
const DIMENSION_NOTE_BANDS: Record<CamelDimension, [string, string, string]> = {
  capital: [
    'เงินกองทุนต่อสินทรัพย์เสี่ยงต่ำกว่าแนวปฏิบัติในแบบจำลอง',
    'เงินกองทุนรองรับความเสี่ยงได้ระดับปานกลาง',
    'เงินกองทุนแข็งแรงแหนกว่าค่ากลางของประเภท',
  ],
  asset_quality: [
    'หนี้ด้อยคุณภาพในบัญชีเงินให้กู้สูงตามเกณฑ์โมเดล',
    'คุณภาพลูกหนี้อยู่ในระดับพอใช้ของโมเดล',
    'หนี้ด้อยคุณภาพต่ำ จัดชั้นลูกหนี้รัดกุมในโมเดล',
  ],
  management: [
    'ประเด็น governance ที่โมเดลจำลองยังถ่วงคะแนน',
    'การบริหารผ่านเกณฑ์พื้นฐานของโมเดล',
    'คณะกรรมการและการตรวจสอบภายในแข็งแรงในแบบจำลอง',
  ],
  earnings: [
    'ประโยชน์คืนสู่สมาชิกต่ำกว่าค่ากลางของประเภท',
    'ผลประกอบการระดับปานกลางในแบบจำลอง',
    'ส่งคืนประโยชน์ให้สมาชิกได้สูงกว่าค่ากลางของประเภท',
  ],
  liquidity: [
    'สภาพคล่องตึงตัวเมื่อเทียบกับภาระจ่ายจำลอง',
    'สภาพคล่องรับภาระจ่ายได้ตามระดับปานกลาง',
    'สินทรัพย์สภาพคล่องครอบคลุมภาระจ่ายในแบบจำลอง',
  ],
  sensitivity: [
    'รับมือความผันผวนราคา/รายได้ได้น้อยในสถานการณ์จำลอง',
    'ทนต่อแรงกระแทกราคาปานกลางในสถานการณ์จำลอง',
    'กระจายรายได้และรับความผันผวนได้ดีในสถานการณ์จำลอง',
  ],
};

/* ------------------------------------------------------------------ */
/* ขอบเขต/ช่วงตัวเลขรายสินค้า (หน่วยจริง ห้ามปน grain)                    */
/* ------------------------------------------------------------------ */

/** โอกาสที่สหกรณ์ในภาคนั้น "รวบรวมสินค้านี้จริง" ในแบบจำลอง (ค่าที่เหลือเป็น null ไม่ใช่ 0) */
const REGION_COMMODITY_APPLICABILITY: Record<string, Record<CoopCommodity, number>> = {
  'ภาคกลาง': { paddy: 0.95, rubber: 0.75, oil_palm: 0.65, feed_corn: 0.85 },
  'ภาคตะวันออกเฉียงเหนือ': { paddy: 0.95, rubber: 0.75, oil_palm: 0.6, feed_corn: 0.95 },
  'ภาคเหนือ': { paddy: 0.9, rubber: 0.7, oil_palm: 0.55, feed_corn: 0.9 },
  'ภาคตะวันออก': { paddy: 0.85, rubber: 0.85, oil_palm: 0.85, feed_corn: 0.8 },
  'ภาคตะวันตก': { paddy: 0.9, rubber: 0.8, oil_palm: 0.7, feed_corn: 0.8 },
  'ภาคใต้': { paddy: 0.75, rubber: 0.9, oil_palm: 0.9, feed_corn: 0.7 },
};

const COMMODITY_PRICE_BAND: Record<CoopCommodity, [number, number]> = {
  paddy: [7500, 14500],
  rubber: [38000, 78000],
  oil_palm: [4200, 6800],
  feed_corn: [8500, 13500],
};

/** ช่วงตันต่อสมาชิก (grain: ปริมาณรวบรวรมต่อปีของสหกรณ์) */
const COMMODITY_TONS_PER_MEMBER: Record<CoopCommodity, [number, number]> = {
  paddy: [0.8, 9],
  rubber: [0.05, 0.6],
  oil_palm: [0.4, 4],
  feed_corn: [0.5, 5],
};

/**
 * สหกรณ์โคนม/ประมงไม่ได้รวบรวม 4 สินค้านี้ในนิยามของชุดตัวอย่าง
 * โคนม: เก็บน้ำนมดิบ (คนละหน่วยนับ) จึง เหลือเฉพาะเส้นข้าวโพดเลี้ยงสัตว์ (อาหารสัตว์) บางส่วน
 * ประมง: เก็บสัตว์น้ำทั้งหมด → ทั้ง 4 เส้นเป็น null
 */
const TYPE_COMMODITY_OVERRIDE: Partial<Record<CoopType, Partial<Record<CoopCommodity, number>>>> = {
  dairy: { paddy: 0, rubber: 0, oil_palm: 0, feed_corn: 0.5 },
  fishery: { paddy: 0, rubber: 0, oil_palm: 0, feed_corn: 0 },
};

/** เงินทุน/สินเชื่อต่อสมาชิก (ตั้งให้ clamp อยู่ในช่วง 1,000,000-900,000,000 บาทตาม contract) */
const SUPPLY_CREDIT_PER_MEMBER: [number, number] = [2200, 26000];
const WORKING_CAPITAL_PER_MEMBER: [number, number] = [1200, 15000];
const VALUE_FLOOR_THB = 1_000_000;
const VALUE_CEILING_THB = 900_000_000;

/** คลังคำสำหรับนามสมมติ — ไม่มีชื่อตำบล/อำเภอจริงถูกใส่เป็น fact เพราะ module นี้ไม่มีทะเบียนอำเภอ */
const NAME_HEAD = ['หนอง', 'บาง', 'บ้าน', 'คลอง', 'ห้วย', 'ทุ่ง', 'โพธิ์', 'สระ', 'ท่า', 'ดง', 'กุด', 'ยาง', 'คำ', 'ม่วง', 'ละม้าย'];
const NAME_TAIL = ['สมบูรณ์', 'พัฒนา', 'เจริญ', 'มั่นคง', 'ร่วมใจ', 'สามัคคี', 'บำรุง', 'สุข', 'ไผ่ล้อม', 'ทอง', 'ใหม่', 'พืชผล', 'สหคาม', 'ริมคลอง'];

const SAMPLE_NAME_SUFFIX = '(ข้อมูลตัวอย่าง)';

/* ------------------------------------------------------------------ */
/* ชั้น (class) และ composite — กำหนดจากคะแนน 6 มิติเท่านั้น              */
/* ------------------------------------------------------------------ */

function classFromComposite(composite: number): CamelClass {
  if (composite >= 80) return 'tier1';
  if (composite >= 65) return 'tier2';
  return 'tier3';
}

function bandIndexOfScore(score: number): 0 | 1 | 2 {
  if (score < 65) return 0;
  if (score < 80) return 1;
  return 2;
}

function buildCamelAssessment(recordKey: string, type: CoopType): CamelAssessment {
  const profile = CAMEL_PROFILES[type];
  const factor = qualityFactor(recordKey);
  const dimensions: CamelDimensionScore[] = [];

  for (let index = 0; index < CAMEL_DIMENSION_ORDER.length; index += 1) {
    const id = CAMEL_DIMENSION_ORDER[index];
    const definition = COOP_CAMELS_DIMENSIONS[index];
    const jitterKey = `${recordKey}:camel:${id}`;
    const raw =
      profile.center +
      profile.spread * factor +
      profile.dimensionBias[id] +
      (draw(jitterKey) - 0.5) * 12;
    const score = round(clamp(raw, 5, 98), 1);
    dimensions.push({
      id,
      label: definition.label,
      labelEn: definition.labelEn,
      score,
      note: DIMENSION_NOTE_BANDS[id][bandIndexOfScore(score)],
    });
  }

  let total = 0;
  for (let index = 0; index < dimensions.length; index += 1) total += dimensions[index].score;
  const composite = round(total / dimensions.length, 1);
  const camelClass = classFromComposite(composite);

  return {
    dimensions,
    composite,
    camelClass,
    classLabel: COOP_CLASS_LABELS[camelClass],
    assessedYear: COOP_ASSESSED_YEAR_BE,
  };
}

function buildCollection(recordKey: string, type: CoopType, region: string, memberCount: number): CoopCollectionLine[] {
  const profile = CAMEL_PROFILES[type];
  const regionWeights = REGION_COMMODITY_APPLICABILITY[region] ?? REGION_COMMODITY_APPLICABILITY['ภาคกลาง'];
  const override = TYPE_COMMODITY_OVERRIDE[type];
  const lines: CoopCollectionLine[] = [];

  for (let index = 0; index < COOP_COMMODITY_ORDER.length; index += 1) {
    const commodity = COOP_COMMODITY_ORDER[index];
    const lineKey = `${recordKey}:coll:${commodity}`;
    const overrideChance = override === undefined ? undefined : override[commodity];
    const applicability: number = overrideChance === undefined ? regionWeights[commodity] : overrideChance;
    const applicable = draw(`${lineKey}:applicable`) < applicability;

    if (!applicable) {
      lines.push({ commodity, label: COOP_COMMODITY_LABELS[commodity], unit: 'ตัน', volumeTons: null, avgPricePerTonTHB: null, valueTHB: null });
      continue;
    }

    const [minTons, maxTons] = COMMODITY_TONS_PER_MEMBER[commodity];
    const tonsPerMember = between(`${lineKey}:intensity`, minTons, maxTons);
    const volumeTons = round(memberCount * tonsPerMember * profile.scaleFactor, 1);
    const [minPrice, maxPrice] = COMMODITY_PRICE_BAND[commodity];
    const avgPricePerTonTHB = Math.round(between(`${lineKey}:price`, minPrice, maxPrice));
    lines.push({
      commodity,
      label: COOP_COMMODITY_LABELS[commodity],
      unit: 'ตัน',
      volumeTons,
      avgPricePerTonTHB,
      valueTHB: Math.round(volumeTons * avgPricePerTonTHB),
    });
  }

  return lines;
}

function typesForProvince(province: CoopProvince): CoopType[] {
  const list: CoopType[] = ['general_agri'];
  if (SETTLEMENT_PROVINCE_CODES.has(province.code)) list.push('settlement');
  if (COASTAL_PROVINCE_CODES.has(province.code)) list.push('fishery');
  if (DAIRY_PROVINCE_CODES.has(province.code)) list.push('dairy');
  list.push('community_enterprise');

  if (list.length <= MAX_TYPES_PER_PROVINCE) return list;
  // เพดาน 4 รายการ/จังหวัด: two base types ต้องอยู่รอด และตัดโซนตัวท้ายทิ้ง (ตัดสินด้วยตาราง ไม่ใช่ entropy)
  return [list[0], list[1], list[2], list[list.length - 1]];
}

function padTwo(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function buildCooperativeRecord(province: CoopProvince, type: CoopType, sequence: number): CooperativeRecord {
  const profile = CAMEL_PROFILES[type];
  const id = `coop-${province.code}-${padTwo(sequence)}`;
  const memberCount = intBetween(`${id}:members`, profile.memberRange[0], profile.memberRange[1]);

  const head = pick(`${id}:name:head`, NAME_HEAD);
  const tail = pick(`${id}:name:tail`, NAME_TAIL);
  const branch = draw(`${id}:name:branch`) < 0.3 ? ` แห่งที่ ${intBetween(`${id}:name:branchNo`, 2, 4)}` : '';
  const name = `${prefixForType(type)}${head}${tail}${branch} ${SAMPLE_NAME_SUFFIX}`;

  const camel = buildCamelAssessment(id, type);
  const collection = buildCollection(id, type, province.region, memberCount);

  let tonsTotal = 0;
  let valueTotal = 0;
  for (let index = 0; index < collection.length; index += 1) {
    const line = collection[index];
    if (line.volumeTons !== null) tonsTotal += line.volumeTons;
    if (line.valueTHB !== null) valueTotal += line.valueTHB;
  }
  const collectionTotalTons = round(tonsTotal, 1);
  const collectionTotalValueTHB = Math.round(valueTotal);

  const supplyCreditValueTHB = Math.round(
    clamp(memberCount * between(`${id}:credit`, SUPPLY_CREDIT_PER_MEMBER[0], SUPPLY_CREDIT_PER_MEMBER[1]), VALUE_FLOOR_THB, VALUE_CEILING_THB),
  );
  const workingCapitalTHB = Math.round(
    clamp(memberCount * between(`${id}:capital`, WORKING_CAPITAL_PER_MEMBER[0], WORKING_CAPITAL_PER_MEMBER[1]), VALUE_FLOOR_THB, VALUE_CEILING_THB),
  );

  const sourceRoll = draw(`${id}:sources`);
  const sourceIds = sourceRoll < 0.18 ? ['cpd'] : sourceRoll < 0.34 ? ['cad'] : ['cpd', 'cad'];

  return {
    id,
    name,
    registrationNo: `(ตัวอย่าง) ${profile.registrationPrefix}-${province.code}${padTwo(sequence)}-${intBetween(`${id}:reg`, 1000, 9999)}`,
    registrationNoStatus: 'sample_placeholder',
    type,
    typeLabel: COOP_TYPE_LABELS[type],
    provinceCode: province.code,
    provinceName: province.name,
    region: province.region,
    memberCount,
    camel,
    collection,
    collectionTotalTons,
    collectionTotalValueTHB,
    supplyCreditValueTHB,
    workingCapitalTHB,
    businessValueTHB: collectionTotalValueTHB + supplyCreditValueTHB + workingCapitalTHB,
    evidenceStatus: 'not_verified',
    sourceIds,
  };
}

function prefixForType(type: CoopType): string {
  switch (type) {
    case 'general_agri':
      return 'สหกรณ์การเกษตร';
    case 'settlement':
      return 'สหกรณ์นิคม';
    case 'fishery':
      return 'สหกรณ์ประมง';
    case 'dairy':
      return 'สหกรณ์โคนม';
    case 'community_enterprise':
      return 'วิสาหกิจชุมชน';
    default:
      return 'สหกรณ์';
  }
}

/* ------------------------------------------------------------------ */
/* แคตตาล็อกเต็ม (สร้างครั้งเดียว memoized เพราะ pure)                     */
/* ------------------------------------------------------------------ */

let catalogueCache: CooperativeRecord[] | null = null;

function buildCatalogue(): CooperativeRecord[] {
  if (catalogueCache !== null) return catalogueCache;

  const rows: CooperativeRecord[] = [];
  for (let provinceIndex = 0; provinceIndex < COOP_PROVINCES.length; provinceIndex += 1) {
    const province = COOP_PROVINCES[provinceIndex];
    const types = typesForProvince(province);
    for (let typeIndex = 0; typeIndex < types.length; typeIndex += 1) {
      rows.push(buildCooperativeRecord(province, types[typeIndex], typeIndex + 1));
    }
  }

  rows.sort((left, right) => {
    const byCode = left.provinceCode < right.provinceCode ? -1 : left.provinceCode > right.provinceCode ? 1 : 0;
    if (byCode !== 0) return byCode;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });

  assertCatalogueShape(rows);
  catalogueCache = rows;
  return rows;
}

/** ตรวจ "รูปแบบแคตตาล็อก" (ทำเฉพาะบนชุดเต็มก่อน memoize ไม่ใช่บนชุดที่กรอง) */
function assertCatalogueShape(rows: CooperativeRecord[]): void {
  if (rows.length < 180 || rows.length > 240) {
    throw new Error(`ชุดตัวอย่างสหกรณ์หลุดช่วง 180-240 รายการ (ได้ ${rows.length})`);
  }

  const perProvince: Record<string, number> = {};
  const perType: Record<string, number> = {};
  let lineCount = 0;
  let nullLineCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    perProvince[row.provinceCode] = (perProvince[row.provinceCode] ?? 0) + 1;
    perType[row.type] = (perType[row.type] ?? 0) + 1;
    for (let lineIndex = 0; lineIndex < row.collection.length; lineIndex += 1) {
      lineCount += 1;
      if (row.collection[lineIndex].volumeTons === null) nullLineCount += 1;
    }
  }

  for (let index = 0; index < COOP_PROVINCES.length; index += 1) {
    const code = COOP_PROVINCES[index].code;
    const count = perProvince[code] ?? 0;
    if (count < 2) throw new Error(`จังหวัดรหัส ${code} มีรายการตัวอย่างน้อยกว่า 2 (${count})`);
    if (count > MAX_TYPES_PER_PROVINCE) throw new Error(`จังหวัดรหัส ${code} มีรายการเกิน ${MAX_TYPES_PER_PROVINCE} รายการ`);
  }

  for (let index = 0; index < COOP_TYPE_ORDER.length; index += 1) {
    const type = COOP_TYPE_ORDER[index];
    if ((perType[type] ?? 0) < 5) throw new Error(`ประเภท ${COOP_TYPE_LABELS[type]} มีตัวอย่างน้อยกว่า 5 รายการ`);
  }

  const generalCount = rows.filter((row) => row.type === 'general_agri').length;
  const communityCount = rows.filter((row) => row.type === 'community_enterprise').length;
  if (generalCount < COOP_PROVINCES.length || communityCount < COOP_PROVINCES.length) {
    throw new Error('ทุกจังหวัดต้องมีทั้งสหกรณ์การเกษตรทั่วไปและวิสาหกิจชุมชน/แปลงใหญ่เป็นฐาน');
  }

  const nullShare = lineCount === 0 ? 0 : nullLineCount / lineCount;
  if (nullShare < 0.15) {
    throw new Error(`สัดส่วนเส้นสินค้าที่ไม่มีข้อมูลต่ำกว่า 15% (${round(nullShare * 100, 1)}%) UI จะไม่เห็นค่า null จริง`);
  }

  let tier1 = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].camel.camelClass === 'tier1') tier1 += 1;
  }
  const tier1Pct = (tier1 / rows.length) * 100;
  if (tier1Pct < 15 || tier1Pct > 35) {
    throw new Error(`สัดส่วนชั้น 1 ของแคตตาล็อกอยู่ที่ ${round(tier1Pct, 1)}% หลุดช่วง 15-35% ของ profile รายประเภท`);
  }
}

/* ------------------------------------------------------------------ */
/* สรุปตัวเลข / rollup (ทุกตัวเป็นผลบวกของรายการในกลุ่มเท่านั้น)            */
/* ------------------------------------------------------------------ */

function buildSummary(rows: CooperativeRecord[]): CoopNationalSummary {
  let totalMembers = 0;
  let totalCollectionValueTHB = 0;
  let totalSupplyCreditValueTHB = 0;
  let totalWorkingCapitalTHB = 0;
  let totalBusinessValueTHB = 0;
  let tonsRaw = 0;
  let compositeTotal = 0;
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  const provinceSeen: Record<string, true> = {};
  const regionSeen: Record<string, true> = {};

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    totalMembers += row.memberCount;
    totalCollectionValueTHB += row.collectionTotalValueTHB;
    totalSupplyCreditValueTHB += row.supplyCreditValueTHB;
    totalWorkingCapitalTHB += row.workingCapitalTHB;
    totalBusinessValueTHB += row.businessValueTHB;
    tonsRaw += row.collectionTotalTons;
    compositeTotal += row.camel.composite;
    provinceSeen[row.provinceCode] = true;
    regionSeen[row.region] = true;
    if (row.camel.camelClass === 'tier1') tier1Count += 1;
    else if (row.camel.camelClass === 'tier2') tier2Count += 1;
    else tier3Count += 1;
  }

  // ค่าเฉลี่ยของเซตว่างให้ 0 (ไม่ใช่ null) เพราะ contract ประกาศเป็น number และ UI แสดง "0" พร้อมข้อความ
  // กำกับว่าไม่มีรายการผ่านตัวกรอง — ค่านี้ไม่เคยถูกใช้เป็นสถิติของสหกรณ์รายใด
  return {
    totalCooperatives: rows.length,
    provinceCountWithData: Object.keys(provinceSeen).length,
    regionCount: Object.keys(regionSeen).length,
    totalMembers,
    totalCollectionTons: round(tonsRaw, 1),
    totalCollectionValueTHB,
    totalSupplyCreditValueTHB,
    totalWorkingCapitalTHB,
    totalBusinessValueTHB,
    tier1Count,
    tier2Count,
    tier3Count,
    tier1SharePct: rows.length === 0 ? 0 : round((tier1Count / rows.length) * 100, 1),
    avgCamelComposite: rows.length === 0 ? 0 : round(compositeTotal / rows.length, 1),
    coverageClaim: false,
  };
}

function rollupByProvince(rows: CooperativeRecord[]): CoopProvinceRollup[] {
  const map: Record<string, CoopProvinceRollup> = {};
  const tonsRaw: Record<string, number> = {};

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    let bucket = map[row.provinceCode];
    if (bucket === undefined) {
      bucket = {
        provinceCode: row.provinceCode,
        provinceName: row.provinceName,
        region: row.region,
        coopCount: 0,
        memberCount: 0,
        collectionTons: 0,
        collectionValueTHB: 0,
        supplyCreditValueTHB: 0,
        workingCapitalValueTHB: 0,
        businessValueTHB: 0,
        tier1Count: 0,
        tier2Count: 0,
        tier3Count: 0,
      };
      map[row.provinceCode] = bucket;
      tonsRaw[row.provinceCode] = 0;
    }
    bucket.coopCount += 1;
    bucket.memberCount += row.memberCount;
    tonsRaw[row.provinceCode] += row.collectionTotalTons;
    bucket.collectionValueTHB += row.collectionTotalValueTHB;
    bucket.supplyCreditValueTHB += row.supplyCreditValueTHB;
    bucket.workingCapitalValueTHB += row.workingCapitalTHB;
    bucket.businessValueTHB += row.businessValueTHB;
    if (row.camel.camelClass === 'tier1') bucket.tier1Count += 1;
    else if (row.camel.camelClass === 'tier2') bucket.tier2Count += 1;
    else bucket.tier3Count += 1;
  }

  const codes = Object.keys(map).sort();
  const out: CoopProvinceRollup[] = [];
  for (let index = 0; index < codes.length; index += 1) {
    const bucket = map[codes[index]];
    bucket.collectionTons = round(tonsRaw[codes[index]], 1);
    out.push(bucket);
  }
  return out;
}

function rollupByRegion(rows: CooperativeRecord[]): CoopRegionRollup[] {
  const totals: Record<string, { coopCount: number; memberCount: number; businessValueTHB: number; tier1Count: number; provinces: Record<string, true> }> = {};

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    let bucket = totals[row.region];
    if (bucket === undefined) {
      bucket = { coopCount: 0, memberCount: 0, businessValueTHB: 0, tier1Count: 0, provinces: {} };
      totals[row.region] = bucket;
    }
    bucket.coopCount += 1;
    bucket.memberCount += row.memberCount;
    bucket.businessValueTHB += row.businessValueTHB;
    if (row.camel.camelClass === 'tier1') bucket.tier1Count += 1;
    bucket.provinces[row.provinceCode] = true;
  }

  const out: CoopRegionRollup[] = [];
  for (let index = 0; index < COOP_REGION_ORDER.length; index += 1) {
    const region = COOP_REGION_ORDER[index];
    const bucket = totals[region];
    if (bucket === undefined) continue;
    out.push({
      region,
      coopCount: bucket.coopCount,
      provinceCount: Object.keys(bucket.provinces).length,
      memberCount: bucket.memberCount,
      businessValueTHB: bucket.businessValueTHB,
      tier1Count: bucket.tier1Count,
    });
  }
  return out;
}

/** byType/byClass แสดงครบทุกกลุ่มแม้ชุดที่กรองไม่มีรายการ (UI ต้องไม่วาดแท่งหายเมื่อ filter แคบ) */
function rollupByType(rows: CooperativeRecord[]): CoopTypeRollup[] {
  const out: CoopTypeRollup[] = [];
  for (let typeIndex = 0; typeIndex < COOP_TYPE_ORDER.length; typeIndex += 1) {
    const type = COOP_TYPE_ORDER[typeIndex];
    let coopCount = 0;
    let memberCount = 0;
    let businessValueTHB = 0;
    let compositeTotal = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.type !== type) continue;
      coopCount += 1;
      memberCount += row.memberCount;
      businessValueTHB += row.businessValueTHB;
      compositeTotal += row.camel.composite;
    }
    out.push({
      type,
      label: COOP_TYPE_LABELS[type],
      coopCount,
      memberCount,
      businessValueTHB,
      avgCamelComposite: coopCount === 0 ? 0 : round(compositeTotal / coopCount, 1),
    });
  }
  return out;
}

function rollupByClass(rows: CooperativeRecord[]): CoopClassRollup[] {
  const out: CoopClassRollup[] = [];
  for (let classIndex = 0; classIndex < COOP_CLASS_ORDER.length; classIndex += 1) {
    const camelClass = COOP_CLASS_ORDER[classIndex];
    let coopCount = 0;
    let memberCount = 0;
    let compositeTotal = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.camel.camelClass !== camelClass) continue;
      coopCount += 1;
      memberCount += row.memberCount;
      compositeTotal += row.camel.composite;
    }
    out.push({
      camelClass,
      label: COOP_CLASS_LABELS[camelClass],
      coopCount,
      memberCount,
      avgCamelComposite: coopCount === 0 ? 0 : round(compositeTotal / coopCount, 1),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* แหล่งอ้างอิง คำเตือน และหมายเหตุการครอบคลุม                             */
/* ------------------------------------------------------------------ */

const COOP_CPD_SOURCE_URL = 'https://www.cpd.go.th';
const COOP_CAD_SOURCE_URL = 'https://www.go2cad.go.th';

const COOP_SOURCES: CoopSourceReference[] = [
  {
    id: 'cpd',
    name: 'ทะเบียนสหกรณ์และกลุ่มเกษตรกร กรมส่งเสริมสหกรณ์ (CPD)',
    agencyLabel: 'กรมส่งเสริมสหกรณ์',
    role: 'ทะเบียนนิติบุคคลสหกรณ์/กลุ่มเกษตรกร ประเภทสหกรณ์ การจัดชั้น และการรวบรวมผลผลิต ' +
      '(คนละส่วนกับทรัพยากร "จำนวนสหกรณ์การเกษตร" ที่อนุมัติแล้วและแสดงในส่วนข้อมูลจริง)',
    sourceUrl: COOP_CPD_SOURCE_URL,
    licenseStatus: 'pending (ทะเบียนรายสหกรณ์/การจัดชั้น) · approved_public (ทรัพยากรจำนวนสหกรณ์การเกษตรที่ระบุ resource id)',
  },
  {
    id: 'cad',
    name: 'ระบบบัญชีและตรวจสหกรณ์ กรมตรวจบัญชีสหกรณ์ (CAD)',
    agencyLabel: 'กรมตรวจบัญชีสหกรณ์',
    role: 'งบการเงินสหกรณ์ ผลตรวจสอบบัญชี และรายการที่ feeding เข้ามิติ CAMELS ของโมเดล',
    sourceUrl: COOP_CAD_SOURCE_URL,
    licenseStatus: 'pending',
  },
];

const COOP_COVERAGE_NOTE =
  'ทะเบียนจังหวัด 77 รายการในไฟล์นี้เป็นเพียงรายการรหัสอ้างอิง (register of codes) ไม่ใช่ข้อสรุปว่า ' +
  'กรมส่งเสริมสหกรณ์หรือกรมตรวจบัญชีสหกรณ์มีข้อมูลเผยแพร่ครบทุกจังหวัด และไม่ได้หมายถึง coverage ' +
  'ทุกรหัสจังหวัดถูกสร้างรายการตัวอย่างเพื่อทดสอบหน้าจอเท่านั้น จำนวนสหกรณ์จริงในแต่ละจังหวัดไม่เท่ากัน ' +
  'และไม่ได้สัดส่วนกับจำนวนรหัสในทะเบียนนี้';

const COOP_WARNINGS: string[] = [
  'ข้อมูลทั้งหมดในชุดนี้เป็นข้อมูลตัวอย่างเชิงโครงสร้าง (deterministic simulation) ห้ามอ้างอิงเป็นสถิติทางการของกรมส่งเสริมสหกรณ์หรือกรมตรวจบัญชีสหกรณ์',
  'สิทธิ์เผยแพร่ของทะเบียนรายสหกรณ์/การจัดชั้น (CPD) และข้อมูลบัญชี (CAD) ยังอยู่ระหว่างตรวจสอบ (licenseStatus: pending) ' +
    'API ชุดนี้จึงออกภายใต้ access = metadata_only เท่านั้น ส่วนทรัพยากร "จำนวนสหกรณ์การเกษตร" ของ CPD ที่ระบุ resource id ' +
    'ไว้แน่นอนได้รับอนุมัติให้แสดงตัวเลข และออกคนละ endpoint (/api/v1/cooperatives/cpd-counts)',
  'คะแนน CAMELS ทั้ง 6 มิติและชั้น 1/2/3 เป็นผลลัพธ์จากโมเดลสาธิตของแพลตฟอร์ม ไม่ใช่การจัดชั้นสหกรณ์ที่หน่วยงานประกาศ และไม่ใช่งบผลการตรวจสอบบัญชีของกรมตรวจบัญชีสหกรณ์',
  'ชื่อสหกรณ์และเลขทะเบียนเป็นนามสมมติต่อท้าย "(ข้อมูลตัวอย่าง)" ไม่ได้อ้างถึงนิติบุคคลที่มีอยู่จริง ห้ามใช้เทียบตรวจกับทะเบียนสหกรณ์จริง',
  'ค่าที่ไม่มีข้อมูลรายงานเป็น null และแสดงเป็น "ไม่มีข้อมูล" เสมอ ระบบไม่แปลงค่าขาดข้อมูลเป็น 0 และไม่รวม subtotal ซ้ำ',
  'สหกรณ์ประมงและสหกรณ์โคนมรวบรวมสัตว์น้ำ/น้ำนมดิบซึ่งอยู่คนละหน่วยนับกับ 4 สินค้าในชุดนี้ เส้นสินค้าของกลุ่มนั้นจึงเป็น null เป็นส่วนใหญ่ ไม่ใช่แปลว่าไม่มีการรวบรวม',
  'รายการ "จังหวัดชายฝั่ง/เขตนิคม/เขตโคนม" ในไฟล์นี้เป็นสมมติฐานการวางโมเดลของชุดตัวอย่าง ไม่ใช่การ zoning ทางการ และมีไว้เพื่อทดสอบตัวกรองเท่านั้น',
  'การรวมข้อมูลข้ามจังหวัด ข้ามสินค้า หรือข้ามหน่วยนับ (ตัว/ตัน/บาท) ทำไม่ได้ตาม charter — จำนวนสมาชิกกับปริมาณรวบรวมเป็นคนละ grain กัน',
];

/* ------------------------------------------------------------------ */
/* ตัวกรอง                                                             */
/* ------------------------------------------------------------------ */

function normalizeText(value: string): string {
  return value.normalize('NFC').toLowerCase().trim();
}

function isUnconstrained(value: string | undefined): boolean {
  return value === undefined || value === '' || value === 'all';
}

/** ค่าว่าง/'all' → undefined (ไม่กรอง); ค่าจริง → NFC + trim ตามสัญญาตัวกรอง */
function normalizedFilterValue(value: string | undefined): string | undefined {
  if (isUnconstrained(value)) return undefined;
  return (value as string).normalize('NFC').trim();
}

function applyFilters(rows: CooperativeRecord[], filters: CooperativesFilters | undefined): CooperativeRecord[] {
  if (filters === undefined) return rows;

  const provinceCode = normalizedFilterValue(filters.provinceCode);
  const region = normalizedFilterValue(filters.region);
  const coopType = filters.coopType;
  const camelClass = filters.camelClass;
  const needle = isUnconstrained(filters.q) ? undefined : normalizeText(filters.q as string);

  return rows.filter((row) => {
    if (provinceCode !== undefined && row.provinceCode !== provinceCode) return false;
    if (region !== undefined && row.region !== region) return false;
    if (coopType !== undefined && row.type !== coopType) return false;
    if (camelClass !== undefined && row.camel.camelClass !== camelClass) return false;
    if (needle !== undefined && needle !== '') {
      const haystack = [row.name, row.provinceName, row.region, row.typeLabel];
      let matched = false;
      for (let index = 0; index < haystack.length; index += 1) {
        if (normalizeText(haystack[index]).includes(needle)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Guard: สัญญาภายในของ payload ต้องไม่แตก (fail closed)                   */
/* ------------------------------------------------------------------ */

function assertCoopInvariants(payload: CooperativesPayload): void {
  const rows = payload.cooperatives;
  const summary = payload.filteredSummary;

  if (payload.sample !== true) throw new Error('payload.cooperatives ต้องประกาศ sample = true เสมอ');
  if (payload.access !== 'metadata_only') throw new Error('สถานะการเข้าถึงต้องเป็น metadata_only ขณะสิทธิ์ยัง pending');
  if (payload.generatedAt !== COOP_GENERATED_AT || payload.dataAsOf !== COOP_DATA_AS_OF) {
    throw new Error('generatedAt/dataAsOf ต้องเป็นค่าคงที่ของชุดข้อมูล ห้ามอ่านจาก clock');
  }
  if (payload.coverageNote.length === 0 || payload.warnings.length === 0) {
    throw new Error('payload ต้องมี coverageNote และ warnings กำกับ coverage เสมอ');
  }

  // invariant 6: id ไม่ซ้ำ, ตรงทะเบียนจังหวัด, ครบ 6 มิติ/4 เส้นสินค้าตามลำดับคงที่
  const seenIds: Record<string, true> = {};
  let membersByRecord = 0;
  let businessByRecord = 0;
  let collectionByRecord = 0;
  let supplyByRecord = 0;
  let workingByRecord = 0;
  let tonsByRecord = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (seenIds[row.id] === true) throw new Error(`พบ id ซ้ำในชุดตัวอย่างสหกรณ์: ${row.id}`);
    seenIds[row.id] = true;

    const province = PROVINCE_BY_CODE[row.provinceCode];
    if (province === undefined) throw new Error(`${row.id} อ้างรหัสจังหวัดที่ไม่อยู่ในทะเบียน 77 รายการ`);
    if (row.provinceName !== province.name || row.region !== province.region) {
      throw new Error(`${row.id} ชื่อจังหวัด/ภาคไม่ตรงกับทะเบียนรหัส`);
    }
    if (row.typeLabel !== COOP_TYPE_LABELS[row.type]) throw new Error(`${row.id} ป้ายประเภทหลุดจาก COOP_TYPE_LABELS`);
    if (row.evidenceStatus !== 'not_verified') throw new Error(`${row.id} ต้องคงสถานะหลักฐาน not_verified`);
    if (row.registrationNoStatus !== 'sample_placeholder') throw new Error(`${row.id} เลขทะเบียนต้องเป็น sample_placeholder`);
    if (row.registrationNo.indexOf('(ตัวอย่าง)') !== 0) throw new Error(`${row.id} เลขทะเบียนต้องขึ้นต้น "(ตัวอย่าง)"`);
    if (row.name.slice(-SAMPLE_NAME_SUFFIX.length) !== SAMPLE_NAME_SUFFIX) {
      throw new Error(`${row.id} ชื่อสหกรณ์ต้องต่อท้าย "(ข้อมูลตัวอย่าง)" เพื่อกันการเข้าใจว่าเป็นนิติบุคคลจริง`);
    }
    if (row.memberCount < 1 || !Number.isInteger(row.memberCount)) throw new Error(`${row.id} จำนวนสมาชิกต้องเป็นจำนวนเต็ม >= 1`);
    if (row.sourceIds.length === 0) throw new Error(`${row.id} ต้องอ้างอิงแหล่งอย่างน้อยหนึ่งรายการ`);
    for (let sourceIndex = 0; sourceIndex < row.sourceIds.length; sourceIndex += 1) {
      if (row.sourceIds[sourceIndex] !== 'cpd' && row.sourceIds[sourceIndex] !== 'cad') {
        throw new Error(`${row.id} อ้างอิงแหล่งที่ไม่รู้จัก: ${row.sourceIds[sourceIndex]}`);
      }
    }

    // invariant 6: CAMELS ครบ 6 มิติลำดับคงที่ + recompute composite/class (invariant 5)
    if (row.camel.dimensions.length !== CAMEL_DIMENSION_ORDER.length) {
      throw new Error(`${row.id} ต้องมีมิติ CAMELS ${CAMEL_DIMENSION_ORDER.length} มิติ`);
    }
    if (row.camel.assessedYear !== COOP_ASSESSED_YEAR_BE) throw new Error(`${row.id} ปีประเมินต้องเป็นค่าคงที่ พ.ศ. 2568`);
    let dimensionTotal = 0;
    for (let dimensionIndex = 0; dimensionIndex < row.camel.dimensions.length; dimensionIndex += 1) {
      const dimension = row.camel.dimensions[dimensionIndex];
      if (dimension.id !== CAMEL_DIMENSION_ORDER[dimensionIndex]) {
        throw new Error(`${row.id} ลำดับมิติ CAMELS ต้องเป็นคงที่ (capital → sensitivity)`);
      }
      if (dimension.score < 0 || dimension.score > 100) throw new Error(`${row.id} คะแนนมิติ ${dimension.id} หลุดช่วง 0-100`);
      if (round(dimension.score, 1) !== dimension.score) throw new Error(`${row.id} คะแนนมิติ ${dimension.id} ต้องทศนิยม 1 ตำแหน่ง`);
      dimensionTotal += dimension.score;
    }
    const expectedComposite = round(dimensionTotal / row.camel.dimensions.length, 1);
    if (row.camel.composite !== expectedComposite) {
      throw new Error(`${row.id} composite ต้องเท่ากับค่าเฉลี่ย 6 มิติ (คาดว่าจะได้ ${expectedComposite})`);
    }
    const expectedClass = classFromComposite(expectedComposite);
    if (row.camel.camelClass !== expectedClass) throw new Error(`${row.id} ชั้น CAMELS ต้องกำหนดจาก composite เท่านั้น`);
    if (row.camel.classLabel !== COOP_CLASS_LABELS[expectedClass]) throw new Error(`${row.id} ป้ายชั้น CAMELS หลุดจาก COOP_CLASS_LABELS`);

    // invariant 3: เส้นสินค้า 4 เส้นลำดับคงที่ และมูลค่าเส้น = ปริมาณ × ราคา
    if (row.collection.length !== COOP_COMMODITY_ORDER.length) throw new Error(`${row.id} ต้องมีเส้นการรวบรวม 4 เส้น`);
    let recordTons = 0;
    let recordValue = 0;
    for (let lineIndex = 0; lineIndex < row.collection.length; lineIndex += 1) {
      const line = row.collection[lineIndex];
      if (line.commodity !== COOP_COMMODITY_ORDER[lineIndex]) throw new Error(`${row.id} ลำดับเส้นสินค้าต้องเป็น paddy → feed_corn`);
      if (line.label !== COOP_COMMODITY_LABELS[line.commodity]) throw new Error(`${row.id} ป้ายสินค้า ${line.commodity} หลุดจาก contract`);
      if (line.unit !== 'ตัน') throw new Error(`${row.id} หน่วยการรวบรวมต้องเป็น "ตัน" เท่านั้น`);

      const missingPair = line.volumeTons === null && line.avgPricePerTonTHB === null && line.valueTHB === null;
      if (missingPair) continue;
      if (line.volumeTons === null || line.avgPricePerTonTHB === null || line.valueTHB === null) {
        throw new Error(`${row.id} เส้น ${line.commodity} ต้องเป็น null ทั้งชุด หรือมีค่าครบทั้งปริมาณ/ราคา/มูลค่า (missing ห้ามเป็น 0)`);
      }
      const expectedLineValue = Math.round(line.volumeTons * line.avgPricePerTonTHB);
      if (line.valueTHB !== expectedLineValue) {
        throw new Error(`${row.id} เส้น ${line.commodity} มูลค่าต้องเท่ากับ ปริมาณ × ราคา (คาด ${expectedLineValue})`);
      }
      if (!Number.isInteger(line.avgPricePerTonTHB)) throw new Error(`${row.id} ราคาต่อตันต้องเป็นจำนวนเต็มบาท`);
      recordTons += line.volumeTons;
      recordValue += line.valueTHB;
    }
    if (row.collectionTotalValueTHB !== Math.round(recordValue)) throw new Error(`${row.id} มูลค่ารวบรวมรวมต้องเป็นผลบวกของเส้นสินค้าเท่านั้น`);
    if (row.collectionTotalTons !== round(recordTons, 1)) throw new Error(`${row.id} ปริมาณรวบรวมรวมต้องเป็นผลบวกของเส้นที่มีข้อมูล`);
    if (row.businessValueTHB !== row.collectionTotalValueTHB + row.supplyCreditValueTHB + row.workingCapitalTHB) {
      throw new Error(`${row.id} มูลค่าธุรกิจต้อง = รวบรวม + จัดหาปัจจัย + เงินทุนหมุนเวียน (ห้ามบวก subtotal ซ้ำ)`);
    }
    if (row.supplyCreditValueTHB < VALUE_FLOOR_THB || row.supplyCreditValueTHB > VALUE_CEILING_THB) {
      throw new Error(`${row.id} มูลค่าจัดหาปัจจัยการผลิตหลุดช่วง 1-900 ล้านบาทของชุดตัวอย่าง`);
    }
    if (row.workingCapitalTHB < VALUE_FLOOR_THB || row.workingCapitalTHB > VALUE_CEILING_THB) {
      throw new Error(`${row.id} เงินทุนหมุนเวียนหลุดช่วง 1-900 ล้านบาทของชุดตัวอย่าง`);
    }

    membersByRecord += row.memberCount;
    businessByRecord += row.businessValueTHB;
    collectionByRecord += row.collectionTotalValueTHB;
    supplyByRecord += row.supplyCreditValueTHB;
    workingByRecord += row.workingCapitalTHB;
    tonsByRecord += row.collectionTotalTons;
  }

  // invariant 5: ชั้นทั้งสามรวมกันต้องเท่ากับจำนวนรายการของทั้งสอง summary
  for (const summaryRow of [payload.summary, summary]) {
    if (summaryRow.coverageClaim !== false) throw new Error('summary ต้องประกาศ coverageClaim: false เสมอ');
    if (summaryRow.tier1Count + summaryRow.tier2Count + summaryRow.tier3Count !== summaryRow.totalCooperatives) {
      throw new Error('จำนวนชั้น 1+2+3 ต้องเท่ากับ totalCooperatives');
    }
  }
  if (summary.totalCooperatives !== rows.length) throw new Error('filteredSummary นับจำนวนไม่ตรงกับรายการที่ส่งออก');
  if (payload.summary.totalCooperatives < payload.filteredSummary.totalCooperatives) {
    throw new Error('summary ภาพรวมต้องมีจำนวนรายการไม่น้อยกว่าชุดที่กรอง (ห้ามให้ summary กลายเป็นผลของ filter)');
  }
  // payload.summary ต้องเป็นภาพรวมของแคตตาล็อกเต็ม (cache แล้ว) เสมอ ไม่ใช่ผลจากตัวกรอง
  const fullCatalogue = buildCatalogue();
  if (payload.summary.totalCooperatives !== fullCatalogue.length) {
    throw new Error('summary ภาพรวมต้องนับจากแคตตาล็อกเต็ม ไม่ใช่ชุดที่กรอง');
  }
  let membersByFullCatalogue = 0;
  for (let index = 0; index < fullCatalogue.length; index += 1) membersByFullCatalogue += fullCatalogue[index].memberCount;
  if (membersByFullCatalogue !== payload.summary.totalMembers) {
    throw new Error('summary ภาพรวมต้องคำนวณจากแคตตาล็อกเต็ม ไม่ใช่ชุดที่กรอง');
  }

  // invariant 1: Σ memberCount จากสามมุมมอง rollup ต้องเท่ากับ filteredSummary.totalMembers
  let membersByType = 0;
  for (let index = 0; index < payload.byType.length; index += 1) membersByType += payload.byType[index].memberCount;
  let membersByClass = 0;
  for (let index = 0; index < payload.byClass.length; index += 1) membersByClass += payload.byClass[index].memberCount;
  let membersByProvince = 0;
  let businessByProvince = 0;
  let tonsByProvince = 0;
  let tierByProvince = 0;
  for (let index = 0; index < payload.byProvince.length; index += 1) {
    const row = payload.byProvince[index];
    membersByProvince += row.memberCount;
    businessByProvince += row.businessValueTHB;
    tonsByProvince += row.collectionTons;
    tierByProvince += row.tier1Count + row.tier2Count + row.tier3Count;
  }
  if (membersByType !== summary.totalMembers) throw new Error('ผลรวมสมาชิกตามประเภทไม่ตรงกับ filteredSummary.totalMembers');
  if (membersByClass !== summary.totalMembers) throw new Error('ผลรวมสมาชิกตามชั้น CAMELS ไม่ตรงกับ filteredSummary.totalMembers');
  if (membersByProvince !== summary.totalMembers) throw new Error('ผลรวมสมาชิกรายจังหวัดไม่ตรงกับ filteredSummary.totalMembers');
  if (membersByRecord !== summary.totalMembers) throw new Error('ผลรวมสมาชิกจากรายการไม่ตรงกับ filteredSummary.totalMembers');
  if (tierByProvince !== summary.totalCooperatives) throw new Error('ผลรวมชั้นรายจังหวัดต้องเท่ากับจำนวนรายการที่กรอง');

  // invariant 2/4: ตัวเลขระดับประเทศต้องเป็นผลบวกของรายการ ไม่มีค่า hard-code
  if (businessByRecord !== summary.totalBusinessValueTHB) throw new Error('มูลค่าธุรกิจรวมต้องเป็นผลบวกของรายการที่กรองเท่านั้น');
  if (businessByProvince !== summary.totalBusinessValueTHB) throw new Error('มูลค่าธุรกิจรายจังหวัดเมื่อรวมกันต้องตรงกับ filteredSummary');
  if (collectionByRecord !== summary.totalCollectionValueTHB) throw new Error('มูลค่ารวบรวมรวมต้องเป็นผลบวกของเส้นสินค้า');
  if (supplyByRecord !== summary.totalSupplyCreditValueTHB) throw new Error('มูลค่าจัดหาปัจจัยรวมต้องเป็นผลบวกของรายการ');
  if (workingByRecord !== summary.totalWorkingCapitalTHB) throw new Error('เงินทุนหมุนเวียนรวมต้องเป็นผลบวกของรายการ');
  if (summary.totalBusinessValueTHB !== summary.totalCollectionValueTHB + summary.totalSupplyCreditValueTHB + summary.totalWorkingCapitalTHB) {
    throw new Error('มูลค่าธุรกิจระดับประเทศต้อง = รวบรวม + จัดหาปัจจัย + เงินทุนหมุนเวียน');
  }
  if (summary.totalCollectionTons !== round(tonsByRecord, 1)) throw new Error('ปริมาณรวบรวมรวมต้องตรงกับผลบวกทศนิยม 1 ตำแหน่งของรายการ');
  if (round(tonsByProvince, 1) !== summary.totalCollectionTons) throw new Error('ปริมาณรวมรายจังหวัดเมื่อปัดเศษต้องตรงกับ filteredSummary');

  // ลำดับ deterministic ของ payload.cooperatives: provinceCode แล้วตามด้วย id
  for (let index = 1; index < rows.length; index += 1) {
    const left = rows[index - 1];
    const right = rows[index];
    if (left.provinceCode > right.provinceCode || (left.provinceCode === right.provinceCode && left.id >= right.id)) {
      throw new Error('รายการสหกรณ์ต้องเรียงตาม provinceCode แล้ว id อย่าง deterministic');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public builder                                                       */
/* ------------------------------------------------------------------ */

export function buildCooperativesData(filters?: CooperativesFilters): CooperativesPayload {
  const catalogue = buildCatalogue();
  const filtered = applyFilters(catalogue, filters);

  const provinces: CoopProvince[] = [];
  for (let index = 0; index < COOP_PROVINCES.length; index += 1) {
    const province = COOP_PROVINCES[index];
    provinces.push({ code: province.code, name: province.name, region: province.region });
  }

  const payload: CooperativesPayload = {
    sample: true,
    datasetVersion: COOP_DATASET_VERSION,
    generatedAt: COOP_GENERATED_AT,
    dataAsOf: COOP_DATA_AS_OF,
    access: 'metadata_only',
    summary: buildSummary(catalogue),
    filteredSummary: buildSummary(filtered),
    cooperatives: filtered,
    byProvince: rollupByProvince(filtered),
    byRegion: rollupByRegion(filtered),
    byType: rollupByType(filtered),
    byClass: rollupByClass(filtered),
    filterOptions: {
      provinces,
      regions: COOP_REGION_ORDER.slice(),
      types: COOP_TYPE_ORDER.map((type) => ({ id: type, label: COOP_TYPE_LABELS[type] })),
      classes: COOP_CLASS_ORDER.map((camelClass) => ({ id: camelClass, label: COOP_CLASS_LABELS[camelClass] })),
      commodities: COOP_COMMODITY_ORDER.map((commodity) => ({ id: commodity, label: COOP_COMMODITY_LABELS[commodity] })),
    },
    sources: COOP_SOURCES.map((source) => ({
      id: source.id,
      name: source.name,
      agencyLabel: source.agencyLabel,
      role: source.role,
      sourceUrl: source.sourceUrl,
      licenseStatus: source.licenseStatus,
    })),
    warnings: COOP_WARNINGS.slice(),
    coverageNote: COOP_COVERAGE_NOTE,
  };

  assertCoopInvariants(payload);
  return payload;
}

/* ------------------------------------------------------------------ */
/* ตัวแปลงค่า query (API route เรียกใช้)                                  */
/* ------------------------------------------------------------------ */

const COOP_TYPE_BY_QUERY: Record<string, CoopType> = {
  general_agri: 'general_agri',
  general: 'general_agri',
  agricultural: 'general_agri',
  agriculture: 'general_agri',
  farming: 'general_agri',
  'สหกรณ์การเกษตร': 'general_agri',
  'สหกรณ์การเกษตรทั่วไป': 'general_agri',
  'สหกรณ์เกษตร': 'general_agri',
  settlement: 'settlement',
  'นิคม': 'settlement',
  'สหกรณ์นิคม': 'settlement',
  'นิคมสหกรณ์': 'settlement',
  fishery: 'fishery',
  fishing: 'fishery',
  fisheries: 'fishery',
  ประมง: 'fishery',
  'สหกรณ์ประมง': 'fishery',
  dairy: 'dairy',
  milk: 'dairy',
  โคนม: 'dairy',
  'เลี้ยงโคนม': 'dairy',
  'สหกรณ์โคนม': 'dairy',
  'สหกรณ์ผู้เลี้ยงโคนม': 'dairy',
  community_enterprise: 'community_enterprise',
  community: 'community_enterprise',
  enterprise: 'community_enterprise',
  วิสาหกิจ: 'community_enterprise',
  'วิสาหกิจชุมชน': 'community_enterprise',
  'วิสาหกิจชุมชน/แปลงใหญ่': 'community_enterprise',
  'แปลงใหญ่': 'community_enterprise',
};

const CAMEL_CLASS_BY_QUERY: Record<string, CamelClass> = {
  tier1: 'tier1',
  'tier 1': 'tier1',
  '1': 'tier1',
  'ชั้น 1': 'tier1',
  'ชั้น1': 'tier1',
  ดีเด่น: 'tier1',
  tier2: 'tier2',
  'tier 2': 'tier2',
  '2': 'tier2',
  'ชั้น 2': 'tier2',
  'ชั้น2': 'tier2',
  ปานกลาง: 'tier2',
  tier3: 'tier3',
  'tier 3': 'tier3',
  '3': 'tier3',
  'ชั้น 3': 'tier3',
  'ชั้น3': 'tier3',
  ต้องปรับปรุง: 'tier3',
};

export function coopTypeFromQuery(raw: string): CoopType | null {
  const key = normalizeText(raw);
  if (key === '' || key === 'all') return null;
  return COOP_TYPE_BY_QUERY[key] ?? null;
}

export function camelClassFromQuery(raw: string): CamelClass | null {
  const key = normalizeText(raw);
  if (key === '' || key === 'all') return null;
  return CAMEL_CLASS_BY_QUERY[key] ?? null;
}

/* ------------------------------------------------------------------ */
/* ทางอ่านข้อมูลจริง (lane L2): จำนวนสหกรณ์การเกษตรจาก CPD ในคลังกลาง        */
/* ------------------------------------------------------------------ */
/**
 * ส่วนนี้เพิ่มเข้ามาเพื่อแสดง "ตัวเลขจริง" ของทรัพยากรที่อนุมัติแล้ว
 * (cpd_agricultural_coop_counts — approved_public ตาม config/resource_licenses.json)
 * โดยไม่แตะสัญญาของตัวสร้าง sample ด้านบนเลย
 *
 * ข้อบังคับที่ต่างจากเส้นทาง sample อย่างจงใจ:
 * - data.sample = false เสมอ และไม่มีเส้นทางที่ดึงค่าจากตัวสร้าง sample มาแทน
 *   เมื่อคลังอ่านไม่สำเร็จหรือยังไม่มีแถว สถานะจะเป็น unavailable / metadata_only / empty
 * - meta.dataAsOf = null เสมอ เพราะป้ายปี (เช่น 2568) มากจากชื่อทรัพยากรต้นทาง
 *   ยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ จึงห้ามแปลงเป็นวันที่
 * - row.unit = null เสมอ (ไฟล์ต้นทางไม่มีคอลัมน์หน่วยนับ) ส่วนคำที่ตัวเขียนบันทึกไว้
 *   ในคลังแสดงแยกเป็น storedUnitLabels พร้อมสถานะ pending_official_confirmation
 * - ไม่มียอดรวมใด ๆ ทั้งสิ้น เพราะการบวกข้ามหน่วยงานสังกัด/สถานะ/ป้ายปีเทียบกันไม่ได้
 * - จำนวนจังหวัดที่อ่านได้ไม่ใช่ข้อสรุปว่าครอบคลุม 77 จังหวัดหรือทั้งประเทศ
 */

export type {
  CpdCoopCountRow,
  CpdCoopCountsData,
  CpdCoopCountsEnvelope,
  CpdCoopCountsFilters,
  CpdCoopProvenance,
  CpdCoopRunSnapshot,
  CpdCoopSourceStatusId,
} from './cpd-coop-counts';

export {
  buildCpdCoopCountsEnvelope,
  CPD_COOP_CATALOG_URL,
  CPD_COOP_DATASET_ID,
  CPD_COOP_RESOURCE_ID,
  CPD_COOP_RESOURCE_KEY,
  CPD_COOP_RESOURCE_URL,
  CPD_COOP_SOURCE_GRAIN,
  CPD_COOP_SOURCE_ID,
  CPD_COOP_SOURCE_STATUSES,
  CPD_COOP_UNIT_STATUS,
  CPD_COOP_YEAR_CONVENTION,
  CPD_COOP_YEAR_LABEL_ORIGIN,
  cpdCoopStatusFromQuery,
  unavailableCpdCoopCountsEnvelope,
} from './cpd-coop-counts';

/** envelope ของส่วนข้อมูลจริง (sample = false) — ชื่อเฉพาะสำหรับใช้ในหน้า/ROUTE ของ lane นี้ */
export type CooperativesRealCountsEnvelope = CpdCoopCountsEnvelope;
export type CooperativesRealCountsFilters = CpdCoopCountsFilters;

const REAL_COUNTS_AVAILABILITIES = ['ready', 'empty', 'metadata_only', 'unavailable'] as const;

/**
 * สัญญาภายในของ "ข้อมูลจริง" ต้องไม่แตก (fail closed เช่นเดียวกับ assertCoopInvariants)
 * ถ้ามีโค้ดใหม่ทำให้ sample ไหลกลับเข้ามาในเส้นทางนี้ ให้ throw ไม่ใช่แสดงค่าต่อ
 */
export function assertCooperativesRealCounts(envelope: CooperativesRealCountsEnvelope): void {
  const { data, meta } = envelope;

  if (data.sample !== false) throw new Error('ส่วนข้อมูลจริงต้องประกาศ sample = false เสมอ');
  if (!(REAL_COUNTS_AVAILABILITIES as readonly string[]).includes(meta.availability)) {
    throw new Error('meta.availability ของส่วนข้อมูลจริงต้องมีค่าตามสัญญาเท่านั้น');
  }
  if (meta.dataAsOf !== null) {
    throw new Error('ห้ามตั้ง dataAsOf จากการตีความป้ายปีต้นทางที่ยังไม่ยืนยันประเภทปี');
  }
  if (data.unit !== null || data.unitStatus !== 'pending_official_confirmation') {
    throw new Error('หน่วยนับของทรัพยากรนี้ยังไม่ยืนยัน ต้องเป็น null พร้อมสถานะ pending เสมอ');
  }
  if (data.derivedTotalsProvided !== false || data.coverageClaim !== false) {
    throw new Error('ส่วนข้อมูลจริงห้ามสรุปยอดรวมและห้ามอ้างการครอบคลุมจากแถวที่อ่านได้');
  }
  if (data.yearLabelOrigin !== 'resource_name' || data.yearConvention !== 'unknown') {
    throw new Error('ที่มาและข้อสมมติของป้ายปีต้องคงตามสัญญาต้นทาง');
  }
  if (data.rows.length !== data.counts.rowCount) {
    throw new Error('counts.rowCount ต้องเท่ากับจำนวนแถวที่ส่งจริงใน payload');
  }
  if (data.counts.rowsWithValue + data.counts.rowsMissing !== data.rows.length) {
    throw new Error('จำนวนแถวที่มีค่าและที่ไม่มีข้อมูลต้องรวมกันเท่ากับจำนวนแถวทั้งหมด');
  }
  if (meta.availability === 'ready' && (data.rows.length === 0 || data.snapshot === null)) {
    throw new Error('สถานะ ready ต้องมีแถวอย่างน้อยหนึ่งแถวและอ้างรอบข้อมูลที่อ่านได้จริง');
  }
  if (meta.availability === 'ready' && meta.access !== 'approved_public') {
    throw new Error('แสดงตัวเลขจริงได้เฉพาะเมื่อคลังบันทึกว่าทรัพยากรนี้อนุมัติแล้ว');
  }
  if ((meta.availability === 'empty' || meta.availability === 'metadata_only' || meta.availability === 'unavailable')
    && data.rows.length !== 0) {
    throw new Error('สถานะว่าง/ไม่อนุมัติ/อ่านไม่ได้ ต้องไม่มีแถวตัวเลขแนบมา');
  }
  for (const row of data.rows) {
    if (row.unit !== null) throw new Error(`${row.rowKey}: แถวข้อมูลจริงห้ามตั้ง unit ที่ยังไม่ยืนยัน`);
    if (row.value === null && row.qualityStatus !== 'missing') {
      throw new Error(`${row.rowKey}: ค่า null ต้องคู่กับ qualityStatus = missing เท่านั้น`);
    }
    if (row.value !== null && row.qualityStatus !== 'good') {
      throw new Error(`${row.rowKey}: ค่าตัวเลขต้องมี qualityStatus = good`);
    }
    if (row.value !== null && (!Number.isSafeInteger(row.value) || row.value < 0)) {
      throw new Error(`${row.rowKey}: จำนวนสหกรณ์ต้องเป็นจำนวนเต็มไม่ติดลบ`);
    }
    if (row.sourceYearLabel.length === 0) {
      throw new Error(`${row.rowKey}: ป้ายปีต้นทางต้องเป็นข้อความตามที่บันทึกไว้ ไม่ใช่ค่าที่ตั้งเอง`);
    }
  }
}

/**
 * อ่านจำนวนสหกรณ์การเกษตรจริงจากคลังกลาง (D1) สำหรับหน้า /cooperatives และ API
 * - ไม่มีการ fallback ไปยัง buildCooperativesData() ในทุกกรณี
 * - ทุกข้อผิดพลาดของการอ่านถูกเก็บเป็น unavailable โดยชั้นเรียกใช้ (page/route)
 */
export async function loadCooperativesRealCounts(
  filters: CooperativesRealCountsFilters = {},
): Promise<CooperativesRealCountsEnvelope> {
  const envelope = await loadCpdCoopCountsEnvelope(filters);
  assertCooperativesRealCounts(envelope);
  return envelope;
}

/** สถานะสำรองเมื่ออ่านคลังไม่สำเร็จ — เป็นสถานะว่างที่ซื่อสัตย์ ไม่ใช่ตัวเลข sample */
export function cooperativesRealCountsUnavailable(reason?: string): CooperativesRealCountsEnvelope {
  const envelope = unavailableCpdCoopCountsEnvelope(reason);
  assertCooperativesRealCounts(envelope);
  return envelope;
}

