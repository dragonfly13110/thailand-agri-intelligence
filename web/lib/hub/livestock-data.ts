import 'server-only';
import { DLD_LIVESTOCK_PROVINCE_RESOURCES, loadDldLivestockSpecies } from './dld-livestock';
import type { DldLivestockProvenance, DldLivestockRow, DldLivestockSpeciesId, DldLivestockSpeciesState } from './dld-livestock';
import { REGION_BY_PROVINCE } from './weather-data';
import type { RegionKey } from './weather-data';

/**
 * สถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ สำหรับหน้า /livestock และ /api/v1/livestock
 *
 * กติกาสิทธิ์ (AGENTS.md ข้อ 3):
 * - ทรัพยากรรายจังหวัดทั้ง 5 ชุดของกรมปศุสัตว์ (โคเนื้อ/โคนม/สุกร/ไก่/เป็ด) ผ่านทะเบียนสิทธิ์
 *   `config/resource_licenses.json` เป็น approved_public + project_publication_approved=1 แล้ว
 *   ตัวเลขจริงจึงอ่านได้จากคลังข้อมูลกลาง (D1 observations) ผ่าน `dld-livestock.ts` เท่านั้น
 *   — ห้ามเรียก CKAN ตรง ๆ จาก path นี้ และห้ามแทนที่ด้วยค่าตัวอย่างเมื่อคลังว่างหรืออ่านไม่ได้
 * - ทรัพยากรของกรมประมง (DOF) ยัง pending จึงยังแสดงเฉพาะค่าตัวอย่างแบบ deterministic
 *   (seed จากชนิดสัตว์|ภาค|ปี) ตั้งใจให้ไม่สืบทอดขนาดจริงของต้นทาง
 *
 * กติกาความหมาย (AGENTS.md ข้อ 4):
 * - ค่าที่ไม่มีจริงคือ null ตลอดสาย (จังหวัด/ภาค/ยอดรวม/หน่วย) ห้ามแปลง null เป็น 0
 * - ห้ามรวมข้ามชนิดสัตว์ ข้ามปี ข้ามจังหวัด และห้ามผสมระบบภาคของสองหน่วยงาน
 * - กรมปศุสัตว์ใช้ภาค 4 ภาคตามคอลัมน์ region ของต้นทาง (ตะวันออกปนภาคกลาง)
 * - ผลรวมรายภาค/ยอดรวมประเทศคำนวณจากแถวจริงของปีล่าสุดในคลังเท่านั้น
 */

export type LivestockSectorId = 'livestock' | 'aquaculture';
export type LivestockAgencyId = 'dld' | 'dof';
export type LivestockReadState = 'real' | 'empty' | 'unavailable' | 'sample';

export type LivestockRegionDef = {
  id: string;
  label: string;
  provinceCount: number | null;
  basis: 'source' | 'crosswalk';
};

export type LivestockSpeciesDef = {
  id: string;
  label: string;
  sector: LivestockSectorId;
  agency: LivestockAgencyId;
  agencyLabel: string;
  sourceLabel: string;
  metricLabel: string;
  unit: string;
  grain: string;
  yearBeFrom: number;
  yearBeTo: number;
  yearBeLatest: number;
  provinceCount: number | null;
  recordCount: number | null;
  regionSourceLabel: string;
  sourceUrl: string;
  datasetUrl: string;
  resourceId: string;
  licenseStatus: 'pending' | 'metadata_only' | 'approved_public';
  availability: 'verified' | 'partial' | 'unverified';
  availabilityNote: string;
  unitCaution: string | null;
};

export type LivestockRegionStat = {
  regionId: string;
  regionLabel: string;
  value: number | null;
  sharePct: number | null;
};

export type LivestockProvinceStat = {
  province: string;
  value: number | null;
};

export type LivestockSpeciesSummary = {
  speciesId: string;
  total: number | null;
  unit: string | null;
  yearBe: number | null;
  provinceCount: number | null;
  regions: LivestockRegionStat[];
  topProvinces: LivestockProvinceStat[];
  sample: boolean;
  readState: LivestockReadState;
  note: string | null;
  provenance: DldLivestockProvenance | null;
  availableYearsBe: number[];
};

export type LivestockSectorPayload = {
  id: LivestockSectorId;
  label: string;
  agencyLabel: string;
  regionSourceLabel: string;
  regions: LivestockRegionDef[];
  species: Array<{ def: LivestockSpeciesDef; summary: LivestockSpeciesSummary }>;
};

export type LivestockSourceRef = {
  agencyId: LivestockAgencyId;
  agencyLabel: string;
  datasetUrl: string;
  apiUrl: string;
  resourceId: string;
  licenseStatus: string;
  reviewOutcome: string;
  retrievedAt: string;
  note: string;
};

export type LivestockDashboardPayload = {
  generatedAt: string;
  sample: boolean;
  sectors: LivestockSectorPayload[];
  sources: LivestockSourceRef[];
  warnings: string[];
  sourceNote: string;
  gaps: Array<{ title: string; detail: string; sourceUrl: string | null }>;
};

/* ------------------------------------------------------------------ */
/* ข้อความประกอบและช่องว่างข้อมูล (Thai)                                */
/* ------------------------------------------------------------------ */

const LIVESTOCK_WARNINGS: string[] = [
  'ตัวเลขปศุสัตว์ 5 ชนิด (โคเนื้อ/โคนม/สุกร/ไก่/เป็ด) อ่านจากคลังข้อมูลกลางของทรัพยากรที่ทะเบียนสิทธิ์อนุมัติเท่านั้น ถ้ายังไม่มีแถวตัวเลขที่เผยแพร่ หน้านี้จะแสดงสถานะ "ยังไม่มีตัวเลขในคลัง" และห้ามแทนที่ด้วยค่าตัวอย่าง',
  'ตัวเลขสัตว์น้ำเศรษฐกิจ (กุ้งขาว/ปลานิล/ปลาดุก) ยังเป็นค่าตัวอย่างแบบ deterministic เพราะสิทธิ์ของกรมประมงยังอยู่ระหว่างตรวจ',
  'กรมปศุสัตว์ใช้ภาค 4 ภาค (ไม่มีภาคตะวันออก และนับจังหวัดชายทะเลฝั่งตะวันออกไว้ในภาคกลาง) ส่วนกรมประมงใช้ภาค 6 ภาค จึงห้ามนำภาคของสองหน่วยงานมารวมหรือเทียบกันตรงๆ',
  'ชุดข้อมูลกรมปศุสัตว์มีเพียง "จำนวนไก่" รวม ไม่ได้แยกไก่เนื้อกับไก่ไข่ ห้ามแยกหรือประมาณค่าตามชนิดการใช้งานเอง',
  'ค่าที่ต้นทางไม่ระบุคงเป็น null ทั้งระดับจังหวัด/ภาค/ยอดรวมและหน่วย ห้ามแปลง null เป็น 0 และห้ามเดา',
  'ยอดรวมรายภาคและยอดรวมทั้งประเทศของชุดจริงคำนวณจากแถวของปี พ.ศ. ล่าสุดในคลังเท่านั้น หากมีแถว null หรือชื่อภาคนอกชุดของกรมปศุสัตว์ จะไม่แสดงยอดรวม',
  'คอลัมน์ livestock_area ("ปศุสัตว์เขต 1"–"ปศุสัตว์เขต 9") เป็นเขตปฏิบัติงานของกรมปศุสัตว์ ไม่ใช่ภาค และไม่ถูกใช้เป็นมิติของ Hub',
  'ชุดข้อมูลสัตว์น้ำจืดของกรมประมงไม่มีคอลัมน์ภาค ค่ารายภาคของปลานิล/ปลาดุกจึงต้องเป็น crosswalk จากรหัสจังหวัด และ resource กุ้งทะเลแยกตามปี (ปี 2569 ไม่มีคอลัมน์ปี เพราะปีมาจากตัว resource เอง)',
  'ชื่อชนิดสัตว์ในข้อมูลดิบสัตว์น้ำจืดมีบางรายการมีช่องว่างท้ายสตริง ต้อง trim ก่อนเทียบ มิฉะนั้นจะนับชนิดสัตว์ซ้ำ (เช่นได้ 38 ชนิดแทน 20 ชนิด)',
];

