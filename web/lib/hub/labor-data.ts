import 'server-only';
import { getProvinces } from '../provinces';
import { REGION_BY_PROVINCE, REGIONS } from './weather-data';
import type { RegionKey } from './weather-data';

/**
 * กำลังแรงงานเกษตร เกษตรกรสูงวัย และ Young Smart Farmer (YSF)
 * สำหรับหน้า /labor และ /api/v1/labor
 *
 * กติกาสิทธิ์ (AGENTS.md ข้อ 3–4 และ precedent ของ lane ปศุสัตว์/สภาพอากาศ/เกษตรอัจฉริยะ):
 * - ไฟล์นี้ไม่เรียก API กรมส่งเสริมการเกษตร กรมการปกครอง สำนักงานสถิติแห่งชาติ หรือทะเบียน YSF ใด ๆ
 *   ตัวเลขทุกช่องจึงเป็น "ค่าตัวอย่างแบบ deterministic" ที่สังเคราะห์จาก seed คีย์คงที่
 *   และตั้ง `sample: true` + `access: 'metadata_only'` ไว้ทั้ง payload และ meta ของ API
 * - ชื่อหน่วยงานและ URL ใน `sources` เป็นรูปแบบสถาบันจริงเพื่อสาธิตสถาปัตยกรรมข้อมูล
 *   ไม่ใช่หลักฐานว่า Hub ได้รับ feed กำลังแรงงานหรือทะเบียน YSF จากหน่วยงานนั้น และยังไม่มีการยืนยันสิทธิ์
 * - เมื่อต่อ resource จริง ให้คง type contract ชุดนี้ไว้ เปลี่ยนเฉพาะแหล่งค่า (count/share/index)
 *   ห้ามเปลี่ยนชื่อฟิลด์ที่หน้าจอกำลังใช้อยู่ และห้ามแทนค่าที่วัดไม่ได้ด้วย 0
 *
 * กติกาความน่าเชื่อถือของตัวเลข:
 * - ห้าม Math.random() และ Date.now()/new Date() ในเส้นทางที่สร้างค่า ตัวเลขมาจาก mulberry32 + FNV-1a
 *   (seedFrom) เหมือน livestock-data.ts, weather-data.ts และ smart-farming-data.ts ทุก field ทำซ้ำได้
 * - "เวลาปัจจุบัน" ของแบบจำลองคือ LABOR_GOVERNANCE.updatedAt (ค่าคงที่) และ generatedAt คือค่าคงที่ตัวนี้
 *   response จึง byte-stable ทุก request/ทุก build
 * - grain ของแต่ละค่าต้องคงไว้: จำนวนคน/ครัวเรือนเป็นรายจังหวัด, กลุ่มอายุเป็นผลลัพธ์ของแบบจำลอง
 *   ไม่ใช่ข้อมูลรายบุคคล และไม่มีข้อมูลระดับอำเภอ/ตำบลในไฟล์นี้
 * - รายชื่อ 77 จังหวัดคือ "กรอบอ้างอิงตามทะเบียนจังหวัด" ไม่ใช่ข้อสรุปว่าครอบคลุมพื้นที่จริง
 *   บอกซ้ำทั้งใน warnings, gaps และ definitions
 *
 * รูปแบบ seed key (ใช้ format นี้เวลา debug ค่าให้ตรงกับหน้าจอ):
 * - `labor:registered:{provinceCode}`        → ตัวคูณจำนวนเกษตรกรขึ้นทะเบียนต่อกำลังแรงงาน
 * - `labor:household:{provinceCode}`         → จำนวนสมาชิกต่อครัวเรือน
 * - `labor:senior:{provinceCode}`            → ส่วนเบี่ยงของสัดส่วนสูงวัยรายจังหวัด
 * - `labor:young:{provinceCode}`             → ส่วนเบี่ยงของสัดส่วนรุ่นใหม่รายจังหวัด
 * - `labor:sex:{provinceCode}:{bandKey}`     → สัดส่วนชายในกลุ่มอายุ
 * - `labor:median:{provinceCode}`            → ส่วนเบี่ยงของมัธยฐานอายุ
 * - `labor:ysf-rate|active|new|female|district|age|adoption:{provinceCode}`
 * - `labor:tech:{provinceCode}`              → เทคโนโลยีที่ถูกเลือกเป็นความต้องการหลัก
 */

/* ------------------------------------------------------------------ */
/* ประเภทตามสัญญาข้อมูล (export contract ของ lane 4A)                  */
/* ------------------------------------------------------------------ */

export type AgeBandKey = '15_24' | '25_34' | '35_44' | '45_54' | '55_59' | '60_64' | '65_plus';
export type AgeGroupFilter = 'all' | 'young' | 'senior' | AgeBandKey;
export type AgingStatus = 'critical' | 'warning' | 'watch' | 'stable';
export type TechnologyCategory =
  | 'mechanization'
  | 'precision_ag'
  | 'drone'
  | 'iot_sensors'
  | 'ai_decision'
  | 'post_harvest';

export interface LaborGovernance {
  sample: true;
  access: 'metadata_only';
  version: string;
  bannerText: string;
  disclaimer: string;
  updatedAt: string;
}

export const LABOR_GOVERNANCE: LaborGovernance = {
  sample: true,
  access: 'metadata_only',
  version: 'labor-aging-ysf-sim-2026.10-v1',
  bannerText:
    'ข้อมูลกำลังแรงงานเกษตร เกษตรกรสูงวัย และ Young Smart Farmer (YSF) ชุดนี้เป็นค่าตัวอย่างแบบ deterministic (Demo/Sample) '
    + 'ไม่ใช่สถิติทางการ และยังไม่ผ่านการตรวจสิทธิ์เผยแพร่',
  disclaimer:
    'จำนวนเกษตรกรขึ้นทะเบียน กำลังแรงงานเกษตร กลุ่มอายุ สมาชิก YSF และดัชนีผู้สูงวัยในชุดนี้ '
    + 'สังเคราะห์จากแบบจำลอง deterministic ที่ผูกกับรหัสจังหวัดและกติกากลุ่มอายุ เพื่อสาธิตสถาปัตยกรรมข้อมูลของ Thailand Agricultural Data Hub '
    + 'ยังไม่มีการเชื่อมทะเบียนเกษตรกร ทะเบียน Young Smart Farmer หรือผลสำรวจกำลังแรงงานจากหน่วยงานใด '
    + 'ห้ามใช้กำหนดนโยบาย สิทธิประโยชน์ การจัดสรรงบประมาณ หรือการยืนยันตัวตนเกษตรกร และห้ามอ้างเป็นสถิติทางการ '
    + 'รายชื่อ 77 จังหวัดเป็นกรอบอ้างอิงเพื่อการจัดกลุ่ม ไม่ใช่ข้อสรุปว่าครอบคลุมพื้นที่หรือมีข้อมูลจริงครบทุกจังหวัด '
    + 'ตัวเลขจะเปลี่ยนเป็นค่าจริงได้ก็ต่อเมื่อ resource ผ่านการตรวจสิทธิ์ใน config/resource_licenses.json แล้วเท่านั้น',
  updatedAt: '2026-10-25T08:00:00+07:00',
};

export interface AgeGroupDefinition {
  key: AgeBandKey;
  label: string;
  shortLabel: string;
  minAge: number;
  maxAge: number | null;
  isYoung: boolean;
  isSenior: boolean;
}

export const AGE_GROUPS: AgeGroupDefinition[] = [
  { key: '15_24', label: '15–24 ปี', shortLabel: '15–24', minAge: 15, maxAge: 24, isYoung: true, isSenior: false },
  { key: '25_34', label: '25–34 ปี', shortLabel: '25–34', minAge: 25, maxAge: 34, isYoung: true, isSenior: false },
  { key: '35_44', label: '35–44 ปี', shortLabel: '35–44', minAge: 35, maxAge: 44, isYoung: false, isSenior: false },
  { key: '45_54', label: '45–54 ปี', shortLabel: '45–54', minAge: 45, maxAge: 54, isYoung: false, isSenior: false },
  { key: '55_59', label: '55–59 ปี', shortLabel: '55–59', minAge: 55, maxAge: 59, isYoung: false, isSenior: false },
  { key: '60_64', label: '60–64 ปี', shortLabel: '60–64', minAge: 60, maxAge: 64, isYoung: false, isSenior: true },
  { key: '65_plus', label: '65 ปีขึ้นไป', shortLabel: '65+', minAge: 65, maxAge: null, isYoung: false, isSenior: true },
];

