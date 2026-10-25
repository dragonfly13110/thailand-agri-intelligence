/**
 * Deterministic synthetic land-reform statistics for `/land-reform`.
 *
 * ALRO resource rights are still pending, so this module publishes no upstream
 * values: every row is a seeded structural simulation (`sample: true`,
 * `access: metadata_only`). Generation uses FNV-1a + mulberry32 only, keeps the
 * five placeholder zero-area provinces, and enforces the invariants
 * allocated <= total area, issued <= verified <= applications <= plotCount,
 * farmers <= plots, and land-use shares summing to 100 for every non-zero row
 * and for the unfiltered aggregate. Seeded subsets of provinces carry no
 * title-deed applications and no rented area so the `landType` filter returns
 * distinct result sets instead of repeating the same 72 rows every time.
 */

export type Region = 'ภาคเหนือ' | 'ภาคกลาง' | 'ภาคตะวันออกเฉียงเหนือ' | 'ภาคตะวันออก' | 'ภาคตะวันตก' | 'ภาคใต้';
export type LandType = 'sor_por_kor_4_01' | 'agricultural_title_deed' | 'rented_land';
export type TenureStatus = 'owner_secure' | 'owner_insecure' | 'mixed' | 'tenant';

export interface LandUseShare {
  id: 'field_crops' | 'fruit_tree' | 'rice' | 'livestock' | 'water';
  label: string;
  areaRai: number;
  sharePercent: number;
}

export interface TenureBreakdown {
  ownedRai: number;
  rentedRai: number;
  ownedSharePercent: number;
  rentedSharePercent: number;
}

export interface TitleDeedProgress {
  applications: number;
  verified: number;
  issued: number;
  issuedAreaRai: number;
  progressPercent: number;
}

export interface ProvinceLandReform {
  provinceCode: string;
  provinceName: string;
  region: Region;
  hasAlroArea: boolean;
  zeroAreaReason: string | null;
  totalReformAreaRai: number;
  allocatedAreaRai: number;
  allocationProgressPercent: number;
  farmersWithPermit: number;
  plotCount: number;
  averagePlotSizeRai: number;
  titleDeed: TitleDeedProgress;
  tenure: TenureBreakdown;
  dominantTenureStatus: TenureStatus | null;
  tenureSecurityIndex: number;
  landUse: LandUseShare[];
}

export interface LandReformSummary {
  provinceCount: number;
  provincesWithAlroArea: number;
  provincesWithoutAlroArea: number;
  totalReformAreaRai: number;
  allocatedAreaRai: number;
  allocationProgressPercent: number;
  farmersWithPermit: number;
  plotCount: number;
  averagePlotSizeRai: number;
  titleDeed: TitleDeedProgress;
  tenure: TenureBreakdown;
  tenureSecurityIndex: number;
}

export interface LandReformFilters {
  provinceCode?: string;
  landType?: LandType;
  tenureStatus?: TenureStatus;
  region?: Region;
  q?: string;
}

export interface LandReformData {
  sample: true;
  datasetVersion: string;
  asOfDate: string;
  bannerText: string;
  disclaimer: string;
  summary: LandReformSummary;
  landUse: LandUseShare[];
  provinces: ProvinceLandReform[];
  zeroAreaProvinces: Array<{ provinceCode: string; provinceName: string; reason: string }>;
  filters: {
    provinceCode: string | null;
    landType: LandType | null;
    tenureStatus: TenureStatus | null;
    region: Region | null;
    q: string;
  };
  sources: Array<{ id: string; name: string; type: string; access: 'metadata_only' }>;
  warnings: string[];
}