const SOURCE_NOTE =
  'ทะเบียนสิทธิ์อนุมัติการเผยแพร่ตัวเลขรายจังหวัดของกรมปศุสัตว์ทั้ง 5 ทรัพยากรแล้ว (ตรวจซ้ำแหล่งต้นทางเมื่อ 30 ต.ค. 2569 เข้าถึงได้ครบทั้ง datastore และ CSV) ตัวเลขจริงบนหน้าจออ่านจากคลังข้อมูลกลางเท่านั้น ส่วนทรัพยากรกรมประมงยัง pending ตัวเลขฝั่งสัตว์น้ำจึงยังเป็นค่าตัวอย่าง';

const GAPS: LivestockDashboardPayload['gaps'] = [
  {
    title: 'ยังไม่มีตัวเลขปศุสัตว์จริงในคลังข้อมูลกลาง',
    detail:
      'ทะเบียนสิทธิ์อนุมัติการเผยแพร่ (approved_public + project_publication_approved = 1) ครบทั้ง 5 ทรัพยากรรายจังหวัดแล้ว แต่คลัง D1 ยังไม่มี run ตัวเลขที่ผ่านการเขียน เพราะ gate ฝั่ง writer ต้องการ explicit publication authorization ฐาน project_owner_instruction ซึ่งตอนนี้มีเฉพาะชุดโคเนื้อ ส่วนโคนม/สุกร/ไก่/เป็ด ฐานสิทธิ์เป็น open_license_policy ที่มีรายการ unresolved จึง fail closed ต้องให้ผู้รับผิดชอบโครงการยืนยันสิทธิ์ก่อนจึง ingest ได้ (ยืนยันแล้วว่าไม่มี approved observation ใดในคลังตาม probe ล่าสุด)',
    sourceUrl: null,
  },
  {
    title: 'ไม่มีการแยกไก่เนื้อกับไก่ไข่',
    detail:
      'ชุดข้อมูลของกรมปศุสัตว์มีเพียง "จำนวนไก่" ที่ครอบคลุม 77 จังหวัด × 5 ปี (2564–2568) ไม่มีชุดแยกตามชนิดการใช้งาน จึงยังทำการแยกไก่เนื้อ/ไก่ไข่ไม่ได้และห้ามประมาณเอง',
    sourceUrl: 'https://dld.gdcatalog.go.th/dataset/ae4d2bdf-5cff-482f-86f4-aea93a51c018',
  },
  {
    title: 'ระบบภาคของกรมปศุสัตว์และกรมประมงไม่ตรงกัน',
    detail:
      'กรมปศุสัตว์แบ่ง 4 ภาค (ไม่มีภาคตะวันออก และรวมจังหวัดชายทะเลตะวันออกไว้ในภาคกลาง 26 จังหวัด) ส่วนกรมประมงแบ่ง 6 ภาค (ตะวันออก กลาง ตะวันออกเฉียงเหนือ ใต้ตอนบน ใต้ตอนล่างฝั่งอ่าวไทย ใต้ฝั่งอันดามัน) จึงใช้ id ของภาคแยกชุด (dld-* / dof-*) และแยกฐานของภาคไว้ใน field basis',
    sourceUrl: null,
  },
  {
    title: 'ชุดข้อมูลสัตว์น้ำจืดไม่มีคอลัมน์ภาค',
    detail:
      'resource สัตว์น้ำจืดของกรมประมงมีเฉพาะปี ประเภทการเพาะเลี้ยง จังหวัด ประเภทการเลี้ยง ชนิดสัตว์น้ำ จำนวนฟาร์ม เนื้อที่เลี้ยง ปริมาณ และมูลค่า จึงต้องเทียบรหัสจังหวัดกับภาคมาตรฐาน (crosswalk) และระบุฐานเป็น crosswalk เสมอ',
    sourceUrl: 'https://catalog.fisheries.go.th/dataset/c02de756-f5d6-475f-9d52-971f98a2b9c1',
  },
  {
    title: 'สิทธิ์ทรัพยากรกรมประมงยังรอตรวจ',
    detail:
      'ทรัพยากรกุ้งทะเล (3 resources รายปี) และสัตว์น้ำจืดของกรมประมงยังไม่มีการตรวจสิทธิ์ฉบับเต็ม (ป้าย Open Data Common แต่ยังไม่ยืนยันสิทธิ์เผยแพร่ซ้ำและปีอ้างอิง) จึงยังเผยแพร่ได้เฉพาะ metadata และตัวเลขฝั่งสัตว์น้ำต้องเป็นค่าตัวอย่าง',
    sourceUrl: null,
  },
  {
    title: 'รายชื่อ 35 จังหวัดชายทะเลของชุดกุ้งยังไม่ได้ตรวจยืนยัน',
    detail:
      'ตรวจได้เพียงจำนวนจังหวัด (35 จังหวัด 12 เดือน) แต่ยังไม่ได้เก็บรายชื่อจังหวัดรายตัวมาแสดง จึงไม่จัดอันดับจังหวัดของกุ้งไว้ในหน้าจอ เพื่อไม่เดาชื่อจังหวัด',
    sourceUrl: null,
  },
  {
    title: 'ปีต้นทางของกรมปศุสัตว์ยังไม่ยืนยันว่าเป็นปีปฏิทินหรือปีงบประมาณ',
    detail:
      'คอลัมน์ year ของชุดรายจังหวัดเป็นป้ายปี พ.ศ. ที่เก็บตรง ๆ (period_grain = source_year_label ไม่มีช่วงวันที่) จึงห้ามเทียบกับชุดอื่นที่ใช้ปีปฏิทินหรือปีงบประมาณ',
    sourceUrl: null,
  },
  {
    title: 'ชื่อชนิดสัตว์น้ำในข้อมูลดิบมีช่องว่างท้ายสตริง',
    detail:
      'ชุดสัตว์น้ำจืดมีชนิดสัตว์บางรายการเขียนซ้ำแบบมีช่องว่างท้ายสตริง (เช่น "ปลานิล" กับ "ปลานิล ") การนับชนิดสัตว์โดยไม่ trim จะได้ 38 รายการแทน 20 รายการ ผู้เรียกใช้ข้อมูลต้อง trim ค่าก่อนเทียบเสมอ',
    sourceUrl: 'https://catalog.fisheries.go.th/dataset/c02de756-f5d6-475f-9d52-971f98a2b9c1',
  },
];

