/**
 * ระบบคำนวณปุ๋ยสั่งตัดและสมดุลธาตุอาหารพืช
 * หน้า /fertilizer และ /api/v1/fertilizer
 *
 * ไฟล์นี้ตั้งใจไม่ใช้ `import 'server-only'` เพราะ dashboard ฝั่ง client เรียก
 * calculateFertilizer() ตัวเดียวกันเพื่อคำนวณสดเมื่อเลื่อน slider โดยไม่ต้อง fetch
 * และไม่มีการอ่าน D1/ไฟล์/network ในไฟล์นี้
 *
 * แหล่งข้อมูลราชการ:
 * - DOAE/PPSF "คำแนะนำการใช้ปุ๋ยตามค่าวิเคราะห์ดิน" (ตาราง OM×P×K 27/36 แบบ)
 * - DOA "เอกสารวิชาการ คำแนะนำการใช้ปุ๋ยสำหรับไม้ผล" (ตารางที่ 5 ทุเรียน, ก.ย. 2566)
 * - LDD ใช้เฉพาะคำแนะนำเชิงคุณภาพเรื่อง pH/ปูน ไม่ได้ใช้ตัวเลขลึกลับใด ๆ
 *
 * สมมติฐานของแบบจำลอง (ไม่ใช่ค่าทางการ) อยู่ใน model.adjustments/notes และ warnings
 * ทุกครั้ง; ห้ามนำผลไปใช้แทนคำแนะนำรายแปลงหรือผลวิเคราะห์ดินจริง
 */

export type CropId =
  | 'rice-photosensitive'
  | 'rice-non-photosensitive'
  | 'corn'
  | 'cassava'
  | 'sugarcane-plant'
  | 'sugarcane-ratoon'
  | 'durian'
  | 'longan'
  | 'litchi'
  | 'rubber';

export type CropGroupId =
  | 'rice'
  | 'corn'
  | 'cassava'
  | 'sugarcane'
  | 'durian'
  | 'longan'
  | 'litchi'
  | 'rubber';

export interface FertilizerPrices {
  urea: number;
  dap: number;
  mop: number;
  baseline: number;
}

export interface FertilizerInput {
  crop: CropId;
  soilN: number;
  soilP: number;
  soilK: number;
  omPercent: number;
  ph: number;
  targetYieldRai: number;
  prices?: Partial<FertilizerPrices>;
}

export interface NutrientAmounts {
  n: number;
  p2o5: number;
  k2o: number;
}

export interface MaterialAmounts {
  urea: number;
  dap: number;
  mop: number;
}

export interface AxisClass {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
  center: number;
}

export interface CropAxis {
  label: string;
  unit: string;
  classes: AxisClass[];
}

export interface CropBaseline {
  grade: string;
  nPercent: number;
  p2o5Percent: number;
  k2oPercent: number;
  defaultPriceThbPerKg: number;
  note: string;
}

export interface CropProfileSummary {
  id: CropId;
  groupId: CropGroupId;
  name: string;
  shortName: string;
  variant: string | null;
  officialUnit: 'kg_per_rai' | 'g_per_tree_year';
  densityTreesPerRai: number | null;
  referenceYieldRai: number;
  referenceYieldLabel: string;
  omAxis: CropAxis;
  pAxis: CropAxis;
  kAxis: CropAxis;
  baseline: CropBaseline;
  sourceIds: string[];
  notes: string[];
}

export type CropProfile = CropProfileSummary;

export interface SoilAssessment {
  omClass: string;
  omClassLabel: string;
  pClass: string;
  pClassLabel: string;
  kClass: string;
  kClassLabel: string;
  phStatus: 'very_acidic' | 'acidic' | 'optimal' | 'alkaline';
  phLabel: string;
  limeAdvice: string | null;
  warnings: string[];
}

export interface YieldAdjustment {
  referenceYieldRai: number;
  ratio: number;
  factor: number;
  clamped: boolean;
  warning: string | null;
}

export interface SoilNCredit {
  referenceSoilN: number;
  creditKgPerRai: number;
  capped: boolean;
  note: string;
}

export interface FertilizerConflict {
  code: 'N_P_CONFLICT';
  message: string;
  nFromDap: number;
  nTarget: number;
  p2o5Gap: number;
}

export interface FertilizerBalance {
  target: NutrientAmounts;
  delivered: NutrientAmounts;
  gap: NutrientAmounts;
  excess: NutrientAmounts;
  feasible: boolean;
  conflict: FertilizerConflict | null;
}

export interface ApplicationStage {
  index: number;
  label: string;
  timing: string;
  share: number;
  urea: number;
  dap: number;
  mop: number;
  n: number;
  p2o5: number;
  k2o: number;
  note: string;
}

export interface CostEstimate {
  prices: FertilizerPrices;
  straightCostThbPerRai: number;
  baseline: {
    grade: string;
    nPercent: number;
    p2o5Percent: number;
    k2oPercent: number;
    kgPerRai: number;
    costThbPerRai: number;
    delivered: NutrientAmounts;
    gap: NutrientAmounts;
    note: string;
  };
  savingsThbPerRai: number;
  savingsPercent: number;
  assumptions: string[];
}

export interface FertilizerSource {
  id: string;
  name: string;
  title: string;
  url: string | null;
  note: string;
}

export interface FertilizerResult {
  crop: CropProfileSummary;
  input: FertilizerInput;
  soil: SoilAssessment;
  yieldAdjustment: YieldAdjustment;
  soilNCredit: SoilNCredit;
  officialTargetPerRai: NutrientAmounts;
  targetPerRai: NutrientAmounts;
  mixPerRai: MaterialAmounts;
  balancePerRai: FertilizerBalance;
  perTree: null | {
    densityTreesPerRai: number;
    target: NutrientAmounts;
    mix: MaterialAmounts;
  };
  applicationsPerRai: ApplicationStage[];
  cost: CostEstimate;
  warnings: string[];
  sources: FertilizerSource[];
  model: {
    version: string;
    officialBasis: string;
    adjustments: string[];
    notes: string[];
    disclaimer: string;
    dataNature: 'model_output';
    fieldSpecific: false;
  };
}

type RawRow = readonly number[];

type RowKind = 'field4' | 'field3' | 'tree3' | 'durian12';

type StageAllocation =
  | 'stage2-official'
  | 'single'
  | 'equal2'
  | 'equal4'
  | 'stage4-official';

interface StageTemplate {
  label: string;
  timing: string;
  note: string;
}

interface InternalAxisClass extends AxisClass {
  gridIndex: number;
}

interface InternalCropAxis extends CropAxis {
  classes: InternalAxisClass[];
}

interface InternalCropProfile extends CropProfileSummary {
  omAxis: InternalCropAxis;
  pAxis: InternalCropAxis;
  kAxis: InternalCropAxis;
  rows: readonly RawRow[];
  rowKind: RowKind;
  omGridCount: number;
  pGridCount: number;
  kGridCount: number;
  stages: StageTemplate[];
  allocation: StageAllocation;
}

export const FERTILIZER_MODEL_VERSION = 'fertilizer-balance-v1-2026.10';

export const DEFAULT_FERTILIZER_PRICES: FertilizerPrices = {
  urea: 18.5,
  dap: 27.5,
  mop: 20.5,
  baseline: 24.5,
};

export const FERTILIZER_DISCLAIMER =
  'ผลคำนวณนี้เป็นแบบจำลองจากตารางแนะนำปุ๋ยตามค่าวิเคราะห์ดินของกรมส่งเสริมการเกษตร ' +
  'และตารางปุ๋ยไม้ผลของกรมวิชาการเกษตร เพื่อสาธิตการสมดุลธาตุอาหารด้วยแม่ปุ๋ย 3 ชนิด ' +
  'ไม่ใช่คำแนะนำเฉพาะแปลง ไม่ผ่านการสอบเทียบกับผลผลิตจริง และไม่รับประกันการประหยัดต้นทุน ' +
  'ต้องยืนยันกับนักวิชาการเกษตรและผลวิเคราะห์ดินจากห้องปฏิบัติการมาตรฐานก่อนใช้จริง ' +
  'ห้ามใช้ตัวเลขในหน้านี้แทนคำแนะนำปุ๋ยราชการหรือฉลากปุ๋ย';