export const LAND_REFORM_DATASET_VERSION = 'alro-land-v1';
export const LAND_REFORM_AS_OF_DATE = '2026-10-25';
export const LAND_REFORM_BANNER_TEXT = 'ข้อมูลตัวอย่างเชิงโครงสร้างเพื่อการสาธิต สิทธิ์ ALRO อยู่ระหว่างตรวจสอบ';
export const LAND_REFORM_DISCLAIMER =
  'ชุดข้อมูลนี้เป็นแบบจำลองเชิงโครงสร้างที่สร้างจาก seed คงที่ (deterministic simulation) เพื่อสาธิตหน้าจอเท่านั้น ไม่ใช่สถิติทางการของสำนักงานการปฏิรูปที่ดินเพื่อเกษตรกรรม (ส.ป.ก.) และไม่ได้อ่านค่าจาก resource ใดของ ALRO — สิทธิ์การเผยแพร่ข้อมูล ALRO ยังเป็น pending (อยู่ระหว่างการตรวจสอบ) และเปิดได้เพียง metadata_only จึงห้ามใช้ตัวเลขเหล่านี้เป็นข้อมูลเผยแพร่หรือหลักฐานใด ๆ';
export const LAND_REFORM_WARNINGS: string[] = [
  'ตัวเลขทั้งหมดในหน้านี้เป็นข้อมูลจำลอง (sample: true) ที่สร้างจาก seed คงที่ ไม่ใช่สถิติทางการของ ส.ป.ก. และไม่ใช่ผลการตรวจสอบจากต้นทาง',
  'สิทธิ์ของ resource ALRO ยังเป็น pending/อยู่ระหว่างตรวจสอบ โมดูลนี้เป็น metadata_only + sample ไม่มีการเรียก API หรืออ่านไฟล์ตัวเลขจาก ALRO',
  'ห้ามนำตัวเลขจำลองไปใช้ยืนยันสิทธิ์ที่ดิน ขอสินเชื่อ หรือกำหนดนโยบาย/มาตรการช่วยเหลือใด ๆ',
  'แบบจำลองบังคับ invariant: allocatedAreaRai ≤ totalReformAreaRai, issued ≤ verified ≤ applications ≤ plotCount, farmersWithPermit ≤ plotCount และสัดส่วนการใช้ที่ดินรวม 100%',
  '5 จังหวัดที่ไม่มีเขตปฏิรูปที่ดิน (กรุงเทพมหานคร สมุทรปราการ นนทบุรี สมุทรสาคร ภูเก็ต) เป็น placeholder ของแบบจำลอง ไม่ใช่ข้อสรุปหรือผลการตรวจสอบอย่างเป็นทางการ',
];

export const REGIONS: readonly Region[] = [
  'ภาคเหนือ',
  'ภาคกลาง',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคตะวันออก',
  'ภาคตะวันตก',
  'ภาคใต้',
];

export const LAND_TYPES: readonly LandType[] = ['sor_por_kor_4_01', 'agricultural_title_deed', 'rented_land'];

export const LAND_TYPE_LABELS: Record<LandType, string> = {
  sor_por_kor_4_01: 'ส.ป.ก. 4-01',
  agricultural_title_deed: 'โฉนดเพื่อการเกษตร',
  rented_land: 'ที่ดินเช่าทำกิน',
};

export const TENURE_STATUS_LABELS: Record<TenureStatus, string> = {
  owner_secure: 'ที่ดินของตนเองมั่นคง',
  owner_insecure: 'ที่ดินของตนเองแต่ยังไม่มั่นคง',
  mixed: 'ถือครองผสม',
  tenant: 'เช่าทำกินเป็นหลัก',
};