/* ------------------------------------------------------------------ */
/* รหัสจังหวัด → ชื่อไทย                                             */
/* ------------------------------------------------------------------ */

/**
 * snapshot ของทะเบียนจังหวัด 77 จังหวัด (config/provinces.csv ผ่าน web/lib/provinces.ts)
 * ถ้าทะเบียนต้นทางเปลี่ยน ต้อง sync ค่านี้พร้อมกัน (มี guard ด้านล่าง)
 */
const PROVINCE_NAME_BY_CODE: Record<string, string> = {
  '10': 'กรุงเทพมหานคร', '11': 'สมุทรปราการ', '12': 'นนทบุรี', '13': 'ปทุมธานี',
  '14': 'พระนครศรีอยุธยา', '15': 'อ่างทอง', '16': 'ลพบุรี', '17': 'สิงห์บุรี',
  '18': 'ชัยนาท', '19': 'สระบุรี', '20': 'ชลบุรี', '21': 'ระยอง',
  '22': 'จันทบุรี', '23': 'ตราด', '24': 'ฉะเชิงเทรา', '25': 'ปราจีนบุรี',
  '26': 'นครนายก', '27': 'สระแก้ว', '30': 'นครราชสีมา', '31': 'บุรีรัมย์',
  '32': 'สุรินทร์', '33': 'ศรีสะเกษ', '34': 'อุบลราชธานี', '35': 'ยโสธร',
  '36': 'ชัยภูมิ', '37': 'อำนาจเจริญ', '38': 'บึงกาฬ', '39': 'หนองบัวลำภู',
  '40': 'ขอนแก่น', '41': 'อุดรธานี', '42': 'เลย', '43': 'หนองคาย',
  '44': 'มหาสารคาม', '45': 'ร้อยเอ็ด', '46': 'กาฬสินธุ์', '47': 'สกลนคร',
  '48': 'นครพนม', '49': 'มุกดาหาร', '50': 'เชียงใหม่', '51': 'ลำพูน',
  '52': 'ลำปาง', '53': 'อุตรดิตถ์', '54': 'แพร่', '55': 'น่าน',
  '56': 'พะเยา', '57': 'เชียงราย', '58': 'แม่ฮ่องสอน', '60': 'นครสวรรค์',
  '61': 'อุทัยธานี', '62': 'กำแพงเพชร', '63': 'ตาก', '64': 'สุโขทัย',
  '65': 'พิษณุโลก', '66': 'พิจิตร', '67': 'เพชรบูรณ์', '70': 'ราชบุรี',
  '71': 'กาญจนบุรี', '72': 'สุพรรณบุรี', '73': 'นครปฐม', '74': 'สมุทรสาคร',
  '75': 'สมุทรสงคราม', '76': 'เพชรบุรี', '77': 'ประจวบคีรีขันธ์', '80': 'นครศรีธรรมราช',
  '81': 'กระบี่', '82': 'พังงา', '83': 'ภูเก็ต', '84': 'สุราษฎร์ธานี',
  '85': 'ระนอง', '86': 'ชุมพร', '90': 'สงขลา', '91': 'สตูล',
  '92': 'ตรัง', '93': 'พัทลุง', '94': 'ปัตตานี', '95': 'ยะลา',
  '96': 'นราธิวาส',
};

/* ------------------------------------------------------------------ */
/* ระบบภาค (ไม่รวมชุดของกัน)                                           */
/* ------------------------------------------------------------------ */

/** id ของภาคมาตรฐาน 5 ภาค (อ้างรหัสจังหวัดมาตรฐาน) — ใช้เป็นฐาน crosswalk เท่านั้น */
const STANDARD_REGION_ID: Record<RegionKey, string> = {
  north: 'std-north',
  northeast: 'std-northeast',
  central: 'std-central',
  east: 'std-east',
  south: 'std-south',
};

/**
 * กรมปศุสัตว์นับจังหวัดชายทะเลฝั่งตะวันออก (ชลบุรี–สระแก้ว) ไว้ใน "ภาคกลาง"
 * ทำให้ภาคกลางของกรมปศุสัตว์ 26 จังหวัด ไม่ใช่ 18 จังหวัดแบบภาคมาตรฐาน
 */
const DLD_REGION_ID: Record<RegionKey, string> = {
  north: 'dld-north',
  northeast: 'dld-northeast',
  central: 'dld-central',
  east: 'dld-central',
  south: 'dld-south',
};

const STANDARD_REGION_LABEL: Record<RegionKey, string> = {
  north: 'ภาคเหนือ',
  northeast: 'ภาคตะวันออกเฉียงเหนือ',
  central: 'ภาคกลาง',
  east: 'ภาคตะวันออก',
  south: 'ภาคใต้',
};

function countProvinces(regionIdOf: (code: string) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const code of Object.keys(PROVINCE_NAME_BY_CODE)) {
    const regionId = regionIdOf(code);
    counts.set(regionId, (counts.get(regionId) ?? 0) + 1);
  }
  return counts;
}

const STANDARD_PROVINCE_COUNTS = countProvinces((code) => STANDARD_REGION_ID[REGION_BY_PROVINCE[code]]);
const DLD_PROVINCE_COUNTS = countProvinces((code) => DLD_REGION_ID[REGION_BY_PROVINCE[code]]);

/** ภาคของกรมปศุสัตว์ (4 ภาคตามที่ต้นทางแบ่งเอง) */
const DLD_REGIONS: LivestockRegionDef[] = [
  { id: 'dld-north', label: 'ภาคเหนือ', provinceCount: DLD_PROVINCE_COUNTS.get('dld-north') ?? null, basis: 'source' },
  { id: 'dld-central', label: 'ภาคกลาง', provinceCount: DLD_PROVINCE_COUNTS.get('dld-central') ?? null, basis: 'source' },
  { id: 'dld-northeast', label: 'ภาคตะวันออกเฉียงเหนือ', provinceCount: DLD_PROVINCE_COUNTS.get('dld-northeast') ?? null, basis: 'source' },
  { id: 'dld-south', label: 'ภาคใต้', provinceCount: DLD_PROVINCE_COUNTS.get('dld-south') ?? null, basis: 'source' },
];

/** ชื่อภาคในคอลัมน์ region ของต้นทาง → id ภาคของไฟล์นี้ (ชื่อไม่ตรง = ไม่นับเข้ายอดรวม) */
const DLD_REGION_ID_BY_LABEL: Record<string, string> = {
  'ภาคเหนือ': 'dld-north',
  'ภาคกลาง': 'dld-central',
  'ภาคตะวันออกเฉียงเหนือ': 'dld-northeast',
  'ภาคใต้': 'dld-south',
};

/**
 * ภาคของกรมประมง (6 ภาคตามที่ต้นทางแบ่งเอง ใช้กับชุดกุ้งทะเล)
 * จำนวนจังหวัดรายภาคไม่ได้ตรวจยืนยันในรอบ probe จึงเป็น null (ไม่เดา)
 */
