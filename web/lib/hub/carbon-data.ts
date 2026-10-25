/**
 * Agri-Carbon & Green Farming data layer
 * สำหรับหน้า /carbon และ /api/v1/carbon
 *
 * ข้อกำหนด:
 * 1. ประเมินศักยภาพกักเก็บคาร์บอนราย 77 จังหวัด แยกไม้ยืนต้น ยางพารา ปาล์มน้ำมัน และดินเกษตร
 * 2. สรุปสถิติโครงการ T-VER ภาคเกษตรและป่าไม้ (แบบจำลอง deterministic)
 * 3. วิเคราะห์นาเปียกสลับแห้ง (AWD) เพื่อลดก๊าซมีเทนและประหยัดน้ำ
 * 4. ทุกตัวเลขเป็น sample: true และ metadata_only — ไม่ใช่สถิติทางการที่ทวนสอบแล้ว
 */

export const CARBON_SAMPLE_MODE = true;
export const CARBON_DATA_AS_OF = '2026-10-25';

/** ราคาเครดิตคาร์บอนอ้างอิงเพื่อสาธิต (บาท/tCO2e) — ไม่ใช่ราคาตลาดรับรอง */
export const CARBON_CREDIT_PRICE_THB_PER_TCO2E = 120;
/** GWP100 ของมีเทนตาม IPCC AR5 */
export const GWP_CH4 = 28;
/** ค่าฐานการปล่อยมีเทนจากนาข้าวแบบน้ำขังต่อเนื่อง (tCO2e/ไร่/ฤดู) */
export const AWD_BASELINE_CH4_TCO2E_PER_RAI = 0.36;
/** สัดส่วนลดการปล่อยมีเทนเมื่อทำ AWD */
export const AWD_REDUCTION_FACTOR = 0.45;
/** ปริมาณน้ำที่ประหยัดได้จากการทำ AWD (ลบ.ม./ไร่/ฤดู) */
export const AWD_WATER_SAVING_M3_PER_RAI = 320;

export type CarbonCategoryId = 'perennial_tree' | 'rubber' | 'oil_palm' | 'soil';
export type CarbonProjectType = CarbonCategoryId | 'awd';
export type CarbonProjectFilter = CarbonProjectType | 'all';
export type CarbonRegion = 'central' | 'east' | 'northeast' | 'north' | 'west' | 'south';

export const CARBON_REGION_LABELS: Record<CarbonRegion, string> = {
  central: 'ภาคกลาง',
  east: 'ภาคตะวันออก',
  northeast: 'ภาคตะวันออกเฉียงเหนือ',
  north: 'ภาคเหนือ',
  west: 'ภาคตะวันตก',
  south: 'ภาคใต้',
};

export interface CarbonCategoryConfig {
  id: CarbonCategoryId;
  label: string;
  labelEn: string;
  description: string;
  color: string;
}

export const CARBON_CATEGORY_CONFIGS: Record<CarbonCategoryId, CarbonCategoryConfig> = {
  perennial_tree: {
    id: 'perennial_tree',
    label: 'ไม้ยืนต้น',
    labelEn: 'Perennial Trees',
    description: 'ไม้ผลและไม้ยืนต้นเศรษฐกิจ เช่น ทุเรียน ลำไย มังคุด ส้ม และสวนผสมผสาน',
    color: '#166534',
  },
  rubber: {
    id: 'rubber',
    label: 'ยางพารา',
    labelEn: 'Rubber',
    description: 'สวนยางพาราที่มีมวลชีวภาพเหนือดินและคาร์บอนในดินสะสมต่อเนื่อง',
    color: '#0f766e',
  },
  oil_palm: {
    id: 'oil_palm',
    label: 'ปาล์มน้ำมัน',
    labelEn: 'Oil Palm',
    description: 'สวนปาล์มน้ำมันและแนวทางจัดการเศษชีวมวลเพื่อลดการปล่อยคาร์บอน',
    color: '#b45309',
  },
  soil: {
    id: 'soil',
    label: 'ดินเกษตร',
    labelEn: 'Soil Carbon',
    description: 'อินทรียวัตถุในดิน พืชคลุมดิน ปุ๋ยอินทรีย์ และการลดการไถพรวนในพื้นที่เกษตรอื่น',
    color: '#7c5e3b',
  },
};

export const AWD_PROJECT_LABEL = 'นาเปียกสลับแห้ง (AWD)';
export const AWD_PROJECT_COLOR = '#0369a1';

export const CARBON_PROJECT_TYPE_LABELS: Record<CarbonProjectType, string> = {
  perennial_tree: CARBON_CATEGORY_CONFIGS.perennial_tree.label,
  rubber: CARBON_CATEGORY_CONFIGS.rubber.label,
  oil_palm: CARBON_CATEGORY_CONFIGS.oil_palm.label,
  soil: CARBON_CATEGORY_CONFIGS.soil.label,
  awd: AWD_PROJECT_LABEL,
};

