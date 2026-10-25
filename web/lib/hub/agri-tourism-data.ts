import 'server-only';
import { REGIONS, REGION_BY_PROVINCE } from './weather-data';
import type { RegionKey } from './weather-data';

/** region crosswalk มาจาก weather-data; re-export ให้ consumer ของ module นี้ใช้ type เดียวกันได้ */
export type { RegionKey };

/**
 * การท่องเที่ยวเชิงเกษตร ศูนย์เรียนรู้ และเครือข่ายวิสาหกิจชุมชน (Agri-Tourism)
 * สำหรับหน้า /agri-tourism และ GET /api/v1/agri-tourism
 *
 * กติกาข้อมูล (AGENTS.md ข้อ 3 และ 4):
 * - แหล่งอ้างอิงที่ module นี้ใช้ (กรมส่งเสริมการเกษตร, กรมการพัฒนาชุมชน,
 *   การท่องเที่ยวแห่งประเทศไทย, กระทรวงการท่องเที่ยวและกีฬา, CKAN DOAE) ยัง
 *   ไม่ผ่านการตรวจสิทธิ์เผยแพร่ ทุกแหล่งเป็น licenseStatus = 'pending',
 *   access = 'metadata_only', publicationApproved = false จึงไม่มีตัวเลขจริง
 *   จากต้นทางหรือจาก data/local/ หลุดเข้ามาในไฟล์นี้ ทุกตัวเลขเป็นค่าตัวอย่าง
 *   แบบ deterministic พร้อม flag `sample: true` ระดับ record
 * - seed มาจากข้อความคงที่ (รหัสจังหวัด + รหัสแหล่ง + เดือน) ห้ามใช้
 *   Math.random() หรือ Date.now() ในเส้นทางสร้างค่าใด ๆ ชื่อชุมชน ฟาร์ม กลุ่ม
 *   และแหล่งท่องเที่ยวทั้งหมดเป็นชื่อสมมติ วันอ้างอิงตรึงไว้ที่
 *   AGRI_TOURISM_DATA_AS_OF เท่านั้น
 * - grain แยกกันเด็ดขาด: `destinations` / `workshops` / `enterprises` เป็น
 *   ทะเบียนรายแหล่ง (นับเป็น "จำนวนแถวในทะเบียน" รายงานผ่าน `counts`) ส่วน
 *   `provinceStats` เป็นยอดรายจังหวัดที่ partition จากทะเบียนชุดเดียวกัน
 *   ยอดระดับประเทศใน `summary` จึงบวกจากแถว provinceStats เท่านั้น ไม่ตั้งยอด
 *   ใหม่เอง และไม่บวกข้าม grain (เช่นเอา workshopCount ของแหล่งไปรวมกับ
 *   จำนวนเวิร์กช็อปในทะเบียน)
 * - missing เป็น null เสมอ (เช่น distanceFromBangkokKm, sourceUrl) ไม่แทนด้วย 0
 * - การมีรหัสจังหวัดครบ 77 แถวคือตารางอ้างอิง crosswalk ไม่ใช่ข้อสรุปว่ามี
 *   แหล่งท่องเที่ยวเชิงเกษตรหรือเครือข่ายวิสาหกิจชุมชนจริงครบทุกจังหวัด
 */

export const AGRI_TOURISM_SAMPLE_MODE: boolean = true;

/** วันอ้างอิงคงที่; ห้าม derive จากเวลาจริง เพราะค่าตัวอย่างทุกชุดต้องเท่ากันทุกครั้ง */
export const AGRI_TOURISM_DATA_AS_OF = '2026-10-25';

/* ------------------------------------------------------------------ */
/* สัญญาข้อมูลของหน้า /agri-tourism                                      */
/* ------------------------------------------------------------------ */

export type ActivityId =
  | 'farmstay' | 'learning_center' | 'royal_initiative' | 'fruit_festival'
  | 'workshop' | 'community_enterprise' | 'large_scale_group' | 'otop_market';
export type AmenityId =
  | 'lodging' | 'restaurant' | 'meeting_room' | 'parking' | 'toilet'
  | 'wheelchair_access' | 'wifi' | 'shop' | 'tour_guide' | 'camping';
export type SeasonKey = 'cool' | 'rainy' | 'hot';
export type DestinationKind =
  | 'farmstay' | 'learning_center' | 'royal_initiative' | 'community_enterprise' | 'market';
export type EnterpriseType = 'community_enterprise' | 'large_scale_group' | 'otop_group';

/**
 * kind ของแหล่งใช้ "นับจำนวนแหล่ง" ใน provinceStats/summary ส่วน activities
 * เป็นมุมมองคนละแกน (แหล่งหนึ่งทำกี่กิจกรรมก็ได้) ใช้กรอง "แหล่งที่ทำได้"
 * ห้ามบวกยอดสองแกนนี้เข้าเป็นก้อนเดียวกัน
 */
export interface AgriTourismSource {
  id: string;
  name: string;
  agency: string;
  sourceUrl: string | null;
  licenseStatus: 'pending';
  access: 'metadata_only';
  publicationApproved: false;
  limitations: string[];
}

export interface AgriTourismProvinceOption {
  code: string;
  name: string;
  region: RegionKey;
  regionLabel: string;
}

export interface AgriTourismSummary {
  /** จังหวัดที่ยังอยู่ใน scope หลังกรอง (แถวของ provinceStats) */
  provinceCount: number;
  /** จำนวนแหล่งในทะเบียนหลังกรอง = ผลรวมแถวรายจังหวัด */
  destinationCount: number;
  farmstayCount: number;
  learningCenterCount: number;
  /** แหล่งลักษณะตามรอยศาสตร์พระราชา (นับจากทะเบียนแหล่ง ไม่ใช่จากแถวจังหวัด) */
  royalInitiativeCount: number;
  /** กลุ่มในทะเบียนวิสาหกิจชุมชนชนิด community_enterprise (คนละ grain กับ destinationCount) */
  communityEnterpriseCount: number;
  largeScaleGroupCount: number;
  workshopCount: number;
  /** จำนวนเดือน (1-12) ที่มีผลไม้เปิดเทศกาล — ค่าระดับปี ไม่เปลี่ยนตาม month filter */
  fruitFestivalMonthCount: number;
  estimatedVisitorTrips: number;
  estimatedIncomeBaht: number;
}

export interface AgriTourismRegionCard {
  region: RegionKey;
  regionLabel: string;
  provinceCount: number;
  destinationCount: number;
  peakMonths: number[];
  topActivity: ActivityId;
  topActivityLabel: string;
  signatureProducts: string[];
  highlightDestinationName: string;
}

export interface AgriTourismProvinceStat {
  provinceCode: string;
  provinceName: string;
  region: RegionKey;
  regionLabel: string;
  destinationCount: number;
  farmstayCount: number;
  learningCenterCount: number;
  communityEnterpriseCount: number;
  largeScaleGroupCount: number;
  fruitFestivalMonths: number[];
  peakSeason: SeasonKey;
  peakSeasonLabel: string;
  visitorTrips: number;
  incomeBaht: number;
  topActivities: ActivityId[];
}

export interface AgriTourismDestination {
  id: string;
  name: string;
  kind: DestinationKind;
  kindLabel: string;
  provinceCode: string;
  provinceName: string;
  region: RegionKey;
  regionLabel: string;
  district: string;
  activities: ActivityId[];
  activityLabels: string[];
  amenities: AmenityId[];
  amenityLabels: string[];
  highlight: string;
  bestMonths: number[];
  /** ป้ายกำกับฤดูกาลของ bestMonths เรียงตามเดือนและตัดค่าซ้ำแล้ว (จำนวน <= bestMonths.length) */
  seasonLabels: string[];
  signatureCrops: string[];
  workshopCount: number;
  stayAvailable: boolean;
  dayTripOnly: boolean;
  distanceFromBangkokKm: number | null;
  travelNote: string;
  sample: true;
}

export interface AgriTourismCalendarFruit {
  name: string;
  provinceCodes: string[];
  provinceNames: string[];
  festival: boolean;
  peak: boolean;
}

export interface AgriTourismFruitMonth {
  month: number;
  monthLabel: string;
  season: SeasonKey;
  seasonLabel: string;
  fruits: AgriTourismCalendarFruit[];
  /**
   * ยอดรวมแบบตัวอย่างของ "สิ่งที่อาจมีในเดือนนี้" = จำนวนแหล่งที่เปิดรับในเดือนนั้น
   * + จำนวนคอร์สอบรมในเดือนนั้น + จำนวนผลไม้ที่มีเทศกาลในเดือนนั้น (ตัดจังหวัดนอก
   * scope ออกแล้ว) ไม่ใช่จำนวนงานอย่างเป็นทางการจากหน่วยงานใด
   */
  eventCount: number;
  highlightText: string;
}

export interface AgriTourismWorkshop {
  id: string;
  title: string;
  destinationId: string;
  destinationName: string;
  provinceCode: string;
  provinceName: string;
  region: RegionKey;
  activity: ActivityId;
  activityLabel: string;
  durationHours: number;
  months: number[];
  capacity: number;
  priceBaht: number;
  targetAudience: string;
  sample: true;
}

export interface AgriTourismEnterprise {
  id: string;
  name: string;
  type: EnterpriseType;
  typeLabel: string;
  provinceCode: string;
  provinceName: string;
  region: RegionKey;
  regionLabel: string;
  products: string[];
  memberCount: number;
  areaRai: number;
  certifiedStandards: string[];
  tourActivities: ActivityId[];
  sample: true;
}

export interface AgriTourismTravelTip {
  id: string;
  season: SeasonKey;
  seasonLabel: string;
  monthFrom: number;
  monthTo: number;
  title: string;
  guidance: string;
  regionScope: RegionKey | 'all';
  relatedActivities: ActivityId[];
  sample: true;
}

export interface AgriTourismFilters {
  /** 'all' (ค่าเริ่มต้น) หรือรหัสจังหวัด 2 หลัก */
  provinceCode?: string;
  /** ค่าเริ่มต้น 'all' */
  region?: RegionKey | 'all';
  /** ค่าเริ่มต้น 'all' */
  activity?: ActivityId | 'all';
  /** 1-12 หรือ 'all' (ค่าเริ่มต้น) */
  month?: number | 'all';
  /** ข้อความอิสระ ค่าเริ่มต้น '' */
  search?: string;
}

export interface AgriTourismAppliedFilters {
  provinceCode: string;
  region: string;
  activity: string;
  month: string;
  search: string;
}

/** จำนวน "แถวในทะเบียน" หลังกรอง — คนละนิยามกับ summary ที่นับยอดรายจังหวัด */
export interface AgriTourismCounts {
  destinationCount: number;
  workshopCount: number;
  enterpriseCount: number;
  provinceCount: number;
}

export interface AgriTourismDashboardPayload {
  sample: true;
  access: 'metadata_only';
  dataAsOf: string;
  warnings: string[];
  sources: AgriTourismSource[];
  summary: AgriTourismSummary;
  regionCards: AgriTourismRegionCard[];
  provinceStats: AgriTourismProvinceStat[];
  destinations: AgriTourismDestination[];
  fruitCalendar: AgriTourismFruitMonth[];
  workshops: AgriTourismWorkshop[];
  enterprises: AgriTourismEnterprise[];
  travelTips: AgriTourismTravelTip[];
  appliedFilters: AgriTourismAppliedFilters;
  counts: AgriTourismCounts;
}

/* ------------------------------------------------------------------ */
/* คำกำกับภาษาไทย (label)                                              */
/* ------------------------------------------------------------------ */

export const ACTIVITY_IDS: readonly ActivityId[] = [
  'farmstay', 'learning_center', 'royal_initiative', 'fruit_festival',
  'workshop', 'community_enterprise', 'large_scale_group', 'otop_market',
];

export const AMENITY_IDS: readonly AmenityId[] = [
  'lodging', 'restaurant', 'meeting_room', 'parking', 'toilet',
  'wheelchair_access', 'wifi', 'shop', 'tour_guide', 'camping',
];

export const ACTIVITY_LABELS: Record<ActivityId, string> = {
  farmstay: 'ฟาร์มสเตย์ / ที่พักในสวน',
  learning_center: 'ศูนย์เรียนรู้',
  royal_initiative: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชา',
  fruit_festival: 'เทศกาลผลไม้/เก็บเกี่ยว',
  workshop: 'เวิร์กช็อป/อบรมอาชีพในชุมชน',
  community_enterprise: 'วิสาหกิจชุมชน',
  large_scale_group: 'กลุ่มแปลงใหญ่',
  otop_market: 'ตลาดชุมชน/OTOP',
};

export const AMENITY_LABELS: Record<AmenityId, string> = {
  lodging: 'ที่พักในฟาร์ม',
  restaurant: 'ร้านอาหาร/คาเฟ่ในสวน',
  meeting_room: 'ห้องประชุม จุดบรรยาย',
  parking: 'ลานจอดรถ',
  toilet: 'ห้องน้ำ',
  wheelchair_access: 'ทางลาด รองรับรถเข็น',
  wifi: 'Wi-Fi',
  shop: 'ร้านของฝาก สินค้าชุมชน',
  tour_guide: 'วิทยากรนำชม',
  camping: 'ลานกางเต็นท์',
};

export const DESTINATION_KIND_LABELS: Record<DestinationKind, string> = {
  farmstay: 'ฟาร์มสเตย์',
  learning_center: 'ศูนย์เรียนรู้',
  royal_initiative: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชา',
  community_enterprise: 'วิสาหกิจชุมชนท่องเที่ยว',
  market: 'ตลาดชุมชน/ตลาดผลไม้',
};

export const ENTERPRISE_TYPE_LABELS: Record<EnterpriseType, string> = {
  community_enterprise: 'วิสาหกิจชุมชน',
  large_scale_group: 'กลุ่มแปลงใหญ่',
  otop_group: 'กลุ่มอาชีพ/OTOP',
};

export const SEASON_LABELS: Record<SeasonKey, string> = {
  cool: 'ฤดูเย็น/หน้าหนาว',
  rainy: 'ฤดูฝน',
  hot: 'ฤดูร้อน',
};

/** index 0 = เดือน 1 */
export const THAI_MONTH_LABELS: readonly string[] = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const SEASON_BY_MONTH: readonly SeasonKey[] = [
  /* 1 */ 'cool', /* 2 */ 'hot', /* 3 */ 'hot', /* 4 */ 'hot',
  /* 5 */ 'hot', /* 6 */ 'rainy', /* 7 */ 'rainy', /* 8 */ 'rainy',
  /* 9 */ 'rainy', /* 10 */ 'cool', /* 11 */ 'cool', /* 12 */ 'cool',
];

/**
 * ฤดูตามเดือนที่ใช้ใน module นี้ (นิยามเพื่อการท่องเที่ยว ไม่ใช่เขตอากาศวิทยา):
 * cool = 10,11,12,1 / hot = 2,3,4,5 / rainy = 6,7,8,9
 */
export function seasonOfMonth(month: number): SeasonKey {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`agri-tourism-data: seasonOfMonth() รับเดือน 1-12 เท่านั้น (ได้รับ ${month})`);
  }
  return SEASON_BY_MONTH[month - 1];
}

function monthLabel(month: number): string {
  return THAI_MONTH_LABELS[month - 1] ?? `${month}`;
}

/** เรียงเดือนแล้วแปลงเป็นข้อความ "ก.ค., ส.ค." สำหรับหมายเหตุภาษาไทย */
function monthListText(months: readonly number[]): string {
  const sorted = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (sorted.length === 0) return 'ยังไม่ระบุเดือนในชุดตัวอย่าง';
  return sorted.map(monthLabel).join(', ');
}

/* ------------------------------------------------------------------ */
/* ตัวช่วย deterministic (mulberry32 + FNV-1a) — แบบเดียวกับ food-safety  */
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
  if (items.length === 0) throw new Error('agri-tourism-data: pick() ต้องการรายการไม่ว่างเปล่า');
  return items[Math.floor(unit(key) * items.length) % items.length];
}