const DOF_SOURCE_REGIONS: LivestockRegionDef[] = [
  { id: 'dof-east', label: 'ภาคตะวันออก', provinceCount: null, basis: 'source' },
  { id: 'dof-central', label: 'ภาคกลาง', provinceCount: null, basis: 'source' },
  { id: 'dof-northeast', label: 'ภาคตะวันออกเฉียงเหนือ', provinceCount: null, basis: 'source' },
  { id: 'dof-upper-south', label: 'ภาคใต้ตอนบน', provinceCount: null, basis: 'source' },
  { id: 'dof-lower-south-gulf', label: 'ภาคใต้ตอนล่างฝั่งอ่าวไทย', provinceCount: null, basis: 'source' },
  { id: 'dof-andaman', label: 'ภาคใต้ฝั่งอันดามัน', provinceCount: null, basis: 'source' },
];

/** ภาคมาตรฐาน 5 ภาค ใช้เป็น crosswalk สำหรับชุดที่ต้นทางไม่มีคอลัมน์ภาค */
const STANDARD_REGIONS: LivestockRegionDef[] = (
  Object.keys(STANDARD_REGION_ID) as RegionKey[]
).map((key) => ({
  id: STANDARD_REGION_ID[key],
  label: STANDARD_REGION_LABEL[key],
  provinceCount: STANDARD_PROVINCE_COUNTS.get(STANDARD_REGION_ID[key]) ?? null,
  basis: 'crosswalk',
}));

/* ------------------------------------------------------------------ */
/* นิยามชนิดสัตว์ (metadata ที่เผยแพร่ได้)                              */
/* ------------------------------------------------------------------ */

const DLD_AGENCY_LABEL = 'กรมปศุสัตว์ (DLD)';
const DOF_AGENCY_LABEL = 'กรมประมง (DOF)';

const DLD_LIVESTOCK_REGION_LABEL = 'ภาคตามกรมปศุสัตว์';
const DOF_REGION_LABEL = 'ภาคตามกรมประมง';
const CROSSWALK_REGION_LABEL = 'ภาคมาตรฐาน (crosswalk รหัสจังหวัด)';

const DLD_DATASET_ROOT = 'https://dld.gdcatalog.go.th/dataset/';
const DLD_DATASTORE_ROOT = 'https://dld.gdcatalog.go.th/api/3/action/datastore_search?resource_id=';

const DOF_DATASET_ROOT = 'https://catalog.fisheries.go.th/dataset/';
const DOF_DATASTORE_ROOT = 'https://catalog.fisheries.go.th/api/3/action/datastore_search?resource_id=';

function dldSpeciesDef(
  id: DldLivestockSpeciesId,
  label: string,
  sourceLabel: string,
  options: {
    datasetUrl: string;
    sourceUrl: string;
    unitCaution: string;
    availabilityNote: string;
  },
): LivestockSpeciesDef {
  const resource = DLD_LIVESTOCK_PROVINCE_RESOURCES[id];
  return {
    id,
    label,
    sector: 'livestock',
    agency: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    sourceLabel,
    metricLabel: 'จำนวนสัตว์ (หัว)',
    unit: 'ตัว',
    grain: 'จังหวัด × ปี (พ.ศ.)',
    yearBeFrom: 2564,
    yearBeTo: 2568,
    yearBeLatest: 2568,
    provinceCount: 77,
    recordCount: 385,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    sourceUrl: options.sourceUrl,
    datasetUrl: options.datasetUrl,
    resourceId: resource.resourceId,
    licenseStatus: 'approved_public',
    availability: 'verified',
    availabilityNote: options.availabilityNote,
    unitCaution: options.unitCaution,
  };
}

const DLD_LIVESTOCK_SPECIES: LivestockSpeciesDef[] = [
  dldSpeciesDef('cattle', 'โคเนื้อ', 'จำนวนโคเนื้อ', {
    datasetUrl: DLD_DATASET_ROOT + '1bef9bc7-2f81-45c2-a21e-baba3743b456',
    sourceUrl: DLD_DATASTORE_ROOT + 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',
    availabilityNote:
      'ตรวจซ้ำเมื่อ 30 ต.ค. 2569: CKAN datastore เข้าถึงได้ 385 แถว = 77 จังหวัด × 5 ปี (2564–2568) หน่วยที่ต้นทางประกาศคือ "ตัว" (ตรวจครั้งแรก 25 ต.ค. 2569 โครงสร้างคอลัมน์ year/particular/region/livestock_area/province/value/unit/source)',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัว ไม่ใช่น้ำหนักสดหรือมูลค่า ห้ามรวมกับโคนม/สุกร/ไก่/เป็ด หรือเทียบกับหน่วยอื่น',
  }),
  dldSpeciesDef('dairy', 'โคนม', 'จำนวนโคนม', {
    datasetUrl: DLD_DATASET_ROOT + 'eed9283e-51b2-4384-a9b6-245b0c8c7262',
    sourceUrl: DLD_DATASTORE_ROOT + '34dc17e6-7619-4194-89e7-99f4ece84b89',
    availabilityNote:
      'ตรวจซ้ำเมื่อ 30 ต.ค. 2569: CKAN datastore เข้าถึงได้ 385 แถว = 77 จังหวัด × 5 ปี (2564–2568) โครงสร้างแถวเหมือนชุดโคเนื้อทุกด้าน',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวโคนม ไม่ใช่ปริมาณนม (ลิตร/กิโลกรัม) ห้ามรวมกับโคเนื้อหรือชนิดอื่น',
  }),
  dldSpeciesDef('swine', 'สุกร', 'จำนวนสุกร', {
    datasetUrl: DLD_DATASET_ROOT + '161c766e-3ab4-475f-9976-60cfa1b7ada4',
    sourceUrl: DLD_DATASET_ROOT + '161c766e-3ab4-475f-9976-60cfa1b7ada4/resource/47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a/download/dld_01_0501.csv',
    availabilityNote:
      'ตรวจซ้ำเมื่อ 30 ต.ค. 2569: ไฟล์ CSV ดาวน์โหลดได้ HTTP 200 (385 แถว = 77 จังหวัด × 5 ปี) resource นี้ไม่มี CKAN datastore จึงไม่มี API ตัวเลข',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวสุกร ไม่ใช่น้ำหนักหรือมูลค่า และไม่ได้แยกสุกรแม่พันธุ์กับสุกรขุน ห้ามรวมกับชนิดอื่น',
  }),
  dldSpeciesDef('poultry', 'ไก่', 'จำนวนไก่', {
    datasetUrl: DLD_DATASET_ROOT + 'ae4d2bdf-5cff-482f-86f4-aea93a51c018',
    sourceUrl: DLD_DATASET_ROOT + 'ae4d2bdf-5cff-482f-86f4-aea93a51c018/resource/64366e81-13d2-485a-82a1-3ddc2d89869b/download/dld_01_0601.csv',
    availabilityNote:
      'ตรวจซ้ำเมื่อ 30 ต.ค. 2569: ไฟล์ CSV ดาวน์โหลดได้ HTTP 200 (385 แถว = 77 จังหวัด × 5 ปี) เป็น "จำนวนไก่" รวม ยังไม่มีชุดแยกไก่เนื้อ/ไก่ไข่ในแคตตาล็อก',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวไก่รวม (ทั้งไก่เนื้อและไก่ไข่) ไม่ใช่จำนวนไข่หรือน้ำหนัก และห้ามแยกเป็นชนิดการใช้งานเอง',
  }),
  dldSpeciesDef('duck', 'เป็ด', 'จำนวนเป็ด', {
    datasetUrl: DLD_DATASET_ROOT + '58d2c7a6-14eb-4703-a113-403c0fc86f4b',
    sourceUrl: DLD_DATASET_ROOT + '58d2c7a6-14eb-4703-a113-403c0fc86f4b/resource/c97081bc-e59d-47e1-aac9-0905b8983e08/download/dld_01_0701.csv',
    availabilityNote:
      'ตรวจซ้ำเมื่อ 30 ต.ค. 2569: ไฟล์ CSV ดาวน์โหลดได้ HTTP 200 (385 แถว = 77 จังหวัด × 5 ปี) โครงสร้างแถวเหมือนชุดอื่นของกรมปศุสัตว์',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวเป็ด ไม่ใช่จำนวนไข่หรือน้ำหนัก ห้ามรวมกับไก่ซึ่งเป็นคนละชนิดและคนละหน่วยการใช้งาน',
  }),
];