const PROVINCE_REFERENCE: ReadonlyArray<{ code: string; name: string }> = [
  { code: '10', name: 'กรุงเทพมหานคร' },
  { code: '11', name: 'สมุทรปราการ' },
  { code: '12', name: 'นนทบุรี' },
  { code: '13', name: 'ปทุมธานี' },
  { code: '14', name: 'พระนครศรีอยุธยา' },
  { code: '15', name: 'อ่างทอง' },
  { code: '16', name: 'ลพบุรี' },
  { code: '17', name: 'สิงห์บุรี' },
  { code: '18', name: 'ชัยนาท' },
  { code: '19', name: 'สระบุรี' },
  { code: '20', name: 'ชลบุรี' },
  { code: '21', name: 'ระยอง' },
  { code: '22', name: 'จันทบุรี' },
  { code: '23', name: 'ตราด' },
  { code: '24', name: 'ฉะเชิงเทรา' },
  { code: '25', name: 'ปราจีนบุรี' },
  { code: '26', name: 'นครนายก' },
  { code: '27', name: 'สระแก้ว' },
  { code: '30', name: 'นครราชสีมา' },
  { code: '31', name: 'บุรีรัมย์' },
  { code: '32', name: 'สุรินทร์' },
  { code: '33', name: 'ศรีสะเกษ' },
  { code: '34', name: 'อุบลราชธานี' },
  { code: '35', name: 'ยโสธร' },
  { code: '36', name: 'ชัยภูมิ' },
  { code: '37', name: 'อำนาจเจริญ' },
  { code: '38', name: 'บึงกาฬ' },
  { code: '39', name: 'หนองบัวลำภู' },
  { code: '40', name: 'ขอนแก่น' },
  { code: '41', name: 'อุดรธานี' },
  { code: '42', name: 'เลย' },
  { code: '43', name: 'หนองคาย' },
  { code: '44', name: 'มหาสารคาม' },
  { code: '45', name: 'ร้อยเอ็ด' },
  { code: '46', name: 'กาฬสินธุ์' },
  { code: '47', name: 'สกลนคร' },
  { code: '48', name: 'นครพนม' },
  { code: '49', name: 'มุกดาหาร' },
  { code: '50', name: 'เชียงใหม่' },
  { code: '51', name: 'ลำพูน' },
  { code: '52', name: 'ลำปาง' },
  { code: '53', name: 'อุตรดิตถ์' },
  { code: '54', name: 'แพร่' },
  { code: '55', name: 'น่าน' },
  { code: '56', name: 'พะเยา' },
  { code: '57', name: 'เชียงราย' },
  { code: '58', name: 'แม่ฮ่องสอน' },
  { code: '60', name: 'นครสวรรค์' },
  { code: '61', name: 'อุทัยธานี' },
  { code: '62', name: 'กำแพงเพชร' },
  { code: '63', name: 'ตาก' },
  { code: '64', name: 'สุโขทัย' },
  { code: '65', name: 'พิษณุโลก' },
  { code: '66', name: 'พิจิตร' },
  { code: '67', name: 'เพชรบูรณ์' },
  { code: '70', name: 'ราชบุรี' },
  { code: '71', name: 'กาญจนบุรี' },
  { code: '72', name: 'สุพรรณบุรี' },
  { code: '73', name: 'นครปฐม' },
  { code: '74', name: 'สมุทรสาคร' },
  { code: '75', name: 'สมุทรสงคราม' },
  { code: '76', name: 'เพชรบุรี' },
  { code: '77', name: 'ประจวบคีรีขันธ์' },
  { code: '80', name: 'นครศรีธรรมราช' },
  { code: '81', name: 'กระบี่' },
  { code: '82', name: 'พังงา' },
  { code: '83', name: 'ภูเก็ต' },
  { code: '84', name: 'สุราษฎร์ธานี' },
  { code: '85', name: 'ระนอง' },
  { code: '86', name: 'ชุมพร' },
  { code: '90', name: 'สงขลา' },
  { code: '91', name: 'สตูล' },
  { code: '92', name: 'ตรัง' },
  { code: '93', name: 'พัทลุง' },
  { code: '94', name: 'ปัตตานี' },
  { code: '95', name: 'ยะลา' },
  { code: '96', name: 'นราธิวาส' },
];

const ZERO_AREA_REASONS = new Map<string, string>([
  ['10', 'พื้นที่เขตเมืองหนาแน่น ไม่มีเขตปฏิรูปที่ดินเพื่อเกษตรกรรมในแบบจำลอง'],
  ['11', 'พื้นที่ชายฝั่งอุตสาหกรรมและเขตเมืองต่อเนื่อง ไม่มีเขตปฏิรูปที่ดินในแบบจำลอง'],
  ['12', 'พื้นที่ปริมณฑลที่เปลี่ยนเป็นชุมชนเมือง ไม่มีเขตปฏิรูปที่ดินในแบบจำลอง'],
  ['74', 'พื้นที่ชายฝั่งและเขตอุตสาหกรรมประมง ไม่มีเขตปฏิรูปที่ดินในแบบจำลอง'],
  ['83', 'พื้นที่เกาะที่เน้นการท่องเที่ยว ไม่มีเขตปฏิรูปที่ดินเพื่อเกษตรกรรมในแบบจำลอง'],
]);