/** สุ่มแบบไม่ซ้ำ (Fisher–Yates บน stream ของคีย์เดิม) ใช้เลือก amenities */
function pickMany<T>(key: string, items: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  if (items.length === 0) throw new Error('agri-tourism-data: pickMany() ต้องการรายการไม่ว่างเปล่า');
  const rand = mulberry32(seedFrom(key));
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** รวมรายการโดยไม่ซ้ำ โดยคงลำดับที่พบก่อนไว้ (ใช้กับ label ที่ derive จาก id) */
function uniqueOrdered<T>(items: readonly T[]): T[] {
  const seen: T[] = [];
  for (const item of items) {
    if (!seen.includes(item)) seen.push(item);
  }
  return seen;
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

/**
 * จังหวัดอ้างอิง 77 แถว; ใช้ตรวจรหัสจังหวัดและบอกขอบเขตของตารางอ้างอิง
 * ไม่ใช่ข้ออ้าง coverage (AGENTS.md ข้อ 4)
 */
export const AGRI_TOURISM_PROVINCES: AgriTourismProvinceOption[] = Object.keys(PROVINCE_NAMES)
  .sort((a, b) => Number(a) - Number(b))
  .map((code) => {
    const region = REGION_BY_PROVINCE[code] ?? 'central';
    return {
      code,
      name: PROVINCE_NAMES[code],
      region,
      regionLabel: REGION_LABEL_BY_KEY[region],
    };
  });

/** ใช้ตรวจรหัสจังหวัด; รหัสที่ไม่อยู่ในเซตนี้แปลว่า "ไม่พบ" (คืนชุดว่าง ไม่ throw) */
export const AGRI_TOURISM_PROVINCE_CODES: ReadonlySet<string> = new Set(
  AGRI_TOURISM_PROVINCES.map((province) => province.code),
);

const PROVINCE_BY_CODE = new Map<string, AgriTourismProvinceOption>(
  AGRI_TOURISM_PROVINCES.map((province) => [province.code, province] as const),
);

/* ------------------------------------------------------------------ */
/* ขนาดกิจกรรมท่องเที่ยวต่อจังหวัด (ค่าตัวอย่างเพื่อการจำลอง)             */
/* ------------------------------------------------------------------ */

/**
 * จังหวัดที่กิจกรรมท่องเที่ยวเชิงเกษตรคึกคักตามบริบทพื้นที่ (ผลไม้ตะวันออก,
 * ภูเขาภาคเหนือ, ทะเลและผลไม้ใต้) ได้ค่า scale สูงกว่า — ตัวเลขชุดนี้
 * กำหนดเองเพื่อการจำลองลำดับชั้น ไม่ใช่ส่วนแบ่งตลาดหรือสถิติผู้เยี่ยมเยือน
 */
const PROVINCE_TOURISM_SCALE: Record<string, number> = {
  '50': 1.95, '22': 1.9, '21': 1.7, '77': 1.75, '30': 1.6, '84': 1.6,
  '76': 1.55, '23': 1.5, '42': 1.5, '55': 1.5, '40': 1.45, '10': 1.4,
  '57': 1.35, '67': 1.3, '20': 1.3, '86': 1.3, '80': 1.25, '90': 1.25,
  '70': 1.2, '71': 1.2, '73': 1.2, '75': 1.25, '74': 1.1, '14': 1.15,
  '51': 1.15, '52': 1.05, '65': 1.15, '34': 1.15, '32': 1.1, '26': 1.2,
  '19': 1.1, '60': 1.1, '12': 1.05, '13': 1.05, '11': 1.0, '24': 1.1,
  '25': 1.1, '27': 1.0, '36': 1.05, '41': 1.05, '43': 1.0, '45': 1.05,
  '47': 1.0, '48': 1.0, '49': 1.0, '31': 1.05, '33': 1.05, '35': 0.95,
  '37': 0.9, '38': 0.9, '39': 0.9, '44': 0.95, '46': 0.95, '53': 1.0,
  '54': 1.0, '56': 1.0, '58': 1.1, '61': 0.95, '62': 1.0, '63': 0.95,
  '64': 1.0, '66': 0.95, '72': 1.05, '15': 0.9, '16': 1.0, '17': 0.9,
  '18': 0.9, '81': 1.15, '82': 1.1, '83': 1.2, '85': 1.0, '91': 0.9,
  '92': 1.05, '93': 1.0, '94': 0.9, '95': 0.9, '96': 0.9,
};

const REGION_TOURISM_SCALE: Record<RegionKey, number> = {
  north: 1.08, northeast: 0.9, central: 1.0, east: 1.15, south: 1.02,
};

/** หน่วยผู้เยี่ยมชมตัวอย่างต่อแหล่ง 1 แห่ง/ปี (ค่าตั้งของโมเดล ไม่ใช่สถิติ) */
const TRIPS_PER_DESTINATION = 2600;
/** ค่าใช้จ่ายเฉลี่ยต่อทริปตัวอย่าง (บาท) — โมเดลเชิงสาธิตเท่านั้น */
const SPEND_PER_TRIP_BAHT = 1850;

function provinceScale(province: AgriTourismProvinceOption): number {
  return (PROVINCE_TOURISM_SCALE[province.code] ?? 1) * REGION_TOURISM_SCALE[province.region];
}

/* ------------------------------------------------------------------ */
/* แหล่งข้อมูล (metadata เท่านั้น — ทุกแหล่งรอตรวจสิทธิ์)                 */
/* ------------------------------------------------------------------ */

export const AGRI_TOURISM_SOURCES: AgriTourismSource[] = [
  {
    id: 'doae-ckan',
    name: 'กรมส่งเสริมการเกษตร (DOAE) — ระบบฐานข้อมูลกลางเกษตร CKAN',
    agency: 'กระทรวงเกษตรและสหกรณ์',
    sourceUrl: 'https://ckan.doae.go.th',
    licenseStatus: 'pending',
    access: 'metadata_only',
    publicationApproved: false,
    limitations: [
      'ชุดข้อมูลกลุ่มแปลงใหญ่และศูนย์เรียนรู้การเพิ่มประสิทธิภาพการผลิตสินค้าเกษตร (ศพก.) ยังไม่ยืนยันสัญญาอนุญาตให้재배포เชิงพาณิชย์',
      'ยังไม่ได้ตรวจนิยาม "แหล่งท่องเที่ยวเชิงเกษตรที่ขึ้นทะเบียน" รายจังหวัด และรอบปรับปรุงข้อมูล (revision) ของต้นทาง',
      'ยอดสมาชิกและพื้นที่ในบางชุดเป็นตัวเลขรวมระดับประเทศ ตัดเป็นรายจังหวัดทันทีไม่ได้',
    ],
  },
  {
    id: 'doae-web',
    name: 'กรมส่งเสริมการเกษตร (เว็บไซต์กรม)',
    agency: 'กระทรวงเกษตรและสหกรณ์',
    sourceUrl: 'https://www.doae.go.th',
    licenseStatus: 'pending',
    access: 'metadata_only',
    publicationApproved: false,
    limitations: [
      'ข่าวและกิจกรรมบนเว็บไซต์ไม่มี endpoint ที่มี identifier มั่นคง ใช้เทียบ metadata เท่านั้น',
      'สิทธิ์คัดลอกเนื้อหายังไม่ได้แจ้งความประสงค์ต่อหน่วยงานเจ้าภาพ',
    ],
  },
  {
    id: 'cdd',
    name: 'กรมการพัฒนาชุมชน (CDD) — ทะเบียนวิสาหกิจชุมชนและผลิตภัณฑ์ OTOP',
    agency: 'กระทรวงมหาดไทย',
    sourceUrl: 'https://www.cdd.go.th',
    licenseStatus: 'pending',
    access: 'metadata_only',
    publicationApproved: false,
    limitations: [
      'ทะเบียนวิสาหกิจชุมชนมีการจำหน่ายและระงับสภาพตามรอบปีงบประมาณ ต้องระบุ effective date ก่อนเผยแพร่',
      'รายการผลิตภัณฑ์รายกลุ่มแนบข้อมูลผู้ติดต่อมาด้วย ต้องทำ redaction ก่อนออกจากการเก็บข้อมูลภายใน',
      'ยังไม่ได้ตกลงเงื่อนไข재배포กับหน่วยงานเจ้าภาพ',
    ],
  },
  {
    id: 'tat',
    name: 'การท่องเที่ยวแห่งประเทศไทย (TAT)',
    agency: 'กระทรวงการท่องเที่ยวและกีฬา',
    sourceUrl: 'https://www.tourismthailand.org',
    licenseStatus: 'pending',
    access: 'metadata_only',
    publicationApproved: false,
    limitations: [
      'ตัวเลขผู้เยี่ยมเยือนและรายได้จากการท่องเที่ยวเผยแพร่เป็นรอบรายปี ไม่ใช่รายเดือน',
      'ยังไม่ได้ตรวจสิทธิ์นำตัวเลขมาแสดงต่อใน Data Hub จึงแสดงเฉพาะค่าตัวอย่างพร้อม flag sample',
    ],
  },
  {
    id: 'mots',
    name: 'กระทรวงการท่องเที่ยวและกีฬา — นโยบายท่องเที่ยวเชิงเกษตร',
    agency: 'กระทรวงการท่องเที่ยวและกีฬา',
    sourceUrl: 'https://www.mots.go.th',
    licenseStatus: 'pending',
    access: 'metadata_only',
    publicationApproved: false,
    limitations: [
      'ใช้อ้างอิงนิยาม "การท่องเที่ยวเชิงเกษตร" และขอบเขตแหล่งที่จัดเก็บเท่านั้น',
      'เอกสารนโยบายไม่มีโครงสร้างข้อมูลพร้อม identifier หรือค่าที่ตรวจย้อนกลับได้',
    ],
  },
  {
    id: 'royal-learning-network',
    name: 'เครือข่ายศูนย์เรียนรู้ตามรอยศาสตร์พระราชา (ชื่อชุดข้อมูลใน Data Hub)',
    agency: 'Thailand Agricultural Data Hub',
    sourceUrl: null,
    licenseStatus: 'pending',
    access: 'metadata_only',
    publicationApproved: false,
    limitations: [
      'ยังไม่มีทะเบียนต้นทางที่ระบุ identifier รายศูนย์ จึงสร้างรายการตัวอย่างแบบสมมติทั้งหมด',
      'ห้ามตีความว่าศูนย์ในทะเบียนนี้มีอยู่จริง หรือนำไปอ้างอิงในเอกสารทางราชการ',
    ],
  },
];

/** คำเตือนพื้นฐานที่ติดไปกับทุก response (ต่อท้ายด้วยข้อความแบบมีเงื่อนไขเมื่อกรอง) */
export const AGRI_TOURISM_WARNINGS: string[] = [
  'ตัวเลขทุกชุดใน module นี้เป็นข้อมูลตัวอย่างแบบ deterministic เพื่อสาธิตหน้าจอและการเชื่อมต่อ API เท่านั้น ไม่ใช่สถิติทางการที่ผ่านการทวนสอบ',
  'สิทธิ์เผยแพร่ข้อมูลจริงของกรมส่งเสริมการเกษตร กรมการพัฒนาชุมชน การท่องเที่ยวแห่งประเทศไทย และกระทรวงการท่องเที่ยวและกีฬา ยังอยู่ระหว่างตรวจสอบ (ทุกแหล่งเป็น licenseStatus: pending, publicationApproved: false) จึงออกเฉพาะ metadata ภายใต้ access = metadata_only',
  'ชื่อแหล่งท่องเที่ยว ชุมชน กลุ่มวิสาหกิจ ฟาร์มสเตย์ และบางอำเภอเป็นชื่อสมมติ ห้ามตีความเป็นหน่วยงานหรือผู้ประกอบการที่มีอยู่จริง',
  'การมีรหัสจังหวัดครบ 77 แถวคือขอบเขตตารางอ้างอิง crosswalk ไม่ใช่ข้อสรุปว่ามีการท่องเที่ยวเชิงเกษตรหรือเครือข่ายวิสาหกิจชุมชนจริงครบทุกจังหวัด',
  'ยอดผู้เยี่ยมชมและรายได้ที่ระบุว่า "ประมาณ" เป็นตัวเลขเชิง illustration จากโมเดล scale ต่อจังหวัด ใช้สื่อสารภาพรวมเท่านั้น ห้ามใช้อ้างอิงในเอกสารทางราชการ กฎหมาย หรือการเสนอของบประมาณ',
  'grain ของทะเบียนรายแหล่ง (destinations, workshops, enterprises รายงานผ่าน counts) กับ grain รายจังหวัด (provinceStats, summary) เป็นคนละชุด ห้ามเอาจำนวนแถวของทะเบียนมาลบกับยอดรวมรายจังหวัด',
];

/* ------------------------------------------------------------------ */
/* ทะเบียนแหล่งท่องเที่ยวเชิงเกษตร (curated sample register)              */
/* ------------------------------------------------------------------ */

interface DestinationSeed {
  readonly id: string;
  readonly name: string;
  readonly kind: DestinationKind;
  readonly code: string;
  readonly district: string;
  readonly activities: readonly ActivityId[];
  readonly crops: readonly string[];
  readonly months: readonly number[];
  readonly distance: number | null;
  readonly highlight: string;
}

/**
 * ทะเบียนแหล่งตัวอย่างที่พิมพ์รายแห่งเพื่อให้หน้าจอน่าอ่าน จังหวัดที่กิจกรรม
 * ท่องเที่ยวคึกคักมีหลายแหล่งกว่า ทุกชื่อเป็นสมมติ (AGENTS.md ข้อ 7) ค่าที่
 * derive เพิ่ม (amenities, note) ผูกกับคีย์ `at:dest:<จังหวัด>:<รหัสแหล่ง>`
 * จึงเท่ากันทุก request
 */
const DESTINATION_SEEDS: DestinationSeed[] = [
  /* ---------------- ภาคเหนือ ---------------- */
  {
    id: 'at-50-01', name: 'ฟาร์มสเตย์สมมติบ้านไร่กาแฟแม่กลาง', kind: 'farmstay', code: '50',
    district: 'อำเภอจอมทอง', activities: ['farmstay', 'workshop', 'learning_center'],
    crops: ['กาแฟอาราบิก้า', 'อะโวคาโด', 'ผักเมืองหนาว'], months: [11, 12, 1], distance: 700,
    highlight: 'บ้านพักในสวนกาแฟเชิงดอย มีบทเรียนคั่วกาแฟและแปรรูปผลผลิตของครัวเรือนสมาชิกสมมติ',
  },
  {
    id: 'at-50-02', name: 'ศูนย์เรียนรู้เกษตรพื้นที่สูงสมมติห้วยแก้ว', kind: 'learning_center', code: '50',
    district: 'อำเภอแม่ริม', activities: ['learning_center', 'royal_initiative', 'workshop'],
    crops: ['ผักเมืองหนาว', 'สตรอว์เบอร์รี', 'มะคาเดเมีย'], months: [12, 1, 2], distance: 720,
    highlight: 'แปลงสาธิตผักและไม้ดอกเมืองหนาวพร้อมจุดบรรยายเรื่องการจัดการน้ำบนพื้นที่สูง',
  },
  {
    id: 'at-50-03', name: 'ตลาดนัดชุมชนสมมติเวียงพิงค์', kind: 'market', code: '50',
    district: 'อำเภอเมืองเชียงใหม่', activities: ['otop_market', 'fruit_festival', 'workshop'],
    crops: ['ลำไย', 'กาแฟ', 'กระเทียม'], months: [8, 9, 12], distance: 700,
    highlight: 'รวมสินค้ากลุ่มอาชีพจากทั่วจังหวัด มีมุมชิมผลไม้ตามฤดูและงานหัตถกรรมทุกสุดสัปดาห์',
  },
  {
    id: 'at-51-01', name: 'ศูนย์เรียนรู้แปลงใหญ่ลำไยสมมติบ้านสอง', kind: 'learning_center', code: '51',
    district: 'อำเภอเมืองลำพูน', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['ลำไย', 'กระเทียม', 'ข้าวกล้อง'], months: [8, 9], distance: 560,
    highlight: 'เรียนรู้วงจรแปลงใหญ่ลำไยตั้งแต่ตัดแต่งช่อผลจนถึงคัดบรรจุ ต่อด้วยรอบเก็บผลในแปลง',
  },
  {
    id: 'at-52-01', name: 'วิสาหกิจชุมชนท่องเที่ยวสมมตินาครัว', kind: 'community_enterprise', code: '52',
    district: 'อำเภอเกาะคา', activities: ['community_enterprise', 'workshop', 'otop_market'],
    crops: ['ถั่วลิสง', 'ข้าว', 'สมุนไพร'], months: [11, 12, 1], distance: 600,
    highlight: 'เส้นทางเดินชมแปลงนาและโรงเรือนสมุนไพร พร้อมอาหารถิ่นจากกลุ่มแม่บ้านของตำบลสมมติ',
  },
  {
    id: 'at-53-01', name: 'ฟาร์มสเตย์สมมติลับแลผลไม้น้ำ', kind: 'farmstay', code: '53',
    district: 'อำเภอลับแล', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['ลองกอง', 'ทุเรียน', 'ข้าว'], months: [8, 9], distance: 540,
    highlight: 'ค้างแรมในสวนผลไม้ที่ราบสูงฝั่งตะวันออกของจังหวัด เก็บลองกองด้วยมือตอนเช้าและเรียนวิธีแต่งกิ่งกับเจ้าของแปลง',
  },
  {
    id: 'at-54-01', name: 'ศูนย์เรียนรู้เกษตรอินทรีย์สมมติเมืองแพร่', kind: 'learning_center', code: '54',
    district: 'อำเภอเมืองแพร่', activities: ['learning_center', 'workshop', 'otop_market'],
    crops: ['ข้าว', 'อะโวคาโด', 'สมุนไพร'], months: [10, 11, 12], distance: 550,
    highlight: 'ธนาคารเมล็ดพันธุ์ข้าวพื้นเมืองและเวิร์กช็อปทำน้ำหมักชีวภาพสำหรับผู้มาเยือนกลุ่มเล็ก',
  },
  {
    id: 'at-55-01', name: 'ฟาร์มสเตย์สมมติบ้านปัวนาขั้นบันได', kind: 'farmstay', code: '55',
    district: 'อำเภอปัว', activities: ['farmstay', 'learning_center', 'workshop'],
    crops: ['ข้าว', 'กาแฟ', 'ผักอินทรีย์'], months: [11, 12, 1], distance: 750,
    highlight: 'นาขั้นบันไดกับบ้านไม้รับรองกลุ่มเล็ก มีรอบสาธิตสีข้าวและคั่วข้าวกล้องทุกบ่าย',
  },
  {
    id: 'at-55-02', name: 'วิสาหกิจชุมชนทอผ้าและกาแฟสมมติเมืองน่าน', kind: 'community_enterprise', code: '55',
    district: 'อำเภอเมืองน่าน', activities: ['community_enterprise', 'workshop', 'otop_market'],
    crops: ['กาแฟ', 'ข้าว', 'งา'], months: [1, 11, 12], distance: 760,
    highlight: 'ดูกระบวนการย้อมสีธรรมชาติในโรงทอ และชิมกาแฟคั่วโดยสมาชิกกลุ่มของตำบลสมมติ',
  },
  {
    id: 'at-56-01', name: 'ศูนย์เรียนรู้ตามรอยศาสตร์พระราชาสมมติกว๊าน', kind: 'royal_initiative', code: '56',
    district: 'อำเภอเมืองพะเยา', activities: ['royal_initiative', 'learning_center', 'workshop'],
    crops: ['ข้าว', 'ถั่วเหลือง', 'กาแฟ'], months: [11, 12], distance: 700,
    highlight: 'แปลงนาสาธิตคู่กับการจัดการน้ำรอบกว๊าน จัดเป็นเส้นทางเรียนรู้ครึ่งวันพร้อมวิทยากร',
  },
  {
    id: 'at-57-01', name: 'ฟาร์มสเตย์สมมติไร่ชาแม่จัน', kind: 'farmstay', code: '57',
    district: 'อำเภอแม่จัน', activities: ['farmstay', 'learning_center', 'workshop'],
    crops: ['ชา', 'กาแฟ', 'สับปะรด'], months: [11, 12, 1], distance: 830,
    highlight: 'เก็บใบชาตอนเช้าและเรียนวิธีคั่วชาแบบครัวเรือน พร้อมที่พักแบบโฮมสเตย์ของกลุ่มสมมติ',
  },
  {
    id: 'at-57-02', name: 'แหล่งเรียนรู้เกษตรที่สูงตามรอยศาสตร์พระราชาสมมติเชียงราย', kind: 'royal_initiative', code: '57',
    district: 'อำเภอเมืองเชียงราย', activities: ['royal_initiative', 'learning_center', 'fruit_festival'],
    crops: ['สตรอว์เบอร์รี', 'พลับ', 'มะเขือเทศ'], months: [12, 1, 2], distance: 810,
    highlight: 'แปลงไม้ผลเมืองหนาวกับนิทรรศการโครงการพระราชดำริ เหมาะกับเที่ยวช่วงฤดูเย็น',
  },
  {
    id: 'at-58-01', name: 'วิสาหกิจชุมชนเกษตรที่สูงสมมติปาย', kind: 'community_enterprise', code: '58',
    district: 'อำเภอปาย', activities: ['community_enterprise', 'farmstay', 'workshop'],
    crops: ['กระเทียม', 'ถั่วเหลือง', 'ข้าวโพด'], months: [11, 12, 1], distance: 880,
    highlight: 'รอบเดินชมแปลงและเวิร์กช็อปอาหารถิ่นจากถั่วเหลืองสำหรับกลุ่มขนาดเล็ก',
  },
  {
    id: 'at-60-01', name: 'ศูนย์เรียนรู้ข้าวและอ้อยสมมติปากน้ำโพ', kind: 'learning_center', code: '60',
    district: 'อำเภอเมืองนครสวรรค์', activities: ['learning_center', 'workshop', 'otop_market'],
    crops: ['ข้าว', 'อ้อย', 'มะขาม'], months: [11, 12, 1], distance: 280,
    highlight: 'นิทรรศการห่วงโซ่ข้าวและอ้อยของลุ่มน้ำเจ้าพระยา พร้อมตลาดชุมชนทุกเสาร์-อาทิตย์',
  },
  {
    id: 'at-61-01', name: 'ศูนย์เรียนรู้ตามรอยศาสตร์พระราชาสมมติห้วยคต', kind: 'royal_initiative', code: '61',
    district: 'อำเภอห้วยคต', activities: ['royal_initiative', 'learning_center', 'workshop'],
    crops: ['ข้าว', 'สมุนไพร', 'กาแฟ'], months: [11, 12], distance: 270,
    highlight: 'แหล่งเรียนรู้เกษตรทฤษฎีใหม่บนพื้นที่เปลี่ยนผ่านจากไร่ข้าวโพด จัดรอบบรรยายเป็นกลุ่ม',
  },
  {
    id: 'at-62-01', name: 'ตลาดชุมชนและงานผลไม้สมมติกล้วยไข่', kind: 'market', code: '62',
    district: 'อำเภอเมืองกำแพงเพชร', activities: ['otop_market', 'fruit_festival', 'workshop'],
    crops: ['กล้วยไข่', 'ข้าว', 'อ้อย'], months: [10, 11], distance: 420,
    highlight: 'รอบฤดูกล้วยไข่มีซุ้มจำหน่ายของกลุ่มอาชีพและเวิร์กช็อปกล้วยตากพลังงานแสงอาทิตย์',
  },
  {
    id: 'at-63-01', name: 'วิสาหกิจชุมชนสมมติชายแดนตาก', kind: 'community_enterprise', code: '63',
    district: 'อำเภอสมมติ', activities: ['community_enterprise', 'workshop', 'learning_center'],
    crops: ['กาแฟ', 'ข้าว', 'สมุนไพร'], months: [11, 12, 1], distance: null,
    highlight: 'กลุ่มเกษตรชายแดนสาธิตการแปรรูปกาแฟและสมุนไพร เส้นทางเข้าถึงต้องตรวจสอบก่อนเดินทาง',
  },
  {
    id: 'at-64-01', name: 'ศูนย์เรียนรู้ชุมชนท่องเที่ยวสมมติศรีสัชนาลัย', kind: 'community_enterprise', code: '64',
    district: 'อำเภอศรีสัชนาลัย', activities: ['community_enterprise', 'workshop', 'otop_market'],
    crops: ['ข้าว', 'งา', 'ถั่วลิสง'], months: [11, 12], distance: 500,
    highlight: 'เรียนวิธีเก็บผักพื้นบ้านและเวิร์กช็อปขนมงาของกลุ่มผู้สูงอายุในตำบลสมมติ',
  },
  {
    id: 'at-65-01', name: 'ศูนย์เรียนรู้เกษตรผสมผสานสมมติเมืองสองแคว', kind: 'learning_center', code: '65',
    district: 'อำเภอเมืองพิษณุโลก', activities: ['learning_center', 'workshop', 'large_scale_group'],
    crops: ['ข้าว', 'มะม่วง', 'สมุนไพร'], months: [3, 4, 11], distance: 400,
    highlight: 'แปลงนาสาธิตกับแปลงมะม่วงนอกฤดูเป็นจุดเรียนรู้หลักของเครือข่าย ศพก. ระดับจังหวัด',
  },
  {
    id: 'at-65-02', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติเขาค้อ', kind: 'royal_initiative', code: '65',
    district: 'อำเภอเขาค้อ', activities: ['royal_initiative', 'learning_center', 'farmstay'],
    crops: ['สตรอว์เบอร์รี', 'ข้าวโพดหวาน', 'กาแฟ'], months: [11, 12, 1], distance: 420,
    highlight: 'เรียนรู้การเปลี่ยนผ่านพื้นที่สูงเป็นเกษตรเมืองหนาว มีลานกางเต็นท์ในแปลงสาธิต',
  },
  {
    id: 'at-66-01', name: 'ศูนย์เรียนรู้ข้าวและมะม่วงสมมติเมืองพิจิตร', kind: 'learning_center', code: '66',
    district: 'อำเภอเมืองพิจิตร', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['ข้าว', 'มะม่วง', 'ถั่วลิสง'], months: [3, 4, 11], distance: 470,
    highlight: 'แปลงสาธิตข้าวพื้นเมืองและโรงเรือนมะม่วง เปิดให้ชมรอบการตัดแต่งผลก่อนฤดูเก็บ',
  },
  {
    id: 'at-67-01', name: 'ศูนย์เรียนรู้แปลงใหญ่ลำไยสมมติเพชรบูรณ์', kind: 'learning_center', code: '67',
    district: 'อำเภอเมืองเพชรบูรณ์', activities: ['learning_center', 'fruit_festival', 'large_scale_group'],
    crops: ['ลำไย', 'มะขาม', 'ข้าว'], months: [8, 9], distance: 400,
    highlight: 'ช่วงเก็บเกี่ยวลำไยมีรอบเข้าชมแปลงและจุดคัดบรรจุที่เปิดดูกระบวนการทั้งสาย',
  },
  {
    id: 'at-67-02', name: 'ฟาร์มสเตย์สมมติภูผาหมอก', kind: 'farmstay', code: '67',
    district: 'อำเภอเขาค้อ', activities: ['farmstay', 'workshop', 'learning_center'],
    crops: ['สตรอว์เบอร์รี', 'ผักเมืองหนาว', 'กาแฟ'], months: [12, 1, 2], distance: 430,
    highlight: 'ที่พักบนเนินอากาศเย็นกับเวิร์กช็อปแปรรูปและอบแห้งผลผลิตของกลุ่มสมาชิก',
  },
  /* ---------------- ภาคตะวันออกเฉียงเหนือ ---------------- */
  {
    id: 'at-30-01', name: 'ศูนย์เรียนรู้ข้าวหอมมะลิแปลงใหญ่สมมติโคราช', kind: 'learning_center', code: '30',
    district: 'อำเภอพิมาย', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['ข้าวหอมมะลิ', 'ข้าวโพดเลี้ยงสัตว์', 'มันสำปะหลัง'], months: [11, 12], distance: 290,
    highlight: 'รอบสาธิตนาข้าวหอมมะลิแปลงใหญ่และสีข้าวด้วยมือ ผู้มาเยือนรับข้าวกล้องตัวอย่างกลับได้',
  },
  {
    id: 'at-30-02', name: 'ฟาร์มสเตย์สมมติไร่องุ่นสีคิ้ว', kind: 'farmstay', code: '30',
    district: 'อำเภอปากช่อง', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['องุ่น', 'มะม่วง', 'ข้าวโพดหวาน'], months: [1, 2, 11], distance: 210,
    highlight: 'ฤดูองุ่นสุกมีเก็บพวงในโรงเรือนและเวิร์กช็อปทำน้ำองุ่นพาสเจอไรซ์ของฟาร์มสมมติ',
  },
  {
    id: 'at-30-03', name: 'ตลาดชุมชนรวมสินค้ากลุ่มอาชีพสมมติโคราช', kind: 'market', code: '30',
    district: 'อำเภอเมืองนครราชสีมา', activities: ['otop_market', 'community_enterprise', 'workshop'],
    crops: ['ข้าว', 'มันสำปะหลัง', 'ไหม'], months: [10, 11, 12], distance: 260,
    highlight: 'รวมสินค้าจากกลุ่มอาชีพหลายอำเภอของจังหวัด พร้อมมุมเวิร์กช็อปจักสานและทอผ้า',
  },
  {
    id: 'at-31-01', name: 'วิสาหกิจชุมชนผ้าไหมสมมติบ้านบุ', kind: 'community_enterprise', code: '31',
    district: 'อำเภอเมืองบุรีรัมย์', activities: ['community_enterprise', 'workshop', 'otop_market'],
    crops: ['ไหม', 'ข้าว', 'อ้อย'], months: [1, 2, 11], distance: 410,
    highlight: 'ดูวงจรไหมตั้งแต่เลี้ยงหนอนจนถึงทอผ้าในโรงเรือนชุมชน มีจุดจำหน่ายผ้าสำเร็จรูป',
  },
  {
    id: 'at-32-01', name: 'กลุ่มทอผ้าและข้าวหอมมะลิสมมติทุ่งกุลาร้องไห้', kind: 'community_enterprise', code: '32',
    district: 'อำเภอชุมพลบุรี', activities: ['community_enterprise', 'learning_center', 'workshop'],
    crops: ['ข้าวหอมมะลิ', 'ไหม', 'งา'], months: [11, 12, 3], distance: 480,
    highlight: 'ศูนย์ย้อมไหมด้วยสีธรรมชาติคู่กับแปลงหม่อนที่เปิดให้เก็บผลในช่วงฤดูสั้น ๆ',
  },
  {
    id: 'at-33-01', name: 'ศูนย์เรียนรู้ผลไม้และหอมแดงสมมติกันทรลักษ์', kind: 'learning_center', code: '33',
    district: 'อำเภอกันทรลักษ์', activities: ['learning_center', 'fruit_festival', 'workshop'],
    crops: ['ทุเรียน', 'ลองกอง', 'หอมแดง'], months: [6, 7, 8], distance: 550,
    highlight: 'ผลไม้ฝั่งตะวันออกของอีสานกับแปลงหอมแดงดินเค็ม เรียนรู้การเก็บรักษาหลังฤดูเก็บ',
  },
  {
    id: 'at-34-01', name: 'ฟาร์มสเตย์สมมตินาเมืองอุบล', kind: 'farmstay', code: '34',
    district: 'อำเภอเมืองอุบลราชธานี', activities: ['farmstay', 'learning_center', 'community_enterprise'],
    crops: ['ข้าว', 'ผักอินทรีย์', 'ยางพารา'], months: [11, 12, 1], distance: 620,
    highlight: 'บ้านพักกลางนาพร้อมรอบเก็บผักอินทรีย์และเวิร์กช็อปอาหารถิ่นจากข้าวเบือ',
  },
  {
    id: 'at-34-02', name: 'ตลาดชุมชนสมมติริมมูล', kind: 'market', code: '34',
    district: 'อำเภอวารินชำราบ', activities: ['otop_market', 'community_enterprise', 'fruit_festival'],
    crops: ['ข้าว', 'ฟักทอง', 'มะม่วง'], months: [10, 11, 12], distance: 610,
    highlight: 'ตลาดนัดของกลุ่มอาชีพที่รวมของกินถิ่นอุบลราชธานีและผลไม้ตามฤดูไว้จุดเดียว',
  },
  {
    id: 'at-35-01', name: 'ศูนย์เรียนรู้ข้าวอินทรีย์สมมติเมืองยโสธร', kind: 'learning_center', code: '35',
    district: 'อำเภอเมืองยโสธร', activities: ['learning_center', 'workshop', 'large_scale_group', 'otop_market'],
    crops: ['ข้าวอินทรีย์', 'งา', 'ถั่วลิสง'], months: [11, 12], distance: 560,
    highlight: 'แปลงนาอินทรีย์ของกลุ่มสมาชิกรายใหญ่ มีตลาดข้าวและผลผลิตหมุนเวียนทุกฤดูหนาว',
  },
  {
    id: 'at-36-01', name: 'วิสาหกิจชุมชนสมมติภูเขียว', kind: 'community_enterprise', code: '36',
    district: 'อำเภอภูเขียว', activities: ['community_enterprise', 'workshop', 'learning_center'],
    crops: ['ข้าว', 'อ้อย', 'สมุนไพร'], months: [11, 12, 1], distance: 430,
    highlight: 'โรงเรือนสมุนไพรและแปลงนาสาธิตที่เปิดให้กลุ่มเรียนรู้ลงมือทำเองครึ่งวัน',
  },
  {
    id: 'at-40-01', name: 'ศูนย์เรียนรู้แปลงใหญ่ข้าวสมมติน้ำพอง', kind: 'learning_center', code: '40',
    district: 'อำเภอน้ำพอง', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['ข้าวหอมมะลิ', 'อ้อย', 'ไหม'], months: [11, 12, 1], distance: 450,
    highlight: 'จุดเรียนรู้การลดต้นทุนผลิตข้าวของเครือข่าย ศพก. พร้อมเวิร์กช็อปแปรรูปปลายนา',
  },
  {
    id: 'at-40-02', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติขอนแก่น', kind: 'royal_initiative', code: '40',
    district: 'อำเภอเมืองขอนแก่น', activities: ['royal_initiative', 'learning_center', 'workshop'],
    crops: ['ข้าว', 'มะเขือ', 'สมุนไพร'], months: [11, 12], distance: 440,
    highlight: 'โคก หนอง นา โมเดลขนาดจริงสำหรับคณะศึกษาดูงาน จัดรอบบรรยายและแปลงปฏิบัติได้',
  },
  {
    id: 'at-41-01', name: 'ตลาดชุมชนและกลุ่มอาชีพสมมติอุดรธานี', kind: 'market', code: '41',
    district: 'อำเภอเมืองอุดรธานี', activities: ['otop_market', 'community_enterprise', 'workshop'],
    crops: ['ข้าว', 'หอมแดง', 'ยางพารา'], months: [10, 11, 12], distance: 510,
    highlight: 'แหล่งรวมสินค้าชุมชนจากหลายกลุ่มอาชีพของจังหวัด มีมุมชิมอาหารถิ่นทุกเย็นวันศุกร์',
  },
  {
    id: 'at-42-01', name: 'ฟาร์มสเตย์สมมติเชียงคานบ้านริมโขง', kind: 'farmstay', code: '42',
    district: 'อำเภอเชียงคาน', activities: ['farmstay', 'learning_center', 'otop_market'],
    crops: ['ข้าว', 'กาแฟ', 'ส้มเขียวหวาน'], months: [11, 12, 1], distance: 520,
    highlight: 'ที่พักในสวนริมแม่น้ำพร้อมตักบาตรเช้าและรอบเรียนรู้การคั่วกาแฟของครัวเรือนสมาชิก',
  },
  {
    id: 'at-42-02', name: 'วิสาหกิจชุมชนไม้ผลอากาศเย็นสมมติภูเรือ', kind: 'community_enterprise', code: '42',
    district: 'อำเภอภูเรือ', activities: ['community_enterprise', 'fruit_festival', 'workshop'],
    crops: ['สตรอว์เบอร์รี', 'กาแฟ', 'ผักเมืองหนาว'], months: [12, 1, 2], distance: 540,
    highlight: 'แปลงสตรอว์เบอร์รีบนภูกับเวิร์กช็อปแปรรูปผลไม้ฤดูหนาวของกลุ่มสมาชิก',
  },
  {
    id: 'at-43-01', name: 'วิสาหกิจชุมชนทอผ้าและข้าวสมมติหนองคาย', kind: 'community_enterprise', code: '43',
    district: 'อำเภอเมืองหนองคาย', activities: ['community_enterprise', 'otop_market', 'workshop'],
    crops: ['ข้าว', 'ถั่วลิสง', 'สมุนไพร'], months: [11, 12], distance: 610,
    highlight: 'โรงทอผ้ากับแปลงสมุนไพรที่รับคณะเยี่ยมชมกลุ่มเล็ก และจำหน่ายผลผลิตของสมาชิก',
  },
  {
    id: 'at-44-01', name: 'ศูนย์เรียนรู้ข้าวและมะม่วงสมมติมหาสารคาม', kind: 'learning_center', code: '44',
    district: 'อำเภอเมืองมหาสารคาม', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['ข้าว', 'อ้อย', 'มะม่วง'], months: [3, 4, 11], distance: 480,
    highlight: 'ตารางเรียนแปลงนามะม่วงหมุนตามฤดู พร้อมจุดสาธิตการให้น้ำแบบประหยัด',
  },
  {
    id: 'at-45-01', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติร้อยเอ็ด', kind: 'royal_initiative', code: '45',
    district: 'อำเภอเมืองร้อยเอ็ด', activities: ['royal_initiative', 'learning_center', 'workshop', 'otop_market'],
    crops: ['ข้าว', 'ไหม', 'ผักพื้นบ้าน'], months: [11, 12], distance: 480,
    highlight: 'ศูนย์สาธิตเกษตรทฤษฎีใหม่และการจัดการน้ำชุมชน มีตลาดข้าวใหม่ในฤดูหนาว',
  },
  {
    id: 'at-46-01', name: 'วิสาหกิจชุมชนข้าวและสมุนไพรสมมติเขาวง', kind: 'community_enterprise', code: '46',
    district: 'อำเภอเขาวง', activities: ['community_enterprise', 'learning_center', 'workshop'],
    crops: ['ข้าว', 'มันสำปะหลัง', 'สมุนไพร'], months: [11, 12, 1], distance: 510,
    highlight: 'โรงอบสมุนไพรกับแปลงข้าวที่รับกลุ่มเรียนรู้เรื่องดินและน้ำในแอ่งกาฬสินธุ์',
  },
  {
    id: 'at-47-01', name: 'ตลาดชุมชนสมมติสกลนคร', kind: 'market', code: '47',
    district: 'อำเภอเมืองสกลนคร', activities: ['otop_market', 'community_enterprise', 'workshop'],
    crops: ['ข้าว', 'ยางพารา', 'หอมแดง'], months: [10, 11, 12], distance: 600,
    highlight: 'รวมงานหัตถกรรมและผลผลิตของกลุ่มอาชีพริมหนองหาน เปิดรอบเรียนรู้ทำผ้าทอมือ',
  },
  {
    id: 'at-48-01', name: 'ฟาร์มสเตย์สมมตินครพนมริมโขง', kind: 'farmstay', code: '48',
    district: 'อำเภอเมืองนครพนม', activities: ['farmstay', 'workshop', 'otop_market'],
    crops: ['ข้าว', 'กาแฟ', 'มะม่วง'], months: [11, 12, 1], distance: 630,
    highlight: 'บ้านพักริมทุ่งนาพร้อมรอบเก็บผักและเวิร์กช็อปกาแฟของสมาชิกกลุ่มท่องเที่ยว',
  },
  {
    id: 'at-49-01', name: 'ศูนย์เรียนรู้เกษตรผสมผสานสมมติคำชะอี', kind: 'learning_center', code: '49',
    district: 'อำเภอคำชะอี', activities: ['learning_center', 'workshop', 'community_enterprise'],
    crops: ['ข้าว', 'กาแฟ', 'สมุนไพร'], months: [11, 12], distance: 520,
    highlight: 'แปลงผสมผสานบนที่ลาดชัน สอนการทำปุ๋ยหมักและการเก็บกาแฟเชอรี่ของครัวเรือน',
  },

  /* ---------------- ภาคกลาง ---------------- */
  {
    id: 'at-10-01', name: 'ศูนย์เรียนรู้เกษตรเมืองสมมติหนองจอก', kind: 'learning_center', code: '10',
    district: 'เขตหนองจอก', activities: ['learning_center', 'workshop', 'otop_market'],
    crops: ['ข้าว', 'ผักพื้นบ้าน', 'มะนาว'], months: [11, 12, 1], distance: 40,
    highlight: 'นาข้าวแปลงสุดท้ายของมหานครกับเวิร์กช็อปเกษตรเมืองที่โรงเรียนชุมชนจัดทุกเดือน',
  },
  {
    id: 'at-10-02', name: 'วิสาหกิจชุมชนเกษตรริมคลองสมมติบางขุนเทียน', kind: 'community_enterprise', code: '10',
    district: 'เขตบางขุนเทียน', activities: ['community_enterprise', 'workshop', 'learning_center'],
    crops: ['มะม่วง', 'ผักพื้นบ้าน', 'มะพร้าวน้ำหอม'], months: [3, 4, 11], distance: 25,
    highlight: 'กลุ่มปลูกผักและดูแลระบบนิเวศชายฝั่ง จัดรอบเรียนรู้สั้นสำหรับคณะในกรุงเทพฯ',
  },
  {
    id: 'at-11-01', name: 'ฟาร์มสเตย์สมมติสวนมะม่วงบางบ่อ', kind: 'farmstay', code: '11',
    district: 'อำเภอบางบ่อ', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['มะม่วง', 'มะพร้าวน้ำหอม', 'ส้มโอ'], months: [3, 4, 5], distance: 45,
    highlight: 'สวนมะม่วงใกล้เมืองที่เข้าพักได้ มีรอบชิมผลไม้และเวิร์กช็อปขนมจากมะม่วงสุก',
  },
  {
    id: 'at-12-01', name: 'ตลาดน้ำและสวนสมมติไทรน้อย', kind: 'market', code: '12',
    district: 'อำเภอไทรน้อย', activities: ['otop_market', 'fruit_festival', 'workshop'],
    crops: ['ส้มโอ', 'มะม่วง', 'ข้าว'], months: [4, 5, 6], distance: 25,
    highlight: 'ตลาดชุมชนในสวนส้มโอ รอบเช้ามีเก็บผลและเรียนวิธีห่อผลไม้กับเจ้าของแปลง',
  },
  {
    id: 'at-13-01', name: 'วิสาหกิจชุมชนเกษตรเมืองสมมติลำลูกกา', kind: 'community_enterprise', code: '13',
    district: 'อำเภอลำลูกกา', activities: ['community_enterprise', 'workshop', 'otop_market'],
    crops: ['ข้าว', 'มะม่วง', 'ผักพื้นบ้าน'], months: [11, 12], distance: 35,
    highlight: 'กลุ่มแปรรูปข้าวและผักในเขตปริมณฑล เปิดโรงเรือนให้คณะเรียนรู้ง่ายด้วยจักรยาน',
  },
  {
    id: 'at-14-01', name: 'ศูนย์เรียนรู้ข้าวและสมุนไพรสมมติอยุธยา', kind: 'learning_center', code: '14',
    district: 'อำเภอเมืองพระนครศรีอยุธยา', activities: ['learning_center', 'large_scale_group', 'otop_market'],
    crops: ['ข้าว', 'หอมแดง', 'ถั่วลิสง'], months: [11, 12, 1], distance: 80,
    highlight: 'นาข้าวรอบเกาะเมืองกับนิทรรศการข้าวพื้นเมือง และตลาดชุมชนทุกสุดสัปดาห์',
  },
  {
    id: 'at-16-01', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติลพบุรี', kind: 'royal_initiative', code: '16',
    district: 'อำเภอพัฒนานิคม', activities: ['royal_initiative', 'learning_center', 'workshop'],
    crops: ['ข้าว', 'สมุนไพร', 'ถั่วลิสง'], months: [11, 12], distance: 200,
    highlight: 'ศูนย์เรียนรู้การจัดสรรน้ำและเกษตรทฤษฎีใหม่สำหรับคณะศึกษาดูงานเป็นกลุ่ม',
  },
  {
    id: 'at-19-01', name: 'ฟาร์มสเตย์สมมติแก่งคอย', kind: 'farmstay', code: '19',
    district: 'อำเภอแก่งคอย', activities: ['farmstay', 'learning_center', 'workshop'],
    crops: ['อ้อย', 'ข้าว', 'มะม่วง'], months: [11, 12, 3], distance: 120,
    highlight: 'ที่พักกลางไร่หมุนเวียนริมทางหลวงสายหลัก มีรอบสาธิตการทำน้ำตาลและถ่านจากวัสดุเหลือใช้',
  },
  {
    id: 'at-70-01', name: 'ตลาดชุมชนผลไม้อบกรอบสมมติราชบุรี', kind: 'market', code: '70',
    district: 'อำเภอจอมบึง', activities: ['otop_market', 'fruit_festival', 'workshop'],
    crops: ['ส้มโอ', 'มะพร้าว', 'อ้อย'], months: [4, 5, 11], distance: 110,
    highlight: 'แหล่งรวมผลไม้แปรรูปและผักอินทรีย์ของกลุ่มสมาชิก มีมุมขายส่งผลผลิตวันเสาร์',
  },
  {
    id: 'at-70-02', name: 'วิสาหกิจชุมชนสมมติโรงตาลราชบุรี', kind: 'community_enterprise', code: '70',
    district: 'อำเภอเมืองราชบุรี', activities: ['community_enterprise', 'workshop', 'learning_center'],
    crops: ['น้ำตาลมะพร้าว', 'ส้มโอ', 'ผักพื้นบ้าน'], months: [3, 4, 5], distance: 100,
    highlight: 'ลงมือเคี่ยวตาลในกระทะและเรียนวิธีขึ้นรูปน้ำตาลปึกกับสมาชิกกลุ่ม',
  },
  {
    id: 'at-71-01', name: 'ฟาร์มสเตย์สมมติบ้านริมน้ำแคว', kind: 'farmstay', code: '71',
    district: 'อำเภอเมืองกาญจนบุรี', activities: ['farmstay', 'learning_center', 'fruit_festival'],
    crops: ['มะขาม', 'ข้าว', 'อ้อย'], months: [11, 12], distance: 130,
    highlight: 'สวนมะขามหวานริมแควที่มีรอบทำมะขามคลุกและพักในเรือนแถวของกลุ่มท่องเที่ยว',
  },
  {
    id: 'at-72-01', name: 'ศูนย์เรียนรู้ข้าวและอ้อยสมมติสุพรรณบุรี', kind: 'learning_center', code: '72',
    district: 'อำเภอเมืองสุพรรณบุรี', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['ข้าว', 'อ้อย', 'มะม่วง'], months: [11, 12, 1], distance: 110,
    highlight: 'จุดสาธิตเครื่องจักรกลการเกษตรของแปลงใหญ่ และเวิร์กช็อปอาหารถิ่นจากข้าว',
  },
  {
    id: 'at-73-01', name: 'ตลาดน้ำและสวนส้มโอล่องแพสมมติสามพราน', kind: 'market', code: '73',
    district: 'อำเภอสามพราน', activities: ['otop_market', 'fruit_festival', 'workshop'],
    crops: ['ส้มโอ', 'มะพร้าว', 'ฝรั่ง'], months: [4, 5, 6], distance: 35,
    highlight: 'สวนส้มโอใกล้เมืองที่เดินเรียนวงจรผลได้ พร้อมตลาดชุมชนที่รวมกลุ่มอาชีพหลายจังหวัด',
  },
  {
    id: 'at-74-01', name: 'ฟาร์มสเตย์สมมติไร่องุ่นบ้านแพ้ว', kind: 'farmstay', code: '74',
    district: 'อำเภอบ้านแพ้ว', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['องุ่น', 'มะนาว', 'ส้มโอ'], months: [1, 2, 11], distance: 60,
    highlight: 'โรงเรือนองุ่นใกล้กรุงเทพฯ เก็บพวงเองได้และมีเวิร์กช็อปทำไวน์ผลไม้ชุมชน',
  },
  {
    id: 'at-75-01', name: 'วิสาหกิจชุมชนสมมติอัมพวาชาวสวน', kind: 'community_enterprise', code: '75',
    district: 'อำเภออัมพวา', activities: ['community_enterprise', 'fruit_festival', 'workshop'],
    crops: ['ส้มโอ', 'มะพร้าวน้ำหอม', 'น้ำตาลมะพร้าว'], months: [4, 5, 6], distance: 72,
    highlight: 'รอบล่องสวนชมการขึ้นตาลและเคี่ยวน้ำตาลมะพร้าวกับครอบครัวสมาชิกกลุ่ม',
  },
  {
    id: 'at-76-01', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติแก่งกระจาน', kind: 'royal_initiative', code: '76',
    district: 'อำเภอแก่งกระจาน', activities: ['royal_initiative', 'learning_center', 'workshop'],
    crops: ['สับปะรด', 'ข้าว', 'มะนาว'], months: [6, 7, 11], distance: 190,
    highlight: 'ศูนย์เรียนรู้การจัดการน้ำและการปลูกพืชแซมป่า จัดเส้นทางศึกษาธรรมชาติสำหรับกลุ่ม',
  },
  {
    id: 'at-76-02', name: 'ฟาร์มสเตย์สมมติสวนสับปะรดท่ายาง', kind: 'farmstay', code: '76',
    district: 'อำเภอท่ายาง', activities: ['farmstay', 'fruit_festival', 'otop_market'],
    crops: ['สับปะรด', 'ขนุน', 'มะม่วง'], months: [5, 6, 7], distance: 130,
    highlight: 'พักในสวนสับปะรดช่วงฤดูเก็บ มีรอบตัดผลและแปรรูปเป็นแยมโดยกลุ่มแม่บ้าน',
  },
  {
    id: 'at-77-01', name: 'ศูนย์เรียนรู้แปลงใหญ่สับปะรดสมมติสามร้อยยอด', kind: 'learning_center', code: '77',
    district: 'อำเภอสามร้อยยอด', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['สับปะรด', 'ข้าว', 'มะพร้าว'], months: [6, 7], distance: 290,
    highlight: 'เรียนรู้วงจรสับปะรดโรงงานของแปลงใหญ่ ตั้งแต่เพาะหน่อจนถึงส่งเข้าสายคัดเกรด',
  },
  {
    id: 'at-77-02', name: 'ฟาร์มสเตย์สมมติไร่ผลไม้หัวหิน', kind: 'farmstay', code: '77',
    district: 'อำเภอหัวหิน', activities: ['farmstay', 'workshop', 'otop_market'],
    crops: ['สับปะรด', 'มะม่วง', 'มะพร้าว'], months: [5, 6, 7], distance: 210,
    highlight: 'บ้านพักในสวนใกล้ทะเล มีรอบชิมสับปะรดและตลาดเล็กของกลุ่มอาชีพทุกเย็น',
  },

  /* ---------------- ภาคตะวันออก ---------------- */
  {
    id: 'at-20-01', name: 'ตลาดผลไม้และสวนสมมติบ้านบึง', kind: 'market', code: '20',
    district: 'อำเภอบ้านบึง', activities: ['otop_market', 'fruit_festival', 'workshop'],
    crops: ['ขนุน', 'ส้มโอ', 'มะม่วง'], months: [4, 5, 6], distance: 95,
    highlight: 'จุดรวมผลไม้จากสวนรอบเมือง ชิมขนุนสายพันธุ์ถิ่นและเรียนวิธีแปรรูปเป็นขนม',
  },
  {
    id: 'at-21-01', name: 'ฟาร์มสเตย์สมมติสวนร่วมแรงระยอง', kind: 'farmstay', code: '21',
    district: 'อำเภอบ้านค่าย', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['ทุเรียน', 'มังคุด', 'สละ'], months: [5, 6, 7], distance: 180,
    highlight: 'ค้างแรมในสวนผลไม้ เก็บทุเรียนตอนเช้ากับเจ้าของแปลงและชิมมังคุดทันทีหลังตัด',
  },
  {
    id: 'at-21-02', name: 'ศูนย์เรียนรู้ผลไม้และยางพาราสมมติระยอง', kind: 'learning_center', code: '21',
    district: 'อำเภอเมืองระยอง', activities: ['learning_center', 'large_scale_group', 'fruit_festival'],
    crops: ['ทุเรียน', 'ยางพารา', 'สละ'], months: [5, 6, 7], distance: 190,
    highlight: 'แปลงสาธิตทุเรียนกับจุดกรีดยาง จัดรอบเรียนรู้สองอาชีพหลักของภาคตะวันออก',
  },
  {
    id: 'at-22-01', name: 'ฟาร์มสเตย์สมมติสวนผลไม้ขลุง', kind: 'farmstay', code: '22',
    district: 'อำเภอขลุง', activities: ['farmstay', 'fruit_festival', 'learning_center'],
    crops: ['ทุเรียน', 'มังคุด', 'ลองกอง'], months: [5, 6, 7], distance: 240,
    highlight: 'สวนผลไม้ในหุบเขารับผู้มาพักแบบเรียนรู่วงจรผลไม้ ทั้งการตัดแต่งกิ่งจนถึงเก็บผล',
  },
  {
    id: 'at-22-02', name: 'ตลาดผลไม้กลางเมืองสมมติจันทบุรี', kind: 'market', code: '22',
    district: 'อำเภอเมืองจันทบุรี', activities: ['otop_market', 'fruit_festival', 'workshop'],
    crops: ['มังคุด', 'ทุเรียน', 'พริกไทย'], months: [5, 6, 7], distance: 235,
    highlight: 'ตลาดที่รวมสวนหลายตำบลมาขายผลโดยตรง มีมุมชิมตามฤดูและเวิร์กช็อปแปรรูป',
  },
  {
    id: 'at-22-03', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติมะขาม', kind: 'royal_initiative', code: '22',
    district: 'อำเภอมะขาม', activities: ['royal_initiative', 'learning_center', 'fruit_festival'],
    crops: ['ทุเรียน', 'มังคุด', 'ลองกอง'], months: [5, 6], distance: 245,
    highlight: 'ศูนย์เรียนรู้การจัดการน้ำและดินของสวนผลไม้บนพื้นที่เปลี่ยนผ่านจากไร่เลื่อนลอย',
  },
  {
    id: 'at-23-01', name: 'ฟาร์มสเตย์สมมติสวนเกาะแก้ว', kind: 'farmstay', code: '23',
    district: 'อำเภอเมืองตราด', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['ทุเรียน', 'มังคุด', 'เงาะ'], months: [4, 5, 6], distance: 315,
    highlight: 'สวนใกล้ทะเลที่ให้ผู้มาพักเก็บผลไม้ได้เองและมีรอบทำมังคุดหยีของกลุ่มสมาชิก',
  },
  {
    id: 'at-23-02', name: 'วิสาหกิจชุมชนท่องเที่ยวสมมติเกาะช้าง', kind: 'community_enterprise', code: '23',
    district: 'อำเภอเกาะช้าง', activities: ['community_enterprise', 'farmstay', 'otop_market'],
    crops: ['ยางพารา', 'มะพร้าว', 'สะตอ'], months: [11, 12, 1], distance: 330,
    highlight: 'กลุ่มที่ผสมงานทะเลกับสวนบนเกาะ มีรอบทำน้ำตาลมะพร้าวและของกินถิ่น',
  },
  {
    id: 'at-24-01', name: 'ศูนย์เรียนรู้ส้มโอและข้าวสมมติฉะเชิงเทรา', kind: 'learning_center', code: '24',
    district: 'อำเภอเมืองฉะเชิงเทรา', activities: ['learning_center', 'large_scale_group', 'otop_market'],
    crops: ['ส้มโอ', 'มะม่วง', 'ข้าว'], months: [4, 5, 6], distance: 80,
    highlight: 'แปลงส้มโอริมบางปะกงที่เปิดดูการผสมเกสรและตัดผล พร้อมตลาดชุมชนวันเสาร์',
  },
  {
    id: 'at-25-01', name: 'วิสาหกิจชุมชนสมมติสวนผลไม้ปราจีนบุรี', kind: 'community_enterprise', code: '25',
    district: 'อำเภอเมืองปราจีนบุรี', activities: ['community_enterprise', 'workshop', 'learning_center'],
    crops: ['กระท้อน', 'ส้มโอ', 'สมุนไพร'], months: [5, 6, 7], distance: 130,
    highlight: 'กลุ่มแปรรูปสมุนไพรและผลไม้ตามฤดู มีรอบเรียนทำยาสระผมและสมุนไพรลูกกลิ้ง',
  },
  {
    id: 'at-26-01', name: 'ฟาร์มสเตย์สมมติสวนมะยงชิดนครนายก', kind: 'farmstay', code: '26',
    district: 'อำเภอเมืองนครนายก', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['มะยงชิด', 'มะปราง', 'ส้มโอ'], months: [3, 4], distance: 110,
    highlight: 'ฤดูมะยงชิดสั้นมากแต่พักในสวนได้ มีรอบชิมและเรียนวิธีชะลอโรคผลกับเจ้าของสวน',
  },
  {
    id: 'at-27-01', name: 'ศูนย์เรียนรู้ข้าวและยางพาราสมมติสระแก้ว', kind: 'learning_center', code: '27',
    district: 'อำเภอเมืองสระแก้ว', activities: ['learning_center', 'large_scale_group', 'workshop'],
    crops: ['ข้าว', 'ยางพารา', 'มะม่วง'], months: [11, 12], distance: 240,
    highlight: 'จุดเรียนรู้เศรษฐกิจชายแดนที่รวมแปลงข้าวกับแปลงยางของสมาชิกกลุ่มแปลงใหญ่',
  },

  /* ---------------- ภาคใต้ ---------------- */
  {
    id: 'at-80-01', name: 'ศูนย์เรียนรู้ยางพาราและผลไม้สมมติเมืองนคร', kind: 'learning_center', code: '80',
    district: 'อำเภอเมืองนครศรีธรรมราช', activities: ['learning_center', 'workshop', 'large_scale_group', 'otop_market'],
    crops: ['ยางพารา', 'ส้มโอ', 'ลองกอง'], months: [7, 8, 9], distance: 780,
    highlight: 'แปลงสาธิตยางแผ่นกับสวนผลไม้รอบเมือง จัดรอบเรียนรู้สองรายได้หลักของเกษตรกรใต้',
  },
  {
    id: 'at-81-01', name: 'ฟาร์มสเตย์สมมติสวนอ่าวลึก', kind: 'farmstay', code: '81',
    district: 'อำเภออ่าวลึก', activities: ['farmstay', 'fruit_festival', 'workshop'],
    crops: ['ทุเรียน', 'มังคุด', 'ปาล์มน้ำมัน'], months: [7, 8, 9], distance: 810,
    highlight: 'บ้านพักระหว่างภูเขาผลไม้น้ำกับทะเล เก็บทุเรียนภาคใต้ตอนเช้าและเรียนวิธีกรีดยาง',
  },
  {
    id: 'at-82-01', name: 'วิสาหกิจชุมชนสมมติสวนในหยง', kind: 'community_enterprise', code: '82',
    district: 'อำเภอกะปง', activities: ['community_enterprise', 'fruit_festival', 'workshop'],
    crops: ['ทุเรียน', 'มังคุด', 'ลองกอง'], months: [7, 8, 9], distance: 850,
    highlight: 'กลุ่มสวนผลไม้ที่ขายตรงจากผู้ปลูก มีรอบชิมผลสุกและทำมังคุดแห้งในโรงตาก',
  },
  {
    id: 'at-83-01', name: 'ตลาดชุมชนของฝากสมมติภูเก็ต', kind: 'market', code: '83',
    district: 'อำเภอเมืองภูเก็ต', activities: ['otop_market', 'community_enterprise', 'workshop'],
    crops: ['สะตอ', 'มะพร้าว', 'เงาะ'], months: [8, 9, 10], distance: 845,
    highlight: 'ตลาดที่รวมผลผลิตจากหลายจังหวัดใต้มาไว้ในเมืองท่องเที่ยว พร้อมเวิร์กช็อปอาหารถิ่น',
  },
  {
    id: 'at-84-01', name: 'ฟาร์มสเตย์สมมติสวนกาแฟวิภาวดี', kind: 'farmstay', code: '84',
    district: 'อำเภอวิภาวดี', activities: ['farmstay', 'learning_center', 'workshop'],
    crops: ['กาแฟ', 'ยางพารา', 'สะตอ'], months: [2, 3, 4], distance: 680,
    highlight: 'ที่พักกลางสวนกาแฟกับยาง เรียนตั้งแต่เก็บผลเชอร์รี่จนถึงดริปกาแฟในโรงคั่วเล็ก',
  },
  {
    id: 'at-84-02', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติกาญจนดิษฐ์', kind: 'royal_initiative', code: '84',
    district: 'อำเภอกาญจนดิษฐ์', activities: ['royal_initiative', 'learning_center', 'fruit_festival'],
    crops: ['ส้มโอ', 'ทุเรียน', 'มะม่วงเบา'], months: [6, 7, 8], distance: 660,
    highlight: 'ศูนย์เรียนรู้เกษตรผสมผสานบนที่ดินเดิมของครอบครัวเกษตรกร จัดรอบบรรยายสำหรับกลุ่ม',
  },
  {
    id: 'at-85-01', name: 'วิสาหกิจชุมชนกาแฟและสมุนไพรสมมติระนอง', kind: 'community_enterprise', code: '85',
    district: 'อำเภอเมืองระนอง', activities: ['community_enterprise', 'workshop', 'otop_market'],
    crops: ['กาแฟ', 'มะพร้าว', 'ลองกอง'], months: [1, 2, 3], distance: 920,
    highlight: 'กลุ่มคั่วกาแฟริมเขาที่รับเรียนรู้เรื่องน้ำและป่า พร้อมจำหน่ายสมุนไพรของสมาชิก',
  },
  {
    id: 'at-86-01', name: 'ศูนย์เรียนรู้ลองกองและทุเรียนสมมติหลังสวน', kind: 'learning_center', code: '86',
    district: 'อำเภอหลังสวน', activities: ['learning_center', 'large_scale_group', 'fruit_festival'],
    crops: ['ลองกอง', 'ทุเรียน', 'หมาก'], months: [8, 9], distance: 660,
    highlight: 'ช่วงลองกองสุกมีรอบตัดช่อในแปลงและสาธิตการคัดเกรดก่อนส่งลงแพ็คในจุดรวบรวม',
  },
  {
    id: 'at-90-01', name: 'แหล่งเรียนรู้ตามรอยศาสตร์พระราชาสมมติจะนะ', kind: 'royal_initiative', code: '90',
    district: 'อำเภอจะนะ', activities: ['royal_initiative', 'learning_center', 'community_enterprise'],
    crops: ['ส้มเขียวหวาน', 'ลองกอง', 'ข้าว'], months: [8, 9, 12], distance: 950,
    highlight: 'ศูนย์เรียนรู้การจัดการน้ำในสวนส้มและนาข้าวปลายด้ามขวาน มีกลุ่มอาชีพเครือข่ายนำชม',
  },
  {
    id: 'at-92-01', name: 'ฟาร์มสเตย์สมมติสวนสละกันตัง', kind: 'farmstay', code: '92',
    district: 'อำเภอกันตัง', activities: ['farmstay', 'fruit_festival', 'otop_market'],
    crops: ['สละ', 'ทุเรียน', 'ยางพารา'], months: [6, 7, 8], distance: 840,
    highlight: 'บ้านพักริมคลองในสวนสละ มีรอบเก็บผลและทำสละลอยแก้วกับกลุ่มแม่บ้านของตำบล',
  },
];

/* ------------------------------------------------------------------ */
/* ประกอบร่างแหล่งท่องเที่ยวจากทะเบียน (คำนวณตอนโหลด module)             */
/* ------------------------------------------------------------------ */

/**
 * amenities ผสมระหว่าง "ชุดฐานตามประเภทแหล่ง" กับรายการเสริมที่สุ่มจากคีย์คงที่
 * lodging จะถูกบังคับใส่เมื่อแหล่งนั้นมีกิจกรรม farmstay เพื่อให้ stayAvailable
 * อ่านกลับจาก amenity ได้เสมอ (ไม่แยกกันคนละแหล่งความจริง)
 */
const AMENITY_BASE_BY_KIND: Record<DestinationKind, readonly AmenityId[]> = {
  farmstay: ['lodging', 'restaurant', 'wifi'],
  learning_center: ['meeting_room', 'toilet', 'tour_guide'],
  royal_initiative: ['toilet', 'parking', 'tour_guide'],
  community_enterprise: ['shop', 'parking', 'toilet'],
  market: ['shop', 'restaurant', 'toilet', 'parking'],
};

const AMENITY_EXTRA_POOL: readonly AmenityId[] = [
  'camping', 'wheelchair_access', 'meeting_room', 'wifi', 'parking',
  'tour_guide', 'restaurant', 'shop', 'toilet', 'lodging',
];

function amenitiesFor(seed: DestinationSeed, key: string): AmenityId[] {
  const base = [...AMENITY_BASE_BY_KIND[seed.kind]];
  if (seed.activities.includes('farmstay') && !base.includes('lodging')) base.unshift('lodging');
  const wanted = Math.round(between(`${key}:amenity`, 2, 6));
  const spare = AMENITY_EXTRA_POOL.filter((amenity) => !base.includes(amenity));
  const extras = pickMany(`${key}:amenitypool`, spare, Math.max(0, wanted - base.length));
  const merged = uniqueOrdered([...base, ...extras]);
  return merged.slice(0, Math.max(2, Math.min(wanted, merged.length)));
}

/** travelNote เป็นภาษาไทยต่อท้ายการ์ด: ระยะทาง + ฤดูที่แนะนำ + วิธีเตรียมตัว */
function travelNoteFor(seed: DestinationSeed, stayAvailable: boolean, bestMonths: readonly number[]): string {
  const parts: string[] = [];
  if (seed.distance === null) {
    parts.push('ระยะทางจากกรุงเทพฯ ยังไม่ยืนยันในทะเบียนตัวอย่าง (จึงไม่ระบุค่าตัวเลข) ควรตรวจสอบเส้นทางกับกลุ่มก่อนออกเดินทาง');
  } else if (seed.distance <= 60) {
    parts.push(`ห่างจากกรุงเทพฯ ประมาณ ${seed.distance} กิโลเมตร ไป-กลับวันเดียวได้`);
  } else if (seed.distance <= 200) {
    parts.push(`ห่างจากกรุงเทพฯ ประมาณ ${seed.distance} กิโลเมตร แนะนำออกเดินทางเช้า`);
  } else {
    parts.push(`ห่างจากกรุงเทพฯ ประมาณ ${seed.distance} กิโลเมตร ควรพักอย่างน้อย 1 คืน`);
  }
  const seasonText = bestMonths.length === 0
    ? ''
    : ` (${uniqueOrdered(bestMonths.map((m) => seasonOfMonth(m))).map((season) => SEASON_LABELS[season]).join('/')})`;
  parts.push(`ช่วงที่ทะเบียนตัวอย่างแนะนำคือ ${monthListText(bestMonths)}${seasonText}`);
  parts.push(stayAvailable
    ? 'มีที่พักในแหล่ง ควรจองล่วงหน้าช่วงฤดูเก็บเกี่ยวและวันหยุดยาว'
    : 'ไม่มีที่พักในแหล่ง เหมาะกับโปรแกรมไป-กลับแล้วต่อเส้นทางใกล้เคียง');
  parts.push('ติดต่อล่วงหน้าเพื่อให้มีวิทยากรนำชม (ข้อมูลชุดนี้เป็นค่าสมมติเพื่อการสาธิต)');
  return `${parts.join('. ')}.`;
}

function buildDestination(seed: DestinationSeed, workshopCountByDestination: ReadonlyMap<string, number>): AgriTourismDestination {
  const province = PROVINCE_BY_CODE.get(seed.code);
  if (!province) throw new Error(`agri-tourism-data: ทะเบียนแหล่ง ${seed.id} อ้างรหัสจังหวัดที่ไม่อยู่ในตารางอ้างอิง (${seed.code})`);
  const key = `at:dest:${seed.code}:${seed.id}`;
  const activities = uniqueOrdered(seed.activities);
  const bestMonths = uniqueOrdered(seed.months.filter((m) => m >= 1 && m <= 12)).sort((a, b) => a - b);
  const seasons = uniqueOrdered(bestMonths.map((m) => seasonOfMonth(m)));
  const amenities = amenitiesFor(seed, key);
  const stayAvailable = amenities.includes('lodging');
  return {
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    kindLabel: DESTINATION_KIND_LABELS[seed.kind],
    provinceCode: province.code,
    provinceName: province.name,
    region: province.region,
    regionLabel: province.regionLabel,
    district: seed.district,
    activities,
    activityLabels: activities.map((activity) => ACTIVITY_LABELS[activity]),
    amenities,
    amenityLabels: amenities.map((amenity) => AMENITY_LABELS[amenity]),
    highlight: seed.highlight,
    bestMonths,
    seasonLabels: seasons.map((season) => SEASON_LABELS[season]),
    signatureCrops: [...seed.crops],
    workshopCount: workshopCountByDestination.get(seed.id) ?? 0,
    stayAvailable,
    dayTripOnly: !stayAvailable,
    distanceFromBangkokKm: seed.distance,
    travelNote: travelNoteFor(seed, stayAvailable, bestMonths),
    sample: true,
  };
}

/* ------------------------------------------------------------------ */
/* ปฏิทินผลไม้และงานเก็บเกี่ยวตามฤดู                                      */
/* ------------------------------------------------------------------ */

interface CalendarSeed {
  readonly name: string;
  readonly codes: readonly string[];
  /** ช่วงที่ผลผลิตออกสู่ตลาดจริงตามบริบทพื้นที่ (ค่าตัวอย่างเพื่อการสาธิต) */
  readonly months: readonly number[];
  readonly festivalMonths: readonly number[];
  readonly peakMonth: number;
}

/**
 * เดือนที่ "festival" หมายถึงหน้าต่างเก็บเกี่ยวpeak ตามปฏิทินผลไม้จริงของพื้นที่
 * (ทุเรียน/มังคุดตะวันออก พ.ค.-ก.ค., ลองกองใต้ ก.ค.-ก.ย., ข้าวใหม่ ต.ค.-ธ.ค. ฯลฯ)
 * ยังไม่ได้ผูกกับประกาศงานใด ๆ จึงใช้เป็นนิยาม metadata ไม่ใช่ข้อสรุปว่ามีงานจริง
 */
const FRUIT_CALENDAR_SEEDS: CalendarSeed[] = [
  { name: 'ทุเรียน', codes: ['22', '23', '21', '86', '84', '80'], months: [5, 6, 7, 8, 9], festivalMonths: [6, 7, 8, 9], peakMonth: 6 },
  { name: 'มังคุด', codes: ['22', '23', '86', '81'], months: [5, 6, 7, 8, 9], festivalMonths: [5, 6, 7], peakMonth: 6 },
  { name: 'เงาะ', codes: ['22', '23', '21'], months: [4, 5, 6], festivalMonths: [5, 6], peakMonth: 5 },
  { name: 'ลองกอง', codes: ['86', '84', '53', '42'], months: [7, 8, 9], festivalMonths: [8, 9], peakMonth: 8 },
  { name: 'ลำไย', codes: ['51', '67', '50', '65'], months: [7, 8, 9], festivalMonths: [8, 9], peakMonth: 8 },
  { name: 'มะม่วง', codes: ['66', '65', '50', '73', '19'], months: [2, 3, 4, 5], festivalMonths: [3, 4, 5], peakMonth: 4 },
  { name: 'ส้มโอ', codes: ['73', '75', '70', '12', '24', '62'], months: [3, 4, 5, 6, 7], festivalMonths: [4, 5, 6], peakMonth: 5 },
  { name: 'ชมพู่น้ำผึ้ง', codes: ['12', '74', '71'], months: [4, 5, 6], festivalMonths: [5, 6], peakMonth: 5 },
  { name: 'มะเหมี่ยว', codes: ['70', '71'], months: [4, 5], festivalMonths: [5], peakMonth: 5 },
  { name: 'ลิ้นจี่', codes: ['50', '57', '51', '62'], months: [4, 5, 6], festivalMonths: [5, 6], peakMonth: 5 },
  { name: 'สับปะรด', codes: ['77', '76', '83', '84', '20'], months: [5, 6, 7, 8], festivalMonths: [6, 7], peakMonth: 6 },
  { name: 'สละ', codes: ['21', '22', '92'], months: [4, 5, 6, 7], festivalMonths: [6, 7], peakMonth: 7 },
  { name: 'สตรอว์เบอร์รี', codes: ['55', '50', '57', '42'], months: [12, 1, 2], festivalMonths: [12, 1, 2], peakMonth: 1 },
  { name: 'องุ่น', codes: ['74', '30', '76'], months: [11, 1, 2], festivalMonths: [1, 2], peakMonth: 2 },
  { name: 'กาแฟ (ผลเชอร์รี่และรอบคั่ว)', codes: ['84', '85', '86', '42', '57'], months: [11, 12, 1, 2], festivalMonths: [11, 12, 1], peakMonth: 12 },
  { name: 'ข้าวใหม่ (งานบุญและตลาดข้าว)', codes: ['32', '34', '45', '30', '14'], months: [10, 11, 12], festivalMonths: [10, 11, 12], peakMonth: 11 },
  { name: 'กล้วยไข่', codes: ['62', '61'], months: [10, 11], festivalMonths: [10, 11], peakMonth: 10 },
  { name: 'มะขามหวาน', codes: ['67', '14', '71', '60'], months: [11, 12, 1], festivalMonths: [11, 12], peakMonth: 12 },
  { name: 'ข้าวโพดหวานและมันหวาน', codes: ['34', '67', '50', '42'], months: [10, 11, 12], festivalMonths: [11, 12], peakMonth: 11 },
  { name: 'ผักและไม้ดอกเมืองหนาว', codes: ['50', '57', '55', '58'], months: [11, 12, 1, 2], festivalMonths: [12, 1], peakMonth: 12 },
  { name: 'หอมแดงและกระเทียม', codes: ['33', '41', '50', '58'], months: [2, 3, 4], festivalMonths: [3], peakMonth: 3 },
  { name: 'มะยงชิดและมะปราง', codes: ['26', '19', '66'], months: [3, 4], festivalMonths: [3, 4], peakMonth: 4 },
  { name: 'ขนุน', codes: ['20', '24', '76'], months: [3, 4, 5, 6], festivalMonths: [5], peakMonth: 5 },
  { name: 'กระท้อน', codes: ['25', '71', '19'], months: [5, 6, 7], festivalMonths: [6], peakMonth: 6 },
  { name: 'สะตอ', codes: ['84', '80', '82', '96'], months: [8, 9, 10], festivalMonths: [9], peakMonth: 9 },
  { name: 'พริกไทย', codes: ['22', '23'], months: [8, 9, 10], festivalMonths: [], peakMonth: 9 },
  { name: 'หมาก', codes: ['86', '84', '90'], months: [6, 7, 8], festivalMonths: [], peakMonth: 7 },
  { name: 'ฝรั่งและผลไม้แปรรูป', codes: ['60', '53', '19'], months: [9, 10, 11], festivalMonths: [10], peakMonth: 10 },
  { name: 'น้ำตาลมะพร้าว', codes: ['75', '70', '11', '84'], months: [3, 4, 5, 6], festivalMonths: [4, 5], peakMonth: 5 },
];

/** ข้อความประจำเดือนสำหรับพาเนลปฏิทิน (พิมพ์มือทั้ง 12 เดือน) */
const MONTH_HIGHLIGHT_TEXT: readonly string[] = [
  'ธันวาคม-มกราคมเป็นช่วงสตรอว์เบอร์รีและผักเมืองหนาวทางเหนือ กับรอบคั่วกาแฟของภาคใต้',
  'กุมภาพันธ์องุ่นในสมุทรสาครและนครราชสีมาเริ่มตัดพวง ผลไม้เหนือเริ่มมีกระเทียมและหอมแดงลงตลาด',
  'มีนาคมมะม่วงรุ่นแรกและมะยงชิดของนครนายกเป็นฤดูสั้นที่สุดของปี ควรนัดล่วงหน้าก่อนเข้าสวน',
  'เมษายนส้มโอและชมพู่เริ่มออกพร้อมอากาศร้อน เหมาะกับโปรแกรมเช้าในสวนใกล้เมือง',
  'พฤษภาคมเป็นหน้าต่างเก็บผลไม้น้ำของตะวันออก เงาะและลิ้นจี่สุกก่อนทุเรียนรุ่นแรก',
  'มิถุนายนคือช่วงพีคของทุเรียน มังคุด และสับปะรด มีงานผลไม้ตามจังหวัดตะวันออกและประจวบคีรีขันธ์',
  'กรกฎาคมลองกองและลำไยเริ่มลงใต้กับเหนือตามลำดับ สวนในทะเบียนตัวอย่างเปิดรอบตัดผลเป็นกลุ่มเล็ก',
  'สิงหาคมส้มโอและข้าวโพดหวานทางอีสานออกพร้อมกัน เป็นเดือนที่แหล่งเรียนรู้นับคณะได้มาก',
  'กันยายนผลไม้ใต้ตามหลังตะวันออก ฝรั่งและลองกองเป็นสินค้าเด่นของตลาดนัดชุมชน',
  'ตุลาคมกล้วยไข่กำแพงเพชรและข้าวใหม่รุ่นแรกเริ่มเข้าตลาดชุมชนอีสาน',
  'พฤศจิกายนคือฤดูข้าวใหม่และงานบุญในภาคอีสาน หลายกลุ่มจัดตลาดหมุนเวียนในวัดและลานชุมชน',
  'ธันวาคมอากาศเย็นทำให้แปลงไม้ดอกและสตรอว์เบอร์รีทางเหนือคึกคัก ควรจองที่พักล่วงหน้า',
];

function provinceNameOf(code: string): string {
  return PROVINCE_BY_CODE.get(code)?.name ?? code;
}

function calendarRowFor(seed: CalendarSeed, month: number, codes: readonly string[]): AgriTourismCalendarFruit {
  return {
    name: seed.name,
    provinceCodes: [...codes],
    provinceNames: codes.map(provinceNameOf),
    festival: seed.festivalMonths.includes(month),
    peak: seed.peakMonth === month,
  };
}

/** 1 แถว/เดือน; fruits เรียงด้วยสูตรตายตัว (peak → festival → ใกล้ peak) แล้วตัดเหลือ 6 */
function buildFruitMonth(
  month: number,
  seeds: ReadonlyArray<{ seed: CalendarSeed; codes: string[] }>,
  eventCount: number,
): AgriTourismFruitMonth {
  const rows = seeds
    .filter((entry) => entry.seed.months.includes(month) && entry.codes.length > 0)
    .map((entry) => {
      const isPeak = entry.seed.peakMonth === month;
      const isFestival = entry.seed.festivalMonths.includes(month);
      return {
        row: calendarRowFor(entry.seed, month, entry.codes),
        rank: (isPeak ? 0 : 6) + (isFestival ? 0 : 3) + Math.abs(entry.seed.peakMonth - month),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name, 'th'))
    .slice(0, 6)
    .map((entry) => entry.row);
  return {
    month,
    monthLabel: monthLabel(month),
    season: seasonOfMonth(month),
    seasonLabel: SEASON_LABELS[seasonOfMonth(month)],
    fruits: rows,
    eventCount,
    highlightText: MONTH_HIGHLIGHT_TEXT[month - 1] ?? '',
  };
}

/** เดือนที่จังหวัดใดมี "หน้าต่างเก็บเกี่ยว" ของผลไม้ที่ระบุจังหวัด */
const FESTIVAL_MONTH_BY_PROVINCE: ReadonlyMap<string, number[]> = (() => {
  const map = new Map<string, number[]>();
  for (const seed of FRUIT_CALENDAR_SEEDS) {
    for (const code of seed.codes) {
      const bucket = map.get(code) ?? [];
      for (const month of seed.festivalMonths) {
        if (!bucket.includes(month)) bucket.push(month);
      }
      map.set(code, bucket);
    }
  }
  for (const [code, months] of map) map.set(code, months.sort((a, b) => a - b));
  return map;
})();

/* ------------------------------------------------------------------ */
/* เวิร์กช็อปชุมชน (ผูกกับทะเบียนแหล่งจริง — ตรวจ id ตอนโหลด module)       */
/* ------------------------------------------------------------------ */

interface WorkshopSeed {
  readonly id: string;
  readonly title: string;
  readonly destinationId: string;
  readonly activity: ActivityId;
  readonly durationHours: number;
  readonly months: readonly number[];
  readonly capacity: number;
  readonly priceBaht: number;
  readonly audience: string;
}

const WORKSHOP_SEEDS: WorkshopSeed[] = [
  { id: 'at-w-01', title: 'ทำสบู่สมุนไพรจากแปลงสู่ขวด', destinationId: 'at-52-01', activity: 'workshop', durationHours: 2, months: [11, 12, 1], capacity: 25, priceBaht: 350, audience: 'นักท่องเที่ยวทั่วไปและคณะครอบครัว' },
  { id: 'at-w-02', title: 'สาธิตสีข้าวและหุงข้าวใหม่', destinationId: 'at-55-01', activity: 'workshop', durationHours: 3, months: [11, 12], capacity: 20, priceBaht: 300, audience: 'คณะศึกษาดูงานและโรงเรียน' },
  { id: 'at-w-03', title: 'อบรมชิมและคั่วกาแฟอาราบิก้าบนพื้นที่สูง', destinationId: 'at-50-01', activity: 'workshop', durationHours: 4, months: [11, 12, 1], capacity: 18, priceBaht: 650, audience: 'คอกาแฟและผู้ประกอบการคาเฟ่' },
  { id: 'at-w-04', title: 'เพาะเห็ดฟางในโรงเรือนขนาดเล็ก', destinationId: 'at-54-01', activity: 'workshop', durationHours: 2, months: [10, 11, 12], capacity: 30, priceBaht: 250, audience: 'เกษตรกรมือใหม่และคนเมือง' },
  { id: 'at-w-05', title: 'ทำน้ำตาลโตนดและขนมพื้นบ้าน', destinationId: 'at-80-01', activity: 'workshop', durationHours: 3, months: [1, 2, 3], capacity: 20, priceBaht: 380, audience: 'ผู้สนใจอาหารถิ่นและคณะท้องถิ่น' },
  { id: 'at-w-06', title: 'จักสานจากทางปาล์มและวัสดุเหลือใช้', destinationId: 'at-82-01', activity: 'workshop', durationHours: 3, months: [11, 12, 1], capacity: 18, priceBaht: 400, audience: 'ผู้สนใจงานหัตถกรรมและนักท่องเที่ยว' },
  { id: 'at-w-07', title: 'อบรมกาแฟพิเศษ: คั่ว ดริป และชิมเปรียบเทียบ', destinationId: 'at-84-01', activity: 'workshop', durationHours: 5, months: [2, 3, 4], capacity: 15, priceBaht: 900, audience: 'บาริสต้าและผู้ประกอบการคาเฟ่' },
  { id: 'at-w-08', title: 'เรียนรู้วงจรทุเรียนจากดอกถึงมีดตัด', destinationId: 'at-22-01', activity: 'learning_center', durationHours: 4, months: [5, 6, 7], capacity: 25, priceBaht: 700, audience: 'เกษตรกรรุ่นใหม่และผู้สนใจไม้ผล' },
  { id: 'at-w-09', title: 'เก็บมังคุดและทำมังคุดหยี', destinationId: 'at-23-01', activity: 'workshop', durationHours: 3, months: [5, 6, 7], capacity: 20, priceBaht: 350, audience: 'นักท่องเที่ยวครอบครัว' },
  { id: 'at-w-10', title: 'ทำแยมสับปะรดและแปรรูปวัสดุเหลือใช้', destinationId: 'at-77-01', activity: 'workshop', durationHours: 2, months: [6, 7], capacity: 30, priceBaht: 300, audience: 'ผู้สนใจแปรรูปอาหารและสมาชิกกลุ่ม' },
  { id: 'at-w-11', title: 'ตัดแต่งช่อผลในแปลงใหญ่ลำไย', destinationId: 'at-67-01', activity: 'large_scale_group', durationHours: 4, months: [7, 8], capacity: 25, priceBaht: 150, audience: 'สมาชิกแปลงใหญ่และเกษตรกรพื้นที่ใกล้เคียง' },
  { id: 'at-w-12', title: 'ย้อมสีธรรมชาติและทอผ้ากับกลุ่มแม่บ้าน', destinationId: 'at-31-01', activity: 'workshop', durationHours: 5, months: [1, 2, 11], capacity: 20, priceBaht: 550, audience: 'ผู้สนใจงานผ้าและคณะท่องเที่ยว' },
  { id: 'at-w-13', title: 'ทำข้าวฮางงอกและงาแผ่น', destinationId: 'at-45-01', activity: 'workshop', durationHours: 3, months: [11, 12], capacity: 22, priceBaht: 320, audience: 'ผู้บริโภคอาหารสุขภาพและคณะท้องถิ่น' },
  { id: 'at-w-14', title: 'ทำน้ำหม่อนและผลิตภัณฑ์จากหม่อน', destinationId: 'at-32-01', activity: 'workshop', durationHours: 2, months: [3, 4, 11], capacity: 25, priceBaht: 280, audience: 'ผู้ประกอบการ SME และสมาชิกกลุ่ม' },
  { id: 'at-w-15', title: 'เก็บองุ่นและทำน้ำองุ่นพาสเจอไรซ์', destinationId: 'at-30-02', activity: 'fruit_festival', durationHours: 3, months: [1, 2], capacity: 20, priceBaht: 500, audience: 'นักท่องเที่ยวครอบครัวและโรงเรียน' },
  { id: 'at-w-16', title: 'ทำเยลลีและน้ำองุ่นจากผลผลิตในโรงเรือน', destinationId: 'at-74-01', activity: 'workshop', durationHours: 2, months: [1, 2, 11], capacity: 24, priceBaht: 320, audience: 'ผู้สนใจแปรรูปผลไม้วัยทำงาน' },
  { id: 'at-w-17', title: 'อบรมโคก หนอง นา โมเดล บรรยายและแปลงปฏิบัติ', destinationId: 'at-40-02', activity: 'royal_initiative', durationHours: 6, months: [11, 12, 1], capacity: 40, priceBaht: 200, audience: 'คณะผู้บริหารท้องถิ่นและเครือข่าย ศพก.' },
  { id: 'at-w-18', title: 'เรียนรู้เกษตรทฤษฎีใหม่และบัญชีครัวเรือน', destinationId: 'at-61-01', activity: 'learning_center', durationHours: 5, months: [11, 12], capacity: 35, priceBaht: 150, audience: 'ชุมชนที่สนใจและข้าราชการบำนาญ' },
  { id: 'at-w-19', title: 'ทำน้ำหมักชีวภาพและปุ๋ยหมักจากวัสดุในฟาร์ม', destinationId: 'at-16-01', activity: 'workshop', durationHours: 2, months: [11, 12], capacity: 30, priceBaht: 250, audience: 'เกษตรกรแปลงเล็กและสมาชิกกลุ่ม' },
  { id: 'at-w-20', title: 'ทำชาสมุนไพรและลูกอมสมุนไพร', destinationId: 'at-46-01', activity: 'workshop', durationHours: 3, months: [11, 12, 1], capacity: 20, priceBaht: 320, audience: 'ผู้สูงอายุในชุมชนและนักท่องเที่ยวสายสุขภาพ' },
  { id: 'at-w-21', title: 'พิมพ์ผ้าลายถิ่นและเย็บถุงผ้าใช้ซ้ำ', destinationId: 'at-41-01', activity: 'otop_market', durationHours: 3, months: [11, 12, 1], capacity: 22, priceBaht: 380, audience: 'นักท่องเที่ยวและร้านค้าของฝาก' },
  { id: 'at-w-22', title: 'เก็บสละและทำสละลอยแก้ว', destinationId: 'at-92-01', activity: 'fruit_festival', durationHours: 2, months: [6, 7, 8], capacity: 20, priceBaht: 300, audience: 'นักท่องเที่ยวครอบครัว' },
  { id: 'at-w-23', title: 'เรียนรู้การกรีดยางและทำยางแผ่นดิบ', destinationId: 'at-27-01', activity: 'learning_center', durationHours: 4, months: [2, 3, 12], capacity: 25, priceBaht: 550, audience: 'เกษตรกรมือใหม่และผู้สนใจห่วงโซ่ยาง' },
  { id: 'at-w-24', title: 'วิถีริมโขง: ตักบาตรเช้าและเรียนคั่วกาแฟ', destinationId: 'at-42-01', activity: 'farmstay', durationHours: 3, months: [11, 12, 1], capacity: 15, priceBaht: 250, audience: 'นักท่องเที่ยวสายช้าและช่างภาพ' },
  { id: 'at-w-25', title: 'ทำขนมจากข้าวพื้นเมืองและของว่างถิ่น', destinationId: 'at-35-01', activity: 'workshop', durationHours: 2, months: [11, 12], capacity: 25, priceBaht: 280, audience: 'คณะครอบครัวและโรงเรียน' },
  { id: 'at-w-26', title: 'อบรมการเก็บและคัดเกรดผลไม้ก่อนส่งออก', destinationId: 'at-22-02', activity: 'fruit_festival', durationHours: 4, months: [5, 6], capacity: 30, priceBaht: 600, audience: 'เจ้าของสวนและล้งท้องถิ่น' },
  { id: 'at-w-27', title: 'เรียนรู้การปลูกข้าวในนาพื้นที่เมืองหลวง', destinationId: 'at-10-01', activity: 'learning_center', durationHours: 3, months: [11, 12, 1], capacity: 40, priceBaht: 180, audience: 'นักเรียนกรุงเทพฯ และครอบครัว' },
  { id: 'at-w-28', title: 'ทำขนมไทยจากมะม่วงและแป้งข้าว', destinationId: 'at-73-01', activity: 'workshop', durationHours: 2, months: [4, 5], capacity: 25, priceBaht: 300, audience: 'นักท่องเที่ยวและครูฝ่ายกิจกรรม' },
  { id: 'at-w-29', title: 'ตากกล้วยไข่และทำขนมจากกล้วย', destinationId: 'at-62-01', activity: 'workshop', durationHours: 2, months: [10, 11], capacity: 25, priceBaht: 250, audience: 'สมาชิกกลุ่มและนักท่องเที่ยวทั่วไป' },
  { id: 'at-w-30', title: 'ทำผ้ามัดย้อมจากสีธรรมชาติ', destinationId: 'at-55-02', activity: 'community_enterprise', durationHours: 3, months: [1, 11, 12], capacity: 20, priceBaht: 400, audience: 'นักท่องเที่ยวสายงานคราฟต์' },
  { id: 'at-w-31', title: 'คั่วกาแฟโรบัสต้าและชิมแบบสาธิต', destinationId: 'at-85-01', activity: 'workshop', durationHours: 4, months: [1, 2, 3], capacity: 15, priceBaht: 650, audience: 'ผู้ประกอบการคาเฟ่และเกษตรกรชาวสวนกาแฟ' },
  { id: 'at-w-32', title: 'ทำน้ำพริกกุ้งเสียบและของฝากจากทะเล', destinationId: 'at-23-02', activity: 'otop_market', durationHours: 3, months: [11, 12, 1], capacity: 20, priceBaht: 450, audience: 'นักท่องเที่ยวและร้านค้าของฝาก' },
  { id: 'at-w-33', title: 'เรียนรู้การผสมเกสรส้มโอและตัดผล', destinationId: 'at-24-01', activity: 'learning_center', durationHours: 3, months: [4, 5], capacity: 25, priceBaht: 350, audience: 'เกษตรกรสวนส้มโอและนิสิต' },
  { id: 'at-w-34', title: 'ทำอาหารถิ่นจากผักพื้นบ้านอีสาน', destinationId: 'at-34-01', activity: 'farmstay', durationHours: 4, months: [11, 12, 1], capacity: 18, priceBaht: 500, audience: 'นักท่องเที่ยวสายอาหารและคณะครอบครัว' },
];

const DESTINATION_SEED_INDEX = new Map<string, DestinationSeed>(
  DESTINATION_SEEDS.map((seed) => [seed.id, seed] as const),
);

/**
 * resolve destinationId ของเวิร์กช็อปกับทะเบียนแหล่งจริง ถ้าพบ id ที่ไม่มีอยู่
 * (เช่นตอนแก้ทะเบียนแล้วตกหล่น) จะผูกกับแหล่งตามรหัสจังหวัดนั้นแบบ deterministic
 * หรือถ้าจังหวัดไม่ตรงเลยจะ pick จากทั้งทะเบียน — ทุกกรณีมี destinationId ที่
 * อยู่ใน DESTINATIONS เท่านั้น ไม่ค้าง id ที่หาไม่เจอ
 */
function resolveWorkshopDestination(seed: WorkshopSeed): DestinationSeed {
  const direct = DESTINATION_SEED_INDEX.get(seed.destinationId);
  if (direct) return direct;
  const match = /^at-(\d\d)-\d\d$/.exec(seed.destinationId);
  const sameProvince = match ? DESTINATION_SEEDS.filter((candidate) => candidate.code === match[1]) : [];
  if (sameProvince.length > 0) return pick(`at:ws:fallback:${seed.id}`, sameProvince);
  return pick(`at:ws:fallback:${seed.id}`, DESTINATION_SEEDS);
}

function buildWorkshop(seed: WorkshopSeed): AgriTourismWorkshop {
  const destination = resolveWorkshopDestination(seed);
  const province = PROVINCE_BY_CODE.get(destination.code);
  if (!province) throw new Error(`agri-tourism-data: เวิร์กช็อป ${seed.id} ผูกกับแหล่งที่ไม่ตรงกับตารางจังหวัด (${destination.code})`);
  const key = `at:ws:${seed.id}`;
  return {
    id: seed.id,
    title: seed.title,
    destinationId: destination.id,
    destinationName: destination.name,
    provinceCode: province.code,
    provinceName: province.name,
    region: province.region,
    activity: seed.activity,
    activityLabel: ACTIVITY_LABELS[seed.activity],
    durationHours: seed.durationHours,
    months: uniqueOrdered(seed.months.filter((m) => m >= 1 && m <= 12)).sort((a, b) => a - b),
    capacity: Math.round(between(`${key}:cap`, seed.capacity * 0.8, seed.capacity * 1.2)),
    priceBaht: Math.round(seed.priceBaht * between(`${key}:price`, 0.9, 1.15) / 10) * 10,
    targetAudience: seed.audience,
    sample: true,
  };
}

const WORKSHOPS: AgriTourismWorkshop[] = WORKSHOP_SEEDS.map(buildWorkshop);

const WORKSHOP_COUNT_BY_DESTINATION: Map<string, number> = (() => {
  const map = new Map<string, number>();
  for (const workshop of WORKSHOPS) {
    map.set(workshop.destinationId, (map.get(workshop.destinationId) ?? 0) + 1);
  }
  return map;
})();

/** ทะเบียนแหล่งท่องเที่ยวทั้งหมด (คำนวณตอนโหลด module เพื่อความคงที่และเร็ว) */
export const AGRI_TOURISM_DESTINATIONS: AgriTourismDestination[] = DESTINATION_SEEDS.map(
  (seed) => buildDestination(seed, WORKSHOP_COUNT_BY_DESTINATION),
);

/* ------------------------------------------------------------------ */
/* วิสาหกิจชุมชน / กลุ่มแปลงใหญ่ / กลุ่มอาชีพ (OTOP)                      */
/* ------------------------------------------------------------------ */

interface EnterpriseSeed {
  readonly id: string;
  readonly name: string;
  readonly type: EnterpriseType;
  readonly code: string;
  readonly products: readonly string[];
  readonly activities: readonly ActivityId[];
}

/**
 * สินค้าของแต่ละกลุ่มเลือกตามบริบทพืช/งานหัตถกรรมของจังหวัด (ข้าว-หอมมะลิอีสาน,
 * ยางพารา-ใต้, ผลไม้-ตะวันออก, ผ้าไหม-อีสาน/เหนือ, กาแฟ-ใต้/เหนือ,
 * น้ำตาลมะพร้าว-กลาง) memberCount/areaRai เป็นค่าตัวอย่างจากคีย์คงที่
 */
const ENTERPRISE_SEEDS: EnterpriseSeed[] = [
  /* ภาคเหนือ */
  { id: 'at-e-50-01', name: 'กลุ่มวิสาหกิจชุมชนแปรรูปกาแฟสมมติแม่ริม', type: 'community_enterprise', code: '50', products: ['กาแฟอาราบิก้า', 'อะโวคาโดอบแห้ง', 'มะคาเดเมีย'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-50-02', name: 'กลุ่มแปลงใหญ่ลำไยสมมติเชียงใหม่', type: 'large_scale_group', code: '50', products: ['ลำไย', 'ลำไยอบแห้ง', 'ข้าว'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-51-01', name: 'กลุ่มแปลงใหญ่ข้าวและลำไยสมมติลำพูน', type: 'large_scale_group', code: '51', products: ['ลำไย', 'ข้าวหอมมะลิ', 'กระเทียม'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-53-01', name: 'กลุ่มผลไม้และข้าวสมมติลับแล', type: 'community_enterprise', code: '53', products: ['ลองกอง', 'ทุเรียน', 'ข้าว'], activities: ['fruit_festival', 'community_enterprise'] },
  { id: 'at-e-55-01', name: 'กลุ่มกาแฟและผ้าทอสมมติเมืองน่าน', type: 'community_enterprise', code: '55', products: ['กาแฟ', 'ผ้าทอ', 'ข้าวโพด'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-55-02', name: 'กลุ่มแปลงใหญ่ข้าวสมมติปัว', type: 'large_scale_group', code: '55', products: ['ข้าว', 'กาแฟ', 'ผักอินทรีย์'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-57-01', name: 'กลุ่มชาและกาแฟสมมติแม่จัน', type: 'community_enterprise', code: '57', products: ['ชา', 'กาแฟ', 'สับปะรด'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-57-02', name: 'กลุ่มไม้ผลเมืองหนาวและหัตถกรรมสมมติเชียงราย', type: 'otop_group', code: '57', products: ['พลับ', 'สตรอว์เบอร์รีแปรรูป', 'งานหัตถกรรม'], activities: ['otop_market', 'fruit_festival'] },
  { id: 'at-e-58-01', name: 'กลุ่มเกษตรที่สูงสมมติปาย', type: 'community_enterprise', code: '58', products: ['กระเทียม', 'ถั่วเหลือง', 'ผ้าทอ'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-60-01', name: 'กลุ่มแปลงใหญ่ข้าวและอ้อยสมมตินครสวรรค์', type: 'large_scale_group', code: '60', products: ['ข้าว', 'อ้อย', 'มะขาม'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-62-01', name: 'กลุ่มกล้วยไข่และของฝากสมมติกำแพงเพชร', type: 'community_enterprise', code: '62', products: ['กล้วยไข่', 'กล้วยตาก', 'ข้าว'], activities: ['community_enterprise', 'otop_market'] },
  { id: 'at-e-65-01', name: 'กลุ่มแปลงใหญ่ข้าวและมะม่วงสมมติพิษณุโลก', type: 'large_scale_group', code: '65', products: ['ข้าว', 'มะม่วง', 'สมุนไพร'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-67-01', name: 'กลุ่มแปรรูปมะขามและลำไยสมมติเพชรบูรณ์', type: 'community_enterprise', code: '67', products: ['มะขาม', 'ลำไยอบแห้ง', 'กาแฟ'], activities: ['community_enterprise', 'fruit_festival'] },

  /* ภาคตะวันออกเฉียงเหนือ */
  { id: 'at-e-30-01', name: 'กลุ่มแปลงใหญ่ข้าวหอมมะลิสมมติพิมาย', type: 'large_scale_group', code: '30', products: ['ข้าวหอมมะลิ', 'แป้งข้าว', 'รำข้าว'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-30-02', name: 'กลุ่มทอผ้าและของฝากสมมติโคราช', type: 'otop_group', code: '30', products: ['ผ้าไหม', 'ข้าว', 'มันสำปะหลัง'], activities: ['otop_market', 'workshop'] },
  { id: 'at-e-31-01', name: 'กลุ่มไหมและข้าวหอมมะลิสมมติบุรีรัมย์', type: 'community_enterprise', code: '31', products: ['ผ้าไหม', 'ข้าวหอมมะลิ', 'อ้อย'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-32-01', name: 'กลุ่มข้าวหอมมะลิทุ่งกุลาร้องไห้สมมติสุรินทร์', type: 'large_scale_group', code: '32', products: ['ข้าวหอมมะลิ', 'ไหม', 'งา'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-33-01', name: 'กลุ่มหอมแดงและผลไม้สมมติศรีสะเกษ', type: 'community_enterprise', code: '33', products: ['หอมแดง', 'ทุเรียน', 'ลองกอง'], activities: ['community_enterprise', 'fruit_festival'] },
  { id: 'at-e-34-01', name: 'กลุ่มแปลงใหญ่ข้าวสมมติอุบลราชธานี', type: 'large_scale_group', code: '34', products: ['ข้าว', 'ฟักทอง', 'ยางพารา'], activities: ['large_scale_group', 'otop_market'] },
  { id: 'at-e-35-01', name: 'กลุ่มข้าวอินทรีย์สมมติยโสธร', type: 'community_enterprise', code: '35', products: ['ข้าวอินทรีย์', 'งา', 'ถั่วลิสง'], activities: ['community_enterprise', 'learning_center'] },
  { id: 'at-e-40-01', name: 'กลุ่มแปลงใหญ่ข้าวสมมติขอนแก่น', type: 'large_scale_group', code: '40', products: ['ข้าวหอมมะลิ', 'อ้อย', 'ผลิตภัณฑ์จากข้าว'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-41-01', name: 'กลุ่มผ้าทอและอาหารถิ่นสมมติอุดรธานี', type: 'community_enterprise', code: '41', products: ['ผ้าทอ', 'ข้าว', 'หอมแดง'], activities: ['community_enterprise', 'otop_market'] },
  { id: 'at-e-42-01', name: 'กลุ่มกาแฟและไม้ผลเมืองหนาวสมมติภูเรือ', type: 'community_enterprise', code: '42', products: ['กาแฟ', 'สตรอว์เบอร์รี', 'ผักเมืองหนาว'], activities: ['community_enterprise', 'fruit_festival'] },
  { id: 'at-e-44-01', name: 'กลุ่มแปลงใหญ่ข้าวสมมติมหาสารคาม', type: 'large_scale_group', code: '44', products: ['ข้าว', 'อ้อย', 'มะม่วง'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-45-01', name: 'กลุ่มทอผ้าและข้าวสมมติร้อยเอ็ด', type: 'community_enterprise', code: '45', products: ['ผ้าไหม', 'ข้าว', 'ผักพื้นบ้าน'], activities: ['community_enterprise', 'otop_market'] },
  { id: 'at-e-46-01', name: 'กลุ่มสมุนไพรและข้าวสมมติเขาวง', type: 'otop_group', code: '46', products: ['ข้าว', 'สมุนไพร', 'น้ำพริกสำเร็จรูป'], activities: ['otop_market', 'workshop'] },
  { id: 'at-e-47-01', name: 'กลุ่มผ้าทอและข้าวอินทรีย์สมมติสกลนคร', type: 'community_enterprise', code: '47', products: ['ผ้าทอ', 'ข้าว', 'ยางพารา'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-48-01', name: 'กลุ่มแปลงใหญ่ข้าวริมโขงสมมติ', type: 'large_scale_group', code: '48', products: ['ข้าว', 'กาแฟ', 'มะม่วง'], activities: ['large_scale_group', 'learning_center'] },

  /* ภาคกลาง */
  { id: 'at-e-10-01', name: 'กลุ่มเกษตรเมืองสมมติหนองจอก', type: 'community_enterprise', code: '10', products: ['ข้าว', 'ผักแปลงเล็ก', 'ขนมไทย'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-11-01', name: 'กลุ่มแปลงใหญ่ข้าวและมะม่วงสมมติบางบ่อ', type: 'large_scale_group', code: '11', products: ['ข้าว', 'มะม่วง', 'ผักพื้นบ้าน'], activities: ['large_scale_group', 'otop_market'] },
  { id: 'at-e-12-01', name: 'กลุ่มส้มโอและของฝากสมมติไทรน้อย', type: 'community_enterprise', code: '12', products: ['ส้มโอ', 'มะม่วง', 'ขนมไทย'], activities: ['community_enterprise', 'fruit_festival'] },
  { id: 'at-e-14-01', name: 'กลุ่มแปลงใหญ่ข้าวสมมติอยุธยา', type: 'large_scale_group', code: '14', products: ['ข้าว', 'ถั่วลิสง', 'สมุนไพร'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-70-01', name: 'กลุ่มน้ำตาลมะพร้าวและของฝากสมมติราชบุรี', type: 'community_enterprise', code: '70', products: ['น้ำตาลมะพร้าว', 'ส้มโอ', 'ผ้าทอมือ'], activities: ['community_enterprise', 'otop_market'] },
  { id: 'at-e-71-01', name: 'กลุ่มแปลงใหญ่ข้าวและมะขามสมมติกาญจนบุรี', type: 'large_scale_group', code: '71', products: ['ข้าว', 'มะขาม', 'อ้อย'], activities: ['large_scale_group', 'fruit_festival'] },
  { id: 'at-e-72-01', name: 'กลุ่มขนมไทยและข้าวสมมติสุพรรณบุรี', type: 'community_enterprise', code: '72', products: ['ข้าว', 'ขนมไทย', 'มะม่วง'], activities: ['community_enterprise', 'workshop'] },
  { id: 'at-e-73-01', name: 'กลุ่มส้มโอและหัตถกรรมใบลานสมมติสามพราน', type: 'otop_group', code: '73', products: ['ส้มโอ', 'มะพร้าว', 'งานหัตถกรรมใบลาน'], activities: ['otop_market', 'fruit_festival'] },
  { id: 'at-e-74-01', name: 'กลุ่มแปลงใหญ่ผักและองุ่นสมมติบ้านแพ้ว', type: 'large_scale_group', code: '74', products: ['องุ่น', 'ผักปลอดภัย', 'มะนาว'], activities: ['large_scale_group', 'workshop'] },
  { id: 'at-e-75-01', name: 'กลุ่มน้ำตาลมะพร้าวและส้มโอสมมติอัมพวา', type: 'community_enterprise', code: '75', products: ['น้ำตาลมะพร้าว', 'ส้มโอ', 'มะพร้าวน้ำหอม'], activities: ['community_enterprise', 'fruit_festival'] },
  { id: 'at-e-76-01', name: 'กลุ่มขนมหวานและของฝากสมมติเพชรบุรี', type: 'otop_group', code: '76', products: ['สับปะรด', 'ขนมหวาน', 'น้ำตาลมะพร้าว'], activities: ['otop_market', 'workshop'] },
  { id: 'at-e-77-01', name: 'กลุ่มแปลงใหญ่สับปะรดสมมติประจวบคีรีขันธ์', type: 'large_scale_group', code: '77', products: ['สับปะรด', 'มะพร้าว', 'ข้าว'], activities: ['large_scale_group', 'learning_center'] },

  /* ภาคตะวันออก */
  { id: 'at-e-20-01', name: 'กลุ่มขนุนและผลไม้แปรรูปสมมติบ้านบึง', type: 'community_enterprise', code: '20', products: ['ขนุน', 'ส้มโอ', 'มะม่วง'], activities: ['community_enterprise', 'fruit_festival'] },
  { id: 'at-e-21-01', name: 'กลุ่มแปลงใหญ่ทุเรียนและยางพาราสมมติระยอง', type: 'large_scale_group', code: '21', products: ['ทุเรียน', 'ยางพารา', 'สละ'], activities: ['large_scale_group', 'fruit_festival'] },
  { id: 'at-e-22-01', name: 'กลุ่มผลไม้และเครื่องเทศสมมติจันทบุรี', type: 'community_enterprise', code: '22', products: ['มังคุด', 'ทุเรียน', 'พริกไทย'], activities: ['community_enterprise', 'otop_market'] },
  { id: 'at-e-22-02', name: 'กลุ่มแปลงใหญ่มังคุดสมมติขลุง', type: 'large_scale_group', code: '22', products: ['มังคุด', 'ลองกอง', 'ทุเรียน'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-23-01', name: 'กลุ่มแปรรูปผลไม้และของฝากสมมติตราด', type: 'otop_group', code: '23', products: ['เงาะ', 'มังคุด', 'กุ้งแห้ง'], activities: ['otop_market', 'workshop'] },
  { id: 'at-e-24-01', name: 'กลุ่มส้มโอและข้าวสมมติฉะเชิงเทรา', type: 'community_enterprise', code: '24', products: ['ส้มโอ', 'ข้าว', 'มะม่วง'], activities: ['community_enterprise', 'fruit_festival'] },
  { id: 'at-e-25-01', name: 'กลุ่มแปลงใหญ่ผลไม้และสมุนไพรสมมติปราจีนบุรี', type: 'large_scale_group', code: '25', products: ['กระท้อน', 'สมุนไพร', 'ส้มโอ'], activities: ['large_scale_group', 'workshop'] },
  { id: 'at-e-26-01', name: 'กลุ่มมะยงชิดและผลไม้สมมตินครนายก', type: 'community_enterprise', code: '26', products: ['มะยงชิด', 'ส้มโอ', 'ข้าว'], activities: ['community_enterprise', 'fruit_festival'] },

  /* ภาคใต้ */
  { id: 'at-e-80-01', name: 'กลุ่มแปลงใหญ่ยางพาราสมมติเมืองนคร', type: 'large_scale_group', code: '80', products: ['ยางพารา', 'ส้มโอ', 'ลองกอง'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-81-01', name: 'กลุ่มผลไม้และกาแฟสมมติอ่าวลึก', type: 'community_enterprise', code: '81', products: ['ทุเรียน', 'มังคุด', 'กาแฟ'], activities: ['community_enterprise', 'fruit_festival'] },
  { id: 'at-e-82-01', name: 'กลุ่มกะปิและผลไม้สมมติกะปง', type: 'otop_group', code: '82', products: ['ทุเรียน', 'มังคุด', 'กะปิ'], activities: ['otop_market', 'workshop'] },
  { id: 'at-e-83-01', name: 'กลุ่มของฝากและงานหัตถกรรมสมมติภูเก็ต', type: 'community_enterprise', code: '83', products: ['เงาะ', 'สะตอ', 'งานหัตถกรรม'], activities: ['community_enterprise', 'otop_market'] },
  { id: 'at-e-84-01', name: 'กลุ่มกาแฟและไม้ผลสมมติวิภาวดี', type: 'large_scale_group', code: '84', products: ['กาแฟ', 'ทุเรียน', 'ส้มโอ'], activities: ['large_scale_group', 'learning_center'] },
  { id: 'at-e-86-01', name: 'กลุ่มแปลงใหญ่ลองกองสมมติหลังสวน', type: 'large_scale_group', code: '86', products: ['ลองกอง', 'ทุเรียน', 'หมาก'], activities: ['large_scale_group', 'fruit_festival'] },
  { id: 'at-e-90-01', name: 'กลุ่มผ้าทอและอาหารถิ่นสมมติสงขลา', type: 'otop_group', code: '90', products: ['ผ้าทอ', 'ส้มเขียวหวาน', 'ลองกอง'], activities: ['otop_market', 'workshop'] },
  { id: 'at-e-92-01', name: 'กลุ่มสละและผลไม้สมมติกันตัง', type: 'community_enterprise', code: '92', products: ['สละ', 'ทุเรียน', 'ยางพารา'], activities: ['community_enterprise', 'fruit_festival'] },
];

const CERT_STANDARD_POOL: readonly string[] = [
  'การขึ้นทะเบียนวิสาหกิจชุมชน (รอตรวจสอบสิทธิ์จากทะเบียนกลาง)',
  'มาตรฐาน GAP พืช',
  'เกษตรอินทรีย์ Organic Thailand',
  'มาตรฐานผลิตภัณฑ์ชุมชน (มผช.)',
  'ฮาลาล',
  'การคัดเกรดผลผลิตตามเกณฑ์กรมส่งเสริมการเกษตร',
  'เลขสารบบอาหาร (อย.)',
];

function buildEnterprise(seed: EnterpriseSeed): AgriTourismEnterprise {
  const province = PROVINCE_BY_CODE.get(seed.code);
  if (!province) throw new Error(`agri-tourism-data: ทะเบียนกลุ่ม ${seed.id} อ้างรหัสจังหวัดที่ไม่อยู่ในตารางอ้างอิง (${seed.code})`);
  const key = `at:ent:${seed.code}:${seed.id}`;
  const scale = provinceScale(province);
  return {
    id: seed.id,
    name: seed.name,
    type: seed.type,
    typeLabel: ENTERPRISE_TYPE_LABELS[seed.type],
    provinceCode: province.code,
    provinceName: province.name,
    region: province.region,
    regionLabel: province.regionLabel,
    products: [...seed.products],
    memberCount: Math.round(clamp(between(`${key}:member`, 18, 220) * (0.7 + scale * 0.3), 12, 400)),
    areaRai: Math.round(clamp(between(`${key}:area`, 60, 1500) * (0.7 + scale * 0.35), 35, 3200)),
    certifiedStandards: pickMany(`${key}:cert`, CERT_STANDARD_POOL, Math.round(between(`${key}:certcount`, 1, 3))),
    tourActivities: uniqueOrdered(seed.activities),
    sample: true,
  };
}

const ENTERPRISES: AgriTourismEnterprise[] = ENTERPRISE_SEEDS.map(buildEnterprise);

/* ------------------------------------------------------------------ */
/* คำแนะนำการเดินทาง                                                     */
/* ------------------------------------------------------------------ */

interface TravelTipSeed {
  readonly id: string;
  readonly season: SeasonKey;
  readonly monthFrom: number;
  readonly monthTo: number;
  readonly title: string;
  readonly guidance: string;
  readonly regionScope: RegionKey | 'all';
  readonly activities: readonly ActivityId[];
}

const TRAVEL_TIP_SEEDS: TravelTipSeed[] = [
  {
    id: 'at-t-01', season: 'cool', monthFrom: 11, monthTo: 1, title: 'จองฟาร์มสเตย์ล่วงหน้าในฤดูเย็น', regionScope: 'all',
    activities: ['farmstay', 'workshop'],
    guidance: 'แหล่งที่มีที่พักในสวนรับได้ครั้งละไม่กี่ห้อง ช่วงหยุดยาวและฤดูเก็บผลไม้มักเต็มก่อนสองถึงสี่สัปดาห์ ควรยืนยันจำนวนผู้เข้าเรียนรู้และมื้ออาหารกับกลุ่มก่อนเดินทาง',
  },
  {
    id: 'at-t-02', season: 'cool', monthFrom: 11, monthTo: 1, title: 'พื้นที่สูงอากาศเย็น เผื่อเวลาเดินทางและเตรียมเสื้อกันหนาว', regionScope: 'north',
    activities: ['farmstay', 'royal_initiative', 'learning_center'],
    guidance: 'ทางขึ้นแปลงบนพื้นที่สูงใช้เวลามากกว่าที่คำนวณจากแผนที่ และมีหมอกหนาในช่วงเช้า ควรถึงแหล่งก่อนรอบบรรยายอย่างน้อยหนึ่งชั่วโมง',
  },
  {
    id: 'at-t-03', season: 'rainy', monthFrom: 6, monthTo: 9, title: 'ฤดูฝนทางในสวนลื่น ติดต่อวิทยากรก่อนเข้าพื้นที่', regionScope: 'all',
    activities: ['learning_center', 'workshop', 'farmstay'],
    guidance: 'พื้นทางเดินและคันนามักแฉะ ใส่รองเท้าที่มีดอกยาง และควรวางแผนว่ารอบนำชมอาจถูกเลื่อนถ้าฝนตกหนัก ให้โทรยืนยันกับกลุ่มในวันเดินทางจริง',
  },
  {
    id: 'at-t-04', season: 'rainy', monthFrom: 6, monthTo: 7, title: 'ช่วงผลไม้ตะวันออกคนหนาแน่น', regionScope: 'east',
    activities: ['fruit_festival', 'otop_market'],
    guidance: 'มิ.ย.-ก.ค. (บางสวนเริ่มพ.ค.) เป็นหน้าต่างที่ทุเรียน มังคุด และเงาะสุกพร้อมกัน ควรไปวันธรรมดาและไปถึงสวนช่วงเช้าเพื่อทันรอบตัดผล',
  },
  {
    id: 'at-t-05', season: 'rainy', monthFrom: 7, monthTo: 9, title: 'ผลไม้ใต้ตามหลังตะวันออก', regionScope: 'south',
    activities: ['fruit_festival', 'community_enterprise'],
    guidance: 'ลองกอง ทุเรียน และมังคุดฝั่งใต้สุกช่วงก.ค.-ก.ย. อย่าเดาวันผลสุกจากปฏิทินปีก่อน ควรสอบถามจุดรวบรวมของกลุ่มเพราะสภาพอากาศทำให้รุ่นผลเลื่อนได้',
  },
  {
    id: 'at-t-06', season: 'cool', monthFrom: 11, monthTo: 12, title: 'ใต้ตอนล่างระวังช่วงมรสุม', regionScope: 'south',
    activities: ['farmstay', 'otop_market'],
    guidance: 'พ.ย.-ธ.ค. ฝั่งอ่าวไทยฝนหนักและคลื่นแรง การเดินทางข้ามเกาะหรือขึ้นสวนบนเขาควรเช็กประกาศล่วงหน้าและวางแผนเผื่อหนึ่งคืน',
  },
  {
    id: 'at-t-07', season: 'hot', monthFrom: 2, monthTo: 4, title: 'แดดร้อนจัดโปรแกรมในโรงเรือนและมีจุดพัก', regionScope: 'all',
    activities: ['learning_center', 'workshop'],
    guidance: 'รอบนำชมกลางแจ้งควรสั้นกว่า 90 นาทีต่อช่วง มีร่มเงาและน้ำดื่มเพียงพอ โดยเฉพาะคณะผู้สูงอายุและเด็ก และควรเริ่มก่อน 10.00 น.',
  },
  {
    id: 'at-t-08', season: 'hot', monthFrom: 3, monthTo: 4, title: 'ผลไม้ฤดูร้อนมีหน้าต่างเก็บสั้นมาก', regionScope: 'central',
    activities: ['fruit_festival', 'farmstay'],
    guidance: 'มะยงชิดและส้มโอมีฤดูสั้นในมี.ค.-มิ.ย. ถ้าต้องการเก็บผลเองต้องนัดล่วงหน้าและยอมรับว่าผลในสวนไม่สุกพร้อมกันทั้งแปลง',
  },
  {
    id: 'at-t-09', season: 'cool', monthFrom: 10, monthTo: 12, title: 'งานบุญข้าวใหม่และตลาดชุมชนอีสาน', regionScope: 'northeast',
    activities: ['otop_market', 'community_enterprise', 'learning_center'],
    guidance: 'ต.ค.-ธ.ค. หลายกลุ่มจัดตลาดข้าวใหม่และกิจกรรมบุญในลานชุมชน แต่งกายสุภาพตามประเพณีท้องถิ่น และซื้อสินค้าจากกลุ่มโดยตรงเพื่อให้ถึงเศรษฐกิจชุมชนจริง',
  },
  {
    id: 'at-t-10', season: 'cool', monthFrom: 12, monthTo: 1, title: 'เทศกาลไม้ดอกเมืองหนาวการจราจรแออัด', regionScope: 'north',
    activities: ['fruit_festival', 'otop_market', 'royal_initiative'],
    guidance: 'ธ.ค.-ม.ค. จุดชมแปลงและถนนสายดอกไม้มีรถมาก ที่จอดของแหล่งในทะเบียนตัวอย่างรับได้จำกัด ควรใช้รถเหมาหรือจอดที่จุดรวมแล้วต่อเข้าพื้นที่',
  },
  {
    id: 'at-t-11', season: 'hot', monthFrom: 2, monthTo: 3, title: 'เรียนรู้ตามรอยศาสตร์พระราชาเป็นคณะ', regionScope: 'all',
    activities: ['royal_initiative', 'learning_center'],
    guidance: 'แหล่งเชิงบรรยายมักเปิดรับเป็นกลุ่มและต้องมีผู้ประสานงาน ควรส่งรายชื่อล่วงหน้าและแจ้งว่าต้องการรอบบรรยายหรือรอบปฏิบัติในแปลง',
  },
  {
    id: 'at-t-12', season: 'rainy', monthFrom: 8, monthTo: 9, title: 'แต่งกายเหมาะสมกับสวนและโรงเรือน', regionScope: 'all',
    activities: ['workshop', 'learning_center', 'farmstay'],
    guidance: 'ใส่เสื้อผ้าที่เลอะได้และรัดกุมเมื่อเข้าโรงเรือนผสมเกสรหรือลานคัดบรรจุ งดน้ำหอมแรงในห้องบ่มผล และฟังคำแนะนำวิทยากรเรื่องความปลอดภัยในเครื่องจักร',
  },
];

const TRAVEL_TIPS: AgriTourismTravelTip[] = TRAVEL_TIP_SEEDS.map((seed) => ({
  id: seed.id,
  season: seed.season,
  seasonLabel: SEASON_LABELS[seed.season],
  monthFrom: seed.monthFrom,
  monthTo: seed.monthTo,
  title: seed.title,
  guidance: seed.guidance,
  regionScope: seed.regionScope,
  relatedActivities: uniqueOrdered(seed.activities),
  sample: true,
}));

/* ------------------------------------------------------------------ */
/* ของเด่นรายภาค (ใช้ประกอบ regionCards)                                 */
/* ------------------------------------------------------------------ */

const REGION_SIGNATURE_PRODUCTS: Record<RegionKey, readonly string[]> = {
  north: ['กาแฟอาราบิก้า', 'ผ้าทอและงานคราฟต์เหนือ', 'ผักและไม้ดอกเมืองหนาว', 'ลำไยและผลไม้อบแห้ง', 'ข้าวพื้นเมือง'],
  northeast: ['ข้าวหอมมะลิและข้าวอินทรีย์', 'ผ้าไหมและย้อมสีธรรมชาติ', 'หอมแดงและกระเทียม', 'ผลิตภัณฑ์จากมันสำปะหลัง', 'สมุนไพรแปรรูป'],
  central: ['น้ำตาลมะพร้าวและขนมไทย', 'ส้มโอและผลไม้แปรรูป', 'ผ้าทอมือและหัตถกรรม', 'อาหารถิ่นและของฝาก', 'ข้าวและพืชหลังนา'],
  east: ['ทุเรียน', 'มังคุดและเงาะ', 'สละและลองกอง', 'พริกไทยและเครื่องเทศ', 'อัญมณีและงานหัตถกรรมชายทะเล'],
  south: ['ยางพารา', 'ปาล์มน้ำมัน', 'กาแฟโรบัสต้า', 'ลองกองและสละ', 'สมุนไพรและอาหารทะเลแปรรูป'],
};

/** ค่า fallback ของ topActivity เมื่อภาคในขอบเขตไม่มีข้อมูลเลย (ไม่ใช่ข้อสรุปจากต้นทาง) */
const REGION_DEFAULT_ACTIVITY: Record<RegionKey, ActivityId> = {
  north: 'farmstay',
  northeast: 'learning_center',
  central: 'workshop',
  east: 'fruit_festival',
  south: 'community_enterprise',
};

/* ------------------------------------------------------------------ */
/* โมเดลรายจังหวัด (grain จังหวัด — partition เดียวกับทะเบียนแหล่ง)         */
/* ------------------------------------------------------------------ */

/** แถว provinceStats พร้อมค่าภายในที่ summary ใช้รวมแต่ไม่โผล่ใน AgriTourismProvinceStat */
interface ProvinceStatModel extends AgriTourismProvinceStat {
  royalInitiativeCount: number;
}

function activityRank(a: ActivityId, b: ActivityId): number {
  return ACTIVITY_IDS.indexOf(a) - ACTIVITY_IDS.indexOf(b);
}

function topActivitiesOf(destinations: AgriTourismDestination[], limit: number): ActivityId[] {
  const tally = new Map<ActivityId, number>();
  for (const destination of destinations) {
    for (const activity of destination.activities) {
      tally.set(activity, (tally.get(activity) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || activityRank(a[0], b[0]))
    .slice(0, limit)
    .map(([activity]) => activity);
}

function seasonTotalsOf(destinations: AgriTourismDestination[], festivalMonths: readonly number[]): Record<SeasonKey, number> {
  const totals: Record<SeasonKey, number> = { cool: 0, rainy: 0, hot: 0 };
  for (const destination of destinations) {
    for (const month of destination.bestMonths) totals[seasonOfMonth(month)] += 1;
  }
  for (const month of festivalMonths) totals[seasonOfMonth(month)] += 1;
  return totals;
}

function peakSeasonOf(totals: Record<SeasonKey, number>): SeasonKey {
  const order: SeasonKey[] = ['cool', 'rainy', 'hot'];
  return order.reduce((best, season) => (totals[season] > totals[best] ? season : best), 'cool');
}

function buildProvinceStatRow(
  province: AgriTourismProvinceOption,
  destinations: AgriTourismDestination[],
  enterprises: AgriTourismEnterprise[],
): ProvinceStatModel {
  const key = `at:stat:${province.code}`;
  const scale = provinceScale(province);
  const provinceDestinations = destinations.filter((row) => row.provinceCode === province.code);
  const provinceEnterprises = enterprises.filter((row) => row.provinceCode === province.code);
  const festivalMonths = [...(FESTIVAL_MONTH_BY_PROVINCE.get(province.code) ?? [])];
  const destinationCount = provinceDestinations.length;
  // ยอดผู้เยี่ยมชมผูกกับ "ทะเบียนแหล่ง" เท่านั้น (grain ท่องเที่ยว) ไม่ได้เอา
  // จำนวนกลุ่มวิสาหกิจชุมชนมาบวกเป็น trips เพื่อไม่ให้ นับซ้ำข้าม grain
  const visitorTrips = destinationCount === 0
    ? 0
    : Math.round(clamp(TRIPS_PER_DESTINATION * destinationCount * scale * between(`${key}:trip`, 0.72, 1.35), 0, 500_000));
  const incomeBaht = Math.round(
    clamp(visitorTrips * SPEND_PER_TRIP_BAHT * between(`${key}:spend`, 0.78, 1.28), 0, 2_000_000_000),
  );
  const peakSeason = peakSeasonOf(seasonTotalsOf(provinceDestinations, festivalMonths));
  return {
    provinceCode: province.code,
    provinceName: province.name,
    region: province.region,
    regionLabel: province.regionLabel,
    destinationCount,
    farmstayCount: provinceDestinations.filter((row) => row.kind === 'farmstay').length,
    learningCenterCount: provinceDestinations.filter((row) => row.kind === 'learning_center').length,
    royalInitiativeCount: provinceDestinations.filter((row) => row.kind === 'royal_initiative').length,
    communityEnterpriseCount: provinceEnterprises.filter((row) => row.type === 'community_enterprise').length,
    largeScaleGroupCount: provinceEnterprises.filter((row) => row.type === 'large_scale_group').length,
    fruitFestivalMonths: festivalMonths,
    peakSeason,
    peakSeasonLabel: SEASON_LABELS[peakSeason],
    visitorTrips,
    incomeBaht,
    topActivities: topActivitiesOf(provinceDestinations, 3),
  };
}

/* ------------------------------------------------------------------ */
/* กรอง (filter → collections)                                          */
/* ------------------------------------------------------------------ */

function normalizeQuery(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

function includesQuery(query: string, values: readonly string[]): boolean {
  return values.some((value) => value.toLowerCase().includes(query));
}

function destinationMatches(query: string, destination: AgriTourismDestination): boolean {
  return includesQuery(query, [
    destination.name,
    destination.district,
    destination.provinceName,
    ...destination.signatureCrops,
  ]);
}

function workshopMatches(query: string, workshop: AgriTourismWorkshop): boolean {
  return includesQuery(query, [
    workshop.title,
    workshop.destinationName,
    workshop.provinceName,
    workshop.targetAudience,
  ]);
}

function enterpriseMatches(query: string, enterprise: AgriTourismEnterprise): boolean {
  return includesQuery(query, [
    enterprise.name,
    enterprise.provinceName,
    ...enterprise.products,
  ]);
}

function asToken(value: string | undefined): string {
  const raw = (value ?? '').normalize('NFC').trim();
  if (!raw || raw.toLowerCase() === 'all' || raw === 'ทั้งหมด') return 'all';
  return raw;
}

function asRegion(value: RegionKey | 'all' | undefined): RegionKey | 'all' {
  return value && value !== 'all' ? value : 'all';
}

function asActivity(value: ActivityId | 'all' | undefined): ActivityId | 'all' {
  return value && value !== 'all' && ACTIVITY_IDS.includes(value) ? value : 'all';
}

/** เดือน 1-12 เท่านั้น; ค่าอื่น (รวมถึง 'all') แปลว่า "ไม่กรองเดือน" → null */
function asMonth(value: number | 'all' | undefined): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 12) return null;
  return value;
}

function buildRegionCards(
  provinceScope: AgriTourismProvinceOption[],
  destinations: AgriTourismDestination[],
): AgriTourismRegionCard[] {
  return REGIONS.map((region) => {
    const provinces = provinceScope.filter((province) => province.region === region.key);
    const provinceCodes = new Set(provinces.map((province) => province.code));
    const regionDestinations = destinations.filter((destination) => destination.region === region.key);
    // peakMonths นับจาก "เหตุการณ์ในขอบเขต" เท่านั้น: แหล่งที่แนะนำเดือนนั้น
    // + หน้าต่าง festival ของผลไม้ที่มีจังหวัดในขอบเขต (festival ให้น้ำหนัก 2)
    const monthCounts = new Array<number>(13).fill(0);
    for (const destination of regionDestinations) {
      for (const month of destination.bestMonths) monthCounts[month] += 1;
    }
    let hasEvent = regionDestinations.length > 0;
    for (const seed of FRUIT_CALENDAR_SEEDS) {
      if (!seed.codes.some((code) => provinceCodes.has(code))) continue;
      for (const festivalMonth of seed.festivalMonths) {
        hasEvent = true;
        monthCounts[festivalMonth] += 2;
      }
    }
    const topMonthCount = hasEvent ? Math.max(...monthCounts.slice(1)) : 0;
    const peakMonths = topMonthCount === 0
      ? []
      : monthCounts
          .map((count, index) => ({ month: index, count }))
          .filter((entry) => entry.month >= 1 && entry.count === topMonthCount)
          .slice(0, 3)
          .map((entry) => entry.month);
    const topActivity = topActivitiesOf(regionDestinations, 1)[0] ?? REGION_DEFAULT_ACTIVITY[region.key];
    // แหล่งเด่นเลือกตาม scale ของจังหวัดก่อน แล้วจึงเรียงด้วย id เพื่อให้คงที่
    // เมื่อขอบเขตเปลี่ยน (ไม่ใช่การสุ่ม และไม่ใช่การอ้างว่า "ดีที่สุด" จริง)
    const highlightSource = [...regionDestinations].sort((a, b) => {
      const scaleA = PROVINCE_TOURISM_SCALE[a.provinceCode] ?? 1;
      const scaleB = PROVINCE_TOURISM_SCALE[b.provinceCode] ?? 1;
      return scaleB - scaleA || a.id.localeCompare(b.id);
    })[0];
    return {
      region: region.key,
      regionLabel: region.label,
      provinceCount: provinces.length,
      destinationCount: regionDestinations.length,
      peakMonths,
      topActivity,
      topActivityLabel: ACTIVITY_LABELS[topActivity],
      signatureProducts: [...(REGION_SIGNATURE_PRODUCTS[region.key] ?? [])],
      highlightDestinationName: highlightSource
        ? highlightSource.name
        : 'ไม่มีแหล่งในทะเบียนตัวอย่างที่ตรงกับขอบเขตที่เลือก',
    };
  });
}

/**
 * ประกอบ payload ของหน้า /agri-tourism และ GET /api/v1/agri-tourism
 *
 * หมายเหตุ: regionCards ส่งออกครบทุกภาค (5 ใบเสมอ) เพื่อไม่ให้ layout แตก
 * เมื่อผู้ใช้เลือกจังหวัดในภาคเดียว — ค่าภายในการ์ดคำนวณจากขอบเขตที่กรองแล้ว
 * ดังนั้น provinceCount/destinationCount ของภาคอื่นจะเป็น 0 ตามความจริงของ scope
 */
export function buildAgriTourismDashboard(filters: AgriTourismFilters = {}): AgriTourismDashboardPayload {
  const provinceCode = asToken(filters.provinceCode);
  const region = asRegion(filters.region);
  const activity = asActivity(filters.activity);
  const month = asMonth(filters.month);
  const search = (filters.search ?? '').normalize('NFC').trim();
  const query = normalizeQuery(search);
  // รหัสจังหวัดที่ไม่อยู่ในตารางอ้างอิง = ไม่พบข้อมูล (API lane ตรวจและ 400 ก่อนถึงเรา)
  const unknownProvince = provinceCode !== 'all' && !AGRI_TOURISM_PROVINCE_CODES.has(provinceCode);

  const provinceScope = AGRI_TOURISM_PROVINCES.filter((province) => {
    if (unknownProvince) return false;
    if (provinceCode !== 'all' && province.code !== provinceCode) return false;
    if (region !== 'all' && province.region !== region) return false;
    return true;
  });
  const codesInScope = new Set(provinceScope.map((province) => province.code));

  const destinations = AGRI_TOURISM_DESTINATIONS.filter((destination) => {
    if (!codesInScope.has(destination.provinceCode)) return false;
    if (activity !== 'all' && !destination.activities.includes(activity)) return false;
    if (month !== null && !destination.bestMonths.includes(month)) return false;
    if (query.length > 0 && !destinationMatches(query, destination)) return false;
    return true;
  });

  const workshops = WORKSHOPS.filter((workshop) => {
    if (!codesInScope.has(workshop.provinceCode)) return false;
    if (activity !== 'all' && workshop.activity !== activity) return false;
    if (month !== null && !workshop.months.includes(month)) return false;
    if (query.length > 0 && !workshopMatches(query, workshop)) return false;
    return true;
  });

  const enterprises = ENTERPRISES.filter((enterprise) => {
    if (!codesInScope.has(enterprise.provinceCode)) return false;
    if (activity !== 'all' && !enterprise.tourActivities.includes(activity)) return false;
    if (query.length > 0 && !enterpriseMatches(query, enterprise)) return false;
    return true;
  });

  // ปฏิทิน: จำกัดจังหวัดตาม scope (ไม่ตัดด้วย search/activity เพื่อคง grain "เดือน")
  const calendarEntries = FRUIT_CALENDAR_SEEDS.map((seed) => ({
    seed,
    codes: seed.codes.filter((code) => codesInScope.has(code)),
  }));

  const festivalMonthSet = new Set<number>();
  for (const entry of calendarEntries) {
    if (entry.codes.length === 0) continue;
    for (const festMonth of entry.seed.festivalMonths) festivalMonthSet.add(festMonth);
  }

  const eventCountOf = (calendarMonth: number): number =>
    destinations.filter((destination) => destination.bestMonths.includes(calendarMonth)).length
    + workshops.filter((workshop) => workshop.months.includes(calendarMonth)).length
    + calendarEntries.filter((entry) => entry.codes.length > 0 && entry.seed.festivalMonths.includes(calendarMonth)).length;

  const fullCalendar = Array.from({ length: 12 }, (_, index) => {
    const calendarMonth = index + 1;
    return buildFruitMonth(calendarMonth, calendarEntries, eventCountOf(calendarMonth));
  });
  const fruitCalendar = month === null ? fullCalendar : fullCalendar.filter((row) => row.month === month);

  const provinceStatModels = provinceScope.map((province) => buildProvinceStatRow(province, destinations, enterprises));

  // เมื่อมีการกรอง "ราย record" (กิจกรรม/เดือน/คำค้น) ให้เก็บเฉพาะจังหวัดที่ยังมี
  // รายการเหลืออยู่ ไม่ทิ้งแถว 0 ไว้ให้หน้าจอไปตีความว่าเป็น coverage
  const narrowing = activity !== 'all' || month !== null || query.length > 0;
  const scopedRows = provinceStatModels.filter((row) => !narrowing
    || row.destinationCount > 0
    || row.communityEnterpriseCount > 0
    || row.largeScaleGroupCount > 0);

  // แถวที่ส่งออกกับยอดที่ summary รวมต้องเป็นชุดเดียวกัน — royalInitiativeCount
  // เป็นค่าภายใน (grain จังหวัด) ที่ไม่อยู่ใน AgriTourismProvinceStat
  const provinceStats: AgriTourismProvinceStat[] = scopedRows.map((row) => ({
    provinceCode: row.provinceCode,
    provinceName: row.provinceName,
    region: row.region,
    regionLabel: row.regionLabel,
    destinationCount: row.destinationCount,
    farmstayCount: row.farmstayCount,
    learningCenterCount: row.learningCenterCount,
    communityEnterpriseCount: row.communityEnterpriseCount,
    largeScaleGroupCount: row.largeScaleGroupCount,
    fruitFestivalMonths: [...row.fruitFestivalMonths],
    peakSeason: row.peakSeason,
    peakSeasonLabel: row.peakSeasonLabel,
    visitorTrips: row.visitorTrips,
    incomeBaht: row.incomeBaht,
    topActivities: [...row.topActivities],
  }));

  const sumOf = (pickRow: (row: ProvinceStatModel) => number): number =>
    scopedRows.reduce((acc, row) => acc + pickRow(row), 0);

  const summary: AgriTourismSummary = {
    provinceCount: scopedRows.length,
    destinationCount: sumOf((row) => row.destinationCount),
    farmstayCount: sumOf((row) => row.farmstayCount),
    learningCenterCount: sumOf((row) => row.learningCenterCount),
    royalInitiativeCount: sumOf((row) => row.royalInitiativeCount),
    communityEnterpriseCount: sumOf((row) => row.communityEnterpriseCount),
    largeScaleGroupCount: sumOf((row) => row.largeScaleGroupCount),
    workshopCount: workshops.length,
    // นับทั้ง 12 เดือนตามขอบเขตจังหวัด/ภาค (ไม่ถูก month filter ตัดเหลือ 1)
    // เพราะนิยามของ field นี้คือ "จำนวนเดือนที่มีหน้าต่าง festival"
    fruitFestivalMonthCount: festivalMonthSet.size,
    estimatedVisitorTrips: sumOf((row) => row.visitorTrips),
    estimatedIncomeBaht: sumOf((row) => row.incomeBaht),
  };

  const regionCards = buildRegionCards(provinceScope, destinations);

  const travelTips = TRAVEL_TIPS.filter((tip) => {
    if (region !== 'all' && tip.regionScope !== 'all' && tip.regionScope !== region) return false;
    if (activity !== 'all' && !tip.relatedActivities.includes(activity)) return false;
    return true;
  });

  const counts: AgriTourismCounts = {
    destinationCount: destinations.length,
    workshopCount: workshops.length,
    enterpriseCount: enterprises.length,
    provinceCount: scopedRows.length,
  };

  const warnings = [...AGRI_TOURISM_WARNINGS];
  if (unknownProvince) {
    warnings.push(`รหัสจังหวัด "${provinceCode}" ไม่อยู่ในตารางอ้างอิง 77 จังหวัด จึงคืนชุดว่างแทนการประมาณค่า (ฝั่ง API ตรวจพารามิเตอร์นี้และตอบ 400 ได้)`);
  }
  if (month !== null) {
    warnings.push(
      `กำลังดูเดือน ${monthLabel(month)}: fruitCalendar ถูกตัดเหลือเดือนเดียวตามนิยามของ view ส่วนยอดผู้เยี่ยมชมและรายได้ยังเป็นตัวเลขระดับปีของโมเดล (ไม่คูณเศษส่วนของเดือน) และสรุปเดือน festival ยังนับทั้งปี`,
    );
  }
  if (activity !== 'all') {
    warnings.push(
      `กรองด้วยกิจกรรม "${activity}": provinceStats และ summary นับเฉพาะแหล่งที่ยังเหลือหลังกรอง (activities กับ kind เป็นคนละแกน) จึงเทียบยอดกับมุมมองทั้งหมดตรง ๆ ไม่ได้`,
    );
  }
  if (query.length > 0 && counts.destinationCount + counts.workshopCount + counts.enterpriseCount === 0) {
    warnings.push('คำค้นไม่ตรงกับชื่อแหล่งท่องเที่ยว เวิร์กช็อป กลุ่มวิสาหกิจ ชื่อจังหวัด ชื่ออำเภอ หรือชื่อสินค้าในขอบเขตที่เลือก ระบบจึงคืนรายการว่างแทนการเดา');
  }
  if (scopedRows.length === 0 && !unknownProvince) {
    warnings.push('ขอบเขตที่เลือกไม่มีแถวจังหวัดเหลืออยู่ จึงแสดงค่าว่างแทนการเติมตัวเลขเอง');
  }

  return {
    sample: true,
    access: 'metadata_only',
    dataAsOf: AGRI_TOURISM_DATA_AS_OF,
    warnings,
    sources: AGRI_TOURISM_SOURCES,
    summary,
    regionCards,
    provinceStats,
    destinations,
    fruitCalendar,
    workshops,
    enterprises,
    travelTips,
    appliedFilters: {
      provinceCode,
      region,
      activity,
      month: month === null ? 'all' : `${month}`,
      search,
    },
    counts,
  };
}