export const FERTILIZER_SOURCES: FertilizerSource[] = [
  {
    id: 'doae',
    name: 'กรมส่งเสริมการเกษตร (DOAE/PPSF)',
    title: 'คำแนะนำการใช้ปุ๋ยตามค่าวิเคราะห์ดิน',
    url: 'https://ppsf.doae.go.th/wp-content/uploads/2024/11/คำแนะนำการใช้ปุ๋ยตามค่าวิเคราะห์ดิน.pdf',
    note: 'ตาราง OM×P×K สำหรับข้าว ข้าวโพด มันสำปะหลัง อ้อย ลำไย ลิ้นจี่ และยางพารา',
  },
  {
    id: 'doa',
    name: 'กรมวิชาการเกษตร (DOA)',
    title: 'เอกสารวิชาการ คำแนะนำการใช้ปุ๋ยสำหรับไม้ผล (ISBN 978-974-436-987-1, กันยายน 2566)',
    url: null,
    note: 'ตารางที่ 5 การผสมปุ๋ยใช้เองสำหรับทุเรียน 4 ระยะการเจริญเติบโต',
  },
  {
    id: 'ldd',
    name: 'กรมพัฒนาที่ดิน (LDD)',
    title: 'ข้อมูลชุดดินและคำแนะนำการจัดการดิน/ปูน',
    url: 'https://www.ldd.go.th',
    note: 'ใช้เฉพาะคำแนะนำเชิงคุณภาพเรื่อง pH ปูน และอินทรียวัตถุ ไม่ได้ใช้ตัวเลขลับเฉพาะ',
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
}

function scaleNutrients(value: NutrientAmounts, factor: number): NutrientAmounts {
  return { n: value.n * factor, p2o5: value.p2o5 * factor, k2o: value.k2o * factor };
}

function scaleMaterials(value: MaterialAmounts, factor: number): MaterialAmounts {
  return { urea: value.urea * factor, dap: value.dap * factor, mop: value.mop * factor };
}
const RICE_PHOTOSENSITIVE_ROWS: readonly RawRow[] = [
  [5, 13, 10, 10],
  [5, 13, 5, 10],
  [5, 13, 0, 10],
  [7, 7, 10, 10],
  [7, 7, 5, 10],
  [7, 0, 0, 10],
  [10, 0, 10, 10],
  [10, 0, 5, 10],
  [10, 7, 0, 10],
  [0, 13, 10, 8],
  [0, 13, 5, 8],
  [0, 13, 0, 8],
  [4, 7, 10, 7],
  [4, 7, 5, 7],
  [4, 0, 0, 7],
  [7, 0, 10, 7],
  [7, 0, 5, 7],
  [7, 7, 0, 7],
  [0, 13, 10, 4],
  [0, 13, 5, 4],
  [0, 13, 0, 4],
  [0, 7, 10, 4],
  [0, 7, 5, 4],
  [0, 0, 0, 4],
  [4, 0, 10, 4],
  [4, 0, 5, 4],
  [4, 7, 0, 4],
];

const RICE_NON_PHOTOSENSITIVE_ROWS: readonly RawRow[] = [
  [14, 13, 10, 20],
  [14, 13, 5, 20],
  [14, 13, 0, 20],
  [17, 7, 10, 20],
  [17, 7, 5, 20],
  [17, 0, 0, 20],
  [20, 0, 10, 20],
  [20, 0, 5, 20],
  [20, 7, 0, 20],
  [8, 13, 10, 13],
  [8, 13, 5, 13],
  [8, 13, 0, 13],
  [10, 7, 10, 13],
  [10, 7, 5, 13],
  [10, 0, 0, 13],
  [13, 0, 10, 13],
  [13, 0, 5, 13],
  [13, 7, 0, 13],
  [0, 13, 10, 8],
  [0, 13, 5, 8],
  [0, 13, 0, 8],
  [4, 7, 10, 7],
  [4, 7, 5, 7],
  [4, 0, 0, 7],
  [7, 0, 10, 7],
  [7, 0, 5, 7],
  [7, 7, 0, 7],
];

const CORN_ROWS: readonly RawRow[] = [
  [8, 22, 25, 16],
  [8, 22, 17, 16],
  [8, 22, 8, 16],
  [12, 11, 25, 16],
  [12, 11, 17, 16],
  [12, 11, 8, 16],
  [14, 5, 25, 16],
  [14, 5, 17, 16],
  [14, 5, 8, 16],
  [0, 22, 25, 11],
  [0, 22, 17, 11],
  [0, 22, 8, 11],
  [7, 11, 25, 11],
  [7, 11, 17, 11],
  [7, 11, 8, 11],
  [9, 5, 25, 11],
  [9, 5, 17, 11],
  [9, 5, 8, 11],
  [0, 22, 25, 2],
  [0, 22, 17, 2],
  [0, 22, 8, 2],
  [0, 11, 25, 7],
  [0, 11, 17, 7],
  [0, 11, 8, 7],
  [0, 5, 25, 9],
  [0, 5, 17, 9],
  [0, 5, 8, 9],
];

const CASSAVA_ROWS: readonly RawRow[] = [
  [28, 17, 27],
  [28, 17, 13],
  [28, 17, 7],
  [31, 9, 27],
  [31, 9, 13],
  [31, 9, 7],
  [33, 4, 27],
  [33, 4, 13],
  [33, 4, 7],
  [28, 17, 27],
  [28, 17, 13],
  [28, 17, 7],
  [31, 9, 27],
  [31, 9, 13],
  [31, 9, 7],
  [33, 4, 27],
  [33, 4, 13],
  [33, 4, 7],
  [11, 17, 27],
  [11, 17, 13],
  [11, 17, 7],
  [14, 9, 27],
  [14, 9, 13],
  [14, 9, 7],
  [16, 4, 27],
  [16, 4, 13],
  [16, 4, 7],
  [2, 17, 27],
  [2, 17, 13],
  [2, 17, 7],
  [5, 9, 27],
  [5, 9, 13],
  [5, 9, 7],
  [7, 4, 27],
  [7, 4, 13],
  [7, 4, 7],
];

const SUGARCANE_PLANT_ROWS: readonly RawRow[] = [
  [22, 20, 30, 29],
  [22, 20, 20, 29],
  [22, 20, 10, 29],
  [24, 13, 30, 29],
  [24, 13, 20, 29],
  [24, 13, 10, 29],
  [27, 7, 30, 29],
  [27, 7, 20, 29],
  [27, 7, 10, 29],
  [9, 20, 30, 16],
  [9, 20, 20, 16],
  [9, 20, 10, 16],
  [11, 13, 30, 16],
  [11, 13, 20, 16],
  [11, 13, 10, 16],
  [14, 7, 30, 16],
  [14, 7, 20, 16],
  [14, 7, 10, 16],
  [5, 20, 30, 13],
  [5, 20, 20, 13],
  [5, 20, 10, 13],
  [8, 13, 30, 13],
  [8, 13, 20, 13],
  [8, 13, 10, 13],
  [10, 7, 30, 13],
  [10, 7, 20, 13],
  [10, 7, 10, 13],
  [0, 20, 30, 7],
  [0, 20, 20, 7],
  [0, 20, 10, 7],
  [1, 13, 30, 7],
  [1, 13, 20, 7],
  [1, 13, 10, 7],
  [4, 7, 30, 7],
  [4, 7, 20, 7],
  [4, 7, 10, 7],
];

const SUGARCANE_RATOON_ROWS: readonly RawRow[] = [
  [22, 20, 30, 29],
  [22, 20, 20, 29],
  [22, 20, 10, 29],
  [24, 13, 30, 29],
  [24, 13, 20, 29],
  [24, 13, 10, 29],
  [27, 7, 30, 29],
  [27, 7, 20, 29],
  [27, 7, 10, 29],
  [12, 20, 30, 20],
  [12, 20, 20, 20],
  [12, 20, 10, 20],
  [14, 13, 30, 20],
  [14, 13, 20, 20],
  [14, 13, 10, 20],
  [17, 7, 30, 20],
  [17, 7, 20, 20],
  [17, 7, 10, 20],
  [9, 20, 30, 16],
  [9, 20, 20, 16],
  [9, 20, 10, 16],
  [11, 13, 30, 16],
  [11, 13, 20, 16],
  [11, 13, 10, 16],
  [14, 7, 30, 16],
  [14, 7, 20, 16],
  [14, 7, 10, 16],
  [2, 20, 30, 10],
  [2, 20, 20, 10],
  [2, 20, 10, 10],
  [5, 13, 30, 10],
  [5, 13, 20, 10],
  [5, 13, 10, 10],
  [7, 7, 30, 10],
  [7, 7, 20, 10],
  [7, 7, 10, 10],
];

const LONGAN_ROWS: readonly RawRow[] = [
  [2500, 1700, 2300],
  [2500, 1700, 1100],
  [2500, 1700, 600],
  [2800, 900, 2300],
  [2800, 900, 1100],
  [2800, 900, 600],
  [3000, 400, 2300],
  [3000, 400, 1100],
  [3000, 400, 600],
  [900, 1700, 2300],
  [900, 1700, 1100],
  [900, 1700, 600],
  [1200, 900, 2300],
  [1200, 900, 1100],
  [1200, 900, 600],
  [1400, 400, 2300],
  [1400, 400, 1100],
  [1400, 400, 600],
  [100, 1700, 2300],
  [100, 1700, 1100],
  [100, 1700, 600],
  [400, 900, 2300],
  [400, 900, 1100],
  [400, 900, 600],
  [600, 400, 2300],
  [600, 400, 1100],
  [600, 400, 600],
];

const LITCHI_ROWS: readonly RawRow[] = [
  [2000, 1200, 1900],
  [2000, 1200, 900],
  [2000, 1200, 500],
  [2200, 600, 1900],
  [2200, 600, 900],
  [2200, 600, 500],
  [2300, 300, 1900],
  [2300, 300, 900],
  [2300, 300, 500],
  [700, 1200, 1900],
  [700, 1200, 900],
  [700, 1200, 500],
  [1000, 600, 1900],
  [1000, 600, 900],
  [1000, 600, 500],
  [1100, 300, 1900],
  [1100, 300, 900],
  [1100, 300, 500],
  [100, 1200, 1900],
  [100, 1200, 900],
  [100, 1200, 500],
  [400, 600, 1900],
  [400, 600, 900],
  [400, 600, 500],
  [500, 300, 1900],
  [500, 300, 900],
  [500, 300, 500],
];

const RUBBER_ROWS: readonly RawRow[] = [
  [40, 16, 28],
  [40, 16, 21],
  [43, 8, 28],
  [43, 8, 21],
  [27, 16, 28],
  [27, 16, 21],
  [30, 8, 28],
  [30, 8, 21],
  [17, 16, 28],
  [17, 16, 21],
  [20, 8, 28],
  [20, 8, 21],
];

const DURIAN_ROWS: readonly RawRow[] = [
  [1700, 500, 500, 800, 600, 1000, 1000, 700, 1000, 0, 0, 700],
  [1700, 500, 300, 800, 600, 500, 1000, 700, 500, 0, 0, 300],
  [1700, 500, 100, 800, 600, 200, 1000, 700, 300, 0, 0, 200],
  [1800, 300, 500, 900, 300, 1000, 1100, 300, 1000, 0, 0, 700],
  [1800, 300, 300, 900, 300, 500, 1100, 300, 500, 0, 0, 300],
  [1800, 300, 100, 900, 300, 200, 1100, 300, 300, 0, 0, 200],
  [1900, 100, 500, 1000, 100, 1000, 1100, 200, 1000, 0, 0, 700],
  [1900, 100, 300, 1000, 100, 500, 1100, 200, 500, 0, 0, 300],
  [1900, 100, 100, 1000, 100, 200, 1100, 200, 300, 0, 0, 200],
  [700, 500, 500, 300, 600, 1000, 400, 700, 1000, 0, 0, 700],
  [700, 500, 300, 300, 600, 500, 400, 700, 500, 0, 0, 300],
  [700, 500, 100, 300, 600, 200, 400, 700, 300, 0, 0, 200],
  [800, 300, 500, 400, 300, 1000, 500, 300, 1000, 0, 0, 700],
  [800, 300, 300, 400, 300, 500, 500, 300, 500, 0, 0, 300],
  [800, 300, 100, 400, 300, 200, 500, 300, 300, 0, 0, 200],
  [900, 100, 500, 500, 100, 1000, 600, 200, 1000, 0, 0, 700],
  [900, 100, 300, 500, 100, 500, 600, 200, 500, 0, 0, 300],
  [900, 100, 100, 500, 100, 200, 600, 200, 300, 0, 0, 200],
  [500, 500, 500, 200, 600, 1000, 200, 700, 1000, 0, 0, 700],
  [500, 500, 300, 200, 600, 500, 200, 700, 500, 0, 0, 300],
  [500, 500, 100, 200, 600, 200, 200, 700, 300, 0, 0, 200],
  [600, 300, 500, 300, 300, 1000, 300, 300, 1000, 0, 0, 700],
  [600, 300, 300, 300, 300, 500, 300, 300, 500, 0, 0, 300],
  [600, 300, 100, 300, 300, 200, 300, 300, 300, 0, 0, 200],
  [700, 100, 500, 400, 100, 1000, 400, 200, 1000, 0, 0, 700],
  [700, 100, 300, 400, 100, 500, 400, 200, 500, 0, 0, 300],
  [700, 100, 100, 400, 100, 200, 400, 200, 300, 0, 0, 200],
];


/* ------------------------------------------------------------------ */
/* แกนค่าวิเคราะห์ดิน: ช่วงระดับตามตารางราชการ + จุดกลางสำหรับ interpolate */
/* ------------------------------------------------------------------ */

type AxisEntry = Omit<InternalAxisClass, 'gridIndex'> & { gridIndex?: number };

function axis(label: string, unit: string, entries: AxisEntry[]): InternalCropAxis {
  return {
    label,
    unit,
    classes: entries.map((entry, index) => ({ ...entry, gridIndex: entry.gridIndex ?? index })),
  };
}

const RICE_OM = axis('อินทรียวัตถุ (OM)', '%', [
  { key: 'low', label: 'ต่ำ (<1.0)', min: null, max: 1.0, center: 0.75 },
  { key: 'medium', label: 'ปานกลาง (1.0–2.0)', min: 1.0, max: 2.0, center: 1.5 },
  { key: 'high', label: 'สูง (>2.0)', min: 2.0, max: null, center: 2.5 },
]);

const RICE_P = axis('ฟอสฟอรัสที่เป็นประโยชน์ (P, Bray II)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<5)', min: null, max: 5, center: 2.5 },
  { key: 'medium', label: 'ปานกลาง (5–10)', min: 5, max: 10, center: 7.5 },
  { key: 'high', label: 'สูง (>10)', min: 10, max: null, center: 15 },
]);