export const AGE_FILTER_OPTIONS: Array<{ key: AgeGroupFilter; label: string }> = [
  { key: 'all', label: 'ทุกช่วงวัย' },
  { key: 'young', label: 'เกษตรกรรุ่นใหม่ (15–34)' },
  { key: 'senior', label: 'เกษตรกรสูงวัย (60+)' },
  ...AGE_GROUPS.map((group) => ({ key: group.key, label: group.label })),
];

export interface AgeBand {
  key: AgeBandKey;
  label: string;
  minAge: number;
  maxAge: number | null;
  male: number;
  female: number;
  total: number;
  isYoung: boolean;
  isSenior: boolean;
}

export interface YoungSmartFarmerStats {
  registeredMembers: number;
  activeMembers: number;
  newMembersThisYear: number;
  femaleMembers: number;
  femaleSharePercent: number;
  averageAge: number | null;
  networkDistricts: number;
  totalDistricts: number;
  districtCoveragePercent: number;
  technologyAdoptionPercent: number;
}

export interface LaborTechnologyDemand {
  category: TechnologyCategory;
  label: string;
  description: string;
  demandIndex: number;
  adoptionPercent: number;
  gapPercent: number;
  laborReplacementScore: number;
  note: string;
}

export interface ProvinceLaborProfile {
  provinceCode: string;
  provinceName: string;
  regionKey: RegionKey;
  regionLabel: string;
  registeredFarmers: number;
  registeredHouseholds: number;
  agriculturalLaborForce: number;
  ageBands: AgeBand[];
  seniorFarmers: number;
  seniorSharePercent: number;
  youngFarmers: number;
  youngSharePercent: number;
  agingFarmerIndex: number;
  replacementRatePercent: number;
  dependencyRatio: number;
  medianAge: number;
  ysf: YoungSmartFarmerStats;
  agingStatus: AgingStatus;
  topTechnologyCategory: TechnologyCategory;
  technologyReplacementDemandIndex: number;
}

export interface RegionalLaborSummary {
  regionKey: RegionKey;
  regionLabel: string;
  provinceCount: number;
  registeredFarmers: number;
  agriculturalLaborForce: number;
  seniorFarmers: number;
  seniorSharePercent: number;
  youngFarmers: number;
  youngSharePercent: number;
  agingFarmerIndex: number;
  replacementRatePercent: number;
  ysfMembers: number;
  ysfActiveMembers: number;
  ysfNewMembersThisYear: number;
  medianAge: number;
  agingStatus: AgingStatus;
}

export interface LaborAssumptions {
  youngMaxAge: number;
  seniorMinAge: number;
  seniorExitRatePercent: number;
  replacementDefinition: string;
}

export interface LaborTrendPoint {
  year: number;
  registeredFarmers: number;
  seniorSharePercent: number;
  youngSharePercent: number;
  ysfMembers: number;
  medianAge: number;
}

export interface AgingFarmerIndex {
  value: number;
  status: AgingStatus;
  label: string;
  definition: string;
  benchmark: { warning: number; critical: number };
}

export interface LaborSummary {
  nationalRegisteredFarmers: number;
  nationalAgriculturalLaborForce: number;
  nationalHouseholds: number;
  seniorFarmers: number;
  seniorSharePercent: number;
  youngFarmers: number;
  youngSharePercent: number;
  ysfRegisteredMembers: number;
  ysfActiveMembers: number;
  ysfNewMembersThisYear: number;
  ysfShareOfYoungPercent: number;
  agingFarmerIndex: number;
  replacementRatePercent: number;
  medianAge: number;
  dependencyRatio: number;
  criticalProvinceCount: number;
  watchProvinceCount: number;
}

export interface LaborSource {
  id: string;
  name: string;
  url: string;
  accessedFor: string;
  licenseStatus: 'pending';
  note: string;
}

export interface LaborDashboardPayload {
  sample: true;
  access: 'metadata_only';
  generatedAt: string;
  governance: LaborGovernance;
  summary: LaborSummary;
  agingFarmerIndex: AgingFarmerIndex;
  assumptions: LaborAssumptions;
  ageBands: AgeBand[];
  provinces: ProvinceLaborProfile[];
  regions: RegionalLaborSummary[];
  trend: LaborTrendPoint[];
  technologyDemand: LaborTechnologyDemand[];
  sources: LaborSource[];
  warnings: string[];
  gaps: string[];
  methodology: string[];
  definitions: Array<{ term: string; definition: string }>;
}

export interface LaborQuery {
  provinceCode?: string;
  region?: RegionKey;
  ageGroup?: AgeGroupFilter;
  limit?: number;
  detail?: boolean;
}

export interface LaborApiPayload {
  sample: true;
  access: 'metadata_only';
  generatedAt: string;
  filters: {
    provinceCode: string | null;
    region: RegionKey | null;
    ageGroup: AgeGroupFilter;
  };
  summary: LaborSummary;
  agingFarmerIndex: AgingFarmerIndex;
  assumptions: LaborAssumptions;
  ageBands: AgeBand[];
  selectedAgeGroup: {
    key: AgeGroupFilter;
    label: string;
    male: number;
    female: number;
    total: number;
    sharePercent: number;
  } | null;
  provinces: Array<Omit<ProvinceLaborProfile, 'ageBands'> & { ageBands?: AgeBand[] }>;
  regions: RegionalLaborSummary[];
  trend: LaborTrendPoint[];
  technologyDemand: LaborTechnologyDemand[];
  sources: LaborSource[];
  warnings: string[];
  gaps: string[];
  methodology: string[];
  definitions: Array<{ term: string; definition: string }>;
}

/* ------------------------------------------------------------------ */
/* ค่าคงที่ของแบบจำลอง (ทั้งหมดเป็น sample ไม่ใช่สถิติทางการ)            */
/* ------------------------------------------------------------------ */

const NATIONAL_LABOR_FORCE_TARGET = 5_600_000;
const SENIOR_EXIT_RATE_PERCENT = 3.5;
const YOUNG_MAX_AGE = 34;
const SENIOR_MIN_AGE = 60;
const AGING_WARNING_THRESHOLD = 100;
const AGING_CRITICAL_THRESHOLD = 200;

/**
 * เป้ากำลังแรงงานเกษตรรายภาค (ผลรวม = NATIONAL_LABOR_FORCE_TARGET)
 * สัดส่วนใกล้เคียงภาพรวมประเทศ: อีสาน 38%, กลาง 23%, เหนือ 19.5%, ใต้ 13.5%, ตะวันออก 6%
 * เป็น "เป้าของแบบจำลอง" ไม่ได้มาจากการสำรวจกำลังแรงงานจริง
 */
const REGION_LABOR_FORCE_TARGET: Record<RegionKey, number> = {
  northeast: 2_128_000,
  central: 1_288_000,
  north: 1_092_000,
  south: 756_000,
  east: 336_000,
};

/**
 * น้ำหนักสัมพัทธ์ของกำลังแรงงานเกษตรรายจังหวัดภายในภาค
 * กรุงเทพฯ/ปริมณฑลตั้งใจให้น้ำหนักต่ำมากเพื่อให้กำลังแรงงานเกษตรอยู่ราว 5,000–25,000 คน
 * ตัวเลขเป็นกติกาของแบบจำลอง ไม่ใช่จำนวนแรงงานจริง
 */
const PROVINCE_LABOR_WEIGHT: Record<string, number> = {
  // ตะวันออกเฉียงเหนือ
  '30': 1.55, '31': 1.30, '32': 1.25, '33': 1.25, '34': 1.35,
  '35': 0.65, '36': 1.00, '37': 0.60, '38': 0.55, '39': 0.55,
  '40': 1.15, '41': 1.05, '42': 0.75, '43': 0.70, '44': 1.10,
  '45': 1.20, '46': 1.05, '47': 0.95, '48': 0.85, '49': 0.45,
  // กลางและตะวันตก
  '10': 0.16, '11': 0.24, '12': 0.18, '13': 0.24, '14': 1.25,
  '15': 0.65, '16': 0.95, '17': 0.50, '18': 0.65, '19': 0.70,
  '70': 1.05, '71': 1.10, '72': 1.45, '73': 0.90, '74': 0.55,
  '75': 0.40, '76': 0.85, '77': 0.80,
  // เหนือ
  '50': 1.45, '51': 0.65, '52': 0.85, '53': 0.70, '54': 0.60,
  '55': 0.60, '56': 0.65, '57': 1.30, '58': 0.35, '60': 1.15,
  '61': 0.55, '62': 0.85, '63': 0.65, '64': 0.85, '65': 1.05,
  '66': 0.75, '67': 1.15,
  // ตะวันออก
  '20': 0.80, '21': 0.55, '22': 0.95, '23': 0.40,
  '24': 1.20, '25': 0.70, '26': 0.45, '27': 0.95,
  // ใต้
  '80': 1.35, '81': 0.75, '82': 0.55, '83': 0.25, '84': 1.30,
  '85': 0.30, '86': 0.95, '90': 1.15, '91': 0.55, '92': 0.85,
  '93': 0.80, '94': 0.65, '95': 0.55, '96': 0.70,
};