const PROJECT_TYPE_ALIASES: Record<string, CarbonProjectType> = {
  perennial_tree: 'perennial_tree',
  perennial: 'perennial_tree',
  tree: 'perennial_tree',
  ไม้ยืนต้น: 'perennial_tree',
  rubber: 'rubber',
  ยางพารา: 'rubber',
  oil_palm: 'oil_palm',
  oilpalm: 'oil_palm',
  palm: 'oil_palm',
  ปาล์มน้ำมัน: 'oil_palm',
  soil: 'soil',
  soil_management: 'soil',
  soil_carbon: 'soil',
  ดินเกษตร: 'soil',
  awd: 'awd',
  นาเปียกสลับแห้ง: 'awd',
};

export function normalizeCarbonProjectType(raw: string | null | undefined): CarbonProjectFilter | null {
  if (!raw) return 'all';
  const value = raw.trim();
  if (!value || value.toLowerCase() === 'all' || value === 'ทั้งหมด') return 'all';
  return PROJECT_TYPE_ALIASES[value.toLowerCase()] ?? PROJECT_TYPE_ALIASES[value] ?? null;
}

export interface CarbonProvinceOption {
  code: string;
  name: string;
  region: CarbonRegion;
  regionLabel: string;
}

export interface CarbonCategoryBreakdown {
  id: CarbonCategoryId;
  areaRai: number;
  carbonStockTCO2e: number;
  sequestrationTCO2ePerYear: number;
  creditPotentialTCO2ePerYear: number;
  creditValueThb: number;
  /** สัดส่วนพื้นที่ที่ปรับวิธีปฏิบัติแล้ว (%) */
  adoptionRate: number;
}

export interface CarbonCategorySummary extends CarbonCategoryConfig, CarbonCategoryBreakdown {
  shareOfSequestration: number;
}

export interface ProvinceCarbonProfile {
  provinceCode: string;
  provinceName: string;
  region: CarbonRegion;
  regionLabel: string;
  cultivatedRai: number;
  riceAreaRai: number;
  carbonStockTCO2e: number;
  sequestrationTCO2ePerYear: number;
  creditPotentialTCO2ePerYear: number;
  creditValueThb: number;
  adoptionRate: number;
  awdAdoptionRate: number;
  awdMethaneReductionTCO2e: number;
  awdWaterSavingM3: number;
  categories: CarbonCategoryBreakdown[];
  potentialGrade: 'high' | 'moderate' | 'emerging';
  potentialGradeLabel: string;
}

export interface CarbonScopeSummary {
  provinceCount: number;
  cultivatedRai: number;
  riceAreaRai: number;
  carbonStockTCO2e: number;
  sequestrationTCO2ePerYear: number;
  creditPotentialTCO2ePerYear: number;
  creditValueThb: number;
  adoptionRate: number;
  awdAdoptionRate: number;
  awdMethaneReductionTCO2e: number;
  awdWaterSavingM3: number;
}

export type VerProjectStatus = 'registered' | 'verified' | 'certified';
export type VerDeveloperType = 'community' | 'cooperative' | 'private';

export interface VerProject {
  id: string;
  name: string;
  projectType: CarbonProjectType;
  projectTypeLabel: string;
  sector: 'agriculture' | 'forestry';
  sectorLabel: string;
  provinceCode: string;
  provinceName: string;
  region: CarbonRegion;
  regionLabel: string;
  status: VerProjectStatus;
  statusLabel: string;
  registeredYear: number;
  annualReductionTCO2e: number;
  issuedCreditsTCO2e: number;
  developerType: VerDeveloperType;
  developerTypeLabel: string;
}

export interface VerSummary {
  projectCount: number;
  registeredCount: number;
  verifiedCount: number;
  certifiedCount: number;
  annualReductionTCO2e: number;
  issuedCreditsTCO2e: number;
}

export interface CarbonNationalSummary extends CarbonScopeSummary, VerSummary {}

export interface CarbonFilterOptions {
  provinceCode?: string | null;
  projectType?: CarbonProjectFilter | string | null;
}

export interface CarbonSourceReference {
  id: string;
  name: string;
  agencyLabel: string;
  role: string;
  sourceUrl: string;
  licenseStatus: string;
}

export interface CarbonDashboardPayload {
  sample: boolean;
  dataAsOf: string;
  generatedAt: string;
  filters: {
    provinceCode: string | null;
    projectType: CarbonProjectFilter;
  };
  scopeLabel: string;
  nationalSummary: CarbonNationalSummary;
  scopedSummary: CarbonScopeSummary;
  categories: CarbonCategorySummary[];
  provinces: ProvinceCarbonProfile[];
  selectedProvince: ProvinceCarbonProfile | null;
  awdTopProvinces: ProvinceCarbonProfile[];
  projects: VerProject[];
  verSummary: VerSummary;
  allProvinces: CarbonProvinceOption[];
  sources: CarbonSourceReference[];
  warnings: string[];
  methodNotes: string[];
}