const RICE_K = axis('โพแทสเซียมที่แลกเปลี่ยนได้ (K, NH4OAc)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<60)', min: null, max: 60, center: 45 },
  { key: 'medium', label: 'ปานกลาง (60–80)', min: 60, max: 80, center: 70 },
  { key: 'high', label: 'สูง (>80)', min: 80, max: null, center: 100 },
]);

const CORN_P = axis('ฟอสฟอรัสที่เป็นประโยชน์ (P, Bray II)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<10)', min: null, max: 10, center: 5 },
  { key: 'medium', label: 'ปานกลาง (10–15)', min: 10, max: 15, center: 12.5 },
  { key: 'high', label: 'สูง (>15)', min: 15, max: null, center: 20 },
]);

const CORN_K = axis('โพแทสเซียมที่แลกเปลี่ยนได้ (K, NH4OAc)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<60)', min: null, max: 60, center: 45 },
  { key: 'medium', label: 'ปานกลาง (60–100)', min: 60, max: 100, center: 80 },
  { key: 'high', label: 'สูง (>100)', min: 100, max: null, center: 120 },
]);

const CASSAVA_OM = axis('อินทรียวัตถุ (OM)', '%', [
  { key: 'very_low', label: 'ต่ำมาก (<0.6)', min: null, max: 0.6, center: 0.45 },
  { key: 'low', label: 'ต่ำ (0.6–1.0)', min: 0.6, max: 1.0, center: 0.8 },
  { key: 'medium', label: 'ปานกลาง (1.0–2.0)', min: 1.0, max: 2.0, center: 1.5 },
  { key: 'high', label: 'สูง (>2.0)', min: 2.0, max: null, center: 2.5 },
]);

const CASSAVA_P = axis('ฟอสฟอรัสที่เป็นประโยชน์ (P, Bray II)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<5)', min: null, max: 5, center: 2.5 },
  { key: 'medium', label: 'ปานกลาง (5–30)', min: 5, max: 30, center: 17.5 },
  { key: 'high', label: 'สูง (>30)', min: 30, max: null, center: 40 },
]);

const CASSAVA_K = axis('โพแทสเซียมที่แลกเปลี่ยนได้ (K, NH4OAc)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<30)', min: null, max: 30, center: 20 },
  { key: 'medium', label: 'ปานกลาง (30–90)', min: 30, max: 90, center: 60 },
  { key: 'high', label: 'สูง (>90)', min: 90, max: null, center: 120 },
]);

const SUGARCANE_OM = axis('อินทรียวัตถุ (OM)', '%', [
  { key: 'very_low', label: 'ต่ำมาก (<0.75)', min: null, max: 0.75, center: 0.5 },
  { key: 'low', label: 'ต่ำ (0.75–1.5)', min: 0.75, max: 1.5, center: 1.125 },
  { key: 'medium', label: 'ปานกลาง (1.5–2.25)', min: 1.5, max: 2.25, center: 1.875 },
  { key: 'high', label: 'สูง (>2.25)', min: 2.25, max: null, center: 2.5 },
]);

const SUGARCANE_P = axis('ฟอสฟอรัสที่เป็นประโยชน์ (P, Bray II)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<7)', min: null, max: 7, center: 4 },
  { key: 'medium', label: 'ปานกลาง (7–30)', min: 7, max: 30, center: 18.5 },
  { key: 'high', label: 'สูง (>30)', min: 30, max: null, center: 40 },
]);

const SUGARCANE_K = axis('โพแทสเซียมที่แลกเปลี่ยนได้ (K, NH4OAc)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<60)', min: null, max: 60, center: 45 },
  { key: 'medium', label: 'ปานกลาง (60–90)', min: 60, max: 90, center: 75 },
  { key: 'high', label: 'สูง (>90)', min: 90, max: null, center: 120 },
]);

const TREE_OM = axis('อินทรียวัตถุ (OM)', '%', [
  { key: 'low', label: 'ต่ำ (<2.0)', min: null, max: 2.0, center: 1.5 },
  { key: 'medium', label: 'ปานกลาง (2.0–3.0)', min: 2.0, max: 3.0, center: 2.5 },
  { key: 'high', label: 'สูง (>3.0)', min: 3.0, max: null, center: 3.5 },
]);

const TREE_P = axis('ฟอสฟอรัสที่เป็นประโยชน์ (P, Bray II)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<15)', min: null, max: 15, center: 10 },
  { key: 'medium', label: 'ปานกลาง (15–45)', min: 15, max: 45, center: 30 },
  { key: 'high', label: 'สูง (>45)', min: 45, max: null, center: 60 },
]);