const DOF_SHRIMP_SPECIES: LivestockSpeciesDef = {
  id: 'whiteleg-shrimp',
  label: 'กุ้งขาวแวนนาไม',
  sector: 'aquaculture',
  agency: 'dof',
  agencyLabel: DOF_AGENCY_LABEL,
  sourceLabel: 'กุ้งขาว',
  metricLabel: 'ปริมาณผลผลิต (ตัน)',
  unit: 'ตัน',
  grain: 'จังหวัด × เดือน × ชนิดสัตว์',
  yearBeFrom: 2567,
  yearBeTo: 2569,
  yearBeLatest: 2569,
  provinceCount: 35,
  recordCount: null,
  regionSourceLabel: DOF_REGION_LABEL,
  sourceUrl: DOF_DATASTORE_ROOT + '890c72ed-8e35-4b82-9f8a-898dbfc26de9',
  datasetUrl: DOF_DATASET_ROOT + '4aa7387e-a3e5-4adb-b24b-cbcdac0e3399',
  resourceId: '890c72ed-8e35-4b82-9f8a-898dbfc26de9',
  licenseStatus: 'pending',
  availability: 'partial',
  availabilityNote:
    'ตรวจเมื่อ 25 ต.ค. 2569: ชุดกุ้งทะเลแยกเป็น resource รายปี 2567 (770 แถว), 2568 (280 แถว), 2569 (826 แถว) รวม 35 จังหวัดชายทะเล 12 เดือน หน่วย "ตัน" แต่ละ resource มีทั้งกุ้งขาวและกุ้งกุลาดำ จึงยังยืนยันจำนวนแถวเฉพาะกุ้งขาวไม่ได้ (recordCount = null) และ resource ปี 2569 ไม่มีคอลัมน์ "ปี" เพราะปีมาจากตัว resource เอง',
  unitCaution:
    'หน่วย "ตัน" เป็นปริมาณผลผลิตรวมทั้งกุ้งขาวและกุ้งกุลาดำในแต่ละ resource มูลค่าใช้หน่วยอื่น (พันบาท) ห้ามรวมข้ามหน่วยหรือรวมกับผลผลิตปลาน้ำจืด',
};

const DOF_FRESHWATER_SPECIES: LivestockSpeciesDef[] = [
  {
    id: 'tilapia',
    label: 'ปลานิล',
    sector: 'aquaculture',
    agency: 'dof',
    agencyLabel: DOF_AGENCY_LABEL,
    sourceLabel: 'ปลานิล',
    metricLabel: 'ปริมาณผลผลิต (ตัน)',
    unit: 'ตัน',
    grain: 'จังหวัด × ปี × ประเภทการเลี้ยง × ชนิดสัตว์',
    yearBeFrom: 2559,
    yearBeTo: 2567,
    yearBeLatest: 2567,
    provinceCount: 77,
    recordCount: 2056,
    regionSourceLabel: CROSSWALK_REGION_LABEL,
    sourceUrl: DOF_DATASTORE_ROOT + '5ef25e0e-eef0-4a6a-af5f-5303410c7f5f',
    datasetUrl: DOF_DATASET_ROOT + 'c02de756-f5d6-475f-9d52-971f98a2b9c1',
    resourceId: '5ef25e0e-eef0-4a6a-af5f-5303410c7f5f',
    licenseStatus: 'pending',
    availability: 'partial',
    availabilityNote:
      'ตรวจเมื่อ 25 ต.ค. 2569: resource สัตว์น้ำจืดมี 15,410 แถว ครอบคลุม 77 จังหวัด ปี 2559–2567 สัตว์น้ำ 20 ชนิด วิธีเลี้ยง 4 แบบ (บ่อ/กระชัง/นา/ร่องสวน) และชุดนี้ไม่มีคอลัมน์ภาค จึงต้องใช้ภาคมาตรฐานจากรหัสจังหวัด ชื่อชนิดสัตว์ในข้อมูลดิบบางรายการมีช่องว่างท้ายสตริง ต้อง trim ก่อนเทียบ (นับแบบไม่ trim จะได้ 38 ชนิด)',
    unitCaution:
      'คอลัมน์ "ปริมาณ" หน่วยตัน "มูลค่า" หน่วยพันบาท "เนื้อที่เลี้ยง" หน่วยไร่ และ "จำนวนฟาร์ม" หน่วยแห่ง ห้ามรวมข้ามหน่วยหรือรวมกับผลผลิตกุ้ง',
  },
  {
    id: 'catfish',
    label: 'ปลาดุก',
    sector: 'aquaculture',
    agency: 'dof',
    agencyLabel: DOF_AGENCY_LABEL,
    sourceLabel: 'ปลาดุก',
    metricLabel: 'ปริมาณผลผลิต (ตัน)',
    unit: 'ตัน',
    grain: 'จังหวัด × ปี × ประเภทการเลี้ยง × ชนิดสัตว์',
    yearBeFrom: 2559,
    yearBeTo: 2567,
    yearBeLatest: 2567,
    provinceCount: 77,
    recordCount: 1568,
    regionSourceLabel: CROSSWALK_REGION_LABEL,
    sourceUrl: DOF_DATASTORE_ROOT + '5ef25e0e-eef0-4a6a-af5f-5303410c7f5f',
    datasetUrl: DOF_DATASET_ROOT + 'c02de756-f5d6-475f-9d52-971f98a2b9c1',
    resourceId: '5ef25e0e-eef0-4a6a-af5f-5303410c7f5f',
    licenseStatus: 'pending',
    availability: 'partial',
    availabilityNote:
      'ตรวจเมื่อ 25 ต.ค. 2569: อยู่ใน resource สัตว์น้ำจืดเดียวกับปลานิล (15,410 แถว 77 จังหวัด ปี 2559–2567) ไม่มีคอลัมน์ภาค จึงใช้ภาคมาตรฐานจากรหัสจังหวัด และต้อง trim ชื่อชนิดสัตว์ก่อนเทียบ',
    unitCaution:
      'คอลัมน์ "ปริมาณ" หน่วยตัน ส่วน "มูลค่า" หน่วยพันบาท เป็นคนละหน่วยกัน ห้ามรวมข้ามหน่วยหรือรวมกับผลผลิตกุ้ง',
  },
];