const REGION_RANGES: ReadonlyArray<{ region: Region; min: number; max: number }> = [
  { region: 'ภาคกลาง', min: 10, max: 19 },
  { region: 'ภาคตะวันออก', min: 20, max: 27 },
  { region: 'ภาคตะวันออกเฉียงเหนือ', min: 30, max: 49 },
  { region: 'ภาคเหนือ', min: 50, max: 58 },
  { region: 'ภาคเหนือ', min: 60, max: 67 },
  { region: 'ภาคตะวันตก', min: 70, max: 77 },
  { region: 'ภาคใต้', min: 80, max: 86 },
  { region: 'ภาคใต้', min: 90, max: 96 },
];

const REGION_AREA_RANGES: Record<Region, readonly [number, number]> = {
  ภาคเหนือ: [180_000, 900_000],
  ภาคกลาง: [120_000, 500_000],
  ภาคตะวันออกเฉียงเหนือ: [300_000, 1_300_000],
  ภาคตะวันออก: [150_000, 600_000],
  ภาคตะวันตก: [180_000, 700_000],
  ภาคใต้: [120_000, 550_000],
};

const LAND_USE_DEFINITIONS: ReadonlyArray<{ id: LandUseShare['id']; label: string }> = [
  { id: 'field_crops', label: 'พืชไร่' },
  { id: 'fruit_tree', label: 'ไม้ผล-ไม้ยืนต้น' },
  { id: 'rice', label: 'ข้าว' },
  { id: 'livestock', label: 'ปศุสัตว์' },
  { id: 'water', label: 'แหล่งน้ำ' },
];

const LAND_USE_WEIGHTS: Record<Region, Record<LandUseShare['id'], number>> = {
  ภาคเหนือ: { field_crops: 0.32, fruit_tree: 0.23, rice: 0.22, livestock: 0.08, water: 0.15 },
  ภาคกลาง: { field_crops: 0.2, fruit_tree: 0.1, rice: 0.55, livestock: 0.08, water: 0.07 },
  ภาคตะวันออกเฉียงเหนือ: { field_crops: 0.34, fruit_tree: 0.12, rice: 0.4, livestock: 0.08, water: 0.06 },
  ภาคตะวันออก: { field_crops: 0.18, fruit_tree: 0.42, rice: 0.22, livestock: 0.09, water: 0.09 },
  ภาคตะวันตก: { field_crops: 0.28, fruit_tree: 0.22, rice: 0.3, livestock: 0.1, water: 0.1 },
  ภาคใต้: { field_crops: 0.1, fruit_tree: 0.52, rice: 0.22, livestock: 0.07, water: 0.09 },
};

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createRandom(seed: string): () => number {
  return mulberry32(fnv1a32(seed));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function regionForCode(code: string): Region {
  const numeric = Number(code);
  for (const range of REGION_RANGES) {
    if (numeric >= range.min && numeric <= range.max) return range.region;
  }
  throw new Error(`Unmapped province code: ${code}`);
}

function integerShares(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (weight / total) * 100);
  const shares = raw.map((value) => Math.floor(value));
  let remainder = 100 - shares.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    shares[order[cursor].index] += 1;
    remainder -= 1;
    cursor = (cursor + 1) % order.length;
  }
  return shares;
}

function tenureStatusFor(ownedSharePercent: number): TenureStatus {
  if (ownedSharePercent >= 80) return 'owner_secure';
  if (ownedSharePercent >= 60) return 'owner_insecure';
  if (ownedSharePercent >= 40) return 'mixed';
  return 'tenant';
}

function emptyLandUse(): LandUseShare[] {
  return LAND_USE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    areaRai: 0,
    sharePercent: 0,
  }));
}

