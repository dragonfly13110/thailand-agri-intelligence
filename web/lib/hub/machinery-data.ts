export const MACHINERY_TYPE_IDS = ['tractor', 'combine_harvester', 'transplanter', 'drone'] as const;
export type MachineryType = (typeof MACHINERY_TYPE_IDS)[number];

export const REGIONS = [
  'ภาคกลาง',
  'ภาคตะวันออก',
  'ภาคตะวันออกเฉียงเหนือ',
  'ภาคเหนือ',
  'ภาคตะวันตก',
  'ภาคใต้',
] as const;
export type Region = (typeof REGIONS)[number];

export const SERVICE_CENTER_KIND_IDS = ['custom_hiring', 'mechanic', 'large_field_group'] as const;
export type ServiceCenterKind = (typeof SERVICE_CENTER_KIND_IDS)[number];

export type ReadinessLevel = 'surplus' | 'adequate' | 'tight' | 'deficit';
export type ServiceCenterStatus = 'open' | 'busy' | 'maintenance';

export type MachineryTypeDefinition = {
  id: MachineryType;
  name: string;
  shortName: string;
  englishName: string;
  unitLabel: string;
  description: string;
  accent: string;
  softAccent: string;
  phaseLabel: string;
  windowDays: number;
  inHarvestIndex: boolean;
  rentalNote: string;
};

export type RentalRate = {
  minBahtPerRai: number;
  averageBahtPerRai: number;
  maxBahtPerRai: number;
  centersServing: number;
};

export type TypeReadiness = {
  level: ReadinessLevel;
  adequacyPercent: number;
  demandRai: number;
  capacityRai: number;
  gapRai: number;
  shortfallMachines: number;
  dailyCapacityRai: number;
};

export type MachineryTypeStat = {
  type: MachineryType;
  units: number;
  unitsPer100kRai: number;
  averageHorsepower: number | null;
  totalHorsepower: number | null;
  mechanizationIndex: number | null;
  rental: RentalRate;
  readiness: TypeReadiness;
  centersSupporting: number;
};

export type HarvestSummary = {
  readiness: TypeReadiness;
  demandRai: number;
  capacityRai: number;
};

export type CentersByKind = Record<ServiceCenterKind, number>;

export type MachineryScopeSummary = {
  scopeId: string;
  scopeLabel: string;
  provinceCount: number;
  areaRai: number;
  riceAreaRai: number;
  fieldAreaRai: number;
  otherAreaRai: number;
  totalUnits: number;
  groundUnits: number;
  droneUnits: number;
  totalHorsepower: number;
  mechanizationIndex: number;
  centerCount: number;
  centersByKind: CentersByKind;
  types: MachineryTypeStat[];
  harvest: HarvestSummary;
};

export type ProvinceMachineryProfile = MachineryScopeSummary & {
  provinceCode: string;
  provinceName: string;
  region: Region;
  district: string;
};

export type RegionSummary = {
  region: Region;
  provinceCodes: string[];
  provinceCount: number;
  areaRai: number;
  totalUnits: number;
  groundUnits: number;
  centerCount: number;
  mechanizationIndex: number;
  harvestAdequacyPercent: number;
  harvestLevel: ReadinessLevel;
};

export type ServiceCenter = {
  id: string;
  name: string;
  kind: ServiceCenterKind;
  kindLabel: string;
  provinceCode: string;
  provinceName: string;
  region: Region;
  district: string;
  operator: string;
  operatorType: 'cooperative' | 'community_enterprise' | 'repair_network' | 'large_field_group';
  operatorTypeLabel: string;
  supportedTypes: MachineryType[];
  availableUnits: number;
  certifiedMechanics: number;
  serviceRadiusKm: number;
  responseHours: number;
  bookingLoadPercent: number;
  status: ServiceCenterStatus;
  statusLabel: string;
  services: string[];
  contactChannel: string;
  verifiedAt: string;
};

export type MachinerySourceReference = {
  id: string;
  name: string;
  url: string | null;
  role: string;
  status: 'verified_reference' | 'pending_verification';
  note: string;
};

export type MachineryFilters = {
  provinceCode: string | null;
  machineryType: MachineryType | null;
  centerKind: ServiceCenterKind | null;
  search: string;
};

export type MachineryFilterOptions = {
  provinces: { code: string; name: string; region: Region }[];
  regions: { region: Region; provinces: { code: string; name: string }[] }[];
  machineryTypes: MachineryTypeDefinition[];
  serviceCenterKinds: { id: ServiceCenterKind; label: string; description: string }[];
};

export type MachinerySeason = {
  id: string;
  label: string;
  windowLabel: string;
  start: string;
  end: string;
  phase: string;
  phaseLabel: string;
};

export type MachineryDashboardPayload = {
  sample: true;
  dataAsOf: string;
  dataAsOfLabel: string;
  season: MachinerySeason;
  filters: MachineryFilters;
  focus: {
    provinceCode: string | null;
    provinceName: string | null;
    machineryType: MachineryType | null;
    machineryTypeName: string | null;
    scopeLabel: string;
  };
  national: MachineryScopeSummary;
  scope: MachineryScopeSummary;
  machineryTypeCatalog: MachineryTypeDefinition[];
  filterOptions: MachineryFilterOptions;
  provinces: ProvinceMachineryProfile[];
  regions: RegionSummary[];
  serviceCenters: ServiceCenter[];
  sources: MachinerySourceReference[];
  methodology: { title: string; detail: string }[];
  warnings: string[];
};

export type MachineryDashboardFilters = {
  provinceCode?: string;
  machineryType?: MachineryType;
  centerKind?: ServiceCenterKind;
  search?: string;
};

export const DATA_AS_OF = '2026-10-25';

const SEASON: MachinerySeason = {
  id: 'harvest-2569-70',
  label: 'ฤดูเก็บเกี่ยว 2569/70',
  windowLabel: '1 พ.ย. – 15 ธ.ค. 2569',
  start: '2026-11-01',
  end: '2026-12-15',
  phase: 'harvest',
  phaseLabel: 'ช่วงเก็บเกี่ยวหลัก',
};

