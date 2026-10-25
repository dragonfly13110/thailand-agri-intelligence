/**
 * ข้อมูลการเงินเกษตรกร ประกันภัยพืชผล และสินเชื่อรายจังหวัด
 * สำหรับหน้า /finance และ /api/v1/finance
 *
 * ตัวเลขทั้งหมดเป็น Deterministic Sample ที่สังเคราะห์จากกรอบโครงการจริง
 * (เบี้ยประกันภัยข้าวนาปี/ข้าวโพดเลี้ยงสัตว์, โครงสร้างสินเชื่อ ธ.ก.ส.
 * และกองทุนหมุนเวียนเพื่อการกู้ยืมแก่เกษตรกร) แต่ไม่ใช่สถิติราชการรายจังหวัด
 * จึงต้องแสดง sample: true และ meta.access = 'metadata_only' เสมอ
 */

export const FINANCE_SAMPLE_MODE = true;
export const FINANCE_DATA_VERSION = 'finance-insurance-credit-sample-v1';
export const FINANCE_AS_OF_DATE = '2026-10-25';

export const FINANCE_PERIOD = {
  label: 'ปีเพาะปลูก 2568/69',
  startDate: '2025-11-01',
  endDate: '2026-10-31',
  note: 'ช่วงอ้างอิงของแบบจำลอง ครอบคลุมรอบเพาะปลูกข้าวนาปีและข้าวโพดเลี้ยงสัตว์',
};

export const FINANCE_WARNINGS = [
  'ตัวเลขทุกค่าบนหน้านี้เป็นข้อมูลจำลองเชิงโครงสร้าง (Deterministic Sample) ไม่ใช่สถิติราชการ และห้ามใช้ยืนยันสิทธิ์หรือประกอบการอนุมัติสินเชื่อ',
  'โครงสร้างเบี้ยและความคุ้มครองอ้างอิงกรอบโครงการประกันภัยพืชผลของรัฐ แต่พื้นที่ จำนวนครัวเรือน ค่าสินไหม และค่าสินเชื่อรายจังหวัดถูกสังเคราะห์ขึ้น',
  'พื้นที่เข้าร่วมโครงการไม่ครอบคลุมทั้ง 77 จังหวัด; จังหวัดที่ไม่มีรายการหมายถึงไม่มีหลักฐานในแบบจำลอง ไม่ได้หมายความว่าพื้นที่เพาะปลูกเป็นศูนย์',
  'ยอดสินเชื่อและหนี้ค้างเป็นค่าประมาณระดับจังหวัด ไม่ใช่ข้อมูลรายบัญชี และผู้กู้ ธ.ก.ส. กับกองทุนหมุนเวียนอาจซ้ำซ้อนกัน จึงห้ามนำจำนวนผู้กู้สองระบบมาบวกกันเป็นจำนวนเกษตรกรทั้งหมด',
  'Claim Ratio คำนวณจากค่าสินไหมที่จ่าย ÷ เบี้ยประกันรวม (เงินอุดหนุนรัฐ + เบี้ยเกษตรกร) และเป็นผลของแบบจำลอง ไม่ใช่ผลการจ่ายค่าสินไหมจริง',
];

export type InsuranceProgramId = 'rice_annual' | 'feed_corn';
export type ProgramFilter = 'all' | InsuranceProgramId;
export type DisasterType = 'flood' | 'drought' | 'pest';
export type CoverageTier = 'tier1' | 'tier2';
export type RegionId = 'north' | 'northeast' | 'central' | 'east' | 'west' | 'south';
export type RiskGrade = 'low' | 'moderate' | 'elevated' | 'high';
export type AccessGrade = 'high' | 'moderate' | 'low';
export type PayoutBand = 'below_normal' | 'normal' | 'elevated' | 'critical';

export const FINANCE_REGIONS: Array<{ id: RegionId; label: string; shortLabel: string }> = [
  { id: 'north', label: 'ภาคเหนือ', shortLabel: 'เหนือ' },
  { id: 'northeast', label: 'ภาคตะวันออกเฉียงเหนือ', shortLabel: 'อีสาน' },
  { id: 'central', label: 'ภาคกลาง', shortLabel: 'กลาง' },
  { id: 'east', label: 'ภาคตะวันออก', shortLabel: 'ตะวันออก' },
  { id: 'west', label: 'ภาคตะวันตก', shortLabel: 'ตะวันตก' },
  { id: 'south', label: 'ภาคใต้', shortLabel: 'ใต้' },
];

export const FINANCE_REGION_LABEL = Object.fromEntries(
  FINANCE_REGIONS.map((region) => [region.id, region.label]),
) as Record<RegionId, string>;

export type ProvinceRef = {
  code: string;
  name: string;
  regionId: RegionId;
  region: string;
};

function province(code: string, name: string, regionId: RegionId): ProvinceRef {
  return { code, name, regionId, region: FINANCE_REGION_LABEL[regionId] };
}

// รหัสจังหวัดมาตรฐาน 77 จังหวัด ใช้ตรวจ query และจัดกลุ่มภูมิภาค
export const FINANCE_PROVINCES: ProvinceRef[] = [
  province('10', 'กรุงเทพมหานคร', 'central'),
  province('11', 'สมุทรปราการ', 'central'),
  province('12', 'นนทบุรี', 'central'),
  province('13', 'ปทุมธานี', 'central'),
  province('14', 'พระนครศรีอยุธยา', 'central'),
  province('15', 'อ่างทอง', 'central'),
  province('16', 'ลพบุรี', 'central'),
  province('17', 'สิงห์บุรี', 'central'),
  province('18', 'ชัยนาท', 'central'),
  province('19', 'สระบุรี', 'central'),
  province('20', 'ชลบุรี', 'east'),
  province('21', 'ระยอง', 'east'),
  province('22', 'จันทบุรี', 'east'),
  province('23', 'ตราด', 'east'),
  province('24', 'ฉะเชิงเทรา', 'east'),
  province('25', 'ปราจีนบุรี', 'east'),
  province('26', 'นครนายก', 'east'),
  province('27', 'สระแก้ว', 'east'),
  province('30', 'นครราชสีมา', 'northeast'),
  province('31', 'บุรีรัมย์', 'northeast'),
  province('32', 'สุรินทร์', 'northeast'),
  province('33', 'ศรีสะเกษ', 'northeast'),
  province('34', 'อุบลราชธานี', 'northeast'),
  province('35', 'ยโสธร', 'northeast'),
  province('36', 'ชัยภูมิ', 'northeast'),
  province('37', 'อำนาจเจริญ', 'northeast'),
  province('38', 'บึงกาฬ', 'northeast'),
  province('39', 'หนองบัวลำภู', 'northeast'),
  province('40', 'ขอนแก่น', 'northeast'),
  province('41', 'อุดรธานี', 'northeast'),
  province('42', 'เลย', 'northeast'),
  province('43', 'หนองคาย', 'northeast'),
  province('44', 'มหาสารคาม', 'northeast'),
  province('45', 'ร้อยเอ็ด', 'northeast'),
  province('46', 'กาฬสินธุ์', 'northeast'),
  province('47', 'สกลนคร', 'northeast'),
  province('48', 'นครพนม', 'northeast'),
  province('49', 'มุกดาหาร', 'northeast'),
  province('50', 'เชียงใหม่', 'north'),
  province('51', 'ลำพูน', 'north'),
  province('52', 'ลำปาง', 'north'),
  province('53', 'อุตรดิตถ์', 'north'),
  province('54', 'แพร่', 'north'),
  province('55', 'น่าน', 'north'),
  province('56', 'พะเยา', 'north'),
  province('57', 'เชียงราย', 'north'),
  province('58', 'แม่ฮ่องสอน', 'north'),
  province('60', 'นครสวรรค์', 'north'),
  province('61', 'อุทัยธานี', 'north'),
  province('62', 'กำแพงเพชร', 'north'),
  province('63', 'ตาก', 'north'),
  province('64', 'สุโขทัย', 'north'),
  province('65', 'พิษณุโลก', 'north'),
  province('66', 'พิจิตร', 'north'),
  province('67', 'เพชรบูรณ์', 'north'),
  province('70', 'ราชบุรี', 'west'),
  province('71', 'กาญจนบุรี', 'west'),
  province('72', 'สุพรรณบุรี', 'west'),
  province('73', 'นครปฐม', 'west'),
  province('74', 'สมุทรสาคร', 'west'),
  province('75', 'สมุทรสงคราม', 'west'),
  province('76', 'เพชรบุรี', 'west'),
  province('77', 'ประจวบคีรีขันธ์', 'west'),
  province('80', 'นครศรีธรรมราช', 'south'),
  province('81', 'กระบี่', 'south'),
  province('82', 'พังงา', 'south'),
  province('83', 'ภูเก็ต', 'south'),
  province('84', 'สุราษฎร์ธานี', 'south'),
  province('85', 'ระนอง', 'south'),
  province('86', 'ชุมพร', 'south'),
  province('90', 'สงขลา', 'south'),
  province('91', 'สตูล', 'south'),
  province('92', 'ตรัง', 'south'),
  province('93', 'พัทลุง', 'south'),
  province('94', 'ปัตตานี', 'south'),
  province('95', 'ยะลา', 'south'),
  province('96', 'นราธิวาส', 'south'),
];