function buildProvinceRow(code: string, name: string, region: Region): ProvinceLandReform {
  const zeroAreaReason = ZERO_AREA_REASONS.get(code);
  if (zeroAreaReason !== undefined) {
    return {
      provinceCode: code,
      provinceName: name,
      region,
      hasAlroArea: false,
      zeroAreaReason,
      totalReformAreaRai: 0,
      allocatedAreaRai: 0,
      allocationProgressPercent: 0,
      farmersWithPermit: 0,
      plotCount: 0,
      averagePlotSizeRai: 0,
      titleDeed: { applications: 0, verified: 0, issued: 0, issuedAreaRai: 0, progressPercent: 0 },
      tenure: { ownedRai: 0, rentedRai: 0, ownedSharePercent: 0, rentedSharePercent: 0 },
      dominantTenureStatus: null,
      tenureSecurityIndex: 0,
      landUse: emptyLandUse(),
    };
  }

  const core = createRandom(`${LAND_REFORM_DATASET_VERSION}:${code}:core`);
  const [minArea, maxArea] = REGION_AREA_RANGES[region];
  const totalReformAreaRai = Math.round(minArea + core() * (maxArea - minArea));
  const allocatedAreaRai = round2(totalReformAreaRai * (0.58 + core() * 0.3));
  const allocationProgressPercent = round2((allocatedAreaRai / totalReformAreaRai) * 100);

  const averageFarmSizeRai = round1(12 + core() * 16);
  const farmersWithPermit = Math.max(1, Math.floor(allocatedAreaRai / averageFarmSizeRai));
  const plotCount = Math.max(farmersWithPermit, Math.ceil(farmersWithPermit * (1.05 + core() * 0.25)));
  const averagePlotSizeRai = round2(allocatedAreaRai / plotCount);

  const hasTitleApplications =
    createRandom(`${LAND_REFORM_DATASET_VERSION}:${code}:title-pipeline`)() >= 0.16;
  const applications = hasTitleApplications
    ? Math.max(1, Math.min(plotCount, Math.floor(plotCount * (0.35 + core() * 0.5))))
    : 0;
  const verified = Math.min(applications, Math.floor(applications * (0.55 + core() * 0.35)));
  const issued = Math.min(verified, Math.floor(verified * (0.3 + core() * 0.55)));
  const issuedAreaRai = round2(allocatedAreaRai * (issued / plotCount));
  const issuedRatioPercent = (issued / plotCount) * 100;
  const titleDeedProgressPercent = round2(issuedRatioPercent);

  const tenureRandom = createRandom(`${LAND_REFORM_DATASET_VERSION}:${code}:tenure`);
  const hasRental = createRandom(`${LAND_REFORM_DATASET_VERSION}:${code}:rental`)() >= 0.25;
  const ownedTenths = hasRental ? 280 + Math.floor(tenureRandom() * 621) : 1000;
  const ownedRai = round2((allocatedAreaRai * ownedTenths) / 1000);
  const rentedRai = round2(allocatedAreaRai - ownedRai);
  const ownedSharePercent = ownedTenths / 10;
  const rentedSharePercent = round1(100 - ownedSharePercent);
  const dominantTenureStatus = tenureStatusFor(ownedSharePercent);
  const tenureSecurityIndex = round1(
    clamp(ownedSharePercent * 0.7 + issuedRatioPercent * 0.3, 0, 100),
  );

  const landUseRandom = createRandom(`${LAND_REFORM_DATASET_VERSION}:${code}:land-use`);
  const weights = LAND_USE_DEFINITIONS.map((definition) => {
    const base = LAND_USE_WEIGHTS[region][definition.id];
    return base * (0.75 + landUseRandom() * 0.5);
  });
  const shares = integerShares(weights);
  const landUse = LAND_USE_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    label: definition.label,
    areaRai: round2((allocatedAreaRai * shares[index]) / 100),
    sharePercent: shares[index],
  }));

  return {
    provinceCode: code,
    provinceName: name,
    region,
    hasAlroArea: true,
    zeroAreaReason: null,
    totalReformAreaRai,
    allocatedAreaRai,
    allocationProgressPercent,
    farmersWithPermit,
    plotCount,
    averagePlotSizeRai,
    titleDeed: {
      applications,
      verified,
      issued,
      issuedAreaRai,
      progressPercent: titleDeedProgressPercent,
    },
    tenure: { ownedRai, rentedRai, ownedSharePercent, rentedSharePercent },
    dominantTenureStatus,
    tenureSecurityIndex,
    landUse,
  };
}