export const MACHINERY_TYPE_CATALOG: MachineryTypeDefinition[] = [
  {
    id: 'tractor',
    name: 'รถแทรกเตอร์',
    shortName: 'แทรกเตอร์',
    englishName: 'Tractor',
    unitLabel: 'คัน',
    description: 'ไถพรวน เตรียมดิน และลำเลียงผลผลิตในแปลง',
    accent: '#2f6b4f',
    softAccent: '#e4f0e8',
    phaseLabel: 'เตรียมดิน',
    windowDays: 14,
    inHarvestIndex: true,
    rentalNote: 'รวมไถพรวน เตรียมดิน และลำเลียงผลผลิตในแปลง',
  },
  {
    id: 'combine_harvester',
    name: 'รถเกี่ยวนวดข้าว',
    shortName: 'รถเกี่ยวข้าว',
    englishName: 'Combine Harvester',
    unitLabel: 'คัน',
    description: 'เก็บเกี่ยวและนวดข้าวในแปลงเดียว',
    accent: '#b26a13',
    softAccent: '#f8ecda',
    phaseLabel: 'เก็บเกี่ยว',
    windowDays: 16,
    inHarvestIndex: true,
    rentalNote: 'ขึ้นกับขนาดแปลง ความชื้น และระยะขนย้าย',
  },
  {
    id: 'transplanter',
    name: 'รถดำนา',
    shortName: 'รถดำนา',
    englishName: 'Rice Transplanter',
    unitLabel: 'คัน',
    description: 'ปักดำกล้าข้าวแบบเป็นแถว',
    accent: '#1f7a7a',
    softAccent: '#e0f1f0',
    phaseLabel: 'ปักดำ',
    windowDays: 12,
    inHarvestIndex: false,
    rentalNote: 'อาจไม่รวมค่ากล้าและแรงงานช่วยปักดำ',
  },
  {
    id: 'drone',
    name: 'โดรนการเกษตร',
    shortName: 'โดรน',
    englishName: 'Agricultural Drone',
    unitLabel: 'ลำ',
    description: 'พ่นสารและหว่านปุ๋ยหรือเมล็ดพันธุ์',
    accent: '#5b5bd6',
    softAccent: '#e8e8fb',
    phaseLabel: 'พ่น/หว่าน',
    windowDays: 9,
    inHarvestIndex: true,
    rentalNote: 'รวมค่าบินและสารในพื้นที่ขั้นต่ำ',
  },
];

export const SERVICE_CENTER_KIND_CATALOG: { id: ServiceCenterKind; label: string; description: string }[] = [
  {
    id: 'custom_hiring',
    label: 'ศูนย์จ้างเหมาเครื่องจักรกล',
    description: 'ให้บริการเครื่องจักรพร้อมพนักงานขับแบบจ้างเหมารายไร่',
  },
  {
    id: 'mechanic',
    label: 'ศูนย์บริการช่าง',
    description: 'ซ่อมบำรุงเครื่องจักรกลและให้บริการซ่อมเคลื่อนที่',
  },
  {
    id: 'large_field_group',
    label: 'กลุ่มแปลงใหญ่',
    description: 'กลุ่มเกษตรกรที่บริหารเครื่องจักรร่วมและให้บริการข้ามแปลง',
  },
];

const CATALOG_BY_TYPE = Object.fromEntries(
  MACHINERY_TYPE_CATALOG.map((definition) => [definition.id, definition]),
) as Record<MachineryType, MachineryTypeDefinition>;

const KIND_LABELS = Object.fromEntries(
  SERVICE_CENTER_KIND_CATALOG.map((kind) => [kind.id, kind.label]),
) as Record<ServiceCenterKind, string>;

type RegionProfile = {
  costFactor: number;
  tractorIntensity: number;
  combineIntensity: number;
  transplanterIntensity: number;
  droneIntensity: number;
  tractorHp: number;
  combineHp: number;
};

const REGION_PROFILES: Record<Region, RegionProfile> = {
  ภาคกลาง: {
    costFactor: 1.02,
    tractorIntensity: 1.2,
    combineIntensity: 1.08,
    transplanterIntensity: 1.3,
    droneIntensity: 1.2,
    tractorHp: 78,
    combineHp: 132,
  },
  ภาคตะวันออก: {
    costFactor: 1.05,
    tractorIntensity: 1.04,
    combineIntensity: 1.0,
    transplanterIntensity: 0.85,
    droneIntensity: 1.15,
    tractorHp: 74,
    combineHp: 124,
  },
  ภาคตะวันออกเฉียงเหนือ: {
    costFactor: 0.9,
    tractorIntensity: 0.98,
    combineIntensity: 1.06,
    transplanterIntensity: 0.72,
    droneIntensity: 0.92,
    tractorHp: 66,
    combineHp: 118,
  },
  ภาคเหนือ: {
    costFactor: 0.97,
    tractorIntensity: 0.84,
    combineIntensity: 0.88,
    transplanterIntensity: 0.62,
    droneIntensity: 0.88,
    tractorHp: 62,
    combineHp: 108,
  },
  ภาคตะวันตก: {
    costFactor: 1.0,
    tractorIntensity: 1.08,
    combineIntensity: 0.96,
    transplanterIntensity: 0.95,
    droneIntensity: 1.02,
    tractorHp: 72,
    combineHp: 122,
  },
  ภาคใต้: {
    costFactor: 1.12,
    tractorIntensity: 0.7,
    combineIntensity: 0.55,
    transplanterIntensity: 0.35,
    droneIntensity: 0.78,
    tractorHp: 58,
    combineHp: 96,
  },
};

type ProvinceSeed = {
  code: string;
  name: string;
  region: Region;
  district: string;
  areaRai: number;
  riceShare: number;
  fieldShare: number;
};

