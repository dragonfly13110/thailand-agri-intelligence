import 'server-only';

/**
 * สินค้าสิ่งบ่งชี้ทางภูมิศาสตร์ (GI) และพันธุ์พืชพื้นถิ่นของประเทศไทย
 * สำหรับหน้า /gi-products และ /api/v1/gi-products
 *
 * บทบาทของไฟล์นี้ (lane 1A Data Specialist):
 * - เป็นแคตตาล็อกตัวอย่างแบบ deterministic ชุดเดียวที่ API route, dashboard component และ page ใช้ร่วมกัน
 *   buildGiDashboard() เป็น synchronous และ pure: เรียกซ้ำกี่ครั้งได้ byte เดียวกัน (ไม่ใช้ clock,
 *   ไม่ใช้ entropy, ไม่อ่าน filesystem, ไม่เรียก network)
 * - ไฟล์นี้ self-contained: import เพียง 'server-only' แล้วมีตารางจังหวัด 77 รายการเป็น own copy
 *   (รหัส/ชื่อ/ภาค ลอกจาก lib/hub/logistics-data.ts ซึ่งล้อกับ EMBEDDED_PROVINCES_CSV ของ
 *   lib/provinces.ts อีกทอด) เพราะ buildGiDashboard ต้อง sync จึงเรียก getProvinces() (async) ไม่ได้
 *
 * กติกาความซื่อสัตย์ของข้อมูล (AGENTS.md ข้อ 3-4):
 * 1) ทุกตัวเลขเป็นค่าตัวอย่าง (GI_SAMPLE_MODE = true) สร้างจาก FNV-1a + mulberry32 ที่ seed จาก
 *    รหัสรายการ ห้าม Math.random() และ Date.now() ในเส้นทางที่สร้างตัวเลข
 * 2) ไม่แต่งเลขทะเบียนของจริง: registrationNo ขึ้นต้น "(ตัวอย่าง)" ทุกบรรทัด,
 *    registrationNoStatus = 'sample_placeholder' และ registeredYear = null ทุกบรรทัด
 *    (ปีจดทะเบียนจริงอ่านได้จากทะเบียน DIP เท่านั้น ชุดนี้ไม่ทราบจึงเป็น null ไม่ใช่ 0)
 * 3) missing = null เสมอ ห้ามใส่ 0 แทนค่าที่ไม่รายงาน เช่น ผลผลิต/ราคา/มูลค่าของงานหัตถกรรมเป็น null
 *    เพราะหน่วย "ตัน" และ "บาท/กก." ไม่มีนิยามกับผ้าทอมือในชุดนี้
 * 4) ไม่บวก subtotal ซ้ำ: มูลค่าและพื้นที่รวมในทุก rollup กับ summary มาจากการบวก field ของรายการ
 *    ที่อยู่ในกลุ่มนั้นจริง ไม่มีค่าระดับประเทศแบบ hard-code และผลรวม productCount ของ byRegion /
 *    byCategory / byStandard ต้องเท่ากับ totalProducts เสมอ
 * 5) รหัสจังหวัด 77 รายการเป็น "ทะเบียนรหัสจังหวัด" ไม่ใช่ข้อสรุปว่ามีสินค้า GI ครบทุกจังหวัด
 *    payload จึงบังคับ coverageClaim: false พร้อมข้อความใน warnings และ coverageNote
 * 6) ชื่อที่ mark nameOrigin = 'known_gi_name' ใส่เฉพาะชื่อ GI ไทยที่มั่นใจและผูกจังหวัดถูกต้อง;
 *    รายการอื่นเป็นชื่อสังเคราะห์ที่มี "(ข้อมูลตัวอย่าง)" ต่อท้ายเห็นชัด ไม่ทำให้ดูเหมือนชื่อจดทะเบียน
 * 7) พิกัดใน plotPoints เป็นจุดโครงร่างเชิงพื้นที่จากค่ากึ่งกลางรายภาค + offset ที่กำหนดได้
 *    ไม่ใช่แปลงจริง และผลรวมพื้นที่จุดย่อยเท่ากับ areaRai ของรายการนั้นเพื่อไม่ให้มีตัวเลขสองชุดขัดกัน
 * 8) sourceUrl เป็น portal root ของหน่วยงานจริงเท่านั้น (DIP / กสก. / มกอช.) และ licenseStatus = 'pending'
 *    ทุกแหล่ง (ตรวจแล้วใน repository นี้ยังไม่มี URL ทะเบียน GI ที่บันทึกไว้ จึงไม่มี URL เดิมให้ reuse)
 *
 * กติกาการกำหนด control standard (ตรวจย้อนได้โดยไม่ต้องพึ่งค่าสุ่ม):
 * - external_control = รายการ known_gi_name whose ลำดับใน GI_KNOWN_SEEDS หารด้วย 3 ลงตัว
 *   (indexInKnownList % 3 === 0) ซึ่งเป็นกลุ่ม flagship ส่วนน้อย และถือตามสมมติฐาน
 *   "มีผู้ตรวจภายนอกปรากฏในเอกสารสาธารณะ" เท่านั้น
 * - ที่เหลือทั้งหมด (known_gi_name ที่ไม่เข้าเกณฑ์ และทุก synthetic_sample) เป็น internal_control
 *   เพราะชุดตัวอย่างยังไม่มีหลักฐานระบบตรวจภายนอกของรายใด
 *
 * กฎขนาดแคตตาล็อก:
 * - ทุกจังหวัดมีอย่างน้อย 1 รายการ จังหวัดละไม่เกิน 3 รายการ รวม 110-140 รายการ
 * - จังหวัดเกษตรหลัก (MAJOR_AGI_PROVINCE_CODES) ได้รายการสังเคราะห์ 2 รายการ จังหวัดอื่น 1 รายการ
 *   และส่วนเพิ่มจะถูกตัดออกเมื่อรวมกับชื่อ known GI แล้วครบ 3 (บังคับใน assertCatalogueInvariants)
 * - หมวดย่อย: textile_craft บังคับในกลุ่มจังหวัดผ้าไหม/งานหัตถกรรม, tea_coffee บังคับในกลุ่มจังหวัด
 *   พื้นที่สูงภาคเหนือ ที่เหลือเลือกจาก REGION_FILLER_CATEGORY_POOL ตามภาคของจังหวัดนั้น
 */

/* ------------------------------------------------------------------ */
/* สัญญาข้อมูล (shared contract ของ lane 1A)                             */
/* ------------------------------------------------------------------ */

export const GI_SAMPLE_MODE: boolean = true;

export type GiCategory = 'rice' | 'fruit' | 'tea_coffee' | 'textile_craft' | 'other';
export type GiControlStandard = 'internal_control' | 'external_control';

export interface GiProvince {
  code: string;
  name: string;
  region: string;
}

export interface GiPlotPoint {
  id: string;
  lat: number;
  lon: number;
  district: string;
  areaRai: number;
}

export interface GiProductCard {
  id: string;
  nameTh: string;
  nameEn: string | null;
  commodity: string;
  category: GiCategory;
  categoryLabel: string;
  provinceCode: string;
  provinceName: string;
  region: string;
  districts: string[];
  controlStandard: GiControlStandard;
  controlStandardLabel: string;
  registrationNo: string;
  registrationNoStatus: 'sample_placeholder';
  registeredYear: number | null;
  nameOrigin: 'known_gi_name' | 'synthetic_sample';
  evidenceStatus: 'not_verified';
  areaRai: number | null;
  farmCount: number | null;
  annualYieldTons: number | null;
  marketValueTHB: number | null;
  pricePerKgTHB: number | null;
  seasonMonths: number[];
  badgeColor: string;
  description: string;
  plotPoints: GiPlotPoint[];
  sourceIds: string[];
}

export interface GiProvinceRollup {
  provinceCode: string;
  provinceName: string;
  region: string;
  productCount: number;
  totalAreaRai: number;
  totalFarmCount: number;
  totalMarketValueTHB: number;
  categories: GiCategory[];
}

export interface GiRegionRollup {
  region: string;
  productCount: number;
  provinceCount: number;
  totalAreaRai: number;
  totalMarketValueTHB: number;
}

export interface GiCategoryRollup {
  category: GiCategory;
  label: string;
  productCount: number;
  totalAreaRai: number;
  totalMarketValueTHB: number;
}

export interface GiStandardRollup {
  standard: GiControlStandard;
  label: string;
  productCount: number;
  totalMarketValueTHB: number;
}

export interface GiNationalSummary {
  totalProducts: number;
  provinceCountWithData: number;
  regionCount: number;
  totalAreaRai: number;
  totalFarmCount: number;
  totalMarketValueTHB: number;
  internalControlProducts: number;
  externalControlProducts: number;
  avgPricePerKgTHB: number | null;
  coverageClaim: false;
}

export interface GiFilterOptions {
  provinces: GiProvince[];
  regions: string[];
  categories: Array<{ id: GiCategory; label: string }>;
  standards: Array<{ id: GiControlStandard; label: string }>;
}

export interface GiSourceReference {
  id: string;
  name: string;
  agencyLabel: string;
  role: string;
  sourceUrl: string;
  licenseStatus: string;
}

export interface GiDashboardPayload {
  sample: true;
  generatedAt: string;
  summary: GiNationalSummary;
  filteredSummary: GiNationalSummary;
  products: GiProductCard[];
  byProvince: GiProvinceRollup[];
  byRegion: GiRegionRollup[];
  byCategory: GiCategoryRollup[];
  byStandard: GiStandardRollup[];
  filterOptions: GiFilterOptions;
  sources: GiSourceReference[];
  warnings: string[];
  coverageNote: string;
}

export interface GiDashboardFilters {
  provinceCode?: string;
  region?: string;
  category?: GiCategory;
  standard?: GiControlStandard;
  q?: string;
}