export const FINANCE_PROVINCE_MAP = new Map(FINANCE_PROVINCES.map((item) => [item.code, item]));

export type InsuranceTierPlan = {
  tier: CoverageTier;
  tierLabel: string;
  premiumPerRai: number;
  governmentSubsidyPerRai: number;
  farmerPremiumPerRai: number;
  coveragePerRai: number;
  coverageRole: 'base' | 'additional';
  note: string;
};

export type InsuranceProgram = {
  id: InsuranceProgramId;
  label: string;
  shortLabel: string;
  englishLabel: string;
  cropName: string;
  operator: string;
  supportAgency: string;
  description: string;
  targetAreaRai: number;
  tier2ShareBase: number;
  plans: InsuranceTierPlan[];
  keyFacts: string[];
  groundingNote: string;
};

export const INSURANCE_PROGRAMS: InsuranceProgram[] = [
  {
    id: 'rice_annual',
    label: 'โครงการประกันภัยข้าวนาปี',
    shortLabel: 'ข้าวนาปี',
    englishLabel: 'Annual Rice Insurance',
    cropName: 'ข้าวนาปี',
    operator: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
    supportAgency: 'กรมส่งเสริมการเกษตร กระทรวงการคลัง และสำนักงาน คปภ.',
    description:
      'ประกันภัยพืชผลแบบสมัครใจสำหรับข้าวนาปี คุ้มครองความเสียหายจากภัยธรรมชาติและศัตรูพืช โดยรัฐอุดหนุนเบี้ยประกันภัยส่วนใหญ่ และมีชั้นความคุ้มครองเพิ่มเติมให้เกษตรกรเลือกซื้อ',
    targetAreaRai: 21_000_000,
    tier2ShareBase: 0.027,
    plans: [
      {
        tier: 'tier1',
        tierLabel: 'Tier 1 · รัฐอุดหนุนหลัก',
        premiumPerRai: 115,
        governmentSubsidyPerRai: 69,
        farmerPremiumPerRai: 46,
        coveragePerRai: 1_190,
        coverageRole: 'base',
        note: 'เบี้ยรวม 115 บาท/ไร่ รัฐอุดหนุน 69 บาท เกษตรกรจ่าย 46 บาท',
      },
      {
        tier: 'tier2',
        tierLabel: 'Tier 2 · เกษตรกรจ่ายเพิ่ม',
        premiumPerRai: 63,
        governmentSubsidyPerRai: 0,
        farmerPremiumPerRai: 63,
        coveragePerRai: 240,
        coverageRole: 'additional',
        note: 'ความคุ้มครองเพิ่มเติม 240 บาท/ไร่ เบี้ยตามความเสี่ยง 27–110 บาท/ไร่',
      },
    ],
    keyFacts: [
      'ความคุ้มครองพื้นฐาน 1,190 บาท/ไร่ ครอบคลุมน้ำท่วม ฝนแล้ง และศัตรูพืช',
      'เบี้ย Tier 1 115 บาท/ไร่ รัฐอุดหนุน 69 บาท เกษตรกรจ่าย 46 บาท',
      'Tier 2 เพิ่มความคุ้มครอง 240 บาท/ไร่ ด้วยเบี้ยตามระดับความเสี่ยง',
      'เป้าหมายพื้นที่เข้าร่วมโครงการประมาณ 21 ล้านไร่',
    ],
    groundingNote: 'โครงสร้างเบี้ยและความคุ้มครองอ้างอิงกรอบโครงการปี 2567 และถูกปรับเป็นค่าจำลองสำหรับปีเพาะปลูก 2568/69',
  },
  {
    id: 'feed_corn',
    label: 'โครงการประกันภัยข้าวโพดเลี้ยงสัตว์',
    shortLabel: 'ข้าวโพดเลี้ยงสัตว์',
    englishLabel: 'Feed Corn Insurance',
    cropName: 'ข้าวโพดเลี้ยงสัตว์',
    operator: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
    supportAgency: 'กรมส่งเสริมการเกษตร กระทรวงพาณิชย์ และสำนักงาน คปภ.',
    description:
      'ประกันภัยพืชผลสำหรับข้าวโพดเลี้ยงสัตว์ คุ้มครองความเสียหายจากภัยธรรมชาติและศัตรูพืช โดยรัฐสนับสนุนเบี้ยประกันภัยบางส่วน และมีแผนความคุ้มครองเพิ่มเติมสำหรับเกษตรกรที่ต้องการความคุ้มครองสูงขึ้น',
    targetAreaRai: 2_000_000,
    tier2ShareBase: 0.064,
    plans: [
      {
        tier: 'tier1',
        tierLabel: 'Tier 1 · รัฐอุดหนุนหลัก',
        premiumPerRai: 120,
        governmentSubsidyPerRai: 96,
        farmerPremiumPerRai: 24,
        coveragePerRai: 870,
        coverageRole: 'base',
        note: 'รัฐสนับสนุนเบี้ยประมาณ 96 บาท/ไร่ เกษตรกรจ่าย 24 บาท',
      },
      {
        tier: 'tier2',
        tierLabel: 'Tier 2 · เกษตรกรจ่ายเพิ่ม',
        premiumPerRai: 92,
        governmentSubsidyPerRai: 0,
        farmerPremiumPerRai: 92,
        coveragePerRai: 450,
        coverageRole: 'additional',
        note: 'ความคุ้มครองเพิ่มเติม 450 บาท/ไร่ เกษตรกรรับภาระเบี้ยทั้งหมด',
      },
    ],
    keyFacts: [
      'ความคุ้มครองพื้นฐาน 870 บาท/ไร่ ครอบคลุมภัยธรรมชาติและศัตรูพืช',
      'รัฐสนับสนุนเบี้ยประกันภัยประมาณ 96 บาท/ไร่',
      'Tier 2 เพิ่มความคุ้มครอง 450 บาท/ไร่ เกษตรกรจ่ายเบี้ยเองทั้งหมด',
      'เป้าหมายพื้นที่เข้าร่วมโครงการประมาณ 2 ล้านไร่',
    ],
    groundingNote: 'ตัวเลขเบี้ยและความคุ้มครองเป็นค่ากลางเชิงนโยบายที่ใช้สาธิตแบบจำลอง ไม่ใช่ประกาศรับสมัครของปีปัจจุบัน',
  },
];

export type CoveragePlan = InsuranceTierPlan & {
  programId: InsuranceProgramId;
  programLabel: string;
  programShortLabel: string;
  cropName: string;
  isGovernmentSubsidized: boolean;
};

export const COVERAGE_PLANS: CoveragePlan[] = INSURANCE_PROGRAMS.flatMap((program) =>
  program.plans.map((plan) => ({
    ...plan,
    programId: program.id,
    programLabel: program.label,
    programShortLabel: program.shortLabel,
    cropName: program.cropName,
    isGovernmentSubsidized: plan.tier === 'tier1',
  })),
);

export type DisasterConfig = {
  type: DisasterType;
  label: string;
  shortLabel: string;
  color: string;
  softColor: string;
  description: string;
};

export const DISASTER_TYPES: DisasterType[] = ['flood', 'drought', 'pest'];