const PROVINCE_SEEDS: ProvinceSeed[] = [
  { code: '10', name: 'กรุงเทพมหานคร', region: 'ภาคกลาง', district: 'คลองเตย', areaRai: 180_000, riceShare: 0.18, fieldShare: 0.08 },
  { code: '11', name: 'สมุทรปราการ', region: 'ภาคกลาง', district: 'บางพลี', areaRai: 130_000, riceShare: 0.22, fieldShare: 0.1 },
  { code: '12', name: 'นนทบุรี', region: 'ภาคกลาง', district: 'บางกรวย', areaRai: 60_000, riceShare: 0.2, fieldShare: 0.08 },
  { code: '13', name: 'ปทุมธานี', region: 'ภาคกลาง', district: 'คลองหลวง', areaRai: 380_000, riceShare: 0.42, fieldShare: 0.15 },
  { code: '14', name: 'พระนครศรีอยุธยา', region: 'ภาคกลาง', district: 'บางปะอิน', areaRai: 1_250_000, riceShare: 0.72, fieldShare: 0.15 },
  { code: '15', name: 'อ่างทอง', region: 'ภาคกลาง', district: 'วิเศษชัยชาญ', areaRai: 420_000, riceShare: 0.7, fieldShare: 0.16 },
  { code: '16', name: 'ลพบุรี', region: 'ภาคกลาง', district: 'โคกสำโรง', areaRai: 1_650_000, riceShare: 0.55, fieldShare: 0.25 },
  { code: '17', name: 'สิงห์บุรี', region: 'ภาคกลาง', district: 'อินทร์บุรี', areaRai: 310_000, riceShare: 0.68, fieldShare: 0.18 },
  { code: '18', name: 'ชัยนาท', region: 'ภาคกลาง', district: 'มโนรมย์', areaRai: 700_000, riceShare: 0.65, fieldShare: 0.2 },
  { code: '19', name: 'สระบุรี', region: 'ภาคกลาง', district: 'แก่งคอย', areaRai: 1_050_000, riceShare: 0.5, fieldShare: 0.28 },
  { code: '60', name: 'นครสวรรค์', region: 'ภาคกลาง', district: 'โกรกพระ', areaRai: 3_900_000, riceShare: 0.55, fieldShare: 0.28 },
  { code: '61', name: 'อุทัยธานี', region: 'ภาคกลาง', district: 'หนองฉาง', areaRai: 1_050_000, riceShare: 0.5, fieldShare: 0.3 },
  { code: '20', name: 'ชลบุรี', region: 'ภาคตะวันออก', district: 'ศรีราชา', areaRai: 1_000_000, riceShare: 0.15, fieldShare: 0.12 },
  { code: '21', name: 'ระยอง', region: 'ภาคตะวันออก', district: 'แกลง', areaRai: 700_000, riceShare: 0.2, fieldShare: 0.1 },
  { code: '22', name: 'จันทบุรี', region: 'ภาคตะวันออก', district: 'ท่าใหม่', areaRai: 1_100_000, riceShare: 0.22, fieldShare: 0.1 },
  { code: '23', name: 'ตราด', region: 'ภาคตะวันออก', district: 'เมืองตราด', areaRai: 620_000, riceShare: 0.24, fieldShare: 0.1 },
  { code: '24', name: 'ฉะเชิงเทรา', region: 'ภาคตะวันออก', district: 'บางคล้า', areaRai: 1_900_000, riceShare: 0.42, fieldShare: 0.28 },
  { code: '25', name: 'ปราจีนบุรี', region: 'ภาคตะวันออก', district: 'กบินทร์บุรี', areaRai: 1_400_000, riceShare: 0.38, fieldShare: 0.28 },
  { code: '26', name: 'นครนายก', region: 'ภาคตะวันออก', district: 'บ้านนา', areaRai: 600_000, riceShare: 0.42, fieldShare: 0.25 },
  { code: '27', name: 'สระแก้ว', region: 'ภาคตะวันออก', district: 'วังน้ำเย็น', areaRai: 2_300_000, riceShare: 0.48, fieldShare: 0.3 },
  { code: '30', name: 'นครราชสีมา', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'สีคิ้ว', areaRai: 7_800_000, riceShare: 0.42, fieldShare: 0.38 },
  { code: '31', name: 'บุรีรัมย์', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ประโคนชัย', areaRai: 5_200_000, riceShare: 0.48, fieldShare: 0.32 },
  { code: '32', name: 'สุรินทร์', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ปราสาท', areaRai: 3_700_000, riceShare: 0.65, fieldShare: 0.24 },
  { code: '33', name: 'ศรีสะเกษ', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'กันทรารมย์', areaRai: 3_300_000, riceShare: 0.7, fieldShare: 0.2 },
  { code: '34', name: 'อุบลราชธานี', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ตระการพืชผล', areaRai: 6_900_000, riceShare: 0.7, fieldShare: 0.2 },
  { code: '35', name: 'ยโสธร', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'กุดชุม', areaRai: 1_500_000, riceShare: 0.72, fieldShare: 0.2 },
  { code: '36', name: 'ชัยภูมิ', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ภูเขียว', areaRai: 3_400_000, riceShare: 0.55, fieldShare: 0.3 },
  { code: '37', name: 'อำนาจเจริญ', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ลืออำนาจ', areaRai: 1_100_000, riceShare: 0.68, fieldShare: 0.2 },
  { code: '38', name: 'บึงกาฬ', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'เซกา', areaRai: 900_000, riceShare: 0.55, fieldShare: 0.28 },
  { code: '39', name: 'หนองบัวลำภู', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ศรีบุญเรือง', areaRai: 1_150_000, riceShare: 0.62, fieldShare: 0.26 },
  { code: '40', name: 'ขอนแก่น', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'น้ำพอง', areaRai: 4_000_000, riceShare: 0.58, fieldShare: 0.26 },
  { code: '41', name: 'อุดรธานี', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'กุมภวาปี', areaRai: 3_500_000, riceShare: 0.6, fieldShare: 0.22 },
  { code: '42', name: 'เลย', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ภูเรือ', areaRai: 1_700_000, riceShare: 0.45, fieldShare: 0.32 },
  { code: '43', name: 'หนองคาย', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ท่าบ่อ', areaRai: 1_300_000, riceShare: 0.62, fieldShare: 0.22 },
  { code: '44', name: 'มหาสารคาม', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'วาปีปทุม', areaRai: 2_500_000, riceShare: 0.62, fieldShare: 0.24 },
  { code: '45', name: 'ร้อยเอ็ด', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'เกษตรวิสัย', areaRai: 3_100_000, riceShare: 0.68, fieldShare: 0.22 },
  { code: '46', name: 'กาฬสินธุ์', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'กมลาไสย', areaRai: 2_400_000, riceShare: 0.66, fieldShare: 0.24 },
  { code: '47', name: 'สกลนคร', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'พังโคน', areaRai: 2_100_000, riceShare: 0.64, fieldShare: 0.22 },
  { code: '48', name: 'นครพนม', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'ท่าอุเทน', areaRai: 1_400_000, riceShare: 0.68, fieldShare: 0.2 },
  { code: '49', name: 'มุกดาหาร', region: 'ภาคตะวันออกเฉียงเหนือ', district: 'เมืองมุกดาหาร', areaRai: 800_000, riceShare: 0.6, fieldShare: 0.22 },
  { code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ', district: 'ฝาง', areaRai: 2_700_000, riceShare: 0.4, fieldShare: 0.22 },
  { code: '51', name: 'ลำพูน', region: 'ภาคเหนือ', district: 'ป่าซาง', areaRai: 800_000, riceShare: 0.42, fieldShare: 0.2 },
  { code: '52', name: 'ลำปาง', region: 'ภาคเหนือ', district: 'เกาะคา', areaRai: 1_350_000, riceShare: 0.48, fieldShare: 0.22 },
  { code: '53', name: 'อุตรดิตถ์', region: 'ภาคเหนือ', district: 'ลับแล', areaRai: 1_200_000, riceShare: 0.52, fieldShare: 0.22 },
  { code: '54', name: 'แพร่', region: 'ภาคเหนือ', district: 'เด่นชัย', areaRai: 900_000, riceShare: 0.55, fieldShare: 0.2 },
  { code: '55', name: 'น่าน', region: 'ภาคเหนือ', district: 'ท่าวังผา', areaRai: 1_300_000, riceShare: 0.52, fieldShare: 0.18 },
  { code: '56', name: 'พะเยา', region: 'ภาคเหนือ', district: 'จุน', areaRai: 1_000_000, riceShare: 0.48, fieldShare: 0.22 },
  { code: '57', name: 'เชียงราย', region: 'ภาคเหนือ', district: 'แม่จัน', areaRai: 2_000_000, riceShare: 0.48, fieldShare: 0.2 },
  { code: '58', name: 'แม่ฮ่องสอน', region: 'ภาคเหนือ', district: 'ปาย', areaRai: 260_000, riceShare: 0.28, fieldShare: 0.1 },
  { code: '62', name: 'กำแพงเพชร', region: 'ภาคเหนือ', district: 'คลองขลุง', areaRai: 2_400_000, riceShare: 0.48, fieldShare: 0.3 },
  { code: '63', name: 'ตาก', region: 'ภาคเหนือ', district: 'แม่สอด', areaRai: 1_050_000, riceShare: 0.42, fieldShare: 0.28 },
  { code: '64', name: 'สุโขทัย', region: 'ภาคเหนือ', district: 'สวรรคโลก', areaRai: 1_850_000, riceShare: 0.55, fieldShare: 0.25 },
  { code: '65', name: 'พิษณุโลก', region: 'ภาคเหนือ', district: 'วังทอง', areaRai: 2_850_000, riceShare: 0.6, fieldShare: 0.22 },
  { code: '66', name: 'พิจิตร', region: 'ภาคเหนือ', district: 'โพทะเล', areaRai: 1_900_000, riceShare: 0.63, fieldShare: 0.2 },
  { code: '67', name: 'เพชรบูรณ์', region: 'ภาคเหนือ', district: 'หล่มเก่า', areaRai: 2_300_000, riceShare: 0.45, fieldShare: 0.32 },
  { code: '70', name: 'ราชบุรี', region: 'ภาคตะวันตก', district: 'ดำเนินสะดวก', areaRai: 1_300_000, riceShare: 0.4, fieldShare: 0.18 },
  { code: '71', name: 'กาญจนบุรี', region: 'ภาคตะวันตก', district: 'ท่าม่วง', areaRai: 2_600_000, riceShare: 0.3, fieldShare: 0.25 },
  { code: '72', name: 'สุพรรณบุรี', region: 'ภาคตะวันตก', district: 'อู่ทอง', areaRai: 3_100_000, riceShare: 0.62, fieldShare: 0.16 },
  { code: '73', name: 'นครปฐม', region: 'ภาคตะวันตก', district: 'กำแพงแสน', areaRai: 1_200_000, riceShare: 0.5, fieldShare: 0.15 },
  { code: '74', name: 'สมุทรสาคร', region: 'ภาคตะวันตก', district: 'เมืองสมุทรสาคร', areaRai: 320_000, riceShare: 0.15, fieldShare: 0.1 },
  { code: '75', name: 'สมุทรสงคราม', region: 'ภาคตะวันตก', district: 'อัมพวา', areaRai: 190_000, riceShare: 0.22, fieldShare: 0.08 },
  { code: '76', name: 'เพชรบุรี', region: 'ภาคตะวันตก', district: 'ท่ายาง', areaRai: 900_000, riceShare: 0.32, fieldShare: 0.14 },
  { code: '77', name: 'ประจวบคีรีขันธ์', region: 'ภาคตะวันตก', district: 'ปราณบุรี', areaRai: 1_100_000, riceShare: 0.28, fieldShare: 0.12 },
  { code: '80', name: 'นครศรีธรรมราช', region: 'ภาคใต้', district: 'ทุ่งสง', areaRai: 2_400_000, riceShare: 0.38, fieldShare: 0.05 },
  { code: '81', name: 'กระบี่', region: 'ภาคใต้', district: 'อ่าวลึก', areaRai: 900_000, riceShare: 0.28, fieldShare: 0.06 },
  { code: '82', name: 'พังงา', region: 'ภาคใต้', district: 'ทับปุด', areaRai: 600_000, riceShare: 0.25, fieldShare: 0.07 },
  { code: '83', name: 'ภูเก็ต', region: 'ภาคใต้', district: 'ถลาง', areaRai: 120_000, riceShare: 0.1, fieldShare: 0.05 },
  { code: '84', name: 'สุราษฎร์ธานี', region: 'ภาคใต้', district: 'พุนพิน', areaRai: 2_100_000, riceShare: 0.3, fieldShare: 0.05 },
  { code: '85', name: 'ระนอง', region: 'ภาคใต้', district: 'กะเปอร์', areaRai: 300_000, riceShare: 0.28, fieldShare: 0.04 },
  { code: '86', name: 'ชุมพร', region: 'ภาคใต้', district: 'หลังสวน', areaRai: 1_500_000, riceShare: 0.34, fieldShare: 0.06 },
  { code: '90', name: 'สงขลา', region: 'ภาคใต้', district: 'หาดใหญ่', areaRai: 1_800_000, riceShare: 0.32, fieldShare: 0.04 },
  { code: '91', name: 'สตูล', region: 'ภาคใต้', district: 'ควนโดน', areaRai: 500_000, riceShare: 0.3, fieldShare: 0.05 },
  { code: '92', name: 'ตรัง', region: 'ภาคใต้', district: 'กันตัง', areaRai: 1_100_000, riceShare: 0.36, fieldShare: 0.06 },
  { code: '93', name: 'พัทลุง', region: 'ภาคใต้', district: 'ควนขนุน', areaRai: 950_000, riceShare: 0.44, fieldShare: 0.05 },
  { code: '94', name: 'ปัตตานี', region: 'ภาคใต้', district: 'เมืองปัตตานี', areaRai: 550_000, riceShare: 0.42, fieldShare: 0.05 },
  { code: '95', name: 'ยะลา', region: 'ภาคใต้', district: 'ธารโต', areaRai: 450_000, riceShare: 0.38, fieldShare: 0.06 },
  { code: '96', name: 'นราธิวาส', region: 'ภาคใต้', district: 'สุไหงโก-ลก', areaRai: 480_000, riceShare: 0.4, fieldShare: 0.06 },
];

export const MACHINERY_PROVINCES: ReadonlyArray<{ code: string; name: string; region: Region }> = PROVINCE_SEEDS.map(
  (seed) => ({ code: seed.code, name: seed.name, region: seed.region }),
);

const READINESS_PARAMS: Record<
  MachineryType,
  { dailyRai: number; availability: number; hireShare: number }
> = {
  tractor: { dailyRai: 8, availability: 0.74, hireShare: 0.18 },
  combine_harvester: { dailyRai: 28, availability: 0.78, hireShare: 0.66 },
  transplanter: { dailyRai: 20, availability: 0.78, hireShare: 0.48 },
  drone: { dailyRai: 110, availability: 0.86, hireShare: 0.7 },
};

const RENTAL_BASE: Record<MachineryType, number> = {
  tractor: 430,
  combine_harvester: 690,
  transplanter: 390,
  drone: 95,
};

export const MACHINERY_SOURCES: MachinerySourceReference[] = [
  {
    id: 'doae',
    name: 'กรมส่งเสริมการเกษตร (DOAE)',
    url: 'https://www.doae.go.th',
    role: 'ทะเบียนเครื่องจักรกลการเกษตร กลุ่มแปลงใหญ่ และศูนย์บริการเกษตร',
    status: 'verified_reference',
    note: 'ใช้เป็นกรอบอ้างอิงประเภทเครื่องจักรและโครงสร้างศูนย์บริการ ยังไม่เชื่อมทะเบียนรายหน่วย',
  },
  {
    id: 'oae',
    name: 'สำนักงานเศรษฐกิจการเกษตร (OAE)',
    url: 'https://www.oae.go.th',
    role: 'สถิติพื้นที่เพาะปลูกและผลผลิต',
    status: 'verified_reference',
    note: 'ใช้สอบทานสัดส่วนพื้นที่พืชหลักและกรอบฤดูกาล',
  },
  {
    id: 'tama',
    name: 'สมาคมเครื่องจักรกลการเกษตรแห่งประเทศไทย',
    url: null,
    role: 'ข้อมูลผู้ประกอบการและตลาดบริการเครื่องจักรกล',
    status: 'pending_verification',
    note: 'ยังไม่ยืนยันเว็บไซต์ทางการและชุดข้อมูลค่าเช่าที่เผยแพร่ได้ จึงไม่แสดงลิงก์',
  },
];

export const MACHINERY_WARNINGS = [
  'ชุดข้อมูลนี้เป็น deterministic sample สำหรับสาธิตสัญญา API ไม่ใช่ทะเบียนเครื่องจักรกลหรือศูนย์บริการจริง และห้ามใช้เพื่ออนุมัติงบประมาณหรือจัดสรรเครื่องจักร',
  'ตัวเลขเครื่องจักร ค่าเช่า และภาระคิวเป็นค่าจำลองจากสมมติฐานพื้นที่และสัดส่วนการให้บริการ ไม่ได้วัดจากทะเบียนรายคัน',
  'โดรนการเกษตรไม่ถูกนับในดัชนีแรงม้า (HP/ไร่) เนื่องจากกำลังขับเคลื่อนไม่เทียบเท่าเครื่องจักรภาคพื้นดิน',
  'หมายเลขโทรศัพท์ พิกัด และที่อยู่ระดับแปลงของศูนย์บริการยังไม่เผยแพร่ในชุดตัวอย่างนี้',
  'สมาคมเครื่องจักรกลการเกษตรแห่งประเทศไทยยังไม่มีการยืนยัน URL ทางการ จึงไม่แสดงลิงก์',
];

const METHODOLOGY = [
  {
    title: 'ดัชนีเครื่องจักรกล (HP/ไร่)',
    detail:
      'ผลรวมแรงม้าของรถแทรกเตอร์ รถเกี่ยวนวดข้าว และรถดำนา หารด้วยพื้นที่เพาะปลูกทั้งหมดในขอบเขตที่เลือก โดยไม่นับโดรน',
  },
  {
    title: 'ความเพียงพอช่วงเก็บเกี่ยว',
    detail:
      'กำลังรับงาน = จำนวนเครื่อง × สัดส่วนที่เปิดให้จ้าง × ไร่ต่อวัน × วันในหน้าต่าง × อัตราพร้อมใช้งาน × ตัวคูณเครือข่ายศูนย์; ความต้องการ = สัดส่วนพื้นที่ที่ต้องดำเนินการในช่วงเวลาเดียวกัน; เกณฑ์ ≥115% เพียงพอมาก, ≥95% เพียงพอ, ≥80% ตึงตัว, ต่ำกว่า 80% ขาดแคลน',
  },
  {
    title: 'ค่าเช่าและศูนย์บริการ',
    detail:
      'ค่าเช่าเป็นค่ากลางตัวอย่างรายไร่ ปรับตามภูมิภาคและสภาพพื้นที่ ช่วงต่ำสุด–สูงสุดไม่ใช่ราคาประกาศ และชื่อศูนย์เป็นชื่อเชิงสถาบันที่สร้างขึ้น',
  },
  {
    title: 'ช่วงเวลาและขอบเขต',
    detail:
      'หน้าต่างเก็บเกี่ยวอ้างอิง 1 พ.ย. – 15 ธ.ค. 2569; ข้อมูลจังหวัดใช้พื้นที่เพาะปลูกรวมและสัดส่วนพืชหลัก ไม่ได้อนุมานจากพิกัดสถานีหรือกริด',
  },
];

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(key: string) {
  return mulberry32(hashString(key));
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function levelFor(adequacyPercent: number): ReadinessLevel {
  if (adequacyPercent >= 115) return 'surplus';
  if (adequacyPercent >= 95) return 'adequate';
  if (adequacyPercent >= 80) return 'tight';
  return 'deficit';
}

function normalizeShares(riceShare: number, fieldShare: number) {
  const rice = clamp(riceShare, 0.05, 0.85);
  let field = clamp(fieldShare, 0.03, 0.45);
  let other = 1 - rice - field;
  if (other < 0.05) {
    field = Math.max(0.03, field - (0.05 - other));
    other = 1 - rice - field;
  }
  return { rice, field, other: Math.max(0, other) };
}

function centerCountForArea(areaRai: number) {
  if (areaRai < 1_500_000) return 2;
  if (areaRai < 5_500_000) return 3;
  return 4;
}

function supportedTypesFor(kind: ServiceCenterKind, rng: () => number) {
  if (kind === 'mechanic') return [...MACHINERY_TYPE_IDS];
  if (kind === 'custom_hiring') {
    return MACHINERY_TYPE_IDS.filter(
      (type) =>
        type === 'tractor'
        || (type === 'combine_harvester' && rng() < 0.75)
        || (type === 'transplanter' && rng() < 0.68)
        || (type === 'drone' && rng() < 0.4),
    );
  }
  return MACHINERY_TYPE_IDS.filter(
    (type) =>
      type === 'tractor'
      || type === 'combine_harvester'
      || (type === 'transplanter' && rng() < 0.65)
      || (type === 'drone' && rng() < 0.5),
  );
}

const SERVICE_CENTER_SERVICES: Record<ServiceCenterKind, string[]> = {
  custom_hiring: ['จ้างเหมาไถพรวน/เตรียมดิน', 'จ้างเหมาเก็บเกี่ยว', 'บริการพร้อมพนักงานขับ', 'วางแผนคิวรายแปลง'],
  mechanic: ['ซ่อมเครื่องยนต์และระบบส่งกำลัง', 'ซ่อมระบบไฮดรอลิก', 'บริการซ่อมเคลื่อนที่', 'ตรวจสภาพก่อนฤดู'],
  large_field_group: ['บริหารเครื่องจักรร่วมกัน', 'บริการข้ามแปลง', 'จองคิวผ่านกลุ่ม', 'สนับสนุนโดรนและอุปกรณ์'],
};

const CONTACT_CHANNELS: Record<ServiceCenterKind, string> = {
  custom_hiring: 'จองผ่านสำนักงานเกษตรอำเภอหรือสหกรณ์การเกษตรในพื้นที่',
  mechanic: 'แจ้งซ่อมผ่านศูนย์เครื่องจักรกลการเกษตรจังหวัด',
  large_field_group: 'ประสานผ่านคณะกรรมการกลุ่มแปลงใหญ่ประจำตำบล',
};

const STATUS_LABELS: Record<ServiceCenterStatus, string> = {
  open: 'พร้อมให้บริการ',
  busy: 'คิวแน่น',
  maintenance: 'ปิดซ่อมบำรุง',
};

const VERIFIED_DATES = ['2026-10-24', '2026-10-22', '2026-10-20', '2026-10-18', '2026-10-16'];

function buildServiceCenters(seed: ProvinceSeed): ServiceCenter[] {
  const count = centerCountForArea(seed.areaRai);
  const kinds: ServiceCenterKind[] = ['custom_hiring'];
  if (count >= 2) kinds.push('mechanic');
  if (count >= 3) kinds.push('large_field_group');
  while (kinds.length < count) {
    kinds.push(kinds.length % 2 === 0 ? 'custom_hiring' : 'mechanic');
  }

  return kinds.map((kind, index) => {
    const rng = makeRng(`center:${seed.code}:${index + 1}`);
    const supportedTypes = supportedTypesFor(kind, rng);
    const ordinal = kinds.slice(0, index + 1).filter((value) => value === kind).length;
    const baseName =
      kind === 'custom_hiring'
        ? `ศูนย์จ้างเหมาเครื่องจักรกล ${seed.district}`
        : kind === 'mechanic'
          ? `ศูนย์บริการซ่อมเครื่องจักรกล ${seed.district}`
          : `กลุ่มแปลงใหญ่เครื่องจักรกล ${seed.district}`;
    const name = ordinal > 1 ? `${baseName} สาขา ${ordinal}` : baseName;

    const statusRoll = rng();
    const status: ServiceCenterStatus = statusRoll < 0.58 ? 'open' : statusRoll < 0.85 ? 'busy' : 'maintenance';
    const bookingLoadPercent =
      status === 'open'
        ? 30 + Math.floor(rng() * 36)
        : status === 'busy'
          ? 76 + Math.floor(rng() * 21)
          : Math.floor(rng() * 12);

    const operatorType =
      kind === 'custom_hiring'
        ? rng() < 0.55
          ? 'cooperative'
          : 'community_enterprise'
        : kind === 'mechanic'
          ? 'repair_network'
          : 'large_field_group';
    const operator =
      operatorType === 'cooperative'
        ? 'สหกรณ์การเกษตรระดับอำเภอ'
        : operatorType === 'community_enterprise'
          ? 'วิสาหกิจชุมชนเครื่องจักรกลการเกษตร'
          : operatorType === 'repair_network'
            ? 'เครือข่ายช่างเครื่องจักรกลชุมชน'
            : 'คณะกรรมการกลุ่มแปลงใหญ่';
    const operatorTypeLabel =
      operatorType === 'cooperative'
        ? 'สหกรณ์การเกษตร'
        : operatorType === 'community_enterprise'
          ? 'วิสาหกิจชุมชน'
          : operatorType === 'repair_network'
            ? 'เครือข่ายช่างชุมชน'
            : 'กลุ่มแปลงใหญ่';

    const availableUnits =
      kind === 'custom_hiring'
        ? 6 + Math.floor(rng() * 18) + supportedTypes.length * 2
        : kind === 'mechanic'
          ? 2 + Math.floor(rng() * 6)
          : 8 + Math.floor(rng() * 24);
    const certifiedMechanics =
      kind === 'mechanic' ? 3 + Math.floor(rng() * 6) : 1 + Math.floor(rng() * 4);

    return {
      id: `MC-${seed.code}-${index + 1}`,
      name,
      kind,
      kindLabel: KIND_LABELS[kind],
      provinceCode: seed.code,
      provinceName: seed.name,
      region: seed.region,
      district: seed.district,
      operator,
      operatorType,
      operatorTypeLabel,
      supportedTypes,
      availableUnits,
      certifiedMechanics,
      serviceRadiusKm: 15 + Math.floor(rng() * 9) * 5,
      responseHours: 2 + Math.floor(rng() * 23),
      bookingLoadPercent,
      status,
      statusLabel: STATUS_LABELS[status],
      services: SERVICE_CENTER_SERVICES[kind],
      contactChannel: CONTACT_CHANNELS[kind],
      verifiedAt: VERIFIED_DATES[Math.floor(rng() * VERIFIED_DATES.length)],
    };
  });
}

function demandFor(
  type: MachineryType,
  areas: { total: number; rice: number; field: number; other: number },
) {
  switch (type) {
    case 'tractor':
      return areas.total * 0.17;
    case 'combine_harvester':
      return areas.rice * 0.4 + areas.field * 0.1;
    case 'transplanter':
      return areas.rice * 0.06;
    case 'drone':
      return areas.rice * 0.08 + areas.field * 0.06 + areas.other * 0.06;
  }
}

function fleetUnitsFor(
  type: MachineryType,
  areaRai: number,
  riceAreaRai: number,
  region: Region,
  rng: () => number,
) {
  const profile = REGION_PROFILES[region];
  const base =
    type === 'tractor'
      ? (areaRai * profile.tractorIntensity) / 86
      : type === 'combine_harvester'
        ? (riceAreaRai * profile.combineIntensity) / 560
        : type === 'transplanter'
          ? (riceAreaRai * profile.transplanterIntensity) / 1650
          : (areaRai * profile.droneIntensity) / 7600;
  const jitter = 0.95 + rng() * 0.1;
  return Math.max(1, Math.round(base * jitter));
}

function averageHorsepowerFor(type: MachineryType, region: Region, rng: () => number) {
  if (type === 'drone') return null;
  if (type === 'transplanter') return Math.max(24, Math.round(32 + (rng() - 0.5) * 6));
  const base = type === 'tractor' ? REGION_PROFILES[region].tractorHp : REGION_PROFILES[region].combineHp;
  return Math.round(base + (rng() - 0.5) * 8);
}

function rentalRateFor(
  type: MachineryType,
  seed: ProvinceSeed,
  centersServing: number,
): RentalRate {
  const profile = REGION_PROFILES[seed.region];
  const rng = makeRng(`rate:${seed.code}:${type}`);
  let rate = RENTAL_BASE[type] * profile.costFactor;

  if (seed.region === 'ภาคเหนือ') rate *= type === 'combine_harvester' ? 1.06 : 1.03;
  if (seed.region === 'ภาคใต้') rate *= type === 'combine_harvester' ? 1.08 : 1.04;
  if (seed.region === 'ภาคตะวันออกเฉียงเหนือ') {
    rate *= type === 'drone' ? 0.95 : type === 'combine_harvester' ? 0.98 : 0.97;
  }

  rate *= 0.94 + rng() * 0.12;
  const step = type === 'drone' ? 5 : 10;
  const average = roundTo(rate, step);
  let min = roundTo(average * (0.82 + rng() * 0.04), step);
  let max = roundTo(average * (1.14 + rng() * 0.08), step);
  if (min >= average) min = average - step;
  if (max <= average) max = average + step;

  return {
    minBahtPerRai: Math.max(step, min),
    averageBahtPerRai: average,
    maxBahtPerRai: max,
    centersServing,
  };
}

function buildTypeStats(
  seed: ProvinceSeed,
  areas: { total: number; rice: number; field: number; other: number },
  centers: ServiceCenter[],
  networkFactor: number,
): MachineryTypeStat[] {
  const fleetRng = makeRng(`fleet:${seed.code}`);
  const hpRng = makeRng(`hp:${seed.code}`);

  return MACHINERY_TYPE_IDS.map((type) => {
    const definition = CATALOG_BY_TYPE[type];
    const units = fleetUnitsFor(type, areas.total, areas.rice, seed.region, fleetRng);
    const averageHorsepower = averageHorsepowerFor(type, seed.region, hpRng);
    const totalHorsepower = averageHorsepower === null ? null : units * averageHorsepower;
    const centersServing = centers.filter(
      (center) => center.kind !== 'mechanic' && center.supportedTypes.includes(type),
    ).length;
    const rental = rentalRateFor(type, seed, centersServing);
    const centersSupporting = centers.filter((center) => center.supportedTypes.includes(type)).length;
    const params = READINESS_PARAMS[type];
    const demandRai = Math.round(demandFor(type, areas));
    const dailyCapacityRai = Math.round(
      units * params.hireShare * params.dailyRai * params.availability * networkFactor,
    );
    const capacityRai = Math.round(dailyCapacityRai * definition.windowDays);
    const adequacyPercent = demandRai > 0 ? Math.round((capacityRai / demandRai) * 100) : 0;
    const level = levelFor(adequacyPercent);
    const shortfallMachines =
      capacityRai < demandRai
        ? Math.ceil(
            (demandRai - capacityRai)
              / (params.dailyRai * definition.windowDays * params.availability * params.hireShare * networkFactor),
          )
        : 0;

    return {
      type,
      units,
      unitsPer100kRai: Math.round((units / areas.total) * 100_000 * 10) / 10,
      averageHorsepower,
      totalHorsepower,
      mechanizationIndex: totalHorsepower === null ? null : round2(totalHorsepower / areas.total),
      rental,
      readiness: {
        level,
        adequacyPercent,
        demandRai,
        capacityRai,
        gapRai: capacityRai - demandRai,
        shortfallMachines,
        dailyCapacityRai,
      },
      centersSupporting,
    };
  });
}

function buildHarvest(types: MachineryTypeStat[]): HarvestSummary {
  const harvestTypes = types.filter((type) => CATALOG_BY_TYPE[type.type].inHarvestIndex);
  const demandRai = harvestTypes.reduce((sum, type) => sum + type.readiness.demandRai, 0);
  const capacityRai = harvestTypes.reduce((sum, type) => sum + type.readiness.capacityRai, 0);
  const adequacyPercent = demandRai > 0 ? Math.round((capacityRai / demandRai) * 100) : 0;
  const level = levelFor(adequacyPercent);
  const shortfallMachines = harvestTypes.reduce(
    (sum, type) => sum + type.readiness.shortfallMachines,
    0,
  );
  const dailyCapacityRai = harvestTypes.reduce(
    (sum, type) => sum + type.readiness.dailyCapacityRai,
    0,
  );

  return {
    readiness: {
      level,
      adequacyPercent,
      demandRai,
      capacityRai,
      gapRai: capacityRai - demandRai,
      shortfallMachines,
      dailyCapacityRai,
    },
    demandRai,
    capacityRai,
  };
}

function emptyCentersByKind(): CentersByKind {
  return { custom_hiring: 0, mechanic: 0, large_field_group: 0 };
}

function buildProvinceProfile(seed: ProvinceSeed): { profile: ProvinceMachineryProfile; centers: ServiceCenter[] } {
  const shareRng = makeRng(`share:${seed.code}`);
  const riceShare = clamp(seed.riceShare + (shareRng() - 0.5) * 0.02, 0.05, 0.85);
  const fieldShare = clamp(seed.fieldShare + (shareRng() - 0.5) * 0.02, 0.03, 0.45);
  const shares = normalizeShares(riceShare, fieldShare);

  const areaRai = seed.areaRai;
  const riceAreaRai = Math.round(areaRai * shares.rice);
  const fieldAreaRai = Math.round(areaRai * shares.field);
  const otherAreaRai = Math.max(0, areaRai - riceAreaRai - fieldAreaRai);
  const centers = buildServiceCenters(seed);
  const centersByKind = emptyCentersByKind();
  centers.forEach((center) => {
    centersByKind[center.kind] += 1;
  });

  const networkFactor = Math.min(1, 0.95 + Math.min(centers.length, 4) * 0.015);
  const types = buildTypeStats(
    seed,
    { total: areaRai, rice: riceAreaRai, field: fieldAreaRai, other: otherAreaRai },
    centers,
    networkFactor,
  );
  const harvest = buildHarvest(types);
  const totalUnits = types.reduce((sum, type) => sum + type.units, 0);
  const totalHorsepower = types.reduce((sum, type) => sum + (type.totalHorsepower ?? 0), 0);
  const droneUnits = types.find((type) => type.type === 'drone')?.units ?? 0;

  return {
    profile: {
      scopeId: seed.code,
      scopeLabel: `${seed.name} • ${seed.region}`,
      provinceCode: seed.code,
      provinceName: seed.name,
      region: seed.region,
      district: seed.district,
      provinceCount: 1,
      areaRai,
      riceAreaRai,
      fieldAreaRai,
      otherAreaRai,
      totalUnits,
      groundUnits: totalUnits - droneUnits,
      droneUnits,
      totalHorsepower,
      mechanizationIndex: round2(totalHorsepower / areaRai),
      centerCount: centers.length,
      centersByKind,
      types,
      harvest,
    },
    centers,
  };
}

function aggregateTypeStats(
  type: MachineryType,
  index: number,
  profiles: ProvinceMachineryProfile[],
): MachineryTypeStat {
  const stats = profiles.map((profile) => profile.types[index]);
  const areaRai = profiles.reduce((sum, profile) => sum + profile.areaRai, 0);
  const units = stats.reduce((sum, stat) => sum + stat.units, 0);
  const demandRai = stats.reduce((sum, stat) => sum + stat.readiness.demandRai, 0);
  const capacityRai = stats.reduce((sum, stat) => sum + stat.readiness.capacityRai, 0);
  const dailyCapacityRai = stats.reduce((sum, stat) => sum + stat.readiness.dailyCapacityRai, 0);
  const totalHorsepower = type === 'drone'
    ? null
    : stats.reduce((sum, stat) => sum + (stat.totalHorsepower ?? 0), 0);
  const averageHorsepower = type === 'drone'
    ? null
    : units > 0
      ? Math.round(
          stats.reduce((sum, stat) => sum + (stat.averageHorsepower ?? 0) * stat.units, 0) / units,
        )
      : null;
  const adequacyPercent = demandRai > 0 ? Math.round((capacityRai / demandRai) * 100) : 0;
  const level = levelFor(adequacyPercent);

  const weightOf = (profile: ProvinceMachineryProfile) =>
    type === 'combine_harvester' || type === 'transplanter'
      ? profile.riceAreaRai
      : profile.areaRai;
  const weightSum = profiles.reduce((sum, profile) => sum + weightOf(profile), 0);
  const weightedRental = profiles.reduce(
    (sum, profile) => sum + profile.types[index].rental.averageBahtPerRai * weightOf(profile),
    0,
  );
  const step = type === 'drone' ? 5 : 10;
  const rental: RentalRate = {
    minBahtPerRai: Math.min(...stats.map((stat) => stat.rental.minBahtPerRai)),
    averageBahtPerRai: roundTo(weightedRental / Math.max(1, weightSum), step),
    maxBahtPerRai: Math.max(...stats.map((stat) => stat.rental.maxBahtPerRai)),
    centersServing: stats.reduce((sum, stat) => sum + stat.rental.centersServing, 0),
  };

  return {
    type,
    units,
    unitsPer100kRai: areaRai > 0 ? Math.round((units / areaRai) * 100_000 * 10) / 10 : 0,
    averageHorsepower,
    totalHorsepower,
    mechanizationIndex: totalHorsepower === null || areaRai === 0 ? null : round2(totalHorsepower / areaRai),
    rental,
    readiness: {
      level,
      adequacyPercent,
      demandRai,
      capacityRai,
      gapRai: capacityRai - demandRai,
      shortfallMachines: stats.reduce((sum, stat) => sum + stat.readiness.shortfallMachines, 0),
      dailyCapacityRai,
    },
    centersSupporting: stats.reduce((sum, stat) => sum + stat.centersSupporting, 0),
  };
}

function aggregateProfiles(
  profiles: ProvinceMachineryProfile[],
  scopeId: string,
  scopeLabel: string,
): MachineryScopeSummary {
  const areaRai = profiles.reduce((sum, profile) => sum + profile.areaRai, 0);
  const riceAreaRai = profiles.reduce((sum, profile) => sum + profile.riceAreaRai, 0);
  const fieldAreaRai = profiles.reduce((sum, profile) => sum + profile.fieldAreaRai, 0);
  const otherAreaRai = profiles.reduce((sum, profile) => sum + profile.otherAreaRai, 0);
  const types = MACHINERY_TYPE_IDS.map((type, index) => aggregateTypeStats(type, index, profiles));
  const totalUnits = types.reduce((sum, type) => sum + type.units, 0);
  const totalHorsepower = types.reduce((sum, type) => sum + (type.totalHorsepower ?? 0), 0);
  const droneUnits = types.find((type) => type.type === 'drone')?.units ?? 0;
  const centersByKind = emptyCentersByKind();
  profiles.forEach((profile) => {
    SERVICE_CENTER_KIND_IDS.forEach((kind) => {
      centersByKind[kind] += profile.centersByKind[kind];
    });
  });

  return {
    scopeId,
    scopeLabel,
    provinceCount: profiles.length,
    areaRai,
    riceAreaRai,
    fieldAreaRai,
    otherAreaRai,
    totalUnits,
    groundUnits: totalUnits - droneUnits,
    droneUnits,
    totalHorsepower,
    mechanizationIndex: areaRai > 0 ? round2(totalHorsepower / areaRai) : 0,
    centerCount: profiles.reduce((sum, profile) => sum + profile.centerCount, 0),
    centersByKind,
    types,
    harvest: buildHarvest(types),
  };
}

type MachineryDataset = {
  profiles: ProvinceMachineryProfile[];
  centers: ServiceCenter[];
  national: MachineryScopeSummary;
  regions: RegionSummary[];
  filterOptions: MachineryFilterOptions;
};

let cachedDataset: MachineryDataset | null = null;

function getDataset(): MachineryDataset {
  if (cachedDataset) return cachedDataset;

  const built = PROVINCE_SEEDS.map(buildProvinceProfile);
  const profiles = built.map((entry) => entry.profile);
  const centers = built.flatMap((entry) => entry.centers);
  const national = aggregateProfiles(profiles, 'national', 'ภาพรวมประเทศ');
  const regions: RegionSummary[] = REGIONS.map((region) => {
    const subset = profiles.filter((profile) => profile.region === region);
    const aggregate = aggregateProfiles(subset, region, region);
    return {
      region,
      provinceCodes: subset.map((profile) => profile.provinceCode),
      provinceCount: subset.length,
      areaRai: aggregate.areaRai,
      totalUnits: aggregate.totalUnits,
      groundUnits: aggregate.groundUnits,
      centerCount: aggregate.centerCount,
      mechanizationIndex: aggregate.mechanizationIndex,
      harvestAdequacyPercent: aggregate.harvest.readiness.adequacyPercent,
      harvestLevel: aggregate.harvest.readiness.level,
    };
  });

  const filterOptions: MachineryFilterOptions = {
    provinces: MACHINERY_PROVINCES.map((province) => ({ ...province })),
    regions: REGIONS.map((region) => ({
      region,
      provinces: PROVINCE_SEEDS.filter((seed) => seed.region === region).map((seed) => ({
        code: seed.code,
        name: seed.name,
      })),
    })),
    machineryTypes: MACHINERY_TYPE_CATALOG,
    serviceCenterKinds: SERVICE_CENTER_KIND_CATALOG,
  };

  cachedDataset = { profiles, centers, national, regions, filterOptions };
  return cachedDataset;
}

function normalizeSearch(value: string) {
  return value.normalize('NFC').trim().toLocaleLowerCase('th');
}

function centerSearchText(center: ServiceCenter) {
  const typeLabels = center.supportedTypes.flatMap((type) => {
    const definition = CATALOG_BY_TYPE[type];
    return [definition.name, definition.shortName, definition.englishName];
  });
  return normalizeSearch(
    [
      center.name,
      center.provinceName,
      center.region,
      center.district,
      center.operator,
      center.operatorTypeLabel,
      center.kindLabel,
      center.contactChannel,
      ...center.services,
      ...typeLabels,
      ...center.supportedTypes,
    ].join(' '),
  );
}

export function buildMachineryDashboard(
  filters: MachineryDashboardFilters = {},
): MachineryDashboardPayload {
  const dataset = getDataset();
  const selectedProvince =
    filters.provinceCode
      ? dataset.profiles.find((profile) => profile.provinceCode === filters.provinceCode) ?? null
      : null;
  const scope = selectedProvince ?? dataset.national;
  const machineryType = filters.machineryType ?? null;
  const typeDefinition = machineryType ? CATALOG_BY_TYPE[machineryType] : null;
  const centerKind = filters.centerKind ?? null;
  const search = (filters.search ?? '').normalize('NFC').trim();
  const normalizedSearch = normalizeSearch(search);

  const serviceCenters = dataset.centers.filter((center) => {
    if (selectedProvince && center.provinceCode !== selectedProvince.provinceCode) return false;
    if (machineryType && !center.supportedTypes.includes(machineryType)) return false;
    if (centerKind && center.kind !== centerKind) return false;
    if (normalizedSearch && !centerSearchText(center).includes(normalizedSearch)) return false;
    return true;
  });

  return {
    sample: true,
    dataAsOf: DATA_AS_OF,
    dataAsOfLabel: '25 ต.ค. 2569',
    season: SEASON,
    filters: {
      provinceCode: selectedProvince?.provinceCode ?? null,
      machineryType,
      centerKind,
      search,
    },
    focus: {
      provinceCode: selectedProvince?.provinceCode ?? null,
      provinceName: selectedProvince?.provinceName ?? null,
      machineryType,
      machineryTypeName: typeDefinition?.name ?? null,
      scopeLabel: selectedProvince ? `${selectedProvince.provinceName} • ${selectedProvince.region}` : 'ภาพรวมประเทศ',
    },
    national: dataset.national,
    scope,
    machineryTypeCatalog: MACHINERY_TYPE_CATALOG,
    filterOptions: dataset.filterOptions,
    provinces: dataset.profiles,
    regions: dataset.regions,
    serviceCenters,
    sources: MACHINERY_SOURCES,
    methodology: METHODOLOGY,
    warnings: MACHINERY_WARNINGS,
  };
}