/* ------------------------------------------------------------------ */
/* ป้ายกำกับหมวดย่อยและระดับการควบคุม                                     */
/* ------------------------------------------------------------------ */

export const GI_CATEGORY_LABELS: Record<GiCategory, string> = {
  rice: 'ข้าว',
  fruit: 'ไม้ผล',
  tea_coffee: 'ชา/กาแฟ',
  textile_craft: 'ผ้าไหม/หัตถกรรม',
  other: 'อื่น ๆ',
};

export const GI_STANDARD_LABELS: Record<GiControlStandard, string> = {
  internal_control: 'ควบคุมภายใน',
  external_control: 'ควบคุมภายนอก',
};

/** สี badge ผูกกับระดับการควบคุมเท่านั้น (external เด่นกว่า เพราะสมมติว่ามีผู้ตรวจภายนอก) */
export const GI_STANDARD_BADGE_COLORS: Record<GiControlStandard, string> = {
  internal_control: '#0f766e',
  external_control: '#b45309',
};

/** ลำดับแสดงคงที่ของหมวดย่อยและระดับการควบคุม (ห้ามพึ่ง key order ของ object runtime) */
const GI_CATEGORY_ORDER: GiCategory[] = ['rice', 'fruit', 'tea_coffee', 'textile_craft', 'other'];
const GI_STANDARD_ORDER: GiControlStandard[] = ['internal_control', 'external_control'];

/** เวลาอ้างอิงของโมเดล (ค่าคงที่ ไม่ใช่ clock) ทำให้ payload byte-stable ทุก request */
const GI_GENERATED_AT = '2026-10-25T00:00:00+07:00';

/* ------------------------------------------------------------------ */
/* ทะเบียนจังหวัด 77 รายการ (รหัส + ชื่อ + ภาค ลอกจาก logistics-data.ts) */
/* ------------------------------------------------------------------ */

/**
 * รายชื่อ 77 จังหวัดมาตรฐานรหัส มอก./มท. พร้อมกลุ่มภาค 6 ภาค ชุดเดียวกับ lib/hub/logistics-data.ts
 * (ภาคเหนือ, ภาคตะวันออกเฉียงเหนือ, ภาคกลาง, ภาคตะวันออก, ภาคตะวันตก, ภาคใต้)
 * การมีชื่อจังหวัดในตารางนี้ "ไม่ใช่" หลักฐานว่าจังหวัดนั้นมีสินค้า GI ขึ้นทะเบียน (ดู GI_COVERAGE_NOTE)
 */
