import 'server-only';
import { REGION_BY_PROVINCE } from './weather-data';
import type { RegionKey } from './weather-data';

/**
 * สถิติปศุสัตว์และสัตว์น้ำเศรษฐกิจ สำหรับหน้า /livestock และ /api/v1/livestock
 *
 * กติกาสิทธิ์ (AGENTS.md ข้อ 3 + precedent ของ lane สภาพอากาศ):
 * - ทรัพยากรของกรมปศุสัตว์ (DLD) และกรมประมง (DOF) ที่ใช้ที่นี่ยังไม่ผ่านการตรวจสิทธิ์
 *   `config/resource_licenses.json` (license_status = pending, project_publication_approved = false)
 *   ดังนั้น **ตัวเลขจริงจากต้นทางห้ามออกจากไฟล์นี้** ไฟล์นี้เก็บได้เฉพาะ metadata
 *   (ชนิดสัตว์ หน่วย grain ช่วงปี จำนวนจังหวัด/แถว URL ต้นทาง สถานะสิทธิ์ และช่องว่างข้อมูล)
 * - ตัวเลขที่ส่งให้หน้าจอเป็น "ค่าตัวอย่างแบบ deterministic" (seed จาก species|ภาค|ปี)
 *   ตั้งใจให้ไม่สืบทอดขนาดจริงของต้นทาง และต้องถูกแทนทั้งชุดเมื่อเปิดใช้งานจริง
 *   โดยห้ามเปลี่ยนรูปแบบ response
 *
 * กติกาความหมาย (AGENTS.md ข้อ 4):
 * - กรมปศุสัตว์กับกรมประมงใช้ "ภาค" คนละชุดกัน ห้ามนำมารวมหรือเทียบกันตรงๆ
 *   (ดู LIVESTOCK_WARNINGS และ gaps)
 * - ชุดข้อมูลสัตว์น้ำจืดของกรมประมงไม่มีคอลัมน์ภาค จึงต้องเทียบรหัสจังหวัดกับ
 *   ภาคมาตรฐาน (crosswalk) และต้องระบุฐานของภาคให้ผู้ใช้เห็นเสมอ
 * - ค่าที่ไม่มีจริงคือ null ไม่เดาตัวเลข
 */

export const LIVESTOCK_SAMPLE_MODE: boolean = true;

export type LivestockSectorId = 'livestock' | 'aquaculture';
export type LivestockAgencyId = 'dld' | 'dof';

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
  unit: string;
  yearBe: number;
  provinceCount: number | null;
  regions: LivestockRegionStat[];
  topProvinces: LivestockProvinceStat[];
  sample: boolean;
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

/** ข้อความเตือนที่ต้องแสดงทุก response และซ้ำใน meta.warnings ของ API */
const LIVESTOCK_WARNINGS: string[] = [
  'ตัวเลขทุกช่องในชุดนี้เป็นค่าตัวอย่างแบบ deterministic (seed จากชนิดสัตว์/ภาค/ปี) เพื่อสาธิตหน้าจอ ไม่ใช่ค่าจริงจากกรมปศุสัตว์หรือกรมประมง',
  'กรมปศุสัตว์ใช้ภาค 4 ภาค (ไม่มีภาคตะวันออก และนับจังหวัดชายทะเลฝั่งตะวันออกไว้ในภาคกลาง) ส่วนกรมประมงใช้ภาค 6 ภาค จึงห้ามนำภาคของสองหน่วยงานมารวมหรือเทียบกันตรงๆ',
  'ชุดข้อมูลกรมปศุสัตว์มีเพียง "จำนวนไก่" รวม ไม่ได้แยกไก่เนื้อกับไก่ไข่ ห้ามแยกหรือประมาณค่าตามชนิดการใช้งานเอง',
  'ค่าระดับจังหวัด/ภาคเป็น grain ของต้นทางเอง ไม่ใช่ observation ในคลังข้อมูลกลางของ Hub และไม่ใช่ค่าที่สังเกตได้จากสถานีหรือกริดใดกริดหนึ่ง',
  'สิทธิ์การเผยแพร่ของทรัพยากรที่ใช้ที่น้อยยังอยู่ระหว่างตรวจ (ป้าย Open Data Common ยังไม่ยืนยันสิทธิ์เผยแพร่ซ้ำและปีอ้างอิง) จึงไม่มีการส่งตัวเลขจริงผ่าน public API',
  'ชุดข้อมูลสัตว์น้ำจืดของกรมประมงไม่มีคอลัมน์ภาค ค่ารายภาคของปลานิล/ปลาดุกจึงมาจากการเทียบรหัสจังหวัดกับภาคมาตรฐาน ไม่ใช่ภาคของกรมประมง',
  'ข้อมูลกุ้งทะเลแยกเป็น resource รายปี (2567/2568/2569) และ resource ปี 2569 ไม่มีคอลัมน์ "ปี" เพราะปีมาจากตัว resource เอง',
  'ชื่อชนิดสัตว์ในชุดข้อมูลสัตว์น้ำจืดมีบางรายการมีช่องว่างท้ายสตริง ต้อง trim ก่อนเทียบ มิฉะนั้นจะนับชนิดสัตว์ซ้ำ (เช่นได้ 38 ชนิดแทน 20 ชนิด)',
];