const REGION_LABEL: Record<RegionKey, string> = Object.fromEntries(
  REGIONS.map((region) => [region.key, region.label]),
) as Record<RegionKey, string>;

/** ส่วนเบี่ยงของสัดส่วนสูงวัย/รุ่นใหม่ตามลักษณะภาค (จุดเปอร์เซ็นต์) */
const REGION_SENIOR_BIAS: Record<RegionKey, number> = {
  north: 1.3, northeast: 1.0, central: -0.8, east: -1.0, south: -0.2,
};
const REGION_YOUNG_BIAS: Record<RegionKey, number> = {
  north: -0.5, northeast: -0.9, central: 1.0, east: 0.7, south: 0.4,
};

/** ฐานการกระจายกลุ่มอายุของแบบจำลอง (ผลรวม 100%) ก่อนปรับตามภาค/จังหวัด */
const BASE_MALE_SHARE: Record<AgeBandKey, number> = {
  '15_24': 0.53,
  '25_34': 0.54,
  '35_44': 0.52,
  '45_54': 0.50,
  '55_59': 0.49,
  '60_64': 0.48,
  '65_plus': 0.45,
};

/** สัดส่วนกลางช่วง 35–59 ปี ใช้แบ่งมวลที่เหลือหลังกำหนดรุ่นใหม่/สูงวัย */
const MIDDLE_BAND_RATIO: Record<'35_44' | '45_54' | '55_59', number> = {
  '35_44': 16,
  '45_54': 22,
  '55_59': 13.5,
};

const TECHNOLOGY_POOL: Record<RegionKey, TechnologyCategory[]> = {
  northeast: ['mechanization', 'post_harvest', 'drone'],
  central: ['precision_ag', 'mechanization', 'post_harvest'],
  north: ['post_harvest', 'precision_ag', 'mechanization'],
  east: ['iot_sensors', 'precision_ag', 'drone'],
  south: ['drone', 'post_harvest', 'iot_sensors'],
};

const AGING_STATUS_LABEL: Record<AgingStatus, string> = {
  critical: 'วิกฤต',
  warning: 'เฝ้าระวัง',
  watch: 'จับตา',
  stable: 'ทรงตัว',
};

const AFI_DEFINITION =
  'จำนวนเกษตรกรอายุ 60 ปีขึ้นไปต่อเกษตรกรอายุ 15–34 ปี 100 คนในขอบเขตเดียวกัน '
  + 'คำนวณจากผลรวมกลุ่มอายุของแบบจำลอง ไม่ใช่ค่าจากทะเบียนรายบุคคล; เกณฑ์เฝ้าระวัง 100 และวิกฤต 200';

const ASSUMPTIONS: LaborAssumptions = {
  youngMaxAge: YOUNG_MAX_AGE,
  seniorMinAge: SENIOR_MIN_AGE,
  seniorExitRatePercent: SENIOR_EXIT_RATE_PERCENT,
  replacementDefinition:
    'อัตราทดแทน = 100 × สมาชิก YSF ที่สมัครใหม่ในปี ÷ (จำนวนเกษตรกรสูงวัย × 3.5%) '
    + 'โดย 3.5% เป็นสมมติฐานอัตราออกจากกำลังแรงงานต่อปีของกลุ่ม 60+ และเพดานแสดงผล 100% '
    + 'ไม่ใช่การคาดการณ์จำนวนเกษตรกรที่จะออกจริง',
};

/* ------------------------------------------------------------------ */
/* ตัวช่วย deterministic (แบบเดียวกับ livestock/weather/smart-farming)   */
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

/** FNV-1a: คีย์เดิมต้องได้ค่าเดิมทุกครั้ง (ห้ามใช้เวลาจริงหรือเลขสุ่มใน path ของค่า) */
function seedFrom(key: string) {
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

/* ------------------------------------------------------------------ */
/* ตัวช่วยจัดสรรจำนวนเต็ม (largest remainder)                           */
/* ------------------------------------------------------------------ */

interface WeightedEntry {
  key: string;
  weight: number;
}

/**
 * จัดสรร `total` ตามน้ำหนักให้เป็นจำนวนเต็มและผลรวมเท่ากับ total พอดี
 * ใช้ทั้งการแบ่งกำลังแรงงานรายจังหวัดและการแบ่งจำนวนคนเข้ากลุ่มอายุ
 */
function allocateExact(total: number, entries: WeightedEntry[]): Map<string, number> {
  const result = new Map<string, number>();
  if (entries.length === 0) return result;

  const weightSum = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0 || weightSum <= 0) {
    for (const entry of entries) result.set(entry.key, 0);
    return result;
  }

  const shares = entries.map((entry) => {
    const raw = (total * entry.weight) / weightSum;
    const count = Math.floor(raw);
    return { key: entry.key, count, fraction: raw - count };
  });

  let remaining = total - shares.reduce((sum, share) => sum + share.count, 0);
  const ordered = [...shares].sort(
    (left, right) => right.fraction - left.fraction || left.key.localeCompare(right.key),
  );
  let cursor = 0;
  while (remaining > 0) {
    ordered[cursor % ordered.length].count += 1;
    remaining -= 1;
    cursor += 1;
  }

  for (const share of shares) result.set(share.key, share.count);
  return result;
}

/* ------------------------------------------------------------------ */
/* ตัวช่วยคำนวณและรวมยอด                                               */
/* ------------------------------------------------------------------ */

function percentOf(count: number, total: number): number {
  return total > 0 ? round((count / total) * 100, 1) : 0;
}

function agingIndexOf(seniorFarmers: number, youngFarmers: number): number {
  return youngFarmers > 0 ? round((seniorFarmers / youngFarmers) * 100, 1) : 0;
}

function classifyAging(index: number): AgingStatus {
  if (index >= AGING_CRITICAL_THRESHOLD) return 'critical';
  if (index >= AGING_WARNING_THRESHOLD) return 'warning';
  if (index >= 50) return 'watch';
  return 'stable';
}

function replacementRateOf(newMembers: number, seniorFarmers: number): number {
  const expectedExits = (seniorFarmers * SENIOR_EXIT_RATE_PERCENT) / 100;
  if (expectedExits <= 0) return 0;
  return Math.min(100, round((newMembers / expectedExits) * 100, 1));
}

function buildAgingFarmerIndex(value: number): AgingFarmerIndex {
  const status = classifyAging(value);
  return {
    value,
    status,
    label: AGING_STATUS_LABEL[status],
    definition: AFI_DEFINITION,
    benchmark: { warning: AGING_WARNING_THRESHOLD, critical: AGING_CRITICAL_THRESHOLD },
  };
}

function sumAgeBands(profiles: readonly ProvinceLaborProfile[]): AgeBand[] {
  return AGE_GROUPS.map((definition) => {
    let male = 0;
    let female = 0;
    let total = 0;
    for (const profile of profiles) {
      const band = profile.ageBands.find((row) => row.key === definition.key);
      if (!band) continue;
      male += band.male;
      female += band.female;
      total += band.total;
    }
    return {
      key: definition.key,
      label: definition.label,
      minAge: definition.minAge,
      maxAge: definition.maxAge,
      male,
      female,
      total,
      isYoung: definition.isYoung,
      isSenior: definition.isSenior,
    };
  });
}

/**
 * รวมโปรไฟล์จังหวัดเป็น summary ของขอบเขตที่เลือก
 * ตัวเลขทุกตัวคำนวณใหม่จากจำนวนคน ไม่ได้ seed ซ้ำเพื่อให้ยอดตรงกับรายจังหวัดเสมอ
 */