export const THAILAND_PROVINCES: GiProvince[] = [
  // ภาคกลาง
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
  // ภาคตะวันออก
  { code: '20', name: 'ชลบุรี', region: 'ภาคตะวันออก' },
  { code: '21', name: 'ระยอง', region: 'ภาคตะวันออก' },
  { code: '22', name: 'จันทบุรี', region: 'ภาคตะวันออก' },
  { code: '23', name: 'ตราด', region: 'ภาคตะวันออก' },
  { code: '24', name: 'ฉะเชิงเทรา', region: 'ภาคตะวันออก' },
  { code: '25', name: 'ปราจีนบุรี', region: 'ภาคตะวันออก' },
  { code: '26', name: 'นครนายก', region: 'ภาคตะวันออก' },
  { code: '27', name: 'สระแก้ว', region: 'ภาคตะวันออก' },
  // ภาคตะวันออกเฉียงเหนือ
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
  { code: 46 + '', name: 'กาฬสินธุ์', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '47', name: 'สกลนคร', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '48', name: 'นครพนม', region: 'ภาคตะวันออกเฉียงเหนือ' },
  { code: '49', name: 'มุกดาหาร', region: 'ภาคตะวันออกเฉียงเหนือ' },
  // ภาคเหนือ
  { code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ' },
  { code: '51', name: 'ลำพูน', region: 'ภาคเหนือ' },
  { code: '52', name: 'ลำปาง', region: 'ภาคเหนือ' },
  { code: '53', name: 'อุตรดิตถ์', region: 'ภาคเหนือ' },
  { code: '54', name: 'แพร่', region: 'ภาคเหนือ' },
  { code: '55', name: 'น่าน', region: 'ภาคเหนือ' },
  { code: '56', name: 'พะเยา', region: 'ภาคเหนือ' },
  { code: '57', name: 'เชียงราย', region: 'ภาคเหนือ' },
  { code: '58', name: 'แม่ฮ่องสอน', region: 'ภาคเหนือ' },
  { code: '60', name: 'นครสวรรค์', region: 'ภาคเหนือ' },
  { code: '61', name: 'อุทัยธานี', region: 'ภาคเหนือ' },
  { code: '62', name: 'กำแพงเพชร', region: 'ภาคเหนือ' },
  { code: '63', name: 'ตาก', region: 'ภาคเหนือ' },
  { code: '64', name: 'สุโขทัย', region: 'ภาคเหนือ' },
  { code: '65', name: 'พิษณุโลก', region: 'ภาคเหนือ' },
  { code: '66', name: 'พิจิตร', region: 'ภาคเหนือ' },
  { code: '67', name: 'เพชรบูรณ์', region: 'ภาคเหนือ' },
  // ภาคตะวันตก
  { code: '70', name: 'ราชบุรี', region: 'ภาคตะวันตก' },
  { code: '71', name: 'กาญจนบุรี', region: 'ภาคตะวันตก' },
  { code: '72', name: 'สุพรรณบุรี', region: 'ภาคตะวันตก' },
  { code: '73', name: 'นครปฐม', region: 'ภาคตะวันตก' },
  { code: '74', name: 'สมุทรสาคร', region: 'ภาคตะวันตก' },
  { code: '75', name: 'สมุทรสงคราม', region: 'ภาคตะวันตก' },
  { code: '76', name: 'เพชรบุรี', region: 'ภาคตะวันตก' },
  { code: '77', name: 'ประจวบคีรีขันธ์', region: 'ภาคตะวันตก' },
  // ภาคใต้
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

/** ลำดับ 6 ภาคที่ใช้ใน byRegion และ filterOptions (คงที่ทุก build) */
const GI_REGION_ORDER: string[] = [
  'ภาคเหนือ',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคกลาง',
  'ภาคตะวันออก',
  'ภาคตะวันตก',
  'ภาคใต้',
];

const PROVINCE_BY_CODE: Record<string, GiProvince> = {};
for (let index = 0; index < THAILAND_PROVINCES.length; index += 1) {
  const province = THAILAND_PROVINCES[index];
  PROVINCE_BY_CODE[province.code] = province;
}

/* ------------------------------------------------------------------ */
/* ตัวช่วย deterministic (FNV-1a + mulberry32 แบบเดียวกับ smart-farming)  */
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

/** จำนวนเต็มปิดช่วง [min, max] — deterministic และอยู่ในการ boundaries ที่ contract ประกาศไว้ */
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
/* นิยามหมวดย่อย: คลังสินค้า หน่วยนับ ช่วงตัวเลข และฤดูเก็บเกี่ยว           */
/* ------------------------------------------------------------------ */

interface GiCategoryDef {
  id: GiCategory;
  label: string;
  /** คลังชื่อสินค้า (commodity) ที่ใช้ตั้งชื่อรายการสังเคราะห์ของหมวดย่อยนี้ */
  commodities: readonly string[];
  /** ช่วงพื้นที่ผลิต (ไร่) — อยู่ภายในขอบ 500-90,000 ของ contract */
  areaBand: [number, number];
  /** ช่วงจำนวนเกษตรกร (คน) — อยู่ภายในขอบ 150-12,000 */
  farmBand: [number, number];
  /** ช่วงผลผลิตต่อปี (ตัน) — null คือหมวดย่อยที่หน่วย "ตัน" ไม่มีนิยามในชุดนี้ */
  yieldBand: [number, number] | null;
  /** ช่วงราคา (บาท/กก.) — null คือไม่มีนิยามหน่วยนี้ (งานหัตถกรรม) ค่าจึงเป็น null เสมอ */
  priceBand: [number, number] | null;
  /** ปฏิทินฤดูเก็บเกี่ยวที่เป็นไปได้ (เดือน 1-12 เรียง ascending ในทุกชุด) */
  seasons: readonly number[][];
}

const GI_CATEGORY_DEFS: Record<GiCategory, GiCategoryDef> = {
  rice: {
    id: 'rice',
    label: GI_CATEGORY_LABELS.rice,
    commodities: ['ข้าวหอมมะลิ', 'ข้าวเหนียว', 'ข้าวเจ้าพื้นเมือง', 'ข้าวกล้องพื้นถิ่น', 'ข้าวสังข์หยดพื้นถิ่น'],
    areaBand: [3200, 90000],
    farmBand: [420, 12000],
    yieldBand: [1500, 180000],
    priceBand: [18, 68],
    seasons: [[5, 6, 7, 8, 9, 10, 11], [1, 2, 3, 4], [10, 11, 12], [11, 12], [2, 3, 4, 5]],
  },
  fruit: {
    id: 'fruit',
    label: GI_CATEGORY_LABELS.fruit,
    commodities: ['ทุเรียน', 'มังคุด', 'ส้มโอ', 'มะม่วง', 'ลองกอง', 'ขนุน', 'เงาะ', 'กล้วยหอม', 'สับปะรด', 'ส้มเขียวหวาน'],
    areaBand: [500, 40000],
    farmBand: [150, 9000],
    yieldBand: [300, 120000],
    priceBand: [22, 320],
    seasons: [[3, 4, 5], [4, 5, 6], [5, 6, 7], [6, 7, 8], [7, 8, 9], [8, 9, 10], [9, 10, 11], [11, 12]],
  },
  tea_coffee: {
    id: 'tea_coffee',
    label: GI_CATEGORY_LABELS.tea_coffee,
    commodities: ['ชาอู่หลง', 'ชาเขียว', 'กาแฟอาราบิกา', 'กาแฟโรบัสต้า'],
    areaBand: [500, 12000],
    farmBand: [150, 4200],
    yieldBand: [300, 9000],
    priceBand: [90, 320],
    seasons: [[10, 11, 12], [11, 12], [12], [1, 2, 3], [2, 3, 4], [9, 10, 11, 12]],
  },
  textile_craft: {
    id: 'textile_craft',
    label: GI_CATEGORY_LABELS.textile_craft,
    commodities: ['ผ้าไหมทอมือ', 'ผ้าฝ้ายทอมือ', 'ผ้ายกดอก', 'ผ้าทอลายพื้นถิ่น', 'เครื่องจักสาน'],
    areaBand: [500, 6000],
    farmBand: [200, 5000],
    yieldBand: null,
    priceBand: null,
    seasons: [[9, 10, 11, 12], [10, 11, 12], [1, 2, 3], [2, 3, 4]],
  },
  other: {
    id: 'other',
    label: GI_CATEGORY_LABELS.other,
    commodities: ['หอมแดง', 'กระเทียม', 'พริกขี้หนู', 'มันสำปะหลัง', 'ยางพารา', 'ถั่วลิสง', 'งาดำ', 'สมุนไพรพื้นถิ่น', 'พริกไทย'],
    areaBand: [500, 30000],
    farmBand: [150, 8000],
    yieldBand: [300, 60000],
    priceBand: [20, 260],
    seasons: [[1, 2, 3], [2, 3, 4], [3, 4, 5], [11, 12], [12], [10, 11, 12]],
  },
};

/**
 * คำต่อท้ายชื่อรายการสังเคราะห์ ใช้คำว่า "สาธิต" ให้เห็นแต่แรกว่าไม่ใชชื่อชุมชนจริง
 * (ห้ามเอาชื่อตำบล/อำเภอจริงมาวาง เพราะจะอ่านดูเหมือนอ้างทะเบียนเขตปกครองของทางราชการทั้งที่ยังไม่ได้ตรวจ)
 */
const SYNTHETIC_LOCALITY_WORDS: readonly string[] = [
  'ทุ่งสาธิต',
  'หนองสาธิต',
  'ห้วยสาธิต',
  'ดอนสาธิต',
  'เขาสาธิต',
  'บางสาธิต',
  'ป่าสาธิต',
  'ปากสาธิต',
];

/** ป้ายกำกับเมื่อรายการนั้นยังไม่ได้ตรวจทะเบียนอำเภอ (ใช้ทั้งกับ known บางรายที่ไม่มีหลักฐานใน repo) */
const UNVERIFIED_DISTRICT_LABEL = 'พื้นที่ผลิตยังไม่ได้ตรวจทะเบียนอำเภอ';

/**
 * ชื่ออำเภอเฉพาะกรณีที่ repository นี้บันทึกไว้แล้ว (lib/hub/logistics-data.ts) หรือเป็น
 * ที่รู้จักทั่วไปของสินค้านั้น จึงจะใส่ให้รายการ known ได้; รายการที่ไม่อยู่ในตารางนี้
 * จะไม่ถูกแต่งชื่ออำเภอใหม่ แต่ใช้ UNVERIFIED_DISTRICT_LABEL แทน
 */
const CONFIDENT_DISTRICTS_BY_PROVINCE: Record<string, readonly string[]> = {
  '22': ['ท่าใหม่', 'ขลุง', 'แก่งหางแมว'],
  '31': ['ปักธงชัย'],
  '33': ['ขุนหาญ', 'กันทรลักษ์', 'ภูสิงห์'],
  '45': ['เกษตรวิสัย', 'สุวรรณภูมิ'],
  '46': ['เขาวง', 'นาคู', 'กมลาไสย'],
  '53': ['ลับแล'],
  '56': ['จุน', 'ดอกคำใต้'],
  '70': ['ดำเนินสะดวก'],
  '75': ['อัมพวา', 'บางคนที'],
  '80': ['ปากพนัง'],
  '86': ['หลังสวน'],
  '91': ['เมืองสตูล', 'ควนโดน'],
  '93': ['ควนขนุน'],
  '95': ['เบตง', 'ธารโต'],
  '96': ['ระแงะ'],
};

/* ------------------------------------------------------------------ */
/* ชื่อ GI ไทยที่มั่นใจจริง (nameOrigin = 'known_gi_name')               */
/* ------------------------------------------------------------------ */

interface GiKnownSeed {
  provinceCode: string;
  slug: string;
  category: GiCategory;
  commodity: string;
  nameTh: string;
  nameEn: string | null;
  /** ระบุเฉพาะอำเภอที่มีหลักฐานใน repository; เว้นไว้ = ใช้ป้าย "ยังไม่ได้ตรวจทะเบียนอำเภอ" */
  districts?: readonly string[];
}

/**
 * ลำดับของอาร์เรย์นี้เป็นส่วนหนึ่งของกติกา control standard (indexInKnownList % 3 === 0 → external)
 * จึงห้ามสลับตำแหน่งโดยไม่ตรวจว่าระดับการควบคุมของรายชื่้อื่นเปลี่ยนไปหรือไม่
 */
const GI_KNOWN_SEEDS: GiKnownSeed[] = [
  {
    provinceCode: '22',
    slug: 'durian-chanthaburi',
    category: 'fruit',
    commodity: 'ทุเรียน',
    nameTh: 'ทุเรียนจันทบุรี',
    nameEn: 'Chanthaburi Durian',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['22'],
  },
  {
    provinceCode: '23',
    slug: 'pineapple-trat-gold',
    category: 'fruit',
    commodity: 'สับปะรด',
    nameTh: 'สับปะรดตราดสีทอง',
    nameEn: 'Trat Golden Pineapple',
  },
  {
    provinceCode: '31',
    slug: 'silk-pak-thong-chai',
    category: 'textile_craft',
    commodity: 'ผ้าไหมทอมือ',
    nameTh: 'ผ้าไหมปักธงชัย',
    nameEn: 'Pak Thong Chai Silk',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['31'],
  },
  {
    provinceCode: '33',
    slug: 'durian-volcano-si-saket',
    category: 'fruit',
    commodity: 'ทุเรียน',
    nameTh: 'ทุเรียนภูเขาไฟศรีสะเกษ',
    nameEn: 'Si Sa Ket Volcanic-Soil Durian',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['33'],
  },
  {
    provinceCode: '33',
    slug: 'shallot-si-saket',
    category: 'other',
    commodity: 'หอมแดง',
    nameTh: 'หอมแดงศรีสะเกษ',
    nameEn: 'Si Sa Ket Shallot',
  },
  {
    provinceCode: '45',
    slug: 'jasmine-rice-thung-kula',
    category: 'rice',
    commodity: 'ข้าวหอมมะลิ',
    nameTh: 'ข้าวหอมมะลิทุ่งกุลาร้องไห้',
    nameEn: 'Thung Kula Rong-Hai Jasmine Rice',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['45'],
  },
  {
    provinceCode: '46',
    slug: 'sticky-rice-khao-wong',
    category: 'rice',
    commodity: 'ข้าวเหนียว',
    nameTh: 'ข้าวเหนียวเขาวงกาฬสินธุ์',
    nameEn: 'Khao Wong Kalasin Sticky Rice',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['46'],
  },
  {
    provinceCode: '46',
    slug: 'pha-mao-silk-kalasin',
    category: 'textile_craft',
    commodity: 'ผ้าไหมทอมือ',
    nameTh: 'ผ้าไหมแพรวากาฬสินธุ์',
    nameEn: 'Pha Mao Silk of Kalasin',
    districts: ['คำม่วง'],
  },
  {
    provinceCode: '53',
    slug: 'durian-long-lin-laplae',
    category: 'fruit',
    commodity: 'ทุเรียน',
    nameTh: 'ทุเรียนหลง-หลินลับแล',
    nameEn: 'Laplae Long-Lin Durian',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['53'],
  },
  {
    provinceCode: '55',
    slug: 'orange-gold-nan',
    category: 'fruit',
    commodity: 'ส้ม',
    nameTh: 'ส้มสีทองน่าน',
    nameEn: 'Nan Golden Orange',
  },
  {
    provinceCode: '56',
    slug: 'jasmine-rice-phayao',
    category: 'rice',
    commodity: 'ข้าวหอมมะลิ',
    nameTh: 'ข้าวหอมมะลิพะเยา',
    nameEn: 'Phayao Jasmine Rice',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['56'],
  },
  {
    provinceCode: '57',
    slug: 'pineapple-phu-lae',
    category: 'fruit',
    commodity: 'สับปะรด',
    nameTh: 'สับปะรดภูแลเชียงราย',
    nameEn: 'Phu Lae Chiang Rai Pineapple',
  },
  {
    provinceCode: '57',
    slug: 'coffee-doi-chaang',
    category: 'tea_coffee',
    commodity: 'กาแฟอาราบิกา',
    nameTh: 'กาแฟดอยช้าง',
    nameEn: 'Doi Chaang Coffee',
  },
  {
    provinceCode: '57',
    slug: 'sticky-rice-kiao-ngu',
    category: 'rice',
    commodity: 'ข้าวเหนียว',
    nameTh: 'ข้าวเหนียวเขี้ยวงูเชียงราย',
    nameEn: 'Chiang Rai Khiao Ngu Sticky Rice',
  },
  {
    provinceCode: '62',
    slug: 'egg-banana-kamphaeng-phet',
    category: 'fruit',
    commodity: 'กล้วยไข่',
    nameTh: 'กล้วยไข่กำแพงเพชร',
    nameEn: 'Kamphaeng Phet Egg Banana',
  },
  {
    provinceCode: '67',
    slug: 'sweet-tamarind-phetchabun',
    category: 'fruit',
    commodity: 'มะขามหวาน',
    nameTh: 'มะขามหวานเพชรบูรณ์',
    nameEn: 'Phetchabun Sweet Tamarind',
  },
  {
    provinceCode: '70',
    slug: 'aromatic-coconut-ratchaburi',
    category: 'fruit',
    commodity: 'มะพร้าวน้ำหอม',
    nameTh: 'มะพร้าวน้ำหอมราชบุรี',
    nameEn: 'Ratchaburi Aromatic Coconut',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['70'],
  },
  {
    provinceCode: '75',
    slug: 'kom-lychee-samut-songkhram',
    category: 'fruit',
    commodity: 'ลิ้นจี่',
    nameTh: 'ลิ้นจี่ค่อมสมุทรสงคราม',
    nameEn: 'Samut Songkhram Kom Lychee',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['75'],
  },
  {
    provinceCode: '80',
    slug: 'ruby-pomelo-pak-phanang',
    category: 'fruit',
    commodity: 'ส้มโอ',
    nameTh: 'ส้มโอทับทิมสยามปากพนัง',
    nameEn: 'Pak Phanang Ruby Pomelo',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['80'],
  },
  {
    provinceCode: '86',
    slug: 'lip-nail-banana-chumphon',
    category: 'fruit',
    commodity: 'กล้วยเล็บมือนาง',
    nameTh: 'กล้วยเล็บมือนางชุมพร',
    nameEn: 'Chumphon Lip-Nail Banana',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['86'],
  },
  {
    provinceCode: '91',
    slug: 'champedak-satun',
    category: 'fruit',
    commodity: 'จำปาดะ',
    nameTh: 'จำปาดะสตูล',
    nameEn: 'Satun Champedak',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['91'],
  },
  {
    provinceCode: '93',
    slug: 'sangyod-rice-phatthalung',
    category: 'rice',
    commodity: 'ข้าวสังข์หยด',
    nameTh: 'ข้าวสังข์หยดเมืองพัทลุง',
    nameEn: 'Phatthalung Sangyod Rice',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['93'],
  },
  {
    provinceCode: '95',
    slug: 'durian-yala-sadet-nam',
    category: 'fruit',
    commodity: 'ทุเรียน',
    nameTh: 'ทุเรียนสะเด็ดน้ำยะลา',
    nameEn: 'Yala Sa-Det-Nam Durian',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['95'],
  },
  {
    provinceCode: '96',
    slug: 'longan-tanyong-mas',
    category: 'fruit',
    commodity: 'ลองกอง',
    nameTh: 'ลองกองตันหยงมัส',
    nameEn: 'Tanyong Mas Longan',
    districts: CONFIDENT_DISTRICTS_BY_PROVINCE['96'],
  },
];

/**
 * จังหวัดเกษตรหลักตาม "รูปแบบการใช้ประโยชน์ที่ดินทั่วไปของโมเดล" (ไม่ใช่สถิติพื้นที่ปลูกจริง)
 * ได้รายการสังเคราะห์ 2 รายการแทน 1 รายการ เพื่อให้หน้าจอเห็นความหนาแน่นต่างกัน
 */
const MAJOR_AGI_PROVINCE_CODES: readonly string[] = [
  '14', '20', '21', '22', '30', '32', '33', '34', '40', '45', '50', '51',
  '57', '60', '65', '66', '72', '76', '80', '84', '86', '90', '92', '93',
];

const MAJOR_AGI_PROVINCE_SET: Record<string, true> = {};
for (let index = 0; index < MAJOR_AGI_PROVINCE_CODES.length; index += 1) {
  MAJOR_AGI_PROVINCE_SET[MAJOR_AGI_PROVINCE_CODES[index]] = true;
}

/**
 * แผนหมวดย่อยของรายการสังเคราะห์รายจังหวัด (บังคับกลุ่มผ้าไหม/งานหัตถกรรมและกลุ่มพื้นที่สูง)
 * จังหวัดที่ไม่มีที่นี่จะใช้ REGION_FILLER_CATEGORY_POOL ตามภาคนั้น
 */
const FILLER_CATEGORY_PLAN: Record<string, GiCategory[]> = {
  // กลุ่มผ้าไหม/งานทอตามภาคตะวันออกเฉียงเหนือและภาคเหนือ
  '32': ['textile_craft', 'rice'],
  '34': ['textile_craft', 'rice'],
  '35': ['textile_craft', 'rice'],
  '36': ['textile_craft', 'other'],
  '37': ['textile_craft', 'rice'],
  '44': ['textile_craft', 'rice'],
  '45': ['textile_craft', 'rice'],
  '47': ['textile_craft', 'other'],
  '48': ['textile_craft', 'fruit'],
  '49': ['textile_craft', 'fruit'],
  '52': ['textile_craft', 'tea_coffee'],
  '54': ['textile_craft', 'fruit'],
  '61': ['textile_craft', 'rice'],
  // กลุ่มพื้นที่สูง: ชา/กาแฟทางภาคเหนือและรอยต่อ
  '50': ['tea_coffee', 'textile_craft'],
  '55': ['tea_coffee', 'rice'],
  '58': ['tea_coffee', 'other'],
  '63': ['tea_coffee', 'rice'],
  '67': ['tea_coffee', 'rice'],
  '42': ['tea_coffee', 'fruit'],
  '64': ['tea_coffee', 'other'],
  // ไม้ผลเศรษฐกิจภาคตะวันออกและภาคใต้
  '21': ['fruit', 'other'],
  '24': ['fruit', 'rice'],
  '26': ['fruit', 'rice'],
  '27': ['fruit', 'other'],
  '76': ['fruit', 'rice'],
  '77': ['fruit', 'other'],
  '84': ['fruit', 'textile_craft'],
  '85': ['fruit', 'tea_coffee'],
  '90': ['fruit', 'rice'],
  '92': ['fruit', 'other'],
  '94': ['fruit', 'other'],
};

/** หมวดย่อยตั้งต้นของรายการสังเคราะห์แต่ละภาค (เลือกแบบ deterministic ด้วย seed ของรหัสจังหวัด) */
const REGION_FILLER_CATEGORY_POOL: Record<string, GiCategory[]> = {
  'ภาคเหนือ': ['fruit', 'rice', 'tea_coffee', 'other'],
  'ภาคตะวันออกเฉียงเหนือ': ['rice', 'rice', 'other', 'fruit'],
  'ภาคกลาง': ['rice', 'fruit', 'other', 'rice'],
  'ภาคตะวันออก': ['fruit', 'fruit', 'other', 'rice'],
  'ภาคตะวันตก': ['fruit', 'rice', 'other', 'fruit'],
  'ภาคใต้': ['fruit', 'rice', 'other', 'textile_craft'],
};

/* ------------------------------------------------------------------ */
/* พิกัดโครงร่าง: ค่ากึ่งกลางรายภาค + offset (ไม่ใช่แปลงจริง)              */
/* ------------------------------------------------------------------ */

interface GiRegionAnchor {
  lat: number;
  lon: number;
}

const REGION_ANCHORS: Record<string, GiRegionAnchor> = {
  'ภาคเหนือ': { lat: 18.6, lon: 99.2 },
  'ภาคตะวันออกเฉียงเหนือ': { lat: 16.1, lon: 103.1 },
  'ภาคกลาง': { lat: 14.3, lon: 100.4 },
  'ภาคตะวันออก': { lat: 13.0, lon: 101.7 },
  'ภาคตะวันตก': { lat: 13.4, lon: 99.3 },
  'ภาคใต้': { lat: 8.4, lon: 99.4 },
};

/** ขอบพิกัดตามที่ contract กำหนด — ทุกจุดต้องอยู่ภายในหลัง clamp */
const LAT_BOUNDS: [number, number] = [5.6, 20.6];
const LON_BOUNDS: [number, number] = [97.6, 105.7];

/** สัดส่วนพื้นที่ของจุดโครงร่าง (ผลรวมส่วน = 1 พอดี ทำให้ Σ plotPoints.areaRai = areaRai ของรายการ) */
const PLOT_AREA_SHARES: number[][] = [[1], [0.6, 0.4], [0.5, 0.3, 0.2]];

/* ------------------------------------------------------------------ */
/* แหล่งอ้างอิง (portal root ของหน่วยงานจริงเท่านั้น สิทธิ์ยัง pending)     */
/* ------------------------------------------------------------------ */

const GI_SOURCES: GiSourceReference[] = [
  {
    id: 'dip-gi-register',
    name: 'กรมทรัพย์สินทางปัญญา (DIP) — ทะเบียนสิ่งบ่งชี้ทางภูมิศาสตร์',
    agencyLabel: 'กระทรวงพาณิชย์',
    role: 'แหล่งตรวจสอบชื่อสินค้า เลขทะเบียน ปีที่จดทะเบียน และขอบเขตพื้นที่ผลิตจริงของรายการในหมวดนี้',
    sourceUrl: 'https://www.ipthailand.go.th/',
    licenseStatus: 'pending',
  },
  {
    id: 'doae-catalog',
    name: 'กรมส่งเสริมการเกษตร (กสก.) — ทะเบียนกลุ่มผู้ผลิตและแปลงใหญ่สินค้าพื้นถิ่น',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'แหล่งตรวจสอบจำนวนเกษตรกร กลุ่มผู้ผลิต และพื้นที่เพาะปลูกรายอำเภอที่ใช้ยืนยันค่าตัวเลขของรายการ',
    sourceUrl: 'https://www.doae.go.th/',
    licenseStatus: 'pending',
  },
  {
    id: 'onc-standards',
    name: 'สำนักงานมาตรฐานสินค้าเกษตรและอาหารแห่งชาติ (มกอช.) — มาตรฐานและระบบควบคุมสินค้า GI',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'แหล่งตรวจสอบว่าระบบควบคุมเป็นภายในกลุ่มผู้ผลิตหรือมีผู้ตรวจภายนอก และการตรวจอยู่ในขอบเขตใด',
    sourceUrl: 'https://www.onc.go.th/',
    licenseStatus: 'pending',
  },
];

const GI_COVERAGE_NOTE =
  'แคตตาล็อกชุดนี้มีรายการอย่างน้อยหนึ่งรายการในทุกจังหวัดของทะเบียน 77 จังหวัด เพราะกติกาแบบจำลองกำหนด'
  + 'ให้ทุกจังหวัดมีสินค้าตัวอย่าง (จังหวัดเกษตรหลัก 2 รายการ และไม่เกิน 3 รายการต่อจังหวัด) การมีชื่อจังหวัด'
  + 'จึงไม่ใช่หลักฐานว่าจังหวัดนั้นมีสินค้า GI ขึ้นทะเบียนจริง และไม่ใช่สัดส่วน coverage ของประเทศ จำนวนรายการ'
  + 'รวมทั้งชุดก็ไม่ใช่จำนวนสินค้า GI ของไทยเช่นกัน ตัวเลขที่พร้อมเผยแพร่ต้องมาจากทะเบียน DIP ที่ผ่านการตรวจ'
  + 'สิทธิ์ราย resource ก่อน (ปัจจุบันทุกแหล่งยัง licenseStatus = pending)';

const GI_WARNINGS: string[] = [
  'ตัวเลขทุกช่องในหน้านี้ (พื้นที่ จำนวนเกษตรกร ผลผลิต ราคา มูลค่า) เป็นค่าตัวอย่างแบบ deterministic ที่สร้างจากรหัสประจำรายการ เพื่อทดสอบสถาปัตยกรรมข้อมูลของ Hub เท่านั้น ไม่ใช่สถิติจริงของสินค้า GI ใด และห้ามอ้างอิงต่อในเชิงนโยบายหรือการตลาด',
  'รายชื่อจังหวัดทั้ง 77 รายการเป็นทะเบียนรหัสจังหวัดที่ Hub ใช้จัดกลุ่มข้อมูล ไม่ใช่ข้อสรุปว่ามีสินค้า GI ครบทุกจังหวัด การที่จังหวัดหนึ่งมีรายการในชุดนี้ไม่ได้แปลว่าจังหวัดนั้นมีคำขอหรือหนังสือรับรองสิ่งบ่งชี้ทางภูมิศาสตร์',
  'เลขทะเบียนทุกรายการเป็น placeholder ที่ขึ้นต้นด้วย "(ตัวอย่าง)" และมี registrationNoStatus = sample_placeholder ส่วน registeredYear เป็น null ทุกบรรทัด เพราะปีจดทะเบียนจริงต้องอ่านจากทะเบียนของกรมทรัพย์สินทางปัญญา (DIP) เท่านั้น ชุดนี้ยังไม่ได้ตรวจสอบ',
  'พิกัดใน plotPoints เป็นจุดโครงร่างเชิงพื้นที่ที่คำนวณจากค่ากึ่งกลางรายภาคบวกกับ offset ที่กำหนดได้ ไม่ใช่ขอบแปลงจริง ไม่ใช่ข้อมูลโฉนด และห้ามใช้คำนวณพื้นที่เพาะปลูกหรือระยะทางใด ๆ',
  'แหล่งอ้างอิงทั้งสามแห่งเป็น portal root ของหน่วยงานและยังอยู่ในสถานะ licenseStatus = pending จึงยังไม่มีสิทธิ์ดึงข้อมูลมาเผยแพร่ รายการที่ไม่ผ่านสิทธิ์ต้องไม่ออก public API, HTML, props หรือ cache',
  'ค่าที่วัดไม่ได้หรือหน่วยไม่เข้าพวกแสดงเป็น null เสมอ (เช่น ตันผลผลิตและราคาบาท/กก. ของงานหัตถกรรม) ยอดรวมในทุก rollup บวกเฉพาะรายการที่รายงานค่าจริง ดังนั้นมูลค่ารวม 0 ของหมวดใดหมวดหนึ่งหมายความว่า "ไม่มีรายงาน" ไม่ใช่ "มูลค่าเป็นศูนย์"',
  'ชื่อรายการที่ nameOrigin = known_gi_name เป็นชื่อสินค้า GI ที่ชุดนี้ตั้งใจอ้างถึงเพื่อทดสอบรูปแบบการแสดงผล แต่ยังไม่ได้เทียบกับทะเบียน DIP ในรอบ build นี้ (ทุกบรรทัด evidenceStatus = not_verified) ส่วนชื่อที่มี "(ข้อมูลตัวอย่าง)" ต่อท้ายเป็นชื่อสังเคราะห์ที่ไม่ได้จดทะเบียนที่ใด',
  'ชื่ออำเภอในช่อง districts ใส่เฉพาะแห่งที่มีหลักฐานใน repository นี้เท่านั้น รายการที่เหลือใช้ป้าย "พื้นที่ผลิตยังไม่ได้ตรวจทะเบียนอำเภอ" เพื่อไม่ให้ดูเหมือนผ่านการยืนยันแล้ว',
];

/* ------------------------------------------------------------------ */
/* การประกอบรายการหนึ่งรายการ (seed → card)                              */
/* ------------------------------------------------------------------ */

interface GiSeed {
  provinceCode: string;
  slug: string;
  category: GiCategory;
  commodity: string;
  nameTh: string;
  nameEn: string | null;
  districts: readonly string[];
  known: boolean;
}

function buildSyntheticDistricts(key: string): string[] {
  const letters = ['A', 'B', 'C'];
  const first = pickIndex(`${key}|zone`, letters.length);
  const count = 1 + pickIndex(`${key}|zone-count`, 2);
  const zones: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    zones.push(`โซนผลิตสาธิต ${letters[(first + offset) % letters.length]}`);
  }
  return zones;
}

/** จำนวนรายการสังเคราะห์ของจังหวัดหนึ่ง: อย่างน้อย 1, จังหวัดเกษตรหลัก 2, รวมไม่เกิน 3 ต่อจังหวัด */
function fillerCountFor(provinceCode: string, knownCount: number): number {
  if (knownCount >= 3) return 0;
  const wanted = MAJOR_AGI_PROVINCE_SET[provinceCode] === true ? 2 : 1;
  return Math.max(1, Math.min(wanted, 3 - knownCount));
}

/** เลือกหมวดย่อยของรายการสังเคราะห์ลำดับที่ slot ตามแผนรายจังหวัด หรือ pool ของภาค */
function fillerCategoryFor(province: GiProvince, slot: number): GiCategory {
  const planned = FILLER_CATEGORY_PLAN[province.code];
  if (planned && planned.length > 0) return planned[slot % planned.length];
  const pool = REGION_FILLER_CATEGORY_POOL[province.region] ?? REGION_FILLER_CATEGORY_POOL['ภาคกลาง'];
  const start = pickIndex(`gi:plan:${province.code}`, pool.length);
  return pool[(start + slot) % pool.length];
}

/** external_control = known_gi_name ที่ลำดับใน GI_KNOWN_SEEDS หารด้วย 3 ลงตัว (ดูคอมเมนต์หัวไฟล์) */
function controlStandardFor(known: boolean, indexInKnownList: number): GiControlStandard {
  if (!known) return 'internal_control';
  return indexInKnownList % 3 === 0 ? 'external_control' : 'internal_control';
}

/** เลขทะเบียน placeholder: เห็นชัดว่าเป็นตัวอย่าง และไม่เลียนแบบรูปแบบเลขของทางราชการ */
function buildRegistrationNo(id: string, provinceCode: string): string {
  const digits = intBetween(`gi:regno:${id}`, 10000, 99999);
  return `(ตัวอย่าง) GI-${provinceCode}-${digits}`;
}

function buildSourceIds(category: GiCategory): string[] {
  if (category === 'textile_craft') return ['dip-gi-register', 'onc-standards'];
  if (category === 'other') return ['dip-gi-register', 'doae-catalog'];
  return ['dip-gi-register', 'doae-catalog', 'onc-standards'];
}

/** ฤดูเก็บเกี่ยว: เลือกชุดเดือนจาก pool ของหมวดย่อย แล้วเรียง ascending (เดือน 1-12) */
function buildSeasonMonths(id: string, category: GiCategory): number[] {
  const chosen = pick(`gi:season:${id}`, GI_CATEGORY_DEFS[category].seasons);
  return chosen.slice().sort((a, b) => a - b);
}

interface GiNumericBundle {
  areaRai: number;
  farmCount: number | null;
  annualYieldTons: number | null;
  pricePerKgTHB: number | null;
  marketValueTHB: number | null;
}

/**
 * สร้างตัวเลขของหนึ่งรายการจาก seed ล้วน ๆ
 * - areaRai มีค่าเสมอ (เป็นฐานของ plotPoints) farmCount เป็น null เมื่อกลุ่มยังไม่ยืนยันสมาชิก
 * - เกณฑ์ "ยังไมรายงานผลผลิต": draw(gi:gap:<id>) < 0.1 → annualYieldTons/pricePerKgTHB/marketValueTHB
 *   เป็น null พร้อมกันทั้งชุด (ห้ามมีค่าเดียวเป็น null แล้วอีกค่าเป็นตัวเลข)
 * - หมวดย่อย textile_craft มี yieldBand/priceBand = null ตามนิยาม จึงเป็น null เสมอ
 * - invariant: marketValueTHB = Math.round(annualYieldTons * 1000 * pricePerKgTHB) เมื่อรายงานทั้งคู่
 */
function buildNumerics(id: string, category: GiCategory): GiNumericBundle {
  const def = GI_CATEGORY_DEFS[category];
  const areaRai = intBetween(`gi:area:${id}`, def.areaBand[0], def.areaBand[1]);
  const farmCount = draw(`gi:farm-gap:${id}`) < 0.06
    ? null
    : intBetween(`gi:farm:${id}`, def.farmBand[0], def.farmBand[1]);

  const reportsProduction = def.yieldBand !== null
    && def.priceBand !== null
    && draw(`gi:gap:${id}`) >= 0.1;
  if (!reportsProduction || def.yieldBand === null || def.priceBand === null) {
    return { areaRai, farmCount, annualYieldTons: null, pricePerKgTHB: null, marketValueTHB: null };
  }

  const annualYieldTons = intBetween(`gi:yield:${id}`, def.yieldBand[0], def.yieldBand[1]);
  const pricePerKgTHB = round(between(`gi:price:${id}`, def.priceBand[0], def.priceBand[1]), 1);
  const marketValueTHB = Math.round(annualYieldTons * 1000 * pricePerKgTHB);
  return { areaRai, farmCount, annualYieldTons, pricePerKgTHB, marketValueTHB };
}

/**
 * จุดโครงร่าง 1-3 จุด: ค่ากึ่งกลางรายภาค + offset (±0.45 ละติจูด / ±0.55 ลองจิจูด) แล้ว clamp
 * การแบ่งพื้นที่ใช้สัดส่วนที่รวมได้ 1 พอดี ทำให้ผลรวมของจุดย่อยเท่ากับ areaRai ของรายการเสมอ
 */
function buildPlotPoints(id: string, region: string, districts: readonly string[], areaRai: number): GiPlotPoint[] {
  const anchor = REGION_ANCHORS[region] ?? REGION_ANCHORS['ภาคกลาง'];
  const pointCount = 1 + pickIndex(`gi:plot-count:${id}`, PLOT_AREA_SHARES.length);
  const shares = PLOT_AREA_SHARES[pointCount - 1];
  const points: GiPlotPoint[] = [];
  let usedArea = 0;

  for (let index = 0; index < pointCount; index += 1) {
    const key = `gi:plot:${id}:${index}`;
    const lat = round(clamp(anchor.lat + between(`${key}|lat`, -0.45, 0.45), LAT_BOUNDS[0], LAT_BOUNDS[1]), 4);
    const lon = round(clamp(anchor.lon + between(`${key}|lon`, -0.55, 0.55), LON_BOUNDS[0], LON_BOUNDS[1]), 4);
    const district = districts.length > 0
      ? districts[pickIndex(`${key}|district`, districts.length)]
      : UNVERIFIED_DISTRICT_LABEL;

    let slice: number;
    if (index === pointCount - 1) {
      slice = Math.max(1, areaRai - usedArea);
    } else {
      slice = Math.min(areaRai - usedArea - 1, Math.max(1, Math.round(areaRai * shares[index])));
      if (slice < 1) slice = 1;
    }
    usedArea += slice;
    points.push({ id: `${id}:plot-${index + 1}`, lat, lon, district, areaRai: slice });
  }

  // กรณีปัดเศษแล้วผลรวมไม่เท่า areaRai: ปรับจุดสุดท้ายให้ปิดผลรวม (ห้ามเกิด subtotal คนละชุด)
  const total = points.reduce((sum, point) => sum + point.areaRai, 0);
  if (total !== areaRai) {
    const last = points[points.length - 1];
    last.areaRai = Math.max(1, last.areaRai + (areaRai - total));
  }
  return points;
}

function buildDescription(seed: GiSeed, provinceName: string, standard: GiControlStandard): string {
  const standardNote = standard === 'external_control'
    ? 'โมเดลตั้งสมมติฐานว่ามีผู้ตรวจภายนอก (ยังไม่ได้ยืนยัน)'
    : 'โมเดลตั้งสมมติฐานว่ามีการควบคุมภายในกลุ่มผู้ผลิต (ยังไม่ได้ยืนยัน)';
  if (seed.known) {
    return `รายการนี้ตั้งชื่อตามสินค้า GI ที่เคยปรากฏในเอกสารสาธารณะของกลุ่มจังหวัด${provinceName} แต่พื้นที่ `
      + `จำนวนเกษตรกร ผลผลิต ราคา และมูลค่าทั้งหมดเป็นค่าตัวอย่างแบบ deterministic และยังไม่ได้ตรวจกับทะเบียน DIP; ${standardNote} `
      + 'ส่วนพิกัดใน plotPoints เป็นจุดโครงร่างเชิงพื้นที่ ไม่ใช่แปลงจริง';
  }
  return `รายการสังเคราะห์สำหรับทดสอบหน้าจอในจังหวัด${provinceName} ไม่มีสถานะการจดทะเบียนที่ใด และทุกตัวเลข`
    + `คำนวณจากรหัสประจำรายการแบบ deterministic; ${standardNote} จุดพิกัดเป็นโครงร่างเชิงพื้นที่เท่านั้น`;
}

function buildProductCard(seed: GiSeed, indexInKnownList: number): GiProductCard {
  const province = PROVINCE_BY_CODE[seed.provinceCode];
  const provinceName = province ? province.name : seed.provinceCode;
  const region = province ? province.region : 'ภาคกลาง';
  const id = `gi-${seed.provinceCode}-${seed.slug}`;
  const def = GI_CATEGORY_DEFS[seed.category];
  const standard = controlStandardFor(seed.known, indexInKnownList);
  const districts = seed.known
    ? seed.districts.slice(0, 3)
    : buildSyntheticDistricts(`gi:zone:${id}`);

  const numerics = buildNumerics(id, seed.category);
  const plotPoints = buildPlotPoints(id, region, districts, numerics.areaRai);

  return {
    id,
    nameTh: seed.nameTh,
    nameEn: seed.nameEn,
    commodity: seed.commodity,
    category: seed.category,
    categoryLabel: def.label,
    provinceCode: seed.provinceCode,
    provinceName,
    region,
    districts,
    controlStandard: standard,
    controlStandardLabel: GI_STANDARD_LABELS[standard],
    registrationNo: buildRegistrationNo(id, seed.provinceCode),
    registrationNoStatus: 'sample_placeholder',
    registeredYear: null,
    nameOrigin: seed.known ? 'known_gi_name' : 'synthetic_sample',
    evidenceStatus: 'not_verified',
    areaRai: numerics.areaRai,
    farmCount: numerics.farmCount,
    annualYieldTons: numerics.annualYieldTons,
    marketValueTHB: numerics.marketValueTHB,
    pricePerKgTHB: numerics.pricePerKgTHB,
    seasonMonths: buildSeasonMonths(id, seed.category),
    badgeColor: GI_STANDARD_BADGE_COLORS[standard],
    description: buildDescription(seed, provinceName, standard),
    plotPoints,
    sourceIds: buildSourceIds(seed.category),
  };
}

/* ------------------------------------------------------------------ */
/* แคตตาล็อกทั้งประเทศ (build ครั้งเดียวต่อ process แล้ว memoize)           */
/* ------------------------------------------------------------------ */

function buildSyntheticSeed(province: GiProvince, slot: number, seq: number): GiSeed {
  const category = fillerCategoryFor(province, slot);
  const def = GI_CATEGORY_DEFS[category];
  const key = `gi:syn:${province.code}:${seq}`;
  const commodity = pick(`${key}|commodity`, def.commodities);
  const locality = pick(`${key}|locality`, SYNTHETIC_LOCALITY_WORDS);
  return {
    provinceCode: province.code,
    slug: `sample-${category}-${seq}`,
    category,
    commodity,
    nameTh: `${commodity}${locality} (ข้อมูลตัวอย่าง)`,
    nameEn: null,
    districts: buildSyntheticDistricts(`gi:zone:gi-${province.code}-sample-${category}-${seq}`),
    known: false,
  };
}

function buildCatalogue(): GiProductCard[] {
  const cards: GiProductCard[] = [];

  // 1) ชื่อ known_gi_name ก่อน เพื่อให้ indexInKnownList เป็นกติกา control standard ที่คงที่
  for (let index = 0; index < GI_KNOWN_SEEDS.length; index += 1) {
    const known = GI_KNOWN_SEEDS[index];
    const seed: GiSeed = {
      provinceCode: known.provinceCode,
      slug: known.slug,
      category: known.category,
      commodity: known.commodity,
      nameTh: known.nameTh,
      nameEn: known.nameEn,
      districts: known.districts && known.districts.length > 0 ? known.districts : [UNVERIFIED_DISTRICT_LABEL],
      known: true,
    };
    cards.push(buildProductCard(seed, index));
  }

  // 2) รายการสังเคราะห์เติมให้ครบทุกจังหวัด (>= 1, จังหวัดเกษตรหลัก 2, รวมไม่เกิน 3 ต่อจังหวัด)
  for (let provinceIndex = 0; provinceIndex < THAILAND_PROVINCES.length; provinceIndex += 1) {
    const province = THAILAND_PROVINCES[provinceIndex];
    const knownCount = cards.filter((card) => card.provinceCode === province.code).length;
    const fillers = fillerCountFor(province.code, knownCount);
    for (let slot = 0; slot < fillers; slot += 1) {
      cards.push(buildProductCard(buildSyntheticSeed(province, slot, knownCount + slot + 1), -1));
    }
  }

  // เรียงตามรหัสจังหวัดแล้วตาม id เพื่อให้ลำดับคงที่ ไม่ขึ้นกับลำดับการ push
  cards.sort((left, right) => {
    const byCode = Number(left.provinceCode) - Number(right.provinceCode);
    if (byCode !== 0) return byCode;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });

  return cards;
}

/* ------------------------------------------------------------------ */
/* Guard: สัญญาภายในของแคตตาล็อกต้องไม่แตก (fail closed)                   */
/* ------------------------------------------------------------------ */

function assertCatalogueInvariants(cards: GiProductCard[]): void {
  if (cards.length < 110 || cards.length > 140) {
    throw new Error(`GI sample catalogue left the intended 110-140 range (got ${cards.length})`);
  }
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new Error('Duplicate gi id in sample catalogue');
  }

  const countByProvince: Record<string, number> = {};
  for (let index = 0; index < THAILAND_PROVINCES.length; index += 1) {
    countByProvince[THAILAND_PROVINCES[index].code] = 0;
  }

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    countByProvince[card.provinceCode] = (countByProvince[card.provinceCode] ?? 0) + 1;

    const province = PROVINCE_BY_CODE[card.provinceCode];
    if (province === undefined) throw new Error(`${card.id} carries an unknown province code`);
    if (card.region !== province.region) throw new Error(`${card.id} region must match the 6-region table of logistics-data.ts`);
    if (card.provinceName !== province.name) throw new Error(`${card.id} province name drifted from the register`);
    if (card.evidenceStatus !== 'not_verified') throw new Error(`${card.id} must stay evidenceStatus not_verified`);
    if (card.registeredYear !== null) throw new Error(`${card.id} must not invent an official registration year`);
    if (card.registrationNoStatus !== 'sample_placeholder') throw new Error(`${card.id} registration number is not a placeholder`);
    if (card.registrationNo.indexOf('(ตัวอย่าง) GI-') !== 0) throw new Error(`${card.id} registration number must be visibly a sample`);
    if (card.badgeColor !== GI_STANDARD_BADGE_COLORS[card.controlStandard]) throw new Error(`${card.id} badge colour left its control standard`);
    if (card.categoryLabel !== GI_CATEGORY_LABELS[card.category]) throw new Error(`${card.id} category label drifted`);
    if (card.controlStandardLabel !== GI_STANDARD_LABELS[card.controlStandard]) throw new Error(`${card.id} control standard label drifted`);
    if (card.districts.length === 0) throw new Error(`${card.id} must carry a district label (verified or explicitly unverified)`);
    if (card.sourceIds.length === 0) throw new Error(`${card.id} must cite at least one pending source`);
    if (card.seasonMonths.length === 0) throw new Error(`${card.id} must carry at least one harvest month`);
    for (let monthIndex = 0; monthIndex < card.seasonMonths.length; monthIndex += 1) {
      const month = card.seasonMonths[monthIndex];
      if (month < 1 || month > 12) throw new Error(`${card.id} season month out of 1-12`);
      if (monthIndex > 0 && card.seasonMonths[monthIndex - 1] >= month) throw new Error(`${card.id} season months must ascend`);
    }
    if (card.plotPoints.length < 1 || card.plotPoints.length > 3) {
      throw new Error(`${card.id} must carry 1-3 structural plot points`);
    }

    // invariant มูลค่า: ตัน → กรัม/กก. × บาท/กก. (หรือไม่รายงานทั้งชุดแล้วต้องเป็น null ทั้งชุด)
    const reportsProduction = card.annualYieldTons !== null && card.pricePerKgTHB !== null;
    if (reportsProduction) {
      const expected = Math.round((card.annualYieldTons as number) * 1000 * (card.pricePerKgTHB as number));
      if (card.marketValueTHB !== expected) throw new Error(`${card.id} market value must equal yield(kg) x price`);
    } else if (card.marketValueTHB !== null || card.annualYieldTons !== null || card.pricePerKgTHB !== null) {
      throw new Error(`${card.id} must keep yield, price and market value null together`);
    }

    if (card.areaRai === null) throw new Error(`${card.id} needs an area baseline for its structural plot points`);
    let plotTotal = 0;
    for (let plotIndex = 0; plotIndex < card.plotPoints.length; plotIndex += 1) {
      const point = card.plotPoints[plotIndex];
      if (point.lat < LAT_BOUNDS[0] || point.lat > LAT_BOUNDS[1]) throw new Error(`${point.id} latitude outside Thailand bounds`);
      if (point.lon < LON_BOUNDS[0] || point.lon > LON_BOUNDS[1]) throw new Error(`${point.id} longitude outside Thailand bounds`);
      if (point.areaRai <= 0) throw new Error(`${point.id} structural plot area must stay positive`);
      plotTotal += point.areaRai;
    }
    if (plotTotal !== card.areaRai) {
      throw new Error(`${card.id} structural plot areas must sum to areaRai (got ${plotTotal})`);
    }
  }

  const provinceCodes = Object.keys(countByProvince);
  for (let index = 0; index < provinceCodes.length; index += 1) {
    const code = provinceCodes[index];
    if (countByProvince[code] < 1) throw new Error(`Province ${code} has no GI sample row`);
    if (countByProvince[code] > 3) throw new Error(`Province ${code} exceeds the 3-row-per-province cap`);
  }

  const seenCategories: Record<string, true> = {};
  for (let index = 0; index < cards.length; index += 1) seenCategories[cards[index].category] = true;
  for (let index = 0; index < GI_CATEGORY_ORDER.length; index += 1) {
    if (seenCategories[GI_CATEGORY_ORDER[index]] !== true) {
      throw new Error(`GI catalogue lost category ${GI_CATEGORY_ORDER[index]}`);
    }
  }

  // ทุก rollup ต้องบวกจากตัวของรายการที่กรองจริง (ตรวจกับแคตตาล็อกเต็มก่อน memoize)
  const totals = buildSummary(cards);
  const regionRows = rollupByRegion(cards);
  const categoryRows = rollupByCategory(cards);
  const standardRows = rollupByStandard(cards);
  const provinceRows = rollupByProvince(cards);
  const sumCount = (rows: Array<{ productCount: number }>) =>
    rows.reduce((acc, row) => acc + row.productCount, 0);
  if (sumCount(regionRows) !== totals.totalProducts) throw new Error('byRegion productCount must equal totalProducts');
  if (sumCount(categoryRows) !== totals.totalProducts) throw new Error('byCategory productCount must equal totalProducts');
  if (sumCount(standardRows) !== totals.totalProducts) throw new Error('byStandard productCount must equal totalProducts');
  if (sumCount(provinceRows) !== totals.totalProducts) throw new Error('byProvince productCount must equal totalProducts');
  const standardValue = standardRows.reduce((acc, row) => acc + row.totalMarketValueTHB, 0);
  const categoryValue = categoryRows.reduce((acc, row) => acc + row.totalMarketValueTHB, 0);
  const regionValue = regionRows.reduce((acc, row) => acc + row.totalMarketValueTHB, 0);
  const provinceValue = provinceRows.reduce((acc, row) => acc + row.totalMarketValueTHB, 0);
  if (standardValue !== totals.totalMarketValueTHB
    || categoryValue !== totals.totalMarketValueTHB
    || regionValue !== totals.totalMarketValueTHB
    || provinceValue !== totals.totalMarketValueTHB) {
    throw new Error('rollup market values must re-sum to the national total without double counting');
  }
}