export const DISASTER_CONFIG: Record<DisasterType, DisasterConfig> = {
  flood: {
    type: 'flood',
    label: 'น้ำท่วม',
    shortLabel: 'ท่วม',
    color: '#4f7f8d',
    softColor: '#e3eef0',
    description: 'น้ำท่วมฉับพลัน น้ำป่าไหลหลาก และน้ำท่วมขังในพื้นที่เพาะปลูก',
  },
  drought: {
    type: 'drought',
    label: 'ฝนแล้ง',
    shortLabel: 'แล้ง',
    color: '#bf9639',
    softColor: '#f7efd9',
    description: 'ฝนทิ้งช่วง ภัยแล้ง และความเครียดน้ำช่วงวิกฤตการเจริญเติบโต',
  },
  pest: {
    type: 'pest',
    label: 'ศัตรูพืช',
    shortLabel: 'ศัตรูพืช',
    color: '#7b8f45',
    softColor: '#edf1de',
    description: 'โรคและแมลงศัตรูพืชระบาด เช่น เพลี้ยกระโดดสีน้ำตาลและหนอนกระทู้ข้าวโพด',
  },
};

export const RISK_GRADE_CONFIG: Record<RiskGrade, { label: string; description: string }> = {
  low: { label: 'ต่ำ', description: 'ความเสี่ยงโดยรวมต่ำเมื่อเทียบกับค่าฐานของแบบจำลอง' },
  moderate: { label: 'ปานกลาง', description: 'ความเสี่ยงอยู่ในกรอบปกติ แต่ควรติดตามภัยหลักในพื้นที่' },
  elevated: { label: 'สูง', description: 'ความเสี่ยงสูงกว่าค่าฐาน ควรเตรียมมาตรการป้องกันและติดตามสถานการณ์' },
  high: { label: 'สูงมาก', description: 'ความเสี่ยงสูงมากในแบบจำลอง ควรเร่งประสานมาตรการชดเชยและป้องกัน' },
};

export const ACCESS_GRADE_CONFIG: Record<AccessGrade, { label: string; description: string }> = {
  high: { label: 'เข้าถึงสูง', description: 'สัดส่วนครัวเรือนที่เข้าถึงสินเชื่อในระบบสูงและหนี้นอกระบบต่ำ' },
  moderate: { label: 'ปานกลาง', description: 'การเข้าถึงสินเชื่อในระบบอยู่ในระดับกลาง ยังมีช่องว่างบางส่วน' },
  low: { label: 'จำกัด', description: 'การเข้าถึงสินเชื่อในระบบจำกัดและมีสัดส่วนหนี้นอกระบบสูง' },
};

export type PayoutBandConfig = {
  id: PayoutBand;
  label: string;
  minPct: number;
  maxPct: number | null;
  description: string;
};

export const PAYOUT_BANDS: PayoutBandConfig[] = [
  { id: 'below_normal', label: 'ต่ำกว่าปกติ', minPct: 0, maxPct: 70, description: 'ค่าสินไหมต่ำกว่า 70% ของเบี้ยรวม' },
  { id: 'normal', label: 'ปกติ', minPct: 70, maxPct: 95, description: 'ค่าสินไหมตั้งแต่ 70% ถึงต่ำกว่า 95% ของเบี้ยรวม' },
  { id: 'elevated', label: 'สูง', minPct: 95, maxPct: 120, description: 'ค่าสินไหมตั้งแต่ 95% ถึงต่ำกว่า 120% ของเบี้ยรวม' },
  { id: 'critical', label: 'สูงมาก', minPct: 120, maxPct: null, description: 'ค่าสินไหมตั้งแต่ 120% ขึ้นไปของเบี้ยรวม' },
];

export function getPayoutBand(claimRatioPct: number): PayoutBandConfig {
  return PAYOUT_BANDS.find((band) => band.maxPct === null || claimRatioPct < band.maxPct) ?? PAYOUT_BANDS[PAYOUT_BANDS.length - 1];
}

function getRiskGrade(score: number): RiskGrade {
  if (score < 55) return 'low';
  if (score < 70) return 'moderate';
  if (score < 82) return 'elevated';
  return 'high';
}

function getAccessGrade(index: number): AccessGrade {
  if (index >= 62) return 'high';
  if (index >= 48) return 'moderate';
  return 'low';
}

function getDebtGrade(index: number): RiskGrade {
  if (index < 42) return 'low';
  if (index < 58) return 'moderate';
  if (index < 72) return 'elevated';
  return 'high';
}

export type DisasterSplitItem = {
  type: DisasterType;
  label: string;
  color: string;
  claimsPaidBaht: number;
  sharePct: number;
  dominantProvinceCount: number;
};

export type DisasterSplit = {
  totalClaimsBaht: number;
  dominantType: DisasterType | null;
  dominantLabel: string;
  items: DisasterSplitItem[];
};

export type FinanceSummary = {
  recordCount: number;
  provinceCount: number;
  programCount: number;
  insuredAreaRai: number;
  tier1AreaRai: number;
  tier2AreaRai: number;
  tier2SharePct: number;
  insuredHouseholds: number;
  grossPremiumBaht: number;
  governmentSubsidyBaht: number;
  farmerPremiumBaht: number;
  subsidySharePct: number;
  coverageLiabilityBaht: number;
  claimsPaidBaht: number;
  claimRatioPct: number;
  averageCoveragePerRai: number;
  averagePremiumPerRai: number;
  averageFarmerPremiumPerRai: number;
  disasterSplit: DisasterSplit;
  riskScore: number;
  riskGrade: RiskGrade | null;
  riskGradeLabel: string;
  dominantDisaster: DisasterType | null;
  dominantDisasterLabel: string;
  highestClaimProvince: { provinceCode: string; provinceName: string; claimRatioPct: number } | null;
};

export type ProvinceFinanceRecord = {
  id: string;
  provinceCode: string;
  provinceName: string;
  regionId: RegionId;
  region: string;
  programId: InsuranceProgramId;
  programLabel: string;
  programShortLabel: string;
  cropName: string;
  tier1AreaRai: number;
  tier2AreaRai: number;
  insuredAreaRai: number;
  insuredHouseholds: number;
  tier2SharePct: number;
  grossPremiumBaht: number;
  governmentSubsidyBaht: number;
  farmerPremiumBaht: number;
  coverageLiabilityBaht: number;
  averageCoveragePerRai: number;
  averagePremiumPerRai: number;
  claimsPaidBaht: number;
  claimRatioPct: number;
  disasterClaims: Record<DisasterType, number>;
  disasterShares: Record<DisasterType, number>;
  dominantDisaster: DisasterType;
  dominantDisasterLabel: string;
  riskScore: number;
  riskGrade: RiskGrade;
  riskGradeLabel: string;
  payoutBand: PayoutBand;
  payoutBandLabel: string;
  provinceRiskRank: number;
  note: string;
  sample: true;
  asOfDate: string;
};

export type RegionFinanceSummary = FinanceSummary & {
  regionId: RegionId;
  regionLabel: string;
  payoutBand: PayoutBand;
  payoutBandLabel: string;
};

export type ProvinceCreditRecord = {
  provinceCode: string;
  provinceName: string;
  regionId: RegionId;
  region: string;
  farmingHouseholds: number;
  baacBorrowerHouseholds: number;
  baacCoveragePct: number;
  baacOutstandingMillionThb: number;
  averageBaacLoanThb: number;
  baacNplPct: number;
  revolvingFundBorrowerHouseholds: number;
  revolvingFundCoveragePct: number;
  revolvingFundOutstandingMillionThb: number;
  averageRevolvingFundLoanThb: number;
  debtToIncomePct: number;
  informalDebtSharePct: number;
  creditAccessIndex: number;
  creditAccessGrade: AccessGrade;
  creditAccessGradeLabel: string;
  debtBurdenIndex: number;
  debtBurdenGrade: RiskGrade;
  debtBurdenGradeLabel: string;
  note: string;
  sample: true;
  asOfDate: string;
};