function aggregateProvinces(profiles: readonly ProvinceLaborProfile[]): LaborSummary {
  let nationalRegisteredFarmers = 0;
  let nationalAgriculturalLaborForce = 0;
  let nationalHouseholds = 0;
  let seniorFarmers = 0;
  let youngFarmers = 0;
  let ysfRegisteredMembers = 0;
  let ysfActiveMembers = 0;
  let ysfNewMembersThisYear = 0;
  let weightedMedianSum = 0;
  let criticalProvinceCount = 0;
  let watchProvinceCount = 0;

  for (const profile of profiles) {
    nationalRegisteredFarmers += profile.registeredFarmers;
    nationalAgriculturalLaborForce += profile.agriculturalLaborForce;
    nationalHouseholds += profile.registeredHouseholds;
    seniorFarmers += profile.seniorFarmers;
    youngFarmers += profile.youngFarmers;
    ysfRegisteredMembers += profile.ysf.registeredMembers;
    ysfActiveMembers += profile.ysf.activeMembers;
    ysfNewMembersThisYear += profile.ysf.newMembersThisYear;
    weightedMedianSum += profile.medianAge * profile.agriculturalLaborForce;
    if (profile.agingStatus === 'critical') criticalProvinceCount += 1;
    if (profile.agingStatus === 'warning') watchProvinceCount += 1;
  }

  return {
    nationalRegisteredFarmers,
    nationalAgriculturalLaborForce,
    nationalHouseholds,
    seniorFarmers,
    seniorSharePercent: percentOf(seniorFarmers, nationalAgriculturalLaborForce),
    youngFarmers,
    youngSharePercent: percentOf(youngFarmers, nationalAgriculturalLaborForce),
    ysfRegisteredMembers,
    ysfActiveMembers,
    ysfNewMembersThisYear,
    ysfShareOfYoungPercent: percentOf(ysfRegisteredMembers, youngFarmers),
    agingFarmerIndex: agingIndexOf(seniorFarmers, youngFarmers),
    replacementRatePercent: replacementRateOf(ysfNewMembersThisYear, seniorFarmers),
    medianAge:
      nationalAgriculturalLaborForce > 0
        ? round(weightedMedianSum / nationalAgriculturalLaborForce, 1)
        : 0,
    dependencyRatio:
      nationalAgriculturalLaborForce > seniorFarmers
        ? round(
          (seniorFarmers / (nationalAgriculturalLaborForce - seniorFarmers)) * 100,
          1,
        )
        : 0,
    criticalProvinceCount,
    watchProvinceCount,
  };
}

function buildRegionalSummaries(profiles: readonly ProvinceLaborProfile[]): RegionalLaborSummary[] {
  return REGIONS.map((region) => {
    const rows = profiles.filter((profile) => profile.regionKey === region.key);
    let registeredFarmers = 0;
    let agriculturalLaborForce = 0;
    let seniorFarmers = 0;
    let youngFarmers = 0;
    let ysfMembers = 0;
    let ysfActiveMembers = 0;
    let ysfNewMembersThisYear = 0;
    let weightedMedianSum = 0;

    for (const row of rows) {
      registeredFarmers += row.registeredFarmers;
      agriculturalLaborForce += row.agriculturalLaborForce;
      seniorFarmers += row.seniorFarmers;
      youngFarmers += row.youngFarmers;
      ysfMembers += row.ysf.registeredMembers;
      ysfActiveMembers += row.ysf.activeMembers;
      ysfNewMembersThisYear += row.ysf.newMembersThisYear;
      weightedMedianSum += row.medianAge * row.agriculturalLaborForce;
    }

    const agingFarmerIndex = agingIndexOf(seniorFarmers, youngFarmers);
    return {
      regionKey: region.key,
      regionLabel: region.label,
      provinceCount: rows.length,
      registeredFarmers,
      agriculturalLaborForce,
      seniorFarmers,
      seniorSharePercent: percentOf(seniorFarmers, agriculturalLaborForce),
      youngFarmers,
      youngSharePercent: percentOf(youngFarmers, agriculturalLaborForce),
      agingFarmerIndex,
      replacementRatePercent: replacementRateOf(ysfNewMembersThisYear, seniorFarmers),
      ysfMembers,
      ysfActiveMembers,
      ysfNewMembersThisYear,
      medianAge:
        agriculturalLaborForce > 0
          ? round(weightedMedianSum / agriculturalLaborForce, 1)
          : 0,
      agingStatus: classifyAging(agingFarmerIndex),
    };
  });
}

/* ------------------------------------------------------------------ */
/* โปรไฟล์กำลังแรงงานรายจังหวัด                                        */
/* ------------------------------------------------------------------ */

function buildProvinceLaborProfile(
  provinceCode: string,
  provinceName: string,
  agriculturalLaborForce: number,
): ProvinceLaborProfile {
  const regionKey = REGION_BY_PROVINCE[provinceCode];
  if (!regionKey) {
    throw new Error(`Labor data: province ${provinceCode} has no region mapping`);
  }
  const regionLabel = REGION_LABEL[regionKey];

  const registeredFarmers = Math.round(
    agriculturalLaborForce * between(`labor:registered:${provinceCode}`, 1.34, 1.5),
  );
  const registeredHouseholds = Math.max(
    1,
    Math.round(registeredFarmers / between(`labor:household:${provinceCode}`, 2.6, 3.05)),
  );

  // 32% / 16.5% เป็นฐานกลางของแบบจำลอง แล้วเบี่ยงตามภาคและรหัสจังหวัด
  const seniorBias =
    REGION_SENIOR_BIAS[regionKey] + between(`labor:senior:${provinceCode}`, -1.5, 1.5);
  const youngBias =
    REGION_YOUNG_BIAS[regionKey] + between(`labor:young:${provinceCode}`, -0.8, 0.8);
  const seniorPercent = clamp(32 + seniorBias, 28.5, 36.2);
  const youngPercent = clamp(16.5 + youngBias, 14.2, 18.8);
  const middlePercent = Math.max(0, 100 - seniorPercent - youngPercent);
  const oldestShare = clamp(0.54 + seniorBias * 0.008, 0.5, 0.6);
  const youngestShare = clamp(0.45 + youngBias * 0.01, 0.42, 0.48);
  const middleRatioSum =
    MIDDLE_BAND_RATIO['35_44'] + MIDDLE_BAND_RATIO['45_54'] + MIDDLE_BAND_RATIO['55_59'];

  const bandShares: Array<{ key: AgeBandKey; share: number }> = [
    { key: '15_24', share: youngPercent * youngestShare },
    { key: '25_34', share: youngPercent * (1 - youngestShare) },
    { key: '35_44', share: middlePercent * (MIDDLE_BAND_RATIO['35_44'] / middleRatioSum) },
    { key: '45_54', share: middlePercent * (MIDDLE_BAND_RATIO['45_54'] / middleRatioSum) },
    { key: '55_59', share: middlePercent * (MIDDLE_BAND_RATIO['55_59'] / middleRatioSum) },
    { key: '60_64', share: seniorPercent * (1 - oldestShare) },
    { key: '65_plus', share: seniorPercent * oldestShare },
  ];

  const bandCounts = allocateExact(
    agriculturalLaborForce,
    bandShares.map((item) => ({ key: item.key, weight: item.share })),
  );

  const ageBands: AgeBand[] = AGE_GROUPS.map((definition) => {
    const total = bandCounts.get(definition.key) ?? 0;
    const maleShare = clamp(
      BASE_MALE_SHARE[definition.key]
        + between(`labor:sex:${provinceCode}:${definition.key}`, -0.015, 0.015),
      0.4,
      0.62,
    );
    const male = Math.round(total * maleShare);
    return {
      key: definition.key,
      label: definition.label,
      minAge: definition.minAge,
      maxAge: definition.maxAge,
      male,
      female: total - male,
      total,
      isYoung: definition.isYoung,
      isSenior: definition.isSenior,
    };
  });

  const seniorFarmers = ageBands
    .filter((band) => band.isSenior)
    .reduce((sum, band) => sum + band.total, 0);
  const youngFarmers = ageBands
    .filter((band) => band.isYoung)
    .reduce((sum, band) => sum + band.total, 0);
  const seniorSharePercent = percentOf(seniorFarmers, agriculturalLaborForce);
  const youngSharePercent = percentOf(youngFarmers, agriculturalLaborForce);
  const agingFarmerIndex = agingIndexOf(seniorFarmers, youngFarmers);
  const agingStatus = classifyAging(agingFarmerIndex);

  const medianAge = round(
    clamp(
      40.5 + seniorSharePercent * 0.34 + between(`labor:median:${provinceCode}`, -0.9, 0.9),
      45,
      60,
    ),
    1,
  );

  const dependencyRatio =
    agriculturalLaborForce > seniorFarmers
      ? round((seniorFarmers / (agriculturalLaborForce - seniorFarmers)) * 100, 1)
      : 0;

  // YSF: จำนวนสมัครใหม่ต้องไม่เกินสมาชิกที่ยัง active และ active ต้องไม่เกินทะเบียน
  const ysfRate = between(`labor:ysf-rate:${provinceCode}`, 0.018, 0.035);
  const registeredMembers = Math.round(youngFarmers * ysfRate);
  const activeMembers = Math.round(
    registeredMembers * between(`labor:ysf-active:${provinceCode}`, 0.8, 0.94),
  );
  const newMembersThisYear = Math.round(
    activeMembers * between(`labor:ysf-new:${provinceCode}`, 0.06, 0.16),
  );
  const femaleMembers = Math.round(
    activeMembers * between(`labor:ysf-female:${provinceCode}`, 0.34, 0.52),
  );
  const totalDistricts = intBetween(`labor:district:${provinceCode}`, 8, 32);
  const networkDistricts = Math.min(
    totalDistricts,
    Math.max(1, Math.round(totalDistricts * between(`labor:ysf-district:${provinceCode}`, 0.35, 0.95))),
  );
  const averageAge =
    draw(`labor:ysf-age:${provinceCode}`) < 0.06
      ? null
      : round(between(`labor:ysf-age-value:${provinceCode}`, 27, 35), 1);

  const ysf: YoungSmartFarmerStats = {
    registeredMembers,
    activeMembers,
    newMembersThisYear,
    femaleMembers,
    femaleSharePercent: percentOf(femaleMembers, activeMembers),
    averageAge,
    networkDistricts,
    totalDistricts,
    districtCoveragePercent: percentOf(networkDistricts, totalDistricts),
    technologyAdoptionPercent: round(
      between(`labor:ysf-adoption:${provinceCode}`, 40, 85),
      1,
    ),
  };

  const topTechnologyCategory = pick(
    `labor:tech:${provinceCode}`,
    TECHNOLOGY_POOL[regionKey],
  );

  // ความต้องการทดแทนแรงงานสูงขึ้นตามสัดส่วนผู้สูงวัย แต่ยังเป็นดัชนีของแบบจำลอง
  const technologyReplacementDemandIndex = Math.round(
    clamp(
      1.75 * seniorSharePercent - 4 + between(`labor:tech-demand:${provinceCode}`, -3, 4),
      0,
      100,
    ),
  );

  return {
    provinceCode,
    provinceName,
    regionKey,
    regionLabel,
    registeredFarmers,
    registeredHouseholds,
    agriculturalLaborForce,
    ageBands,
    seniorFarmers,
    seniorSharePercent,
    youngFarmers,
    youngSharePercent,
    agingFarmerIndex,
    replacementRatePercent: replacementRateOf(newMembersThisYear, seniorFarmers),
    dependencyRatio,
    medianAge,
    ysf,
    agingStatus,
    topTechnologyCategory,
    technologyReplacementDemandIndex,
  };
}