/* ------------------------------------------------------------------ */
/* Summary และ rollup (บวกจากตัวของรายการในกลุ่มนั้นเท่านั้น)              */
/* ------------------------------------------------------------------ */

function emptySummary(): GiNationalSummary {
  return {
    totalProducts: 0,
    provinceCountWithData: 0,
    regionCount: 0,
    totalAreaRai: 0,
    totalFarmCount: 0,
    totalMarketValueTHB: 0,
    internalControlProducts: 0,
    externalControlProducts: 0,
    avgPricePerKgTHB: null,
    coverageClaim: false,
  };
}

/**
 * summary ของกลุ่มรายการหนึ่ง ๆ: ทุกค่าเกิดจากการบวก field ของรายการในกลุ่ม
 * avgPricePerKgTHB เป็นค่าเฉลี่ยถ่วงน้ำหนักด้วยผลผลิต (Σ yield x price / Σ yield) และเป็น null
 * เมื่อไม่มีรายการใดรายงานราคา (เช่นกรองเหลือเฉพาะงานหัตถกรรม)
 */
function buildSummary(products: GiProductCard[]): GiNationalSummary {
  if (products.length === 0) return emptySummary();

  const provinceSeen: Record<string, true> = {};
  const regionSeen: Record<string, true> = {};
  let totalAreaRai = 0;
  let totalFarmCount = 0;
  let totalMarketValueTHB = 0;
  let internalControlProducts = 0;
  let externalControlProducts = 0;
  let priceNumerator = 0;
  let priceDenominator = 0;

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    provinceSeen[product.provinceCode] = true;
    regionSeen[product.region] = true;

    if (product.areaRai !== null) totalAreaRai += product.areaRai;
    if (product.farmCount !== null) totalFarmCount += product.farmCount;
    if (product.marketValueTHB !== null) totalMarketValueTHB += product.marketValueTHB;

    if (product.controlStandard === 'external_control') externalControlProducts += 1;
    else internalControlProducts += 1;

    if (product.annualYieldTons !== null && product.pricePerKgTHB !== null) {
      priceNumerator += product.annualYieldTons * product.pricePerKgTHB;
      priceDenominator += product.annualYieldTons;
    }
  }

  const avgPricePerKgTHB = priceDenominator > 0 ? round(priceNumerator / priceDenominator, 1) : null;

  return {
    totalProducts: products.length,
    provinceCountWithData: Object.keys(provinceSeen).length,
    regionCount: Object.keys(regionSeen).length,
    totalAreaRai,
    totalFarmCount,
    totalMarketValueTHB,
    internalControlProducts,
    externalControlProducts,
    avgPricePerKgTHB,
    coverageClaim: false,
  };
}

