import 'server-only';
import { REGIONS, REGION_BY_PROVINCE } from './weather-data';
import type { RegionKey } from './weather-data';

/** region crosswalk มาจาก weather-data; re-export ให้ consumer ของ module นี้ใช้ type เดียวกันได้ */
export type { RegionKey };

/**
 * มาตรฐานความปลอดภัยสินค้าเกษตรและการตรวจสอบย้อนกลับ (Food Safety & Traceability)
 * สำหรับหน้า /food-safety และ GET /api/v1/food-safety
 *
 * กติกาข้อมูล (AGENTS.md ข้อ 3 และ 4):
 * - ทรัพยากรของ มกอช. / กรมวิชาการเกษตร / กรมปศุสัตว์ / กรมประมง / อย. ที่ module นี้อ้าง
 *   ยังไม่ผ่านการตรวจสิทธิ์เผยแพร่ (ทุกแหล่ง licenseStatus = 'pending') จึงไม่มีตัวเลขจริง
 *   จากต้นทางหรือจาก data/local/ หลุดเข้ามาในไฟล์นี้ ทุกตัวเลขเป็นค่าตัวอย่างแบบ
 *   deterministic พร้อม flag `sample: true` และ `access: 'metadata_only'`
 * - seed มาจากข้อความคงที่ (รหัสจังหวัด + รหัสสินค้า + เลข record) ห้ามใช้ Math.random()
 *   หรือ Date.now() ใน path การสร้างค่า lot code / สถานะใบรับรองจึงเท่ากันทุก request
 *   วันอ้างอิงตรึงไว้ที่ FOOD_SAFETY_DATA_AS_OF
 * - grain แยกกันเด็ดขาด: provinceStats นับเฉพาะ GAP พืช + Organic Thailand ส่วนทะเบียนฟาร์ม
 *   ปศุสัตว์/ประมงมีหน่วยนับคนละชุด แสดงเป็นระดับประเทศใน standards[].certifiedCount เท่านั้น
 *   ห้ามบวกสอง grain นี้เข้าด้วยกัน
 * - ตัวเลขตรวจสารตกค้างสร้างจากจำนวนเต็ม (inspected = passed + failed + pending) แล้วจึง
 *   คำนวณอัตราส่วนจากรายจำนวนนั้น ไม่มีอัตราส่วนสุ่มที่ขัดกับยอด-count
 *   จังหวัด/สินค้า/ห้องปฏิบัติการเป็น three partitions ของ universe ล็อตตรวจเดียวกัน
 *   ยอดรวมแนวดิ่ง-แนวนอนตรงกัน แต่อัตราผ่านต่างกันตาม risk profile ของ cell ได้
 * - ชื่อเกษตรกร ฟาร์ม สหกรณ์ ห้องปฏิบัติการ lot code และ QR payload ทั้งหมดเป็นชื่อสมมติ
 */

export const FOOD_SAFETY_SAMPLE_MODE: boolean = true;

/** วันอ้างอิงคงที่; ห้าม derive จากเวลาจริง เพราะสถานะใบรับรองกับ lot code ต้องเท่ากันเสมอ */
export const FOOD_SAFETY_DATA_AS_OF = '2026-10-25';
const FOOD_SAFETY_GENERATED_AT = '2026-10-25T00:00:00+07:00';

/* ------------------------------------------------------------------ */
/* สัญญาข้อมูลของหน้า /food-safety                                       */
/* ------------------------------------------------------------------ */

export type StandardId = 'gap_crop' | 'gap_livestock' | 'gap_fishery' | 'organic_thailand' | 'chemical_residue';
export type MandateType = 'mandatory' | 'voluntary';
export type CertStatus = 'active' | 'expired' | 'suspended' | 'pending_renewal';
export type CommodityGroupId = 'fruit' | 'rice' | 'vegetable' | 'field_crop' | 'livestock' | 'aquaculture';
export type ResidueResult = 'pass' | 'fail' | 'pending';

/** มาตรฐานแต่ละแถวถือหน่วยงานและ grain ของตัวเอง; sourceUrl ใส่เฉพาะโดเมนที่มั่นใจว่าเป็นของจริง */
export interface StandardDef {
  id: StandardId;
  label: string;
  nameEn: string;
  mandateType: MandateType;
  mandateLabel: string;
  agency: string;
  description: string;
  sourceUrl: string | null;
  certifiedCount: number;
}

/** จังหวัดละ 1 แถว (77 แถว) — เฉพาะ grain GAP พืช + Organic Thailand */
export interface ProvinceCertStat {
  provinceCode: string;
  provinceName: string;
  region: RegionKey;
  regionLabel: string;
  gapFarmCount: number;
  gapAreaRai: number;
  organicFarmCount: number;
  organicAreaRai: number;
  totalCertifiedFarmCount: number;
  inspectedLotCount: number;
  passedLotCount: number;
  failedLotCount: number;
  pendingLotCount: number;
  passRate: number;
  traceableLotCount: number;
  traceabilityRate: number;
  dominantCommodity: string;
}

/** มุมมองรายสินค้า เป็นคนละแกนกับ provinceStats ห้ามบวกข้ามแกน */
export interface CommodityCertBoard {
  commodityId: string;
  commodityName: string;
  groupId: CommodityGroupId;
  gapCertifiedFarmCount: number;
  gapCertifiedAreaRai: number;
  organicCertifiedFarmCount: number;
  certifiedRatio: number;
  residueSampledLots: number;
  residuePassRate: number;
  residueFailRate: number;
  mandateType: MandateType;
  topProvinces: Array<{ provinceCode: string; provinceName: string; certifiedFarmCount: number }>;
}

/** เสาะย้อนกลับจากจุดจำหน่ายกลับถึงแปลง/ฟาร์มผลิต */
export interface TraceabilityStage {
  stage: 'farm' | 'collection' | 'packing' | 'transport' | 'retail';
  stageLabel: string;
  location: string;
  date: string;
}

export interface TraceabilityLot {
  lotCode: string;
  qrPayload: string;
  farmCode: string;
  farmName: string;
  standardId: StandardId;
  standardLabel: string;
  mandateType: MandateType;
  commodityName: string;
  provinceCode: string;
  provinceName: string;
  region: RegionKey;
  harvestDate: string;
  certifiedDate: string;
  expiryDate: string;
  status: CertStatus;
  statusLabel: string;
  residueResult: ResidueResult;
  residueMrlGroup: string;
  chain: TraceabilityStage[];
}

/** ทะเบียนใบรับรอง ค้นหาด้วย certificateNo แบบ exact/prefix ได้ */
export interface CertificateRecord {
  certificateNo: string;
  holderName: string;
  farmCode: string;
  standardId: StandardId;
  standardLabel: string;
  mandateType: MandateType;
  status: CertStatus;
  statusLabel: string;
  commodityNames: string[];
  provinceCode: string;
  provinceName: string;
  region: RegionKey;
  issueDate: string;
  expiryDate: string;
}

/** ห้องปฏิบัติการตรวจสารตกค้าง นับเฉพาะผลที่ปิดแล้ว (passed + failed = tested) */
export interface ResidueLabStat {
  labId: string;
  labName: string;
  region: RegionKey;
  regionLabel: string;
  testedLots: number;
  passedLots: number;
  failedLots: number;
  passRate: number;
  primaryMrlGroup: string;
}

export interface FoodSafetySummary {
  totalCertifiedFarms: number;
  gapCertifiedFarms: number;
  organicCertifiedFarms: number;
  certifiedAreaRai: number;
  mandatoryStandardCount: number;
  voluntaryStandardCount: number;
  totalInspectedLots: number;
  totalPassedLots: number;
  overallPassRate: number;
  totalTraceableLots: number;
  overallTraceabilityRate: number;
  provinceCount: number;
}

export interface FoodSafetyFilters {
  provinceCode?: string;
  region?: RegionKey | 'all';
  standardId?: StandardId | 'all';
  mandateType?: MandateType | 'all';
  commodityId?: string | 'all';
  search?: string;
}

export interface FoodSafetySourceRef {
  id: string;
  name: string;
  agencyLabel: string;
  role: string;
  sourceUrl: string | null;
  licenseStatus: 'pending' | 'approved_public';
}

export interface FoodSafetyDashboardPayload {
  sample: boolean;
  generatedAt: string;
  dataAsOf: string;
  appliedFilters: Required<Pick<
    FoodSafetyFilters,
    'provinceCode' | 'region' | 'standardId' | 'mandateType' | 'commodityId' | 'search'
  >>;
  summary: FoodSafetySummary;
  standards: StandardDef[];
  provinceStats: ProvinceCertStat[];
  commodityBoard: CommodityCertBoard[];
  traceabilityLots: TraceabilityLot[];
  certificates: CertificateRecord[];
  residueLabs: ResidueLabStat[];
  matchedLots: TraceabilityLot[];
  matchedCertificates: CertificateRecord[];
  warnings: string[];
  sources: FoodSafetySourceRef[];
}

/* ------------------------------------------------------------------ */
/* ตารางจังหวัดอ้างอิง (รหัส 2 หลัก 10-96) + crosswalk ภาค               */
/* ------------------------------------------------------------------ */

const PROVINCE_NAMES: Record<string, string> = {
  '10': 'กรุงเทพมหานคร', '11': 'สมุทรปราการ', '12': 'นนทบุรี', '13': 'ปทุมธานี',
  '14': 'พระนครศรีอยุธยา', '15': 'อ่างทอง', '16': 'ลพบุรี', '17': 'สิงห์บุรี',
  '18': 'ชัยนาท', '19': 'สระบุรี', '20': 'ชลบุรี', '21': 'ระยอง', '22': 'จันทบุรี',
  '23': 'ตราด', '24': 'ฉะเชิงเทรา', '25': 'ปราจีนบุรี', '26': 'นครนายก', '27': 'สระแก้ว',
  '30': 'นครราชสีมา', '31': 'บุรีรัมย์', '32': 'สุรินทร์', '33': 'ศรีสะเกษ',
  '34': 'อุบลราชธานี', '35': 'ยโสธร', '36': 'ชัยภูมิ', '37': 'อำนาจเจริญ', '38': 'บึงกาฬ',
  '39': 'หนองบัวลำภู', '40': 'ขอนแก่น', '41': 'อุดรธานี', '42': 'เลย', '43': 'หนองคาย',
  '44': 'มหาสารคาม', '45': 'ร้อยเอ็ด', '46': 'กาฬสินธุ์', '47': 'สกลนคร', '48': 'นครพนม',
  '49': 'มุกดาหาร', '50': 'เชียงใหม่', '51': 'ลำพูน', '52': 'ลำปาง', '53': 'อุตรดิตถ์',
  '54': 'แพร่', '55': 'น่าน', '56': 'พะเยา', '57': 'เชียงราย', '58': 'แม่ฮ่องสอน',
  '60': 'นครสวรรค์', '61': 'อุทัยธานี', '62': 'กำแพงเพชร', '63': 'ตาก', '64': 'สุโขทัย',
  '65': 'พิษณุโลก', '66': 'พิจิตร', '67': 'เพชรบูรณ์', '70': 'ราชบุรี', '71': 'กาญจนบุรี',
  '72': 'สุพรรณบุรี', '73': 'นครปฐม', '74': 'สมุทรสาคร', '75': 'สมุทรสงคราม',
  '76': 'เพชรบุรี', '77': 'ประจวบคีรีขันธ์', '80': 'นครศรีธรรมราช', '81': 'กระบี่',
  '82': 'พังงา', '83': 'ภูเก็ต', '84': 'สุราษฎร์ธานี', '85': 'ระนอง', '86': 'ชุมพร',
  '90': 'สงขลา', '91': 'สตูล', '92': 'ตรัง', '93': 'พัทลุง', '94': 'ปัตตานี', '95': 'ยะลา',
  '96': 'นราธิวาส',
};