export type CreditSummary = {
  provinceCount: number;
  farmingHouseholds: number;
  baacBorrowerHouseholds: number;
  baacCoveragePct: number;
  baacOutstandingMillionThb: number;
  baacNplPct: number;
  averageBaacLoanThb: number;
  revolvingFundBorrowerHouseholds: number;
  revolvingFundCoveragePct: number;
  revolvingFundOutstandingMillionThb: number;
  averageRevolvingFundLoanThb: number;
  debtToIncomePct: number;
  informalDebtSharePct: number;
  creditAccessIndex: number;
  creditAccessGrade: AccessGrade;
  creditAccessGradeLabel: string;
  debtBurdenIndex: number;
  debtBurdenGrade: RiskGrade;
  debtBurdenGradeLabel: string;
  highestDebtBurden: { provinceCode: string; provinceName: string; index: number } | null;
  lowestCreditAccess: { provinceCode: string; provinceName: string; index: number } | null;
};

export type RegionCreditSummary = CreditSummary & {
  regionId: RegionId;
  regionLabel: string;
};

export type ProgramRollup = {
  programId: InsuranceProgramId;
  label: string;
  shortLabel: string;
  targetAreaRai: number;
  coveragePerRai: number;
  summary: FinanceSummary;
};

export type FinanceSource = {
  id: string;
  name: string;
  agency: string;
  role: string;
  sourceUrl: string;
  access: 'metadata_only';
  verifiedAt: string;
};

export type FinanceFilters = {
  provinceCode?: string | null;
  program?: ProgramFilter;
};

export type PayoutModel = {
  title: string;
  formula: string;
  basis: string;
  bands: PayoutBandConfig[];
  assumptions: string[];
};

export type CreditDefinition = {
  debtBurdenFormula: string;
  creditAccessFormula: string;
  scaleNote: string;
  overlapNote: string;
};

export type FinanceDashboardPayload = {
  sample: true;
  dataVersion: string;
  asOfDate: string;
  period: typeof FINANCE_PERIOD;
  filters: { provinceCode: string | null; program: ProgramFilter };
  provinces: ProvinceRef[];
  programs: InsuranceProgram[];
  coveragePlans: CoveragePlan[];
  records: ProvinceFinanceRecord[];
  nationalSummary: FinanceSummary;
  summary: FinanceSummary;
  programSummaries: ProgramRollup[];
  disasterSplit: DisasterSplit;
  regionBreakdown: RegionFinanceSummary[];
  payoutModel: PayoutModel;
  creditRecords: ProvinceCreditRecord[];
  creditSummary: CreditSummary;
  selectedCredit: ProvinceCreditRecord | null;
  creditRegionBreakdown: RegionCreditSummary[];
  creditDefinition: CreditDefinition;
  sources: FinanceSource[];
  warnings: string[];
};

export const FINANCE_SOURCES: FinanceSource[] = [
  {
    id: 'baac',
    name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
    agency: 'ธ.ก.ส.',
    role: 'กรอบสินเชื่อเพื่อการเกษตร ยอดคงค้าง หนี้ที่ไม่ก่อให้เกิดรายได้ และจำนวนผู้กู้',
    sourceUrl: 'https://www.baac.or.th',
    access: 'metadata_only',
    verifiedAt: FINANCE_AS_OF_DATE,
  },
  {
    id: 'doae',
    name: 'กรมส่งเสริมการเกษตร',
    agency: 'กรมส่งเสริมการเกษตร',
    role: 'ทะเบียนเกษตรกร พื้นที่เพาะปลูก และกรอบการขึ้นทะเบียนผู้เข้าร่วมโครงการประกันภัยพืชผล',
    sourceUrl: 'https://www.doae.go.th',
    access: 'metadata_only',
    verifiedAt: FINANCE_AS_OF_DATE,
  },
  {
    id: 'oae',
    name: 'สำนักงานเศรษฐกิจการเกษตร',
    agency: 'สศก.',
    role: 'สถิติพื้นที่เพาะปลูกและผลผลิตข้าวนาปี/ข้าวโพดเลี้ยงสัตว์สำหรับ Calibrate แบบจำลอง',
    sourceUrl: 'https://www.oae.go.th',
    access: 'metadata_only',
    verifiedAt: FINANCE_AS_OF_DATE,
  },
  {
    id: 'opsmoac',
    name: 'กองทุนหมุนเวียนเพื่อการกู้ยืมแก่เกษตรกรและผู้ยากจน',
    agency: 'สำนักงานปลัดกระทรวงเกษตรและสหกรณ์ (OPSMOAC)',
    role: 'กรอบวงเงิน กลุ่มเป้าหมาย และหลักเกณฑ์สินเชื่อของกองทุนหมุนเวียน',
    sourceUrl: 'https://datacatalog.opsmoac.go.th',
    access: 'metadata_only',
    verifiedAt: FINANCE_AS_OF_DATE,
  },
  {
    id: 'moac',
    name: 'กระทรวงเกษตรและสหกรณ์',
    agency: 'กษ.',
    role: 'นโยบายและกรอบงบประมาณอุดหนุนเบี้ยประกันภัยพืชผล',
    sourceUrl: 'https://www.moac.go.th',
    access: 'metadata_only',
    verifiedAt: FINANCE_AS_OF_DATE,
  },
];

export const PAYOUT_MODEL: PayoutModel = {
  title: 'แบบจำลอง Claim Ratio และการจ่ายค่าสินไหมรายภูมิภาค',
  formula: 'Claim Ratio = ค่าสินไหมที่จ่าย ÷ (เบี้ยรัฐอุดหนุน + เบี้ยเกษตรกร) × 100',
  basis: 'ใช้เบี้ยประกันรวม (Gross Premium) เป็นฐาน และกระจายค่าสินไหมตามสัดส่วนภัยหลักของแต่ละภูมิภาค',
  bands: PAYOUT_BANDS,
  assumptions: [
    'พื้นที่เข้าร่วมโครงการ เบี้ยต่อไร่ และความคุ้มครองต่อไร่คงที่ตามชั้นความคุ้มครองที่เลือก',
    'Claim Ratio ระดับจังหวัดสังเคราะห์จากค่าฐานภูมิภาค ปรับตามชนิดพืช และเพิ่มความแปรปรวนเชิงกำหนด (Deterministic Noise)',
    'ค่าสินไหมแยกตามภัยเป็นสัดส่วนจากค่าสินไหมรวม ไม่ได้จำลองเหตุการณ์รายครั้งหรือความเสียหายรายแปลง',
    'แบบจำลองยังไม่รวมค่าใช้จ่ายดำเนินงาน ค่าปรับปรุงทุนสำรอง และการจ่ายซ้ำหรือการเรียกคืนค่าสินไหม',
  ],
};

export const CREDIT_DEFINITION: CreditDefinition = {
  debtBurdenFormula:
    'ดัชนีภาระหนี้ = 0.42×(หนี้ต่อรายได้) + 0.22×(NPL×8) + 0.16×(สัดส่วนหนี้นอกระบบ) + 0.20×(สินเชื่อเฉลี่ย ÷ 5,000)',
  creditAccessFormula:
    'ดัชนีการเข้าถึง = 0.48×(ความครอบคลุม ธ.ก.ส.) + 0.14×(ความครอบคลุมกองทุน×22) + 0.20×(100 − หนี้นอกระบบ) + 0.18×(100 − NPL×9)',
  scaleNote: 'ดัชนีอยู่ในช่วง 0–100; ภาระหนี้ที่สูงขึ้นสะท้อนภาระที่แย่ลง ส่วนการเข้าถึงที่สูงขึ้นสะท้อนโอกาสที่ดีขึ้น',
  overlapNote:
    'ผู้กู้ ธ.ก.ส. และผู้กู้กองทุนหมุนเวียนอาจเป็นครัวเรือนเดียวกัน จึงแสดงจำนวนผู้กู้แยกตามระบบและไม่นับรวมเป็นเกษตรกรไม่ซ้ำ',
};

const RICE_EXCLUDED_CODES = new Set(['10', '11', '12', '74', '83']);
const URBAN_PROVINCE_CODES = new Set(['10', '11', '12', '73', '74', '83']);

const CORN_COVERED_CODES = new Set([
  '13', '14', '15', '16', '17', '18', '19',
  '20', '24', '25', '26', '27',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39',
  '40', '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '50', '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66', '67',
  '70', '71', '72', '73', '76', '77',
]);