function rollupByProvince(products: GiProductCard[]): GiProvinceRollup[] {
  const rows: Record<string, GiProvinceRollup> = {};
  const categorySeen: Record<string, Record<string, true>> = {};

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    let row = rows[product.provinceCode];
    if (row === undefined) {
      row = {
        provinceCode: product.provinceCode,
        provinceName: product.provinceName,
        region: product.region,
        productCount: 0,
        totalAreaRai: 0,
        totalFarmCount: 0,
        totalMarketValueTHB: 0,
        categories: [],
      };
      rows[product.provinceCode] = row;
      categorySeen[product.provinceCode] = {};
    }
    row.productCount += 1;
    if (product.areaRai !== null) row.totalAreaRai += product.areaRai;
    if (product.farmCount !== null) row.totalFarmCount += product.farmCount;
    if (product.marketValueTHB !== null) row.totalMarketValueTHB += product.marketValueTHB;
    if (categorySeen[product.provinceCode][product.category] !== true) {
      categorySeen[product.provinceCode][product.category] = true;
      row.categories.push(product.category);
    }
  }

  const ordered: GiProvinceRollup[] = [];
  for (let index = 0; index < THAILAND_PROVINCES.length; index += 1) {
    const row = rows[THAILAND_PROVINCES[index].code];
    if (row !== undefined) ordered.push(row);
  }
  for (let index = 0; index < ordered.length; index += 1) {
    ordered[index].categories.sort(
      (a, b) => GI_CATEGORY_ORDER.indexOf(a) - GI_CATEGORY_ORDER.indexOf(b),
    );
  }
  // เรียงตามจำนวนรายการก่อน แล้วตามรหัสจังหวัด เพื่อให้ลำดับคงที่และอ่านง่ายบนแผนที่
  ordered.sort((a, b) => b.productCount - a.productCount || Number(a.provinceCode) - Number(b.provinceCode));
  return ordered;
}