export const PROVINCE_LAND_REFORM: ProvinceLandReform[] = PROVINCE_REFERENCE.map((province) =>
  buildProvinceRow(province.code, province.name, regionForCode(province.code)),
);

const PROVINCE_CODE_SET = new Set(PROVINCE_REFERENCE.map((province) => province.code));

export function isProvinceCode(value: string): boolean {
  return PROVINCE_CODE_SET.has(value);
}

export function isLandType(value: string): value is LandType {
  return (LAND_TYPES as readonly string[]).includes(value);
}

export function isTenureStatus(value: string): value is TenureStatus {
  return Object.prototype.hasOwnProperty.call(TENURE_STATUS_LABELS, value);
}

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

function cloneProvinceRow(row: ProvinceLandReform): ProvinceLandReform {
  return {
    ...row,
    titleDeed: { ...row.titleDeed },
    tenure: { ...row.tenure },
    landUse: row.landUse.map((item) => ({ ...item })),
  };
}

function aggregateLandUse(rows: readonly ProvinceLandReform[]): LandUseShare[] {
  const areas = LAND_USE_DEFINITIONS.map((definition) =>
    round2(
      rows.reduce((sum, row) => {
        const item = row.landUse.find((entry) => entry.id === definition.id);
        return sum + (item === undefined ? 0 : item.areaRai);
      }, 0),
    ),
  );
  const shares = integerShares(areas);
  return LAND_USE_DEFINITIONS.map((definition, index) => ({
    id: definition.id,
    label: definition.label,
    areaRai: areas[index],
    sharePercent: shares[index],
  }));
}

function summarize(rows: readonly ProvinceLandReform[]): LandReformSummary {
  let totalReformAreaRai = 0;
  let allocatedAreaRai = 0;
  let farmersWithPermit = 0;
  let plotCount = 0;
  let applications = 0;
  let verified = 0;
  let issued = 0;
  let issuedAreaRai = 0;
  let ownedRai = 0;
  let rentedRai = 0;
  let provincesWithAlroArea = 0;

  for (const row of rows) {
    totalReformAreaRai += row.totalReformAreaRai;
    allocatedAreaRai += row.allocatedAreaRai;
    farmersWithPermit += row.farmersWithPermit;
    plotCount += row.plotCount;
    applications += row.titleDeed.applications;
    verified += row.titleDeed.verified;
    issued += row.titleDeed.issued;
    issuedAreaRai += row.titleDeed.issuedAreaRai;
    ownedRai += row.tenure.ownedRai;
    rentedRai += row.tenure.rentedRai;
    if (row.hasAlroArea) provincesWithAlroArea += 1;
  }

  const totalArea = round2(totalReformAreaRai);
  const allocated = round2(allocatedAreaRai);
  const owned = round2(ownedRai);
  const rented = round2(rentedRai);
  const ownedSharePercent = allocated > 0 ? round1((owned / allocated) * 100) : 0;
  const rentedSharePercent = allocated > 0 ? round1(100 - ownedSharePercent) : 0;
  const issuedRatioPercent = plotCount > 0 ? (issued / plotCount) * 100 : 0;
  const titleDeedProgressPercent = round2(issuedRatioPercent);

  return {
    provinceCount: rows.length,
    provincesWithAlroArea,
    provincesWithoutAlroArea: rows.length - provincesWithAlroArea,
    totalReformAreaRai: totalArea,
    allocatedAreaRai: allocated,
    allocationProgressPercent: totalArea > 0 ? round2((allocated / totalArea) * 100) : 0,
    farmersWithPermit,
    plotCount,
    averagePlotSizeRai: plotCount > 0 ? round2(allocated / plotCount) : 0,
    titleDeed: {
      applications,
      verified,
      issued,
      issuedAreaRai: round2(issuedAreaRai),
      progressPercent: titleDeedProgressPercent,
    },
    tenure: { ownedRai: owned, rentedRai: rented, ownedSharePercent, rentedSharePercent },
    tenureSecurityIndex: round1(
      clamp(ownedSharePercent * 0.7 + titleDeedProgressPercent * 0.3, 0, 100),
    ),
  };
}