const RICE_AREA_WEIGHTS: Record<string, number> = {
  '13': 1.2, '14': 3.4, '15': 2.6, '16': 1.8, '17': 1.4, '18': 2.4, '19': 1.1,
  '20': 0.8, '21': 0.7, '22': 0.7, '23': 0.4, '24': 2.4, '25': 2.0, '26': 1.5, '27': 1.6,
  '30': 4.2, '31': 3.6, '32': 3.2, '33': 3.4, '34': 4.0, '35': 2.2, '36': 2.6, '37': 1.4,
  '38': 1.5, '39': 1.8, '40': 3.0, '41': 2.6, '42': 1.4, '43': 1.8, '44': 2.8, '45': 3.0,
  '46': 2.6, '47': 2.8, '48': 2.2, '49': 1.3,
  '50': 1.7, '51': 0.9, '52': 1.3, '53': 1.4, '54': 1.2, '55': 1.4, '56': 1.2, '57': 2.0,
  '58': 0.7, '60': 4.6, '61': 1.6, '62': 2.9, '63': 1.5, '64': 2.6, '65': 3.2, '66': 3.4, '67': 1.9,
  '70': 1.8, '71': 1.5, '72': 3.6, '73': 2.0, '75': 0.7, '76': 1.1, '77': 0.9,
  '80': 3.2, '81': 0.7, '82': 0.4, '84': 1.8, '85': 0.3, '86': 1.2, '90': 2.2, '91': 0.8,
  '92': 1.5, '93': 2.8, '94': 1.0, '95': 0.6, '96': 0.8,
};

const CORN_AREA_WEIGHTS: Record<string, number> = {
  '13': 1.1, '14': 1.5, '15': 1.0, '16': 1.8, '17': 0.8, '18': 1.0, '19': 1.4,
  '20': 0.6, '24': 1.2, '25': 1.1, '26': 0.9, '27': 1.6,
  '30': 3.4, '31': 2.6, '32': 2.2, '33': 2.0, '34': 2.4, '35': 1.6, '36': 2.8, '37': 1.2,
  '38': 1.0, '39': 1.4, '40': 2.2, '41': 2.0, '42': 1.8, '43': 1.4, '44': 1.8, '45': 1.8,
  '46': 1.7, '47': 2.0, '48': 1.6, '49': 1.2,
  '50': 1.4, '51': 0.8, '52': 1.6, '53': 1.5, '54': 1.3, '55': 1.2, '56': 1.5, '57': 2.2,
  '58': 0.6, '60': 3.0, '61': 1.4, '62': 2.4, '63': 1.6, '64': 2.0, '65': 2.5, '66': 2.2, '67': 2.6,
  '70': 1.2, '71': 2.4, '72': 1.5, '73': 1.0, '76': 0.8, '77': 1.0,
};

const RICE_REGION_CLAIM_BASE: Record<RegionId, number> = {
  north: 88,
  northeast: 102,
  central: 118,
  east: 79,
  west: 96,
  south: 72,
};

const CORN_REGION_CLAIM_BASE: Record<RegionId, number> = {
  north: 96,
  northeast: 108,
  central: 104,
  east: 84,
  west: 92,
  south: 78,
};

const REGION_DISASTER_MIX: Record<RegionId, [number, number, number]> = {
  north: [0.38, 0.37, 0.25],
  northeast: [0.2, 0.52, 0.28],
  central: [0.5, 0.26, 0.24],
  east: [0.4, 0.34, 0.26],
  west: [0.42, 0.34, 0.24],
  south: [0.56, 0.14, 0.3],
};

const RAI_PER_HOUSEHOLD: Record<InsuranceProgramId, Record<RegionId, number>> = {
  rice_annual: { north: 16, northeast: 22, central: 18, east: 20, west: 22, south: 14 },
  feed_corn: { north: 28, northeast: 32, central: 30, east: 35, west: 40, south: 26 },
};

const REGION_BAAC_COVERAGE: Record<RegionId, number> = {
  north: 0.66,
  northeast: 0.72,
  central: 0.58,
  east: 0.55,
  west: 0.62,
  south: 0.5,
};

const REGION_AVERAGE_BAAC_LOAN: Record<RegionId, number> = {
  north: 390_000,
  northeast: 340_000,
  central: 450_000,
  east: 410_000,
  west: 430_000,
  south: 510_000,
};

const REGION_BAAC_NPL: Record<RegionId, number> = {
  north: 5.2,
  northeast: 5.9,
  central: 4.3,
  east: 3.8,
  west: 4.6,
  south: 4.9,
};

const REGION_FUND_COVERAGE: Record<RegionId, number> = {
  north: 2.6,
  northeast: 3.0,
  central: 1.8,
  east: 1.7,
  west: 2.2,
  south: 1.5,
};

const REGION_FUND_AVERAGE_LOAN: Record<RegionId, number> = {
  north: 38_000,
  northeast: 32_000,
  central: 45_000,
  east: 42_000,
  west: 40_000,
  south: 36_000,
};

const REGION_FARM_DEBT_TO_INCOME: Record<RegionId, number> = {
  north: 68,
  northeast: 78,
  central: 59,
  east: 55,
  west: 63,
  south: 64,
};

const REGION_INFORMAL_DEBT_SHARE: Record<RegionId, number> = {
  north: 31,
  northeast: 38,
  central: 25,
  east: 22,
  west: 28,
  south: 24,
};

const FARM_REGION_MULTIPLIER: Record<RegionId, number> = {
  north: 1.15,
  northeast: 2,
  central: 0.95,
  east: 0.65,
  west: 0.85,
  south: 0.85,
};

const NATIONAL_FARMING_HOUSEHOLDS = 5_500_000;