function rollupByRegion(products: GiProductCard[]): GiRegionRollup[] {
  const rows: Record<string, GiRegionRollup> = {};
  const provinceSeen: Record<string, Record<string, true>> = {};

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    let row = rows[product.region];
    if (row === undefined) {
      row = { region: product.region, productCount: 0, provinceCount: 0, totalAreaRai: 0, totalMarketValueTHB: 0 };
      rows[product.region] = row;
      provinceSeen[product.region] = {};
    }
    row.productCount += 1;
    if (provinceSeen[product.region][product.provinceCode] !== true) {
      provinceSeen[product.region][product.provinceCode] = true;
      row.provinceCount += 1;
    }
    if (product.areaRai !== null) row.totalAreaRai += product.areaRai;
    if (product.marketValueTHB !== null) row.totalMarketValueTHB += product.marketValueTHB;
  }

  const ordered: GiRegionRollup[] = [];
  for (let index = 0; index < GI_REGION_ORDER.length; index += 1) {
    const row = rows[GI_REGION_ORDER[index]];
    if (row !== undefined) ordered.push(row);
  }
  const seen = Object.keys(rows);
  for (let index = 0; index < seen.length; index += 1) {
    if (GI_REGION_ORDER.indexOf(seen[index]) === -1) ordered.push(rows[seen[index]]);
  }
  return ordered;
}