const TREE_K = axis('โพแทสเซียมที่แลกเปลี่ยนได้ (K, NH4OAc)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<50)', min: null, max: 50, center: 35 },
  { key: 'medium', label: 'ปานกลาง (50–100)', min: 50, max: 100, center: 75 },
  { key: 'high', label: 'สูง (>100)', min: 100, max: null, center: 130 },
]);

const RUBBER_OM = axis('อินทรียวัตถุ (OM)', '%', [
  { key: 'low', label: 'ต่ำ (<0.9)', min: null, max: 0.9, center: 0.7 },
  { key: 'medium', label: 'ปานกลาง (0.9–2.6)', min: 0.9, max: 2.6, center: 1.75 },
  { key: 'high', label: 'สูง (>2.6)', min: 2.6, max: null, center: 3.0 },
]);

// ตารางยางพาราไม่มีแถว P สูง (>30) จึงให้ชั้นสูงใช้ gridIndex ของชั้นปานกลาง
const RUBBER_P = axis('ฟอสฟอรัสที่เป็นประโยชน์ (P, Bray II)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<11)', min: null, max: 11, center: 7, gridIndex: 0 },
  { key: 'medium', label: 'ปานกลาง (11–30)', min: 11, max: 30, center: 20, gridIndex: 1 },
  { key: 'high', label: 'สูง (>30) — ตารางไม่มีแถวเฉพาะ', min: 30, max: null, center: 40, gridIndex: 1 },
]);

const RUBBER_K = axis('โพแทสเซียมที่แลกเปลี่ยนได้ (K, NH4OAc)', 'มก./กก.', [
  { key: 'low', label: 'ต่ำ (<40)', min: null, max: 40, center: 30 },
  { key: 'medium', label: 'ปานกลาง (>40)', min: 40, max: null, center: 60 },
]);

const RICE_STAGES: StageTemplate[] = [
  {
    label: 'ครั้งที่ 1',
    timing: 'ระยะปักดำหรือหลังปักดำ 15–20 วัน หรือหว่าน 20–30 วันหลังงอก',
    note: 'ไม่ใส่ปุ๋ยบนดินแห้ง; ควรรอให้มีน้ำในนา',
  },
  {
    label: 'ครั้งที่ 2',
    timing: 'ระยะกำเนิดช่อดอก',
    note: 'ใช้ยูเรียตามตารางราชการ',
  },
];

const CORN_STAGES: StageTemplate[] = [
  {
    label: 'ครั้งที่ 1',
    timing: 'รองพื้นพร้อมปลูก',
    note: 'ดินร่วนถึงดินเหนียว; ดินทรายให้แบ่งใส่ตามคำแนะนำในเอกสาร',
  },
  {
    label: 'ครั้งที่ 2',
    timing: 'อายุ 3–4 สัปดาห์หลังปลูก',
    note: 'โรยข้างแถวปลูกแล้วพรวนดินกลบ เมื่อดินมีความชื้นเหมาะสม',
  },
];

const CASSAVA_STAGES: StageTemplate[] = [
  {
    label: 'ครั้งที่ 1',
    timing: 'อายุ 1–2 เดือน หรือหลังกำจัดวัชพืชครั้งแรก',
    note: 'ดินทรายแบ่งใส่ 2 ครั้ง (อายุ 1 เดือน และ 2 เดือน)',
  },
];

const SUGARCANE_PLANT_STAGES: StageTemplate[] = [
  {
    label: 'ครั้งที่ 1',
    timing: 'รองพื้นพร้อมปลูก',
    note: 'ดินทราย/ร่วนปนทราย: ฟอสเฟตใส่ทั้งหมดครั้งแรก และแบ่ง N/K เป็น 3 ครั้ง',
  },
  {
    label: 'ครั้งที่ 2',
    timing: 'อายุ 3–4 เดือน หรือ 5–6 เดือนกรณีปลูกข้ามแล้ง',
    note: 'โรยข้างแถวแล้วพรวนดินกลบ',
  },
];

const SUGARCANE_RATOON_STAGES: StageTemplate[] = [
  {
    label: 'ครั้งที่ 1',
    timing: 'หลังเก็บเกี่ยวอ้อย 1–2 เดือน',
    note: 'ดินทราย/ร่วนปนทราย: ฟอสเฟตใส่ทั้งหมดครั้งแรก และแบ่ง N/K เป็น 3 ครั้ง',
  },
  {
    label: 'ครั้งที่ 2',
    timing: 'อายุ 3–4 เดือน หรือ 5–6 เดือนกรณีปลูกข้ามแล้ง',
    note: 'โรยข้างแถวแล้วพรวนดินกลบ',
  },
];

const RUBBER_STAGES: StageTemplate[] = [
  { label: 'ครั้งที่ 1', timing: 'ต้นฤดูฝน', note: 'ใส่บริเวณกึ่งกลางระหว่างแถวยางแล้วกลบ' },
  { label: 'ครั้งที่ 2', timing: 'ปลายฤดูฝน', note: 'แบ่งใส่ 2 ครั้งต่อปีตามคำแนะนำราชการ' },
];

const FRUIT_EQUAL_STAGES: StageTemplate[] = [
  { label: 'ระยะบำรุงต้น', timing: 'ช่วงตัดแต่งกิ่งหลังเก็บเกี่ยว', note: 'ตารางราชการให้ยอดรวมต่อปี; การแบ่งเท่า 4 ระยะเป็นสมมติฐานของแบบจำลอง' },
  { label: 'ระยะสร้างตาดอก', timing: 'ก่อนออกดอก 1–2 เดือน', note: 'ตารางราชการให้ยอดรวมต่อปี; การแบ่งเท่า 4 ระยะเป็นสมมติฐานของแบบจำลอง' },
  { label: 'ระยะบำรุงผล', timing: 'หลังดอกบาน 1 เดือน', note: 'ตารางราชการให้ยอดรวมต่อปี; การแบ่งเท่า 4 ระยะเป็นสมมติฐานของแบบจำลอง' },
  { label: 'ระยะปรับปรุงคุณภาพ', timing: 'ก่อนเก็บเกี่ยว 2 เดือน', note: 'ตารางราชการให้ยอดรวมต่อปี; การแบ่งเท่า 4 ระยะเป็นสมมติฐานของแบบจำลอง' },
];

const DURIAN_STAGES: StageTemplate[] = [
  { label: 'ระยะบำรุงต้น', timing: 'ช่วงตัดแต่งกิ่งหลังเก็บเกี่ยว', note: 'ตารางที่ 5 ของ DOA กำหนดอัตราแยกตามระยะ' },
  { label: 'ระยะสร้างตาดอก', timing: 'ก่อนออกดอก 1–2 เดือน', note: 'ตารางที่ 5 ของ DOA กำหนดอัตราแยกตามระยะ' },
  { label: 'ระยะบำรุงผล', timing: 'หลังดอกบาน 1 เดือน', note: 'ตารางที่ 5 ของ DOA กำหนดอัตราแยกตามระยะ' },
  { label: 'ระยะปรับปรุงคุณภาพ', timing: 'ก่อนเก็บเกี่ยว 2 เดือน', note: 'ตารางที่ 5 ของ DOA กำหนดอัตราแยกตามระยะ' },
];

function baseline(
  grade: string,
  nPercent: number,
  p2o5Percent: number,
  k2oPercent: number,
  defaultPriceThbPerKg: number,
  note: string,
): CropBaseline {
  return { grade, nPercent, p2o5Percent, k2oPercent, defaultPriceThbPerKg, note };
}

const BASELINE_RICE = baseline(
  '16-20-0',
  16,
  20,
  0,
  25.0,
  'ปุ๋ยผสมที่ใช้เทียบให้ N เท่ากัน; ยังต้องเติม K ตามเป้าหมาย จึงไม่ใช่การเทียบ NPK ครบชุด',
);

const BASELINE_15_15_15 = baseline(
  '15-15-15',
  15,
  15,
  15,
  24.5,
  'ปุ๋ยผสมที่ใช้เทียบให้ N เท่ากัน; P/K ที่ได้อาจไม่ตรงเป้าหมายของพืช',
);

const BASELINE_RUBBER = baseline(
  '15-7-18',
  15,
  7,
  18,
  26.0,
  'ปุ๋ยผสมที่ใช้เทียบให้ N เท่ากัน; เหมาะกับยางพารามากกว่าสูตร 15-15-15 แต่ยังไม่เท่า NPK ครบชุด',
);

const RICE_NOTES = [
  'ตาราง PPSF 27 แบบ; แบ่งใส่ 2 ครั้งตามระยะปักดำและกำเนิดช่อดอก',
  'ตารางราชการไม่ได้ใช้ค่า N ในดินโดยตรง; แบบจำลองนี้ใช้ N เป็นตัวปรับเสริมอย่างระมัดระวัง',
];

const CORN_NOTES = [
  'ตาราง PPSF 27 แบบ; ครั้งที่ 2 ใส่เมื่ออายุ 3–4 สัปดาห์',
  'เอกสารราชการระบุว่าดิน pH >7.3 ควรใช้แอมโมเนียมซัลเฟตแทนยูเรีย; โมดูลนี้มีเพียงยูเรียจึงแจ้งเตือนแต่ไม่สลับวัสดุ',
];

const CASSAVA_NOTES = [
  'ตาราง PPSF 36 แบบ; ดินทรายแบ่งใส่ 2 ครั้ง',
  'ตารางให้ยอดรวมครั้งเดียวสำหรับดินร่วนถึงดินเหนียว',
];