/* ------------------------------------------------------------------ */
/* ความต้องการเทคโนโลยีระดับประเทศ                                     */
/* ------------------------------------------------------------------ */

const TECHNOLOGY_DEMAND_BASE: Array<Omit<LaborTechnologyDemand, 'gapPercent'>> = [
  {
    category: 'mechanization',
    label: 'เครื่องจักรกลการเกษตร',
    description:
      'รถแทรกเตอร์ขนาดเล็ก รถดำนา เครื่องเกี่ยวนวด และเครื่องหยอดเมล็ดที่ทดแทนแรงงานหนักในฤดูปลูกและเก็บเกี่ยว',
    demandIndex: 84,
    adoptionPercent: 58,
    laborReplacementScore: 78,
    note: 'ความต้องการสูงในพื้นที่นาข้าวและไร่ขนาดใหญ่ที่แรงงานวัยหนุ่มย้ายออก แต่ราคาเครื่องจักรและการเข้าถึงบริการรับจ้างยังเป็นข้อจำกัด',
  },
  {
    category: 'precision_ag',
    label: 'เกษตรแม่นยำ',
    description:
      'การจัดการปุ๋ย น้ำ และการป้องกันกำจัดศัตรูพืชตามค่าที่วัดได้รายแปลง แทนการใส่ตามประสบการณ์ทั้งแปลง',
    demandIndex: 71,
    adoptionPercent: 34,
    laborReplacementScore: 62,
    note: 'ช่วยลดแรงงานตรวจแปลงและปัจจัยการผลิตส่วนเกิน แต่ต้องมีข้อมูลดินและคำแนะนำที่ผ่านการตรวจสอบก่อนใช้',
  },
  {
    category: 'drone',
    label: 'โดรนการเกษตร',
    description:
      'โดรนฉีดพ่นและสำรวจแปลง ลดเวลาทำงานและความเสี่ยงจากการสัมผัสสารเคมีของแรงงาน',
    demandIndex: 76,
    adoptionPercent: 41,
    laborReplacementScore: 58,
    note: 'เหมาะกับแปลงที่มีรูปแปลงซับซ้อนและแรงงานขาดช่วง แต่ต้องมีข้อกำหนดการบิน ผู้ควบคุมที่ผ่านการรับรอง และสภาพอากาศที่เหมาะสม',
  },
  {
    category: 'iot_sensors',
    label: 'เซนเซอร์ IoT ในแปลง',
    description:
      'เซนเซอร์ความชื้นดิน สภาพอากาศ และระบบน้ำ เพื่อติดตามสภาพแปลงอย่างต่อเนื่องโดยไม่ต้องเดินตรวจบ่อย',
    demandIndex: 68,
    adoptionPercent: 29,
    laborReplacementScore: 55,
    note: 'ลดภาระการเดินตรวจแต่ยังต้องมีไฟฟ้า สัญญาณ และแผนบำรุงรักษาอุปกรณ์ รวมถึงการสอบเทียบค่าก่อนใช้ตัดสินใจ',
  },
  {
    category: 'ai_decision',
    label: 'ระบบช่วยตัดสินใจด้วย AI',
    description:
      'แบบจำลองพยากรณ์ผลผลิต โรค และรอบการจัดการจากข้อมูลหลายแหล่ง เพื่อช่วยวางแผนแรงงานและปัจจัยการผลิต',
    demandIndex: 63,
    adoptionPercent: 22,
    laborReplacementScore: 49,
    note: 'ต้องมีข้อมูลย้อนหลังที่ผ่านการตรวจสิทธิ์และคุณภาพเพียงพอก่อนใช้แนะนำระดับฟาร์ม และต้องมีมนุษย์ตรวจทานคำแนะนำเสมอ',
  },
  {
    category: 'post_harvest',
    label: 'เทคโนโลยีหลังการเก็บเกี่ยว',
    description:
      'เครื่องคัดเกรด เครื่องอบแห้ง ห้องเย็น และระบบบรรจุที่ลดความสูญเสียและทดแทนแรงงานคัดแยก',
    demandIndex: 88,
    adoptionPercent: 47,
    laborReplacementScore: 72,
    note: 'ลดผลผลิตเสียและแรงงานคัดแยกได้ชัดเจน แต่ต้องลงทุนสูงและมีปริมาณผลผลิตรองรับให้คุ้มต้นทุน',
  },
];

const TECHNOLOGY_DEMAND: LaborTechnologyDemand[] = TECHNOLOGY_DEMAND_BASE.map((item) => ({
  ...item,
  gapPercent: Math.max(0, round(item.demandIndex - item.adoptionPercent, 1)),
}));

/* ------------------------------------------------------------------ */
/* แนวโน้ม 10 ปี (พ.ศ. 2560–2569) เป็น back-cast ของแบบจำลอง             */
/* ------------------------------------------------------------------ */