function rollupByCategory(products: GiProductCard[]): GiCategoryRollup[] {
  const rows: Record<string, GiCategoryRollup> = {};
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    let row = rows[product.category];
    if (row === undefined) {
      row = {
        category: product.category,
        label: GI_CATEGORY_LABELS[product.category],
        productCount: 0,
        totalAreaRai: 0,
        totalMarketValueTHB: 0,
      };
      rows[product.category] = row;
    }
    row.productCount += 1;
    if (product.areaRai !== null) row.totalAreaRai += product.areaRai;
    if (product.marketValueTHB !== null) row.totalMarketValueTHB += product.marketValueTHB;
  }

  const ordered: GiCategoryRollup[] = [];
  for (let index = 0; index < GI_CATEGORY_ORDER.length; index += 1) {
    const row = rows[GI_CATEGORY_ORDER[index]];
    if (row !== undefined) ordered.push(row);
  }
  return ordered;
}

function rollupByStandard(products: GiProductCard[]): GiStandardRollup[] {
  const rows: Record<string, GiStandardRollup> = {};
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    let row = rows[product.controlStandard];
    if (row === undefined) {
      row = {
        standard: product.controlStandard,
        label: GI_STANDARD_LABELS[product.controlStandard],
        productCount: 0,
        totalMarketValueTHB: 0,
      };
      rows[product.controlStandard] = row;
    }
    row.productCount += 1;
    if (product.marketValueTHB !== null) row.totalMarketValueTHB += product.marketValueTHB;
  }

  const ordered: GiStandardRollup[] = [];
  for (let index = 0; index < GI_STANDARD_ORDER.length; index += 1) {
    const row = rows[GI_STANDARD_ORDER[index]];
    if (row !== undefined) ordered.push(row);
  }
  return ordered;
}