/* ------------------------------------------------------------------ */
/* รายการทรัพยากรต้นทางที่ตรวจแล้ว                                      */
/* ------------------------------------------------------------------ */

const SOURCES: LivestockSourceRef[] = [
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + '1bef9bc7-2f81-45c2-a21e-baba3743b456',
    apiUrl: DLD_DATASTORE_ROOT + 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',
    resourceId: 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',
    licenseStatus: 'approved_public',
    reviewOutcome: 'project_owner_authorized_public_numeric_display_source_license_unverified',
    retrievedAt: '2026-10-30',
    note: 'จำนวนโคเนื้อรายจังหวัด ปี 2564–2568 (385 แถว) ผ่าน CKAN datastore — ทะเบียนสิทธิ์อนุมัติการเผยแพร่แล้ว (ยังมีรายการ unresolved เรื่องสัญญา licence ต้นทาง)',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + 'eed9283e-51b2-4384-a9b6-245b0c8c7262',
    apiUrl: DLD_DATASTORE_ROOT + '34dc17e6-7619-4194-89e7-99f4ece84b89',
    resourceId: '34dc17e6-7619-4194-89e7-99f4ece84b89',
    licenseStatus: 'approved_public',
    reviewOutcome: 'auto_approved_open',
    retrievedAt: '2026-10-30',
    note: 'จำนวนโคนมรายจังหวัด ปี 2564–2568 (385 แถว) ผ่าน CKAN datastore — ทะเบียนสิทธิ์อนุมัติการเผยแพร่แล้ว ฝั่ง writer ยังต้องได้รับการยืนยันสิทธิ์จากผู้รับผิดชอบโครงการ',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + '161c766e-3ab4-475f-9976-60cfa1b7ada4',
    apiUrl:
      DLD_DATASET_ROOT +
      '161c766e-3ab4-475f-9976-60cfa1b7ada4/resource/47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a/download/dld_01_0501.csv',
    resourceId: '47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a',
    licenseStatus: 'approved_public',
    reviewOutcome: 'auto_approved_open',
    retrievedAt: '2026-10-30',
    note: 'จำนวนสุกรรายจังหวัด ปี 2564–2568 (385 แถว) เป็นไฟล์ CSV ไม่มี datastore — ทะเบียนสิทธิ์อนุมัติการเผยแพร่แล้ว ฝั่ง writer ยังต้องได้รับการยืนยันสิทธิ์',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + 'ae4d2bdf-5cff-482f-86f4-aea93a51c018',
    apiUrl:
      DLD_DATASET_ROOT +
      'ae4d2bdf-5cff-482f-86f4-aea93a51c018/resource/64366e81-13d2-485a-82a1-3ddc2d89869b/download/dld_01_0601.csv',
    resourceId: '64366e81-13d2-485a-82a1-3ddc2d89869b',
    licenseStatus: 'approved_public',
    reviewOutcome: 'auto_approved_open',
    retrievedAt: '2026-10-30',
    note: 'จำนวนไก่รวมรายจังหวัด ปี 2564–2568 (385 แถว) เป็นไฟล์ CSV และไม่มีการแยกไก่เนื้อ/ไก่ไข่ — ทะเบียนสิทธิ์อนุมัติการเผยแพร่แล้ว ฝั่ง writer ยังต้องได้รับการยืนยันสิทธิ์',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + '58d2c7a6-14eb-4703-a113-403c0fc86f4b',
    apiUrl:
      DLD_DATASET_ROOT +
      '58d2c7a6-14eb-4703-a113-403c0fc86f4b/resource/c97081bc-e59d-47e1-aac9-0905b8983e08/download/dld_01_0701.csv',
    resourceId: 'c97081bc-e59d-47e1-aac9-0905b8983e08',
    licenseStatus: 'approved_public',
    reviewOutcome: 'auto_approved_open',
    retrievedAt: '2026-10-30',
    note: 'จำนวนเป็ดรายจังหวัด ปี 2564–2568 (385 แถว) เป็นไฟล์ CSV — ทะเบียนสิทธิ์อนุมัติการเผยแพร่แล้ว ฝั่ง writer ยังต้องได้รับการยืนยันสิทธิ์',
  },
  {
    agencyId: 'dof',
    agencyLabel: DOF_AGENCY_LABEL,
    datasetUrl: DOF_DATASET_ROOT + '4aa7387e-a3e5-4adb-b24b-cbcdac0e3399',
    apiUrl: DOF_DATASTORE_ROOT + '15267952-1a27-451b-bac2-1b5de7cdedc2',
    resourceId: '15267952-1a27-451b-bac2-1b5de7cdedc2',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_not_reviewed_resource_split_by_year',
    retrievedAt: '2026-10-25',
    note: 'ผลผลิตกุ้งทะเล ปี 2567 (770 แถว) มีคอลัมน์ปีแยก',
  },
  {
    agencyId: 'dof',
    agencyLabel: DOF_AGENCY_LABEL,
    datasetUrl: DOF_DATASET_ROOT + '4aa7387e-a3e5-4adb-b24b-cbcdac0e3399',
    apiUrl: DOF_DATASTORE_ROOT + '5936ac73-5902-41f5-984d-0b472555ae65',
    resourceId: '5936ac73-5902-41f5-984d-0b472555ae65',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_not_reviewed_resource_split_by_year',
    retrievedAt: '2026-10-25',
    note: 'ผลผลิตกุ้งทะเล ปี 2568 (280 แถว) มีคอลัมน์ปีแยก',
  },
  {
    agencyId: 'dof',
    agencyLabel: DOF_AGENCY_LABEL,
    datasetUrl: DOF_DATASET_ROOT + '4aa7387e-a3e5-4adb-b24b-cbcdac0e3399',
    apiUrl: DOF_DATASTORE_ROOT + '890c72ed-8e35-4b82-9f8a-898dbfc26de9',
    resourceId: '890c72ed-8e35-4b82-9f8a-898dbfc26de9',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_not_reviewed_resource_split_by_year',
    retrievedAt: '2026-10-25',
    note: 'ผลผลิตกุ้งทะเล ปี 2569 (826 แถว) ไม่มีคอลัมน์ปี (ปีมาจากตัว resource เอง)',
  },
  {
    agencyId: 'dof',
    agencyLabel: DOF_AGENCY_LABEL,
    datasetUrl: DOF_DATASET_ROOT + 'c02de756-f5d6-475f-9d52-971f98a2b9c1',
    apiUrl: DOF_DATASTORE_ROOT + '5ef25e0e-eef0-4a6a-af5f-5303410c7f5f',
    resourceId: '5ef25e0e-eef0-4a6a-af5f-5303410c7f5f',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_not_reviewed_source_has_no_region_column',
    retrievedAt: '2026-10-25',
    note: 'ปริมาณและมูลค่าผลผลิตสัตว์น้ำจากการเพาะเลี้ยง (น้ำจืด) 15,410 แถว 77 จังหวัด ปี 2559–2567 ไม่มีคอลัมน์ภาค',
  },
  {
    agencyId: 'dof',
    agencyLabel: DOF_AGENCY_LABEL,
    datasetUrl: DOF_DATASET_ROOT + 'c02de756-f5d6-475f-9d52-971f98a2b9c1',
    apiUrl: DOF_DATASTORE_ROOT + '9936f81a-f5ec-457b-a5cf-7401d874b504',
    resourceId: '9936f81a-f5ec-457b-a5cf-7401d874b504',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_not_reviewed_reference_only',
    retrievedAt: '2026-10-25',
    note: 'ชุดปลาน้ำกร่อย (581 แถว 37 จังหวัด ปี 2559–2567) เก็บไว้เป็นคู่อ้างอิงของฝั่งทะเล ไม่ได้แสดงเป็นชนิดสัตว์ในแดชบอร์ด',
  },
];

