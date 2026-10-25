/**
 * Satellite / Earth-observation dashboard simulation data.
 *
 * ทุกค่าในโมดูลนี้เป็น synthetic simulation แบบ deterministic (seeded FNV-1a)
 * เพื่อสาธิตหน้าจอข้อมูลดาวเทียมเท่านั้น **ไม่มีการดึงหรือประมวลผลภาพจริง**
 * จาก GISTDA, Sentinel (Copernicus) หรือ MODIS (NASA LP DAAC / Planetary Computer)
 * และทั้งสามแหล่งยังมี `license_status: pending` ใน config/sources.json —
 * ห้ามตีความตัวเลขใดเป็นค่าสังเกตการณ์จริงหรือประกาศของหน่วยงานต้นทาง
 */

export type SatelliteLayer = 'flood' | 'drought' | 'ndvi';
export type SatellitePlatform = 'gistda' | 'sentinel' | 'modis';
export type SatelliteRiskLevel = 'critical' | 'warning' | 'normal';
export type DroughtClass = 'extreme' | 'severe' | 'moderate' | 'mild' | 'none';
export type VigourClass = 'bare_stress' | 'sparse' | 'moderate' | 'dense' | 'very_dense';
export type PixelReliability = 'good' | 'marginal' | 'cloud' | 'no_data';
export type RepeatFloodClass = 'repeat_5plus' | 'repeat_3_4' | 'repeat_1_2' | 'none';

export const SATELLITE_GOVERNANCE = {
  sample: true,
  access: 'metadata_only' as const,
  version: '2026.10-sat-sim-v1',
  bannerText: 'ข้อมูลดาวเทียมจำลองเพื่อการสาธิต (Satellite EO Simulation only) — ไม่ได้ประมวลผลภาพจริงจาก GISTDA / Sentinel / MODIS',
  disclaimer:
    'ดัชนีน้ำท่วม ภัยแล้ง และ NDVI รายจังหวัดในหน้านี้เป็นชุดข้อมูลสังเคราะห์เชิงโครงสร้าง (deterministic simulation) เพื่อสาธิตสถาปัตยกรรม Thailand Agricultural Data Hub เท่านั้น ไม่ได้ดึงหรือประมวลผลภาพดาวเทียมจริงจาก GISTDA, Sentinel (Copernicus) หรือ MODIS (NASA LP DAAC / USGS) ซึ่งทั้งสามแหล่งยังมีสถานะสิทธิ์ pending และยังไม่ผ่านการตรวจ runtime',
  updatedAt: '2026-10-25T00:00:00+07:00',
};

export const SATELLITE_WARNINGS: string[] = [
  'ชุดข้อมูลนี้เป็นแบบจำลองสังเคราะห์ (deterministic simulation) ไม่ได้มาจากการประมวลผลภาพดาวเทียมจริงทุกชนิด',
  'แหล่ง gistda และ sentinel ยังไม่มีการทบทวนสิทธิ์ระดับ resource เลย (resource_licenses = 0 แถว, สถานะ discovery_required) — ห้ามอ้างสิทธิ์ใช้งานหรือข้อความ attribution แทนต้นทาง',
  'แหล่ง modis มี 1 resource ที่ทบทวนแล้วแต่ license_status ยังเป็น pending และ project_publication_approved = false — ห้ามเผยแพร่ตัวเลขเป็นข้อมูลสาธารณะ',
  'การรวมค่าระดับจังหวัด/ลุ่มน้ำเป็นการ aggregate จาก grid sample จำลอง ไม่ใช่สถิติราชการรายจังหวัด และ grid/tile/สถานี ไม่เท่ากับจังหวัด',
  'จังหวัดในหน้านี้เป็น subset สาธิต (~33 จังหวัดเกษตรสำคัญ) ไม่ใช่ครอบคลุม 77 จังหวัด และจำนวนจังหวัดห้ามอ่านเป็น coverage ระดับประเทศ',
  'repository นี้ไม่มี geometry ขอบเขตจังหวัด (verification_status = code_name_verified_geometry_not_supplied) จึงไม่มีการแสดงผลแผนที่/ polygon / bounding box ใด ๆ',
  'พื้นที่น้ำท่วมถูกรายงานเป็นสองฟิลด์แยกกัน (ไร่ และ ตร.กม.) ผ่านตัวแปลงเดียว 1 ตร.กม. = 625 ไร่ ห้ามนำผลรวมต่างหน่วย/ต่างผลิตภัณฑ์ไปบวกรวมกันซ้ำ',
];

/* ------------------------------------------------------------------ */
/* Source catalog — ข้อเท็จจริงจาก config/sources.json + resource_licenses.json */
/* ------------------------------------------------------------------ */

export interface SatelliteSourceCatalogItem {
  sourceId: SatellitePlatform;
  owner: string;
  name: string;
  url: string;
  baseUrl: string;
  type: string;
  status: string;
  licenseStatus: 'pending';
  authStatus: string;
  dataGrain: string[];
  topics: string[];
  domains: string[];
  priority: string;
  runtimeVerified: false;
  /** จำนวนแถวใน config/resource_licenses.json — 0 หมายถึงยังไม่เคยทบทวนระดับ resource เลย */
  licenseReviewRows: number;
  reviewOutcome: string | null;
  declaredLicense: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  projectPublicationApproved: false;
  sourceDefinition: string;
  spatialScopeNote: string | null;
  unresolved: string[];
}

const RESOURCE_INSPECTION_DEFINITION =
  'Dataset-specific definition and temporal coverage require resource inspection.';