/* ------------------------------------------------------------------ */
/* ตัวกรอง                                                              */
/* ------------------------------------------------------------------ */

function normaliseToken(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

/**
 * เงื่อนไขแบบ AND ทุก field; q เทียบกับ nameTh / nameEn / commodity / provinceName / districts
 * (case-insensitive และ NFC-normalise ทั้งสองข้าง)
 */
function matchesFilters(product: GiProductCard, filters: GiDashboardFilters): boolean {
  if (filters.provinceCode && filters.provinceCode !== product.provinceCode) return false;
  if (filters.region && filters.region !== product.region) return false;
  if (filters.category && filters.category !== product.category) return false;
  if (filters.standard && filters.standard !== product.controlStandard) return false;

  const query = filters.q === undefined ? '' : normaliseToken(filters.q);
  if (query.length > 0) {
    const haystack = [
      product.nameTh,
      product.nameEn ?? '',
      product.commodity,
      product.provinceName,
      product.provinceCode,
      product.region,
      product.categoryLabel,
      product.controlStandardLabel,
      product.districts.join(' '),
    ].join(' ').normalize('NFC').toLowerCase();
    if (haystack.indexOf(query) === -1) return false;
  }
  return true;
}

function buildFilterOptions(): GiFilterOptions {
  const categories: Array<{ id: GiCategory; label: string }> = [];
  for (let index = 0; index < GI_CATEGORY_ORDER.length; index += 1) {
    const id = GI_CATEGORY_ORDER[index];
    categories.push({ id, label: GI_CATEGORY_LABELS[id] });
  }
  const standards: Array<{ id: GiControlStandard; label: string }> = [];
  for (let index = 0; index < GI_STANDARD_ORDER.length; index += 1) {
    const id = GI_STANDARD_ORDER[index];
    standards.push({ id, label: GI_STANDARD_LABELS[id] });
  }
  return {
    // provinces = ทะเบียนรหัสจังหวัด 77 รายการของโมเดล (ไม่ใช่ข้อสรุปว่า coverage ครบทุกจังหวัด)
    provinces: THAILAND_PROVINCES.slice(),
    regions: GI_REGION_ORDER.slice(),
    categories,
    standards,
  };
}

/* ------------------------------------------------------------------ */
/* Public API ของ lane 1A                                                */
/* ------------------------------------------------------------------ */

let cachedCatalogue: GiProductCard[] | undefined;
let cachedFilterOptions: GiFilterOptions | undefined;
let cachedNationalSummary: GiNationalSummary | undefined;

function getCatalogue(): GiProductCard[] {
  if (cachedCatalogue === undefined) {
    const catalogue = buildCatalogue();
    assertCatalogueInvariants(catalogue);
    cachedCatalogue = catalogue;
  }
  return cachedCatalogue;
}

/**
 * สร้าง payload ทั้ง dashboard (synchronous + deterministic)
 * - summary เป็นภาพรวมทั้งประเทศเสมอ ไม่ขึ้นกับ filters
 * - filteredSummary/products/byProvince/byRegion/byCategory/byStandard ใช้กลุ่มที่กรอง
 * - filters omitted = view ทั้งประเทศ (summary เทากับ filteredSummary)
 * - กรองแล้วไม่ตรงรายการใด → อาร์เรย์ว่าง + filteredSummary เป็น 0 และ avgPricePerKgTHB = null
 *   (ไม่ throw เพื่อให้ API layer ตอบ 200 แบบ HTTP-friendly)
 */
export function buildGiDashboard(filters?: GiDashboardFilters): GiDashboardPayload {
  const products = getCatalogue();
  const matched = filters === undefined ? products : products.filter((product) => matchesFilters(product, filters));

  if (cachedNationalSummary === undefined) cachedNationalSummary = buildSummary(products);
  if (cachedFilterOptions === undefined) cachedFilterOptions = buildFilterOptions();

  return {
    sample: true,
    generatedAt: GI_GENERATED_AT,
    summary: cachedNationalSummary,
    filteredSummary: buildSummary(matched),
    products: matched,
    byProvince: rollupByProvince(matched),
    byRegion: rollupByRegion(matched),
    byCategory: rollupByCategory(matched),
    byStandard: rollupByStandard(matched),
    filterOptions: cachedFilterOptions,
    sources: GI_SOURCES,
    warnings: GI_WARNINGS,
    coverageNote: GI_COVERAGE_NOTE,
  };
}

/** แปลง query เป็นหมวดย่อย (รับทั้ง ascii id และฉลากไทย, NFC) — ไม่ตรงคืน null */
export function giCategoryFromQuery(raw: string): GiCategory | null {
  const token = normaliseToken(raw);
  if (token.length === 0) return null;
  for (let index = 0; index < GI_CATEGORY_ORDER.length; index += 1) {
    const id = GI_CATEGORY_ORDER[index];
    if (token === id || token === normaliseToken(GI_CATEGORY_LABELS[id])) return id;
  }
  return null;
}

/** แปลง query เป็นระดับการควบคุม (รับทั้ง ascii id และฉลากไทย, NFC) — ไม่ตรงคืน null */
export function giStandardFromQuery(raw: string): GiControlStandard | null {
  const token = normaliseToken(raw);
  if (token.length === 0) return null;
  for (let index = 0; index < GI_STANDARD_ORDER.length; index += 1) {
    const id = GI_STANDARD_ORDER[index];
    if (token === id || token === normaliseToken(GI_STANDARD_LABELS[id])) return id;
  }
  return null;
}