export const REGION_LABEL_BY_KEY: Record<RegionKey, string> = REGIONS.reduce(
  (acc, region) => ({ ...acc, [region.key]: region.label }),
  {} as Record<RegionKey, string>,
);

export interface FoodSafetyProvinceOption {
  code: string;
  name: string;
  region: RegionKey;
  regionLabel: string;
  coastal: boolean;
}

/** จังหวัดชายฝั่ง ใช้กำหนดขอบเขตสินค้าเพาะเลี้ยงสัตว์น้ำทะเล (ประกาศก่อนตารางจังหวัดเพราะถูกใช้ตอน init) */
const COASTAL_PROVINCE_CODES = new Set([
  '11', '20', '21', '22', '23', '24', '74', '75', '76', '77',
  '80', '81', '82', '83', '84', '85', '86', '90', '91', '92', '93', '94', '96',
]);

/** จังหวัดอ้างอิง 77 แถว; ใช้ตรวจรหัสจังหวัดและกำหนด completeness ไม่ใช่ข้ออ้าง coverage */
export const FOOD_SAFETY_PROVINCES: FoodSafetyProvinceOption[] = Object.keys(PROVINCE_NAMES)
  .sort((a, b) => Number(a) - Number(b))
  .map((code) => {
    const region = REGION_BY_PROVINCE[code] ?? 'central';
    return {
      code,
      name: PROVINCE_NAMES[code],
      region,
      regionLabel: REGION_LABEL_BY_KEY[region],
      coastal: COASTAL_PROVINCE_CODES.has(code),
    };
  });

/* ------------------------------------------------------------------ */
/* ตัวช่วย deterministic (mulberry32 + FNV-1a)                           */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** คีย์เดิมต้องได้ค่าเดิมทุกครั้ง — ห้ามใส่เวลาจริงหรือ random ลงในคีย์ */
function seedFrom(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function unit(key: string): number {
  return mulberry32(seedFrom(key))();
}

function between(key: string, min: number, max: number): number {
  return min + unit(key) * (max - min);
}

function pick<T>(key: string, items: readonly T[]): T {
  if (items.length === 0) throw new Error('food-safety-data: pick() ต้องการรายการไม่ว่างเปล่า');
  return items[Math.floor(unit(key) * items.length) % items.length];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** ทุกอัตราส่วนใน module นี้อ่านกลับเป็นจำนวนเต็มของ collection เดียวกันได้ */
function rateFrom(count: number, total: number): number {
  return total > 0 ? round2((count * 100) / total) : 0;
}

/** largest-remainder: ผลรวมส่วนแบ่งเท่ายอดต้นทางพอดี ไม่หาย/ไม่ซ้ำจากการปัด */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sum);
  const parts = exact.map((value) => Math.floor(value));
  let rest = total - parts.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value), usable: weights[index] > 0 }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .filter((entry) => entry.usable);
  let cursor = 0;
  while (rest > 0 && order.length > 0 && cursor < order.length * 3) {
    parts[order[cursor % order.length].index] += 1;
    rest -= 1;
    cursor += 1;
  }
  return parts;
}

/* ------------------------------------------------------------------ */
/* วันที่ (anchored กับ FOOD_SAFETY_DATA_AS_OF เท่านั้น)                  */
/* ------------------------------------------------------------------ */

function epochDays(iso: string): number {
  return Math.floor(Date.parse(iso + 'T00:00:00Z') / 86_400_000);
}