function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.normalize('NFC').trim();
  return normalized === '' ? null : normalized;
}

function matchesLandType(row: ProvinceLandReform, landType: LandType): boolean {
  if (landType === 'sor_por_kor_4_01') return row.allocatedAreaRai > 0;
  if (landType === 'agricultural_title_deed') return row.titleDeed.issued > 0;
  return row.tenure.rentedRai > 0;
}

function matchesQuery(row: ProvinceLandReform, query: string): boolean {
  const tenureLabel =
    row.dominantTenureStatus === null ? '' : TENURE_STATUS_LABELS[row.dominantTenureStatus];
  const haystack = [
    row.provinceName,
    row.provinceCode,
    row.region,
    row.zeroAreaReason === null ? '' : row.zeroAreaReason,
    tenureLabel,
  ]
    .join('\n')
    .normalize('NFC')
    .toLowerCase();
  return haystack.includes(query);
}

function createSources(): Array<{ id: string; name: string; type: string; access: 'metadata_only' }> {
  return [
    {
      id: 'alro-land-simulation',
      name: 'แบบจำลองเชิงโครงสร้างข้อมูลเขตปฏิรูปที่ดิน ส.ป.ก. (Simulation)',
      type: 'deterministic_simulation',
      access: 'metadata_only',
    },
  ];
}

export function buildLandReformData(filters: LandReformFilters = {}): LandReformData {
  const provinceCode = normalizeOptional(filters.provinceCode);
  const landType =
    filters.landType !== undefined && isLandType(filters.landType) ? filters.landType : null;
  const tenureStatus =
    filters.tenureStatus !== undefined && isTenureStatus(filters.tenureStatus)
      ? filters.tenureStatus
      : null;
  const region = filters.region !== undefined && isRegion(filters.region) ? filters.region : null;
  const query = normalizeOptional(filters.q);
  const queryLower = query === null ? '' : query.toLowerCase();

  const provinces = PROVINCE_LAND_REFORM.filter(
    (row) => provinceCode === null || row.provinceCode === provinceCode,
  )
    .filter((row) => region === null || row.region === region)
    .filter((row) => tenureStatus === null || row.dominantTenureStatus === tenureStatus)
    .filter((row) => landType === null || matchesLandType(row, landType))
    .filter((row) => queryLower === '' || matchesQuery(row, queryLower))
    .map(cloneProvinceRow)
    .sort((left, right) =>
      left.provinceCode < right.provinceCode ? -1 : left.provinceCode > right.provinceCode ? 1 : 0,
    );

  const zeroAreaProvinces = provinces
    .filter((row) => !row.hasAlroArea)
    .map((row) => ({
      provinceCode: row.provinceCode,
      provinceName: row.provinceName,
      reason: row.zeroAreaReason === null ? '' : row.zeroAreaReason,
    }));

  return {
    sample: true,
    datasetVersion: LAND_REFORM_DATASET_VERSION,
    asOfDate: LAND_REFORM_AS_OF_DATE,
    bannerText: LAND_REFORM_BANNER_TEXT,
    disclaimer: LAND_REFORM_DISCLAIMER,
    summary: summarize(provinces),
    landUse: aggregateLandUse(provinces),
    provinces,
    zeroAreaProvinces,
    filters: {
      provinceCode,
      landType,
      tenureStatus,
      region,
      q: query === null ? '' : query,
    },
    sources: createSources(),
    warnings: [...LAND_REFORM_WARNINGS],
  };
}