/* ------------------------------------------------------------------ */
/* ค่าตัวอย่างแบบ deterministic (เฉพาะสัตว์น้ำ DOF ที่สิทธิ์ยัง pending) */
/* ------------------------------------------------------------------ */

/**
 * ช่วงค่าตัวอย่างรายภาค (หน่วยตาม def.unit) — ห้ามเพิ่มชนิดปศุสัตว์ DLD กลับเข้าตารางนี้
 * เป็นเลขสมมติที่เลือกเพื่อให้หน้าจออ่านได้ ไม่ได้ปรับเทียบกับขนาดจริงของต้นทาง
 */
const DEMO_REGION_BANDS: Record<string, { min: number; max: number; decimals: number }> = {
  'whiteleg-shrimp': { min: 111.1, max: 2345.6, decimals: 1 },
  tilapia: { min: 222.2, max: 3456.7, decimals: 1 },
  catfish: { min: 111.1, max: 1234.5, decimals: 1 },
};

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

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function demoRegionValue(speciesId: string, regionId: string, yearBe: number): number {
  const band = DEMO_REGION_BANDS[speciesId];
  if (!band) return 0;
  const random = mulberry32(seedFrom(`${speciesId}|${regionId}|${yearBe}`));
  return round(band.min + random() * (band.max - band.min), band.decimals);
}

/** ค่าจังหวัดสืบทอดจากค่าภาค (หารตามจำนวนจังหวัดของภาค แล้วเติมความผันผวนแบบคงที่) */
function demoProvinceValue(
  speciesId: string,
  provinceCode: string,
  regionValue: number,
  regionProvinceCount: number | null,
  yearBe: number,
): number {
  const band = DEMO_REGION_BANDS[speciesId];
  const decimals = band?.decimals ?? 0;
  const base = regionProvinceCount && regionProvinceCount > 0 ? regionValue / regionProvinceCount : regionValue;
  const random = mulberry32(seedFrom(`${speciesId}|province:${provinceCode}|${yearBe}`));
  const jitter = 0.55 + random() * 0.9;
  return round(base * jitter, decimals);
}

/* ------------------------------------------------------------------ */
/* สร้าง summary รายชนิดสัตว์                                            */
/* ------------------------------------------------------------------ */

const SAMPLE_NOTE =
  'ตัวเลขชุดนี้เป็นค่าตัวอย่างแบบ deterministic เพราะสิทธิ์เผยแพร่ของกรมประมงยังอยู่ระหว่างตรวจ — ไม่ใช่ค่าจริงจากต้นทาง';

/** summary จากค่าตัวอย่าง (ใช้เฉพาะชนิดที่สิทธิ์ pending เท่านั้น) */
function buildSampleSummary(
  def: LivestockSpeciesDef,
  regionDefs: LivestockRegionDef[],
  provinceRegionId: Record<string, string> | null,
): LivestockSpeciesSummary {
  const yearBe = def.yearBeLatest;
  const regionValues = regionDefs.map((region) => ({
    region,
    value: demoRegionValue(def.id, region.id, yearBe),
  }));
  const total = regionValues.reduce((sum, row) => sum + row.value, 0);
  const valueByRegionId = new Map(regionValues.map((row) => [row.region.id, row.value]));

  const regions: LivestockRegionStat[] = regionValues.map((row) => ({
    regionId: row.region.id,
    regionLabel: row.region.label,
    value: row.value,
    sharePct: total > 0 ? round((row.value / total) * 100, 1) : null,
  }));

  let topProvinces: LivestockProvinceStat[] = [];
  if (provinceRegionId) {
    const rows = Object.keys(PROVINCE_NAME_BY_CODE).map((code) => {
      const regionId = provinceRegionId[code];
      const regionValue = valueByRegionId.get(regionId) ?? 0;
      const regionProvinceCount = regionDefs.find((region) => region.id === regionId)?.provinceCount ?? null;
      return {
        province: PROVINCE_NAME_BY_CODE[code],
        value: demoProvinceValue(def.id, code, regionValue, regionProvinceCount, yearBe),
      };
    });
    rows.sort((left, right) => (right.value ?? 0) - (left.value ?? 0) || left.province.localeCompare(right.province, 'th'));
    topProvinces = rows.slice(0, 8);
  }

  return {
    speciesId: def.id,
    total,
    unit: def.unit,
    yearBe,
    provinceCount: def.provinceCount,
    regions,
    topProvinces,
    sample: true,
    readState: 'sample',
    note: SAMPLE_NOTE,
    provenance: null,
    availableYearsBe: [yearBe],
  };
}

/**
 * summary จากแถวจริงในคลัง (ปี พ.ศ. ล่าสุดของ run ที่อนุมัติ)
 * กฎความถูกต้อง: total/หน่วยเป็น null ทันทีเมื่อมีแถว null ชื่อภาคนอกชุด หรือหน่วยไม่เอกภาพ
 */