const SUGARCANE_NOTES = [
  'ตาราง PPSF 36 แบบ; ดินทราย/ร่วนปนทรายแบ่ง N/K เป็น 3 ครั้ง',
  'ตารางให้ฟอสเฟตทั้งหมดในครั้งแรก',
];

const DURIAN_NOTES = [
  'ตารางที่ 5 ของ DOA (กันยายน 2566) สำหรับทุเรียนให้ผลผลิตแล้ว ทรงพุ่ม 8 เมตร',
  'ต้นฉบับพิมพ์ 3,000 กรัมในระยะบำรุงผลของแถว 9/12/15/18/21; ใช้ 300 กรัมตามแถวข้างเคียงและความสมดุลธาตุ',
  'ความหนาแน่น 25 ต้น/ไร่เป็นสมมติฐานจากระยะปลูก 8×8 เมตร',
];

const LONGAN_NOTES = [
  'ตาราง PPSF 27 แบบ สำหรับลำไยทรงพุ่ม 8 เมตร',
  'ตารางให้ยอดรวมต่อปี; การแบ่ง 4 ระยะเท่า ๆ กันเป็นสมมติฐานของแบบจำลอง',
  'ความหนาแน่น 25 ต้น/ไร่เป็นสมมติฐานจากระยะปลูก 8×8 เมตร',
];

const LITCHI_NOTES = [
  'ตาราง PPSF 27 แบบ สำหรับลิ้นจี่ทรงพุ่ม 6 เมตร',
  'ตารางให้ยอดรวมต่อปี; การแบ่ง 4 ระยะเท่า ๆ กันเป็นสมมติฐานของแบบจำลอง',
  'ความหนาแน่น 44 ต้น/ไร่เป็นสมมติฐานจากระยะปลูก 6×6 เมตร',
];

const RUBBER_NOTES = [
  'ตาราง PPSF 12 แบบ สำหรับยางพาราหลังเปิดกรีด 70 ต้น/ไร่',
  'แบ่งใส่ 2 ครั้งต่อปี ตามคำแนะนำราชการ',
  'ตารางไม่มีชั้น P สูง (>30); ระบบใช้ชั้นปานกลางและแจ้งเตือนเมื่อค่า P เกิน 30',
];

const INTERNAL_CROPS: InternalCropProfile[] = [
  {
    id: 'rice-photosensitive',
    groupId: 'rice',
    name: 'ข้าว',
    shortName: 'ข้าว',
    variant: 'ไวต่อช่วงแสง',
    officialUnit: 'kg_per_rai',
    densityTreesPerRai: null,
    referenceYieldRai: 450,
    referenceYieldLabel: '450 กก./ไร่',
    omAxis: RICE_OM,
    pAxis: RICE_P,
    kAxis: RICE_K,
    rows: RICE_PHOTOSENSITIVE_ROWS,
    rowKind: 'field4',
    omGridCount: 3,
    pGridCount: 3,
    kGridCount: 3,
    stages: RICE_STAGES,
    allocation: 'stage2-official',
    baseline: BASELINE_RICE,
    sourceIds: ['doae', 'ldd'],
    notes: RICE_NOTES,
  },
  {
    id: 'rice-non-photosensitive',
    groupId: 'rice',
    name: 'ข้าว',
    shortName: 'ข้าว',
    variant: 'ไม่ไวต่อช่วงแสง',
    officialUnit: 'kg_per_rai',
    densityTreesPerRai: null,
    referenceYieldRai: 450,
    referenceYieldLabel: '450 กก./ไร่',
    omAxis: RICE_OM,
    pAxis: RICE_P,
    kAxis: RICE_K,
    rows: RICE_NON_PHOTOSENSITIVE_ROWS,
    rowKind: 'field4',
    omGridCount: 3,
    pGridCount: 3,
    kGridCount: 3,
    stages: RICE_STAGES,
    allocation: 'stage2-official',
    baseline: BASELINE_RICE,
    sourceIds: ['doae', 'ldd'],
    notes: RICE_NOTES,
  },
  {
    id: 'corn',
    groupId: 'corn',
    name: 'ข้าวโพดเลี้ยงสัตว์',
    shortName: 'ข้าวโพด',
    variant: null,
    officialUnit: 'kg_per_rai',
    densityTreesPerRai: null,
    referenceYieldRai: 1000,
    referenceYieldLabel: '1,000 กก./ไร่',
    omAxis: RICE_OM,
    pAxis: CORN_P,
    kAxis: CORN_K,
    rows: CORN_ROWS,
    rowKind: 'field4',
    omGridCount: 3,
    pGridCount: 3,
    kGridCount: 3,
    stages: CORN_STAGES,
    allocation: 'stage2-official',
    baseline: BASELINE_15_15_15,
    sourceIds: ['doae', 'ldd'],
    notes: CORN_NOTES,
  },
  {
    id: 'cassava',
    groupId: 'cassava',
    name: 'มันสำปะหลัง',
    shortName: 'มันสำปะหลัง',
    variant: null,
    officialUnit: 'kg_per_rai',
    densityTreesPerRai: null,
    referenceYieldRai: 3500,
    referenceYieldLabel: '3,500 กก./ไร่',
    omAxis: CASSAVA_OM,
    pAxis: CASSAVA_P,
    kAxis: CASSAVA_K,
    rows: CASSAVA_ROWS,
    rowKind: 'field3',
    omGridCount: 4,
    pGridCount: 3,
    kGridCount: 3,
    stages: CASSAVA_STAGES,
    allocation: 'single',
    baseline: BASELINE_15_15_15,
    sourceIds: ['doae', 'ldd'],
    notes: CASSAVA_NOTES,
  },
  {
    id: 'sugarcane-plant',
    groupId: 'sugarcane',
    name: 'อ้อยโรงงาน',
    shortName: 'อ้อย',
    variant: 'อ้อยปลูก',
    officialUnit: 'kg_per_rai',
    densityTreesPerRai: null,
    referenceYieldRai: 10000,
    referenceYieldLabel: '10,000 กก./ไร่',
    omAxis: SUGARCANE_OM,
    pAxis: SUGARCANE_P,
    kAxis: SUGARCANE_K,
    rows: SUGARCANE_PLANT_ROWS,
    rowKind: 'field4',
    omGridCount: 4,
    pGridCount: 3,
    kGridCount: 3,
    stages: SUGARCANE_PLANT_STAGES,
    allocation: 'stage2-official',
    baseline: BASELINE_15_15_15,
    sourceIds: ['doae', 'ldd'],
    notes: SUGARCANE_NOTES,
  },
  {
    id: 'sugarcane-ratoon',
    groupId: 'sugarcane',
    name: 'อ้อยโรงงาน',
    shortName: 'อ้อย',
    variant: 'อ้อยตอ',
    officialUnit: 'kg_per_rai',
    densityTreesPerRai: null,
    referenceYieldRai: 10000,
    referenceYieldLabel: '10,000 กก./ไร่',
    omAxis: SUGARCANE_OM,
    pAxis: SUGARCANE_P,
    kAxis: SUGARCANE_K,
    rows: SUGARCANE_RATOON_ROWS,
    rowKind: 'field4',
    omGridCount: 4,
    pGridCount: 3,
    kGridCount: 3,
    stages: SUGARCANE_RATOON_STAGES,
    allocation: 'stage2-official',
    baseline: BASELINE_15_15_15,
    sourceIds: ['doae', 'ldd'],
    notes: SUGARCANE_NOTES,
  },
  {
    id: 'durian',
    groupId: 'durian',
    name: 'ทุเรียน',
    shortName: 'ทุเรียน',
    variant: null,
    officialUnit: 'g_per_tree_year',
    densityTreesPerRai: 25,
    referenceYieldRai: 1200,
    referenceYieldLabel: '1,200 กก./ไร่',
    omAxis: TREE_OM,
    pAxis: TREE_P,
    kAxis: TREE_K,
    rows: DURIAN_ROWS,
    rowKind: 'durian12',
    omGridCount: 3,
    pGridCount: 3,
    kGridCount: 3,
    stages: DURIAN_STAGES,
    allocation: 'stage4-official',
    baseline: BASELINE_15_15_15,
    sourceIds: ['doa', 'ldd'],
    notes: DURIAN_NOTES,
  },
  {
    id: 'longan',
    groupId: 'longan',
    name: 'ลำไย',
    shortName: 'ลำไย',
    variant: null,
    officialUnit: 'g_per_tree_year',
    densityTreesPerRai: 25,
    referenceYieldRai: 1000,
    referenceYieldLabel: '1,000 กก./ไร่',
    omAxis: TREE_OM,
    pAxis: TREE_P,
    kAxis: TREE_K,
    rows: LONGAN_ROWS,
    rowKind: 'tree3',
    omGridCount: 3,
    pGridCount: 3,
    kGridCount: 3,
    stages: FRUIT_EQUAL_STAGES,
    allocation: 'equal4',
    baseline: BASELINE_15_15_15,
    sourceIds: ['doae', 'ldd'],
    notes: LONGAN_NOTES,
  },
  {
    id: 'litchi',
    groupId: 'litchi',
    name: 'ลิ้นจี่',
    shortName: 'ลิ้นจี่',
    variant: null,
    officialUnit: 'g_per_tree_year',
    densityTreesPerRai: 44,
    referenceYieldRai: 880,
    referenceYieldLabel: '880 กก./ไร่',
    omAxis: TREE_OM,
    pAxis: TREE_P,
    kAxis: TREE_K,
    rows: LITCHI_ROWS,
    rowKind: 'tree3',
    omGridCount: 3,
    pGridCount: 3,
    kGridCount: 3,
    stages: FRUIT_EQUAL_STAGES,
    allocation: 'equal4',
    baseline: BASELINE_15_15_15,
    sourceIds: ['doae', 'ldd'],
    notes: LITCHI_NOTES,
  },
  {
    id: 'rubber',
    groupId: 'rubber',
    name: 'ยางพารา',
    shortName: 'ยางพารา',
    variant: null,
    officialUnit: 'kg_per_rai',
    densityTreesPerRai: 70,
    referenceYieldRai: 300,
    referenceYieldLabel: '300 กก.ยางแห้ง/ไร่',
    omAxis: RUBBER_OM,
    pAxis: RUBBER_P,
    kAxis: RUBBER_K,
    rows: RUBBER_ROWS,
    rowKind: 'field3',
    omGridCount: 3,
    pGridCount: 2,
    kGridCount: 2,
    stages: RUBBER_STAGES,
    allocation: 'equal2',
    baseline: BASELINE_RUBBER,
    sourceIds: ['doae', 'ldd'],
    notes: RUBBER_NOTES,
  },
];