const SOURCE_NOTE =
  'metadata จาก CKAN กรมปศุสัตว์และกรมประมงที่ตรวจเมื่อ 25 ต.ค. 2569 สิทธิ์ยังรอตรวจ ตัวเลขที่แสดงเป็นค่าตัวอย่างแบบ deterministic ไม่ใช่ค่าจริงจากต้นทาง';

const GAPS: LivestockDashboardPayload['gaps'] = [
  {
    title: 'ไม่มีการแยกไก่เนื้อกับไก่ไข่',
    detail:
      'ทแยงเกียรติโน้ตของกรมปศุสัตว์มีเพียงชุด "จำนวนไก่" ที่ครอบคลุม 77 จังหวัด × 5 ปี (2564–2568) ไม่มีชุดแยกตามชนิดการใช้งาน จึงยังทำการแยกไก่เนื้อ/ไก่ไข่ไม่ได้และห้ามประมาณเอง',
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
    title: 'สิทธิ์การเผยแพร่ยังรอตรวจ',
    detail:
      'ทรัพยากรทั้ง 8 รายการที่ใช้ที่นี่ยังไม่มีการตรวจสิทธิ์ฉบับเต็ม (ป้าย Open Data Common แต่ยังไม่ยืนยันตัวแปรและสิทธิ์เผยแพร่ซ้ำ รวมถึงปีอ้างอิงแบบปีปฏิทินหรือปีงบประมาณ และเวลาเผยแพร่ย้อนหลัง) จึงเผยแพร่ได้เฉพาะ metadata และตัวเลขต้องเป็นค่าตัวอย่าง',
    sourceUrl: null,
  },
  {
    title: 'รายชื่อ 35 จังหวัดชายทะเลของชุดกุ้งยังไม่ได้ตรวจยืนยัน',
    detail:
      'ตรวจได้เพียงจำนวนจังหวัด (35 จังหวัด 12 เดือน) แต่ยังไม่ได้เก็บรายชื่อจังหวัดรายตัวมาแสดง จึงไม่จัดอันดับจังหวัดของกุ้งไว้ในหน้าจอ เพื่อไม่เดาชื่อจังหวัด',
    sourceUrl: null,
  },
  {
    title: 'เขตปฏิบัติงาน 9 เขตของกรมปศุสัตว์ไม่ใช่ภาค',
    detail:
      'คอลัมน์ livestock_area ("ปศุสัตว์เขต 1"–"ปศุสัตว์เขต 9") เป็นเขตปฏิบัติงานของกรมปศุสัตว์ คนละเรื่องกับคอลัมน์ region (4 ภาค) จึงไม่ได้ทำเป็นมิติของ Hub และไม่แสดงเป็นภาค',
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
 * ใช้ในไฟล์นี้เพราะ builder เป็นฟังก์ชัน synchronous และต้องไม่อ่าน filesystem
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
  '75': 'สมุทรสงคราม', '76': 'เพชรบีรี', '77': 'ประจวบคีรีขันธ์', '80': 'นครศรีธรรมราช',
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

const DLD_LIVESTOCK_SPECIES: LivestockSpeciesDef[] = [
  {
    id: 'cattle',
    label: 'โคเนื้อ',
    sector: 'livestock',
    agency: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    sourceLabel: 'จำนวนโคเนื้อ',
    metricLabel: 'จำนวนสัตว์ (หัว)',
    unit: 'ตัว',
    grain: 'จังหวัด × ปี (พ.ศ.)',
    yearBeFrom: 2564,
    yearBeTo: 2568,
    yearBeLatest: 2568,
    provinceCount: 77,
    recordCount: 385,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    sourceUrl: DLD_DATASTORE_ROOT + 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',
    datasetUrl: DLD_DATASET_ROOT + '1bef9bc7-2f81-45c2-a21e-baba3743b456',
    resourceId: 'd3667ca5-5982-4c9e-9b0d-04e729dbe31b',
    licenseStatus: 'pending',
    availability: 'verified',
    availabilityNote:
      'ตรวจเมื่อ 25 ต.ค. 2569: เข้าถึงผ่าน CKAN datastore ได้ 385 แถว = 77 จังหวัด × 5 ปี (2564–2568) พร้อมคอลัมน์ year/particular/region/livestock_area/province/value/unit/source หน่วยที่ต้นทางประกาศคือ "ตัว"',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัว ไม่ใช่น้ำหนักสดหรือมูลค่า ห้ามรวมกับโคนม/สุกร/ไก่/เป็ด หรือเทียบกับหน่วยอื่น',
  },
  {
    id: 'dairy',
    label: 'โคนม',
    sector: 'livestock',
    agency: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    sourceLabel: 'จำนวนโคนม',
    metricLabel: 'จำนวนสัตว์ (หัว)',
    unit: 'ตัว',
    grain: 'จังหวัด × ปี (พ.ศ.)',
    yearBeFrom: 2564,
    yearBeTo: 2568,
    yearBeLatest: 2568,
    provinceCount: 77,
    recordCount: 385,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    sourceUrl: DLD_DATASTORE_ROOT + '34dc17e6-7619-4194-89e7-99f4ece84b89',
    datasetUrl: DLD_DATASET_ROOT + 'eed9283e-51b2-4384-a9b6-245b0c8c7262',
    resourceId: '34dc17e6-7619-4194-89e7-99f4ece84b89',
    licenseStatus: 'pending',
    availability: 'verified',
    availabilityNote:
      'ตรวจเมื่อ 25 ต.ค. 2569: เข้าถึงผ่าน CKAN datastore ได้ 385 แถว = 77 จังหวัด × 5 ปี (2564–2568) โครงสร้างแถวเหมือนชุดโคเนื้อทุกด้าน',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวโคนม ไม่ใช่ปริมาณนม (ลิตร/กิโลกรัม) ห้ามรวมกับโคเนื้อหรือชนิดอื่น',
  },
  {
    id: 'swine',
    label: 'สุกร',
    sector: 'livestock',
    agency: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    sourceLabel: 'จำนวนสุกร',
    metricLabel: 'จำนวนสัตว์ (หัว)',
    unit: 'ตัว',
    grain: 'จังหวัด × ปี (พ.ศ.)',
    yearBeFrom: 2564,
    yearBeTo: 2568,
    yearBeLatest: 2568,
    provinceCount: 77,
    recordCount: 385,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    sourceUrl: DLD_DATASET_ROOT + '161c766e-3ab4-475f-9976-60cfa1b7ada4/resource/47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a/download/dld_01_0501.csv',
    datasetUrl: DLD_DATASET_ROOT + '161c766e-3ab4-475f-9976-60cfa1b7ada4',
    resourceId: '47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a',
    licenseStatus: 'pending',
    availability: 'verified',
    availabilityNote:
      'ตรวจเมื่อ 25 ต.ค. 2569: resource นี้ไม่มี CKAN datastore เป็นไฟล์ CSV (ดาวน์โหลดได้ 385 แถว = 77 จังหวัด × 5 ปี) จึงไม่มี API ตัวเลขสำหรับ resource นี้',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวสุกร ไม่ใช่น้ำหนักหรือมูลค่า และไม่ได้แยกสุกรแม่ยุ่งกับสุกรขุน ห้ามรวมกับชนิดอื่น',
  },
  {
    id: 'poultry',
    label: 'ไก่',
    sector: 'livestock',
    agency: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    sourceLabel: 'จำนวนไก่',
    metricLabel: 'จำนวนสัตว์ (หัว)',
    unit: 'ตัว',
    grain: 'จังหวัด × ปี (พ.ศ.)',
    yearBeFrom: 2564,
    yearBeTo: 2568,
    yearBeLatest: 2568,
    provinceCount: 77,
    recordCount: 385,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    sourceUrl: DLD_DATASET_ROOT + 'ae4d2bdf-5cff-482f-86f4-aea93a51c018/resource/64366e81-13d2-485a-82a1-3ddc2d89869b/download/dld_01_0601.csv',
    datasetUrl: DLD_DATASET_ROOT + 'ae4d2bdf-5cff-482f-86f4-aea93a51c018',
    resourceId: '64366e81-13d2-485a-82a1-3ddc2d89869b',
    licenseStatus: 'pending',
    availability: 'verified',
    availabilityNote:
      'ตรวจเมื่อ 25 ต.ค. 2569: resource เป็นไฟล์ CSV (ดาวน์โหลดได้ 385 แถว = 77 จังหวัด × 5 ปี) เป็น "จำนวนไก่" รวม ยังไม่มีชุดแยกไก่เนื้อ/ไก่ไข่ในแคตตาล็อกกรมปศุสัตว์',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวไก่รวม (ทั้งไก่เนื้อและไก่ไข่) ไม่ใช่จำนวนไข่หรือน้ำหนัก และห้ามแยกเป็นชนิดการใช้งานเอง',
  },
  {
    id: 'duck',
    label: 'เป็ด',
    sector: 'livestock',
    agency: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    sourceLabel: 'จำนวนเป็ด',
    metricLabel: 'จำนวนสัตว์ (หัว)',
    unit: 'ตัว',
    grain: 'จังหวัด × ปี (พ.ศ.)',
    yearBeFrom: 2564,
    yearBeTo: 2568,
    yearBeLatest: 2568,
    provinceCount: 77,
    recordCount: 385,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    sourceUrl: DLD_DATASET_ROOT + '58d2c7a6-14eb-4703-a113-403c0fc86f4b/resource/c97081bc-e59d-47e1-aac9-0905b8983e08/download/dld_01_0701.csv',
    datasetUrl: DLD_DATASET_ROOT + '58d2c7a6-14eb-4703-a113-403c0fc86f4b',
    resourceId: 'c97081bc-e59d-47e1-aac9-0905b8983e08',
    licenseStatus: 'pending',
    availability: 'verified',
    availabilityNote:
      'ตรวจเมื่อ 25 ต.ค. 2569: resource เป็นไฟล์ CSV (ดาวน์โหลดได้ 385 แถว = 77 จังหวัด × 5 ปี) โครงสร้างแถวเหมือนชุดอื่นของกรมปศุสัตว์',
    unitCaution:
      'หน่วย "ตัว" คือจำนวนหัวเป็ด ไม่ใช่จำนวนไข่หรือน้ำหนัก ห้ามรวมกับไก่ซึ่งเป็นคนละชนิดและคนละหน่วยการใช้งาน',
  },
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
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_pending_redistribution_review',
    retrievedAt: '2026-10-25',
    note: 'จำนวนโคเนื้อรายจังหวัด ปี 2564–2568 (385 แถว) เข้าถึงผ่าน CKAN datastore',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + 'eed9283e-51b2-4384-a9b6-245b0c8c7262',
    apiUrl: DLD_DATASTORE_ROOT + '34dc17e6-7619-4194-89e7-99f4ece84b89',
    resourceId: '34dc17e6-7619-4194-89e7-99f4ece84b89',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_pending_redistribution_review',
    retrievedAt: '2026-10-25',
    note: 'จำนวนโคนมรายจังหวัด ปี 2564–2568 (385 แถว) เข้าถึงผ่าน CKAN datastore',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + '161c766e-3ab4-475f-9976-60cfa1b7ada4',
    apiUrl:
      DLD_DATASET_ROOT +
      '161c766e-3ab4-475f-9976-60cfa1b7ada4/resource/47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a/download/dld_01_0501.csv',
    resourceId: '47bbe7c0-fcd3-4eb6-b06b-c7ef3b51970a',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_pending_redistribution_review',
    retrievedAt: '2026-10-25',
    note: 'จำนวนสุกรรายจังหวัด ปี 2564–2568 (385 แถว) เป็นไฟล์ CSV ไม่มี datastore',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + 'ae4d2bdf-5cff-482f-86f4-aea93a51c018',
    apiUrl:
      DLD_DATASET_ROOT +
      'ae4d2bdf-5cff-482f-86f4-aea93a51c018/resource/64366e81-13d2-485a-82a1-3ddc2d89869b/download/dld_01_0601.csv',
    resourceId: '64366e81-13d2-485a-82a1-3ddc2d89869b',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_pending_redistribution_review',
    retrievedAt: '2026-10-25',
    note: 'จำนวนไก่รวมรายจังหวัด ปี 2564–2568 (385 แถว) เป็นไฟล์ CSV และไม่มีการแยกไก่เนื้อ/ไก่ไข่',
  },
  {
    agencyId: 'dld',
    agencyLabel: DLD_AGENCY_LABEL,
    datasetUrl: DLD_DATASET_ROOT + '58d2c7a6-14eb-4703-a113-403c0fc86f4b',
    apiUrl:
      DLD_DATASET_ROOT +
      '58d2c7a6-14eb-4703-a113-403c0fc86f4b/resource/c97081bc-e59d-47e1-aac9-0905b8983e08/download/dld_01_0701.csv',
    resourceId: 'c97081bc-e59d-47e1-aac9-0905b8983e08',
    licenseStatus: 'pending',
    reviewOutcome: 'open_data_common_label_pending_redistribution_review',
    retrievedAt: '2026-10-25',
    note: 'จำนวนเป็ดรายจังหวัด ปี 2564–2568 (385 แถว) เป็นไฟล์ CSV',
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
/* ค่าตัวอย่างแบบ deterministic                                         */
/* ------------------------------------------------------------------ */

/**
 * ช่วงค่าตัวอย่างรายภาค (หน่วยตาม def.unit)
 * เป็นเลขสมมติที่เลือกเพื่อให้หน้าจออ่านได้ ไม่ได้ปรับเทียบกับขนาดจริงของต้นทาง
 * และต้องถูกแทนทั้งชุดด้วย batch ที่ผ่านการอนุมัติแล้วเมื่อสิทธิ์ชัดเจน
 */
const DEMO_REGION_BANDS: Record<string, { min: number; max: number; decimals: number }> = {
  cattle: { min: 111_000, max: 444_000, decimals: 0 },
  dairy: { min: 33_000, max: 177_000, decimals: 0 },
  swine: { min: 88_000, max: 333_000, decimals: 0 },
  poultry: { min: 222_000, max: 666_000, decimals: 0 },
  duck: { min: 44_000, max: 111_000, decimals: 0 },
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

function buildSummary(
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
  };
}

/** จังหวัด → ภาคของกรมปศุสัตว์ (ภาคกลางรวมจังหวัดชายทะเลฝั่งตะวันออก) */
const DLD_PROVINCE_REGION_ID: Record<string, string> = Object.fromEntries(
  Object.keys(PROVINCE_NAME_BY_CODE).map((code) => [code, DLD_REGION_ID[REGION_BY_PROVINCE[code]]]),
);

/** จังหวัด → ภาคมาตรฐาน (ใช้เป็น crosswalk เพราะชุดสัตว์น้ำจืดไม่มีคอลัมน์ภาค) */
const STANDARD_PROVINCE_REGION_ID: Record<string, string> = Object.fromEntries(
  Object.keys(PROVINCE_NAME_BY_CODE).map((code) => [code, STANDARD_REGION_ID[REGION_BY_PROVINCE[code]]]),
);

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

export function buildLivestockDashboard(): LivestockDashboardPayload {
  const livestockSector: LivestockSectorPayload = {
    id: 'livestock',
    label: 'ปศุสัตว์',
    agencyLabel: DLD_AGENCY_LABEL,
    regionSourceLabel: DLD_LIVESTOCK_REGION_LABEL,
    regions: DLD_REGIONS,
    species: DLD_LIVESTOCK_SPECIES.map((def) => ({
      def,
      summary: buildSummary(def, DLD_REGIONS, DLD_PROVINCE_REGION_ID),
    })),
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
        summary: buildSummary(DOF_SHRIMP_SPECIES, DOF_SOURCE_REGIONS, null),
      },
      ...DOF_FRESHWATER_SPECIES.map((def) => ({
        def,
        summary: buildSummary(def, STANDARD_REGIONS, STANDARD_PROVINCE_REGION_ID),
      })),
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    sample: true,
    sectors: [livestockSector, aquacultureSector],
    sources: SOURCES,
    warnings: LIVESTOCK_WARNINGS,
    sourceNote: SOURCE_NOTE,
    gaps: GAPS,
  };
}