export const SATELLITE_SOURCES: SatelliteSourceCatalogItem[] = [
  {
    sourceId: 'gistda',
    owner: 'สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ',
    name: 'GISTDA Thailand Satellite Products',
    url: 'https://www.gistda.or.th',
    baseUrl: 'https://www.gistda.or.th',
    type: 'discovery',
    status: 'discovery_required',
    licenseStatus: 'pending',
    authStatus: 'product-specific',
    dataGrain: ['grid', 'polygon'],
    topics: ['ndvi', 'ndmi', 'disaster'],
    domains: ['AG09', 'AG10', 'AG11', 'AG17'],
    priority: 'P1',
    runtimeVerified: false,
    licenseReviewRows: 0,
    reviewOutcome: null,
    declaredLicense: null,
    licenseUrl: null,
    attributionText: null,
    projectPublicationApproved: false,
    sourceDefinition: RESOURCE_INSPECTION_DEFINITION,
    spatialScopeNote: null,
    unresolved: [
      'ยังไม่มีการสำรวจและทบทวนสิทธิ์ระดับ resource (0 แถวใน resource_licenses) ต้องทำ discovery ก่อนอ้างใช้ข้อมูล',
    ],
  },
  {
    sourceId: 'sentinel',
    owner: 'Copernicus / European Union',
    name: 'Sentinel Thailand Crop Watch',
    url: 'https://dataspace.copernicus.eu',
    baseUrl: 'https://dataspace.copernicus.eu',
    type: 'service_catalog',
    status: 'documented_not_runtime_verified',
    licenseStatus: 'pending',
    authStatus: 'registration_and_token_for_selected_services',
    dataGrain: ['grid'],
    topics: ['ndvi', 'ndmi'],
    domains: ['AG10', 'AG11'],
    priority: 'P1',
    runtimeVerified: false,
    licenseReviewRows: 0,
    reviewOutcome: null,
    declaredLicense: null,
    licenseUrl: null,
    attributionText: null,
    projectPublicationApproved: false,
    sourceDefinition: RESOURCE_INSPECTION_DEFINITION,
    spatialScopeNote: 'Thailand intersecting tiles only; publish area summaries, not raw raster archives in Git.',
    unresolved: [
      'ยังไม่มีการสำรวจและทบทวนสิทธิ์ระดับ resource (0 แถวใน resource_licenses) ต้องทำ discovery ก่อนอ้างใช้ข้อมูล',
    ],
  },
  {
    sourceId: 'modis',
    owner: 'NASA LP DAAC / USGS',
    name: 'MODIS Vegetation Indices (MOD13A1)',
    url: 'https://lpdaac.usgs.gov',
    baseUrl: 'https://planetarycomputer.microsoft.com',
    type: 'stac_raster',
    status: 'documented_not_runtime_verified',
    licenseStatus: 'pending',
    authStatus: 'none_for_stac_read',
    dataGrain: ['grid_point', 'grid'],
    topics: ['ndvi', 'vegetation', 'satellite'],
    domains: ['AG10', 'AG11'],
    priority: 'P1',
    runtimeVerified: false,
    licenseReviewRows: 1,
    reviewOutcome: 'us_gov_work_and_planetary_computer_terms_pending_project_review',
    declaredLicense: 'NASA Open Data Policy / US Government Work',
    licenseUrl: 'https://lpdaac.usgs.gov/data/data-citation-and-policies/',
    attributionText: 'NASA LP DAAC / USGS MODIS data accessed via Microsoft Planetary Computer',
    projectPublicationApproved: false,
    sourceDefinition:
      'MODIS Terra/Aqua 16-day 500m vegetation indices (NDVI/EVI), pixel reliability, and quality flags covering Thailand via Planetary Computer.',
    spatialScopeNote: null,
    unresolved: [
      'Project-specific approval for public dataset release and external dashboard redistribution',
      'Validation of cloud masking vs field survey references across Thai agricultural regions',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* NDVI scale legend                                                   */
/* ------------------------------------------------------------------ */

export interface NdviScaleBand {
  id: VigourClass;
  label: string;
  min: number;
  max: number;
  color: string;
  description: string;
}

/** ช่วงต่อเนื่องไม่ซ้อนกัน ครอบคลุม -0.1..0.9 เรียงจากแย่สุดไปดีที่สุด (น้ำตาล→เขียว) */
export const NDVI_SCALE: NdviScaleBand[] = [
  {
    id: 'bare_stress',
    label: 'แล้งจัด',
    min: -0.1,
    max: 0.1,
    color: '#7c4a1e',
    description: 'พืชเครียดน้ำรุนแรง/ดินเปลือย ความเขียวเกือบไม่มี',
  },
  {
    id: 'sparse',
    label: 'พืชเบาบาง',
    min: 0.1,
    max: 0.25,
    color: '#a97524',
    description: 'เรือนพุ่มเบาบาง พืชแคระแกร็นหรือเพิ่งเริ่มปลูก',
  },
  {
    id: 'moderate',
    label: 'ปานกลาง',
    min: 0.25,
    max: 0.45,
    color: '#c9a832',
    description: 'ความเขียวระดับกลาง พืชไร่ระยะเจริญเติบโต',
  },
  {
    id: 'dense',
    label: 'เขียวหนาแน่น',
    min: 0.45,
    max: 0.65,
    color: '#6f9c34',
    description: 'เรือนพุ่มหนาแน่น นาข้าวระยะแตกกอ-ตั้งท้อง',
  },
  {
    id: 'very_dense',
    label: 'เขียวสมบูรณ์',
    min: 0.65,
    max: 0.9,
    color: '#2e7d32',
    description: 'พืชสมบูรณ์สูงสุด ป่า/ไม้ผล/นาข้าวระยะเขียวเต็มที่',
  },
];

export function classifyNdvi(value: number): VigourClass {
  const v = Math.min(0.9, Math.max(-0.1, value));
  for (let i = 0; i < NDVI_SCALE.length; i += 1) {
    const band = NDVI_SCALE[i];
    const isLast = i === NDVI_SCALE.length - 1;
    if (v >= band.min && (v < band.max || isLast)) return band.id;
  }
  return 'bare_stress';
}

/* ------------------------------------------------------------------ */
/* Contract interfaces                                                 */
/* ------------------------------------------------------------------ */

export interface SatelliteScene {
  sceneId: string;
  platform: SatellitePlatform;
  sensor: string;
  acquiredAt: string;
  orbitPass: 'ascending' | 'descending';
  cloudCoverPercent: number;
  crs: string;
  resolutionM: number;
  tileId: string | null;
  qualityFlag: string;
}

export interface ProvinceSatelliteRisk {
  provinceCode: string;
  provinceName: string;
  region: string;
  basinName: string;
  latestScene: SatelliteScene;
  overallRisk: SatelliteRiskLevel;
  flood: {
    inundatedAreaRai: number;
    inundatedAreaSqKm: number;
    recurrenceClass: RepeatFloodClass;
    repeatFloodEventYears: number[];
    floodFrequencyIndex: number;
    maxInundationDepthCm: number | null;
    riskLevel: SatelliteRiskLevel;
    affectedCrops: string[];
    advisory: string;
  };
  drought: {
    vci: number;
    tci: number;
    spi3m: number;
    droughtClass: DroughtClass;
    riskLevel: SatelliteRiskLevel;
    advisory: string;
  };
  ndvi: {
    ndvi: number;
    evi: number;
    ndmi: number;
    vigourClass: VigourClass;
    anomalyVsBaselinePercent: number;
    baselinePeriod: string;
    pixelReliability: PixelReliability;
    samplePixelCount: number;
  };
}

export interface BasinFloodStat {
  basinCode: string;
  basinName: string;
  region: string;
  inundatedAreaRai: number;
  inundatedAreaSqKm: number;
  sceneCount: number;
  platformBreakdown: Record<SatellitePlatform, number>;
  provincesCovered: number;
  peakAcquiredAt: string;
}

export interface SatelliteSummary {
  totalScenes: number;
  platformsCovered: number;
  provincesCovered: number;
  totalInundatedAreaRai: number;
  totalInundatedAreaSqKm: number;
  repeatFloodProvinceCount: number;
  severeDroughtProvinceCount: number;
  avgNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  latestAcquiredAt: string;
  headline: string;
  subheadline: string;
  sample: true;
  reportDate: string;
}

/* ------------------------------------------------------------------ */
/* Deterministic seeded universe                                       */
/* ------------------------------------------------------------------ */

/** FNV-1a 32-bit hash — deterministic across server/client and test runs. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  return fnv1a(seed) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 1 ตร.กม. = 625 ไร่ — ตัวแปลงเดียวที่ใช้ทั้งโมดูล ห้ามแปลงอื่นปน */
function raiToSqKm(rai: number): number {
  return Math.round((rai / 625) * 100) / 100;
}

type ProvinceProfile = {
  code: string;
  name: string;
  region: string;
  basinName: string;
  basinSlug: string;
  /** ความถี่น้ำท่วมเชิงประวัติ 0-100 ใช้ขับทุกฟิลด์ฝั่ง flood ให้สอดคล้องกัน */
  floodFreq: number;
  /** ความเสี่ยงภัยแล้งเชิงประวัติ 0-100 */
  droughtProne: number;
  repeatFloodEventYears: number[];
  crops: string[];
};

/**
 * ~33 จังหวัดเกษตรสำคัญ (รหัสจริงจาก config/provinces.csv) ครอบคลุม 6 ภาค
 * รวมจังหวัดน้ำท่วมซ้ำซากและจังหวัดแล้งซ้ำซากที่ระบุในโจทย์
 */
const PROVINCE_PROFILES: ProvinceProfile[] = [
  // --- ภาคเหนือ ---
  { code: '50', name: 'เชียงใหม่', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำปิง', basinSlug: 'ping', floodFreq: 45, droughtProne: 40, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'ลำไย', 'กระเทียม'] },
  { code: '52', name: 'ลำปาง', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำวัง', basinSlug: 'wang', floodFreq: 38, droughtProne: 45, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'สับปะรด', 'ข้าวโพดเลี้ยงสัตว์'] },
  { code: '55', name: 'น่าน', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำน่านตอนบน', basinSlug: 'nan', floodFreq: 48, droughtProne: 35, repeatFloodEventYears: [2006], crops: ['ข้าวไร่', 'ข้าวโพดเลี้ยงสัตว์', 'ยางพารา'] },
  { code: '62', name: 'กำแพงเพชร', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำปิง', basinSlug: 'ping', floodFreq: 55, droughtProne: 40, repeatFloodEventYears: [2011, 2021], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'มันสำปะหลัง'] },
  { code: '64', name: 'สุโขทัย', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำยม', basinSlug: 'yom', floodFreq: 92, droughtProne: 8, repeatFloodEventYears: [2011, 2017, 2021, 2023, 2024], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'กล้วยตาก'] },
  { code: '65', name: 'พิษณุโลก', region: 'ภาคเหนือ', basinName: 'ลุ่มน้ำน่าน', basinSlug: 'nan', floodFreq: 85, droughtProne: 10, repeatFloodEventYears: [2011, 2017, 2021, 2022, 2023], crops: ['ข้าวนาปี', 'มะม่วงน้ำดอกไม้', 'ข้าวโพดเลี้ยงสัตว์'] },

  // --- ภาคกลาง ---
  { code: '14', name: 'พระนครศรีอยุธยา', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 95, droughtProne: 5, repeatFloodEventYears: [2006, 2011, 2017, 2021, 2022, 2024], crops: ['ข้าวนาปี', 'บัวหลวง', 'พืชผักสวนครัว'] },
  { code: '60', name: 'นครสวรรค์', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา (ปากน้ำโพ)', basinSlug: 'chaophraya', floodFreq: 88, droughtProne: 8, repeatFloodEventYears: [2006, 2011, 2017, 2021, 2022, 2024], crops: ['ข้าวนาปี', 'มันสำปะหลัง', 'อ้อยโรงงาน'] },
  { code: '18', name: 'ชัยนาท', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 80, droughtProne: 10, repeatFloodEventYears: [2011, 2017, 2021, 2022], crops: ['ส้มโอขาวแตงกวา', 'ข้าวนาปี', 'ข้าวโพดเลี้ยงสัตว์'] },
  { code: '15', name: 'อ่างทอง', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 78, droughtProne: 12, repeatFloodEventYears: [2011, 2017, 2022], crops: ['ข้าวนาปี', 'ผักตบชวาแปรรูป', 'มะม่วง'] },
  { code: '17', name: 'สิงห์บุรี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยา', basinSlug: 'chaophraya', floodFreq: 76, droughtProne: 12, repeatFloodEventYears: [2011, 2017, 2021], crops: ['ข้าวนาปี', 'ปลาช่อนแม่ลา', 'พืชผักสวนครัว'] },
  { code: '13', name: 'ปทุมธานี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำเจ้าพระยาตอนล่าง', basinSlug: 'chaophraya', floodFreq: 62, droughtProne: 20, repeatFloodEventYears: [2011, 2022], crops: ['กล้วยไม้', 'ข้าวนาปี', 'บัวตัดดอก'] },
  { code: '72', name: 'สุพรรณบุรี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำท่าจีน', basinSlug: 'thachin', floodFreq: 60, droughtProne: 28, repeatFloodEventYears: [2011, 2021], crops: ['ข้าวนาปี', 'แห้วสุพรรณ', 'อ้อยโรงงาน'] },
  { code: '16', name: 'ลพบุรี', region: 'ภาคกลาง', basinName: 'ลุ่มน้ำป่าสัก', basinSlug: 'pasak', floodFreq: 50, droughtProne: 45, repeatFloodEventYears: [2011], crops: ['ข้าวโพดเลี้ยงสัตว์', 'ทานตะวัน', 'อ้อยโรงงาน'] },

  // --- ภาคตะวันออกเฉียงเหนือ ---
  { code: '34', name: 'อุบลราชธานี', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูลตอนล่าง', basinSlug: 'mun', floodFreq: 94, droughtProne: 6, repeatFloodEventYears: [2019, 2021, 2022, 2023, 2024], crops: ['ข้าวหอมมะลิทุ่งกุลา', 'มันสำปะหลัง', 'ยางพารา'] },
  { code: '45', name: 'ร้อยเอ็ด', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชี', basinSlug: 'chi', floodFreq: 82, droughtProne: 15, repeatFloodEventYears: [2021, 2022, 2023], crops: ['ข้าวหอมมะลิ GI ทุ่งกุลา', 'แตงโม', 'พริก'] },
  { code: '31', name: 'บุรีรัมย์', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูล - ลำปลายมาศ', basinSlug: 'mun', floodFreq: 20, droughtProne: 78, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'มันสำปะหลัง'] },
  { code: '32', name: 'สุรินทร์', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูล', basinSlug: 'mun', floodFreq: 25, droughtProne: 72, repeatFloodEventYears: [], crops: ['ข้าวหอมมะลิอินทรีย์', 'มันสำปะหลัง', 'หอมแดง'] },
  { code: '47', name: 'สกลนคร', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำสงคราม - หนองหาร', basinSlug: 'songkhram', floodFreq: 30, droughtProne: 68, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'คราม', 'ยางพารา'] },
  { code: '46', name: 'กาฬสินธุ์', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชี', basinSlug: 'chi', floodFreq: 28, droughtProne: 74, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'ข้าวโพดเลี้ยงสัตว์', 'มันสำปะหลัง'] },
  { code: '44', name: 'มหาสารคาม', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชี', basinSlug: 'chi', floodFreq: 26, droughtProne: 76, repeatFloodEventYears: [], crops: ['ข้าวนาปี', 'มันสำปะหลัง', 'ถั่วลิสง'] },
  { code: '40', name: 'ขอนแก่น', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำชีตอนกลาง', basinSlug: 'chi', floodFreq: 35, droughtProne: 65, repeatFloodEventYears: [2021], crops: ['ข้าวนาปี', 'อ้อยโรงงาน', 'มันสำปะหลัง'] },
  { code: '30', name: 'นครราชสีมา', region: 'ภาคตะวันออกเฉียงเหนือ', basinName: 'ลุ่มน้ำมูลตอนบน', basinSlug: 'mun', floodFreq: 40, droughtProne: 62, repeatFloodEventYears: [2010, 2021], crops: ['ข้าวโพดเลี้ยงสัตว์', 'มันสำปะหลัง', 'น้อยหน่าปากช่อง'] },

  // --- ภาคตะวันออก ---
  { code: '25', name: 'ปราจีนบุรี', region: 'ภาคตะวันออก', basinName: 'ลุ่มน้ำบางปะกง (ปราจีนบุรี)', basinSlug: 'bangpakong', floodFreq: 84, droughtProne: 8, repeatFloodEventYears: [2013, 2020, 2021, 2022], crops: ['ข้าวนาปี', 'ไผ่ตง', 'สมุนไพร'] },
  { code: '27', name: 'สระแก้ว', region: 'ภาคตะวันออก', basinName: 'ลุ่มน้ำบางปะกง', basinSlug: 'bangpakong', floodFreq: 22, droughtProne: 80, repeatFloodEventYears: [], crops: ['มันสำปะหลัง', 'อ้อยโรงงาน', 'ข้าวโพดเลี้ยงสัตว์'] },
  { code: '24', name: 'ฉะเชิงเทรา', region: 'ภาคตะวันออก', basinName: 'ลุ่มน้ำบางปะกงตอนล่าง', basinSlug: 'bangpakong', floodFreq: 58, droughtProne: 30, repeatFloodEventYears: [2011, 2022], crops: ['ข้าวนาปี', 'มะม่วงน้ำดอกไม้', 'กุ้งกุลาดำ'] },

  // --- ภาคตะวันตก ---
  { code: '71', name: 'กาญจนบุรี', region: 'ภาคตะวันตก', basinName: 'ลุ่มน้ำแม่กลอง', basinSlug: 'maeklong', floodFreq: 35, droughtProne: 50, repeatFloodEventYears: [], crops: ['อ้อยโรงงาน', 'มันสำปะหลัง', 'หน่อไม้ฝรั่ง'] },
  { code: '70', name: 'ราชบุรี', region: 'ภาคตะวันตก', basinName: 'ลุ่มน้ำแม่กลอง', basinSlug: 'maeklong', floodFreq: 40, droughtProne: 48, repeatFloodEventYears: [], crops: ['ข้าวโพดหวาน', 'มะพร้าวน้ำหอม', 'ผักกินใบ'] },
  { code: '77', name: 'ประจวบคีรีขันธ์', region: 'ภาคตะวันตก', basinName: 'ลุ่มน้ำปราณบุรี - กุยบุรี', basinSlug: 'pranburi', floodFreq: 18, droughtProne: 85, repeatFloodEventYears: [], crops: ['สับปะรดปัตตาเวีย', 'มะพร้าวทับสะแก', 'ปาล์มน้ำมัน'] },

  // --- ภาคใต้ ---
  { code: '80', name: 'นครศรีธรรมราช', region: 'ภาคใต้', basinName: 'ลุ่มน้ำปากพนัง', basinSlug: 'pakphanang', floodFreq: 90, droughtProne: 6, repeatFloodEventYears: [2016, 2017, 2020, 2021, 2023], crops: ['ส้มโอทับทิมสยาม', 'มังคุด', 'ยางพารา'] },
  { code: '96', name: 'นราธิวาส', region: 'ภาคใต้', basinName: 'ลุ่มน้ำโก-ลก', basinSlug: 'kolok', floodFreq: 88, droughtProne: 8, repeatFloodEventYears: [2016, 2017, 2020, 2021, 2023, 2024], crops: ['ลองกอง', 'ยางพารา', 'ปาล์มน้ำมัน'] },
  { code: '84', name: 'สุราษฎร์ธานี', region: 'ภาคใต้', basinName: 'ลุ่มน้ำตาปี', basinSlug: 'tapi', floodFreq: 65, droughtProne: 18, repeatFloodEventYears: [2016, 2020], crops: ['ปาล์มน้ำมัน', 'ยางพารา', 'ทุเรียน'] },
  { code: '90', name: 'สงขลา', region: 'ภาคใต้', basinName: 'ลุ่มน้ำทะเลสาบสงขลา', basinSlug: 'songkhla-lake', floodFreq: 60, droughtProne: 22, repeatFloodEventYears: [2010, 2023], crops: ['ยางพารา', 'ไม้ผลผสม', 'ปลากะพง'] },
];

const PLATFORM_ROTATION: SatellitePlatform[] = ['gistda', 'sentinel', 'modis'];

const PLATFORM_META: Record<
  SatellitePlatform,
  { sensors: string[]; crs: string[]; resolutionM: number; tilePrefixes: string[] | null }
> = {
  gistda: {
    sensors: ['THEOS-2 MSI (จำลอง)', 'SAR ประกอบแผนที่น้ำท่วม GISTDA (จำลอง)'],
    crs: ['EPSG:4326'],
    resolutionM: 50,
    tilePrefixes: null,
  },
  sentinel: {
    sensors: ['Sentinel-2A MSI (จำลอง)', 'Sentinel-2B MSI (จำลอง)', 'Sentinel-1A C-SAR (จำลอง)'],
    crs: ['EPSG:32647', 'EPSG:32648'],
    resolutionM: 10,
    tilePrefixes: ['T47PQP', 'T47PPQ', 'T48PQR', 'T47QNR'],
  },
  modis: {
    sensors: ['MODIS Terra MOD13A1 (จำลอง)', 'MODIS Aqua MOD13A1 (จำลอง)'],
    crs: ['EPSG:6933'],
    resolutionM: 500,
    tilePrefixes: ['h27v07', 'h27v06', 'h28v07', 'h28v06'],
  },
};

const QUALITY_FLAGS = [
  'VI Quality: good (จำลอง)',
  'VI Quality: marginal, cloud edge (จำลอง)',
  'pixel reliability flagged, adjacent cloud (จำลอง)',
  'quality OK, mixed pixel warning (จำลอง)',
];

function formatAcquiredAt(daysAgo: number, hour: number, minute: number): string {
  const base = Date.UTC(2026, 9, 25);
  const d = new Date(base - daysAgo * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
}

function buildScenes(profile: ProvinceProfile, floodIdx: number): SatelliteScene[] {
  const seed = `sat-sim:scene:${profile.code}`;
  const sceneCount = 2 + Math.floor(seededUnit(seed + ':count') * 3); // 2-4 scenes
  const rotationOffset = Math.floor(seededUnit(seed + ':rot') * PLATFORM_ROTATION.length);
  // จังหวัดน้ำท่วมสูง → เมฆเฉลี่ยสูงตาม (สอดคล้องเชิงกายภาพกับ flood signal)
  // สัมประสิทธิ์ต้องสูงพอให้จังหวัดวิกฤติเฉลี่ยเกิน 70% ได้จริง ไม่นั้นระดับ
  // pixelReliability = 'cloud' จะไม่มีวันเกิดขึ้นแม้ประกาศไว้ใน type ก็ตาม
  const cloudBase = 12 + floodIdx * 0.68;

  const scenes: SatelliteScene[] = [];
  for (let n = 1; n <= sceneCount; n += 1) {
    const ns = `${seed}:${n}`;
    const platform = PLATFORM_ROTATION[(rotationOffset + n - 1) % PLATFORM_ROTATION.length];
    const meta = PLATFORM_META[platform];
    const sensor = meta.sensors[Math.floor(seededUnit(ns + ':sensor') * meta.sensors.length)];
    const crs = meta.crs[Math.floor(seededUnit(ns + ':crs') * meta.crs.length)];
    const tileId = meta.tilePrefixes
      ? `${meta.tilePrefixes[Math.floor(seededUnit(ns + ':tile') * meta.tilePrefixes.length)]} (จำลอง)`
      : null;
    const daysAgo = 1 + Math.floor(seededUnit(ns + ':day') * 28);
    const hour = 7 + Math.floor(seededUnit(ns + ':hour') * 10);
    const minute = Math.floor(seededUnit(ns + ':min') * 60);
    const cloudCoverPercent = clamp(Math.round(cloudBase + (seededUnit(ns + ':cloud') * 26 - 13)), 2, 97);
    const qualityFlag = QUALITY_FLAGS[Math.floor(seededUnit(ns + ':q') * QUALITY_FLAGS.length)];

    scenes.push({
      sceneId: `sim-scene-${profile.code}-${n}`,
      platform,
      sensor,
      acquiredAt: formatAcquiredAt(daysAgo, hour, minute),
      orbitPass: seededUnit(ns + ':orbit') < 0.5 ? 'ascending' : 'descending',
      cloudCoverPercent,
      crs,
      resolutionM: meta.resolutionM,
      tileId,
      qualityFlag,
    });
  }
  return scenes;
}

function floodRiskLevelOf(floodIdx: number): SatelliteRiskLevel {
  if (floodIdx >= 75) return 'critical';
  if (floodIdx >= 50) return 'warning';
  return 'normal';
}

function droughtClassOf(vci: number): DroughtClass {
  if (vci < 20) return 'extreme';
  if (vci < 35) return 'severe';
  if (vci < 50) return 'moderate';
  if (vci < 65) return 'mild';
  return 'none';
}

function droughtRiskLevelOf(cls: DroughtClass): SatelliteRiskLevel {
  if (cls === 'extreme' || cls === 'severe') return 'critical';
  if (cls === 'moderate' || cls === 'mild') return 'warning';
  return 'normal';
}

const RISK_RANK: Record<SatelliteRiskLevel, number> = { critical: 2, warning: 1, normal: 0 };

function worstRisk(a: SatelliteRiskLevel, b: SatelliteRiskLevel): SatelliteRiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function recurrenceClassOf(years: number[]): RepeatFloodClass {
  if (years.length >= 5) return 'repeat_5plus';
  if (years.length >= 3) return 'repeat_3_4';
  if (years.length >= 1) return 'repeat_1_2';
  return 'none';
}

function floodAdvisory(level: SatelliteRiskLevel, rai: number, crops: string[]): string {
  if (level === 'critical') {
    return `ภาพดาวเทียม (จำลอง) พบน้ำท่วมขังประมาณ ${rai.toLocaleString('th-TH')} ไร่ ให้เร่งเกี่ยวข้าว/พืชที่สุกแก่หนีน้ำ เปิดทางระบายน้ำออกจากแปลง ${crops[0]} และยกเครื่องสูบน้ำกับปัจจัยการผลิตขึ้นที่สูง`;
  }
  if (level === 'warning') {
    return `เฝ้าระวังน้ำเอ่อเข้าแปลง ${crops.join(' และ ')} ตามรอยน้ำที่ปรากฏในภาพจำลอง เตรียมเครื่องสูบน้ำประจำจุดต่ำและเสริมคันดินรอบแปลงก่อนฝนระลอกถัดไป`;
  }
  return `ไม่พบสัญญาณน้ำท่วมขังมีนัยสำคัญในภาพจำลอง บำรุงรักษาแปลงตามปกติและติดตามภาพรอบถัดไป`;
}

function droughtAdvisory(cls: DroughtClass, spi: number, crops: string[]): string {
  switch (cls) {
    case 'extreme':
      return `ภาวะแล้งจัด (จำลอง, SPI-3 เดือน ${spi}) งดปลูกพืชใช้น้ำมาก เปลี่ยนมาปลูกพืชตระกูลถั่วอายุสั้น ให้น้ำระบบหยดเฉพาะจุดในแปลง ${crops[0]} และลำเลียงน้ำเสริมให้ปศุสัตว์`;
    case 'severe':
      return `แล้งรุนแรง (SPI ${spi}) คลุมโคนต้นด้วยฟาง/เศษพืช ลดรอบการให้น้ำแบบขาดช่วงควบคุมในแปลง ${crops.join(' และ ')} สำรองน้ำในสระไร่นาและงดขยายพื้นที่ปลูกใหม่`;
    case 'moderate':
      return `แล้งปานกลาง (SPI ${spi}) วางแผนให้น้ำแบบเปียกสลับแห้งในนาข้าว ตรวจความชื้นดินก่อนใส่ปุ๋ยในแปลง ${crops[0]} และซ่อมบ่อบาดาลเกษตรให้พร้อมใช้งาน`;
    case 'mild':
      return `เริ่มขาดน้ำเล็กน้อย (SPI ${spi}) กักเก็บน้ำฝนปลายฤดูในแหล่งน้ำไร่นาเพื่อใช้กับ ${crops.join(' และ ')} และหว่านเมล็ดพืชคลุมดินลดการระเหยน้ำ`;
    default:
      return 'ความชื้นพืชพรรณอยู่ในเกณฑ์ปกติตามภาพจำลอง บริหารจัดการน้ำตามแผนเพาะปลูกปัจจุบัน';
  }
}

type BuiltProvince = ProvinceSatelliteRisk & {
  scenes: SatelliteScene[];
  basinSlug: string;
};

/**
 * สร้าง universe จำลอง: ทุกตัวเลข derived จาก floodFreq/droughtProne ของ profile
 * บวก jitter จาก seeded hash เพื่อให้ cross-field สอดคล้องเชิงกายภาพ
 * (น้ำท่วมสูง → เมฆสูง, NDVI ต่ำ; แล้งสูง → VCI/TCI ต่ำ, SPI ติดลบ)
 */
function buildProvinceUniverse(): BuiltProvince[] {
  return PROVINCE_PROFILES.map((profile) => {
    const s = `sat-sim:${profile.code}`;
    const u = (key: string) => seededUnit(`${s}:${key}`);

    const floodIdx = clamp(Math.round(profile.floodFreq + (u('ffi') * 8 - 4)), 0, 100);
    // พื้นที่น้ำท่วมเพิ่มแบบไม่เชิงเส้นกับความถี่ (สอดคล้องกับ floodFrequencyIndex)
    const inundatedAreaRai = Math.round(floodIdx * floodIdx * 3.2 * (0.8 + 0.4 * u('rai')));
    const inundatedAreaSqKm = raiToSqKm(inundatedAreaRai);
    const maxInundationDepthCm =
      u('depth') < 0.25 ? null : Math.round(15 + floodIdx * 1.4 + u('depth2') * 30); // null = ไม่มีค่าประมาณ คงเป็น null

    // ความรุนแรงแล้ง = ลักษณะแล้งหักลบด้วยสภาพเปียกปัจจุบัน
    const droughtSeverity = clamp(profile.droughtProne - floodIdx * 0.3, 0, 100);
    const vci = clamp(Math.round(95 - droughtSeverity * 0.85 + (u('vci') * 8 - 4)), 2, 100);
    const tci = clamp(Math.round(97 - droughtSeverity * 0.8 + (u('tci') * 8 - 4)), 2, 100);
    const spi3m = clamp(Math.round((1.2 - droughtSeverity * 0.045 + (u('spi') * 0.6 - 0.3)) * 10) / 10, -3, 3);
    const droughtClass = droughtClassOf(vci);

    let ndvi = clamp(
      Math.round((1.05 - (floodIdx / 100) * 0.6 - (profile.droughtProne / 100) * 0.9 + (u('ndvi') * 0.14 - 0.07)) * 1000) / 1000,
      -0.1,
      0.9
    );
    // coherence caps: น้ำท่วมวิกฤติ/แล้งรุนแรง ต้องไม่แสดงความเขียวระดับ dense
    const floodLevelForNdvi = floodRiskLevelOf(floodIdx);
    if (floodLevelForNdvi === 'critical') ndvi = Math.min(ndvi, 0.42);
    else if (floodLevelForNdvi === 'warning') ndvi = Math.min(ndvi, 0.55);
    if (droughtClass === 'severe' || droughtClass === 'extreme') ndvi = Math.min(ndvi, 0.24);
    const evi = Math.round(ndvi * 0.82 * 1000) / 1000;
    const ndmi = clamp(Math.round((ndvi * 1.1 - 0.15 + (u('ndmi') * 0.1 - 0.05)) * 100) / 100, -1, 1);
    // baseline NDVI จำลองช่วงเดียวกันของปี 2021-2025 = 0.48
    const anomalyVsBaselinePercent = Math.round(((ndvi - 0.48) / 0.48) * 1000) / 10;

    const scenes = buildScenes(profile, floodIdx);
    const avgCloud =
      scenes.reduce((sum, sc) => sum + sc.cloudCoverPercent, 0) / Math.max(1, scenes.length);
    const pixelReliability: PixelReliability =
      u('nodata') < 0.08 ? 'no_data' : avgCloud >= 70 ? 'cloud' : avgCloud >= 45 ? 'marginal' : 'good';

    const floodLevel = floodRiskLevelOf(floodIdx);
    const droughtLevel = droughtRiskLevelOf(droughtClass);
    const latestScene = [...scenes].sort((a, b) => (a.acquiredAt < b.acquiredAt ? 1 : -1))[0];

    return {
      provinceCode: profile.code,
      provinceName: profile.name,
      region: profile.region,
      basinName: profile.basinName,
      basinSlug: profile.basinSlug,
      latestScene,
      scenes,
      overallRisk: worstRisk(floodLevel, droughtLevel),
      flood: {
        inundatedAreaRai,
        inundatedAreaSqKm,
        recurrenceClass: recurrenceClassOf(profile.repeatFloodEventYears),
        repeatFloodEventYears: [...profile.repeatFloodEventYears],
        floodFrequencyIndex: floodIdx,
        maxInundationDepthCm,
        riskLevel: floodLevel,
        affectedCrops: [...profile.crops],
        advisory: floodAdvisory(floodLevel, inundatedAreaRai, profile.crops),
      },
      drought: {
        vci,
        tci,
        spi3m,
        droughtClass,
        riskLevel: droughtLevel,
        advisory: droughtAdvisory(droughtClass, spi3m, profile.crops),
      },
      ndvi: {
        ndvi,
        evi,
        ndmi,
        vigourClass: classifyNdvi(ndvi),
        anomalyVsBaselinePercent,
        baselinePeriod: '2021-2025 (baseline จำลอง)',
        pixelReliability,
        samplePixelCount: 3500 + Math.floor(u('pixels') * 22000),
      },
    };
  });
}

const PROVINCE_UNIVERSE: BuiltProvince[] = buildProvinceUniverse();

const ALL_SCENES: SatelliteScene[] = PROVINCE_UNIVERSE.flatMap((p) => p.scenes);

/* ------------------------------------------------------------------ */
/* Plain filter getters                                                */
/* ------------------------------------------------------------------ */

export function getSatelliteSources(): SatelliteSourceCatalogItem[] {
  return SATELLITE_SOURCES;
}

export function getProvinceSatelliteRisks(options?: {
  provinceCode?: string;
  region?: string;
  layer?: SatelliteLayer | 'all';
  query?: string;
}): ProvinceSatelliteRisk[] {
  let list: BuiltProvince[] = [...PROVINCE_UNIVERSE];

  if (options?.provinceCode) {
    list = list.filter((p) => p.provinceCode === options.provinceCode);
  }

  if (options?.region && options.region !== 'all') {
    list = list.filter((p) => p.region === options.region);
  }

  if (options?.layer && options.layer !== 'all') {
    if (options.layer === 'flood') {
      list = list.filter((p) => p.flood.riskLevel !== 'normal');
    } else if (options.layer === 'drought') {
      list = list.filter((p) => p.drought.riskLevel !== 'normal');
    } else {
      // ndvi: เฉพาะจังหวัดที่พืชมีความเครียดปรากฏชัดในภาพจำลอง
      list = list.filter(
        (p) => p.ndvi.vigourClass === 'bare_stress' || p.ndvi.vigourClass === 'sparse' || p.ndvi.anomalyVsBaselinePercent < -10
      );
    }
  }

  if (options?.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.provinceName.toLowerCase().includes(q) ||
        p.provinceCode.includes(q) ||
        p.basinName.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.flood.affectedCrops.some((c) => c.toLowerCase().includes(q))
    );
  }

  return list.map(({ scenes: _scenes, basinSlug: _basinSlug, ...rest }) => rest);
}

export function getSatelliteScenes(options?: {
  provinceCode?: string;
  platform?: SatellitePlatform | 'all';
}): SatelliteScene[] {
  let list = [...ALL_SCENES];

  if (options?.provinceCode) {
    const province = PROVINCE_UNIVERSE.find((p) => p.provinceCode === options.provinceCode);
    list = province ? [...province.scenes] : [];
  }

  if (options?.platform && options.platform !== 'all') {
    list = list.filter((sc) => sc.platform === options.platform);
  }

  return list;
}

export function getBasinFloodStats(options?: { region?: string }): BasinFloodStat[] {
  const provinces =
    options?.region && options.region !== 'all'
      ? PROVINCE_UNIVERSE.filter((p) => p.region === options.region)
      : PROVINCE_UNIVERSE;

  const byBasin = new Map<string, BuiltProvince[]>();
  for (const p of provinces) {
    const group = byBasin.get(p.basinSlug);
    if (group) group.push(p);
    else byBasin.set(p.basinSlug, [p]);
  }

  const stats: BasinFloodStat[] = [];
  for (const [slug, group] of byBasin) {
    const scenes = group.flatMap((p) => p.scenes);
    const platformBreakdown: Record<SatellitePlatform, number> = { gistda: 0, sentinel: 0, modis: 0 };
    for (const sc of scenes) platformBreakdown[sc.platform] += 1;

    // aggregate = ผลรวมของส่วนย่อยเสมอ; ตร.กม. รวมจากค่ารายจังหวัดที่ปัดแล้ว
    const inundatedAreaRai = group.reduce((sum, p) => sum + p.flood.inundatedAreaRai, 0);
    const inundatedAreaSqKm =
      Math.round(group.reduce((sum, p) => sum + p.flood.inundatedAreaSqKm, 0) * 100) / 100;

    // จังหวัดอ้างอิงของลุ่มน้ำ = จังหวัดที่น้ำท่วมหนักสุดในกลุ่ม
    const anchor = [...group].sort((a, b) => b.flood.floodFrequencyIndex - a.flood.floodFrequencyIndex)[0];
    const peakAcquiredAt =
      scenes.length > 0
        ? scenes.map((sc) => sc.acquiredAt).sort().reverse()[0]
        : anchor.latestScene.acquiredAt;

    stats.push({
      basinCode: `sim-basin-${slug}`,
      basinName: anchor.basinName,
      region: anchor.region,
      inundatedAreaRai,
      inundatedAreaSqKm,
      sceneCount: scenes.length,
      platformBreakdown,
      provincesCovered: group.length,
      peakAcquiredAt,
    });
  }

  return stats.sort((a, b) => b.inundatedAreaRai - a.inundatedAreaRai);
}

export function getSatelliteSummary(): SatelliteSummary {
  const totalRai = PROVINCE_UNIVERSE.reduce((sum, p) => sum + p.flood.inundatedAreaRai, 0);
  const totalSqKm =
    Math.round(PROVINCE_UNIVERSE.reduce((sum, p) => sum + p.flood.inundatedAreaSqKm, 0) * 100) / 100;
  const repeatFloodProvinceCount = PROVINCE_UNIVERSE.filter(
    (p) => p.flood.recurrenceClass !== 'none'
  ).length;
  const severeDroughtProvinceCount = PROVINCE_UNIVERSE.filter(
    (p) => p.drought.droughtClass === 'extreme' || p.drought.droughtClass === 'severe'
  ).length;
  const ndviValues = PROVINCE_UNIVERSE.map((p) => p.ndvi.ndvi);
  const avgNdvi =
    Math.round((ndviValues.reduce((sum, v) => sum + v, 0) / ndviValues.length) * 1000) / 1000;
  const latestAcquiredAt = ALL_SCENES.map((sc) => sc.acquiredAt).sort().reverse()[0];
  const criticalFloodCount = PROVINCE_UNIVERSE.filter((p) => p.flood.riskLevel === 'critical').length;

  return {
    totalScenes: ALL_SCENES.length,
    platformsCovered: new Set(ALL_SCENES.map((sc) => sc.platform)).size,
    provincesCovered: PROVINCE_UNIVERSE.length,
    totalInundatedAreaRai: totalRai,
    totalInundatedAreaSqKm: totalSqKm,
    repeatFloodProvinceCount,
    severeDroughtProvinceCount,
    avgNdvi,
    minNdvi: Math.min(...ndviValues),
    maxNdvi: Math.max(...ndviValues),
    latestAcquiredAt,
    headline: `แบบจำลองสาธิต: พบสัญญาณน้ำท่วมระดับวิกฤติใน ${criticalFloodCount} จังหวัด พื้นที่น้ำขังรวมประมาณ ${totalRai.toLocaleString('th-TH')} ไร่ (≈ ${totalSqKm.toLocaleString('th-TH')} ตร.กม.) จากภาพดาวเทียมจำลอง ${ALL_SCENES.length} ซีน`,
    subheadline:
      'ค่าทั้งหมดเป็น deterministic simulation (sample: true, metadata_only) ไม่ได้อ่านภาพจริงจาก GISTDA/Sentinel/MODIS และครอบคลุมจังหวัดเกษตรสำคัญเพียงบางส่วนของประเทศ ไม่ใช่สถิติราชการ',
    sample: true,
    reportDate: '2026-10-25',
  };
}