export const CARBON_SOURCES: CarbonSourceReference[] = [
  {
    id: 'tgo',
    name: 'องค์การบริหารจัดการก๊าซเรือนกระจก (อบก. / TGO)',
    agencyLabel: 'กระทรวงทรัพยากรธรรมชาติและสิ่งแวดล้อม',
    role: 'ทะเบียนโครงการ T-VER ภาคเกษตรและป่าไม้ ระเบียบวิธีลดก๊าซเรือนกระจก และการรับรองเครดิต',
    sourceUrl: 'https://ghgreduction.tgo.or.th',
    licenseStatus: 'pending',
  },
  {
    id: 'ldd',
    name: 'กรมพัฒนาที่ดิน (LDD)',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'ข้อมูลชุดดิน อินทรียวัตถุในดิน และศักยภาพกักเก็บคาร์บอนในดินรายพื้นที่',
    sourceUrl: 'https://www.ldd.go.th',
    licenseStatus: 'pending',
  },
  {
    id: 'doae',
    name: 'กรมส่งเสริมการเกษตร (DOAE)',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'พื้นที่เพาะปลูกและทะเบียนเกษตรกรรายจังหวัดสำหรับประเมินพื้นที่ร่วมโครงการ',
    sourceUrl: 'https://www.doae.go.th',
    licenseStatus: 'pending',
  },
  {
    id: 'oae',
    name: 'สำนักงานเศรษฐกิจการเกษตร (สศก. / OAE)',
    agencyLabel: 'กระทรวงเกษตรและสหกรณ์',
    role: 'เนื้อที่เพาะปลูกพืชเศรษฐกิจรายจังหวัดเพื่อประกอบการประเมินศักยภาพ',
    sourceUrl: 'https://www.oae.go.th',
    licenseStatus: 'pending',
  },
];

export const CARBON_WARNINGS: string[] = [
  'ข้อมูลคาร์บอน เครดิต และโครงการ T-VER ในหน้านี้เป็นชุดข้อมูลจำลองแบบ deterministic เพื่อสาธิตระบบ ไม่ใช่สถิติทางการหรือผลประเมินที่ผ่านการทวนสอบ',
  'ค่าสัมประสิทธิ์การกักเก็บคาร์บอนและสต็อกคาร์บอนอ้างอิงช่วงวรรณกรรม (IPCC/FAO) แต่ยังไม่ได้สอบเทียบกับข้อมูลภาคสนามรายจังหวัดหรือชุดดินรายแปลง',
  'การคำนวณ AWD ใช้ค่าฐานการปล่อยมีเทนและสัดส่วนลดแบบสมมติฐาน (GWP100 CH4 = 28) การใช้งานจริงต้องอ้างอิงระเบียบวิธีของ อบก. และผลตรวจวัดภาคสนาม',
  'ราคาเครดิต 120 บาท/tCO2e เป็นสมมติฐานเพื่อการสาธิต ไม่ใช่ราคารับซื้อหรือราคาตลาดที่รับรอง',
  'สิทธิ์เผยแพร่ตัวเลขจาก อบก. กรมพัฒนาที่ดิน กรมส่งเสริมการเกษตร และ สศก. ยังอยู่ระหว่างตรวจสอบ (metadata_only) จึงยังไม่เปิดค่าดิบรายแปลงหรือรายโครงการจริง',
];

export const CARBON_METHOD_NOTES: string[] = [
  'สต็อกคาร์บอน = พื้นที่เพาะปลูก × ค่าสต็อกต่อไร่ตามประเภทพืช (ช่วงอ้างอิง IPCC/FAO) ปรับด้วยปัจจัยรายจังหวัดแบบ deterministic',
  'ศักยภาพกักเก็บรายปี = พื้นที่ × อัตรากักเก็บต่อไร่/ปี และเครดิตที่คาดหวัง = ศักยภาพ × สัดส่วนพื้นที่ที่ปรับวิธีปฏิบัติแล้ว × ราคาอ้างอิง 120 บาท/tCO2e',
  'AWD: มีเทนที่ลดได้ = พื้นที่นาร่วมโครงการ × 0.36 tCO2e/ไร่/ฤดู × 45% และน้ำที่ประหยัด = พื้นที่ร่วมโครงการ × 320 ลบ.ม./ไร่/ฤดู',
  'T-VER: ทะเบียนโครงการจำลอง ครอบคลุมภาคเกษตรและป่าไม้ โดยออกเครดิตเฉพาะสถานะ certified ตามปีที่ขึ้นทะเบียน (สูงสุด 5 ปี)',
];

const REGIONS: CarbonRegion[] = ['central', 'east', 'northeast', 'north', 'west', 'south'];