function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRng(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rng: () => number, base: number, spread: number): number {
  return base + (rng() * 2 - 1) * spread;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function normaliseShares(base: [number, number, number], rng: () => number): Record<DisasterType, number> {
  const adjusted = base.map((value) => Math.max(0.08, value + (rng() * 2 - 1) * 0.04));
  const total = sum(adjusted);
  return {
    flood: adjusted[0] / total,
    drought: adjusted[1] / total,
    pest: adjusted[2] / total,
  };
}

function dominantOf(shares: Record<DisasterType, number>): DisasterType {
  return DISASTER_TYPES.reduce((best, current) => (shares[current] > shares[best] ? current : best), 'flood' as DisasterType);
}

function buildProvinceNote(dominant: DisasterType, grade: RiskGrade): string {
  const perilNote: Record<DisasterType, string> = {
    flood: 'ภัยหลักคือน้ำท่วม ควรเชื่อมการชดเชยกับแผนระบายน้ำและปฏิทินเพาะปลูกในพื้นที่',
    drought: 'ภัยหลักคือฝนแล้ง ควรติดตามการคาดการณ์ฝนและปรับปฏิทินเพาะปลูกให้สอดคล้อง',
    pest: 'ภัยหลักคือศัตรูพืช ควรเสริมการเฝ้าระวังแปลงและจัดการศัตรูพืชแบบผสมผสาน',
  };
  const gradeNote = grade === 'high' || grade === 'elevated' ? ' ระดับความเสี่ยงของแบบจำลองสูงกว่าค่าฐาน' : '';
  return perilNote[dominant] + gradeNote;
}

function buildCreditNote(input: {
  accessGrade: AccessGrade;
  debtGrade: RiskGrade;
  nplPct: number;
  informalSharePct: number;
}): string {
  if (input.accessGrade === 'low' && (input.debtGrade === 'elevated' || input.debtGrade === 'high')) {
    return 'กลุ่มเปราะบาง: ภาระหนี้สูงและการเข้าถึงสินเชื่อในระบบจำกัด ควรประสานสินเชื่อรายย่อยและให้ความรู้ทางการเงิน';
  }
  if (input.debtGrade === 'high' || input.nplPct >= 7) {
    return 'ควรติดตามหนี้ค้างและพิจารณาปรับโครงสร้างหนี้ร่วมกับมาตรการฟื้นฟูรายได้';
  }
  if (input.accessGrade === 'low' || input.informalSharePct >= 40) {
    return 'ควรขยายช่องทางสินเชื่อในระบบและลดการพึ่งพาหนี้นอกระบบ';
  }
  return 'สถานะสินเชื่อโดยรวมอยู่ในกรอบปกติของแบบจำลอง แต่ยังต้องติดตามคุณภาพหนี้รายพื้นที่';
}

function generateFinanceRecords(): ProvinceFinanceRecord[] {
  const records: ProvinceFinanceRecord[] = [];

  for (const program of INSURANCE_PROGRAMS) {
    const coveredProvinces = FINANCE_PROVINCES.filter((item) =>
      program.id === 'rice_annual' ? !RICE_EXCLUDED_CODES.has(item.code) : CORN_COVERED_CODES.has(item.code),
    );
    const weightMap = program.id === 'rice_annual' ? RICE_AREA_WEIGHTS : CORN_AREA_WEIGHTS;
    const weights = coveredProvinces.map((item) => Math.max(0.2, weightMap[item.code] ?? 1));
    const totalWeight = sum(weights);
    const tier1Plan = program.plans.find((plan) => plan.tier === 'tier1');
    const tier2Plan = program.plans.find((plan) => plan.tier === 'tier2');

    if (!tier1Plan || !tier2Plan) continue;

    coveredProvinces.forEach((item, index) => {
      const rng = createRng(`finance:${program.id}:${item.code}`);
      const areaShare = weights[index] / totalWeight;
      const tier1AreaRai = Math.max(1_000, roundTo(program.targetAreaRai * areaShare, 1_000));
      const tier2Share = clamp(
        jitter(rng, program.tier2ShareBase, program.tier2ShareBase * 0.3),
        0.012,
        0.085,
      );
      const tier2AreaRai = Math.max(100, roundTo(tier1AreaRai * tier2Share, 100));
      // Tier 2 ซื้อเพิ่มบนไร่เดิมที่เข้า Tier 1 แล้ว จึงไม่นับพื้นที่ซ้ำ
      const insuredAreaRai = tier1AreaRai;
      const raiPerHousehold = clamp(
        jitter(rng, RAI_PER_HOUSEHOLD[program.id][item.regionId], 2.5),
        8,
        45,
      );
      const insuredHouseholds = Math.max(50, roundTo(tier1AreaRai / raiPerHousehold, 10));

      const grossPremiumBaht = roundTo(
        tier1AreaRai * tier1Plan.premiumPerRai + tier2AreaRai * tier2Plan.premiumPerRai,
        1_000,
      );
      const governmentSubsidyBaht = roundTo(tier1AreaRai * tier1Plan.governmentSubsidyPerRai, 1_000);
      const farmerPremiumBaht = grossPremiumBaht - governmentSubsidyBaht;
      const coverageLiabilityBaht = roundTo(
        tier1AreaRai * tier1Plan.coveragePerRai + tier2AreaRai * tier2Plan.coveragePerRai,
        1_000,
      );

      const claimBase = program.id === 'rice_annual'
        ? RICE_REGION_CLAIM_BASE[item.regionId]
        : CORN_REGION_CLAIM_BASE[item.regionId];
      const claimRatioPct = round1(clamp(jitter(rng, claimBase, 9), 44, 148));
      const claimsPaidBaht = roundTo((grossPremiumBaht * claimRatioPct) / 100, 1_000);

      const shares = normaliseShares(REGION_DISASTER_MIX[item.regionId], rng);
      const floodClaims = roundTo(claimsPaidBaht * shares.flood, 1_000);
      const droughtClaims = roundTo(claimsPaidBaht * shares.drought, 1_000);
      const pestClaims = Math.max(0, claimsPaidBaht - floodClaims - droughtClaims);
      const disasterClaims: Record<DisasterType, number> = {
        flood: floodClaims,
        drought: droughtClaims,
        pest: pestClaims,
      };
      const droughtSharePct = round1((droughtClaims / claimsPaidBaht) * 100);
      const floodSharePct = round1((floodClaims / claimsPaidBaht) * 100);
      const disasterShares: Record<DisasterType, number> = {
        flood: floodSharePct,
        drought: droughtSharePct,
        pest: round1(100 - floodSharePct - droughtSharePct),
      };

      const dominantDisaster = dominantOf(shares);
      const riskScore = Math.round(clamp(claimRatioPct * 0.6 + shares[dominantDisaster] * 100 * 0.4, 0, 100));
      const riskGrade = getRiskGrade(riskScore);
      const payoutBand = getPayoutBand(claimRatioPct);

      records.push({
        id: `FIN-${program.id === 'rice_annual' ? 'RICE' : 'CORN'}-${item.code}`,
        provinceCode: item.code,
        provinceName: item.name,
        regionId: item.regionId,
        region: item.region,
        programId: program.id,
        programLabel: program.label,
        programShortLabel: program.shortLabel,
        cropName: program.cropName,
        tier1AreaRai,
        tier2AreaRai,
        insuredAreaRai,
        insuredHouseholds,
        tier2SharePct: round1((tier2AreaRai / tier1AreaRai) * 100),
        grossPremiumBaht,
        governmentSubsidyBaht,
        farmerPremiumBaht,
        coverageLiabilityBaht,
        averageCoveragePerRai: Math.round(coverageLiabilityBaht / insuredAreaRai),
        averagePremiumPerRai: Math.round(grossPremiumBaht / insuredAreaRai),
        claimsPaidBaht,
        claimRatioPct,
        disasterClaims,
        disasterShares,
        dominantDisaster,
        dominantDisasterLabel: DISASTER_CONFIG[dominantDisaster].label,
        riskScore,
        riskGrade,
        riskGradeLabel: RISK_GRADE_CONFIG[riskGrade].label,
        payoutBand: payoutBand.id,
        payoutBandLabel: payoutBand.label,
        provinceRiskRank: 0,
        note: buildProvinceNote(dominantDisaster, riskGrade),
        sample: true,
        asOfDate: FINANCE_AS_OF_DATE,
      });
    });
  }

  for (const program of INSURANCE_PROGRAMS) {
    records
      .filter((record) => record.programId === program.id)
      .sort((left, right) => right.riskScore - left.riskScore || right.claimRatioPct - left.claimRatioPct)
      .forEach((record, index) => {
        record.provinceRiskRank = index + 1;
      });
  }

  return records.sort((left, right) => left.provinceCode.localeCompare(right.provinceCode) || left.programId.localeCompare(right.programId));
}

function generateCreditRecords(): ProvinceCreditRecord[] {
  const rawWeights = FINANCE_PROVINCES.map((item) => {
    const rng = createRng(`credit-weight:${item.code}`);
    const urbanFactor = URBAN_PROVINCE_CODES.has(item.code) ? 0.25 : 1;
    return FARM_REGION_MULTIPLIER[item.regionId] * urbanFactor * (0.75 + rng() * 0.5);
  });
  const totalWeight = sum(rawWeights);

  return FINANCE_PROVINCES.map((item, index) => {
    const rng = createRng(`credit:${item.code}`);
    const farmingHouseholds = Math.max(500, roundTo((NATIONAL_FARMING_HOUSEHOLDS * rawWeights[index]) / totalWeight, 100));

    const baacCoveragePct = round1(clamp(jitter(rng, REGION_BAAC_COVERAGE[item.regionId] * 100, 5), 38, 86));
    const baacBorrowerHouseholds = Math.max(100, roundTo((farmingHouseholds * baacCoveragePct) / 100, 10));
    const averageBaacLoanThb = roundTo(clamp(jitter(rng, REGION_AVERAGE_BAAC_LOAN[item.regionId], 45_000), 220_000, 620_000), 1_000);
    const baacOutstandingMillionThb = round1((baacBorrowerHouseholds * averageBaacLoanThb) / 1_000_000);
    const baacNplPct = round1(clamp(jitter(rng, REGION_BAAC_NPL[item.regionId], 1.1), 2.2, 8.8));

    const revolvingFundCoveragePct = round1(clamp(jitter(rng, REGION_FUND_COVERAGE[item.regionId], 0.8), 0.8, 5.6));
    const revolvingFundBorrowerHouseholds = Math.max(20, roundTo((farmingHouseholds * revolvingFundCoveragePct) / 100, 10));
    const averageRevolvingFundLoanThb = roundTo(clamp(jitter(rng, REGION_FUND_AVERAGE_LOAN[item.regionId], 8_000), 20_000, 65_000), 1_000);
    const revolvingFundOutstandingMillionThb = round1((revolvingFundBorrowerHouseholds * averageRevolvingFundLoanThb) / 1_000_000);

    const debtToIncomePct = round1(clamp(jitter(rng, REGION_FARM_DEBT_TO_INCOME[item.regionId], 8), 40, 92));
    const informalDebtSharePct = round1(clamp(jitter(rng, REGION_INFORMAL_DEBT_SHARE[item.regionId], 5), 12, 48));

    const fundCoverageScore = Math.min(100, revolvingFundCoveragePct * 22);
    const nplScore = Math.max(0, 100 - baacNplPct * 9);
    const informalScore = 100 - informalDebtSharePct;
    const creditAccessIndex = round1(clamp(
      baacCoveragePct * 0.48 + fundCoverageScore * 0.14 + informalScore * 0.2 + nplScore * 0.18,
      0,
      100,
    ));
    const debtBurdenIndex = round1(clamp(
      debtToIncomePct * 0.42
        + Math.min(100, baacNplPct * 8) * 0.22
        + informalDebtSharePct * 0.16
        + Math.min(100, averageBaacLoanThb / 5_000) * 0.2,
      0,
      100,
    ));

    const creditAccessGrade = getAccessGrade(creditAccessIndex);
    const debtBurdenGrade = getDebtGrade(debtBurdenIndex);

    return {
      provinceCode: item.code,
      provinceName: item.name,
      regionId: item.regionId,
      region: item.region,
      farmingHouseholds,
      baacBorrowerHouseholds,
      baacCoveragePct,
      baacOutstandingMillionThb,
      averageBaacLoanThb,
      baacNplPct,
      revolvingFundBorrowerHouseholds,
      revolvingFundCoveragePct,
      revolvingFundOutstandingMillionThb,
      averageRevolvingFundLoanThb,
      debtToIncomePct,
      informalDebtSharePct,
      creditAccessIndex,
      creditAccessGrade,
      creditAccessGradeLabel: ACCESS_GRADE_CONFIG[creditAccessGrade].label,
      debtBurdenIndex,
      debtBurdenGrade,
      debtBurdenGradeLabel: RISK_GRADE_CONFIG[debtBurdenGrade].label,
      note: buildCreditNote({
        accessGrade: creditAccessGrade,
        debtGrade: debtBurdenGrade,
        nplPct: baacNplPct,
        informalSharePct: informalDebtSharePct,
      }),
      sample: true,
      asOfDate: FINANCE_AS_OF_DATE,
    };
  });
}

export const PROVINCE_FINANCE_RECORDS: ProvinceFinanceRecord[] = generateFinanceRecords();
export const PROVINCIAL_CREDIT_RECORDS: ProvinceCreditRecord[] = generateCreditRecords();

export function filterFinanceRecords(
  records: ProvinceFinanceRecord[],
  filters: FinanceFilters = {},
): ProvinceFinanceRecord[] {
  const provinceCode = filters.provinceCode ?? null;
  const program = filters.program ?? 'all';
  return records.filter((record) =>
    (!provinceCode || record.provinceCode === provinceCode)
    && (program === 'all' || record.programId === program),
  );
}

export function buildDisasterSplit(records: ProvinceFinanceRecord[]): DisasterSplit {
  const totalClaimsBaht = sum(records.map((record) => record.claimsPaidBaht));
  if (records.length === 0 || totalClaimsBaht <= 0) {
    return {
      totalClaimsBaht: 0,
      dominantType: null,
      dominantLabel: 'ไม่มีข้อมูล',
      items: DISASTER_TYPES.map((type) => ({
        type,
        label: DISASTER_CONFIG[type].label,
        color: DISASTER_CONFIG[type].color,
        claimsPaidBaht: 0,
        sharePct: 0,
        dominantProvinceCount: 0,
      })),
    };
  }

  const dominantCounts = {
    flood: records.filter((record) => record.dominantDisaster === 'flood').length,
    drought: records.filter((record) => record.dominantDisaster === 'drought').length,
    pest: records.filter((record) => record.dominantDisaster === 'pest').length,
  };

  const items = DISASTER_TYPES.map((type) => {
    const claimsPaidBaht = sum(records.map((record) => record.disasterClaims[type]));
    return {
      type,
      label: DISASTER_CONFIG[type].label,
      color: DISASTER_CONFIG[type].color,
      claimsPaidBaht,
      sharePct: 0,
      dominantProvinceCount: dominantCounts[type],
    };
  });

  const roundedShares = items.map((item) => round1((item.claimsPaidBaht / totalClaimsBaht) * 100));
  const shareDrift = round1(100 - sum(roundedShares));
  items.forEach((item, index) => {
    item.sharePct = round1(roundedShares[index] + (index === items.length - 1 ? shareDrift : 0));
  });

  const dominantItem = items.reduce((best, current) => (current.claimsPaidBaht > best.claimsPaidBaht ? current : best), items[0]);

  return {
    totalClaimsBaht,
    dominantType: dominantItem.type,
    dominantLabel: dominantItem.label,
    items,
  };
}

function emptyDisasterSplit(): DisasterSplit {
  return buildDisasterSplit([]);
}

function emptySummary(): FinanceSummary {
  return {
    recordCount: 0,
    provinceCount: 0,
    programCount: 0,
    insuredAreaRai: 0,
    tier1AreaRai: 0,
    tier2AreaRai: 0,
    tier2SharePct: 0,
    insuredHouseholds: 0,
    grossPremiumBaht: 0,
    governmentSubsidyBaht: 0,
    farmerPremiumBaht: 0,
    subsidySharePct: 0,
    coverageLiabilityBaht: 0,
    claimsPaidBaht: 0,
    claimRatioPct: 0,
    averageCoveragePerRai: 0,
    averagePremiumPerRai: 0,
    averageFarmerPremiumPerRai: 0,
    disasterSplit: emptyDisasterSplit(),
    riskScore: 0,
    riskGrade: null,
    riskGradeLabel: 'ไม่มีข้อมูล',
    dominantDisaster: null,
    dominantDisasterLabel: 'ไม่มีข้อมูล',
    highestClaimProvince: null,
  };
}

export function summarizeFinanceRecords(records: ProvinceFinanceRecord[]): FinanceSummary {
  if (records.length === 0) return emptySummary();

  const insuredAreaRai = sum(records.map((record) => record.insuredAreaRai));
  if (insuredAreaRai <= 0) return emptySummary();

  const tier1AreaRai = sum(records.map((record) => record.tier1AreaRai));
  const tier2AreaRai = sum(records.map((record) => record.tier2AreaRai));
  const grossPremiumBaht = sum(records.map((record) => record.grossPremiumBaht));
  const governmentSubsidyBaht = sum(records.map((record) => record.governmentSubsidyBaht));
  const farmerPremiumBaht = sum(records.map((record) => record.farmerPremiumBaht));
  const coverageLiabilityBaht = sum(records.map((record) => record.coverageLiabilityBaht));
  const claimsPaidBaht = sum(records.map((record) => record.claimsPaidBaht));
  const riskScore = Math.round(
    sum(records.map((record) => record.riskScore * record.insuredAreaRai)) / insuredAreaRai,
  );
  const riskGrade = getRiskGrade(riskScore);
  const disasterSplit = buildDisasterSplit(records);
  const highestClaim = records.reduce(
    (best, record) => (record.claimRatioPct > best.claimRatioPct ? record : best),
    records[0],
  );

  return {
    recordCount: records.length,
    provinceCount: new Set(records.map((record) => record.provinceCode)).size,
    programCount: new Set(records.map((record) => record.programId)).size,
    insuredAreaRai,
    tier1AreaRai,
    tier2AreaRai,
    tier2SharePct: round1((tier2AreaRai / tier1AreaRai) * 100),
    insuredHouseholds: sum(records.map((record) => record.insuredHouseholds)),
    grossPremiumBaht,
    governmentSubsidyBaht,
    farmerPremiumBaht,
    subsidySharePct: round1((governmentSubsidyBaht / grossPremiumBaht) * 100),
    coverageLiabilityBaht,
    claimsPaidBaht,
    claimRatioPct: round1((claimsPaidBaht / grossPremiumBaht) * 100),
    averageCoveragePerRai: Math.round(coverageLiabilityBaht / insuredAreaRai),
    averagePremiumPerRai: Math.round(grossPremiumBaht / insuredAreaRai),
    averageFarmerPremiumPerRai: Math.round(farmerPremiumBaht / insuredAreaRai),
    disasterSplit,
    riskScore,
    riskGrade,
    riskGradeLabel: RISK_GRADE_CONFIG[riskGrade].label,
    dominantDisaster: disasterSplit.dominantType,
    dominantDisasterLabel: disasterSplit.dominantLabel,
    highestClaimProvince: {
      provinceCode: highestClaim.provinceCode,
      provinceName: highestClaim.provinceName,
      claimRatioPct: highestClaim.claimRatioPct,
    },
  };
}

export function buildRegionSummaries(records: ProvinceFinanceRecord[]): RegionFinanceSummary[] {
  return FINANCE_REGIONS.map((region) => {
    const regionRecords = records.filter((record) => record.regionId === region.id);
    const summary = summarizeFinanceRecords(regionRecords);
    const payoutBand = getPayoutBand(summary.claimRatioPct);
    return {
      ...summary,
      regionId: region.id,
      regionLabel: region.label,
      payoutBand: payoutBand.id,
      payoutBandLabel: payoutBand.label,
    };
  }).filter((region) => region.recordCount > 0);
}

export function summarizeCredit(records: ProvinceCreditRecord[]): CreditSummary {
  if (records.length === 0) {
    return {
      provinceCount: 0,
      farmingHouseholds: 0,
      baacBorrowerHouseholds: 0,
      baacCoveragePct: 0,
      baacOutstandingMillionThb: 0,
      baacNplPct: 0,
      averageBaacLoanThb: 0,
      revolvingFundBorrowerHouseholds: 0,
      revolvingFundCoveragePct: 0,
      revolvingFundOutstandingMillionThb: 0,
      averageRevolvingFundLoanThb: 0,
      debtToIncomePct: 0,
      informalDebtSharePct: 0,
      creditAccessIndex: 0,
      creditAccessGrade: 'low',
      creditAccessGradeLabel: ACCESS_GRADE_CONFIG.low.label,
      debtBurdenIndex: 0,
      debtBurdenGrade: 'low',
      debtBurdenGradeLabel: RISK_GRADE_CONFIG.low.label,
      highestDebtBurden: null,
      lowestCreditAccess: null,
    };
  }

  const farmingHouseholds = sum(records.map((record) => record.farmingHouseholds));
  const baacBorrowerHouseholds = sum(records.map((record) => record.baacBorrowerHouseholds));
  const baacOutstandingMillionThb = sum(records.map((record) => record.baacOutstandingMillionThb));
  const revolvingFundBorrowerHouseholds = sum(records.map((record) => record.revolvingFundBorrowerHouseholds));
  const revolvingFundOutstandingMillionThb = sum(records.map((record) => record.revolvingFundOutstandingMillionThb));
  const baacNplPct = round1(
    sum(records.map((record) => record.baacNplPct * record.baacOutstandingMillionThb)) / baacOutstandingMillionThb,
  );
  const weightedHouseholds = (pick: (record: ProvinceCreditRecord) => number) =>
    sum(records.map((record) => pick(record) * record.farmingHouseholds)) / farmingHouseholds;

  const creditAccessIndex = round1(weightedHouseholds((record) => record.creditAccessIndex));
  const debtBurdenIndex = round1(weightedHouseholds((record) => record.debtBurdenIndex));
  const creditAccessGrade = getAccessGrade(creditAccessIndex);
  const debtBurdenGrade = getDebtGrade(debtBurdenIndex);
  const highestDebt = records.reduce((best, record) => (record.debtBurdenIndex > best.debtBurdenIndex ? record : best), records[0]);
  const lowestAccess = records.reduce((best, record) => (record.creditAccessIndex < best.creditAccessIndex ? record : best), records[0]);

  return {
    provinceCount: records.length,
    farmingHouseholds,
    baacBorrowerHouseholds,
    baacCoveragePct: round1((baacBorrowerHouseholds / farmingHouseholds) * 100),
    baacOutstandingMillionThb: round1(baacOutstandingMillionThb),
    baacNplPct,
    averageBaacLoanThb: Math.round((baacOutstandingMillionThb * 1_000_000) / baacBorrowerHouseholds),
    revolvingFundBorrowerHouseholds,
    revolvingFundCoveragePct: round1((revolvingFundBorrowerHouseholds / farmingHouseholds) * 100),
    revolvingFundOutstandingMillionThb: round1(revolvingFundOutstandingMillionThb),
    averageRevolvingFundLoanThb: Math.round((revolvingFundOutstandingMillionThb * 1_000_000) / revolvingFundBorrowerHouseholds),
    debtToIncomePct: round1(weightedHouseholds((record) => record.debtToIncomePct)),
    informalDebtSharePct: round1(weightedHouseholds((record) => record.informalDebtSharePct)),
    creditAccessIndex,
    creditAccessGrade,
    creditAccessGradeLabel: ACCESS_GRADE_CONFIG[creditAccessGrade].label,
    debtBurdenIndex,
    debtBurdenGrade,
    debtBurdenGradeLabel: RISK_GRADE_CONFIG[debtBurdenGrade].label,
    highestDebtBurden: {
      provinceCode: highestDebt.provinceCode,
      provinceName: highestDebt.provinceName,
      index: highestDebt.debtBurdenIndex,
    },
    lowestCreditAccess: {
      provinceCode: lowestAccess.provinceCode,
      provinceName: lowestAccess.provinceName,
      index: lowestAccess.creditAccessIndex,
    },
  };
}

export function buildCreditRegionSummaries(records: ProvinceCreditRecord[]): RegionCreditSummary[] {
  return FINANCE_REGIONS.map((region) => {
    const regionRecords = records.filter((record) => record.regionId === region.id);
    if (regionRecords.length === 0) return null;
    return {
      ...summarizeCredit(regionRecords),
      regionId: region.id,
      regionLabel: region.label,
    };
  }).filter((region): region is RegionCreditSummary => region !== null);
}

export function buildFinanceDashboard(filters: FinanceFilters = {}): FinanceDashboardPayload {
  const provinceCode = filters.provinceCode ?? null;
  const program = filters.program ?? 'all';
  const normalizedFilters: { provinceCode: string | null; program: ProgramFilter } = { provinceCode, program };
  const records = filterFinanceRecords(PROVINCE_FINANCE_RECORDS, normalizedFilters);
  const summary = summarizeFinanceRecords(records);
  const nationalSummary = summarizeFinanceRecords(PROVINCE_FINANCE_RECORDS);
  const creditSummary = summarizeCredit(PROVINCIAL_CREDIT_RECORDS);

  const programSummaries: ProgramRollup[] = INSURANCE_PROGRAMS.map((item) => {
    const tier1 = item.plans.find((plan) => plan.tier === 'tier1');
    return {
      programId: item.id,
      label: item.label,
      shortLabel: item.shortLabel,
      targetAreaRai: item.targetAreaRai,
      coveragePerRai: tier1?.coveragePerRai ?? 0,
      summary: summarizeFinanceRecords(PROVINCE_FINANCE_RECORDS.filter((record) => record.programId === item.id)),
    };
  });

  const selectedCredit = provinceCode
    ? PROVINCIAL_CREDIT_RECORDS.find((record) => record.provinceCode === provinceCode) ?? null
    : null;

  return {
    sample: true,
    dataVersion: FINANCE_DATA_VERSION,
    asOfDate: FINANCE_AS_OF_DATE,
    period: FINANCE_PERIOD,
    filters: normalizedFilters,
    provinces: FINANCE_PROVINCES,
    programs: INSURANCE_PROGRAMS,
    coveragePlans: COVERAGE_PLANS,
    records,
    nationalSummary,
    summary,
    programSummaries,
    disasterSplit: summary.disasterSplit,
    regionBreakdown: buildRegionSummaries(records),
    payoutModel: PAYOUT_MODEL,
    creditRecords: PROVINCIAL_CREDIT_RECORDS,
    creditSummary,
    selectedCredit,
    creditRegionBreakdown: buildCreditRegionSummaries(PROVINCIAL_CREDIT_RECORDS),
    creditDefinition: CREDIT_DEFINITION,
    sources: FINANCE_SOURCES,
    warnings: FINANCE_WARNINGS,
  };
}