function publicAxis(axisValue: InternalCropAxis): CropAxis {
  return {
    label: axisValue.label,
    unit: axisValue.unit,
    classes: axisValue.classes.map((item) => ({
      key: item.key,
      label: item.label,
      min: item.min,
      max: item.max,
      center: item.center,
    })),
  };
}

function toSummary(crop: InternalCropProfile): CropProfileSummary {
  return {
    id: crop.id,
    groupId: crop.groupId,
    name: crop.name,
    shortName: crop.shortName,
    variant: crop.variant,
    officialUnit: crop.officialUnit,
    densityTreesPerRai: crop.densityTreesPerRai,
    referenceYieldRai: crop.referenceYieldRai,
    referenceYieldLabel: crop.referenceYieldLabel,
    omAxis: publicAxis(crop.omAxis),
    pAxis: publicAxis(crop.pAxis),
    kAxis: publicAxis(crop.kAxis),
    baseline: crop.baseline,
    sourceIds: crop.sourceIds,
    notes: crop.notes,
  };
}

export const FERTILIZER_CROPS: CropProfile[] = INTERNAL_CROPS.map(toSummary);
export const FERTILIZER_CROP_SUMMARIES: CropProfileSummary[] = FERTILIZER_CROPS;

function getInternalCrop(cropId: string): InternalCropProfile | undefined {
  return INTERNAL_CROPS.find((crop) => crop.id === cropId);
}

export function getFertilizerCrop(cropId: string): CropProfile | undefined {
  return FERTILIZER_CROPS.find((crop) => crop.id === cropId);
}

export function formatCropLabel(crop: CropProfileSummary): string {
  return crop.variant ? `${crop.name} (${crop.variant})` : crop.name;
}

/* ------------------------------------------------------------------ */
/* การจำแนกระดับดินและการ interpolate                                   */
/* ------------------------------------------------------------------ */

function classify(axisValue: InternalCropAxis, value: number): InternalAxisClass {
  const found = axisValue.classes.find((item) => {
    const aboveMin = item.min === null || value >= item.min;
    const belowMax = item.max === null || value < item.max;
    return aboveMin && belowMax;
  });
  return found ?? axisValue.classes[axisValue.classes.length - 1];
}

interface AxisSegment {
  g0: number;
  g1: number;
  t: number;
}

function segment(axisValue: InternalCropAxis, value: number): AxisSegment {
  const classes = axisValue.classes;
  if (value <= classes[0].center) {
    return { g0: classes[0].gridIndex, g1: classes[0].gridIndex, t: 0 };
  }
  const last = classes[classes.length - 1];
  if (value >= last.center) {
    return { g0: last.gridIndex, g1: last.gridIndex, t: 0 };
  }
  for (let index = 0; index < classes.length - 1; index += 1) {
    const current = classes[index];
    const next = classes[index + 1];
    if (value >= current.center && value <= next.center) {
      const span = next.center - current.center;
      const t = span > 0 ? (value - current.center) / span : 0;
      return { g0: current.gridIndex, g1: next.gridIndex, t };
    }
  }
  return { g0: last.gridIndex, g1: last.gridIndex, t: 0 };
}

function rowAt(crop: InternalCropProfile, om: number, p: number, k: number): RawRow {
  return crop.rows[om * crop.pGridCount * crop.kGridCount + p * crop.kGridCount + k];
}