function buildRealSummary(
  def: LivestockSpeciesDef,
  rows: DldLivestockRow[],
  provenance: DldLivestockProvenance,
): LivestockSpeciesSummary {
  const availableYearsBe = [...new Set(rows.map((row) => row.sourceYearBe))].sort((left, right) => left - right);
  const yearBe = availableYearsBe.length > 0 ? availableYearsBe[availableYearsBe.length - 1] : null;
  const yearRows = yearBe === null ? [] : rows.filter((row) => row.sourceYearBe === yearBe);

  const unitValues = new Set(yearRows.map((row) => row.unit));
  const unit = unitValues.size === 1 && !unitValues.has(null) ? [...unitValues][0] : null;

  const regionNotes: string[] = [];
  let unmappedRows = 0;
  const regions: LivestockRegionStat[] = DLD_REGIONS.map((region) => {
    const matching = yearRows.filter((row) => row.regionLabel === region.label);
    if (matching.length === 0) {
      regionNotes.push(`ไม่พบแถวของ ${region.label} ในคลังสำหรับปีนี้`);
      return { regionId: region.id, regionLabel: region.label, value: null, sharePct: null };
    }
    if (matching.some((row) => row.value === null)) {
      regionNotes.push(`${region.label} มีจังหวัดที่ต้นทางไม่ระบุจำนวน ยอดรวมรายภาคนีจึงเป็น null`);
      return { regionId: region.id, regionLabel: region.label, value: null, sharePct: null };
    }
    return {
      regionId: region.id,
      regionLabel: region.label,
      value: round(matching.reduce((sum, row) => sum + (row.value ?? 0), 0), 0),
      sharePct: null,
    };
  });
  unmappedRows = yearRows.filter((row) => row.regionLabel !== null && !(row.regionLabel in DLD_REGION_ID_BY_LABEL)).length
    + yearRows.filter((row) => row.regionLabel === null).length;
  if (unmappedRows > 0) {
    regionNotes.push(`มี ${unmappedRows} แถวที่ไม่มีชื่อภาค/ชื่อภาคนอกชุดของกรมปศุสัตว์ จึงไม่นำเข้ายอดรวม`);
  }

  const nullValueRows = yearRows.filter((row) => row.value === null).length;
  const regionsComplete = regions.every((row) => row.value !== null);
  const total = yearRows.length > 0 && regionsComplete && unmappedRows === 0
    ? round(yearRows.reduce((sum, row) => sum + (row.value ?? 0), 0), 0)
    : null;
  if (nullValueRows > 0) {
    regionNotes.push(`มี ${nullValueRows} จังหวัดที่ต้นทางไม่ระบุจำนวน (คงเป็น null ไม่แปลงเป็น 0)`);
  }
  if (yearRows.length > 0 && unit === null) {
    regionNotes.push('แถวในคลังมีหน่วยไม่เอกภาพ (หรือไม่มีหน่วย) จึงแสดงหน่วยเป็นไม่ทราบและไม่สรุปหน่วยรวม');
  }

  const notes: string[] = [];
  if (total !== null) {
    for (const row of regions) {
      row.sharePct = row.value === null ? null : round((row.value / total) * 100, 1);
    }
  }
  if (regionNotes.length > 0) notes.push(...regionNotes);

  const provinceCodes = new Set(yearRows.map((row) => row.provinceCode).filter((code): code is string => code !== null));

  const ranked = yearRows
    .filter((row) => row.value !== null)
    .map((row) => ({
      province: row.provinceName ?? (row.provinceCode !== null ? PROVINCE_NAME_BY_CODE[row.provinceCode] ?? null : null),
      value: row.value as number,
    }))
    .filter((row): row is { province: string; value: number } => row.province !== null)
    .sort((left, right) => right.value - left.value || left.province.localeCompare(right.province, 'th'));

  return {
    speciesId: def.id,
    total,
    unit,
    yearBe,
    provinceCount: provinceCodes.size > 0 ? provinceCodes.size : null,
    regions,
    topProvinces: ranked.slice(0, 8),
    sample: false,
    readState: 'real',
    note: notes.length > 0 ? notes.join(' · ') : null,
    provenance,
    availableYearsBe,
  };
}

/** summary เมื่อคลังยังไม่มีแถวหรืออ่านคลังไม่ได้ — ไม่มีตัวเลข ไม่มีค่าตัวอย่าง */
function buildNoDataSummary(
  def: LivestockSpeciesDef,
  state: Extract<DldLivestockSpeciesState, { state: 'empty' | 'unavailable' }>,
): LivestockSpeciesSummary {
  return {
    speciesId: def.id,
    total: null,
    unit: null,
    yearBe: null,
    provinceCount: null,
    regions: [],
    topProvinces: [],
    sample: false,
    readState: state.state,
    note: state.note,
    provenance: null,
    availableYearsBe: [],
  };
}

async function buildDldSpeciesEntry(def: LivestockSpeciesDef): Promise<{ def: LivestockSpeciesDef; summary: LivestockSpeciesSummary }> {
  const state = await loadDldLivestockSpecies(def.id as DldLivestockSpeciesId);
  const summary = state.state === 'real'
    ? buildRealSummary(def, state.rows, state.provenance)
    : buildNoDataSummary(def, state);
  return { def, summary };
}

/* ------------------------------------------------------------------ */
/* Guard: รหัสจังหวัดในไฟล์นี้ต้องตรงกับทะเบียน 77 จังหวัดและ crosswalk */
/* ------------------------------------------------------------------ */

function assertProvinceReference() {
  const codes = Object.keys(PROVINCE_NAME_BY_CODE);
  const crosswalkCodes = Object.keys(REGION_BY_PROVINCE);
  if (codes.length !== 77) throw new Error('Expected exactly 77 province codes in livestock reference');
  if (new Set(Object.values(PROVINCE_NAME_BY_CODE)).size !== 77) throw new Error('Duplicate province name in livestock reference');
  if (codes.slice().sort().join(' ') !== crosswalkCodes.slice().sort().join(' ')) {
    throw new Error('Livestock province reference does not match the standard crosswalk');
  }
  const dldTotal = [...DLD_PROVINCE_COUNTS.values()].reduce((sum, count) => sum + count, 0);
  const standardTotal = [...STANDARD_PROVINCE_COUNTS.values()].reduce((sum, count) => sum + count, 0);
  if (dldTotal !== 77 || standardTotal !== 77) throw new Error('Region province counts must cover all 77 provinces');
}

assertProvinceReference();

/* ------------------------------------------------------------------ */
/* ตัวสร้าง payload                                                     */
/* ------------------------------------------------------------------ */

export async function buildLivestockDashboard(): Promise<LivestockDashboardPayload> {
  const dldSpecies = await Promise.all(DLD_LIVESTOCK_SPECIES.map((def) => buildDldSpeciesEntry(def)));

  /** จังหวัด → ภาคมาตรฐาน (ใช้เป็น crosswalk เพราะชุดสัตว์น้ำจืดไม่มีคอลัมน์ภาค) */
  const standardProvinceRegionId: Record<string, string> = Object.fromEntries(
    Object.keys(PROVINCE_NAME_BY_CODE).map((code) => [code, STANDARD_REGION_ID[REGION_BY_PROVINCE[code]]]),
  );

  const livestockSector: LivestockSectorPayload = {
    id: 'livestock',
    label: 'ปศุสัตว์',
    agencyLabel: DLD_AGENCY_LABEL,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    regions: DLD_REGIONS,
    species: dldSpecies,
  };

  const aquacultureSector: LivestockSectorPayload = {
    id: 'aquaculture',
    label: 'สัตว์น้ำเศรษฐกิจ',
    agencyLabel: DOF_AGENCY_LABEL,
    regionSourceLabel: `${DOF_REGION_LABEL} และ ${CROSSWALK_REGION_LABEL}`,
    regions: [...DOF_SOURCE_REGIONS, ...STANDARD_REGIONS],
    species: [
      {
        def: DOF_SHRIMP_SPECIES,
        // ชุดกุ้งมีรายชื่อจังหวัดชายทะเลที่ยังไม่ได้ตรวจยืนยัน จึงไม่จัดอันดับจังหวัด (คง null/ว่างแทนการเดา)
        summary: buildSampleSummary(DOF_SHRIMP_SPECIES, DOF_SOURCE_REGIONS, null),
      },
      ...DOF_FRESHWATER_SPECIES.map((def) => ({
        def,
        summary: buildSampleSummary(def, STANDARD_REGIONS, standardProvinceRegionId),
      })),
    ],
  };

  const sectors = [livestockSector, aquacultureSector];
  const hasSample = sectors.some((sector) => sector.species.some((entry) => entry.summary.sample));

  return {
    generatedAt: new Date().toISOString(),
    sample: hasSample,
    sectors,
    sources: SOURCES,
    warnings: LIVESTOCK_WARNINGS,
    sourceNote: SOURCE_NOTE,
    gaps: GAPS,
  };
}