function buildTrend(summary: LaborSummary): LaborTrendPoint[] {
  const points: LaborTrendPoint[] = [];
  for (let index = 0; index < 10; index += 1) {
    const year = 2560 + index;
    if (index === 9) {
      points.push({
        year,
        registeredFarmers: summary.nationalRegisteredFarmers,
        seniorSharePercent: summary.seniorSharePercent,
        youngSharePercent: summary.youngSharePercent,
        ysfMembers: summary.ysfRegisteredMembers,
        medianAge: summary.medianAge,
      });
      continue;
    }
    const progress = index / 9;
    points.push({
      year,
      registeredFarmers: Math.round(
        summary.nationalRegisteredFarmers * (0.865 + 0.135 * progress),
      ),
      seniorSharePercent: round(
        summary.seniorSharePercent - (1 - progress) * 6.4,
        1,
      ),
      youngSharePercent: round(
        summary.youngSharePercent + (1 - progress) * 3.1,
        1,
      ),
      ysfMembers: Math.round(
        summary.ysfRegisteredMembers * (0.22 + 0.78 * progress),
      ),
      medianAge: round(summary.medianAge - (1 - progress) * 3.8, 1),
    });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* ข้อความกำกับ Governance                                              */
/* ------------------------------------------------------------------ */

const LABOR_SOURCES: LaborSource[] = [
  {
    id: 'doae-ysf',
    name: 'กรมส่งเสริมการเกษตร — โครงการ Young Smart Farmer (YSF)',
    url: 'https://www.doae.go.th/',
    accessedFor: 'อ้างอิงนิยามกลุ่มเกษตรกรรุ่นใหม่และโครงสร้างเครือข่าย YSF ในระดับ metadata เท่านั้น',
    licenseStatus: 'pending',
    note: 'ยังไม่ได้รับไฟล์ทะเบียนสมาชิก YSF และยังไม่ยืนยันสิทธิ์เผยแพร่ ตัวเลขสมาชิกในชุดนี้เป็นค่าจำลองทั้งหมด',
  },
  {
    id: 'oae-agricultural-economics',
    name: 'สำนักงานเศรษฐกิจการเกษตร (สศก.) — ข้อมูลเศรษฐกิจการเกษตรและกำลังแรงงานภาคเกษตร',
    url: 'https://www.oae.go.th/',
    accessedFor: 'อ้างอิงกรอบนิยามเกษตรกรขึ้นทะเบียนและกำลังแรงงานภาคเกษตรเพื่อออกแบบฟิลด์',
    licenseStatus: 'pending',
    note: 'ใช้เป็นกรอบแนวคิดเรื่อง grain และนิยามเท่านั้น ไม่ได้นำตัวเลขจากรายงานใดมาใส่ใน payload',
  },
  {
    id: 'nso-agricultural-census',
    name: 'สำนักงานสถิติแห่งชาติ — สำมะโนการเกษตรและสำรวจกำลังแรงงาน',
    url: 'https://www.nso.go.th/',
    accessedFor: 'อ้างอิงโครงสร้างกลุ่มอายุและนิยามกำลังแรงงานเพื่อสาธิตการจัดกลุ่ม',
    licenseStatus: 'pending',
    note: 'ยังไม่มี resource ที่ผ่านการตรวจสิทธิ์ให้เผยแพร่ตัวเลขรายจังหวัดใน Hub ตัวเลขกลุ่มอายุจึงเป็นผลของแบบจำลอง',
  },
  {
    id: 'mol-labor-force',
    name: 'กระทรวงแรงงาน — สถิติกำลังแรงงานและการจ้างงานภาคเกษตร',
    url: 'https://www.mol.go.th/',
    accessedFor: 'อ้างอิงนิยามกำลังแรงงานและอัตราการออกจากกำลังแรงงานในระดับแนวคิด',
    licenseStatus: 'pending',
    note: 'ยังไม่มีการเชื่อม API หรือไฟล์สถิติรายจังหวัด และไม่มีการยืนยันสิทธิ์เผยแพร่ในรอบ build นี้',
  },
];

const WARNINGS: string[] = [
  'ตัวเลขทุกช่องในชุดนี้เป็นค่าตัวอย่างแบบ deterministic (seed จากรหัสจังหวัดและชนิดตัวชี้วัด) เพื่อสาธิตหน้าจอ ไม่ใช่สถิติทางการ และห้ามใช้กำหนดนโยบาย สิทธิประโยชน์ หรือการจัดสรรงบประมาณ',
  'รายชื่อ 77 จังหวัดเป็นกรอบอ้างอิงตามทะเบียนจังหวัด ไม่ใช่ข้อสรุปว่าครอบคลุมพื้นที่จริง การมีชื่อจังหวัดไม่ได้แปลว่ามีข้อมูลกำลังแรงงานจริง และจำนวนต่อจังหวัดเกิดจากกติกาของแบบจำลอง',
  'จำนวนสมาชิก YSF ทั้งทะเบียน active สมัครใหม่ และสัดส่วนหญิงเป็นค่าจำลอง ไม่ใช่ทะเบียนของกรมส่งเสริมการเกษตร และห้ามใช้ยืนยันตัวตนหรือสิทธิ์ของบุคคล',
  'กลุ่มอายุทั้ง 7 ช่วงเป็นผลลัพธ์ของแบบจำลองที่จัดสรรจากยอดกำลังแรงงานรายจังหวัด ไม่ใช่ข้อมูลรายบุคคล และไม่มีข้อมูลระดับอำเภอ/ตำบลในไฟล์นี้',
  'ยอดรวมประเทศและภาคคำนวณจากโปรไฟล์รายจังหวัดของแบบจำลอง ไม่ใช่ผลสำมะโนการเกษตรหรือสำรวจกำลังแรงงาน และไม่ควรนำไปเทียบกับสถิติที่เผยแพร่โดยหน่วยงานอื่นโดยตรง',
  'trend 10 ปีย้อนหลัง (พ.ศ. 2560–2569) เป็น back-cast จากค่าปีปัจจุบัน ไม่ใช่ time-series observation จาก D1 และไม่มีหลักฐานการวัดรายปีใน Hub',
  'resource กำลังแรงงาน/YSF ใน config ยังมีสถานะ licenseStatus = pending และ Hub ยังไม่มี live feed จากหน่วยงานต้นทาง ตัวเลขจะเปลี่ยนเป็นค่าจริงได้หลังผ่านการตรวจสิทธิ์เท่านั้น',
  'ตัวกรองจังหวัด/ภาคที่ไม่ตรงกันจะคืนขอบเขตว่างพร้อมคำเตือน ไม่ได้หมายความว่าพื้นที่นั้นมีกำลังแรงงานหรือสมาชิก YSF เป็นศูนย์จริง',
  'อัตราทดแทน YSF ใช้สมมติฐานอัตราออก 3.5% ต่อปีของกลุ่ม 60+ ซึ่งไม่ใช่ค่าที่วัดจากทะเบียนจริง และไม่ใช่การคาดการณ์จำนวนเกษตรกรที่จะออกจากกำลังแรงงาน',
];

const GAPS: string[] = [
  'ยังไม่มี resource กำลังแรงงานเกษตรหรือทะเบียน YSF ที่ผ่านการตรวจสิทธิ์ในแคตตาล็อกปัจจุบัน (config/sources.json และ config/resource_licenses.json) จึงแทนที่ค่าจำลองด้วยค่าจริงในรอบนี้ไม่ได้',
  'ยังไม่มีตาราง cross-tab กลุ่มอายุ × เพศ จากสำมะโนหรือสำรวจที่เป็นรายจังหวัด จึงต้องสังเคราะห์การแบ่งชาย/หญิงจากสัดส่วนฐานของแบบจำลอง',
  'ยังไม่ได้เชื่อมทะเบียนสมาชิก Young Smart Farmer ของกรมส่งเสริมการเกษตร และไม่มีข้อมูลสถานะ active รายบุคคล จึงไม่สามารถยืนยันจำนวนสมาชิกหรืออัตราคงอยู่ได้',
  'ยังไม่มีทะเบียนอำเภอ/ตำบลที่ crosswalk กับรหัสจังหวัดในไฟล์นี้ จำนวนอำเภอและอำเภอที่เครือข่ายครอบคลุมจึงเป็นค่าจำลอง ห้ามใช้วางแผนระดับอำเภอ',
  'ยังไม่มี time-series observation ของกำลังแรงงานใน D1 หรือแหล่งจัดเก็บอื่นที่ผ่านการตรวจสอบย้อนหลัง trend ทั้ง 10 ปีจึงเป็นเพียงภาพสาธิต',
  'นิยาม "เกษตรกรขึ้นทะเบียน" "กำลังแรงงานเกษตร" และ "ผู้สูงวัย" แตกต่างกันระหว่างทะเบียนและสำรวจ ยังไม่มีเอกสารเทียบนิยามราย resource ที่ใช้ร่วมกันได้',
  'ยังไม่มีการเชื่อมทะเบียนครัวเรือนเกษตรกับทะเบียนบุคคล จึงไม่สามารถตรวจสอบความซ้ำซ้อนของสมาชิกในครัวเรือนหรือจำนวนสมาชิกต่อครัวเรือนได้',
];

const METHODOLOGY: string[] = [
  'จัดสรรกำลังแรงงานเกษตรระดับประเทศ 5.6 ล้านคน (ค่าตัวอย่าง) ลงรายภาคตามเป้าคงที่ แล้วกระจายรายจังหวัดด้วยน้ำหนักสัมพัทธ์ของแบบจำลอง โดยใช้วิธี largest remainder เพื่อให้ผลรวมรายจังหวัดเท่ากับเป้าพอดี',
  'สร้างสัดส่วนกลุ่มอายุ 7 ช่วงจากฐานกลาง ปรับตามภาคและรหัสจังหวัด แล้วจัดสรรจำนวนเต็มด้วย largest remainder ให้ผลรวมกลุ่มอายุเท่ากับกำลังแรงงานของจังหวัดนั้นพอดี จากนั้นแบ่งชาย/หญิงด้วยสัดส่วนฐานต่อกลุ่มอายุและปรับเล็กน้อยแบบ deterministic',
  'คำนวณยอดประเทศและภาคใหม่จากผลรวมรายจังหวัดทุกครั้ง (จำนวนคนบวกกัน ราคาเฉลี่ยถ่วงน้ำหนักด้วยกำลังแรงงาน และสัดส่วน/ดัชนีคำนวณจากจำนวนคน) ไม่ได้ seed ค่ายอดรวมแยก',
  'ประมาณจำนวนสมาชิก YSF จากสัดส่วนของเกษตรกรอายุ 15–34 ปี (1.8–3.5%) แล้วกำหนด active ไม่เกินทะเบียน สมัครใหม่ไม่เกิน active และสมาชิกหญิงไม่เกิน active',
  'คำนวณ Aging Farmer Index = 100 × จำนวน 60+ ÷ จำนวน 15–34 ปี และจำแนกสถานะด้วยเกณฑ์ 100 (เฝ้าระวัง) และ 200 (วิกฤต) ส่วนอัตราทดแทนใช้สมมติฐานอัตราออก 3.5% ต่อปี',
  'แนวโน้ม 2560–2569 สร้างย้อนหลังจากค่าปี 2569 ของแบบจำลอง และบังคับให้จุดปี 2569 เท่ากับ summary ปัจจุบันทุกฟิลด์',
  'ตัวกรอง provinceCode/region/ageGroup ทำงานบนโปรไฟล์จังหวัดชุดเดียวกัน โดย ageGroup ใช้เลือกเฉพาะแถวสรุปที่แสดง ไม่เปลี่ยนโครงสร้างกลุ่มอายุทั้ง 7 ช่วงของขอบเขต',
];

const DEFINITIONS: Array<{ term: string; definition: string }> = [
  {
    term: 'Aging Farmer Index (AFI)',
    definition:
      'จำนวนเกษตรกรอายุ 60 ปีขึ้นไปต่อเกษตรกรอายุ 15–34 ปี 100 คน คำนวณจากผลรวมกลุ่มอายุในขอบเขตเดียวกัน เกณฑ์เฝ้าระวัง 100 และวิกฤต 200',
  },
  {
    term: 'อัตราทดแทน YSF (YSF replacement rate)',
    definition:
      '100 × สมาชิก YSF ที่สมัครใหม่ในปี ÷ จำนวนเกษตรกรสูงวัยที่คาดว่าออกจากกำลังแรงงาน (60+ × 3.5%) แสดงเพดาน 100% และไม่ใช่การคาดการณ์จำนวนเกษตรกรที่จะออกจริง',
  },
  {
    term: 'เกษตรกรรุ่นใหม่ (young farmers)',
    definition:
      'กลุ่มอายุ 15–24 ปี และ 25–34 ปี รวมกัน ตามนิยามของแบบจำลอง ซึ่งใช้ขอบเขตอายุเดียวกับตัวกรอง "เกษตรกรรุ่นใหม่ (15–34)"',
  },
  {
    term: 'เกษตรกรสูงวัย (senior farmers)',
    definition:
      'กลุ่มอายุ 60–64 ปี และ 65 ปีขึ้นไป รวมกัน ตามนิยามของแบบจำลอง ซึ่งใช้ขอบเขตอายุเดียวกับตัวกรอง "เกษตรกรสูงวัย (60+)"',
  },
  {
    term: 'อัตราพึ่งพิงวัยสูงอายุในกำลังแรงงานเกษตร',
    definition:
      '100 × จำนวนเกษตรกร 60+ ÷ (กำลังแรงงานเกษตร − จำนวนเกษตรกร 60+) เป็นอัตราพึ่งพิงภายในกำลังแรงงานอายุ 15+ ของแบบจำลอง ไม่ใช่อัตราพึ่งพิงของประชากรทั้งประเทศ',
  },
  {
    term: 'เกษตรกรขึ้นทะเบียนกับกำลังแรงงานเกษตร',
    definition:
      'registeredFarmers คือจำนวนคนที่ขึ้นทะเบียนในแบบจำลอง (มากกว่ากำลังแรงงาน เพราะรวมผู้ที่ไม่ได้อยู่ในกำลังแรงงาน) ส่วน agriculturalLaborForce คือคนที่แบบจำลองนับว่าอยู่ในกำลังแรงงาน ห้ามใช้สองค่านี้แทนกัน',
  },
  {
    term: 'กรอบอ้างอิง 77 จังหวัด',
    definition:
      'รายชื่อจังหวัดทั้ง 77 ใช้เป็นกรอบจัดกลุ่มข้อมูลตามทะเบียนจังหวัด ไม่ใช่ข้อสรุปว่ามีข้อมูลจริงครบทุกจังหวัด และไม่ใช่หลักประกันคุณภาพหรือความครอบคลุมของพื้นที่',
  },
  {
    term: 'Technology replacement demand index',
    definition:
      'ดัชนี 0–100 ของแบบจำลองที่สะท้อนความต้องการเทคโนโลยีทดแทนแรงงานในจังหวัด โดยเพิ่มตามสัดส่วนเกษตรกรสูงวัย ไม่ใช่ผลสำรวจความต้องการของเกษตรกรรายบุคคล',
  },
  {
    term: 'Young Smart Farmer (YSF)',
    definition:
      'กลุ่มเกษตรกรรุ่นใหม่ที่แบบจำลองสมมติขึ้นเพื่อสาธิตตัวชี้วัดเครือข่าย ไม่ใช่ทะเบียนสมาชิกจริงของกรมส่งเสริมการเกษตร และไม่มีข้อมูลรายบุคคลใน payload',
  },
];

/* ------------------------------------------------------------------ */
/* Guard: สัญญาภายในต้องไม่แตก (fail closed)                            */
/* ------------------------------------------------------------------ */

function assertLaborIsCoherent(
  profiles: readonly ProvinceLaborProfile[],
  summary: LaborSummary,
  ageBands: readonly AgeBand[],
): void {
  if (profiles.length !== 77) {
    throw new Error('Labor data must carry all 77 provinces');
  }
  const expectedBandOrder = AGE_GROUPS.map((group) => group.key).join(',');
  let laborForceTotal = 0;

  for (const profile of profiles) {
    if (profile.ageBands.length !== AGE_GROUPS.length) {
      throw new Error(`Province ${profile.provinceCode}: age band count drifted`);
    }
    if (profile.ageBands.map((band) => band.key).join(',') !== expectedBandOrder) {
      throw new Error(`Province ${profile.provinceCode}: age bands are not in ascending order`);
    }
    const bandTotal = profile.ageBands.reduce((sum, band) => sum + band.total, 0);
    if (bandTotal !== profile.agriculturalLaborForce) {
      throw new Error(`Province ${profile.provinceCode}: age bands do not sum to labor force`);
    }
    if (profile.ageBands.some((band) => band.male + band.female !== band.total)) {
      throw new Error(`Province ${profile.provinceCode}: male + female must equal band total`);
    }
    const senior = profile.ageBands
      .filter((band) => band.isSenior)
      .reduce((sum, band) => sum + band.total, 0);
    const young = profile.ageBands
      .filter((band) => band.isYoung)
      .reduce((sum, band) => sum + band.total, 0);
    if (profile.seniorFarmers !== senior || profile.youngFarmers !== young) {
      throw new Error(`Province ${profile.provinceCode}: senior/young totals drifted from bands`);
    }
    laborForceTotal += profile.agriculturalLaborForce;
  }

  if (laborForceTotal !== summary.nationalAgriculturalLaborForce) {
    throw new Error('Labor summary does not sum to the province labor force');
  }
  const nationalBandTotal = ageBands.reduce((sum, band) => sum + band.total, 0);
  if (nationalBandTotal !== summary.nationalAgriculturalLaborForce) {
    throw new Error('National age bands do not sum to the national labor force');
  }
}

/* ------------------------------------------------------------------ */
/* การประกอบ payload (build ครั้งเดียว memoize ต่อ process)             */
/* ------------------------------------------------------------------ */

function loadDashboard(provinces: { code: string; name: string }[]): LaborDashboardPayload {
  const regionTargetSum = REGIONS.reduce(
    (sum, region) => sum + REGION_LABOR_FORCE_TARGET[region.key],
    0,
  );
  if (regionTargetSum !== NATIONAL_LABOR_FORCE_TARGET) {
    throw new Error('Labor data: regional targets do not sum to the national target');
  }

  const laborByProvince = new Map<string, number>();

  for (const region of REGIONS) {
    const members = provinces.filter(
      (province) => REGION_BY_PROVINCE[province.code] === region.key,
    );
    if (members.length === 0) {
      throw new Error(`Labor data: region ${region.key} has no provinces`);
    }
    const allocated = allocateExact(
      REGION_LABOR_FORCE_TARGET[region.key],
      members.map((province) => ({
        key: province.code,
        weight: PROVINCE_LABOR_WEIGHT[province.code] ?? 1,
      })),
    );
    for (const [code, value] of allocated) laborByProvince.set(code, value);
  }

  if (laborByProvince.size !== 77) {
    throw new Error('Labor data: province labor allocation is incomplete');
  }

  const profiles = provinces.map((province) =>
    buildProvinceLaborProfile(
      province.code,
      province.name,
      laborByProvince.get(province.code) ?? 0,
    ),
  );
  const summary = aggregateProvinces(profiles);
  const ageBands = sumAgeBands(profiles);
  assertLaborIsCoherent(profiles, summary, ageBands);

  return {
    sample: true,
    access: 'metadata_only',
    generatedAt: LABOR_GOVERNANCE.updatedAt,
    governance: LABOR_GOVERNANCE,
    summary,
    agingFarmerIndex: buildAgingFarmerIndex(summary.agingFarmerIndex),
    assumptions: ASSUMPTIONS,
    ageBands,
    provinces: profiles,
    regions: buildRegionalSummaries(profiles),
    trend: buildTrend(summary),
    technologyDemand: TECHNOLOGY_DEMAND,
    sources: LABOR_SOURCES,
    warnings: WARNINGS,
    gaps: GAPS,
    methodology: METHODOLOGY,
    definitions: DEFINITIONS,
  };
}

let dashboardPromise: Promise<LaborDashboardPayload> | undefined;

async function loadDashboardAsync(): Promise<LaborDashboardPayload> {
  const provinces = await getProvinces();
  if (provinces.length !== 77) {
    throw new Error('Labor data expects the full 77-province registry');
  }
  return loadDashboard(provinces.map((province) => ({ code: province.code, name: province.name })));
}

function getDashboard(): Promise<LaborDashboardPayload> {
  dashboardPromise ??= loadDashboardAsync();
  return dashboardPromise;
}

/* ------------------------------------------------------------------ */
/* ตัวกรองและ selectedAgeGroup                                          */
/* ------------------------------------------------------------------ */

function isAgeGroupFilter(value: string): value is AgeGroupFilter {
  return AGE_FILTER_OPTIONS.some((option) => option.key === value);
}

function selectAgeGroup(
  bands: readonly AgeBand[],
  ageGroup: AgeGroupFilter,
  laborForce: number,
): LaborApiPayload['selectedAgeGroup'] {
  if (ageGroup === 'all') return null;

  let rows: AgeBand[];
  let label: string;
  if (ageGroup === 'young') {
    rows = bands.filter((band) => band.isYoung);
    label = 'เกษตรกรรุ่นใหม่ (15–34)';
  } else if (ageGroup === 'senior') {
    rows = bands.filter((band) => band.isSenior);
    label = 'เกษตรกรสูงวัย (60+)';
  } else {
    rows = bands.filter((band) => band.key === ageGroup);
    label = AGE_GROUPS.find((group) => group.key === ageGroup)?.label ?? ageGroup;
  }

  const male = rows.reduce((sum, band) => sum + band.male, 0);
  const female = rows.reduce((sum, band) => sum + band.female, 0);
  const total = male + female;

  return {
    key: ageGroup,
    label,
    male,
    female,
    total,
    sharePercent: laborForce > 0 ? round((total / laborForce) * 100, 1) : 0,
  };
}

function projectProvince(
  profile: ProvinceLaborProfile,
  detail: boolean,
): Omit<ProvinceLaborProfile, 'ageBands'> & { ageBands?: AgeBand[] } {
  if (detail) return { ...profile };
  const { ageBands, ...rest } = profile;
  void ageBands;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Public API ของ lane 4A                                               */
/* ------------------------------------------------------------------ */

/**
 * payload ทั้งชุด: summary + 77 โปรไฟล์จังหวัด + ภาค + trend + technology demand
 * generatedAt เป็นค่าคงที่ LABOR_GOVERNANCE.updatedAt ไม่ใช่ clock จริง
 */
export async function buildLaborDashboard(): Promise<LaborDashboardPayload> {
  return getDashboard();
}

/**
 * snapshot ตามตัวกรอง เป็นมุมมองเดียวกับหน้า/API:
 * - summary คำนวณใหม่จากจังหวัดที่ผ่านตัวกรอง (ไม่ใช่หยิบ summary ประเทศมาใช้)
 * - ageBands เป็นกลุ่มอายุครบ 7 ช่วงของขอบเขต ไม่ถูกตัดตาม ageGroup
 * - selectedAgeGroup ใช้บอกช่วงที่ผู้ใช้เลือก (null เมื่อ all)
 * - provinces ไม่มี ageBands เว้นแต่ detail = true
 * - regions/trend/technologyDemand คงบริบทประเทศทั้งชุด
 *
 * หมายเหตุ: route ต้องตรวจ provinceCode/region ที่ไม่รู้จักก่อนเรียกฟังก์ชันนี้
 * ฟังก์ชันนี้ยังคง total/robust: รหัสที่ไม่รู้จักคืนรายการว่างพร้อมคำเตือน
 */
export async function getLaborSnapshot(query?: LaborQuery): Promise<LaborApiPayload> {
  const dashboard = await getDashboard();
  const options = query ?? {};
  const provinceCode = options.provinceCode?.trim() || null;
  const region = options.region ?? null;
  const requestedAgeGroup = options.ageGroup;
  const ageGroup = requestedAgeGroup && isAgeGroupFilter(requestedAgeGroup)
    ? requestedAgeGroup
    : 'all';

  const extraWarnings: string[] = [];
  if (requestedAgeGroup && !isAgeGroupFilter(requestedAgeGroup)) {
    extraWarnings.push(`ช่วงอายุ "${requestedAgeGroup}" ไม่รู้จัก จึงใช้ "all" แทน`);
  }

  let matched = dashboard.provinces;
  let knownProvince = true;

  if (provinceCode) {
    knownProvince = matched.some((profile) => profile.provinceCode === provinceCode);
    if (!knownProvince) {
      matched = [];
      extraWarnings.push(`ไม่พบรหัสจังหวัด ${provinceCode} ในกรอบอ้างอิง 77 จังหวัด จึงคืนขอบเขตว่าง`);
    } else {
      matched = matched.filter((profile) => profile.provinceCode === provinceCode);
    }
  }

  if (region) {
    const beforeRegionFilter = matched.length;
    matched = matched.filter((profile) => profile.regionKey === region);
    if (provinceCode && knownProvince && beforeRegionFilter > 0 && matched.length === 0) {
      extraWarnings.push(
        `รหัสจังหวัด ${provinceCode} ไม่ได้อยู่ในภาค ${region} จึงคืนขอบเขตว่าง`,
      );
    }
  }

  if (matched.length === 0) {
    extraWarnings.push(
      'ขอบเขตที่กรองได้ไม่มีจังหวัด จึงแสดงยอดศูนย์และ AFI 0 สถานะทรงตัว ซึ่งไม่ใช่ค่าจริงของพื้นที่',
    );
  }

  const summary = aggregateProvinces(matched);
  const ageBands = sumAgeBands(matched);
  const selectedAgeGroup = selectAgeGroup(
    ageBands,
    ageGroup,
    summary.nationalAgriculturalLaborForce,
  );

  const limit = options.limit;
  const limited = typeof limit === 'number' && Number.isFinite(limit)
    ? matched.slice(0, Math.max(0, Math.floor(limit)))
    : matched;
  const detail = options.detail === true;

  return {
    sample: true,
    access: 'metadata_only',
    generatedAt: dashboard.generatedAt,
    filters: { provinceCode, region, ageGroup },
    summary,
    agingFarmerIndex: buildAgingFarmerIndex(summary.agingFarmerIndex),
    assumptions: dashboard.assumptions,
    ageBands,
    selectedAgeGroup,
    provinces: limited.map((profile) => projectProvince(profile, detail)),
    regions: dashboard.regions,
    trend: dashboard.trend,
    technologyDemand: dashboard.technologyDemand,
    sources: dashboard.sources,
    warnings: [...dashboard.warnings, ...extraWarnings],
    gaps: dashboard.gaps,
    methodology: dashboard.methodology,
    definitions: dashboard.definitions,
  };
}