function isoFromEpochDays(days: number): string {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

const DATA_AS_OF_EPOCH = epochDays(FOOD_SAFETY_DATA_AS_OF);

/* ------------------------------------------------------------------ */
/* นิยามมาตรฐาน                                                          */
/* ------------------------------------------------------------------ */

const MANDATE_LABEL: Record<MandateType, string> = {
  mandatory: 'มาตรฐานบังคับ',
  voluntary: 'มาตรฐานสมัครใจ',
};

const STATUS_LABEL: Record<CertStatus, string> = {
  active: 'มีผลบังคับใช้',
  expired: 'หมดอายุแล้ว',
  suspended: 'พักการใช้ใบรับรอง',
  pending_renewal: 'รอต่ออายุ',
};

const RESIDUE_RESULT_LABEL: Record<ResidueResult, string> = {
  pass: 'ผ่านเกณฑ์ MRL',
  fail: 'ไม่ผ่านเกณฑ์ MRL',
  pending: 'รอผลตรวจ',
};

export const CERT_STATUS_LABELS = STATUS_LABEL;
export const RESIDUE_RESULT_LABELS = RESIDUE_RESULT_LABEL;

interface StandardSeed {
  id: StandardId;
  label: string;
  nameEn: string;
  mandateType: MandateType;
  agency: string;
  description: string;
  sourceUrl: string | null;
  sourceId: string;
  validityDays: number;
  certPrefix: string;
}

/**
 * นิยามมาตรฐาน 5 ชุด certifiedCount ถูกคำนวณจากโมเดลข้างล่าง (ไม่ได้พิมพ์ตัวเลขลอย)
 * ส่วน "มาตรฐานบังคับ" กำหนดตามบริบทกฎหมายอาหารของ MRL เท่านั้น การ mapping รายสินค้า
 * เป็นไปเพื่อสาธิต ยังไม่ได้ตรวจกับประกาศรายฉบับ
 */
const STANDARD_SEEDS: StandardSeed[] = [
  {
    id: 'gap_crop',
    label: 'GAP พืช (มกช. 9020-1)',
    nameEn: 'Good Agricultural Practices for Crop',
    mandateType: 'voluntary',
    agency: 'กรมวิชาการเกษตร (DOA)',
    description: 'หลักปฏิบัติทางการเกษตรที่ดีสำหรับพืช ครอบคลุมการจัดการสารกำจัดศัตรูพืชในแปลงจนถึงผลผลิตที่คัดบรรจุ',
    sourceUrl: 'https://www.doa.go.th',
    sourceId: 'doa',
    validityDays: 1095,
    certPrefix: 'GAP-3',
  },
  {
    id: 'gap_livestock',
    label: 'GAP ปศุสัตว์ (ฟาร์มมาตรฐาน)',
    nameEn: 'Good Agricultural Practices for Livestock Farm',
    mandateType: 'voluntary',
    agency: 'กรมปศุสัตว์ (DLD)',
    description: 'การปฏิบัติทางการเกษตรที่ดีสำหรับฟาร์มปศุสัตว์ เป็นทะเบียนคนละชุดและคนละ grain กับ GAP พืช',
    sourceUrl: 'https://www.dld.go.th',
    sourceId: 'dld',
    validityDays: 1095,
    certPrefix: 'GAP-3',
  },
  {
    id: 'gap_fishery',
    label: 'GAP ประมง (มกช. ประมง)',
    nameEn: 'Good Agricultural Practices for Aquaculture',
    mandateType: 'voluntary',
    agency: 'กรมประมง (DOF)',
    description: 'การปฏิบัติทางการเพาะเลี้ยงสัตว์น้ำที่ดีสำหรับฟาร์มเพาะเลี้ยงสัตว์น้ำทะเลและน้ำจืด ใช้ทะเบียนคนละชุดกับฝั่งปศุสัตว์',
    sourceUrl: 'https://www4.fisheries.go.th',
    sourceId: 'dof',
    validityDays: 1095,
    certPrefix: 'GAP-3',
  },
  {
    id: 'organic_thailand',
    label: 'เกษตรอินทรีย์ Organic Thailand',
    nameEn: 'Organic Thailand Certification',
    mandateType: 'voluntary',
    agency: 'กรมวิชาการเกษตร (DOA) / มกอช.',
    description: 'ระบบรับรองเกษตรอินทรีย์ของไทย ใช้กับสินค้าพืชเท่านั้น ยอดอินทรีย์ของสินค้าปศุสัตว์/สัตว์น้ำจึงเป็น 0 ตามนิยาม',
    sourceUrl: 'https://www.onab.go.th',
    sourceId: 'onab',
    validityDays: 365,
    certPrefix: 'ORG-1',
  },
  {
    id: 'chemical_residue',
    label: 'เกณฑ์สารพิษตกค้างสูงสุด (MRL)',
    nameEn: 'Chemical Residue / MRL Compliance',
    mandateType: 'mandatory',
    agency: 'สำนักงานคณะกรรมการอาหารและยา (อย.) / มกอช.',
    description: 'ระดับสารตกค้างที่ยอมรับได้ในสินค้าอาหาร มีผลบังคับทางกฎหมายอาหาร certifiedCount คือจำนวนล็อตที่ผ่านผลตรวจในรอบอ้างอิง',
    sourceUrl: 'https://www.acfs.go.th',
    sourceId: 'acfs',
    validityDays: 180,
    certPrefix: 'MRL-1',
  },
];

const STANDARD_BY_ID = new Map<StandardId, StandardSeed>(STANDARD_SEEDS.map((seed) => [seed.id, seed] as const));

/** เฉพาะสองมาตรฐานนี้อยู่ใน column ของ provinceStats (grain พืช/อินทรีย์) */
const PROVINCE_GRAIN_STANDARD_IDS = new Set<StandardId>(['gap_crop', 'organic_thailand']);

/* ------------------------------------------------------------------ */
/* นิยามสินค้า                                                           */
/* ------------------------------------------------------------------ */

interface CommoditySeed {
  id: string;
  name: string;
  groupId: CommodityGroupId;
  /** ตัวหารของ certifiedRatio (ค่าตัวอย่างของ holdings ทั้งประเทศ) */
  holdings: number;
  raiPerHolding: number;
  regionIntensity: Record<RegionKey, number>;
  provinceBoost?: Record<string, number>;
  coastalOnly?: boolean;
  /** ตัวคูณความเสี่ยงสารตกค้าง เทียบกับเกณฑ์ฐานของจังหวัด */
  residueRisk: number;
  mrlGroup: string;
  mandateType: MandateType;
}

const GROUP_FOR_STANDARD: Record<StandardId, CommodityGroupId[]> = {
  gap_crop: ['fruit', 'rice', 'vegetable', 'field_crop'],
  organic_thailand: ['fruit', 'rice', 'vegetable', 'field_crop'],
  gap_livestock: ['livestock'],
  gap_fishery: ['aquaculture'],
  chemical_residue: ['fruit', 'rice', 'vegetable', 'field_crop', 'livestock', 'aquaculture'],
};

const CROP_GROUPS = new Set<CommodityGroupId>(['fruit', 'rice', 'vegetable', 'field_crop']);

const COMMODITY_SEEDS: CommoditySeed[] = [
  {
    id: 'durian', name: 'ทุเรียน', groupId: 'fruit', holdings: 220_000, raiPerHolding: 22,
    regionIntensity: { north: 0.12, northeast: 0, central: 0.12, east: 1, south: 0.7 },
    provinceBoost: { '22': 1.6, '23': 1.45, '21': 1.1, '86': 1.2, '67': 0.5 },
    residueRisk: 0.85, mrlGroup: 'ออร์โนฟอสเฟต', mandateType: 'mandatory',
  },
  {
    id: 'mangosteen', name: 'มังคุด', groupId: 'fruit', holdings: 62_000, raiPerHolding: 18,
    regionIntensity: { north: 0, northeast: 0, central: 0.06, east: 1, south: 0.6 },
    provinceBoost: { '22': 1.5, '23': 1.2, '86': 0.9, '77': 0.3 },
    residueRisk: 0.9, mrlGroup: 'ไพรีทรอยด์', mandateType: 'mandatory',
  },
  {
    id: 'mango', name: 'มะม่วง', groupId: 'fruit', holdings: 180_000, raiPerHolding: 20,
    regionIntensity: { north: 0.6, northeast: 0.35, central: 0.5, east: 0.3, south: 0.1 },
    provinceBoost: { '66': 1.2, '65': 1.05, '50': 0.95, '70': 0.9, '13': 0.8 },
    residueRisk: 1.2, mrlGroup: 'คาร์บาเมต', mandateType: 'mandatory',
  },
  {
    id: 'vegetable_fruit', name: 'ผักผลไม้', groupId: 'vegetable', holdings: 1_800_000, raiPerHolding: 8,
    regionIntensity: { north: 0.8, northeast: 0.6, central: 0.9, east: 0.7, south: 0.5 },
    provinceBoost: { '73': 1.2, '70': 1.05, '13': 1, '50': 1.1 },
    residueRisk: 1.6, mrlGroup: 'คาร์บาเมต', mandateType: 'mandatory',
  },
  {
    id: 'rice', name: 'ข้าว', groupId: 'rice', holdings: 3_700_000, raiPerHolding: 17,
    regionIntensity: { north: 0.9, northeast: 1.1, central: 1.05, east: 0.5, south: 0.4 },
    provinceBoost: { '30': 1.4, '32': 1.2, '72': 1.3, '60': 1.2, '14': 1.1 },
    residueRisk: 0.7, mrlGroup: 'อะทราซีน', mandateType: 'mandatory',
  },
  {
    id: 'cassava', name: 'มันสำปะหลัง', groupId: 'field_crop', holdings: 600_000, raiPerHolding: 25,
    regionIntensity: { north: 0.25, northeast: 1, central: 0.35, east: 0.6, south: 0.05 },
    provinceBoost: { '30': 1.3, '31': 1.2, '71': 0.95, '21': 0.6 },
    residueRisk: 0.5, mrlGroup: 'ไกลโฟเซต', mandateType: 'voluntary',
  },
  {
    id: 'sugar_cane', name: 'อ้อยโรงงาน', groupId: 'field_crop', holdings: 400_000, raiPerHolding: 30,
    regionIntensity: { north: 0.35, northeast: 0.6, central: 1, east: 0.3, south: 0.05 },
    provinceBoost: { '14': 1.3, '72': 1.3, '70': 1.1, '17': 1, '18': 0.9 },
    residueRisk: 0.45, mrlGroup: 'ไกลโฟเซต', mandateType: 'voluntary',
  },
  {
    id: 'field_corn', name: 'ข้าวโพดเลี้ยงสัตว์', groupId: 'field_crop', holdings: 300_000, raiPerHolding: 20,
    regionIntensity: { north: 0.7, northeast: 1, central: 0.4, east: 0.3, south: 0.1 },
    provinceBoost: { '30': 1.2, '58': 0.8, '67': 0.9 },
    residueRisk: 0.6, mrlGroup: 'อะฟลาทอกซิน (สารพิษจากเชื้อรา)', mandateType: 'voluntary',
  },
  {
    id: 'chicken', name: 'ไก่เนื้อ', groupId: 'livestock', holdings: 250_000, raiPerHolding: 12,
    regionIntensity: { north: 0.9, northeast: 1, central: 1.1, east: 0.8, south: 0.6 },
    provinceBoost: { '14': 1.2, '73': 1.1, '30': 1.05 },
    residueRisk: 0.6, mrlGroup: 'สารกลุ่มต้านจุลชีพ', mandateType: 'voluntary',
  },
  {
    id: 'pig', name: 'สุกร', groupId: 'livestock', holdings: 150_000, raiPerHolding: 15,
    regionIntensity: { north: 0.8, northeast: 0.9, central: 1.1, east: 0.7, south: 0.5 },
    provinceBoost: { '19': 1.2, '72': 1, '30': 1.1 },
    residueRisk: 0.75, mrlGroup: 'สารกลุ่มต้านจุลชีพ', mandateType: 'voluntary',
  },
  {
    id: 'shrimp', name: 'กุ้งทะเล', groupId: 'aquaculture', holdings: 50_000, raiPerHolding: 12,
    regionIntensity: { north: 0, northeast: 0, central: 0.6, east: 0.8, south: 1 },
    provinceBoost: { '90': 1.3, '84': 1.1, '74': 1.2, '22': 0.9 },
    coastalOnly: true, residueRisk: 1.2, mrlGroup: 'ไนโตรฟูราน', mandateType: 'voluntary',
  },
  {
    id: 'tilapia', name: 'ปลานิล', groupId: 'aquaculture', holdings: 60_000, raiPerHolding: 10,
    regionIntensity: { north: 0.8, northeast: 0.7, central: 1, east: 0.5, south: 0.5 },
    provinceBoost: { '14': 1.3, '60': 1.1, '32': 0.9 },
    residueRisk: 0.9, mrlGroup: 'มาลาไคต์กรีน', mandateType: 'voluntary',
  },
];

const COMMODITY_BY_ID = new Map<string, CommoditySeed>(COMMODITY_SEEDS.map((seed) => [seed.id, seed] as const));

/** รหัสสินค้าที่ระบบรองรับ (ใช้ตรวจพารามิเตอร์ commodityId) */
export const FOOD_SAFETY_COMMODITY_IDS: string[] = COMMODITY_SEEDS.map((seed) => seed.id);

/** ชื่อสินค้าภาษาไทย → รหัส ให้ผู้ใช้พิมพ์ชื่อไทยกรองแทนรหัสได้ */
export const FOOD_SAFETY_COMMODITY_NAME_ALIASES: Record<string, string> = Object.fromEntries(
  COMMODITY_SEEDS.map((seed) => [seed.name, seed.id] as const),
);

/** อ่าน alias แบบไม่พึ่ง prototype chain (กัน key จำพวก constructor/__proto__ แล่นผ่าน Object.getPrototypeOf) */
function lookupCommodityAlias(name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(FOOD_SAFETY_COMMODITY_NAME_ALIASES, name)
    ? FOOD_SAFETY_COMMODITY_NAME_ALIASES[name]
    : undefined;
}

function commodityWeight(seed: CommoditySeed, province: FoodSafetyProvinceOption): number {
  // ต้องกันจังหวัดไม่ชายฝั่งก่อน ไม่งั้น provinceBoost จะลากสัตว์น้ำทะเลไปขึ้นเมืองใน
  if (seed.coastalOnly && !province.coastal) return 0;
  const boost = seed.provinceBoost?.[province.code];
  if (boost !== undefined) return boost;
  return seed.regionIntensity[province.region];
}

/* ------------------------------------------------------------------ */
/* โมเดลระดับจังหวัด                                                     */
/* ------------------------------------------------------------------ */

const BASE_GAP_FARMS = 4600;

/** ขนาดกิจกรรมเกษตรต่อจังหวัด (ค่าตัวอย่างเพื่อการจำลอง ไม่ใช่สถิติทะเบียน) */
const PROVINCE_AG_SCALE: Record<string, number> = {
  '10': 0.35, '11': 0.6, '12': 0.4, '13': 0.7, '20': 0.8, '22': 1.5, '23': 1.3,
  '30': 1.9, '31': 1.5, '32': 1.4, '33': 1.4, '34': 1.5, '40': 1.6, '41': 1.4,
  '43': 1, '45': 1.4, '47': 1.3, '50': 1.3, '57': 1.1, '60': 1.3, '65': 1.2,
  '67': 1.3, '70': 1.2, '71': 1.2, '72': 1.5, '73': 1.1, '74': 0.8, '76': 1,
  '77': 1.1, '80': 1.3, '84': 1.3, '85': 0.6, '86': 1.3, '90': 1.3, '91': 0.8,
  '93': 1, '94': 0.9, '96': 0.9,
};

const REGION_AG_SCALE: Record<RegionKey, number> = {
  north: 0.95, northeast: 1.2, central: 1.05, east: 0.9, south: 0.82,
};

const REGION_LOT_BUDGET_SCALE: Record<RegionKey, number> = {
  north: 0.9, northeast: 0.8, central: 1.2, east: 1.3, south: 1,
};

/** หนึ่ง cell ของตาราง จังหวัด × สินค้า — หน่วยนับคือล็อตตรวจสารตกค้าง */
interface CellSeed {
  provinceCode: string;
  commodityId: string;
  sampledLots: number;
  passedLots: number;
  failedLots: number;
  pendingLots: number;
}

/** ส่วนแบ่งทะเบียนรับรอง/พื้นที่ใน cell จังหวัด × สินค้า */
interface CertificationShare {
  commodity: CommoditySeed;
  certifiedFarms: number;
  certifiedAreaRai: number;
  organicFarms: number;
  organicAreaRai: number;
}

interface ProvinceModel extends ProvinceCertStat {
  shares: CertificationShare[];
  livestockFarms: number;
  fisheryFarms: number;
  /** ค่าภายในโมเดล ไม่ถูกส่งออกใน ProvinceCertStat — ใช้สุ่มเลือก lot และคำนวณ rate ของ cell */
  lotBudget: number;
  passPct: number;
  pendingPct: number;
  tracePct: number;
}

function allocateShares(
  province: FoodSafetyProvinceOption,
  seeds: CommoditySeed[],
  pool: number,
  keySuffix: string,
): CertificationShare[] {
  const weights = seeds.map((seed) => {
    const base = commodityWeight(seed, province);
    if (base <= 0) return 0;
    return base * between(`fs:share:${province.code}:${keySuffix}:${seed.id}`, 0.82, 1.18);
  });
  const farms = allocate(pool, weights);
  return seeds.map((seed, index) => {
    const certifiedFarms = farms[index];
    const rai = Math.round(seed.raiPerHolding * between(`fs:rai:${province.code}:${seed.id}`, 0.8, 1.3));
    return {
      commodity: seed,
      certifiedFarms,
      certifiedAreaRai: certifiedFarms * rai,
      organicFarms: 0,
      organicAreaRai: 0,
    };
  });
}

function cropSeeds(): CommoditySeed[] {
  return COMMODITY_SEEDS.filter((seed) => CROP_GROUPS.has(seed.groupId));
}

function groupSeeds(groupId: CommodityGroupId): CommoditySeed[] {
  return COMMODITY_SEEDS.filter((seed) => seed.groupId === groupId);
}

function buildProvinceModel(province: FoodSafetyProvinceOption) {
  const key = `fs:prov:${province.code}`;
  const scale = (PROVINCE_AG_SCALE[province.code] ?? 1) * REGION_AG_SCALE[province.region];
  const gapFarms = Math.round(clamp(BASE_GAP_FARMS * scale * between(`${key}:jitter`, 0.7, 1.25), 900, 15_000));
  const organicFarms = Math.round(clamp((gapFarms * between(`${key}:organic`, 1.2, 6)) / 100, 20, 900));
  const livestockFarms = Math.round(clamp(700 * scale * between(`${key}:live`, 0.55, 1.5), 60, 3200));
  const fisheryFarms = province.coastal
    ? Math.round(clamp(800 * scale * between(`${key}:marine`, 0.5, 1.6), 40, 3500))
    : Math.round(clamp(180 * scale * between(`${key}:fresh`, 0.4, 1.6), 15, 900));
  const lotBudget = Math.round(
    clamp(430 * REGION_LOT_BUDGET_SCALE[province.region] * between(`${key}:lot`, 0.5, 1.9), 60, 900),
  );
  // จังหวัดเสี่ยงต่ำจะถูกลากลงมาอยู่ช่วงต่ำ 80% (จำลองพื้นที่ตรวจพบสารตกค้างเกิน MRL)
  const passPct = unit(`${key}:risk`) < 0.09
    ? between(`${key}:passlow`, 81, 86.5)
    : between(`${key}:pass`, 88.5, 98.8);
  const pendingPct = between(`${key}:pending`, 0.6, 3.5);
  const tracePct = between(`${key}:trace`, 58, 94);
  return { key, gapFarms, organicFarms, livestockFarms, fisheryFarms, lotBudget, passPct, pendingPct, tracePct };
}

function buildProvinces(): { models: ProvinceModel[]; cells: CellSeed[] } {
  const models: ProvinceModel[] = [];

  for (const province of FOOD_SAFETY_PROVINCES) {
    const numbers = buildProvinceModel(province);
    const crop = allocateShares(province, cropSeeds(), numbers.gapFarms, 'gap');

    // Organic จัดสรรบน crop family เดียวกัน (พืชเท่านั้น) และต้องรวมได้ organicFarms พอดี
    const organicWeights = crop.map((share) => {
      const base = commodityWeight(share.commodity, province);
      if (base <= 0) return 0;
      return share.commodity.groupId === 'rice' ? base * 1.6 : base;
    });
    const organicParts = allocate(numbers.organicFarms, organicWeights);
    crop.forEach((share, index) => {
      share.organicFarms = organicParts[index];
      share.organicAreaRai = Math.round(share.organicFarms * share.commodity.raiPerHolding * 0.8);
    });

    const livestock = allocateShares(province, groupSeeds('livestock'), numbers.livestockFarms, 'live');
    const aquaculture = allocateShares(province, groupSeeds('aquaculture'), numbers.fisheryFarms, 'fish');

    models.push({
      provinceCode: province.code,
      provinceName: province.name,
      region: province.region,
      regionLabel: province.regionLabel,
      gapFarmCount: numbers.gapFarms,
      gapAreaRai: crop.reduce((acc, share) => acc + share.certifiedAreaRai, 0),
      organicFarmCount: numbers.organicFarms,
      organicAreaRai: crop.reduce((acc, share) => acc + share.organicAreaRai, 0),
      totalCertifiedFarmCount: numbers.gapFarms + numbers.organicFarms,
      inspectedLotCount: 0,
      passedLotCount: 0,
      failedLotCount: 0,
      pendingLotCount: 0,
      passRate: 0,
      traceableLotCount: 0,
      traceabilityRate: 0,
      dominantCommodity: '',
      shares: [...crop, ...livestock, ...aquaculture],
      livestockFarms: numbers.livestockFarms,
      fisheryFarms: numbers.fisheryFarms,
      lotBudget: numbers.lotBudget,
      passPct: numbers.passPct,
      pendingPct: numbers.pendingPct,
      tracePct: numbers.tracePct,
    });
  }

  // universe เดียวของล็อตตรวจ แล้ว partition บนตาราง cell (จังหวัด × สินค้า)
  // วิธีนี้ยอดรวมแนวจังหวัดและแนวสินค้ามาจากจำนวนเต็มชุดเดียวกัน ไม่มีการนับซ้ำ
  const universe = models.reduce((acc, model) => acc + model.lotBudget, 0);
  const cellKeys: Array<{ modelIndex: number; shareIndex: number }> = [];
  const cellWeights: number[] = [];
  models.forEach((model, modelIndex) => {
    const totalFarms = model.shares.reduce((acc, share) => acc + share.certifiedFarms, 0) || 1;
    model.shares.forEach((share, shareIndex) => {
      if (share.certifiedFarms <= 0) return;
      cellKeys.push({ modelIndex, shareIndex });
      cellWeights.push(Math.max(0.01, model.lotBudget * (share.certifiedFarms / totalFarms)));
    });
  });
  const sampledCells = allocate(universe, cellWeights);

  const cells: CellSeed[] = [];
  cellKeys.forEach((cell, index) => {
    const model = models[cell.modelIndex];
    const share = model.shares[cell.shareIndex];
    const sampled = sampledCells[index];
    if (sampled <= 0) return;
    const key = `fs:cell:${model.provinceCode}:${share.commodity.id}`;
    // cell pass = เกณฑ์จังหวัดปรับด้วยความเสี่ยงสินค้า (เช่น ผักผลไม้เสี่ยงสูงกว่าอ้อย)
    // เพดาน 98.2 ทำให้ยอดรวมของจังหวัด (ผลปัดของ cell เล็ก) ยังไม่หลุดพ้นแถบ 88–99%
    const cellPass = clamp(model.passPct - (share.commodity.residueRisk - 1) * 3, 76, 98.2);
    const cellPending = clamp(model.pendingPct * between(`${key}:pendingshare`, 0.7, 1.4), 0, 100 - cellPass);
    const cellFail = Math.max(0, 100 - cellPass - cellPending);
    const passed = Math.round((sampled * cellPass) / 100);
    const failed = Math.min(Math.max(0, sampled - passed), Math.round((sampled * cellFail) / 100));
    cells.push({
      provinceCode: model.provinceCode,
      commodityId: share.commodity.id,
      sampledLots: sampled,
      passedLots: passed,
      failedLots: failed,
      pendingLots: sampled - passed - failed,
    });
  });

  for (const model of models) {
    const rows = cells.filter((cell) => cell.provinceCode === model.provinceCode);
    const inspected = rows.reduce((acc, cell) => acc + cell.sampledLots, 0);
    const passed = rows.reduce((acc, cell) => acc + cell.passedLots, 0);
    const failed = rows.reduce((acc, cell) => acc + cell.failedLots, 0);
    const pending = inspected - passed - failed;
    const traceable = Math.min(inspected, Math.round((inspected * model.tracePct) / 100));
    model.inspectedLotCount = inspected;
    model.passedLotCount = passed;
    model.failedLotCount = failed;
    model.pendingLotCount = pending;
    model.passRate = rateFrom(passed, inspected);
    model.traceableLotCount = traceable;
    model.traceabilityRate = rateFrom(traceable, inspected);

    const dominant = [...model.shares]
      .filter((share) => share.certifiedFarms > 0)
      .sort((a, b) => b.certifiedFarms - a.certifiedFarms || a.commodity.id.localeCompare(b.commodity.id))[0];
    model.dominantCommodity = dominant ? dominant.commodity.name : 'ไม่ระบุสินค้าหลัก';
  }

  return { models, cells };
}

const PROVINCE_BUILD = buildProvinces();
const PROVINCE_MODELS: ProvinceModel[] = PROVINCE_BUILD.models;
const CELL_SEEDS: CellSeed[] = PROVINCE_BUILD.cells;

const PROVINCE_MODEL_BY_CODE = new Map<string, ProvinceModel>(
  PROVINCE_MODELS.map((model) => [model.provinceCode, model] as const),
);
const CELL_SEED_INDEX = new Map<string, CellSeed>(
  CELL_SEEDS.map((cell) => [`${cell.provinceCode}|${cell.commodityId}`, cell] as const),
);

/** ล็อตที่ผ่านผลตรวจทั้งประเทศ — ใช้เป็น certifiedCount ของเกณฑ์ MRL */
const NATIONAL_PASSED_LOTS = PROVINCE_MODELS.reduce((acc, model) => acc + model.passedLotCount, 0);

/* ------------------------------------------------------------------ */
/* ทะเบียนมาตรฐานแห่งชาติ (certifiedCount derive จากโมเดล)               */
/* ------------------------------------------------------------------ */

function standardNationalCount(id: StandardId): number {
  switch (id) {
    case 'gap_crop':
      return PROVINCE_MODELS.reduce((acc, model) => acc + model.gapFarmCount, 0);
    case 'organic_thailand':
      return PROVINCE_MODELS.reduce((acc, model) => acc + model.organicFarmCount, 0);
    case 'gap_livestock':
      return PROVINCE_MODELS.reduce((acc, model) => acc + model.livestockFarms, 0);
    case 'gap_fishery':
      return PROVINCE_MODELS.reduce((acc, model) => acc + model.fisheryFarms, 0);
    case 'chemical_residue':
      return NATIONAL_PASSED_LOTS;
    default:
      return 0;
  }
}

export const FOOD_SAFETY_STANDARDS: StandardDef[] = STANDARD_SEEDS.map((seed) => ({
  id: seed.id,
  label: seed.label,
  nameEn: seed.nameEn,
  mandateType: seed.mandateType,
  mandateLabel: MANDATE_LABEL[seed.mandateType],
  agency: seed.agency,
  description: seed.description,
  sourceUrl: seed.sourceUrl,
  certifiedCount: standardNationalCount(seed.id),
}));

const STANDARD_LABEL_BY_ID = new Map<StandardId, string>(FOOD_SAFETY_STANDARDS.map((entry) => [entry.id, entry.label] as const));
const STANDARD_MANDATE_BY_ID = new Map<StandardId, MandateType>(
  FOOD_SAFETY_STANDARDS.map((entry) => [entry.id, entry.mandateType] as const),
);

/* ------------------------------------------------------------------ */
/* กระดานรายสินค้า                                                      */
/* ------------------------------------------------------------------ */

interface CommodityCell {
  provinceCode: string;
  certifiedFarms: number;
  certifiedAreaRai: number;
  organicFarms: number;
  sampledLots: number;
  passedLots: number;
  failedLots: number;
}

const COMMODITY_CELLS = new Map<string, CommodityCell[]>();
for (const model of PROVINCE_MODELS) {
  for (const share of model.shares) {
    const cell = CELL_SEED_INDEX.get(`${model.provinceCode}|${share.commodity.id}`);
    const row: CommodityCell = {
      provinceCode: model.provinceCode,
      certifiedFarms: share.certifiedFarms,
      certifiedAreaRai: share.certifiedAreaRai,
      organicFarms: share.organicFarms,
      sampledLots: cell ? cell.sampledLots : 0,
      passedLots: cell ? cell.passedLots : 0,
      failedLots: cell ? cell.failedLots : 0,
    };
    const list = COMMODITY_CELLS.get(share.commodity.id);
    if (list) list.push(row);
    else COMMODITY_CELLS.set(share.commodity.id, [row]);
  }
}

const COMMODITY_WEIGHT_TOTAL = new Map<string, number>(
  COMMODITY_SEEDS.map((seed) => [
    seed.id,
    FOOD_SAFETY_PROVINCES.reduce((acc, province) => acc + commodityWeight(seed, province), 0),
  ] as const),
);

function buildCommodityBoard(seed: CommoditySeed, provinceCodes: Set<string>): CommodityCertBoard {
  const rows = (COMMODITY_CELLS.get(seed.id) ?? []).filter((row) => provinceCodes.has(row.provinceCode));
  const certifiedFarms = rows.reduce((acc, row) => acc + row.certifiedFarms, 0);
  const certifiedArea = rows.reduce((acc, row) => acc + row.certifiedAreaRai, 0);
  const organicFarms = rows.reduce((acc, row) => acc + row.organicFarms, 0);
  const sampled = rows.reduce((acc, row) => acc + row.sampledLots, 0);
  const passed = rows.reduce((acc, row) => acc + row.passedLots, 0);
  const failed = rows.reduce((acc, row) => acc + row.failedLots, 0);

  // ตัวหารต้องเป็น holdings ภายใน scope เดียวกัน ไม่งั้น ratio จะเกินจริงเมื่อกรองจังหวัด
  const totalWeight = COMMODITY_WEIGHT_TOTAL.get(seed.id) ?? 0;
  const scopeWeight = FOOD_SAFETY_PROVINCES
    .filter((province) => provinceCodes.has(province.code))
    .reduce((acc, province) => acc + commodityWeight(seed, province), 0);
  const scopeHoldings = totalWeight > 0 ? Math.round((seed.holdings * scopeWeight) / totalWeight) : 0;

  const topProvinces = [...rows]
    .filter((row) => row.certifiedFarms > 0)
    .sort((a, b) => b.certifiedFarms - a.certifiedFarms || a.provinceCode.localeCompare(b.provinceCode))
    .slice(0, 3)
    .map((row) => ({
      provinceCode: row.provinceCode,
      provinceName: PROVINCE_MODEL_BY_CODE.get(row.provinceCode)?.provinceName ?? '',
      certifiedFarmCount: row.certifiedFarms,
    }));

  return {
    commodityId: seed.id,
    commodityName: seed.name,
    groupId: seed.groupId,
    gapCertifiedFarmCount: certifiedFarms,
    gapCertifiedAreaRai: certifiedArea,
    organicCertifiedFarmCount: organicFarms,
    certifiedRatio: rateFrom(certifiedFarms, scopeHoldings),
    residueSampledLots: sampled,
    // pass/fail rate มาจากยอดจำนวนเต็มของสินค้านั้นเอง ที่เหลือคือ lot ที่ยังรอผลตรวจ
    residuePassRate: rateFrom(passed, sampled),
    residueFailRate: rateFrom(failed, sampled),
    mandateType: seed.mandateType,
    topProvinces,
  };
}

/** กระดาน baseline ทั้งประเทศ (ไม่กรอง) — หน้าจอใช้เป็นค่าตั้งต้น */
export const FOOD_SAFETY_COMMODITIES: CommodityCertBoard[] = COMMODITY_SEEDS.map((seed) =>
  buildCommodityBoard(seed, new Set(PROVINCE_MODELS.map((model) => model.provinceCode))),
);

/* ------------------------------------------------------------------ */
/* ห้องปฏิบัติการตรวจสารตกค้าง                                          */
/* ------------------------------------------------------------------ */

const MRL_GROUPS = [
  'ออร์โนฟอสเฟต', 'คาร์บาเมต', 'ไพรีทรอยด์', 'ไทอะซุตราม', 'ไดไธโอคาร์บาเมต',
  'คลอร์ไพริฟอส', 'ไกลโฟเซต', 'อะทราซีน', 'ไนโตรฟูราน', 'สารกลุ่มต้านจุลชีพ',
  'มาลาไคต์กรีน', 'อะฟลาทอกซิน (สารพิษจากเชื้อรา)',
];

export const FOOD_SAFETY_MRL_GROUPS: string[] = MRL_GROUPS;

interface LabSeed {
  labId: string;
  labName: string;
  region: RegionKey;
  weight: number;
  primaryMrlGroup: string;
}

const LAB_SEEDS: LabSeed[] = [
  { labId: 'LAB-CEN-01', labName: 'ห้องปฏิบัติการกลาง กรมวิชาการเกษตร', region: 'central', weight: 1.5, primaryMrlGroup: 'คาร์บาเมต' },
  { labId: 'LAB-CEN-02', labName: 'หน่วยตรวจวิเคราะห์สารตกค้างภาคกลาง', region: 'central', weight: 1.2, primaryMrlGroup: 'ออร์โนฟอสเฟต' },
  { labId: 'LAB-CEN-03', labName: 'หน่วยตรวจวิเคราะห์ผลิตภัณฑ์ปศุสัตว์', region: 'central', weight: 0.8, primaryMrlGroup: 'สารกลุ่มต้านจุลชีพ' },
  { labId: 'LAB-NOR-01', labName: 'หน่วยตรวจวิเคราะห์สารตกค้างภาคเหนือ', region: 'north', weight: 1.1, primaryMrlGroup: 'ไพรีทรอยด์' },
  { labId: 'LAB-NOR-02', labName: 'ห้องปฏิบัติการเครือข่ายภาคเหนือตอนล่าง', region: 'north', weight: 0.9, primaryMrlGroup: 'ไดไธโอคาร์บาเมต' },
  { labId: 'LAB-NE-01', labName: 'หน่วยตรวจวิเคราะห์สารตกค้างภาคตะวันออกเฉียงเหนือ', region: 'northeast', weight: 1.15, primaryMrlGroup: 'อะทราซีน' },
  { labId: 'LAB-NE-02', labName: 'ห้องปฏิบัติการเครือข่ายภาคตะวันออกเฉียงเหนือตอนใต้', region: 'northeast', weight: 0.85, primaryMrlGroup: 'ไกลโฟเซต' },
  { labId: 'LAB-EAS-01', labName: 'หน่วยตรวจวิเคราะห์สารตกค้างผลไม้ภาคตะวันออก', region: 'east', weight: 1.4, primaryMrlGroup: 'ออร์โนฟอสเฟต' },
  { labId: 'LAB-EAS-02', labName: 'ห้องปฏิบัติการเครือข่ายผู้ส่งออกภาคตะวันออก', region: 'east', weight: 1, primaryMrlGroup: 'ไนโตรฟูราน' },
  { labId: 'LAB-SOU-01', labName: 'หน่วยตรวจวิเคราะห์สารตกค้างภาคใต้ฝั่งอ่าวไทย', region: 'south', weight: 1.05, primaryMrlGroup: 'ไนโตรฟูราน' },
  { labId: 'LAB-SOU-02', labName: 'หน่วยตรวจวิเคราะห์สัตว์น้ำภาคใต้', region: 'south', weight: 0.95, primaryMrlGroup: 'มาลาไคต์กรีน' },
  { labId: 'LAB-SOU-03', labName: 'ห้องปฏิบัติการเครือข่ายอันดามัน', region: 'south', weight: 0.7, primaryMrlGroup: 'คลอร์ไพริฟอส' },
];

/** labs เป็น partition ที่สามของ universe เดียวกัน: แจกยอดที่ปิดผล "รายภาค" ให้แล็บในภาคนั้น
 *  ยอดรวมแล็บทั้งประเทศเท่ากับ passed+failed ทั้งประเทศ และเมื่อกรอง region ยอดก็ยังผูกกันอยู่ */
function buildResidueLabs(): ResidueLabStat[] {
  const regionFinalised = new Map<RegionKey, number>();
  for (const model of PROVINCE_MODELS) {
    const finalised = model.passedLotCount + model.failedLotCount;
    regionFinalised.set(model.region, (regionFinalised.get(model.region) ?? 0) + finalised);
  }

  const rows: ResidueLabStat[] = [];
  for (const region of REGIONS) {
    const labs = LAB_SEEDS.filter((lab) => lab.region === region.key);
    if (labs.length === 0) continue;
    const lots = allocate(regionFinalised.get(region.key) ?? 0, labs.map((lab) => lab.weight));
    labs.forEach((lab, index) => {
      const tested = lots[index];
      const passed = Math.min(tested, Math.round((tested * between(`fs:lab:${lab.labId}:pass`, 90.5, 98.6)) / 100));
      rows.push({
        labId: lab.labId,
        labName: lab.labName,
        region: lab.region,
        regionLabel: REGION_LABEL_BY_KEY[lab.region],
        testedLots: tested,
        passedLots: passed,
        failedLots: tested - passed,
        passRate: rateFrom(passed, tested),
        primaryMrlGroup: lab.primaryMrlGroup,
      });
    });
  }
  return rows;
}

const RESIDUE_LABS: ResidueLabStat[] = buildResidueLabs();

/* ------------------------------------------------------------------ */
/* ล็อตตรวจสอบย้อนกลับและใบรับรอง (ชื่อทั้งหมดเป็นชื่อสมมติ)              */
/* ------------------------------------------------------------------ */

const DISTRICT_BY_PROVINCE: Record<string, string> = {
  '10': 'หนองจอก', '11': 'บางพลี', '12': 'ไทรน้อย', '13': 'ลำลูกกา', '14': 'บางไทร',
  '15': 'ป่าโมก', '16': 'ท่าวุ้ง', '17': 'บางระจัน', '18': 'มโนรมย์', '19': 'บ้านหมี่',
  '20': 'พนัสนิคม', '21': 'แกลง', '22': 'มะขาม', '23': 'เขาสมิง', '24': 'บ้านโพธิ์',
  '25': 'กบินทร์บุรี', '26': 'ปากพล่อย', '27': 'อรัญประเทศ', '30': 'ปากช่อง', '31': 'นางรอง',
  '32': 'ปราสาท', '33': 'ขุขันธ์', '34': 'วารินชำราบ', '35': 'เลิงนกทา', '36': 'ภูเขียว',
  '37': 'ชานุมาน', '38': 'พรเจริญ', '39': 'นากลาง', '40': 'น้ำพอง', '41': 'บ้านดุง',
  '42': 'วังสะพุง', '43': 'โพนพิสัย', '44': 'กันทรวิชัย', '45': 'เสลภูมิ', '46': 'นามน',
  '47': 'ส่องดาว', '48': 'ท่าอุเทน', '49': 'หนองสูง', '50': 'สารภี', '51': 'บ้านธิ',
  '52': 'เกาะคา', '53': 'พิชัย', '54': 'สอง', '55': 'ปัว', '56': 'จุน', '57': 'ฝาง',
  '58': 'ปาย', '60': 'ท่าตะโก', '61': 'ลานสัก', '62': 'พรานกระต่าย', '63': 'บ้านตาก',
  '64': 'ศรีสัชนาลัย', '65': 'วังทอง', '66': 'โพทะเล', '67': 'เข็กน้อย', '70': 'บ้านโป่ง',
  '71': 'บ่อพลอย', '72': 'สองพี่น้อง', '73': 'สามพราน', '74': 'บ้านแพ้ว', '75': 'อัมพวา',
  '76': 'ท่ายาง', '77': 'กุยบุรี', '80': 'ฉวาง', '81': 'อ่าวลึก', '82': 'กะเปอร์',
  '83': 'ถลาง', '84': 'กาญจนดิษฐ์', '85': 'กระบุรี', '86': 'หลังสวน', '90': 'สทิงพระ',
  '91': 'ละงู', '92': 'ห้วยยอด', '93': 'ควนขนุน', '94': 'มายอ', '95': 'บันนังสตา',
  '96': 'ตากใบ',
};

function districtOf(province: FoodSafetyProvinceOption): string {
  // ทุกจังหวัดมี "อำเภอเมือง" จริง จึงใช้เป็น fallback ที่ไม่อ้างข้อมูลทะเบียนละเอียด
  return DISTRICT_BY_PROVINCE[province.code] ?? `เมือง${province.name}`;
}

const CROP_ORG_WORDS = ['สวน', 'แปลงใหญ่', 'กลุ่มผู้ปลูก'];
const LIVESTOCK_ORG_WORDS = ['ฟาร์ม'];
const AQUACULTURE_ORG_WORDS = ['กลุ่มผู้เลี้ยง', 'ฟาร์มเลี้ยง'];
const COOP_WORDS = ['สหกรณ์การเกษตร', 'วิสาหกิจชุมชน'];

const HOLDER_FIRST_NAMES = ['นางสมพร', 'นายวิชัย', 'นางสาวอรทัย', 'นายประเสริฐ', 'นายกมล', 'นางมาลี', 'นายธนา', 'นางจรรยา'];
const HOLDER_SURNAMES = ['รักดิน', 'ใจดี', 'ศรีสวน', 'ทองแท้', 'สุขโข', 'วงศ์เจริญ', 'พูนผล', 'แสงทอง'];

const DESTINATIONS = ['กรุงเทพมหานคร', 'ตลาดไท', 'ท่าเรือแหลมฉบัง', 'เชียงใหม่', 'หาดใหญ่', 'ระนอง'];

const STAGE_LABELS: Record<TraceabilityStage['stage'], string> = {
  farm: 'แปลง/ฟาร์มผลิตต้นทาง',
  collection: 'จุดรวบรวมและคัดเบื้องต้น',
  packing: 'โรงคัดบรรจุ (PCS)',
  transport: 'ขนส่งควบคุมอุณหภูมิ',
  retail: 'จุดจำหน่าย/ส่งออก',
};

/** จังหวัดนำร่องได้ 2 lot เพื่อให้เห็นหลายมาตรฐาน/หลายสถานะในจังหวัดเดียว */
const PILOT_PROVINCE_CODES = new Set([
  '22', '23', '21', '86', '84', '30', '40', '14', '72', '60',
  '50', '57', '65', '70', '71', '76', '16', '26', '90', '92',
]);

function commodityOptionsFor(provinceCode: string, standardId: StandardId): CommoditySeed[] {
  const model = PROVINCE_MODEL_BY_CODE.get(provinceCode);
  if (!model) return [];
  const allowedGroups = GROUP_FOR_STANDARD[standardId];
  return model.shares
    .filter((share) => share.certifiedFarms > 0 && allowedGroups.includes(share.commodity.groupId))
    .map((share) => share.commodity);
}

function chooseStandard(province: FoodSafetyProvinceOption, recordKey: string): StandardId {
  const model = PROVINCE_MODEL_BY_CODE.get(province.code);
  if (!model) return 'gap_crop';
  const candidates: Array<{ id: StandardId; weight: number }> = [
    { id: 'gap_crop', weight: 40 },
    { id: 'organic_thailand', weight: model.organicFarmCount > 20 ? 18 : 2 },
    { id: 'gap_livestock', weight: model.livestockFarms > 400 ? 15 : 1 },
    { id: 'gap_fishery', weight: model.fisheryFarms > 200 ? 12 : 1 },
    { id: 'chemical_residue', weight: 10 },
  ];
  // เก็บเฉพาะมาตรฐานที่มีสินค้าจริงในจังหวัดนั้น ป้องกัน lot ที่ไม่มีทางเกิดขึ้น
  const usable = candidates.filter((entry) => commodityOptionsFor(province.code, entry.id).length > 0);
  if (usable.length === 0) return 'gap_crop';
  const parts = allocate(100, usable.map((entry) => entry.weight));
  const pool: StandardId[] = [];
  usable.forEach((entry, index) => {
    for (let count = 0; count < parts[index]; count += 1) pool.push(entry.id);
  });
  return pool.length > 0 ? pick(`${recordKey}:standard`, pool) : 'gap_crop';
}

function buildFarmName(key: string, commodity: CommoditySeed, province: FoodSafetyProvinceOption): string {
  const place = districtOf(province);
  if (commodity.groupId === 'livestock') return `${pick(key, LIVESTOCK_ORG_WORDS)}${commodity.name}${place}`;
  if (commodity.groupId === 'aquaculture') return `${pick(key, AQUACULTURE_ORG_WORDS)}${commodity.name}${place}`;
  if (unit(`${key}:coop`) < 0.35) return `${pick(key, COOP_WORDS)}${place}`;
  return `${pick(key, CROP_ORG_WORDS)}${commodity.name}${place}`;
}

function buildHolderName(key: string, farmName: string): string {
  if (unit(key) < 0.45) return farmName;
  return `${pick(`${key}:first`, HOLDER_FIRST_NAMES)} ${pick(`${key}:last`, HOLDER_SURNAMES)}`;
}

interface CertificateWindow {
  issueDate: string;
  expiryDate: string;
  harvestDate: string;
  status: CertStatus;
}

/**
 * วันที่ออก/เก็บเกี่ยว/หมดอายุต้องผูกกันเอง: เลือกวันเก็บเกี่ยวย้อนหลังจากวันอ้างอิง
 * แล้วถอยวันออกใบรับรองกลับไปตามอายุมาตรฐาน (ส่วนน้อยถอยเกินอายุ = ใบรับรองหมดอายุก่อนเก็บเกี่ยว)
 * วิธีนี้ status derive จากวันที่จริง ไม่ต้องสุ่มสถานะแยกกัน
 */
const HARVEST_LOOKBACK_MIN_DAYS = 12;
const HARVEST_LOOKBACK_MAX_DAYS = 172;
const LAPSED_CERT_SHARE = 0.08;

function buildCertificateWindow(key: string, validityDays: number): CertificateWindow {
  const lookback = HARVEST_LOOKBACK_MIN_DAYS
    + Math.floor(unit(`${key}:harvest`) * (HARVEST_LOOKBACK_MAX_DAYS - HARVEST_LOOKBACK_MIN_DAYS + 1));
  const harvestEpoch = DATA_AS_OF_EPOCH - lookback;
  const lapsed = unit(`${key}:lapsed`) < LAPSED_CERT_SHARE;
  const withinValidityMax = Math.max(1, Math.min(validityDays - 1, lookback - 2));
  const daysBeforeHarvest = lapsed
    ? validityDays + 2 + Math.floor(unit(`${key}:lapsegap`) * 88)
    : 2 + Math.floor(unit(`${key}:issue`) * (withinValidityMax - 2));
  const issueEpoch = harvestEpoch - daysBeforeHarvest;
  const expiryEpoch = issueEpoch + validityDays;

  let status: CertStatus;
  if (expiryEpoch < DATA_AS_OF_EPOCH) status = 'expired';
  else if (expiryEpoch - DATA_AS_OF_EPOCH <= 90) status = 'pending_renewal';
  else if (unit(`${key}:suspend`) < 0.05) status = 'suspended';
  else status = 'active';

  return {
    issueDate: isoFromEpochDays(issueEpoch),
    expiryDate: isoFromEpochDays(expiryEpoch),
    harvestDate: isoFromEpochDays(harvestEpoch),
    status,
  };
}

function buildChain(key: string, window: CertificateWindow, commodity: CommoditySeed, province: FoodSafetyProvinceOption): TraceabilityStage[] {
  const district = `อ.${districtOf(province)}`;
  const retail = `จุดจำหน่าย ${pick(`${key}:retail`, DESTINATIONS)}`;
  const stages: TraceabilityStage['stage'][] =
    commodity.groupId === 'livestock'
      ? ['farm', 'collection', 'transport', 'retail']
      : commodity.groupId === 'aquaculture'
        ? ['farm', 'collection', 'transport', 'retail']
        : unit(`${key}:longchain`) < 0.45
          ? ['farm', 'collection', 'packing', 'transport', 'retail']
          : ['farm', 'packing', 'transport', 'retail'];

  const locationFor = (stage: TraceabilityStage['stage']): string => {
    switch (stage) {
      case 'farm':
        return `${district} ${province.name}`;
      case 'collection':
        return `ศูนย์รวบรวมผลผลิต ${district} ${province.name}`;
      case 'packing':
        return `โรงคัดบรรจุ (PCS) ${district} ${province.name}`;
      case 'transport':
        return `ขนส่งควบคุมอุณหภูมิ ${province.name} – ${pick(`${key}:dest`, DESTINATIONS)}`;
      case 'retail':
      default:
        return retail;
    }
  };

  let cursor = epochDays(window.harvestDate);
  return stages.map((stage, index) => {
    if (index > 0) cursor += 1 + Math.floor(unit(`${key}:gap:${index}`) * 3);
    // ห้ามบันทึกเหตุการณ์ในอนาคตเกินวันอ้างอิง
    return {
      stage,
      stageLabel: STAGE_LABELS[stage],
      location: locationFor(stage),
      date: isoFromEpochDays(Math.min(cursor, DATA_AS_OF_EPOCH)),
    };
  });
}

interface LotRecordSeed {
  province: FoodSafetyProvinceOption;
  sequence: number;
  standardId: StandardId;
  commodity: CommoditySeed;
  farmCode: string;
  farmName: string;
  key: string;
}

function buildLotRecordSeeds(): LotRecordSeed[] {
  const records: LotRecordSeed[] = [];
  for (const province of FOOD_SAFETY_PROVINCES) {
    const lotCount = PILOT_PROVINCE_CODES.has(province.code) ? 2 : 1;
    for (let sequence = 1; sequence <= lotCount; sequence += 1) {
      const key = `fs:lot:${province.code}:${sequence}`;
      const standardId = chooseStandard(province, key);
      const commodities = commodityOptionsFor(province.code, standardId);
      if (commodities.length === 0) continue;
      const commodity = pick(`${key}:commodity`, commodities);
      records.push({
        province,
        sequence,
        standardId,
        commodity,
        farmCode: `FARM-${province.code}-${String(sequence).padStart(3, '0')}`,
        farmName: buildFarmName(`${key}:farm`, commodity, province),
        key,
      });
    }
  }
  return records;
}

const LOT_RECORD_SEEDS: LotRecordSeed[] = buildLotRecordSeeds();

/** lotCode ใช้ token ของมาตรฐานที่รับรอง lot นั้น (GAP/ORG/MRL) ไม่ใส่คำว่า GAP ผสมกับ lot อินทรีย์ */
function buildLotCode(standardId: StandardId, provinceCode: string, harvestDate: string, sequence: number): string {
  const token = standardId === 'organic_thailand' ? 'ORG' : standardId === 'chemical_residue' ? 'MRL' : 'GAP';
  const stamp = harvestDate.replace(/-/g, '').slice(2);
  return `TADIH-${token}-${provinceCode}-${stamp}-${String(sequence).padStart(3, '0')}`;
}

function certificateNoFor(seed: StandardSeed, provinceCode: string, sequence: number): string {
  return `${seed.certPrefix}-${provinceCode}-${String(sequence).padStart(4, '0')}`;
}

function residueResultFor(key: string, model: ProvinceModel): ResidueResult {
  const inspected = Math.max(1, model.inspectedLotCount);
  const failShare = clamp(model.failedLotCount / inspected, 0.004, 0.2);
  const pendingShare = clamp(model.pendingLotCount / inspected, 0.004, 0.08);
  const roll = unit(`${key}:residue`);
  if (roll < failShare) return 'fail';
  if (roll < failShare + pendingShare) return 'pending';
  return 'pass';
}

interface BuiltPair {
  lot: TraceabilityLot;
  certificate: CertificateRecord;
}

function buildLotAndCertificate(record: LotRecordSeed): BuiltPair | null {
  const standard = STANDARD_BY_ID.get(record.standardId);
  const model = PROVINCE_MODEL_BY_CODE.get(record.province.code);
  if (!standard || !model) return null;

  const window = buildCertificateWindow(record.key, standard.validityDays);
  const lotCode = buildLotCode(record.standardId, record.province.code, window.harvestDate, record.sequence);
  const residueResult = residueResultFor(record.key, model);

  const lot: TraceabilityLot = {
    lotCode,
    qrPayload: `https://trace.hub.example/lot/${lotCode}`,
    farmCode: record.farmCode,
    farmName: record.farmName,
    standardId: record.standardId,
    standardLabel: STANDARD_LABEL_BY_ID.get(record.standardId) ?? record.standardId,
    mandateType: STANDARD_MANDATE_BY_ID.get(record.standardId) ?? 'voluntary',
    commodityName: record.commodity.name,
    provinceCode: record.province.code,
    provinceName: record.province.name,
    region: record.province.region,
    harvestDate: window.harvestDate,
    certifiedDate: window.issueDate,
    expiryDate: window.expiryDate,
    status: window.status,
    statusLabel: STATUS_LABEL[window.status],
    residueResult,
    residueMrlGroup: record.commodity.mrlGroup,
    chain: buildChain(record.key, window, record.commodity, record.province),
  };

  const certificate: CertificateRecord = {
    certificateNo: certificateNoFor(standard, record.province.code, record.sequence),
    holderName: buildHolderName(`${record.key}:holder`, record.farmName),
    farmCode: record.farmCode,
    standardId: record.standardId,
    standardLabel: standard.label,
    mandateType: standard.mandateType,
    status: window.status,
    statusLabel: STATUS_LABEL[window.status],
    commodityNames: [record.commodity.name],
    provinceCode: record.province.code,
    provinceName: record.province.name,
    region: record.province.region,
    issueDate: window.issueDate,
    expiryDate: window.expiryDate,
  };

  return { lot, certificate };
}

/** ใบรับรองเพิ่มเติมของจังหวัดนำร่อง (คนละมาตรฐานกับ lot เพื่อให้ค้นหาได้หลายแบบ) */
function buildExtraCertificates(): CertificateRecord[] {
  const records: CertificateRecord[] = [];
  for (const province of FOOD_SAFETY_PROVINCES) {
    if (!PILOT_PROVINCE_CODES.has(province.code)) continue;
    const key = `fs:cert:${province.code}:extra`;
    const standardId = chooseStandard(province, key);
    const standard = STANDARD_BY_ID.get(standardId);
    if (!standard) continue;
    const commodities = commodityOptionsFor(province.code, standardId);
    if (commodities.length === 0) continue;
    const sequence = 900 + Number(province.code);
    const window = buildCertificateWindow(key, standard.validityDays);
    const second = commodities.length > 1 ? commodities[1].name : commodities[0].name;
    records.push({
      certificateNo: certificateNoFor(standard, province.code, sequence),
      holderName: `${pick(key, COOP_WORDS)}${districtOf(province)}`,
      farmCode: `FARM-${province.code}-${String(sequence).padStart(3, '0')}`,
      standardId,
      standardLabel: standard.label,
      mandateType: standard.mandateType,
      status: window.status,
      statusLabel: STATUS_LABEL[window.status],
      commodityNames: [commodities[0].name, second],
      provinceCode: province.code,
      provinceName: province.name,
      region: province.region,
      issueDate: window.issueDate,
      expiryDate: window.expiryDate,
    });
  }
  return records;
}

const LOT_CERT_PAIRS: BuiltPair[] = LOT_RECORD_SEEDS.flatMap((record) => {
  const pair = buildLotAndCertificate(record);
  return pair ? [pair] : [];
});

export const FOOD_SAFETY_TRACEABILITY_LOTS: TraceabilityLot[] = LOT_CERT_PAIRS.map((pair) => pair.lot);

export const FOOD_SAFETY_CERTIFICATES: CertificateRecord[] = [
  ...LOT_CERT_PAIRS.map((pair) => pair.certificate),
  ...buildExtraCertificates(),
];

/* ------------------------------------------------------------------ */
/* แหล่งข้อมูลและข้อความกำกับสิทธิ์                                      */
/* ------------------------------------------------------------------ */

export const FOOD_SAFETY_SOURCES: FoodSafetySourceRef[] = [
  {
    id: 'onab',
    name: 'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ (มกอช.)',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'ทะเบียนมาตรฐาน มกช./ระบบอินทรีย์ และรายการมาตรฐานบังคับ ใช้เป็น metadata discovery เท่านั้น',
    sourceUrl: 'https://www.onab.go.th',
    licenseStatus: 'pending',
  },
  {
    id: 'doa',
    name: 'กรมวิชาการเกษตร (DOA)',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'ทะเบียนแปลง GAP พืชและฟาร์มอินทรีย์ที่รับรอง รวมถึงห้องปฏิบัติการกลางตรวจสารตกค้าง',
    sourceUrl: 'https://www.doa.go.th',
    licenseStatus: 'pending',
  },
  {
    id: 'dld',
    name: 'กรมปศุสัตว์ (DLD)',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'ทะเบียนฟาร์มปศุสัตว์มาตรฐาน GAP (grain คนละชุดกับฝั่งพืช)',
    sourceUrl: 'https://www.dld.go.th',
    licenseStatus: 'pending',
  },
  {
    id: 'dof',
    name: 'กรมประมง (DOF)',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'ทะเบียนฟาร์มเพาะเลี้ยงสัตว์น้ำ GAP และผลตรวจสารตกค้างในสัตว์น้ำ',
    sourceUrl: 'https://www4.fisheries.go.th',
    licenseStatus: 'pending',
  },
  {
    id: 'acfs',
    name: 'สำนักงานคณะกรรมการอาหารและยา (อย.)',
    agencyLabel: 'กระทรวงสาธารณสุข',
    role: 'ประกาศเกณฑ์สารตกค้างสูงสุด (MRL) ที่ใช้บังคับกับสินค้าอาหาร',
    sourceUrl: 'https://www.acfs.go.th',
    licenseStatus: 'pending',
  },
  {
    id: 'trace-hub',
    name: 'ระบบตรวจสอบย้อนกลับภายใน Data Hub (สาธิต)',
    agencyLabel: 'Thailand Agricultural Data Hub',
    role: 'ออก lot code/QR payload จากโมเดลตัวอย่าง ยังไม่ได้เชื่อมทะเบียนใบรับรองจริง',
    sourceUrl: null,
    licenseStatus: 'pending',
  },
];

const SOURCE_IDS_FOR_STANDARD: Record<StandardId, string[]> = {
  gap_crop: ['doa', 'onab'],
  gap_livestock: ['dld', 'onab'],
  gap_fishery: ['dof', 'onab'],
  organic_thailand: ['doa', 'onab'],
  chemical_residue: ['acfs', 'onab'],
};

export const FOOD_SAFETY_WARNINGS: string[] = [
  'ตัวเลขทุกชุดใน module นี้เป็นข้อมูลตัวอย่างแบบ deterministic เพื่อสาธิตหน้าจอและการเชื่อมต่อ API เท่านั้น ไม่ใช่สถิติทางการที่ผ่านการทวนสอบ',
  'สิทธิ์เผยแพร่ตัวเลขจริงของ มกอช. กรมวิชาการเกษตร กรมปศุสัตว์ กรมประมง และ อย. ยังอยู่ระหว่างตรวจสอบ (ทุกแหล่งเป็น licenseStatus: pending) จึงออกเฉพาะ metadata กับค่าตัวอย่างภายใต้ meta.access = metadata_only',
  'รายชื่อเกษตรกร ฟาร์ม สหกรณ์ ห้องปฏิบัติการ lot code และ QR payload ทั้งหมดเป็นชื่อสมมติ ห้ามตีความเป็นหน่วยงานหรือผู้ได้รับใบรับรองที่มีอยู่จริง',
  'provinceStats นับเฉพาะ grain GAP พืช + Organic Thailand จำนวนฟาร์ม GAP ปศุสัตว์/ประมงมีคนละทะเบียนและคนละหน่วยนับ จึงแสดงระดับประเทศใน standards[].certifiedCount เท่านั้น ห้ามบวกซ้ำกับยอดจังหวัด',
  'กระดานรายสินค้ารวมยอดฟาร์มปศุสัตว์/สัตว์น้ำซึ่งไม่อยู่ใน column GAP ของ provinceStats จึงห้ามเอาผลรวมของ commodityBoard มาเทียบกับ summary',
  'การมีรหัสจังหวัดครบ 77 แถวคือขอบเขต crosswalk ของตารางอ้างอิง ไม่ใช่ข้อสรุปว่ามีการตรวจรับรองหรือตรวจสารตกค้างจริงครบทุกจังหวัด',
  'จังหวัด สินค้า และห้องปฏิบัติการเป็นสาม partition ของ universe ล็อตตรวจเดียวกัน ยอดรวมตรงกัน แต่อัตราผ่านต่างกันตามความเสี่ยงของสินค้าได้ ห้ามเฉลี่ย rate ข้ามแกน',
  'residueLabs นับยอดระดับภาค (แล็บหนึ่งแห่งรับงานหลายจังหวัด) ตัวกรอง provinceCode จึงไม่ตัดยอดแล็บให้เหลือเฉพาะจังหวัดนั้น และไม่มี grain รายสินค้าบนแกนห้องปฏิบัติการ',
  'อัตราผ่าน/ตกค้างคำนวณจากจำนวนเต็มล็อตเสมอ (inspected = passed + failed + pending) ผลบวก percentage แต่ละแกนอาจไม่เท่ากับ 100.00 เกินกว่า 0.02 จากการปัดแต่ละอัตราแยกกัน',
];

/* ------------------------------------------------------------------ */
/* ค้นหา (Thai, case-insensitive, ตามลำดับความสำคัญ)                     */
/* ------------------------------------------------------------------ */

function normalizeQuery(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

/** 1 = ตรงทั้งเลข, 2 = หน้าคำ, 3 = ตรงบางส่วน, 4 = จังหวัด, 5 = ชื่อผู้ถือ/ฟาร์ม */
function scoreRecord(
  query: string,
  primaryCode: string,
  secondaryCode: string,
  provinceName: string,
  holderNameValue: string,
): number | null {
  const primary = primaryCode.toLowerCase();
  const secondary = secondaryCode.toLowerCase();
  if (primary === query) return 1;
  if (primary.startsWith(query) || secondary.startsWith(query)) return 2;
  if (primary.includes(query) || secondary.includes(query)) return 3;
  if (provinceName.toLowerCase().includes(query)) return 4;
  if (holderNameValue.toLowerCase().includes(query)) return 5;
  return null;
}

/* ------------------------------------------------------------------ */
/* ตัวกรอง → payload                                                     */
/* ------------------------------------------------------------------ */

function asToken(value: string | undefined): string {
  const raw = (value ?? '').normalize('NFC').trim();
  if (!raw || raw.toLowerCase() === 'all' || raw === 'ทั้งหมด') return 'all';
  return raw;
}

function asRegion(value: RegionKey | 'all' | undefined): RegionKey | 'all' {
  return value && value !== 'all' ? value : 'all';
}

function asStandard(value: StandardId | 'all' | undefined): StandardId | 'all' {
  if (value && value !== 'all' && STANDARD_BY_ID.has(value)) return value;
  return 'all';
}

function asMandate(value: MandateType | 'all' | undefined): MandateType | 'all' {
  return value === 'mandatory' || value === 'voluntary' ? value : 'all';
}

function provinceHasCommodity(model: ProvinceModel, commodityId: string): boolean {
  return model.shares.some((share) => share.commodity.id === commodityId && share.certifiedFarms > 0);
}

/** มาตรฐานที่เลือกครอบคลุม group ไหนของกระดานสินค้า */
function commodityInStandard(seed: CommoditySeed, standardId: StandardId | 'all'): boolean {
  if (standardId === 'all') return true;
  return GROUP_FOR_STANDARD[standardId].includes(seed.groupId);
}

export function buildFoodSafetyDashboard(filters: FoodSafetyFilters = {}): FoodSafetyDashboardPayload {
  const provinceCode = asToken(filters.provinceCode);
  const region = asRegion(filters.region);
  const standardId = asStandard(filters.standardId);
  const mandateType = asMandate(filters.mandateType);

  const rawCommodity = asToken(filters.commodityId);
  const commodityId = rawCommodity !== 'all' && !COMMODITY_BY_ID.has(rawCommodity)
    ? (lookupCommodityAlias(rawCommodity) ?? rawCommodity)
    : rawCommodity;
  const unknownCommodity = commodityId !== 'all' && !COMMODITY_BY_ID.has(commodityId);
  const scopedCommodity = commodityId !== 'all' && !unknownCommodity ? commodityId : '';
  const commoditySeed = scopedCommodity ? COMMODITY_BY_ID.get(scopedCommodity) : undefined;

  // สินค้าบังคับ + กรอบสมัครใจ (หรือกลับกัน) เป็นคำถามที่ไม่มีคำตอบจริง: คืนชุดว่างทั้งชุด
  // ดีกว่าคงแถวจังหวัดไว้แล้วให้หน้าจอสรุปเอง
  const mandateConflict = mandateType !== 'all' && !!commoditySeed && commoditySeed.mandateType !== mandateType;

  const search = (filters.search ?? '').normalize('NFC').trim();
  const query = normalizeQuery(search);

  // 1) ขอบเขตจังหวัด: region/provinceCode และ (ถ้าระบุสินค้าที่รู้จัก) ต้องมีสินค้านั้นจริง
  const scopeModels = mandateConflict ? [] : PROVINCE_MODELS.filter((model) => {
    if (provinceCode !== 'all' && model.provinceCode !== provinceCode) return false;
    if (region !== 'all' && model.region !== region) return false;
    if (scopedCommodity && !provinceHasCommodity(model, scopedCommodity)) return false;
    return true;
  });
  const scopeCodes = new Set(scopeModels.map((model) => model.provinceCode));

  // 2) standards ที่เลือก; certifiedCount คงนิยาม "ทั้งประเทศ" ตามสัญญา field
  const standards = FOOD_SAFETY_STANDARDS.filter((standard) => {
    if (standardId !== 'all' && standard.id !== standardId) return false;
    if (mandateType !== 'all' && standard.mandateType !== mandateType) return false;
    return true;
  });

  // 3) commodityBoard คำนวณใหม่จาก cell ภายใน scope (ไม่ใช่การหยิบ baseline แล้วตัดทอน)
  const commodityBoard = COMMODITY_SEEDS
    .filter((seed) => {
      if (mandateType !== 'all' && seed.mandateType !== mandateType) return false;
      if (scopedCommodity && seed.id !== scopedCommodity) return false;
      return commodityInStandard(seed, standardId);
    })
    .map((seed) => buildCommodityBoard(seed, scopeCodes));

  // 4) provinceStats (ยอดตรวจนับ derive จาก cell แล้ว)
  //    เมื่อกรองรายสินค้า แถวจังหวัดต้องสลับเป็น slice ของ cell นั้น มิฉะนั้น summary
  //    (รวมจากแถว) จะไม่เท่ากับ commodityBoard ทั้งคู่เป็น partition ของ universe ล็อตเดียวกัน
  const provinceStats: ProvinceCertStat[] = scopeModels.map((model) => {
    if (!scopedCommodity) {
      return {
        provinceCode: model.provinceCode,
        provinceName: model.provinceName,
        region: model.region,
        regionLabel: model.regionLabel,
        gapFarmCount: model.gapFarmCount,
        gapAreaRai: model.gapAreaRai,
        organicFarmCount: model.organicFarmCount,
        organicAreaRai: model.organicAreaRai,
        totalCertifiedFarmCount: model.totalCertifiedFarmCount,
        inspectedLotCount: model.inspectedLotCount,
        passedLotCount: model.passedLotCount,
        failedLotCount: model.failedLotCount,
        pendingLotCount: model.pendingLotCount,
        passRate: model.passRate,
        traceableLotCount: model.traceableLotCount,
        traceabilityRate: model.traceabilityRate,
        dominantCommodity: model.dominantCommodity,
      };
    }

    const share = model.shares.find((candidate) => candidate.commodity.id === scopedCommodity);
    const cell = CELL_SEED_INDEX.get(`${model.provinceCode}|${scopedCommodity}`);
    const inspected = cell ? cell.sampledLots : 0;
    const passed = cell ? cell.passedLots : 0;
    const failed = cell ? cell.failedLots : 0;
    const pending = inspected - passed - failed;
    const traceable = Math.min(inspected, Math.round((inspected * model.tracePct) / 100));
    return {
      provinceCode: model.provinceCode,
      provinceName: model.provinceName,
      region: model.region,
      regionLabel: model.regionLabel,
      gapFarmCount: share ? share.certifiedFarms : 0,
      gapAreaRai: share ? share.certifiedAreaRai : 0,
      organicFarmCount: share ? share.organicFarms : 0,
      organicAreaRai: share ? share.organicAreaRai : 0,
      totalCertifiedFarmCount: share ? share.certifiedFarms + share.organicFarms : 0,
      inspectedLotCount: inspected,
      passedLotCount: passed,
      failedLotCount: failed,
      pendingLotCount: pending,
      passRate: rateFrom(passed, inspected),
      traceableLotCount: traceable,
      traceabilityRate: rateFrom(traceable, inspected),
      dominantCommodity: share ? share.commodity.name : model.dominantCommodity,
    };
  });

  // 5) lot / certificate / lab pools
  const commodityNameForFilter = commoditySeed?.name ?? '';

  const traceabilityLots = FOOD_SAFETY_TRACEABILITY_LOTS.filter((lot) => {
    if (!scopeCodes.has(lot.provinceCode)) return false;
    if (standardId !== 'all' && lot.standardId !== standardId) return false;
    if (mandateType !== 'all' && lot.mandateType !== mandateType) return false;
    if (commodityNameForFilter && lot.commodityName !== commodityNameForFilter) return false;
    return true;
  });

  const certificates = FOOD_SAFETY_CERTIFICATES.filter((certificate) => {
    if (!scopeCodes.has(certificate.provinceCode)) return false;
    if (standardId !== 'all' && certificate.standardId !== standardId) return false;
    if (mandateType !== 'all' && certificate.mandateType !== mandateType) return false;
    if (commodityNameForFilter && !certificate.commodityNames.includes(commodityNameForFilter)) return false;
    return true;
  });

  const provinceRegion = provinceCode !== 'all' ? PROVINCE_MODEL_BY_CODE.get(provinceCode)?.region : undefined;
  const residueLabs = mandateConflict ? [] : RESIDUE_LABS.filter((lab) => {
    if (region !== 'all' && lab.region !== region) return false;
    if (provinceRegion !== undefined && lab.region !== provinceRegion) return false;
    return true;
  });

  // 6) summary จากแถวที่กรองแล้วเท่านั้น (ห้ามเป็นค่าคงที่)
  const gapFarms = provinceStats.reduce((acc, row) => acc + row.gapFarmCount, 0);
  const organicFarms = provinceStats.reduce((acc, row) => acc + row.organicFarmCount, 0);
  const areaRai = provinceStats.reduce((acc, row) => acc + row.gapAreaRai + row.organicAreaRai, 0);
  const inspected = provinceStats.reduce((acc, row) => acc + row.inspectedLotCount, 0);
  const passed = provinceStats.reduce((acc, row) => acc + row.passedLotCount, 0);
  const failed = provinceStats.reduce((acc, row) => acc + row.failedLotCount, 0);
  const pending = provinceStats.reduce((acc, row) => acc + row.pendingLotCount, 0);
  const traceable = provinceStats.reduce((acc, row) => acc + row.traceableLotCount, 0);

  const summary: FoodSafetySummary = {
    totalCertifiedFarms: gapFarms + organicFarms,
    gapCertifiedFarms: gapFarms,
    organicCertifiedFarms: organicFarms,
    certifiedAreaRai: areaRai,
    mandatoryStandardCount: standards.filter((standard) => standard.mandateType === 'mandatory').length,
    voluntaryStandardCount: standards.filter((standard) => standard.mandateType === 'voluntary').length,
    totalInspectedLots: inspected,
    totalPassedLots: passed,
    overallPassRate: rateFrom(passed, inspected),
    totalTraceableLots: traceable,
    overallTraceabilityRate: rateFrom(traceable, inspected),
    provinceCount: provinceStats.length,
  };

  // 7) search ไม่ตัด collection หลัก แต่คืนรายการที่ตรงเรียงตามลำดับความสำคัญ
  const matchedLots = query.length === 0
    ? traceabilityLots
    : traceabilityLots
        .map((lot) => ({ lot, score: scoreRecord(query, lot.lotCode, lot.farmCode, lot.provinceName, lot.farmName) }))
        .filter((entry): entry is { lot: TraceabilityLot; score: number } => entry.score !== null)
        .sort((a, b) => a.score - b.score || a.lot.lotCode.localeCompare(b.lot.lotCode))
        .map((entry) => entry.lot);

  const matchedCertificates = query.length === 0
    ? certificates
    : certificates
        .map((certificate) => ({
          certificate,
          score: scoreRecord(
            query,
            certificate.certificateNo,
            certificate.farmCode,
            certificate.provinceName,
            certificate.holderName,
          ),
        }))
        .filter((entry): entry is { certificate: CertificateRecord; score: number } => entry.score !== null)
        .sort((a, b) => a.score - b.score || a.certificate.certificateNo.localeCompare(b.certificate.certificateNo))
        .map((entry) => entry.certificate);

  const warnings = [...FOOD_SAFETY_WARNINGS];
  if (standardId !== 'all' && !PROVINCE_GRAIN_STANDARD_IDS.has(standardId)) {
    warnings.push(
      `มาตรฐาน ${standardId} ไม่ได้อยู่ใน column GAP/Organic ของ provinceStats (คนละทะเบียน คนละ grain) ยอดจังหวัดจึงแสดงตาม grain พืช/อินทรีย์เช่นเดิม`,
    );
  }
  if (unknownCommodity) {
    warnings.push(`ไม่พบรหัสสินค้า "${commodityId}" ในทะเบียนสินค้าของ Data Hub ค่าที่แสดงจึงไม่ได้ถูกกรองด้วยสินค้านี้`);
  }
  if (commoditySeed && !CROP_GROUPS.has(commoditySeed.groupId)) {
    warnings.push(
      'กำลังกรองสินค้าปศุสัตว์/สัตว์น้ำ: column gapFarmCount ของ provinceStats สลับไปใช้ทะเบียน GAP ปศุสัตว์/ประมงของสินค้านั้น ไม่ใช่ทะเบียน GAP พืชที่ใช้ในมุมมองปกติ ห้ามเทียบยอดกับมุมมองทั้งหมด',
    );
  }
  if (mandateConflict && commoditySeed) {
    warnings.push(
      `สินค้า "${commoditySeed.name}" ขึ้นทะเบียน${MANDATE_LABEL[commoditySeed.mandateType]} จึงไม่มีรายการใต้ mandateType=${mandateType} — ทุก collection คืนชุดว่าง ไม่ได้แต่งตัวเลขให้เข้ากัน`,
    );
  }
  if (mandateType !== 'all' && !scopedCommodity) {
    warnings.push(
      `provinceStats ยังนับแบบ all-commodity (grain จังหวัดแยก mandated/สมัครใจไม่ได้) ค่าที่กรองด้วย mandateType=${mandateType} จึงมีผลกับ standards, commodityBoard, lots และ certificates เท่านั้น`,
    );
  }
  if (query.length > 0 && matchedLots.length === 0 && matchedCertificates.length === 0) {
    warnings.push('คำค้นไม่ตรงกับ certificateNo, lotCode, farmCode, ชื่อจังหวัด หรือชื่อผู้ถือใบรับรองในขอบเขตที่เลือก');
  }
  if (residueLabs.length === 0 && !mandateConflict) {
    warnings.push('ขอบเขตที่เลือกไม่มีห้องปฏิบัติการที่ปิดผลตรวจ จึงแสดงค่าว่างแทนการเติมตัวเลขเอง');
  }
  if (summary.totalInspectedLots !== summary.totalPassedLots + failed + pending) {
    // ต้องเป็นเท็จเสมอ; ถ้ามาถึงจุดนี้แปลว่า partition เพี้ยน — ให้หน้าจอรู้แทนที่จะเงียบ
    warnings.push('ยอดล็อตตรวจที่กรองแล้วไม่เท่ากับ passed + failed + pending ข้อมูลชุดนี้ต้องถูกตรวจกลับ');
  }

  const activeSourceIds = new Set<string>(['onab', 'trace-hub']);
  standards.forEach((standard) => {
    (SOURCE_IDS_FOR_STANDARD[standard.id] ?? []).forEach((id) => activeSourceIds.add(id));
  });
  const sources = FOOD_SAFETY_SOURCES.filter((source) => activeSourceIds.has(source.id));

  return {
    sample: FOOD_SAFETY_SAMPLE_MODE,
    generatedAt: FOOD_SAFETY_GENERATED_AT,
    dataAsOf: FOOD_SAFETY_DATA_AS_OF,
    appliedFilters: { provinceCode, region, standardId, mandateType, commodityId, search },
    summary,
    standards,
    provinceStats,
    commodityBoard,
    traceabilityLots,
    certificates,
    residueLabs,
    matchedLots,
    matchedCertificates,
    warnings,
    sources,
  };
}

/** route ใช้ชุดนี้ตรวจรหัสจังหวัดและคำนวณ completeness */
export const FOOD_SAFETY_PROVINCE_CODES: Set<string> = new Set(FOOD_SAFETY_PROVINCES.map((province) => province.code));
export const FOOD_SAFETY_PROVINCE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  FOOD_SAFETY_PROVINCES.map((province) => [province.code, province.name] as const),
);
export const FOOD_SAFETY_REGION_KEYS: RegionKey[] = REGIONS.map((region) => region.key);