function interpolateRaw(crop: InternalCropProfile, soilN: number, soilP: number, soilK: number, omPercent: number): number[] {
  const om = segment(crop.omAxis, omPercent);
  const p = segment(crop.pAxis, soilP);
  const k = segment(crop.kAxis, soilK);
  const componentCount = crop.rowKind === 'durian12' ? 12 : crop.rowKind === 'field4' ? 4 : 3;
  const result = new Array<number>(componentCount).fill(0);
  const omPairs: Array<[number, number]> = [
    [om.g0, 1 - om.t],
    [om.g1, om.t],
  ];
  const pPairs: Array<[number, number]> = [
    [p.g0, 1 - p.t],
    [p.g1, p.t],
  ];
  const kPairs: Array<[number, number]> = [
    [k.g0, 1 - k.t],
    [k.g1, k.t],
  ];
  for (const [omIndex, omWeight] of omPairs) {
    for (const [pIndex, pWeight] of pPairs) {
      for (const [kIndex, kWeight] of kPairs) {
        const weight = omWeight * pWeight * kWeight;
        if (weight === 0) continue;
        const row = rowAt(crop, omIndex, pIndex, kIndex);
        for (let i = 0; i < componentCount; i += 1) {
          result[i] += row[i] * weight;
        }
      }
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* การแปลงหน่วยและสมการปุ๋ย                                            */
/* ------------------------------------------------------------------ */

function toPerRaiFactor(crop: InternalCropProfile): number {
  if (crop.officialUnit === 'g_per_tree_year' && crop.densityTreesPerRai) {
    return crop.densityTreesPerRai / 1000;
  }
  return 1;
}

function officialStages(crop: InternalCropProfile, raw: number[]): MaterialAmounts[] {
  const factor = toPerRaiFactor(crop);
  if (crop.rowKind === 'field4') {
    return [
      { urea: raw[0] * factor, dap: raw[1] * factor, mop: raw[2] * factor },
      { urea: raw[3] * factor, dap: 0, mop: 0 },
    ];
  }
  if (crop.rowKind === 'durian12') {
    return [
      { urea: raw[0] * factor, dap: raw[1] * factor, mop: raw[2] * factor },
      { urea: raw[3] * factor, dap: raw[4] * factor, mop: raw[5] * factor },
      { urea: raw[6] * factor, dap: raw[7] * factor, mop: raw[8] * factor },
      { urea: raw[9] * factor, dap: raw[10] * factor, mop: raw[11] * factor },
    ];
  }
  return [{ urea: raw[0] * factor, dap: raw[1] * factor, mop: raw[2] * factor }];
}

function sumMaterials(stages: MaterialAmounts[]): MaterialAmounts {
  return stages.reduce(
    (total, stage) => ({
      urea: total.urea + stage.urea,
      dap: total.dap + stage.dap,
      mop: total.mop + stage.mop,
    }),
    { urea: 0, dap: 0, mop: 0 },
  );
}

function nutrients(materials: MaterialAmounts): NutrientAmounts {
  return {
    n: materials.urea * 0.46 + materials.dap * 0.18,
    p2o5: materials.dap * 0.46,
    k2o: materials.mop * 0.6,
  };
}

function allocateMaterial(values: number[], target: number, fallback: 'equal' | 'first'): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    return values.map((value) => (value * target) / total);
  }
  if (target <= 0) {
    return values.map(() => 0);
  }
  if (fallback === 'equal') {
    return values.map(() => target / values.length);
  }
  const allocated = values.map(() => 0);
  allocated[0] = target;
  return allocated;
}

function allocateStages(
  crop: InternalCropProfile,
  official: MaterialAmounts[],
  adjusted: MaterialAmounts,
): ApplicationStage[] {
  let stages: MaterialAmounts[];
  if (crop.allocation === 'single') {
    stages = [adjusted];
  } else if (crop.allocation === 'equal2' || crop.allocation === 'equal4') {
    const count = crop.allocation === 'equal2' ? 2 : 4;
    stages = Array.from({ length: count }, () => ({
      urea: adjusted.urea / count,
      dap: adjusted.dap / count,
      mop: adjusted.mop / count,
    }));
  } else {
    const ureaValues = official.map((stage) => stage.urea);
    const dapValues = official.map((stage) => stage.dap);
    const mopValues = official.map((stage) => stage.mop);
    const ureaAllocated = allocateMaterial(ureaValues, adjusted.urea, 'equal');
    const dapAllocated = allocateMaterial(dapValues, adjusted.dap, 'first');
    const mopAllocated = allocateMaterial(mopValues, adjusted.mop, 'first');
    stages = official.map((_, index) => ({
      urea: ureaAllocated[index],
      dap: dapAllocated[index],
      mop: mopAllocated[index],
    }));
  }

  const template = crop.stages;
  const totalMaterial = stages.reduce(
    (sum, stage) => sum + stage.urea + stage.dap + stage.mop,
    0,
  );

  return stages.map((stage, index) => {
    const stageNutrients = nutrients(stage);
    const stageMaterial = stage.urea + stage.dap + stage.mop;
    const templateStage = template[index] ?? template[template.length - 1];
    return {
      index: index + 1,
      label: templateStage.label,
      timing: templateStage.timing,
      share: totalMaterial > 0 ? stageMaterial / totalMaterial : 0,
      urea: stage.urea,
      dap: stage.dap,
      mop: stage.mop,
      n: stageNutrients.n,
      p2o5: stageNutrients.p2o5,
      k2o: stageNutrients.k2o,
      note: templateStage.note,
    };
  });
}

interface SolvedMix {
  mix: MaterialAmounts;
  balance: FertilizerBalance;
}

function solveMix(target: NutrientAmounts): SolvedMix {
  const dapByP = target.p2o5 / 0.46;
  const dapByN = target.n / 0.18;
  const dap = Math.min(dapByP, dapByN);
  const mop = target.k2o / 0.6;
  const urea = Math.max(0, (target.n - dap * 0.18) / 0.46);
  const mix = { urea, dap, mop };
  const delivered = nutrients(mix);
  const gap: NutrientAmounts = {
    n: Math.max(0, target.n - delivered.n),
    p2o5: Math.max(0, target.p2o5 - delivered.p2o5),
    k2o: Math.max(0, target.k2o - delivered.k2o),
  };
  const excess: NutrientAmounts = {
    n: Math.max(0, delivered.n - target.n),
    p2o5: Math.max(0, delivered.p2o5 - target.p2o5),
    k2o: Math.max(0, delivered.k2o - target.k2o),
  };
  const tolerance = {
    n: Math.max(0.05, target.n * 0.005),
    p2o5: Math.max(0.05, target.p2o5 * 0.005),
    k2o: Math.max(0.05, target.k2o * 0.005),
  };
  const pShortfall = dapByP > 0 && dap < dapByP - 1e-9;
  const conflict: FertilizerConflict | null = pShortfall
    ? {
        code: 'N_P_CONFLICT',
        message:
          'N ในสูตรไม่พอสำหรับ DAP ที่ต้องใช้ตามเป้าหมาย P ระบบจึงจำกัด DAP เพื่อไม่ให้ N เกินเป้าหมาย ' +
          `ทำให้ขาด P2O5 ประมาณ ${Math.max(0, (dapByP - dap) * 0.46).toFixed(2)} กก./ไร่; ` +
          'ควรใช้ปุ๋ยฟอสเฟตเพิ่มเติมนอกสูตรแม่ปุ๋ย 3 ชนิดนี้',
        nFromDap: dap * 0.18,
        nTarget: target.n,
        p2o5Gap: Math.max(0, target.p2o5 - dap * 0.46),
      }
    : null;
  const feasible =
    conflict === null &&
    gap.n <= tolerance.n &&
    gap.p2o5 <= tolerance.p2o5 &&
    gap.k2o <= tolerance.k2o &&
    excess.n <= tolerance.n &&
    excess.p2o5 <= tolerance.p2o5 &&
    excess.k2o <= tolerance.k2o;
  return {
    mix,
    balance: { target, delivered, gap, excess, feasible, conflict },
  };
}

/* ------------------------------------------------------------------ */
/* คำแนะนำเสริม                                                       */
/* ------------------------------------------------------------------ */

function assessSoil(crop: InternalCropProfile, soilN: number, soilP: number, soilK: number, omPercent: number, ph: number): {
  assessment: SoilAssessment;
  rubberPHigh: boolean;
} {
  const om = classify(crop.omAxis, omPercent);
  const p = classify(crop.pAxis, soilP);
  const k = classify(crop.kAxis, soilK);
  const warnings: string[] = [];

  let phStatus: SoilAssessment['phStatus'] = 'optimal';
  let phLabel = 'เหมาะสม (5.6–7.3)';
  let limeAdvice: string | null = null;
  if (ph < 5.0) {
    phStatus = 'very_acidic';
    phLabel = 'กรดจัดมาก (<5.0)';
    limeAdvice = 'ควรปรับ pH ด้วยปูนโดโลไมต์/ปูนขาวตามคำแนะนำกรมพัฒนาที่ดิน และตรวจ pH ซ้ำก่อนปลูก';
    warnings.push('pH ต่ำกว่า 5.0: ดินเป็นกรดจัดมาก ธาตุอาหารบางตัวอาจถูกตรึง ควรปรับ pH และตรวจซ้ำ');
  } else if (ph < 5.6) {
    phStatus = 'acidic';
    phLabel = 'กรด (5.0–5.5)';
    limeAdvice = 'ควรพิจารณาใส่ปูนตามคำแนะนำกรมพัฒนาที่ดินและตรวจ pH ซ้ำ';
    warnings.push('pH อยู่ในช่วงกรด: ควรพิจารณาปูน/โดโลไมต์และตรวจ pH ซ้ำก่อนใช้สูตร');
  } else if (ph <= 7.3) {
    phStatus = 'optimal';
    phLabel = 'เหมาะสม (5.6–7.3)';
  } else {
    phStatus = 'alkaline';
    phLabel = 'ด่าง (>7.3)';
    limeAdvice = 'ไม่ควรใส่ปูนเพิ่ม; ควรฝังกลบ/แบ่งใส่ยูเรีย และปรึกษานักวิชาการเกษตร';
    warnings.push(
      'pH สูงกว่า 7.3: ยูเรียที่หว่านผิวอาจสูญเสีย N; เอกสารราชการของข้าวโพดแนะนำแอมโมเนียมซัลเฟตแทนยูเรีย ' +
      'แต่โมดูลนี้มีเพียงยูเรีย/DAP/MOP จึงไม่สลับวัสดุอัตโนมัติ',
    );
  }

  if (omPercent < 1.0) {
    warnings.push(
      'อินทรียวัตถุต่ำกว่า 1.0%: ควรเพิ่มอินทรียวัตถุตามคำแนะนำ (ข้าวโพด: ปุ๋ยอินทรีย์ 500–1,000 กก./ไร่ ตามเอกสารราชการ) ' +
      'และติดตามการตอบสนองของพืช',
    );
  }

  if (soilN > 100) warnings.push('ค่า N ในดินสูงกว่า 100 มก./กก. ผิดปกติสำหรับการวิเคราะห์ดินทั่วไป ตรวจหน่วยและผลวิเคราะห์อีกครั้ง');
  if (soilP > 200) warnings.push('ค่า P สูงกว่า 200 มก./กก. ผิดปกติ ตรวจหน่วยและวิธีวิเคราะห์ (Bray II) อีกครั้ง');
  if (soilK > 300) warnings.push('ค่า K สูงกว่า 300 มก./กก. ผิดปกติ ตรวจหน่วยและวิธีวิเคราะห์ (NH4OAc) อีกครั้ง');

  const rubberPHigh = crop.id === 'rubber' && soilP > 30;
  if (rubberPHigh) {
    warnings.push('ตารางยางพาราไม่มีชั้น P สูง (>30 มก./กก.) ระบบใช้ชั้นปานกลางของตารางและอาจให้ P สูงกว่าที่จำเป็น; ควรตรวจสอบกับนักวิชาการ');
  }

  return {
    assessment: {
      omClass: om.key,
      omClassLabel: om.label,
      pClass: p.key,
      pClassLabel: p.label,
      kClass: k.key,
      kClassLabel: k.label,
      phStatus,
      phLabel,
      limeAdvice,
      warnings,
    },
    rubberPHigh,
  };
}

/* ------------------------------------------------------------------ */
/* ฟังก์ชันหลัก                                                        */
/* ------------------------------------------------------------------ */

export function calculateFertilizer(input: FertilizerInput): FertilizerResult {
  const crop = getInternalCrop(input.crop);
  if (!crop) {
    throw new Error(`ไม่รู้จักชนิดพืช: ${input.crop}`);
  }

  const raw = interpolateRaw(crop, input.soilN, input.soilP, input.soilK, input.omPercent);
  const officialStageMaterials = officialStages(crop, raw);
  const officialTotals = sumMaterials(officialStageMaterials);
  const officialTarget = nutrients(officialTotals);

  const ratio = crop.referenceYieldRai > 0 ? input.targetYieldRai / crop.referenceYieldRai : 1;
  const factor = clamp(ratio, 0.6, 1.5);
  const clamped = Math.abs(factor - ratio) > 1e-9;
  const yieldWarning = clamped
    ? `ผลผลิตเป้าหมายอยู่นอกช่วงที่แบบจำลองรับได้ (0.6–1.5 เท่าของค่าอ้างอิง) จึงจำกัดการปรับ N ที่ ${factor.toFixed(2)} เท่า; P/K ไม่ปรับตามผลผลิต`
    : ratio < 0.7 || ratio > 1.3
      ? `ผลผลิตเป้าหมายต่างจากค่าอ้างอิง ${ratio.toFixed(2)} เท่า; การปรับ N ตามผลผลิตเป็นสมมติฐานของแบบจำลอง และ P/K ไม่ปรับตามผลผลิต`
      : null;

  const nAdjusted = officialTarget.n * factor;
  const rawCredit = Math.max(0, (input.soilN - 15) * 0.31);
  const creditCap = nAdjusted * 0.3;
  const credit = Math.min(rawCredit, creditCap);
  const creditCapped = rawCredit > creditCap + 1e-9;
  const nTarget = Math.max(0, nAdjusted - credit);
  const target: NutrientAmounts = {
    n: nTarget,
    p2o5: officialTarget.p2o5,
    k2o: officialTarget.k2o,
  };

  const solved = solveMix(target);
  const applications = allocateStages(crop, officialStageMaterials, solved.mix);
  const soilResult = assessSoil(crop, input.soilN, input.soilP, input.soilK, input.omPercent, input.ph);

  const prices: FertilizerPrices = {
    urea: input.prices?.urea ?? DEFAULT_FERTILIZER_PRICES.urea,
    dap: input.prices?.dap ?? DEFAULT_FERTILIZER_PRICES.dap,
    mop: input.prices?.mop ?? DEFAULT_FERTILIZER_PRICES.mop,
    baseline: input.prices?.baseline ?? crop.baseline.defaultPriceThbPerKg,
  };
  const straightCostThbPerRai =
    solved.mix.urea * prices.urea + solved.mix.dap * prices.dap + solved.mix.mop * prices.mop;
  const baselineKgPerRai = crop.baseline.nPercent > 0 ? target.n / (crop.baseline.nPercent / 100) : 0;
  const baselineDelivered: NutrientAmounts = {
    n: baselineKgPerRai * (crop.baseline.nPercent / 100),
    p2o5: baselineKgPerRai * (crop.baseline.p2o5Percent / 100),
    k2o: baselineKgPerRai * (crop.baseline.k2oPercent / 100),
  };
  const baselineGap: NutrientAmounts = {
    n: Math.max(0, target.n - baselineDelivered.n),
    p2o5: Math.max(0, target.p2o5 - baselineDelivered.p2o5),
    k2o: Math.max(0, target.k2o - baselineDelivered.k2o),
  };
  const baselineCostThbPerRai = baselineKgPerRai * prices.baseline;
  const savingsThbPerRai = baselineCostThbPerRai - straightCostThbPerRai;
  const savingsPercent = baselineCostThbPerRai > 0 ? (savingsThbPerRai / baselineCostThbPerRai) * 100 : 0;

  const perTree =
    crop.officialUnit === 'g_per_tree_year' && crop.densityTreesPerRai
      ? {
          densityTreesPerRai: crop.densityTreesPerRai,
          target: scaleNutrients(target, 1000 / crop.densityTreesPerRai),
          mix: scaleMaterials(solved.mix, 1000 / crop.densityTreesPerRai),
        }
      : null;

  const warnings = unique([
    'ผลนี้เป็นแบบจำลองจากตารางแนะนำปุ๋ยตามค่าวิเคราะห์ดินของ DOAE/DOA ไม่ใช่คำแนะนำเฉพาะแปลง; ต้องยืนยันกับนักวิชาการเกษตรและผลวิเคราะห์ดินจริง',
    'ต้องเก็บตัวอย่างดินที่ความลึก 0–15 และ 15–30 ซม. และวิเคราะห์ในห้องปฏิบัติการมาตรฐาน; ค่า N ในที่นี้เป็นแบบจำลอง ไม่ใช่ค่าทางการของ DOAE',
    'P/K ยึดตามระดับค่าวิเคราะห์ดินจากตารางราชการ; การปรับตามผลผลิตเป้าหมายทำเฉพาะ N และ P/K ไม่ได้ปรับตามผลผลิต',
    'ราคาปุ๋ยและราคาปุ๋ยผสมเป็นสมมติฐานที่แก้ไขได้; การประหยัดเป็นการเทียบที่ N เท่ากัน ไม่ใช่ NPK เท่ากัน และไม่รับประกันผลประหยัดจริง',
    'ความหนาแน่นต้นต่อไร่ของไม้ผลเป็นสมมติฐาน; หากระยะปลูกต่างให้ปรับผลลัพธ์',
    ...soilResult.assessment.warnings,
    ...(yieldWarning ? [yieldWarning] : []),
    ...(creditCapped
      ? ['N ที่หักจากดินถูกจำกัดไว้ไม่เกิน 30% ของ N เป้าหมาย เพื่อไม่ให้สูตรขาด N เกินไป; ค่า N ในดินเป็นแบบจำลอง']
      : []),
    ...(solved.balance.conflict ? [solved.balance.conflict.message] : []),
    ...(baselineGap.p2o5 > 0.05 || baselineGap.k2o > 0.05
      ? ['ปุ๋ยผสมที่ใช้เทียบให้ N เท่ากันแต่ P/K ที่ได้ไม่ตรงเป้าหมาย; ตัวเลขประหยัดจึงไม่ใช่การเทียบ NPK ครบชุด']
      : []),
  ]);

  return {
    crop: toSummary(crop),
    input,
    soil: soilResult.assessment,
    yieldAdjustment: {
      referenceYieldRai: crop.referenceYieldRai,
      ratio,
      factor,
      clamped,
      warning: yieldWarning,
    },
    soilNCredit: {
      referenceSoilN: 15,
      creditKgPerRai: credit,
      capped: creditCapped,
      note: 'แบบจำลอง: (soilN − 15) × 0.31 กก. N/ไร่ และจำกัดไม่เกิน 30% ของ N เป้าหมาย; ไม่ใช่สมการราชการ',
    },
    officialTargetPerRai: officialTarget,
    targetPerRai: target,
    mixPerRai: solved.mix,
    balancePerRai: solved.balance,
    perTree,
    applicationsPerRai: applications,
    cost: {
      prices,
      straightCostThbPerRai,
      baseline: {
        grade: crop.baseline.grade,
        nPercent: crop.baseline.nPercent,
        p2o5Percent: crop.baseline.p2o5Percent,
        k2oPercent: crop.baseline.k2oPercent,
        kgPerRai: baselineKgPerRai,
        costThbPerRai: baselineCostThbPerRai,
        delivered: baselineDelivered,
        gap: baselineGap,
        note: crop.baseline.note,
      },
      savingsThbPerRai,
      savingsPercent,
      assumptions: [
        'ราคาแม่ปุ๋ยและปุ๋ยผสมเป็นราคาสมมติฐานเริ่มต้นที่ผู้ใช้แก้ไขได้',
        `ปุ๋ยผสมที่ใช้เทียบ: ${crop.baseline.grade} ราคา ${prices.baseline.toFixed(2)} บาท/กก.`,
        'เทียบที่ปริมาณ N เท่ากัน; P/K ที่ได้จากปุ๋ยผสมอาจไม่ตรงเป้าหมาย',
        'ยังไม่รวมค่าขนส่ง ค่าแรง ค่าผสม และส่วนลดทางการค้า',
      ],
    },
    warnings,
    sources: FERTILIZER_SOURCES,
    model: {
      version: FERTILIZER_MODEL_VERSION,
      officialBasis:
        'ตารางแนะนำปุ๋ยตามค่าวิเคราะห์ดินของ DOAE/PPSF (ข้าว ข้าวโพด มันสำปะหลัง อ้อย ลำไย ลิ้นจี่ ยางพารา) และตารางที่ 5 ของ DOA (ทุเรียน)',
      adjustments: [
        'interpolate ค่า OM×P×K ระหว่างจุดกลางของชั้นราชการ; ค่าที่จุดกลางตรงกับตาราง',
        'ปรับ N ตามผลผลิตเป้าหมาย (จำกัด 0.6–1.5 เท่า) โดย P/K คงตามระดับค่าวิเคราะห์ดิน',
        'หัก N ที่ดินให้แบบจำลอง: (soilN − 15) × 0.31 กก. N/ไร่ จำกัดไม่เกิน 30% ของ N เป้าหมาย',
        'แก้สมการแม่ปุ๋ย 3 ชนิด; ถ้า N จาก DAP เกินเป้าหมายจะจำกัด DAP และรายงาน P ที่ขาด',
        'ระยะใส่ปุ๋ยใช้สัดส่วนจากตารางราชการเมื่อมี; ไม้ผลที่ตารางให้ยอดรวมต่อปีใช้การแบ่งเท่า 4 ระยะ',
        'ราคาปุ๋ยและราคาปุ๋ยผสมเป็นสมมติฐานที่แก้ไขได้',
      ],
      notes: [
        ...crop.notes,
        ...(perTree ? ['ค่า perTree.target และ perTree.mix มีหน่วยเป็นกรัมต่อต้นต่อปี'] : []),
        'ไม่รวมปาล์มน้ำมัน เพราะคำแนะนำราชการใช้ 21-0-0, 0-3-0, Mg และ B ซึ่งไม่สามารถผสมด้วยแม่ปุ๋ย 3 ชนิดนี้',
        'ค่า pH/OM ใช้เป็นคำเตือนและเลือกคำแนะนำ ไม่ได้ปรับตัวเลขสูตรอัตโนมัติ',
      ],
      disclaimer: FERTILIZER_DISCLAIMER,
      dataNature: 'model_output',
      fieldSpecific: false,
    },
  };
}