export const CARBON_PROVINCES: CarbonProvinceOption[] = [
  { code: '10', name: 'กรุงเทพมหานคร', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '11', name: 'สมุทรปราการ', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '12', name: 'นนทบุรี', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '13', name: 'ปทุมธานี', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '14', name: 'พระนครศรีอยุธยา', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '15', name: 'อ่างทอง', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '16', name: 'ลพบุรี', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '17', name: 'สิงห์บุรี', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '18', name: 'ชัยนาท', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '19', name: 'สระบุรี', region: 'central', regionLabel: CARBON_REGION_LABELS.central },
  { code: '20', name: 'ชลบุรี', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '21', name: 'ระยอง', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '22', name: 'จันทบุรี', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '23', name: 'ตราด', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '24', name: 'ฉะเชิงเทรา', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '25', name: 'ปราจีนบุรี', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '26', name: 'นครนายก', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '27', name: 'สระแก้ว', region: 'east', regionLabel: CARBON_REGION_LABELS.east },
  { code: '30', name: 'นครราชสีมา', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '31', name: 'บุรีรัมย์', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '32', name: 'สุรินทร์', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '33', name: 'ศรีสะเกษ', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '34', name: 'อุบลราชธานี', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '35', name: 'ยโสธร', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '36', name: 'ชัยภูมิ', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '37', name: 'อำนาจเจริญ', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '38', name: 'บึงกาฬ', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '39', name: 'หนองบัวลำภู', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '40', name: 'ขอนแก่น', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '41', name: 'อุดรธานี', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '42', name: 'เลย', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '43', name: 'หนองคาย', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '44', name: 'มหาสารคาม', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '45', name: 'ร้อยเอ็ด', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '46', name: 'กาฬสินธุ์', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '47', name: 'สกลนคร', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '48', name: 'นครพนม', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '49', name: 'มุกดาหาร', region: 'northeast', regionLabel: CARBON_REGION_LABELS.northeast },
  { code: '50', name: 'เชียงใหม่', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '51', name: 'ลำพูน', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '52', name: 'ลำปาง', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '53', name: 'อุตรดิตถ์', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '54', name: 'แพร่', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '55', name: 'น่าน', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '56', name: 'พะเยา', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '57', name: 'เชียงราย', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '58', name: 'แม่ฮ่องสอน', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '60', name: 'นครสวรรค์', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '61', name: 'อุทัยธานี', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '62', name: 'กำแพงเพชร', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '63', name: 'ตาก', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '64', name: 'สุโขทัย', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '65', name: 'พิษณุโลก', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '66', name: 'พิจิตร', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '67', name: 'เพชรบูรณ์', region: 'north', regionLabel: CARBON_REGION_LABELS.north },
  { code: '70', name: 'ราชบุรี', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '71', name: 'กาญจนบุรี', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '72', name: 'สุพรรณบุรี', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '73', name: 'นครปฐม', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '74', name: 'สมุทรสาคร', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '75', name: 'สมุทรสงคราม', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '76', name: 'เพชรบุรี', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '77', name: 'ประจวบคีรีขันธ์', region: 'west', regionLabel: CARBON_REGION_LABELS.west },
  { code: '80', name: 'นครศรีธรรมราช', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '81', name: 'กระบี่', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '82', name: 'พังงา', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '83', name: 'ภูเก็ต', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '84', name: 'สุราษฎร์ธานี', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '85', name: 'ระนอง', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '86', name: 'ชุมพร', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '90', name: 'สงขลา', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '91', name: 'สตูล', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '92', name: 'ตรัง', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '93', name: 'พัทลุง', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '94', name: 'ปัตตานี', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '95', name: 'ยะลา', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
  { code: '96', name: 'นราธิวาส', region: 'south', regionLabel: CARBON_REGION_LABELS.south },
];

const PROVINCE_BY_CODE = new Map(CARBON_PROVINCES.map((province) => [province.code, province]));

interface RegionProfile {
  riceShare: number;
  perennialShare: number;
  rubberShare: number;
  oilPalmShare: number;
  soilShare: number;
  awdAdoptionBase: number;
}

const REGION_PROFILES: Record<CarbonRegion, RegionProfile> = {
  central: { riceShare: 0.45, perennialShare: 0.2, rubberShare: 0.05, oilPalmShare: 0.02, soilShare: 0.28, awdAdoptionBase: 32 },
  east: { riceShare: 0.12, perennialShare: 0.28, rubberShare: 0.22, oilPalmShare: 0.1, soilShare: 0.28, awdAdoptionBase: 16 },
  northeast: { riceShare: 0.5, perennialShare: 0.12, rubberShare: 0.18, oilPalmShare: 0.02, soilShare: 0.18, awdAdoptionBase: 24 },
  north: { riceShare: 0.3, perennialShare: 0.28, rubberShare: 0.08, oilPalmShare: 0.01, soilShare: 0.33, awdAdoptionBase: 18 },
  west: { riceShare: 0.38, perennialShare: 0.2, rubberShare: 0.08, oilPalmShare: 0.05, soilShare: 0.29, awdAdoptionBase: 28 },
  south: { riceShare: 0.12, perennialShare: 0.22, rubberShare: 0.38, oilPalmShare: 0.18, soilShare: 0.1, awdAdoptionBase: 10 },
};

/** ปรับขนาดพื้นที่เกษตรให้ใกล้เคียงลักษณะจังหวัดจริง (ตัวคูณจำลอง) */
const PROVINCE_AREA_MULTIPLIERS: Record<string, number> = {
  '10': 0.05,
  '11': 0.24,
  '12': 0.14,
  '13': 0.38,
  '20': 0.72,
  '21': 0.62,
  '22': 0.72,
  '23': 0.48,
  '30': 1.9,
  '31': 1.35,
  '32': 1.4,
  '33': 1.35,
  '34': 1.75,
  '36': 1.32,
  '40': 1.4,
  '41': 1.3,
  '45': 1.45,
  '46': 1.2,
  '47': 1.2,
  '49': 0.8,
  '50': 1.3,
  '57': 1.2,
  '62': 1.22,
  '63': 1.2,
  '65': 1.2,
  '67': 1.3,
  '71': 1.35,
  '72': 1.2,
  '74': 0.22,
  '75': 0.16,
  '80': 1.45,
  '83': 0.04,
  '84': 1.5,
  '86': 1.1,
  '90': 1.3,
};

const BASE_AGRICULTURAL_RAI = 1_250_000;

interface CategoryRateProfile {
  stockPerRai: [number, number];
  sequestrationPerRai: [number, number];
  adoption: [number, number];
}

const CATEGORY_RATES: Record<CarbonCategoryId, CategoryRateProfile> = {
  perennial_tree: { stockPerRai: [34, 52], sequestrationPerRai: [0.6, 1.0], adoption: [25, 45] },
  rubber: { stockPerRai: [40, 58], sequestrationPerRai: [0.9, 1.4], adoption: [20, 40] },
  oil_palm: { stockPerRai: [26, 40], sequestrationPerRai: [0.8, 1.2], adoption: [25, 50] },
  soil: { stockPerRai: [22, 34], sequestrationPerRai: [0.2, 0.45], adoption: [15, 35] },
};

function hashCode(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(key: string): number {
  return hashCode(key) / 4_294_967_295;
}

function between(key: string, min: number, max: number): number {
  return min + seededUnit(key) * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, step = 1): number {
  return Math.round(value / step) * step;
}

function buildProvinceProfile(option: CarbonProvinceOption): ProvinceCarbonProfile {
  const prefix = `carbon:${option.code}`;
  const regionProfile = REGION_PROFILES[option.region];
  const areaMultiplier = PROVINCE_AREA_MULTIPLIERS[option.code] ?? 1;
  const sizeFactor = between(`${prefix}:size`, 0.8, 1.24);
  const cultivatedRai = roundTo(BASE_AGRICULTURAL_RAI * areaMultiplier * sizeFactor, 1000);

  const rawShares: Array<[CarbonCategoryId | 'rice', number]> = [
    ['rice', regionProfile.riceShare],
    ['perennial_tree', regionProfile.perennialShare],
    ['rubber', regionProfile.rubberShare],
    ['oil_palm', regionProfile.oilPalmShare],
    ['soil', regionProfile.soilShare],
  ];
  const jitteredShares = rawShares.map(([id, share]) => [id, share * between(`${prefix}:share:${id}`, 0.86, 1.14)] as const);
  const shareTotal = jitteredShares.reduce((total, [, share]) => total + share, 0);
  const shareByUse = new Map<string, number>(jitteredShares.map(([id, share]) => [id, share / shareTotal]));

  const categories: CarbonCategoryBreakdown[] = (Object.keys(CARBON_CATEGORY_CONFIGS) as CarbonCategoryId[]).map((id) => {
    const rate = CATEGORY_RATES[id];
    const share = shareByUse.get(id) ?? 0;
    const areaRai = roundTo(cultivatedRai * share);
    const stockPerRai = between(`${prefix}:stock:${id}`, rate.stockPerRai[0], rate.stockPerRai[1]);
    const sequestrationPerRai = between(`${prefix}:seq:${id}`, rate.sequestrationPerRai[0], rate.sequestrationPerRai[1]);
    const adoptionRate = Number(between(`${prefix}:adoption:${id}`, rate.adoption[0], rate.adoption[1]).toFixed(1));
    const sequestration = roundTo(areaRai * sequestrationPerRai);
    const creditPotential = roundTo(sequestration * (adoptionRate / 100));

    return {
      id,
      areaRai,
      carbonStockTCO2e: roundTo(areaRai * stockPerRai),
      sequestrationTCO2ePerYear: sequestration,
      creditPotentialTCO2ePerYear: creditPotential,
      creditValueThb: creditPotential * CARBON_CREDIT_PRICE_THB_PER_TCO2E,
      adoptionRate,
    };
  });

  const riceAreaRai = roundTo(cultivatedRai * (shareByUse.get('rice') ?? 0));
  const totalCategoryArea = categories.reduce((total, category) => total + category.areaRai, 0);
  const totalSequestered = categories.reduce((total, category) => total + category.sequestrationTCO2ePerYear, 0);
  const totalStock = categories.reduce((total, category) => total + category.carbonStockTCO2e, 0);
  const totalCredits = categories.reduce((total, category) => total + category.creditPotentialTCO2ePerYear, 0);
  const weightedAdoption = categories.reduce((total, category) => total + category.adoptionRate * category.areaRai, 0);
  const adoptionRate = totalCategoryArea > 0 ? Number((weightedAdoption / totalCategoryArea).toFixed(1)) : 0;

  const awdAdoptionRate = Number(
    clamp(between(`${prefix}:awd`, regionProfile.awdAdoptionBase - 6, regionProfile.awdAdoptionBase + 8), 4, 48).toFixed(1)
  );
  const awdAreaRai = riceAreaRai * (awdAdoptionRate / 100);
  const awdMethaneReductionTCO2e = roundTo(
    awdAreaRai * AWD_BASELINE_CH4_TCO2E_PER_RAI * AWD_REDUCTION_FACTOR
  );
  const awdWaterSavingM3 = roundTo(awdAreaRai * AWD_WATER_SAVING_M3_PER_RAI, 1000);

  const potentialGrade: ProvinceCarbonProfile['potentialGrade'] =
    totalSequestered >= 700_000 ? 'high' : totalSequestered >= 400_000 ? 'moderate' : 'emerging';
  const potentialGradeLabel =
    potentialGrade === 'high'
      ? 'ศักยภาพสูง'
      : potentialGrade === 'moderate'
        ? 'ศักยภาพปานกลาง'
        : 'ศักยภาพเริ่มต้น';

  return {
    provinceCode: option.code,
    provinceName: option.name,
    region: option.region,
    regionLabel: option.regionLabel,
    cultivatedRai,
    riceAreaRai,
    carbonStockTCO2e: totalStock,
    sequestrationTCO2ePerYear: totalSequestered,
    creditPotentialTCO2ePerYear: totalCredits,
    creditValueThb: totalCredits * CARBON_CREDIT_PRICE_THB_PER_TCO2E,
    adoptionRate,
    awdAdoptionRate,
    awdMethaneReductionTCO2e,
    awdWaterSavingM3,
    categories,
    potentialGrade,
    potentialGradeLabel,
  };
}

const ALL_PROVINCE_PROFILES: ProvinceCarbonProfile[] = CARBON_PROVINCES.map(buildProvinceProfile);

interface ProjectTemplate {
  name: string;
  baseReduction: number;
  sector: VerProject['sector'];
}

const PROJECT_TEMPLATES: Record<CarbonProjectType, ProjectTemplate> = {
  awd: {
    name: 'โครงการนาเปียกสลับแห้งเพื่อลดก๊าซมีเทน',
    baseReduction: 22_000,
    sector: 'agriculture',
  },
  perennial_tree: {
    name: 'โครงการสวนไม้ยืนต้นและสวนผสมผสาน',
    baseReduction: 12_000,
    sector: 'forestry',
  },
  rubber: {
    name: 'โครงการสวนยางพาราที่ยั่งยืน',
    baseReduction: 14_000,
    sector: 'agriculture',
  },
  oil_palm: {
    name: 'โครงการปาล์มน้ำมันคาร์บอนต่ำ',
    baseReduction: 10_000,
    sector: 'agriculture',
  },
  soil: {
    name: 'โครงการจัดการดินและอินทรียวัตถุในดิน',
    baseReduction: 8_000,
    sector: 'agriculture',
  },
};

const PROJECT_STATUS_LABELS: Record<VerProjectStatus, string> = {
  registered: 'ขึ้นทะเบียน',
  verified: 'ทวนสอบแล้ว',
  certified: 'ออกเครดิตแล้ว',
};

const DEVELOPER_LABELS: Record<VerDeveloperType, string> = {
  community: 'วิสาหกิจชุมชน',
  cooperative: 'สหกรณ์การเกษตร',
  private: 'ภาคเอกชน',
};

function chooseProjectType(province: ProvinceCarbonProfile, index: number): CarbonProjectType {
  const prefix = `ver:type:${province.provinceCode}:${index}`;
  const unit = seededUnit(prefix);
  const riceShare = province.cultivatedRai > 0 ? province.riceAreaRai / province.cultivatedRai : 0;
  const oilPalmAreaRai = province.categories.find((category) => category.id === 'oil_palm')?.areaRai ?? 0;
  const oilPalmShare = province.cultivatedRai > 0 ? oilPalmAreaRai / province.cultivatedRai : 0;
  const largestCategory = [...province.categories].sort((a, b) => b.areaRai - a.areaRai)[0];

  if (riceShare >= 0.35 && unit < 0.6) return 'awd';
  // ปาล์มน้ำมันไม่เคยเป็นพื้นที่ใหญ่สุดในภาคใต้ จึงกันสัดส่วนเฉพาะเพื่อให้ตัวกรองประเภทพืชมีข้อมูล
  if (oilPalmShare >= 0.12 && unit < 0.35) return 'oil_palm';
  if (unit < 0.2) return 'soil';
  return largestCategory?.id ?? 'perennial_tree';
}

function buildVerProject(province: ProvinceCarbonProfile, index: number): VerProject {
  const prefix = `ver:project:${province.provinceCode}:${index}`;
  const projectType = chooseProjectType(province, index);
  const template = PROJECT_TEMPLATES[projectType];
  const reduction = roundTo(template.baseReduction * between(`${prefix}:reduction`, 0.45, 1.75), 100);
  const statusUnit = seededUnit(`${prefix}:status`);
  const status: VerProjectStatus = statusUnit < 0.38 ? 'registered' : statusUnit < 0.68 ? 'verified' : 'certified';
  const registeredYear = 2019 + Math.floor(between(`${prefix}:year`, 0, 6.99));
  const projectAge = Math.max(0, 2026 - registeredYear);
  const issuedCredits =
    status === 'certified' ? roundTo(reduction * Math.min(projectAge, 5) * 0.85, 100) : status === 'verified' ? roundTo(reduction * 0.2, 100) : 0;
  const developerUnit = seededUnit(`${prefix}:developer`);
  const developerType: VerDeveloperType = developerUnit < 0.42 ? 'community' : developerUnit < 0.76 ? 'cooperative' : 'private';

  return {
    id: `VER-${province.provinceCode}-${String(index + 1).padStart(2, '0')}`,
    name: `${template.name} จังหวัด${province.provinceName}${index > 0 ? ' ระยะที่ 2' : ''}`,
    projectType,
    projectTypeLabel: CARBON_PROJECT_TYPE_LABELS[projectType],
    sector: template.sector,
    sectorLabel: template.sector === 'agriculture' ? 'ภาคเกษตร' : 'ภาคป่าไม้',
    provinceCode: province.provinceCode,
    provinceName: province.provinceName,
    region: province.region,
    regionLabel: province.regionLabel,
    status,
    statusLabel: PROJECT_STATUS_LABELS[status],
    registeredYear,
    annualReductionTCO2e: reduction,
    issuedCreditsTCO2e: issuedCredits,
    developerType,
    developerTypeLabel: DEVELOPER_LABELS[developerType],
  };
}

function buildAllVerProjects(): VerProject[] {
  const rankedProvinces = [...ALL_PROVINCE_PROFILES].sort(
    (a, b) => b.sequestrationTCO2ePerYear - a.sequestrationTCO2ePerYear
  );
  const projects: VerProject[] = [];
  const coveredRegions = new Set<CarbonRegion>();

  for (const province of rankedProvinces) {
    const seed = seededUnit(`ver:host:${province.provinceCode}`);
    if (seed < 0.38) continue;
    const projectCount = seed > 0.8 ? 2 : 1;
    for (let index = 0; index < projectCount; index += 1) {
      projects.push(buildVerProject(province, index));
    }
    coveredRegions.add(province.region);
  }

  for (const region of REGIONS) {
    if (coveredRegions.has(region)) continue;
    const fallback = rankedProvinces.find((province) => province.region === region);
    if (fallback) projects.push(buildVerProject(fallback, 0));
  }

  return projects.sort((a, b) => b.annualReductionTCO2e - a.annualReductionTCO2e);
}

const ALL_VER_PROJECTS: VerProject[] = buildAllVerProjects();

function summarizeProjects(projects: VerProject[]): VerSummary {
  return projects.reduce<VerSummary>(
    (summary, project) => {
      summary.projectCount += 1;
      summary.annualReductionTCO2e += project.annualReductionTCO2e;
      summary.issuedCreditsTCO2e += project.issuedCreditsTCO2e;
      if (project.status === 'registered') summary.registeredCount += 1;
      if (project.status === 'verified') summary.verifiedCount += 1;
      if (project.status === 'certified') summary.certifiedCount += 1;
      return summary;
    },
    {
      projectCount: 0,
      registeredCount: 0,
      verifiedCount: 0,
      certifiedCount: 0,
      annualReductionTCO2e: 0,
      issuedCreditsTCO2e: 0,
    }
  );
}

function summarizeScope(provinces: ProvinceCarbonProfile[]): CarbonScopeSummary {
  const totals = provinces.reduce(
    (summary, province) => {
      summary.cultivatedRai += province.cultivatedRai;
      summary.riceAreaRai += province.riceAreaRai;
      summary.carbonStockTCO2e += province.carbonStockTCO2e;
      summary.sequestrationTCO2ePerYear += province.sequestrationTCO2ePerYear;
      summary.creditPotentialTCO2ePerYear += province.creditPotentialTCO2ePerYear;
      summary.creditValueThb += province.creditValueThb;
      summary.adoptionWeighted += province.adoptionRate * province.cultivatedRai;
      summary.awdAdoptionWeighted += province.awdAdoptionRate * province.riceAreaRai;
      summary.awdMethaneReductionTCO2e += province.awdMethaneReductionTCO2e;
      summary.awdWaterSavingM3 += province.awdWaterSavingM3;
      return summary;
    },
    {
      cultivatedRai: 0,
      riceAreaRai: 0,
      carbonStockTCO2e: 0,
      sequestrationTCO2ePerYear: 0,
      creditPotentialTCO2ePerYear: 0,
      creditValueThb: 0,
      adoptionWeighted: 0,
      awdAdoptionWeighted: 0,
      awdMethaneReductionTCO2e: 0,
      awdWaterSavingM3: 0,
    }
  );

  return {
    provinceCount: provinces.length,
    cultivatedRai: totals.cultivatedRai,
    riceAreaRai: totals.riceAreaRai,
    carbonStockTCO2e: totals.carbonStockTCO2e,
    sequestrationTCO2ePerYear: totals.sequestrationTCO2ePerYear,
    creditPotentialTCO2ePerYear: totals.creditPotentialTCO2ePerYear,
    creditValueThb: totals.creditValueThb,
    adoptionRate: totals.cultivatedRai > 0 ? Number((totals.adoptionWeighted / totals.cultivatedRai).toFixed(1)) : 0,
    awdAdoptionRate: totals.riceAreaRai > 0 ? Number((totals.awdAdoptionWeighted / totals.riceAreaRai).toFixed(1)) : 0,
    awdMethaneReductionTCO2e: totals.awdMethaneReductionTCO2e,
    awdWaterSavingM3: totals.awdWaterSavingM3,
  };
}

function summarizeCategories(provinces: ProvinceCarbonProfile[]): CarbonCategorySummary[] {
  const totalSequestration = provinces.reduce((total, province) => total + province.sequestrationTCO2ePerYear, 0);

  return (Object.keys(CARBON_CATEGORY_CONFIGS) as CarbonCategoryId[]).map((id) => {
    const config = CARBON_CATEGORY_CONFIGS[id];
    const totals = provinces.reduce(
      (summary, province) => {
        const category = province.categories.find((entry) => entry.id === id);
        if (!category) return summary;
        summary.areaRai += category.areaRai;
        summary.carbonStockTCO2e += category.carbonStockTCO2e;
        summary.sequestrationTCO2ePerYear += category.sequestrationTCO2ePerYear;
        summary.creditPotentialTCO2ePerYear += category.creditPotentialTCO2ePerYear;
        summary.creditValueThb += category.creditValueThb;
        summary.adoptionWeighted += category.adoptionRate * category.areaRai;
        return summary;
      },
      {
        areaRai: 0,
        carbonStockTCO2e: 0,
        sequestrationTCO2ePerYear: 0,
        creditPotentialTCO2ePerYear: 0,
        creditValueThb: 0,
        adoptionWeighted: 0,
      }
    );

    return {
      ...config,
      areaRai: totals.areaRai,
      carbonStockTCO2e: totals.carbonStockTCO2e,
      sequestrationTCO2ePerYear: totals.sequestrationTCO2ePerYear,
      creditPotentialTCO2ePerYear: totals.creditPotentialTCO2ePerYear,
      creditValueThb: totals.creditValueThb,
      adoptionRate: totals.areaRai > 0 ? Number((totals.adoptionWeighted / totals.areaRai).toFixed(1)) : 0,
      shareOfSequestration:
        totalSequestration > 0 ? Number(((totals.sequestrationTCO2ePerYear / totalSequestration) * 100).toFixed(1)) : 0,
    };
  });
}

const NATIONAL_SCOPE_SUMMARY = summarizeScope(ALL_PROVINCE_PROFILES);
const NATIONAL_VER_SUMMARY = summarizeProjects(ALL_VER_PROJECTS);
const NATIONAL_SUMMARY: CarbonNationalSummary = { ...NATIONAL_SCOPE_SUMMARY, ...NATIONAL_VER_SUMMARY };
const AWD_TOP_PROVINCES = [...ALL_PROVINCE_PROFILES]
  .sort((a, b) => b.awdMethaneReductionTCO2e - a.awdMethaneReductionTCO2e)
  .slice(0, 8);

export function buildCarbonDashboard(filters: CarbonFilterOptions = {}): CarbonDashboardPayload {
  const requestedProvince = typeof filters.provinceCode === 'string' ? filters.provinceCode.trim() : '';
  const provinceCode =
    requestedProvince && requestedProvince !== 'all' && PROVINCE_BY_CODE.has(requestedProvince) ? requestedProvince : null;
  const normalizedProjectType = normalizeCarbonProjectType(
    typeof filters.projectType === 'string' ? filters.projectType : null
  );
  const projectType: CarbonProjectFilter = normalizedProjectType ?? 'all';

  const scopedProvinces = provinceCode
    ? ALL_PROVINCE_PROFILES.filter((province) => province.provinceCode === provinceCode)
    : ALL_PROVINCE_PROFILES;
  const selectedProvince = provinceCode
    ? scopedProvinces[0] ?? null
    : null;
  const projects = ALL_VER_PROJECTS.filter((project) => {
    const matchesProvince = !provinceCode || project.provinceCode === provinceCode;
    const matchesType = projectType === 'all' || project.projectType === projectType;
    return matchesProvince && matchesType;
  });

  const scopeLabel = selectedProvince
    ? `${selectedProvince.provinceName} (${selectedProvince.regionLabel})`
    : 'ภาพรวมประเทศไทย';

  return {
    sample: CARBON_SAMPLE_MODE,
    dataAsOf: CARBON_DATA_AS_OF,
    generatedAt: new Date().toISOString(),
    filters: { provinceCode, projectType },
    scopeLabel,
    nationalSummary: NATIONAL_SUMMARY,
    scopedSummary: summarizeScope(scopedProvinces),
    categories: summarizeCategories(scopedProvinces),
    provinces: [...scopedProvinces].sort(
      (a, b) => b.sequestrationTCO2ePerYear - a.sequestrationTCO2ePerYear
    ),
    selectedProvince,
    awdTopProvinces: AWD_TOP_PROVINCES,
    projects,
    verSummary: summarizeProjects(projects),
    allProvinces: CARBON_PROVINCES,
    sources: CARBON_SOURCES,
    warnings: CARBON_WARNINGS,
    methodNotes: CARBON_METHOD_NOTES,
  };
}
